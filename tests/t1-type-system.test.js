import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { Type } from '../src/analyzer/types.js';

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function analyze(source, options = {}) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, '<test>', options);
  return analyzer.analyze();
}

function getWarnings(source, options = {}) {
  return analyze(source, options).warnings;
}

function getErrors(source, options = {}) {
  try {
    analyze(source, options);
    return [];
  } catch (err) {
    return err.errors || [];
  }
}

function hasWarning(source, pattern, options = {}) {
  const warnings = getWarnings(source, options);
  return warnings.some(w => w.message.includes(pattern));
}

function hasError(source, pattern, options = {}) {
  const errors = getErrors(source, options);
  return errors.some(e => e.message.includes(pattern));
}

// ─── T1-1: Real generics with type parameter tracking ────────

describe('T1-1: Generic Function Declarations', () => {
  test('parses fn with type parameters', () => {
    const ast = parse('fn identity<T>(x: T) -> T { return x }');
    const fn = ast.body[0];
    expect(fn.type).toBe('FunctionDeclaration');
    expect(fn.typeParams).toEqual(['T']);
    expect(fn.name).toBe('identity');
  });

  test('parses fn with multiple type parameters', () => {
    const ast = parse('fn pair<A, B>(a: A, b: B) -> (A, B) { return (a, b) }');
    const fn = ast.body[0];
    expect(fn.typeParams).toEqual(['A', 'B']);
  });

  test('generic fn with no type params still works', () => {
    const ast = parse('fn add(a: Int, b: Int) -> Int { return a + b }');
    const fn = ast.body[0];
    expect(fn.typeParams).toEqual([]);
  });

  test('generic function type param inference at call site', () => {
    // When calling identity<T>(x: T) -> T with an Int, the return type should be Int
    const warnings = getWarnings(`
      fn identity<T>(x: T) -> T { return x }
      fn need_int(n: Int) -> Int { return n }
      need_int(identity(42))
    `);
    // Should not error — identity(42) infers T=Int, returns Int
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('generic function return type inferred from args', () => {
    const errors = getErrors(`
      fn identity<T>(x: T) -> T { return x }
      fn need_string(s: String) -> String { return s }
      need_string(identity("hello"))
    `);
    // identity("hello") -> T=String, returns String — compatible with String param
    expect(errors.filter(e => e.message.includes('Type mismatch'))).toEqual([]);
  });

  test('type param not inferred — skip check gracefully', () => {
    // If we can't infer the type param, don't error
    const warnings = getWarnings(`
      fn wrap<T>(x: T) -> T { return x }
      y = wrap(some_value)
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });
});

// ─── T1-2: Type narrowing after nil checks ───────────────────

describe('T1-2: Type Narrowing', () => {
  test('x != nil narrows in consequent', () => {
    // Basic nil check narrowing already works
    const warnings = getWarnings(`
      fn process(x) {
        if x != nil {
          y = x
        }
      }
    `);
    // Should not generate spurious warnings
    expect(warnings.filter(w => w.message.includes('not defined'))).toEqual([]);
  });

  test('nil != x narrowing (reversed)', () => {
    const warnings = getWarnings(`
      fn process(x) {
        if nil != x {
          y = x
        }
      }
    `);
    expect(warnings.filter(w => w.message.includes('not defined'))).toEqual([]);
  });

  test('x == nil narrows consequent to Nil, else to non-nil', () => {
    const warnings = getWarnings(`
      fn process(x) {
        if x == nil {
          y = "was nil"
        } else {
          z = x
        }
      }
    `);
    expect(warnings.filter(w => w.message.includes('not defined'))).toEqual([]);
  });

  test('guard x != nil narrows for rest of scope', () => {
    const warnings = getWarnings(`
      fn process(x) {
        guard x != nil else { return nil }
        y = x
      }
    `);
    expect(warnings.filter(w => w.message.includes('not defined'))).toEqual([]);
  });

  test('type_of narrowing works', () => {
    const warnings = getWarnings(`
      fn process(x) {
        if type_of(x) == "String" {
          y = x
        }
      }
    `);
    expect(warnings.filter(w => w.message.includes('not defined'))).toEqual([]);
  });

  test('isOk() narrows Result', () => {
    const warnings = getWarnings(`
      fn process(result) {
        if result.isOk() {
          y = result
        }
      }
    `);
    expect(warnings.filter(w => w.message.includes('not defined'))).toEqual([]);
  });
});

// ─── T1-3: Union types ──────────────────────────────────────

describe('T1-3: Union Types', () => {
  test('union type annotation is parsed correctly', () => {
    const ast = parse('fn process(x: String | Int) { return x }');
    const param = ast.body[0].params[0];
    expect(param.typeAnnotation.type).toBe('UnionTypeAnnotation');
    expect(param.typeAnnotation.members.length).toBe(2);
  });

  test('String is assignable to String | Int', () => {
    const warnings = getWarnings(`
      fn process(x: String | Int) -> String { return "ok" }
      process("hello")
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('Int is assignable to String | Int', () => {
    const warnings = getWarnings(`
      fn process(x: String | Int) -> String { return "ok" }
      process(42)
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('Bool is NOT assignable to String | Int', () => {
    expect(hasError(`
      fn process(x: String | Int) -> String { return "ok" }
      process(true)
    `, "expects String | Int, but got Bool")).toBe(true);
  });

  test('Nil is assignable to String | Nil union', () => {
    const warnings = getWarnings(`
      fn process(x: String | Nil) -> String { return "ok" }
      process(nil)
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('_typesCompatible handles union types', () => {
    const analyzer = new Analyzer({ type: 'Program', body: [] }, '<test>');
    expect(analyzer._typesCompatible('String | Int', 'String')).toBe(true);
    expect(analyzer._typesCompatible('String | Int', 'Int')).toBe(true);
    expect(analyzer._typesCompatible('String | Int', 'Bool')).toBe(false);
    expect(analyzer._typesCompatible('String | Nil', 'Nil')).toBe(true);
  });
});

// ─── T1-4: Float -> Int silent assignment fix ────────────────

describe('T1-4: Float -> Int Assignment', () => {
  test('Float -> Int assignment produces warning', () => {
    expect(hasWarning(`
      var x = 42
      x = 3.14
    `, "Type mismatch: 'x' is Int, but assigned Float")).toBe(true);
  });

  test('Int -> Float assignment is fine (widening)', () => {
    const warnings = getWarnings(`
      var x = 3.14
      x = 42
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('passing Float to Int param is an error', () => {
    expect(hasError(`
      fn process(x: Int) -> Int { return x }
      process(3.14)
    `, "expects Int, but got Float")).toBe(true);
  });

  test('passing Int to Float param is fine (widening)', () => {
    const warnings = getWarnings(`
      fn process(x: Float) -> Float { return x }
      process(42)
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('returning Float from Int function is an error', () => {
    expect(hasError(`
      fn get_int() -> Int { return 3.14 }
    `, 'function expects return type Int, but got Float')).toBe(true);
  });

  test('returning Int from Float function is fine', () => {
    const warnings = getWarnings(`
      fn get_float() -> Float { return 42 }
    `);
    expect(warnings.filter(w => w.message.includes('return type'))).toEqual([]);
  });

  test('Float->Int hint suggests floor/round', () => {
    const errors = getErrors(`
      fn process(x: Int) -> Int { return x }
      process(3.14)
    `);
    const err = errors.find(e => e.message.includes('Type mismatch'));
    expect(err.hint).toBe('try floor(value) or round(value) to convert');
  });
});

// ─── T1-5: Generic type aliases ──────────────────────────────

describe('T1-5: Generic Type Aliases', () => {
  test('simple type alias is parsed', () => {
    const ast = parse('type UserList = [String]');
    expect(ast.body[0].type).toBe('TypeAlias');
    expect(ast.body[0].name).toBe('UserList');
  });

  test('generic type alias is parsed', () => {
    const ast = parse('type Pair<A, B> = (A, B)');
    expect(ast.body[0].type).toBe('TypeAlias');
    expect(ast.body[0].name).toBe('Pair');
    expect(ast.body[0].typeParams).toEqual(['A', 'B']);
  });

  test('type alias resolution in _typesCompatible', () => {
    // Create a program with a type alias and then check compatibility
    const source = `
      type StringList = [String]
    `;
    const ast = parse(source);
    const analyzer = new Analyzer(ast, '<test>');
    analyzer.analyze();
    // After analysis, StringList should be resolvable
    expect(analyzer._resolveTypeAlias('StringList')).toBe('[String]');
  });

  test('type alias defined and used in scope', () => {
    const warnings = getWarnings(`
      type UserId = Int
    `);
    // Should not error during analysis
    expect(warnings.filter(w => w.message.includes('error'))).toEqual([]);
  });
});

// ─── T1-6: UnknownType assignability ─────────────────────────

describe('T1-6: UnknownType Strict Mode', () => {
  test('in normal mode, unknown types are compatible with everything', () => {
    const warnings = getWarnings(`
      fn add(a: Int, b: Int) -> Int { return a + b }
      y = some_value
      add(y, 5)
    `);
    // y is unknown — in normal mode, compatible with Int
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('Type.strictMode flag works', () => {
    const prevStrict = Type.strictMode;
    try {
      Type.strictMode = false;
      expect(Type.UNKNOWN.isAssignableTo(Type.INT)).toBe(true);

      Type.strictMode = true;
      expect(Type.UNKNOWN.isAssignableTo(Type.INT)).toBe(false);
      expect(Type.UNKNOWN.isAssignableTo(Type.ANY)).toBe(true);
      expect(Type.UNKNOWN.isAssignableTo(Type.UNKNOWN)).toBe(true);
    } finally {
      Type.strictMode = prevStrict;
    }
  });
});

// ─── T1-7: Collection operation type inference ──────────────

describe('T1-7: Collection Type Inference', () => {
  test('_inferType for array literals', () => {
    const ast = parse('x = [1, 2, 3]');
    const analyzer = new Analyzer(ast, '<test>');
    analyzer.analyze();
    const arrayExpr = ast.body[0].values[0];
    expect(analyzer._inferType(arrayExpr)).toBe('[Int]');
  });

  test('_inferType for string array', () => {
    const ast = parse('x = ["a", "b", "c"]');
    const analyzer = new Analyzer(ast, '<test>');
    analyzer.analyze();
    const arrayExpr = ast.body[0].values[0];
    expect(analyzer._inferType(arrayExpr)).toBe('[String]');
  });

  test('filter preserves array type through pipe', () => {
    const ast = parse('y = [1, 2, 3] |> filter(fn(x) x > 0)');
    const analyzer = new Analyzer(ast, '<test>');
    analyzer.analyze();
    const pipeExpr = ast.body[0].values[0];
    expect(analyzer._inferType(pipeExpr)).toBe('[Int]');
  });

  test('sorted preserves array type through pipe', () => {
    const ast = parse('y = [3, 1, 2] |> sorted()');
    const analyzer = new Analyzer(ast, '<test>');
    analyzer.analyze();
    const pipeExpr = ast.body[0].values[0];
    expect(analyzer._inferType(pipeExpr)).toBe('[Int]');
  });

  test('map with numeric transform infers result type', () => {
    const ast = parse('y = [1, 2, 3] |> map(fn(x) x * 2)');
    const analyzer = new Analyzer(ast, '<test>');
    analyzer.analyze();
    const pipeExpr = ast.body[0].values[0];
    const inferred = analyzer._inferType(pipeExpr);
    expect(inferred).toBe('[Int]');
  });

  test('chained pipes infer through', () => {
    const ast = parse('y = [3, 1, 2] |> filter(fn(x) x > 1) |> sorted()');
    const analyzer = new Analyzer(ast, '<test>');
    analyzer.analyze();
    const pipeExpr = ast.body[0].values[0];
    expect(analyzer._inferType(pipeExpr)).toBe('[Int]');
  });

  test('join pipe returns String', () => {
    const ast = parse('y = ["a", "b"] |> join(", ")');
    const analyzer = new Analyzer(ast, '<test>');
    analyzer.analyze();
    const pipeExpr = ast.body[0].values[0];
    expect(analyzer._inferType(pipeExpr)).toBe('String');
  });

  test('len/count pipe returns Int', () => {
    const ast = parse('y = [1, 2, 3] |> len()');
    const analyzer = new Analyzer(ast, '<test>');
    analyzer.analyze();
    const pipeExpr = ast.body[0].values[0];
    expect(analyzer._inferType(pipeExpr)).toBe('Int');
  });

  test('any/all pipe returns Bool', () => {
    const ast = parse('y = [1, 2, 3] |> any(fn(x) x > 2)');
    const analyzer = new Analyzer(ast, '<test>');
    analyzer.analyze();
    const pipeExpr = ast.body[0].values[0];
    expect(analyzer._inferType(pipeExpr)).toBe('Bool');
  });

  test('first/last pipe returns element type', () => {
    const ast = parse('y = [1, 2, 3] |> first()');
    const analyzer = new Analyzer(ast, '<test>');
    analyzer.analyze();
    const pipeExpr = ast.body[0].values[0];
    expect(analyzer._inferType(pipeExpr)).toBe('Int');
  });

  test('member expression .length infers Int', () => {
    const ast = parse('x = [1, 2, 3]\ny = x.length');
    const analyzer = new Analyzer(ast, '<test>');
    analyzer.analyze();
    const memberExpr = ast.body[1].values[0];
    expect(analyzer._inferType(memberExpr)).toBe('Int');
  });
});
