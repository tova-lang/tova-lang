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

// ═══════════════════════════════════════════════════════════════
// Shared / Base Codegen Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('Edge — Import with alias', () => {
  test('import { Component as Comp } generates aliased import', () => {
    const code = compileShared('import { Component as Comp } from "react"');
    expect(code).toContain('import { Component as Comp } from "react";');
  });

  test('import with multiple aliases', () => {
    const code = compileShared('import { useState as uS, useEffect as uE } from "react"');
    expect(code).toContain('import { useState as uS, useEffect as uE } from "react";');
  });

  test('import with mixed alias and non-alias', () => {
    const code = compileShared('import { map, filter as f } from "utils"');
    expect(code).toContain('import { map, filter as f } from "utils";');
  });
});

describe('Edge — Named arguments in function calls', () => {
  test('all named arguments compile to single object', () => {
    const code = compileShared('greet(name: "Alice", age: 25)');
    expect(code).toContain('greet({ name: "Alice", age: 25 })');
  });

  test('mixed positional and named arguments', () => {
    const code = compileShared('setup("main", debug: true, verbose: false)');
    expect(code).toContain('setup("main", { debug: true, verbose: false })');
  });
});

describe('Edge — List comprehension without filter', () => {
  test('simple map comprehension (no filter condition)', () => {
    const code = compileShared('x = [n * 2 for n in items]');
    expect(code).toContain('items.map((n) => (n * 2))');
  });

  test('comprehension returning the variable itself optimizes to just filter', () => {
    const code = compileShared('x = [n for n in items if n > 0]');
    // When expression is the loop variable, should optimize to just filter (no .map)
    expect(code).toContain('items.filter((n) => (n > 0))');
  });
});

describe('Edge — Dict comprehension', () => {
  test('basic dict comprehension', () => {
    const code = compileShared('x = {k: v for k, v in pairs}');
    expect(code).toContain('Object.fromEntries(');
    expect(code).toContain('.map(');
    expect(code).toContain('[k, v]');
  });

  test('dict comprehension with condition', () => {
    const code = compileShared('x = {k: v for k, v in pairs if v > 0}');
    expect(code).toContain('Object.fromEntries(');
    expect(code).toContain('.filter(');
    expect(code).toContain('.map(');
  });
});

describe('Edge — Slice with negative indices', () => {
  test('slice with negative start', () => {
    const code = compileShared('x = list[-3:]');
    // Negative index is a unary expression, so it gets wrapped in parens
    expect(code).toContain('.slice((-3))');
  });

  test('slice with negative end', () => {
    const code = compileShared('x = list[:-1]');
    expect(code).toContain('.slice(0, (-1))');
  });

  test('slice with both negative indices', () => {
    const code = compileShared('x = list[-3:-1]');
    expect(code).toContain('.slice((-3), (-1))');
  });
});

describe('Edge — Full slice', () => {
  test('list[:] produces .slice()', () => {
    const code = compileShared('x = list[:]');
    expect(code).toContain('.slice()');
  });
});

describe('Edge — Match with array patterns', () => {
  test('match with array pattern checks array and length', () => {
    const code = compileShared('x = match val { [a, b] => a + b, _ => 0 }');
    expect(code).toContain('Array.isArray(__match)');
    expect(code).toContain('__match.length === 2');
    expect(code).toContain('const a = __match[0]');
    expect(code).toContain('const b = __match[1]');
  });

  test('match with wildcard in array pattern', () => {
    const code = compileShared('x = match val { [_, b] => b, _ => 0 }');
    expect(code).toContain('Array.isArray(__match)');
    expect(code).toContain('__match.length === 2');
    expect(code).toContain('const b = __match[1]');
    // Should not bind _ (wildcard)
    expect(code).not.toContain('const _ = __match[0]');
  });

  test('match with binding pattern', () => {
    const code = compileShared('x = match val { n => n * 2 }');
    expect(code).toContain('const n = __match');
    expect(code).toContain('(n * 2)');
  });
});

describe('Edge — If-expression with elif chains', () => {
  test('if-elif-else expression generates IIFE', () => {
    const code = compileShared('x = if a { 1 } elif b { 2 } elif c { 3 } else { 4 }');
    expect(code).toContain('(() => {');
    expect(code).toContain('if (a)');
    expect(code).toContain('else if (b)');
    expect(code).toContain('else if (c)');
    expect(code).toContain('return 1;');
    expect(code).toContain('return 2;');
    expect(code).toContain('return 3;');
    expect(code).toContain('return 4;');
  });
});

