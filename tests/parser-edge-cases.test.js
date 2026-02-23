import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function parseExpr(source) {
  const ast = parse(source);
  return ast.body[0]?.expression || ast.body[0];
}

function parseThrows(source) {
  return () => parse(source);
}

// ─── Server Declaration Parsing ─────────────────────────────

describe('Parser — Server Middleware', () => {
  test('middleware declaration', () => {
    const ast = parse('server { middleware fn logger(req, next) { next(req) } }');
    const mw = ast.body[0].body[0];
    expect(mw.type).toBe('MiddlewareDeclaration');
    expect(mw.name).toBe('logger');
    expect(mw.params.length).toBe(2);
  });

  test('middleware with typed params', () => {
    const ast = parse('server { middleware fn auth(req: Request, next) { next(req) } }');
    const mw = ast.body[0].body[0];
    expect(mw.params[0].typeAnnotation.name).toBe('Request');
  });
});

describe('Parser — Server Health Check', () => {
  test('health check declaration', () => {
    const ast = parse('server { health "/health" }');
    const hc = ast.body[0].body[0];
    expect(hc.type).toBe('HealthCheckDeclaration');
    expect(hc.path).toBe('/health');
  });
});

describe('Parser — Server CORS', () => {
  test('cors config', () => {
    const ast = parse('server { cors { origins: ["*"], methods: ["GET", "POST"] } }');
    const cors = ast.body[0].body[0];
    expect(cors.type).toBe('CorsDeclaration');
    expect(cors.config.origins).toBeDefined();
    expect(cors.config.methods).toBeDefined();
  });

  test('cors with headers', () => {
    const ast = parse('server { cors { origins: ["http://localhost"], headers: ["Content-Type"] } }');
    const cors = ast.body[0].body[0];
    expect(cors.config.headers).toBeDefined();
  });
});

describe('Parser — Server Error Handler', () => {
  test('on_error declaration', () => {
    const ast = parse('server { on_error fn(err, req) { respond(500, err) } }');
    const eh = ast.body[0].body[0];
    expect(eh.type).toBe('ErrorHandlerDeclaration');
    expect(eh.params.length).toBe(2);
  });
});

describe('Parser — Server WebSocket', () => {
  test('websocket with handlers', () => {
    const ast = parse(`server { ws {
      on_open fn(conn) { print("open") }
      on_message fn(conn, msg) { print(msg) }
      on_close fn(conn) { print("closed") }
    } }`);
    const ws = ast.body[0].body[0];
    expect(ws.type).toBe('WebSocketDeclaration');
    expect(ws.handlers.on_open).toBeDefined();
    expect(ws.handlers.on_message).toBeDefined();
    expect(ws.handlers.on_close).toBeDefined();
  });

  test('websocket with auth config', () => {
    const ast = parse(`server { ws {
      auth: verify_token
      on_message fn(conn, msg) { print(msg) }
    } }`);
    const ws = ast.body[0].body[0];
    expect(ws.config.auth).toBeDefined();
  });

  test('websocket with on_error handler', () => {
    const ast = parse(`server { ws {
      on_error fn(conn, err) { print(err) }
    } }`);
    const ws = ast.body[0].body[0];
    expect(ws.handlers.on_error).toBeDefined();
  });
});

describe('Parser — Server Static Files', () => {
  test('static file declaration', () => {
    const ast = parse('server { static "/public" => "./public" }');
    const s = ast.body[0].body[0];
    expect(s.type).toBe('StaticDeclaration');
    expect(s.path).toBe('/public');
    expect(s.dir).toBe('./public');
  });

  test('static with fallback', () => {
    const ast = parse('server { static "/app" => "./dist" fallback "index.html" }');
    const s = ast.body[0].body[0];
    expect(s.fallback).toBe('index.html');
  });
});

describe('Parser — Server Discover', () => {
  test('discover declaration', () => {
    const ast = parse('server { discover "peer" at "http://peer:3000" }');
    const d = ast.body[0].body[0];
    expect(d.type).toBe('DiscoverDeclaration');
    expect(d.peerName).toBe('peer');
  });

  test('discover with config', () => {
    const ast = parse('server { discover "peer" at "http://peer:3000" with { timeout: 5000 } }');
    const d = ast.body[0].body[0];
    expect(d.config.timeout).toBeDefined();
  });
});

describe('Parser — Server Auth', () => {
  test('auth config', () => {
    const ast = parse('server { auth { type: "jwt", secret: "mykey" } }');
    const a = ast.body[0].body[0];
    expect(a.type).toBe('AuthDeclaration');
    expect(a.config.type).toBeDefined();
    expect(a.config.secret).toBeDefined();
  });
});

describe('Parser — Server Max Body', () => {
  test('max_body declaration', () => {
    const ast = parse('server { max_body 1024 }');
    const mb = ast.body[0].body[0];
    expect(mb.type).toBe('MaxBodyDeclaration');
  });

  test('max_body with expression', () => {
    const ast = parse('server { max_body 1024 * 1024 }');
    const mb = ast.body[0].body[0];
    expect(mb.limit.type).toBe('BinaryExpression');
  });
});

describe('Parser — Server Route Group', () => {
  test('route group with routes', () => {
    const ast = parse(`server { routes "/api/v1" {
      route GET "/users" => get_users
      route POST "/users" => create_user
    } }`);
    const rg = ast.body[0].body[0];
    expect(rg.type).toBe('RouteGroupDeclaration');
    expect(rg.prefix).toBe('/api/v1');
    expect(rg.body.length).toBe(2);
  });
});

describe('Parser — Server Rate Limit', () => {
  test('rate_limit config', () => {
    const ast = parse('server { rate_limit { requests: 100, window: 60 } }');
    const rl = ast.body[0].body[0];
    expect(rl.type).toBe('RateLimitDeclaration');
    expect(rl.config.requests).toBeDefined();
    expect(rl.config.window).toBeDefined();
  });
});

