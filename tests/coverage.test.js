// Additional tests targeting uncovered lines across all modules
import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { SharedCodegen } from '../src/codegen/shared-codegen.js';
import { ServerCodegen } from '../src/codegen/server-codegen.js';
import { ClientCodegen } from '../src/codegen/client-codegen.js';
import { BaseCodegen } from '../src/codegen/base-codegen.js';

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  return new Parser(tokens, '<test>').parse();
}

function parseExpr(source) {
  const ast = parse(`__x = ${source}`);
  return ast.body[0].values[0];
}

function compile(source) {
  const ast = parse(source);
  return new CodeGenerator(ast, '<test>').generate();
}

function compileShared(source) {
  return compile(source).shared.trim();
}

// ═══════════════════════════════════════════════════════════
// PARSER — uncovered branches
// ═══════════════════════════════════════════════════════════

describe('Parser — JSX elements', () => {
  test('self-closing tag', () => {
    const ast = parse('client { component C { <br /> } }');
    const comp = ast.body[0].body[0];
    const jsx = comp.body[0];
    expect(jsx.type).toBe('JSXElement');
    expect(jsx.selfClosing).toBe(true);
  });

  test('nested elements', () => {
    const ast = parse('client { component C { <div><span>"hello"</span></div> } }');
    const comp = ast.body[0].body[0];
    const div = comp.body[0];
    expect(div.children.length).toBeGreaterThan(0);
  });

  test('JSX with expression child in braces', () => {
    const ast = parse('client { component C { <div>{count}</div> } }');
    const comp = ast.body[0].body[0];
    const div = comp.body[0];
    const exprChild = div.children.find(c => c.type === 'JSXExpression');
    expect(exprChild).toBeDefined();
  });

  test('JSX boolean attribute', () => {
    const ast = parse('client { component C { <input disabled /> } }');
    const comp = ast.body[0].body[0];
    const input = comp.body[0];
    expect(input.attributes[0].name).toBe('disabled');
    expect(input.attributes[0].value.value).toBe(true);
  });

  test('JSX string attribute', () => {
    const ast = parse('client { component C { <div class="test">"hi"</div> } }');
    const comp = ast.body[0].body[0];
    const div = comp.body[0];
    expect(div.attributes[0].name).toBe('class');
  });

  test('JSX expression attribute', () => {
    const ast = parse('client { component C { <div id={myId}>"hi"</div> } }');
    const comp = ast.body[0].body[0];
    const div = comp.body[0];
    expect(div.attributes[0].value.type).toBe('Identifier');
  });

  test('JSX event attribute on:click', () => {
    const ast = parse('client { component C { <button on:click={handler}>"go"</button> } }');
    const comp = ast.body[0].body[0];
    const btn = comp.body[0];
    expect(btn.attributes[0].name).toBe('on:click');
  });

  test('JSX for loop', () => {
    const ast = parse('client { component C { <ul> for item in items { <li>"text"</li> } </ul> } }');
    const comp = ast.body[0].body[0];
    const ul = comp.body[0];
    const forNode = ul.children.find(c => c.type === 'JSXFor');
    expect(forNode).toBeDefined();
    expect(forNode.variable).toBe('item');
  });

  test('JSX if/else', () => {
    const ast = parse('client { component C { <div> if show { <span>"yes"</span> } else { <span>"no"</span> } </div> } }');
    const comp = ast.body[0].body[0];
    const div = comp.body[0];
    const ifNode = div.children.find(c => c.type === 'JSXIf');
    expect(ifNode).toBeDefined();
    expect(ifNode.alternate).not.toBeNull();
  });

  test('JSX if without else', () => {
    const ast = parse('client { component C { <div> if show { <span>"yes"</span> } </div> } }');
    const comp = ast.body[0].body[0];
    const div = comp.body[0];
    const ifNode = div.children.find(c => c.type === 'JSXIf');
    expect(ifNode.alternate).toBeNull();
  });

  test('JSX with keyword attribute names', () => {
    const ast = parse('client { component C { <input type="text" for="name" /> } }');
    const comp = ast.body[0].body[0];
    const input = comp.body[0];
    expect(input.attributes.find(a => a.name === 'type')).toBeDefined();
    expect(input.attributes.find(a => a.name === 'for')).toBeDefined();
  });

  test('JSX for with string text body', () => {
    const ast = parse('client { component C { <div> for x in items { "text" } </div> } }');
    const comp = ast.body[0].body[0];
    const div = comp.body[0];
    const forNode = div.children.find(c => c.type === 'JSXFor');
    expect(forNode.body.length).toBeGreaterThan(0);
  });

  test('JSX for with expression body', () => {
    const ast = parse('client { component C { <div> for x in items { <span>"a"</span> } </div> } }');
    const comp = ast.body[0].body[0];
    expect(comp.body[0].children.length).toBeGreaterThan(0);
  });

  test('JSX if with string text', () => {
    const ast = parse('client { component C { <div> if show { "text" } </div> } }');
    const comp = ast.body[0].body[0];
    const ifNode = comp.body[0].children.find(c => c.type === 'JSXIf');
    expect(ifNode.consequent.length).toBeGreaterThan(0);
  });

  test('JSX if else with text', () => {
    const ast = parse('client { component C { <div> if show { "yes" } else { "no" } </div> } }');
    const comp = ast.body[0].body[0];
    const ifNode = comp.body[0].children.find(c => c.type === 'JSXIf');
    expect(ifNode.alternate.length).toBeGreaterThan(0);
  });
});

