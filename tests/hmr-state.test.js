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

function compile(source, isDev = false) {
  const ast = parse(source);
  const gen = new CodeGenerator(ast, 'test.tova', { isDev });
  return gen.generate();
}

// ════════════════════════════════════════════════════════════
// Dev-mode HMR state codegen
// ════════════════════════════════════════════════════════════

describe('HMR state preservation', () => {
  const todoApp = `
server {
  todos = []
  var counter = 0

  fn get_todos() { todos }
  route GET "/todos" => get_todos
}`;

  test('dev mode emits __hmrState preamble', () => {
    const output = compile(todoApp, true);
    expect(output.server).toContain('const __hmrStatePath = process.env.__TOVA_HMR_STATE_PATH || ""');
    expect(output.server).toContain('let __hmrState = {}');
    expect(output.server).toContain('__hmrState = JSON.parse(require("fs").readFileSync(__hmrStatePath, "utf-8"))');
  });

  test('dev mode wraps variable declarations with __hmrState ternary', () => {
    const output = compile(todoApp, true);
    expect(output.server).toContain('("todos" in __hmrState) ? __hmrState["todos"] : []');
    expect(output.server).toContain('("counter" in __hmrState) ? __hmrState["counter"] : 0');
  });

  test('dev mode uses let for mutable variables', () => {
    const output = compile(todoApp, true);
    expect(output.server).toMatch(/let counter = \("counter" in __hmrState\)/);
  });

  test('dev mode uses const for immutable variables', () => {
    const output = compile(todoApp, true);
    expect(output.server).toMatch(/const todos = \("todos" in __hmrState\)/);
  });

  test('dev mode injects state-save into __shutdown', () => {
    const output = compile(todoApp, true);
    expect(output.server).toContain('writeFileSync(__hmrStatePath');
    expect(output.server).toContain('"todos": todos');
    expect(output.server).toContain('"counter": counter');
  });

  test('non-dev mode does NOT emit __hmrState', () => {
    const output = compile(todoApp, false);
    expect(output.server).not.toContain('__hmrState');
    expect(output.server).not.toContain('__hmrStatePath');
  });

  test('non-dev mode emits standard variable declarations', () => {
    const output = compile(todoApp, false);
    expect(output.server).toContain('const todos = []');
    expect(output.server).toContain('let counter = 0');
  });

  test('type declarations are NOT wrapped', () => {
    const source = `
server {
  type Todo { title: String, done: Bool }
  items = []

  fn get_items() { items }
  route GET "/items" => get_items
}`;
    const output = compile(source, true);
    // Type should be emitted normally (as constructor function)
    expect(output.server).toContain('function Todo(');
    // items should be wrapped
    expect(output.server).toContain('("items" in __hmrState) ? __hmrState["items"] : []');
  });

  test('function declarations are NOT wrapped', () => {
    const source = `
server {
  items = []

  fn helper(x) { x + 1 }
  fn get_items() { items }
  route GET "/items" => get_items
}`;
    const output = compile(source, true);
    // Function should be emitted normally
    expect(output.server).toContain('function helper(');
    // items should be wrapped
    expect(output.server).toContain('("items" in __hmrState) ? __hmrState["items"] : []');
  });

  test('string and numeric initializers are preserved', () => {
    const source = `
server {
  name = "My App"
  version = 42

  fn get_info() { { name: name, version: version } }
  route GET "/" => get_info
}`;
    const output = compile(source, true);
    expect(output.server).toContain('("name" in __hmrState) ? __hmrState["name"] : "My App"');
    expect(output.server).toContain('("version" in __hmrState) ? __hmrState["version"] : 42');
  });

  test('object initializers are preserved', () => {
    const source = `
server {
  config = { host: "localhost", port: 8080 }

  fn get_config() { config }
  route GET "/" => get_config
}`;
    const output = compile(source, true);
    expect(output.server).toContain('("config" in __hmrState) ? __hmrState["config"]');
  });

  test('state-save in shutdown includes all HMR vars', () => {
    const source = `
server {
  a = 1
  b = "hello"
  var c = []

  fn handler() { {} }
  route GET "/" => handler
}`;
    const output = compile(source, true);
    expect(output.server).toContain('"a": a');
    expect(output.server).toContain('"b": b');
    expect(output.server).toContain('"c": c');
  });
});
