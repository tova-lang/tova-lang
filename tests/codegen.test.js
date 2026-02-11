import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function compile(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const codegen = new CodeGenerator(ast, '<test>');
  return codegen.generate();
}

function compileShared(source) {
  return compile(source).shared.trim();
}

describe('Codegen — Variables', () => {
  test('immutable assignment → const', () => {
    const code = compileShared('x = 42');
    expect(code).toContain('const x = 42;');
  });

  test('mutable variable → let', () => {
    const code = compileShared('var x = 42');
    expect(code).toContain('let x = 42;');
  });

  test('multiple assignment → atomic destructuring', () => {
    const code = compileShared('a, b = 1, 2');
    expect(code).toContain('const [a, b] = [1, 2];');
  });

  test('let destructuring', () => {
    const code = compileShared('let { name, age } = user');
    expect(code).toContain('const { name, age } = user;');
  });

  test('compound assignment', () => {
    const code = compileShared('x += 1');
    expect(code).toContain('x += 1;');
  });
});

describe('Codegen — Functions', () => {
  test('simple function', () => {
    const code = compileShared('fn add(a, b) { a + b }');
    expect(code).toContain('function add(a, b)');
    expect(code).toContain('return (a + b);');
  });

  test('function with default params', () => {
    const code = compileShared('fn greet(name = "world") { name }');
    expect(code).toContain('function greet(name = "world")');
  });

  test('return statement', () => {
    const code = compileShared('fn foo() { return 42 }');
    expect(code).toContain('return 42;');
  });
});

describe('Codegen — Expressions', () => {
  test('string interpolation → template literal', () => {
    const code = compileShared('x = "Hello, {name}!"');
    expect(code).toContain('`Hello, ${name}!`');
  });

  test('pipe operator', () => {
    const code = compileShared('x = data |> filter(fn(x) x > 0)');
    expect(code).toContain('filter(data,');
  });

  test('chained comparison', () => {
    const code = compileShared('x = 1 < y < 10');
    expect(code).toContain('((1 < y) && (y < 10))');
  });

  test('membership: in', () => {
    const code = compileShared('x = a in list');
    expect(code).toContain('__contains(list, a)');
  });

  test('membership: not in', () => {
    const code = compileShared('x = a not in list');
    expect(code).toContain('(!__contains(list, a))');
  });

  test('range expression', () => {
    const code = compileShared('x = 1..10');
    expect(code).toContain('Array.from');
    expect(code).toContain('length: 10 - 1');
  });

  test('inclusive range', () => {
    const code = compileShared('x = 1..=10');
    expect(code).toContain('10 - 1 + 1');
  });

  test('list comprehension', () => {
    const code = compileShared('x = [n * 2 for n in items if n > 0]');
    expect(code).toContain('.filter(');
    expect(code).toContain('.map(');
  });

  test('logical operators', () => {
    const code = compileShared('x = a and b or not c');
    expect(code).toContain('&&');
    expect(code).toContain('||');
    expect(code).toContain('!');
  });

  test('string multiply', () => {
    const code = compileShared('x = "ha" * 3');
    expect(code).toContain('"ha".repeat(3)');
  });

  test('lambda expression', () => {
    const code = compileShared('x = fn(a, b) a + b');
    expect(code).toContain('(a, b) => (a + b)');
  });

  test('arrow lambda', () => {
    const code = compileShared('x = x => x * 2');
    expect(code).toContain('(x) => (x * 2)');
  });

  test('slice syntax', () => {
    const code = compileShared('x = list[1:3]');
    expect(code).toContain('.slice(1, 3)');
  });

  test('spread operator', () => {
    const code = compileShared('x = [...items, 4]');
    expect(code).toContain('...items');
  });

  test('optional chaining', () => {
    const code = compileShared('x = user?.name');
    expect(code).toContain('user?.name');
  });
});

describe('Codegen — Control Flow', () => {
  test('if/elif/else', () => {
    const code = compileShared('if x > 0 { print("pos") } elif x == 0 { print("zero") } else { print("neg") }');
    expect(code).toContain('if (');
    expect(code).toContain('else if (');
    expect(code).toContain('else {');
  });

  test('for loop', () => {
    const code = compileShared('for x in items { print(x) }');
    expect(code).toContain('for (const x of items)');
  });

  test('for with two variables', () => {
    const code = compileShared('for k, v in pairs { print(k) }');
    expect(code).toContain('for (const [k, v] of pairs)');
  });

  test('while loop', () => {
    const code = compileShared('while x > 0 { x -= 1 }');
    expect(code).toContain('while (');
  });
});

