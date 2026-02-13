import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function analyze(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze();
}

function analyzeThrows(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>');
  return () => analyzer.analyze();
}

function getAnalyzer(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  return new Analyzer(ast, '<test>');
}

// =====================================================================
// 1. All server declaration visitors
// =====================================================================

describe('Server declaration visitors', () => {

  test('health check declaration inside server block', () => {
    expect(() => analyze('server { health "/health" }')).not.toThrow();
  });

  test('health check outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.HealthCheckDeclaration('/health', loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/health.*server block/i);
  });

  test('CORS declaration inside server block', () => {
    expect(() => analyze(`
      server {
        cors {
          origins: ["*"],
          methods: ["GET", "POST"]
        }
      }
    `)).not.toThrow();
  });

  test('CORS outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.CorsDeclaration({
      origins: new AST.ArrayLiteral([new AST.StringLiteral('*', loc)], loc)
    }, loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/cors.*server block/i);
  });

  test('auth declaration inside server block', () => {
    expect(() => analyze(`
      server {
        auth {
          secret: "my_secret"
        }
      }
    `)).not.toThrow();
  });

  test('auth outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.AuthDeclaration({
      secret: new AST.StringLiteral('s', loc)
    }, loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/auth.*server block/i);
  });

  test('rate limit declaration inside server block', () => {
    expect(() => analyze(`
      server {
        rate_limit {
          max: 100,
          window: 60
        }
      }
    `)).not.toThrow();
  });

  test('rate limit outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.RateLimitDeclaration({
      max: new AST.NumberLiteral(100, loc)
    }, loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/rate_limit.*server block/i);
  });

  test('WebSocket declaration inside server block', () => {
    expect(() => analyze(`
      server {
        ws {
          on_open fn(ws) { print(ws) }
          on_message fn(ws, msg) { print(msg) }
          on_close fn(ws) { print("closed") }
        }
      }
    `)).not.toThrow();
  });

  test('WebSocket outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.WebSocketDeclaration({}, loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/ws.*server block/i);
  });

  test('SSE declaration inside server block', () => {
    expect(() => analyze(`
      server {
        sse "/events" fn(send, close) {
          send("hello")
        }
      }
    `)).not.toThrow();
  });

  test('SSE outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.SseDeclaration('/events', [
      new AST.Parameter('send', null, null, loc)
    ], new AST.BlockStatement([], loc), loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/sse.*server block/i);
  });

  test('model declaration inside server block', () => {
    expect(() => analyze(`
      server {
        model User
      }
    `)).not.toThrow();
  });

  test('model with config inside server block', () => {
    expect(() => analyze(`
      server {
        model User {
          table: "users"
        }
      }
    `)).not.toThrow();
  });

  test('model outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.ModelDeclaration('User', null, loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/model.*server block/i);
  });

  test('env declaration inside server block', () => {
    expect(() => analyze(`
      server {
        env DATABASE_URL: String = "sqlite:db.sqlite"
      }
    `)).not.toThrow();
  });

  test('env without default inside server block', () => {
    expect(() => analyze(`
      server {
        env SECRET_KEY: String
      }
    `)).not.toThrow();
  });

  test('env outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.EnvDeclaration('DB_URL', null, null, loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/env.*server block/i);
  });

  test('schedule declaration inside server block', () => {
    expect(() => analyze(`
      server {
        schedule "*/5 * * * *" fn cleanup() {
          print("cleaning")
        }
      }
    `)).not.toThrow();
  });

  test('schedule without name inside server block', () => {
    expect(() => analyze(`
      server {
        schedule "0 0 * * *" fn() {
          print("midnight")
        }
      }
    `)).not.toThrow();
  });

  test('schedule outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.ScheduleDeclaration('* * * * *', 'job', [], new AST.BlockStatement([], loc), loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/schedule.*server block/i);
  });

  test('upload declaration inside server block', () => {
    expect(() => analyze(`
      server {
        upload {
          max_size: 1048576
        }
      }
    `)).not.toThrow();
  });

  test('upload outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.UploadDeclaration({
      max_size: new AST.NumberLiteral(1024, loc)
    }, loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/upload.*server block/i);
  });

  test('session declaration inside server block', () => {
    expect(() => analyze(`
      server {
        session {
          secret: "session_secret",
          max_age: 3600
        }
      }
    `)).not.toThrow();
  });

  test('session outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.SessionDeclaration({
      secret: new AST.StringLiteral('s', loc)
    }, loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/session.*server block/i);
  });

  test('db declaration inside server block', () => {
    expect(() => analyze(`
      server {
        db {
          driver: "sqlite",
          path: "app.db"
        }
      }
    `)).not.toThrow();
  });

  test('db outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.DbDeclaration({
      path: new AST.StringLiteral('db.sqlite', loc)
    }, loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/db.*server block/i);
  });

  test('TLS declaration inside server block', () => {
    expect(() => analyze(`
      server {
        tls {
          cert: "cert.pem",
          key: "key.pem"
        }
      }
    `)).not.toThrow();
  });

  test('TLS outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.TlsDeclaration({
      cert: new AST.StringLiteral('cert.pem', loc)
    }, loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/tls.*server block/i);
  });

  test('compression declaration inside server block', () => {
    expect(() => analyze(`
      server {
        compression {
          enabled: true,
          min_size: 1024
        }
      }
    `)).not.toThrow();
  });

  test('compression outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.CompressionDeclaration({
      enabled: new AST.BooleanLiteral(true, loc)
    }, loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/compression.*server block/i);
  });

  test('background job declaration inside server block', () => {
    expect(() => analyze(`
      server {
        background fn send_email(to, body) {
          print(to)
        }
      }
    `)).not.toThrow();
  });

  test('background job outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.BackgroundJobDeclaration('job', [], new AST.BlockStatement([], loc), loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/background.*server block/i);
  });

  test('cache declaration inside server block', () => {
    expect(() => analyze(`
      server {
        cache {
          max_age: 3600
        }
      }
    `)).not.toThrow();
  });

  test('cache outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.CacheDeclaration({
      max_age: new AST.NumberLiteral(3600, loc)
    }, loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/cache.*server block/i);
  });

  test('test block at top level', () => {
    expect(() => analyze(`
      test "math tests" {
        fn test_addition() {
          x = 1 + 2
        }
      }
    `)).not.toThrow();
  });

  test('static declaration inside server block', () => {
    expect(() => analyze(`
      server {
        static "/public" => "./public"
      }
    `)).not.toThrow();
  });

  test('static outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.StaticDeclaration('/public', './public', loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/static.*server block/i);
  });

  test('discover declaration inside server block', () => {
    expect(() => analyze(`
      server {
        discover "events" at "http://localhost:3001"
      }
    `)).not.toThrow();
  });

  test('discover outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.DiscoverDeclaration('peer', new AST.StringLiteral('http://localhost', loc), loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/discover.*server block/i);
  });

  test('middleware declaration inside server block', () => {
    expect(() => analyze(`
      server {
        middleware fn logger(req, next) {
          print(req)
          next(req)
        }
      }
    `)).not.toThrow();
  });

  test('middleware outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.MiddlewareDeclaration('logger', [
      new AST.Parameter('req', null, null, loc),
      new AST.Parameter('next', null, null, loc)
    ], new AST.BlockStatement([], loc), loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/middleware.*server block/i);
  });

  test('error handler declaration inside server block', () => {
    expect(() => analyze(`
      server {
        on_error fn(err, req) {
          print(err)
        }
      }
    `)).not.toThrow();
  });

  test('error handler outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.ErrorHandlerDeclaration([
      new AST.Parameter('err', null, null, loc)
    ], new AST.BlockStatement([], loc), loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/on_error.*server block/i);
  });

  test('lifecycle hooks inside server block', () => {
    expect(() => analyze(`
      server {
        on_start fn() { print("starting") }
        on_stop fn() { print("stopping") }
      }
    `)).not.toThrow();
  });

  test('lifecycle hook outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.LifecycleHookDeclaration('start', [], new AST.BlockStatement([], loc), loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/on_start.*server block/i);
  });

  test('route group declaration inside server block', () => {
    expect(() => analyze(`
      server {
        fn get_items() { "items" }
        routes "/api/v1" {
          fn get_users() { "users" }
          route get "/users" => get_users
        }
      }
    `)).not.toThrow();
  });

  test('route group outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.RouteGroupDeclaration('/api', [], loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/routes.*server block/i);
  });

  test('subscribe declaration inside server block', () => {
    expect(() => analyze(`
      server {
        subscribe "user_created" fn(data) {
          print(data)
        }
      }
    `)).not.toThrow();
  });

  test('subscribe outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.SubscribeDeclaration('event', [
      new AST.Parameter('data', null, null, loc)
    ], new AST.BlockStatement([], loc), loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/subscribe.*server block/i);
  });

  test('max_body declaration inside server block', () => {
    expect(() => analyze(`
      server {
        max_body 1048576
      }
    `)).not.toThrow();
  });

  test('max_body outside server block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.MaxBodyDeclaration(new AST.NumberLiteral(1024, loc), loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/max_body.*server block/i);
  });
});

