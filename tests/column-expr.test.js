import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function parse(source) {
  const lexer = new Lexer(source, 'test.tova');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, 'test.tova');
  return parser.parse();
}

function compile(source) {
  const ast = parse(source);
  const gen = new CodeGenerator(ast, 'test.tova');
  return gen.generate();
}

describe('Column expression parsing', () => {
  test('.column parses as ColumnExpression', () => {
    const ast = parse('server { x = where(.age > 25) }');
    const server = ast.body[0];
    const assign = server.body[0];
    const call = assign.values[0];
    expect(call.type).toBe('CallExpression');
    expect(call.callee.name).toBe('where');

    // The argument should be a BinaryExpression with ColumnExpression
    const arg = call.arguments[0];
    expect(arg.type).toBe('BinaryExpression');
    expect(arg.left.type).toBe('ColumnExpression');
    expect(arg.left.name).toBe('age');
    expect(arg.right.value).toBe(25);
  });

  test('.column = expr parses as ColumnAssignment', () => {
    const ast = parse('server { x = derive(.new_col = .a + .b) }');
    const server = ast.body[0];
    const assign = server.body[0];
    const call = assign.values[0];
    const arg = call.arguments[0];
    expect(arg.type).toBe('ColumnAssignment');
    expect(arg.target).toBe('new_col');
    expect(arg.expression.type).toBe('BinaryExpression');
    expect(arg.expression.left.type).toBe('ColumnExpression');
    expect(arg.expression.left.name).toBe('a');
  });

  test('-.column parses as NegatedColumnExpression', () => {
    const ast = parse('server { x = select(-.password) }');
    const server = ast.body[0];
    const assign = server.body[0];
    const call = assign.values[0];
    const arg = call.arguments[0];
    expect(arg.type).toBe('NegatedColumnExpression');
    expect(arg.name).toBe('password');
  });

  test('multiple column expressions in derive', () => {
    const ast = parse('server { x = derive(.full = .first, .upper = .name) }');
    const server = ast.body[0];
    const assign = server.body[0];
    const call = assign.values[0];
    expect(call.arguments.length).toBe(2);
    expect(call.arguments[0].type).toBe('ColumnAssignment');
    expect(call.arguments[1].type).toBe('ColumnAssignment');
  });
});

describe('Column expression parsing — additional', () => {
  test('column expression in nested binary expression', () => {
    const ast = parse('server { x = where((.age > 25) and (.salary > 50000)) }');
    const call = ast.body[0].body[0].values[0];
    const arg = call.arguments[0];
    expect(arg.type).toBe('LogicalExpression');
  });

  test('column expression in pipe chain', () => {
    const ast = parse('server { x = data |> where(.active) |> select(.name, .email) }');
    const pipe = ast.body[0].body[0].values[0];
    expect(pipe.type).toBe('PipeExpression');
  });

  test('multiple column assignments in derive', () => {
    const ast = parse('server { x = derive(.a = .b + 1, .c = .d * 2) }');
    const call = ast.body[0].body[0].values[0];
    expect(call.arguments.length).toBe(2);
    expect(call.arguments[0].type).toBe('ColumnAssignment');
    expect(call.arguments[0].target).toBe('a');
    expect(call.arguments[1].type).toBe('ColumnAssignment');
    expect(call.arguments[1].target).toBe('c');
  });

  test('negated column in unary context', () => {
    const ast = parse('server { x = select(-.password, -.secret) }');
    const call = ast.body[0].body[0].values[0];
    expect(call.arguments[0].type).toBe('NegatedColumnExpression');
    expect(call.arguments[0].name).toBe('password');
    expect(call.arguments[1].type).toBe('NegatedColumnExpression');
    expect(call.arguments[1].name).toBe('secret');
  });

  test('column expression with pipe expression on right side', () => {
    const ast = parse('server { x = where(.name |> len() > 0) }');
    const call = ast.body[0].body[0].values[0];
    const arg = call.arguments[0];
    // The pipe expression wraps .name |> len() > 0
    expect(arg.type).toBe('PipeExpression');
  });
});

