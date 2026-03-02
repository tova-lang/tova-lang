// tests/formatter-100.test.js — 100% line coverage for src/formatter/formatter.js
import { describe, test, expect } from 'bun:test';
import { Formatter } from '../src/formatter/formatter.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

// Helper: parse Tova source to AST
function parse(src) {
  const lexer = new Lexer(src, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

// Helper: parse and format
function format(src) {
  const ast = parse(src);
  const f = new Formatter();
  return f.format(ast);
}

// ============================================================
// Constructor & basic methods (lines 4-13)
// ============================================================

describe('Formatter constructor', () => {
  test('default options', () => {
    const f = new Formatter();
    expect(f.indentSize).toBe(2);
    expect(f.maxLineLength).toBe(100);
    expect(f.indent).toBe(0);
  });

  test('custom options', () => {
    const f = new Formatter({ indentSize: 4, maxLineLength: 80 });
    expect(f.indentSize).toBe(4);
    expect(f.maxLineLength).toBe(80);
  });

  test('i() returns indent string', () => {
    const f = new Formatter();
    expect(f.i()).toBe('');
    f.indent = 2;
    expect(f.i()).toBe('    ');
  });
});

// ============================================================
// format() method (lines 15-30)
// ============================================================

describe('format', () => {
  test('null/undefined input returns empty string', () => {
    const f = new Formatter();
    expect(f.format(null)).toBe('');
    expect(f.format(undefined)).toBe('');
  });

  test('non-Program node returns empty string', () => {
    const f = new Formatter();
    expect(f.format({ type: 'NotAProgram' })).toBe('');
  });

  test('empty program', () => {
    const f = new Formatter();
    expect(f.format({ type: 'Program', body: [] })).toBe('\n');
  });

  test('simple assignment', () => {
    const result = format('x = 42');
    expect(result).toContain('x = 42');
  });

  test('blank line between different declaration types (line 22-23)', () => {
    const result = format('fn foo() { 1 }\nfn bar() { 2 }');
    // Two function declarations should have blank line between them
    expect(result).toContain('\n\n');
  });
});

// ============================================================
// _needsBlankLine (lines 32-37)
// ============================================================

describe('_needsBlankLine', () => {
  test('returns true for FunctionDeclaration transitions', () => {
    const f = new Formatter();
    expect(f._needsBlankLine('FunctionDeclaration', 'Assignment')).toBe(true);
    expect(f._needsBlankLine('Assignment', 'FunctionDeclaration')).toBe(true);
  });

  test('returns true for all decl types', () => {
    const f = new Formatter();
    const types = ['TypeDeclaration', 'InterfaceDeclaration', 'ImplDeclaration',
      'TraitDeclaration', 'ServerBlock', 'BrowserBlock', 'SharedBlock',
      'ComponentDeclaration', 'TestBlock'];
    for (const t of types) {
      expect(f._needsBlankLine('Assignment', t)).toBe(true);
      expect(f._needsBlankLine(t, 'Assignment')).toBe(true);
    }
  });

  test('returns false for non-decl transitions', () => {
    const f = new Formatter();
    expect(f._needsBlankLine('Assignment', 'ReturnStatement')).toBe(false);
  });
});

// ============================================================
// formatNode switch cases (lines 39-73)
// ============================================================

describe('formatNode', () => {
  test('null node returns empty string (line 40)', () => {
    const f = new Formatter();
    expect(f.formatNode(null)).toBe('');
    expect(f.formatNode(undefined)).toBe('');
  });

  test('Program node delegates to format() (line 43)', () => {
    const f = new Formatter();
    const ast = parse('x = 1');
    const result = f.formatNode(ast);
    expect(result).toContain('x = 1');
  });

  test('VarDeclaration (line 45)', () => {
    const result = format('var x = 10');
    expect(result).toContain('var x = 10');
  });

  test('LetDestructure (line 46)', () => {
    const result = format('let { a, b } = obj');
    expect(result).toContain('let');
  });

  test('TypeAlias (line 49)', () => {
    const result = format('type UserId = Int');
    expect(result).toContain('type UserId');
  });

  test('ImportDeclaration (line 50)', () => {
    const result = format('import { foo } from "bar"');
    expect(result).toContain('import { foo } from "bar"');
  });

  test('ImportDefault (line 51)', () => {
    const result = format('import foo from "bar"');
    expect(result).toContain('import foo from "bar"');
  });

  test('IfStatement (line 52)', () => {
    const result = format('if true { 1 }');
    expect(result).toContain('if');
  });

  test('ForStatement (line 53)', () => {
    const result = format('for x in items { print(x) }');
    expect(result).toContain('for');
  });

  test('WhileStatement (line 54)', () => {
    const result = format('while true { break }');
    expect(result).toContain('while');
  });

  test('ReturnStatement (line 56)', () => {
    const result = format('fn foo() { return 42 }');
    expect(result).toContain('return 42');
  });

  test('ExpressionStatement (line 57)', () => {
    const result = format('print("hello")');
    expect(result).toContain('print');
  });

  test('BreakStatement (line 58)', () => {
    const result = format('while true { break }');
    expect(result).toContain('break');
  });

  test('ContinueStatement (line 59)', () => {
    const result = format('for x in items { continue }');
    expect(result).toContain('continue');
  });

  test('GuardStatement (line 60)', () => {
    const result = format('fn foo(x: Int) { guard x > 0 else { return } }');
    expect(result).toContain('guard');
  });

  test('CompoundAssignment (line 68)', () => {
    const result = format('x = 0\nx += 1');
    expect(result).toContain('+=');
  });

  test('BlockStatement (line 69)', () => {
    const f = new Formatter();
    const block = { type: 'BlockStatement', body: [
      { type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }
    ]};
    const result = f.formatNode(block);
    expect(result).toContain('{');
    expect(result).toContain('}');
  });

  test('default case falls through to formatExpr (line 71)', () => {
    const f = new Formatter();
    // Pass an expression node where a statement is expected
    const result = f.formatNode({ type: 'NumberLiteral', value: 99 });
    expect(result).toContain('99');
  });
});

// ============================================================
// formatExpr switch cases (lines 75-109)
// ============================================================

describe('formatExpr', () => {
  test('null/undefined returns empty string (line 76)', () => {
    const f = new Formatter();
    expect(f.formatExpr(null)).toBe('');
    expect(f.formatExpr(undefined)).toBe('');
  });

  test('Identifier (line 79)', () => {
    const f = new Formatter();
    expect(f.formatExpr({ type: 'Identifier', name: 'foo' })).toBe('foo');
  });

  test('NumberLiteral (line 80)', () => {
    const f = new Formatter();
    expect(f.formatExpr({ type: 'NumberLiteral', value: 42 })).toBe('42');
  });

  test('StringLiteral (line 81)', () => {
    const f = new Formatter();
    expect(f.formatExpr({ type: 'StringLiteral', value: 'hello' })).toBe('"hello"');
  });

  test('BooleanLiteral (line 82)', () => {
    const f = new Formatter();
    expect(f.formatExpr({ type: 'BooleanLiteral', value: true })).toBe('true');
    expect(f.formatExpr({ type: 'BooleanLiteral', value: false })).toBe('false');
  });

  test('NilLiteral (line 83)', () => {
    const f = new Formatter();
    expect(f.formatExpr({ type: 'NilLiteral' })).toBe('nil');
  });

  test('RegexLiteral (line 84)', () => {
    const f = new Formatter();
    expect(f.formatExpr({ type: 'RegexLiteral', pattern: '\\d+', flags: 'g' })).toBe('/\\d+/g');
  });

  test('TemplateLiteral (line 85)', () => {
    const f = new Formatter();
    const node = {
      type: 'TemplateLiteral',
      parts: [
        { type: 'text', value: 'Hello ' },
        { type: 'expr', value: { type: 'Identifier', name: 'name' } },
        { type: 'text', value: '!' }
      ]
    };
    expect(f.formatExpr(node)).toBe('"Hello {name}!"');
  });

  test('BinaryExpression (line 86)', () => {
    const result = format('x = 1 + 2');
    expect(result).toContain('1 + 2');
  });

  test('UnaryExpression - not (line 87)', () => {
    const f = new Formatter();
    const node = { type: 'UnaryExpression', operator: 'not', operand: { type: 'BooleanLiteral', value: true } };
    expect(f.formatExpr(node)).toBe('not true');
  });

  test('UnaryExpression - minus (line 87)', () => {
    const f = new Formatter();
    const node = { type: 'UnaryExpression', operator: '-', operand: { type: 'NumberLiteral', value: 5 } };
    expect(f.formatExpr(node)).toBe('-5');
  });

  test('LogicalExpression (line 88)', () => {
    const f = new Formatter();
    const node = {
      type: 'LogicalExpression',
      operator: 'and',
      left: { type: 'BooleanLiteral', value: true },
      right: { type: 'BooleanLiteral', value: false }
    };
    expect(f.formatExpr(node)).toBe('true and false');
  });

  test('CallExpression (line 89)', () => {
    const result = format('foo(1, 2)');
    expect(result).toContain('foo(1, 2)');
  });

  test('MemberExpression computed (line 90)', () => {
    const f = new Formatter();
    const node = {
      type: 'MemberExpression',
      object: { type: 'Identifier', name: 'arr' },
      property: { type: 'NumberLiteral', value: 0 },
      computed: true
    };
    expect(f.formatExpr(node)).toBe('arr[0]');
  });

  test('MemberExpression non-computed (line 90)', () => {
    const f = new Formatter();
    const node = {
      type: 'MemberExpression',
      object: { type: 'Identifier', name: 'obj' },
      property: 'name',
      computed: false
    };
    expect(f.formatExpr(node)).toBe('obj.name');
  });

  test('OptionalChain (line 91)', () => {
    const f = new Formatter();
    const node = {
      type: 'OptionalChain',
      object: { type: 'Identifier', name: 'obj' },
      property: 'name'
    };
    expect(f.formatExpr(node)).toBe('obj?.name');
  });

  test('PipeExpression (line 92)', () => {
    const f = new Formatter();
    const node = {
      type: 'PipeExpression',
      left: { type: 'Identifier', name: 'x' },
      right: { type: 'Identifier', name: 'f' }
    };
    expect(f.formatExpr(node)).toBe('x |> f');
  });

  test('LambdaExpression (line 93)', () => {
    const f = new Formatter();
    const node = {
      type: 'LambdaExpression',
      params: [{ name: 'x' }],
      body: { type: 'BinaryExpression', operator: '+', left: { type: 'Identifier', name: 'x' }, right: { type: 'NumberLiteral', value: 1 } },
      isAsync: false
    };
    expect(f.formatExpr(node)).toBe('fn(x) x + 1');
  });

  test('MatchExpression (line 94)', () => {
    const f = new Formatter();
    const node = {
      type: 'MatchExpression',
      subject: { type: 'Identifier', name: 'x' },
      arms: [
        { pattern: { type: 'LiteralPattern', value: 1 }, body: { type: 'StringLiteral', value: 'one' } },
        { pattern: { type: 'WildcardPattern' }, body: { type: 'StringLiteral', value: 'other' } }
      ]
    };
    const result = f.formatExpr(node);
    expect(result).toContain('match x');
    expect(result).toContain('1 => "one"');
    expect(result).toContain('_ => "other"');
  });

  test('IfExpression (line 95)', () => {
    const f = new Formatter();
    const node = {
      type: 'IfExpression',
      condition: { type: 'BooleanLiteral', value: true },
      consequent: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }] },
      alternates: [],
      elseBody: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 2 } }] }
    };
    const result = f.formatExpr(node);
    expect(result).toContain('if true');
    expect(result).toContain('else');
  });

  test('ArrayLiteral empty (line 96)', () => {
    const f = new Formatter();
    const node = { type: 'ArrayLiteral', elements: [] };
    expect(f.formatExpr(node)).toBe('[]');
  });

  test('ArrayLiteral with elements (line 96)', () => {
    const f = new Formatter();
    const node = {
      type: 'ArrayLiteral',
      elements: [
        { type: 'NumberLiteral', value: 1 },
        { type: 'NumberLiteral', value: 2 }
      ]
    };
    expect(f.formatExpr(node)).toBe('[1, 2]');
  });

  test('ObjectLiteral empty (line 97)', () => {
    const f = new Formatter();
    const node = { type: 'ObjectLiteral', properties: [] };
    expect(f.formatExpr(node)).toBe('{}');
  });

  test('ObjectLiteral with properties (line 97)', () => {
    const f = new Formatter();
    const node = {
      type: 'ObjectLiteral',
      properties: [
        { key: { type: 'Identifier', name: 'a' }, value: { type: 'NumberLiteral', value: 1 }, shorthand: false },
        { key: { type: 'Identifier', name: 'b' }, shorthand: true }
      ]
    };
    const result = f.formatExpr(node);
    expect(result).toContain('a: 1');
    expect(result).toContain('b');
  });

  test('RangeExpression exclusive (line 98)', () => {
    const f = new Formatter();
    const node = {
      type: 'RangeExpression',
      start: { type: 'NumberLiteral', value: 1 },
      end: { type: 'NumberLiteral', value: 10 },
      inclusive: false
    };
    expect(f.formatExpr(node)).toBe('1..10');
  });

  test('RangeExpression inclusive (line 98)', () => {
    const f = new Formatter();
    const node = {
      type: 'RangeExpression',
      start: { type: 'NumberLiteral', value: 1 },
      end: { type: 'NumberLiteral', value: 10 },
      inclusive: true
    };
    expect(f.formatExpr(node)).toBe('1..=10');
  });

  test('SpreadExpression (line 99)', () => {
    const f = new Formatter();
    const node = {
      type: 'SpreadExpression',
      argument: { type: 'Identifier', name: 'args' }
    };
    expect(f.formatExpr(node)).toBe('...args');
  });

  test('PropagateExpression (line 100)', () => {
    const f = new Formatter();
    const node = {
      type: 'PropagateExpression',
      expression: { type: 'Identifier', name: 'result' }
    };
    expect(f.formatExpr(node)).toBe('result?');
  });

  test('AwaitExpression (line 101)', () => {
    const f = new Formatter();
    const node = {
      type: 'AwaitExpression',
      argument: { type: 'CallExpression', callee: { type: 'Identifier', name: 'fetch' }, arguments: [] }
    };
    expect(f.formatExpr(node)).toBe('await fetch()');
  });

  test('YieldExpression (line 102)', () => {
    const f = new Formatter();
    const node = {
      type: 'YieldExpression',
      argument: { type: 'NumberLiteral', value: 1 },
      delegate: false
    };
    expect(f.formatExpr(node)).toBe('yield 1');
  });

  test('YieldExpression with delegate (line 102)', () => {
    const f = new Formatter();
    const node = {
      type: 'YieldExpression',
      argument: { type: 'Identifier', name: 'gen' },
      delegate: true
    };
    expect(f.formatExpr(node)).toBe('yield from gen');
  });

  test('TupleExpression (line 103)', () => {
    const f = new Formatter();
    const node = {
      type: 'TupleExpression',
      elements: [
        { type: 'NumberLiteral', value: 1 },
        { type: 'StringLiteral', value: 'a' }
      ]
    };
    expect(f.formatExpr(node)).toBe('(1, "a")');
  });

  test('NamedArgument (line 104)', () => {
    const f = new Formatter();
    const node = {
      type: 'NamedArgument',
      name: 'color',
      value: { type: 'StringLiteral', value: 'red' }
    };
    expect(f.formatExpr(node)).toBe('color: "red"');
  });

  test('MembershipExpression - in (line 105)', () => {
    const f = new Formatter();
    const node = {
      type: 'MembershipExpression',
      value: { type: 'Identifier', name: 'x' },
      collection: { type: 'Identifier', name: 'items' },
      negated: false
    };
    expect(f.formatExpr(node)).toBe('x in items');
  });

  test('MembershipExpression - not in (line 105)', () => {
    const f = new Formatter();
    const node = {
      type: 'MembershipExpression',
      value: { type: 'Identifier', name: 'x' },
      collection: { type: 'Identifier', name: 'items' },
      negated: true
    };
    expect(f.formatExpr(node)).toBe('x not in items');
  });

  test('unknown expression type (line 107)', () => {
    const f = new Formatter();
    const result = f.formatExpr({ type: 'SomeFutureNode' });
    expect(result).toContain('/* unknown: SomeFutureNode */');
  });
});

