import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { collectExports } from '../src/cli/compile.js';

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
  const result = analyzer.analyze();
  return [...result.warnings, ...result.errors];
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

// ─── Codegen Tests ──────────────────────────────────────────

describe('Export keyword — Codegen', () => {
  test('export fn compiles to export function', () => {
    const out = compile('export fn add(a, b) { a + b }');
    expect(out).toContain('export function add');
  });

  test('export type compiles to export', () => {
    const out = compile('export type Color { Red, Green, Blue }');
    expect(out).toContain('export');
  });

  test('export default fn compiles correctly', () => {
    const out = compile('export default fn main() { "hello" }');
    expect(out).toContain('export default function main');
  });

  test('export default expression compiles correctly', () => {
    const out = compile('x = 42\nexport default x');
    expect(out).toContain('export default x;');
  });

  test('export default async fn compiles correctly', () => {
    const out = compile('export default async fn handler() { await 1 }');
    expect(out).toContain('export default async function handler');
  });

  test('export list compiles to JS export list', () => {
    const out = compile('fn add(a, b) { a + b }\nexport { add }');
    expect(out).toContain('export { add };');
  });

  test('export list with alias', () => {
    const out = compile('fn add(a, b) { a + b }\nexport { add as addition }');
    expect(out).toContain('export { add as addition };');
  });

  test('export list with multiple items', () => {
    const out = compile('fn a() { 1 }\nfn b() { 2 }\nexport { a, b }');
    expect(out).toContain('export { a, b };');
  });

  test('export re-export still works', () => {
    const out = compile('export { foo } from "utils"');
    expect(out).toContain('export { foo } from "utils";');
  });

  test('export wildcard re-export still works', () => {
    const out = compile('export * from "utils"');
    expect(out).toContain('export * from "utils";');
  });
});

// ─── Analyzer Tests ─────────────────────────────────────────

describe('Export keyword — Analyzer', () => {
  test('export fn analyzed without errors', () => {
    const warnings = analyze('export fn add(a, b) { a + b }');
    const errors = warnings.filter(w => w.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('export default analyzed without errors', () => {
    const warnings = analyze('export default fn main() { "hello" }');
    const errors = warnings.filter(w => w.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('export list marks symbols as public (no unused warnings)', () => {
    const warnings = analyze('fn add(a, b) { a + b }\nexport { add }');
    const unusedAdd = warnings.filter(w => w.message && w.message.includes('add') && w.message.includes('unused'));
    expect(unusedAdd).toHaveLength(0);
  });

  test('export list warns on undefined names', () => {
    const warnings = analyze('export { nonexistent }');
    const undef = warnings.filter(w => w.message && w.message.toLowerCase().includes('nonexistent'));
    expect(undef.length).toBeGreaterThan(0);
  });

  test('duplicate export default warns', () => {
    const warnings = analyze('export default fn a() { 1 }\nexport default fn b() { 2 }');
    const dupDefault = warnings.filter(w => w.code === 'W_DUPLICATE_DEFAULT_EXPORT');
    expect(dupDefault).toHaveLength(1);
  });

  test('mixed pub and export in same file', () => {
    const warnings = analyze('pub fn add(a, b) { a + b }\nexport fn sub(a, b) { a - b }');
    const errors = warnings.filter(w => w.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('export default inside server block warns', () => {
    const warnings = analyze('server { export default fn handler() { 1 } }');
    const blockErr = warnings.filter(w => w.code === 'W_EXPORT_NOT_MODULE_LEVEL');
    expect(blockErr.length).toBeGreaterThan(0);
  });

  test('export list inside browser block warns', () => {
    const warnings = analyze('browser { fn foo() { 1 }\nexport { foo } }');
    const blockErr = warnings.filter(w => w.code === 'W_EXPORT_NOT_MODULE_LEVEL');
    expect(blockErr.length).toBeGreaterThan(0);
  });
});

// ─── collectExports Tests ───────────────────────────────────

describe('Export keyword — collectExports', () => {
  test('ExportDefault adds "default" to publicExports', () => {
    const ast = parse('export default fn main() { 1 }');
    const { publicExports } = collectExports(ast, '<test-collect>');
    expect(publicExports.has('default')).toBe(true);
  });

  test('ExportList adds exported names to publicExports', () => {
    const ast = parse('fn add(a, b) { a + b }\nfn sub(a, b) { a - b }\nexport { add, sub }');
    const { publicExports } = collectExports(ast, '<test-collect>');
    expect(publicExports.has('add')).toBe(true);
    expect(publicExports.has('sub')).toBe(true);
  });

  test('ExportList with alias uses exported name', () => {
    const ast = parse('fn add(a, b) { a + b }\nexport { add as addition }');
    const { publicExports } = collectExports(ast, '<test-collect>');
    expect(publicExports.has('addition')).toBe(true);
  });
});

// ─── Integration Tests ──────────────────────────────────────

describe('Export keyword — Integration', () => {
  test('mixed pub and export in same file compiles', () => {
    const out = compile(`
      pub fn add(a, b) { a + b }
      export fn sub(a, b) { a - b }
      pub type Color { Red, Blue }
      export type Shape { Circle(r), Square(s) }
    `);
    expect(out).toContain('export function add');
    expect(out).toContain('export function sub');
  });

  test('export list after declarations', () => {
    const out = compile(`
      fn private_add(a, b) { a + b }
      fn private_sub(a, b) { a - b }
      export { private_add as add, private_sub as sub }
    `);
    expect(out).toContain('export { private_add as add, private_sub as sub }');
    expect(out).not.toContain('export function private_add');
  });

  test('export default with export list', () => {
    const out = compile(`
      fn helper() { 1 }
      export default fn main() { helper() }
      export { helper }
    `);
    expect(out).toContain('export default function main');
    expect(out).toContain('export { helper }');
  });

  test('pub { a, b } post-declaration works', () => {
    const out = compile(`
      fn foo() { 1 }
      fn bar() { 2 }
      pub { foo, bar }
    `);
    expect(out).toContain('export { foo, bar }');
  });
});
