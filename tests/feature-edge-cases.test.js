import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { TokenType } from '../src/lexer/tokens.js';

function lex(source) {
  const lexer = new Lexer(source, '<test>');
  return lexer.tokenize();
}

function types(source) {
  return lex(source)
    .filter(t => t.type !== TokenType.NEWLINE && t.type !== TokenType.EOF)
    .map(t => t.type);
}

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function compile(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const codegen = new CodeGenerator(ast, '<test>');
  return codegen.generate();
}

function compileShared(source) {
  return compile(source).shared.trim();
}

// Helper to run generated JS and get a result
function evalShared(source) {
  const code = compileShared(source);
  // Strip the stdlib preamble comment
  const clean = code.replace(/^\/\/ String methods.*\n?/, '');
  return eval(clean);
}

// ========================================================================
// SLICE EXPRESSION EDGE CASES
// ========================================================================

describe('Slices — Step parameter', () => {
  test('slice with positive step', () => {
    const code = compileShared('x = list[0:10:2]');
    expect(code).toContain('st > 0');
  });

  test('slice with negative step (reverse)', () => {
    const code = compileShared('x = list[::-1]');
    expect(code).toContain('st > 0');
  });

  test('slice with step produces IIFE', () => {
    const code = compileShared('x = list[::3]');
    expect(code).toContain('=>');
  });

  test('full slice (copy)', () => {
    const code = compileShared('x = list[:]');
    expect(code).toContain('.slice()');
  });

  test('slice step=0 guard (prevents infinite loop)', () => {
    const code = compileShared('x = list[::0]');
    expect(code).toContain('st === 0');
    expect(code).toContain('return []');
  });

  test('slice with step normalizes negative indices', () => {
    const code = compileShared('x = list[-3::1]');
    expect(code).toContain('len + s');
  });
});

// ========================================================================
// PATTERN MATCHING EDGE CASES
// ========================================================================

describe('Pattern Matching — Nested variants', () => {
  test('match with binding in nested position', () => {
    const code = compileShared(`
      type Expr { Num(val: Int), Add(left: Expr, right: Expr) }
      fn eval_expr(e) {
        match e {
          Num(v) => v
          Add(l, r) => eval_expr(l) + eval_expr(r)
          _ => 0
        }
      }
    `);
    expect(code).toContain('__tag === "Num"');
    expect(code).toContain('__tag === "Add"');
    expect(code).toContain('eval_expr(');
  });

  test('match returning complex expressions', () => {
    const code = compileShared(`
      fn classify(x) {
        match x {
          0 => { "zero" }
          n if n > 0 => { "positive" }
          _ => { "negative" }
        }
      }
    `);
    expect(code).toContain('"zero"');
    expect(code).toContain('"positive"');
    expect(code).toContain('"negative"');
  });
});

describe('Pattern Matching — String concat patterns', () => {
  test('string prefix match', () => {
    // "prefix" ++ rest matches strings starting with "prefix"
    const code = compileShared(`
      fn check(s) {
        match s {
          "http://" ++ rest => rest
          _ => s
        }
      }
    `);
    expect(code).toContain('startsWith');
  });
});

// ========================================================================
// PIPE OPERATOR EDGE CASES
// ========================================================================

describe('Pipe — Method pipe syntax', () => {
  test('pipe to method', () => {
    const code = compileShared('x = items |> .sort()');
    expect(code).toContain('.sort()');
  });

  test('pipe to method with args', () => {
    const code = compileShared('x = str |> .split(",")');
    expect(code).toContain('.split(');
  });
});

describe('Pipe — Complex chains', () => {
  test('pipe through multiple transforms', () => {
    const code = compileShared(`
      result = data
        |> filter(fn(x) x > 0)
        |> map(fn(x) x * 2)
        |> reduce(fn(a, b) a + b, 0)
    `);
    expect(code).toContain('reduce(');
    expect(code).toContain('map(');
    expect(code).toContain('filter(');
  });
});

// ========================================================================
// FOR LOOP EDGE CASES
// ========================================================================