describe('Parser — Server Lifecycle Hooks', () => {
  test('on_start hook', () => {
    const ast = parse('server { on_start fn() { print("starting") } }');
    const hook = ast.body[0].body[0];
    expect(hook.type).toBe('LifecycleHookDeclaration');
    expect(hook.hook).toBe('start');
  });

  test('on_stop hook', () => {
    const ast = parse('server { on_stop fn() { print("stopping") } }');
    const hook = ast.body[0].body[0];
    expect(hook.type).toBe('LifecycleHookDeclaration');
    expect(hook.hook).toBe('stop');
  });
});

describe('Parser — Server Subscribe', () => {
  test('subscribe declaration', () => {
    const ast = parse('server { subscribe "user_created" fn(event) { print(event) } }');
    const sub = ast.body[0].body[0];
    expect(sub.type).toBe('SubscribeDeclaration');
    expect(sub.event).toBe('user_created');
  });
});

describe('Parser — Server Env', () => {
  test('env declaration with type and default', () => {
    const ast = parse('server { env PORT: Int = 3000 }');
    const env = ast.body[0].body[0];
    expect(env.type).toBe('EnvDeclaration');
    expect(env.name).toBe('PORT');
    expect(env.typeAnnotation.name).toBe('Int');
    expect(env.defaultValue.value).toBe(3000);
  });

  test('env declaration without default', () => {
    const ast = parse('server { env API_KEY: String }');
    const env = ast.body[0].body[0];
    expect(env.name).toBe('API_KEY');
    expect(env.defaultValue).toBeNull();
  });
});

describe('Parser — Server Schedule', () => {
  test('schedule declaration with name', () => {
    const ast = parse('server { schedule "0 * * * *" fn cleanup() { print("cleaning") } }');
    const s = ast.body[0].body[0];
    expect(s.type).toBe('ScheduleDeclaration');
    expect(s.pattern).toBe('0 * * * *');
    expect(s.name).toBe('cleanup');
  });

  test('schedule declaration without name', () => {
    const ast = parse('server { schedule "*/5 * * * *" fn() { print("tick") } }');
    const s = ast.body[0].body[0];
    expect(s.name).toBeNull();
  });
});

describe('Parser — Server Upload', () => {
  test('upload config', () => {
    const ast = parse('server { upload { max_size: 10000000, allowed_types: ["jpg", "png"] } }');
    const u = ast.body[0].body[0];
    expect(u.type).toBe('UploadDeclaration');
    expect(u.config.max_size).toBeDefined();
    expect(u.config.allowed_types).toBeDefined();
  });
});

describe('Parser — Server Session', () => {
  test('session config', () => {
    const ast = parse('server { session { secret: "s", max_age: 3600 } }');
    const s = ast.body[0].body[0];
    expect(s.type).toBe('SessionDeclaration');
    expect(s.config.secret).toBeDefined();
    expect(s.config.max_age).toBeDefined();
  });
});

describe('Parser — Server DB', () => {
  test('db config', () => {
    const ast = parse('server { db { path: "./data.db", wal: true } }');
    const db = ast.body[0].body[0];
    expect(db.type).toBe('DbDeclaration');
    expect(db.config.path).toBeDefined();
    expect(db.config.wal).toBeDefined();
  });
});

describe('Parser — Server TLS', () => {
  test('tls config', () => {
    const ast = parse('server { tls { cert: "./cert.pem", key: "./key.pem" } }');
    const tls = ast.body[0].body[0];
    expect(tls.type).toBe('TlsDeclaration');
    expect(tls.config.cert).toBeDefined();
    expect(tls.config.key).toBeDefined();
  });
});

describe('Parser — Server Compression', () => {
  test('compression config', () => {
    const ast = parse('server { compression { enabled: true, min_size: 1024 } }');
    const c = ast.body[0].body[0];
    expect(c.type).toBe('CompressionDeclaration');
    expect(c.config.enabled).toBeDefined();
    expect(c.config.min_size).toBeDefined();
  });
});

describe('Parser — Server Background Job', () => {
  test('background job', () => {
    const ast = parse('server { background fn cleanup_old() { print("cleanup") } }');
    const bg = ast.body[0].body[0];
    expect(bg.type).toBe('BackgroundJobDeclaration');
    expect(bg.name).toBe('cleanup_old');
  });
});

describe('Parser — Server Cache', () => {
  test('cache config', () => {
    const ast = parse('server { cache { max_age: 3600, stale_while_revalidate: 86400 } }');
    const c = ast.body[0].body[0];
    expect(c.type).toBe('CacheDeclaration');
    expect(c.config.max_age).toBeDefined();
  });
});

describe('Parser — Server SSE', () => {
  test('sse declaration', () => {
    const ast = parse('server { sse "/events" fn(send, close) { send("hello") } }');
    const sse = ast.body[0].body[0];
    expect(sse.type).toBe('SseDeclaration');
    expect(sse.path).toBe('/events');
    expect(sse.params.length).toBe(2);
  });
});

describe('Parser — Server Model', () => {
  test('model declaration without config', () => {
    const ast = parse('server { model User }');
    const m = ast.body[0].body[0];
    expect(m.type).toBe('ModelDeclaration');
    expect(m.name).toBe('User');
    expect(m.config).toBeNull();
  });

  test('model declaration with config', () => {
    const ast = parse('server { model User { table: "users", timestamps: true } }');
    const m = ast.body[0].body[0];
    expect(m.name).toBe('User');
    expect(m.config.table).toBeDefined();
    expect(m.config.timestamps).toBeDefined();
  });
});

// ─── Route Decorators ───────────────────────────────────────

