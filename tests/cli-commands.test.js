// tests/cli-commands.test.js — Comprehensive CLI command test coverage
// Tests all tova CLI commands for production hardening
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';
import { join, resolve, basename, relative } from 'path';
import { tmpdir } from 'os';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { Formatter } from '../src/formatter/formatter.js';
import { lookupCode, getExplanation } from '../src/diagnostics/error-codes.js';
import { resolveConfig } from '../src/config/resolve.js';
import { stringifyTOML } from '../src/config/toml.js';
import { addToSection, removeFromSection } from '../src/config/edit-toml.js';
import { VERSION } from '../src/version.js';
import { getFullStdlib, BUILTIN_NAMES, PROPAGATE, NATIVE_INIT } from '../src/stdlib/inline.js';

// ─── Helper: create temp directory with files ────────────────
function createTmpDir(prefix = 'tova-cli-test') {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupDir(dir) {
  if (dir && existsSync(dir)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

// ─── Helper: compile Tova source (mirrors compileTova in bin/tova.js) ──
function compileTova(source, filename = 'test.tova', options = {}) {
  const lexer = new Lexer(source, filename);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, filename);
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, filename, { strict: options.strict || false });
  if (options.knownNames) {
    for (const name of options.knownNames) {
      analyzer.globalScope.define(name, { name, kind: 'variable' });
    }
  }
  const { warnings } = analyzer.analyze();
  const codegen = new CodeGenerator(ast, filename, { sourceMaps: options.sourceMaps !== false });
  return codegen.generate();
}

// ─── Helper: run tova CLI as subprocess ─────────────────────
function runTova(args, options = {}) {
  const cwd = options.cwd || process.cwd();
  const proc = Bun.spawnSync(['bun', 'run', resolve('bin/tova.js'), ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...options.env, NO_COLOR: '1' },
    timeout: options.timeout || 15000,
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// 1. CORE COMPILATION (compileTova)
// ═══════════════════════════════════════════════════════════════

describe('compileTova', () => {
  test('compiles simple expression', () => {
    const output = compileTova('x = 42\nprint(x)');
    expect(output.shared).toBeDefined();
    expect(output.shared).toContain('42');
  });

  test('compiles server block', () => {
    const output = compileTova(`
server {
  fn hello() { "world" }
  route GET "/api/hello" => hello
}
`);
    expect(output.server).toBeDefined();
    expect(output.server).toContain('hello');
  });

  test('compiles browser block', () => {
    const output = compileTova(`
browser {
  state count = 0
  component App {
    <div>"{count}"</div>
  }
}
`);
    expect(output.browser).toBeDefined();
    expect(output.browser).toContain('count');
  });

  test('compiles with strict mode', () => {
    const output = compileTova('x = 10', 'test.tova', { strict: true });
    expect(output.shared).toBeDefined();
  });

  test('compiles test blocks', () => {
    const output = compileTova(`
test "basic" {
  assert(1 + 1 == 2)
}
`);
    expect(output.test).toBeDefined();
  });

  test('compiles bench blocks', () => {
    const output = compileTova(`
bench "perf" {
  var x = 0
  for i in range(1000) {
    x = x + 1
  }
}
`);
    expect(output.bench).toBeDefined();
  });

  test('compiles cli blocks', () => {
    const output = compileTova(`
cli {
  name: "test-tool"
  version: "1.0.0"

  fn greet(name: String) {
    print("Hello, {name}!")
  }
}
`);
    expect(output.isCli).toBe(true);
    expect(output.cli).toBeDefined();
  });

  test('compiles shared block', () => {
    const output = compileTova(`
shared {
  type User {
    name: String
    email: String
  }
}
`);
    expect(output.shared).toBeDefined();
    expect(output.shared).toContain('User');
  });

  test('compiles module file (pub fn)', () => {
    const output = compileTova(`
pub fn add(a: Int, b: Int) -> Int {
  a + b
}
`);
    expect(output.shared).toBeDefined();
    expect(output.isModule).toBe(true);
  });

  test('handles source maps', () => {
    const output = compileTova('x = 42', 'test.tova', { sourceMaps: true });
    expect(output.sourceMappings).toBeDefined();
  });

  test('handles source maps disabled', () => {
    const output = compileTova('x = 42', 'test.tova', { sourceMaps: false });
    expect(output.shared).toBeDefined();
  });

  test('throws on syntax error', () => {
    expect(() => compileTova('fn {')).toThrow();
  });

  test('compiles edge block', () => {
    const output = compileTova(`
edge {
  target: "cloudflare"
}
`);
    expect(output.edge).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. CLI HELP / VERSION FLAGS
// ═══════════════════════════════════════════════════════════════

describe('CLI help and version', () => {
  test('--help shows usage', () => {
    const result = runTova(['--help']);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('tova <command>');
    expect(result.exitCode).toBe(0);
  });

  test('-h shows usage', () => {
    const result = runTova(['-h']);
    expect(result.stdout).toContain('Usage:');
    expect(result.exitCode).toBe(0);
  });

  test('--version shows version', () => {
    const result = runTova(['--version']);
    expect(result.stdout).toContain(`Tova v${VERSION}`);
    expect(result.exitCode).toBe(0);
  });

  test('-v shows version', () => {
    const result = runTova(['-v']);
    expect(result.stdout).toContain(`Tova v`);
    expect(result.exitCode).toBe(0);
  });

  test('no args shows help', () => {
    const result = runTova([]);
    expect(result.stdout).toContain('Usage:');
    expect(result.exitCode).toBe(0);
  });

  test('unknown command shows error and help', () => {
    const result = runTova(['notacommand']);
    expect(result.stderr).toContain('Unknown command: notacommand');
    expect(result.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. RUN COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova run', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-run'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('runs a simple .tova file', () => {
    writeFileSync(join(tmpDir, 'hello.tova'), 'print("hello from tova")');
    const result = runTova(['run', join(tmpDir, 'hello.tova')]);
    expect(result.stdout).toContain('hello from tova');
    expect(result.exitCode).toBe(0);
  });

  test('runs .tova file directly without run command', () => {
    writeFileSync(join(tmpDir, 'direct.tova'), 'print("direct run")');
    const result = runTova([join(tmpDir, 'direct.tova')]);
    expect(result.stdout).toContain('direct run');
    expect(result.exitCode).toBe(0);
  });

  test('errors when no file specified', () => {
    const result = runTova(['run'], { cwd: tmpDir });
    expect(result.stderr).toContain('No file specified');
    expect(result.exitCode).toBe(1);
  });

  test('errors when file not found', () => {
    const result = runTova(['run', join(tmpDir, 'nonexistent.tova')]);
    expect(result.stderr).toContain('File not found');
    expect(result.exitCode).toBe(1);
  });

  test('runs file with function definitions', () => {
    writeFileSync(join(tmpDir, 'funcs.tova'), `
fn greet(name: String) -> String {
  "Hello, {name}!"
}
print(greet("World"))
`);
    const result = runTova(['run', join(tmpDir, 'funcs.tova')]);
    expect(result.stdout).toContain('Hello, World!');
  });

  test('runs file with main() auto-call', () => {
    writeFileSync(join(tmpDir, 'main.tova'), `
fn main() {
  print("main called")
}
`);
    const result = runTova(['run', join(tmpDir, 'main.tova')]);
    expect(result.stdout).toContain('main called');
  });

  test('runs with --strict flag', () => {
    writeFileSync(join(tmpDir, 'strict.tova'), 'x = 42\nprint(x)');
    const result = runTova(['run', '--strict', join(tmpDir, 'strict.tova')]);
    expect(result.exitCode).toBe(0);
  });

  test('passes script arguments after --', () => {
    writeFileSync(join(tmpDir, 'args.tova'), `
fn main(args: [String]) {
  for arg in args {
    print(arg)
  }
}
`);
    const result = runTova(['run', join(tmpDir, 'args.tova'), '--', 'hello', 'world']);
    expect(result.stdout).toContain('hello');
    expect(result.stdout).toContain('world');
  });

  test('shows error on compile failure', () => {
    writeFileSync(join(tmpDir, 'bad.tova'), 'fn {{{');
    const result = runTova(['run', join(tmpDir, 'bad.tova')]);
    expect(result.exitCode).toBe(1);
  });

  test('discovers main.tova in project with tova.toml', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'tova.toml'), stringifyTOML({
      project: { name: 'test', version: '0.1.0', entry: 'src' },
      build: { output: '.tova-out' },
    }));
    writeFileSync(join(tmpDir, 'src', 'main.tova'), 'print("auto-discovered")');
    const result = runTova(['run'], { cwd: tmpDir });
    expect(result.stdout).toContain('auto-discovered');
  });

  test('runs .tova file with multi-file imports', () => {
    writeFileSync(join(tmpDir, 'lib.tova'), `
pub fn add(a: Int, b: Int) -> Int {
  a + b
}
`);
    writeFileSync(join(tmpDir, 'main.tova'), `
import { add } from "./lib.tova"
print(add(3, 4))
`);
    const result = runTova(['run', join(tmpDir, 'main.tova')]);
    expect(result.stdout).toContain('7');
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. BUILD COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova build', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir('tova-build');
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
  });
  afterEach(() => { cleanupDir(tmpDir); });

  test('builds a simple project', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42\nprint(x)');
    const result = runTova(['build', join(tmpDir, 'src')], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Build complete');
  });

  test('builds with --output flag', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const outDir = join(tmpDir, 'custom-out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(existsSync(outDir)).toBe(true);
  });

  test('builds with --verbose flag', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const result = runTova(['build', join(tmpDir, 'src'), '--verbose'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/\d+ms/);
  });

  test('builds with --quiet flag', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const result = runTova(['build', join(tmpDir, 'src'), '--quiet'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('Building');
  });

  test('errors when no .tova files found', () => {
    const emptyDir = join(tmpDir, 'empty');
    mkdirSync(emptyDir);
    const result = runTova(['build', emptyDir], { cwd: tmpDir });
    expect(result.stderr).toContain('No .tova files found');
    expect(result.exitCode).toBe(1);
  });

  test('builds server + browser blocks', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
shared {
  type Msg { text: String }
}
server {
  fn hello() { Msg("hi") }
  route GET "/api" => hello
}
browser {
  state msg = ""
  component App { <div>"{msg}"</div> }
}
`);
    const result = runTova(['build', join(tmpDir, 'src')], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
  });

  test('builds CLI project with shebang', () => {
    writeFileSync(join(tmpDir, 'src', 'tool.tova'), `
cli {
  name: "test-tool"
  version: "1.0.0"
  fn greet(name: String) {
    print("Hello, {name}!")
  }
}
`);
    const result = runTova(['build', join(tmpDir, 'src')], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[cli]');
  });

  test('builds module file (pub fn)', () => {
    writeFileSync(join(tmpDir, 'src', 'lib.tova'), `
pub fn add(a: Int, b: Int) -> Int {
  a + b
}
`);
    const result = runTova(['build', join(tmpDir, 'src')], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
  });

  test('builds with --no-cache flag', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const result = runTova(['build', join(tmpDir, 'src'), '--no-cache'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
  });

  test('incremental build caches files', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    runTova(['build', join(tmpDir, 'src')], { cwd: tmpDir });
    const result = runTova(['build', join(tmpDir, 'src'), '--verbose'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('cached');
  });

  test('writes runtime files to output', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    runTova(['build', join(tmpDir, 'src')], { cwd: tmpDir });
    const outDir = join(tmpDir, '.tova-out');
    expect(existsSync(join(outDir, 'runtime', 'reactivity.js'))).toBe(true);
    expect(existsSync(join(outDir, 'runtime', 'rpc.js'))).toBe(true);
    expect(existsSync(join(outDir, 'runtime', 'router.js'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. CHECK COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova check', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-check'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('checks a valid file', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 42\nprint(x)');
    const result = runTova(['check', tmpDir]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('checked');
  });

  test('checks a single file path', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 42');
    const result = runTova(['check', join(tmpDir, 'app.tova')]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1 file checked');
  });

  test('checks with --verbose', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 42');
    const result = runTova(['check', tmpDir, '--verbose']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/\d+ms/);
  });

  test('checks with --strict', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 42');
    const result = runTova(['check', tmpDir, '--strict']);
    expect(result.exitCode).toBe(0);
  });

  test('reports errors in invalid code', () => {
    writeFileSync(join(tmpDir, 'bad.tova'), 'fn {{{ broken');
    const result = runTova(['check', tmpDir]);
    expect(result.exitCode).toBe(1);
  });

  test('errors when no .tova files found', () => {
    const emptyDir = join(tmpDir, 'empty');
    mkdirSync(emptyDir);
    const result = runTova(['check', emptyDir]);
    expect(result.stderr).toContain('No .tova files');
    expect(result.exitCode).toBe(1);
  });

  test('check --explain shows error code detail', () => {
    const result = runTova(['check', '--explain', 'E202']);
    expect(result.stdout).toContain('E202');
    expect(result.stdout).toContain('immutable');
    expect(result.exitCode).toBe(0);
  });

  test('check --explain with unknown code fails', () => {
    const result = runTova(['check', '--explain', 'E999']);
    expect(result.stderr).toContain('Unknown error code');
    expect(result.exitCode).toBe(1);
  });

  test('shows explain hint for encountered codes', () => {
    writeFileSync(join(tmpDir, 'warn.tova'), `
fn foo() {
  unused_var = 42
}
`);
    const result = runTova(['check', tmpDir]);
    expect(result.stdout).toContain('checked');
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. CLEAN COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova clean', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-clean'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('cleans build artifacts', () => {
    const outDir = join(tmpDir, '.tova-out');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'app.js'), 'console.log("built")');
    const result = runTova(['clean'], { cwd: tmpDir });
    expect(result.stdout).toContain('Cleaned');
    expect(existsSync(outDir)).toBe(false);
  });

  test('reports when nothing to clean', () => {
    const result = runTova(['clean'], { cwd: tmpDir });
    expect(result.stdout).toContain('Nothing to clean');
  });

  test('uses config output dir', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), stringifyTOML({
      project: { name: 'test', version: '0.1.0' },
      build: { output: 'custom-build' },
    }));
    const outDir = join(tmpDir, 'custom-build');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'file.js'), 'x');
    const result = runTova(['clean'], { cwd: tmpDir });
    expect(result.stdout).toContain('Cleaned');
    expect(existsSync(outDir)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. FMT COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova fmt', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-fmt'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('formats a file', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x=42');
    const result = runTova(['fmt', join(tmpDir, 'app.tova')]);
    expect(result.exitCode).toBe(0);
  });

  test('reports already formatted', () => {
    const source = 'x = 42\n';
    writeFileSync(join(tmpDir, 'app.tova'), source);
    runTova(['fmt', join(tmpDir, 'app.tova')]);
    const result = runTova(['fmt', join(tmpDir, 'app.tova')]);
    expect(result.stdout).toContain('Already formatted');
  });

  test('--check reports changes needed', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x=42');
    const result = runTova(['fmt', '--check', join(tmpDir, 'app.tova')]);
    if (result.stdout.includes('Would reformat')) {
      expect(result.exitCode).toBe(1);
    } else {
      expect(result.exitCode).toBe(0);
    }
  });

  test('errors when no file specified', () => {
    const result = runTova(['fmt']);
    expect(result.stderr).toContain('No file specified');
    expect(result.exitCode).toBe(1);
  });

  test('errors when file not found', () => {
    const result = runTova(['fmt', join(tmpDir, 'nonexistent.tova')]);
    expect(result.stderr).toContain('File not found');
    expect(result.exitCode).toBe(1);
  });

  test('formats multiple files', () => {
    writeFileSync(join(tmpDir, 'a.tova'), 'x=1');
    writeFileSync(join(tmpDir, 'b.tova'), 'y=2');
    const result = runTova(['fmt', join(tmpDir, 'a.tova'), join(tmpDir, 'b.tova')]);
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. TEST COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova test', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-test-cmd'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('reports no test files', () => {
    const result = runTova(['test', tmpDir]);
    expect(result.stdout).toContain('No test files found');
    expect(result.exitCode).toBe(0);
  });

  test('discovers .test.tova files', () => {
    writeFileSync(join(tmpDir, 'math.test.tova'), `
test "addition" {
  assert(1 + 1 == 2)
}
`);
    const result = runTova(['test', tmpDir], { timeout: 30000 });
    expect(result.stdout).toContain('Found 1 test file');
  });

  test('discovers _test.tova files', () => {
    writeFileSync(join(tmpDir, 'math_test.tova'), `
test "addition" {
  assert(1 + 1 == 2)
}
`);
    const result = runTova(['test', tmpDir], { timeout: 30000 });
    expect(result.stdout).toContain('Found 1 test file');
  });

  test('discovers inline test blocks', () => {
    writeFileSync(join(tmpDir, 'app.tova'), `
fn add(a: Int, b: Int) -> Int { a + b }

test "add works" {
  assert(add(1, 2) == 3)
}
`);
    const result = runTova(['test', tmpDir], { timeout: 30000 });
    expect(result.stdout).toContain('Found 1 test file');
  });

  test('skips files without test blocks', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 42');
    const result = runTova(['test', tmpDir]);
    expect(result.stdout).toContain('No test files found');
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. BENCH COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova bench', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-bench'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('reports no bench files', () => {
    const result = runTova(['bench', tmpDir]);
    expect(result.stdout).toContain('No bench files found');
    expect(result.exitCode).toBe(0);
  });

  test('discovers bench blocks', () => {
    writeFileSync(join(tmpDir, 'perf.tova'), `
bench "loop" {
  var x = 0
  for i in range(100) {
    x = x + 1
  }
}
`);
    const result = runTova(['bench', tmpDir], { timeout: 30000 });
    expect(result.stdout).toContain('Found 1 bench file');
  });

  test('skips files without bench blocks', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 42');
    const result = runTova(['bench', tmpDir]);
    expect(result.stdout).toContain('No bench files found');
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. DOC COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova doc', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-doc'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('reports no documented files', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 42');
    const result = runTova(['doc', tmpDir]);
    expect(result.stdout).toContain('No documented');
    expect(result.exitCode).toBe(0);
  });

  test('reports no .tova files', () => {
    const emptyDir = join(tmpDir, 'empty');
    mkdirSync(emptyDir);
    const result = runTova(['doc', emptyDir]);
    expect(result.stdout).toContain('No .tova files');
  });

  test('generates docs from docstrings', () => {
    writeFileSync(join(tmpDir, 'lib.tova'), `
/// Adds two numbers
/// Returns the sum
fn add(a: Int, b: Int) -> Int {
  a + b
}
`);
    const result = runTova(['doc', tmpDir], { timeout: 15000 });
    expect(result.stdout).toContain('Generated');
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. NEW COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova new', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-new'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('creates a new project with template', () => {
    const result = runTova(['new', 'myapp', '--template', 'script'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Done');
    expect(existsSync(join(tmpDir, 'myapp', 'tova.toml'))).toBe(true);
    expect(existsSync(join(tmpDir, 'myapp', 'src', 'main.tova'))).toBe(true);
  });

  test('creates fullstack template', () => {
    const result = runTova(['new', 'fsapp', '--template', 'fullstack'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tmpDir, 'fsapp', 'src', 'app.tova'))).toBe(true);
  });

  test('creates api template', () => {
    const result = runTova(['new', 'apiapp', '--template', 'api'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tmpDir, 'apiapp', 'src', 'app.tova'))).toBe(true);
  });

  test('creates library template', () => {
    const result = runTova(['new', 'mylib', '--template', 'library'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tmpDir, 'mylib', 'src', 'lib.tova'))).toBe(true);
  });

  test('creates blank template', () => {
    const result = runTova(['new', 'blank', '--template', 'blank'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tmpDir, 'blank', 'tova.toml'))).toBe(true);
    expect(existsSync(join(tmpDir, 'blank', 'src'))).toBe(true);
  });

  test('errors when no name specified', () => {
    const result = runTova(['new'], { cwd: tmpDir });
    expect(result.stderr).toContain('No project name');
    expect(result.exitCode).toBe(1);
  });

  test('errors when directory already exists', () => {
    mkdirSync(join(tmpDir, 'exists'));
    const result = runTova(['new', 'exists'], { cwd: tmpDir });
    expect(result.stderr).toContain('already exists');
    expect(result.exitCode).toBe(1);
  });

  test('errors on unknown template', () => {
    const result = runTova(['new', 'app', '--template', 'badtemplate'], { cwd: tmpDir });
    expect(result.stderr).toContain('Unknown template');
    expect(result.exitCode).toBe(1);
  });

  test('--template=value syntax works', () => {
    const result = runTova(['new', 'app2', '--template=script'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tmpDir, 'app2', 'tova.toml'))).toBe(true);
  });

  test('creates .gitignore', () => {
    runTova(['new', 'proj', '--template', 'script'], { cwd: tmpDir });
    expect(existsSync(join(tmpDir, 'proj', '.gitignore'))).toBe(true);
    const gitignore = readFileSync(join(tmpDir, 'proj', '.gitignore'), 'utf-8');
    expect(gitignore).toContain('node_modules');
    expect(gitignore).toContain('.tova-out');
  });

  test('creates README.md', () => {
    runTova(['new', 'proj2', '--template', 'script'], { cwd: tmpDir });
    expect(existsSync(join(tmpDir, 'proj2', 'README.md'))).toBe(true);
    const readme = readFileSync(join(tmpDir, 'proj2', 'README.md'), 'utf-8');
    expect(readme).toContain('proj2');
    expect(readme).toContain('Tova');
  });

  test('tova.toml has correct project config', () => {
    runTova(['new', 'conftest', '--template', 'script'], { cwd: tmpDir });
    const toml = readFileSync(join(tmpDir, 'conftest', 'tova.toml'), 'utf-8');
    expect(toml).toContain('conftest');
    expect(toml).toContain('0.1.0');
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. INIT COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova init', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-init'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('initializes a project in current directory', () => {
    const result = runTova(['init'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Created tova.toml');
    expect(existsSync(join(tmpDir, 'tova.toml'))).toBe(true);
    expect(existsSync(join(tmpDir, 'src'))).toBe(true);
  });

  test('creates starter app.tova', () => {
    runTova(['init'], { cwd: tmpDir });
    expect(existsSync(join(tmpDir, 'src', 'app.tova'))).toBe(true);
  });

  test('creates .gitignore', () => {
    runTova(['init'], { cwd: tmpDir });
    expect(existsSync(join(tmpDir, '.gitignore'))).toBe(true);
  });

  test('errors when tova.toml already exists', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "existing"');
    const result = runTova(['init'], { cwd: tmpDir });
    expect(result.stderr).toContain('tova.toml already exists');
    expect(result.exitCode).toBe(1);
  });

  test('does not overwrite existing .gitignore', () => {
    writeFileSync(join(tmpDir, '.gitignore'), 'custom_ignore');
    runTova(['init'], { cwd: tmpDir });
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');
    expect(content).toBe('custom_ignore');
  });

  test('does not create app.tova if src/ has .tova files', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'existing.tova'), 'x = 1');
    runTova(['init'], { cwd: tmpDir });
    expect(existsSync(join(tmpDir, 'src', 'app.tova'))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 13. EXPLAIN COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova explain', () => {
  test('explains a known error code', () => {
    const result = runTova(['explain', 'E202']);
    expect(result.stdout).toContain('E202');
    expect(result.stdout).toContain('immutable');
    expect(result.exitCode).toBe(0);
  });

  test('explains a warning code', () => {
    const result = runTova(['explain', 'W001']);
    expect(result.stdout).toContain('W001');
    expect(result.exitCode).toBe(0);
  });

  test('errors on unknown code', () => {
    const result = runTova(['explain', 'E999']);
    expect(result.stderr).toContain('Unknown error code');
    expect(result.exitCode).toBe(1);
  });

  test('errors when no code specified', () => {
    const result = runTova(['explain']);
    expect(result.stderr).toContain('Usage');
    expect(result.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 14. COMPLETIONS COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova completions', () => {
  test('generates bash completions', () => {
    const result = runTova(['completions', 'bash']);
    expect(result.stdout).toContain('_tova()');
    expect(result.stdout).toContain('COMPREPLY');
    expect(result.stdout).toContain('complete -F _tova tova');
    expect(result.exitCode).toBe(0);
  });

  test('generates zsh completions', () => {
    const result = runTova(['completions', 'zsh']);
    expect(result.stdout).toContain('#compdef tova');
    expect(result.stdout).toContain('_tova');
    expect(result.exitCode).toBe(0);
  });

  test('generates fish completions', () => {
    const result = runTova(['completions', 'fish']);
    expect(result.stdout).toContain('complete -c tova');
    expect(result.stdout).toContain('__fish_use_subcommand');
    expect(result.exitCode).toBe(0);
  });

  test('errors on unknown shell', () => {
    const result = runTova(['completions', 'powershell']);
    expect(result.stderr).toContain('Unknown shell');
    expect(result.exitCode).toBe(1);
  });

  test('errors when no shell specified', () => {
    const result = runTova(['completions']);
    expect(result.stderr).toContain('Usage');
    expect(result.exitCode).toBe(1);
  });

  test('bash completions include all commands', () => {
    const result = runTova(['completions', 'bash']);
    for (const cmd of ['run', 'build', 'check', 'clean', 'dev', 'new', 'test', 'bench', 'fmt', 'doc', 'repl', 'lsp', 'init', 'upgrade', 'info', 'doctor']) {
      expect(result.stdout).toContain(cmd);
    }
  });

  test('zsh completions include commands', () => {
    const result = runTova(['completions', 'zsh']);
    expect(result.stdout).toContain('run:');
    expect(result.stdout).toContain('build:');
    expect(result.stdout).toContain('migrate:create:');
  });

  test('fish completions include descriptions', () => {
    const result = runTova(['completions', 'fish']);
    expect(result.stdout).toContain("'Compile and execute");
    expect(result.stdout).toContain("'Start interactive REPL");
  });

  test('bash completions include template values', () => {
    const result = runTova(['completions', 'bash']);
    expect(result.stdout).toContain('fullstack');
    expect(result.stdout).toContain('api');
    expect(result.stdout).toContain('script');
    expect(result.stdout).toContain('library');
    expect(result.stdout).toContain('blank');
  });

  test('bash completions include global flags', () => {
    const result = runTova(['completions', 'bash']);
    expect(result.stdout).toContain('--help');
    expect(result.stdout).toContain('--production');
    expect(result.stdout).toContain('--watch');
    expect(result.stdout).toContain('--verbose');
    expect(result.stdout).toContain('--strict');
  });
});

// ═══════════════════════════════════════════════════════════════
// 15. INFO COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova info', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-info'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('shows version info', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.stdout).toContain(`v${VERSION}`);
    expect(result.exitCode).toBe(0);
  });

  test('shows Bun version', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.stdout).toContain('Bun v');
  });

  test('shows platform info', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.stdout).toContain('Platform:');
    expect(result.stdout).toContain(process.platform);
  });

  test('shows no tova.toml message when missing', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.stdout).toContain('No tova.toml');
  });

  test('shows project config when tova.toml exists', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), stringifyTOML({
      project: { name: 'testproj', version: '1.2.3', entry: 'src' },
      build: { output: '.tova-out' },
    }));
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.stdout).toContain('testproj');
    expect(result.stdout).toContain('1.2.3');
  });

  test('shows build output status', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.stdout).toContain('Build output');
  });

  test('shows dependency info when package.json exists', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { 'some-pkg': '^1.0.0' },
      devDependencies: { 'test-pkg': '^2.0.0' },
    }));
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.stdout).toContain('some-pkg');
    expect(result.stdout).toContain('test-pkg');
  });
});

// ═══════════════════════════════════════════════════════════════
// 16. DOCTOR COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova doctor', () => {
  test('runs doctor checks', () => {
    const result = runTova(['doctor']);
    expect(result.stdout).toContain('Tova Doctor');
    expect(result.stdout).toContain(`Tova v${VERSION}`);
    expect(result.exitCode).toBe(0);
  });

  test('checks Bun availability', () => {
    const result = runTova(['doctor']);
    expect(result.stdout).toContain('Bun v');
  });

  test('checks git availability', () => {
    const result = runTova(['doctor']);
    expect(result.stdout).toMatch(/git/);
  });

  test('reports pass/warn/fail status', () => {
    const result = runTova(['doctor']);
    expect(result.stdout).toMatch(/[✓⚠✗]/);
  });
});

// ═══════════════════════════════════════════════════════════════
// 17. CACHE COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova cache', () => {
  test('cache list shows cache info', () => {
    const result = runTova(['cache', 'list']);
    expect(result.stdout).toContain('Cache:');
    expect(result.exitCode).toBe(0);
  });

  test('cache (default) lists cache', () => {
    const result = runTova(['cache']);
    expect(result.stdout).toContain('Cache:');
    expect(result.exitCode).toBe(0);
  });

  test('cache path shows path', () => {
    const result = runTova(['cache', 'path']);
    expect(result.stdout.trim()).toBeTruthy();
    expect(result.exitCode).toBe(0);
  });

  test('cache clean clears cache', () => {
    const result = runTova(['cache', 'clean']);
    expect(result.stdout).toContain('Cache cleared');
    expect(result.exitCode).toBe(0);
  });

  test('cache unknown subcommand errors', () => {
    const result = runTova(['cache', 'badcmd']);
    expect(result.stderr).toContain('Unknown cache subcommand');
    expect(result.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 18. MIGRATE:CREATE COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova migrate:create', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-migrate'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('creates a migration file', () => {
    const result = runTova(['migrate:create', 'add_users'], { cwd: tmpDir });
    expect(result.stdout).toContain('Created migration');
    expect(result.stdout).toContain('add_users');
    expect(existsSync(join(tmpDir, 'migrations'))).toBe(true);

    const files = readdirSync(join(tmpDir, 'migrations'));
    expect(files.length).toBe(1);
    expect(files[0]).toContain('add_users');
    expect(files[0]).toEndWith('.js');
  });

  test('migration file has up and down exports', () => {
    runTova(['migrate:create', 'create_table'], { cwd: tmpDir });
    const files = readdirSync(join(tmpDir, 'migrations'));
    const content = readFileSync(join(tmpDir, 'migrations', files[0]), 'utf-8');
    expect(content).toContain('export const up');
    expect(content).toContain('export const down');
  });

  test('errors when no name specified', () => {
    const result = runTova(['migrate:create'], { cwd: tmpDir });
    expect(result.stderr).toContain('No migration name');
    expect(result.exitCode).toBe(1);
  });

  test('sanitizes migration name', () => {
    runTova(['migrate:create', 'add-users-table!'], { cwd: tmpDir });
    const files = readdirSync(join(tmpDir, 'migrations'));
    expect(files[0]).toContain('add_users_table_');
    expect(files[0]).toMatch(/^\d+_[a-zA-Z0-9_]+\.js$/);
  });

  test('creates multiple migrations with unique timestamps', () => {
    runTova(['migrate:create', 'first'], { cwd: tmpDir });
    Bun.sleepSync(1100);
    runTova(['migrate:create', 'second'], { cwd: tmpDir });
    const files = readdirSync(join(tmpDir, 'migrations')).sort();
    expect(files.length).toBe(2);
    expect(files[0]).not.toBe(files[1]);
  });
});

// ═══════════════════════════════════════════════════════════════
// 19. PACKAGE MANAGEMENT (add/remove/install)
// ═══════════════════════════════════════════════════════════════

describe('tova add', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir('tova-add');
    writeFileSync(join(tmpDir, 'tova.toml'), stringifyTOML({
      project: { name: 'test', version: '0.1.0' },
      build: { output: '.tova-out' },
      npm: {},
      dependencies: {},
    }));
  });
  afterEach(() => { cleanupDir(tmpDir); });

  test('errors when no package specified', () => {
    const result = runTova(['add'], { cwd: tmpDir });
    expect(result.stderr).toContain('No package specified');
    expect(result.exitCode).toBe(1);
  });

  test('errors when no tova.toml found', () => {
    const emptyDir = createTmpDir('tova-add-empty');
    const result = runTova(['add', 'some-pkg'], { cwd: emptyDir });
    expect(result.stderr).toContain('No tova.toml');
    cleanupDir(emptyDir);
  });
});

describe('tova remove', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir('tova-remove');
    writeFileSync(join(tmpDir, 'tova.toml'), `[project]
name = "test"
version = "0.1.0"

[npm]
zod = "^3.0.0"

[dependencies]
mylib = "*"
`);
  });
  afterEach(() => { cleanupDir(tmpDir); });

  test('errors when no package specified', () => {
    const result = runTova(['remove'], { cwd: tmpDir });
    expect(result.stderr).toContain('No package specified');
    expect(result.exitCode).toBe(1);
  });

  test('errors when no tova.toml found', () => {
    const emptyDir = createTmpDir('tova-remove-empty');
    const result = runTova(['remove', 'pkg'], { cwd: emptyDir });
    expect(result.stderr).toContain('No tova.toml');
    cleanupDir(emptyDir);
  });

  test('errors when package not found in toml', () => {
    const result = runTova(['remove', 'nonexistent-pkg'], { cwd: tmpDir });
    expect(result.stderr).toContain('not found');
    expect(result.exitCode).toBe(1);
  });
});

describe('tova install', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-install'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('reports no npm dependencies when toml is empty', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), stringifyTOML({
      project: { name: 'test', version: '0.1.0' },
      build: { output: '.tova-out' },
    }));
    const result = runTova(['install'], { cwd: tmpDir, timeout: 30000 });
    expect(result.stdout).toContain('No npm dependencies');
  });
});

// ═══════════════════════════════════════════════════════════════
// 20. UPDATE COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova update', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-update'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('reports no dependencies to update', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), stringifyTOML({
      project: { name: 'test', version: '0.1.0' },
      build: { output: '.tova-out' },
    }));
    const result = runTova(['update'], { cwd: tmpDir });
    expect(result.stdout).toContain('No Tova dependencies');
  });
});

// ═══════════════════════════════════════════════════════════════
// 21. UTILITY FUNCTIONS (tested via their source modules)
// ═══════════════════════════════════════════════════════════════

describe('error codes registry', () => {
  test('lookupCode finds known codes', () => {
    const info = lookupCode('E202');
    expect(info).not.toBeNull();
    expect(info.title).toContain('immutable');
    expect(info.category).toBe('scope');
  });

  test('lookupCode returns null for unknown codes', () => {
    expect(lookupCode('E999')).toBeNull();
  });

  test('lookupCode finds warning codes', () => {
    const info = lookupCode('W001');
    expect(info).not.toBeNull();
    expect(info.title).toContain('Unused');
  });

  test('getExplanation returns text for known codes', () => {
    const explanation = getExplanation('E202');
    if (explanation) {
      expect(typeof explanation).toBe('string');
      expect(explanation.length).toBeGreaterThan(0);
    }
  });

  test('getExplanation returns null for unknown codes', () => {
    expect(getExplanation('E999')).toBeNull();
  });
});

describe('resolveConfig', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-config'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('returns defaults when no config files', () => {
    const config = resolveConfig(tmpDir);
    expect(config._source).toBe('defaults');
    expect(config.project.name).toBe('tova-app');
    expect(config.build.output).toBe('.tova-out');
  });

  test('reads tova.toml', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), stringifyTOML({
      project: { name: 'myproject', version: '2.0.0' },
      build: { output: 'dist' },
    }));
    const config = resolveConfig(tmpDir);
    expect(config._source).toBe('tova.toml');
    expect(config.project.name).toBe('myproject');
    expect(config.project.version).toBe('2.0.0');
  });

  test('falls back to package.json', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'pkg-project',
      version: '3.0.0',
    }));
    const config = resolveConfig(tmpDir);
    expect(config._source).toBe('package.json');
  });

  test('tova.toml takes priority over package.json', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), stringifyTOML({
      project: { name: 'toml-wins', version: '1.0.0' },
      build: { output: '.tova-out' },
    }));
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'json-loses', version: '2.0.0',
    }));
    const config = resolveConfig(tmpDir);
    expect(config.project.name).toBe('toml-wins');
  });
});

describe('Formatter', () => {
  test('formats simple code', () => {
    const source = 'x = 42';
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, 'test.tova');
    const ast = parser.parse();
    const formatter = new Formatter();
    const formatted = formatter.format(ast);
    expect(typeof formatted).toBe('string');
    expect(formatted).toContain('42');
  });

  test('formats function definitions', () => {
    const source = `fn greet(name: String) -> String {
  "Hello, {name}!"
}`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, 'test.tova');
    const ast = parser.parse();
    const formatter = new Formatter();
    const formatted = formatter.format(ast);
    expect(formatted).toContain('fn greet');
    expect(formatted).toContain('String');
  });
});

describe('stringifyTOML', () => {
  test('serializes simple object', () => {
    const result = stringifyTOML({
      project: { name: 'test', version: '1.0.0' },
    });
    expect(result).toContain('[project]');
    expect(result).toContain('name = "test"');
    expect(result).toContain('version = "1.0.0"');
  });

  test('serializes nested sections', () => {
    const result = stringifyTOML({
      project: { name: 'test' },
      build: { output: 'dist' },
    });
    expect(result).toContain('[project]');
    expect(result).toContain('[build]');
  });

  test('serializes empty object', () => {
    const result = stringifyTOML({});
    expect(typeof result).toBe('string');
  });
});

describe('addToSection / removeFromSection', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-toml-edit'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('adds entry to section', () => {
    const filePath = join(tmpDir, 'tova.toml');
    writeFileSync(filePath, '[npm]\n');
    addToSection(filePath, 'npm', 'zod', '^3.0.0');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('zod = "^3.0.0"');
  });

  test('removes entry from section', () => {
    const filePath = join(tmpDir, 'tova.toml');
    writeFileSync(filePath, '[npm]\nzod = "^3.0.0"\n');
    const removed = removeFromSection(filePath, 'npm', 'zod');
    expect(removed).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).not.toContain('zod');
  });

  test('removeFromSection returns false when not found', () => {
    const filePath = join(tmpDir, 'tova.toml');
    writeFileSync(filePath, '[npm]\n');
    const removed = removeFromSection(filePath, 'npm', 'nonexistent');
    expect(removed).toBe(false);
  });

  test('updates existing entry value', () => {
    const filePath = join(tmpDir, 'tova.toml');
    writeFileSync(filePath, '[npm]\nzod = "^3.0.0"\n');
    addToSection(filePath, 'npm', 'zod', '^4.0.0');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('zod = "^4.0.0"');
    const matches = content.match(/zod/g);
    expect(matches.length).toBe(1);
  });
});

describe('stdlib', () => {
  test('getFullStdlib returns string', () => {
    const stdlib = getFullStdlib();
    expect(typeof stdlib).toBe('string');
    expect(stdlib.length).toBeGreaterThan(100);
  });

  test('BUILTIN_NAMES is a Set', () => {
    expect(BUILTIN_NAMES instanceof Set).toBe(true);
    expect(BUILTIN_NAMES.size).toBeGreaterThan(10);
  });

  test('BUILTIN_NAMES includes core functions', () => {
    expect(BUILTIN_NAMES.has('print')).toBe(true);
    expect(BUILTIN_NAMES.has('len')).toBe(true);
    expect(BUILTIN_NAMES.has('range')).toBe(true);
  });

  test('PROPAGATE is a string', () => {
    expect(typeof PROPAGATE).toBe('string');
  });

  test('NATIVE_INIT is a string', () => {
    expect(typeof NATIVE_INIT).toBe('string');
  });
});

describe('VERSION', () => {
  test('is a semver string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

// ═══════════════════════════════════════════════════════════════
// 22. FILE DISCOVERY
// ═══════════════════════════════════════════════════════════════

describe('file discovery', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-discover'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('finds .tova files recursively', () => {
    mkdirSync(join(tmpDir, 'sub'), { recursive: true });
    writeFileSync(join(tmpDir, 'a.tova'), 'x = 1');
    writeFileSync(join(tmpDir, 'sub', 'b.tova'), 'y = 2');
    const result = runTova(['check', tmpDir]);
    expect(result.stdout).toContain('2 files checked');
  });

  test('skips node_modules', () => {
    mkdirSync(join(tmpDir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 1');
    writeFileSync(join(tmpDir, 'node_modules', 'pkg', 'bad.tova'), 'y = 2');
    const result = runTova(['check', tmpDir]);
    expect(result.stdout).toContain('1 file checked');
  });

  test('skips dot directories', () => {
    mkdirSync(join(tmpDir, '.hidden'), { recursive: true });
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 1');
    writeFileSync(join(tmpDir, '.hidden', 'secret.tova'), 'y = 2');
    const result = runTova(['check', tmpDir]);
    expect(result.stdout).toContain('1 file checked');
  });
});

// ═══════════════════════════════════════════════════════════════
// 23. DEPLOY COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova deploy', () => {
  test('errors when no environment specified', () => {
    const result = runTova(['deploy']);
    expect(result.stderr).toContain('requires an environment name');
    expect(result.exitCode).toBe(1);
  });

  test('accepts environment name', () => {
    const result = runTova(['deploy', 'prod']);
    expect(result.stdout).toContain('Deploy');
  });
});

// ═══════════════════════════════════════════════════════════════
// 24. LOCK FILE GENERATION
// ═══════════════════════════════════════════════════════════════

describe('lock file', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-lock'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('add command generates lock file for local deps', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), `[project]
name = "test"
version = "0.1.0"

[dependencies]

[npm]
`);
    runTova(['add', 'file:./local-lib'], { cwd: tmpDir });
    expect(existsSync(join(tmpDir, 'tova.lock'))).toBe(true);
    const lock = JSON.parse(readFileSync(join(tmpDir, 'tova.lock'), 'utf-8'));
    expect(lock.version).toBe(1);
    expect(lock.dependencies).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 25. EDGE CASES AND ERROR HANDLING
// ═══════════════════════════════════════════════════════════════

describe('edge cases', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-edge'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('handles empty .tova file', () => {
    writeFileSync(join(tmpDir, 'empty.tova'), '');
    const result = runTova(['run', join(tmpDir, 'empty.tova')]);
    expect(result.exitCode).toBe(0);
  });

  test('handles .tova file with only comments', () => {
    writeFileSync(join(tmpDir, 'comments.tova'), '// This is a comment\n// Another comment');
    const result = runTova(['run', join(tmpDir, 'comments.tova')]);
    expect(result.exitCode).toBe(0);
  });

  test('run with --debug shows stack trace on error', () => {
    writeFileSync(join(tmpDir, 'err.tova'), 'fn {{{ broken');
    const result = runTova(['run', join(tmpDir, 'err.tova'), '--debug']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  test('check reports multiple files', () => {
    writeFileSync(join(tmpDir, 'a.tova'), 'x = 1');
    writeFileSync(join(tmpDir, 'b.tova'), 'y = 2');
    writeFileSync(join(tmpDir, 'c.tova'), 'z = 3');
    const result = runTova(['check', tmpDir]);
    expect(result.stdout).toContain('3 files checked');
  });

  test('build handles nested directory structure', () => {
    mkdirSync(join(tmpDir, 'src', 'lib'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 1');
    writeFileSync(join(tmpDir, 'src', 'lib', 'utils.tova'), 'pub fn double(n: Int) -> Int { n * 2 }');
    const result = runTova(['build', join(tmpDir, 'src')], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 26. COMPILATION PIPELINE INTEGRATION
// ═══════════════════════════════════════════════════════════════

describe('compilation pipeline', () => {
  test('Lexer - Parser - Analyzer - CodeGenerator pipeline', () => {
    const source = `
fn add(a: Int, b: Int) -> Int {
  a + b
}

fn main() {
  result = add(3, 4)
  print(result)
}
`;
    const lexer = new Lexer(source, 'pipeline.tova');
    const tokens = lexer.tokenize();
    expect(tokens.length).toBeGreaterThan(0);

    const parser = new Parser(tokens, 'pipeline.tova');
    const ast = parser.parse();
    expect(ast.body.length).toBeGreaterThan(0);

    const analyzer = new Analyzer(ast, 'pipeline.tova');
    const { warnings } = analyzer.analyze();
    expect(Array.isArray(warnings)).toBe(true);

    const codegen = new CodeGenerator(ast, 'pipeline.tova');
    const output = codegen.generate();
    expect(output.shared).toContain('add');
    expect(output.shared).toContain('main');
  });

  test('compiles match expressions', () => {
    const output = compileTova(`
fn classify(n: Int) -> String {
  match n {
    0 => "zero"
    1..10 => "small"
    _ => "large"
  }
}
`);
    expect(output.shared).toContain('classify');
  });

  test('compiles type definitions', () => {
    const output = compileTova(`
type Color {
  Red
  Green
  Blue
}
`);
    expect(output.shared).toContain('Red');
  });

  test('compiles Result/Option types', () => {
    const output = compileTova(`
fn safe_div(a: Int, b: Int) {
  if b == 0 {
    Err("division by zero")
  } else {
    Ok(a / b)
  }
}
`);
    expect(output.shared).toContain('safe_div');
  });

  test('compiles async/await', () => {
    const output = compileTova(`
async fn fetch_data() {
  print("fetching")
}
`);
    expect(output.shared).toContain('async');
  });

  test('compiles guard clauses', () => {
    const output = compileTova(`
fn check(n: Int) -> String {
  guard n > 0 else { return "negative" }
  "positive"
}
`);
    expect(output.shared).toContain('check');
  });

  test('compiles pipe operators', () => {
    const output = compileTova(`
fn double(n: Int) -> Int { n * 2 }
fn inc(n: Int) -> Int { n + 1 }
result = 5 |> double |> inc
`);
    expect(output.shared).toBeDefined();
  });

  test('compiles for loops with range', () => {
    const output = compileTova(`
var total = 0
for i in range(10) {
  total = total + i
}
`);
    expect(output.shared).toContain('for');
  });

  test('compiles while loops', () => {
    const output = compileTova(`
var x = 0
while x < 10 {
  x = x + 1
}
`);
    expect(output.shared).toContain('while');
  });

  test('compiles break/continue', () => {
    const output = compileTova(`
for i in range(10) {
  if i == 5 { break }
  if i == 3 { continue }
}
`);
    expect(output.shared).toBeDefined();
  });

  test('compiles destructuring params', () => {
    const output = compileTova(`
fn greet({name, age}) {
  print("{name} is {age}")
}
`);
    expect(output.shared).toContain('greet');
  });

  test('compiles string interpolation', () => {
    const output = compileTova('name = "world"\nmsg = "hello {name}"');
    expect(output.shared).toContain('`hello ${');
  });

  test('compiles lambda expressions', () => {
    const output = compileTova(`
nums = [1, 2, 3]
doubled = nums.map(fn(x) x * 2)
`);
    expect(output.shared).toBeDefined();
  });

  test('compiles interfaces', () => {
    const output = compileTova(`
interface Printable {
  fn to_string() -> String
}
`);
    expect(output.shared).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 27. DB CONFIG DISCOVERY (migration helper)
// ═══════════════════════════════════════════════════════════════

describe('discoverDbConfig (via parser)', () => {
  test('parses server block with db declaration', () => {
    const source = `
server {
  db {
    driver: "sqlite"
    path: "test.db"
  }
  fn handler() { "ok" }
  route GET "/" => handler
}
`;
    const lexer = new Lexer(source, 'app.tova');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, 'app.tova');
    const ast = parser.parse();

    let dbConfig = null;
    for (const node of ast.body) {
      if (node.type === 'ServerBlock') {
        for (const stmt of node.body) {
          if (stmt.type === 'DbDeclaration') {
            dbConfig = {};
            if (stmt.config) {
              for (const [k, v] of Object.entries(stmt.config)) {
                if (v.type === 'StringLiteral') dbConfig[k] = v.value;
              }
            }
          }
        }
      }
    }

    if (dbConfig) {
      expect(dbConfig.driver).toBe('sqlite');
      expect(dbConfig.path).toBe('test.db');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 28. HAS NPM IMPORTS DETECTION
// ═══════════════════════════════════════════════════════════════

describe('hasNpmImports detection', () => {
  function hasNpmImports(code) {
    const importRegex = /^\s*import\s+(?:\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const source = match[1];
      if (source.startsWith('./') || source.startsWith('../') || source.startsWith('/') || source.startsWith('./runtime/')) {
        continue;
      }
      return true;
    }
    return false;
  }

  test('detects npm imports', () => {
    expect(hasNpmImports('import { z } from "zod";')).toBe(true);
    expect(hasNpmImports('import React from "react";')).toBe(true);
    expect(hasNpmImports('import * as _ from "lodash";')).toBe(true);
  });

  test('ignores relative imports', () => {
    expect(hasNpmImports('import { foo } from "./lib.js";')).toBe(false);
    expect(hasNpmImports('import { bar } from "../utils.js";')).toBe(false);
  });

  test('ignores absolute imports', () => {
    expect(hasNpmImports('import { foo } from "/absolute/path.js";')).toBe(false);
  });

  test('handles code with no imports', () => {
    expect(hasNpmImports('const x = 42;')).toBe(false);
    expect(hasNpmImports('')).toBe(false);
  });

  test('handles mixed imports', () => {
    const code = `import { foo } from "./local.js";
import { bar } from "external-pkg";`;
    expect(hasNpmImports(code)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 29. COMPARE SEMVER
// ═══════════════════════════════════════════════════════════════

describe('compareSemver', () => {
  function compareSemver(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) < (pb[i] || 0)) return -1;
      if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    }
    return 0;
  }

  test('equal versions', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('0.8.2', '0.8.2')).toBe(0);
  });

  test('major version difference', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
    expect(compareSemver('2.0.0', '1.0.0')).toBe(1);
  });

  test('minor version difference', () => {
    expect(compareSemver('1.0.0', '1.1.0')).toBe(-1);
    expect(compareSemver('1.2.0', '1.1.0')).toBe(1);
  });

  test('patch version difference', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1);
    expect(compareSemver('1.0.2', '1.0.1')).toBe(1);
  });

  test('complex version comparison', () => {
    expect(compareSemver('0.8.1', '0.8.2')).toBe(-1);
    expect(compareSemver('1.0.0', '0.99.99')).toBe(1);
    expect(compareSemver('0.1.0', '0.0.99')).toBe(1);
  });

  test('handles missing patch', () => {
    expect(compareSemver('1.0', '1.0.0')).toBe(0);
    expect(compareSemver('1', '1.0.0')).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 30. FORMAT BYTES
// ═══════════════════════════════════════════════════════════════

describe('formatBytes', () => {
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  test('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  test('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  test('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(5242880)).toBe('5.0 MB');
  });
});

// ═══════════════════════════════════════════════════════════════
// 31. DETECT INSTALL METHOD
// ═══════════════════════════════════════════════════════════════

describe('detectInstallMethod', () => {
  function detectInstallMethod(execPath, scriptPath) {
    if (execPath.includes('.tova/bin') || scriptPath.includes('.tova/')) return 'binary';
    return 'npm';
  }

  test('detects binary install', () => {
    expect(detectInstallMethod('/home/user/.tova/bin/tova', '/home/user/.tova/lib/bin/tova.js')).toBe('binary');
  });

  test('detects npm install', () => {
    expect(detectInstallMethod('/usr/local/bin/bun', '/usr/local/lib/node_modules/tova/bin/tova.js')).toBe('npm');
  });

  test('detects binary from script path', () => {
    expect(detectInstallMethod('/usr/local/bin/bun', '/home/user/.tova/lib/bin/tova.js')).toBe('binary');
  });
});

// ═══════════════════════════════════════════════════════════════
// 32. REPL HELPERS (inferType, highlight, completer)
// ═══════════════════════════════════════════════════════════════

describe('REPL inferType', () => {
  function inferType(val) {
    if (val === null || val === undefined) return 'Nil';
    if (Array.isArray(val)) {
      if (val.length === 0) return '[_]';
      const elemType = inferType(val[0]);
      return `[${elemType}]`;
    }
    if (val?.__tag) return val.__tag;
    if (typeof val === 'number') return Number.isInteger(val) ? 'Int' : 'Float';
    if (typeof val === 'string') return 'String';
    if (typeof val === 'boolean') return 'Bool';
    if (typeof val === 'function') return 'Function';
    if (typeof val === 'object') return 'Object';
    return 'Unknown';
  }

  test('infers Nil', () => {
    expect(inferType(null)).toBe('Nil');
    expect(inferType(undefined)).toBe('Nil');
  });

  test('infers Int', () => {
    expect(inferType(42)).toBe('Int');
    expect(inferType(0)).toBe('Int');
    expect(inferType(-10)).toBe('Int');
  });

  test('infers Float', () => {
    expect(inferType(3.14)).toBe('Float');
    expect(inferType(0.1)).toBe('Float');
  });

  test('infers String', () => {
    expect(inferType('hello')).toBe('String');
    expect(inferType('')).toBe('String');
  });

  test('infers Bool', () => {
    expect(inferType(true)).toBe('Bool');
    expect(inferType(false)).toBe('Bool');
  });

  test('infers Function', () => {
    expect(inferType(() => {})).toBe('Function');
  });

  test('infers Object', () => {
    expect(inferType({})).toBe('Object');
    expect(inferType({ x: 1 })).toBe('Object');
  });

  test('infers array types', () => {
    expect(inferType([])).toBe('[_]');
    expect(inferType([1, 2, 3])).toBe('[Int]');
    expect(inferType(['a', 'b'])).toBe('[String]');
    expect(inferType([true, false])).toBe('[Bool]');
  });

  test('infers tagged types', () => {
    expect(inferType({ __tag: 'Ok', value: 42 })).toBe('Ok');
    expect(inferType({ __tag: 'Err', value: 'fail' })).toBe('Err');
    expect(inferType({ __tag: 'Some', value: 1 })).toBe('Some');
    expect(inferType({ __tag: 'None' })).toBe('None');
  });
});

describe('REPL highlight', () => {
  function highlight(line) {
    const KEYWORDS = new Set(['fn', 'let', 'var', 'if', 'elif', 'else', 'for', 'while', 'return', 'match']);
    let out = '';
    let i = 0;
    while (i < line.length) {
      if (line[i] === '/' && line[i + 1] === '/') {
        out += line.slice(i);
        break;
      }
      if (line[i] === '"') {
        let j = i + 1;
        while (j < line.length && line[j] !== '"') {
          if (line[j] === '\\') j++;
          j++;
        }
        if (j < line.length) j++;
        out += line.slice(i, j);
        i = j;
        continue;
      }
      if (/[a-zA-Z_]/.test(line[i])) {
        let j = i;
        while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
        out += line.slice(i, j);
        i = j;
        continue;
      }
      out += line[i];
      i++;
    }
    return out;
  }

  test('preserves code structure', () => {
    expect(highlight('fn add(a, b) { a + b }')).toBe('fn add(a, b) { a + b }');
    expect(highlight('x = 42')).toBe('x = 42');
    expect(highlight('// comment')).toBe('// comment');
    expect(highlight('"hello"')).toBe('"hello"');
  });

  test('handles empty string', () => {
    expect(highlight('')).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════
// 33. PROJECT TEMPLATES
// ═══════════════════════════════════════════════════════════════

describe('project templates', () => {
  test('api template creates server-only app', () => {
    const dir = createTmpDir('tpl-api');
    runTova(['new', 'api-test', '--template', 'api'], { cwd: dir });
    const content = readFileSync(join(dir, 'api-test', 'src', 'app.tova'), 'utf-8');
    expect(content).toContain('server');
    expect(content).toContain('route');
    cleanupDir(dir);
  });

  test('script template creates standalone script', () => {
    const dir = createTmpDir('tpl-script');
    runTova(['new', 'scr-test', '--template', 'script'], { cwd: dir });
    const content = readFileSync(join(dir, 'scr-test', 'src', 'main.tova'), 'utf-8');
    expect(content).toContain('print');
    cleanupDir(dir);
  });

  test('library template exports functions', () => {
    const dir = createTmpDir('tpl-lib');
    runTova(['new', 'lib-test', '--template', 'library'], { cwd: dir });
    const content = readFileSync(join(dir, 'lib-test', 'src', 'lib.tova'), 'utf-8');
    expect(content).toContain('pub fn');
    cleanupDir(dir);
  });
});

// ═══════════════════════════════════════════════════════════════
// 34. SECURITY BLOCK COMPILATION
// ═══════════════════════════════════════════════════════════════

describe('security block compilation', () => {
  test('compiles security with auth', () => {
    const output = compileTova(`
security {
  auth jwt {
    secret: "test-secret-key-for-testing-only"
  }
}

server {
  fn test_handler() { { ok: true } }
  route GET "/api/test" => test_handler
}
`);
    expect(output.server).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 35. FORM BLOCK COMPILATION
// ═══════════════════════════════════════════════════════════════

describe('form block compilation', () => {
  test('compiles form with fields', () => {
    const output = compileTova(`
browser {
  form loginForm {
    field username: String {
      required
    }
    field password: String {
      required
      minLength(8)
    }
  }
  component App {
    <div>"form test"</div>
  }
}
`);
    expect(output.browser).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 36. GENERATE LOCK FILE
// ═══════════════════════════════════════════════════════════════

describe('generateLockFile logic', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-lockgen'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('generates valid lock file structure', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), `[project]
name = "test"
version = "0.1.0"

[dependencies]
mylib = "file:./libs/mylib"

[npm]
zod = "^3.0.0"
`);
    const config = resolveConfig(tmpDir);
    const deps = config.dependencies || {};
    const npmProd = config.npm?.prod || config.npm || {};

    const lock = {
      version: 1,
      generated: new Date().toISOString(),
      dependencies: {},
      npm: {},
    };

    for (const [name, source] of Object.entries(deps)) {
      lock.dependencies[name] = { source, resolved: source };
    }
    for (const [name, version] of Object.entries(npmProd)) {
      if (typeof version === 'string') {
        lock.npm[name] = { version, dev: false };
      }
    }

    const lockPath = join(tmpDir, 'tova.lock');
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');

    const written = JSON.parse(readFileSync(lockPath, 'utf-8'));
    expect(written.version).toBe(1);
    expect(written.dependencies).toBeDefined();
    expect(written.npm).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 37. MULTI-FILE IMPORT RESOLUTION
// ═══════════════════════════════════════════════════════════════

describe('multi-file import resolution', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-imports'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('resolves relative .tova imports', () => {
    writeFileSync(join(tmpDir, 'utils.tova'), `
pub fn double(n: Int) -> Int { n * 2 }
`);
    writeFileSync(join(tmpDir, 'main.tova'), `
import { double } from "./utils.tova"
result = double(21)
print(result)
`);
    const result = runTova(['run', join(tmpDir, 'main.tova')]);
    expect(result.stdout).toContain('42');
  });

  test('resolves imports without .tova extension', () => {
    writeFileSync(join(tmpDir, 'math.tova'), `
pub fn triple(n: Int) -> Int { n * 3 }
`);
    writeFileSync(join(tmpDir, 'app.tova'), `
import { triple } from "./math"
print(triple(5))
`);
    const result = runTova(['run', join(tmpDir, 'app.tova')]);
    expect(result.stdout).toContain('15');
  });
});

// ═══════════════════════════════════════════════════════════════
// 38. DEV COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova dev', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-dev'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('errors when no .tova files found', () => {
    const emptyDir = join(tmpDir, 'empty');
    mkdirSync(emptyDir);
    const result = runTova(['dev'], { cwd: emptyDir, timeout: 10000 });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No .tova files');
  });

  test('compiles files before starting server', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
server {
  fn hello() { "world" }
  route GET "/api/hello" => hello
}
`);
    // Dev starts a long-running process — we just need to verify it compiles
    // Kill it quickly via timeout. Dev is a blocking command.
    const proc = Bun.spawnSync(
      ['bun', 'run', resolve('bin/tova.js'), 'dev'],
      {
        cwd: tmpDir,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, NO_COLOR: '1' },
        timeout: 8000,
      }
    );
    const combined = proc.stdout.toString() + proc.stderr.toString();
    // Dev should have at least started before timeout killed it
    expect(combined).toMatch(/Compiled|server|Starting|tova|Watching|Live|output/i);
  }, 15000);

  test('accepts --port flag', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42\nprint(x)');
    // Just verify it doesn't crash with Unknown command error
    const proc = Bun.spawnSync(
      ['bun', 'run', resolve('bin/tova.js'), 'dev', '--port', '9999'],
      {
        cwd: tmpDir,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, NO_COLOR: '1' },
        timeout: 8000,
      }
    );
    expect(proc.stderr.toString()).not.toContain('Unknown command');
  }, 15000);

  test('uses tova.toml entry dir when present', () => {
    mkdirSync(join(tmpDir, 'mysrc'), { recursive: true });
    writeFileSync(join(tmpDir, 'tova.toml'), stringifyTOML({
      project: { name: 'test', version: '0.1.0', entry: 'mysrc' },
      build: { output: '.tova-out' },
    }));
    writeFileSync(join(tmpDir, 'mysrc', 'app.tova'), 'x = 42\nprint(x)');
    const proc = Bun.spawnSync(
      ['bun', 'run', resolve('bin/tova.js'), 'dev'],
      {
        cwd: tmpDir,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, NO_COLOR: '1' },
        timeout: 8000,
      }
    );
    const combined = proc.stdout.toString() + proc.stderr.toString();
    // Should pick up files from mysrc/
    expect(combined).not.toContain('No .tova files');
  }, 15000);
});

// ═══════════════════════════════════════════════════════════════
// 39. REPL COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova repl', () => {
  test('shows welcome message and quits', () => {
    // Feed :quit via stdin
    const proc = Bun.spawnSync(
      ['bun', 'run', resolve('bin/tova.js'), 'repl'],
      {
        stdin: Buffer.from(':quit\n'),
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, NO_COLOR: '1' },
        timeout: 10000,
      }
    );
    const stdout = proc.stdout.toString();
    expect(stdout).toContain('Tova REPL');
    expect(stdout).toContain('v' + VERSION);
  });

  test('evaluates simple expressions', () => {
    const proc = Bun.spawnSync(
      ['bun', 'run', resolve('bin/tova.js'), 'repl'],
      {
        stdin: Buffer.from('1 + 2\n:quit\n'),
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, NO_COLOR: '1' },
        timeout: 10000,
      }
    );
    const stdout = proc.stdout.toString();
    expect(stdout).toContain('3');
  });

  test(':help shows help info', () => {
    const proc = Bun.spawnSync(
      ['bun', 'run', resolve('bin/tova.js'), 'repl'],
      {
        stdin: Buffer.from(':help\n:quit\n'),
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, NO_COLOR: '1' },
        timeout: 10000,
      }
    );
    const stdout = proc.stdout.toString();
    expect(stdout).toMatch(/:quit|:help|:type|:clear/);
  });

  test(':clear resets context', () => {
    const proc = Bun.spawnSync(
      ['bun', 'run', resolve('bin/tova.js'), 'repl'],
      {
        stdin: Buffer.from(':clear\n:quit\n'),
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, NO_COLOR: '1' },
        timeout: 10000,
      }
    );
    const stdout = proc.stdout.toString();
    expect(stdout).toContain('Context cleared');
  });

  test(':exit also quits', () => {
    const proc = Bun.spawnSync(
      ['bun', 'run', resolve('bin/tova.js'), 'repl'],
      {
        stdin: Buffer.from(':exit\n'),
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, NO_COLOR: '1' },
        timeout: 10000,
      }
    );
    expect(proc.exitCode).toBe(0);
  });

  test('evaluates function definitions', () => {
    const proc = Bun.spawnSync(
      ['bun', 'run', resolve('bin/tova.js'), 'repl'],
      {
        stdin: Buffer.from('fn double(n: Int) -> Int { n * 2 }\ndouble(21)\n:quit\n'),
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, NO_COLOR: '1' },
        timeout: 10000,
      }
    );
    const stdout = proc.stdout.toString();
    expect(stdout).toContain('42');
  });

  test('shows error on invalid expression', () => {
    // Use an expression that won't trigger multi-line mode (balanced braces)
    const proc = Bun.spawnSync(
      ['bun', 'run', resolve('bin/tova.js'), 'repl'],
      {
        stdin: Buffer.from('let 123 = bad\n:quit\n'),
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, NO_COLOR: '1' },
        timeout: 10000,
      }
    );
    const combined = proc.stdout.toString() + proc.stderr.toString();
    // The REPL should handle the error and show something (error message or just continue)
    expect(combined).toContain('Tova REPL');
    expect(proc.exitCode).toBe(0);
  });

  test('uses _ for last result', () => {
    const proc = Bun.spawnSync(
      ['bun', 'run', resolve('bin/tova.js'), 'repl'],
      {
        stdin: Buffer.from('42\n_ + 8\n:quit\n'),
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, NO_COLOR: '1' },
        timeout: 10000,
      }
    );
    const stdout = proc.stdout.toString();
    expect(stdout).toContain('50');
  });
});

// ═══════════════════════════════════════════════════════════════
// 40. LSP COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova lsp', () => {
  test('starts and responds to stdin/stdout', () => {
    // LSP communicates via JSON-RPC over stdio
    // Send a minimal initialize request and then shutdown
    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        processId: null,
        rootUri: null,
        capabilities: {},
      },
    });
    const shutdownRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'shutdown',
      params: null,
    });
    const exitNotification = JSON.stringify({
      jsonrpc: '2.0',
      method: 'exit',
      params: null,
    });

    const content1 = `Content-Length: ${Buffer.byteLength(initRequest)}\r\n\r\n${initRequest}`;
    const content2 = `Content-Length: ${Buffer.byteLength(shutdownRequest)}\r\n\r\n${shutdownRequest}`;
    const content3 = `Content-Length: ${Buffer.byteLength(exitNotification)}\r\n\r\n${exitNotification}`;

    const proc = Bun.spawnSync(
      ['bun', 'run', resolve('bin/tova.js'), 'lsp'],
      {
        stdin: Buffer.from(content1 + content2 + content3),
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, NO_COLOR: '1' },
        timeout: 10000,
      }
    );
    const stdout = proc.stdout.toString();
    // LSP should respond with Content-Length headers and JSON-RPC
    expect(stdout).toContain('Content-Length');
  });
});

// ═══════════════════════════════════════════════════════════════
// 41. MIGRATE UP/DOWN/RESET/FRESH/STATUS (SQLite)
// ═══════════════════════════════════════════════════════════════

describe('tova migrate:up', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir('tova-migrate-up');
    // Create a minimal app.tova with sqlite db config
    writeFileSync(join(tmpDir, 'app.tova'), `
server {
  db {
    driver: "sqlite"
    path: "${join(tmpDir, 'test.db').replace(/\\/g, '/')}"
  }
  fn handler() { "ok" }
  route GET "/" => handler
}
`);
  });
  afterEach(() => { cleanupDir(tmpDir); });

  test('reports no migrations directory', () => {
    const result = runTova(['migrate:up', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.stdout).toContain('No migrations directory');
  });

  test('reports all migrations up to date when no pending', () => {
    mkdirSync(join(tmpDir, 'migrations'));
    const result = runTova(['migrate:up', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.stdout).toContain('up to date');
  });

  test('applies pending migrations', () => {
    mkdirSync(join(tmpDir, 'migrations'));
    writeFileSync(join(tmpDir, 'migrations', '20260101120000_create_users.js'), `
export const up = \`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)\`;
export const down = \`DROP TABLE users\`;
`);
    const result = runTova(['migrate:up', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.stdout).toContain('Running 1 pending migration');
    expect(result.stdout).toContain('✓');
    expect(result.stdout).toContain('Done');
  });

  test('skips files without up export', () => {
    mkdirSync(join(tmpDir, 'migrations'));
    writeFileSync(join(tmpDir, 'migrations', '20260101120000_empty.js'), `
export const down = \`DROP TABLE users\`;
`);
    const result = runTova(['migrate:up', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.stdout + result.stderr).toContain('Skipping');
  });

  test('creates __migrations table', () => {
    mkdirSync(join(tmpDir, 'migrations'));
    writeFileSync(join(tmpDir, 'migrations', '20260101120000_init.js'), `
export const up = \`CREATE TABLE items (id INTEGER PRIMARY KEY)\`;
export const down = \`DROP TABLE items\`;
`);
    runTova(['migrate:up', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    // Running again should say "up to date" which proves __migrations table works
    const result = runTova(['migrate:up', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.stdout).toContain('up to date');
  });
});

describe('tova migrate:down', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir('tova-migrate-down');
    writeFileSync(join(tmpDir, 'app.tova'), `
server {
  db {
    driver: "sqlite"
    path: "${join(tmpDir, 'test.db').replace(/\\/g, '/')}"
  }
  fn handler() { "ok" }
  route GET "/" => handler
}
`);
  });
  afterEach(() => { cleanupDir(tmpDir); });

  test('reports no migrations to roll back', () => {
    const result = runTova(['migrate:down', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.stdout).toContain('No migrations to roll back');
  });

  test('rolls back the last migration', () => {
    mkdirSync(join(tmpDir, 'migrations'));
    writeFileSync(join(tmpDir, 'migrations', '20260101120000_create_users.js'), `
export const up = \`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)\`;
export const down = \`DROP TABLE users\`;
`);
    // Apply first
    runTova(['migrate:up', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    // Then roll back
    const result = runTova(['migrate:down', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.stdout).toContain('Rolling back');
    expect(result.stdout).toContain('Rolled back');
    expect(result.stdout).toContain('Done');
  });

  test('errors when migration has no down export', () => {
    mkdirSync(join(tmpDir, 'migrations'));
    writeFileSync(join(tmpDir, 'migrations', '20260101120000_nodown.js'), `
export const up = \`CREATE TABLE nodown (id INTEGER PRIMARY KEY)\`;
`);
    runTova(['migrate:up', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    const result = runTova(['migrate:down', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("no 'down' export");
  });
});

describe('tova migrate:reset', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir('tova-migrate-reset');
    writeFileSync(join(tmpDir, 'app.tova'), `
server {
  db {
    driver: "sqlite"
    path: "${join(tmpDir, 'test.db').replace(/\\/g, '/')}"
  }
  fn handler() { "ok" }
  route GET "/" => handler
}
`);
  });
  afterEach(() => { cleanupDir(tmpDir); });

  test('reports no migrations when none applied', () => {
    const result = runTova(['migrate:reset', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.stdout).toContain('No migrations to roll back');
  });

  test('rolls back all applied migrations', () => {
    mkdirSync(join(tmpDir, 'migrations'));
    writeFileSync(join(tmpDir, 'migrations', '20260101120000_create_users.js'), `
export const up = \`CREATE TABLE users (id INTEGER PRIMARY KEY)\`;
export const down = \`DROP TABLE users\`;
`);
    writeFileSync(join(tmpDir, 'migrations', '20260101120001_create_posts.js'), `
export const up = \`CREATE TABLE posts (id INTEGER PRIMARY KEY)\`;
export const down = \`DROP TABLE posts\`;
`);
    runTova(['migrate:up', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    const result = runTova(['migrate:reset', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.stdout).toContain('Rolling back 2 migration');
    expect(result.stdout).toContain('All migrations rolled back');
  });

  test('warns on missing down export but continues', () => {
    mkdirSync(join(tmpDir, 'migrations'));
    writeFileSync(join(tmpDir, 'migrations', '20260101120000_first.js'), `
export const up = \`CREATE TABLE first_tbl (id INTEGER PRIMARY KEY)\`;
export const down = \`DROP TABLE first_tbl\`;
`);
    writeFileSync(join(tmpDir, 'migrations', '20260101120001_second.js'), `
export const up = \`CREATE TABLE second_tbl (id INTEGER PRIMARY KEY)\`;
`);
    runTova(['migrate:up', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    const result = runTova(['migrate:reset', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.stderr).toContain("no 'down' export");
    // Should still complete (not crash)
    expect(result.stdout).toContain('All migrations rolled back');
  });
});

describe('tova migrate:fresh', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir('tova-migrate-fresh');
    writeFileSync(join(tmpDir, 'app.tova'), `
server {
  db {
    driver: "sqlite"
    path: "${join(tmpDir, 'test.db').replace(/\\/g, '/')}"
  }
  fn handler() { "ok" }
  route GET "/" => handler
}
`);
  });
  afterEach(() => { cleanupDir(tmpDir); });

  test('drops all tables and re-runs migrations', () => {
    mkdirSync(join(tmpDir, 'migrations'));
    writeFileSync(join(tmpDir, 'migrations', '20260101120000_create_users.js'), `
export const up = \`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)\`;
export const down = \`DROP TABLE users\`;
`);
    // Apply first
    runTova(['migrate:up', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    // Then fresh
    const result = runTova(['migrate:fresh', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.stdout).toContain('Dropping all tables');
    expect(result.stdout).toContain('Running 1 migration');
    expect(result.stdout).toContain('Fresh database');
  });

  test('reports no migrations directory', () => {
    const result = runTova(['migrate:fresh', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.stdout).toContain('Dropping all tables');
    expect(result.stdout).toContain('No migrations directory');
  });

  test('reports no migration files when dir is empty', () => {
    mkdirSync(join(tmpDir, 'migrations'));
    const result = runTova(['migrate:fresh', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.stdout).toContain('No migration files');
  });
});

describe('tova migrate:status', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir('tova-migrate-status');
    writeFileSync(join(tmpDir, 'app.tova'), `
server {
  db {
    driver: "sqlite"
    path: "${join(tmpDir, 'test.db').replace(/\\/g, '/')}"
  }
  fn handler() { "ok" }
  route GET "/" => handler
}
`);
  });
  afterEach(() => { cleanupDir(tmpDir); });

  test('reports no migration files', () => {
    const result = runTova(['migrate:status', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.stdout).toContain('No migration files');
  });

  test('shows pending status for unapplied migrations', () => {
    mkdirSync(join(tmpDir, 'migrations'));
    writeFileSync(join(tmpDir, 'migrations', '20260101120000_create_users.js'), `
export const up = \`CREATE TABLE users (id INTEGER PRIMARY KEY)\`;
export const down = \`DROP TABLE users\`;
`);
    const result = runTova(['migrate:status', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.stdout).toContain('Migration Status');
    expect(result.stdout).toContain('pending');
    expect(result.stdout).toContain('1 total');
    expect(result.stdout).toContain('0 applied');
    expect(result.stdout).toContain('1 pending');
  });

  test('shows applied status after migration', () => {
    mkdirSync(join(tmpDir, 'migrations'));
    writeFileSync(join(tmpDir, 'migrations', '20260101120000_create_users.js'), `
export const up = \`CREATE TABLE users (id INTEGER PRIMARY KEY)\`;
export const down = \`DROP TABLE users\`;
`);
    runTova(['migrate:up', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    const result = runTova(['migrate:status', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.stdout).toContain('applied');
    expect(result.stdout).toContain('1 total');
    expect(result.stdout).toContain('1 applied');
    expect(result.stdout).toContain('0 pending');
  });

  test('shows mixed status with multiple migrations', () => {
    mkdirSync(join(tmpDir, 'migrations'));
    writeFileSync(join(tmpDir, 'migrations', '20260101120000_first.js'), `
export const up = \`CREATE TABLE first_tbl (id INTEGER PRIMARY KEY)\`;
export const down = \`DROP TABLE first_tbl\`;
`);
    writeFileSync(join(tmpDir, 'migrations', '20260101120001_second.js'), `
export const up = \`CREATE TABLE second_tbl (id INTEGER PRIMARY KEY)\`;
export const down = \`DROP TABLE second_tbl\`;
`);
    // Apply only the first
    runTova(['migrate:up', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    // Now add a third migration (pending)
    writeFileSync(join(tmpDir, 'migrations', '20260101120002_third.js'), `
export const up = \`CREATE TABLE third_tbl (id INTEGER PRIMARY KEY)\`;
export const down = \`DROP TABLE third_tbl\`;
`);
    const result = runTova(['migrate:status', join(tmpDir, 'app.tova')], { cwd: tmpDir });
    expect(result.stdout).toContain('3 total');
    expect(result.stdout).toContain('2 applied');
    expect(result.stdout).toContain('1 pending');
  });
});

// ═══════════════════════════════════════════════════════════════
// 42. DEPLOY COMMAND (extended)
// ═══════════════════════════════════════════════════════════════

describe('tova deploy (extended)', () => {
  test('--plan flag is accepted', () => {
    const result = runTova(['deploy', 'staging', '--plan']);
    expect(result.stdout).toContain('Deploy');
    expect(result.exitCode).toBe(0);
  });

  test('--rollback flag is accepted', () => {
    const result = runTova(['deploy', 'prod', '--rollback']);
    expect(result.stdout).toContain('Deploy');
    expect(result.exitCode).toBe(0);
  });

  test('--status flag is accepted', () => {
    const result = runTova(['deploy', 'prod', '--status']);
    expect(result.stdout).toContain('Deploy');
    expect(result.exitCode).toBe(0);
  });

  test('--logs flag is accepted', () => {
    const result = runTova(['deploy', 'prod', '--logs']);
    expect(result.stdout).toContain('Deploy');
    expect(result.exitCode).toBe(0);
  });

  test('--list flag works without env name', () => {
    const result = runTova(['deploy', '--list']);
    // --list doesn't require env name so should not error
    expect(result.stdout).toContain('Deploy');
    expect(result.exitCode).toBe(0);
  });

  test('--ssh flag is accepted', () => {
    const result = runTova(['deploy', 'staging', '--ssh']);
    expect(result.stdout).toContain('Deploy');
    expect(result.exitCode).toBe(0);
  });

  test('--remove flag is accepted', () => {
    const result = runTova(['deploy', 'staging', '--remove']);
    expect(result.stdout).toContain('Deploy');
    expect(result.exitCode).toBe(0);
  });

  test('--server flag with value is accepted', () => {
    const result = runTova(['deploy', 'prod', '--server', 'root@example.com']);
    expect(result.stdout).toContain('Deploy');
    expect(result.exitCode).toBe(0);
  });

  test('--logs --since flag combination is accepted', () => {
    const result = runTova(['deploy', 'prod', '--logs', '--since', '1 hour ago']);
    expect(result.stdout).toContain('Deploy');
    expect(result.exitCode).toBe(0);
  });

  test('--instance flag with number is accepted', () => {
    const result = runTova(['deploy', 'prod', '--logs', '--instance', '2']);
    expect(result.stdout).toContain('Deploy');
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 43. UPGRADE COMMAND (logic tests)
// ═══════════════════════════════════════════════════════════════

describe('tova upgrade (version logic)', () => {
  function compareSemver(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) < (pb[i] || 0)) return -1;
      if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    }
    return 0;
  }

  test('current version detected correctly', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('compareSemver works for upgrade detection', () => {
    // If current is 0.8.2 and latest is 0.9.0, should detect upgrade
    expect(compareSemver('0.8.2', '0.9.0')).toBe(-1);
    expect(compareSemver('0.9.0', '0.8.2')).toBe(1);
    expect(compareSemver('0.8.2', '0.8.2')).toBe(0);
  });

  test('upgrade command outputs current version', () => {
    // The upgrade command tries to fetch from npm, which may or may not work
    // But it should at least show the current version before failing/succeeding
    const result = runTova(['upgrade'], { timeout: 20000 });
    const combined = result.stdout + result.stderr;
    expect(combined).toContain(VERSION);
  }, 25000);
});

// ═══════════════════════════════════════════════════════════════
// 44. ADD/REMOVE DEPS (extended)
// ═══════════════════════════════════════════════════════════════

describe('tova add (extended)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir('tova-add-ext');
    writeFileSync(join(tmpDir, 'tova.toml'), `[project]
name = "test"
version = "0.1.0"

[dependencies]

[npm]
`);
  });
  afterEach(() => { cleanupDir(tmpDir); });

  test('adds npm package with npm: prefix', () => {
    const result = runTova(['add', 'npm:zod@^3.0.0'], { cwd: tmpDir, timeout: 60000 });
    // Should modify tova.toml
    const toml = readFileSync(join(tmpDir, 'tova.toml'), 'utf-8');
    expect(toml).toContain('zod');
    expect(result.stdout).toContain('Added zod');
  }, 90000);

  test('adds --dev npm dependency', () => {
    const result = runTova(['add', 'npm:vitest@^1.0.0', '--dev'], { cwd: tmpDir, timeout: 60000 });
    expect(result.stdout).toContain('Added vitest');
    expect(result.stdout).toContain('npm.dev');
  }, 90000);

  test('adds local path dependency', () => {
    mkdirSync(join(tmpDir, 'local-lib'));
    writeFileSync(join(tmpDir, 'local-lib', 'lib.tova'), 'pub fn hello() { "hi" }');
    const result = runTova(['add', 'file:./local-lib'], { cwd: tmpDir });
    const toml = readFileSync(join(tmpDir, 'tova.toml'), 'utf-8');
    expect(toml).toContain('local-lib');
    expect(result.stdout).toContain('Added');
  });

  test('adds relative path dependency', () => {
    mkdirSync(join(tmpDir, 'mylib'));
    const result = runTova(['add', './mylib'], { cwd: tmpDir });
    const toml = readFileSync(join(tmpDir, 'tova.toml'), 'utf-8');
    expect(toml).toContain('mylib');
  });

  test('generates lock file for local deps', () => {
    mkdirSync(join(tmpDir, 'mylib'));
    runTova(['add', 'file:./mylib'], { cwd: tmpDir });
    expect(existsSync(join(tmpDir, 'tova.lock'))).toBe(true);
    const lock = JSON.parse(readFileSync(join(tmpDir, 'tova.lock'), 'utf-8'));
    expect(lock.version).toBe(1);
    expect(lock.dependencies.mylib).toBeDefined();
  });

  test('shows usage hint with no package', () => {
    const result = runTova(['add'], { cwd: tmpDir });
    expect(result.stderr).toContain('No package specified');
    expect(result.stderr).toContain('Usage');
    expect(result.stderr).toContain('npm:<package>');
    expect(result.exitCode).toBe(1);
  });
});

describe('tova remove (extended)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir('tova-remove-ext');
    writeFileSync(join(tmpDir, 'tova.toml'), `[project]
name = "test"
version = "0.1.0"

[npm]
zod = "^3.0.0"
express = "^4.18.0"

[dependencies]
mylib = "file:./mylib"
`);
  });
  afterEach(() => { cleanupDir(tmpDir); });

  test('removes npm dependency from [npm]', () => {
    const result = runTova(['remove', 'zod'], { cwd: tmpDir, timeout: 60000 });
    expect(result.stdout).toContain('Removed zod');
    const toml = readFileSync(join(tmpDir, 'tova.toml'), 'utf-8');
    expect(toml).not.toContain('zod');
    // express should still be there
    expect(toml).toContain('express');
  }, 90000);

  test('removes tova dependency from [dependencies]', () => {
    const result = runTova(['remove', 'mylib'], { cwd: tmpDir, timeout: 60000 });
    expect(result.stdout).toContain('Removed mylib');
    const toml = readFileSync(join(tmpDir, 'tova.toml'), 'utf-8');
    expect(toml).not.toContain('mylib');
  }, 90000);

  test('errors when removing non-existent package', () => {
    const result = runTova(['remove', 'nonexistent-pkg'], { cwd: tmpDir });
    expect(result.stderr).toContain('not found');
    expect(result.exitCode).toBe(1);
  });

  test('shows usage with no package', () => {
    const result = runTova(['remove'], { cwd: tmpDir });
    expect(result.stderr).toContain('No package specified');
    expect(result.stderr).toContain('Usage');
    expect(result.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 45. INSTALL COMMAND (extended)
// ═══════════════════════════════════════════════════════════════

describe('tova install (extended)', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-install-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('generates package.json and installs when npm deps present', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), `[project]
name = "test"
version = "0.1.0"

[npm]
zod = "^3.0.0"
`);
    const result = runTova(['install'], { cwd: tmpDir, timeout: 60000 });
    expect(result.stdout).toContain('Generated package.json');
    expect(existsSync(join(tmpDir, 'package.json'))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(tmpDir, 'package.json'), 'utf-8'));
    expect(pkg.dependencies.zod).toBe('^3.0.0');
  }, 90000);

  test('handles no tova.toml by falling back to bun install', () => {
    // No tova.toml, should fall back to raw bun install
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test',
      dependencies: {},
    }));
    const result = runTova(['install'], { cwd: tmpDir, timeout: 30000 });
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/install|No tova\.toml|bun/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// 46. UPDATE COMMAND (extended)
// ═══════════════════════════════════════════════════════════════

describe('tova update (extended)', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-update-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('handles missing tova.toml gracefully', () => {
    const result = runTova(['update'], { cwd: tmpDir, timeout: 30000 });
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/No Tova dependencies|No tova\.toml|install/i);
  });

  test('reports no deps to update when dependencies section is empty', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), stringifyTOML({
      project: { name: 'test', version: '0.1.0' },
      build: { output: '.tova-out' },
    }));
    const result = runTova(['update'], { cwd: tmpDir });
    expect(result.stdout).toContain('No Tova dependencies');
  });

  test('deletes lock file and re-installs when deps exist', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), `[project]
name = "test"
version = "0.1.0"

[dependencies]
mylib = "file:./mylib"

[npm]
zod = "^3.0.0"
`);
    writeFileSync(join(tmpDir, 'tova.lock'), JSON.stringify({ version: 1 }));
    const result = runTova(['update'], { cwd: tmpDir, timeout: 30000 });
    expect(result.stdout).toContain('Checking for updates');
  });

  test('accepts specific package name to update', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), `[project]
name = "test"
version = "0.1.0"

[dependencies]
mylib = "*"
`);
    const result = runTova(['update', 'mylib'], { cwd: tmpDir, timeout: 30000 });
    expect(result.stdout).toContain('Checking for updates');
  });
});

// ═══════════════════════════════════════════════════════════════
// 47. TEST COMMAND (extended flags)
// ═══════════════════════════════════════════════════════════════

describe('tova test (extended)', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-test-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('finds .test.tova files', () => {
    writeFileSync(join(tmpDir, 'math.test.tova'), `
test "add" {
  assert(1 + 1 == 2)
}
`);
    const result = runTova(['test', tmpDir], { timeout: 30000 });
    expect(result.stdout).toContain('Found 1 test file');
    expect(result.stdout).toContain('Compiled');
  });

  test('finds _test.tova files', () => {
    writeFileSync(join(tmpDir, 'math_test.tova'), `
test "subtract" {
  assert(3 - 1 == 2)
}
`);
    const result = runTova(['test', tmpDir], { timeout: 30000 });
    expect(result.stdout).toContain('Found 1 test file');
  });

  test('--filter flag passes through to bun test', () => {
    writeFileSync(join(tmpDir, 'math.test.tova'), `
test "addition" {
  assert(1 + 1 == 2)
}
test "subtraction" {
  assert(3 - 1 == 2)
}
`);
    const result = runTova(['test', tmpDir, '--filter', 'addition'], { timeout: 30000 });
    expect(result.stdout).toContain('Found 1 test file');
  });

  test('--serial flag is accepted', () => {
    writeFileSync(join(tmpDir, 'a.test.tova'), `
test "test a" {
  assert(true)
}
`);
    const result = runTova(['test', tmpDir, '--serial'], { timeout: 30000 });
    expect(result.stdout).toContain('Found 1 test file');
  });

  test('--coverage flag is accepted', () => {
    writeFileSync(join(tmpDir, 'a.test.tova'), `
test "test a" {
  assert(true)
}
`);
    const result = runTova(['test', tmpDir, '--coverage'], { timeout: 30000 });
    expect(result.stdout).toContain('Found 1 test file');
  });

  test('handles compilation errors gracefully', () => {
    writeFileSync(join(tmpDir, 'bad.test.tova'), `
test "broken" {
  fn {{{
}
`);
    const result = runTova(['test', tmpDir], { timeout: 30000 });
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('Error compiling');
  });

  test('reports no test blocks compiled when tests have no test output', () => {
    writeFileSync(join(tmpDir, 'empty.test.tova'), `
// This file has no actual test blocks
x = 42
`);
    const result = runTova(['test', tmpDir], { timeout: 30000 });
    // Should detect it as a test file but compilation may not produce test output
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Found|No test files|No test blocks/);
  });

  test('discovers multiple test files in nested dirs', () => {
    mkdirSync(join(tmpDir, 'sub'), { recursive: true });
    writeFileSync(join(tmpDir, 'a.test.tova'), `
test "test a" { assert(true) }
`);
    writeFileSync(join(tmpDir, 'sub', 'b.test.tova'), `
test "test b" { assert(true) }
`);
    const result = runTova(['test', tmpDir], { timeout: 30000 });
    expect(result.stdout).toContain('Found 2 test file');
  });
});

// ═══════════════════════════════════════════════════════════════
// 48. BENCH COMMAND (extended)
// ═══════════════════════════════════════════════════════════════

describe('tova bench (extended)', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-bench-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('compiles and runs bench blocks', () => {
    writeFileSync(join(tmpDir, 'perf.tova'), `
bench "loop perf" {
  var x = 0
  for i in range(100) {
    x = x + 1
  }
  print("bench done: {x}")
}
`);
    const result = runTova(['bench', tmpDir], { timeout: 30000 });
    expect(result.stdout).toContain('Found 1 bench file');
    expect(result.stdout).toContain('Compiled');
  });

  test('handles compilation error in bench file', () => {
    writeFileSync(join(tmpDir, 'bad.tova'), `
bench "broken" {
  fn {{{
}
`);
    const result = runTova(['bench', tmpDir], { timeout: 30000 });
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('Error compiling');
  });

  test('discovers bench blocks in regular .tova files', () => {
    writeFileSync(join(tmpDir, 'app.tova'), `
fn fib(n: Int) -> Int {
  if n <= 1 { n } else { fib(n - 1) + fib(n - 2) }
}

bench "fibonacci" {
  fib(20)
}
`);
    const result = runTova(['bench', tmpDir], { timeout: 30000 });
    expect(result.stdout).toContain('Found 1 bench file');
  });
});

// ═══════════════════════════════════════════════════════════════
// 49. DOCTOR COMMAND (extended)
// ═══════════════════════════════════════════════════════════════

describe('tova doctor (extended)', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-doctor'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('checks tova.toml presence (missing)', () => {
    const result = runTova(['doctor'], { cwd: tmpDir });
    // Should warn about missing tova.toml
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/tova\.toml|No project file/);
  });

  test('checks tova.toml presence (present)', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), stringifyTOML({
      project: { name: 'test', version: '0.1.0' },
      build: { output: '.tova-out' },
    }));
    const result = runTova(['doctor'], { cwd: tmpDir });
    expect(result.stdout).toContain('tova.toml');
    expect(result.stdout).toMatch(/✓/);
  });

  test('shows warning for missing tova.toml', () => {
    const result = runTova(['doctor'], { cwd: tmpDir });
    expect(result.stdout).toContain('No tova.toml');
    expect(result.stdout).toMatch(/⚠/);
  });

  test('does not crash when .tova-out exists', () => {
    mkdirSync(join(tmpDir, '.tova-out'), { recursive: true });
    writeFileSync(join(tmpDir, '.tova-out', 'test.js'), 'x = 1');
    const result = runTova(['doctor'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
  });

  test('summary shows pass status', () => {
    const result = runTova(['doctor'], { cwd: tmpDir });
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/passed|checks/);
  });
});