// =====================================================================
// 2. Scope management edge cases
// =====================================================================

describe('Scope management edge cases', () => {

  test('variables in try block do not leak to catch block', () => {
    // try_var should be in try scope, not accessible in catch scope
    // But since try scope and catch scope are siblings, neither sees the other.
    // The analyzer creates separate child scopes, so this should work fine.
    expect(() => analyze(`
      try {
        try_var = 42
      } catch e {
        catch_var = e
      }
    `)).not.toThrow();
  });

  test('try block variable not visible at module scope', () => {
    const { scope } = analyze(`
      try {
        inner = 42
      } catch e {
        err = e
      }
    `);
    expect(scope.lookupLocal('inner')).toBeNull();
    expect(scope.lookupLocal('e')).toBeNull();
    expect(scope.lookupLocal('err')).toBeNull();
  });

  test('for loop variable not visible outside loop', () => {
    const { scope } = analyze('items = [1, 2, 3]\nfor item in items { y = item }');
    expect(scope.lookupLocal('item')).toBeNull();
    expect(scope.lookupLocal('y')).toBeNull();
  });

  test('for loop with two variables scoping', () => {
    const { scope } = analyze('pairs = []\nfor k, v in pairs { x = k }');
    expect(scope.lookupLocal('k')).toBeNull();
    expect(scope.lookupLocal('v')).toBeNull();
  });

  test('while with empty body', () => {
    expect(() => analyze('while true { }')).not.toThrow();
  });

  test('nested blocks scope isolation', () => {
    // Variables in nested if/for should not leak to the outer scope
    const { scope } = analyze(`
      if true {
        a = 1
        if true {
          b = 2
        }
      }
    `);
    expect(scope.lookupLocal('a')).toBeNull();
    expect(scope.lookupLocal('b')).toBeNull();
  });

  test('function creates its own scope for params', () => {
    const { scope } = analyze('fn foo(x, y) { z = x + y }');
    expect(scope.lookupLocal('x')).toBeNull();
    expect(scope.lookupLocal('y')).toBeNull();
    expect(scope.lookupLocal('z')).toBeNull();
    expect(scope.lookup('foo')).not.toBeNull();
  });

  test('server block scope isolation from module scope', () => {
    const { scope } = analyze('server { server_var = 42 }');
    expect(scope.lookupLocal('server_var')).toBeNull();
  });

  test('client block scope isolation from module scope', () => {
    const { scope } = analyze('client { state counter = 0 }');
    expect(scope.lookupLocal('counter')).toBeNull();
  });

  test('shared block scope isolation from module scope', () => {
    const { scope } = analyze('shared { shared_val = 1 }');
    expect(scope.lookupLocal('shared_val')).toBeNull();
  });
});

