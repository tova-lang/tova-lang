import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function parse(source) {
  const lexer = new Lexer(source, 'test.tova');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, 'test.tova');
  return parser.parse();
}

function compile(source) {
  const ast = parse(source);
  const gen = new CodeGenerator(ast, 'test.tova');
  return gen.generate();
}

function analyze(source) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, 'test.tova', { tolerant: true });
  return analyzer.analyze();
}

// ════════════════════════════════════════════════════════════
// Parsing tests
// ════════════════════════════════════════════════════════════

describe('Security block parsing', () => {
  test('empty security block', () => {
    const ast = parse(`security { }`);
    expect(ast.body[0].type).toBe('SecurityBlock');
    expect(ast.body[0].body).toEqual([]);
  });

  test('auth jwt declaration', () => {
    const ast = parse(`security {
      auth jwt {
        secret: env("JWT_SECRET")
        expires: 86400
      }
    }`);
    const block = ast.body[0];
    expect(block.type).toBe('SecurityBlock');
    const auth = block.body[0];
    expect(auth.type).toBe('SecurityAuthDeclaration');
    expect(auth.authType).toBe('jwt');
    expect(auth.config.secret).toBeDefined();
    expect(auth.config.expires).toBeDefined();
  });

  test('auth api_key declaration', () => {
    const ast = parse(`security {
      auth api_key {
        header: "X-API-Key"
      }
    }`);
    const auth = ast.body[0].body[0];
    expect(auth.type).toBe('SecurityAuthDeclaration');
    expect(auth.authType).toBe('api_key');
    expect(auth.config.header).toBeDefined();
  });

  test('role declaration', () => {
    const ast = parse(`security {
      role Admin {
        can: [manage_users, view_analytics]
      }
    }`);
    const role = ast.body[0].body[0];
    expect(role.type).toBe('SecurityRoleDeclaration');
    expect(role.name).toBe('Admin');
    expect(role.permissions).toEqual(['manage_users', 'view_analytics']);
  });

  test('multiple roles', () => {
    const ast = parse(`security {
      role Admin {
        can: [manage_users, view_analytics]
      }
      role User {
        can: [view_profile, edit_profile]
      }
    }`);
    const block = ast.body[0];
    expect(block.body.length).toBe(2);
    expect(block.body[0].name).toBe('Admin');
    expect(block.body[1].name).toBe('User');
    expect(block.body[1].permissions).toEqual(['view_profile', 'edit_profile']);
  });

  test('protect declaration', () => {
    const ast = parse(`security {
      protect "/api/admin/*" {
        require: Admin
      }
    }`);
    const protect = ast.body[0].body[0];
    expect(protect.type).toBe('SecurityProtectDeclaration');
    expect(protect.pattern).toBe('/api/admin/*');
    expect(protect.config.require.name).toBe('Admin');
  });

  test('protect with rate_limit', () => {
    const ast = parse(`security {
      protect "/api/admin/*" {
        require: Admin
        rate_limit: {
          max: 100
          window: 60
        }
      }
    }`);
    const protect = ast.body[0].body[0];
    expect(protect.config.rate_limit).toBeDefined();
    expect(protect.config.rate_limit.max.value).toBe(100);
    expect(protect.config.rate_limit.window.value).toBe(60);
  });

  test('protect with authenticated', () => {
    const ast = parse(`security {
      protect "/api/*" {
        require: authenticated
      }
    }`);
    const protect = ast.body[0].body[0];
    expect(protect.config.require.name).toBe('authenticated');
  });

  test('sensitive declaration', () => {
    const ast = parse(`security {
      sensitive User.password {
        hash: "bcrypt"
        never_expose: true
      }
    }`);
    const sensitive = ast.body[0].body[0];
    expect(sensitive.type).toBe('SecuritySensitiveDeclaration');
    expect(sensitive.typeName).toBe('User');
    expect(sensitive.fieldName).toBe('password');
    expect(sensitive.config.hash).toBeDefined();
    expect(sensitive.config.never_expose).toBeDefined();
  });

  test('sensitive with visible_to', () => {
    const ast = parse(`security {
      sensitive User.email {
        visible_to: [Admin, "self"]
      }
    }`);
    const sensitive = ast.body[0].body[0];
    expect(sensitive.typeName).toBe('User');
    expect(sensitive.fieldName).toBe('email');
    expect(sensitive.config.visible_to).toBeDefined();
  });

  test('cors declaration', () => {
    const ast = parse(`security {
      cors {
        origins: ["https://myapp.com"]
        methods: [GET, POST, PUT, DELETE]
        credentials: true
      }
    }`);
    const cors = ast.body[0].body[0];
    expect(cors.type).toBe('SecurityCorsDeclaration');
    expect(cors.config.origins).toBeDefined();
    expect(cors.config.credentials).toBeDefined();
  });

  test('csp declaration', () => {
    const ast = parse(`security {
      csp {
        default_src: ["self"]
        script_src: ["self"]
      }
    }`);
    const csp = ast.body[0].body[0];
    expect(csp.type).toBe('SecurityCspDeclaration');
    expect(csp.config.default_src).toBeDefined();
    expect(csp.config.script_src).toBeDefined();
  });

  test('rate_limit declaration', () => {
    const ast = parse(`security {
      rate_limit {
        max: 1000
        window: 3600
      }
    }`);
    const rl = ast.body[0].body[0];
    expect(rl.type).toBe('SecurityRateLimitDeclaration');
    expect(rl.config.max.value).toBe(1000);
    expect(rl.config.window.value).toBe(3600);
  });

  test('csrf declaration', () => {
    const ast = parse(`security {
      csrf {
        enabled: true
        exempt: ["/api/webhooks/*"]
      }
    }`);
    const csrf = ast.body[0].body[0];
    expect(csrf.type).toBe('SecurityCsrfDeclaration');
    expect(csrf.config.enabled).toBeDefined();
    expect(csrf.config.exempt).toBeDefined();
  });

  test('audit declaration', () => {
    const ast = parse(`security {
      audit {
        events: [login, logout, manage_users]
        store: "audit_log"
        retain: 90
      }
    }`);
    const audit = ast.body[0].body[0];
    expect(audit.type).toBe('SecurityAuditDeclaration');
    expect(audit.config.events).toBeDefined();
    expect(audit.config.store).toBeDefined();
    expect(audit.config.retain.value).toBe(90);
  });

  test('full security block with all sections', () => {
    const ast = parse(`security {
      auth jwt {
        secret: env("JWT_SECRET")
        expires: 86400
      }
      role Admin {
        can: [manage_users]
      }
      role User {
        can: [view_profile]
      }
      protect "/api/admin/*" {
        require: Admin
      }
      protect "/api/*" {
        require: authenticated
      }
      sensitive User.password {
        never_expose: true
      }
      cors {
        origins: ["https://myapp.com"]
      }
      csp {
        default_src: ["self"]
      }
      rate_limit {
        max: 1000
        window: 3600
      }
      csrf {
        enabled: true
      }
      audit {
        events: [login, logout]
        store: "audit_log"
        retain: 90
      }
    }`);
    const block = ast.body[0];
    expect(block.type).toBe('SecurityBlock');
    expect(block.body.length).toBe(11);
  });
});

// ════════════════════════════════════════════════════════════
// Codegen tests
// ════════════════════════════════════════════════════════════

