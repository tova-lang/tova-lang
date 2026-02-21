import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { getFullStdlib, BUILTIN_FUNCTIONS, BUILTIN_NAMES } from '../src/stdlib/inline.js';
import { DocGenerator } from '../src/docs/generator.js';

// Note: new Function() usage here is safe — it only evaluates our own stdlib code
// and hardcoded test expressions, not any user input.

function parse(code) {
  const lexer = new Lexer(code, '<test>');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, '<test>');
  return parser.parse();
}

function compile(code) {
  const ast = parse(code);
  const codegen = new CodeGenerator(ast, '<test>');
  return codegen.generate();
}

function getWarnings(code) {
  const ast = parse(code);
  const analyzer = new Analyzer(ast, '<test>');
  const { warnings } = analyzer.analyze();
  return warnings;
}

// Helper to evaluate stdlib expressions safely (test-only, no user input)
function evalStdlib(expr) {
  const stdlib = getFullStdlib();
  // eslint-disable-next-line no-new-func
  return new Function(stdlib + '\nreturn (' + expr + ');')();
}

function evalStdlibStatements(stmts) {
  const stdlib = getFullStdlib();
  // eslint-disable-next-line no-new-func
  return new Function(stdlib + '\n' + stmts)();
}

// ── Batch 1: Stdlib Additions ──────────────────────────────────

