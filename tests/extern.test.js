import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { BaseCodegen } from '../src/codegen/base-codegen.js';

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function analyze(source) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze();
}

function getWarnings(source) {
  return analyze(source).warnings;
}

function codegen(source) {
  const ast = parse(source);
  const gen = new BaseCodegen();
  return ast.body.map(stmt => gen.generateStatement(stmt)).join('\n');
}

// ─── Parsing ──────────────────────────────────────────────────

describe('Extern Declarations — Parsing', () => {
  test('parses basic extern fn declaration', () => {
    const ast = parse('extern fn fetch(url: String) -> Response');
    expect(ast.body.length).toBe(1);
    expect(ast.body[0].type).toBe('ExternDeclaration');
    expect(ast.body[0].name).toBe('fetch');
    expect(ast.body[0].params.length).toBe(1);
    expect(ast.body[0].params[0].name).toBe('url');
    expect(ast.body[0].returnType.name).toBe('Response');
  });

  test('parses extern fn with multiple params', () => {
    const ast = parse('extern fn add(a: Int, b: Int) -> Int');
    const decl = ast.body[0];
    expect(decl.type).toBe('ExternDeclaration');
    expect(decl.params.length).toBe(2);
    expect(decl.params[0].typeAnnotation.name).toBe('Int');
    expect(decl.params[1].typeAnnotation.name).toBe('Int');
    expect(decl.returnType.name).toBe('Int');
  });

  test('parses extern async fn', () => {
    const ast = parse('extern async fn fetch(url: String) -> Promise<Response>');
    const decl = ast.body[0];
    expect(decl.type).toBe('ExternDeclaration');
    expect(decl.isAsync).toBe(true);
    expect(decl.name).toBe('fetch');
    expect(decl.returnType.name).toBe('Promise');
    expect(decl.returnType.typeParams.length).toBe(1);
  });

  test('parses extern fn with no params', () => {
    const ast = parse('extern fn now() -> Int');
    const decl = ast.body[0];
    expect(decl.params.length).toBe(0);
    expect(decl.returnType.name).toBe('Int');
  });

  test('parses extern fn with no return type', () => {
    const ast = parse('extern fn log(msg: String)');
    const decl = ast.body[0];
    expect(decl.returnType).toBe(null);
  });

  test('parses extern fn with generic return type', () => {
    const ast = parse('extern fn parse_json(s: String) -> Result<Any, String>');
    const decl = ast.body[0];
    expect(decl.returnType.name).toBe('Result');
    expect(decl.returnType.typeParams.length).toBe(2);
  });
});

// ─── Analyzer ─────────────────────────────────────────────────

describe('Extern Declarations — Analyzer', () => {
  test('registers extern function in scope', () => {
    // Should not produce "undefined identifier" warning
    const warnings = getWarnings(`
      extern fn fetch(url: String) -> Response
      fetch("https://example.com")
    `);
    expect(warnings.some(w => w.message.includes("'fetch'") && w.message.includes('undefined'))).toBe(false);
  });

  test('type checks calls to extern functions (now errors)', () => {
    expect(() => analyze(`
      extern fn add(a: Int, b: Int) -> Int
      add("hello", 5)
    `)).toThrow("'a' expects Int, but got String");
  });

  test('checks argument count for extern functions', () => {
    const warnings = getWarnings(`
      extern fn add(a: Int, b: Int) -> Int
      add(1, 2, 3)
    `);
    expect(warnings.some(w => w.message.includes("expects 2 arguments"))).toBe(true);
  });

  test('no warning for correct extern usage', () => {
    const warnings = getWarnings(`
      extern fn add(a: Int, b: Int) -> Int
      add(1, 2)
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });

  test('extern async fn is registered', () => {
    const warnings = getWarnings(`
      extern async fn fetch(url: String) -> Promise<Response>
      fetch("https://example.com")
    `);
    expect(warnings.some(w => w.message.includes("'fetch'") && w.message.includes('undefined'))).toBe(false);
  });
});

// ─── Codegen ──────────────────────────────────────────────────

describe('Extern Declarations — Codegen', () => {
  test('produces no runtime code (only comment)', () => {
    const output = codegen('extern fn fetch(url: String) -> Response');
    expect(output).toContain('// extern: fetch');
    expect(output).not.toContain('function fetch');
  });

  test('multiple extern declarations produce only comments', () => {
    const output = codegen(`
      extern fn fetch(url: String) -> Response
      extern fn log(msg: String)
    `);
    expect(output).toContain('// extern: fetch');
    expect(output).toContain('// extern: log');
  });
});
