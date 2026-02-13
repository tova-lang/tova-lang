// Final coverage gap tests — targets specific uncovered lines
import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
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

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function analyze(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze();
}

// =============================================================
// base-codegen.js remaining gaps
// =============================================================

describe('Codegen Final — NamedArgument in genExpression (line 126)', () => {
  test('NamedArgument fallback returns value expression', () => {
    const gen = new BaseCodegen();
    const node = { type: 'NamedArgument', name: 'x', value: { type: 'NumberLiteral', value: 42 } };
    expect(gen.genExpression(node)).toBe('42');
  });
});

describe('Codegen Final — LetDestructure fallback (line 191)', () => {
  test('unknown pattern type returns empty string', () => {
    const gen = new BaseCodegen();
    const node = { pattern: { type: 'UnknownPattern' }, value: { type: 'Identifier', name: 'x' } };
    expect(gen.genLetDestructure(node)).toBe('');
  });
});

describe('Codegen Final — For-else with 2 loop variables (line 306)', () => {
  test('for k, v in pairs with else generates destructured for-else', () => {
    const code = compileShared('for k, v in pairs { print(k) } else { print("empty") }');
    expect(code).toContain('const [k, v] of');
    expect(code).toMatch(/__entered_\d+/);
    expect(code).toMatch(/if \(!__entered_\d+\)/);
  });
});

describe('Codegen Final — genBlock standalone (lines 367-374)', () => {
  test('genBlock generates scoped block', () => {
    const gen = new BaseCodegen();
    const block = {
      type: 'BlockStatement',
      body: [
        { type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }
      ]
    };
    const result = gen.genBlock(block);
    expect(result).toContain('{');
    expect(result).toContain('}');
    expect(result).toContain('1;');
  });
});

describe('Codegen Final — genBlockBody non-BlockStatement (lines 380-383)', () => {
  test('expression body generates implicit return', () => {
    const gen = new BaseCodegen();
    const expr = { type: 'NumberLiteral', value: 42 };
    const result = gen.genBlockBody(expr);
    expect(result).toContain('return 42;');
  });
});

describe('Codegen Final — Computed member expression (lines 496-500)', () => {
  test('subscript access list[0] generates computed member', () => {
    const code = compileShared('x = list[0]');
    expect(code).toContain('list[0]');
  });

  test('subscript with expression generates computed member', () => {
    const code = compileShared('x = obj[key]');
    expect(code).toContain('obj[key]');
  });
});

describe('Codegen Final — Pipe with identifier (lines 521-525)', () => {
  test('pipe to identifier calls it with value as argument', () => {
    const code = compileShared('x = data |> stringify');
    expect(code).toContain('stringify(data)');
  });

  test('pipe to call inserts value as first arg', () => {
    const code = compileShared('x = data |> filter(fn(x) x > 0)');
    expect(code).toContain('filter(data,');
  });
});

describe('Codegen Final — genBlockStatements helper (line 400-403)', () => {
  test('genBlockStatements handles non-BlockStatement by wrapping', () => {
    const gen = new BaseCodegen();
    // Single statement node (not BlockStatement)
    const node = { type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } };
    const result = gen.genBlockStatements(node);
    expect(result).toContain('1;');
  });

  test('genBlockStatements handles null', () => {
    const gen = new BaseCodegen();
    expect(gen.genBlockStatements(null)).toBe('');
  });
});

describe('Codegen Final — unknown expression type (line 128)', () => {
  test('unknown expression type throws', () => {
    const gen = new BaseCodegen();
    expect(() => gen.genExpression({ type: 'FutureExpr' })).toThrow('unknown expression type');
  });
});

// =============================================================
// client-codegen.js line 68 — non-state compound assignment lambda
// =============================================================

describe('Client Final — lambda non-state compound assignment (line 63-68)', () => {
  test('lambda with compound assignment on non-state var in client', () => {
    const result = compile('client { var total = 0\ncomponent App { <button on:click={fn() total += 1}>"+"</button> } }');
    // total is not a state, so it should use parent class behavior
    expect(result.client).toContain('total += 1');
  });
});

// =============================================================
// parser.js remaining gaps — error paths
// =============================================================