describe('Parser — Route Decorators', () => {
  test('route with single decorator', () => {
    const ast = parse('server { route GET "/admin" with auth => admin_page }');
    const route = ast.body[0].body[0];
    expect(route.decorators.length).toBe(1);
    expect(route.decorators[0].name).toBe('auth');
    expect(route.decorators[0].args.length).toBe(0);
  });

  test('route with decorator with arguments', () => {
    const ast = parse('server { route POST "/admin" with role("admin") => admin_action }');
    const route = ast.body[0].body[0];
    expect(route.decorators[0].name).toBe('role');
    expect(route.decorators[0].args.length).toBe(1);
  });

  test('route with multiple decorators', () => {
    const ast = parse('server { route DELETE "/item" with auth, role("admin") => delete_item }');
    const route = ast.body[0].body[0];
    expect(route.decorators.length).toBe(2);
    expect(route.decorators[0].name).toBe('auth');
    expect(route.decorators[1].name).toBe('role');
  });

  test('all HTTP methods', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    for (const method of methods) {
      const ast = parse(`server { route ${method} "/test" => handler }`);
      const route = ast.body[0].body[0];
      expect(route.method).toBe(method);
    }
  });
});

// ─── Test Block ─────────────────────────────────────────────

describe('Parser — Test Block', () => {
  test('test block with name', () => {
    const ast = parse('test "my tests" { fn test_add() { 1 + 1 } }');
    expect(ast.body[0].type).toBe('TestBlock');
    expect(ast.body[0].name).toBe('my tests');
  });

  test('test block without name', () => {
    const ast = parse('test { fn test_add() { 1 + 1 } }');
    expect(ast.body[0].type).toBe('TestBlock');
    expect(ast.body[0].name).toBeNull();
  });
});

// ─── Expression Edge Cases ──────────────────────────────────

describe('Parser — Expression edge cases', () => {
  test('deeply nested parentheses', () => {
    const expr = parseExpr('((((42))))');
    expect(expr.type).toBe('NumberLiteral');
    expect(expr.value).toBe(42);
  });

  test('complex precedence: addition and multiplication', () => {
    const expr = parseExpr('1 + 2 * 3 + 4');
    // Should be ((1 + (2 * 3)) + 4)
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('+');
    expect(expr.left.type).toBe('BinaryExpression');
    expect(expr.left.operator).toBe('+');
    expect(expr.left.right.operator).toBe('*');
  });

  test('power is right-associative', () => {
    const expr = parseExpr('2 ** 3 ** 2');
    // Should be 2 ** (3 ** 2)
    expect(expr.operator).toBe('**');
    expect(expr.right.type).toBe('BinaryExpression');
    expect(expr.right.operator).toBe('**');
  });

  test('subtraction is left-associative', () => {
    const expr = parseExpr('10 - 3 - 2');
    // Should be (10 - 3) - 2
    expect(expr.operator).toBe('-');
    expect(expr.left.type).toBe('BinaryExpression');
    expect(expr.left.operator).toBe('-');
  });

  test('mixed logical operators', () => {
    const expr = parseExpr('a and b or c and d');
    // or has lower precedence than and
    expect(expr.type).toBe('LogicalExpression');
    expect(expr.operator).toBe('or');
  });

  test('double not', () => {
    const expr = parseExpr('not not x');
    expect(expr.type).toBe('UnaryExpression');
    expect(expr.operator).toBe('not');
    expect(expr.operand.type).toBe('UnaryExpression');
  });

  test('double negation', () => {
    const expr = parseExpr('- -x');
    expect(expr.type).toBe('UnaryExpression');
    expect(expr.operator).toBe('-');
    expect(expr.operand.type).toBe('UnaryExpression');
  });

  test('chained member access', () => {
    const expr = parseExpr('a.b.c.d');
    expect(expr.type).toBe('MemberExpression');
    expect(expr.property).toBe('d');
    expect(expr.object.property).toBe('c');
    expect(expr.object.object.property).toBe('b');
  });

  test('chained optional access', () => {
    const expr = parseExpr('a?.b?.c');
    expect(expr.type).toBe('OptionalChain');
    expect(expr.property).toBe('c');
    expect(expr.object.type).toBe('OptionalChain');
  });

  test('mixed member and optional chain', () => {
    const expr = parseExpr('a.b?.c.d');
    expect(expr.type).toBe('MemberExpression');
    expect(expr.property).toBe('d');
    expect(expr.object.type).toBe('OptionalChain');
  });

  test('method call chain', () => {
    const expr = parseExpr('a.b().c().d');
    expect(expr.type).toBe('MemberExpression');
    expect(expr.property).toBe('d');
    expect(expr.object.type).toBe('CallExpression');
  });

  test('computed member access', () => {
    const expr = parseExpr('obj["key"]');
    expect(expr.type).toBe('MemberExpression');
    expect(expr.computed).toBe(true);
  });

  test('chained comparison with 3 operands', () => {
    const expr = parseExpr('1 < x < 10');
    expect(expr.type).toBe('ChainedComparison');
    expect(expr.operands.length).toBe(3);
    expect(expr.operators.length).toBe(2);
  });

  test('chained comparison with mixed operators', () => {
    const expr = parseExpr('0 <= x < 100');
    expect(expr.type).toBe('ChainedComparison');
    expect(expr.operators).toEqual(['<=', '<']);
  });

  test('pipe chain', () => {
    const expr = parseExpr('x |> f |> g |> h');
    expect(expr.type).toBe('PipeExpression');
    expect(expr.left.type).toBe('PipeExpression');
  });

  test('null coalescing chain', () => {
    const expr = parseExpr('a ?? b ?? c');
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('??');
    expect(expr.left.type).toBe('BinaryExpression');
    expect(expr.left.operator).toBe('??');
  });

  test('propagate on function call', () => {
    const expr = parseExpr('get_value()?');
    expect(expr.type).toBe('PropagateExpression');
    expect(expr.expression.type).toBe('CallExpression');
  });

  test('propagate on member access', () => {
    const expr = parseExpr('obj.method()?');
    expect(expr.type).toBe('PropagateExpression');
    expect(expr.expression.type).toBe('CallExpression');
  });

  test('chained propagate', () => {
    const expr = parseExpr('a()?.method()?');
    expect(expr.type).toBe('PropagateExpression');
    expect(expr.expression.type).toBe('CallExpression');
  });

  test('server/client/shared as identifier in expression within function', () => {
    // server/client/shared are keywords at top level but identifiers in expression context
    const ast = parse('fn test() { server.get_users() }');
    const body = ast.body[0].body.body[0];
    expect(body.expression.type).toBe('CallExpression');
    expect(body.expression.callee.object.name).toBe('server');
  });

  test('client keyword used as identifier in parsePrimary', () => {
    // Within expression context, client/shared become identifiers
    // Test via a call expression where they appear as arguments
    const ast = parse('fn test() { print(client) }');
    const call = ast.body[0].body.body[0].expression;
    expect(call.type).toBe('CallExpression');
    expect(call.arguments[0].name).toBe('client');
  });

  test('shared keyword used as identifier in parsePrimary', () => {
    const ast = parse('fn test() { print(shared) }');
    const call = ast.body[0].body.body[0].expression;
    expect(call.type).toBe('CallExpression');
    expect(call.arguments[0].name).toBe('shared');
  });
});

