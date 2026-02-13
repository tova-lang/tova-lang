// Second batch of coverage tests — targeting remaining uncovered lines
import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { TokenType, Token } from '../src/lexer/tokens.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { ClientCodegen } from '../src/codegen/client-codegen.js';
import * as AST from '../src/parser/ast.js';

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  return new Parser(tokens, '<test>').parse();
}

function parseExpr(source) {
  return parse(`__x = ${source}`).body[0].values[0];
}

function compile(source) {
  return new CodeGenerator(parse(source), '<test>').generate();
}

function compileShared(source) {
  return compile(source).shared.trim();
}

// ═══════════════════════════════════════════════════════════
// LEXER — remaining uncovered lines (14, 43, 164, 283, 301, 324-332, 340, 469)
// ═══════════════════════════════════════════════════════════

describe('Lexer — error paths', () => {
  // Line 14: lexer error() method
  test('error on unexpected character', () => {
    expect(() => new Lexer('`', '<test>').tokenize()).toThrow();
  });

  test('error on lone & character', () => {
    expect(() => new Lexer('&', '<test>').tokenize()).toThrow('&&');
  });

  test('error on lone | character', () => {
    expect(() => new Lexer('x | y', '<test>').tokenize()).toThrow('||');
  });

  // Line 164: unterminated block comment
  test('unterminated block comment', () => {
    expect(() => new Lexer('/* unclosed', '<test>').tokenize()).toThrow('Unterminated');
  });

  // Line 283: unterminated string interpolation
  test('unterminated string interpolation', () => {
    expect(() => new Lexer('"hello {name', '<test>').tokenize()).toThrow();
  });

  // Line 301: unterminated double-quoted string
  test('unterminated double-quoted string', () => {
    expect(() => new Lexer('"unclosed', '<test>').tokenize()).toThrow('Unterminated');
  });

  // Line 340: unterminated single-quoted string
  test('unterminated single-quoted string', () => {
    expect(() => new Lexer("'unclosed", '<test>').tokenize()).toThrow('Unterminated');
  });
});

describe('Lexer — single quote escapes (lines 324-332)', () => {
  test('newline escape', () => {
    const lexer = new Lexer("'hello\\nworld'", '<test>');
    const tokens = lexer.tokenize();
    const str = tokens.find(t => t.type === TokenType.STRING);
    expect(str.value).toContain('\n');
  });

  test('tab escape', () => {
    const lexer = new Lexer("'a\\tb'", '<test>');
    const tokens = lexer.tokenize();
    const str = tokens.find(t => t.type === TokenType.STRING);
    expect(str.value).toContain('\t');
  });

  test('carriage return escape', () => {
    const lexer = new Lexer("'a\\rb'", '<test>');
    const tokens = lexer.tokenize();
    const str = tokens.find(t => t.type === TokenType.STRING);
    expect(str.value).toContain('\r');
  });

  test('backslash escape', () => {
    const lexer = new Lexer("'a\\\\b'", '<test>');
    const tokens = lexer.tokenize();
    const str = tokens.find(t => t.type === TokenType.STRING);
    expect(str.value).toBe('a\\b');
  });

  test('single quote escape', () => {
    const lexer = new Lexer("'it\\'s'", '<test>');
    const tokens = lexer.tokenize();
    const str = tokens.find(t => t.type === TokenType.STRING);
    expect(str.value).toBe("it's");
  });

  test('unknown escape passes through', () => {
    const lexer = new Lexer("'a\\zb'", '<test>');
    const tokens = lexer.tokenize();
    const str = tokens.find(t => t.type === TokenType.STRING);
    expect(str.value).toBe('a\\zb');
  });
});

describe('Lexer — addToken (line 43) & number formats', () => {
  test('hex number', () => {
    const lexer = new Lexer('x = 0xFF', '<test>');
    const tokens = lexer.tokenize();
    const num = tokens.find(t => t.type === TokenType.NUMBER);
    expect(num.value).toBe(255);
  });

  test('binary number', () => {
    const lexer = new Lexer('x = 0b1010', '<test>');
    const tokens = lexer.tokenize();
    const num = tokens.find(t => t.type === TokenType.NUMBER);
    expect(num.value).toBe(10);
  });

  test('octal number', () => {
    const lexer = new Lexer('x = 0o17', '<test>');
    const tokens = lexer.tokenize();
    const num = tokens.find(t => t.type === TokenType.NUMBER);
    expect(num.value).toBe(15);
  });

  test('number with underscore separators', () => {
    const lexer = new Lexer('x = 1_000_000', '<test>');
    const tokens = lexer.tokenize();
    const num = tokens.find(t => t.type === TokenType.NUMBER);
    expect(num.value).toBe(1000000);
  });

  test('&& operator (line 469)', () => {
    const lexer = new Lexer('a && b', '<test>');
    const tokens = lexer.tokenize();
    expect(tokens.some(t => t.type === TokenType.AND_AND)).toBe(true);
  });
});