// ============================================================
// formatAssignment (lines 111-118)
// ============================================================

describe('formatAssignment', () => {
  test('single assignment (line 112-113)', () => {
    const result = format('x = 42');
    expect(result).toContain('x = 42');
  });

  test('multi-assignment (lines 114-117)', () => {
    const f = new Formatter();
    const node = {
      type: 'Assignment',
      targets: ['a', 'b'],
      values: [
        { type: 'NumberLiteral', value: 1 },
        { type: 'NumberLiteral', value: 2 }
      ]
    };
    const result = f.formatNode(node);
    expect(result).toBe('a, b = 1, 2');
  });
});

// ============================================================
// formatVarDeclaration (lines 120-127)
// ============================================================

describe('formatVarDeclaration', () => {
  test('single var (lines 121-122)', () => {
    const result = format('var x = 10');
    expect(result).toContain('var x = 10');
  });

  test('multi var (lines 123-126)', () => {
    const f = new Formatter();
    const node = {
      type: 'VarDeclaration',
      targets: ['a', 'b'],
      values: [
        { type: 'NumberLiteral', value: 1 },
        { type: 'NumberLiteral', value: 2 }
      ]
    };
    const result = f.formatNode(node);
    expect(result).toBe('var a, b = 1, 2');
  });
});

