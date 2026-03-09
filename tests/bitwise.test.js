// Tests for bitwise operators: &, |, ^, ~, <<, >>, >>>
import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { TokenType } from '../src/lexer/tokens.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function lex(src) {
  return new Lexer(src, '<test>').tokenize();
}

function parse(src) {
  const tokens = lex(src);
  return new Parser(tokens, '<test>').parse();
}

function parseExpr(src) {
  const ast = parse(src);
  const stmt = ast.body[0];
  return stmt.type === 'ExpressionStatement' ? stmt.expression : stmt;
}

function compile(src) {
  const tokens = lex(src);
  const ast = new Parser(tokens, '<test>').parse();
  const gen = new CodeGenerator(ast, '<test>');
  return gen.generate().shared.trim();
}

function analyze(src) {
  const tokens = lex(src);
  const ast = new Parser(tokens, '<test>').parse();
  const analyzer = new Analyzer(ast, '<test>');
  const result = analyzer.analyze();
  return result.warnings || [];
}

// ─── Lexer Tests ────────────────────────────────────────────────

describe('Bitwise — Lexer', () => {
  test('& produces AMPERSAND token', () => {
    const tokens = lex('a & b');
    expect(tokens[1].type).toBe(TokenType.AMPERSAND);
    expect(tokens[1].value).toBe('&');
  });

  test('&& still produces AND_AND token', () => {
    const tokens = lex('a && b');
    expect(tokens[1].type).toBe(TokenType.AND_AND);
  });

  test('&= produces BIT_AND_ASSIGN token', () => {
    const tokens = lex('a &= b');
    expect(tokens[1].type).toBe(TokenType.BIT_AND_ASSIGN);
    expect(tokens[1].value).toBe('&=');
  });

  test('| still produces BAR token', () => {
    const tokens = lex('a | b');
    expect(tokens[1].type).toBe(TokenType.BAR);
  });

  test('|= produces BIT_OR_ASSIGN token', () => {
    const tokens = lex('a |= b');
    expect(tokens[1].type).toBe(TokenType.BIT_OR_ASSIGN);
    expect(tokens[1].value).toBe('|=');
  });

  test('|> still produces PIPE token', () => {
    const tokens = lex('a |> b');
    expect(tokens[1].type).toBe(TokenType.PIPE);
  });

  test('|| still produces OR_OR token', () => {
    const tokens = lex('a || b');
    expect(tokens[1].type).toBe(TokenType.OR_OR);
  });

  test('^ produces CARET token', () => {
    const tokens = lex('a ^ b');
    expect(tokens[1].type).toBe(TokenType.CARET);
    expect(tokens[1].value).toBe('^');
  });

  test('^= produces BIT_XOR_ASSIGN token', () => {
    const tokens = lex('a ^= b');
    expect(tokens[1].type).toBe(TokenType.BIT_XOR_ASSIGN);
    expect(tokens[1].value).toBe('^=');
  });

  test('~ produces TILDE token', () => {
    const tokens = lex('~a');
    expect(tokens[0].type).toBe(TokenType.TILDE);
    expect(tokens[0].value).toBe('~');
  });

  test('<< produces LEFT_SHIFT token', () => {
    const tokens = lex('a << b');
    expect(tokens[1].type).toBe(TokenType.LEFT_SHIFT);
    expect(tokens[1].value).toBe('<<');
  });

  test('<<= produces LEFT_SHIFT_ASSIGN token', () => {
    const tokens = lex('a <<= b');
    expect(tokens[1].type).toBe(TokenType.LEFT_SHIFT_ASSIGN);
    expect(tokens[1].value).toBe('<<=');
  });

  test('<= still produces LESS_EQUAL token', () => {
    const tokens = lex('a <= b');
    expect(tokens[1].type).toBe(TokenType.LESS_EQUAL);
  });

  test('& inside JSX text is not AMPERSAND', () => {
    // Inside JSX children, & is consumed as part of JSX_TEXT, not as a separate operator
    const tokens = lex('<p>a & b</p>');
    expect(tokens.some(t => t.type === TokenType.AMPERSAND)).toBe(false);
  });

  test('<< not emitted when previous token is not a value', () => {
    // At start of expression, << should be LESS + LESS (for JSX safety)
    const tokens = lex('<<');
    expect(tokens[0].type).toBe(TokenType.LESS);
    expect(tokens[1].type).toBe(TokenType.LESS);
  });
});

// ─── Parser Tests ───────────────────────────────────────────────

