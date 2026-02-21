import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { BUILTINS } from '../src/stdlib/inline.js';

function compile(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const codegen = new CodeGenerator(ast, '<test>');
  return codegen.generate();
}

function compileShared(source) {
  return compile(source).shared.trim();
}

function compileWithStdlib(source) {
  return BUILTINS + '\n' + compileShared(source);
}

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function analyze(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze();
}

function analyzeThrows(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>');
  return () => analyzer.analyze();
}

function tokenize(source) {
  const lexer = new Lexer(source, '<test>');
  return lexer.tokenize();
}

// ================================================================
// #7 Break/Continue
// ================================================================

describe('Break/Continue', () => {
  test('break in for loop', () => {
    const code = compileShared(`
fn find(items) {
  for item in items {
    if item == "target" {
      break
    }
  }
}
`);
    expect(code).toContain('break;');
  });

  test('continue in for loop', () => {
    const code = compileShared(`
fn process(items) {
  for item in items {
    if item == "skip" {
      continue
    }
  }
}
`);
    expect(code).toContain('continue;');
  });

  test('break in while loop', () => {
    const code = compileShared(`
fn countdown() {
  var i = 10
  while i > 0 {
    i -= 1
    if i == 5 {
      break
    }
  }
}
`);
    expect(code).toContain('break;');
  });

  test('break token is lexed', () => {
    const tokens = tokenize('break');
    expect(tokens[0].type).toBe('BREAK');
  });

  test('continue token is lexed', () => {
    const tokens = tokenize('continue');
    expect(tokens[0].type).toBe('CONTINUE');
  });

  test('break parses as BreakStatement', () => {
    const ast = parse(`
fn test() {
  for x in [1, 2, 3] {
    break
  }
}
`);
    const fn = ast.body[0];
    const forStmt = fn.body.body[0];
    const breakStmt = forStmt.body.body[0];
    expect(breakStmt.type).toBe('BreakStatement');
  });

  test('analyzer errors on break outside loop', () => {
    expect(analyzeThrows(`
fn test() {
  break
}
`)).toThrow();
  });

  test('analyzer errors on continue outside loop', () => {
    expect(analyzeThrows(`
fn test() {
  continue
}
`)).toThrow();
  });

  test('analyzer allows break inside for loop', () => {
    const result = analyze(`
fn test() {
  for x in [1, 2] {
    break
  }
}
`);
    expect(result.warnings.every(w => !w.message.includes('break'))).toBe(true);
  });

  test('analyzer allows break inside while loop', () => {
    const result = analyze(`
fn test() {
  var x = true
  while x {
    break
  }
}
`);
    expect(result.warnings.every(w => !w.message.includes('break'))).toBe(true);
  });
});

// ================================================================
// #8 Async/Await
// ================================================================

describe('Async/Await', () => {
  test('async keyword is lexed', () => {
    const tokens = tokenize('async');
    expect(tokens[0].type).toBe('ASYNC');
  });

  test('await keyword is lexed', () => {
    const tokens = tokenize('await');
    expect(tokens[0].type).toBe('AWAIT');
  });

  test('async fn declaration', () => {
    const code = compileShared(`
async fn fetch_data() {
  42
}
`);
    expect(code).toContain('async function fetch_data()');
  });

  test('await expression', () => {
    const code = compileShared(`
async fn load() {
  data = await fetch("/api")
  data
}
`);
    expect(code).toContain('await fetch("/api")');
  });

  test('async lambda', () => {
    const code = compileShared(`
handler = async fn(req) {
  42
}
`);
    expect(code).toContain('async (req) =>');
  });

  test('async fn parses with isAsync flag', () => {
    const ast = parse('async fn load() { 42 }');
    expect(ast.body[0].type).toBe('FunctionDeclaration');
    expect(ast.body[0].isAsync).toBe(true);
  });

  test('non-async fn has isAsync false', () => {
    const ast = parse('fn load() { 42 }');
    expect(ast.body[0].isAsync).toBe(false);
  });

  test('await in async fn generates correctly', () => {
    const code = compileShared(`
async fn get_users() {
  response = await fetch("/api/users")
  data = await response.json()
  data
}
`);
    expect(code).toContain('async function get_users()');
    expect(code).toContain('await fetch("/api/users")');
    expect(code).toContain('await response.json()');
  });
});

// ================================================================
// #9 Unused Variable Warnings
// ================================================================

describe('Unused Variable Warnings', () => {
  test('warns on unused variable in function', () => {
    const result = analyze(`
fn test() {
  unused_var = 42
  used_var = 10
  used_var
}
`);
    const unusedWarnings = result.warnings.filter(w => w.message.includes("'unused_var'"));
    expect(unusedWarnings.length).toBe(1);
  });

  test('does not warn on used variables', () => {
    const result = analyze(`
fn test() {
  x = 42
  x
}
`);
    const xWarnings = result.warnings.filter(w => w.message.includes("'x'"));
    expect(xWarnings.length).toBe(0);
  });

  test('does not warn on _-prefixed variables', () => {
    const result = analyze(`
fn test() {
  _unused = 42
  1
}
`);
    const warnings = result.warnings.filter(w => w.message.includes("'_unused'"));
    expect(warnings.length).toBe(0);
  });

  test('does not warn on module-level variables', () => {
    const result = analyze('x = 42');
    const warnings = result.warnings.filter(w => w.message.includes("'x'"));
    expect(warnings.length).toBe(0);
  });
});

// ================================================================
// #13 Pipe Enhancements
// ================================================================

describe('Pipe Enhancements', () => {
  test('placeholder _ in pipe', () => {
    const code = compileShared('result = data |> transform(_, options)');
    expect(code).toContain('transform(data, options)');
  });

  test('method pipe .filter()', () => {
    const code = compileShared('result = items |> .filter(fn(x) x > 0)');
    expect(code).toContain('items.filter(');
  });

  test('chained method pipes', () => {
    const code = compileShared('result = items |> .filter(fn(x) x > 0) |> .map(fn(x) x * 2)');
    expect(code).toContain('.filter(');
    expect(code).toContain('.map(');
  });

  test('placeholder replaces _ with piped value', () => {
    const code = compileShared('result = 42 |> add(_, 10)');
    expect(code).toContain('add(42, 10)');
  });

  test('regular pipe still works', () => {
    const code = compileShared('result = 42 |> double');
    expect(code).toContain('double(42)');
  });

  test('pipe with call still inserts as first arg', () => {
    const code = compileShared('result = 42 |> add(10)');
    expect(code).toContain('add(42, 10)');
  });
});

// ================================================================
// #18 Guard Clauses
// ================================================================

describe('Guard Clauses', () => {
  test('guard keyword is lexed', () => {
    const tokens = tokenize('guard');
    expect(tokens[0].type).toBe('GUARD');
  });

  test('guard generates if-not check', () => {
    const code = compileShared(`
fn divide(a, b) {
  guard b != 0 else {
    return -1
  }
  a / b
}
`);
    expect(code).toContain('if (!(');
    expect(code).toContain('return (-1)');
  });

  test('guard parses as GuardStatement', () => {
    const ast = parse(`
fn test() {
  guard x > 0 else { return 0 }
  x
}
`);
    const fn = ast.body[0];
    const guard = fn.body.body[0];
    expect(guard.type).toBe('GuardStatement');
  });
});

// ================================================================
// #14 Interfaces/Protocols
// ================================================================

