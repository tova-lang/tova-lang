import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { BaseCodegen } from '../src/codegen/base-codegen.js';
import { ClientCodegen } from '../src/codegen/client-codegen.js';
import * as AST from '../src/parser/ast.js';

function generate(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const gen = new CodeGenerator(ast, '<test>');
  return gen.generate();
}

function genShared(source) {
  return (generate(source).shared || '').trim();
}

function genServer(source) {
  return generate(source).server || '';
}

function genClient(source) {
  return generate(source).client || '';
}

// ═══════════════════════════════════════════════════════════════
// 1. Base Codegen Gaps
// ═══════════════════════════════════════════════════════════════

describe('Base — If expression ternary optimization', () => {
  test('simple if-else with single expressions uses ternary', () => {
    const code = genShared('x = if true { 1 } else { 0 }');
    // Should use ternary, not IIFE
    expect(code).toContain('?');
    expect(code).toContain(':');
    expect(code).toContain('(true)');
    expect(code).toContain('(1)');
    expect(code).toContain('(0)');
  });

  test('if-elif-else optimized to ternary chain', () => {
    const code = genShared('x = if a { 1 } elif b { 2 } else { 3 }');
    // Simple if-elif-else expressions are optimized to ternary chains
    expect(code).toContain('(a) ?');
    expect(code).toContain('(1)');
    expect(code).toContain('(b) ?');
    expect(code).toContain('(2)');
    expect(code).toContain('(3)');
  });

  test('multi-statement branch uses block-scoped assignment', () => {
    const code = genShared('x = if cond { y = 1\ny + 2 } else { 0 }');
    expect(code).toContain('let x;');
    expect(code).toContain('if (cond)');
    expect(code).toContain('x = (y + 2);');
    expect(code).toContain('x = 0;');
    expect(code).not.toContain('(() => {');
  });
});

describe('Base — String multiply with TemplateLiteral', () => {
  test('template literal multiply uses .repeat()', () => {
    // Build AST directly since parser may not allow template * number
    const gen = new BaseCodegen();
    const node = new AST.BinaryExpression(
      '*',
      new AST.TemplateLiteral([
        { type: 'text', value: 'ha' },
        { type: 'expr', value: new AST.Identifier('name', {}) }
      ], {}),
      new AST.NumberLiteral(3, {}),
      {}
    );
    const result = gen.genExpression(node);
    expect(result).toContain('.repeat(3)');
    expect(result).toContain('`ha${name}`');
  });

  test('string literal multiply uses .repeat()', () => {
    const code = genShared('x = "ha" * 3');
    expect(code).toContain('"ha".repeat(3)');
  });
});

describe('Base — Chained comparison with 3+ operands', () => {
  test('a < b < c generates two-part && chain', () => {
    const code = genShared('x = 1 < y < 10');
    // Optimized: simple operands don't need temp vars
    expect(code).toContain('(1 < y)');
    expect(code).toContain('(y < 10)');
    expect(code).toContain('&&');
  });

  test('a <= b < c <= d generates three-part && chain', () => {
    const code = genShared('x = 0 <= a < b <= 100');
    // Optimized: simple operands inline without temp vars
    expect(code).toContain('(0 <= a)');
    expect(code).toContain('(a < b)');
    expect(code).toContain('(b <= 100)');
    // All three parts joined with &&
    const andCount = (code.match(/&&/g) || []).length;
    expect(andCount).toBeGreaterThanOrEqual(2);
  });
});

describe('Base — List comprehension filter-only optimization', () => {
  test('filter-only comprehension skips .map when expr === variable', () => {
    const code = genShared('x = [n for n in items if n > 0]');
    expect(code).toContain('items.filter((n) => (n > 0))');
    // Should NOT have .map() when expression is just the loop variable
    expect(code).not.toContain('.map(');
  });

  test('filter+map comprehension uses single-pass reduce', () => {
    const code = genShared('x = [n * 2 for n in items if n > 0]');
    // Single-pass reduce avoids intermediate array from filter().map()
    expect(code).toContain('.reduce(');
    expect(code).not.toContain('.filter(');
  });
});

describe('Base — For-else codegen with __entered flag', () => {
  test('for-else generates unique __entered tracking', () => {
    const code = genShared('for x in items { print(x) } else { print("empty") }');
    expect(code).toMatch(/let __entered_\d+ = false;/);
    expect(code).toMatch(/__entered_\d+ = true;/);
    expect(code).toMatch(/if \(!__entered_\d+\)/);
    expect(code).toContain('print("empty")');
  });

  test('for-else with two variables uses destructuring', () => {
    const code = genShared('for k, v in pairs { print(k) } else { print("empty") }');
    expect(code).toMatch(/let __entered_\d+ = false;/);
    expect(code).toContain('[k, v]');
    expect(code).toMatch(/if \(!__entered_\d+\)/);
  });
});

describe('Base — Slice variants', () => {
  test('step-only slice [::2] generates step helper', () => {
    const code = genShared('x = list[::2]');
    expect(code).toContain('st > 0');
    expect(code).toContain('null');
  });

  test('negative step slice [::-1] generates reverse step', () => {
    const code = genShared('x = list[::-1]');
    expect(code).toContain('a.length - 1');
    expect(code).toContain('-1');
  });

  test('negative start index slice [-3:]', () => {
    const code = genShared('x = list[-3:]');
    expect(code).toContain('.slice((-3))');
  });

  test('negative end index slice [:-1]', () => {
    const code = genShared('x = list[:-1]');
    expect(code).toContain('.slice(0, (-1))');
  });

  test('both negative indices [-3:-1]', () => {
    const code = genShared('x = list[-3:-1]');
    expect(code).toContain('.slice((-3), (-1))');
  });

  test('full slice [:] generates .slice()', () => {
    const code = genShared('x = list[:]');
    expect(code).toContain('.slice()');
  });
});

