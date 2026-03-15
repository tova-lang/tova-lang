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

// ─── tova info ──────────────────────────────────────────────

describe('tova info', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = path.join(__dirname, '..', '.tmp-info-cmd-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('outputs version info', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    const output = result.stdout || '';
    // The ASCII art banner contains "TOVA" characters
    expect(output).toContain('v');
  });

  test('outputs Bun version', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    const output = result.stdout || '';
    expect(output).toContain('Bun');
  });

  test('outputs platform info', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    const output = result.stdout || '';
    expect(output).toContain('Platform');
    // Should contain os and arch
    expect(output).toMatch(/darwin|linux|win32/);
    expect(output).toMatch(/x64|arm64|arm/);
  });

  test('outputs Runtime label', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    const output = result.stdout || '';
    expect(output).toContain('Runtime');
  });

  test('shows project info when tova.toml exists', () => {
    writeFileSync(path.join(tmpDir, 'tova.toml'), `[project]
name = "my-project"
version = "1.2.3"
`);

    const result = runTova(['info'], { cwd: tmpDir });
    const output = result.stdout || '';
    expect(output).toContain('Project Config');
    expect(output).toContain('my-project');
    expect(output).toContain('1.2.3');
  });

  test('shows default message when no tova.toml exists', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    const output = result.stdout || '';
    expect(output).toContain('No tova.toml');
  });

  test('shows Node compat version', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    const output = result.stdout || '';
    expect(output).toContain('Node compat');
  });

  test('shows build output status', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    const output = result.stdout || '';
    expect(output).toContain('Build output');
  });

  test('exits with code 0', () => {
    const result = runTova(['info'], { cwd: tmpDir });
    expect(result.status).toBe(0);
  });
});
