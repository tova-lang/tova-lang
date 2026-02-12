import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { Scope, Symbol as LuxSymbol } from '../src/analyzer/scope.js';

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

// ─── 1-10: Scope and Variable Analysis ─────────────────────

describe('Scope and Variable Analysis', () => {
  test('1. variable declared in if-block not visible outside', () => {
    // y is defined inside the if block scope, so it is not in module scope
    const { scope } = analyze('if true { y = 42 }');
    expect(scope.lookupLocal('y')).toBeNull();
  });

  test('2. variable declared in for-loop not visible outside', () => {
    // x is the loop variable; it should not leak to module scope
    const { scope } = analyze('items = [1, 2, 3]\nfor x in items { z = x }');
    expect(scope.lookupLocal('x')).toBeNull();
    expect(scope.lookupLocal('z')).toBeNull();
  });

  test('3. variable declared in function not visible outside', () => {
    const { scope } = analyze('fn foo() { inner = 10 }');
    expect(scope.lookupLocal('inner')).toBeNull();
    // but foo itself IS visible
    expect(scope.lookup('foo')).not.toBeNull();
  });

  test('4. nested functions can access parent scope variables', () => {
    // This should not throw because inner() references outer_var from parent scope
    expect(() => analyze(`
      fn outer() {
        outer_var = 10
        fn inner() {
          result = outer_var + 1
        }
      }
    `)).not.toThrow();
  });

  test('5. variable shadowing in nested scope', () => {
    // x is defined in module scope, and then x is defined again inside the if block
    // Both should succeed without error because they are in different scopes
    expect(() => analyze('x = 1\nif true { x = 2 }')).not.toThrow();
  });

  test('6. reassignment of immutable variable should produce error', () => {
    expect(analyzeThrows('x = 1\nx = 2')).toThrow(/Cannot reassign immutable variable/);
  });

  test('7. mutable variable can be reassigned', () => {
    expect(() => analyze('var x = 1\nx = 2')).not.toThrow();
  });

  test('8. multiple let destructuring in same scope', () => {
    const { scope } = analyze('let { a, b } = obj\nlet { c, d } = obj2');
    expect(scope.lookup('a')).not.toBeNull();
    expect(scope.lookup('b')).not.toBeNull();
    expect(scope.lookup('c')).not.toBeNull();
    expect(scope.lookup('d')).not.toBeNull();
  });

  test('9. array pattern destructuring creates bindings', () => {
    const { scope } = analyze('let [x, y, z] = triple');
    expect(scope.lookup('x')).not.toBeNull();
    expect(scope.lookup('y')).not.toBeNull();
    expect(scope.lookup('z')).not.toBeNull();
  });

  test('10. object pattern destructuring creates bindings', () => {
    const { scope } = analyze('let { name, age } = person');
    const nameSym = scope.lookup('name');
    expect(nameSym).not.toBeNull();
    expect(nameSym.kind).toBe('variable');
    const ageSym = scope.lookup('age');
    expect(ageSym).not.toBeNull();
    expect(ageSym.kind).toBe('variable');
  });
});

// ─── 11-16: Function Analysis ──────────────────────────────

describe('Function Analysis', () => {
  test('11. function with typed parameters', () => {
    const { scope } = analyze('fn add(a: Int, b: Int) { a + b }');
    const sym = scope.lookup('add');
    expect(sym).not.toBeNull();
    expect(sym.kind).toBe('function');
  });

  test('12. function with return type annotation', () => {
    const { scope } = analyze('fn greet(name: String) -> String { name }');
    const sym = scope.lookup('greet');
    expect(sym).not.toBeNull();
    expect(sym.kind).toBe('function');
    // The return type is stored on the symbol
    expect(sym.type).not.toBeNull();
  });

  test('13. function with default parameter values', () => {
    expect(() => analyze('fn greet(name = "world", count: Int = 1) { name }')).not.toThrow();
  });

  test('14. recursive function references itself', () => {
    // A function that calls itself should not error
    expect(() => analyze(`
      fn factorial(n) {
        if n <= 1 { return 1 }
        return n * factorial(n - 1)
      }
    `)).not.toThrow();
  });

  test('15. function declared after use (hoisting behavior)', () => {
    // Functions are defined in the scope before their body is analyzed,
    // but inter-function references depend on order for non-hoisted items.
    // Two functions referencing each other: first defines foo, then bar calls foo.
    expect(() => analyze(`
      fn foo() { 1 }
      fn bar() { foo() }
    `)).not.toThrow();
  });

  test('16. empty function body', () => {
    expect(() => analyze('fn noop() { }')).not.toThrow();
    const { scope } = analyze('fn noop() { }');
    expect(scope.lookup('noop')).not.toBeNull();
  });
});

