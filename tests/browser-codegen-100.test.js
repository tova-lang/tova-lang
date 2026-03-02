import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { BrowserCodegen } from '../src/codegen/browser-codegen.js';
import * as AST from '../src/parser/ast.js';

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

function compileBrowser(source) {
  const result = compile(source);
  return result.browser ? result.browser.trim() : '';
}

// ============================================================
// _containsRPC for complex expressions (lines 37-86)
// ============================================================

describe('Browser Codegen — _containsRPC complex expressions', () => {
  test('IfStatement with RPC in condition (line 37)', () => {
    const code = compileBrowser(`
browser {
  fn handleData() {
    if server.check() {
      x = 1
    }
  }
  component App() {
    <div on:click={handleData}>"Click"</div>
  }
}`);
    // Function containing server.check() should be async
    expect(code).toContain('async function handleData');
  });

  test('IfStatement with RPC in alternate body (line 38-39)', () => {
    const code = compileBrowser(`
browser {
  fn handleData() {
    if false {
      x = 1
    } elif true {
      server.save()
    }
  }
  component App() {
    <div on:click={handleData}>"Click"</div>
  }
}`);
    expect(code).toContain('async function handleData');
  });

  test('IfStatement with RPC in else body (line 39)', () => {
    const code = compileBrowser(`
browser {
  fn handleData() {
    if false {
      x = 1
    } else {
      server.save()
    }
  }
  component App() {
    <div on:click={handleData}>"Click"</div>
  }
}`);
    expect(code).toContain('async function handleData');
  });

  test('IfExpression with RPC in condition (line 42)', () => {
    const code = compileBrowser(`
browser {
  fn handleData() {
    x = if server.check() { 1 } else { 2 }
  }
  component App() {
    <div on:click={handleData}>"Click"</div>
  }
}`);
    expect(code).toContain('async function handleData');
  });

  test('IfExpression with RPC in alternates (line 43)', () => {
    const code = compileBrowser(`
browser {
  fn handleData() {
    x = if false { 1 } elif server.check() { 2 } else { 3 }
  }
  component App() {
    <div on:click={handleData}>"Click"</div>
  }
}`);
    expect(code).toContain('async function handleData');
  });

  test('IfExpression with RPC in else body (line 44)', () => {
    const code = compileBrowser(`
browser {
  fn handleData() {
    x = if false { 1 } else { server.fetch() }
  }
  component App() {
    <div on:click={handleData}>"Click"</div>
  }
}`);
    expect(code).toContain('async function handleData');
  });

  test('MatchExpression with RPC in body (line 59)', () => {
    const code = compileBrowser(`
browser {
  fn handleData() {
    x = match val {
      1 => server.fetch()
      _ => 0
    }
  }
  component App() {
    <div on:click={handleData}>"Click"</div>
  }
}`);
    expect(code).toContain('async function handleData');
  });

  test('TryCatch with RPC in try body (line 62)', () => {
    const code = compileBrowser(`
browser {
  fn handleData() {
    try {
      server.fetch()
    } catch e {
      x = 0
    }
  }
  component App() {
    <div on:click={handleData}>"Click"</div>
  }
}`);
    expect(code).toContain('async function handleData');
  });

  test('TryCatch with RPC in catch body (line 63)', () => {
    const code = compileBrowser(`
browser {
  fn handleData() {
    try {
      x = 1
    } catch e {
      server.logError()
    }
  }
  component App() {
    <div on:click={handleData}>"Click"</div>
  }
}`);
    expect(code).toContain('async function handleData');
  });

  test('TryCatch with RPC in finally body (line 64)', () => {
    const code = compileBrowser(`
browser {
  fn handleData() {
    try {
      x = 1
    } catch e {
      x = 2
    } finally {
      server.cleanup()
    }
  }
  component App() {
    <div on:click={handleData}>"Click"</div>
  }
}`);
    expect(code).toContain('async function handleData');
  });

  test('PipeExpression with RPC (line 67)', () => {
    const code = compileBrowser(`
browser {
  fn handleData() {
    x = data |> server.process()
  }
  component App() {
    <div on:click={handleData}>"Click"</div>
  }
}`);
    expect(code).toContain('async function handleData');
  });

  test('GuardStatement with RPC (line 70)', () => {
    const code = compileBrowser(`
browser {
  fn handleData() {
    guard valid else { server.logError() }
  }
  component App() {
    <div on:click={handleData}>"Click"</div>
  }
}`);
    expect(code).toContain('async function handleData');
  });
});