describe('Parser — Object/Dict', () => {
  test('empty object literal', () => {
    const expr = parseExpr('{}');
    expect(expr.type).toBe('ObjectLiteral');
    expect(expr.properties.length).toBe(0);
  });

  test('object literal with multiple keys', () => {
    const expr = parseExpr('{a: 1, b: 2, c: 3}');
    expect(expr.type).toBe('ObjectLiteral');
    expect(expr.properties.length).toBe(3);
  });

  test('dict comprehension', () => {
    const expr = parseExpr('{k: v for k, v in pairs}');
    expect(expr.type).toBe('DictComprehension');
    expect(expr.variables).toEqual(['k', 'v']);
  });

  test('dict comprehension with condition', () => {
    const expr = parseExpr('{k: v for k, v in pairs if v > 0}');
    expect(expr.type).toBe('DictComprehension');
    expect(expr.condition).not.toBeNull();
  });

  test('dict comprehension single variable', () => {
    const expr = parseExpr('{x: x * 2 for x in list}');
    expect(expr.type).toBe('DictComprehension');
    expect(expr.variables).toEqual(['x']);
  });

  test('shorthand object literal', () => {
    const expr = parseExpr('{x, y}');
    expect(expr.type).toBe('ObjectLiteral');
    expect(expr.properties[0].shorthand).toBe(true);
  });
});

describe('Parser — Arrow lambdas', () => {
  test('arrow lambda with block body', () => {
    const expr = parseExpr('(a, b) => { a + b }');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.body.type).toBe('BlockStatement');
  });

  test('empty params arrow lambda', () => {
    const expr = parseExpr('() => 42');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.params.length).toBe(0);
  });

  test('arrow lambda with typed params', () => {
    const expr = parseExpr('(a: Int, b: Int) => a + b');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.params[0].typeAnnotation).not.toBeNull();
  });

  test('arrow lambda with default params', () => {
    const expr = parseExpr('(x = 1) => x * 2');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.params[0].defaultValue).not.toBeNull();
  });

  test('parenthesized expression (not lambda)', () => {
    const expr = parseExpr('(1 + 2)');
    expect(expr.type).toBe('BinaryExpression');
  });
});

describe('Parser — Lambda compound assignment body', () => {
  test('fn lambda with compound assignment', () => {
    const expr = parseExpr('fn(x) x += 1');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.body.type).toBe('CompoundAssignment');
  });

  test('fn lambda with assignment', () => {
    const expr = parseExpr('fn() x = 5');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.body.type).toBe('Assignment');
  });
});

describe('Parser — Subscript and computed member', () => {
  test('subscript access', () => {
    const expr = parseExpr('arr[0]');
    expect(expr.type).toBe('MemberExpression');
    expect(expr.computed).toBe(true);
  });

  test('method call chain', () => {
    const expr = parseExpr('obj.method(1).field');
    expect(expr.type).toBe('MemberExpression');
  });
});

