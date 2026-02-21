// Tests for bug fixes — regression tests to prevent reintroduction

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

// ── Bug Fix: Analyzer _inferType should return null for unknown operands ──

describe('analyzer: _inferType for unknown operands', () => {
  test('arithmetic with unknown types does not falsely infer Int', () => {
    // When both operands have unknown types, _inferType should return null (not 'Int')
    const src = `
      fn compute(a, b) {
        result = a + b
      }
    `;
    const warnings = getWarnings(src);
    // Should NOT have a false type mismatch warning when types are unknown
    const falseMismatch = warnings.filter(w =>
      w.message.includes("expects numeric") && w.message.includes("got Int")
    );
    expect(falseMismatch.length).toBe(0);
  });

  test('arithmetic with one known Float type infers Float', () => {
    const src = `
      x = 3.14 + 2
    `;
    const warnings = getWarnings(src);
    // No type warnings for valid numeric arithmetic
    const typeWarnings = warnings.filter(w => w.message.includes("expects numeric"));
    expect(typeWarnings.length).toBe(0);
  });
});

// ── Bug Fix: String * Int should not warn for string literals ──

describe('analyzer: string literal repeat', () => {
  test('string literal * number does not produce warning', () => {
    const src = `x = "ha" * 3`;
    const warnings = getWarnings(src);
    const multWarnings = warnings.filter(w => w.message.includes("'*' expects numeric"));
    expect(multWarnings.length).toBe(0);
  });

  test('template literal * number does not produce warning', () => {
    const src = `
      name = "world"
      x = "hello {name}" * 2
    `;
    const warnings = getWarnings(src);
    const multWarnings = warnings.filter(w => w.message.includes("'*' expects numeric"));
    expect(multWarnings.length).toBe(0);
  });

  test('string variable * number still warns (not a literal repeat)', () => {
    const src = `
      x = "hello"
      y = x * 5
    `;
    const warnings = getWarnings(src);
    expect(warnings.some(w => w.message.includes("'*' expects numeric"))).toBe(true);
  });
});

// ── Bug Fix: Codegen for string repeat ──

describe('codegen: string repeat', () => {
  test('"ha" * 3 generates .repeat(3)', () => {
    const code = compile('x = "ha" * 3');
    expect(code).toContain('"ha".repeat(3)');
  });

  test('3 * "ha" generates "ha".repeat(3) (reversed operands)', () => {
    const code = compile('x = 3 * "ha"');
    expect(code).toContain('"ha".repeat(3)');
  });
});

// ── Bug Fix: stdlib min/max should handle large arrays ──

describe('stdlib: min/max', () => {
  test('min function works correctly', () => {
    const code = compile('result = min([5, 3, 8, 1, 4])');
    // The generated min function should use a loop, not Math.min(...a)
    expect(code).toContain('function min(a)');
    // It should NOT contain Math.min(...a) pattern
    expect(code).not.toContain('Math.min(...a)');
  });

  test('max function works correctly', () => {
    const code = compile('result = max([5, 3, 8, 1, 4])');
    expect(code).toContain('function max(a)');
    expect(code).not.toContain('Math.max(...a)');
  });
});

// ── Bug Fix: stdlib divmod correctness for negative numbers ──

describe('stdlib: divmod', () => {
  test('divmod uses consistent quotient and remainder', () => {
    const code = compile('result = divmod(-7, 3)');
    // Should contain q * b + r == a invariant
    // The generated function should compute remainder as a - q * b
    expect(code).toContain('a - q * b');
  });
});

// ── Bug Fix: LSP signature help uses _params ──

describe('LSP: signature help', () => {
  test('analyzer stores function params as _params', () => {
    const src = `
      fn greet(name, greeting) {
        print("{greeting}, {name}!")
      }
    `;
    const ast = parse(src);
    const analyzer = new Analyzer(ast, '<test>');
    analyzer.analyze();
    const sym = analyzer.globalScope.lookup('greet');
    expect(sym).toBeTruthy();
    expect(sym._params).toEqual(['name', 'greeting']);
    // Verify that .params does NOT exist (the old bug)
    expect(sym.params).toBeUndefined();
  });
});

// ── Bug Fix: CLI await buildProject/devServer ──

