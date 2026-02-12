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
    expect(result.server).toContain('__getCorsHeaders');
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
  test('?? operator (NaN-safe)', () => {
    const code = compileShared('x = a ?? "default"');
    expect(code).toContain('__lux_v != null && __lux_v === __lux_v');
    expect(code).toContain('"default"');
  });

  test('?? chains', () => {
    const code = compileShared('x = a ?? b ?? "fallback"');
    expect(code).toContain('__lux_v');
    expect(code).toContain('"fallback"');
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

// ─── New Feature Tests ──────────────────────────────────

describe('Codegen — Runtime Imports', () => {
  test('imports batch, onMount, onCleanup, createRef', () => {
    const result = compile('client { state x = 0 }');
    expect(result.client).toContain('batch');
    expect(result.client).toContain('onMount');
    expect(result.client).toContain('onCleanup');
    expect(result.client).toContain('createRef');
  });

  test('imports context and error boundary utilities', () => {
    const result = compile('client { state x = 0 }');
    expect(result.client).toContain('createContext');
    expect(result.client).toContain('provide');
    expect(result.client).toContain('inject');
    expect(result.client).toContain('createErrorBoundary');
    expect(result.client).toContain('ErrorBoundary');
  });
});

describe('Codegen — Component-Scoped State (Item 6)', () => {
  test('state inside component generates local createSignal', () => {
    const result = compile('client { component Counter { state count = 0\n<div>"hello"</div> } }');
    expect(result.client).toContain('function Counter(');
    expect(result.client).toContain('const [count, setCount] = createSignal(0)');
  });

  test('computed inside component generates local createComputed', () => {
    const result = compile('client { component Counter { state count = 0\ncomputed doubled = count * 2\n<div>"hello"</div> } }');
    expect(result.client).toContain('const doubled = createComputed(');
  });

  test('effect inside component generates local createEffect', () => {
    const result = compile('client { component Timer { state t = 0\neffect { print(t) }\n<div>"hello"</div> } }');
    expect(result.client).toContain('function Timer(');
    expect(result.client).toContain('createEffect(');
  });

  test('component-scoped state does not leak to module level', () => {
    const result = compile(`client {
      component A { state x = 1\n<div>"a"</div> }
      component B { state y = 2\n<div>"b"</div> }
    }`);
    // Both A and B should have their own createSignal
    const code = result.client;
    const aFn = code.indexOf('function A(');
    const bFn = code.indexOf('function B(');
    const aSignal = code.indexOf('createSignal(1)');
    const bSignal = code.indexOf('createSignal(2)');
    expect(aSignal).toBeGreaterThan(aFn);
    expect(bSignal).toBeGreaterThan(bFn);
  });

  test('state setter transform works inside component', () => {
    const result = compile(`client {
      component Counter {
        state count = 0
        <button on:click={fn() count += 1}>"+"</button>
      }
    }`);
    expect(result.client).toContain('setCount(__lux_p => __lux_p + 1)');
  });
});

describe('Codegen — Two-Way Binding (Item 10)', () => {
  test('bind:value generates reactive value prop and onInput handler', () => {
    const result = compile('client { state name = ""\ncomponent App { <input bind:value={name} /> } }');
    expect(result.client).toContain('value: () => name()');
    expect(result.client).toContain('onInput: (e) => { setName(e.target.value); }');
  });

  test('bind:checked generates reactive checked prop and onChange handler', () => {
    const result = compile('client { state active = false\ncomponent App { <input bind:checked={active} /> } }');
    expect(result.client).toContain('checked: () => active()');
    expect(result.client).toContain('onChange: (e) => { setActive(e.target.checked); }');
  });
});

describe('Codegen — Conditional Classes (Item 11)', () => {
  test('class:name generates conditional className', () => {
    const result = compile('client { state active = true\ncomponent App { <div class:active={active} /> } }');
    expect(result.client).toContain('active()');
    expect(result.client).toContain('"active"');
    expect(result.client).toContain('filter(Boolean)');
    expect(result.client).toContain('join(" ")');
  });

  test('class:name merges with base class', () => {
    const result = compile('client { state bold = true\ncomponent App { <div class="base" class:bold={bold} /> } }');
    expect(result.client).toContain('"base"');
    expect(result.client).toContain('"bold"');
    expect(result.client).toContain('filter(Boolean)');
  });
});

describe('Codegen — Children/Slots (Item 12)', () => {
  test('component with children passes them as children prop', () => {
    const result = compile('client { component Card { <div>"card"</div> }\ncomponent App { <Card><p>"hi"</p></Card> } }');
    expect(result.client).toContain('children:');
    expect(result.client).toContain('lux_el("p"');
  });

  test('self-closing component has no children prop', () => {
    const result = compile('client { component Icon { <span>"icon"</span> }\ncomponent App { <Icon /> } }');
    expect(result.client).not.toContain('children:');
  });
});

describe('Codegen — Inter-Server RPC', () => {
  test('generates peer RPC proxy for named server blocks', () => {
    const result = compile(`
      server "api" { fn create_user(name) { name } }
      server "events" { fn push_event(kind, data) { kind } }
    `);
    expect(result.multiBlock).toBe(true);
    // "api" server should have an "events" proxy
    expect(result.servers['api']).toContain('const events = {');
    expect(result.servers['api']).toContain('async push_event(...args)');
    expect(result.servers['api']).toContain('/rpc/push_event');
    expect(result.servers['api']).toContain('PORT_EVENTS');
    // "events" server should have an "api" proxy
    expect(result.servers['events']).toContain('const api = {');
    expect(result.servers['events']).toContain('async create_user(...args)');
    expect(result.servers['events']).toContain('/rpc/create_user');
    expect(result.servers['events']).toContain('PORT_API');
  });

  test('peer proxy uses fetch with JSON body', () => {
    const result = compile(`
      server "api" { fn get_data() { [] } }
      server "ws" { fn connect() { true } }
    `);
    expect(result.servers['api']).toContain("method: 'POST'");
    expect(result.servers['api']).toContain("'Content-Type': 'application/json'");
    expect(result.servers['api']).toContain('JSON.stringify({ __args: args })');
    expect(result.servers['api']).toContain('.json()).result');
  });

  test('no peer proxy for single named server block', () => {
    const result = compile('server "api" { fn get_data() { [] } }');
    expect(result.servers['api']).not.toContain('Peer Server RPC Proxies');
  });

  test('no peer proxy for unnamed server blocks', () => {
    const result = compile('server { fn get_data() { [] } }');
    expect(result.server).not.toContain('Peer Server RPC Proxies');
  });

  test('three named blocks get correct peer proxies', () => {
    const result = compile(`
      server "api" { fn get_users() { [] } }
      server "auth" { fn login(user) { user } }
      server "events" { fn push(kind) { kind } }
    `);
    // "api" should have proxies for "auth" and "events"
    expect(result.servers['api']).toContain('const auth = {');
    expect(result.servers['api']).toContain('const events = {');
    expect(result.servers['api']).not.toContain('const api = {');
    // "auth" should have proxies for "api" and "events"
    expect(result.servers['auth']).toContain('const api = {');
    expect(result.servers['auth']).toContain('const events = {');
    expect(result.servers['auth']).not.toContain('const auth = {');
  });
});

// ─── Scoped CSS ───────────────────────────────────────────

describe('Codegen — Scoped CSS', () => {
  test('style block in component emits lux_inject_css', () => {
    const result = compile(`client {
      component Card {
        style {
          .card { border: 1px solid #ccc; }
        }
        <div class="card">"hello"</div>
      }
    }`);
    expect(result.client).toContain('lux_inject_css(');
    expect(result.client).toContain('.card[data-lux-');
  });

  test('scoped CSS adds data attribute to JSX elements', () => {
    const result = compile(`client {
      component Card {
        style {
          .card { color: red; }
        }
        <div class="card">"hello"</div>
      }
    }`);
    expect(result.client).toContain('data-lux-');
    expect(result.client).toContain(': ""');
  });

  test('scoped CSS does not add attribute to child components', () => {
    const result = compile(`client {
      component Inner { <span>"inner"</span> }
      component App {
        style {
          .wrapper { padding: 10px; }
        }
        <div class="wrapper"><Inner /></div>
      }
    }`);
    // Inner() call should NOT have data-lux attribute
    expect(result.client).toMatch(/Inner\(\{/);
    // The div should have the scope attribute
    expect(result.client).toMatch(/lux_el\("div", \{.*data-lux/);
  });

  test('component without style block has no scope attributes', () => {
    const result = compile(`client {
      component Plain {
        <div>"no style"</div>
      }
    }`);
    // lux_inject_css appears in import but should NOT be called
    expect(result.client).not.toContain('lux_inject_css(');
    expect(result.client).not.toContain('data-lux-');
  });

  test('imports lux_inject_css from runtime', () => {
    const result = compile('client { state x = 0 }');
    expect(result.client).toContain('lux_inject_css');
  });
});

// ─── Store Keyword ──────────────────────────────────────

describe('Codegen — Store', () => {
  test('store with state generates IIFE with createSignal and getter/setter', () => {
    const result = compile(`client {
      store CounterStore {
        state count = 0
      }
    }`);
    expect(result.client).toContain('const CounterStore = (() => {');
    expect(result.client).toContain('createSignal(0)');
    expect(result.client).toContain('get count()');
    expect(result.client).toContain('set count(v)');
    expect(result.client).toContain('setCount(v)');
    expect(result.client).toContain('})();');
  });

  test('store with computed generates getter (no setter)', () => {
    const result = compile(`client {
      store MathStore {
        state x = 5
        computed doubled = x * 2
      }
    }`);
    expect(result.client).toContain('createComputed(');
    expect(result.client).toContain('get doubled()');
    // Computed should NOT have a setter
    expect(result.client).not.toContain('set doubled');
  });

  test('store with fn generates action function', () => {
    const result = compile(`client {
      store TodoStore {
        state items = []
        fn add(text) {
          items = [...items, text]
        }
      }
    }`);
    expect(result.client).toContain('function add(text)');
    expect(result.client).toContain('setItems(');
    // Function should be exported in return object
    expect(result.client).toContain('add,');
  });

  test('store state names do not leak to component scope', () => {
    const result = compile(`client {
      store MyStore {
        state x = 0
      }
      component App {
        state y = 1
        <div>"hello"</div>
      }
    }`);
    const code = result.client;
    // Inside App, 'x' should NOT be treated as a signal getter
    // 'y' should still be a signal inside App
    const appFn = code.indexOf('function App(');
    const appBody = code.slice(appFn);
    expect(appBody).toContain('createSignal(1)');
    // The store IIFE should contain its own createSignal
    expect(code).toContain('const MyStore = (() => {');
  });

  test('store imports createRoot from runtime', () => {
    const result = compile(`client { store S { state x = 0 } }`);
    expect(result.client).toContain('createRoot');
  });
});

// ─── Bug Fix Tests ──────────────────────────────────────

describe('Bug Fix — JSXIf generates reactive closure', () => {
  test('JSXIf wraps ternary in () =>', () => {
    const result = compile(`client {
      state show = true
      component App {
        <div>
          if show {
            <span>"visible"</span>
          } else {
            <span>"hidden"</span>
          }
        </div>
      }
    }`);
    // Should be a reactive closure, not a bare ternary
    expect(result.client).toContain('() => (show())');
    expect(result.client).toContain('? lux_el("span"');
    expect(result.client).toContain(': lux_el("span"');
  });

  test('JSXIf with elif generates reactive closure', () => {
    const result = compile(`client {
      state mode = "a"
      component App {
        <div>
          if mode == "a" {
            <span>"A"</span>
          } elif mode == "b" {
            <span>"B"</span>
          } else {
            <span>"C"</span>
          }
        </div>
      }
    }`);
    expect(result.client).toContain('() => ');
  });
});

describe('Bug Fix — JSXFor generates reactive closure', () => {
  test('JSXFor wraps in () => without spread', () => {
    const result = compile(`client {
      state items = []
      component App {
        <ul>
          for item in items {
            <li>"item"</li>
          }
        </ul>
      }
    }`);
    // Should be () => items().map(...), NOT ...items().map(...)
    expect(result.client).toContain('() => items().map(');
    expect(result.client).not.toContain('...items().map(');
  });

  test('JSXFor with key generates reactive closure', () => {
    const result = compile(`client {
      state items = []
      component App {
        <ul>
          for item in items key={item} {
            <li>"item"</li>
          }
        </ul>
      }
    }`);
    expect(result.client).toContain('() => items().map(');
    expect(result.client).toContain('lux_keyed(');
    expect(result.client).not.toContain('...items()');
  });
});

describe('Bug Fix — __lux_p variable name', () => {
  test('compound assignment uses __lux_p (no collision with user vars)', () => {
    const result = compile(`client {
      state count = 0
      component App {
        <button on:click={fn() count += 1}>"+"</button>
      }
    }`);
    expect(result.client).toContain('__lux_p');
    expect(result.client).not.toContain('__prev');
  });

  test('top-level compound assignment uses __lux_p', () => {
    const result = compile(`client {
      state score = 0
      effect { score += 10 }
    }`);
    expect(result.client).toContain('setScore(__lux_p => __lux_p + 10)');
  });
});

describe('Bug Fix — CSS scope hash includes content', () => {
  test('same component name with different CSS produces different scope IDs', () => {
    const result1 = compile(`client {
      component Card {
        style { .card { color: red; } }
        <div class="card">"a"</div>
      }
    }`);
    const result2 = compile(`client {
      component Card {
        style { .card { color: blue; border: 1px solid; } }
        <div class="card">"b"</div>
      }
    }`);
    // Extract scope IDs from lux_inject_css calls
    const match1 = result1.client.match(/lux_inject_css\("([^"]+)"/);
    const match2 = result2.client.match(/lux_inject_css\("([^"]+)"/);
    expect(match1).not.toBeNull();
    expect(match2).not.toBeNull();
    // Different CSS → different scope IDs
    expect(match1[1]).not.toBe(match2[1]);
  });
});

describe('Bug Fix — select bind uses change event', () => {
  test('bind:value on select generates onChange', () => {
    const result = compile(`client {
      state choice = "a"
      component App {
        <select bind:value={choice}>
          <option>"a"</option>
          <option>"b"</option>
        </select>
      }
    }`);
    expect(result.client).toContain('onChange: (e) => { setChoice(e.target.value); }');
    expect(result.client).not.toContain('onInput: (e) => { setChoice(e.target.value); }');
  });

  test('bind:value on input still generates onInput', () => {
    const result = compile(`client {
      state name = ""
      component App { <input bind:value={name} /> }
    }`);
    expect(result.client).toContain('onInput: (e) => { setName(e.target.value); }');
  });
});

describe('Bug Fix — store member access detected as reactive', () => {
  test('store.prop in JSX is wrapped in reactive closure', () => {
    const result = compile(`client {
      store Counter {
        state count = 0
      }
      component App {
        <div>{Counter.count}</div>
      }
    }`);
    // Counter.count accesses a store → should be reactive closure
    expect(result.client).toContain('() => Counter.count');
  });

  test('non-store member access is not falsely reactive', () => {
    const result = compile(`client {
      component App {
        <div>{Math.PI}</div>
      }
    }`);
    // Math is not a store, so Math.PI should NOT be wrapped
    expect(result.client).not.toContain('() => Math.PI');
  });
});

// ─── New Feature Tests: Missing Features ────────────────

describe('Feature — Runtime imports include new primitives', () => {
  test('imports watch, untrack, Dynamic, Portal, lazy', () => {
    const result = compile('client { state x = 0 }');
    expect(result.client).toContain('watch');
    expect(result.client).toContain('untrack');
    expect(result.client).toContain('Dynamic');
    expect(result.client).toContain('Portal');
    expect(result.client).toContain('lazy');
  });
});

describe('Feature — bind:group radio', () => {
  test('generates checked and onChange for radio button', () => {
    const result = compile(`client {
      state selected = "a"
      component App {
        <input type="radio" value="a" bind:group={selected} />
        <input type="radio" value="b" bind:group={selected} />
      }
    }`);
    // Radio group should produce checked: () => selected() === "a"
    expect(result.client).toContain('selected()');
    expect(result.client).toContain('setSelected');
  });

  test('radio bind:group uses single value comparison', () => {
    const result = compile(`client {
      state color = "red"
      component App {
        <input type="radio" value="red" bind:group={color} />
      }
    }`);
    expect(result.client).toContain('color() === "red"');
    expect(result.client).toContain('setColor("red")');
  });
});

describe('Feature — bind:group checkbox', () => {
  test('generates array-based checked and toggle for checkbox', () => {
    const result = compile(`client {
      state items = []
      component App {
        <input type="checkbox" value="a" bind:group={items} />
        <input type="checkbox" value="b" bind:group={items} />
      }
    }`);
    // Checkbox group should include/exclude from array
    expect(result.client).toContain('items().includes');
    expect(result.client).toContain('setItems');
    expect(result.client).toContain('filter');
  });
});

describe('Feature — Named slots', () => {
  test('children with slot attribute become named props', () => {
    const result = compile(`client {
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
    // The <div slot="header"> should become header: [...] prop
    expect(result.client).toContain('header:');
    expect(result.client).toContain('children:');
  });
});

describe('Feature — JSX for-loop destructuring', () => {
  test('array destructuring in JSX for', () => {
    const result = compile(`client {
      state items = [[1, "a"], [2, "b"]]
      component App {
        <ul>
          for [i, name] in items() {
            <li>{name}</li>
          }
        </ul>
      }
    }`);
    expect(result.client).toContain('[i, name]');
    expect(result.client).toContain('.map(');
  });

  test('object destructuring in JSX for', () => {
    const result = compile(`client {
      state users = [{ "name": "Alice", "age": 30 }]
      component App {
        <ul>
          for {name, age} in users() {
            <li>{name}</li>
          }
        </ul>
      }
    }`);
    expect(result.client).toContain('{name, age}');
    expect(result.client).toContain('.map(');
  });

  test('regular for loop still works', () => {
    const result = compile(`client {
      state items = [1, 2, 3]
      component App {
        <ul>
          for item in items() {
            <li>{item}</li>
          }
        </ul>
      }
    }`);
    expect(result.client).toContain('(item)');
    expect(result.client).toContain('.map(');
  });
});

describe('Feature — dangerouslySetInnerHTML codegen', () => {
  test('innerHTML attribute passes through', () => {
    const result = compile(`client {
      component App {
        <div innerHTML={"<b>bold</b>"} />
      }
    }`);
    expect(result.client).toContain('innerHTML');
  });
});