describe('Parser — Error paths', () => {
  test('parser error on invalid syntax', () => {
    expect(() => parse('fn 123')).toThrow();
  });

  test('parser error on unclosed block', () => {
    expect(() => parse('if true {')).toThrow();
  });

  test('parser error on unexpected EOF', () => {
    expect(() => parse('fn foo(')).toThrow();
  });
});

describe('Parser — Edge cases', () => {
  test('trailing comma in array', () => {
    const expr = parseExpr('[1, 2, 3,]');
    expect(expr.type).toBe('ArrayLiteral');
    expect(expr.elements.length).toBe(3);
  });

  test('nil literal', () => {
    const expr = parseExpr('nil');
    expect(expr.type).toBe('NilLiteral');
  });

  test('power operator right-assoc', () => {
    const expr = parseExpr('2 ** 3 ** 2');
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('**');
  });

  test('negation', () => {
    const expr = parseExpr('not true');
    expect(expr.type).toBe('UnaryExpression');
    expect(expr.operator).toBe('not');
  });

  test('string multiply', () => {
    const expr = parseExpr('"ha" * 3');
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('*');
  });
});

// ═══════════════════════════════════════════════════════════
// CODEGEN — uncovered branches
// ═══════════════════════════════════════════════════════════

describe('Codegen — for-else', () => {
  test('for-else generates guarded loop', () => {
    const code = compileShared('for x in items { print(x) } else { print("empty") }');
    expect(code).toContain('__entered');
    expect(code).toContain('if (!__entered)');
  });
});

describe('Codegen — for with two vars and else', () => {
  test('for-else with two variables', () => {
    const code = compileShared('for k, v in pairs { print(k) } else { print("empty") }');
    expect(code).toContain('__entered');
    expect(code).toContain('[k, v]');
  });
});

describe('Codegen — return without value', () => {
  test('bare return', () => {
    const code = compileShared('fn foo() { return }');
    expect(code).toContain('return;');
  });
});

describe('Codegen — block statement', () => {
  test('nested blocks', () => {
    const code = compileShared('fn foo() { if true { print(1) } }');
    expect(code).toContain('if (true)');
  });
});

describe('Codegen — object literal', () => {
  test('object with multiple props', () => {
    const code = compileShared('x = {a: 1, b: 2}');
    expect(code).toContain('a: 1');
    expect(code).toContain('b: 2');
  });

  test('shorthand object', () => {
    const code = compileShared('x = {a, b}');
    // shorthand generates just the key name
    expect(code).toContain('a');
    expect(code).toContain('b');
  });
});

describe('Codegen — dict comprehension', () => {
  test('basic dict comprehension', () => {
    const code = compileShared('x = {k: v for k, v in pairs}');
    expect(code).toContain('Object.fromEntries');
    expect(code).toContain('[k, v]');
  });

  test('dict comprehension with condition', () => {
    const code = compileShared('x = {k: v for k, v in pairs if v > 0}');
    expect(code).toContain('.filter(');
    expect(code).toContain('Object.fromEntries');
  });

  test('dict comprehension single var', () => {
    const code = compileShared('x = {x: x * 2 for x in list}');
    expect(code).toContain('Object.fromEntries');
  });
});

describe('Codegen — pipe to identifier', () => {
  test('pipe to bare function', () => {
    const code = compileShared('x = 5 |> print');
    expect(code).toContain('print(5)');
  });
});

describe('Codegen — match advanced', () => {
  test('match with binding pattern and guard', () => {
    const code = compileShared('x = match val { n if n > 10 => "big", _ => "small" }');
    expect(code).toContain('(n) =>');
    expect(code).toContain('> 10');
  });

  test('match with block body arm', () => {
    const code = compileShared('x = match val { 0 => { print("zero")\n"zero" }, _ => "other" }');
    expect(code).toContain('print("zero")');
  });

  test('match with variant and fields', () => {
    const code = compileShared('x = match shape { Circle(r) => r * 2, Rect(w, h) => w * h }');
    expect(code).toContain('__tag === "Circle"');
    expect(code).toContain('const r = __match.r');
    expect(code).toContain('__tag === "Rect"');
  });

  test('match inclusive range', () => {
    const code = compileShared('x = match val { 1..=10 => "range", _ => "other" }');
    expect(code).toContain('<=');
  });

  test('match binding as default (last arm)', () => {
    const code = compileShared('x = match val { 0 => "zero", n => n * 2 }');
    expect(code).toContain('const n = __match');
    expect(code).toContain('n * 2');
  });

  test('match with wildcard guard', () => {
    const code = compileShared('x = match val { n if n > 0 => "pos", n if n < 0 => "neg", _ => "zero" }');
    expect(code).toContain('(n) =>');
  });
});

