// ─────────────────────────────────────────────────────────────────────────────
// Tova Type-System Validation — Production-Grade Integration Tests
// Tests edge cases and cross-phase integration across:
//   Phase 1: Type Representation (types.js)
//   Phase 2: Analyzer integration (analyzer.js)
//   Phase 3: LSP / TypeRegistry integration (type-registry.js, server.js)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { Scope, Symbol as TSymbol } from '../src/analyzer/scope.js';
import { TypeRegistry } from '../src/analyzer/type-registry.js';
import {
  Type, PrimitiveType, NilType, AnyType, UnknownType,
  ArrayType, TupleType, FunctionType, RecordType, ADTType,
  GenericType, TypeVariable, UnionType,
  typeAnnotationToType, typeFromString, typesCompatible,
  isNumericType, isFloatNarrowing,
} from '../src/analyzer/types.js';

// ─── Helpers ──────────────────────────────────────────────────

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function analyze(source, options = {}) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, '<test>', { tolerant: true, ...options });
  return analyzer.analyze();
}

function analyzeRaw(source, options = {}) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, '<test>', options);
  return analyzer;
}

function getWarnings(source, options = {}) {
  return analyze(source, options).warnings;
}

function getErrors(source, options = {}) {
  try {
    const ast = parse(source);
    const analyzer = new Analyzer(ast, '<test>', options);
    analyzer.analyze();
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


// ═══════════════════════════════════════════════════════════════
// 1. TYPE REPRESENTATION INTEGRATION WITH ANALYZER
// ═══════════════════════════════════════════════════════════════

describe('1. Type Representation Integration with Analyzer', () => {

  // ── 1a. _inferType still returns strings (backward compat) ──

  describe('_inferType returns strings', () => {
    test('number literal infers "Int"', () => {
      const analyzer = analyzeRaw('x = 42');
      const result = analyzer._inferType({ type: 'NumberLiteral', value: 42 });
      expect(result).toBe('Int');
      expect(typeof result).toBe('string');
    });

    test('float literal infers "Float"', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({ type: 'NumberLiteral', value: 3.14 });
      expect(result).toBe('Float');
      expect(typeof result).toBe('string');
    });

    test('string literal infers "String"', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({ type: 'StringLiteral', value: 'hello' });
      expect(result).toBe('String');
    });

    test('boolean literal infers "Bool"', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({ type: 'BooleanLiteral', value: true });
      expect(result).toBe('Bool');
    });

    test('nil literal infers "Nil"', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({ type: 'NilLiteral' });
      expect(result).toBe('Nil');
    });

    test('array literal infers bracketed type string', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({
        type: 'ArrayLiteral',
        elements: [{ type: 'NumberLiteral', value: 1 }]
      });
      expect(result).toBe('[Int]');
    });

    test('empty array infers [Any]', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({ type: 'ArrayLiteral', elements: [] });
      expect(result).toBe('[Any]');
    });

    test('binary expression ++ infers "String"', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({
        type: 'BinaryExpression', operator: '++',
        left: { type: 'StringLiteral', value: 'a' },
        right: { type: 'StringLiteral', value: 'b' },
      });
      expect(result).toBe('String');
    });

    test('binary arithmetic with mixed Int/Float infers "Float"', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({
        type: 'BinaryExpression', operator: '+',
        left: { type: 'NumberLiteral', value: 1 },
        right: { type: 'NumberLiteral', value: 3.14 },
      });
      expect(result).toBe('Float');
    });

    test('comparison infers "Bool"', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({
        type: 'BinaryExpression', operator: '==',
        left: { type: 'NumberLiteral', value: 1 },
        right: { type: 'NumberLiteral', value: 2 },
      });
      expect(result).toBe('Bool');
    });

    test('tuple expression infers parenthesized string', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({
        type: 'TupleExpression',
        elements: [
          { type: 'NumberLiteral', value: 1 },
          { type: 'StringLiteral', value: 'a' },
        ]
      });
      expect(result).toBe('(Int, String)');
    });

    test('Ok() call infers Result with inner type', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'Ok' },
        arguments: [{ type: 'NumberLiteral', value: 42 }],
      });
      expect(result).toBe('Result<Int, _>');
    });

    test('Some() call infers Option with inner type', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'Some' },
        arguments: [{ type: 'StringLiteral', value: 'hi' }],
      });
      expect(result).toBe('Option<String>');
    });

    test('None identifier infers Option<_>', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({ type: 'Identifier', name: 'None' });
      expect(result).toBe('Option<_>');
    });

    test('null/undefined expr returns null', () => {
      const analyzer = analyzeRaw('x = 1');
      expect(analyzer._inferType(null)).toBe(null);
      expect(analyzer._inferType(undefined)).toBe(null);
    });

    test('unary not infers Bool', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({
        type: 'UnaryExpression', operator: 'not',
        operand: { type: 'BooleanLiteral', value: true },
      });
      expect(result).toBe('Bool');
    });

    test('unary negation preserves numeric type', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({
        type: 'UnaryExpression', operator: '-',
        operand: { type: 'NumberLiteral', value: 42 },
      });
      expect(result).toBe('Int');
    });

    test('logical expression infers Bool', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({
        type: 'LogicalExpression', operator: 'and',
        left: { type: 'BooleanLiteral', value: true },
        right: { type: 'BooleanLiteral', value: false },
      });
      expect(result).toBe('Bool');
    });

    test('Err() call infers Result', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'Err' },
        arguments: [{ type: 'StringLiteral', value: 'oops' }],
      });
      expect(result).toBe('Result<_, String>');
    });

    test('len() infers Int', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'len' },
        arguments: [{ type: 'ArrayLiteral', elements: [] }],
      });
      expect(result).toBe('Int');
    });

    test('type_of() infers String', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'type_of' },
        arguments: [{ type: 'NumberLiteral', value: 42 }],
      });
      expect(result).toBe('String');
    });

    test('random() infers Float', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._inferType({
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'random' },
        arguments: [],
      });
      expect(result).toBe('Float');
    });

    test('unknown expression type returns null', () => {
      const analyzer = analyzeRaw('x = 1');
      expect(analyzer._inferType({ type: 'SomeUnknownNode' })).toBe(null);
    });
  });

  // ── 1b. _typesCompatible still works with string args ──

  describe('_typesCompatible with string arguments', () => {
    test('exact string match is compatible', () => {
      const analyzer = analyzeRaw('x = 1');
      expect(analyzer._typesCompatible('Int', 'Int')).toBe(true);
    });

    test('different string types are incompatible', () => {
      const analyzer = analyzeRaw('x = 1');
      expect(analyzer._typesCompatible('Int', 'String')).toBe(false);
    });

    test('numeric types are compatible', () => {
      const analyzer = analyzeRaw('x = 1');
      expect(analyzer._typesCompatible('Int', 'Float')).toBe(true);
      expect(analyzer._typesCompatible('Float', 'Int')).toBe(true);
    });

    test('Any is compatible with everything', () => {
      const analyzer = analyzeRaw('x = 1');
      expect(analyzer._typesCompatible('Any', 'String')).toBe(true);
      expect(analyzer._typesCompatible('Int', 'Any')).toBe(true);
    });

    test('null/undefined types are compatible with anything', () => {
      const analyzer = analyzeRaw('x = 1');
      expect(analyzer._typesCompatible(null, 'Int')).toBe(true);
      expect(analyzer._typesCompatible('Int', null)).toBe(true);
      expect(analyzer._typesCompatible(null, null)).toBe(true);
    });

    test('wildcard _ is compatible with anything', () => {
      const analyzer = analyzeRaw('x = 1');
      expect(analyzer._typesCompatible('_', 'Int')).toBe(true);
      expect(analyzer._typesCompatible('String', '_')).toBe(true);
    });

    test('Nil is compatible with Option', () => {
      const analyzer = analyzeRaw('x = 1');
      expect(analyzer._typesCompatible('Option', 'Nil')).toBe(true);
      expect(analyzer._typesCompatible('Option<Int>', 'Nil')).toBe(true);
    });

    test('array type string compatibility', () => {
      const analyzer = analyzeRaw('x = 1');
      expect(analyzer._typesCompatible('[Int]', '[Int]')).toBe(true);
      expect(analyzer._typesCompatible('[Int]', '[Float]')).toBe(true); // numeric compat
      expect(analyzer._typesCompatible('[Int]', '[String]')).toBe(false);
    });

    test('tuple type string compatibility', () => {
      const analyzer = analyzeRaw('x = 1');
      expect(analyzer._typesCompatible('(Int, String)', '(Int, String)')).toBe(true);
      expect(analyzer._typesCompatible('(Int, String)', '(Int, Bool)')).toBe(false);
      expect(analyzer._typesCompatible('(Int, String)', '(Int)')).toBe(false);
    });

    test('generic type string compatibility', () => {
      const analyzer = analyzeRaw('x = 1');
      expect(analyzer._typesCompatible('Result<Int, String>', 'Result<Int, String>')).toBe(true);
      expect(analyzer._typesCompatible('Result', 'Result<Int, String>')).toBe(true); // gradual
      expect(analyzer._typesCompatible('Result<Int, String>', 'Result')).toBe(true); // gradual
      expect(analyzer._typesCompatible('Result<Int, String>', 'Option<Int>')).toBe(false);
    });
  });

  // ── 1c. _typeAnnotationToString still works ──

  describe('_typeAnnotationToString', () => {
    test('handles raw string input', () => {
      const analyzer = analyzeRaw('x = 1');
      expect(analyzer._typeAnnotationToString('Int')).toBe('Int');
      expect(analyzer._typeAnnotationToString('Float')).toBe('Float');
    });

    test('handles TypeAnnotation node', () => {
      const analyzer = analyzeRaw('x = 1');
      expect(analyzer._typeAnnotationToString({ type: 'TypeAnnotation', name: 'Int' })).toBe('Int');
    });

    test('handles TypeAnnotation with type params', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._typeAnnotationToString({
        type: 'TypeAnnotation', name: 'Result',
        typeParams: [
          { type: 'TypeAnnotation', name: 'Int' },
          { type: 'TypeAnnotation', name: 'String' },
        ]
      });
      expect(result).toBe('Result<Int, String>');
    });

    test('handles ArrayTypeAnnotation', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._typeAnnotationToString({
        type: 'ArrayTypeAnnotation',
        elementType: { type: 'TypeAnnotation', name: 'Int' },
      });
      expect(result).toBe('[Int]');
    });

    test('handles TupleTypeAnnotation', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._typeAnnotationToString({
        type: 'TupleTypeAnnotation',
        elementTypes: [
          { type: 'TypeAnnotation', name: 'Int' },
          { type: 'TypeAnnotation', name: 'String' },
        ]
      });
      expect(result).toBe('(Int, String)');
    });

    test('handles FunctionTypeAnnotation', () => {
      const analyzer = analyzeRaw('x = 1');
      expect(analyzer._typeAnnotationToString({ type: 'FunctionTypeAnnotation' })).toBe('Function');
    });

    test('handles null', () => {
      const analyzer = analyzeRaw('x = 1');
      expect(analyzer._typeAnnotationToString(null)).toBe(null);
    });

    test('handles nested generic annotation', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._typeAnnotationToString({
        type: 'TypeAnnotation', name: 'Result',
        typeParams: [
          {
            type: 'TypeAnnotation', name: 'Option',
            typeParams: [{ type: 'TypeAnnotation', name: 'Int' }]
          },
          { type: 'TypeAnnotation', name: 'String' },
        ]
      });
      expect(result).toBe('Result<Option<Int>, String>');
    });
  });

  // ── 1d. _parseGenericType still works ──

  describe('_parseGenericType', () => {
    test('parses simple type', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._parseGenericType('Int');
      expect(result).toEqual({ base: 'Int', params: [] });
    });

    test('parses generic with one param', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._parseGenericType('Option<Int>');
      expect(result).toEqual({ base: 'Option', params: ['Int'] });
    });

    test('parses generic with two params', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._parseGenericType('Result<Int, String>');
      expect(result).toEqual({ base: 'Result', params: ['Int', 'String'] });
    });

    test('parses nested generic', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._parseGenericType('Result<Option<Int>, String>');
      expect(result).toEqual({ base: 'Result', params: ['Option<Int>', 'String'] });
    });

    test('handles null input', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._parseGenericType(null);
      expect(result).toEqual({ base: null, params: [] });
    });

    test('handles deeply nested generics', () => {
      const analyzer = analyzeRaw('x = 1');
      const result = analyzer._parseGenericType('Map<String, List<Option<Int>>>');
      expect(result.base).toBe('Map');
      expect(result.params.length).toBe(2);
      expect(result.params[0]).toBe('String');
      expect(result.params[1]).toBe('List<Option<Int>>');
    });
  });
});


