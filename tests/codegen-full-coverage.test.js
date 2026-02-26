// Full coverage tests for browser codegen (browser-codegen.js)
// Covers: CSS pseudo-selectors, _exprReadsSignal branches, spread attrs,
// component reactive props, RPC effects, auto-mount App, and more.

import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { BrowserCodegen } from '../src/codegen/browser-codegen.js';
import * as AST from '../src/parser/ast.js';

function compile(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const codegen = new CodeGenerator(ast, '<test>');
  return codegen.generate();
}

// ─── CSS Scoping — Pseudo-elements & Pseudo-classes ─────────

describe('Codegen — CSS pseudo-element and pseudo-class scoping', () => {
  test('_scopeCSS scopes :hover pseudo-class correctly', () => {
    const cg = new BrowserCodegen();
    const scoped = cg._scopeCSS('.btn:hover { color: red; }', '[data-tova-abc]');
    expect(scoped).toContain('.btn[data-tova-abc]:hover');
    expect(scoped).not.toContain('.btn:hover[data-tova-abc]');
  });

  test('_scopeCSS scopes ::before pseudo-element correctly', () => {
    const cg = new BrowserCodegen();
    const scoped = cg._scopeCSS('.btn::before { content: "→"; }', '[data-tova-xyz]');
    expect(scoped).toContain('.btn[data-tova-xyz]::before');
  });

  test('_scopeCSS scopes ::after pseudo-element correctly', () => {
    const cg = new BrowserCodegen();
    const scoped = cg._scopeCSS('.item::after { content: ""; }', '[data-tova-q1]');
    expect(scoped).toContain('.item[data-tova-q1]::after');
  });

  test('_scopeCSS scopes :focus pseudo-class correctly', () => {
    const cg = new BrowserCodegen();
    const scoped = cg._scopeCSS('input:focus { border: 1px solid blue; }', '[data-tova-f1]');
    expect(scoped).toContain('input[data-tova-f1]:focus');
  });

  test('_scopeCSS scopes :nth-child() pseudo-class', () => {
    const cg = new BrowserCodegen();
    const scoped = cg._scopeCSS('li:nth-child(2n) { background: gray; }', '[data-tova-n1]');
    expect(scoped).toContain('li[data-tova-n1]:nth-child(2n)');
  });

  test('_scopeCSS scopes regular selector without pseudo', () => {
    const cg = new BrowserCodegen();
    const scoped = cg._scopeCSS('.card { padding: 10px; }', '[data-tova-c1]');
    expect(scoped).toContain('.card[data-tova-c1]');
  });

  test('component with style block containing pseudo-selectors compiles', () => {
    const result = compile('browser { component Btn() { style { .btn:hover { color: red } .btn::before { content: "x" } } <button class="btn">"click"</button> } }');
    expect(result.browser).toContain('data-tova-');
    expect(result.browser).toContain('tova_inject_css');
  });
});

// ─── _exprReadsSignal — TemplateLiteral ─────────────────────

describe('Codegen — _exprReadsSignal for TemplateLiteral', () => {
  test('template literal attribute with signal is reactive', () => {
    const result = compile('browser { component App() { state name = "world"\n <div title="Hello {name}">"text"</div> } }');
    // The title attribute should be reactive (wrapped in getter or () =>)
    expect(result.browser).toMatch(/title.*name\(\)/);
  });

  test('template literal attribute without signal is not reactive', () => {
    // Plain string attribute — no signal, no reactive wrapper
    const result = compile('browser { component App() { <div title="Hello world">"text"</div> } }');
    expect(result.browser).not.toContain('get title()');
    expect(result.browser).toContain('title: "Hello world"');
  });
});

// ─── _exprReadsSignal — ArrayLiteral ────────────────────────

describe('Codegen — _exprReadsSignal for ArrayLiteral', () => {
  test('array literal containing signal in JSX is reactive', () => {
    const result = compile('browser { component App() { state x = 1\n <div>{[x, 2, 3]}</div> } }');
    // The expression [x(), 2, 3] should be wrapped as () => [x(), 2, 3]
    expect(result.browser).toContain('() => [x()');
  });

  test('array literal without signal is not reactive', () => {
    const result = compile('browser { component App() { <div>{[1, 2, 3]}</div> } }');
    expect(result.browser).toContain('[1, 2, 3]');
    expect(result.browser).not.toContain('() => [1');
  });
});

// ─── _exprReadsSignal — ObjectLiteral ───────────────────────

