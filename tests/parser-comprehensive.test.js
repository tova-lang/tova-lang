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

function parseThrows(source) {
  return () => parse(source);
}

// ============================================================
// 1. Error paths for server config parsing
// ============================================================

describe('Parser Comprehensive -- Server config error paths', () => {
  test('invalid WebSocket handler name throws', () => {
    expect(parseThrows(`server { ws {
      bogus_handler fn(conn) { print("bad") }
    } }`)).toThrow(/Invalid WebSocket key/);
  });

  test('ws with only invalid key throws', () => {
    expect(parseThrows(`server { ws {
      something fn(conn) { 1 }
    } }`)).toThrow(/Invalid WebSocket key/);
  });

  test('discover with wrong keyword after peer name throws', () => {
    // The parser expects identifier 'at' after the peer name string.
    // If the identifier is not 'at', it throws an error.
    expect(parseThrows(`server { discover "peer" near "http://peer:3000" }`)).toThrow(/at/);
  });

  test('auth config with non-identifier/non-type key throws', () => {
    // The auth parser only accepts IDENTIFIER or TYPE tokens as keys.
    // A NUMBER token in key position should throw.
    expect(parseThrows(`server { auth { 123: "bad" } }`)).toThrow(/auth config key/);
  });

  test('route group with empty body parses successfully', () => {
    const ast = parse(`server { routes "/api" { } }`);
    const rg = ast.body[0].body[0];
    expect(rg.type).toBe('RouteGroupDeclaration');
    expect(rg.prefix).toBe('/api');
    expect(rg.body.length).toBe(0);
  });

  test('model without config has null config', () => {
    const ast = parse('server { model Product }');
    const m = ast.body[0].body[0];
    expect(m.type).toBe('ModelDeclaration');
    expect(m.name).toBe('Product');
    expect(m.config).toBeNull();
  });

  test('route without => throws', () => {
    expect(parseThrows(`server { route GET "/api/test" handler }`)).toThrow(/=>/);
  });

  test('route with invalid HTTP method throws', () => {
    expect(parseThrows(`server { route CONNECT "/ws" => handler }`)).toThrow(/Invalid HTTP method/);
  });

  test('route missing path string throws', () => {
    expect(parseThrows(`server { route GET => handler }`)).toThrow(/route path string/);
  });

  test('cors missing opening brace throws', () => {
    expect(parseThrows(`server { cors origins: ["*"] }`)).toThrow();
  });

  test('health check missing path string throws', () => {
    expect(parseThrows(`server { health 123 }`)).toThrow(/health check path string/);
  });

  test('middleware missing fn keyword throws', () => {
    expect(parseThrows(`server { middleware logger(req) { next(req) } }`)).toThrow();
  });

  test('on_error missing fn keyword throws', () => {
    expect(parseThrows(`server { on_error (err) { respond(500) } }`)).toThrow();
  });

  test('subscribe missing fn keyword throws', () => {
    expect(parseThrows(`server { subscribe "event" (data) { print(data) } }`)).toThrow();
  });

  test('schedule missing fn keyword throws', () => {
    expect(parseThrows(`server { schedule "* * * * *" (t) { print(t) } }`)).toThrow();
  });

  test('background missing fn keyword throws', () => {
    expect(parseThrows(`server { background cleanup() { 1 } }`)).toThrow();
  });

  test('env declaration missing colon after name throws', () => {
    expect(parseThrows(`server { env PORT Int }`)).toThrow();
  });

  test('static declaration missing arrow throws', () => {
    expect(parseThrows(`server { static "/public" "./public" }`)).toThrow(/=>/);
  });
});

// ============================================================
// 2. JSX parsing errors
// ============================================================

describe('Parser Comprehensive -- JSX parsing errors', () => {
  test('mismatched closing tags throws', () => {
    expect(parseThrows('client { component App { <div></span> } }')).toThrow(/Mismatched closing tag/);
  });

  test('mismatched nested closing tags throws', () => {
    expect(parseThrows('client { component App { <div><span></div></span> } }')).toThrow(/Mismatched closing tag/);
  });

  test('JSX attribute with invalid value (number token) throws', () => {
    // After = in attribute, parser expects { expr } or "string"
    expect(parseThrows('client { component App { <div class=123 /> } }')).toThrow(/attribute value/);
  });

  test('JSX attribute missing name throws', () => {
    // If parser sees something that is not a valid attribute name token
    expect(parseThrows('client { component App { <div 123="bad" /> } }')).toThrow(/attribute name/);
  });

  test('JSX for missing in keyword throws', () => {
    expect(parseThrows('client { component App { <div>for item of items { <span /> }</div> } }')).toThrow(/in/);
  });

  test('JSX if missing opening brace for body throws', () => {
    expect(parseThrows('client { component App { <div>if show <span /> </div> } }')).toThrow();
  });

  test('JSX for missing opening brace for body throws', () => {
    expect(parseThrows('client { component App { <div>for item in items <span /> </div> } }')).toThrow();
  });

  test('JSX expression child missing closing brace throws', () => {
    expect(parseThrows('client { component App { <div>{count</div> } }')).toThrow();
  });

  test('JSX attribute expression missing closing brace throws', () => {
    expect(parseThrows('client { component App { <div id={myId >"text"</div> } }')).toThrow();
  });
});

// ============================================================
// 3. Pattern matching edge cases
// ============================================================