describe('Codegen — Types', () => {
  test('struct type → constructor function', () => {
    const code = compileShared('type User { name: String, age: Int }');
    expect(code).toContain('function User(name, age)');
    expect(code).toContain('return { name, age }');
  });

  test('algebraic type → tagged unions', () => {
    const code = compileShared('type Shape { Circle(radius: Float), Rect(w: Float, h: Float) }');
    expect(code).toContain('function Circle(radius)');
    expect(code).toContain('__tag: "Circle"');
    expect(code).toContain('function Rect(w, h)');
    expect(code).toContain('__tag: "Rect"');
  });
});

describe('Codegen — Match', () => {
  test('basic match → IIFE', () => {
    const code = compileShared('x = match val { 0 => "zero", _ => "other" }');
    expect(code).toContain('(__match) =>');
    expect(code).toContain('__match === 0');
  });

  test('match with variant', () => {
    const code = compileShared('x = match shape { Circle(radius) => radius, _ => 0 }');
    expect(code).toContain('__tag === "Circle"');
  });

  test('match with guard', () => {
    const code = compileShared('x = match n { x if x > 10 => "big", _ => "small" }');
    expect(code).toContain('> 10');
  });
});

describe('Codegen — Imports', () => {
  test('named import', () => {
    const code = compileShared('import { map, filter } from "utils"');
    expect(code).toContain('import { map, filter } from "utils";');
  });

  test('default import', () => {
    const code = compileShared('import React from "react"');
    expect(code).toContain('import React from "react";');
  });
});

describe('Codegen — Server', () => {
  test('generates Bun.serve()', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('Bun.serve(');
    expect(result.server).toContain('__handleRequest');
    expect(result.server).not.toContain('Hono');
  });

  test('generates RPC endpoint for server function', () => {
    const result = compile('server { fn get_users() { [] } }');
    expect(result.server).toContain('__addRoute("POST", "/rpc/get_users"');
  });

  test('generates explicit route', () => {
    const result = compile('server { fn handler() { [] } route GET "/api/test" => handler }');
    expect(result.server).toContain('__addRoute("GET", "/api/test"');
  });

  test('generates CORS headers', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('__corsHeaders');
    expect(result.server).toContain('Access-Control-Allow-Origin');
  });
});

describe('Codegen — Named Multi-Blocks', () => {
  test('named server blocks produce separate outputs', () => {
    const result = compile('server "api" { fn get_data() { [] } } server "ws" { fn connect() { true } }');
    expect(result.multiBlock).toBe(true);
    expect(result.servers['api']).toContain('function get_data()');
    expect(result.servers['api']).toContain('/rpc/get_data');
    expect(result.servers['ws']).toContain('function connect()');
    expect(result.servers['ws']).toContain('/rpc/connect');
  });

  test('named blocks use port env vars', () => {
    const result = compile('server "api" { fn ping() { true } }');
    expect(result.servers['api']).toContain('PORT_API');
    expect(result.servers['api']).toContain('[api]');
  });

  test('unnamed blocks remain backward-compatible', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.multiBlock).toBeUndefined();
    expect(result.server).toContain('function hello()');
  });
});

