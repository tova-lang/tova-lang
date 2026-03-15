import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';

const TOVA = path.join(__dirname, '..', 'bin', 'tova.js');

function runTova(args, opts = {}) {
  return spawnSync('bun', [TOVA, ...args], {
    encoding: 'utf-8', timeout: 30000, ...opts
  });
}

// ─── tova doctor ────────────────────────────────────────────

describe('tova doctor', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = path.join(__dirname, '..', '.tmp-doctor-cmd-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('outputs doctor header', () => {
    const result = runTova(['doctor'], { cwd: tmpDir });
    const output = result.stdout || '';
    expect(output).toContain('Tova Doctor');
  });

  test('checks Bun version', () => {
    const result = runTova(['doctor'], { cwd: tmpDir });
    const output = result.stdout || '';
    expect(output).toContain('Bun');
  });

  test('checks git availability', () => {
    const result = runTova(['doctor'], { cwd: tmpDir });
    const output = result.stdout || '';
    expect(output).toContain('git');
  });

  test('checks PATH configuration', () => {
    const result = runTova(['doctor'], { cwd: tmpDir });
    const output = result.stdout || '';
    expect(output).toContain('PATH');
  });

  test('checks shell profile', () => {
    const result = runTova(['doctor'], { cwd: tmpDir });
    const output = result.stdout || '';
    expect(output).toContain('Shell profile');
  });

  test('reports tova.toml status', () => {
    const result = runTova(['doctor'], { cwd: tmpDir });
    const output = result.stdout || '';
    // Without tova.toml, should warn "not in a Tova project"
    expect(output).toMatch(/tova\.toml|not in a Tova project/);
  });

  test('reports tova.toml found when present', () => {
    writeFileSync(path.join(tmpDir, 'tova.toml'), `[project]\nname = "test"\n`);

    const result = runTova(['doctor'], { cwd: tmpDir });
    const output = result.stdout || '';
    expect(output).toContain('tova.toml');
  });

  test('shows Tova version in output', () => {
    const result = runTova(['doctor'], { cwd: tmpDir });
    const output = result.stdout || '';
    // Version line: "Tova v<VERSION>"
    expect(output).toMatch(/Tova v\d+\.\d+/);
  });

  test('shows summary line', () => {
    const result = runTova(['doctor'], { cwd: tmpDir });
    const output = result.stdout || '';
    // Summary should mention "checks passed" or similar
    expect(output).toMatch(/checks passed/i);
  });

  test('exit code 0 when all checks pass', () => {
    const result = runTova(['doctor'], { cwd: tmpDir });
    // With Bun and git available, basic checks should pass
    expect(result.status).toBe(0);
  });

  test('checks build output status', () => {
    // With tova.toml but no build output
    writeFileSync(path.join(tmpDir, 'tova.toml'), `[project]\nname = "test"\n`);

    const result = runTova(['doctor'], { cwd: tmpDir });
    const output = result.stdout || '';
    // Should mention build output status (either "not built yet" or build dir info)
    expect(output).toMatch(/[Bb]uild output|not built/);
  });
});
