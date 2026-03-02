// Tests for src/codegen/wasm-codegen.js — targeting 100% line coverage
import { describe, test, expect } from 'bun:test';
import {
  compileWasmFunction,
  compileWasmModule,
  generateWasmGlue,
  generateWasmBytesExport,
  generateMultiWasmGlue,
} from '../src/codegen/wasm-codegen.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

// ─── Helpers ────────────────────────────────────────────────

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function compile(source) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
  analyzer.analyze();
  const codegen = new CodeGenerator(ast, '<test>');
  return codegen.generate();
}

function getShared(source) {
  return compile(source).shared || '';
}

function getWasmFuncNode(source) {
  const ast = parse(source);
  // Find the first FunctionDeclaration with @wasm decorator
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration' &&
        node.decorators && node.decorators.some(d => d.name === 'wasm')) {
      return node;
    }
  }
  throw new Error('No @wasm function found in source');
}

function getAllWasmFuncNodes(source) {
  const ast = parse(source);
  return ast.body.filter(node =>
    node.type === 'FunctionDeclaration' &&
    node.decorators && node.decorators.some(d => d.name === 'wasm')
  );
}

// Helper to create a minimal AST function node
function makeFuncNode(name, params, body, returnType) {
  return {
    type: 'FunctionDeclaration',
    name,
    params: params || [],
    body: body || { type: 'BlockStatement', body: [] },
    returnType: returnType || null,
    decorators: [{ name: 'wasm' }],
  };
}

function makeParam(name, typeAnnotation) {
  return { type: 'Parameter', name, typeAnnotation: typeAnnotation || null };
}

function makeBlock(...stmts) {
  return { type: 'BlockStatement', body: stmts };
}

function makeExprStmt(expr) {
  return { type: 'ExpressionStatement', expression: expr };
}

function makeReturn(value) {
  return { type: 'ReturnStatement', value };
}

function makeNum(value) {
  return { type: 'NumberLiteral', value };
}

function makeBool(value) {
  return { type: 'BooleanLiteral', value };
}

function makeId(name) {
  return { type: 'Identifier', name };
}

function makeBinary(op, left, right) {
  return { type: 'BinaryExpression', operator: op, left, right };
}

function makeUnary(op, operand) {
  return { type: 'UnaryExpression', operator: op, operand };
}

function makeCall(calleeName, args) {
  return { type: 'CallExpression', callee: { name: calleeName }, arguments: args };
}

function makeIf(condition, consequent, elseBody, alternates) {
  return {
    type: 'IfStatement',
    condition,
    consequent,
    elseBody: elseBody || null,
    alternates: alternates || null,
  };
}

function makeWhile(condition, body) {
  return { type: 'WhileStatement', condition, body };
}

function makeLogical(op, left, right) {
  return { type: 'LogicalExpression', operator: op, left, right };
}

function makeVarDecl(names, values) {
  return {
    type: 'VarDeclaration',
    targets: names.map(n => typeof n === 'string' ? { name: n } : n),
    values,
  };
}

function makeAssignment(names, values) {
  return {
    type: 'Assignment',
    targets: names.map(n => typeof n === 'string' ? { name: n } : n),
    values,
  };
}

// Validate that a Uint8Array represents a valid WASM module
function isValidWasm(bytes) {
  return bytes instanceof Uint8Array &&
    bytes[0] === 0x00 && bytes[1] === 0x61 &&
    bytes[2] === 0x73 && bytes[3] === 0x6D;
}

// Actually instantiate and run the WASM module
async function runWasm(bytes, funcName, ...args) {
  const module = new WebAssembly.Module(bytes);
  const instance = new WebAssembly.Instance(module);
  return instance.exports[funcName](...args);
}

// ─── Full Pipeline Tests ────────────────────────────────────

describe('WASM codegen — full pipeline', () => {
  test('@wasm simple addition compiles to WebAssembly', () => {
    const js = getShared('@wasm fn add(a: Int, b: Int) -> Int { a + b }');
    expect(js).toContain('WebAssembly');
    expect(js).toContain('__wasm_bytes_add');
    expect(js).toContain('Uint8Array');
  });

  test('@wasm subtraction', () => {
    const js = getShared('@wasm fn sub(a: Int, b: Int) -> Int { a - b }');
    expect(js).toContain('__wasm_bytes_sub');
  });

  test('@wasm multiplication', () => {
    const js = getShared('@wasm fn mul(a: Int, b: Int) -> Int { a * b }');
    expect(js).toContain('__wasm_bytes_mul');
  });

  test('@wasm division', () => {
    const js = getShared('@wasm fn div(a: Int, b: Int) -> Int { a / b }');
    expect(js).toContain('__wasm_bytes_div');
  });

  test('@wasm modulo', () => {
    const js = getShared('@wasm fn mod_fn(a: Int, b: Int) -> Int { a % b }');
    expect(js).toContain('__wasm_bytes_mod_fn');
  });

  test('@wasm float arithmetic', () => {
    const js = getShared('@wasm fn fadd(a: Float, b: Float) -> Float { a + b }');
    expect(js).toContain('__wasm_bytes_fadd');
  });

  test('@wasm comparison operators', () => {
    const js = getShared('@wasm fn eq(a: Int, b: Int) -> Int { a == b }');
    expect(js).toContain('__wasm_bytes_eq');
  });

  test('@wasm with if/else expression', () => {
    const src = `@wasm fn abs(x: Int) -> Int {
      if x < 0 {
        0 - x
      } else {
        x
      }
    }`;
    const js = getShared(src);
    expect(js).toContain('__wasm_bytes_abs');
  });

  test('@wasm with while loop', () => {
    const src = `@wasm fn sum_to(n: Int) -> Int {
      i = 0
      total = 0
      while i < n {
        total = total + i
        i = i + 1
      }
      total
    }`;
    const js = getShared(src);
    expect(js).toContain('__wasm_bytes_sum_to');
  });

  test('@wasm with recursive call', () => {
    const src = `@wasm fn fib(n: Int) -> Int {
      if n < 2 {
        n
      } else {
        fib(n - 1) + fib(n - 2)
      }
    }`;
    const js = getShared(src);
    expect(js).toContain('__wasm_bytes_fib');
  });

  test('@wasm with boolean literal', () => {
    const src = `@wasm fn is_true() -> Int {
      if true { 1 } else { 0 }
    }`;
    const js = getShared(src);
    expect(js).toContain('__wasm_bytes_is_true');
  });
});

// ─── Direct compileWasmFunction Tests ───────────────────────

