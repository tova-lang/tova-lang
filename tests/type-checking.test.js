import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function analyze(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze();
}

function getWarnings(source) {
  return analyze(source).warnings;
}

function hasWarning(source, pattern) {
  const warnings = getWarnings(source);
  return warnings.some(w => w.message.includes(pattern));
}

// Helper: get errors from annotated boundary mismatches (analyzer throws)
function getErrors(source) {
  try {
    analyze(source);
    return [];
  } catch (err) {
    return err.errors || [];
  }
}

function hasError(source, pattern) {
  const errors = getErrors(source);
  return errors.some(e => e.message.includes(pattern));
}

// ─── Function argument type mismatches (now errors) ─────────

describe('Type Checking — Function Argument Types', () => {
  test('errors when passing String to Int parameter', () => {
    expect(hasError(`
      fn add(a: Int, b: Int) -> Int { a + b }
      add("hello", 5)
    `, "'a' expects Int, but got String")).toBe(true);
  });

  test('errors when passing Bool to String parameter', () => {
    expect(hasError(`
      fn greet(name: String) -> String { name }
      greet(true)
    `, "expects String, but got Bool")).toBe(true);
  });

  test('no error for correct types', () => {
    const warnings = getWarnings(`
      fn add(a: Int, b: Int) -> Int { a + b }
      add(1, 2)
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('no error for untyped params', () => {
    const warnings = getWarnings(`
      fn add(a, b) { a + b }
      add("hello", 5)
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('Int/Float are compatible for param types', () => {
    const warnings = getWarnings(`
      fn scale(x: Float) -> Float { x }
      scale(42)
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('errors on multiple bad arguments', () => {
    const errors = getErrors(`
      fn pair(a: Int, b: String) -> String { b }
      pair("wrong", 42)
    `);
    const typeMismatches = errors.filter(e => e.message.includes('Type mismatch'));
    expect(typeMismatches.length).toBe(2);
  });
});

// ─── Return type mismatches (now errors) ─────────────────────

describe('Type Checking — Return Types', () => {
  test('errors when returning String from Int function', () => {
    expect(hasError(`
      fn foo() -> Int { return "hello" }
    `, 'function expects return type Int, but got String')).toBe(true);
  });

  test('errors when returning Bool from String function', () => {
    expect(hasError(`
      fn bar() -> String { return true }
    `, 'function expects return type String, but got Bool')).toBe(true);
  });

  test('no error for correct return type', () => {
    const warnings = getWarnings(`
      fn foo() -> Int { return 42 }
    `);
    expect(warnings.filter(w => w.message.includes('return type'))).toEqual([]);
  });

  test('no error for untyped return', () => {
    const warnings = getWarnings(`
      fn foo() { return "hello" }
    `);
    expect(warnings.filter(w => w.message.includes('return type'))).toEqual([]);
  });

  test('Int/Float are compatible for return types', () => {
    const warnings = getWarnings(`
      fn foo() -> Float { return 42 }
    `);
    expect(warnings.filter(w => w.message.includes('return type'))).toEqual([]);
  });
});

// ─── Variable reassignment type mismatches (still warnings) ──

describe('Type Checking — Variable Reassignment', () => {
  test('warns when reassigning Int var with String', () => {
    expect(hasWarning(`
      var x = 42
      x = "hello"
    `, "Type mismatch: 'x' is Int, but assigned String")).toBe(true);
  });

  test('warns when reassigning String var with Int', () => {
    expect(hasWarning(`
      var name = "Alice"
      name = 99
    `, "Type mismatch: 'name' is String, but assigned Int")).toBe(true);
  });

  test('no warning when reassigning with same type', () => {
    const warnings = getWarnings(`
      var x = 42
      x = 99
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('Float->Int reassignment warns about data loss', () => {
    expect(hasWarning(`
      var x = 42
      x = 3.14
    `, "Type mismatch: 'x' is Int, but assigned Float")).toBe(true);
  });

  test('Int->Float reassignment is compatible (widening)', () => {
    const warnings = getWarnings(`
      var x = 3.14
      x = 42
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });
});

// ─── Binary operator type errors (still warnings) ────────────

describe('Type Checking — Binary Operators', () => {
  test('warns on String minus Int', () => {
    expect(hasWarning(`
      x = "hello" - 5
    `, "'-' expects numeric type, but got String")).toBe(true);
  });

  test('no warning on String literal * Int (string repeat)', () => {
    // String literal * Int is intentionally allowed (generates .repeat())
    expect(hasWarning(`
      x = "hello" * 3
    `, "'*' expects numeric type, but got String")).toBe(false);
  });

  test('warns on String variable * Int', () => {
    expect(hasWarning(`
      x = "hello"
      y = x * 3
    `, "'*' expects numeric type, but got String")).toBe(true);
  });

  test('no warning for Int + Int', () => {
    const warnings = getWarnings('x = 1 + 2');
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('no warning for Float arithmetic', () => {
    const warnings = getWarnings('x = 3.14 * 2.0');
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('warns on + with String (use template literals instead)', () => {
    expect(hasWarning(`
      x = "a" + "b"
    `, "'+' expects numeric type, but got String")).toBe(true);
  });

  test('warns on / with Bool', () => {
    expect(hasWarning(`
      x = true / 2
    `, "'/' expects numeric type, but got Bool")).toBe(true);
  });
});

// ─── Compound assignment type errors (still warnings) ────────

describe('Type Checking — Compound Assignment', () => {
  test('warns on -= with String variable', () => {
    expect(hasWarning(`
      var x = "hi"
      x -= 5
    `, "'-=' requires numeric type")).toBe(true);
  });

  test('warns on *= with String variable', () => {
    expect(hasWarning(`
      var s = "hi"
      s *= 3
    `, "'*=' requires numeric type")).toBe(true);
  });

  test('warns on += with numeric var and String value', () => {
    expect(hasWarning(`
      var x = 10
      x += "hello"
    `, "'+=' on numeric variable requires numeric value")).toBe(true);
  });

  test('warns on += with String var and Int value', () => {
    expect(hasWarning(`
      var s = "hello"
      s += 5
    `, "'+=' on String variable requires String value")).toBe(true);
  });

  test('no warning for += with numeric types', () => {
    const warnings = getWarnings(`
      var x = 10
      x += 5
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('no warning for -= with numeric types', () => {
    const warnings = getWarnings(`
      var x = 10
      x -= 3
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });
});

// ─── Variant constructor type inference ──────────────────────

describe('Type Checking — Variant Constructors', () => {
  test('variant constructor infers parent type', () => {
    const warnings = getWarnings(`
      type Shape {
        Circle(radius: Float)
        Rect(w: Float, h: Float)
      }
      fn area(s: Shape) -> Float { 0.0 }
      area(Circle(5.0))
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('errors when passing wrong type to variant field', () => {
    expect(hasError(`
      type Shape {
        Circle(radius: Float)
      }
      Circle("not a number")
    `, "expects Float, but got String")).toBe(true);
  });
});

// ─── Gradual typing (unknown types don't warn/error) ─────────

describe('Type Checking — Gradual Typing', () => {
  test('no error when argument type is unknown', () => {
    const warnings = getWarnings(`
      fn add(a: Int, b: Int) -> Int { a + b }
      y = some_value
      add(y, 5)
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('no warning for fully untyped code', () => {
    const warnings = getWarnings(`
      fn add(a, b) { a + b }
      x = add(1, 2)
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('call return type inferred from annotation is now an error', () => {
    expect(hasError(`
      fn get_count() -> Int { return 42 }
      fn need_string(s: String) -> String { s }
      need_string(get_count())
    `, "expects String, but got Int")).toBe(true);
  });
});

// ─── Type annotation to string conversion ────────────────────

describe('Type Checking — Helpers', () => {
  test('_typeAnnotationToString with simple type', () => {
    const analyzer = new Analyzer({ type: 'Program', body: [] }, '<test>');
    expect(analyzer._typeAnnotationToString({ type: 'TypeAnnotation', name: 'Int', typeParams: [] })).toBe('Int');
  });

  test('_typeAnnotationToString with array type', () => {
    const analyzer = new Analyzer({ type: 'Program', body: [] }, '<test>');
    expect(analyzer._typeAnnotationToString({
      type: 'ArrayTypeAnnotation',
      elementType: { type: 'TypeAnnotation', name: 'String', typeParams: [] }
    })).toBe('[String]');
  });

  test('_typeAnnotationToString with generic type', () => {
    const analyzer = new Analyzer({ type: 'Program', body: [] }, '<test>');
    expect(analyzer._typeAnnotationToString({
      type: 'TypeAnnotation',
      name: 'Result',
      typeParams: [
        { type: 'TypeAnnotation', name: 'Int', typeParams: [] },
        { type: 'TypeAnnotation', name: 'String', typeParams: [] }
      ]
    })).toBe('Result<Int, String>');
  });

  test('_typesCompatible basic cases', () => {
    const analyzer = new Analyzer({ type: 'Program', body: [] }, '<test>');
    expect(analyzer._typesCompatible('Int', 'Int')).toBe(true);
    expect(analyzer._typesCompatible('Int', 'String')).toBe(false);
    expect(analyzer._typesCompatible('Int', 'Float')).toBe(false); // Float->Int requires explicit conversion
    expect(analyzer._typesCompatible('Float', 'Int')).toBe(true); // Int->Float widening is safe
    expect(analyzer._typesCompatible(null, 'Int')).toBe(true);
    expect(analyzer._typesCompatible('Any', 'String')).toBe(true);
    expect(analyzer._typesCompatible('Nil', 'Option')).toBe(true);
  });
});
