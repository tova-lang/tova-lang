import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function analyze(source, options = {}) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>', options);
  return analyzer.analyze();
}

function getWarnings(source, options = {}) {
  return analyze(source, options).warnings;
}

function hasWarning(source, pattern, options = {}) {
  const warnings = getWarnings(source, options);
  return warnings.some(w => w.message.includes(pattern));
}

// ─── Exhaustiveness Checking ────────────────────────────────

describe('Match Exhaustiveness — Built-in Types', () => {
  test('warns on missing Ok variant in Result match', () => {
    expect(hasWarning(`
      fn check(r: Result) {
        match r {
          Err(e) => print(e)
        }
      }
    `, "missing 'Ok'")).toBe(true);
  });

  test('warns on missing Err variant in Result match', () => {
    expect(hasWarning(`
      fn check(r: Result) {
        match r {
          Ok(v) => print(v)
        }
      }
    `, "missing 'Err'")).toBe(true);
  });

  test('no warning when all Result variants covered', () => {
    expect(hasWarning(`
      fn check(r: Result) {
        match r {
          Ok(v) => print(v)
          Err(e) => print(e)
        }
      }
    `, "Non-exhaustive")).toBe(false);
  });

  test('warns on missing Some variant in Option match', () => {
    expect(hasWarning(`
      fn check(o: Option) {
        match o {
          None => print("none")
        }
      }
    `, "missing 'Some'")).toBe(true);
  });

  test('no warning with wildcard catch-all', () => {
    expect(hasWarning(`
      fn check(o: Option) {
        match o {
          Some(v) => print(v)
          _ => print("none")
        }
      }
    `, "Non-exhaustive")).toBe(false);
  });
});

describe('Match Exhaustiveness — User-Defined Types', () => {
  test('warns on missing variant from user type', () => {
    expect(hasWarning(`
      type Shape {
        Circle(radius: Float)
        Rectangle(w: Float, h: Float)
        Triangle(base: Float, height: Float)
      }
      fn area(s: Shape) {
        match s {
          Circle(r) => r * r * 3.14
          Rectangle(w, h) => w * h
        }
      }
    `, "missing 'Triangle'")).toBe(true);
  });

  test('no warning when all user type variants covered', () => {
    expect(hasWarning(`
      type Color {
        Red
        Green
        Blue
      }
      fn name(c: Color) {
        match c {
          Red => "red"
          Green => "green"
          Blue => "blue"
        }
      }
    `, "Non-exhaustive")).toBe(false);
  });

  test('no warning with binding catch-all', () => {
    expect(hasWarning(`
      type Direction {
        North
        South
        East
        West
      }
      fn name(d: Direction) {
        match d {
          North => "north"
          other => "other"
        }
      }
    `, "Non-exhaustive")).toBe(false);
  });
});

describe('Match Exhaustiveness — ADT with type structure', () => {
  test('stores type structure and uses it for checking', () => {
    const source = `
      type Status {
        Active
        Inactive
        Pending
      }
      fn describe(s: Status) {
        match s {
          Active => "active"
          Inactive => "inactive"
        }
      }
    `;
    const result = analyze(source);
    // Check that type registry was populated
    expect(result.typeRegistry.types.has('Status')).toBe(true);
    // Check that warning about missing Pending exists
    expect(result.warnings.some(w => w.message.includes("missing 'Pending'"))).toBe(true);
  });
});