describe('compileWasmFunction — direct', () => {
  test('compiles a simple i32 add function', async () => {
    const node = getWasmFuncNode('@wasm fn add(a: Int, b: Int) -> Int { a + b }');
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);

    // Actually run the WASM
    const result = await runWasm(bytes, 'add', 3, 5);
    expect(result).toBe(8);
  });

  test('compiles i32 subtraction', async () => {
    const node = getWasmFuncNode('@wasm fn sub(a: Int, b: Int) -> Int { a - b }');
    const bytes = compileWasmFunction(node);
    const result = await runWasm(bytes, 'sub', 10, 3);
    expect(result).toBe(7);
  });

  test('compiles i32 multiplication', async () => {
    const node = getWasmFuncNode('@wasm fn mul(a: Int, b: Int) -> Int { a * b }');
    const bytes = compileWasmFunction(node);
    const result = await runWasm(bytes, 'mul', 4, 7);
    expect(result).toBe(28);
  });

  test('compiles i32 division', async () => {
    const node = getWasmFuncNode('@wasm fn div(a: Int, b: Int) -> Int { a / b }');
    const bytes = compileWasmFunction(node);
    const result = await runWasm(bytes, 'div', 20, 4);
    expect(result).toBe(5);
  });

  test('compiles i32 remainder (modulo)', async () => {
    const node = getWasmFuncNode('@wasm fn rem(a: Int, b: Int) -> Int { a % b }');
    const bytes = compileWasmFunction(node);
    const result = await runWasm(bytes, 'rem', 17, 5);
    expect(result).toBe(2);
  });

  test('compiles f64 addition', async () => {
    const node = getWasmFuncNode('@wasm fn fadd(a: Float, b: Float) -> Float { a + b }');
    const bytes = compileWasmFunction(node);
    const result = await runWasm(bytes, 'fadd', 1.5, 2.5);
    expect(result).toBe(4.0);
  });

  test('compiles f64 subtraction', async () => {
    const node = getWasmFuncNode('@wasm fn fsub(a: Float, b: Float) -> Float { a - b }');
    const bytes = compileWasmFunction(node);
    const result = await runWasm(bytes, 'fsub', 10.5, 3.5);
    expect(result).toBe(7.0);
  });

  test('compiles f64 multiplication', async () => {
    const node = getWasmFuncNode('@wasm fn fmul(a: Float, b: Float) -> Float { a * b }');
    const bytes = compileWasmFunction(node);
    const result = await runWasm(bytes, 'fmul', 2.5, 4.0);
    expect(result).toBe(10.0);
  });

  test('compiles f64 division', async () => {
    const node = getWasmFuncNode('@wasm fn fdiv(a: Float, b: Float) -> Float { a / b }');
    const bytes = compileWasmFunction(node);
    const result = await runWasm(bytes, 'fdiv', 10.0, 4.0);
    expect(result).toBe(2.5);
  });

  test('compiles comparison == (i32)', async () => {
    const node = getWasmFuncNode('@wasm fn eq(a: Int, b: Int) -> Int { a == b }');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'eq', 5, 5)).toBe(1);
    expect(await runWasm(bytes, 'eq', 5, 3)).toBe(0);
  });

  test('compiles comparison != (i32)', async () => {
    const node = getWasmFuncNode('@wasm fn ne(a: Int, b: Int) -> Int { a != b }');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'ne', 5, 3)).toBe(1);
    expect(await runWasm(bytes, 'ne', 5, 5)).toBe(0);
  });

  test('compiles comparison < (i32)', async () => {
    const node = getWasmFuncNode('@wasm fn lt(a: Int, b: Int) -> Int { a < b }');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'lt', 3, 5)).toBe(1);
    expect(await runWasm(bytes, 'lt', 5, 3)).toBe(0);
  });

  test('compiles comparison > (i32)', async () => {
    const node = getWasmFuncNode('@wasm fn gt(a: Int, b: Int) -> Int { a > b }');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'gt', 5, 3)).toBe(1);
    expect(await runWasm(bytes, 'gt', 3, 5)).toBe(0);
  });

  test('compiles comparison <= (i32)', async () => {
    const node = getWasmFuncNode('@wasm fn le(a: Int, b: Int) -> Int { a <= b }');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'le', 3, 5)).toBe(1);
    expect(await runWasm(bytes, 'le', 5, 5)).toBe(1);
    expect(await runWasm(bytes, 'le', 5, 3)).toBe(0);
  });

  test('compiles comparison >= (i32)', async () => {
    const node = getWasmFuncNode('@wasm fn ge(a: Int, b: Int) -> Int { a >= b }');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'ge', 5, 3)).toBe(1);
    expect(await runWasm(bytes, 'ge', 5, 5)).toBe(1);
    expect(await runWasm(bytes, 'ge', 3, 5)).toBe(0);
  });

  test('compiles f64 comparisons', async () => {
    // f64_eq
    const eqNode = getWasmFuncNode('@wasm fn feq(a: Float, b: Float) -> Int { a == b }');
    expect(await runWasm(compileWasmFunction(eqNode), 'feq', 1.0, 1.0)).toBe(1);

    // f64_ne
    const neNode = getWasmFuncNode('@wasm fn fne(a: Float, b: Float) -> Int { a != b }');
    expect(await runWasm(compileWasmFunction(neNode), 'fne', 1.0, 2.0)).toBe(1);

    // f64_lt
    const ltNode = getWasmFuncNode('@wasm fn flt(a: Float, b: Float) -> Int { a < b }');
    expect(await runWasm(compileWasmFunction(ltNode), 'flt', 1.0, 2.0)).toBe(1);

    // f64_gt
    const gtNode = getWasmFuncNode('@wasm fn fgt(a: Float, b: Float) -> Int { a > b }');
    expect(await runWasm(compileWasmFunction(gtNode), 'fgt', 2.0, 1.0)).toBe(1);

    // f64_le
    const leNode = getWasmFuncNode('@wasm fn fle(a: Float, b: Float) -> Int { a <= b }');
    expect(await runWasm(compileWasmFunction(leNode), 'fle', 1.0, 1.0)).toBe(1);

    // f64_ge
    const geNode = getWasmFuncNode('@wasm fn fge(a: Float, b: Float) -> Int { a >= b }');
    expect(await runWasm(compileWasmFunction(geNode), 'fge', 2.0, 1.0)).toBe(1);
  });

  test('compiles function with no params and return Int', async () => {
    const node = getWasmFuncNode('@wasm fn fortytwo() -> Int { 42 }');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'fortytwo')).toBe(42);
  });

  test('compiles function returning float literal', async () => {
    const node = getWasmFuncNode('@wasm fn pi() -> Float { 3.14 }');
    const bytes = compileWasmFunction(node);
    const result = await runWasm(bytes, 'pi');
    expect(result).toBeCloseTo(3.14, 2);
  });

  test('compiles negative integer literal', async () => {
    const src = '@wasm fn neg() -> Int { 0 - 42 }';
    const node = getWasmFuncNode(src);
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'neg')).toBe(-42);
  });

  test('handles boolean literals true and false', async () => {
    // Boolean true via manual AST
    const trueNode = makeFuncNode('get_true', [], makeBlock(
      makeExprStmt(makeBool(true))
    ), 'Int');
    const trueBytes = compileWasmFunction(trueNode);
    expect(isValidWasm(trueBytes)).toBe(true);
    expect(await runWasm(trueBytes, 'get_true')).toBe(1);

    const falseNode = makeFuncNode('get_false', [], makeBlock(
      makeExprStmt(makeBool(false))
    ), 'Int');
    const falseBytes = compileWasmFunction(falseNode);
    expect(await runWasm(falseBytes, 'get_false')).toBe(0);
  });
});

// ─── If/Else Tests ──────────────────────────────────────────

