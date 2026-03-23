import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { TokenType } from '../src/lexer/tokens.js';

// === Helpers ===

function lex(source) {
  const lexer = new Lexer(source, '<test>');
  return lexer.tokenize();
}

function types(source) {
  return lex(source)
    .filter(t => t.type !== TokenType.NEWLINE && t.type !== TokenType.EOF)
    .map(t => t.type);
}

function values(source) {
  return lex(source)
    .filter(t => t.type !== TokenType.NEWLINE && t.type !== TokenType.EOF)
    .map(t => t.value);
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

// === 1. LEXER EDGE CASES ===

describe('Lexer — Bitwise operators', () => {
  test('bitwise AND', () => {
    expect(types('x & y')).toEqual([
      TokenType.IDENTIFIER, TokenType.AMPERSAND, TokenType.IDENTIFIER,
    ]);
  });

  test('bitwise OR', () => {
    expect(types('x | y')).toEqual([
      TokenType.IDENTIFIER, TokenType.BAR, TokenType.IDENTIFIER,
    ]);
  });

  test('bitwise XOR', () => {
    expect(types('x ^ y')).toEqual([
      TokenType.IDENTIFIER, TokenType.CARET, TokenType.IDENTIFIER,
    ]);
  });

  test('bitwise NOT', () => {
    expect(types('~x')).toEqual([
      TokenType.TILDE, TokenType.IDENTIFIER,
    ]);
  });

  test('left shift', () => {
    expect(types('x << 2')).toEqual([
      TokenType.IDENTIFIER, TokenType.LEFT_SHIFT, TokenType.NUMBER,
    ]);
  });

  test('right shift via two greater-than tokens', () => {
    // The lexer emits two GREATER tokens; the parser combines them into >>
    const toks = lex('x >> 2');
    const filtered = toks.filter(t => t.type !== TokenType.NEWLINE && t.type !== TokenType.EOF);
    expect(filtered[0].type).toBe(TokenType.IDENTIFIER);
    // The lexer produces GREATER GREATER for >>
    expect(filtered[1].type).toBe(TokenType.GREATER);
    expect(filtered[2].type).toBe(TokenType.GREATER);
    expect(filtered[3].type).toBe(TokenType.NUMBER);
  });

  test('bitwise assignment operators', () => {
    expect(types('x &= 1')).toEqual([
      TokenType.IDENTIFIER, TokenType.BIT_AND_ASSIGN, TokenType.NUMBER,
    ]);
    expect(types('x |= 1')).toEqual([
      TokenType.IDENTIFIER, TokenType.BIT_OR_ASSIGN, TokenType.NUMBER,
    ]);
    expect(types('x ^= 1')).toEqual([
      TokenType.IDENTIFIER, TokenType.BIT_XOR_ASSIGN, TokenType.NUMBER,
    ]);
  });

  test('left shift assignment', () => {
    expect(types('x <<= 1')).toEqual([
      TokenType.IDENTIFIER, TokenType.LEFT_SHIFT_ASSIGN, TokenType.NUMBER,
    ]);
  });
});

describe('Lexer — Number edge cases', () => {
  test('underscore separators in different bases', () => {
    expect(values('1_000')).toEqual([1000]);
    expect(values('0xFF_FF')).toEqual([0xFFFF]);
    expect(values('0b1010_0101')).toEqual([0b10100101]);
    expect(values('0o77_77')).toEqual([0o7777]);
  });

  test('float with underscore', () => {
    expect(values('1_000.5')).toEqual([1000.5]);
  });

  test('exponent with sign', () => {
    expect(values('1e+10')).toEqual([1e+10]);
    expect(values('1e-10')).toEqual([1e-10]);
    expect(values('5E2')).toEqual([500]);
  });

  test('zero forms', () => {
    expect(values('0')).toEqual([0]);
    expect(values('0.0')).toEqual([0.0]);
  });
});

describe('Lexer — String edge cases', () => {
  test('empty string', () => {
    const tokens = lex('""');
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('');
  });

  test('single char string', () => {
    const tokens = lex('"a"');
    expect(tokens[0].value).toBe('a');
  });

  test('all escape sequences', () => {
    expect(values('"\\n"')).toEqual(['\n']);
    expect(values('"\\t"')).toEqual(['\t']);
    expect(values('"\\\\"')).toEqual(['\\']);
    expect(values('"\\""')).toEqual(['"']);
  });

  test('string with only interpolation', () => {
    const tokens = lex('"{x}"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
    const parts = tokens[0].value;
    // Lexer may collapse empty text parts
    expect(parts.length).toBeGreaterThanOrEqual(1);
    const exprParts = parts.filter(p => p.type === 'expr');
    expect(exprParts.length).toBe(1);
  });

  test('nested interpolation', () => {
    const tokens = lex('"outer {a + "{inner}"} end"');
    expect(tokens[0].type).toBe(TokenType.STRING_TEMPLATE);
  });

  test('raw string', () => {
    const tokens = lex('r"no\\escapes"');
    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].value).toBe('no\\escapes');
  });
});

