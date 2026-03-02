# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.8.x   | Yes       |
| < 0.8   | No        |

We only provide security fixes for the latest minor release. Users are encouraged to stay up to date.

## Reporting a Vulnerability

**Do NOT report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in Tova (the compiler, runtime, generated code, or standard library), please report it responsibly:

**Email:** security@tova-lang.org

### What to Include

- Description of the vulnerability
- Steps to reproduce (minimal Tova program that demonstrates the issue)
- Impact assessment — what can an attacker do?
- Affected versions (if known)
- Suggested fix (if you have one)

### Response Timeline

| Stage | Timeline |
|-------|----------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 1 week |
| Fix development | Depends on severity |
| Patch release | As soon as fix is verified |
| Public disclosure | After patch is released |

### Severity Levels

**Critical** — The compiler generates code that is exploitable (e.g., XSS in generated HTML, injection in generated SQL, authentication bypass in security block output). Fix and release immediately.

**High** — Security features don't work as documented (e.g., CSRF protection can be bypassed, rate limiting doesn't enforce limits, role-based access can be circumvented). Fix within one week.

**Medium** — Weaknesses that require specific conditions to exploit (e.g., timing attacks on CSRF comparison, missing header in specific edge target). Fix in next release.

**Low** — Best-practice violations that don't have direct exploitability (e.g., missing security headers in development mode, verbose error messages in production). Track and fix when convenient.

## Scope

The following are in scope for security reports:

- **Compiler output** — Generated JavaScript that contains security vulnerabilities
- **Security block** — Authentication, authorization, CORS, CSP, CSRF, rate limiting, and audit logging features
- **Edge security** — JWT verification, route protection, and auto-sanitize on edge targets
- **Server codegen** — Route handling, middleware, request parsing, and response generation
- **Standard library** — Any stdlib function that could be used unsafely
- **CLI / Build tools** — Code execution during compilation or build steps

The following are **out of scope**:

- Vulnerabilities in user-written Tova code (that's the user's responsibility)
- Dependencies of user projects (not Tova itself)
- The documentation website (report to the hosting provider)
- Social engineering attacks against maintainers

## Security Design Principles

Tova's security features are designed with these principles:

1. **Secure by default.** OWASP security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) and body sanitization (prototype pollution prevention) are emitted on all server responses, even without a `security {}` block. Additional security features are opt-out, not opt-in.

2. **No silent failures.** When security features are misconfigured, the analyzer emits warnings (`W_HARDCODED_SECRET`, `W_CORS_WILDCARD`, `W_CSRF_DISABLED`, `W_NO_SECURITY_BLOCK`, `W_UNSAFE_INTERPOLATION`, `W_DANGEROUS_API`, etc.). Security misconfigurations should be noisy. Use `--strict-security` to promote all security warnings to hard errors.

3. **Defense in depth.** Multiple layers of protection — authentication, authorization, input sanitization, output encoding, rate limiting — work independently so that a failure in one layer doesn't compromise the whole system. When both `auth` and `audit` are configured, the compiler auto-injects audit logging on auth events.

4. **Compile-time verification.** The analyzer validates security configurations at compile time. Invalid role references, duplicate roles, SQL injection patterns, XSS risks, and unsafe patterns are caught before the code ever runs. A security scorecard (0-10) summarizes your security posture.

## Past Security Fixes

We disclose security fixes after patches are released:

| Version | Fix | Severity |
|---------|-----|----------|
| 0.4.9 | CSRF `enabled: false` not honored | High |
| 0.4.9 | Auto-sanitize bypass via variant types (`__tag`) | Medium |
| 0.4.9 | `visible_to: ["self"]` identity check weakness | Medium |
| 0.4.9 | Path traversal via `../` in route protection | Medium |
| 0.4.8 | JWT algorithm confusion attacks | High |
| 0.4.8 | CSRF timing side-channel (now raw byte comparison) | Medium |

## Recognition

We appreciate responsible disclosure. Security researchers who report valid vulnerabilities will be:

- Credited in the release notes (unless they prefer anonymity)
- Listed in this file's acknowledgments section (with permission)
- Given advance notice of the fix before public disclosure

## Acknowledgments

*No acknowledgments yet. Be the first to responsibly disclose a vulnerability!*

---

*This policy is effective as of March 2026.*
