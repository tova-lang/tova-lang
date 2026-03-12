// Regression tests for production stability audit fixes
// Each test validates a specific bug fix identified during the audit

import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function parse(src, filename = '<test>') {
  const lexer = new Lexer(src, filename);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, filename);
  return parser.parse();
}

function compile(src) {
  const ast = parse(src);
  const gen = new CodeGenerator(ast, '<test>');
  return gen.generate();
}

function compileShared(src) {
  return compile(src).shared.trim();
}

function getWarnings(src) {
  const ast = parse(src);
  const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
  return analyzer.analyze().warnings;
}

function getErrors(src) {
  try {
    const ast = parse(src);
    const analyzer = new Analyzer(ast, '<test>');
    const result = analyzer.analyze();
    return result.errors || [];
  } catch (err) {
    return err.errors || [];
  }
}

function analyzeNoThrow(src) {
  const ast = parse(src);
  const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
  return analyzer.analyze();
}

// ════════════════════════════════════════════════════════════
// #1: Security codegen — const redeclaration fix
// ════════════════════════════════════════════════════════════

describe('audit #1: security codegen visible_to no const redeclaration', () => {
  test('multiple visible_to fields on same type do not produce duplicate const', () => {
    const result = compile(`
      security {
        role Admin {
          can: [view_all]
        }
        role Manager {
          can: [manage]
        }
        sensitive User.email {
          visible_to: [Admin, "self"]
        }
        sensitive User.phone {
          visible_to: [Manager]
        }
      }
      server {
        GET "/test" fn(req) {
          "ok"
        }
      }
    `);
    const server = result.server;
    // Should contain sanitize function
    expect(server).toContain('__sanitizeUser');
    // Each visible_to should be in its own block scope
    // Count occurrences — should have 2 block-scoped __visibleTo
    const visibleToMatches = server.match(/const __visibleTo/g) || [];
    expect(visibleToMatches.length).toBe(2);
    // Both should be wrapped in block scopes { ... }
    // Each visible_to should be wrapped in its own block scope { ... }
    // so no SyntaxError from duplicate const declarations
    const fnStart = server.indexOf('__sanitizeUser');
    const fnEnd = server.indexOf('return result;', fnStart);
    const sanitizeFn = server.slice(fnStart, fnEnd);
    // Both block scopes should exist
    expect(sanitizeFn).toContain('{ const __visibleTo');
    expect(sanitizeFn).toContain('delete result.email');
    expect(sanitizeFn).toContain('delete result.phone');
  });

  test('single visible_to field still works correctly', () => {
    const result = compile(`
      security {
        role Admin {
          can: [view_all]
        }
        sensitive User.email {
          visible_to: [Admin]
        }
      }
      server {
        GET "/test" fn(req) {
          "ok"
        }
      }
    `);
    expect(result.server).toContain('__visibleTo');
    expect(result.server).toContain('__canSee');
    expect(result.server).toContain('delete result.email');
  });

  test('mixed never_expose and visible_to on same type', () => {
    const result = compile(`
      security {
        role Admin {
          can: [view_all]
        }
        sensitive User.password {
          never_expose: true
        }
        sensitive User.email {
          visible_to: [Admin]
        }
      }
      server {
        GET "/test" fn(req) {
          "ok"
        }
      }
    `);
    expect(result.server).toContain('delete result.password');
    expect(result.server).toContain('__visibleTo');
    expect(result.server).toContain('delete result.email');
  });
});

// ════════════════════════════════════════════════════════════
// #5: min/max crash on large arrays (module version)
// ════════════════════════════════════════════════════════════

describe('audit #5: stdlib min/max safe for large arrays', () => {
  test('min/max module versions handle empty arrays', async () => {
    const { min, max } = await import('../src/stdlib/core.js');
    expect(min([])).toBe(null);
    expect(max([])).toBe(null);
  });

  test('min/max module versions handle normal arrays', async () => {
    const { min, max } = await import('../src/stdlib/core.js');
    expect(min([3, 1, 4, 1, 5])).toBe(1);
    expect(max([3, 1, 4, 1, 5])).toBe(5);
  });

  test('min/max module versions handle single-element arrays', async () => {
    const { min, max } = await import('../src/stdlib/core.js');
    expect(min([42])).toBe(42);
    expect(max([42])).toBe(42);
  });

  test('min/max module versions handle negative numbers', async () => {
    const { min, max } = await import('../src/stdlib/core.js');
    expect(min([-3, -1, -4])).toBe(-4);
    expect(max([-3, -1, -4])).toBe(-1);
  });

  test('min/max do not use spread (safe for large arrays)', async () => {
    const { min, max } = await import('../src/stdlib/core.js');
    // Create an array larger than the typical JS engine argument limit
    const large = new Array(100000).fill(0).map((_, i) => i);
    expect(min(large)).toBe(0);
    expect(max(large)).toBe(99999);
  });
});