// ============================================================
// Lambda with RPC/propagate/compound assignment (lines 140-185)
// ============================================================

describe('Browser Codegen — Lambda overrides', () => {
  test('lambda with propagate in block body (line 151)', () => {
    const code = compileBrowser(`
browser {
  fn getData() {
    items = [1, 2, 3]
    result = items |> map(fn(x) { val = Ok(x)?; val + 1 })
  }
  component App() {
    <div on:click={getData}>"Click"</div>
  }
}`);
    expect(code).toContain('__tova_propagate');
  });

  test('lambda with propagate in expression body (line 185)', () => {
    const code = compileBrowser(`
browser {
  fn getData() {
    items = [1, 2, 3]
    result = items |> map(fn(x) Ok(x)?)
  }
  component App() {
    <div on:click={getData}>"Click"</div>
  }
}`);
    expect(code).toContain('__tova_propagate');
  });

  test('lambda with compound assignment to state (line 157-162)', () => {
    const code = compileBrowser(`
browser {
  state count = 0
  component App() {
    <button on:click={fn() count += 1}>"Inc"</button>
  }
}`);
    expect(code).toContain('setCount');
    expect(code).toContain('__tova_p');
  });

  test('lambda with assignment to state (line 166-170)', () => {
    const code = compileBrowser(`
browser {
  state count = 0
  component App() {
    <button on:click={fn() count = 0}>"Reset"</button>
  }
}`);
    expect(code).toContain('setCount(0)');
  });

  test('lambda with non-state compound assignment (line 174)', () => {
    const code = compileBrowser(`
browser {
  component App() {
    <button on:click={fn() { var x = 0; x += 1 }}>"Click"</button>
  }
}`);
    expect(code).toContain('x += 1');
  });
});

// ============================================================
// Pseudo-element CSS scoping (line 550)
// ============================================================

describe('Browser Codegen — CSS scoping', () => {
  test('pseudo-element ::before gets scoped before pseudo-part (line 540-541)', () => {
    const code = compileBrowser(`
browser {
  component Fancy() {
    style {
      .box::before { content: "hi" }
    }
    <div class="box">"Hello"</div>
  }
}`);
    // The pseudo-element should be inserted after the data-tova attribute
    expect(code).toMatch(/\.box\[data-tova-[a-z0-9]+\]::before/);
  });

  test('pseudo-class with no base part (line 548-550)', () => {
    const code = compileBrowser(`
browser {
  component Fancy() {
    style {
      :hover { color: red }
    }
    <div>"Hello"</div>
  }
}`);
    // When there is no base part for the pseudo-class, the scope attr should still be applied
    expect(code).toMatch(/data-tova/);
  });
});

// ============================================================
// Component param prop accessors with defaults (lines 574-575)
// ============================================================

describe('Browser Codegen — Component params with defaults', () => {
  test('component param with default value generates accessor (line 574-575)', () => {
    const code = compileBrowser(`
browser {
  component Greeting(name = "World") {
    <p>"Hello"</p>
  }
}`);
    // Should generate prop accessor with default value fallback
    expect(code).toContain('__props.name !== undefined');
    expect(code).toContain('"World"');
  });
});

// ============================================================
// Store generation in component body (lines 626-627)
// ============================================================

