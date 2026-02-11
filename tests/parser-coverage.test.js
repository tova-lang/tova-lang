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

function parseComponent(source) {
  const ast = parse(`client { component App { ${source} } }`);
  const comp = ast.body[0].body[0];
  return comp;
}

function parseComponentBody(source) {
  const comp = parseComponent(source);
  return comp.body;
}

// ============================================================
// 1. JSX parsing in components
// ============================================================

describe('Parser Coverage -- JSX parsing in components', () => {
  test('component with basic JSX element', () => {
    const ast = parse('client { component App { <div>"Hello"</div> } }');
    const comp = ast.body[0].body[0];
    expect(comp.type).toBe('ComponentDeclaration');
    expect(comp.name).toBe('App');
    const jsxEl = comp.body[0];
    expect(jsxEl.type).toBe('JSXElement');
    expect(jsxEl.tag).toBe('div');
    expect(jsxEl.selfClosing).toBe(false);
    expect(jsxEl.children.length).toBe(1);
    expect(jsxEl.children[0].type).toBe('JSXText');
  });

  test('self-closing JSX tag', () => {
    const body = parseComponentBody('<input />');
    const jsxEl = body[0];
    expect(jsxEl.type).toBe('JSXElement');
    expect(jsxEl.tag).toBe('input');
    expect(jsxEl.selfClosing).toBe(true);
    expect(jsxEl.children.length).toBe(0);
  });

  test('JSX with class attribute (string value)', () => {
    const body = parseComponentBody('<div class="main">"text"</div>');
    const jsxEl = body[0];
    expect(jsxEl.attributes.length).toBe(1);
    expect(jsxEl.attributes[0].type).toBe('JSXAttribute');
    expect(jsxEl.attributes[0].name).toBe('class');
    expect(jsxEl.attributes[0].value.type).toBe('StringLiteral');
    expect(jsxEl.attributes[0].value.value).toBe('main');
  });

  test('JSX with event handler (expression value)', () => {
    const body = parseComponentBody('<button on:click={handler}>"Go"</button>');
    const jsxEl = body[0];
    expect(jsxEl.attributes.length).toBe(1);
    const attr = jsxEl.attributes[0];
    expect(attr.name).toBe('on:click');
    expect(attr.value.type).toBe('Identifier');
    expect(attr.value.name).toBe('handler');
  });

  test('boolean attribute (no value)', () => {
    const body = parseComponentBody('<input disabled />');
    const jsxEl = body[0];
    expect(jsxEl.attributes.length).toBe(1);
    const attr = jsxEl.attributes[0];
    expect(attr.name).toBe('disabled');
    expect(attr.value.type).toBe('BooleanLiteral');
    expect(attr.value.value).toBe(true);
  });

  test('nested JSX elements', () => {
    const body = parseComponentBody('<div><span>"inner"</span></div>');
    const jsxEl = body[0];
    expect(jsxEl.type).toBe('JSXElement');
    expect(jsxEl.tag).toBe('div');
    expect(jsxEl.children.length).toBe(1);
    const child = jsxEl.children[0];
    expect(child.type).toBe('JSXElement');
    expect(child.tag).toBe('span');
    expect(child.children.length).toBe(1);
    expect(child.children[0].type).toBe('JSXText');
  });

  test('JSX expression child', () => {
    const body = parseComponentBody('<div>{count}</div>');
    const jsxEl = body[0];
    expect(jsxEl.children.length).toBe(1);
    const child = jsxEl.children[0];
    expect(child.type).toBe('JSXExpression');
    expect(child.expression.type).toBe('Identifier');
    expect(child.expression.name).toBe('count');
  });

  test('JSX text with string', () => {
    const body = parseComponentBody('<p>"Hello"</p>');
    const jsxEl = body[0];
    expect(jsxEl.children.length).toBe(1);
    expect(jsxEl.children[0].type).toBe('JSXText');
    expect(jsxEl.children[0].value.type).toBe('StringLiteral');
    expect(jsxEl.children[0].value.value).toBe('Hello');
  });

  test('component with non-JSX statement before JSX', () => {
    const ast = parse('client { component App { fn helper() { 1 }\n<div>"Hello"</div> } }');
    const comp = ast.body[0].body[0];
    expect(comp.body.length).toBe(2);
    expect(comp.body[0].type).toBe('FunctionDeclaration');
    expect(comp.body[1].type).toBe('JSXElement');
  });

  test('JSX with multiple attributes including expression and string', () => {
    const body = parseComponentBody('<div class="box" id={myId}>"content"</div>');
    const jsxEl = body[0];
    expect(jsxEl.attributes.length).toBe(2);
    expect(jsxEl.attributes[0].name).toBe('class');
    expect(jsxEl.attributes[0].value.type).toBe('StringLiteral');
    expect(jsxEl.attributes[1].name).toBe('id');
    expect(jsxEl.attributes[1].value.type).toBe('Identifier');
  });
});

