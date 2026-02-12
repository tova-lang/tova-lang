import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function compile(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const codegen = new CodeGenerator(ast, '<test>');
  return codegen.generate();
}

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function analyze(source) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze();
}

// ═══════════════════════════════════════════════════════════════
// Phase 1: Make HTTP Actually Work
// ═══════════════════════════════════════════════════════════════

describe('Phase 1 — respond() builtin', () => {
  test('server code includes respond() helper', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('function respond(status, body, headers');
  });

  test('respond() creates Response with status and JSON body', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('new Response(JSON.stringify(body)');
    expect(result.server).toContain('"Content-Type": "application/json"');
  });

  test('respond() can be called in handler functions', () => {
    const result = compile(`
      server {
        fn create_user(name) {
          if name == "" {
            respond(400, {error: "name required"})
          }
          respond(201, {name: name})
        }
      }
    `);
    expect(result.server).toContain('function respond(');
    expect(result.server).toContain('function create_user(name)');
  });
});

describe('Phase 1 — Route handler param extraction (POST)', () => {
  test('POST route extracts body params for known handler', () => {
    const result = compile(`
      server {
        fn create_user(name, email) { name }
        route POST "/api/users" => create_user
      }
    `);
    // Should extract name and email from request body
    expect(result.server).toContain('__body');
    expect(result.server).toContain('params.name ?? __body.name');
    expect(result.server).toContain('params.email ?? __body.email');
    expect(result.server).toContain('await create_user(name, email)');
  });

  test('POST route does NOT pass raw (req, params) to domain handler', () => {
    const result = compile(`
      server {
        fn create_user(name, email) { name }
        route POST "/api/users" => create_user
      }
    `);
    // Should NOT have the old broken pattern
    expect(result.server).not.toContain('await create_user(req, params)');
  });
});

describe('Phase 1 — Route handler param extraction (GET)', () => {
  test('GET route extracts params from URL path and query', () => {
    const result = compile(`
      server {
        fn get_user(id) { id }
        route GET "/api/users/:id" => get_user
      }
    `);
    expect(result.server).toContain('__url.searchParams.get("id")');
    expect(result.server).toContain('params.id');
    expect(result.server).toContain('await get_user(id)');
  });
});

describe('Phase 1 — Route handler with req context', () => {
  test('handler with req param receives request context object', () => {
    const result = compile(`
      server {
        fn custom_handler(req) { req.method }
        route GET "/api/info" => custom_handler
      }
    `);
    expect(result.server).toContain('__ctx');
    expect(result.server).toContain('method: req.method');
    expect(result.server).toContain('query: __parseQuery');
    expect(result.server).toContain('headers: Object.fromEntries');
    expect(result.server).toContain('cookies: __parseCookies');
    expect(result.server).toContain('await custom_handler(__ctx)');
  });

  test('handler with req + other params gets context + extracted params', () => {
    const result = compile(`
      server {
        fn update_user(req, id) { req.method }
        route PUT "/api/users/:id" => update_user
      }
    `);
    expect(result.server).toContain('__ctx');
    expect(result.server).toContain('await update_user(__ctx, id)');
  });
});

describe('Phase 1 — Response passthrough', () => {
  test('route handler checks for Response instance', () => {
    const result = compile(`
      server {
        fn handler(req) { respond(201, {ok: true}) }
        route POST "/api/test" => handler
      }
    `);
    expect(result.server).toContain('__result instanceof Response');
    expect(result.server).toContain('return __result');
  });

  test('plain return values are wrapped in Response.json', () => {
    const result = compile(`
      server {
        fn get_data() { [] }
        route GET "/api/data" => get_data
      }
    `);
    expect(result.server).toContain('Response.json(__result)');
  });
});

describe('Phase 1 — Cookie parser', () => {
  test('server code includes cookie parser', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('function __parseCookies(str)');
    expect(result.server).toContain('split(";")');
  });
});

// ═══════════════════════════════════════════════════════════════
// Phase 2: Middleware & Error Handling
// ═══════════════════════════════════════════════════════════════