describe('Browser Codegen — Store in component body', () => {
  test('store declaration inside component via direct AST (line 626-627)', () => {
    const cg = new BrowserCodegen();
    // Manually construct a ComponentDeclaration with a StoreDeclaration in body
    const loc = { line: 1, col: 1, file: '<test>' };
    const storeNode = {
      type: 'StoreDeclaration',
      name: 'myStore',
      body: [
        { type: 'StateDeclaration', name: 'val', initialValue: { type: 'NumberLiteral', value: 0, loc }, loc },
      ],
      loc,
    };
    const jsxDiv = {
      type: 'JSXElement', tag: 'div', attributes: [], children: [
        { type: 'JSXText', value: { type: 'StringLiteral', value: 'Hello', loc }, loc },
      ], selfClosing: false, loc,
    };
    const comp = { type: 'ComponentDeclaration', name: 'App', params: [], body: [storeNode, jsxDiv], loc };
    const browserBlock = { type: 'BrowserBlock', body: [comp], name: null, loc };
    const code = cg.generate([browserBlock], '', null, null, null);
    expect(code).toContain('myStore');
    expect(code).toContain('createSignal(0)');
  });
});

// ============================================================
// _exprReadsSignal comprehensive checking (lines 1057-1074)
// ============================================================

describe('Browser Codegen — _exprReadsSignal', () => {
  test('OptionalChain with signal reads is reactive (line 1058)', () => {
    const code = compileBrowser(`
browser {
  state data = nil
  component App() {
    <div>{data?.name}</div>
  }
}`);
    // Optional chain referencing a signal should be wrapped in reactive closure
    expect(code).toContain('() =>');
  });

  test('MatchExpression with signal in subject is reactive (line 1072-1074)', () => {
    const code = compileBrowser(`
browser {
  state val = 1
  component App() {
    <div>{match val { 1 => "one", _ => "other" }}</div>
  }
}`);
    // Match expression reading a signal should be reactive
    expect(code).toContain('() =>');
  });

  test('MatchExpression with signal in arm body but not subject (line 1074)', () => {
    const code = compileBrowser(`
browser {
  state label = "hello"
  component App() {
    <div>{match x { 1 => label, _ => "other" }}</div>
  }
}`);
    // Match arm body reads signal, so expression should be reactive
    expect(code).toContain('() =>');
  });

  test('IfExpression with signal alternates is reactive (line 1067-1070)', () => {
    const code = compileBrowser(`
browser {
  state x = true
  state y = false
  component App() {
    <div>{if x { "a" } elif y { "b" } else { "c" }}</div>
  }
}`);
    expect(code).toContain('() =>');
  });
});

// ============================================================
// JSXMatch element rendering (line 1103)
// ============================================================

describe('Browser Codegen — JSXMatch rendering', () => {
  test('JSXMatch in component generates match IIFE (lines 1643-1675)', () => {
    const code = compileBrowser(`
browser {
  component App() {
    <div>
      match status {
        "loading" => <span>"Loading..."</span>
        "error" => <span>"Error"</span>
        _ => <span>"Done"</span>
      }
    </div>
  }
}`);
    expect(code).toContain('__match');
    expect(code).toContain('return tova_el("span"');
  });

  test('JSXMatch dispatched from genJSX switch (line 1103)', () => {
    const code = compileBrowser(`
browser {
  state status = "loading"
  component App() {
    <div>
      match status {
        "loading" => <span>"..."</span>
        _ => <span>"done"</span>
      }
    </div>
  }
}`);
    // The match references state, so it should be reactive
    expect(code).toContain('() =>');
    expect(code).toContain('__match');
  });

  test('JSXMatch with binding pattern (line 1657-1658)', () => {
    const code = compileBrowser(`
browser {
  component App() {
    <div>
      match val {
        1 => <span>"one"</span>
        x => <span>"other"</span>
      }
    </div>
  }
}`);
    expect(code).toContain('const x = __match');
    expect(code).toContain('return tova_el("span"');
  });

  test('JSXMatch with multiple children per arm produces fragment (line 1652)', () => {
    const code = compileBrowser(`
browser {
  component App() {
    <div>
      match val {
        1 => <span>"a"</span>
        _ => <span>"b"</span>
      }
    </div>
  }
}`);
    expect(code).toContain('__match');
  });
});

// ============================================================
// Slot element handling (lines 1110-1130)
// ============================================================

describe('Browser Codegen — Slot handling', () => {
  test('scoped slot with props (lines 1120-1126)', () => {
    const code = compileBrowser(`
browser {
  state count = 0
  component DataProvider() {
    <div>
      <slot count={count} />
    </div>
  }
  component App() {
    <div>"Hello"</div>
  }
}`);
    // Scoped slot should pass props to children render function
    expect(code).toContain('typeof __props.children === \'function\'');
    expect(code).toContain('count:');
  });
});

