// Tests for cache namespace module and LRUCache class

import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

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
  const mockConsole = { log: (...args) => logs.push(args.map(String).join(' ')), warn: () => {}, error: () => {} };
  // Standard test pattern: evaluate transpiler output (not arbitrary user input)
  const fn = new Function('console', 'Date', js);  // eslint-disable-line no-new-func
  fn(mockConsole, Date);
  return logs.join('\n');
}

// ── cache.lru basic get/set ─────────────────────────────────

describe('cache.lru — basic get/set', () => {
  test('set and get returns Some(value)', () => {
    const result = run(`
      c = cache.lru(10)
      c.set("a", 1)
      val = c.get("a")
      print(val.isSome())
      print(val.unwrap())
    `);
    expect(result).toBe('true\n1');
  });

  test('get missing key returns None', () => {
    const result = run(`
      c = cache.lru(10)
      c.set("a", 1)
      val = c.get("b")
      print(val.isNone())
    `);
    expect(result).toBe('true');
  });

  test('overwrite existing key', () => {
    const result = run(`
      c = cache.lru(10)
      c.set("a", 1)
      c.set("a", 2)
      print(c.get("a").unwrap())
    `);
    expect(result).toBe('2');
  });
});

// ── LRU eviction ────────────────────────────────────────────

describe('cache.lru — eviction', () => {
  test('evicts oldest when capacity exceeded', () => {
    const result = run(`
      c = cache.lru(2)
      c.set("a", 1)
      c.set("b", 2)
      c.set("c", 3)
      print(c.get("a").isNone())
      print(c.get("b").unwrap())
      print(c.get("c").unwrap())
    `);
    expect(result).toBe('true\n2\n3');
  });

  test('accessing a key refreshes its position', () => {
    const result = run(`
      c = cache.lru(2)
      c.set("a", 1)
      c.set("b", 2)
      c.get("a")
      c.set("c", 3)
      print(c.get("a").unwrap())
      print(c.get("b").isNone())
      print(c.get("c").unwrap())
    `);
    expect(result).toBe('1\ntrue\n3');
  });
});

// ── has, delete, clear, size ────────────────────────────────

describe('cache.lru — has, delete, clear, size', () => {
  test('has returns true for existing key', () => {
    const result = run(`
      c = cache.lru(10)
      c.set("a", 1)
      print(c.has("a"))
      print(c.has("b"))
    `);
    expect(result).toBe('true\nfalse');
  });

  test('delete removes a key', () => {
    const result = run(`
      c = cache.lru(10)
      c.set("a", 1)
      c.set("b", 2)
      del_result = c.delete("a")
      print(del_result)
      print(c.has("a"))
      print(c.size())
    `);
    expect(result).toBe('true\nfalse\n1');
  });

  test('clear removes all entries and resets stats', () => {
    const result = run(`
      c = cache.lru(10)
      c.set("a", 1)
      c.set("b", 2)
      c.get("a")
      c.get("missing")
      c.clear()
      print(c.size())
      s = c.stats()
      print(s.hits)
      print(s.misses)
    `);
    expect(result).toBe('0\n0\n0');
  });

  test('size tracks number of entries', () => {
    const result = run(`
      c = cache.lru(10)
      print(c.size())
      c.set("a", 1)
      print(c.size())
      c.set("b", 2)
      print(c.size())
    `);
    expect(result).toBe('0\n1\n2');
  });
});

// ── stats ───────────────────────────────────────────────────

describe('cache.lru — stats', () => {
  test('tracks hits and misses', () => {
    const result = run(`
      c = cache.lru(10)
      c.set("a", 1)
      c.get("a")
      c.get("a")
      c.get("b")
      s = c.stats()
      print(s.hits)
      print(s.misses)
      print(s.hit_rate)
    `);
    // 2 hits, 1 miss, hit_rate = 2/3
    expect(result).toMatch(/^2\n1\n0\.666/);
  });

  test('stats with no accesses returns 0 hit_rate', () => {
    const result = run(`
      c = cache.lru(10)
      s = c.stats()
      print(s.hits)
      print(s.misses)
      print(s.hit_rate)
    `);
    expect(result).toBe('0\n0\n0');
  });
});

// ── cache.ttl ───────────────────────────────────────────────

describe('cache.ttl — basic operation', () => {
  test('set and immediate get works', () => {
    const result = run(`
      c = cache.ttl(10, 60000)
      c.set("key", "value")
      val = c.get("key")
      print(val.isSome())
      print(val.unwrap())
    `);
    expect(result).toBe('true\nvalue');
  });

  test('has works with ttl cache', () => {
    const result = run(`
      c = cache.ttl(10, 60000)
      c.set("x", 42)
      print(c.has("x"))
      print(c.has("y"))
    `);
    expect(result).toBe('true\nfalse');
  });
});

// ── keys ────────────────────────────────────────────────────

describe('cache.lru — keys', () => {
  test('returns current keys', () => {
    const result = run(`
      c = cache.lru(10)
      c.set("a", 1)
      c.set("b", 2)
      c.set("c", 3)
      k = c.keys()
      print(len(k))
      print(k[0])
      print(k[1])
      print(k[2])
    `);
    expect(result).toBe('3\na\nb\nc');
  });

  test('keys reflects eviction', () => {
    const result = run(`
      c = cache.lru(2)
      c.set("a", 1)
      c.set("b", 2)
      c.set("c", 3)
      k = c.keys()
      print(len(k))
      print(k[0])
      print(k[1])
    `);
    expect(result).toBe('2\nb\nc');
  });
});