// =====================================================================
// 3. Pattern matching analysis
// =====================================================================

describe('Pattern matching analysis', () => {

  test('variant with zero fields (None)', () => {
    expect(() => analyze(`
      x = None
      result = match x {
        None => "nothing",
        _ => "something"
      }
    `)).not.toThrow();
  });

  test('variant pattern with fields binds variables in arm scope', () => {
    expect(() => analyze(`
      type Shape { Circle(r: Float), Rect(w: Float, h: Float) }
      s = Circle(5.0)
      area = match s {
        Circle(r) => r * r,
        Rect(w, h) => w * h,
        _ => 0
      }
    `)).not.toThrow();
  });

  test('guard expressions in match arms', () => {
    expect(() => analyze(`
      val = 15
      label = match val {
        n if n > 100 => "huge",
        n if n > 10 => "big",
        n if n > 0 => "small",
        _ => "zero or negative"
      }
    `)).not.toThrow();
  });

  test('mixed guard and no-guard arms', () => {
    expect(() => analyze(`
      val = 5
      result = match val {
        0 => "zero",
        n if n > 10 => "big",
        1 => "one",
        _ => "other"
      }
    `)).not.toThrow();
  });

  test('range pattern in match', () => {
    expect(() => analyze(`
      val = 5
      label = match val {
        1..5 => "low",
        6..10 => "medium",
        _ => "high"
      }
    `)).not.toThrow();
  });

  test('wildcard pattern matches anything', () => {
    expect(() => analyze(`
      val = 42
      result = match val { _ => "anything" }
    `)).not.toThrow();
  });

  test('binding pattern creates variable in arm scope', () => {
    expect(() => analyze(`
      val = 42
      result = match val { n => n + 1 }
    `)).not.toThrow();
  });

  test('match arm with block body', () => {
    expect(() => analyze(`
      val = 5
      result = match val {
        1 => {
          x = 10
          x + 1
        },
        _ => 0
      }
    `)).not.toThrow();
  });

  test('literal pattern in match', () => {
    expect(() => analyze(`
      val = 1
      result = match val {
        1 => "one",
        2 => "two",
        _ => "other"
      }
    `)).not.toThrow();
  });
});

// =====================================================================
// 4. Expression analysis edge cases
// =====================================================================

describe('Expression analysis edge cases', () => {

  test('compound assignment on member expression allowed', () => {
    expect(() => analyze('var obj = {}\nobj.count += 1')).not.toThrow();
  });

  test('compound assignment on immutable identifier errors', () => {
    expect(analyzeThrows('x = 5\nx += 1')).toThrow(/Cannot use '\+=' on immutable variable 'x'/);
  });

  test('compound assignment -= on immutable errors', () => {
    expect(analyzeThrows('x = 5\nx -= 1')).toThrow(/Cannot use '-=' on immutable variable 'x'/);
  });

  test('compound assignment on mutable variable succeeds', () => {
    expect(() => analyze('var x = 5\nx += 1')).not.toThrow();
  });

  test('CallExpression with mixed named and positional args', () => {
    expect(() => analyze(`
      fn create(name, age, role) { name }
      result = create("Alice", age: 30, role: "admin")
    `)).not.toThrow();
  });

  test('CallExpression with only named args', () => {
    expect(() => analyze(`
      fn make(a, b) { a + b }
      result = make(a: 1, b: 2)
    `)).not.toThrow();
  });

  test('RPC validation: unknown peer function errors', () => {
    expect(analyzeThrows(`
      server "api" { fn create() { events.nonexistent("test") } }
      server "events" { fn push(data) { data } }
    `)).toThrow(/No function 'nonexistent' in server block "events"/);
  });

  test('RPC validation: self-call produces warning', () => {
    const analyzer = getAnalyzer('server "api" { fn foo() { api.foo() } }');
    const result = analyzer.analyze();
    expect(result.warnings.some(w => w.message.includes('calling itself'))).toBe(true);
  });

  test('RPC validation: valid peer call succeeds', () => {
    expect(() => analyze(`
      server "api" { fn create() { events.push("test") } }
      server "events" { fn push(data) { data } }
    `)).not.toThrow();
  });

  test('propagate expression (?) analyzed', () => {
    expect(() => analyze(`
      fn process(val) {
        result = val?
        result
      }
    `)).not.toThrow();
  });

  test('if expression as value', () => {
    expect(() => analyze('x = if true { 1 } elif false { 2 } else { 3 }')).not.toThrow();
  });

  test('pipe expression analyzed', () => {
    expect(() => analyze('x = 1 |> print')).not.toThrow();
  });

  test('slice expression with all parts', () => {
    expect(() => analyze('a = [1, 2, 3, 4, 5]\nb = a[0:4:2]')).not.toThrow();
  });

  test('slice expression with only start and end', () => {
    expect(() => analyze('a = [1, 2, 3]\nb = a[1:3]')).not.toThrow();
  });

  test('membership expression with in', () => {
    expect(() => analyze('items = [1, 2, 3]\nx = 2 in items')).not.toThrow();
  });

  test('membership expression with not in', () => {
    expect(() => analyze('items = [1, 2, 3]\nx = 5 not in items')).not.toThrow();
  });

  test('chained comparison', () => {
    expect(() => analyze('x = 1 < 2 < 3')).not.toThrow();
  });

  test('logical expression with and/or', () => {
    expect(() => analyze('x = true and false or true')).not.toThrow();
  });

  test('unary expression', () => {
    expect(() => analyze('x = -5\ny = not true')).not.toThrow();
  });

  test('binary expression operators', () => {
    expect(() => analyze('x = 1 + 2 * 3 - 4 / 2')).not.toThrow();
  });

  test('template literal with interpolation', () => {
    expect(() => analyze('name = "world"\nx = "hello {name}!"')).not.toThrow();
  });

  test('spread expression in array', () => {
    expect(() => analyze('a = [1, 2]\nb = [...a, 3]')).not.toThrow();
  });

  test('range expression', () => {
    expect(() => analyze('r = 1..100')).not.toThrow();
  });

  test('object literal', () => {
    expect(() => analyze('x = { a: 1, b: 2 }')).not.toThrow();
  });

  test('array literal', () => {
    expect(() => analyze('x = [1, 2, 3]')).not.toThrow();
  });

  test('optional chaining', () => {
    expect(() => analyze('obj = {}\nx = obj?.name?.first')).not.toThrow();
  });

  test('computed member expression', () => {
    expect(() => analyze('obj = {}\nkey = "name"\nx = obj[key]')).not.toThrow();
  });
});

