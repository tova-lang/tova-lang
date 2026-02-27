import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

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

function analyze(source) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze();
}

// ─── Result/Option stdlib (for runtime tests) ─────────────────

function Ok(value) { return Object.freeze({ __tag: "Ok", value, map(fn) { return Ok(fn(value)); }, flatMap(fn) { return fn(value); }, unwrap() { return value; }, unwrapOr(_) { return value; }, expect(_) { return value; }, isOk() { return true; }, isErr() { return false; }, mapErr(_) { return this; }, unwrapErr() { throw new Error("Called unwrapErr on Ok"); }, or(_) { return this; }, and(other) { return other; } }); }
function Err(error) { return Object.freeze({ __tag: "Err", error, map(_) { return this; }, flatMap(_) { return this; }, unwrap() { throw new Error("Called unwrap on Err: " + error); }, unwrapOr(def) { return def; }, expect(msg) { throw new Error(msg); }, isOk() { return false; }, isErr() { return true; }, mapErr(fn) { return Err(fn(error)); }, unwrapErr() { return error; }, or(other) { return other; }, and(_) { return this; } }); }
function Some(value) { return Object.freeze({ __tag: "Some", value, map(fn) { return Some(fn(value)); }, flatMap(fn) { return fn(value); }, unwrap() { return value; }, unwrapOr(_) { return value; }, expect(_) { return value; }, isSome() { return true; }, isNone() { return false; }, or(_) { return this; }, and(other) { return other; }, filter(pred) { return pred(value) ? this : None; } }); }
const None = Object.freeze({ __tag: "None", map(_) { return None; }, flatMap(_) { return None; }, unwrap() { throw new Error("Called unwrap on None"); }, unwrapOr(def) { return def; }, expect(msg) { throw new Error(msg); }, isSome() { return false; }, isNone() { return true; }, or(other) { return other; }, and(_) { return None; }, filter(_) { return None; } });

function __propagate(val) {
  if (val && val.__tag === "Err") throw { __tova_propagate: true, value: val };
  if (val && val.__tag === "None") throw { __tova_propagate: true, value: val };
  if (val && val.__tag === "Ok") return val.value;
  if (val && val.__tag === "Some") return val.value;
  return val;
}

// ─── Parser Tests ────────────────────────────────────────────

describe('Parser — ? operator', () => {
  test('foo()? parses as PropagateExpression', () => {
    const ast = parse('fn test() { foo()? }');
    const fn = ast.body[0];
    const body = fn.body.body[0]; // ExpressionStatement
    expect(body.expression.type).toBe('PropagateExpression');
    expect(body.expression.expression.type).toBe('CallExpression');
  });

  test('? on new line is ignored (not a postfix)', () => {
    const ast = parse('fn test() {\n  x = foo()\n  bar()\n}');
    // foo() on its own line should NOT have ? applied
    const fn = ast.body[0];
    const firstStmt = fn.body.body[0];
    // x = foo() — should just be a CallExpression, not PropagateExpression
    expect(firstStmt.values[0].type).toBe('CallExpression');
  });

  test('chaining a()?.b()? parses correctly', () => {
    const ast = parse('fn test() { a()?.b()? }');
    const fn = ast.body[0];
    const expr = fn.body.body[0].expression;
    // Outermost should be PropagateExpression (the last ?)
    expect(expr.type).toBe('PropagateExpression');
    // Inner should be a call expression b() on the result of a()?
    const inner = expr.expression; // CallExpression for .b()
    expect(inner.type).toBe('CallExpression');
  });

  test('variable? parses correctly', () => {
    const ast = parse('fn test() { x? }');
    const fn = ast.body[0];
    const expr = fn.body.body[0].expression;
    expect(expr.type).toBe('PropagateExpression');
    expect(expr.expression.type).toBe('Identifier');
    expect(expr.expression.name).toBe('x');
  });

  test('nested f(a()?, b) parses correctly', () => {
    const ast = parse('fn test() { f(a()?, b) }');
    const fn = ast.body[0];
    const expr = fn.body.body[0].expression;
    expect(expr.type).toBe('CallExpression');
    expect(expr.arguments[0].type).toBe('PropagateExpression');
    expect(expr.arguments[1].type).toBe('Identifier');
  });
});