// ============================================================
// 2. JSX for loop
// ============================================================

describe('Parser Coverage -- JSX for loop', () => {
  test('for loop in JSX renders list items', () => {
    const body = parseComponentBody('<ul>for item in items { <li>"text"</li> }</ul>');
    const jsxEl = body[0];
    expect(jsxEl.tag).toBe('ul');
    expect(jsxEl.children.length).toBe(1);
    const forNode = jsxEl.children[0];
    expect(forNode.type).toBe('JSXFor');
    expect(forNode.variable).toBe('item');
    expect(forNode.iterable.type).toBe('Identifier');
    expect(forNode.iterable.name).toBe('items');
    expect(forNode.body.length).toBe(1);
    expect(forNode.body[0].type).toBe('JSXElement');
    expect(forNode.body[0].tag).toBe('li');
  });

  test('JSX for loop with string body', () => {
    const body = parseComponentBody('<ul>for item in items { "text" }</ul>');
    const forNode = body[0].children[0];
    expect(forNode.type).toBe('JSXFor');
    expect(forNode.body.length).toBe(1);
    expect(forNode.body[0].type).toBe('JSXText');
  });

  test('JSX for loop with expression body', () => {
    const body = parseComponentBody('<ul>for item in items { {item} }</ul>');
    const forNode = body[0].children[0];
    expect(forNode.type).toBe('JSXFor');
    expect(forNode.body.length).toBe(1);
    expect(forNode.body[0].type).toBe('JSXExpression');
    expect(forNode.body[0].expression.type).toBe('Identifier');
    expect(forNode.body[0].expression.name).toBe('item');
  });
});

// ============================================================
// 3. JSX if/else
// ============================================================

describe('Parser Coverage -- JSX if/else', () => {
  test('JSX if/else with elements', () => {
    const body = parseComponentBody('<div>if visible { <span>"yes"</span> } else { <span>"no"</span> }</div>');
    const jsxEl = body[0];
    expect(jsxEl.children.length).toBe(1);
    const ifNode = jsxEl.children[0];
    expect(ifNode.type).toBe('JSXIf');
    expect(ifNode.condition.type).toBe('Identifier');
    expect(ifNode.condition.name).toBe('visible');
    expect(ifNode.consequent.length).toBe(1);
    expect(ifNode.consequent[0].type).toBe('JSXElement');
    expect(ifNode.consequent[0].tag).toBe('span');
    expect(ifNode.alternate).not.toBeNull();
    expect(ifNode.alternate.length).toBe(1);
    expect(ifNode.alternate[0].type).toBe('JSXElement');
    expect(ifNode.alternate[0].tag).toBe('span');
  });

  test('JSX if without else', () => {
    const body = parseComponentBody('<div>if visible { <span>"yes"</span> }</div>');
    const ifNode = body[0].children[0];
    expect(ifNode.type).toBe('JSXIf');
    expect(ifNode.alternate).toBeNull();
  });

  test('JSX if/else with string text children', () => {
    const body = parseComponentBody('<div>if visible { "yes" } else { "no" }</div>');
    const ifNode = body[0].children[0];
    expect(ifNode.type).toBe('JSXIf');
    expect(ifNode.consequent.length).toBe(1);
    expect(ifNode.consequent[0].type).toBe('JSXText');
    expect(ifNode.alternate.length).toBe(1);
    expect(ifNode.alternate[0].type).toBe('JSXText');
  });
});