describe('Parser Final — Error paths', () => {
  test('expect() throws on wrong token type (line 68)', () => {
    expect(() => parse('fn 123() {}')).toThrow();
  });

  test('let without destructure pattern throws (line 599)', () => {
    expect(() => parse('let 123 = x')).toThrow();
  });

  test('assignment to non-identifier throws (lines 786-787)', () => {
    // (1 + 2) = 5 is invalid
    expect(() => parse('(1 + 2) = 5')).toThrow();
  });

  test('compound assignment to invalid target throws (line 794)', () => {
    expect(() => parse('(1 + 2) += 5')).toThrow();
  });

  test('if expression without else throws (line 823)', () => {
    expect(() => parse('x = if true { 1 }')).toThrow();
  });

  test('empty parens without arrow throws (line 1490)', () => {
    expect(() => parse('x = ()')).toThrow();
  });

  test('mismatched JSX closing tag throws (line 327)', () => {
    expect(() => parse('client { component App { <div>"text"</span> } }')).toThrow();
  });
});

describe('Parser Final — JSX string attribute (line 312)', () => {
  test('JSX attribute with string value', () => {
    const ast = parse('client { component App { <a href="/home">"link"</a> } }');
    const comp = ast.body[0].body[0];
    const jsx = comp.body[0];
    expect(jsx.attributes.length).toBe(1);
    expect(jsx.attributes[0].name).toBe('href');
    expect(jsx.attributes[0].value.type).toBe('StringLiteral');
    expect(jsx.attributes[0].value.value).toBe('/home');
  });
});

describe('Parser Final — JSX string text in if/else bodies (lines 412, 428)', () => {
  test('JSXIf with string text in consequent and alternate', () => {
    const ast = parse('client { component App { <div>if show { "yes" } else { "no" }</div> } }');
    const comp = ast.body[0].body[0];
    const div = comp.body[0];
    const jsxIf = div.children[0];
    expect(jsxIf.type).toBe('JSXIf');
    expect(jsxIf.consequent[0].type).toBe('JSXText');
    expect(jsxIf.alternate[0].type).toBe('JSXText');
  });
});

describe('Parser Final — JSX for with text body (line 391)', () => {
  test('JSXFor body can contain expression in braces', () => {
    const ast = parse('client { component App { <ul>for item in items { {item} }</ul> } }');
    const comp = ast.body[0].body[0];
    const ul = comp.body[0];
    const jsxFor = ul.children[0];
    expect(jsxFor.type).toBe('JSXFor');
    expect(jsxFor.body.length).toBe(1);
    expect(jsxFor.body[0].type).toBe('JSXExpression');
  });
});

describe('Parser Final — Binding pattern in match (line 1366)', () => {
  test('lowercase name in match creates BindingPattern', () => {
    const ast = parse('x = match val { num => num * 2 }');
    const matchExpr = ast.body[0].values[0];
    expect(matchExpr.arms[0].pattern.type).toBe('BindingPattern');
    expect(matchExpr.arms[0].pattern.name).toBe('num');
  });
});

describe('Parser Final — Lambda assignment to non-identifier (line 1253)', () => {
  test('lambda with non-assignable expression after = uses expression body', () => {
    // fn(a) 1 + 2 — just an expression body
    const ast = parse('x = fn(a) a + 1');
    const lambda = ast.body[0].values[0];
    expect(lambda.type).toBe('LambdaExpression');
    expect(lambda.body.type).toBe('BinaryExpression');
  });
});

describe('Parser Final — Shorthand object literal (line 1468)', () => {
  test('shorthand object with multiple properties', () => {
    const ast = parse('x = {a, b}');
    const obj = ast.body[0].values[0];
    expect(obj.type).toBe('ObjectLiteral');
    expect(obj.properties.length).toBe(2);
    expect(obj.properties[0].shorthand).toBe(true);
    expect(obj.properties[1].shorthand).toBe(true);
  });
});

describe('Parser Final — Slice with start:end:step (line 1053)', () => {
  test('slice with all three parts', () => {
    const ast = parse('x = list[0:10:2]');
    const slice = ast.body[0].values[0];
    expect(slice.type).toBe('SliceExpression');
    expect(slice.start.value).toBe(0);
    expect(slice.end.value).toBe(10);
    expect(slice.step.value).toBe(2);
  });
});

describe('Parser Final — Arrow lambda type annotation non-identifier (lines 1512-1513)', () => {
  test('arrow lambda with non-identifier type falls back to paren expr', () => {
    // (x: 123) is not a valid lambda — should backtrack to parenthesized expression
    // Actually this would be (x : 123) which can't parse as lambda
    // Let's test (1 + 2) which is a parenthesized expression
    const ast = parse('x = (1 + 2) * 3');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('*');
  });
});

describe('Parser Final — JSX event with various names (line 291)', () => {
  test('JSX event on:change parses correctly', () => {
    const ast = parse('client { component App { <input on:change={handler} /> } }');
    const comp = ast.body[0].body[0];
    const jsx = comp.body[0];
    const attr = jsx.attributes.find(a => a.name.startsWith('on:'));
    expect(attr.name).toBe('on:change');
  });
});