describe('Bitwise — Parser', () => {
  test('bitwise AND: a & b', () => {
    const expr = parseExpr('a & b');
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('&');
    expect(expr.left.name).toBe('a');
    expect(expr.right.name).toBe('b');
  });

  test('bitwise OR: a | b', () => {
    const expr = parseExpr('a | b');
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('|');
    expect(expr.left.name).toBe('a');
    expect(expr.right.name).toBe('b');
  });

  test('bitwise XOR: a ^ b', () => {
    const expr = parseExpr('a ^ b');
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('^');
  });

  test('bitwise NOT: ~a', () => {
    const expr = parseExpr('~a');
    expect(expr.type).toBe('UnaryExpression');
    expect(expr.operator).toBe('~');
    expect(expr.operand.name).toBe('a');
  });

  test('left shift: a << 2', () => {
    const expr = parseExpr('a << 2');
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('<<');
  });

  test('right shift: a >> 2', () => {
    const expr = parseExpr('a >> 2');
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('>>');
  });

  test('unsigned right shift: a >>> 2', () => {
    const expr = parseExpr('a >>> 2');
    expect(expr.type).toBe('BinaryExpression');
    expect(expr.operator).toBe('>>>');
  });

  // Precedence tests
  test('& has lower precedence than comparison', () => {
    // a & b == c should parse as a & (b == c)
    const expr = parseExpr('a & b == c');
    expect(expr.operator).toBe('&');
    expect(expr.right.operator).toBe('==');
  });

  test('| has lower precedence than ^', () => {
    // a | b ^ c should parse as a | (b ^ c)
    const expr = parseExpr('a | b ^ c');
    expect(expr.operator).toBe('|');
    expect(expr.right.operator).toBe('^');
  });

  test('^ has lower precedence than &', () => {
    // a ^ b & c should parse as a ^ (b & c)
    const expr = parseExpr('a ^ b & c');
    expect(expr.operator).toBe('^');
    expect(expr.right.operator).toBe('&');
  });

  test('& has lower precedence than <<', () => {
    // a & b << 2 should parse as a & (b << 2)
    const expr = parseExpr('a & b << 2');
    expect(expr.operator).toBe('&');
    expect(expr.right.operator).toBe('<<');
  });

  test('<< has lower precedence than +', () => {
    // a << b + 1 should parse as a << (b + 1)
    const expr = parseExpr('a << b + 1');
    expect(expr.operator).toBe('<<');
    // right side should be addition
    expect(expr.right.operator).toBe('+');
  });

  test('| has higher precedence than && (logical AND)', () => {
    // a | b && c should parse as (a | b) && c
    const expr = parseExpr('a | b && c');
    expect(expr.type).toBe('LogicalExpression');
    expect(expr.operator).toBe('and');
    expect(expr.left.operator).toBe('|');
  });

  test('double negation: ~~a', () => {
    const expr = parseExpr('~~a');
    expect(expr.type).toBe('UnaryExpression');
    expect(expr.operator).toBe('~');
    expect(expr.operand.type).toBe('UnaryExpression');
    expect(expr.operand.operator).toBe('~');
  });

  test('chained shifts: a << 2 >> 1', () => {
    const expr = parseExpr('a << 2 >> 1');
    expect(expr.operator).toBe('>>');
    expect(expr.left.operator).toBe('<<');
  });

  test('complex: (a & 0xFF) | (b << 8)', () => {
    const expr = parseExpr('(a & 0xFF) | (b << 8)');
    expect(expr.operator).toBe('|');
  });

  // Compound assignment tests
  test('compound &=', () => {
    const ast = parse('fn main() { var x = 5\nx &= 3 }');
    const stmt = ast.body[0].body.body[1];
    expect(stmt.type).toBe('CompoundAssignment');
    expect(stmt.operator).toBe('&=');
  });

  test('compound |=', () => {
    const ast = parse('fn main() { var x = 5\nx |= 3 }');
    const stmt = ast.body[0].body.body[1];
    expect(stmt.type).toBe('CompoundAssignment');
    expect(stmt.operator).toBe('|=');
  });

  test('compound ^=', () => {
    const ast = parse('fn main() { var x = 5\nx ^= 3 }');
    const stmt = ast.body[0].body.body[1];
    expect(stmt.type).toBe('CompoundAssignment');
    expect(stmt.operator).toBe('^=');
  });

  test('compound <<=', () => {
    const ast = parse('fn main() { var x = 5\nx <<= 2 }');
    const stmt = ast.body[0].body.body[1];
    expect(stmt.type).toBe('CompoundAssignment');
    expect(stmt.operator).toBe('<<=');
  });

  // Nested generics should not break
  test('nested generics still work with >>', () => {
    const ast = parse('fn foo(x: Map<String, Option<Int>>) { x }');
    const param = ast.body[0].params[0];
    expect(param.typeAnnotation.name).toBe('Map');
    expect(param.typeAnnotation.typeParams[1].name).toBe('Option');
    expect(param.typeAnnotation.typeParams[1].typeParams[0].name).toBe('Int');
  });
});

