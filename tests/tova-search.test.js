// tests/tova-search.test.js
import { describe, test, expect } from 'bun:test';
import { formatSearchResults } from '../src/config/search.js';

describe('formatSearchResults', () => {
  test('formats GitHub API results', () => {
    const items = [
      {
        full_name: 'alice/tova-http',
        description: 'HTTP server for Tova',
        stargazers_count: 42,
        updated_at: '2026-02-20T00:00:00Z',
      },
    ];
    const output = formatSearchResults(items);
    expect(output).toContain('github.com/alice/tova-http');
    expect(output).toContain('HTTP server for Tova');
    expect(output).toContain('42');
  });
  test('handles empty results', () => {
    const output = formatSearchResults([]);
    expect(output).toContain('No packages found');
  });
  test('handles item with no description', () => {
    const items = [
      {
        full_name: 'bob/tova-router',
        description: null,
        stargazers_count: 5,
        updated_at: '2026-01-15T00:00:00Z',
      },
    ];
    const output = formatSearchResults(items);
    expect(output).toContain('github.com/bob/tova-router');
    expect(output).toContain('(no description)');
  });
});
