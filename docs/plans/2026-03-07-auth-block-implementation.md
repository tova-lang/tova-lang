# Auth Block Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the `auth {}` top-level block that generates complete authentication — server endpoints, browser components, route guards, and $ signals — from a single declarative block.

**Architecture:** Auth uses the identifier-based plugin system (like security, cli, edge). New files: `auth-ast.js`, `auth-parser.js`, `auth-codegen.js`, `auth-plugin.js`. Auth codegen produces server-side code (endpoints, user table, JWT, OAuth, magic links) and browser-side code ($ signals, components, route guards). Integrated into existing server-codegen and browser-codegen via `authConfig` parameter.

**Tech Stack:** Tova compiler pipeline (lexer→parser→analyzer→codegen), Node crypto (PBKDF2, HMAC-SHA256, randomUUID), BroadcastChannel (cross-tab sync), Bun test runner.

**Design doc:** `docs/plans/2026-03-07-auth-block-design.md`

---

### Task 1: AST Node Definitions

**Files:**
- Create: `src/parser/auth-ast.js`
- Modify: `src/parser/ast.js:74` (after EdgeBlock)

**Step 1: Write the failing test**

In `tests/auth-block.test.js`:

```javascript
import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

function parse(source) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

describe('auth block - parsing', () => {
  test('empty auth block', () => {
    const ast = parse('auth {}');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0].type).toBe('AuthBlock');
    expect(ast.body[0].body).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/auth-block.test.js`
Expected: FAIL — `auth` not recognized as a block

**Step 3: Create `src/parser/auth-ast.js`**

```javascript
// Auth-specific AST Node definitions for the Tova language

export class AuthConfigField {
  constructor(key, value, loc) {
    this.type = 'AuthConfigField';
    this.key = key;
    this.value = value;
    this.loc = loc;
  }
}

export class AuthProviderDeclaration {
  constructor(providerType, name, config, loc) {
    this.type = 'AuthProviderDeclaration';
    this.providerType = providerType;  // 'email' | 'google' | 'github' | 'apple' | 'discord' | 'magic_link' | 'custom'
    this.name = name;                  // null for built-in types, string for custom ("gitlab")
    this.config = config;              // object { key: Expression }
    this.loc = loc;
  }
}

export class AuthHookDeclaration {
  constructor(event, handler, loc) {
    this.type = 'AuthHookDeclaration';
    this.event = event;       // 'signup' | 'login' | 'logout' | 'oauth_link'
    this.handler = handler;   // FunctionExpression or LambdaExpression
    this.loc = loc;
  }
}

export class AuthProtectedRoute {
  constructor(pattern, config, loc) {
    this.type = 'AuthProtectedRoute';
    this.pattern = pattern;   // string route pattern
    this.config = config;     // { redirect: Expression, require: Expression }
    this.loc = loc;
  }
}
```

**Step 4: Add `AuthBlock` to `src/parser/ast.js`**

After line 74 (after EdgeBlock closing brace), add:

```javascript
export class AuthBlock {
  constructor(body, loc) {
    this.type = 'AuthBlock';
    this.body = body;   // Array of AuthConfigField | AuthProviderDeclaration | AuthHookDeclaration | AuthProtectedRoute
    this.loc = loc;
  }
}
```

**Step 5: Commit**

```bash
git add src/parser/auth-ast.js src/parser/ast.js tests/auth-block.test.js
git commit -m "feat(auth): add AST node definitions for auth block"
```

---

### Task 2: Auth Parser

**Files:**
- Create: `src/parser/auth-parser.js`

**Step 1: Add more parsing tests to `tests/auth-block.test.js`**

```javascript
  test('auth with email provider', () => {
    const ast = parse(`auth {
      provider email {
        confirm_email: true
        password_min: 8
      }
    }`);
    const block = ast.body[0];
    expect(block.body).toHaveLength(1);
    const p = block.body[0];
    expect(p.type).toBe('AuthProviderDeclaration');
    expect(p.providerType).toBe('email');
    expect(p.name).toBe(null);
    expect(p.config.confirm_email).toBeDefined();
    expect(p.config.password_min).toBeDefined();
  });

  test('auth with oauth provider', () => {
    const ast = parse(`auth {
      provider google {
        client_id: "test-id"
        client_secret: "test-secret"
        scopes: ["email", "profile"]
      }
    }`);
    const p = ast.body[0].body[0];
    expect(p.providerType).toBe('google');
    expect(p.config.client_id).toBeDefined();
    expect(p.config.scopes).toBeDefined();
  });

  test('auth with custom oauth provider', () => {
    const ast = parse(`auth {
      provider custom "gitlab" {
        client_id: "id"
        auth_url: "https://gitlab.com/oauth/authorize"
      }
    }`);
    const p = ast.body[0].body[0];
    expect(p.providerType).toBe('custom');
    expect(p.name).toBe('gitlab');
  });

  test('auth with magic link provider', () => {
    const ast = parse(`auth {
      provider magic_link {
        expires: 600
      }
    }`);
    const p = ast.body[0].body[0];
    expect(p.providerType).toBe('magic_link');
  });

  test('auth with hooks', () => {
    const ast = parse(`auth {
      provider email {}
      on signup fn(user) { print(user.email) }
      on login fn(user) { print("login") }
    }`);
    const block = ast.body[0];
    expect(block.body).toHaveLength(3);
    expect(block.body[1].type).toBe('AuthHookDeclaration');
    expect(block.body[1].event).toBe('signup');
    expect(block.body[2].event).toBe('login');
  });

  test('auth with protected routes', () => {
    const ast = parse(`auth {
      provider email {}
      protected_route "/dashboard" { redirect: "/login" }
      protected_route "/admin/*" { require: Admin, redirect: "/unauthorized" }
    }`);
    const block = ast.body[0];
    expect(block.body).toHaveLength(3);
    const pr = block.body[1];
    expect(pr.type).toBe('AuthProtectedRoute');
    expect(pr.pattern).toBe('/dashboard');
    expect(pr.config.redirect).toBeDefined();
  });

  test('auth with config fields', () => {
    const ast = parse(`auth {
      secret: env("AUTH_SECRET")
      token_expires: 900
      refresh_expires: 604800
      storage: "cookie"
      provider email {}
    }`);
    const block = ast.body[0];
    const configs = block.body.filter(n => n.type === 'AuthConfigField');
    expect(configs).toHaveLength(4);
    expect(configs[0].key).toBe('secret');
    expect(configs[1].key).toBe('token_expires');
  });

  test('full auth block', () => {
    const ast = parse(`auth {
      secret: env("AUTH_SECRET")
      token_expires: 900
      storage: "cookie"

      provider email {
        confirm_email: true
        password_min: 8
        max_attempts: 5
        lockout_duration: 900
      }

      provider google {
        client_id: env("GOOGLE_CLIENT_ID")
        client_secret: env("GOOGLE_CLIENT_SECRET")
        scopes: ["email", "profile"]
      }

      provider magic_link {
        expires: 600
      }

      on signup fn(user) { print(user.email) }

      protected_route "/dashboard" { redirect: "/login" }
      protected_route "/admin/*" { require: Admin, redirect: "/unauthorized" }
    }`);
    const block = ast.body[0];
    expect(block.type).toBe('AuthBlock');
    const providers = block.body.filter(n => n.type === 'AuthProviderDeclaration');
    expect(providers).toHaveLength(3);
    const hooks = block.body.filter(n => n.type === 'AuthHookDeclaration');
    expect(hooks).toHaveLength(1);
    const routes = block.body.filter(n => n.type === 'AuthProtectedRoute');
    expect(routes).toHaveLength(2);
    const configs = block.body.filter(n => n.type === 'AuthConfigField');
    expect(configs).toHaveLength(3);
  });
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/auth-block.test.js`
Expected: FAIL — parser methods not defined