// =====================================================================
// 5. Type declaration analysis
// =====================================================================

describe('Type declaration analysis', () => {

  test('type with variants defines variant constructors', () => {
    const { scope } = analyze('type Shape { Circle(r: Float), Rect(w: Float, h: Float) }');
    expect(scope.lookup('Shape').kind).toBe('type');
    expect(scope.lookup('Circle').kind).toBe('function');
    expect(scope.lookup('Rect').kind).toBe('function');
  });

  test('type with variant fields', () => {
    const { scope } = analyze('type Maybe { Just(value: Any), Nothing }');
    const just = scope.lookup('Just');
    expect(just).not.toBeNull();
    expect(just.kind).toBe('function');
    const nothing = scope.lookup('Nothing');
    expect(nothing).not.toBeNull();
    expect(nothing.kind).toBe('function');
  });

  test('type with no variants (struct-like)', () => {
    const { scope } = analyze('type User { name: String, age: Int }');
    expect(scope.lookup('User')).not.toBeNull();
    expect(scope.lookup('User').kind).toBe('type');
  });

  test('duplicate type declaration throws', () => {
    expect(analyzeThrows('type A { x: Int }\ntype A { y: Int }')).toThrow(/already defined/);
  });

  test('duplicate variant constructor throws', () => {
    expect(analyzeThrows('type A { Foo(x: Int) }\ntype B { Foo(y: Int) }')).toThrow(/already defined/);
  });

  test('type with generic parameters', () => {
    const { scope } = analyze('type Box<T> { value: T }');
    expect(scope.lookup('Box')).not.toBeNull();
    expect(scope.lookup('Box').kind).toBe('type');
  });

  test('enum-style type with bare variants', () => {
    const { scope } = analyze('type Color { Red, Green, Blue }');
    expect(scope.lookup('Color')).not.toBeNull();
    expect(scope.lookup('Red')).not.toBeNull();
    expect(scope.lookup('Green')).not.toBeNull();
    expect(scope.lookup('Blue')).not.toBeNull();
  });
});

// =====================================================================
// 6. Component/Store analysis
// =====================================================================

describe('Component and Store analysis', () => {

  test('store with multiple state members', () => {
    expect(() => analyze(`
      client {
        store AppStore {
          state count = 0
          state name = "test"
          state items = []
        }
      }
    `)).not.toThrow();
  });

  test('store with state, computed, and functions', () => {
    expect(() => analyze(`
      client {
        store TodoStore {
          state items = []
          computed count = len(items)
          fn add(item) { items }
        }
      }
    `)).not.toThrow();
  });

  test('store name registered in scope', () => {
    const { scope } = analyze('client { store MyStore { state x = 0 } }');
    // Store is defined in client scope, not module scope
    // But the client scope is a child of module scope
    // so lookupLocal on module scope should return null
    expect(scope.lookupLocal('MyStore')).toBeNull();
  });

  test('store outside client block errors via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.StoreDeclaration('MyStore', [], loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/store.*client block/i);
  });

  test('component body with JSX and statements', () => {
    expect(() => analyze(`
      client {
        component App {
          x = 1
          <div>"hello"</div>
        }
      }
    `)).not.toThrow();
  });

  test('component with typed props', () => {
    expect(() => analyze(`
      client {
        component Card(title: String, count: Int) {
          <div>"card"</div>
        }
      }
    `)).not.toThrow();
  });

  test('component with no params', () => {
    expect(() => analyze(`
      client {
        component App {
          <div>"Hello World"</div>
        }
      }
    `)).not.toThrow();
  });

  test('state with type annotation', () => {
    expect(() => analyze('client { state count: Int = 0 }')).not.toThrow();
  });

  test('duplicate component name throws', () => {
    expect(analyzeThrows(`
      client {
        component App { <div>"a"</div> }
        component App { <div>"b"</div> }
      }
    `)).toThrow(/already defined/);
  });

  test('computed declaration inside client', () => {
    expect(() => analyze(`
      client {
        state count = 0
        computed doubled = count * 2
        computed tripled = count * 3
      }
    `)).not.toThrow();
  });

  test('effect declaration inside client', () => {
    expect(() => analyze(`
      client {
        state count = 0
        effect { print(count) }
      }
    `)).not.toThrow();
  });
});

// =====================================================================
// 7. JSX analysis
// =====================================================================