// ─── Pattern Matching Edge Cases ────────────────────────────

describe('Parser — Pattern matching edge cases', () => {
  test('wildcard pattern', () => {
    const expr = parseExpr('match x { _ => "default" }');
    expect(expr.arms[0].pattern.type).toBe('WildcardPattern');
  });

  test('boolean pattern true', () => {
    const expr = parseExpr('match x { true => 1, false => 0 }');
    expect(expr.arms[0].pattern.type).toBe('LiteralPattern');
    expect(expr.arms[0].pattern.value).toBe(true);
  });

  test('boolean pattern false', () => {
    const expr = parseExpr('match x { false => 0 }');
    expect(expr.arms[0].pattern.value).toBe(false);
  });

  test('nil pattern', () => {
    const expr = parseExpr('match x { nil => "nothing", _ => "something" }');
    expect(expr.arms[0].pattern.value).toBe(null);
  });

  test('string pattern', () => {
    const expr = parseExpr('match x { "hello" => 1, _ => 0 }');
    expect(expr.arms[0].pattern.value).toBe('hello');
  });

  test('range pattern inclusive', () => {
    const expr = parseExpr('match x { 1..=10 => "yes", _ => "no" }');
    expect(expr.arms[0].pattern.type).toBe('RangePattern');
    expect(expr.arms[0].pattern.inclusive).toBe(true);
  });

  test('range pattern exclusive', () => {
    const expr = parseExpr('match x { 1..10 => "yes", _ => "no" }');
    expect(expr.arms[0].pattern.type).toBe('RangePattern');
    expect(expr.arms[0].pattern.inclusive).toBe(false);
  });

  test('binding pattern (lowercase)', () => {
    const expr = parseExpr('match x { n => n * 2 }');
    expect(expr.arms[0].pattern.type).toBe('BindingPattern');
    expect(expr.arms[0].pattern.name).toBe('n');
  });

  test('variant pattern without args (uppercase)', () => {
    const expr = parseExpr('match x { None => 0 }');
    expect(expr.arms[0].pattern.type).toBe('VariantPattern');
    expect(expr.arms[0].pattern.name).toBe('None');
    expect(expr.arms[0].pattern.fields.length).toBe(0);
  });

  test('variant pattern with multiple fields', () => {
    const expr = parseExpr('match shape { Rect(w, h) => w * h }');
    expect(expr.arms[0].pattern.fields.length).toBe(2);
    expect(expr.arms[0].pattern.fields[0].type).toBe('BindingPattern');
    expect(expr.arms[0].pattern.fields[0].name).toBe('w');
    expect(expr.arms[0].pattern.fields[1].type).toBe('BindingPattern');
    expect(expr.arms[0].pattern.fields[1].name).toBe('h');
  });

  test('array pattern in match', () => {
    const expr = parseExpr('match list { [a, b, c] => a + b + c, _ => 0 }');
    expect(expr.arms[0].pattern.type).toBe('ArrayPattern');
    expect(expr.arms[0].pattern.elements.length).toBe(3);
  });

  test('array pattern with wildcard element', () => {
    const expr = parseExpr('match pair { [_, b] => b, _ => 0 }');
    const arr = expr.arms[0].pattern;
    expect(arr.type).toBe('ArrayPattern');
    expect(arr.elements[0].type).toBe('WildcardPattern');
  });

  test('array pattern with literal element', () => {
    const expr = parseExpr('match x { [0, b] => b, _ => 0 }');
    const arr = expr.arms[0].pattern;
    expect(arr.elements[0].type).toBe('LiteralPattern');
    expect(arr.elements[0].value).toBe(0);
  });

  test('match with guard', () => {
    const expr = parseExpr('match x { n if n > 0 => "positive", _ => "non-positive" }');
    expect(expr.arms[0].guard).not.toBeNull();
    expect(expr.arms[0].guard.type).toBe('BinaryExpression');
  });

  test('match arm with block body', () => {
    const expr = parseExpr('match x { 1 => { print("one") }, _ => { print("other") } }');
    expect(expr.arms[0].body.type).toBe('BlockStatement');
  });

  test('match with many arms', () => {
    const expr = parseExpr('match x { 0 => "zero", 1 => "one", 2 => "two", _ => "other" }');
    expect(expr.arms.length).toBe(4);
  });
});

// ─── Lambda Edge Cases ──────────────────────────────────────

