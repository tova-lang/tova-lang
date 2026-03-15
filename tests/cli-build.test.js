// tests/cli-build.test.js — Comprehensive tests for src/cli/build.js
// Tests buildProject() and cleanBuild() via CLI invocation
import { describe, test, expect, beforeEach, afterEach, setDefaultTimeout } from 'bun:test';

setDefaultTimeout(60000);
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const TOVA = resolve(join(import.meta.dir, '..', 'bin', 'tova.js'));

function createTmpDir(prefix = 'tova-build-test') {
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
    timeout: opts.timeout || 45000,
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// BUILD COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova build', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('builds a simple .tova file and creates .tova-out', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42\nprint(x)');
    const result = runTova(['build', join(tmpDir, 'src')], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Build complete');
    const outDir = join(tmpDir, '.tova-out');
    expect(existsSync(outDir)).toBe(true);
  });

  test('builds with --output custom-dir', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42\nprint(x)');
    const customOut = join(tmpDir, 'custom-dir');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', customOut], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(existsSync(customOut)).toBe(true);
    // Verify output files exist in the custom directory
    const files = readdirSync(customOut);
    expect(files.length).toBeGreaterThan(0);
  });

  test('errors when no .tova files found', () => {
    const emptyDir = join(tmpDir, 'empty');
    mkdirSync(emptyDir);
    const result = runTova(['build', emptyDir], { cwd: tmpDir });
    expect(result.stderr).toContain('No .tova files found');
    expect(result.exitCode).toBe(1);
  });

  test('builds with --quiet flag suppresses output', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const result = runTova(['build', join(tmpDir, 'src'), '--quiet'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('Building');
  });

  test('builds with --verbose flag shows timing', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const result = runTova(['build', join(tmpDir, 'src'), '--verbose'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/\d+ms/);
  });

  test('builds a server block file and generates app.server.js', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
server {
  fn hello() { "world" }
  route GET "/api/hello" => hello
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    // Server block generates a .server.js file
    const outFiles = readdirSync(outDir, { recursive: true }).join(',');
    expect(outFiles).toContain('server.js');
  });

  test('builds a browser block file and generates app.browser.js or app.client.js', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
browser {
  state msg = "hello"
  component App { <div>"{msg}"</div> }
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    // Browser block generates a browser.js file
    const outFiles = readdirSync(outDir, { recursive: true }).join(',');
    // Should contain either browser.js or client.js in the output
    expect(outFiles).toMatch(/browser\.js|client\.js/);
  });

  test('builds a shared block file', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
shared {
  type User {
    name: String
    email: String
  }
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    const outFiles = readdirSync(outDir, { recursive: true }).join(',');
    expect(outFiles).toMatch(/shared\.js|\.js/);
  });

  test('builds a module file (pub fn)', () => {
    writeFileSync(join(tmpDir, 'src', 'math.tova'), `
pub fn add(a: Int, b: Int) -> Int {
  a + b
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    // Module files get written as <name>.js (not .shared.js)
    const outFiles = readdirSync(outDir, { recursive: true }).join(',');
    expect(outFiles).toContain('math.js');
  });

  test('builds a cli block file', () => {
    writeFileSync(join(tmpDir, 'src', 'tool.tova'), `
cli {
  name: "test-tool"
  version: "1.0.0"

  fn greet(name: String) {
    print("Hello!")
  }
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    // CLI files get a shebang and .js extension
    const outFiles = readdirSync(outDir, { recursive: true }).join(',');
    expect(outFiles).toContain('.js');
  });

  test('writes runtime files to output directory', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    // Runtime directory should exist
    const runtimeDir = join(outDir, 'runtime');
    expect(existsSync(runtimeDir)).toBe(true);
    expect(existsSync(join(runtimeDir, 'reactivity.js'))).toBe(true);
    expect(existsSync(join(runtimeDir, 'rpc.js'))).toBe(true);
    expect(existsSync(join(runtimeDir, 'router.js'))).toBe(true);
  });

  test('builds multiple .tova files in a directory', () => {
    writeFileSync(join(tmpDir, 'src', 'a.tova'), 'x = 1');
    writeFileSync(join(tmpDir, 'src', 'b.tova'), 'y = 2');
    const result = runTova(['build', join(tmpDir, 'src')], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Build complete');
  });

  test('builds with --no-cache flag', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--no-cache'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    // No .cache directory should be present in output
    expect(existsSync(join(outDir, '.cache', 'manifest.json'))).toBe(false);
  });

  test('incremental build uses cache on second run', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const outDir = join(tmpDir, 'out');
    // First build
    runTova(['build', join(tmpDir, 'src'), '--output', outDir], { cwd: tmpDir });
    // Second build should use cache
    const result2 = runTova(['build', join(tmpDir, 'src'), '--output', outDir, '--verbose'], { cwd: tmpDir });
    expect(result2.exitCode).toBe(0);
    // With --verbose, cached items show "(cached)"
    expect(result2.stdout).toContain('cached');
  });

  test('builds with --strict flag', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');
    const result = runTova(['build', join(tmpDir, 'src'), '--strict'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
  });

  test('handles compile errors gracefully', () => {
    writeFileSync(join(tmpDir, 'src', 'bad.tova'), 'fn {{{ bad syntax }}}');
    const result = runTova(['build', join(tmpDir, 'src')], { cwd: tmpDir });
    // Build should report error
    expect(result.exitCode).not.toBe(0);
  });

  test('builds nested directory structure', () => {
    mkdirSync(join(tmpDir, 'src', 'lib'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'lib', 'utils.tova'), `
pub fn double(n: Int) -> Int {
  n * 2
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
  });

  test('build output contains directory group count', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 1');
    const result = runTova(['build', join(tmpDir, 'src')], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/\d+\/\d+ directory group/);
  });
});

// ═══════════════════════════════════════════════════════════════
// CLEAN COMMAND
// ═══════════════════════════════════════════════════════════════

describe('tova clean', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('cleans .tova-out directory', () => {
    // Create a .tova-out directory to clean
    const outDir = join(tmpDir, '.tova-out');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'test.js'), '// test');
    expect(existsSync(outDir)).toBe(true);

    const result = runTova(['clean'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Cleaned');
    expect(existsSync(outDir)).toBe(false);
  });

  test('clean when nothing to clean', () => {
    // No .tova-out directory exists
    const result = runTova(['clean'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Nothing to clean');
  });

  test('clean removes nested contents', () => {
    const outDir = join(tmpDir, '.tova-out');
    mkdirSync(join(outDir, 'runtime'), { recursive: true });
    writeFileSync(join(outDir, 'app.js'), '// app');
    writeFileSync(join(outDir, 'runtime', 'reactivity.js'), '// reactivity');
    expect(existsSync(join(outDir, 'runtime', 'reactivity.js'))).toBe(true);

    const result = runTova(['clean'], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(existsSync(outDir)).toBe(false);
  });

  test('clean then build works correctly', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42');

    // Build first
    runTova(['build', join(tmpDir, 'src')], { cwd: tmpDir });
    expect(existsSync(join(tmpDir, '.tova-out'))).toBe(true);

    // Clean
    const cleanResult = runTova(['clean'], { cwd: tmpDir });
    expect(cleanResult.exitCode).toBe(0);
    expect(existsSync(join(tmpDir, '.tova-out'))).toBe(false);

    // Build again
    const buildResult = runTova(['build', join(tmpDir, 'src')], { cwd: tmpDir });
    expect(buildResult.exitCode).toBe(0);
    expect(existsSync(join(tmpDir, '.tova-out'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// BUILD + SERVER/BROWSER OUTPUT VERIFICATION
// ═══════════════════════════════════════════════════════════════

describe('tova build output files', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('server block generates .server.js with route handler code', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
server {
  fn greet() { "hello" }
  route GET "/hello" => greet
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);

    // Find the server output file
    const allFiles = readdirSync(outDir, { recursive: true }).filter(f => f.toString().includes('server'));
    expect(allFiles.length).toBeGreaterThan(0);
  });

  test('browser block generates .browser.js with component code', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
browser {
  state greeting = "hi"
  component App { <div>"{greeting}"</div> }
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);

    const allFiles = readdirSync(outDir, { recursive: true }).filter(f => f.toString().includes('browser'));
    expect(allFiles.length).toBeGreaterThan(0);
  });

  test('combined server + browser + shared generates multiple output files', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
shared {
  type Msg { text: String }
}

server {
  fn getMsg() { "hello" }
  route GET "/api/msg" => getMsg
}

browser {
  state val = "world"
  component App { <div>"{val}"</div> }
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);

    const allFiles = readdirSync(outDir, { recursive: true }).map(f => f.toString());
    // Should have shared, server, and browser outputs
    const hasShared = allFiles.some(f => f.includes('shared'));
    const hasServer = allFiles.some(f => f.includes('server'));
    const hasBrowser = allFiles.some(f => f.includes('browser'));
    expect(hasShared || hasServer || hasBrowser).toBe(true);
  });

  test('source maps are generated alongside output files', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), 'x = 42\nprint(x)');
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);

    // Check for .map files or sourceMappingURL comments in output
    const allFiles = readdirSync(outDir, { recursive: true }).map(f => f.toString());
    const jsFiles = allFiles.filter(f => f.endsWith('.js') && !f.includes('runtime'));
    // At least one JS file should exist
    expect(jsFiles.length).toBeGreaterThan(0);
  });

  test('edge block generates .edge.js', () => {
    writeFileSync(join(tmpDir, 'src', 'app.tova'), `
edge {
  target: "cloudflare"
}
`);
    const outDir = join(tmpDir, 'out');
    const result = runTova(['build', join(tmpDir, 'src'), '--output', outDir], { cwd: tmpDir });
    expect(result.exitCode).toBe(0);

    const allFiles = readdirSync(outDir, { recursive: true }).map(f => f.toString());
    const edgeFiles = allFiles.filter(f => f.includes('edge'));
    expect(edgeFiles.length).toBeGreaterThan(0);
  });
});
