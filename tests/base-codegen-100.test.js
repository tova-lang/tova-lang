import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { SharedCodegen } from '../src/codegen/shared-codegen.js';

function compile(source) {
  const lexer = new Lexer(source, 'test.tova');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, 'test.tova');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, source);
  analyzer.analyze();
  const gen = new CodeGenerator(ast, 'test.tova');
  return gen.generate();
}

function compileShared(source) {
  return compile(source).shared.trim();
}

function compileServer(source) {
  return compile(source).server.trim();
}

// Create a SharedCodegen instance for testing internal _walk* methods
function makeSharedCodegen(source) {
  const lexer = new Lexer(source, 'test.tova');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, 'test.tova');
  const ast = parser.parse();
  // SharedCodegen expects to be called with a block AST node and filename
  return { gen: new SharedCodegen(ast, 'test.tova'), ast };
}

// ============================================================
// 1. Lines 1122-1139: _genIfStatementWithAssigns()
//    Triggered when inside _genBlockBodyAssign, the last statement
//    is an IfStatement with elseBody. This happens when an if-expression
//    branch's block body ends with an if/elif/else.
// ============================================================
describe('_genIfStatementWithAssigns (lines 1122-1139)', () => {
  test('nested if/else inside if-expression branch triggers assignment codegen', () => {
    const code = compileShared(`
fn compute(x) {
  result = if x > 10 {
    if x > 20 {
      "big"
    } else {
      "medium"
    }
  } else {
    "small"
  }
  result
}
`);
    expect(code).toContain('if ((x > 10))');
    expect(code).toContain('if ((x > 20))');
    expect(code).toContain('"big"');
    expect(code).toContain('"medium"');
    expect(code).toContain('"small"');
  });

  test('nested if/elif/else inside match arm triggers _genIfStatementWithAssigns', () => {
    const code = compileShared(`
fn categorize(val) {
  result = match val {
    1 => {
      if true {
        "one-a"
      } elif false {
        "one-b"
      } else {
        "one-c"
      }
    }
    _ => "other"
  }
  result
}
`);
    expect(code).toContain('result = "one-a"');
    expect(code).toContain('else if');
    expect(code).toContain('"one-b"');
    expect(code).toContain('"one-c"');
    expect(code).toContain('"other"');
  });

  test('if/else in assign block with only if and else (no elif)', () => {
    const code = compileShared(`
fn pick(flag) {
  val = if flag {
    if flag {
      100
    } else {
      200
    }
  } else {
    300
  }
  val
}
`);
    expect(code).toContain('100');
    expect(code).toContain('200');
    expect(code).toContain('300');
  });
});

// ============================================================
// 2. Lines 2085-2086: Template literal interpolation escaping in column body
//    Happens when a TemplateLiteral node is inside _genColumnBody
//    Tova uses "..." with ${} for string interpolation, NOT backticks
// ============================================================
describe('Template literal in column body (lines 2085-2086)', () => {
  test('template literal with column reference in derive', () => {
    const code = compileServer('server {\n  x = derive(.greeting = "hello ${.name}")\n}');
    // The template literal with column expression should be generated as a lambda with backtick template
    expect(code).toContain('derive');
    expect(code).toContain('__row.name');
  });

  test('template literal with plain text in column body', () => {
    const code = compileServer('server {\n  x = derive(.label = "item-${.val}")\n}');
    expect(code).toContain('derive');
    expect(code).toContain('__row.val');
  });
});

// ============================================================
// 3. Lines 2241-2246: Named argument handling for column expressions in join()
//    Happens when join/table_join has NamedArgument with ColumnExpression value
// ============================================================
describe('Named argument column expressions in join (lines 2241-2246)', () => {
  test('table_join with left/right column expression named args', () => {
    const code = compileServer(`
server {
  x = table_join(users, orders, left: .id, right: .user_id)
}
`);
    expect(code).toContain('table_join');
  });

  test('join with left/right column expression named args', () => {
    const code = compileServer(`
server {
  x = join(a, b, left: .key, right: .key)
}
`);
    expect(code).toContain('join');
  });
});

