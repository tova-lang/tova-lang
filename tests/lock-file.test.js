// tests/lock-file.test.js
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { writeLockFile, readLockFile } from '../src/config/lock-file.js';

const TMP_DIR = join(import.meta.dir, '.tmp-lock-test');

beforeEach(() => {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('writeLockFile', () => {
  test('writes TOML lock file', () => {
    const resolved = {
      'github.com/alice/tova-http': { version: '1.3.0', sha: 'a1b2c3d4', source: 'https://github.com/alice/tova-http.git' },
    };
    const npmDeps = { 'cookie-parser': '1.4.7' };
    writeLockFile(TMP_DIR, resolved, npmDeps);
    const content = readFileSync(join(TMP_DIR, 'tova.lock'), 'utf-8');
    expect(content).toContain('[lock]');
    expect(content).toContain('github.com/alice/tova-http');
    expect(content).toContain('1.3.0');
    expect(content).toContain('a1b2c3d4');
  });
});

describe('readLockFile', () => {
  test('reads lock file and returns resolved map', () => {
    const lockContent = `[lock]
generated = "2026-02-27T10:00:00Z"

["github.com/alice/tova-http"]
version = "1.3.0"
sha = "a1b2c3d4"
source = "https://github.com/alice/tova-http.git"

[npm]
cookie-parser = "1.4.7"
`;
    writeFileSync(join(TMP_DIR, 'tova.lock'), lockContent);
    const lock = readLockFile(TMP_DIR);
    expect(lock.modules['github.com/alice/tova-http'].version).toBe('1.3.0');
    expect(lock.modules['github.com/alice/tova-http'].sha).toBe('a1b2c3d4');
    expect(lock.npm['cookie-parser']).toBe('1.4.7');
  });
  test('returns null when no lock file exists', () => {
    expect(readLockFile(TMP_DIR)).toBe(null);
  });
});