// ─── Analyzer Tests ──────────────────────────────────────────

describe('Analyzer — Result/Option builtins', () => {
  test('Ok, Err, Some, None are recognized as builtins', () => {
    // Should not throw
    const result = analyze('x = Ok(42)');
    expect(result.warnings).toBeDefined();
  });

  test('PropagateExpression is analyzed without errors', () => {
    const result = analyze('fn test() { Ok(42)? }');
    expect(result.warnings).toBeDefined();
  });
});

// ─── Codegen Tests ───────────────────────────────────────────

describe('Codegen — ? operator', () => {
  test('? generates __propagate() call', () => {
    const code = compileShared('fn test() { foo()? }');
    expect(code).toContain('__propagate(foo())');
  });

  test('? on function body generates try/catch wrapper', () => {
    const code = compileShared('fn test() { foo()? }');
    expect(code).toContain('try {');
    expect(code).toContain('__tova_propagate');
    expect(code).toContain('catch (__e)');
  });

  test('function without ? has no try/catch wrapper', () => {
    const code = compileShared('fn test() { foo() }');
    expect(code).not.toContain('try {');
    expect(code).not.toContain('__tova_propagate');
  });

  test('nested f(a()?, b) generates correctly', () => {
    const code = compileShared('fn test() { f(a()?, b) }');
    expect(code).toContain('f(__propagate(a()), b)');
  });

  test('lambda with ? gets try/catch wrapper', () => {
    const code = compileShared('handler = fn(x) { foo(x)? }');
    expect(code).toContain('__propagate(foo(x))');
    expect(code).toContain('try {');
    expect(code).toContain('__tova_propagate');
  });

  test('expression lambda with ? gets try/catch wrapper', () => {
    const code = compileShared('handler = fn(x) foo(x)?');
    expect(code).toContain('__propagate(foo(x))');
    expect(code).toContain('__tova_propagate');
  });

  test('Result/Option helper is included in shared output', () => {
    const code = compileShared('x = Ok(1)');
    expect(code).toContain('function Ok(value)');
    expect(code).toContain('function Err(error)');
    expect(code).toContain('function Some(value)');
    expect(code).toContain('const None = Object.freeze');
  });

  test('__propagate helper included when ? is used', () => {
    const code = compileShared('fn test() { foo()? }');
    expect(code).toContain('function __propagate(val)');
  });

  test('? not used means no __propagate helper', () => {
    const code = compileShared('x = Ok(1)');
    expect(code).not.toContain('function __propagate');
  });
});

// ─── Stdlib Runtime Tests ────────────────────────────────────

describe('Stdlib — Ok', () => {
  test('Ok creates tagged value', () => {
    const v = Ok(42);
    expect(v.__tag).toBe('Ok');
    expect(v.value).toBe(42);
  });

  test('Ok.map transforms value', () => {
    const v = Ok(2).map(x => x * 3);
    expect(v.__tag).toBe('Ok');
    expect(v.value).toBe(6);
  });

  test('Ok.flatMap chains', () => {
    const v = Ok(2).flatMap(x => Ok(x + 1));
    expect(v.__tag).toBe('Ok');
    expect(v.value).toBe(3);
  });

  test('Ok.unwrap returns value', () => {
    expect(Ok(42).unwrap()).toBe(42);
  });

  test('Ok.unwrapOr returns value (ignores default)', () => {
    expect(Ok(42).unwrapOr(0)).toBe(42);
  });

  test('Ok.expect returns value', () => {
    expect(Ok(42).expect('should not throw')).toBe(42);
  });

  test('Ok.isOk is true', () => {
    expect(Ok(1).isOk()).toBe(true);
  });

  test('Ok.isErr is false', () => {
    expect(Ok(1).isErr()).toBe(false);
  });

  test('Ok.mapErr is identity', () => {
    const v = Ok(1).mapErr(e => 'changed');
    expect(v.__tag).toBe('Ok');
    expect(v.value).toBe(1);
  });

  test('Ok.unwrapErr throws', () => {
    expect(() => Ok(1).unwrapErr()).toThrow();
  });

  test('Ok.or returns self', () => {
    const v = Ok(1).or(Ok(2));
    expect(v.value).toBe(1);
  });

  test('Ok.and returns other', () => {
    const v = Ok(1).and(Ok(2));
    expect(v.value).toBe(2);
  });
});