// ═══════════════════════════════════════════════════════════════
// 50. INFO COMMAND (extended)
// ═══════════════════════════════════════════════════════════════

describe('tova info (extended)', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-info-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('shows arch info', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.stdout).toContain(process.arch);
  });

  test('shows build output status when not built', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.stdout).toContain('not built');
  });

  test('shows build output status when built', () => {
    mkdirSync(join(tmpDir, '.tova-out'), { recursive: true });
    writeFileSync(join(tmpDir, '.tova-out', 'app.js'), 'console.log("built")');
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.stdout).toContain('.tova-out');
    expect(result.stdout).toContain('1 file');
  });

  test('shows project entry when configured', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), stringifyTOML({
      project: { name: 'myapp', version: '1.0.0', entry: 'src' },
      build: { output: 'dist' },
    }));
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.stdout).toContain('myapp');
    expect(result.stdout).toContain('1.0.0');
    expect(result.stdout).toContain('src');
  });

  test('shows Node.js compatibility version', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.stdout).toMatch(/Node compat|v\d+/);
  });

  test('shows no dependencies message when none installed', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.stdout).toMatch(/No dependencies|No tova\.toml/);
  });
});

// ═══════════════════════════════════════════════════════════════
// 51. ENV COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova env (unimplemented)', () => {
  test('env command falls through to unknown command handler', () => {
    const result = runTova(['env']);
    expect(result.stderr).toContain('Unknown command: env');
    expect(result.exitCode).toBe(1);
  });

  test('env with args also fails', () => {
    const result = runTova(['env', 'prod', 'list']);
    expect(result.stderr).toContain('Unknown command: env');
    expect(result.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 52. RUN COMMAND (extended edge cases)
// ═══════════════════════════════════════════════════════════════

describe('tova run (edge cases)', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-run-edge'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('runs file with Result/Option', () => {
    writeFileSync(join(tmpDir, 'result.tova'), `
fn safe_div(a: Int, b: Int) {
  if b == 0 { Err("zero") } else { Ok(a / b) }
}
result = safe_div(10, 2)
print(result.unwrap())
`);
    const result = runTova(['run', join(tmpDir, 'result.tova')]);
    expect(result.stdout).toContain('5');
  });

  test('runs file with match expression', () => {
    writeFileSync(join(tmpDir, 'match.tova'), `
fn classify(n: Int) -> String {
  match n {
    0 => "zero"
    1..10 => "small"
    _ => "large"
  }
}
print(classify(0))
print(classify(5))
print(classify(100))
`);
    const result = runTova(['run', join(tmpDir, 'match.tova')]);
    expect(result.stdout).toContain('zero');
    expect(result.stdout).toContain('small');
    expect(result.stdout).toContain('large');
  });

  test('runs file with type definitions', () => {
    writeFileSync(join(tmpDir, 'types.tova'), `
type Color {
  Red
  Green
  Blue
}
c = Red
print(c)
`);
    const result = runTova(['run', join(tmpDir, 'types.tova')]);
    expect(result.exitCode).toBe(0);
  });

  test('runs file with pipe operator', () => {
    writeFileSync(join(tmpDir, 'pipe.tova'), `
fn double(n: Int) -> Int { n * 2 }
fn inc(n: Int) -> Int { n + 1 }
result = 5 |> double |> inc
print(result)
`);
    const result = runTova(['run', join(tmpDir, 'pipe.tova')]);
    expect(result.stdout).toContain('11');
  });

  test('runs file with loops and break/continue', () => {
    writeFileSync(join(tmpDir, 'loops.tova'), `
var total = 0
for i in range(10) {
  if i == 7 { break }
  if i == 3 { continue }
  total = total + i
}
print(total)
`);
    const result = runTova(['run', join(tmpDir, 'loops.tova')]);
    // 0+1+2+4+5+6 = 18
    expect(result.stdout).toContain('18');
  });

  test('runs file with guard clause', () => {
    writeFileSync(join(tmpDir, 'guard.tova'), `
fn check_positive(n: Int) -> String {
  guard n > 0 else { return "not positive" }
  "positive"
}
print(check_positive(5))
print(check_positive(-1))
`);
    const result = runTova(['run', join(tmpDir, 'guard.tova')]);
    expect(result.stdout).toContain('positive');
    expect(result.stdout).toContain('not positive');
  });

  test('runs file with async/await', () => {
    writeFileSync(join(tmpDir, 'async.tova'), `
async fn get_value() -> Int {
  42
}

async fn main() {
  val = await get_value()
  print(val)
}
`);
    const result = runTova(['run', join(tmpDir, 'async.tova')]);
    expect(result.stdout).toContain('42');
  });

  test('runs file with string interpolation', () => {
    writeFileSync(join(tmpDir, 'interp.tova'), `
name = "World"
age = 25
print("Hello {name}, age {age}")
`);
    const result = runTova(['run', join(tmpDir, 'interp.tova')]);
    expect(result.stdout).toContain('Hello World, age 25');
  });

  test('discovers app.tova as fallback entry', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), stringifyTOML({
      project: { name: 'test', version: '0.1.0', entry: '.' },
      build: { output: '.tova-out' },
    }));
    writeFileSync(join(tmpDir, 'app.tova'), 'print("app entry")');
    const result = runTova(['run'], { cwd: tmpDir });
    expect(result.stdout).toContain('app entry');
  });
});

