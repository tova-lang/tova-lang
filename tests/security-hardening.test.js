import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function parse(source) {
  const lexer = new Lexer(source, 'test.tova');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, 'test.tova');
  return parser.parse();
}

function analyze(source, opts = {}) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, 'test.tova', { tolerant: true, ...opts });
  return analyzer.analyze();
}

describe('Security warning categories', () => {
  test('security warnings include category field', () => {
    const result = analyze(`
      security {
        auth jwt { secret: "hardcoded" }
      }
      server {
        fn hello() -> String { "hi" }
      }
    `);
    const w = result.warnings.find(w => w.code === 'W_HARDCODED_SECRET');
    expect(w).toBeDefined();
    expect(w.category).toBe('security');
  });

  test('non-security warnings do not have security category', () => {
    const result = analyze(`
      fn myFunction() { }
    `);
    const styleWarnings = result.warnings.filter(w => w.code === 'W100');
    for (const w of styleWarnings) {
      expect(w.category).not.toBe('security');
    }
  });
});

describe('--strict-security mode', () => {
  test('promotes security warnings to errors', () => {
    const result = analyze(`
      security {
        auth jwt { secret: "hardcoded" }
      }
      server {
        fn hello() -> String { "hi" }
      }
    `, { strictSecurity: true });
    expect(result.errors.some(e => e.code === 'W_HARDCODED_SECRET')).toBe(true);
    // Should NOT be in warnings anymore
    expect(result.warnings.some(w => w.code === 'W_HARDCODED_SECRET')).toBe(false);
  });

  test('does not promote non-security warnings to errors', () => {
    const result = analyze(`
      fn myFunction() { }
    `, { strictSecurity: true });
    // naming convention warnings should stay as warnings
    expect(result.warnings.some(w => w.code === 'W100')).toBe(true);
    expect(result.errors.filter(e => e.code === 'W100').length).toBe(0);
  });
});
