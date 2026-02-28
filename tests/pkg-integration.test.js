// tests/pkg-integration.test.js
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { isTovModule, parseModulePath, moduleToGitUrl } from '../src/config/module-path.js';
import { parseSemver, satisfies, selectMinVersion } from '../src/config/semver.js';
import { mergeDependencies, mergeNpmDeps, detectConflicts, resolveDependencies } from '../src/config/resolver.js';
import { writeLockFile, readLockFile } from '../src/config/lock-file.js';
import { findEntryPoint } from '../src/config/module-entry.js';

const TMP = join(import.meta.dir, '.tmp-pkg-integration');

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});
afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
});

describe('full resolution flow (mocked I/O)', () => {
  test('resolves a simple dependency tree', async () => {
    const rootDeps = {
      'github.com/alice/http': '^1.0.0',
      'github.com/bob/jwt': '^2.0.0',
    };

    const mockVersions = {
      'github.com/alice/http': ['1.0.0', '1.1.0', '1.2.0'],
      'github.com/bob/jwt': ['2.0.0', '2.1.0'],
      'github.com/carol/logger': ['1.0.0'],
    };

    const mockConfigs = {
      'github.com/alice/http': {
        dependencies: { 'github.com/carol/logger': '^1.0.0' },
        npm: { prod: { 'cookie-parser': '^1.4.0' } },
      },
      'github.com/bob/jwt': { dependencies: {}, npm: {} },
      'github.com/carol/logger': { dependencies: {}, npm: {} },
    };

    const { resolved, npmDeps } = await resolveDependencies(rootDeps, {
      getAvailableVersions: async (mod) => mockVersions[mod] || [],
      getModuleConfig: async (mod) => mockConfigs[mod] || null,
      getVersionSha: async (mod, ver) => `sha-${mod}-${ver}`,
    });

    expect(resolved['github.com/alice/http'].version).toBe('1.0.0');
    expect(resolved['github.com/bob/jwt'].version).toBe('2.0.0');
    expect(resolved['github.com/carol/logger'].version).toBe('1.0.0');
    expect(npmDeps['cookie-parser']).toBe('^1.4.0');
  });

  test('resolves transitive deps with tightened constraints', async () => {
    const rootDeps = {
      'github.com/alice/http': '^1.0.0',
    };

    const mockVersions = {
      'github.com/alice/http': ['1.0.0', '1.2.0'],
      'github.com/bob/utils': ['1.0.0', '1.1.0', '1.2.0', '1.3.0'],
    };

    const mockConfigs = {
      'github.com/alice/http': {
        dependencies: { 'github.com/bob/utils': '^1.2.0' },
        npm: {},
      },
      'github.com/bob/utils': { dependencies: {}, npm: {} },
    };

    const { resolved } = await resolveDependencies(rootDeps, {
      getAvailableVersions: async (mod) => mockVersions[mod] || [],
      getModuleConfig: async (mod) => mockConfigs[mod] || null,
      getVersionSha: async (mod, ver) => `sha-${mod}-${ver}`,
    });

    expect(resolved['github.com/alice/http'].version).toBe('1.0.0');
    expect(resolved['github.com/bob/utils'].version).toBe('1.2.0');
  });

  test('lock file round-trip', () => {
    const resolved = {
      'github.com/alice/http': { version: '1.2.0', sha: 'abc123', source: 'https://github.com/alice/http.git' },
      'github.com/bob/jwt': { version: '2.0.0', sha: 'def456', source: 'https://github.com/bob/jwt.git' },
    };
    writeLockFile(TMP, resolved, { zod: '^3.0.0' });

    const lock = readLockFile(TMP);
    expect(lock.modules['github.com/alice/http'].version).toBe('1.2.0');
    expect(lock.modules['github.com/alice/http'].sha).toBe('abc123');
    expect(lock.modules['github.com/bob/jwt'].version).toBe('2.0.0');
    expect(lock.npm.zod).toBe('^3.0.0');
  });

  test('entry point resolution with package structure', () => {
    mkdirSync(join(TMP, 'src'), { recursive: true });
    writeFileSync(join(TMP, 'src', 'lib.tova'), 'pub fn hello() { "hello" }');
    writeFileSync(join(TMP, 'tova.toml'), '[package]\nname = "test"\nversion = "1.0.0"');
    const entry = findEntryPoint(TMP);
    expect(entry).toBe(join(TMP, 'src', 'lib.tova'));
  });

  test('sub-package entry point resolution', () => {
    mkdirSync(join(TMP, 'postgres'), { recursive: true });
    writeFileSync(join(TMP, 'postgres', 'lib.tova'), 'pub fn connect() { }');
    const entry = findEntryPoint(TMP, null, 'postgres');
    expect(entry).toBe(join(TMP, 'postgres', 'lib.tova'));
  });

  test('module path \u2192 git URL \u2192 cache path round-trip', () => {
    const source = 'github.com/alice/tova-db/postgres';
    expect(isTovModule(source)).toBe(true);
    const parsed = parseModulePath(source);
    expect(parsed.host).toBe('github.com');
    expect(parsed.owner).toBe('alice');
    expect(parsed.repo).toBe('tova-db');
    expect(parsed.subpath).toBe('postgres');
    expect(moduleToGitUrl(source)).toBe('https://github.com/alice/tova-db.git');
  });

  test('semver minimum version selection with multiple constraints', () => {
    const versions = ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0', '2.0.0'];
    // Two packages need ^1.2.0 and ^1.3.0 — minimum satisfying both is 1.3.0
    expect(selectMinVersion(versions, ['^1.2.0', '^1.3.0'])).toBe('1.3.0');
  });

  test('version conflict detection', () => {
    const constraints = {
      'github.com/alice/http': ['^1.0.0', '^2.0.0'],
    };
    const available = {
      'github.com/alice/http': ['1.0.0', '1.5.0', '2.0.0'],
    };
    const conflicts = detectConflicts(constraints, available);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].module).toBe('github.com/alice/http');
  });

  test('npm dependency merging from transitive deps', () => {
    const modules = [
      { npm: { prod: { 'cookie-parser': '^1.4.0' } } },
      { npm: { prod: { zod: '^3.0.0' } } },
      { npm: { prod: { zod: '^3.2.0' } } },
    ];
    const merged = mergeNpmDeps(modules);
    expect(merged['cookie-parser']).toBe('^1.4.0');
    expect(merged.zod).toBe('^3.2.0');
  });
});
