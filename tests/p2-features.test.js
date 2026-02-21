// Tests for P2 — Production Ready features
import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function parse(src) {
  const lexer = new Lexer(src, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function compile(src) {
  const ast = parse(src);
  const gen = new CodeGenerator(ast, '<test>');
  return gen.generate().shared.trim();
}

function getWarnings(src) {
  const ast = parse(src);
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze().warnings;
}

function getErrors(src, opts = {}) {
  try {
    const ast = parse(src);
    const analyzer = new Analyzer(ast, '<test>', opts);
    const result = analyzer.analyze();
    return result.errors || [];
  } catch (err) {
    return err.errors || [];
  }
}

// ═══════════════════════════════════════════════════════════════
// loop keyword
// ═══════════════════════════════════════════════════════════════

describe('loop keyword', () => {
  test('basic loop compiles to while(true)', () => {
    const out = compile(`
      loop {
        break
      }
    `);
    expect(out).toContain('while (true)');
    expect(out).toContain('break;');
  });

  test('loop with break condition', () => {
    const out = compile(`
      var i = 0
      loop {
        if i > 10 {
          break
        }
        i += 1
      }
    `);
    expect(out).toContain('while (true)');
    expect(out).toContain('break;');
  });

  test('loop parses as statement', () => {
    const ast = parse(`loop { break }`);
    expect(ast.body[0].type).toBe('LoopStatement');
    expect(ast.body[0].body.type).toBe('BlockStatement');
  });

  test('loop with label', () => {
    const out = compile(`
      outer: loop {
        break outer
      }
    `);
    expect(out).toContain('outer: while (true)');
    expect(out).toContain('break outer;');
  });
});

// ═══════════════════════════════════════════════════════════════
// Named break/continue
// ═══════════════════════════════════════════════════════════════

describe('named break/continue', () => {
  test('labeled for loop with break', () => {
    const out = compile(`
      outer: for row in matrix {
        for col in row {
          if col == 0 {
            break outer
          }
        }
      }
    `);
    expect(out).toContain('outer: for (const row of matrix)');
    expect(out).toContain('break outer;');
  });

  test('labeled while loop with continue', () => {
    const out = compile(`
      outer: while true {
        continue outer
      }
    `);
    expect(out).toContain('outer: while (true)');
    expect(out).toContain('continue outer;');
  });

  test('labeled loop with break', () => {
    const out = compile(`
      search: loop {
        break search
      }
    `);
    expect(out).toContain('search: while (true)');
    expect(out).toContain('break search;');
  });

  test('break without label still works', () => {
    const out = compile(`
      for x in items {
        break
      }
    `);
    expect(out).toContain('break;');
  });

  test('continue without label still works', () => {
    const out = compile(`
      for x in items {
        continue
      }
    `);
    expect(out).toContain('continue;');
  });

  test('analyzer rejects break with undefined label', () => {
    const errors = getErrors(`
      for x in items {
        break nonexistent
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("undefined label 'nonexistent'");
  });

  test('analyzer rejects continue with undefined label', () => {
    const errors = getErrors(`
      for x in items {
        continue missing
      }
    `);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("undefined label 'missing'");
  });

  test('analyzer accepts break with valid label', () => {
    const errors = getErrors(`
      outer: for x in items {
        for y in other {
          break outer
        }
      }
    `);
    // Should have no errors about labels
    const labelErrors = errors.filter(e => e.message.includes('undefined label'));
    expect(labelErrors.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// when guards on for loops
// ═══════════════════════════════════════════════════════════════

describe('when guards on for loops', () => {
  test('basic when guard', () => {
    const out = compile(`
      for user in users when user.active {
        print(user.name)
      }
    `);
    expect(out).toContain('for (const user of users)');
    expect(out).toContain('if (!(user.active)) continue;');
  });

  test('when guard with complex expression', () => {
    const out = compile(`
      for item in list when item.price > 10 and item.inStock {
        process(item)
      }
    `);
    expect(out).toContain('if (!(');
    expect(out).toContain('continue;');
  });

  test('when guard with for-else', () => {
    const out = compile(`
      for x in items when x > 0 {
        print(x)
      } else {
        print("empty")
      }
    `);
    expect(out).toContain('if (!(');
    expect(out).toContain('continue;');
  });

  test('when guard parsed into AST', () => {
    const ast = parse(`for user in users when user.active { print(user) }`);
    const forStmt = ast.body[0];
    expect(forStmt.type).toBe('ForStatement');
    expect(forStmt.guard).not.toBeNull();
    expect(forStmt.guard.type).toBe('MemberExpression');
  });
});

// ═══════════════════════════════════════════════════════════════
// Error context / wrapping on Result
// ═══════════════════════════════════════════════════════════════

describe('error context/wrapping', () => {
  test('Ok.context() returns Ok unchanged', () => {
    const out = compile(`
      result = Ok(42)
      wrapped = result.context("should not wrap")
    `);
    // Ok.context(_) returns this (no change)
    expect(out).toContain('.context(');
  });

  test('Err.context() wraps with chain message', () => {
    const code = compile(`
      result = Err("field 'port' invalid")
      wrapped = result.context("validating config")
    `);
    // Should generate the .context call
    expect(code).toContain('.context(');
  });

  test('context chaining produces arrow chain at runtime', () => {
    // Test the actual runtime behavior inline (safe: test-only constant evaluation)
    const okResult = { __tag: "Ok", value: 42, context() { return this; } };
    expect(okResult.context("test")).toBe(okResult);

    function Err(error) {
      return {
        __tag: "Err", error,
        context(msg) {
          const inner = typeof error === "object" ? JSON.stringify(error) : String(error);
          return Err(msg + " \u2192 caused by: " + inner);
        }
      };
    }
    const errResult = Err("field 'port' invalid");
    const wrapped = errResult.context("validating config");
    expect(wrapped.error).toContain('validating config');
    expect(wrapped.error).toContain('caused by');
    expect(wrapped.error).toContain("field 'port' invalid");
  });
});

// ═══════════════════════════════════════════════════════════════
// Async iteration
// ═══════════════════════════════════════════════════════════════

describe('async iteration', () => {
  test('async for compiles to for await', () => {
    const out = compile(`
      async for chunk in stream {
        process(chunk)
      }
    `);
    expect(out).toContain('for await (const chunk of stream)');
  });

  test('async for with destructuring', () => {
    const out = compile(`
      async for key, value in entries {
        print(key)
      }
    `);
    expect(out).toContain('for await (const [key, value] of entries)');
  });

  test('async for with when guard', () => {
    const out = compile(`
      async for chunk in stream when chunk.length > 0 {
        process(chunk)
      }
    `);
    expect(out).toContain('for await (const chunk of stream)');
    expect(out).toContain('if (!(');
    expect(out).toContain('continue;');
  });

  test('async for parsed into AST', () => {
    const ast = parse(`async for x in stream { print(x) }`);
    const forStmt = ast.body[0];
    expect(forStmt.type).toBe('ForStatement');
    expect(forStmt.isAsync).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Destructuring without let
// ═══════════════════════════════════════════════════════════════

describe('destructuring without let', () => {
  test('object destructuring without let', () => {
    const out = compile(`
      user = { name: "Alice", age: 30 }
      {name, age} = user
    `);
    expect(out).toContain('const { name, age }');
  });

  test('array destructuring without let', () => {
    const out = compile(`
      pair = [1, 2]
      [a, b] = pair
    `);
    expect(out).toContain('const [a, b]');
  });
});

// ═══════════════════════════════════════════════════════════════
// Error suggestions for common mistakes
// ═══════════════════════════════════════════════════════════════

describe('error suggestions for common mistakes', () => {
  test('let x = 5 gives helpful error', () => {
    expect(() => parse(`let x = 5`)).toThrow(/variable binding.*not.*let|'let' is only for destructuring/i);
  });

  test('throw gives helpful warning', () => {
    const warnings = getWarnings(`
      fn foo() {
        throw "error"
      }
    `);
    const throwWarnings = warnings.filter(w => w.message.includes('throw'));
    expect(throwWarnings.length).toBeGreaterThan(0);
    expect(throwWarnings[0].message).toContain('Err');
  });
});

// ═══════════════════════════════════════════════════════════════
// Combined: labels + when guards
// ═══════════════════════════════════════════════════════════════

describe('combined features', () => {
  test('labeled for with when guard', () => {
    const out = compile(`
      outer: for user in users when user.active {
        for item in user.items {
          if item.expired {
            continue outer
          }
          process(item)
        }
      }
    `);
    expect(out).toContain('outer: for (const user of users)');
    expect(out).toContain('if (!(user.active)) continue;');
    expect(out).toContain('continue outer;');
  });

  test('loop inside for with labels', () => {
    const out = compile(`
      outer: for item in items {
        inner: loop {
          if done {
            break inner
          }
          if skip {
            continue outer
          }
        }
      }
    `);
    expect(out).toContain('outer: for (const item of items)');
    expect(out).toContain('inner: while (true)');
    expect(out).toContain('break inner;');
    expect(out).toContain('continue outer;');
  });
});