**Step 3: Create `src/parser/auth-parser.js`**

```javascript
// Auth-specific parser methods for the Tova language
// Extracted from parser.js for lazy loading — only loaded when auth { } blocks are encountered.

import { TokenType } from '../lexer/tokens.js';
import * as AST from './ast.js';
import { AuthConfigField, AuthProviderDeclaration, AuthHookDeclaration, AuthProtectedRoute } from './auth-ast.js';

// Known provider types (determines if we expect a custom name after the type)
const BUILTIN_PROVIDERS = new Set(['email', 'google', 'github', 'apple', 'discord', 'magic_link']);

// Config key tokens (identifiers that can also be keywords in other contexts)
const CONFIG_KEY_TOKENS = new Set([
  TokenType.IDENTIFIER, TokenType.TYPE, TokenType.STORE,
  TokenType.FN, TokenType.MATCH, TokenType.IF,
]);

export function installAuthParser(ParserClass) {
  if (ParserClass.prototype._authParserInstalled) return;
  ParserClass.prototype._authParserInstalled = true;

  ParserClass.prototype._expectAuthConfigKey = function(context) {
    if (CONFIG_KEY_TOKENS.has(this.current().type)) {
      return this.advance().value;
    }
    this.error(`Expected ${context} config key`);
  };

  ParserClass.prototype.parseAuthBlock = function() {
    const l = this.loc();
    this.advance(); // consume 'auth'
    this.expect(TokenType.LBRACE, "Expected '{' after 'auth'");
    const body = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      try {
        const stmt = this._parseAuthStatement();
        if (stmt) body.push(stmt);
      } catch (e) {
        this.errors.push(e);
        this._synchronizeBlock();
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close auth block");
    return new AST.AuthBlock(body, l);
  };

  ParserClass.prototype._parseAuthStatement = function() {
    if (!this.check(TokenType.IDENTIFIER)) {
      this.error("Expected auth declaration (provider, on, protected_route, or config field)");
    }

    const val = this.current().value;

    // provider <type> [name] { ... }
    if (val === 'provider' && this.peek(1).type === TokenType.IDENTIFIER) {
      return this._parseAuthProvider();
    }

    // on <event> fn(...) { ... }
    if (val === 'on' && this.peek(1).type === TokenType.IDENTIFIER) {
      return this._parseAuthHook();
    }

    // protected_route "pattern" { ... }
    if (val === 'protected_route' && this.peek(1).type === TokenType.STRING) {
      return this._parseAuthProtectedRoute();
    }

    // loading_component: fn() { ... } or other config: value
    if (this.peek(1).type === TokenType.COLON) {
      return this._parseAuthConfigField();
    }

    this.error("Expected provider, on, protected_route, or config field in auth block");
  };

  ParserClass.prototype._parseAuthProvider = function() {
    const l = this.loc();
    this.advance(); // consume 'provider'
    const providerType = this.expect(TokenType.IDENTIFIER, "Expected provider type").value;

    // Custom providers have a string name: provider custom "gitlab" { ... }
    let name = null;
    if (providerType === 'custom' && this.check(TokenType.STRING)) {
      name = this.advance().value;
    }

    // Parse config block
    const config = {};
    this.expect(TokenType.LBRACE, "Expected '{' after provider type");
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this._expectAuthConfigKey("provider");
      this.expect(TokenType.COLON, "Expected ':' after provider config key");
      config[key] = this.parseExpression();
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close provider config");

    return new AuthProviderDeclaration(providerType, name, config, l);
  };

  ParserClass.prototype._parseAuthHook = function() {
    const l = this.loc();
    this.advance(); // consume 'on'
    const event = this.expect(TokenType.IDENTIFIER, "Expected hook event (signup, login, logout, oauth_link)").value;

    // Expect fn(params) { body }
    this.expect(TokenType.FN, "Expected 'fn' after hook event");
    const handler = this.parseFunctionExpression();

    return new AuthHookDeclaration(event, handler, l);
  };

  ParserClass.prototype._parseAuthProtectedRoute = function() {
    const l = this.loc();
    this.advance(); // consume 'protected_route'
    const pattern = this.expect(TokenType.STRING, "Expected route pattern string").value;
    this.expect(TokenType.LBRACE, "Expected '{' after route pattern");

    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this._expectAuthConfigKey("protected_route");
      this.expect(TokenType.COLON, "Expected ':' after protected_route config key");
      config[key] = this.parseExpression();
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close protected_route config");

    return new AuthProtectedRoute(pattern, config, l);
  };

  ParserClass.prototype._parseAuthConfigField = function() {
    const l = this.loc();
    const key = this.advance().value;
    this.expect(TokenType.COLON, "Expected ':' after config key");
    const value = this.parseExpression();
    return new AuthConfigField(key, value, l);
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/auth-block.test.js`
Expected: Still FAIL — plugin not registered yet

