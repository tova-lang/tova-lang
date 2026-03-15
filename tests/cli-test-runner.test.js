import { describe, test, expect, beforeEach, afterEach, setDefaultTimeout } from 'bun:test';

setDefaultTimeout(60000);
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import path from 'path';
import { findTovaFiles } from '../src/cli/test.js';

const TOVA = path.join(__dirname, '..', 'bin', 'tova.js');

function runTova(args, opts = {}) {
  const timeout = 15000;
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = spawnSync('bun', [TOVA, ...args], {
      encoding: 'utf-8', timeout, ...opts
    });
    if (result.status === null && attempt < maxAttempts) continue;
    return result;
  }
}

// ─── findTovaFiles() unit tests ─────────────────────────────

describe('findTovaFiles', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = path.join(__dirname, '..', '.tmp-test-find-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('finds .tova files recursively', () => {
    writeFileSync(path.join(tmpDir, 'a.tova'), 'x = 1');
    mkdirSync(path.join(tmpDir, 'sub'));
    writeFileSync(path.join(tmpDir, 'sub', 'b.tova'), 'y = 2');
    mkdirSync(path.join(tmpDir, 'sub', 'deep'));
    writeFileSync(path.join(tmpDir, 'sub', 'deep', 'c.tova'), 'z = 3');

    const files = findTovaFiles(tmpDir);
    expect(files.length).toBe(3);
    const basenames = files.map(f => path.basename(f)).sort();
    expect(basenames).toEqual(['a.tova', 'b.tova', 'c.tova']);
  });

  test('skips hidden directories (dotfiles)', () => {
    writeFileSync(path.join(tmpDir, 'visible.tova'), 'x = 1');
    mkdirSync(path.join(tmpDir, '.hidden'));
    writeFileSync(path.join(tmpDir, '.hidden', 'secret.tova'), 'y = 2');

    const files = findTovaFiles(tmpDir);
    expect(files.length).toBe(1);
    expect(path.basename(files[0])).toBe('visible.tova');
  });

  test('skips node_modules', () => {
    writeFileSync(path.join(tmpDir, 'app.tova'), 'x = 1');
    mkdirSync(path.join(tmpDir, 'node_modules'));
    writeFileSync(path.join(tmpDir, 'node_modules', 'pkg.tova'), 'y = 2');

    const files = findTovaFiles(tmpDir);
    expect(files.length).toBe(1);
    expect(path.basename(files[0])).toBe('app.tova');
  });

  test('returns empty array for empty directory', () => {
    const files = findTovaFiles(tmpDir);
    expect(files).toEqual([]);
  });

  test('returns empty array for non-existent directory', () => {
    const files = findTovaFiles(path.join(tmpDir, 'does-not-exist'));
    expect(files).toEqual([]);
  });

  test('ignores non-.tova files', () => {
    writeFileSync(path.join(tmpDir, 'readme.md'), '# readme');
    writeFileSync(path.join(tmpDir, 'script.js'), 'console.log(1)');
    writeFileSync(path.join(tmpDir, 'real.tova'), 'x = 1');

    const files = findTovaFiles(tmpDir);
    expect(files.length).toBe(1);
    expect(path.basename(files[0])).toBe('real.tova');
  });
});

// ─── tova test <dir> integration tests ──────────────────────

describe('tova test', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = path.join(__dirname, '..', '.tmp-test-cmd-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    // Clean up .tova-test-out if left behind
    try { rmSync(path.join(process.cwd(), '.tova-test-out'), { recursive: true, force: true }); } catch {}
  });

  test('compiles and runs test block', () => {
    writeFileSync(path.join(tmpDir, 'math.tova'), `test {
  fn test_add() {
    assert(1 + 1 == 2)
  }
}`);

    const result = runTova(['test', tmpDir], { cwd: tmpDir });
    const output = (result.stdout || '') + (result.stderr || '');
    // Should find at least 1 test file and attempt to compile
    expect(output).toContain('1 test file');
  });

  test('reports no test files when directory has no tests', () => {
    writeFileSync(path.join(tmpDir, 'lib.tova'), 'x = 42');

    const result = runTova(['test', tmpDir], { cwd: tmpDir });
    const output = (result.stdout || '') + (result.stderr || '');
    expect(output).toContain('No test files found');
  });

  test('finds dedicated test files (*.test.tova)', () => {
    writeFileSync(path.join(tmpDir, 'math.test.tova'), `fn test_add() {
  assert(1 + 1 == 2)
}`);

    const result = runTova(['test', tmpDir], { cwd: tmpDir });
    const output = (result.stdout || '') + (result.stderr || '');
    expect(output).toContain('1 test file');
  });

  test('finds dedicated test files (*_test.tova)', () => {
    writeFileSync(path.join(tmpDir, 'math_test.tova'), `fn test_sub() {
  assert(3 - 1 == 2)
}`);

    const result = runTova(['test', tmpDir], { cwd: tmpDir });
    const output = (result.stdout || '') + (result.stderr || '');
    expect(output).toContain('1 test file');
  });
});

// ─── tova bench <dir> integration tests ─────────────────────

describe('tova bench', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = path.join(__dirname, '..', '.tmp-bench-cmd-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('compiles bench block files', () => {
    writeFileSync(path.join(tmpDir, 'perf.tova'), `bench {
  fn bench_add() {
    1 + 1
  }
}`);

    const result = runTova(['bench', tmpDir], { cwd: tmpDir });
    const output = (result.stdout || '') + (result.stderr || '');
    // Should find 1 bench file
    expect(output).toContain('1 bench file');
  });

  test('reports no bench files when none exist', () => {
    writeFileSync(path.join(tmpDir, 'lib.tova'), 'x = 42');

    const result = runTova(['bench', tmpDir], { cwd: tmpDir });
    const output = (result.stdout || '') + (result.stderr || '');
    expect(output).toContain('No bench files found');
  });
});

// ─── tova doc <dir> integration tests ───────────────────────

describe('tova doc', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = path.join(__dirname, '..', '.tmp-doc-cmd-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    try { rmSync(path.join(process.cwd(), 'docs-out'), { recursive: true, force: true }); } catch {}
  });

  test('generates docs from files with docstrings', () => {
    writeFileSync(path.join(tmpDir, 'math.tova'), `/// Adds two numbers
pub fn add(a: Int, b: Int) -> Int {
  a + b
}`);

    const result = runTova(['doc', tmpDir], { cwd: tmpDir });
    const output = (result.stdout || '') + (result.stderr || '');
    expect(output).toContain('Generated');
  });

  test('prints message when no docstrings found', () => {
    writeFileSync(path.join(tmpDir, 'plain.tova'), `fn noop() { 42 }`);

    const result = runTova(['doc', tmpDir], { cwd: tmpDir });
    const output = (result.stdout || '') + (result.stderr || '');
    // Should indicate no documented files
    expect(output).toMatch(/[Nn]o documented/i);
  });

  test('prints message when no .tova files found', () => {
    // empty dir — no tova files at all
    const result = runTova(['doc', tmpDir], { cwd: tmpDir });
    const output = (result.stdout || '') + (result.stderr || '');
    expect(output).toMatch(/[Nn]o \.tova files/i);
  });
});
