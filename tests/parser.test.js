import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function parseExpr(source) {
  const ast = parse(source);
  return ast.body[0]?.expression || ast.body[0];
}

describe('Parser — Assignments', () => {
  test('immutable assignment', () => {
    const ast = parse('x = 42');
    expect(ast.body[0].type).toBe('Assignment');
    expect(ast.body[0].targets).toEqual(['x']);
    expect(ast.body[0].values[0].value).toBe(42);
  });

  test('var (mutable) declaration', () => {
    const ast = parse('var count = 0');
    expect(ast.body[0].type).toBe('VarDeclaration');
    expect(ast.body[0].targets).toEqual(['count']);
  });

  test('multiple assignment', () => {
    const ast = parse('a, b = 1, 2');
    expect(ast.body[0].type).toBe('Assignment');
    expect(ast.body[0].targets).toEqual(['a', 'b']);
    expect(ast.body[0].values.length).toBe(2);
  });

  test('let destructuring (object)', () => {
    const ast = parse('let { name, age } = user');
    expect(ast.body[0].type).toBe('LetDestructure');
    expect(ast.body[0].pattern.type).toBe('ObjectPattern');
    expect(ast.body[0].pattern.properties.length).toBe(2);
  });

  test('let destructuring (array)', () => {
    const ast = parse('let [a, b] = pair');
    expect(ast.body[0].type).toBe('LetDestructure');
    expect(ast.body[0].pattern.type).toBe('ArrayPattern');
  });

  test('compound assignment', () => {
    const ast = parse('x += 1');
    expect(ast.body[0].type).toBe('CompoundAssignment');
    expect(ast.body[0].operator).toBe('+=');
  });
});

describe('Parser — Functions', () => {
  test('simple function', () => {
    const ast = parse('fn add(a, b) { a + b }');
    const fn = ast.body[0];
    expect(fn.type).toBe('FunctionDeclaration');
    expect(fn.name).toBe('add');
    expect(fn.params.length).toBe(2);
  });

  test('typed function', () => {
    const ast = parse('fn add(a: Int, b: Int) -> Int { a + b }');
    const fn = ast.body[0];
    expect(fn.params[0].typeAnnotation.name).toBe('Int');
    expect(fn.returnType.name).toBe('Int');
  });

  test('function with default params', () => {
    const ast = parse('fn greet(name = "world") { name }');
    const fn = ast.body[0];
    expect(fn.params[0].defaultValue.type).toBe('StringLiteral');
    expect(fn.params[0].defaultValue.value).toBe('world');
  });
});