describe('Edge — Pipe chain', () => {
  test('x |> f |> g chains correctly', () => {
    const code = compileShared('x = data |> double |> triple');
    // data |> double => double(data)
    // double(data) |> triple => triple(double(data))
    expect(code).toContain('triple(double(data))');
  });

  test('pipe into function call with extra args', () => {
    const code = compileShared('x = data |> filter(fn(x) x > 0)');
    expect(code).toContain('filter(data,');
  });
});

describe('Edge — Try/catch', () => {
  test('basic try/catch with catch param', () => {
    const code = compileShared('try { risky() } catch e { print(e) }');
    expect(code).toContain('try {');
    expect(code).toContain('risky()');
    expect(code).toContain('catch (e)');
    expect(code).toContain('print(e)');
  });

  test('try/catch without catch param', () => {
    const code = compileShared('try { risky() } catch { fallback() }');
    expect(code).toContain('try {');
    expect(code).toContain('catch (__err)');
    expect(code).toContain('fallback()');
  });
});

describe('Edge — For-else construct', () => {
  test('for-else generates entered flag and conditional', () => {
    const code = compileShared('for x in items { process(x) } else { default_action() }');
    expect(code).toMatch(/__entered_\d+ = false/);
    expect(code).toMatch(/__entered_\d+ = true/);
    expect(code).toMatch(/if \(!__entered_\d+\)/);
    expect(code).toContain('default_action()');
  });
});

describe('Edge — While loop', () => {
  test('while loop generates correct JS', () => {
    const code = compileShared('while x > 0 { x -= 1 }');
    expect(code).toContain('while ((x > 0))');
    expect(code).toContain('x -= 1;');
  });
});

describe('Edge — Object literal shorthand vs explicit', () => {
  test('shorthand object literal {x, y}', () => {
    const code = compileShared('obj = {x, y}');
    expect(code).toContain('{ x, y }');
  });

  test('explicit object literal with string keys', () => {
    const code = compileShared('obj = {"x": 1, "y": 2}');
    expect(code).toContain('"x": 1');
    expect(code).toContain('"y": 2');
  });
});

describe('Edge — Spread in arrays', () => {
  test('spread in array literal', () => {
    const code = compileShared('x = [...items, 4, 5]');
    expect(code).toContain('...items');
    expect(code).toContain(', 4, 5]');
  });

  test('spread at end of array', () => {
    const code = compileShared('x = [1, 2, ...rest]');
    expect(code).toContain('[1, 2, ...rest]');
  });

  test('multiple spreads in array', () => {
    const code = compileShared('x = [...a, ...b]');
    expect(code).toContain('...a');
    expect(code).toContain('...b');
  });
});

describe('Edge — Chained comparison', () => {
  test('1 < x < 10 becomes && chain with temp vars', () => {
    const code = compileShared('x = 1 < y < 10');
    // Uses temp vars to avoid evaluating intermediate operands twice
    expect(code).toMatch(/1 < \(__cmp_\d+ = y\)/);
    expect(code).toMatch(/__cmp_\d+ < 10/);
    expect(code).toContain('&&');
  });

  test('three-way chained comparison', () => {
    const code = compileShared('x = 0 <= y < z <= 100');
    expect(code).toMatch(/0 <= \(__cmp_\d+ = y\)/);
    expect(code).toMatch(/__cmp_\d+ < \(__cmp_\d+ = z\)/);
    expect(code).toMatch(/__cmp_\d+ <= 100/);
    expect(code).toContain('&&');
  });
});

describe('Edge — Membership operators', () => {
  test('x in list uses __contains', () => {
    const code = compileShared('x = a in list');
    expect(code).toContain('__contains(list, a)');
  });

  test('x not in list uses negated __contains', () => {
    const code = compileShared('x = a not in list');
    expect(code).toContain('(!__contains(list, a))');
  });

  test('__contains helper is included when used', () => {
    const code = compileShared('x = a in list');
    expect(code).toContain('function __contains');
  });
});

describe('Edge — Range expressions', () => {
  test('exclusive range 1..10', () => {
    const code = compileShared('x = 1..10');
    expect(code).toContain('Array.from');
    expect(code).toContain('length: (10) - (1)');
  });

  test('inclusive range 1..=10', () => {
    const code = compileShared('x = 1..=10');
    expect(code).toContain('Array.from');
    expect(code).toContain('(10) - (1) + 1');
  });
});

