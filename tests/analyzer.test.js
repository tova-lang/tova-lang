import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { Scope, Symbol as TovaSymbol } from '../src/analyzer/scope.js';

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

// ─── Scope tests ──────────────────────────────────────────

describe('Scope', () => {
  test('define and lookup symbol', () => {
    const scope = new Scope(null, 'module');
    const sym = new TovaSymbol('x', 'variable', null, false, { line: 1, column: 1, file: '<test>' });
    scope.define('x', sym);
    expect(scope.lookup('x')).toBe(sym);
  });

  test('lookup traverses parent scope', () => {
    const parent = new Scope(null, 'module');
    const child = parent.child('block');
    const sym = new TovaSymbol('x', 'variable', null, false, { line: 1, column: 1, file: '<test>' });
    parent.define('x', sym);
    expect(child.lookup('x')).toBe(sym);
  });

  test('lookup returns null for undefined', () => {
    const scope = new Scope(null, 'module');
    expect(scope.lookup('missing')).toBeNull();
  });

  test('lookupLocal only checks current scope', () => {
    const parent = new Scope(null, 'module');
    const child = parent.child('block');
    const sym = new TovaSymbol('x', 'variable', null, false, { line: 1, column: 1, file: '<test>' });
    parent.define('x', sym);
    expect(child.lookupLocal('x')).toBeNull();
    expect(parent.lookupLocal('x')).toBe(sym);
  });

  test('define throws on duplicate', () => {
    const scope = new Scope(null, 'module');
    const sym = new TovaSymbol('x', 'variable', null, false, { line: 1, column: 1, file: '<test>' });
    scope.define('x', sym);
    expect(() => scope.define('x', sym)).toThrow("'x' is already defined");
  });

  test('child creates new scope with context', () => {
    const parent = new Scope(null, 'module');
    const child = parent.child('server');
    expect(child.parent).toBe(parent);
    expect(child.context).toBe('server');
  });

  test('getContext returns nearest server/client/shared', () => {
    const mod = new Scope(null, 'module');
    const server = mod.child('server');
    const fn = server.child('function');
    const block = fn.child('block');
    expect(block.getContext()).toBe('server');
    expect(mod.getContext()).toBe('module');
  });

  test('getContext returns client', () => {
    const mod = new Scope(null, 'module');
    const client = mod.child('client');
    expect(client.getContext()).toBe('client');
  });

  test('getContext returns shared', () => {
    const mod = new Scope(null, 'module');
    const shared = mod.child('shared');
    expect(shared.getContext()).toBe('shared');
  });
});

// ─── Symbol tests ─────────────────────────────────────────

describe('Symbol', () => {
  test('symbol properties', () => {
    const sym = new TovaSymbol('count', 'state', 'Int', true, { line: 1, column: 1, file: '<test>' });
    expect(sym.name).toBe('count');
    expect(sym.kind).toBe('state');
    expect(sym.type).toBe('Int');
    expect(sym.mutable).toBe(true);
    expect(sym.used).toBe(false);
  });
});

// ─── Analyzer — basic analysis ────────────────────────────

describe('Analyzer — Variables', () => {
  test('immutable assignment defines variable', () => {
    const { scope } = analyze('x = 1');
    expect(scope.lookup('x')).not.toBeNull();
  });

  test('var declaration defines mutable variable', () => {
    const { scope } = analyze('var x = 1');
    const sym = scope.lookup('x');
    expect(sym).not.toBeNull();
    expect(sym.mutable).toBe(true);
  });

  test('immutable reassignment errors', () => {
    expect(analyzeThrows('x = 1\nx = 2')).toThrow();
  });

  test('mutable reassignment allowed', () => {
    expect(() => analyze('var x = 1\nx = 2')).not.toThrow();
  });

  test('compound assignment on immutable errors', () => {
    expect(analyzeThrows('x = 1\nx += 1')).toThrow();
  });

  test('compound assignment on mutable allowed', () => {
    expect(() => analyze('var x = 1\nx += 1')).not.toThrow();
  });

  test('let destructuring object', () => {
    const { scope } = analyze('let { a, b } = obj');
    expect(scope.lookup('a')).not.toBeNull();
    expect(scope.lookup('b')).not.toBeNull();
  });

  test('let destructuring array', () => {
    const { scope } = analyze('let [x, y] = pair');
    expect(scope.lookup('x')).not.toBeNull();
    expect(scope.lookup('y')).not.toBeNull();
  });

  test('multiple assignment', () => {
    const { scope } = analyze('a, b = 1, 2');
    expect(scope.lookup('a')).not.toBeNull();
    expect(scope.lookup('b')).not.toBeNull();
  });
});