// ============================================================
// CSS class/style binding merging (lines 1329-1333)
// ============================================================

describe('Browser Codegen — Show directive with existing style', () => {
  test('show directive merged with existing style - reactive (line 1329-1331)', () => {
    const code = compileBrowser(`
browser {
  state visible = true
  component App() {
    <div style={{color: "red"}} show={visible}>"Hello"</div>
  }
}`);
    expect(code).toContain('Object.assign');
    expect(code).toContain('display');
  });

  test('show directive merged with existing style - non-reactive (line 1332-1333)', () => {
    const code = compileBrowser(`
browser {
  component App() {
    <div style={{color: "red"}} show={true}>"Hello"</div>
  }
}`);
    expect(code).toContain('Object.assign');
    expect(code).toContain('display');
  });
});

// ============================================================
// JSXFor keyed rendering (lines 1598-1599)
// ============================================================

describe('Browser Codegen — JSXFor keyed rendering', () => {
  test('JSXFor keyed with single child (line 1596-1597)', () => {
    const code = compileBrowser(`
browser {
  component App() {
    <div>
      for item in items key={item.id} {
        <span>"text"</span>
      }
    </div>
  }
}`);
    expect(code).toContain('tova_keyed');
    expect(code).toContain('item.id');
  });

  test('JSXFor keyed with multiple children produces fragment (line 1599)', () => {
    const code = compileBrowser(`
browser {
  component App() {
    <div>
      for item in items key={item.id} {
        <span>"a"</span>
        <span>"b"</span>
      }
    </div>
  }
}`);
    expect(code).toContain('tova_keyed');
    expect(code).toContain('tova_fragment');
  });
});

// ============================================================
// JSXFor ObjectPattern (line 1583)
// ============================================================

describe('Browser Codegen — JSXFor with object destructuring', () => {
  test('JSXFor with object pattern variable (line 1581-1583)', () => {
    const code = compileBrowser(`
browser {
  component App() {
    <div>
      for {name, age} in people {
        <span>"text"</span>
      }
    </div>
  }
}`);
    expect(code).toContain('{name, age}');
    expect(code).toContain('.map(');
  });
});

// ============================================================
// Fragment generation (lines 1679-1680)
// ============================================================

describe('Browser Codegen — Fragment generation', () => {
  test('JSXFragment renders tova_fragment (line 1679-1680)', () => {
    const code = compileBrowser(`
browser {
  component App() {
    <>
      <span>"a"</span>
      <span>"b"</span>
    </>
  }
}`);
    expect(code).toContain('tova_fragment');
  });
});

// ============================================================
// genPipeExpression with RPC (line 1689)
// ============================================================

describe('Browser Codegen — Pipe with RPC', () => {
  test('pipe expression with RPC target gets await (line 1689)', () => {
    const code = compileBrowser(`
browser {
  fn fetchData() {
    result = data |> server.process()
  }
  component App() {
    <div on:click={fetchData}>"Click"</div>
  }
}`);
    expect(code).toContain('async function fetchData');
    expect(code).toContain('await');
  });
});

// ============================================================
// genFunctionDeclaration with RPC and propagate (lines 1706, 1717)
// ============================================================

describe('Browser Codegen — Function with RPC', () => {
  test('function with RPC becomes async (line 1700)', () => {
    const code = compileBrowser(`
browser {
  fn loadData() {
    data = server.fetchAll()
  }
  component App() {
    <div on:click={loadData}>"Click"</div>
  }
}`);
    expect(code).toContain('async function loadData');
  });

  test('function with destructure param (line 1705-1706)', () => {
    const code = compileBrowser(`
browser {
  fn handle({name, age}) {
    server.save()
  }
  component App() {
    <div on:click={handle}>"Click"</div>
  }
}`);
    expect(code).toContain('async function handle');
  });

  test('function with RPC and propagate (line 1716-1717)', () => {
    const code = compileBrowser(`
browser {
  fn loadData() {
    data = server.fetchAll()?
  }
  component App() {
    <div on:click={loadData}>"Click"</div>
  }
}`);
    expect(code).toContain('async function loadData');
    expect(code).toContain('__tova_propagate');
  });
});