describe('Lexer — Token constructor', () => {
  test('Token stores all properties', () => {
    const t = new Token(TokenType.NUMBER, 42, 1, 5);
    expect(t.type).toBe(TokenType.NUMBER);
    expect(t.value).toBe(42);
    expect(t.line).toBe(1);
    expect(t.column).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════
// PARSER — remaining uncovered lines
// ═══════════════════════════════════════════════════════════

describe('Parser — destructuring patterns', () => {
  // Line 620: object pattern with alias (key: alias)
  test('object destructuring with alias', () => {
    const ast = parse('let { name: n } = user');
    const d = ast.body[0];
    expect(d.pattern.properties[0].key).toBe('name');
    expect(d.pattern.properties[0].value).toBe('n');
  });

  // Line 623: object pattern with default value
  test('object destructuring with default value', () => {
    const ast = parse('let { name = "unknown" } = user');
    const d = ast.body[0];
    expect(d.pattern.properties[0].defaultValue).not.toBeNull();
  });

  // Lines 641-642: array pattern with skip placeholder _
  test('array destructuring with skip placeholder', () => {
    const ast = parse('let [a, _, c] = triple');
    const d = ast.body[0];
    expect(d.pattern.elements[0]).toBe('a');
    expect(d.pattern.elements[1]).toBeNull();
    expect(d.pattern.elements[2]).toBe('c');
  });
});

describe('Parser — generic type annotations', () => {
  // Lines 510-513: generic type param parsing
  test('function with generic type params', () => {
    const ast = parse('fn foo(x: Map<String, Int>) { x }');
    const fn = ast.body[0];
    expect(fn.params[0].typeAnnotation.typeParams.length).toBe(2);
  });
});

describe('Parser — expression statement vs assignment', () => {
  // Lines 786-787: assignment to non-identifier (error path)
  test('compound assignment to member expression', () => {
    const ast = parse('obj.count += 1');
    expect(ast.body[0].type).toBe('CompoundAssignment');
  });

  // Line 794: compound assignment to invalid target (error)
  test('compound assignment to invalid target throws', () => {
    expect(() => parse('123 += 1')).toThrow();
  });
});

describe('Parser — slice edge cases', () => {
  // Line 1009: slice with step
  test('slice with end and step', () => {
    const expr = parseExpr('list[0:10:2]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.step.value).toBe(2);
  });

  // start:end:step
  test('full slice with step', () => {
    const expr = parseExpr('list[1:5:2]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start.value).toBe(1);
    expect(expr.end.value).toBe(5);
    expect(expr.step.value).toBe(2);
  });

  // start: (no end)
  test('slice start only (no end)', () => {
    const expr = parseExpr('list[2:]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start.value).toBe(2);
    expect(expr.end).toBeNull();
  });
});

describe('Parser — match statement at top level', () => {
  test('match as expression statement', () => {
    const ast = parse('match x { 1 => print("one"), _ => print("other") }');
    // Should be wrapped in ExpressionStatement
    expect(ast.body[0].type).toBe('ExpressionStatement');
  });
});

describe('Parser — server/client as expression identifiers', () => {
  // Lines 1118-1119
  test('client as identifier in expression', () => {
    const ast = parse('x = client.get_data()');
    expect(ast.body[0].values[0].type).toBe('CallExpression');
  });

  test('shared as identifier in expression', () => {
    const ast = parse('x = shared.config');
    expect(ast.body[0].values[0].type).toBe('MemberExpression');
  });
});

describe('Parser — component with statements inside', () => {
  // Line 237: parseComponentDeclaration when body has non-JSX statements
  test('component with local statements and JSX', () => {
    const ast = parse('client { component C { <div>"hello"</div> } }');
    const comp = ast.body[0].body[0];
    expect(comp.body.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Parser — parseBlock and empty blocks', () => {
  test('empty function body', () => {
    const ast = parse('fn foo() {}');
    expect(ast.body[0].body.type).toBe('BlockStatement');
    expect(ast.body[0].body.body.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// ANALYZER — remaining catch-block error paths
// ═══════════════════════════════════════════════════════════

describe('Analyzer — duplicate definitions', () => {
  // These lines are all catch blocks: 231, 247, 264, 274, 286, 297, 313, 323, 335, 345, 385, etc.
  test('duplicate immutable variable errors', () => {
    // x defined twice as immutable (first assign defines, second hits catch in line 231)
    const ast = parse('x = 1');
    // Manually add duplicate
    ast.body.push(ast.body[0]); // same assignment node
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('duplicate var declaration errors', () => {
    const ast = parse('var x = 1\nvar x = 2');
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('duplicate function declaration errors', () => {
    const ast = parse('fn foo() { 1 }\nfn foo() { 2 }');
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('duplicate type declaration errors', () => {
    const ast = parse('type User { name: String }\ntype User { age: Int }');
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('duplicate import declaration errors', () => {
    const ast = parse('import { foo } from "a"\nimport { foo } from "b"');
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('duplicate import default errors', () => {
    const ast = parse('import React from "react"\nimport React from "react2"');
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('duplicate let destructure object errors', () => {
    const ast = parse('let { a } = x\nlet { a } = y');
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('duplicate let destructure array errors', () => {
    const ast = parse('let [a] = x\nlet [a] = y');
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('duplicate param in function errors', () => {
    const ast = parse('fn foo(a, a) { a }');
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('duplicate variant constructor errors', () => {
    // Two types with the same variant name
    const ast = parse('type A { Foo(x: Int) }\ntype B { Foo(y: Int) }');
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('duplicate state declaration errors', () => {
    const ast = parse('client { state x = 0\nstate x = 1 }');
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('duplicate computed declaration errors', () => {
    const ast = parse('client { computed x = 1\ncomputed x = 2 }');
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('duplicate component declaration errors', () => {
    const ast = parse('client { component A { <div>"a"</div> }\ncomponent A { <div>"b"</div> } }');
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('duplicate for loop variable (in nested scope, no error)', () => {
    expect(() => {
      const ast = parse('for x in items { print(x) }\nfor x in items { print(x) }');
      new Analyzer(ast, '<test>').analyze();
    }).not.toThrow();
  });

  test('lambda with duplicate param errors', () => {
    const ast = parse('x = fn(a, a) a');
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('match binding duplicate in same scope', () => {
    // match arms get their own scope, so this should be fine
    expect(() => {
      const ast = parse('x = match val { n => n, m => m }');
      new Analyzer(ast, '<test>').analyze();
    }).not.toThrow();
  });

  test('component with duplicate param errors', () => {
    const ast = parse('client { component C(a, a) { <div>"x"</div> } }');
    const analyzer = new Analyzer(ast, '<test>');
    expect(() => analyzer.analyze()).toThrow();
  });

  test('list comprehension variable scope', () => {
    expect(() => {
      const ast = parse('x = [i for i in range(10)]');
      new Analyzer(ast, '<test>').analyze();
    }).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════
// CODEGEN — remaining base-codegen lines
// ═══════════════════════════════════════════════════════════

describe('Codegen — genBlock and genBlockBody', () => {
  // Lines 256-261: genBlock (BlockStatement direct)
  // Lines 267-270: genBlockBody with non-block (expression body)
  test('function with expression body (single expr, no braces)', () => {
    // This exercises genBlockBody when body is NOT a BlockStatement
    // Arrow functions with block bodies go through genBlockBody
    const code = compileShared('fn add(a, b) { a + b }');
    expect(code).toContain('return (a + b)');
  });

  test('function with multiple statements', () => {
    const code = compileShared('fn foo() { var x = 1\nreturn x }');
    expect(code).toContain('let x = 1');
    expect(code).toContain('return x');
  });
});

describe('Codegen — computed member and optional chain', () => {
  // Line 364: computed member genMemberExpression
  test('computed member expression', () => {
    const code = compileShared('x = obj[key]');
    expect(code).toContain('obj[key]');
  });

  // Line 371: computed optional chain
  // Optional chain with computed access isn't parsed by our parser normally
  // but test the codegen path directly
  test('optional chain property', () => {
    const code = compileShared('x = obj?.name');
    expect(code).toContain('?.name');
  });
});

describe('Codegen — pipe to lambda fallback', () => {
  // Line 389: pipe to something that's not an identifier or call
  test('pipe to lambda expression', () => {
    const code = compileShared('x = 5 |> fn(n) n * 2');
    expect(code).toContain('5');
    expect(code).toContain('* 2');
  });
});

describe('Codegen — lambda bodies in base codegen', () => {
  // Lines 398-399: lambda with block body
  test('lambda with block body', () => {
    const code = compileShared('x = fn(a) { a + 1 }');
    expect(code).toContain('=>');
    expect(code).toContain('return');
  });

  // Lines 404-407: lambda with Assignment body
  test('lambda with assignment body', () => {
    const code = compileShared('x = fn() y = 5');
    expect(code).toContain('=>');
    expect(code).toContain('const y = 5');
  });
});

describe('Codegen — match with block body', () => {
  // Line 432: match arm with block body
  test('match arm with block body', () => {
    const code = compileShared('x = match val { 0 => { var y = 1\ny }, _ => 0 }');
    expect(code).toContain('let y = 1');
  });
});

describe('Codegen — range inclusive', () => {
  // Line 471: inclusive range pattern in match (already tested? ensure coverage)
  test('inclusive range in match', () => {
    const code = compileShared('x = match n { 1..=5 => "low", _ => "high" }');
    expect(code).toContain('<=');
  });
});

describe('Codegen — pattern bindings in match', () => {
  // Line 492: binding pattern with guard
  test('binding with guard', () => {
    const code = compileShared('x = match val { n if n > 0 => n, _ => 0 }');
    expect(code).toContain('(n) =>');
  });
});

describe('Codegen — slice with step', () => {
  // Lines 571-572: slice with step
  test('slice with step generates IIFE', () => {
    const code = compileShared('x = list[0:10:2]');
    expect(code).toContain('for (let i');
    expect(code).toContain('i += st');
  });
});

// ═══════════════════════════════════════════════════════════
// CLIENT CODEGEN — remaining uncovered lines
// ═══════════════════════════════════════════════════════════

describe('Client Codegen — lambda state transforms', () => {
  // Lines 38-39: lambda with block body in client (state-aware)
  test('client lambda with block body containing state mutation', () => {
    const result = compile('client { state count = 0\nfn handler() { count += 1\nprint(count) } }');
    expect(result.client).toContain('setCount');
  });

  // Line 57: lambda assignment to state variable (fn() count = x)
  test('client lambda assignment to state in fn body', () => {
    const result = compile(`
      client {
        state count = 0
        component App {
          <button on:click={fn() count = 10}>"reset"</button>
        }
      }
    `);
    expect(result.client).toContain('setCount(10)');
  });

  // Lines 60-65: non-state compound/assignment/var in lambda body
  test('client lambda with non-state compound assignment', () => {
    const result = compile('client { state x = 0\nfn inc() { var y = 1\ny += 1 } }');
    expect(result.client).toContain('y += 1');
  });

  test('client lambda with non-state assignment body', () => {
    const result = compile(`
      client {
        state x = 0
        component App {
          <button on:click={fn() y = 5}>"go"</button>
        }
      }
    `);
    expect(result.client).toContain('const y = 5');
  });
});

describe('Client Codegen — component bodies', () => {
  // Line 191: JSXFor in component body (treated as JSX)
  test('component body with JSXFor', () => {
    const result = compile('client { component C { <div> for x in items { <span>"text"</span> } </div> } }');
    expect(result.client).toContain('.map(');
  });

  // Lines 198: component with function and JSX
  test('component with function and JSX', () => {
    const result = compile('client { component C { <div>"hello"</div> } }');
    expect(result.client).toContain('tova_el("div"');
  });

  // Lines 204-206: multiple JSX root elements → fragment
  test('component with multiple JSX roots → fragment', () => {
    const result = compile('client { component C { <h1>"title"</h1>\n<p>"body"</p> } }');
    expect(result.client).toContain('tova_fragment');
  });

  // Line 269: JSXText with template literal
  test('JSX text with template literal interpolation', () => {
    const result = compile('client { component C { <p>"hello {name}"</p> } }');
    expect(result.client).toContain('`hello ${name}`');
  });
});

describe('Client Codegen — JSX for with multiple children', () => {
  test('JSX for with multiple child elements', () => {
    const result = compile('client { component C { <div> for x in items { <span>"a"</span>\n<span>"b"</span> } </div> } }');
    expect(result.client).toContain('tova_fragment');
  });
});

describe('Client Codegen — JSX if with multiple consequent elements', () => {
  test('JSX if with multiple then elements', () => {
    const result = compile('client { component C { <div> if show { <span>"a"</span>\n<span>"b"</span> } </div> } }');
    // Multiple elements in consequent should produce tova_fragment
    expect(result.client).toContain('tova_fragment');
  });
});

// ═══════════════════════════════════════════════════════════
// AST — remaining uncovered constructors (lines 667-670)
// ═══════════════════════════════════════════════════════════

describe('AST — all node constructors', () => {
  test('DictComprehension node', () => {
    const loc = { line: 1, column: 1 };
    const node = new AST.DictComprehension(
      new AST.Identifier('k', loc),
      new AST.Identifier('v', loc),
      ['k', 'v'],
      new AST.Identifier('pairs', loc),
      null,
      loc
    );
    expect(node.type).toBe('DictComprehension');
    expect(node.variables).toEqual(['k', 'v']);
  });

  test('JSXFor node', () => {
    const loc = { line: 1, column: 1 };
    const node = new AST.JSXFor('item', new AST.Identifier('items', loc), [], loc);
    expect(node.type).toBe('JSXFor');
    expect(node.variable).toBe('item');
  });

  test('JSXIf node', () => {
    const loc = { line: 1, column: 1 };
    const node = new AST.JSXIf(new AST.BooleanLiteral(true, loc), [], null, loc);
    expect(node.type).toBe('JSXIf');
  });

  test('JSXExpression node', () => {
    const loc = { line: 1, column: 1 };
    const node = new AST.JSXExpression(new AST.Identifier('x', loc), loc);
    expect(node.type).toBe('JSXExpression');
  });

  test('JSXText node', () => {
    const loc = { line: 1, column: 1 };
    const node = new AST.JSXText(new AST.StringLiteral('hi', loc), loc);
    expect(node.type).toBe('JSXText');
  });

  test('JSXAttribute node', () => {
    const loc = { line: 1, column: 1 };
    const node = new AST.JSXAttribute('class', new AST.StringLiteral('foo', loc), loc);
    expect(node.type).toBe('JSXAttribute');
    expect(node.name).toBe('class');
  });

  test('ObjectPattern node', () => {
    const loc = { line: 1, column: 1 };
    const node = new AST.ObjectPattern([{ key: 'a', value: 'a' }], loc);
    expect(node.type).toBe('ObjectPattern');
  });

  test('ArrayPattern node', () => {
    const loc = { line: 1, column: 1 };
    const node = new AST.ArrayPattern(['a', 'b'], loc);
    expect(node.type).toBe('ArrayPattern');
  });

  test('WildcardPattern node', () => {
    const loc = { line: 1, column: 1 };
    const node = new AST.WildcardPattern(loc);
    expect(node.type).toBe('WildcardPattern');
  });

  test('RangePattern node', () => {
    const loc = { line: 1, column: 1 };
    const node = new AST.RangePattern(1, 10, false, loc);
    expect(node.type).toBe('RangePattern');
  });

  test('BindingPattern node', () => {
    const loc = { line: 1, column: 1 };
    const node = new AST.BindingPattern('n', loc);
    expect(node.type).toBe('BindingPattern');
  });

  test('VariantPattern node', () => {
    const loc = { line: 1, column: 1 };
    const node = new AST.VariantPattern('Circle', ['r'], loc);
    expect(node.type).toBe('VariantPattern');
  });

  test('TypeAnnotation node', () => {
    const loc = { line: 1, column: 1 };
    const node = new AST.TypeAnnotation('Int', [], loc);
    expect(node.type).toBe('TypeAnnotation');
  });

  test('ArrayTypeAnnotation node', () => {
    const loc = { line: 1, column: 1 };
    const node = new AST.ArrayTypeAnnotation(new AST.TypeAnnotation('Int', [], loc), loc);
    expect(node.type).toBe('ArrayTypeAnnotation');
  });
});

// ═══════════════════════════════════════════════════════════
// ROUTER — test with window mock
// ═══════════════════════════════════════════════════════════

describe('Router — internal functions via defineRoutes + navigate', () => {
  test('defineRoutes creates patterns for parameterized routes', () => {
    // defineRoutes internally calls pathToRegex
    expect(() => {
      const { defineRoutes } = require('../src/runtime/router.js');
      defineRoutes({
        '/': () => 'home',
        '/users/:id': () => 'user',
        '/files/*': () => 'files',
      });
    }).not.toThrow();
  });
});