// ============================================================
// formatLetDestructure (lines 129-132)
// ============================================================

describe('formatLetDestructure', () => {
  test('object destructure (line 129-131)', () => {
    const result = format('let { a, b } = obj');
    expect(result).toContain('let { a, b }');
  });

  test('array destructure', () => {
    const result = format('let [a, b] = items');
    expect(result).toContain('let [a, b]');
  });
});

// ============================================================
// formatPattern (lines 134-153)
// ============================================================

describe('formatPattern', () => {
  test('null pattern returns underscore (line 135)', () => {
    const f = new Formatter();
    expect(f.formatPattern(null)).toBe('_');
    expect(f.formatPattern(undefined)).toBe('_');
  });

  test('ObjectPattern with matching key/value (line 138-144)', () => {
    const f = new Formatter();
    const pattern = {
      type: 'ObjectPattern',
      properties: [
        { key: 'name', value: 'name' },
        { key: 'age', value: 'age' }
      ]
    };
    expect(f.formatPattern(pattern)).toBe('{ name, age }');
  });

  test('ObjectPattern with renamed value (line 140)', () => {
    const f = new Formatter();
    const pattern = {
      type: 'ObjectPattern',
      properties: [
        { key: 'name', value: 'n' }
      ]
    };
    expect(f.formatPattern(pattern)).toBe('{ name: n }');
  });

  test('ObjectPattern with default value (line 141)', () => {
    const f = new Formatter();
    const pattern = {
      type: 'ObjectPattern',
      properties: [
        { key: 'x', value: 'x', defaultValue: { type: 'NumberLiteral', value: 0 } }
      ]
    };
    expect(f.formatPattern(pattern)).toBe('{ x = 0 }');
  });

  test('ArrayPattern (line 146-147)', () => {
    const f = new Formatter();
    const pattern = {
      type: 'ArrayPattern',
      elements: ['a', 'b', null]
    };
    expect(f.formatPattern(pattern)).toBe('[a, b, _]');
  });

  test('TuplePattern (line 148-149)', () => {
    const f = new Formatter();
    const pattern = {
      type: 'TuplePattern',
      elements: [
        { type: 'ArrayPattern', elements: ['x'] },
        null
      ]
    };
    const result = f.formatPattern(pattern);
    expect(result).toBe('([x], _)');
  });

  test('unknown pattern type returns underscore (line 150-151)', () => {
    const f = new Formatter();
    expect(f.formatPattern({ type: 'UnknownPattern' })).toBe('_');
  });
});

// ============================================================
// formatFunctionDeclaration (lines 155-166)
// ============================================================

describe('formatFunctionDeclaration', () => {
  test('simple function', () => {
    const result = format('fn foo() { 1 }');
    expect(result).toContain('fn foo()');
    expect(result).toContain('{');
    expect(result).toContain('}');
  });

  test('async function (line 156)', () => {
    const result = format('async fn foo() { 1 }');
    expect(result).toContain('async fn foo()');
  });

  test('pub function (line 157)', () => {
    const result = format('pub fn foo() { 1 }');
    expect(result).toContain('pub fn foo()');
  });

  test('function with return type (line 159)', () => {
    const result = format('fn foo() -> Int { 1 }');
    expect(result).toContain('-> Int');
  });

  test('function with typed params (line 179)', () => {
    const result = format('fn add(a: Int, b: Int) -> Int { a + b }');
    expect(result).toContain('a: Int');
    expect(result).toContain('b: Int');
  });

  test('function with default param (line 180)', () => {
    const result = format('fn greet(name: String = "world") { name }');
    expect(result).toContain('= "world"');
  });
});

// ============================================================
// formatParams with destructuring (lines 168-183)
// ============================================================