describe('Parser — Expressions', () => {
  test('binary arithmetic', () => {
    const expr = parseExpr('1 + 2 * 3');
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('+');
    expect(expr.right.operator).toBe('*');
  });

  test('power (right-associative)', () => {
    const expr = parseExpr('2 ** 3 ** 2');
    expect(expr.operator).toBe('**');
    expect(expr.right.operator).toBe('**');
  });

  test('unary minus', () => {
    const expr = parseExpr('-x');
    expect(expr.type).toBe('UnaryExpression');
    expect(expr.operator).toBe('-');
  });

  test('pipe operator', () => {
    const expr = parseExpr('x |> f');
    expect(expr.type).toBe('PipeExpression');
  });

  test('logical and/or/not', () => {
    const expr = parseExpr('a and b or not c');
    expect(expr.type).toBe('LogicalExpression');
    expect(expr.operator).toBe('or');
  });

  test('member access', () => {
    const expr = parseExpr('user.name');
    expect(expr.type).toBe('MemberExpression');
    expect(expr.property).toBe('name');
  });

  test('optional chaining', () => {
    const expr = parseExpr('user?.name');
    expect(expr.type).toBe('OptionalChain');
  });

  test('subscript access', () => {
    const expr = parseExpr('list[0]');
    expect(expr.type).toBe('MemberExpression');
    expect(expr.computed).toBe(true);
  });

  test('function call', () => {
    const expr = parseExpr('add(1, 2)');
    expect(expr.type).toBe('CallExpression');
    expect(expr.arguments.length).toBe(2);
  });

  test('named arguments', () => {
    const expr = parseExpr('greet(name: "Alice")');
    expect(expr.type).toBe('CallExpression');
    expect(expr.arguments[0].type).toBe('NamedArgument');
    expect(expr.arguments[0].name).toBe('name');
  });

  test('chained comparison', () => {
    const expr = parseExpr('1 < x < 10');
    expect(expr.type).toBe('ChainedComparison');
    expect(expr.operands.length).toBe(3);
    expect(expr.operators).toEqual(['<', '<']);
  });

  test('membership: in', () => {
    const expr = parseExpr('x in list');
    expect(expr.type).toBe('MembershipExpression');
    expect(expr.negated).toBe(false);
  });

  test('membership: not in', () => {
    const expr = parseExpr('x not in list');
    expect(expr.type).toBe('MembershipExpression');
    expect(expr.negated).toBe(true);
  });

  test('range expression', () => {
    const expr = parseExpr('1..10');
    expect(expr.type).toBe('RangeExpression');
    expect(expr.inclusive).toBe(false);
  });

  test('inclusive range', () => {
    const expr = parseExpr('1..=10');
    expect(expr.type).toBe('RangeExpression');
    expect(expr.inclusive).toBe(true);
  });

  test('string interpolation', () => {
    const expr = parseExpr('"Hello, {name}!"');
    expect(expr.type).toBe('TemplateLiteral');
    expect(expr.parts.length).toBe(3);
  });

  test('array literal', () => {
    const expr = parseExpr('[1, 2, 3]');
    expect(expr.type).toBe('ArrayLiteral');
    expect(expr.elements.length).toBe(3);
  });

  test('list comprehension', () => {
    const expr = parseExpr('[x * 2 for x in items if x > 0]');
    expect(expr.type).toBe('ListComprehension');
    expect(expr.variable).toBe('x');
    expect(expr.condition).not.toBeNull();
  });

  test('spread operator', () => {
    const expr = parseExpr('[...items, 4]');
    expect(expr.type).toBe('ArrayLiteral');
    expect(expr.elements[0].type).toBe('SpreadExpression');
  });
});

describe('Parser — Lambdas', () => {
  test('fn lambda', () => {
    const expr = parseExpr('fn(x) x * 2');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.params.length).toBe(1);
  });

  test('arrow lambda single param', () => {
    const expr = parseExpr('x => x * 2');
    expect(expr.type).toBe('LambdaExpression');
  });

  test('arrow lambda multi params', () => {
    const expr = parseExpr('(a, b) => a + b');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.params.length).toBe(2);
  });
});

describe('Parser — Control flow', () => {
  test('if statement', () => {
    const ast = parse('if x > 0 { print("pos") }');
    expect(ast.body[0].type).toBe('IfStatement');
  });

  test('if/elif/else', () => {
    const ast = parse('if x > 0 { 1 } elif x == 0 { 0 } else { -1 }');
    const stmt = ast.body[0];
    expect(stmt.type).toBe('IfStatement');
    expect(stmt.alternates.length).toBe(1);
    expect(stmt.elseBody).not.toBeNull();
  });

  test('for statement', () => {
    const ast = parse('for x in items { print(x) }');
    expect(ast.body[0].type).toBe('ForStatement');
    expect(ast.body[0].variable).toBe('x');
  });

  test('for with two variables', () => {
    const ast = parse('for k, v in pairs { print(k) }');
    expect(ast.body[0].variable).toEqual(['k', 'v']);
  });

  test('for-else', () => {
    const ast = parse('for x in items { print(x) } else { print("empty") }');
    expect(ast.body[0].elseBody).not.toBeNull();
  });

  test('while statement', () => {
    const ast = parse('while x > 0 { x -= 1 }');
    expect(ast.body[0].type).toBe('WhileStatement');
  });

  test('return statement', () => {
    const ast = parse('fn foo() { return 42 }');
    const ret = ast.body[0].body.body[0];
    expect(ret.type).toBe('ReturnStatement');
    expect(ret.value.value).toBe(42);
  });
});