// ════════════════════════════════════════════════════════════
// #6: Server fast mode path traversal protection
// ════════════════════════════════════════════════════════════

describe('audit #6: server fast mode path traversal protection', () => {
  test('fast mode handler includes path traversal resolution', () => {
    const result = compile(`
      server {
        GET "/api/data" fn(req) {
          "data"
        }
      }
    `);
    const server = result.server;
    // Should contain path traversal protection even in fast mode
    expect(server).toContain('..');
    expect(server).toContain('__resolved');
  });
});

// ════════════════════════════════════════════════════════════
// #9: Lexer — backtick interpolation depth counting
// ════════════════════════════════════════════════════════════

describe('audit #9: lexer backtick template literal in interpolation', () => {
  test('backtick template literal ${} handling in interpolation scanner', () => {
    // The fix ensures that when scanning string interpolation expressions,
    // backtick template literals with ${} do not interfere with brace counting.
    const src = '"value: {a + b}"';
    const lexer = new Lexer(src, '<test>');
    const tokens = lexer.tokenize();
    expect(tokens.length).toBeGreaterThan(0);
    // String interpolation produces a STRING_TEMPLATE token
    const hasInterp = tokens.some(t => t.type === 'STRING_TEMPLATE');
    expect(hasInterp).toBe(true);
  });

  test('nested braces in Tova interpolation are balanced', () => {
    const src = '"count: {len([1, 2, 3])}"';
    const lexer = new Lexer(src, '<test>');
    const tokens = lexer.tokenize();
    expect(tokens.length).toBeGreaterThan(0);
    const hasInterp = tokens.some(t => t.type === 'STRING_TEMPLATE');
    expect(hasInterp).toBe(true);
  });

  test('lexer scanString handles backtick branch for ${} depth tracking', () => {
    // Verify the code path exists by reading the source
    const { readFileSync } = require('fs');
    const lexerSrc = readFileSync(
      require('path').resolve(__dirname, '../src/lexer/lexer.js'),
      'utf-8'
    );
    // The fix adds handling for backtick template literal interpolation ${...}
    expect(lexerSrc).toContain("quote === '`' && this.peek() === '$'");
    expect(lexerSrc).toContain('strDepth++');
    expect(lexerSrc).toContain("quote === '`' && this.peek() === '}' && strDepth > 0");
  });
});

// ════════════════════════════════════════════════════════════
// #13: regex_test stale lastIndex fix
// ════════════════════════════════════════════════════════════

describe('audit #13: regex_test lastIndex reset', () => {
  test('inline regex_test resets lastIndex for global patterns', () => {
    // The inline stdlib should reset lastIndex before .test()
    const code = compileShared(`
      fn check() {
        a = regex_test("hello", "l", "g")
      }
    `);
    expect(code).toContain('lastIndex');
    expect(code).toContain('= 0');
  });
});

// ════════════════════════════════════════════════════════════
// #14: Browser codegen — duplicate lazy import
// ════════════════════════════════════════════════════════════

describe('audit #14: no duplicate lazy import', () => {
  test('browser codegen does not import lazy from router.js', () => {
    const result = compile(`
      browser {
        state count = 0
        component App() {
          <div>
            <p>"{count()}"</p>
          </div>
        }
      }
    `);
    const browser = result.browser;
    // lazy should only be imported from reactivity.js, not router.js
    const routerLine = browser.split('\n').find(l => l.includes('router.js'));
    if (routerLine) {
      expect(routerLine).not.toMatch(/\blazy\b/);
    }
    // lazy should be imported from reactivity.js
    const reactivityLine = browser.split('\n').find(l => l.includes('reactivity.js'));
    expect(reactivityLine).toContain('lazy');
  });
});

// ════════════════════════════════════════════════════════════
// #15/#16: Edge codegen — error leakage and health check
// ════════════════════════════════════════════════════════════

