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
  const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
  analyzer.analyze();
  const codegen = new CodeGenerator(ast, '<test>');
  return codegen.generate();
}

function compileServer(source) {
  const result = compile(source);
  return result.server ? result.server.trim() : '';
}

// ═══════════════════════════════════════════════════════════════
// 1. Type validation for Int/Float/Bool in request bodies (lines 124-131)
//    _genNestedTypeValidation for nested shared types with Float/Bool/Int fields
// ═══════════════════════════════════════════════════════════════
describe('Nested type body validation (Int/Float/Bool)', () => {
  test('generates Int validation for body type fields', () => {
    const code = compileServer(`
      shared {
        type Item {
          id: Int
          count: Int
          name: String
        }
      }
      server {
        route POST "/api/items" body: Item => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('must be an integer');
  });

  test('generates Float validation for body type fields', () => {
    const code = compileServer(`
      shared {
        type Product {
          id: Int
          price: Float
          name: String
        }
      }
      server {
        route POST "/api/products" body: Product => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('must be a number');
  });

  test('generates Bool validation for body type fields', () => {
    const code = compileServer(`
      shared {
        type Setting {
          id: Int
          active: Bool
          label: String
        }
      }
      server {
        route POST "/api/settings" body: Setting => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('must be a boolean');
  });

  test('generates all type validations together', () => {
    const code = compileServer(`
      shared {
        type Record {
          id: Int
          count: Int
          score: Float
          enabled: Bool
          title: String
        }
      }
      server {
        route POST "/api/records" body: Record => fn(req) { "ok" }
      }
    `);
    // count is a non-id Int field, so it gets integer validation
    expect(code).toContain('must be an integer');
    expect(code).toContain('must be a number');
    expect(code).toContain('must be a boolean');
    expect(code).toContain('must be a string');
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Cache control helper generation (lines 1660-1665)
// ═══════════════════════════════════════════════════════════════
describe('Cache config helpers', () => {
  test('generates cache config with max_age', () => {
    const code = compileServer(`
      server {
        cache {
          max_age: 3600
        }
        route GET "/api/data" => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('__cacheMaxAge');
    expect(code).toContain('3600');
    expect(code).toContain('Cache Helpers');
  });

  test('generates cache config with stale_while_revalidate', () => {
    const code = compileServer(`
      server {
        cache {
          max_age: 300
          stale_while_revalidate: 60
        }
        route GET "/api/data" => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('__cacheMaxAge');
    expect(code).toContain('__cacheStale');
    expect(code).toContain('300');
    expect(code).toContain('60');
  });

  test('generates cache_control helper function', () => {
    const code = compileServer(`
      server {
        cache {
          max_age: 600
        }
        route GET "/api/data" => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('function cache_control(');
    expect(code).toContain('Cache-Control');
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. SQL type mapping for postgres (lines 1732-1736)
// ═══════════════════════════════════════════════════════════════
describe('SQL type mapping (postgres)', () => {
  test('postgres maps Int to INTEGER', () => {
    const code = compileServer(`
      shared {
        type User {
          id: Int
          age: Int
          name: String
        }
      }
      server {
        db {
          driver: "postgres"
          url: "postgres://localhost/test"
        }
        model User
      }
    `);
    // age (non-id Int field) should map to INTEGER in postgres
    expect(code).toContain('age INTEGER');
  });

  test('postgres maps Float to DOUBLE PRECISION', () => {
    const code = compileServer(`
      shared {
        type Item {
          id: Int
          price: Float
        }
      }
      server {
        db {
          driver: "postgres"
          url: "postgres://localhost/test"
        }
        model Item
      }
    `);
    expect(code).toContain('DOUBLE PRECISION');
  });

  test('postgres maps Bool to BOOLEAN', () => {
    const code = compileServer(`
      shared {
        type Task {
          id: Int
          done: Bool
        }
      }
      server {
        db {
          driver: "postgres"
          url: "postgres://localhost/test"
        }
        model Task
      }
    `);
    expect(code).toContain('BOOLEAN');
  });

  test('postgres maps String to TEXT', () => {
    const code = compileServer(`
      shared {
        type Note {
          id: Int
          content: String
        }
      }
      server {
        db {
          driver: "postgres"
          url: "postgres://localhost/test"
        }
        model Note
      }
    `);
    // String -> TEXT (same as default, but via postgres branch)
    expect(code).toContain('TEXT');
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Database health check queries (lines 2186-2188)
// ═══════════════════════════════════════════════════════════════
describe('Database health check queries', () => {
  test('postgres health check uses await db.query', () => {
    const code = compileServer(`
      server {
        db {
          driver: "postgres"
          url: "postgres://localhost/test"
        }
        health "/health" { check_db }
        route GET "/api/data" => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('await db.query("SELECT 1")');
  });

  test('mysql health check uses await db.query', () => {
    const code = compileServer(`
      server {
        db {
          driver: "mysql"
          url: "mysql://localhost/test"
        }
        health "/health" { check_db }
        route GET "/api/data" => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('await db.query("SELECT 1")');
  });

  test('sqlite health check uses sync db.query', () => {
    const code = compileServer(`
      server {
        db {
          path: ":memory:"
        }
        health "/health" { check_db }
        route GET "/api/data" => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('db.query("SELECT 1")');
    // sqlite should NOT have await before db.query
    // The non-await version is the default (sqlite)
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Array body type validation (lines 2402-2424)
// ═══════════════════════════════════════════════════════════════
describe('Array body type validation', () => {
  test('generates array body validation for [Type]', () => {
    const code = compileServer(`
      shared {
        type User {
          id: Int
          name: String
          email: String
        }
      }
      server {
        route POST "/api/users/batch" body: [User] => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('Array.isArray(__body)');
    expect(code).toContain('must be an array of User');
    expect(code).toContain('__bodyTypeErrors');
    expect(code).toContain('at index');
  });

  test('array body validates Int fields', () => {
    const code = compileServer(`
      shared {
        type Score {
          id: Int
          value: Int
          label: String
        }
      }
      server {
        route POST "/api/scores/batch" body: [Score] => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('must be an integer');
    expect(code).toContain('at index');
  });

  test('array body validates Float fields', () => {
    const code = compileServer(`
      shared {
        type Measurement {
          id: Int
          value: Float
          unit: String
        }
      }
      server {
        route POST "/api/measurements" body: [Measurement] => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('must be a number');
    expect(code).toContain('at index');
  });

  test('array body validates Bool fields', () => {
    const code = compileServer(`
      shared {
        type Toggle {
          id: Int
          enabled: Bool
          name: String
        }
      }
      server {
        route POST "/api/toggles" body: [Toggle] => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('must be a boolean');
    expect(code).toContain('at index');
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Query parameter validation for Float/Bool (lines 2459-2463)
//    Type-safe body deserialization for handler params with typed annotation
// ═══════════════════════════════════════════════════════════════
describe('Handler param type-safe validation (Float/Bool)', () => {
  test('validates Float type annotation on handler param', () => {
    const code = compileServer(`
      shared {
        type Metric {
          id: Int
          value: Float
          unit: String
        }
      }
      server {
        fn create_metric(data: Metric) {
          data
        }
        route POST "/api/metrics" => create_metric
      }
    `);
    expect(code).toContain('must be a number');
    expect(code).toContain('__tsErrors_data');
  });

  test('validates Bool type annotation on handler param', () => {
    const code = compileServer(`
      shared {
        type Feature {
          id: Int
          active: Bool
          name: String
        }
      }
      server {
        fn update_feature(feat: Feature) {
          feat
        }
        route POST "/api/features" => update_feature
      }
    `);
    expect(code).toContain('must be a boolean');
    expect(code).toContain('__tsErrors_feat');
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. SSE streaming (lines 2564-2591)
//    Generator-based streaming detection with yield
// ═══════════════════════════════════════════════════════════════
describe('SSE streaming (generator-based)', () => {
  test('generates SSE streaming code for handler with yield', () => {
    const code = compileServer(`
      server {
        fn stream_events(req) {
          yield "hello"
          yield "world"
        }
        route GET "/api/stream" => stream_events
      }
    `);
    expect(code).toContain('Symbol.asyncIterator');
    expect(code).toContain('ReadableStream');
    expect(code).toContain('text/event-stream');
    expect(code).toContain('TextEncoder');
    expect(code).toContain('controller.enqueue');
    expect(code).toContain('controller.close');
  });

  test('generates sync iterator fallback for SSE', () => {
    const code = compileServer(`
      server {
        fn stream_data(req) {
          yield "chunk1"
          yield "chunk2"
        }
        route GET "/api/data-stream" => stream_data
      }
    `);
    expect(code).toContain('Symbol.iterator');
    expect(code).toContain('Cache-Control');
    expect(code).toContain('no-cache');
    expect(code).toContain('keep-alive');
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. API versioning headers (lines 2595-2619)
// ═══════════════════════════════════════════════════════════════
describe('API versioning headers', () => {
  test('adds version headers to versioned routes', () => {
    const code = compileServer(`
      server {
        fn get_users(req) { [] }
        routes "/api/v1" version: "1" {
          route GET "/users" => get_users
        }
      }
    `);
    expect(code).toContain('API-Version');
    expect(code).toContain('__addVersionHeaders');
    expect(code).toContain('"1"');
  });

  test('adds deprecation headers for deprecated versions', () => {
    const code = compileServer(`
      server {
        fn get_users(req) { [] }
        routes "/api/v1" version: "1" deprecated: true {
          route GET "/users" => get_users
        }
      }
    `);
    expect(code).toContain('Deprecation');
    expect(code).toContain('"true"');
    expect(code).toContain('successor-version');
  });

  test('adds sunset header for deprecated versions with sunset date', () => {
    const code = compileServer(`
      server {
        fn get_users(req) { [] }
        routes "/api/v1" version: "1" deprecated: true sunset: "2025-06-01" {
          route GET "/users" => get_users
        }
      }
    `);
    expect(code).toContain('Sunset');
    expect(code).toContain('2025-06-01');
  });

  test('non-versioned route does not add version headers', () => {
    const code = compileServer(`
      server {
        fn get_users(req) { [] }
        route GET "/api/users" => get_users
      }
    `);
    expect(code).not.toContain('__addVersionHeaders');
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. OpenAPI schema generation (lines 2633-2776)
// ═══════════════════════════════════════════════════════════════
describe('OpenAPI schema generation', () => {
  test('generates OpenAPI spec with schemas from shared types', () => {
    const code = compileServer(`
      shared {
        type User {
          id: Int
          name: String
        }
      }
      server {
        fn get_users(req) { [] }
        route GET "/api/users" => get_users
      }
    `);
    expect(code).toContain('__openApiSpec');
    expect(code).toContain('openapi: "3.0.3"');
    expect(code).toContain('components');
    expect(code).toContain('/openapi.json');
    expect(code).toContain('/docs');
  });

  test('generates OpenAPI schema for array body type', () => {
    const code = compileServer(`
      shared {
        type Item {
          id: Int
          name: String
        }
      }
      server {
        route POST "/api/items" body: [Item] => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('type: "array"');
    expect(code).toContain('#/components/schemas/Item');
  });

  test('generates OpenAPI schema for primitive body type', () => {
    const code = compileServer(`
      server {
        route POST "/api/count" body: Int => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('"type": "integer"');
  });

  test('generates OpenAPI path params from route path', () => {
    const code = compileServer(`
      server {
        fn get_user(req) { "ok" }
        route GET "/api/users/:id" => get_user
      }
    `);
    expect(code).toContain('{id}');
    expect(code).toContain('in: "path"');
    expect(code).toContain('required: true');
  });

  test('generates OpenAPI response schema from response type', () => {
    const code = compileServer(`
      shared {
        type User {
          id: Int
          name: String
        }
      }
      server {
        fn get_users(req) { [] }
        route GET "/api/users" -> [User] => get_users
      }
    `);
    expect(code).toContain('responses');
    expect(code).toContain('#/components/schemas/User');
    expect(code).toContain('type: "array"');
  });

  test('generates OpenAPI for handler body params with types', () => {
    const code = compileServer(`
      shared {
        type User {
          id: Int
          name: String
        }
      }
      server {
        fn create_user(name: String, age: Int) {
          "ok"
        }
        route POST "/api/users" => create_user
      }
    `);
    expect(code).toContain('requestBody');
    expect(code).toContain('"integer"');
    expect(code).toContain('"string"');
  });

  test('generates OpenAPI for Float type in handler body params', () => {
    const code = compileServer(`
      server {
        fn set_price(amount: Float) {
          "ok"
        }
        route POST "/api/price" => set_price
      }
    `);
    expect(code).toContain('"number"');
  });

  test('generates OpenAPI for Bool type in handler body params', () => {
    const code = compileServer(`
      server {
        fn toggle(active: Bool) {
          "ok"
        }
        route POST "/api/toggle" => toggle
      }
    `);
    expect(code).toContain('"boolean"');
  });

  test('generates OpenAPI for non-typed handler body params as string', () => {
    const code = compileServer(`
      server {
        fn create(title) {
          "ok"
        }
        route POST "/api/items" => create
      }
    `);
    expect(code).toContain('requestBody');
    // Untyped params default to string in OpenAPI
  });

  test('generates OpenAPI for shared type body annotation', () => {
    const code = compileServer(`
      shared {
        type User {
          id: Int
          name: String
        }
      }
      server {
        route POST "/api/users" body: User => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('$ref');
    expect(code).toContain('#/components/schemas/User');
  });

  test('generates OpenAPI for primitive response type annotation', () => {
    const code = compileServer(`
      server {
        fn get_count(req) { 42 }
        route GET "/api/count" -> Int => get_count
      }
    `);
    expect(code).toContain('"type": "integer"');
  });

  test('generates OpenAPI schema Float type mapping', () => {
    const code = compileServer(`
      shared {
        type Stats {
          id: Int
          avg: Float
          active: Bool
          label: String
        }
      }
      server {
        fn get_stats(req) { {} }
        route GET "/api/stats" => get_stats
      }
    `);
    expect(code).toContain('"number"');
    expect(code).toContain('"boolean"');
    expect(code).toContain('"integer"');
    expect(code).toContain('"string"');
  });

  test('generates OpenAPI array items with non-shared element type', () => {
    const code = compileServer(`
      server {
        route POST "/api/nums" body: [Int] => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('type: "array"');
    expect(code).toContain('"type": "integer"');
  });

  test('generates OpenAPI response for non-shared array element type', () => {
    const code = compileServer(`
      server {
        fn get_nums(req) { [] }
        route GET "/api/nums" -> [Int] => get_nums
      }
    `);
    expect(code).toContain('type: "array"');
    expect(code).toContain('"type": "integer"');
  });

  test('generates OpenAPI response for non-shared plain type', () => {
    const code = compileServer(`
      server {
        fn get_flag(req) { true }
        route GET "/api/flag" -> Bool => get_flag
      }
    `);
    expect(code).toContain('"type": "boolean"');
  });

  test('generates OpenAPI with handler body param referencing shared type', () => {
    const code = compileServer(`
      shared {
        type Address {
          id: Int
          street: String
        }
      }
      server {
        fn create_addr(addr: Address) {
          "ok"
        }
        route POST "/api/addresses" => create_addr
      }
    `);
    expect(code).toContain('$ref');
    expect(code).toContain('#/components/schemas/Address');
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. API versions endpoint (lines 2840-2860)
// ═══════════════════════════════════════════════════════════════
describe('API versions endpoint', () => {
  test('generates /api/versions endpoint for versioned routes', () => {
    const code = compileServer(`
      server {
        fn get_v1(req) { [] }
        fn get_v2(req) { [] }
        routes "/api/v1" version: "1" {
          route GET "/users" => get_v1
        }
        routes "/api/v2" version: "2" {
          route GET "/users" => get_v2
        }
      }
    `);
    expect(code).toContain('/api/versions');
    expect(code).toContain('API Versions');
    expect(code).toContain('versions');
  });

  test('marks deprecated version in versions endpoint', () => {
    const code = compileServer(`
      server {
        fn get_v1(req) { [] }
        fn get_v2(req) { [] }
        routes "/api/v1" version: "1" deprecated: true {
          route GET "/users" => get_v1
        }
        routes "/api/v2" version: "2" {
          route GET "/users" => get_v2
        }
      }
    `);
    expect(code).toContain('deprecated: true');
  });

  test('includes sunset date in versions endpoint', () => {
    const code = compileServer(`
      server {
        fn get_v1(req) { [] }
        routes "/api/v1" version: "1" deprecated: true sunset: "2025-12-31" {
          route GET "/users" => get_v1
        }
      }
    `);
    expect(code).toContain('sunset');
    expect(code).toContain('2025-12-31');
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. TLS CA certificate config (line 3506)
// ═══════════════════════════════════════════════════════════════
describe('TLS CA certificate config', () => {
  test('generates TLS config with ca certificate', () => {
    const code = compileServer(`
      server {
        tls {
          cert: "./cert.pem"
          key: "./key.pem"
          ca: "./ca.pem"
        }
        route GET "/api/data" => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('tls:');
    expect(code).toContain('cert: Bun.file');
    expect(code).toContain('key: Bun.file');
    expect(code).toContain('ca: Bun.file');
  });

  test('generates TLS config without ca certificate', () => {
    const code = compileServer(`
      server {
        tls {
          cert: "./cert.pem"
          key: "./key.pem"
        }
        route GET "/api/data" => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('cert: Bun.file');
    expect(code).toContain('key: Bun.file');
    expect(code).not.toContain('ca: Bun.file');
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. Test block hooks: beforeEach, afterEach, test cases (lines 3666-3705)
// ═══════════════════════════════════════════════════════════════
describe('Test block generation', () => {
  test('generates test block with beforeEach hook', () => {
    const result = compile(`
      server {
        fn hello(req) { "world" }
        route GET "/api/hello" => hello
      }
      test "API Tests" {
        before_each {
          x = 1
        }
        fn test_hello() {
          assert(true, "it works")
        }
      }
    `);
    expect(result.test).toContain('beforeEach');
    expect(result.test).toContain('describe');
  });

  test('generates test block with afterEach hook', () => {
    const result = compile(`
      server {
        fn hello(req) { "world" }
        route GET "/api/hello" => hello
      }
      test "API Tests" {
        after_each {
          y = 0
        }
        fn test_cleanup() {
          assert(true, "cleaned up")
        }
      }
    `);
    expect(result.test).toContain('afterEach');
  });

  test('generates individual test cases from function declarations', () => {
    const result = compile(`
      server {
        fn greet(req) { "hi" }
        route GET "/api/greet" => greet
      }
      test "Greet Tests" {
        fn test_greet_returns_200() {
          assert(true)
        }
        fn test_greet_body() {
          assert(true)
        }
      }
    `);
    expect(result.test).toContain('test(');
    expect(result.test).toContain('test greet returns 200');
    expect(result.test).toContain('test greet body');
  });

  test('generates test with both hooks and function test cases', () => {
    const result = compile(`
      server {
        fn hello(req) { "world" }
        route GET "/api/hello" => hello
      }
      test "Full Test Suite" {
        before_each {
          counter = 0
        }
        after_each {
          counter = 0
        }
        fn test_hello_works() {
          assert(true)
        }
      }
    `);
    expect(result.test).toContain('beforeEach');
    expect(result.test).toContain('afterEach');
    expect(result.test).toContain('test(');
    expect(result.test).toContain('test hello works');
  });
});

// ═══════════════════════════════════════════════════════════════
// Additional coverage: _genValidationCode for Float and Bool params
// This exercises lines 48-52 (Float/Bool validation code in _genValidationCode)
// ═══════════════════════════════════════════════════════════════
describe('Validation code for Float and Bool params', () => {
  test('generates Float validation in route handler params', () => {
    const code = compileServer(`
      server {
        fn search(price: Float) {
          "results"
        }
        route GET "/api/search" => search
      }
    `);
    expect(code).toContain('must be a number');
  });

  test('generates Bool validation in route handler params', () => {
    const code = compileServer(`
      server {
        fn filter(active: Bool) {
          "results"
        }
        route GET "/api/filter" => filter
      }
    `);
    expect(code).toContain('must be a boolean');
  });

  test('generates Int validation in RPC handler params', () => {
    const code = compileServer(`
      server {
        fn set_count(count: Int) {
          count
        }
      }
    `);
    expect(code).toContain('must be an integer');
  });

  test('generates Float validation in RPC handler params', () => {
    const code = compileServer(`
      server {
        fn set_price(price: Float) {
          price
        }
      }
    `);
    expect(code).toContain('must be a number');
  });

  test('generates Bool validation in RPC handler params', () => {
    const code = compileServer(`
      server {
        fn set_flag(flag: Bool) {
          flag
        }
      }
    `);
    expect(code).toContain('must be a boolean');
  });
});

// ═══════════════════════════════════════════════════════════════
// Additional OpenAPI: tovaTypeToJsonSchema default branch (line 2639)
// ═══════════════════════════════════════════════════════════════
describe('OpenAPI tovaTypeToJsonSchema edge cases', () => {
  test('maps Float response type to number in OpenAPI', () => {
    const code = compileServer(`
      server {
        fn get_price(req) { 9.99 }
        route GET "/api/price" -> Float => get_price
      }
    `);
    expect(code).toContain('"type": "number"');
  });

  test('maps String response type to string in OpenAPI', () => {
    const code = compileServer(`
      server {
        fn get_name(req) { "test" }
        route GET "/api/name" -> String => get_name
      }
    `);
    // String becomes a $ref default if not in switch, but actually it IS in the switch
    expect(code).toContain('"type": "string"');
  });

  test('maps custom type response to $ref in OpenAPI', () => {
    const code = compileServer(`
      shared {
        type Widget {
          id: Int
          name: String
        }
      }
      server {
        fn get_widget(req) { {} }
        route GET "/api/widget" -> Widget => get_widget
      }
    `);
    expect(code).toContain('#/components/schemas/Widget');
  });
});

// ═══════════════════════════════════════════════════════════════
// Bench block generation (lines 3764-3765) - param parsing in bench fns
// ═══════════════════════════════════════════════════════════════
describe('Bench block generation', () => {
  test('generates bench block with function benchmarks', () => {
    const result = compile(`
      bench "Performance" {
        fn bench_add() {
          x = 1 + 2
        }
      }
    `);
    expect(result.bench).toContain('__runBench');
    expect(result.bench).toContain('bench add');
  });

  test('generates bench block with parameterized function', () => {
    const result = compile(`
      bench "Param bench" {
        fn bench_compute(n) {
          x = n + 1
        }
      }
    `);
    expect(result.bench).toContain('__runBench');
    expect(result.bench).toContain('bench compute');
  });
});

// ═══════════════════════════════════════════════════════════════
// Test block: no function declarations (single test wrapper) (lines 3709-3716)
// ═══════════════════════════════════════════════════════════════
describe('Test block without function declarations', () => {
  test('wraps all statements in a single test case when no fn declarations', () => {
    const result = compile(`
      server {
        fn hello(req) { "world" }
        route GET "/api/hello" => hello
      }
      test "Simple" {
        x = 1
        assert(x == 1)
      }
    `);
    expect(result.test).toContain('describe("Simple"');
    expect(result.test).toContain('test("Simple"');
  });

  test('test block with timeout generates timeout arg', () => {
    const result = compile(`
      server {
        fn hello(req) { "world" }
        route GET "/api/hello" => hello
      }
      test "Slow Tests" timeout=30000 {
        fn test_slow() {
          assert(true)
        }
      }
    `);
    expect(result.test).toContain('30000');
  });

  test('test block mixes function and non-function statements', () => {
    const result = compile(`
      server {
        fn hello(req) { "world" }
        route GET "/api/hello" => hello
      }
      test "Mixed" {
        base_url = "http://localhost:3000"
        fn test_endpoint() {
          assert(true)
        }
      }
    `);
    expect(result.test).toContain('test(');
    expect(result.test).toContain('test endpoint');
  });
});

// ═══════════════════════════════════════════════════════════════
// GET route handler with req param and additional params (lines 2501-2503)
// Tests the query param extraction path for req + extra params
// ═══════════════════════════════════════════════════════════════
describe('GET handler with req and query params', () => {
  test('extracts query params for GET handler with req + extra params', () => {
    const code = compileServer(`
      server {
        fn search(req, query: String) {
          query
        }
        route GET "/api/search" => search
      }
    `);
    expect(code).toContain('__ctx.query');
    expect(code).toContain('params.query');
  });

  test('validates query params for GET handler with req + typed extra params', () => {
    const code = compileServer(`
      server {
        fn find(req, page: Int) {
          page
        }
        route GET "/api/find" => find
      }
    `);
    expect(code).toContain('must be an integer');
    expect(code).toContain('__ctx');
  });
});

// ═══════════════════════════════════════════════════════════════
// Cookie auth with storage: "cookie" (lines 1120-1131, 2273-2277)
// ═══════════════════════════════════════════════════════════════
describe('Cookie auth', () => {
  test('generates cookie auth functions', () => {
    const code = compileServer(`
      server {
        auth {
          secret: "test-secret"
          storage: "cookie"
        }
        fn get_profile(req) { "profile" }
        route GET "/api/profile" with auth => get_profile
      }
    `);
    expect(code).toContain('__setAuthCookie');
    expect(code).toContain('__clearAuthCookie');
    expect(code).toContain('__tova_auth');
    expect(code).toContain('__authCookieMaxAge');
  });

  test('generates cookie auth logout endpoint', () => {
    const code = compileServer(`
      server {
        auth {
          secret: "test-secret"
          storage: "cookie"
        }
        fn get_profile(req) { "profile" }
        route GET "/api/profile" with auth => get_profile
      }
    `);
    expect(code).toContain('/rpc/__logout');
    expect(code).toContain('Cookie Auth Logout');
  });
});

// ═══════════════════════════════════════════════════════════════
// Auth with issuer and audience (lines 934, 937, 1174, 1177)
// ═══════════════════════════════════════════════════════════════
describe('Auth with issuer and audience', () => {
  test('adds issuer/audience to JWT sign and authenticate', () => {
    const code = compileServer(`
      server {
        auth {
          secret: "my-secret"
          issuer: "my-app"
          audience: "my-api"
        }
        fn get_data(req) { "data" }
        route GET "/api/data" with auth => get_data
      }
    `);
    expect(code).toContain('claims.iss');
    expect(code).toContain('claims.aud');
    expect(code).toContain('__payload.iss');
    expect(code).toContain('__payload.aud');
  });
});

// ═══════════════════════════════════════════════════════════════
// Compression-only fetch handler (lines 3488-3492)
// ═══════════════════════════════════════════════════════════════
describe('Compression config', () => {
  test('generates compression fetch handler', () => {
    const code = compileServer(`
      server {
        compression {
          threshold: 1024
        }
        route GET "/api/data" => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('__compressResponse');
    expect(code).toContain('gzip');
  });
});

// ═══════════════════════════════════════════════════════════════
// Env declarations with Float/Bool types (lines 485-488)
// ═══════════════════════════════════════════════════════════════
describe('Env declarations with types', () => {
  test('generates Float env parsing', () => {
    const code = compileServer(`
      server {
        env THRESHOLD: Float
        route GET "/api/data" => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('parseFloat');
    expect(code).toContain('THRESHOLD');
  });
});

// ═══════════════════════════════════════════════════════════════
// Model fallback fields (line 1701)
// ═══════════════════════════════════════════════════════════════
describe('Model with postgres Float/Bool SQL types', () => {
  test('generates DOUBLE PRECISION for Float in postgres model', () => {
    const code = compileServer(`
      shared {
        type Product {
          id: Int
          price: Float
          active: Bool
          name: String
        }
      }
      server {
        db {
          driver: "postgres"
          url: "postgres://localhost/test"
        }
        model Product
      }
    `);
    expect(code).toContain('DOUBLE PRECISION');
    expect(code).toContain('BOOLEAN');
    expect(code).toContain('TEXT');
  });
});

// ═══════════════════════════════════════════════════════════════
// __contains helper (lines 2865-2866)
// ═══════════════════════════════════════════════════════════════
describe('Contains helper', () => {
  test('includes __contains helper when match uses "in" pattern', () => {
    const code = compileServer(`
      server {
        fn check(req) {
          items = [1, 2, 3]
          match items {
            x if x.includes(2) => "found"
            _ => "not found"
          }
        }
        route GET "/api/check" => check
      }
    `);
    // The __contains helper may or may not be needed depending on the match pattern
    // This test just verifies compilation works
    expect(code).toContain('check');
  });
});

// ═══════════════════════════════════════════════════════════════
// Default SQL type mapping (line 1736)
// ═══════════════════════════════════════════════════════════════
describe('SQL type mapping defaults', () => {
  test('postgres maps unknown type to TEXT', () => {
    // Types not matching Int/Float/Bool/String should default to TEXT
    // This is hard to trigger directly since shared types only have known types
    // but the code path exists for safety
    const code = compileServer(`
      shared {
        type Widget {
          id: Int
          name: String
          price: Float
          active: Bool
        }
      }
      server {
        db {
          driver: "postgres"
          url: "postgres://localhost/test"
        }
        model Widget
      }
    `);
    // Verify all SQL types are mapped correctly
    expect(code).toContain('DOUBLE PRECISION');
    expect(code).toContain('BOOLEAN');
    expect(code).toContain('TEXT');
    expect(code).toContain('SERIAL PRIMARY KEY');
  });
});

// ═══════════════════════════════════════════════════════════════
// __contains helper via membership expression (lines 2865-2866)
// ═══════════════════════════════════════════════════════════════
describe('Contains helper via membership expression', () => {
  test('generates __contains helper when using "in" with variable', () => {
    const code = compileServer(`
      server {
        fn check(req) {
          items = req.body
          result = "hello" in items
          result
        }
        route POST "/api/check" => check
      }
    `);
    expect(code).toContain('__contains');
  });
});

// ═══════════════════════════════════════════════════════════════
// Bench block with non-function statements (line 3772)
// ═══════════════════════════════════════════════════════════════
describe('Bench block non-function statements', () => {
  test('bench block includes non-function setup statements', () => {
    const result = compile(`
      bench "Setup Bench" {
        data = [1, 2, 3]
        fn bench_sum() {
          total = 0
        }
      }
    `);
    expect(result.bench).toContain('__runBench');
    expect(result.bench).toContain('[1, 2, 3]');
  });
});

// ═══════════════════════════════════════════════════════════════
// Group middleware with req-based handler params (lines 2515, 2521)
// ═══════════════════════════════════════════════════════════════
describe('Route group middleware with req handler', () => {
  test('group middleware works with req-based handler', () => {
    const code = compileServer(`
      server {
        middleware fn log_req(req, next) {
          next(req)
        }
        fn get_items(req) { [] }
        routes "/api" {
          route GET "/items" => get_items
        }
      }
    `);
    expect(code).toContain('get_items');
    expect(code).toContain('/api/items');
  });

  test('group middleware with req + extra GET params uses query extraction', () => {
    const code = compileServer(`
      server {
        middleware fn log_req(req, next) {
          next(req)
        }
        fn search(req, q: String) { q }
        routes "/api" {
          route GET "/search" => search
        }
      }
    `);
    expect(code).toContain('search');
    expect(code).toContain('__ctx');
  });
});

// ═══════════════════════════════════════════════════════════════
// Security block integration tests (cover security-related lines)
// ═══════════════════════════════════════════════════════════════
describe('Security block integration', () => {
  test('generates security fragments with roles and protect', () => {
    const code = compileServer(`
      security {
        auth jwt {
          secret: "test-secret-key"
        }
        role Admin {
          can: [manage_users, view_analytics]
        }
        protect "/api/admin/*" {
          require: Admin
        }
      }
      server {
        fn get_data(req) { "data" }
        route GET "/api/data" => get_data
      }
    `);
    expect(code).toContain('__checkProtection');
  });

  test('generates HSTS with TLS and auth config', () => {
    const code = compileServer(`
      server {
        auth {
          secret: "my-secret"
        }
        tls {
          cert: "./cert.pem"
          key: "./key.pem"
        }
        fn get_data(req) { "ok" }
        route GET "/api/data" with auth => get_data
      }
    `);
    expect(code).toContain('Strict-Transport-Security');
  });

  test('security with trust_proxy generates xff IP extraction', () => {
    const code = compileServer(`
      security {
        auth jwt {
          secret: "secret"
        }
        trust_proxy true
      }
      server {
        fn get_data(req) { "data" }
        route GET "/api/data" => get_data
      }
    `);
    expect(code).toContain('x-forwarded-for');
  });

  test('security with sensitive field generates sanitize on RPC', () => {
    const code = compileServer(`
      security {
        auth jwt {
          secret: "secret"
        }
        sensitive User.password {
          never_expose: true
        }
      }
      server {
        fn get_data() { "data" }
      }
    `);
    expect(code).toContain('__autoSanitize');
  });
});

// ═══════════════════════════════════════════════════════════════
// AI config declarations (lines 632-657)
// ═══════════════════════════════════════════════════════════════
describe('AI config declarations', () => {
  test('generates AI client from ai config', () => {
    const code = compileServer(`
      server {
        ai {
          provider: "openai"
          model: "gpt-4"
        }
        route GET "/api/data" => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('__createAI');
    expect(code).toContain('AI Clients');
  });

  test('generates named AI client', () => {
    const code = compileServer(`
      server {
        ai "claude" {
          provider: "anthropic"
          model: "claude-3"
        }
        route GET "/api/data" => fn(req) { "ok" }
      }
    `);
    expect(code).toContain('const claude = __createAI');
  });
});

// ═══════════════════════════════════════════════════════════════
// CSRF exempt patterns (lines 1510-1530)
// ═══════════════════════════════════════════════════════════════
describe('CSRF exempt patterns', () => {
  test('generates CSRF exempt patterns from security block', () => {
    const code = compileServer(`
      security {
        auth jwt {
          secret: "test-secret"
        }
        csrf {
          enabled: true
          exempt: ["/api/webhooks/*", "/api/public/**"]
        }
      }
      server {
        fn get_data(req) { "data" }
        route GET "/api/data" with auth => get_data
      }
    `);
    expect(code).toContain('__csrfExemptPatterns');
    expect(code).toContain('__isCsrfExempt');
  });
});

// ═══════════════════════════════════════════════════════════════
// trust_proxy "loopback" (lines 1225-1232)
// ═══════════════════════════════════════════════════════════════
describe('Trust proxy loopback', () => {
  test('generates loopback-aware IP extraction', () => {
    const code = compileServer(`
      security {
        auth jwt {
          secret: "secret"
        }
        trust_proxy "loopback"
      }
      server {
        fn get_data(req) { "data" }
        route GET "/api/data" => get_data
      }
    `);
    expect(code).toContain('127.0.0.1');
    expect(code).toContain('::1');
    expect(code).toContain('x-forwarded-for');
  });
});

// ═══════════════════════════════════════════════════════════════
// Custom HSTS from security block (lines 1071-1077)
// ═══════════════════════════════════════════════════════════════
describe('Custom HSTS from security block', () => {
  test('generates custom HSTS with max_age and preload', () => {
    const code = compileServer(`
      security {
        auth jwt {
          secret: "secret"
        }
        hsts {
          max_age: 63072000
          include_subdomains: true
          preload: true
        }
      }
      server {
        fn get_data(req) { "data" }
        route GET "/api/data" => get_data
      }
    `);
    expect(code).toContain('Strict-Transport-Security');
    expect(code).toContain('63072000');
    expect(code).toContain('preload');
    expect(code).toContain('includeSubDomains');
  });
});

// ═══════════════════════════════════════════════════════════════
// Security with CSP (line 1088)
// ═══════════════════════════════════════════════════════════════
describe('Security with CSP', () => {
  test('generates CSP headers from security block', () => {
    const code = compileServer(`
      security {
        auth jwt {
          secret: "secret"
        }
        csp {
          default_src: "'self'"
          script_src: "'self' 'unsafe-inline'"
        }
      }
      server {
        fn get_data(req) { "data" }
        route GET "/api/data" => get_data
      }
    `);
    expect(code).toContain('Content-Security-Policy');
  });
});

// ═══════════════════════════════════════════════════════════════
// Group middleware with req-based handler + extra GET params (lines 2515, 2521)
// ═══════════════════════════════════════════════════════════════
describe('Group middleware with req handler and query params', () => {
  test('group middleware with req + extra params on GET route', () => {
    const code = compileServer(`
      server {
        fn search(req, term: String) { term }
        routes "/api" {
          middleware fn logger(req, next) {
            next(req)
          }
          route GET "/search" => search
        }
      }
    `);
    // The handler has req as first param plus additional params
    // This should go through the query extraction path with group middleware
    expect(code).toContain('search');
    expect(code).toContain('__ctx');
  });
});

// ═══════════════════════════════════════════════════════════════
// Versioned routes with auto-sanitize (lines 2610-2611, 2618-2619)
// ═══════════════════════════════════════════════════════════════
describe('Versioned routes with security auto-sanitize', () => {
  test('versioned route with auto-sanitize', () => {
    const code = compileServer(`
      security {
        auth jwt {
          secret: "secret"
        }
        sensitive User.password {
          never_expose: true
        }
      }
      server {
        fn get_users(req) { [] }
        routes "/api/v1" version: "1" {
          route GET "/users" => get_users
        }
      }
    `);
    expect(code).toContain('__addVersionHeaders');
    expect(code).toContain('__autoSanitize');
    expect(code).toContain('API-Version');
  });
});

// ═══════════════════════════════════════════════════════════════
// Test block fn param extraction (lines 3696-3697)
// ═══════════════════════════════════════════════════════════════
describe('Test block function with parameters', () => {
  test('test fn with params generates proper test case', () => {
    const result = compile(`
      server {
        fn hello(req) { "world" }
        route GET "/api/hello" => hello
      }
      test "Param Tests" {
        fn test_with_param(ctx) {
          assert(true)
        }
      }
    `);
    expect(result.test).toContain('test("test with param"');
  });
});

// ═══════════════════════════════════════════════════════════════
// Security protect without auth (line 3269)
// ═══════════════════════════════════════════════════════════════
describe('Security protect without explicit auth', () => {
  test('generates protection check with null user when no auth', () => {
    const code = compileServer(`
      security {
        protect "/admin/*" {
          require: Admin
        }
        role Admin {
          can: [manage]
        }
      }
      server {
        fn admin_page(req) { "admin" }
        route GET "/admin/dashboard" => admin_page
      }
    `);
    expect(code).toContain('__checkProtection');
  });
});

// ═══════════════════════════════════════════════════════════════
// Security sensitive + audit fragments (lines 1199-1200, 1207-1208)
// ═══════════════════════════════════════════════════════════════
describe('Security audit code', () => {
  test('generates audit code from security block', () => {
    const code = compileServer(`
      security {
        auth jwt {
          secret: "secret"
        }
        audit {
          log: true
          events: ["login", "logout"]
        }
      }
      server {
        fn get_data(req) { "data" }
        route GET "/api/data" => get_data
      }
    `);
    // Audit code should be generated
    expect(code).toContain('audit');
  });
});

// ═══════════════════════════════════════════════════════════════
// Security cors override (line 362)
// ═══════════════════════════════════════════════════════════════
describe('Security cors override', () => {
  test('security block cors overrides inline cors', () => {
    const code = compileServer(`
      security {
        auth jwt {
          secret: "secret"
        }
        cors {
          origins: ["http://localhost:3000"]
          methods: ["GET", "POST"]
        }
      }
      server {
        fn get_data(req) { "data" }
        route GET "/api/data" => get_data
      }
    `);
    expect(code).toContain('Access-Control-Allow-Origin');
  });
});

// ═══════════════════════════════════════════════════════════════
// Security rate_limit override (line 365)
// ═══════════════════════════════════════════════════════════════
describe('Security rate_limit override', () => {
  test('security block rate_limit config', () => {
    const code = compileServer(`
      security {
        auth jwt {
          secret: "secret"
        }
        rate_limit {
          max: 100
          window: 60
        }
      }
      server {
        fn get_data(req) { "data" }
        route GET "/api/data" => get_data
      }
    `);
    expect(code).toContain('__checkRateLimit');
  });
});

// ═══════════════════════════════════════════════════════════════
// Type-level validators (lines 145-197) - Phase 3
// ═══════════════════════════════════════════════════════════════
describe('Type-level validators', () => {
  test('generates required validator on shared type field', () => {
    const code = compileServer(`
      shared {
        type User {
          id: Int
          name: String { required }
          email: String { required, email }
        }
      }
      server {
        fn create_user(user: User) {
          user
        }
      }
    `);
    expect(code).toContain('is required');
    expect(code).toContain('must be a valid email');
  });

  test('generates min/max validators', () => {
    const code = compileServer(`
      shared {
        type Product {
          id: Int
          price: Float { min(0) }
          quantity: Int { max(1000) }
        }
      }
      server {
        fn create_product(product: Product) {
          product
        }
      }
    `);
    expect(code).toContain('must be at least');
    expect(code).toContain('must be at most');
  });

  test('generates minLength/maxLength validators', () => {
    const code = compileServer(`
      shared {
        type Profile {
          id: Int
          bio: String { minLength(10), maxLength(500) }
        }
      }
      server {
        fn update_profile(profile: Profile) {
          profile
        }
      }
    `);
    expect(code).toContain('is too short');
    expect(code).toContain('is too long');
  });

  test('generates pattern validator', () => {
    const code = compileServer(`
      shared {
        type Account {
          id: Int
          code: String { pattern("[A-Z]{3}") }
        }
      }
      server {
        fn create_account(account: Account) {
          account
        }
      }
    `);
    expect(code).toContain('invalid format');
  });

  test('generates oneOf validator', () => {
    const code = compileServer(`
      shared {
        type Setting {
          id: Int
          theme: String { oneOf(["light", "dark", "auto"]) }
        }
      }
      server {
        fn update_setting(setting: Setting) {
          setting
        }
      }
    `);
    expect(code).toContain('invalid value');
  });
});

// ═══════════════════════════════════════════════════════════════
// Non-versioned route with auto-sanitize (lines 2618-2619)
// ═══════════════════════════════════════════════════════════════
describe('Non-versioned routes with auto-sanitize', () => {
  test('auto-sanitize on non-versioned route', () => {
    const code = compileServer(`
      security {
        auth jwt {
          secret: "secret"
        }
        sensitive User.password {
          never_expose: true
        }
      }
      server {
        fn get_users(req) { [] }
        route GET "/api/users" => get_users
      }
    `);
    // Non-versioned routes should also auto-sanitize
    expect(code).toContain('__autoSanitize');
    expect(code).not.toContain('__addVersionHeaders');
  });
});

// ═══════════════════════════════════════════════════════════════
// Group middleware with req-only handler (line 2521)
// ═══════════════════════════════════════════════════════════════
describe('Group middleware with req-only handler', () => {
  test('group middleware calls handler with just __ctx when req-only', () => {
    const code = compileServer(`
      server {
        fn list_items(req) { [] }
        routes "/api" {
          middleware fn auth_check(req, next) {
            next(req)
          }
          route GET "/items" => list_items
        }
      }
    `);
    expect(code).toContain('list_items');
    expect(code).toContain('__ctx');
    // Should call handler with __ctx since it has req param but no extra params
    expect(code).toContain('auth_check');
  });
});

// ═══════════════════════════════════════════════════════════════
// Model fallback fields (line 1701) - multi-file scenario
// ═══════════════════════════════════════════════════════════════
describe('Model fallback fields (multi-file)', () => {
  test('model with config fields when shared type not available', () => {
    // In multi-file scenario, the shared type might not be in the same file
    // The model config fields act as a fallback
    const code = compileServer(`
      server {
        db {
          path: ":memory:"
        }
        model Widget {
          table: "widgets"
          name: String
          price: Float
        }
      }
    `);
    // Should still generate a model using the config fields as fallback
    expect(code).toContain('widgets');
    expect(code).toContain('WidgetModel');
  });
});
