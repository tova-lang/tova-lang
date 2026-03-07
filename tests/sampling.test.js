import { describe, test, expect } from 'bun:test';
import {
  Table, table_sample, table_stratified_sample,
} from '../src/runtime/table.js';

// 100-row test table: id (0-99), group ('A'/'B'/'C'), val (i*10)
const groups = ['A', 'B', 'C'];
const testRows = Array.from({ length: 100 }, (_, i) => ({
  id: i,
  group: groups[i % 3],
  val: i * 10,
}));
const testTable = new Table(testRows, ['id', 'group', 'val']);

describe('table_sample', () => {
  test('sample N rows (10)', () => {
    const s = table_sample(testTable, 10, { seed: 42 });
    expect(s.length).toBe(10);
    expect(s.columns).toEqual(['id', 'group', 'val']);
    // All rows should come from the original table
    for (const row of s._rows) {
      expect(row.id).toBeGreaterThanOrEqual(0);
      expect(row.id).toBeLessThan(100);
      expect(row.val).toBe(row.id * 10);
    }
  });

  test('sample fraction (0.1)', () => {
    const s = table_sample(testTable, 0.1, { seed: 42 });
    expect(s.length).toBe(10); // 0.1 * 100 = 10
    expect(s.columns).toEqual(['id', 'group', 'val']);
  });

  test('seed reproducibility — same seed gives same result', () => {
    const a = table_sample(testTable, 10, { seed: 123 });
    const b = table_sample(testTable, 10, { seed: 123 });
    expect(a._rows).toEqual(b._rows);
  });

  test('different seeds differ', () => {
    const a = table_sample(testTable, 10, { seed: 1 });
    const b = table_sample(testTable, 10, { seed: 999 });
    // Extremely unlikely to be identical with different seeds
    const aIds = a._rows.map(r => r.id).sort((x, y) => x - y);
    const bIds = b._rows.map(r => r.id).sort((x, y) => x - y);
    expect(aIds).not.toEqual(bIds);
  });

  test('oversized N returns full table', () => {
    const s = table_sample(testTable, 200);
    expect(s.length).toBe(100);
    expect(s.columns).toEqual(['id', 'group', 'val']);
  });

  test('sample(0) returns empty', () => {
    const s = table_sample(testTable, 0);
    expect(s.length).toBe(0);
    expect(s.columns).toEqual(['id', 'group', 'val']);
  });
});

describe('table_stratified_sample', () => {
  test('N per group (5) — 3 groups * 5 = 15 rows', () => {
    const s = table_stratified_sample(testTable, 'group', 5, { seed: 42 });
    expect(s.length).toBe(15);
    // Verify equal distribution
    const counts = {};
    for (const row of s._rows) {
      counts[row.group] = (counts[row.group] || 0) + 1;
    }
    expect(counts['A']).toBe(5);
    expect(counts['B']).toBe(5);
    expect(counts['C']).toBe(5);
  });

  test('fraction per group (0.5)', () => {
    const s = table_stratified_sample(testTable, 'group', 0.5, { seed: 42 });
    // Group A has 34 rows (i%3==0: 0,3,...,99), B has 33, C has 33
    // 0.5 * 34 = 17, 0.5 * 33 = 16, 0.5 * 33 = 16 → total ~49
    const counts = {};
    for (const row of s._rows) {
      counts[row.group] = (counts[row.group] || 0) + 1;
    }
    expect(counts['A']).toBe(17);
    expect(counts['B']).toBe(16);
    expect(counts['C']).toBe(16);
    expect(s.length).toBe(49);
  });

  test('seed reproducibility', () => {
    const a = table_stratified_sample(testTable, 'group', 5, { seed: 77 });
    const b = table_stratified_sample(testTable, 'group', 5, { seed: 77 });
    expect(a._rows).toEqual(b._rows);
  });

  test('small groups — N > group size returns full group', () => {
    // Create a table with small groups
    const smallRows = [
      { id: 0, group: 'X', val: 0 },
      { id: 1, group: 'X', val: 10 },
      { id: 2, group: 'Y', val: 20 },
    ];
    const smallTable = new Table(smallRows, ['id', 'group', 'val']);
    const s = table_stratified_sample(smallTable, 'group', 100, { seed: 42 });
    // X has 2, Y has 1 — both capped at their size
    expect(s.length).toBe(3);
    const counts = {};
    for (const row of s._rows) {
      counts[row.group] = (counts[row.group] || 0) + 1;
    }
    expect(counts['X']).toBe(2);
    expect(counts['Y']).toBe(1);
  });

  test('keyFn as function', () => {
    const s = table_stratified_sample(testTable, r => r.group, 5, { seed: 42 });
    expect(s.length).toBe(15);
  });
});