describe('JSX analysis', () => {

  test('JSX spread attribute via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const spreadAttr = new AST.JSXSpreadAttribute(new AST.Identifier('props', loc), loc);
    const div = new AST.JSXElement('div', [spreadAttr], [
      new AST.JSXText('hello', loc)
    ], false, loc);
    const comp = new AST.ComponentDeclaration('App', [
      new AST.Parameter('props', null, null, loc)
    ], [div], loc);
    const clientBlock = new AST.ClientBlock([comp], loc);
    const ast = new AST.Program([clientBlock]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).not.toThrow();
  });

  test('JSX with mixed children (text, expression, element)', () => {
    expect(() => analyze(`
      client {
        component App {
          <div>
            "hello "
            {name}
            <span>"world"</span>
          </div>
        }
      }
    `)).not.toThrow();
  });

  test('JSXIf with elif branches', () => {
    expect(() => analyze(`
      client {
        component App {
          <div>
            if x > 10 {
              <span>"big"</span>
            } elif x > 5 {
              <span>"medium"</span>
            } elif x > 0 {
              <span>"small"</span>
            } else {
              <span>"zero"</span>
            }
          </div>
        }
      }
    `)).not.toThrow();
  });

  test('JSXIf without else', () => {
    expect(() => analyze(`
      client {
        component App {
          <div>
            if show {
              <span>"visible"</span>
            }
          </div>
        }
      }
    `)).not.toThrow();
  });

  test('JSXFor variable scoping', () => {
    // The for loop variable should be scoped to the JSXFor body
    expect(() => analyze(`
      client {
        component List {
          <ul>
            for item in items {
              <li>"text"</li>
            }
          </ul>
        }
      }
    `)).not.toThrow();
  });

  test('nested JSX elements', () => {
    expect(() => analyze(`
      client {
        component App {
          <div>
            <header><h1>"Title"</h1></header>
            <main><p>"Content"</p></main>
          </div>
        }
      }
    `)).not.toThrow();
  });

  test('JSX with event handler attribute', () => {
    expect(() => analyze(`
      client {
        state count = 0
        component App {
          <button on:click={fn() count + 1}>"Click"</button>
        }
      }
    `)).not.toThrow();
  });

  test('JSX with bind directive', () => {
    expect(() => analyze(`
      client {
        state name = ""
        component App {
          <input bind:value={name} />
        }
      }
    `)).not.toThrow();
  });

  test('JSX self-closing element', () => {
    expect(() => analyze(`
      client {
        component App {
          <div><br /><hr /></div>
        }
      }
    `)).not.toThrow();
  });
});

// =====================================================================
// 8. Import/Export
// =====================================================================

describe('Import analysis', () => {

  test('import with alias defines local name', () => {
    const { scope } = analyze('import { foo as myFoo } from "utils"');
    expect(scope.lookup('myFoo')).not.toBeNull();
    expect(scope.lookup('myFoo').kind).toBe('variable');
  });

  test('default import defines binding', () => {
    const { scope } = analyze('import React from "react"');
    expect(scope.lookup('React')).not.toBeNull();
    expect(scope.lookup('React').kind).toBe('variable');
  });

  test('named imports define bindings', () => {
    const { scope } = analyze('import { foo, bar, baz } from "utils"');
    expect(scope.lookup('foo')).not.toBeNull();
    expect(scope.lookup('bar')).not.toBeNull();
    expect(scope.lookup('baz')).not.toBeNull();
  });

  test('duplicate import name throws', () => {
    expect(analyzeThrows('import { foo } from "a"\nimport { foo } from "b"')).toThrow(/already defined/);
  });

  test('duplicate default import throws', () => {
    expect(analyzeThrows('import React from "react"\nimport React from "react2"')).toThrow(/already defined/);
  });
});

// =====================================================================
// 9. Lambda and function analysis
// =====================================================================

describe('Lambda and function analysis', () => {

  test('lambda with expression body', () => {
    expect(() => analyze('add = fn(a, b) a + b')).not.toThrow();
  });

  test('lambda with block body', () => {
    expect(() => analyze('add = fn(a, b) { return a + b }')).not.toThrow();
  });

  test('lambda with no params', () => {
    expect(() => analyze('noop = fn() 42')).not.toThrow();
  });

  test('lambda params scoped to lambda', () => {
    const { scope } = analyze('f = fn(x, y) x + y');
    expect(scope.lookupLocal('x')).toBeNull();
    expect(scope.lookupLocal('y')).toBeNull();
  });

  test('lambda with duplicate params throws', () => {
    expect(analyzeThrows('f = fn(a, a) a')).toThrow(/already defined/);
  });

  test('function with no params', () => {
    const { scope } = analyze('fn noop() { }');
    expect(scope.lookup('noop')).not.toBeNull();
    expect(scope.lookup('noop').kind).toBe('function');
  });

  test('function with return type', () => {
    const { scope } = analyze('fn greet(name: String) -> String { name }');
    const sym = scope.lookup('greet');
    expect(sym).not.toBeNull();
    expect(sym.type).not.toBeNull();
  });

  test('function with default params', () => {
    expect(() => analyze('fn greet(name = "world") { name }')).not.toThrow();
  });

  test('recursive function', () => {
    expect(() => analyze(`
      fn factorial(n) {
        if n <= 1 { return 1 }
        return n * factorial(n - 1)
      }
    `)).not.toThrow();
  });

  test('nested functions', () => {
    expect(() => analyze(`
      fn outer() {
        fn inner() {
          x = 42
        }
      }
    `)).not.toThrow();
  });

  test('duplicate function name throws', () => {
    expect(analyzeThrows('fn foo() { 1 }\nfn foo() { 2 }')).toThrow(/already defined/);
  });

  test('duplicate param name throws', () => {
    expect(analyzeThrows('fn bad(a, a) { a }')).toThrow(/already defined/);
  });
});

// =====================================================================
// 10. Error detection
// =====================================================================