// ============================================================
// 4. Lines 2754-2771: _genIfReturn()
//    Triggered when the last expression in a function body is an IfExpression
//    that needs IIFE (multi-statement blocks), generating direct returns instead.
// ============================================================
describe('_genIfReturn (lines 2754-2771)', () => {
  test('multi-statement if EXPRESSION as last fn body expression generates direct returns via _genIfReturn', () => {
    // Key: parenthesized (if ...) makes it an IfExpression (not IfStatement).
    // Multi-statement blocks make _needsIIFE return true.
    // Being the last ExpressionStatement in genBlockBody triggers _genIfReturn.
    const code = compileShared(`
fn decide(x) {
  y = 1
  (if x > 0 {
    val = x * 2
    val + 1
  } elif x == 0 {
    temp = 42
    temp
  } else {
    neg = x * -1
    neg
  })
}
`);
    expect(code).toContain('return (val + 1)');
    expect(code).toContain('return temp');
    expect(code).toContain('return neg');
    expect(code).toContain('if ((x > 0))');
    expect(code).toContain('else if ((x == 0))');
    expect(code).toContain('else {');
  });

  test('if expression with multiple elif and multi-line blocks as last expression', () => {
    const code = compileShared(`
fn classify(n) {
  dummy = 0
  (if n > 100 {
    a = "big"
    a
  } elif n > 50 {
    b = "medium"
    b
  } elif n > 0 {
    c = "small"
    c
  } else {
    d = "zero"
    d
  })
}
`);
    expect(code).toContain('return a;');
    expect(code).toContain('return b;');
    expect(code).toContain('return c;');
    expect(code).toContain('return d;');
  });

  test('if expression with only multi-statement consequent and else (parenthesized)', () => {
    const code = compileShared(`
fn check(x) {
  dummy = 0
  (if x {
    a = 1
    b = 2
    a + b
  } else {
    c = 3
    d = 4
    c + d
  })
}
`);
    expect(code).toContain('return (a + b)');
    expect(code).toContain('return (c + d)');
  });
});

// ============================================================
// 5. Lines 2974-2977: TuplePattern binding generation in match
//    Triggered when a match arm has a tuple pattern (a, b)
// ============================================================
describe('TuplePattern binding generation (lines 2974-2977)', () => {
  test('match with tuple pattern extracts bindings', () => {
    const code = compileShared(`
fn process(pair) {
  match pair {
    (a, b) => a + b
    _ => 0
  }
}
`);
    expect(code).toContain('const a = ');
    expect(code).toContain('const b = ');
    expect(code).toContain('[0]');
    expect(code).toContain('[1]');
  });

  test('match with tuple pattern three elements', () => {
    const code = compileShared(`
fn sum3(triple) {
  match triple {
    (x, y, z) => x + y + z
    _ => 0
  }
}
`);
    expect(code).toContain('const x = ');
    expect(code).toContain('const y = ');
    expect(code).toContain('const z = ');
    expect(code).toContain('[0]');
    expect(code).toContain('[1]');
    expect(code).toContain('[2]');
  });
});

// ============================================================
// 6. Lines 3101-3103: Parameter type annotation formatting in interface
//    Triggered when interface methods have typed parameters
// ============================================================
describe('Interface parameter type annotations (lines 3101-3103)', () => {
  test('interface with typed params generates comment with annotations', () => {
    const code = compileShared(`
interface Printable {
  fn display(item: String) -> String
}
`);
    expect(code).toContain('interface Printable');
    expect(code).toContain('item: String');
    expect(code).toContain('-> String');
  });

  test('interface with multiple typed params', () => {
    const code = compileShared(`
interface Comparator {
  fn compare(a: Int, b: Int) -> Bool
}
`);
    expect(code).toContain('interface Comparator');
    expect(code).toContain('a: Int');
    expect(code).toContain('b: Int');
    expect(code).toContain('-> Bool');
  });

  test('interface with untyped and typed params mixed', () => {
    const code = compileShared(`
interface Mapper {
  fn transform(input: String, factor) -> String
}
`);
    expect(code).toContain('interface Mapper');
    expect(code).toContain('input: String');
    expect(code).toContain('factor');
  });

  test('interface with no return type', () => {
    const code = compileShared(`
interface Logger {
  fn log(msg: String)
}
`);
    expect(code).toContain('interface Logger');
    expect(code).toContain('msg: String');
    expect(code).toContain('fn log(');
  });
});

