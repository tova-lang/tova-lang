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

  test('instance methods are tagged as not associated', () => {
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
    const methods = result.typeRegistry.impls.get('Point');
    const mag = methods.find(m => m.name === 'magnitude');
    expect(mag.isAssociated).toBe(false);
  });

  test('associated functions are tagged as associated', () => {
    const result = analyze(`
      type Point {
        Create(x: Int, y: Int)
      }
      impl Point {
        fn origin() {
          Point(0, 0)
        }
      }
    `);
    const methods = result.typeRegistry.impls.get('Point');
    const origin = methods.find(m => m.name === 'origin');
    expect(origin.isAssociated).toBe(true);
  });

  test('mixed impl tags associated and instance correctly', () => {
    const result = analyze(`
      type Vec2 {
        Create(x: Float, y: Float)
      }
      impl Vec2 {
        fn zero() {
          Vec2(0.0, 0.0)
        }
        fn unit_x() {
          Vec2(1.0, 0.0)
        }
        fn length(self) -> Float {
          0.0
        }
        fn add(self, other) {
          Vec2(0.0, 0.0)
        }
      }
    `);
    const methods = result.typeRegistry.impls.get('Vec2');
    expect(methods.find(m => m.name === 'zero').isAssociated).toBe(true);
    expect(methods.find(m => m.name === 'unit_x').isAssociated).toBe(true);
    expect(methods.find(m => m.name === 'length').isAssociated).toBe(false);
    expect(methods.find(m => m.name === 'add').isAssociated).toBe(false);
  });

  test('multiple impl blocks accumulate in registry', () => {
    const result = analyze(`
      type Point {
        Create(x: Float, y: Float)
      }
      impl Point {
        fn origin() {
          Point(0.0, 0.0)
        }
      }
      impl Point {
        fn magnitude(self) -> Float {
          0.0
        }
      }
    `);
    const methods = result.typeRegistry.impls.get('Point');
    expect(methods).toHaveLength(2);
    expect(methods.find(m => m.name === 'origin').isAssociated).toBe(true);
    expect(methods.find(m => m.name === 'magnitude').isAssociated).toBe(false);
  });

  test('trait impl methods are tagged as not associated', () => {
    const result = analyze(`
      type Circle {
        Create(radius: Float)
      }
      trait HasArea {
        fn area(self) -> Float
      }
      impl HasArea for Circle {
        fn area(self) -> Float {
          0.0
        }
      }
    `);
    const methods = result.typeRegistry.impls.get('Circle');
    expect(methods.find(m => m.name === 'area').isAssociated).toBe(false);
  });

  test('associated function with params preserves paramTypes', () => {
    const result = analyze(`
      type Rect {
        Create(w: Float, h: Float)
      }
      impl Rect {
        fn square(size: Float) {
          Rect(size, size)
        }
      }
    `);
    const methods = result.typeRegistry.impls.get('Rect');
    const square = methods.find(m => m.name === 'square');
    expect(square.isAssociated).toBe(true);
    expect(square.params).toEqual(['size']);
  });

  test('all-associated impl block has no instance methods in registry', () => {
    const result = analyze(`
      type Config {
        Create(host: String, port: Int)
      }
      impl Config {
        fn dev() {
          Config("localhost", 3000)
        }
        fn prod() {
          Config("0.0.0.0", 443)
        }
      }
    `);
    const methods = result.typeRegistry.impls.get('Config');
    expect(methods.every(m => m.isAssociated)).toBe(true);
    expect(methods).toHaveLength(2);
  });

  test('all-instance impl block has no associated functions in registry', () => {
    const result = analyze(`
      type Point {
        Create(x: Float, y: Float)
      }
      impl Point {
        fn magnitude(self) -> Float {
          0.0
        }
        fn translate(self, dx: Float, dy: Float) {
          Point(0.0, 0.0)
        }
      }
    `);
    const methods = result.typeRegistry.impls.get('Point');
    expect(methods.every(m => !m.isAssociated)).toBe(true);
    expect(methods).toHaveLength(2);
  });

  test('associated function does not get self defined in scope (no false unused warning)', () => {
    const warnings = getWarnings(`
      type Box {
        Create(v: Int)
      }
      impl Box {
        fn empty() {
          Box(0)
        }
      }
    `);
    // Should NOT warn about unused 'self' since self is not defined for associated functions
    expect(warnings.some(w => w.message.includes("'self'") && w.message.includes('unused'))).toBe(false);
  });

  test('instance method gets self defined in scope', () => {
    const warnings = getWarnings(`
      type Box {
        Create(v: Int)
      }
      impl Box {
        fn get_value(self) {
          self.v
        }
      }
    `);
    // self is used, no warning
    expect(warnings.some(w => w.message.includes("'self'") && w.message.includes('not defined'))).toBe(false);
  });

  test('trait with associated + instance: conformance check counts correctly', () => {
    // Trait expects instance method with self, impl provides it
    const warnings = getWarnings(`
      type User {
        Create(name: String)
      }
      interface Displayable {
        fn display(self) -> String
      }
      impl Displayable for User {
        fn display(self) -> String {
          "user"
        }
      }
    `);
    // No missing method warnings
    expect(warnings.some(w => w.message.includes('missing required method'))).toBe(false);
  });

  test('mixed impl and trait impl on same type both register', () => {
    const result = analyze(`
      type Point {
        Create(x: Float, y: Float)
      }
      trait Showable {
        fn show(self) -> String
      }
      impl Point {
        fn origin() {
          Point(0.0, 0.0)
        }
        fn magnitude(self) -> Float {
          0.0
        }
      }
      impl Showable for Point {
        fn show(self) -> String {
          "point"
        }
      }
    `);
    const methods = result.typeRegistry.impls.get('Point');
    expect(methods).toHaveLength(3);
    const origin = methods.find(m => m.name === 'origin');
    const magnitude = methods.find(m => m.name === 'magnitude');
    const show = methods.find(m => m.name === 'show');
    expect(origin.isAssociated).toBe(true);
    expect(magnitude.isAssociated).toBe(false);
    expect(show.isAssociated).toBe(false);
  });
});

