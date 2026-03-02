// ─────────────────────────────────────────────────────────────────────────────
// Lexer 100% Line Coverage Tests
// Covers: template literal dedenting (lines 776-782) and regex scanning (813-855)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { TokenType } from '../src/lexer/tokens.js';

function tokenize(source) {
  const lexer = new Lexer(source);
  return lexer.tokenize();
}

// ─── Template literal dedenting with interpolation ──────────────────────────
// _dedentTripleQuoteParts lines 776-784: the .map() that strips leading
// whitespace from text parts when minIndent > 0 and is not Infinity.

describe('triple-quote template dedenting (lines 776-782)', () => {
  test('dedents indented template with interpolation', () => {
    // Triple-quoted string with interpolation AND consistent indentation.
    // The indentation (4 spaces) should be stripped from text parts.
    const source = 'x = """\n    Hello {name}\n    World\n    """';
    const tokens = tokenize(source);
    const tmpl = tokens.find(t => t.type === TokenType.STRING_TEMPLATE);
    expect(tmpl).toBeDefined();
    // First text part should have indentation stripped
    const firstText = tmpl.value.find(p => p.type === 'text');
    expect(firstText.value).not.toMatch(/^    /);
    expect(firstText.value).toBe('Hello ');
  });

  test('dedents template with empty line in the middle', () => {
    // Empty line between indented lines should become '' (line 780)
    const source = 'x = """\n    line1\n\n    line2 {val}\n    """';
    const tokens = tokenize(source);
    const tmpl = tokens.find(t => t.type === TokenType.STRING_TEMPLATE);
    expect(tmpl).toBeDefined();
    // The first text part contains "line1\n\n    line2 " before dedenting
    // After dedent: "line1\n\nline2 "
    const firstText = tmpl.value[0];
    expect(firstText.type).toBe('text');
    // Empty line should become '' (not have spaces)
    const lines = firstText.value.split('\n');
    expect(lines[0]).toBe('line1');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('line2 ');
  });

  test('dedents template with only-whitespace lines', () => {
    // A line that is only spaces should become '' after dedenting
    const source = 'x = """\n    first {a}\n      \n    second\n    """';
    const tokens = tokenize(source);
    const tmpl = tokens.find(t => t.type === TokenType.STRING_TEMPLATE);
    expect(tmpl).toBeDefined();
    const firstText = tmpl.value[0];
    const lines = firstText.value.split('\n');
    expect(lines[0]).toBe('first ');
  });

  test('dedents template with expression part preserved', () => {
    // Expression parts (non-text) should pass through unchanged (line 777)
    const source = 'x = """\n    a {expr} b\n    c\n    """';
    const tokens = tokenize(source);
    const tmpl = tokens.find(t => t.type === TokenType.STRING_TEMPLATE);
    expect(tmpl).toBeDefined();
    // Should have text, expr, text parts
    const exprPart = tmpl.value.find(p => p.type === 'expr');
    expect(exprPart).toBeDefined();
    expect(exprPart.type).toBe('expr');
  });

  test('dedents template with mixed indentation depths', () => {
    // Lines with different indentation levels - min indent is used
    const source = 'x = """\n    base {v}\n        deeper\n    """';
    const tokens = tokenize(source);
    const tmpl = tokens.find(t => t.type === TokenType.STRING_TEMPLATE);
    expect(tmpl).toBeDefined();
    // Min indent is 4, so "base" loses 4, "deeper" loses 4 (keeps 4)
    const parts = tmpl.value;
    const firstText = parts[0];
    expect(firstText.value).toBe('base ');
    const lastText = parts[parts.length - 1];
    expect(lastText.value).toContain('    deeper');
  });

  test('handles template where line indent is less than minIndent', () => {
    // Math.min on line 781 handles when a line has less indent than minIndent
    const source = 'x = """\n    hello {x}\n  short\n    """';
    const tokens = tokenize(source);
    const tmpl = tokens.find(t => t.type === TokenType.STRING_TEMPLATE);
    expect(tmpl).toBeDefined();
    // Min indent is 2, so "hello" -> "  hello", "short" -> "short"
    const lastText = tmpl.value[tmpl.value.length - 1];
    expect(lastText.value).toContain('short');
  });
});

// ─── Regex literal scanning ─────────────────────────────────────────────────
// scanRegex() lines 813-855

describe('regex literal scanning (lines 813-855)', () => {
  test('scans simple regex', () => {
    // Basic regex: /pattern/
    const source = 'x = match s { /abc/ => 1 }';
    const tokens = tokenize(source);
    const regex = tokens.find(t => t.type === TokenType.REGEX);
    expect(regex).toBeDefined();
    expect(regex.value.pattern).toBe('abc');
    expect(regex.value.flags).toBe('');
  });

  test('scans regex with flags', () => {
    // Regex with flags: /pattern/gi
    const source = 'x = match s { /abc/gi => 1 }';
    const tokens = tokenize(source);
    const regex = tokens.find(t => t.type === TokenType.REGEX);
    expect(regex).toBeDefined();
    expect(regex.value.pattern).toBe('abc');
    expect(regex.value.flags).toBe('gi');
  });

  test('scans regex with escape sequences', () => {
    // Escaped characters: /a\\/b/
    const source = 'x = match s { /a\\.b/ => 1 }';
    const tokens = tokenize(source);
    const regex = tokens.find(t => t.type === TokenType.REGEX);
    expect(regex).toBeDefined();
    expect(regex.value.pattern).toBe('a\\.b');
  });

  test('scans regex with character class', () => {
    // Character class with / inside: /[a/b]/
    const source = 'x = match s { /[a/b]/ => 1 }';
    const tokens = tokenize(source);
    const regex = tokens.find(t => t.type === TokenType.REGEX);
    expect(regex).toBeDefined();
    expect(regex.value.pattern).toBe('[a/b]');
  });

  test('scans regex with multiple flags', () => {
    const source = 'x = match s { /test/gims => 1 }';
    const tokens = tokenize(source);
    const regex = tokens.find(t => t.type === TokenType.REGEX);
    expect(regex).toBeDefined();
    expect(regex.value.flags).toBe('gims');
  });
});