// ============================================================
// 7. Lines 3306-3309: genDeferStatement()
//    In function body context, defer is handled by genBlockBody with try/finally.
//    genDeferStatement itself emits a no-op comment, hit when called directly.
// ============================================================
describe('genDeferStatement (lines 3306-3309)', () => {
  test('defer generates try/finally wrapper in function body', () => {
    const code = compileShared(`
fn cleanup() {
  defer print("done")
  print("working")
}
`);
    expect(code).toContain('try');
    expect(code).toContain('finally');
    expect(code).toContain('print("done")');
  });

  test('defer with block expression', () => {
    const code = compileShared(`
fn setup() {
  defer {
    print("cleanup1")
    print("cleanup2")
  }
  print("main work")
}
`);
    expect(code).toContain('try');
    expect(code).toContain('finally');
    expect(code).toContain('cleanup1');
    expect(code).toContain('cleanup2');
  });

  test('genDeferStatement directly produces no-op comment', () => {
    // Call genDeferStatement directly on a SharedCodegen instance
    const { gen } = makeSharedCodegen('x = 1');
    const deferNode = { type: 'DeferStatement', body: { type: 'Identifier', name: 'cleanup' } };
    const result = gen.genDeferStatement(deferNode);
    expect(result).toContain('/* defer */');
  });
});

// ============================================================
// 8. Lines 3717-3720: genSpawnExpression()
//    Triggered when spawn is used in an expression context
// ============================================================
describe('genSpawnExpression (lines 3717-3720)', () => {
  test('spawn expression generates async try/catch with Result', () => {
    const code = compileShared(`
fn do_work() {
  result = spawn fetch_data("url")
  result
}
`);
    expect(code).toContain('async ()');
    expect(code).toContain('try');
    expect(code).toContain('new Ok(await');
    expect(code).toContain('new Err(__e)');
    expect(code).toContain('fetch_data("url")');
  });

  test('spawn with multiple arguments', () => {
    const code = compileShared(`
fn concurrent() {
  task = spawn compute(1, 2, 3)
  task
}
`);
    expect(code).toContain('compute(1, 2, 3)');
    expect(code).toContain('new Ok(await');
    expect(code).toContain('catch(__e)');
  });

  test('spawn without arguments (bare function reference)', () => {
    const code = compileShared(`
fn run() {
  t = spawn do_something
  t
}
`);
    expect(code).toContain('async ()');
    expect(code).toContain('new Ok(await');
    expect(code).toContain('do_something');
  });
});

