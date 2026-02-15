import { describe, test, expect } from 'bun:test';
import { parseTOML, stringifyTOML } from '../src/config/toml.js';

describe('TOML Parser', () => {
  test('parses empty input', () => {
    expect(parseTOML('')).toEqual({});
  });

  test('parses comments and blank lines', () => {
    const result = parseTOML(`
# This is a comment

# Another comment
`);
    expect(result).toEqual({});
  });

  test('parses string values', () => {
    const result = parseTOML(`
name = "my-app"
version = "0.1.0"
`);
    expect(result.name).toBe('my-app');
    expect(result.version).toBe('0.1.0');
  });

  test('parses single-quoted strings (literal)', () => {
    const result = parseTOML(`path = 'C:\\Users\\test'`);
    expect(result.path).toBe('C:\\Users\\test');
  });

  test('parses escape sequences in double-quoted strings', () => {
    const result = parseTOML(`msg = "hello\\nworld"`);
    expect(result.msg).toBe('hello\nworld');
  });

  test('parses numbers', () => {
    const result = parseTOML(`
port = 3000
ratio = 1.5
negative = -42
`);
    expect(result.port).toBe(3000);
    expect(result.ratio).toBe(1.5);
    expect(result.negative).toBe(-42);
  });

  test('parses booleans', () => {
    const result = parseTOML(`
enabled = true
debug = false
`);
    expect(result.enabled).toBe(true);
    expect(result.debug).toBe(false);
  });

  test('parses sections', () => {
    const result = parseTOML(`
[project]
name = "my-app"
version = "0.1.0"

[build]
output = ".tova-out"
`);
    expect(result.project.name).toBe('my-app');
    expect(result.project.version).toBe('0.1.0');
    expect(result.build.output).toBe('.tova-out');
  });

  test('parses dotted sections', () => {
    const result = parseTOML(`
[npm.dev]
prettier = "^3.0.0"
`);
    expect(result.npm.dev.prettier).toBe('^3.0.0');
  });

  test('parses arrays', () => {
    const result = parseTOML(`features = ["a", "b", "c"]`);
    expect(result.features).toEqual(['a', 'b', 'c']);
  });

  test('parses empty arrays', () => {
    const result = parseTOML(`items = []`);
    expect(result.items).toEqual([]);
  });

  test('parses numeric arrays', () => {
    const result = parseTOML(`nums = [1, 2, 3]`);
    expect(result.nums).toEqual([1, 2, 3]);
  });

  test('parses inline comments', () => {
    const result = parseTOML(`port = 3000 # default port`);
    expect(result.port).toBe(3000);
  });

  test('does not strip # inside quoted strings', () => {
    const result = parseTOML(`color = "#ff0000"`);
    expect(result.color).toBe('#ff0000');
  });

  test('parses full tova.toml example', () => {
    const result = parseTOML(`
[project]
name = "my-app"
version = "0.1.0"
description = "A full-stack Tova application"
entry = "src"

[build]
output = ".tova-out"

[dev]
port = 3000

[dependencies]
# future: tova-native packages

[npm]
htmx = "^2.0.0"
zod = "^3.0.0"

[npm.dev]
prettier = "^3.0.0"
`);
    expect(result.project.name).toBe('my-app');
    expect(result.project.entry).toBe('src');
    expect(result.build.output).toBe('.tova-out');
    expect(result.dev.port).toBe(3000);
    expect(result.npm.htmx).toBe('^2.0.0');
    expect(result.npm.zod).toBe('^3.0.0');
    expect(result.npm.dev.prettier).toBe('^3.0.0');
  });

  test('throws on unclosed section header', () => {
    expect(() => parseTOML('[project')).toThrow('unclosed section header');
  });

  test('throws on empty section name', () => {
    expect(() => parseTOML('[]')).toThrow('empty section name');
  });

  test('handles bare values (version ranges)', () => {
    // Bare values without quotes should still work for compat
    const result = parseTOML(`ver = ^2.0.0`);
    expect(result.ver).toBe('^2.0.0');
  });
});

describe('TOML Stringify', () => {
  test('stringifies simple object', () => {
    const result = stringifyTOML({
      project: {
        name: 'my-app',
        version: '0.1.0',
      },
    });
    expect(result).toContain('[project]');
    expect(result).toContain('name = "my-app"');
    expect(result).toContain('version = "0.1.0"');
  });

  test('stringifies nested sections', () => {
    const result = stringifyTOML({
      npm: {
        htmx: '^2.0.0',
        dev: {
          prettier: '^3.0.0',
        },
      },
    });
    expect(result).toContain('[npm]');
    expect(result).toContain('htmx = "^2.0.0"');
    expect(result).toContain('[npm.dev]');
    expect(result).toContain('prettier = "^3.0.0"');
  });

  test('stringifies booleans and numbers', () => {
    const result = stringifyTOML({
      dev: {
        port: 3000,
        debug: true,
      },
    });
    expect(result).toContain('port = 3000');
    expect(result).toContain('debug = true');
  });

  test('roundtrips through parse', () => {
    const original = {
      project: {
        name: 'test',
        version: '1.0.0',
      },
      dev: {
        port: 8080,
      },
    };
    const toml = stringifyTOML(original);
    const parsed = parseTOML(toml);
    expect(parsed.project.name).toBe('test');
    expect(parsed.project.version).toBe('1.0.0');
    expect(parsed.dev.port).toBe(8080);
  });
});