// ═══════════════════════════════════════════════════════════════
// 2. STRICT MODE TOGGLES
// ═══════════════════════════════════════════════════════════════

describe('2. Strict Mode Toggles — all 4 upgraded checks', () => {

  // ── 2a. Binary operator type mismatch ──

  describe('binary ops: warning in non-strict, error in strict', () => {
    const src = `
      x = "hello"
      y = x - 5
    `;

    test('non-strict: produces warning', () => {
      const warnings = getWarnings(src);
      expect(warnings.some(w => w.message.includes('Type mismatch'))).toBe(true);
    });

    test('strict: produces error', () => {
      const errors = getErrors(src, { strict: true });
      expect(errors.some(e => e.message.includes('Type mismatch'))).toBe(true);
    });
  });

  // ── 2b. Reassignment type mismatch ──

  describe('reassignment: warning in non-strict, error in strict', () => {
    const src = `
      fn test_fn() {
        var x = 10
        x = "hello"
      }
    `;

    test('non-strict: produces warning', () => {
      const warnings = getWarnings(src);
      expect(warnings.some(w => w.message.includes('Type mismatch'))).toBe(true);
    });

    test('strict: produces error', () => {
      const errors = getErrors(src, { strict: true });
      expect(errors.some(e => e.message.includes('Type mismatch'))).toBe(true);
    });
  });

  // ── 2c. Compound assignment type mismatch ──

  describe('compound assignment: warning in non-strict, error in strict', () => {
    const src = `
      fn test_fn() {
        var x = "hello"
        x -= 5
      }
    `;

    test('non-strict: produces warning', () => {
      const warnings = getWarnings(src);
      expect(warnings.some(w => w.message.includes('Type mismatch'))).toBe(true);
    });

    test('strict: produces error', () => {
      const errors = getErrors(src, { strict: true });
      expect(errors.some(e => e.message.includes('Type mismatch'))).toBe(true);
    });
  });

  // ── 2d. Argument count mismatch (too many) ──

  describe('arg count (too many): warning in non-strict, error in strict', () => {
    const src = `
      fn add(a: Int, b: Int) -> Int { a + b }
      add(1, 2, 3)
    `;

    test('non-strict: produces warning', () => {
      const warnings = getWarnings(src);
      expect(warnings.some(w => w.message.includes('expects 2 arguments'))).toBe(true);
    });

    test('strict: produces error', () => {
      const errors = getErrors(src, { strict: true });
      expect(errors.some(e => e.message.includes('expects 2 arguments'))).toBe(true);
    });
  });

  // ── 2e. Too few arguments ──

  describe('arg count (too few): warning in non-strict, error in strict', () => {
    const src = `
      fn triple(a: Int, b: Int, c: Int) -> Int { a + b + c }
      triple(1)
    `;

    test('non-strict: produces warning', () => {
      const warnings = getWarnings(src);
      expect(warnings.some(w => w.message.includes('expects at least 3'))).toBe(true);
    });

    test('strict: produces error', () => {
      const errors = getErrors(src, { strict: true });
      expect(errors.some(e => e.message.includes('expects at least 3'))).toBe(true);
    });
  });

  // ── 2f. Addition type mismatch (+ on non-numeric) ──

  describe('addition (+) type mismatch: warning in non-strict, error in strict', () => {
    const src = `
      x = true
      y = x + 5
    `;

    test('non-strict: produces warning', () => {
      const warnings = getWarnings(src);
      expect(warnings.some(w => w.message.includes("'+' expects numeric"))).toBe(true);
    });

    test('strict: produces error', () => {
      const errors = getErrors(src, { strict: true });
      expect(errors.some(e => e.message.includes("'+' expects numeric"))).toBe(true);
    });
  });

  // ── 2g. Multiplication type mismatch ──

  describe('multiplication (*) type mismatch: warning in non-strict, error in strict', () => {
    const src = `
      x = "hello"
      y = x * 5
    `;

    test('non-strict: produces warning', () => {
      const warnings = getWarnings(src);
      expect(warnings.some(w => w.message.includes("'*' expects numeric"))).toBe(true);
    });

    test('strict: produces error', () => {
      const errors = getErrors(src, { strict: true });
      expect(errors.some(e => e.message.includes("'*' expects numeric"))).toBe(true);
    });
  });

  // ── 2h. Compound assignment += on numeric with string value ──

  describe('compound += mismatch: warning in non-strict, error in strict', () => {
    const src = `
      fn test_fn() {
        var x = 10
        x += "hello"
      }
    `;

    test('non-strict: produces warning', () => {
      const warnings = getWarnings(src);
      expect(warnings.some(w => w.message.includes('Type mismatch'))).toBe(true);
    });

    test('strict: produces error', () => {
      const errors = getErrors(src, { strict: true });
      expect(errors.some(e => e.message.includes('Type mismatch'))).toBe(true);
    });
  });
});