// ============================================================
// 9. Lines 4081-4125: _walkExpressions()
//    AST traversal helper. Must be called on a SharedCodegen instance.
// ============================================================
describe('_walkExpressions (lines 4081-4125)', () => {
  test('walks BinaryExpression nodes', () => {
    const { gen, ast } = makeSharedCodegen('x = 1 + 2');
    const visited = [];
    const binExpr = ast.body[0].values[0]; // 1 + 2
    gen._walkExpressions(binExpr, (node) => visited.push(node.type));

    expect(visited).toContain('BinaryExpression');
    expect(visited).toContain('NumberLiteral');
  });

  test('walks UnaryExpression nodes', () => {
    const { gen, ast } = makeSharedCodegen('x = !true');
    const visited = [];
    const unaryExpr = ast.body[0].values[0];
    gen._walkExpressions(unaryExpr, (node) => visited.push(node.type));

    expect(visited).toContain('UnaryExpression');
    expect(visited).toContain('BooleanLiteral');
  });

  test('walks CallExpression nodes', () => {
    const { gen, ast } = makeSharedCodegen('x = foo(1, 2)');
    const visited = [];
    const callExpr = ast.body[0].values[0];
    gen._walkExpressions(callExpr, (node) => visited.push(node.type));

    expect(visited).toContain('CallExpression');
    expect(visited).toContain('Identifier');
    expect(visited).toContain('NumberLiteral');
  });

  test('walks MemberExpression nodes (non-computed)', () => {
    const { gen, ast } = makeSharedCodegen('x = obj.prop');
    const visited = [];
    const memberExpr = ast.body[0].values[0];
    gen._walkExpressions(memberExpr, (node) => visited.push(node.type));

    expect(visited).toContain('MemberExpression');
    expect(visited).toContain('Identifier'); // object
  });

  test('walks MemberExpression with computed property', () => {
    const { gen, ast } = makeSharedCodegen('x = arr[0]');
    const visited = [];
    const memberExpr = ast.body[0].values[0];
    gen._walkExpressions(memberExpr, (node) => visited.push(node.type));

    expect(visited).toContain('MemberExpression');
    expect(visited).toContain('NumberLiteral'); // computed index
  });

  test('walks ConditionalExpression nodes', () => {
    const { gen } = makeSharedCodegen('x = 1');

    const condExpr = {
      type: 'ConditionalExpression',
      condition: { type: 'Identifier', name: 'flag' },
      consequent: { type: 'NumberLiteral', value: 1 },
      alternate: { type: 'NumberLiteral', value: 2 }
    };

    const visited = [];
    gen._walkExpressions(condExpr, (node) => visited.push(node.type));

    expect(visited).toContain('ConditionalExpression');
    expect(visited).toContain('Identifier');
    expect(visited).toContain('NumberLiteral');
    expect(visited.length).toBe(4); // condExpr + condition + consequent + alternate
  });

  test('walks ArrayLiteral nodes', () => {
    const { gen, ast } = makeSharedCodegen('x = [1, 2, 3]');
    const visited = [];
    const arrLit = ast.body[0].values[0];
    gen._walkExpressions(arrLit, (node) => visited.push(node.type));

    expect(visited).toContain('ArrayLiteral');
    expect(visited).toContain('NumberLiteral');
  });

  test('walks ObjectLiteral nodes', () => {
    const { gen, ast } = makeSharedCodegen('x = {a: 1, b: 2}');
    const visited = [];
    const objLit = ast.body[0].values[0];
    gen._walkExpressions(objLit, (node) => visited.push(node.type));

    expect(visited).toContain('ObjectLiteral');
    expect(visited).toContain('NumberLiteral');
  });

  test('walks TemplateLiteral nodes', () => {
    const { gen, ast } = makeSharedCodegen('x = "hello ${name}"');
    const visited = [];
    const tplLit = ast.body[0].values[0];
    gen._walkExpressions(tplLit, (node) => visited.push(node.type));

    expect(visited).toContain('TemplateLiteral');
  });

  test('does not descend into LambdaExpression', () => {
    const { gen, ast } = makeSharedCodegen('x = fn(y) y + 1');
    const visited = [];
    const lambdaExpr = ast.body[0].values[0];
    gen._walkExpressions(lambdaExpr, (node) => visited.push(node.type));

    // Should not descend into the lambda body
    expect(visited.length).toBe(1);
  });

  test('walks LogicalExpression nodes', () => {
    const { gen, ast } = makeSharedCodegen('x = a and b');
    const visited = [];
    const logExpr = ast.body[0].values[0];
    gen._walkExpressions(logExpr, (node) => visited.push(node.type));

    expect(visited).toContain('LogicalExpression');
    expect(visited).toContain('Identifier');
  });

  test('handles null/undefined gracefully', () => {
    const { gen } = makeSharedCodegen('x = 1');
    // Should not throw
    gen._walkExpressions(null, () => {});
    gen._walkExpressions(undefined, () => {});
  });

  test('walks StringLiteral leaf node', () => {
    const { gen, ast } = makeSharedCodegen('x = "hello"');
    const visited = [];
    const strLit = ast.body[0].values[0];
    gen._walkExpressions(strLit, (node) => visited.push(node.type));

    expect(visited).toContain('StringLiteral');
    expect(visited.length).toBe(1);
  });

  test('walks NilLiteral leaf node', () => {
    const { gen, ast } = makeSharedCodegen('x = nil');
    const visited = [];
    const nilLit = ast.body[0].values[0];
    gen._walkExpressions(nilLit, (node) => visited.push(node.type));

    expect(visited).toContain('NilLiteral');
    expect(visited.length).toBe(1);
  });
});