describe('Security block codegen', () => {
  test('auth generates JWT verification', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "my-secret"
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    expect(result.server).toContain('__authenticate');
    expect(result.server).toContain('__authSecret');
  });

  test('roles generate role definitions', () => {
    const result = compile(`
      security {
        role Admin {
          can: [manage_users, view_analytics]
        }
        role User {
          can: [view_profile]
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    expect(result.server).toContain('__securityRoles');
    expect(result.server).toContain('"Admin"');
    expect(result.server).toContain('"manage_users"');
    expect(result.server).toContain('__hasRole');
    expect(result.server).toContain('__hasPermission');
  });

  test('protect generates route protection', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "test-secret"
        }
        role Admin {
          can: [manage_users]
        }
        protect "/api/admin/*" {
          require: Admin
        }
      }
      server {
        GET "/api/admin/users" fn(req) {
          "users"
        }
      }
    `);
    expect(result.server).toContain('__protectRules');
    expect(result.server).toContain('__checkProtection');
    expect(result.server).toContain('/api/admin/');
  });

  test('cors generates CORS config', () => {
    const result = compile(`
      security {
        cors {
          origins: ["https://myapp.com"]
          credentials: true
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    expect(result.server).toContain('__corsOrigins');
    expect(result.server).toContain('__getCorsHeaders');
  });

  test('csp generates Content-Security-Policy header', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "test"
        }
        csp {
          default_src: ["self"]
          script_src: ["self"]
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    expect(result.server).toContain('__getCspHeader');
    expect(result.server).toContain('Content-Security-Policy');
  });

  test('rate_limit generates rate limiting', () => {
    const result = compile(`
      security {
        rate_limit {
          max: 1000
          window: 3600
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    expect(result.server).toContain('__rateLimitMax');
    expect(result.server).toContain('__rateLimitWindow');
    expect(result.server).toContain('__checkRateLimit');
  });

  test('sensitive generates sanitization functions', () => {
    const result = compile(`
      security {
        sensitive User.password {
          never_expose: true
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    expect(result.server).toContain('__sanitizeUser');
    expect(result.server).toContain('delete result.password');
  });

  test('audit generates audit logging', () => {
    const result = compile(`
      security {
        audit {
          events: [login, logout]
          store: "audit_log"
          retain: 90
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    expect(result.server).toContain('__auditLog');
    expect(result.server).toContain('__auditStore');
    expect(result.server).toContain('"audit_log"');
    expect(result.server).toContain('__auditRetainDays');
  });

  test('protect with rate_limit generates per-route rate limiting', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "test-secret"
        }
        role Admin {
          can: [manage_users]
        }
        protect "/api/admin/*" {
          require: Admin
          rate_limit: {
            max: 100
            window: 60
          }
        }
      }
      server {
        GET "/api/admin/users" fn(req) {
          "users"
        }
      }
    `);
    expect(result.server).toContain('__checkRateLimit');
    expect(result.server).toContain('__protectRules');
    expect(result.server).toContain('rateLimit');
  });
});

// ════════════════════════════════════════════════════════════
// Client codegen tests
// ════════════════════════════════════════════════════════════

describe('Security block client codegen', () => {
  test('auth generates token helpers on client', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "my-secret"
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
      client {
        state greeting = "hello"
      }
    `);
    expect(result.client).toContain('getAuthToken');
    expect(result.client).toContain('setAuthToken');
    expect(result.client).toContain('clearAuthToken');
    expect(result.client).toContain('addRPCInterceptor');
  });

  test('roles generate can() helper on client', () => {
    const result = compile(`
      security {
        role Admin {
          can: [manage_users, view_analytics]
        }
        role User {
          can: [view_profile]
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
      client {
        state greeting = "hello"
      }
    `);
    expect(result.client).toContain('can(');
    expect(result.client).toContain('setUserRole');
    expect(result.client).toContain('getUserRole');
    expect(result.client).toContain('__clientRoles');
  });
});

// ════════════════════════════════════════════════════════════
// Integration tests
// ════════════════════════════════════════════════════════════

describe('Security block integration', () => {
  test('security + server produces protected routes', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "test-secret"
        }
        role Admin {
          can: [manage_users]
        }
        protect "/api/*" {
          require: authenticated
        }
      }
      server {
        GET "/api/users" fn(req) {
          "users list"
        }
        GET "/public/health" fn(req) {
          "ok"
        }
      }
    `);
    // Server should have auth, roles, and protection
    expect(result.server).toContain('__authenticate');
    expect(result.server).toContain('__securityRoles');
    expect(result.server).toContain('__checkProtection');
    expect(result.server).toContain('__protectRules');
  });

  test('security block does not break module mode', () => {
    const result = compile(`
      x = 42
      fn add(a, b) { a + b }
    `);
    expect(result.isModule).toBe(true);
    expect(result.shared).toContain('42');
  });

  test('backward compat: inline auth still works without security block', () => {
    const result = compile(`
      server {
        auth {
          secret: "inline-secret"
        }
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    expect(result.server).toContain('__authenticate');
    expect(result.server).toContain('__authSecret');
  });

  test('security block cors overrides (when no inline cors)', () => {
    const result = compile(`
      security {
        cors {
          origins: ["https://example.com"]
          credentials: true
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    expect(result.server).toContain('__corsOrigins');
    expect(result.server).toContain('__corsCredentials');
  });
});

// ════════════════════════════════════════════════════════════
// Analyzer tests
// ════════════════════════════════════════════════════════════

describe('Security block analyzer', () => {
  test('warns on undefined role in protect', () => {
    const { warnings } = analyze(`
      security {
        protect "/api/admin/*" {
          require: SuperAdmin
        }
      }
      server {
        GET "/api/admin/test" fn(req) {
          "test"
        }
      }
    `);
    const roleWarning = warnings.find(w => w.code === 'W_UNDEFINED_ROLE');
    expect(roleWarning).toBeDefined();
    expect(roleWarning.message).toContain('SuperAdmin');
  });

  test('no warning when role is defined', () => {
    const { warnings } = analyze(`
      security {
        role Admin {
          can: [manage_users]
        }
        protect "/api/admin/*" {
          require: Admin
        }
      }
      server {
        GET "/api/admin/test" fn(req) {
          "test"
        }
      }
    `);
    const roleWarning = warnings.find(w => w.code === 'W_UNDEFINED_ROLE');
    expect(roleWarning).toBeUndefined();
  });

  test('warns on duplicate role definition', () => {
    const { warnings } = analyze(`
      security {
        role Admin {
          can: [manage_users]
        }
        role Admin {
          can: [view_analytics]
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    const dupWarning = warnings.find(w => w.code === 'W_DUPLICATE_ROLE');
    expect(dupWarning).toBeDefined();
    expect(dupWarning.message).toContain('Admin');
  });

  test('no warning for authenticated in protect', () => {
    const { warnings } = analyze(`
      security {
        protect "/api/*" {
          require: authenticated
        }
      }
      server {
        GET "/api/test" fn(req) {
          "test"
        }
      }
    `);
    const roleWarning = warnings.find(w => w.code === 'W_UNDEFINED_ROLE');
    expect(roleWarning).toBeUndefined();
  });

  test('security block does not cause analyzer errors', () => {
    const result = analyze(`
      security {
        auth jwt {
          secret: "test"
        }
        role Admin {
          can: [manage_users]
        }
        cors {
          origins: ["https://myapp.com"]
        }
        rate_limit {
          max: 1000
          window: 3600
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    // If tolerant mode returns errors, they should be zero; otherwise no errors field means success
    const errors = result.errors || [];
    expect(errors.length).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════
// Additional parsing tests — edge cases & coverage
// ════════════════════════════════════════════════════════════

describe('Security block parsing — edge cases', () => {
  test('auth without explicit type defaults to jwt', () => {
    const ast = parse(`security {
      auth {
        secret: "my-secret"
      }
    }`);
    const auth = ast.body[0].body[0];
    expect(auth.type).toBe('SecurityAuthDeclaration');
    expect(auth.authType).toBe('jwt');
    expect(auth.config.secret).toBeDefined();
  });

  test('config key that is a keyword: store in audit', () => {
    const ast = parse(`security {
      audit {
        store: "my_audit_table"
      }
    }`);
    const audit = ast.body[0].body[0];
    expect(audit.type).toBe('SecurityAuditDeclaration');
    expect(audit.config.store).toBeDefined();
    expect(audit.config.store.value).toBe('my_audit_table');
  });

  test('comma-separated config values', () => {
    const ast = parse(`security {
      rate_limit {
        max: 500,
        window: 120,
      }
    }`);
    const rl = ast.body[0].body[0];
    expect(rl.config.max.value).toBe(500);
    expect(rl.config.window.value).toBe(120);
  });

  test('multiple sensitive fields on the same type', () => {
    const ast = parse(`security {
      sensitive User.password {
        hash: "bcrypt"
        never_expose: true
      }
      sensitive User.email {
        visible_to: [Admin, "self"]
      }
      sensitive User.ssn {
        never_expose: true
      }
    }`);
    const block = ast.body[0];
    expect(block.body.length).toBe(3);
    expect(block.body[0].typeName).toBe('User');
    expect(block.body[0].fieldName).toBe('password');
    expect(block.body[1].typeName).toBe('User');
    expect(block.body[1].fieldName).toBe('email');
    expect(block.body[2].typeName).toBe('User');
    expect(block.body[2].fieldName).toBe('ssn');
  });

  test('sensitive fields on different types', () => {
    const ast = parse(`security {
      sensitive User.password {
        never_expose: true
      }
      sensitive Account.secret_key {
        never_expose: true
      }
    }`);
    const block = ast.body[0];
    expect(block.body[0].typeName).toBe('User');
    expect(block.body[1].typeName).toBe('Account');
  });

  test('multiple protect rules with different patterns', () => {
    const ast = parse(`security {
      protect "/api/admin/*" {
        require: Admin
      }
      protect "/api/users/*" {
        require: authenticated
      }
      protect "/api/billing/*" {
        require: BillingAdmin
        rate_limit: { max: 50, window: 30 }
      }
    }`);
    const block = ast.body[0];
    expect(block.body.length).toBe(3);
    expect(block.body[0].pattern).toBe('/api/admin/*');
    expect(block.body[1].pattern).toBe('/api/users/*');
    expect(block.body[2].pattern).toBe('/api/billing/*');
    expect(block.body[2].config.rate_limit.max.value).toBe(50);
  });

  test('role with single permission', () => {
    const ast = parse(`security {
      role Viewer {
        can: [view_only]
      }
    }`);
    const role = ast.body[0].body[0];
    expect(role.permissions).toEqual(['view_only']);
  });

  test('role with many permissions', () => {
    const ast = parse(`security {
      role SuperAdmin {
        can: [read, write, delete, manage, audit, configure]
      }
    }`);
    const role = ast.body[0].body[0];
    expect(role.permissions.length).toBe(6);
    expect(role.permissions).toContain('read');
    expect(role.permissions).toContain('configure');
  });

  test('csp with many directives', () => {
    const ast = parse(`security {
      csp {
        default_src: ["self"]
        script_src: ["self", "https://cdn.example.com"]
        style_src: ["self", "unsafe-inline"]
        img_src: ["self", "data:"]
        font_src: ["self"]
        connect_src: ["self", "https://api.example.com"]
      }
    }`);
    const csp = ast.body[0].body[0];
    expect(Object.keys(csp.config).length).toBe(6);
    expect(csp.config.style_src).toBeDefined();
    expect(csp.config.font_src).toBeDefined();
    expect(csp.config.connect_src).toBeDefined();
  });

  test('cors with all fields', () => {
    const ast = parse(`security {
      cors {
        origins: ["https://a.com", "https://b.com"]
        methods: [GET, POST, PUT, DELETE, PATCH]
        headers: ["Content-Type", "Authorization", "X-Custom"]
        credentials: true
        max_age: 7200
      }
    }`);
    const cors = ast.body[0].body[0];
    expect(cors.config.origins).toBeDefined();
    expect(cors.config.methods).toBeDefined();
    expect(cors.config.headers).toBeDefined();
    expect(cors.config.credentials).toBeDefined();
    expect(cors.config.max_age).toBeDefined();
  });

  test('protect with only require (no rate_limit)', () => {
    const ast = parse(`security {
      protect "/api/*" {
        require: authenticated
      }
    }`);
    const protect = ast.body[0].body[0];
    expect(protect.config.require.name).toBe('authenticated');
    expect(protect.config.rate_limit).toBeUndefined();
  });

  test('AST nodes have loc property', () => {
    const ast = parse(`security {
      auth jwt {
        secret: "s"
      }
      role Admin {
        can: [a]
      }
    }`);
    const block = ast.body[0];
    expect(block.loc).toBeDefined();
    expect(block.loc.line).toBeDefined();
    expect(block.body[0].loc).toBeDefined();
    expect(block.body[1].loc).toBeDefined();
  });

  test('error recovery: invalid statement in security block', () => {
    // Should parse what it can and collect errors
    expect(() => parse(`security {
      unknown_thing
    }`)).toThrow();
  });

  test('csrf with only enabled', () => {
    const ast = parse(`security {
      csrf {
        enabled: false
      }
    }`);
    const csrf = ast.body[0].body[0];
    expect(csrf.type).toBe('SecurityCsrfDeclaration');
    expect(csrf.config.enabled.value).toBe(false);
  });

  test('audit with only store', () => {
    const ast = parse(`security {
      audit {
        store: "logs"
      }
    }`);
    const audit = ast.body[0].body[0];
    expect(audit.config.store.value).toBe('logs');
    expect(audit.config.events).toBeUndefined();
    expect(audit.config.retain).toBeUndefined();
  });

  test('auth with env() call for secret', () => {
    const ast = parse(`security {
      auth jwt {
        secret: env("MY_JWT_SECRET")
        expires: 3600
      }
    }`);
    const auth = ast.body[0].body[0];
    expect(auth.config.secret.type).toBe('CallExpression');
    expect(auth.config.secret.callee.name).toBe('env');
    expect(auth.config.expires.value).toBe(3600);
  });
});

// ════════════════════════════════════════════════════════════
// Additional codegen tests — coverage
// ════════════════════════════════════════════════════════════

describe('Security block codegen — additional coverage', () => {
  test('auth api_key via security block generates API key verification', () => {
    const result = compile(`
      security {
        auth api_key {
          header: "X-API-Key"
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    expect(result.server).toContain('__apiKeyHeader');
    expect(result.server).toContain('__authenticate');
  });

  test('sensitive with visible_to generates role-based filtering', () => {
    const result = compile(`
      security {
        role Admin {
          can: [view_all]
        }
        sensitive User.email {
          visible_to: [Admin, "self"]
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    expect(result.server).toContain('__sanitizeUser');
    expect(result.server).toContain('__visibleTo');
    expect(result.server).toContain('__canSee');
    expect(result.server).toContain('__hasRole');
  });

  test('multiple sensitive fields on same type grouped into one function', () => {
    const result = compile(`
      security {
        sensitive User.password {
          never_expose: true
        }
        sensitive User.ssn {
          never_expose: true
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    // Should produce one __sanitizeUser function that handles both fields
    expect(result.server).toContain('__sanitizeUser');
    expect(result.server).toContain('delete result.password');
    expect(result.server).toContain('delete result.ssn');
  });

  test('sensitive fields on different types produce separate functions', () => {
    const result = compile(`
      security {
        sensitive User.password {
          never_expose: true
        }
        sensitive Account.secret_key {
          never_expose: true
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    expect(result.server).toContain('__sanitizeUser');
    expect(result.server).toContain('__sanitizeAccount');
    expect(result.server).toContain('delete result.password');
    expect(result.server).toContain('delete result.secret_key');
  });

  test('csp with multiple directives converts underscores to hyphens', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        csp {
          default_src: ["self"]
          script_src: ["self"]
          style_src: ["self", "unsafe-inline"]
          img_src: ["self", "data:"]
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    expect(result.server).toContain('__getCspHeader');
    expect(result.server).toContain('default-src');
    expect(result.server).toContain('script-src');
    expect(result.server).toContain('style-src');
    expect(result.server).toContain('img-src');
    // Check special value quoting
    expect(result.server).toContain("'self'");
    expect(result.server).toContain("'unsafe-inline'");
  });

  test('protect without auth generates __secUser = null', () => {
    const result = compile(`
      security {
        role Admin {
          can: [manage]
        }
        protect "/api/*" {
          require: Admin
        }
      }
      server {
        GET "/api/test" fn(req) {
          "test"
        }
      }
    `);
    expect(result.server).toContain('__secUser = null');
    expect(result.server).toContain('__checkProtection');
  });

  test('protect with auth generates __secUser from __authenticate', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "secret"
        }
        role Admin {
          can: [manage]
        }
        protect "/api/*" {
          require: Admin
        }
      }
      server {
        GET "/api/test" fn(req) {
          "test"
        }
      }
    `);
    expect(result.server).toContain('__secUser = await __authenticate');
    expect(result.server).toContain('__checkProtection');
  });

  test('protect generates 401 for unauthenticated and 403 for wrong role', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        role Admin { can: [manage] }
        protect "/api/*" { require: Admin }
      }
      server {
        GET "/api/test" fn(req) { "test" }
      }
    `);
    expect(result.server).toContain('__secUser ? 403 : 401');
    expect(result.server).toContain('"FORBIDDEN"');
    expect(result.server).toContain('"AUTH_REQUIRED"');
  });

  test('audit without events defaults to empty array', () => {
    const result = compile(`
      security {
        audit {
          store: "logs"
        }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    expect(result.server).toContain('__auditEvents = []');
    expect(result.server).toContain('__auditStore');
  });

  test('audit without store defaults to "audit_log"', () => {
    const result = compile(`
      security {
        audit {
          retain: 30
        }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    expect(result.server).toContain('"audit_log"');
    expect(result.server).toContain('__auditRetainDays');
  });

  test('audit without retain defaults to 90', () => {
    const result = compile(`
      security {
        audit {
          events: [login]
          store: "my_audit"
        }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    expect(result.server).toContain('__auditRetainDays = 90');
  });

  test('rate_limit values propagated correctly', () => {
    const result = compile(`
      security {
        rate_limit {
          max: 500
          window: 120
        }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    expect(result.server).toContain('__rateLimitMax = 500');
    expect(result.server).toContain('__rateLimitWindow = 120');
  });

  test('protect rule rate_limit triggers rate limit store creation', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        role Admin { can: [manage] }
        protect "/admin/*" {
          require: Admin
          rate_limit: { max: 10, window: 60 }
        }
      }
      server {
        GET "/admin/users" fn(req) { "users" }
      }
    `);
    expect(result.server).toContain('__rateLimitStore');
    expect(result.server).toContain('__checkRateLimit');
    expect(result.server).toContain('protect:');
  });

  test('roles codegen generates correct permission strings', () => {
    const result = compile(`
      security {
        role Editor {
          can: [create_post, edit_post, delete_post]
        }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    expect(result.server).toContain('"create_post"');
    expect(result.server).toContain('"edit_post"');
    expect(result.server).toContain('"delete_post"');
    expect(result.server).toContain('"Editor"');
  });

  test('multiple protect rules generate multiple regex patterns', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        protect "/api/v1/*" { require: authenticated }
        protect "/api/v2/*" { require: authenticated }
        protect "/internal/*" { require: Admin }
      }
      server {
        GET "/api/v1/users" fn(req) { "users" }
      }
    `);
    // Regex escapes / to \/, so check for the escaped patterns
    expect(result.server).toContain('\\/api\\/v1\\/');
    expect(result.server).toContain('\\/api\\/v2\\/');
    expect(result.server).toContain('\\/internal\\/');
  });

  test('auth secret from env() call in security block', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: env("MY_SECRET")
        }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    expect(result.server).toContain('__authSecret');
  });
});

// ════════════════════════════════════════════════════════════
// Additional client codegen tests
// ════════════════════════════════════════════════════════════

describe('Security block client codegen — additional', () => {
  test('auth + roles together on client', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        role Admin { can: [manage] }
        role User { can: [view] }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
      client {
        state x = 1
      }
    `);
    expect(result.client).toContain('getAuthToken');
    expect(result.client).toContain('setAuthToken');
    expect(result.client).toContain('clearAuthToken');
    expect(result.client).toContain('addRPCInterceptor');
    expect(result.client).toContain('can(');
    expect(result.client).toContain('setUserRole');
    expect(result.client).toContain('__clientRoles');
    expect(result.client).toContain('"Admin"');
    expect(result.client).toContain('"User"');
  });

  test('only roles (no auth) on client — no auth helpers', () => {
    const result = compile(`
      security {
        role Admin { can: [manage] }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
      client {
        state x = 1
      }
    `);
    expect(result.client).not.toContain('getAuthToken');
    expect(result.client).not.toContain('setAuthToken');
    expect(result.client).toContain('can(');
    expect(result.client).toContain('setUserRole');
  });

  test('only auth (no roles) on client — no can() helper', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
      client {
        state x = 1
      }
    `);
    expect(result.client).toContain('getAuthToken');
    expect(result.client).toContain('clearAuthToken');
    expect(result.client).not.toContain('can(');
    expect(result.client).not.toContain('setUserRole');
  });

  test('client role permissions match server definitions', () => {
    const result = compile(`
      security {
        role Admin { can: [manage_users, view_reports] }
        role User { can: [view_profile] }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
      client {
        state x = 1
      }
    `);
    expect(result.client).toContain('"manage_users"');
    expect(result.client).toContain('"view_reports"');
    expect(result.client).toContain('"view_profile"');
  });

  test('no security block — no security code on client', () => {
    const result = compile(`
      server {
        GET "/hello" fn(req) { "hello" }
      }
      client {
        state x = 1
      }
    `);
    expect(result.client).not.toContain('getAuthToken');
    expect(result.client).not.toContain('can(');
    expect(result.client).not.toContain('__clientRoles');
  });
});

// ════════════════════════════════════════════════════════════
// Additional integration tests
// ════════════════════════════════════════════════════════════

describe('Security block integration — additional', () => {
  test('inline auth takes precedence over security block auth', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "security-block-secret"
        }
      }
      server {
        auth {
          secret: "inline-secret"
        }
        GET "/hello" fn(req) { "hello" }
      }
    `);
    // Inline auth should be used (it's collected first, then security doesn't override)
    expect(result.server).toContain('__authSecret');
    expect(result.server).toContain('"inline-secret"');
  });

  test('inline cors takes precedence over security block cors', () => {
    const result = compile(`
      security {
        cors {
          origins: ["https://security-block.com"]
        }
      }
      server {
        cors {
          origins: ["https://inline.com"]
          credentials: true
        }
        GET "/hello" fn(req) { "hello" }
      }
    `);
    // Inline cors is used
    expect(result.server).toContain('https://inline.com');
  });

  test('inline rate_limit takes precedence over security block', () => {
    const result = compile(`
      security {
        rate_limit {
          max: 9999
          window: 9999
        }
      }
      server {
        rate_limit {
          max: 100
          window: 60
        }
        GET "/hello" fn(req) { "hello" }
      }
    `);
    expect(result.server).toContain('__rateLimitMax = 100');
    expect(result.server).toContain('__rateLimitWindow = 60');
  });

  test('security + server + client all together', () => {
    const result = compile(`
      shared {
        type User {
          id: Int
          name: String
          email: String
        }
      }
      security {
        auth jwt { secret: "test" }
        role Admin { can: [manage] }
        protect "/api/*" { require: authenticated }
        cors { origins: ["https://myapp.com"] }
      }
      server {
        GET "/api/users" fn(req) { "users" }
      }
      client {
        state greeting = "hello"
      }
    `);
    expect(result.shared).toContain('User');
    expect(result.server).toContain('__authenticate');
    expect(result.server).toContain('__securityRoles');
    expect(result.server).toContain('__checkProtection');
    expect(result.server).toContain('__corsOrigins');
    expect(result.client).toContain('getAuthToken');
    expect(result.client).toContain('can(');
  });

  test('multiple security blocks are merged', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
      }
      security {
        role Admin { can: [manage] }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
      client {
        state x = 1
      }
    `);
    // Both should be present
    expect(result.server).toContain('__authenticate');
    expect(result.server).toContain('__securityRoles');
    expect(result.client).toContain('getAuthToken');
    expect(result.client).toContain('can(');
  });

  test('security block alone with no server/client does not crash', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        role Admin { can: [manage] }
      }
    `);
    // Module mode since no blocks besides security
    // Security block is counted as a block so it prevents module mode,
    // but no server/client output is generated
    expect(result.server).toBe('');
    expect(result.client).toBe('');
  });

  test('security block with only server (no client) — no client crash', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        role Admin { can: [manage] }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    expect(result.server).toContain('__authenticate');
    expect(result.server).toContain('__securityRoles');
    expect(result.client).toBe('');
  });

  test('security cors without inline cors uses security config', () => {
    const result = compile(`
      security {
        cors {
          origins: ["https://example.com"]
          methods: [GET, POST]
        }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    expect(result.server).toContain('__corsOrigins');
    // The origins array should contain the configured origin, not a wildcard default
    expect(result.server).toContain('"https://example.com"');
  });

  test('security rate_limit without inline rate_limit uses security config', () => {
    const result = compile(`
      security {
        rate_limit {
          max: 2000
          window: 7200
        }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    expect(result.server).toContain('__rateLimitMax = 2000');
    expect(result.server).toContain('__rateLimitWindow = 7200');
  });
});

// ════════════════════════════════════════════════════════════
// Additional analyzer tests
// ════════════════════════════════════════════════════════════

describe('Security block analyzer — additional', () => {
  test('multiple undefined roles in different protect rules', () => {
    const { warnings } = analyze(`
      security {
        protect "/api/admin/*" { require: SuperAdmin }
        protect "/api/billing/*" { require: BillingManager }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    const roleWarnings = warnings.filter(w => w.code === 'W_UNDEFINED_ROLE');
    expect(roleWarnings.length).toBe(2);
    expect(roleWarnings[0].message).toContain('SuperAdmin');
    expect(roleWarnings[1].message).toContain('BillingManager');
  });

  test('protect with no require key — no crash', () => {
    // A protect rule without require should not crash the analyzer
    const { warnings } = analyze(`
      security {
        protect "/api/*" {
          rate_limit: { max: 100, window: 60 }
        }
      }
      server {
        GET "/api/test" fn(req) { "test" }
      }
    `);
    const roleWarning = warnings.find(w => w.code === 'W_UNDEFINED_ROLE');
    expect(roleWarning).toBeUndefined();
  });

  test('security block with only csp — no errors', () => {
    const result = analyze(`
      security {
        csp {
          default_src: ["self"]
        }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    const errors = result.errors || [];
    expect(errors.length).toBe(0);
  });

  test('security block with only csrf — no errors', () => {
    const result = analyze(`
      security {
        csrf {
          enabled: true
        }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    const errors = result.errors || [];
    expect(errors.length).toBe(0);
  });

  test('security block with only audit — no errors', () => {
    const result = analyze(`
      security {
        audit {
          store: "logs"
          retain: 30
        }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    const errors = result.errors || [];
    expect(errors.length).toBe(0);
  });

  test('security block with only sensitive — no errors', () => {
    const result = analyze(`
      security {
        sensitive User.password {
          never_expose: true
        }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    const errors = result.errors || [];
    expect(errors.length).toBe(0);
  });

  test('defined role used across multiple protect rules — no warning', () => {
    const { warnings } = analyze(`
      security {
        role Admin { can: [manage] }
        protect "/api/admin/*" { require: Admin }
        protect "/api/settings/*" { require: Admin }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    const roleWarning = warnings.find(w => w.code === 'W_UNDEFINED_ROLE');
    expect(roleWarning).toBeUndefined();
  });

  test('role defined after protect rule — still valid', () => {
    const { warnings } = analyze(`
      security {
        protect "/api/admin/*" { require: Admin }
        role Admin { can: [manage] }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    const roleWarning = warnings.find(w => w.code === 'W_UNDEFINED_ROLE');
    expect(roleWarning).toBeUndefined();
  });

  test('multiple security blocks combined in analyzer', () => {
    const result = analyze(`
      security {
        role Admin { can: [manage] }
      }
      security {
        protect "/api/*" { require: Admin }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    // Each security block is analyzed independently, so cross-block role validation
    // may produce a warning since the second block doesn't see the first block's roles
    const errors = result.errors || [];
    expect(errors.length).toBe(0);
  });

  test('three duplicate roles produce two warnings', () => {
    const { warnings } = analyze(`
      security {
        role Admin { can: [a] }
        role Admin { can: [b] }
        role Admin { can: [c] }
      }
      server {
        GET "/hello" fn(req) { "hello" }
      }
    `);
    const dupWarnings = warnings.filter(w => w.code === 'W_DUPLICATE_ROLE');
    expect(dupWarnings.length).toBe(2);
  });
});

// ════════════════════════════════════════════════════════════
// SecurityCodegen.mergeSecurityBlocks unit tests
// ════════════════════════════════════════════════════════════

describe('SecurityCodegen.mergeSecurityBlocks', () => {
  test('merges auth from single block', () => {
    const { SecurityCodegen } = require('../src/codegen/security-codegen.js');
    const blocks = [{
      type: 'SecurityBlock',
      body: [{ type: 'SecurityAuthDeclaration', authType: 'jwt', config: { secret: 's' } }],
    }];
    const config = SecurityCodegen.mergeSecurityBlocks(blocks);
    expect(config.auth).toBeDefined();
    expect(config.auth.authType).toBe('jwt');
  });

  test('merges roles from multiple blocks', () => {
    const { SecurityCodegen } = require('../src/codegen/security-codegen.js');
    const blocks = [
      { type: 'SecurityBlock', body: [
        { type: 'SecurityRoleDeclaration', name: 'Admin', permissions: ['manage'] },
      ]},
      { type: 'SecurityBlock', body: [
        { type: 'SecurityRoleDeclaration', name: 'User', permissions: ['view'] },
      ]},
    ];
    const config = SecurityCodegen.mergeSecurityBlocks(blocks);
    expect(config.roles.length).toBe(2);
    expect(config.roles[0].name).toBe('Admin');
    expect(config.roles[1].name).toBe('User');
  });

  test('last auth wins when multiple blocks have auth', () => {
    const { SecurityCodegen } = require('../src/codegen/security-codegen.js');
    const blocks = [
      { type: 'SecurityBlock', body: [
        { type: 'SecurityAuthDeclaration', authType: 'jwt', config: { secret: 'first' } },
      ]},
      { type: 'SecurityBlock', body: [
        { type: 'SecurityAuthDeclaration', authType: 'api_key', config: { header: 'X-Key' } },
      ]},
    ];
    const config = SecurityCodegen.mergeSecurityBlocks(blocks);
    expect(config.auth.authType).toBe('api_key');
  });

  test('protects accumulate across blocks', () => {
    const { SecurityCodegen } = require('../src/codegen/security-codegen.js');
    const blocks = [
      { type: 'SecurityBlock', body: [
        { type: 'SecurityProtectDeclaration', pattern: '/api/*', config: {} },
      ]},
      { type: 'SecurityBlock', body: [
        { type: 'SecurityProtectDeclaration', pattern: '/admin/*', config: {} },
      ]},
    ];
    const config = SecurityCodegen.mergeSecurityBlocks(blocks);
    expect(config.protects.length).toBe(2);
  });

  test('sensitives accumulate across blocks', () => {
    const { SecurityCodegen } = require('../src/codegen/security-codegen.js');
    const blocks = [
      { type: 'SecurityBlock', body: [
        { type: 'SecuritySensitiveDeclaration', typeName: 'User', fieldName: 'password', config: {} },
      ]},
      { type: 'SecurityBlock', body: [
        { type: 'SecuritySensitiveDeclaration', typeName: 'User', fieldName: 'email', config: {} },
      ]},
    ];
    const config = SecurityCodegen.mergeSecurityBlocks(blocks);
    expect(config.sensitives.length).toBe(2);
  });

  test('empty blocks produce empty config', () => {
    const { SecurityCodegen } = require('../src/codegen/security-codegen.js');
    const config = SecurityCodegen.mergeSecurityBlocks([{ type: 'SecurityBlock', body: [] }]);
    expect(config.auth).toBeNull();
    expect(config.roles).toEqual([]);
    expect(config.protects).toEqual([]);
    expect(config.sensitives).toEqual([]);
    expect(config.cors).toBeNull();
    expect(config.csp).toBeNull();
    expect(config.rateLimit).toBeNull();
    expect(config.csrf).toBeNull();
    expect(config.audit).toBeNull();
  });

  test('last cors wins when multiple blocks have cors', () => {
    const { SecurityCodegen } = require('../src/codegen/security-codegen.js');
    const blocks = [
      { type: 'SecurityBlock', body: [
        { type: 'SecurityCorsDeclaration', config: { origins: ['a'] } },
      ]},
      { type: 'SecurityBlock', body: [
        { type: 'SecurityCorsDeclaration', config: { origins: ['b'] } },
      ]},
    ];
    const config = SecurityCodegen.mergeSecurityBlocks(blocks);
    expect(config.cors.config.origins).toEqual(['b']);
  });

  test('all node types are correctly categorized', () => {
    const { SecurityCodegen } = require('../src/codegen/security-codegen.js');
    const blocks = [{
      type: 'SecurityBlock',
      body: [
        { type: 'SecurityAuthDeclaration', authType: 'jwt', config: {} },
        { type: 'SecurityRoleDeclaration', name: 'A', permissions: [] },
        { type: 'SecurityProtectDeclaration', pattern: '/', config: {} },
        { type: 'SecuritySensitiveDeclaration', typeName: 'T', fieldName: 'f', config: {} },
        { type: 'SecurityCorsDeclaration', config: {} },
        { type: 'SecurityCspDeclaration', config: {} },
        { type: 'SecurityRateLimitDeclaration', config: {} },
        { type: 'SecurityCsrfDeclaration', config: {} },
        { type: 'SecurityAuditDeclaration', config: {} },
      ],
    }];
    const config = SecurityCodegen.mergeSecurityBlocks(blocks);
    expect(config.auth).toBeDefined();
    expect(config.roles.length).toBe(1);
    expect(config.protects.length).toBe(1);
    expect(config.sensitives.length).toBe(1);
    expect(config.cors).toBeDefined();
    expect(config.csp).toBeDefined();
    expect(config.rateLimit).toBeDefined();
    expect(config.csrf).toBeDefined();
    expect(config.audit).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Security Hardening Tests — multi-role, cookie auth, glob, audit, analyzer
// ═══════════════════════════════════════════════════════════════

describe('Multi-role support', () => {
  test('__hasRole checks user.roles array', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        role Admin { can: [manage] }
        role Editor { can: [edit] }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('__getUserRoles');
    expect(result.server).toContain('Array.isArray(user.roles)');
    expect(result.server).toContain('user.roles');
  });

  test('__hasRole falls back to user.role string', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        role Admin { can: [manage] }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    // Should support both user.role (string) and user.roles (array)
    expect(result.server).toContain('if (user.role) return [user.role]');
  });

  test('__hasPermission checks across multiple roles', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        role Admin { can: [manage, delete] }
        role Editor { can: [edit, publish] }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    // Should iterate over user roles to find permission
    expect(result.server).toContain('for (const r of userRoles)');
    expect(result.server).toContain('__securityRoles[r]');
  });

  test('client-side setUserRole accepts array', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        role Admin { can: [manage] }
        role User { can: [view] }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
      client {
        state x = 0
      }
    `);
    expect(result.client).toContain('Array.isArray(role) ? role : [role]');
    expect(result.client).toContain('__currentUserRoles');
  });

  test('client can() checks permissions across multiple roles', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        role Admin { can: [manage] }
        role Editor { can: [edit] }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
      client {
        state x = 0
      }
    `);
    expect(result.client).toContain('for (const r of __currentUserRoles)');
  });

  test('audit log captures roles array', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        role Admin { can: [manage] }
        audit { store: "logs" }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('__getUserRoles');
    expect(result.server).toContain('roles:');
  });
});

describe('HttpOnly cookie auth', () => {
  test('auth with storage: "cookie" generates cookie-based client auth', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "s"
          storage: "cookie"
        }
        role Admin { can: [manage] }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
      client {
        state x = 0
      }
    `);
    // Client should NOT use localStorage
    expect(result.client).not.toContain('localStorage');
    // Client should use credentials: include
    expect(result.client).toContain('credentials');
    expect(result.client).toContain('include');
    // Client should have logout via fetch
    expect(result.client).toContain('/rpc/__logout');
    // getAuthToken returns null (cookie is HttpOnly)
    expect(result.client).toContain('return null');
  });

  test('server with storage: "cookie" reads token from cookie', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "s"
          storage: "cookie"
        }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    // Should read from Cookie header
    expect(result.server).toContain('__tova_auth=');
    expect(result.server).toContain('Cookie');
    // Should also fall back to Authorization header
    expect(result.server).toContain('Authorization');
    expect(result.server).toContain('Bearer');
  });

  test('server with storage: "cookie" generates __setAuthCookie helper', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "s"
          storage: "cookie"
        }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('__setAuthCookie');
    expect(result.server).toContain('HttpOnly');
    expect(result.server).toContain('Secure');
    expect(result.server).toContain('SameSite=Lax');
  });

  test('server with storage: "cookie" generates __clearAuthCookie helper', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "s"
          storage: "cookie"
        }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('__clearAuthCookie');
    expect(result.server).toContain('Max-Age=0');
  });

  test('server with storage: "cookie" generates /rpc/__logout endpoint', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "s"
          storage: "cookie"
        }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('/rpc/__logout');
    expect(result.server).toContain('__clearAuthCookie');
  });

  test('default auth (no storage) still uses localStorage', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
      client {
        state x = 0
      }
    `);
    expect(result.client).toContain('localStorage');
    expect(result.client).not.toContain('credentials');
  });

  test('cookie auth respects expires for Max-Age', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "s"
          storage: "cookie"
          expires: 3600
        }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('__authCookieMaxAge = 3600');
  });
});

describe('Improved glob→regex in protect patterns', () => {
  test('single * matches within one path segment', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        protect "/api/*/users" { require: authenticated }
      }
      server {
        GET "/api/v1/users" fn(req) { "ok" }
      }
    `);
    // Should use [^/]* (not .*) for single * — matches within one segment only
    const protectLine = result.server.split('\n').find(l => l.includes('pattern:') && l.includes('api'));
    expect(protectLine).toContain('[^/]*');
    expect(protectLine).not.toContain('.*');
  });

  test('** matches across path segments', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        protect "/api/**" { require: authenticated }
      }
      server {
        GET "/api/v1/users" fn(req) { "ok" }
      }
    `);
    // ** should become .* (match anything including /)
    const protectLine = result.server.split('\n').find(l => l.includes('pattern:') && l.includes('api'));
    expect(protectLine).toContain('.*');
    // Should NOT contain [^/]* for the ** part
    expect(protectLine).not.toContain('[^/]*');
  });

  test('dots in patterns are escaped', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        protect "/api/v1.0/*" { require: authenticated }
      }
      server {
        GET "/api/v1.0/test" fn(req) { "ok" }
      }
    `);
    // Dot should be escaped to \\.
    expect(result.server).toContain('v1\\.0');
  });

  test('special regex chars in patterns are escaped', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        protect "/api/data(1)/*" { require: authenticated }
      }
      server {
        GET "/api/data(1)/test" fn(req) { "ok" }
      }
    `);
    // Parentheses should be escaped
    expect(result.server).toContain('data\\(1\\)');
  });
});

describe('Audit log SQL safety', () => {
  test('audit store name is validated at runtime', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
        audit {
          store: "audit_log"
          events: [login]
        }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    // Should contain table name validation regex
    expect(result.server).toContain('/^[a-zA-Z_][a-zA-Z0-9_]*$/');
    expect(result.server).toContain('Invalid audit store table name');
  });
});

describe('Analyzer — cross-block security validation', () => {
  test('W_PROTECT_WITHOUT_AUTH when protect exists but no auth', () => {
    const result = analyze(`
      security {
        role Admin { can: [manage] }
        protect "/api/*" { require: Admin }
      }
    `);
    const warnings = result.warnings || [];
    const pwWarning = warnings.find(w => w.code === 'W_PROTECT_WITHOUT_AUTH');
    expect(pwWarning).toBeDefined();
    expect(pwWarning.message).toContain('no auth is configured');
  });

  test('no W_PROTECT_WITHOUT_AUTH when auth is present', () => {
    const result = analyze(`
      security {
        auth jwt { secret: "s" }
        role Admin { can: [manage] }
        protect "/api/*" { require: Admin }
      }
    `);
    const warnings = result.warnings || [];
    const pwWarning = warnings.find(w => w.code === 'W_PROTECT_WITHOUT_AUTH');
    expect(pwWarning).toBeUndefined();
  });

  test('W_PROTECT_WITHOUT_AUTH across multiple blocks', () => {
    const result = analyze(`
      security {
        role Admin { can: [manage] }
      }
      security {
        protect "/api/*" { require: Admin }
      }
    `);
    const warnings = result.warnings || [];
    const pwWarning = warnings.find(w => w.code === 'W_PROTECT_WITHOUT_AUTH');
    expect(pwWarning).toBeDefined();
  });

  test('no W_PROTECT_WITHOUT_AUTH when auth is in different security block', () => {
    const result = analyze(`
      security {
        auth jwt { secret: "s" }
      }
      security {
        role Admin { can: [manage] }
        protect "/api/*" { require: Admin }
      }
    `);
    const warnings = result.warnings || [];
    const pwWarning = warnings.find(w => w.code === 'W_PROTECT_WITHOUT_AUTH');
    expect(pwWarning).toBeUndefined();
  });

  test('W_PROTECT_NO_REQUIRE when protect has no require key', () => {
    const result = analyze(`
      security {
        protect "/api/*" {
          rate_limit: { max: 100, window: 60 }
        }
      }
    `);
    const warnings = result.warnings || [];
    const noReq = warnings.find(w => w.code === 'W_PROTECT_NO_REQUIRE');
    expect(noReq).toBeDefined();
    expect(noReq.message).toContain('no \'require\'');
  });

  test('cross-block role validation succeeds for roles in different blocks', () => {
    const result = analyze(`
      security {
        role Admin { can: [manage] }
      }
      security {
        protect "/api/*" { require: Admin }
      }
    `);
    const warnings = result.warnings || [];
    const undefinedRole = warnings.find(w => w.code === 'W_UNDEFINED_ROLE');
    // Should NOT warn because Admin is defined in another block
    expect(undefinedRole).toBeUndefined();
  });

  test('cross-block role validation catches undefined roles', () => {
    const result = analyze(`
      security {
        role User { can: [view] }
      }
      security {
        protect "/api/*" { require: SuperAdmin }
      }
    `);
    const warnings = result.warnings || [];
    const undefinedRole = warnings.find(w => w.code === 'W_UNDEFINED_ROLE');
    expect(undefinedRole).toBeDefined();
    expect(undefinedRole.message).toContain('SuperAdmin');
  });

  test('sensitive visible_to references undefined role', () => {
    const result = analyze(`
      security {
        role User { can: [view] }
        sensitive User.email {
          visible_to: [Admin, "self"]
        }
      }
    `);
    const warnings = result.warnings || [];
    const undefinedRole = warnings.find(w => w.code === 'W_UNDEFINED_ROLE' && w.message.includes('Admin'));
    expect(undefinedRole).toBeDefined();
    expect(undefinedRole.message).toContain('visible_to');
  });

  test('sensitive visible_to with defined role produces no warning', () => {
    const result = analyze(`
      security {
        role Admin { can: [manage] }
        sensitive User.email {
          visible_to: [Admin, "self"]
        }
      }
    `);
    const warnings = result.warnings || [];
    const undefinedRole = warnings.find(w => w.code === 'W_UNDEFINED_ROLE');
    expect(undefinedRole).toBeUndefined();
  });

  test('sensitive visible_to across blocks validates correctly', () => {
    const result = analyze(`
      security {
        role Admin { can: [manage] }
      }
      security {
        sensitive User.email {
          visible_to: [Admin, "self"]
        }
      }
    `);
    const warnings = result.warnings || [];
    const undefinedRole = warnings.find(w => w.code === 'W_UNDEFINED_ROLE');
    expect(undefinedRole).toBeUndefined();
  });

  test('duplicate roles across blocks still warns', () => {
    const result = analyze(`
      security {
        role Admin { can: [manage] }
        role Admin { can: [edit] }
      }
    `);
    const warnings = result.warnings || [];
    const dupRole = warnings.find(w => w.code === 'W_DUPLICATE_ROLE');
    expect(dupRole).toBeDefined();
  });
});

describe('RPC interceptor API correctness', () => {
  test('localStorage auth uses proper interceptor object API', () => {
    const result = compile(`
      security {
        auth jwt { secret: "s" }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
      client {
        state x = 0
      }
    `);
    // Should use object-style interceptor with request method
    expect(result.client).toContain('request({');
    expect(result.client).toContain('options.headers');
    expect(result.client).toContain('return options');
  });
});

// ════════════════════════════════════════════════════════════
// Security Hardening Tests — Fixes 1–10
// ════════════════════════════════════════════════════════════

describe('Fix 1: JWT alg header validation', () => {
  test('generated auth code validates HS256 algorithm', () => {
    const result = compile(`
      security {
        auth jwt { secret: env("JWT_SECRET") }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('__header.alg !== "HS256"');
    expect(result.server).toContain('JSON.parse(atob(parts[0]');
  });

  test('alg check appears before signature verification in __authenticate', () => {
    const result = compile(`
      security {
        auth jwt { secret: env("JWT_SECRET") }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    // Look within __authenticate function only
    const authFnStart = result.server.indexOf('async function __authenticate');
    expect(authFnStart).toBeGreaterThan(-1);
    const authFn = result.server.slice(authFnStart);
    const algIdx = authFn.indexOf('__header.alg');
    const sigIdx = authFn.indexOf('crypto.subtle.sign');
    expect(algIdx).toBeGreaterThan(-1);
    expect(sigIdx).toBeGreaterThan(-1);
    expect(algIdx).toBeLessThan(sigIdx);
  });
});

describe('Fix 2: W_HARDCODED_SECRET warning', () => {
  test('warns on string literal secret', () => {
    const { warnings } = analyze(`
      security {
        auth jwt { secret: "my-hardcoded-secret" }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    const hw = warnings.find(w => w.code === 'W_HARDCODED_SECRET');
    expect(hw).toBeDefined();
    expect(hw.message).toContain('hardcoded');
  });

  test('no warning when secret uses env()', () => {
    const { warnings } = analyze(`
      security {
        auth jwt { secret: env("JWT_SECRET") }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    const hw = warnings.find(w => w.code === 'W_HARDCODED_SECRET');
    expect(hw).toBeUndefined();
  });
});

describe('Fix 3: trust_proxy directive', () => {
  test('trust_proxy true parses correctly', () => {
    const ast = parse(`security {
      trust_proxy true
    }`);
    const tp = ast.body[0].body[0];
    expect(tp.type).toBe('SecurityTrustProxyDeclaration');
    expect(tp.value).toBe(true);
  });

  test('trust_proxy false parses correctly', () => {
    const ast = parse(`security {
      trust_proxy false
    }`);
    const tp = ast.body[0].body[0];
    expect(tp.type).toBe('SecurityTrustProxyDeclaration');
    expect(tp.value).toBe(false);
  });

  test('trust_proxy "loopback" parses correctly', () => {
    const ast = parse(`security {
      trust_proxy "loopback"
    }`);
    const tp = ast.body[0].body[0];
    expect(tp.type).toBe('SecurityTrustProxyDeclaration');
    expect(tp.value).toBe('loopback');
  });

  test('trust_proxy true generates xff-reading __getClientIp', () => {
    const result = compile(`
      security {
        trust_proxy true
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('__getClientIp');
    expect(result.server).toContain('x-forwarded-for');
    expect(result.server).toContain('.split(",")[0].trim()');
  });

  test('trust_proxy false generates direct IP __getClientIp', () => {
    const result = compile(`
      security {
        trust_proxy false
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('__getClientIp');
    expect(result.server).toContain('requestIP');
    // Should NOT trust x-forwarded-for
    const getClientIpFn = result.server.split('function __getClientIp')[1].split('}')[0];
    expect(getClientIpFn).not.toContain('x-forwarded-for');
  });

  test('trust_proxy "loopback" generates conditional xff reading', () => {
    const result = compile(`
      security {
        trust_proxy "loopback"
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('__getClientIp');
    expect(result.server).toContain('127.0.0.1');
    expect(result.server).toContain('::1');
    expect(result.server).toContain('x-forwarded-for');
  });

  test('no raw x-forwarded-for in rate limit code', () => {
    const result = compile(`
      security {
        trust_proxy false
        rate_limit { max: 100, window: 60 }
        auth jwt { secret: env("S") }
        protect "/api/*" { require: authenticated, rate_limit: { max: 10, window: 60 } }
      }
      server {
        GET "/api/test" fn(req) { "ok" }
      }
    `);
    // After __getClientIp definition, there should be no raw x-forwarded-for usage
    const afterHelper = result.server.split('function __getClientIp')[1] || '';
    // The function body itself may reference x-forwarded-for, but usage sites should use __getClientIp
    const afterHelperEnd = afterHelper.indexOf('// ── Max Body Size');
    const usageSites = afterHelperEnd > 0 ? afterHelper.slice(afterHelperEnd) : afterHelper;
    expect(usageSites).not.toContain('req.headers.get("x-forwarded-for")');
  });

  test('default (no trust_proxy) does not trust xff', () => {
    const result = compile(`
      security {
        rate_limit { max: 100, window: 60 }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('__getClientIp');
    const getClientIpFn = result.server.split('function __getClientIp')[1].split('}')[0];
    expect(getClientIpFn).not.toContain('x-forwarded-for');
  });
});

describe('Fix 4: Path normalization', () => {
  test('full mode normalizes pathname', () => {
    const result = compile(`
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('let __pathname');
    expect(result.server).toContain('decodeURIComponent');
    expect(result.server).toContain('replace(/\\/\\/+/g, "/")');
    expect(result.server).toContain('endsWith("/")');
  });

  test('normalization handles double slashes', () => {
    const result = compile(`
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    // The replace pattern should collapse multiple slashes
    expect(result.server).toContain('replace(/\\/\\/+/g, "/")');
  });

  test('normalization strips trailing slashes', () => {
    const result = compile(`
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('__pathname.slice(0, -1)');
  });

  test('normalization decodes percent-encoded paths', () => {
    const result = compile(`
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('decodeURIComponent(__pathname)');
  });
});

describe('Fix 5: HSTS in security block', () => {
  test('hsts block parses correctly', () => {
    const ast = parse(`security {
      hsts {
        max_age: 63072000
        include_subdomains: true
        preload: true
      }
    }`);
    const hsts = ast.body[0].body[0];
    expect(hsts.type).toBe('SecurityHstsDeclaration');
    expect(hsts.config.max_age.value).toBe(63072000);
    expect(hsts.config.include_subdomains.value).toBe(true);
    expect(hsts.config.preload.value).toBe(true);
  });

  test('custom hsts config generates custom header', () => {
    const result = compile(`
      security {
        hsts {
          max_age: 63072000
          include_subdomains: true
          preload: true
        }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('Strict-Transport-Security');
    expect(result.server).toContain('63072000');
    expect(result.server).toContain('preload');
  });

  test('auth auto-enables HSTS with default values', () => {
    const result = compile(`
      security {
        auth jwt { secret: env("S") }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('Strict-Transport-Security');
    expect(result.server).toContain('max-age=31536000');
    expect(result.server).toContain('includeSubDomains');
  });

  test('hsts enabled: false suppresses HSTS', () => {
    const result = compile(`
      security {
        auth jwt { secret: env("S") }
        hsts {
          enabled: false
        }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).not.toContain('Strict-Transport-Security');
  });
});

describe('Fix 6: Auto-sanitization', () => {
  test('sensitive fields generate __autoSanitize function', () => {
    const result = compile(`
      security {
        sensitive User.password { never_expose: true }
        sensitive User.ssn { never_expose: true }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('__autoSanitize');
    expect(result.server).toContain('__sanitizeUser');
    expect(result.server).toContain('data.__type');
  });

  test('__autoSanitize dispatches by __type field', () => {
    const result = compile(`
      security {
        sensitive User.password { never_expose: true }
        sensitive Account.secret_key { never_expose: true }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('__typeName === "User"');
    expect(result.server).toContain('__typeName === "Account"');
    expect(result.server).toContain('__sanitizeUser');
    expect(result.server).toContain('__sanitizeAccount');
  });

  test('__autoSanitize handles arrays recursively', () => {
    const result = compile(`
      security {
        sensitive User.password { never_expose: true }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('Array.isArray(data)');
    expect(result.server).toContain('data.map(item => __autoSanitize');
  });

  test('Response.json wraps with __autoSanitize when sensitive fields exist', () => {
    const result = compile(`
      security {
        auth jwt { secret: env("S") }
        sensitive User.password { never_expose: true }
      }
      server {
        fn get_users() { "users" }
      }
    `);
    expect(result.server).toContain('__autoSanitize(result');
  });

  test('no __autoSanitize when no sensitive fields', () => {
    const result = compile(`
      security {
        auth jwt { secret: env("S") }
      }
      server {
        fn get_test() { "ok" }
      }
    `);
    expect(result.server).not.toContain('__autoSanitize');
  });
});

describe('Fix 7: W_CORS_WILDCARD warning', () => {
  test('warns when cors origins contains "*"', () => {
    const { warnings } = analyze(`
      security {
        cors {
          origins: ["*"]
        }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    const cw = warnings.find(w => w.code === 'W_CORS_WILDCARD');
    expect(cw).toBeDefined();
    expect(cw.message).toContain('wildcard');
  });

  test('no warning for specific origins', () => {
    const { warnings } = analyze(`
      security {
        cors {
          origins: ["https://myapp.com"]
        }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    const cw = warnings.find(w => w.code === 'W_CORS_WILDCARD');
    expect(cw).toBeUndefined();
  });

  test('warns even with mixed origins containing "*"', () => {
    const { warnings } = analyze(`
      security {
        cors {
          origins: ["https://myapp.com", "*"]
        }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    const cw = warnings.find(w => w.code === 'W_CORS_WILDCARD');
    expect(cw).toBeDefined();
  });
});

describe('Fix 8: Client-side can() advisory comment', () => {
  test('client roles section includes advisory comment', () => {
    const result = compile(`
      security {
        role Admin { can: [manage] }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
      client {
        state x = 0
      }
    `);
    expect(result.client).toContain('Client-side role checking is for UI purposes only');
    expect(result.client).toContain('authorization is enforced server-side');
  });
});

describe('Fix 9: CSRF exempt patterns', () => {
  test('csrf exempt generates __csrfExemptPatterns and __isCsrfExempt', () => {
    const result = compile(`
      security {
        auth jwt { secret: env("S") }
        csrf {
          enabled: true
          exempt: ["/api/webhooks/*"]
        }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('__csrfExemptPatterns');
    expect(result.server).toContain('__isCsrfExempt');
    expect(result.server).toContain('webhooks');
  });

  test('csrf exempt wraps CSRF validation in guard', () => {
    const result = compile(`
      security {
        auth jwt { secret: env("S") }
        csrf {
          enabled: true
          exempt: ["/api/webhooks/*"]
        }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('__isCsrfExempt(__pathname)');
  });

  test('no csrf exempt — no __isCsrfExempt guard', () => {
    const result = compile(`
      security {
        auth jwt { secret: env("S") }
        csrf { enabled: true }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).not.toContain('__isCsrfExempt');
  });

  test('csrf exempt patterns use glob-to-regex conversion', () => {
    const result = compile(`
      security {
        auth jwt { secret: env("S") }
        csrf {
          enabled: true
          exempt: ["/api/webhooks/*", "/api/stripe/**"]
        }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    // * should be [^/]* and ** should be .*
    expect(result.server).toContain('[^/]*');
    expect(result.server).toContain('.*');
  });
});

describe('Fix 10: CSRF raw byte comparison', () => {
  test('CSRF validation uses raw byte comparison', () => {
    const result = compile(`
      security {
        auth jwt { secret: env("S") }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('new Uint8Array(expectedSig)');
    expect(result.server).toContain('Buffer.from(sig, "hex")');
    expect(result.server).toContain('timingSafeEqual(sigBytes, expectedBytes)');
  });

  test('CSRF validation catches invalid hex with try/catch', () => {
    const result = compile(`
      security {
        auth jwt { secret: env("S") }
      }
      server {
        GET "/test" fn(req) { "ok" }
      }
    `);
    expect(result.server).toContain('try { sigBytes =');
    expect(result.server).toContain('catch { return false; }');
  });
});

describe('SecurityCodegen.mergeSecurityBlocks — new node types', () => {
  test('merges trust_proxy from single block', () => {
    const { SecurityCodegen } = require('../src/codegen/security-codegen.js');
    const blocks = [{
      type: 'SecurityBlock',
      body: [{ type: 'SecurityTrustProxyDeclaration', value: true }],
    }];
    const config = SecurityCodegen.mergeSecurityBlocks(blocks);
    expect(config.trustProxy).toBeDefined();
    expect(config.trustProxy.value).toBe(true);
  });

  test('merges hsts from single block', () => {
    const { SecurityCodegen } = require('../src/codegen/security-codegen.js');
    const blocks = [{
      type: 'SecurityBlock',
      body: [{ type: 'SecurityHstsDeclaration', config: { max_age: 31536000 } }],
    }];
    const config = SecurityCodegen.mergeSecurityBlocks(blocks);
    expect(config.hsts).toBeDefined();
    expect(config.hsts.config.max_age).toBe(31536000);
  });

  test('last trust_proxy wins', () => {
    const { SecurityCodegen } = require('../src/codegen/security-codegen.js');
    const blocks = [
      { type: 'SecurityBlock', body: [
        { type: 'SecurityTrustProxyDeclaration', value: true },
      ]},
      { type: 'SecurityBlock', body: [
        { type: 'SecurityTrustProxyDeclaration', value: false },
      ]},
    ];
    const config = SecurityCodegen.mergeSecurityBlocks(blocks);
    expect(config.trustProxy.value).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// Security hardening v2 — fixes for audit findings SEC-S3, SEC-C1, SEC-C3,
// SEC-A1, SEC-S4, SEC-C4, SEC-P1/A2, SEC-A3, SEC-A4, SEC-C5
// ════════════════════════════════════════════════════════════

describe('SEC-S3: csrf { enabled: false } actually disables CSRF', () => {
  test('csrf enabled:false prevents CSRF code generation', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: env("SECRET")
        }
        csrf {
          enabled: false
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    const server = result.server || result.servers?.default || '';
    expect(server).not.toContain('__generateCSRFToken');
    expect(server).not.toContain('__validateCSRFToken');
    expect(server).not.toContain('CSRF_INVALID');
  });

  test('csrf enabled:true still generates CSRF code', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: env("SECRET")
        }
        csrf {
          enabled: true
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    const server = result.server || result.servers?.default || '';
    expect(server).toContain('__generateCSRFToken');
    expect(server).toContain('__validateCSRFToken');
  });

  test('no csrf block with auth still generates CSRF by default', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: env("SECRET")
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    const server = result.server || result.servers?.default || '';
    expect(server).toContain('__generateCSRFToken');
  });
});

describe('SEC-C1: auto-sanitize checks __tag for variant types', () => {
  test('__autoSanitize checks __tag in addition to __type and constructor', () => {
    const result = compile(`
      security {
        sensitive User.email {
          never_expose: true
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    const server = result.server || result.servers?.default || '';
    expect(server).toContain('data.__tag');
    expect(server).toContain('data.__type');
  });
});

describe('SEC-C3: visible_to self uses multi-field identity check', () => {
  test('generates __isSameIdentity helper with multiple ID fields', () => {
    const result = compile(`
      security {
        role Admin { can: [read] }
        sensitive User.salary {
          visible_to: [self, Admin]
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    const server = result.server || result.servers?.default || '';
    expect(server).toContain('__isSameIdentity');
    expect(server).toContain('"id"');
    expect(server).toContain('"_id"');
    expect(server).toContain('"userId"');
    expect(server).toContain('"user_id"');
    expect(server).toContain('"uuid"');
  });

  test('does not generate __isSameIdentity when no visible_to', () => {
    const result = compile(`
      security {
        sensitive User.email {
          never_expose: true
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    const server = result.server || result.servers?.default || '';
    expect(server).not.toContain('__isSameIdentity');
  });
});

describe('SEC-A1: cross-block duplicate role detection', () => {
  test('warns when same role defined in different security blocks', () => {
    const { warnings } = analyze(`
      security {
        role Admin { can: [read, write] }
      }
      security {
        role Admin { can: [delete] }
      }
    `);
    const dupeWarnings = warnings.filter(w => w.code === 'W_DUPLICATE_ROLE');
    expect(dupeWarnings.length).toBeGreaterThanOrEqual(1);
    expect(dupeWarnings.some(w => w.message.includes('multiple security blocks'))).toBe(true);
  });

  test('no cross-block warning for different role names', () => {
    const { warnings } = analyze(`
      security {
        role Admin { can: [read, write] }
      }
      security {
        role User { can: [read] }
      }
    `);
    const dupeWarnings = warnings.filter(w => w.code === 'W_DUPLICATE_ROLE');
    expect(dupeWarnings.length).toBe(0);
  });
});

describe('SEC-S4: path normalization resolves ../ sequences', () => {
  test('generated server code resolves .. in paths', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: env("SECRET")
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    const server = result.server || result.servers?.default || '';
    expect(server).toContain('".."');
    expect(server).toContain('__resolved');
  });
});

describe('SEC-C4: audit logging reports errors to stderr', () => {
  test('audit log catch block logs error to console.error', () => {
    const result = compile(`
      security {
        audit {
          events: [login, logout]
          store: "audit_log"
        }
      }
      server {
        GET "/hello" fn(req) {
          "hello"
        }
      }
    `);
    const server = result.server || result.servers?.default || '';
    expect(server).toContain('console.error');
    expect(server).toContain('[tova:audit]');
    // Audit catch block should log errors, not swallow them silently
    expect(server).toContain('catch (__auditErr)');
  });
});

describe('SEC-P1/SEC-A2: auth type validation', () => {
  test('warns on unknown auth type', () => {
    const { warnings } = analyze(`
      security {
        auth oauth {
          secret: env("SECRET")
        }
      }
    `);
    const typeWarnings = warnings.filter(w => w.code === 'W_UNKNOWN_AUTH_TYPE');
    expect(typeWarnings.length).toBe(1);
    expect(typeWarnings[0].message).toContain('oauth');
    expect(typeWarnings[0].message).toContain('jwt');
    expect(typeWarnings[0].message).toContain('api_key');
  });

  test('no warning for jwt auth type', () => {
    const { warnings } = analyze(`
      security {
        auth jwt {
          secret: env("SECRET")
        }
      }
    `);
    const typeWarnings = warnings.filter(w => w.code === 'W_UNKNOWN_AUTH_TYPE');
    expect(typeWarnings.length).toBe(0);
  });

  test('no warning for api_key auth type', () => {
    const { warnings } = analyze(`
      security {
        auth api_key {
          keys: ["key1"]
        }
      }
    `);
    const typeWarnings = warnings.filter(w => w.code === 'W_UNKNOWN_AUTH_TYPE');
    expect(typeWarnings.length).toBe(0);
  });
});

describe('SEC-A3: rate limit value validation', () => {
  test('warns on zero rate limit max', () => {
    const { warnings } = analyze(`
      security {
        rate_limit {
          max: 0
          window: 60
        }
      }
    `);
    const rlWarnings = warnings.filter(w => w.code === 'W_INVALID_RATE_LIMIT');
    expect(rlWarnings.length).toBe(1);
    expect(rlWarnings[0].message).toContain('max');
  });

  test('warns on negative rate limit window', () => {
    const { warnings } = analyze(`
      security {
        rate_limit {
          max: 100
          window: -1
        }
      }
    `);
    const rlWarnings = warnings.filter(w => w.code === 'W_INVALID_RATE_LIMIT');
    expect(rlWarnings.length).toBe(1);
    expect(rlWarnings[0].message).toContain('window');
  });

  test('no warning for valid rate limit values', () => {
    const { warnings } = analyze(`
      security {
        rate_limit {
          max: 100
          window: 60
        }
      }
    `);
    const rlWarnings = warnings.filter(w => w.code === 'W_INVALID_RATE_LIMIT');
    expect(rlWarnings.length).toBe(0);
  });
});

describe('SEC-A4: W_CSRF_DISABLED warning', () => {
  test('warns when CSRF is explicitly disabled', () => {
    const { warnings } = analyze(`
      security {
        csrf {
          enabled: false
        }
      }
    `);
    const csrfWarnings = warnings.filter(w => w.code === 'W_CSRF_DISABLED');
    expect(csrfWarnings.length).toBe(1);
    expect(csrfWarnings[0].message).toContain('cross-site request forgery');
  });

  test('no warning when CSRF is enabled', () => {
    const { warnings } = analyze(`
      security {
        csrf {
          enabled: true
        }
      }
    `);
    const csrfWarnings = warnings.filter(w => w.code === 'W_CSRF_DISABLED');
    expect(csrfWarnings.length).toBe(0);
  });
});

describe('SEC-C5: W_LOCALSTORAGE_TOKEN warning', () => {
  test('warns when JWT auth uses default localStorage', () => {
    const { warnings } = analyze(`
      security {
        auth jwt {
          secret: env("SECRET")
        }
      }
    `);
    const lsWarnings = warnings.filter(w => w.code === 'W_LOCALSTORAGE_TOKEN');
    expect(lsWarnings.length).toBe(1);
    expect(lsWarnings[0].message).toContain('localStorage');
    expect(lsWarnings[0].message).toContain('XSS');
  });

  test('no warning when auth uses cookie storage', () => {
    const { warnings } = analyze(`
      security {
        auth jwt {
          secret: env("SECRET")
          storage: "cookie"
        }
      }
    `);
    const lsWarnings = warnings.filter(w => w.code === 'W_LOCALSTORAGE_TOKEN');
    expect(lsWarnings.length).toBe(0);
  });

  test('no warning for api_key auth', () => {
    const { warnings } = analyze(`
      security {
        auth api_key {
          keys: ["key1"]
        }
      }
    `);
    const lsWarnings = warnings.filter(w => w.code === 'W_LOCALSTORAGE_TOKEN');
    expect(lsWarnings.length).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════
// Security Hardening v0.4.10 tests
// ════════════════════════════════════════════════════════════

describe('Security hardening — JWT nbf validation', () => {
  test('generated auth code includes nbf check', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "test-secret"
        }
      }
      server {
        GET "/hello" fn(req) { "hi" }
      }
    `);
    expect(result.server).toContain('__payload.nbf');
    expect(result.server).toContain('nbf > Math.floor(Date.now() / 1000)');
  });
});

describe('Security hardening — JWT iss/aud validation', () => {
  test('generated auth code validates issuer when configured', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "test-secret"
          issuer: "https://myapp.com"
        }
      }
      server {
        GET "/hello" fn(req) { "hi" }
      }
    `);
    expect(result.server).toContain('__payload.iss');
    expect(result.server).toContain('"https://myapp.com"');
  });

  test('generated auth code validates audience when configured', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "test-secret"
          audience: "my-api"
        }
      }
      server {
        GET "/hello" fn(req) { "hi" }
      }
    `);
    expect(result.server).toContain('__payload.aud');
    expect(result.server).toContain('"my-api"');
  });

  test('sign_jwt includes iss/aud when auth config has them', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "test-secret"
          issuer: "https://myapp.com"
          audience: "my-api"
        }
      }
      server {
        GET "/hello" fn(req) { "hi" }
      }
    `);
    expect(result.server).toContain('claims.iss');
    expect(result.server).toContain('claims.aud');
  });

  test('no iss/aud validation when not configured', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "test-secret"
        }
      }
      server {
        GET "/hello" fn(req) { "hi" }
      }
    `);
    expect(result.server).not.toContain('__payload.iss');
    expect(result.server).not.toContain('__payload.aud');
  });
});

describe('Security hardening — CSRF session binding', () => {
  test('CSRF token functions accept binding parameter', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "test-secret"
        }
      }
      server {
        GET "/hello" fn(req) { "hi" }
      }
    `);
    expect(result.server).toContain('__generateCSRFToken(bindingId)');
    expect(result.server).toContain('__validateCSRFToken(token, bindingId)');
  });

  test('CSRF token includes binding in data payload', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "test-secret"
        }
      }
      server {
        GET "/hello" fn(req) { "hi" }
      }
    `);
    expect(result.server).toContain('bindingId || "anon"');
  });

  test('CSRF validation checks binding matches', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "test-secret"
        }
      }
      server {
        GET "/hello" fn(req) { "hi" }
      }
    `);
    // Token has 4 parts now: timestamp:nonce:binding:sig
    expect(result.server).toContain('parts.length !== 4');
    expect(result.server).toContain('binding !== (bindingId || "anon")');
  });
});

describe('Security hardening — CORS Vary header', () => {
  test('explicit CORS origins include Vary: Origin', () => {
    const result = compile(`
      security {
        cors {
          origins: ["https://example.com"]
        }
      }
      server {
        GET "/hello" fn(req) { "hi" }
      }
    `);
    expect(result.server).toContain('"Vary"');
    expect(result.server).toContain('"Origin"');
  });

  test('auth/session CORS includes Vary: Origin for same-origin', () => {
    const result = compile(`
      security {
        auth jwt {
          secret: "test-secret"
        }
      }
      server {
        GET "/hello" fn(req) { "hi" }
      }
    `);
    expect(result.server).toContain('"Vary": "Origin"');
  });
});

describe('Security hardening — Analyzer W_INMEMORY_RATELIMIT', () => {
  test('warns when rate_limit is configured', () => {
    const { warnings } = analyze(`
      security {
        rate_limit {
          max: 100
          window: 60
        }
      }
    `);
    const rlWarnings = warnings.filter(w => w.code === 'W_INMEMORY_RATELIMIT');
    expect(rlWarnings.length).toBe(1);
    expect(rlWarnings[0].message).toContain('in-memory storage');
  });

  test('no warning when no rate_limit configured', () => {
    const { warnings } = analyze(`
      security {
        auth jwt {
          secret: "test-secret"
        }
      }
    `);
    const rlWarnings = warnings.filter(w => w.code === 'W_INMEMORY_RATELIMIT');
    expect(rlWarnings.length).toBe(0);
  });
});

describe('Security hardening — Analyzer W_NO_AUTH_RATELIMIT', () => {
  test('warns when auth exists but no rate limiting', () => {
    const { warnings } = analyze(`
      security {
        auth jwt {
          secret: "test-secret"
        }
      }
    `);
    const noRlWarnings = warnings.filter(w => w.code === 'W_NO_AUTH_RATELIMIT');
    expect(noRlWarnings.length).toBe(1);
    expect(noRlWarnings[0].message).toContain('brute-force');
  });

  test('no warning when auth and rate_limit both configured', () => {
    const { warnings } = analyze(`
      security {
        auth jwt {
          secret: "test-secret"
        }
        rate_limit {
          max: 100
          window: 60
        }
      }
    `);
    const noRlWarnings = warnings.filter(w => w.code === 'W_NO_AUTH_RATELIMIT');
    expect(noRlWarnings.length).toBe(0);
  });

  test('no warning when protect rules have per-route rate limiting', () => {
    const { warnings } = analyze(`
      security {
        auth jwt {
          secret: "test-secret"
        }
        role admin {
          can: [manage_users]
        }
        protect "/api/**" {
          require: authenticated
          rate_limit: { max: 50, window: 60 }
        }
      }
    `);
    const noRlWarnings = warnings.filter(w => w.code === 'W_NO_AUTH_RATELIMIT');
    expect(noRlWarnings.length).toBe(0);
  });
});

describe('Security hardening — Analyzer W_HASH_NOT_ENFORCED', () => {
  test('warns when sensitive field has hash config', () => {
    const { warnings } = analyze(`
      security {
        sensitive User.password {
          never_expose: true
          hash: "bcrypt"
        }
      }
    `);
    const hashWarnings = warnings.filter(w => w.code === 'W_HASH_NOT_ENFORCED');
    expect(hashWarnings.length).toBe(1);
    expect(hashWarnings[0].message).toContain('hash_password()');
    expect(hashWarnings[0].message).toContain('bcrypt');
  });

  test('no warning when sensitive field has no hash config', () => {
    const { warnings } = analyze(`
      security {
        sensitive User.password {
          never_expose: true
        }
      }
    `);
    const hashWarnings = warnings.filter(w => w.code === 'W_HASH_NOT_ENFORCED');
    expect(hashWarnings.length).toBe(0);
  });
});

describe('Security hardening — Session regeneration', () => {
  test('generates __regenerateSession when sessions configured', () => {
    const result = compile(`
      server {
        session { secret: "test-secret" }
        fn hello() -> String { "hi" }
      }
    `);
    expect(result.server).toContain('__regenerateSession');
    expect(result.server).toContain('__sessionRegenerated');
  });

  test('session cookie flush handles regenerated sessions', () => {
    const result = compile(`
      server {
        session { secret: "test-secret" }
        fn hello() -> String { "hi" }
      }
    `);
    expect(result.server).toContain('__sessionIsNew || req.__sessionRegenerated');
  });
});