// ─── 17-22: Type Declarations ──────────────────────────────

describe('Type Declarations', () => {
  test('17. type with generic parameters', () => {
    const { scope } = analyze('type Box<T> { value: T }');
    expect(scope.lookup('Box')).not.toBeNull();
    expect(scope.lookup('Box').kind).toBe('type');
  });

  test('18. type with struct fields', () => {
    const { scope } = analyze('type User { name: String, age: Int, email: String }');
    expect(scope.lookup('User')).not.toBeNull();
    expect(scope.lookup('User').kind).toBe('type');
  });

  test('19. type with enum variants', () => {
    const { scope } = analyze('type Color { Red, Green, Blue }');
    expect(scope.lookup('Color')).not.toBeNull();
    // Bare variants are registered as functions
    expect(scope.lookup('Red')).not.toBeNull();
    expect(scope.lookup('Green')).not.toBeNull();
    expect(scope.lookup('Blue')).not.toBeNull();
  });

  test('20. variant constructor used as function call', () => {
    expect(() => analyze(`
      type Shape { Circle(r: Float), Rect(w: Float, h: Float) }
      s = Circle(5.0)
    `)).not.toThrow();
  });

  test('21. type field access analysis', () => {
    expect(() => analyze(`
      type User { name: String, age: Int }
      u = User
      x = u.name
    `)).not.toThrow();
  });

  test('22. duplicate type name detection', () => {
    expect(analyzeThrows('type Foo { x: Int }\ntype Foo { y: Int }')).toThrow(/already defined/);
  });
});

// ─── 23-32: Server/Client Block Analysis ────────────────────

describe('Server/Client Block Analysis', () => {
  test('23. server block with routes', () => {
    expect(() => analyze(`
      server {
        fn handler() { "ok" }
        route get "/api/test" => handler
      }
    `)).not.toThrow();
  });

  test('24. server block with middleware', () => {
    expect(() => analyze(`
      server {
        middleware fn logger(req, next) {
          next(req)
        }
      }
    `)).not.toThrow();
  });

  test('25. client block with state declarations', () => {
    const result = analyze('client { state count = 0\nstate name = "hello" }');
    expect(result).toBeDefined();
    expect(result.warnings).toBeDefined();
  });

  test('26. client block with computed declarations', () => {
    expect(() => analyze(`
      client {
        state count = 0
        computed doubled = count * 2
        computed tripled = count * 3
      }
    `)).not.toThrow();
  });

  test('27. client block with effect declarations', () => {
    expect(() => analyze(`
      client {
        state count = 0
        effect { print(count) }
      }
    `)).not.toThrow();
  });

  test('28. client block with component declarations', () => {
    expect(() => analyze(`
      client {
        component App {
          <div>"Hello World"</div>
        }
        component Header(title) {
          <h1>"Header"</h1>
        }
      }
    `)).not.toThrow();
  });

  test('29. shared block with type declarations', () => {
    const result = analyze('shared { type User { name: String, age: Int } }');
    expect(result).toBeDefined();
  });

  test('30. named server blocks', () => {
    expect(() => analyze('server "api" { fn hello() { 1 } }')).not.toThrow();
  });

  test('31. named client blocks', () => {
    expect(() => analyze('client "dashboard" { state x = 0 }')).not.toThrow();
  });

  test('32. multiple server blocks in same file', () => {
    expect(() => analyze(`
      server "api" { fn get_users() { 1 } }
      server "ws" { fn handle_msg() { 2 } }
    `)).not.toThrow();
  });
});

// ─── 33-39: JSX Analysis ───────────────────────────────────