describe('Parser Comprehensive -- Pattern matching edge cases', () => {
  test('nested array patterns [[a, b], [c, d]]', () => {
    const expr = parseExpr('match x { [[a, b], [c, d]] => a + c, _ => 0 }');
    const pattern = expr.arms[0].pattern;
    expect(pattern.type).toBe('ArrayPattern');
    expect(pattern.elements.length).toBe(2);
    expect(pattern.elements[0].type).toBe('ArrayPattern');
    expect(pattern.elements[0].elements.length).toBe(2);
    expect(pattern.elements[1].type).toBe('ArrayPattern');
    expect(pattern.elements[1].elements.length).toBe(2);
  });

  test('array pattern with nested wildcard', () => {
    const expr = parseExpr('match x { [_, [a, _]] => a, _ => 0 }');
    const pattern = expr.arms[0].pattern;
    expect(pattern.type).toBe('ArrayPattern');
    expect(pattern.elements[0].type).toBe('WildcardPattern');
    expect(pattern.elements[1].type).toBe('ArrayPattern');
    expect(pattern.elements[1].elements[1].type).toBe('WildcardPattern');
  });

  test('string literal pattern in match', () => {
    const expr = parseExpr('match cmd { "start" => 1, "stop" => 2, _ => 0 }');
    expect(expr.arms[0].pattern.type).toBe('LiteralPattern');
    expect(expr.arms[0].pattern.value).toBe('start');
    expect(expr.arms[1].pattern.type).toBe('LiteralPattern');
    expect(expr.arms[1].pattern.value).toBe('stop');
  });

  test('missing => in match arm throws', () => {
    expect(parseThrows('match x { 1 "one", _ => 0 }')).toThrow(/=>/);
  });

  test('guard with complex logical condition', () => {
    const expr = parseExpr('match x { n if n > 0 and n < 100 => "medium", _ => "other" }');
    expect(expr.arms[0].guard.type).toBe('LogicalExpression');
    expect(expr.arms[0].guard.operator).toBe('and');
    expect(expr.arms[0].guard.left.type).toBe('BinaryExpression');
    expect(expr.arms[0].guard.right.type).toBe('BinaryExpression');
  });

  test('guard with or condition', () => {
    const expr = parseExpr('match x { n if n == 0 or n == 1 => "base", _ => "other" }');
    expect(expr.arms[0].guard.type).toBe('LogicalExpression');
    expect(expr.arms[0].guard.operator).toBe('or');
  });

  test('guard with not condition', () => {
    // Use a call expression to avoid the arrow lambda ambiguity (not x => ...)
    const expr = parseExpr('match x { n if not is_done() => "waiting", _ => "done" }');
    expect(expr.arms[0].guard.type).toBe('UnaryExpression');
    expect(expr.arms[0].guard.operator).toBe('not');
    expect(expr.arms[0].guard.operand.type).toBe('CallExpression');
  });

  test('array pattern with number literal element', () => {
    const expr = parseExpr('match x { [1, 2, rest] => rest, _ => 0 }');
    const pattern = expr.arms[0].pattern;
    expect(pattern.type).toBe('ArrayPattern');
    expect(pattern.elements[0].type).toBe('LiteralPattern');
    expect(pattern.elements[0].value).toBe(1);
    expect(pattern.elements[1].type).toBe('LiteralPattern');
    expect(pattern.elements[1].value).toBe(2);
    expect(pattern.elements[2].type).toBe('BindingPattern');
    expect(pattern.elements[2].name).toBe('rest');
  });

  test('array pattern with boolean elements', () => {
    const expr = parseExpr('match x { [true, false] => 1, _ => 0 }');
    const pattern = expr.arms[0].pattern;
    expect(pattern.elements[0].type).toBe('LiteralPattern');
    expect(pattern.elements[0].value).toBe(true);
    expect(pattern.elements[1].type).toBe('LiteralPattern');
    expect(pattern.elements[1].value).toBe(false);
  });

  test('array pattern with nil element', () => {
    const expr = parseExpr('match x { [nil, a] => a, _ => 0 }');
    const pattern = expr.arms[0].pattern;
    expect(pattern.elements[0].type).toBe('LiteralPattern');
    expect(pattern.elements[0].value).toBeNull();
    expect(pattern.elements[1].type).toBe('BindingPattern');
  });

  test('variant pattern inside array pattern', () => {
    const expr = parseExpr('match x { [Some(a), None] => a, _ => 0 }');
    const pattern = expr.arms[0].pattern;
    expect(pattern.elements[0].type).toBe('VariantPattern');
    expect(pattern.elements[0].name).toBe('Some');
    expect(pattern.elements[0].fields.length).toBe(1);
    expect(pattern.elements[0].fields[0].type).toBe('BindingPattern');
    expect(pattern.elements[0].fields[0].name).toBe('a');
    expect(pattern.elements[1].type).toBe('VariantPattern');
    expect(pattern.elements[1].name).toBe('None');
  });

  test('multiple match arms without commas parse ok', () => {
    // Commas between arms are optional
    const expr = parseExpr('match x { 1 => "one" 2 => "two" _ => "other" }');
    expect(expr.arms.length).toBe(3);
  });

  test('match arm with block body containing multiple statements', () => {
    const expr = parseExpr('match x { 1 => { var y = 2\n y + 1 }, _ => 0 }');
    expect(expr.arms[0].body.type).toBe('BlockStatement');
    expect(expr.arms[0].body.body.length).toBe(2);
  });
});

// ============================================================
// 4. Destructuring errors
// ============================================================

describe('Parser Comprehensive -- Destructuring errors', () => {
  test('let with non-pattern token throws', () => {
    // let expects {, [, or ( after it
    expect(parseThrows('let x = 10')).toThrow(/Expected '\{', '\[', or '\(' after 'let'/);
  });

  test('let destructuring without = throws', () => {
    expect(parseThrows('let { a, b } obj')).toThrow(/Expected '=' in destructuring/);
  });

  test('let array destructuring without = throws', () => {
    expect(parseThrows('let [a, b] obj')).toThrow(/Expected '=' in destructuring/);
  });

  test('object pattern with multiple properties and aliases', () => {
    const ast = parse('let { a: x, b: y, c: z } = obj');
    const props = ast.body[0].pattern.properties;
    expect(props.length).toBe(3);
    expect(props[0].key).toBe('a');
    expect(props[0].value).toBe('x');
    expect(props[1].key).toBe('b');
    expect(props[1].value).toBe('y');
    expect(props[2].key).toBe('c');
    expect(props[2].value).toBe('z');
  });

  test('object pattern with mixed defaults and aliases', () => {
    const ast = parse('let { a = 1, b: y = 2, c } = obj');
    const props = ast.body[0].pattern.properties;
    expect(props[0].key).toBe('a');
    expect(props[0].value).toBe('a');
    expect(props[0].defaultValue.value).toBe(1);
    expect(props[1].key).toBe('b');
    expect(props[1].value).toBe('y');
    expect(props[1].defaultValue.value).toBe(2);
    expect(props[2].key).toBe('c');
    expect(props[2].defaultValue).toBeNull();
  });

  test('array pattern with many elements', () => {
    const ast = parse('let [a, b, c, d, e] = arr');
    expect(ast.body[0].pattern.elements.length).toBe(5);
    expect(ast.body[0].pattern.elements[4]).toBe('e');
  });

  test('array pattern with multiple wildcards', () => {
    const ast = parse('let [_, _, c] = arr');
    expect(ast.body[0].pattern.elements[0]).toBeNull();
    expect(ast.body[0].pattern.elements[1]).toBeNull();
    expect(ast.body[0].pattern.elements[2]).toBe('c');
  });
});

// ============================================================
// 5. Control flow errors
// ============================================================

describe('Parser Comprehensive -- Control flow errors', () => {
  test('for loop missing in keyword throws', () => {
    expect(parseThrows('for x items { print(x) }')).toThrow(/in/);
  });

  test('for loop missing block after condition throws', () => {
    expect(parseThrows('for x in items print(x)')).toThrow(/Expected '\{'/);
  });

  test('if statement missing block after condition throws', () => {
    expect(parseThrows('if true print("yes")')).toThrow(/Expected '\{'/);
  });

  test('try without catch throws', () => {
    expect(parseThrows('try { risky() }')).toThrow(/catch/);
  });

  test('while missing block after condition throws', () => {
    expect(parseThrows('while true print("loop")')).toThrow(/Expected '\{'/);
  });

  test('if expression without else throws', () => {
    expect(parseThrows('x = if true { 1 }')).toThrow(/else/);
  });

  test('function missing opening paren throws', () => {
    expect(parseThrows('fn add a, b { a + b }')).toThrow(/Expected '\(' after function name/);
  });

  test('function missing closing paren throws', () => {
    expect(parseThrows('fn add(a, b { a + b }')).toThrow(/Expected '\)' after parameters/);
  });

  test('function missing block body throws', () => {
    expect(parseThrows('fn add(a, b) a + b')).toThrow(/Expected '\{'/);
  });

  test('var declaration missing = throws', () => {
    expect(parseThrows('var x 42')).toThrow(/Expected '=' in var declaration/);
  });
});

// ============================================================
// 6. Import errors
// ============================================================

describe('Parser Comprehensive -- Import errors', () => {
  test('named import missing from keyword throws', () => {
    expect(parseThrows('import { map } "utils"')).toThrow(/from/);
  });

  test('default import missing from keyword throws', () => {
    expect(parseThrows('import React "react"')).toThrow(/from/);
  });

  test('named import missing closing brace throws', () => {
    expect(parseThrows('import { a, b from "module"')).toThrow();
  });

  test('import missing module path throws', () => {
    expect(parseThrows('import { a } from 42')).toThrow(/module path/);
  });

  test('default import missing module path throws', () => {
    expect(parseThrows('import React from 42')).toThrow(/module path/);
  });

  test('import with single specifier works', () => {
    const ast = parse('import { map } from "utils"');
    expect(ast.body[0].specifiers.length).toBe(1);
    expect(ast.body[0].specifiers[0].imported).toBe('map');
  });

  test('import with alias works', () => {
    const ast = parse('import { Component as Comp } from "react"');
    expect(ast.body[0].specifiers[0].imported).toBe('Component');
    expect(ast.body[0].specifiers[0].local).toBe('Comp');
  });

  test('import with multiple specifiers and aliases', () => {
    const ast = parse('import { a, b as B, c } from "module"');
    expect(ast.body[0].specifiers.length).toBe(3);
    expect(ast.body[0].specifiers[1].imported).toBe('b');
    expect(ast.body[0].specifiers[1].local).toBe('B');
  });
});

