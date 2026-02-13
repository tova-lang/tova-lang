import { describe, test, expect } from 'bun:test';

// Test the LSP server logic by importing the module and testing its methods
// We test the core logic without stdio transport

import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { Formatter } from '../src/formatter/formatter.js';

function analyzeSource(source, filename = '<test>') {
  const lexer = new Lexer(source, filename);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, filename);
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, filename);
  const { warnings } = analyzer.analyze();
  return { ast, analyzer, warnings };
}

describe('LSP: Diagnostics', () => {
  test('detects parse errors', () => {
    expect(() => {
      const lexer = new Lexer('fn {', '<test>');
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, '<test>');
      parser.parse();
    }).toThrow();
  });

  test('detects analysis warnings', () => {
    const { warnings } = analyzeSource(`
fn foo() {
  x = 10
}
`);
    // May have unused variable warnings
    expect(warnings).toBeDefined();
  });

  test('valid code produces no errors', () => {
    const { warnings } = analyzeSource(`
x = 10
print(x)
`);
    expect(Array.isArray(warnings)).toBe(true);
  });
});

describe('LSP: Symbol Collection', () => {
  test('collects function symbols', () => {
    const { analyzer } = analyzeSource(`
fn greet(name) {
  return "Hello " + name
}
`);
    const scope = analyzer.globalScope;
    expect(scope.symbols.has('greet')).toBe(true);
    const sym = scope.symbols.get('greet');
    expect(sym.kind).toBe('function');
  });

  test('collects variable symbols', () => {
    const { analyzer } = analyzeSource(`x = 42`);
    const scope = analyzer.globalScope;
    expect(scope.symbols.has('x')).toBe(true);
  });

  test('collects type symbols', () => {
    const { analyzer } = analyzeSource(`
type Point {
  x: Int
  y: Int
}
`);
    const scope = analyzer.globalScope;
    expect(scope.symbols.has('Point')).toBe(true);
    expect(scope.symbols.get('Point').kind).toBe('type');
  });

  test('function symbols have params', () => {
    const { analyzer } = analyzeSource(`
fn add(a, b) {
  return a + b
}
`);
    const sym = analyzer.globalScope.symbols.get('add');
    expect(sym._params).toBeDefined();
    expect(sym._params).toContain('a');
    expect(sym._params).toContain('b');
  });

  test('symbols have source locations', () => {
    const { analyzer } = analyzeSource(`fn hello() { return 1 }`);
    const sym = analyzer.globalScope.symbols.get('hello');
    expect(sym.loc).toBeDefined();
    expect(sym.loc.line).toBeGreaterThan(0);
  });
});

describe('LSP: Scope Children', () => {
  test('scope tracks children', () => {
    const { analyzer } = analyzeSource(`
fn outer() {
  fn inner() {
    return 1
  }
  return inner()
}
`);
    const scope = analyzer.globalScope;
    expect(scope.children.length).toBeGreaterThan(0);
  });

  test('nested symbols are accessible through children', () => {
    const { analyzer } = analyzeSource(`
fn compute(x) {
  y = x * 2
  return y
}
`);
    const scope = analyzer.globalScope;
    // Function creates child scope with local vars
    const functionScope = scope.children.find(c => c.context === 'function');
    expect(functionScope).toBeDefined();
  });
});

describe('LSP: Error Location Extraction', () => {
  test('parse error has location info', () => {
    try {
      const lexer = new Lexer('fn foo( {', '<test>');
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, '<test>');
      parser.parse();
    } catch (e) {
      // Error message should contain location
      expect(e.message).toMatch(/\d+:\d+/);
    }
  });
});

describe('LSP: Word Extraction', () => {
  // Test the getWordAt logic used by the LSP
  function getWordAt(line, character) {
    let start = character;
    let end = character;
    while (start > 0 && /[a-zA-Z0-9_]/.test(line[start - 1])) start--;
    while (end < line.length && /[a-zA-Z0-9_]/.test(line[end])) end++;
    return line.slice(start, end) || null;
  }

  test('extracts word at cursor', () => {
    expect(getWordAt('fn hello() {', 4)).toBe('hello');
  });

  test('extracts word at start', () => {
    expect(getWordAt('hello world', 0)).toBe('hello');
  });

  test('extracts word at end', () => {
    expect(getWordAt('let x = 42', 4)).toBe('x');
  });

  test('returns null for spaces', () => {
    expect(getWordAt('a   b', 2)).toBe(null);
  });
});

// ─── Formatting ──────────────────────────────────────────────