// ─── Codegen Tests ──────────────────────────────────────────────

describe('Bitwise — Codegen', () => {
  test('bitwise AND compiles correctly', () => {
    const code = compile('a & b');
    expect(code).toContain('(a & b)');
  });

  test('bitwise OR compiles correctly', () => {
    const code = compile('a | b');
    expect(code).toContain('(a | b)');
  });

  test('bitwise XOR compiles correctly', () => {
    const code = compile('a ^ b');
    expect(code).toContain('(a ^ b)');
  });

  test('bitwise NOT compiles correctly', () => {
    const code = compile('~a');
    expect(code).toContain('(~a)');
  });

  test('left shift compiles correctly', () => {
    const code = compile('a << 2');
    expect(code).toContain('(a << 2)');
  });

  test('right shift compiles correctly', () => {
    const code = compile('a >> 2');
    expect(code).toContain('(a >> 2)');
  });

  test('unsigned right shift compiles correctly', () => {
    const code = compile('a >>> 2');
    expect(code).toContain('(a >>> 2)');
  });

  // Constant folding
  test('constant folding: 5 & 3 = 1', () => {
    const code = compile('5 & 3');
    expect(code).toContain('1');
    expect(code).not.toContain('&');
  });

  test('constant folding: 5 | 3 = 7', () => {
    const code = compile('5 | 3');
    expect(code).toContain('7');
    expect(code).not.toContain('|');
  });

  test('constant folding: 5 ^ 3 = 6', () => {
    const code = compile('5 ^ 3');
    expect(code).toContain('6');
    expect(code).not.toContain('^');
  });

  test('constant folding: 1 << 3 = 8', () => {
    const code = compile('1 << 3');
    expect(code).toContain('8');
    expect(code).not.toContain('<<');
  });

  test('constant folding: 8 >> 2 = 2', () => {
    const code = compile('8 >> 2');
    expect(code).toContain('2');
    expect(code).not.toContain('>>');
  });

  test('constant folding: ~0 = -1', () => {
    const code = compile('~0');
    expect(code).toContain('-1');
    expect(code).not.toContain('~');
  });

  // Compound assignment codegen
  test('compound &= compiles', () => {
    const code = compile('fn main() { var x = 15\nx &= 7 }');
    expect(code).toContain('x &= 7');
  });

  test('compound |= compiles', () => {
    const code = compile('fn main() { var x = 0\nx |= 5 }');
    expect(code).toContain('x |= 5');
  });

  test('compound ^= compiles', () => {
    const code = compile('fn main() { var x = 7\nx ^= 3 }');
    expect(code).toContain('x ^= 3');
  });

  test('compound <<= compiles', () => {
    const code = compile('fn main() { var x = 1\nx <<= 4 }');
    expect(code).toContain('x <<= 4');
  });
});

// ─── Analyzer Tests ─────────────────────────────────────────────

describe('Bitwise — Analyzer', () => {
  test('no warning for integer bitwise AND', () => {
    const warnings = analyze('fn foo(a: Int, b: Int) { a & b }');
    const bitwiseWarns = warnings.filter(w => w.message.includes("'&'"));
    expect(bitwiseWarns.length).toBe(0);
  });

  test('no warning for integer bitwise OR', () => {
    const warnings = analyze('fn foo(a: Int, b: Int) { a | b }');
    const bitwiseWarns = warnings.filter(w => w.message.includes("'|'"));
    expect(bitwiseWarns.length).toBe(0);
  });

  test('infers Int from bitwise operation', () => {
    // This tests indirectly: if result is used as Int, no warning
    const warnings = analyze('fn foo(a: Int) -> Int { a & 0xFF }');
    const typeWarns = warnings.filter(w => w.message.includes('Type mismatch'));
    expect(typeWarns.length).toBe(0);
  });
});
