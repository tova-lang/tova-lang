import { describe, test, expect } from 'bun:test';
import { isTovModule, parseModulePath, moduleToGitUrl } from '../src/config/module-path.js';

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