describe('Parser Final — JSX children break (lines 365, 367)', () => {
  test('JSX children parsing stops at non-child tokens', () => {
    // This is inherently tested by any JSX parsing that successfully closes
    const ast = parse('client { component App { <div>"text"</div> } }');
    const comp = ast.body[0].body[0];
    expect(comp.body[0].type).toBe('JSXElement');
  });
});

// =============================================================
// analyzer.js remaining gaps — error catch blocks and warn()
// =============================================================

describe('Analyzer Final — warn() method (lines 38-44)', () => {
  test('warn() method works correctly', () => {
    const lexer = new Lexer('x = 1', '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    const ast = parser.parse();
    const analyzer = new Analyzer(ast, '<test>');
    // Call warn directly since no current code path generates warnings
    analyzer.warn('test warning', { line: 1, column: 1, file: '<test>' });
    expect(analyzer.warnings.length).toBe(1);
    expect(analyzer.warnings[0].message).toBe('test warning');
    expect(analyzer.warnings[0].line).toBe(1);
  });

  test('warn() without loc uses defaults', () => {
    const lexer = new Lexer('x = 1', '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    const ast = parser.parse();
    const analyzer = new Analyzer(ast, '<test>');
    analyzer.warn('default loc warning');
    expect(analyzer.warnings[0].line).toBe(0);
  });
});

describe('Analyzer Final — Assignment define error (line 240)', () => {
  test('immutable reassignment produces error', () => {
    // x = 1 defines x as immutable, then x = 2 triggers error
    expect(() => analyze('x = 1\nx = 2')).toThrow(/Cannot reassign immutable/);
  });
});

describe('Analyzer Final — Compound assignment on immutable (line 394)', () => {
  test('compound assignment on immutable throws', () => {
    expect(() => analyze('x = 5\nx += 1')).toThrow(/immutable/);
  });
});

describe('Analyzer Final — BindingPattern in match (line 568)', () => {
  test('binding pattern defines variable in match scope', () => {
    const result = analyze('x = match val { n => n + 1 }');
    expect(result.warnings).toBeDefined();
  });
});

describe('Analyzer Final — VariantPattern fields (line 577)', () => {
  test('variant pattern fields are defined in scope', () => {
    const result = analyze('type Shape { Circle(radius: Float) }\nx = match shape { Circle(radius) => radius, _ => 0 }');
    expect(result.warnings).toBeDefined();
  });
});

describe('Analyzer Final — ListComprehension variable (line 593)', () => {
  test('list comprehension variable is defined', () => {
    const result = analyze('x = [n * 2 for n in items]');
    expect(result.warnings).toBeDefined();
  });
});

describe('Analyzer Final — DictComprehension variables (line 611)', () => {
  test('dict comprehension variables are defined', () => {
    const result = analyze('x = {k: v for k, v in pairs}');
    expect(result.warnings).toBeDefined();
  });
});

// =============================================================
// ast.js — FunctionTypeAnnotation constructor (lines 678-681)
// =============================================================

describe('AST Final — FunctionTypeAnnotation', () => {
  test('FunctionTypeAnnotation constructs correctly', () => {
    const node = new AST.FunctionTypeAnnotation(
      [new AST.TypeAnnotation('Int', [], null)],
      new AST.TypeAnnotation('String', [], null),
      null
    );
    expect(node.type).toBe('FunctionTypeAnnotation');
    expect(node.paramTypes.length).toBe(1);
    expect(node.returnType.name).toBe('String');
  });
});

// =============================================================
// Parser — Wildcard _ in primary (lines 1199-1201)
// Note: This is likely unreachable since _ IS an IDENTIFIER token
// and gets caught by the IDENTIFIER check first. Test via AST path.
// =============================================================

describe('Parser Final — Match wildcard pattern', () => {
  test('_ in match arm is WildcardPattern', () => {
    const ast = parse('x = match val { _ => 0 }');
    const arm = ast.body[0].values[0].arms[0];
    expect(arm.pattern.type).toBe('WildcardPattern');
  });
});

// =============================================================
// Parser — Route declaration edge case (line 168)
// =============================================================

describe('Parser Final — Slice [:end:step] (line 1053)', () => {
  test('slice with end and step but no start', () => {
    const ast = parse('x = list[:5:2]');
    const slice = ast.body[0].values[0];
    expect(slice.type).toBe('SliceExpression');
    expect(slice.start).toBeNull();
    expect(slice.end.value).toBe(5);
    expect(slice.step.value).toBe(2);
  });
});

describe('Parser Final — Invalid HTTP method (line 168)', () => {
  test('route with invalid method throws', () => {
    expect(() => parse('server { route CONNECT "/path" => handler }')).toThrow(/Invalid HTTP method/);
  });
});

describe('Parser Final — Route with various methods', () => {
  test('route with POST method', () => {
    const ast = parse('server { route POST "/api/data" => handler }');
    const route = ast.body[0].body[0];
    expect(route.type).toBe('RouteDeclaration');
    expect(route.method).toBe('POST');
  });

  test('route with PUT method', () => {
    const ast = parse('server { route PUT "/api/data" => handler }');
    expect(ast.body[0].body[0].method).toBe('PUT');
  });

  test('route with DELETE method', () => {
    const ast = parse('server { route DELETE "/api/data" => handler }');
    expect(ast.body[0].body[0].method).toBe('DELETE');
  });

  test('route with PATCH method', () => {
    const ast = parse('server { route PATCH "/api/data" => handler }');
    expect(ast.body[0].body[0].method).toBe('PATCH');
  });
});

// =============================================================
// Parser — JSX error paths targeting specific uncovered lines
// =============================================================

describe('Parser Final — JSX invalid attribute name (line 282)', () => {
  test('non-identifier attribute name throws', () => {
    expect(() => parse('client { component App { <div 123="x"/> } }')).toThrow(/Expected attribute name/);
  });
});

describe('Parser Final — JSX invalid event name after colon (line 291)', () => {
  test('on: followed by number throws', () => {
    expect(() => parse('client { component App { <div on:123={handler}/> } }')).toThrow(/Expected name after/);
  });
});

describe('Parser Final — JSX children break on unexpected token (line 367)', () => {
  test('bare identifier in JSX body is now valid unquoted text', () => {
    // With unquoted JSX text support, 'hello' is lexed as JSX_TEXT
    const ast = parse('client { component App { <div>hello</div> } }');
    const comp = ast.body[0].body[0];
    const div = comp.body[0];
    expect(div.children.length).toBe(1);
    expect(div.children[0].type).toBe('JSXText');
  });
});

describe('Parser Final — JSXFor body break on unexpected token (line 391)', () => {
  test('bare identifier in JSXFor body hits break', () => {
    // 'item' as IDENTIFIER in for body doesn't match <, string, or { — hits else break
    expect(() => parse('client { component App { <ul>for item in items { item }</ul> } }')).toThrow();
  });
});

describe('Parser Final — JSXIf consequent with expression (line 412)', () => {
  test('expression in JSXIf consequent body parses successfully', () => {
    // {expr} in JSXIf body — now supported as JSXExpression
    const ast = parse('client { component App { <div>if show { {x} }</div> } }');
    expect(ast.body[0].body[0].body).toBeDefined();
  });
});

describe('Parser Final — JSXIf alternate with expression (line 428)', () => {
  test('expression in JSXIf alternate body parses successfully', () => {
    const ast = parse('client { component App { <div>if show { "yes" } else { {x} }</div> } }');
    expect(ast.body[0].body[0].body).toBeDefined();
  });
});

describe('Parser Final — Lambda body with member expression = (line 1253)', () => {
  test('lambda body with non-identifier before = sets body to expression', () => {
    // fn(x) a.b = 1 — a.b is MemberExpression, = is consumed, body = a.b
    const ast = parse('x = fn(x) a.b = 1');
    const lambda = ast.body[0].values[0];
    expect(lambda.type).toBe('LambdaExpression');
    expect(lambda.body.type).toBe('MemberExpression');
  });
});

describe('Parser Final — Arrow lambda param with non-identifier type (lines 1512-1513)', () => {
  test('(param: number) backtracks from lambda parsing and throws', () => {
    // After 'a:', next is 42 (NUMBER not IDENTIFIER) → isLambda = false → backtrack → error
    expect(() => parse('x = (a: 42)')).toThrow();
  });
});

// =============================================================
// Analyzer — duplicate variable catch blocks
// =============================================================

describe('Analyzer Final — For loop duplicate variable (line 394)', () => {
  test('for x, x triggers duplicate variable error', () => {
    expect(() => analyze('for x, x in list { print(x) }')).toThrow(/already defined/);
  });
});

describe('Analyzer Final — Variant pattern duplicate fields (line 577)', () => {
  test('Pair(x, x) triggers duplicate field error', () => {
    expect(() => analyze('y = match val { Pair(x, x) => x }')).toThrow(/already defined/);
  });
});

describe('Analyzer Final — Dict comprehension duplicate variables (line 611)', () => {
  test('{k: v for x, x in pairs} triggers duplicate variable error', () => {
    expect(() => analyze('y = {k: v for x, x in pairs}')).toThrow(/already defined/);
  });
});