describe('formatParams', () => {
  test('object destructured param (line 171-172)', () => {
    const f = new Formatter();
    const params = [{
      name: '_',
      destructure: {
        type: 'ObjectPattern',
        properties: [{ key: 'x', value: 'x' }]
      }
    }];
    expect(f.formatParams(params)).toBe('{ x }');
  });

  test('array destructured param (line 174-175)', () => {
    const f = new Formatter();
    const params = [{
      name: '_',
      destructure: {
        type: 'ArrayPattern',
        elements: ['a', 'b']
      }
    }];
    expect(f.formatParams(params)).toBe('[a, b]');
  });
});

// ============================================================
// formatTypeAnnotation (lines 185-194)
// ============================================================

describe('formatTypeAnnotation', () => {
  test('null type returns Any (line 186)', () => {
    const f = new Formatter();
    expect(f.formatTypeAnnotation(null)).toBe('Any');
  });

  test('ArrayTypeAnnotation (line 187)', () => {
    const f = new Formatter();
    const ta = { type: 'ArrayTypeAnnotation', elementType: { name: 'Int' } };
    expect(f.formatTypeAnnotation(ta)).toBe('[Int]');
  });

  test('TupleTypeAnnotation (line 188)', () => {
    const f = new Formatter();
    const ta = {
      type: 'TupleTypeAnnotation',
      elementTypes: [{ name: 'Int' }, { name: 'String' }]
    };
    expect(f.formatTypeAnnotation(ta)).toBe('(Int, String)');
  });

  test('simple type (line 189)', () => {
    const f = new Formatter();
    expect(f.formatTypeAnnotation({ name: 'Int' })).toBe('Int');
  });

  test('generic type with typeParams (line 190-192)', () => {
    const f = new Formatter();
    const ta = {
      name: 'Result',
      typeParams: [{ name: 'Int' }, { name: 'String' }]
    };
    expect(f.formatTypeAnnotation(ta)).toBe('Result<Int, String>');
  });

  test('type with empty typeParams (line 190)', () => {
    const f = new Formatter();
    expect(f.formatTypeAnnotation({ name: 'Foo', typeParams: [] })).toBe('Foo');
  });
});

// ============================================================
// formatBlockBody (lines 196-202)
// ============================================================

describe('formatBlockBody', () => {
  test('null/undefined returns empty string (line 197)', () => {
    const f = new Formatter();
    expect(f.formatBlockBody(null)).toBe('');
  });

  test('non-BlockStatement node formats as expression (line 198-199)', () => {
    const f = new Formatter();
    const result = f.formatBlockBody({ type: 'NumberLiteral', value: 42 });
    expect(result).toContain('42');
  });

  test('BlockStatement formats body (line 201)', () => {
    const f = new Formatter();
    const block = {
      type: 'BlockStatement',
      body: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }]
    };
    const result = f.formatBlockBody(block);
    expect(result).toContain('1');
  });
});

// ============================================================
// formatBlock (lines 204-211)
// ============================================================

describe('formatBlock', () => {
  test('formats block statement (lines 204-210)', () => {
    const f = new Formatter();
    const node = {
      type: 'BlockStatement',
      body: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 99 } }]
    };
    const result = f.formatBlock(node);
    expect(result).toContain('{');
    expect(result).toContain('99');
    expect(result).toContain('}');
  });
});

// ============================================================
// formatTypeDeclaration (lines 213-241)
// ============================================================

describe('formatTypeDeclaration', () => {
  test('record type with fields (line 231-233)', () => {
    const result = format('type Point { x: Float\ny: Float }');
    expect(result).toContain('type Point');
    expect(result).toContain('x: Float');
    expect(result).toContain('y: Float');
  });

  test('enum type with variants (lines 220-230)', () => {
    const f = new Formatter();
    const node = {
      type: 'TypeDeclaration',
      name: 'Shape',
      isPublic: false,
      typeParams: [],
      variants: [
        { type: 'TypeVariant', name: 'Circle', fields: [{ name: 'radius', typeAnnotation: { name: 'Float' } }] },
        { type: 'TypeVariant', name: 'Square', fields: [{ name: 'side', typeAnnotation: { name: 'Float' } }] },
        { type: 'TypeVariant', name: 'Point', fields: [] }
      ]
    };
    const result = f.formatNode(node);
    expect(result).toContain('Circle(radius: Float)');
    expect(result).toContain('Square(side: Float)');
    expect(result).toContain('  Point');
  });

  test('type with typeParams (line 215-216)', () => {
    const f = new Formatter();
    const node = {
      type: 'TypeDeclaration',
      name: 'Container',
      isPublic: false,
      typeParams: ['T'],
      variants: [
        { type: 'TypeField', name: 'value', typeAnnotation: { name: 'T' } }
      ]
    };
    const result = f.formatNode(node);
    expect(result).toContain('type Container<T>');
  });

  test('pub type (line 214)', () => {
    const f = new Formatter();
    const node = {
      type: 'TypeDeclaration',
      name: 'Foo',
      isPublic: true,
      typeParams: [],
      variants: [
        { type: 'TypeField', name: 'x', typeAnnotation: { name: 'Int' } }
      ]
    };
    const result = f.formatNode(node);
    expect(result).toContain('pub type Foo');
  });

  test('type with derive (line 237-239)', () => {
    const f = new Formatter();
    const node = {
      type: 'TypeDeclaration',
      name: 'Color',
      isPublic: false,
      typeParams: [],
      variants: [
        { type: 'TypeVariant', name: 'Red', fields: [] },
        { type: 'TypeVariant', name: 'Blue', fields: [] }
      ],
      derive: ['Eq', 'Show']
    };
    const result = f.formatNode(node);
    expect(result).toContain('derive [Eq, Show]');
  });

  test('variant field without type annotation (line 225-228)', () => {
    const f = new Formatter();
    const node = {
      type: 'TypeDeclaration',
      name: 'Wrapper',
      isPublic: false,
      typeParams: [],
      variants: [
        { type: 'TypeVariant', name: 'Val', fields: [{ name: 'inner' }] }
      ]
    };
    const result = f.formatNode(node);
    expect(result).toContain('Val(inner)');
  });
});

// ============================================================
// formatTypeAlias (line 243-245)
// ============================================================

describe('formatTypeAlias', () => {
  test('type alias (line 244)', () => {
    const f = new Formatter();
    const node = {
      type: 'TypeAlias',
      name: 'UserId',
      typeExpr: { name: 'Int' }
    };
    const result = f.formatNode(node);
    expect(result).toBe('type UserId = Int');
  });
});

// ============================================================
// formatImport (lines 247-253)
// ============================================================

describe('formatImport', () => {
  test('simple import (line 248-252)', () => {
    const result = format('import { foo } from "bar"');
    expect(result).toContain('import { foo } from "bar"');
  });

  test('import with alias (line 249)', () => {
    const f = new Formatter();
    const node = {
      type: 'ImportDeclaration',
      specifiers: [
        { imported: 'foo', local: 'myFoo' },
        { imported: 'bar', local: 'bar' }
      ],
      source: 'mod'
    };
    const result = f.formatNode(node);
    expect(result).toContain('foo as myFoo');
    expect(result).toContain('bar');
  });
});

// ============================================================
// formatImportDefault (line 255-257)
// ============================================================

describe('formatImportDefault', () => {
  test('default import (line 256)', () => {
    const f = new Formatter();
    const node = {
      type: 'ImportDefault',
      local: 'React',
      source: 'react'
    };
    const result = f.formatNode(node);
    expect(result).toBe('import React from "react"');
  });
});

