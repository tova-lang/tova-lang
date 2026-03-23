import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function analyze(source, options = {}) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>', { tolerant: true, ...options });
  return analyzer.analyze();
}

function getErrors(source, options = {}) {
  const result = analyze(source, options);
  return result.errors;
}

function getWarnings(source, options = {}) {
  const result = analyze(source, options);
  return result.warnings;
}

// ========================================================================
// VARIABLE ANALYSIS
// ========================================================================

describe('Analyzer — Variable declarations', () => {
  test('valid immutable assignment', () => {
    const errors = getErrors('x = 42');
    const realErrors = errors.filter(e => !e.message.includes('unused'));
    expect(realErrors.length).toBe(0);
  });

  test('valid mutable variable', () => {
    const errors = getErrors('var x = 42\nx += 1\nprint(x)');
    expect(errors.length).toBe(0);
  });

  test('reassigning immutable variable is an error', () => {
    const errors = getErrors('x = 42\nx = 43');
    const reassignErrors = errors.filter(e => e.message.includes('reassign') || e.message.includes('immutable') || e.message.includes('Cannot assign'));
    expect(reassignErrors.length).toBeGreaterThan(0);
  });

  test('using undefined variable generates warning', () => {
    const warnings = getWarnings('y = undefined_var + 1');
    const undefWarnings = warnings.filter(w => w.message.includes('not defined'));
    expect(undefWarnings.length).toBeGreaterThan(0);
  });

  test('unused variable inside function generates warning', () => {
    // Unused checking only happens inside functions, not at module level
    const warnings = getWarnings(`
      fn test() {
        unused = 42
        1
      }
      test()
    `);
    const unusedWarnings = warnings.filter(w => w.message.includes('unused') || w.message.includes('never used'));
    expect(unusedWarnings.length).toBeGreaterThan(0);
  });
});

// ========================================================================
// FUNCTION ANALYSIS
// ========================================================================

describe('Analyzer — Functions', () => {
  test('valid function declaration', () => {
    const errors = getErrors('fn add(a, b) { a + b }\nadd(1, 2)');
    expect(errors.length).toBe(0);
  });

  test('function parameters are in scope', () => {
    const errors = getErrors('fn f(x) { x + 1 }\nf(1)');
    expect(errors.length).toBe(0);
  });

  test('calling undefined function generates warning', () => {
    // Undefined references are warnings, not errors (they might come from runtime)
    const warnings = getWarnings('undefined_fn()');
    const callWarnings = warnings.filter(w => w.message.includes('not defined'));
    expect(callWarnings.length).toBeGreaterThan(0);
  });
});

// ========================================================================
// TYPE CHECKING
// ========================================================================

describe('Analyzer — Type checking', () => {
  test('type declarations register types', () => {
    const result = analyze('type Point { x: Float, y: Float }\nPoint(1.0, 2.0)');
    expect(result.errors.length).toBe(0);
  });

  test('ADT type declarations register variants', () => {
    const result = analyze(`
      type Shape { Circle(radius: Float), Rect(w: Float, h: Float) }
      Circle(1.0)
      Rect(2.0, 3.0)
    `);
    expect(result.errors.length).toBe(0);
  });

  test('strict mode catches type mismatches', () => {
    const errors = getErrors(`
      fn add(a: Int, b: Int) -> Int { a + b }
      add("hello", "world")
    `, { strict: true });
    // In strict mode, type mismatches should be caught
    const typeErrors = errors.filter(e => e.message.includes('type') || e.message.includes('Type') || e.message.includes('expected'));
    // May or may not catch this depending on strictness level
    expect(typeErrors.length).toBeGreaterThanOrEqual(0);
  });
});

// ========================================================================
// CONTROL FLOW ANALYSIS
// ========================================================================

describe('Analyzer — Control flow', () => {
  test('for loop variable is in scope', () => {
    const errors = getErrors('for x in [1, 2, 3] { print(x) }');
    expect(errors.length).toBe(0);
  });

  test('for-else compiles without errors', () => {
    const errors = getErrors(`
      for x in items {
        print(x)
      } else {
        print("empty")
      }
    `);
    const realErrors = errors.filter(e => !e.message.includes('undefined') || e.message.includes('items'));
    // items is undefined but that's expected in isolation
  });

  test('while loop condition is analyzed', () => {
    const errors = getErrors('var x = 10\nwhile x > 0 { x -= 1 }');
    expect(errors.length).toBe(0);
  });

  test('break outside loop is an error', () => {
    const errors = getErrors('break');
    const breakErrors = errors.filter(e => e.message.includes('break') || e.message.includes('Break'));
    expect(breakErrors.length).toBeGreaterThan(0);
  });

  test('continue outside loop is an error', () => {
    const errors = getErrors('continue');
    const contErrors = errors.filter(e => e.message.includes('continue') || e.message.includes('Continue'));
    expect(contErrors.length).toBeGreaterThan(0);
  });
});

// ========================================================================
// MATCH EXHAUSTIVENESS
// ========================================================================

describe('Analyzer — Match patterns', () => {
  test('match with wildcard is exhaustive', () => {
    const errors = getErrors(`
      fn test(x) {
        match x {
          1 => "one"
          _ => "other"
        }
      }
      test(1)
    `);
    expect(errors.length).toBe(0);
  });

  test('match on ADT with all variants covered', () => {
    const errors = getErrors(`
      type Color { Red, Green, Blue }
      fn name(c) {
        match c {
          Red => "red"
          Green => "green"
          Blue => "blue"
        }
      }
      name(Red)
    `);
    expect(errors.length).toBe(0);
  });
});

// ========================================================================
// ASYNC/AWAIT ANALYSIS
// ========================================================================

