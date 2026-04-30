// Smoke test for the doc-examples helper. Validates:
//   1. Block extraction returns the right count for a known file.
//   2. Negative-marker detection works on real doc examples.
//   3. validateBlock() classifies a known-good and a known-bad block correctly.

import { describe, test, expect } from 'bun:test';
import { resolve } from 'path';
import {
  extractTovaBlocks,
  loadDocBlocks,
  validateBlock,
  blockLabel,
  isBareSignature,
} from './doc-examples.js';

const ROOT = resolve(import.meta.dir, '../..');

describe('doc-examples helper', () => {
  test('extractTovaBlocks finds blocks with line numbers', () => {
    const md = [
      '# Title',
      '',
      'intro',
      '',
      '```tova',
      'x = 1',
      '```',
      '',
      'more',
      '',
      '```tova',
      'y = 2',
      '```',
    ].join('\n');
    const blocks = extractTovaBlocks(md);
    expect(blocks.length).toBe(2);
    expect(blocks[0].code).toBe('x = 1\n');
    expect(blocks[0].startLine).toBe(5);
    expect(blocks[1].code).toBe('y = 2\n');
    expect(blocks[1].startLine).toBe(11);
  });

  test('detects negative markers (Error, ❌, Wrong)', () => {
    const md = [
      '```tova',
      'name = "Alice"',
      'name = "Bob"    // Error: cannot reassign immutable',
      '```',
      '',
      '```tova',
      '// ❌ wrong',
      'foo()',
      '```',
      '',
      '```tova',
      'good = 1',
      '```',
    ].join('\n');
    const blocks = extractTovaBlocks(md);
    expect(blocks.length).toBe(3);
    expect(blocks[0].isNegative).toBe(true);
    expect(blocks[1].isNegative).toBe(true);
    expect(blocks[2].isNegative).toBe(false);
  });

  test('validateBlock passes a trivial good program', () => {
    const block = {
      code: 'x = 1\nprint(x)',
      startLine: 1,
      kind: 'tova',
      isNegative: false,
      index: 0,
    };
    const r = validateBlock(block, '<smoke>');
    expect(r.ok).toBe(true);
    expect(r.phase).toBeNull();
  });

  test('validateBlock flags a syntactically broken non-negative block', () => {
    const block = {
      code: 'fn (',
      startLine: 1,
      kind: 'tova',
      isNegative: false,
      index: 0,
    };
    const r = validateBlock(block, '<smoke>');
    expect(r.ok).toBe(false);
    expect(['lex', 'parse']).toContain(r.phase);
  });

  test('validateBlock accepts a broken negative block', () => {
    const block = {
      code: 'fn (',
      startLine: 1,
      kind: 'tova',
      isNegative: true,
      index: 0,
    };
    const r = validateBlock(block, '<smoke>');
    expect(r.ok).toBe(true);
  });

  test('blockLabel formats consistently', () => {
    expect(blockLabel({ index: 0, startLine: 12 })).toBe('block #1 (line 12)');
    expect(blockLabel({ index: 4, startLine: 200 })).toBe('block #5 (line 200)');
  });

  test('isBareSignature recognizes documentation signatures', () => {
    expect(isBareSignature('iter(iterable) -> Seq')).toBe(true);
    expect(isBareSignature('PI -> Float  // 3.14')).toBe(true);
    expect(isBareSignature('http.get(url, opts?) -> Result<Response, String>')).toBe(true);
    expect(isBareSignature('table |> sample(n, seed?) -> Table')).toBe(true);
    expect(isBareSignature('add(a, b) -> Int\nsub(a, b) -> Int')).toBe(true);
    // Inline record type in return position
    expect(isBareSignature('sh(cmd) -> Result<{stdout: String, exitCode: Int}>')).toBe(true);
    expect(isBareSignature('parseArgs(argv) -> {flags: Object, positional: [String]}')).toBe(true);
    expect(isBareSignature('db.exec(sql, params?) -> { changes: Int }')).toBe(true);
  });

  test('isBareSignature rejects executable code', () => {
    // Has assignment
    expect(isBareSignature('x = iter(items) -> Seq')).toBe(false);
    expect(isBareSignature('var p = pipeline -> Stage')).toBe(false);
    // Multi-line function body (residual brace after stripping)
    expect(isBareSignature('fn iter(x) -> Seq {\n  x\n}')).toBe(false);
    // No -> at all
    expect(isBareSignature('print("hello")')).toBe(false);
    // Empty
    expect(isBareSignature('')).toBe(false);
    expect(isBareSignature('// just a comment')).toBe(false);
  });

  test('isBareSignature accepts async/fn-prefixed signatures', () => {
    // These appear in stdlib docs as signatures without bodies
    expect(isBareSignature('async spin(label, fn) -> T')).toBe(true);
    expect(isBareSignature('fn with_retry(op: () -> Result<any>, cfg) -> Result<any>')).toBe(true);
  });

  test('validateBlock auto-skips bare signatures with phase=signature', () => {
    const block = {
      code: 'iter(iterable) -> Seq',
      startLine: 1,
      kind: 'tova',
      isNegative: false,
      index: 0,
    };
    const r = validateBlock(block, '<smoke>');
    expect(r.ok).toBe(true);
    expect(r.phase).toBe('signature');
    expect(r.skipped).toBe(true);
  });

  test('extractTovaBlocks recognizes tova-jsx fences', () => {
    const md = '```tova-jsx\n<div>hi</div>\n```';
    const blocks = extractTovaBlocks(md);
    expect(blocks.length).toBe(1);
    expect(blocks[0].kind).toBe('tova-jsx');
  });

  test('validateBlock wraps tova-jsx in browser+component for parsing', () => {
    const block = {
      code: '<div>hello</div>',
      startLine: 1,
      kind: 'tova-jsx',
      isNegative: false,
      index: 0,
    };
    const r = validateBlock(block, '<smoke>');
    expect(r.ok).toBe(true);
  });

  test('validateBlock tova-jsx accepts state + JSX', () => {
    const block = {
      code: 'state count = 0\n<div>{count}</div>',
      startLine: 1,
      kind: 'tova-jsx',
      isNegative: false,
      index: 0,
    };
    const r = validateBlock(block, '<smoke>');
    expect(r.ok).toBe(true);
  });

  test('validateBlock tova-jsx surfaces real errors inside the wrap', () => {
    const block = {
      code: '<div>{undefinedFn(',  // unclosed expression
      startLine: 1,
      kind: 'tova-jsx',
      isNegative: false,
      index: 0,
    };
    const r = validateBlock(block, '<smoke>');
    expect(r.ok).toBe(false);
    expect(r.phase).toBe('parse');
  });

  test('loadDocBlocks reads a real doc page', () => {
    const blocks = loadDocBlocks(resolve(ROOT, 'docs/guide/variables.md'));
    // variables.md has 15 ```tova blocks per earlier grep
    expect(blocks.length).toBe(15);
    // First few blocks at known approximate line ranges
    expect(blocks[0].startLine).toBeGreaterThan(30);
  });
});