**Step 5: Commit parser (will pass after Task 3)**

```bash
git add src/parser/auth-parser.js
git commit -m "feat(auth): add auth block parser"
```

---

### Task 3: Plugin Registration

**Files:**
- Create: `src/registry/plugins/auth-plugin.js`
- Modify: `src/registry/register-all.js`

**Step 1: Create `src/registry/plugins/auth-plugin.js`**

```javascript
import { installAuthParser } from '../../parser/auth-parser.js';

export const authPlugin = {
  name: 'auth',
  astNodeType: 'AuthBlock',
  detection: {
    strategy: 'identifier',
    identifierValue: 'auth',
  },
  parser: {
    install: installAuthParser,
    installedFlag: '_authParserInstalled',
    method: 'parseAuthBlock',
  },
  analyzer: {
    visit: (analyzer, node) => analyzer.visitAuthBlock(node),
    noopNodeTypes: [
      'AuthConfigField', 'AuthProviderDeclaration',
      'AuthHookDeclaration', 'AuthProtectedRoute',
    ],
    crossBlockValidate: (analyzer) => analyzer._validateAuthCrossBlock(),
  },
  codegen: {},
};
```

**Step 2: Update `src/registry/register-all.js`**

After line 16 (themePlugin import), add:

```javascript
import { authPlugin } from './plugins/auth-plugin.js';
```

After line 29 (last register call), add:

```javascript
BlockRegistry.register(authPlugin);
```

**Step 3: Run tests**

Run: `bun test tests/auth-block.test.js`
Expected: FAIL — `analyzer.visitAuthBlock is not a function`

**Step 4: Commit**

```bash
git add src/registry/plugins/auth-plugin.js src/registry/register-all.js
git commit -m "feat(auth): register auth block plugin"
```

---

### Task 4: Analyzer

**Files:**
- Modify: `src/analyzer/analyzer.js`

**Step 1: Add analyzer tests to `tests/auth-block.test.js`**

```javascript
import { Analyzer } from '../src/analyzer/analyzer.js';

function analyze(source) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze();
}

describe('auth block - analyzer', () => {
  test('no warnings for valid auth block', () => {
    const { warnings } = analyze(`auth {
      secret: env("AUTH_SECRET")
      provider email { confirm_email: true }
    }`);
    const authWarnings = warnings.filter(w => w.code?.startsWith('W_AUTH'));
    expect(authWarnings).toHaveLength(0);
  });

  test('W_AUTH_HARDCODED_SECRET for literal secret', () => {
    const { warnings } = analyze(`auth {
      secret: "my-hardcoded-secret"
      provider email {}
    }`);
    expect(warnings.some(w => w.code === 'W_AUTH_HARDCODED_SECRET')).toBe(true);
  });

  test('W_AUTH_MISSING_PROVIDER for empty auth', () => {
    const { warnings } = analyze(`auth {
      secret: env("SECRET")
    }`);
    expect(warnings.some(w => w.code === 'W_AUTH_MISSING_PROVIDER')).toBe(true);
  });

  test('W_AUTH_WEAK_PASSWORD for low password_min', () => {
    const { warnings } = analyze(`auth {
      provider email { password_min: 4 }
    }`);
    expect(warnings.some(w => w.code === 'W_AUTH_WEAK_PASSWORD')).toBe(true);
  });

  test('W_AUTH_NO_CONFIRM for email without confirm', () => {
    const { warnings } = analyze(`auth {
      provider email {}
    }`);
    expect(warnings.some(w => w.code === 'W_AUTH_NO_CONFIRM')).toBe(true);
  });

  test('W_AUTH_LOCAL_STORAGE for storage local', () => {
    const { warnings } = analyze(`auth {
      storage: "local"
      provider email { confirm_email: true }
    }`);
    expect(warnings.some(w => w.code === 'W_AUTH_LOCAL_STORAGE')).toBe(true);
  });

  test('W_AUTH_SHORT_TOKEN for very short token_expires', () => {
    const { warnings } = analyze(`auth {
      token_expires: 60
      provider email { confirm_email: true }
    }`);
    expect(warnings.some(w => w.code === 'W_AUTH_SHORT_TOKEN')).toBe(true);
  });

  test('W_AUTH_LONG_REFRESH for very long refresh', () => {
    const { warnings } = analyze(`auth {
      refresh_expires: 9999999
      provider email { confirm_email: true }
    }`);
    expect(warnings.some(w => w.code === 'W_AUTH_LONG_REFRESH')).toBe(true);
  });

  test('W_AUTH_PROTECTED_NO_REDIRECT for route without redirect', () => {
    const { warnings } = analyze(`auth {
      provider email { confirm_email: true }
      protected_route "/dashboard" { require: Admin }
    }`);
    expect(warnings.some(w => w.code === 'W_AUTH_PROTECTED_NO_REDIRECT')).toBe(true);
  });

  test('warns on duplicate provider type', () => {
    const { warnings } = analyze(`auth {
      provider email { confirm_email: true }
      provider email { confirm_email: false }
    }`);
    expect(warnings.some(w => w.code === 'W_AUTH_DUPLICATE_PROVIDER')).toBe(true);
  });

  test('warns on unknown hook event', () => {
    const { warnings } = analyze(`auth {
      provider email { confirm_email: true }
      on invalid_event fn(u) { print(u) }
    }`);
    expect(warnings.some(w => w.code === 'W_AUTH_UNKNOWN_HOOK')).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/auth-block.test.js`