describe('Codegen — member expression computed', () => {
  test('computed member access', () => {
    const code = compileShared('x = obj[key]');
    expect(code).toContain('obj[key]');
  });
});

describe('Codegen — optional chain computed', () => {
  test('optional chain non-computed', () => {
    const code = compileShared('x = obj?.name');
    expect(code).toContain('obj?.name');
  });
});

describe('Codegen — var multiple assignment', () => {
  test('var with multiple targets', () => {
    const code = compileShared('var a, b = 1, 2');
    expect(code).toContain('let a = 1');
    expect(code).toContain('let b = 2');
  });
});

describe('Codegen — let destructure array', () => {
  test('let array destructure', () => {
    const code = compileShared('let [a, b] = pair');
    expect(code).toContain('const [a, b]');
  });
});

describe('Codegen — slice edge cases', () => {
  test('slice from end only', () => {
    const code = compileShared('x = list[2:]');
    expect(code).toContain('.slice(2)');
  });

  test('full copy slice', () => {
    const code = compileShared('x = list[:]');
    expect(code).toContain('.slice()');
  });
});

describe('Codegen — type with no-arg variant', () => {
  test('variant with no fields generates frozen object', () => {
    const code = compileShared('type Color { Red, Green, Blue }');
    expect(code).toContain('const Red = Object.freeze');
    expect(code).toContain('const Green = Object.freeze');
  });
});

describe('Codegen — named argument passthrough', () => {
  test('named arguments in call', () => {
    const code = compileShared('x = foo(name: "bar")');
    expect(code).toContain('"bar"');
  });
});

describe('Codegen — import alias', () => {
  test('import with alias', () => {
    const code = compileShared('import { Component as Comp } from "react"');
    expect(code).toContain('Component as Comp');
  });
});

// ═══════════════════════════════════════════════════════════
// CODEGEN — Client-specific coverage
// ═══════════════════════════════════════════════════════════

describe('Codegen — Client full pipeline', () => {
  test('client with state, computed, effect, component', () => {
    const result = compile(`
      client {
        state count = 0
        state name: String = ""
        computed doubled = count * 2
        effect { print(count) }
        fn helper() { 42 }
        component App {
          <div class="app">
            <h1>"Title"</h1>
            <p>"{count}"</p>
            <button on:click={fn() count += 1}>"+"</button>
            <button on:click={fn() count -= 1}>"-"</button>
            <button on:click={fn() count = 0}>"Reset"</button>
          </div>
        }
      }
    `);
    expect(result.client).toContain('createSignal(0)');
    expect(result.client).toContain('setCount');
    expect(result.client).toContain('createComputed');
    expect(result.client).toContain('createEffect');
    expect(result.client).toContain('function App(');
    expect(result.client).toContain('function helper(');
    expect(result.client).toContain('setCount(__prev => __prev + 1)');
    expect(result.client).toContain('setCount(__prev => __prev - 1)');
    expect(result.client).toContain('setCount(0)');
  });

  test('client component with props', () => {
    const result = compile('client { component Card(title, body) { <div><h2>"{title}"</h2></div> } }');
    expect(result.client).toContain('function Card({ title, body })');
  });

  test('client JSX self-closing', () => {
    const result = compile('client { component C { <br /> } }');
    expect(result.client).toContain('lux_el("br"');
  });

  test('client JSX for loop', () => {
    const result = compile('client { component C { <ul> for item in items { <li>"text"</li> } </ul> } }');
    expect(result.client).toContain('.map(');
  });

  test('client JSX if/else', () => {
    const result = compile('client { component C { <div> if show { <span>"yes"</span> } else { <span>"no"</span> } </div> } }');
    expect(result.client).toContain('?');
    expect(result.client).toContain(':');
  });

  test('client JSX if without else', () => {
    const result = compile('client { component C { <div> if show { <span>"yes"</span> } </div> } }');
    expect(result.client).toContain(': null');
  });

  test('client JSX text as template literal', () => {
    const result = compile('client { component C { <p>"{name}"</p> } }');
    expect(result.client).toContain('`${name}`');
  });

  test('client state assignment in effect', () => {
    const result = compile('client { state x = 0 effect { x = 5 } }');
    expect(result.client).toContain('setX(5)');
  });

  test('client state compound in regular statement', () => {
    const result = compile('client { state x = 0 fn inc() { x += 1 } }');
    expect(result.client).toContain('setX(__prev => __prev + 1)');
  });

  test('client with shared code', () => {
    const result = compile('shared { type User { name: String } } client { state x = 0 }');
    expect(result.client).toContain('Shared');
    expect(result.client).toContain('function User');
  });
});