// ─── TypeRegistry getMembers / getAssociatedFunctions ──────

describe('TypeRegistry Associated Function Filtering', () => {
  test('getMembers excludes associated functions', () => {
    const result = analyze(`
      type Point {
        Create(x: Float, y: Float)
      }
      impl Point {
        fn origin() {
          Point(0.0, 0.0)
        }
        fn magnitude(self) -> Float {
          0.0
        }
      }
    `);
    // Build TypeRegistry from analyzer
    const { TypeRegistry } = require('../src/analyzer/type-registry.js');
    const registry = TypeRegistry.fromAnalyzer({ typeRegistry: result.typeRegistry });
    const members = registry.getMembers('Point');
    // getMembers should only return instance methods
    expect(members.methods).toHaveLength(1);
    expect(members.methods[0].name).toBe('magnitude');
  });

  test('getAssociatedFunctions returns only associated functions', () => {
    const result = analyze(`
      type Point {
        Create(x: Float, y: Float)
      }
      impl Point {
        fn origin() {
          Point(0.0, 0.0)
        }
        fn from_xy(x: Float, y: Float) {
          Point(x, y)
        }
        fn magnitude(self) -> Float {
          0.0
        }
      }
    `);
    const { TypeRegistry } = require('../src/analyzer/type-registry.js');
    const registry = TypeRegistry.fromAnalyzer({ typeRegistry: result.typeRegistry });
    const assocFns = registry.getAssociatedFunctions('Point');
    expect(assocFns).toHaveLength(2);
    expect(assocFns.map(f => f.name).sort()).toEqual(['from_xy', 'origin']);
  });

  test('getAssociatedFunctions returns empty for all-instance impl', () => {
    const result = analyze(`
      type Box {
        Create(v: Int)
      }
      impl Box {
        fn get(self) {
          self.v
        }
      }
    `);
    const { TypeRegistry } = require('../src/analyzer/type-registry.js');
    const registry = TypeRegistry.fromAnalyzer({ typeRegistry: result.typeRegistry });
    expect(registry.getAssociatedFunctions('Box')).toHaveLength(0);
  });

  test('getMembers returns empty methods for all-associated impl', () => {
    const result = analyze(`
      type Config {
        Create(host: String, port: Int)
      }
      impl Config {
        fn dev() {
          Config("localhost", 3000)
        }
      }
    `);
    const { TypeRegistry } = require('../src/analyzer/type-registry.js');
    const registry = TypeRegistry.fromAnalyzer({ typeRegistry: result.typeRegistry });
    const members = registry.getMembers('Config');
    expect(members.methods).toHaveLength(0);
  });

  test('getAssociatedFunctions on unknown type returns empty', () => {
    const result = analyze('fn dummy() { 1 }');
    const { TypeRegistry } = require('../src/analyzer/type-registry.js');
    const registry = TypeRegistry.fromAnalyzer({ typeRegistry: result.typeRegistry });
    expect(registry.getAssociatedFunctions('NonExistent')).toHaveLength(0);
  });
});

// ─── Float Narrowing ──────────────────────────────────────

describe('Float Narrowing', () => {
  test('Float to Int assignment warns with type mismatch', () => {
    // Float->Int is now always a type mismatch (use floor/round to convert)
    const warnings = getWarnings(`
      fn test_fn() {
        var x = 10
        x = 3.14
      }
    `);
    expect(warnings.some(w => w.message.includes('Type mismatch'))).toBe(true);
  });

  test('Int to Float assignment is fine (widening)', () => {
    const warnings = getWarnings(`
      fn test_fn() {
        var x = 3.14
        x = 10
      }
    `);
    expect(warnings.some(w => w.message.includes('Type mismatch'))).toBe(false);
  });
});