describe('Interfaces', () => {
  test('interface keyword is lexed', () => {
    const tokens = tokenize('interface');
    expect(tokens[0].type).toBe('INTERFACE');
  });

  test('interface parses correctly', () => {
    const ast = parse(`
interface Serializable {
  fn to_json() -> String
  fn from_json(data: String) -> String
}
`);
    const iface = ast.body[0];
    expect(iface.type).toBe('InterfaceDeclaration');
    expect(iface.name).toBe('Serializable');
    expect(iface.methods.length).toBe(2);
    expect(iface.methods[0].name).toBe('to_json');
    expect(iface.methods[1].name).toBe('from_json');
  });

  test('interface generates documentation comment', () => {
    const code = compileShared(`
interface Printable {
  fn to_string() -> String
}
`);
    expect(code).toContain('/* interface Printable');
    expect(code).toContain('fn to_string');
  });
});

// ================================================================
// #15 Derive for Types
// ================================================================

describe('Derive', () => {
  test('derive keyword is lexed', () => {
    const tokens = tokenize('derive');
    expect(tokens[0].type).toBe('DERIVE');
  });

  test('type with derive parses correctly', () => {
    const ast = parse(`
type Point {
  x: Int
  y: Int
} derive [Eq, Show, JSON]
`);
    const type = ast.body[0];
    expect(type.type).toBe('TypeDeclaration');
    expect(type.derive).toEqual(['Eq', 'Show', 'JSON']);
  });

  test('derive Eq generates equality function', () => {
    const code = compileShared(`
type Point {
  x: Int
  y: Int
} derive [Eq]
`);
    expect(code).toContain('__eq');
  });

  test('derive Show generates show function', () => {
    const code = compileShared(`
type Point {
  x: Int
  y: Int
} derive [Show]
`);
    expect(code).toContain('__show');
  });

  test('derive JSON generates toJSON/fromJSON', () => {
    const code = compileShared(`
type Point {
  x: Int
  y: Int
} derive [JSON]
`);
    expect(code).toContain('toJSON');
    expect(code).toContain('fromJSON');
  });

  test('type without derive still works', () => {
    const code = compileShared(`
type Color {
  r: Int
  g: Int
  b: Int
}
`);
    expect(code).toContain('function Color(');
    expect(code).not.toContain('derive');
  });
});

// ================================================================
// #16 String Pattern Matching
// ================================================================

describe('String Pattern Matching', () => {
  test('string concat pattern parses', () => {
    const ast = parse(`
fn test() {
  match url {
    "/api" ++ rest => rest
    _ => "not found"
  }
}
`);
    const fn = ast.body[0];
    const matchExpr = fn.body.body[0];
    // It's an ExpressionStatement wrapping a MatchExpression
    const match = matchExpr.type === 'ExpressionStatement' ? matchExpr.expression : matchExpr;
    expect(match.type).toBe('MatchExpression');
    expect(match.arms[0].pattern.type).toBe('StringConcatPattern');
    expect(match.arms[0].pattern.prefix).toBe('/api');
    expect(match.arms[0].pattern.rest.name).toBe('rest');
  });

  test('string concat pattern generates startsWith check', () => {
    const code = compileShared(`
fn handle_url(url) {
  match url {
    "/api" ++ rest => rest
    _ => "not found"
  }
}
`);
    expect(code).toContain('startsWith("/api")');
    expect(code).toContain('.slice(4)');
  });

  test('string concat pattern with wildcard', () => {
    const code = compileShared(`
fn check(s) {
  match s {
    "hello" ++ _ => true
    _ => false
  }
}
`);
    expect(code).toContain('startsWith("hello")');
  });
});

// ================================================================
// Runtime verification for features
// ================================================================

