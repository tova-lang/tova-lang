// Tests for re-exports: pub { a, b } from "module", pub * from "module"
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

// ─── Parser Tests ───────────────────────────────────────────────

describe('Re-exports — Parser', () => {
  test('named re-export: pub { foo } from "module"', () => {
    const ast = parse('pub { foo } from "module"');
    const node = ast.body[0];
    expect(node.type).toBe('ReExportDeclaration');
    expect(node.source).toBe('module');
    expect(node.specifiers).toHaveLength(1);
    expect(node.specifiers[0].imported).toBe('foo');
    expect(node.specifiers[0].exported).toBe('foo');
  });

  test('multiple named re-exports', () => {
    const ast = parse('pub { foo, bar, baz } from "utils"');
    const node = ast.body[0];
    expect(node.type).toBe('ReExportDeclaration');
    expect(node.source).toBe('utils');
    expect(node.specifiers).toHaveLength(3);
    expect(node.specifiers[0].imported).toBe('foo');
    expect(node.specifiers[1].imported).toBe('bar');
    expect(node.specifiers[2].imported).toBe('baz');
  });

  test('aliased re-export: pub { foo as bar } from "module"', () => {
    const ast = parse('pub { foo as bar } from "module"');
    const node = ast.body[0];
    expect(node.specifiers[0].imported).toBe('foo');
    expect(node.specifiers[0].exported).toBe('bar');
  });

  test('mixed aliases and direct re-exports', () => {
    const ast = parse('pub { alpha, beta as renamed, gamma } from "lib"');
    const node = ast.body[0];
    expect(node.specifiers).toHaveLength(3);
    expect(node.specifiers[0].imported).toBe('alpha');
    expect(node.specifiers[0].exported).toBe('alpha');
    expect(node.specifiers[1].imported).toBe('beta');
    expect(node.specifiers[1].exported).toBe('renamed');
    expect(node.specifiers[2].imported).toBe('gamma');
    expect(node.specifiers[2].exported).toBe('gamma');
  });

  test('wildcard re-export: pub * from "module"', () => {
    const ast = parse('pub * from "module"');
    const node = ast.body[0];
    expect(node.type).toBe('ReExportDeclaration');
    expect(node.specifiers).toBeNull();
    expect(node.source).toBe('module');
  });

  test('re-export does not interfere with pub fn', () => {
    const ast = parse('pub fn foo() { 1 }');
    const node = ast.body[0];
    expect(node.type).toBe('FunctionDeclaration');
    expect(node.isPublic).toBe(true);
  });

  test('re-export does not interfere with pub type', () => {
    const ast = parse('pub type Color { Red, Green, Blue }');
    const node = ast.body[0];
    expect(node.type).toBe('TypeDeclaration');
    expect(node.isPublic).toBe(true);
  });

  test('re-export alongside other declarations', () => {
    const ast = parse(`
      pub fn helper() { 1 }
      pub { add, subtract } from "./math"
      pub * from "./utils"
    `);
    expect(ast.body[0].type).toBe('FunctionDeclaration');
    expect(ast.body[0].isPublic).toBe(true);
    expect(ast.body[1].type).toBe('ReExportDeclaration');
    expect(ast.body[1].specifiers).toHaveLength(2);
    expect(ast.body[2].type).toBe('ReExportDeclaration');
    expect(ast.body[2].specifiers).toBeNull();
  });

  test('re-export specifier has location info', () => {
    const ast = parse('pub { foo } from "mod"');
    const spec = ast.body[0].specifiers[0];
    expect(spec.type).toBe('ReExportSpecifier');
    expect(spec.loc).toBeDefined();
  });

  test('trailing comma in re-export list', () => {
    const ast = parse('pub { foo, bar, } from "mod"');
    const node = ast.body[0];
    expect(node.specifiers).toHaveLength(2);
    expect(node.specifiers[0].imported).toBe('foo');
    expect(node.specifiers[1].imported).toBe('bar');
  });
});

// ─── Codegen Tests ──────────────────────────────────────────────

describe('Re-exports — Codegen', () => {
  test('named re-export generates JS', () => {
    const code = compile('pub { foo } from "module"');
    expect(code).toContain('export { foo } from "module"');
  });

  test('multiple named re-exports', () => {
    const code = compile('pub { foo, bar } from "utils"');
    expect(code).toContain('export { foo, bar } from "utils"');
  });

  test('aliased re-export generates JS with as', () => {
    const code = compile('pub { foo as bar } from "module"');
    expect(code).toContain('export { foo as bar } from "module"');
  });

  test('wildcard re-export generates JS', () => {
    const code = compile('pub * from "module"');
    expect(code).toContain('export * from "module"');
  });

  test('mixed re-exports and declarations', () => {
    const code = compile(`
      pub fn add(a, b) { a + b }
      pub { subtract } from "./math"
    `);
    expect(code).toContain('export function add');
    expect(code).toContain('export { subtract } from "./math"');
  });
});

// ─── Analyzer Tests ─────────────────────────────────────────────

describe('Re-exports — Analyzer', () => {
  test('re-export does not define local symbols', () => {
    // Re-exported names should not be available locally
    const result = analyze(`
      pub { foo } from "module"
      foo
    `);
    // Should warn about undefined 'foo' since re-exports don't add to scope
    const undefinedWarns = result.warnings.filter(w =>
      w.message.includes('foo') && w.message.includes('not defined')
    );
    expect(undefinedWarns.length).toBeGreaterThan(0);
  });

  test('analyzer does not crash on re-export', () => {
    expect(() => analyze('pub { a, b } from "mod"')).not.toThrow();
  });

  test('analyzer does not crash on wildcard re-export', () => {
    expect(() => analyze('pub * from "mod"')).not.toThrow();
  });
});

// ─── Barrel Export Pattern ──────────────────────────────────────

describe('Re-exports — Barrel Export Pattern', () => {
  test('barrel file pattern compiles correctly', () => {
    const code = compile(`
      pub * from "./types"
      pub { createUser, deleteUser } from "./users"
      pub { auth as authenticate } from "./auth"
    `);
    expect(code).toContain('export * from "./types"');
    expect(code).toContain('export { createUser, deleteUser } from "./users"');
    expect(code).toContain('export { auth as authenticate } from "./auth"');
  });
});
