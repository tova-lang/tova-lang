import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

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
  const mockConsole = {
    log: (...a) => logs.push({ level: 'log', args: a }),
    warn: (...a) => logs.push({ level: 'warn', args: a }),
    error: (...a) => logs.push({ level: 'error', args: a }),
    debug: (...a) => logs.push({ level: 'debug', args: a }),
  };
  // Standard test pattern: sandboxes compiled code with mock globals
  const execFn = new Function('console', 'Date', 'process', js);  // eslint-disable-line no-new-func
  execFn(mockConsole, Date, { env: { NO_COLOR: '1' }, stdout: { isTTY: false } });
  return logs;
}

// ─── Basic logging methods ──────────────────────────────

describe('log namespace - basic methods', () => {
  test('log.info emits output', () => {
    const logs = run('log.info("server started")');
    expect(logs.length).toBe(1);
    expect(logs[0].level).toBe('log'); // info uses console.log
    expect(logs[0].args[0]).toContain('INF');
    expect(logs[0].args[0]).toContain('server started');
  });

  test('log.warn emits output', () => {
    const logs = run('log.warn("deprecated")');
    expect(logs.length).toBe(1);
    expect(logs[0].level).toBe('warn');
    expect(logs[0].args[0]).toContain('WRN');
    expect(logs[0].args[0]).toContain('deprecated');
  });

  test('log.error emits to console.error', () => {
    const logs = run('log.error("failed")');
    expect(logs.length).toBe(1);
    expect(logs[0].level).toBe('error');
    expect(logs[0].args[0]).toContain('ERR');
    expect(logs[0].args[0]).toContain('failed');
  });

  test('log.debug does not emit at default level (info)', () => {
    const logs = run('log.debug("trace info")');
    expect(logs.length).toBe(0); // debug (0) < info (1), filtered out
  });

  test('log.debug emits when level set to debug', () => {
    const logs = run(`
      log.level("debug")
      log.debug("trace info")
    `);
    expect(logs.length).toBe(1);
    expect(logs[0].level).toBe('debug');
    expect(logs[0].args[0]).toContain('DBG');
    expect(logs[0].args[0]).toContain('trace info');
  });
});

// ─── Level filtering ────────────────────────────────────

describe('log namespace - level filtering', () => {
  test('log.level("warn") filters out info', () => {
    const logs = run(`
      log.level("warn")
      log.info("hidden")
    `);
    expect(logs.length).toBe(0);
  });

  test('log.level("warn") allows warn through', () => {
    const logs = run(`
      log.level("warn")
      log.warn("visible")
    `);
    expect(logs.length).toBe(1);
    expect(logs[0].args[0]).toContain('visible');
  });

  test('log.level("warn") allows error through', () => {
    const logs = run(`
      log.level("warn")
      log.error("critical")
    `);
    expect(logs.length).toBe(1);
    expect(logs[0].args[0]).toContain('critical');
  });

  test('log.level("error") filters out warn', () => {
    const logs = run(`
      log.level("error")
      log.warn("hidden")
    `);
    expect(logs.length).toBe(0);
  });

  test('log.level("silent") filters everything', () => {
    const logs = run(`
      log.level("silent")
      log.info("hidden")
      log.warn("hidden")
      log.error("hidden")
    `);
    expect(logs.length).toBe(0);
  });

  test('log.level("debug") shows all levels', () => {
    const logs = run(`
      log.level("debug")
      log.debug("d")
      log.info("i")
      log.warn("w")
      log.error("e")
    `);
    expect(logs.length).toBe(4);
  });
});

// ─── Data parameter ─────────────────────────────────────

describe('log namespace - data parameter', () => {
  test('log.info with data object', () => {
    const logs = run('log.info("request", {status: 200})');
    expect(logs.length).toBe(1);
    expect(logs[0].args[0]).toContain('200');
  });

  test('log.info with string data', () => {
    const logs = run('log.info("user", "alice")');
    expect(logs.length).toBe(1);
    expect(logs[0].args[0]).toContain('alice');
  });
});

// ─── JSON format ────────────────────────────────────────