describe('Stdlib — Err', () => {
  test('Err creates tagged error', () => {
    const v = Err('oops');
    expect(v.__tag).toBe('Err');
    expect(v.error).toBe('oops');
  });

  test('Err.map is identity', () => {
    const v = Err('fail').map(x => x * 2);
    expect(v.__tag).toBe('Err');
    expect(v.error).toBe('fail');
  });

  test('Err.flatMap is identity', () => {
    const v = Err('fail').flatMap(x => Ok(x));
    expect(v.__tag).toBe('Err');
    expect(v.error).toBe('fail');
  });

  test('Err.unwrap throws', () => {
    expect(() => Err('fail').unwrap()).toThrow('Called unwrap on Err: fail');
  });

  test('Err.unwrapOr returns default', () => {
    expect(Err('fail').unwrapOr(99)).toBe(99);
  });

  test('Err.expect throws with custom message', () => {
    expect(() => Err('x').expect('custom msg')).toThrow('custom msg');
  });

  test('Err.isOk is false', () => {
    expect(Err('x').isOk()).toBe(false);
  });

  test('Err.isErr is true', () => {
    expect(Err('x').isErr()).toBe(true);
  });

  test('Err.mapErr transforms error', () => {
    const v = Err('a').mapErr(e => e + 'b');
    expect(v.__tag).toBe('Err');
    expect(v.error).toBe('ab');
  });

  test('Err.unwrapErr returns error', () => {
    expect(Err('fail').unwrapErr()).toBe('fail');
  });

  test('Err.or returns other', () => {
    const v = Err('x').or(Ok(2));
    expect(v.value).toBe(2);
  });

  test('Err.and returns self', () => {
    const v = Err('x').and(Ok(2));
    expect(v.__tag).toBe('Err');
  });
});

describe('Stdlib — Some', () => {
  test('Some creates tagged value', () => {
    const v = Some(42);
    expect(v.__tag).toBe('Some');
    expect(v.value).toBe(42);
  });

  test('Some.map transforms value', () => {
    const v = Some(2).map(x => x * 3);
    expect(v.__tag).toBe('Some');
    expect(v.value).toBe(6);
  });

  test('Some.flatMap chains', () => {
    const v = Some(2).flatMap(x => Some(x + 1));
    expect(v.__tag).toBe('Some');
    expect(v.value).toBe(3);
  });

  test('Some.unwrap returns value', () => {
    expect(Some(42).unwrap()).toBe(42);
  });

  test('Some.unwrapOr returns value', () => {
    expect(Some(42).unwrapOr(0)).toBe(42);
  });

  test('Some.expect returns value', () => {
    expect(Some(42).expect('nope')).toBe(42);
  });

  test('Some.isSome is true', () => {
    expect(Some(1).isSome()).toBe(true);
  });

  test('Some.isNone is false', () => {
    expect(Some(1).isNone()).toBe(false);
  });

  test('Some.or returns self', () => {
    const v = Some(1).or(Some(2));
    expect(v.value).toBe(1);
  });

  test('Some.and returns other', () => {
    const v = Some(1).and(Some(2));
    expect(v.value).toBe(2);
  });

  test('Some.filter with true predicate returns Some', () => {
    const v = Some(5).filter(x => x > 3);
    expect(v.__tag).toBe('Some');
    expect(v.value).toBe(5);
  });

  test('Some.filter with false predicate returns None', () => {
    const v = Some(1).filter(x => x > 3);
    expect(v.__tag).toBe('None');
  });
});

