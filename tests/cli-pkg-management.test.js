// tests/cli-pkg-management.test.js
import { describe, test, expect } from 'bun:test';
import { isTovModule } from '../src/config/module-path.js';
import { addToSection, removeFromSection } from '../src/config/edit-toml.js';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Test the detection logic used by `tova add`
describe('tova add detection', () => {
  test('detects Tova module from add argument', () => {
    expect(isTovModule('github.com/alice/tova-http')).toBe(true);
  });
  test('detects Tova module with version suffix', () => {
    // The @ version is stripped before checking
    const arg = 'github.com/alice/tova-http@1.3.0';
    const name = arg.includes('@') ? arg.slice(0, arg.lastIndexOf('@')) : arg;
    expect(isTovModule(name)).toBe(true);
  });
  test('npm: prefix still routes to npm', () => {
    expect(isTovModule('npm:zod')).toBe(false);
  });
  test('relative path is not a Tova module', () => {
    expect(isTovModule('./local-lib')).toBe(false);
  });
  test('scoped npm package is not a Tova module', () => {
    expect(isTovModule('@scope/pkg')).toBe(false);
  });
  test('plain name without dots is not a Tova module', () => {
    expect(isTovModule('lodash')).toBe(false);
  });
});

// Test quoted-key handling in edit-toml
describe('edit-toml quoted key handling', () => {
  let tmpDir;

  function setup(content) {
    tmpDir = join(tmpdir(), 'tova-test-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    const filePath = join(tmpDir, 'tova.toml');
    writeFileSync(filePath, content);
    return filePath;
  }

  function cleanup() {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }

  test('addToSection with quoted key', () => {
    const filePath = setup('[dependencies]\n');
    addToSection(filePath, 'dependencies', '"github.com/alice/http"', '^1.0.0');
    const result = readFileSync(filePath, 'utf-8');
    expect(result).toContain('"github.com/alice/http" = "^1.0.0"');
    cleanup();
  });

  test('removeFromSection with quoted key', () => {
    const filePath = setup('[dependencies]\n"github.com/alice/http" = "^1.0.0"\n');
    const removed = removeFromSection(filePath, 'dependencies', '"github.com/alice/http"');
    expect(removed).toBe(true);
    const result = readFileSync(filePath, 'utf-8');
    expect(result).not.toContain('github.com/alice/http');
    cleanup();
  });

  test('removeFromSection matches quoted key against unquoted search', () => {
    const filePath = setup('[dependencies]\n"github.com/alice/http" = "^1.0.0"\n');
    const removed = removeFromSection(filePath, 'dependencies', 'github.com/alice/http');
    expect(removed).toBe(true);
    const result = readFileSync(filePath, 'utf-8');
    expect(result).not.toContain('github.com/alice/http');
    cleanup();
  });

  test('addToSection updates existing quoted key', () => {
    const filePath = setup('[dependencies]\n"github.com/alice/http" = "^1.0.0"\n');
    addToSection(filePath, 'dependencies', '"github.com/alice/http"', '^2.0.0');
    const result = readFileSync(filePath, 'utf-8');
    expect(result).toContain('"github.com/alice/http" = "^2.0.0"');
    // Should not have duplicate entries
    const matches = result.match(/github\.com\/alice\/http/g);
    expect(matches.length).toBe(1);
    cleanup();
  });
});