Expected: FAIL — `visitAuthBlock is not a function`

**Step 3: Add `visitAuthBlock` and `_validateAuthCrossBlock` to `src/analyzer/analyzer.js`**

Find `visitSecurityBlock` (line 1232) and add after the closing of `_validateSecurityCrossBlock()`. The exact insertion point is after the `_validateSecurityCrossBlock` method ends. Add:

```javascript
  visitAuthBlock(node) {
    const validConfigKeys = new Set([
      'secret', 'token_expires', 'refresh_expires', 'storage', 'auto_link', 'loading_component',
    ]);
    const validHookEvents = new Set(['signup', 'login', 'logout', 'oauth_link']);
    const validProviderTypes = new Set([
      'email', 'google', 'github', 'apple', 'discord', 'magic_link', 'custom',
    ]);

    const providerTypes = new Set();
    let hasProvider = false;

    for (const stmt of node.body) {
      if (stmt.type === 'AuthConfigField') {
        // Check for hardcoded secret
        if (stmt.key === 'secret' && stmt.value.type === 'StringLiteral') {
          this.warnings.push({
            message: 'Auth secret should use env() — hardcoded secrets are insecure',
            loc: stmt.loc,
            code: 'W_AUTH_HARDCODED_SECRET',
            category: 'auth',
          });
        }
        // Check token_expires too short
        if (stmt.key === 'token_expires' && stmt.value.type === 'NumericLiteral' && stmt.value.value < 300) {
          this.warnings.push({
            message: 'Access token expires too quickly (< 5 minutes) — may cause frequent logouts',
            loc: stmt.loc,
            code: 'W_AUTH_SHORT_TOKEN',
            category: 'auth',
          });
        }
        // Check refresh_expires too long
        if (stmt.key === 'refresh_expires' && stmt.value.type === 'NumericLiteral' && stmt.value.value > 2592000) {
          this.warnings.push({
            message: 'Refresh token lives longer than 30 days — consider shorter lifetime',
            loc: stmt.loc,
            code: 'W_AUTH_LONG_REFRESH',
            category: 'auth',
          });
        }
        // Check localStorage warning
        if (stmt.key === 'storage' && stmt.value.type === 'StringLiteral' && stmt.value.value === 'local') {
          this.warnings.push({
            message: 'localStorage tokens are vulnerable to XSS — prefer storage: "cookie"',
            loc: stmt.loc,
            code: 'W_AUTH_LOCAL_STORAGE',
            category: 'auth',
          });
        }
      }

      if (stmt.type === 'AuthProviderDeclaration') {
        hasProvider = true;
        const key = stmt.providerType + (stmt.name ? ':' + stmt.name : '');
        if (providerTypes.has(key)) {
          this.warnings.push({
            message: `Duplicate auth provider '${key}'`,
            loc: stmt.loc,
            code: 'W_AUTH_DUPLICATE_PROVIDER',
            category: 'auth',
          });
        }
        providerTypes.add(key);

        // Email-specific checks
        if (stmt.providerType === 'email') {
          if (!stmt.config.confirm_email) {
            this.warnings.push({
              message: 'Email provider without confirm_email — consider requiring email verification',
              loc: stmt.loc,
              code: 'W_AUTH_NO_CONFIRM',
              category: 'auth',
            });
          }
          if (stmt.config.password_min && stmt.config.password_min.type === 'NumericLiteral' && stmt.config.password_min.value < 8) {
            this.warnings.push({
              message: 'Minimum password length is less than 8 characters — weak passwords allowed',
              loc: stmt.loc,
              code: 'W_AUTH_WEAK_PASSWORD',
              category: 'auth',
            });
          }
        }
      }

      if (stmt.type === 'AuthHookDeclaration') {
        if (!validHookEvents.has(stmt.event)) {
          this.warnings.push({
            message: `Unknown auth hook event '${stmt.event}' — valid events: ${[...validHookEvents].join(', ')}`,
            loc: stmt.loc,
            code: 'W_AUTH_UNKNOWN_HOOK',
            category: 'auth',
          });
        }
      }

      if (stmt.type === 'AuthProtectedRoute') {
        if (!stmt.config.redirect) {
          this.warnings.push({
            message: `Protected route '${stmt.pattern}' has no redirect — unauthenticated users will see a blank page`,
            loc: stmt.loc,
            code: 'W_AUTH_PROTECTED_NO_REDIRECT',
            category: 'auth',
          });
        }
      }
    }

    if (!hasProvider) {
      this.warnings.push({
        message: 'Auth block has no providers — add at least one provider (email, google, etc.)',
        loc: node.loc,
        code: 'W_AUTH_MISSING_PROVIDER',
        category: 'auth',
      });
    }
  }

  _validateAuthCrossBlock() {
    // Validate protected_route role references against security block roles
    const securityRoles = new Set();
    for (const node of this.ast.body) {
      if (node.type === 'SecurityBlock') {
        for (const stmt of node.body) {
          if (stmt.type === 'SecurityRoleDeclaration') {
            securityRoles.add(stmt.name);
          }
        }
      }
    }

    for (const node of this.ast.body) {
      if (node.type === 'AuthBlock') {
        for (const stmt of node.body) {
          if (stmt.type === 'AuthProtectedRoute' && stmt.config.require) {
            const roleName = stmt.config.require.type === 'Identifier' ? stmt.config.require.name : null;
            if (roleName && securityRoles.size > 0 && !securityRoles.has(roleName)) {
              this.warnings.push({
                message: `Protected route requires role '${roleName}' which is not defined in any security block`,
                loc: stmt.loc,
                code: 'W_AUTH_UNKNOWN_ROLE',
                category: 'auth',
              });
            }
          }
        }
      }
    }
  }
```

