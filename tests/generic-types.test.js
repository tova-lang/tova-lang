import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function getWarnings(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze().warnings;
}

function getErrors(source) {
  try {
    getWarnings(source);
    return [];
  } catch (err) {
    return err.errors || [];
  }
}

function hasTypeMismatch(source, pattern) {
  const warnings = getWarnings(source);
  return warnings.some(w => w.message.includes('Type mismatch') && w.message.includes(pattern));
}

function hasTypeError(source, pattern) {
  const errors = getErrors(source);
  return errors.some(e => e.message.includes('Type mismatch') && e.message.includes(pattern));
}

// ─── Generic type inference ─────────────────────────────────

describe('Generic Types — Inference', () => {
  test('Ok(42) infers Result<Int, _> — mismatched return is now an error', () => {
    const errors = getErrors(`
      fn get_value() -> Result<String, String> {
        return Ok(42)
      }
    `);
    expect(errors.some(e => e.message.includes('Result<Int, _>') || e.message.includes('Result<String'))).toBe(true);
  });

  test('Err("fail") infers Result<_, String> — mismatched return is now an error', () => {
    const errors = getErrors(`
      fn get_value() -> Result<Int, Int> {
        return Err("fail")
      }
    `);
    expect(errors.some(e => e.message.includes('Result<_, String>') || e.message.includes('Result<Int, Int>'))).toBe(true);
  });

  test('Some(42) infers Option<Int> — mismatched return is now an error', () => {
    const errors = getErrors(`
      fn get_value() -> Option<String> {
        return Some(42)
      }
    `);
    expect(errors.some(e => e.message.includes('Option<Int>') || e.message.includes('Option<String>'))).toBe(true);
  });

  test('None infers Option<_> — compatible with any Option', () => {
    const warnings = getWarnings(`
      fn get_value() -> Option<Int> {
        return None
      }
    `);
    // None is Option<_>, which should be compatible with Option<Int>
    expect(warnings.filter(w => w.message.includes('Type mismatch'))).toEqual([]);
  });
});

// ─── Generic type compatibility ─────────────────────────────

describe('Generic Types — Compatibility', () => {
  test('Result<Int, String> is compatible with Result<Int, String>', () => {
    const warnings = getWarnings(`
      fn process(r: Result<Int, String>) -> Int { return 0 }
      process(Ok(42))
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch') && w.message.includes('process'))).toEqual([]);
  });

  test('Ok("hello") passed to fn expecting Result<Int, String> is now an error', () => {
    const errors = getErrors(`
      fn process(r: Result<Int, String>) -> Int { return 0 }
      process(Ok("hello"))
    `);
    expect(errors.some(e => e.message.includes('Type mismatch'))).toBe(true);
  });

  test('plain Result (no params) is compatible with Result<Int, String>', () => {
    // Gradual typing — don't break existing code
    const warnings = getWarnings(`
      fn process(r: Result<Int, String>) -> Int { return 0 }
      fn get_result() -> Result { return Ok(42) }
      process(get_result())
    `);
    // get_result returns plain Result, should be compatible with Result<Int, String>
    expect(warnings.filter(w => w.message.includes("'r' expects"))).toEqual([]);
  });

  test('Ok(42) compatible with plain Result param', () => {
    const warnings = getWarnings(`
      fn process(r: Result) -> Int { return 0 }
      process(Ok(42))
    `);
    expect(warnings.filter(w => w.message.includes("'r' expects"))).toEqual([]);
  });
});

// ─── Wildcard type params ───────────────────────────────────

describe('Generic Types — Wildcards', () => {
  test('Err("msg") is compatible with Result<Int, String> via _ wildcard', () => {
    const warnings = getWarnings(`
      fn process(r: Result<Int, String>) -> Int { return 0 }
      process(Err("msg"))
    `);
    // Err("msg") → Result<_, String>, _ is compatible with Int
    expect(warnings.filter(w => w.message.includes("'r' expects"))).toEqual([]);
  });

  test('Ok(42) is compatible with Result<Int, String> via _ wildcard for Err', () => {
    const warnings = getWarnings(`
      fn process(r: Result<Int, String>) -> Int { return 0 }
      process(Ok(42))
    `);
    // Ok(42) → Result<Int, _>, _ is compatible with String
    expect(warnings.filter(w => w.message.includes("'r' expects"))).toEqual([]);
  });
});

// ─── Return type checking with generics ─────────────────────

describe('Generic Types — Return type checking', () => {
  test('returning Ok(42) from fn -> Result<Int, String> is fine', () => {
    const warnings = getWarnings(`
      fn get() -> Result<Int, String> {
        return Ok(42)
      }
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch') && w.message.includes('return type'))).toEqual([]);
  });

  test('returning Ok("str") from fn -> Result<Int, String> is now an error', () => {
    expect(() => getWarnings(`
      fn get() -> Result<Int, String> {
        return Ok("str")
      }
    `)).toThrow('Type mismatch');
  });

  test('returning Some(42) from fn -> Option<Int> is fine', () => {
    const warnings = getWarnings(`
      fn get() -> Option<Int> {
        return Some(42)
      }
    `);
    expect(warnings.filter(w => w.message.includes('Type mismatch') && w.message.includes('return type'))).toEqual([]);
  });
});