// ═══════════════════════════════════════════════════════════════
// 3. TYPE REGISTRY POPULATION
// ═══════════════════════════════════════════════════════════════

describe('3. Type Registry Population', () => {

  test('type declarations populate typeRegistry.types with ADTType', () => {
    const result = analyze(`
      type Color {
        Red
        Green
        Blue
      }
    `);
    expect(result.typeRegistry.types.has('Color')).toBe(true);
    const colorType = result.typeRegistry.types.get('Color');
    expect(colorType).toBeInstanceOf(ADTType);
    expect(colorType.name).toBe('Color');
    expect(colorType.getVariantNames()).toEqual(['Red', 'Green', 'Blue']);
  });

  test('type variants with fields are stored correctly', () => {
    const result = analyze(`
      type Shape {
        Circle(radius: Float)
        Rectangle(width: Float, height: Float)
        Point
      }
    `);
    const shapeType = result.typeRegistry.types.get('Shape');
    expect(shapeType.variants.size).toBe(3);

    const circleFields = shapeType.variants.get('Circle');
    expect(circleFields.has('radius')).toBe(true);

    const rectFields = shapeType.variants.get('Rectangle');
    expect(rectFields.has('width')).toBe(true);
    expect(rectFields.has('height')).toBe(true);

    const pointFields = shapeType.variants.get('Point');
    expect(pointFields.size).toBe(0);
  });

  test('type declarations with type params', () => {
    const result = analyze(`
      type Either<L, R> {
        Left(value: L)
        Right(value: R)
      }
    `);
    const eitherType = result.typeRegistry.types.get('Either');
    expect(eitherType).toBeInstanceOf(ADTType);
    expect(eitherType.typeParams).toEqual(['L', 'R']);
    expect(eitherType.getVariantNames()).toEqual(['Left', 'Right']);
  });

  test('impl populates typeRegistry.impls', () => {
    const result = analyze(`
      type Vec2 {
        Create(x: Float, y: Float)
      }
      impl Vec2 {
        fn length(self) -> Float {
          0.0
        }
        fn add(self, other: Vec2) -> Vec2 {
          Vec2.Create(0.0, 0.0)
        }
      }
    `);
    expect(result.typeRegistry.impls.has('Vec2')).toBe(true);
    const methods = result.typeRegistry.impls.get('Vec2');
    expect(methods.length).toBe(2);
    expect(methods.some(m => m.name === 'length')).toBe(true);
    expect(methods.some(m => m.name === 'add')).toBe(true);
  });

  test('trait declarations populate typeRegistry.traits', () => {
    const result = analyze(`
      trait Hashable {
        fn hash(self) -> Int
      }
    `);
    expect(result.typeRegistry.traits.has('Hashable')).toBe(true);
    const methods = result.typeRegistry.traits.get('Hashable');
    expect(methods.length).toBe(1);
    expect(methods[0].name).toBe('hash');
  });

  test('interface declarations populate typeRegistry.traits', () => {
    const result = analyze(`
      interface Stringable {
        fn to_string(self) -> String
      }
    `);
    expect(result.typeRegistry.traits.has('Stringable')).toBe(true);
    const methods = result.typeRegistry.traits.get('Stringable');
    expect(methods.length).toBe(1);
    expect(methods[0].name).toBe('to_string');
  });

  test('multiple impls for same type accumulate methods', () => {
    const result = analyze(`
      type Token {
        Word(text: String)
      }
      impl Token {
        fn display(self) -> String { "token" }
      }
      impl Token {
        fn parse_it(self) -> Int { 0 }
      }
    `);
    const methods = result.typeRegistry.impls.get('Token');
    expect(methods.length).toBe(2);
    expect(methods.some(m => m.name === 'display')).toBe(true);
    expect(methods.some(m => m.name === 'parse_it')).toBe(true);
  });

  test('typeRegistry is returned from analyze()', () => {
    const result = analyze('x = 1');
    expect(result.typeRegistry).toBeDefined();
    expect(result.typeRegistry.types).toBeInstanceOf(Map);
    expect(result.typeRegistry.impls).toBeInstanceOf(Map);
    expect(result.typeRegistry.traits).toBeInstanceOf(Map);
  });

  test('impl method params and return types are recorded', () => {
    const result = analyze(`
      type Counter {
        Create(value: Int)
      }
      impl Counter {
        fn increment(self, amount: Int) -> Counter {
          Counter.Create(0)
        }
      }
    `);
    const methods = result.typeRegistry.impls.get('Counter');
    const inc = methods.find(m => m.name === 'increment');
    expect(inc).toBeDefined();
    expect(inc.params).toContain('self');
    expect(inc.params).toContain('amount');
  });
});