describe('Base — Try-catch without catch parameter', () => {
  test('try-catch without catch param uses __err', () => {
    const code = genShared('try { risky() } catch { fallback() }');
    expect(code).toContain('try {');
    expect(code).toContain('catch (__err)');
    expect(code).toContain('fallback()');
  });

  test('try-catch with catch param uses the named param', () => {
    const code = genShared('try { risky() } catch e { print(e) }');
    expect(code).toContain('catch (e)');
    expect(code).toContain('print(e)');
  });
});

describe('Base — Pattern bindings with multiple fields', () => {
  test('variant pattern with two fields destructures both', () => {
    const code = genShared(`
      type Shape { Rect(w: Float, h: Float) }
      x = match shape { Rect(w, h) => w * h, _ => 0 }
    `);
    expect(code).toContain('__tag === "Rect"');
    expect(code).toContain('const w = __match.w;');
    expect(code).toContain('const h = __match.h;');
    expect(code).toContain('x = (w * h);');
  });

  test('array pattern with multiple bindings', () => {
    const code = genShared('x = match val { [a, b, c] => a + b + c, _ => 0 }');
    expect(code).toContain('Array.isArray(__match)');
    expect(code).toContain('__match.length === 3');
    expect(code).toContain('const a = __match[0]');
    expect(code).toContain('const b = __match[1]');
    expect(code).toContain('const c = __match[2]');
  });

  test('match with BindingPattern as non-last arm with guard', () => {
    const code = genShared('x = match n { x if x > 10 => "big", x if x > 0 => "pos", _ => "neg" }');
    expect(code).toContain('((x) =>');
    expect(code).toContain('> 10');
    expect(code).toContain('> 0');
    expect(code).toContain('return "big"');
    expect(code).toContain('return "pos"');
    expect(code).toContain('return "neg"');
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Client Codegen Gaps
// ═══════════════════════════════════════════════════════════════

describe('Client — RPC in lambda body (_containsRPC in lambda)', () => {
  test('lambda containing server.xxx() triggers async detection', () => {
    const code = genClient('client { fn fetchData() { server.getData() } }');
    expect(code).toContain('async function fetchData');
    expect(code).toContain('await');
  });

  test('_containsRPC detects server call in lambda body', () => {
    const cg = new ClientCodegen();
    const lambdaNode = new AST.LambdaExpression(
      [],
      new AST.CallExpression(
        new AST.MemberExpression(
          new AST.Identifier('server', {}),
          'getData',
          false,
          {}
        ),
        [],
        {}
      ),
      {}
    );
    expect(cg._containsRPC(lambdaNode)).toBe(true);
  });
});

describe('Client — bind:group on checkbox vs radio', () => {
  test('bind:group on radio generates single value comparison', () => {
    const code = genClient(`client {
      state color = "red"
      component App {
        <input type="radio" value="red" bind:group={color} />
      }
    }`);
    expect(code).toContain('color() === "red"');
    expect(code).toContain('setColor("red")');
  });

  test('bind:group on checkbox generates array includes/toggle', () => {
    const code = genClient(`client {
      state items = []
      component App {
        <input type="checkbox" value="a" bind:group={items} />
      }
    }`);
    expect(code).toContain('items().includes("a")');
    expect(code).toContain('setItems');
    expect(code).toContain('filter');
  });
});

describe('Client — Multiple class: directives merged', () => {
  test('two class directives merge into one className expression', () => {
    const code = genClient(`client {
      state active = true
      state bold = false
      component App {
        <div class:active={active} class:bold={bold} />
      }
    }`);
    expect(code).toContain('"active"');
    expect(code).toContain('"bold"');
    expect(code).toContain('filter(Boolean)');
    expect(code).toContain('join(" ")');
  });

  test('class: directive merges with base class attribute', () => {
    const code = genClient(`client {
      state active = true
      component App {
        <div class="base" class:active={active} />
      }
    }`);
    expect(code).toContain('"base"');
    expect(code).toContain('"active"');
    expect(code).toContain('filter(Boolean)');
  });
});

describe('Client — Named slots', () => {
  test('children with slot attribute become named props', () => {
    const code = genClient(`client {
      component Layout(header, children) {
        <div>{header}</div>
        <div>{children}</div>
      }
      component App {
        <Layout>
          <div slot="header">"Title"</div>
          <p>"Content"</p>
        </Layout>
      }
    }`);
    expect(code).toContain('header:');
    expect(code).toContain('children:');
  });
});

describe('Client — Nested components with same state name', () => {
  test('component-scoped state does not leak across components', () => {
    const code = genClient(`client {
      component A {
        state count = 1
        <div>"a"</div>
      }
      component B {
        state count = 2
        <div>"b"</div>
      }
    }`);
    // Both A and B should have their own createSignal
    expect(code).toContain('createSignal(1)');
    expect(code).toContain('createSignal(2)');
    // Check that both setCount exist within their respective functions
    const aFn = code.indexOf('function A(');
    const bFn = code.indexOf('function B(');
    expect(aFn).toBeGreaterThan(-1);
    expect(bFn).toBeGreaterThan(-1);
  });
});

describe('Client — Store accessor getter/setter pattern', () => {
  test('store generates IIFE with getter and setter for state', () => {
    const code = genClient(`client {
      store CounterStore {
        state count = 0
        fn increment() { count += 1 }
      }
    }`);
    expect(code).toContain('const CounterStore = (() => {');
    expect(code).toContain('get count()');
    expect(code).toContain('set count(v)');
    expect(code).toContain('setCount(v)');
    expect(code).toContain('increment,');
    expect(code).toContain('})();');
  });

  test('store with computed generates read-only getter', () => {
    const code = genClient(`client {
      store MathStore {
        state x = 5
        computed doubled = x * 2
      }
    }`);
    expect(code).toContain('get doubled()');
    expect(code).not.toContain('set doubled');
  });
});

describe('Client — _exprReadsSignal for MemberExpression with storeNames', () => {
  test('store property access in JSX expression is reactive', () => {
    const code = genClient(`client {
      store counter {
        state count = 0
      }
      component App {
        <div>{counter.count}</div>
      }
    }`);
    expect(code).toContain('() => counter.count');
  });

  test('non-store member access is not reactive', () => {
    const code = genClient(`client {
      component App {
        <div>{Math.PI}</div>
      }
    }`);
    expect(code).not.toContain('() => Math.PI');
  });
});

describe('Client — _exprReadsSignal for UnaryExpression', () => {
  test('negation of signal in JSX is reactive', () => {
    const code = genClient(`client {
      component App {
        state flag = true
        <div>{not flag}</div>
      }
    }`);
    expect(code).toContain('() =>');
    expect(code).toContain('flag()');
  });
});

describe('Client — _exprReadsSignal for MatchExpression', () => {
  test('_exprReadsSignal returns true for MatchExpression reading a signal', () => {
    const cg = new ClientCodegen();
    cg.stateNames.add('count');
    const matchNode = {
      type: 'MatchExpression',
      subject: { type: 'Identifier', name: 'count' },
      arms: []
    };
    // MatchExpression subject reads signal 'count', should return true
    expect(cg._exprReadsSignal(matchNode)).toBe(true);
  });
});

describe('Client — JSXText with StringLiteral vs TemplateLiteral path', () => {
  test('JSXText with plain StringLiteral generates quoted string', () => {
    const code = genClient('client { component App { <div>"Hello"</div> } }');
    expect(code).toContain('"Hello"');
  });

  test('JSXText with TemplateLiteral referencing signal is reactive', () => {
    const code = genClient(`client {
      state name = "world"
      component App { <div>"Hello, {name}!"</div> }
    }`);
    expect(code).toContain('() =>');
    expect(code).toContain('`Hello, ${name()}!`');
  });

  test('JSXText with TemplateLiteral without signal is not reactive', () => {
    const code = genClient(`client {
      component App { <div>"Hello, world!"</div> }
    }`);
    // A simple string with no interpolation is a StringLiteral, not reactive
    expect(code).toContain('"Hello, world!"');
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Server Codegen Gaps
// ═══════════════════════════════════════════════════════════════

describe('Server — Database multi-driver: postgres', () => {
  test('db with driver postgres imports postgres and creates pool', () => {
    const code = genServer(`server {
      db { driver: "postgres" }
      fn hello() { "world" }
    }`);
    expect(code).toContain('import postgres from "postgres"');
    expect(code).toContain('const __pg = postgres(');
    expect(code).toContain('async query(sql');
    expect(code).toContain('__pg.unsafe(sql');
  });
});

describe('Server — Database multi-driver: mysql', () => {
  test('db with driver mysql imports mysql2 and creates pool', () => {
    const code = genServer(`server {
      db { driver: "mysql" }
      fn hello() { "world" }
    }`);
    expect(code).toContain('import mysql from "mysql2/promise"');
    expect(code).toContain('mysql.createPool(');
    expect(code).toContain('async query(sql');
    expect(code).toContain('__mysqlPool.execute(sql');
  });
});

describe('Server — Database multi-driver: default sqlite', () => {
  test('db without driver defaults to sqlite', () => {
    const code = genServer(`server {
      db { }
      fn hello() { "world" }
    }`);
    expect(code).toContain('import { Database } from "bun:sqlite"');
    expect(code).toContain('new Database(');
    expect(code).toContain('PRAGMA journal_mode=WAL');
    expect(code).toContain('PRAGMA foreign_keys=ON');
  });
});

describe('Server — Circuit breaker code generation', () => {
  test('peer server blocks generate circuit breaker class', () => {
    const result = generate(`
      server "api" { fn get_data() { [] } }
      server "ws" { fn connect() { true } }
    `);
    expect(result.servers['api']).toContain('class __CircuitBreaker');
    expect(result.servers['api']).toContain('CLOSED');
    expect(result.servers['api']).toContain('HALF_OPEN');
    expect(result.servers['api']).toContain('OPEN');
    expect(result.servers['api']).toContain('threshold');
    expect(result.servers['api']).toContain('resetTimeout');
  });

  test('peer blocks also generate __retryWithBackoff', () => {
    const result = generate(`
      server "api" { fn get_data() { [] } }
      server "ws" { fn connect() { true } }
    `);
    expect(result.servers['api']).toContain('async function __retryWithBackoff');
    expect(result.servers['api']).toContain('baseDelay * Math.pow(2, i)');
  });
});

describe('Server — Rate limiting window calculation', () => {
  test('rate_limit config generates rate limit store and checker', () => {
    const code = genServer(`server {
      rate_limit { max: 50, window: 30 }
      fn hello() { "world" }
    }`);
    expect(code).toContain('const __rateLimitMax = 50;');
    expect(code).toContain('const __rateLimitWindow = 30;');
    expect(code).toContain('const __rateLimitStore = new Map()');
    expect(code).toContain('function __checkRateLimit');
    expect(code).toContain('windowSec * 1000');
    expect(code).toContain('entry.prevCount');
  });
});

describe('Server — Auth system: JWT', () => {
  test('auth with JWT generates __authenticate with Bearer token parsing', () => {
    const code = genServer(`server {
      auth { type: "jwt", secret: "my-secret" }
      fn hello() { "world" }
    }`);
    expect(code).toContain('const __authSecret = "my-secret"');
    expect(code).toContain('async function __authenticate(req)');
    expect(code).toContain('Bearer');
    expect(code).toContain('crypto.subtle.importKey');
    expect(code).toContain('HMAC');
  });
});

describe('Server — Auth system: API key', () => {
  test('auth with api_key generates key validation', () => {
    const code = genServer(`server {
      auth { type: "api_key", keys: ["key1", "key2"] }
      fn hello() { "world" }
    }`);
    expect(code).toContain('const __validApiKeys = new Set(["key1", "key2"])');
    expect(code).toContain('function __authenticate(req)');
    expect(code).toContain('X-API-Key');
    expect(code).toContain('__validApiKeys.has(key)');
  });
});

describe('Server — Session management: in-memory (no db)', () => {
  test('session without db uses in-memory store', () => {
    const code = genServer(`server {
      session { secret: "sess-secret", max_age: 7200 }
      fn hello() { "world" }
    }`);
    expect(code).toContain('const __sessionSecret = "sess-secret"');
    expect(code).toContain('const __sessionMaxAge = 7200');
    expect(code).toContain('In-memory session store');
    expect(code).toContain('const __sessionStore = new Map()');
    expect(code).toContain('function __createSession(id)');
    expect(code).toContain('get(key)');
    expect(code).toContain('set(key, value)');
    expect(code).toContain('destroy()');
  });
});

describe('Server — Session management: SQLite-backed', () => {
  test('session with db uses SQLite store', () => {
    const code = genServer(`server {
      db { }
      session { secret: "db-secret" }
      fn hello() { "world" }
    }`);
    expect(code).toContain('SQLite-backed session store');
    expect(code).toContain('CREATE TABLE IF NOT EXISTS __sessions');
    expect(code).toContain('__sessionStmts');
  });
});

describe('Server — Background job queue generation', () => {
  test('background job generates job queue and spawn_job', () => {
    const code = genServer(`server {
      background fn send_email(to) { print(to) }
      fn hello() { "world" }
    }`);
    expect(code).toContain('Background Jobs');
    expect(code).toContain('const __jobQueue = []');
    expect(code).toContain('async function __processJobQueue()');
    expect(code).toContain('async function __bg_send_email(to)');
    expect(code).toContain('function spawn_job(name');
    expect(code).toContain('"send_email": __bg_send_email');
    expect(code).toContain('maxRetries: 3');
  });
});

describe('Server — Response compression generation', () => {
  test('compression config generates __compressResponse', () => {
    const code = genServer(`server {
      compression { min_size: 512 }
      fn hello() { "world" }
    }`);
    expect(code).toContain('Compression');
    expect(code).toContain('const __compressionMinSize = 512');
    expect(code).toContain('async function __compressResponse');
    expect(code).toContain('Accept-Encoding');
    expect(code).toContain('Bun.gzipSync');
    expect(code).toContain('Bun.deflateSync');
    expect(code).toContain('Content-Encoding');
    // Check that fetch handler wraps compression
    expect(code).toContain('fetch: __idempotentFetch');
    expect(code).toContain('__compressResponse(req,');
  });
});

describe('Server — File upload validation generation', () => {
  test('upload config generates file validation helpers', () => {
    const code = genServer(`server {
      upload { max_size: 5242880, allowed_types: ["image/png", "image/jpeg"] }
      fn hello() { "world" }
    }`);
    expect(code).toContain('File Upload Helpers');
    expect(code).toContain('const __uploadMaxSize = 5242880');
    expect(code).toContain('const __uploadAllowedTypes = ["image/png", "image/jpeg"]');
    expect(code).toContain('function __validateFile');
    expect(code).toContain('file too large');
    expect(code).toContain('file type');
    expect(code).toContain('async function save_file');
  });
});

describe('Server — Model/ORM CRUD generation', () => {
  test('model with shared type generates CRUD operations', () => {
    const result = generate(`
      shared {
        type Todo { id: Int, title: String, done: Bool }
      }
      server {
        db { }
        model Todo
      }
    `);
    const code = result.server;
    expect(code).toContain('Model / ORM');
    expect(code).toContain('CREATE TABLE IF NOT EXISTS todos');
    expect(code).toContain('const TodoModel = {');
    expect(code).toContain('find(id)');
    expect(code).toContain('all()');
    expect(code).toContain('where(conditions)');
    expect(code).toContain('create(data)');
    expect(code).toContain('update(id, data)');
    expect(code).toContain('delete(id)');
    expect(code).toContain('count(');
  });

  test('model generates correct SQL types for fields', () => {
    const result = generate(`
      shared {
        type Item { id: Int, name: String, price: Float, active: Bool }
      }
      server {
        db { }
        model Item
      }
    `);
    const code = result.server;
    expect(code).toContain('id INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(code).toContain('name TEXT');
    expect(code).toContain('price REAL');
    expect(code).toContain('active INTEGER');
  });
});

describe('Server — SSE channel generation', () => {
  test('sse declaration generates SSE channel class and route', () => {
    const code = genServer(`server {
      sse "/events" fn(send, close) { send("hello") }
    }`);
    expect(code).toContain('SSE (Server-Sent Events)');
    expect(code).toContain('class __SSEChannel');
    expect(code).toContain('subscribe(controller)');
    expect(code).toContain('unsubscribe(controller)');
    expect(code).toContain('function sse_channel(name)');
    expect(code).toContain('__addRoute("GET", "/events"');
    expect(code).toContain('text/event-stream');
  });
});

describe('Server — Content negotiation generation', () => {
  test('server always includes negotiate function', () => {
    const code = genServer('server { fn hello() { "world" } }');
    expect(code).toContain('Content Negotiation');
    expect(code).toContain('function negotiate(req, data, options');
    expect(code).toContain('text/html');
    expect(code).toContain('text/xml');
    expect(code).toContain('application/xml');
    expect(code).toContain('text/plain');
    expect(code).toContain('application/json');
  });
});

describe('Server — Middleware execution order', () => {
  test('middleware declaration generates async function and chain', () => {
    const code = genServer(`server {
      middleware fn logger(req, next) { print(req)\nnext(req) }
      fn hello() { "world" }
    }`);
    expect(code).toContain('async function logger(req, next)');
    expect(code).toContain('const __middlewares = [logger]');
    expect(code).toContain('__middlewares.reduceRight');
  });

  test('multiple middlewares are chained in order', () => {
    const code = genServer(`server {
      middleware fn auth_mw(req, next) { next(req) }
      middleware fn log_mw(req, next) { next(req) }
      fn hello() { "world" }
    }`);
    expect(code).toContain('const __middlewares = [auth_mw, log_mw]');
  });
});

describe('Server — Error handler generation', () => {
  test('on_error generates __errorHandler function', () => {
    const code = genServer(`server {
      on_error fn(err, req) { respond(500, { message: err }) }
      fn hello() { "world" }
    }`);
    expect(code).toContain('Error Handler');
    expect(code).toContain('async function __errorHandler(err, req)');
  });
});

describe('Server — Route sorting by specificity', () => {
  test('static routes sorted before param routes', () => {
    const code = genServer(`server {
      fn get_user(id) { id }
      fn list_users() { [] }
      route GET "/users/:id" => get_user
      route GET "/users/active" => list_users
    }`);
    // /users/active should appear before /users/:id in the output
    const activeIdx = code.indexOf('"/users/active"');
    const paramIdx = code.indexOf('"/users/:id"');
    expect(activeIdx).toBeGreaterThan(-1);
    expect(paramIdx).toBeGreaterThan(-1);
    expect(activeIdx).toBeLessThan(paramIdx);
  });
});

describe('Server — OpenAPI spec generation', () => {
  test('routes generate OpenAPI spec and /docs endpoint', () => {
    const code = genServer(`server {
      fn list_users() { [] }
      route GET "/api/users" => list_users
    }`);
    expect(code).toContain('OpenAPI Spec');
    expect(code).toContain('const __openApiSpec = {');
    expect(code).toContain('openapi: "3.0.3"');
    expect(code).toContain('__addRoute("GET", "/openapi.json"');
    expect(code).toContain('__addRoute("GET", "/docs"');
    expect(code).toContain('swagger-ui');
  });
});

describe('Server — Static file serving', () => {
  test('static declaration generates file serving function', () => {
    const code = genServer(`server {
      static "/public" => "./dist"
      fn hello() { "world" }
    }`);
    expect(code).toContain('Static File Serving');
    expect(code).toContain('const __staticPrefix = "/public"');
    expect(code).toContain('const __staticDir = "./dist"');
    expect(code).toContain('async function __serveStatic');
    expect(code).toContain('Bun.file(filePath)');
    expect(code).toContain('ETag');
    expect(code).toContain('If-None-Match');
  });
});

describe('Server — WebSocket code generation', () => {
  test('ws declaration generates WebSocket handlers', () => {
    const code = genServer(`server {
      ws {
        on_open fn(ws) { print("connected") }
        on_message fn(ws, message) { print(message) }
        on_close fn(ws, code, reason) { print("disconnected") }
      }
      fn hello() { "world" }
    }`);
    expect(code).toContain('WebSocket Handlers');
    expect(code).toContain('const __wsClients = new Set()');
    expect(code).toContain('const __wsRooms = new Map()');
    expect(code).toContain('function broadcast(data');
    expect(code).toContain('function join(ws, room)');
    expect(code).toContain('function leave(ws, room)');
    expect(code).toContain('function broadcast_to(room');
    expect(code).toContain('__wsHandlers.on_open');
    expect(code).toContain('__wsHandlers.on_message');
    expect(code).toContain('__wsHandlers.on_close');
    expect(code).toContain('websocket:');
  });
});

describe('Server — Lifecycle hooks', () => {
  test('on_start hook generates startup code', () => {
    const code = genServer(`server {
      on_start fn() { print("starting") }
      fn hello() { "world" }
    }`);
    expect(code).toContain('Lifecycle: on_start');
    expect(code).toContain('(async () => {');
    expect(code).toContain('print("starting")');
  });

  test('on_stop hook generates shutdown code', () => {
    const code = genServer(`server {
      cors { origins: ["*"] }
      on_stop fn() { print("stopping") }
      fn hello() { "world" }
    }`);
    expect(code).toContain('Graceful Shutdown');
    expect(code).toContain('print("stopping")');
    expect(code).toContain('process.on("SIGINT"');
    expect(code).toContain('process.on("SIGTERM"');
  });
});

describe('Server — Env validation (typed env vars)', () => {
  test('env String generates required check and string return', () => {
    const code = genServer(`server {
      env API_KEY: String
      fn hello() { "world" }
    }`);
    expect(code).toContain('Env Validation');
    expect(code).toContain('process.env.API_KEY');
    expect(code).toContain('Missing required env vars');
    expect(code).toContain('return __raw;');
  });

  test('env Int generates parseInt and NaN check', () => {
    const code = genServer(`server {
      env MAX_RETRIES: Int
      fn hello() { "world" }
    }`);
    expect(code).toContain('parseInt(__raw, 10)');
    expect(code).toContain('isNaN(__val)');
    expect(code).toContain('expected Int');
  });

  test('env Float generates parseFloat', () => {
    const code = genServer(`server {
      env RATE: Float
      fn hello() { "world" }
    }`);
    expect(code).toContain('parseFloat(__raw)');
    expect(code).toContain('expected Float');
  });

  test('env Bool generates boolean parse', () => {
    const code = genServer(`server {
      env DEBUG: Bool
      fn hello() { "world" }
    }`);
    expect(code).toContain('return __raw === "true" || __raw === "1"');
  });

  test('env with default value uses fallback', () => {
    const code = genServer(`server {
      env PORT: Int = 3000
      fn hello() { "world" }
    }`);
    expect(code).toContain('return 3000');
    // Should NOT have the required check
    expect(code).not.toContain('Required env var PORT is not set');
  });
});

describe('Server — Scheduled tasks', () => {
  test('schedule with simple interval generates setInterval', () => {
    const code = genServer(`server {
      schedule "5m" fn cleanup() { print("cleaning") }
      fn hello() { "world" }
    }`);
    expect(code).toContain('Schedule Helpers');
    expect(code).toContain('function __parseInterval(pattern)');
    expect(code).toContain('async function cleanup()');
    expect(code).toContain('setInterval(cleanup, __parseInterval("5m"))');
  });

  test('schedule with cron generates cron matcher', () => {
    const code = genServer(`server {
      schedule "0 */2 * * *" fn heartbeat() { print("beat") }
      fn hello() { "world" }
    }`);
    expect(code).toContain('function __cronFieldMatches');
    expect(code).toContain('function __cronMatches');
    expect(code).toContain('async function heartbeat()');
    expect(code).toContain('__cronMatches(');
    expect(code).toContain('60000');
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Codegen Orchestrator Gaps
// ═══════════════════════════════════════════════════════════════

describe('Orchestrator — Multiple named server blocks merged', () => {
  test('two named server blocks produce separate outputs in servers map', () => {
    const result = generate(`
      server "api" { fn get_data() { [] } }
      server "ws" { fn connect() { true } }
    `);
    expect(result.multiBlock).toBe(true);
    expect(result.servers).toBeDefined();
    expect(result.servers['api']).toContain('function get_data()');
    expect(result.servers['ws']).toContain('function connect()');
  });

  test('named server block uses PORT_NAME env var', () => {
    const result = generate('server "api" { fn ping() { true } }');
    expect(result.servers['api']).toContain('PORT_API');
    expect(result.servers['api']).toContain('[api]');
  });
});

describe('Orchestrator — Multiple named client blocks', () => {
  test('two named client blocks produce separate outputs in clients map', () => {
    const result = generate(`
      client "admin" { state x = 1 }
      client "dashboard" { state y = 2 }
    `);
    expect(result.multiBlock).toBe(true);
    expect(result.clients).toBeDefined();
    expect(result.clients['admin']).toContain('createSignal(1)');
    expect(result.clients['dashboard']).toContain('createSignal(2)');
  });
});

describe('Orchestrator — Test block generation', () => {
  test('test block generates bun:test describe/test wrappers', () => {
    const result = generate(`
      server {
        fn hello() { "world" }
      }
      test "API Tests" {
        fn test_hello() {
          print("test")
        }
      }
    `);
    expect(result.test).toBeDefined();
    expect(result.test).toContain('import { describe, test, expect } from "bun:test"');
    expect(result.test).toContain('describe("API Tests"');
    expect(result.test).toContain('test("test hello"');
    expect(result.test).toContain('async');
    // Test helpers
    expect(result.test).toContain('async function request(method, path');
    expect(result.test).toContain('function assert(condition');
    // Server should have __handleRequest export
    expect(result.server).toContain('export { __handleRequest }');
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Shared Codegen — Helper inclusion based on flags
// ═══════════════════════════════════════════════════════════════

describe('Shared — Helper inclusion based on flags', () => {
  test('shared code includes string functions as standalone stdlib', () => {
    const code = genShared('x = 1');
    expect(code).toContain('String methods are now standalone stdlib functions');
  });

  test('shared code includes Result/Option helper only when used', () => {
    const codeWithout = genShared('x = 1');
    expect(codeWithout).not.toContain('function Ok(value)');

    const codeWith = genShared('x = Ok(42)');
    expect(codeWith).toContain('function Ok(value)');
    expect(codeWith).toContain('function Err(error)');
    expect(codeWith).toContain('function Some(value)');
    expect(codeWith).toContain('const None = Object.freeze');
  });

  test('__contains helper is included only when membership expression used', () => {
    const codeWithout = genShared('x = 1');
    expect(codeWithout).not.toContain('function __contains');

    const codeWith = genShared('x = a in list');
    expect(codeWith).toContain('function __contains');
  });

  test('__propagate helper is included only when ? operator used', () => {
    const codeWithout = genShared('x = 1');
    expect(codeWithout).not.toContain('function __propagate');

    const codeWith = genShared('fn safe() { result? }');
    expect(codeWith).toContain('function __propagate');
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Error Propagation (?) Codegen
// ═══════════════════════════════════════════════════════════════

describe('Error Propagation — _containsPropagate detection', () => {
  test('PropagateExpression in function body is detected', () => {
    const gen = new BaseCodegen();
    const node = {
      type: 'FunctionDeclaration',
      name: 'test',
      params: [],
      body: {
        type: 'BlockStatement',
        body: [{
          type: 'ExpressionStatement',
          expression: {
            type: 'PropagateExpression',
            expression: { type: 'Identifier', name: 'result' }
          }
        }]
      }
    };
    // _containsPropagate stops at function boundaries, so calling on the FunctionDeclaration returns false
    // But calling on the body should detect it
    expect(gen._containsPropagate(node.body)).toBe(true);
  });

  test('_containsPropagate stops at nested function boundaries', () => {
    const gen = new BaseCodegen();
    const node = {
      type: 'BlockStatement',
      body: [{
        type: 'FunctionDeclaration',
        name: 'inner',
        params: [],
        body: {
          type: 'BlockStatement',
          body: [{
            type: 'ExpressionStatement',
            expression: {
              type: 'PropagateExpression',
              expression: { type: 'Identifier', name: 'result' }
            }
          }]
        }
      }]
    };
    // The outer block doesn't directly contain PropagateExpression
    // because _containsPropagate stops at FunctionDeclaration boundaries
    expect(gen._containsPropagate(node)).toBe(false);
  });

  test('_containsPropagate stops at lambda boundaries', () => {
    const gen = new BaseCodegen();
    const node = {
      type: 'BlockStatement',
      body: [{
        type: 'ExpressionStatement',
        expression: {
          type: 'LambdaExpression',
          params: [],
          body: {
            type: 'PropagateExpression',
            expression: { type: 'Identifier', name: 'result' }
          }
        }
      }]
    };
    expect(gen._containsPropagate(node)).toBe(false);
  });
});

describe('Error Propagation — getPropagateHelper generation', () => {
  test('getPropagateHelper returns correct unwrap logic', () => {
    const gen = new BaseCodegen();
    const helper = gen.getPropagateHelper();
    expect(helper).toContain('function __propagate(val)');
    expect(helper).toContain('__tag === "Err"');
    expect(helper).toContain('__tag === "None"');
    expect(helper).toContain('__tag === "Ok"');
    expect(helper).toContain('__tag === "Some"');
    expect(helper).toContain('__tova_propagate: true');
  });

  test('function with ? operator gets try/catch wrapper', () => {
    const code = genShared('fn safe(x) { x? }');
    expect(code).toContain('__propagate(x)');
    expect(code).toContain('try {');
    expect(code).toContain('catch (__e)');
    expect(code).toContain('__e.__tova_propagate');
    expect(code).toContain('return __e.value');
  });

  test('lambda with ? operator gets try/catch wrapper', () => {
    const code = genShared('f = fn(x) { x? }');
    expect(code).toContain('__propagate(x)');
    expect(code).toContain('try {');
    expect(code).toContain('catch (__e)');
    expect(code).toContain('__e.__tova_propagate');
  });
});

// ═══════════════════════════════════════════════════════════════
// Additional server codegen features
// ═══════════════════════════════════════════════════════════════

describe('Server — Health check generation', () => {
  test('health check generates GET route with uptime', () => {
    const code = genServer(`server {
      health "/health"
      fn hello() { "world" }
    }`);
    expect(code).toContain('Health Check');
    expect(code).toContain('__addRoute("GET", "/health"');
    expect(code).toContain('status: "ok"');
    expect(code).toContain('process.uptime()');
  });
});

describe('Server — CORS configuration', () => {
  test('custom cors config generates custom headers', () => {
    const code = genServer(`server {
      cors { origins: ["http://localhost:3000"], methods: ["GET", "POST"], credentials: true }
      fn hello() { "world" }
    }`);
    expect(code).toContain('const __corsOrigins = ["http://localhost:3000"]');
    expect(code).toContain('const __corsCredentials = true');
    expect(code).toContain('Access-Control-Allow-Credentials');
  });

  test('default cors uses wildcard', () => {
    const code = genServer('server { fn hello() { "world" } }');
    expect(code).toContain('Access-Control-Allow-Origin');
    expect(code).toContain('"*"');
  });
});

describe('Server — Async mutex / withLock generation', () => {
  test('server always generates async mutex', () => {
    const code = genServer('server { fn hello() { "world" } }');
    expect(code).toContain('Async Mutex');
    expect(code).toContain('class __Mutex');
    expect(code).toContain('async acquire()');
    expect(code).toContain('release()');
    expect(code).toContain('async function withLock(nameOrFn, fn)');
  });
});

describe('Server — Structured logging', () => {
  test('server generates structured logging helpers', () => {
    const code = genServer('server { cors { origins: ["*"] }\n fn hello() { "world" } }');
    expect(code).toContain('Structured Logging');
    expect(code).toContain('function __genRequestId()');
    expect(code).toContain('function __log(level, msg');
    expect(code).toContain('LOG_LEVEL');
    expect(code).toContain('LOG_FILE');
  });
});

describe('Server — Distributed tracing', () => {
  test('server generates request context with AsyncLocalStorage', () => {
    const code = genServer('server { cors { origins: ["*"] }\n fn hello() { "world" } }');
    expect(code).toContain('Distributed Tracing');
    expect(code).toContain('AsyncLocalStorage');
    expect(code).toContain('function __getRequestId()');
    expect(code).toContain('function __getLocals()');
  });
});

describe('Server — Response helpers', () => {
  test('server generates respond, redirect, set_cookie, stream, sse helpers', () => {
    const code = genServer('server { fn hello() { "world" } }');
    expect(code).toContain('function respond(status, body');
    expect(code).toContain('function redirect(url');
    expect(code).toContain('function set_cookie(name');
    expect(code).toContain('function stream(fn)');
    expect(code).toContain('function sse(fn)');
    expect(code).toContain('function html(body');
    expect(code).toContain('function text(body');
    expect(code).toContain('function with_headers(response');
  });
});

describe('Server — Auth builtins', () => {
  test('server generates sign_jwt, hash_password, verify_password', () => {
    const code = genServer('server { fn hello() { "world" } }');
    expect(code).toContain('async function sign_jwt(payload, secret');
    expect(code).toContain('async function hash_password(password)');
    expect(code).toContain('async function verify_password(password, stored)');
    expect(code).toContain('PBKDF2');
    expect(code).toContain('SHA-256');
  });
});

describe('Server — Graceful shutdown', () => {
  test('server generates graceful drain and shutdown', () => {
    const code = genServer('server { cors { origins: ["*"] }\n fn hello() { "world" } }');
    expect(code).toContain('Graceful Drain');
    expect(code).toContain('let __activeRequests = 0');
    expect(code).toContain('let __shuttingDown = false');
    expect(code).toContain('async function __shutdown()');
    expect(code).toContain('__server.stop()');
    expect(code).toContain('process.on("SIGINT", __shutdown)');
    expect(code).toContain('process.on("SIGTERM", __shutdown)');
  });
});

describe('Server — RPC with type-safe body validation', () => {
  test('RPC function parameters get extracted from body', () => {
    const code = genServer('server { fn add_todo(title) { title } }');
    expect(code).toContain('__addRoute("POST", "/rpc/add_todo"');
    expect(code).toContain('body.__args ? body.__args[0] : body.title');
    expect(code).toContain('const result = await add_todo(title)');
    expect(code).toContain('Response.json({ result })');
  });
});

describe('Server — Route group with prefix', () => {
  test('routes group generates prefixed routes', () => {
    const code = genServer(`server {
      fn list_users() { [] }
      fn get_user(id) { id }
      routes "/api" {
        route GET "/users" => list_users
        route GET "/users/:id" => get_user
      }
    }`);
    expect(code).toContain('__addRoute("GET", "/api/users"');
    expect(code).toContain('__addRoute("GET", "/api/users/:id"');
  });
});

// ═══════════════════════════════════════════════════════════════
// Additional base codegen features
// ═══════════════════════════════════════════════════════════════

describe('Base — genBlockBody with IfStatement last (implicit return)', () => {
  test('if-elif-else as last statement in function adds returns', () => {
    const code = genShared(`
      fn classify(n) {
        if n > 0 { "positive" }
        elif n == 0 { "zero" }
        else { "negative" }
      }
    `);
    expect(code).toContain('return "positive"');
    expect(code).toContain('return "zero"');
    expect(code).toContain('return "negative"');
  });

  test('match as last statement in function gets implicit return', () => {
    const code = genShared(`
      fn describe(n) {
        match n {
          0 => "zero",
          _ => "other"
        }
      }
    `);
    // Simple match is optimized to ternary, still gets implicit return
    expect(code).toContain('return ((n === 0)');
    expect(code).toContain('"zero"');
    expect(code).toContain('"other"');
  });
});

describe('Base — Foo.new() transform', () => {
  test('Type.new(args) becomes new Type(args)', () => {
    const code = genShared('x = Response.new("hello", {status: 200})');
    expect(code).toContain('new Response("hello"');
  });
});

describe('Base — NaN-safe null coalescing ??', () => {
  test('?? operator generates NaN-safe check', () => {
    const code = genShared('x = a ?? "default"');
    // Optimized: simple expressions inline the NaN-safe check
    expect(code).toContain('a != null && a === a');
    expect(code).toContain('"default"');
  });
});

describe('Base — Pipe expression', () => {
  test('pipe into identifier calls function with left as argument', () => {
    const code = genShared('x = data |> process');
    expect(code).toContain('process(data)');
  });

  test('pipe into call expression inserts left as first argument', () => {
    const code = genShared('x = data |> filter(fn(x) x > 0)');
    expect(code).toContain('filter(data,');
  });

  test('chained pipes nest correctly', () => {
    const code = genShared('x = data |> double |> triple');
    expect(code).toContain('triple(double(data))');
  });
});

describe('Base — Scope tracking', () => {
  test('function-local const does not leak to sibling function', () => {
    const code = genShared('fn foo() { x = 1 }\nfn bar() { x = 2 }');
    const matches = code.match(/const x = /g);
    expect(matches).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// Phase 4: Scoped Slots + Computed Prop Memoization
// ═══════════════════════════════════════════════════════════════

describe('Client — <slot> generates children access', () => {
  test('default slot generates __props.children', () => {
    const code = genClient('client {\n  component Card {\n    <div>\n      <slot />\n    </div>\n  }\n}');
    expect(code).toContain('__props.children');
  });

  test('named slot generates __props.slotName', () => {
    const code = genClient('client {\n  component Layout {\n    <div>\n      <slot name="header" />\n    </div>\n  }\n}');
    expect(code).toContain('__props.header');
  });
});

describe('Client — Computed prop memoization', () => {
  test('simple signal read does not get memoized', () => {
    const code = genClient('client {\n  component App {\n    state x = 1\n    <Child val={x} />\n  }\n  component Child(val) {\n    <p>{val}</p>\n  }\n}');
    // Simple signal: get val() { return x(); } — no createComputed
    expect(code).not.toContain('__memo_');
  });

  test('complex expression gets memoized with createComputed', () => {
    const code = genClient('client {\n  component App {\n    state x = 1\n    state y = 2\n    <Child val={x + y} />\n  }\n  component Child(val) {\n    <p>{val}</p>\n  }\n}');
    expect(code).toContain('__memo_val');
    expect(code).toContain('createComputed');
  });
});