// ═══════════════════════════════════════════════════════════
// CODEGEN — Server additional coverage
// ═══════════════════════════════════════════════════════════

describe('Codegen — Server coverage', () => {
  test('server with multiple functions and routes', () => {
    const result = compile(`
      server {
        var data = []
        fn get_data() { data }
        fn add_item(name: String) { name }
        route GET "/api/data" => get_data
        route POST "/api/data" => add_item
      }
    `);
    expect(result.server).toContain('function get_data()');
    expect(result.server).toContain('function add_item(name)');
    expect(result.server).toContain('__addRoute("GET"');
    expect(result.server).toContain('__addRoute("POST"');
    expect(result.server).toContain('"/rpc/get_data"');
    expect(result.server).toContain('const { name } = body');
  });

  test('server with no routes', () => {
    const result = compile('server { fn hello() { "world" } }');
    expect(result.server).toContain('function hello()');
    expect(result.server).toContain('Bun.serve(');
  });

  test('server with shared code', () => {
    const result = compile('shared { type User { name: String } } server { fn get() { [] } }');
    expect(result.server).toContain('function User');
    expect(result.server).toContain('function get()');
  });
});

// ═══════════════════════════════════════════════════════════
// LEXER — uncovered edge cases
// ═══════════════════════════════════════════════════════════

