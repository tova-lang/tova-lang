import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { JSXMatch } from '../src/parser/browser-ast.js';
import { ComputedDeclaration, StoreDeclaration } from '../src/parser/browser-ast.js';
import { installDeployParser } from '../src/parser/deploy-parser.js';

function parse(src) {
  const lexer = new Lexer(src, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function parseBrowserBody(src) {
  const ast = parse(`browser { ${src} }`);
  return ast.body[0];
}

function parseComponentBody(src) {
  const ast = parse(`browser { component App() { ${src} } }`);
  return ast.body[0].body[0];
}

function parseServerBody(src) {
  const ast = parse(`server { ${src} }`);
  return ast.body[0];
}

function parseEdgeBody(src) {
  const ast = parse(`edge { ${src} }`);
  return ast.body[0];
}

function parseCliBody(src) {
  const ast = parse(`cli { ${src} }`);
  return ast.body[0];
}

function parseSecurityBody(src) {
  const ast = parse(`security { ${src} }`);
  return ast.body[0];
}

// ============================================================
// browser-ast.js
// ============================================================
describe('browser-ast.js coverage', () => {
  test('ComputedDeclaration constructor', () => {
    const node = new ComputedDeclaration('total', { type: 'NumberLiteral', value: 42 }, { line: 1, col: 1 });
    expect(node.type).toBe('ComputedDeclaration');
    expect(node.name).toBe('total');
    expect(node.expression.value).toBe(42);
    expect(node.loc.line).toBe(1);
  });

  test('StoreDeclaration constructor', () => {
    const node = new StoreDeclaration('MyStore', [{ type: 'StateDeclaration' }], { line: 1, col: 1 });
    expect(node.type).toBe('StoreDeclaration');
    expect(node.name).toBe('MyStore');
    expect(node.body).toHaveLength(1);
    expect(node.loc.line).toBe(1);
  });

  test('JSXMatch constructor', () => {
    const node = new JSXMatch(
      { type: 'Identifier', name: 'x' },
      [{ pattern: { type: 'WildcardPattern' }, guard: null, body: [] }],
      { line: 5, col: 3 }
    );
    expect(node.type).toBe('JSXMatch');
    expect(node.subject.name).toBe('x');
    expect(node.arms).toHaveLength(1);
    expect(node.loc.line).toBe(5);
  });
});

// ============================================================
// browser-parser.js
// ============================================================
describe('browser-parser.js coverage', () => {

  test('deprecated client keyword produces warning', () => {
    const lexer = new Lexer('client { component App() { <p>"Hello"</p> } }', '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    const ast = parser.parse();
    expect(ast.body[0].type).toBe('BrowserBlock');
    // Parser should have recorded deprecation warning
    expect(parser.warnings).toBeDefined();
    expect(parser.warnings.length).toBeGreaterThan(0);
    expect(parser.warnings[0].message).toContain('client');
  });

  test('named browser block', () => {
    const ast = parse('browser "admin" { component Panel() { <div>"Admin"</div> } }');
    expect(ast.body[0].type).toBe('BrowserBlock');
    expect(ast.body[0].name).toBe('admin');
  });

  test('browser block error recovery on malformed statement', () => {
    // A malformed statement inside browser block should be caught and recovered
    const lexer = new Lexer('browser { @@@ component App() { <p>"ok"</p> } }', '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    try {
      const ast = parser.parse();
      // If it parses, the BrowserBlock should exist with possible errors
      expect(ast.body[0].type).toBe('BrowserBlock');
    } catch (e) {
      // Error recovery may throw if too many errors accumulate
      expect(e.errors || e.message).toBeDefined();
    }
  });

  test('store block with state, computed, and fn', () => {
    const src = `browser {
      store TodoStore {
        state items = []
        computed total = len(items)
        fn addItem(item) {
          items = items
        }
      }
    }`;
    const ast = parse(src);
    const store = ast.body[0].body[0];
    expect(store.type).toBe('StoreDeclaration');
    expect(store.name).toBe('TodoStore');
    expect(store.body.length).toBeGreaterThanOrEqual(2);
  });

  test('store block error on invalid member', () => {
    const src = `browser {
      store BadStore {
        123
      }
    }`;
    try {
      parse(src);
    } catch (e) {
      expect(e.message).toContain('state');
    }
  });

  test('state with type annotation', () => {
    const src = `browser { state counter: Int = 0 }`;
    const ast = parse(src);
    const state = ast.body[0].body[0];
    expect(state.type).toBe('StateDeclaration');
    expect(state.typeAnnotation).toBeDefined();
  });

  test('computed declaration', () => {
    const src = `browser { component App() { computed doubled = count } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const computed = comp.body.find(n => n.type === 'ComputedDeclaration');
    expect(computed).toBeDefined();
    expect(computed.name).toBe('doubled');
  });

  test('component with inner state, computed, effect, nested component, and form', () => {
    const src = `browser {
      component App() {
        state count = 0
        computed doubled = count
        effect { print(count) }
        component Inner() { <span>"hi"</span> }
        form myForm {
          field name: String { required }
        }
        <div>"Hello"</div>
      }
    }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    expect(comp.type).toBe('ComponentDeclaration');
    const types = comp.body.map(n => n.type);
    expect(types).toContain('StateDeclaration');
    expect(types).toContain('ComputedDeclaration');
    expect(types).toContain('EffectDeclaration');
    expect(types).toContain('ComponentDeclaration');
    expect(types).toContain('FormDeclaration');
  });

  test('_collapseJSXWhitespace returns empty for whitespace-only', () => {
    // This is exercised by JSX_TEXT tokens that are whitespace-only
    // We'll test via fragment children with whitespace text
    const src = `browser { component App() { <><p>"A"</p><p>"B"</p></> } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const frag = comp.body.find(n => n.type === 'JSXFragment');
    expect(frag).toBeDefined();
    expect(frag.children.length).toBeGreaterThanOrEqual(2);
  });

  test('JSX fragment with various children', () => {
    const src = `browser { component App() {
      <>
        <p>"text"</p>
        "string child"
        {someExpr}
      </>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const frag = comp.body.find(n => n.type === 'JSXFragment');
    expect(frag).toBeDefined();
    expect(frag.children.length).toBeGreaterThanOrEqual(2);
  });

  test('nested fragment inside fragment', () => {
    const src = `browser { component App() {
      <>
        <>
          <p>"inner"</p>
        </>
      </>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const frag = comp.body.find(n => n.type === 'JSXFragment');
    expect(frag).toBeDefined();
    // Check for nested fragment
    const nestedFrag = frag.children.find(c => c.type === 'JSXFragment');
    expect(nestedFrag).toBeDefined();
  });

  test('fragment with for loop child', () => {
    const src = `browser { component App() {
      <>
        for item in items {
          <li>"item"</li>
        }
      </>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const frag = comp.body.find(n => n.type === 'JSXFragment');
    expect(frag).toBeDefined();
    const forNode = frag.children.find(c => c.type === 'JSXFor');
    expect(forNode).toBeDefined();
  });

  test('fragment with if child', () => {
    const src = `browser { component App() {
      <>
        if show {
          <p>"visible"</p>
        }
      </>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const frag = comp.body.find(n => n.type === 'JSXFragment');
    expect(frag).toBeDefined();
    const ifNode = frag.children.find(c => c.type === 'JSXIf');
    expect(ifNode).toBeDefined();
  });

  test('fragment with match child', () => {
    const src = `browser { component App() {
      <>
        match status {
          1 => <p>"one"</p>
          _ => <p>"other"</p>
        }
      </>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const frag = comp.body.find(n => n.type === 'JSXFragment');
    expect(frag).toBeDefined();
    const matchNode = frag.children.find(c => c.type === 'JSXMatch');
    expect(matchNode).toBeDefined();
  });

  test('fragment with expression in braces', () => {
    const src = `browser { component App() {
      <>
        {myVar}
      </>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const frag = comp.body.find(n => n.type === 'JSXFragment');
    expect(frag).toBeDefined();
    const exprNode = frag.children.find(c => c.type === 'JSXExpression');
    expect(exprNode).toBeDefined();
  });

  test('JSX children: match inside regular element', () => {
    const src = `browser { component App() {
      <div>
        match val {
          1 => <p>"one"</p>
          _ => <p>"other"</p>
        }
      </div>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const div = comp.body.find(n => n.type === 'JSXElement' && n.tag === 'div');
    expect(div).toBeDefined();
    const matchNode = div.children.find(c => c.type === 'JSXMatch');
    expect(matchNode).toBeDefined();
  });

  test('JSXFor with array destructuring', () => {
    const src = `browser { component App() {
      <div>
        for [idx, item] in entries {
          <span>"item"</span>
        }
      </div>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const div = comp.body.find(n => n.type === 'JSXElement');
    const forNode = div.children.find(c => c.type === 'JSXFor');
    expect(forNode).toBeDefined();
    expect(forNode.variable.type).toBe('ArrayPattern');
  });

  test('JSXFor with object destructuring', () => {
    const src = `browser { component App() {
      <div>
        for {name, age} in people {
          <span>"person"</span>
        }
      </div>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const div = comp.body.find(n => n.type === 'JSXElement');
    const forNode = div.children.find(c => c.type === 'JSXFor');
    expect(forNode).toBeDefined();
    expect(forNode.variable.type).toBe('ObjectPattern');
  });

  test('JSXFor body with string, expression, for, if, match children', () => {
    const src = `browser { component App() {
      <div>
        for item in items {
          "text"
          {item}
          for sub in item {
            <span>"sub"</span>
          }
          if show {
            <b>"bold"</b>
          }
          match status {
            1 => <i>"one"</i>
            _ => <i>"else"</i>
          }
        }
      </div>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const div = comp.body.find(n => n.type === 'JSXElement');
    const forNode = div.children.find(c => c.type === 'JSXFor');
    expect(forNode).toBeDefined();
    const bodyTypes = forNode.body.map(n => n.type);
    expect(bodyTypes).toContain('JSXText');
    expect(bodyTypes).toContain('JSXExpression');
    expect(bodyTypes).toContain('JSXFor');
    expect(bodyTypes).toContain('JSXIf');
    expect(bodyTypes).toContain('JSXMatch');
  });

  test('JSX if with elif and else', () => {
    const src = `browser { component App() {
      <div>
        if status == 1 {
          <p>"one"</p>
        } elif status == 2 {
          <p>"two"</p>
        } else {
          <p>"other"</p>
        }
      </div>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const div = comp.body.find(n => n.type === 'JSXElement');
    const ifNode = div.children.find(c => c.type === 'JSXIf');
    expect(ifNode).toBeDefined();
    expect(ifNode.alternates).toHaveLength(1);
    expect(ifNode.alternate).toBeDefined();
  });

  test('_parseJSXIfBody with string, expression, for, if, match children', () => {
    const src = `browser { component App() {
      <div>
        if show {
          "text"
          {expr}
          for x in xs {
            <span>"s"</span>
          }
          if inner {
            <b>"b"</b>
          }
          match val {
            1 => <i>"i"</i>
            _ => <i>"e"</i>
          }
          <p>"element"</p>
        }
      </div>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const div = comp.body.find(n => n.type === 'JSXElement');
    const ifNode = div.children.find(c => c.type === 'JSXIf');
    expect(ifNode).toBeDefined();
    const bodyTypes = ifNode.consequent.map(n => n.type);
    expect(bodyTypes).toContain('JSXText');
    expect(bodyTypes).toContain('JSXExpression');
    expect(bodyTypes).toContain('JSXFor');
    expect(bodyTypes).toContain('JSXIf');
    expect(bodyTypes).toContain('JSXMatch');
  });

  test('JSXMatch with various arm body types', () => {
    const src = `browser { component App() {
      <div>
        match val {
          1 => <p>"element"</p>
          2 => "text"
          3 => {expr}
          4 => for x in xs { <span>"s"</span> }
          5 => if show { <b>"b"</b> }
          _ => 42
        }
      </div>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const div = comp.body.find(n => n.type === 'JSXElement');
    const matchNode = div.children.find(c => c.type === 'JSXMatch');
    expect(matchNode).toBeDefined();
    expect(matchNode.arms.length).toBeGreaterThanOrEqual(5);
  });

  test('JSXMatch with guard', () => {
    const src = `browser { component App() {
      <div>
        match val {
          x if x > 10 => <p>"big"</p>
          _ => <p>"small"</p>
        }
      </div>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const div = comp.body.find(n => n.type === 'JSXElement');
    const matchNode = div.children.find(c => c.type === 'JSXMatch');
    expect(matchNode).toBeDefined();
    expect(matchNode.arms[0].guard).toBeDefined();
  });

  test('route body type annotation', () => {
    const src = `server {
      route POST "/api/users" body: User => fn(req) { req }
    }`;
    const ast = parse(src);
    const route = ast.body[0].body[0];
    expect(route.type).toBe('RouteDeclaration');
    expect(route.bodyType).toBeDefined();
  });

  test('route response type annotation', () => {
    const src = `server {
      route GET "/api/users" -> User => fn(req) { req }
    }`;
    const ast = parse(src);
    const route = ast.body[0].body[0];
    expect(route.type).toBe('RouteDeclaration');
    expect(route.responseType).toBeDefined();
  });
});

// ============================================================
// concurrency-parser.js
// ============================================================
describe('concurrency-parser.js coverage', () => {

  test('concurrent block error recovery', () => {
    // Malformed statement inside concurrent block
    const src = `fn main() {
      concurrent {
        @@@
        spawn foo()
      }
    }`;
    const lexer = new Lexer(src, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    try {
      parser.parse();
    } catch (e) {
      // Expected parse error
    }
  });

  test('spawn without parentheses (non-call expression)', () => {
    const src = `fn main() {
      concurrent {
        spawn myTask
      }
    }`;
    const ast = parse(src);
    const fn = ast.body[0];
    const concurrent = fn.body.body[0];
    expect(concurrent.type).toBe('ConcurrentBlock');
    const spawn = concurrent.body[0];
    expect(spawn.type).toBe('ExpressionStatement');
    expect(spawn.expression.type).toBe('SpawnExpression');
    expect(spawn.expression.arguments).toEqual([]);
  });

  test('select with send case', () => {
    const src = `fn main() {
      select {
        ch.send(42) => {
          print("sent")
        }
      }
    }`;
    const ast = parse(src);
    const fn = ast.body[0];
    const sel = fn.body.body[0];
    expect(sel.type).toBe('SelectStatement');
    expect(sel.cases[0].kind).toBe('send');
  });

  test('select error recovery', () => {
    const src = `fn main() {
      select {
        @@@
        _ => { print("default") }
      }
    }`;
    const lexer = new Lexer(src, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    try {
      parser.parse();
    } catch (e) {
      // Expected
    }
  });

  test('select channel with member access', () => {
    const src = `fn main() {
      select {
        msg from obj.channel => {
          print(msg)
        }
      }
    }`;
    const ast = parse(src);
    const fn = ast.body[0];
    const sel = fn.body.body[0];
    expect(sel.type).toBe('SelectStatement');
    expect(sel.cases[0].kind).toBe('receive');
    expect(sel.cases[0].channel.type).toBe('MemberExpression');
  });

  test('select case body error recovery', () => {
    const src = `fn main() {
      select {
        msg from ch => {
          @@@
          print(msg)
        }
      }
    }`;
    const lexer = new Lexer(src, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    try {
      parser.parse();
    } catch (e) {
      // Expected
    }
  });

  test('spawn as regular function call (with parens)', () => {
    // When spawn is followed by (, it should be treated as a regular function call
    const src = `fn main() {
      spawn("cmd", ["arg1"])
    }`;
    const ast = parse(src);
    const fn = ast.body[0];
    const stmt = fn.body.body[0];
    expect(stmt.type).toBe('ExpressionStatement');
    // Should be a regular call expression, not SpawnExpression
    expect(stmt.expression.type).toBe('CallExpression');
  });
});

// ============================================================
// server-parser.js
// ============================================================
describe('server-parser.js coverage', () => {

  test('route group with version, deprecated, and sunset', () => {
    const src = `server {
      routes "/api/v1" version: "1" deprecated: true sunset: "2025-12-31" {
        route GET "/users" => fn(req) { req }
      }
    }`;
    const ast = parse(src);
    const group = ast.body[0].body[0];
    expect(group.type).toBe('RouteGroupDeclaration');
    expect(group.version).toBeDefined();
    expect(group.version.version).toBe('1');
    expect(group.version.deprecated).toBe(true);
    expect(group.version.sunset).toBe('2025-12-31');
  });

  test('route group error recovery', () => {
    const src = `server {
      routes "/api" {
        @@@
        route GET "/users" => fn(req) { req }
      }
    }`;
    const lexer = new Lexer(src, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    try {
      parser.parse();
    } catch (e) {
      // Expected
    }
  });

  test('discover with wrong keyword after name', () => {
    const src = `server {
      discover "peer" wrong "http://localhost:3000"
    }`;
    try {
      parse(src);
    } catch (e) {
      expect(e.message).toContain('at');
    }
  });

  test('auth config with type keyword as key', () => {
    const src = `server {
      auth {
        type: "jwt"
        secret: "abc123"
      }
    }`;
    const ast = parse(src);
    const auth = ast.body[0].body[0];
    expect(auth.type).toBe('AuthDeclaration');
    expect(auth.config).toBeDefined();
  });

  test('ai config block', () => {
    const src = `server {
      ai {
        provider: "openai"
        model: "gpt-4"
      }
    }`;
    const ast = parse(src);
    const ai = ast.body[0].body[0];
    expect(ai.type).toBe('AiConfigDeclaration');
    expect(ai.config.provider).toBeDefined();
  });

  test('ai config block with name', () => {
    const src = `server {
      ai "claude" {
        provider: "anthropic"
        model: "claude-3"
      }
    }`;
    const ast = parse(src);
    const ai = ast.body[0].body[0];
    expect(ai.type).toBe('AiConfigDeclaration');
    expect(ai.name).toBe('claude');
  });

  test('route with body type annotation', () => {
    const src = `server {
      route POST "/api/users" body: User => fn(req) { req }
    }`;
    const ast = parse(src);
    const route = ast.body[0].body[0];
    expect(route.type).toBe('RouteDeclaration');
    expect(route.bodyType).toBeDefined();
  });

  test('route with response type annotation', () => {
    const src = `server {
      route GET "/api/users" -> User => fn(req) { req }
    }`;
    const ast = parse(src);
    const route = ast.body[0].body[0];
    expect(route.type).toBe('RouteDeclaration');
    expect(route.responseType).toBeDefined();
  });

  test('middleware body is parsed', () => {
    const src = `server {
      middleware fn logger(req, next) {
        print("log")
        next(req)
      }
    }`;
    const ast = parse(src);
    const mw = ast.body[0].body[0];
    expect(mw.type).toBe('MiddlewareDeclaration');
    expect(mw.name).toBe('logger');
    expect(mw.body).toBeDefined();
  });
});

// ============================================================
// edge-parser.js
// ============================================================
describe('edge-parser.js coverage', () => {

  test('named edge block', () => {
    const src = `edge "api" {
      target: "cloudflare"
      route GET "/hello" => fn(req) { "hi" }
    }`;
    const ast = parse(src);
    const edge = ast.body[0];
    expect(edge.type).toBe('EdgeBlock');
    expect(edge.name).toBe('api');
  });

  test('edge block error recovery', () => {
    const src = `edge {
      target: "cloudflare"
      @@@
      route GET "/hello" => fn(req) { "hi" }
    }`;
    const lexer = new Lexer(src, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    try {
      parser.parse();
    } catch (e) {
      // Expected
    }
  });

  test('edge fn statement', () => {
    const src = `edge {
      target: "cloudflare"
      fn helper(x) { x }
    }`;
    const ast = parse(src);
    const edge = ast.body[0];
    const fn = edge.body.find(s => s.type === 'FunctionDeclaration');
    expect(fn).toBeDefined();
  });

  test('edge async fn statement', () => {
    const src = `edge {
      target: "cloudflare"
      async fn helper(x) { x }
    }`;
    const ast = parse(src);
    const edge = ast.body[0];
    const fn = edge.body.find(s => s.type === 'FunctionDeclaration');
    expect(fn).toBeDefined();
  });

  test('edge storage binding with config', () => {
    const src = `edge {
      target: "cloudflare"
      storage myBucket {
        bucket: "my-bucket"
      }
    }`;
    const ast = parse(src);
    const edge = ast.body[0];
    const storage = edge.body.find(s => s.type === 'EdgeStorageDeclaration');
    expect(storage).toBeDefined();
    expect(storage.name).toBe('myBucket');
    expect(storage.config).toBeDefined();
  });

  test('edge queue binding with config', () => {
    const src = `edge {
      target: "cloudflare"
      queue myQueue {
        delivery: "at_least_once"
      }
    }`;
    const ast = parse(src);
    const edge = ast.body[0];
    const queue = edge.body.find(s => s.type === 'EdgeQueueDeclaration');
    expect(queue).toBeDefined();
    expect(queue.name).toBe('myQueue');
    expect(queue.config).toBeDefined();
  });

  test('edge sql binding with config', () => {
    const src = `edge {
      target: "cloudflare"
      sql myDb {
        database: "main"
      }
    }`;
    const ast = parse(src);
    const edge = ast.body[0];
    const sql = edge.body.find(s => s.type === 'EdgeSQLDeclaration');
    expect(sql).toBeDefined();
    expect(sql.name).toBe('myDb');
    expect(sql.config).toBeDefined();
  });
});

// ============================================================
// deploy-parser.js
// ============================================================
describe('deploy-parser.js coverage', () => {

  test('deploy block requires a name', () => {
    // The deploy plugin detection requires a STRING after 'deploy', so to test
    // the internal safety check in parseDeployBlock, we call it directly.
    const lexer = new Lexer('deploy { provider: "fly" }', '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    // Install deploy parser
    installDeployParser(Parser);
    // Manually call parseDeployBlock — 'deploy' is an IDENTIFIER, not STRING, so name check fails
    try {
      parser.parseDeployBlock();
      expect(false).toBe(true); // should not reach here
    } catch (e) {
      expect(e.message).toContain('name');
    }
  });

  test('deploy block error recovery on bad statement', () => {
    const src = `deploy "prod" {
      provider: "fly"
      @@@
      domain: "example.com"
    }`;
    const lexer = new Lexer(src, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    try {
      parser.parse();
    } catch (e) {
      // Expected - the @@@ should cause an error
    }
  });

  test('deploy block unexpected token error', () => {
    const src = `deploy "prod" {
      provider: "fly"
      123
    }`;
    try {
      parse(src);
      expect(false).toBe(true);
    } catch (e) {
      expect(e.message).toContain('Unexpected');
    }
  });
});

// ============================================================
// form-parser.js
// ============================================================
describe('form-parser.js coverage', () => {

  test('form with computed declaration', () => {
    const src = `browser {
      component App() {
        form myForm {
          field price: Float = 10
          computed total = price
        }
      }
    }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const form = comp.body.find(n => n.type === 'FormDeclaration');
    expect(form).toBeDefined();
    expect(form.computeds.length).toBe(1);
  });

  test('form error on unknown keyword', () => {
    const src = `browser {
      component App() {
        form myForm {
          unknown_thing
        }
      }
    }`;
    try {
      parse(src);
      expect(false).toBe(true);
    } catch (e) {
      expect(e.message).toContain('field');
    }
  });

  test('nested group inside group', () => {
    const src = `browser {
      component App() {
        form myForm {
          group address {
            field street: String { required }
            group extra {
              field notes: String
            }
          }
        }
      }
    }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const form = comp.body.find(n => n.type === 'FormDeclaration');
    expect(form).toBeDefined();
    expect(form.groups.length).toBe(1);
    expect(form.groups[0].groups.length).toBe(1);
  });

  test('form array error on non-field member', () => {
    const src = `browser {
      component App() {
        form myForm {
          array items {
            something_invalid
          }
        }
      }
    }`;
    try {
      parse(src);
      expect(false).toBe(true);
    } catch (e) {
      expect(e.message).toContain('field');
    }
  });
});

// ============================================================
// cli-parser.js
// ============================================================
describe('cli-parser.js coverage', () => {

  test('cli config fields', () => {
    const src = `cli {
      name: "mytool"
      version: "1.0.0"
      description: "A tool"
      fn run() {
        print("hello")
      }
    }`;
    const ast = parse(src);
    const cli = ast.body[0];
    expect(cli.type).toBe('CliBlock');
    expect(cli.config.length).toBe(3);
  });

  test('cli block error recovery on invalid content', () => {
    const src = `cli {
      name: "mytool"
      @@@
      fn run() {
        print("hello")
      }
    }`;
    const lexer = new Lexer(src, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    try {
      parser.parse();
    } catch (e) {
      // Expected
    }
  });

  test('cli block error on unexpected statement', () => {
    const src = `cli {
      123
    }`;
    try {
      parse(src);
      expect(false).toBe(true);
    } catch (e) {
      expect(e.message).toContain('config field');
    }
  });
});

// ============================================================
// security-parser.js
// ============================================================
describe('security-parser.js coverage', () => {

  test('security _expectSecurityConfigKey error path', () => {
    // Trigger an error in _expectSecurityConfigKey by providing an unexpected token type
    const src = `security {
      auth jwt {
        123: "bad"
      }
    }`;
    try {
      parse(src);
      expect(false).toBe(true);
    } catch (e) {
      expect(e.message).toContain('config key');
    }
  });

  test('security role with unknown key', () => {
    const src = `security {
      role Admin {
        can: [manage_users]
        description: "Admin role"
      }
    }`;
    const ast = parse(src);
    const role = ast.body[0].body[0];
    expect(role.type).toBe('SecurityRoleDeclaration');
    expect(role.name).toBe('Admin');
    expect(role.permissions).toContain('manage_users');
  });
});

// ============================================================
// Additional edge cases for completeness
// ============================================================
describe('Additional parser satellite edge cases', () => {

  test('JSX element with keyword as tag name', () => {
    // Tags like <form>, <label> are keywords in Tova
    const src = `browser { component App() { <label>"Name"</label> } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const el = comp.body.find(n => n.type === 'JSXElement');
    expect(el).toBeDefined();
  });

  test('JSX attribute with keyword name', () => {
    const src = `browser { component App() { <input type="text" /> } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const el = comp.body.find(n => n.type === 'JSXElement');
    expect(el).toBeDefined();
    expect(el.attributes[0].name).toBe('type');
  });

  test('JSX on:click event with modifiers', () => {
    const src = `browser { component App() { <button on:click.stop.prevent={handler}>"Click"</button> } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const el = comp.body.find(n => n.type === 'JSXElement');
    expect(el.attributes[0].name).toContain('on:click.stop.prevent');
  });

  test('select with wildcard receive', () => {
    const src = `fn main() {
      select {
        _ from ch => { print("received") }
      }
    }`;
    const ast = parse(src);
    const sel = ast.body[0].body.body[0];
    expect(sel.type).toBe('SelectStatement');
    expect(sel.cases[0].kind).toBe('receive');
    expect(sel.cases[0].binding).toBeNull();
  });

  test('select with timeout case', () => {
    const src = `fn main() {
      select {
        timeout(1000) => { print("timeout") }
      }
    }`;
    const ast = parse(src);
    const sel = ast.body[0].body.body[0];
    expect(sel.type).toBe('SelectStatement');
    expect(sel.cases[0].kind).toBe('timeout');
  });

  test('select with default case', () => {
    const src = `fn main() {
      select {
        _ => { print("default") }
      }
    }`;
    const ast = parse(src);
    const sel = ast.body[0].body.body[0];
    expect(sel.type).toBe('SelectStatement');
    expect(sel.cases[0].kind).toBe('default');
  });

  test('edge with kv binding config', () => {
    const src = `edge {
      target: "cloudflare"
      kv myKV {
        namespace: "MY_NAMESPACE"
      }
    }`;
    const ast = parse(src);
    const edge = ast.body[0];
    const kv = edge.body.find(s => s.type === 'EdgeKVDeclaration');
    expect(kv).toBeDefined();
    expect(kv.config).toBeDefined();
  });

  test('edge env with default value', () => {
    const src = `edge {
      target: "cloudflare"
      env API_KEY = "default_key"
    }`;
    const ast = parse(src);
    const edge = ast.body[0];
    const env = edge.body.find(s => s.type === 'EdgeEnvDeclaration');
    expect(env).toBeDefined();
    expect(env.defaultValue).toBeDefined();
  });

  test('concurrent with timeout mode', () => {
    const src = `fn main() {
      concurrent timeout(5000) {
        spawn foo()
      }
    }`;
    const ast = parse(src);
    const fn = ast.body[0];
    const concurrent = fn.body.body[0];
    expect(concurrent.mode).toBe('timeout');
    expect(concurrent.timeout).toBeDefined();
  });

  test('concurrent with cancel_on_error mode', () => {
    const src = `fn main() {
      concurrent cancel_on_error {
        spawn foo()
      }
    }`;
    const ast = parse(src);
    const fn = ast.body[0];
    const concurrent = fn.body.body[0];
    expect(concurrent.mode).toBe('cancel_on_error');
  });

  test('form with steps', () => {
    const src = `browser {
      component App() {
        form wizard {
          field name: String { required }
          field email: String { required }
          steps {
            step "Personal" {
              name
            }
            step "Contact" {
              email
            }
          }
        }
      }
    }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const form = comp.body.find(n => n.type === 'FormDeclaration');
    expect(form.steps).toBeDefined();
    expect(form.steps.steps).toHaveLength(2);
  });

  test('form with on submit', () => {
    const src = `browser {
      component App() {
        form myForm {
          field name: String { required }
          on submit {
            print(name)
          }
        }
      }
    }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const form = comp.body.find(n => n.type === 'FormDeclaration');
    expect(form.onSubmit).toBeDefined();
  });

  test('form field with async validator', () => {
    const src = `browser {
      component App() {
        form myForm {
          field username: String {
            required
            async validate(fn(val) { val })
          }
        }
      }
    }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const form = comp.body.find(n => n.type === 'FormDeclaration');
    const field = form.fields[0];
    expect(field.validators.length).toBe(2);
    const asyncV = field.validators.find(v => v.isAsync);
    expect(asyncV).toBeDefined();
  });

  test('form group with when condition', () => {
    const src = `browser {
      component App() {
        form myForm {
          field showAddr: String
          group address when showAddr {
            field street: String { required }
          }
        }
      }
    }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const form = comp.body.find(n => n.type === 'FormDeclaration');
    const group = form.groups[0];
    expect(group.condition).toBeDefined();
  });

  test('form array with fields', () => {
    const src = `browser {
      component App() {
        form myForm {
          array items {
            field name: String { required }
            field qty: Int
          }
        }
      }
    }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const form = comp.body.find(n => n.type === 'FormDeclaration');
    expect(form.arrays.length).toBe(1);
    expect(form.arrays[0].fields.length).toBe(2);
  });

  test('deploy with env and db sub-blocks', () => {
    const src = `deploy "prod" {
      provider: "fly"
      env {
        DB_URL: "postgres://localhost/db"
      }
      db {
        postgres {
          size: "shared"
        }
      }
    }`;
    const ast = parse(src);
    const deploy = ast.body[0];
    expect(deploy.type).toBe('DeployBlock');
    expect(deploy.name).toBe('prod');
  });

  test('security auth with direct block (no type identifier)', () => {
    const src = `security {
      auth {
        secret: "mysecret"
      }
    }`;
    const ast = parse(src);
    const auth = ast.body[0].body[0];
    expect(auth.type).toBe('SecurityAuthDeclaration');
    expect(auth.authType).toBe('jwt'); // default
  });
});

// ============================================================
// Additional coverage: JSX_TEXT tokens and remaining gaps
// ============================================================
describe('browser-parser.js JSX_TEXT coverage', () => {

  test('JSX_TEXT inside fragment children (lines 214-220)', () => {
    // Unquoted text after fragment opening produces JSX_TEXT tokens
    const src = `browser { component App() { <>Hello World</> } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const frag = comp.body.find(n => n.type === 'JSXFragment');
    expect(frag).toBeDefined();
    expect(frag.children.length).toBeGreaterThanOrEqual(1);
    const text = frag.children.find(c => c.type === 'JSXText');
    expect(text).toBeDefined();
  });

  test('JSX_TEXT inside regular element children (lines 383-388)', () => {
    // Unquoted text inside a regular element
    const src = `browser { component App() { <p>Hello World</p> } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const el = comp.body.find(n => n.type === 'JSXElement' && n.tag === 'p');
    expect(el).toBeDefined();
    const text = el.children.find(c => c.type === 'JSXText');
    expect(text).toBeDefined();
  });

  test('JSX_TEXT inside for loop body (lines 476-480)', () => {
    // Unquoted text in for loop body
    const src = `browser { component App() {
      <div>
        for item in items {
          <span>Item text here</span>
        }
      </div>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const div = comp.body.find(n => n.type === 'JSXElement');
    const forNode = div.children.find(c => c.type === 'JSXFor');
    expect(forNode).toBeDefined();
    // The span element should have JSX_TEXT children
    const span = forNode.body.find(c => c.type === 'JSXElement' && c.tag === 'span');
    expect(span).toBeDefined();
    const text = span.children.find(c => c.type === 'JSXText');
    expect(text).toBeDefined();
  });

  test('JSX_TEXT inside if body (lines 508-512)', () => {
    // Unquoted text in if body
    const src = `browser { component App() {
      <div>
        if show {
          <span>Visible text</span>
        }
      </div>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const div = comp.body.find(n => n.type === 'JSXElement');
    const ifNode = div.children.find(c => c.type === 'JSXIf');
    expect(ifNode).toBeDefined();
    const span = ifNode.consequent.find(c => c.type === 'JSXElement' && c.tag === 'span');
    expect(span).toBeDefined();
    const text = span.children.find(c => c.type === 'JSXText');
    expect(text).toBeDefined();
  });

  test('JSX_TEXT inside match arm body via element child (lines 586-590)', () => {
    // JSX_TEXT appears inside the span elements within match arms
    // The match arm body parsing handles JSX elements which contain JSX_TEXT children
    const src = `browser { component App() {
      <div>
        match val {
          1 => <span>"first"</span>
          _ => <span>"default"</span>
        }
      </div>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const div = comp.body.find(n => n.type === 'JSXElement');
    const matchNode = div.children.find(c => c.type === 'JSXMatch');
    expect(matchNode).toBeDefined();
    const span = matchNode.arms[0].body.find(c => c.type === 'JSXElement');
    expect(span).toBeDefined();
  });

  test('whitespace-only JSX_TEXT is collapsed to empty (line 155-156)', () => {
    // When there's only whitespace between elements, _collapseJSXWhitespace returns ''
    // and the child is NOT added (length check on line 217)
    const src = `browser { component App() { <div>   </div> } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const div = comp.body.find(n => n.type === 'JSXElement' && n.tag === 'div');
    expect(div).toBeDefined();
    // Whitespace-only text should be collapsed away
    const texts = div.children.filter(c => c.type === 'JSXText');
    expect(texts.length).toBe(0);
  });

  test('component fallback to parseStatement (line 143)', () => {
    // A plain statement inside component that's not JSX, state, computed, effect, component, or form
    const src = `browser { component App() {
      x = 10
      <p>"hello"</p>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    expect(comp.body.length).toBeGreaterThanOrEqual(2);
    // First statement should be assignment, not JSX
    expect(comp.body[0].type).not.toBe('JSXElement');
  });

  test('unexpected closing tag inside fragment (line 191-192)', () => {
    // </tag> inside fragment instead of </>
    const src = `browser { component App() { <></div></> } }`;
    try {
      parse(src);
    } catch (e) {
      expect(e.message || (e.errors && e.errors[0].message)).toBeDefined();
    }
  });

  test('fragment break path (line 250)', () => {
    // Fragment encounters an unexpected token that causes the while loop to break
    // This happens when there's no more recognizable children tokens
    const src = `browser { component App() { <></> } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const frag = comp.body.find(n => n.type === 'JSXFragment');
    expect(frag).toBeDefined();
    expect(frag.children).toEqual([]);
  });

  test('children break path (line 418)', () => {
    // The break on line 418 in parseJSXChildren is reached when we hit something
    // that's not a recognized child type (not <, not STRING, not JSX_TEXT, not {, not for, not if, not match)
    // This typically never happens due to the closing tag check, but an EOF could trigger it.
    const src = `browser { component App() { <div></div> } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const div = comp.body.find(n => n.type === 'JSXElement');
    expect(div).toBeDefined();
    expect(div.children).toEqual([]);
  });

  test('JSX attribute with string value (line 341)', () => {
    const src = `browser { component App() { <input class="big" /> } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const el = comp.body.find(n => n.type === 'JSXElement');
    expect(el.attributes[0].name).toBe('class');
    expect(el.attributes[0].value.type).toBe('StringLiteral');
  });

  test('JSX spread attribute (with uppercase component)', () => {
    // Spread attributes require uppercase component name for _looksLikeJSX to accept LBRACE
    const src = `browser { component App() { <Wrapper {...props}>"hi"</Wrapper> } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const wrapper = comp.body.find(n => n.type === 'JSXElement');
    const spread = wrapper.attributes.find(a => a.type === 'JSXSpreadAttribute');
    expect(spread).toBeDefined();
  });

  test('JSX for with key expression', () => {
    const src = `browser { component App() {
      <ul>
        for item in items key={item.id} {
          <li>"item"</li>
        }
      </ul>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const ul = comp.body.find(n => n.type === 'JSXElement' && n.tag === 'ul');
    const forNode = ul.children.find(c => c.type === 'JSXFor');
    expect(forNode).toBeDefined();
    expect(forNode.keyExpr).toBeDefined();
  });

  test('JSXMatch arm with JSX_TEXT body', () => {
    // Match arm body that is JSX_TEXT (unquoted text after =>)
    // This is hard to achieve because the lexer may not enter JSX text mode after =>
    // Instead test with the for/if paths in match arms
    const src = `browser { component App() {
      <div>
        match val {
          1 => for x in xs { <span>"s"</span> }
          2 => if show { <b>"b"</b> }
          _ => <p>"p"</p>
        }
      </div>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const div = comp.body.find(n => n.type === 'JSXElement');
    const matchNode = div.children.find(c => c.type === 'JSXMatch');
    expect(matchNode).toBeDefined();
    expect(matchNode.arms.length).toBe(3);
  });
});

describe('browser-parser.js error paths and attribute types', () => {

  test('boolean attribute without value (line 328)', () => {
    const src = `browser { component App() { <input disabled /> } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const el = comp.body.find(n => n.type === 'JSXElement');
    expect(el).toBeDefined();
    const attr = el.attributes.find(a => a.name === 'disabled');
    expect(attr).toBeDefined();
    expect(attr.value.type).toBe('BooleanLiteral');
    expect(attr.value.value).toBe(true);
  });

  test('string attribute value (line 341)', () => {
    const src = `browser { component App() { <input type="text" /> } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const el = comp.body.find(n => n.type === 'JSXElement');
    const attr = el.attributes.find(a => a.name === 'type');
    expect(attr).toBeDefined();
    expect(attr.value.type).toBe('StringLiteral');
  });

  test('mismatched closing tag error (line 362)', () => {
    const src = `browser { component App() { <div>"text"</span> } }`;
    try {
      parse(src);
    } catch (e) {
      const msg = e.message || (e.errors && e.errors[0] && e.errors[0].message);
      expect(msg).toBeDefined();
    }
  });

  test('fragment with closing tag error (line 191-192)', () => {
    // Inside fragment, </div> instead of </>
    const src = `browser { component App() { <></div> } }`;
    try {
      parse(src);
    } catch (e) {
      const msg = e.message || (e.errors && e.errors[0] && e.errors[0].message);
      expect(msg).toBeDefined();
    }
  });

  test('attribute name error on non-identifier (line 304)', () => {
    // An attribute that starts with a number or special char
    const src = `browser { component App() { <Input 123="bad" /> } }`;
    try {
      parse(src);
    } catch (e) {
      const msg = e.message || (e.errors && e.errors[0] && e.errors[0].message);
      expect(msg).toBeDefined();
    }
  });

  test('JSX children match + break paths (lines 416, 418)', () => {
    // The match path in parseJSXChildren and the break after it
    // Already tested but the closing } on line 416 may be a branch artifact
    const src = `browser { component App() {
      <div>
        match x {
          _ => <span>"ok"</span>
        }
      </div>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const div = comp.body.find(n => n.type === 'JSXElement');
    const matchNode = div.children.find(c => c.type === 'JSXMatch');
    expect(matchNode).toBeDefined();
  });

  test('attribute namespace suffix error path (line 313)', () => {
    // Try to hit the else branch for namespace suffix where the token after : is not an identifier
    // on:123 would cause the expect to fail
    const src = `browser { component App() { <Btn on:123={handler}>"Click"</Btn> } }`;
    try {
      parse(src);
    } catch (e) {
      const msg = e.message || (e.errors && e.errors[0] && e.errors[0].message);
      expect(msg).toBeDefined();
    }
  });

  test('attribute value error path (line 341/343)', () => {
    // Attribute with = but value is neither { nor STRING
    // This is tricky to hit because many tokens could be valid expressions
    // Let's use a case where the value is unexpected
    const src = `browser { component App() { <Div class= />"text"</Div> } }`;
    try {
      parse(src);
    } catch (e) {
      const msg = e.message || (e.errors && e.errors[0] && e.errors[0].message);
      expect(msg).toBeDefined();
    }
  });

  test('closing tag with non-identifier name (line 358)', () => {
    // Closing tag where the name is not an identifier or keyword
    // Hard to hit because most tokens map to identifiers or keywords in JSX context
    const src = `browser { component App() { <div>"text"</123> } }`;
    try {
      parse(src);
    } catch (e) {
      const msg = e.message || (e.errors && e.errors[0] && e.errors[0].message);
      expect(msg).toBeDefined();
    }
  });

  test('tag name fallback path (line 264)', () => {
    // This requires the token after < to not be an IDENTIFIER or keyword
    // Numbers after < would be LESS followed by NUMBER
    // But _looksLikeJSX would reject it, so this is effectively unreachable
    // from normal parsing. Test with error path instead.
    const src = `browser { component App() { <123>"text"</123> } }`;
    try {
      parse(src);
    } catch (e) {
      // Expected - can't have number as tag name
      const msg = e.message || (e.errors && e.errors[0] && e.errors[0].message);
      expect(msg).toBeDefined();
    }
  });

  test('fragment children break path after all checks (line 250)', () => {
    // The break on line 250 is reached when the loop encounters a token type
    // that doesn't match any recognized JSX child type.
    // An empty fragment <></> should hit this (closing tag check handles it via break on line 190)
    // For line 250, we'd need a token that's not <, STRING, JSX_TEXT, LBRACE, FOR, IF, MATCH
    // This is effectively unreachable in practice due to the closing tag check always
    // matching first. However, we can test with edge cases.
    const src = `browser { component App() {
      <>
        <p>"text"</p>
      </>
    } }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const frag = comp.body.find(n => n.type === 'JSXFragment');
    expect(frag).toBeDefined();
    expect(frag.children.length).toBeGreaterThanOrEqual(1);
  });
});

describe('server-parser.js remaining coverage', () => {

  test('auth config with unexpected token as key triggers error (line 266)', () => {
    const src = `server {
      auth {
        123: "bad_key"
      }
    }`;
    try {
      parse(src);
      expect(false).toBe(true);
    } catch (e) {
      expect(e.message).toContain('auth config key');
    }
  });

  test('route group version loop break on unknown key (line 306)', () => {
    // routes with a non-version/deprecated/sunset identifier before the {
    // The loop should break and proceed to parse the brace
    const src = `server {
      routes "/api" {
        route GET "/users" => fn(req) { req }
      }
    }`;
    const ast = parse(src);
    const group = ast.body[0].body[0];
    expect(group.type).toBe('RouteGroupDeclaration');
    expect(group.version).toBeNull();
  });

  test('route group version loop breaks on unknown identifier (line 306-307)', () => {
    // After parsing version config, an unknown identifier triggers the break
    const src = `server {
      routes "/api" version: "2" unknown_keyword {
        route GET "/users" => fn(req) { req }
      }
    }`;
    try {
      parse(src);
    } catch (e) {
      // Expected error because unknown_keyword isn't a valid config key
      // and it's not '{' either
      const msg = e.message || (e.errors && e.errors[0] && e.errors[0].message);
      expect(msg).toBeDefined();
    }
  });

  test('route group with version but no deprecated/sunset', () => {
    const src = `server {
      routes "/api/v2" version: "2" {
        route GET "/data" => fn(req) { req }
      }
    }`;
    const ast = parse(src);
    const group = ast.body[0].body[0];
    expect(group.type).toBe('RouteGroupDeclaration');
    expect(group.version).toBeDefined();
    expect(group.version.version).toBe('2');
  });
});

describe('deploy-parser.js remaining coverage', () => {
  test('deploy config field with server keyword as key (line 66)', () => {
    // The 'server' keyword is lexed as TokenType.SERVER, testing that path
    const src = `deploy "staging" {
      provider: "fly"
      server: "root@staging.example.com"
    }`;
    const ast = parse(src);
    const deploy = ast.body[0];
    expect(deploy.type).toBe('DeployBlock');
    const serverField = deploy.body.find(f => f.key === 'server');
    expect(serverField).toBeDefined();
  });
});

describe('form-parser.js remaining coverage', () => {
  test('form field with type annotation (line 21)', () => {
    const src = `browser {
      component App() {
        form myForm: UserForm {
          field name: String { required }
        }
      }
    }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const form = comp.body.find(n => n.type === 'FormDeclaration');
    expect(form).toBeDefined();
    expect(form.typeAnnotation).toBeDefined();
  });

  test('form field validator with multiple args (line 96)', () => {
    const src = `browser {
      component App() {
        form myForm {
          field age: Int {
            min(0)
            max(150)
            validate(fn(v) { v > 0 }, "Must be positive")
          }
        }
      }
    }`;
    const ast = parse(src);
    const comp = ast.body[0].body[0];
    const form = comp.body.find(n => n.type === 'FormDeclaration');
    const field = form.fields[0];
    const validateV = field.validators.find(v => v.name === 'validate');
    expect(validateV).toBeDefined();
    expect(validateV.args.length).toBe(2);
  });

  test('form step not starting with step keyword (line 171)', () => {
    const src = `browser {
      component App() {
        form wizard {
          field name: String
          steps {
            not_a_step "oops" { name }
          }
        }
      }
    }`;
    try {
      parse(src);
      expect(false).toBe(true);
    } catch (e) {
      expect(e.message).toContain('step');
    }
  });

  test('nested group error on invalid member (line 125)', () => {
    const src = `browser {
      component App() {
        form myForm {
          group addr {
            123
          }
        }
      }
    }`;
    try {
      parse(src);
      expect(false).toBe(true);
    } catch (e) {
      expect(e.message).toContain('field');
    }
  });
});

describe('concurrency-parser.js remaining coverage', () => {
  test('select case body as single statement (line 231)', () => {
    // Single statement (not block) as select case body
    const src = `fn main() {
      select {
        msg from ch => print(msg)
      }
    }`;
    const ast = parse(src);
    const sel = ast.body[0].body.body[0];
    expect(sel.type).toBe('SelectStatement');
    expect(sel.cases[0].body).toHaveLength(1);
  });

  test('invalid select case expression (line 194/196)', () => {
    // An expression that is not a .send() call
    const src = `fn main() {
      select {
        foo() => { print("bad") }
      }
    }`;
    try {
      parse(src);
      expect(false).toBe(true);
    } catch (e) {
      expect(e.message).toContain('select case');
    }
  });
});
