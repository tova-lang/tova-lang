import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

// Helper to compile Tova code and run it with captured console output.
// Uses new Function() intentionally — this is the standard pattern for
// executing compiler output in Tova's test suite (see tests/new-features.test.js).
function compile(code) {
  const lexer = new Lexer(code, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const gen = new CodeGenerator(ast, '<test>');
  return gen.generate().shared.trim();
}

function run(code) {
  const js = compile(code);
  const logs = [];
  // eslint-disable-next-line no-new-func -- safe: test-only, evaluates compiler output
  const fn = new Function('console', 'process', js);
  fn(
    { log: (...args) => logs.push(args), warn: () => {}, error: () => {} },
    { env: { NO_COLOR: '1' }, stdout: { isTTY: false } }
  );
  return logs;
}

function runWithColor(code) {
  const js = compile(code);
  const logs = [];
  // eslint-disable-next-line no-new-func -- safe: test-only, evaluates compiler output
  const fn = new Function('console', 'process', js);
  fn(
    { log: (...args) => logs.push(args), warn: () => {}, error: () => {} },
    { env: {}, stdout: { isTTY: true } }
  );
  return logs;
}

describe('Enhanced print()', () => {

  // ── Basic pass-through ──────────────────────────────────
  test('basic string pass-through', () => {
    const logs = run('print("hello world")');
    expect(logs.length).toBe(1);
    expect(logs[0][0]).toBe('hello world');
  });

  test('multiple string args', () => {
    const logs = run('print("hello", "world")');
    expect(logs.length).toBe(1);
    expect(logs[0]).toEqual(['hello', 'world']);
  });

  test('number pass through as-is', () => {
    const logs = run('print(42)');
    expect(logs.length).toBe(1);
    expect(logs[0][0]).toBe(42);
  });

  test('boolean pass through', () => {
    const logs = run('print(true)');
    expect(logs.length).toBe(1);
    expect(logs[0][0]).toBe(true);
  });

  test('nil pass through', () => {
    const logs = run('print(nil)');
    expect(logs.length).toBe(1);
    expect(logs[0][0]).toBe(null);
  });

  // ── Style tags in NO_COLOR mode ─────────────────────────
  // Note: In Tova, {expr} inside double-quoted strings is interpolation.
  // To pass literal {red} to print at runtime, use escaped braces: \{ and \}
  test('style tags stripped in NO_COLOR mode', () => {
    const logs = run('print("\\{red\\}Error:\\{/\\} broke")');
    expect(logs.length).toBe(1);
    expect(logs[0][0]).toBe('Error: broke');
  });

  test('multiple style tags stripped in NO_COLOR mode', () => {
    const logs = run('print("\\{bold\\}\\{green\\}Success:\\{/\\} done")');
    expect(logs.length).toBe(1);
    expect(logs[0][0]).toBe('Success: done');
  });

  test('all color tags stripped in NO_COLOR mode', () => {
    const logs = run('print("\\{yellow\\}warn\\{/\\} \\{blue\\}info\\{/\\} \\{magenta\\}debug\\{/\\} \\{cyan\\}trace\\{/\\} \\{gray\\}low\\{/\\} \\{dim\\}faint\\{/\\} \\{underline\\}ul\\{/\\}")');
    expect(logs.length).toBe(1);
    expect(logs[0][0]).toBe('warn info debug trace low faint ul');
  });

  // ── Style tags with color enabled ───────────────────────
  test('style tags produce ANSI codes with color enabled', () => {
    const logs = runWithColor('print("\\{red\\}Error:\\{/\\} broke")');
    expect(logs.length).toBe(1);
    const output = logs[0][0];
    expect(output).toContain('\x1b[31m');  // red
    expect(output).toContain('\x1b[0m');   // reset
    expect(output).toContain('Error:');
    expect(output).toContain('broke');
  });

  test('bold tag produces ANSI code', () => {
    const logs = runWithColor('print("\\{bold\\}Title\\{/\\}")');
    expect(logs[0][0]).toContain('\x1b[1m');
    expect(logs[0][0]).toContain('Title');
  });

  // ── Pretty-print objects ────────────────────────────────
  test('single object arg pretty-printed as JSON', () => {
    const logs = run(`
      x = { name: "alice", age: 30 }
      print(x)
    `);
    expect(logs.length).toBe(1);
    const output = logs[0][0];
    expect(typeof output).toBe('string');
    expect(output).toContain('"name"');
    expect(output).toContain('"alice"');
    expect(output).toContain('"age"');
    expect(output).toContain('30');
  });

  test('multiple args with object NOT pretty-printed', () => {
    // When there are multiple args, objects should pass through unchanged
    const logs = run(`
      x = { name: "alice" }
      print("user:", x)
    `);
    expect(logs.length).toBe(1);
    expect(logs[0][0]).toBe('user:');
    // Second arg should be the raw object (not stringified)
    expect(typeof logs[0][1]).toBe('object');
    expect(logs[0][1].name).toBe('alice');
  });

  // ── Auto table for arrays of objects ────────────────────
  test('array of objects rendered as table', () => {
    const logs = run(`
      data = [{ name: "alice", age: 30 }, { name: "bob", age: 25 }]
      print(data)
    `);
    expect(logs.length).toBe(1);
    const output = logs[0][0];
    expect(typeof output).toBe('string');
    // Should contain column headers
    expect(output).toContain('name');
    expect(output).toContain('age');
    // Should contain data
    expect(output).toContain('alice');
    expect(output).toContain('bob');
    expect(output).toContain('30');
    expect(output).toContain('25');
    // Should contain separator
    expect(output).toContain('-');
  });

  test('empty array passes through', () => {
    const logs = run(`
      data = []
      print(data)
    `);
    expect(logs.length).toBe(1);
    // Empty array should pass through as pretty-printed JSON
  });

  test('array of primitives passes through as JSON', () => {
    const logs = run(`
      data = [1, 2, 3]
      print(data)
    `);
    expect(logs.length).toBe(1);
    const output = logs[0][0];
    // Array of primitives is an object, gets JSON stringified as single arg
    expect(typeof output).toBe('string');
    expect(output).toContain('1');
    expect(output).toContain('2');
    expect(output).toContain('3');
  });

  // ── Non-clashing tags ───────────────────────────────────
  test('curly braces that are not style tags pass through', () => {
    // {name} is not a recognized style tag, so it stays as-is
    const logs = run('print("\\{name\\} is here")');
    expect(logs[0][0]).toBe('{name} is here');
  });

  test('string interpolation values pass through correctly', () => {
    const logs = run(`
      name = "world"
      print("hello {name}")
    `);
    expect(logs.length).toBe(1);
    // Tova interpolation happens at compile time, so print sees "hello world"
    expect(logs[0][0]).toBe('hello world');
  });

  // ── Backward compatibility ──────────────────────────────
  test('multiple mixed args pass through unchanged', () => {
    const logs = run('print("count:", 42, true)');
    expect(logs.length).toBe(1);
    expect(logs[0]).toEqual(['count:', 42, true]);
  });
});
