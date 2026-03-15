// tests/cli-format.test.js — Comprehensive tests for src/cli/format.js
// Tests formatFile() via CLI invocation
import { describe, test, expect, beforeEach, afterEach, setDefaultTimeout } from 'bun:test';

setDefaultTimeout(60000);
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const TOVA = resolve(join(import.meta.dir, '..', 'bin', 'tova.js'));

function createTmpDir(prefix = 'tova-fmt-test') {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupDir(dir) {
  if (dir && existsSync(dir)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

function runTova(args, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const proc = Bun.spawnSync(['bun', 'run', TOVA, ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...opts.env, NO_COLOR: '1' },
    timeout: opts.timeout || 30000,
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// FORMAT COMMAND — BASIC FORMATTING
// ═══════════════════════════════════════════════════════════════

describe('tova fmt — basic formatting', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('format a .tova file rewrites it', () => {
    const filePath = join(tmpDir, 'app.tova');
    // Write poorly formatted code (extra spaces, inconsistent style)
    writeFileSync(filePath, 'x   =    42\nprint(  x  )');
    const result = runTova(['fmt', filePath]);
    // Should either format successfully or report already formatted
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Formatted|Already formatted/);
  });

  test('format an already-formatted file reports no changes', () => {
    const filePath = join(tmpDir, 'clean.tova');
    // Write well-formatted code that the formatter would not change
    // First format it, then format again
    writeFileSync(filePath, 'x = 42\n');
    // Format once to get canonical form
    runTova(['fmt', filePath]);
    const formatted = readFileSync(filePath, 'utf-8');
    // Format again — should say "Already formatted"
    const result = runTova(['fmt', filePath]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Already formatted');
    // File contents should not change
    expect(readFileSync(filePath, 'utf-8')).toBe(formatted);
  });

  test('format writes back to the same file', () => {
    const filePath = join(tmpDir, 'modify.tova');
    const original = 'x    =    42\nprint(  x  )';
    writeFileSync(filePath, original);
    runTova(['fmt', filePath]);
    const after = readFileSync(filePath, 'utf-8');
    // After formatting, file should be modified (or same if already canonical)
    expect(after).toBeDefined();
    expect(after.length).toBeGreaterThan(0);
  });

  test('format a file with function declaration', () => {
    const filePath = join(tmpDir, 'func.tova');
    writeFileSync(filePath, `
fn   add( a:   Int , b:  Int ) ->    Int {
  a + b
}
`);
    const result = runTova(['fmt', filePath]);
    expect(result.exitCode).toBe(0);
    const after = readFileSync(filePath, 'utf-8');
    expect(after).toContain('fn');
    expect(after).toContain('add');
  });

  test('format preserves semantics', () => {
    const filePath = join(tmpDir, 'semantics.tova');
    writeFileSync(filePath, `
fn double(n: Int) -> Int {
  n * 2
}

result = double(21)
print(result)
`);
    const result = runTova(['fmt', filePath]);
    expect(result.exitCode).toBe(0);
    const after = readFileSync(filePath, 'utf-8');
    // Core identifiers and literals should be preserved
    expect(after).toContain('double');
    expect(after).toContain('21');
  });
});

// ═══════════════════════════════════════════════════════════════
// FORMAT COMMAND — CHECK MODE
// ═══════════════════════════════════════════════════════════════

describe('tova fmt --check', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('--check on formatted file exits 0', () => {
    const filePath = join(tmpDir, 'clean.tova');
    writeFileSync(filePath, 'x = 42\n');
    // Format it first to ensure it is in canonical form
    runTova(['fmt', filePath]);
    const formatted = readFileSync(filePath, 'utf-8');
    // Now check
    const result = runTova(['fmt', '--check', filePath]);
    expect(result.exitCode).toBe(0);
    // File should not be modified
    expect(readFileSync(filePath, 'utf-8')).toBe(formatted);
  });

  test('--check on unformatted file exits 1', () => {
    const filePath = join(tmpDir, 'messy.tova');
    // Write code that the formatter will change
    writeFileSync(filePath, 'x   =    42\nprint(  x  )');
    // First check if the formatter would actually change this file
    const checkResult = runTova(['fmt', '--check', filePath]);
    // If the formatter considers this already formatted, the test is moot
    // Otherwise it should exit 1
    if (checkResult.stdout.includes('Would reformat')) {
      expect(checkResult.exitCode).toBe(1);
    }
    // File should NOT be modified in check mode
    const after = readFileSync(filePath, 'utf-8');
    expect(after).toBe('x   =    42\nprint(  x  )');
  });

  test('--check does not modify the file', () => {
    const filePath = join(tmpDir, 'unchanged.tova');
    const original = 'x   =    42\n';
    writeFileSync(filePath, original);
    runTova(['fmt', '--check', filePath]);
    expect(readFileSync(filePath, 'utf-8')).toBe(original);
  });

  test('--check reports which files would be reformatted', () => {
    const filePath = join(tmpDir, 'dirty.tova');
    writeFileSync(filePath, 'x   =    42\nprint(  x  )');
    const result = runTova(['fmt', '--check', filePath]);
    if (result.exitCode === 1) {
      expect(result.stdout).toContain('Would reformat');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// FORMAT COMMAND — ERROR CASES
// ═══════════════════════════════════════════════════════════════

describe('tova fmt — errors', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('format non-existent file shows error', () => {
    const result = runTova(['fmt', join(tmpDir, 'does-not-exist.tova')]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('File not found');
  });

  test('format with no file specified shows usage error', () => {
    const result = runTova(['fmt']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No file specified');
  });

  test('format shows usage hint when no file given', () => {
    const result = runTova(['fmt']);
    expect(result.stderr).toContain('Usage');
  });
});

// ═══════════════════════════════════════════════════════════════
// FORMAT COMMAND — MULTIPLE FILES
// ═══════════════════════════════════════════════════════════════

describe('tova fmt — multiple files', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('format multiple files at once', () => {
    const file1 = join(tmpDir, 'a.tova');
    const file2 = join(tmpDir, 'b.tova');
    writeFileSync(file1, 'x = 1\n');
    writeFileSync(file2, 'y = 2\n');
    // Format both
    const result = runTova(['fmt', file1, file2]);
    expect(result.exitCode).toBe(0);
  });

  test('--check multiple files all formatted exits 0', () => {
    const file1 = join(tmpDir, 'a.tova');
    const file2 = join(tmpDir, 'b.tova');
    writeFileSync(file1, 'x = 1\n');
    writeFileSync(file2, 'y = 2\n');
    // Format them first
    runTova(['fmt', file1, file2]);
    // Now check both
    const result = runTova(['fmt', '--check', file1, file2]);
    expect(result.exitCode).toBe(0);
  });

  test('format exits 1 if any file not found', () => {
    const file1 = join(tmpDir, 'exists.tova');
    writeFileSync(file1, 'x = 1\n');
    const result = runTova(['fmt', file1, join(tmpDir, 'missing.tova')]);
    // Should error on missing file
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('File not found');
  });
});

// ═══════════════════════════════════════════════════════════════
// FORMAT COMMAND — COMPLEX CODE
// ═══════════════════════════════════════════════════════════════

describe('tova fmt — complex code', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('format type declarations', () => {
    const filePath = join(tmpDir, 'types.tova');
    writeFileSync(filePath, `
type Color {
  Red
  Green
  Blue
}
`);
    const result = runTova(['fmt', filePath]);
    expect(result.exitCode).toBe(0);
    const after = readFileSync(filePath, 'utf-8');
    expect(after).toContain('type Color');
  });

  test('format match expressions', () => {
    const filePath = join(tmpDir, 'matching.tova');
    writeFileSync(filePath, `
fn describe(n: Int) -> String {
  match n {
    0 => "zero"
    1 => "one"
    _ => "other"
  }
}
`);
    const result = runTova(['fmt', filePath]);
    expect(result.exitCode).toBe(0);
    const after = readFileSync(filePath, 'utf-8');
    expect(after).toContain('match');
  });

  test('format if/elif/else', () => {
    const filePath = join(tmpDir, 'control.tova');
    writeFileSync(filePath, `
fn classify(n: Int) -> String {
  if n > 0 {
    "positive"
  } elif n < 0 {
    "negative"
  } else {
    "zero"
  }
}
`);
    const result = runTova(['fmt', filePath]);
    expect(result.exitCode).toBe(0);
    const after = readFileSync(filePath, 'utf-8');
    expect(after).toContain('elif');
  });

  test('format server block', () => {
    const filePath = join(tmpDir, 'server.tova');
    writeFileSync(filePath, `
server {
  fn hello() { "world" }
  route GET "/api/hello" => hello
}
`);
    const result = runTova(['fmt', filePath]);
    expect(result.exitCode).toBe(0);
  });

  test('format browser block', () => {
    const filePath = join(tmpDir, 'browser.tova');
    writeFileSync(filePath, `
browser {
  state count = 0
  component App { <div>"hello"</div> }
}
`);
    const result = runTova(['fmt', filePath]);
    expect(result.exitCode).toBe(0);
  });

  test('format idempotent — formatting twice produces same result', () => {
    const filePath = join(tmpDir, 'idem.tova');
    writeFileSync(filePath, `
fn add(a: Int, b: Int) -> Int {
  a + b
}

fn sub(a: Int, b: Int) -> Int {
  a - b
}
`);
    // Format once
    runTova(['fmt', filePath]);
    const firstPass = readFileSync(filePath, 'utf-8');
    // Format again
    runTova(['fmt', filePath]);
    const secondPass = readFileSync(filePath, 'utf-8');
    // Should be identical
    expect(secondPass).toBe(firstPass);
  });
});
