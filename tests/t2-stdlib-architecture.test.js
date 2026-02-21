import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { BaseCodegen } from '../src/codegen/base-codegen.js';
import { buildSelectiveStdlib, BUILTIN_NAMES } from '../src/stdlib/inline.js';
import '../src/runtime/array-proto.js';

function analyze(source) {
  const lexer = new Lexer(source, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, '<test>');
  return analyzer.analyze();
}

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

function generateWithBaseCodegen(source) {
  const ast = (() => {
    const lexer = new Lexer(source, '<test>');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, '<test>');
    return parser.parse();
  })();
  const gen = new BaseCodegen();
  const code = ast.body.map(stmt => gen.generateStatement(stmt)).join('\n');
  return { code, gen };
}

// Evaluate inline stdlib code safely for testing
function evalStdlib(names, code) {
  const stdlib = buildSelectiveStdlib(names);
  // eslint-disable-next-line no-new-func -- intentional: testing inline stdlib evaluation
  return (new Function(stdlib + '\n' + code))();
}

// ─── T2-2: Name Collision Fix ─────────────────────────────────

describe('T2-2: Name Collision Fix', () => {
  test('defining filter = "active" produces no shadowing warning', () => {
    const result = analyze('shared {\n  filter = "active"\n  print(filter)\n}');
    const shadowWarnings = result.warnings.filter(w =>
      w.message.includes('shadows') && w.message.includes('filter')
    );
    expect(shadowWarnings.length).toBe(0);
  });

  test('defining map = {} produces no shadowing warning', () => {
    const result = analyze('shared {\n  map = {}\n  print(map)\n}');
    const shadowWarnings = result.warnings.filter(w =>
      w.message.includes('shadows') && w.message.includes('map')
    );
    expect(shadowWarnings.length).toBe(0);
  });

  test('user variable named "find" works without warning', () => {
    const result = analyze('shared {\n  find = "search"\n  print(find)\n}');
    const shadowWarnings = result.warnings.filter(w =>
      w.message.includes('shadows') && w.message.includes('find')
    );
    expect(shadowWarnings.length).toBe(0);
  });

  test('builtin filter still callable as function', () => {
    const code = compileShared('shared { result = filter([1,2,3], fn(x) x > 1)\n print(result) }');
    expect(code).toContain('filter');
  });
});

// ─── T2-4: Array Method Syntax ─────────────────────────────────

