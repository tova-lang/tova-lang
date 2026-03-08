import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { AuthCodegen } from '../src/codegen/auth-codegen.js';

function parse(source) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

function analyze(source) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze();
}

function compile(source) {
  const ast = parse(source);
  const gen = new CodeGenerator(ast, '<test>', { sourceMaps: false });
  return gen.generate();
}

describe('auth block - parsing', () => {
  test('empty auth block', () => {
    const ast = parse('auth {}');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0].type).toBe('AuthBlock');
    expect(ast.body[0].body).toHaveLength(0);
  });

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
});

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

  test('cross-block: warns on unknown role reference', () => {
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

  test('cross-block: no warning for valid role reference', () => {
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

// ═══════════════════════════════════════════════════════════════
// Auth Codegen — mergeAuthBlocks
// ═══════════════════════════════════════════════════════════════
describe('auth block - mergeAuthBlocks', () => {
  test('merges config fields from AST', () => {
    const ast = parse(`auth {
      token_expires: 1800
      refresh_expires: 86400
      storage: "local"
      provider email {}
    }`);
    const merged = AuthCodegen.mergeAuthBlocks([ast.body[0]]);
    expect(merged.config.token_expires).toBe(1800);
    expect(merged.config.refresh_expires).toBe(86400);
    expect(merged.config.storage).toBe('local');
  });

  test('collects providers', () => {
    const ast = parse(`auth {
      provider email { confirm_email: true }
      provider google { client_id: "id", client_secret: "secret" }
    }`);
    const merged = AuthCodegen.mergeAuthBlocks([ast.body[0]]);
    expect(merged.providers).toHaveLength(2);
    expect(merged.providers[0].providerType).toBe('email');
    expect(merged.providers[1].providerType).toBe('google');
  });

  test('collects hooks', () => {
    const ast = parse(`auth {
      provider email {}
      on signup fn(user) { print(user) }
      on login fn(user) { print("login") }
    }`);
    const merged = AuthCodegen.mergeAuthBlocks([ast.body[0]]);
    expect(merged.hooks.signup).toBeDefined();
    expect(merged.hooks.login).toBeDefined();
    expect(merged.hooks.logout).toBeUndefined();
  });

  test('collects protected routes', () => {
    const ast = parse(`auth {
      provider email {}
      protected_route "/dashboard" { redirect: "/login" }
      protected_route "/admin/*" { require: Admin, redirect: "/unauthorized" }
    }`);
    const merged = AuthCodegen.mergeAuthBlocks([ast.body[0]]);
    expect(merged.protectedRoutes).toHaveLength(2);
    expect(merged.protectedRoutes[0].pattern).toBe('/dashboard');
    expect(merged.protectedRoutes[1].pattern).toBe('/admin/*');
  });

  test('uses defaults for missing config', () => {
    const ast = parse(`auth { provider email {} }`);
    const merged = AuthCodegen.mergeAuthBlocks([ast.body[0]]);
    expect(merged.config.token_expires).toBe(900);
    expect(merged.config.refresh_expires).toBe(604800);
    expect(merged.config.storage).toBe('cookie');
    expect(merged.config.auto_link).toBe(true);
  });

  test('keeps AST node for complex secret expression', () => {
    const ast = parse(`auth {
      secret: env("AUTH_SECRET")
      provider email {}
    }`);
    const merged = AuthCodegen.mergeAuthBlocks([ast.body[0]]);
    // env("AUTH_SECRET") is a CallExpression AST node, not a primitive
    expect(merged.config.secret).toBeDefined();
    expect(merged.config.secret.type).toBe('CallExpression');
  });
});

// ═══════════════════════════════════════════════════════════════
// Auth Codegen — Server Code Generation
// ═══════════════════════════════════════════════════════════════
describe('auth block - server codegen', () => {
  test('email provider generates signup endpoint', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider email { password_min: 8 }
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('/auth/signup');
    expect(code).toContain('__addRoute("POST", "/auth/signup"');
    expect(code).toContain('__auth_hash_password');
    expect(code).toContain('password.length < 8');
  });

  test('email provider generates login endpoint', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider email {}
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('/auth/login');
    expect(code).toContain('__addRoute("POST", "/auth/login"');
    expect(code).toContain('__auth_verify_password');
    expect(code).toContain('__auth_check_rate');
  });

  test('generates core endpoints (logout, refresh, me)', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider email {}
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('__addRoute("POST", "/auth/logout"');
    expect(code).toContain('__addRoute("POST", "/auth/refresh"');
    expect(code).toContain('__addRoute("GET", "/auth/me"');
  });

  test('generates JWT helpers', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider email {}
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('__auth_sign_jwt');
    expect(code).toContain('__auth_verify_jwt');
    expect(code).toContain('HS256');
    expect(code).toContain('timingSafeEqual');
  });

  test('generates user table DDL', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider email {}
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('CREATE TABLE IF NOT EXISTS __auth_users');
    expect(code).toContain('CREATE TABLE IF NOT EXISTS __auth_refresh_tokens');
    expect(code).toContain('CREATE TABLE IF NOT EXISTS __auth_password_resets');
  });

  test('generates auth middleware', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider email {}
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('__auth_authenticate');
    expect(code).toContain('__auth_get_cookie');
  });

  test('generates rate limiting', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider email {}
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('__auth_rate');
    expect(code).toContain('__auth_check_rate');
  });

  test('cookie storage generates Set-Cookie on logout', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        storage: "cookie"
        provider email {}
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('Set-Cookie');
    expect(code).toContain('__tova_auth=');
    expect(code).toContain('Max-Age=0');
  });

  test('local storage does not generate Set-Cookie on logout', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        storage: "local"
        provider email {}
      }
    `);
    const code = result.server || result.servers?.default || '';
    // Extract the logout endpoint section
    const logoutIdx = code.indexOf('/auth/logout');
    expect(logoutIdx).toBeGreaterThan(-1);
    // The logout handler should NOT contain Set-Cookie
    const logoutSection = code.substring(logoutIdx, logoutIdx + 500);
    expect(logoutSection).not.toContain('Set-Cookie');
  });

  test('confirm_email generates confirm endpoint and modifies signup', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider email { confirm_email: true }
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('/auth/confirm');
    expect(code).toContain('email_confirmed');
    expect(code).toContain('Check your email to confirm');
    expect(code).toContain('__auth_email_confirmations');
  });

  test('no confirm endpoint when confirm_email is false', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider email { confirm_email: false }
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).not.toContain('__addRoute("POST", "/auth/confirm"');
  });

  test('forgot-password and reset-password endpoints for email provider', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider email {}
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('/auth/forgot-password');
    expect(code).toContain('/auth/reset-password');
    expect(code).toContain('__auth_password_resets');
  });

  test('custom token_expires is used', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        token_expires: 3600
        provider email {}
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('__auth_token_expires = 3600');
  });

  test('custom refresh_expires is used', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        refresh_expires: 86400
        provider email {}
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('__auth_refresh_expires = 86400');
  });

  test('oauth provider generates redirect and callback', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider google {
          client_id: "test-client-id"
          client_secret: "test-client-secret"
          scopes: ["email", "profile"]
        }
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('/auth/oauth/google');
    expect(code).toContain('/auth/oauth/google/callback');
    expect(code).toContain('accounts.google.com');
    expect(code).toContain('oauth2.googleapis.com/token');
    expect(code).toContain('googleapis.com/oauth2/v2/userinfo');
    expect(code).toContain('test-client-id');
  });

  test('github oauth uses correct URLs', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider github {
          client_id: "gh-id"
          client_secret: "gh-secret"
        }
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('/auth/oauth/github');
    expect(code).toContain('github.com/login/oauth/authorize');
    expect(code).toContain('github.com/login/oauth/access_token');
    expect(code).toContain('api.github.com/user');
  });

  test('custom oauth provider uses custom name and URLs', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider custom "gitlab" {
          client_id: "gl-id"
          client_secret: "gl-secret"
          auth_url: "https://gitlab.com/oauth/authorize"
          token_url: "https://gitlab.com/oauth/token"
          profile_url: "https://gitlab.com/api/v4/user"
        }
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('/auth/oauth/gitlab');
    expect(code).toContain('/auth/oauth/gitlab/callback');
    expect(code).toContain('gitlab.com/oauth/authorize');
    expect(code).toContain('gitlab.com/oauth/token');
  });

  test('magic link provider generates endpoints', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider magic_link {
          expires: 600
        }
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('/auth/magic-link');
    expect(code).toContain('/auth/magic-link/verify/:token');
    expect(code).toContain('__auth_magic_tokens');
    expect(code).toContain('600');
  });

  test('hooks are wired into generated code', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider email {}
        on signup fn(user) { print(user.email) }
        on login fn(user) { print("logged in") }
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('__auth_hook_signup');
    expect(code).toContain('__auth_hook_login');
    // Hooks that aren't provided should be null
    expect(code).toContain('__auth_hook_logout = null');
    expect(code).toContain('__auth_hook_oauth_link = null');
  });

  test('account lockout with custom max_attempts', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider email {
          max_attempts: 3
          lockout_duration: 1800
        }
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('attempts >= 3');
    expect(code).toContain('1800');
    expect(code).toContain('Account locked');
  });

  test('custom password_min is reflected in signup', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider email { password_min: 12 }
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('password.length < 12');
    expect(code).toContain('at least 12 characters');
  });

  test('refresh token rotation detects reuse', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider email {}
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('Token reuse detected');
    expect(code).toContain('DELETE FROM __auth_refresh_tokens WHERE family');
  });

  test('multiple providers generate all endpoints', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider email { confirm_email: true }
        provider google {
          client_id: "gid"
          client_secret: "gsecret"
        }
        provider magic_link { expires: 300 }
      }
    `);
    const code = result.server || result.servers?.default || '';
    // Email endpoints
    expect(code).toContain('/auth/signup');
    expect(code).toContain('/auth/login');
    expect(code).toContain('/auth/confirm');
    // OAuth endpoints
    expect(code).toContain('/auth/oauth/google');
    // Magic link endpoints
    expect(code).toContain('/auth/magic-link');
    // Core endpoints
    expect(code).toContain('/auth/logout');
    expect(code).toContain('/auth/refresh');
    expect(code).toContain('/auth/me');
  });

  test('no email provider means no signup/login endpoints', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider google {
          client_id: "gid"
          client_secret: "gsecret"
        }
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).not.toContain('/auth/signup');
    expect(code).not.toContain('/auth/login');
    // But core endpoints still present
    expect(code).toContain('/auth/logout');
    expect(code).toContain('/auth/refresh');
    expect(code).toContain('/auth/me');
  });

  test('env() secret is resolved to env() call', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        secret: env("AUTH_SECRET")
        provider email {}
      }
    `);
    const code = result.server || result.servers?.default || '';
    // env("AUTH_SECRET") is a Tova stdlib function that reads process.env at runtime
    expect(code).toContain('env("AUTH_SECRET")');
    expect(code).toContain('__auth_secret = env("AUTH_SECRET")');
  });

  test('PKCE code challenge in OAuth redirect', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider google {
          client_id: "gid"
          client_secret: "gsecret"
        }
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('code_challenge');
    expect(code).toContain('code_verifier');
    expect(code).toContain('S256');
  });

  test('password hashing uses pbkdf2', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider email {}
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('pbkdf2Sync');
    expect(code).toContain('100000');
    expect(code).toContain('sha512');
  });

  test('auth block boundary markers present', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider email {}
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('Auth Block');
    expect(code).toContain('End Auth Block');
  });

  test('apple oauth decodes id_token instead of fetching profile URL', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider apple {
          client_id: "apple-id"
          client_secret: "apple-secret"
        }
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('/auth/oauth/apple');
    expect(code).toContain('/auth/oauth/apple/callback');
    // Apple should NOT generate a fetch to null
    expect(code).not.toContain('fetch(null');
    // Apple should decode id_token from the token response
    expect(code).toContain('id_token');
    expect(code).toContain('base64url');
    // Should still have the normal profile flow for the else branch
    expect(code).toContain('=== null');
  });

  test('cookie mode OAuth callback does not leak token in URL', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        storage: "cookie"
        provider google {
          client_id: "gid"
          client_secret: "gsecret"
        }
      }
    `);
    const code = result.server || result.servers?.default || '';
    // Find the callback handler (second occurrence - the actual handler, not the redirect_uri)
    const marker = '__addRoute("GET", "/auth/oauth/google/callback"';
    const callbackIdx = code.indexOf(marker);
    expect(callbackIdx).toBeGreaterThan(-1);
    const callbackSection = code.substring(callbackIdx, callbackIdx + 4000);
    // Cookie mode: redirect should be "/" not "/?token="
    expect(callbackSection).not.toContain('?token=');
    // Should set the cookie instead
    expect(callbackSection).toContain('Set-Cookie');
    expect(callbackSection).toContain('__tova_auth=');
  });

  test('local storage OAuth callback includes token in URL', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        storage: "local"
        provider google {
          client_id: "gid"
          client_secret: "gsecret"
        }
      }
    `);
    const code = result.server || result.servers?.default || '';
    // Find the callback handler
    const marker = '__addRoute("GET", "/auth/oauth/google/callback"';
    const callbackIdx = code.indexOf(marker);
    expect(callbackIdx).toBeGreaterThan(-1);
    const callbackSection = code.substring(callbackIdx, callbackIdx + 4000);
    // Local storage mode: redirect should include "/?token=" for SPA to read
    expect(callbackSection).toContain('?token=');
  });

  test('discord oauth uses correct URLs', () => {
    const result = compile(`
      server {
        get "/hello" fn(req) { "hello" }
      }
      auth {
        provider discord {
          client_id: "disc-id"
          client_secret: "disc-secret"
        }
      }
    `);
    const code = result.server || result.servers?.default || '';
    expect(code).toContain('/auth/oauth/discord');
    expect(code).toContain('discord.com/oauth2/authorize');
    expect(code).toContain('discord.com/api/oauth2/token');
    expect(code).toContain('discord.com/api/users/@me');
  });
});

// ═══════════════════════════════════════════════════════════════
// Auth Codegen — Browser Code Generation
// ═══════════════════════════════════════════════════════════════
describe('auth block - browser codegen', () => {
  test('generates $currentUser signal', () => {
    const result = compile(`
      auth { provider email {} }
      server {}
      browser {}
    `);
    const browser = result.browser || result.browsers?.default || '';
    expect(browser).toContain('$currentUser');
    expect(browser).toContain('createSignal');
  });

  test('generates $isAuthenticated signal', () => {
    const result = compile(`
      auth { provider email {} }
      server {}
      browser {}
    `);
    const browser = result.browser || result.browsers?.default || '';
    expect(browser).toContain('$isAuthenticated');
  });

  test('generates $authLoading signal', () => {
    const result = compile(`
      auth { provider email {} }
      server {}
      browser {}
    `);
    const browser = result.browser || result.browsers?.default || '';
    expect(browser).toContain('$authLoading');
  });

  test('generates logout function', () => {
    const result = compile(`
      auth { provider email {} }
      server {}
      browser {}
    `);
    const browser = result.browser || result.browsers?.default || '';
    expect(browser).toContain('logout');
  });

  test('generates LoginForm component', () => {
    const result = compile(`
      auth { provider email {} }
      server {}
      browser {}
    `);
    const browser = result.browser || result.browsers?.default || '';
    expect(browser).toContain('LoginForm');
  });

  test('generates SignupForm component', () => {
    const result = compile(`
      auth { provider email {} }
      server {}
      browser {}
    `);
    const browser = result.browser || result.browsers?.default || '';
    expect(browser).toContain('SignupForm');
  });

  test('generates AuthGuard component', () => {
    const result = compile(`
      auth { provider email {} }
      server {}
      browser {}
    `);
    const browser = result.browser || result.browsers?.default || '';
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
    const browser = result.browser || result.browsers?.default || '';
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
    const browser = result.browser || result.browsers?.default || '';
    expect(browser).toContain('/dashboard');
    expect(browser).toContain('/login');
    expect(browser).toContain('__auth_route_guard');
  });

  test('generates cross-tab sync', () => {
    const result = compile(`
      auth { provider email {} }
      server {}
      browser {}
    `);
    const browser = result.browser || result.browsers?.default || '';
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
    const browser = result.browser || result.browsers?.default || '';
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
    const browser = result.browser || result.browsers?.default || '';
    expect(browser).toContain('ForgotPasswordForm');
    expect(browser).toContain('ResetPasswordForm');
  });
});

// ═══════════════════════════════════════════════════════════════
// Auth Block — Integration Tests
// ═══════════════════════════════════════════════════════════════
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
    const server = result.server || result.servers?.default || '';
    const browser = result.browser || result.browsers?.default || '';
    expect(server).toContain('/auth/signup');
    expect(browser).toContain('$currentUser');
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
        provider discord { client_id: "d", client_secret: "ds" }
      }
      server {}
    `);
    const server = result.server || result.servers?.default || '';
    expect(server).toContain('/auth/oauth/google');
    expect(server).toContain('/auth/oauth/github');
    expect(server).toContain('/auth/oauth/discord');
  });

  test('email + magic_link providers together', () => {
    const result = compile(`
      auth {
        provider email { confirm_email: true }
        provider magic_link { expires: 600 }
      }
      server {}
    `);
    const server = result.server || result.servers?.default || '';
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
    const server = result.server || result.servers?.default || '';
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
    const server = result.server || result.servers?.default || '';
    expect(server).toContain('__auth_hook_signup');
    expect(server).toContain('__auth_hook_login');
    expect(server).toContain('__auth_hook_logout');
    expect(server).toContain('__auth_hook_oauth_link');
  });

  test('analyzer: cross-block role validation warns on unknown role', () => {
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

  test('full stack: auth + security + server + browser', () => {
    const result = compile(`
      security {
        role Admin { can: [manage_users, view_analytics] }
      }
      auth {
        secret: env("AUTH_SECRET")
        token_expires: 900
        storage: "cookie"
        provider email { confirm_email: true, password_min: 10 }
        provider google { client_id: env("G_ID"), client_secret: env("G_SECRET"), scopes: ["email", "profile"] }
        provider magic_link { expires: 600 }
        on signup fn(user) { print(user.email) }
        on login fn(user) { print("login") }
        protected_route "/dashboard" { redirect: "/login" }
        protected_route "/admin/*" { require: Admin, redirect: "/unauthorized" }
      }
      server {
        fn hello() -> String { "world" }
        route GET "/hello" => hello
      }
      browser {
        component App {
          <div>"Hello"</div>
        }
      }
    `);
    const server = result.server || result.servers?.default || '';
    const browser = result.browser || result.browsers?.default || '';
    // Server has auth endpoints + user route
    expect(server).toContain('/auth/signup');
    expect(server).toContain('/auth/login');
    expect(server).toContain('/auth/oauth/google');
    expect(server).toContain('/auth/magic-link');
    expect(server).toContain('/hello');
    // Browser has auth components + user component
    expect(browser).toContain('$currentUser');
    expect(browser).toContain('LoginForm');
    expect(browser).toContain('__auth_route_guard');
    expect(browser).toContain('App');
  });
});

// ═══════════════════════════════════════════════════════════════
// Auth Block — $ Signal Convention
// ═══════════════════════════════════════════════════════════════
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
            <p>{$currentUser}</p>
            <p>{$isAuthenticated}</p>
          </div>
        }
      }
    `);
    const browser = result.browser || result.browsers?.default || '';
    // $currentUser and $isAuthenticated should be called as signal reads
    expect(browser).toContain('$currentUser()');
    expect(browser).toContain('$isAuthenticated()');
  });
});