describe('For — Destructuring in loop', () => {
  test('array destructuring in for', () => {
    const code = compileShared('for [a, b] in pairs { print(a, b) }');
    expect(code).toContain('[a, b]');
  });

  test('object destructuring in for', () => {
    const code = compileShared('for {name, age} in users { print(name) }');
    expect(code).toContain('{name, age}');
  });
});

describe('For — Range with step', () => {
  test('range with 3 args (start, end, step)', () => {
    const code = compileShared('for i in range(0, 10, 2) { print(i) }');
    expect(code).toContain('__step_');
  });

  test('range with negative step', () => {
    const code = compileShared('for i in range(10, 0, -1) { print(i) }');
    expect(code).toContain('__step_');
  });
});

describe('For — Labeled loops', () => {
  test('labeled while loop', () => {
    const code = compileShared(`
      outer: while true {
        break outer
      }
    `);
    expect(code).toContain('outer:');
    expect(code).toContain('break outer;');
  });

  test('labeled loop statement', () => {
    const code = compileShared(`
      main: loop {
        break main
      }
    `);
    expect(code).toContain('main:');
    expect(code).toContain('break main;');
  });
});

// ========================================================================
// DEFER EDGE CASES
// ========================================================================

describe('Defer — Ordering', () => {
  test('multiple defers execute in LIFO order', () => {
    const code = compileShared(`
      fn cleanup() {
        defer { print("first") }
        defer { print("second") }
        do_work()
      }
    `);
    expect(code).toContain('finally');
    // Second defer should appear first in finally block (LIFO)
    const finallyIdx = code.indexOf('finally');
    const secondIdx = code.indexOf('"second"', finallyIdx);
    const firstIdx = code.indexOf('"first"', finallyIdx);
    expect(secondIdx).toBeLessThan(firstIdx);
  });
});

// ========================================================================
// WITH STATEMENT EDGE CASES
// ========================================================================

describe('With — Resource cleanup', () => {
  test('with generates close check', () => {
    const code = compileShared(`
      with create_resource() as res {
        res.read()
      }
    `);
    expect(code).toContain('const res = create_resource()');
    expect(code).toContain('try {');
    expect(code).toContain('finally {');
    expect(code).toContain('.close');
  });

  test('with generates dispose fallback', () => {
    const code = compileShared(`
      with get_handle() as h {
        h.process()
      }
    `);
    expect(code).toContain('.dispose');
    expect(code).toContain('Symbol.dispose');
  });
});

// ========================================================================
// TYPE SYSTEM EDGE CASES
// ========================================================================

describe('Types — Complex ADTs', () => {
  test('ADT with no-arg variants and arg variants mixed', () => {
    const code = compileShared(`
      type Token {
        Number(val: Float)
        Plus
        Minus
        Star
        Slash
        EOF
      }
    `);
    expect(code).toContain('function Number(val)');
    expect(code).toContain('const Plus = Object.freeze(');
    expect(code).toContain('const Minus = Object.freeze(');
    expect(code).toContain('const EOF = Object.freeze(');
  });
});

describe('Types — Trait and Impl', () => {
  test('trait with default methods', () => {
    const code = compileShared(`
      trait Greet {
        fn greet(name) { "Hello, " }
      }
    `);
    expect(code).toContain('__trait_Greet_greet');
  });

  test('impl block generates prototype methods', () => {
    const code = compileShared(`
      type Counter { count: Int }
      impl Counter {
        fn increment(self) { self.count + 1 }
      }
    `);
    expect(code).toContain('Counter.prototype.increment');
  });
});

// ========================================================================
// OBJECT DESTRUCTURING WITH SPREAD (BUG FIX VERIFICATION)
// ========================================================================

describe('Destructuring — Object spread (bug fix)', () => {
  test('object destructuring with rest', () => {
    const code = compileShared('{ name, ...rest } = obj');
    expect(code).toContain('const { name, ...rest } = obj;');
  });

  test('object destructuring without rest still works', () => {
    const code = compileShared('{ a, b } = obj');
    expect(code).toContain('const { a, b } = obj;');
  });

  test('object destructuring with alias', () => {
    const code = compileShared('{ name: n, age: a } = user');
    expect(code).toContain('name: n');
    expect(code).toContain('age: a');
  });
});