describe('log namespace - JSON format', () => {
  test('log.format("json") outputs JSON', () => {
    const logs = run(`
      log.format("json")
      log.info("hello")
    `);
    expect(logs.length).toBe(1);
    const parsed = JSON.parse(logs[0].args[0]);
    expect(parsed.level).toBe('info');
    expect(parsed.msg).toBe('hello');
    expect(parsed.timestamp).toBeDefined();
  });

  test('JSON format includes data fields', () => {
    const logs = run(`
      log.format("json")
      log.info("req", {method: "GET", path: "/api"})
    `);
    expect(logs.length).toBe(1);
    const parsed = JSON.parse(logs[0].args[0]);
    expect(parsed.method).toBe('GET');
    expect(parsed.path).toBe('/api');
  });

  test('JSON format with warn level', () => {
    const logs = run(`
      log.format("json")
      log.warn("slow query")
    `);
    expect(logs.length).toBe(1);
    const parsed = JSON.parse(logs[0].args[0]);
    expect(parsed.level).toBe('warn');
    expect(parsed.msg).toBe('slow query');
  });
});

// ─── Child logger with context ──────────────────────────

describe('log namespace - child logger (log.with)', () => {
  test('log.with creates child logger with bound context', () => {
    const logs = run(`
      reqLog = log.with({request_id: "abc"})
      reqLog.info("handling request")
    `);
    expect(logs.length).toBe(1);
    expect(logs[0].args[0]).toContain('request_id');
    expect(logs[0].args[0]).toContain('abc');
  });

  test('child logger in JSON mode includes context', () => {
    const logs = run(`
      log.format("json")
      reqLog = log.with({request_id: "abc"})
      reqLog.info("handling")
    `);
    expect(logs.length).toBe(1);
    const parsed = JSON.parse(logs[0].args[0]);
    expect(parsed.request_id).toBe('abc');
    expect(parsed.msg).toBe('handling');
  });

  test('child logger inherits level filtering', () => {
    const logs = run(`
      log.level("warn")
      child = log.with({service: "auth"})
      child.info("hidden")
      child.warn("visible")
    `);
    expect(logs.length).toBe(1);
    expect(logs[0].args[0]).toContain('visible');
  });

  test('nested child loggers merge context', () => {
    const logs = run(`
      log.format("json")
      svcLog = log.with({service: "api"})
      reqLog = svcLog.with({request_id: "123"})
      reqLog.info("nested")
    `);
    expect(logs.length).toBe(1);
    const parsed = JSON.parse(logs[0].args[0]);
    expect(parsed.service).toBe('api');
    expect(parsed.request_id).toBe('123');
  });
});

// ─── Pretty mode output format ──────────────────────────

describe('log namespace - pretty format', () => {
  test('pretty output contains timestamp HH:MM:SS', () => {
    const logs = run('log.info("test")');
    expect(logs.length).toBe(1);
    // Should contain a time-like pattern (HH:MM:SS)
    expect(logs[0].args[0]).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  test('pretty output does not contain ANSI codes when NO_COLOR set', () => {
    const logs = run('log.info("test")');
    expect(logs.length).toBe(1);
    // NO_COLOR is set in our mock process, so no ANSI escape codes
    expect(logs[0].args[0]).not.toContain('\x1b[');
  });
});

// ─── Codegen ────────────────────────────────────────────

describe('log namespace - codegen', () => {
  test('log.info compiles to valid JS', () => {
    const js = compile('log.info("hello")');
    expect(js).toContain('var log');
    expect(js).toContain('log.info("hello")');
  });

  test('log.warn compiles to valid JS', () => {
    const js = compile('log.warn("deprecated")');
    expect(js).toContain('var log');
  });

  test('log.error compiles to valid JS', () => {
    const js = compile('log.error("failed")');
    expect(js).toContain('var log');
  });

  test('log.level compiles to valid JS', () => {
    const js = compile('log.level("debug")');
    expect(js).toContain('var log');
  });

  test('log.format compiles to valid JS', () => {
    const js = compile('log.format("json")');
    expect(js).toContain('var log');
  });

  test('log.with compiles to valid JS', () => {
    const js = compile('reqLog = log.with({id: "abc"})');
    expect(js).toContain('var log');
  });

  test('log namespace not emitted when not used', () => {
    const js = compile('x = 42');
    expect(js).not.toContain('var log');
  });
});

// ─── math.log still works ───────────────────────────────

describe('log namespace - math.log compatibility', () => {
  test('math.log() still works for natural logarithm', () => {
    const js = compile('x = math.log(1)');
    expect(js).toContain('math.log(1)');
    // Should include the math namespace
    expect(js).toContain('const math');
  });
});
