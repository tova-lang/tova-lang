// tests/resolver.test.js
import { describe, test, expect } from 'bun:test';
import { mergeDependencies, mergeNpmDeps, detectConflicts } from '../src/config/resolver.js';

describe('mergeDependencies', () => {
  test('merges non-overlapping deps', () => {
    const a = { 'github.com/alice/http': '^1.0.0' };
    const b = { 'github.com/bob/jwt': '^2.0.0' };
    const merged = mergeDependencies(a, b);
    expect(merged).toEqual({
      'github.com/alice/http': ['^1.0.0'],
      'github.com/bob/jwt': ['^2.0.0'],
    });
  });
  test('collects multiple constraints for same module', () => {
    const a = { 'github.com/alice/http': '^1.0.0' };
    const b = { 'github.com/alice/http': '^1.2.0' };
    const merged = mergeDependencies(a, b);
    expect(merged).toEqual({
      'github.com/alice/http': ['^1.0.0', '^1.2.0'],
    });
  });
});

describe('mergeNpmDeps', () => {
  test('merges npm deps from multiple modules', () => {
    const modules = [
      { npm: { prod: { zod: '^3.0.0' } } },
      { npm: { prod: { express: '^4.0.0' } } },
    ];
    const merged = mergeNpmDeps(modules);
    expect(merged).toEqual({ zod: '^3.0.0', express: '^4.0.0' });
  });
  test('keeps highest constraint for same npm package', () => {
    const modules = [
      { npm: { prod: { zod: '^3.0.0' } } },
      { npm: { prod: { zod: '^3.2.0' } } },
    ];
    const merged = mergeNpmDeps(modules);
    expect(merged).toEqual({ zod: '^3.2.0' });
  });
});

describe('detectConflicts', () => {
  test('no conflict for compatible constraints', () => {
    const constraints = { 'github.com/alice/http': ['^1.0.0', '^1.2.0'] };
    const available = { 'github.com/alice/http': ['1.0.0', '1.2.0', '1.5.0'] };
    const conflicts = detectConflicts(constraints, available);
    expect(conflicts).toEqual([]);
  });
  test('detects conflict for incompatible major versions', () => {
    const constraints = { 'github.com/alice/http': ['^1.0.0', '^2.0.0'] };
    const available = { 'github.com/alice/http': ['1.0.0', '1.5.0', '2.0.0'] };
    const conflicts = detectConflicts(constraints, available);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].module).toBe('github.com/alice/http');
  });
});
