import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function parseWithErrors(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  try {
    const ast = parser.parse();
    return { ast, errors: [] };
  } catch (err) {
    return { ast: err.partialAST, errors: err.errors || [err] };
  }
}

// ─── Block-level error recovery ─────────────────────────────

describe('Parser Error Recovery — Block Level', () => {
  test('recovers from error inside function body', () => {
    const { ast, errors } = parseWithErrors(`
      fn foo() {
        x = 1 +
        y = 2
      }
      fn bar() {
        return 42
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(ast).toBeDefined();
    // Both functions should be parsed
    const fns = ast.body.filter(n => n.type === 'FunctionDeclaration');
    expect(fns.length).toBe(2);
    expect(fns[0].name).toBe('foo');
    expect(fns[1].name).toBe('bar');
  });

  test('recovers from error and keeps valid statements in same block', () => {
    const { ast, errors } = parseWithErrors(`
      fn test_fn() {
        a = 10
        b = +
        c = 30
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(ast).toBeDefined();
    const fn = ast.body.find(n => n.type === 'FunctionDeclaration');
    expect(fn).toBeDefined();
    // Should have at least 2 valid statements (a = 10, c = 30)
    expect(fn.body.body.length).toBeGreaterThanOrEqual(2);
  });

  test('recovers in if/else blocks', () => {
    const { ast, errors } = parseWithErrors(`
      fn test_fn() {
        if true {
          x = 1 +
        } else {
          y = 2
        }
        z = 3
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(ast).toBeDefined();
    const fn = ast.body.find(n => n.type === 'FunctionDeclaration');
    expect(fn).toBeDefined();
  });

  test('multiple errors across functions', () => {
    const { ast, errors } = parseWithErrors(`
      fn a() {
        x = 1 +
      }
      fn b() {
        y = 2 *
      }
      fn c() {
        return 42
      }
    `);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(ast).toBeDefined();
    const fns = ast.body.filter(n => n.type === 'FunctionDeclaration');
    expect(fns.length).toBe(3);
  });

  test('top-level statements before error survive', () => {
    const { ast, errors } = parseWithErrors(`
      x = 10
      y = +
      z = 30
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(ast).toBeDefined();
    // x = 10 should survive; z = 30 may be consumed by top-level synchronize
    expect(ast.body.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Tolerant analyzer on partial ASTs ──────────────────────

describe('Tolerant Analyzer', () => {
  test('analyzes partial AST in tolerant mode', () => {
    const { ast } = parseWithErrors(`
      fn foo() {
        x = 1 +
        y = 2
      }
      fn bar() {
        return 42
      }
    `);
    expect(ast).toBeDefined();
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    // Should return results without throwing
    expect(result.warnings).toBeDefined();
    expect(result.scope).toBeDefined();
  });

  test('tolerant mode collects errors without throwing', () => {
    const lexer = new Lexer(`
      fn add(a: Int, b: Int) -> Int { a + b }
      add("hello", 5)
    `, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    const ast = parser.parse();
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    // Should have type errors but not throw
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.message.includes("expects Int, but got String"))).toBe(true);
  });
});

// ─── Server/browser/shared block recovery ─────────────────────

describe('Parser Error Recovery — Full-stack Blocks', () => {
  test('recovers in server block', () => {
    const { ast, errors } = parseWithErrors(`
      server {
        fn handler() {
          x = 1 +
        }
        fn other() {
          return "ok"
        }
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(ast).toBeDefined();
    const server = ast.body.find(n => n.type === 'ServerBlock');
    expect(server).toBeDefined();
  });

  test('recovers in browser block', () => {
    const { ast, errors } = parseWithErrors(`
      browser {
        fn render() {
          x = 1 +
        }
        fn init() {
          return true
        }
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(ast).toBeDefined();
    const browserBlock = ast.body.find(n => n.type === 'BrowserBlock');
    expect(browserBlock).toBeDefined();
  });

  test('recovers in shared block', () => {
    const { ast, errors } = parseWithErrors(`
      shared {
        fn validate() {
          x = 1 +
        }
        fn format() {
          return "ok"
        }
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(ast).toBeDefined();
    const shared = ast.body.find(n => n.type === 'SharedBlock');
    expect(shared).toBeDefined();
  });
});
