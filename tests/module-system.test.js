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
  try {
    const result = analyzer.analyze();
    return { errors: [], warnings: result.warnings, scope: result.scope };
  } catch (e) {
    return { errors: analyzer.errors, warnings: analyzer.warnings, thrown: e };
  }
}

function codegen(source) {
  const ast = parse(source);
  const gen = new BaseCodegen();
  return ast.body.map(stmt => gen.generateStatement(stmt)).join('\n');
}

// ─── Parser: Wildcard Imports ───────────────────────────────────

describe('Module System — Parser', () => {
  test('parses wildcard import: import * as utils from "utils.js"', () => {
    const ast = parse('import * as utils from "utils.js"');
    expect(ast.body.length).toBe(1);
    const node = ast.body[0];
    expect(node.type).toBe('ImportWildcard');
    expect(node.local).toBe('utils');
    expect(node.source).toBe('utils.js');
  });

  test('parses wildcard import with .tova source', () => {
    const ast = parse('import * as math from "./math.tova"');
    const node = ast.body[0];
    expect(node.type).toBe('ImportWildcard');
    expect(node.local).toBe('math');
    expect(node.source).toBe('./math.tova');
  });

  test('pub fn parsed with isPublic flag', () => {
    const ast = parse('pub fn greet(name) { print(name) }');
    expect(ast.body[0].type).toBe('FunctionDeclaration');
    expect(ast.body[0].isPublic).toBe(true);
    expect(ast.body[0].name).toBe('greet');
  });

  test('non-pub fn has no isPublic flag', () => {
    const ast = parse('fn helper() { 1 }');
    expect(ast.body[0].type).toBe('FunctionDeclaration');
    expect(ast.body[0].isPublic).toBeUndefined();
  });

  test('pub assignment parsed with isPublic flag', () => {
    const ast = parse('pub MAX = 100');
    expect(ast.body[0].type).toBe('Assignment');
    expect(ast.body[0].isPublic).toBe(true);
  });

  test('pub var parsed with isPublic flag', () => {
    const ast = parse('pub var counter = 0');
    expect(ast.body[0].type).toBe('VarDeclaration');
    expect(ast.body[0].isPublic).toBe(true);
  });

  test('pub type parsed with isPublic flag', () => {
    const ast = parse('pub type Color { Red, Green, Blue }');
    expect(ast.body[0].type).toBe('TypeDeclaration');
    expect(ast.body[0].isPublic).toBe(true);
  });

  test('pub interface parsed with isPublic flag', () => {
    const ast = parse('pub interface Drawable { fn draw() -> String }');
    expect(ast.body[0].type).toBe('InterfaceDeclaration');
    expect(ast.body[0].isPublic).toBe(true);
  });

  test('named import still works', () => {
    const ast = parse('import { foo, bar } from "module.js"');
    expect(ast.body[0].type).toBe('ImportDeclaration');
    expect(ast.body[0].specifiers.length).toBe(2);
  });

  test('default import still works', () => {
    const ast = parse('import React from "react"');
    expect(ast.body[0].type).toBe('ImportDefault');
    expect(ast.body[0].local).toBe('React');
  });
});

// ─── Codegen: export prefix for pub ─────────────────────────────