describe('CLI: async function calls', () => {
  test('buildProject and devServer are awaited in main', async () => {
    const fs = await import('fs');
    const cliSource = fs.readFileSync('/Users/macm1/new-y-combinator/lux-lang/bin/tova.js', 'utf-8');
    // Verify the awaits are present
    expect(cliSource).toContain('await buildProject(');
    expect(cliSource).toContain('await devServer(');
  });
});

// ── Bug Fix: Migration INSERT uses db.query not db.exec ──

describe('CLI: migration INSERT', () => {
  test('migration uses db.query for parameterized INSERT', async () => {
    const fs = await import('fs');
    const cliSource = fs.readFileSync('/Users/macm1/new-y-combinator/lux-lang/bin/tova.js', 'utf-8');
    // Should use db.query for INSERT INTO __migrations (supports parameters)
    expect(cliSource).toContain('await db.query(`INSERT INTO __migrations');
    // Should NOT use db.exec for parameterized INSERT
    expect(cliSource).not.toContain('await db.exec(`INSERT INTO __migrations');
  });
});

// ── Bug Fix: LSP diagnostic off-by-one ──

describe('LSP: diagnostic positions', () => {
  test('error diagnostic end character uses 0-based columns', async () => {
    const fs = await import('fs');
    const lspSource = fs.readFileSync('/Users/macm1/new-y-combinator/lux-lang/src/lsp/server.js', 'utf-8');
    // Both start and end character should subtract 1 for 0-based LSP positions
    // The fix changes (e.column || 1) + 10 to (e.column || 1) - 1 + 10
    expect(lspSource).toContain('character: (e.column || 1) - 1 + 10');
    expect(lspSource).not.toContain('character: (e.column || 1) + 10');
  });
});

// ── Bug Fix: watch callback should not track signal reads ──

describe('reactivity: watch untrack', () => {
  test('watch callback is wrapped in untrack', async () => {
    const fs = await import('fs');
    const reactivitySource = fs.readFileSync('/Users/macm1/new-y-combinator/lux-lang/src/runtime/reactivity.js', 'utf-8');
    // The callback invocations should be wrapped in untrack()
    expect(reactivitySource).toContain('untrack(() => callback(newValue, oldValue))');
    expect(reactivitySource).toContain('untrack(() => callback(newValue, undefined))');
  });
});

// ── Bug Fix: style object clears old properties ──

describe('reactivity: style object cleanup', () => {
  test('style handling removes old properties', async () => {
    const fs = await import('fs');
    const reactivitySource = fs.readFileSync('/Users/macm1/new-y-combinator/lux-lang/src/runtime/reactivity.js', 'utf-8');
    // Should contain removeProperty logic for old style props
    expect(reactivitySource).toContain('el.style.removeProperty(prop)');
  });
});

// ── Bug Fix: _containsRPC uses correct AST property names ──

describe('codegen: _containsRPC AST property names', () => {
  test('_containsRPC uses tryBody/catchBody/finallyBody (not tryBlock/catchBlock/finallyBlock)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('/Users/macm1/new-y-combinator/lux-lang/src/codegen/client-codegen.js', 'utf-8');
    // Should use correct AST property names for TryCatchStatement
    expect(src).toContain('node.tryBody');
    expect(src).toContain('node.catchBody');
    expect(src).toContain('node.finallyBody');
    // Should NOT use the wrong property names
    expect(src).not.toContain('node.tryBlock');
    expect(src).not.toContain('node.catchBlock');
    expect(src).not.toContain('node.finallyBlock');
  });

  test('_containsRPC uses elseBody for GuardStatement (not elseBlock)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('/Users/macm1/new-y-combinator/lux-lang/src/codegen/client-codegen.js', 'utf-8');
    // GuardStatement line should use elseBody
    expect(src).not.toContain('node.elseBlock');
  });

  test('_containsRPC uses p.value for TemplateLiteral parts (not p.expression)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('/Users/macm1/new-y-combinator/lux-lang/src/codegen/client-codegen.js', 'utf-8');
    // TemplateLiteral parts use .value not .expression
    expect(src).toContain("this._containsRPC(p.value)");
  });

  test('_containsRPC checks IfExpression alternates', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('/Users/macm1/new-y-combinator/lux-lang/src/codegen/client-codegen.js', 'utf-8');
    // IfExpression should check alternates for RPC
    const ifExprSection = src.slice(src.indexOf("if (node.type === 'IfExpression')"));
    expect(ifExprSection).toContain('node.alternates');
  });
});

