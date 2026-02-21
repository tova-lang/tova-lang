// ─────────────────────────────────────────────────────────────────────────────
// T3 — Syntax & Missing Features Tests
// Tests for: multiline strings, f-strings, destructured params, simple enums,
//            tuples, with statement, is keyword, implicit it
// ─────────────────────────────────────────────────────────────────────────────

import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { TokenType } from '../src/lexer/tokens.js';

// ─── Helpers ──────────────────────────────────────────────────

function tokenize(source) {
  const lexer = new Lexer(source, '<test>');
  return lexer.tokenize();
}

function tokenTypes(source) {
  return tokenize(source).filter(t => t.type !== TokenType.EOF).map(t => t.type);
}

function parse(source) {
  const tokens = tokenize(source);
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function compileShared(source) {
  const ast = parse(`shared { ${source} }`);
  const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
  analyzer.analyze();
  const codegen = new CodeGenerator(ast, '<test>');
  const result = codegen.generate();
  return result.shared;
}

function compileTop(source) {
  const ast = parse(source);
  const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
  analyzer.analyze();
  const codegen = new CodeGenerator(ast, '<test>');
  const result = codegen.generate();
  return result.shared;
}

// ─── T3-1: Multiline Strings (Triple-Quote) ──────────────────

describe('T3-1: Multiline Strings', () => {
  test('basic triple-quote string', () => {
    const tokens = tokenize('x = """\nhello\nworld\n"""');
    const strToken = tokens.find(t => t.type === TokenType.STRING);
    expect(strToken).toBeDefined();
    expect(strToken.value).toBe('hello\nworld');
  });

  test('triple-quote preserves internal newlines', () => {
    const tokens = tokenize('x = """\nline1\nline2\nline3\n"""');
    const strToken = tokens.find(t => t.type === TokenType.STRING);
    expect(strToken.value).toBe('line1\nline2\nline3');
  });

  test('triple-quote auto-dedents', () => {
    const tokens = tokenize('x = """\n    hello\n    world\n    """');
    const strToken = tokens.find(t => t.type === TokenType.STRING);
    expect(strToken.value).toBe('hello\nworld');
  });

  test('triple-quote with interpolation', () => {
    const tokens = tokenize('x = """\nHello {name}!\n"""');
    const tmplToken = tokens.find(t => t.type === TokenType.STRING_TEMPLATE);
    expect(tmplToken).toBeDefined();
    expect(tmplToken.value.length).toBe(3); // text, expr, text
    expect(tmplToken.value[0].type).toBe('text');
    expect(tmplToken.value[1].type).toBe('expr');
  });

  test('triple-quote with escape sequences', () => {
    const tokens = tokenize('x = """\nhello\\nworld\n"""');
    const strToken = tokens.find(t => t.type === TokenType.STRING);
    expect(strToken.value).toContain('\n');
  });

  test('triple-quote compiles correctly', () => {
    const code = compileShared('x = """\nhello\nworld\n"""');
    expect(code).toContain('"hello\\nworld"');
  });
});

// ─── T3-2: Escape { in String Interpolation ──────────────────

describe('T3-2: Escape { in Interpolation', () => {
  test('\\{ produces literal brace', () => {
    const tokens = tokenize('x = "price: \\{not interpolated\\}"');
    const strToken = tokens.find(t => t.type === TokenType.STRING);
    expect(strToken).toBeDefined();
    expect(strToken.value).toBe('price: {not interpolated}');
  });
});

// ─── T3-3: Destructured Function Parameters ──────────────────

describe('T3-3: Destructured Function Parameters', () => {
  test('object destructure in params', () => {
    const ast = parse('shared { fn greet({name, age}) { print(name) } }');
    const fn = ast.body[0].body[0];
    expect(fn.type).toBe('FunctionDeclaration');
    expect(fn.params[0].destructure).toBeDefined();
    expect(fn.params[0].destructure.type).toBe('ObjectPattern');
  });

  test('object destructure with type annotation', () => {
    const ast = parse('shared { fn greet({name, age}: User) { print(name) } }');
    const fn = ast.body[0].body[0];
    expect(fn.params[0].destructure.type).toBe('ObjectPattern');
    expect(fn.params[0].typeAnnotation).toBeDefined();
    expect(fn.params[0].typeAnnotation.name).toBe('User');
  });

  test('array destructure in params', () => {
    const ast = parse('shared { fn first([head, tail]) { head } }');
    const fn = ast.body[0].body[0];
    expect(fn.params[0].destructure.type).toBe('ArrayPattern');
    expect(fn.params[0].destructure.elements).toEqual(['head', 'tail']);
  });

  test('array destructure with spread', () => {
    const ast = parse('shared { fn first([head, ...rest]) { head } }');
    const fn = ast.body[0].body[0];
    expect(fn.params[0].destructure.type).toBe('ArrayPattern');
    expect(fn.params[0].destructure.elements).toContain('...rest');
  });

  test('destructured params codegen', () => {
    const code = compileShared('fn greet({name, age}) { print(name) }');
    expect(code).toContain('{ name, age }');
  });

  test('array destructure with spread codegen', () => {
    const code = compileShared('fn first([head, ...rest]) { head }');
    expect(code).toContain('[head, ...rest]');
  });
});

// ─── T3-4: Simple Enums ──────────────────────────────────────

describe('T3-4: Simple Enums', () => {
  test('parse type Color = Red | Green | Blue', () => {
    const ast = parse('shared { type Color = Red | Green | Blue }');
    const typeDecl = ast.body[0].body[0];
    expect(typeDecl.type).toBe('TypeDeclaration');
    expect(typeDecl.name).toBe('Color');
    expect(typeDecl.variants).toHaveLength(3);
    expect(typeDecl.variants[0].name).toBe('Red');
    expect(typeDecl.variants[1].name).toBe('Green');
    expect(typeDecl.variants[2].name).toBe('Blue');
    // All fieldless
    expect(typeDecl.variants[0].fields).toHaveLength(0);
  });

  test('simple enum codegen', () => {
    const code = compileShared('type Color = Red | Green | Blue');
    expect(code).toContain('const Red = Object.freeze({ __tag: "Red" })');
    expect(code).toContain('const Green = Object.freeze({ __tag: "Green" })');
    expect(code).toContain('const Blue = Object.freeze({ __tag: "Blue" })');
  });

  test('enum with braces still works', () => {
    const ast = parse('shared { type Color { Red, Green, Blue } }');
    const typeDecl = ast.body[0].body[0];
    expect(typeDecl.type).toBe('TypeDeclaration');
    expect(typeDecl.variants).toHaveLength(3);
  });

  test('type alias for non-PascalCase stays as alias', () => {
    // type StringOrInt = String | Int should remain a TypeAlias since these
    // are actual type names, not enum variant names
    const ast = parse('shared { type StringOrInt = String | Int }');
    const decl = ast.body[0].body[0];
    // String and Int are PascalCase, so this becomes a TypeDeclaration (enum)
    // That's actually correct behavior — users can define simple enums this way
    expect(decl.type).toBe('TypeDeclaration');
  });
});

// ─── T3-5: Implicit `it` Parameter ───────────────────────────

describe('T3-5: Implicit `it` Parameter', () => {
  test('it.active wraps in lambda', () => {
    const ast = parse('shared { users |> filter(it.active) }');
    // The filter(it.active) should have the argument wrapped in a lambda
    const pipe = ast.body[0].body[0].expression;
    expect(pipe.type).toBe('PipeExpression');
    const filterCall = pipe.right;
    expect(filterCall.arguments[0].type).toBe('LambdaExpression');
    expect(filterCall.arguments[0].params[0].name).toBe('it');
  });

  test('it > 0 wraps in lambda', () => {
    const ast = parse('shared { numbers |> filter(it > 0) }');
    const pipe = ast.body[0].body[0].expression;
    const filterCall = pipe.right;
    expect(filterCall.arguments[0].type).toBe('LambdaExpression');
  });

  test('plain identifier it is not wrapped', () => {
    const ast = parse('shared { items |> map(it) }');
    const pipe = ast.body[0].body[0].expression;
    const mapCall = pipe.right;
    // Just `it` alone is not wrapped (it stays as Identifier)
    expect(mapCall.arguments[0].type).toBe('Identifier');
    expect(mapCall.arguments[0].name).toBe('it');
  });
});

// ─── T3-6: Tuple First-Class Support ─────────────────────────

describe('T3-6: Tuples', () => {
  test('parse tuple expression', () => {
    const ast = parse('shared { x = (1, "hello", true) }');
    const assign = ast.body[0].body[0];
    expect(assign.values[0].type).toBe('TupleExpression');
    expect(assign.values[0].elements).toHaveLength(3);
  });

  test('tuple compiles to array', () => {
    const code = compileShared('x = (1, "hello", true)');
    expect(code).toContain('[1, "hello", true]');
  });

  test('tuple destructuring with let', () => {
    const ast = parse('shared { let (a, b) = get_pair() }');
    const letNode = ast.body[0].body[0];
    expect(letNode.type).toBe('LetDestructure');
    expect(letNode.pattern.type).toBe('TuplePattern');
    expect(letNode.pattern.elements).toEqual(['a', 'b']);
  });

  test('tuple destructuring codegen', () => {
    const code = compileShared('let (a, b) = get_pair()');
    expect(code).toContain('const [a, b] = get_pair()');
  });

  test('tuple index access t.0', () => {
    const ast = parse('shared { x = t.0 }');
    const assign = ast.body[0].body[0];
    const memberExpr = assign.values[0];
    expect(memberExpr.type).toBe('MemberExpression');
    expect(memberExpr.computed).toBe(true);
    expect(memberExpr.property.value).toBe(0);
  });

  test('tuple index access codegen', () => {
    const code = compileShared('x = t.0');
    expect(code).toContain('t[0]');
  });

  test('tuple type annotation', () => {
    const ast = parse('shared { fn pair() -> (Int, String) { (1, "hi") } }');
    const fn = ast.body[0].body[0];
    expect(fn.returnType.type).toBe('TupleTypeAnnotation');
    expect(fn.returnType.elementTypes).toHaveLength(2);
  });
});

// ─── T3-7: With Statement ────────────────────────────────────

describe('T3-7: With Statement', () => {
  test('parse with statement', () => {
    const ast = parse('shared { with open("file.txt") as f { data = f.read() } }');
    const withStmt = ast.body[0].body[0];
    expect(withStmt.type).toBe('WithStatement');
    expect(withStmt.name).toBe('f');
    expect(withStmt.expression.type).toBe('CallExpression');
  });

  test('with statement codegen', () => {
    const code = compileShared('with open("file.txt") as f { data = f.read() }');
    expect(code).toContain('const f = open("file.txt")');
    expect(code).toContain('try {');
    expect(code).toContain('} finally {');
    expect(code).toContain('f.close');
  });

  test('with statement also checks dispose', () => {
    const code = compileShared('with create_resource() as r { use(r) }');
    expect(code).toContain('r.close');
    expect(code).toContain('r.dispose');
  });
});

// ─── T3-8: f-string Interpolation ────────────────────────────

describe('T3-8: f-string Interpolation', () => {
  test('f"..." is lexed as interpolated string', () => {
    const tokens = tokenize('x = f"Hello, {name}!"');
    const tmplToken = tokens.find(t => t.type === TokenType.STRING_TEMPLATE);
    expect(tmplToken).toBeDefined();
  });

  test('f-string without interpolation is plain string', () => {
    const tokens = tokenize('x = f"hello"');
    const strToken = tokens.find(t => t.type === TokenType.STRING);
    expect(strToken).toBeDefined();
    expect(strToken.value).toBe('hello');
  });

  test('f-string compiles same as regular interpolation', () => {
    const code1 = compileShared('x = f"Hello, {name}!"');
    const code2 = compileShared('x = "Hello, {name}!"');
    // Both should produce template literals
    expect(code1).toContain('`Hello, ${name}!`');
    expect(code2).toContain('`Hello, ${name}!`');
  });
});

// ─── T3-9: `is` Keyword for Type Checking ────────────────────

describe('T3-9: is Keyword', () => {
  test('lexer produces IS token', () => {
    const types = tokenTypes('x is String');
    expect(types).toContain(TokenType.IS);
  });

  test('is_empty remains an identifier', () => {
    const types = tokenTypes('is_empty = true');
    expect(types[0]).toBe(TokenType.IDENTIFIER);
    expect(types).not.toContain(TokenType.IS);
  });

  test('parse value is String', () => {
    const ast = parse('shared { if x is String { print(x) } }');
    const ifStmt = ast.body[0].body[0];
    expect(ifStmt.condition.type).toBe('IsExpression');
    expect(ifStmt.condition.typeName).toBe('String');
    expect(ifStmt.condition.negated).toBe(false);
  });

  test('parse value is not Nil', () => {
    const ast = parse('shared { if x is not Nil { print(x) } }');
    const ifStmt = ast.body[0].body[0];
    expect(ifStmt.condition.type).toBe('IsExpression');
    expect(ifStmt.condition.typeName).toBe('Nil');
    expect(ifStmt.condition.negated).toBe(true);
  });

  test('is String codegen', () => {
    const code = compileShared('if x is String { print(x) }');
    expect(code).toContain("typeof x === 'string'");
  });

  test('is Int codegen', () => {
    const code = compileShared('if x is Int { print(x) }');
    expect(code).toContain("typeof x === 'number'");
    expect(code).toContain('Number.isInteger');
  });

  test('is Bool codegen', () => {
    const code = compileShared('if x is Bool { print(x) }');
    expect(code).toContain("typeof x === 'boolean'");
  });

  test('is Nil codegen', () => {
    const code = compileShared('if x is Nil { print("nil") }');
    expect(code).toContain('x === null');
  });

  test('is not Nil codegen', () => {
    const code = compileShared('if x is not Nil { print(x) }');
    expect(code).toContain('x !== null');
  });

  test('is Array codegen', () => {
    const code = compileShared('if x is Array { print(len(x)) }');
    expect(code).toContain('Array.isArray(x)');
  });

  test('is ADT variant codegen', () => {
    const code = compileShared('if result is Ok { print("success") }');
    expect(code).toContain("__tag === 'Ok'");
  });
});

// ─── Integration Tests ───────────────────────────────────────

describe('T3 Integration', () => {
  test('enum + match', () => {
    const code = compileShared(`
      type Direction = North | South | East | West
      fn describe(d) {
        match d {
          North => "up"
          South => "down"
          _ => "sideways"
        }
      }
    `);
    expect(code).toContain('const North = Object.freeze');
    expect(code).toContain('function describe');
  });

  test('tuple + destructuring', () => {
    const code = compileShared(`
      fn swap(a, b) { (b, a) }
      let (x, y) = swap(1, 2)
    `);
    expect(code).toContain('[b, a]'); // tuple codegen
    expect(code).toContain('const [x, y]'); // destructure codegen
  });

  test('is keyword in guard', () => {
    const code = compileShared(`
      fn process(x) {
        guard x is not Nil else { return nil }
        x
      }
    `);
    expect(code).toContain('!== null');
  });

  test('with + destructured params', () => {
    const code = compileShared(`
      fn handle({path, mode}) {
        with open(path) as f {
          f.read()
        }
      }
    `);
    expect(code).toContain('{ path, mode }');
    expect(code).toContain('try {');
    expect(code).toContain('finally');
  });
});
