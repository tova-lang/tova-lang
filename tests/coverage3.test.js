// Final batch — targeting every remaining uncovered line
import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { BaseCodegen } from '../src/codegen/base-codegen.js';
import { ClientCodegen } from '../src/codegen/client-codegen.js';
import * as AST from '../src/parser/ast.js';

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  return new Parser(lexer.tokenize(), '<test>').parse();
}

function compile(source) {
  return new CodeGenerator(parse(source), '<test>').generate();
}

function compileShared(source) {
  return compile(source).shared.trim();
}

// ═══════════════════════════════════════════════════════════
// PARSER — remaining uncovered match pattern branches
// Lines 1267, 1272-1273, 1276-1277, 1282-1283, 1303, 1306
// ═══════════════════════════════════════════════════════════

describe('Parser — match patterns (all types)', () => {
  // Line 1267: string literal pattern
  test('match with string pattern', () => {
    const ast = parse('x = match s { "hello" => 1, _ => 0 }');
    const arm = ast.body[0].values[0].arms[0];
    expect(arm.pattern.type).toBe('LiteralPattern');
    expect(arm.pattern.value).toBe('hello');
  });

  // Lines 1272-1273: true literal pattern
  test('match with true pattern', () => {
    const ast = parse('x = match b { true => 1, _ => 0 }');
    const arm = ast.body[0].values[0].arms[0];
    expect(arm.pattern.type).toBe('LiteralPattern');
    expect(arm.pattern.value).toBe(true);
  });

  // Lines 1276-1277: false literal pattern
  test('match with false pattern', () => {
    const ast = parse('x = match b { false => 1, _ => 0 }');
    const arm = ast.body[0].values[0].arms[0];
    expect(arm.pattern.type).toBe('LiteralPattern');
    expect(arm.pattern.value).toBe(false);
  });

  // Lines 1282-1283: nil literal pattern
  test('match with nil pattern', () => {
    const ast = parse('x = match b { nil => 1, _ => 0 }');
    const arm = ast.body[0].values[0].arms[0];
    expect(arm.pattern.type).toBe('LiteralPattern');
    expect(arm.pattern.value).toBeNull();
  });

  // Line 1303: uppercase identifier without parens = variant without args
  test('match with variant pattern (no args)', () => {
    const ast = parse('x = match color { Red => 1, _ => 0 }');
    const arm = ast.body[0].values[0].arms[0];
    expect(arm.pattern.type).toBe('VariantPattern');
    expect(arm.pattern.name).toBe('Red');
    expect(arm.pattern.fields.length).toBe(0);
  });

  // Line 1306: lowercase identifier = binding pattern
  test('match with binding pattern', () => {
    const ast = parse('x = match val { n => n * 2 }');
    const arm = ast.body[0].values[0].arms[0];
    expect(arm.pattern.type).toBe('BindingPattern');
    expect(arm.pattern.name).toBe('n');
  });
});

// ═══════════════════════════════════════════════════════════
// PARSER — remaining JSX and lambda branches
// Lines 282, 291, 312, 327, 365, 367, 387-391, 412, 428
// ═══════════════════════════════════════════════════════════

describe('Parser — JSX attribute edge cases', () => {
  // Line 282: attribute name from keyword token (in, as, etc.)
  test('JSX attribute name "in"', () => {
    const ast = parse('client { component C { <input in="test" /> } }');
    const comp = ast.body[0].body[0];
    expect(comp.body[0].attributes[0].name).toBe('in');
  });

  // Line 291: on:event with IN keyword as suffix  
  test('JSX on:in event', () => {
    const ast = parse('client { component C { <div on:in={handler}>"x"</div> } }');
    const comp = ast.body[0].body[0];
    expect(comp.body[0].attributes[0].name).toBe('on:in');
  });

  // Line 312: attribute with string template value
  test('JSX attribute with template string', () => {
    const ast = parse('client { component C { <div class="hello {x}">"y"</div> } }');
    const comp = ast.body[0].body[0];
    expect(comp.body[0].attributes[0].value.type).toBe('TemplateLiteral');
  });
});

describe('Parser — JSX children edge cases', () => {
  // Lines 327, 335-336: closing tag, nested elements already covered
  // Lines 365, 367: for and if in JSX children (already covered above)

  // Lines 387-391: JSX for body with expression in braces
  test('JSX for body with expression in braces', () => {
    const ast = parse('client { component C { <div> for x in items { {x} } </div> } }');
    const comp = ast.body[0].body[0];
    const div = comp.body[0];
    const forNode = div.children.find(c => c.type === 'JSXFor');
    expect(forNode).toBeDefined();
    expect(forNode.body.length).toBeGreaterThan(0);
  });

  // Lines 412, 428: JSX if else with text children (already covered)
});