// ============================================================
// 7. Type declaration errors
// ============================================================

describe('Parser Comprehensive -- Type declaration errors', () => {
  test('type missing opening brace throws', () => {
    expect(parseThrows('type User name: String')).toThrow(/Expected '\{' to open type body/);
  });

  test('type with generic missing closing > throws', () => {
    expect(parseThrows('type Result<T, E { Ok(value: T) }')).toThrow(/Expected '>' to close type parameters/);
  });

  test('type variant with unclosed fields throws', () => {
    expect(parseThrows('type Shape { Circle(radius: Float }')).toThrow(/Expected '\)' after variant fields/);
  });

  test('type missing closing brace throws', () => {
    expect(parseThrows('type User { name: String, age: Int')).toThrow(/Expected '\}' to close type body/);
  });

  test('type with single generic parameter', () => {
    const ast = parse('type Box<T> { value: T }');
    expect(ast.body[0].typeParams).toEqual(['T']);
    expect(ast.body[0].variants[0].type).toBe('TypeField');
    expect(ast.body[0].variants[0].name).toBe('value');
  });

  test('type with many variants and fields', () => {
    const ast = parse('type Expr { Num(val: Int), Add(left: Expr, right: Expr), Neg(inner: Expr) }');
    expect(ast.body[0].variants.length).toBe(3);
    expect(ast.body[0].variants[0].name).toBe('Num');
    expect(ast.body[0].variants[0].fields.length).toBe(1);
    expect(ast.body[0].variants[1].name).toBe('Add');
    expect(ast.body[0].variants[1].fields.length).toBe(2);
    expect(ast.body[0].variants[2].name).toBe('Neg');
    expect(ast.body[0].variants[2].fields.length).toBe(1);
  });

  test('type annotation with deeply nested generics', () => {
    const ast = parse('fn foo(x: Map<String, List<Option<Int>>>) { x }');
    const param = ast.body[0].params[0];
    expect(param.typeAnnotation.name).toBe('Map');
    expect(param.typeAnnotation.typeParams[0].name).toBe('String');
    expect(param.typeAnnotation.typeParams[1].name).toBe('List');
    expect(param.typeAnnotation.typeParams[1].typeParams[0].name).toBe('Option');
    expect(param.typeAnnotation.typeParams[1].typeParams[0].typeParams[0].name).toBe('Int');
  });

  test('array type annotation for parameter', () => {
    const ast = parse('fn foo(items: [String]) { items }');
    const param = ast.body[0].params[0];
    expect(param.typeAnnotation.type).toBe('ArrayTypeAnnotation');
    expect(param.typeAnnotation.elementType.name).toBe('String');
  });

  test('array type annotation with generic element', () => {
    const ast = parse('fn foo() -> [Option<Int>] { nil }');
    const ret = ast.body[0].returnType;
    expect(ret.type).toBe('ArrayTypeAnnotation');
    expect(ret.elementType.name).toBe('Option');
    expect(ret.elementType.typeParams[0].name).toBe('Int');
  });
});

// ============================================================
// 8. Expression edge cases
// ============================================================

describe('Parser Comprehensive -- Expression edge cases', () => {
  test('propagate on new line should NOT propagate', () => {
    // When ? is on a new line, it should not be treated as postfix propagate
    // The parser sees ? on a new line and breaks out of the postfix loop,
    // then ? becomes an unexpected primary token on the next statement
    expect(parseThrows('x = get_value()\n?')).toThrow(/Unexpected token/);
  });

  test('propagate on same line works', () => {
    const expr = parseExpr('get_value()?');
    expect(expr.type).toBe('PropagateExpression');
    expect(expr.expression.type).toBe('CallExpression');
  });

  test('invalid assignment target throws', () => {
    // Only identifiers are valid assignment targets
    expect(parseThrows('1 + 2 = 3')).toThrow(/Invalid assignment target/);
  });

  test('invalid compound assignment target throws', () => {
    // Only identifiers and member expressions are valid for compound assignment
    expect(parseThrows('1 + 2 += 3')).toThrow(/Invalid compound assignment target/);
  });

  test('if expression with elif requires else', () => {
    expect(parseThrows('x = if a { 1 } elif b { 2 }')).toThrow(/else/);
  });

  test('if expression with multiple elifs and else works', () => {
    const ast = parse('x = if a { 1 } elif b { 2 } elif c { 3 } else { 4 }');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('IfExpression');
    expect(expr.alternates.length).toBe(2);
    expect(expr.elseBody.type).toBe('BlockStatement');
  });

  test('chained comparison with equality operators', () => {
    const expr = parseExpr('a == b == c');
    expect(expr.type).toBe('ChainedComparison');
    expect(expr.operators).toEqual(['==', '==']);
    expect(expr.operands.length).toBe(3);
  });

  test('chained comparison with >=', () => {
    const expr = parseExpr('a >= b >= c');
    expect(expr.type).toBe('ChainedComparison');
    expect(expr.operators).toEqual(['>=', '>=']);
  });

  test('not-equal comparison', () => {
    const expr = parseExpr('a != b');
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('!=');
  });

  test('modulo operator', () => {
    const expr = parseExpr('10 % 3');
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('%');
  });

  test('division operator', () => {
    const expr = parseExpr('10 / 3');
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('/');
  });

  test('complex expression with multiple operator types', () => {
    const expr = parseExpr('a + b * c ** d - e / f');
    // Should be ((a + (b * (c ** d))) - (e / f))
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('-');
  });

  test('bang (!) as not operator', () => {
    const expr = parseExpr('!x');
    expect(expr.type).toBe('UnaryExpression');
    expect(expr.operator).toBe('not');
  });

  test('&& as and operator', () => {
    const expr = parseExpr('a && b');
    expect(expr.type).toBe('LogicalExpression');
    expect(expr.operator).toBe('and');
  });

  test('|| as or operator', () => {
    const expr = parseExpr('a || b');
    expect(expr.type).toBe('LogicalExpression');
    expect(expr.operator).toBe('or');
  });

  test('unexpected token in primary throws', () => {
    expect(parseThrows('= 5')).toThrow(/Unexpected token/);
  });
});

// ============================================================
// 9. Lambda edge cases
// ============================================================

describe('Parser Comprehensive -- Lambda edge cases', () => {
  test('arrow lambda backtracking - paren expr not lambda', () => {
    // (1 + 2) should be a parenthesized expression, not a lambda
    const ast = parse('x = (1 + 2)');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('+');
  });

  test('parenthesized single identifier followed by no arrow is just expr', () => {
    const ast = parse('x = (y)');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('Identifier');
    expect(expr.name).toBe('y');
  });

  test('parenthesized identifier followed by => is lambda', () => {
    const ast = parse('x = (y) => y + 1');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.params.length).toBe(1);
    expect(expr.params[0].name).toBe('y');
  });

  test('empty parens followed by no arrow throws', () => {
    expect(parseThrows('x = ()')).toThrow();
  });

  test('empty parens followed by => is zero-param lambda', () => {
    const ast = parse('x = () => 42');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.params.length).toBe(0);
    expect(expr.body.value).toBe(42);
  });

  test('fn lambda with multiple params and types', () => {
    const expr = parseExpr('fn(a: Int, b: String, c: Bool) a');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.params.length).toBe(3);
    expect(expr.params[0].typeAnnotation.name).toBe('Int');
    expect(expr.params[1].typeAnnotation.name).toBe('String');
    expect(expr.params[2].typeAnnotation.name).toBe('Bool');
  });

  test('fn lambda with block body containing return', () => {
    const expr = parseExpr('fn(x) { return x + 1 }');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.body.type).toBe('BlockStatement');
    expect(expr.body.body[0].type).toBe('ReturnStatement');
  });

  test('nested lambdas', () => {
    const expr = parseExpr('fn(x) fn(y) x + y');
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.body.type).toBe('LambdaExpression');
    expect(expr.body.body.type).toBe('BinaryExpression');
  });

  test('arrow lambda with block body containing if', () => {
    const ast = parse('x = (a) => { if a { 1 } else { 0 } }');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.body.type).toBe('BlockStatement');
    expect(expr.body.body[0].type).toBe('IfStatement');
  });

  test('single param arrow lambda used in call', () => {
    const expr = parseExpr('items.map(x => x * 2)');
    expect(expr.type).toBe('CallExpression');
    expect(expr.arguments[0].type).toBe('LambdaExpression');
    expect(expr.arguments[0].params.length).toBe(1);
  });
});