describe('Parser — Match', () => {
  test('basic match', () => {
    const expr = parseExpr('match x { 0 => "zero", _ => "other" }');
    expect(expr.type).toBe('MatchExpression');
    expect(expr.arms.length).toBe(2);
  });

  test('match with guard', () => {
    const expr = parseExpr('match x { n if n > 10 => "big", _ => "small" }');
    expect(expr.arms[0].guard).not.toBeNull();
  });

  test('match with range pattern', () => {
    const expr = parseExpr('match x { 1..10 => "range", _ => "other" }');
    expect(expr.arms[0].pattern.type).toBe('RangePattern');
  });

  test('match with variant pattern', () => {
    const expr = parseExpr('match shape { Circle(r) => r, Rect(w, h) => w }');
    expect(expr.arms[0].pattern.type).toBe('VariantPattern');
    expect(expr.arms[0].pattern.name).toBe('Circle');
    expect(expr.arms[0].pattern.fields).toEqual(['r']);
  });
});

describe('Parser — Types', () => {
  test('simple type (struct-like)', () => {
    const ast = parse('type User { name: String, age: Int }');
    const td = ast.body[0];
    expect(td.type).toBe('TypeDeclaration');
    expect(td.name).toBe('User');
    expect(td.variants.length).toBe(2);
    expect(td.variants[0].type).toBe('TypeField');
  });

  test('algebraic type (enum)', () => {
    const ast = parse('type Shape { Circle(radius: Float), Rect(w: Float, h: Float) }');
    const td = ast.body[0];
    expect(td.variants[0].type).toBe('TypeVariant');
    expect(td.variants[0].name).toBe('Circle');
  });

  test('generic type', () => {
    const ast = parse('type Result<T, E> { Ok(value: T), Err(error: E) }');
    const td = ast.body[0];
    expect(td.typeParams).toEqual(['T', 'E']);
  });

  test('array type annotation', () => {
    const ast = parse('fn get() -> [User] { nil }');
    expect(ast.body[0].returnType.type).toBe('ArrayTypeAnnotation');
  });
});

describe('Parser — Imports', () => {
  test('named imports', () => {
    const ast = parse('import { map, filter } from "utils"');
    expect(ast.body[0].type).toBe('ImportDeclaration');
    expect(ast.body[0].specifiers.length).toBe(2);
    expect(ast.body[0].source).toBe('utils');
  });

  test('default import', () => {
    const ast = parse('import React from "react"');
    expect(ast.body[0].type).toBe('ImportDefault');
    expect(ast.body[0].local).toBe('React');
  });

  test('import with alias', () => {
    const ast = parse('import { Component as Comp } from "react"');
    expect(ast.body[0].specifiers[0].local).toBe('Comp');
  });
});

describe('Parser — Full-stack blocks', () => {
  test('server block', () => {
    const ast = parse('server { fn hello() { "hi" } }');
    expect(ast.body[0].type).toBe('ServerBlock');
    expect(ast.body[0].body.length).toBe(1);
  });

  test('client block', () => {
    const ast = parse('client { state count = 0 }');
    expect(ast.body[0].type).toBe('ClientBlock');
    expect(ast.body[0].body[0].type).toBe('StateDeclaration');
  });

  test('shared block', () => {
    const ast = parse('shared { type User { name: String } }');
    expect(ast.body[0].type).toBe('SharedBlock');
  });

  test('route declaration', () => {
    const ast = parse('server { route GET "/api/users" => get_users }');
    const route = ast.body[0].body[0];
    expect(route.type).toBe('RouteDeclaration');
    expect(route.method).toBe('GET');
    expect(route.path).toBe('/api/users');
  });

  test('state declaration', () => {
    const ast = parse('client { state count: Int = 0 }');
    const state = ast.body[0].body[0];
    expect(state.type).toBe('StateDeclaration');
    expect(state.typeAnnotation.name).toBe('Int');
  });

  test('computed declaration', () => {
    const ast = parse('client { computed doubled = count * 2 }');
    const comp = ast.body[0].body[0];
    expect(comp.type).toBe('ComputedDeclaration');
  });

  test('effect declaration', () => {
    const ast = parse('client { effect { print("hello") } }');
    const eff = ast.body[0].body[0];
    expect(eff.type).toBe('EffectDeclaration');
  });

  test('component declaration', () => {
    const ast = parse('client { component App { <div>"Hello"</div> } }');
    const comp = ast.body[0].body[0];
    expect(comp.type).toBe('ComponentDeclaration');
    expect(comp.name).toBe('App');
  });

  test('component with props', () => {
    const ast = parse('client { component Card(title, body) { <div>"test"</div> } }');
    const comp = ast.body[0].body[0];
    expect(comp.params.length).toBe(2);
  });
});