// ============================================================
// 4. Type annotations with generics
// ============================================================

describe('Parser Coverage -- Type annotations with generics', () => {
  test('function return type with generic params', () => {
    const ast = parse('fn get() -> Result<Int, String> { nil }');
    const fn = ast.body[0];
    expect(fn.type).toBe('FunctionDeclaration');
    expect(fn.returnType.type).toBe('TypeAnnotation');
    expect(fn.returnType.name).toBe('Result');
    expect(fn.returnType.typeParams.length).toBe(2);
    expect(fn.returnType.typeParams[0].name).toBe('Int');
    expect(fn.returnType.typeParams[1].name).toBe('String');
  });

  test('generic type annotation with single param', () => {
    const ast = parse('fn get() -> Option<Int> { nil }');
    const fn = ast.body[0];
    expect(fn.returnType.name).toBe('Option');
    expect(fn.returnType.typeParams.length).toBe(1);
    expect(fn.returnType.typeParams[0].name).toBe('Int');
  });
});

// ============================================================
// 5. Bare type variant
// ============================================================

describe('Parser Coverage -- Bare type variants', () => {
  test('enum-like type with bare variants', () => {
    const ast = parse('type Color { Red, Green, Blue }');
    const td = ast.body[0];
    expect(td.type).toBe('TypeDeclaration');
    expect(td.name).toBe('Color');
    expect(td.variants.length).toBe(3);
    td.variants.forEach(v => {
      expect(v.type).toBe('TypeVariant');
      expect(v.fields).toEqual([]);
    });
    expect(td.variants[0].name).toBe('Red');
    expect(td.variants[1].name).toBe('Green');
    expect(td.variants[2].name).toBe('Blue');
  });
});

// ============================================================
// 6. Multi-value var declaration
// ============================================================

describe('Parser Coverage -- Multi-value var declaration', () => {
  test('var with multiple targets and values', () => {
    const ast = parse('var a, b = 1, 2');
    const decl = ast.body[0];
    expect(decl.type).toBe('VarDeclaration');
    expect(decl.targets).toEqual(['a', 'b']);
    expect(decl.values.length).toBe(2);
    expect(decl.values[0].value).toBe(1);
    expect(decl.values[1].value).toBe(2);
  });
});

// ============================================================
// 7. Object pattern with alias and default value
// ============================================================

describe('Parser Coverage -- Object pattern with alias and default', () => {
  test('object pattern with alias (key: value)', () => {
    const ast = parse('let { x: y } = obj');
    const decl = ast.body[0];
    expect(decl.type).toBe('LetDestructure');
    expect(decl.pattern.type).toBe('ObjectPattern');
    expect(decl.pattern.properties.length).toBe(1);
    const prop = decl.pattern.properties[0];
    expect(prop.key).toBe('x');
    expect(prop.value).toBe('y');
    expect(prop.defaultValue).toBeNull();
  });

  test('object pattern with default value', () => {
    const ast = parse('let { x = 10 } = obj');
    const decl = ast.body[0];
    expect(decl.pattern.type).toBe('ObjectPattern');
    const prop = decl.pattern.properties[0];
    expect(prop.key).toBe('x');
    expect(prop.value).toBe('x');
    expect(prop.defaultValue).not.toBeNull();
    expect(prop.defaultValue.value).toBe(10);
  });

  test('object pattern with alias and default', () => {
    const ast = parse('let { x: y = 10 } = obj');
    const decl = ast.body[0];
    const prop = decl.pattern.properties[0];
    expect(prop.key).toBe('x');
    expect(prop.value).toBe('y');
    expect(prop.defaultValue.value).toBe(10);
  });
});

