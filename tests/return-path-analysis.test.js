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

function hasReturnPathWarning(source) {
  const warnings = getWarnings(source);
  return warnings.some(w => w.message.includes('not all code paths return a value'));
}

// ─── Functions that return on all paths ─────────────────────

describe('Return Path Analysis — All paths return', () => {
  test('simple function with return', () => {
    expect(hasReturnPathWarning(`
      fn add(a: Int, b: Int) -> Int {
        return a + b
      }
    `)).toBe(false);
  });

  test('if/else both return', () => {
    expect(hasReturnPathWarning(`
      fn absolute(x: Int) -> Int {
        if x < 0 {
          return 0 - x
        } else {
          return x
        }
      }
    `)).toBe(false);
  });

  test('if/elif/else all return', () => {
    expect(hasReturnPathWarning(`
      fn classify(x: Int) -> String {
        if x < 0 {
          return "negative"
        } elif x == 0 {
          return "zero"
        } else {
          return "positive"
        }
      }
    `)).toBe(false);
  });

  test('match with wildcard all arms return', () => {
    expect(hasReturnPathWarning(`
      fn describe(x: Int) -> String {
        match x {
          1 => { return "one" }
          2 => { return "two" }
          _ => { return "other" }
        }
      }
    `)).toBe(false);
  });
});

// ─── Functions missing return paths ─────────────────────────

describe('Return Path Analysis — Missing return paths', () => {
  test('function with no return statement', () => {
    expect(hasReturnPathWarning(`
      fn get_value() -> Int {
        x = 42
      }
    `)).toBe(true);
  });

  test('if without else branch', () => {
    expect(hasReturnPathWarning(`
      fn maybe_return(x: Int) -> Int {
        if x > 0 {
          return x
        }
      }
    `)).toBe(true);
  });

  test('if/elif without else', () => {
    expect(hasReturnPathWarning(`
      fn classify(x: Int) -> String {
        if x < 0 {
          return "negative"
        } elif x == 0 {
          return "zero"
        }
      }
    `)).toBe(true);
  });

  test('if/else where one branch does not return', () => {
    expect(hasReturnPathWarning(`
      fn half_return(x: Int) -> Int {
        if x > 0 {
          return x
        } else {
          y = 0
        }
      }
    `)).toBe(true);
  });
});

// ─── Functions without return type (no warning) ─────────────

describe('Return Path Analysis — No return type annotation', () => {
  test('no warning when function has no return type', () => {
    expect(hasReturnPathWarning(`
      fn do_stuff() {
        x = 42
      }
    `)).toBe(false);
  });

  test('no warning for function with return but no return type', () => {
    expect(hasReturnPathWarning(`
      fn do_stuff() {
        if true {
          return 1
        }
      }
    `)).toBe(false);
  });
});

// ─── Try/Catch ──────────────────────────────────────────────

describe('Return Path Analysis — Try/Catch', () => {
  test('try and catch both return', () => {
    expect(hasReturnPathWarning(`
      fn safe_parse(s: String) -> Int {
        try {
          return 42
        } catch e {
          return 0
        }
      }
    `)).toBe(false);
  });

  test('try returns but catch does not', () => {
    expect(hasReturnPathWarning(`
      fn risky(s: String) -> Int {
        try {
          return 42
        } catch e {
          x = 0
        }
      }
    `)).toBe(true);
  });
});

// ─── Nested structures ──────────────────────────────────────

describe('Return Path Analysis — Nested structures', () => {
  test('nested if/else with returns', () => {
    expect(hasReturnPathWarning(`
      fn nested(x: Int, y: Int) -> String {
        if x > 0 {
          if y > 0 {
            return "both positive"
          } else {
            return "x positive"
          }
        } else {
          return "x not positive"
        }
      }
    `)).toBe(false);
  });

  test('nested if/else where inner is missing else', () => {
    expect(hasReturnPathWarning(`
      fn nested(x: Int, y: Int) -> String {
        if x > 0 {
          if y > 0 {
            return "both positive"
          }
        } else {
          return "x not positive"
        }
      }
    `)).toBe(true);
  });
});