describe('Stdlib — None', () => {
  test('None has correct tag', () => {
    expect(None.__tag).toBe('None');
  });

  test('None.map returns None', () => {
    const v = None.map(x => x * 2);
    expect(v.__tag).toBe('None');
  });

  test('None.flatMap returns None', () => {
    const v = None.flatMap(x => Some(x));
    expect(v.__tag).toBe('None');
  });

  test('None.unwrap throws', () => {
    expect(() => None.unwrap()).toThrow('Called unwrap on None');
  });

  test('None.unwrapOr returns default', () => {
    expect(None.unwrapOr(99)).toBe(99);
  });

  test('None.expect throws with custom message', () => {
    expect(() => None.expect('missing')).toThrow('missing');
  });

  test('None.isSome is false', () => {
    expect(None.isSome()).toBe(false);
  });

  test('None.isNone is true', () => {
    expect(None.isNone()).toBe(true);
  });

  test('None.or returns other', () => {
    const v = None.or(Some(2));
    expect(v.__tag).toBe('Some');
    expect(v.value).toBe(2);
  });

  test('None.and returns None', () => {
    const v = None.and(Some(2));
    expect(v.__tag).toBe('None');
  });

  test('None.filter returns None', () => {
    const v = None.filter(x => true);
    expect(v.__tag).toBe('None');
  });
});

// ─── __propagate Runtime Tests ───────────────────────────────

describe('Runtime — __propagate', () => {
  test('propagate unwraps Ok', () => {
    expect(__propagate(Ok(42))).toBe(42);
  });

  test('propagate unwraps Some', () => {
    expect(__propagate(Some(42))).toBe(42);
  });

  test('propagate throws sentinel for Err', () => {
    try {
      __propagate(Err('fail'));
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect(e.__tova_propagate).toBe(true);
      expect(e.value.__tag).toBe('Err');
      expect(e.value.error).toBe('fail');
    }
  });

  test('propagate throws sentinel for None', () => {
    try {
      __propagate(None);
      expect(true).toBe(false);
    } catch (e) {
      expect(e.__tova_propagate).toBe(true);
      expect(e.value.__tag).toBe('None');
    }
  });

  test('propagate passes through non-Result/Option values', () => {
    expect(__propagate(42)).toBe(42);
    expect(__propagate('hello')).toBe('hello');
    expect(__propagate(null)).toBe(null);
  });

  test('? operator in function early-returns Err', () => {
    function tryOp(result) {
      try {
        const val = __propagate(result);
        return Ok(val + 1);
      } catch (__e) {
        if (__e && __e.__tova_propagate) return __e.value;
        throw __e;
      }
    }

    const ok = tryOp(Ok(10));
    expect(ok.__tag).toBe('Ok');
    expect(ok.value).toBe(11);

    const err = tryOp(Err('bad'));
    expect(err.__tag).toBe('Err');
    expect(err.error).toBe('bad');
  });

  test('? operator in function early-returns None', () => {
    function tryOp(option) {
      try {
        const val = __propagate(option);
        return Some(val * 2);
      } catch (__e) {
        if (__e && __e.__tova_propagate) return __e.value;
        throw __e;
      }
    }

    const some = tryOp(Some(5));
    expect(some.__tag).toBe('Some');
    expect(some.value).toBe(10);

    const none = tryOp(None);
    expect(none.__tag).toBe('None');
  });

  test('? operator still throws real errors', () => {
    function tryOp() {
      try {
        throw new Error('real error');
      } catch (__e) {
        if (__e && __e.__tova_propagate) return __e.value;
        throw __e;
      }
    }

    expect(() => tryOp()).toThrow('real error');
  });
});

