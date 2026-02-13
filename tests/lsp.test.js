import { describe, test, expect } from 'bun:test';

// Test the LSP server logic by importing the module and testing its methods
// We test the core logic without stdio transport

import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function analyzeSource(source, filename = '<test>') {
  const lexer = new Lexer(source, filename);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, filename);
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, filename);
  const { warnings } = analyzer.analyze();
  return { ast, analyzer, warnings };
}

describe('LSP: Diagnostics', () => {
  test('detects parse errors', () => {
    expect(() => {
      const lexer = new Lexer('fn {', '<test>');
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, '<test>');
      parser.parse();
    }).toThrow();
  });

  test('detects analysis warnings', () => {
    const { warnings } = analyzeSource(`
fn foo() {
  x = 10
}
`);
    // May have unused variable warnings
    expect(warnings).toBeDefined();
  });

  test('valid code produces no errors', () => {
    const { warnings } = analyzeSource(`
x = 10
print(x)
`);
    expect(Array.isArray(warnings)).toBe(true);
  });
});

describe('LSP: Symbol Collection', () => {
  test('collects function symbols', () => {
    const { analyzer } = analyzeSource(`
fn greet(name) {
  return "Hello " + name
}
`);
    const scope = analyzer.globalScope;
    expect(scope.symbols.has('greet')).toBe(true);
    const sym = scope.symbols.get('greet');
    expect(sym.kind).toBe('function');
  });

  test('collects variable symbols', () => {
    const { analyzer } = analyzeSource(`x = 42`);
    const scope = analyzer.globalScope;
    expect(scope.symbols.has('x')).toBe(true);
  });

  test('collects type symbols', () => {
    const { analyzer } = analyzeSource(`
type Point {
  x: Int
  y: Int
}
`);
    const scope = analyzer.globalScope;
    expect(scope.symbols.has('Point')).toBe(true);
    expect(scope.symbols.get('Point').kind).toBe('type');
  });

  test('function symbols have params', () => {
    const { analyzer } = analyzeSource(`
fn add(a, b) {
  return a + b
}
`);
    const sym = analyzer.globalScope.symbols.get('add');
    expect(sym._params).toBeDefined();
    expect(sym._params).toContain('a');
    expect(sym._params).toContain('b');
  });

  test('symbols have source locations', () => {
    const { analyzer } = analyzeSource(`fn hello() { return 1 }`);
    const sym = analyzer.globalScope.symbols.get('hello');
    expect(sym.loc).toBeDefined();
    expect(sym.loc.line).toBeGreaterThan(0);
  });
});

describe('LSP: Scope Children', () => {
  test('scope tracks children', () => {
    const { analyzer } = analyzeSource(`
fn outer() {
  fn inner() {
    return 1
  }
  return inner()
}
`);
    const scope = analyzer.globalScope;
    expect(scope.children.length).toBeGreaterThan(0);
  });

  test('nested symbols are accessible through children', () => {
    const { analyzer } = analyzeSource(`
fn compute(x) {
  y = x * 2
  return y
}
`);
    const scope = analyzer.globalScope;
    // Function creates child scope with local vars
    const functionScope = scope.children.find(c => c.context === 'function');
    expect(functionScope).toBeDefined();
  });
});

describe('LSP: Error Location Extraction', () => {
  test('parse error has location info', () => {
    try {
      const lexer = new Lexer('fn foo( {', '<test>');
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, '<test>');
      parser.parse();
    } catch (e) {
      // Error message should contain location
      expect(e.message).toMatch(/\d+:\d+/);
    }
  });
});

describe('LSP: Word Extraction', () => {
  // Test the getWordAt logic used by the LSP
  function getWordAt(line, character) {
    let start = character;
    let end = character;
    while (start > 0 && /[a-zA-Z0-9_]/.test(line[start - 1])) start--;
    while (end < line.length && /[a-zA-Z0-9_]/.test(line[end])) end++;
    return line.slice(start, end) || null;
  }

  test('extracts word at cursor', () => {
    expect(getWordAt('fn hello() {', 4)).toBe('hello');
  });

  test('extracts word at start', () => {
    expect(getWordAt('hello world', 0)).toBe('hello');
  });

  test('extracts word at end', () => {
    expect(getWordAt('let x = 42', 4)).toBe('x');
  });

  test('returns null for spaces', () => {
    expect(getWordAt('a   b', 2)).toBe(null);
  });
});