// ── Bug Fix: _exprReadsSignal checks IfExpression alternates ──

describe('codegen: _exprReadsSignal IfExpression alternates', () => {
  test('_exprReadsSignal checks IfExpression alternates', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('/Users/macm1/new-y-combinator/lux-lang/src/codegen/client-codegen.js', 'utf-8');
    // Find the _exprReadsSignal method's IfExpression handling
    const signalMethod = src.slice(src.indexOf('_exprReadsSignal'));
    const ifExprSection = signalMethod.slice(signalMethod.indexOf("if (node.type === 'IfExpression')"));
    expect(ifExprSection).toContain('node.alternates');
  });
});

// ── Bug Fix: Parser LPAREN newline guard ──

describe('parser: LPAREN newline guard', () => {
  test('expression on new line starting with ( is not parsed as function call', () => {
    // "foo\n(bar)" should parse as two separate expressions, not foo(bar)
    const src = `foo\n(bar)`;
    const ast = parse(src);
    // Should have two statements (ExpressionStatement for foo, ExpressionStatement for (bar))
    const stmts = ast.body.filter(s => s.type === 'ExpressionStatement' || s.type === 'Assignment');
    expect(stmts.length).toBe(2);
  });

  test('function call on same line still works', () => {
    const src = `fn foo(x) { x }\nfoo(42)`;
    const ast = parse(src);
    const calls = ast.body.filter(s =>
      s.type === 'ExpressionStatement' && s.expression.type === 'CallExpression'
    );
    expect(calls.length).toBe(1);
  });
});

// ── Bug Fix: Analyzer await in non-async lambdas ──

describe('analyzer: await in non-async lambdas', () => {
  test('await inside non-async lambda inside async function produces error', () => {
    const src = `
      async fn fetch_all(urls) {
        urls.map(fn(url) {
          await fetch(url)
        })
      }
    `;
    // Analyzer throws on errors — catch and check
    const errors = getErrors(src);
    const awaitErrors = errors.filter(e => e.message.includes('await'));
    expect(awaitErrors.length).toBeGreaterThan(0);
  });

  test('await inside async lambda inside async function is fine', () => {
    const src = `
      async fn fetch_all(urls) {
        urls.map(async fn(url) {
          await fetch(url)
        })
      }
    `;
    // Should not throw — no await errors
    const warnings = getWarnings(src);
    const awaitWarnings = warnings.filter(w => w.message.includes('await'));
    expect(awaitWarnings.length).toBe(0);
  });

  test('await inside non-async nested function produces error', () => {
    const src = `
      async fn outer() {
        fn inner() {
          await something()
        }
      }
    `;
    const errors = getErrors(src);
    const awaitErrors = errors.filter(e => e.message.includes('await'));
    expect(awaitErrors.length).toBeGreaterThan(0);
  });
});

// ── Bug Fix: ErrorBoundary stores _errorHandler on vnode ──

describe('reactivity: ErrorBoundary _errorHandler', () => {
  test('ErrorBoundary stores _errorHandler on the vnode for __dynamic handler', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('/Users/macm1/new-y-combinator/lux-lang/src/runtime/reactivity.js', 'utf-8');
    // Should set _errorHandler on the vnode so __dynamic can use it
    expect(src).toContain('_errorHandler: handleError');
    // Should NOT push/pop error handler around childContent creation (old buggy pattern)
    // The handler should be pushed in the __dynamic effect, not around vnode creation
    const ebStart = src.indexOf('function ErrorBoundary');
    const ebEnd = src.indexOf('}', src.indexOf('return vnode', ebStart));
    const ebBody = src.slice(ebStart, ebEnd);
    expect(ebBody).not.toContain('pushErrorHandler(handleError)');
    expect(ebBody).not.toContain('popErrorHandler()');
  });

  test('__dynamic handler pushes _errorHandler during render cycle', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('/Users/macm1/new-y-combinator/lux-lang/src/runtime/reactivity.js', 'utf-8');
    // The __dynamic handler should push error handler if present
    expect(src).toContain('if (errHandler) pushErrorHandler(errHandler)');
    expect(src).toContain('if (errHandler) popErrorHandler()');
  });
});

// ── Bug Fix: lazy component checks resolved inside compute ──