// ============================================================
// 8. Array pattern with skip
// ============================================================

describe('Parser Coverage -- Array pattern with skip', () => {
  test('array pattern with underscore skip', () => {
    const ast = parse('let [a, _, c] = arr');
    const decl = ast.body[0];
    expect(decl.type).toBe('LetDestructure');
    expect(decl.pattern.type).toBe('ArrayPattern');
    expect(decl.pattern.elements.length).toBe(3);
    expect(decl.pattern.elements[0]).toBe('a');
    expect(decl.pattern.elements[1]).toBeNull();
    expect(decl.pattern.elements[2]).toBe('c');
  });
});

// ============================================================
// 9. Match arm with block body
// ============================================================

describe('Parser Coverage -- Match arm with block body', () => {
  test('match arm body is a BlockStatement', () => {
    const expr = parseExpr('match x { 1 => { y = 1\ny }, _ => 0 }');
    expect(expr.type).toBe('MatchExpression');
    expect(expr.arms.length).toBe(2);
    const firstArm = expr.arms[0];
    expect(firstArm.body.type).toBe('BlockStatement');
    expect(firstArm.body.body.length).toBe(2);
    const secondArm = expr.arms[1];
    expect(secondArm.body.type).toBe('NumberLiteral');
  });
});

// ============================================================
// 10. Match patterns: string, boolean, nil
// ============================================================

describe('Parser Coverage -- Match patterns: string, boolean, nil', () => {
  test('string literal pattern', () => {
    const expr = parseExpr('match x { "hello" => 1, _ => 0 }');
    expect(expr.type).toBe('MatchExpression');
    const firstArm = expr.arms[0];
    expect(firstArm.pattern.type).toBe('LiteralPattern');
    expect(firstArm.pattern.value).toBe('hello');
  });

  test('boolean true pattern', () => {
    const expr = parseExpr('match x { true => 1, false => 0 }');
    expect(expr.type).toBe('MatchExpression');
    expect(expr.arms[0].pattern.type).toBe('LiteralPattern');
    expect(expr.arms[0].pattern.value).toBe(true);
    expect(expr.arms[1].pattern.type).toBe('LiteralPattern');
    expect(expr.arms[1].pattern.value).toBe(false);
  });

  test('nil pattern', () => {
    const expr = parseExpr('match x { nil => 0, _ => 1 }');
    expect(expr.type).toBe('MatchExpression');
    expect(expr.arms[0].pattern.type).toBe('LiteralPattern');
    expect(expr.arms[0].pattern.value).toBeNull();
  });
});

// ============================================================
// 11. Match pattern: uppercase variant without args
// ============================================================

describe('Parser Coverage -- Match pattern: uppercase variant without args', () => {
  test('None variant without arguments', () => {
    const expr = parseExpr('match x { None => 0, Some(v) => v }');
    expect(expr.type).toBe('MatchExpression');
    expect(expr.arms[0].pattern.type).toBe('VariantPattern');
    expect(expr.arms[0].pattern.name).toBe('None');
    expect(expr.arms[0].pattern.fields).toEqual([]);
    expect(expr.arms[1].pattern.type).toBe('VariantPattern');
    expect(expr.arms[1].pattern.name).toBe('Some');
    expect(expr.arms[1].pattern.fields).toEqual(['v']);
  });
});

// ============================================================
// 12. Match pattern: binding
// ============================================================

describe('Parser Coverage -- Match pattern: binding', () => {
  test('lowercase identifier becomes BindingPattern', () => {
    const expr = parseExpr('match x { value => value + 1 }');
    expect(expr.type).toBe('MatchExpression');
    expect(expr.arms[0].pattern.type).toBe('BindingPattern');
    expect(expr.arms[0].pattern.name).toBe('value');
  });
});

// ============================================================
// 13. Range pattern inclusive
// ============================================================

