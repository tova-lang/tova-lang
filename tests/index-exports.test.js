import { describe, test, expect } from "bun:test";
import * as TovaMod from '../src/index.js';
import { VERSION } from '../src/version.js';

describe('Public API exports', () => {
  test('Lexer is exported and is a class', () => {
    expect(TovaMod.Lexer).toBeDefined();
    expect(typeof TovaMod.Lexer).toBe('function');
  });

  test('TokenType is exported', () => {
    expect(TovaMod.TokenType).toBeDefined();
    expect(typeof TovaMod.TokenType).toBe('object');
    expect(TovaMod.TokenType.IDENTIFIER).toBeDefined();
    expect(TovaMod.TokenType.NUMBER).toBeDefined();
  });

  test('Token is exported', () => {
    expect(TovaMod.Token).toBeDefined();
    expect(typeof TovaMod.Token).toBe('function');
  });

  test('Keywords is exported', () => {
    expect(TovaMod.Keywords).toBeDefined();
    expect(typeof TovaMod.Keywords).toBe('object');
  });

  test('Parser is exported and is a class', () => {
    expect(TovaMod.Parser).toBeDefined();
    expect(typeof TovaMod.Parser).toBe('function');
  });

  test('Analyzer is exported and is a class', () => {
    expect(TovaMod.Analyzer).toBeDefined();
    expect(typeof TovaMod.Analyzer).toBe('function');
  });

  test('CodeGenerator is exported and is a class', () => {
    expect(TovaMod.CodeGenerator).toBeDefined();
    expect(typeof TovaMod.CodeGenerator).toBe('function');
  });

  test('AST node classes are exported', () => {
    expect(TovaMod.Program).toBeDefined();
    expect(TovaMod.ServerBlock).toBeDefined();
    expect(TovaMod.ClientBlock).toBeDefined();
    expect(TovaMod.SharedBlock).toBeDefined();
    expect(TovaMod.Assignment).toBeDefined();
    expect(TovaMod.FunctionDeclaration).toBeDefined();
    expect(TovaMod.IfStatement).toBeDefined();
    expect(TovaMod.MatchExpression).toBeDefined();
    expect(TovaMod.JSXElement).toBeDefined();
    expect(TovaMod.RouteDeclaration).toBeDefined();
    expect(TovaMod.TypeDeclaration).toBeDefined();
    expect(TovaMod.InterfaceDeclaration).toBeDefined();
  });

  test('PIPE_TARGET sentinel is exported', () => {
    expect(TovaMod.PIPE_TARGET).toBe('__pipe_target__');
  });
});

describe('Version module', () => {
  test('VERSION is a valid semver string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('VERSION is defined and non-empty', () => {
    expect(VERSION.length).toBeGreaterThan(0);
  });
});

describe('Full pipeline integration', () => {
  test('Lexer → Parser → Analyzer → CodeGenerator works end-to-end', () => {
    const { Lexer, Parser, Analyzer, CodeGenerator } = TovaMod;

    const source = 'shared { x = 1 + 2 }';
    const lexer = new Lexer(source, '<test>');
    const tokens = lexer.tokenize();
    expect(tokens.length).toBeGreaterThan(0);

    const parser = new Parser(tokens, '<test>');
    const ast = parser.parse();
    expect(ast.type).toBe('Program');
    expect(ast.body.length).toBeGreaterThan(0);

    const analyzer = new Analyzer(ast, '<test>');
    analyzer.analyze();
    expect(Array.isArray(analyzer.warnings)).toBe(true);

    const codegen = new CodeGenerator(ast, '<test>');
    const result = codegen.generate();
    expect(result).toBeDefined();
  });
});
