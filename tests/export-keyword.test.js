import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function lex(src) {
  return new Lexer(src, '<test>').tokenize();
}

function parse(src) {
  const tokens = lex(src);
  return new Parser(tokens, '<test>').parse();
}

function compile(src) {
  const tokens = lex(src);
  const ast = new Parser(tokens, '<test>').parse();
  const gen = new CodeGenerator(ast, '<test>');
  return gen.generate().shared.trim();
}

function analyze(src) {
  const tokens = lex(src);
  const ast = new Parser(tokens, '<test>').parse();
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze();
}

// ─── Lexer Tests ─────────────────────────────────────────────

describe('Export keyword — Lexer', () => {
  test('lexes DEFAULT token', () => {
    const tokens = lex('default');
    expect(tokens[0].type).toBe('DEFAULT');
  });

  test('lexes EXPORT token', () => {
    const tokens = lex('export');
    expect(tokens[0].type).toBe('EXPORT');
  });
});

// ─── Parser Tests — export as pub alias ─────────────────────

describe('Export keyword — Parser (alias for pub)', () => {
  test('export fn produces same AST as pub fn', () => {
    const pubAst = parse('pub fn add(a, b) { a + b }');
    const exportAst = parse('export fn add(a, b) { a + b }');
    expect(exportAst.body[0].type).toBe('FunctionDeclaration');
    expect(exportAst.body[0].isPublic).toBe(true);
    expect(exportAst.body[0].name).toBe(pubAst.body[0].name);
  });

  test('export type works like pub type', () => {
    const ast = parse('export type Color { Red, Green, Blue }');
    expect(ast.body[0].type).toBe('TypeDeclaration');
    expect(ast.body[0].isPublic).toBe(true);
    expect(ast.body[0].name).toBe('Color');
  });

  test('export variable assignment', () => {
    const ast = parse('export x = 42');
    expect(ast.body[0].isPublic).toBe(true);
  });

  test('export async fn', () => {
    const ast = parse('export async fn fetch_data() { await 1 }');
    expect(ast.body[0].type).toBe('FunctionDeclaration');
    expect(ast.body[0].isPublic).toBe(true);
    expect(ast.body[0].isAsync).toBe(true);
  });

  test('export re-export with from', () => {
    const ast = parse('export { foo, bar } from "utils"');
    expect(ast.body[0].type).toBe('ReExportDeclaration');
    expect(ast.body[0].source).toBe('utils');
    expect(ast.body[0].specifiers).toHaveLength(2);
  });

  test('export wildcard re-export', () => {
    const ast = parse('export * from "utils"');
    expect(ast.body[0].type).toBe('ReExportDeclaration');
    expect(ast.body[0].specifiers).toBeNull();
    expect(ast.body[0].source).toBe('utils');
  });

  test('duplicate visibility modifier errors', () => {
    expect(() => parse('export export fn foo() { 1 }')).toThrow(/[Dd]uplicate/);
    expect(() => parse('pub export fn foo() { 1 }')).toThrow(/[Dd]uplicate/);
    expect(() => parse('export pub fn foo() { 1 }')).toThrow(/[Dd]uplicate/);
  });
});

// ─── Parser Tests — export default ──────────────────────────

describe('Export keyword — Parser (export default)', () => {
  test('export default fn', () => {
    const ast = parse('export default fn main() { "hello" }');
    const node = ast.body[0];
    expect(node.type).toBe('ExportDefault');
    expect(node.value.type).toBe('FunctionDeclaration');
    expect(node.value.name).toBe('main');
  });

  test('export default expression (identifier)', () => {
    const ast = parse('x = 42\nexport default x');
    const node = ast.body[1];
    expect(node.type).toBe('ExportDefault');
  });

  test('pub default is an error', () => {
    expect(() => parse('pub default fn foo() { 1 }')).toThrow(/export default.*not.*pub default/i);
  });

  test('export default type is an error', () => {
    expect(() => parse('export default type Color { Red, Blue }')).toThrow(/Cannot.*export default.*type/i);
  });

  test('export default async fn', () => {
    const ast = parse('export default async fn handler() { await 1 }');
    const node = ast.body[0];
    expect(node.type).toBe('ExportDefault');
    expect(node.value.type).toBe('FunctionDeclaration');
    expect(node.value.isAsync).toBe(true);
  });
});

// ─── Parser Tests — post-declaration export list ────────────

describe('Export keyword — Parser (export list)', () => {
  test('export { a, b } produces ExportList', () => {
    const ast = parse('fn add(a, b) { a + b }\nexport { add }');
    const node = ast.body[1];
    expect(node.type).toBe('ExportList');
    expect(node.specifiers).toHaveLength(1);
    expect(node.specifiers[0].local).toBe('add');
    expect(node.specifiers[0].exported).toBe('add');
  });

  test('pub { a, b } without from produces ExportList', () => {
    const ast = parse('fn foo() { 1 }\npub { foo }');
    const node = ast.body[1];
    expect(node.type).toBe('ExportList');
    expect(node.specifiers[0].local).toBe('foo');
  });

  test('export { a as b } aliased export list', () => {
    const ast = parse('fn add(a, b) { a + b }\nexport { add as addition }');
    const node = ast.body[1];
    expect(node.type).toBe('ExportList');
    expect(node.specifiers[0].local).toBe('add');
    expect(node.specifiers[0].exported).toBe('addition');
  });

  test('export list with multiple items', () => {
    const ast = parse('fn a() { 1 }\nfn b() { 2 }\nexport { a, b }');
    const node = ast.body[2];
    expect(node.type).toBe('ExportList');
    expect(node.specifiers).toHaveLength(2);
  });

  test('export { } from "mod" is still a re-export', () => {
    const ast = parse('export { foo } from "mod"');
    expect(ast.body[0].type).toBe('ReExportDeclaration');
  });
});