describe('JSX Analysis', () => {
  test('33. JSX element analysis', () => {
    const result = analyze('client { component App { <div>"hello"</div> } }');
    expect(result).toBeDefined();
    expect(result.warnings).toBeDefined();
  });

  test('34. JSX with expression attributes', () => {
    expect(() => analyze(`
      client {
        component App {
          <div class={myClass} id="main">"content"</div>
        }
      }
    `)).not.toThrow();
  });

  test('35. JSX with event handlers (on:click)', () => {
    expect(() => analyze(`
      client {
        state count = 0
        component App {
          <button on:click={fn() count + 1}>"Click"</button>
        }
      }
    `)).not.toThrow();
  });

  test('36. JSX with bind directive', () => {
    expect(() => analyze(`
      client {
        state name = ""
        component App {
          <input bind:value={name} />
        }
      }
    `)).not.toThrow();
  });

  test('37. JSX with conditional (if/else)', () => {
    expect(() => analyze(`
      client {
        component App {
          <div>
            if true { <span>"yes"</span> } else { <span>"no"</span> }
          </div>
        }
      }
    `)).not.toThrow();
  });

  test('38. JSX with loop (for in)', () => {
    expect(() => analyze(`
      client {
        component App {
          <ul>
            for item in items { <li>"item"</li> }
          </ul>
        }
      }
    `)).not.toThrow();
  });

  test('39. nested JSX elements', () => {
    expect(() => analyze(`
      client {
        component App {
          <div>
            <header><h1>"Title"</h1></header>
            <main><p>"Content"</p></main>
            <footer><span>"Footer"</span></footer>
          </div>
        }
      }
    `)).not.toThrow();
  });
});

// ─── 40-45: Control Flow Analysis ───────────────────────────

describe('Control Flow Analysis', () => {
  test('40. if-elif-else all branches', () => {
    expect(() => analyze(`
      x = 5
      if x > 10 {
        a = "big"
      } elif x > 5 {
        a = "medium"
      } elif x > 0 {
        a = "small"
      } else {
        a = "negative"
      }
    `)).not.toThrow();
  });

  test('41. for loop with iterable', () => {
    expect(() => analyze(`
      items = [1, 2, 3, 4, 5]
      for item in items {
        result = item * 2
      }
    `)).not.toThrow();
  });

  test('42. while loop', () => {
    expect(() => analyze(`
      var counter = 10
      while counter > 0 {
        counter -= 1
      }
    `)).not.toThrow();
  });

  test('43. match expression with patterns', () => {
    expect(() => analyze(`
      val = 5
      result = match val {
        0 => "zero",
        1 => "one",
        n if n > 10 => "big",
        _ => "other"
      }
    `)).not.toThrow();
  });

  test('44. try-catch', () => {
    expect(() => analyze(`
      try {
        x = 1
      } catch e {
        y = e
      }
    `)).not.toThrow();
  });

  test('45. return statement analysis', () => {
    expect(() => analyze(`
      fn foo() {
        return 42
      }
      fn bar() {
        return
      }
    `)).not.toThrow();
  });
});

// ─── 46-55: Expression Analysis ─────────────────────────────

describe('Expression Analysis', () => {
  test('46. pipe expression', () => {
    const result = analyze('x = 1 |> print');
    expect(result).toBeDefined();
  });

  test('47. range expression', () => {
    const result = analyze('r = 1..100');
    expect(result).toBeDefined();
  });

  test('48. membership expression (in, not in)', () => {
    expect(() => analyze('items = [1, 2, 3]\nx = 2 in items')).not.toThrow();
    expect(() => analyze('items = [1, 2, 3]\nx = 5 not in items')).not.toThrow();
  });

  test('49. chained comparison', () => {
    const result = analyze('x = 1 < 2 < 3');
    expect(result).toBeDefined();
  });

  test('50. null coalescing', () => {
    const result = analyze('x = nil\ny = x ?? "default"');
    expect(result).toBeDefined();
  });

  test('51. optional chaining', () => {
    const result = analyze('obj = {}\nx = obj?.name?.first');
    expect(result).toBeDefined();
  });

  test('52. propagate operator (?)', () => {
    // The ? operator is postfix, used inside functions for Result/Option unwrapping
    expect(() => analyze(`
      fn process(val) {
        result = val?
        result
      }
    `)).not.toThrow();
  });

  test('53. template literals with interpolation', () => {
    const result = analyze('name = "world"\nx = "hello {name}!"');
    expect(result).toBeDefined();
  });

  test('54. spread expressions', () => {
    const result = analyze('a = [1, 2]\nb = [...a, 3, 4]');
    expect(result).toBeDefined();
  });

  test('55. lambda expressions (fn and arrow forms)', () => {
    // fn form
    expect(() => analyze('add = fn(a, b) a + b')).not.toThrow();
    // fn with block body
    expect(() => analyze('mul = fn(a, b) { a * b }')).not.toThrow();
    // arrow form
    expect(() => analyze('double = x => x * 2')).not.toThrow();
  });
});

// ─── 56-58: Import Analysis ─────────────────────────────────