describe('Parser Coverage -- Range pattern inclusive', () => {
  test('inclusive range pattern with ..=', () => {
    const expr = parseExpr('match n { 1..=5 => "small", _ => "other" }');
    expect(expr.type).toBe('MatchExpression');
    const firstArm = expr.arms[0];
    expect(firstArm.pattern.type).toBe('RangePattern');
    expect(firstArm.pattern.start).toBe(1);
    expect(firstArm.pattern.end).toBe(5);
    expect(firstArm.pattern.inclusive).toBe(true);
  });

  test('exclusive range pattern with ..', () => {
    const expr = parseExpr('match n { 1..5 => "small", _ => "other" }');
    const firstArm = expr.arms[0];
    expect(firstArm.pattern.type).toBe('RangePattern');
    expect(firstArm.pattern.inclusive).toBe(false);
  });
});

// ============================================================
// 14. Empty object literal
// ============================================================

describe('Parser Coverage -- Empty object literal', () => {
  test('empty braces produce ObjectLiteral with no properties', () => {
    const ast = parse('x = {}');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('ObjectLiteral');
    expect(expr.properties.length).toBe(0);
  });
});

// ============================================================
// 15. Dict comprehension
// ============================================================

describe('Parser Coverage -- Dict comprehension', () => {
  test('basic dict comprehension with two variables', () => {
    const ast = parse('x = {k: v for k, v in pairs}');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('DictComprehension');
    expect(expr.key.type).toBe('Identifier');
    expect(expr.key.name).toBe('k');
    expect(expr.value.type).toBe('Identifier');
    expect(expr.value.name).toBe('v');
    expect(expr.variables).toEqual(['k', 'v']);
    expect(expr.iterable.type).toBe('Identifier');
    expect(expr.iterable.name).toBe('pairs');
    expect(expr.condition).toBeNull();
  });

  test('dict comprehension with single variable and condition', () => {
    const ast = parse('x = {k: k * 2 for k in items if k > 0}');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('DictComprehension');
    expect(expr.key.name).toBe('k');
    expect(expr.variables).toEqual(['k']);
    expect(expr.iterable.name).toBe('items');
    expect(expr.condition).not.toBeNull();
    expect(expr.condition.type).toBe('BinaryExpression');
    expect(expr.condition.operator).toBe('>');
  });
});

// ============================================================
// 16. Shorthand object literal
// ============================================================

describe('Parser Coverage -- Shorthand object literal', () => {
  test('shorthand object with identifiers', () => {
    const ast = parse('x = {a, b, c}');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('ObjectLiteral');
    expect(expr.properties.length).toBe(3);
    expr.properties.forEach(prop => {
      expect(prop.shorthand).toBe(true);
      expect(prop.key.type).toBe('Identifier');
      expect(prop.value.type).toBe('Identifier');
    });
    expect(expr.properties[0].key.name).toBe('a');
    expect(expr.properties[1].key.name).toBe('b');
    expect(expr.properties[2].key.name).toBe('c');
  });
});

// ============================================================
// 17. Empty parens arrow lambda
// ============================================================

describe('Parser Coverage -- Empty parens arrow lambda', () => {
  test('() => expr produces lambda with no params', () => {
    const ast = parse('x = () => 42');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.params.length).toBe(0);
    expect(expr.body.type).toBe('NumberLiteral');
    expect(expr.body.value).toBe(42);
  });
});

// ============================================================
// 18. Arrow lambda with block body
// ============================================================

describe('Parser Coverage -- Arrow lambda with block body', () => {
  test('(a, b) => { ... } produces lambda with BlockStatement', () => {
    const ast = parse('x = (a, b) => { a + b }');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.params.length).toBe(2);
    expect(expr.params[0].name).toBe('a');
    expect(expr.params[1].name).toBe('b');
    expect(expr.body.type).toBe('BlockStatement');
  });
});

// ============================================================
// 19. Arrow lambda with typed params
// ============================================================

describe('Parser Coverage -- Arrow lambda with typed params', () => {
  test('(n: Int) => expr has typed parameter', () => {
    const ast = parse('x = (n: Int) => n + 1');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.params.length).toBe(1);
    expect(expr.params[0].name).toBe('n');
    expect(expr.params[0].typeAnnotation).not.toBeNull();
    expect(expr.params[0].typeAnnotation.name).toBe('Int');
  });
});