describe('Analyzer — Functions', () => {
  test('function declaration defines symbol', () => {
    const { scope } = analyze('fn foo() { 42 }');
    expect(scope.lookup('foo')).not.toBeNull();
    expect(scope.lookup('foo').kind).toBe('function');
  });

  test('function params are scoped', () => {
    const { scope } = analyze('fn add(a, b) { a + b }');
    // params should NOT be in module scope
    expect(scope.lookupLocal('a')).toBeNull();
    expect(scope.lookupLocal('b')).toBeNull();
  });

  test('function with default params', () => {
    expect(() => analyze('fn greet(name = "world") { name }')).not.toThrow();
  });

  test('return statement', () => {
    expect(() => analyze('fn foo() { return 42 }')).not.toThrow();
  });
});

describe('Analyzer — Types', () => {
  test('type declaration defines type', () => {
    const { scope } = analyze('type User { name: String, age: Int }');
    expect(scope.lookup('User')).not.toBeNull();
    expect(scope.lookup('User').kind).toBe('type');
  });

  test('algebraic type defines variant constructors', () => {
    const { scope } = analyze('type Shape { Circle(r: Float), Rect(w: Float, h: Float) }');
    expect(scope.lookup('Circle')).not.toBeNull();
    expect(scope.lookup('Rect')).not.toBeNull();
  });
});

describe('Analyzer — Imports', () => {
  test('named import defines variables', () => {
    // 'map' and 'filter' are also builtins, so use non-builtin names
    const { scope } = analyze('import { foo, bar } from "utils"');
    expect(scope.lookup('foo')).not.toBeNull();
    expect(scope.lookup('bar')).not.toBeNull();
  });

  test('default import defines variable', () => {
    const { scope } = analyze('import React from "react"');
    expect(scope.lookup('React')).not.toBeNull();
  });
});

describe('Analyzer — Control Flow', () => {
  test('if statement', () => {
    expect(() => analyze('if true { print("yes") }')).not.toThrow();
  });

  test('if/elif/else', () => {
    expect(() => analyze('if x > 0 { 1 } elif x == 0 { 0 } else { -1 }')).not.toThrow();
  });

  test('for loop defines loop variable', () => {
    expect(() => analyze('for x in items { print(x) }')).not.toThrow();
  });

  test('for loop with two variables', () => {
    expect(() => analyze('for k, v in pairs { print(k) }')).not.toThrow();
  });

  test('for-else', () => {
    expect(() => analyze('for x in items { print(x) } else { print("empty") }')).not.toThrow();
  });

  test('while loop', () => {
    expect(() => analyze('var x = 10\nwhile x > 0 { x -= 1 }')).not.toThrow();
  });
});