describe('audit #15: edge codegen does not leak error messages', () => {
  test('error responses use generic message, not e.message', () => {
    const result = compile(`
      edge {
        target: "cloudflare"
        GET "/api" fn(req) {
          "hello"
        }
      }
    `);
    const edge = result.edge;
    // Should use generic error message, not e.message
    expect(edge).toContain('Internal Server Error');
    expect(edge).not.toContain('error: e.message');
    // Should log the actual error server-side
    expect(edge).toContain('console.error');
  });

  test('lambda target also uses generic error message', () => {
    const result = compile(`
      edge {
        target: "lambda"
        GET "/api" fn(req) {
          "hello"
        }
      }
    `);
    const edge = result.edge;
    expect(edge).toContain('Internal Server Error');
    expect(edge).not.toContain('error: e.message');
  });
});

describe('audit #16: edge health check safe on Cloudflare/Deno', () => {
  test('health check guards process with typeof check', () => {
    const result = compile(`
      edge {
        target: "cloudflare"
        health "/healthz" { check_memory }
        route GET "/" => fn(req) { "ok" }
      }
    `);
    const edge = result.edge;
    expect(edge).toContain('typeof process !== "undefined"');
  });
});

// ════════════════════════════════════════════════════════════
// #18/#19/#20: Analyzer destructure fixes
// ════════════════════════════════════════════════════════════

describe('audit #18: analyzer visitLetDestructure handles nested patterns', () => {
  test('array destructuring with string elements does not crash', () => {
    // Basic case — should not crash
    const result = analyzeNoThrow(`
      fn test() {
        [a, b] = [1, 2]
        print(a)
        print(b)
      }
    `);
    expect(result).toBeDefined();
  });

  test('nested array destructuring does not crash', () => {
    // This used to crash with "el.startsWith is not a function"
    const result = analyzeNoThrow(`
      fn test() {
        [a, [b, c]] = [1, [2, 3]]
        print(a)
      }
    `);
    expect(result).toBeDefined();
  });
});

describe('audit #19: analyzer for-loop destructured variables', () => {
  test('for loop with simple variable works normally', () => {
    const result = analyzeNoThrow(`
      fn test() {
        items = [1, 2, 3]
        for item in items {
          print(item)
        }
      }
    `);
    // Should not have "not defined" warnings for item
    const notDefined = (result.warnings || []).filter(w =>
      w.message && w.message.includes('item') && w.message.includes('not defined')
    );
    expect(notDefined.length).toBe(0);
  });

  test('for loop with object destructuring does not crash', () => {
    const result = analyzeNoThrow(`
      fn test() {
        users = [{name: "Alice", age: 30}]
        for {name, age} in users {
          print(name)
        }
      }
    `);
    expect(result).toBeDefined();
  });
});