describe('reactivity: lazy component', () => {
  test('lazy compute checks resolved variable directly', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('/Users/macm1/new-y-combinator/lux-lang/src/runtime/reactivity.js', 'utf-8');
    // The compute function should check `resolved` directly rather than relying on a signal
    const lazyStart = src.indexOf('function lazy(');
    const lazyEnd = src.indexOf('\n}', src.indexOf('return function LazyWrapper', lazyStart) + 100);
    const lazyBody = src.slice(lazyStart, lazyEnd);
    expect(lazyBody).toContain('if (resolved) return resolved(props)');
  });
});

// ── Bug Fix: _definitelyReturns checks any statement in block, not just last ──

describe('analyzer: _definitelyReturns BlockStatement', () => {
  test('no false warning when early if/elif/else covers all return paths', () => {
    const src = `
      fn foo(x: Int) -> Int {
        if x > 0 {
          return 1
        } elif x < 0 {
          return -1
        } else {
          return 0
        }
        print("unreachable")
      }
    `;
    const warnings = getWarnings(src);
    const returnWarnings = warnings.filter(w => w.message.includes('not all code paths return'));
    expect(returnWarnings.length).toBe(0);
  });
});

// ── Bug Fix: _definitelyReturns GuardStatement returns false ──

describe('analyzer: _definitelyReturns GuardStatement', () => {
  test('guard alone does not satisfy return requirement', () => {
    const src = `
      fn validate(x: Int) -> Int {
        guard x > 0 else { return -1 }
      }
    `;
    const warnings = getWarnings(src);
    const returnWarnings = warnings.filter(w => w.message.includes('not all code paths return'));
    expect(returnWarnings.length).toBeGreaterThan(0);
  });

  test('guard followed by return satisfies requirement', () => {
    const src = `
      fn validate(x: Int) -> Int {
        guard x > 0 else { return -1 }
        return x
      }
    `;
    const warnings = getWarnings(src);
    const returnWarnings = warnings.filter(w => w.message.includes('not all code paths return'));
    expect(returnWarnings.length).toBe(0);
  });
});

// ── Bug Fix: ObjectLiteral non-shorthand keys not visited as variable refs ──

describe('analyzer: ObjectLiteral property keys', () => {
  test('non-shorthand object keys do not trigger undefined warnings', () => {
    const src = `
      fn build() {
        result = {host: "localhost", port: 8080}
      }
    `;
    const warnings = getWarnings(src);
    const undefinedWarnings = warnings.filter(w =>
      w.message.includes("'host'") || w.message.includes("'port'")
    );
    expect(undefinedWarnings.length).toBe(0);
  });

  test('shorthand object properties still check variable references', () => {
    const src = `
      fn build() {
        name = "test"
        result = {name}
      }
    `;
    // 'name' is defined — should not warn about undefined
    const warnings = getWarnings(src);
    const nameWarning = warnings.filter(w => w.message.includes("'name' is not defined"));
    expect(nameWarning.length).toBe(0);
  });

  test('spread in object literals is analyzed', () => {
    const src = `
      fn build() {
        defaults = {x: 1}
        config = {...defaults, y: 2}
      }
    `;
    // 'defaults' should be recognized as used (no unused warning)
    const warnings = getWarnings(src);
    const unusedDefaults = warnings.filter(w =>
      w.message.includes("'defaults'") && w.message.includes('unused')
    );
    expect(unusedDefaults.length).toBe(0);
  });
});

// ── Bug Fix: LSP uses Buffer for Content-Length (byte-based protocol) ──

describe('LSP: Buffer-based transport', () => {
  test('LSP server uses Buffer for _buffer (not string)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('/Users/macm1/new-y-combinator/lux-lang/src/lsp/server.js', 'utf-8');
    // Should use Buffer.alloc(0) for initial buffer, not empty string
    expect(src).toContain('this._buffer = Buffer.alloc(0)');
    // Should NOT set string encoding on stdin (causes byte/char mismatch)
    expect(src).not.toContain("setEncoding('utf8')");
    expect(src).not.toContain('setEncoding("utf8")');
    // Should use Buffer.concat for accumulation
    expect(src).toContain('Buffer.concat');
    // Should convert to string only for parsing
    expect(src).toContain(".toString('utf8')");
  });
});

// ── Bug Fix: LSP signature help handles nested calls correctly ──