// ============================================================
// 10. Lines 4133-4175: _walkStatementExpressions()
//     Walks expressions within statements.
// ============================================================
describe('_walkStatementExpressions (lines 4133-4175)', () => {
  test('walks ExpressionStatement', () => {
    const { gen, ast } = makeSharedCodegen('fn f() { foo(1) }');
    const visited = [];
    const fnBody = ast.body[0].body;
    const stmt = fnBody.body[0]; // ExpressionStatement
    gen._walkStatementExpressions(stmt, (node) => visited.push(node.type));

    expect(visited).toContain('CallExpression');
  });

  test('walks Assignment statement', () => {
    const { gen, ast } = makeSharedCodegen('x = foo(1)');
    const visited = [];
    const stmt = ast.body[0]; // Assignment
    gen._walkStatementExpressions(stmt, (node) => visited.push(node.type));

    expect(visited).toContain('CallExpression');
  });

  test('walks ReturnStatement', () => {
    const { gen, ast } = makeSharedCodegen('fn f() { return foo(1) }');
    const visited = [];
    const stmt = ast.body[0].body.body[0]; // ReturnStatement
    gen._walkStatementExpressions(stmt, (node) => visited.push(node.type));

    expect(visited).toContain('CallExpression');
  });

  test('walks IfStatement with alternates and elseBody', () => {
    const src = `
fn f() {
  if a {
    foo(1)
  } elif b {
    bar(2)
  } else {
    baz(3)
  }
}
`;
    const { gen, ast } = makeSharedCodegen(src);
    const visited = [];
    const stmt = ast.body[0].body.body[0]; // IfStatement
    gen._walkStatementExpressions(stmt, (node) => visited.push(node.type));

    expect(visited).toContain('Identifier'); // conditions
    expect(visited).toContain('CallExpression'); // bodies
  });

  test('walks ForStatement', () => {
    const src = `
fn f() {
  for item in items {
    process(item)
  }
}
`;
    const { gen, ast } = makeSharedCodegen(src);
    const visited = [];
    const stmt = ast.body[0].body.body[0]; // ForStatement
    gen._walkStatementExpressions(stmt, (node) => visited.push(node.type));

    expect(visited).toContain('Identifier'); // items iterable
    expect(visited).toContain('CallExpression'); // process(item) body
  });

  test('walks WhileStatement', () => {
    const src = `
fn f() {
  while active {
    do_work()
  }
}
`;
    const { gen, ast } = makeSharedCodegen(src);
    const visited = [];
    const stmt = ast.body[0].body.body[0]; // WhileStatement
    gen._walkStatementExpressions(stmt, (node) => visited.push(node.type));

    expect(visited).toContain('Identifier'); // active condition
    expect(visited).toContain('CallExpression'); // do_work() body
  });

  test('walks CallExpression as statement type', () => {
    const { gen } = makeSharedCodegen('x = 1');

    const callStmt = {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: 'foo' },
      arguments: [{ type: 'NumberLiteral', value: 42 }]
    };

    const visited = [];
    gen._walkStatementExpressions(callStmt, (node) => visited.push(node.type));

    expect(visited).toContain('CallExpression');
    expect(visited).toContain('Identifier');
    expect(visited).toContain('NumberLiteral');
  });

  test('walks default case with expression property', () => {
    const { gen } = makeSharedCodegen('x = 1');

    const customStmt = {
      type: 'CustomStatement',
      expression: { type: 'Identifier', name: 'test_var' }
    };

    const visited = [];
    gen._walkStatementExpressions(customStmt, (node) => visited.push(node.type));

    expect(visited).toContain('Identifier');
  });

  test('handles null/undefined stmt gracefully', () => {
    const { gen } = makeSharedCodegen('x = 1');
    gen._walkStatementExpressions(null, () => {});
    gen._walkStatementExpressions(undefined, () => {});
  });

  test('walks Assignment with object target (MemberExpression)', () => {
    const { gen } = makeSharedCodegen('x = 1');

    const stmt = {
      type: 'Assignment',
      targets: [{ type: 'MemberExpression', object: { type: 'Identifier', name: 'obj' }, property: { type: 'Identifier', name: 'prop' } }],
      values: [{ type: 'NumberLiteral', value: 42 }]
    };

    const visited = [];
    gen._walkStatementExpressions(stmt, (node) => visited.push(node.type));

    expect(visited).toContain('MemberExpression');
    expect(visited).toContain('NumberLiteral');
  });
});

