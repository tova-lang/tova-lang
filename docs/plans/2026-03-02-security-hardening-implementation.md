# Security Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 7 security hardening features that make Tova secure-by-default and give companies confidence to adopt it.

**Architecture:** All changes touch the analyzer (compile-time warnings), server codegen (runtime security), CLI (flags/output), and a new diagnostics module (scorecard). Each feature is independent and can be committed separately.

**Tech Stack:** Bun test runner, existing Analyzer/CodeGenerator/Parser infrastructure, plugin system for cross-block validation.

---

### Task 1: Add `--strict-security` CLI Flag and Category Infrastructure

**Files:**
- Modify: `bin/tova.js` (lines 104, 4503, 313-318, ~640, ~749)
- Modify: `src/analyzer/analyzer.js` (lines 117-142, 252-265, 328-349)
- Test: `tests/security-hardening.test.js` (new file)

**Step 1: Write the failing tests**

Create `tests/security-hardening.test.js` with tests for:
- Security warnings include `category: 'security'` field
- Non-security warnings do NOT have security category
- `strictSecurity: true` promotes security warnings to errors
- `strictSecurity: true` does not promote non-security warnings

Test pattern:
```javascript
const result = analyze(source, { strictSecurity: true, tolerant: true });
expect(result.errors.some(e => e.code === 'W_HARDCODED_SECRET')).toBe(true);
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/security-hardening.test.js`

**Step 3: Add `category` support to `warn()` method**

In `src/analyzer/analyzer.js` line 252, add after `if (opts.fix) w.fix = opts.fix;`:
```javascript
if (opts.category) w.category = opts.category;
```

**Step 4: Add `strictSecurity` to constructor**

In `src/analyzer/analyzer.js` line 123, add:
```javascript
this.strictSecurity = options.strictSecurity || false;
```

**Step 5: Add `category: 'security'` to all 13 existing security warnings**

In `_validateSecurityCrossBlock()` (line 1598+), add `category: 'security'` to every `this.warnings.push({...})` for: `W_DUPLICATE_ROLE`, `W_UNKNOWN_AUTH_TYPE`, `W_HARDCODED_SECRET`, `W_CORS_WILDCARD`, `W_CSRF_DISABLED`, `W_LOCALSTORAGE_TOKEN`, `W_INMEMORY_RATELIMIT`, `W_NO_AUTH_RATELIMIT`, `W_HASH_NOT_ENFORCED`, `W_PROTECT_WITHOUT_AUTH`, `W_PROTECT_NO_REQUIRE`, `W_UNDEFINED_ROLE`, `W_INVALID_RATE_LIMIT`.

**Step 6: Add strict-security promotion in `analyze()` method**

In `analyze()` (line 328), after cross-block validation (line 338), before unused symbols (line 342):
```javascript
if (this.strictSecurity) {
  const securityWarnings = this.warnings.filter(w => w.category === 'security');
  this.warnings = this.warnings.filter(w => w.category !== 'security');
  for (const w of securityWarnings) this.errors.push(w);
}
```

**Step 7: Add `--strict-security` CLI flag**

In `bin/tova.js`:
- Add `'--strict-security'` to globalFlags array (line 4503)
- Add `const isStrictSecurity = args.includes('--strict-security');` near isStrict (line 104)
- Pass `strictSecurity: isStrictSecurity` alongside `strict: isStrict` in options

**Step 8: Run tests, verify pass**
**Step 9: Commit**

```bash
git add tests/security-hardening.test.js src/analyzer/analyzer.js bin/tova.js
git commit -m "feat: add --strict-security mode and security warning categories"
```

---

### Task 2: Add `W_NO_SECURITY_BLOCK` Warning

**Files:**
- Modify: `src/analyzer/analyzer.js` (in `_validateSecurityCrossBlock`, line 1598)
- Modify: `tests/security-hardening.test.js`

**Step 1: Write failing tests**

Tests for:
- Warns when server block exists without security block
- Warns when edge block exists without security block
- Does NOT warn when security block exists
- Does NOT warn for standalone scripts (no server/edge)
- Promoted to error with --strict-security

**Step 2: Run tests to verify they fail**

**Step 3: Add the warning**

At the TOP of `_validateSecurityCrossBlock()` (line 1598):
```javascript
const hasServerOrEdge = this.ast.body.some(n => n.type === 'ServerBlock' || n.type === 'EdgeBlock');
const hasSecurityBlock = this.ast.body.some(n => n.type === 'SecurityBlock');
if (hasServerOrEdge && !hasSecurityBlock) {
  const block = this.ast.body.find(n => n.type === 'ServerBlock' || n.type === 'EdgeBlock');
  this.warnings.push({
    message: 'Server/edge block defined without a security block — consider adding security { ... } for auth, CORS, and CSRF protection',
    loc: block.loc,
    code: 'W_NO_SECURITY_BLOCK',
    category: 'security',
  });
}
```

