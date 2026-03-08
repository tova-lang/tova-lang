import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

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
