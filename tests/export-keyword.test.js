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