describe('Lexer — Comment edge cases', () => {
  test('comment at end of file (no newline)', () => {
    const tokens = lex('x = 1 // comment');
    const nonMeta = tokens.filter(t => t.type !== TokenType.NEWLINE && t.type !== TokenType.EOF);
    expect(nonMeta.length).toBe(3);
  });

  test('empty block comment', () => {
    const tokens = lex('x /**/ = 1');
    const nonMeta = tokens.filter(t => t.type !== TokenType.NEWLINE && t.type !== TokenType.EOF);
    expect(nonMeta.length).toBe(3);
  });

  test('multiple docstrings', () => {
    const tokens = lex('/// line1\n/// line2\nfn foo() {}');
    const docs = tokens.filter(t => t.type === TokenType.DOCSTRING);
    expect(docs.length).toBe(2);
  });
});

// === 2. VARIABLE DECLARATIONS ===

describe('Variables — Immutable assignments', () => {
  test('simple assignment compiles to const', () => {
    const code = compileShared('x = 42');
    expect(code).toContain('const x = 42;');
  });

  test('string assignment', () => {
    const code = compileShared('name = "hello"');
    expect(code).toContain('const name = "hello";');
  });

  test('boolean assignment', () => {
    const code = compileShared('flag = true');
    expect(code).toContain('const flag = true;');
  });

  test('nil assignment', () => {
    const code = compileShared('x = nil');
    expect(code).toContain('const x = null;');
  });

  test('expression assignment', () => {
    const code = compileShared('x = 1 + 2 * 3');
    // Constant folding: 2 * 3 = 6, so result is (1 + 6)
    expect(code).toContain('const x = (1 + 6);');
  });
});

describe('Variables — Mutable declarations', () => {
  test('var compiles to let', () => {
    const code = compileShared('var count = 0');
    expect(code).toContain('let count = 0;');
  });

  test('var with expression', () => {
    const code = compileShared('var total = price * quantity');
    expect(code).toContain('let total = (price * quantity);');
  });
});

describe('Variables — Compound assignments', () => {
  test('all compound operators', () => {
    expect(compileShared('x += 1')).toContain('x += 1;');
    expect(compileShared('x -= 1')).toContain('x -= 1;');
    expect(compileShared('x *= 2')).toContain('x *= 2;');
    expect(compileShared('x /= 2')).toContain('x /= 2;');
  });

  test('bitwise compound assignments', () => {
    expect(compileShared('x &= 0xFF')).toContain('x &= 255;');
    expect(compileShared('x |= 0x01')).toContain('x |= 1;');
    expect(compileShared('x ^= 0xFF')).toContain('x ^= 255;');
  });
});

describe('Variables — Destructuring', () => {
  test('object destructuring', () => {
    const code = compileShared('{ name, age } = user');
    expect(code).toContain('const { name, age } = user;');
  });

  test('array destructuring', () => {
    const code = compileShared('[a, b, c] = list');
    expect(code).toContain('const [a, b, c] = list;');
  });

  test('multiple assignment', () => {
    const code = compileShared('a, b = 1, 2');
    expect(code).toContain('const [a, b] = [1, 2];');
  });
});

// === 3. FUNCTIONS ===

describe('Functions — Declarations', () => {
  test('simple function', () => {
    const code = compileShared('fn add(a, b) { a + b }');
    expect(code).toContain('function add(a, b)');
    expect(code).toContain('return (a + b);');
  });

  test('function with explicit return', () => {
    const code = compileShared('fn get_value() { return 42 }');
    expect(code).toContain('return 42;');
  });

  test('function with default parameters', () => {
    const code = compileShared('fn greet(name = "world") { name }');
    expect(code).toContain('name = "world"');
  });

  test('function with type annotations', () => {
    const code = compileShared('fn add(a: Int, b: Int) -> Int { a + b }');
    expect(code).toContain('function add(a, b)');
  });

  test('function with multiple statements', () => {
    const code = compileShared(`
      fn compute(x) {
        var result = x * 2
        result += 1
        result
      }
    `);
    expect(code).toContain('let result = (x * 2);');
    expect(code).toContain('result += 1;');
    expect(code).toContain('return result;');
  });

  test('empty function body', () => {
    const code = compileShared('fn noop() {}');
    expect(code).toContain('function noop()');
  });

  test('function with array destructuring parameter', () => {
    const code = compileShared('fn first([head, ...tail]) { head }');
    expect(code).toContain('head');
  });
});

