import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { BaseCodegen } from '../src/codegen/base-codegen.js';
import * as AST from '../src/parser/ast.js';

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

function compileClient(source) {
  return compile(source).client;
}

function compileServer(source) {
  return compile(source).server;
}

// ============================================================
// base-codegen.js coverage
// ============================================================

describe('Codegen Coverage — Multiple assignment swap (line 126/152-154)', () => {
  test('swap of already-declared vars uses bare destructured assignment', () => {
    const code = compileShared('var a = 1\nvar b = 2\na, b = b, a');
    expect(code).toContain('let a = 1;');
    expect(code).toContain('let b = 2;');
    expect(code).toContain('[a, b] = [b, a];');
    // Must NOT re-declare with const
    expect(code).not.toContain('const [a, b]');
  });
});

describe('Codegen Coverage — Discard pattern assignment (line 137-138)', () => {
  test('assignment to _ emits bare expression without declaration', () => {
    const code = compileShared('_ = print("hello")');
    expect(code).toContain('print("hello");');
    // Must NOT declare const _
    expect(code).not.toContain('const _');
  });
});

describe('Codegen Coverage — Multi-target var declaration (lines 166-172)', () => {
  test('var a, b = 1, 2 produces two let declarations', () => {
    const code = compileShared('var a, b = 1, 2');
    expect(code).toContain('let a = 1;');
    expect(code).toContain('let b = 2;');
  });

  test('var a, b, c = 10, 20, 30 produces three let declarations', () => {
    const code = compileShared('var a, b, c = 10, 20, 30');
    expect(code).toContain('let a = 10;');
    expect(code).toContain('let b = 20;');
    expect(code).toContain('let c = 30;');
  });
});

describe('Codegen Coverage — LetDestructure patterns (lines 176-192)', () => {
  test('object destructure with rename: let { x: y } = obj', () => {
    const code = compileShared('let { x: y } = obj');
    expect(code).toContain('const { x: y } = obj;');
  });

  test('object destructure with default: let { x = 10 } = obj', () => {
    const code = compileShared('let { x = 10 } = obj');
    expect(code).toContain('const { x = 10 } = obj;');
  });

  test('object destructure with rename and default: let { x: y = 5 } = obj', () => {
    const code = compileShared('let { x: y = 5 } = obj');
    expect(code).toContain('const { x: y = 5 } = obj;');
  });

  test('array destructure: let [a, b] = pair', () => {
    const code = compileShared('let [a, b] = pair');
    expect(code).toContain('const [a, b] = pair;');
  });

  test('array destructure with skip: let [a, _, c] = triple', () => {
    const code = compileShared('let [a, _, c] = triple');
    expect(code).toContain('const [a, , c] = triple;');
  });
});

describe('Codegen Coverage — Type variant with zero fields (line 224-225)', () => {
  test('bare variant generates Object.freeze', () => {
    const code = compileShared('type Option { Some(value: Any), None }');
    expect(code).toContain('function Some(value)');
    expect(code).toContain('__tag: "Some"');
    expect(code).toContain('const None = Object.freeze({ __tag: "None" });');
  });
});

describe('Codegen Coverage — Standalone return (line 360)', () => {
  test('return without value emits return;', () => {
    const code = compileShared('fn foo() { return }');
    expect(code).toContain('return;');
  });
});

describe('Codegen Coverage — Mixed positional and named args (lines 478-489)', () => {
  test('foo(1, 2, x: 3, y: 4) compiles to trailing object', () => {
    const code = compileShared('foo(1, 2, x: 3, y: 4)');
    expect(code).toContain('foo(1, 2, { x: 3, y: 4 })');
  });

  test('bar(a, name: "hello") compiles to positional + trailing named object', () => {
    const code = compileShared('bar(a, name: "hello")');
    expect(code).toContain('bar(a, { name: "hello" })');
  });
});

describe('Codegen Coverage — Optional chain computed property (line 506-507)', () => {
  test('computed optional chain generates ?.[key]', () => {
    // The parser does not produce computed optional chains from source,
    // so we construct the AST directly to test the codegen path.
    const gen = new BaseCodegen();
    const node = new AST.OptionalChain(
      new AST.Identifier('obj', {}),
      new AST.Identifier('key', {}),
      true,  // computed
      {}
    );
    const result = gen.genExpression(node);
    expect(result).toBe('obj?.[key]');
  });
});

