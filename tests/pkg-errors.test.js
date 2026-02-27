// tests/pkg-errors.test.js
import { describe, test, expect } from 'bun:test';
import { formatVersionConflict, formatFetchError, formatMissingEntry, formatAuthError, formatCircularDep, formatIntegrityError } from '../src/config/pkg-errors.js';

describe('package error messages', () => {
  test('formats version conflict', () => {
    const msg = formatVersionConflict('github.com/alice/http', [
      { source: 'github.com/carol/web', constraint: '^1.0.0' },
      { source: 'github.com/dave/api', constraint: '^2.0.0' },
    ]);
    expect(msg).toContain('version conflict');
    expect(msg).toContain('github.com/alice/http');
    expect(msg).toContain('^1.0.0');
    expect(msg).toContain('^2.0.0');
  });

  test('formats fetch error', () => {
    const msg = formatFetchError('github.com/alice/http', 'Could not resolve host');
    expect(msg).toContain('failed to fetch');
    expect(msg).toContain('github.com/alice/http');
  });

  test('formats fetch error with cached versions', () => {
    const msg = formatFetchError('github.com/alice/http', 'Could not resolve host', ['1.2.0', '1.2.1']);
    expect(msg).toContain('Cached versions available');
    expect(msg).toContain('1.2.0');
    expect(msg).toContain('--offline');
  });

  test('formats missing entry point', () => {
    const msg = formatMissingEntry('github.com/alice/http', '1.3.0');
    expect(msg).toContain('no entry point');
    expect(msg).toContain('src/lib.tova');
  });

  test('formats auth error', () => {
    const msg = formatAuthError('github.com/myorg/internal');
    expect(msg).toContain('authentication failed');
    expect(msg).toContain('SSH key');
  });

  test('formats circular dependency', () => {
    const msg = formatCircularDep(['github.com/a/http', 'github.com/b/middleware', 'github.com/a/http']);
    expect(msg).toContain('circular dependency');
    expect(msg).toContain('github.com/a/http');
  });

  test('formats integrity error', () => {
    const msg = formatIntegrityError('github.com/alice/http', '1.3.0', 'a1b2c3', '9z8y7x');
    expect(msg).toContain('integrity check failed');
    expect(msg).toContain('a1b2c3');
    expect(msg).toContain('9z8y7x');
    expect(msg).toContain('force-pushed');
  });
});