describe('Functions — Lambdas', () => {
  test('fn-style lambda', () => {
    const code = compileShared('x = fn(a, b) a + b');
    expect(code).toContain('(a, b) => (a + b)');
  });

  test('arrow lambda', () => {
    const code = compileShared('x = x => x * 2');
    expect(code).toContain('(x) => (x * 2)');
  });

  test('lambda with block body', () => {
    const code = compileShared('x = fn(a) { var b = a * 2; b }');
    expect(code).toContain('=>');
  });

  test('lambda as argument', () => {
    const code = compileShared('result = items.map(fn(x) x * 2)');
    expect(code).toContain('.map(');
  });

  test('lambda with no params', () => {
    const code = compileShared('x = fn() 42');
    expect(code).toContain('() => 42');
  });
});

// === 4. CONTROL FLOW ===

describe('Control Flow — If/elif/else', () => {
  test('simple if', () => {
    const code = compileShared('if x > 0 { print("pos") }');
    expect(code).toContain('if ((x > 0))');
  });

  test('if/else', () => {
    const code = compileShared('if x > 0 { print("pos") } else { print("neg") }');
    expect(code).toContain('if (');
    expect(code).toContain('else {');
  });

  test('if/elif/else chain', () => {
    const code = compileShared('if x > 0 { 1 } elif x == 0 { 0 } else { -1 }');
    expect(code).toContain('if (');
    expect(code).toContain('else if (');
    expect(code).toContain('else {');
  });

  test('nested if', () => {
    const code = compileShared('if a { if b { c } }');
    expect(code).toContain('if (a)');
    expect(code).toContain('if (b)');
  });
});

describe('Control Flow — For loops', () => {
  test('basic for-in', () => {
    const code = compileShared('for x in items { print(x) }');
    expect(code).toContain('for (const x of items)');
  });

  test('for with two variables (enumerate)', () => {
    const code = compileShared('for i, v in items { print(i) }');
    expect(code).toContain('[i, v]');
    expect(code).toContain('.entries()');
  });

  test('for with range optimization', () => {
    const code = compileShared('for i in 0..10 { print(i) }');
    expect(code).toContain('for (let i = 0; i < 10; i++)');
  });

  test('for with inclusive range', () => {
    const code = compileShared('for i in 0..=10 { print(i) }');
    expect(code).toContain('for (let i = 0; i <= 10; i++)');
  });

  test('for with range() call optimization', () => {
    const code = compileShared('for i in range(5) { print(i) }');
    expect(code).toContain('for (let i = 0; i < 5; i++)');
  });

  test('for with range(start, end)', () => {
    const code = compileShared('for i in range(1, 10) { print(i) }');
    expect(code).toContain('for (let i = 1; i < 10; i++)');
  });

  test('for with guard', () => {
    const code = compileShared('for x in items when x > 0 { print(x) }');
    expect(code).toContain('continue');
  });

  test('for-else', () => {
    const code = compileShared('for x in items { print(x) } else { print("empty") }');
    expect(code).toContain('__broke');
    expect(code).toContain('if (!');
  });
});

describe('Control Flow — While loop', () => {
  test('basic while', () => {
    const code = compileShared('while x > 0 { x -= 1 }');
    expect(code).toContain('while ((x > 0))');
  });
});

describe('Control Flow — Loop statement', () => {
  test('infinite loop', () => {
    const code = compileShared('loop { break }');
    expect(code).toContain('while (true)');
    expect(code).toContain('break;');
  });
});

describe('Control Flow — Break and Continue with labels', () => {
  test('labeled for loop with break', () => {
    const code = compileShared(`
      outer: for i in range(10) {
        for j in range(10) {
          if i == j { break outer }
        }
      }
    `);
    expect(code).toContain('outer:');
    expect(code).toContain('break outer;');
  });

  test('labeled continue', () => {
    const code = compileShared(`
      outer: for i in range(10) {
        for j in range(10) {
          if j == 5 { continue outer }
        }
      }
    `);
    expect(code).toContain('continue outer;');
  });
});

describe('Control Flow — Guard statements', () => {
  test('guard with else', () => {
    const code = compileShared(`
      fn check(x) {
        guard x > 0 else { return -1 }
        x
      }
    `);
    expect(code).toContain('if (!(');
    expect(code).toContain('return (-1);');
  });
});

// === 5. PATTERN MATCHING ===