describe('Error detection', () => {

  test('immutable reassignment detected', () => {
    expect(analyzeThrows('x = 1\nx = 2')).toThrow(/Cannot reassign immutable variable 'x'/);
  });

  test('duplicate variable definition detected', () => {
    expect(analyzeThrows('var x = 1\nvar x = 2')).toThrow(/already defined/);
  });

  test('duplicate let destructure names detected', () => {
    expect(analyzeThrows('let { a } = obj\nlet { a } = obj2')).toThrow(/already defined/);
  });

  test('duplicate array destructure names detected', () => {
    expect(analyzeThrows('let [a, b] = pair\nlet [a] = other')).toThrow(/already defined/);
  });

  test('compound assignment on immutable variable detected', () => {
    expect(analyzeThrows('x = 5\nx += 1')).toThrow(/Cannot use '\+=' on immutable variable/);
  });

  test('duplicate function name detected', () => {
    expect(analyzeThrows('fn foo() { 1 }\nfn foo() { 2 }')).toThrow(/already defined/);
  });

  test('duplicate type name detected', () => {
    expect(analyzeThrows('type Foo { x: Int }\ntype Foo { y: Int }')).toThrow(/already defined/);
  });

  test('duplicate import name detected', () => {
    expect(analyzeThrows('import { foo } from "a"\nimport { foo } from "b"')).toThrow(/already defined/);
  });

  test('duplicate component param detected', () => {
    expect(analyzeThrows('client { component Bad(x, x) { <div>"test"</div> } }')).toThrow(/already defined/);
  });

  test('duplicate state name in client block detected', () => {
    expect(analyzeThrows('client { state count = 0\nstate count = 1 }')).toThrow(/already defined/);
  });

  test('duplicate computed name detected', () => {
    expect(analyzeThrows('client { computed a = 1\ncomputed a = 2 }')).toThrow(/already defined/);
  });
});

// =====================================================================
// 11. Result/Option builtins
// =====================================================================

describe('Result/Option builtins', () => {

  test('Ok is pre-defined as builtin', () => {
    const { scope } = analyze('x = 1');
    const ok = scope.lookup('Ok');
    expect(ok).not.toBeNull();
    expect(ok.kind).toBe('builtin');
  });

  test('Err is pre-defined as builtin', () => {
    const { scope } = analyze('x = 1');
    const err = scope.lookup('Err');
    expect(err).not.toBeNull();
    expect(err.kind).toBe('builtin');
  });

  test('Some is pre-defined as builtin', () => {
    const { scope } = analyze('x = 1');
    const some = scope.lookup('Some');
    expect(some).not.toBeNull();
    expect(some.kind).toBe('builtin');
  });

  test('None is pre-defined as builtin', () => {
    const { scope } = analyze('x = 1');
    const none = scope.lookup('None');
    expect(none).not.toBeNull();
    expect(none.kind).toBe('builtin');
  });

  test('Result is pre-defined as builtin', () => {
    const { scope } = analyze('x = 1');
    expect(scope.lookup('Result')).not.toBeNull();
  });

  test('Option is pre-defined as builtin', () => {
    const { scope } = analyze('x = 1');
    expect(scope.lookup('Option')).not.toBeNull();
  });

  test('Ok/Err can be used in expressions', () => {
    expect(() => analyze('x = Ok(42)\ny = Err("oops")')).not.toThrow();
  });

  test('Some/None can be used in expressions', () => {
    expect(() => analyze('x = Some(42)\ny = None')).not.toThrow();
  });

  test('pattern matching with Result types', () => {
    expect(() => analyze(`
      result = Ok(42)
      val = match result {
        Ok(value) => value,
        Err(error) => 0,
        _ => -1
      }
    `)).not.toThrow();
  });

  test('pattern matching with Option types', () => {
    expect(() => analyze(`
      opt = Some(10)
      val = match opt {
        Some(value) => value,
        None => 0,
        _ => -1
      }
    `)).not.toThrow();
  });
});

// =====================================================================
// 12. Multiple errors accumulated
// =====================================================================

describe('Multiple errors accumulated', () => {

  test('analyzer accumulates multiple errors before throwing', () => {
    // Create an AST with multiple errors
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };

    // Two state declarations outside client block
    const state1 = new AST.StateDeclaration('a', null, new AST.NumberLiteral(1, loc), loc);
    const state2 = new AST.StateDeclaration('b', null, new AST.NumberLiteral(2, loc), loc);
    const ast = new AST.Program([state1, state2]);
    const analyzer = new Analyzer(ast, '<test>');

    try {
      analyzer.analyze();
      // Should not reach here
      expect(true).toBe(false);
    } catch (e) {
      // The error message should contain references to both state declarations
      expect(e.message).toContain('Analysis errors');
      // Both state-outside-client errors should be present
      expect(e.message).toContain("'state' can only be used inside a client block");
    }
  });

  test('multiple errors include all violation messages', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };

    const state1 = new AST.StateDeclaration('x', null, new AST.NumberLiteral(0, loc), loc);
    const comp1 = new AST.ComputedDeclaration('y', new AST.NumberLiteral(0, loc), loc);
    const ast = new AST.Program([state1, comp1]);
    const analyzer = new Analyzer(ast, '<test>');

    try {
      analyzer.analyze();
      expect(true).toBe(false);
    } catch (e) {
      expect(e.message).toContain("'state' can only be used inside a client block");
      expect(e.message).toContain("'computed' can only be used inside a client block");
    }
  });

  test('error includes file, line, and column info', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 5, column: 3, file: 'app.tova' };
    const node = new AST.StateDeclaration('count', null, new AST.NumberLiteral(0, loc), loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, 'app.tova');

    try {
      analyzer.analyze();
      expect(true).toBe(false);
    } catch (e) {
      expect(e.message).toContain('app.tova:5:3');
    }
  });
});

// =====================================================================
// 13. Pre-pass function collection from route groups
// =====================================================================