// ============================================================
// 20. Arrow lambda with default param
// ============================================================

describe('Parser Coverage -- Arrow lambda with default param', () => {
  test('(n = 5) => expr has default value', () => {
    const ast = parse('x = (n = 5) => n + 1');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.params.length).toBe(1);
    expect(expr.params[0].name).toBe('n');
    expect(expr.params[0].defaultValue).not.toBeNull();
    expect(expr.params[0].defaultValue.value).toBe(5);
  });
});

// ============================================================
// 21. Parenthesized expression (backtracking)
// ============================================================

describe('Parser Coverage -- Parenthesized expression (backtracking)', () => {
  test('(1 + 2) is BinaryExpression not lambda', () => {
    const ast = parse('x = (1 + 2)');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('+');
    expect(expr.left.value).toBe(1);
    expect(expr.right.value).toBe(2);
  });

  test('(x) where x is not followed by => is parenthesized expression', () => {
    // When a single identifier is in parens and no arrow follows,
    // it backtracks and produces a plain Identifier
    const ast = parse('x = (y)');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('Identifier');
    expect(expr.name).toBe('y');
  });
});

// ============================================================
// 22. Lambda with compound assignment body
// ============================================================

describe('Parser Coverage -- Lambda with compound assignment body', () => {
  test('fn(a) a += 1 has CompoundAssignment body', () => {
    const ast = parse('x = fn(a) a += 1');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.body.type).toBe('CompoundAssignment');
    expect(expr.body.target.type).toBe('Identifier');
    expect(expr.body.target.name).toBe('a');
    expect(expr.body.operator).toBe('+=');
    expect(expr.body.value.value).toBe(1);
  });
});

// ============================================================
// 23. Lambda with assignment body
// ============================================================

describe('Parser Coverage -- Lambda with assignment body', () => {
  test('fn(a) y = a + 1 has Assignment body', () => {
    const ast = parse('x = fn(a) y = a + 1');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('LambdaExpression');
    expect(expr.body.type).toBe('Assignment');
    expect(expr.body.targets).toEqual(['y']);
    expect(expr.body.values[0].type).toBe('BinaryExpression');
  });
});

// ============================================================
// 24. server/client/shared as identifiers in expression
// ============================================================

describe('Parser Coverage -- server/client/shared as identifiers in expression', () => {
  test('server.get_users is MemberExpression', () => {
    const ast = parse('x = server.get_users');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('MemberExpression');
    expect(expr.object.type).toBe('Identifier');
    expect(expr.object.name).toBe('server');
    expect(expr.property).toBe('get_users');
  });

  test('client.render is MemberExpression', () => {
    const ast = parse('x = client.render');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('MemberExpression');
    expect(expr.object.type).toBe('Identifier');
    expect(expr.object.name).toBe('client');
  });

  test('shared.utils is MemberExpression', () => {
    const ast = parse('x = shared.utils');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('MemberExpression');
    expect(expr.object.type).toBe('Identifier');
    expect(expr.object.name).toBe('shared');
  });
});

// ============================================================
// 25. Docstring extraction
// ============================================================