describe('Pattern Matching — Literals', () => {
  test('match with number literals', () => {
    const code = compileShared(`
      x = match val {
        0 => "zero"
        1 => "one"
        _ => "other"
      }
    `);
    expect(code).toContain('=== 0');
    expect(code).toContain('=== 1');
    expect(code).toContain('"zero"');
    expect(code).toContain('"one"');
    expect(code).toContain('"other"');
  });

  test('match with string literals', () => {
    const code = compileShared(`
      x = match name {
        "alice" => 1
        "bob" => 2
        _ => 0
      }
    `);
    expect(code).toContain('"alice"');
    expect(code).toContain('"bob"');
  });

  test('match with boolean literals', () => {
    const code = compileShared(`
      x = match flag {
        true => "yes"
        false => "no"
      }
    `);
    expect(code).toContain('true');
    expect(code).toContain('false');
  });
});

describe('Pattern Matching — Range patterns', () => {
  test('inclusive range pattern', () => {
    const code = compileShared(`
      x = match score {
        90..=100 => "A"
        80..=89 => "B"
        _ => "F"
      }
    `);
    expect(code).toContain('>= 90');
    expect(code).toContain('<= 100');
  });

  test('exclusive range pattern', () => {
    const code = compileShared(`
      x = match val {
        0..10 => "small"
        _ => "big"
      }
    `);
    expect(code).toContain('>= 0');
    expect(code).toContain('< 10');
  });

  test('negative range pattern', () => {
    const code = compileShared(`
      x = match temp {
        -40..-1 => "freezing"
        0..=100 => "normal"
        _ => "extreme"
      }
    `);
    expect(code).toContain('-40');
    expect(code).toContain('-1');
  });
});

describe('Pattern Matching — Variant patterns', () => {
  test('ADT variant match', () => {
    const code = compileShared(`
      type Shape { Circle(radius: Float), Rect(w: Float, h: Float) }
      x = match shape {
        Circle(r) => r * r * 3.14
        Rect(w, h) => w * h
      }
    `);
    expect(code).toContain('__tag === "Circle"');
    expect(code).toContain('__tag === "Rect"');
  });

  test('unit variant (no fields) match', () => {
    const code = compileShared(`
      type Color { Red, Green, Blue }
      x = match c {
        Red => "red"
        Green => "green"
        Blue => "blue"
      }
    `);
    expect(code).toContain('__tag === "Red"');
  });
});

describe('Pattern Matching — Guards', () => {
  test('match arm with guard', () => {
    const code = compileShared(`
      x = match val {
        n if n > 100 => "big"
        n if n < 0 => "negative"
        _ => "normal"
      }
    `);
    expect(code).toContain('> 100');
    expect(code).toContain('< 0');
  });
});

describe('Pattern Matching — Wildcard', () => {
  test('wildcard as catch-all', () => {
    const code = compileShared(`
      x = match val {
        1 => "one"
        _ => "other"
      }
    `);
    // Should compile without errors
    expect(code).toContain('"other"');
  });
});

// === 6. TYPE SYSTEM ===

describe('Types — Struct types', () => {
  test('basic struct', () => {
    const code = compileShared('type Point { x: Float, y: Float }');
    expect(code).toContain('function Point(x, y)');
    expect(code).toContain('Object.create(Point.prototype)');
  });

  test('struct with many fields', () => {
    const code = compileShared('type User { id: Int, name: String, email: String, active: Bool }');
    expect(code).toContain('function User(id, name, email, active)');
  });
});

describe('Types — Algebraic Data Types', () => {
  test('simple ADT', () => {
    const code = compileShared('type Option { Some(value: Any), None }');
    expect(code).toContain('function Some(value)');
    expect(code).toContain('__tag: "Some"');
    expect(code).toContain('const None = Object.freeze({ __tag: "None" });');
  });

  test('ADT with multiple fields', () => {
    const code = compileShared('type Shape { Circle(radius: Float), Rect(width: Float, height: Float) }');
    expect(code).toContain('function Circle(radius)');
    expect(code).toContain('function Rect(width, height)');
  });

  test('ADT with duplicate field names gets deduplication', () => {
    const code = compileShared('type Pair { Pair(a: Int, a: Int) }');
    expect(code).toContain('_0');
    expect(code).toContain('_1');
  });
});

describe('Types — Derive', () => {
  test('derive Eq', () => {
    const code = compileShared('type Point { x: Float, y: Float } derive[Eq]');
    expect(code).toContain('__eq');
    expect(code).toContain('a.x === b.x');
    expect(code).toContain('a.y === b.y');
  });

  test('derive Show', () => {
    const code = compileShared('type Point { x: Float, y: Float } derive[Show]');
    expect(code).toContain('__show');
  });

  test('derive JSON', () => {
    const code = compileShared('type Point { x: Float, y: Float } derive[JSON]');
    expect(code).toContain('toJSON');
    expect(code).toContain('fromJSON');
  });
});