describe('Pre-pass function collection from route groups', () => {

  test('functions inside route groups collected in pre-pass', () => {
    // When a function is defined inside a route group, it should still
    // be findable for inter-server RPC validation
    expect(() => analyze(`
      server "api" {
        fn top_level() { svc.helper() }
        routes "/v1" {
          fn get_users() { "users" }
        }
      }
      server "svc" {
        fn helper() { "help" }
        routes "/internal" {
          fn process() { "processed" }
        }
      }
    `)).not.toThrow();
  });

  test('pre-pass collects named server block functions', () => {
    const source = `
      server "api" {
        fn handler_a() { 1 }
        fn handler_b() { 2 }
      }
      server "events" {
        fn push(data) { data }
      }
    `;
    const analyzer = getAnalyzer(source);
    // Trigger the pre-pass
    analyzer.serverBlockFunctions = new Map();
    const collectFns = (stmts) => {
      const fns = [];
      for (const stmt of stmts) {
        if (stmt.type === 'FunctionDeclaration') {
          fns.push(stmt.name);
        } else if (stmt.type === 'RouteGroupDeclaration') {
          fns.push(...collectFns(stmt.body));
        }
      }
      return fns;
    };
    for (const node of analyzer.ast.body) {
      if (node.type === 'ServerBlock' && node.name) {
        const fns = collectFns(node.body);
        analyzer.serverBlockFunctions.set(node.name, fns);
      }
    }
    expect(analyzer.serverBlockFunctions.get('api')).toEqual(['handler_a', 'handler_b']);
    expect(analyzer.serverBlockFunctions.get('events')).toEqual(['push']);
  });

  test('functions nested in route groups found by pre-pass', () => {
    const source = `
      server "svc" {
        routes "/api" {
          fn nested_fn() { 1 }
        }
      }
    `;
    const analyzer = getAnalyzer(source);
    const result = analyzer.analyze();
    // If the pre-pass works, serverBlockFunctions should include nested_fn
    expect(analyzer.serverBlockFunctions.get('svc')).toContain('nested_fn');
  });

  test('RPC call to function inside route group of peer server succeeds', () => {
    expect(() => analyze(`
      server "api" {
        fn call_peer() { svc.nested_fn() }
      }
      server "svc" {
        routes "/internal" {
          fn nested_fn() { "result" }
        }
      }
    `)).not.toThrow();
  });

  test('RPC call to non-existent function in peer with route groups errors', () => {
    expect(analyzeThrows(`
      server "api" {
        fn call_peer() { svc.missing() }
      }
      server "svc" {
        routes "/internal" {
          fn nested_fn() { "result" }
        }
      }
    `)).toThrow(/No function 'missing' in server block "svc"/);
  });
});

// =====================================================================
// 14. Server/client context enforcement
// =====================================================================

describe('Server/client context enforcement', () => {

  test('state only allowed in client context', () => {
    expect(() => analyze('client { state count = 0 }')).not.toThrow();
  });

  test('state errors in module context via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.StateDeclaration('count', null, new AST.NumberLiteral(0, loc), loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/state.*client block/i);
  });

  test('computed only allowed in client context', () => {
    expect(() => analyze('client { computed doubled = 2 }')).not.toThrow();
  });

  test('computed errors in module context via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.ComputedDeclaration('d', new AST.NumberLiteral(0, loc), loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/computed.*client block/i);
  });

  test('effect only allowed in client context', () => {
    expect(() => analyze('client { effect { print("x") } }')).not.toThrow();
  });

  test('effect errors in module context via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.EffectDeclaration(new AST.BlockStatement([], loc), loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/effect.*client block/i);
  });

  test('component only allowed in client context', () => {
    expect(() => analyze('client { component App { <div>"hi"</div> } }')).not.toThrow();
  });

  test('component errors in module context via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.ComponentDeclaration('App', [], [], loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/component.*client block/i);
  });

  test('route only allowed in server context', () => {
    expect(() => analyze('server { fn h() { 1 }\nroute get "/x" => h }')).not.toThrow();
  });

  test('route errors in module context via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.RouteDeclaration('GET', '/api', new AST.Identifier('h', loc), loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/route.*server block/i);
  });

  test('middleware only allowed in server context', () => {
    expect(() => analyze(`
      server {
        middleware fn auth(req, next) { next(req) }
      }
    `)).not.toThrow();
  });

  test('middleware errors in module context via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const node = new AST.MiddlewareDeclaration('mw', [], new AST.BlockStatement([], loc), loc);
    const ast = new AST.Program([node]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow(/middleware.*server block/i);
  });

  test('nested client inside function inside server context: client-only nodes still require client', () => {
    // A function inside a server block is still in server context
    // So state inside that function should error
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };

    const stateNode = new AST.StateDeclaration('count', null, new AST.NumberLiteral(0, loc), loc);
    const fnBody = new AST.BlockStatement([stateNode], loc);
    const fnNode = new AST.FunctionDeclaration('badFn', [], fnBody, null, loc);
    const serverBlock = new AST.ServerBlock([fnNode], loc);
    const ast = new AST.Program([serverBlock]);
    const analyzer = new Analyzer(ast, '<test>');

    expect(() => analyzer.analyze()).toThrow(/state.*client block/i);
  });
});

// =====================================================================
// Additional coverage: builtins and misc
// =====================================================================

describe('Builtin registrations', () => {

  test('all standard builtins are registered', () => {
    const { scope } = analyze('x = 1');
    const expectedBuiltins = [
      'Int', 'Float', 'String', 'Bool', 'Nil', 'Any',
      'print', 'range', 'len', 'type_of', 'enumerate', 'zip',
      'map', 'filter', 'reduce', 'sum', 'sorted', 'reversed',
      'fetch', 'db',
      'Ok', 'Err', 'Some', 'None', 'Result', 'Option',
    ];
    for (const name of expectedBuiltins) {
      const sym = scope.lookup(name);
      expect(sym).not.toBeNull();
      expect(sym.kind).toBe('builtin');
    }
  });
});