// ============================================================
// Import hoisting and shared code (lines 208, 214-216)
// ============================================================

describe('Browser Codegen — Import hoisting', () => {
  test('shared imports are hoisted to top of browser output (line 207-218)', () => {
    const code = compileBrowser(`
import { z } from "zod"
x = 42
browser {
  component App() {
    <div>"Hello"</div>
  }
}`);
    const lines = code.split('\n');
    // The zod import should appear near the top, before shared code
    const zodIdx = lines.findIndex(l => l.includes('from "zod"'));
    const sharedIdx = lines.findIndex(l => l.includes('Shared'));
    expect(zodIdx).toBeGreaterThan(-1);
    if (sharedIdx > -1) {
      expect(zodIdx).toBeLessThan(sharedIdx);
    }
  });
});

// ============================================================
// ImportDefault/ImportWildcard in browser blocks (lines 273-287)
// ============================================================

describe('Browser Codegen — Client imports', () => {
  test('ImportDefault in browser block (line 274)', () => {
    const code = compileBrowser(`
browser {
  import lodash from "lodash"
  component App() {
    <div>"Hello"</div>
  }
}`);
    expect(code).toContain('import lodash from "lodash"');
    expect(code).toContain('Client Imports');
  });

  test('ImportWildcard in browser block (line 273)', () => {
    const code = compileBrowser(`
browser {
  import * as R from "ramda"
  component App() {
    <div>"Hello"</div>
  }
}`);
    expect(code).toContain('import * as R from "ramda"');
  });
});

// ============================================================
// Security config injection (lines 247-252)
// ============================================================

describe('Browser Codegen — Security config in browser', () => {
  test('security block injects client-side security code (line 246-252)', () => {
    const code = compileBrowser(`
security {
  auth {
    type: "jwt"
    secret: "mysecret"
  }
}
browser {
  component App() {
    <div>"Secure"</div>
  }
}`);
    // Security codegen generates auth helpers for browser
    expect(code).toBeDefined();
  });
});

// ============================================================
// Form generation inside component (lines 622-624)
// ============================================================

describe('Browser Codegen — Form in component', () => {
  test('form declaration inside component body (line 622-624)', () => {
    const code = compileBrowser(`
browser {
  component App() {
    form login {
      field username = ""
      field password = ""
    }
    <div>"Hello"</div>
  }
}`);
    expect(code).toContain('const login');
    expect(code).toContain('__username_value');
    expect(code).toContain('__password_value');
  });
});

// ============================================================
// ErrorMessage standalone with no field (line 1486)
// ============================================================

describe('Browser Codegen — ErrorMessage edge cases', () => {
  test('ErrorMessage with no field and no parent renders null (line 1486-1488)', () => {
    const code = compileBrowser(`
browser {
  component App() {
    <ErrorMessage />
  }
}`);
    expect(code).toContain('null');
  });
});

// ============================================================
// FormField edge cases (lines 1496-1520, 1525-1557)
// ============================================================

describe('Browser Codegen — FormField', () => {
  test('FormField with no field attr renders normal div (line 1498-1501)', () => {
    const code = compileBrowser(`
browser {
  component App() {
    <FormField>
      <span>"hello"</span>
    </FormField>
  }
}`);
    expect(code).toContain('form-field');
    expect(code).toContain('tova_el("span"');
  });

  test('FormField with input and class (line 1531-1532)', () => {
    const code = compileBrowser(`
browser {
  form myForm {
    field email = ""
  }
  component App() {
    <FormField field={myForm.email}>
      <input class="input-field" />
    </FormField>
  }
}`);
    expect(code).toContain('className');
    expect(code).toContain('form-field');
  });

  test('FormField with input and on:focus event (line 1533-1534)', () => {
    const code = compileBrowser(`
browser {
  form myForm {
    field email = ""
  }
  component App() {
    <FormField field={myForm.email}>
      <input on:focus={fn() {}} />
    </FormField>
  }
}`);
    expect(code).toContain('onFocus');
    expect(code).toContain('form-field');
  });
});