describe('Edge — Optional chaining', () => {
  test('a?.b generates optional chaining', () => {
    const code = compileShared('x = user?.name');
    expect(code).toContain('user?.name');
  });

  test('nested optional chaining', () => {
    const code = compileShared('x = a?.b?.c');
    expect(code).toContain('a?.b?.c');
  });
});

describe('Edge — Null coalescing', () => {
  test('a ?? b generates NaN-safe coalescing', () => {
    const code = compileShared('x = a ?? "default"');
    expect(code).toContain('__tova_v != null && __tova_v === __tova_v');
    expect(code).toContain('"default"');
  });
});

describe('Edge — Unary not', () => {
  test('not x generates !x', () => {
    const code = compileShared('x = not flag');
    expect(code).toContain('(!flag)');
  });

  test('negation with minus', () => {
    const code = compileShared('x = -y');
    expect(code).toContain('(-y)');
  });
});

describe('Edge — Multiple assignment', () => {
  test('a, b = 1, 2 generates destructuring', () => {
    const code = compileShared('a, b = 1, 2');
    expect(code).toContain('const [a, b] = [1, 2];');
  });

  test('swap via multiple assignment (mutable)', () => {
    const code = compileShared('var a = 1\nvar b = 2\na, b = b, a');
    expect(code).toContain('[a, b] = [b, a];');
  });
});

describe('Edge — Let destructuring array', () => {
  test('let [a, b] = pair generates const destructuring', () => {
    const code = compileShared('let [a, b] = pair');
    expect(code).toContain('const [a, b] = pair;');
  });

  test('let with object destructuring', () => {
    const code = compileShared('let { name, age } = user');
    expect(code).toContain('const { name, age } = user;');
  });
});

describe('Edge — Propagate operator', () => {
  test('expr? generates __propagate call', () => {
    const code = compileShared('fn safe() { result? }');
    expect(code).toContain('__propagate(result)');
  });

  test('function with ? gets try/catch wrapper', () => {
    const code = compileShared('fn safe() { result? }');
    expect(code).toContain('try {');
    expect(code).toContain('__tova_propagate');
    expect(code).toContain('catch (__e)');
  });

  test('__propagate helper is included', () => {
    const code = compileShared('fn safe() { result? }');
    expect(code).toContain('function __propagate');
  });
});

describe('Edge — Lambda with block body', () => {
  test('fn lambda with block produces arrow function with body', () => {
    const code = compileShared('f = fn(x) { y = x + 1\ny * 2 }');
    expect(code).toContain('(x) => {');
    expect(code).toContain('const y = (x + 1);');
    expect(code).toContain('return (y * 2);');
  });

  test('arrow lambda produces single-expression arrow', () => {
    const code = compileShared('f = x => x * 2');
    expect(code).toContain('(x) => (x * 2)');
  });

  test('fn lambda with single expression body', () => {
    const code = compileShared('f = fn(a, b) a + b');
    expect(code).toContain('(a, b) => (a + b)');
  });
});

describe('Edge — String template literals', () => {
  test('string interpolation generates template literal', () => {
    const code = compileShared('x = "Hello, {name}!"');
    expect(code).toContain('`Hello, ${name}!`');
  });

  test('multiple interpolations', () => {
    const code = compileShared('x = "{first} {last}"');
    expect(code).toContain('`${first} ${last}`');
  });
});

// ═══════════════════════════════════════════════════════════════
// Server Codegen Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('Edge — Server with route and function', () => {
  test('server block generates Bun.serve and route handler', () => {
    const result = compile('server { fn hello() { "world" } route GET "/hello" => hello }');
    expect(result.server).toContain('Bun.serve(');
    expect(result.server).toContain('function hello()');
    expect(result.server).toContain('__addRoute("GET", "/hello"');
  });

  test('server function generates RPC endpoint', () => {
    const result = compile('server { fn greet(name) { name } }');
    expect(result.server).toContain('function greet(name)');
    expect(result.server).toContain('__addRoute("POST", "/rpc/greet"');
  });
});

describe('Edge — Server with middleware', () => {
  test('middleware declaration generates function and middleware chain', () => {
    const result = compile('server { middleware fn logger(req) { print(req) } fn hello() { "world" } }');
    expect(result.server).toContain('function logger(req)');
    expect(result.server).toContain('__middlewares');
  });
});

describe('Edge — Server model declaration', () => {
  test('model with shared type generates ORM methods', () => {
    const result = compile(`
      shared {
        type Todo { id: Int, title: String, done: Bool }
      }
      server {
        db { driver: "sqlite" }
        model Todo
      }
    `);
    expect(result.server).toContain('Model / ORM');
    expect(result.server).toContain('todos');
    expect(result.server).toContain('CREATE TABLE');
  });
});