describe('Analyzer — Expressions', () => {
  test('binary expression', () => {
    expect(() => analyze('x = 1 + 2')).not.toThrow();
  });

  test('unary expression', () => {
    expect(() => analyze('x = -5')).not.toThrow();
  });

  test('logical expression', () => {
    expect(() => analyze('x = true and false')).not.toThrow();
  });

  test('pipe expression', () => {
    expect(() => analyze('x = 1 |> print')).not.toThrow();
  });

  test('member expression', () => {
    expect(() => analyze('x = obj.name')).not.toThrow();
  });

  test('optional chaining', () => {
    expect(() => analyze('x = obj?.name')).not.toThrow();
  });

  test('call expression', () => {
    expect(() => analyze('x = foo(1, 2)')).not.toThrow();
  });

  test('call with named arguments', () => {
    expect(() => analyze('x = foo(name: "bar")')).not.toThrow();
  });

  test('chained comparison', () => {
    expect(() => analyze('x = 1 < y < 10')).not.toThrow();
  });

  test('membership expression', () => {
    expect(() => analyze('x = "a" in list')).not.toThrow();
  });

  test('range expression', () => {
    expect(() => analyze('x = 1..10')).not.toThrow();
  });

  test('slice expression', () => {
    expect(() => analyze('x = list[1:3]')).not.toThrow();
  });

  test('spread expression', () => {
    expect(() => analyze('x = [...items]')).not.toThrow();
  });

  test('template literal', () => {
    expect(() => analyze('x = "hello {name}"')).not.toThrow();
  });

  test('array literal', () => {
    expect(() => analyze('x = [1, 2, 3]')).not.toThrow();
  });

  test('object literal', () => {
    expect(() => analyze('x = {a: 1, b: 2}')).not.toThrow();
  });

  test('list comprehension', () => {
    expect(() => analyze('x = [i * 2 for i in range(10)]')).not.toThrow();
  });

  test('list comprehension with condition', () => {
    expect(() => analyze('x = [i for i in range(10) if i > 5]')).not.toThrow();
  });

  test('lambda expression', () => {
    expect(() => analyze('x = fn(a) a * 2')).not.toThrow();
  });

  test('lambda with block body', () => {
    expect(() => analyze('x = fn(a) { a * 2 }')).not.toThrow();
  });

  test('match expression', () => {
    expect(() => analyze('x = match val { 0 => "zero", _ => "other" }')).not.toThrow();
  });

  test('match with guard', () => {
    expect(() => analyze('x = match val { n if n > 10 => "big", _ => "small" }')).not.toThrow();
  });

  test('match with variant pattern', () => {
    expect(() => analyze('x = match shape { Circle(r) => r, Rect(w, h) => w }')).not.toThrow();
  });

  test('match with range pattern', () => {
    expect(() => analyze('x = match val { 1..10 => "range", _ => "other" }')).not.toThrow();
  });

  test('wildcard identifier _', () => {
    expect(() => analyze('_ = some_fn()')).not.toThrow();
  });

  test('nil literal', () => {
    expect(() => analyze('x = nil')).not.toThrow();
  });

  test('boolean literals', () => {
    expect(() => analyze('x = true\ny = false')).not.toThrow();
  });

  test('string literal', () => {
    expect(() => analyze("x = 'hello'")).not.toThrow();
  });
});

// ─── Block boundary validation ────────────────────────────