**Step 4: Run tests**

Run: `bun test tests/auth-block.test.js`
Expected: PASS

**Step 5: Run full test suite to check no regressions**

Run: `bun test`
Expected: All existing tests pass

**Step 6: Commit**

```bash
git add src/analyzer/analyzer.js tests/auth-block.test.js
git commit -m "feat(auth): add analyzer with security warnings"
```

---

### Task 5: Auth Codegen — Server Endpoints

**Files:**
- Create: `src/codegen/auth-codegen.js`
- Modify: `src/codegen/codegen.js`

**Step 1: Add codegen tests to `tests/auth-block.test.js`**

```javascript
import { CodeGenerator } from '../src/codegen/codegen.js';

function compile(source) {
  const ast = parse(source);
  const gen = new CodeGenerator(ast, '<test>', { sourceMaps: false });
  return gen.generate();
}

describe('auth block - server codegen', () => {
  test('generates signup endpoint', () => {
    const result = compile(`
      auth {
        provider email { confirm_email: true }
      }
      server {}
    `);
    const server = result.servers?.default || result.server || '';
    expect(server).toContain('/auth/signup');
    expect(server).toContain('hash_password');
  });

  test('generates login endpoint', () => {
    const result = compile(`
      auth {
        provider email {}
      }
      server {}
    `);
    const server = result.servers?.default || result.server || '';
    expect(server).toContain('/auth/login');
    expect(server).toContain('sign_jwt');
  });

  test('generates logout endpoint', () => {
    const result = compile(`
      auth {
        provider email {}
      }
      server {}
    `);
    const server = result.servers?.default || result.server || '';
    expect(server).toContain('/auth/logout');
  });

  test('generates refresh endpoint', () => {
    const result = compile(`
      auth {
        provider email {}
      }
      server {}
    `);
    const server = result.servers?.default || result.server || '';
    expect(server).toContain('/auth/refresh');
  });

  test('generates me endpoint', () => {
    const result = compile(`
      auth {
        provider email {}
      }
      server {}
    `);
    const server = result.servers?.default || result.server || '';
    expect(server).toContain('/auth/me');
  });

  test('generates OAuth redirect and callback for google', () => {
    const result = compile(`
      auth {
        provider google {
          client_id: "test"
          client_secret: "secret"
        }
      }
      server {}
    `);
    const server = result.servers?.default || result.server || '';
    expect(server).toContain('/auth/oauth/google');
    expect(server).toContain('/auth/oauth/google/callback');
    expect(server).toContain('code_challenge');
  });

  test('generates magic link endpoints', () => {
    const result = compile(`
      auth {
        provider magic_link {
          expires: 600
        }
      }
      server {}
    `);
    const server = result.servers?.default || result.server || '';
    expect(server).toContain('/auth/magic-link');
    expect(server).toContain('/auth/magic-link/verify');
  });

  test('generates user table creation', () => {
    const result = compile(`
      auth {
        provider email {}
      }
      server {}
    `);
    const server = result.servers?.default || result.server || '';
    expect(server).toContain('__auth_users');
    expect(server).toContain('CREATE TABLE');
  });

  test('generates password reset endpoints for email provider', () => {
    const result = compile(`
      auth {
        provider email { confirm_email: true }
      }
      server {}
    `);
    const server = result.servers?.default || result.server || '';
    expect(server).toContain('/auth/forgot-password');
    expect(server).toContain('/auth/reset-password');
  });

  test('generates email confirmation endpoint', () => {
    const result = compile(`
      auth {
        provider email { confirm_email: true }
      }
      server {}
    `);
    const server = result.servers?.default || result.server || '';
    expect(server).toContain('/auth/confirm/');
  });

  test('hooks are wired into handlers', () => {
    const result = compile(`
      auth {
        provider email { confirm_email: true }
        on signup fn(user) { print(user.email) }
      }
      server {}
    `);
    const server = result.servers?.default || result.server || '';
    expect(server).toContain('__auth_hook_signup');
  });

  test('configures token expiry from config', () => {
    const result = compile(`
      auth {
        token_expires: 1800
        refresh_expires: 86400
        provider email {}
      }
      server {}
    `);
    const server = result.servers?.default || result.server || '';
    expect(server).toContain('1800');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/auth-block.test.js`
Expected: FAIL — auth codegen not implemented

**Step 3: Create `src/codegen/auth-codegen.js`**

This is the largest file. It must generate:
- User table DDL
- `sign_jwt()` / `verify_jwt()` helpers
- `hash_password()` / `verify_password()` helpers
- All auth endpoint handlers
- OAuth PKCE flow
- Magic link flow
- Token refresh with rotation
- Hook wiring

The class structure:

```javascript
// Auth code generator for the Tova language
// Generates server-side auth endpoints, browser-side signals/components, and route guards.

export class AuthCodegen {

  static mergeAuthBlocks(authBlocks) {
    // Merge all AuthBlock nodes into a single config object
    const config = {
      secret: null,
      token_expires: 900,      // 15 min default
      refresh_expires: 604800, // 7 days default
      storage: 'cookie',
      auto_link: true,
    };
    const providers = [];
    const hooks = {};       // event → handler AST
    const protectedRoutes = [];

    for (const block of authBlocks) {
      for (const stmt of block.body) {
        switch (stmt.type) {
          case 'AuthConfigField':
            config[stmt.key] = stmt.value;
            break;
          case 'AuthProviderDeclaration':
            providers.push(stmt);
            break;
          case 'AuthHookDeclaration':
            hooks[stmt.event] = stmt.handler;
            break;
          case 'AuthProtectedRoute':
            protectedRoutes.push(stmt);
            break;
        }
      }
    }

    return { config, providers, hooks, protectedRoutes };
  }

  generateServerCode(authConfig, baseCodegen) {
    // Returns string of server-side JS code to inject into server output
    // Sections: table creation, crypto helpers, endpoints, hook wiring
  }

  generateBrowserCode(authConfig, baseCodegen) {
    // Returns string of browser-side JS code to inject into browser output
    // Sections: $ signals, components, route guards, cross-tab sync
  }

  // Private helpers for each endpoint
  _genUserTable() { ... }
  _genCryptoHelpers() { ... }
  _genSignupEndpoint(emailProvider) { ... }
  _genLoginEndpoint(emailProvider) { ... }
  _genLogoutEndpoint() { ... }
  _genRefreshEndpoint() { ... }
  _genMeEndpoint() { ... }
  _genConfirmEndpoint() { ... }
  _genForgotPasswordEndpoint() { ... }
  _genResetPasswordEndpoint() { ... }
  _genOAuthRedirect(provider) { ... }
  _genOAuthCallback(provider) { ... }
  _genMagicLinkEndpoint(provider) { ... }
  _genMagicLinkVerify(provider) { ... }
  _genHookWiring(hooks) { ... }
}
```

Implement the full class with all methods. Each `_gen*` method returns an array of lines. The `generateServerCode` method assembles them in order, wrapping endpoints in the server's route handler pattern.

Key implementation details:
- Use `crypto.randomUUID()` for IDs
- Use `crypto.createHmac('sha256', secret)` for JWT
- Use `crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512')` for passwords
- Use `crypto.timingSafeEqual()` for all comparisons
- OAuth PKCE: `crypto.randomBytes(32)` for code_verifier, SHA256 for code_challenge
- Refresh token rotation: store token hash + family, invalidate entire family on reuse
- Rate limiting: in-memory Map with IP → {count, resetAt}

**Step 4: Update `src/codegen/codegen.js`**

After line 49 (after ThemeCodegen), add:

```javascript
let _AuthCodegen;
function getAuthCodegen() {
  if (!_AuthCodegen) _AuthCodegen = _require('./auth-codegen.js').AuthCodegen;
  return _AuthCodegen;
}
```

After line 108 (after themeBlocks), add:

```javascript
    const authBlocks = getBlocks('auth');
```

After line 234 (after themeConfig), add:

```javascript
    // Merge auth blocks into a single config
    const authConfig = authBlocks.length > 0
      ? getAuthCodegen().mergeAuthBlocks(authBlocks)
      : null;
```

Update server generate call (line 256) to pass authConfig:

```javascript
      servers[key] = gen.generate(blocks, combinedShared, name, peerBlocks, allSharedBlocks, securityConfig, authConfig);
```

Update browser generate call (line 287) to pass authConfig:

```javascript
      browsers[key] = gen.generate(blocks, combinedShared, sharedGen._usedBuiltins, securityConfig, typeValidatorsMap, themeConfig, authConfig);
```

**Step 5: Update `src/codegen/server-codegen.js` generate() signature**

Change line 220:

```javascript
  generate(serverBlocks, sharedCode, blockName = null, peerBlocks = null, sharedBlocks = [], securityConfig = null, authConfig = null) {
```

Add auth code injection at the end of the startup section (before listen), calling:

```javascript
    if (authConfig) {
      const AuthCG = getAuthCodegen();
      const authGen = new AuthCG();
      const authCode = authGen.generateServerCode(authConfig, this);
      lines.push(authCode);
    }
```

**Step 6: Update `src/codegen/browser-codegen.js` generate() signature**

Change line 203:

```javascript
  generate(browserBlocks, sharedCode, sharedBuiltins = null, securityConfig = null, typeValidatorsMap = null, themeConfig = null, authConfig = null) {
```

Add auth code injection after the component/signal setup:

```javascript
    if (authConfig) {
      const AuthCG = getAuthCodegen();
      const authGen = new AuthCG();
      const authBrowserCode = authGen.generateBrowserCode(authConfig, this);
      lines.push(authBrowserCode);
    }
```

**Step 7: Run tests**

Run: `bun test tests/auth-block.test.js`
Expected: PASS

**Step 8: Run full test suite**

Run: `bun test`
Expected: All existing tests pass (no regressions from the new authConfig parameter)

**Step 9: Commit**

```bash
git add src/codegen/auth-codegen.js src/codegen/codegen.js src/codegen/server-codegen.js src/codegen/browser-codegen.js tests/auth-block.test.js
git commit -m "feat(auth): add server-side auth codegen (endpoints, JWT, OAuth, magic links)"
```

---

### Task 6: Browser Codegen — $ Signals, Components, Route Guards

**Files:**
- Modify: `src/codegen/auth-codegen.js` (add `generateBrowserCode`)

**Step 1: Add browser codegen tests to `tests/auth-block.test.js`**