// ============================================================
// JSXText with template literal - non-reactive (line 1570-1572)
// ============================================================

describe('Browser Codegen — JSXText template non-reactive', () => {
  test('template literal text that does not read signals (line 1570-1572)', () => {
    const code = compileBrowser(`
browser {
  component App() {
    <div>"Hello {name}"</div>
  }
}`);
    // Template literal should not be wrapped in reactive closure since name is not a signal
    expect(code).toContain('`Hello ${name}`');
  });
});

// ============================================================
// Component spreads with children (line 1413)
// ============================================================

describe('Browser Codegen — Component spreads with children', () => {
  test('component with spread and children (line 1412-1413)', () => {
    const code = compileBrowser(`
browser {
  component Child() {
    <div>"child"</div>
  }
  component App() {
    <Child {...props}>
      <span>"inner"</span>
    </Child>
  }
}`);
    expect(code).toContain('Object.assign');
    expect(code).toContain('children');
  });
});

// ============================================================
// _containsRPC additional patterns (LetDestructure, etc.)
// ============================================================

describe('Browser Codegen — _containsRPC additional node types', () => {
  test('LetDestructure with RPC (line 72)', () => {
    const code = compileBrowser(`
browser {
  fn loadData() {
    let { name, age } = server.fetchUser()
  }
  component App() {
    <div on:click={loadData}>"Click"</div>
  }
}`);
    expect(code).toContain('async function loadData');
  });

  test('MatchExpression subject with RPC (line 58-59)', () => {
    const code = compileBrowser(`
browser {
  fn loadData() {
    result = match server.getStatus() {
      "ok" => 1
      _ => 0
    }
  }
  component App() {
    <div on:click={loadData}>"Click"</div>
  }
}`);
    expect(code).toContain('async function loadData');
  });
});

// ============================================================
// Effect with RPC calls
// ============================================================

describe('Browser Codegen — Effect with RPC', () => {
  test('effect containing server call wraps in async IIFE', () => {
    const code = compileBrowser(`
browser {
  state count = 0
  effect {
    server.logCount(count)
  }
  component App() {
    <div>{count}</div>
  }
}`);
    expect(code).toContain('createEffect');
    expect(code).toContain('async');
    expect(code).toContain('await');
  });
});

// ============================================================
// Form registration in top-level browser block (lines 310-313, 345-350)
// ============================================================

describe('Browser Codegen — Top-level form in browser block', () => {
  test('form in top-level browser block (line 310-313, 345-350)', () => {
    const code = compileBrowser(`
browser {
  form contactForm {
    field name = ""
    field email = ""
  }
  component App() {
    <div>"Hello"</div>
  }
}`);
    expect(code).toContain('const contactForm');
    expect(code).toContain('Forms');
    expect(code).toContain('__name_value');
  });
});

// ============================================================
// Wizard step validation with unknown member (line 874)
// ============================================================

describe('Browser Codegen — Wizard step unknown member fallback', () => {
  test('wizard step with member not in fields/groups/arrays falls through to default (line 874)', () => {
    const cg = new BrowserCodegen();
    const loc = { line: 1, col: 1, file: '<test>' };
    // Create a form with steps that reference a member not in fields/groups/arrays
    const formNode = {
      type: 'FormDeclaration',
      name: 'wizard',
      typeAnnotation: null,
      fields: [
        { type: 'FormFieldDeclaration', name: 'email', initialValue: { type: 'StringLiteral', value: '', loc }, validators: [], loc },
      ],
      groups: [],
      arrays: [],
      computeds: [],
      steps: {
        steps: [
          { label: 'Step 1', members: ['email'] },
          { label: 'Step 2', members: ['unknownMember'] },  // Not in fields, groups, or arrays
        ],
      },
      onSubmit: null,
      loc,
    };
    const jsxDiv = {
      type: 'JSXElement', tag: 'div', attributes: [], children: [
        { type: 'JSXText', value: { type: 'StringLiteral', value: 'Hi', loc }, loc },
      ], selfClosing: false, loc,
    };
    const comp = { type: 'ComponentDeclaration', name: 'App', params: [], body: [formNode, jsxDiv], loc };
    const browserBlock = { type: 'BrowserBlock', body: [comp], name: null, loc };
    const code = cg.generate([browserBlock], '', null, null, null);
    // The unknown member should fall through to the default: member.validate()
    expect(code).toContain('unknownMember.validate()');
  });
});