describe('Parser — Named Multi-Blocks', () => {
  test('named server block', () => {
    const ast = parse('server "api" { fn hello() { "hi" } }');
    expect(ast.body[0].type).toBe('ServerBlock');
    expect(ast.body[0].name).toBe('api');
    expect(ast.body[0].body.length).toBe(1);
  });

  test('named client block', () => {
    const ast = parse('client "dashboard" { state count = 0 }');
    expect(ast.body[0].type).toBe('ClientBlock');
    expect(ast.body[0].name).toBe('dashboard');
  });

  test('named shared block', () => {
    const ast = parse('shared "models" { type User { name: String } }');
    expect(ast.body[0].type).toBe('SharedBlock');
    expect(ast.body[0].name).toBe('models');
  });

  test('unnamed block has null name', () => {
    const ast = parse('server { fn hello() { "hi" } }');
    expect(ast.body[0].name).toBeNull();
  });

  test('multiple named server blocks', () => {
    const ast = parse('server "api" { fn a() { 1 } } server "ws" { fn b() { 2 } }');
    expect(ast.body.length).toBe(2);
    expect(ast.body[0].name).toBe('api');
    expect(ast.body[1].name).toBe('ws');
  });
});

describe('Parser — Null Coalescing', () => {
  test('?? produces BinaryExpression', () => {
    const expr = parseExpr('a ?? b');
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('??');
  });

  test('?? chains left-to-right', () => {
    const expr = parseExpr('a ?? b ?? c');
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('??');
    // Left side should be (a ?? b)
    expect(expr.left.type).toBe('BinaryExpression');
    expect(expr.left.operator).toBe('??');
  });

  test('?? has lower precedence than or', () => {
    const expr = parseExpr('a or b ?? c');
    // Should parse as (a or b) ?? c
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('??');
    expect(expr.left.type).toBe('LogicalExpression');
    expect(expr.left.operator).toBe('or');
  });
});

describe('Parser — If Expression', () => {
  test('if-else expression in assignment', () => {
    const ast = parse('x = if true { 1 } else { 0 }');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('IfExpression');
    expect(expr.condition.value).toBe(true);
    expect(expr.consequent.type).toBe('BlockStatement');
    expect(expr.elseBody.type).toBe('BlockStatement');
  });

  test('if-elif-else expression in assignment', () => {
    const ast = parse('x = if a { 1 } elif b { 2 } else { 3 }');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('IfExpression');
    expect(expr.alternates.length).toBe(1);
    expect(expr.elseBody).not.toBeNull();
  });

  test('if expression preserves assignment type', () => {
    const ast = parse('x = if cond { 1 } else { 0 }');
    expect(ast.body[0].type).toBe('Assignment');
    expect(ast.body[0].values[0].type).toBe('IfExpression');
  });
});

describe('Parser — Slice syntax', () => {
  test('basic slice', () => {
    const expr = parseExpr('list[1:3]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start.value).toBe(1);
    expect(expr.end.value).toBe(3);
  });

  test('slice with step', () => {
    const expr = parseExpr('list[0:10:2]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.step.value).toBe(2);
  });

  test('slice from start', () => {
    const expr = parseExpr('list[:3]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start).toBeNull();
  });

  test('slice with double colon (reverse)', () => {
    const expr = parseExpr('list[::-1]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start).toBeNull();
    expect(expr.end).toBeNull();
    expect(expr.step.type).toBe('UnaryExpression'); // -1 parsed as unary minus
  });

  test('slice with double colon (positive step)', () => {
    const expr = parseExpr('list[::2]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start).toBeNull();
    expect(expr.end).toBeNull();
    expect(expr.step.value).toBe(2);
  });

  test('slice with start and double colon', () => {
    const expr = parseExpr('list[1::2]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start.value).toBe(1);
    expect(expr.end).toBeNull();
    expect(expr.step.value).toBe(2);
  });
});