// ============================================================
// 11. Lines 4183-4185: _walkStatementBlock()
//     Wrapper for walking blocks.
// ============================================================
describe('_walkStatementBlock (lines 4183-4185)', () => {
  test('walks a BlockStatement with multiple statements', () => {
    const { gen } = makeSharedCodegen('x = 1');

    const block = {
      type: 'BlockStatement',
      body: [
        { type: 'ExpressionStatement', expression: { type: 'Identifier', name: 'a' } },
        { type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }
      ]
    };

    const visited = [];
    gen._walkStatementBlock(block, (node) => visited.push(node.type));

    expect(visited).toContain('Identifier');
    expect(visited).toContain('NumberLiteral');
  });

  test('walks a non-BlockStatement (single statement)', () => {
    const { gen } = makeSharedCodegen('x = 1');

    const singleStmt = { type: 'ExpressionStatement', expression: { type: 'StringLiteral', value: 'hello' } };

    const visited = [];
    gen._walkStatementBlock(singleStmt, (node) => visited.push(node.type));

    expect(visited).toContain('StringLiteral');
  });

  test('handles null block gracefully', () => {
    const { gen } = makeSharedCodegen('x = 1');
    gen._walkStatementBlock(null, () => {});
    gen._walkStatementBlock(undefined, () => {});
  });
});

// ============================================================
// Additional integration tests
// ============================================================
describe('Integration: _genIfReturn with elif in function body', () => {
  test('complex parenthesized if/elif/else as last expression with multiple statements per branch', () => {
    const code = compileShared(`
fn route(method) {
  dummy = 0
  (if method == "GET" {
    status = 200
    body = "ok"
    [status, body]
  } elif method == "POST" {
    status = 201
    body = "created"
    [status, body]
  } elif method == "DELETE" {
    status = 204
    body = ""
    [status, body]
  } else {
    status = 405
    body = "not allowed"
    [status, body]
  })
}
`);
    expect(code).toContain('if ((method == "GET"))');
    expect(code).toContain('else if ((method == "POST"))');
    expect(code).toContain('else if ((method == "DELETE"))');
    expect(code).toContain('else');
    expect(code).toContain('return [status, body]');
  });
});

describe('Integration: spawn in expression context', () => {
  test('spawn as function argument', () => {
    const code = compileShared(`
fn run_tasks() {
  tasks = [spawn work(1), spawn work(2)]
  tasks
}
`);
    expect(code).toContain('new Ok(await work(1))');
    expect(code).toContain('new Ok(await work(2))');
    expect(code).toContain('new Err(__e)');
  });
});

describe('Integration: nested if in match arm for _genIfStatementWithAssigns', () => {
  test('match arm body ending with if/elif/else as assignment', () => {
    const code = compileShared(`
fn compute_op(op, val) {
  result = match op {
    "add" => {
      computed = val + 1
      if computed > 100 {
        "overflow"
      } elif computed > 50 {
        "large"
      } else {
        "normal"
      }
    }
    _ => "unknown"
  }
  result
}
`);
    expect(code).toContain('result = "overflow"');
    expect(code).toContain('result = "large"');
    expect(code).toContain('result = "normal"');
  });
});