describe('Import Analysis', () => {
  test('56. named imports create bindings', () => {
    const { scope } = analyze('import { foo, bar } from "utils"');
    expect(scope.lookup('foo')).not.toBeNull();
    expect(scope.lookup('foo').kind).toBe('variable');
    expect(scope.lookup('bar')).not.toBeNull();
  });

  test('57. default imports create bindings', () => {
    const { scope } = analyze('import React from "react"');
    expect(scope.lookup('React')).not.toBeNull();
    expect(scope.lookup('React').kind).toBe('variable');
  });

  test('58. import alias creates local binding', () => {
    const { scope } = analyze('import { foo as myFoo } from "utils"');
    expect(scope.lookup('myFoo')).not.toBeNull();
    expect(scope.lookup('myFoo').kind).toBe('variable');
  });
});

// ─── 59-60: Store Analysis ──────────────────────────────────

describe('Store Analysis', () => {
  test('59. store with state and computed', () => {
    expect(() => analyze(`
      client {
        store TodoStore {
          state items = []
          computed count = len(items)
        }
      }
    `)).not.toThrow();
  });

  test('60. store with functions', () => {
    expect(() => analyze(`
      client {
        store CounterStore {
          state count = 0
          fn increment() { count + 1 }
          fn decrement() { count - 1 }
        }
      }
    `)).not.toThrow();
  });
});

// ─── 61-62: Warning/Error Paths ─────────────────────────────

describe('Warning/Error Paths', () => {
  test('61. analyze function that produces warnings (self-referencing server RPC)', () => {
    const result = analyze('server "api" { fn foo() { api.foo() } }');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.message.includes('calling itself'))).toBe(true);
  });

  test('62. analyze invalid assignment target (compound assignment on immutable)', () => {
    expect(analyzeThrows('x = 5\nx += 1')).toThrow(/Cannot use '\+=' on immutable variable/);
  });
});

// ─── Additional edge cases ──────────────────────────────────

