import { describe, test, expect } from 'bun:test';
import { parseTagList, sortTags, pickLatestTag } from '../src/config/git-resolver.js';

describe('parseTagList', () => {
  test('parses git ls-remote output', () => {
    const output = `a1b2c3d4\trefs/tags/v1.0.0\na1b2c3d4\trefs/tags/v1.0.0^{}\nb2c3d4e5\trefs/tags/v1.1.0\nb2c3d4e5\trefs/tags/v1.1.0^{}`;
    const tags = parseTagList(output);
    expect(tags).toEqual([
      { version: '1.0.0', sha: 'a1b2c3d4' },
      { version: '1.1.0', sha: 'b2c3d4e5' },
    ]);
  });
  test('skips non-semver tags', () => {
    const output = `abc123\trefs/tags/latest\ndef456\trefs/tags/v1.0.0\ndef456\trefs/tags/v1.0.0^{}`;
    const tags = parseTagList(output);
    expect(tags).toEqual([{ version: '1.0.0', sha: 'def456' }]);
  });
  test('handles empty output', () => {
    expect(parseTagList('')).toEqual([]);
  });
  test('handles tags without v prefix', () => {
    const output = `abc123\trefs/tags/1.0.0\nabc123\trefs/tags/1.0.0^{}`;
    const tags = parseTagList(output);
    expect(tags).toEqual([{ version: '1.0.0', sha: 'abc123' }]);
  });
  test('prefers dereferenced SHA', () => {
    const output = `aaa111\trefs/tags/v1.0.0\nbbb222\trefs/tags/v1.0.0^{}`;
    const tags = parseTagList(output);
    expect(tags).toEqual([{ version: '1.0.0', sha: 'bbb222' }]);
  });
});

describe('sortTags', () => {
  test('sorts by semver ascending', () => {
    const tags = [
      { version: '1.2.0', sha: 'a' },
      { version: '1.0.0', sha: 'b' },
      { version: '1.1.0', sha: 'c' },
    ];
    const sorted = sortTags(tags);
    expect(sorted.map(t => t.version)).toEqual(['1.0.0', '1.1.0', '1.2.0']);
  });
});

describe('pickLatestTag', () => {
  test('returns highest version', () => {
    const tags = [
      { version: '1.0.0', sha: 'a' },
      { version: '2.0.0', sha: 'b' },
      { version: '1.5.0', sha: 'c' },
    ];
    expect(pickLatestTag(tags)).toEqual({ version: '2.0.0', sha: 'b' });
  });
  test('returns null for empty list', () => {
    expect(pickLatestTag([])).toBe(null);
  });
});
