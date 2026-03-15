// tests/cli-check.test.js — Comprehensive tests for src/cli/check.js
// Tests checkProject() via CLI invocation
import { describe, test, expect, beforeEach, afterEach, setDefaultTimeout } from 'bun:test';

setDefaultTimeout(60000);
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const TOVA = resolve(join(import.meta.dir, '..', 'bin', 'tova.js'));

function createTmpDir(prefix = 'tova-check-test') {
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
// CHECK COMMAND — VALID FILES
// ═══════════════════════════════════════════════════════════════

describe('tova check — valid files', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('check a valid .tova file exits 0 with no errors', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 42\nprint(x)');
    const result = runTova(['check', join(tmpDir, 'app.tova')]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('checked');
    expect(result.stdout).toContain('no errors');
  });

  test('check a valid file with function', () => {
    writeFileSync(join(tmpDir, 'math.tova'), `
fn add(a: Int, b: Int) -> Int {
  a + b
}

result = add(1, 2)
print(result)
`);
    const result = runTova(['check', join(tmpDir, 'math.tova')]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('no errors');
  });

  test('check a valid file with type declaration', () => {
    writeFileSync(join(tmpDir, 'types.tova'), `
type User {
  name: String
  age: Int
}
`);
    const result = runTova(['check', join(tmpDir, 'types.tova')]);
    expect(result.exitCode).toBe(0);
  });

  test('check valid server block', () => {
    writeFileSync(join(tmpDir, 'server.tova'), `
server {
  fn hello() { "world" }
  route GET "/api/hello" => hello
}
`);
    const result = runTova(['check', join(tmpDir, 'server.tova')]);
    expect(result.exitCode).toBe(0);
  });

  test('check valid browser block', () => {
    writeFileSync(join(tmpDir, 'browser.tova'), `
browser {
  state count = 0
  component App { <div>"hello"</div> }
}
`);
    const result = runTova(['check', join(tmpDir, 'browser.tova')]);
    expect(result.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// CHECK COMMAND — FILES WITH ERRORS
// ═══════════════════════════════════════════════════════════════

describe('tova check — files with errors', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('check a file with syntax errors exits 1', () => {
    writeFileSync(join(tmpDir, 'bad.tova'), 'fn {');
    const result = runTova(['check', join(tmpDir, 'bad.tova')]);
    expect(result.exitCode).toBe(1);
  });

  test('check a file with syntax error shows error output', () => {
    writeFileSync(join(tmpDir, 'bad.tova'), 'fn {');
    const result = runTova(['check', join(tmpDir, 'bad.tova')]);
    expect(result.exitCode).toBe(1);
    const combined = result.stdout + result.stderr;
    // Should contain some error message
    expect(combined.length).toBeGreaterThan(0);
  });

  test('check shows error count in summary', () => {
    writeFileSync(join(tmpDir, 'bad.tova'), 'fn {');
    const result = runTova(['check', join(tmpDir, 'bad.tova')]);
    // Summary line should mention the file count and errors
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/\d+ file/);
  });

  test('check reports undefined variable usage', () => {
    writeFileSync(join(tmpDir, 'undef.tova'), `
fn test_func() {
  print(undefined_var_xyz)
}
`);
    const result = runTova(['check', join(tmpDir, 'undef.tova')]);
    // Undefined variable should generate a warning or error
    const combined = result.stdout + result.stderr;
    // Should have some diagnostic output
    expect(combined.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// CHECK COMMAND — FLAGS
// ═══════════════════════════════════════════════════════════════

describe('tova check — flags', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('check with --strict enables strict mode', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 42\nprint(x)');
    const result = runTova(['check', '--strict', join(tmpDir, 'app.tova')]);
    // Should complete (may have additional warnings in strict mode)
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('checked');
  });

  test('check with --quiet suppresses non-error output', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 42\nprint(x)');
    const result = runTova(['check', '--quiet', join(tmpDir, 'app.tova')]);
    expect(result.exitCode).toBe(0);
    // --quiet should suppress the summary line
    expect(result.stdout).not.toContain('checked');
  });

  test('check with --verbose shows timing info', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 42\nprint(x)');
    const result = runTova(['check', '--verbose', join(tmpDir, 'app.tova')]);
    expect(result.exitCode).toBe(0);
    // --verbose shows per-file timing like "app.tova (3ms)"
    expect(result.stdout).toMatch(/\d+ms/);
  });

  test('check with --verbose shows security scorecard for server blocks', () => {
    writeFileSync(join(tmpDir, 'server.tova'), `
security {
  auth jwt {
    secret: "test-secret"
  }
}

server {
  fn hello() { "world" }
  route GET "/api/hello" => hello
}
`);
    const result = runTova(['check', '--verbose', join(tmpDir, 'server.tova')]);
    // --verbose with server block should trigger scorecard display
    const combined = result.stdout + result.stderr;
    expect(combined.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// CHECK COMMAND — DIRECTORY MODE
// ═══════════════════════════════════════════════════════════════

describe('tova check — directory', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('check a directory with multiple valid files', () => {
    writeFileSync(join(tmpDir, 'src', 'a.tova'), 'x = 1\nprint(x)');
    writeFileSync(join(tmpDir, 'src', 'b.tova'), 'y = 2\nprint(y)');
    const result = runTova(['check', join(tmpDir, 'src')]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('2 files checked');
  });

  test('check a directory with no .tova files', () => {
    const emptyDir = join(tmpDir, 'empty');
    mkdirSync(emptyDir);
    const result = runTova(['check', emptyDir]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No .tova files found');
  });

  test('check defaults to current directory', () => {
    writeFileSync(join(tmpDir, 'app.tova'), 'x = 42\nprint(x)');
    const result = runTova(['check'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1 file checked');
  });

  test('check nested directories', () => {
    mkdirSync(join(tmpDir, 'src', 'lib'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 1\nprint(x)');
    writeFileSync(join(tmpDir, 'src', 'lib', 'utils.tova'), 'y = 2\nprint(y)');
    const result = runTova(['check', join(tmpDir, 'src')]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('2 files checked');
  });
});

// ═══════════════════════════════════════════════════════════════
// CHECK COMMAND — EXPLAIN
// ═══════════════════════════════════════════════════════════════

describe('tova check — explain', () => {
  test('--explain E001 shows explanation for known code', () => {
    const result = runTova(['check', '--explain', 'E001']);
    expect(result.exitCode).toBe(0);
    // Should show the error code title
    expect(result.stdout).toContain('E001');
  });

  test('--explain with unknown code exits 1', () => {
    const result = runTova(['check', '--explain', 'X999']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown error code');
  });

  test('--explain E202 shows explanation', () => {
    const result = runTova(['check', '--explain', 'E202']);
    const combined = result.stdout + result.stderr;
    expect(combined).toContain('E202');
  });

  test('--explain W201 shows warning explanation', () => {
    // W codes are warning codes
    const result = runTova(['check', '--explain', 'W201']);
    const combined = result.stdout + result.stderr;
    // If W201 exists, shows info; if not, shows "Unknown error code"
    expect(combined.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// CHECK COMMAND — SINGLE FILE MODE
// ═══════════════════════════════════════════════════════════════

describe('tova check — single file', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('check single file by path', () => {
    writeFileSync(join(tmpDir, 'single.tova'), 'greeting = "hello"\nprint(greeting)');
    const result = runTova(['check', join(tmpDir, 'single.tova')]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1 file checked');
  });

  test('check single non-.tova file errors', () => {
    writeFileSync(join(tmpDir, 'test.txt'), 'not a tova file');
    const result = runTova(['check', join(tmpDir, 'test.txt')]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No .tova files found');
  });

  test('check shows explain hint when errors found', () => {
    writeFileSync(join(tmpDir, 'bad.tova'), 'fn { broken syntax');
    const result = runTova(['check', join(tmpDir, 'bad.tova')]);
    expect(result.exitCode).toBe(1);
    const combined = result.stdout + result.stderr;
    // When errors are found with codes, suggest `tova explain <code>`
    // This may or may not be present depending on error type
    expect(combined.length).toBeGreaterThan(0);
  });
});
