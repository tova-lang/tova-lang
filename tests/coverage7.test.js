// Final precision — targeting last reachable uncovered lines
import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { BaseCodegen } from '../src/codegen/base-codegen.js';

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  return new Parser(lexer.tokenize(), '<test>').parse();
}

function compile(source) {
  return new CodeGenerator(parse(source), '<test>').generate();
}

// ═══════════════════════════════════════════════════════════
// PARSER line 1193: fn lambda body where ASSIGN matched but
// expr is not Identifier → body = expr (non-assignment fallback)
// ═══════════════════════════════════════════════════════════

describe('Parser — fn lambda member-expr = value (line 1193)', () => {
  test('fn lambda with member expression before = treats member as body', () => {
    // fn(a) a.b = 5 → lambda body is a.b, = consumed, 5 is next statement
    const ast = parse('x = fn(a) a.b = 5');
    const lambda = ast.body[0].values[0];
    expect(lambda.type).toBe('LambdaExpression');
    // Body should be the member expression a.b (not an assignment)
    expect(lambda.body.type).toBe('MemberExpression');
    // The '5' should be parsed as a separate expression statement
    expect(ast.body.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════
// PARSER lines 1452-1453: arrow lambda param with colon
// then non-identifier → isLambda = false, backtrack
// ═══════════════════════════════════════════════════════════

describe('Parser — paren lambda backtrack on non-type after colon (lines 1452-1453)', () => {
  test('(identifier: number) triggers backtrack and throws', () => {
    // (a: 123) → parser tries lambda, sees a:, then 123 (not identifier for type)
    // Sets isLambda=false, breaks, backtracks, tries (a : 123) as paren expr → fails
    expect(() => parse('x = (a: 123)')).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════
// PARSER line 391: break in JSX for body when token isn't
// <, string, or { — reached with empty for body
// ═══════════════════════════════════════════════════════════

describe('Parser — JSX for body break (line 391)', () => {
  test('empty JSX for body hits break immediately', () => {
    // for x in items { } — the } is RBRACE which isn't <, string, or {
    // The while condition !check(RBRACE) catches it before break though
    // So break is only reachable if there's a non-JSX token before }
    // This is essentially a dead-code safety net
    const ast = parse('client { component C { <div> for x in items { } </div> } }');
    const comp = ast.body[0].body[0];
    const forNode = comp.body[0].children.find(c => c.type === 'JSXFor');
    expect(forNode.body.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// BASE CODEGEN — exercise remaining paths through full pipeline
// ═══════════════════════════════════════════════════════════

describe('Codegen — match with all pattern types via full compile', () => {
  test('match with literal, range, variant, binding, wildcard', () => {
    const result = compile(`
      shared {
        type Shape { Circle(r), Rect(w, h) }
        x = match shape {
          Circle(r) => r * 2,
          Rect(w, h) => w * h,
          _ => 0
        }
        y = match n {
          1..=5 => "low",
          6..10 => "high",
          n if n > 100 => "huge",
          _ => "other"
        }
      }
    `);
    expect(result.shared).toContain('__tag === "Circle"');
    expect(result.shared).toContain('<='); // inclusive range
    expect(result.shared).toContain('(n) =>'); // binding guard
  });
});

describe('Codegen — genBlock exercised via nested if', () => {
  test('deeply nested if generates blocks', () => {
    const result = compile('shared { if true { if false { if true { print(1) } } } }');
    expect(result.shared).toContain('if (true)');
    expect(result.shared).toContain('if (false)');
  });
});

// ═══════════════════════════════════════════════════════════
// Slice codegen with step via full compile
// ═══════════════════════════════════════════════════════════

describe('Codegen — slice with step via compile', () => {
  test('slice with step through pipeline', () => {
    const result = compile('shared { x = list[:5:2] }');
    expect(result.shared).toContain('for (let i');
  });
});
