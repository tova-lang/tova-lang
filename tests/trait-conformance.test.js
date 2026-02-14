import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function analyze(source, options = {}) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>', options);
  return analyzer.analyze();
}

function getWarnings(source, options = {}) {
  return analyze(source, options).warnings;
}

function hasWarning(source, pattern, options = {}) {
  const warnings = getWarnings(source, options);
  return warnings.some(w => w.message.includes(pattern));
}

function getErrors(source, options = {}) {
  try {
    analyze(source, options);
    return [];
  } catch (err) {
    return err.errors || [];
  }
}

// ─── Strict Mode ──────────────────────────────────────────

describe('Strict Mode', () => {
  test('binary operator type mismatch is error in strict mode', () => {
    const errors = getErrors(`
      x = "hello"
      y = x - 5
    `, { strict: true });
    expect(errors.some(e => e.message.includes('Type mismatch'))).toBe(true);
  });

  test('binary operator type mismatch is warning in non-strict mode', () => {
    const warnings = getWarnings(`
      x = "hello"
      y = x - 5
    `);
    expect(warnings.some(w => w.message.includes('Type mismatch'))).toBe(true);
  });

  test('argument count mismatch is error in strict mode', () => {
    const errors = getErrors(`
      fn add(a: Int, b: Int) -> Int { a + b }
      add(1, 2, 3)
    `, { strict: true });
    expect(errors.some(e => e.message.includes('expects 2 arguments'))).toBe(true);
  });

  test('argument count mismatch is warning in non-strict mode', () => {
    const warnings = getWarnings(`
      fn add(a: Int, b: Int) -> Int { a + b }
      add(1, 2, 3)
    `);
    expect(warnings.some(w => w.message.includes('expects 2 arguments'))).toBe(true);
  });

  test('variable reassignment type mismatch is error in strict mode', () => {
    const errors = getErrors(`
      fn test_fn() {
        var x = 10
        x = "hello"
      }
    `, { strict: true });
    expect(errors.some(e => e.message.includes('Type mismatch'))).toBe(true);
  });

  test('compound assignment type mismatch is error in strict mode', () => {
    const errors = getErrors(`
      fn test_fn() {
        var x = "hello"
        x -= 5
      }
    `, { strict: true });
    expect(errors.some(e => e.message.includes('Type mismatch'))).toBe(true);
  });
});

// ─── Type Registry ────────────────────────────────────────

describe('Type Registry', () => {
  test('populates type registry with type declarations', () => {
    const result = analyze(`
      type Shape {
        Circle(radius: Float)
        Rectangle(width: Float, height: Float)
      }
    `);
    expect(result.typeRegistry.types.has('Shape')).toBe(true);
    const shapeType = result.typeRegistry.types.get('Shape');
    expect(shapeType.getVariantNames()).toContain('Circle');
    expect(shapeType.getVariantNames()).toContain('Rectangle');
  });

  test('stores type structure on type symbol', () => {
    const result = analyze(`
      type Color {
        Red
        Green
        Blue
      }
    `);
    const colorSym = result.scope.lookup('Color');
    expect(colorSym).not.toBeNull();
    expect(colorSym._typeStructure).not.toBeNull();
    expect(colorSym._typeStructure.getVariantNames()).toEqual(['Red', 'Green', 'Blue']);
  });
});

// ─── Interface/Trait Method Signatures ────────────────────

describe('Interface/Trait Method Signatures', () => {
  test('stores interface methods on symbol', () => {
    const result = analyze(`
      interface Printable {
        fn to_string(self) -> String
      }
    `);
    const sym = result.scope.lookup('Printable');
    expect(sym).not.toBeNull();
    expect(sym._interfaceMethods).toBeDefined();
    expect(sym._interfaceMethods.length).toBe(1);
    expect(sym._interfaceMethods[0].name).toBe('to_string');
  });

  test('stores trait methods on symbol', () => {
    const result = analyze(`
      trait Displayable {
        fn display(self) -> String
        fn debug(self) -> String {
          "debug"
        }
      }
    `);
    const sym = result.scope.lookup('Displayable');
    expect(sym).not.toBeNull();
    expect(sym._interfaceMethods).toBeDefined();
    expect(sym._interfaceMethods.length).toBe(2);
  });

  test('registers traits in type registry', () => {
    const result = analyze(`
      trait Serializable {
        fn serialize(self) -> String
      }
    `);
    expect(result.typeRegistry.traits.has('Serializable')).toBe(true);
  });
});

// ─── Trait Conformance ────────────────────────────────────

describe('Trait Conformance Checking', () => {
  test('impl populates type registry impls', () => {
    const result = analyze(`
      type Point {
        Create(x: Int, y: Int)
      }
      impl Point {
        fn magnitude(self) -> Float {
          0.0
        }
      }
    `);
    expect(result.typeRegistry.impls.has('Point')).toBe(true);
    const methods = result.typeRegistry.impls.get('Point');
    expect(methods.some(m => m.name === 'magnitude')).toBe(true);
  });
});

// ─── Float Narrowing ──────────────────────────────────────

describe('Float Narrowing', () => {
  test('Float to Int assignment warns in strict mode', () => {
    const warnings = getWarnings(`
      fn test_fn() {
        var x = 10
        x = 3.14
      }
    `, { strict: true });
    expect(warnings.some(w => w.message.includes('Potential data loss'))).toBe(true);
  });

  test('Float to Int assignment does not warn in non-strict mode', () => {
    const warnings = getWarnings(`
      fn test_fn() {
        var x = 10
        x = 3.14
      }
    `);
    expect(warnings.some(w => w.message.includes('Potential data loss'))).toBe(false);
  });
});