```javascript
describe('auth block - browser codegen', () => {
  test('generates $currentUser signal', () => {
    const result = compile(`
      auth {
        provider email {}
      }
      server {}
      browser {}
    `);
    const browser = result.browsers?.default || result.browser || '';
    expect(browser).toContain('$currentUser');
    expect(browser).toContain('createSignal');
  });

  test('generates $isAuthenticated signal', () => {
    const result = compile(`
      auth {
        provider email {}
      }
      server {}
      browser {}
    `);
    const browser = result.browsers?.default || result.browser || '';
    expect(browser).toContain('$isAuthenticated');
  });

  test('generates $authLoading signal', () => {
    const result = compile(`
      auth {
        provider email {}
      }
      server {}
      browser {}
    `);
    const browser = result.browsers?.default || result.browser || '';
    expect(browser).toContain('$authLoading');
  });

  test('generates logout function', () => {
    const result = compile(`
      auth {
        provider email {}
      }
      server {}
      browser {}
    `);
    const browser = result.browsers?.default || result.browser || '';
    expect(browser).toContain('function logout');
  });

  test('generates LoginForm component', () => {
    const result = compile(`
      auth {
        provider email {}
      }
      server {}
      browser {}
    `);
    const browser = result.browsers?.default || result.browser || '';
    expect(browser).toContain('LoginForm');
  });

  test('generates SignupForm component', () => {
    const result = compile(`
      auth {
        provider email {}
      }
      server {}
      browser {}
    `);
    const browser = result.browsers?.default || result.browser || '';
    expect(browser).toContain('SignupForm');
  });

  test('generates AuthGuard component', () => {
    const result = compile(`
      auth {
        provider email {}
      }
      server {}
      browser {}
    `);
    const browser = result.browsers?.default || result.browser || '';
    expect(browser).toContain('AuthGuard');
  });

  test('generates OAuth buttons for configured providers', () => {
    const result = compile(`
      auth {
        provider email {}
        provider google { client_id: "id", client_secret: "secret" }
        provider github { client_id: "id", client_secret: "secret" }
      }
      server {}
      browser {}
    `);
    const browser = result.browsers?.default || result.browser || '';
    expect(browser).toContain('/auth/oauth/google');
    expect(browser).toContain('/auth/oauth/github');
  });

  test('generates route guards for protected routes', () => {
    const result = compile(`
      auth {
        provider email {}
        protected_route "/dashboard" { redirect: "/login" }
      }
      server {}
      browser {}
    `);
    const browser = result.browsers?.default || result.browser || '';
    expect(browser).toContain('/dashboard');
    expect(browser).toContain('/login');
    expect(browser).toContain('__auth_route_guard');
  });

  test('generates cross-tab sync', () => {
    const result = compile(`
      auth {
        provider email {}
      }
      server {}
      browser {}
    `);
    const browser = result.browsers?.default || result.browser || '';
    expect(browser).toContain('BroadcastChannel');
    expect(browser).toContain('__tova_auth');
  });

  test('cookie storage generates credentials include', () => {
    const result = compile(`
      auth {
        storage: "cookie"
        provider email {}
      }
      server {}
      browser {}
    `);
    const browser = result.browsers?.default || result.browser || '';
    expect(browser).toContain('credentials');
  });

  test('generates ForgotPasswordForm for email provider', () => {
    const result = compile(`
      auth {
        provider email { confirm_email: true }
      }
      server {}
      browser {}
    `);
    const browser = result.browsers?.default || result.browser || '';
    expect(browser).toContain('ForgotPasswordForm');
    expect(browser).toContain('ResetPasswordForm');
  });
});
```

**Step 2: Implement `generateBrowserCode` in `src/codegen/auth-codegen.js`**

This generates:
1. `$currentUser`, `$isAuthenticated`, `$authLoading` signals using `createSignal`
2. `logout()` function that calls `/auth/logout` and clears state
3. `LoginForm`, `SignupForm`, `ForgotPasswordForm`, `ResetPasswordForm` component functions
4. `AuthGuard` component function
5. `__auth_route_guard` middleware for SPA router
6. `BroadcastChannel` cross-tab sync
7. Token refresh on mount (check `/auth/me` or use refresh token)
8. RPC interceptor for auth header (localStorage mode) or credentials:include (cookie mode)

**Step 3: Run tests**

Run: `bun test tests/auth-block.test.js`
Expected: PASS

**Step 4: Commit**

```bash
git add src/codegen/auth-codegen.js tests/auth-block.test.js
git commit -m "feat(auth): add browser-side codegen ($ signals, components, route guards)"
```

---

### Task 7: Integration Tests & Edge Cases

**Files:**
- Modify: `tests/auth-block.test.js`

**Step 1: Add integration tests**

```javascript
describe('auth block - integration', () => {
  test('auth + security block coexist', () => {
    const result = compile(`
      security {
        role Admin { can: [manage_users] }
        role User { can: [view_profile] }
      }
      auth {
        provider email { confirm_email: true }
        protected_route "/admin/*" { require: Admin, redirect: "/login" }
      }
      server {}
      browser {}
    `);
    expect(result.servers?.default || result.server).toBeDefined();
    expect(result.browsers?.default || result.browser).toBeDefined();
  });

  test('auth block without server block still parses', () => {
    const ast = parse(`auth {
      provider email {}
    }`);
    expect(ast.body[0].type).toBe('AuthBlock');
  });

  test('multiple OAuth providers', () => {
    const result = compile(`
      auth {
        provider google { client_id: "g", client_secret: "gs" }
        provider github { client_id: "gh", client_secret: "ghs" }
        provider apple { client_id: "a", team_id: "t", key_id: "k", private_key: "pk" }
      }
      server {}
    `);
    const server = result.servers?.default || result.server || '';
    expect(server).toContain('/auth/oauth/google');
    expect(server).toContain('/auth/oauth/github');
    expect(server).toContain('/auth/oauth/apple');
  });

  test('email + magic_link providers together', () => {
    const result = compile(`
      auth {
        provider email { confirm_email: true }
        provider magic_link { expires: 600 }
      }
      server {}
    `);
    const server = result.servers?.default || result.server || '';
    expect(server).toContain('/auth/signup');
    expect(server).toContain('/auth/magic-link');
  });

  test('custom OAuth provider', () => {
    const result = compile(`
      auth {
        provider custom "gitlab" {
          client_id: "id"
          client_secret: "secret"
          auth_url: "https://gitlab.com/oauth/authorize"
          token_url: "https://gitlab.com/oauth/token"
          profile_url: "https://gitlab.com/api/v4/user"
          scopes: ["read_user"]
        }
      }
      server {}
    `);
    const server = result.servers?.default || result.server || '';
    expect(server).toContain('/auth/oauth/gitlab');
    expect(server).toContain('gitlab.com/oauth/authorize');
  });

  test('all hooks wired', () => {
    const result = compile(`
      auth {
        provider email { confirm_email: true }
        on signup fn(user) { print("signup") }
        on login fn(user) { print("login") }
        on logout fn(user) { print("logout") }
        on oauth_link fn(user, provider, profile) { print("link") }
      }
      server {}
    `);
    const server = result.servers?.default || result.server || '';
    expect(server).toContain('__auth_hook_signup');
    expect(server).toContain('__auth_hook_login');
    expect(server).toContain('__auth_hook_logout');
    expect(server).toContain('__auth_hook_oauth_link');
  });

  test('analyzer: cross-block role validation', () => {
    const { warnings } = analyze(`
      security {
        role Admin { can: [manage] }
      }
      auth {
        provider email { confirm_email: true }
        protected_route "/admin/*" { require: NonExistentRole, redirect: "/login" }
      }
    `);
    expect(warnings.some(w => w.code === 'W_AUTH_UNKNOWN_ROLE')).toBe(true);
  });

  test('analyzer: no warning for valid role reference', () => {
    const { warnings } = analyze(`
      security {
        role Admin { can: [manage] }
      }
      auth {
        provider email { confirm_email: true }
        protected_route "/admin/*" { require: Admin, redirect: "/login" }
      }
    `);
    expect(warnings.some(w => w.code === 'W_AUTH_UNKNOWN_ROLE')).toBe(false);
  });
});
```