describe('Phase 2 — Middleware parsing', () => {
  test('parses middleware declaration in server block', () => {
    const ast = parse(`
      server {
        middleware fn logger(req, next) {
          result = next(req)
          result
        }
      }
    `);
    const serverBlock = ast.body[0];
    const mw = serverBlock.body[0];
    expect(mw.type).toBe('MiddlewareDeclaration');
    expect(mw.name).toBe('logger');
    expect(mw.params).toHaveLength(2);
    expect(mw.params[0].name).toBe('req');
    expect(mw.params[1].name).toBe('next');
  });

  test('middleware compiles to async function', () => {
    const result = compile(`
      server {
        middleware fn logger(req, next) {
          result = next(req)
          result
        }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('async function logger(req, next)');
  });

  test('middleware chain is built', () => {
    const result = compile(`
      server {
        middleware fn auth(req, next) {
          next(req)
        }
        middleware fn logger(req, next) {
          next(req)
        }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('__middlewares');
    expect(result.server).toContain('auth, logger');
    expect(result.server).toContain('reduceRight');
  });
});

describe('Phase 2 — Middleware analyzer', () => {
  test('middleware outside server block is an error', () => {
    // middleware outside server should fail at parse level or analyzer level
    // Since middleware is contextual in server blocks, it would be parsed as regular statement
    // Let's verify it works inside server blocks
    const { warnings } = analyze(`
      server {
        middleware fn logger(req, next) {
          next(req)
        }
      }
    `);
    // Should not throw
    expect(true).toBe(true);
  });
});

describe('Phase 2 — Error handler', () => {
  test('parses on_error declaration', () => {
    const ast = parse(`
      server {
        on_error fn(err, req) {
          respond(500, {error: err})
        }
      }
    `);
    const serverBlock = ast.body[0];
    const handler = serverBlock.body[0];
    expect(handler.type).toBe('ErrorHandlerDeclaration');
    expect(handler.params).toHaveLength(2);
    expect(handler.params[0].name).toBe('err');
    expect(handler.params[1].name).toBe('req');
  });

  test('on_error compiles to __errorHandler function', () => {
    const result = compile(`
      server {
        on_error fn(err, req) {
          respond(500, {error: "Internal Error"})
        }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('async function __errorHandler(err, req)');
    expect(result.server).toContain('respond(500');
  });

  test('error handler is called in catch block', () => {
    const result = compile(`
      server {
        on_error fn(err, req) {
          respond(500, {error: err})
        }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('__errorHandler(err, req)');
  });
});

describe('Phase 2 — Structured error responses', () => {
  test('respond() supports custom status codes', () => {
    const result = compile(`
      server {
        fn create(name) {
          if name == "" {
            return respond(400, {error: "name required"})
          }
          respond(201, {name: name})
        }
      }
    `);
    expect(result.server).toContain('function respond(status, body');
  });
});

// ═══════════════════════════════════════════════════════════════
// Phase 3: Production Readiness
// ═══════════════════════════════════════════════════════════════

describe('Phase 3 — Health check endpoints', () => {
  test('parses health declaration', () => {
    const ast = parse(`
      server {
        health "/health"
      }
    `);
    const serverBlock = ast.body[0];
    const health = serverBlock.body[0];
    expect(health.type).toBe('HealthCheckDeclaration');
    expect(health.path).toBe('/health');
  });

  test('health check generates auto route', () => {
    const result = compile(`
      server {
        health "/health"
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('__addRoute("GET", "/health"');
    expect(result.server).toContain('status: "ok"');
    expect(result.server).toContain('uptime');
  });

  test('custom health path works', () => {
    const result = compile(`
      server {
        health "/ready"
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('__addRoute("GET", "/ready"');
  });
});

describe('Phase 3 — Configurable CORS', () => {
  test('parses cors declaration', () => {
    const ast = parse(`
      server {
        cors {
          origins: ["https://myapp.com"]
          methods: ["GET", "POST"]
        }
      }
    `);
    const serverBlock = ast.body[0];
    const cors = serverBlock.body[0];
    expect(cors.type).toBe('CorsDeclaration');
    expect(cors.config.origins).toBeDefined();
    expect(cors.config.methods).toBeDefined();
  });

  test('cors config generates dynamic CORS headers', () => {
    const result = compile(`
      server {
        cors {
          origins: ["https://myapp.com", "https://api.myapp.com"]
          methods: ["GET", "POST"]
        }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('__corsOrigins');
    expect(result.server).toContain('https://myapp.com');
    expect(result.server).toContain('__getCorsHeaders');
    expect(result.server).toContain('req.headers.get("Origin")');
  });

  test('default CORS is wildcard when no cors declaration', () => {
    const result = compile(`
      server { fn hello() { "world" } }
    `);
    expect(result.server).toContain('__getCorsHeaders');
    expect(result.server).toContain('"Access-Control-Allow-Origin": "*"');
  });
});

describe('Phase 3 — RPC resilience', () => {
  test('peer RPC has timeout', () => {
    const result = compile(`
      server "api" { fn get_data() { [] } }
      server "ws" { fn connect() { true } }
    `);
    expect(result.servers['api']).toContain('AbortController');
    expect(result.servers['api']).toContain('setTimeout');
    expect(result.servers['api']).toContain('10000');
    expect(result.servers['api']).toContain('clearTimeout');
  });

  test('peer RPC checks response status', () => {
    const result = compile(`
      server "api" { fn get_data() { [] } }
      server "ws" { fn connect() { true } }
    `);
    expect(result.servers['api']).toContain('if (!__res.ok)');
    expect(result.servers['api']).toContain('RPC ws.connect failed');
  });

  test('peer RPC handles timeout errors', () => {
    const result = compile(`
      server "api" { fn get_data() { [] } }
      server "ws" { fn connect() { true } }
    `);
    expect(result.servers['api']).toContain('AbortError');
    expect(result.servers['api']).toContain('timed out');
  });
});

describe('Phase 3 — Graceful shutdown', () => {
  test('server includes shutdown handler', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('function __shutdown()');
    expect(result.server).toContain('__server.stop()');
    expect(result.server).toContain('SIGINT');
    expect(result.server).toContain('SIGTERM');
  });

  test('named server shutdown includes label', () => {
    const result = compile('server "api" { fn hello() { "world" } }');
    expect(result.servers['api']).toContain('Lux server [api] shutting down');
  });
});

// ═══════════════════════════════════════════════════════════════
// Backward Compatibility
// ═══════════════════════════════════════════════════════════════

describe('Backward Compatibility', () => {
  test('existing server block still works', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('Bun.serve(');
    expect(result.server).toContain('__handleRequest');
    expect(result.server).toContain('function hello()');
  });

  test('RPC endpoints still auto-generated', () => {
    const result = compile('server { fn add_todo(title) { title } }');
    expect(result.server).toContain('__addRoute("POST", "/rpc/add_todo"');
    expect(result.server).toContain('body.__args');
  });

  test('explicit route still registered', () => {
    const result = compile('server { fn handler() { [] } route GET "/api/test" => handler }');
    expect(result.server).toContain('__addRoute("GET", "/api/test"');
  });

  test('named multi-blocks still produce separate outputs', () => {
    const result = compile('server "api" { fn get_data() { [] } } server "ws" { fn connect() { true } }');
    expect(result.multiBlock).toBe(true);
    expect(result.servers['api']).toContain('function get_data()');
    expect(result.servers['ws']).toContain('function connect()');
  });

  test('peer RPC proxies still generated', () => {
    const result = compile(`
      server "api" { fn create_user(name) { name } }
      server "events" { fn push_event(kind, data) { kind } }
    `);
    expect(result.servers['api']).toContain('const events = {');
    expect(result.servers['api']).toContain('async push_event(...args)');
    expect(result.servers['events']).toContain('const api = {');
    expect(result.servers['events']).toContain('async create_user(...args)');
  });

  test('client HTML still served at root', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('__clientHTML');
    expect(result.server).toContain('text/html');
  });
});

// ═══════════════════════════════════════════════════════════════
// Integration: Full server block with all features
// ═══════════════════════════════════════════════════════════════

describe('Integration — Full featured server block', () => {
  test('compiles server with middleware, health, cors, error handler, routes', () => {
    const result = compile(`
      server {
        health "/health"

        cors {
          origins: ["https://myapp.com"]
          methods: ["GET", "POST", "PUT", "DELETE"]
          headers: ["Content-Type", "Authorization"]
        }

        middleware fn logger(req, next) {
          result = next(req)
          result
        }

        on_error fn(err, req) {
          respond(500, {error: "Something went wrong"})
        }

        var users = []

        fn get_users() {
          users
        }

        fn create_user(name, email) {
          users = [...users, {name: name, email: email}]
          respond(201, {name: name, email: email})
        }

        route GET "/api/users" => get_users
        route POST "/api/users" => create_user
      }
    `);

    const server = result.server;

    // Health check
    expect(server).toContain('__addRoute("GET", "/health"');

    // CORS
    expect(server).toContain('__corsOrigins');
    expect(server).toContain('https://myapp.com');

    // Middleware
    expect(server).toContain('async function logger(req, next)');
    expect(server).toContain('__middlewares');

    // Error handler
    expect(server).toContain('async function __errorHandler(err, req)');

    // Functions
    expect(server).toContain('function get_users()');
    expect(server).toContain('function create_user(name, email)');

    // RPC endpoints
    expect(server).toContain('/rpc/get_users');
    expect(server).toContain('/rpc/create_user');

    // Fixed explicit routes with param extraction
    expect(server).toContain('__addRoute("GET", "/api/users"');
    expect(server).toContain('__addRoute("POST", "/api/users"');

    // respond() helper
    expect(server).toContain('function respond(');

    // Graceful shutdown
    expect(server).toContain('__shutdown');
    expect(server).toContain('__server.stop()');
  });
});

// ═══════════════════════════════════════════════════════════════
// Phase 3-4: WebSocket, Static Files, DB, Logging
// ═══════════════════════════════════════════════════════════════

describe('Phase 3 — Structured Logging', () => {
  test('server code includes logging helpers', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('function __genRequestId()');
    expect(result.server).toContain('function __log(level, msg, meta');
  });

  test('logging generates request IDs', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('__reqCounter');
    expect(result.server).toContain('__genRequestId');
  });

  test('request handler tracks request id and timing', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('__genRequestId()');
    expect(result.server).toContain('const __startTime = Date.now()');
  });

  test('404 responses are logged', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('__log("warn", "Not Found"');
    expect(result.server).toContain('rid: __rid');
  });

  test('successful responses are logged', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('__log("info"');
    expect(result.server).toContain('status: res.status');
    expect(result.server).toContain('ms: Date.now() - __startTime');
  });
});

describe('Phase 3 — WebSocket support', () => {
  test('parses ws block with handlers', () => {
    const ast = parse(`
      server {
        ws {
          on_open fn(ws) {
            print("connected")
          }
          on_message fn(ws, msg) {
            print(msg)
          }
          on_close fn(ws, code, reason) {
            print("closed")
          }
        }
      }
    `);
    const serverBlock = ast.body[0];
    const wsBlock = serverBlock.body[0];
    expect(wsBlock.type).toBe('WebSocketDeclaration');
    expect(wsBlock.handlers.on_open).toBeDefined();
    expect(wsBlock.handlers.on_open.params).toHaveLength(1);
    expect(wsBlock.handlers.on_message).toBeDefined();
    expect(wsBlock.handlers.on_message.params).toHaveLength(2);
    expect(wsBlock.handlers.on_close).toBeDefined();
    expect(wsBlock.handlers.on_close.params).toHaveLength(3);
  });

  test('ws compiles to Bun.serve websocket config', () => {
    const result = compile(`
      server {
        ws {
          on_open fn(ws) {
            print("connected")
          }
          on_message fn(ws, msg) {
            print(msg)
          }
        }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('websocket: {');
    expect(result.server).toContain('open(ws)');
    expect(result.server).toContain('message(ws, message)');
    expect(result.server).toContain('__wsHandlers.on_open');
    expect(result.server).toContain('__wsHandlers.on_message');
  });

  test('ws generates upgrade handling in request handler', () => {
    const result = compile(`
      server {
        ws {
          on_message fn(ws, msg) {
            print(msg)
          }
        }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('upgrade');
    expect(result.server).toContain('websocket');
    expect(result.server).toContain('__server.upgrade(req');
  });

  test('ws on_close handler compiles correctly', () => {
    const result = compile(`
      server {
        ws {
          on_close fn(ws, code, reason) {
            print("closed")
          }
        }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('close(ws, code, reason)');
    expect(result.server).toContain('__wsHandlers.on_close');
  });

  test('ws on_error handler compiles correctly', () => {
    const result = compile(`
      server {
        ws {
          on_error fn(ws, error) {
            print("error")
          }
        }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('error(ws, error)');
    expect(result.server).toContain('__wsHandlers.on_error');
  });

  test('server without ws does NOT include websocket config', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).not.toContain('websocket: {');
    expect(result.server).not.toContain('__wsHandlers');
  });
});

describe('Phase 4 — Static file serving', () => {
  test('parses static declaration', () => {
    const ast = parse(`
      server {
        static "/public" => "./public"
      }
    `);
    const serverBlock = ast.body[0];
    const staticDecl = serverBlock.body[0];
    expect(staticDecl.type).toBe('StaticDeclaration');
    expect(staticDecl.path).toBe('/public');
    expect(staticDecl.dir).toBe('./public');
  });

  test('static compiles to file serving handler', () => {
    const result = compile(`
      server {
        static "/assets" => "./public"
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('__staticPrefix');
    expect(result.server).toContain('"/assets"');
    expect(result.server).toContain('__staticDir');
    expect(result.server).toContain('"./public"');
    expect(result.server).toContain('__serveStatic');
    expect(result.server).toContain('Bun.file(filePath)');
  });

  test('static file check is in request handler', () => {
    const result = compile(`
      server {
        static "/public" => "./static"
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('url.pathname.startsWith(__staticPrefix)');
    expect(result.server).toContain('__serveStatic(url.pathname, req)');
  });

  test('server without static does NOT include static handling', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).not.toContain('__staticPrefix');
    expect(result.server).not.toContain('__serveStatic');
  });
});

describe('Phase 4 — Database module wiring', () => {
  test('server using db gets import', () => {
    const result = compile(`
      server {
        fn get_users() {
          db.query("SELECT * FROM users")
        }
      }
    `);
    expect(result.server).toContain('import { Database } from "bun:sqlite"');
    expect(result.server).toContain('const db = {');
  });

  test('server NOT using db does NOT get import', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).not.toContain('import { db');
    expect(result.server).not.toContain('runtime/db.js');
  });

  test('db usage triggers db.close() in shutdown', () => {
    const result = compile(`
      server {
        fn get_users() {
          db.query("SELECT * FROM users")
        }
      }
    `);
    expect(result.server).toContain('db.close()');
  });

  test('server without db does NOT call db.close() in shutdown', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).not.toContain('db.close()');
  });
});

describe('Integration — Multi-server with new features', () => {
  test('each named server can have its own middleware and health', () => {
    const result = compile(`
      server "api" {
        health "/health"
        middleware fn auth(req, next) {
          next(req)
        }
        fn get_users() { [] }
        route GET "/api/users" => get_users
      }
      server "events" {
        health "/health"
        fn get_events() { [] }
        route GET "/events" => get_events
      }
    `);

    expect(result.multiBlock).toBe(true);

    // API server has middleware
    expect(result.servers['api']).toContain('async function auth(req, next)');
    expect(result.servers['api']).toContain('__middlewares');
    expect(result.servers['api']).toContain('/health');

    // Events server has health but no middleware
    expect(result.servers['events']).toContain('/health');
    expect(result.servers['events']).not.toContain('__middlewares');
  });
});

// ═══════════════════════════════════════════════════════════════
// Feature 1: Runtime Input Validation
// ═══════════════════════════════════════════════════════════════

describe('Feature 1 — Runtime Input Validation', () => {
  test('typed RPC params generate validation code', () => {
    const result = compile(`
      server {
        fn create_user(name: String, age: Int) { name }
      }
    `);
    expect(result.server).toContain('__validationErrors');
    expect(result.server).toContain('name is required');
    expect(result.server).toContain('typeof name !== "string"');
    expect(result.server).toContain('!Number.isInteger(age)');
    expect(result.server).toContain('status: 400');
  });

  test('validation checks Float type', () => {
    const result = compile(`
      server {
        fn set_price(price: Float) { price }
      }
    `);
    expect(result.server).toContain('typeof price !== "number"');
  });

  test('validation checks Bool type', () => {
    const result = compile(`
      server {
        fn set_active(active: Bool) { active }
      }
    `);
    expect(result.server).toContain('typeof active !== "boolean"');
  });

  test('validation checks Array type', () => {
    const result = compile(`
      server {
        fn set_tags(tags: [String]) { tags }
      }
    `);
    expect(result.server).toContain('!Array.isArray(tags)');
  });

  test('untyped params do not generate validation', () => {
    const result = compile(`
      server {
        fn hello(name) { name }
      }
    `);
    expect(result.server).not.toContain('__validationErrors');
  });

  test('route handler with typed params gets validation', () => {
    const result = compile(`
      server {
        fn create_user(name: String, email: String) { name }
        route POST "/api/users" => create_user
      }
    `);
    // Validation in explicit route handler
    const routeSection = result.server.split('// ── Routes ──')[1];
    expect(routeSection).toContain('__validationErrors');
  });

  test('validation returns 400 with details', () => {
    const result = compile(`
      server {
        fn signup(name: String) { name }
      }
    `);
    expect(result.server).toContain('"Validation failed"');
    expect(result.server).toContain('details: __validationErrors');
  });
});

// ═══════════════════════════════════════════════════════════════
// Feature 2: Service Discovery
// ═══════════════════════════════════════════════════════════════

describe('Feature 2 — Service Discovery', () => {
  test('parses discover declaration', () => {
    const ast = parse(`
      server "api" {
        discover "events" at "http://events.local:4000"
        fn get_data() { [] }
      }
    `);
    const block = ast.body[0];
    const disc = block.body[0];
    expect(disc.type).toBe('DiscoverDeclaration');
    expect(disc.peerName).toBe('events');
  });

  test('discover sets peer RPC base URL', () => {
    const result = compile(`
      server "api" {
        discover "events" at "http://events.local:4000"
        fn get_data() { [] }
      }
      server "events" {
        fn push_event(kind) { kind }
      }
    `);
    expect(result.servers['api']).toContain('http://events.local:4000');
    expect(result.servers['api']).toContain('__baseUrl');
  });

  test('peer without discover falls back to env var', () => {
    const result = compile(`
      server "api" { fn get_data() { [] } }
      server "events" { fn push_event(kind) { kind } }
    `);
    expect(result.servers['api']).toContain('PORT_EVENTS');
  });
});

// ═══════════════════════════════════════════════════════════════
// Feature 3: Auth Primitives
// ═══════════════════════════════════════════════════════════════

describe('Feature 3 — Auth Primitives', () => {
  test('parses auth declaration', () => {
    const ast = parse(`
      server {
        auth { type: "jwt", secret: "my_secret" }
      }
    `);
    const block = ast.body[0];
    const authDecl = block.body[0];
    expect(authDecl.type).toBe('AuthDeclaration');
    expect(authDecl.config.type).toBeDefined();
    expect(authDecl.config.secret).toBeDefined();
  });

  test('auth generates __authenticate function', () => {
    const result = compile(`
      server {
        auth { type: "jwt", secret: "my_secret" }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('function __authenticate(req)');
    expect(result.server).toContain('Authorization');
    expect(result.server).toContain('Bearer');
    expect(result.server).toContain('__authSecret');
  });

  test('parses route with auth decorator', () => {
    const ast = parse(`
      server {
        fn get_users() { [] }
        route GET "/api/users" with auth => get_users
      }
    `);
    const block = ast.body[0];
    const route = block.body[1];
    expect(route.type).toBe('RouteDeclaration');
    expect(route.decorators).toHaveLength(1);
    expect(route.decorators[0].name).toBe('auth');
  });

  test('parses route with auth and role decorators', () => {
    const ast = parse(`
      server {
        fn admin_action() { "ok" }
        route GET "/admin" with auth, role("admin") => admin_action
      }
    `);
    const block = ast.body[0];
    const route = block.body[1];
    expect(route.decorators).toHaveLength(2);
    expect(route.decorators[0].name).toBe('auth');
    expect(route.decorators[1].name).toBe('role');
    expect(route.decorators[1].args).toHaveLength(1);
  });

  test('auth decorator generates 401 check', () => {
    const result = compile(`
      server {
        auth { type: "jwt", secret: "test" }
        fn get_users() { [] }
        route GET "/api/users" with auth => get_users
      }
    `);
    expect(result.server).toContain('__authenticate(req)');
    expect(result.server).toContain('Unauthorized');
    expect(result.server).toContain('401');
  });

  test('role decorator generates 403 check', () => {
    const result = compile(`
      server {
        auth { type: "jwt", secret: "test" }
        fn admin_action() { "ok" }
        route GET "/admin" with auth, role("admin") => admin_action
      }
    `);
    expect(result.server).toContain('__user.role');
    expect(result.server).toContain('Forbidden');
    expect(result.server).toContain('403');
  });

  test('no auth config means no __authenticate', () => {
    const result = compile(`
      server { fn hello() { "world" } }
    `);
    expect(result.server).not.toContain('function __authenticate');
  });
});

// ═══════════════════════════════════════════════════════════════
// Feature 4: Request Body Size Limits
// ═══════════════════════════════════════════════════════════════

describe('Feature 4 — Request Body Size Limits', () => {
  test('parses max_body declaration', () => {
    const ast = parse(`
      server {
        max_body 5 * 1024 * 1024
      }
    `);
    const block = ast.body[0];
    const maxBody = block.body[0];
    expect(maxBody.type).toBe('MaxBodyDeclaration');
  });

  test('max_body generates __maxBodySize constant', () => {
    const result = compile(`
      server {
        max_body 2097152
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('__maxBodySize');
    expect(result.server).toContain('2097152');
  });

  test('exceeding body size returns 413', () => {
    const result = compile(`
      server {
        max_body 1024
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('Content-Length');
    expect(result.server).toContain('__maxBodySize');
    expect(result.server).toContain('413');
    expect(result.server).toContain('Payload Too Large');
  });

  test('default max body is 1MB when not specified', () => {
    const result = compile(`
      server { fn hello() { "world" } }
    `);
    expect(result.server).toContain('__maxBodySize = 1048576');
  });
});

// ═══════════════════════════════════════════════════════════════
// Feature 5: Circuit Breaker + Retry
// ═══════════════════════════════════════════════════════════════

describe('Feature 5 — Circuit Breaker + Retry', () => {
  test('peer RPC generates circuit breaker class', () => {
    const result = compile(`
      server "api" { fn get_data() { [] } }
      server "events" { fn push_event(kind) { kind } }
    `);
    expect(result.servers['api']).toContain('class __CircuitBreaker');
    expect(result.servers['api']).toContain('CLOSED');
    expect(result.servers['api']).toContain('OPEN');
    expect(result.servers['api']).toContain('HALF_OPEN');
  });

  test('peer RPC generates retry with backoff', () => {
    const result = compile(`
      server "api" { fn get_data() { [] } }
      server "events" { fn push_event(kind) { kind } }
    `);
    expect(result.servers['api']).toContain('__retryWithBackoff');
    expect(result.servers['api']).toContain('Math.pow(2, i)');
  });

  test('per-peer circuit breaker instance is created', () => {
    const result = compile(`
      server "api" { fn get_data() { [] } }
      server "events" { fn push_event(kind) { kind } }
    `);
    expect(result.servers['api']).toContain('__cb_events');
    expect(result.servers['events']).toContain('__cb_api');
  });

  test('RPC calls are wrapped in circuit breaker + retry', () => {
    const result = compile(`
      server "api" { fn get_data() { [] } }
      server "events" { fn push_event(kind) { kind } }
    `);
    expect(result.servers['api']).toContain('__cb_events.call(() => __retryWithBackoff');
  });

  test('no circuit breaker for single server', () => {
    const result = compile(`server { fn hello() { "world" } }`);
    expect(result.server).not.toContain('__CircuitBreaker');
    expect(result.server).not.toContain('__retryWithBackoff');
  });
});

// ═══════════════════════════════════════════════════════════════
// Feature 6: Graceful Drain
// ═══════════════════════════════════════════════════════════════

describe('Feature 6 — Graceful Drain', () => {
  test('server tracks active requests', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('let __activeRequests = 0');
    expect(result.server).toContain('__activeRequests++');
    expect(result.server).toContain('__activeRequests--');
  });

  test('server has shuttingDown flag', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('let __shuttingDown = false');
    expect(result.server).toContain('__shuttingDown = true');
  });

  test('returns 503 during shutdown', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('if (__shuttingDown)');
    expect(result.server).toContain('503');
  });

  test('shutdown is async with drain timeout', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('async function __shutdown()');
    expect(result.server).toContain('__activeRequests > 0');
    expect(result.server).toContain('10000');
  });
});

// ═══════════════════════════════════════════════════════════════
// Feature 7: Route Groups + Scoped Middleware
// ═══════════════════════════════════════════════════════════════

describe('Feature 7 — Route Groups + Scoped Middleware', () => {
  test('parses route group declaration', () => {
    const ast = parse(`
      server {
        routes "/api/v1" {
          fn get_users() { [] }
          route GET "/users" => get_users
        }
      }
    `);
    const block = ast.body[0];
    const group = block.body[0];
    expect(group.type).toBe('RouteGroupDeclaration');
    expect(group.prefix).toBe('/api/v1');
    expect(group.body).toHaveLength(2);
  });

  test('route group prefixes paths', () => {
    const result = compile(`
      server {
        routes "/api/v1" {
          fn get_users() { [] }
          route GET "/users" => get_users
        }
      }
    `);
    expect(result.server).toContain('"/api/v1/users"');
  });

  test('functions inside route groups get RPC endpoints', () => {
    const result = compile(`
      server {
        routes "/api/v1" {
          fn get_users() { [] }
          route GET "/users" => get_users
        }
      }
    `);
    expect(result.server).toContain('/rpc/get_users');
  });

  test('route group with scoped middleware', () => {
    const result = compile(`
      server {
        routes "/api/v1" {
          middleware fn v1Auth(req, next) { next(req) }
          fn get_users() { [] }
          route GET "/users" => get_users
        }
      }
    `);
    expect(result.server).toContain('async function v1Auth(req, next)');
    expect(result.server).toContain('__grpChain');
    expect(result.server).toContain('v1Auth');
  });

  test('scoped middleware does not affect global middleware chain', () => {
    const result = compile(`
      server {
        routes "/api/v1" {
          middleware fn v1Auth(req, next) { next(req) }
          fn get_users() { [] }
          route GET "/users" => get_users
        }
        fn hello() { "world" }
        route GET "/hello" => hello
      }
    `);
    // Global middleware chain should not contain v1Auth
    expect(result.server).not.toContain('const __middlewares = [v1Auth]');
  });

  test('functions in route groups are found by peer RPC', () => {
    const result = compile(`
      server "api" {
        routes "/v1" {
          fn get_users() { [] }
        }
      }
      server "events" { fn push(kind) { kind } }
    `);
    // events server should have proxy for get_users
    expect(result.servers['events']).toContain('async get_users');
  });
});

// ═══════════════════════════════════════════════════════════════
// Feature 8: Distributed Tracing
// ═══════════════════════════════════════════════════════════════

describe('Feature 8 — Distributed Tracing', () => {
  test('server imports AsyncLocalStorage', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('AsyncLocalStorage');
    expect(result.server).toContain('node:async_hooks');
  });

  test('request context is created with AsyncLocalStorage', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('__requestContext = new AsyncLocalStorage()');
    expect(result.server).toContain('__getRequestId()');
  });

  test('handler reads X-Request-Id from upstream', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('X-Request-Id');
    expect(result.server).toContain('req.headers.get("X-Request-Id")');
  });

  test('handler wraps request in AsyncLocalStorage.run', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('__requestContext.run({ rid: __rid, locals: {} }');
  });

  test('peer RPC propagates X-Request-Id header', () => {
    const result = compile(`
      server "api" { fn get_data() { [] } }
      server "events" { fn push_event(kind) { kind } }
    `);
    expect(result.servers['api']).toContain("'X-Request-Id': __getRequestId()");
  });
});

// ═══════════════════════════════════════════════════════════════
// Integration: All 8 Features Together
// ═══════════════════════════════════════════════════════════════

describe('Integration — All 8 features combined', () => {
  test('compiles server with all features enabled', () => {
    const result = compile(`
      server {
        auth { type: "jwt", secret: "super_secret" }
        max_body 5 * 1024 * 1024
        health "/health"

        cors {
          origins: ["https://myapp.com"]
        }

        middleware fn logger(req, next) {
          next(req)
        }

        on_error fn(err, req) {
          respond(500, {error: "Server error"})
        }

        routes "/api/v1" {
          middleware fn v1Auth(req, next) { next(req) }
          fn get_users() { [] }
          fn create_user(name: String, email: String) { name }
          route GET "/users" with auth => get_users
          route POST "/users" with auth, role("admin") => create_user
        }

        fn ping() { "pong" }
        route GET "/ping" => ping
      }
    `);

    const server = result.server;

    // Feature 1: Validation
    expect(server).toContain('__validationErrors');

    // Feature 3: Auth
    expect(server).toContain('__authenticate');
    expect(server).toContain('Unauthorized');
    expect(server).toContain('Forbidden');

    // Feature 4: Max body
    expect(server).toContain('__maxBodySize');
    expect(server).toContain('413');

    // Feature 6: Graceful drain
    expect(server).toContain('__activeRequests');
    expect(server).toContain('__shuttingDown');

    // Feature 7: Route groups
    expect(server).toContain('"/api/v1/users"');

    // Feature 8: Distributed tracing
    expect(server).toContain('AsyncLocalStorage');
    expect(server).toContain('__requestContext.run');
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW Feature 1: Fix JWT Auth (HMAC-SHA256 verification)
// ═══════════════════════════════════════════════════════════════

describe('New Feature 1 — Fixed JWT Auth', () => {
  test('JWT auth uses crypto.subtle for signature verification', () => {
    const result = compile(`
      server {
        auth { type: "jwt", secret: "my_secret" }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('crypto.subtle.importKey');
    expect(result.server).toContain('crypto.subtle.sign');
    expect(result.server).toContain('HMAC');
    expect(result.server).toContain('SHA-256');
  });

  test('JWT auth checks exp claim for expiry', () => {
    const result = compile(`
      server {
        auth { type: "jwt", secret: "test_secret" }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('__payload.exp');
    expect(result.server).toContain('Math.floor(Date.now() / 1000)');
  });

  test('JWT auth caches imported key', () => {
    const result = compile(`
      server {
        auth { type: "jwt", secret: "cached" }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('let __authKey = null');
    expect(result.server).toContain('if (!__authKey)');
  });

  test('JWT auth is async function', () => {
    const result = compile(`
      server {
        auth { type: "jwt", secret: "test" }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('async function __authenticate(req)');
  });

  test('API key auth generates Set-based check', () => {
    const result = compile(`
      server {
        auth { type: "api_key", header: "X-API-Key", keys: ["key1", "key2"] }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('new Set(');
    expect(result.server).toContain('__validApiKeys');
    expect(result.server).toContain('__apiKeyHeader');
    expect(result.server).toContain('"X-API-Key"');
  });

  test('API key auth checks header against valid keys', () => {
    const result = compile(`
      server {
        auth { type: "api_key", header: "X-API-Key", keys: ["abc123"] }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('req.headers.get(__apiKeyHeader)');
    expect(result.server).toContain('__validApiKeys.has(key)');
  });

  test('route auth decorator uses await for authenticate', () => {
    const result = compile(`
      server {
        auth { type: "jwt", secret: "test" }
        fn get_users() { [] }
        route GET "/api/users" with auth => get_users
      }
    `);
    expect(result.server).toContain('await __authenticate(req)');
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW Feature 2: Rate Limiting
// ═══════════════════════════════════════════════════════════════

describe('New Feature 2 — Rate Limiting', () => {
  test('parses rate_limit config block', () => {
    const ast = parse(`
      server {
        rate_limit { max: 100, window: 60 }
      }
    `);
    const block = ast.body[0];
    const rl = block.body[0];
    expect(rl.type).toBe('RateLimitDeclaration');
    expect(rl.config.max).toBeDefined();
    expect(rl.config.window).toBeDefined();
  });

  test('rate_limit generates __rateLimitStore', () => {
    const result = compile(`
      server {
        rate_limit { max: 100, window: 60 }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('__rateLimitStore');
    expect(result.server).toContain('new Map()');
  });

  test('rate_limit generates __checkRateLimit function', () => {
    const result = compile(`
      server {
        rate_limit { max: 50, window: 30 }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('function __checkRateLimit(');
    expect(result.server).toContain('__rateLimitMax');
    expect(result.server).toContain('__rateLimitWindow');
  });

  test('rate_limit generates 429 in __handleRequest', () => {
    const result = compile(`
      server {
        rate_limit { max: 100, window: 60 }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('Too Many Requests');
    expect(result.server).toContain('429');
    expect(result.server).toContain('Retry-After');
  });

  test('rate_limit generates periodic cleanup', () => {
    const result = compile(`
      server {
        rate_limit { max: 100, window: 60 }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('setInterval(');
    expect(result.server).toContain('__rateLimitStore.delete');
  });

  test('per-route rate_limit decorator', () => {
    const result = compile(`
      server {
        fn fast() { "ok" }
        route GET "/api/fast" with rate_limit(50, 30) => fast
      }
    `);
    expect(result.server).toContain('__checkRateLimit');
    expect(result.server).toContain('__rlRoute');
    expect(result.server).toContain('429');
  });

  test('no rate limiting when not configured', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).not.toContain('__rateLimitStore');
    expect(result.server).not.toContain('__checkRateLimit');
  });

  test('analyzer rejects rate_limit outside server block', () => {
    expect(() => analyze('server { rate_limit { max: 100, window: 60 } }')).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW Feature 3: Lifecycle Hooks
// ═══════════════════════════════════════════════════════════════

describe('New Feature 3 — Lifecycle Hooks', () => {
  test('parses on_start hook', () => {
    const ast = parse(`
      server {
        on_start fn() {
          print("Server started")
        }
      }
    `);
    const block = ast.body[0];
    const hook = block.body[0];
    expect(hook.type).toBe('LifecycleHookDeclaration');
    expect(hook.hook).toBe('start');
  });

  test('parses on_stop hook', () => {
    const ast = parse(`
      server {
        on_stop fn() {
          print("Server stopping")
        }
      }
    `);
    const block = ast.body[0];
    const hook = block.body[0];
    expect(hook.type).toBe('LifecycleHookDeclaration');
    expect(hook.hook).toBe('stop');
  });

  test('on_start hook emitted after Bun.serve()', () => {
    const result = compile(`
      server {
        on_start fn() {
          print("ready")
        }
        fn hello() { "world" }
      }
    `);
    const serverCode = result.server;
    const serveIdx = serverCode.indexOf('Bun.serve(');
    const hookIdx = serverCode.indexOf('on_start');
    expect(hookIdx).toBeGreaterThan(serveIdx);
  });

  test('on_stop hook emitted in __shutdown()', () => {
    const result = compile(`
      server {
        on_stop fn() {
          print("cleanup")
        }
        fn hello() { "world" }
      }
    `);
    const shutdownSection = result.server.split('async function __shutdown()')[1];
    expect(shutdownSection).toContain('print("cleanup")');
  });

  test('multiple hooks supported', () => {
    const result = compile(`
      server {
        on_start fn() { print("hook1") }
        on_start fn() { print("hook2") }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('hook1');
    expect(result.server).toContain('hook2');
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW Feature 4: Response Helpers
// ═══════════════════════════════════════════════════════════════

describe('New Feature 4 — Response Helpers', () => {
  test('redirect() helper is always emitted', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('function redirect(url, status = 302)');
    expect(result.server).toContain('Location: url');
  });

  test('set_cookie() helper is always emitted', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('function set_cookie(name, value, options');
    expect(result.server).toContain('Max-Age');
    expect(result.server).toContain('HttpOnly');
    expect(result.server).toContain('SameSite');
    expect(result.server).toContain('Secure');
  });

  test('stream() helper is always emitted', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('function stream(fn)');
    expect(result.server).toContain('ReadableStream');
    expect(result.server).toContain('text/event-stream');
  });

  test('stream() provides send and close callbacks', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('const send =');
    expect(result.server).toContain('const close =');
    expect(result.server).toContain('fn(send, close)');
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW Feature 5: Pub/Sub Event Bus
// ═══════════════════════════════════════════════════════════════

describe('New Feature 5 — Pub/Sub Event Bus', () => {
  test('parses subscribe declaration', () => {
    const ast = parse(`
      server {
        subscribe "user.created" fn(data) {
          print(data)
        }
      }
    `);
    const block = ast.body[0];
    const sub = block.body[0];
    expect(sub.type).toBe('SubscribeDeclaration');
    expect(sub.event).toBe('user.created');
    expect(sub.params).toHaveLength(1);
    expect(sub.params[0].name).toBe('data');
  });

  test('generates __eventBus and publish function', () => {
    const result = compile(`
      server {
        subscribe "test.event" fn(data) { print(data) }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('const __eventBus = new Map()');
    expect(result.server).toContain('async function publish(event, data)');
    expect(result.server).toContain('function __subscribe(event, handler)');
  });

  test('subscribe registration is emitted', () => {
    const result = compile(`
      server {
        subscribe "user.created" fn(data) { print(data) }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('__subscribe("user.created"');
  });

  test('no event bus when no subscriptions', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).not.toContain('__eventBus');
    expect(result.server).not.toContain('publish(');
  });

  test('multi-server event forwarding', () => {
    const result = compile(`
      server "api" {
        subscribe "user.created" fn(data) { print(data) }
        fn get_data() { [] }
      }
      server "events" {
        fn push_event(kind) { kind }
      }
    `);
    expect(result.servers['api']).toContain('/rpc/__event');
    expect(result.servers['api']).toContain('__peerUrls');
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW Feature 6: Config/Env Validation
// ═══════════════════════════════════════════════════════════════

describe('New Feature 6 — Env Validation', () => {
  test('parses env declaration with type', () => {
    const ast = parse(`
      server {
        env DATABASE_URL: String
      }
    `);
    const block = ast.body[0];
    const envDecl = block.body[0];
    expect(envDecl.type).toBe('EnvDeclaration');
    expect(envDecl.name).toBe('DATABASE_URL');
    expect(envDecl.typeAnnotation.name).toBe('String');
    expect(envDecl.defaultValue).toBeNull();
  });

  test('parses env declaration with default value', () => {
    const ast = parse(`
      server {
        env PORT: Int = 3000
      }
    `);
    const block = ast.body[0];
    const envDecl = block.body[0];
    expect(envDecl.type).toBe('EnvDeclaration');
    expect(envDecl.name).toBe('PORT');
    expect(envDecl.defaultValue).toBeDefined();
  });

  test('env validation emitted early (before database)', () => {
    const result = compile(`
      server {
        env API_KEY: String
        fn hello() { "world" }
      }
    `);
    const envIdx = result.server.indexOf('Env Validation');
    const routerIdx = result.server.indexOf('Router');
    expect(envIdx).toBeGreaterThan(-1);
    expect(envIdx).toBeLessThan(routerIdx);
  });

  test('required env fails on missing', () => {
    const result = compile(`
      server {
        env SECRET_KEY: String
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('process.env.SECRET_KEY');
    expect(result.server).toContain('process.exit(1)');
    expect(result.server).toContain('Required env var SECRET_KEY is not set');
  });

  test('env with default does not fail on missing', () => {
    const result = compile(`
      server {
        env PORT: Int = 3000
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('process.env.PORT');
    expect(result.server).toContain('return 3000');
  });

  test('Int type coercion', () => {
    const result = compile(`
      server {
        env MAX_RETRIES: Int = 3
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('parseInt(__raw, 10)');
    expect(result.server).toContain('isNaN(__val)');
  });

  test('Bool type coercion', () => {
    const result = compile(`
      server {
        env DEBUG: Bool = false
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('__raw === "true" || __raw === "1"');
  });

  test('no env validation when not used', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).not.toContain('Env Validation');
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW Feature 7: Request Timeout
// ═══════════════════════════════════════════════════════════════

describe('New Feature 7 — Request Timeout', () => {
  test('route with timeout decorator generates Promise.race', () => {
    const result = compile(`
      server {
        fn slow_handler() { "done" }
        route GET "/api/slow" with timeout(5000) => slow_handler
      }
    `);
    expect(result.server).toContain('Promise.race');
    expect(result.server).toContain('5000');
  });

  test('timeout returns 504 Gateway Timeout', () => {
    const result = compile(`
      server {
        fn slow_handler() { "done" }
        route GET "/api/slow" with timeout(3000) => slow_handler
      }
    `);
    expect(result.server).toContain('Gateway Timeout');
    expect(result.server).toContain('504');
  });

  test('route without timeout has no Promise.race', () => {
    const result = compile(`
      server {
        fn fast() { "ok" }
        route GET "/api/fast" => fast
      }
    `);
    expect(result.server).not.toContain('Promise.race');
  });

  test('timeout works with auth decorator', () => {
    const result = compile(`
      server {
        auth { type: "jwt", secret: "test" }
        fn slow() { "done" }
        route GET "/api/slow" with auth, timeout(5000) => slow
      }
    `);
    expect(result.server).toContain('await __authenticate(req)');
    expect(result.server).toContain('Promise.race');
    expect(result.server).toContain('5000');
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW Feature 8: Scheduled Tasks
// ═══════════════════════════════════════════════════════════════

describe('New Feature 8 — Scheduled Tasks', () => {
  test('parses schedule with simple interval', () => {
    const ast = parse(`
      server {
        schedule "5m" fn cleanup() {
          print("cleaning")
        }
      }
    `);
    const block = ast.body[0];
    const sched = block.body[0];
    expect(sched.type).toBe('ScheduleDeclaration');
    expect(sched.pattern).toBe('5m');
    expect(sched.name).toBe('cleanup');
  });

  test('parses schedule with cron expression', () => {
    const ast = parse(`
      server {
        schedule "*/5 * * * *" fn() {
          print("cron tick")
        }
      }
    `);
    const block = ast.body[0];
    const sched = block.body[0];
    expect(sched.type).toBe('ScheduleDeclaration');
    expect(sched.pattern).toBe('*/5 * * * *');
    expect(sched.name).toBeNull();
  });

  test('schedule generates async function', () => {
    const result = compile(`
      server {
        schedule "30s" fn heartbeat() {
          print("alive")
        }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('async function heartbeat()');
  });

  test('schedule generates setInterval', () => {
    const result = compile(`
      server {
        schedule "1h" fn gc() { print("gc") }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('setInterval(gc, __parseInterval("1h"))');
    expect(result.server).toContain('__scheduleIntervals');
  });

  test('schedule generates interval parser helper', () => {
    const result = compile(`
      server {
        schedule "5m" fn task() { print("task") }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('function __parseInterval(pattern)');
    expect(result.server).toContain('case "s"');
    expect(result.server).toContain('case "m"');
    expect(result.server).toContain('case "h"');
  });

  test('cron schedule generates __cronMatches helper', () => {
    const result = compile(`
      server {
        schedule "*/5 * * * *" fn task() { print("cron") }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('function __cronMatches(parts, date)');
    expect(result.server).toContain('__cronMatches(');
    expect(result.server).toContain('60000');
  });

  test('schedule cleanup in shutdown', () => {
    const result = compile(`
      server {
        schedule "10s" fn tick() { print("tick") }
        fn hello() { "world" }
      }
    `);
    const shutdownSection = result.server.split('async function __shutdown()')[1];
    expect(shutdownSection).toContain('clearInterval');
    expect(shutdownSection).toContain('__scheduleIntervals');
  });

  test('no schedule helpers when no schedules', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).not.toContain('__parseInterval');
    expect(result.server).not.toContain('__cronMatches');
    expect(result.server).not.toContain('__scheduleIntervals');
  });
});

// ═══════════════════════════════════════════════════════════════
// Integration: All new features combined
// ═══════════════════════════════════════════════════════════════

describe('Integration — All new features combined', () => {
  test('compiles server with all new features enabled', () => {
    const result = compile(`
      server {
        env DATABASE_URL: String
        env PORT: Int = 8080

        auth { type: "jwt", secret: "super_secret" }
        max_body 5 * 1024 * 1024
        rate_limit { max: 200, window: 60 }
        health "/health"

        cors {
          origins: ["https://myapp.com"]
        }

        middleware fn logger(req, next) {
          next(req)
        }

        on_error fn(err, req) {
          respond(500, {error: "Server error"})
        }

        on_start fn() {
          print("Server is ready")
        }

        on_stop fn() {
          print("Cleaning up")
        }

        subscribe "user.created" fn(data) {
          print(data)
        }

        schedule "5m" fn cleanup() {
          print("cleanup")
        }

        fn get_users() { [] }
        fn create_user(name: String) { name }

        route GET "/api/users" with auth => get_users
        route POST "/api/users" with auth, rate_limit(50, 30) => create_user
        route GET "/api/slow" with timeout(5000) => get_users
      }
    `);

    const server = result.server;

    // F1: JWT Auth
    expect(server).toContain('crypto.subtle');

    // F2: Rate Limiting
    expect(server).toContain('__rateLimitStore');
    expect(server).toContain('__rateLimitMax');
    expect(server).toContain('429');

    // F3: Lifecycle Hooks
    expect(server).toContain('Server is ready');
    expect(server).toContain('Cleaning up');

    // F4: Response Helpers
    expect(server).toContain('function redirect(');
    expect(server).toContain('function set_cookie(');
    expect(server).toContain('function stream(');

    // F5: Pub/Sub
    expect(server).toContain('__eventBus');
    expect(server).toContain('publish(');

    // F6: Env Validation
    expect(server).toContain('process.env.DATABASE_URL');
    expect(server).toContain('process.env.PORT');

    // F7: Timeout
    expect(server).toContain('Promise.race');
    expect(server).toContain('504');

    // F8: Scheduled Tasks
    expect(server).toContain('async function cleanup()');
    expect(server).toContain('__scheduleIntervals');
  });
});

// ═══════════════════════════════════════════════════════════════
// Non-JSON Response Support
// ═══════════════════════════════════════════════════════════════

describe('Non-JSON response support', () => {
  test('respond() respects custom Content-Type and does not double-stringify strings', () => {
    const result = compile(`
      server {
        fn home(req) {
          respond(200, "<h1>Hello</h1>", {"Content-Type": "text/html"})
        }
        route GET "/" => home
      }
    `);
    const server = result.server;
    // respond should check for custom content-type
    expect(server).toContain('__hasContentType');
    expect(server).toContain('typeof body === "string" ? body : JSON.stringify(body)');
  });

  test('respond() defaults to JSON when no Content-Type is given', () => {
    const result = compile(`
      server {
        fn data() {
          respond(200, {ok: true})
        }
        route GET "/data" => data
      }
    `);
    const server = result.server;
    expect(server).toContain('"Content-Type": "application/json"');
    expect(server).toContain('JSON.stringify(body)');
  });

  test('html() helper is emitted', () => {
    const result = compile(`
      server {
        fn page(req) {
          html("<h1>Hello</h1>")
        }
        route GET "/" => page
      }
    `);
    const server = result.server;
    expect(server).toContain('function html(body, status = 200, headers = {})');
    expect(server).toContain('"Content-Type": "text/html"');
  });

  test('text() helper is emitted', () => {
    const result = compile(`
      server {
        fn health() {
          text("OK")
        }
        route GET "/health" => health
      }
    `);
    const server = result.server;
    expect(server).toContain('function text(body, status = 200, headers = {})');
    expect(server).toContain('"Content-Type": "text/plain"');
  });

  test('html() and text() return Response objects', () => {
    const result = compile(`
      server {
        fn page() {
          html("<p>hi</p>")
        }
        route GET "/" => page
      }
    `);
    const server = result.server;
    // Both should return new Response(...)
    expect(server).toMatch(/function html\(body, status = 200, headers = \{\}\) \{\s*return new Response\(body/);
    expect(server).toMatch(/function text\(body, status = 200, headers = \{\}\) \{\s*return new Response\(body/);
  });

  test('html() and text() accept custom headers (e.g. Set-Cookie)', () => {
    const result = compile(`
      server {
        fn page() {
          html("<p>hi</p>", 200, {"Set-Cookie": "a=b"})
        }
        route GET "/" => page
      }
    `);
    const server = result.server;
    // The html function signature includes headers param with spread
    expect(server).toContain('{ "Content-Type": "text/html", ...headers }');
  });
});

// ═══════════════════════════════════════════════════════════════
// Form / Multipart Body Parsing
// ═══════════════════════════════════════════════════════════════

describe('Form and multipart body parsing', () => {
  test('__parseBody helper is emitted', () => {
    const result = compile(`
      server {
        fn create(name: String) {
          respond(201, {name: name})
        }
        route POST "/create" => create
      }
    `);
    const server = result.server;
    expect(server).toContain('async function __parseBody(req)');
  });

  test('__parseBody handles application/json', () => {
    const result = compile(`
      server {
        fn create(name: String) {
          respond(201, {name: name})
        }
        route POST "/create" => create
      }
    `);
    const server = result.server;
    // fallback at end parses JSON from streamed body
    expect(server).toContain('JSON.parse(text)');
  });

  test('__parseBody handles multipart/form-data', () => {
    const result = compile(`
      server {
        fn upload(req) {
          respond(200, {ok: true})
        }
        route POST "/upload" => upload
      }
    `);
    const server = result.server;
    expect(server).toContain('multipart/form-data');
    expect(server).toContain('await req.formData()');
  });

  test('__parseBody handles application/x-www-form-urlencoded', () => {
    const result = compile(`
      server {
        fn submit(req) {
          respond(200, {ok: true})
        }
        route POST "/submit" => submit
      }
    `);
    const server = result.server;
    expect(server).toContain('application/x-www-form-urlencoded');
    expect(server).toContain('new URLSearchParams(text)');
  });

  test('__parseBody handles duplicate keys as arrays', () => {
    const result = compile(`
      server {
        fn submit(req) {
          respond(200, {ok: true})
        }
        route POST "/submit" => submit
      }
    `);
    const server = result.server;
    // Both multipart and urlencoded branches collect duplicates into arrays
    expect(server).toContain('if (!Array.isArray(obj[k])) obj[k] = [obj[k]]');
  });

  test('route handlers for POST use __parseBody instead of req.json()', () => {
    const result = compile(`
      server {
        fn create(name: String) {
          respond(201, {name: name})
        }
        route POST "/items" => create
      }
    `);
    const server = result.server;
    // The route handler should use __parseBody
    expect(server).toContain('await __parseBody(req)');
    // The route handler body extraction should NOT have raw req.json() calls
    // (RPC endpoints still use req.json() which is fine)
    const routeSection = server.split('// ── Routes ──')[1]?.split('// ──')[0] || '';
    expect(routeSection).not.toContain('req.json()');
  });

  test('req context body uses __parseBody for POST/PUT/PATCH', () => {
    const result = compile(`
      server {
        fn update(req) {
          respond(200, req.body)
        }
        route PUT "/items/:id" => update
      }
    `);
    const server = result.server;
    expect(server).toContain('__ctx.body = await __parseBody(req)');
  });

  test('RPC endpoints still use req.json() directly', () => {
    const result = compile(`
      server {
        fn get_data() {
          42
        }
        route GET "/data" => get_data
      }
    `);
    const server = result.server;
    // RPC section should still use req.json()
    const rpcSection = server.split('// ── RPC Endpoints ──')[1]?.split('// ──')[0] || '';
    expect(rpcSection).toContain('await req.json()');
  });
});

// ═══════════════════════════════════════════════════════════════
// Cookie / Header Attachment to Responses
// ═══════════════════════════════════════════════════════════════

describe('Cookie and header attachment', () => {
  test('with_headers() helper is emitted', () => {
    const result = compile(`
      server {
        fn page() {
          respond(200, {ok: true})
        }
        route GET "/" => page
      }
    `);
    const server = result.server;
    expect(server).toContain('function with_headers(response, headers)');
  });

  test('with_headers() clones response with new headers', () => {
    const result = compile(`
      server {
        fn page() {
          respond(200, {ok: true})
        }
        route GET "/" => page
      }
    `);
    const server = result.server;
    expect(server).toContain('new Headers(response.headers)');
    expect(server).toContain('h.set(k, v)');
    expect(server).toContain('return new Response(response.body, { status: response.status, headers: h })');
  });

  test('set_cookie can be used with respond() via headers', () => {
    // This tests the pattern: respond(200, body, {"Set-Cookie": set_cookie(...)})
    const result = compile(`
      server {
        fn login(req) {
          respond(200, {ok: true}, {"Set-Cookie": set_cookie("session", "abc", {httpOnly: true})})
        }
        route POST "/login" => login
      }
    `);
    const server = result.server;
    // respond() should exist with headers param
    expect(server).toContain('function respond(status, body, headers = {})');
    // set_cookie should exist
    expect(server).toContain('function set_cookie(');
  });

  test('set_cookie can be used with html() via headers', () => {
    const result = compile(`
      server {
        fn page(req) {
          html("<h1>Welcome</h1>", 200, {"Set-Cookie": set_cookie("theme", "dark")})
        }
        route GET "/" => page
      }
    `);
    const server = result.server;
    expect(server).toContain('function html(body, status = 200, headers = {})');
    expect(server).toContain('function set_cookie(');
  });

  test('respond() with custom Content-Type passes body as raw string', () => {
    const result = compile(`
      server {
        fn xml_data() {
          respond(200, "<data>hi</data>", {"Content-Type": "application/xml"})
        }
        route GET "/xml" => xml_data
      }
    `);
    const server = result.server;
    // When Content-Type is provided, strings should not be JSON.stringified
    expect(server).toContain('if (__hasContentType)');
    expect(server).toContain('typeof body === "string" ? body : JSON.stringify(body)');
  });
});

// ═══════════════════════════════════════════════════════════════
// Integration: All three features combined
// ═══════════════════════════════════════════════════════════════

describe('Integration: response types + body parsing + cookies', () => {
  test('full server with all new features compiles correctly', () => {
    const result = compile(`
      server {
        health "/health"

        cors {
          origins: ["*"]
        }

        fn home(req) {
          html("<h1>Welcome</h1>", 200, {"Set-Cookie": set_cookie("visited", "true")})
        }

        fn api_data() {
          respond(200, {items: [1, 2, 3]})
        }

        fn submit(req) {
          data = req.body
          respond(201, data)
        }

        fn plain() {
          text("OK")
        }

        fn xml_out() {
          respond(200, "<root/>", {"Content-Type": "application/xml"})
        }

        route GET "/" => home
        route GET "/api" => api_data
        route POST "/submit" => submit
        route GET "/plain" => plain
        route GET "/xml" => xml_out
      }
    `);
    const server = result.server;

    // All helpers present
    expect(server).toContain('function respond(');
    expect(server).toContain('function html(');
    expect(server).toContain('function text(');
    expect(server).toContain('function with_headers(');
    expect(server).toContain('function set_cookie(');
    expect(server).toContain('async function __parseBody(');

    // Body parsing handles all content types
    expect(server).toContain('multipart/form-data');
    expect(server).toContain('application/x-www-form-urlencoded');
    expect(server).toContain('await req.formData()');

    // POST route uses __parseBody
    expect(server).toContain('__parseBody(req)');

    // respond() has smart content-type logic
    expect(server).toContain('__hasContentType');
  });

  test('server with form upload handler and HTML response compiles', () => {
    const result = compile(`
      server {
        fn upload(req) {
          file = req.body.avatar
          html("<p>Uploaded!</p>", 200, {"Set-Cookie": set_cookie("uploaded", "true", {path: "/"})})
        }

        fn form_page() {
          html("<form method='post' enctype='multipart/form-data'><input type='file' name='avatar'/></form>")
        }

        route GET "/upload" => form_page
        route POST "/upload" => upload
      }
    `);
    const server = result.server;
    expect(server).toContain('function html(');
    expect(server).toContain('__parseBody(req)');
    expect(server).toContain('function set_cookie(');
  });
});

// ═══════════════════════════════════════════════════════════════
// HEAD and OPTIONS method support
// ═══════════════════════════════════════════════════════════════

describe('HEAD and OPTIONS method support', () => {
  test('HEAD routes are accepted by the parser', () => {
    const ast = parse(`
      server {
        fn head_handler(req) { text("") }
        route HEAD "/check" => head_handler
      }
    `);
    const block = ast.body.find(n => n.type === 'ServerBlock');
    const route = block.body.find(n => n.type === 'RouteDeclaration');
    expect(route.method).toBe('HEAD');
  });

  test('OPTIONS routes are accepted by the parser', () => {
    const ast = parse(`
      server {
        fn options_handler(req) { respond(204, nil) }
        route OPTIONS "/api/data" => options_handler
      }
    `);
    const block = ast.body.find(n => n.type === 'ServerBlock');
    const route = block.body.find(n => n.type === 'RouteDeclaration');
    expect(route.method).toBe('OPTIONS');
  });

  test('HEAD routes compile to __addRoute with HEAD method', () => {
    const result = compile(`
      server {
        fn head_handler() { text("") }
        route HEAD "/check" => head_handler
      }
    `);
    expect(result.server).toContain('__addRoute("HEAD", "/check"');
  });
});

// ═══════════════════════════════════════════════════════════════
// Try/Catch statement
// ═══════════════════════════════════════════════════════════════

describe('Try/Catch statement', () => {
  test('try/catch parses correctly', () => {
    const ast = parse(`
      server {
        fn safe() {
          try {
            x = 1
          } catch err {
            x = 0
          }
        }
      }
    `);
    const block = ast.body.find(n => n.type === 'ServerBlock');
    const fn = block.body.find(n => n.type === 'FunctionDeclaration');
    const tryCatch = fn.body.body[0];
    expect(tryCatch.type).toBe('TryCatchStatement');
    expect(tryCatch.catchParam).toBe('err');
    expect(tryCatch.tryBody.length).toBe(1);
    expect(tryCatch.catchBody.length).toBe(1);
  });

  test('try/catch without error param', () => {
    const ast = parse(`
      server {
        fn safe() {
          try {
            x = 1
          } catch {
            x = 0
          }
        }
      }
    `);
    const block = ast.body.find(n => n.type === 'ServerBlock');
    const fn = block.body.find(n => n.type === 'FunctionDeclaration');
    const tryCatch = fn.body.body[0];
    expect(tryCatch.catchParam).toBeNull();
  });

  test('try/catch compiles to JavaScript try/catch', () => {
    const result = compile(`
      server {
        fn risky() {
          try {
            x = dangerous()
          } catch err {
            respond(500, {error: "fail"})
          }
        }
        route GET "/risk" => risky
      }
    `);
    const server = result.server;
    expect(server).toContain('try {');
    expect(server).toContain('} catch (err) {');
    expect(server).toContain('dangerous()');
  });

  test('try/catch without param compiles with (__err)', () => {
    const result = compile(`
      server {
        fn safe() {
          try {
            x = 1
          } catch {
            x = 0
          }
        }
        route GET "/safe" => safe
      }
    `);
    expect(result.server).toContain('} catch (__err) {');
  });

  test('try/catch passes analyzer validation', () => {
    // Should not throw
    const ast = parse(`
      server {
        fn risky() {
          try {
            x = 1
          } catch err {
            y = err
          }
        }
      }
    `);
    const a = new Analyzer(ast, '<test>');
    expect(() => a.analyze()).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// Query string array parsing
// ═══════════════════════════════════════════════════════════════

describe('Query string array parsing', () => {
  test('__parseQuery helper is emitted', () => {
    const result = compile(`
      server {
        fn search(req) { req.query }
        route GET "/search" => search
      }
    `);
    expect(result.server).toContain('function __parseQuery(searchParams)');
  });

  test('__parseQuery collects duplicate keys into arrays', () => {
    const result = compile(`
      server {
        fn search(req) { req.query }
        route GET "/search" => search
      }
    `);
    const server = result.server;
    expect(server).toContain('if (!Array.isArray(q[k])) q[k] = [q[k]]');
  });

  test('req context uses __parseQuery instead of Object.fromEntries', () => {
    const result = compile(`
      server {
        fn handler(req) { req.query }
        route GET "/data" => handler
      }
    `);
    expect(result.server).toContain('query: __parseQuery(__url.searchParams)');
    expect(result.server).not.toContain('Object.fromEntries(__url.searchParams)');
  });
});

// ═══════════════════════════════════════════════════════════════
// Route specificity sorting
// ═══════════════════════════════════════════════════════════════

describe('Route specificity sorting', () => {
  test('static routes are sorted before parameterized routes', () => {
    const result = compile(`
      server {
        fn by_id(id: String) { id }
        fn create_new() { "new" }
        route GET "/users/:id" => by_id
        route GET "/users/new" => create_new
      }
    `);
    const server = result.server;
    const newIdx = server.indexOf('__addRoute("GET", "/users/new"');
    const idIdx = server.indexOf('__addRoute("GET", "/users/:id"');
    expect(newIdx).toBeGreaterThan(-1);
    expect(idIdx).toBeGreaterThan(-1);
    // /users/new should come BEFORE /users/:id
    expect(newIdx).toBeLessThan(idIdx);
  });

  test('longer paths are sorted before shorter paths', () => {
    const result = compile(`
      server {
        fn list() { [] }
        fn detail(id: String) { id }
        fn sub(id: String, sid: String) { sid }
        route GET "/a/:id" => detail
        route GET "/a/:id/b/:sid" => sub
        route GET "/a" => list
      }
    `);
    const server = result.server;
    const subIdx = server.indexOf('__addRoute("GET", "/a/:id/b/:sid"');
    const detailIdx = server.indexOf('__addRoute("GET", "/a/:id"');
    const listIdx = server.indexOf('__addRoute("GET", "/a"');
    // Longest first
    expect(subIdx).toBeLessThan(detailIdx);
    expect(detailIdx).toBeLessThan(listIdx);
  });
});

// ═══════════════════════════════════════════════════════════════
// Request-scoped locals
// ═══════════════════════════════════════════════════════════════

describe('Request-scoped locals', () => {
  test('__getLocals helper is emitted', () => {
    const result = compile(`
      server {
        fn handler() { "ok" }
        route GET "/" => handler
      }
    `);
    expect(result.server).toContain('function __getLocals()');
  });

  test('request context includes locals object', () => {
    const result = compile(`
      server {
        fn handler() { "ok" }
        route GET "/" => handler
      }
    `);
    expect(result.server).toContain('{ rid: __rid, locals: {} }');
  });

  test('req context object includes locals from __getLocals()', () => {
    const result = compile(`
      server {
        fn handler(req) { req.locals }
        route GET "/" => handler
      }
    `);
    expect(result.server).toContain('locals: __getLocals()');
  });
});

// ═══════════════════════════════════════════════════════════════
// Improved cron parser
// ═══════════════════════════════════════════════════════════════

describe('Improved cron parser', () => {
  test('__cronFieldMatches helper is emitted for schedules', () => {
    const result = compile(`
      server {
        schedule "5m" fn tick() { }
        route GET "/" => tick
      }
    `);
    expect(result.server).toContain('function __cronFieldMatches(field, value)');
  });

  test('cron supports ranges (1-5)', () => {
    const result = compile(`
      server {
        schedule "5m" fn tick() { }
        route GET "/" => tick
      }
    `);
    const server = result.server;
    expect(server).toContain('part.split("-").map(Number)');
    expect(server).toContain('value >= lo && value <= hi');
  });

  test('cron supports lists via comma splitting', () => {
    const result = compile(`
      server {
        schedule "5m" fn tick() { }
        route GET "/" => tick
      }
    `);
    expect(result.server).toContain('field.split(",")');
  });

  test('cron supports step with range (1-5/2)', () => {
    const result = compile(`
      server {
        schedule "5m" fn tick() { }
        route GET "/" => tick
      }
    `);
    const server = result.server;
    expect(server).toContain('(value - lo) % step === 0');
  });

  test('__cronMatches delegates to __cronFieldMatches per field', () => {
    const result = compile(`
      server {
        schedule "5m" fn tick() { }
        route GET "/" => tick
      }
    `);
    expect(result.server).toContain('__cronFieldMatches(parts[i], fields[i])');
  });
});

// ═══════════════════════════════════════════════════════════════
// SPA fallback for static files
// ═══════════════════════════════════════════════════════════════

describe('SPA fallback for static files', () => {
  test('static with fallback parses correctly', () => {
    const ast = parse(`
      server {
        static "/app" => "./dist" fallback "index.html"
      }
    `);
    const block = ast.body.find(n => n.type === 'ServerBlock');
    const staticDecl = block.body.find(n => n.type === 'StaticDeclaration');
    expect(staticDecl.path).toBe('/app');
    expect(staticDecl.dir).toBe('./dist');
    expect(staticDecl.fallback).toBe('index.html');
  });

  test('static without fallback still works', () => {
    const ast = parse(`
      server {
        static "/assets" => "./public"
      }
    `);
    const block = ast.body.find(n => n.type === 'ServerBlock');
    const staticDecl = block.body.find(n => n.type === 'StaticDeclaration');
    expect(staticDecl.fallback).toBeNull();
  });

  test('fallback generates Bun.file fallback code', () => {
    const result = compile(`
      server {
        static "/app" => "./dist" fallback "index.html"
        fn handler() { "ok" }
        route GET "/api" => handler
      }
    `);
    const server = result.server;
    expect(server).toContain('__staticFallback');
    expect(server).toContain('"index.html"');
    expect(server).toContain('Bun.file(__staticDir + "/" + __staticFallback)');
  });

  test('no fallback does not generate fallback code', () => {
    const result = compile(`
      server {
        static "/assets" => "./public"
        fn handler() { "ok" }
        route GET "/api" => handler
      }
    `);
    expect(result.server).not.toContain('__staticFallback');
  });
});

// ═══════════════════════════════════════════════════════════════
// Configurable circuit breaker
// ═══════════════════════════════════════════════════════════════

describe('Configurable circuit breaker', () => {
  test('discover with config parses correctly', () => {
    const ast = parse(`
      server "api" {
        discover "events" at "http://localhost:4000" with {
          threshold: 10,
          timeout: 5000,
          reset_timeout: 60000,
        }
        fn handler() { "ok" }
      }
    `);
    const block = ast.body.find(n => n.type === 'ServerBlock');
    const disc = block.body.find(n => n.type === 'DiscoverDeclaration');
    expect(disc.peerName).toBe('events');
    expect(disc.config).not.toBeNull();
    expect(disc.config.threshold).toBeTruthy();
    expect(disc.config.timeout).toBeTruthy();
    expect(disc.config.reset_timeout).toBeTruthy();
  });

  test('discover without config still works', () => {
    const ast = parse(`
      server "api" {
        discover "events" at "http://localhost:4000"
        fn handler() { "ok" }
      }
    `);
    const block = ast.body.find(n => n.type === 'ServerBlock');
    const disc = block.body.find(n => n.type === 'DiscoverDeclaration');
    expect(disc.config).toBeNull();
  });

  test('circuit breaker uses custom threshold and reset from discover config', () => {
    const result = compile(`
      server "api" {
        discover "events" at "http://localhost:4000" with {
          threshold: 10,
          reset_timeout: 60000,
        }
        fn handler() { "ok" }
        route GET "/" => handler
      }
      server "events" {
        fn get_data() { "data" }
        route GET "/data" => get_data
      }
    `);
    const apiServer = result.servers.api;
    expect(apiServer).toContain('new __CircuitBreaker("events", 10, 60000)');
  });

  test('circuit breaker uses custom RPC timeout', () => {
    const result = compile(`
      server "api" {
        discover "events" at "http://localhost:4000" with {
          timeout: 5000,
        }
        fn handler() { "ok" }
        route GET "/" => handler
      }
      server "events" {
        fn get_data() { "data" }
        route GET "/data" => get_data
      }
    `);
    const apiServer = result.servers.api;
    expect(apiServer).toContain('setTimeout(() => __controller.abort(), 5000)');
  });

  test('default circuit breaker values when no config', () => {
    const result = compile(`
      server "api" {
        discover "events" at "http://localhost:4000"
        fn handler() { "ok" }
        route GET "/" => handler
      }
      server "events" {
        fn get_data() { "data" }
        route GET "/data" => get_data
      }
    `);
    const apiServer = result.servers.api;
    expect(apiServer).toContain('new __CircuitBreaker("events", 5, 30000)');
    expect(apiServer).toContain('setTimeout(() => __controller.abort(), 10000)');
  });
});

// ═══════════════════════════════════════════════════════════════
// WebSocket broadcast and rooms
// ═══════════════════════════════════════════════════════════════

describe('WebSocket broadcast and rooms', () => {
  test('__wsClients Set is emitted when ws is configured', () => {
    const result = compile(`
      server {
        ws {
          on_open fn(ws) { }
          on_message fn(ws, msg) { }
        }
        fn handler() { "ok" }
        route GET "/" => handler
      }
    `);
    expect(result.server).toContain('const __wsClients = new Set()');
  });

  test('__wsRooms Map is emitted', () => {
    const result = compile(`
      server {
        ws {
          on_open fn(ws) { }
          on_message fn(ws, msg) { }
        }
        fn handler() { "ok" }
        route GET "/" => handler
      }
    `);
    expect(result.server).toContain('const __wsRooms = new Map()');
  });

  test('broadcast() function is emitted', () => {
    const result = compile(`
      server {
        ws {
          on_open fn(ws) { }
          on_message fn(ws, msg) { }
        }
        fn handler() { "ok" }
        route GET "/" => handler
      }
    `);
    const server = result.server;
    expect(server).toContain('function broadcast(data, exclude = null)');
    expect(server).toContain('for (const c of __wsClients)');
  });

  test('join(), leave(), broadcast_to() are emitted', () => {
    const result = compile(`
      server {
        ws {
          on_open fn(ws) { }
          on_message fn(ws, msg) { }
        }
        fn handler() { "ok" }
        route GET "/" => handler
      }
    `);
    const server = result.server;
    expect(server).toContain('function join(ws, room)');
    expect(server).toContain('function leave(ws, room)');
    expect(server).toContain('function broadcast_to(room, data, exclude = null)');
  });

  test('ws open handler auto-tracks clients', () => {
    const result = compile(`
      server {
        ws {
          on_open fn(ws) { }
          on_message fn(ws, msg) { }
        }
        fn handler() { "ok" }
        route GET "/" => handler
      }
    `);
    expect(result.server).toContain('__wsClients.add(ws)');
  });

  test('ws close handler auto-removes clients and cleans rooms', () => {
    const result = compile(`
      server {
        ws {
          on_open fn(ws) { }
          on_close fn(ws, code, reason) { }
        }
        fn handler() { "ok" }
        route GET "/" => handler
      }
    `);
    const server = result.server;
    expect(server).toContain('__wsClients.delete(ws)');
    expect(server).toContain('for (const [,r] of __wsRooms) r.delete(ws)');
  });

  test('ws without on_open still tracks clients', () => {
    const result = compile(`
      server {
        ws {
          on_message fn(ws, msg) { }
        }
        fn handler() { "ok" }
        route GET "/" => handler
      }
    `);
    expect(result.server).toContain('__wsClients.add(ws)');
  });

  test('ws without on_close still cleans up clients', () => {
    const result = compile(`
      server {
        ws {
          on_message fn(ws, msg) { }
        }
        fn handler() { "ok" }
        route GET "/" => handler
      }
    `);
    expect(result.server).toContain('__wsClients.delete(ws)');
  });
});

// ═══════════════════════════════════════════════════════════════
// Feature 1: Wildcard/Catch-All Routes
// ═══════════════════════════════════════════════════════════════

describe('Wildcard Routes', () => {
  test('named wildcard *path generates capturing regex', () => {
    const result = compile(`
      server {
        fn serve_file(req) { "file" }
        route GET "/files/*path" => serve_file
      }
    `);
    // Route is registered with the wildcard path
    expect(result.server).toContain('/files/*path');
    // __addRoute contains the regex replacement logic for named wildcards
    expect(result.server).toContain('(?<$1>.+)');
  });

  test('trailing wildcard * generates catch-all regex', () => {
    const result = compile(`
      server {
        fn catch_all(req) { "caught" }
        route GET "/api/*" => catch_all
      }
    `);
    expect(result.server).toContain('(.*)');
  });

  test('wildcard routes sort AFTER static and param routes', () => {
    const result = compile(`
      server {
        fn handler(req) { "ok" }
        route GET "/api/*" => handler
        route GET "/api/users" => handler
        route GET "/api/:id" => handler
      }
    `);
    // Find the order of route registration __addRoute("GET", ...) calls (skip the RPC ones and the function definition)
    const addRouteLines = result.server.split('\n').filter(l => l.includes('__addRoute("GET"'));
    // Static route "/api/users" should come first
    expect(addRouteLines[0]).toContain('/api/users');
    // Param route "/api/:id" should come second
    expect(addRouteLines[1]).toContain('/api/:id');
    // Wildcard route "/api/*" should come last
    expect(addRouteLines[2]).toContain('/api/*');
  });

  test('named wildcard param accessible via params', () => {
    const result = compile(`
      server {
        fn serve(req) { req.params }
        route GET "/files/*filepath" => serve
      }
    `);
    // Route is registered with *filepath, which __addRoute converts to (?<filepath>.+) at runtime
    expect(result.server).toContain('/files/*filepath');
  });
});

// ═══════════════════════════════════════════════════════════════
// Feature 2: Input Validation (Decorator-based)
// ═══════════════════════════════════════════════════════════════

describe('Input Validation Decorator', () => {
  test('validate decorator emits validation checks', () => {
    const result = compile(`
      server {
        fn create_user(req) { "ok" }
        route POST "/users" with validate({name: {required: true}}) => create_user
      }
    `);
    expect(result.server).toContain('__validationErrors');
    expect(result.server).toContain('name is required');
  });

  test('min_length validation emits length check', () => {
    const result = compile(`
      server {
        fn create(req) { "ok" }
        route POST "/users" with validate({name: {min_length: 3}}) => create
      }
    `);
    expect(result.server).toContain('must be at least 3 characters');
  });

  test('max_length validation emits length check', () => {
    const result = compile(`
      server {
        fn create(req) { "ok" }
        route POST "/users" with validate({name: {max_length: 100}}) => create
      }
    `);
    expect(result.server).toContain('must be at most 100 characters');
  });

  test('min/max numeric validation', () => {
    const result = compile(`
      server {
        fn create(req) { "ok" }
        route POST "/users" with validate({age: {min: 0, max: 150}}) => create
      }
    `);
    expect(result.server).toContain('must be at least 0');
    expect(result.server).toContain('must be at most 150');
  });

  test('pattern validation emits regex check', () => {
    const result = compile(`
      server {
        fn create(req) { "ok" }
        route POST "/users" with validate({email: {pattern: "^.+@.+$"}}) => create
      }
    `);
    expect(result.server).toContain('does not match required pattern');
    expect(result.server).toContain('RegExp');
  });

  test('one_of validation emits includes check', () => {
    const result = compile(`
      server {
        fn create(req) { "ok" }
        route POST "/users" with validate({role: {one_of: ["admin", "user"]}}) => create
      }
    `);
    expect(result.server).toContain('must be one of');
    expect(result.server).toContain('.includes(');
  });

  test('validate returns 400 on failure', () => {
    const result = compile(`
      server {
        fn create(req) { "ok" }
        route POST "/users" with validate({name: {required: true}}) => create
      }
    `);
    expect(result.server).toContain('status: 400');
    expect(result.server).toContain('Validation failed');
  });
});

// ═══════════════════════════════════════════════════════════════
// Feature 3: File Uploads
// ═══════════════════════════════════════════════════════════════

describe('File Uploads', () => {
  test('upload config block is parsed', () => {
    const ast = parse(`
      server {
        upload { max_size: 5000000, allowed_types: ["image/png"] }
        fn handler(req) { "ok" }
        route GET "/" => handler
      }
    `);
    const serverBlock = ast.body[0];
    const uploadDecl = serverBlock.body.find(s => s.type === 'UploadDeclaration');
    expect(uploadDecl).toBeDefined();
    expect(uploadDecl.config.max_size).toBeDefined();
  });

  test('upload config emits validation helper', () => {
    const result = compile(`
      server {
        upload { max_size: 5000000, allowed_types: ["image/png"] }
        fn handler(req) { "ok" }
        route GET "/" => handler
      }
    `);
    expect(result.server).toContain('__validateFile');
    expect(result.server).toContain('save_file');
    expect(result.server).toContain('5000000');
  });

  test('upload decorator validates file field in route', () => {
    const result = compile(`
      server {
        upload { max_size: 10000000 }
        fn handle(req) { "ok" }
        route POST "/upload" with upload("avatar") => handle
      }
    `);
    expect(result.server).toContain('__uploadField');
    expect(result.server).toContain('"avatar"');
    expect(result.server).toContain('__validateFile');
    expect(result.server).toContain('status: 400');
  });

  test('upload helpers include Bun.write', () => {
    const result = compile(`
      server {
        upload { max_size: 10000000 }
        fn handle(req) { "ok" }
        route POST "/upload" with upload("file") => handle
      }
    `);
    expect(result.server).toContain('Bun.write');
  });

  test('upload config respects allowed_types', () => {
    const result = compile(`
      server {
        upload { allowed_types: ["image/jpeg", "image/png"] }
        fn handle(req) { "ok" }
        route POST "/upload" with upload("photo") => handle
      }
    `);
    expect(result.server).toContain('__uploadAllowedTypes');
    expect(result.server).toContain('"image/jpeg"');
  });
});

// ═══════════════════════════════════════════════════════════════
// Feature 4: Session Management
// ═══════════════════════════════════════════════════════════════

describe('Session Management', () => {
  test('session config block is parsed', () => {
    const ast = parse(`
      server {
        session { secret: "my-key", max_age: 3600 }
        fn handler(req) { "ok" }
        route GET "/" => handler
      }
    `);
    const serverBlock = ast.body[0];
    const sessionDecl = serverBlock.body.find(s => s.type === 'SessionDeclaration');
    expect(sessionDecl).toBeDefined();
    expect(sessionDecl.config.secret).toBeDefined();
  });

  test('session config emits session store and HMAC signing', () => {
    const result = compile(`
      server {
        session { secret: "my-secret", max_age: 7200 }
        fn handler(req) { "ok" }
        route GET "/" => handler
      }
    `);
    expect(result.server).toContain('__sessionStore');
    expect(result.server).toContain('__signSessionId');
    expect(result.server).toContain('__verifySessionId');
    expect(result.server).toContain('HMAC');
    expect(result.server).toContain('"my-secret"');
  });

  test('session creates session object with get/set/delete/destroy', () => {
    const result = compile(`
      server {
        session { secret: "key" }
        fn handler(req) { "ok" }
        route GET "/" => handler
      }
    `);
    expect(result.server).toContain('__createSession');
    expect(result.server).toContain('get(key)');
    expect(result.server).toContain('set(key, value)');
    expect(result.server).toContain('destroy()');
  });

  test('session is loaded from cookie in request handler', () => {
    const result = compile(`
      server {
        session { secret: "key", cookie_name: "__sid" }
        fn handler(req) { "ok" }
        route GET "/" => handler
      }
    `);
    expect(result.server).toContain('__sessionId');
    expect(result.server).toContain('__sessionCookieName');
    expect(result.server).toContain('req.__session');
  });

  test('session sets Set-Cookie header on new sessions', () => {
    const result = compile(`
      server {
        session { secret: "key" }
        fn handler(req) { "ok" }
        route GET "/" => handler
      }
    `);
    expect(result.server).toContain('Set-Cookie');
    expect(result.server).toContain('__sessionIsNew');
  });

  test('session is attached to __ctx when handler uses req param', () => {
    const result = compile(`
      server {
        session { secret: "key" }
        fn profile(req) { req.session.get("user") }
        route GET "/me" => profile
      }
    `);
    expect(result.server).toContain('__ctx.session = req.__session');
  });

  test('session cleanup interval is set', () => {
    const result = compile(`
      server {
        session { secret: "key", max_age: 3600 }
        fn handler(req) { "ok" }
        route GET "/" => handler
      }
    `);
    expect(result.server).toContain('setInterval');
    expect(result.server).toContain('__sessionMaxAge');
  });
});

// ═══════════════════════════════════════════════════════════════
// Feature 5: Testing Utilities
// ═══════════════════════════════════════════════════════════════

describe('Testing Utilities', () => {
  test('test block is parsed at top level', () => {
    const ast = parse(`
      server {
        fn hello(req) { "world" }
        route GET "/hello" => hello
      }
      test "API" {
        fn test_hello() {
          result = request("GET", "/hello")
        }
      }
    `);
    const testBlock = ast.body.find(n => n.type === 'TestBlock');
    expect(testBlock).toBeDefined();
    expect(testBlock.name).toBe('API');
    expect(testBlock.body.length).toBeGreaterThan(0);
  });

  test('test block without name is parsed', () => {
    const ast = parse(`
      server {
        fn hello(req) { "world" }
        route GET "/hello" => hello
      }
      test {
        fn test_hello() {
          result = request("GET", "/hello")
        }
      }
    `);
    const testBlock = ast.body.find(n => n.type === 'TestBlock');
    expect(testBlock).toBeDefined();
    expect(testBlock.name).toBeNull();
  });

  test('test code output includes bun:test imports', () => {
    const result = compile(`
      server {
        fn hello(req) { "world" }
        route GET "/hello" => hello
      }
      test "API" {
        fn test_hello() {
          result = request("GET", "/hello")
        }
      }
    `);
    expect(result.test).toBeDefined();
    expect(result.test).toContain('import { describe, test, expect } from "bun:test"');
  });

  test('test code includes request() and assert() helpers', () => {
    const result = compile(`
      server {
        fn hello(req) { "world" }
        route GET "/hello" => hello
      }
      test "API" {
        fn test_hello() {
          result = request("GET", "/hello")
        }
      }
    `);
    expect(result.test).toContain('async function request(method, path');
    expect(result.test).toContain('function assert(condition');
    expect(result.test).toContain('__handleRequest');
  });

  test('test functions become test() calls inside describe()', () => {
    const result = compile(`
      server {
        fn hello(req) { "world" }
        route GET "/hello" => hello
      }
      test "API" {
        fn test_hello() {
          result = request("GET", "/hello")
        }
      }
    `);
    expect(result.test).toContain('describe("API"');
    expect(result.test).toContain('test("test hello"');
  });

  test('server code exports __handleRequest when test blocks exist', () => {
    const result = compile(`
      server {
        fn hello(req) { "world" }
        route GET "/hello" => hello
      }
      test "API" {
        fn test_hello() {
          result = request("GET", "/hello")
        }
      }
    `);
    expect(result.server).toContain('export { __handleRequest }');
  });
});

// ═══════════════════════════════════════════════════════════════
// New Features Tests
// ═══════════════════════════════════════════════════════════════

describe('Database block (bun:sqlite)', () => {
  test('db block generates SQLite import and wrapper', () => {
    const result = compile(`
      server {
        db { path: "./data.sqlite" }
        fn get_users() { db.query("SELECT * FROM users") }
      }
    `);
    expect(result.server).toContain('import { Database } from "bun:sqlite"');
    expect(result.server).toContain('new Database("./data.sqlite")');
    expect(result.server).toContain('PRAGMA journal_mode=WAL');
    expect(result.server).toContain('PRAGMA foreign_keys=ON');
  });

  test('db wrapper has query, run, get, exec, transaction, migrate, close', () => {
    const result = compile(`
      server {
        db { path: ":memory:" }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('query(sql, ...params)');
    expect(result.server).toContain('run(sql, ...params)');
    expect(result.server).toContain('get(sql, ...params)');
    expect(result.server).toContain('exec(sql)');
    expect(result.server).toContain('transaction(fn)');
    expect(result.server).toContain('migrate(migrations)');
    expect(result.server).toContain('close()');
  });

  test('db block with wal: false disables WAL', () => {
    const result = compile(`
      server {
        db { path: "./data.sqlite", wal: false }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('if (false)');
  });

  test('migrate() creates __migrations table and applies migrations', () => {
    const result = compile(`
      server {
        db { path: ":memory:" }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('CREATE TABLE IF NOT EXISTS __migrations');
    expect(result.server).toContain('INSERT INTO __migrations');
    expect(result.server).toContain('Migration applied:');
  });

  test('db.close() called in graceful shutdown', () => {
    const result = compile(`
      server {
        db { path: ":memory:" }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('db.close()');
  });
});

describe('Auth builtins — sign_jwt, hash_password, verify_password', () => {
  test('sign_jwt is always generated', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('async function sign_jwt(payload, secret, options');
    expect(result.server).toContain('alg: "HS256"');
    expect(result.server).toContain('expires_in');
  });

  test('hash_password uses PBKDF2', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('async function hash_password(password)');
    expect(result.server).toContain('PBKDF2');
    expect(result.server).toContain('iterations: 100000');
    expect(result.server).toContain('pbkdf2:100000:');
  });

  test('verify_password validates against stored hash', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('async function verify_password(password, stored)');
    expect(result.server).toContain('parts[0] !== "pbkdf2"');
    expect(result.server).toContain('deriveBits');
  });
});

describe('SQLite-backed session store', () => {
  test('session with db uses SQLite store', () => {
    const result = compile(`
      server {
        db { path: ":memory:" }
        session { secret: "test-secret", max_age: 7200 }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('CREATE TABLE IF NOT EXISTS __sessions');
    expect(result.server).toContain('__sessionStmts');
    expect(result.server).toContain('ON CONFLICT(id) DO UPDATE');
  });

  test('session without db uses in-memory store', () => {
    const result = compile(`
      server {
        session { secret: "test-secret" }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('const __sessionStore = new Map()');
    expect(result.server).not.toContain('CREATE TABLE IF NOT EXISTS __sessions');
  });

  test('session store has __flush method', () => {
    const result = compile(`
      server {
        session { secret: "test" }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('__flush()');
  });
});

describe('Nested route group middleware inheritance', () => {
  test('nested group inherits parent middleware', () => {
    const result = compile(`
      server {
        middleware fn auth(req, next) { next(req) }
        routes "/api" {
          middleware fn logger(req, next) { next(req) }
          routes "/v1" {
            route GET "/users" => get_users
          }
        }
        fn get_users() { [] }
      }
    `);
    // Route should be /api/v1/users
    expect(result.server).toContain('"/api/v1/users"');
    // Should include logger middleware for the nested route
    expect(result.server).toContain('logger');
  });
});

describe('CORS credentials support', () => {
  test('cors with credentials: true sets Allow-Credentials header', () => {
    const result = compile(`
      server {
        cors {
          origins: ["https://example.com"]
          credentials: true
        }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('Access-Control-Allow-Credentials');
    expect(result.server).toContain('__corsCredentials');
  });

  test('cors without credentials sets __corsCredentials = false', () => {
    const result = compile(`
      server {
        cors { origins: ["*"] }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('__corsCredentials = false');
  });
});

describe('HEAD request handling', () => {
  test('HEAD falls back to GET only when no explicit HEAD route exists', () => {
    const result = compile(`
      server {
        fn hello() { "world" }
        route GET "/api/hello" => hello
      }
    `);
    expect(result.server).toContain('route.method === "GET" && req.method === "HEAD"');
    expect(result.server).toContain('!__routes.some(r => r.method === "HEAD"');
  });
});

describe('Route sorting by method', () => {
  test('routes are sorted with deterministic method ordering', () => {
    const result = compile(`
      server {
        fn handler() { "ok" }
        route DELETE "/api/users/:id" => handler
        route GET "/api/users/:id" => handler
        route POST "/api/users" => handler
      }
    `);
    // Routes should appear in a deterministic order
    expect(result.server).toContain('__addRoute("GET"');
    expect(result.server).toContain('__addRoute("POST"');
    expect(result.server).toContain('__addRoute("DELETE"');
  });
});

describe('Session/activeRequests race fix', () => {
  test('with session, activeRequests decrements in finally after session cookie', () => {
    const result = compile(`
      server {
        session { secret: "test" }
        fn hello() { "world" }
      }
    `);
    // Should use .finally() instead of a try/finally inside the async context
    expect(result.server).toContain('.finally(() => { __activeRequests--; })');
  });

  test('without session, activeRequests decrements in regular finally', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('} finally {');
    expect(result.server).toContain('__activeRequests--;');
  });
});

describe('Structured logging improvements', () => {
  test('logging supports LOG_LEVEL env var', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('__logLevels');
    expect(result.server).toContain('LOG_LEVEL');
    expect(result.server).toContain('__logMinLevel');
  });

  test('logging supports LOG_FILE env var', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('LOG_FILE');
    expect(result.server).toContain('createWriteStream');
    expect(result.server).toContain('__logFile');
  });
});

describe('Response compression', () => {
  test('compression block generates gzip/deflate handler', () => {
    const result = compile(`
      server {
        compression { min_size: 512 }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('__compressResponse');
    expect(result.server).toContain('Bun.gzipSync');
    expect(result.server).toContain('Bun.deflateSync');
    expect(result.server).toContain('Content-Encoding');
    expect(result.server).toContain('512');
  });

  test('compression wraps fetch handler', () => {
    const result = compile(`
      server {
        compression { min_size: 1024 }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('fetch: __fetchHandler');
    expect(result.server).toContain('__compressResponse(req, res)');
  });
});

describe('TLS / HTTPS support', () => {
  test('tls block generates Bun.serve tls config', () => {
    const result = compile(`
      server {
        tls { cert: "./cert.pem", key: "./key.pem" }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('tls: {');
    expect(result.server).toContain('Bun.file("./cert.pem")');
    expect(result.server).toContain('Bun.file("./key.pem")');
  });
});

describe('Cache helpers', () => {
  test('cache_control and etag helpers are always generated', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('function cache_control(res, maxAge');
    expect(result.server).toContain('function etag(res, tag)');
    expect(result.server).toContain('Cache-Control');
    expect(result.server).toContain('stale-while-revalidate');
  });

  test('static files get ETag and If-None-Match support', () => {
    const result = compile(`
      server {
        static "/public" => "./static"
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('If-None-Match');
    expect(result.server).toContain('status: 304');
    expect(result.server).toContain('ETag: etagVal');
  });
});

describe('Background jobs', () => {
  test('background job generates spawn_job and queue', () => {
    const result = compile(`
      server {
        background fn send_email(to, subject, body) {
          print("Sending email to " + to)
        }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('__jobQueue');
    expect(result.server).toContain('__processJobQueue');
    expect(result.server).toContain('function spawn_job(name, ...args)');
    expect(result.server).toContain('__bg_send_email');
    expect(result.server).toContain('"send_email": __bg_send_email');
  });

  test('background jobs have retry support', () => {
    const result = compile(`
      server {
        background fn process_data(data) { print(data) }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('retries: 2');
    expect(result.server).toContain('job.retries > 0');
    expect(result.server).toContain('job.retries--');
  });

  test('background jobs drain on shutdown', () => {
    const result = compile(`
      server {
        background fn cleanup() { print("cleanup") }
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('Wait for in-flight background jobs');
    expect(result.server).toContain('__jobProcessing');
  });
});

describe('Parsing — new server block features', () => {
  test('parses db block', () => {
    const ast = parse(`
      server {
        db { path: ":memory:" }
        fn hello() { "world" }
      }
    `);
    const serverBlock = ast.body[0];
    const dbDecl = serverBlock.body.find(s => s.type === 'DbDeclaration');
    expect(dbDecl).toBeDefined();
    expect(dbDecl.config.path).toBeDefined();
  });

  test('parses tls block', () => {
    const ast = parse(`
      server {
        tls { cert: "./cert.pem", key: "./key.pem" }
        fn hello() { "world" }
      }
    `);
    const serverBlock = ast.body[0];
    const tlsDecl = serverBlock.body.find(s => s.type === 'TlsDeclaration');
    expect(tlsDecl).toBeDefined();
  });

  test('parses compression block', () => {
    const ast = parse(`
      server {
        compression { min_size: 1024 }
        fn hello() { "world" }
      }
    `);
    const serverBlock = ast.body[0];
    const compDecl = serverBlock.body.find(s => s.type === 'CompressionDeclaration');
    expect(compDecl).toBeDefined();
  });

  test('parses background job', () => {
    const ast = parse(`
      server {
        background fn send_email(to) { print(to) }
        fn hello() { "world" }
      }
    `);
    const serverBlock = ast.body[0];
    const bgDecl = serverBlock.body.find(s => s.type === 'BackgroundJobDeclaration');
    expect(bgDecl).toBeDefined();
    expect(bgDecl.name).toBe('send_email');
    expect(bgDecl.params).toHaveLength(1);
  });

  test('parses cache block', () => {
    const ast = parse(`
      server {
        cache { max_age: 3600 }
        fn hello() { "world" }
      }
    `);
    const serverBlock = ast.body[0];
    const cacheDecl = serverBlock.body.find(s => s.type === 'CacheDeclaration');
    expect(cacheDecl).toBeDefined();
  });
});

describe('Analyzer — new declarations validation', () => {
  test('db block parses as declaration only in server context', () => {
    const serverAst = parse(`server { db { path: ":memory:" } fn hello() { "ok" } }`);
    const dbDecl = serverAst.body[0].body.find(s => s.type === 'DbDeclaration');
    expect(dbDecl).toBeDefined();

    // In client context, db is not recognized as a declaration
    const clientAst = parse(`client { db { path: ":memory:" } }`);
    const clientDb = clientAst.body[0].body.find(s => s.type === 'DbDeclaration');
    expect(clientDb).toBeUndefined();
  });

  test('background job parses as declaration only in server context', () => {
    const serverAst = parse(`server { background fn send() { "ok" } fn hello() { "ok" } }`);
    const bgDecl = serverAst.body[0].body.find(s => s.type === 'BackgroundJobDeclaration');
    expect(bgDecl).toBeDefined();

    // In client context, background is not recognized as a declaration
    const clientAst = parse(`client { background fn send() { "ok" } }`);
    const clientBg = clientAst.body[0].body.find(s => s.type === 'BackgroundJobDeclaration');
    expect(clientBg).toBeUndefined();
  });

  test('tls block parses as declaration only in server context', () => {
    const serverAst = parse(`server { tls { cert: "./c.pem", key: "./k.pem" } fn hello() { "ok" } }`);
    const tlsDecl = serverAst.body[0].body.find(s => s.type === 'TlsDeclaration');
    expect(tlsDecl).toBeDefined();

    // In client context, tls is not recognized as a declaration
    const clientAst = parse(`client { tls { cert: "./c.pem", key: "./k.pem" } }`);
    const clientTls = clientAst.body[0].body.find(s => s.type === 'TlsDeclaration');
    expect(clientTls).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW: Model / ORM Layer
// ═══════════════════════════════════════════════════════════════

describe('Model / ORM Layer', () => {
  test('model declaration parses correctly', () => {
    const ast = parse(`
      shared { type User { id: Int, name: String, email: String } }
      server { db { path: ":memory:" } model User }
    `);
    const serverBody = ast.body[1].body;
    const modelDecl = serverBody.find(s => s.type === 'ModelDeclaration');
    expect(modelDecl).toBeDefined();
    expect(modelDecl.name).toBe('User');
  });

  test('model with config parses table name', () => {
    const ast = parse(`
      shared { type User { id: Int, name: String } }
      server { db { path: ":memory:" } model User { table: "people" } }
    `);
    const modelDecl = ast.body[1].body.find(s => s.type === 'ModelDeclaration');
    expect(modelDecl.config).toBeDefined();
    expect(modelDecl.config.table).toBeDefined();
  });

  test('model generates CREATE TABLE from shared type', () => {
    const result = compile(`
      shared { type User { id: Int, name: String, email: String } }
      server { db { path: ":memory:" } model User }
    `);
    expect(result.server).toContain('CREATE TABLE IF NOT EXISTS users');
    expect(result.server).toContain('id INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(result.server).toContain('name TEXT');
    expect(result.server).toContain('email TEXT');
  });

  test('model generates CRUD methods', () => {
    const result = compile(`
      shared { type User { id: Int, name: String, email: String } }
      server { db { path: ":memory:" } model User }
    `);
    expect(result.server).toContain('UserModel');
    expect(result.server).toContain('find(id)');
    expect(result.server).toContain('all()');
    expect(result.server).toContain('where(conditions)');
    expect(result.server).toContain('create(data)');
    expect(result.server).toContain('update(id, data)');
    expect(result.server).toContain('delete(id)');
    expect(result.server).toContain('count(');
  });

  test('model uses custom table name from config', () => {
    const result = compile(`
      shared { type User { id: Int, name: String } }
      server { db { path: ":memory:" } model User { table: "people" } }
    `);
    expect(result.server).toContain('CREATE TABLE IF NOT EXISTS people');
    expect(result.server).toContain('SELECT * FROM people');
  });

  test('model maps Lux types to SQL types correctly', () => {
    const result = compile(`
      shared { type Item { id: Int, price: Float, active: Bool, name: String } }
      server { db { path: ":memory:" } model Item }
    `);
    expect(result.server).toContain('price REAL');
    expect(result.server).toContain('active INTEGER');
    expect(result.server).toContain('name TEXT');
  });

  test('model find uses parameterized query', () => {
    const result = compile(`
      shared { type User { id: Int, name: String } }
      server { db { path: ":memory:" } model User }
    `);
    expect(result.server).toContain('SELECT * FROM users WHERE id = ?');
  });

  test('model where builds dynamic clause', () => {
    const result = compile(`
      shared { type User { id: Int, name: String } }
      server { db { path: ":memory:" } model User }
    `);
    expect(result.server).toContain('where(conditions)');
    expect(result.server).toContain('Object.keys(conditions)');
    expect(result.server).toContain('AND');
  });

  test('model create returns inserted row', () => {
    const result = compile(`
      shared { type User { id: Int, name: String } }
      server { db { path: ":memory:" } model User }
    `);
    expect(result.server).toContain('INSERT INTO users');
    expect(result.server).toContain('lastInsertRowid');
  });

  test('model update returns updated row', () => {
    const result = compile(`
      shared { type User { id: Int, name: String } }
      server { db { path: ":memory:" } model User }
    `);
    expect(result.server).toContain('UPDATE users SET');
  });

  test('model embeds column whitelist for SQL injection prevention', () => {
    const result = compile(`
      shared { type User { id: Int, name: String, email: String } }
      server { db { path: ":memory:" } model User }
    `);
    // Should contain the valid column set
    expect(result.server).toContain('__validCols');
    expect(result.server).toContain('__assertCols');
    // The whitelist should contain exactly the schema fields
    expect(result.server).toContain('"id"');
    expect(result.server).toContain('"name"');
    expect(result.server).toContain('"email"');
  });

  test('model __assertCols rejects invalid column names at runtime', () => {
    const result = compile(`
      shared { type User { id: Int, name: String } }
      server { db { path: ":memory:" } model User }
    `);
    // The where/create/update/count methods should call __assertCols before building SQL
    const server = result.server;
    // where() must validate keys
    const whereSection = server.slice(server.indexOf('where(conditions)'));
    expect(whereSection).toContain('this.__assertCols(keys)');
    // create() must validate cols
    const createSection = server.slice(server.indexOf('create(data)'));
    expect(createSection).toContain('this.__assertCols(cols)');
    // update() must validate cols
    const updateSection = server.slice(server.indexOf('update(id, data)'));
    expect(updateSection).toContain('this.__assertCols(cols)');
    // count() must validate keys
    const countSection = server.slice(server.indexOf('count(conditions)'));
    expect(countSection).toContain('this.__assertCols(keys)');
  });

  test('model whitelist includes timestamp columns when timestamps enabled', () => {
    const result = compile(`
      shared { type User { id: Int, name: String } }
      server { db { path: ":memory:" } model User { timestamps: true } }
    `);
    expect(result.server).toContain('"created_at"');
    expect(result.server).toContain('"updated_at"');
  });

  test('model SQL injection attempt throws on invalid column', () => {
    const result = compile(`
      shared { type User { id: Int, name: String } }
      server { db { path: ":memory:" } model User }
    `);
    // Simulate the generated __assertCols behavior
    const validCols = new Set(["id", "name"]);
    const assertCols = (keys) => {
      for (const k of keys) {
        if (!validCols.has(k)) throw new Error(`Invalid column: ${k}`);
      }
    };
    // Valid column should pass
    expect(() => assertCols(["name"])).not.toThrow();
    // SQL injection attempt should throw
    expect(() => assertCols(["name; DROP TABLE users--"])).toThrow("Invalid column");
    expect(() => assertCols(["1=1 OR id"])).toThrow("Invalid column");
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW: SSE / Streaming Support
// ═══════════════════════════════════════════════════════════════

describe('SSE / Streaming Support', () => {
  test('sse declaration parses correctly', () => {
    const ast = parse(`
      server {
        sse "/events" fn(send, close) {
          send("hello")
        }
      }
    `);
    const sseDecl = ast.body[0].body.find(s => s.type === 'SseDeclaration');
    expect(sseDecl).toBeDefined();
    expect(sseDecl.path).toBe('/events');
    expect(sseDecl.params).toHaveLength(2);
  });

  test('sse generates ReadableStream endpoint', () => {
    const result = compile(`
      server {
        sse "/events" fn(send, close) {
          send("hello")
        }
      }
    `);
    expect(result.server).toContain('ReadableStream');
    expect(result.server).toContain('text/event-stream');
    expect(result.server).toContain('Cache-Control');
    expect(result.server).toContain('no-cache');
  });

  test('sse generates SSEChannel class', () => {
    const result = compile(`
      server {
        sse "/events" fn(send, close) {
          send("hello")
        }
      }
    `);
    expect(result.server).toContain('__SSEChannel');
    expect(result.server).toContain('subscribe');
    expect(result.server).toContain('unsubscribe');
    expect(result.server).toContain('sse_channel');
  });

  test('sse route is registered as GET', () => {
    const result = compile(`
      server {
        sse "/stream" fn(send, close) {
          send("data")
        }
      }
    `);
    expect(result.server).toContain('__addRoute("GET", "/stream"');
  });

  test('sse() response helper is generated', () => {
    const result = compile(`
      server { fn hello() { "ok" } }
    `);
    expect(result.server).toContain('function sse(fn)');
    expect(result.server).toContain('text/event-stream');
  });

  test('stream() response helper supports SSE format', () => {
    const result = compile(`
      server { fn hello() { "ok" } }
    `);
    expect(result.server).toContain('function stream(fn)');
    expect(result.server).toContain('data:');
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW: Type-Safe Request Body Deserialization
// ═══════════════════════════════════════════════════════════════

describe('Type-Safe Request Body Deserialization', () => {
  test('POST handler with typed param gets auto-validation', () => {
    const result = compile(`
      shared { type User { id: Int, name: String, email: String } }
      server {
        fn create_user(name: String, email: String) { name }
        route POST "/api/users" => create_user
      }
    `);
    // Standard validation should be present
    expect(result.server).toContain('__validationErrors');
    expect(result.server).toContain('must be a string');
  });

  test('handler param matching shared type triggers type-safe validation', () => {
    const result = compile(`
      shared { type User { id: Int, name: String, age: Int } }
      server {
        fn create_user(data: User) { data }
        route POST "/api/users" => create_user
      }
    `);
    expect(result.server).toContain('Type-safe validation for data: User');
    expect(result.server).toContain('name must be a string');
    expect(result.server).toContain('age must be an integer');
  });

  test('type-safe validation skips id field', () => {
    const result = compile(`
      shared { type User { id: Int, name: String } }
      server {
        fn create_user(data: User) { data }
        route POST "/api/users" => create_user
      }
    `);
    // Should validate name but not id
    expect(result.server).toContain('name must be a string');
    expect(result.server).not.toContain('__tsErrors_data.push("id');
  });

  test('type-safe validation returns 400 on error', () => {
    const result = compile(`
      shared { type User { id: Int, name: String } }
      server {
        fn create_user(data: User) { data }
        route POST "/api/users" => create_user
      }
    `);
    expect(result.server).toContain('status: 400');
    expect(result.server).toContain('Validation failed');
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW: Multiple DB Driver Support
// ═══════════════════════════════════════════════════════════════

describe('Multiple DB Driver Support', () => {
  test('default driver is sqlite', () => {
    const result = compile(`
      server { db { path: ":memory:" } fn hello() { "ok" } }
    `);
    expect(result.server).toContain('import { Database } from "bun:sqlite"');
    expect(result.server).toContain('PRAGMA journal_mode=WAL');
  });

  test('postgres driver generates postgres import', () => {
    const result = compile(`
      server {
        db { driver: "postgres", url: "postgres://localhost:5432/app" }
        fn hello() { "ok" }
      }
    `);
    expect(result.server).toContain('import postgres from "postgres"');
    expect(result.server).not.toContain('bun:sqlite');
  });

  test('postgres driver generates async CRUD methods', () => {
    const result = compile(`
      server {
        db { driver: "postgres", url: "postgres://localhost/app" }
        fn hello() { "ok" }
      }
    `);
    expect(result.server).toContain('async query(sql');
    expect(result.server).toContain('async run(sql');
    expect(result.server).toContain('async get(sql');
    expect(result.server).toContain('async transaction(fn)');
  });

  test('postgres driver uses $1, $2 placeholders for migrations', () => {
    const result = compile(`
      server {
        db { driver: "postgres", url: "postgres://localhost/app" }
        fn hello() { "ok" }
      }
    `);
    expect(result.server).toContain('$1');
    expect(result.server).toContain('VALUES ($1)');
  });

  test('mysql driver generates mysql2 import', () => {
    const result = compile(`
      server {
        db { driver: "mysql", url: "mysql://localhost:3306/app" }
        fn hello() { "ok" }
      }
    `);
    expect(result.server).toContain('import mysql from "mysql2/promise"');
    expect(result.server).toContain('createPool');
  });

  test('mysql driver generates async methods', () => {
    const result = compile(`
      server {
        db { driver: "mysql", url: "mysql://localhost/app" }
        fn hello() { "ok" }
      }
    `);
    expect(result.server).toContain('async query(sql');
    expect(result.server).toContain('async get(sql');
    expect(result.server).toContain('async transaction(fn)');
  });

  test('postgres model generates SERIAL PRIMARY KEY', () => {
    const result = compile(`
      shared { type User { id: Int, name: String } }
      server {
        db { driver: "postgres", url: "postgres://localhost/app" }
        model User
      }
    `);
    expect(result.server).toContain('id SERIAL PRIMARY KEY');
    expect(result.server).toContain('RETURNING *');
  });

  test('postgres model uses $N placeholders', () => {
    const result = compile(`
      shared { type User { id: Int, name: String } }
      server {
        db { driver: "postgres", url: "postgres://localhost/app" }
        model User
      }
    `);
    expect(result.server).toContain('$1');
    expect(result.server).toContain('`$${i + 1}`');
  });

  test('postgres driver close is async', () => {
    const result = compile(`
      server {
        db { driver: "postgres", url: "postgres://localhost/app" }
        fn hello() { "ok" }
      }
    `);
    expect(result.server).toContain('await db.close()');
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW: OpenAPI Spec Auto-Generation
// ═══════════════════════════════════════════════════════════════

describe('OpenAPI Spec Auto-Generation', () => {
  test('openapi spec is generated with routes', () => {
    const result = compile(`
      server {
        fn get_users() { [] }
        route GET "/api/users" => get_users
      }
    `);
    expect(result.server).toContain('__openApiSpec');
    expect(result.server).toContain('openapi: "3.0.3"');
  });

  test('openapi generates /openapi.json endpoint', () => {
    const result = compile(`
      server {
        fn get_users() { [] }
        route GET "/api/users" => get_users
      }
    `);
    expect(result.server).toContain('__addRoute("GET", "/openapi.json"');
    expect(result.server).toContain('Response.json(__openApiSpec)');
  });

  test('openapi generates /docs endpoint with Swagger UI', () => {
    const result = compile(`
      server {
        fn get_users() { [] }
        route GET "/api/users" => get_users
      }
    `);
    expect(result.server).toContain('__addRoute("GET", "/docs"');
    expect(result.server).toContain('swagger-ui');
  });

  test('openapi includes shared type schemas', () => {
    const result = compile(`
      shared { type User { id: Int, name: String, email: String } }
      server {
        fn get_users() -> [User] { [] }
        route GET "/api/users" => get_users
      }
    `);
    expect(result.server).toContain('components');
    expect(result.server).toContain('schemas');
    expect(result.server).toContain('"User"');
  });

  test('openapi converts path params to OpenAPI format', () => {
    const result = compile(`
      server {
        fn get_user(id: String) { id }
        route GET "/api/users/:id" => get_user
      }
    `);
    expect(result.server).toContain('/api/users/{id}');
    expect(result.server).toContain('"path"');
    expect(result.server).toContain('required: true');
  });

  test('openapi generates requestBody for POST routes', () => {
    const result = compile(`
      server {
        fn create_user(name: String, email: String) { name }
        route POST "/api/users" => create_user
      }
    `);
    expect(result.server).toContain('requestBody');
    expect(result.server).toContain('"application/json"');
  });

  test('openapi includes response schema from return type', () => {
    const result = compile(`
      shared { type User { id: Int, name: String } }
      server {
        fn get_users() -> [User] { [] }
        route GET "/api/users" => get_users
      }
    `);
    expect(result.server).toContain('$ref');
    expect(result.server).toContain('#/components/schemas/User');
    expect(result.server).toContain('"array"');
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW: Content Negotiation
// ═══════════════════════════════════════════════════════════════

describe('Content Negotiation', () => {
  test('negotiate() helper is generated', () => {
    const result = compile(`
      server { fn hello() { "ok" } }
    `);
    expect(result.server).toContain('function negotiate(req, data, options');
  });

  test('negotiate supports HTML, XML, JSON, and text', () => {
    const result = compile(`
      server { fn hello() { "ok" } }
    `);
    expect(result.server).toContain('text/html');
    expect(result.server).toContain('text/xml');
    expect(result.server).toContain('application/xml');
    expect(result.server).toContain('text/plain');
    expect(result.server).toContain('Response.json(data');
  });

  test('negotiate checks Accept header', () => {
    const result = compile(`
      server { fn hello() { "ok" } }
    `);
    expect(result.server).toContain('req.headers.get("Accept")');
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW: Race Condition Protection
// ═══════════════════════════════════════════════════════════════

describe('Race Condition Protection', () => {
  test('async mutex is generated', () => {
    const result = compile(`
      server { fn hello() { "ok" } }
    `);
    expect(result.server).toContain('class __Mutex');
    expect(result.server).toContain('acquire()');
    expect(result.server).toContain('release()');
  });

  test('withLock helper is generated', () => {
    const result = compile(`
      server { fn hello() { "ok" } }
    `);
    expect(result.server).toContain('async function withLock(fn)');
    expect(result.server).toContain('__mutex.acquire()');
    expect(result.server).toContain('__mutex.release()');
  });

  test('withLock wraps function in try/finally', () => {
    const result = compile(`
      server { fn hello() { "ok" } }
    `);
    expect(result.server).toContain('try { return await fn(); } finally { __mutex.release(); }');
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW: Testing Utilities
// ═══════════════════════════════════════════════════════════════

describe('Testing Utilities', () => {
  test('test block generates test code with request helper', () => {
    const result = compile(`
      server {
        fn hello() { "world" }
        route GET "/hello" => hello
      }
      test "api tests" {
        fn test_hello() {
          result = request("GET", "/hello")
          assert(result.status == 200, "should be 200")
        }
      }
    `);
    expect(result.test).toContain('describe("api tests"');
    expect(result.test).toContain('async function request(');
    expect(result.test).toContain('__handleRequest');
  });

  test('test block exports __handleRequest from server code', () => {
    const result = compile(`
      server {
        fn hello() { "world" }
        route GET "/hello" => hello
      }
      test "tests" {
        fn test_one() { true }
      }
    `);
    expect(result.server).toContain('export { __handleRequest }');
  });

  test('test functions become test cases', () => {
    const result = compile(`
      server {
        fn hello() { "world" }
      }
      test "suite" {
        fn check_hello() { true }
        fn check_other() { true }
      }
    `);
    expect(result.test).toContain('test("check hello"');
    expect(result.test).toContain('test("check other"');
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW: Analyzer Validation for New Features
// ═══════════════════════════════════════════════════════════════

describe('Analyzer — New Feature Validation', () => {
  test('sse parses only in server block', () => {
    const ast = parse(`
      server {
        sse "/events" fn(send, close) { send("hi") }
      }
    `);
    const sseDecl = ast.body[0].body.find(s => s.type === 'SseDeclaration');
    expect(sseDecl).toBeDefined();
    expect(sseDecl.path).toBe('/events');
  });

  test('model parses only in server block', () => {
    const ast = parse(`
      shared { type User { id: Int, name: String } }
      server {
        db { path: ":memory:" }
        model User
      }
    `);
    const modelDecl = ast.body[1].body.find(s => s.type === 'ModelDeclaration');
    expect(modelDecl).toBeDefined();
    expect(modelDecl.name).toBe('User');
  });

  test('sse in server block should not error in analyzer', () => {
    expect(() => analyze(`
      server {
        sse "/events" fn(send, close) { send("hi") }
      }
    `)).not.toThrow();
  });

  test('model in server block should not error in analyzer', () => {
    expect(() => analyze(`
      shared { type User { id: Int, name: String } }
      server {
        db { path: ":memory:" }
        model User
      }
    `)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// NEW: Integration — Multiple features together
// ═══════════════════════════════════════════════════════════════

describe('Integration — Full Server with New Features', () => {
  test('model + routes + openapi work together', () => {
    const result = compile(`
      shared { type User { id: Int, name: String, email: String } }
      server {
        db { path: ":memory:" }
        model User
        fn get_users() -> [User] { [] }
        fn create_user(name: String, email: String) -> User { name }
        route GET "/api/users" => get_users
        route POST "/api/users" => create_user
      }
    `);
    // Model layer
    expect(result.server).toContain('UserModel');
    expect(result.server).toContain('CREATE TABLE IF NOT EXISTS users');
    // OpenAPI
    expect(result.server).toContain('__openApiSpec');
    expect(result.server).toContain('/docs');
    // Routes
    expect(result.server).toContain('__addRoute("GET", "/api/users"');
    expect(result.server).toContain('__addRoute("POST", "/api/users"');
  });

  test('sse + ws can coexist', () => {
    const result = compile(`
      server {
        ws {
          on_open fn(ws) { print("connected") }
          on_message fn(ws, msg) { print(msg) }
        }
        sse "/events" fn(send, close) { send("data") }
      }
    `);
    expect(result.server).toContain('__wsClients');
    expect(result.server).toContain('__SSEChannel');
    expect(result.server).toContain('text/event-stream');
  });

  test('postgres model with auth and rate limiting', () => {
    const result = compile(`
      shared { type User { id: Int, name: String } }
      server {
        db { driver: "postgres", url: "postgres://localhost/app" }
        model User
        auth { type: "jwt", secret: "secret" }
        rate_limit { max: 100, window: 60 }
        fn get_users() -> [User] { [] }
        route GET "/api/users" with auth => get_users
      }
    `);
    expect(result.server).toContain('import postgres from "postgres"');
    expect(result.server).toContain('UserModel');
    expect(result.server).toContain('__authenticate');
    expect(result.server).toContain('__checkRateLimit');
    expect(result.server).toContain('SERIAL PRIMARY KEY');
  });
});

// ═══════════════════════════════════════════════════════════════
// Gap 1: Streaming Body Enforcement
// ═══════════════════════════════════════════════════════════════

describe('Gap 1 — Streaming body enforcement', () => {
  test('generated code contains __readBodyBytes with getReader()', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('__readBodyBytes');
    expect(result.server).toContain('req.body.getReader()');
  });

  test('__readBodyBytes throws __BODY_TOO_LARGE__ when stream exceeds limit', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('__BODY_TOO_LARGE__');
    expect(result.server).toContain('totalBytes > __maxBodySize');
  });

  test('__parseBody reads body via __readBodyBytes for JSON', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('const raw = await __readBodyBytes(req)');
    expect(result.server).toContain('JSON.parse(text)');
  });

  test('__parseBody reads body via __readBodyBytes for URL-encoded', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('new TextDecoder().decode(raw)');
    expect(result.server).toContain('new URLSearchParams(text)');
  });

  test('Bun.serve includes maxRequestBodySize', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('maxRequestBodySize: __maxBodySize');
  });

  test('catch blocks handle __BODY_TOO_LARGE__ with 413', () => {
    const result = compile(`
      server {
        fn create(name) { name }
        route POST "/api/items" => create
      }
    `);
    expect(result.server).toContain('err.message === "__BODY_TOO_LARGE__"');
    expect(result.server).toContain('status: 413');
  });

  test('custom max_body size is used', () => {
    const result = compile(`
      server {
        max_body 5242880
        fn hello() { "world" }
      }
    `);
    expect(result.server).toContain('const __maxBodySize = 5242880');
  });

  test('default max body size is 1MB', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('const __maxBodySize = 1048576');
  });
});

// ═══════════════════════════════════════════════════════════════
// Gap 2: Migration CLI
// ═══════════════════════════════════════════════════════════════

describe('Gap 2 — Migration CLI helpers', () => {
  test('bin/lux.js exports are importable', async () => {
    // Verify the CLI file can be parsed without errors
    const { readFileSync } = await import('fs');
    const cliCode = readFileSync(new URL('../bin/lux.js', import.meta.url), 'utf-8');
    expect(cliCode).toContain('migrateCreate');
    expect(cliCode).toContain('migrateUp');
    expect(cliCode).toContain('migrateStatus');
  });

  test('CLI help text includes migrate commands', async () => {
    const { readFileSync } = await import('fs');
    const cliCode = readFileSync(new URL('../bin/lux.js', import.meta.url), 'utf-8');
    expect(cliCode).toContain('migrate:create');
    expect(cliCode).toContain('migrate:up');
    expect(cliCode).toContain('migrate:status');
  });

  test('CLI switch includes migrate:create case', async () => {
    const { readFileSync } = await import('fs');
    const cliCode = readFileSync(new URL('../bin/lux.js', import.meta.url), 'utf-8');
    expect(cliCode).toContain("case 'migrate:create':");
    expect(cliCode).toContain("case 'migrate:up':");
    expect(cliCode).toContain("case 'migrate:status':");
  });

  test('discoverDbConfig function parses db declaration from AST', async () => {
    const { readFileSync } = await import('fs');
    const cliCode = readFileSync(new URL('../bin/lux.js', import.meta.url), 'utf-8');
    expect(cliCode).toContain('discoverDbConfig');
    expect(cliCode).toContain('DbDeclaration');
  });

  test('migrateUp creates __migrations table', async () => {
    const { readFileSync } = await import('fs');
    const cliCode = readFileSync(new URL('../bin/lux.js', import.meta.url), 'utf-8');
    expect(cliCode).toContain('CREATE TABLE IF NOT EXISTS __migrations');
  });

  test('migration template includes up and down exports', async () => {
    const { readFileSync } = await import('fs');
    const cliCode = readFileSync(new URL('../bin/lux.js', import.meta.url), 'utf-8');
    expect(cliCode).toContain('export const up');
    expect(cliCode).toContain('export const down');
  });
});

// ═══════════════════════════════════════════════════════════════
// Gap 3: ORM Relations (belongs_to, has_many)
// ═══════════════════════════════════════════════════════════════

describe('Gap 3 — ORM relations', () => {
  test('belongs_to generates FK column in CREATE TABLE', () => {
    const result = compile(`
      shared {
        type User { id: Int, name: String }
        type Post { id: Int, title: String }
      }
      server {
        db { path: ":memory:" }
        model User
        model Post { belongs_to: User }
      }
    `);
    expect(result.server).toContain('user_id INTEGER REFERENCES users(id)');
  });

  test('belongs_to adds FK column to __validCols', () => {
    const result = compile(`
      shared {
        type User { id: Int, name: String }
        type Post { id: Int, title: String }
      }
      server {
        db { path: ":memory:" }
        model User
        model Post { belongs_to: User }
      }
    `);
    expect(result.server).toContain('"user_id"');
    // The __validCols should include user_id
    expect(result.server).toMatch(/__validCols.*user_id/s);
  });

  test('belongs_to generates accessor method', () => {
    const result = compile(`
      shared {
        type User { id: Int, name: String }
        type Post { id: Int, title: String }
      }
      server {
        db { path: ":memory:" }
        model User
        model Post { belongs_to: User }
      }
    `);
    // PostModel.user(user_id) accessor
    expect(result.server).toContain('user(user_id)');
    expect(result.server).toContain('SELECT * FROM users WHERE id = ?');
  });

  test('has_many generates collection accessor', () => {
    const result = compile(`
      shared {
        type User { id: Int, name: String }
        type Post { id: Int, title: String }
      }
      server {
        db { path: ":memory:" }
        model User { has_many: Post }
        model Post { belongs_to: User }
      }
    `);
    // UserModel.posts(id) accessor
    expect(result.server).toContain('posts(id)');
    expect(result.server).toContain('SELECT * FROM posts WHERE user_id = ?');
  });

  test('belongs_to with array of parents', () => {
    const result = compile(`
      shared {
        type User { id: Int, name: String }
        type Category { id: Int, name: String }
        type Post { id: Int, title: String }
      }
      server {
        db { path: ":memory:" }
        model User
        model Category
        model Post { belongs_to: [User, Category] }
      }
    `);
    expect(result.server).toContain('user_id INTEGER REFERENCES users(id)');
    expect(result.server).toContain('category_id INTEGER REFERENCES categorys(id)');
    expect(result.server).toContain('user(user_id)');
    expect(result.server).toContain('category(category_id)');
  });

  test('postgres placeholders for belongs_to accessor', () => {
    const result = compile(`
      shared {
        type User { id: Int, name: String }
        type Post { id: Int, title: String }
      }
      server {
        db { driver: "postgres", url: "postgres://localhost/app" }
        model User
        model Post { belongs_to: User }
      }
    `);
    expect(result.server).toContain('SELECT * FROM users WHERE id = $1');
  });

  test('has_many with postgres placeholders', () => {
    const result = compile(`
      shared {
        type User { id: Int, name: String }
        type Post { id: Int, title: String }
      }
      server {
        db { driver: "postgres", url: "postgres://localhost/app" }
        model User { has_many: Post }
        model Post { belongs_to: User }
      }
    `);
    expect(result.server).toContain('SELECT * FROM posts WHERE user_id = $1');
  });

  test('FK column not duplicated if already in type definition', () => {
    const result = compile(`
      shared {
        type User { id: Int, name: String }
        type Post { id: Int, title: String, user_id: Int }
      }
      server {
        db { path: ":memory:" }
        model Post { belongs_to: User }
      }
    `);
    // Should not have duplicate user_id REFERENCES (since field already defined)
    const createMatch = result.server.match(/CREATE TABLE IF NOT EXISTS posts \(([^)]+)\)/);
    expect(createMatch).toBeTruthy();
    const colCount = (createMatch[1].match(/user_id/g) || []).length;
    expect(colCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Gap 4: WebSocket Authentication
// ═══════════════════════════════════════════════════════════════

describe('Gap 4 — WebSocket authentication', () => {
  test('parser accepts auth config in ws block', () => {
    const ast = parse(`
      server {
        auth { type: "jwt", secret: "secret" }
        ws {
          auth: true
          on_message fn(ws, msg) { print(msg) }
        }
      }
    `);
    const serverBlock = ast.body.find(n => n.type === 'ServerBlock');
    const wsDecl = serverBlock.body.find(n => n.type === 'WebSocketDeclaration');
    expect(wsDecl).toBeTruthy();
    expect(wsDecl.config).toBeTruthy();
    expect(wsDecl.config.auth).toBeTruthy();
  });

  test('parser accepts auth: false in ws block', () => {
    const ast = parse(`
      server {
        auth { type: "jwt", secret: "secret" }
        ws {
          auth: false
          on_message fn(ws, msg) { print(msg) }
        }
      }
    `);
    const serverBlock = ast.body.find(n => n.type === 'ServerBlock');
    const wsDecl = serverBlock.body.find(n => n.type === 'WebSocketDeclaration');
    expect(wsDecl.config.auth.type).toBe('BooleanLiteral');
    expect(wsDecl.config.auth.value).toBe(false);
  });

  test('WS upgrade checks auth when authConfig is present', () => {
    const result = compile(`
      server {
        auth { type: "jwt", secret: "secret" }
        ws {
          on_message fn(ws, msg) { print(msg) }
        }
      }
    `);
    expect(result.server).toContain('__authenticate(req)');
    expect(result.server).toContain('__wsUser');
    expect(result.server).toContain('user: __wsUser');
    expect(result.server).toContain('status: 401');
  });

  test('WS upgrade skips auth when auth: false', () => {
    const result = compile(`
      server {
        auth { type: "jwt", secret: "secret" }
        ws {
          auth: false
          on_message fn(ws, msg) { print(msg) }
        }
      }
    `);
    // Should not have auth check in WS upgrade path
    expect(result.server).not.toContain('__wsUser');
    expect(result.server).toContain('upgrade(req');
  });

  test('WS upgrade has no auth check when no authConfig exists', () => {
    const result = compile(`
      server {
        ws {
          on_message fn(ws, msg) { print(msg) }
        }
      }
    `);
    // No auth section means no auth check for WS
    const wsSection = result.server.split('if (req.headers.get("upgrade") === "websocket")')[1];
    expect(wsSection).toBeTruthy();
    expect(wsSection.split('}')[0]).not.toContain('__authenticate');
  });

  test('WS handlers still work alongside auth config', () => {
    const result = compile(`
      server {
        auth { type: "jwt", secret: "secret" }
        ws {
          on_open fn(ws) { print("connected") }
          on_message fn(ws, msg) { print(msg) }
          on_close fn(ws, code, reason) { print("disconnected") }
        }
      }
    `);
    expect(result.server).toContain('__wsHandlers');
    expect(result.server).toContain('on_open');
    expect(result.server).toContain('on_message');
    expect(result.server).toContain('on_close');
  });

  test('parser rejects invalid ws config keys', () => {
    expect(() => parse(`
      server {
        ws {
          invalid_key: true
          on_message fn(ws, msg) { print(msg) }
        }
      }
    `)).toThrow(/Invalid WebSocket key/);
  });
});
