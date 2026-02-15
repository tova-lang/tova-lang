import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resolveConfig } from '../src/config/resolve.js';
import { generatePackageJson } from '../src/config/package-json.js';
import { addToSection, removeFromSection } from '../src/config/edit-toml.js';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const TMP_DIR = join(import.meta.dir, '.tmp-config-test');

beforeEach(() => {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('resolveConfig', () => {
  test('returns defaults when no config files exist', () => {
    const config = resolveConfig(TMP_DIR);
    expect(config._source).toBe('defaults');
    expect(config.project.name).toBe('tova-app');
    expect(config.project.entry).toBe('src');
    expect(config.dev.port).toBe(3000);
  });

  test('reads tova.toml when present', () => {
    writeFileSync(join(TMP_DIR, 'tova.toml'), `
[project]
name = "test-app"
version = "2.0.0"
entry = "app"

[dev]
port = 8080

[npm]
zod = "^3.0.0"

[npm.dev]
prettier = "^3.0.0"
`);
    const config = resolveConfig(TMP_DIR);
    expect(config._source).toBe('tova.toml');
    expect(config.project.name).toBe('test-app');
    expect(config.project.version).toBe('2.0.0');
    expect(config.project.entry).toBe('app');
    expect(config.dev.port).toBe(8080);
    expect(config.npm.prod.zod).toBe('^3.0.0');
    expect(config.npm.dev.prettier).toBe('^3.0.0');
  });

  test('falls back to package.json', () => {
    writeFileSync(join(TMP_DIR, 'package.json'), JSON.stringify({
      name: 'pkg-app',
      version: '1.0.0',
      dependencies: { express: '^4.0.0' },
    }));
    const config = resolveConfig(TMP_DIR);
    expect(config._source).toBe('package.json');
    expect(config.project.name).toBe('pkg-app');
    expect(config.npm.prod.express).toBe('^4.0.0');
  });

  test('prefers tova.toml over package.json', () => {
    writeFileSync(join(TMP_DIR, 'tova.toml'), `
[project]
name = "toml-app"
`);
    writeFileSync(join(TMP_DIR, 'package.json'), JSON.stringify({
      name: 'pkg-app',
    }));
    const config = resolveConfig(TMP_DIR);
    expect(config._source).toBe('tova.toml');
    expect(config.project.name).toBe('toml-app');
  });
});

describe('generatePackageJson', () => {
  test('returns null when no npm deps', () => {
    const config = {
      project: { name: 'test', version: '1.0.0' },
      npm: {},
    };
    expect(generatePackageJson(config)).toBeNull();
  });

  test('generates package.json with prod deps', () => {
    const config = {
      project: { name: 'test', version: '1.0.0' },
      npm: { prod: { zod: '^3.0.0' } },
    };
    const pkg = generatePackageJson(config);
    expect(pkg.name).toBe('test');
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe('module');
    expect(pkg.dependencies.zod).toBe('^3.0.0');
    expect(pkg['//'] ).toContain('Auto-generated');
  });

  test('generates package.json with dev deps', () => {
    const config = {
      project: { name: 'test', version: '1.0.0' },
      npm: { dev: { prettier: '^3.0.0' } },
    };
    const pkg = generatePackageJson(config);
    expect(pkg.devDependencies.prettier).toBe('^3.0.0');
  });

  test('no scripts section in generated package.json', () => {
    const config = {
      project: { name: 'test', version: '1.0.0' },
      npm: { prod: { htmx: '^2.0.0' } },
    };
    const pkg = generatePackageJson(config);
    expect(pkg.scripts).toBeUndefined();
  });
});

describe('edit-toml', () => {
  test('adds key to existing section', () => {
    const path = join(TMP_DIR, 'test.toml');
    writeFileSync(path, `[npm]
htmx = "^2.0.0"
`);
    addToSection(path, 'npm', 'zod', '^3.0.0');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('zod = "^3.0.0"');
    expect(content).toContain('htmx = "^2.0.0"');
  });

  test('adds key to new section', () => {
    const path = join(TMP_DIR, 'test.toml');
    writeFileSync(path, `[project]
name = "test"
`);
    addToSection(path, 'npm', 'zod', '^3.0.0');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('[npm]');
    expect(content).toContain('zod = "^3.0.0"');
  });

  test('updates existing key value', () => {
    const path = join(TMP_DIR, 'test.toml');
    writeFileSync(path, `[npm]
zod = "^2.0.0"
`);
    addToSection(path, 'npm', 'zod', '^3.0.0');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('zod = "^3.0.0"');
    expect(content).not.toContain('^2.0.0');
  });

  test('removes key from section', () => {
    const path = join(TMP_DIR, 'test.toml');
    writeFileSync(path, `[npm]
htmx = "^2.0.0"
zod = "^3.0.0"
`);
    const removed = removeFromSection(path, 'npm', 'zod');
    expect(removed).toBe(true);
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('htmx = "^2.0.0"');
    expect(content).not.toContain('zod');
  });

  test('returns false when key not found', () => {
    const path = join(TMP_DIR, 'test.toml');
    writeFileSync(path, `[npm]
htmx = "^2.0.0"
`);
    const removed = removeFromSection(path, 'npm', 'nonexistent');
    expect(removed).toBe(false);
  });

  test('returns false when section not found', () => {
    const path = join(TMP_DIR, 'test.toml');
    writeFileSync(path, `[project]
name = "test"
`);
    const removed = removeFromSection(path, 'npm', 'zod');
    expect(removed).toBe(false);
  });

  test('adds key to dotted section', () => {
    const path = join(TMP_DIR, 'test.toml');
    writeFileSync(path, `[npm]
htmx = "^2.0.0"

[npm.dev]
prettier = "^3.0.0"
`);
    addToSection(path, 'npm.dev', 'eslint', '^9.0.0');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('eslint = "^9.0.0"');
    expect(content).toContain('prettier = "^3.0.0"');
  });
});