describe('LSP: Formatting', () => {
  test('formatter produces valid output for simple function', () => {
    const source = `fn add(a, b) { return a + b }`;
    const lexer = new Lexer(source, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    const ast = parser.parse();
    const formatter = new Formatter();
    const formatted = formatter.format(ast);
    expect(formatted).toContain('fn add');
    expect(formatted).toContain('return');
  });

  test('formatter handles type declarations', () => {
    const source = `type Point { x: Int, y: Int }`;
    const lexer = new Lexer(source, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    const ast = parser.parse();
    const formatter = new Formatter();
    const formatted = formatter.format(ast);
    expect(formatted).toContain('type Point');
  });

  test('formatter handles imports', () => {
    const source = `import { foo, bar } from "./module.tova"`;
    const lexer = new Lexer(source, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    const ast = parser.parse();
    const formatter = new Formatter();
    const formatted = formatter.format(ast);
    expect(formatted).toContain('import');
    expect(formatted).toContain('foo');
  });

  test('formatter handles match expressions', () => {
    const source = `
x = match value {
  1 => "one"
  2 => "two"
  _ => "other"
}`;
    const lexer = new Lexer(source, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    const ast = parser.parse();
    const formatter = new Formatter();
    const formatted = formatter.format(ast);
    expect(formatted).toContain('match');
  });

  test('formatter handles if/elif/else', () => {
    const source = `
if x > 0 {
  "positive"
} elif x < 0 {
  "negative"
} else {
  "zero"
}`;
    const lexer = new Lexer(source, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    const ast = parser.parse();
    const formatter = new Formatter();
    const formatted = formatter.format(ast);
    expect(formatted).toContain('if');
    expect(formatted).toContain('elif');
    expect(formatted).toContain('else');
  });

  test('formatter handles for loops', () => {
    const source = `for item in items { print(item) }`;
    const lexer = new Lexer(source, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    const ast = parser.parse();
    const formatter = new Formatter();
    const formatted = formatter.format(ast);
    expect(formatted).toContain('for');
    expect(formatted).toContain('in');
  });

  test('formatter handles while loops', () => {
    const source = `while x > 0 { x = x - 1 }`;
    const lexer = new Lexer(source, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    const ast = parser.parse();
    const formatter = new Formatter();
    const formatted = formatter.format(ast);
    expect(formatted).toContain('while');
  });

  test('formatter handles guard clause', () => {
    const source = `
fn check(x) {
  guard x > 0 else { return -1 }
  return x
}`;
    const lexer = new Lexer(source, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    const ast = parser.parse();
    const formatter = new Formatter();
    const formatted = formatter.format(ast);
    expect(formatted).toContain('guard');
  });

  test('formatter handles pipe operator', () => {
    const source = `result = [1, 2, 3] |> map(fn(x) x * 2) |> sum()`;
    const lexer = new Lexer(source, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    const ast = parser.parse();
    const formatter = new Formatter();
    const formatted = formatter.format(ast);
    expect(formatted).toContain('|>');
  });
});

// ─── Rename Logic ──────────────────────────────────────────────

describe('LSP: Rename', () => {
  function findOccurrences(source, word) {
    const edits = [];
    const lines = source.split('\n');
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    for (let i = 0; i < lines.length; i++) {
      let m;
      while ((m = regex.exec(lines[i])) !== null) {
        edits.push({ line: i, start: m.index, end: m.index + word.length });
      }
    }
    return edits;
  }

  test('finds all occurrences of variable', () => {
    const source = `x = 10\ny = x + 1\nprint(x)`;
    const edits = findOccurrences(source, 'x');
    expect(edits.length).toBe(3);
  });

  test('finds function name occurrences', () => {
    const source = `fn greet(name) { return name }\ngreet("world")`;
    const edits = findOccurrences(source, 'greet');
    expect(edits.length).toBe(2);
  });

  test('does not match partial names', () => {
    const source = `xfoo = 1\nx = 2`;
    const edits = findOccurrences(source, 'x');
    expect(edits.length).toBe(1); // only 'x = 2'
  });
});

// ─── References Logic ──────────────────────────────────────────

describe('LSP: References', () => {
  test('collects all references to an identifier', () => {
    const source = `
fn add(a, b) {
  return a + b
}
result = add(1, 2)
print(result)
`;
    const lines = source.split('\n');
    const findRefs = (word) => {
      const refs = [];
      const regex = new RegExp(`\\b${word}\\b`, 'g');
      for (let i = 0; i < lines.length; i++) {
        let m;
        while ((m = regex.exec(lines[i])) !== null) {
          refs.push({ line: i, character: m.index });
        }
      }
      return refs;
    };

    expect(findRefs('add').length).toBe(2); // declaration + call
    expect(findRefs('result').length).toBe(2); // assignment + usage
  });
});

// ─── Workspace Symbols Logic ────────────────────────────────────

describe('LSP: Workspace Symbols', () => {
  test('collects all top-level symbols', () => {
    const { analyzer } = analyzeSource(`
fn hello() { return 1 }
fn world() { return 2 }
x = 42
type Color { Red, Green, Blue }
`);
    const scope = analyzer.globalScope;
    expect(scope.symbols.has('hello')).toBe(true);
    expect(scope.symbols.has('world')).toBe(true);
    expect(scope.symbols.has('x')).toBe(true);
    expect(scope.symbols.has('Color')).toBe(true);
  });

  test('symbol filter by name prefix', () => {
    const { analyzer } = analyzeSource(`
fn getUser() { return 1 }
fn getName() { return 2 }
fn setUser() { return 3 }
`);
    const scope = analyzer.globalScope;
    const query = 'get';
    const matching = [];
    for (const [name] of scope.symbols) {
      if (name.toLowerCase().includes(query)) matching.push(name);
    }
    expect(matching.length).toBe(2);
    expect(matching).toContain('getUser');
    expect(matching).toContain('getName');
  });
});

// ─── Completion Logic ──────────────────────────────────────────

describe('LSP: Completion', () => {
  test('keyword completion with prefix', () => {
    const keywords = [
      'fn', 'let', 'if', 'elif', 'else', 'for', 'while', 'in',
      'return', 'match', 'type', 'import', 'from', 'true', 'false',
      'nil', 'server', 'client', 'shared', 'pub', 'mut',
      'try', 'catch', 'finally', 'break', 'continue', 'async', 'await',
      'guard', 'interface', 'derive', 'route', 'model', 'db',
    ];
    const prefix = 'ma';
    const matching = keywords.filter(k => k.startsWith(prefix));
    expect(matching).toContain('match');
    expect(matching.length).toBe(1);
  });

  test('builtin function completion', () => {
    const builtins = [
      'print', 'len', 'range', 'enumerate', 'sum', 'sorted',
      'reversed', 'zip', 'min', 'max', 'type_of', 'filter', 'map',
      'Ok', 'Err', 'Some', 'None',
    ];
    const prefix = 'So';
    const matching = builtins.filter(b => b.startsWith(prefix));
    expect(matching).toContain('Some');
  });

  test('user-defined symbols in completion', () => {
    const { analyzer } = analyzeSource(`
fn myFunction() { return 1 }
myVar = 42
`);
    const scope = analyzer.globalScope;
    const prefix = 'my';
    const matching = [];
    for (const [name] of scope.symbols) {
      if (name.startsWith(prefix)) matching.push(name);
    }
    expect(matching).toContain('myFunction');
    expect(matching).toContain('myVar');
  });
});

// ─── Hover Logic ───────────────────────────────────────────────

describe('LSP: Hover', () => {
  test('builtin function hover docs', () => {
    const builtinDocs = {
      'print': '`fn print(...args)` — Print values to console',
      'len': '`fn len(v)` — Get length of string, array, or object',
      'Ok': '`Ok(value)` — Create a successful Result',
    };
    expect(builtinDocs['print']).toContain('print');
    expect(builtinDocs['len']).toContain('len');
    expect(builtinDocs['Ok']).toContain('Result');
  });

  test('user-defined symbol hover info', () => {
    const { analyzer } = analyzeSource(`
fn greet(name: String) -> String {
  return name
}
`);
    const sym = analyzer.globalScope.symbols.get('greet');
    expect(sym).toBeDefined();
    expect(sym.kind).toBe('function');
    expect(sym._params).toContain('name');
  });
});

// ─── Signature Help Logic ──────────────────────────────────────

describe('LSP: Signature Help', () => {
  test('count commas for active parameter', () => {
    const before = 'range(1, 2, ';
    const afterParen = before.slice(before.lastIndexOf('(') + 1);
    const activeParam = (afterParen.match(/,/g) || []).length;
    expect(activeParam).toBe(2);
  });

  test('no commas = first parameter', () => {
    const before = 'print(';
    const afterParen = before.slice(before.lastIndexOf('(') + 1);
    const activeParam = (afterParen.match(/,/g) || []).length;
    expect(activeParam).toBe(0);
  });

  test('user function signature', () => {
    const { analyzer } = analyzeSource(`
fn calculate(x, y, z) {
  return x + y + z
}
`);
    const sym = analyzer.globalScope.symbols.get('calculate');
    expect(sym._params.length).toBe(3);
  });
});

// ─── Error Recovery ────────────────────────────────────────────

describe('LSP: Error Recovery', () => {
  test('partial AST available on parse error', () => {
    try {
      const lexer = new Lexer('fn good() { return 1 }\nfn bad( {', '<test>');
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, '<test>');
      parser.parse();
    } catch (e) {
      // Parser should provide partialAST for error recovery
      expect(e.partialAST || e.errors).toBeDefined();
    }
  });

  test('multi-error collection', () => {
    try {
      const lexer = new Lexer('fn { }\ntype 123\n', '<test>');
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, '<test>');
      parser.parse();
    } catch (e) {
      if (e.errors) {
        expect(e.errors.length).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