describe('P3 Batch 1: Stdlib additions', () => {

  describe('race() async utility', () => {
    test('race is defined in BUILTIN_FUNCTIONS', () => {
      expect(BUILTIN_FUNCTIONS.race).toBeDefined();
      expect(BUILTIN_FUNCTIONS.race).toContain('Promise.race');
    });

    test('race is in BUILTIN_NAMES', () => {
      expect(BUILTIN_NAMES.has('race')).toBe(true);
    });
  });

  describe('Ordering type', () => {
    test('Less, Equal, Greater are defined', () => {
      expect(BUILTIN_FUNCTIONS.Less).toBeDefined();
      expect(BUILTIN_FUNCTIONS.Equal).toBeDefined();
      expect(BUILTIN_FUNCTIONS.Greater).toBeDefined();
    });

    test('compare function exists', () => {
      expect(BUILTIN_FUNCTIONS.compare).toBeDefined();
      expect(BUILTIN_FUNCTIONS.compare).toContain('Less');
      expect(BUILTIN_FUNCTIONS.compare).toContain('Greater');
      expect(BUILTIN_FUNCTIONS.compare).toContain('Equal');
    });

    test('compare_by function exists', () => {
      expect(BUILTIN_FUNCTIONS.compare_by).toBeDefined();
    });

    test('compare(1, 2) returns Less', () => {
      const result = evalStdlib('compare(1, 2)');
      expect(result.__tag).toBe('Less');
      expect(result.value).toBe(-1);
    });

    test('compare(5, 5) returns Equal', () => {
      const result = evalStdlib('compare(5, 5)');
      expect(result.__tag).toBe('Equal');
      expect(result.value).toBe(0);
    });

    test('compare(10, 3) returns Greater', () => {
      const result = evalStdlib('compare(10, 3)');
      expect(result.__tag).toBe('Greater');
      expect(result.value).toBe(1);
    });

    test('compare_by sorts using ordering function', () => {
      const result = evalStdlib('compare_by([3, 1, 2], function(a, b) { return compare(a, b); })');
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('RegexBuilder', () => {
    test('RegexBuilder class exists', () => {
      expect(BUILTIN_FUNCTIONS.RegexBuilder).toBeDefined();
      expect(BUILTIN_FUNCTIONS.regex_builder).toBeDefined();
    });

    test('builds regex with digits and literal', () => {
      const result = evalStdlib('regex_builder().digits(4).literal("-").digits(2).build().source');
      expect(result).toContain('\\d{4}');
    });

    test('regex test matches', () => {
      const result = evalStdlib('regex_builder().startOfLine().digits(3).endOfLine().test("123")');
      expect(result).toBe(true);
    });

    test('regex test rejects non-match', () => {
      const result = evalStdlib('regex_builder().startOfLine().digits(3).endOfLine().test("12a")');
      expect(result).toBe(false);
    });

    test('word and literal chain', () => {
      const result = evalStdlib('regex_builder().word().literal("@").word().build().test("user@host")');
      expect(result).toBe(true);
    });

    test('chainable methods return builder', () => {
      const result = evalStdlib('regex_builder().startOfLine().digits().literal(":").space().word().endOfLine().build() instanceof RegExp');
      expect(result).toBe(true);
    });
  });

  describe('Channel', () => {
    test('Channel class exists', () => {
      expect(BUILTIN_FUNCTIONS.Channel).toBeDefined();
    });

    test('buffered channel send/receive', async () => {
      const stdlib = getFullStdlib();
      const fn = new Function(stdlib + ';return (async function() { const ch = new Channel(2); await ch.send(1); await ch.send(2); const v1 = await ch.receive(); const v2 = await ch.receive(); return [v1.value, v2.value]; })')();
      const result = await fn();
      expect(result).toEqual([1, 2]);
    });

    test('channel close returns None', async () => {
      const stdlib = getFullStdlib();
      const fn = new Function(stdlib + ';return (async function() { const ch = new Channel(1); await ch.send(42); ch.close(); const v1 = await ch.receive(); const v2 = await ch.receive(); return [v1.__tag, v2.__tag]; })')();
      const result = await fn();
      expect(result).toEqual(['Some', 'None']);
    });
  });

  describe('Snapshot testing', () => {
    test('assert_snapshot is defined', () => {
      expect(BUILTIN_FUNCTIONS.assert_snapshot).toBeDefined();
    });

    test('assert_snapshot creates and matches snapshot', () => {
      expect(() => {
        evalStdlibStatements('assert_snapshot("hello world", "test1"); assert_snapshot("hello world", "test1");');
      }).not.toThrow();
    });
  });

  describe('Property-based testing', () => {
    test('Gen object is defined', () => {
      expect(BUILTIN_FUNCTIONS.Gen).toBeDefined();
    });

    test('forAll is defined', () => {
      expect(BUILTIN_FUNCTIONS.forAll).toBeDefined();
    });

    test('Gen.int generates integers in range', () => {
      const result = evalStdlib(
        '(function() { const g = Gen.int(0, 10); const vals = []; for (let i = 0; i < 100; i++) vals.push(g()); return vals.every(function(v) { return Number.isInteger(v) && v >= 0 && v <= 10; }); })()'
      );
      expect(result).toBe(true);
    });

    test('Gen.bool generates booleans', () => {
      const result = evalStdlib(
        '(function() { const g = Gen.bool(); const vals = []; for (let i = 0; i < 50; i++) vals.push(g()); return vals.every(function(v) { return typeof v === "boolean"; }); })()'
      );
      expect(result).toBe(true);
    });

    test('Gen.string generates strings', () => {
      const result = evalStdlib(
        '(function() { const g = Gen.string(10); const vals = []; for (let i = 0; i < 20; i++) vals.push(g()); return vals.every(function(v) { return typeof v === "string" && v.length <= 10; }); })()'
      );
      expect(result).toBe(true);
    });

    test('forAll passes for valid property', () => {
      expect(() => {
        evalStdlibStatements('forAll([Gen.int(0, 100), Gen.int(0, 100)], function(a, b) { return a + b >= 0; });');
      }).not.toThrow();
    });

    test('forAll fails for invalid property', () => {
      expect(() => {
        evalStdlibStatements('forAll([Gen.int(0, 10)], function(a) { return a > 100; });');
      }).toThrow();
    });

    test('Gen.oneOf picks from values', () => {
      const result = evalStdlib(
        '(function() { const g = Gen.oneOf(["a", "b", "c"]); const vals = []; for (let i = 0; i < 50; i++) vals.push(g()); return vals.every(function(v) { return ["a", "b", "c"].includes(v); }); })()'
      );
      expect(result).toBe(true);
    });

    test('Gen.array generates arrays', () => {
      const result = evalStdlib(
        '(function() { const g = Gen.array(Gen.int(0, 5), 5); const vals = []; for (let i = 0; i < 20; i++) vals.push(g()); return vals.every(function(v) { return Array.isArray(v) && v.length <= 5; }); })()'
      );
      expect(result).toBe(true);
    });
  });
});

// ── Batch 2: Testing Framework ─────────────────────────────────

describe('P3 Batch 2: Testing framework', () => {

  describe('bench blocks', () => {
    test('parser recognizes bench block', () => {
      const ast = parse('bench "sort" { fn sort_100() { sorted(range(100)) } }');
      const benchBlock = ast.body.find(n => n.type === 'BenchBlock');
      expect(benchBlock).toBeDefined();
      expect(benchBlock.name).toBe('sort');
      expect(benchBlock.body.length).toBeGreaterThan(0);
    });

    test('parser handles unnamed bench block', () => {
      const ast = parse('bench { fn basic() { 1 + 1 } }');
      const benchBlock = ast.body.find(n => n.type === 'BenchBlock');
      expect(benchBlock).toBeDefined();
      expect(benchBlock.name).toBeNull();
    });

    test('codegen produces bench output', () => {
      const result = compile('bench "math" { fn add_numbers() { 1 + 1 } }');
      expect(result.bench).toBeDefined();
      expect(result.bench).toContain('__runBench');
      expect(result.bench).toContain('add numbers');
    });

    test('bench output contains timing code', () => {
      const result = compile('bench "perf" { fn measure() { range(1000) } }');
      expect(result.bench).toContain('performance.now');
      expect(result.bench).toContain('mean');
      expect(result.bench).toContain('p50');
      expect(result.bench).toContain('p99');
    });

    test('analyzer accepts bench blocks without errors', () => {
      const warnings = getWarnings('bench "test" { fn my_bench() { sorted(range(100)) } }');
      expect(warnings.every(w => !w.message.includes('error'))).toBe(true);
    });

    test('bench and test blocks can coexist', () => {
      const result = compile('test "tests" { fn add() { assert(1 + 1 == 2) } }\nbench "perf" { fn fast() { 1 + 1 } }');
      expect(result.test).toBeDefined();
      expect(result.bench).toBeDefined();
    });
  });
});

// ── Batch 3: tova doc command ──────────────────────────────────

describe('P3 Batch 3: tova doc', () => {

  describe('docstring attachment', () => {
    test('docstrings attach to function declarations', () => {
      const code = '/// Add two numbers\n/// @param a First number\nfn add(a, b) { a + b }';
      const ast = parse(code);
      const fn = ast.body.find(n => n.type === 'FunctionDeclaration');
      expect(fn).toBeDefined();
      expect(fn.docstring).toBeDefined();
      expect(fn.docstring).toContain('Add two numbers');
      expect(fn.docstring).toContain('@param a First number');
    });

    test('docstrings attach to type declarations', () => {
      const code = '/// A color type\ntype Color {\n  Red\n  Green\n  Blue\n}';
      const ast = parse(code);
      const typ = ast.body.find(n => n.type === 'TypeDeclaration');
      expect(typ).toBeDefined();
      expect(typ.docstring).toContain('A color type');
    });

    test('multi-line docstrings are joined', () => {
      const code = '/// Line 1\n/// Line 2\n/// Line 3\nfn foo() { 1 }';
      const ast = parse(code);
      const fn = ast.body.find(n => n.type === 'FunctionDeclaration');
      expect(fn.docstring).toContain('Line 1');
      expect(fn.docstring).toContain('Line 2');
      expect(fn.docstring).toContain('Line 3');
    });

    test('non-docstring comments do not attach', () => {
      const code = '// Just a comment\nfn bar() { 2 }';
      const ast = parse(code);
      const fn = ast.body.find(n => n.type === 'FunctionDeclaration');
      expect(fn.docstring).toBeUndefined();
    });
  });

  describe('doc generator', () => {
    test('generates HTML docs from documented AST', () => {
      const code = '/// Add two numbers\n/// @param a First number\n/// @param b Second number\n/// @returns Sum of a and b\nfn add(a: Int, b: Int) -> Int { a + b }';
      const ast = parse(code);
      const gen = new DocGenerator([{ name: 'math', ast }]);
      const pages = gen.generate('html');

      expect(pages['index.html']).toBeDefined();
      expect(pages['index.html']).toContain('math');
      expect(pages['math.html']).toBeDefined();
      expect(pages['math.html']).toContain('add');
      expect(pages['math.html']).toContain('Add two numbers');
    });

    test('generates Markdown docs', () => {
      const code = '/// A utility function\nfn helper() { nil }';
      const ast = parse(code);
      const gen = new DocGenerator([{ name: 'utils', ast }]);
      const pages = gen.generate('markdown');

      expect(pages['index.md']).toBeDefined();
      expect(pages['utils.md']).toBeDefined();
      expect(pages['utils.md']).toContain('helper');
      expect(pages['utils.md']).toContain('A utility function');
    });

    test('handles @example tags', () => {
      const code = '/// Do something\n/// @example\n/// result = do_thing(42)\nfn do_thing(n) { n }';
      const ast = parse(code);
      const gen = new DocGenerator([{ name: 'mod', ast }]);
      const pages = gen.generate('html');

      expect(pages['mod.html']).toContain('Examples');
      expect(pages['mod.html']).toContain('do_thing(42)');
    });

    test('handles type declarations with variants', () => {
      const code = '/// A shape type\ntype Shape {\n  Circle(radius: Float)\n  Rectangle(width: Float, height: Float)\n}';
      const ast = parse(code);
      const gen = new DocGenerator([{ name: 'shapes', ast }]);
      const pages = gen.generate('html');

      expect(pages['shapes.html']).toContain('Shape');
      expect(pages['shapes.html']).toContain('Circle');
    });

    test('uses Catppuccin styling', () => {
      const code = '/// Docs\nfn x() { 1 }';
      const ast = parse(code);
      const gen = new DocGenerator([{ name: 'test', ast }]);
      const pages = gen.generate('html');

      expect(pages['test.html']).toContain('--ctp-mauve');
      expect(pages['test.html']).toContain('#1e1e2e');
    });
  });
});

// ── Batch 4: Package Registry ──────────────────────────────────

describe('P3 Batch 4: Package registry', () => {

  test('resolveConfig includes dependencies field', () => {
    const { resolveConfig } = require('../src/config/resolve.js');
    const config = resolveConfig('/nonexistent-dir');
    expect(config).toBeDefined();
    expect(config.dependencies).toBeDefined();
    expect(typeof config.dependencies).toBe('object');
  });

  test('edit-toml addToSection works', () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { addToSection, removeFromSection } = require('../src/config/edit-toml.js');

    const tmpFile = path.join(os.tmpdir(), 'test-tova-' + Date.now() + '.toml');
    fs.writeFileSync(tmpFile, '[project]\nname = "test"\n');

    addToSection(tmpFile, 'dependencies', 'my-lib', 'file:../lib');
    const content = fs.readFileSync(tmpFile, 'utf-8');
    expect(content).toContain('[dependencies]');
    expect(content).toContain('my-lib = "file:../lib"');

    // Cleanup
    fs.unlinkSync(tmpFile);
  });
});

// ── Batch 5: VS Code Extension ─────────────────────────────────

describe('P3 Batch 5: VS Code extension', () => {

  test('package.json has themes', () => {
    const pkg = require('../editors/vscode/package.json');
    const themes = pkg.contributes.themes;
    expect(themes).toBeDefined();
    expect(themes.length).toBeGreaterThan(0);
    expect(themes[0].label).toBe('Tova Dark');
  });

  test('package.json has debugger configuration', () => {
    const pkg = require('../editors/vscode/package.json');
    const debuggers = pkg.contributes.debuggers;
    expect(debuggers).toBeDefined();
    expect(debuggers.length).toBeGreaterThan(0);
    expect(debuggers[0].type).toBe('tova');
  });

  test('package.json has file icon', () => {
    const pkg = require('../editors/vscode/package.json');
    const lang = pkg.contributes.languages[0];
    expect(lang.icon).toBeDefined();
    expect(lang.icon.dark).toContain('tova-icon.svg');
  });

  test('theme file exists and is valid JSON', () => {
    const fs = require('fs');
    const path = require('path');
    const themePath = path.join(__dirname, '..', 'editors', 'vscode', 'themes', 'tova-dark-color-theme.json');
    expect(fs.existsSync(themePath)).toBe(true);
    const theme = JSON.parse(fs.readFileSync(themePath, 'utf-8'));
    expect(theme.name).toBe('Tova Dark');
    expect(theme.type).toBe('dark');
    expect(theme.tokenColors.length).toBeGreaterThan(0);
  });

  test('icon file exists', () => {
    const fs = require('fs');
    const path = require('path');
    const iconPath = path.join(__dirname, '..', 'editors', 'vscode', 'icons', 'tova-icon.svg');
    expect(fs.existsSync(iconPath)).toBe(true);
  });

  test('build script exists', () => {
    const fs = require('fs');
    const path = require('path');
    const buildPath = path.join(__dirname, '..', 'editors', 'vscode', 'build.js');
    expect(fs.existsSync(buildPath)).toBe(true);
  });

  test('README exists with feature list', () => {
    const fs = require('fs');
    const path = require('path');
    const readmePath = path.join(__dirname, '..', 'editors', 'vscode', 'README.md');
    expect(fs.existsSync(readmePath)).toBe(true);
    const content = fs.readFileSync(readmePath, 'utf-8');
    expect(content).toContain('Syntax Highlighting');
    expect(content).toContain('Language Server');
    expect(content).toContain('Debug Support');
  });
});

// ── Documentation ──────────────────────────────────────────────

describe('P3 Documentation', () => {

  test('deployment guide exists', () => {
    const fs = require('fs');
    const path = require('path');
    const docPath = path.join(__dirname, '..', 'docs', 'tooling', 'deployment.md');
    expect(fs.existsSync(docPath)).toBe(true);
    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toContain('Deployment Guide');
    expect(content).toContain('Docker');
    expect(content).toContain('Fly.io');
    expect(content).toContain('Vercel');
  });

  test('JS interop guide exists', () => {
    const fs = require('fs');
    const path = require('path');
    const docPath = path.join(__dirname, '..', 'docs', 'guide', 'js-interop.md');
    expect(fs.existsSync(docPath)).toBe(true);
    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toContain('JavaScript Interop');
    expect(content).toContain('npm');
    expect(content).toContain('extern');
    expect(content).toContain('FFI');
  });
});

// ── ROADMAP checks ─────────────────────────────────────────────

describe('P3 ROADMAP progress', () => {

  test('already-done items are checked off', () => {
    const fs = require('fs');
    const path = require('path');
    const roadmap = fs.readFileSync(path.join(__dirname, '..', 'ROADMAP.md'), 'utf-8');

    expect(roadmap).toContain('[x] **Opinionated formatter**');
    expect(roadmap).toContain('[x] **Async utilities**');
    expect(roadmap).toContain('[x] **Filesystem operations**');
    expect(roadmap).toContain('[x] **Playground: show generated JS**');
    expect(roadmap).toContain('[x] **Playground: "Tour of Tova"**');
  });

  test('progress tracker updated', () => {
    const fs = require('fs');
    const path = require('path');
    const roadmap = fs.readFileSync(path.join(__dirname, '..', 'ROADMAP.md'), 'utf-8');

    expect(roadmap).toContain('| P3       | 16    | 16   | 0         |');
  });
});