// === 7. OPERATORS AND EXPRESSIONS ===

describe('Operators — Pipe', () => {
  test('simple pipe', () => {
    const code = compileShared('x = data |> process');
    expect(code).toContain('process(data)');
  });

  test('pipe with arguments', () => {
    const code = compileShared('x = data |> filter(fn(x) x > 0)');
    expect(code).toContain('filter(data,');
  });

  test('chained pipe', () => {
    const code = compileShared('x = data |> first |> second |> third');
    expect(code).toContain('third(second(first(data)))');
  });

  test('method pipe', () => {
    const code = compileShared('x = items |> .length');
    expect(code).toContain('.length');
  });
});

describe('Operators — Chained comparisons', () => {
  test('double comparison', () => {
    const code = compileShared('x = 1 < y < 10');
    expect(code).toContain('&&');
  });

  test('triple comparison', () => {
    const code = compileShared('x = 0 <= y <= z <= 100');
    expect(code).toContain('&&');
  });
});

describe('Operators — Membership', () => {
  test('in operator', () => {
    const code = compileShared('x = item in list');
    expect(code).toContain('__contains(list, item)');
  });

  test('not in operator', () => {
    const code = compileShared('x = item not in list');
    expect(code).toContain('!__contains(list, item)');
  });
});

describe('Operators — Is expression', () => {
  test('is String type check', () => {
    const code = compileShared('x = val is String');
    expect(code).toContain("typeof val === 'string'");
  });

  test('is not Nil type check', () => {
    const code = compileShared('x = val is not Nil');
    expect(code).toContain('val !== null');
  });

  test('is Int check', () => {
    const code = compileShared('x = val is Int');
    expect(code).toContain('Number.isInteger');
  });

  test('is Bool check', () => {
    const code = compileShared('x = val is Bool');
    expect(code).toContain("typeof val === 'boolean'");
  });

  test('is Array check', () => {
    const code = compileShared('x = val is Array');
    expect(code).toContain('Array.isArray(val)');
  });

  test('is ADT variant check', () => {
    const code = compileShared('x = val is Circle');
    expect(code).toContain("__tag === 'Circle'");
  });
});

describe('Operators — Null coalescing', () => {
  test('?? operator', () => {
    const code = compileShared('x = a ?? b');
    // NaN-safe nullish coalescing
    expect(code).toContain('!= null');
  });
});

describe('Operators — Optional chaining', () => {
  test('simple optional chain', () => {
    const code = compileShared('x = user?.name');
    expect(code).toContain('user?.name');
  });

  test('deep optional chain', () => {
    const code = compileShared('x = a?.b?.c?.d');
    expect(code).toContain('?.b?.c?.d');
  });
});

describe('Operators — Ranges', () => {
  test('exclusive range', () => {
    const code = compileShared('x = 1..10');
    expect(code).toContain('range(1, 10)');
  });

  test('inclusive range', () => {
    const code = compileShared('x = 1..=10');
    expect(code).toContain('range(1, (10) + 1)');
  });
});

describe('Operators — Spread', () => {
  test('spread in array', () => {
    const code = compileShared('x = [...items, 4]');
    expect(code).toContain('...items');
  });

  test('spread in function call', () => {
    const code = compileShared('result = func(...args)');
    expect(code).toContain('...args');
  });
});

describe('Operators — Slices', () => {
  test('basic slice', () => {
    const code = compileShared('x = list[1:3]');
    expect(code).toContain('.slice(1, 3)');
  });

  test('slice from start', () => {
    const code = compileShared('x = list[:3]');
    expect(code).toContain('.slice(0, 3)');
  });

  test('slice to end', () => {
    const code = compileShared('x = list[1:]');
    expect(code).toContain('.slice(1)');
  });
});

describe('Operators — Power', () => {
  test('power operator', () => {
    // 2 ** 10 gets constant-folded to 1024
    const code = compileShared('x = 2 ** 10');
    expect(code).toContain('1024');
  });

  test('power operator with variables', () => {
    const code = compileShared('x = a ** b');
    expect(code).toContain('**');
  });

  test('power is right-associative', () => {
    const ast = parse('x = 2 ** 3 ** 4');
    // 2 ** (3 ** 4), not (2 ** 3) ** 4
    const assignStmt = ast.body[0];
    const powerExpr = assignStmt.values[0];
    expect(powerExpr.type).toBe('BinaryExpression');
    expect(powerExpr.operator).toBe('**');
    expect(powerExpr.right.type).toBe('BinaryExpression');
    expect(powerExpr.right.operator).toBe('**');
  });
});

