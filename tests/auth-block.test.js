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