// ========================================================================
// STRING INTERPOLATION EDGE CASES
// ========================================================================

describe('String Interpolation — Edge cases', () => {
  test('interpolation with method call', () => {
    const code = compileShared('x = "name: {user.name}"');
    expect(code).toContain('`name: ${user.name}`');
  });

  test('interpolation with complex expression', () => {
    const code = compileShared('x = "sum: {a + b * c}"');
    expect(code).toContain('${');
  });

  test('multiple interpolations', () => {
    const code = compileShared('x = "{first} {last}"');
    expect(code).toContain('${first}');
    expect(code).toContain('${last}');
  });

  test('escaped brace produces no interpolation', () => {
    const code = compileShared('x = "literal \\{brace}"');
    expect(code).toContain('"literal {brace}"');
  });
});

// ========================================================================
// CHAINED COMPARISON EDGE CASES
// ========================================================================

describe('Chained Comparison — Edge cases', () => {
  test('simple chained comparison (no temp vars needed)', () => {
    const code = compileShared('x = 1 < y < 10');
    // Simple variables don't need temp vars
    expect(code).toContain('(1 < y)');
    expect(code).toContain('(y < 10)');
  });

  test('mixed comparison operators', () => {
    const code = compileShared('x = a <= b < c');
    expect(code).toContain('<=');
    expect(code).toContain('<');
    expect(code).toContain('&&');
  });

  test('comparison with equality', () => {
    const code = compileShared('x = a == b == c');
    // Tova == maps to JS == (loose equality)
    expect(code).toContain('== b');
    expect(code).toContain('== c');
    expect(code).toContain('&&');
  });
});

// ========================================================================
// LAMBDA EDGE CASES
// ========================================================================

describe('Lambda — Edge cases', () => {
  test('lambda with destructuring parameter', () => {
    const code = compileShared('x = fn({name, age}) name');
    expect(code).toContain('{ name, age }');
  });

  test('lambda used in higher-order context', () => {
    const code = compileShared(`
      fn apply(f, x) { f(x) }
      result = apply(fn(x) x * 2, 21)
    `);
    expect(code).toContain('function apply(f, x)');
    expect(code).toContain('(x) => (x * 2)');
  });

  test('async lambda', () => {
    const code = compileShared('handler = async fn(req) { await process(req) }');
    expect(code).toContain('async');
    expect(code).toContain('await');
  });
});

// ========================================================================
// NULL COALESCING EDGE CASES
// ========================================================================

describe('Null Coalescing — NaN safety', () => {
  test('simple null coalescing with identifiers', () => {
    const code = compileShared('x = a ?? b');
    expect(code).toContain('!= null');
    expect(code).toContain('=== a'); // NaN check: a === a
  });

  test('null coalescing with complex expression', () => {
    const code = compileShared('x = get_value() ?? fallback()');
    expect(code).toContain('__tova_v');
  });
});

// ========================================================================
// COMPREHENSION EDGE CASES
// ========================================================================

describe('Comprehensions — Edge cases', () => {
  test('list comprehension with complex expression', () => {
    const code = compileShared('x = [item.name for item in users]');
    expect(code).toContain('.map(');
  });

  test('list comprehension with complex condition (identity optimization)', () => {
    const code = compileShared('x = [x for x in items if x > 0 and x < 100]');
    // Identity comprehension optimized to .filter()
    expect(code).toContain('.filter(');
  });

  test('dict comprehension with filter', () => {
    const code = compileShared('x = {k: v * 2 for k, v in items if v > 0}');
    expect(code).toContain('Object.fromEntries');
    expect(code).toContain('.filter(');
  });
});

// ========================================================================
// IMPORT/EXPORT EDGE CASES
// ========================================================================

describe('Imports — Various forms', () => {
  test('wildcard import', () => {
    const code = compileShared('import * as utils from "utils"');
    expect(code).toContain('import');
    expect(code).toContain('utils');
  });

  test('multiple named imports', () => {
    const code = compileShared('import { a, b, c } from "module"');
    expect(code).toContain('a');
    expect(code).toContain('b');
    expect(code).toContain('c');
  });
});