// ============================================================
// formatIfStatement (lines 259-283)
// ============================================================

describe('formatIfStatement', () => {
  test('simple if (lines 260-264)', () => {
    const result = format('if true { 1 }');
    expect(result).toContain('if true');
    expect(result).toContain('{');
    expect(result).toContain('}');
  });

  test('if-elif (lines 266-272)', () => {
    const result = format('if x > 0 { 1 } elif x < 0 { -1 } elif x == 0 { 0 }');
    expect(result).toContain('elif');
  });

  test('if-else (lines 274-280)', () => {
    const result = format('if true { 1 } else { 2 }');
    expect(result).toContain('else');
  });

  test('if-elif-else', () => {
    const result = format('if x > 0 { 1 } elif x < 0 { -1 } else { 0 }');
    expect(result).toContain('if');
    expect(result).toContain('elif');
    expect(result).toContain('else');
  });
});

// ============================================================
// formatForStatement (lines 285-302)
// ============================================================

describe('formatForStatement', () => {
  test('simple for (lines 286-291)', () => {
    const result = format('for x in items { print(x) }');
    expect(result).toContain('for x in');
  });

  test('for with array variable (line 286)', () => {
    const f = new Formatter();
    const node = {
      type: 'ForStatement',
      variable: ['k', 'v'],
      iterable: { type: 'Identifier', name: 'map' },
      body: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: { type: 'Identifier', name: 'k' } }] }
    };
    const result = f.formatNode(node);
    expect(result).toContain('for k, v in map');
  });

  test('for-else (lines 293-299)', () => {
    const f = new Formatter();
    const node = {
      type: 'ForStatement',
      variable: 'x',
      iterable: { type: 'Identifier', name: 'items' },
      body: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: { type: 'Identifier', name: 'x' } }] },
      elseBody: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: { type: 'StringLiteral', value: 'empty' } }] }
    };
    const result = f.formatNode(node);
    expect(result).toContain('for x in items');
    expect(result).toContain('else');
    expect(result).toContain('"empty"');
  });
});

// ============================================================
// formatWhileStatement (lines 304-311)
// ============================================================

describe('formatWhileStatement', () => {
  test('while loop (lines 305-310)', () => {
    const result = format('while true { break }');
    expect(result).toContain('while true');
    expect(result).toContain('{');
    expect(result).toContain('}');
  });
});

// ============================================================
// formatTryCatch (lines 313-343)
// ============================================================

describe('formatTryCatch', () => {
  test('try-catch (lines 313-329)', () => {
    const f = new Formatter();
    const node = {
      type: 'TryCatchStatement',
      tryBody: [{ type: 'ExpressionStatement', expression: { type: 'CallExpression', callee: { type: 'Identifier', name: 'risky' }, arguments: [] } }],
      catchParam: 'e',
      catchBody: [{ type: 'ExpressionStatement', expression: { type: 'CallExpression', callee: { type: 'Identifier', name: 'handle' }, arguments: [{ type: 'Identifier', name: 'e' }] } }],
      finallyBody: null
    };
    const result = f.formatNode(node);
    expect(result).toContain('try {');
    expect(result).toContain('risky()');
    expect(result).toContain('} catch e {');
    expect(result).toContain('handle(e)');
  });

  test('try-catch without param (line 322)', () => {
    const f = new Formatter();
    const node = {
      type: 'TryCatchStatement',
      tryBody: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }],
      catchParam: null,
      catchBody: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 2 } }],
      finallyBody: null
    };
    const result = f.formatNode(node);
    expect(result).toContain('} catch {');
  });

  test('try-finally (lines 331-339)', () => {
    const f = new Formatter();
    const node = {
      type: 'TryCatchStatement',
      tryBody: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }],
      catchBody: null,
      finallyBody: [{ type: 'ExpressionStatement', expression: { type: 'CallExpression', callee: { type: 'Identifier', name: 'cleanup' }, arguments: [] } }]
    };
    const result = f.formatNode(node);
    expect(result).toContain('try {');
    expect(result).toContain('finally {');
    expect(result).toContain('cleanup()');
  });

  test('try-catch-finally (all three blocks)', () => {
    const f = new Formatter();
    const node = {
      type: 'TryCatchStatement',
      tryBody: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }],
      catchParam: 'e',
      catchBody: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 2 } }],
      finallyBody: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 3 } }]
    };
    const result = f.formatNode(node);
    expect(result).toContain('try {');
    expect(result).toContain('} catch e {');
    expect(result).toContain('finally {');
  });
});

// ============================================================
// formatReturnStatement (lines 345-348)
// ============================================================

describe('formatReturnStatement', () => {
  test('return with value (line 346)', () => {
    const f = new Formatter();
    const node = { type: 'ReturnStatement', value: { type: 'NumberLiteral', value: 42 } };
    const result = f.formatNode(node);
    expect(result).toBe('return 42');
  });

  test('return without value (line 347)', () => {
    const f = new Formatter();
    const node = { type: 'ReturnStatement', value: null };
    const result = f.formatNode(node);
    expect(result).toBe('return');
  });
});

// ============================================================
// formatGuardStatement (lines 350-357)
// ============================================================

describe('formatGuardStatement', () => {
  test('guard clause (lines 351-356)', () => {
    const f = new Formatter();
    const node = {
      type: 'GuardStatement',
      condition: {
        type: 'BinaryExpression',
        operator: '>',
        left: { type: 'Identifier', name: 'x' },
        right: { type: 'NumberLiteral', value: 0 }
      },
      elseBody: { type: 'BlockStatement', body: [{ type: 'ReturnStatement', value: null }] }
    };
    const result = f.formatNode(node);
    expect(result).toContain('guard x > 0 else');
    expect(result).toContain('return');
  });
});

// ============================================================
// formatInterfaceDeclaration (lines 359-370)
// ============================================================

describe('formatInterfaceDeclaration', () => {
  test('interface with methods (lines 360-369)', () => {
    const f = new Formatter();
    const node = {
      type: 'InterfaceDeclaration',
      name: 'Printable',
      methods: [
        { name: 'toString', params: [], returnType: { name: 'String' } },
        { name: 'debug', params: [{ name: 'verbose', typeAnnotation: { name: 'Bool' } }], returnType: null }
      ]
    };
    const result = f.formatNode(node);
    expect(result).toContain('interface Printable');
    expect(result).toContain('fn toString() -> String');
    expect(result).toContain('fn debug(verbose: Bool)');
  });
});

// ============================================================
// formatImplDeclaration (lines 372-382)
// ============================================================

describe('formatImplDeclaration', () => {
  test('impl without trait (line 373-374)', () => {
    const f = new Formatter();
    const node = {
      type: 'ImplDeclaration',
      typeName: 'Point',
      traitName: null,
      methods: [{
        type: 'FunctionDeclaration',
        name: 'new',
        params: [],
        body: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 0 } }] },
        isAsync: false,
        isPublic: false,
        returnType: null
      }]
    };
    const result = f.formatNode(node);
    expect(result).toContain('impl Point');
    expect(result).not.toContain('for');
    expect(result).toContain('fn new()');
  });

  test('impl with trait (line 373)', () => {
    const f = new Formatter();
    const node = {
      type: 'ImplDeclaration',
      typeName: 'Point',
      traitName: 'Printable',
      methods: [{
        type: 'FunctionDeclaration',
        name: 'show',
        params: [],
        body: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: { type: 'StringLiteral', value: 'point' } }] },
        isAsync: false,
        isPublic: false,
        returnType: null
      }]
    };
    const result = f.formatNode(node);
    expect(result).toContain('impl Printable for Point');
  });
});

