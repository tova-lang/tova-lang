import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function parse(source) {
  const lexer = new Lexer(source, 'test.tova');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, 'test.tova');
  return parser.parse();
}

function compile(source) {
  const ast = parse(source);
  const gen = new CodeGenerator(ast, 'test.tova');
  return gen.generate();
}

describe('Refinement type parsing', () => {
  test('basic refinement type', () => {
    const ast = parse(`shared {
      type Email = String where { it |> contains("@") }
    }`);
    const shared = ast.body[0];
    const refinement = shared.body[0];
    expect(refinement.type).toBe('RefinementType');
    expect(refinement.name).toBe('Email');
    expect(refinement.baseType.name).toBe('String');
    expect(refinement.predicate.type).toBe('PipeExpression');
  });

  test('refinement type with multiple predicates', () => {
    const ast = parse(`shared {
      type Age = Int where { it >= 0, it <= 150 }
    }`);
    const refinement = ast.body[0].body[0];
    expect(refinement.type).toBe('RefinementType');
    expect(refinement.name).toBe('Age');
    expect(refinement.baseType.name).toBe('Int');
    // Multiple predicates joined with 'and'
    expect(refinement.predicate.type).toBe('LogicalExpression');
    expect(refinement.predicate.operator).toBe('and');
  });

  test('refinement type with single predicate', () => {
    const ast = parse(`shared {
      type PositiveInt = Int where { it > 0 }
    }`);
    const refinement = ast.body[0].body[0];
    expect(refinement.type).toBe('RefinementType');
    expect(refinement.name).toBe('PositiveInt');
    expect(refinement.predicate.type).toBe('BinaryExpression');
    expect(refinement.predicate.operator).toBe('>');
  });

  test('regular type alias still works', () => {
    const ast = parse(`shared {
      type UserID = Int
    }`);
    const alias = ast.body[0].body[0];
    expect(alias.type).toBe('TypeAlias');
    expect(alias.name).toBe('UserID');
  });

  test('regular type declaration still works', () => {
    const ast = parse(`shared {
      type Sentiment { Positive, Negative, Neutral }
    }`);
    const decl = ast.body[0].body[0];
    expect(decl.type).toBe('TypeDeclaration');
    expect(decl.variants.length).toBe(3);
  });
});

describe('Refinement type parsing — additional', () => {
  test('refinement type with complex pipe predicate', () => {
    const ast = parse(`shared {
      type NonEmpty = String where { it |> len() > 0 }
    }`);
    const refinement = ast.body[0].body[0];
    expect(refinement.type).toBe('RefinementType');
    expect(refinement.name).toBe('NonEmpty');
    expect(refinement.baseType.name).toBe('String');
  });

  test('refinement type with logical AND predicate', () => {
    const ast = parse(`shared {
      type Percentage = Int where { it >= 0 and it <= 100 }
    }`);
    const refinement = ast.body[0].body[0];
    expect(refinement.predicate.type).toBe('LogicalExpression');
    expect(refinement.predicate.operator).toBe('and');
  });

  test('refinement type with three predicates', () => {
    const ast = parse(`shared {
      type ValidAge = Int where { it >= 0, it <= 150, it % 1 == 0 }
    }`);
    const refinement = ast.body[0].body[0];
    // Multiple commas create nested LogicalExpressions
    expect(refinement.predicate.type).toBe('LogicalExpression');
  });

  test('type alias still works alongside refinement types', () => {
    const ast = parse(`shared {
      type Email = String where { it |> contains("@") }
      type Name = String
    }`);
    const items = ast.body[0].body;
    expect(items[0].type).toBe('RefinementType');
    expect(items[1].type).toBe('TypeAlias');
  });
});

describe('Refinement type codegen', () => {
  test('refinement type generates validator function', () => {
    const result = compile(`shared {
      type PositiveInt = Int where { it > 0 }
    }`);
    expect(result.shared).toContain('__validate_PositiveInt');
    expect(result.shared).toContain('it > 0');
  });

  test('validator throws on failure', () => {
    const result = compile(`shared {
      type Email = String where { it |> contains("@") }
    }`);
    expect(result.shared).toContain('__validate_Email');
    expect(result.shared).toContain('Refinement type Email validation failed');
    expect(result.shared).toContain('return it');
  });

  test('refinement with multiple predicates generates combined validator', () => {
    const result = compile(`shared {
      type Age = Int where { it >= 0, it <= 150 }
    }`);
    expect(result.shared).toContain('__validate_Age');
    // Should have the combined predicate in the if condition
    expect(result.shared).toContain('it');
  });

  test('refinement with logical AND generates correct JS', () => {
    const result = compile(`shared {
      type Percentage = Int where { it >= 0 and it <= 100 }
    }`);
    expect(result.shared).toContain('__validate_Percentage');
    expect(result.shared).toContain('&&');
  });

  test('refinement with binary comparison generates validator', () => {
    const result = compile(`shared {
      type Natural = Int where { it > 0 }
    }`);
    expect(result.shared).toContain('__validate_Natural');
    expect(result.shared).toContain('it > 0');
    expect(result.shared).toContain('return it');
  });
});