describe('compileWasmFunction — if/else', () => {
  test('if expression with both branches', async () => {
    const src = `@wasm fn max(a: Int, b: Int) -> Int {
      if a > b { a } else { b }
    }`;
    const node = getWasmFuncNode(src);
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'max', 5, 3)).toBe(5);
    expect(await runWasm(bytes, 'max', 3, 5)).toBe(5);
  });

  test('if statement (void) without else', async () => {
    const node = makeFuncNode('cond_set', [makeParam('x', 'Int')], makeBlock(
      makeVarDecl(['result'], [makeNum(0)]),
      {
        type: 'IfStatement',
        condition: makeBinary('>', makeId('x'), makeNum(0)),
        consequent: makeBlock(
          makeAssignment(['result'], [makeNum(1)])
        ),
        elseBody: null,
        alternates: null,
      },
      makeExprStmt(makeId('result'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'cond_set', 5)).toBe(1);
    expect(await runWasm(bytes, 'cond_set', -1)).toBe(0);
  });

  test('if statement with else', async () => {
    const node = makeFuncNode('sign', [makeParam('x', 'Int')], makeBlock(
      makeVarDecl(['result'], [makeNum(0)]),
      {
        type: 'IfStatement',
        condition: makeBinary('>', makeId('x'), makeNum(0)),
        consequent: makeBlock(
          makeAssignment(['result'], [makeNum(1)])
        ),
        elseBody: makeBlock(
          makeAssignment(['result'], [makeNum(-1)])
        ),
        alternates: null,
      },
      makeExprStmt(makeId('result'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'sign', 5)).toBe(1);
    expect(await runWasm(bytes, 'sign', -3)).toBe(-1);
  });

  test('if with elif chain (alternates) - statement form', async () => {
    // if x > 0 { result = 1 } elif x == 0 { result = 0 } else { result = -1 }
    const node = makeFuncNode('classify', [makeParam('x', 'Int')], makeBlock(
      makeVarDecl(['result'], [makeNum(0)]),
      {
        type: 'IfStatement',
        condition: makeBinary('>', makeId('x'), makeNum(0)),
        consequent: makeBlock(
          makeAssignment(['result'], [makeNum(1)])
        ),
        alternates: [
          {
            condition: makeBinary('==', makeId('x'), makeNum(0)),
            body: makeBlock(
              makeAssignment(['result'], [makeNum(0)])
            ),
          },
        ],
        elseBody: makeBlock(
          makeAssignment(['result'], [makeNum(-1)])
        ),
      },
      makeExprStmt(makeId('result'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'classify', 5)).toBe(1);
    expect(await runWasm(bytes, 'classify', 0)).toBe(0);
    expect(await runWasm(bytes, 'classify', -3)).toBe(-1);
  });

  test('if with elif chain (alternates) - expression form', async () => {
    // Function body is an if expression as the last statement
    const ifExpr = {
      type: 'IfStatement',
      condition: makeBinary('>', makeId('x'), makeNum(0)),
      consequent: makeBlock(makeExprStmt(makeNum(1))),
      alternates: [
        {
          condition: makeBinary('==', makeId('x'), makeNum(0)),
          body: makeBlock(makeExprStmt(makeNum(0))),
        },
      ],
      elseBody: makeBlock(makeExprStmt(makeNum(-1))),
    };
    const node = makeFuncNode('classifyExpr', [makeParam('x', 'Int')], makeBlock(ifExpr), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'classifyExpr', 5)).toBe(1);
    expect(await runWasm(bytes, 'classifyExpr', 0)).toBe(0);
    expect(await runWasm(bytes, 'classifyExpr', -3)).toBe(-1);
  });

  test('if expression with elif but no else (should produce default value)', async () => {
    const ifExpr = {
      type: 'IfStatement',
      condition: makeBinary('>', makeId('x'), makeNum(10)),
      consequent: makeBlock(makeExprStmt(makeNum(1))),
      alternates: [
        {
          condition: makeBinary('>', makeId('x'), makeNum(5)),
          body: makeBlock(makeExprStmt(makeNum(2))),
        },
      ],
      elseBody: null,
    };
    const node = makeFuncNode('maybeVal', [makeParam('x', 'Int')], makeBlock(ifExpr), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'maybeVal', 15)).toBe(1);
    expect(await runWasm(bytes, 'maybeVal', 7)).toBe(2);
    expect(await runWasm(bytes, 'maybeVal', 1)).toBe(0); // default
  });

  test('if expression without else (simple)', async () => {
    const ifExpr = {
      type: 'IfStatement',
      condition: makeBinary('>', makeId('x'), makeNum(0)),
      consequent: makeBlock(makeExprStmt(makeNum(42))),
      elseBody: null,
      alternates: null,
    };
    const node = makeFuncNode('maybeFortytwo', [makeParam('x', 'Int')], makeBlock(ifExpr), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'maybeFortytwo', 5)).toBe(42);
    expect(await runWasm(bytes, 'maybeFortytwo', -1)).toBe(0); // default
  });

  test('if expression without consequent (null consequent)', async () => {
    // This tests the `else { bytes.push(...this.defaultValue()); }` path in compileIfExpr
    const ifExpr = {
      type: 'IfStatement',
      condition: makeBinary('>', makeId('x'), makeNum(0)),
      consequent: null,
      elseBody: makeBlock(makeExprStmt(makeNum(99))),
      alternates: null,
    };
    const node = makeFuncNode('noConseq', [makeParam('x', 'Int')], makeBlock(ifExpr), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'noConseq', 5)).toBe(0); // default value
    expect(await runWasm(bytes, 'noConseq', -1)).toBe(99);
  });

  test('if with elif but no elseBody in statement form', async () => {
    // Tests the case where alternates exist but elseBody is null in compileIfStmt
    const node = makeFuncNode('elifNoElse', [makeParam('x', 'Int')], makeBlock(
      makeVarDecl(['result'], [makeNum(0)]),
      {
        type: 'IfStatement',
        condition: makeBinary('>', makeId('x'), makeNum(10)),
        consequent: makeBlock(makeAssignment(['result'], [makeNum(1)])),
        alternates: [{
          condition: makeBinary('>', makeId('x'), makeNum(5)),
          body: makeBlock(makeAssignment(['result'], [makeNum(2)])),
        }],
        elseBody: null,
      },
      makeExprStmt(makeId('result'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'elifNoElse', 15)).toBe(1);
    expect(await runWasm(bytes, 'elifNoElse', 7)).toBe(2);
    expect(await runWasm(bytes, 'elifNoElse', 1)).toBe(0);
  });

  test('if as expression in the middle of a block (compileExpr dispatches IfStatement)', async () => {
    // IfStatement used as an expression directly via compileExpr
    const ifExprInBinary = makeBinary(
      '+',
      {
        type: 'IfStatement',
        condition: makeBinary('>', makeId('x'), makeNum(0)),
        consequent: makeBlock(makeExprStmt(makeNum(10))),
        elseBody: makeBlock(makeExprStmt(makeNum(20))),
        alternates: null,
      },
      makeNum(5)
    );
    const node = makeFuncNode('ifInExpr', [makeParam('x', 'Int')], makeBlock(
      makeExprStmt(ifExprInBinary)
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'ifInExpr', 5)).toBe(15);
    expect(await runWasm(bytes, 'ifInExpr', -1)).toBe(25);
  });
});

// ─── While Loop Tests ───────────────────────────────────────

describe('compileWasmFunction — while loops', () => {
  test('while loop summing integers', async () => {
    const node = makeFuncNode('sum_to', [makeParam('n', 'Int')], makeBlock(
      makeVarDecl(['i'], [makeNum(0)]),
      makeVarDecl(['total'], [makeNum(0)]),
      makeWhile(
        makeBinary('<', makeId('i'), makeId('n')),
        makeBlock(
          makeAssignment(['total'], [makeBinary('+', makeId('total'), makeId('i'))]),
          makeAssignment(['i'], [makeBinary('+', makeId('i'), makeNum(1))])
        )
      ),
      makeExprStmt(makeId('total'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'sum_to', 5)).toBe(10); // 0+1+2+3+4
    expect(await runWasm(bytes, 'sum_to', 0)).toBe(0);
  });

  test('while loop with body as single statement (not block)', async () => {
    const node = makeFuncNode('count', [makeParam('n', 'Int')], makeBlock(
      makeVarDecl(['i'], [makeNum(0)]),
      makeWhile(
        makeBinary('<', makeId('i'), makeId('n')),
        { body: [makeAssignment(['i'], [makeBinary('+', makeId('i'), makeNum(1))])] }
      ),
      makeExprStmt(makeId('i'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'count', 10)).toBe(10);
  });
});

// ─── Variable Declaration & Assignment Tests ────────────────

describe('compileWasmFunction — variables', () => {
  test('var declaration with init', async () => {
    const node = makeFuncNode('get_x', [], makeBlock(
      makeVarDecl(['x'], [makeNum(42)]),
      makeExprStmt(makeId('x'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'get_x')).toBe(42);
  });

  test('var declaration without init', async () => {
    const node = makeFuncNode('get_undef', [], makeBlock(
      makeVarDecl(['x'], []),
      makeExprStmt(makeId('x'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'get_undef')).toBe(0); // default i32 is 0
  });

  test('var declaration with string target', async () => {
    // Tests the `typeof targets[i] === 'string'` branch
    const node = makeFuncNode('str_target', [], makeBlock(
      {
        type: 'VarDeclaration',
        targets: ['myvar'],  // string, not object
        values: [makeNum(7)],
      },
      makeExprStmt(makeId('myvar'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'str_target')).toBe(7);
  });

  test('assignment to existing variable', async () => {
    const node = makeFuncNode('reassign', [], makeBlock(
      makeVarDecl(['x'], [makeNum(1)]),
      makeAssignment(['x'], [makeNum(99)]),
      makeExprStmt(makeId('x'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'reassign')).toBe(99);
  });

  test('implicit variable declaration via assignment', async () => {
    // Tova allows `x = 5` without prior declaration
    const node = makeFuncNode('implicit_var', [], makeBlock(
      makeAssignment(['x'], [makeNum(42)]),
      makeExprStmt(makeId('x'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'implicit_var')).toBe(42);
  });

  test('assignment with string target name', async () => {
    const node = makeFuncNode('str_assign', [], makeBlock(
      makeVarDecl(['y'], [makeNum(0)]),
      {
        type: 'Assignment',
        targets: ['y'],  // string, not object
        values: [makeNum(88)],
      },
      makeExprStmt(makeId('y'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'str_assign')).toBe(88);
  });

  test('assignment to target without name throws', () => {
    const node = makeFuncNode('bad_assign', [], makeBlock(
      {
        type: 'Assignment',
        targets: [{ type: 'MemberExpression' }], // no name
        values: [makeNum(1)],
      }
    ), 'Int');
    expect(() => compileWasmFunction(node)).toThrow('@wasm: assignment target must be a simple identifier');
  });

  test('multiple var declarations in one statement', async () => {
    const node = makeFuncNode('multi_var', [], makeBlock(
      {
        type: 'VarDeclaration',
        targets: [{ name: 'a' }, { name: 'b' }],
        values: [makeNum(10), makeNum(20)],
      },
      makeExprStmt(makeBinary('+', makeId('a'), makeId('b')))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'multi_var')).toBe(30);
  });

  test('multiple assignments in one statement', async () => {
    const node = makeFuncNode('multi_assign', [], makeBlock(
      makeVarDecl(['a'], [makeNum(0)]),
      makeVarDecl(['b'], [makeNum(0)]),
      {
        type: 'Assignment',
        targets: [{ name: 'a' }, { name: 'b' }],
        values: [makeNum(100), makeNum(200)],
      },
      makeExprStmt(makeBinary('+', makeId('a'), makeId('b')))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'multi_assign')).toBe(300);
  });

  test('addLocal returns existing index for duplicate name', async () => {
    // This tests the `if (this.locals.has(name)) return this.locals.get(name);` branch
    const node = makeFuncNode('dup_local', [makeParam('x', 'Int')], makeBlock(
      makeVarDecl(['x'], [makeNum(99)]),  // re-declare param as local (should return same index)
      makeExprStmt(makeId('x'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    // The addLocal for 'x' returns the param index, so the set overwrites the param
    expect(await runWasm(bytes, 'dup_local', 5)).toBe(99);
  });
});

// ─── Unary Expression Tests ─────────────────────────────────

describe('compileWasmFunction — unary expressions', () => {
  test('negation of i32', async () => {
    const node = makeFuncNode('negate', [makeParam('x', 'Int')], makeBlock(
      makeExprStmt(makeUnary('-', makeId('x')))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'negate', 5)).toBe(-5);
    expect(await runWasm(bytes, 'negate', -3)).toBe(3);
  });

  test('negation of f64', async () => {
    const node = makeFuncNode('fnegate', [makeParam('x', 'Float')], makeBlock(
      makeExprStmt(makeUnary('-', makeId('x')))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'fnegate', 3.14)).toBeCloseTo(-3.14, 10);
  });

  test('not / ! operator', async () => {
    const node = makeFuncNode('lnot', [makeParam('x', 'Int')], makeBlock(
      makeExprStmt(makeUnary('not', makeId('x')))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'lnot', 0)).toBe(1);
    expect(await runWasm(bytes, 'lnot', 1)).toBe(0);
    expect(await runWasm(bytes, 'lnot', 42)).toBe(0);
  });

  test('! (bang) operator', async () => {
    const node = makeFuncNode('bang', [makeParam('x', 'Int')], makeBlock(
      makeExprStmt(makeUnary('!', makeId('x')))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'bang', 0)).toBe(1);
    expect(await runWasm(bytes, 'bang', 1)).toBe(0);
  });

  test('unsupported unary operator throws', () => {
    const node = makeFuncNode('bad_unary', [makeParam('x', 'Int')], makeBlock(
      makeExprStmt(makeUnary('~', makeId('x')))
    ), 'Int');
    expect(() => compileWasmFunction(node)).toThrow("@wasm: unsupported unary operator '~'");
  });
});

// ─── Logical Expression Tests ───────────────────────────────

describe('compileWasmFunction — logical expressions', () => {
  test('and operator', async () => {
    const node = makeFuncNode('land', [makeParam('a', 'Int'), makeParam('b', 'Int')], makeBlock(
      makeExprStmt(makeLogical('and', makeId('a'), makeId('b')))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'land', 1, 2)).toBe(2); // truthy && truthy = right
    expect(await runWasm(bytes, 'land', 0, 2)).toBe(0); // falsy && x = 0
  });

  test('&& operator', async () => {
    const node = makeFuncNode('land2', [makeParam('a', 'Int'), makeParam('b', 'Int')], makeBlock(
      makeExprStmt(makeLogical('&&', makeId('a'), makeId('b')))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'land2', 1, 3)).toBe(3);
    expect(await runWasm(bytes, 'land2', 0, 3)).toBe(0);
  });

  test('or operator', async () => {
    const node = makeFuncNode('lor', [makeParam('a', 'Int'), makeParam('b', 'Int')], makeBlock(
      makeExprStmt(makeLogical('or', makeId('a'), makeId('b')))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'lor', 1, 2)).toBe(1); // truthy || x = 1
    expect(await runWasm(bytes, 'lor', 0, 5)).toBe(5); // falsy || x = right
    expect(await runWasm(bytes, 'lor', 0, 0)).toBe(0); // both falsy = 0
  });

  test('|| operator', async () => {
    const node = makeFuncNode('lor2', [makeParam('a', 'Int'), makeParam('b', 'Int')], makeBlock(
      makeExprStmt(makeLogical('||', makeId('a'), makeId('b')))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'lor2', 0, 7)).toBe(7);
    expect(await runWasm(bytes, 'lor2', 3, 7)).toBe(1);
  });
});

// ─── Function Call Tests ────────────────────────────────────

describe('compileWasmFunction — calls', () => {
  test('recursive function call (fibonacci)', async () => {
    const src = `@wasm fn fib(n: Int) -> Int {
      if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
    }`;
    const node = getWasmFuncNode(src);
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'fib', 0)).toBe(0);
    expect(await runWasm(bytes, 'fib', 1)).toBe(1);
    expect(await runWasm(bytes, 'fib', 10)).toBe(55);
  });

  test('call to non-existent function throws', () => {
    const node = makeFuncNode('bad_call', [], makeBlock(
      makeExprStmt(makeCall('unknown_fn', [makeNum(1)]))
    ), 'Int');
    expect(() => compileWasmFunction(node)).toThrow("@wasm: undefined function 'unknown_fn'");
  });

  test('call without callee name throws', () => {
    const node = makeFuncNode('no_callee', [], makeBlock(
      makeExprStmt({
        type: 'CallExpression',
        callee: {}, // no name
        arguments: [],
      })
    ), 'Int');
    expect(() => compileWasmFunction(node)).toThrow('@wasm: only direct function calls are supported');
  });
});

// ─── Return Statement Tests ─────────────────────────────────

describe('compileWasmFunction — return statements', () => {
  test('explicit return with value', async () => {
    const node = makeFuncNode('ret_val', [makeParam('x', 'Int')], makeBlock(
      makeReturn(makeBinary('+', makeId('x'), makeNum(1)))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'ret_val', 5)).toBe(6);
  });

  test('return without value', async () => {
    // return with no value in last position
    const node = makeFuncNode('ret_void', [], makeBlock(
      makeReturn(null)
    ), 'Int');
    // This should compile (return pushes OP.return)
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);
  });

  test('return in middle of block (non-last statement)', async () => {
    const node = makeFuncNode('early_ret', [makeParam('x', 'Int')], makeBlock(
      {
        type: 'ReturnStatement',
        value: makeId('x'),
      },
      makeExprStmt(makeNum(99)) // unreachable
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'early_ret', 42)).toBe(42);
  });

  test('return as last statement in compileBlockValue', async () => {
    // Tests the ReturnStatement branch in compileBlockValue
    const ifExpr = {
      type: 'IfStatement',
      condition: makeBinary('>', makeId('x'), makeNum(0)),
      consequent: makeBlock(
        makeReturn(makeNum(1))
      ),
      elseBody: makeBlock(
        makeReturn(makeNum(-1))
      ),
      alternates: null,
    };
    const node = makeFuncNode('retInBlock', [makeParam('x', 'Int')], makeBlock(ifExpr), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'retInBlock', 5)).toBe(1);
    expect(await runWasm(bytes, 'retInBlock', -1)).toBe(-1);
  });
});

// ─── Block & Expression body Tests ──────────────────────────

describe('compileWasmFunction — blocks and expression body', () => {
  test('empty block returns default value', async () => {
    const node = makeFuncNode('empty_block', [], makeBlock(), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'empty_block')).toBe(0);
  });

  test('empty block with Float return type returns 0.0', async () => {
    const node = makeFuncNode('empty_float', [], makeBlock(), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'empty_float')).toBe(0.0);
  });

  test('expression body (not BlockStatement)', async () => {
    // Body is just an expression, not a BlockStatement
    const node = makeFuncNode('expr_body', [makeParam('x', 'Int')],
      makeBinary('+', makeId('x'), makeNum(1)),
      'Int'
    );
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'expr_body', 5)).toBe(6);
  });

  test('block with non-expression last stmt adds default value', async () => {
    // Last statement is a WhileStatement (not expression/return/if), triggers default value
    const node = makeFuncNode('while_last', [], makeBlock(
      makeVarDecl(['i'], [makeNum(0)]),
      makeWhile(makeBinary('<', makeId('i'), makeNum(3)),
        makeBlock(makeAssignment(['i'], [makeBinary('+', makeId('i'), makeNum(1))]))
      )
    ), 'Int');
    const bytes = compileWasmFunction(node);
    // while loop is last statement; default value (i32.const 0) is appended
    expect(await runWasm(bytes, 'while_last')).toBe(0);
  });

  test('ExpressionStatement in middle of block drops value', async () => {
    // Non-last ExpressionStatement should have OP.drop
    const node = makeFuncNode('drop_mid', [makeParam('x', 'Int')], makeBlock(
      makeExprStmt(makeBinary('+', makeId('x'), makeNum(1))),
      makeExprStmt(makeId('x'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'drop_mid', 10)).toBe(10);
  });

  test('compileBlockValue with expression body (not BlockStatement)', () => {
    // Tests `compileBlockValue` when given a non-BlockStatement (falls through to compileExpr)
    // This is tested via if expression with single-expression branches
    const ifExpr = {
      type: 'IfStatement',
      condition: makeBool(true),
      consequent: makeNum(42), // not a BlockStatement!
      elseBody: makeNum(0),
      alternates: null,
    };
    const node = makeFuncNode('block_val_expr', [], makeBlock(ifExpr), 'Int');
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);
  });

  test('compileBlockValue with IfStatement as last', async () => {
    // Test IfStatement branch in compileBlockValue
    const innerIf = {
      type: 'IfStatement',
      condition: makeBinary('>', makeId('x'), makeNum(0)),
      consequent: makeBlock(makeExprStmt(makeNum(1))),
      elseBody: makeBlock(makeExprStmt(makeNum(2))),
      alternates: null,
    };
    const outerIf = {
      type: 'IfStatement',
      condition: makeBool(true),
      consequent: makeBlock(
        makeVarDecl(['y'], [makeNum(5)]),
        innerIf // IfStatement as last in compileBlockValue
      ),
      elseBody: makeBlock(makeExprStmt(makeNum(0))),
      alternates: null,
    };
    const node = makeFuncNode('nested_if', [makeParam('x', 'Int')], makeBlock(outerIf), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'nested_if', 5)).toBe(1);
    expect(await runWasm(bytes, 'nested_if', -1)).toBe(2);
  });

  test('compileBlockValue — non-expression/return/if last stmt adds default', async () => {
    // Last statement in a block value context is a WhileStatement
    const outerIf = {
      type: 'IfStatement',
      condition: makeBool(true),
      consequent: makeBlock(
        makeVarDecl(['i'], [makeNum(0)]),
        makeWhile(makeBinary('<', makeId('i'), makeNum(1)),
          makeBlock(makeAssignment(['i'], [makeBinary('+', makeId('i'), makeNum(1))]))
        )
        // while is last stmt — defaultValue should be appended
      ),
      elseBody: makeBlock(makeExprStmt(makeNum(0))),
      alternates: null,
    };
    const node = makeFuncNode('while_in_block_val', [], makeBlock(outerIf), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'while_in_block_val')).toBe(0);
  });

  test('compileBlockValue — empty block returns default', async () => {
    const outerIf = {
      type: 'IfStatement',
      condition: makeBool(true),
      consequent: makeBlock(), // empty block
      elseBody: makeBlock(makeExprStmt(makeNum(99))),
      alternates: null,
    };
    const node = makeFuncNode('empty_in_blockval', [], makeBlock(outerIf), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'empty_in_blockval')).toBe(0);
  });

  test('BlockStatement as expression in compileExpr', async () => {
    // Tests the 'BlockStatement' case in compileExpr
    // Use a block as an expression
    const blockExpr = makeBlock(makeExprStmt(makeNum(42)));
    const node = makeFuncNode('block_expr', [], makeBlock(
      makeExprStmt(blockExpr) // BlockStatement in expression context; compileExpr handles it
    ), 'Int');
    // This gets compiled through compileExpr -> compileBlockAsValue
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);
  });
});

// ─── Type Inference Tests ───────────────────────────────────

describe('compileWasmFunction — type inference', () => {
  test('infers Float type for float literal', async () => {
    const node = makeFuncNode('float_lit', [], makeBlock(
      makeVarDecl(['x'], [makeNum(3.14)]),
      makeExprStmt(makeId('x'))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'float_lit')).toBeCloseTo(3.14, 2);
  });

  test('infers i32 for integer literal', async () => {
    const node = makeFuncNode('int_lit', [], makeBlock(
      makeVarDecl(['x'], [makeNum(42)]),
      makeExprStmt(makeId('x'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'int_lit')).toBe(42);
  });

  test('mixed int and float promotes to float', async () => {
    const node = makeFuncNode('mixed', [makeParam('a', 'Int'), makeParam('b', 'Float')], makeBlock(
      makeExprStmt(makeBinary('+', makeId('a'), makeId('b')))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'mixed', 3, 2.5)).toBeCloseTo(5.5, 10);
  });

  test('comparison operators always infer i32', () => {
    // Test inferType for BinaryExpression with comparison operators
    const node = makeFuncNode('cmp_infer', [makeParam('a', 'Float'), makeParam('b', 'Float')], makeBlock(
      // a < b returns i32 even though operands are f64
      makeVarDecl(['result'], [makeBinary('<', makeId('a'), makeId('b'))]),
      makeExprStmt(makeId('result'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);
  });

  test('inferType for BooleanLiteral returns I32', () => {
    // Boolean has a special inferType case
    const node = makeFuncNode('bool_infer', [], makeBlock(
      makeVarDecl(['x'], [makeBool(true)]),
      makeExprStmt(makeId('x'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);
  });

  test('inferType for UnaryExpression', () => {
    // Unary expression type = type of operand
    const node = makeFuncNode('unary_infer', [makeParam('x', 'Float')], makeBlock(
      makeVarDecl(['neg'], [makeUnary('-', makeId('x'))]),
      makeExprStmt(makeId('neg'))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);
  });

  test('inferType for CallExpression returns function returnType', () => {
    // The inferType for CallExpression returns `this.returnType || I32`
    const node = makeFuncNode('call_infer', [makeParam('n', 'Int')], makeBlock(
      makeVarDecl(['x'], [makeCall('call_infer', [makeId('n')])]),
      makeExprStmt(makeId('x'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);
  });

  test('inferType returns I32 for unknown node types', () => {
    // Tests the `default: return I32` branch in inferType
    const node = makeFuncNode('unknown_infer', [], makeBlock(
      // Create a VarDeclaration with an unknown-typed init expression
      {
        type: 'VarDeclaration',
        targets: [{ name: 'x' }],
        values: [{ type: 'SomethingWeird', value: 42 }],
      },
    ), 'Int');
    // The inferType should return I32 for unknown type
    // But compileExpr will throw for unsupported expression
    expect(() => compileWasmFunction(node)).toThrow("@wasm: unsupported expression type 'SomethingWeird'");
  });

  test('inferType with null node returns I32', () => {
    // Tests `if (!node) return I32;`
    const node = makeFuncNode('null_infer', [], makeBlock(
      {
        type: 'VarDeclaration',
        targets: [{ name: 'x' }],
        values: [null], // null init
      },
      makeExprStmt(makeId('x'))
    ), 'Int');
    // null init → no compileExpr call, just addLocal with type I32
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);
  });
});

// ─── Type Mapping Tests ─────────────────────────────────────

describe('tovaTypeToWasm (via paramTypes)', () => {
  test('Int maps to i32', async () => {
    const node = getWasmFuncNode('@wasm fn f(a: Int) -> Int { a }');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'f', 42)).toBe(42);
  });

  test('Float maps to f64', async () => {
    const node = getWasmFuncNode('@wasm fn f(a: Float) -> Float { a }');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'f', 3.14)).toBeCloseTo(3.14, 10);
  });

  test('Bool maps to i32', async () => {
    const node = makeFuncNode('fbool', [makeParam('a', 'Bool')], makeBlock(
      makeExprStmt(makeId('a'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'fbool', 1)).toBe(1);
  });

  test('various type string aliases', () => {
    // Test through manual node construction with different type annotations
    for (const typeStr of ['int', 'i32', 'bool', 'Number', 'float', 'f64']) {
      const node = makeFuncNode('typed', [makeParam('a', typeStr)], makeBlock(
        makeExprStmt(makeId('a'))
      ), typeStr);
      const bytes = compileWasmFunction(node);
      expect(isValidWasm(bytes)).toBe(true);
    }
  });

  test('unknown type defaults to i32', () => {
    const node = makeFuncNode('unk', [makeParam('a', 'String')], makeBlock(
      makeExprStmt(makeId('a'))
    ), 'String');
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);
  });

  test('null type annotation defaults to i32', () => {
    const node = makeFuncNode('noType', [makeParam('a', null)], makeBlock(
      makeExprStmt(makeId('a'))
    ), null);
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);
  });

  test('object type annotation with name', () => {
    const node = makeFuncNode('objType', [makeParam('a', { name: 'Float' })], makeBlock(
      makeExprStmt(makeId('a'))
    ), { name: 'Float' });
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);
  });

  test('object type annotation with value', () => {
    const node = makeFuncNode('valType', [makeParam('a', { value: 'Int' })], makeBlock(
      makeExprStmt(makeId('a'))
    ), { value: 'Int' });
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);
  });

  test('object type annotation without name or value (uses String(typeStr))', () => {
    const node = makeFuncNode('weirdType', [makeParam('a', { toString() { return 'Int'; } })], makeBlock(
      makeExprStmt(makeId('a'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);
  });

  test('param without name uses _', () => {
    const node = makeFuncNode('noParamName', [{ type: 'Parameter', name: null, typeAnnotation: 'Int' }], makeBlock(
      makeExprStmt(makeNum(42))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);
  });
});

// ─── Error Handling Tests ───────────────────────────────────

describe('compileWasmFunction — errors', () => {
  test('unsupported statement type throws', () => {
    const node = makeFuncNode('bad_stmt', [], makeBlock(
      { type: 'ForStatement', condition: makeBool(true), body: makeBlock() }
    ), 'Int');
    expect(() => compileWasmFunction(node)).toThrow("@wasm: unsupported statement type 'ForStatement'");
  });

  test('unsupported expression type throws', () => {
    const node = makeFuncNode('bad_expr', [], makeBlock(
      makeExprStmt({ type: 'TemplateLiteral', parts: [] })
    ), 'Int');
    expect(() => compileWasmFunction(node)).toThrow("@wasm: unsupported expression type 'TemplateLiteral'");
  });

  test('unsupported binary operator throws', () => {
    const node = makeFuncNode('bad_binop', [makeParam('a', 'Int'), makeParam('b', 'Int')], makeBlock(
      makeExprStmt(makeBinary('**', makeId('a'), makeId('b')))
    ), 'Int');
    expect(() => compileWasmFunction(node)).toThrow("@wasm: unsupported binary operator '**'");
  });

  test('undefined variable throws', () => {
    const node = makeFuncNode('undef_var', [], makeBlock(
      makeExprStmt(makeId('nonexistent'))
    ), 'Int');
    expect(() => compileWasmFunction(node)).toThrow("@wasm: undefined variable 'nonexistent'");
  });
});

// ─── compileWasmModule Tests ────────────────────────────────

describe('compileWasmModule', () => {
  test('single function delegates to compileWasmFunction', async () => {
    const node = getWasmFuncNode('@wasm fn single(a: Int) -> Int { a + 1 }');
    const bytes = compileWasmModule([node]);
    expect(isValidWasm(bytes)).toBe(true);
    expect(await runWasm(bytes, 'single', 5)).toBe(6);
  });

  test('multiple functions in one module', async () => {
    const src = `
      @wasm fn add(a: Int, b: Int) -> Int { a + b }
      @wasm fn mul(a: Int, b: Int) -> Int { a * b }
    `;
    const nodes = getAllWasmFuncNodes(src);
    expect(nodes.length).toBe(2);
    const bytes = compileWasmModule(nodes);
    expect(isValidWasm(bytes)).toBe(true);

    const module = new WebAssembly.Module(bytes);
    const instance = new WebAssembly.Instance(module);
    expect(instance.exports.add(3, 5)).toBe(8);
    expect(instance.exports.mul(3, 5)).toBe(15);
  });

  test('multiple functions can call each other', async () => {
    const src = `
      @wasm fn double(x: Int) -> Int { x + x }
      @wasm fn quadruple(x: Int) -> Int { double(double(x)) }
    `;
    const nodes = getAllWasmFuncNodes(src);
    const bytes = compileWasmModule(nodes);
    const module = new WebAssembly.Module(bytes);
    const instance = new WebAssembly.Instance(module);
    expect(instance.exports.double(5)).toBe(10);
    expect(instance.exports.quadruple(3)).toBe(12);
  });

  test('module with float functions', async () => {
    const src = `
      @wasm fn fadd(a: Float, b: Float) -> Float { a + b }
      @wasm fn fmul(a: Float, b: Float) -> Float { a * b }
    `;
    const nodes = getAllWasmFuncNodes(src);
    const bytes = compileWasmModule(nodes);
    const module = new WebAssembly.Module(bytes);
    const instance = new WebAssembly.Instance(module);
    expect(instance.exports.fadd(1.5, 2.5)).toBe(4.0);
    expect(instance.exports.fmul(2.0, 3.5)).toBe(7.0);
  });

  test('module with void return (no returnType)', async () => {
    const src = `
      @wasm fn nop1(a: Int) -> Int { a }
      @wasm fn nop2(a: Int) -> Int { a }
    `;
    const nodes = getAllWasmFuncNodes(src);
    const bytes = compileWasmModule(nodes);
    expect(isValidWasm(bytes)).toBe(true);
  });
});

// ─── Glue Code Generation Tests ─────────────────────────────

describe('generateWasmGlue', () => {
  test('generates JS glue code for a function', () => {
    const node = getWasmFuncNode('@wasm fn add(a: Int, b: Int) -> Int { a + b }');
    const bytes = compileWasmFunction(node);
    const glue = generateWasmGlue(node, bytes);

    expect(glue).toContain('const add = new WebAssembly.Instance');
    expect(glue).toContain('new WebAssembly.Module');
    expect(glue).toContain('new Uint8Array([');
    expect(glue).toContain('.exports.add');
    expect(glue).toMatch(/const add = .+\.exports\.add;/);
  });

  test('generates correct bytes in the array', () => {
    const node = getWasmFuncNode('@wasm fn id(x: Int) -> Int { x }');
    const bytes = compileWasmFunction(node);
    const glue = generateWasmGlue(node, bytes);
    // Should contain the WASM magic number bytes
    expect(glue).toContain('0,97,115,109');
  });
});

describe('generateWasmBytesExport', () => {
  test('generates __wasm_bytes_ constant', () => {
    const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
    const code = generateWasmBytesExport('myfunc', bytes);
    expect(code).toBe('const __wasm_bytes_myfunc = new Uint8Array([0,97,115,109,1,0,0,0]);');
  });

  test('generates correct format with actual compiled bytes', () => {
    const node = getWasmFuncNode('@wasm fn add(a: Int, b: Int) -> Int { a + b }');
    const bytes = compileWasmFunction(node);
    const code = generateWasmBytesExport('add', bytes);
    expect(code).toMatch(/^const __wasm_bytes_add = new Uint8Array\(\[.+\]\);$/);
    expect(code).toContain('0,97,115,109'); // magic number
  });
});

describe('generateMultiWasmGlue', () => {
  test('generates destructuring glue code', () => {
    const src = `
      @wasm fn add(a: Int, b: Int) -> Int { a + b }
      @wasm fn sub(a: Int, b: Int) -> Int { a - b }
    `;
    const nodes = getAllWasmFuncNodes(src);
    const bytes = compileWasmModule(nodes);
    const glue = generateMultiWasmGlue(nodes, bytes);

    expect(glue).toContain('const { add, sub }');
    expect(glue).toContain('new WebAssembly.Instance');
    expect(glue).toContain('new WebAssembly.Module');
    expect(glue).toContain('.exports');
  });
});

// ─── encodeLocalDecls Tests (via compiled output) ───────────

describe('encodeLocalDecls — via local variables', () => {
  test('no locals (params only)', async () => {
    const node = getWasmFuncNode('@wasm fn identity(x: Int) -> Int { x }');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'identity', 42)).toBe(42);
  });

  test('single local (one type group)', async () => {
    const node = makeFuncNode('one_local', [], makeBlock(
      makeVarDecl(['x'], [makeNum(5)]),
      makeExprStmt(makeId('x'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'one_local')).toBe(5);
  });

  test('multiple locals of same type (one group)', async () => {
    const node = makeFuncNode('same_type', [], makeBlock(
      makeVarDecl(['a'], [makeNum(1)]),
      makeVarDecl(['b'], [makeNum(2)]),
      makeVarDecl(['c'], [makeNum(3)]),
      makeExprStmt(makeBinary('+', makeBinary('+', makeId('a'), makeId('b')), makeId('c')))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'same_type')).toBe(6);
  });

  test('multiple locals of different types (multiple groups)', async () => {
    const node = makeFuncNode('diff_types', [], makeBlock(
      makeVarDecl(['a'], [makeNum(10)]),        // i32
      makeVarDecl(['b'], [makeNum(3.14)]),      // f64
      makeVarDecl(['c'], [makeNum(20)]),        // i32
      makeExprStmt(makeId('a'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'diff_types')).toBe(10);
  });
});

// ─── Mixed i32/f64 Arithmetic ───────────────────────────────

describe('mixed i32/f64 arithmetic with conversion', () => {
  test('int + float promotes int to float', async () => {
    const node = makeFuncNode('int_plus_float', [makeParam('a', 'Int'), makeParam('b', 'Float')], makeBlock(
      makeExprStmt(makeBinary('+', makeId('a'), makeId('b')))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'int_plus_float', 3, 2.5)).toBeCloseTo(5.5, 10);
  });

  test('float + int promotes int to float', async () => {
    const node = makeFuncNode('float_plus_int', [makeParam('a', 'Float'), makeParam('b', 'Int')], makeBlock(
      makeExprStmt(makeBinary('+', makeId('a'), makeId('b')))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'float_plus_int', 2.5, 3)).toBeCloseTo(5.5, 10);
  });

  test('int * float conversion', async () => {
    const node = makeFuncNode('int_mul_float', [makeParam('a', 'Int'), makeParam('b', 'Float')], makeBlock(
      makeExprStmt(makeBinary('*', makeId('a'), makeId('b')))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'int_mul_float', 3, 2.5)).toBeCloseTo(7.5, 10);
  });

  test('int - float conversion', async () => {
    const node = makeFuncNode('int_sub_float', [makeParam('a', 'Int'), makeParam('b', 'Float')], makeBlock(
      makeExprStmt(makeBinary('-', makeId('a'), makeId('b')))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'int_sub_float', 5, 1.5)).toBeCloseTo(3.5, 10);
  });

  test('int / float conversion', async () => {
    const node = makeFuncNode('int_div_float', [makeParam('a', 'Int'), makeParam('b', 'Float')], makeBlock(
      makeExprStmt(makeBinary('/', makeId('a'), makeId('b')))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'int_div_float', 10, 4.0)).toBeCloseTo(2.5, 10);
  });
});

// ─── Number Literal Encoding ────────────────────────────────

describe('number literal encoding', () => {
  test('small integer uses i32.const', async () => {
    const node = makeFuncNode('small', [], makeBlock(
      makeExprStmt(makeNum(0))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'small')).toBe(0);
  });

  test('negative integer uses sleb128', async () => {
    const node = makeFuncNode('neg', [], makeBlock(
      makeExprStmt(makeNum(-42))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    // -42 is encoded in sleb128 as [86] which is valid
    expect(isValidWasm(bytes)).toBe(true);
  });

  test('large integer near i32 boundary', async () => {
    const node = makeFuncNode('large', [], makeBlock(
      makeExprStmt(makeNum(2147483647))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'large')).toBe(2147483647);
  });

  test('float literal uses f64.const', async () => {
    const node = makeFuncNode('pi', [], makeBlock(
      makeExprStmt(makeNum(3.14159265358979))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'pi')).toBeCloseTo(3.14159265358979, 10);
  });

  test('very large number exceeding i32 range uses f64', async () => {
    const node = makeFuncNode('big', [], makeBlock(
      makeExprStmt(makeNum(3000000000))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'big')).toBeCloseTo(3000000000, 0);
  });

  test('negative large number', async () => {
    const node = makeFuncNode('neg_large', [], makeBlock(
      makeExprStmt(makeNum(-2147483648))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'neg_large')).toBe(-2147483648);
  });
});

// ─── typeOf Tests ───────────────────────────────────────────

describe('typeOf (WasmFuncContext)', () => {
  test('typeOf for undefined name returns I32', async () => {
    // When getLocal returns undefined, typeOf returns I32
    // This happens when inferType uses typeOf for an identifier
    // that isn't yet declared. We test via implicit assignment.
    const node = makeFuncNode('typeof_undef', [], makeBlock(
      // Assign to a new variable (implicit declaration) — inferType calls typeOf which returns I32
      makeAssignment(['newvar'], [makeNum(42)]),
      makeExprStmt(makeId('newvar'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'typeof_undef')).toBe(42);
  });

  test('typeOf for param returns param type', async () => {
    const node = makeFuncNode('typeof_param', [makeParam('x', 'Float')], makeBlock(
      makeExprStmt(makeId('x'))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'typeof_param', 3.14)).toBeCloseTo(3.14, 10);
  });

  test('typeOf for local returns local type', async () => {
    const node = makeFuncNode('typeof_local', [makeParam('a', 'Int')], makeBlock(
      makeVarDecl(['x'], [makeNum(3.14)]), // local at index 1, type F64
      makeExprStmt(makeId('x'))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'typeof_local', 0)).toBeCloseTo(3.14, 10);
  });
});

// ─── Complex Integration Tests ──────────────────────────────

describe('complex @wasm programs', () => {
  test('factorial (recursive)', async () => {
    const src = `@wasm fn factorial(n: Int) -> Int {
      if n <= 1 { 1 } else { n * factorial(n - 1) }
    }`;
    const node = getWasmFuncNode(src);
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'factorial', 0)).toBe(1);
    expect(await runWasm(bytes, 'factorial', 1)).toBe(1);
    expect(await runWasm(bytes, 'factorial', 5)).toBe(120);
    expect(await runWasm(bytes, 'factorial', 10)).toBe(3628800);
  });

  test('GCD (euclidean algorithm with while)', async () => {
    const node = makeFuncNode('gcd', [makeParam('a', 'Int'), makeParam('b', 'Int')], makeBlock(
      makeWhile(
        makeBinary('!=', makeId('b'), makeNum(0)),
        makeBlock(
          makeVarDecl(['temp'], [makeId('b')]),
          makeAssignment(['b'], [makeBinary('%', makeId('a'), makeId('b'))]),
          makeAssignment(['a'], [makeId('temp')])
        )
      ),
      makeExprStmt(makeId('a'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'gcd', 12, 8)).toBe(4);
    expect(await runWasm(bytes, 'gcd', 100, 75)).toBe(25);
  });

  test('nested if/else with while', async () => {
    const src = `@wasm fn collatz_steps(n: Int) -> Int {
      steps = 0
      while n != 1 {
        if n % 2 == 0 {
          n = n / 2
        } else {
          n = n * 3 + 1
        }
        steps = steps + 1
      }
      steps
    }`;
    const node = getWasmFuncNode(src);
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'collatz_steps', 1)).toBe(0);
    expect(await runWasm(bytes, 'collatz_steps', 2)).toBe(1);
    expect(await runWasm(bytes, 'collatz_steps', 6)).toBe(8);
  });

  test('power function (iterative)', async () => {
    const node = makeFuncNode('power', [makeParam('base', 'Int'), makeParam('exp', 'Int')], makeBlock(
      makeVarDecl(['result'], [makeNum(1)]),
      makeVarDecl(['i'], [makeNum(0)]),
      makeWhile(
        makeBinary('<', makeId('i'), makeId('exp')),
        makeBlock(
          makeAssignment(['result'], [makeBinary('*', makeId('result'), makeId('base'))]),
          makeAssignment(['i'], [makeBinary('+', makeId('i'), makeNum(1))])
        )
      ),
      makeExprStmt(makeId('result'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'power', 2, 10)).toBe(1024);
    expect(await runWasm(bytes, 'power', 3, 4)).toBe(81);
  });
});

// ─── Return Statement in compileStatement (non-last position) ──

describe('ReturnStatement in compileStatement', () => {
  test('return with value in non-last position', async () => {
    const node = makeFuncNode('early', [makeParam('x', 'Int')], makeBlock(
      {
        type: 'IfStatement',
        condition: makeBinary('<', makeId('x'), makeNum(0)),
        consequent: makeBlock(
          { type: 'ReturnStatement', value: makeNum(-1) }
        ),
        elseBody: null,
        alternates: null,
      },
      makeExprStmt(makeId('x'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'early', -5)).toBe(-1);
    expect(await runWasm(bytes, 'early', 5)).toBe(5);
  });

  test('return without value in non-last position', async () => {
    const node = makeFuncNode('retNoVal', [], makeBlock(
      {
        type: 'ReturnStatement',
        value: null,
      },
      makeExprStmt(makeNum(42))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);
  });
});

// ─── compileBlockValue with return without value ────────────

describe('compileBlockValue — return without value', () => {
  test('return with null value in block value context', () => {
    const outerIf = {
      type: 'IfStatement',
      condition: makeBool(true),
      consequent: makeBlock(
        makeReturn(null) // Return without value
      ),
      elseBody: makeBlock(makeExprStmt(makeNum(0))),
      alternates: null,
    };
    const node = makeFuncNode('retNullBlockVal', [], makeBlock(outerIf), 'Int');
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);
  });
});

// ─── f64 Comparison Operators ───────────────────────────────

describe('f64 comparison operators', () => {
  test('f64 equality', async () => {
    const node = makeFuncNode('feq', [makeParam('a', 'Float'), makeParam('b', 'Float')], makeBlock(
      makeExprStmt(makeBinary('==', makeId('a'), makeId('b')))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'feq', 1.5, 1.5)).toBe(1);
    expect(await runWasm(bytes, 'feq', 1.5, 2.5)).toBe(0);
  });

  test('f64 inequality', async () => {
    const node = makeFuncNode('fne', [makeParam('a', 'Float'), makeParam('b', 'Float')], makeBlock(
      makeExprStmt(makeBinary('!=', makeId('a'), makeId('b')))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'fne', 1.5, 2.5)).toBe(1);
    expect(await runWasm(bytes, 'fne', 1.5, 1.5)).toBe(0);
  });

  test('f64 less than', async () => {
    const node = makeFuncNode('flt', [makeParam('a', 'Float'), makeParam('b', 'Float')], makeBlock(
      makeExprStmt(makeBinary('<', makeId('a'), makeId('b')))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'flt', 1.0, 2.0)).toBe(1);
    expect(await runWasm(bytes, 'flt', 2.0, 1.0)).toBe(0);
  });

  test('f64 greater than', async () => {
    const node = makeFuncNode('fgt', [makeParam('a', 'Float'), makeParam('b', 'Float')], makeBlock(
      makeExprStmt(makeBinary('>', makeId('a'), makeId('b')))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'fgt', 2.0, 1.0)).toBe(1);
    expect(await runWasm(bytes, 'fgt', 1.0, 2.0)).toBe(0);
  });

  test('f64 less or equal', async () => {
    const node = makeFuncNode('fle', [makeParam('a', 'Float'), makeParam('b', 'Float')], makeBlock(
      makeExprStmt(makeBinary('<=', makeId('a'), makeId('b')))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'fle', 1.0, 2.0)).toBe(1);
    expect(await runWasm(bytes, 'fle', 1.0, 1.0)).toBe(1);
    expect(await runWasm(bytes, 'fle', 2.0, 1.0)).toBe(0);
  });

  test('f64 greater or equal', async () => {
    const node = makeFuncNode('fge', [makeParam('a', 'Float'), makeParam('b', 'Float')], makeBlock(
      makeExprStmt(makeBinary('>=', makeId('a'), makeId('b')))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'fge', 2.0, 1.0)).toBe(1);
    expect(await runWasm(bytes, 'fge', 1.0, 1.0)).toBe(1);
    expect(await runWasm(bytes, 'fge', 1.0, 2.0)).toBe(0);
  });
});

// ─── f64 Arithmetic Operators ───────────────────────────────

describe('f64 arithmetic operators', () => {
  test('f64 subtraction', async () => {
    const node = makeFuncNode('fsub', [makeParam('a', 'Float'), makeParam('b', 'Float')], makeBlock(
      makeExprStmt(makeBinary('-', makeId('a'), makeId('b')))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'fsub', 5.5, 2.5)).toBeCloseTo(3.0, 10);
  });

  test('f64 multiplication', async () => {
    const node = makeFuncNode('fmul', [makeParam('a', 'Float'), makeParam('b', 'Float')], makeBlock(
      makeExprStmt(makeBinary('*', makeId('a'), makeId('b')))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'fmul', 2.5, 3.0)).toBeCloseTo(7.5, 10);
  });

  test('f64 division', async () => {
    const node = makeFuncNode('fdiv', [makeParam('a', 'Float'), makeParam('b', 'Float')], makeBlock(
      makeExprStmt(makeBinary('/', makeId('a'), makeId('b')))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'fdiv', 7.5, 2.5)).toBeCloseTo(3.0, 10);
  });
});

// ─── Default Value Tests ────────────────────────────────────

describe('defaultValue', () => {
  test('i32 default value is 0', async () => {
    const node = makeFuncNode('default_i32', [], makeBlock(), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'default_i32')).toBe(0);
  });

  test('f64 default value is 0.0', async () => {
    const node = makeFuncNode('default_f64', [], makeBlock(), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'default_f64')).toBe(0.0);
  });
});

// ─── addLocal with explicit wasmType vs default ─────────────

describe('addLocal', () => {
  test('addLocal without wasmType defaults to I32', async () => {
    // Test by assigning a variable with no init (inferType returns I32)
    const node = makeFuncNode('no_type_local', [], makeBlock(
      {
        type: 'VarDeclaration',
        targets: [{ name: 'x' }],
        values: [], // no init, so no inferType call; addLocal gets null/undefined wt
      },
      makeExprStmt(makeId('x'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'no_type_local')).toBe(0);
  });
});

// ─── inferType - BinaryExpression with all comparison ops ───

describe('inferType — comparison operators return I32', () => {
  const compOps = ['==', '!=', '<', '>', '<=', '>='];
  for (const op of compOps) {
    test(`${op} infers I32 even for float operands`, () => {
      const node = makeFuncNode(`cmp_${op.replace(/[^a-z]/g, '')}`, [makeParam('a', 'Float'), makeParam('b', 'Float')], makeBlock(
        makeVarDecl(['r'], [makeBinary(op, makeId('a'), makeId('b'))]),
        makeExprStmt(makeId('r'))
      ), 'Int');
      const bytes = compileWasmFunction(node);
      expect(isValidWasm(bytes)).toBe(true);
    });
  }
});

// ─── Full end-to-end via compile() ──────────────────────────

describe('full end-to-end pipeline', () => {
  test('compiled @wasm function can be instantiated from generated JS', async () => {
    const js = getShared('@wasm fn add(a: Int, b: Int) -> Int { a + b }');
    // The generated JS should be executable
    expect(js).toContain('__wasm_bytes_add');
    expect(js).toContain('WebAssembly.Instance');
    expect(js).toContain('WebAssembly.Module');

    // Extract the Uint8Array content and verify it's valid WASM
    const match = js.match(/new Uint8Array\(\[([^\]]+)\]\)/);
    expect(match).toBeTruthy();
    const bytesArray = match[1].split(',').map(Number);
    expect(bytesArray[0]).toBe(0);   // \0
    expect(bytesArray[1]).toBe(97);  // a
    expect(bytesArray[2]).toBe(115); // s
    expect(bytesArray[3]).toBe(109); // m
  });

  test('multiple @wasm functions in one file', () => {
    const src = `
      @wasm fn double(x: Int) -> Int { x + x }
      @wasm fn triple(x: Int) -> Int { x + x + x }
    `;
    const js = getShared(src);
    expect(js).toContain('__wasm_bytes_double');
    expect(js).toContain('__wasm_bytes_triple');
  });

  test('non-@wasm functions are compiled normally', () => {
    const src = `
      @wasm fn wasmfn(x: Int) -> Int { x + 1 }
      fn normalfn(x) { x + 1 }
    `;
    const js = getShared(src);
    expect(js).toContain('__wasm_bytes_wasmfn');
    expect(js).toContain('function normalfn');
  });
});

// ─── LEB128 Edge Cases ──────────────────────────────────────

describe('LEB128 encoding edge cases', () => {
  test('uleb128 encodes 0 correctly', async () => {
    const node = makeFuncNode('zero', [], makeBlock(
      makeExprStmt(makeNum(0))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(isValidWasm(bytes)).toBe(true);
    expect(await runWasm(bytes, 'zero')).toBe(0);
  });

  test('uleb128 encodes multi-byte values correctly', async () => {
    // Value > 127 requires multiple bytes in uleb128
    const node = makeFuncNode('big_val', [], makeBlock(
      makeExprStmt(makeNum(128))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'big_val')).toBe(128);
  });

  test('sleb128 encodes negative values correctly', async () => {
    const node = makeFuncNode('neg_val', [], makeBlock(
      makeExprStmt(makeNum(-128))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'neg_val')).toBe(-128);
  });

  test('sleb128 encodes large negative values', async () => {
    const node = makeFuncNode('big_neg', [], makeBlock(
      makeExprStmt(makeNum(-1000000))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'big_neg')).toBe(-1000000);
  });
});

// ─── encodeString (via export names) ────────────────────────

describe('encodeString — via export names', () => {
  test('function name is encoded in export section', async () => {
    const node = getWasmFuncNode('@wasm fn my_function(x: Int) -> Int { x }');
    const bytes = compileWasmFunction(node);
    // The export section should contain the function name encoded as UTF-8
    const nameBytes = new TextEncoder().encode('my_function');
    // Find the name bytes in the WASM output
    let found = false;
    for (let i = 0; i < bytes.length - nameBytes.length; i++) {
      if (bytes[i] === nameBytes[0]) {
        let match = true;
        for (let j = 0; j < nameBytes.length; j++) {
          if (bytes[i + j] !== nameBytes[j]) { match = false; break; }
        }
        if (match) { found = true; break; }
      }
    }
    expect(found).toBe(true);
  });
});

// ─── Multi-function module with locals of different types ───

describe('buildMultiModule edge cases', () => {
  test('multi-module with functions having different local types', async () => {
    const src = `
      @wasm fn int_func(a: Int) -> Int { a + 1 }
      @wasm fn float_func(a: Float) -> Float { a + 1.0 }
    `;
    const nodes = getAllWasmFuncNodes(src);
    const bytes = compileWasmModule(nodes);
    const module = new WebAssembly.Module(bytes);
    const instance = new WebAssembly.Instance(module);
    expect(instance.exports.int_func(5)).toBe(6);
    expect(instance.exports.float_func(2.5)).toBeCloseTo(3.5, 10);
  });

  test('multi-module with void-like return (null returnType)', async () => {
    const fn1 = makeFuncNode('fn1', [makeParam('x', 'Int')], makeBlock(
      makeExprStmt(makeId('x'))
    ), null);
    const fn2 = makeFuncNode('fn2', [makeParam('x', 'Int')], makeBlock(
      makeExprStmt(makeBinary('+', makeId('x'), makeNum(1)))
    ), null);
    // compileWasmModule with null returnType (constructor defaults to I32)
    const bytes = compileWasmModule([fn1, fn2]);
    expect(isValidWasm(bytes)).toBe(true);
  });

  test('multi-module with locals', async () => {
    const fn1 = makeFuncNode('add_local', [makeParam('x', 'Int')], makeBlock(
      makeVarDecl(['y'], [makeNum(10)]),
      makeExprStmt(makeBinary('+', makeId('x'), makeId('y')))
    ), 'Int');
    const fn2 = makeFuncNode('mul_local', [makeParam('x', 'Int')], makeBlock(
      makeVarDecl(['y'], [makeNum(3)]),
      makeExprStmt(makeBinary('*', makeId('x'), makeId('y')))
    ), 'Int');
    const bytes = compileWasmModule([fn1, fn2]);
    const module = new WebAssembly.Module(bytes);
    const instance = new WebAssembly.Instance(module);
    expect(instance.exports.add_local(5)).toBe(15);
    expect(instance.exports.mul_local(5)).toBe(15);
  });
});

// ─── IfStatement with single-statement consequent (no block body) ──

describe('IfStatement with non-block consequent/else', () => {
  test('compileIfStmt with single-statement consequent (no .body)', async () => {
    // When consequent is a single statement, not a BlockStatement
    const node = makeFuncNode('single_conseq', [makeParam('x', 'Int')], makeBlock(
      makeVarDecl(['r'], [makeNum(0)]),
      {
        type: 'IfStatement',
        condition: makeBinary('>', makeId('x'), makeNum(0)),
        consequent: makeAssignment(['r'], [makeNum(1)]), // single statement, no .body
        elseBody: null,
        alternates: null,
      },
      makeExprStmt(makeId('r'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'single_conseq', 5)).toBe(1);
    expect(await runWasm(bytes, 'single_conseq', -1)).toBe(0);
  });

  test('compileIfStmt with single-statement else (no .body)', async () => {
    const node = makeFuncNode('single_else', [makeParam('x', 'Int')], makeBlock(
      makeVarDecl(['r'], [makeNum(0)]),
      {
        type: 'IfStatement',
        condition: makeBinary('>', makeId('x'), makeNum(0)),
        consequent: makeBlock(makeAssignment(['r'], [makeNum(1)])),
        elseBody: makeAssignment(['r'], [makeNum(-1)]), // single statement
        alternates: null,
      },
      makeExprStmt(makeId('r'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'single_else', 5)).toBe(1);
    expect(await runWasm(bytes, 'single_else', -1)).toBe(-1);
  });

  test('compileIfStmt with elif, single-statement alt body', async () => {
    const node = makeFuncNode('elif_single', [makeParam('x', 'Int')], makeBlock(
      makeVarDecl(['r'], [makeNum(0)]),
      {
        type: 'IfStatement',
        condition: makeBinary('>', makeId('x'), makeNum(10)),
        consequent: makeBlock(makeAssignment(['r'], [makeNum(1)])),
        alternates: [{
          condition: makeBinary('>', makeId('x'), makeNum(0)),
          body: makeAssignment(['r'], [makeNum(2)]), // single statement, no .body
        }],
        elseBody: makeBlock(makeAssignment(['r'], [makeNum(3)])),
      },
      makeExprStmt(makeId('r'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'elif_single', 15)).toBe(1);
    expect(await runWasm(bytes, 'elif_single', 5)).toBe(2);
    expect(await runWasm(bytes, 'elif_single', -1)).toBe(3);
  });

  test('compileIfStmt with elif elseBody as single statement', async () => {
    const node = makeFuncNode('elif_else_single', [makeParam('x', 'Int')], makeBlock(
      makeVarDecl(['r'], [makeNum(0)]),
      {
        type: 'IfStatement',
        condition: makeBinary('>', makeId('x'), makeNum(10)),
        consequent: makeBlock(makeAssignment(['r'], [makeNum(1)])),
        alternates: [{
          condition: makeBinary('>', makeId('x'), makeNum(0)),
          body: makeBlock(makeAssignment(['r'], [makeNum(2)])),
        }],
        elseBody: makeAssignment(['r'], [makeNum(3)]), // single statement, no .body
      },
      makeExprStmt(makeId('r'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'elif_else_single', -1)).toBe(3);
  });
});

// ─── While loop with single statement body ──────────────────

describe('while loop with non-block body', () => {
  test('while body as single statement', async () => {
    const node = makeFuncNode('while_single', [makeParam('n', 'Int')], makeBlock(
      makeVarDecl(['i'], [makeNum(0)]),
      {
        type: 'WhileStatement',
        condition: makeBinary('<', makeId('i'), makeId('n')),
        body: makeAssignment(['i'], [makeBinary('+', makeId('i'), makeNum(1))]), // not a block
      },
      makeExprStmt(makeId('i'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'while_single', 5)).toBe(5);
  });
});

// ─── buildModule return type null ───────────────────────────

describe('buildModule with null return type', () => {
  test('function with no returnType annotation defaults to I32', async () => {
    const node = makeFuncNode('no_ret', [makeParam('x', 'Int')], makeBlock(
      makeExprStmt(makeId('x'))
    ), null);
    // Constructor sets returnType to I32 when funcNode.returnType is null (falsy)
    // Wait, looking at the code: `this.returnType = funcNode.returnType ? tovaTypeToWasm(funcNode.returnType) : I32;`
    // So null returnType → I32
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'no_ret', 42)).toBe(42);
  });
});

// ─── Implicit assignment type inference for Float ───────────

describe('implicit assignment type inference', () => {
  test('implicit float variable from float literal', async () => {
    const node = makeFuncNode('impl_float', [], makeBlock(
      makeAssignment(['x'], [makeNum(3.14)]),
      makeExprStmt(makeId('x'))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'impl_float')).toBeCloseTo(3.14, 2);
  });

  test('implicit int variable from int literal', async () => {
    const node = makeFuncNode('impl_int', [], makeBlock(
      makeAssignment(['x'], [makeNum(42)]),
      makeExprStmt(makeId('x'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'impl_int')).toBe(42);
  });
});

// ─── Multiple elif branches ─────────────────────────────────

describe('multiple elif branches', () => {
  test('three-way elif in statement form', async () => {
    const node = makeFuncNode('three_way', [makeParam('x', 'Int')], makeBlock(
      makeVarDecl(['r'], [makeNum(0)]),
      {
        type: 'IfStatement',
        condition: makeBinary('>', makeId('x'), makeNum(100)),
        consequent: makeBlock(makeAssignment(['r'], [makeNum(3)])),
        alternates: [
          {
            condition: makeBinary('>', makeId('x'), makeNum(10)),
            body: makeBlock(makeAssignment(['r'], [makeNum(2)])),
          },
          {
            condition: makeBinary('>', makeId('x'), makeNum(0)),
            body: makeBlock(makeAssignment(['r'], [makeNum(1)])),
          },
        ],
        elseBody: makeBlock(makeAssignment(['r'], [makeNum(0)])),
      },
      makeExprStmt(makeId('r'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'three_way', 200)).toBe(3);
    expect(await runWasm(bytes, 'three_way', 50)).toBe(2);
    expect(await runWasm(bytes, 'three_way', 5)).toBe(1);
    expect(await runWasm(bytes, 'three_way', -1)).toBe(0);
  });

  test('three-way elif in expression form', async () => {
    const ifExpr = {
      type: 'IfStatement',
      condition: makeBinary('>', makeId('x'), makeNum(100)),
      consequent: makeBlock(makeExprStmt(makeNum(3))),
      alternates: [
        {
          condition: makeBinary('>', makeId('x'), makeNum(10)),
          body: makeBlock(makeExprStmt(makeNum(2))),
        },
        {
          condition: makeBinary('>', makeId('x'), makeNum(0)),
          body: makeBlock(makeExprStmt(makeNum(1))),
        },
      ],
      elseBody: makeBlock(makeExprStmt(makeNum(0))),
    };
    const node = makeFuncNode('three_way_expr', [makeParam('x', 'Int')], makeBlock(ifExpr), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'three_way_expr', 200)).toBe(3);
    expect(await runWasm(bytes, 'three_way_expr', 50)).toBe(2);
    expect(await runWasm(bytes, 'three_way_expr', 5)).toBe(1);
    expect(await runWasm(bytes, 'three_way_expr', -1)).toBe(0);
  });
});

// ─── ExpressionStatement via compileStatement ───────────────

describe('ExpressionStatement in compileStatement (non-last, drops value)', () => {
  test('expression statement drops value and continues', async () => {
    const node = makeFuncNode('drop_test', [makeParam('x', 'Int')], makeBlock(
      makeExprStmt(makeBinary('+', makeId('x'), makeNum(100))), // dropped
      makeExprStmt(makeBinary('*', makeId('x'), makeNum(2)))    // returned
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'drop_test', 5)).toBe(10);
  });
});

// ─── Last statement as IfStatement in compileBlockAsValue ───

describe('last statement IfStatement in compileBlockAsValue', () => {
  test('IfStatement as last statement in main block', async () => {
    const node = makeFuncNode('if_last', [makeParam('x', 'Int')], makeBlock(
      makeVarDecl(['y'], [makeNum(10)]),
      {
        type: 'IfStatement',
        condition: makeBinary('>', makeId('x'), makeNum(0)),
        consequent: makeBlock(makeExprStmt(makeBinary('+', makeId('x'), makeId('y')))),
        elseBody: makeBlock(makeExprStmt(makeId('y'))),
        alternates: null,
      }
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'if_last', 5)).toBe(15);
    expect(await runWasm(bytes, 'if_last', -1)).toBe(10);
  });
});

// ─── VarDeclaration with float init triggers float type ─────

describe('VarDeclaration type inference', () => {
  test('var with float init creates f64 local', async () => {
    const node = makeFuncNode('var_float', [], makeBlock(
      makeVarDecl(['x'], [makeNum(2.718)]),
      makeExprStmt(makeId('x'))
    ), 'Float');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'var_float')).toBeCloseTo(2.718, 3);
  });

  test('var with int init creates i32 local', async () => {
    const node = makeFuncNode('var_int', [], makeBlock(
      makeVarDecl(['x'], [makeNum(42)]),
      makeExprStmt(makeId('x'))
    ), 'Int');
    const bytes = compileWasmFunction(node);
    expect(await runWasm(bytes, 'var_int')).toBe(42);
  });
});
