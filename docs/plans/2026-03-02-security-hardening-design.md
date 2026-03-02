# Security Hardening Roadmap — Design Document

**Date:** 2026-03-02
**Scope:** Items 1-7 from the security audit roadmap
**Goal:** Make Tova secure-by-default and give companies confidence to adopt it

---

## 1. `--strict-security` Compiler Mode

**CLI flag** that promotes all security W_ codes to hard errors.

- Add `--strict-security` to global flags in `bin/tova.js`
- Pass `strictSecurity` boolean to analyzer
- Tag security warnings with `category: 'security'` in opts
- After analysis, if `strictSecurity` is true, promote `category === 'security'` warnings to errors
- Affected existing codes: `W_HARDCODED_SECRET`, `W_CORS_WILDCARD`, `W_CSRF_DISABLED`, `W_LOCALSTORAGE_TOKEN`, `W_INMEMORY_RATELIMIT`, `W_NO_AUTH_RATELIMIT`, `W_PROTECT_WITHOUT_AUTH`, `W_PROTECT_NO_REQUIRE`, `W_UNDEFINED_ROLE`, `W_UNKNOWN_AUTH_TYPE`, `W_INVALID_RATE_LIMIT`, `W_HASH_NOT_ENFORCED`, `W_DUPLICATE_ROLE`
- Plus new codes from items 2-5
- Exit code 1 when any security warning promoted to error

## 2. `W_NO_SECURITY_BLOCK` Warning

When `server {}` or `edge {}` exists without `security {}`, warn.

- Check in `_validateSecurityBlocks()` or end of top-level analysis
- Condition: `(serverBlocks.length > 0 || edgeBlocks.length > 0) && securityBlocks.length === 0`
- Message: `"Server/edge block defined without a security block. Consider adding security { ... } for auth, CORS, and CSRF protection."`
- Hint: `"See https://tova.dev/guide/security for setup"`
- Category: `'security'`

## 3. Default Security Headers in Fast Mode

Always emit basic OWASP headers even without `security {}`.

- In `server-codegen.js`, emit before the fast-mode branch:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 0`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- Always emit `__sanitizeBody()` for JSON body parsing (prototype pollution)
- Does NOT add auth, CSRF, rate limiting — just headers and body sanitization

## 4. `W_UNSAFE_INTERPOLATION` for db.query()

Warn when template literals with expressions are passed to database calls.

- Detect `CallExpression` where:
  - Callee is `MemberExpression` with property in `{query, run, exec, execute, prepare}`
  - First argument is `TemplateLiteral` with `expressions.length > 0`
- Message: `"Template literal with expressions used in database query. Use parameterized queries (?) to prevent SQL injection."`
- Hint: `"Replace interpolated expressions with ? and pass values as parameters"`
- Category: `'security'`
- Any interpolation in a DB call warns — false positives acceptable

## 5. `W_DANGEROUS_API` for dangerous JS patterns

Warn on dangerous JavaScript API usage at compile time.

- Detect `CallExpression` where callee name matches dangerous APIs:
  - Direct code execution calls → `"Direct code execution is a code injection risk. Consider alternative approaches."`
  - `Function` as constructor → same message
  - `setTimeout`/`setInterval` with string first arg → `"Passing strings to setTimeout/setInterval executes code dynamically. Use a function instead."`
- Detect `AssignmentExpression` where target is `MemberExpression` with property `innerHTML`:
  - `"Direct innerHTML assignment is an XSS risk. Use textContent or escape_html()."`
- Category: `'security'`

## 6. Auto Audit Logging on Auth Events

When `audit` + `auth` both configured, inject audit calls automatically.

- In `server-codegen.js`, at specific codegen points:
  - After successful JWT validation: `__auditLog("auth:success", { method, path }, user)`
  - After failed JWT validation: `__auditLog("auth:failure", { method, path, reason: "invalid_token" }, { id: null })`
  - After rate limit exceeded: `__auditLog("rate_limit:exceeded", { method, path, ip }, { id: null })`
  - After 403 authorization denial: `__auditLog("auth:denied", { method, path, required }, user)`
- No AST or parser changes — codegen insertion only

## 7. Security Scorecard Output

Post-compilation security posture summary.

- New file: `src/diagnostics/security-scorecard.js`
- Function: `generateSecurityScorecard(securityConfig, warnings, hasServer, hasEdge)`
- Called from `bin/tova.js` after compilation
- Scoring (start at 10):
  - -3: No security block (server/edge present)
  - -2: No auth configured
  - -1: No CSRF (when auth exists)
  - -1: No rate limiting (when auth exists)
  - -1: No CSP configured
  - -1: CORS wildcard
  - -1: Hardcoded secret
  - -1: localStorage tokens
  - -1: No audit logging
- Show when `--verbose` or `--strict-security`
- Suppress with `--quiet`
- Format:
```
Security: 7/10
  [pass] JWT auth with HttpOnly cookies
  [pass] CSRF enabled with session binding
  [warn] No CSP configured (-1)
```

---

## Files Modified

| File | Changes |
|------|---------|
| `bin/tova.js` | `--strict-security` flag, scorecard call |
| `src/analyzer/analyzer.js` | `category: 'security'` on existing warnings, new W_ codes (items 2, 4, 5), strict-security promotion |
| `src/codegen/server-codegen.js` | Default headers in fast mode, auto audit logging |
| `src/diagnostics/security-scorecard.js` | New file — scorecard generation |
| `tests/security-hardening.test.js` | New test file — all 7 features |

## Test Plan

- Each new W_ code: positive test (triggers) + negative test (doesn't trigger when correct)
- `--strict-security`: verify exit code 1 on security warnings
- Default headers: verify headers present in fast-mode generated code
- Auto audit: verify `__auditLog` calls in generated code when audit+auth configured
- Scorecard: verify scoring logic and output format