describe('Parser Coverage -- Docstring extraction', () => {
  test('/// comment is extracted as docstring', () => {
    const source = '/// This is a doc\nfn foo() { 1 }';
    const lexer = new Lexer(source, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    const ast = parser.parse();

    // Docstrings are extracted and stored on the parser
    expect(parser.docstrings.length).toBe(1);
    expect(parser.docstrings[0].value).toBe('This is a doc');

    // The function is still parsed correctly
    expect(ast.body[0].type).toBe('FunctionDeclaration');
    expect(ast.body[0].name).toBe('foo');
  });

  test('multiple docstrings are extracted', () => {
    const source = '/// First doc\n/// Second doc\nfn foo() { 1 }';
    const lexer = new Lexer(source, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    parser.parse();

    expect(parser.docstrings.length).toBe(2);
    expect(parser.docstrings[0].value).toBe('First doc');
    expect(parser.docstrings[1].value).toBe('Second doc');
  });

  test('no docstrings yields empty array', () => {
    const source = 'fn foo() { 1 }';
    const lexer = new Lexer(source, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    parser.parse();

    expect(parser.docstrings.length).toBe(0);
  });
});

// ============================================================
// 26. For loop with else
// ============================================================

describe('Parser Coverage -- For loop with else', () => {
  test('for-else has elseBody', () => {
    const ast = parse('for x in items { print(x) } else { print("empty") }');
    const forStmt = ast.body[0];
    expect(forStmt.type).toBe('ForStatement');
    expect(forStmt.variable).toBe('x');
    expect(forStmt.elseBody).not.toBeNull();
    expect(forStmt.elseBody.type).toBe('BlockStatement');
  });

  test('for without else has null elseBody', () => {
    const ast = parse('for x in items { print(x) }');
    const forStmt = ast.body[0];
    expect(forStmt.elseBody).toBeNull();
  });
});

// ============================================================
// Additional edge cases for completeness
// ============================================================

describe('Parser Coverage -- Additional JSX edge cases', () => {
  test('JSX attribute with keyword name (for)', () => {
    const body = parseComponentBody('<label for="name">"Name"</label>');
    const jsxEl = body[0];
    expect(jsxEl.attributes.length).toBe(1);
    expect(jsxEl.attributes[0].name).toBe('for');
  });

  test('JSX attribute with keyword name (type)', () => {
    const body = parseComponentBody('<input type="text" />');
    const jsxEl = body[0];
    expect(jsxEl.attributes[0].name).toBe('type');
    expect(jsxEl.attributes[0].value.value).toBe('text');
  });

  test('JSX with multiple children of different types', () => {
    const body = parseComponentBody('<div>"text"{count}<span>"nested"</span></div>');
    const jsxEl = body[0];
    expect(jsxEl.children.length).toBe(3);
    expect(jsxEl.children[0].type).toBe('JSXText');
    expect(jsxEl.children[1].type).toBe('JSXExpression');
    expect(jsxEl.children[2].type).toBe('JSXElement');
  });

  test('JSX with on:event using in keyword as event name', () => {
    // The parser handles on: with `in` as the event suffix
    const body = parseComponentBody('<div on:in={handler}>"x"</div>');
    const jsxEl = body[0];
    expect(jsxEl.attributes[0].name).toBe('on:in');
  });
});

describe('Parser Coverage -- Object literal with key-value pairs', () => {
  test('regular object literal with explicit keys', () => {
    const ast = parse('x = {a: 1, b: 2}');
    const expr = ast.body[0].values[0];
    expect(expr.type).toBe('ObjectLiteral');
    expect(expr.properties.length).toBe(2);
    expect(expr.properties[0].shorthand).toBe(false);
    expect(expr.properties[0].key.name).toBe('a');
    expect(expr.properties[0].value.value).toBe(1);
  });
});

describe('Parser Coverage -- Match as statement', () => {
  test('match used as a statement wraps in ExpressionStatement', () => {
    const ast = parse('match x { 1 => print("one"), _ => print("other") }');
    expect(ast.body[0].type).toBe('ExpressionStatement');
    expect(ast.body[0].expression.type).toBe('MatchExpression');
  });
});

describe('Parser Coverage -- Type field with colon (simple struct field)', () => {
  test('type with colon-typed fields produces TypeField', () => {
    const ast = parse('type Point { x: Float, y: Float }');
    const td = ast.body[0];
    expect(td.variants.length).toBe(2);
    expect(td.variants[0].type).toBe('TypeField');
    expect(td.variants[0].name).toBe('x');
    expect(td.variants[0].typeAnnotation.name).toBe('Float');
    expect(td.variants[1].type).toBe('TypeField');
    expect(td.variants[1].name).toBe('y');
  });
});
