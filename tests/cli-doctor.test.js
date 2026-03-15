import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
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
  let doctorOutput;
  let doctorStatus;

  beforeAll(() => {
    tmpDir = path.join(__dirname, '..', '.tmp-doctor-cmd-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    // Run doctor once and share the result across tests
    const result = runTova(['doctor'], { cwd: tmpDir });
    doctorOutput = result.stdout || '';
    doctorStatus = result.status;
  });

  afterAll(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('outputs doctor header', () => {
    expect(doctorOutput).toContain('Tova Doctor');
  });

  test('checks Bun version', () => {
    expect(doctorOutput).toContain('Bun');
  });

  test('checks git availability', () => {
    expect(doctorOutput).toContain('git');
  });

  test('checks PATH configuration', () => {
    expect(doctorOutput).toContain('PATH');
  });

  test('checks shell profile', () => {
    expect(doctorOutput).toContain('Shell profile');
  });

  test('reports tova.toml status', () => {
    // Without tova.toml, should warn "not in a Tova project"
    expect(doctorOutput).toMatch(/tova\.toml|not in a Tova project/);
  });

  test('reports tova.toml found when present', () => {
    writeFileSync(path.join(tmpDir, 'tova.toml'), `[project]\nname = "test"\n`);

    const result = runTova(['doctor'], { cwd: tmpDir });
    const output = result.stdout || '';
    expect(output).toContain('tova.toml');
  });

  test('shows Tova version in output', () => {
    // Version line: "Tova v<VERSION>"
    expect(doctorOutput).toMatch(/Tova v\d+\.\d+/);
  });

  test('shows summary line', () => {
    // Summary should mention "checks passed" or similar
    expect(doctorOutput).toMatch(/checks passed/i);
  });

  test('exit code 0 when all checks pass', () => {
    // With Bun and git available, basic checks should pass
    expect(doctorStatus).toBe(0);
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