describe('Codegen Coverage — Lambda with block body (lines 533-538)', () => {
  test('lambda with block body generates arrow with braces', () => {
    const code = compileShared('x = fn(a) { b = a + 1\nb }');
    expect(code).toContain('(a) => {');
    expect(code).toContain('const b = (a + 1);');
    expect(code).toContain('return b;');
  });
});

describe('Codegen Coverage — Lambda with statement body (lines 542-549)', () => {
  test('lambda with var declaration body generates inline block (AST-level test)', () => {
    // The parser does not allow `var` in lambda expression position,
    // so we construct the AST directly to test the codegen path.
    const gen = new BaseCodegen();
    const node = new AST.LambdaExpression(
      [new AST.Parameter('a', null, null, {})],
      new AST.VarDeclaration(['b'], [new AST.NumberLiteral(1, {})], {}),
      {}
    );
    const result = gen.genExpression(node);
    expect(result).toContain('(a) => { let b = 1; }');
  });

  test('lambda with compound assignment body', () => {
    const code = compileShared('var total = 0\nx = fn(a) total += a');
    expect(code).toContain('(a) => { total += a; }');
  });

  test('lambda with assignment body', () => {
    const code = compileShared('var result = 0\nx = fn(a) result = a');
    expect(code).toContain('(a) => { result = a; }');
  });
});

describe('Codegen Coverage — Match with binding pattern (lines 570-577)', () => {
  test('match with binding pattern binds subject to variable', () => {
    const code = compileShared('x = match val { n => n + 1, _ => 0 }');
    expect(code).toContain('const n = __match');
    expect(code).toContain('return (n + 1);');
    expect(code).toContain('return 0;');
  });

  test('match with binding pattern as default (last arm)', () => {
    const code = compileShared('x = match val { 1 => "one", n => n + 1 }');
    expect(code).toContain('__match === 1');
    expect(code).toContain('const n = __match');
    expect(code).toContain('return (n + 1);');
  });
});

describe('Codegen Coverage — Match with block body (lines 573-574, 589-590)', () => {
  test('match arm with block body generates block statements', () => {
    const code = compileShared('x = match val { 1 => { y = 1\ny + 2 }, _ => 0 }');
    expect(code).toContain('__match === 1');
    expect(code).toContain('const y = 1;');
    // The last expression in a block arm is not automatically returned by genBlockStatements
    // but let's check the generated output
    expect(code).toContain('(y + 2);');
    expect(code).toContain('return 0;');
  });

  test('match with binding pattern and block body as default arm', () => {
    const code = compileShared('x = match val { 1 => "one", n => { y = n + 1\ny * 2 } }');
    expect(code).toContain('const n = __match');
    expect(code).toContain('const y = (n + 1);');
  });
});

describe('Codegen Coverage — Match with range pattern (lines 645-649)', () => {
  test('inclusive range pattern generates >= and <=', () => {
    const code = compileShared('x = match n { 1..=5 => "small", _ => "other" }');
    expect(code).toContain('>= 1');
    expect(code).toContain('<= 5');
    expect(code).toContain('return "small"');
    expect(code).toContain('return "other"');
  });

  test('exclusive range pattern generates >= and <', () => {
    const code = compileShared('x = match n { 1..10 => "range", _ => "out" }');
    expect(code).toContain('>= 1');
    expect(code).toContain('< 10');
  });
});

describe('Codegen Coverage — Match with guard and binding pattern (line 667-668)', () => {
  test('binding pattern with guard uses IIFE for binding', () => {
    const code = compileShared('x = match n { x if x > 10 => "big", _ => "small" }');
    // For a binding pattern with guard, the condition wraps in an IIFE
    expect(code).toContain('((x) =>');
    expect(code).toContain('> 10');
    expect(code).toContain('(__match)');
    expect(code).toContain('return "big"');
    expect(code).toContain('return "small"');
  });
});

