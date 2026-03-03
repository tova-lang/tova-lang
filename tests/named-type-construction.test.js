import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

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

function parse(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function analyze(source, options = {}) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, '<test>', options);
  return analyzer.analyze();
}

function getErrors(source, options = {}) {
  try {
    analyze(source, options);
    return [];
  } catch (err) {
    return err.errors || [];
  }
}

function hasError(source, pattern, options = {}) {
  const errors = getErrors(source, options);
  return errors.some(e => e.message.includes(pattern));
}

// ─── Codegen: Named Type Construction ─────────────────────────

describe('Named Type Construction — Codegen', () => {
  test('struct with all named args', () => {
    const code = compileShared(`
      type User { name: String, age: Int }
      u = User(name: "Alice", age: 30)
    `);
    expect(code).toContain('User("Alice", 30)');
  });

  test('struct with reordered named args', () => {
    const code = compileShared(`
      type User { name: String, age: Int }
      u = User(age: 30, name: "Alice")
    `);
    expect(code).toContain('User("Alice", 30)');
  });

  test('struct with positional args unchanged', () => {
    const code = compileShared(`
      type User { name: String, age: Int }
      u = User("Alice", 30)
    `);
    expect(code).toContain('User("Alice", 30)');
  });

  test('variant with named args', () => {
    const code = compileShared(`
      type Shape {
        Circle(radius: Float)
        Rect(width: Float, height: Float)
      }
      c = Circle(radius: 5)
    `);
    expect(code).toContain('Circle(5)');
  });

  test('variant with reordered named args', () => {
    const code = compileShared(`
      type Shape {
        Circle(radius: Float)
        Rect(width: Float, height: Float)
      }
      r = Rect(height: 10, width: 5)
    `);
    expect(code).toContain('Rect(5, 10)');
  });

  test('mixed positional + named args', () => {
    const code = compileShared(`
      type User { name: String, age: Int, email: String }
      u = User("Alice", email: "alice@example.com", age: 30)
    `);
    expect(code).toContain('User("Alice", 30, "alice@example.com")');
  });

  test('regular function with named args unchanged (object wrapping)', () => {
    const code = compileShared(`
      fn greet(opts) { opts.name }
      greet(name: "bar")
    `);
    expect(code).toContain('greet({ name: "bar" })');
  });

  test('named args with expressions', () => {
    const code = compileShared(`
      type Rect { width: Int, height: Int }
      fn double(x) { x * 2 }
      r = Rect(width: double(2), height: double(5))
    `);
    expect(code).toContain('Rect(double(2), double(5))');
  });

  test('struct with three fields, all reordered', () => {
    const code = compileShared(`
      type Point3D { x: Int, y: Int, z: Int }
      p = Point3D(z: 3, x: 1, y: 2)
    `);
    expect(code).toContain('Point3D(1, 2, 3)');
  });

  test('single-field struct with named arg', () => {
    const code = compileShared(`
      type Wrapper { value: Int }
      w = Wrapper(value: 42)
    `);
    expect(code).toContain('Wrapper(42)');
  });
  test('mixed positional + named on variant', () => {
    const code = compileShared(`
      type Shape {
        Rect(width: Int, height: Int, color: String)
      }
      r = Rect(5, color: "red", height: 10)
    `);
    expect(code).toContain('Rect(5, 10, "red")');
  });

  test('multiple named constructor calls in same program', () => {
    const code = compileShared(`
      type Point { x: Int, y: Int }
      a = Point(y: 2, x: 1)
      b = Point(x: 10, y: 20)
    `);
    expect(code).toContain('Point(1, 2)');
    expect(code).toContain('Point(10, 20)');
  });

  test('named construction inside function call', () => {
    const code = compileShared(`
      type Point { x: Int, y: Int }
      fn dist(p) { p.x + p.y }
      d = dist(Point(y: 4, x: 3))
    `);
    expect(code).toContain('dist(Point(3, 4))');
  });

  test('named construction in variable binding then field access', () => {
    const code = compileShared(`
      type Config { host: String, port: Int }
      c = Config(port: 8080, host: "localhost")
    `);
    expect(code).toContain('Config("localhost", 8080)');
  });

  test('named args with boolean and array values', () => {
    const code = compileShared(`
      type Opts { enabled: Bool, tags: [String] }
      o = Opts(tags: ["a", "b"], enabled: true)
    `);
    expect(code).toContain('Opts(true, ["a", "b"])');
  });

  test('named args with lambda value', () => {
    const code = compileShared(`
      type Handler { on_click: Function, label: String }
      h = Handler(label: "OK", on_click: fn(e) print(e))
    `);
    expect(code).toContain('Handler(');
    expect(code).toContain('"OK"');
  });

  test('named args with string containing special chars', () => {
    const code = compileShared(`
      type Query { sql: String, table: String }
      q = Query(table: "users", sql: "SELECT * FROM")
    `);
    expect(code).toContain('Query("SELECT * FROM", "users")');
  });

  test('variant with zero-field constructor ignores named args path', () => {
    const code = compileShared(`
      type Option {
        Some(value: Int)
        None
      }
      x = None
      y = Some(value: 42)
    `);
    expect(code).toContain('Some(42)');
    // None has no args so no named arg path
    expect(code).toContain('None');
  });

  test('four fields fully reordered', () => {
    const code = compileShared(`
      type RGBA { r: Int, g: Int, b: Int, a: Int }
      c = RGBA(a: 255, b: 100, g: 50, r: 200)
    `);
    expect(code).toContain('RGBA(200, 50, 100, 255)');
  });

  test('named construction preserves across multiple types', () => {
    const code = compileShared(`
      type Point { x: Int, y: Int }
      type Size { w: Int, h: Int }
      p = Point(y: 5, x: 3)
      s = Size(h: 100, w: 50)
    `);
    expect(code).toContain('Point(3, 5)');
    expect(code).toContain('Size(50, 100)');
  });

  test('regular function mixed named args still wraps to object', () => {
    const code = compileShared(`
      fn setup(host, opts) { host }
      setup("localhost", port: 8080, ssl: true)
    `);
    expect(code).toContain('setup("localhost", { port: 8080, ssl: true })');
  });
});