describe('Exports — Various forms', () => {
  test('pub assignment', () => {
    const code = compileShared('pub MAX = 100');
    expect(code).toContain('export');
    expect(code).toContain('MAX');
  });

  test('pub type declaration', () => {
    const code = compileShared('pub type Point { x: Float, y: Float }');
    expect(code).toContain('export');
    expect(code).toContain('function Point');
  });
});

// ========================================================================
// TRY/CATCH EDGE CASES
// ========================================================================

describe('Try/Catch — Edge cases', () => {
  test('try with only finally (no catch)', () => {
    const code = compileShared(`
      try {
        risky()
      } finally {
        cleanup()
      }
    `);
    expect(code).toContain('try');
    expect(code).toContain('finally');
    expect(code).toContain('cleanup()');
  });

  test('nested try/catch', () => {
    const code = compileShared(`
      try {
        try {
          inner()
        } catch e {
          handle_inner(e)
        }
      } catch e {
        handle_outer(e)
      }
    `);
    expect(code).toContain('handle_inner');
    expect(code).toContain('handle_outer');
  });
});

// ========================================================================
// PROPAGATION OPERATOR
// ========================================================================

describe('Propagation — ? operator', () => {
  test('propagation operator in function', () => {
    const code = compileShared(`
      fn safe_divide(a, b) {
        result = validate(b)?
        a / result
      }
    `);
    expect(code).toContain('__propagate');
  });
});

// ========================================================================
// YIELD / GENERATORS
// ========================================================================

describe('Generators — Yield', () => {
  test('yield expression', () => {
    const code = compileShared(`
      fn gen() {
        yield 1
        yield 2
        yield 3
      }
    `);
    expect(code).toContain('yield');
  });
});

// ========================================================================
// COMPLEX INTERACTION TESTS
// ========================================================================

describe('Complex — Feature interactions', () => {
  test('pipe with match', () => {
    const code = compileShared(`
      result = input |> classify |> match _ {
        "positive" => 1
        "negative" => -1
        _ => 0
      }
    `);
    // Should compile without error
    expect(code).toContain('classify');
  });

  test('for with pipe in body', () => {
    const code = compileShared(`
      for item in items {
        item |> transform |> print
      }
    `);
    expect(code).toContain('for (const item of items)');
    expect(code).toContain('print(transform(item))');
  });

  test('function returning match', () => {
    const code = compileShared(`
      fn to_string(val) {
        match val {
          0 => "zero"
          1 => "one"
          _ => "many"
        }
      }
    `);
    expect(code).toContain('function to_string');
    expect(code).toContain('"zero"');
  });

  test('nested function with closure', () => {
    const code = compileShared(`
      fn make_adder(n) {
        fn(x) n + x
      }
    `);
    expect(code).toContain('function make_adder(n)');
    expect(code).toContain('(x) => (n + x)');
  });

  test('type with constructor and pattern match', () => {
    const code = compileShared(`
      type Either { Left(val: Any), Right(val: Any) }

      fn map_right(either, f) {
        match either {
          Left(v) => Left(v)
          Right(v) => Right(f(v))
        }
      }
    `);
    expect(code).toContain('function Left(val)');
    expect(code).toContain('function Right(val)');
    expect(code).toContain('__tag === "Left"');
    expect(code).toContain('__tag === "Right"');
  });

  test('comprehension with function call', () => {
    const code = compileShared('names = [user.name for user in get_users()]');
    expect(code).toContain('get_users()');
    expect(code).toContain('.map(');
  });

  test('destructuring with default values', () => {
    const code = compileShared('{ x = 0, y = 0 } = point');
    expect(code).toContain('x = 0');
    expect(code).toContain('y = 0');
  });

  test('nested match on tuple-like structure', () => {
    const code = compileShared(`
      type Pair { Pair(first: Any, second: Any) }
      fn swap(p) {
        match p {
          Pair(a, b) => Pair(b, a)
        }
      }
    `);
    expect(code).toContain('function swap(p)');
    expect(code).toContain('Pair(');
  });
});