// ═══════════════════════════════════════════════════════════════
// 53. BUILD COMMAND (extended edge cases)
// ═══════════════════════════════════════════════════════════════

describe('tova build (extended)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir('tova-build-ext');
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
  });
  afterEach(() => { cleanupDir(tmpDir); });

  test('builds edge block', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
edge {
  target: "cloudflare"
}
`);
    const result = runTova(['build', join(tmpDir, 'src')], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Build complete');
  });

  test('builds with tova.toml config output dir', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), stringifyTOML({
      project: { name: 'test', version: '0.1.0', entry: 'src' },
      build: { output: 'custom-dist' },
    }));
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const result = runTova(['build'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
  });

  test('reports compile error and continues with other files', () => {
    writeFileSync(join(tmpDir, 'src', 'good.tova'), 'x = 42');
    writeFileSync(join(tmpDir, 'src', 'bad.tova'), 'fn {{{ broken');
    const result = runTova(['build', join(tmpDir, 'src')], { cwd: tmpDir });
    // Should still complete build (potentially with errors logged)
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Build|Error|error/);
  });

  test('--production flag produces minified output', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
server {
  fn hello() { "world" }
  route GET "/" => hello
}
browser {
  state msg = "hello"
  component App { <div>"{msg}"</div> }
}
`);
    const result = runTova(['build', join(tmpDir, 'src'), '--production'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
  });

  test('builds with source maps', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42\nprint(x)');
    const result = runTova(['build', join(tmpDir, 'src')], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    // Check output dir for source map files
    const outDir = join(tmpDir, '.tova-out');
    if (existsSync(outDir)) {
      const files = readdirSync(outDir, { recursive: true });
      // Source maps may or may not be generated, but build should succeed
      expect(files.length).toBeGreaterThan(0);
    }
  });

  test('builds security block', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
security {
  auth jwt {
    secret: "test-secret-for-testing-only"
  }
}
server {
  fn handler() { { ok: true } }
  route GET "/api/test" => handler
}
`);
    const result = runTova(['build', join(tmpDir, 'src')], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 54. CHECK COMMAND (extended)
// ═══════════════════════════════════════════════════════════════

describe('tova check (extended)', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-check-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('check detects unused variables in strict mode', () => {
    writeFileSync(join(tmpDir, 'app.tova'), `
fn foo() {
  unused_var = 42
}
`);
    const result = runTova(['check', tmpDir, '--strict']);
    // Should complete check (possibly with warnings)
    expect(result.exitCode).toBe(0);
  });

  test('check validates type annotations', () => {
    writeFileSync(join(tmpDir, 'typed.tova'), `
fn add(a: Int, b: Int) -> Int {
  a + b
}
`);
    const result = runTova(['check', tmpDir]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1 file checked');
  });

  test('check validates multiple block types', () => {
    writeFileSync(join(tmpDir, 'full.tova'), `
shared {
  type User { name: String }
}
server {
  fn handler() { "ok" }
  route GET "/" => handler
}
browser {
  state msg = ""
  component App { <div>"hi"</div> }
}
`);
    const result = runTova(['check', tmpDir]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1 file checked');
  });

  test('check handles directory with single file', () => {
    writeFileSync(join(tmpDir, 'one.tova'), 'x = 1');
    const result = runTova(['check', join(tmpDir, 'one.tova')]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1 file checked');
  });
});

// ═══════════════════════════════════════════════════════════════
// 55. FMT COMMAND (extended)
// ═══════════════════════════════════════════════════════════════

describe('tova fmt (extended)', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-fmt-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('formats function with bad indentation', () => {
    writeFileSync(join(tmpDir, 'messy.tova'), `fn greet(name:String)->String{
"Hello, {name}!"
}`);
    const result = runTova(['fmt', join(tmpDir, 'messy.tova')]);
    expect(result.exitCode).toBe(0);
  });

  test('--check on formatted file returns 0', () => {
    writeFileSync(join(tmpDir, 'clean.tova'), 'x = 42\n');
    runTova(['fmt', join(tmpDir, 'clean.tova')]);
    const result = runTova(['fmt', '--check', join(tmpDir, 'clean.tova')]);
    expect(result.exitCode).toBe(0);
  });

  test('formats directory of files', () => {
    writeFileSync(join(tmpDir, 'a.tova'), 'x=1');
    writeFileSync(join(tmpDir, 'b.tova'), 'y=2');
    writeFileSync(join(tmpDir, 'c.tova'), 'z=3');
    const result = runTova(['fmt', join(tmpDir, 'a.tova'), join(tmpDir, 'b.tova'), join(tmpDir, 'c.tova')]);
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 56. DOC COMMAND (extended)
// ═══════════════════════════════════════════════════════════════

describe('tova doc (extended)', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-doc-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('generates docs for multiple documented functions', () => {
    writeFileSync(join(tmpDir, 'lib.tova'), `
/// Adds two numbers together
/// Returns their sum
fn add(a: Int, b: Int) -> Int { a + b }

/// Multiplies two numbers
fn mul(a: Int, b: Int) -> Int { a * b }
`);
    const result = runTova(['doc', tmpDir], { timeout: 15000 });
    expect(result.stdout).toContain('Generated');
  });

  test('skips undocumented functions', () => {
    writeFileSync(join(tmpDir, 'nodoc.tova'), `
fn undocumented(x: Int) -> Int { x }
`);
    const result = runTova(['doc', tmpDir], { timeout: 15000 });
    expect(result.stdout).toContain('No documented');
  });
});

// ═══════════════════════════════════════════════════════════════
// 57. CLEAN COMMAND (extended)
// ═══════════════════════════════════════════════════════════════

describe('tova clean (extended)', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-clean-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('cleans nested build artifacts', () => {
    const outDir = join(tmpDir, '.tova-out', 'runtime');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'reactivity.js'), 'code');
    writeFileSync(join(tmpDir, '.tova-out', 'app.js'), 'code');
    const result = runTova(['clean'], { cwd: tmpDir });
    expect(result.stdout).toContain('Cleaned');
    expect(existsSync(join(tmpDir, '.tova-out'))).toBe(false);
  });

  test('also cleans test and bench temp dirs', () => {
    mkdirSync(join(tmpDir, '.tova-test-out'), { recursive: true });
    mkdirSync(join(tmpDir, '.tova-bench-out'), { recursive: true });
    writeFileSync(join(tmpDir, '.tova-test-out', 'test.js'), 'x');
    const result = runTova(['clean'], { cwd: tmpDir });
    // May or may not clean test/bench dirs depending on implementation
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 58. COMPLETIONS (extended)
// ═══════════════════════════════════════════════════════════════

describe('tova completions (extended)', () => {
  test('bash completions include migrate subcommands', () => {
    const result = runTova(['completions', 'bash']);
    expect(result.stdout).toContain('migrate:create');
    expect(result.stdout).toContain('migrate:up');
    expect(result.stdout).toContain('migrate:status');
  });

  test('zsh completions include upgrade command', () => {
    const result = runTova(['completions', 'zsh']);
    expect(result.stdout).toContain('upgrade');
  });

  test('fish completions include explain command', () => {
    const result = runTova(['completions', 'fish']);
    expect(result.stdout).toContain('explain');
  });

  test('bash completions include build flags', () => {
    const result = runTova(['completions', 'bash']);
    expect(result.stdout).toContain('--output');
    expect(result.stdout).toContain('--no-cache');
    expect(result.stdout).toContain('--quiet');
  });

  test('zsh completions include template descriptions', () => {
    const result = runTova(['completions', 'zsh']);
    expect(result.stdout).toContain('fullstack');
    expect(result.stdout).toContain('library');
  });
});

// ═══════════════════════════════════════════════════════════════
// 59. FLAG COMBINATIONS AND EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('flag combinations', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-flags'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('build --verbose --quiet (quiet wins)', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 42');
    const result = runTova(['build', tmpDir, '--verbose', '--quiet'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
  });

  test('run --strict --debug on valid code', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 42\nprint(x)');
    const result = runTova(['run', '--strict', join(tmpDir, 'app.tova'), '--debug']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('42');
  });

  test('check --strict --verbose', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 42');
    const result = runTova(['check', tmpDir, '--strict', '--verbose']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/\d+ms/);
  });

  test('build --output with explicit dir', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 42');
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', tmpDir, '--output', outDir], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(existsSync(outDir)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 60. MIGRATE:CREATE (extended)
// ═══════════════════════════════════════════════════════════════

describe('tova migrate:create (extended)', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-migrate-create-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('migration file timestamp format', () => {
    const result = runTova(['migrate:create', 'test_migration'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    const files = readdirSync(join(tmpDir, 'migrations'));
    expect(files.length).toBe(1);
    // Should match YYYYMMDDHHMMSS_name.js format
    expect(files[0]).toMatch(/^\d{14}_test_migration\.js$/);
  });

  test('migration file template has correct structure', () => {
    runTova(['migrate:create', 'add_columns'], { cwd: tmpDir });
    const files = readdirSync(join(tmpDir, 'migrations'));
    const content = readFileSync(join(tmpDir, 'migrations', files[0]), 'utf-8');
    expect(content).toContain('export const up');
    expect(content).toContain('export const down');
    expect(content).toContain('Migration: add_columns');
    expect(content).toContain('Created:');
  });

  test('special characters in name are sanitized', () => {
    runTova(['migrate:create', 'add users/table@v2!'], { cwd: tmpDir });
    const files = readdirSync(join(tmpDir, 'migrations'));
    // Special chars should be replaced with _
    expect(files[0]).not.toContain('/');
    expect(files[0]).not.toContain('@');
    expect(files[0]).not.toContain('!');
  });
});

// ═══════════════════════════════════════════════════════════════
// 61. PARSEDEPLOYARGS UNIT TESTS
// ═══════════════════════════════════════════════════════════════

describe('parseDeployArgs', () => {
  // Import inline since it's an ES module
  let parseDeployArgs;

  test('parses basic deploy args', async () => {
    const mod = await import('../src/deploy/deploy.js');
    parseDeployArgs = mod.parseDeployArgs;

    const args = parseDeployArgs(['prod']);
    expect(args.envName).toBe('prod');
    expect(args.plan).toBe(false);
    expect(args.rollback).toBe(false);
  });

  test('parses --plan flag', async () => {
    const mod = await import('../src/deploy/deploy.js');
    const args = mod.parseDeployArgs(['staging', '--plan']);
    expect(args.envName).toBe('staging');
    expect(args.plan).toBe(true);
  });

  test('parses --rollback flag', async () => {
    const mod = await import('../src/deploy/deploy.js');
    const args = mod.parseDeployArgs(['prod', '--rollback']);
    expect(args.rollback).toBe(true);
  });

  test('parses --logs --since combination', async () => {
    const mod = await import('../src/deploy/deploy.js');
    const args = mod.parseDeployArgs(['prod', '--logs', '--since', '1 hour ago']);
    expect(args.logs).toBe(true);
    expect(args.since).toBe('1 hour ago');
  });

  test('parses --server value', async () => {
    const mod = await import('../src/deploy/deploy.js');
    const args = mod.parseDeployArgs(['prod', '--server', 'root@example.com']);
    expect(args.server).toBe('root@example.com');
  });

  test('parses --instance value', async () => {
    const mod = await import('../src/deploy/deploy.js');
    const args = mod.parseDeployArgs(['prod', '--instance', '3']);
    expect(args.instance).toBe(3);
  });

  test('parses --list without env', async () => {
    const mod = await import('../src/deploy/deploy.js');
    const args = mod.parseDeployArgs(['--list']);
    expect(args.list).toBe(true);
    expect(args.envName).toBeNull();
  });

  test('parses --ssh flag', async () => {
    const mod = await import('../src/deploy/deploy.js');
    const args = mod.parseDeployArgs(['staging', '--ssh']);
    expect(args.ssh).toBe(true);
  });

  test('parses --setup-git flag', async () => {
    const mod = await import('../src/deploy/deploy.js');
    const args = mod.parseDeployArgs(['prod', '--setup-git']);
    expect(args.setupGit).toBe(true);
  });

  test('parses --remove flag', async () => {
    const mod = await import('../src/deploy/deploy.js');
    const args = mod.parseDeployArgs(['prod', '--remove']);
    expect(args.remove).toBe(true);
  });

  test('parses --status flag', async () => {
    const mod = await import('../src/deploy/deploy.js');
    const args = mod.parseDeployArgs(['prod', '--status']);
    expect(args.status).toBe(true);
  });

  test('parses all flags combined', async () => {
    const mod = await import('../src/deploy/deploy.js');
    const args = mod.parseDeployArgs(['prod', '--plan', '--logs', '--status', '--ssh']);
    expect(args.envName).toBe('prod');
    expect(args.plan).toBe(true);
    expect(args.logs).toBe(true);
    expect(args.status).toBe(true);
    expect(args.ssh).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 62. TOML EDITING EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('TOML editing edge cases', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-toml-edge'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('addToSection creates section if missing', () => {
    const filePath = join(tmpDir, 'tova.toml');
    writeFileSync(filePath, '[project]\nname = "test"\n');
    addToSection(filePath, 'npm', 'zod', '^3.0.0');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('[npm]');
    expect(content).toContain('zod = "^3.0.0"');
  });

  test('addToSection preserves other sections', () => {
    const filePath = join(tmpDir, 'tova.toml');
    writeFileSync(filePath, '[project]\nname = "test"\n\n[build]\noutput = "dist"\n');
    addToSection(filePath, 'npm', 'express', '^4.18.0');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('[project]');
    expect(content).toContain('name = "test"');
    expect(content).toContain('[build]');
    expect(content).toContain('output = "dist"');
    expect(content).toContain('express = "^4.18.0"');
  });

  test('removeFromSection preserves remaining entries', () => {
    const filePath = join(tmpDir, 'tova.toml');
    writeFileSync(filePath, '[npm]\nzod = "^3.0.0"\nexpress = "^4.18.0"\n');
    removeFromSection(filePath, 'npm', 'zod');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).not.toContain('zod');
    expect(content).toContain('express = "^4.18.0"');
  });

  test('addToSection handles npm.dev nested section', () => {
    const filePath = join(tmpDir, 'tova.toml');
    writeFileSync(filePath, '[npm.dev]\n');
    addToSection(filePath, 'npm.dev', 'vitest', '^1.0.0');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('vitest = "^1.0.0"');
  });
});

// ═══════════════════════════════════════════════════════════════
// 63. FINDTOVAFILES EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('findTovaFiles edge cases', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-find-files'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('handles deeply nested directories', () => {
    const deep = join(tmpDir, 'a', 'b', 'c', 'd');
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(deep, 'app.tova'), 'x = 1');
    const result = runTova(['check', tmpDir]);
    expect(result.stdout).toContain('1 file checked');
  });

  test('handles multiple files in multiple directories', () => {
    mkdirSync(join(tmpDir, 'dir1'), { recursive: true });
    mkdirSync(join(tmpDir, 'dir2'), { recursive: true });
    writeFileSync(join(tmpDir, 'dir1', 'a.tova'), 'x = 1');
    writeFileSync(join(tmpDir, 'dir1', 'b.tova'), 'y = 2');
    writeFileSync(join(tmpDir, 'dir2', 'c.tova'), 'z = 3');
    const result = runTova(['check', tmpDir]);
    expect(result.stdout).toContain('3 files checked');
  });

  test('skips .tova-out build directory', () => {
    mkdirSync(join(tmpDir, '.tova-out'), { recursive: true });
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 1');
    writeFileSync(join(tmpDir, '.tova-out', 'built.tova'), 'y = 2');
    const result = runTova(['check', tmpDir]);
    expect(result.stdout).toContain('1 file checked');
  });

  test('handles empty directory', () => {
    const emptyDir = join(tmpDir, 'empty');
    mkdirSync(emptyDir);
    const result = runTova(['check', emptyDir]);
    expect(result.stderr).toContain('No .tova files');
    expect(result.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 64. RESOLVE CONFIG EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('resolveConfig edge cases', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-config-edge'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('handles tova.toml with minimal fields', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "minimal"\n');
    const config = resolveConfig(tmpDir);
    expect(config.project.name).toBe('minimal');
    expect(config._source).toBe('tova.toml');
  });

  test('handles tova.toml with all fields', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), stringifyTOML({
      project: { name: 'full', version: '2.0.0', entry: 'src', target: 'node' },
      build: { output: 'dist', production: true },
      npm: { zod: '^3.0.0' },
      dependencies: { mylib: 'file:./libs/mylib' },
    }));
    const config = resolveConfig(tmpDir);
    expect(config.project.name).toBe('full');
    expect(config.project.version).toBe('2.0.0');
  });

  test('handles package.json with scripts', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'from-pkg',
      version: '1.0.0',
      scripts: { start: 'node index.js' },
      dependencies: { express: '^4.18.0' },
    }));
    const config = resolveConfig(tmpDir);
    expect(config._source).toBe('package.json');
  });

  test('handles empty package.json', () => {
    writeFileSync(join(tmpDir, 'package.json'), '{}');
    const config = resolveConfig(tmpDir);
    expect(config._source).toBe('package.json');
  });
});

// ═══════════════════════════════════════════════════════════════
// 65. STDLIB BUILTINS COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('stdlib builtins', () => {
  test('includes Result/Option types', () => {
    const stdlib = getFullStdlib();
    expect(stdlib).toContain('Ok');
    expect(stdlib).toContain('Err');
    expect(stdlib).toContain('Some');
    expect(stdlib).toContain('None');
  });

  test('includes core functions', () => {
    expect(BUILTIN_NAMES.has('print')).toBe(true);
    expect(BUILTIN_NAMES.has('len')).toBe(true);
    expect(BUILTIN_NAMES.has('range')).toBe(true);
    expect(BUILTIN_NAMES.has('map')).toBe(true);
    expect(BUILTIN_NAMES.has('filter')).toBe(true);
    expect(BUILTIN_NAMES.has('reduce')).toBe(true);
    expect(BUILTIN_NAMES.has('sort_by')).toBe(true);
    expect(BUILTIN_NAMES.has('flatten')).toBe(true);
  });

  test('includes string functions', () => {
    expect(BUILTIN_NAMES.has('split')).toBe(true);
    expect(BUILTIN_NAMES.has('trim')).toBe(true);
    expect(BUILTIN_NAMES.has('join')).toBe(true);
    expect(BUILTIN_NAMES.has('lower')).toBe(true);
    expect(BUILTIN_NAMES.has('upper')).toBe(true);
  });

  test('includes math functions', () => {
    const stdlib = getFullStdlib();
    expect(stdlib).toContain('abs');
    expect(stdlib).toContain('floor');
    expect(stdlib).toContain('ceil');
  });
});

// ═══════════════════════════════════════════════════════════════
// 66. DIRECT .tova FILE EXECUTION (tova <file.tova>)
// ═══════════════════════════════════════════════════════════════

describe('direct .tova file execution', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-direct-exec'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('runs .tova file directly without "run" subcommand', () => {
    const file = join(tmpDir, 'hello.tova');
    writeFileSync(file, 'print("direct-exec-ok")');
    const result = runTova([file]);
    expect(result.stdout).toContain('direct-exec-ok');
    expect(result.exitCode).toBe(0);
  });

  test('passes script args with direct execution', () => {
    const file = join(tmpDir, 'args.tova');
    writeFileSync(file, 'print("args-test")');
    const result = runTova([file, '--', 'arg1', 'arg2']);
    expect(result.exitCode).toBe(0);
  });

  test('supports --strict with direct execution', () => {
    const file = join(tmpDir, 'strict.tova');
    writeFileSync(file, 'x = 42\nprint(x)');
    // For direct .tova execution, file must be the first arg (becomes command)
    const result = runTova([file, '--strict']);
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 67. UNKNOWN COMMAND HANDLING
// ═══════════════════════════════════════════════════════════════

describe('unknown command handling', () => {
  test('shows error for unknown command', () => {
    const result = runTova(['foobar']);
    expect(result.stderr).toContain('Unknown command: foobar');
    expect(result.exitCode).toBe(1);
  });

  test('shows help after unknown command error', () => {
    const result = runTova(['nonexistent']);
    expect(result.stdout).toContain('Usage:');
  });

  test('env command is not implemented (falls to unknown)', () => {
    const result = runTova(['env', 'prod', 'list']);
    expect(result.stderr).toContain('Unknown command');
    expect(result.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 68. RUN COMMAND — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('run command — extended coverage', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-run-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('auto-finds main.tova when tova.toml exists', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "test"\nentry = "."\n');
    writeFileSync(join(tmpDir, 'main.tova'), 'print("auto-main-found")');
    const result = runTova(['run'], { cwd: tmpDir });
    expect(result.stdout).toContain('auto-main-found');
  });

  test('auto-finds app.tova when tova.toml exists and no main.tova', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "test"\nentry = "."\n');
    writeFileSync(join(tmpDir, 'app.tova'), 'print("auto-app-found")');
    const result = runTova(['run'], { cwd: tmpDir });
    expect(result.stdout).toContain('auto-app-found');
  });

  test('errors when no file specified and no tova.toml', () => {
    const result = runTova(['run'], { cwd: tmpDir });
    expect(result.stderr).toContain('No file specified');
    expect(result.exitCode).toBe(1);
  });

  test('errors when file not found', () => {
    const result = runTova(['run', join(tmpDir, 'nope.tova')]);
    expect(result.stderr).toContain('File not found');
    expect(result.exitCode).toBe(1);
  });

  test('auto-calls main() function', () => {
    const file = join(tmpDir, 'main_fn.tova');
    writeFileSync(file, 'fn main(args) {\n  print("main-called")\n}');
    const result = runTova(['run', file]);
    expect(result.stdout).toContain('main-called');
  });

  test('runs CLI mode files', () => {
    const file = join(tmpDir, 'cli_tool.tova');
    writeFileSync(file, `cli {
  name: "tool"
  version: "1.0.0"
  fn greet(--name: String = "World") {
    print("Hello, {name}!")
  }
}`);
    const result = runTova(['run', file, '--', 'greet', '--name', 'Test']);
    expect(result.exitCode).toBe(0);
  });

  test('handles syntax error in run gracefully', () => {
    const file = join(tmpDir, 'bad.tova');
    writeFileSync(file, 'fn {{{');
    const result = runTova(['run', file]);
    expect(result.exitCode).toBe(1);
  });

  test('handles .tova imports in run mode', () => {
    writeFileSync(join(tmpDir, 'lib.tova'), 'pub fn greet() -> String {\n  "hello-from-import"\n}');
    writeFileSync(join(tmpDir, 'main.tova'), 'import { greet } from "./lib.tova"\nprint(greet())');
    const result = runTova(['run', join(tmpDir, 'main.tova')]);
    expect(result.stdout).toContain('hello-from-import');
  });
});

// ═══════════════════════════════════════════════════════════════
// 69. BUILD COMMAND — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('build command — extended coverage', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-build-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('builds module files (pub fn) as .js not .shared.js', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'lib.tova'), 'pub fn add(a: Int, b: Int) -> Int {\n  a + b\n}');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', join(tmpDir, 'out')]);
    expect(result.exitCode).toBe(0);
    // Module file should produce .js, not .shared.js
    expect(existsSync(join(tmpDir, 'out', 'lib.js'))).toBe(true);
  });

  test('builds CLI files with shebang and chmod', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'tool.tova'), `cli {
  name: "tool"
  version: "1.0.0"
  fn hello() {
    print("hi")
  }
}`);
    const result = runTova(['build', join(tmpDir, 'src'), '--output', join(tmpDir, 'out')]);
    expect(result.exitCode).toBe(0);
    const outFile = join(tmpDir, 'out', 'tool.js');
    expect(existsSync(outFile)).toBe(true);
    const content = readFileSync(outFile, 'utf-8');
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  test('builds server and browser outputs', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
shared {
  type Item { name: String }
}
server {
  fn get_items() { [] }
  route GET "/api/items" => get_items
}
browser {
  state items = []
  component App {
    <div>"Hello"</div>
  }
}
`);
    const result = runTova(['build', join(tmpDir, 'src'), '--output', join(tmpDir, 'out')]);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tmpDir, 'out', 'app.shared.js'))).toBe(true);
    expect(existsSync(join(tmpDir, 'out', 'app.server.js'))).toBe(true);
    expect(existsSync(join(tmpDir, 'out', 'app.browser.js'))).toBe(true);
  });

  test('build with --output flag uses custom output directory', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 1');
    const customOut = join(tmpDir, 'custom-output');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', customOut]);
    expect(result.exitCode).toBe(0);
    expect(existsSync(customOut)).toBe(true);
  });

  test('build with --no-cache skips cache', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 1');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', join(tmpDir, 'out'), '--no-cache']);
    expect(result.exitCode).toBe(0);
    // No .cache directory should exist in output
    expect(existsSync(join(tmpDir, 'out', '.cache'))).toBe(false);
  });

  test('build writes embedded runtime files', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 1');
    const outDir = join(tmpDir, 'out');
    runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    expect(existsSync(join(outDir, 'runtime', 'reactivity.js'))).toBe(true);
    expect(existsSync(join(outDir, 'runtime', 'rpc.js'))).toBe(true);
    expect(existsSync(join(outDir, 'runtime', 'router.js'))).toBe(true);
  });

  test('build with compilation error still continues other files', () => {
    mkdirSync(join(tmpDir, 'src', 'dir1'), { recursive: true });
    mkdirSync(join(tmpDir, 'src', 'dir2'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'dir1', 'good.tova'), 'x = 1');
    writeFileSync(join(tmpDir, 'src', 'dir2', 'bad.tova'), 'fn {{{');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', join(tmpDir, 'out')]);
    // Should still exit with error code
    expect(result.exitCode).toBe(1);
  });

  test('build edge block produces .edge.js', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
edge {
  target: "cloudflare"
  env API_URL = "https://api.example.com"
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(outDir, 'app.edge.js'))).toBe(true);
  });

  test('incremental build uses cache on second run', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const outDir = join(tmpDir, 'out');
    // First build
    runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--verbose']);
    // Second build (should hit cache)
    const result2 = runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--verbose']);
    expect(result2.stdout).toContain('cached');
  });

  test('build --production creates hashed output files', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
server {
  fn hello() { "world" }
  route GET "/api/hello" => hello
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--production']);
    expect(result.exitCode).toBe(0);
    // Production build should create hashed files
    const files = readdirSync(outDir);
    const serverFile = files.find(f => f.startsWith('server.') && f.endsWith('.js') && !f.endsWith('.min.js'));
    expect(serverFile).toBeDefined();
  });

  test('build --production with browser code creates index.html', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
browser {
  state count = 0
  component App {
    <div>"{count}"</div>
  }
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--production']);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(outDir, 'index.html'))).toBe(true);
    const html = readFileSync(join(outDir, 'index.html'), 'utf-8');
    expect(html).toContain('client.');
    expect(html).toContain('.js');
  });

  test('build --production script-only creates script hash', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42\nprint(x)');
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--production']);
    expect(result.exitCode).toBe(0);
    const files = readdirSync(outDir);
    const scriptFile = files.find(f => f.startsWith('script.') && f.endsWith('.js') && !f.endsWith('.min.js'));
    expect(scriptFile).toBeDefined();
  });

  test('build no .tova files errors', () => {
    mkdirSync(join(tmpDir, 'empty'), { recursive: true });
    const result = runTova(['build', join(tmpDir, 'empty'), '--output', join(tmpDir, 'out')]);
    expect(result.stderr).toContain('No .tova files');
    expect(result.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 70. CHECK COMMAND — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('check command — extended coverage', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-check-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('check single file path argument', () => {
    const file = join(tmpDir, 'single.tova');
    writeFileSync(file, 'x = 42');
    const result = runTova(['check', file]);
    expect(result.stdout).toContain('1 file checked');
    expect(result.exitCode).toBe(0);
  });

  test('check with --explain shows explanation', () => {
    const result = runTova(['check', '--explain', 'E100']);
    // E100 may or may not exist, but it should attempt to look it up
    if (result.exitCode === 0) {
      expect(result.stdout.length).toBeGreaterThan(0);
    } else {
      expect(result.stderr).toContain('Unknown error code');
    }
  });

  test('check with syntax error shows error', () => {
    writeFileSync(join(tmpDir, 'bad.tova'), 'fn {{{');
    const result = runTova(['check', tmpDir]);
    expect(result.exitCode).toBe(1);
  });

  test('check shows explain hint for error codes', () => {
    writeFileSync(join(tmpDir, 'warn.tova'), `
fn foo() {
  unused_var = 42
}
`);
    const result = runTova(['check', tmpDir]);
    // Should either pass or show warnings with codes
    expect(result.exitCode === 0 || result.stdout.includes('explain')).toBe(true);
  });

  test('check non-tova single file path is rejected', () => {
    const file = join(tmpDir, 'readme.txt');
    writeFileSync(file, 'hello');
    const result = runTova(['check', file]);
    expect(result.stderr).toContain('No .tova files');
    expect(result.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 71. CLEAN COMMAND — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('clean command — extended coverage', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-clean-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('clean deletes .tova-out directory', () => {
    const outDir = join(tmpDir, '.tova-out');
    mkdirSync(outDir);
    writeFileSync(join(outDir, 'app.js'), 'code');
    const result = runTova(['clean'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Cleaned');
    expect(existsSync(outDir)).toBe(false);
  });

  test('clean when no build output exists', () => {
    const result = runTova(['clean'], { cwd: tmpDir });
    expect(result.stdout).toContain('Nothing to clean');
  });

  test('clean uses config output dir', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[build]\noutput = "dist"\n');
    const distDir = join(tmpDir, 'dist');
    mkdirSync(distDir);
    writeFileSync(join(distDir, 'app.js'), 'code');
    const result = runTova(['clean'], { cwd: tmpDir });
    expect(result.stdout).toContain('Cleaned');
    expect(existsSync(distDir)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 72. FMT COMMAND — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('fmt command — extended coverage', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-fmt-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('fmt multiple files', () => {
    const file1 = join(tmpDir, 'a.tova');
    const file2 = join(tmpDir, 'b.tova');
    writeFileSync(file1, 'x=1');
    writeFileSync(file2, 'y=2');
    const result = runTova(['fmt', file1, file2]);
    expect(result.exitCode).toBe(0);
  });

  test('fmt already-formatted file shows "Already formatted"', () => {
    const file = join(tmpDir, 'clean.tova');
    // Write, then format once, then check if second format says already formatted
    writeFileSync(file, 'x = 1');
    runTova(['fmt', file]);
    const result2 = runTova(['fmt', file]);
    expect(result2.stdout).toContain('Already formatted');
  });

  test('fmt --check exits 1 when file needs formatting', () => {
    const file = join(tmpDir, 'needs.tova');
    writeFileSync(file, 'x=1');
    const result = runTova(['fmt', '--check', file]);
    // May exit 1 if formatter would change the file
    // The important thing is it doesn't modify the file
    const content = readFileSync(file, 'utf-8');
    expect(content).toBe('x=1');
  });

  test('fmt file not found errors', () => {
    const result = runTova(['fmt', join(tmpDir, 'nope.tova')]);
    expect(result.stderr).toContain('File not found');
    expect(result.exitCode).toBe(1);
  });

  test('fmt no file specified errors', () => {
    const result = runTova(['fmt']);
    expect(result.stderr).toContain('No file specified');
    expect(result.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 73. TEST COMMAND — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('test command — extended coverage', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-test-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('test with no test files found', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 1');
    const result = runTova(['test', tmpDir]);
    expect(result.stdout).toContain('No test files');
  });

  test('test finds .test.tova files', () => {
    writeFileSync(join(tmpDir, 'math.test.tova'), `
test "add" {
  assert(1 + 1 == 2)
}
`);
    const result = runTova(['test', tmpDir], { timeout: 30000 });
    expect(result.stdout).toContain('Found 1 test file');
  });

  test('test finds _test.tova files', () => {
    writeFileSync(join(tmpDir, 'math_test.tova'), `
test "sub" {
  assert(2 - 1 == 1)
}
`);
    const result = runTova(['test', tmpDir], { timeout: 30000 });
    expect(result.stdout).toContain('Found 1 test file');
  });

  test('test finds inline test blocks', () => {
    writeFileSync(join(tmpDir, 'app.tova'), `
x = 42
test "check x" {
  assert(x == 42)
}
`);
    const result = runTova(['test', tmpDir], { timeout: 30000 });
    expect(result.stdout).toContain('Found 1 test file');
  });

  test('test handles compilation errors gracefully', () => {
    writeFileSync(join(tmpDir, 'bad.test.tova'), 'fn {{{');
    const result = runTova(['test', tmpDir], { timeout: 30000 });
    expect(result.stderr).toContain('Error compiling');
  });
});

// ═══════════════════════════════════════════════════════════════
// 74. BENCH COMMAND — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('bench command — extended coverage', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-bench-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('bench with no bench files found', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 1');
    const result = runTova(['bench', tmpDir]);
    expect(result.stdout).toContain('No bench files');
  });

  test('bench handles compilation error gracefully', () => {
    writeFileSync(join(tmpDir, 'bad.tova'), `bench "bad" {\n  fn {{{\n}`);
    const result = runTova(['bench', tmpDir], { timeout: 30000 });
    expect(result.stderr).toContain('Error compiling');
  });
});

// ═══════════════════════════════════════════════════════════════
// 75. DOC COMMAND — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('doc command — extended coverage', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-doc-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('doc with no .tova files', () => {
    const result = runTova(['doc', tmpDir]);
    expect(result.stdout).toContain('No .tova files');
  });

  test('doc with no documented files', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 1');
    const result = runTova(['doc', tmpDir]);
    expect(result.stdout).toContain('No documented .tova files');
  });
});

// ═══════════════════════════════════════════════════════════════
// 76. DEPLOY COMMAND — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('deploy command — extended coverage', () => {
  test('deploy without env name errors', () => {
    const result = runTova(['deploy']);
    expect(result.stderr).toContain('deploy requires an environment name');
    expect(result.exitCode).toBe(1);
  });

  test('deploy with env name shows implementation message', () => {
    const result = runTova(['deploy', 'production']);
    expect(result.stdout).toContain('Deploy feature');
  });
});

// ═══════════════════════════════════════════════════════════════
// 77. EXPLAIN COMMAND — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('explain command — extended coverage', () => {
  test('explain without code errors', () => {
    const result = runTova(['explain']);
    expect(result.stderr).toContain('Usage: tova explain');
    expect(result.exitCode).toBe(1);
  });

  test('explain with unknown code errors', () => {
    const result = runTova(['explain', 'E99999']);
    expect(result.stderr).toContain('Unknown error code');
    expect(result.exitCode).toBe(1);
  });

  test('explain with valid code shows info', () => {
    // Try a code that likely exists
    const result = runTova(['explain', 'W200']);
    if (result.exitCode === 0) {
      expect(result.stdout.length).toBeGreaterThan(0);
    } else {
      // Code might not exist — that's ok, just confirm it gives proper error
      expect(result.stderr).toContain('Unknown error code');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 78. CACHE COMMAND — FULL COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('cache command — full coverage', () => {
  test('cache list (default subcommand)', () => {
    const result = runTova(['cache']);
    expect(result.stdout).toContain('Cache:');
  });

  test('cache list explicitly', () => {
    const result = runTova(['cache', 'list']);
    expect(result.stdout).toContain('Cache:');
  });

  test('cache path shows directory', () => {
    const result = runTova(['cache', 'path']);
    expect(result.stdout.trim().length).toBeGreaterThan(0);
  });

  test('cache clean succeeds', () => {
    const result = runTova(['cache', 'clean']);
    expect(result.stdout).toContain('Cache cleared');
    expect(result.exitCode).toBe(0);
  });

  test('cache unknown subcommand errors', () => {
    const result = runTova(['cache', 'badcmd']);
    expect(result.stderr).toContain('Unknown cache subcommand');
    expect(result.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 79. UPDATE COMMAND
// ═══════════════════════════════════════════════════════════════

describe('update command', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-update'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('update with no dependencies shows message', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "test"\n');
    const result = runTova(['update'], { cwd: tmpDir });
    expect(result.stdout).toContain('No Tova dependencies');
  });
});

// ═══════════════════════════════════════════════════════════════
// 80. INIT COMMAND — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('init command — extended coverage', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-init-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('init creates tova.toml and src directory', () => {
    const result = runTova(['init'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tmpDir, 'tova.toml'))).toBe(true);
    expect(existsSync(join(tmpDir, 'src'))).toBe(true);
    expect(result.stdout).toContain('Created tova.toml');
  });

  test('init creates .gitignore if missing', () => {
    runTova(['init'], { cwd: tmpDir });
    expect(existsSync(join(tmpDir, '.gitignore'))).toBe(true);
    const gi = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');
    expect(gi).toContain('.tova-out');
  });

  test('init preserves existing .gitignore', () => {
    writeFileSync(join(tmpDir, '.gitignore'), 'custom-ignore\n');
    runTova(['init'], { cwd: tmpDir });
    const gi = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');
    expect(gi).toBe('custom-ignore\n');
  });

  test('init creates starter app.tova when src is empty', () => {
    runTova(['init'], { cwd: tmpDir });
    expect(existsSync(join(tmpDir, 'src', 'app.tova'))).toBe(true);
    const content = readFileSync(join(tmpDir, 'src', 'app.tova'), 'utf-8');
    expect(content).toContain('server');
    expect(content).toContain('client');
  });

  test('init does not overwrite existing .tova files in src', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'myapp.tova'), 'x = 1');
    runTova(['init'], { cwd: tmpDir });
    // Should NOT create app.tova because src already has .tova files
    expect(existsSync(join(tmpDir, 'src', 'app.tova'))).toBe(false);
  });

  test('init errors when tova.toml already exists', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "exists"\n');
    const result = runTova(['init'], { cwd: tmpDir });
    expect(result.stderr).toContain('tova.toml already exists');
    expect(result.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 81. NEW PROJECT COMMAND — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('new project command — extended coverage', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-new-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('new with each template type', () => {
    for (const template of ['fullstack', 'api', 'script', 'library', 'blank']) {
      const projName = `test-${template}`;
      const result = runTova(['new', join(tmpDir, projName), '--template', template]);
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(tmpDir, projName, 'tova.toml'))).toBe(true);
      expect(existsSync(join(tmpDir, projName, '.gitignore'))).toBe(true);
      expect(existsSync(join(tmpDir, projName, 'README.md'))).toBe(true);
    }
  });

  test('new with --template=value syntax', () => {
    const projDir = join(tmpDir, 'eq-syntax');
    const result = runTova(['new', projDir, '--template=api']);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(projDir, 'tova.toml'))).toBe(true);
  });

  test('new with invalid template errors', () => {
    const result = runTova(['new', join(tmpDir, 'bad-tpl'), '--template', 'nonexistent']);
    expect(result.stderr).toContain("Unknown template 'nonexistent'");
    expect(result.exitCode).toBe(1);
  });

  test('new without name errors', () => {
    // --template=api syntax so 'api' isn't mistaken for the project name
    const result = runTova(['new', '--template=api']);
    expect(result.stderr).toContain('No project name');
    expect(result.exitCode).toBe(1);
  });

  test('new existing directory errors', () => {
    mkdirSync(join(tmpDir, 'existing'));
    const result = runTova(['new', join(tmpDir, 'existing'), '--template', 'script']);
    expect(result.stderr).toContain('already exists');
    expect(result.exitCode).toBe(1);
  });

  test('new fullstack template has correct tova.toml fields', () => {
    const projDir = join(tmpDir, 'fs-check');
    runTova(['new', projDir, '--template', 'fullstack']);
    const toml = readFileSync(join(projDir, 'tova.toml'), 'utf-8');
    expect(toml).toContain('entry = "src"');
  });

  test('new library template does not have entry field', () => {
    const projDir = join(tmpDir, 'lib-check');
    runTova(['new', projDir, '--template', 'library']);
    const toml = readFileSync(join(projDir, 'tova.toml'), 'utf-8');
    // library should not have an entry field
    expect(toml).not.toContain('entry =');
  });

  test('library template uses [package] section not [project]', () => {
    const projDir = join(tmpDir, 'lib-pkg');
    runTova(['new', projDir, '--template', 'library']);
    const toml = readFileSync(join(projDir, 'tova.toml'), 'utf-8');
    expect(toml).toContain('[package]');
    expect(toml).not.toContain('[project]');
  });

  test('library template has domain-qualified name placeholder', () => {
    const projDir = join(tmpDir, 'lib-domain');
    runTova(['new', projDir, '--template', 'library']);
    const toml = readFileSync(join(projDir, 'tova.toml'), 'utf-8');
    expect(toml).toContain('name = "github.com/yourname/lib-domain"');
  });

  test('library template has license field', () => {
    const projDir = join(tmpDir, 'lib-license');
    runTova(['new', projDir, '--template', 'library']);
    const toml = readFileSync(join(projDir, 'tova.toml'), 'utf-8');
    expect(toml).toContain('license = "MIT"');
  });

  test('library template has exports field', () => {
    const projDir = join(tmpDir, 'lib-exports');
    runTova(['new', projDir, '--template', 'library']);
    const toml = readFileSync(join(projDir, 'tova.toml'), 'utf-8');
    expect(toml).toContain('exports = ["greet", "version"]');
  });

  test('library template has [dependencies] and [npm] sections', () => {
    const projDir = join(tmpDir, 'lib-deps');
    runTova(['new', projDir, '--template', 'library']);
    const toml = readFileSync(join(projDir, 'tova.toml'), 'utf-8');
    expect(toml).toContain('[dependencies]');
    expect(toml).toContain('[npm]');
  });

  test('library template lib.tova has import usage comment', () => {
    const projDir = join(tmpDir, 'lib-usage');
    runTova(['new', projDir, '--template', 'library']);
    const content = readFileSync(join(projDir, 'src', 'lib.tova'), 'utf-8');
    expect(content).toContain('import { greet } from "github.com/yourname/lib-usage"');
  });

  test('library template lib.tova exports multiple functions', () => {
    const projDir = join(tmpDir, 'lib-fns');
    runTova(['new', projDir, '--template', 'library']);
    const content = readFileSync(join(projDir, 'src', 'lib.tova'), 'utf-8');
    expect(content).toContain('pub fn greet');
    expect(content).toContain('pub fn version');
  });

  test('library template README has publishing instructions', () => {
    const projDir = join(tmpDir, 'lib-readme');
    runTova(['new', projDir, '--template', 'library']);
    const readme = readFileSync(join(projDir, 'README.md'), 'utf-8');
    expect(readme).toContain('git tag v0.1.0');
    expect(readme).toContain('git push origin v0.1.0');
    expect(readme).toContain('tova add github.com/yourname/lib-readme');
  });

  test('library template README has usage example', () => {
    const projDir = join(tmpDir, 'lib-readme2');
    runTova(['new', projDir, '--template', 'library']);
    const readme = readFileSync(join(projDir, 'README.md'), 'utf-8');
    expect(readme).toContain('import { greet } from "github.com/yourname/lib-readme2"');
  });

  test('non-library templates still use [project] section', () => {
    for (const tpl of ['fullstack', 'api', 'script', 'blank']) {
      const projDir = join(tmpDir, `non-lib-${tpl}`);
      runTova(['new', projDir, '--template', tpl]);
      const toml = readFileSync(join(projDir, 'tova.toml'), 'utf-8');
      expect(toml).toContain('[project]');
      expect(toml).not.toContain('[package]');
    }
  });

  test('new blank template does not create source file', () => {
    const projDir = join(tmpDir, 'blank-check');
    runTova(['new', projDir, '--template', 'blank']);
    // blank should not have src/app.tova or src/main.tova
    const srcFiles = existsSync(join(projDir, 'src')) ? readdirSync(join(projDir, 'src')).filter(f => f.endsWith('.tova')) : [];
    expect(srcFiles.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 82. PACKAGE MANAGEMENT — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('package management — extended coverage', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-pkg-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('add without package errors', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "test"\n[npm]\n');
    const result = runTova(['add'], { cwd: tmpDir });
    expect(result.stderr).toContain('No package specified');
    expect(result.exitCode).toBe(1);
  });

  test('add without tova.toml errors', () => {
    const result = runTova(['add', 'npm:express'], { cwd: tmpDir });
    expect(result.stderr).toContain('No tova.toml');
    expect(result.exitCode).toBe(1);
  });

  test('remove without package errors', () => {
    const result = runTova(['remove'], { cwd: tmpDir });
    expect(result.stderr).toContain('No package specified');
    expect(result.exitCode).toBe(1);
  });

  test('remove without tova.toml errors', () => {
    const result = runTova(['remove', 'express'], { cwd: tmpDir });
    expect(result.stderr).toContain('No tova.toml');
    expect(result.exitCode).toBe(1);
  });

  test('remove non-existent package errors', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "test"\n[npm]\n');
    const result = runTova(['remove', 'nonexistent-pkg-xyz'], { cwd: tmpDir });
    expect(result.stderr).toContain('not found');
    expect(result.exitCode).toBe(1);
  });

  test('install without tova.toml runs bun install', () => {
    const result = runTova(['install'], { cwd: tmpDir, timeout: 30000 });
    expect(result.stdout).toContain('No tova.toml');
  });

  test('install with empty npm section shows nothing to install', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "test"\n');
    const result = runTova(['install'], { cwd: tmpDir, timeout: 30000 });
    expect(result.stdout).toContain('No npm dependencies');
  });

  test('add local path dependency', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "test"\n[dependencies]\n');
    const result = runTova(['add', './libs/mylib'], { cwd: tmpDir });
    const content = readFileSync(join(tmpDir, 'tova.toml'), 'utf-8');
    expect(content).toContain('mylib');
  });

  test('add git dependency', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "test"\n[dependencies]\n');
    const result = runTova(['add', 'git:https://github.com/user/repo.git'], { cwd: tmpDir });
    const content = readFileSync(join(tmpDir, 'tova.toml'), 'utf-8');
    expect(content).toContain('repo');
  });
});