**Step 4: Run tests, verify pass**
**Step 5: Commit**

```bash
git add src/analyzer/analyzer.js tests/security-hardening.test.js
git commit -m "feat: add W_NO_SECURITY_BLOCK warning for server/edge without security"
```

---

### Task 3: Default Security Headers in Fast Mode

**Files:**
- Modify: `src/codegen/server-codegen.js` (lines 431-460, 1050-1092)
- Modify: `tests/security-hardening.test.js`

**Step 1: Write failing tests**

Tests for:
- Security headers present in compiled output even without security block
- `__sanitizeBody` present even without security block
- Headers still present in non-fast mode too

**Step 2: Run tests to verify they fail**

**Step 3: Extract base security headers outside `isFastMode` guard**

In `src/codegen/server-codegen.js`, BEFORE the `if (!isFastMode)` security headers block (line 1055), add base headers that are always emitted:

```javascript
lines.push('const __baseSecurityHeaders = Object.freeze({');
lines.push('  "X-Content-Type-Options": "nosniff",');
lines.push('  "X-Frame-Options": "DENY",');
lines.push('  "X-XSS-Protection": "0",');
lines.push('  "Referrer-Policy": "strict-origin-when-cross-origin",');
lines.push('});');
```

Then in the fast-mode response path, apply these headers to responses. Find where fast mode returns `new Response(...)` and add header application.

For the non-fast-mode path, the existing `__securityHeaders` already covers these, so reference `__baseSecurityHeaders` there.

**Step 4: Run tests, verify pass**
**Step 5: Run full test suite for regressions**

Run: `bun test`

**Step 6: Commit**

```bash
git add src/codegen/server-codegen.js tests/security-hardening.test.js
git commit -m "feat: emit default security headers even in fast mode"
```

---

### Task 4: Add `W_UNSAFE_INTERPOLATION` for db.query()

**Files:**
- Modify: `src/analyzer/analyzer.js` (in `visitExpression`, CallExpression branch, line 824)
- Modify: `tests/security-hardening.test.js`

**Step 1: Write failing tests**

Tests for:
- Warns on template literal with expressions in `db.query()`
- Warns on template literal with expressions in `db.run()`
- Does NOT warn on plain string in `db.query()`
- Does NOT warn on non-db calls with template literals
- Warning has `category: 'security'`

**Step 2: Run tests to verify they fail**

**Step 3: Add detection in analyzer**

In `visitExpression`, CallExpression branch (after line 841), add:
```javascript
if (node.callee.type === 'MemberExpression' && !node.callee.computed) {
  const prop = node.callee.property;
  const dbMethods = new Set(['query', 'run', 'exec', 'execute', 'prepare']);
  if (dbMethods.has(prop) && node.arguments.length > 0) {
    const firstArg = node.arguments[0];
    if (firstArg.type === 'TemplateLiteral' && firstArg.parts &&
        firstArg.parts.some(p => p.type === 'expr')) {
      this.warn(
        'Template literal with expressions in database query — use parameterized queries (?) to prevent SQL injection',
        node.loc,
        'Replace interpolated expressions with ? and pass values as parameters',
        { code: 'W_UNSAFE_INTERPOLATION', category: 'security' }
      );
    }
  }
}
```

**Step 4: Run tests, verify pass**
**Step 5: Commit**

```bash
git add src/analyzer/analyzer.js tests/security-hardening.test.js
git commit -m "feat: add W_UNSAFE_INTERPOLATION warning for SQL injection prevention"
```

---

### Task 5: Add `W_DANGEROUS_API` for Dangerous JS Patterns

**Files:**
- Modify: `src/analyzer/analyzer.js` (CallExpression branch + visitAssignment)
- Modify: `tests/security-hardening.test.js`

**Step 1: Write failing tests**

Tests for:
- Warns on `el.innerHTML = ...` assignment (NOTE: this tests the XSS warning the compiler emits — the warning message should contain the word "XSS" or "innerHTML")
- Does NOT warn on `el.textContent = ...`
- Warns on `setTimeout("string", 1000)`
- Does NOT warn on `setTimeout(fn() { ... }, 1000)`
- Warning has `category: 'security'`

**Step 2: Run tests to verify they fail**

**Step 3: Add detection for setTimeout/setInterval string args**

In `visitExpression`, CallExpression branch, add:
```javascript
if (node.callee.type === 'Identifier') {
  const name = node.callee.name;
  if ((name === 'setTimeout' || name === 'setInterval') &&
      node.arguments.length > 0 && node.arguments[0].type === 'StringLiteral') {
    this.warn(
      `Passing strings to ${name}() executes code dynamically — use a function instead`,
      node.loc,
      `Replace the string argument with a function`,
      { code: 'W_DANGEROUS_API', category: 'security' }
    );
  }
}
```

**Step 4: Add detection for innerHTML in visitAssignment**

