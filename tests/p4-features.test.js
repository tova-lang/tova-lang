import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function parse(code) {
  const lexer = new Lexer(code, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function compile(code) {
  const ast = parse(code);
  const codegen = new CodeGenerator(ast, '<test>');
  return codegen.generate();
}

function compileShared(code) {
  return compile(code).shared.trim();
}

function getWarnings(code) {
  const ast = parse(code);
  const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
  const result = analyzer.analyze();
  return result.warnings;
}

function tokenize(code) {
  const lexer = new Lexer(code, '<test>');
  return lexer.tokenize();
}

// ── Item 1: Match → ternary chain ──────────────────────────────

describe('P4: Codegen — match → ternary', () => {
  test('simple literal match emits ternary chain', () => {
    const code = compileShared('x = match val { 0 => "zero", 1 => "one", _ => "other" }');
    expect(code).toContain('?');
    expect(code).toContain('"zero"');
    expect(code).toContain('"one"');
    expect(code).toContain('"other"');
    // Should NOT contain IIFE
    expect(code).not.toContain('(() =>');
    expect(code).not.toContain('__match');
  });

  test('match with range pattern emits ternary', () => {
    const code = compileShared('x = match n { 1..5 => "low", 5..=10 => "mid", _ => "high" }');
    expect(code).toContain('?');
    expect(code).not.toContain('(() =>');
  });

  test('match with binding pattern falls back to IIFE', () => {
    const code = compileShared('x = match val { n => n * 2 }');
    // Binding patterns need variable bindings → IIFE
    expect(code).toContain('__match');
  });

  test('match with block body falls back to IIFE', () => {
    const code = compileShared(`x = match val {
      0 => {
        a = 1
        a + 2
      }
      _ => 0
    }`);
    expect(code).toContain('__match');
  });

  test('match with complex subject falls back to IIFE', () => {
    const code = compileShared('x = match compute() { 0 => "a", _ => "b" }');
    // compute() is a call expression, not simple → IIFE
    expect(code).toContain('__match');
  });

  test('match with guard on simple pattern emits ternary', () => {
    const code = compileShared('x = match n { 0 => "zero", _ if n > 100 => "big", _ => "other" }');
    expect(code).toContain('?');
  });
});

// ── Item 2: Specialize `in` checks by type ─────────────────────

describe('P4: Codegen — specialize `in` checks', () => {
  test('array literal uses .includes()', () => {
    const code = compileShared('x = a in [1, 2, 3]');
    expect(code).toContain('.includes(');
    expect(code).not.toContain('__contains');
  });

  test('string literal uses .includes()', () => {
    const code = compileShared('x = ch in "hello"');
    expect(code).toContain('.includes(');
    expect(code).not.toContain('__contains');
  });

  test('Set.new() uses .has()', () => {
    const code = compileShared('x = a in Set.new([1, 2])');
    expect(code).toContain('.has(');
    expect(code).not.toContain('__contains');
  });

  test('Map.new() uses .has()', () => {
    const code = compileShared('x = k in Map.new()');
    expect(code).toContain('.has(');
    expect(code).not.toContain('__contains');
  });

  test('object literal uses `in` operator', () => {
    const code = compileShared('x = k in {a: 1, b: 2}');
    expect(code).toContain(' in ');
    expect(code).not.toContain('__contains');
  });

  test('unknown collection falls back to __contains', () => {
    const code = compileShared('x = a in collection');
    expect(code).toContain('__contains');
  });

  test('negated array in uses !.includes()', () => {
    const code = compileShared('x = a not in [1, 2, 3]');
    expect(code).toContain('!');
    expect(code).toContain('.includes(');
    expect(code).not.toContain('__contains');
  });
});

// ── Item 4: Reduce IIFE usage ──────────────────────────────────

describe('P4: Codegen — reduce IIFE', () => {
  describe('null coalescing ??', () => {
    test('simple identifier ?? value is inline', () => {
      const code = compileShared('x = a ?? "default"');
      expect(code).toContain('a != null && a === a');
      expect(code).not.toContain('__tova_v');
    });

    test('member expression ?? value is inline', () => {
      const code = compileShared('x = obj.val ?? 0');
      expect(code).toContain('obj.val != null');
      expect(code).not.toContain('__tova_v');
    });

    test('complex left side ?? still uses IIFE', () => {
      const code = compileShared('x = compute() ?? "fallback"');
      expect(code).toContain('__tova_v');
    });
  });

  describe('if-elif expressions', () => {
    test('if-elif-else with single expressions emits nested ternary', () => {
      const code = compileShared('x = if a { 1 } elif b { 2 } elif c { 3 } else { 4 }');
      expect(code).toContain('?');
      expect(code).not.toContain('(() =>');
      expect(code).toContain('1');
      expect(code).toContain('2');
      expect(code).toContain('3');
      expect(code).toContain('4');
    });

    test('if-elif-else with multi-statement branch uses IIFE', () => {
      const code = compileShared(`x = if a { 1 } elif b {
        y = 2
        y + 1
      } else { 4 }`);
      expect(code).toContain('(() =>');
    });
  });

  describe('pipe with multiple placeholders', () => {
    test('simple left side inlined at all placeholder positions', () => {
      const code = compileShared('x = val |> add(_, _)');
      // val is simple → should be inlined, not use IIFE temp var
      expect(code).not.toContain('__pipe_');
      expect(code).toContain('add(val, val)');
    });

    test('complex left side still uses IIFE for multiple placeholders', () => {
      const code = compileShared('x = compute() |> add(_, _)');
      expect(code).toContain('__pipe_');
    });
  });

  describe('chained comparisons', () => {
    test('simple operands emit inline comparisons', () => {
      const code = compileShared('x = 1 < y < 10');
      expect(code).toContain('(1 < y)');
      expect(code).toContain('(y < 10)');
      expect(code).toContain('&&');
      expect(code).not.toContain('__cmp_');
      expect(code).not.toContain('(() =>');
    });

    test('three-way simple operands are inline', () => {
      const code = compileShared('x = a <= b < c <= d');
      expect(code).toContain('(a <= b)');
      expect(code).toContain('(b < c)');
      expect(code).toContain('(c <= d)');
      expect(code).not.toContain('__cmp_');
    });

    test('complex intermediate operand still uses temp vars', () => {
      const code = compileShared('x = 1 < compute() < 10');
      expect(code).toContain('__cmp_');
    });
  });
});

// ── Item 3: Dead code warnings ─────────────────────────────────

describe('P4: Analyzer — dead code warnings', () => {
  describe('unused functions', () => {
    test('warns about unused private function', () => {
      const warnings = getWarnings(`
        fn helper() { 42 }
        fn main() { print("hi") }
      `);
      const unused = warnings.filter(w => w.message.includes("'helper'") && w.message.includes('never used'));
      expect(unused.length).toBe(1);
    });

    test('no warning for pub function', () => {
      const warnings = getWarnings(`
        pub fn api_handler() { 42 }
      `);
      const unused = warnings.filter(w => w.message.includes("'api_handler'") && w.message.includes('never used'));
      expect(unused.length).toBe(0);
    });

    test('no warning for _ prefixed function', () => {
      const warnings = getWarnings(`
        fn _internal() { 42 }
      `);
      const unused = warnings.filter(w => w.message.includes("'_internal'"));
      expect(unused.length).toBe(0);
    });

    test('no warning for main function', () => {
      const warnings = getWarnings(`
        fn main() { print("hi") }
      `);
      const unused = warnings.filter(w => w.message.includes("'main'") && w.message.includes('never used'));
      expect(unused.length).toBe(0);
    });

    test('no warning for used function', () => {
      const warnings = getWarnings(`
        fn helper() { 42 }
        fn main() { helper() }
      `);
      const unused = warnings.filter(w => w.message.includes("'helper'") && w.message.includes('never used'));
      expect(unused.length).toBe(0);
    });

    test('no warning for ADT variant constructors', () => {
      const warnings = getWarnings(`
        type Color { Red, Blue, Green }
      `);
      const unused = warnings.filter(w => w.message.includes("'Red'") || w.message.includes("'Blue'") || w.message.includes("'Green'"));
      expect(unused.length).toBe(0);
    });
  });

  describe('unreachable code', () => {
    test('warns about code after return', () => {
      const warnings = getWarnings(`
        fn test() {
          return 1
          x = 2
        }
      `);
      const unreachable = warnings.filter(w => w.message.includes('Unreachable'));
      expect(unreachable.length).toBe(1);
    });

    test('warns about code after break', () => {
      const warnings = getWarnings(`
        fn test() {
          for i in [1, 2, 3] {
            break
            x = 2
          }
        }
      `);
      const unreachable = warnings.filter(w => w.message.includes('Unreachable'));
      expect(unreachable.length).toBe(1);
    });

    test('no warning when no unreachable code', () => {
      const warnings = getWarnings(`
        fn test() {
          x = 1
          return x
        }
      `);
      const unreachable = warnings.filter(w => w.message.includes('Unreachable'));
      expect(unreachable.length).toBe(0);
    });
  });

  describe('constant conditionals', () => {
    test('warns on if true', () => {
      const warnings = getWarnings(`
        fn test() {
          if true { print("always") }
        }
      `);
      const constCond = warnings.filter(w => w.message.includes('always true'));
      expect(constCond.length).toBe(1);
    });

    test('warns on if false', () => {
      const warnings = getWarnings(`
        fn test() {
          if false { print("never") }
        }
      `);
      const constCond = warnings.filter(w => w.message.includes('always false'));
      expect(constCond.length).toBe(1);
    });

    test('warns on while false', () => {
      const warnings = getWarnings(`
        fn test() {
          while false { print("never") }
        }
      `);
      const constCond = warnings.filter(w => w.message.includes('always false'));
      expect(constCond.length).toBe(1);
    });

    test('no warning on while true (valid infinite loop pattern)', () => {
      const warnings = getWarnings(`
        fn test() {
          while true { break }
        }
      `);
      const constCond = warnings.filter(w => w.message.includes('always'));
      expect(constCond.length).toBe(0);
    });
  });

  describe('unreachable match arms', () => {
    test('warns about arms after wildcard', () => {
      const warnings = getWarnings(`
        fn test(x) {
          match x {
            1 => "one"
            _ => "other"
            2 => "two"
          }
        }
      `);
      const unreachable = warnings.filter(w => w.message.includes('Unreachable match arm'));
      expect(unreachable.length).toBe(1);
    });

    test('warns about arms after unguarded binding pattern', () => {
      const warnings = getWarnings(`
        fn test(x) {
          match x {
            n => n * 2
            0 => "zero"
          }
        }
      `);
      const unreachable = warnings.filter(w => w.message.includes('Unreachable match arm'));
      expect(unreachable.length).toBe(1);
    });

    test('no warning when wildcard is last', () => {
      const warnings = getWarnings(`
        fn test(x) {
          match x {
            1 => "one"
            2 => "two"
            _ => "other"
          }
        }
      `);
      const unreachable = warnings.filter(w => w.message.includes('Unreachable match arm'));
      expect(unreachable.length).toBe(0);
    });

    test('guarded binding does not trigger catch-all', () => {
      const warnings = getWarnings(`
        fn test(x) {
          match x {
            n if n > 0 => n * 2
            _ => 0
          }
        }
      `);
      const unreachable = warnings.filter(w => w.message.includes('Unreachable match arm'));
      expect(unreachable.length).toBe(0);
    });
  });
});

// ── Item 5: Arrow lambda error recovery ────────────────────────

describe('P4: Parser — arrow lambda errors', () => {
  test('valid arrow lambda still works', () => {
    expect(() => parse('f = (x, y) -> x + y')).not.toThrow();
  });

  test('valid fat arrow lambda still works', () => {
    expect(() => parse('f = (x) => x + 1')).not.toThrow();
  });

  test('empty arrow lambda works', () => {
    expect(() => parse('f = () -> 42')).not.toThrow();
  });

  test('parenthesized expression still works after failed lambda speculation', () => {
    // (a + b) is not a lambda — should backtrack and parse as parens
    expect(() => parse('f = (a + b) * 2')).not.toThrow();
  });

  test('tuple expression still works', () => {
    expect(() => parse('t = (1, 2, 3)')).not.toThrow();
  });
});

// ── Item 6: Regex detection ────────────────────────────────────

describe('P4: Lexer — regex detection (negative list)', () => {
  test('regex after keyword (if)', () => {
    const tokens = tokenize('if /test/');
    const regex = tokens.find(t => t.type === 'REGEX');
    expect(regex).toBeDefined();
    expect(regex.value.pattern).toBe('test');
  });

  test('regex after assignment', () => {
    const tokens = tokenize('x = /pattern/g');
    const regex = tokens.find(t => t.type === 'REGEX');
    expect(regex).toBeDefined();
  });

  test('regex after comma', () => {
    const tokens = tokenize('[a, /re/]');
    const regex = tokens.find(t => t.type === 'REGEX');
    expect(regex).toBeDefined();
  });

  test('regex after return', () => {
    const tokens = tokenize('return /pattern/');
    const regex = tokens.find(t => t.type === 'REGEX');
    expect(regex).toBeDefined();
  });

  test('division after identifier (not regex)', () => {
    const tokens = tokenize('x / 2');
    const regex = tokens.find(t => t.type === 'REGEX');
    expect(regex).toBeUndefined();
    const slash = tokens.find(t => t.type === 'SLASH');
    expect(slash).toBeDefined();
  });

  test('division after number (not regex)', () => {
    const tokens = tokenize('10 / 2');
    const regex = tokens.find(t => t.type === 'REGEX');
    expect(regex).toBeUndefined();
  });

  test('division after closing paren (not regex)', () => {
    const tokens = tokenize('(a + b) / 2');
    const regex = tokens.find(t => t.type === 'REGEX');
    expect(regex).toBeUndefined();
  });

  test('regex after pipe operator', () => {
    const tokens = tokenize('x |> /test/');
    const regex = tokens.find(t => t.type === 'REGEX');
    expect(regex).toBeDefined();
  });

  test('regex after logical operators', () => {
    const tokens = tokenize('a and /test/');
    const regex = tokens.find(t => t.type === 'REGEX');
    expect(regex).toBeDefined();
  });
});

// ── Item 7: JSX disambiguation ─────────────────────────────────

describe('P4: JSX disambiguation', () => {
  test('a < b && c > d is comparison, not JSX', () => {
    // Should parse without JSX errors — the && after identifier means comparison
    expect(() => parse(`
      fn test() {
        x = a < b and c > d
      }
    `)).not.toThrow();
  });

  test('a < b == c is comparison, not JSX', () => {
    expect(() => parse(`
      fn test() {
        x = a < b == c
      }
    `)).not.toThrow();
  });

  test('JSX with component still works', () => {
    expect(() => parse(`
      client {
        component App {
          <div>hello</div>
        }
      }
    `)).not.toThrow();
  });
});