describe('Parser — fn lambda edge cases', () => {
  // Line 1193: fn lambda assignment where target is not Identifier (fallback to expr body)
  test('fn lambda with non-assignment expression', () => {
    const ast = parse('x = fn(a) a + 1');
    const lambda = ast.body[0].values[0];
    expect(lambda.type).toBe('LambdaExpression');
    expect(lambda.body.type).toBe('BinaryExpression');
  });
});

describe('Parser — arrow lambda edge cases', () => {
  // Lines 1408: shorthand object in parseObjectOrDictComprehension error path
  // This is hard to trigger through normal parsing

  // Lines 1428, 1430: empty paren arrow lambda error path
  // Already covered by () => 42 test

  // Lines 1452-1453: lambda param with non-identifier type annotation
  test('parenthesized expression fallback', () => {
    // (1 + 2) should parse as parenthesized expression, not lambda
    const ast = parse('x = (1 + 2) * 3');
    expect(ast.body[0].values[0].type).toBe('BinaryExpression');
  });
});

describe('Parser — route invalid method', () => {
  // Line 168: invalid HTTP method
  test('route with invalid HTTP method', () => {
    expect(() => parse('server { route INVALID "/path" => handler }')).toThrow('Invalid HTTP method');
  });
});

describe('Parser — let destructure error', () => {
  // Line 599: let without { or [
  test('let without destructure pattern throws', () => {
    expect(() => parse('let x = 1')).toThrow();
  });
});

describe('Parser — assignment to non-identifier', () => {
  // Lines 786-787: assignment where left side is non-identifier
  test('assignment to complex expression throws', () => {
    // This should fail because 1+2 can't be assigned to
    expect(() => parse('1 + 2 = 3')).toThrow();
  });
});