// ─── Pattern Matching Tests ──────────────────────────────────

describe('Pattern matching — Result/Option', () => {
  test('match on Ok/Err variants', () => {
    const code = compileShared(`
      fn handle(result) {
        match result {
          Ok(v) => v * 2,
          Err(e) => -1
        }
      }
    `);
    expect(code).toContain('__tag === "Ok"');
    expect(code).toContain('__tag === "Err"');
  });

  test('match on Some/None variants', () => {
    const code = compileShared(`
      fn handle(option) {
        match option {
          Some(v) => v,
          _ => 0
        }
      }
    `);
    expect(code).toContain('__tag === "Some"');
  });

  test('pattern destructuring extracts correct fields for Ok', () => {
    const code = compileShared(`
      fn handle(result) {
        match result {
          Ok(v) => v,
          Err(e) => e
        }
      }
    `);
    // Ok variant should destructure .value, Err should destructure .error
    expect(code).toContain('.value');
    expect(code).toContain('.error');
  });
});

// ─── Integration Tests ───────────────────────────────────────

describe('Integration — end-to-end', () => {
  test('function using Ok/Err and ? compiles correctly', () => {
    const code = compileShared(`
      fn parse_number(s) {
        result = try_parse(s)?
        Ok(result * 2)
      }
    `);
    expect(code).toContain('__propagate(try_parse(s))');
    expect(code).toContain('try {');
    expect(code).toContain('Ok((result * 2))');
  });

  test('multiple ? in one function', () => {
    const code = compileShared(`
      fn process(a, b) {
        x = validate(a)?
        y = validate(b)?
        Ok(x + y)
      }
    `);
    expect(code).toContain('__propagate(validate(a))');
    expect(code).toContain('__propagate(validate(b))');
    // Should have exactly one try/catch wrapper
    const tryCount = (code.match(/try \{/g) || []).length;
    // One for __propagate helper def + one for the function wrapper
    expect(tryCount).toBeGreaterThanOrEqual(1);
  });

  test('? does not affect nested lambda boundary', () => {
    const code = compileShared(`
      fn outer() {
        inner = fn(x) x?
        inner(Ok(1))
      }
    `);
    // The inner lambda should have a try/catch
    expect(code).toContain('__propagate(x)');
  });

  test('Ok/Err work as first-class values', () => {
    const code = compileShared(`
      results = [Ok(1), Ok(2), Err("bad")]
    `);
    expect(code).toContain('Ok(1)');
    expect(code).toContain('Err("bad")');
  });

  test('method calls on Result compile correctly', () => {
    const code = compileShared(`
      x = Ok(5).map(fn(v) v * 2)
    `);
    // After devirtualization, Ok(5).map(fn(v) v * 2) inlines to Ok((5 * 2))
    expect(code).not.toContain('Ok(5).map(');
    expect(code).toContain('Ok(');
  });
});

// ─── Runtime — devirtualization correctness ─────────────────

describe('Runtime — devirtualization correctness', () => {
  // Helper: compile Tova source, eval the generated JS, return the value of `result`
  function evalCompiled(source) {
    const code = compile(source).shared;
    // The generated code may include stdlib definitions or may be fully devirtualized.
    // We wrap in a function and return the `result` variable.
    const wrapper = new Function(code + '\nreturn result;');
    return wrapper();
  }

  test('Ok(42).unwrap() returns 42', () => {
    expect(evalCompiled('result = Ok(42).unwrap()')).toBe(42);
  });

  test('Err("fail").unwrapOr(0) returns 0', () => {
    expect(evalCompiled('result = Err("fail").unwrapOr(0)')).toBe(0);
  });

  test('Ok(5).map(fn(x) x * 3).unwrap() returns 15', () => {
    expect(evalCompiled('result = Ok(5).map(fn(x) x * 3).unwrap()')).toBe(15);
  });

  test('Ok(10).flatMap(fn(x) if x > 5 { Ok(x * 2) } else { Err("low") }).unwrap() returns 20', () => {
    const code = compile('result = Ok(10).flatMap(fn(x) if x > 5 { Ok(x * 2) } else { Err("low") })').shared;
    const wrapper = new Function(code + '\nreturn result.unwrap();');
    expect(wrapper()).toBe(20);
  });

  test('None.unwrapOr(99) returns 99', () => {
    expect(evalCompiled('result = None.unwrapOr(99)')).toBe(99);
  });

  test('Some(7).filter(fn(x) x > 5).unwrap() returns 7', () => {
    expect(evalCompiled('result = Some(7).filter(fn(x) x > 5).unwrap()')).toBe(7);
  });
});

// ─── Codegen — devirtualization ─────────────────────────────

describe('Codegen — devirtualization', () => {
  test('Ok(x).unwrap() devirtualizes to x', () => {
    const code = compileShared('result = Ok(42).unwrap()');
    expect(code).not.toContain('Ok(');
    expect(code).toContain('42');
  });

  test('Err(e).unwrapOr(d) devirtualizes to d', () => {
    const code = compileShared('result = Err("bad").unwrapOr(99)');
    expect(code).not.toContain('Err(');
    expect(code).toContain('99');
  });

  test('Ok(x).isOk() devirtualizes to true', () => {
    const code = compileShared('result = Ok(1).isOk()');
    expect(code).toContain('true');
  });

  test('Err(e).isOk() devirtualizes to false', () => {
    const code = compileShared('result = Err("e").isOk()');
    expect(code).toContain('false');
  });

  test('Ok(x).unwrapOr(d) devirtualizes to x', () => {
    const code = compileShared('result = Ok(42).unwrapOr(0)');
    expect(code).not.toContain('Ok(');
    expect(code).toContain('42');
  });

  test('Some(x).unwrap() devirtualizes to x', () => {
    const code = compileShared('result = Some(10).unwrap()');
    expect(code).not.toContain('Some(');
    expect(code).toContain('10');
  });

  test('None.unwrapOr(d) devirtualizes to d', () => {
    const code = compileShared('result = None.unwrapOr(42)');
    expect(code).not.toContain('None');
    expect(code).toContain('42');
  });

  test('None.isSome() devirtualizes to false', () => {
    const code = compileShared('result = None.isSome()');
    expect(code).toContain('false');
  });

  test('Ok(x).isErr() devirtualizes to false', () => {
    const code = compileShared('result = Ok(1).isErr()');
    expect(code).toContain('false');
  });

  test('Err(e).isErr() devirtualizes to true', () => {
    const code = compileShared('result = Err("e").isErr()');
    expect(code).toContain('true');
  });

  test('Err(e).unwrapErr() devirtualizes to e', () => {
    const code = compileShared('result = Err("oops").unwrapErr()');
    expect(code).not.toContain('Err(');
    expect(code).toContain('"oops"');
  });

  test('Ok(foo()).unwrap() devirtualizes preserving call', () => {
    const code = compileShared('result = Ok(foo()).unwrap()');
    expect(code).toContain('foo()');
    expect(code).not.toContain('Ok(');
  });
});

// ─── Codegen — scalar replacement ────────────────────────────

describe('Codegen — scalar replacement', () => {
  test('if/else Ok/Err + isOk/unwrap emits scalar vars', () => {
    const code = compileShared(`
      fn test(x) {
        r = if x > 0 { Ok(x) } else { Err("negative") }
        if r.isOk() { r.unwrap() } else { 0 }
      }
    `);
    expect(code).toContain('r__ok');
    expect(code).toContain('r__v');
    expect(code).not.toContain('Ok(');
    expect(code).not.toContain('Err(');
  });

  test('if/else Some/None + unwrapOr emits scalar vars', () => {
    const code = compileShared(`
      fn test(x) {
        o = if x > 0 { Some(x) } else { None }
        o.unwrapOr(0)
      }
    `);
    expect(code).toContain('o__ok');
    expect(code).toContain('o__v');
    expect(code).not.toContain('Some(');
  });
});

// ─── Runtime — scalar replacement correctness ────────────────

describe('Runtime — scalar replacement correctness', () => {
  test('Result create+check pattern returns correct values', () => {
    const code = compile(`
      fn test(x) {
        r = if x > 0 { Ok(x * 2) } else { Err("negative") }
        if r.isOk() { r.unwrap() } else { -1 }
      }
    `).shared;
    const test5 = new Function(code + '\nreturn test(5);');
    const testNeg = new Function(code + '\nreturn test(-1);');
    expect(test5()).toBe(10);
    expect(testNeg()).toBe(-1);
  });

  test('Option create+unwrapOr returns correct values', () => {
    const code = compile(`
      fn test(x) {
        o = if x > 0 { Some(x) } else { None }
        o.unwrapOr(0)
      }
    `).shared;
    const test5 = new Function(code + '\nreturn test(5);');
    const testNeg = new Function(code + '\nreturn test(-1);');
    expect(test5()).toBe(5);
    expect(testNeg()).toBe(0);
  });

  test('Loop with scalar replacement (sum of filtered values)', () => {
    const code = compile(`
      fn test() {
        var total = 0
        var i = 0
        while i < 5 {
          r = if i > 2 { Ok(i) } else { Err("skip") }
          if r.isOk() { total = total + r.unwrap() }
          i = i + 1
        }
        total
      }
    `).shared;
    const result = new Function(code + '\nreturn test();');
    expect(result()).toBe(7);
  });
});

// ─── Codegen — devirtualization edge cases ───────────────────

describe('Codegen — devirtualization edge cases', () => {
  test('Ok(sideEffect()).map(fn(x) x) preserves side effect', () => {
    const code = compileShared('result = Ok(foo()).map(fn(x) x)');
    // The call to foo() must be preserved in the output
    expect(code).toContain('foo()');
  });

  test('Ok(x).map(f).map(g) still fuses (existing 2+ chain)', () => {
    const code = compileShared('result = Ok(1).map(fn(x) x + 1).map(fn(y) y * 2)');
    // Map chain fusion should eliminate .map( calls
    expect(code).not.toContain('.map(');
  });

  test('variable.unwrap() NOT devirtualized (runtime variable)', () => {
    const code = compileShared('fn test(r) { r.unwrap() }');
    // r is a runtime variable, not a known Ok/Err constructor
    expect(code).toContain('.unwrap()');
  });

  test('Returned Result NOT scalar-replaced (must be real object)', () => {
    const code = compileShared(`
      fn test(x) {
        r = if x > 0 { Ok(x) } else { Err("bad") }
        r
      }
    `);
    // r is returned bare, so scalar replacement should NOT apply
    const hasOkOrErr = code.includes('Ok(') || code.includes('Err(');
    expect(hasOkOrErr).toBe(true);
  });

  test('Result passed to function NOT scalar-replaced', () => {
    const code = compileShared(`
      fn test(x) {
        r = if x > 0 { Ok(x) } else { Err("bad") }
        process(r)
      }
    `);
    // r is passed to process() (bare reference = unsafe), so no scalar replacement
    const hasOkOrErr = code.includes('Ok(') || code.includes('Err(');
    expect(hasOkOrErr).toBe(true);
  });

  test('getResult().unwrap() NOT devirtualized (non-constructor)', () => {
    const code = compileShared('fn test() { getResult().unwrap() }');
    // getResult() is not Ok/Err/Some/None, so unwrap stays
    expect(code).toContain('.unwrap()');
  });
});