// ============================================================
// formatTraitDeclaration (lines 384-403)
// ============================================================

describe('formatTraitDeclaration', () => {
  test('trait with abstract method (lines 396-397)', () => {
    const f = new Formatter();
    const node = {
      type: 'TraitDeclaration',
      name: 'Showable',
      methods: [
        { name: 'show', params: [], returnType: { name: 'String' }, body: null }
      ]
    };
    const result = f.formatNode(node);
    expect(result).toContain('trait Showable');
    expect(result).toContain('fn show() -> String');
    // The trait block itself has braces, but the abstract method line should not
    expect(result).toContain('fn show() -> String\n');
  });

  test('trait with default method (lines 390-395)', () => {
    const f = new Formatter();
    const node = {
      type: 'TraitDeclaration',
      name: 'Greetable',
      methods: [
        {
          name: 'greet',
          params: [],
          returnType: { name: 'String' },
          body: { type: 'BlockStatement', body: [{ type: 'ReturnStatement', value: { type: 'StringLiteral', value: 'hello' } }] }
        }
      ]
    };
    const result = f.formatNode(node);
    expect(result).toContain('trait Greetable');
    expect(result).toContain('fn greet() -> String {');
    expect(result).toContain('return "hello"');
  });

  test('trait with mixed methods', () => {
    const f = new Formatter();
    const node = {
      type: 'TraitDeclaration',
      name: 'Animal',
      methods: [
        { name: 'name', params: [], returnType: { name: 'String' }, body: null },
        {
          name: 'speak',
          params: [],
          returnType: null,
          body: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: { type: 'CallExpression', callee: { type: 'Identifier', name: 'print' }, arguments: [{ type: 'StringLiteral', value: 'hello' }] } }] }
        }
      ]
    };
    const result = f.formatNode(node);
    expect(result).toContain('fn name() -> String');
    expect(result).toContain('fn speak()');
  });
});

// ============================================================
// formatDeferStatement (lines 405-415)
// ============================================================

describe('formatDeferStatement', () => {
  test('defer with block (lines 406-412)', () => {
    const f = new Formatter();
    const node = {
      type: 'DeferStatement',
      body: {
        type: 'BlockStatement',
        body: [{ type: 'ExpressionStatement', expression: { type: 'CallExpression', callee: { type: 'Identifier', name: 'cleanup' }, arguments: [] } }]
      }
    };
    const result = f.formatNode(node);
    expect(result).toContain('defer {');
    expect(result).toContain('cleanup()');
    expect(result).toContain('}');
  });

  test('defer with expression (line 414)', () => {
    const f = new Formatter();
    const node = {
      type: 'DeferStatement',
      body: { type: 'CallExpression', callee: { type: 'Identifier', name: 'close' }, arguments: [] }
    };
    const result = f.formatNode(node);
    expect(result).toBe('defer close()');
  });
});

// ============================================================
// formatServerBlock (lines 417-425)
// ============================================================

describe('formatServerBlock', () => {
  test('server block without name (line 418-424)', () => {
    const f = new Formatter();
    const node = {
      type: 'ServerBlock',
      name: null,
      body: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }]
    };
    const result = f.formatNode(node);
    expect(result).toContain('server {');
  });

  test('server block with name (line 418)', () => {
    const f = new Formatter();
    const node = {
      type: 'ServerBlock',
      name: 'api',
      body: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }]
    };
    const result = f.formatNode(node);
    expect(result).toContain('server "api" {');
  });
});

// ============================================================
// formatBrowserBlock (lines 427-435)
// ============================================================

describe('formatBrowserBlock', () => {
  test('browser block without name (line 428-434)', () => {
    const f = new Formatter();
    const node = {
      type: 'BrowserBlock',
      name: null,
      body: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }]
    };
    const result = f.formatNode(node);
    expect(result).toContain('browser {');
  });

  test('browser block with name (line 428)', () => {
    const f = new Formatter();
    const node = {
      type: 'BrowserBlock',
      name: 'app',
      body: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }]
    };
    const result = f.formatNode(node);
    expect(result).toContain('browser "app" {');
  });
});

// ============================================================
// formatSharedBlock (lines 437-445)
// ============================================================

describe('formatSharedBlock', () => {
  test('shared block without name (line 438-444)', () => {
    const f = new Formatter();
    const node = {
      type: 'SharedBlock',
      name: null,
      body: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }]
    };
    const result = f.formatNode(node);
    expect(result).toContain('shared {');
  });

  test('shared block with name (line 438)', () => {
    const f = new Formatter();
    const node = {
      type: 'SharedBlock',
      name: 'utils',
      body: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }]
    };
    const result = f.formatNode(node);
    expect(result).toContain('shared "utils" {');
  });
});

// ============================================================
// formatCallExpression (lines 447-451)
// ============================================================

describe('formatCallExpression', () => {
  test('simple call (lines 448-450)', () => {
    const f = new Formatter();
    const result = f.formatCallExpression({
      callee: { type: 'Identifier', name: 'print' },
      arguments: [{ type: 'StringLiteral', value: 'hi' }]
    });
    expect(result).toBe('print("hi")');
  });

  test('call with no args', () => {
    const f = new Formatter();
    const result = f.formatCallExpression({
      callee: { type: 'Identifier', name: 'foo' },
      arguments: []
    });
    expect(result).toBe('foo()');
  });

  test('call with multiple args', () => {
    const f = new Formatter();
    const result = f.formatCallExpression({
      callee: { type: 'Identifier', name: 'add' },
      arguments: [
        { type: 'NumberLiteral', value: 1 },
        { type: 'NumberLiteral', value: 2 }
      ]
    });
    expect(result).toBe('add(1, 2)');
  });
});

// ============================================================
// formatLambda (lines 453-465)
// ============================================================

describe('formatLambda', () => {
  test('simple lambda expression body (line 464)', () => {
    const f = new Formatter();
    const node = {
      type: 'LambdaExpression',
      params: [{ name: 'x' }],
      body: { type: 'BinaryExpression', operator: '*', left: { type: 'Identifier', name: 'x' }, right: { type: 'NumberLiteral', value: 2 } },
      isAsync: false
    };
    const result = f.formatLambda(node);
    expect(result).toBe('fn(x) x * 2');
  });

  test('async lambda (line 454)', () => {
    const f = new Formatter();
    const node = {
      type: 'LambdaExpression',
      params: [{ name: 'url' }],
      body: { type: 'CallExpression', callee: { type: 'Identifier', name: 'fetch' }, arguments: [{ type: 'Identifier', name: 'url' }] },
      isAsync: true
    };
    const result = f.formatLambda(node);
    expect(result).toBe('async fn(url) fetch(url)');
  });

  test('lambda with block body (lines 456-462)', () => {
    const f = new Formatter();
    const node = {
      type: 'LambdaExpression',
      params: [{ name: 'x' }],
      body: {
        type: 'BlockStatement',
        body: [
          { type: 'ExpressionStatement', expression: { type: 'CallExpression', callee: { type: 'Identifier', name: 'print' }, arguments: [{ type: 'Identifier', name: 'x' }] } },
          { type: 'ReturnStatement', value: { type: 'Identifier', name: 'x' } }
        ]
      },
      isAsync: false
    };
    const result = f.formatLambda(node);
    expect(result).toContain('fn(x) {');
    expect(result).toContain('print(x)');
    expect(result).toContain('return x');
    expect(result).toContain('}');
  });
});