// ═══════════════════════════════════════════════════════════════
// 4. EXHAUSTIVENESS CHECKING WITH TYPE STRUCTURE
// ═══════════════════════════════════════════════════════════════

describe('4. Exhaustiveness Checking with ADT-aware Type Structure', () => {

  test('warns when variant is missing from user-defined ADT match', () => {
    expect(hasWarning(`
      type Light {
        Red
        Yellow
        Green
      }
      fn describe(l: Light) {
        match l {
          Red => "stop"
          Green => "go"
        }
      }
    `, "missing 'Yellow'")).toBe(true);
  });

  test('no warning when all variants covered', () => {
    expect(hasWarning(`
      type Light {
        Red
        Yellow
        Green
      }
      fn describe(l: Light) {
        match l {
          Red => "stop"
          Yellow => "slow"
          Green => "go"
        }
      }
    `, 'Non-exhaustive')).toBe(false);
  });

  test('no warning with wildcard catch-all', () => {
    expect(hasWarning(`
      type Direction {
        North
        South
        East
        West
      }
      fn go(d: Direction) {
        match d {
          North => "up"
          _ => "other"
        }
      }
    `, 'Non-exhaustive')).toBe(false);
  });

  test('warns about specific missing variant name from ADT', () => {
    expect(hasWarning(`
      type Animal {
        Cat(name: String)
        Dog(name: String)
        Fish
      }
      fn speak(a: Animal) {
        match a {
          Cat(name) => "meow"
          Dog(name) => "woof"
        }
      }
    `, "missing 'Fish'")).toBe(true);
  });

  test('built-in Result exhaustiveness: missing Ok', () => {
    expect(hasWarning(`
      fn handle(r: Result) {
        match r {
          Err(e) => print(e)
        }
      }
    `, "missing 'Ok'")).toBe(true);
  });

  test('built-in Option exhaustiveness: missing None', () => {
    expect(hasWarning(`
      fn handle(o: Option) {
        match o {
          Some(v) => print(v)
        }
      }
    `, "missing 'None'")).toBe(true);
  });

  test('binding pattern (no guard) acts as catch-all', () => {
    expect(hasWarning(`
      type Expr {
        Lit(val: Int)
        Add(left: Int, right: Int)
      }
      fn eval_expr(e: Expr) {
        match e {
          Lit(val) => val
          other => 0
        }
      }
    `, 'Non-exhaustive')).toBe(false);
  });

  test('warns about multiple missing variants', () => {
    const warnings = getWarnings(`
      type Season {
        Spring
        Summer
        Autumn
        Winter
      }
      fn describe(s: Season) {
        match s {
          Spring => "warm"
        }
      }
    `);
    const missing = warnings.filter(w => w.message.includes('Non-exhaustive'));
    // Should warn about Summer, Autumn, and Winter
    expect(missing.length).toBeGreaterThanOrEqual(1);
  });
});


// ═══════════════════════════════════════════════════════════════
// 5. SCOPE POSITION TRACKING
// ═══════════════════════════════════════════════════════════════

describe('5. Scope Position Tracking', () => {

  test('function declaration sets startLoc on child scope', () => {
    const result = analyze(`
      fn greet(name: String) -> String {
        return "Hello " + name
      }
    `);
    const scope = result.scope;
    // The function body creates a child scope
    expect(scope.children.length).toBeGreaterThanOrEqual(1);

    // Find the function scope child
    const fnScope = scope.children.find(c => c.context === 'function');
    expect(fnScope).toBeDefined();
    expect(fnScope.startLoc).not.toBeNull();
    expect(typeof fnScope.startLoc.line).toBe('number');
    expect(typeof fnScope.startLoc.column).toBe('number');
  });

  test('block statement sets startLoc when loc is present', () => {
    const result = analyze(`
      fn test_fn() {
        if true {
          x = 1
        }
      }
    `);
    const scope = result.scope;
    // Find function scope, then look for block children
    const fnScope = scope.children.find(c => c.context === 'function');
    expect(fnScope).toBeDefined();
    // The if body creates a block child scope inside the function scope
    // Block scopes should have startLoc set from the AST node's loc
  });

  test('Scope.findScopeAtPosition works with position data', () => {
    const scope = new Scope(null, 'module');
    scope.startLoc = { line: 1, column: 0 };
    scope.endLoc = { line: 100, column: 0 };

    const child = scope.child('function');
    child.startLoc = { line: 5, column: 2 };
    child.endLoc = { line: 10, column: 0 };

    const nested = child.child('block');
    nested.startLoc = { line: 6, column: 4 };
    nested.endLoc = { line: 8, column: 4 };

    // Inside nested block
    const found = scope.findScopeAtPosition(7, 6);
    expect(found).toBe(nested);

    // Inside function but outside nested block
    const found2 = scope.findScopeAtPosition(9, 3);
    expect(found2).toBe(child);

    // Outside function
    const found3 = scope.findScopeAtPosition(50, 0);
    expect(found3).toBe(scope);
  });

  test('global scope has no startLoc by default', () => {
    const result = analyze('x = 1');
    expect(result.scope.startLoc).toBeNull();
  });

  test('multiple functions create separate scoped children', () => {
    const result = analyze(`
      fn foo() { x = 1 }
      fn bar() { y = 2 }
    `);
    const scope = result.scope;
    const fnScopes = scope.children.filter(c => c.context === 'function');
    expect(fnScopes.length).toBe(2);
    // Each should have its own startLoc
    for (const fn of fnScopes) {
      expect(fn.startLoc).not.toBeNull();
    }
  });

  test('Scope.child tracks parent reference', () => {
    const parent = new Scope(null, 'module');
    const child = parent.child('function');
    expect(child.parent).toBe(parent);
    expect(parent.children).toContain(child);
  });
});