describe('Parser — Lambda edge cases', () => {
  test('fn lambda with no params', () => {
    const expr = parseExpr('fn() 42');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.params.length).toBe(0);
  });

  test('fn lambda with block body', () => {
    const expr = parseExpr('fn(x) { x + 1 }');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.body.type).toBe('BlockStatement');
  });

  test('fn lambda with expression body', () => {
    const expr = parseExpr('fn(x) x * 2');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.body.type).toBe('BinaryExpression');
  });

  test('fn lambda with typed params', () => {
    const expr = parseExpr('fn(x: Int, y: Int) x + y');
    expect(expr.params[0].typeAnnotation.name).toBe('Int');
  });

  test('fn lambda with default params', () => {
    const expr = parseExpr('fn(x = 10) x * 2');
    expect(expr.params[0].defaultValue.value).toBe(10);
  });

  test('arrow lambda with no params', () => {
    const expr = parseExpr('() => 42');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.params.length).toBe(0);
  });

  test('arrow lambda single param', () => {
    const expr = parseExpr('x => x + 1');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.params.length).toBe(1);
  });

  test('arrow lambda multi params', () => {
    const expr = parseExpr('(a, b) => a + b');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.params.length).toBe(2);
  });

  test('arrow lambda with typed params', () => {
    const expr = parseExpr('(a: Int, b: Int) => a + b');
    expect(expr.params[0].typeAnnotation.name).toBe('Int');
  });

  test('arrow lambda with block body', () => {
    const expr = parseExpr('(x) => { x + 1 }');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.body.type).toBe('BlockStatement');
  });

  test('fn lambda with assignment body', () => {
    const expr = parseExpr('fn(x) y = x + 1');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.body.type).toBe('Assignment');
  });

  test('fn lambda with compound assignment body', () => {
    const expr = parseExpr('fn(x) total += x');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.body.type).toBe('CompoundAssignment');
  });
});

// ─── Type Declaration Edge Cases ────────────────────────────

describe('Parser — Type declaration edge cases', () => {
  test('type with bare variant (no fields)', () => {
    const ast = parse('type Option { Some(value), None }');
    const td = ast.body[0];
    expect(td.variants[0].type).toBe('TypeVariant');
    expect(td.variants[0].fields.length).toBe(1);
    expect(td.variants[1].type).toBe('TypeVariant');
    expect(td.variants[1].fields.length).toBe(0);
  });

  test('type with generic params', () => {
    const ast = parse('type Result<T, E> { Ok(value: T), Err(error: E) }');
    expect(ast.body[0].typeParams).toEqual(['T', 'E']);
  });

  test('type with mixed fields and variants', () => {
    const ast = parse('type Response { status: Int, Ok(data), Error(message: String) }');
    const td = ast.body[0];
    expect(td.variants[0].type).toBe('TypeField');
    expect(td.variants[1].type).toBe('TypeVariant');
    expect(td.variants[2].type).toBe('TypeVariant');
  });

  test('struct-like type with multiple fields', () => {
    const ast = parse('type User { name: String, age: Int, email: String }');
    const td = ast.body[0];
    expect(td.variants.length).toBe(3);
    expect(td.variants.every(v => v.type === 'TypeField')).toBe(true);
  });

  test('nested generic type annotation', () => {
    const ast = parse('fn foo(x: Result<Option<Int>, String>) { x }');
    const param = ast.body[0].params[0];
    expect(param.typeAnnotation.name).toBe('Result');
    expect(param.typeAnnotation.typeParams.length).toBe(2);
    expect(param.typeAnnotation.typeParams[0].name).toBe('Option');
    expect(param.typeAnnotation.typeParams[0].typeParams[0].name).toBe('Int');
  });

  test('array type annotation', () => {
    const ast = parse('fn foo(items: [Int]) { items }');
    const param = ast.body[0].params[0];
    expect(param.typeAnnotation.type).toBe('ArrayTypeAnnotation');
  });
});

// ─── Destructuring Edge Cases ───────────────────────────────

describe('Parser — Destructuring edge cases', () => {
  test('object destructuring with alias', () => {
    const ast = parse('let { name: fullName } = user');
    expect(ast.body[0].pattern.properties[0].key).toBe('name');
    expect(ast.body[0].pattern.properties[0].value).toBe('fullName');
  });

  test('object destructuring with default value', () => {
    const ast = parse('let { age = 0 } = user');
    expect(ast.body[0].pattern.properties[0].defaultValue.value).toBe(0);
  });

  test('array destructuring with wildcard', () => {
    const ast = parse('let [_, second] = pair');
    expect(ast.body[0].pattern.elements[0]).toBeNull();
    expect(ast.body[0].pattern.elements[1]).toBe('second');
  });

  test('empty object destructuring', () => {
    const ast = parse('let {} = obj');
    expect(ast.body[0].pattern.properties.length).toBe(0);
  });

  test('multiple properties in destructuring', () => {
    const ast = parse('let { a, b, c, d } = obj');
    expect(ast.body[0].pattern.properties.length).toBe(4);
  });
});

// ─── Control Flow Edge Cases ────────────────────────────────

describe('Parser — Control flow edge cases', () => {
  test('nested if statements', () => {
    const ast = parse('if a { if b { 1 } }');
    expect(ast.body[0].type).toBe('IfStatement');
    expect(ast.body[0].consequent.body[0].type).toBe('IfStatement');
  });

  test('if with multiple elif', () => {
    const ast = parse('if a { 1 } elif b { 2 } elif c { 3 } elif d { 4 } else { 5 }');
    expect(ast.body[0].alternates.length).toBe(3);
    expect(ast.body[0].elseBody).not.toBeNull();
  });

  test('for-else', () => {
    const ast = parse('for x in items { print(x) } else { print("empty") }');
    expect(ast.body[0].elseBody).not.toBeNull();
  });

  test('for with two variables', () => {
    const ast = parse('for key, val in entries { print(key) }');
    expect(ast.body[0].variable).toEqual(['key', 'val']);
  });

  test('while with complex condition', () => {
    const ast = parse('while x > 0 and y < 100 { x -= 1 }');
    expect(ast.body[0].condition.type).toBe('LogicalExpression');
  });

  test('return without value', () => {
    const ast = parse('fn foo() { return }');
    const ret = ast.body[0].body.body[0];
    expect(ret.type).toBe('ReturnStatement');
    expect(ret.value).toBeNull();
  });

  test('return with expression', () => {
    const ast = parse('fn foo() { return 42 }');
    const ret = ast.body[0].body.body[0];
    expect(ret.value.value).toBe(42);
  });

  test('try-catch basic', () => {
    const ast = parse('try { risky() } catch e { print(e) }');
    expect(ast.body[0].type).toBe('TryCatchStatement');
    expect(ast.body[0].catchParam).toBe('e');
  });

  test('try-catch without param', () => {
    const ast = parse('try { risky() } catch { fallback() }');
    expect(ast.body[0].catchParam).toBeNull();
  });

  test('if expression requires else', () => {
    // if expression (in assignment) without else should error
    expect(parseThrows('x = if true { 1 }')).toThrow(/else/);
  });

  test('if expression with elif chain', () => {
    const ast = parse('x = if a { 1 } elif b { 2 } elif c { 3 } else { 4 }');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('IfExpression');
    expect(expr.alternates.length).toBe(2);
  });
});