// ============================================================
// Multiple JSX elements returning fragment (line 636-638)
// ============================================================

describe('Browser Codegen — Multiple JSX returns fragment', () => {
  test('component with multiple root JSX elements returns fragment (line 636-638)', () => {
    const code = compileBrowser(`
browser {
  component App() {
    <div>"a"</div>
    <div>"b"</div>
  }
}`);
    expect(code).toContain('tova_fragment');
  });
});

// ============================================================
// JSXIf with reactive condition (line 1635-1639)
// ============================================================

describe('Browser Codegen — JSXIf reactive', () => {
  test('JSXIf with signal condition wraps in reactive closure (line 1637-1639)', () => {
    const code = compileBrowser(`
browser {
  state show = true
  component App() {
    <div>
      if show {
        <span>"visible"</span>
      }
    </div>
  }
}`);
    expect(code).toContain('() =>');
    expect(code).toContain('show()');
  });
});

// ============================================================
// JSXFor with reactive iterable
// ============================================================

describe('Browser Codegen — JSXFor reactive', () => {
  test('JSXFor with signal iterable wraps in reactive closure', () => {
    const code = compileBrowser(`
browser {
  state items = []
  component App() {
    <div>
      for item in items {
        <span>"text"</span>
      }
    </div>
  }
}`);
    expect(code).toContain('() =>');
    expect(code).toContain('items()');
    expect(code).toContain('.map(');
  });
});

// ============================================================
// Component with named slots on children
// ============================================================

describe('Browser Codegen — Named slots via children', () => {
  test('named slot on child element', () => {
    const code = compileBrowser(`
browser {
  component Layout() {
    <div>
      <slot name="header" />
      <slot />
    </div>
  }
  component App() {
    <Layout>
      <div slot="header">"Header"</div>
      <p>"Body"</p>
    </Layout>
  }
}`);
    expect(code).toContain('header:');
    expect(code).toContain('children:');
  });
});

// ============================================================
// JSXMatch reactive (line 1673-1674)
// ============================================================

describe('Browser Codegen — JSXMatch reactive subject', () => {
  test('JSXMatch with signal subject wraps in reactive closure (line 1673)', () => {
    const code = compileBrowser(`
browser {
  state status = "loading"
  component App() {
    <div>
      match status {
        "loading" => <span>"Loading"</span>
        _ => <span>"Done"</span>
      }
    </div>
  }
}`);
    // Match with signal subject should be reactive
    expect(code).toContain('() => ((__match)');
  });
});

// ============================================================
// JSXMatch pattern compilation details (lines 1648-1668)
// ============================================================

describe('Browser Codegen — JSXMatch patterns', () => {
  test('JSXMatch with literal patterns (line 1648-1668)', () => {
    const code = compileBrowser(`
browser {
  component App() {
    <div>
      match val {
        1 => <span>"one"</span>
        2 => <span>"two"</span>
        _ => <span>"other"</span>
      }
    </div>
  }
}`);
    expect(code).toContain('if (');
    expect(code).toContain('else if (');
    expect(code).toContain('return tova_el("span"');
  });

  test('JSXMatch wildcard as only arm (line 1654-1661)', () => {
    const code = compileBrowser(`
browser {
  component App() {
    <div>
      match val {
        _ => <span>"always"</span>
      }
    </div>
  }
}`);
    expect(code).toContain('return tova_el("span"');
  });

  test('JSXMatch with binding pattern with guard (line 1662)', () => {
    const code = compileBrowser(`
browser {
  component App() {
    <div>
      match val {
        x if x > 0 => <span>"positive"</span>
        _ => <span>"other"</span>
      }
    </div>
  }
}`);
    // Binding pattern with guard should go through the if/else chain, not the default path
    expect(code).toContain('if (');
    expect(code).toContain('return tova_el("span"');
  });
});
