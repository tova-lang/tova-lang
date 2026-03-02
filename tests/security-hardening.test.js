import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { generateSecurityScorecard } from '../src/diagnostics/security-scorecard.js';

function parse(source) {
  const lexer = new Lexer(source, 'test.tova');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, 'test.tova');
  return parser.parse();
}

function analyze(source, opts = {}) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, 'test.tova', { tolerant: true, ...opts });
  return analyzer.analyze();
}

describe('Security warning categories', () => {
  test('security warnings include category field', () => {
    const result = analyze(`
      security {
        auth jwt { secret: "hardcoded" }
      }
      server {
        fn hello() -> String { "hi" }
      }
    `);
    const w = result.warnings.find(w => w.code === 'W_HARDCODED_SECRET');
    expect(w).toBeDefined();
    expect(w.category).toBe('security');
  });

  test('non-security warnings do not have security category', () => {
    const result = analyze(`
      fn myFunction() { }
    `);
    const styleWarnings = result.warnings.filter(w => w.code === 'W100');
    for (const w of styleWarnings) {
      expect(w.category).not.toBe('security');
    }
  });
});

describe('--strict-security mode', () => {
  test('promotes security warnings to errors', () => {
    const result = analyze(`
      security {
        auth jwt { secret: "hardcoded" }
      }
      server {
        fn hello() -> String { "hi" }
      }
    `, { strictSecurity: true });
    expect(result.errors.some(e => e.code === 'W_HARDCODED_SECRET')).toBe(true);
    // Should NOT be in warnings anymore
    expect(result.warnings.some(w => w.code === 'W_HARDCODED_SECRET')).toBe(false);
  });

  test('does not promote non-security warnings to errors', () => {
    const result = analyze(`
      fn myFunction() { }
    `, { strictSecurity: true });
    // naming convention warnings should stay as warnings
    expect(result.warnings.some(w => w.code === 'W100')).toBe(true);
    expect(result.errors.filter(e => e.code === 'W100').length).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════
// Task 2: W_NO_SECURITY_BLOCK
// ════════════════════════════════════════════════════════════

describe('W_NO_SECURITY_BLOCK', () => {
  test('warns when server block exists without security block', () => {
    const result = analyze(`
      server {
        fn hello() -> String { "hi" }
      }
    `);
    expect(result.warnings.some(w => w.code === 'W_NO_SECURITY_BLOCK')).toBe(true);
    const w = result.warnings.find(w => w.code === 'W_NO_SECURITY_BLOCK');
    expect(w.category).toBe('security');
  });

  test('does not warn when security block exists', () => {
    const result = analyze(`
      security {
        auth jwt { secret: env("SECRET") }
      }
      server {
        fn hello() -> String { "hi" }
      }
    `);
    expect(result.warnings.some(w => w.code === 'W_NO_SECURITY_BLOCK')).toBe(false);
  });

  test('does not warn for standalone scripts without server/edge', () => {
    const result = analyze(`
      fn add(a: Int, b: Int) -> Int { a + b }
    `);
    expect(result.warnings.some(w => w.code === 'W_NO_SECURITY_BLOCK')).toBe(false);
  });

  test('promoted to error with --strict-security', () => {
    const result = analyze(`
      server {
        fn hello() -> String { "hi" }
      }
    `, { strictSecurity: true });
    expect(result.errors.some(e => e.code === 'W_NO_SECURITY_BLOCK')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// Task 4: W_UNSAFE_INTERPOLATION
// ════════════════════════════════════════════════════════════

describe('W_UNSAFE_INTERPOLATION', () => {
  test('warns on template literal with interpolation in db.query()', () => {
    const result = analyze(`
      server {
        fn find(name: String) -> String {
          db.query("SELECT * FROM users WHERE name = \${name}")
          "done"
        }
      }
    `);
    expect(result.warnings.some(w => w.code === 'W_UNSAFE_INTERPOLATION')).toBe(true);
    const w = result.warnings.find(w => w.code === 'W_UNSAFE_INTERPOLATION');
    expect(w.category).toBe('security');
  });

  test('warns on template literal with interpolation in db.run()', () => {
    const result = analyze(`
      server {
        fn update(id: Int, val: String) -> String {
          db.run("UPDATE users SET name = \${val} WHERE id = \${id}")
          "done"
        }
      }
    `);
    expect(result.warnings.some(w => w.code === 'W_UNSAFE_INTERPOLATION')).toBe(true);
  });

  test('does not warn on plain string in db.query()', () => {
    const result = analyze(`
      server {
        fn find() -> String {
          db.query("SELECT * FROM users")
          "done"
        }
      }
    `);
    expect(result.warnings.some(w => w.code === 'W_UNSAFE_INTERPOLATION')).toBe(false);
  });

  test('does not warn on non-db calls with template literals', () => {
    const result = analyze(`
      fn greet(name: String) -> String {
        print("Hello \${name}")
        "done"
      }
    `);
    expect(result.warnings.some(w => w.code === 'W_UNSAFE_INTERPOLATION')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// Task 5: W_DANGEROUS_API
// ════════════════════════════════════════════════════════════

describe('W_DANGEROUS_API', () => {
  test('warns on setTimeout with string argument', () => {
    const result = analyze(`
      fn bad() {
        setTimeout("alert(1)", 1000)
      }
    `);
    expect(result.warnings.some(w => w.code === 'W_DANGEROUS_API')).toBe(true);
    const w = result.warnings.find(w => w.code === 'W_DANGEROUS_API');
    expect(w.category).toBe('security');
  });

  test('does not warn on setTimeout with function argument', () => {
    const result = analyze(`
      fn ok() {
        setTimeout(fn() { print("hi") }, 1000)
      }
    `);
    expect(result.warnings.some(w => w.code === 'W_DANGEROUS_API')).toBe(false);
  });

  test('warns on setInterval with string argument', () => {
    const result = analyze(`
      fn bad() {
        setInterval("doStuff()", 500)
      }
    `);
    expect(result.warnings.some(w => w.code === 'W_DANGEROUS_API')).toBe(true);
  });

  test('warns on innerHTML assignment', () => {
    const result = analyze(`
      browser {
        el.innerHTML = "<b>bold</b>"
      }
    `);
    expect(result.warnings.some(w => w.code === 'W_DANGEROUS_API')).toBe(true);
    const w = result.warnings.find(w => w.code === 'W_DANGEROUS_API');
    expect(w.message).toContain('innerHTML');
  });

  test('does not warn on textContent assignment', () => {
    const result = analyze(`
      browser {
        el.textContent = "safe"
      }
    `);
    expect(result.warnings.some(w => w.code === 'W_DANGEROUS_API')).toBe(false);
  });
});

function compile(source) {
  const ast = parse(source);
  const gen = new CodeGenerator(ast, 'test.tova');
  const result = gen.generate();
  return result.server || '';
}

// ════════════════════════════════════════════════════════════
// Task 3: Default security headers in fast mode
// ════════════════════════════════════════════════════════════

describe('Default security headers in fast mode', () => {
  test('emits security headers even without security block', () => {
    const code = compile(`
      server {
        fn hello() -> String { "hi" }
      }
    `);
    expect(code).toContain('X-Content-Type-Options');
    expect(code).toContain('nosniff');
    expect(code).toContain('X-Frame-Options');
    expect(code).toContain('DENY');
  });

  test('emits sanitizeBody even without security block', () => {
    const code = compile(`
      server {
        fn hello() -> String { "hi" }
      }
    `);
    expect(code).toContain('__sanitizeBody');
    expect(code).toContain('__proto__');
  });

  test('security headers present in non-fast mode too', () => {
    const code = compile(`
      security {
        auth jwt { secret: env("SECRET") }
      }
      server {
        fn hello() -> String { "hi" }
      }
    `);
    expect(code).toContain('X-Content-Type-Options');
    expect(code).toContain('nosniff');
  });
});

// ════════════════════════════════════════════════════════════
// Task 7: Security scorecard
// ════════════════════════════════════════════════════════════

describe('Security scorecard', () => {
  test('returns 10/10 for fully configured security', () => {
    const result = generateSecurityScorecard({
      auth: { authType: 'jwt', storage: 'cookie' },
      csrf: { enabled: true },
      rateLimit: { max: 100 },
      csp: { default_src: "'self'" },
      cors: { origins: ['https://example.com'] },
      audit: { events: ['auth'] },
    }, [], true, false);
    expect(result.score).toBe(10);
    expect(result.items.every(i => i.pass)).toBe(true);
  });

  test('deducts 3 for no security block', () => {
    const result = generateSecurityScorecard(null, [], true, false);
    expect(result.score).toBeLessThanOrEqual(7);
    expect(result.items.some(i => !i.pass && i.label.includes('security block'))).toBe(true);
  });

  test('deducts 1 for missing CSP', () => {
    const result = generateSecurityScorecard({
      auth: { authType: 'jwt', storage: 'cookie' },
      csrf: { enabled: true },
      rateLimit: { max: 100 },
      cors: { origins: ['https://example.com'] },
      audit: { events: ['auth'] },
    }, [], true, false);
    expect(result.score).toBe(9);
    expect(result.items.some(i => !i.pass && i.label.includes('CSP'))).toBe(true);
  });

  test('deducts for W_HARDCODED_SECRET warning', () => {
    const result = generateSecurityScorecard({
      auth: { authType: 'jwt', storage: 'cookie' },
      csrf: { enabled: true },
      rateLimit: { max: 100 },
      csp: { default_src: "'self'" },
      cors: { origins: ['https://example.com'] },
      audit: { events: ['auth'] },
    }, [{ code: 'W_HARDCODED_SECRET' }], true, false);
    expect(result.score).toBe(9);
  });

  test('returns null when no server/edge blocks', () => {
    const result = generateSecurityScorecard(null, [], false, false);
    expect(result).toBeNull();
  });

  test('format() returns readable string', () => {
    const result = generateSecurityScorecard({
      auth: { authType: 'jwt', storage: 'cookie' },
    }, [], true, false);
    const output = result.format();
    expect(output).toContain('Security:');
    expect(output).toContain('/10');
  });
});

// ════════════════════════════════════════════════════════════
// Task 6: Auto-inject audit logging
// ════════════════════════════════════════════════════════════

describe('Auto-inject audit logging', () => {
  test('emits __auditLog and auth:success when audit+auth configured', () => {
    const code = compile(`
      security {
        auth jwt { secret: env("SECRET") }
        audit { store: "audit_logs", events: ["auth"] }
      }
      server {
        get "/hello" fn hello() -> String { "hi" }
      }
    `);
    expect(code).toContain('__auditLog');
    expect(code).toContain('auth:success');
  });

  test('emits auth:failure when audit+auth configured', () => {
    const code = compile(`
      security {
        auth jwt { secret: env("SECRET") }
        audit { store: "audit_logs", events: ["auth"] }
      }
      server {
        get "/hello" fn hello() -> String { "hi" }
      }
    `);
    expect(code).toContain('auth:failure');
  });

  test('does NOT emit audit calls when audit is not configured', () => {
    const code = compile(`
      security {
        auth jwt { secret: env("SECRET") }
      }
      server {
        get "/hello" fn hello() -> String { "hi" }
      }
    `);
    expect(code).not.toContain('__auditLog');
  });

  test('emits rate_limit:exceeded when audit+rate_limit configured', () => {
    const code = compile(`
      security {
        auth jwt { secret: env("SECRET") }
        rate_limit { max: 100, window: 60 }
        audit { store: "audit_logs", events: ["auth"] }
      }
      server {
        get "/hello" fn hello() -> String { "hi" }
      }
    `);
    expect(code).toContain('rate_limit:exceeded');
  });

  test('emits auth:denied when audit+protection configured', () => {
    const code = compile(`
      security {
        auth jwt { secret: env("SECRET") }
        role admin { can: [manage] }
        protect "/admin" { require: admin }
        audit { store: "audit_logs", events: ["auth"] }
      }
      server {
        get "/hello" fn hello() -> String { "hi" }
      }
    `);
    expect(code).toContain('auth:denied');
  });
});

// ════════════════════════════════════════════════════════════
// Task 8: Integration tests — multiple features together
// ════════════════════════════════════════════════════════════

describe('Security hardening integration', () => {
  test('multiple security warnings under strict-security all become errors', () => {
    const result = analyze(`
      server {
        fn find(name: String) -> String {
          db.query("SELECT * FROM users WHERE name = \${name}")
          "done"
        }
      }
    `, { strictSecurity: true });
    // Both W_NO_SECURITY_BLOCK and W_UNSAFE_INTERPOLATION promoted to errors
    expect(result.errors.some(e => e.code === 'W_NO_SECURITY_BLOCK')).toBe(true);
    expect(result.errors.some(e => e.code === 'W_UNSAFE_INTERPOLATION')).toBe(true);
    // Neither should remain as warnings
    expect(result.warnings.some(w => w.code === 'W_NO_SECURITY_BLOCK')).toBe(false);
    expect(result.warnings.some(w => w.code === 'W_UNSAFE_INTERPOLATION')).toBe(false);
  });

  test('scorecard reflects actual warnings from analysis', () => {
    const src = `
      security {
        auth jwt { secret: "hardcoded" }
      }
      server {
        get "/hello" fn hello() -> String { "hi" }
      }
    `;
    const analysisResult = analyze(src);
    const scorecard = generateSecurityScorecard(
      { auth: { authType: 'jwt' } },
      analysisResult.warnings,
      true, false
    );
    expect(scorecard).not.toBeNull();
    // Should deduct for hardcoded secret
    expect(scorecard.score).toBeLessThan(10);
    expect(scorecard.items.some(i => !i.pass && i.label.toLowerCase().includes('secret'))).toBe(true);
  });

  test('full security setup produces clean output with headers and audit', () => {
    const code = compile(`
      security {
        auth jwt { secret: env("SECRET") }
        cors { origins: ["https://example.com"] }
        csrf { enabled: true }
        rate_limit { max: 100, window: 60 }
        audit { store: "audit_logs", events: ["auth"] }
      }
      server {
        get "/hello" fn hello() -> String { "hi" }
      }
    `);
    // Should have security headers
    expect(code).toContain('X-Content-Type-Options');
    // Should have auth
    expect(code).toContain('__authenticate');
    // Should have audit logging
    expect(code).toContain('__auditLog');
    // Should have CSRF
    expect(code).toContain('__validateCSRFToken');
    // Should have rate limiting
    expect(code).toContain('__checkRateLimit');
  });
});