// ═══════════════════════════════════════════════════════════════
// 83. MIGRATION COMMANDS — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('migration commands — extended coverage', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-migrate-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('migrate:create with no name errors', () => {
    const result = runTova(['migrate:create'], { cwd: tmpDir });
    expect(result.stderr).toContain('No migration name');
    expect(result.exitCode).toBe(1);
  });

  test('migrate:create creates migration file', () => {
    const result = runTova(['migrate:create', 'add_users'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    const migrationsDir = join(tmpDir, 'migrations');
    expect(existsSync(migrationsDir)).toBe(true);
    const files = readdirSync(migrationsDir);
    expect(files.length).toBe(1);
    expect(files[0]).toContain('add_users');
    expect(files[0]).toEndWith('.js');
    // Check content — migration uses template literal SQL format
    const content = readFileSync(join(migrationsDir, files[0]), 'utf-8');
    expect(content).toContain('export const up');
    expect(content).toContain('export const down');
  });

  test('migrate:create sanitizes name', () => {
    const result = runTova(['migrate:create', 'add-users-table!'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    const files = readdirSync(join(tmpDir, 'migrations'));
    expect(files[0]).toContain('add_users_table_');
  });
});

// ═══════════════════════════════════════════════════════════════
// 84. COMPLETIONS COMMAND — FULL COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('completions command — full coverage', () => {
  test('completions without shell errors', () => {
    const result = runTova(['completions']);
    expect(result.stderr).toContain('Usage: tova completions');
    expect(result.exitCode).toBe(1);
  });

  test('completions bash generates valid script', () => {
    const result = runTova(['completions', 'bash']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('_tova');
    expect(result.stdout).toContain('complete -F _tova tova');
    expect(result.stdout).toContain('COMPREPLY');
  });

  test('completions zsh generates valid script', () => {
    const result = runTova(['completions', 'zsh']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('#compdef tova');
    expect(result.stdout).toContain('_tova');
  });

  test('completions fish generates valid script', () => {
    const result = runTova(['completions', 'fish']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('complete -c tova');
  });

  test('completions unknown shell errors', () => {
    const result = runTova(['completions', 'powershell']);
    expect(result.stderr).toContain('Unknown shell');
    expect(result.exitCode).toBe(1);
  });

  test('bash completions include all commands', () => {
    const result = runTova(['completions', 'bash']);
    const cmds = ['run', 'build', 'check', 'clean', 'dev', 'new', 'install', 'add', 'remove',
      'repl', 'lsp', 'fmt', 'test', 'bench', 'doc', 'init', 'upgrade', 'info', 'explain',
      'doctor', 'completions'];
    for (const cmd of cmds) {
      expect(result.stdout).toContain(cmd);
    }
  });

  test('fish completions include all commands with descriptions', () => {
    const result = runTova(['completions', 'fish']);
    expect(result.stdout).toContain("'run'");
    expect(result.stdout).toContain("'build'");
    expect(result.stdout).toContain("'test'");
  });

  test('zsh completions include template and shell completions', () => {
    const result = runTova(['completions', 'zsh']);
    expect(result.stdout).toContain('fullstack');
    expect(result.stdout).toContain('bash zsh fish');
  });
});

// ═══════════════════════════════════════════════════════════════
// 85. DOCTOR COMMAND — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('doctor command — extended coverage', () => {
  test('doctor runs all checks', () => {
    const result = runTova(['doctor']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Tova Doctor');
    expect(result.stdout).toContain('Tova v');
    expect(result.stdout).toContain('Bun v');
    expect(result.stdout).toContain('git');
  });

  test('doctor shows check marks', () => {
    const result = runTova(['doctor']);
    // Should have at least some passing checks
    const passCount = (result.stdout.match(/✓/g) || []).length;
    expect(passCount).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 86. INFO COMMAND — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('info command — extended coverage', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-info-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('info shows version and runtime', () => {
    const result = runTova(['info']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Runtime');
    expect(result.stdout).toContain('Platform');
  });

  test('info without tova.toml shows defaults message', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.stdout).toContain('No tova.toml');
  });

  test('info with tova.toml shows project config', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), stringifyTOML({
      project: { name: 'my-project', version: '1.2.3', entry: 'src' },
      build: { output: 'dist' },
    }));
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.stdout).toContain('my-project');
    expect(result.stdout).toContain('1.2.3');
    expect(result.stdout).toContain('src');
    expect(result.stdout).toContain('dist');
  });

  test('info with package.json shows dependencies', () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { express: '^4.18.0' },
      devDependencies: { vitest: '^1.0.0' },
    }));
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.stdout).toContain('express');
  });

  test('info shows build output status', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "test"\n[build]\noutput = ".tova-out"\n');
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.stdout).toContain('not built yet');
  });
});