// ─── Analyzer: Named Type Construction ────────────────────────

describe('Named Type Construction — Analyzer', () => {
  test('unknown field in struct constructor', () => {
    expect(hasError(`
      type User { name: String, age: Int }
      u = User(name: "Alice", unknown: 30)
    `, "Unknown field 'unknown'")).toBe(true);
  });

  test('unknown field in variant constructor', () => {
    expect(hasError(`
      type Shape {
        Circle(radius: Float)
      }
      c = Circle(diameter: 5)
    `, "Unknown field 'diameter'")).toBe(true);
  });

  test('duplicate named argument', () => {
    expect(hasError(`
      type User { name: String, age: Int }
      u = User(name: "Alice", name: "Bob")
    `, "Duplicate named argument 'name'")).toBe(true);
  });

  test('field already provided positionally', () => {
    expect(hasError(`
      type User { name: String, age: Int }
      u = User("Alice", name: "Bob")
    `, "Field 'name' already provided positionally")).toBe(true);
  });

  test('type mismatch on named constructor arg', () => {
    const errors = getErrors(`
      type User { name: String, age: Int }
      u = User(name: 42, age: "old")
    `);
    expect(errors.some(e => e.message.includes("Type mismatch") && e.message.includes("name"))).toBe(true);
  });

  test('valid named construction produces no errors', () => {
    const errors = getErrors(`
      type User { name: String, age: Int }
      u = User(name: "Alice", age: 30)
    `);
    const relevant = errors.filter(e =>
      e.message.includes('Unknown field') ||
      e.message.includes('Duplicate') || e.message.includes('already provided')
    );
    expect(relevant.length).toBe(0);
  });

  test('valid reordered named construction produces no errors', () => {
    const errors = getErrors(`
      type User { name: String, age: Int }
      u = User(age: 30, name: "Alice")
    `);
    const relevant = errors.filter(e =>
      e.message.includes('Unknown field') ||
      e.message.includes('Duplicate') || e.message.includes('already provided')
    );
    expect(relevant.length).toBe(0);
  });

  test('struct constructor arg count with named args — too many', () => {
    const errors = getErrors(`
      type Pair { a: Int, b: Int }
      p = Pair(a: 1, b: 2, c: 3)
    `);
    expect(errors.length).toBeGreaterThan(0);
  });

  test('type mismatch on variant named arg', () => {
    expect(hasError(`
      type Shape {
        Circle(radius: Float)
      }
      c = Circle(radius: "big")
    `, "Type mismatch")).toBe(true);
  });

  test('type mismatch reports correct field name for each field', () => {
    const errors = getErrors(`
      type User { name: String, age: Int }
      u = User(name: 42, age: "old")
    `);
    expect(errors.some(e => e.message.includes("'name'") && e.message.includes("String"))).toBe(true);
    expect(errors.some(e => e.message.includes("'age'") && e.message.includes("Int"))).toBe(true);
  });

  test('positional overlap on non-first field', () => {
    expect(hasError(`
      type Triple { a: Int, b: Int, c: Int }
      t = Triple(1, 2, b: 99)
    `, "Field 'b' already provided positionally")).toBe(true);
  });

  test('mixed positional + named valid in analyzer', () => {
    const errors = getErrors(`
      type Triple { a: Int, b: Int, c: Int }
      t = Triple(1, c: 3, b: 2)
    `);
    const relevant = errors.filter(e =>
      e.message.includes('Unknown field') ||
      e.message.includes('Duplicate') || e.message.includes('already provided')
    );
    expect(relevant.length).toBe(0);
  });

  test('too few named args triggers arg count warning', () => {
    const result = analyze(`
      type Pair { a: Int, b: Int }
      p = Pair(a: 1)
    `);
    expect(result.warnings.some(w => w.message.includes("expects") && w.message.includes("argument"))).toBe(true);
  });

  test('named args on regular function produces no false positives', () => {
    const errors = getErrors(`
      fn greet(opts) { opts.name }
      greet(name: "Alice")
    `);
    const relevant = errors.filter(e =>
      e.message.includes('Unknown field') ||
      e.message.includes('Duplicate') || e.message.includes('already provided')
    );
    expect(relevant.length).toBe(0);
  });

  test('multiple unknown fields reported in single call', () => {
    const errors = getErrors(`
      type User { name: String, age: Int }
      u = User(foo: 1, bar: 2)
    `);
    const unknownFieldErrors = errors.filter(e => e.message.includes('Unknown field'));
    expect(unknownFieldErrors.length).toBe(2);
  });

  test('variant with valid reordered named args produces no errors', () => {
    const errors = getErrors(`
      type Shape {
        Rect(width: Int, height: Int)
      }
      r = Rect(height: 10, width: 5)
    `);
    const relevant = errors.filter(e =>
      e.message.includes('Unknown field') ||
      e.message.includes('Duplicate') || e.message.includes('already provided')
    );
    expect(relevant.length).toBe(0);
  });

  test('named args on variant too many args', () => {
    const errors = getErrors(`
      type Shape {
        Circle(radius: Int)
      }
      c = Circle(radius: 5, extra: 10)
    `);
    expect(errors.some(e => e.message.includes("Unknown field 'extra'"))).toBe(true);
  });
});