describe('Codegen — _exprReadsSignal for ObjectLiteral', () => {
  test('object literal containing signal in JSX is reactive', () => {
    const result = compile('browser { component App() { state x = 1\n <div>{{a: x}}</div> } }');
    // Should detect signal read and wrap
    expect(result.browser).toContain('x()');
  });
});

// ─── _exprReadsSignal — PipeExpression ──────────────────────

describe('Codegen — _exprReadsSignal for PipeExpression', () => {
  test('pipe expression with signal is reactive', () => {
    const result = compile('browser { component App() { state items = [3, 1, 2]\n <div>{items |> sorted}</div> } }');
    // items is a signal, pipe should be detected as reactive
    expect(result.browser).toContain('() =>');
    expect(result.browser).toContain('items()');
  });
});

// ─── _exprReadsSignal — IfExpression ────────────────────────

describe('Codegen — _exprReadsSignal for IfExpression', () => {
  test('JSXIf with signal condition is reactive', () => {
    const result = compile('browser { component App() { state x = true\n <div>\n if x { <span>"yes"</span> } else { <span>"no"</span> }\n </div> } }');
    // JSXIf is wrapped in () => closure
    expect(result.browser).toContain('() =>');
    expect(result.browser).toContain('x()');
  });
});

// ─── JSX Spread Attributes ──────────────────────────────────

describe('Codegen — JSX spread attributes', () => {
  test('spread attribute on HTML element uses Object.assign', () => {
    // Need a regular attr first so _looksLikeJSX sees IDENTIFIER after tag name
    const result = compile('browser { component App(props) { <div class="x" {...props}>"hi"</div> } }');
    expect(result.browser).toContain('Object.assign');
  });

  test('spread attribute on component uses Object.assign', () => {
    const result = compile('browser { component Child(x) { <span>"x"</span> }\n component App(props) { <Child {...props} /> } }');
    expect(result.browser).toContain('Object.assign');
  });
});

// ─── Component Reactive Props (getter syntax) ───────────────

describe('Codegen — component reactive props with getter syntax', () => {
  test('reactive prop to component uses getter', () => {
    const result = compile('browser { component Child(count) { <span>{count}</span> }\n component App() { state n = 0\n <Child count={n} /> } }');
    // Child should receive __props and generate accessor
    expect(result.browser).toContain('function Child(__props)');
    expect(result.browser).toContain('const count = () => __props.count');
    // Caller should use getter for reactive prop
    expect(result.browser).toContain('get count()');
    expect(result.browser).toContain('n()');
  });

  test('non-reactive prop to component uses regular syntax', () => {
    const result = compile('browser { component Child(label) { <span>{label}</span> }\n component App() { <Child label="hello" /> } }');
    expect(result.browser).toContain('function Child(__props)');
    expect(result.browser).toContain('label: "hello"');
    expect(result.browser).not.toContain('get label()');
  });

  test('component with no params has no __props', () => {
    const result = compile('browser { component App() { <div>"hello"</div> } }');
    expect(result.browser).toContain('function App()');
    expect(result.browser).not.toContain('__props');
  });

  test('component prop references are accessed via accessor', () => {
    const result = compile('browser { component Greet(name) { <h1>"Hello {name}"</h1> } }');
    expect(result.browser).toContain('function Greet(__props)');
    expect(result.browser).toContain('const name = () => __props.name');
    // name is in computedNames, so genExpression adds ()
    expect(result.browser).toContain('name()');
  });
});

// ─── Effect with RPC (async IIFE) ──────────────────────────

describe('Codegen — effect with RPC async wrapping', () => {
  test('effect containing server call wraps in async IIFE', () => {
    const result = compile('browser { effect { server.getData() } }');
    expect(result.browser).toContain('createEffect');
    expect(result.browser).toContain('async');
    expect(result.browser).toContain('await');
  });

  test('effect without server call is not async', () => {
    const result = compile('browser { state x = 0\n effect { print(x) } }');
    expect(result.browser).toContain('createEffect');
    expect(result.browser).not.toContain('async');
  });
});

// ─── Auto-mount App Component ───────────────────────────────

describe('Codegen — auto-mount App component', () => {
  test('generates DOMContentLoaded mount for App component', () => {
    const result = compile('browser { component App() { <div>"hello"</div> } }');
    expect(result.browser).toContain('DOMContentLoaded');
    expect(result.browser).toContain('mount(App');
  });

  test('does not generate mount for non-App components', () => {
    const result = compile('browser { component Foo() { <div>"hello"</div> } }');
    expect(result.browser).not.toContain('DOMContentLoaded');
    expect(result.browser).not.toContain('mount(Foo');
  });
});