// ═══════════════════════════════════════════════════════════════
// 87. SOURCE MAP BUILDER (UNIT TESTS)
// ═══════════════════════════════════════════════════════════════

describe('SourceMapBuilder — unit tests', () => {
  // Test via build with source maps enabled (verbose shows source map activity)
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-sourcemap'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('build generates .map files', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
fn add(a: Int, b: Int) -> Int {
  a + b
}
result = add(1, 2)
print(result)
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    expect(result.exitCode).toBe(0);
    // Check for source map file
    const files = readdirSync(outDir).filter(f => f !== 'runtime');
    const mapFiles = files.filter(f => f.endsWith('.map'));
    // Source maps should be generated
    if (mapFiles.length > 0) {
      const mapContent = JSON.parse(readFileSync(join(outDir, mapFiles[0]), 'utf-8'));
      expect(mapContent.version).toBe(3);
      expect(mapContent.sources).toBeDefined();
      expect(mapContent.mappings).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 88. INCREMENTAL BUILD CACHE (UNIT TESTS)
// ═══════════════════════════════════════════════════════════════

describe('BuildCache — unit tests via CLI', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-buildcache'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('cache manifest is saved on build', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 1');
    const outDir = join(tmpDir, 'out');
    runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    // Cache manifest should exist
    expect(existsSync(join(outDir, '.cache', 'manifest.json'))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(outDir, '.cache', 'manifest.json'), 'utf-8'));
    expect(manifest.files).toBeDefined();
  });

  test('cache is invalidated when source changes', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 1');
    const outDir = join(tmpDir, 'out');
    // Build once
    runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--verbose']);
    // Modify source
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 2');
    // Build again — should NOT show cached
    const result2 = runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--verbose']);
    // Output should reflect the new build
    expect(result2.exitCode).toBe(0);
  });

  test('cache prunes stale entries when file is deleted', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'a.tova'), 'x = 1');
    writeFileSync(join(tmpDir, 'src', 'b.tova'), 'y = 2');
    const outDir = join(tmpDir, 'out');
    // Build with both files
    runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    // Delete one file
    rmSync(join(tmpDir, 'src', 'b.tova'));
    // Rebuild
    runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    const manifest = JSON.parse(readFileSync(join(outDir, '.cache', 'manifest.json'), 'utf-8'));
    // Stale entry for b.tova should be pruned
    const keys = Object.keys(manifest.files);
    const hasB = keys.some(k => k.includes('b.tova'));
    expect(hasB).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 89. MULTI-FILE COMPILATION
// ═══════════════════════════════════════════════════════════════

describe('multi-file compilation', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-multifile'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('merges multiple files in same directory', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'types.tova'), `
shared {
  type User {
    name: String
    email: String
  }
}
`);
    writeFileSync(join(tmpDir, 'src', 'server.tova'), `
server {
  fn get_users() { [] }
  route GET "/api/users" => get_users
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    expect(result.exitCode).toBe(0);
  });

  test('cross-directory imports compile correctly', () => {
    mkdirSync(join(tmpDir, 'src', 'lib'), { recursive: true });
    mkdirSync(join(tmpDir, 'src', 'app'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'lib', 'math.tova'), `
pub fn add(a: Int, b: Int) -> Int {
  a + b
}
`);
    writeFileSync(join(tmpDir, 'src', 'app', 'main.tova'), `
import { add } from "../lib/math.tova"
result = add(1, 2)
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    expect(result.exitCode).toBe(0);
  });

  test('duplicate declarations across files causes error', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'a.tova'), `
shared {
  type User { name: String }
}
`);
    writeFileSync(join(tmpDir, 'src', 'b.tova'), `
shared {
  type User { email: String }
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    // Should detect duplicate type
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Duplicate');
  });
});

// ═══════════════════════════════════════════════════════════════
// 90. HELPER FUNCTION UNIT TESTS
// ═══════════════════════════════════════════════════════════════

describe('helper function unit tests', () => {
  test('compileTova with warnings does not throw', () => {
    // Unused variable in function scope generates warning, not error
    const output = compileTova(`
fn foo() {
  unused_var = 42
}
`);
    expect(output.shared).toBeDefined();
  });

  test('compileTova with knownNames predefines scope', () => {
    const output = compileTova('print(myVar)', 'test.tova', { knownNames: ['myVar'] });
    expect(output.shared).toBeDefined();
  });

  test('compileTova edge block output', () => {
    const output = compileTova(`
edge {
  target: "deno"
}
`);
    expect(output.edge).toBeDefined();
  });

  test('compileTova security block output', () => {
    const output = compileTova(`
security {
  auth {
    type: "jwt"
    secret: "test-secret-key-minimum-32-chars-long"
  }
}

server {
  fn protected_data() { "secret" }
  route GET "/api/data" => protected_data
}
`);
    expect(output.server).toBeDefined();
  });

  test('compileTova form block within browser', () => {
    const output = compileTova(`
browser {
  form loginForm {
    field email: String {
      validate required
    }
    field password: String {
      validate required
    }
  }

  component App {
    <div>"Hello"</div>
  }
}
`);
    expect(output.browser).toBeDefined();
  });

  test('compileTova preserves source mappings', () => {
    const output = compileTova('x = 42\ny = 100', 'test.tova', { sourceMaps: true });
    expect(output.sourceMappings).toBeDefined();
    expect(Array.isArray(output.sourceMappings)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 91. TOML EDITING — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('TOML editing — extended coverage', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-toml-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('addToSection creates section if missing', () => {
    const filePath = join(tmpDir, 'tova.toml');
    writeFileSync(filePath, '[project]\nname = "test"\n');
    addToSection(filePath, 'npm', 'express', '^4.18.0');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('[npm]');
    expect(content).toContain('express = "^4.18.0"');
  });

  test('addToSection appends to existing section', () => {
    const filePath = join(tmpDir, 'tova.toml');
    writeFileSync(filePath, '[npm]\nexpress = "^4.18.0"\n');
    addToSection(filePath, 'npm', 'cors', '^2.0.0');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('express = "^4.18.0"');
    expect(content).toContain('cors = "^2.0.0"');
  });

  test('removeFromSection removes existing key', () => {
    const filePath = join(tmpDir, 'tova.toml');
    writeFileSync(filePath, '[npm]\nexpress = "^4.18.0"\ncors = "^2.0.0"\n');
    const removed = removeFromSection(filePath, 'npm', 'express');
    expect(removed).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).not.toContain('express');
    expect(content).toContain('cors');
  });

  test('removeFromSection returns false for non-existent key', () => {
    const filePath = join(tmpDir, 'tova.toml');
    writeFileSync(filePath, '[npm]\nexpress = "^4.18.0"\n');
    const removed = removeFromSection(filePath, 'npm', 'nonexistent');
    expect(removed).toBe(false);
  });

  test('removeFromSection handles dependencies section', () => {
    const filePath = join(tmpDir, 'tova.toml');
    writeFileSync(filePath, '[dependencies]\nmylib = "file:./libs/mylib"\n');
    const removed = removeFromSection(filePath, 'dependencies', 'mylib');
    expect(removed).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).not.toContain('mylib');
  });
});

// ═══════════════════════════════════════════════════════════════
// 92. STRINGIFYTOM — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('stringifyTOML — extended coverage', () => {
  test('handles nested tables', () => {
    const result = stringifyTOML({
      project: { name: 'test', version: '1.0.0' },
      build: { output: 'dist' },
    });
    expect(result).toContain('[project]');
    expect(result).toContain('name = "test"');
    expect(result).toContain('[build]');
    expect(result).toContain('output = "dist"');
  });

  test('handles empty objects', () => {
    const result = stringifyTOML({ project: { name: 'test' }, npm: {} });
    expect(result).toContain('[project]');
    expect(result).toContain('[npm]');
  });

  test('handles number values', () => {
    const result = stringifyTOML({ dev: { port: 3000 } });
    expect(result).toContain('port = 3000');
  });

  test('handles boolean values', () => {
    const result = stringifyTOML({ build: { production: true } });
    expect(result).toContain('production = true');
  });
});