describe('Codegen Coverage — Object literal (lines 695-701)', () => {
  test('object literal with key-value pairs', () => {
    const code = compileShared('x = {a: 1, b: 2}');
    expect(code).toContain('{ a: 1, b: 2 }');
  });

  test('object literal with shorthand properties', () => {
    const code = compileShared('x = {a, b}');
    expect(code).toContain('{ a, b }');
  });
});

describe('Codegen Coverage — Dict comprehension (lines 717-729)', () => {
  test('basic dict comprehension uses Object.fromEntries', () => {
    const code = compileShared('{k: v for k, v in pairs}');
    expect(code).toContain('Object.fromEntries(');
    expect(code).toContain('.map(');
    expect(code).toContain('[k, v]');
  });

  test('dict comprehension with filter uses .filter', () => {
    const code = compileShared('{k: k * 2 for k in items if k > 0}');
    expect(code).toContain('Object.fromEntries(');
    expect(code).toContain('.filter(');
    expect(code).toContain('.map(');
    expect(code).toContain('(k > 0)');
  });

  test('dict comprehension with single variable', () => {
    const code = compileShared('{k: k for k in items}');
    expect(code).toContain('Object.fromEntries(');
    expect(code).toContain('.map((k) => [k, k])');
  });
});

describe('Codegen Coverage — Range expression inclusive (line 736-737)', () => {
  test('inclusive range 1..=10 generates Array.from with + 1', () => {
    const code = compileShared('x = 1..=10');
    expect(code).toContain('Array.from');
    expect(code).toContain('10 - 1 + 1');
  });
});

// ============================================================
// client-codegen.js coverage
// ============================================================

describe('Codegen Coverage — Client compound assignment to state (lines 14-19)', () => {
  test('count += 1 in effect becomes setCount with prev', () => {
    const result = compile('client { state count = 0\neffect { count += 1 } }');
    expect(result.client).toContain('setCount(__prev => __prev + 1);');
  });

  test('count -= 5 in effect becomes setCount with prev', () => {
    const result = compile('client { state count = 10\neffect { count -= 5 } }');
    expect(result.client).toContain('setCount(__prev => __prev - 5);');
  });
});

describe('Codegen Coverage — Client direct assignment to state (lines 22-27)', () => {
  test('count = 5 in effect becomes setCount(5)', () => {
    const result = compile('client { state count = 0\neffect { count = 5 } }');
    expect(result.client).toContain('setCount(5);');
  });

  test('name = "Alice" in effect becomes setName("Alice")', () => {
    const result = compile('client { state name = "world"\neffect { name = "Alice" } }');
    expect(result.client).toContain('setName("Alice");');
  });
});

describe('Codegen Coverage — Client lambda with block body (lines 37-42)', () => {
  test('lambda with block body in client component', () => {
    const result = compile('client { state count = 0\ncomponent App { <button on:click={fn() { count += 1\nprint(count) }}>"Click"</button> } }');
    expect(result.client).toContain('() => {');
    expect(result.client).toContain('setCount(__prev => __prev + 1);');
  });
});

describe('Codegen Coverage — Client lambda compound assignment to state (lines 46-51)', () => {
  test('fn() count += 1 in lambda becomes setter with prev', () => {
    const result = compile('client { state count = 0\ncomponent App { <button on:click={fn() count += 1}>"+"</button> } }');
    expect(result.client).toContain('() => { setCount(__prev => __prev + 1); }');
  });
});

describe('Codegen Coverage — Client lambda assignment to state (lines 55-59)', () => {
  test('fn() count = 0 in lambda becomes setter call', () => {
    const result = compile('client { state count = 0\ncomponent App { <button on:click={fn() count = 0}>"Reset"</button> } }');
    expect(result.client).toContain('() => { setCount(0); }');
  });
});

describe('Codegen Coverage — Client lambda with non-state body (lines 63-67)', () => {
  test('fn() x = 1 in lambda with non-state var generates inline block', () => {
    const result = compile('client { component App { <button on:click={fn() x = 1}>"Test"</button> } }');
    expect(result.client).toContain('() => { const x = 1; }');
  });
});