describe('Module System — Codegen (pub exports)', () => {
  test('pub fn generates export function', () => {
    const output = codegen('pub fn add(a, b) { a + b }');
    expect(output).toContain('export function add(a, b)');
  });

  test('non-pub fn does NOT generate export', () => {
    const output = codegen('fn helper(x) { x }');
    expect(output).not.toContain('export');
    expect(output).toContain('function helper(x)');
  });

  test('pub async fn generates export async function', () => {
    const output = codegen('pub async fn fetch_data(url) { await fetch(url) }');
    expect(output).toContain('export async function fetch_data(url)');
  });

  test('pub assignment generates export const', () => {
    const output = codegen('pub MAX = 100');
    expect(output).toContain('export const MAX = 100;');
  });

  test('non-pub assignment does NOT generate export', () => {
    const output = codegen('secret = 42');
    expect(output).not.toContain('export');
    expect(output).toContain('const secret = 42;');
  });

  test('pub var generates export let', () => {
    const output = codegen('pub var counter = 0');
    expect(output).toContain('export let counter = 0;');
  });

  test('non-pub var does NOT generate export', () => {
    const output = codegen('var counter = 0');
    expect(output).not.toContain('export');
    expect(output).toContain('let counter = 0;');
  });

  test('pub type (record) generates export function constructor', () => {
    const output = codegen('pub type Point { x: Int, y: Int }');
    expect(output).toContain('export function Point(x, y)');
  });

  test('non-pub type does NOT generate export', () => {
    const output = codegen('type Point { x: Int, y: Int }');
    expect(output).not.toContain('export');
    expect(output).toContain('function Point(x, y)');
  });

  test('pub type (variants) generates export for each variant', () => {
    const output = codegen('pub type Shape { Circle(radius: Float), Square(side: Float) }');
    expect(output).toContain('export function Circle(radius)');
    expect(output).toContain('export function Square(side)');
  });

  test('pub type (variant with no fields) generates export const', () => {
    const output = codegen('pub type Color { Red, Green, Blue }');
    expect(output).toContain('export const Red = Object.freeze');
    expect(output).toContain('export const Green = Object.freeze');
    expect(output).toContain('export const Blue = Object.freeze');
  });

  test('pub interface generates export comment', () => {
    const output = codegen('pub interface Showable { fn show() -> String }');
    expect(output).toContain('export interface Showable');
  });

  test('pub type alias generates export comment', () => {
    const output = codegen('pub type Url = String');
    expect(output).toContain('export type alias');
  });
});

// ─── Codegen: wildcard import ───────────────────────────────────

describe('Module System — Codegen (wildcard imports)', () => {
  test('generates import * as for wildcard import', () => {
    const output = codegen('import * as utils from "utils.js"');
    expect(output).toBe('import * as utils from "utils.js";');
  });

  test('generates import * as for .tova source', () => {
    const output = codegen('import * as math from "./math.tova"');
    expect(output).toBe('import * as math from "./math.tova";');
  });
});

// ─── Analyzer: wildcard import scope ────────────────────────────

describe('Module System — Analyzer', () => {
  test('wildcard import registers namespace binding in scope', () => {
    const result = analyze('import * as myutils from "utils.js"\nmyutils');
    expect(result.errors.length).toBe(0);
  });

  test('wildcard import does not shadow other imports', () => {
    const result = analyze(`
      import * as myutils from "utils.js"
      import { foo } from "bar.js"
      myutils
      foo
    `);
    expect(result.errors.length).toBe(0);
  });

  test('duplicate wildcard import name errors', () => {
    const result = analyze(`
      import * as myutils from "a.js"
      import * as myutils from "b.js"
    `);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('pub declarations analyzed without errors', () => {
    const result = analyze(`
      pub fn greet(name) { print(name) }
      pub MAX_SIZE = 100
    `);
    expect(result.errors.length).toBe(0);
  });
});

// ─── Integration: mixed pub and private ─────────────────────────

describe('Module System — Integration', () => {
  test('mix of pub and non-pub declarations', () => {
    const source = `
pub fn public_fn(x) { x + 1 }
fn private_fn(y) { y * 2 }
pub MAX = 100
secret = 42
pub type Color { Red, Green, Blue }
type Internal { data: String }
`;
    const output = codegen(source);
    // pub items get export
    expect(output).toContain('export function public_fn(x)');
    expect(output).toContain('export const MAX = 100;');
    expect(output).toContain('export const Red');
    expect(output).toContain('export const Green');
    expect(output).toContain('export const Blue');
    // non-pub items do NOT get export
    expect(output).not.toContain('export function private_fn');
    expect(output).not.toContain('export const secret');
    expect(output).not.toContain('export function Internal');
    // but they still exist
    expect(output).toContain('function private_fn');
    expect(output).toContain('const secret');
    expect(output).toContain('function Internal');
  });

  test('all import styles coexist', () => {
    const source = `
import { foo } from "a.js"
import Bar from "b.js"
import * as myutils from "c.js"
`;
    const output = codegen(source);
    expect(output).toContain('import { foo } from "a.js";');
    expect(output).toContain('import Bar from "b.js";');
    expect(output).toContain('import * as myutils from "c.js";');
  });

  test('pub fn with complex body generates correctly', () => {
    const source = `
pub fn fibonacci(n) {
  if n <= 1 {
    return n
  }
  return fibonacci(n - 1) + fibonacci(n - 2)
}
`;
    const output = codegen(source);
    expect(output).toContain('export function fibonacci(n)');
    expect(output).toContain('fibonacci');
    expect(output).toContain('return');
  });
});