describe('T2-4: Array Method Syntax', () => {
  test('[3,1,2].sorted() returns sorted array', () => {
    expect([3, 1, 2].sorted()).toEqual([1, 2, 3]);
  });

  test('[1,2,3].reversed() returns reversed array', () => {
    expect([1, 2, 3].reversed()).toEqual([3, 2, 1]);
  });

  test('[1,2,3].first() returns first element', () => {
    expect([1, 2, 3].first()).toBe(1);
  });

  test('[].first() returns null', () => {
    expect([].first()).toBe(null);
  });

  test('[1,2,3].last() returns last element', () => {
    expect([1, 2, 3].last()).toBe(3);
  });

  test('[].last() returns null', () => {
    expect([].last()).toBe(null);
  });

  test('[1,2,2,3].unique() removes duplicates', () => {
    expect([1, 2, 2, 3].unique()).toEqual([1, 2, 3]);
  });

  test('[1,2,3,4,5].chunk(2) groups into pairs', () => {
    expect([1, 2, 3, 4, 5].chunk(2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  test('[[1,2],[3,4]].flatten() flattens one level', () => {
    expect([[1, 2], [3, 4]].flatten()).toEqual([1, 2, 3, 4]);
  });

  test('[1,2,3,4,5].take(3) returns first 3', () => {
    expect([1, 2, 3, 4, 5].take(3)).toEqual([1, 2, 3]);
  });

  test('[1,2,3,4,5].drop(2) skips first 2', () => {
    expect([1, 2, 3, 4, 5].drop(2)).toEqual([3, 4, 5]);
  });

  test('[1, null, 2, undefined, 3].compact() removes nullish', () => {
    expect([1, null, 2, undefined, 3].compact()).toEqual([1, 2, 3]);
  });

  test('[1,2,3].sum() returns sum', () => {
    expect([1, 2, 3].sum()).toBe(6);
  });

  test('[3,1,4,1,5].min_val() returns minimum', () => {
    expect([3, 1, 4, 1, 5].min_val()).toBe(1);
  });

  test('[3,1,4,1,5].max_val() returns maximum', () => {
    expect([3, 1, 4, 1, 5].max_val()).toBe(5);
  });

  test('[].min_val() returns null', () => {
    expect([].min_val()).toBe(null);
  });

  test('[1,2,3].group_by(fn) groups correctly', () => {
    const result = [1, 2, 3, 4].group_by(x => x % 2 === 0 ? 'even' : 'odd');
    expect(result.even).toEqual([2, 4]);
    expect(result.odd).toEqual([1, 3]);
  });

  test('[1,2,3].partition(fn) splits into two', () => {
    const [even, odd] = [1, 2, 3, 4].partition(x => x % 2 === 0);
    expect(even).toEqual([2, 4]);
    expect(odd).toEqual([1, 3]);
  });

  test('[1,2,3].zip_with([4,5,6]) zips arrays', () => {
    expect([1, 2, 3].zip_with([4, 5, 6])).toEqual([[1, 4], [2, 5], [3, 6]]);
  });

  test('["a","b","a","c","a"].frequencies() counts occurrences', () => {
    expect(["a", "b", "a", "c", "a"].frequencies()).toEqual({ a: 3, b: 1, c: 1 });
  });

  test('sorted with key function', () => {
    const items = [{ name: 'c' }, { name: 'a' }, { name: 'b' }];
    const result = items.sorted(x => x.name);
    expect(result.map(x => x.name)).toEqual(['a', 'b', 'c']);
  });
});

// ─── T2-1: Namespace Module System ─────────────────────────────

describe('T2-1: Namespace Module System', () => {
  test('BUILTIN_NAMES includes namespace names', () => {
    expect(BUILTIN_NAMES.has('math')).toBe(true);
    expect(BUILTIN_NAMES.has('str')).toBe(true);
    expect(BUILTIN_NAMES.has('arr')).toBe(true);
    expect(BUILTIN_NAMES.has('dt')).toBe(true);
    expect(BUILTIN_NAMES.has('re')).toBe(true);
    expect(BUILTIN_NAMES.has('json')).toBe(true);
    expect(BUILTIN_NAMES.has('fs')).toBe(true);
    expect(BUILTIN_NAMES.has('url')).toBe(true);
  });

  test('math.sin(0) generates valid code including math namespace', () => {
    const code = compileShared('shared { x = math.sin(0)\n print(x) }');
    expect(code).toContain('math.sin');
  });

  test('math namespace includes Object.freeze in stdlib', () => {
    const stdlib = buildSelectiveStdlib(new Set(['math']));
    expect(stdlib).toContain('const math = Object.freeze');
    expect(stdlib).toContain('sin(n)');
    expect(stdlib).toContain('cos(n)');
  });

  test('math.PI accessible as property', () => {
    const stdlib = buildSelectiveStdlib(new Set(['math']));
    expect(stdlib).toContain('PI: Math.PI');
  });

  test('both sin(x) and math.sin(x) can coexist', () => {
    const code = compileShared('shared { a = sin(0.5)\n b = math.sin(0.5)\n print(a)\n print(b) }');
    expect(code).toContain('sin(0.5)');
    expect(code).toContain('math.sin(0.5)');
  });

  test('tree-shaking: math.sin(x) includes math but not str', () => {
    const { gen } = generateWithBaseCodegen('x = math.sin(0)');
    expect(gen._usedBuiltins.has('math')).toBe(true);
    expect(gen._usedBuiltins.has('str')).toBe(false);
  });

  test('tree-shaking: str.upper() includes str but not math', () => {
    const { gen } = generateWithBaseCodegen('x = str.upper("hello")');
    expect(gen._usedBuiltins.has('str')).toBe(true);
    expect(gen._usedBuiltins.has('math')).toBe(false);
  });

  test('str namespace in selective stdlib', () => {
    const stdlib = buildSelectiveStdlib(new Set(['str']));
    expect(stdlib).toContain('const str = Object.freeze');
    expect(stdlib).toContain('upper(s)');
  });

  test('arr namespace in selective stdlib', () => {
    const stdlib = buildSelectiveStdlib(new Set(['arr']));
    expect(stdlib).toContain('const arr = Object.freeze');
    expect(stdlib).toContain('sorted(a');
  });

  test('json namespace in selective stdlib', () => {
    const stdlib = buildSelectiveStdlib(new Set(['json']));
    expect(stdlib).toContain('const json = Object.freeze');
    expect(stdlib).toContain('parse(s)');
    expect(stdlib).toContain('stringify(v)');
    expect(stdlib).toContain('pretty(v)');
  });

  test('namespace property access tracked (math.PI)', () => {
    const { gen } = generateWithBaseCodegen('x = math.PI');
    expect(gen._usedBuiltins.has('math')).toBe(true);
  });

  test('analyzer accepts namespace usage without error', () => {
    // analyze() throws on errors, so no throw = no errors
    const result = analyze('shared { x = math.sin(0)\n print(x) }');
    expect(result.warnings).toBeDefined();
  });
});

// ─── T2-5: Collections Module ─────────────────────────────────

describe('T2-5: Collections Module', () => {
  test('BUILTIN_NAMES includes collection types', () => {
    expect(BUILTIN_NAMES.has('OrderedDict')).toBe(true);
    expect(BUILTIN_NAMES.has('DefaultDict')).toBe(true);
    expect(BUILTIN_NAMES.has('Counter')).toBe(true);
    expect(BUILTIN_NAMES.has('Deque')).toBe(true);
    expect(BUILTIN_NAMES.has('collections')).toBe(true);
  });

  test('Counter inline code works correctly', () => {
    const result = evalStdlib(new Set(['Counter']), 'return new Counter(["a","b","a"]).count("a");');
    expect(result).toBe(2);
  });

  test('Counter.most_common() works', () => {
    const result = evalStdlib(new Set(['Counter']), 'return new Counter(["a","b","a","c","a"]).most_common(2);');
    expect(result[0][0]).toBe('a');
    expect(result[0][1]).toBe(3);
    expect(result.length).toBe(2);
  });

  test('Counter.total() works', () => {
    const result = evalStdlib(new Set(['Counter']), 'return new Counter(["a","b","a"]).total();');
    expect(result).toBe(3);
  });

  test('DefaultDict inline code works correctly', () => {
    const stdlib = buildSelectiveStdlib(new Set(['DefaultDict']));
    expect(stdlib).toContain('class DefaultDict');
    const result = evalStdlib(new Set(['DefaultDict']), 'const d = new DefaultDict(() => 0);\nreturn d.get("missing");');
    expect(result).toBe(0);
  });

  test('DefaultDict mutates in place', () => {
    const result = evalStdlib(new Set(['DefaultDict']),
      'const d = new DefaultDict(() => []);\nd.get("key").push(1);\nd.get("key").push(2);\nreturn d.get("key");'
    );
    expect(result).toEqual([1, 2]);
  });

  test('OrderedDict inline code works correctly', () => {
    const stdlib = buildSelectiveStdlib(new Set(['OrderedDict']));
    expect(stdlib).toContain('class OrderedDict');
    const result = evalStdlib(new Set(['OrderedDict']),
      'const d = new OrderedDict([["a", 1], ["b", 2]]);\nreturn [d.get("a"), d.get("b"), d.has("c"), d.length];'
    );
    expect(result).toEqual([1, 2, false, 2]);
  });

  test('OrderedDict.set returns new instance (immutable)', () => {
    const result = evalStdlib(new Set(['OrderedDict']),
      'const d1 = new OrderedDict([["a", 1]]);\nconst d2 = d1.set("b", 2);\nreturn [d1.length, d2.length, d2.get("b")];'
    );
    expect(result).toEqual([1, 2, 2]);
  });

  test('Deque inline code works correctly', () => {
    const stdlib = buildSelectiveStdlib(new Set(['Deque']));
    expect(stdlib).toContain('class Deque');
    const result = evalStdlib(new Set(['Deque']), 'return new Deque([1,2,3]).peek_front();');
    expect(result).toBe(1);
  });

  test('Deque.peek_back works', () => {
    const result = evalStdlib(new Set(['Deque']), 'return new Deque([1,2,3]).peek_back();');
    expect(result).toBe(3);
  });

  test('Deque.push_back returns new Deque', () => {
    const result = evalStdlib(new Set(['Deque']),
      'const d1 = new Deque([1, 2]);\nconst d2 = d1.push_back(3);\nreturn [d1.length, d2.length, d2.peek_back()];'
    );
    expect(result).toEqual([2, 3, 3]);
  });

  test('collections namespace includes all data structures', () => {
    const stdlib = buildSelectiveStdlib(new Set(['OrderedDict', 'DefaultDict', 'Counter', 'Deque', 'collections']));
    expect(stdlib).toContain('const collections = Object.freeze');
    expect(stdlib).toContain('OrderedDict');
    expect(stdlib).toContain('DefaultDict');
    expect(stdlib).toContain('Counter');
    expect(stdlib).toContain('Deque');
  });

  test('dependency ordering: classes before collections namespace', () => {
    const stdlib = buildSelectiveStdlib(new Set(['collections', 'Counter', 'Deque', 'OrderedDict', 'DefaultDict']));
    const counterIdx = stdlib.indexOf('class Counter');
    const collectionsIdx = stdlib.indexOf('const collections = Object.freeze');
    expect(counterIdx).toBeLessThan(collectionsIdx);
  });

  test('codegen tracks collections namespace usage', () => {
    const { gen } = generateWithBaseCodegen('x = collections.Counter');
    expect(gen._usedBuiltins.has('collections')).toBe(true);
    expect(gen._usedBuiltins.has('Counter')).toBe(true);
    expect(gen._usedBuiltins.has('OrderedDict')).toBe(true);
  });
});

// ─── T2-3: Stdlib Sync Mechanism ─────────────────────────────────

describe('T2-3: Stdlib Sync Mechanism', () => {
  test('sync script exists', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const scriptPath = path.resolve(import.meta.dir, '..', 'scripts', 'sync-stdlib.js');
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  test('package.json has sync-stdlib script', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const pkgPath = path.resolve(import.meta.dir, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.scripts['sync-stdlib']).toBeDefined();
    expect(pkg.scripts['sync-stdlib:check']).toBeDefined();
  });
});