// ─── Array/Object Literal Edge Cases ────────────────────────

describe('Parser — Array/Object edge cases', () => {
  test('empty array', () => {
    const expr = parseExpr('[]');
    expect(expr.type).toBe('ArrayLiteral');
    expect(expr.elements.length).toBe(0);
  });

  test('array with trailing comma', () => {
    const expr = parseExpr('[1, 2, 3,]');
    expect(expr.type).toBe('ArrayLiteral');
    expect(expr.elements.length).toBe(3);
  });

  test('nested arrays', () => {
    const expr = parseExpr('[[1, 2], [3, 4]]');
    expect(expr.elements.length).toBe(2);
    expect(expr.elements[0].type).toBe('ArrayLiteral');
  });

  test('empty object', () => {
    const expr = parseExpr('{}');
    expect(expr.type).toBe('ObjectLiteral');
    expect(expr.properties.length).toBe(0);
  });

  test('object shorthand', () => {
    const expr = parseExpr('{x, y}');
    expect(expr.type).toBe('ObjectLiteral');
    expect(expr.properties[0].shorthand).toBe(true);
  });

  test('list comprehension without condition', () => {
    const expr = parseExpr('[x * 2 for x in items]');
    expect(expr.type).toBe('ListComprehension');
    expect(expr.condition).toBeNull();
  });

  test('list comprehension with condition', () => {
    const expr = parseExpr('[x for x in items if x > 0]');
    expect(expr.type).toBe('ListComprehension');
    expect(expr.condition).not.toBeNull();
  });

  test('dict comprehension', () => {
    const expr = parseExpr('{k: v for k, v in pairs}');
    expect(expr.type).toBe('DictComprehension');
  });

  test('dict comprehension with single var', () => {
    const expr = parseExpr('{x: x * 2 for x in items}');
    expect(expr.type).toBe('DictComprehension');
  });

  test('dict comprehension with condition', () => {
    const expr = parseExpr('{k: v for k, v in pairs if v > 0}');
    expect(expr.type).toBe('DictComprehension');
    expect(expr.condition).not.toBeNull();
  });

  test('spread in array', () => {
    const expr = parseExpr('[...a, 1, ...b]');
    expect(expr.elements[0].type).toBe('SpreadExpression');
    expect(expr.elements[2].type).toBe('SpreadExpression');
  });
});

// ─── Slice Syntax Edge Cases ────────────────────────────────