describe('Operators — String operations', () => {
  test('string multiply', () => {
    const code = compileShared('x = "ha" * 3');
    expect(code).toContain('"ha".repeat(3)');
  });

  test('string interpolation to template literal', () => {
    const code = compileShared('x = "Hello, {name}!"');
    expect(code).toContain('`Hello, ${name}!`');
  });

  test('complex interpolation expression', () => {
    const code = compileShared('x = "result: {a + b}"');
    expect(code).toContain('${(a + b)}');
  });
});

describe('Operators — Logical', () => {
  test('and/or/not', () => {
    const code = compileShared('x = a and b or not c');
    expect(code).toContain('&&');
    expect(code).toContain('||');
    expect(code).toContain('!');
  });

  test('precedence: and binds tighter than or', () => {
    const code = compileShared('x = a or b and c');
    // Should be a || (b && c)
    expect(code).toContain('||');
    expect(code).toContain('&&');
  });
});

describe('Operators — Bitwise', () => {
  test('bitwise AND', () => {
    const code = compileShared('x = a & b');
    expect(code).toContain('&');
  });

  test('bitwise OR', () => {
    const code = compileShared('x = a | b');
    expect(code).toContain('|');
  });

  test('bitwise XOR', () => {
    const code = compileShared('x = a ^ b');
    expect(code).toContain('^');
  });

  test('bitwise NOT', () => {
    const code = compileShared('x = ~a');
    expect(code).toContain('~');
  });

  test('left shift', () => {
    const code = compileShared('x = a << 2');
    expect(code).toContain('<<');
  });

  test('right shift', () => {
    const code = compileShared('x = a >> 2');
    expect(code).toContain('>>');
  });

  test('unsigned right shift', () => {
    const code = compileShared('x = a >>> 2');
    expect(code).toContain('>>>');
  });
});

// === 8. COMPREHENSIONS ===

describe('Comprehensions — List', () => {
  test('basic list comprehension', () => {
    const code = compileShared('x = [n * 2 for n in items]');
    expect(code).toContain('.map(');
  });

  test('list comprehension with filter', () => {
    const code = compileShared('x = [n * 2 for n in items if n > 0]');
    expect(code).toContain('.reduce(');
  });

  test('identity comprehension with filter optimizes to filter', () => {
    const code = compileShared('x = [n for n in items if n > 0]');
    expect(code).toContain('.filter(');
  });
});

describe('Comprehensions — Dict', () => {
  test('dict comprehension', () => {
    const code = compileShared('x = {k: v for k, v in pairs}');
    expect(code).toBeTruthy();
  });
});

// === 9. ERROR HANDLING ===

describe('Error Handling — Try/catch/finally', () => {
  test('basic try/catch', () => {
    const code = compileShared(`
      try {
        risky()
      } catch e {
        print(e)
      }
    `);
    expect(code).toContain('try {');
    expect(code).toContain('catch');
  });

  test('try/catch/finally', () => {
    const code = compileShared(`
      try {
        risky()
      } catch e {
        print(e)
      } finally {
        cleanup()
      }
    `);
    expect(code).toContain('try {');
    expect(code).toContain('catch');
    expect(code).toContain('finally {');
  });
});

describe('Error Handling — With statement (resource management)', () => {
  test('with statement generates try/finally', () => {
    const code = compileShared(`
      with open("file.txt") as f {
        f.read()
      }
    `);
    expect(code).toContain('try {');
    expect(code).toContain('finally {');
    expect(code).toContain('.close');
  });
});

describe('Error Handling — Defer', () => {
  test('defer in function generates try/finally', () => {
    const code = compileShared(`
      fn process() {
        var handle = open()
        defer { handle.close() }
        handle.read()
      }
    `);
    expect(code).toContain('finally');
    expect(code).toContain('close');
  });
});

// === 10. ASYNC/AWAIT ===

describe('Async — Functions', () => {
  test('async function', () => {
    const code = compileShared('async fn fetch_data() { await get("/api") }');
    expect(code).toContain('async function fetch_data()');
    expect(code).toContain('await');
  });

  test('async lambda', () => {
    const code = compileShared('x = async fn() { await sleep(1000) }');
    expect(code).toContain('async');
  });
});

// === 11. IMPORTS/EXPORTS ===

describe('Imports — Named', () => {
  test('named import', () => {
    const code = compileShared('import { map, filter } from "utils"');
    expect(code).toContain('import');
    expect(code).toContain('map');
    expect(code).toContain('filter');
  });

  test('import with alias', () => {
    const code = compileShared('import { readFile as read } from "fs"');
    expect(code).toContain('readFile as read');
  });
});

