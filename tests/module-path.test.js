import { describe, test, expect } from 'bun:test';
import { isTovModule, parseModulePath, moduleToGitUrl, expandBlessedPackage, BLESSED_PACKAGES } from '../src/config/module-path.js';

describe('isTovModule', () => {
  test('detects github.com module path', () => {
    expect(isTovModule('github.com/alice/tova-http')).toBe(true);
  });
  test('detects gitlab.com module path', () => {
    expect(isTovModule('gitlab.com/bob/router')).toBe(true);
  });
  test('detects custom domain', () => {
    expect(isTovModule('gitea.mycompany.com/internal/auth')).toBe(true);
  });
  test('rejects relative path', () => {
    expect(isTovModule('./utils')).toBe(false);
  });
  test('rejects parent path', () => {
    expect(isTovModule('../lib/helpers')).toBe(false);
  });
  test('rejects npm package', () => {
    expect(isTovModule('zod')).toBe(false);
  });
  test('rejects scoped npm package', () => {
    expect(isTovModule('@scope/pkg')).toBe(false);
  });
  test('rejects node built-in', () => {
    expect(isTovModule('node:fs')).toBe(false);
  });
  test('rejects empty string', () => {
    expect(isTovModule('')).toBe(false);
  });
});

describe('parseModulePath', () => {
  test('parses simple module path', () => {
    const result = parseModulePath('github.com/alice/tova-http');
    expect(result).toEqual({
      host: 'github.com',
      owner: 'alice',
      repo: 'tova-http',
      subpath: null,
      full: 'github.com/alice/tova-http',
    });
  });
  test('parses module path with subpath', () => {
    const result = parseModulePath('github.com/alice/tova-db/postgres');
    expect(result).toEqual({
      host: 'github.com',
      owner: 'alice',
      repo: 'tova-db',
      subpath: 'postgres',
      full: 'github.com/alice/tova-db',
    });
  });
  test('parses deep subpath', () => {
    const result = parseModulePath('github.com/alice/tova-db/adapters/postgres');
    expect(result).toEqual({
      host: 'github.com',
      owner: 'alice',
      repo: 'tova-db',
      subpath: 'adapters/postgres',
      full: 'github.com/alice/tova-db',
    });
  });
  test('throws on invalid path', () => {
    expect(() => parseModulePath('zod')).toThrow();
  });
});

describe('moduleToGitUrl', () => {
  test('converts github path to HTTPS URL', () => {
    expect(moduleToGitUrl('github.com/alice/tova-http')).toBe('https://github.com/alice/tova-http.git');
  });
  test('converts gitlab path to HTTPS URL', () => {
    expect(moduleToGitUrl('gitlab.com/bob/router')).toBe('https://gitlab.com/bob/router.git');
  });
  test('converts custom domain path to HTTPS URL', () => {
    expect(moduleToGitUrl('gitea.mycompany.com/internal/auth')).toBe('https://gitea.mycompany.com/internal/auth.git');
  });
});

describe('blessed package resolution', () => {
  test('BLESSED_PACKAGES contains all 10 official packages', () => {
    const expected = ['fp', 'validate', 'encoding', 'test', 'retry', 'template', 'data', 'stats', 'plot', 'ml'];
    for (const pkg of expected) {
      expect(BLESSED_PACKAGES).toHaveProperty(pkg);
      expect(BLESSED_PACKAGES[pkg]).toBe(`github.com/tova-lang/${pkg}`);
    }
  });

  test('expandBlessedPackage expands tova/data to full path', () => {
    expect(expandBlessedPackage('tova/data')).toBe('github.com/tova-lang/data');
  });

  test('expandBlessedPackage expands tova/fp to full path', () => {
    expect(expandBlessedPackage('tova/fp')).toBe('github.com/tova-lang/fp');
  });

  test('expandBlessedPackage returns null for unknown tova/ packages', () => {
    expect(expandBlessedPackage('tova/unknown')).toBe(null);
  });

  test('expandBlessedPackage returns null for non-tova paths', () => {
    expect(expandBlessedPackage('github.com/alice/lib')).toBe(null);
    expect(expandBlessedPackage('./local')).toBe(null);
    expect(expandBlessedPackage('lodash')).toBe(null);
  });

  test('expandBlessedPackage preserves subpath', () => {
    expect(expandBlessedPackage('tova/encoding/toml')).toBe('github.com/tova-lang/encoding/toml');
    expect(expandBlessedPackage('tova/data/io/csv')).toBe('github.com/tova-lang/data/io/csv');
  });

  test('isTovModule recognizes tova/ shorthand as a Tova module', () => {
    expect(isTovModule('tova/data')).toBe(true);
    expect(isTovModule('tova/fp')).toBe(true);
  });

  test('isTovModule rejects unknown tova/ packages', () => {
    expect(isTovModule('tova/unknown')).toBe(false);
  });

  test('parseModulePath works with tova/ shorthand', () => {
    const parsed = parseModulePath('tova/data');
    expect(parsed.host).toBe('github.com');
    expect(parsed.owner).toBe('tova-lang');
    expect(parsed.repo).toBe('data');
    expect(parsed.full).toBe('github.com/tova-lang/data');
  });

  test('parseModulePath preserves subpath in tova/ shorthand', () => {
    const parsed = parseModulePath('tova/encoding/toml');
    expect(parsed.host).toBe('github.com');
    expect(parsed.owner).toBe('tova-lang');
    expect(parsed.repo).toBe('encoding');
    expect(parsed.subpath).toBe('toml');
  });
});