// ═══════════════════════════════════════════════════════════════
// 6. LSP INTEGRATION
// ═══════════════════════════════════════════════════════════════

describe('6. LSP Integration', () => {

  test('LSP server module can be imported without errors', async () => {
    // Dynamic import to verify module loads cleanly
    const mod = await import('../src/lsp/server.js');
    expect(mod).toBeDefined();
  });

  test('TypeRegistry can be imported from type-registry.js', () => {
    expect(TypeRegistry).toBeDefined();
    expect(typeof TypeRegistry).toBe('function'); // it's a class
  });

  test('TypeRegistry.fromAnalyzer creates registry from analyzer', () => {
    const ast = parse(`
      type Color {
        Red
        Green
        Blue
      }
      impl Color {
        fn display(self) -> String { "color" }
      }
      trait Showable {
        fn show(self) -> String
      }
    `);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    analyzer.analyze();

    const registry = TypeRegistry.fromAnalyzer(analyzer);
    expect(registry).toBeInstanceOf(TypeRegistry);
    expect(registry.types.has('Color')).toBe(true);
    expect(registry.impls.has('Color')).toBe(true);
    expect(registry.traits.has('Showable')).toBe(true);
  });

  test('TypeRegistry.getMembers returns fields and methods', () => {
    const ast = parse(`
      type Point {
        Create(x: Int, y: Int)
      }
      impl Point {
        fn magnitude(self) -> Float { 0.0 }
      }
    `);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    analyzer.analyze();

    const registry = TypeRegistry.fromAnalyzer(analyzer);
    const members = registry.getMembers('Point');

    // Point is an ADT, fields come from variants
    expect(members.fields.has('x')).toBe(true);
    expect(members.fields.has('y')).toBe(true);
    expect(members.methods.some(m => m.name === 'magnitude')).toBe(true);
  });

  test('TypeRegistry.getVariantNames returns variant list', () => {
    const ast = parse(`
      type Status {
        Active
        Inactive
        Pending
      }
    `);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    analyzer.analyze();

    const registry = TypeRegistry.fromAnalyzer(analyzer);
    const variants = registry.getVariantNames('Status');
    expect(variants).toEqual(['Active', 'Inactive', 'Pending']);
  });

  test('TypeRegistry.getVariantNames returns empty for non-ADT types', () => {
    const registry = new TypeRegistry();
    expect(registry.getVariantNames('NonExistent')).toEqual([]);
  });

  test('TypeRegistry.getMembers for non-existent type returns empty', () => {
    const registry = new TypeRegistry();
    const members = registry.getMembers('NoSuchType');
    expect(members.fields.size).toBe(0);
    expect(members.methods.length).toBe(0);
  });

  test('TypeRegistry.fromAnalyzer handles analyzer with empty registry', () => {
    const ast = parse('x = 1');
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    analyzer.analyze();

    const registry = TypeRegistry.fromAnalyzer(analyzer);
    expect(registry.types.size).toBe(0);
    expect(registry.impls.size).toBe(0);
    expect(registry.traits.size).toBe(0);
  });

  test('TypeRegistry.getMembers includes fields from multiple variants', () => {
    const ast = parse(`
      type Shape {
        Circle(radius: Float)
        Rectangle(width: Float, height: Float)
      }
    `);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    analyzer.analyze();

    const registry = TypeRegistry.fromAnalyzer(analyzer);
    const members = registry.getMembers('Shape');
    expect(members.fields.has('radius')).toBe(true);
    expect(members.fields.has('width')).toBe(true);
    expect(members.fields.has('height')).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════════
// 7. FLOAT NARROWING
// ═══════════════════════════════════════════════════════════════

describe('7. Float Narrowing', () => {

  test('Float -> Int assignment warns in strict mode only', () => {
    const src = `
      fn test_fn() {
        var x = 10
        x = 3.14
      }
    `;

    // Strict: produces "Potential data loss" warning
    const strictWarnings = getWarnings(src, { strict: true });
    expect(strictWarnings.some(w => w.message.includes('Potential data loss'))).toBe(true);

    // Non-strict: no such warning
    const normalWarnings = getWarnings(src);
    expect(normalWarnings.some(w => w.message.includes('Potential data loss'))).toBe(false);
  });

  test('Int -> Float is always allowed (widening)', () => {
    const src = `
      fn test_fn() {
        var x = 3.14
        x = 10
      }
    `;

    // Neither strict nor non-strict should warn about data loss for widening
    const strictWarnings = getWarnings(src, { strict: true });
    expect(strictWarnings.some(w => w.message.includes('Potential data loss'))).toBe(false);

    const normalWarnings = getWarnings(src);
    expect(normalWarnings.some(w => w.message.includes('Potential data loss'))).toBe(false);
  });

  test('isFloatNarrowing helper function', () => {
    expect(isFloatNarrowing(Type.FLOAT, Type.INT)).toBe(true);
    expect(isFloatNarrowing(Type.INT, Type.FLOAT)).toBe(false);
    expect(isFloatNarrowing(Type.INT, Type.INT)).toBe(false);
    expect(isFloatNarrowing(null, Type.INT)).toBe(false);
    expect(isFloatNarrowing(Type.FLOAT, null)).toBe(false);
    expect(isFloatNarrowing(Type.STRING, Type.INT)).toBe(false);
  });

  test('Float narrowing does not trigger for String types', () => {
    expect(isFloatNarrowing(Type.STRING, Type.INT)).toBe(false);
    expect(isFloatNarrowing(Type.FLOAT, Type.STRING)).toBe(false);
  });
});


// ═══════════════════════════════════════════════════════════════
// 8. EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('8. Edge Cases', () => {

  // ── 8a. Null types ──

  describe('null types', () => {
    test('typesCompatible with null target returns true', () => {
      expect(typesCompatible(null, Type.INT)).toBe(true);
    });

    test('typesCompatible with null source returns true', () => {
      expect(typesCompatible(Type.INT, null)).toBe(true);
    });

    test('typesCompatible with both null returns true', () => {
      expect(typesCompatible(null, null)).toBe(true);
    });

    test('typeFromString with null returns null', () => {
      expect(typeFromString(null)).toBe(null);
    });

    test('typeFromString with empty string returns null', () => {
      const result = typeFromString('');
      // Empty string is falsy in JS so typeFromString returns null
      expect(result).toBe(null);
    });

    test('typeAnnotationToType with null returns null', () => {
      expect(typeAnnotationToType(null)).toBe(null);
    });

    test('isAssignableTo with null target returns true for all types', () => {
      expect(Type.INT.isAssignableTo(null)).toBe(true);
      expect(Type.STRING.isAssignableTo(null)).toBe(true);
      expect(Type.NIL.isAssignableTo(null)).toBe(true);
      expect(new ArrayType(Type.INT).isAssignableTo(null)).toBe(true);
      expect(new TupleType([Type.INT]).isAssignableTo(null)).toBe(true);
      expect(new GenericType('Result', []).isAssignableTo(null)).toBe(true);
    });

    test('isNumericType with null returns false', () => {
      expect(isNumericType(null)).toBe(false);
    });

    test('isNumericType with non-primitive returns false', () => {
      expect(isNumericType(new ArrayType(Type.INT))).toBe(false);
      expect(isNumericType(Type.STRING)).toBe(false);
    });
  });

  // ── 8b. Empty ADTs ──

  describe('empty ADTs', () => {
    test('ADTType with no variants', () => {
      const adt = new ADTType('Empty', [], new Map());
      expect(adt.name).toBe('Empty');
      expect(adt.getVariantNames()).toEqual([]);
      expect(adt.variants.size).toBe(0);
      expect(adt.toString()).toBe('Empty');
    });

    test('ADTType with no type params toString', () => {
      const adt = new ADTType('Unit', [], new Map([['Value', new Map()]]));
      expect(adt.toString()).toBe('Unit');
    });

    test('ADTType getFieldType returns null for unknown fields', () => {
      const adt = new ADTType('Dummy', [], new Map());
      expect(adt.getFieldType('nonexistent')).toBe(null);
    });

    test('ADTType getFieldType searches across variants', () => {
      const fields1 = new Map([['x', Type.INT]]);
      const fields2 = new Map([['y', Type.FLOAT]]);
      const adt = new ADTType('Pair', [], new Map([['A', fields1], ['B', fields2]]));
      expect(adt.getFieldType('x')).toBe(Type.INT);
      expect(adt.getFieldType('y')).toBe(Type.FLOAT);
      expect(adt.getFieldType('z')).toBe(null);
    });

    test('ADTType equality only checks name', () => {
      const a1 = new ADTType('Foo', [], new Map());
      const a2 = new ADTType('Foo', ['T'], new Map([['X', new Map()]]));
      expect(a1.equals(a2)).toBe(true);
    });

    test('ADTType not equal to non-ADTType', () => {
      const adt = new ADTType('Foo', [], new Map());
      expect(adt.equals(Type.INT)).toBe(false);
      expect(adt.equals(new RecordType('Foo', new Map()))).toBe(false);
    });
  });

  // ── 8c. Types with type params ──

  describe('types with type params', () => {
    test('GenericType with no type args', () => {
      const g = new GenericType('Result', []);
      expect(g.toString()).toBe('Result');
      expect(g.base).toBe('Result');
      expect(g.typeArgs.length).toBe(0);
    });

    test('GenericType with type args', () => {
      const g = new GenericType('Result', [Type.INT, Type.STRING]);
      expect(g.toString()).toBe('Result<Int, String>');
    });

    test('GenericType assignable to same base with no args (gradual)', () => {
      const g1 = new GenericType('Result', [Type.INT, Type.STRING]);
      const g2 = new GenericType('Result', []);
      expect(g1.isAssignableTo(g2)).toBe(true);
      expect(g2.isAssignableTo(g1)).toBe(true);
    });

    test('GenericType not assignable to different base', () => {
      const g1 = new GenericType('Result', [Type.INT]);
      const g2 = new GenericType('Option', [Type.INT]);
      expect(g1.isAssignableTo(g2)).toBe(false);
    });

    test('ADTType with type params toString', () => {
      const adt = new ADTType('Tree', ['T'], new Map());
      expect(adt.toString()).toBe('Tree<T>');
    });

    test('ADTType with multiple type params', () => {
      const adt = new ADTType('Map', ['K', 'V'], new Map());
      expect(adt.toString()).toBe('Map<K, V>');
    });

    test('TypeVariable is assignable to anything', () => {
      const tv = new TypeVariable('T');
      expect(tv.isAssignableTo(Type.INT)).toBe(true);
      expect(tv.isAssignableTo(Type.STRING)).toBe(true);
      expect(tv.isAssignableTo(new GenericType('Result', []))).toBe(true);
    });

    test('TypeVariable equals only same-name TypeVariable', () => {
      const t1 = new TypeVariable('T');
      const t2 = new TypeVariable('T');
      const u = new TypeVariable('U');
      expect(t1.equals(t2)).toBe(true);
      expect(t1.equals(u)).toBe(false);
      expect(t1.equals(Type.INT)).toBe(false);
    });

    test('typeFromString parses generic type', () => {
      const t = typeFromString('Option<Int>');
      expect(t).toBeInstanceOf(GenericType);
      expect(t.base).toBe('Option');
      expect(t.typeArgs.length).toBe(1);
      expect(t.typeArgs[0].toString()).toBe('Int');
    });

    test('typeFromString parses multi-param generic', () => {
      const t = typeFromString('Result<Int, String>');
      expect(t).toBeInstanceOf(GenericType);
      expect(t.base).toBe('Result');
      expect(t.typeArgs.length).toBe(2);
      expect(t.typeArgs[0].toString()).toBe('Int');
      expect(t.typeArgs[1].toString()).toBe('String');
    });

    test('GenericType getFieldType returns null (delegates to registry)', () => {
      const g = new GenericType('Result', [Type.INT]);
      expect(g.getFieldType('value')).toBe(null);
    });
  });

  // ── 8d. Nested generics ──

  describe('nested generics', () => {
    test('typeFromString parses nested generic type', () => {
      const t = typeFromString('Result<Option<Int>, String>');
      expect(t).toBeInstanceOf(GenericType);
      expect(t.base).toBe('Result');
      expect(t.typeArgs.length).toBe(2);
      expect(t.typeArgs[0]).toBeInstanceOf(GenericType);
      expect(t.typeArgs[0].base).toBe('Option');
      expect(t.typeArgs[0].typeArgs[0].toString()).toBe('Int');
      expect(t.typeArgs[1].toString()).toBe('String');
    });

    test('deeply nested generic roundtrips through toString', () => {
      const inner = new GenericType('Option', [Type.INT]);
      const outer = new GenericType('Result', [inner, Type.STRING]);
      const str = outer.toString();
      expect(str).toBe('Result<Option<Int>, String>');

      // Re-parse the string
      const reparsed = typeFromString(str);
      expect(reparsed).toBeInstanceOf(GenericType);
      expect(reparsed.base).toBe('Result');
      expect(reparsed.typeArgs[0]).toBeInstanceOf(GenericType);
      expect(reparsed.typeArgs[0].base).toBe('Option');
    });

    test('GenericType equality with nested args', () => {
      const t1 = new GenericType('Result', [
        new GenericType('Option', [Type.INT]),
        Type.STRING,
      ]);
      const t2 = new GenericType('Result', [
        new GenericType('Option', [Type.INT]),
        Type.STRING,
      ]);
      const t3 = new GenericType('Result', [
        new GenericType('Option', [Type.FLOAT]),
        Type.STRING,
      ]);
      expect(t1.equals(t2)).toBe(true);
      expect(t1.equals(t3)).toBe(false);
    });

    test('nested generic assignability', () => {
      const t1 = new GenericType('Result', [
        new GenericType('Option', [Type.INT]),
        Type.STRING,
      ]);
      const t2 = new GenericType('Result', []); // bare Result
      expect(t1.isAssignableTo(t2)).toBe(true); // gradual typing
    });

    test('typeFromString handles triple nesting', () => {
      const t = typeFromString('List<Result<Option<Int>, String>>');
      expect(t).toBeInstanceOf(GenericType);
      expect(t.base).toBe('List');
      expect(t.typeArgs[0]).toBeInstanceOf(GenericType);
      expect(t.typeArgs[0].base).toBe('Result');
      expect(t.typeArgs[0].typeArgs[0]).toBeInstanceOf(GenericType);
      expect(t.typeArgs[0].typeArgs[0].base).toBe('Option');
    });

    test('typeFromString parses array type', () => {
      const t = typeFromString('[Int]');
      expect(t).toBeInstanceOf(ArrayType);
      expect(t.elementType.toString()).toBe('Int');
    });

    test('typeFromString parses nested array type', () => {
      const t = typeFromString('[[Int]]');
      expect(t).toBeInstanceOf(ArrayType);
      expect(t.elementType).toBeInstanceOf(ArrayType);
      expect(t.elementType.elementType.toString()).toBe('Int');
    });

    test('typeFromString parses tuple type', () => {
      const t = typeFromString('(Int, String)');
      expect(t).toBeInstanceOf(TupleType);
      expect(t.elementTypes.length).toBe(2);
    });

    test('typeFromString parses wildcard', () => {
      const t = typeFromString('_');
      expect(t).toBeInstanceOf(UnknownType);
    });
  });

  // ── 8e. Union types ──

  describe('union types', () => {
    test('UnionType assignable if all members assignable', () => {
      const union = new UnionType([Type.INT, Type.FLOAT]);
      expect(union.isAssignableTo(Type.ANY)).toBe(true);
    });

    test('UnionType not assignable if any member incompatible', () => {
      const union = new UnionType([Type.INT, Type.STRING]);
      expect(union.isAssignableTo(Type.INT)).toBe(false); // String not assignable to Int
    });

    test('UnionType toString', () => {
      const union = new UnionType([Type.INT, Type.STRING]);
      expect(union.toString()).toBe('Int | String');
    });

    test('UnionType equality', () => {
      const u1 = new UnionType([Type.INT, Type.STRING]);
      const u2 = new UnionType([Type.INT, Type.STRING]);
      const u3 = new UnionType([Type.INT, Type.BOOL]);
      expect(u1.equals(u2)).toBe(true);
      expect(u1.equals(u3)).toBe(false);
    });

    test('UnionType with single member', () => {
      const union = new UnionType([Type.INT]);
      expect(union.isAssignableTo(Type.INT)).toBe(true);
      expect(union.toString()).toBe('Int');
    });

    test('empty UnionType', () => {
      const union = new UnionType([]);
      expect(union.isAssignableTo(Type.ANY)).toBe(true);
      expect(union.toString()).toBe('');
    });
  });

  // ── 8f. RecordType ──

  describe('RecordType edge cases', () => {
    test('RecordType with fields', () => {
      const fields = new Map([['x', Type.INT], ['y', Type.FLOAT]]);
      const rec = new RecordType('Point', fields);
      expect(rec.getFieldType('x')).toBe(Type.INT);
      expect(rec.getFieldType('y')).toBe(Type.FLOAT);
      expect(rec.getFieldType('z')).toBe(null);
    });

    test('RecordType assignable to same name', () => {
      const r1 = new RecordType('Foo', new Map());
      const r2 = new RecordType('Foo', new Map());
      expect(r1.isAssignableTo(r2)).toBe(true);
    });

    test('RecordType not assignable to different name', () => {
      const r1 = new RecordType('Foo', new Map());
      const r2 = new RecordType('Bar', new Map());
      expect(r1.isAssignableTo(r2)).toBe(false);
    });

    test('RecordType assignable to PrimitiveType with same name', () => {
      const rec = new RecordType('Color', new Map());
      const prim = new PrimitiveType('Color');
      expect(rec.isAssignableTo(prim)).toBe(true);
    });

    test('RecordType assignable to GenericType with same name', () => {
      const rec = new RecordType('Result', new Map());
      const gen = new GenericType('Result', [Type.INT]);
      expect(rec.isAssignableTo(gen)).toBe(true);
    });

    test('RecordType toString returns name', () => {
      const rec = new RecordType('MyRecord', new Map());
      expect(rec.toString()).toBe('MyRecord');
    });
  });

  // ── 8g. FunctionType ──

  describe('FunctionType edge cases', () => {
    test('FunctionType defaults', () => {
      const ft = new FunctionType();
      expect(ft.paramTypes).toEqual([]);
      expect(ft.returnType).toBe(Type.ANY);
      expect(ft.toString()).toBe('Function');
    });

    test('FunctionType equality', () => {
      const f1 = new FunctionType([Type.INT], Type.STRING);
      const f2 = new FunctionType([Type.INT], Type.STRING);
      const f3 = new FunctionType([Type.STRING], Type.STRING);
      expect(f1.equals(f2)).toBe(true);
      expect(f1.equals(f3)).toBe(false);
    });

    test('FunctionType only assignable to same or Any', () => {
      const f = new FunctionType([Type.INT], Type.STRING);
      expect(f.isAssignableTo(Type.ANY)).toBe(true);
      expect(f.isAssignableTo(Type.INT)).toBe(false);
    });

    test('FunctionType with different return types not equal', () => {
      const f1 = new FunctionType([Type.INT], Type.STRING);
      const f2 = new FunctionType([Type.INT], Type.INT);
      expect(f1.equals(f2)).toBe(false);
    });

    test('FunctionType with different param counts not equal', () => {
      const f1 = new FunctionType([Type.INT], Type.STRING);
      const f2 = new FunctionType([Type.INT, Type.STRING], Type.STRING);
      expect(f1.equals(f2)).toBe(false);
    });
  });

  // ── 8h. Scope edge cases ──

  describe('Scope edge cases', () => {
    test('Scope.lookupLocal only finds in current scope', () => {
      const parent = new Scope(null, 'module');
      parent.define('x', new TSymbol('x', 'variable', null, false, { line: 1, column: 0, file: '<test>' }));

      const child = parent.child('function');
      expect(child.lookup('x')).not.toBeNull(); // found via parent
      expect(child.lookupLocal('x')).toBeNull(); // not in local scope
    });

    test('Scope.define throws on duplicate', () => {
      const scope = new Scope(null, 'module');
      scope.define('x', new TSymbol('x', 'variable', null, false, { line: 1, column: 0, file: '<test>' }));
      expect(() => {
        scope.define('x', new TSymbol('x', 'variable', null, false, { line: 2, column: 0, file: '<test>' }));
      }).toThrow(/already defined/);
    });

    test('Scope.getContext traverses up to server/client/shared', () => {
      const root = new Scope(null, 'module');
      const server = root.child('server');
      const fn = server.child('function');
      const block = fn.child('block');
      expect(block.getContext()).toBe('server');
    });

    test('Scope.getContext returns module for plain hierarchy', () => {
      const root = new Scope(null, 'module');
      const fn = root.child('function');
      const block = fn.child('block');
      expect(block.getContext()).toBe('module');
    });

    test('Scope.findScopeAtPosition returns null when out of range', () => {
      const scope = new Scope(null, 'module');
      scope.startLoc = { line: 1, column: 0 };
      scope.endLoc = { line: 10, column: 0 };
      // Position after end
      const result = scope.findScopeAtPosition(50, 0);
      expect(result).toBeNull();
    });

    test('Scope.lookup returns null for undefined symbol', () => {
      const scope = new Scope(null, 'module');
      expect(scope.lookup('nonexistent')).toBeNull();
    });
  });

  // ── 8i. typesCompatible bridge function ──

  describe('typesCompatible bridge function', () => {
    test('works with Type objects', () => {
      expect(typesCompatible(Type.INT, Type.INT)).toBe(true);
      expect(typesCompatible(Type.INT, Type.STRING)).toBe(false);
    });

    test('works with mixed Type and string', () => {
      expect(typesCompatible('Int', Type.INT)).toBe(true);
      expect(typesCompatible(Type.STRING, 'String')).toBe(true);
    });

    test('works with pure strings', () => {
      expect(typesCompatible('Int', 'Int')).toBe(true);
      expect(typesCompatible('Int', 'String')).toBe(false);
    });

    test('returns true for null args', () => {
      expect(typesCompatible(null, Type.INT)).toBe(true);
      expect(typesCompatible(Type.INT, null)).toBe(true);
    });

    test('AnyType compatible with anything', () => {
      expect(typesCompatible(Type.ANY, Type.INT)).toBe(true);
      expect(typesCompatible(Type.INT, Type.ANY)).toBe(true);
      expect(typesCompatible(Type.ANY, Type.ANY)).toBe(true);
    });

    test('UnknownType compatible with anything', () => {
      expect(typesCompatible(Type.UNKNOWN, Type.INT)).toBe(true);
      expect(typesCompatible(Type.INT, Type.UNKNOWN)).toBe(true);
    });
  });

  // ── 8j. ADT assignability edge cases ──

  describe('ADT assignability', () => {
    test('ADTType assignable to PrimitiveType with same name', () => {
      const adt = new ADTType('Color', [], new Map());
      const prim = new PrimitiveType('Color');
      expect(adt.isAssignableTo(prim)).toBe(true);
    });

    test('ADTType assignable to GenericType with same base', () => {
      const adt = new ADTType('Result', [], new Map());
      const gen = new GenericType('Result', [Type.INT, Type.STRING]);
      expect(adt.isAssignableTo(gen)).toBe(true);
    });

    test('GenericType assignable to ADTType with same name', () => {
      const gen = new GenericType('Result', [Type.INT]);
      const adt = new ADTType('Result', [], new Map());
      expect(gen.isAssignableTo(adt)).toBe(true);
    });

    test('GenericType assignable to PrimitiveType with same name', () => {
      const gen = new GenericType('Result', [Type.INT]);
      const prim = new PrimitiveType('Result');
      expect(gen.isAssignableTo(prim)).toBe(true);
    });

    test('ADTType not assignable to unrelated type', () => {
      const adt = new ADTType('Color', [], new Map());
      expect(adt.isAssignableTo(Type.INT)).toBe(false);
      expect(adt.isAssignableTo(Type.STRING)).toBe(false);
    });

    test('ADTType assignable to AnyType', () => {
      const adt = new ADTType('Color', [], new Map());
      expect(adt.isAssignableTo(Type.ANY)).toBe(true);
    });

    test('ADTType assignable to UnknownType', () => {
      const adt = new ADTType('Color', [], new Map());
      expect(adt.isAssignableTo(Type.UNKNOWN)).toBe(true);
    });
  });

  // ── 8k. NilType edge cases ──

  describe('NilType edge cases', () => {
    test('NilType equals only NilType', () => {
      expect(Type.NIL.equals(Type.NIL)).toBe(true);
      expect(Type.NIL.equals(new NilType())).toBe(true);
      expect(Type.NIL.equals(Type.INT)).toBe(false);
    });

    test('NilType not assignable to non-option types', () => {
      expect(Type.NIL.isAssignableTo(Type.INT)).toBe(false);
      expect(Type.NIL.isAssignableTo(Type.STRING)).toBe(false);
    });

    test('NilType assignable to NilType', () => {
      expect(Type.NIL.isAssignableTo(Type.NIL)).toBe(true);
    });

    test('NilType assignable to Any', () => {
      expect(Type.NIL.isAssignableTo(Type.ANY)).toBe(true);
    });

    test('NilType toString', () => {
      expect(Type.NIL.toString()).toBe('Nil');
    });
  });

  // ── 8l. AnyType and UnknownType ──

  describe('AnyType and UnknownType', () => {
    test('AnyType is assignable to everything', () => {
      expect(Type.ANY.isAssignableTo(Type.INT)).toBe(true);
      expect(Type.ANY.isAssignableTo(Type.STRING)).toBe(true);
      expect(Type.ANY.isAssignableTo(new ArrayType(Type.INT))).toBe(true);
    });

    test('AnyType equals only AnyType', () => {
      expect(Type.ANY.equals(Type.ANY)).toBe(true);
      expect(Type.ANY.equals(new AnyType())).toBe(true);
      expect(Type.ANY.equals(Type.INT)).toBe(false);
    });

    test('UnknownType is assignable to everything', () => {
      expect(Type.UNKNOWN.isAssignableTo(Type.INT)).toBe(true);
      expect(Type.UNKNOWN.isAssignableTo(Type.STRING)).toBe(true);
    });

    test('UnknownType equals only UnknownType', () => {
      expect(Type.UNKNOWN.equals(Type.UNKNOWN)).toBe(true);
      expect(Type.UNKNOWN.equals(new UnknownType())).toBe(true);
      expect(Type.UNKNOWN.equals(Type.INT)).toBe(false);
    });

    test('Base Type class defaults', () => {
      const t = new Type();
      expect(t.equals(Type.INT)).toBe(false);
      expect(t.isAssignableTo(Type.INT)).toBe(false);
      expect(t.toString()).toBe('unknown');
      expect(t.getFieldType('x')).toBe(null);
    });
  });
});