// ============================================================
// 10. Component and store edge cases
// ============================================================

describe('Parser Comprehensive -- Component and store edge cases', () => {
  test('store with invalid body member throws', () => {
    expect(parseThrows('client { store Counter { var x = 1 } }')).toThrow(/Expected 'state', 'computed', or 'fn' inside store block/);
  });

  test('store with state, computed, and fn', () => {
    const ast = parse(`client { store Counter {
      state count = 0
      computed doubled = count * 2
      fn increment() { count += 1 }
    } }`);
    const store = ast.body[0].body[0];
    expect(store.type).toBe('StoreDeclaration');
    expect(store.body.length).toBe(3);
    expect(store.body[0].type).toBe('StateDeclaration');
    expect(store.body[1].type).toBe('ComputedDeclaration');
    expect(store.body[2].type).toBe('FunctionDeclaration');
  });

  test('component with style block', () => {
    const ast = parse('client { component App { style { .app { color: red } } <div /> } }');
    const comp = ast.body[0].body[0];
    expect(comp.body[0].type).toBe('ComponentStyleBlock');
    expect(comp.body[0].css).toContain('color: red');
    expect(comp.body[1].type).toBe('JSXElement');
  });

  test('state without = throws', () => {
    expect(parseThrows('client { state count 0 }')).toThrow(/Expected '=' in state declaration/);
  });

  test('state with type annotation', () => {
    const ast = parse('client { state count: Int = 0 }');
    const s = ast.body[0].body[0];
    expect(s.type).toBe('StateDeclaration');
    expect(s.name).toBe('count');
    expect(s.typeAnnotation.name).toBe('Int');
    expect(s.initialValue.value).toBe(0);
  });

  test('computed without = throws', () => {
    expect(parseThrows('client { computed doubled count * 2 }')).toThrow(/Expected '=' in computed declaration/);
  });

  test('component with effect inside', () => {
    const ast = parse('client { component App { effect { print("hi") }\n <div /> } }');
    const comp = ast.body[0].body[0];
    expect(comp.body[0].type).toBe('EffectDeclaration');
  });

  test('component with nested component', () => {
    const ast = parse('client { component App { component Inner { <span /> }\n <Inner /> } }');
    const comp = ast.body[0].body[0];
    expect(comp.body[0].type).toBe('ComponentDeclaration');
    expect(comp.body[0].name).toBe('Inner');
  });

  test('component with multiple JSX roots', () => {
    const ast = parse('client { component App { <div>"a"</div>\n<span>"b"</span> } }');
    const comp = ast.body[0].body[0];
    expect(comp.body.length).toBe(2);
    expect(comp.body[0].type).toBe('JSXElement');
    expect(comp.body[0].tag).toBe('div');
    expect(comp.body[1].type).toBe('JSXElement');
    expect(comp.body[1].tag).toBe('span');
  });

  test('store with multiple state declarations', () => {
    const ast = parse('client { store AppStore { state a = 1\n state b = 2\n state c = 3 } }');
    const store = ast.body[0].body[0];
    expect(store.body.length).toBe(3);
    store.body.forEach(s => expect(s.type).toBe('StateDeclaration'));
  });
});

// ============================================================
// 11. Block statement and comprehension errors
// ============================================================

describe('Parser Comprehensive -- Block statements and comprehensions', () => {
  test('dict comprehension with two vars and condition', () => {
    const expr = parseExpr('{k: v * 2 for k, v in entries if v > 0}');
    expect(expr.type).toBe('DictComprehension');
    expect(expr.variables).toEqual(['k', 'v']);
    expect(expr.condition).not.toBeNull();
    expect(expr.condition.type).toBe('BinaryExpression');
  });

  test('dict comprehension with single var', () => {
    const expr = parseExpr('{x: x * x for x in nums}');
    expect(expr.type).toBe('DictComprehension');
    expect(expr.variables).toEqual(['x']);
    expect(expr.condition).toBeNull();
  });

  test('object literal with mixed shorthand and explicit', () => {
    // First property is an identifier (shorthand), but after comma we have key:value
    // The parser treats the first key as shorthand and subsequent as shorthand too
    // when there's no colon after the first property
    const ast = parse('x = {a, b, c}');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('ObjectLiteral');
    expect(expr.properties.length).toBe(3);
    expect(expr.properties[0].shorthand).toBe(true);
    expect(expr.properties[1].shorthand).toBe(true);
  });

  test('object literal with explicit key-value pairs', () => {
    const ast = parse('x = {name: "Alice", age: 30, active: true}');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('ObjectLiteral');
    expect(expr.properties.length).toBe(3);
    expect(expr.properties[0].shorthand).toBe(false);
    expect(expr.properties[0].value.value).toBe('Alice');
    expect(expr.properties[1].value.value).toBe(30);
    expect(expr.properties[2].value.value).toBe(true);
  });

  test('list comprehension with condition', () => {
    const expr = parseExpr('[x * 2 for x in items if x > 0]');
    expect(expr.type).toBe('ListComprehension');
    expect(expr.variable).toBe('x');
    expect(expr.condition).not.toBeNull();
    expect(expr.condition.type).toBe('BinaryExpression');
    expect(expr.condition.operator).toBe('>');
  });

  test('list comprehension without condition', () => {
    const expr = parseExpr('[x + 1 for x in nums]');
    expect(expr.type).toBe('ListComprehension');
    expect(expr.condition).toBeNull();
  });

  test('nested array literals', () => {
    const expr = parseExpr('[[1, 2], [3, 4], [5, 6]]');
    expect(expr.type).toBe('ArrayLiteral');
    expect(expr.elements.length).toBe(3);
    expect(expr.elements[0].type).toBe('ArrayLiteral');
    expect(expr.elements[0].elements.length).toBe(2);
  });

  test('empty array literal', () => {
    const expr = parseExpr('[]');
    expect(expr.type).toBe('ArrayLiteral');
    expect(expr.elements.length).toBe(0);
  });

  test('array with trailing comma', () => {
    const expr = parseExpr('[1, 2, 3,]');
    expect(expr.type).toBe('ArrayLiteral');
    expect(expr.elements.length).toBe(3);
  });

  test('object with trailing comma', () => {
    const ast = parse('x = {a: 1, b: 2,}');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('ObjectLiteral');
    expect(expr.properties.length).toBe(2);
  });
});

// ============================================================
// 12. Slice and subscript edge cases
// ============================================================