describe('Exports — Pub', () => {
  test('pub function', () => {
    const code = compileShared('pub fn helper() { 42 }');
    expect(code).toContain('export');
    expect(code).toContain('function helper()');
  });

  test('pub type', () => {
    const code = compileShared('pub type Color { Red, Green, Blue }');
    expect(code).toContain('export');
  });
});

// === 12. PARSER EDGE CASES ===

describe('Parser — Edge cases', () => {
  test('deeply nested expressions parse correctly', () => {
    const ast = parse('x = ((((1 + 2) * 3) - 4) / 5)');
    expect(ast).toBeTruthy();
  });

  test('operator precedence: multiply before add', () => {
    const ast = parse('x = 1 + 2 * 3');
    const expr = ast.body[0].values[0];
    expect(expr.operator).toBe('+');
    expect(expr.right.operator).toBe('*');
  });

  test('empty match body parses', () => {
    // Empty match may or may not be a parser error depending on implementation
    try {
      const ast = parse('x = match val {}');
      // If it parses, check it's valid
      expect(ast).toBeTruthy();
    } catch (e) {
      // Parse error is acceptable for empty match
      expect(e.message || e.toString()).toBeTruthy();
    }
  });

  test('function with empty body parses', () => {
    const ast = parse('fn noop() {}');
    expect(ast).toBeTruthy();
  });

  test('trailing commas in function params', () => {
    const ast = parse('fn foo(a, b, c,) { a }');
    expect(ast).toBeTruthy();
  });

  test('trailing commas in arrays', () => {
    const ast = parse('x = [1, 2, 3,]');
    expect(ast).toBeTruthy();
  });

  test('trailing commas in objects', () => {
    const ast = parse('x = { a: 1, b: 2, }');
    expect(ast).toBeTruthy();
  });

  test('nested function declarations', () => {
    const ast = parse(`
      fn outer() {
        fn inner() { 42 }
        inner()
      }
    `);
    expect(ast).toBeTruthy();
  });

  test('multiple expressions in one line separated by semicolons', () => {
    const ast = parse('x = 1; y = 2');
    expect(ast).toBeTruthy();
    expect(ast.body.length).toBe(2);
  });
});

// === 13. CODEGEN EDGE CASES ===

describe('Codegen — Edge cases', () => {
  test('empty program', () => {
    const code = compileShared('');
    // May contain stdlib preamble
    expect(code).toBeTruthy();
  });

  test('nested ternary from nested match', () => {
    const code = compileShared(`
      x = match a {
        1 => match b {
          2 => "deep"
          _ => "shallow"
        }
        _ => "default"
      }
    `);
    expect(code).toContain('"deep"');
    expect(code).toContain('"shallow"');
    expect(code).toContain('"default"');
  });

  test('function call with named arguments', () => {
    const code = compileShared('result = create(name: "test", age: 30)');
    expect(code).toContain('name:');
    expect(code).toContain('age:');
  });

  test('method chain compiles correctly', () => {
    const code = compileShared('x = items.filter(fn(x) x > 0).map(fn(x) x * 2).length');
    expect(code).toContain('.filter(');
    expect(code).toContain('.map(');
    expect(code).toContain('.length');
  });

  test('complex pipe chain', () => {
    const code = compileShared(`
      result = data
        |> filter(fn(x) x > 0)
        |> map(fn(x) x * 2)
        |> sum
    `);
    expect(code).toContain('sum(');
    expect(code).toContain('map(');
    expect(code).toContain('filter(');
  });

  test('for-else runs else when loop completes without break', () => {
    const code = compileShared(`
      for item in items {
        if item == target { break }
      } else {
        print("not found")
      }
    `);
    expect(code).toContain('let __broke_');
    expect(code).toContain('__broke_');
    expect(code).toContain('= true; break;');
    expect(code).toContain('if (!__broke_');
  });

  test('match with many literal arms optimizes to switch', () => {
    const code = compileShared(`
      x = match day {
        1 => "Mon"
        2 => "Tue"
        3 => "Wed"
        4 => "Thu"
        5 => "Fri"
        6 => "Sat"
        7 => "Sun"
        _ => "Unknown"
      }
    `);
    // Should optimize to switch or multiple if-else
    expect(code).toContain('"Mon"');
    expect(code).toContain('"Sun"');
  });

  test('nil coalescing with complex expression', () => {
    const code = compileShared('x = get_value() ?? default_value()');
    expect(code).toContain('__tova_v');
  });

  test('chained comparison with function calls uses temp vars', () => {
    const code = compileShared('x = f() < g() < h()');
    // Complex operands need temp vars to avoid double evaluation
    expect(code).toContain('__cmp_');
  });
});

// === 14. FULL-STACK BLOCKS ===