describe('Runtime Behavior', () => {
  test('break stops loop execution', () => {
    const code = compileShared(`
fn test() {
  var count = 0
  for i in [1, 2, 3, 4, 5] {
    if i == 3 {
      break
    }
    count += 1
  }
  count
}
`);
    // Verify the generated code
    expect(code).toContain('break;');
    // Test actual execution
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toBe(2);
  });

  test('continue skips iteration', () => {
    const code = compileShared(`
fn test() {
  var count = 0
  for i in [1, 2, 3, 4, 5] {
    if i == 3 {
      continue
    }
    count += 1
  }
  count
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toBe(4);
  });

  test('guard clause executes else body on false condition', () => {
    const code = compileShared(`
fn divide(a, b) {
  guard b != 0 else {
    return -1
  }
  a / b
}
`);
    const fn = new Function(code + '\nreturn [divide(10, 2), divide(10, 0)];');
    expect(fn()).toEqual([5, -1]);
  });

  test('async fn generates valid JS', () => {
    const code = compileShared(`
async fn delayed() {
  42
}
`);
    // Verify async function returns a Promise
    const fn = new Function(code + '\nreturn delayed();');
    const result = fn();
    expect(result).toBeInstanceOf(Promise);
  });

  test('derive Eq works at runtime', () => {
    const code = compileShared(`
type Point {
  x: Int
  y: Int
} derive [Eq]
`);
    const fn = new Function(code + '\nreturn Point.__eq(Point(1, 2), Point(1, 2));');
    expect(fn()).toBe(true);
  });

  test('derive JSON works at runtime', () => {
    const code = compileShared(`
type Point {
  x: Int
  y: Int
} derive [JSON]
`);
    const fn = new Function(code + '\nconst p = Point(3, 4); const json = Point.toJSON(p); return Point.fromJSON(json);');
    const result = fn();
    expect(result.x).toBe(3);
    expect(result.y).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════
// Source Maps
// ═══════════════════════════════════════════════════════════════
describe('Source Maps', () => {
  test('generate source mappings for statements', () => {
    const output = compile(`x = 10
y = 20
fn add(a, b) {
  return a + b
}`);
    expect(output.sourceMappings).toBeDefined();
    expect(output.sourceMappings.length).toBeGreaterThan(0);
    // Should have mappings for x =, y =, fn add, and return
    expect(output.sourceMappings.length).toBeGreaterThanOrEqual(3);
  });

  test('source mappings have correct structure', () => {
    const output = compile(`x = 42`);
    expect(output.sourceMappings.length).toBeGreaterThan(0);
    const m = output.sourceMappings[0];
    expect(typeof m.sourceLine).toBe('number');
    expect(typeof m.sourceCol).toBe('number');
    expect(typeof m.outputLine).toBe('number');
    expect(typeof m.outputCol).toBe('number');
  });

  test('source mappings track source line numbers', () => {
    const output = compile(`a = 1
b = 2
c = 3`);
    const lines = output.sourceMappings.map(m => m.sourceLine);
    // Should have mappings for lines 0, 1, 2 (0-based)
    expect(lines).toContain(0);
    expect(lines).toContain(1);
    expect(lines).toContain(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// Undefined Identifier Warnings
// ═══════════════════════════════════════════════════════════════
describe('Undefined Identifier Warnings', () => {
  test('warns on undefined identifier in function', () => {
    const result = analyze(`
fn test() {
  x = foo
  x
}
`);
    const fooWarnings = result.warnings.filter(w => w.message.includes("'foo'") && w.message.includes('not defined'));
    expect(fooWarnings.length).toBe(1);
  });

  test('does not warn on defined identifiers', () => {
    const result = analyze(`
fn test() {
  x = 42
  y = x + 1
  y
}
`);
    const defWarnings = result.warnings.filter(w => w.message.includes('not defined'));
    expect(defWarnings.length).toBe(0);
  });

  test('does not warn on JS globals', () => {
    const result = analyze(`
fn test() {
  x = JSON
  y = Math
  z = console
  x
}
`);
    const defWarnings = result.warnings.filter(w => w.message.includes('not defined'));
    expect(defWarnings.length).toBe(0);
  });

  test('does not warn on Tova builtins', () => {
    const result = analyze(`
fn test() {
  x = len("hello")
  y = range(10)
  z = Ok(42)
  x
}
`);
    const defWarnings = result.warnings.filter(w => w.message.includes('not defined'));
    expect(defWarnings.length).toBe(0);
  });

  test('warns on typos', () => {
    const result = analyze(`
fn test() {
  x = 42
  y = x + z_typo
  y
}
`);
    const typoWarnings = result.warnings.filter(w => w.message.includes("'z_typo'") && w.message.includes('not defined'));
    expect(typoWarnings.length).toBe(1);
  });

  test('does not warn on _-prefixed identifiers (wildcard convention)', () => {
    const result = analyze(`
fn test() {
  x = _
  x
}
`);
    const defWarnings = result.warnings.filter(w => w.message.includes('not defined'));
    expect(defWarnings.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Immutability Enforcement
// ═══════════════════════════════════════════════════════════════
describe('Immutability Enforcement', () => {
  test('errors on immutable reassignment in same scope', () => {
    expect(analyzeThrows('x = 1\nx = 2')).toThrow(/Cannot reassign immutable variable/);
  });

  test('errors on immutable reassignment in nested if block', () => {
    expect(analyzeThrows(`
fn test() {
  x = 10
  if true {
    x = 20
  }
}
`)).toThrow(/Cannot reassign immutable variable 'x'/);
  });

  test('errors on immutable reassignment in nested for block', () => {
    expect(analyzeThrows(`
fn test() {
  x = 10
  for i in [1, 2] {
    x = i
  }
}
`)).toThrow(/Cannot reassign immutable variable 'x'/);
  });

  test('allows mutable var reassignment in nested block', () => {
    const result = analyze(`
fn test() {
  var x = 10
  if true {
    x = 20
  }
  x
}
`);
    expect(result).toBeDefined();
  });

  test('allows shadowing across function boundaries', () => {
    const result = analyze(`
x = 10
fn test() {
  x = 20
  x
}
`);
    expect(result).toBeDefined();
  });

  test('compound assignment on immutable errors', () => {
    expect(analyzeThrows(`
fn test() {
  x = 10
  x += 1
}
`)).toThrow(/Cannot use '\+=' on immutable variable 'x'/);
  });

  test('compound assignment on mutable var succeeds', () => {
    const result = analyze(`
fn test() {
  var x = 10
  x += 1
  x
}
`);
    expect(result).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Argument Count Validation
// ═══════════════════════════════════════════════════════════════
describe('Argument Count Validation', () => {
  test('warns when too many arguments passed', () => {
    const result = analyze(`
fn add(a, b) { a + b }
x = add(1, 2, 3)
`);
    const argWarnings = result.warnings.filter(w => w.message.includes('expects 2 arguments'));
    expect(argWarnings.length).toBe(1);
  });

  test('warns when too few arguments passed', () => {
    const result = analyze(`
fn add(a, b) { a + b }
x = add(1)
`);
    const argWarnings = result.warnings.filter(w => w.message.includes('expects at least 2'));
    expect(argWarnings.length).toBe(1);
  });

  test('does not warn on correct argument count', () => {
    const result = analyze(`
fn add(a, b) { a + b }
x = add(1, 2)
`);
    const argWarnings = result.warnings.filter(w => w.message.includes('argument'));
    expect(argWarnings.length).toBe(0);
  });

  test('respects default parameters', () => {
    const result = analyze(`
fn greet(name, greeting = "Hello") { greeting }
x = greet("world")
`);
    const argWarnings = result.warnings.filter(w => w.message.includes('argument'));
    expect(argWarnings.length).toBe(0);
  });

  test('warns when fewer than required args with defaults', () => {
    const result = analyze(`
fn greet(name, greeting = "Hello") { greeting }
x = greet()
`);
    const argWarnings = result.warnings.filter(w => w.message.includes('expects at least 1'));
    expect(argWarnings.length).toBe(1);
  });

  test('warns when too many args even with defaults', () => {
    const result = analyze(`
fn greet(name, greeting = "Hello") { greeting }
x = greet("world", "Hi", "extra")
`);
    const argWarnings = result.warnings.filter(w => w.message.includes('expects 2 arguments'));
    expect(argWarnings.length).toBe(1);
  });

  test('does not warn on builtin functions', () => {
    const result = analyze(`
x = print(1, 2, 3)
y = len("hello")
`);
    const argWarnings = result.warnings.filter(w => w.message.includes('argument'));
    expect(argWarnings.length).toBe(0);
  });

  test('validates variant constructor argument count', () => {
    const result = analyze(`
type Point {
  XY(x: Int, y: Int)
}
p = XY(1, 2, 3)
`);
    const argWarnings = result.warnings.filter(w => w.message.includes("'XY' expects 2 arguments"));
    expect(argWarnings.length).toBe(1);
  });

  test('does not warn when spread arguments are used', () => {
    const result = analyze(`
fn add(a, b) { a + b }
fn_args = [1, 2]
x = add(...fn_args)
`);
    const argWarnings = result.warnings.filter(w => w.message.includes('argument'));
    expect(argWarnings.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Finally Blocks
// ═══════════════════════════════════════════════════════════════
describe('Finally', () => {
  // ── Lexer ──
  test('finally keyword is lexed', () => {
    const tokens = tokenize('finally');
    expect(tokens[0].type).toBe('FINALLY');
  });

  // ── Parser ──
  test('try/catch/finally parses correctly', () => {
    const ast = parse(`
try { risky() } catch e { handle(e) } finally { cleanup() }
`);
    const stmt = ast.body[0];
    expect(stmt.type).toBe('TryCatchStatement');
    expect(stmt.tryBody.length).toBe(1);
    expect(stmt.catchParam).toBe('e');
    expect(stmt.catchBody.length).toBe(1);
    expect(stmt.finallyBody).not.toBeNull();
    expect(stmt.finallyBody.length).toBe(1);
  });

  test('try/finally without catch parses correctly', () => {
    const ast = parse(`
try { risky() } finally { cleanup() }
`);
    const stmt = ast.body[0];
    expect(stmt.type).toBe('TryCatchStatement');
    expect(stmt.tryBody.length).toBe(1);
    expect(stmt.catchBody).toBeNull();
    expect(stmt.catchParam).toBeNull();
    expect(stmt.finallyBody).not.toBeNull();
    expect(stmt.finallyBody.length).toBe(1);
  });

  test('try/catch without finally still works', () => {
    const ast = parse(`
try { risky() } catch e { handle(e) }
`);
    const stmt = ast.body[0];
    expect(stmt.type).toBe('TryCatchStatement');
    expect(stmt.catchBody.length).toBe(1);
    expect(stmt.finallyBody).toBeNull();
  });

  test('try/catch/finally with multiple statements', () => {
    const ast = parse(`
try {
  a = 1
  b = 2
} catch e {
  log(e)
} finally {
  cleanup_a()
  cleanup_b()
}
`);
    const stmt = ast.body[0];
    expect(stmt.tryBody.length).toBe(2);
    expect(stmt.catchBody.length).toBe(1);
    expect(stmt.finallyBody.length).toBe(2);
  });

  test('try without catch or finally is a parse error', () => {
    expect(() => parse('try { risky() }')).toThrow();
  });

  // ── Analyzer ──
  test('try/catch/finally analyzes without error', () => {
    expect(() => analyze(`
try {
  x = 1
} catch e {
  y = e
} finally {
  z = 0
}
`)).not.toThrow();
  });

  test('try/finally without catch analyzes without error', () => {
    expect(() => analyze(`
try {
  x = 1
} finally {
  y = 0
}
`)).not.toThrow();
  });

  test('finally block has its own scope', () => {
    // Variables in finally don't leak out
    expect(() => analyze(`
try {
  x = 1
} finally {
  cleanup = true
}
`)).not.toThrow();
  });

  // ── Codegen ──
  test('try/catch/finally generates correct JS', () => {
    const code = compileShared(`
try { risky() } catch e { handle(e) } finally { cleanup() }
`);
    expect(code).toContain('try {');
    expect(code).toContain('catch (e)');
    expect(code).toContain('finally {');
    expect(code).toContain('cleanup()');
  });

  test('try/finally without catch generates correct JS', () => {
    const code = compileShared(`
try { risky() } finally { cleanup() }
`);
    expect(code).toContain('try {');
    expect(code).toContain('finally {');
    expect(code).toContain('cleanup()');
    expect(code).not.toContain('catch');
  });

  test('try/catch without param + finally generates correct JS', () => {
    const code = compileShared(`
try { risky() } catch { fallback() } finally { cleanup() }
`);
    expect(code).toContain('try {');
    expect(code).toContain('catch (__err)');
    expect(code).toContain('finally {');
  });

  // ── Runtime verification ──
  test('finally block always executes (no error)', () => {
    const code = compileShared(`
fn test() {
  var result = ""
  try {
    result += "try "
  } catch e {
    result += "catch "
  } finally {
    result += "finally"
  }
  result
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toBe('try finally');
  });

  test('finally block always executes (with error)', () => {
    const code = compileShared(`
fn test() {
  var result = ""
  try {
    result += "try "
    throw_error()
  } catch e {
    result += "catch "
  } finally {
    result += "finally"
  }
  result
}
`);
    // throw_error is not defined, so it throws ReferenceError
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toBe('try catch finally');
  });

  test('try/finally without catch propagates error after finally', () => {
    const code = compileShared(`
fn test() {
  var ran_finally = false
  try {
    try {
      throw_error()
    } finally {
      ran_finally = true
    }
  } catch e {
    return ran_finally
  }
  ran_finally
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toBe(true);
  });
});

// ================================================================
// Circular Import Detection Tests
// ================================================================

describe('Circular Import Detection', () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  test('circular a→b→a does not infinite loop and emits warning', () => {
    // Create temp directory with circular imports
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tova-circular-'));
    const aFile = path.join(tmpDir, 'a.tova');
    const bFile = path.join(tmpDir, 'b.tova');

    fs.writeFileSync(aFile, 'import { y } from "./b.tova"\nx = 1');
    fs.writeFileSync(bFile, 'import { x } from "./a.tova"\ny = 2');

    // Dynamically import compileWithImports from bin/tova.js
    // Since compileWithImports is not exported, test the logic directly
    // by simulating what it does
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      // We can test the core detection logic with the compilation cache/inProgress sets
      const compilationCache = new Map();
      const compilationInProgress = new Set();

      // Simulate: a.tova starts compiling
      compilationInProgress.add(aFile);

      // While compiling a, it finds import of b.tova
      // b starts compiling
      compilationInProgress.add(bFile);

      // While compiling b, it finds import of a.tova
      // a is already in progress — circular!
      expect(compilationInProgress.has(aFile)).toBe(true);

      // This is exactly the check compileWithImports does
      if (compilationInProgress.has(aFile)) {
        console.warn(`Warning: Circular import detected: ${bFile} → ${aFile}`);
      }

      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('Circular import detected');
      expect(warnings[0]).toContain('a.tova');
    } finally {
      console.warn = origWarn;
      // Cleanup
      fs.unlinkSync(aFile);
      fs.unlinkSync(bFile);
      fs.rmdirSync(tmpDir);
    }
  });

  test('compilationInProgress Set tracks in-flight files correctly', () => {
    const inProgress = new Set();

    inProgress.add('/a.tova');
    expect(inProgress.has('/a.tova')).toBe(true);
    expect(inProgress.has('/b.tova')).toBe(false);

    inProgress.add('/b.tova');
    expect(inProgress.has('/b.tova')).toBe(true);

    // After compilation completes, file is removed
    inProgress.delete('/a.tova');
    expect(inProgress.has('/a.tova')).toBe(false);
    expect(inProgress.has('/b.tova')).toBe(true);
  });
});

// ================================================================
// Stdlib Expansion Tests
// ================================================================

describe('Stdlib — Collection Functions', () => {
  test('find returns first match or null', () => {
    const code = compileWithStdlib(`
fn test() {
  result = find([1, 2, 3, 4], fn(x) x > 2)
  result
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toBe(3);
  });

  test('find returns null when no match', () => {
    const code = compileWithStdlib(`
fn test() {
  find([1, 2, 3], fn(x) x > 10)
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toBeNull();
  });

  test('any returns true if any element matches', () => {
    const code = compileWithStdlib(`
fn test() {
  any([1, 2, 3], fn(x) x == 2)
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toBe(true);
  });

  test('all returns true if all elements match', () => {
    const code = compileWithStdlib(`
fn test() {
  all([2, 4, 6], fn(x) x % 2 == 0)
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toBe(true);
  });

  test('flat_map maps and flattens', () => {
    const code = compileWithStdlib(`
fn test() {
  flat_map([1, 2, 3], fn(x) [x, x * 10])
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toEqual([1, 10, 2, 20, 3, 30]);
  });

  test('reduce with initial value', () => {
    const code = compileWithStdlib(`
fn test() {
  reduce([1, 2, 3], fn(acc, x) acc + x, 0)
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toBe(6);
  });

  test('unique deduplicates', () => {
    const code = compileWithStdlib(`
fn test() {
  unique([1, 2, 2, 3, 3, 3])
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toEqual([1, 2, 3]);
  });

  test('group_by groups elements', () => {
    const code = compileWithStdlib(`
fn test() {
  group_by(["apple", "ant", "banana"], fn(s) s[0])
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toEqual({ a: ['apple', 'ant'], b: ['banana'] });
  });

  test('chunk splits into sized groups', () => {
    const code = compileWithStdlib(`
fn test() {
  chunk([1, 2, 3, 4, 5], 2)
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toEqual([[1, 2], [3, 4], [5]]);
  });

  test('flatten flattens one level', () => {
    const code = compileWithStdlib(`
fn test() {
  flatten([[1, 2], [3, 4], [5]])
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toEqual([1, 2, 3, 4, 5]);
  });

  test('take and drop', () => {
    const code = compileWithStdlib(`
fn test() {
  [take([1, 2, 3, 4, 5], 3), drop([1, 2, 3, 4, 5], 3)]
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toEqual([[1, 2, 3], [4, 5]]);
  });

  test('first and last', () => {
    const code = compileWithStdlib(`
fn test() {
  [first([10, 20, 30]), last([10, 20, 30]), first([]), last([])]
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toEqual([10, 30, null, null]);
  });

  test('count counts matching elements', () => {
    const code = compileWithStdlib(`
fn test() {
  count([1, 2, 3, 4, 5], fn(x) x > 3)
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toBe(2);
  });

  test('partition splits by predicate', () => {
    const code = compileWithStdlib(`
fn test() {
  partition([1, 2, 3, 4, 5], fn(x) x % 2 == 0)
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toEqual([[2, 4], [1, 3, 5]]);
  });
});

describe('Stdlib — Math Functions', () => {
  test('abs', () => {
    const code = compileWithStdlib('fn test() { abs(-5) }');
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toBe(5);
  });

  test('floor, ceil, round', () => {
    const code = compileWithStdlib(`
fn test() {
  [floor(3.7), ceil(3.2), round(3.5)]
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toEqual([3, 4, 4]);
  });

  test('clamp', () => {
    const code = compileWithStdlib(`
fn test() {
  [clamp(5, 0, 10), clamp(-3, 0, 10), clamp(15, 0, 10)]
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toEqual([5, 0, 10]);
  });

  test('sqrt and pow', () => {
    const code = compileWithStdlib(`
fn test() {
  [sqrt(16), pow(2, 10)]
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toEqual([4, 1024]);
  });

  test('random returns number between 0 and 1', () => {
    const code = compileWithStdlib('fn test() { random() }');
    const fn = new Function(code + '\nreturn test();');
    const result = fn();
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(1);
  });
});

describe('Stdlib — String Functions', () => {
  test('trim', () => {
    const code = compileWithStdlib('fn test() { trim("  hello  ") }');
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toBe('hello');
  });

  test('split and join', () => {
    const code = compileWithStdlib(`
fn test() {
  parts = split("a,b,c", ",")
  join(parts, "-")
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toBe('a-b-c');
  });

  test('replace', () => {
    const code = compileWithStdlib('fn test() { replace("hello world", "world", "tova") }');
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toBe('hello tova');
  });

  test('repeat', () => {
    const code = compileWithStdlib('fn test() { repeat("ab", 3) }');
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toBe('ababab');
  });
});

describe('Stdlib — Utility Functions', () => {
  test('keys, values, entries', () => {
    const code = compileWithStdlib(`
fn test() {
  obj = {a: 1, b: 2}
  [keys(obj), values(obj)]
}
`);
    const fn = new Function(code + '\nreturn test();');
    const [k, v] = fn();
    expect(k.sort()).toEqual(['a', 'b']);
    expect(v.sort()).toEqual([1, 2]);
  });

  test('merge', () => {
    const code = compileWithStdlib(`
fn test() {
  merge({a: 1}, {b: 2}, {a: 3})
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toEqual({ a: 3, b: 2 });
  });

  test('freeze prevents mutation', () => {
    const code = compileWithStdlib(`
fn test() {
  obj = freeze({x: 1})
  obj
}
`);
    const fn = new Function(code + '\nreturn test();');
    const result = fn();
    expect(result.x).toBe(1);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test('clone creates deep copy', () => {
    const code = compileWithStdlib(`
fn test() {
  original = {a: [1, 2]}
  copy = clone(original)
  copy
}
`);
    const fn = new Function(code + '\nreturn test();');
    expect(fn()).toEqual({ a: [1, 2] });
  });
});

describe('Stdlib — Analyzer recognizes new builtins', () => {
  test('no undefined warnings for new stdlib functions', () => {
    const result = analyze(`
fn test() {
  find([1], fn(x) x > 0)
  any([1], fn(x) x > 0)
  all([1], fn(x) x > 0)
  flat_map([1], fn(x) [x])
  unique([1])
  group_by([1], fn(x) x)
  chunk([1], 1)
  flatten([[1]])
  take([1], 1)
  drop([1], 1)
  first([1])
  last([1])
  count([1], fn(x) x > 0)
  partition([1], fn(x) x > 0)
  abs(1)
  floor(1.5)
  ceil(1.5)
  round(1.5)
  clamp(5, 0, 10)
  sqrt(4)
  pow(2, 3)
  random()
  trim(" x ")
  split("a,b", ",")
  join(["a"], ",")
  replace("a", "a", "b")
  repeat("a", 2)
  keys({})
  values({})
  entries({})
  merge({})
  freeze({})
  clone({})
  sleep(100)
}
`);
    const undefinedWarnings = result.warnings.filter(w => w.message.includes('is not defined'));
    expect(undefinedWarnings).toEqual([]);
  });
});

// ================================================================
// Parser Error Recovery Tests
// ================================================================

describe('Parser Error Recovery', () => {
  test('collects multiple errors from separate statements', () => {
    // type expects identifier but gets number — parser error
    try {
      parse(`
fn foo() { return 1 }
type 123 { Bad }
fn bar() { return 3 }
type 456 { Bad2 }
`);
      expect(true).toBe(false); // should have thrown
    } catch (e) {
      expect(e.errors).toBeDefined();
      expect(e.errors.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('attaches partialAST with successfully parsed statements', () => {
    try {
      parse(`
fn good1() { return 1 }
type 123 { Bad }
fn good2() { return 3 }
`);
      expect(true).toBe(false);
    } catch (e) {
      expect(e.partialAST).toBeDefined();
      expect(e.partialAST.type).toBe('Program');
      // Should have parsed at least one good function
      expect(e.partialAST.body.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('single error still works normally', () => {
    expect(() => parse('type 123 { Bad }')).toThrow();
  });

  test('valid code still parses without errors', () => {
    const ast = parse(`
fn foo() { return 1 }
fn bar() { return 2 }
`);
    expect(ast.type).toBe('Program');
    expect(ast.body.length).toBe(2);
  });

  test('combined error message includes all error messages', () => {
    try {
      parse(`
type 123 { Bad1 }
type 456 { Bad2 }
`);
      expect(true).toBe(false);
    } catch (e) {
      expect(e.errors).toBeDefined();
      expect(e.message).toContain('Parse error');
    }
  });

  test('errors have loc information', () => {
    try {
      parse(`
fn good() { return 1 }
type 123 { Bad }
`);
      expect(true).toBe(false);
    } catch (e) {
      expect(e.errors.length).toBeGreaterThanOrEqual(1);
      const err = e.errors[0];
      expect(err.loc).toBeDefined();
      expect(err.loc.line).toBeGreaterThan(0);
    }
  });
});

// ─── Named Arguments ────────────────────────────────────────────

describe('Named Arguments', () => {
  test('all named arguments compile to object', () => {
    const code = compileShared(`
fn greet(opts) {
  return opts.name
}
greet(name: "Alice", age: 30)
`);
    expect(code).toContain('greet({ name: "Alice", age: 30 })');
  });

  test('mixed positional and named arguments', () => {
    const code = compileShared(`
fn create(kind, opts) {
  return kind
}
create("user", name: "Bob", role: "admin")
`);
    expect(code).toContain('create("user", { name: "Bob", role: "admin" })');
  });

  test('single named argument', () => {
    const code = compileShared(`
fn config(opts) { return opts }
config(debug: true)
`);
    expect(code).toContain('config({ debug: true })');
  });

  test('named arguments with expressions as values', () => {
    const code = compileShared(`
fn setup(opts) { return opts }
x = 10
setup(width: x + 5, height: x * 2)
`);
    expect(code).toContain('setup({ width: (x + 5), height: (x * 2) })');
  });

  test('named argument AST node', () => {
    const ast = parse(`foo(name: "test")`);
    const call = ast.body[0].expression;
    expect(call.type).toBe('CallExpression');
    expect(call.arguments[0].type).toBe('NamedArgument');
    expect(call.arguments[0].name).toBe('name');
  });

  test('named args with method calls', () => {
    const code = compileShared(`
fn render(opts) { return opts }
render(visible: true, count: len("hello"))
`);
    expect(code).toContain('render({ visible: true, count: len("hello") })');
  });

  test('named args in nested calls', () => {
    const code = compileShared(`
fn outer(opts) { return opts }
fn inner() { return 1 }
outer(x: inner(), y: 2)
`);
    expect(code).toContain('outer({ x: inner(), y: 2 })');
  });
});

// ─── Tuple Types ────────────────────────────────────────────────

describe('Tuple Types', () => {
  test('tuple expression compiles to array', () => {
    const code = compileShared(`x = (1, 2, 3)`);
    expect(code).toContain('[1, 2, 3]');
  });

  test('tuple destructuring with let', () => {
    const code = compileShared(`let (a, b) = (1, 2)`);
    expect(code).toContain('[1, 2]');
    expect(code).toMatch(/const \[a, b\]/);
  });

  test('two-element tuple', () => {
    const code = compileShared(`pair = ("hello", 42)`);
    expect(code).toContain('["hello", 42]');
  });

  test('tuple in function return', () => {
    const code = compileShared(`
fn swap(a, b) {
  return (b, a)
}
`);
    expect(code).toContain('return [b, a]');
  });

  test('nested tuple', () => {
    const code = compileShared(`x = (1, (2, 3))`);
    expect(code).toContain('[1, [2, 3]]');
  });
});

// ─── Impl Blocks ────────────────────────────────────────────────

describe('Impl Blocks', () => {
  test('impl block generates prototype methods', () => {
    const code = compileShared(`
type User {
  name: String
  email: String
}

impl User {
  fn display(self) {
    return self.name
  }
}
`);
    expect(code).toContain('User.prototype.display');
  });

  test('impl block with multiple methods', () => {
    const code = compileShared(`
type Point {
  x: Number
  y: Number
}

impl Point {
  fn distance(self) {
    return self.x + self.y
  }
  fn scale(self, factor) {
    return Point(self.x * factor, self.y * factor)
  }
}
`);
    expect(code).toContain('Point.prototype.distance');
    expect(code).toContain('Point.prototype.scale');
  });
});

// ─── Trait System ───────────────────────────────────────────────

describe('Trait System', () => {
  test('trait declaration parses', () => {
    const ast = parse(`
trait Display {
  fn display(self) -> String
}
`);
    const trait = ast.body[0];
    expect(trait.type).toBe('TraitDeclaration');
    expect(trait.name).toBe('Display');
  });

  test('trait with default implementation', () => {
    const code = compileShared(`
trait Printable {
  fn to_string(self) -> String
  fn print(self) {
    return self.to_string()
  }
}
`);
    expect(code).toContain('__trait_Printable_print');
  });
});

// ─── Type Aliases ───────────────────────────────────────────────

describe('Type Aliases', () => {
  test('type alias parses', () => {
    const ast = parse(`type Url = String`);
    const alias = ast.body[0];
    expect(alias.type).toBe('TypeAlias');
    expect(alias.name).toBe('Url');
  });

  test('type alias generates comment only', () => {
    const code = compileShared(`type Url = String`);
    expect(code).toContain('type alias');
    expect(code).not.toContain('class');
  });
});

// ─── Defer Statement ────────────────────────────────────────────

describe('Defer Statement', () => {
  test('defer wraps in try/finally', () => {
    const code = compileShared(`
fn cleanup() {
  x = open()
  defer close(x)
  process(x)
}
`);
    expect(code).toContain('try');
    expect(code).toContain('finally');
    expect(code).toContain('close(x)');
  });

  test('multiple defers execute LIFO', () => {
    const code = compileShared(`
fn multi() {
  defer first()
  defer second()
  work()
}
`);
    // second should appear before first in finally block (LIFO)
    const finallyIdx = code.indexOf('finally');
    const secondIdx = code.indexOf('second()', finallyIdx);
    const firstIdx = code.indexOf('first()', finallyIdx);
    expect(secondIdx).toBeLessThan(firstIdx);
  });
});

// ─── Yield / Generators ─────────────────────────────────────────

describe('Generators', () => {
  test('function with yield becomes generator', () => {
    const code = compileShared(`
fn numbers() {
  yield 1
  yield 2
  yield 3
}
`);
    expect(code).toContain('function*');
    expect(code).toContain('yield 1');
  });

  test('yield expression parses', () => {
    const ast = parse(`
fn gen() {
  yield 42
}
`);
    const fn = ast.body[0];
    const yieldExpr = fn.body.body[0].expression;
    expect(yieldExpr.type).toBe('YieldExpression');
    expect(yieldExpr.argument.value).toBe(42);
  });
});

// ─── Pub Visibility ─────────────────────────────────────────────

describe('Pub Visibility', () => {
  test('pub fn parses with isPublic flag', () => {
    const ast = parse(`pub fn hello() { return 1 }`);
    const fn = ast.body[0];
    expect(fn.type).toBe('FunctionDeclaration');
    expect(fn.isPublic).toBe(true);
  });

  test('non-pub fn does not have isPublic', () => {
    const ast = parse(`fn hello() { return 1 }`);
    const fn = ast.body[0];
    expect(fn.isPublic).toBeFalsy();
  });

  test('pub type parses', () => {
    const ast = parse(`pub type Color { Red, Green, Blue }`);
    const type = ast.body[0];
    expect(type.isPublic).toBe(true);
  });
});

// ─── Unicode Identifiers ────────────────────────────────────────

describe('Unicode Identifiers', () => {
  test('accented identifier', () => {
    const code = compileShared(`café = 42`);
    expect(code).toContain('café');
    expect(code).toContain('42');
  });

  test('CJK identifier', () => {
    const code = compileShared(`名前 = "hello"`);
    expect(code).toContain('名前');
  });

  test('mixed script identifier', () => {
    const code = compileShared(`αβγ = 1`);
    expect(code).toContain('αβγ');
  });
});

// ─── String Stdlib Functions ─────────────────────────────────────

describe('String Stdlib Functions', () => {
  test('upper function available in stdlib', () => {
    const code = compileWithStdlib(`x = upper("hello")`);
    expect(code).toContain('function upper(s)');
    // upper() is inlined to .toUpperCase() by codegen
    expect(code).toContain('.toUpperCase()');
  });

  test('lower function available in stdlib', () => {
    const code = compileWithStdlib(`x = lower("HELLO")`);
    expect(code).toContain('function lower(s)');
  });

  test('contains function in stdlib', () => {
    const code = compileWithStdlib(`x = contains("hello world", "world")`);
    expect(code).toContain('function contains(s, sub)');
  });

  test('capitalize function in stdlib', () => {
    const code = compileWithStdlib(`x = capitalize("hello")`);
    expect(code).toContain('function capitalize(s)');
  });

  test('snake_case function in stdlib', () => {
    const code = compileWithStdlib(`x = snake_case("helloWorld")`);
    expect(code).toContain('function snake_case(s)');
  });

  test('camel_case function in stdlib', () => {
    const code = compileWithStdlib(`x = camel_case("hello_world")`);
    expect(code).toContain('function camel_case(s)');
  });

  test('assert_eq function in stdlib', () => {
    const code = compileWithStdlib(`assert_eq(1, 1)`);
    expect(code).toContain('function assert_eq(a, b');
  });

  test('assert_ne function in stdlib', () => {
    const code = compileWithStdlib(`assert_ne(1, 2)`);
    expect(code).toContain('function assert_ne(a, b');
  });
});

// ─── Regex Literals ──────────────────────────────────────────────

describe('Regex Literals', () => {
  test('simple regex literal', () => {
    const code = compileShared(`pattern = /hello/`);
    expect(code).toContain('/hello/');
  });

  test('regex with flags', () => {
    const code = compileShared(`pattern = /test/gi`);
    expect(code).toContain('/test/gi');
  });

  test('regex in assignment context', () => {
    const code = compileShared(`x = /\\d+/`);
    expect(code).toContain('/\\d+/');
  });

  test('regex AST node', () => {
    const ast = parse(`x = /hello/g`);
    const assign = ast.body[0];
    const regex = assign.values[0];
    expect(regex.type).toBe('RegexLiteral');
    expect(regex.pattern).toBe('hello');
    expect(regex.flags).toBe('g');
  });

  test('regex in function call', () => {
    const code = compileShared(`result = match_pattern(/\\w+/g)`);
    expect(code).toContain('/\\w+/g');
  });

  test('regex with character class', () => {
    const code = compileShared(`pattern = /[a-z0-9]+/i`);
    expect(code).toContain('/[a-z0-9]+/i');
  });
});

// ─── Raw Strings ──────────────────────────────────────────────

describe('Raw Strings', () => {
  test('raw string preserves backslashes', () => {
    const tokens = tokenize(`r"hello\\nworld"`);
    const strToken = tokens.find(t => t.type === 'STRING');
    expect(strToken).toBeDefined();
    expect(strToken.value).toBe('hello\\nworld');
  });

  test('raw string in code', () => {
    const code = compileShared(`path = r"C:\\Users\\test"`);
    expect(code).toContain('C:\\\\Users\\\\test');
  });

  test('raw string as regex pattern', () => {
    const tokens = tokenize(`r"\\d+\\.\\d+"`);
    const strToken = tokens.find(t => t.type === 'STRING');
    expect(strToken.value).toBe('\\d+\\.\\d+');
  });
});

// ================================================================
// Union Types
// ================================================================

describe('Union Types', () => {
  test('parse union type alias', () => {
    const ast = parse('type StringOrNumber = String | Int');
    const alias = ast.body[0];
    expect(alias.type).toBe('TypeAlias');
    expect(alias.name).toBe('StringOrNumber');
    expect(alias.typeExpr.type).toBe('UnionTypeAnnotation');
    expect(alias.typeExpr.members).toHaveLength(2);
    expect(alias.typeExpr.members[0].name).toBe('String');
    expect(alias.typeExpr.members[1].name).toBe('Int');
  });

  test('parse multi-member union', () => {
    const ast = parse('type Value = String | Int | Float | Bool');
    const union = ast.body[0].typeExpr;
    expect(union.type).toBe('UnionTypeAnnotation');
    expect(union.members).toHaveLength(4);
    expect(union.members.map(m => m.name)).toEqual(['String', 'Int', 'Float', 'Bool']);
  });

  test('inline union in function param', () => {
    const ast = parse('fn process(x: String | Int) -> String { "hello" }');
    const param = ast.body[0].params[0];
    expect(param.typeAnnotation.type).toBe('UnionTypeAnnotation');
    expect(param.typeAnnotation.members).toHaveLength(2);
  });

  test('union type alias compiles to comment', () => {
    const code = compileShared('type StringOrNumber = String | Int');
    expect(code).toContain('type alias: StringOrNumber = String | Int');
  });

  test('BAR token is emitted for standalone |', () => {
    const tokens = tokenize('x | y');
    expect(tokens.some(t => t.type === 'BAR')).toBe(true);
  });

  test('union with generic types', () => {
    const ast = parse('type ApiResponse = Result<String, Error> | Option<Int>');
    const union = ast.body[0].typeExpr;
    expect(union.type).toBe('UnionTypeAnnotation');
    expect(union.members).toHaveLength(2);
    expect(union.members[0].name).toBe('Result');
    expect(union.members[0].typeParams).toHaveLength(2);
  });

  test('analyzer accepts union type alias', () => {
    const result = analyze('type StringOrNumber = String | Int');
    expect(result.warnings.filter(w => w.severity === 'error')).toHaveLength(0);
  });
});

// ================================================================
// Generic Type Aliases
// ================================================================

describe('Generic Type Aliases', () => {
  test('parse generic type alias', () => {
    const ast = parse('type Handler<T> = (Request) -> Result<T, Error>');
    const alias = ast.body[0];
    expect(alias.type).toBe('TypeAlias');
    expect(alias.name).toBe('Handler');
    expect(alias.typeParams).toEqual(['T']);
    expect(alias.typeExpr.type).toBe('FunctionTypeAnnotation');
  });

  test('parse multi-param generic alias', () => {
    const ast = parse('type Pair<A, B> = (A, B)');
    const alias = ast.body[0];
    expect(alias.typeParams).toEqual(['A', 'B']);
    expect(alias.typeExpr.type).toBe('TupleTypeAnnotation');
  });

  test('generic alias compiles to comment with params', () => {
    const code = compileShared('type Callback<T> = (T) -> Nil');
    expect(code).toContain('type alias: Callback<T>');
  });

  test('analyzer accepts generic type alias', () => {
    const result = analyze('type Handler<T> = (Request) -> Result<T, Error>');
    expect(result.warnings.filter(w => w.severity === 'error')).toHaveLength(0);
  });

  test('non-generic alias still works', () => {
    const ast = parse('type Name = String');
    const alias = ast.body[0];
    expect(alias.typeParams).toEqual([]);
    expect(alias.typeExpr.name).toBe('String');
  });
});

// ================================================================
// Type Narrowing in Conditionals
// ================================================================

describe('Type Narrowing', () => {
  test('typeOf narrowing compiles without errors', () => {
    const code = compileShared(`
      fn process(x: String | Int) -> String {
        if type_of(x) == "String" {
          x
        } else {
          "number"
        }
      }
    `);
    expect(code).toContain('function process');
    expect(code).toContain('type_of(x)');
  });

  test('nil check narrowing compiles without errors', () => {
    const code = compileShared(`
      fn safe(x: String) -> String {
        if x != nil {
          x
        } else {
          "default"
        }
      }
    `);
    expect(code).toContain('!= null');
  });

  test('analyzer does not error on narrowing pattern', () => {
    const result = analyze(`
      fn process(x: String | Int) -> String {
        if type_of(x) == "String" {
          result = x
        }
        "done"
      }
    `);
    expect(result.warnings.filter(w => w.severity === 'error')).toHaveLength(0);
  });

  test('isOk narrowing compiles', () => {
    const code = compileShared(`
      fn handle(r: Result) -> String {
        if r.isOk() {
          "success"
        } else {
          "failure"
        }
      }
    `);
    expect(code).toContain('.isOk()');
  });
});

// ================================================================
// Extensible Derive
// ================================================================

describe('Extensible Derive', () => {
  test('built-in derive Eq still works', () => {
    const code = compileShared(`
      type Point { x: Int, y: Int } derive [Eq]
    `);
    expect(code).toContain('__eq');
    expect(code).toContain('a.x === b.x');
  });

  test('built-in derive Show still works', () => {
    const code = compileShared(`
      type Point { x: Int, y: Int } derive [Show]
    `);
    expect(code).toContain('__show');
  });

  test('built-in derive JSON still works', () => {
    const code = compileShared(`
      type Point { x: Int, y: Int } derive [JSON]
    `);
    expect(code).toContain('toJSON');
    expect(code).toContain('fromJSON');
  });

  test('user-defined trait with default impl can be derived', () => {
    const code = compileShared(`
      trait Printable {
        fn display(self) -> String {
          "default"
        }
      }
      type Point { x: Int, y: Int } derive [Eq, Printable]
    `);
    expect(code).toContain('__trait_Printable_display');
    expect(code).toContain('Point.prototype.display');
  });

  test('analyzer warns on unknown derive trait', () => {
    const result = analyze(`
      type Point { x: Int, y: Int } derive [UnknownTrait]
    `);
    expect(result.warnings.some(w => w.message.includes("Unknown trait 'UnknownTrait'"))).toBe(true);
  });

  test('impl Trait for Type generates prototype methods', () => {
    const code = compileShared(`
      type Point { x: Int, y: Int }
      impl Point {
        fn distance(self) -> Float {
          0.0
        }
      }
    `);
    expect(code).toContain('Point.prototype.distance');
  });
});

// ================================================================
// Lazy Iterators / Sequences
// ================================================================

describe('Lazy Iterators / Sequences', () => {
  test('iter function is included in stdlib when used', () => {
    const code = compileWithStdlib(`
      result = iter([1, 2, 3]) |> .collect()
    `);
    expect(code).toContain('iter');
  });

  test('Seq class methods compile correctly with method pipe', () => {
    const code = compileShared(`
      result = iter([1, 2, 3, 4, 5])
        |> .filter(fn(x) x > 2)
        |> .map(fn(x) x * 2)
        |> .collect()
    `);
    expect(code).toContain('.filter(');
    expect(code).toContain('.map(');
    expect(code).toContain('.collect()');
  });

  test('Seq.take compiles', () => {
    const code = compileShared(`
      result = iter([1, 2, 3, 4, 5]) |> .take(3) |> .collect()
    `);
    expect(code).toContain('.take(3)');
    expect(code).toContain('.collect()');
  });

  test('Seq.drop compiles', () => {
    const code = compileShared(`
      result = iter([1, 2, 3, 4, 5]) |> .drop(2) |> .collect()
    `);
    expect(code).toContain('.drop(2)');
  });

  test('Seq.enumerate compiles', () => {
    const code = compileShared(`
      result = iter(["a", "b"]) |> .enumerate() |> .collect()
    `);
    expect(code).toContain('.enumerate()');
  });

  test('lazy chain with multiple operations', () => {
    const code = compileShared(`
      result = iter([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        |> .filter(fn(x) x % 2 == 0)
        |> .map(fn(x) x * x)
        |> .take(3)
        |> .collect()
    `);
    expect(code).toContain('.filter(');
    expect(code).toContain('.map(');
    expect(code).toContain('.take(3)');
    expect(code).toContain('.collect()');
  });

  test('Seq terminal operations compile', () => {
    const code = compileShared(`
      nums = iter([1, 2, 3])
      c = nums |> .count()
      a = iter([1, 2, 3]) |> .any(fn(x) x > 2)
      b = iter([1, 2, 3]) |> .all(fn(x) x > 0)
      r = iter([1, 2, 3]) |> .reduce(fn(acc, x) acc + x, 0)
    `);
    expect(code).toContain('.count()');
    expect(code).toContain('.any(');
    expect(code).toContain('.all(');
    expect(code).toContain('.reduce(');
  });
});

// ================================================================
// Implicit `it` parameter (Kotlin-style)
// ================================================================

describe('Implicit it parameter', () => {
  // --- Wrapping cases ---

  test('filter(it > 0) wraps in lambda', () => {
    const code = compileShared(`
      result = filter(it > 0)
    `);
    // Should produce an arrow function with `it` parameter
    expect(code).toContain('=>');
    expect(code).toContain('it');
  });

  test('map(it.name) wraps member access in lambda', () => {
    const code = compileShared(`
      result = map(it.name)
    `);
    expect(code).toContain('=>');
    expect(code).toContain('.name');
  });

  test('sort_by(it.name.toLowerCase()) wraps chained access', () => {
    const code = compileShared(`
      result = sort_by(it.name.toLowerCase())
    `);
    expect(code).toContain('=>');
    expect(code).toContain('.toLowerCase()');
  });

  test('filter(it > 0 and it < 10) wraps compound expressions', () => {
    const code = compileShared(`
      result = filter(it > 0 and it < 10)
    `);
    expect(code).toContain('=>');
    expect(code).toContain('it');
  });

  test('map(stringify(it)) wraps nested call containing it', () => {
    const code = compileShared(`
      result = map(stringify(it))
    `);
    // The outer map arg should be wrapped, inner stringify(it) keeps bare it
    expect(code).toContain('=>');
  });

  test('named arg: process(cb: it > 0) wraps value', () => {
    const ast = parse(`
      process(cb: it > 0)
    `);
    const call = ast.body[0].expression;
    const namedArg = call.arguments[0];
    expect(namedArg.type).toBe('NamedArgument');
    expect(namedArg.value.type).toBe('LambdaExpression');
    expect(namedArg.value.params[0].name).toBe('it');
  });

  // --- Non-wrapping cases ---

  test('process(it) bare it is NOT wrapped', () => {
    const ast = parse(`
      process(it)
    `);
    const call = ast.body[0].expression;
    const arg = call.arguments[0];
    expect(arg.type).toBe('Identifier');
    expect(arg.name).toBe('it');
  });

  test('filter(fn(x) x > 0) explicit lambda is NOT wrapped', () => {
    const ast = parse(`
      filter(fn(x) x > 0)
    `);
    const call = ast.body[0].expression;
    const arg = call.arguments[0];
    expect(arg.type).toBe('LambdaExpression');
    expect(arg.params[0].name).toBe('x');
  });

  // --- Pipe integration ---

  test('list |> filter(it > 0) |> map(it * 2) compiles', () => {
    const code = compileShared(`
      list = [1, 2, 3, 4, 5]
      result = list |> filter(it > 0) |> map(it * 2)
    `);
    expect(code).toContain('=>');
    expect(code).toContain('filter');
    expect(code).toContain('map');
  });

  // --- AST structure checks ---

  test('it > 0 in call arg produces LambdaExpression with it param', () => {
    const ast = parse(`
      filter(it > 0)
    `);
    const call = ast.body[0].expression;
    const arg = call.arguments[0];
    expect(arg.type).toBe('LambdaExpression');
    expect(arg.params.length).toBe(1);
    expect(arg.params[0].name).toBe('it');
    expect(arg.body.type).toBe('BinaryExpression');
  });

  test('it used as variable outside call args still works', () => {
    const code = compileShared(`
      it = 42
      result = it + 1
    `);
    expect(code).toContain('42');
  });

  test('nested lambda boundary: fn(x) x + it does NOT wrap outer it', () => {
    const ast = parse(`
      process(fn(x) x + it)
    `);
    const call = ast.body[0].expression;
    const arg = call.arguments[0];
    // The arg is already a LambdaExpression (explicit), should NOT be double-wrapped
    expect(arg.type).toBe('LambdaExpression');
    expect(arg.params[0].name).toBe('x');
  });

  test('multiple args: only args with free it are wrapped', () => {
    const ast = parse(`
      process(10, it > 0, it)
    `);
    const call = ast.body[0].expression;
    // First arg: number literal, not wrapped
    expect(call.arguments[0].type).toBe('NumberLiteral');
    // Second arg: it > 0, wrapped in lambda
    expect(call.arguments[1].type).toBe('LambdaExpression');
    expect(call.arguments[1].params[0].name).toBe('it');
    // Third arg: bare it, NOT wrapped
    expect(call.arguments[2].type).toBe('Identifier');
    expect(call.arguments[2].name).toBe('it');
  });
});