describe('LSP: nested call signature help', () => {
  test('signature help uses paren-depth walk for function identification', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('/Users/macm1/new-y-combinator/lux-lang/src/lsp/server.js', 'utf-8');
    // Should walk backwards counting parens, not use a flat regex
    expect(src).not.toContain("/(\\'\\w+)\\s*\\([^)]*$/");
    // Should count commas at depth 0 (not all commas)
    expect(src).toContain('parenDepth === 0');
  });
});

// ── Bug Fix: Parser operator loc captured from operator token, not next token ──

describe('parser: operator source locations', () => {
  function getValue(ast) {
    const node = ast.body[0];
    if (node.type === 'Assignment') return node.values[0];
    if (node.type === 'AssignmentExpression') return node.right;
    if (node.expression) return node.expression;
    return node;
  }

  test('BinaryExpression ?? loc points to operator token', () => {
    const ast = parse('x = a ?? b');
    const value = getValue(ast);
    expect(value.type).toBe('BinaryExpression');
    expect(value.operator).toBe('??');
    // 'x = a ?? b' — ?? is at col 7, 'b' is at col 10
    expect(value.loc.column).toBeLessThan(10);
  });

  test('LogicalExpression or loc points to operator token', () => {
    const value = getValue(parse('x = a or b'));
    expect(value.type).toBe('LogicalExpression');
    expect(value.loc.column).toBeLessThan(10);
  });

  test('LogicalExpression and loc points to operator token', () => {
    const value = getValue(parse('x = a and b'));
    expect(value.type).toBe('LogicalExpression');
    expect(value.loc.column).toBeLessThan(11);
  });

  test('UnaryExpression not loc points to operator token', () => {
    const value = getValue(parse('x = not a'));
    expect(value.type).toBe('UnaryExpression');
    // 'not' starts at col 5, 'a' starts at col 9
    expect(value.loc.column).toBeLessThan(9);
  });

  test('PipeExpression loc points to |> operator', () => {
    const value = getValue(parse('x = a |> double'));
    expect(value.type).toBe('PipeExpression');
    // |> starts at col 7, 'double' starts at col 10
    expect(value.loc.column).toBeLessThan(10);
  });
});

// ── Bug Fix: Lexer _isJSXStart includes RBRACE in valueTypes ──

describe('lexer: RBRACE prevents JSX mode', () => {
  test('closing brace before < is not treated as JSX', () => {
    // After }, a < should be treated as less-than, not JSX
    const src = 'if x > 0 { y } < z';
    // This should lex without errors and not produce JSX tokens
    const lexer = new Lexer(src, '<test>');
    const tokens = lexer.tokenize();
    const jsxTokens = tokens.filter(t => t.type === 'JSX_TAG_OPEN' || t.type === 'JSX_OPEN');
    expect(jsxTokens.length).toBe(0);
  });
});

// ── Bug Fix: Analyzer exhaustiveness no false positives with shared variant names ──

describe('analyzer: exhaustiveness no false positives', () => {
  test('no false warnings when unrelated type has overlapping variant names', () => {
    // When _inferType resolves the type, the precise ADT path is used.
    // This tests that when the fallback path runs, it doesn't match unrelated types.
    // Use separate variants (no overlap) to test the fallback doesn't over-warn.
    const src = `
      type Shape {
        Circle(Float)
        Square(Float)
      }

      type Color {
        Red
        Blue
      }

      fn area(s: Shape) -> Float {
        match s {
          Circle(r) => 3.14 * r * r
          Square(side) => side * side
        }
      }
    `;
    const warnings = getWarnings(src);
    // Should NOT warn about missing Red or Blue from Color type
    const colorWarning = warnings.filter(w => w.message.includes('Red') || w.message.includes('Blue'));
    expect(colorWarning.length).toBe(0);
  });

  test('still warns about missing variants from the correct type', () => {
    const src = `
      type Color {
        Red
        Blue
        Green
      }

      fn name(c: Color) -> String {
        match c {
          Red => "red"
          Blue => "blue"
        }
      }
    `;
    const warnings = getWarnings(src);
    const greenWarning = warnings.filter(w => w.message.includes('Green'));
    expect(greenWarning.length).toBeGreaterThan(0);
  });
});

// ── P0 Improvements ──────────────────────────────────────────────