describe('Codegen Coverage — Client other statements (line 141-142)', () => {
  test('state assignment outside effect/component becomes setter', () => {
    const result = compile('client { state x = 0\nx = 5 }');
    expect(result.client).toContain('setX(5);');
  });

  test('non-state other statement in client block', () => {
    const result = compile('client { y = 42 }');
    expect(result.client).toContain('const y = 42;');
  });
});

describe('Codegen Coverage — Client __contains helper (lines 168-171)', () => {
  test('membership expression in client triggers __contains helper', () => {
    const result = compile('client { state items = []\neffect { x = 1 in items } }');
    expect(result.client).toContain('__contains(items, 1)');
    expect(result.client).toContain('function __contains');
  });
});

describe('Codegen Coverage — Component with statements and JSX (lines 201-208)', () => {
  test('component with function declaration before JSX', () => {
    const result = compile('client { component App { fn helper() { 1 }\n<div>"hello"</div> } }');
    expect(result.client).toContain('function App(');
    expect(result.client).toContain('function helper()');
    expect(result.client).toContain('return lux_el("div"');
  });
});

describe('Codegen Coverage — Component with multiple JSX roots (lines 214-216)', () => {
  test('multiple root elements wrap in lux_fragment', () => {
    const result = compile('client { component App { <div>"a"</div>\n<span>"b"</span> } }');
    expect(result.client).toContain('lux_fragment(');
    expect(result.client).toContain('lux_el("div"');
    expect(result.client).toContain('lux_el("span"');
  });
});

describe('Codegen Coverage — JSXExpression and JSXFor (lines 230, 232)', () => {
  test('JSXExpression renders expression directly', () => {
    const result = compile('client { state count = 0\ncomponent App { <div>{count}</div> } }');
    expect(result.client).toContain('lux_el("div"');
    expect(result.client).toContain('count');
  });

  test('JSXFor generates .map call', () => {
    const result = compile('client { component App { <ul>for item in items { <li>"item"</li> }</ul> } }');
    expect(result.client).toContain('.map(');
    expect(result.client).toContain('(item) =>');
    expect(result.client).toContain('lux_el("li"');
  });
});

describe('Codegen Coverage — JSX attributes and events (lines 245-260)', () => {
  test('class attribute becomes className', () => {
    const result = compile('client { component App { <button class="btn">"Click"</button> } }');
    expect(result.client).toContain('className: "btn"');
  });

  test('on:click attribute becomes onClick', () => {
    const result = compile('client { component App { <button on:click={handler}>"Click"</button> } }');
    expect(result.client).toContain('onClick: handler');
  });

  test('combined attributes and events', () => {
    const result = compile('client { component App { <button class="btn" on:click={handler}>"Go"</button> } }');
    expect(result.client).toContain('className: "btn"');
    expect(result.client).toContain('onClick: handler');
  });
});

describe('Codegen Coverage — Self-closing JSX (line 265-266)', () => {
  test('self-closing tag generates element without children', () => {
    const result = compile('client { component App { <input disabled /> } }');
    expect(result.client).toContain('lux_el("input"');
    expect(result.client).toContain('disabled: true');
    // Self-closing tag should NOT have children array
    expect(result.client).not.toContain('[])');
  });
});

describe('Codegen Coverage — JSXText with template literal (lines 276-279)', () => {
  test('template string in JSX generates template literal', () => {
    const result = compile('client { state name = "world"\ncomponent App { <div>"Hello, {name}!"</div> } }');
    expect(result.client).toContain('`Hello, ${name}!`');
  });
});

describe('Codegen Coverage — JSXFor with multiple children (lines 283-291)', () => {
  test('for loop with multiple children wraps in lux_fragment', () => {
    const result = compile('client { component App { <div>for item in items { <span>"a"</span>\n<span>"b"</span> }</div> } }');
    expect(result.client).toContain('.map(');
    expect(result.client).toContain('lux_fragment(');
  });
});