describe('Lexer — edge cases', () => {
  test('modulo operator', () => {
    const lexer = new Lexer('x % 2', '<test>');
    const tokens = lexer.tokenize();
    expect(tokens.some(t => t.value === '%')).toBe(true);
  });

  test('not equal operator', () => {
    const lexer = new Lexer('a != b', '<test>');
    const tokens = lexer.tokenize();
    expect(tokens.some(t => t.value === '!=')).toBe(true);
  });

  test('logical not !', () => {
    const lexer = new Lexer('!x', '<test>');
    const tokens = lexer.tokenize();
    expect(tokens.some(t => t.value === '!')).toBe(true);
  });

  test('spread operator', () => {
    const lexer = new Lexer('[...x]', '<test>');
    const tokens = lexer.tokenize();
    expect(tokens.some(t => t.type === 'SPREAD')).toBe(true);
  });

  test('multiline input', () => {
    const lexer = new Lexer('x = 1\ny = 2', '<test>');
    const tokens = lexer.tokenize();
    const yToken = tokens.find(t => t.value === 'y');
    expect(yToken.line).toBe(2);
  });

  test('consecutive operators', () => {
    const lexer = new Lexer('a >= b <= c', '<test>');
    const tokens = lexer.tokenize();
    expect(tokens.some(t => t.value === '>=')).toBe(true);
    expect(tokens.some(t => t.value === '<=')).toBe(true);
  });

  test('underscore identifier', () => {
    const lexer = new Lexer('_ = foo()', '<test>');
    const tokens = lexer.tokenize();
    expect(tokens.some(t => t.value === '_')).toBe(true);
  });

  test('empty string', () => {
    const lexer = new Lexer('x = ""', '<test>');
    const tokens = lexer.tokenize();
    expect(tokens.some(t => t.type === 'STRING' && t.value === '')).toBe(true);
  });

  test('string with escapes', () => {
    const lexer = new Lexer('x = "hello\\nworld"', '<test>');
    const tokens = lexer.tokenize();
    expect(tokens.some(t => t.type === 'STRING')).toBe(true);
  });

  test('negative number', () => {
    const code = compileShared('x = -42');
    expect(code).toContain('-42');
  });

  test('as keyword', () => {
    const lexer = new Lexer('import { x as y } from "m"', '<test>');
    const tokens = lexer.tokenize();
    expect(tokens.some(t => t.type === 'AS')).toBe(true);
  });

  test('export keyword', () => {
    const lexer = new Lexer('export', '<test>');
    const tokens = lexer.tokenize();
    expect(tokens.some(t => t.type === 'EXPORT')).toBe(true);
  });

  test('component keyword', () => {
    const lexer = new Lexer('component', '<test>');
    const tokens = lexer.tokenize();
    expect(tokens.some(t => t.type === 'COMPONENT')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// ANALYZER — remaining uncovered paths
// ═══════════════════════════════════════════════════════════

describe('Analyzer — dict comprehension', () => {
  test('dict comprehension with condition', () => {
    expect(() => {
      const ast = parse('x = {k: v for k, v in pairs if v > 0}');
      new Analyzer(ast, '<test>').analyze();
    }).not.toThrow();
  });

  test('dict comprehension single var', () => {
    expect(() => {
      const ast = parse('x = {x: x * 2 for x in list}');
      new Analyzer(ast, '<test>').analyze();
    }).not.toThrow();
  });
});

describe('Analyzer — object literal', () => {
  test('object literal analysis', () => {
    expect(() => {
      const ast = parse('x = {a: 1, b: 2}');
      new Analyzer(ast, '<test>').analyze();
    }).not.toThrow();
  });
});

describe('Analyzer — JSX expression children', () => {
  test('JSX with expression child', () => {
    expect(() => {
      const ast = parse('client { component C { <div>{count}</div> } }');
      new Analyzer(ast, '<test>').analyze();
    }).not.toThrow();
  });

  test('JSX with text child', () => {
    expect(() => {
      const ast = parse('client { component C { <p>"hello"</p> } }');
      new Analyzer(ast, '<test>').analyze();
    }).not.toThrow();
  });
});

describe('Analyzer — warn function', () => {
  test('warn adds warning', () => {
    const ast = parse('x = 1');
    const analyzer = new Analyzer(ast, '<test>');
    analyzer.warn('test warning', { line: 1, column: 1, file: '<test>' });
    expect(analyzer.warnings.length).toBe(1);
    expect(analyzer.warnings[0].message).toBe('test warning');
  });

  test('warn with no loc', () => {
    const ast = parse('x = 1');
    const analyzer = new Analyzer(ast, '<test>');
    analyzer.warn('test warning');
    expect(analyzer.warnings.length).toBe(1);
  });

  test('error with no loc', () => {
    const ast = parse('x = 1');
    const analyzer = new Analyzer(ast, '<test>');
    analyzer.error('test error');
    expect(analyzer.errors.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════
// SharedCodegen direct test
// ═══════════════════════════════════════════════════════════

describe('SharedCodegen', () => {
  test('generates from shared block node', () => {
    const gen = new SharedCodegen();
    const ast = parse('shared { x = 1 }');
    const code = gen.generate(ast.body[0]);
    expect(code).toContain('const x = 1');
  });
});

// ═══════════════════════════════════════════════════════════
// BaseCodegen — expression fallback
// ═══════════════════════════════════════════════════════════

describe('BaseCodegen — edge cases', () => {
  test('unknown expression type returns comment', () => {
    const gen = new BaseCodegen();
    const result = gen.genExpression({ type: 'Unknown123' });
    expect(result).toContain('unknown');
  });

  test('unknown statement returns comment', () => {
    const gen = new BaseCodegen();
    const result = gen.generateStatement({ type: 'SomethingUnknown' });
    expect(result).toContain('unknown');
  });
});

// ═══════════════════════════════════════════════════════════
// Index re-exports
// ═══════════════════════════════════════════════════════════

describe('Index exports', () => {
  test('all main modules exported', () => {
    const index = require('../src/index.js');
    expect(index.Lexer).toBeDefined();
    expect(index.Parser).toBeDefined();
    expect(index.Analyzer).toBeDefined();
    expect(index.CodeGenerator).toBeDefined();
    expect(index.TokenType).toBeDefined();
  });
});
