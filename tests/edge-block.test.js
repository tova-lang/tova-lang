import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function parse(source) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

function compile(source) {
  const ast = parse(source);
  const gen = new CodeGenerator(ast, '<test>', { sourceMaps: false });
  return gen.generate();
}

function analyze(source) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze();
}

// ═══════════════════════════════════════════════════════════════
// Parsing
// ═══════════════════════════════════════════════════════════════

describe('edge block - parsing', () => {
  test('empty edge block', () => {
    const ast = parse('edge {}');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0].type).toBe('EdgeBlock');
    expect(ast.body[0].name).toBeNull();
    expect(ast.body[0].body).toHaveLength(0);
  });

  test('named edge block', () => {
    const ast = parse('edge "api" {}');
    expect(ast.body[0].type).toBe('EdgeBlock');
    expect(ast.body[0].name).toBe('api');
  });

  test('target config field', () => {
    const ast = parse('edge { target: "cloudflare" }');
    const body = ast.body[0].body;
    expect(body).toHaveLength(1);
    expect(body[0].type).toBe('EdgeConfigField');
    expect(body[0].key).toBe('target');
    expect(body[0].value.value).toBe('cloudflare');
  });

  test('kv declaration', () => {
    const ast = parse('edge { kv CACHE }');
    const body = ast.body[0].body;
    expect(body).toHaveLength(1);
    expect(body[0].type).toBe('EdgeKVDeclaration');
    expect(body[0].name).toBe('CACHE');
    expect(body[0].config).toBeNull();
  });

  test('kv declaration with config', () => {
    const ast = parse('edge { kv CACHE { ttl: 3600 } }');
    const body = ast.body[0].body;
    expect(body[0].type).toBe('EdgeKVDeclaration');
    expect(body[0].name).toBe('CACHE');
    expect(body[0].config).toBeDefined();
    expect(body[0].config.ttl).toBeDefined();
  });

  test('sql declaration', () => {
    const ast = parse('edge { sql DB }');
    expect(ast.body[0].body[0].type).toBe('EdgeSQLDeclaration');
    expect(ast.body[0].body[0].name).toBe('DB');
  });

  test('storage declaration', () => {
    const ast = parse('edge { storage UPLOADS }');
    expect(ast.body[0].body[0].type).toBe('EdgeStorageDeclaration');
    expect(ast.body[0].body[0].name).toBe('UPLOADS');
  });

  test('queue declaration', () => {
    const ast = parse('edge { queue EMAILS }');
    expect(ast.body[0].body[0].type).toBe('EdgeQueueDeclaration');
    expect(ast.body[0].body[0].name).toBe('EMAILS');
  });

  test('env declaration with default', () => {
    const ast = parse('edge { env API_URL = "https://api.example.com" }');
    const stmt = ast.body[0].body[0];
    expect(stmt.type).toBe('EdgeEnvDeclaration');
    expect(stmt.name).toBe('API_URL');
    expect(stmt.defaultValue.value).toBe('https://api.example.com');
  });

  test('env declaration without default', () => {
    const ast = parse('edge { env API_URL }');
    const stmt = ast.body[0].body[0];
    expect(stmt.type).toBe('EdgeEnvDeclaration');
    expect(stmt.name).toBe('API_URL');
    expect(stmt.defaultValue).toBeNull();
  });

  test('secret declaration', () => {
    const ast = parse('edge { secret API_KEY }');
    const stmt = ast.body[0].body[0];
    expect(stmt.type).toBe('EdgeSecretDeclaration');
    expect(stmt.name).toBe('API_KEY');
  });

  test('schedule declaration', () => {
    const ast = parse(`edge {
      schedule "cleanup" cron("0 */6 * * *") {
        print("cleaning up")
      }
    }`);
    const stmt = ast.body[0].body[0];
    expect(stmt.type).toBe('EdgeScheduleDeclaration');
    expect(stmt.name).toBe('cleanup');
    expect(stmt.cron).toBe('0 */6 * * *');
    expect(stmt.body).toBeDefined();
  });

  test('consume declaration', () => {
    const ast = parse(`edge {
      consume EMAILS fn(messages) {
        print("processing")
      }
    }`);
    const stmt = ast.body[0].body[0];
    expect(stmt.type).toBe('EdgeConsumeDeclaration');
    expect(stmt.queue).toBe('EMAILS');
    expect(stmt.handler).toBeDefined();
  });

  test('route declaration (reuses server route)', () => {
    const ast = parse(`edge {
      route GET "/api/hello" => fn(req) { { hello: "world" } }
    }`);
    const stmt = ast.body[0].body[0];
    expect(stmt.type).toBe('RouteDeclaration');
    expect(stmt.method).toBe('GET');
    expect(stmt.path).toBe('/api/hello');
  });

  test('function declaration inside edge', () => {
    const ast = parse(`edge {
      fn hello() { "world" }
    }`);
    const stmt = ast.body[0].body[0];
    expect(stmt.type).toBe('FunctionDeclaration');
    expect(stmt.name).toBe('hello');
  });

  test('middleware declaration', () => {
    const ast = parse(`edge {
      middleware fn cors(req, next) {
        next(req)
      }
    }`);
    const stmt = ast.body[0].body[0];
    expect(stmt.type).toBe('MiddlewareDeclaration');
    expect(stmt.name).toBe('cors');
  });

  test('full edge block with multiple declarations', () => {
    const ast = parse(`edge {
      target: "cloudflare"
      kv CACHE
      sql DB
      secret API_KEY
      env NODE_ENV = "production"

      fn get_users() { [] }

      route GET "/api/users" => get_users
      route POST "/api/users" => fn(req) { { ok: true } }

      schedule "daily" cron("0 9 * * *") {
        print("daily task")
      }
    }`);
    const body = ast.body[0].body;
    expect(body.length).toBeGreaterThanOrEqual(8);
  });

  test('multiple named edge blocks', () => {
    const ast = parse(`
      edge "api" {
        route GET "/users" => fn(req) { [] }
      }
      edge "assets" {
        route GET "/img" => fn(req) { "ok" }
      }
    `);
    expect(ast.body).toHaveLength(2);
    expect(ast.body[0].name).toBe('api');
    expect(ast.body[1].name).toBe('assets');
  });
});