describe('Analyzer — Server/Client boundaries', () => {
  test('server block creates scope', () => {
    expect(() => analyze('server { fn hello() { "world" } }')).not.toThrow();
  });

  test('client block creates scope', () => {
    expect(() => analyze('client { state count = 0 }')).not.toThrow();
  });

  test('shared block creates scope', () => {
    expect(() => analyze('shared { type User { name: String } }')).not.toThrow();
  });

  test('state outside client errors (via manual AST)', () => {
    // The parser prevents state outside client blocks, so we test the analyzer directly
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const stateNode = new AST.StateDeclaration('count', null, new AST.NumberLiteral(0, loc), loc);
    const ast = new AST.Program([stateNode]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('computed outside client errors (via manual AST)', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const compNode = new AST.ComputedDeclaration('doubled', new AST.NumberLiteral(0, loc), loc);
    const ast = new AST.Program([compNode]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('effect outside client errors (via manual AST)', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const effectNode = new AST.EffectDeclaration(new AST.BlockStatement([], loc), loc);
    const ast = new AST.Program([effectNode]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('component outside client errors (via manual AST)', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const compNode = new AST.ComponentDeclaration('App', [], [], loc);
    const ast = new AST.Program([compNode]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('route outside server errors (via manual AST)', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const routeNode = new AST.RouteDeclaration('GET', '/api', new AST.Identifier('handler', loc), loc);
    const ast = new AST.Program([routeNode]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('state inside client allowed', () => {
    expect(() => analyze('client { state count = 0 }')).not.toThrow();
  });

  test('computed inside client allowed', () => {
    expect(() => analyze('client { computed doubled = count * 2 }')).not.toThrow();
  });

  test('effect inside client allowed', () => {
    expect(() => analyze('client { effect { print("hi") } }')).not.toThrow();
  });

  test('component inside client allowed', () => {
    expect(() => analyze('client { component App { <div>"hello"</div> } }')).not.toThrow();
  });

  test('route inside server allowed', () => {
    expect(() => analyze('server { fn handler() { 1 } route GET "/api" => handler }')).not.toThrow();
  });
});

// ─── JSX analysis ─────────────────────────────────────────

describe('Analyzer — JSX', () => {
  test('JSX element in component', () => {
    expect(() => analyze('client { component App { <div class="test">"hello"</div> } }')).not.toThrow();
  });

  test('JSX with for loop', () => {
    expect(() => analyze('client { component List { <ul> for item in items { <li>"text"</li> } </ul> } }')).not.toThrow();
  });

  test('JSX with if', () => {
    expect(() => analyze('client { component C { <div> if show { <span>"yes"</span> } </div> } }')).not.toThrow();
  });

  test('JSX with if/else', () => {
    expect(() => analyze('client { component C { <div> if show { <span>"yes"</span> } else { <span>"no"</span> } </div> } }')).not.toThrow();
  });
});

// ─── Warnings ─────────────────────────────────────────────

describe('Analyzer — Warnings', () => {
  test('analyze returns warnings array', () => {
    const result = analyze('x = 1');
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  test('analyze returns scope', () => {
    const result = analyze('x = 1');
    expect(result.scope).toBeDefined();
  });
});

// ─── Named blocks ─────────────────────────────────────────

describe('Analyzer — Named Blocks', () => {
  test('named server block', () => {
    expect(() => analyze('server "api" { fn hello() { 1 } }')).not.toThrow();
  });

  test('named client block', () => {
    expect(() => analyze('client "dashboard" { state x = 0 }')).not.toThrow();
  });

  test('multiple named server blocks', () => {
    expect(() => analyze('server "api" { fn a() { 1 } } server "ws" { fn b() { 2 } }')).not.toThrow();
  });
});

describe('Analyzer — Inter-Server RPC', () => {
  test('valid inter-server call does not error', () => {
    expect(() => analyze(`
      server "api" { fn create_user(name) { events.push_event("user_created", name) } }
      server "events" { fn push_event(kind, data) { kind } }
    `)).not.toThrow();
  });

  test('unknown function on peer server block errors', () => {
    expect(analyzeThrows(`
      server "api" { fn create_user(name) { events.nonexistent("test") } }
      server "events" { fn push_event(kind, data) { kind } }
    `)).toThrow(/No function 'nonexistent' in server block "events"/);
  });

  test('self-referencing server call warns', () => {
    const source = 'server "api" { fn foo() { api.foo() } }';
    const lexer = new Lexer(source, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    const ast = parser.parse();
    const analyzer = new Analyzer(ast, '<test>');
    const result = analyzer.analyze();
    expect(result.warnings.some(w => w.message.includes('calling itself'))).toBe(true);
  });

  test('peer block names registered as valid identifiers', () => {
    // Should not produce any identifier errors
    expect(() => analyze(`
      server "api" { fn get() { events.push("test") } }
      server "events" { fn push(data) { data } }
    `)).not.toThrow();
  });
});