describe('Column expression codegen', () => {
  test('where(.col > N) compiles to lambda', () => {
    const result = compile('server { x = where(.age > 25) }');
    expect(result.server).toContain('where');
    expect(result.server).toContain('__row');
    expect(result.server).toContain('__row.age');
  });

  test('select(.col1, .col2) compiles to strings', () => {
    const result = compile('server { x = select(.name, .age) }');
    expect(result.server).toContain('select');
    expect(result.server).toContain('"name"');
    expect(result.server).toContain('"age"');
  });

  test('derive(.new = .a + .b) compiles to object with lambdas', () => {
    const result = compile('server { x = derive(.new_col = .a + .b) }');
    expect(result.server).toContain('derive');
    expect(result.server).toContain('__row');
    expect(result.server).toContain('__row.a');
    expect(result.server).toContain('__row.b');
  });

  test('-.column compiles to exclude descriptor', () => {
    const result = compile('server { x = select(-.password) }');
    expect(result.server).toContain('__exclude');
    expect(result.server).toContain('"password"');
  });

  test('pipe with column expressions', () => {
    const result = compile('server { x = data |> where(.amount > 100) }');
    expect(result.server).toContain('where(data');
    expect(result.server).toContain('__row');
    expect(result.server).toContain('__row.amount');
  });

  test('group_by with column expression', () => {
    const result = compile('server { x = data |> group_by(.region) }');
    expect(result.server).toContain('group_by(data');
    expect(result.server).toContain('__row');
    expect(result.server).toContain('__row.region');
  });

  test('sort_by with column expression', () => {
    const result = compile('server { x = data |> sort_by(.name) }');
    expect(result.server).toContain('sort_by(data');
    expect(result.server).toContain('__row');
    expect(result.server).toContain('__row.name');
  });

  test('drop_nil with column expression', () => {
    const result = compile('server { x = data |> drop_nil(.email) }');
    expect(result.server).toContain('drop_nil(data');
    expect(result.server).toContain('"email"');
  });

  test('fill_nil with column expression', () => {
    const result = compile('server { x = data |> fill_nil(.city, "Unknown") }');
    expect(result.server).toContain('fill_nil(data');
    expect(result.server).toContain('"city"');
  });

  test('derive with multiple column assignments', () => {
    const result = compile('server { x = derive(.a = .b + 1, .c = .d * 2) }');
    expect(result.server).toContain('__row.b');
    expect(result.server).toContain('__row.d');
    expect(result.server).toContain('"a"');
    expect(result.server).toContain('"c"');
  });

  test('logical expression in column body', () => {
    const result = compile('server { x = where(.a > 1 and .b < 10) }');
    expect(result.server).toContain('__row.a');
    expect(result.server).toContain('__row.b');
    expect(result.server).toContain('&&');
  });

  test('unary expression in column body', () => {
    const result = compile('server { x = where(not .active) }');
    expect(result.server).toContain('__row.active');
  });

  test('complex nested binary expression', () => {
    const result = compile('server { x = derive(.total = (.a + .b) * .c) }');
    expect(result.server).toContain('__row.a');
    expect(result.server).toContain('__row.b');
    expect(result.server).toContain('__row.c');
  });

  test('member expression in column body', () => {
    const result = compile('server { x = where(.data.length > 0) }');
    expect(result.server).toContain('__row.data.length');
  });

  test('column expression with function call in derive', () => {
    const result = compile('server { x = derive(.upper = upper(.name)) }');
    expect(result.server).toContain('upper');
    expect(result.server).toContain('__row.name');
  });

  test('column in pipe body generates correct code', () => {
    const result = compile('server { x = derive(.trimmed = .name |> trim()) }');
    expect(result.server).toContain('trim');
    expect(result.server).toContain('__row.name');
  });

  test('table_where variant compiles same as where', () => {
    const result = compile('server { x = table_where(data, .age > 25) }');
    expect(result.server).toContain('table_where');
    expect(result.server).toContain('__row.age');
  });

  test('table_select variant compiles same as select', () => {
    const result = compile('server { x = table_select(data, .name) }');
    expect(result.server).toContain('table_select');
    expect(result.server).toContain('"name"');
  });
});