// ═══════════════════════════════════════════════════════════════
// Client Codegen Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('Edge — State declaration generates createSignal', () => {
  test('state with initial value', () => {
    const result = compile('client { state count = 0 }');
    expect(result.client).toContain('const [count, setCount] = createSignal(0)');
  });

  test('state with string initial value', () => {
    const result = compile('client { state name = "hello" }');
    expect(result.client).toContain('const [name, setName] = createSignal("hello")');
  });
});

describe('Edge — Computed declaration generates createComputed', () => {
  test('computed depends on state', () => {
    const result = compile('client { state count = 0\ncomputed doubled = count * 2 }');
    expect(result.client).toContain('createComputed(');
    expect(result.client).toContain('count()');
    expect(result.client).toContain('* 2');
  });
});

describe('Edge — Effect declaration generates createEffect', () => {
  test('effect block creates createEffect call', () => {
    const result = compile('client { effect { print("side effect") } }');
    expect(result.client).toContain('createEffect(');
    expect(result.client).toContain('print("side effect")');
  });
});

describe('Edge — Component with JSX generates render function', () => {
  test('basic component with JSX', () => {
    const result = compile('client { component App { <div>"Hello"</div> } }');
    expect(result.client).toContain('function App(');
    expect(result.client).toContain('tova_el("div"');
    expect(result.client).toContain('return');
  });

  test('component with params', () => {
    const result = compile('client { component Greeting(name) { <span>{name}</span> } }');
    expect(result.client).toContain('function Greeting(__props)');
    expect(result.client).toContain('const name = () => __props.name');
  });
});

describe('Edge — Component with style block generates scoped CSS', () => {
  test('style block injects scoped CSS', () => {
    const result = compile(`client {
      component Card {
        style {
          .card { border: 1px solid #ccc; }
        }
        <div class="card">"hello"</div>
      }
    }`);
    expect(result.client).toContain('tova_inject_css(');
    expect(result.client).toContain('.card[data-tova-');
    expect(result.client).toContain('data-tova-');
  });
});

describe('Edge — JSX with event handler (on:click)', () => {
  test('on:click generates onClick prop', () => {
    const result = compile('client { component App { <button on:click={fn() print("clicked")}>"Click"</button> } }');
    expect(result.client).toContain('onClick:');
    expect(result.client).toContain('print("clicked")');
  });
});

describe('Edge — JSX with conditional (if/else)', () => {
  test('JSX if/else generates reactive ternary', () => {
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
    expect(result.client).toContain('() =>');
    expect(result.client).toContain('show()');
    expect(result.client).toContain('?');
    expect(result.client).toContain(':');
  });
});

describe('Edge — JSX with loop (for in)', () => {
  test('JSX for generates reactive .map()', () => {
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
    expect(result.client).toContain('() => items().map(');
    expect(result.client).toContain('(item)');
    expect(result.client).toContain('tova_el("li"');
  });
});

describe('Edge — JSX with bind:value', () => {
  test('bind:value on input generates value prop and onInput', () => {
    const result = compile(`client {
      state name = ""
      component App { <input bind:value={name} /> }
    }`);
    expect(result.client).toContain('value: () => name()');
    expect(result.client).toContain('onInput: (e) => { setName(e.target.value); }');
  });

  test('bind:value on select generates onChange', () => {
    const result = compile(`client {
      state choice = "a"
      component App {
        <select bind:value={choice}>
          <option>"a"</option>
        </select>
      }
    }`);
    expect(result.client).toContain('value: () => choice()');
    expect(result.client).toContain('onChange: (e) => { setChoice(e.target.value); }');
  });
});

describe('Edge — Store declaration generates reactive store', () => {
  test('store with state generates IIFE with getters/setters', () => {
    const result = compile(`client {
      store AppStore {
        state count = 0
        fn increment() { count += 1 }
      }
    }`);
    expect(result.client).toContain('const AppStore = (() => {');
    expect(result.client).toContain('createSignal(0)');
    expect(result.client).toContain('get count()');
    expect(result.client).toContain('set count(v)');
    expect(result.client).toContain('function increment()');
    expect(result.client).toContain('setCount(');
    expect(result.client).toContain('})();');
  });

  test('store with computed generates read-only getter', () => {
    const result = compile(`client {
      store CalcStore {
        state x = 5
        computed doubled = x * 2
      }
    }`);
    expect(result.client).toContain('get doubled()');
    expect(result.client).not.toContain('set doubled');
  });
});
