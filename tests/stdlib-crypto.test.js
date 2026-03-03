import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

// Helper to compile Tova code and run it with captured console output.
// Uses new Function() intentionally — this is the standard pattern for
// executing compiler output in Tova's test suite (see tests/new-features.test.js).
function run(code) {
  const lexer = new Lexer(code, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const gen = new CodeGenerator(ast, '<test>');
  const js = gen.generate().shared;
  const logs = [];
  const fn = new Function('console', 'require', 'Buffer', js);
  fn({ log: (...a) => logs.push(a.map(String).join(' ')), warn: () => {}, error: () => {} }, require, Buffer);
  return logs.join('\n');
}

describe('crypto namespace module', () => {
  test('crypto.sha256 produces 64-char hex string', () => {
    const out = run('print(crypto.sha256("hello"))');
    expect(out).toHaveLength(64);
    expect(out).toMatch(/^[0-9a-f]{64}$/);
  });

  test('crypto.sha256 is deterministic', () => {
    const out1 = run('print(crypto.sha256("hello"))');
    const out2 = run('print(crypto.sha256("hello"))');
    expect(out1).toBe(out2);
  });

  test('crypto.sha256 known value', () => {
    const out = run('print(crypto.sha256("hello"))');
    // SHA-256 of "hello" is well-known
    expect(out).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  test('crypto.sha512 produces 128-char hex string', () => {
    const out = run('print(crypto.sha512("hello"))');
    expect(out).toHaveLength(128);
    expect(out).toMatch(/^[0-9a-f]{128}$/);
  });

  test('crypto.hmac produces non-empty hex', () => {
    const out = run('print(crypto.hmac("sha256", "key", "data"))');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/^[0-9a-f]+$/);
  });

  test('crypto.random_bytes returns correct length', () => {
    const out = run('print(crypto.random_bytes(16).length)');
    expect(out).toBe('16');
  });

  test('crypto.random_int returns value in range', () => {
    const out = run(`
      result = true
      i = 0
      for i in range(100) {
        v = crypto.random_int(1, 10)
        if v < 1 {
          result = false
        }
        if v > 10 {
          result = false
        }
      }
      print(result)
    `);
    expect(out).toBe('true');
  });

  test('crypto.hash_password + verify_password round-trip', () => {
    const out = run(`
      hashed = crypto.hash_password("mypassword")
      match hashed {
        Ok(h) => {
          verified = crypto.verify_password("mypassword", h)
          print(verified)
        }
        Err(e) => print("error")
      }
    `);
    expect(out).toBe('true');
  });

  test('crypto.verify_password rejects wrong password', () => {
    const out = run(`
      hashed = crypto.hash_password("mypassword")
      match hashed {
        Ok(h) => {
          verified = crypto.verify_password("wrongpassword", h)
          print(verified)
        }
        Err(e) => print("error")
      }
    `);
    expect(out).toBe('false');
  });

  test('crypto.encrypt + decrypt round-trip', () => {
    const out = run(`
      key = "12345678901234567890123456789012"
      encrypted = crypto.encrypt("hello world", key)
      match encrypted {
        Ok(ct) => {
          decrypted = crypto.decrypt(ct, key)
          match decrypted {
            Ok(pt) => print(pt)
            Err(e) => print("decrypt error")
          }
        }
        Err(e) => print("encrypt error")
      }
    `);
    expect(out).toBe('hello world');
  });

  test('crypto.decrypt fails with wrong key', () => {
    const out = run(`
      key1 = "12345678901234567890123456789012"
      key2 = "abcdefghijklmnopqrstuvwxyz123456"
      encrypted = crypto.encrypt("secret data", key1)
      match encrypted {
        Ok(ct) => {
          decrypted = crypto.decrypt(ct, key2)
          match decrypted {
            Ok(pt) => print("should not succeed")
            Err(e) => print("failed as expected")
          }
        }
        Err(e) => print("encrypt error")
      }
    `);
    expect(out).toBe('failed as expected');
  });

  test('crypto.constant_time_equal returns true for equal strings', () => {
    const out = run('print(crypto.constant_time_equal("abc", "abc"))');
    expect(out).toBe('true');
  });

  test('crypto.constant_time_equal returns false for different strings', () => {
    const out = run('print(crypto.constant_time_equal("abc", "def"))');
    expect(out).toBe('false');
  });

  test('crypto.constant_time_equal returns false for different lengths', () => {
    const out = run('print(crypto.constant_time_equal("abc", "abcd"))');
    expect(out).toBe('false');
  });

  test('crypto.hash_password returns Ok result', () => {
    const out = run(`
      hashed = crypto.hash_password("test")
      print(hashed.isOk())
    `);
    expect(out).toBe('true');
  });

  test('crypto.hash_password format is salt:hash', () => {
    const out = run(`
      hashed = crypto.hash_password("test")
      match hashed {
        Ok(h) => {
          parts = h.split(":")
          print(parts.length)
        }
        Err(e) => print("error")
      }
    `);
    expect(out).toBe('2');
  });

  test('crypto.encrypt returns Ok result', () => {
    const out = run(`
      key = "12345678901234567890123456789012"
      enc_result = crypto.encrypt("data", key)
      print(enc_result.isOk())
    `);
    expect(out).toBe('true');
  });
});