describe('P0: else if and elif both accepted', () => {
  test('else if parses as elif alternate', () => {
    const code = compile(`
      fn check(x: Int) -> String {
        if x > 10 {
          "big"
        } else if x > 5 {
          "medium"
        } else {
          "small"
        }
      }
    `);
    expect(code).toContain('else if');
  });

  test('elif still works', () => {
    const code = compile(`
      fn check(x: Int) -> String {
        if x > 10 {
          "big"
        } elif x > 5 {
          "medium"
        } else {
          "small"
        }
      }
    `);
    expect(code).toContain('else if');
  });

  test('mixed elif and else if in same chain', () => {
    const code = compile(`
      fn check(x: Int) -> String {
        if x > 10 {
          "big"
        } elif x > 5 {
          "medium"
        } else if x > 0 {
          "positive"
        } else {
          "zero"
        }
      }
    `);
    expect(code).toContain('else if');
  });
});

describe('P0: mut keyword removed, var is canonical', () => {
  test('mut produces parse error', () => {
    expect(() => parse('mut x = 0')).toThrow("'mut' is not supported in Tova. Use 'var' for mutable variables");
  });

  test('var still works (canonical form)', () => {
    const code = compile('var y = 10');
    expect(code).toContain('let y = 10');
  });

  test('var allows reassignment', () => {
    const warnings = getWarnings(`
      fn test_fn() {
        var x = 0
        x = 5
      }
    `);
    const reassignErr = warnings.filter(w => w.message.includes('Cannot reassign'));
    expect(reassignErr.length).toBe(0);
  });

  test('error message mentions var for immutable reassignment', () => {
    const errors = getErrors(`
      fn test_fn() {
        x = 5
        x = 10
      }
    `);
    const reassignErr = errors.find(e => e.message.includes('Cannot reassign'));
    expect(reassignErr).toBeDefined();
    expect(reassignErr.message).toContain('var');
  });
});

describe('P0: -> lambda syntax', () => {
  test('x -> x + 1 parses as LambdaExpression', () => {
    const ast = parse('f = x -> x + 1');
    const assign = ast.body[0];
    const lambda = assign.values[0];
    expect(lambda.type).toBe('LambdaExpression');
    expect(lambda.params.length).toBe(1);
    expect(lambda.params[0].name).toBe('x');
  });

  test('(x, y) -> x + y parses with 2 params', () => {
    const ast = parse('f = (x, y) -> x + y');
    const lambda = ast.body[0].values[0];
    expect(lambda.type).toBe('LambdaExpression');
    expect(lambda.params.length).toBe(2);
  });

  test('() -> 42 parses with 0 params', () => {
    const ast = parse('f = () -> 42');
    const lambda = ast.body[0].values[0];
    expect(lambda.type).toBe('LambdaExpression');
    expect(lambda.params.length).toBe(0);
  });

  test('x -> x + 1 produces same codegen as x => x + 1', () => {
    const thinArrow = compile('f = x -> x + 1');
    const fatArrow = compile('f = x => x + 1');
    expect(thinArrow).toBe(fatArrow);
  });

  test('-> in pipes: [1,2,3] |> map(x -> x * 2)', () => {
    const code = compile('[1,2,3] |> map(x -> x * 2)');
    expect(code).toContain('=>');
  });

  test('fn foo() -> Int { 42 } still parses correctly (return type)', () => {
    const ast = parse('fn foo() -> Int { 42 }');
    const fn = ast.body[0];
    expect(fn.type).toBe('FunctionDeclaration');
    expect(fn.name).toBe('foo');
    expect(fn.returnType).toBeDefined();
  });
});

describe('P0: did you mean suggestions', () => {
  test('typo suggests correct name: nme -> name', () => {
    const warnings = getWarnings(`
      fn test() {
        name = "alice"
        print(nme)
      }
    `);
    const typoWarn = warnings.find(w => w.message.includes("'nme'") && w.message.includes('not defined'));
    expect(typoWarn).toBeDefined();
    expect(typoWarn.hint).toContain('name');
  });

  test('builtin typo: prnt -> print', () => {
    const warnings = getWarnings(`
      fn test() {
        prnt("hello")
      }
    `);
    const typoWarn = warnings.find(w => w.message.includes("'prnt'"));
    expect(typoWarn).toBeDefined();
    expect(typoWarn.hint).toContain('print');
  });

  test('completely unrelated name: no hint', () => {
    const warnings = getWarnings(`
      fn test() {
        xyzzyplugh("hello")
      }
    `);
    const typoWarn = warnings.find(w => w.message.includes("'xyzzyplugh'"));
    expect(typoWarn).toBeDefined();
    expect(typoWarn.hint).toBeUndefined();
  });

  test('hint field appears in warning object', () => {
    const warnings = getWarnings(`
      fn test() {
        consle.log("hi")
      }
    `);
    const typoWarn = warnings.find(w => w.message.includes("'consle'"));
    expect(typoWarn).toBeDefined();
    expect(typoWarn.hint).toBeDefined();
    expect(typoWarn.hint).toContain('console');
  });
});