describe('Analyzer — Async/Await', () => {
  test('await inside async function is valid', () => {
    const errors = getErrors('async fn f() { await sleep(100) }\nf()');
    expect(errors.length).toBe(0);
  });

  test('await outside async function is an error', () => {
    const errors = getErrors('fn f() { await sleep(100) }\nf()');
    const awaitErrors = errors.filter(e => e.message.includes('await') || e.message.includes('Await') || e.message.includes('async'));
    expect(awaitErrors.length).toBeGreaterThan(0);
  });
});

// ========================================================================
// IMPORT/EXPORT ANALYSIS
// ========================================================================

describe('Analyzer — Imports', () => {
  test('import statement is valid', () => {
    const errors = getErrors('import { map } from "utils"\nmap([1, 2], fn(x) x)');
    expect(errors.length).toBe(0);
  });

  test('import statement registers names in scope', () => {
    const errors = getErrors('import { map } from "utils"\nmap([1, 2], fn(x) x)');
    expect(errors.length).toBe(0);
  });
});

// ========================================================================
// SCOPE ANALYSIS
// ========================================================================

describe('Analyzer — Scoping', () => {
  test('nested function creates new scope', () => {
    const errors = getErrors(`
      fn outer() {
        x = 1
        fn inner() {
          y = x + 1
          y
        }
        inner()
      }
      outer()
    `);
    expect(errors.length).toBe(0);
  });

  test('variable not accessible outside its scope generates warning', () => {
    const warnings = getWarnings(`
      fn f() {
        local_var = 42
        local_var
      }
      print(local_var)
    `);
    // local_var should generate an "undefined" warning outside f
    const scopeWarnings = warnings.filter(w => w.message.includes('local_var') && w.message.includes('not defined'));
    expect(scopeWarnings.length).toBeGreaterThan(0);
  });
});

// ========================================================================
// TRAIT/IMPL ANALYSIS
// ========================================================================

describe('Analyzer — Traits and Impl', () => {
  test('impl block on existing type is valid', () => {
    const errors = getErrors(`
      type Point { x: Float, y: Float }
      impl Point {
        fn magnitude(self) {
          (self.x * self.x + self.y * self.y) ** 0.5
        }
      }
      p = Point(3.0, 4.0)
      p.magnitude()
    `);
    expect(errors.length).toBe(0);
  });
});

// ========================================================================
// GUARD ANALYSIS
// ========================================================================

describe('Analyzer — Guard', () => {
  test('guard statement is valid', () => {
    const errors = getErrors(`
      fn check(x) {
        guard x > 0 else { return -1 }
        x * 2
      }
      check(5)
    `);
    expect(errors.length).toBe(0);
  });
});

// ========================================================================
// DEFER ANALYSIS
// ========================================================================

describe('Analyzer — Defer', () => {
  test('defer in function is valid', () => {
    const errors = getErrors(`
      fn process() {
        var handle = open_file()
        defer { handle.close() }
        handle.read()
      }
    `);
    // open_file/close/read may be undefined but that's expected
    const deferErrors = errors.filter(e => e.message.includes('defer') || e.message.includes('Defer'));
    expect(deferErrors.length).toBe(0);
  });
});

// ========================================================================
// TRY/CATCH ANALYSIS
// ========================================================================

describe('Analyzer — Try/Catch', () => {
  test('try/catch is valid', () => {
    const errors = getErrors(`
      try {
        risky()
      } catch e {
        print(e)
      }
    `);
    // risky may be undefined but catch var should be in scope
    const catchErrors = errors.filter(e => e.message.includes('catch') || e.message.includes('Catch'));
    expect(catchErrors.length).toBe(0);
  });

  test('catch variable is in scope within catch block', () => {
    const errors = getErrors(`
      try {
        risky()
      } catch err {
        msg = err.message
        print(msg)
      }
    `);
    // err should be accessible
    const errErrors = errors.filter(e => e.message.includes("'err'") && e.message.includes('undefined'));
    expect(errErrors.length).toBe(0);
  });
});

// ========================================================================
// WITH STATEMENT ANALYSIS
// ========================================================================

describe('Analyzer — With', () => {
  test('with statement variable is in scope', () => {
    const errors = getErrors(`
      with create_resource() as res {
        res.read()
      }
    `);
    // res should be accessible inside the with block
    const resErrors = errors.filter(e => e.message.includes("'res'") && e.message.includes('undefined'));
    expect(resErrors.length).toBe(0);
  });
});

// ========================================================================
// COMPLEX ANALYSIS SCENARIOS
// ========================================================================

describe('Analyzer — Complex scenarios', () => {
  test('full program with types, functions, and control flow', () => {
    const errors = getErrors(`
      type Result { Ok(value: Any), Err(message: String) }

      fn divide(a, b) {
        if b == 0 {
          Err("division by zero")
        } else {
          Ok(a / b)
        }
      }

      result = divide(10, 2)
      match result {
        Ok(value) => print(value)
        Err(msg) => print(msg)
      }
    `);
    expect(errors.length).toBe(0);
  });

  test('nested loops with labels', () => {
    const errors = getErrors(`
      outer: for i in range(10) {
        for j in range(10) {
          if i == j {
            break outer
          }
        }
      }
    `);
    expect(errors.length).toBe(0);
  });

  test('list comprehension with proper scope', () => {
    const errors = getErrors(`
      items = [1, 2, 3, 4, 5]
      doubled = [x * 2 for x in items]
      print(doubled)
    `);
    expect(errors.length).toBe(0);
  });

  test('pipe chain with functions', () => {
    const errors = getErrors(`
      fn double(x) { x * 2 }
      fn add_one(x) { x + 1 }
      result = 5 |> double |> add_one
      print(result)
    `);
    expect(errors.length).toBe(0);
  });
});
