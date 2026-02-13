import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

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

// ─── 1. Warnings (Lines 38-44) ──────────────────────────────────

describe('Analyzer warnings', () => {
  test('warnings array is empty for valid code', () => {
    const result = analyze('x = 1');
    expect(result.warnings).toEqual([]);
  });

  test('warnings array exists on result', () => {
    const result = analyze('x = 42\ny = x + 1');
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});

// ─── 2. DictComprehension (Line 167) ────────────────────────────

describe('DictComprehension analysis', () => {
  test('analyzes dict comprehension without error', () => {
    const result = analyze('pairs = [[1, 2]]\nx = {k: v for k, v in pairs}');
    expect(result.warnings).toEqual([]);
  });
});

// ─── 3. IfExpression (Lines 182-189) ────────────────────────────

describe('IfExpression analysis', () => {
  test('analyzes if/elif/else expression', () => {
    const result = analyze('x = if true { 1 } elif false { 2 } else { 3 }');
    expect(result.warnings).toEqual([]);
  });

  test('analyzes simple if/else expression', () => {
    const result = analyze('x = if true { 1 } else { 0 }');
    expect(result.warnings).toEqual([]);
  });
});

// ─── 4. Assignment error from define() (Line 240) ───────────────

describe('Assignment define error handling', () => {
  test('simple assignment succeeds', () => {
    const result = analyze('x = 1');
    expect(result).toBeDefined();
  });

  test('reassigning immutable variable throws', () => {
    // x = 1 defines x as immutable, x = 2 triggers the immutable error path (line 233)
    expect(analyzeThrows('x = 1\nx = 2')).toThrow(/Cannot reassign immutable variable/);
  });
});

// ─── 5. VarDeclaration (Line 256) ───────────────────────────────

describe('VarDeclaration analysis', () => {
  test('var declaration succeeds', () => {
    const result = analyze('var x = 1');
    expect(result).toBeDefined();
  });

  test('var declaration with multiple targets', () => {
    const result = analyze('var x = 1\nvar y = 2');
    expect(result).toBeDefined();
  });

  test('duplicate var declaration in same scope throws', () => {
    expect(analyzeThrows('var x = 1\nvar x = 2')).toThrow(/already defined/);
  });
});

// ─── 6. LetDestructure with ObjectPattern (Line 273) ────────────

describe('LetDestructure analysis', () => {
  test('object destructure succeeds', () => {
    const result = analyze('let { a, b } = obj');
    expect(result).toBeDefined();
  });

  test('duplicate names in object destructure throws', () => {
    expect(analyzeThrows('let { a, b } = obj\nlet { a } = obj2')).toThrow(/already defined/);
  });
});

// ─── 7. ArrayPattern (Line 283) ─────────────────────────────────

describe('ArrayPattern analysis', () => {
  test('array destructure succeeds', () => {
    const result = analyze('let [a, b] = pair');
    expect(result).toBeDefined();
  });

  test('duplicate names in array destructure throws', () => {
    expect(analyzeThrows('let [a, b] = pair\nlet [a] = other')).toThrow(/already defined/);
  });
});

// ─── 8. Function parameter (Line 295) ──────────────────────────

describe('FunctionDeclaration parameter analysis', () => {
  test('function with parameters succeeds', () => {
    const result = analyze('fn add(a, b) { a + b }');
    expect(result).toBeDefined();
  });

  test('duplicate function name throws', () => {
    expect(analyzeThrows('fn add(a, b) { a + b }\nfn add(c) { c }')).toThrow(/already defined/);
  });

  test('duplicate parameter name throws', () => {
    expect(analyzeThrows('fn bad(a, a) { a }')).toThrow(/already defined/);
  });
});

// ─── 9. Parameter default value (Line 306) ─────────────────────

describe('Parameter default value analysis', () => {
  test('function with default parameter succeeds', () => {
    const result = analyze('fn greet(name = "world") { name }');
    expect(result).toBeDefined();
  });

  test('function with typed default parameter succeeds', () => {
    const result = analyze('fn greet(name: String = "world") { name }');
    expect(result).toBeDefined();
  });
});

// ─── 10. TypeDeclaration (Line 322) ─────────────────────────────

describe('TypeDeclaration analysis', () => {
  test('simple type declaration succeeds', () => {
    const result = analyze('type User { name: String }');
    expect(result).toBeDefined();
  });

  test('duplicate type name throws', () => {
    expect(analyzeThrows('type User { name: String }\ntype User { age: Int }')).toThrow(/already defined/);
  });
});

// ─── 11. Variant constructor definition (Line 332) ──────────────

describe('Variant constructor analysis', () => {
  test('type with variant constructors defines them in scope', () => {
    const result = analyze('type Shape { Circle(r: Float), Rect(w: Float, h: Float) }');
    expect(result).toBeDefined();
    // Circle and Rect should be defined as functions in the global scope
    const circleSymbol = result.scope.lookup('Circle');
    expect(circleSymbol).not.toBeNull();
    expect(circleSymbol.kind).toBe('function');
    const rectSymbol = result.scope.lookup('Rect');
    expect(rectSymbol).not.toBeNull();
    expect(rectSymbol.kind).toBe('function');
  });

  test('duplicate variant constructor name throws', () => {
    expect(analyzeThrows('type A { Foo(x: Int) }\ntype B { Foo(y: Int) }')).toThrow(/already defined/);
  });
});

// ─── 12. Import specifier (Line 344) ────────────────────────────

describe('ImportDeclaration analysis', () => {
  test('named imports succeed', () => {
    const result = analyze('import { foo, bar } from "utils"');
    expect(result).toBeDefined();
  });

  test('duplicate import names throw', () => {
    expect(analyzeThrows('import { foo } from "a"\nimport { foo } from "b"')).toThrow(/already defined/);
  });
});

// ─── 13. Default import (Line 354) ──────────────────────────────

describe('ImportDefault analysis', () => {
  test('default import succeeds', () => {
    const result = analyze('import React from "react"');
    expect(result).toBeDefined();
    const sym = result.scope.lookup('React');
    expect(sym).not.toBeNull();
    expect(sym.kind).toBe('variable');
  });

  test('duplicate default import throws', () => {
    expect(analyzeThrows('import React from "react"\nimport React from "react2"')).toThrow(/already defined/);
  });
});

// ─── 14. Compound assignment on immutable variable (Line 394) ───

describe('CompoundAssignment analysis', () => {
  test('compound assignment on immutable variable throws', () => {
    expect(analyzeThrows('x = 5\nx += 1')).toThrow(/Cannot use '\+=' on immutable variable 'x'/);
  });

  test('compound assignment on mutable variable succeeds', () => {
    const result = analyze('var x = 5\nx += 1');
    expect(result).toBeDefined();
  });
});

// ─── 15. State declaration (Line 440) ───────────────────────────

describe('StateDeclaration analysis', () => {
  test('state inside client block succeeds', () => {
    const result = analyze('client { state count = 0 }');
    expect(result).toBeDefined();
  });

  test('state outside client block throws (at parse level for server)', () => {
    // state is only parsed as a special statement inside client blocks,
    // so putting it in a server block causes a parse error
    expect(() => analyze('server { state count = 0 }')).toThrow();
  });

  test('duplicate state name in client block throws', () => {
    expect(analyzeThrows('client { state count = 0\nstate count = 1 }')).toThrow(/already defined/);
  });
});

// ─── 16. Computed declaration (Line 454) ────────────────────────

describe('ComputedDeclaration analysis', () => {
  test('computed inside client block succeeds', () => {
    const result = analyze('client { state count = 0\ncomputed doubled = count * 2 }');
    expect(result).toBeDefined();
  });

  test('computed outside client block throws (at parse level for server)', () => {
    // computed is only parsed as a special statement inside client blocks,
    // so putting it in a server block causes a parse error
    expect(() => analyze('server { computed x = 1 }')).toThrow();
  });

  test('duplicate computed name throws', () => {
    expect(analyzeThrows('client { computed a = 1\ncomputed a = 2 }')).toThrow(/already defined/);
  });
});

// ─── 17. Component outside client (Line 476) ────────────────────

describe('ComponentDeclaration analysis', () => {
  test('component inside client block succeeds', () => {
    const result = analyze('client { component App { <div>"Hello"</div> } }');
    expect(result).toBeDefined();
  });

  test('component outside client block throws (at parse level for server)', () => {
    // component is only parsed as a special statement inside client blocks,
    // so putting it in a server block causes a parse error
    expect(() => analyze('server { component App { <div>"Hello"</div> } }')).toThrow();
  });

  test('duplicate component name throws', () => {
    expect(analyzeThrows('client { component App { <div>"a"</div> }\ncomponent App { <div>"b"</div> } }')).toThrow(/already defined/);
  });
});

// ─── 18. Component params (Lines 483-487) ───────────────────────

describe('Component params analysis', () => {
  test('component with params succeeds', () => {
    const result = analyze('client { component Card(title, body) { <div>"test"</div> } }');
    expect(result).toBeDefined();
  });

  test('component with typed params succeeds', () => {
    const result = analyze('client { component Card(title: String) { <div>"test"</div> } }');
    expect(result).toBeDefined();
  });

  test('duplicate component param throws', () => {
    expect(analyzeThrows('client { component Bad(x, x) { <div>"test"</div> } }')).toThrow(/already defined/);
  });
});

// ─── 19. Lambda parameter (Line 526) ────────────────────────────

describe('Lambda parameter analysis', () => {
  test('lambda with params succeeds', () => {
    const result = analyze('x = fn(a, b) a + b');
    expect(result).toBeDefined();
  });

  test('lambda with block body succeeds', () => {
    const result = analyze('x = fn(a, b) { a + b }');
    expect(result).toBeDefined();
  });

  test('lambda with duplicate params throws', () => {
    expect(analyzeThrows('x = fn(a, a) a')).toThrow(/already defined/);
  });
});

// ─── 20. Match arm with block body (Line 548) ──────────────────

describe('Match expression with block body', () => {
  test('match arm with block body succeeds', () => {
    const result = analyze('val = 1\nx = match val { 1 => { y = 2\ny }, _ => 0 }');
    expect(result).toBeDefined();
  });

  test('match arm with expression body succeeds', () => {
    const result = analyze('val = 1\nx = match val { 1 => 10, _ => 0 }');
    expect(result).toBeDefined();
  });
});

// ─── 21. Binding pattern in match (Line 568) ───────────────────

describe('Match binding pattern', () => {
  test('binding pattern succeeds', () => {
    const result = analyze('val = 1\nx = match val { n => n + 1 }');
    expect(result).toBeDefined();
  });
});

// ─── 22. Variant pattern field (Line 577) ──────────────────────

describe('Match variant pattern', () => {
  test('variant pattern with fields succeeds', () => {
    const result = analyze('type Shape { Circle(r: Float) }\nshape = Circle(5.0)\nx = match shape { Circle(r) => r, _ => 0 }');
    expect(result).toBeDefined();
  });

  test('variant pattern with multiple fields succeeds', () => {
    const result = analyze('type Shape { Rect(w: Float, h: Float) }\nshape = Rect(1.0, 2.0)\nx = match shape { Rect(w, h) => w * h, _ => 0 }');
    expect(result).toBeDefined();
  });
});

// ─── 23. List comprehension variable (Line 593) ────────────────

describe('List comprehension analysis', () => {
  test('list comprehension succeeds', () => {
    const result = analyze('items = [1, 2, 3]\nx = [n * 2 for n in items]');
    expect(result).toBeDefined();
  });

  test('list comprehension with condition succeeds', () => {
    const result = analyze('items = [1, 2, 3]\nx = [n * 2 for n in items if n > 1]');
    expect(result).toBeDefined();
  });
});

// ─── 24. Dict comprehension (Lines 602-618) ────────────────────

describe('Dict comprehension analysis (full)', () => {
  test('dict comprehension with two variables succeeds', () => {
    const result = analyze('pairs = []\nx = {k: v for k, v in pairs}');
    expect(result).toBeDefined();
  });

  test('dict comprehension with condition succeeds', () => {
    const result = analyze('pairs = []\nx = {k: v for k, v in pairs if k > 0}');
    expect(result).toBeDefined();
  });
});

// ─── 25. JSX element attribute and JSXIf (Lines 628, 630) ──────

describe('JSX element analysis', () => {
  test('JSX with attribute analyzes successfully', () => {
    const result = analyze('client { component App { <div class="main">"hello"</div> } }');
    expect(result).toBeDefined();
  });

  test('JSX with if condition analyzes successfully', () => {
    const result = analyze('client { component App { <div>if true { <span>"yes"</span> }</div> } }');
    expect(result).toBeDefined();
  });

  test('JSX with if/else condition analyzes successfully', () => {
    const result = analyze('client { component App { <div>if true { <span>"yes"</span> } else { <span>"no"</span> }</div> } }');
    expect(result).toBeDefined();
  });

  test('JSX with for loop analyzes successfully', () => {
    const result = analyze('client { component App { <ul>for item in items { <li>"item"</li> }</ul> } }');
    expect(result).toBeDefined();
  });

  test('JSX with expression child analyzes successfully', () => {
    const result = analyze('client { component App { <div>{name}</div> } }');
    expect(result).toBeDefined();
  });

  test('JSX with dynamic attribute analyzes successfully', () => {
    const result = analyze('client { component App { <div class={cls}>"hello"</div> } }');
    expect(result).toBeDefined();
  });
});

// ─── Additional coverage: edge cases ────────────────────────────

describe('Additional analyzer coverage', () => {
  test('server block analyzes successfully', () => {
    const result = analyze('server { x = 1 }');
    expect(result).toBeDefined();
  });

  test('shared block analyzes successfully', () => {
    const result = analyze('shared { x = 1 }');
    expect(result).toBeDefined();
  });

  test('if statement with elif and else', () => {
    const result = analyze('if true { x = 1 } elif false { x = 2 } else { x = 3 }');
    expect(result).toBeDefined();
  });

  test('for statement with multiple variables', () => {
    const result = analyze('items = []\nfor k, v in items { x = k }');
    expect(result).toBeDefined();
  });

  test('while statement', () => {
    const result = analyze('var x = 0\nwhile x < 10 { x += 1 }');
    expect(result).toBeDefined();
  });

  test('return statement', () => {
    const result = analyze('fn foo() { return 1 }');
    expect(result).toBeDefined();
  });

  test('return statement without value', () => {
    const result = analyze('fn foo() { return }');
    expect(result).toBeDefined();
  });

  test('template literal expression', () => {
    const result = analyze('name = "world"\nx = "hello {name}"');
    expect(result).toBeDefined();
  });

  test('binary expression', () => {
    const result = analyze('x = 1 + 2 * 3');
    expect(result).toBeDefined();
  });

  test('unary expression', () => {
    const result = analyze('x = -1');
    expect(result).toBeDefined();
  });

  test('logical expression', () => {
    const result = analyze('x = true and false or true');
    expect(result).toBeDefined();
  });

  test('chained comparison', () => {
    const result = analyze('a = 1\nb = 2\nc = 3\nx = 1 < 2 < 3');
    expect(result).toBeDefined();
  });

  test('membership expression', () => {
    const result = analyze('items = [1, 2, 3]\nx = 1 in items');
    expect(result).toBeDefined();
  });

  test('call expression', () => {
    const result = analyze('x = print("hello")');
    expect(result).toBeDefined();
  });

  test('call expression with named argument', () => {
    const result = analyze('fn foo(a, b) { a + b }\nx = foo(a: 1, b: 2)');
    expect(result).toBeDefined();
  });

  test('member expression', () => {
    const result = analyze('obj = {}\nx = obj.name');
    expect(result).toBeDefined();
  });

  test('optional chain expression', () => {
    const result = analyze('obj = {}\nx = obj?.name');
    expect(result).toBeDefined();
  });

  test('computed member expression', () => {
    const result = analyze('obj = {}\nkey = "name"\nx = obj[key]');
    expect(result).toBeDefined();
  });

  test('pipe expression', () => {
    const result = analyze('x = 1 |> print');
    expect(result).toBeDefined();
  });

  test('spread expression', () => {
    const result = analyze('a = [1, 2]\nb = [...a, 3]');
    expect(result).toBeDefined();
  });

  test('range expression', () => {
    const result = analyze('x = 1..10');
    expect(result).toBeDefined();
  });

  test('slice expression', () => {
    const result = analyze('a = [1, 2, 3]\nx = a[0:2]');
    expect(result).toBeDefined();
  });

  test('object literal expression', () => {
    const result = analyze('x = { "a": 1, "b": 2 }');
    expect(result).toBeDefined();
  });

  test('array literal expression', () => {
    const result = analyze('x = [1, 2, 3]');
    expect(result).toBeDefined();
  });

  test('nil literal', () => {
    const result = analyze('x = nil');
    expect(result).toBeDefined();
  });

  test('boolean literals', () => {
    const result = analyze('x = true\ny = false');
    expect(result).toBeDefined();
  });

  test('identifier wildcard is valid', () => {
    const result = analyze('x = _');
    expect(result).toBeDefined();
  });

  test('effect declaration in client block', () => {
    const result = analyze('client { effect { x = 1 } }');
    expect(result).toBeDefined();
  });

  test('effect outside client block throws (at parse level for server)', () => {
    // effect is only parsed as a special statement inside client blocks,
    // so putting it in a server block causes a parse error
    expect(() => analyze('server { effect { x = 1 } }')).toThrow();
  });

  test('route declaration in server block', () => {
    const result = analyze('server { fn handler() { "ok" }\nroute get "/api/test" => handler }');
    expect(result).toBeDefined();
  });

  test('route outside server block throws (at parse level for client)', () => {
    // route is only parsed as a special statement inside server blocks,
    // so putting it in a client block causes a parse error
    expect(() => analyze('client { route get "/test" => handler }')).toThrow();
  });

  test('block statement creates child scope', () => {
    const result = analyze('if true { x = 1 }');
    expect(result).toBeDefined();
  });

  test('for-else statement', () => {
    const result = analyze('items = []\nfor x in items { y = x } else { y = 0 }');
    expect(result).toBeDefined();
  });

  test('match with wildcard pattern', () => {
    const result = analyze('val = 1\nx = match val { _ => 0 }');
    expect(result).toBeDefined();
  });

  test('match with literal pattern', () => {
    const result = analyze('val = 1\nx = match val { 1 => "one", _ => "other" }');
    expect(result).toBeDefined();
  });

  test('match with guard', () => {
    const result = analyze('val = 5\nx = match val { n if n > 3 => "big", _ => "small" }');
    expect(result).toBeDefined();
  });

  test('multiple assignment', () => {
    const result = analyze('a, b = 1, 2');
    expect(result).toBeDefined();
  });

  test('expression statement', () => {
    const result = analyze('print("hello")');
    expect(result).toBeDefined();
  });

  test('nested JSX elements', () => {
    const result = analyze('client { component App { <div><span>"hello"</span></div> } }');
    expect(result).toBeDefined();
  });

  test('self-closing JSX element', () => {
    const result = analyze('client { component App { <div><br />"hello"</div> } }');
    expect(result).toBeDefined();
  });

  test('compound assignment on member expression does not throw', () => {
    const result = analyze('var obj = {}\nobj.count += 1');
    expect(result).toBeDefined();
  });
});