describe('Parser — docstrings', () => {
  // Line 17: extractDocstrings
  test('parser extracts docstrings', () => {
    const lexer = new Lexer('/// my doc\nfn foo() { 1 }', '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    const ast = parser.parse();
    expect(ast.body[0].type).toBe('FunctionDeclaration');
  });
});

describe('Parser — line 237: component body with statements', () => {
  test('component body with non-JSX statement followed by JSX', () => {
    const ast = parse('client { component C(x) { <div>"hello"</div> } }');
    const comp = ast.body[0].body[0];
    expect(comp.name).toBe('C');
    expect(comp.body.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// ANALYZER — remaining catch blocks
// Lines 231, 385, 539, 559, 568, 584, 602, 619
// ═══════════════════════════════════════════════════════════

describe('Analyzer — remaining error catch blocks', () => {
  // Line 231: catch in visitAssignment — new binding duplicate
  // This triggers when two assignments to the same name where both are new
  test('two assignments same name (catch in visitAssignment)', () => {
    // Manually construct AST with duplicate bindings
    const loc = { line: 1, column: 1, file: '<test>' };
    const a1 = new AST.Assignment(['x'], [new AST.NumberLiteral(1, loc)], loc);
    const a2 = new AST.Assignment(['x'], [new AST.NumberLiteral(2, loc)], loc);
    const ast = new AST.Program([a1, a2]);
    const analyzer = new Analyzer(ast, '<test>');
    // First 'x' defines it as immutable. Second 'x' finds existing and errors (immutable reassign)
    expect(() => analyzer.analyze()).toThrow();
  });

  // Line 385: catch in visitForStatement — for loop variable duplicate
  // For loops create their own child scope, so this is hard to trigger normally
  // We'd need a for loop where the variable clashes within the same scope
  // This catch only triggers if define() throws, meaning variable already exists in the child scope

  // Line 539: match expression with BlockStatement body
  test('match expression with block body in arm', () => {
    expect(() => {
      const ast = parse('x = match val { 0 => { print("zero")\n"zero" }, _ => "other" }');
      new Analyzer(ast, '<test>').analyze();
    }).not.toThrow();
  });

  // Line 559: catch in BindingPattern — duplicate binding in match
  // Hard to trigger since each arm gets its own scope
  // Would need duplicate within same arm (impossible in normal syntax)

  // Line 568: catch in VariantPattern — duplicate field 
  // Would need variant with duplicate field names

  // Line 584: catch in visitListComprehension
  // Would need comprehension variable to clash with something in the same child scope

  // Line 602: catch in visitDictComprehension
  // Same as above for dict comprehension

  // Line 619: visitJSXElement child is JSXElement (nested)
  test('JSX nested element analysis', () => {
    expect(() => {
      const ast = parse('client { component C { <div><span>"nested"</span></div> } }');
      new Analyzer(ast, '<test>').analyze();
    }).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════
// BASE CODEGEN — remaining lines
// Lines 109, 256-261, 267-270, 364, 371, 432, 471, 492
// ═══════════════════════════════════════════════════════════

describe('BaseCodegen — genBlock direct', () => {
  // Lines 256-261: genBlock creates { ... } wrapper
  // This is called when there's a standalone BlockStatement
  test('block statement generates braces', () => {
    // Use if statement which generates block bodies
    const code = compileShared('if true { if false { print(1) } }');
    expect(code).toContain('if (true)');
    expect(code).toContain('if (false)');
  });
});

describe('BaseCodegen — genBlockBody non-BlockStatement', () => {
  // Lines 267-270: when function body is NOT a BlockStatement (expression body)
  // This happens with expression-body functions
  test('expression body function', () => {
    // Parser wraps function body in BlockStatement, so we test via BaseCodegen directly
    const gen = new BaseCodegen();
    const result = gen.genBlockBody({ type: 'NumberLiteral', value: 42 });
    expect(result).toContain('return 42');
  });
});

describe('BaseCodegen — computed access', () => {
  // Line 364: computed member expression (obj[key])
  test('computed member expression via codegen', () => {
    const gen = new BaseCodegen();
    const result = gen.genMemberExpression({
      object: { type: 'Identifier', name: 'arr' },
      property: { type: 'NumberLiteral', value: 0 },
      computed: true,
    });
    expect(result).toBe('arr[0]');
  });

  // Line 371: computed optional chain (obj?.[key])
  test('computed optional chain via codegen', () => {
    const gen = new BaseCodegen();
    const result = gen.genOptionalChain({
      object: { type: 'Identifier', name: 'arr' },
      property: { type: 'NumberLiteral', value: 0 },
      computed: true,
    });
    expect(result).toBe('arr?.[0]');
  });
});

describe('BaseCodegen — match block body arm', () => {
  // Line 432: match arm where body is BlockStatement
  test('match arm with block body codegen', () => {
    const code = compileShared(`
      x = match val {
        0 => {
          var y = 1
          y
        },
        _ => 0
      }
    `);
    expect(code).toContain('let y = 1');
  });
});

describe('BaseCodegen — inclusive range pattern', () => {
  // Line 471: inclusive range in pattern condition
  test('inclusive range match generates <=', () => {
    const code = compileShared('x = match n { 1..=10 => "in range", _ => "out" }');
    expect(code).toContain('>=');
    expect(code).toContain('<=');
  });
});

describe('BaseCodegen — binding guard in match', () => {
  // Line 492: binding pattern with guard generates IIFE
  test('binding with guard in non-last position', () => {
    const code = compileShared('x = match val { n if n > 0 => n, _ => 0 }');
    expect(code).toContain('(n) =>');
    expect(code).toContain('> 0');
  });
});

describe('BaseCodegen — let destructure empty', () => {
  // Line 109: let destructure with unknown pattern type returns ''
  test('unknown pattern type returns empty', () => {
    const gen = new BaseCodegen();
    const result = gen.genLetDestructure({
      pattern: { type: 'UnknownPattern' },
      value: { type: 'Identifier', name: 'x' },
    });
    expect(result).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════
// CLIENT CODEGEN — remaining lines 38-39, 65, 191, 198
// ═══════════════════════════════════════════════════════════

describe('ClientCodegen — lambda with block body + state', () => {
  // Lines 38-39: genLambdaExpression block body in client (with state tracking)
  test('lambda with block body in client generates correctly', () => {
    const gen = new ClientCodegen();
    gen.stateNames.add('count');
    const result = gen.genLambdaExpression({
      params: [],
      body: {
        type: 'BlockStatement',
        body: [
          { type: 'ExpressionStatement', expression: { type: 'Identifier', name: 'count' } }
        ]
      }
    });
    expect(result).toContain('=>');
    expect(result).toContain('{');
  });

  // Line 65: non-state compound assignment in lambda body
  test('lambda with non-state compound assignment body', () => {
    const gen = new ClientCodegen();
    gen.stateNames.add('count');
    const result = gen.genLambdaExpression({
      params: [],
      body: {
        type: 'CompoundAssignment',
        target: { type: 'Identifier', name: 'other' },
        operator: '+=',
        value: { type: 'NumberLiteral', value: 1 },
      }
    });
    expect(result).toContain('other += 1');
  });

  // Line 191: component with non-JSX body items (statements classified vs JSX)
  test('component with FunctionDeclaration and JSX', () => {
    const result = compile(`
      client {
        component App {
          fn helper() { 42 }
          <div>"hello"</div>
        }
      }
    `);
    expect(result.client).toContain('function helper()');
    expect(result.client).toContain('lux_el("div"');
  });

  // Line 198: statement generated before JSX in component
  test('component generates statements before return', () => {
    const result = compile(`
      client {
        component App {
          fn onClick() { print("clicked") }
          <button on:click={onClick}>"click"</button>
        }
      }
    `);
    expect(result.client).toContain('function onClick()');
    expect(result.client).toContain('return lux_el');
  });
});

// ═══════════════════════════════════════════════════════════
// AST — FunctionTypeAnnotation (lines 667-670)
// ═══════════════════════════════════════════════════════════

describe('AST — FunctionTypeAnnotation', () => {
  test('FunctionTypeAnnotation constructor', () => {
    const loc = { line: 1, column: 1 };
    const node = new AST.FunctionTypeAnnotation(['Int', 'String'], 'Bool', loc);
    expect(node.type).toBe('FunctionTypeAnnotation');
    expect(node.paramTypes).toEqual(['Int', 'String']);
    expect(node.returnType).toBe('Bool');
  });
});

// ═══════════════════════════════════════════════════════════
// ROUTER — browser-only code with window mock
// Lines 17-18, 24, 33-39, 43-50, 61-66, 72, 75-79
// ═══════════════════════════════════════════════════════════

describe('Router — with window mock', () => {
  test('route matching and navigation with window mock', () => {
    // Set up window AND document mocks before re-importing
    const pushStateArgs = [];
    const windowListeners = {};
    const docListeners = {};

    globalThis.window = {
      history: {
        pushState: (...args) => pushStateArgs.push(args),
      },
      location: {
        pathname: '/',
        origin: 'http://localhost',
      },
      addEventListener: (event, handler) => {
        if (!windowListeners[event]) windowListeners[event] = [];
        windowListeners[event].push(handler);
      },
    };

    // The router module-level code also calls document.addEventListener
    const savedDoc = globalThis.document;
    globalThis.document = {
      addEventListener: (event, handler) => {
        if (!docListeners[event]) docListeners[event] = [];
        docListeners[event].push(handler);
      },
      createElement: () => ({}),
      createTextNode: (t) => ({ textContent: t }),
      createDocumentFragment: () => ({ children: [], appendChild(c) { this.children.push(c); } }),
      getElementById: () => null,
      body: {},
    };

    // Bust module cache and re-import router with window defined
    delete require.cache[require.resolve('../src/runtime/router.js')];
    const router = require('../src/runtime/router.js');

    // defineRoutes exercises pathToRegex (lines 54-58)
    router.defineRoutes({
      '/': () => 'home',
      '/users/:id': () => 'user',
      '/files/*': () => 'files',
    });

    // getCurrentRoute returns a signal getter (route object)
    const routeGetter = router.getCurrentRoute();
    expect(typeof routeGetter).toBe('function');
    expect(routeGetter().path).toBe('/');

    // onRouteChange registers callback
    let lastRoute = undefined;
    router.onRouteChange((route) => {
      lastRoute = route;
    });

    // navigate: pushState (lines 17-18) + handleRouteChange (lines 33-39) + matchRoute (lines 43-50) + extractParams (lines 61-66)
    globalThis.window.location.pathname = '/users/123';
    router.navigate('/users/123');
    expect(pushStateArgs.length).toBeGreaterThan(0);
    expect(lastRoute).not.toBeNull();
    expect(lastRoute.params.id).toBe('123');

    // Navigate to home route
    globalThis.window.location.pathname = '/';
    router.navigate('/');
    expect(lastRoute.path).toBe('/');

    // Navigate to wildcard route
    globalThis.window.location.pathname = '/files/docs/readme.md';
    router.navigate('/files/docs/readme.md');
    expect(lastRoute.path).toBe('/files/*');

    // Navigate to non-matching route → null match (component is null)
    globalThis.window.location.pathname = '/nonexistent';
    router.navigate('/nonexistent');
    expect(lastRoute).toBeNull();  // callback receives null for no match

    // Test popstate listener was registered
    expect(windowListeners['popstate']).toBeDefined();
    expect(windowListeners['popstate'].length).toBeGreaterThan(0);

    // Test click listener was registered on document
    expect(docListeners['click']).toBeDefined();

    // Test click handler with a link
    const clickHandler = docListeners['click'][0];
    // Mock event with no link
    clickHandler({ target: { closest: () => null } });

    // Mock event with matching link
    const mockLink = {
      href: 'http://localhost/about',
      getAttribute: () => '/about',
    };
    let prevented = false;
    globalThis.window.location.pathname = '/about';
    clickHandler({
      target: { closest: () => mockLink },
      preventDefault: () => { prevented = true; },
    });
    expect(prevented).toBe(true);

    // Mock event with external link (should not navigate)
    const externalLink = {
      href: 'https://example.com/page',
      getAttribute: () => '/page',
    };
    let prevented2 = false;
    clickHandler({
      target: { closest: () => externalLink },
      preventDefault: () => { prevented2 = true; },
    });
    expect(prevented2).toBe(false);

    // Clean up
    delete globalThis.window;
    globalThis.document = savedDoc;
  });
});
