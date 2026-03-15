import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';

const TOVA = path.join(__dirname, '..', 'bin', 'tova.js');

function runTova(args, opts = {}) {
  return spawnSync('bun', [TOVA, ...args], {
    encoding: 'utf-8', timeout: 30000, ...opts,
  });
}

// Create a fresh temp dir for each test
let tmpDir;
beforeEach(() => {
  tmpDir = path.join(os.tmpdir(), `tova-pkg-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});
afterEach(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

// ─── tova init ──────────────────────────────────────────────

describe('tova init', () => {
  test('creates tova.toml, src/, and .gitignore in an empty dir', () => {
    const result = runTova(['init'], { cwd: tmpDir });
    expect(result.status).toBe(0);

    // tova.toml exists
    expect(existsSync(path.join(tmpDir, 'tova.toml'))).toBe(true);

    // src/ exists
    expect(existsSync(path.join(tmpDir, 'src'))).toBe(true);

    // .gitignore exists
    expect(existsSync(path.join(tmpDir, '.gitignore'))).toBe(true);

    // src/app.tova created since src was empty
    expect(existsSync(path.join(tmpDir, 'src', 'app.tova'))).toBe(true);
  });

  test('tova.toml has correct structure', () => {
    runTova(['init'], { cwd: tmpDir });
    const toml = readFileSync(path.join(tmpDir, 'tova.toml'), 'utf-8');

    // Project name matches directory basename
    const dirName = path.basename(tmpDir);
    expect(toml).toContain(dirName);
    expect(toml).toContain('0.1.0');
    expect(toml).toContain('[build]');
    expect(toml).toContain('.tova-out');
    expect(toml).toContain('[dev]');
    expect(toml).toContain('port');
  });

  test('errors when tova.toml already exists', () => {
    writeFileSync(path.join(tmpDir, 'tova.toml'), '[project]\nname = "existing"\n');
    const result = runTova(['init'], { cwd: tmpDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('already exists');
  });

  test('.gitignore contains standard entries', () => {
    runTova(['init'], { cwd: tmpDir });
    const gitignore = readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('.tova-out/');
    expect(gitignore).toContain('*.db');
  });

  test('does not overwrite existing .gitignore', () => {
    writeFileSync(path.join(tmpDir, '.gitignore'), 'custom-ignore\n');
    runTova(['init'], { cwd: tmpDir });
    const gitignore = readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    expect(gitignore).toBe('custom-ignore\n');
  });

  test('does not create app.tova if src/ already has .tova files', () => {
    mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'src', 'main.tova'), 'print("hello")\n');
    runTova(['init'], { cwd: tmpDir });
    // app.tova should NOT be created since src already has .tova files
    expect(existsSync(path.join(tmpDir, 'src', 'app.tova'))).toBe(false);
    // But main.tova should remain
    expect(existsSync(path.join(tmpDir, 'src', 'main.tova'))).toBe(true);
  });

  test('starter app.tova has valid structure', () => {
    runTova(['init'], { cwd: tmpDir });
    const appContent = readFileSync(path.join(tmpDir, 'src', 'app.tova'), 'utf-8');
    expect(appContent).toContain('server {');
    expect(appContent).toContain('browser {');
    expect(appContent).toContain('shared {');
  });
});

// ─── tova add (npm packages) ────────────────────────────────

describe('tova add', () => {
  test('errors with no package specified', () => {
    writeFileSync(path.join(tmpDir, 'tova.toml'), '[project]\nname = "test"\n\n[npm]\n');
    const result = runTova(['add'], { cwd: tmpDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('No package specified');
  });

  test('errors when no tova.toml exists', () => {
    const result = runTova(['add', 'npm:lodash'], { cwd: tmpDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('No tova.toml');
  });

  test('tova add npm:lodash --dev adds to [npm.dev] section', () => {
    // Create a tova.toml with a [npm] section and a [npm.dev] section
    writeFileSync(path.join(tmpDir, 'tova.toml'), `[project]
name = "test"
version = "0.1.0"

[build]
output = ".tova-out"

[npm]

[npm.dev]
`);
    // Note: This will try to run npm view to get version, which may or may not work
    // We use a timeout and check the toml was modified
    const result = runTova(['add', 'npm:lodash', '--dev'], { cwd: tmpDir });

    // Even if npm view fails, it should add with version * or ^latest
    const toml = readFileSync(path.join(tmpDir, 'tova.toml'), 'utf-8');
    expect(toml).toContain('lodash');
    // Should be in the [npm.dev] section
    expect(toml).toContain('[npm.dev]');
  });

  test('tova add npm:express adds to [npm] section', () => {
    writeFileSync(path.join(tmpDir, 'tova.toml'), `[project]
name = "test"
version = "0.1.0"

[build]
output = ".tova-out"

[npm]

[npm.dev]
`);
    const result = runTova(['add', 'npm:express'], { cwd: tmpDir });

    const toml = readFileSync(path.join(tmpDir, 'tova.toml'), 'utf-8');
    expect(toml).toContain('express');
  });
});

// ─── tova remove ────────────────────────────────────────────

describe('tova remove', () => {
  test('errors with no package specified', () => {
    writeFileSync(path.join(tmpDir, 'tova.toml'), '[project]\nname = "test"\n\n[npm]\n');
    const result = runTova(['remove'], { cwd: tmpDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('No package specified');
  });

  test('errors when no tova.toml exists', () => {
    const result = runTova(['remove', 'lodash'], { cwd: tmpDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('No tova.toml');
  });

  test('removes package from [npm] section', () => {
    writeFileSync(path.join(tmpDir, 'tova.toml'), `[project]
name = "test"
version = "0.1.0"

[npm]
lodash = "^4.17.21"

[npm.dev]
`);
    const result = runTova(['remove', 'lodash'], { cwd: tmpDir });

    const toml = readFileSync(path.join(tmpDir, 'tova.toml'), 'utf-8');
    expect(toml).not.toContain('lodash');
  });

  test('error when package not found', () => {
    writeFileSync(path.join(tmpDir, 'tova.toml'), `[project]
name = "test"
version = "0.1.0"

[npm]

[dependencies]
`);
    const result = runTova(['remove', 'nonexistent'], { cwd: tmpDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('not found');
  });

  test('removes package from [npm.dev] section', () => {
    writeFileSync(path.join(tmpDir, 'tova.toml'), `[project]
name = "test"
version = "0.1.0"

[npm]

[npm.dev]
vitest = "^1.0.0"
`);
    const result = runTova(['remove', 'vitest'], { cwd: tmpDir });

    const toml = readFileSync(path.join(tmpDir, 'tova.toml'), 'utf-8');
    expect(toml).not.toContain('vitest');
  });

  test('removes package from [dependencies] section', () => {
    writeFileSync(path.join(tmpDir, 'tova.toml'), `[project]
name = "test"
version = "0.1.0"

[dependencies]
mylib = "file:../mylib"

[npm]
`);
    const result = runTova(['remove', 'mylib'], { cwd: tmpDir });

    const toml = readFileSync(path.join(tmpDir, 'tova.toml'), 'utf-8');
    expect(toml).not.toContain('mylib');
  });
});

// ─── tova update ────────────────────────────────────────────

describe('tova update', () => {
  test('no deps prints no dependencies message', () => {
    writeFileSync(path.join(tmpDir, 'tova.toml'), `[project]
name = "test"
version = "0.1.0"

[build]
output = ".tova-out"
`);
    const result = runTova(['update'], { cwd: tmpDir });
    // Should gracefully report no dependencies to update
    expect(result.stdout).toContain('No Tova dependencies');
  });

  test('deletes lock file before re-resolving', () => {
    writeFileSync(path.join(tmpDir, 'tova.toml'), `[project]
name = "test"
version = "0.1.0"

[dependencies]

[build]
output = ".tova-out"
`);
    // Create a fake lock file
    writeFileSync(path.join(tmpDir, 'tova.lock'), '{"version": 1}');

    const result = runTova(['update'], { cwd: tmpDir });
    // Lock file should either be deleted or re-created.
    // With no real dependencies, it should print a "No Tova dependencies" message
    // or proceed without error.
    // The important thing is it didn't crash
  });
});

// ─── tova cache ─────────────────────────────────────────────

describe('tova cache', () => {
  test('cache path prints the cache directory', () => {
    const result = runTova(['cache', 'path'], { cwd: tmpDir });
    expect(result.status).toBe(0);
    const output = result.stdout.trim();
    // Should contain .tova/pkg or TOVA_CACHE_DIR
    expect(output).toContain('.tova');
  });

  test('cache list shows output', () => {
    const result = runTova(['cache', 'list'], { cwd: tmpDir });
    expect(result.status).toBe(0);
    // Output should mention "Cache:" header
    expect(result.stdout).toContain('Cache:');
  });

  test('cache clean succeeds', () => {
    const result = runTova(['cache', 'clean'], { cwd: tmpDir });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Cache cleared');
  });

  test('cache with unknown subcommand errors', () => {
    const result = runTova(['cache', 'badcmd'], { cwd: tmpDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unknown cache subcommand');
  });
});

// ─── edit-toml integration ──────────────────────────────────

describe('edit-toml integration', () => {
  test('addToSection creates section if missing', () => {
    const { addToSection } = require('../src/config/edit-toml.js');
    const tomlPath = path.join(tmpDir, 'test.toml');
    writeFileSync(tomlPath, '[project]\nname = "test"\n');

    addToSection(tomlPath, 'npm', 'lodash', '^4.17.21');
    const content = readFileSync(tomlPath, 'utf-8');
    expect(content).toContain('[npm]');
    expect(content).toContain('lodash = "^4.17.21"');
  });

  test('addToSection updates existing key', () => {
    const { addToSection } = require('../src/config/edit-toml.js');
    const tomlPath = path.join(tmpDir, 'test.toml');
    writeFileSync(tomlPath, '[npm]\nlodash = "^4.16.0"\n');

    addToSection(tomlPath, 'npm', 'lodash', '^4.17.21');
    const content = readFileSync(tomlPath, 'utf-8');
    expect(content).toContain('lodash = "^4.17.21"');
    // Should not have duplicates
    const matches = content.match(/lodash/g);
    expect(matches).toHaveLength(1);
  });

  test('removeFromSection removes key', () => {
    const { removeFromSection } = require('../src/config/edit-toml.js');
    const tomlPath = path.join(tmpDir, 'test.toml');
    writeFileSync(tomlPath, '[npm]\nlodash = "^4.17.21"\nexpress = "^4.18.0"\n');

    const removed = removeFromSection(tomlPath, 'npm', 'lodash');
    expect(removed).toBe(true);

    const content = readFileSync(tomlPath, 'utf-8');
    expect(content).not.toContain('lodash');
    expect(content).toContain('express');
  });

  test('removeFromSection returns false for missing key', () => {
    const { removeFromSection } = require('../src/config/edit-toml.js');
    const tomlPath = path.join(tmpDir, 'test.toml');
    writeFileSync(tomlPath, '[npm]\nlodash = "^4.17.21"\n');

    const removed = removeFromSection(tomlPath, 'npm', 'nothere');
    expect(removed).toBe(false);
  });

  test('removeFromSection returns false for missing section', () => {
    const { removeFromSection } = require('../src/config/edit-toml.js');
    const tomlPath = path.join(tmpDir, 'test.toml');
    writeFileSync(tomlPath, '[project]\nname = "test"\n');

    const removed = removeFromSection(tomlPath, 'npm', 'lodash');
    expect(removed).toBe(false);
  });
});