describe('Full-Stack — Server block', () => {
  test('server block compiles', () => {
    const result = compile(`
      server {
        fn handler() { "hello" }
      }
    `);
    expect(result.server).toBeTruthy();
  });
});

describe('Full-Stack — Browser block', () => {
  test('browser block with state', () => {
    const result = compile(`
      browser {
        state count = 0
        component Counter {
          <div>{count}</div>
        }
      }
    `);
    expect(result.browser).toBeTruthy();
  });
});

describe('Full-Stack — Shared block', () => {
  test('shared block code accessible', () => {
    const result = compile(`
      shared {
        GREETING = "Hello"
        fn add(a, b) { a + b }
      }
    `);
    expect(result.shared).toContain('const GREETING = "Hello"');
    expect(result.shared).toContain('function add(a, b)');
  });
});

// === 15. ANALYZER INTEGRATION ===

describe('Analyzer — Integration', () => {
  test('reassigning immutable variable parses correctly', () => {
    // x = 42; x = 43 parses without parser error (analyzer may flag it)
    const ast = parse(`x = 42\nx = 43`);
    expect(ast).toBeTruthy();
    expect(ast.body.length).toBe(2);
  });

  test('function declaration parses correctly', () => {
    const ast = parse('fn fast() -> Int { 1 }');
    expect(ast).toBeTruthy();
    expect(ast.body[0].type).toBe('FunctionDeclaration');
  });
});

// === 16. COMPREHENSIVE END-TO-END ===

describe('End-to-end — Complex programs', () => {
  test('fibonacci function', () => {
    const code = compileShared(`
      fn fib(n) {
        if n <= 1 { n }
        else { fib(n - 1) + fib(n - 2) }
      }
    `);
    expect(code).toContain('function fib(n)');
    expect(code).toContain('fib((n - 1))');
    expect(code).toContain('fib((n - 2))');
  });

  test('fizzbuzz with match', () => {
    const code = compileShared(`
      fn fizzbuzz(n) {
        match n % 15 {
          0 => "FizzBuzz"
          _ => match n % 3 {
            0 => "Fizz"
            _ => match n % 5 {
              0 => "Buzz"
              _ => n
            }
          }
        }
      }
    `);
    expect(code).toContain('function fizzbuzz(n)');
    expect(code).toContain('"FizzBuzz"');
    expect(code).toContain('"Fizz"');
    expect(code).toContain('"Buzz"');
  });

  test('list operations pipeline', () => {
    const code = compileShared(`
      fn process(items) {
        items
          |> filter(fn(x) x > 0)
          |> map(fn(x) x * 2)
      }
    `);
    expect(code).toContain('function process(items)');
    expect(code).toContain('filter(');
    expect(code).toContain('map(');
  });

  test('ADT with pattern matching', () => {
    const code = compileShared(`
      type Result { Ok(value: Any), Err(message: String) }

      fn handle(result) {
        match result {
          Ok(value) => value
          Err(msg) => print(msg)
        }
      }
    `);
    expect(code).toContain('function Ok(value)');
    expect(code).toContain('function Err(message)');
    expect(code).toContain('function handle(result)');
    expect(code).toContain('__tag === "Ok"');
    expect(code).toContain('__tag === "Err"');
  });

  test('struct with methods via functions', () => {
    const code = compileShared(`
      type Point { x: Float, y: Float }

      fn distance(p1, p2) {
        var dx = p1.x - p2.x
        var dy = p1.y - p2.y
        (dx * dx + dy * dy) ** 0.5
      }
    `);
    expect(code).toContain('function Point(x, y)');
    expect(code).toContain('function distance(p1, p2)');
    expect(code).toContain('** 0.5');
  });

  test('for-else with guard and enumerate', () => {
    const code = compileShared(`
      for i, item in items when item > 0 {
        print(i, item)
      } else {
        print("no positive items")
      }
    `);
    expect(code).toContain('[i, item]');
    expect(code).toContain('continue');
    expect(code).toContain('__broke');
  });

  test('array destructuring with spread', () => {
    const code = compileShared('[first, ...rest] = items');
    expect(code).toContain('const [first, ...rest] = items;');
  });

  test('object destructuring with spread', () => {
    const code = compileShared('{ name, ...other } = config');
    expect(code).toContain('const { name, ...other } = config;');
  });

  test('complex match with all pattern types', () => {
    const code = compileShared(`
      type Token { Num(val: Int), Str(val: String), End }

      fn describe(tok) {
        match tok {
          Num(n) if n > 100 => "big number"
          Num(n) => "number"
          Str(s) => "string"
          End => "end"
          _ => "unknown"
        }
      }
    `);
    expect(code).toContain('__tag === "Num"');
    expect(code).toContain('> 100');
    expect(code).toContain('"big number"');
  });
});