describe('Codegen Coverage — JSXIf conditional rendering (lines 294-305)', () => {
  test('if-else in JSX generates ternary', () => {
    const result = compile('client { state show = true\ncomponent App { <div>if show { <span>"yes"</span> } else { <span>"no"</span> }</div> } }');
    expect(result.client).toContain('(show) ?');
    expect(result.client).toContain(':');
    expect(result.client).toContain('lux_el("span"');
  });

  test('if without else in JSX generates ternary with null', () => {
    const result = compile('client { state show = true\ncomponent App { <div>if show { <span>"yes"</span> }</div> } }');
    expect(result.client).toContain('(show) ?');
    expect(result.client).toContain(': null');
  });
});

// ============================================================
// server-codegen.js coverage
// ============================================================

describe('Codegen Coverage — Server __contains helper (lines 96-99)', () => {
  test('membership expression in server triggers __contains helper', () => {
    const result = compile('server { fn check(x) { x in items } }');
    expect(result.server).toContain('__contains(items, x)');
    expect(result.server).toContain('function __contains');
  });
});

// ============================================================
// shared-codegen.js coverage
// ============================================================

describe('Codegen Coverage — SharedCodegen.generate() (lines 4-5)', () => {
  test('shared block generates code through SharedCodegen', () => {
    const result = compile('shared { x = 1 }');
    expect(result.shared).toContain('const x = 1;');
  });

  test('shared block with multiple statements', () => {
    const result = compile('shared { x = 1\ny = 2 }');
    expect(result.shared).toContain('const x = 1;');
    expect(result.shared).toContain('const y = 2;');
  });

  test('shared block with function', () => {
    const result = compile('shared { fn add(a, b) { a + b } }');
    expect(result.shared).toContain('function add(a, b)');
    expect(result.shared).toContain('return (a + b);');
  });
});

// ============================================================
// Additional edge cases
// ============================================================

describe('Codegen Coverage — Additional edge cases', () => {
  test('match with non-default binding pattern with guard', () => {
    // BindingPattern with guard that is NOT the last arm
    const code = compileShared('x = match n { x if x > 10 => "big", x if x > 0 => "pos", _ => "neg" }');
    expect(code).toContain('((x) =>');
    expect(code).toContain('> 10');
    expect(code).toContain('> 0');
    expect(code).toContain('return "big"');
    expect(code).toContain('return "pos"');
    expect(code).toContain('return "neg"');
  });

  test('match with literal guard (non-binding pattern with guard)', () => {
    const code = compileShared('x = match n { 1 if true => "one", _ => "other" }');
    expect(code).toContain('__match === 1');
    expect(code).toContain('&& (true)');
    expect(code).toContain('return "one"');
  });

  test('genBlockBody implicit return for last expression', () => {
    const code = compileShared('fn foo() { x = 1\nx + 1 }');
    expect(code).toContain('const x = 1;');
    expect(code).toContain('return (x + 1);');
  });

  test('client compound assignment with *= operator', () => {
    const result = compile('client { state count = 1\neffect { count *= 2 } }');
    expect(result.client).toContain('setCount(__prev => __prev * 2);');
  });

  test('component with params', () => {
    const result = compile('client { component Button(label) { <button>"click"</button> } }');
    expect(result.client).toContain('function Button({ label })');
    expect(result.client).toContain('lux_el("button"');
  });

  test('empty object literal', () => {
    const code = compileShared('x = {}');
    expect(code).toContain('const x = {  };');
  });

  test('JSXText with plain string literal', () => {
    const result = compile('client { component App { <div>"Hello"</div> } }');
    expect(result.client).toContain('"Hello"');
  });

  test('match variant pattern extracts fields', () => {
    const code = compileShared('x = match shape { Circle(radius) => radius * 2, _ => 0 }');
    expect(code).toContain('__tag === "Circle"');
    expect(code).toContain('const radius = __match.radius;');
    expect(code).toContain('return (radius * 2);');
  });

  test('lambda with single expression body (no block, no statement)', () => {
    const code = compileShared('x = fn(a) a * 2');
    expect(code).toContain('(a) => (a * 2)');
  });

  test('nil literal compiles to null', () => {
    const code = compileShared('x = nil');
    expect(code).toContain('const x = null;');
  });

  test('boolean literals compile correctly', () => {
    const code = compileShared('x = true\ny = false');
    expect(code).toContain('const x = true;');
    expect(code).toContain('const y = false;');
  });
});