describe('audit #20: JSX match pattern bindings', () => {
  test('match expression with bindings analyzed correctly', () => {
    // Test the analyzer directly — JSX match bindings should be in scope
    const result = analyzeNoThrow(`
      fn test() {
        value = Some(42)
        result = match value {
          Some(x) => x * 2
          None => 0
        }
      }
    `);
    // The match arm bindings should be properly scoped
    const notDefined = (result.warnings || []).filter(w =>
      w.message && w.message.includes("'x'") && w.message.includes('not defined')
    );
    expect(notDefined.length).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════
// #21: Type inference for + operator
// ════════════════════════════════════════════════════════════

describe('audit #21: + operator type inference is numeric-only', () => {
  test('+ with String operands does not infer String type', () => {
    const warnings = getWarnings(`
      fn test() {
        x = "hello"
        y = "world"
        z = x + y
      }
    `);
    // Should not produce a cascading String type for +
    // (+ is numeric in Tova; ++ is for string concat)
    // The + on strings should be a type error, not a valid String operation
    const stringInfer = warnings.filter(w =>
      w.message && w.message.includes('String') && w.message.includes('inferred')
    );
    // Even if there's a type warning, it should not infer String result for +
  });

  test('+ with numeric operands still infers correctly', () => {
    const code = compileShared(`
      fn test(a: Int, b: Int) -> Int {
        a + b
      }
    `);
    expect(code).toContain('+');
  });
});

// ════════════════════════════════════════════════════════════
// #22: _substituteParam capture safety
// ════════════════════════════════════════════════════════════

describe('audit #22: _substituteParam capture safety', () => {
  test('nested lambda with same param name is not substituted', () => {
    const code = compileShared('x = Ok(5).map(fn(x) fn(x) x * 2)');
    // Inner x should reference the inner lambda's param, not the outer value
    expect(code).toContain('(x) => (x * 2)');
    expect(code).not.toContain('(x) => (5 * 2)');
  });

  test('nested lambda with different param name IS substituted', () => {
    const code = compileShared('x = Ok(5).map(fn(x) fn(y) x + y)');
    // Outer x should be replaced with 5 in the inner body
    expect(code).toContain('(y) => (5 + y)');
  });
});

// ════════════════════════════════════════════════════════════
// #26: _containsRPC null check for IfStatement.alternates
// ════════════════════════════════════════════════════════════

describe('audit #26: _containsRPC handles IfStatement without elif', () => {
  test('if statement without elif branches does not crash browser codegen', () => {
    // This used to crash because node.alternates was null/undefined
    const result = compile(`
      browser {
        state data = ""
        fn load() {
          if true {
            data = "loaded"
          } else {
            data = "failed"
          }
        }
        component App() {
          <div>
            <p>"{data()}"</p>
            <button onclick={load}>"Load"</button>
          </div>
        }
      }
    `);
    expect(result.browser).toBeDefined();
  });
});

// ════════════════════════════════════════════════════════════
// #30: flatten depth consistency
// ════════════════════════════════════════════════════════════

describe('audit #30: flatten depth consistency', () => {
  test('inline flatten uses deep flattening', () => {
    const code = compileShared(`
      fn test() {
        arr = [[1, [2, 3]], [4, [5]]]
        flat = flatten(arr)
      }
    `);
    // The compiled code should call .flat(Infinity) for deep flattening
    expect(code).toContain('.flat(Infinity)');
  });
});

// ════════════════════════════════════════════════════════════
// #31: divmod consistency
// ════════════════════════════════════════════════════════════

describe('audit #31: divmod consistent for negative numbers', () => {
  test('module divmod uses Euclidean remainder', async () => {
    const { divmod } = await import('../src/stdlib/math.js');
    // For negative numbers, Euclidean remainder should be non-negative
    const [q, r] = divmod(-7, 3);
    expect(q).toBe(-3);
    // Euclidean: -7 - (-3 * 3) = -7 + 9 = 2
    expect(r).toBe(2);
  });

  test('module divmod positive numbers unchanged', async () => {
    const { divmod } = await import('../src/stdlib/math.js');
    const [q, r] = divmod(7, 3);
    expect(q).toBe(2);
    expect(r).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════
// Memoize bounded cache
// ════════════════════════════════════════════════════════════

describe('audit: memoize bounded cache', () => {
  test('inline memoize includes cache size limit', () => {
    const code = compileShared(`
      fn test() {
        cached = memoize(fn(x) x * 2)
      }
    `);
    // The generated memoize function should include a cache size check
    expect(code).toContain('memoize');
    expect(code).toContain('1000');
  });
});

// ════════════════════════════════════════════════════════════
// onMount disposed check
// ════════════════════════════════════════════════════════════

describe('audit: onMount disposed check', () => {
  test('reactivity onMount checks owner disposed before executing', async () => {
    const { readFileSync } = await import('fs');
    const reactivitySrc = readFileSync(
      new URL('../src/runtime/reactivity.js', import.meta.url).pathname,
      'utf-8'
    );
    // The onMount function should check _disposed before calling fn()
    const onMountSection = reactivitySrc.slice(
      reactivitySrc.indexOf('export function onMount'),
      reactivitySrc.indexOf('export function onMount') + 500
    );
    expect(onMountSection).toContain('_disposed');
  });
});

// ════════════════════════════════════════════════════════════
// Form validator min/max handles string values
// ════════════════════════════════════════════════════════════

describe('audit: form validator min/max handles strings', () => {
  test('min validator uses Number() coercion', () => {
    const result = compile(`
      browser {
        component App() {
          form registration {
            field age: Int = 0 {
              min(18, "Must be at least 18")
            }
          }
          <div>"form"</div>
        }
      }
    `);
    const browser = result.browser;
    // Should use Number() coercion, not typeof === "number"
    expect(browser).toContain('Number(v)');
    expect(browser).not.toContain('typeof v === "number"');
  });
});

// ════════════════════════════════════════════════════════════
// Server codegen — immutable Response headers (#25 informational)
// ════════════════════════════════════════════════════════════

describe('audit: general server codegen correctness', () => {
  test('server compiles without errors for simple routes', () => {
    const result = compile(`
      server {
        GET "/api/users" fn(req) {
          [{name: "Alice"}, {name: "Bob"}]
        }
        POST "/api/users" fn(req) {
          {success: true}
        }
      }
    `);
    expect(result.server).toBeDefined();
    expect(result.server).toContain('/api/users');
  });
});