describe('Parser Comprehensive -- Slice and subscript edge cases', () => {
  test('basic slice [start:end]', () => {
    const expr = parseExpr('list[1:3]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start.value).toBe(1);
    expect(expr.end.value).toBe(3);
    expect(expr.step).toBeNull();
  });

  test('slice [start:]', () => {
    const expr = parseExpr('list[2:]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start.value).toBe(2);
    expect(expr.end).toBeNull();
    expect(expr.step).toBeNull();
  });

  test('slice [:end]', () => {
    const expr = parseExpr('list[:5]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start).toBeNull();
    expect(expr.end.value).toBe(5);
    expect(expr.step).toBeNull();
  });

  test('slice [::step]', () => {
    const expr = parseExpr('list[::2]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start).toBeNull();
    expect(expr.end).toBeNull();
    expect(expr.step.value).toBe(2);
  });

  test('slice [start:end:step]', () => {
    const expr = parseExpr('list[0:10:2]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start.value).toBe(0);
    expect(expr.end.value).toBe(10);
    expect(expr.step.value).toBe(2);
  });

  test('slice [start::step]', () => {
    const expr = parseExpr('list[1::3]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start.value).toBe(1);
    expect(expr.end).toBeNull();
    expect(expr.step.value).toBe(3);
  });

  test('slice [::-1] (reverse)', () => {
    const expr = parseExpr('list[::-1]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start).toBeNull();
    expect(expr.end).toBeNull();
    expect(expr.step.type).toBe('UnaryExpression');
    expect(expr.step.operator).toBe('-');
  });

  test('slice [:] (full copy)', () => {
    const expr = parseExpr('list[:]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start).toBeNull();
    expect(expr.end).toBeNull();
    expect(expr.step).toBeNull();
  });

  test('slice [:end:step]', () => {
    const expr = parseExpr('list[:5:2]');
    expect(expr.type).toBe('SliceExpression');
    expect(expr.start).toBeNull();
    expect(expr.end.value).toBe(5);
    expect(expr.step.value).toBe(2);
  });

  test('[ on new line not treated as subscript', () => {
    // When [ is on a new line after an expression, it should NOT be subscript
    const ast = parse('x\n[1, 2, 3]');
    // First statement is x (expression), second is [1,2,3] (array literal)
    expect(ast.body.length).toBe(2);
    expect(ast.body[0].type).toBe('ExpressionStatement');
    expect(ast.body[0].expression.type).toBe('Identifier');
    expect(ast.body[1].type).toBe('ExpressionStatement');
    expect(ast.body[1].expression.type).toBe('ArrayLiteral');
  });

  test('[ on same line IS subscript', () => {
    const expr = parseExpr('arr[0]');
    expect(expr.type).toBe('MemberExpression');
    expect(expr.computed).toBe(true);
    expect(expr.property.value).toBe(0);
  });

  test('chained subscript access', () => {
    const expr = parseExpr('matrix[0][1]');
    expect(expr.type).toBe('MemberExpression');
    expect(expr.computed).toBe(true);
    expect(expr.object.type).toBe('MemberExpression');
    expect(expr.object.computed).toBe(true);
  });

  test('subscript with expression index', () => {
    const expr = parseExpr('arr[i + 1]');
    expect(expr.type).toBe('MemberExpression');
    expect(expr.computed).toBe(true);
    expect(expr.property.type).toBe('BinaryExpression');
  });

  test('subscript with string key', () => {
    const expr = parseExpr('obj["key"]');
    expect(expr.type).toBe('MemberExpression');
    expect(expr.computed).toBe(true);
    expect(expr.property.type).toBe('StringLiteral');
  });
});

// ============================================================
// 13. Named arguments mixed with positional
// ============================================================

describe('Parser Comprehensive -- Named arguments mixed with positional', () => {
  test('positional then named arguments', () => {
    const expr = parseExpr('create(1, name: "Alice", age: 30)');
    expect(expr.type).toBe('CallExpression');
    expect(expr.arguments.length).toBe(3);
    expect(expr.arguments[0].type).toBe('NumberLiteral');
    expect(expr.arguments[1].type).toBe('NamedArgument');
    expect(expr.arguments[1].name).toBe('name');
    expect(expr.arguments[2].type).toBe('NamedArgument');
    expect(expr.arguments[2].name).toBe('age');
  });

  test('all positional arguments', () => {
    const expr = parseExpr('add(1, 2, 3)');
    expect(expr.arguments.length).toBe(3);
    expect(expr.arguments.every(a => a.type === 'NumberLiteral')).toBe(true);
  });

  test('all named arguments', () => {
    const expr = parseExpr('config(host: "localhost", port: 8080)');
    expect(expr.arguments.length).toBe(2);
    expect(expr.arguments.every(a => a.type === 'NamedArgument')).toBe(true);
  });

  test('named argument with expression value', () => {
    const expr = parseExpr('foo(value: 1 + 2)');
    expect(expr.arguments[0].type).toBe('NamedArgument');
    expect(expr.arguments[0].value.type).toBe('BinaryExpression');
  });

  test('named argument with lambda value', () => {
    const expr = parseExpr('foo(callback: fn(x) x * 2)');
    expect(expr.arguments[0].type).toBe('NamedArgument');
    expect(expr.arguments[0].value.type).toBe('LambdaExpression');
  });

  test('call with no arguments', () => {
    const expr = parseExpr('foo()');
    expect(expr.type).toBe('CallExpression');
    expect(expr.arguments.length).toBe(0);
  });
});

// ============================================================
// 14. Test block parsing
// ============================================================

describe('Parser Comprehensive -- Test block parsing', () => {
  test('test block with name', () => {
    const ast = parse('test "unit tests" { fn test_add() { 1 + 1 } }');
    expect(ast.body[0].type).toBe('TestBlock');
    expect(ast.body[0].name).toBe('unit tests');
    expect(ast.body[0].body.length).toBe(1);
    expect(ast.body[0].body[0].type).toBe('FunctionDeclaration');
    expect(ast.body[0].body[0].name).toBe('test_add');
  });

  test('test block without name', () => {
    const ast = parse('test { fn test_sub() { 5 - 3 } }');
    expect(ast.body[0].type).toBe('TestBlock');
    expect(ast.body[0].name).toBeNull();
    expect(ast.body[0].body.length).toBe(1);
  });

  test('test block with multiple functions', () => {
    const ast = parse('test "math" { fn test_add() { 1 + 1 }\n fn test_sub() { 5 - 3 } }');
    expect(ast.body[0].body.length).toBe(2);
  });

  test('test block with non-function statements', () => {
    const ast = parse('test { var x = 10\n fn test_x() { x + 1 } }');
    expect(ast.body[0].body.length).toBe(2);
    expect(ast.body[0].body[0].type).toBe('VarDeclaration');
    expect(ast.body[0].body[1].type).toBe('FunctionDeclaration');
  });

  test('test block as top-level alongside other blocks', () => {
    const ast = parse('fn helper() { 1 }\n test "suite" { fn test_it() { helper() } }');
    expect(ast.body.length).toBe(2);
    expect(ast.body[0].type).toBe('FunctionDeclaration');
    expect(ast.body[1].type).toBe('TestBlock');
  });

  test('identifier test not followed by { or string is regular statement', () => {
    // 'test' as a regular identifier (not a test block)
    const ast = parse('test(1, 2)');
    expect(ast.body[0].type).toBe('ExpressionStatement');
    expect(ast.body[0].expression.type).toBe('CallExpression');
  });
});

// ============================================================
// 15. Named server/client/shared blocks
// ============================================================

describe('Parser Comprehensive -- Named blocks', () => {
  test('named server block', () => {
    const ast = parse('server "api" { route GET "/test" => handler }');
    expect(ast.body[0].type).toBe('ServerBlock');
    expect(ast.body[0].name).toBe('api');
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

  test('unnamed server block has null name', () => {
    const ast = parse('server { fn hello() { "hi" } }');
    expect(ast.body[0].name).toBeNull();
  });

  test('unnamed client block has null name', () => {
    const ast = parse('client { state x = 0 }');
    expect(ast.body[0].name).toBeNull();
  });

  test('unnamed shared block has null name', () => {
    const ast = parse('shared { type T { x: Int } }');
    expect(ast.body[0].name).toBeNull();
  });

  test('multiple named blocks coexist', () => {
    const ast = parse(`
      server "api" { route GET "/test" => handler }
      server "ws" { fn ws_handler() { 1 } }
      client "main" { state x = 0 }
      shared "types" { type T { v: Int } }
    `);
    expect(ast.body.length).toBe(4);
    expect(ast.body[0].name).toBe('api');
    expect(ast.body[1].name).toBe('ws');
    expect(ast.body[2].name).toBe('main');
    expect(ast.body[3].name).toBe('types');
  });

  test('server block missing opening brace throws', () => {
    expect(parseThrows('server fn hello() { 1 }')).toThrow(/Expected '\{' after 'server'/);
  });

  test('client block missing opening brace throws', () => {
    expect(parseThrows('client state x = 0')).toThrow(/Expected '\{' after 'client'/);
  });

  test('shared block missing opening brace throws', () => {
    expect(parseThrows('shared type T { x: Int }')).toThrow(/Expected '\{' after 'shared'/);
  });
});

// ============================================================
// Additional coverage: server config keys
// ============================================================

describe('Parser Comprehensive -- Server config declarations', () => {
  test('sse declaration with params', () => {
    const ast = parse('server { sse "/events" fn(send, close) { send("data") } }');
    const sse = ast.body[0].body[0];
    expect(sse.type).toBe('SseDeclaration');
    expect(sse.path).toBe('/events');
    expect(sse.params.length).toBe(2);
    expect(sse.params[0].name).toBe('send');
    expect(sse.params[1].name).toBe('close');
  });

  test('model with config block', () => {
    const ast = parse('server { model User { table: "users" } }');
    const m = ast.body[0].body[0];
    expect(m.type).toBe('ModelDeclaration');
    expect(m.name).toBe('User');
    expect(m.config).not.toBeNull();
    expect(m.config.table.value).toBe('users');
  });

  test('db config with driver', () => {
    const ast = parse('server { db { driver: "postgres", host: "localhost" } }');
    const db = ast.body[0].body[0];
    expect(db.type).toBe('DbDeclaration');
    expect(db.config.driver.value).toBe('postgres');
    expect(db.config.host.value).toBe('localhost');
  });

  test('tls config', () => {
    const ast = parse('server { tls { cert: "cert.pem", key: "key.pem" } }');
    const tls = ast.body[0].body[0];
    expect(tls.type).toBe('TlsDeclaration');
    expect(tls.config.cert.value).toBe('cert.pem');
  });

  test('compression config', () => {
    const ast = parse('server { compression { enabled: true } }');
    const c = ast.body[0].body[0];
    expect(c.type).toBe('CompressionDeclaration');
    expect(c.config.enabled.value).toBe(true);
  });

  test('cache config', () => {
    const ast = parse('server { cache { max_age: 3600 } }');
    const c = ast.body[0].body[0];
    expect(c.type).toBe('CacheDeclaration');
    expect(c.config.max_age.value).toBe(3600);
  });

  test('upload config', () => {
    const ast = parse('server { upload { max_size: 5000000 } }');
    const u = ast.body[0].body[0];
    expect(u.type).toBe('UploadDeclaration');
    expect(u.config.max_size.value).toBe(5000000);
  });

  test('session config', () => {
    const ast = parse('server { session { secret: "s3cr3t" } }');
    const s = ast.body[0].body[0];
    expect(s.type).toBe('SessionDeclaration');
    expect(s.config.secret.value).toBe('s3cr3t');
  });

  test('rate_limit config', () => {
    const ast = parse('server { rate_limit { requests: 100, window: 60 } }');
    const r = ast.body[0].body[0];
    expect(r.type).toBe('RateLimitDeclaration');
    expect(r.config.requests.value).toBe(100);
    expect(r.config.window.value).toBe(60);
  });

  test('lifecycle on_start hook', () => {
    const ast = parse('server { on_start fn() { print("started") } }');
    const h = ast.body[0].body[0];
    expect(h.type).toBe('LifecycleHookDeclaration');
    expect(h.hook).toBe('start');
  });

  test('lifecycle on_stop hook', () => {
    const ast = parse('server { on_stop fn() { print("stopped") } }');
    const h = ast.body[0].body[0];
    expect(h.type).toBe('LifecycleHookDeclaration');
    expect(h.hook).toBe('stop');
  });

  test('schedule with named fn', () => {
    const ast = parse('server { schedule "0 0 * * *" fn daily_cleanup() { clean() } }');
    const s = ast.body[0].body[0];
    expect(s.type).toBe('ScheduleDeclaration');
    expect(s.pattern).toBe('0 0 * * *');
    expect(s.name).toBe('daily_cleanup');
  });

  test('schedule with anonymous fn', () => {
    const ast = parse('server { schedule "*/5 * * * *" fn() { tick() } }');
    const s = ast.body[0].body[0];
    expect(s.name).toBeNull();
  });

  test('env with type only', () => {
    const ast = parse('server { env DATABASE_URL: String }');
    const e = ast.body[0].body[0];
    expect(e.type).toBe('EnvDeclaration');
    expect(e.name).toBe('DATABASE_URL');
    expect(e.typeAnnotation.name).toBe('String');
    expect(e.defaultValue).toBeNull();
  });

  test('env with type and default', () => {
    const ast = parse('server { env PORT: Int = 3000 }');
    const e = ast.body[0].body[0];
    expect(e.defaultValue.value).toBe(3000);
  });

  test('background job with params', () => {
    const ast = parse('server { background fn process_queue(batch_size) { process(batch_size) } }');
    const bg = ast.body[0].body[0];
    expect(bg.type).toBe('BackgroundJobDeclaration');
    expect(bg.name).toBe('process_queue');
    expect(bg.params.length).toBe(1);
  });

  test('static with fallback', () => {
    const ast = parse('server { static "/app" => "./dist" fallback "index.html" }');
    const s = ast.body[0].body[0];
    expect(s.type).toBe('StaticDeclaration');
    expect(s.path).toBe('/app');
    expect(s.dir).toBe('./dist');
    expect(s.fallback).toBe('index.html');
  });

  test('discover with config', () => {
    const ast = parse('server { discover "auth" at "http://auth:4000" with { timeout: 5000, retry: 3 } }');
    const d = ast.body[0].body[0];
    expect(d.type).toBe('DiscoverDeclaration');
    expect(d.peerName).toBe('auth');
    expect(d.config.timeout.value).toBe(5000);
    expect(d.config.retry.value).toBe(3);
  });

  test('auth config with type keyword as key', () => {
    const ast = parse('server { auth { type: "jwt", secret: "key" } }');
    const a = ast.body[0].body[0];
    expect(a.type).toBe('AuthDeclaration');
    expect(a.config.type.value).toBe('jwt');
    expect(a.config.secret.value).toBe('key');
  });

  test('websocket with multiple handlers', () => {
    const ast = parse(`server { ws {
      on_open fn(conn) { print("open") }
      on_message fn(conn, msg) { print(msg) }
      on_close fn(conn) { print("close") }
      on_error fn(conn, err) { print(err) }
    } }`);
    const ws = ast.body[0].body[0];
    expect(ws.handlers.on_open).toBeDefined();
    expect(ws.handlers.on_message).toBeDefined();
    expect(ws.handlers.on_close).toBeDefined();
    expect(ws.handlers.on_error).toBeDefined();
  });

  test('route with decorators', () => {
    const ast = parse('server { route POST "/admin" with auth, rate_limit(100) => admin_action }');
    const route = ast.body[0].body[0];
    expect(route.type).toBe('RouteDeclaration');
    expect(route.decorators.length).toBe(2);
    expect(route.decorators[0].name).toBe('auth');
    expect(route.decorators[0].args.length).toBe(0);
    expect(route.decorators[1].name).toBe('rate_limit');
    expect(route.decorators[1].args.length).toBe(1);
  });
});

// ============================================================
// Additional coverage: spread, range, membership, etc.
// ============================================================

describe('Parser Comprehensive -- Miscellaneous expression coverage', () => {
  test('spread expression in function call', () => {
    const expr = parseExpr('foo(...args)');
    expect(expr.type).toBe('CallExpression');
    expect(expr.arguments[0].type).toBe('SpreadExpression');
    expect(expr.arguments[0].argument.name).toBe('args');
  });

  test('spread expression in array literal', () => {
    const expr = parseExpr('[...a, ...b]');
    expect(expr.type).toBe('ArrayLiteral');
    expect(expr.elements.length).toBe(2);
    expect(expr.elements[0].type).toBe('SpreadExpression');
    expect(expr.elements[1].type).toBe('SpreadExpression');
  });

  test('inclusive range expression ..=', () => {
    const expr = parseExpr('1..=10');
    expect(expr.type).toBe('RangeExpression');
    expect(expr.inclusive).toBe(true);
    expect(expr.start.value).toBe(1);
    expect(expr.end.value).toBe(10);
  });

  test('exclusive range expression ..', () => {
    const expr = parseExpr('0..5');
    expect(expr.type).toBe('RangeExpression');
    expect(expr.inclusive).toBe(false);
  });

  test('membership in', () => {
    const expr = parseExpr('x in items');
    expect(expr.type).toBe('MembershipExpression');
    expect(expr.negated).toBe(false);
  });

  test('membership not in', () => {
    const expr = parseExpr('x not in items');
    expect(expr.type).toBe('MembershipExpression');
    expect(expr.negated).toBe(true);
  });

  test('null coalescing ??', () => {
    const expr = parseExpr('a ?? b');
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('??');
  });

  test('pipe operator chains', () => {
    const expr = parseExpr('data |> parse |> validate |> save');
    // Left-associative: ((data |> parse) |> validate) |> save
    expect(expr.type).toBe('PipeExpression');
    expect(expr.left.type).toBe('PipeExpression');
    expect(expr.left.left.type).toBe('PipeExpression');
  });

  test('compound assignment operators', () => {
    const operators = ['+=', '-=', '*=', '/='];
    for (const op of operators) {
      const ast = parse(`x ${op} 5`);
      expect(ast.body[0].type).toBe('CompoundAssignment');
      expect(ast.body[0].operator).toBe(op);
    }
  });

  test('compound assignment to member expression', () => {
    const ast = parse('obj.count += 1');
    expect(ast.body[0].type).toBe('CompoundAssignment');
    expect(ast.body[0].target.type).toBe('MemberExpression');
    expect(ast.body[0].target.property).toBe('count');
  });

  test('multiple assignment with expressions', () => {
    const ast = parse('a, b = 1 + 2, 3 * 4');
    expect(ast.body[0].type).toBe('Assignment');
    expect(ast.body[0].targets).toEqual(['a', 'b']);
    expect(ast.body[0].values[0].type).toBe('BinaryExpression');
    expect(ast.body[0].values[1].type).toBe('BinaryExpression');
  });

  test('chained method calls', () => {
    const expr = parseExpr('a.b().c().d()');
    expect(expr.type).toBe('CallExpression');
    expect(expr.callee.type).toBe('MemberExpression');
    expect(expr.callee.property).toBe('d');
  });

  test('mixed optional chain and method calls', () => {
    const expr = parseExpr('a?.b.c()');
    expect(expr.type).toBe('CallExpression');
    expect(expr.callee.type).toBe('MemberExpression');
    expect(expr.callee.property).toBe('c');
    expect(expr.callee.object.type).toBe('OptionalChain');
  });
});

// ============================================================
// Additional coverage: JSX for/if with JSX_TEXT in body
// ============================================================

describe('Parser Comprehensive -- JSX control flow with text', () => {
  test('JSX for with JSX_TEXT body', () => {
    const ast = parse('client { component App { <ul>for item in items { <li>Item text</li> }</ul> } }');
    const jsxFor = ast.body[0].body[0].body[0].children[0];
    expect(jsxFor.type).toBe('JSXFor');
    expect(jsxFor.body[0].type).toBe('JSXElement');
    expect(jsxFor.body[0].children[0].type).toBe('JSXText');
    expect(jsxFor.body[0].children[0].value.value).toBe('Item text');
  });

  test('JSX if body with text only', () => {
    const ast = parse('client { component App { <div>if show { "displayed" }</div> } }');
    const jsxIf = ast.body[0].body[0].body[0].children[0];
    expect(jsxIf.type).toBe('JSXIf');
    expect(jsxIf.consequent.length).toBe(1);
    expect(jsxIf.consequent[0].type).toBe('JSXText');
  });

  test('JSX if with expression body', () => {
    const ast = parse('client { component App { <div>if show { {count} }</div> } }');
    const jsxIf = ast.body[0].body[0].body[0].children[0];
    expect(jsxIf.consequent.length).toBe(1);
    expect(jsxIf.consequent[0].type).toBe('JSXExpression');
  });

  test('JSX for with expression body', () => {
    const ast = parse('client { component App { <ul>for item in items { {item} }</ul> } }');
    const jsxFor = ast.body[0].body[0].body[0].children[0];
    expect(jsxFor.body.length).toBe(1);
    expect(jsxFor.body[0].type).toBe('JSXExpression');
  });

  test('JSX if/elif/else with multiple children types', () => {
    const ast = parse('client { component App { <div>if a { <span>"A"</span> } elif b { "B" } else { {c} }</div> } }');
    const jsxIf = ast.body[0].body[0].body[0].children[0];
    expect(jsxIf.type).toBe('JSXIf');
    expect(jsxIf.consequent[0].type).toBe('JSXElement');
    expect(jsxIf.alternates.length).toBe(1);
    expect(jsxIf.alternates[0].body[0].type).toBe('JSXText');
    expect(jsxIf.alternate[0].type).toBe('JSXExpression');
  });
});

// ============================================================
// Additional coverage: Parser helpers
// ============================================================

describe('Parser Comprehensive -- Parser helper coverage', () => {
  test('empty program', () => {
    const ast = parse('');
    expect(ast.type).toBe('Program');
    expect(ast.body.length).toBe(0);
  });

  test('program with only comments (docstrings)', () => {
    const ast = parse('/// just a comment');
    expect(ast.body.length).toBe(0);
  });

  test('program with multiple top-level statements', () => {
    const ast = parse('x = 1\ny = 2\nfn foo() { x + y }');
    expect(ast.body.length).toBe(3);
    expect(ast.body[0].type).toBe('Assignment');
    expect(ast.body[1].type).toBe('Assignment');
    expect(ast.body[2].type).toBe('FunctionDeclaration');
  });

  test('_looksLikeJSX returns false for comparison', () => {
    // In expression context, < should be comparison not JSX
    const expr = parseExpr('a < b');
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('<');
  });

  test('_looksLikeJSX returns true for uppercase component in client', () => {
    const ast = parse('client { component App { <Component /> } }');
    const comp = ast.body[0].body[0];
    expect(comp.body[0].type).toBe('JSXElement');
    expect(comp.body[0].tag).toBe('Component');
  });

  test('_collapseJSXWhitespace trims and collapses whitespace', () => {
    const ast = parse('client { component App { <p>  Hello     World  </p> } }');
    const text = ast.body[0].body[0].body[0].children[0];
    expect(text.value.value).toBe('Hello World');
  });

  test('_collapseJSXWhitespace returns empty for whitespace only', () => {
    const ast = parse('client { component App { <div>   </div> } }');
    const div = ast.body[0].body[0].body[0];
    expect(div.children.length).toBe(0);
  });

  test('peek offset works correctly', () => {
    // Indirect test: arrow lambda parsing uses peek(1) to check for ARROW
    const expr = parseExpr('x => x + 1');
    expect(expr.type).toBe('LambdaExpression');
  });

  test('match precedence with error method', () => {
    // Ensure that match on a token type actually does advance
    const ast = parse('1 + 2');
    expect(ast.body[0].expression.type).toBe('BinaryExpression');
  });
});

// ============================================================
// Additional coverage: server block as statement fallback
// ============================================================

describe('Parser Comprehensive -- Server block statement fallback', () => {
  test('regular statement inside server block', () => {
    const ast = parse('server { var x = 10 }');
    const stmt = ast.body[0].body[0];
    expect(stmt.type).toBe('VarDeclaration');
    expect(stmt.targets).toEqual(['x']);
  });

  test('function declaration inside server block', () => {
    const ast = parse('server { fn handler(req) { req } }');
    const stmt = ast.body[0].body[0];
    expect(stmt.type).toBe('FunctionDeclaration');
    expect(stmt.name).toBe('handler');
  });

  test('if statement inside server block', () => {
    const ast = parse('server { if true { print("yes") } }');
    const stmt = ast.body[0].body[0];
    expect(stmt.type).toBe('IfStatement');
  });

  test('for loop inside server block', () => {
    const ast = parse('server { for x in items { print(x) } }');
    const stmt = ast.body[0].body[0];
    expect(stmt.type).toBe('ForStatement');
  });
});

// ============================================================
// Additional coverage: client block statement fallback
// ============================================================

describe('Parser Comprehensive -- Client block statement fallback', () => {
  test('regular statement inside client block', () => {
    const ast = parse('client { var x = 10 }');
    const stmt = ast.body[0].body[0];
    expect(stmt.type).toBe('VarDeclaration');
  });

  test('function declaration inside client block', () => {
    const ast = parse('client { fn helper() { 1 } }');
    const stmt = ast.body[0].body[0];
    expect(stmt.type).toBe('FunctionDeclaration');
  });

  test('import inside server block', () => {
    const ast = parse('server { import { db } from "database" }');
    const stmt = ast.body[0].body[0];
    expect(stmt.type).toBe('ImportDeclaration');
  });
});

// ============================================================
// Additional coverage: JSX spread attribute
// ============================================================

describe('Parser Comprehensive -- JSX spread attributes', () => {
  test('spread attribute with expression', () => {
    const ast = parse('client { component App { <Comp {...props} /> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.attributes[0].type).toBe('JSXSpreadAttribute');
    expect(el.attributes[0].expression.type).toBe('Identifier');
    expect(el.attributes[0].expression.name).toBe('props');
  });

  test('spread with regular attributes', () => {
    const ast = parse('client { component App { <Comp class="x" {...props} id="y" /> } }');
    const el = ast.body[0].body[0].body[0];
    expect(el.attributes.length).toBe(3);
    expect(el.attributes[0].type).toBe('JSXAttribute');
    expect(el.attributes[0].name).toBe('class');
    expect(el.attributes[1].type).toBe('JSXSpreadAttribute');
    expect(el.attributes[2].type).toBe('JSXAttribute');
    expect(el.attributes[2].name).toBe('id');
  });
});

// ============================================================
// Additional coverage: complex server blocks with nested groups
// ============================================================

describe('Parser Comprehensive -- Complex server configurations', () => {
  test('server block with multiple different declarations', () => {
    const ast = parse(`server {
      cors { origins: ["*"] }
      max_body 1024
      health "/health"
      rate_limit { requests: 100, window: 60 }
      route GET "/api" => handler
    }`);
    const body = ast.body[0].body;
    expect(body.length).toBe(5);
    expect(body[0].type).toBe('CorsDeclaration');
    expect(body[1].type).toBe('MaxBodyDeclaration');
    expect(body[2].type).toBe('HealthCheckDeclaration');
    expect(body[3].type).toBe('RateLimitDeclaration');
    expect(body[4].type).toBe('RouteDeclaration');
  });

  test('route group with nested routes and middleware', () => {
    const ast = parse(`server { routes "/api/v2" {
      middleware fn auth(req, next) { next(req) }
      route GET "/users" => list_users
      route POST "/users" => create_user
    } }`);
    const rg = ast.body[0].body[0];
    expect(rg.type).toBe('RouteGroupDeclaration');
    expect(rg.prefix).toBe('/api/v2');
    expect(rg.body.length).toBe(3);
    expect(rg.body[0].type).toBe('MiddlewareDeclaration');
    expect(rg.body[1].type).toBe('RouteDeclaration');
    expect(rg.body[2].type).toBe('RouteDeclaration');
  });

  test('all HTTP methods are accepted', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    for (const method of methods) {
      const ast = parse(`server { route ${method} "/test" => handler }`);
      expect(ast.body[0].body[0].method).toBe(method);
    }
  });
});

// ============================================================
// Additional coverage: try/catch edge cases
// ============================================================

describe('Parser Comprehensive -- Try/catch edge cases', () => {
  test('try-catch with catch param', () => {
    const ast = parse('try { risky() } catch err { print(err) }');
    expect(ast.body[0].type).toBe('TryCatchStatement');
    expect(ast.body[0].catchParam).toBe('err');
    expect(ast.body[0].tryBody.length).toBe(1);
    expect(ast.body[0].catchBody.length).toBe(1);
  });

  test('try-catch without catch param', () => {
    const ast = parse('try { risky() } catch { fallback() }');
    expect(ast.body[0].catchParam).toBeNull();
  });

  test('try with multiple statements in body', () => {
    const ast = parse('try { var x = 1\n risky(x)\n print(x) } catch e { handle(e) }');
    expect(ast.body[0].tryBody.length).toBe(3);
  });

  test('catch with multiple statements in body', () => {
    const ast = parse('try { risky() } catch e { log(e)\n notify(e)\n fallback() }');
    expect(ast.body[0].catchBody.length).toBe(3);
  });
});

// ============================================================
// Additional coverage: while edge cases
// ============================================================

describe('Parser Comprehensive -- While edge cases', () => {
  test('while with compound body', () => {
    const ast = parse('while x > 0 { x -= 1\n print(x) }');
    expect(ast.body[0].type).toBe('WhileStatement');
    expect(ast.body[0].body.body.length).toBe(2);
  });

  test('while with complex condition', () => {
    const ast = parse('while a > 0 and b < 100 or c == 0 { a -= 1 }');
    expect(ast.body[0].condition.type).toBe('LogicalExpression');
  });
});

// ============================================================
// Additional coverage: return statement edge cases
// ============================================================

describe('Parser Comprehensive -- Return statement edge cases', () => {
  test('return without value at end of block', () => {
    const ast = parse('fn foo() { return }');
    const ret = ast.body[0].body.body[0];
    expect(ret.type).toBe('ReturnStatement');
    expect(ret.value).toBeNull();
  });

  test('return with complex expression', () => {
    const ast = parse('fn foo() { return a + b * c }');
    const ret = ast.body[0].body.body[0];
    expect(ret.value.type).toBe('BinaryExpression');
  });

  test('return with match expression', () => {
    const ast = parse('fn foo(x) { return match x { 1 => "one", _ => "other" } }');
    const ret = ast.body[0].body.body[0];
    expect(ret.value.type).toBe('MatchExpression');
  });
});

// ============================================================
// Additional coverage: string template edge cases
// ============================================================

describe('Parser Comprehensive -- String template edge cases', () => {
  test('template with member expression interpolation', () => {
    const expr = parseExpr('"Hello {user.name}"');
    expect(expr.type).toBe('TemplateLiteral');
    const exprPart = expr.parts.find(p => p.type === 'expr');
    expect(exprPart.value.type).toBe('MemberExpression');
  });

  test('template with call expression interpolation', () => {
    const expr = parseExpr('"Result: {compute()}"');
    expect(expr.type).toBe('TemplateLiteral');
    const exprPart = expr.parts.find(p => p.type === 'expr');
    expect(exprPart.value.type).toBe('CallExpression');
  });

  test('template with just text (no interpolation) is plain string', () => {
    const expr = parseExpr('"hello world"');
    expect(expr.type).toBe('StringLiteral');
    expect(expr.value).toBe('hello world');
  });
});
