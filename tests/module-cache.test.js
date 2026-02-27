import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import {
  getCacheDir,
  getModuleCachePath,
  isVersionCached,
  listCachedVersions,
  getCompileCachePath,
  cleanUnusedVersions,
} from '../src/config/module-cache.js';

const TEST_CACHE = join(import.meta.dir, '.tmp-cache-test');

describe('getCacheDir', () => {
  test('returns ~/.tova/pkg by default', () => {
    const dir = getCacheDir();
    expect(dir).toContain('.tova');
    expect(dir).toEndWith('pkg');
  });
  test('respects override parameter', () => {
    const dir = getCacheDir(TEST_CACHE);
    expect(dir).toBe(TEST_CACHE);
  });
});

describe('getModuleCachePath', () => {
  test('returns correct path for module + version', () => {
    const p = getModuleCachePath('github.com/alice/tova-http', '1.3.0', TEST_CACHE);
    expect(p).toBe(join(TEST_CACHE, 'github.com', 'alice', 'tova-http', 'v1.3.0'));
  });
});

describe('getCompileCachePath', () => {
  test('returns correct compile cache path', () => {
    const p = getCompileCachePath('github.com/alice/tova-http', '1.3.0', TEST_CACHE);
    expect(p).toBe(join(TEST_CACHE, '.cache', 'github.com/alice/tova-http', 'v1.3.0'));
  });
});

describe('isVersionCached', () => {
  beforeEach(() => {
    if (existsSync(TEST_CACHE)) rmSync(TEST_CACHE, { recursive: true, force: true });
  });
  afterEach(() => {
    if (existsSync(TEST_CACHE)) rmSync(TEST_CACHE, { recursive: true, force: true });
  });

  test('returns false when not cached', () => {
    expect(isVersionCached('github.com/alice/tova-http', '1.0.0', TEST_CACHE)).toBe(false);
  });
  test('returns true when cached', () => {
    const p = join(TEST_CACHE, 'github.com', 'alice', 'tova-http', 'v1.0.0');
    mkdirSync(p, { recursive: true });
    writeFileSync(join(p, 'tova.toml'), '[package]\nname = "test"\n');
    expect(isVersionCached('github.com/alice/tova-http', '1.0.0', TEST_CACHE)).toBe(true);
  });
});

describe('listCachedVersions', () => {
  beforeEach(() => {
    if (existsSync(TEST_CACHE)) rmSync(TEST_CACHE, { recursive: true, force: true });
  });
  afterEach(() => {
    if (existsSync(TEST_CACHE)) rmSync(TEST_CACHE, { recursive: true, force: true });
  });

  test('returns empty array when nothing cached', () => {
    expect(listCachedVersions('github.com/alice/tova-http', TEST_CACHE)).toEqual([]);
  });
  test('returns sorted versions', () => {
    const base = join(TEST_CACHE, 'github.com', 'alice', 'tova-http');
    mkdirSync(join(base, 'v1.2.0'), { recursive: true });
    mkdirSync(join(base, 'v1.0.0'), { recursive: true });
    mkdirSync(join(base, 'v1.1.0'), { recursive: true });
    const versions = listCachedVersions('github.com/alice/tova-http', TEST_CACHE);
    expect(versions).toEqual(['1.0.0', '1.1.0', '1.2.0']);
  });
});

describe('cleanUnusedVersions', () => {
  beforeEach(() => {
    if (existsSync(TEST_CACHE)) rmSync(TEST_CACHE, { recursive: true, force: true });
  });
  afterEach(() => {
    if (existsSync(TEST_CACHE)) rmSync(TEST_CACHE, { recursive: true, force: true });
  });

  test('removes versions not in keep list', () => {
    const base = join(TEST_CACHE, 'github.com', 'alice', 'tova-http');
    mkdirSync(join(base, 'v1.0.0'), { recursive: true });
    mkdirSync(join(base, 'v1.1.0'), { recursive: true });
    mkdirSync(join(base, 'v1.2.0'), { recursive: true });
    const removed = cleanUnusedVersions('github.com/alice/tova-http', ['1.2.0'], TEST_CACHE);
    expect(removed).toEqual(['1.0.0', '1.1.0']);
    expect(existsSync(join(base, 'v1.2.0'))).toBe(true);
    expect(existsSync(join(base, 'v1.0.0'))).toBe(false);
  });
});