// ─── End-to-end: Named Type Construction ──────────────────────

describe('Named Type Construction — End-to-end', () => {
  test('struct named construction preserves field access', () => {
    const code = compileShared(`
      type User { name: String, age: Int }
      u = User(age: 25, name: "Bob")
      print(u.name)
      print(u.age)
    `);
    expect(code).toContain('User("Bob", 25)');
    expect(code).toContain('u.name');
    expect(code).toContain('u.age');
  });

  test('variant named construction works in match', () => {
    const code = compileShared(`
      type Shape {
        Circle(radius: Int)
        Rect(width: Int, height: Int)
      }
      s = Rect(height: 10, width: 5)
      result = match s {
        Circle(r) => r
        Rect(w, h) => w * h
      }
    `);
    expect(code).toContain('Rect(5, 10)');
  });

  test('named construction passed as function argument', () => {
    const code = compileShared(`
      type Point { x: Int, y: Int }
      fn manhattan(p) { p.x + p.y }
      d = manhattan(Point(y: 7, x: 3))
    `);
    expect(code).toContain('manhattan(Point(3, 7))');
  });

  test('named construction in array literal', () => {
    const code = compileShared(`
      type Point { x: Int, y: Int }
      points = [Point(y: 2, x: 1), Point(y: 4, x: 3)]
    `);
    expect(code).toContain('Point(1, 2)');
    expect(code).toContain('Point(3, 4)');
  });

  test('named construction in if expression', () => {
    const code = compileShared(`
      type Point { x: Int, y: Int }
      flag = true
      p = if flag { Point(y: 10, x: 5) } else { Point(x: 0, y: 0) }
    `);
    expect(code).toContain('Point(5, 10)');
    expect(code).toContain('Point(0, 0)');
  });

  test('named construction with computed values', () => {
    const code = compileShared(`
      type Pair { left: Int, right: Int }
      fn inc(n) { n + 1 }
      p = Pair(right: inc(9), left: inc(3))
    `);
    expect(code).toContain('Pair(inc(3), inc(9))');
  });
});
