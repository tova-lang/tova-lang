import { describe, test, expect, beforeEach, afterEach, setDefaultTimeout } from 'bun:test';

setDefaultTimeout(60000);
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';

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

// ─── tova run <file> ────────────────────────────────────────

describe('tova run', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = path.join(__dirname, '..', '.tmp-run-cmd-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('runs a simple .tova file and captures output', () => {
    const filePath = path.join(tmpDir, 'hello.tova');
    writeFileSync(filePath, 'print("hello from tova")');

    const result = runTova(['run', filePath]);
    expect(result.stdout).toContain('hello from tova');
  });

  test('runs a .tova file that imports a local JS module', () => {
    const helperPath = path.join(tmpDir, 'helper.js');
    const filePath = path.join(tmpDir, 'main.tova');
    writeFileSync(helperPath, 'export const greeting = "hello from js";\n');
    writeFileSync(filePath, 'import { greeting } from "./helper.js"\nprint(greeting)');

    const result = runTova(['run', filePath]);
    const output = (result.stdout || '') + (result.stderr || '');
    expect(output).toContain('hello from js');
    expect(result.status).toBe(0);
  });

  test('runs a .tova file whose imported .tova dependency imports local JS', () => {
    const helperPath = path.join(tmpDir, 'helper.js');
    const libPath = path.join(tmpDir, 'lib.tova');
    const filePath = path.join(tmpDir, 'main.tova');
    writeFileSync(helperPath, 'export const suffix = "from nested js";\n');
    writeFileSync(libPath, 'import { suffix } from "./helper.js"\npub fn nested_greeting() -> String {\n  "hello " + suffix\n}');
    writeFileSync(filePath, 'import { nested_greeting } from "./lib.tova"\nprint(nested_greeting())');

    const result = runTova(['run', filePath]);
    const output = (result.stdout || '') + (result.stderr || '');
    expect(output).toContain('hello from nested js');
    expect(result.status).toBe(0);
  });

  test('auto-discovers main.tova when no file specified', () => {
    writeFileSync(path.join(tmpDir, 'main.tova'), 'print("from main")');
    // Create a tova.toml so resolveConfig finds it and uses entry dir
    writeFileSync(path.join(tmpDir, 'tova.toml'), `[project]\nname = "test"\nentry = "."\n`);

    const result = runTova(['run'], { cwd: tmpDir });
    expect(result.stdout).toContain('from main');
  });

  test('auto-discovers app.tova when no file specified and no main.tova', () => {
    writeFileSync(path.join(tmpDir, 'app.tova'), 'print("from app")');
    writeFileSync(path.join(tmpDir, 'tova.toml'), `[project]\nname = "test"\nentry = "."\n`);

    const result = runTova(['run'], { cwd: tmpDir });
    expect(result.stdout).toContain('from app');
  });

  test('errors when file does not exist', () => {
    const result = runTova(['run', path.join(tmpDir, 'nonexistent.tova')]);
    const output = (result.stdout || '') + (result.stderr || '');
    expect(output).toContain('not found');
    expect(result.status).not.toBe(0);
  });

  test('passes script args via -- separator', () => {
    const filePath = path.join(tmpDir, 'args.tova');
    // __tova_args is available inside the AsyncFunction context
    writeFileSync(filePath, `
fn main(args) {
  print(args)
}
`);

    const result = runTova(['run', filePath, '--', 'arg1', 'arg2']);
    const output = result.stdout || '';
    expect(output).toContain('arg1');
    expect(output).toContain('arg2');
  });

  test('direct file execution without "run" subcommand', () => {
    const filePath = path.join(tmpDir, 'direct.tova');
    writeFileSync(filePath, 'print("direct execution")');

    const result = runTova([filePath]);
    expect(result.stdout).toContain('direct execution');
  });

  test('auto-calls main() if defined', () => {
    const filePath = path.join(tmpDir, 'with_main.tova');
    writeFileSync(filePath, `fn main() {
  print("from main fn")
}`);

    const result = runTova(['run', filePath]);
    expect(result.stdout).toContain('from main fn');
  });

  test('strict mode with --strict flag', () => {
    const filePath = path.join(tmpDir, 'strict.tova');
    writeFileSync(filePath, 'print("strict mode")');

    const result = runTova(['run', '--strict', filePath]);
    // Should still run successfully
    expect(result.stdout).toContain('strict mode');
  });

  test('errors when no file specified and no tova.toml', () => {
    // tmpDir has no tova.toml and no main.tova
    const result = runTova(['run'], { cwd: tmpDir });
    const output = (result.stdout || '') + (result.stderr || '');
    expect(output).toContain('No file specified');
    expect(result.status).not.toBe(0);
  });

  test('runs file with expressions and computations', () => {
    const filePath = path.join(tmpDir, 'compute.tova');
    writeFileSync(filePath, `
x = 10
y = 20
print(x + y)
`);

    const result = runTova(['run', filePath]);
    expect(result.stdout).toContain('30');
  });
});