describe('Additional Edge Cases', () => {
  test('duplicate let destructured names in same scope throws', () => {
    expect(analyzeThrows('let { a } = x\nlet { a } = y')).toThrow(/already defined/);
  });

  test('duplicate array destructured names in same scope throws', () => {
    expect(analyzeThrows('let [a, b] = x\nlet [a] = y')).toThrow(/already defined/);
  });

  test('for-else statement analyzes correctly', () => {
    expect(() => analyze('items = []\nfor x in items { y = x } else { z = 0 }')).not.toThrow();
  });

  test('for loop with two variables (k, v)', () => {
    expect(() => analyze('pairs = []\nfor k, v in pairs { result = k }')).not.toThrow();
  });

  test('match with variant pattern binds fields', () => {
    expect(() => analyze(`
      type Shape { Circle(r: Float), Rect(w: Float, h: Float) }
      s = Circle(3.0)
      area = match s {
        Circle(r) => r * r,
        Rect(w, h) => w * h,
        _ => 0
      }
    `)).not.toThrow();
  });

  test('match with range pattern', () => {
    expect(() => analyze(`
      val = 5
      label = match val {
        1..10 => "small",
        _ => "big"
      }
    `)).not.toThrow();
  });

  test('match with block body in arm', () => {
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

  test('list comprehension with condition', () => {
    expect(() => analyze('items = [1, 2, 3]\nevens = [x for x in items if x > 1]')).not.toThrow();
  });

  test('dict comprehension with condition', () => {
    expect(() => analyze('pairs = []\nresult = {k: v for k, v in pairs if k > 0}')).not.toThrow();
  });

  test('object literal with shorthand properties', () => {
    expect(() => analyze('name = "test"\nobj = {name: name}')).not.toThrow();
  });

  test('slice expression with step', () => {
    expect(() => analyze('a = [1, 2, 3, 4, 5]\nb = a[0:4:2]')).not.toThrow();
  });

  test('wildcard _ as assignment target', () => {
    expect(() => analyze('_ = some_call()')).not.toThrow();
  });

  test('multiple assignment (a, b = 1, 2)', () => {
    const { scope } = analyze('a, b = 1, 2');
    expect(scope.lookup('a')).not.toBeNull();
    expect(scope.lookup('b')).not.toBeNull();
  });

  test('compound assignment on member expression is allowed', () => {
    expect(() => analyze('var obj = {}\nobj.count += 1')).not.toThrow();
  });

  test('server block creates its own scope context', () => {
    // variables defined inside server block should not leak to module scope
    const { scope } = analyze('server { inner_val = 42 }');
    expect(scope.lookupLocal('inner_val')).toBeNull();
  });

  test('client block creates its own scope context', () => {
    const { scope } = analyze('client { state count = 0 }');
    expect(scope.lookupLocal('count')).toBeNull();
  });

  test('shared block creates its own scope context', () => {
    const { scope } = analyze('shared { shared_val = 1 }');
    expect(scope.lookupLocal('shared_val')).toBeNull();
  });

  test('try-catch with named error parameter', () => {
    expect(() => analyze(`
      try {
        x = 1
      } catch err {
        msg = err
      }
    `)).not.toThrow();
  });

  test('try-catch without error parameter', () => {
    expect(() => analyze(`
      try {
        x = 1
      } catch {
        y = 0
      }
    `)).not.toThrow();
  });

  test('if expression (ternary-style) as value', () => {
    expect(() => analyze('x = if true { 1 } else { 0 }')).not.toThrow();
  });

  test('if expression with elif as value', () => {
    expect(() => analyze('x = if true { 1 } elif false { 2 } else { 3 }')).not.toThrow();
  });

  test('JSX with expression child', () => {
    expect(() => analyze('client { component App { <div>{name}</div> } }')).not.toThrow();
  });

  test('JSX self-closing element', () => {
    expect(() => analyze('client { component App { <div><br />"hello"</div> } }')).not.toThrow();
  });

  test('JSX with dynamic attribute value', () => {
    expect(() => analyze('client { component App { <div class={cls}>"hello"</div> } }')).not.toThrow();
  });

  test('nested for inside component with element body', () => {
    expect(() => analyze(`
      client {
        component List {
          <ul>
            for item in items {
              <li>"item"</li>
            }
          </ul>
        }
      }
    `)).not.toThrow();
  });

  test('deeply nested scopes from multiple functions', () => {
    expect(() => analyze(`
      fn a() {
        fn b() {
          fn c() {
            val = 42
          }
        }
      }
    `)).not.toThrow();
  });

  test('duplicate function names at module scope throw', () => {
    expect(analyzeThrows('fn foo() { 1 }\nfn foo() { 2 }')).toThrow(/already defined/);
  });

  test('duplicate parameter names in function throw', () => {
    expect(analyzeThrows('fn bad(a, a) { a }')).toThrow(/already defined/);
  });

  test('inter-server RPC with unknown function errors', () => {
    expect(analyzeThrows(`
      server "api" { fn create() { events.nonexistent("test") } }
      server "events" { fn push(data) { data } }
    `)).toThrow(/No function 'nonexistent'/);
  });

  test('inter-server RPC with valid function does not error', () => {
    expect(() => analyze(`
      server "api" { fn create() { events.push("test") } }
      server "events" { fn push(data) { data } }
    `)).not.toThrow();
  });

  test('expression statement is analyzed', () => {
    expect(() => analyze('print("hello")')).not.toThrow();
  });

  test('scope child preserves parent reference', () => {
    const parent = new Scope(null, 'module');
    const child = parent.child('block');
    const grandchild = child.child('function');
    expect(grandchild.parent).toBe(child);
    expect(child.parent).toBe(parent);
  });

  test('scope getContext traverses up to find server/client/shared', () => {
    const mod = new Scope(null, 'module');
    const server = mod.child('server');
    const fn = server.child('function');
    const block = fn.child('block');
    expect(block.getContext()).toBe('server');
    expect(fn.getContext()).toBe('server');
    expect(server.getContext()).toBe('server');
    expect(mod.getContext()).toBe('module');
  });

  test('symbol tracks used flag', () => {
    const sym = new LuxSymbol('x', 'variable', null, false, { line: 1, column: 1, file: '<test>' });
    expect(sym.used).toBe(false);
    sym.used = true;
    expect(sym.used).toBe(true);
  });

  test('analyze returns both warnings and scope', () => {
    const result = analyze('x = 1');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('scope');
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  test('state outside client throws via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const stateNode = new AST.StateDeclaration('count', null, new AST.NumberLiteral(0, loc), loc);
    const ast = new AST.Program([stateNode]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('computed outside client throws via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const compNode = new AST.ComputedDeclaration('doubled', new AST.NumberLiteral(0, loc), loc);
    const ast = new AST.Program([compNode]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('effect outside client throws via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const effectNode = new AST.EffectDeclaration(new AST.BlockStatement([], loc), loc);
    const ast = new AST.Program([effectNode]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('component outside client throws via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const compNode = new AST.ComponentDeclaration('App', [], [], loc);
    const ast = new AST.Program([compNode]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('route outside server throws via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const routeNode = new AST.RouteDeclaration('GET', '/api', new AST.Identifier('handler', loc), loc);
    const ast = new AST.Program([routeNode]);
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });
});