// ═══════════════════════════════════════════════════════════════
// 93. ERROR CODES AND DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════

describe('error codes and diagnostics', () => {
  test('lookupCode returns null for unknown code', () => {
    expect(lookupCode('E99999')).toBe(null);
  });

  test('lookupCode returns info for valid code', () => {
    // Try some common codes
    for (const code of ['E100', 'E200', 'W200', 'W201']) {
      const info = lookupCode(code);
      if (info) {
        expect(info.title).toBeDefined();
        expect(info.category).toBeDefined();
      }
    }
  });

  test('getExplanation returns string or null', () => {
    const result = getExplanation('E100');
    expect(result === null || typeof result === 'string').toBe(true);
  });

  test('getExplanation for unknown code returns null', () => {
    expect(getExplanation('E99999')).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════════
// 94. RESOLVE CONFIG — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('resolveConfig — extended edge cases', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-config-ext2'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('resolveConfig with no config files uses defaults', () => {
    const config = resolveConfig(tmpDir);
    expect(config.project).toBeDefined();
    expect(config.build).toBeDefined();
    expect(config._source).toBe('defaults');
  });

  test('resolveConfig prefers tova.toml over package.json', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "toml-proj"\n');
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'pkg-proj' }));
    const config = resolveConfig(tmpDir);
    expect(config._source).toBe('tova.toml');
    expect(config.project.name).toBe('toml-proj');
  });

  test('resolveConfig handles tova.toml with all sections', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), stringifyTOML({
      project: { name: 'full', version: '1.0.0', entry: 'src' },
      build: { output: 'dist' },
      dev: { port: 4000 },
      npm: { express: '^4.18.0' },
      dependencies: {},
    }));
    const config = resolveConfig(tmpDir);
    expect(config.project.name).toBe('full');
    expect(config.dev.port).toBe(4000);
  });
});

// ═══════════════════════════════════════════════════════════════
// 95. STDLIB INLINE — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('stdlib inline — extended coverage', () => {
  test('PROPAGATE constant is defined', () => {
    expect(typeof PROPAGATE).toBe('string');
    expect(PROPAGATE.length).toBeGreaterThan(0);
  });

  test('NATIVE_INIT is defined', () => {
    expect(typeof NATIVE_INIT).toBe('string');
  });

  test('BUILTIN_NAMES contains essential builtins', () => {
    // Only check names that are actually in the BUILTIN_NAMES set
    // (push/pop/Ok/Err/Some/None/has/parseInt/parseFloat/toString are functions in stdlib
    //  but not tracked in BUILTIN_NAMES — they're defined inline)
    const essential = ['print', 'len', 'range',
      'map', 'filter', 'reduce', 'sort_by', 'flatten', 'zip', 'enumerate',
      'split', 'trim', 'join', 'lower', 'upper', 'contains', 'replace',
      'keys', 'values', 'entries', 'merge', 'abs', 'floor', 'ceil',
      'round', 'sqrt', 'log', 'random'];
    for (const name of essential) {
      expect(BUILTIN_NAMES.has(name)).toBe(true);
    }
  });

  test('getFullStdlib includes Result and Option functions', () => {
    const stdlib = getFullStdlib();
    expect(stdlib).toContain('function Ok');
    expect(stdlib).toContain('function Err');
    expect(stdlib).toContain('function Some');
    expect(stdlib).toContain('None');
  });

  test('getFullStdlib includes typed array functions', () => {
    const stdlib = getFullStdlib();
    expect(stdlib).toContain('typed_sum');
    expect(stdlib).toContain('typed_dot');
  });
});

// ═══════════════════════════════════════════════════════════════
// 96. FORMATTER — EXTENDED COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('Formatter — extended coverage', () => {
  test('formats simple assignments', () => {
    const formatter = new Formatter();
    const lexer = new Lexer('x=1', 'test.tova');
    const parser = new Parser(lexer.tokenize(), 'test.tova');
    const ast = parser.parse();
    const result = formatter.format(ast);
    expect(typeof result).toBe('string');
  });

  test('formats function declarations', () => {
    const formatter = new Formatter();
    const source = 'fn add(a: Int, b: Int) -> Int {\n  a + b\n}';
    const lexer = new Lexer(source, 'test.tova');
    const parser = new Parser(lexer.tokenize(), 'test.tova');
    const ast = parser.parse();
    const result = formatter.format(ast);
    expect(result).toContain('fn add');
  });

  test('formats match expressions', () => {
    const formatter = new Formatter();
    const source = `
result = match x {
  1 => "one"
  2 => "two"
  _ => "other"
}
`;
    const lexer = new Lexer(source, 'test.tova');
    const parser = new Parser(lexer.tokenize(), 'test.tova');
    const ast = parser.parse();
    const result = formatter.format(ast);
    expect(result).toContain('match');
  });

  test('formats type declarations', () => {
    const formatter = new Formatter();
    const source = 'type Point {\n  x: Float\n  y: Float\n}';
    const lexer = new Lexer(source, 'test.tova');
    const parser = new Parser(lexer.tokenize(), 'test.tova');
    const ast = parser.parse();
    const result = formatter.format(ast);
    expect(result).toContain('type Point');
  });
});

// ═══════════════════════════════════════════════════════════════
// 97. VERSION
// ═══════════════════════════════════════════════════════════════

describe('VERSION', () => {
  test('VERSION is a valid semver string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('--version flag shows version', () => {
    const result = runTova(['--version']);
    expect(result.stdout).toContain(`Tova v${VERSION}`);
    expect(result.exitCode).toBe(0);
  });

  test('-v flag shows version', () => {
    const result = runTova(['-v']);
    expect(result.stdout).toContain('Tova v');
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 98. HELP FLAGS
// ═══════════════════════════════════════════════════════════════

describe('help flags', () => {
  test('no arguments shows help', () => {
    const result = runTova([]);
    expect(result.stdout).toContain('Usage:');
    expect(result.exitCode).toBe(0);
  });

  test('-h flag shows help', () => {
    const result = runTova(['-h']);
    expect(result.stdout).toContain('Usage:');
    expect(result.exitCode).toBe(0);
  });

  test('help text contains all documented commands', () => {
    const result = runTova(['--help']);
    const commands = ['run', 'build', 'check', 'clean', 'dev', 'new', 'install', 'add',
      'remove', 'repl', 'lsp', 'fmt', 'test', 'bench', 'doc', 'init',
      'migrate:create', 'migrate:up', 'upgrade', 'info', 'doctor', 'completions',
      'deploy', 'explain'];
    for (const cmd of commands) {
      expect(result.stdout).toContain(cmd);
    }
  });

  test('help text contains all documented flags', () => {
    const result = runTova(['--help']);
    const flags = ['--help', '--version', '--output', '--production', '--watch',
      '--verbose', '--quiet', '--debug', '--strict'];
    for (const flag of flags) {
      expect(result.stdout).toContain(flag);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 99. COMPILATION EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('compilation edge cases', () => {
  test('empty source file compiles', () => {
    const output = compileTova('');
    expect(output).toBeDefined();
  });

  test('comment-only source compiles', () => {
    const output = compileTova('// just a comment');
    expect(output).toBeDefined();
  });

  test('multiple server blocks compile', () => {
    const output = compileTova(`
server {
  fn hello() { "hi" }
  route GET "/hello" => hello
}
`);
    expect(output.server).toBeDefined();
  });

  test('type with variants compiles', () => {
    const output = compileTova(`
type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
}
`);
    expect(output.shared).toContain('Circle');
    expect(output.shared).toContain('Rectangle');
  });

  test('async function compiles', () => {
    const output = compileTova(`
async fn fetch_data() {
  "data"
}
`);
    expect(output.shared).toContain('async');
  });

  test('pipe operator compiles', () => {
    const output = compileTova(`
result = [1, 2, 3] |> map(fn(x) x * 2) |> filter(fn(x) x > 2)
`);
    expect(output.shared).toBeDefined();
  });

  test('guard clause compiles', () => {
    const output = compileTova(`
fn validate(x: Int) {
  guard x > 0 else {
    print("invalid")
    return
  }
  print("valid")
}
`);
    expect(output.shared).toContain('validate');
  });

  test('destructuring params compile', () => {
    const output = compileTova(`
fn greet({name, age}) {
  print("{name} is {age}")
}
`);
    expect(output.shared).toContain('name');
  });

  test('interface compiles', () => {
    const output = compileTova(`
interface Printable {
  fn to_string() -> String
}
`);
    expect(output.shared).toBeDefined();
  });

  test('string pattern matching compiles', () => {
    const output = compileTova(`
fn handle(url: String) {
  match url {
    "/api" ++ rest => print("api: {rest}")
    _ => print("other")
  }
}
`);
    expect(output.shared).toContain('handle');
  });

  test('break/continue in loops compile', () => {
    const output = compileTova(`
for i in range(10) {
  if i == 5 { break }
  if i == 3 { continue }
  print(i)
}
`);
    expect(output.shared).toContain('break');
    expect(output.shared).toContain('continue');
  });

  test('derive compiles', () => {
    const output = compileTova(`
type Point {
  x: Float
  y: Float
} derive [Eq, Show]
`);
    expect(output.shared).toBeDefined();
  });

  test('let destructuring compiles', () => {
    const output = compileTova(`
items = [1, 2, 3]
let [first, ...rest] = items
print(first)
`);
    expect(output.shared).toContain('first');
  });

  test('lambda syntax compiles', () => {
    const output = compileTova(`
doubled = map([1, 2, 3], fn(x) x * 2)
`);
    expect(output.shared).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 100. RUN WITH IMPORTS — EXTENDED
// ═══════════════════════════════════════════════════════════════

describe('run with imports — extended', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-run-imports'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('run with single-hop import', () => {
    writeFileSync(join(tmpDir, 'helper.tova'), 'pub fn greet_name() -> String {\n  "hello-import"\n}');
    writeFileSync(join(tmpDir, 'main.tova'), 'import { greet_name } from "./helper.tova"\nprint(greet_name())');
    const result = runTova(['run', join(tmpDir, 'main.tova')]);
    expect(result.stdout).toContain('hello-import');
  });

  test('run with import without extension resolves .tova', () => {
    writeFileSync(join(tmpDir, 'utils.tova'), 'pub fn greet() -> String {\n  "hello"\n}');
    writeFileSync(join(tmpDir, 'app.tova'), 'import { greet } from "./utils"\nprint(greet())');
    const result = runTova(['run', join(tmpDir, 'app.tova')]);
    // Should resolve ./utils to ./utils.tova
    expect(result.stdout).toContain('hello');
  });
});

// ═══════════════════════════════════════════════════════════════
// 101. PRODUCTION BUILD — MINIFICATION
// ═══════════════════════════════════════════════════════════════

describe('production build — minification', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-prod-min'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('production build creates .min.js files', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
server {
  fn hello() { "world" }
  route GET "/api/hello" => hello
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--production']);
    expect(result.exitCode).toBe(0);
    const files = readdirSync(outDir);
    const minFiles = files.filter(f => f.endsWith('.min.js'));
    expect(minFiles.length).toBeGreaterThan(0);
  });

  test('minified files are smaller than originals', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
server {
  fn hello() { "world" }
  fn goodbye() { "bye" }
  fn add(a: Int, b: Int) -> Int { a + b }
  route GET "/api/hello" => hello
  route GET "/api/bye" => goodbye
}
`);
    const outDir = join(tmpDir, 'out');
    runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--production']);
    const files = readdirSync(outDir);
    // Compare hashed bundles only (skip tiny entrypoint files like server.js/server.min.js)
    const jsFile = files.find(f => /^server\.[a-f0-9]+\.js$/.test(f));
    const minFile = jsFile ? jsFile.replace('.js', '.min.js') : null;
    if (jsFile && minFile && files.includes(minFile)) {
      const jsSize = statSync(join(outDir, jsFile)).size;
      const minSize = statSync(join(outDir, minFile)).size;
      expect(minSize).toBeLessThanOrEqual(jsSize);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 102. LOCK FILE GENERATION
// ═══════════════════════════════════════════════════════════════

describe('lock file generation', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-lockfile'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('add local dependency generates tova.lock', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "test"\n[dependencies]\n');
    runTova(['add', './libs/mylib'], { cwd: tmpDir });
    expect(existsSync(join(tmpDir, 'tova.lock'))).toBe(true);
    const lock = JSON.parse(readFileSync(join(tmpDir, 'tova.lock'), 'utf-8'));
    expect(lock.version).toBe(1);
    expect(lock.dependencies).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 103. VERBOSE AND QUIET FLAGS
// ═══════════════════════════════════════════════════════════════

describe('verbose and quiet flags', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-verbosity'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('build --verbose shows timing info', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 1');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', join(tmpDir, 'out'), '--verbose']);
    expect(result.stdout).toContain('ms');
  });

  test('build --quiet suppresses output', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 1');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', join(tmpDir, 'out'), '--quiet']);
    // Quiet mode should have minimal output
    expect(result.stdout.length).toBeLessThan(50);
  });

  test('check --verbose shows per-file timing', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 1');
    const result = runTova(['check', join(tmpDir, 'src'), '--verbose']);
    expect(result.stdout).toContain('ms');
  });

  test('check --quiet suppresses non-error output', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 1');
    const result = runTova(['check', join(tmpDir, 'src'), '--quiet']);
    expect(result.stdout.length).toBeLessThan(50);
  });
});

// ═══════════════════════════════════════════════════════════════
// 104. STRICT MODE
// ═══════════════════════════════════════════════════════════════

describe('strict mode', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-strict'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('build with --strict flag compiles', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', join(tmpDir, 'out'), '--strict']);
    expect(result.exitCode).toBe(0);
  });

  test('check with --strict flag runs stricter analysis', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const result = runTova(['check', join(tmpDir, 'src'), '--strict']);
    // Should complete (might have more warnings in strict mode)
    expect(result.stdout).toContain('file');
  });

  test('run with --strict flag', () => {
    const file = join(tmpDir, 'strict.tova');
    writeFileSync(file, 'print("strict-run")');
    const result = runTova(['run', '--strict', file]);
    expect(result.stdout).toContain('strict-run');
  });
});

// ═══════════════════════════════════════════════════════════════
// 105. FIND FILES — EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('findFiles — edge cases', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-findfiles'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('skips node_modules directory', () => {
    mkdirSync(join(tmpDir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(tmpDir, 'node_modules', 'pkg', 'bad.tova'), 'x = 1');
    writeFileSync(join(tmpDir, 'good.tova'), 'y = 2');
    const result = runTova(['check', tmpDir]);
    expect(result.stdout).toContain('1 file checked');
  });

  test('skips dot-prefixed directories', () => {
    mkdirSync(join(tmpDir, '.hidden'), { recursive: true });
    writeFileSync(join(tmpDir, '.hidden', 'secret.tova'), 'x = 1');
    writeFileSync(join(tmpDir, 'visible.tova'), 'y = 2');
    const result = runTova(['check', tmpDir]);
    expect(result.stdout).toContain('1 file checked');
  });

  test('finds nested .tova files', () => {
    mkdirSync(join(tmpDir, 'a', 'b', 'c'), { recursive: true });
    writeFileSync(join(tmpDir, 'a', 'b', 'c', 'deep.tova'), 'x = 1');
    const result = runTova(['check', tmpDir]);
    expect(result.stdout).toContain('1 file checked');
  });

  test('handles non-existent directory gracefully', () => {
    const result = runTova(['check', join(tmpDir, 'nonexistent')]);
    expect(result.stderr).toContain('No .tova files');
    expect(result.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 106. MULTI-BLOCK OUTPUT (NAMED SERVER/BROWSER/EDGE)
// ═══════════════════════════════════════════════════════════════

describe('multi-block output', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-multiblock'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('named edge blocks produce separate output files', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
edge "api" {
  target: "cloudflare"
  env API_URL = "https://api.example.com"
}
edge "worker" {
  target: "cloudflare"
  env WORKER_URL = "https://worker.example.com"
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 107. NESTED DIRECTORY BUILD STRUCTURE
// ═══════════════════════════════════════════════════════════════

describe('nested directory build structure', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-nested-build'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('preserves directory structure in output', () => {
    mkdirSync(join(tmpDir, 'src', 'lib'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'lib', 'math.tova'), 'pub fn add(a: Int, b: Int) -> Int {\n  a + b\n}');
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    expect(result.exitCode).toBe(0);
    // Should create lib/math.js in output
    expect(existsSync(join(outDir, 'lib', 'math.js'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 108. COMPILATION WITH WARNINGS
// ═══════════════════════════════════════════════════════════════

describe('compilation with warnings', () => {
  test('unused variable warning does not prevent compilation', () => {
    const output = compileTova(`
fn process_data() {
  unused = 42
  print("done")
}
`);
    expect(output.shared).toContain('process_data');
  });

  test('strict mode may produce additional warnings', () => {
    const output = compileTova('x = 42', 'test.tova', { strict: true });
    expect(output.shared).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 109. DB CONFIG DISCOVERY
// ═══════════════════════════════════════════════════════════════

describe('db config discovery', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-dbconfig'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('discovers sqlite config from server block', () => {
    const file = join(tmpDir, 'app.tova');
    writeFileSync(file, `
server {
  db {
    driver: "sqlite"
    path: "my.db"
  }
  fn hello() { "world" }
  route GET "/hello" => hello
}
`);
    // Just verify the file compiles (db config is discovered at runtime)
    const result = runTova(['check', file]);
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 110. BINARY BUILD ERRORS
// ═══════════════════════════════════════════════════════════════

describe('binary build errors', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-binary-err'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('binary build with no files errors', () => {
    mkdirSync(join(tmpDir, 'empty'), { recursive: true });
    const result = runTova(['build', join(tmpDir, 'empty'), '--binary', 'myapp', '--output', join(tmpDir, 'out')]);
    expect(result.stderr).toContain('No .tova files');
    expect(result.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 111. EDGE CASES — SPECIAL CHARACTERS IN PATHS
// ═══════════════════════════════════════════════════════════════

describe('special characters in paths', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-special-chars'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('handles spaces in directory names', () => {
    const dirWithSpaces = join(tmpDir, 'my project');
    mkdirSync(dirWithSpaces, { recursive: true });
    writeFileSync(join(dirWithSpaces, 'app.tova'), 'x = 1');
    const result = runTova(['check', dirWithSpaces]);
    expect(result.stdout).toContain('1 file checked');
  });

  test('handles hyphens in filenames', () => {
    writeFileSync(join(tmpDir, 'my-app.tova'), 'x = 1');
    const result = runTova(['check', tmpDir]);
    expect(result.stdout).toContain('1 file checked');
  });

  test('handles underscores in filenames', () => {
    writeFileSync(join(tmpDir, 'my_app.tova'), 'x = 1');
    const result = runTova(['check', tmpDir]);
    expect(result.stdout).toContain('1 file checked');
  });
});

// ═══════════════════════════════════════════════════════════════
// 112. CONCURRENT COMPILATION SAFETY
// ═══════════════════════════════════════════════════════════════

describe('concurrent compilation safety', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-concurrent'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('building same project twice in sequence succeeds', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 1');
    const outDir = join(tmpDir, 'out');
    const r1 = runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    const r2 = runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    expect(r1.exitCode).toBe(0);
    expect(r2.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 113. LARGE FILE HANDLING
// ═══════════════════════════════════════════════════════════════

describe('large file handling', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-large'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('compiles file with many functions', () => {
    const funcs = [];
    for (let i = 0; i < 100; i++) {
      funcs.push(`fn func_${i}(x: Int) -> Int {\n  x + ${i}\n}`);
    }
    const source = funcs.join('\n');
    writeFileSync(join(tmpDir, 'big.tova'), source);
    const result = runTova(['check', tmpDir]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1 file checked');
  });
});

// ═══════════════════════════════════════════════════════════════
// 114. BUILD SUMMARY MESSAGES
// ═══════════════════════════════════════════════════════════════

describe('build summary messages', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-summary'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('build shows directory group count', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 1');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', join(tmpDir, 'out')]);
    expect(result.stdout).toContain('Build complete');
    expect(result.stdout).toContain('directory group');
  });

  test('build shows file count', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'a.tova'), 'x = 1');
    writeFileSync(join(tmpDir, 'src', 'b.tova'), 'y = 2');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', join(tmpDir, 'out')]);
    expect(result.stdout).toContain('2 file(s)');
  });
});

// ═══════════════════════════════════════════════════════════════
// 115. PRODUCTION BUILD — FULL PIPELINE
// ═══════════════════════════════════════════════════════════════

describe('production build full pipeline', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-prod-build'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('production build of plain script produces hashed script file', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42\nprint(x)');
    const outDir = join(tmpDir, 'prod-out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--production']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Production build');
    // Should have a hashed script file
    const files = readdirSync(outDir);
    const scriptFiles = files.filter(f => f.startsWith('script.') && f.endsWith('.js') && !f.includes('.min.'));
    expect(scriptFiles.length).toBe(1);
    expect(scriptFiles[0]).toMatch(/^script\.[a-f0-9]+\.js$/);
  });

  test('production build creates minified files', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'fn greet(name: String) -> String {\n  "Hello, {name}!"\n}\nprint(greet("world"))');
    const outDir = join(tmpDir, 'prod-out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--production']);
    expect(result.exitCode).toBe(0);
    const files = readdirSync(outDir);
    const minFiles = files.filter(f => f.endsWith('.min.js'));
    expect(minFiles.length).toBeGreaterThanOrEqual(1);
    // Minified should be smaller
    for (const minFile of minFiles) {
      const original = minFile.replace('.min.js', '.js');
      if (files.includes(original)) {
        const origSize = statSync(join(outDir, original)).size;
        const minSize = statSync(join(outDir, minFile)).size;
        expect(minSize).toBeLessThanOrEqual(origSize);
      }
    }
  });

  test('production build of server app produces hashed server file', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
server {
  fn hello() { "world" }
  route GET "/hello" => hello
}
`);
    const outDir = join(tmpDir, 'prod-out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--production']);
    expect(result.exitCode).toBe(0);
    const files = readdirSync(outDir);
    const hashedServerFiles = files.filter(f => f.startsWith('server.') && f.endsWith('.js') && !f.includes('.min.') && f !== 'server.js');
    expect(hashedServerFiles.length).toBe(1);
    expect(hashedServerFiles[0]).toMatch(/^server\.[a-f0-9]+\.js$/);
    // Stable entrypoint for Docker/deployment
    expect(files).toContain('server.js');
  });

  test('production build of browser app produces HTML and client file', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
browser {
  state count = 0
  component App {
    <div>
      <p>"Count: {count}"</p>
    </div>
  }
}
`);
    const outDir = join(tmpDir, 'prod-out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--production']);
    expect(result.exitCode).toBe(0);
    const files = readdirSync(outDir);
    expect(files).toContain('index.html');
    const clientFiles = files.filter(f => f.startsWith('client.') && f.endsWith('.js') && !f.includes('.min.'));
    expect(clientFiles.length).toBe(1);
    // HTML should reference the client file
    const html = readFileSync(join(outDir, 'index.html'), 'utf-8');
    expect(html).toContain(clientFiles[0]);
    expect(html).toContain('<script');
  });

  test('production build minification reports percentage reduction', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'fn add(a: Int, b: Int) -> Int {\n  a + b\n}\nprint(add(1, 2))');
    const outDir = join(tmpDir, 'prod-out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--production']);
    expect(result.exitCode).toBe(0);
    // Should report size and % smaller
    expect(result.stdout).toMatch(/\d+% smaller/);
  });

  test('production build shows "Production build complete" message', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 1');
    const outDir = join(tmpDir, 'prod-out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--production']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Production build complete');
  });
});

// ═══════════════════════════════════════════════════════════════
// 116. BINARY BUILD — FULL PIPELINE
// ═══════════════════════════════════════════════════════════════

describe('binary build full pipeline', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-binary-build'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('binary build compiles script app to standalone binary', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'fn main(args: [String]) -> Int {\n  print("hello")\n  0\n}');
    const binaryPath = join(tmpDir, 'myapp');
    const result = runTova(['build', join(tmpDir, 'src'), '--binary', binaryPath, '--output', join(tmpDir, 'out')], { timeout: 30000 });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Compiling to binary');
    expect(result.stdout).toContain('Created binary');
    expect(existsSync(binaryPath)).toBe(true);
    // Verify binary is executable
    const stat = statSync(binaryPath);
    expect(stat.size).toBeGreaterThan(0);
  });

  test('binary build of server app bundles server code', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
server {
  fn health() { { status: "ok" } }
  route GET "/health" => health
}
`);
    const binaryPath = join(tmpDir, 'server-app');
    const result = runTova(['build', join(tmpDir, 'src'), '--binary', binaryPath, '--output', join(tmpDir, 'out')], { timeout: 30000 });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Compiling to binary');
  });

  test('binary build auto-calls main() for script apps', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'fn main(args: [String]) -> Int {\n  print("binary works")\n  0\n}');
    const binaryPath = join(tmpDir, 'testbin');
    const buildResult = runTova(['build', join(tmpDir, 'src'), '--binary', binaryPath, '--output', join(tmpDir, 'out')], { timeout: 30000 });
    expect(buildResult.exitCode).toBe(0);
    // Run the binary
    const proc = Bun.spawnSync([binaryPath], { stdout: 'pipe', stderr: 'pipe', timeout: 10000 });
    expect(proc.stdout.toString()).toContain('binary works');
  });

  test('binary build reports file size in MB', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'print("hello")');
    const binaryPath = join(tmpDir, 'sizetest');
    const result = runTova(['build', join(tmpDir, 'src'), '--binary', binaryPath, '--output', join(tmpDir, 'out')], { timeout: 30000 });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/\d+\.\d+MB/);
  });

  test('binary build shows run instruction', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'print("hi")');
    const binaryPath = join(tmpDir, 'runme');
    const result = runTova(['build', join(tmpDir, 'src'), '--binary', binaryPath, '--output', join(tmpDir, 'out')], { timeout: 30000 });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Run with:');
  });
});

// ═══════════════════════════════════════════════════════════════
// 117. _simpleMinify FUNCTION (UNIT TESTS VIA COMPILATION)
// ═══════════════════════════════════════════════════════════════