// ═══════════════════════════════════════════════════════════════
// Cloudflare Workers Codegen
// ═══════════════════════════════════════════════════════════════

describe('edge block - cloudflare codegen', () => {
  test('minimal edge generates Cloudflare fetch handler', () => {
    const result = compile(`edge {
      fn hello() { { message: "Hello" } }
      route GET "/api/hello" => hello
    }`);
    expect(result.edge).toContain('export default {');
    expect(result.edge).toContain('async fetch(request, env, ctx)');
    expect(result.edge).toContain('__matchRoute');
    expect(result.edge).toContain('__routes');
    expect(result.edge).toContain('function hello()');
  });

  test('explicit cloudflare target', () => {
    const result = compile(`edge {
      target: "cloudflare"
      route GET "/" => fn(req) { { ok: true } }
    }`);
    expect(result.edge).toContain('Cloudflare Workers target');
    expect(result.edge).toContain('export default {');
  });

  test('route with path params generates regex', () => {
    const result = compile(`edge {
      route GET "/api/users/:id" => fn(req, params) { params }
    }`);
    expect(result.edge).toContain('([^/]+)');
    expect(result.edge).toContain('"id"');
  });

  test('scheduled handler generates scheduled() method', () => {
    const result = compile(`edge {
      schedule "cleanup" cron("0 0 * * *") {
        print("cleaning")
      }
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('async scheduled(event, env, ctx)');
    expect(result.edge).toContain('event.cron === "0 0 * * *"');
  });

  test('queue consumer generates queue() method', () => {
    const result = compile(`edge {
      consume EMAILS fn(messages) {
        print("processing")
      }
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('async queue(batch, env, ctx)');
  });

  test('middleware generates wrapper functions', () => {
    const result = compile(`edge {
      middleware fn logger(req, next) {
        next(req)
      }
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('__mw_logger');
  });

  test('multiple routes with different methods', () => {
    const result = compile(`edge {
      fn get_users() { [] }
      fn create_user(req) { { ok: true } }
      route GET "/api/users" => get_users
      route POST "/api/users" => create_user
    }`);
    expect(result.edge).toContain('"GET"');
    expect(result.edge).toContain('"POST"');
    expect(result.edge).toContain('/api/users');
  });

  test('error handling in fetch handler', () => {
    const result = compile(`edge {
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('catch (e)');
    expect(result.edge).toContain('status: 500');
  });

  test('404 for unmatched routes', () => {
    const result = compile(`edge {
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('"Not Found"');
    expect(result.edge).toContain('status: 404');
  });

  test('Response passthrough (handler returns Response)', () => {
    const result = compile(`edge {
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('instanceof Response');
    expect(result.edge).toContain('Response.json');
  });
});

// ═══════════════════════════════════════════════════════════════
// Deno Deploy Codegen
// ═══════════════════════════════════════════════════════════════

describe('edge block - deno codegen', () => {
  test('generates Deno.serve', () => {
    const result = compile(`edge {
      target: "deno"
      route GET "/" => fn(req) { { ok: true } }
    }`);
    expect(result.edge).toContain('Deno.serve');
    expect(result.edge).toContain('Deno Deploy target');
    expect(result.edge).not.toContain('export default');
  });

  test('kv binding opens Deno.openKv', () => {
    const result = compile(`edge {
      target: "deno"
      kv CACHE
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('Deno.openKv()');
    expect(result.edge).toContain('const CACHE = await Deno.openKv()');
  });

  test('schedule generates Deno.cron', () => {
    const result = compile(`edge {
      target: "deno"
      schedule "cleanup" cron("0 0 * * *") {
        print("cleaning")
      }
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('Deno.cron("cleanup", "0 0 * * *"');
  });

  test('route matching works in Deno target', () => {
    const result = compile(`edge {
      target: "deno"
      route GET "/api/users/:id" => fn(req, params) { params }
    }`);
    expect(result.edge).toContain('__matchRoute');
    expect(result.edge).toContain('([^/]+)');
  });
});

// ═══════════════════════════════════════════════════════════════
// Vercel Edge Codegen
// ═══════════════════════════════════════════════════════════════

describe('edge block - vercel codegen', () => {
  test('generates Vercel edge function', () => {
    const result = compile(`edge {
      target: "vercel"
      route GET "/" => fn(req) { { ok: true } }
    }`);
    expect(result.edge).toContain('export const config = { runtime: "edge" }');
    expect(result.edge).toContain('export default async function handler');
    expect(result.edge).toContain('Vercel Edge target');
  });
});

// ═══════════════════════════════════════════════════════════════
// AWS Lambda Codegen
// ═══════════════════════════════════════════════════════════════

describe('edge block - lambda codegen', () => {
  test('generates Lambda handler', () => {
    const result = compile(`edge {
      target: "lambda"
      route GET "/" => fn(req) { { ok: true } }
    }`);
    expect(result.edge).toContain('export const handler');
    expect(result.edge).toContain('event.httpMethod');
    expect(result.edge).toContain('statusCode: 200');
    expect(result.edge).toContain('AWS Lambda target');
  });

  test('Lambda 404 returns statusCode', () => {
    const result = compile(`edge {
      target: "lambda"
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('statusCode: 404');
  });
});

// ═══════════════════════════════════════════════════════════════
// Bun Edge Codegen
// ═══════════════════════════════════════════════════════════════

describe('edge block - bun codegen', () => {
  test('generates Bun.serve', () => {
    const result = compile(`edge {
      target: "bun"
      route GET "/" => fn(req) { { ok: true } }
    }`);
    expect(result.edge).toContain('Bun.serve');
    expect(result.edge).toContain('Bun edge target');
  });
});

// ═══════════════════════════════════════════════════════════════
// Shared Types Integration
// ═══════════════════════════════════════════════════════════════

describe('edge block - shared types', () => {
  test('shared code is included in edge output', () => {
    const result = compile(`
      shared {
        type User { id: Int, name: String }
      }
      edge {
        fn get_user() { { id: 1, name: "Alice" } }
        route GET "/api/user" => get_user
      }
    `);
    expect(result.edge).toContain('export default');
    expect(result.shared).toContain('User');
  });
});

// ═══════════════════════════════════════════════════════════════
// Named / Multi-block Edge
// ═══════════════════════════════════════════════════════════════

describe('edge block - named blocks', () => {
  test('named edge blocks produce separate outputs', () => {
    const result = compile(`
      edge "api" {
        route GET "/users" => fn(req) { [] }
      }
      edge "assets" {
        route GET "/img" => fn(req) { "ok" }
      }
    `);
    expect(result.edges).toBeDefined();
    expect(result.edges['api']).toContain('/users');
    expect(result.edges['assets']).toContain('/img');
  });
});

// ═══════════════════════════════════════════════════════════════
// Coexistence with Server Block
// ═══════════════════════════════════════════════════════════════

describe('edge block - coexistence', () => {
  test('edge and server blocks can coexist', () => {
    const result = compile(`
      server {
        fn hello() { "hello from server" }
        route GET "/api/hello" => hello
      }
      edge {
        fn edge_hello() { "hello from edge" }
        route GET "/api/edge" => edge_hello
      }
    `);
    expect(result.server).toContain('hello');
    expect(result.edge).toContain('edge_hello');
  });
});

// ═══════════════════════════════════════════════════════════════
// Analyzer Warnings
// ═══════════════════════════════════════════════════════════════

describe('edge block - analyzer', () => {
  test('warns on unknown config key', () => {
    const { warnings } = analyze(`edge { bogus: "value" }`);
    const w = warnings.find(w => w.code === 'W_UNKNOWN_EDGE_CONFIG');
    expect(w).toBeDefined();
  });

  test('warns on unknown target', () => {
    const { warnings } = analyze(`edge { target: "firebase" }`);
    const w = warnings.find(w => w.code === 'W_UNKNOWN_EDGE_TARGET');
    expect(w).toBeDefined();
  });

  test('no warning on valid target', () => {
    const { warnings } = analyze(`edge { target: "cloudflare" }`);
    const w = warnings.find(w => w.code === 'W_UNKNOWN_EDGE_TARGET');
    expect(w).toBeUndefined();
  });

  test('warns on duplicate binding names', () => {
    const { warnings } = analyze(`edge {
      kv CACHE
      kv CACHE
    }`);
    const w = warnings.find(w => w.code === 'W_DUPLICATE_EDGE_BINDING');
    expect(w).toBeDefined();
  });

  test('warns on duplicate env/secret names', () => {
    const { warnings } = analyze(`edge {
      env API_KEY
      secret API_KEY
    }`);
    const w = warnings.find(w => w.code === 'W_DUPLICATE_EDGE_BINDING');
    expect(w).toBeDefined();
  });

  test('warns on invalid cron expression', () => {
    const { warnings } = analyze(`edge {
      schedule "bad" cron("not a cron") {
        print("bad")
      }
    }`);
    const w = warnings.find(w => w.code === 'W_INVALID_CRON');
    expect(w).toBeDefined();
  });

  test('no warning on valid cron expression', () => {
    const { warnings } = analyze(`edge {
      schedule "good" cron("0 */6 * * *") {
        print("good")
      }
    }`);
    const w = warnings.find(w => w.code === 'W_INVALID_CRON');
    expect(w).toBeUndefined();
  });

  test('warns when edge coexists with cli', () => {
    const { warnings } = analyze(`
      edge { }
      cli { fn hello() { print("hi") } }
    `);
    const w = warnings.find(w => w.code === 'W_EDGE_WITH_CLI');
    expect(w).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Wrangler Config Generation
// ═══════════════════════════════════════════════════════════════

describe('edge block - wrangler.toml generation', () => {
  test('generates basic wrangler.toml', () => {
    // Import EdgeCodegen directly for static method testing
    const { EdgeCodegen } = require('../src/codegen/edge-codegen.js');

    const config = {
      target: 'cloudflare',
      bindings: { kv: [{ name: 'CACHE' }], sql: [{ name: 'DB' }], storage: [], queue: [] },
      envVars: [{ name: 'API_URL', defaultValue: { type: 'StringLiteral', value: 'https://api.example.com' } }],
      secrets: [],
      schedules: [{ name: 'cleanup', cron: '0 0 * * *' }],
      consumers: [],
    };

    const toml = EdgeCodegen.generateWranglerToml(config, 'my-worker');
    expect(toml).toContain('name = "my-worker"');
    expect(toml).toContain('[[kv_namespaces]]');
    expect(toml).toContain('binding = "CACHE"');
    expect(toml).toContain('[[d1_databases]]');
    expect(toml).toContain('binding = "DB"');
    expect(toml).toContain('[triggers]');
    expect(toml).toContain('crons = ["0 0 * * *"]');
    expect(toml).toContain('[vars]');
    expect(toml).toContain('API_URL = "https://api.example.com"');
  });
});

// ═══════════════════════════════════════════════════════════════
// Edge-specific Route Patterns
// ═══════════════════════════════════════════════════════════════

describe('edge block - route patterns', () => {
  test('static route', () => {
    const result = compile(`edge {
      route GET "/api/health" => fn(req) { { status: "ok" } }
    }`);
    expect(result.edge).toContain('/api/health');
  });

  test('parameterized route', () => {
    const result = compile(`edge {
      route GET "/api/users/:id/posts/:postId" => fn(req, params) { params }
    }`);
    expect(result.edge).toContain('"id"');
    expect(result.edge).toContain('"postId"');
  });

  test('wildcard route', () => {
    const result = compile(`edge {
      route GET "/files/*path" => fn(req, params) { params }
    }`);
    expect(result.edge).toContain('"path"');
    expect(result.edge).toContain('(.*)');
  });

  test('handler function reference', () => {
    const result = compile(`edge {
      fn get_data() { { data: "test" } }
      route GET "/api/data" => get_data
    }`);
    expect(result.edge).toContain('handler: get_data');
  });

  test('inline lambda handler', () => {
    const result = compile(`edge {
      route GET "/api/inline" => fn(req) { { inline: true } }
    }`);
    expect(result.edge).toContain('/api/inline');
  });

  test('multiple HTTP methods on same path', () => {
    const result = compile(`edge {
      route GET "/api/items" => fn(req) { [] }
      route POST "/api/items" => fn(req) { { created: true } }
      route DELETE "/api/items/:id" => fn(req, params) { { deleted: params.id } }
    }`);
    expect(result.edge).toContain('"GET"');
    expect(result.edge).toContain('"POST"');
    expect(result.edge).toContain('"DELETE"');
  });
});

// ═══════════════════════════════════════════════════════════════
// Output Structure
// ═══════════════════════════════════════════════════════════════

describe('edge block - output structure', () => {
  test('compile returns edge field', () => {
    const result = compile(`edge {
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(typeof result.edge).toBe('string');
    expect(result.edge.length).toBeGreaterThan(0);
  });

  test('edge does not affect server output', () => {
    const result = compile(`edge {
      route GET "/" => fn(req) { "edge" }
    }`);
    expect(result.server).toBe('');
  });

  test('edge does not affect browser output', () => {
    const result = compile(`edge {
      route GET "/" => fn(req) { "edge" }
    }`);
    expect(result.browser).toBe('');
  });

  test('default target is cloudflare', () => {
    const result = compile(`edge {
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('Cloudflare Workers target');
  });
});

// ═══════════════════════════════════════════════════════════════
// Cloudflare Binding Codegen
// ═══════════════════════════════════════════════════════════════

describe('edge block - cloudflare bindings', () => {
  test('kv binding generates let + env init', () => {
    const result = compile(`edge {
      kv CACHE
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('let CACHE;');
    expect(result.edge).toContain('CACHE = env.CACHE;');
  });

  test('sql binding generates let + env init', () => {
    const result = compile(`edge {
      sql DB
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('let DB;');
    expect(result.edge).toContain('DB = env.DB;');
  });

  test('storage binding generates let + env init', () => {
    const result = compile(`edge {
      storage UPLOADS
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('let UPLOADS;');
    expect(result.edge).toContain('UPLOADS = env.UPLOADS;');
  });

  test('queue binding generates let + env init', () => {
    const result = compile(`edge {
      queue EMAILS
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('let EMAILS;');
    expect(result.edge).toContain('EMAILS = env.EMAILS;');
  });

  test('env with default generates let + env init with ??', () => {
    const result = compile(`edge {
      env API_URL = "https://api.example.com"
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('let API_URL;');
    expect(result.edge).toContain('API_URL = env.API_URL ?? "https://api.example.com";');
  });

  test('env without default generates let + env init without ??', () => {
    const result = compile(`edge {
      env API_URL
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('let API_URL;');
    expect(result.edge).toContain('API_URL = env.API_URL;');
    expect(result.edge).not.toContain('??');
  });

  test('secret generates let + env init', () => {
    const result = compile(`edge {
      secret JWT
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('let JWT;');
    expect(result.edge).toContain('JWT = env.JWT;');
  });

  test('multiple bindings in single let declaration', () => {
    const result = compile(`edge {
      kv CACHE
      sql DB
      secret API_KEY
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('let CACHE, DB, API_KEY;');
  });

  test('bindings init in scheduled handler too', () => {
    const result = compile(`edge {
      kv CACHE
      schedule "cleanup" cron("0 0 * * *") {
        print("cleaning")
      }
      route GET "/" => fn(req) { "ok" }
    }`);
    const code = result.edge;
    // Should appear in both fetch and scheduled
    const fetchIdx = code.indexOf('async fetch(');
    const scheduledIdx = code.indexOf('async scheduled(');
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(scheduledIdx).toBeGreaterThan(-1);
    // Both handlers init CACHE
    const afterFetch = code.slice(fetchIdx, scheduledIdx);
    const afterScheduled = code.slice(scheduledIdx);
    expect(afterFetch).toContain('CACHE = env.CACHE;');
    expect(afterScheduled).toContain('CACHE = env.CACHE;');
  });

  test('bindings init in queue handler too', () => {
    const result = compile(`edge {
      kv CACHE
      consume EMAILS fn(messages) { print("processing") }
      route GET "/" => fn(req) { "ok" }
    }`);
    const code = result.edge;
    const queueIdx = code.indexOf('async queue(');
    expect(queueIdx).toBeGreaterThan(-1);
    const afterQueue = code.slice(queueIdx);
    expect(afterQueue).toContain('CACHE = env.CACHE;');
  });
});

// ═══════════════════════════════════════════════════════════════
// Deno Binding Codegen
// ═══════════════════════════════════════════════════════════════

describe('edge block - deno bindings', () => {
  test('multiple kv bindings share same store', () => {
    const result = compile(`edge {
      target: "deno"
      kv CACHE
      kv SESSIONS
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('const CACHE = await Deno.openKv()');
    expect(result.edge).toContain('const SESSIONS = CACHE;');
  });

  test('env generates Deno.env.get', () => {
    const result = compile(`edge {
      target: "deno"
      env API_URL = "https://api.example.com"
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('const API_URL = Deno.env.get("API_URL") ?? "https://api.example.com";');
  });

  test('secret generates Deno.env.get', () => {
    const result = compile(`edge {
      target: "deno"
      secret JWT
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('const JWT = Deno.env.get("JWT");');
  });

  test('sql binding stubs to null on Deno', () => {
    const result = compile(`edge {
      target: "deno"
      sql DB
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('const DB = null;');
    expect(result.edge).toContain('SQL not natively supported');
  });

  test('storage binding stubs to null on Deno', () => {
    const result = compile(`edge {
      target: "deno"
      storage UPLOADS
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('const UPLOADS = null;');
  });

  test('queue binding stubs to null on Deno', () => {
    const result = compile(`edge {
      target: "deno"
      queue EMAILS
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('const EMAILS = null;');
  });
});

// ═══════════════════════════════════════════════════════════════
// Vercel / Lambda Binding Codegen
// ═══════════════════════════════════════════════════════════════

describe('edge block - vercel/lambda bindings', () => {
  test('vercel env generates process.env', () => {
    const result = compile(`edge {
      target: "vercel"
      env API_URL = "https://api.example.com"
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('const API_URL = process.env.API_URL ?? "https://api.example.com";');
  });

  test('vercel secret generates process.env', () => {
    const result = compile(`edge {
      target: "vercel"
      secret JWT
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('const JWT = process.env.JWT;');
  });

  test('vercel kv stubs to null', () => {
    const result = compile(`edge {
      target: "vercel"
      kv CACHE
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('const CACHE = null;');
    expect(result.edge).toContain('KV not supported on Vercel Edge');
  });

  test('lambda env generates process.env', () => {
    const result = compile(`edge {
      target: "lambda"
      env NODE_ENV = "production"
      secret DB_URL
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('const NODE_ENV = process.env.NODE_ENV ?? "production";');
    expect(result.edge).toContain('const DB_URL = process.env.DB_URL;');
  });
});

// ═══════════════════════════════════════════════════════════════
// Bun Binding Codegen
// ═══════════════════════════════════════════════════════════════

describe('edge block - bun bindings', () => {
  test('bun sql generates bun:sqlite import', () => {
    const result = compile(`edge {
      target: "bun"
      sql DB
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('import { Database } from "bun:sqlite";');
    expect(result.edge).toContain('const DB = new Database("DB.sqlite");');
  });

  test('bun env generates process.env', () => {
    const result = compile(`edge {
      target: "bun"
      env API_URL = "http://localhost:3000"
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('const API_URL = process.env.API_URL ?? "http://localhost:3000";');
  });

  test('bun kv stubs to null', () => {
    const result = compile(`edge {
      target: "bun"
      kv CACHE
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('const CACHE = null;');
  });

  test('bun storage stubs to null', () => {
    const result = compile(`edge {
      target: "bun"
      storage UPLOADS
      route GET "/" => fn(req) { "ok" }
    }`);
    expect(result.edge).toContain('const UPLOADS = null;');
  });
});

// ═══════════════════════════════════════════════════════════════
// Analyzer: Unsupported Binding Warnings
// ═══════════════════════════════════════════════════════════════

describe('edge block - unsupported binding warnings', () => {
  test('warns on KV for vercel target', () => {
    const { warnings } = analyze(`edge { target: "vercel" kv CACHE }`);
    const w = warnings.find(w => w.code === 'W_UNSUPPORTED_KV');
    expect(w).toBeDefined();
    expect(w.message).toContain('vercel');
  });

  test('warns on SQL for deno target', () => {
    const { warnings } = analyze(`edge { target: "deno" sql DB }`);
    const w = warnings.find(w => w.code === 'W_UNSUPPORTED_SQL');
    expect(w).toBeDefined();
    expect(w.message).toContain('deno');
  });

  test('warns on storage for lambda target', () => {
    const { warnings } = analyze(`edge { target: "lambda" storage UPLOADS }`);
    const w = warnings.find(w => w.code === 'W_UNSUPPORTED_STORAGE');
    expect(w).toBeDefined();
    expect(w.message).toContain('lambda');
  });

  test('warns on queue for bun target', () => {
    const { warnings } = analyze(`edge { target: "bun" queue EMAILS }`);
    const w = warnings.find(w => w.code === 'W_UNSUPPORTED_QUEUE');
    expect(w).toBeDefined();
    expect(w.message).toContain('bun');
  });

  test('no warning for KV on cloudflare', () => {
    const { warnings } = analyze(`edge { target: "cloudflare" kv CACHE }`);
    const w = warnings.find(w => w.code === 'W_UNSUPPORTED_KV');
    expect(w).toBeUndefined();
  });

  test('no warning for SQL on bun', () => {
    const { warnings } = analyze(`edge { target: "bun" sql DB }`);
    const w = warnings.find(w => w.code === 'W_UNSUPPORTED_SQL');
    expect(w).toBeUndefined();
  });

  test('warns on multi-KV for deno target', () => {
    const { warnings } = analyze(`edge { target: "deno" kv CACHE kv SESSIONS }`);
    const w = warnings.find(w => w.code === 'W_DENO_MULTI_KV');
    expect(w).toBeDefined();
    expect(w.message).toContain('SESSIONS');
  });

  test('no multi-KV warning on cloudflare', () => {
    const { warnings } = analyze(`edge { target: "cloudflare" kv CACHE kv SESSIONS }`);
    const w = warnings.find(w => w.code === 'W_DENO_MULTI_KV');
    expect(w).toBeUndefined();
  });
});