// ─── _genScopeId collision avoidance ────────────────────────

describe('Codegen — _genScopeId', () => {
  test('different CSS produces different scope IDs', () => {
    const cg = new BrowserCodegen();
    const id1 = cg._genScopeId('Button', '.btn { color: red }');
    const id2 = cg._genScopeId('Button', '.btn { color: blue }');
    expect(id1).not.toBe(id2);
  });

  test('different names produce different scope IDs', () => {
    const cg = new BrowserCodegen();
    const id1 = cg._genScopeId('Button', '.btn { color: red }');
    const id2 = cg._genScopeId('Card', '.btn { color: red }');
    expect(id1).not.toBe(id2);
  });
});

// ─── genFunctionDeclaration with RPC ────────────────────────

describe('Codegen — function declaration with RPC', () => {
  test('function containing server call becomes async', () => {
    const result = compile('browser { fn fetchData() { server.getData() } }');
    expect(result.browser).toContain('async function fetchData');
  });

  test('function without server call is not async', () => {
    const result = compile('browser { fn helper() { print("hi") } }');
    expect(result.browser).toContain('function helper');
    expect(result.browser).not.toContain('async function helper');
  });
});

// ─── _exprReadsSignal — UnaryExpression ─────────────────────

describe('Codegen — _exprReadsSignal for UnaryExpression', () => {
  test('negation of signal is reactive', () => {
    const result = compile('browser { component App() { state flag = true\n <div>{!flag}</div> } }');
    expect(result.browser).toContain('() =>');
    expect(result.browser).toContain('flag()');
  });
});

// ─── _exprReadsSignal — CallExpression ──────────────────────

describe('Codegen — _exprReadsSignal for CallExpression', () => {
  test('function call with signal argument is reactive in JSX', () => {
    const result = compile('browser { component App() { state x = 5\n fn double(n) { n * 2 }\n <div>{double(x)}</div> } }');
    expect(result.browser).toContain('() =>');
    expect(result.browser).toContain('x()');
  });
});

// ─── _exprReadsSignal — LogicalExpression ───────────────────

describe('Codegen — _exprReadsSignal for LogicalExpression', () => {
  test('logical AND with signal is reactive', () => {
    const result = compile('browser { component App() { state show = true\n <div>{show and "visible"}</div> } }');
    expect(result.browser).toContain('() =>');
    expect(result.browser).toContain('show()');
  });
});

// ─── Store member reactivity ────────────────────────────────

describe('Codegen — store member reactivity in JSX', () => {
  test('store property access in JSX is reactive', () => {
    const result = compile('browser { store counter { state count = 0 }\n component App() { <div>{counter.count}</div> } }');
    expect(result.browser).toContain('() => counter.count');
  });
});

// ─── Component with multiple JSX roots ──────────────────────

describe('Codegen — component with multiple JSX roots', () => {
  test('multiple JSX elements produce tova_fragment', () => {
    const result = compile('browser { component App() { <div>"a"</div>\n <div>"b"</div> } }');
    expect(result.browser).toContain('tova_fragment');
  });
});

// ─── genJSXFor with and without keys ────────────────────────

describe('Codegen — JSXFor with keys', () => {
  test('for loop with key expression generates tova_keyed', () => {
    // JSXFor must be inside JSX context; key syntax is key={expr}
    const result = compile('browser { component App() { state items = [1, 2]\n <ul>\n for item in items key={item} { <li>{item}</li> }\n </ul> } }');
    // tova_keyed should appear in the component body (not just the import)
    const bodyCode = result.browser.split('function App')[1] || '';
    expect(bodyCode).toContain('tova_keyed');
  });

  test('for loop without key uses plain map', () => {
    const result = compile('browser { component App() { state items = [1, 2]\n <ul>\n for item in items { <li>{item}</li> }\n </ul> } }');
    // tova_keyed should NOT appear in the component body
    const bodyCode = result.browser.split('function App')[1] || '';
    expect(bodyCode).not.toContain('tova_keyed');
    expect(bodyCode).toContain('.map(');
  });
});

// ─── Component children and slots ───────────────────────────

describe('Codegen — component children and named slots', () => {
  test('component with children passes children prop', () => {
    const result = compile('browser { component Card(children) { <div>{children}</div> }\n component App() { <Card><span>"hello"</span></Card> } }');
    expect(result.browser).toContain('children:');
  });
});
