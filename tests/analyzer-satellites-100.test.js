import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { Scope, Symbol as ScopeSymbol } from '../src/analyzer/scope.js';
import {
  Type, PrimitiveType, NilType, AnyType, UnknownType,
  ArrayType, TupleType, FunctionType, RecordType, ADTType,
  GenericType, TypeVariable, UnionType,
  typeAnnotationToType, typeFromString, typesCompatible,
} from '../src/analyzer/types.js';
import { TypeRegistry } from '../src/analyzer/type-registry.js';

// Helpers

function analyze(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze();
}

function analyzeTolerant(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
  return analyzer.analyze();
}

// ---------------------------------------------------------------
// 1. form-analyzer.js
// ---------------------------------------------------------------

describe('form-analyzer.js coverage', () => {

  // Lines 18-19: form outside browser block (manual AST since parser won't produce this at top-level)
  test('form outside browser block errors', () => {
    const AST = require('../src/parser/ast.js');
    const FormAST = require('../src/parser/form-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const formNode = new FormAST.FormDeclaration(
      'myForm', null,
      [new FormAST.FormFieldDeclaration('email', null, null, [], loc)],
      [], [], [], null, null, loc
    );
    const ast = new AST.Program([formNode]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    expect(result.errors.some(e => e.message.includes('form') && e.message.includes('browser'))).toBe(true);
  });

  // Line 25: duplicate form definition
  test('duplicate form definition errors', () => {
    const result = analyzeTolerant(`
      browser {
        form myForm {
          field email: String = ""
        }
        form myForm {
          field name: String = ""
        }
      }
    `);
    expect(result.errors.some(e => e.message.includes('already defined'))).toBe(true);
  });

  // Line 47: duplicate form field catch
  test('duplicate form field errors', () => {
    const result = analyzeTolerant(`
      browser {
        form myForm {
          field email: String = ""
          field email: String = ""
        }
      }
    `);
    expect(result.errors.some(e => e.message.includes('already defined'))).toBe(true);
  });

  // Line 51: form field with initial value (visitExpression path)
  test('form field with initial value', () => {
    expect(() => analyze(`
      browser {
        form myForm {
          field name: String = "default"
        }
      }
    `)).not.toThrow();
  });

  // Line 55: unknown validator warning
  test('form field with unknown validator warns', () => {
    const result = analyzeTolerant(`
      browser {
        form myForm {
          field name: String = "" {
            unknownValidator
          }
        }
      }
    `);
    expect(result.warnings.some(w => w.message.includes('Unknown validator'))).toBe(true);
  });

  // Lines 63-78: form group visitor
  test('form group with condition visits fields and nested groups', () => {
    expect(() => analyze(`
      browser {
        form checkout {
          field sameAsShipping: Bool = true
          group billing when !sameAsShipping {
            field street: String = ""
          }
        }
      }
    `)).not.toThrow();
  });

  test('duplicate form group errors', () => {
    const AST = require('../src/parser/ast.js');
    const FormAST = require('../src/parser/form-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const formNode = new FormAST.FormDeclaration(
      'myForm', null, [],
      [
        new FormAST.FormGroupDeclaration('shipping', null, [], [], loc),
        new FormAST.FormGroupDeclaration('shipping', null, [], [], loc),
      ],
      [], [], null, null, loc
    );
    const browserBlock = new AST.BrowserBlock([formNode], loc);
    const ast = new AST.Program([browserBlock]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    expect(result.errors.some(e => e.message.includes('already defined'))).toBe(true);
  });

  test('form group with nested groups', () => {
    expect(() => analyze(`
      browser {
        form checkout {
          group billing {
            field sameAsShipping: Bool = true
            group address when !sameAsShipping {
              field street: String = ""
            }
          }
        }
      }
    `)).not.toThrow();
  });

  // Lines 83-94: form array visitor
  test('form array defines symbol and visits fields', () => {
    expect(() => analyze(`
      browser {
        form invoice {
          array lineItems {
            field description: String = ""
            field quantity: Int = 1
          }
        }
      }
    `)).not.toThrow();
  });

  test('duplicate form array errors', () => {
    const AST = require('../src/parser/ast.js');
    const FormAST = require('../src/parser/form-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const formNode = new FormAST.FormDeclaration(
      'myForm', null, [],
      [],
      [
        new FormAST.FormArrayDeclaration('items', [], [], loc),
        new FormAST.FormArrayDeclaration('items', [], [], loc),
      ],
      [], null, null, loc
    );
    const browserBlock = new AST.BrowserBlock([formNode], loc);
    const ast = new AST.Program([browserBlock]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    expect(result.errors.some(e => e.message.includes('already defined'))).toBe(true);
  });

  // Lines 99-110: form steps visitor
  test('form steps with known members', () => {
    expect(() => analyze(`
      browser {
        form wizard {
          field email: String = ""
          group profile {
            field name: String = ""
          }
          steps {
            step "Account" { email }
            step "Profile" { profile }
          }
        }
      }
    `)).not.toThrow();
  });

  test('form steps with unknown member warns', () => {
    const AST = require('../src/parser/ast.js');
    const FormAST = require('../src/parser/form-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const formNode = new FormAST.FormDeclaration(
      'checkout', null,
      [new FormAST.FormFieldDeclaration('email', null, null, [], loc)],
      [], [], [],
      new FormAST.FormStepsDeclaration([
        new FormAST.FormStep('Contact', ['email'], loc),
        new FormAST.FormStep('Payment', ['card_number'], loc),
      ], loc),
      null, loc
    );
    const browserBlock = new AST.BrowserBlock([formNode], loc);
    const ast = new AST.Program([browserBlock]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    expect(result.warnings.some(w => w.message.includes('unknown member'))).toBe(true);
  });
});

// ---------------------------------------------------------------
// 2. scope.js
// ---------------------------------------------------------------

describe('scope.js coverage', () => {

  // Lines 85-88, 90: child scope sorting
  test('buildIndex sorts children by start position with missing locations', () => {
    const root = new Scope(null, 'module');
    const c1 = root.child('block');
    c1.startLoc = { line: 10, column: 1 };
    c1.endLoc = { line: 15, column: 1 };
    const c2 = root.child('block');
    c2.startLoc = { line: 5, column: 1 };
    c2.endLoc = { line: 8, column: 1 };
    const c3 = root.child('block'); // no startLoc
    const c4 = root.child('block');
    c4.startLoc = { line: 5, column: 5 };
    c4.endLoc = { line: 7, column: 1 };

    root.buildIndex();
    expect(root.children[0]).toBe(c2);
    expect(root.children[1]).toBe(c4);
    expect(root.children[2]).toBe(c1);
    expect(root.children[3]).toBe(c3);
    expect(root._indexed).toBe(true);
  });

  test('buildIndex a vs b missing startLoc', () => {
    const root = new Scope(null, 'module');
    const noLoc = root.child('block');
    const withLoc = root.child('block');
    withLoc.startLoc = { line: 1, column: 1 };
    withLoc.endLoc = { line: 5, column: 1 };
    const noLoc2 = root.child('block');

    root.buildIndex();
    expect(root.children[0]).toBe(withLoc);
  });

  // Line 104: Linear fallback for small scope lists
  test('findScopeAtPosition linear fallback for small lists', () => {
    const root = new Scope(null, 'module');
    root.startLoc = { line: 1, column: 0 };
    root.endLoc = { line: 20, column: 0 };
    const c1 = root.child('block');
    c1.startLoc = { line: 3, column: 0 };
    c1.endLoc = { line: 8, column: 0 };

    expect(root.findScopeAtPosition(5, 0)).toBe(c1);
  });

  test('findScopeAtPosition returns self for position in root but outside children', () => {
    const root = new Scope(null, 'module');
    root.startLoc = { line: 1, column: 0 };
    root.endLoc = { line: 20, column: 0 };
    root.child('block').startLoc = { line: 3, column: 0 };
    root.children[0].endLoc = { line: 5, column: 0 };

    expect(root.findScopeAtPosition(10, 0)).toBe(root);
  });

  test('findScopeAtPosition returns null when outside all scopes', () => {
    const root = new Scope(null, 'module');
    root.startLoc = { line: 5, column: 0 };
    root.endLoc = { line: 10, column: 0 };
    expect(root.findScopeAtPosition(1, 0)).toBe(null);
  });

  test('findScopeAtPosition recurses through children without position info', () => {
    const root = new Scope(null, 'module');
    root.startLoc = { line: 1, column: 0 };
    root.endLoc = { line: 50, column: 0 };
    const noLoc = root.child('block');
    const nested = noLoc.child('block');
    nested.startLoc = { line: 10, column: 0 };
    nested.endLoc = { line: 15, column: 0 };

    expect(root.findScopeAtPosition(12, 0)).toBe(nested);
  });

  // Lines 128-176: binary search _findScopeIndexed
  test('binary search with >4 indexed children finds correct scope', () => {
    const root = new Scope(null, 'module');
    root.startLoc = { line: 1, column: 0 };
    root.endLoc = { line: 100, column: 0 };

    for (let i = 0; i < 6; i++) {
      const c = root.child('block');
      c.startLoc = { line: i * 10 + 2, column: 0 };
      c.endLoc = { line: i * 10 + 8, column: 0 };
    }
    root.buildIndex();
    expect(root.findScopeAtPosition(25, 0)).not.toBe(null);
  });

  test('binary search candidate -1: position before all children', () => {
    const root = new Scope(null, 'module');
    root.startLoc = { line: 1, column: 0 };
    root.endLoc = { line: 100, column: 0 };

    for (let i = 0; i < 6; i++) {
      const c = root.child('block');
      c.startLoc = { line: i * 10 + 50, column: 0 };
      c.endLoc = { line: i * 10 + 55, column: 0 };
    }
    root.buildIndex();
    expect(root.findScopeAtPosition(2, 0)).toBe(root);
  });

  test('binary search fallback through no-loc children', () => {
    const root = new Scope(null, 'module');
    root.startLoc = { line: 1, column: 0 };
    root.endLoc = { line: 100, column: 0 };

    for (let i = 0; i < 5; i++) {
      const c = root.child('block');
      c.startLoc = { line: i * 10 + 2, column: 0 };
      c.endLoc = { line: i * 10 + 8, column: 0 };
    }
    const noLoc1 = root.child('block');
    root.child('block'); // noLoc2
    const nested = noLoc1.child('block');
    nested.startLoc = { line: 60, column: 0 };
    nested.endLoc = { line: 65, column: 0 };

    root.buildIndex();
    expect(root.findScopeAtPosition(62, 0)).toBe(nested);
  });

  test('binary search returns self when position in root but not in any child', () => {
    const root = new Scope(null, 'module');
    root.startLoc = { line: 1, column: 0 };
    root.endLoc = { line: 100, column: 0 };

    for (let i = 0; i < 6; i++) {
      const c = root.child('block');
      c.startLoc = { line: i * 10 + 2, column: 0 };
      c.endLoc = { line: i * 10 + 5, column: 0 };
    }
    root.buildIndex();
    expect(root.findScopeAtPosition(97, 0)).toBe(root);
  });

  test('binary search returns null when position outside root', () => {
    const root = new Scope(null, 'module');
    root.startLoc = { line: 10, column: 0 };
    root.endLoc = { line: 50, column: 0 };

    for (let i = 0; i < 6; i++) {
      const c = root.child('block');
      c.startLoc = { line: i * 5 + 12, column: 0 };
      c.endLoc = { line: i * 5 + 15, column: 0 };
    }
    root.buildIndex();
    expect(root.findScopeAtPosition(5, 0)).toBe(null);
  });

  test('binary search same-line column comparison', () => {
    const root = new Scope(null, 'module');
    root.startLoc = { line: 1, column: 0 };
    root.endLoc = { line: 1, column: 100 };

    for (let i = 0; i < 6; i++) {
      const c = root.child('block');
      c.startLoc = { line: 1, column: i * 10 };
      c.endLoc = { line: 1, column: i * 10 + 5 };
    }
    root.buildIndex();
    expect(root.findScopeAtPosition(1, 22)).not.toBe(null);
  });

  test('binary search recurses into nested scope', () => {
    const root = new Scope(null, 'module');
    root.startLoc = { line: 1, column: 0 };
    root.endLoc = { line: 100, column: 0 };

    for (let i = 0; i < 6; i++) {
      const c = root.child('block');
      c.startLoc = { line: i * 15 + 2, column: 0 };
      c.endLoc = { line: i * 15 + 12, column: 0 };
      if (i === 3) {
        const nested = c.child('block');
        nested.startLoc = { line: i * 15 + 4, column: 0 };
        nested.endLoc = { line: i * 15 + 10, column: 0 };
      }
    }
    root.buildIndex();
    expect(root.findScopeAtPosition(50, 0)).not.toBe(null);
  });

  test('binary search skips children without startLoc during search', () => {
    const root = new Scope(null, 'module');
    root.startLoc = { line: 1, column: 0 };
    root.endLoc = { line: 100, column: 0 };

    // Interleave children with and without locations
    for (let i = 0; i < 3; i++) {
      root.child('block'); // no startLoc
      const c = root.child('block');
      c.startLoc = { line: i * 20 + 10, column: 0 };
      c.endLoc = { line: i * 20 + 15, column: 0 };
    }
    root.buildIndex();
    // Position inside second located child
    expect(root.findScopeAtPosition(32, 0)).not.toBe(null);
  });
});

// ---------------------------------------------------------------
// 3. browser-analyzer.js
// ---------------------------------------------------------------

describe('browser-analyzer.js coverage', () => {

  // Line 135: duplicate store definition
  test('duplicate store definition errors', () => {
    const AST = require('../src/parser/ast.js');
    const BrowserAST = require('../src/parser/browser-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const store1 = new BrowserAST.StoreDeclaration('MyStore', [], loc);
    const store2 = new BrowserAST.StoreDeclaration('MyStore', [], loc);
    const browserBlock = new AST.BrowserBlock([store1, store2], loc);
    const ast = new AST.Program([browserBlock]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    expect(result.errors.some(e => e.message.includes('already defined'))).toBe(true);
  });

  // Line 135 (component): duplicate component definition
  test('duplicate component definition errors', () => {
    const result = analyzeTolerant(`
      browser {
        component MyComp() {
          <div>"Hello"</div>
        }
        component MyComp() {
          <span>"World"</span>
        }
      }
    `);
    expect(result.errors.some(e => e.message.includes('already defined'))).toBe(true);
  });

  // Lines 155, 163, 168, 170: JSX children type dispatching
  test('JSX Fragment child', () => {
    expect(() => analyze(`
      browser {
        component App() {
          <>
            <div>"inside fragment"</div>
          </>
        }
      }
    `)).not.toThrow();
  });

  test('JSX Expression child', () => {
    expect(() => analyze(`
      browser {
        state count = 0
        component App() {
          <div>{count}</div>
        }
      }
    `)).not.toThrow();
  });

  test('JSX For child with string variable', () => {
    expect(() => analyze(
      'browser { state items = [1, 2, 3]\n component App() { <ul>\n for item in items { <li>"item"</li> }\n </ul> } }'
    )).not.toThrow();
  });

  test('JSX If child', () => {
    expect(() => analyze(
      'browser { state show = true\n component App() { <div>\n if show { <span>"yes"</span> } else { <span>"no"</span> }\n </div> } }'
    )).not.toThrow();
  });

  test('JSX Match child', () => {
    expect(() => analyze(
      'browser { state val = 1\n component App() { <div>\n match val { 1 => <span>"One"</span> _ => <span>"Other"</span> }\n </div> } }'
    )).not.toThrow();
  });

  test('JSX Text child with interpolation', () => {
    expect(() => analyze(`
      browser {
        state name = "world"
        component App() {
          <p>"Hello {name}"</p>
        }
      }
    `)).not.toThrow();
  });

  // Line 155: JSXFragment as child of another element
  test('JSXFragment nested inside JSX element', () => {
    expect(() => analyze(
      'browser { component App() { <div>\n <>"inside fragment"</>\n </div> } }'
    )).not.toThrow();
  });

  // Line 168: Other expression-type child in JSX children (JSXText with value, handled separately)
  // This targets the JSXText path where child.value is truthy
  test('JSXText with interpolation in element children', () => {
    expect(() => analyze(
      'browser { state x = 1\n component App() { <div>\n "value is {x}"\n </div> } }'
    )).not.toThrow();
  });

  // Line 170: Other expression child fallback in _visitJSXChildren
  test('other expression child in JSX via manual AST', () => {
    const AST = require('../src/parser/ast.js');
    const BrowserAST = require('../src/parser/browser-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    // Create a JSXElement with a child that has a .type but is not JSXElement/Fragment/Expression/For/If/Match/Text
    const numbChild = new AST.NumberLiteral(42, loc);
    const div = new BrowserAST.JSXElement('div', [], [numbChild], false, loc);
    const comp = new BrowserAST.ComponentDeclaration('App', [], [div], loc);
    const browserBlock = new AST.BrowserBlock([comp], loc);
    const ast = new AST.Program([browserBlock]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    // Should not crash -- the NumberLiteral is visited as an expression
    expect(result).toBeDefined();
  });

  // Line 186: visitJSXFragment
  test('visitJSXFragment dispatches children', () => {
    expect(() => analyze(`
      browser {
        component App() {
          <>
            <p>"one"</p>
            <p>"two"</p>
          </>
        }
      }
    `)).not.toThrow();
  });

  // Lines 201-215: JSXFor with array and object destructuring
  test('JSXFor with array destructuring', () => {
    expect(() => analyze(
      'browser { state pairs = [[1, 2]]\n component App() { <ul>\n for [a, b] in pairs { <li>"pair"</li> }\n </ul> } }'
    )).not.toThrow();
  });

  test('JSXFor with object destructuring', () => {
    expect(() => analyze(
      'browser { state users = [{name: "A"}]\n component App() { <ul>\n for {name} in users { <li>"user"</li> }\n </ul> } }'
    )).not.toThrow();
  });

  // Lines 245-251: JSXMatch visitor
  test('JSXMatch visits subject and arms', () => {
    expect(() => analyze(
      'browser { state val = 42\n component App() { <div>\n match val { 1 => <span>"One"</span> 2 => <span>"Two"</span> _ => <span>"X"</span> }\n </div> } }'
    )).not.toThrow();
  });
});

// ---------------------------------------------------------------
// 4. server-analyzer.js
// ---------------------------------------------------------------

describe('server-analyzer.js coverage', () => {

  // Line 23: multiple server blocks with same name merge function sets
  test('multiple server blocks with same name', () => {
    expect(() => analyze(`
      server "api" {
        fn hello(req) {
          { status: 200 }
        }
        get "/hello" hello
      }
      server "api" {
        fn world(req) {
          { status: 200 }
        }
        get "/world" world
      }
    `)).not.toThrow();
  });

  // Lines 120, 133, 137, 139-140: route handler param compatibility
  test('route bodyType on GET warns', () => {
    const AST = require('../src/parser/ast.js');
    const ServerAST = require('../src/parser/server-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const handler = new AST.Identifier('handler', loc);
    const route = new ServerAST.RouteDeclaration('GET', '/test', handler, loc, [], { name: 'String', type: 'TypeAnnotation' });
    const fnDecl = new AST.FunctionDeclaration('handler', [new AST.Parameter('req', null, null, loc)], new AST.BlockStatement([new AST.ReturnStatement(new AST.ObjectLiteral([{ key: 'status', value: new AST.NumberLiteral(200, loc) }], loc), loc)], loc), null, loc);
    const serverBlock = new AST.ServerBlock([fnDecl, route], loc);
    const ast = new AST.Program([serverBlock]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    expect(result.warnings.some(w => w.message.includes('body type'))).toBe(true);
  });

  test('route handler param not in path warns for GET', () => {
    const AST = require('../src/parser/ast.js');
    const ServerAST = require('../src/parser/server-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    // fn get_user(id, extra) -- 'extra' not in /:id path
    const fnDecl = new AST.FunctionDeclaration('get_user', [
      new AST.Parameter('id', null, null, loc),
      new AST.Parameter('extra', null, null, loc),
    ], new AST.BlockStatement([new AST.ReturnStatement(new AST.ObjectLiteral([{ key: 'status', value: new AST.NumberLiteral(200, loc) }], loc), loc)], loc), null, loc);
    const handler = new AST.Identifier('get_user', loc);
    const route = new ServerAST.RouteDeclaration('GET', '/users/:id', handler, loc);
    const serverBlock = new AST.ServerBlock([fnDecl, route], loc);
    const ast = new AST.Program([serverBlock]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    expect(result.warnings.some(w => w.message.includes('query string') || w.message.includes('not in route path'))).toBe(true);
  });

  test('route handler param matches path params', () => {
    expect(() => analyze(`
      server {
        fn get_user(id) {
          { status: 200 }
        }
        get "/users/:id" get_user
      }
    `)).not.toThrow();
  });

  // Lines 154, 163: duplicate middleware params
  test('duplicate middleware param errors', () => {
    const AST = require('../src/parser/ast.js');
    const ServerAST = require('../src/parser/server-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const mw = new ServerAST.MiddlewareDeclaration('logger', [
      new AST.Parameter('req', null, null, loc),
      new AST.Parameter('req', null, null, loc),
    ], new AST.BlockStatement([
      new AST.ExpressionStatement(new AST.CallExpression(new AST.Identifier('print', loc), [new AST.StringLiteral('log', loc)], loc), loc)
    ], loc), loc);
    const serverBlock = new AST.ServerBlock([mw], loc);
    const ast = new AST.Program([serverBlock]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    expect(result.errors.some(e => e.message.includes('already defined'))).toBe(true);
  });

  test('duplicate middleware name errors', () => {
    const AST = require('../src/parser/ast.js');
    const ServerAST = require('../src/parser/server-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const body = new AST.BlockStatement([], loc);
    const mw1 = new ServerAST.MiddlewareDeclaration('logger', [new AST.Parameter('req', null, null, loc)], body, loc);
    const mw2 = new ServerAST.MiddlewareDeclaration('logger', [new AST.Parameter('req', null, null, loc)], body, loc);
    const serverBlock = new AST.ServerBlock([mw1, mw2], loc);
    const ast = new AST.Program([serverBlock]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    expect(result.errors.some(e => e.message.includes('already defined'))).toBe(true);
  });

  // Line 202: ErrorHandler param error
  test('duplicate error handler param errors', () => {
    const AST = require('../src/parser/ast.js');
    const ServerAST = require('../src/parser/server-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const eh = new ServerAST.ErrorHandlerDeclaration([
      new AST.Parameter('err', null, null, loc),
      new AST.Parameter('err', null, null, loc),
    ], new AST.BlockStatement([], loc), loc);
    const serverBlock = new AST.ServerBlock([eh], loc);
    const ast = new AST.Program([serverBlock]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    expect(result.errors.some(e => e.message.includes('already defined'))).toBe(true);
  });

  // Line 226: WebSocket handler param error
  test('duplicate websocket handler param errors', () => {
    const AST = require('../src/parser/ast.js');
    const ServerAST = require('../src/parser/server-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const ws = new ServerAST.WebSocketDeclaration({
      on_message: {
        params: [
          new AST.Parameter('ws', null, null, loc),
          new AST.Parameter('ws', null, null, loc),
        ],
        body: new AST.BlockStatement([], loc),
      },
    }, loc);
    const serverBlock = new AST.ServerBlock([ws], loc);
    const ast = new AST.Program([serverBlock]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    expect(result.errors.some(e => e.message.includes('already defined'))).toBe(true);
  });

  // Lines 299-303: Lifecycle hook parameter definition
  test('lifecycle hook with params', () => {
    expect(() => analyze(`
      server {
        on_start fn(app) {
          print(app)
        }
      }
    `)).not.toThrow();
  });

  test('duplicate lifecycle hook param errors', () => {
    const AST = require('../src/parser/ast.js');
    const ServerAST = require('../src/parser/server-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const hook = new ServerAST.LifecycleHookDeclaration('start', [
      new AST.Parameter('app', null, null, loc),
      new AST.Parameter('app', null, null, loc),
    ], new AST.BlockStatement([], loc), loc);
    const serverBlock = new AST.ServerBlock([hook], loc);
    const ast = new AST.Program([serverBlock]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    expect(result.errors.some(e => e.message.includes('already defined'))).toBe(true);
  });

  // Line 324: Subscribe param error
  test('duplicate subscribe param errors', () => {
    const AST = require('../src/parser/ast.js');
    const ServerAST = require('../src/parser/server-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const sub = new ServerAST.SubscribeDeclaration('user.created', [
      new AST.Parameter('data', null, null, loc),
      new AST.Parameter('data', null, null, loc),
    ], new AST.BlockStatement([], loc), loc);
    const serverBlock = new AST.ServerBlock([sub], loc);
    const ast = new AST.Program([serverBlock]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    expect(result.errors.some(e => e.message.includes('already defined'))).toBe(true);
  });

  // Line 343: EnvDeclaration param error
  test('duplicate env declaration errors', () => {
    const AST = require('../src/parser/ast.js');
    const ServerAST = require('../src/parser/server-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const env1 = new ServerAST.EnvDeclaration('PORT', null, null, loc);
    const env2 = new ServerAST.EnvDeclaration('PORT', null, null, loc);
    const serverBlock = new AST.ServerBlock([env1, env2], loc);
    const ast = new AST.Program([serverBlock]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    expect(result.errors.some(e => e.message.includes('already defined'))).toBe(true);
  });

  // Lines 360, 367-371: Schedule declaration with name and params
  test('schedule with name and params', () => {
    expect(() => analyze(`
      server {
        schedule "0 * * * *" fn hourly_task() {
          print("hourly")
        }
      }
    `)).not.toThrow();
  });

  test('duplicate schedule name errors', () => {
    const AST = require('../src/parser/ast.js');
    const ServerAST = require('../src/parser/server-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const sched1 = new ServerAST.ScheduleDeclaration('1h', 'cleanup', [], new AST.BlockStatement([], loc), loc);
    const sched2 = new ServerAST.ScheduleDeclaration('2h', 'cleanup', [], new AST.BlockStatement([], loc), loc);
    const serverBlock = new AST.ServerBlock([sched1, sched2], loc);
    const ast = new AST.Program([serverBlock]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    expect(result.errors.some(e => e.message.includes('already defined'))).toBe(true);
  });

  test('duplicate schedule param errors', () => {
    const AST = require('../src/parser/ast.js');
    const ServerAST = require('../src/parser/server-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const sched = new ServerAST.ScheduleDeclaration('1h', 'task', [
      new AST.Parameter('ctx', null, null, loc),
      new AST.Parameter('ctx', null, null, loc),
    ], new AST.BlockStatement([], loc), loc);
    const serverBlock = new AST.ServerBlock([sched], loc);
    const ast = new AST.Program([serverBlock]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    expect(result.errors.some(e => e.message.includes('already defined'))).toBe(true);
  });

  // Line 439: Background job duplicate name
  test('duplicate background job name errors', () => {
    const AST = require('../src/parser/ast.js');
    const ServerAST = require('../src/parser/server-ast.js');
    const loc = { line: 1, column: 1, file: '<test>' };
    const bg1 = new ServerAST.BackgroundJobDeclaration('sendEmail', [new AST.Parameter('to', null, null, loc)], new AST.BlockStatement([], loc), loc);
    const bg2 = new ServerAST.BackgroundJobDeclaration('sendEmail', [new AST.Parameter('to', null, null, loc)], new AST.BlockStatement([], loc), loc);
    const serverBlock = new AST.ServerBlock([bg1, bg2], loc);
    const ast = new AST.Program([serverBlock]);
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    expect(result.errors.some(e => e.message.includes('already defined'))).toBe(true);
  });
});

// ---------------------------------------------------------------
// 5. deploy-analyzer.js
// ---------------------------------------------------------------

describe('deploy-analyzer.js coverage', () => {

  test('unknown deploy config field errors', () => {
    const result = analyzeTolerant(`
      deploy "prod" {
        server: "my-server"
        domain: "example.com"
        unknown_field: "value"
      }
    `);
    expect(result.errors.some(e => e.message.includes('Unknown deploy config field'))).toBe(true);
  });

  test('valid deploy config fields pass', () => {
    expect(() => analyze(`
      deploy "prod" {
        server: "my-server"
        domain: "example.com"
        instances: 2
        memory: 512
      }
    `)).not.toThrow();
  });

  test('missing required deploy fields errors', () => {
    const result = analyzeTolerant(`
      deploy "prod" {
        instances: 2
      }
    `);
    expect(result.errors.some(e => e.message.includes('missing required field'))).toBe(true);
  });
});

// ---------------------------------------------------------------
// 6. types.js
// ---------------------------------------------------------------

describe('types.js coverage', () => {

  test('Type base class defaults', () => {
    const t = new Type();
    expect(t.equals(new Type())).toBe(false);
    expect(t.isAssignableTo(new Type())).toBe(false);
    expect(t.toString()).toBe('unknown');
    expect(t.getFieldType('x')).toBe(null);
  });

  test('ArrayType isAssignableTo with compatible element types', () => {
    const intArr = new ArrayType(Type.INT);
    const floatArr = new ArrayType(Type.FLOAT);
    expect(intArr.isAssignableTo(floatArr)).toBe(true);
  });

  test('ArrayType isAssignableTo with incompatible element types', () => {
    const strArr = new ArrayType(Type.STRING);
    const intArr = new ArrayType(Type.INT);
    expect(strArr.isAssignableTo(intArr)).toBe(false);
  });

  test('ArrayType not assignable to non-array', () => {
    const arr = new ArrayType(Type.INT);
    expect(arr.isAssignableTo(Type.INT)).toBe(false);
  });

  test('TupleType element count mismatch', () => {
    const t1 = new TupleType([Type.INT, Type.STRING]);
    const t2 = new TupleType([Type.INT]);
    expect(t1.isAssignableTo(t2)).toBe(false);
  });

  test('TupleType compatible elements', () => {
    const t1 = new TupleType([Type.INT, Type.STRING]);
    const t2 = new TupleType([Type.INT, Type.STRING]);
    expect(t1.isAssignableTo(t2)).toBe(true);
  });

  test('TupleType not assignable to non-tuple', () => {
    const t1 = new TupleType([Type.INT]);
    expect(t1.isAssignableTo(Type.INT)).toBe(false);
  });

  test('RecordType equals', () => {
    const r1 = new RecordType('User', new Map([['name', Type.STRING]]));
    const r2 = new RecordType('User', new Map([['name', Type.STRING]]));
    const r3 = new RecordType('Post', new Map([['title', Type.STRING]]));
    expect(r1.equals(r2)).toBe(true);
    expect(r1.equals(r3)).toBe(false);
    expect(r1.equals(Type.INT)).toBe(false);
  });

  test('GenericType different type arg counts', () => {
    const g1 = new GenericType('Result', [Type.INT, Type.STRING]);
    const g2 = new GenericType('Result', [Type.INT]);
    expect(g1.isAssignableTo(g2)).toBe(false);
  });

  test('GenericType isAssignableTo with empty type args (gradual)', () => {
    const g1 = new GenericType('Result', [Type.INT, Type.STRING]);
    const g2 = new GenericType('Result', []);
    expect(g1.isAssignableTo(g2)).toBe(true);
  });

  test('GenericType isAssignableTo with matching type args', () => {
    const g1 = new GenericType('Result', [Type.INT, Type.STRING]);
    const g2 = new GenericType('Result', [Type.INT, Type.STRING]);
    expect(g1.isAssignableTo(g2)).toBe(true);
  });

  test('FunctionType parameter count mismatch', () => {
    const f1 = new FunctionType([Type.INT, Type.STRING], Type.BOOL);
    const f2 = new FunctionType([Type.INT], Type.BOOL);
    expect(f1.isAssignableTo(f2)).toBe(false);
  });

  test('FunctionType equals with matching signature', () => {
    const f1 = new FunctionType([Type.INT], Type.BOOL);
    const f2 = new FunctionType([Type.INT], Type.BOOL);
    expect(f1.isAssignableTo(f2)).toBe(true);
  });

  test('FunctionType not assignable to non-function', () => {
    const f1 = new FunctionType([Type.INT], Type.BOOL);
    expect(f1.isAssignableTo(Type.INT)).toBe(false);
  });

  test('UnionType assignable to UnionType', () => {
    const u1 = new UnionType([Type.INT, Type.STRING]);
    const u2 = new UnionType([Type.INT, Type.STRING, Type.BOOL]);
    expect(u1.isAssignableTo(u2)).toBe(true);
  });

  test('UnionType not assignable when member missing', () => {
    const u1 = new UnionType([Type.INT, Type.BOOL]);
    const u2 = new UnionType([Type.INT, Type.STRING]);
    expect(u1.isAssignableTo(u2)).toBe(false);
  });

  test('UnionType assignable to plain type', () => {
    const u1 = new UnionType([Type.INT, Type.INT]);
    expect(u1.isAssignableTo(Type.INT)).toBe(true);
  });

  test('UnionType not assignable to non-matching plain type', () => {
    const u1 = new UnionType([Type.INT, Type.STRING]);
    expect(u1.isAssignableTo(Type.INT)).toBe(false);
  });

  test('NilType assignable to Option', () => {
    const nil = new NilType();
    expect(nil.isAssignableTo(new GenericType('Option', [Type.INT]))).toBe(true);
  });

  test('GenericType equals edge cases', () => {
    expect(new GenericType('Result', [Type.INT]).equals(new GenericType('Option', [Type.INT]))).toBe(false);
    expect(new GenericType('Result', [Type.INT]).equals(new GenericType('Result', [Type.INT, Type.STRING]))).toBe(false);
  });

  test('GenericType isAssignableTo PrimitiveType', () => {
    expect(new GenericType('Result', [Type.INT]).isAssignableTo(new PrimitiveType('Result'))).toBe(true);
  });

  test('GenericType isAssignableTo ADTType', () => {
    expect(new GenericType('Shape', []).isAssignableTo(new ADTType('Shape', [], new Map()))).toBe(true);
  });

  test('GenericType not assignable to different base', () => {
    expect(new GenericType('Result', [Type.INT]).isAssignableTo(new GenericType('Option', [Type.INT]))).toBe(false);
  });

  test('TypeVariable isAssignableTo', () => {
    const tv = new TypeVariable('T');
    expect(tv.isAssignableTo(Type.INT)).toBe(true);
    expect(tv.isAssignableTo(new TypeVariable('U'))).toBe(false);
    expect(tv.isAssignableTo(new TypeVariable('T'))).toBe(true);
  });

  test('FunctionType equals with mismatched return type', () => {
    expect(new FunctionType([Type.INT], Type.BOOL).equals(new FunctionType([Type.INT], Type.STRING))).toBe(false);
  });

  test('TupleType equals with different lengths', () => {
    expect(new TupleType([Type.INT]).equals(new TupleType([Type.INT, Type.STRING]))).toBe(false);
  });

  test('UnionType equals', () => {
    expect(new UnionType([Type.INT, Type.STRING]).equals(new UnionType([Type.INT, Type.STRING]))).toBe(true);
    expect(new UnionType([Type.INT, Type.STRING]).equals(new UnionType([Type.INT]))).toBe(false);
    expect(new UnionType([Type.INT]).equals(Type.INT)).toBe(false);
  });

  test('RecordType getFieldType', () => {
    const r = new RecordType('User', new Map([['name', Type.STRING]]));
    expect(r.getFieldType('name')).toBe(Type.STRING);
    expect(r.getFieldType('missing')).toBe(null);
  });

  test('RecordType isAssignableTo GenericType and PrimitiveType', () => {
    const r = new RecordType('Result', new Map());
    expect(r.isAssignableTo(new GenericType('Result', []))).toBe(true);
    expect(r.isAssignableTo(new PrimitiveType('Result'))).toBe(true);
  });

  test('ADTType isAssignableTo PrimitiveType and GenericType', () => {
    const adt = new ADTType('Shape', [], new Map());
    expect(adt.isAssignableTo(new PrimitiveType('Shape'))).toBe(true);
    expect(adt.isAssignableTo(new GenericType('Shape', []))).toBe(true);
  });

  // typeAnnotationToType coverage for all branches
  test('typeAnnotationToType handles TypeAnnotation with typeParams (GenericType)', () => {
    const ann = {
      type: 'TypeAnnotation',
      name: 'Result',
      typeParams: [
        { type: 'TypeAnnotation', name: 'Int', typeParams: [] },
        { type: 'TypeAnnotation', name: 'String', typeParams: [] },
      ],
    };
    const result = typeAnnotationToType(ann);
    expect(result).toBeInstanceOf(GenericType);
    expect(result.base).toBe('Result');
    expect(result.typeArgs.length).toBe(2);
  });

  test('typeAnnotationToType handles ArrayTypeAnnotation', () => {
    const ann = {
      type: 'ArrayTypeAnnotation',
      elementType: { type: 'TypeAnnotation', name: 'Int', typeParams: [] },
    };
    const result = typeAnnotationToType(ann);
    expect(result).toBeInstanceOf(ArrayType);
  });

  test('typeAnnotationToType handles TupleTypeAnnotation', () => {
    const ann = {
      type: 'TupleTypeAnnotation',
      elementTypes: [
        { type: 'TypeAnnotation', name: 'Int', typeParams: [] },
        { type: 'TypeAnnotation', name: 'String', typeParams: [] },
      ],
    };
    const result = typeAnnotationToType(ann);
    expect(result).toBeInstanceOf(TupleType);
  });

  test('typeAnnotationToType handles FunctionTypeAnnotation', () => {
    const ann = { type: 'FunctionTypeAnnotation' };
    const result = typeAnnotationToType(ann);
    expect(result).toBe(Type.FUNCTION);
  });

  test('typeAnnotationToType handles UnionTypeAnnotation', () => {
    const unionAnn = {
      type: 'UnionTypeAnnotation',
      members: [
        { type: 'TypeAnnotation', name: 'Int', typeParams: [] },
        { type: 'TypeAnnotation', name: 'String', typeParams: [] },
      ],
    };
    const result = typeAnnotationToType(unionAnn);
    expect(result).toBeInstanceOf(UnionType);
    expect(result.members.length).toBe(2);
  });

  test('typeAnnotationToType handles unknown annotation type', () => {
    const result = typeAnnotationToType({ type: 'SomeUnknownType' });
    expect(result).toBe(null);
  });

  test('typeAnnotationToType handles string input', () => {
    const result = typeAnnotationToType('Int');
    expect(result).toBeInstanceOf(PrimitiveType);
    expect(result.name).toBe('Int');
  });

  test('typeAnnotationToType handles null input', () => {
    expect(typeAnnotationToType(null)).toBe(null);
  });

  // Also trigger via language syntax: fn with union type parameter
  test('union type annotation via Tova syntax', () => {
    expect(() => analyze('fn test(x: Int | String) { print(x) }')).not.toThrow();
  });

  // Line 4: ensure Type class itself is exercised (constructor + all methods)
  test('Type class instantiation and methods', () => {
    const t = new Type();
    expect(t).toBeInstanceOf(Type);
    // Exercise every method on the base class
    t.equals(null);
    t.isAssignableTo(null);
    t.toString();
    t.getFieldType('test');
    // Check prototype chain to force coverage of class definition
    expect(Type.prototype.equals).toBeDefined();
    expect(Type.prototype.isAssignableTo).toBeDefined();
    expect(Type.prototype.toString).toBeDefined();
    expect(Type.prototype.getFieldType).toBeDefined();
  });

  // Additional: ensure subclass instanceof checks exercise Type
  test('instanceof checks against Type base class', () => {
    expect(Type.INT instanceof Type).toBe(true);
    expect(Type.FLOAT instanceof Type).toBe(true);
    expect(Type.STRING instanceof Type).toBe(true);
    expect(Type.BOOL instanceof Type).toBe(true);
    expect(Type.NIL instanceof Type).toBe(true);
    expect(Type.ANY instanceof Type).toBe(true);
    expect(Type.UNKNOWN instanceof Type).toBe(true);
    // Reference Type as a value to ensure the class definition line is covered
    const TypeRef = Type;
    expect(TypeRef).toBe(Type);
    expect(typeof TypeRef).toBe('function');
  });
});

// ---------------------------------------------------------------
// 7. type-registry.js
// ---------------------------------------------------------------

describe('type-registry.js coverage', () => {

  test('getMembers for RecordType collects fields', () => {
    const registry = new TypeRegistry();
    const fields = new Map();
    fields.set('name', Type.STRING);
    fields.set('age', Type.INT);
    registry.types.set('User', new RecordType('User', fields));

    const members = registry.getMembers('User');
    expect(members.fields.size).toBe(2);
    expect(members.fields.get('name')).toBe(Type.STRING);
  });

  test('getMembers for ADTType collects variant fields', () => {
    const registry = new TypeRegistry();
    const variants = new Map();
    variants.set('Circle', new Map([['radius', Type.FLOAT]]));
    variants.set('Square', new Map([['side', Type.FLOAT]]));
    registry.types.set('Shape', new ADTType('Shape', [], variants));

    const members = registry.getMembers('Shape');
    expect(members.fields.has('radius')).toBe(true);
    expect(members.fields.has('side')).toBe(true);
  });

  test('getMembers with impl methods', () => {
    const registry = new TypeRegistry();
    registry.types.set('Point', new RecordType('Point', new Map()));
    registry.impls.set('Point', [
      { name: 'distance', isAssociated: false },
      { name: 'origin', isAssociated: true },
    ]);

    const members = registry.getMembers('Point');
    expect(members.methods.length).toBe(1);
    expect(members.methods[0].name).toBe('distance');
  });

  test('getMembers for unknown type returns empty', () => {
    const registry = new TypeRegistry();
    const members = registry.getMembers('Unknown');
    expect(members.fields.size).toBe(0);
    expect(members.methods.length).toBe(0);
  });

  test('getAssociatedFunctions returns static methods', () => {
    const registry = new TypeRegistry();
    registry.impls.set('Point', [
      { name: 'distance', isAssociated: false },
      { name: 'origin', isAssociated: true },
    ]);
    expect(registry.getAssociatedFunctions('Point').length).toBe(1);
  });

  test('getVariantNames for ADTType', () => {
    const registry = new TypeRegistry();
    const variants = new Map();
    variants.set('Circle', new Map());
    variants.set('Square', new Map());
    registry.types.set('Shape', new ADTType('Shape', [], variants));
    expect(registry.getVariantNames('Shape')).toContain('Circle');
  });

  test('getVariantNames for non-ADT returns empty', () => {
    const registry = new TypeRegistry();
    registry.types.set('User', new RecordType('User', new Map()));
    expect(registry.getVariantNames('User')).toEqual([]);
  });

  test('fromAnalyzer populates from analyzer', () => {
    const result = analyze('type Shape { Circle(radius: Float) Square(side: Float) }');
    const registry = TypeRegistry.fromAnalyzer({ typeRegistry: result.typeRegistry });
    expect(registry.types).toBe(result.typeRegistry.types);
  });

  test('fromAnalyzer handles missing typeRegistry', () => {
    const registry = TypeRegistry.fromAnalyzer({});
    expect(registry.types.size).toBe(0);
  });
});
