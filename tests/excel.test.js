import { describe, test, expect, afterEach } from 'bun:test';
import { Table, readExcel, writeExcel } from '../src/runtime/table.js';
import { unlinkSync, existsSync } from 'fs';

const TMP_FILE = '/tmp/tova_test_output.xlsx';

afterEach(() => {
  try {
    if (existsSync(TMP_FILE)) unlinkSync(TMP_FILE);
  } catch {}
});

describe('Excel read/write', () => {
  test('write and read round-trip', async () => {
    const t = new Table([
      { name: 'Alice', age: 30, score: 95.5 },
      { name: 'Bob', age: 25, score: 87.0 },
      { name: 'Charlie', age: 35, score: 91.2 },
    ]);
    await writeExcel(t, TMP_FILE);
    const result = await readExcel(TMP_FILE);
    expect(result).toBeInstanceOf(Table);
    expect(result.length).toBe(3);
    expect(result.columns).toEqual(['name', 'age', 'score']);
    expect(result.at(0).name).toBe('Alice');
    expect(result.at(0).age).toBe(30);
    expect(result.at(0).score).toBe(95.5);
    expect(result.at(1).name).toBe('Bob');
    expect(result.at(2).name).toBe('Charlie');
  });

  test('read specific sheet by name', async () => {
    const t1 = new Table([{ x: 1 }, { x: 2 }]);
    const t2 = new Table([{ y: 10 }, { y: 20 }]);
    // Write two sheets
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws1 = wb.addWorksheet('First');
    ws1.addRow(['x']);
    ws1.addRow([1]);
    ws1.addRow([2]);
    const ws2 = wb.addWorksheet('Second');
    ws2.addRow(['y']);
    ws2.addRow([10]);
    ws2.addRow([20]);
    await wb.xlsx.writeFile(TMP_FILE);

    const result = await readExcel(TMP_FILE, { sheet: 'Second' });
    expect(result.length).toBe(2);
    expect(result.columns).toEqual(['y']);
    expect(result.at(0).y).toBe(10);
    expect(result.at(1).y).toBe(20);
  });

  test('read specific sheet by index', async () => {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws1 = wb.addWorksheet('Alpha');
    ws1.addRow(['a']);
    ws1.addRow([100]);
    const ws2 = wb.addWorksheet('Beta');
    ws2.addRow(['b']);
    ws2.addRow([200]);
    await wb.xlsx.writeFile(TMP_FILE);

    // Sheet index 2 should be "Beta"
    const result = await readExcel(TMP_FILE, { sheet: 2 });
    expect(result.length).toBe(1);
    expect(result.columns).toEqual(['b']);
    expect(result.at(0).b).toBe(200);
  });

  test('preserves column names', async () => {
    const t = new Table([
      { 'First Name': 'Alice', 'Last Name': 'Smith', 'Total Score': 95 },
    ]);
    await writeExcel(t, TMP_FILE);
    const result = await readExcel(TMP_FILE);
    expect(result.columns).toEqual(['First Name', 'Last Name', 'Total Score']);
    expect(result.at(0)['First Name']).toBe('Alice');
  });

  test('handles null values', async () => {
    const t = new Table([
      { name: 'Alice', age: 30 },
      { name: null, age: null },
      { name: 'Charlie', age: 35 },
    ]);
    await writeExcel(t, TMP_FILE);
    const result = await readExcel(TMP_FILE);
    expect(result.length).toBe(3);
    expect(result.at(1).name).toBeNull();
    expect(result.at(1).age).toBeNull();
    expect(result.at(0).name).toBe('Alice');
    expect(result.at(2).name).toBe('Charlie');
  });

  test('empty table', async () => {
    const t = new Table([], ['name', 'age']);
    await writeExcel(t, TMP_FILE);
    const result = await readExcel(TMP_FILE);
    // An empty table with headers should have the column names but no rows
    expect(result.length).toBe(0);
    expect(result.columns).toEqual(['name', 'age']);
  });

  test('custom sheet name on write', async () => {
    const t = new Table([{ val: 42 }]);
    await writeExcel(t, TMP_FILE, { sheet: 'MyData' });
    const result = await readExcel(TMP_FILE, { sheet: 'MyData' });
    expect(result.length).toBe(1);
    expect(result.at(0).val).toBe(42);
  });
});