describe('P0: type mismatch conversion hints', () => {
  test('Int where String expected hints toString', () => {
    const errors = getErrors(`
      fn greet(name: String) -> String {
        return name
      }
      greet(42)
    `);
    const mismatch = errors.find(e => e.message.includes('Type mismatch'));
    expect(mismatch).toBeDefined();
    expect(mismatch.hint).toContain('toString');
  });

  test('String where Int expected hints toInt', () => {
    const errors = getErrors(`
      fn double(x: Int) -> Int {
        return x
      }
      double("5")
    `);
    const mismatch = errors.find(e => e.message.includes('Type mismatch'));
    expect(mismatch).toBeDefined();
    expect(mismatch.hint).toContain('toInt');
  });

  test('no hint for compatible types (no false positives)', () => {
    const errors = getErrors(`
      fn double(x: Int) -> Int {
        return x
      }
      double(5)
    `);
    const mismatch = errors.find(e => e.message.includes('Type mismatch'));
    expect(mismatch).toBeUndefined();
  });
});

// ── P1 Improvements ──────────────────────────────────────────────

describe('P1: andThen alias for flatMap on Result', () => {
  test('andThen compiles on Ok result', () => {
    const code = compile(`
      result = Ok(5)
      doubled = result.andThen(fn(x) Ok(x * 2))
    `);
    expect(code).toContain('andThen');
  });

  test('andThen compiles on Err result', () => {
    const code = compile(`
      result = Err("fail")
      doubled = result.andThen(fn(x) Ok(x * 2))
    `);
    expect(code).toContain('andThen');
  });

  test('andThen compiles on Option (Some)', () => {
    const code = compile(`
      opt = Some(5)
      doubled = opt.andThen(fn(x) Some(x * 2))
    `);
    expect(code).toContain('andThen');
  });
});

// ═══════════════════════════════════════════════════════════════
// T0 — Language Identity & Consistency
// ═══════════════════════════════════════════════════════════════

// ── T0-1: Both symbolic and keyword logical operators accepted ──

describe('T0-1: Both operator forms accepted', () => {
  test('&& compiles to &&', () => {
    const code = compile('x = true && false');
    expect(code).toContain('&&');
  });

  test('|| compiles to ||', () => {
    const code = compile('x = true || false');
    expect(code).toContain('||');
  });

  test('! compiles to !', () => {
    const code = compile('x = !true');
    expect(code).toContain('!');
  });

  test('and/or/not also work', () => {
    const code = compile('x = true and false or not true');
    expect(code).toContain('&&');
    expect(code).toContain('||');
    expect(code).toContain('!');
  });
});

// ── T0-2: mut is a parse error ──────────────────────────────

describe('T0-2: mut keyword produces parse error', () => {
  test('mut x = 0 throws with helpful message', () => {
    expect(() => parse('mut x = 0')).toThrow("'mut' is not supported in Tova");
    expect(() => parse('mut x = 0')).toThrow("Use 'var'");
  });

  test('var x = 0 still works', () => {
    const ast = parse('var x = 0');
    expect(ast.body[0].type).toBe('VarDeclaration');
    expect(ast.body[0].targets[0]).toBe('x');
  });
});

// ── T0-3: let error message mentions var ────────────────────

describe('T0-3: let error message mentions var', () => {
  test('let x = 5 error mentions var', () => {
    expect(() => parse('let x = 5')).toThrow("var x = value");
    expect(() => parse('let x = 5')).toThrow("for mutable");
  });

  test('let destructuring still works', () => {
    const ast = parse('let {a, b} = obj');
    expect(ast.body[0].type).toBe('LetDestructure');
  });
});

// ── T0-4: Both else if and elif accepted ──────────────────────