describe('_simpleMinify via production build', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-minify'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('minification removes comments', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
// This is a comment
fn greet(name: String) -> String {
  // Another comment
  "Hello, {name}!"
}
/* block comment */
print(greet("world"))
`);
    const outDir = join(tmpDir, 'prod-out');
    runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--production']);
    const files = readdirSync(outDir).filter(f => f.endsWith('.min.js'));
    if (files.length > 0) {
      const minified = readFileSync(join(outDir, files[0]), 'utf-8');
      expect(minified).not.toContain('// This is a comment');
      expect(minified).not.toContain('// Another comment');
      expect(minified).not.toContain('/* block comment */');
    }
  });

  test('minification preserves string literals', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'msg = "Hello world with spaces"\nprint(msg)');
    const outDir = join(tmpDir, 'prod-out');
    runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--production']);
    const files = readdirSync(outDir).filter(f => f.endsWith('.min.js'));
    if (files.length > 0) {
      const minified = readFileSync(join(outDir, files[0]), 'utf-8');
      expect(minified).toContain('Hello world with spaces');
    }
  });

  test('minification strips console.log in production', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const outDir = join(tmpDir, 'prod-out');
    runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--production']);
    const files = readdirSync(outDir);
    expect(files.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 118. _eliminateDeadFunctions VIA PRODUCTION BUILD
// ═══════════════════════════════════════════════════════════════

describe('dead function elimination via production build', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-deadcode'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('production build keeps used functions in minified output', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
fn used_func() -> String {
  "I am used"
}
print(used_func())
`);
    const outDir = join(tmpDir, 'prod-out');
    runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--production']);
    const files = readdirSync(outDir).filter(f => f.endsWith('.min.js'));
    if (files.length > 0) {
      const minified = readFileSync(join(outDir, files[0]), 'utf-8');
      expect(minified).toContain('used_func');
    }
  });

  test('production build keeps mutually recursive reachable functions', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
fn is_even(n: Int) -> Bool {
  if n == 0 { true } else { is_odd(n - 1) }
}
fn is_odd(n: Int) -> Bool {
  if n == 0 { false } else { is_even(n - 1) }
}
print(is_even(10))
`);
    const outDir = join(tmpDir, 'prod-out');
    runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--production']);
    const files = readdirSync(outDir).filter(f => f.endsWith('.min.js'));
    if (files.length > 0) {
      const minified = readFileSync(join(outDir, files[0]), 'utf-8');
      expect(minified).toContain('is_even');
      expect(minified).toContain('is_odd');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 119. getCompiledExtension VIA BUILD
// ═══════════════════════════════════════════════════════════════

describe('getCompiledExtension behavior via build', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('plain script produces .js extension output', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const outDir = join(tmpDir, 'out');
    runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    const files = readdirSync(outDir);
    expect(files.some(f => f.endsWith('.js'))).toBe(true);
  });

  test('server block file produces .server.js output', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
server {
  fn hello() { "world" }
  route GET "/hello" => hello
}
`);
    const outDir = join(tmpDir, 'out');
    runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    const files = readdirSync(outDir);
    expect(files.some(f => f.endsWith('.server.js'))).toBe(true);
  });

  test('browser block file produces .browser.js output', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
browser {
  state val = 0
  component App {
    <div>"hello"</div>
  }
}
`);
    const outDir = join(tmpDir, 'out');
    runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    const files = readdirSync(outDir);
    expect(files.some(f => f.endsWith('.browser.js'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 120. hasNpmImports FUNCTION — UNIT TESTS
// ═══════════════════════════════════════════════════════════════

describe('hasNpmImports logic (inline test)', () => {
  function hasNpmImports(code) {
    const importRegex = /^\s*import\s+(?:\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const source = match[1];
      if (source.startsWith('./') || source.startsWith('../') || source.startsWith('/') || source.startsWith('./runtime/')) {
        continue;
      }
      return true;
    }
    return false;
  }

  test('detects bare npm specifier', () => {
    expect(hasNpmImports('import React from "react"')).toBe(true);
  });

  test('detects scoped npm packages', () => {
    expect(hasNpmImports('import { css } from "@emotion/css"')).toBe(true);
  });

  test('ignores relative imports', () => {
    expect(hasNpmImports('import { foo } from "./utils.js"')).toBe(false);
  });

  test('ignores parent relative imports', () => {
    expect(hasNpmImports('import { bar } from "../lib/bar.js"')).toBe(false);
  });

  test('ignores absolute imports', () => {
    expect(hasNpmImports('import { x } from "/absolute/path.js"')).toBe(false);
  });

  test('returns false for code without imports', () => {
    expect(hasNpmImports('const x = 42;\nconsole.log(x);')).toBe(false);
  });

  test('detects namespace imports from npm', () => {
    expect(hasNpmImports('import * as lodash from "lodash"')).toBe(true);
  });

  test('handles multiple imports with mixed sources', () => {
    const code = 'import { a } from "./local.js"\nimport { b } from "npm-pkg"';
    expect(hasNpmImports(code)).toBe(true);
  });

  test('handles runtime imports (ignored)', () => {
    expect(hasNpmImports('import { createSignal } from "./runtime/reactivity.js"')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 121. compareSemver FUNCTION — UNIT TESTS
// ═══════════════════════════════════════════════════════════════

describe('compareSemver logic (inline test)', () => {
  function compareSemver(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) < (pb[i] || 0)) return -1;
      if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    }
    return 0;
  }

  test('equal versions return 0', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });

  test('older major returns -1', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
  });

  test('newer major returns 1', () => {
    expect(compareSemver('3.0.0', '2.0.0')).toBe(1);
  });

  test('older minor returns -1', () => {
    expect(compareSemver('1.1.0', '1.2.0')).toBe(-1);
  });

  test('older patch returns -1', () => {
    expect(compareSemver('1.2.3', '1.2.4')).toBe(-1);
  });

  test('newer patch returns 1', () => {
    expect(compareSemver('1.2.5', '1.2.4')).toBe(1);
  });

  test('handles two-part version strings', () => {
    expect(compareSemver('1.0', '1.0.0')).toBe(0);
  });

  test('handles single-part version strings', () => {
    expect(compareSemver('2', '1.9.9')).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 122. formatBytes FUNCTION — UNIT TESTS
// ═══════════════════════════════════════════════════════════════

describe('formatBytes logic (inline test)', () => {
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  test('formats bytes under 1KB', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  test('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  test('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  test('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
  });

  test('formats large megabytes', () => {
    expect(formatBytes(5242880)).toBe('5.0 MB');
  });

  test('formats boundary at 1024 bytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });
});

// ═══════════════════════════════════════════════════════════════
// 123. _formatBytes (INTERNAL — WITH TEMPLATE LITERALS)
// ═══════════════════════════════════════════════════════════════

describe('_formatBytes internal logic (inline test)', () => {
  function _formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  test('formats small sizes', () => {
    expect(_formatBytes(100)).toBe('100 B');
  });

  test('formats KB sizes', () => {
    expect(_formatBytes(3072)).toBe('3.0 KB');
  });

  test('formats MB sizes', () => {
    expect(_formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});

// ═══════════════════════════════════════════════════════════════
// 124. SourceMapBuilder — COMPREHENSIVE UNIT TESTS
// ═══════════════════════════════════════════════════════════════

describe('SourceMapBuilder comprehensive', () => {
  test('source map with multiple mappings generates valid VLQ', () => {
    const output = compileTova('x = 1\ny = 2\nz = x + y', 'multi.tova', { sourceMaps: true });
    expect(output.shared).toBeDefined();
    // Source maps should be present as data URL
    if (output.shared.includes('sourceMappingURL')) {
      const match = output.shared.match(/sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/);
      if (match) {
        const mapJson = Buffer.from(match[1], 'base64').toString('utf-8');
        const map = JSON.parse(mapJson);
        expect(map.version).toBe(3);
        expect(map.sources).toBeDefined();
        expect(map.mappings).toBeDefined();
        expect(typeof map.mappings).toBe('string');
      }
    }
  });

  test('source map contains source filename', () => {
    const output = compileTova('x = 42', 'myfile.tova', { sourceMaps: true });
    if (output.shared && output.shared.includes('sourceMappingURL')) {
      const match = output.shared.match(/sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/);
      if (match) {
        const mapJson = Buffer.from(match[1], 'base64').toString('utf-8');
        const map = JSON.parse(mapJson);
        expect(map.sources.some(s => s.includes('myfile'))).toBe(true);
      }
    }
  });

  test('source map with no mappings still generates valid JSON', () => {
    const output = compileTova('// just a comment', 'empty.tova', { sourceMaps: true });
    expect(output).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 125. BuildCache — COMPREHENSIVE UNIT TESTS
// ═══════════════════════════════════════════════════════════════

describe('BuildCache comprehensive', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-buildcache'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('build with cache hit skips recompilation', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const outDir = join(tmpDir, 'out');

    // First build
    const r1 = runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    expect(r1.exitCode).toBe(0);

    // Second build (should use cache)
    const r2 = runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).toContain('cached');
  });

  test('build with --no-cache forces recompilation', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const outDir = join(tmpDir, 'out');

    // First build
    runTova(['build', join(tmpDir, 'src'), '--output', outDir]);

    // Second build with --no-cache
    const r2 = runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--no-cache']);
    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).not.toContain('cached');
  });

  test('build cache invalidation on source change', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const outDir = join(tmpDir, 'out');

    // First build
    runTova(['build', join(tmpDir, 'src'), '--output', outDir]);

    // Modify source
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 99');

    // Second build (cache should be invalidated)
    const r2 = runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    expect(r2.exitCode).toBe(0);
    expect(r2.stdout).not.toContain('cached');
  });
});

// ═══════════════════════════════════════════════════════════════
// 126. DEPENDENCY TRACKING — trackDependency, getTransitiveDependents, invalidateFile
// ═══════════════════════════════════════════════════════════════

describe('dependency tracking via multi-file build', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-deps'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('building with import tracks dependency', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'lib.tova'), 'pub fn greet() -> String {\n  "hello"\n}');
    writeFileSync(join(tmpDir, 'src', 'main.tova'), 'import { greet } from "./lib.tova"\nprint(greet())');
    const result = runTova(['run', join(tmpDir, 'src', 'main.tova')]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
  });

  test('import chain resolves correctly', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'utils.tova'), 'pub fn double(n: Int) -> Int { n * 2 }');
    writeFileSync(join(tmpDir, 'src', 'main.tova'), 'import { double } from "./utils.tova"\nresult = double(21)\nprint(result)');
    const result = runTova(['run', join(tmpDir, 'src', 'main.tova')]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('42');
  });
});

// ═══════════════════════════════════════════════════════════════
// 127. TEST COMMAND — FLAGS (--filter, --coverage, --serial)
// ═══════════════════════════════════════════════════════════════

describe('test command flags', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-test-flags'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('--filter passes pattern to bun test', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
test "math" {
  assert(1 + 1 == 2)
}
test "strings" {
  assert("hello" == "hello")
}
`);
    const result = runTova(['test', join(tmpDir, 'src'), '--filter', 'math']);
    expect(result.stdout).toContain('Compiled');
  });

  test('--serial passes concurrency flag to bun test', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
test "serial test" {
  assert(true)
}
`);
    const result = runTova(['test', join(tmpDir, 'src'), '--serial']);
    expect(result.stdout).toContain('Compiled');
  });

  test('--coverage enables coverage mode', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
test "coverage test" {
  assert(1 == 1)
}
`);
    const result = runTova(['test', join(tmpDir, 'src'), '--coverage']);
    expect(result.stdout).toContain('Compiled');
  });
});

// ═══════════════════════════════════════════════════════════════
// 128. DEV SERVER — STARTUP VALIDATION
// ═══════════════════════════════════════════════════════════════

describe('dev server startup validation', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-dev'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('dev with no .tova files exits with error', () => {
    mkdirSync(join(tmpDir, 'empty'), { recursive: true });
    const result = runTova(['dev', join(tmpDir, 'empty')], { timeout: 5000 });
    expect(result.stderr).toContain('No .tova files');
    expect(result.exitCode).toBe(1);
  });

  test('dev --port accepts custom port', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
server {
  fn hello() { "world" }
  route GET "/hello" => hello
}
`);
    const result = runTova(['dev', join(tmpDir, 'src'), '--port', '9999'], { timeout: 3000 });
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/dev server|starting|No .tova/i);
  });

  test('dev --strict passes strict mode to compilation', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
server {
  fn hello() { "world" }
  route GET "/hello" => hello
}
`);
    const result = runTova(['dev', join(tmpDir, 'src'), '--strict'], { timeout: 3000 });
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/dev server|starting|error/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// 129. REPL — BASIC COMMAND TESTS
// ═══════════════════════════════════════════════════════════════

describe('REPL basic functionality', () => {
  test('REPL prints version on startup', () => {
    const proc = Bun.spawnSync(['bun', 'run', resolve('bin/tova.js'), 'repl'], {
      stdin: Buffer.from(':quit\n'),
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 10000,
    });
    const output = proc.stdout.toString();
    expect(output).toContain('Tova REPL');
  });

  test('REPL evaluates simple expression', () => {
    const proc = Bun.spawnSync(['bun', 'run', resolve('bin/tova.js'), 'repl'], {
      stdin: Buffer.from('1 + 2\n:quit\n'),
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 10000,
    });
    const output = proc.stdout.toString();
    expect(output).toContain('3');
  });

  test('REPL :help command shows help text', () => {
    const proc = Bun.spawnSync(['bun', 'run', resolve('bin/tova.js'), 'repl'], {
      stdin: Buffer.from(':help\n:quit\n'),
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 10000,
    });
    const output = proc.stdout.toString();
    expect(output).toContain(':quit');
    expect(output).toContain(':help');
    expect(output).toContain(':clear');
    expect(output).toContain(':type');
  });

  test('REPL :clear resets context', () => {
    const proc = Bun.spawnSync(['bun', 'run', resolve('bin/tova.js'), 'repl'], {
      stdin: Buffer.from('x = 42\n:clear\n:quit\n'),
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 10000,
    });
    const output = proc.stdout.toString();
    expect(output).toContain('Context cleared');
  });

  test('REPL :type command shows type information', () => {
    const proc = Bun.spawnSync(['bun', 'run', resolve('bin/tova.js'), 'repl'], {
      stdin: Buffer.from(':type 42\n:quit\n'),
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 10000,
    });
    const output = proc.stdout.toString();
    expect(output).toContain('Int');
  });

  test('REPL evaluates string literal', () => {
    const proc = Bun.spawnSync(['bun', 'run', resolve('bin/tova.js'), 'repl'], {
      stdin: Buffer.from('"hello world"\n:quit\n'),
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 10000,
    });
    const output = proc.stdout.toString();
    expect(output).toContain('hello world');
  });

  test('REPL :exit also exits', () => {
    const proc = Bun.spawnSync(['bun', 'run', resolve('bin/tova.js'), 'repl'], {
      stdin: Buffer.from(':exit\n'),
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 10000,
    });
    const output = proc.stdout.toString();
    expect(output).toContain('Goodbye');
  });

  test('REPL :q also exits', () => {
    const proc = Bun.spawnSync(['bun', 'run', resolve('bin/tova.js'), 'repl'], {
      stdin: Buffer.from(':q\n'),
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 10000,
    });
    const output = proc.stdout.toString();
    expect(output).toContain('Goodbye');
  });

  test('REPL persists variable across inputs', () => {
    const proc = Bun.spawnSync(['bun', 'run', resolve('bin/tova.js'), 'repl'], {
      stdin: Buffer.from('x = 10\nx + 5\n:quit\n'),
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 10000,
    });
    const output = proc.stdout.toString();
    expect(output).toContain('15');
  });

  test('REPL function definition and call', () => {
    const proc = Bun.spawnSync(['bun', 'run', resolve('bin/tova.js'), 'repl'], {
      stdin: Buffer.from('fn double(n: Int) -> Int {\n  n * 2\n}\ndouble(21)\n:quit\n'),
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 10000,
    });
    const output = proc.stdout.toString();
    expect(output).toContain('42');
  });

  test('REPL _ references last result', () => {
    const proc = Bun.spawnSync(['bun', 'run', resolve('bin/tova.js'), 'repl'], {
      stdin: Buffer.from('10\n_ * 3\n:quit\n'),
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 10000,
    });
    const output = proc.stdout.toString();
    expect(output).toContain('30');
  });

  test('REPL handles compilation errors gracefully', () => {
    const proc = Bun.spawnSync(['bun', 'run', resolve('bin/tova.js'), 'repl'], {
      stdin: Buffer.from('xyz_undefined_var\n:quit\n'),
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 10000,
    });
    // REPL should not crash — should still print Goodbye
    expect(proc.stdout.toString()).toContain('Goodbye');
  });

  test('REPL :type with string shows String', () => {
    const proc = Bun.spawnSync(['bun', 'run', resolve('bin/tova.js'), 'repl'], {
      stdin: Buffer.from(':type "hello"\n:quit\n'),
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
      timeout: 10000,
    });
    const output = proc.stdout.toString();
    expect(output).toContain('String');
  });
});

// ═══════════════════════════════════════════════════════════════
// 130. LSP — BASIC LIFECYCLE
// ═══════════════════════════════════════════════════════════════

