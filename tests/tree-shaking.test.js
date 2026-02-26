import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { BaseCodegen } from '../src/codegen/base-codegen.js';
import { BrowserCodegen } from '../src/codegen/browser-codegen.js';
import { SharedCodegen } from '../src/codegen/shared-codegen.js';
import { buildSelectiveStdlib, BUILTIN_NAMES } from '../src/stdlib/inline.js';

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function generateWithBaseCodegen(source) {
  const ast = parse(source);
  const gen = new BaseCodegen();
  const code = ast.body.map(stmt => gen.generateStatement(stmt)).join('\n');
  return { code, gen };
}

// ─── buildSelectiveStdlib ────────────────────────────────────

describe('Tree-Shaking — buildSelectiveStdlib', () => {
  test('includes only requested functions', () => {
    const output = buildSelectiveStdlib(new Set(['print']));
    expect(output).toContain('function print');
    expect(output).not.toContain('function sorted');
    expect(output).not.toContain('function reversed');
    expect(output).not.toContain('function len');
  });

  test('includes multiple requested functions', () => {
    const output = buildSelectiveStdlib(new Set(['print', 'len', 'range']));
    expect(output).toContain('function print');
    expect(output).toContain('function len');
    expect(output).toContain('function range');
    expect(output).not.toContain('function sorted');
  });

  test('returns empty string for no functions', () => {
    const output = buildSelectiveStdlib(new Set());
    expect(output).toBe('');
  });

  test('ignores unknown names', () => {
    const output = buildSelectiveStdlib(new Set(['nonexistent']));
    expect(output).toBe('');
  });
});

// ─── BUILTIN_NAMES ──────────────────────────────────────────

describe('Tree-Shaking — BUILTIN_NAMES', () => {
  test('contains expected builtin names', () => {
    expect(BUILTIN_NAMES.has('print')).toBe(true);
    expect(BUILTIN_NAMES.has('len')).toBe(true);
    expect(BUILTIN_NAMES.has('sorted')).toBe(true);
    expect(BUILTIN_NAMES.has('range')).toBe(true);
    expect(BUILTIN_NAMES.has('map')).toBe(true);
    expect(BUILTIN_NAMES.has('filter')).toBe(true);
  });

  test('does not contain non-builtins', () => {
    expect(BUILTIN_NAMES.has('Ok')).toBe(false);
    expect(BUILTIN_NAMES.has('Err')).toBe(false);
    expect(BUILTIN_NAMES.has('Some')).toBe(false);
    expect(BUILTIN_NAMES.has('None')).toBe(false);
  });
});

// ─── Codegen tracking ───────────────────────────────────────

describe('Tree-Shaking — Builtin tracking in codegen', () => {
  test('tracks print usage', () => {
    const { gen } = generateWithBaseCodegen('print("hello")');
    expect(gen._usedBuiltins.has('print')).toBe(true);
    expect(gen._usedBuiltins.has('sorted')).toBe(false);
  });

  test('tracks multiple builtin usages', () => {
    const { gen } = generateWithBaseCodegen(`
      print(len([1, 2, 3]))
      sorted([3, 1, 2])
    `);
    expect(gen._usedBuiltins.has('print')).toBe(true);
    expect(gen._usedBuiltins.has('len')).toBe(true);
    expect(gen._usedBuiltins.has('sorted')).toBe(true);
  });

  test('tracks Ok/Err/Some/None as _needsResultOption', () => {
    const { gen } = generateWithBaseCodegen('Ok(42)');
    expect(gen._needsResultOption).toBe(true);
  });

  test('no builtins tracked for non-builtin code', () => {
    const { gen } = generateWithBaseCodegen('x = 42');
    expect(gen._usedBuiltins.size).toBe(0);
    expect(gen._needsResultOption).toBe(false);
  });

  test('None identifier tracked as _needsResultOption', () => {
    const { gen } = generateWithBaseCodegen('x = None');
    expect(gen._needsResultOption).toBe(true);
  });
});

// ─── Client codegen selective stdlib ────────────────────────

describe('Tree-Shaking — Client codegen selective stdlib', () => {
  test('getStdlibCore only includes used functions', () => {
    const ast = parse('print("hello")');
    const gen = new BrowserCodegen();
    // Generate the code to trigger builtin tracking
    ast.body.forEach(stmt => gen.generateStatement(stmt));
    const stdlib = gen.getStdlibCore();
    expect(stdlib).toContain('function print');
    expect(stdlib).not.toContain('function sorted');
    expect(stdlib).not.toContain('function reversed');
    expect(stdlib).not.toContain('function Ok');
  });

  test('includes Result/Option when Ok is used', () => {
    const ast = parse('Ok(42)');
    const gen = new BrowserCodegen();
    ast.body.forEach(stmt => gen.generateStatement(stmt));
    const stdlib = gen.getStdlibCore();
    expect(stdlib).toContain('function Ok');
    expect(stdlib).toContain('function Err');
    expect(stdlib).toContain('function Some');
  });

  test('minimal output for no builtins', () => {
    const ast = parse('x = 42');
    const gen = new BrowserCodegen();
    ast.body.forEach(stmt => gen.generateStatement(stmt));
    const stdlib = gen.getStdlibCore();
    expect(stdlib).not.toContain('function print');
    expect(stdlib).not.toContain('function Ok');
  });

  test('includes PROPAGATE when ? operator triggers it', () => {
    const ast = parse('x = value?');
    const gen = new BrowserCodegen();
    ast.body.forEach(stmt => gen.generateStatement(stmt));
    const stdlib = gen.getStdlibCore();
    expect(stdlib).toContain('__propagate');
  });
});

// ─── Shared codegen selective stdlib ────────────────────────

describe('Tree-Shaking — Shared codegen selective stdlib', () => {
  test('generateHelpers only includes used functions', () => {
    const gen = new SharedCodegen();
    // Simulate using print
    gen._usedBuiltins.add('print');
    const helpers = gen.generateHelpers();
    expect(helpers).toContain('function print');
    expect(helpers).not.toContain('function sorted');
    expect(helpers).not.toContain('function Ok');
  });

  test('includes Result/Option when needed', () => {
    const gen = new SharedCodegen();
    gen._needsResultOption = true;
    const helpers = gen.generateHelpers();
    expect(helpers).toContain('function Ok');
  });
});
