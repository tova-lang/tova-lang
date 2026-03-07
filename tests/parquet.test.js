import { describe, test, expect, afterEach } from 'bun:test';
import { Table, readParquet, writeParquet } from '../src/runtime/table.js';
import { existsSync, unlinkSync } from 'fs';

const TEMP_FILE = '/tmp/tova_test_output.parquet';

afterEach(() => {
  if (existsSync(TEMP_FILE)) {
    unlinkSync(TEMP_FILE);
  }
});

describe('Parquet read/write', () => {
  test('round-trip: write and read back 3-row table with string, int, float columns', async () => {
    const t = new Table([
      { name: 'Alice', age: 30, score: 98.5 },
      { name: 'Bob', age: 25, score: 87.3 },
      { name: 'Charlie', age: 35, score: 92.1 },
    ]);

    await writeParquet(t, TEMP_FILE);
    expect(existsSync(TEMP_FILE)).toBe(true);

    const t2 = await readParquet(TEMP_FILE);
    expect(t2).toBeInstanceOf(Table);
    expect(t2._rows.length).toBe(3);

    // Check values
    expect(t2._rows[0].name).toBe('Alice');
    expect(t2._rows[0].age).toBe(30);
    expect(t2._rows[0].score).toBe(98.5);
    expect(t2._rows[1].name).toBe('Bob');
    expect(t2._rows[1].age).toBe(25);
    expect(t2._rows[1].score).toBe(87.3);
    expect(t2._rows[2].name).toBe('Charlie');
    expect(t2._rows[2].age).toBe(35);
    expect(t2._rows[2].score).toBe(92.1);
  });

  test('preserves column order', async () => {
    const t = new Table([
      { zz: 1, aa: 2, mm: 3 },
      { zz: 4, aa: 5, mm: 6 },
    ], ['zz', 'aa', 'mm']);

    await writeParquet(t, TEMP_FILE);
    const t2 = await readParquet(TEMP_FILE);

    expect(t2._columns).toEqual(['zz', 'aa', 'mm']);
  });

  test('handles empty table', async () => {
    const t = new Table([], ['name', 'age']);

    await writeParquet(t, TEMP_FILE);
    const t2 = await readParquet(TEMP_FILE);

    expect(t2).toBeInstanceOf(Table);
    expect(t2._rows.length).toBe(0);
    expect(t2._columns).toEqual(['name', 'age']);
  });

  test('compression option (gzip)', async () => {
    const t = new Table([
      { name: 'Alice', age: 30, score: 98.5 },
      { name: 'Bob', age: 25, score: 87.3 },
      { name: 'Charlie', age: 35, score: 92.1 },
    ]);

    await writeParquet(t, TEMP_FILE, { compression: 'gzip' });
    expect(existsSync(TEMP_FILE)).toBe(true);

    const t2 = await readParquet(TEMP_FILE);
    expect(t2._rows.length).toBe(3);
    expect(t2._rows[0].name).toBe('Alice');
    expect(t2._rows[2].score).toBe(92.1);
  });

  test('handles null values', async () => {
    const t = new Table([
      { name: 'Alice', age: 30, score: 98.5 },
      { name: null, age: 25, score: null },
      { name: 'Charlie', age: null, score: 92.1 },
    ]);

    await writeParquet(t, TEMP_FILE);
    const t2 = await readParquet(TEMP_FILE);

    expect(t2._rows.length).toBe(3);
    expect(t2._rows[0].name).toBe('Alice');
    expect(t2._rows[0].age).toBe(30);
    expect(t2._rows[0].score).toBe(98.5);
    expect(t2._rows[1].name).toBe(null);
    expect(t2._rows[1].age).toBe(25);
    expect(t2._rows[1].score).toBe(null);
    expect(t2._rows[2].name).toBe('Charlie');
    expect(t2._rows[2].age).toBe(null);
    expect(t2._rows[2].score).toBe(92.1);
  });
});