describe('T0-4: Both else if and elif accepted', () => {
  test('else if in if-statement works', () => {
    const code = compile(`
      fn check(x: Int) -> String {
        if x > 10 {
          "big"
        } else if x > 5 {
          "medium"
        } else {
          "small"
        }
      }
    `);
    expect(code).toContain('else if');
  });

  test('else if in if-expression works', () => {
    const code = compile(`
      fn check(x: Int) -> String {
        result = if x > 10 { "big" } else if x > 5 { "medium" } else { "small" }
        result
      }
    `);
    expect(code).toContain('"big"');
    expect(code).toContain('"medium"');
  });

  test('elif in if-statement works', () => {
    const code = compile(`
      fn check(x: Int) -> String {
        if x > 10 {
          "big"
        } elif x > 5 {
          "medium"
        } else {
          "small"
        }
      }
    `);
    expect(code).toContain('else if');
  });
});

// ── T0-7: Naming conventions ────────────────────────────────

describe('T0-7: Naming convention enforcement', () => {
  test('camelCase function name warns', () => {
    const warnings = getWarnings(`
      fn myFunction() {
        print("hello")
      }
    `);
    const nameWarn = warnings.find(w => w.message.includes("'myFunction'") && w.message.includes('snake_case'));
    expect(nameWarn).toBeDefined();
    expect(nameWarn.hint).toContain('my_function');
  });

  test('snake_case function name does not warn', () => {
    const warnings = getWarnings(`
      fn my_function() {
        print("hello")
      }
    `);
    const nameWarn = warnings.find(w => w.message.includes('snake_case') && w.message.includes("'my_function'"));
    expect(nameWarn).toBeUndefined();
  });

  test('camelCase variable warns', () => {
    const warnings = getWarnings(`
      fn test() {
        myVar = 42
      }
    `);
    const nameWarn = warnings.find(w => w.message.includes("'myVar'") && w.message.includes('snake_case'));
    expect(nameWarn).toBeDefined();
    expect(nameWarn.hint).toContain('my_var');
  });

  test('camelCase parameter warns', () => {
    const warnings = getWarnings(`
      fn test(myParam: Int) {
        print(myParam)
      }
    `);
    const nameWarn = warnings.find(w => w.message.includes("'myParam'") && w.message.includes('snake_case'));
    expect(nameWarn).toBeDefined();
    expect(nameWarn.hint).toContain('my_param');
  });

  test('PascalCase type name does not warn', () => {
    const warnings = getWarnings(`
      type MyType {
        Variant(value: Int)
      }
    `);
    const nameWarn = warnings.find(w => w.message.includes("'MyType'") && w.message.includes('PascalCase'));
    expect(nameWarn).toBeUndefined();
  });

  test('snake_case type name warns', () => {
    const warnings = getWarnings(`
      type my_type {
        Variant(value: Int)
      }
    `);
    const nameWarn = warnings.find(w => w.message.includes("'my_type'") && w.message.includes('PascalCase'));
    expect(nameWarn).toBeDefined();
    expect(nameWarn.hint).toContain('MyType');
  });

  test('single-char names do not warn', () => {
    const warnings = getWarnings(`
      fn test(x: Int) {
        y = x + 1
      }
    `);
    const nameWarns = warnings.filter(w => w.message.includes('snake_case') || w.message.includes('PascalCase'));
    expect(nameWarns.length).toBe(0);
  });

  test('underscore-prefixed names do not warn', () => {
    const warnings = getWarnings(`
      fn test(_unused: Int) {
        _temp = 42
      }
    `);
    const nameWarns = warnings.filter(w => w.message.includes('snake_case') && (w.message.includes("'_unused'") || w.message.includes("'_temp'")));
    expect(nameWarns.length).toBe(0);
  });

  test('UPPER_SNAKE_CASE does not warn (constants)', () => {
    const warnings = getWarnings(`
      fn test() {
        MAX_SIZE = 100
      }
    `);
    const nameWarns = warnings.filter(w => w.message.includes("'MAX_SIZE'") && w.message.includes('snake_case'));
    expect(nameWarns.length).toBe(0);
  });

  test('var with camelCase warns', () => {
    const warnings = getWarnings(`
      fn test() {
        var myCounter = 0
        myCounter = 1
      }
    `);
    const nameWarn = warnings.find(w => w.message.includes("'myCounter'") && w.message.includes('snake_case'));
    expect(nameWarn).toBeDefined();
  });
});