// ============================================================
// formatMatchExpression (lines 467-486)
// ============================================================

describe('formatMatchExpression', () => {
  test('match with simple arms (lines 468-481)', () => {
    const f = new Formatter();
    const node = {
      type: 'MatchExpression',
      subject: { type: 'Identifier', name: 'color' },
      arms: [
        { pattern: { type: 'LiteralPattern', value: 'red' }, body: { type: 'NumberLiteral', value: 1 } },
        { pattern: { type: 'WildcardPattern' }, body: { type: 'NumberLiteral', value: 0 } }
      ]
    };
    const result = f.formatMatchExpression(node);
    expect(result).toContain('match color');
    expect(result).toContain('"red" => 1');
    expect(result).toContain('_ => 0');
  });

  test('match arm with guard (line 472)', () => {
    const f = new Formatter();
    const node = {
      type: 'MatchExpression',
      subject: { type: 'Identifier', name: 'x' },
      arms: [
        {
          pattern: { type: 'BindingPattern', name: 'n' },
          guard: { type: 'BinaryExpression', operator: '>', left: { type: 'Identifier', name: 'n' }, right: { type: 'NumberLiteral', value: 0 } },
          body: { type: 'StringLiteral', value: 'positive' }
        }
      ]
    };
    const result = f.formatMatchExpression(node);
    expect(result).toContain('n if n > 0 => "positive"');
  });

  test('match arm with block body (lines 473-478)', () => {
    const f = new Formatter();
    const node = {
      type: 'MatchExpression',
      subject: { type: 'Identifier', name: 'x' },
      arms: [
        {
          pattern: { type: 'LiteralPattern', value: 1 },
          body: {
            type: 'BlockStatement',
            body: [
              { type: 'ExpressionStatement', expression: { type: 'CallExpression', callee: { type: 'Identifier', name: 'print' }, arguments: [{ type: 'StringLiteral', value: 'one' }] } },
              { type: 'ReturnStatement', value: { type: 'NumberLiteral', value: 1 } }
            ]
          }
        }
      ]
    };
    const result = f.formatMatchExpression(node);
    expect(result).toContain('1 => {');
    expect(result).toContain('print("one")');
    expect(result).toContain('return 1');
  });
});

// ============================================================
// formatMatchPattern (lines 488-507)
// ============================================================

describe('formatMatchPattern', () => {
  test('WildcardPattern (line 490)', () => {
    const f = new Formatter();
    expect(f.formatMatchPattern({ type: 'WildcardPattern' })).toBe('_');
  });

  test('LiteralPattern (line 491)', () => {
    const f = new Formatter();
    expect(f.formatMatchPattern({ type: 'LiteralPattern', value: 42 })).toBe('42');
    expect(f.formatMatchPattern({ type: 'LiteralPattern', value: 'hello' })).toBe('"hello"');
    expect(f.formatMatchPattern({ type: 'LiteralPattern', value: true })).toBe('true');
  });

  test('BindingPattern (line 492)', () => {
    const f = new Formatter();
    expect(f.formatMatchPattern({ type: 'BindingPattern', name: 'x' })).toBe('x');
  });

  test('VariantPattern without fields (line 494)', () => {
    const f = new Formatter();
    expect(f.formatMatchPattern({ type: 'VariantPattern', name: 'None', fields: [] })).toBe('None');
  });

  test('VariantPattern with fields (line 495)', () => {
    const f = new Formatter();
    expect(f.formatMatchPattern({ type: 'VariantPattern', name: 'Some', fields: ['x'] })).toBe('Some(x)');
    expect(f.formatMatchPattern({ type: 'VariantPattern', name: 'Pair', fields: ['a', 'b'] })).toBe('Pair(a, b)');
  });

  test('RangePattern exclusive (line 497)', () => {
    const f = new Formatter();
    expect(f.formatMatchPattern({ type: 'RangePattern', start: 1, end: 10, inclusive: false })).toBe('1..10');
  });

  test('RangePattern inclusive (line 497)', () => {
    const f = new Formatter();
    expect(f.formatMatchPattern({ type: 'RangePattern', start: 1, end: 10, inclusive: true })).toBe('1..=10');
  });

  test('ArrayPattern (line 498-499)', () => {
    const f = new Formatter();
    const pattern = {
      type: 'ArrayPattern',
      elements: [
        { type: 'LiteralPattern', value: 1 },
        { type: 'BindingPattern', name: 'rest' }
      ]
    };
    expect(f.formatMatchPattern(pattern)).toBe('[1, rest]');
  });

  test('TuplePattern (line 500-501)', () => {
    const f = new Formatter();
    const pattern = {
      type: 'TuplePattern',
      elements: [
        { type: 'LiteralPattern', value: 'x' },
        { type: 'WildcardPattern' }
      ]
    };
    expect(f.formatMatchPattern(pattern)).toBe('("x", _)');
  });

  test('StringConcatPattern (line 502-503)', () => {
    const f = new Formatter();
    const pattern = {
      type: 'StringConcatPattern',
      prefix: '/api/',
      rest: { type: 'BindingPattern', name: 'path' }
    };
    expect(f.formatMatchPattern(pattern)).toBe('"/api/" ++ path');
  });

  test('unknown pattern type (line 504-505)', () => {
    const f = new Formatter();
    expect(f.formatMatchPattern({ type: 'UnknownMatchPattern' })).toBe('_');
  });
});

// ============================================================
// formatIfExpression (lines 509-528)
// ============================================================

describe('formatIfExpression', () => {
  test('simple if expression (lines 510-527)', () => {
    const f = new Formatter();
    const node = {
      type: 'IfExpression',
      condition: { type: 'BooleanLiteral', value: true },
      consequent: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }] },
      alternates: [],
      elseBody: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 2 } }] }
    };
    const result = f.formatExpr(node);
    expect(result).toContain('if true {');
    expect(result).toContain('} else {');
  });

  test('if expression with elif (lines 515-521)', () => {
    const f = new Formatter();
    const node = {
      type: 'IfExpression',
      condition: { type: 'BooleanLiteral', value: true },
      consequent: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 1 } }] },
      alternates: [
        {
          condition: { type: 'BooleanLiteral', value: false },
          body: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 2 } }] }
        }
      ],
      elseBody: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: { type: 'NumberLiteral', value: 3 } }] }
    };
    const result = f.formatExpr(node);
    expect(result).toContain('if true {');
    expect(result).toContain('elif false {');
    expect(result).toContain('else {');
  });
});

// ============================================================
// formatArrayLiteral (lines 530-541)
// ============================================================

