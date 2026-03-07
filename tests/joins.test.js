import { describe, test, expect } from 'bun:test';
import { Table, table_join } from '../src/runtime/table.js';

const employees = new Table([
  { id: 1, name: 'Alice', dept_id: 10 },
  { id: 2, name: 'Bob', dept_id: 20 },
  { id: 3, name: 'Charlie', dept_id: 30 },
  { id: 4, name: 'Diana', dept_id: null },
]);

const departments = new Table([
  { dept_id: 10, dept_name: 'Engineering' },
  { dept_id: 20, dept_name: 'Marketing' },
  { dept_id: 40, dept_name: 'Sales' },
]);

describe('join types', () => {
  test('inner join (existing)', () => {
    const r = table_join(employees, departments, { left: r => r.dept_id, right: r => r.dept_id });
    expect(r.rows).toBe(2);
    expect(r.at(0).name).toBe('Alice');
    expect(r.at(0).dept_name).toBe('Engineering');
  });

  test('left join (existing)', () => {
    const r = table_join(employees, departments, { left: r => r.dept_id, right: r => r.dept_id, how: 'left' });
    expect(r.rows).toBe(4);
    expect(r.at(2).name).toBe('Charlie');
    expect(r.at(2).dept_name).toBeNull();
  });

  test('right join', () => {
    const r = table_join(employees, departments, { left: r => r.dept_id, right: r => r.dept_id, how: 'right' });
    expect(r.rows).toBe(3);
    const sales = r._rows.find(row => row.dept_name === 'Sales');
    expect(sales).toBeDefined();
    expect(sales.name).toBeNull();
  });

  test('outer join', () => {
    const r = table_join(employees, departments, { left: r => r.dept_id, right: r => r.dept_id, how: 'outer' });
    expect(r.rows).toBe(5);
  });

  test('cross join', () => {
    const colors = new Table([{ color: 'red' }, { color: 'blue' }]);
    const sizes = new Table([{ size: 'S' }, { size: 'M' }, { size: 'L' }]);
    const r = table_join(colors, sizes, { how: 'cross' });
    expect(r.rows).toBe(6);
    expect(r.at(0).color).toBe('red');
    expect(r.at(0).size).toBe('S');
  });

  test('anti join', () => {
    const r = table_join(employees, departments, { left: r => r.dept_id, right: r => r.dept_id, how: 'anti' });
    expect(r.rows).toBe(2);
    expect(r._rows.every(row => row.dept_name === undefined)).toBe(true);
  });

  test('semi join', () => {
    const r = table_join(employees, departments, { left: r => r.dept_id, right: r => r.dept_id, how: 'semi' });
    expect(r.rows).toBe(2);
    expect(r.at(0).name).toBe('Alice');
    expect(r.at(1).name).toBe('Bob');
    expect(r.at(0).dept_name).toBeUndefined();
  });

  test('semi join does not duplicate on multi-match', () => {
    const left = new Table([{ id: 1, val: 'a' }]);
    const right = new Table([{ id: 1, x: 1 }, { id: 1, x: 2 }]);
    const r = table_join(left, right, { left: r => r.id, right: r => r.id, how: 'semi' });
    expect(r.rows).toBe(1);
  });

  test('cross join without key params', () => {
    const a = new Table([{ x: 1 }, { x: 2 }]);
    const b = new Table([{ y: 'a' }, { y: 'b' }]);
    const r = table_join(a, b, { how: 'cross' });
    expect(r.rows).toBe(4);
  });
});
