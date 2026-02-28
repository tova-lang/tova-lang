import { describe, test, expect } from 'bun:test';
import { parseSemver, compareSemver, parseConstraint, satisfies, selectMinVersion } from '../src/config/semver.js';

describe('parseSemver', () => {
  test('parses major.minor.patch', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });
  test('parses with v prefix', () => {
    expect(parseSemver('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });
  test('parses major.minor (patch defaults to 0)', () => {
    expect(parseSemver('1.2')).toEqual({ major: 1, minor: 2, patch: 0 });
  });
  test('throws on invalid', () => {
    expect(() => parseSemver('abc')).toThrow();
  });
});

describe('compareSemver', () => {
  test('equal versions return 0', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });
  test('greater major returns 1', () => {
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
  });
  test('lesser minor returns -1', () => {
    expect(compareSemver('1.1.0', '1.2.0')).toBe(-1);
  });
  test('greater patch returns 1', () => {
    expect(compareSemver('1.2.4', '1.2.3')).toBe(1);
  });
});

describe('parseConstraint', () => {
  test('parses caret ^1.2.0', () => {
    const c = parseConstraint('^1.2.0');
    expect(c.type).toBe('caret');
    expect(c.version).toEqual({ major: 1, minor: 2, patch: 0 });
  });
  test('parses tilde ~1.2.0', () => {
    const c = parseConstraint('~1.2.0');
    expect(c.type).toBe('tilde');
  });
  test('parses exact 1.2.0', () => {
    const c = parseConstraint('1.2.0');
    expect(c.type).toBe('exact');
  });
  test('parses >=1.0.0', () => {
    const c = parseConstraint('>=1.0.0');
    expect(c.type).toBe('gte');
  });
});

describe('satisfies', () => {
  test('^1.2.0 satisfied by 1.2.0', () => {
    expect(satisfies('1.2.0', '^1.2.0')).toBe(true);
  });
  test('^1.2.0 satisfied by 1.9.9', () => {
    expect(satisfies('1.9.9', '^1.2.0')).toBe(true);
  });
  test('^1.2.0 NOT satisfied by 2.0.0', () => {
    expect(satisfies('2.0.0', '^1.2.0')).toBe(false);
  });
  test('^1.2.0 NOT satisfied by 1.1.0', () => {
    expect(satisfies('1.1.0', '^1.2.0')).toBe(false);
  });
  test('~1.2.0 satisfied by 1.2.5', () => {
    expect(satisfies('1.2.5', '~1.2.0')).toBe(true);
  });
  test('~1.2.0 NOT satisfied by 1.3.0', () => {
    expect(satisfies('1.3.0', '~1.2.0')).toBe(false);
  });
  test('exact 1.2.0 satisfied by 1.2.0', () => {
    expect(satisfies('1.2.0', '1.2.0')).toBe(true);
  });
  test('exact 1.2.0 NOT satisfied by 1.2.1', () => {
    expect(satisfies('1.2.1', '1.2.0')).toBe(false);
  });
});

describe('selectMinVersion', () => {
  test('selects minimum from available versions satisfying constraint', () => {
    const versions = ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '2.0.0'];
    expect(selectMinVersion(versions, '^1.2.0')).toBe('1.2.0');
  });
  test('selects minimum for multiple constraints', () => {
    const versions = ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '2.0.0'];
    expect(selectMinVersion(versions, ['^1.1.0', '^1.2.0'])).toBe('1.2.0');
  });
  test('returns null when no version satisfies', () => {
    const versions = ['1.0.0', '1.1.0'];
    expect(selectMinVersion(versions, '^2.0.0')).toBe(null);
  });
  test('returns null when constraints conflict', () => {
    const versions = ['1.0.0', '1.5.0', '2.0.0', '2.5.0'];
    expect(selectMinVersion(versions, ['^1.0.0', '^2.0.0'])).toBe(null);
  });
});