describe('formatArrayLiteral', () => {
  test('empty array (line 531)', () => {
    const f = new Formatter();
    expect(f.formatArrayLiteral({ type: 'ArrayLiteral', elements: [] })).toBe('[]');
  });

  test('short array stays on one line (line 540)', () => {
    const f = new Formatter();
    const node = {
      type: 'ArrayLiteral',
      elements: [
        { type: 'NumberLiteral', value: 1 },
        { type: 'NumberLiteral', value: 2 },
        { type: 'NumberLiteral', value: 3 }
      ]
    };
    expect(f.formatArrayLiteral(node)).toBe('[1, 2, 3]');
  });

  test('long array goes multi-line (lines 534-538)', () => {
    const f = new Formatter({ maxLineLength: 20 });
    const node = {
      type: 'ArrayLiteral',
      elements: [
        { type: 'StringLiteral', value: 'this is a very long string' },
        { type: 'StringLiteral', value: 'another long string value' },
        { type: 'StringLiteral', value: 'third long string here' }
      ]
    };
    const result = f.formatArrayLiteral(node);
    expect(result).toContain('[\n');
    expect(result).toContain(']');
  });
});

// ============================================================
// formatObjectLiteral (lines 543-550)
// ============================================================

describe('formatObjectLiteral', () => {
  test('empty object (line 544)', () => {
    const f = new Formatter();
    expect(f.formatObjectLiteral({ type: 'ObjectLiteral', properties: [] })).toBe('{}');
  });

  test('object with shorthand (line 546)', () => {
    const f = new Formatter();
    const node = {
      type: 'ObjectLiteral',
      properties: [
        { key: { type: 'Identifier', name: 'x' }, shorthand: true }
      ]
    };
    expect(f.formatObjectLiteral(node)).toBe('{ x }');
  });

  test('object with key-value (line 547)', () => {
    const f = new Formatter();
    const node = {
      type: 'ObjectLiteral',
      properties: [
        { key: { type: 'Identifier', name: 'a' }, value: { type: 'NumberLiteral', value: 1 }, shorthand: false },
        { key: { type: 'Identifier', name: 'b' }, value: { type: 'NumberLiteral', value: 2 }, shorthand: false }
      ]
    };
    expect(f.formatObjectLiteral(node)).toBe('{ a: 1, b: 2 }');
  });
});

// ============================================================
// formatTemplateLiteral (lines 552-558)
// ============================================================

describe('formatTemplateLiteral', () => {
  test('text only (line 553-554)', () => {
    const f = new Formatter();
    const node = {
      type: 'TemplateLiteral',
      parts: [{ type: 'text', value: 'hello world' }]
    };
    expect(f.formatTemplateLiteral(node)).toBe('"hello world"');
  });

  test('with expression (line 555)', () => {
    const f = new Formatter();
    const node = {
      type: 'TemplateLiteral',
      parts: [
        { type: 'text', value: 'Hello ' },
        { type: 'expr', value: { type: 'Identifier', name: 'name' } }
      ]
    };
    expect(f.formatTemplateLiteral(node)).toBe('"Hello {name}"');
  });

  test('mixed text and expressions', () => {
    const f = new Formatter();
    const node = {
      type: 'TemplateLiteral',
      parts: [
        { type: 'text', value: '' },
        { type: 'expr', value: { type: 'Identifier', name: 'a' } },
        { type: 'text', value: ' + ' },
        { type: 'expr', value: { type: 'Identifier', name: 'b' } },
        { type: 'text', value: '' }
      ]
    };
    expect(f.formatTemplateLiteral(node)).toBe('"{a} + {b}"');
  });
});

// ============================================================
// Integration tests — full round-trip
// ============================================================

describe('integration: parse + format round-trip', () => {
  test('function with multiple statements', () => {
    const result = format('fn add(a: Int, b: Int) -> Int {\nreturn a + b\n}');
    expect(result).toContain('fn add(a: Int, b: Int) -> Int');
    expect(result).toContain('return a + b');
  });

  test('if-elif-else chain', () => {
    const result = format('if x > 0 { 1 } elif x < 0 { -1 } else { 0 }');
    expect(result).toContain('if');
    expect(result).toContain('elif');
    expect(result).toContain('else');
  });

  test('while with break and continue', () => {
    const result = format('while true {\nif done { break }\ncontinue\n}');
    expect(result).toContain('while true');
    expect(result).toContain('break');
    expect(result).toContain('continue');
  });

  test('for loop', () => {
    const result = format('for item in items { print(item) }');
    expect(result).toContain('for item in');
  });

  test('guard in function', () => {
    const result = format('fn validate(x: Int) {\nguard x > 0 else { return }\nprint(x)\n}');
    expect(result).toContain('guard x > 0 else');
  });

  test('import statements', () => {
    const result = format('import { foo, bar } from "module"');
    expect(result).toContain('import { foo, bar } from "module"');
  });

  test('type declaration with fields', () => {
    const result = format('type Point {\nx: Float\ny: Float\n}');
    expect(result).toContain('type Point');
  });

  test('var declaration', () => {
    const result = format('var count = 0');
    expect(result).toContain('var count = 0');
  });

  test('compound assignment', () => {
    const result = format('x = 0\nx += 5');
    expect(result).toContain('x += 5');
  });

  test('return without value', () => {
    const result = format('fn foo() { return }');
    expect(result).toContain('return');
  });

  test('return with value', () => {
    const result = format('fn bar() { return 42 }');
    expect(result).toContain('return 42');
  });

  test('expression statement', () => {
    const result = format('print("hello")');
    expect(result).toContain('print("hello")');
  });
});

// ============================================================
// Edge cases
// ============================================================

describe('edge cases', () => {
  test('deeply nested indentation', () => {
    const f = new Formatter({ indentSize: 4 });
    f.indent = 3;
    expect(f.i()).toBe('            '); // 12 spaces
  });

  test('format with empty body nodes', () => {
    const f = new Formatter();
    const result = f.formatBlockBody(null);
    expect(result).toBe('');
  });

  test('formatNode with completely unknown type falls to formatExpr', () => {
    const f = new Formatter();
    const result = f.formatNode({ type: 'CompletelyUnknownThing' });
    expect(result).toContain('/* unknown: CompletelyUnknownThing */');
  });

  test('multiple top-level declarations get blank lines', () => {
    const f = new Formatter();
    const ast = {
      type: 'Program',
      body: [
        {
          type: 'FunctionDeclaration',
          name: 'foo',
          params: [],
          body: { type: 'BlockStatement', body: [] },
          isAsync: false,
          isPublic: false,
          returnType: null
        },
        {
          type: 'FunctionDeclaration',
          name: 'bar',
          params: [],
          body: { type: 'BlockStatement', body: [] },
          isAsync: false,
          isPublic: false,
          returnType: null
        }
      ]
    };
    const result = f.format(ast);
    expect(result).toContain('\n\n');
  });

  test('trait declaration in _needsBlankLine', () => {
    const f = new Formatter();
    expect(f._needsBlankLine('TraitDeclaration', 'ExpressionStatement')).toBe(true);
  });

  test('server/browser/shared blocks in _needsBlankLine', () => {
    const f = new Formatter();
    expect(f._needsBlankLine('ServerBlock', 'Assignment')).toBe(true);
    expect(f._needsBlankLine('BrowserBlock', 'Assignment')).toBe(true);
    expect(f._needsBlankLine('SharedBlock', 'Assignment')).toBe(true);
  });
});