// ========================================================================
// SERVER BLOCK TESTS
// ========================================================================

describe('Server — Route declarations', () => {
  test('GET route', () => {
    const result = compile(`
      server {
        fn get_users() { [] }
        route GET "/api/users" => get_users
      }
    `);
    expect(result.server).toContain('/api/users');
  });

  test('POST route', () => {
    const result = compile(`
      server {
        fn create_user(req) { req }
        route POST "/api/users" => create_user
      }
    `);
    expect(result.server).toContain('/api/users');
    expect(result.server).toContain('POST');
  });
});

// ========================================================================
// BROWSER BLOCK TESTS
// ========================================================================

describe('Browser — Reactive state', () => {
  test('state declaration', () => {
    const result = compile(`
      browser {
        state count = 0
        component App {
          <button>{count}</button>
        }
      }
    `);
    expect(result.browser).toContain('count');
  });

  test('computed declaration', () => {
    const result = compile(`
      browser {
        state items = []
        computed total = items.length
        component App {
          <div>{total}</div>
        }
      }
    `);
    expect(result.browser).toContain('total');
  });
});

// ========================================================================
// SHARED BLOCK TESTS
// ========================================================================

describe('Shared — Cross-block types', () => {
  test('shared type available in codegen', () => {
    const result = compile(`
      shared {
        type User { id: Int, name: String }
      }
      server {
        fn get_user() { User(1, "test") }
      }
    `);
    expect(result.shared).toContain('function User(id, name)');
    expect(result.server).toContain('get_user');
  });
});

// ========================================================================
// EDGE BLOCK TESTS
// ========================================================================

describe('Edge — Edge functions', () => {
  test('edge block compiles', () => {
    const result = compile(`
      edge {
        fn handle(req) { "response" }
      }
    `);
    expect(result.edge).toBeTruthy();
  });
});

// ========================================================================
// CLI BLOCK TESTS
// ========================================================================

describe('CLI — Command declarations', () => {
  test('cli block compiles', () => {
    const result = compile(`
      cli {
        fn main() { print("hello") }
      }
    `);
    expect(result.cli).toBeTruthy();
  });
});

// ========================================================================
// REGEX LITERAL TESTS
// ========================================================================

describe('Lexer — Regex literals', () => {
  test('simple regex', () => {
    const tokens = lex('/abc/');
    expect(tokens[0].type).toBe(TokenType.REGEX);
  });

  test('regex with flags', () => {
    const tokens = lex('/abc/gi');
    expect(tokens[0].type).toBe(TokenType.REGEX);
  });

  test('division not confused with regex', () => {
    // After an identifier, / is division
    const toks = types('x / y');
    expect(toks).toContain(TokenType.SLASH);
  });
});

// ========================================================================
// TRIPLE-QUOTED STRING TESTS
// ========================================================================

describe('Lexer — Triple-quoted strings', () => {
  test('multiline string', () => {
    const code = '"""hello\nworld"""';
    const tokens = lex(code);
    expect(tokens[0].type).toBe(TokenType.STRING);
  });
});

// ========================================================================
// DECORATOR TESTS
// ========================================================================

describe('Decorators', () => {
  test('@async decorator on function', () => {
    const code = compileShared('async fn fetch() { await get() }');
    expect(code).toContain('async function fetch()');
  });
});

// ========================================================================
// BITWISE COMPOUND ASSIGNMENT TESTS
// ========================================================================

describe('Bitwise — Compound assignment codegen', () => {
  test('left shift assignment', () => {
    const code = compileShared('x <<= 2');
    expect(code).toContain('x <<= 2;');
  });
});

// ========================================================================
// SCOPE AND VARIABLE SHADOWING
// ========================================================================

describe('Scope — Variable shadowing', () => {
  test('inner function can reference outer variable', () => {
    const code = compileShared(`
      fn outer() {
        x = 1
        fn inner() {
          x + 1
        }
        inner()
      }
    `);
    expect(code).toContain('const x = 1');
    expect(code).toContain('(x + 1)');
  });
});