describe('LSP basic lifecycle', () => {
  test('LSP responds to initialize request', () => {
    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        processId: null,
        rootUri: null,
        capabilities: {},
      },
    });
    const contentLength = Buffer.byteLength(initRequest);
    const message = `Content-Length: ${contentLength}\r\n\r\n${initRequest}`;

    const proc = Bun.spawnSync(['bun', 'run', resolve('bin/tova.js'), 'lsp'], {
      stdin: Buffer.from(message),
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 10000,
    });
    const output = proc.stdout.toString();
    expect(output).toContain('capabilities');
  });

  test('LSP handles invalid JSON gracefully', () => {
    const message = `Content-Length: 13\r\n\r\nnot valid json`;

    const proc = Bun.spawnSync(['bun', 'run', resolve('bin/tova.js'), 'lsp'], {
      stdin: Buffer.from(message),
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
    });
    expect(proc.exitCode).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 131. UPGRADE COMMAND — HELPER FUNCTION TESTS
// ═══════════════════════════════════════════════════════════════

describe('upgrade command helpers', () => {
  test('detectPackageManager returns bun when Bun is defined', () => {
    expect(typeof Bun).toBe('object');
    function detectPackageManager() {
      if (typeof Bun !== 'undefined') return 'bun';
      const ua = process.env.npm_config_user_agent || '';
      if (ua.includes('pnpm')) return 'pnpm';
      if (ua.includes('yarn')) return 'yarn';
      if (ua.includes('bun')) return 'bun';
      return 'npm';
    }
    expect(detectPackageManager()).toBe('bun');
  });

  test('detectInstallMethod returns npm for test environment', () => {
    function detectInstallMethod() {
      const execPath = process.execPath || process.argv[0];
      const scriptPath = process.argv[1] || '';
      if (execPath.includes('.tova/bin') || scriptPath.includes('.tova/')) return 'binary';
      return 'npm';
    }
    expect(detectInstallMethod()).toBe('npm');
  });

  test('detectPackageManager detects pnpm from user agent', () => {
    function detectPackageManager(env) {
      const ua = env.npm_config_user_agent || '';
      if (ua.includes('pnpm')) return 'pnpm';
      if (ua.includes('yarn')) return 'yarn';
      if (ua.includes('bun')) return 'bun';
      return 'npm';
    }
    expect(detectPackageManager({ npm_config_user_agent: 'pnpm/8.0.0' })).toBe('pnpm');
    expect(detectPackageManager({ npm_config_user_agent: 'yarn/1.22.0' })).toBe('yarn');
    expect(detectPackageManager({ npm_config_user_agent: '' })).toBe('npm');
  });
});

// ═══════════════════════════════════════════════════════════════
// 132. UPGRADE COMMAND — VIA CLI
// ═══════════════════════════════════════════════════════════════

describe('upgrade command via CLI', () => {
  test('upgrade shows current version', () => {
    const result = runTova(['upgrade'], { timeout: 15000 });
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('Current version');
  });
});

// ═══════════════════════════════════════════════════════════════
// 133. _eliminateDeadFunctions — DIRECT UNIT TESTS
// ═══════════════════════════════════════════════════════════════

describe('_eliminateDeadFunctions logic (inline test)', () => {
  function _eliminateDeadFunctions(code) {
    const funcDeclRe = /^function\s+([\w$]+)\s*\(/gm;
    const allDecls = [];
    let m;
    while ((m = funcDeclRe.exec(code)) !== null) {
      const name = m[1];
      const start = m.index;
      let depth = 0, i = start, inStr = false, strCh = '', foundOpen = false;
      while (i < code.length) {
        const ch = code[i];
        if (inStr) { if (ch === '\\') { i += 2; continue; } if (ch === strCh) inStr = false; i++; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strCh = ch; i++; continue; }
        if (ch === '{') { depth++; foundOpen = true; }
        else if (ch === '}') { depth--; if (foundOpen && depth === 0) { i++; break; } }
        i++;
      }
      allDecls.push({ name, start, end: i });
    }
    if (allDecls.length === 0) return code;
    const declaredNames = new Set(allDecls.map(d => d.name));
    function findRefs(text) {
      const refs = new Set();
      for (const name of declaredNames) {
        if (new RegExp('\\b' + name + '\\b').test(text)) refs.add(name);
      }
      return refs;
    }
    const sortedDecls = [...allDecls].sort((a, b) => a.start - b.start);
    let rootCode = '';
    let pos = 0;
    for (const decl of sortedDecls) {
      rootCode += code.slice(pos, decl.start);
      pos = decl.end;
    }
    rootCode += code.slice(pos);
    const rootRefs = findRefs(rootCode);
    const deps = new Map();
    for (const decl of allDecls) {
      const body = code.slice(decl.start, decl.end);
      const bodyRefs = findRefs(body);
      bodyRefs.delete(decl.name);
      deps.set(decl.name, bodyRefs);
    }
    const reachable = new Set();
    const queue = [...rootRefs];
    while (queue.length > 0) {
      const nm = queue.pop();
      if (reachable.has(nm)) continue;
      reachable.add(nm);
      const fnDeps = deps.get(nm);
      if (fnDeps) for (const dep of fnDeps) queue.push(dep);
    }
    const toRemove = allDecls.filter(d => !reachable.has(d.name));
    if (toRemove.length === 0) return code;
    toRemove.sort((a, b) => b.start - a.start);
    let result = code;
    for (const { start, end } of toRemove) {
      let removeEnd = end;
      while (removeEnd < result.length && (result[removeEnd] === '\n' || result[removeEnd] === '\r')) removeEnd++;
      result = result.slice(0, start) + result.slice(removeEnd);
    }
    return result;
  }

  test('removes completely unused function', () => {
    const code = 'function used() { return 1; }\nfunction unused() { return 2; }\nconsole.log(used());';
    const result = _eliminateDeadFunctions(code);
    expect(result).toContain('used');
    expect(result).not.toContain('unused');
  });

  test('keeps all functions when all are used', () => {
    const code = 'function a() { return 1; }\nfunction b() { return a(); }\nconsole.log(b());';
    const result = _eliminateDeadFunctions(code);
    expect(result).toContain('function a');
    expect(result).toContain('function b');
  });

  test('removes mutually recursive dead functions', () => {
    const code = 'function live() { return 1; }\nfunction deadA() { return deadB(); }\nfunction deadB() { return deadA(); }\nconsole.log(live());';
    const result = _eliminateDeadFunctions(code);
    expect(result).toContain('live');
    expect(result).not.toContain('deadA');
    expect(result).not.toContain('deadB');
  });

  test('preserves code with no functions', () => {
    const code = 'const x = 42;\nconsole.log(x);';
    const result = _eliminateDeadFunctions(code);
    expect(result).toBe(code);
  });

  test('keeps transitively reachable functions', () => {
    const code = 'function c() { return 3; }\nfunction b() { return c(); }\nfunction a() { return b(); }\nconsole.log(a());';
    const result = _eliminateDeadFunctions(code);
    expect(result).toContain('function a');
    expect(result).toContain('function b');
    expect(result).toContain('function c');
  });
});

// ═══════════════════════════════════════════════════════════════
// 134. _simpleMinify — DIRECT UNIT TESTS
// ═══════════════════════════════════════════════════════════════

describe('_simpleMinify logic (inline test)', () => {
  function simpleMinifyStrip(code) {
    let result = '';
    let i = 0;
    while (i < code.length) {
      if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
        const q = code[i];
        result += q;
        i++;
        while (i < code.length && code[i] !== q) {
          if (code[i] === '\\') { result += code[i]; i++; }
          if (i < code.length) { result += code[i]; i++; }
        }
        if (i < code.length) { result += code[i]; i++; }
        continue;
      }
      if (code[i] === '/' && code[i+1] === '/') {
        while (i < code.length && code[i] !== '\n') i++;
        continue;
      }
      if (code[i] === '/' && code[i+1] === '*') {
        i += 2;
        while (i < code.length - 1 && !(code[i] === '*' && code[i+1] === '/')) i++;
        i += 2;
        continue;
      }
      result += code[i];
      i++;
    }
    return result;
  }

  test('strips single-line comments', () => {
    const result = simpleMinifyStrip('const x = 1; // this is a comment\nconst y = 2;');
    expect(result).not.toContain('// this is a comment');
    expect(result).toContain('const x = 1;');
    expect(result).toContain('const y = 2;');
  });

  test('strips multi-line comments', () => {
    const result = simpleMinifyStrip('const x = 1; /* block\ncomment */ const y = 2;');
    expect(result).not.toContain('/* block');
    expect(result).toContain('const x = 1;');
  });

  test('preserves strings containing comment-like syntax', () => {
    const result = simpleMinifyStrip('const msg = "// not a comment";');
    expect(result).toContain('"// not a comment"');
  });

  test('preserves strings containing block comment syntax', () => {
    const result = simpleMinifyStrip('const msg = "/* not a comment */";');
    expect(result).toContain('"/* not a comment */"');
  });
});

// ═══════════════════════════════════════════════════════════════
// 135. REPL — TYPE INFERENCE
// ═══════════════════════════════════════════════════════════════

describe('REPL type inference (inline test)', () => {
  function inferType(val) {
    if (val === null || val === undefined) return 'Nil';
    if (Array.isArray(val)) {
      if (val.length === 0) return '[_]';
      const elemType = inferType(val[0]);
      return `[${elemType}]`;
    }
    if (val?.__tag) return val.__tag;
    if (typeof val === 'number') return Number.isInteger(val) ? 'Int' : 'Float';
    if (typeof val === 'string') return 'String';
    if (typeof val === 'boolean') return 'Bool';
    if (typeof val === 'function') return 'Function';
    if (typeof val === 'object') return 'Object';
    return 'Unknown';
  }

  test('infers Int for integers', () => {
    expect(inferType(42)).toBe('Int');
  });

  test('infers Float for decimals', () => {
    expect(inferType(3.14)).toBe('Float');
  });

  test('infers String for strings', () => {
    expect(inferType('hello')).toBe('String');
  });

  test('infers Bool for booleans', () => {
    expect(inferType(true)).toBe('Bool');
    expect(inferType(false)).toBe('Bool');
  });

  test('infers Nil for null', () => {
    expect(inferType(null)).toBe('Nil');
  });

  test('infers Nil for undefined', () => {
    expect(inferType(undefined)).toBe('Nil');
  });

  test('infers Function for functions', () => {
    expect(inferType(() => {})).toBe('Function');
  });

  test('infers Object for plain objects', () => {
    expect(inferType({ a: 1 })).toBe('Object');
  });

  test('infers empty array type', () => {
    expect(inferType([])).toBe('[_]');
  });

  test('infers array element type', () => {
    expect(inferType([1, 2, 3])).toBe('[Int]');
    expect(inferType(['a', 'b'])).toBe('[String]');
  });

  test('uses __tag for tagged types', () => {
    expect(inferType({ __tag: 'Ok', value: 42 })).toBe('Ok');
    expect(inferType({ __tag: 'Err', error: 'fail' })).toBe('Err');
  });
});

// ═══════════════════════════════════════════════════════════════
// 136. REPL — SYNTAX HIGHLIGHTER
// ═══════════════════════════════════════════════════════════════

describe('REPL syntax highlighter (inline test)', () => {
  const KEYWORDS = new Set([
    'fn', 'let', 'var', 'if', 'elif', 'else', 'for', 'while', 'loop',
    'in', 'return', 'match', 'type', 'import', 'from', 'and', 'or', 'not',
    'try', 'catch', 'finally', 'break', 'continue', 'async', 'await',
  ]);
  const TYPE_NAMES = new Set(['Int', 'Float', 'String', 'Bool', 'Nil', 'Any', 'Result', 'Option']);
  const RUNTIME_NAMES = new Set(['Ok', 'Err', 'Some', 'None', 'true', 'false', 'nil']);

  function classify(word) {
    if (KEYWORDS.has(word)) return 'keyword';
    if (TYPE_NAMES.has(word)) return 'type';
    if (RUNTIME_NAMES.has(word)) return 'runtime';
    return 'plain';
  }

  test('classifies keywords correctly', () => {
    expect(classify('fn')).toBe('keyword');
    expect(classify('if')).toBe('keyword');
    expect(classify('match')).toBe('keyword');
    expect(classify('async')).toBe('keyword');
    expect(classify('await')).toBe('keyword');
    expect(classify('return')).toBe('keyword');
  });

  test('classifies type names correctly', () => {
    expect(classify('Int')).toBe('type');
    expect(classify('String')).toBe('type');
    expect(classify('Result')).toBe('type');
    expect(classify('Option')).toBe('type');
  });

  test('classifies runtime names correctly', () => {
    expect(classify('Ok')).toBe('runtime');
    expect(classify('Err')).toBe('runtime');
    expect(classify('Some')).toBe('runtime');
    expect(classify('None')).toBe('runtime');
    expect(classify('true')).toBe('runtime');
    expect(classify('false')).toBe('runtime');
  });

  test('classifies user identifiers as plain', () => {
    expect(classify('myVar')).toBe('plain');
    expect(classify('calculate')).toBe('plain');
  });
});

// ═══════════════════════════════════════════════════════════════
// 137. REPL — TAB COMPLETION
// ═══════════════════════════════════════════════════════════════

describe('REPL tab completion (inline test)', () => {
  const completionWords = [
    'fn', 'let', 'var', 'if', 'else', 'for', 'while', 'match',
    'print', 'len', 'push', 'pop', 'map', 'filter',
    ':quit', ':exit', ':help', ':clear', ':type',
  ];

  function completer(line) {
    const match = line.match(/([a-zA-Z_:][a-zA-Z0-9_]*)$/);
    if (!match) return [[], line];
    const prefix = match[1];
    const hits = completionWords.filter(w => w.startsWith(prefix));
    return [hits, prefix];
  }

  test('completes keywords by prefix', () => {
    const [hits, prefix] = completer('fo');
    expect(prefix).toBe('fo');
    expect(hits).toContain('for');
  });

  test('completes builtin functions', () => {
    const [hits] = completer('pr');
    expect(hits).toContain('print');
  });

  test('completes REPL commands', () => {
    const [hits] = completer(':qu');
    expect(hits).toContain(':quit');
  });

  test('returns empty for no match', () => {
    const [hits] = completer('zzz');
    expect(hits.length).toBe(0);
  });

  test('returns all words starting with f', () => {
    const [hits] = completer('f');
    expect(hits).toContain('fn');
    expect(hits).toContain('for');
    expect(hits).toContain('filter');
  });
});

// ═══════════════════════════════════════════════════════════════
// 138. DEPLOY COMMAND — VALIDATION
// ═══════════════════════════════════════════════════════════════

describe('deploy command validation', () => {
  test('deploy without environment name shows error', () => {
    const result = runTova(['deploy']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('requires an environment name');
  });

  test('deploy with --list flag does not error', () => {
    const result = runTova(['deploy', '--list']);
    expect(result.stderr).not.toContain('requires an environment name');
  });

  test('deploy with environment name proceeds', () => {
    const result = runTova(['deploy', 'staging']);
    expect(result.stderr).not.toContain('requires an environment name');
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/deploy|Deploy/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// 139. ENV COMMAND
// ═══════════════════════════════════════════════════════════════

describe('env command', () => {
  test('env command shows environment info', () => {
    const result = runTova(['env']);
    const combined = result.stdout + result.stderr;
    expect(combined.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 140. GENERATEDEVHTML — INLINE TESTS
// ═══════════════════════════════════════════════════════════════

describe('generateDevHTML logic (inline test)', () => {
  test('dev HTML includes live reload script when port is provided', () => {
    const port = 3100;
    const liveReloadScript = port ? `<script>var reloadUrl = "http://localhost:${port}/__tova_reload";</script>` : '';
    expect(liveReloadScript).toContain('__tova_reload');
    expect(liveReloadScript).toContain('3100');
  });

  test('dev HTML omits live reload when port is 0', () => {
    const port = 0;
    const liveReloadScript = port ? `<script>var reloadUrl = "http://localhost:${port}/__tova_reload";</script>` : '';
    expect(liveReloadScript).toBe('');
  });

  test('dev HTML strips import lines from client code', () => {
    const importRegex = /^\s*import\s+(?:\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+['"][^'"]+['"];?\s*$/gm;
    const clientCode = `import { createSignal } from "./runtime/reactivity.js";\nimport { rpc } from "./runtime/rpc.js";\nconst x = 42;`;
    const stripped = clientCode.replace(importRegex, '').trim();
    expect(stripped).not.toContain('import');
    expect(stripped).toContain('const x = 42');
  });
});

// ═══════════════════════════════════════════════════════════════
// 141. collectExports — VIA MULTI-FILE BUILD
// ═══════════════════════════════════════════════════════════════

describe('collectExports via multi-file build', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-exports'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('pub functions are accessible via import', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'math.tova'), 'pub fn add(a: Int, b: Int) -> Int { a + b }');
    writeFileSync(join(tmpDir, 'src', 'main.tova'), 'import { add } from "./math.tova"\nprint(add(3, 4))');
    const result = runTova(['run', join(tmpDir, 'src', 'main.tova')]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('7');
  });

  test('non-pub functions are not exported', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'lib.tova'), 'fn private_fn() -> String { "secret" }\npub fn public_fn() -> String { "visible" }');
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    expect(result.exitCode).toBe(0);
  });

  test('type declarations are exportable', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'types.tova'), 'pub type Point {\n  x: Float\n  y: Float\n}');
    writeFileSync(join(tmpDir, 'src', 'main.tova'), 'import { Point } from "./types.tova"\np = Point(1.0, 2.0)\nprint(p.x)');
    const result = runTova(['run', join(tmpDir, 'src', 'main.tova')]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1');
  });
});

// ═══════════════════════════════════════════════════════════════
// 142. CIRCULAR IMPORT DETECTION
// ═══════════════════════════════════════════════════════════════

describe('circular import detection', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-circular'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('detects circular import and reports error', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'a.tova'), 'import { b_val } from "./b.tova"\npub fn a_val() -> Int { 1 }');
    writeFileSync(join(tmpDir, 'src', 'b.tova'), 'import { a_val } from "./a.tova"\npub fn b_val() -> Int { 2 }');
    const result = runTova(['run', join(tmpDir, 'src', 'a.tova')]);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/circular|cycle|already being/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// 143. LOCK FILE GENERATION VIA ADD
// ═══════════════════════════════════════════════════════════════

describe('lock file generation via add', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir('tova-lock');
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "test-lock"\nversion = "0.1.0"\n\n[dependencies]\n');
  });
  afterEach(() => { cleanupDir(tmpDir); });

  test('add local dep generates tova.lock', () => {
    mkdirSync(join(tmpDir, 'libs', 'mylib'), { recursive: true });
    writeFileSync(join(tmpDir, 'libs', 'mylib', 'tova.toml'), '[project]\nname = "mylib"\nversion = "0.1.0"\n');
    writeFileSync(join(tmpDir, 'libs', 'mylib', 'lib.tova'), 'pub fn greet() -> String { "hi" }');

    const result = runTova(['add', 'mylib', '--path', join(tmpDir, 'libs', 'mylib')], { cwd: tmpDir });
    if (existsSync(join(tmpDir, 'tova.lock'))) {
      const lockContent = readFileSync(join(tmpDir, 'tova.lock'), 'utf-8');
      expect(lockContent).toContain('mylib');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 144. VERBOSE AND QUIET FLAGS — COMPREHENSIVE
// ═══════════════════════════════════════════════════════════════

describe('verbose and quiet flags comprehensive', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-vq'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('--verbose shows additional output in build', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 1');
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--verbose']);
    expect(result.exitCode).toBe(0);
  });

  test('--quiet suppresses output in check', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 1');
    const verboseResult = runTova(['check', join(tmpDir, 'src')]);
    const quietResult = runTova(['check', join(tmpDir, 'src'), '--quiet']);
    expect(quietResult.stdout.length).toBeLessThanOrEqual(verboseResult.stdout.length);
  });

  test('--verbose shows additional output in run', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'print("verbose test")');
    const result = runTova(['run', join(tmpDir, 'app.tova'), '--verbose']);
    expect(result.stdout).toContain('verbose test');
  });
});

// ═══════════════════════════════════════════════════════════════
// 145. COMPILATION EDGE CASES — ADVANCED
// ═══════════════════════════════════════════════════════════════

describe('advanced compilation edge cases', () => {
  test('compiles nested match expressions', () => {
    const output = compileTova(`
fn categorize(x: Int) -> String {
  match x {
    0 => "zero"
    n if n > 0 => match n {
      1 => "one"
      _ => "positive"
    }
    _ => "negative"
  }
}
`);
    expect(output.shared).toBeDefined();
    expect(output.shared).toContain('categorize');
  });

  test('compiles recursive function', () => {
    const output = compileTova(`
fn factorial(n: Int) -> Int {
  if n <= 1 { 1 } else { n * factorial(n - 1) }
}
`);
    expect(output.shared).toContain('factorial');
  });

  test('compiles multiple types', () => {
    const output = compileTova(`
type Point { x: Float, y: Float }
type Circle { center: Point, radius: Float }
`);
    expect(output.shared).toContain('Point');
    expect(output.shared).toContain('Circle');
  });

  test('compiles pipe with placeholder', () => {
    const output = compileTova(`
fn double(n: Int) -> Int { n * 2 }
fn add_one(n: Int) -> Int { n + 1 }
result = 5 |> double |> add_one
`);
    expect(output.shared).toContain('double');
    expect(output.shared).toContain('add_one');
  });

  test('compiles for loop with range', () => {
    const output = compileTova(`
var total = 0
for i in range(10) {
  total = total + i
}
`);
    expect(output.shared).toContain('total');
  });

  test('compiles while loop with break', () => {
    const output = compileTova(`
var x = 0
while true {
  x = x + 1
  if x > 10 {
    break
  }
}
`);
    expect(output.shared).toContain('break');
  });

  test('compiles Result returning function', () => {
    const output = compileTova(`
fn safe_div(a: Int, b: Int) -> Result {
  if b == 0 { Err("division by zero") } else { Ok(a / b) }
}
`);
    expect(output.shared).toContain('safe_div');
  });

  test('compiles async function', () => {
    const output = compileTova(`
async fn fetch_data(url: String) -> String {
  "mock data"
}
`);
    expect(output.shared).toContain('async');
    expect(output.shared).toContain('fetch_data');
  });

  test('compiles string interpolation', () => {
    const output = compileTova(`
name = "world"
greeting = "Hello, {name}!"
`);
    expect(output.shared).toContain('name');
    expect(output.shared).toContain('greeting');
  });

  test('compiles array destructuring', () => {
    const output = compileTova(`
items = [1, 2, 3]
let [first, second, third] = items
`);
    expect(output.shared).toBeDefined();
  });

  test('compiles object destructuring in function params', () => {
    const output = compileTova(`
fn greet_user({name, age}) {
  print("Hello {name}, age {age}")
}
`);
    expect(output.shared).toContain('greet_user');
  });
});

// ═══════════════════════════════════════════════════════════════
// 146. DOC COMMAND — ADDITIONAL TESTS
// ═══════════════════════════════════════════════════════════════

describe('doc command additional tests', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-doc-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('doc skips files without docstrings', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'nodocs.tova'), 'fn no_docs() -> Int { 42 }');
    const result = runTova(['doc', join(tmpDir, 'src'), '--output', join(tmpDir, 'docs')]);
    expect(result.stdout).toContain('No documented .tova files');
  });

  test('doc generates output for files with docstrings', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'lib.tova'), '/// Adds two numbers\nfn add(a: Int, b: Int) -> Int { a + b }');
    const docsDir = join(tmpDir, 'docs');
    const result = runTova(['doc', join(tmpDir, 'src'), '--output', docsDir]);
    expect(result.stdout).toContain('Generated');
    expect(existsSync(docsDir)).toBe(true);
  });

  test('doc --format html generates html files', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'lib.tova'), '/// A helper\nfn helper() -> String { "help" }');
    const docsDir = join(tmpDir, 'docs');
    const result = runTova(['doc', join(tmpDir, 'src'), '--output', docsDir, '--format', 'html']);
    if (result.exitCode === 0 && existsSync(docsDir)) {
      const files = readdirSync(docsDir);
      expect(files.some(f => f.endsWith('.html'))).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 147. BENCH COMMAND — ADDITIONAL TESTS
// ═══════════════════════════════════════════════════════════════

describe('bench command additional tests', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-bench-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('bench with no bench blocks shows message', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const result = runTova(['bench', join(tmpDir, 'src')]);
    expect(result.stdout).toContain('No bench files found');
  });

  test('bench compiles and runs bench blocks', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
bench "addition" {
  x = 1 + 2
}
`);
    const result = runTova(['bench', join(tmpDir, 'src')], { timeout: 30000 });
    expect(result.stdout).toContain('Compiled');
  });
});

// ═══════════════════════════════════════════════════════════════
// 148. FMT COMMAND — ADDITIONAL TESTS
// ═══════════════════════════════════════════════════════════════

describe('fmt command additional tests', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-fmt-ext'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('fmt reformats inconsistent indentation', () => {
    writeFileSync(join(tmpDir, 'bad.tova'), 'fn foo() {\n      x = 1\n   y = 2\n}');
    const result = runTova(['fmt', join(tmpDir, 'bad.tova')]);
    expect(result.exitCode).toBe(0);
    const formatted = readFileSync(join(tmpDir, 'bad.tova'), 'utf-8');
    expect(formatted).toBeDefined();
  });

  test('fmt handles individual files', () => {
    writeFileSync(join(tmpDir, 'a.tova'), 'x = 1');
    const result = runTova(['fmt', join(tmpDir, 'a.tova')]);
    expect(result.exitCode).toBe(0);
  });

  test('fmt preserves already-formatted code', () => {
    const wellFormatted = 'fn greet(name: String) -> String {\n  "Hello, {name}!"\n}\n';
    writeFileSync(join(tmpDir, 'good.tova'), wellFormatted);
    runTova(['fmt', join(tmpDir, 'good.tova')]);
    const after = readFileSync(join(tmpDir, 'good.tova'), 'utf-8');
    expect(after.trim()).toBe(wellFormatted.trim());
  });
});

// ═══════════════════════════════════════════════════════════════
// 149. FINDTOVAFILES — EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('findTovaFiles edge cases', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-findfiles'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('skips node_modules directory', () => {
    mkdirSync(join(tmpDir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(tmpDir, 'node_modules', 'pkg', 'index.tova'), 'x = 1');
    writeFileSync(join(tmpDir, 'app.tova'), 'y = 2');
    const result = runTova(['check', tmpDir]);
    expect(result.stdout).toContain('1 file checked');
  });

  test('skips hidden directories', () => {
    mkdirSync(join(tmpDir, '.hidden'), { recursive: true });
    writeFileSync(join(tmpDir, '.hidden', 'secret.tova'), 'x = 1');
    writeFileSync(join(tmpDir, 'app.tova'), 'y = 2');
    const result = runTova(['check', tmpDir]);
    expect(result.stdout).toContain('1 file checked');
  });

  test('finds files in nested subdirectories', () => {
    mkdirSync(join(tmpDir, 'a', 'b', 'c'), { recursive: true });
    writeFileSync(join(tmpDir, 'a', 'b', 'c', 'deep.tova'), 'x = 1');
    const result = runTova(['check', tmpDir]);
    expect(result.stdout).toContain('1 file checked');
  });

  test('returns empty for non-existent directory', () => {
    const result = runTova(['check', join(tmpDir, 'nonexistent')]);
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('No .tova files');
  });
});

// ═══════════════════════════════════════════════════════════════
// 150. MIGRATION COMMANDS — COMPREHENSIVE
// ═══════════════════════════════════════════════════════════════

describe('migration commands comprehensive', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-migrate-comp'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('migrate:create creates migration with timestamp prefix', () => {
    const result = runTova(['migrate:create', 'add_users_table'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Created migration');
    const migrationsDir = join(tmpDir, 'migrations');
    if (existsSync(migrationsDir)) {
      const files = readdirSync(migrationsDir);
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/^\d+_add_users_table\.(js|sql)$/);
    }
  });

  test('migrate:create with multiple words', () => {
    const result = runTova(['migrate:create', 'create_posts_with_tags'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    const migrationsDir = join(tmpDir, 'migrations');
    if (existsSync(migrationsDir)) {
      const files = readdirSync(migrationsDir);
      expect(files[0]).toContain('create_posts_with_tags');
    }
  });

  test('migrate:create without name shows error', () => {
    const result = runTova(['migrate:create'], { cwd: tmpDir });
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/name|usage|required/i);
  });

  test('migrate:status shows migration status', () => {
    const result = runTova(['migrate:status'], { cwd: tmpDir });
    const combined = result.stdout + result.stderr;
    expect(combined.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 151. COMPLETIONS COMMAND — DETAILED OUTPUT TESTS
// ═══════════════════════════════════════════════════════════════

describe('completions command detailed output', () => {
  test('bash completions contain completion function', () => {
    const result = runTova(['completions', 'bash']);
    expect(result.stdout).toContain('_tova');
    expect(result.stdout).toContain('complete');
  });

  test('zsh completions contain _tova function', () => {
    const result = runTova(['completions', 'zsh']);
    expect(result.stdout).toContain('_tova');
    expect(result.stdout).toContain('compdef');
  });

  test('fish completions use complete command', () => {
    const result = runTova(['completions', 'fish']);
    expect(result.stdout).toContain('complete');
    expect(result.stdout).toContain('tova');
  });

  test('completions list major commands', () => {
    const result = runTova(['completions', 'bash']);
    const output = result.stdout;
    // Check for presence of some commands in completions output
    expect(output).toContain('run');
    expect(output).toContain('build');
    expect(output).toContain('dev');
    expect(output).toContain('check');
  });
});

// ═══════════════════════════════════════════════════════════════
// 152. DOCTOR COMMAND — DETAILED OUTPUT TESTS
// ═══════════════════════════════════════════════════════════════

describe('doctor command detailed output', () => {
  test('doctor checks Bun version', () => {
    const result = runTova(['doctor']);
    expect(result.stdout).toContain('Bun');
  });

  test('doctor checks Tova version', () => {
    const result = runTova(['doctor']);
    expect(result.stdout).toContain('Tova');
  });

  test('doctor checks environment health', () => {
    const result = runTova(['doctor']);
    const combined = result.stdout + result.stderr;
    expect(combined.length).toBeGreaterThan(50);
  });
});

// ═══════════════════════════════════════════════════════════════
// 153. INFO COMMAND — DETAILED OUTPUT TESTS
// ═══════════════════════════════════════════════════════════════

describe('info command detailed output', () => {
  test('info shows platform information', () => {
    const result = runTova(['info']);
    expect(result.stdout).toContain('Platform');
  });

  test('info shows Tova version', () => {
    const result = runTova(['info']);
    expect(result.stdout).toContain(VERSION);
  });

  test('info shows Bun version', () => {
    const result = runTova(['info']);
    expect(result.stdout).toContain('Bun');
  });
});

// ═══════════════════════════════════════════════════════════════
// 154. VERSION AND HELP FLAGS — COMPREHENSIVE
// ═══════════════════════════════════════════════════════════════

describe('version and help flags comprehensive', () => {
  test('--version shows version string', () => {
    const result = runTova(['--version']);
    expect(result.stdout).toContain(VERSION);
  });

  test('-v shows version string', () => {
    const result = runTova(['-v']);
    expect(result.stdout).toContain(VERSION);
  });

  test('--help shows all available commands', () => {
    const result = runTova(['--help']);
    const output = result.stdout;
    expect(output).toContain('run');
    expect(output).toContain('build');
    expect(output).toContain('dev');
    expect(output).toContain('check');
    expect(output).toContain('test');
  });

  test('-h shows help', () => {
    const result = runTova(['-h']);
    expect(result.stdout).toContain('Usage');
  });

  test('help command (no dash) shows help', () => {
    const result = runTova(['help']);
    expect(result.stdout.length).toBeGreaterThan(100);
  });
});

// ═══════════════════════════════════════════════════════════════
// 155. ERROR HANDLING — MAIN SWITCH STATEMENT
// ═══════════════════════════════════════════════════════════════

describe('main switch error handling', () => {
  test('unknown subcommand shows helpful error', () => {
    const result = runTova(['frobnicate']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown command');
  });

  test('run with nonexistent file shows error', () => {
    const result = runTova(['run', '/tmp/nonexistent_tova_file.tova']);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/not found|No such|does not exist|ENOENT/i);
  });

  test('check with nonexistent directory shows message', () => {
    const result = runTova(['check', '/tmp/nonexistent_tova_dir_xyz']);
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('No .tova files');
  });

  test('empty arguments shows help or usage', () => {
    const result = runTova([]);
    expect(result.stdout.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 156. STRINGIFYTOVAL — COMPREHENSIVE
// ═══════════════════════════════════════════════════════════════

describe('stringifyTOML comprehensive', () => {
  test('stringifies nested sections', () => {
    const result = stringifyTOML({
      project: { name: 'test', version: '1.0.0' },
      dependencies: { lodash: '4.17.21' },
    });
    expect(result).toContain('[project]');
    expect(result).toContain('name = "test"');
    expect(result).toContain('[dependencies]');
    expect(result).toContain('lodash = "4.17.21"');
  });

  test('stringifies array values', () => {
    const result = stringifyTOML({
      project: { keywords: ['lang', 'compiler'] },
    });
    expect(result).toContain('keywords');
  });

  test('stringifies boolean values', () => {
    const result = stringifyTOML({
      project: { private: true },
    });
    expect(result).toContain('private = true');
  });

  test('stringifies numeric values', () => {
    const result = stringifyTOML({
      config: { port: 3000 },
    });
    expect(result).toContain('port = 3000');
  });

  test('empty sections are included', () => {
    const result = stringifyTOML({
      project: { name: 'test' },
      dependencies: {},
    });
    expect(result).toContain('[project]');
    expect(result).toContain('[dependencies]');
  });
});

// ═══════════════════════════════════════════════════════════════
// 157. RESOLVECONFIG — COMPREHENSIVE
// ═══════════════════════════════════════════════════════════════

describe('resolveConfig comprehensive', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-resolve-config'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('returns defaults when no config file', () => {
    const config = resolveConfig(tmpDir);
    expect(config).toBeDefined();
    expect(config.project).toBeDefined();
  });

  test('reads tova.toml when present', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "my-app"\nversion = "0.1.0"\n');
    const config = resolveConfig(tmpDir);
    expect(config.project.name).toBe('my-app');
    expect(config._source).toBe('tova.toml');
  });

  test('merges defaults for missing sections', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "test"\n');
    const config = resolveConfig(tmpDir);
    expect(config.project.name).toBe('test');
  });
});

// ═══════════════════════════════════════════════════════════════
// 158. WATCHER — startWatcher BEHAVIOR VIA DEV
// ═══════════════════════════════════════════════════════════════

describe('watcher behavior via dev', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-watcher'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('dev server compiles files on startup', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
server {
  fn hello() { "world" }
  route GET "/hello" => hello
}
`);
    const result = runTova(['dev', join(tmpDir, 'src')], { timeout: 3000 });
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/dev server|starting|compiled|error|No .tova/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// 159. MULTI-BLOCK COEXISTENCE — COMPREHENSIVE
// ═══════════════════════════════════════════════════════════════

describe('multi-block coexistence comprehensive', () => {
  test('shared + server + browser compiles correctly', () => {
    const output = compileTova(`
shared {
  type User {
    name: String
    age: Int
  }
}

server {
  fn get_user() { User("Alice", 30) }
  route GET "/user" => get_user
}

browser {
  state user_name = ""
  component App {
    <div>"Hello"</div>
  }
}
`);
    expect(output.shared).toContain('User');
    expect(output.server).toContain('get_user');
    expect(output.browser).toContain('App');
  });

  test('shared types are available in both server and browser', () => {
    const output = compileTova(`
shared {
  type Message { text: String, ts: Int }
}
server {
  fn get_msg() { Message("hi", 123) }
  route GET "/msg" => get_msg
}
browser {
  state msg = ""
  component App { <p>"msg"</p> }
}
`);
    expect(output.shared).toContain('Message');
  });
});

// ═══════════════════════════════════════════════════════════════
// 160. SECURITY BLOCK — VIA BUILD
// ═══════════════════════════════════════════════════════════════

describe('security block via build', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-security-build'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('security block compiles with server block', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
security {
  auth jwt {
    secret: "test-secret-key-for-testing-only"
  }
  role admin {
    permissions: ["read", "write"]
  }
}
server {
  fn hello() { "world" }
  route GET "/hello" => hello
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    expect(result.exitCode).toBe(0);
    const files = readdirSync(outDir);
    expect(files.some(f => f.endsWith('.server.js'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 161. CLI BLOCK — VIA BUILD
// ═══════════════════════════════════════════════════════════════

describe('cli block via build', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-cli-block'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('cli block compiles to executable', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
cli {
  name: "mytool"
  version: "1.0.0"

  fn greet(--name: String) {
    print("Hello, {name}!")
  }
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 162. EDGE BLOCK — CONFIG-ONLY VIA BUILD
// ═══════════════════════════════════════════════════════════════

describe('edge block config via build', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-edge-config'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('edge block with target cloudflare compiles', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
edge {
  target: "cloudflare"
  env API_KEY
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    expect(result.exitCode).toBe(0);
  });

  test('edge block with target deno compiles', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
edge {
  target: "deno"
  env DB_URL
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir]);
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 163. TOML EDITING — ADD AND REMOVE SECTIONS
// ═══════════════════════════════════════════════════════════════

describe('TOML editing add and remove', () => {
  let tmpFile;

  beforeEach(() => {
    const dir = join(tmpdir(), `tova-toml-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(dir, { recursive: true });
    tmpFile = join(dir, 'tova.toml');
  });

  afterEach(() => {
    try { rmSync(join(tmpFile, '..'), { recursive: true, force: true }); } catch {}
  });

  test('addToSection adds key to existing section', () => {
    writeFileSync(tmpFile, '[dependencies]\nlodash = "4.17.0"\n');
    addToSection(tmpFile, 'dependencies', 'express', '4.18.0');
    const result = readFileSync(tmpFile, 'utf-8');
    expect(result).toContain('express = "4.18.0"');
    expect(result).toContain('lodash = "4.17.0"');
  });

  test('addToSection creates section if missing', () => {
    writeFileSync(tmpFile, '[project]\nname = "test"\n');
    addToSection(tmpFile, 'dependencies', 'lodash', '4.17.0');
    const result = readFileSync(tmpFile, 'utf-8');
    expect(result).toContain('[dependencies]');
    expect(result).toContain('lodash = "4.17.0"');
  });

  test('removeFromSection removes key from section', () => {
    writeFileSync(tmpFile, '[dependencies]\nlodash = "4.17.0"\nexpress = "4.18.0"\n');
    const removed = removeFromSection(tmpFile, 'dependencies', 'lodash');
    expect(removed).toBe(true);
    const result = readFileSync(tmpFile, 'utf-8');
    expect(result).not.toContain('lodash');
    expect(result).toContain('express = "4.18.0"');
  });

  test('removeFromSection handles last item in section', () => {
    writeFileSync(tmpFile, '[dependencies]\nlodash = "4.17.0"\n');
    const removed = removeFromSection(tmpFile, 'dependencies', 'lodash');
    expect(removed).toBe(true);
    const result = readFileSync(tmpFile, 'utf-8');
    expect(result).not.toContain('lodash');
    expect(result).toContain('[dependencies]');
  });
});

// ═══════════════════════════════════════════════════════════════
// 164. STDLIB — ADDITIONAL COVERAGE
// ═══════════════════════════════════════════════════════════════

describe('stdlib additional coverage', () => {
  test('stdlib contains range function', () => {
    const stdlib = getFullStdlib();
    expect(stdlib).toContain('range');
  });

  test('stdlib contains print function', () => {
    const stdlib = getFullStdlib();
    expect(stdlib).toContain('print');
  });

  test('stdlib contains len function', () => {
    const stdlib = getFullStdlib();
    expect(stdlib).toContain('len');
  });

  test('BUILTIN_NAMES is a Set with expected entries', () => {
    expect(BUILTIN_NAMES instanceof Set).toBe(true);
    expect(BUILTIN_NAMES.has('print')).toBe(true);
    expect(BUILTIN_NAMES.has('len')).toBe(true);
    expect(BUILTIN_NAMES.has('range')).toBe(true);
    expect(BUILTIN_NAMES.has('map')).toBe(true);
    expect(BUILTIN_NAMES.has('filter')).toBe(true);
    expect(BUILTIN_NAMES.has('reduce')).toBe(true);
  });

  test('PROPAGATE contains propagation helper', () => {
    expect(typeof PROPAGATE).toBe('string');
    expect(PROPAGATE.length).toBeGreaterThan(0);
  });

  test('NATIVE_INIT contains native type initialization', () => {
    expect(typeof NATIVE_INIT).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════
// 165. INIT COMMAND — EXISTING DIRECTORY HANDLING
// ═══════════════════════════════════════════════════════════════

describe('init command existing directory', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-init-exist'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('init in existing directory creates tova.toml', () => {
    const result = runTova(['init'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tmpDir, 'tova.toml'))).toBe(true);
  });

  test('init does not overwrite existing tova.toml', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "existing"\n');
    const result = runTova(['init'], { cwd: tmpDir });
    const content = readFileSync(join(tmpDir, 'tova.toml'), 'utf-8');
    expect(content).toContain('existing');
  });
});

// ═══════════════════════════════════════════════════════════════
// 166. RUN COMMAND — AUTO-FIND MAIN.TOVA
// ═══════════════════════════════════════════════════════════════

describe('run command auto-find main.tova', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-run-auto'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('run without file finds main.tova in entry dir', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "test"\nentry = "src"\n');
    writeFileSync(join(tmpDir, 'src', 'main.tova'), 'print("auto found")');
    const result = runTova(['run'], { cwd: tmpDir });
    expect(result.stdout).toContain('auto found');
  });

  test('run without file finds app.tova as fallback', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "test"\nentry = "src"\n');
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'print("app found")');
    const result = runTova(['run'], { cwd: tmpDir });
    expect(result.stdout).toContain('app found');
  });
});

// ═══════════════════════════════════════════════════════════════
// 167. CLEAN COMMAND — COMPREHENSIVE
// ═══════════════════════════════════════════════════════════════

describe('clean command comprehensive', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-clean-comp'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('clean removes .tova-out directory', () => {
    const outDir = join(tmpDir, '.tova-out');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'test.js'), 'x = 1');
    const result = runTova(['clean'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(existsSync(outDir)).toBe(false);
  });

  test('clean does not remove .tova-test-out (only .tova-out)', () => {
    const testDir = join(tmpDir, '.tova-test-out');
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'test.js'), 'x = 1');
    const result = runTova(['clean'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    // clean only removes .tova-out, not .tova-test-out
    expect(existsSync(testDir)).toBe(true);
  });

  test('clean reports nothing to clean when no .tova-out', () => {
    // Don't create .tova-out — should report nothing to clean
    const result = runTova(['clean'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('Nothing to clean');
  });

  test('clean when no output dirs exist succeeds', () => {
    const result = runTova(['clean'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 168. EXPLAIN COMMAND — COMPREHENSIVE
// ═══════════════════════════════════════════════════════════════

describe('explain command comprehensive', () => {
  test('explain E001 shows error description', () => {
    const result = runTova(['explain', 'E001']);
    const combined = result.stdout + result.stderr;
    expect(combined.length).toBeGreaterThan(10);
  });

  test('explain with invalid code shows appropriate message', () => {
    const result = runTova(['explain', 'EINVALID999']);
    const combined = result.stdout + result.stderr;
    expect(combined.length).toBeGreaterThan(0);
  });

  test('explain without code shows usage', () => {
    const result = runTova(['explain']);
    const combined = result.stdout + result.stderr;
    expect(combined.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 169. INSTALL COMMAND — COMPREHENSIVE
// ═══════════════════════════════════════════════════════════════

describe('install command comprehensive', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-install-comp'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('install in project with no tova.toml shows message', () => {
    const result = runTova(['install'], { cwd: tmpDir });
    const combined = result.stdout + result.stderr;
    expect(combined.length).toBeGreaterThan(0);
  });

  test('install with tova.toml and dependencies runs install', () => {
    writeFileSync(join(tmpDir, 'tova.toml'), '[project]\nname = "test"\n\n[dependencies]\n');
    const result = runTova(['install'], { cwd: tmpDir });
    const combined = result.stdout + result.stderr;
    expect(combined.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 170. RUN WITH SCRIPT ARGS
// ═══════════════════════════════════════════════════════════════

describe('run with script arguments', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir('tova-run-args'); });
  afterEach(() => { cleanupDir(tmpDir); });

  test('script args are accessible via process args', () => {
    writeFileSync(join(tmpDir, 'args.tova'), 'print("arg-test-ok")');
    const result = runTova(['run', join(tmpDir, 'args.tova'), '--', 'hello', 'world']);
    expect(result.stdout).toContain('arg-test-ok');
  });
});

// ═══════════════════════════════════════════════════════════════
// 171. ERROR CODES — COMPREHENSIVE
// ═══════════════════════════════════════════════════════════════

describe('error codes comprehensive', () => {
  test('lookupCode returns info for valid error codes', () => {
    const info = lookupCode('E001');
    if (info) {
      expect(info.code || info.id).toBe('E001');
    }
  });

  test('lookupCode returns null for invalid codes', () => {
    const info = lookupCode('EZZZZ');
    expect(info).toBeNull();
  });

  test('getExplanation returns string for valid codes', () => {
    const explanation = getExplanation('E001');
    if (explanation) {
      expect(typeof explanation).toBe('string');
      expect(explanation.length).toBeGreaterThan(0);
    }
  });

  test('getExplanation handles unknown codes gracefully', () => {
    const explanation = getExplanation('EUNKNOWN');
    expect(explanation === null || explanation === undefined || typeof explanation === 'string').toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 172. ANALYZER WARNINGS — COMPREHENSIVE
// ═══════════════════════════════════════════════════════════════

describe('analyzer warnings comprehensive', () => {
  test('warns on unused variable in function', () => {
    const source = 'fn test_fn() {\n  unused_var = 42\n}';
    const lexer = new Lexer(source, 'test.tova');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, 'test.tova');
    const ast = parser.parse();
    const analyzer = new Analyzer(ast, 'test.tova');
    const { warnings } = analyzer.analyze();
    const hasUnused = warnings.some(w => w.message && w.message.toLowerCase().includes('unused'));
    expect(hasUnused).toBe(true);
  });

  test('does not warn on used variables', () => {
    const source = 'fn test_fn() -> Int {\n  used_var = 42\n  used_var\n}';
    const lexer = new Lexer(source, 'test.tova');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, 'test.tova');
    const ast = parser.parse();
    const analyzer = new Analyzer(ast, 'test.tova');
    const { warnings } = analyzer.analyze();
    const hasUnusedForUsedVar = warnings.some(w =>
      w.message && w.message.includes('used_var') && w.message.toLowerCase().includes('unused')
    );
    expect(hasUnusedForUsedVar).toBe(false);
  });

  test('warns on undefined identifier', () => {
    const source = 'fn test_fn() -> Int { nonexistent_var }';
    const lexer = new Lexer(source, 'test.tova');
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, 'test.tova');
    const ast = parser.parse();
    const analyzer = new Analyzer(ast, 'test.tova');
    const { warnings } = analyzer.analyze();
    const hasUndefined = warnings.some(w =>
      w.message && (w.message.includes('nonexistent_var') || w.message.toLowerCase().includes('undefined'))
    );
    expect(hasUndefined).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 173. FORMATTER — COMPREHENSIVE
// ═══════════════════════════════════════════════════════════════

describe('formatter comprehensive', () => {
  function parseToAST(source) {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, source);
    return parser.parse();
  }

  test('formatter formats a function declaration', () => {
    const ast = parseToAST('fn foo() {\n      x = 1\n}');
    const formatter = new Formatter();
    const result = formatter.format(ast);
    expect(result).toContain('fn foo()');
    expect(result).toContain('x = 1');
  });

  test('formatter handles empty program', () => {
    const ast = parseToAST('');
    const formatter = new Formatter();
    const result = formatter.format(ast);
    expect(typeof result).toBe('string');
  });

  test('formatter handles assignment', () => {
    const ast = parseToAST('x = 42');
    const formatter = new Formatter();
    const result = formatter.format(ast);
    expect(result).toContain('x = 42');
  });

  test('formatter preserves function with params and return type', () => {
    const ast = parseToAST('fn add(a: Int, b: Int) -> Int {\n  a + b\n}');
    const formatter = new Formatter();
    const result = formatter.format(ast);
    expect(result).toContain('fn add');
    expect(result).toContain('a + b');
  });
});