describe('Codegen — Bug Fixes', () => {
  test('mutable var reassignment emits bare assignment, not const', () => {
    const code = compileShared('var x = 0\nx = 5');
    expect(code).toContain('let x = 0;');
    expect(code).toContain('x = 5;');
    expect(code).not.toContain('const x = 5;');
  });

  test('mutable var in function: reassignment works', () => {
    const code = compileShared('var items = []\nfn add(item) { items = [...items, item] }');
    expect(code).toContain('let items = [];');
    expect(code).toContain('items = [...items, item];');
    expect(code).not.toContain('const items = [...items');
  });

  test('function-local const does not leak to sibling function', () => {
    const code = compileShared('fn foo() { x = 1 }\nfn bar() { x = 2 }');
    // Both should be const (independent scopes)
    const matches = code.match(/const x = /g);
    expect(matches).toHaveLength(2);
  });

  test('multiple assignment swap is atomic', () => {
    const code = compileShared('var a = 1\nvar b = 2\na, b = b, a');
    expect(code).toContain('[a, b] = [b, a];');
    expect(code).not.toContain('const a = b;');
  });

  test('multiple assignment new vars uses destructuring', () => {
    const code = compileShared('a, b = 1, 2');
    expect(code).toContain('const [a, b] = [1, 2];');
  });

  test('slice with negative step reverses', () => {
    const code = compileShared('x = list[::-1]');
    expect(code).toContain('st > 0');
    expect(code).toContain('a.length - 1');
    expect(code).toContain('-1');
  });

  test('slice with positive step', () => {
    const code = compileShared('x = list[::2]');
    expect(code).toContain('st > 0');
  });

  test('for-else uses deterministic temp var names', () => {
    const code1 = compileShared('for x in items { print(x) } else { print("empty") }');
    const code2 = compileShared('for x in items { print(x) } else { print("empty") }');
    expect(code1).toContain('__iter_0');
    expect(code2).toContain('__iter_0');
  });

  test('membership: in uses __contains helper', () => {
    const code = compileShared('x = "key" in obj');
    expect(code).toContain('__contains(obj, "key")');
    expect(code).toContain('function __contains');
  });

  test('named arguments compile to object', () => {
    const code = compileShared('greet(name: "Alice", age: 25)');
    expect(code).toContain('greet({ name: "Alice", age: 25 })');
  });
});

describe('Codegen — Null Coalescing', () => {
  test('?? operator', () => {
    const code = compileShared('x = a ?? "default"');
    expect(code).toContain('(a ?? "default")');
  });

  test('?? chains', () => {
    const code = compileShared('x = a ?? b ?? "fallback"');
    expect(code).toContain('??');
  });
});

describe('Codegen — If Expression', () => {
  test('simple if-else expression compiles to ternary', () => {
    const code = compileShared('x = if true { 1 } else { 0 }');
    expect(code).toContain('?');
    expect(code).toContain(':');
  });

  test('multi-statement if expression compiles to IIFE', () => {
    const code = compileShared('x = if cond { y = 1\ny + 2 } else { 0 }');
    expect(code).toContain('(() => {');
    expect(code).toContain('if (cond)');
    expect(code).toContain('return');
  });

  test('if-elif-else expression', () => {
    const code = compileShared('x = if a { 1 } elif b { 2 } else { 3 }');
    expect(code).toContain('(() => {');
    expect(code).toContain('else if');
  });
});

describe('Codegen — Server Bug Fixes', () => {
  test('server var reassignment works correctly', () => {
    const result = compile('server { var items = []\nfn add(item) { items = [...items, item]\nitem } }');
    expect(result.server).toContain('let items = [];');
    expect(result.server).toContain('items = [...items, item];');
    expect(result.server).not.toContain('const items = [...items');
  });

  test('RPC supports positional args (__args)', () => {
    const result = compile('server { fn add_todo(title) { title } }');
    expect(result.server).toContain('body.__args');
    expect(result.server).toContain('body.__args[0]');
    expect(result.server).toContain('body.title');
  });
});

describe('Codegen — Client', () => {
  test('generates reactive state signals', () => {
    const result = compile('client { state count = 0 }');
    expect(result.client).toContain('createSignal(0)');
    expect(result.client).toContain('setCount');
  });

  test('generates computed', () => {
    const result = compile('client { computed doubled = count * 2 }');
    expect(result.client).toContain('createComputed(');
  });

  test('generates effect', () => {
    const result = compile('client { effect { print("hello") } }');
    expect(result.client).toContain('createEffect(');
  });

  test('generates component', () => {
    const result = compile('client { component App { <div>"Hello"</div> } }');
    expect(result.client).toContain('function App(');
    expect(result.client).toContain('lux_el("div"');
  });

  test('generates server RPC proxy', () => {
    const result = compile('client { state x = 0 }');
    expect(result.client).toContain('const server = new Proxy');
    expect(result.client).toContain('rpc(name, args)');
  });
});