describe('Parser — Slice syntax edge cases', () => {
  test('slice with expressions', () => {
    const expr = parseExpr('list[a + 1:b + 2]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start.type).toBe('BinaryExpression');
    expect(expr.end.type).toBe('BinaryExpression');
  });

  test('slice to end', () => {
    const expr = parseExpr('list[3:]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start.value).toBe(3);
    expect(expr.end).toBeNull();
  });

  test('full slice [:]', () => {
    const expr = parseExpr('list[:]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start).toBeNull();
    expect(expr.end).toBeNull();
  });

  test('slice with negative step', () => {
    const expr = parseExpr('list[::-1]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.step.type).toBe('UnaryExpression');
    expect(expr.step.operator).toBe('-');
  });

  test('regular subscript access', () => {
    const expr = parseExpr('list[0]');
    expect(expr.type).toBe('MemberExpression');
    expect(expr.computed).toBe(true);
  });

  test('subscript with expression', () => {
    const expr = parseExpr('list[i + 1]');
    expect(expr.type).toBe('MemberExpression');
    expect(expr.computed).toBe(true);
    expect(expr.property.type).toBe('BinaryExpression');
  });
});

// ─── JSX Parsing Edge Cases ────────────────────────────────

describe('Parser — JSX edge cases', () => {
  test('JSX self-closing tag', () => {
    const ast = parse('client { component App { <br /> } }');
    const comp = ast.body[0].body[0];
    const jsx = comp.body[0];
    expect(jsx.type).toBe('JSXElement');
    expect(jsx.selfClosing).toBe(true);
  });

  test('JSX with boolean attribute', () => {
    const ast = parse('client { component App { <input disabled /> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.attributes[0].value.value).toBe(true);
  });

  test('JSX with expression attribute', () => {
    const ast = parse('client { component App { <div id={myId} /> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.attributes[0].value.type).toBe('Identifier');
  });

  test('JSX with string attribute', () => {
    const ast = parse('client { component App { <div class="test" /> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.attributes[0].value.value).toBe('test');
  });

  test('JSX with namespaced attribute on:click', () => {
    const ast = parse('client { component App { <button on:click={handler}>Click</button> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.attributes[0].name).toBe('on:click');
  });

  test('JSX with bind attribute', () => {
    const ast = parse('client { component App { <input bind:value={name} /> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.attributes[0].name).toBe('bind:value');
  });

  test('JSX with class: attribute', () => {
    const ast = parse('client { component App { <div class:active={isActive} /> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.attributes[0].name).toBe('class:active');
  });

  test('JSX with spread attribute', () => {
    // Use uppercase component name — _looksLikeJSX always returns true for uppercase tags
    const ast = parse('client { component App { <Wrapper {...props} /> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.attributes[0].type).toBe('JSXSpreadAttribute');
  });

  test('JSX spread attribute with regular attribute before', () => {
    const ast = parse('client { component App { <div class="x" {...props} /> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.attributes[0].name).toBe('class');
    expect(el.attributes[1].type).toBe('JSXSpreadAttribute');
  });

  test('JSX with expression child', () => {
    const ast = parse('client { component App { <div>{value}</div> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.children[0].type).toBe('JSXExpression');
  });

  test('JSX with quoted text child', () => {
    const ast = parse('client { component App { <p>"hello"</p> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.children[0].type).toBe('JSXText');
  });

  test('JSX with unquoted text child', () => {
    const ast = parse('client { component App { <p>Hello World</p> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.children[0].type).toBe('JSXText');
  });

  test('JSX nested elements', () => {
    const ast = parse('client { component App { <div><span>"text"</span></div> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.children[0].type).toBe('JSXElement');
    expect(el.children[0].tag).toBe('span');
  });

  test('JSX for loop', () => {
    const ast = parse('client { component App { <ul>for item in items { <li>"text"</li> }</ul> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.children[0].type).toBe('JSXFor');
    expect(el.children[0].variable).toBe('item');
  });

  test('JSX for with key', () => {
    const ast = parse('client { component App { <ul>for item in items key={item.id} { <li>"text"</li> }</ul> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.children[0].keyExpr).not.toBeNull();
  });

  test('JSX for with array destructuring', () => {
    const ast = parse('client { component App { <ul>for [i, item] in items { <li>"text"</li> }</ul> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.children[0].variable.type).toBe('ArrayPattern');
    expect(el.children[0].variable.elements).toEqual(['i', 'item']);
  });

  test('JSX for with object destructuring', () => {
    const ast = parse('client { component App { <ul>for {name, age} in users { <li>"text"</li> }</ul> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.children[0].variable.type).toBe('ObjectPattern');
    expect(el.children[0].variable.properties.map(p => p.key)).toEqual(['name', 'age']);
  });

  test('JSX if conditional', () => {
    const ast = parse('client { component App { <div>if show { <span /> }</div> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.children[0].type).toBe('JSXIf');
  });

  test('JSX if-elif-else', () => {
    const ast = parse('client { component App { <div>if a { <span /> } elif b { <span /> } else { <span /> }</div> } }');
    const el = ast.body[0].body[0].body[0];
    const jsxIf = el.children[0];
    expect(jsxIf.type).toBe('JSXIf');
    expect(jsxIf.alternates.length).toBe(1);
    expect(jsxIf.alternate).not.toBeNull();
  });

  test('JSX mismatched tags throws', () => {
    expect(parseThrows('client { component App { <div></span> } }')).toThrow(/Mismatched closing tag/);
  });

  test('JSX whitespace collapsing', () => {
    const ast = parse('client { component App { <p>  Hello   World  </p> } }');
    const el = ast.body[0].body[0].body[0];
    const text = el.children[0];
    expect(text.type).toBe('JSXText');
    // Whitespace should be collapsed
    expect(text.value.value).toBe('Hello World');
  });
});

// ─── Import Edge Cases ──────────────────────────────────────

describe('Parser — Import edge cases', () => {
  test('import with multiple specifiers', () => {
    const ast = parse('import { a, b, c } from "module"');
    expect(ast.body[0].specifiers.length).toBe(3);
  });

  test('import with alias', () => {
    const ast = parse('import { Component as Comp } from "react"');
    expect(ast.body[0].specifiers[0].imported).toBe('Component');
    expect(ast.body[0].specifiers[0].local).toBe('Comp');
  });

  test('default import', () => {
    const ast = parse('import React from "react"');
    expect(ast.body[0].type).toBe('ImportDefault');
    expect(ast.body[0].local).toBe('React');
  });

  test('import specifier without alias', () => {
    const ast = parse('import { map } from "utils"');
    const spec = ast.body[0].specifiers[0];
    expect(spec.imported).toBe('map');
    expect(spec.local).toBe('map');
  });
});

// ─── Store Declaration ──────────────────────────────────────

describe('Parser — Store declaration', () => {
  test('store with state and computed', () => {
    const ast = parse('client { store Counter { state count = 0\n computed doubled = count * 2 } }');
    const store = ast.body[0].body[0];
    expect(store.type).toBe('StoreDeclaration');
    expect(store.name).toBe('Counter');
    expect(store.body.length).toBe(2);
  });

  test('store with functions', () => {
    const ast = parse('client { store Counter { state count = 0\n fn increment() { count += 1 } } }');
    const store = ast.body[0].body[0];
    expect(store.body[1].type).toBe('FunctionDeclaration');
  });
});

// ─── Compound Assignment Edge Cases ─────────────────────────

describe('Parser — Compound assignment', () => {
  test('all compound operators', () => {
    for (const op of ['+=', '-=', '*=', '/=']) {
      const ast = parse(`x ${op} 1`);
      expect(ast.body[0].type).toBe('CompoundAssignment');
      expect(ast.body[0].operator).toBe(op);
    }
  });

  test('compound assignment to member', () => {
    const ast = parse('obj.count += 1');
    expect(ast.body[0].type).toBe('CompoundAssignment');
    expect(ast.body[0].target.type).toBe('MemberExpression');
  });
});

// ─── Docstring Extraction ───────────────────────────────────

describe('Parser — Docstrings', () => {
  test('docstrings are extracted from tokens', () => {
    const lexer = new Lexer('/// This is a doc\nfn foo() { 1 }', '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    expect(parser.docstrings.length).toBe(1);
    expect(parser.docstrings[0].value).toBe('This is a doc');
  });

  test('docstrings are filtered from parsing tokens', () => {
    const ast = parse('/// documentation\nfn foo() { 1 }');
    expect(ast.body[0].type).toBe('FunctionDeclaration');
  });
});

// ─── Component Edge Cases ───────────────────────────────────

describe('Parser — Component edge cases', () => {
  test('component with style block', () => {
    const ast = parse('client { component App { style { .foo { color: red } } <div /> } }');
    const comp = ast.body[0].body[0];
    expect(comp.body[0].type).toBe('ComponentStyleBlock');
  });

  test('component with state and computed', () => {
    const ast = parse('client { component App { state x = 0\n computed y = x * 2\n <div /> } }');
    const comp = ast.body[0].body[0];
    expect(comp.body[0].type).toBe('StateDeclaration');
    expect(comp.body[1].type).toBe('ComputedDeclaration');
  });

  test('component with effect', () => {
    const ast = parse('client { component App { effect { print("mounted") }\n <div /> } }');
    const comp = ast.body[0].body[0];
    expect(comp.body[0].type).toBe('EffectDeclaration');
  });

  test('nested component', () => {
    const ast = parse('client { component App { component Inner { <span /> }\n <Inner /> } }');
    const comp = ast.body[0].body[0];
    expect(comp.body[0].type).toBe('ComponentDeclaration');
    expect(comp.body[0].name).toBe('Inner');
  });

  test('component with no params', () => {
    const ast = parse('client { component App { <div /> } }');
    const comp = ast.body[0].body[0];
    expect(comp.params.length).toBe(0);
  });

  test('component with params', () => {
    const ast = parse('client { component Card(title, body) { <div /> } }');
    const comp = ast.body[0].body[0];
    expect(comp.params.length).toBe(2);
    expect(comp.params[0].name).toBe('title');
  });

  test('component with typed params', () => {
    const ast = parse('client { component Card(title: String, count: Int) { <div /> } }');
    const comp = ast.body[0].body[0];
    expect(comp.params[0].typeAnnotation.name).toBe('String');
  });

  test('component with default params', () => {
    const ast = parse('client { component Card(title = "default") { <div /> } }');
    const comp = ast.body[0].body[0];
    expect(comp.params[0].defaultValue.value).toBe('default');
  });
});

// ─── Primary Expression Edge Cases ──────────────────────────

describe('Parser — Primary expression edge cases', () => {
  test('nil literal', () => {
    const expr = parseExpr('nil');
    expect(expr.type).toBe('NilLiteral');
  });

  test('true literal', () => {
    const expr = parseExpr('true');
    expect(expr.type).toBe('BooleanLiteral');
    expect(expr.value).toBe(true);
  });

  test('false literal', () => {
    const expr = parseExpr('false');
    expect(expr.type).toBe('BooleanLiteral');
    expect(expr.value).toBe(false);
  });

  test('number literal', () => {
    const expr = parseExpr('42');
    expect(expr.type).toBe('NumberLiteral');
    expect(expr.value).toBe(42);
  });

  test('string literal', () => {
    const expr = parseExpr('"hello"');
    expect(expr.type).toBe('StringLiteral');
    expect(expr.value).toBe('hello');
  });

  test('identifier', () => {
    const expr = parseExpr('foo');
    expect(expr.type).toBe('Identifier');
    expect(expr.name).toBe('foo');
  });

  test('parenthesized expression', () => {
    const expr = parseExpr('(1 + 2)');
    expect(expr.type).toBe('BinaryExpression');
  });

  test('match in expression position', () => {
    const expr = parseExpr('match x { _ => 0 }');
    expect(expr.type).toBe('MatchExpression');
  });

  test('if in expression position', () => {
    const ast = parse('x = if true { 1 } else { 0 }');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('IfExpression');
  });
});

// ─── Multiple Assignments ───────────────────────────────────

describe('Parser — Multiple assignment', () => {
  test('multiple assignment basic', () => {
    const ast = parse('a, b = 1, 2');
    expect(ast.body[0].type).toBe('Assignment');
    expect(ast.body[0].targets).toEqual(['a', 'b']);
    expect(ast.body[0].values.length).toBe(2);
  });

  test('three-way assignment', () => {
    const ast = parse('a, b, c = 1, 2, 3');
    expect(ast.body[0].targets.length).toBe(3);
    expect(ast.body[0].values.length).toBe(3);
  });
});

// ─── Var Declaration Edge Cases ─────────────────────────────

describe('Parser — Var declaration edge cases', () => {
  test('var with multiple targets', () => {
    const ast = parse('var a, b = 1, 2');
    expect(ast.body[0].type).toBe('VarDeclaration');
    expect(ast.body[0].targets).toEqual(['a', 'b']);
    expect(ast.body[0].values.length).toBe(2);
  });

  test('var with single target', () => {
    const ast = parse('var x = 42');
    expect(ast.body[0].targets).toEqual(['x']);
  });
});

// ─── Named Call Arguments ───────────────────────────────────

describe('Parser — Named arguments', () => {
  test('single named argument', () => {
    const expr = parseExpr('foo(name: "Alice")');
    expect(expr.arguments[0].type).toBe('NamedArgument');
    expect(expr.arguments[0].name).toBe('name');
  });

  test('multiple named arguments', () => {
    const expr = parseExpr('foo(name: "Alice", age: 30)');
    expect(expr.arguments.length).toBe(2);
    expect(expr.arguments[0].type).toBe('NamedArgument');
    expect(expr.arguments[1].type).toBe('NamedArgument');
  });

  test('mixed positional and named', () => {
    const expr = parseExpr('foo(1, name: "Alice")');
    expect(expr.arguments[0].type).toBe('NumberLiteral');
    expect(expr.arguments[1].type).toBe('NamedArgument');
  });
});

// ─── Template Literal Edge Cases ────────────────────────────

describe('Parser — Template literal edge cases', () => {
  test('template with multiple interpolations', () => {
    const expr = parseExpr('"Hello {name}, you are {age} years old"');
    expect(expr.type).toBe('TemplateLiteral');
    expect(expr.parts.length).toBe(5);
  });

  test('template with expression', () => {
    const expr = parseExpr('"Result: {1 + 2}"');
    expect(expr.type).toBe('TemplateLiteral');
    const exprPart = expr.parts.find(p => p.type === 'expr');
    expect(exprPart.value.type).toBe('BinaryExpression');
  });

  test('simple string (no interpolation)', () => {
    const expr = parseExpr('"hello world"');
    expect(expr.type).toBe('StringLiteral');
  });
});