In `visitAssignment()` (line 1860), in the `typeof target !== 'string'` branch, after `this.visitExpression(target)`:
```javascript
if (target.type === 'MemberExpression' && !target.computed && target.property === 'innerHTML') {
  this.warn(
    'Direct innerHTML assignment is an XSS risk — use textContent or escapeHtml()',
    node.loc || target.loc,
    'Use el.textContent for plain text, or escapeHtml(value) for safe HTML rendering',
    { code: 'W_DANGEROUS_API', category: 'security' }
  );
}
```

**Step 5: Run tests, verify pass**
**Step 6: Commit**

```bash
git add src/analyzer/analyzer.js tests/security-hardening.test.js
git commit -m "feat: add W_DANGEROUS_API warning for innerHTML, setTimeout string args"
```

---

### Task 6: Auto Audit Logging on Auth Events

**Files:**
- Modify: `src/codegen/server-codegen.js` (auth section ~1097, rate limit section, protection section)
- Modify: `tests/security-hardening.test.js`

**Step 1: Write failing tests**

Tests for:
- Generated code contains `__auditLog` and `auth:success` when audit+auth configured
- Generated code contains `auth:failure` when audit+auth configured
- Does NOT contain audit calls when audit not configured
- Generated code contains `rate_limit:exceeded` when audit+rate_limit configured

**Step 2: Run tests to verify they fail**

**Step 3: Inject audit calls at auth/rate-limit/protection points**

In `src/codegen/server-codegen.js`:

1. Find where `const __user = await __authenticate(req)` is generated in the request handler. After that line, if `securityFragments?.auditCode` exists, emit:
```javascript
lines.push('if (__user) __auditLog("auth:success", { method: req.method, path: __pathname }, __user);');
lines.push('else if (req.headers.get("Authorization")) __auditLog("auth:failure", { method: req.method, path: __pathname, reason: "invalid_token" }, { id: null });');
```

2. Find where 429 rate-limit responses are generated. Before the return, if audit configured:
```javascript
lines.push('__auditLog("rate_limit:exceeded", { method: req.method, path: __pathname }, { id: null });');
```

3. Find where 403 protection-denied responses are generated. Before the return, if audit configured:
```javascript
lines.push('__auditLog("auth:denied", { method: req.method, path: __pathname }, __user || { id: null });');
```

**Step 4: Run tests, verify pass**
**Step 5: Run full test suite**
**Step 6: Commit**

```bash
git add src/codegen/server-codegen.js tests/security-hardening.test.js
git commit -m "feat: auto-inject audit logging on auth success/failure and rate limiting"
```

---

### Task 7: Security Scorecard Output

**Files:**
- Create: `src/diagnostics/security-scorecard.js`
- Modify: `bin/tova.js`
- Modify: `tests/security-hardening.test.js`

**Step 1: Write failing tests**

Tests for:
- Returns 10/10 for fully configured security
- Deducts 3 for no security block (when server present)
- Deducts 1 for missing CSP
- Deducts for W_HARDCODED_SECRET warning presence
- Returns null when no server/edge blocks
- `format()` returns readable string with "Security:" and "/10"

**Step 2: Run tests to verify they fail**

**Step 3: Create scorecard module**

Create `src/diagnostics/security-scorecard.js`:
- Export `generateSecurityScorecard(securityConfig, warnings, hasServer, hasEdge)`
- Score starts at 10, deducts per issue
- Returns `{ score, items, format() }` or `null` if not applicable
- `format()` returns ANSI-colored output with [pass]/[warn] per item

Scoring rules:
- No security block: -3
- No auth: -2
- No CSRF (with auth): -1
- No rate limiting (with auth): -1
- No CSP: -1
- CORS wildcard (W_CORS_WILDCARD): -1
- Hardcoded secret (W_HARDCODED_SECRET): -1
- localStorage tokens (W_LOCALSTORAGE_TOKEN): -1
- No audit: -1
- Minimum score: 0

**Step 4: Run tests, verify pass**

**Step 5: Integrate into bin/tova.js**

Import scorecard and call after compilation when `--verbose` or `--strict-security` is set (and not `--quiet`).

**Step 6: Run full test suite**
**Step 7: Commit**

```bash
git add src/diagnostics/security-scorecard.js bin/tova.js tests/security-hardening.test.js
git commit -m "feat: add security scorecard output for --verbose and --strict-security"
```

---

### Task 8: Final Integration Test and Full Suite Verification

**Step 1: Add integration test**

Test that exercises multiple features together: a server with unsafe SQL and no security block under `--strict-security` should have both `W_NO_SECURITY_BLOCK` and `W_UNSAFE_INTERPOLATION` as errors.

**Step 2: Run full test suite**

Run: `bun test`
Expected: ALL tests pass (7000+ existing + ~25 new security hardening tests)

**Step 3: Final commit**

```bash
git add tests/security-hardening.test.js
git commit -m "test: add security hardening integration tests"
```