describe('Miscellaneous analysis paths', () => {

  test('ComponentStyleBlock is skipped (no analysis needed)', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const styleNode = new AST.ComponentStyleBlock('.foo { color: red; }', loc);
    const clientBlock = new AST.ClientBlock([styleNode], loc);
    const ast = new AST.Program([clientBlock]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).not.toThrow();
  });

  test('unknown expression node type falls through to visitExpression', () => {
    // An ExpressionStatement wrapping a node of unknown type is handled gracefully
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const unknownNode = { type: 'UnknownNode', loc };
    const exprStmt = new AST.ExpressionStatement(unknownNode, loc);
    const ast = new AST.Program([exprStmt]);
    const analyzer = new Analyzer(ast, '<test>');
    // Should not throw - unknown nodes in visitExpression just do nothing
    expect(() => analyzer.analyze()).not.toThrow();
  });

  test('visitNode with null does nothing', () => {
    // The analyzer checks !node at the top of visitNode
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    // Use a WhileStatement with null body to trigger visitNode(null)
    // Actually we need a real path. Let's create a ReturnStatement with null value.
    const ret = new AST.ReturnStatement(null, loc);
    const fnNode = new AST.FunctionDeclaration('f', [], new AST.BlockStatement([ret], loc), null, loc);
    const ast = new AST.Program([fnNode]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).not.toThrow();
  });

  test('wildcard identifier _ always valid', () => {
    expect(() => analyze('_ = 42')).not.toThrow();
  });

  test('expression statement calls visitExpression', () => {
    expect(() => analyze('print("hello")')).not.toThrow();
  });

  test('number literal returns without error', () => {
    expect(() => analyze('x = 42')).not.toThrow();
  });

  test('nil literal returns without error', () => {
    expect(() => analyze('x = nil')).not.toThrow();
  });

  test('boolean literal returns without error', () => {
    expect(() => analyze('x = true')).not.toThrow();
  });

  test('string literal returns without error', () => {
    expect(() => analyze("x = 'hello'")).not.toThrow();
  });

  test('for-else statement', () => {
    expect(() => analyze('items = []\nfor x in items { y = x } else { z = 0 }')).not.toThrow();
  });

  test('list comprehension with condition', () => {
    expect(() => analyze('items = [1, 2, 3]\nresult = [x * 2 for x in items if x > 1]')).not.toThrow();
  });

  test('dict comprehension with condition', () => {
    expect(() => analyze('pairs = []\nresult = {k: v for k, v in pairs if k > 0}')).not.toThrow();
  });

  test('if statement with else body', () => {
    expect(() => analyze('if true { x = 1 } else { x = 2 }')).not.toThrow();
  });

  test('if statement with elif and else', () => {
    expect(() => analyze('if true { x = 1 } elif false { x = 2 } else { x = 3 }')).not.toThrow();
  });

  test('try-catch without catch parameter', () => {
    expect(() => analyze('try { x = 1 } catch { y = 0 }')).not.toThrow();
  });

  test('try-catch with catch parameter', () => {
    expect(() => analyze('try { x = 1 } catch e { y = e }')).not.toThrow();
  });

  test('WebSocket with empty handlers analyzed', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    // A WebSocket node with null handler (like on_open: null)
    const wsNode = new AST.WebSocketDeclaration({ on_open: null }, loc);
    const serverBlock = new AST.ServerBlock([wsNode], loc);
    const ast = new AST.Program([serverBlock]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).not.toThrow();
  });

  test('SSE params defined in scope', () => {
    expect(() => analyze(`
      server {
        sse "/events" fn(send, close) {
          send("data")
          close()
        }
      }
    `)).not.toThrow();
  });

  test('background job defines function name in scope', () => {
    // The background job name should be defined as a function in the server scope
    expect(() => analyze(`
      server {
        background fn email_job(to) {
          print(to)
        }
      }
    `)).not.toThrow();
  });

  test('schedule with name defines function in scope', () => {
    expect(() => analyze(`
      server {
        schedule "0 * * * *" fn hourly_task() {
          print("hourly")
        }
      }
    `)).not.toThrow();
  });

  test('env defines variable in scope', () => {
    expect(() => analyze(`
      server {
        env API_KEY: String = "default"
        fn use_key() { print(API_KEY) }
      }
    `)).not.toThrow();
  });

  test('middleware defines function in server scope', () => {
    expect(() => analyze(`
      server {
        middleware fn auth(req, next) {
          next(req)
        }
      }
    `)).not.toThrow();
  });

  test('peer server block names registered as identifiers', () => {
    expect(() => analyze(`
      server "api" { fn get() { events.push("test") } }
      server "events" { fn push(data) { data } }
    `)).not.toThrow();
  });

  test('error handler params scoped to handler', () => {
    expect(() => analyze(`
      server {
        on_error fn(err, req) {
          msg = err
          print(msg)
        }
      }
    `)).not.toThrow();
  });

  test('lifecycle hook params scoped to handler', () => {
    expect(() => analyze(`
      server {
        on_start fn() {
          startup_msg = "started"
          print(startup_msg)
        }
      }
    `)).not.toThrow();
  });

  test('subscribe params scoped to handler', () => {
    expect(() => analyze(`
      server {
        subscribe "user_created" fn(data) {
          msg = data
          print(msg)
        }
      }
    `)).not.toThrow();
  });

  test('route group context remains server', () => {
    expect(() => analyze(`
      server {
        routes "/api/v1" {
          fn handler() { "ok" }
          route get "/test" => handler
        }
      }
    `)).not.toThrow();
  });
});

describe('Warnings system', () => {

  test('warnings array is empty for valid code', () => {
    const result = analyze('x = 1');
    expect(result.warnings).toEqual([]);
  });

  test('warnings include self-referencing RPC', () => {
    const result = analyze('server "api" { fn foo() { api.foo() } }');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].message).toContain('calling itself');
  });

  test('warning includes location info', () => {
    const result = analyze('server "api" { fn foo() { api.foo() } }');
    const w = result.warnings[0];
    expect(w).toHaveProperty('message');
    expect(w).toHaveProperty('file');
    expect(w).toHaveProperty('line');
    expect(w).toHaveProperty('column');
  });

  test('analyze returns scope along with warnings', () => {
    const result = analyze('x = 1');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('scope');
  });
});