**Step 2: Run tests**

Run: `bun test tests/auth-block.test.js`
Expected: PASS

**Step 3: Run full test suite**

Run: `bun test`
Expected: All tests pass — no regressions

**Step 4: Commit**

```bash
git add tests/auth-block.test.js
git commit -m "test(auth): add integration tests and edge cases"
```

---

### Task 8: $ Signal Convention Infrastructure

**Files:**
- Modify: `src/codegen/browser-codegen.js`

**Step 1: Add tests for $ signal handling**

In `tests/auth-block.test.js`:

```javascript
describe('auth block - $ signal convention', () => {
  test('$ signals are readable in JSX expressions', () => {
    const result = compile(`
      auth {
        provider email {}
      }
      server {}
      browser {
        component App {
          <div>
            {if $isAuthenticated {
              <p>{$currentUser.email}</p>
            } else {
              <p>"Not logged in"</p>
            }}
          </div>
        }
      }
    `);
    const browser = result.browsers?.default || result.browser || '';
    // $isAuthenticated should compile to a signal read: $isAuthenticated()
    expect(browser).toContain('$isAuthenticated()');
    // $currentUser should compile to a signal read: $currentUser()
    expect(browser).toContain('$currentUser()');
  });

  test('$ signals treated as reactive (signal reads)', () => {
    const result = compile(`
      auth {
        provider email {}
      }
      server {}
      browser {
        component Profile {
          <div>
            <p>{$currentUser.email}</p>
            <p>{$authLoading}</p>
          </div>
        }
      }
    `);
    const browser = result.browsers?.default || result.browser || '';
    // Should be called as signal getter (function call)
    expect(browser).toContain('$currentUser()');
    expect(browser).toContain('$authLoading()');
  });
});
```

**Step 2: Implement $ signal handling in browser-codegen**

In `browser-codegen.js`, the `genIdentifier` method already transforms state names to function calls (e.g., `count` → `count()`). We need to ensure that identifiers starting with `$` in components are also treated as signal reads.

The auth codegen injects `$currentUser`, `$isAuthenticated`, `$authLoading` as module-level signals. The browser-codegen needs to:
1. Track `$`-prefixed names as signal names (add to `stateNames` set)
2. When generating identifier access, transform `$currentUser` → `$currentUser()` in reactive contexts

This may require modifying `genIdentifier` in browser-codegen to check for `$` prefix:

```javascript
// In genIdentifier or wherever state names are resolved:
if (name.startsWith('$') && this._authSignals?.has(name)) {
  return `${name}()`;
}
```

**Step 3: Run tests**

Run: `bun test tests/auth-block.test.js`
Expected: PASS

**Step 4: Commit**

```bash
git add src/codegen/browser-codegen.js tests/auth-block.test.js
git commit -m "feat(auth): implement $ signal convention for system-injected reactive state"
```

---

### Task 9: Full Test Suite Pass & Cleanup

**Files:**
- All modified files

**Step 1: Run full test suite**

Run: `bun test`
Expected: ALL tests pass

**Step 2: Fix any regressions**

If any existing tests broke due to the new `authConfig` parameter on `generate()`, fix them. Common issues:
- Tests that call `generate()` directly may need to pass `null` for the new parameter
- Tests that check exact output may need updating if stdlib helpers changed

**Step 3: Count auth tests**

Run: `bun test tests/auth-block.test.js --verbose 2>&1 | tail -5`
Expected: 40+ tests passing

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(auth): complete auth block implementation - parsing, analysis, server + browser codegen"
```

---

### Summary of all files

**New files (5):**
- `src/parser/auth-ast.js` — 4 AST node classes
- `src/parser/auth-parser.js` — parser with `installAuthParser()`
- `src/registry/plugins/auth-plugin.js` — plugin registration
- `src/codegen/auth-codegen.js` — server + browser code generation
- `tests/auth-block.test.js` — comprehensive test suite

**Modified files (5):**
- `src/parser/ast.js` — add `AuthBlock` class
- `src/registry/register-all.js` — register auth plugin
- `src/analyzer/analyzer.js` — add `visitAuthBlock()`, `_validateAuthCrossBlock()`
- `src/codegen/codegen.js` — lazy-load AuthCodegen, extract auth blocks, pass authConfig
- `src/codegen/server-codegen.js` — accept `authConfig` param, inject auth code
- `src/codegen/browser-codegen.js` — accept `authConfig` param, inject auth code, $ signal support
