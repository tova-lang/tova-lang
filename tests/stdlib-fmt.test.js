// Tests for enhanced fmt() — rich format specifications
// Covers: positional, named, float precision, alignment, fill, thousands,
// percentage, binary, hex, octal, currency, escaped braces, combined specs

import { describe, test, expect } from 'bun:test';
import { fmt } from '../src/stdlib/string.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

// Helper: compile Tova source and run, capture console.log output
function compile(src) {
  const lexer = new Lexer(src, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const gen = new CodeGenerator(ast, '<test>');
  return gen.generate().shared.trim();
}

function run(code) {
  const js = compile(code);
  const logs = [];
  const mockConsole = { log: (...a) => logs.push(a.map(String).join(' ')), warn: () => {}, error: () => {} };
  const execFn = new Function('console', js);  // eslint-disable-line no-new-func -- standard test pattern for transpiler output
  execFn(mockConsole);
  return logs.join('\n');
}

// ── Positional substitution ─────────────────────────────────

describe('fmt — positional', () => {
  test('basic positional {}', () => {
    expect(fmt('Hello {}, age {}', 'Alice', 30))
      .toBe('Hello Alice, age 30');
  });

  test('positional with extra args ignored', () => {
    expect(fmt('Hello {}', 'Alice', 'extra'))
      .toBe('Hello Alice');
  });

  test('positional with missing args keeps placeholder', () => {
    expect(fmt('Hello {}, age {}', 'Alice'))
      .toBe('Hello Alice, age {}');
  });

  test('no placeholders returns template as-is', () => {
    expect(fmt('Hello world'))
      .toBe('Hello world');
  });

  test('empty string', () => {
    expect(fmt(''))
      .toBe('');
  });

  test('single positional', () => {
    expect(fmt('{}', 42))
      .toBe('42');
  });

  test('many positional args', () => {
    expect(fmt('{} {} {} {} {}', 1, 2, 3, 4, 5))
      .toBe('1 2 3 4 5');
  });
});

// ── Named substitution ──────────────────────────────────────

describe('fmt — named', () => {
  test('basic named keys', () => {
    expect(fmt('Hi {name}, you are {age}', {name: 'Bob', age: 25}))
      .toBe('Hi Bob, you are 25');
  });

  test('named with missing key keeps placeholder', () => {
    expect(fmt('Hi {name}, {unknown}', {name: 'Bob'}))
      .toBe('Hi Bob, {unknown}');
  });

  test('single named key', () => {
    expect(fmt('{x}', {x: 42}))
      .toBe('42');
  });

  test('named with underscored keys', () => {
    expect(fmt('{first_name} {last_name}', {first_name: 'Jane', last_name: 'Doe'}))
      .toBe('Jane Doe');
  });
});

// ── Float precision ─────────────────────────────────────────

describe('fmt — float precision', () => {
  test('{:.2f} rounds to 2 decimal places', () => {
    expect(fmt('{:.2f}', 3.14159))
      .toBe('3.14');
  });

  test('{:.0f} rounds to integer', () => {
    expect(fmt('{:.0f}', 3.7))
      .toBe('4');
  });

  test('{:.4f} pads with zeros', () => {
    expect(fmt('{:.4f}', 1.5))
      .toBe('1.5000');
  });

  test('{:.1f} one decimal', () => {
    expect(fmt('{:.1f}', 0.99))
      .toBe('1.0');
  });

  test('float precision on integer', () => {
    expect(fmt('{:.2f}', 42))
      .toBe('42.00');
  });
});

// ── Alignment ───────────────────────────────────────────────

describe('fmt — alignment', () => {
  test('{:>10} right-align with spaces', () => {
    expect(fmt('{:>10}', 'right'))
      .toBe('     right');
  });

  test('{:<10} left-align with spaces', () => {
    expect(fmt('{:<10}', 'left'))
      .toBe('left      ');
  });

  test('{:^10} center-align', () => {
    expect(fmt('{:^10}', 'mid'))
      .toBe('   mid    ');
  });

  test('{:^11} center-align odd', () => {
    expect(fmt('{:^11}', 'mid'))
      .toBe('    mid    ');
  });

  test('alignment with number', () => {
    expect(fmt('{:>8}', 42))
      .toBe('      42');
  });

  test('value longer than width', () => {
    expect(fmt('{:>3}', 'hello'))
      .toBe('hello');
  });
});

// ── Fill character ──────────────────────────────────────────

describe('fmt — fill character', () => {
  test('{:*>10} fill with asterisks right-align', () => {
    expect(fmt('{:*>10}', 'hi'))
      .toBe('********hi');
  });

  test('{:_^10} fill with underscores center', () => {
    expect(fmt('{:_^10}', 'mid'))
      .toBe('___mid____');
  });

  test('{:0>5} zero-fill right-align', () => {
    expect(fmt('{:0>5}', 42))
      .toBe('00042');
  });

  test('{:.<20} fill with dots left-align', () => {
    expect(fmt('{:.<20}', 'item'))
      .toBe('item................');
  });

  test('{:-^20} fill with dashes center', () => {
    expect(fmt('{:-^20}', 'title'))
      .toBe('-------title--------');
  });
});

// ── Thousands separator ─────────────────────────────────────

describe('fmt — thousands separator', () => {
  test('{:,} adds commas to large numbers', () => {
    expect(fmt('{:,}', 1234567))
      .toBe('1,234,567');
  });

  test('{:,} small number no commas needed', () => {
    expect(fmt('{:,}', 999))
      .toBe('999');
  });

  test('{:,} negative number', () => {
    expect(fmt('{:,}', -1234567))
      .toBe('-1,234,567');
  });

  test('{:,} with decimal', () => {
    expect(fmt('{:,}', 1234567.89))
      .toBe('1,234,567.89');
  });

  test('{:,} zero', () => {
    expect(fmt('{:,}', 0))
      .toBe('0');
  });
});

// ── Percentage ──────────────────────────────────────────────

describe('fmt — percentage', () => {
  test('{:%} converts fraction to percentage', () => {
    expect(fmt('{:%}', 0.856))
      .toBe('85.6%');
  });

  test('{:%} zero', () => {
    expect(fmt('{:%}', 0))
      .toBe('0%');
  });

  test('{:%} one', () => {
    expect(fmt('{:%}', 1))
      .toBe('100%');
  });

  test('{:.1%} with precision', () => {
    expect(fmt('{:.1%}', 0.8567))
      .toBe('85.7%');
  });

  test('{:.0%} no decimals', () => {
    expect(fmt('{:.0%}', 0.856))
      .toBe('86%');
  });
});

// ── Binary ──────────────────────────────────────────────────

describe('fmt — binary', () => {
  test('{:b} converts to binary', () => {
    expect(fmt('{:b}', 42))
      .toBe('101010');
  });

  test('{:b} zero', () => {
    expect(fmt('{:b}', 0))
      .toBe('0');
  });

  test('{:b} one', () => {
    expect(fmt('{:b}', 1))
      .toBe('1');
  });

  test('{:b} power of two', () => {
    expect(fmt('{:b}', 256))
      .toBe('100000000');
  });
});

// ── Hex ─────────────────────────────────────────────────────

describe('fmt — hex', () => {
  test('{:x} lowercase hex', () => {
    expect(fmt('{:x}', 255))
      .toBe('ff');
  });

  test('{:X} uppercase hex', () => {
    expect(fmt('{:X}', 255))
      .toBe('FF');
  });

  test('{:x} zero', () => {
    expect(fmt('{:x}', 0))
      .toBe('0');
  });

  test('{:x} large number', () => {
    expect(fmt('{:x}', 65535))
      .toBe('ffff');
  });

  test('{:X} large number', () => {
    expect(fmt('{:X}', 48879))
      .toBe('BEEF');
  });
});

// ── Octal ───────────────────────────────────────────────────

describe('fmt — octal', () => {
  test('{:o} converts to octal', () => {
    expect(fmt('{:o}', 8))
      .toBe('10');
  });

  test('{:o} zero', () => {
    expect(fmt('{:o}', 0))
      .toBe('0');
  });

  test('{:o} 255', () => {
    expect(fmt('{:o}', 255))
      .toBe('377');
  });
});

// ── Currency ────────────────────────────────────────────────

describe('fmt — currency', () => {
  test('{:$} formats as currency', () => {
    expect(fmt('{:$}', 49.9))
      .toBe('$49.90');
  });

  test('{:$} integer', () => {
    expect(fmt('{:$}', 100))
      .toBe('$100.00');
  });

  test('{:$} zero', () => {
    expect(fmt('{:$}', 0))
      .toBe('$0.00');
  });

  test('{:$} large number with thousands', () => {
    expect(fmt('{:$}', 1234567.89))
      .toBe('$1,234,567.89');
  });

  test('{:$} negative', () => {
    expect(fmt('{:$}', -49.9))
      .toBe('-$49.90');
  });
});

// ── Escaped braces ──────────────────────────────────────────

describe('fmt — escaped braces', () => {
  test('{{ and }} produce literal braces', () => {
    expect(fmt('use {{}} for placeholders'))
      .toBe('use {} for placeholders');
  });

  test('escaped braces with positional', () => {
    expect(fmt('{{{}}} is cool', 'Tova'))
      .toBe('{Tova} is cool');
  });

  test('multiple escaped braces', () => {
    expect(fmt('a {{}} b {{}} c'))
      .toBe('a {} b {} c');
  });

  test('only escaped braces', () => {
    expect(fmt('{{}}{{}}{{}}'))
      .toBe('{}{}{}');
  });
});

// ── Combined specs ──────────────────────────────────────────

describe('fmt — combined specs', () => {
  test('{:,.2f} thousands + precision', () => {
    expect(fmt('{:,.2f}', 1234567.891))
      .toBe('1,234,567.89');
  });

  test('{:>20,.2f} right-align + thousands + precision', () => {
    expect(fmt('{:>20,.2f}', 1234567.891))
      .toBe('        1,234,567.89');
  // 20 chars total: "1,234,567.89" is 12 chars, so 8 spaces padding
  });

  test('{:*>20,.2f} fill + right-align + thousands + precision', () => {
    expect(fmt('{:*>20,.2f}', 1234567.891))
      .toBe('********1,234,567.89');
  });

  test('{:^20} center-align with width', () => {
    expect(fmt('{:^20}', 'centered'))
      .toBe('      centered      ');
  });

  test('{:0>8b} zero-padded binary', () => {
    expect(fmt('{:0>8b}', 42))
      .toBe('00101010');
  });

  test('{:0>4x} zero-padded hex', () => {
    expect(fmt('{:0>4x}', 10))
      .toBe('000a');
  });

  test('multiple specs in one template', () => {
    expect(fmt('{} costs {:$} ({:.1%} off)', 'Widget', 29.99, 0.25))
      .toBe('Widget costs $29.99 (25.0% off)');
  });

  test('mixed positional with format specs', () => {
    expect(fmt('Name: {:>10}, Score: {:.1f}', 'Alice', 97.654))
      .toBe('Name:      Alice, Score: 97.7');
  });
});

// ── Sign handling ───────────────────────────────────────────

describe('fmt — sign', () => {
  test('{:+} shows + for positive', () => {
    expect(fmt('{:+}', 42))
      .toBe('+42');
  });

  test('{:+} shows - for negative', () => {
    expect(fmt('{:+}', -42))
      .toBe('-42');
  });

  test('{:+.2f} sign with float precision', () => {
    expect(fmt('{:+.2f}', 3.14))
      .toBe('+3.14');
  });

  test('{: } space sign for positive', () => {
    expect(fmt('{: }', 42))
      .toBe(' 42');
  });

  test('{: } minus sign for negative', () => {
    expect(fmt('{: }', -42))
      .toBe('-42');
  });
});

// ── Edge cases ──────────────────────────────────────────────

describe('fmt — edge cases', () => {
  test('null value', () => {
    expect(fmt('{}', null))
      .toBe('null');
  });

  test('boolean value', () => {
    expect(fmt('{} and {}', true, false))
      .toBe('true and false');
  });

  test('nested object stringification', () => {
    expect(fmt('{}', {a: 1}))
      .toBe('[object Object]');
  });

  test('empty template with args', () => {
    expect(fmt('', 1, 2, 3))
      .toBe('');
  });

  test('{:.2f} on negative number', () => {
    expect(fmt('{:.2f}', -3.14159))
      .toBe('-3.14');
  });

  test('width 1 does not truncate', () => {
    expect(fmt('{:>1}', 'hello'))
      .toBe('hello');
  });

  test('{:,} with float having many decimals', () => {
    expect(fmt('{:,.2f}', 1000.999))
      .toBe('1,001.00');
  });
});

// ── String type ─────────────────────────────────────────────

describe('fmt — string type', () => {
  test('{:s} explicit string type', () => {
    expect(fmt('{:s}', 'hello'))
      .toBe('hello');
  });

  test('{:>10s} right-aligned string', () => {
    expect(fmt('{:>10s}', 'hello'))
      .toBe('     hello');
  });

  test('{:.3s} string truncation with precision', () => {
    expect(fmt('{:.3s}', 'hello'))
      .toBe('hel');
  });

  test('{:>10.3s} right-aligned truncated string', () => {
    expect(fmt('{:>10.3s}', 'hello'))
      .toBe('       hel');
  });
});

// ── Integration tests (via Tova transpiler) ─────────────────
// Note: Tova uses {} for string interpolation, so format placeholders
// in string literals need escaped braces: \{ and \}

describe('fmt — Tova integration', () => {
  test('positional via Tova', () => {
    // In Tova source: "Hello \\{}, age \\{}" produces literal {}, age {}
    expect(run(`print(fmt("Hello \\{}, age \\{}", "Alice", 30))`))
      .toBe('Hello Alice, age 30');
  });

  test('float precision via Tova', () => {
    expect(run(`print(fmt("\\{:.2f\\}", 3.14159))`))
      .toBe('3.14');
  });

  test('thousands via Tova', () => {
    expect(run(`print(fmt("\\{:,\\}", 1234567))`))
      .toBe('1,234,567');
  });

  test('hex via Tova', () => {
    expect(run(`print(fmt("\\{:x\\}", 255))`))
      .toBe('ff');
  });

  test('currency via Tova', () => {
    expect(run(`print(fmt("\\{:$\\}", 49.9))`))
      .toBe('$49.90');
  });

  test('binary zero-padded via Tova', () => {
    expect(run(`print(fmt("\\{:0>8b\\}", 42))`))
      .toBe('00101010');
  });
});
