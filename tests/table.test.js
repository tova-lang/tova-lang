import { describe, test, expect } from 'bun:test';
import {
  Table, table_where, table_select, table_derive, table_group_by, table_agg,
  table_sort_by, table_limit, table_join, table_pivot, table_unpivot,
  table_explode, table_union, table_drop_duplicates, table_rename,
  agg_sum, agg_count, agg_mean, agg_median, agg_min, agg_max,
  peek, describe as table_describe, schema_of, cast, drop_nil, fill_nil,
  filter_ok, filter_err,
} from '../src/runtime/table.js';

const testData = [
  { name: 'Alice', age: 30, city: 'NYC', salary: 80000 },
  { name: 'Bob', age: 25, city: 'LA', salary: 60000 },
  { name: 'Charlie', age: 35, city: 'NYC', salary: 120000 },
  { name: 'Diana', age: 28, city: 'LA', salary: 90000 },
  { name: 'Eve', age: 32, city: 'Chicago', salary: 70000 },
];

describe('Table class', () => {
  test('constructor with array of objects', () => {
    const t = new Table(testData);
    expect(t.rows).toBe(5);
    expect(t.columns).toEqual(['name', 'age', 'city', 'salary']);
    expect(t.shape).toEqual([5, 4]);
    expect(t.length).toBe(5);
  });

  test('empty table', () => {
    const t = new Table([]);
    expect(t.rows).toBe(0);
    expect(t.columns).toEqual([]);
    expect(t.shape).toEqual([0, 0]);
  });

  test('at() access', () => {
    const t = new Table(testData);
    expect(t.at(0).name).toBe('Alice');
    expect(t.at(-1).name).toBe('Eve');
    expect(t.at(10)).toBeNull();
  });

  test('slice()', () => {
    const t = new Table(testData);
    const s = t.slice(1, 3);
    expect(s.rows).toBe(2);
    expect(s.at(0).name).toBe('Bob');
    expect(s.at(1).name).toBe('Charlie');
  });

  test('getColumn()', () => {
    const t = new Table(testData);
    const names = t.getColumn('name');
    expect(names).toEqual(['Alice', 'Bob', 'Charlie', 'Diana', 'Eve']);
  });

  test('iteration', () => {
    const t = new Table(testData);
    const names = [];
    for (const row of t) {
      names.push(row.name);
    }
    expect(names).toEqual(['Alice', 'Bob', 'Charlie', 'Diana', 'Eve']);
  });

  test('toArray()', () => {
    const t = new Table(testData);
    expect(t.toArray()).toEqual(testData);
  });

  test('toJSON()', () => {
    const t = new Table(testData);
    expect(t.toJSON()).toEqual(testData);
  });

  test('toString()', () => {
    const t = new Table(testData);
    expect(t.toString()).toBe('Table(5 rows, 4 columns)');
  });
});

describe('Table operations', () => {
  test('where() — filter rows', () => {
    const t = new Table(testData);
    const result = table_where(t, r => r.age > 30);
    expect(result.rows).toBe(2);
    expect(result.at(0).name).toBe('Charlie');
    expect(result.at(1).name).toBe('Eve');
  });

  test('select() — pick columns', () => {
    const t = new Table(testData);
    const result = table_select(t, 'name', 'age');
    expect(result.columns).toEqual(['name', 'age']);
    expect(result.at(0)).toEqual({ name: 'Alice', age: 30 });
  });

  test('select() — exclude columns', () => {
    const t = new Table(testData);
    const result = table_select(t, { __exclude: 'salary' });
    expect(result.columns).toEqual(['name', 'age', 'city']);
  });

  test('derive() — add/transform columns', () => {
    const t = new Table(testData);
    const result = table_derive(t, {
      double_salary: r => r.salary * 2,
      name_upper: r => r.name.toUpperCase(),
    });
    expect(result.columns).toContain('double_salary');
    expect(result.columns).toContain('name_upper');
    expect(result.at(0).double_salary).toBe(160000);
    expect(result.at(0).name_upper).toBe('ALICE');
  });

  test('group_by() + agg()', () => {
    const t = new Table(testData);
    const grouped = table_group_by(t, r => r.city);
    const result = table_agg(grouped, {
      count: agg_count(),
      total_salary: agg_sum(r => r.salary),
      avg_age: agg_mean(r => r.age),
    });
    expect(result.rows).toBe(3); // NYC, LA, Chicago

    const nyc = result.toArray().find(r => r._group === 'NYC');
    expect(nyc.count).toBe(2);
    expect(nyc.total_salary).toBe(200000);
  });

  test('sort_by() — ascending', () => {
    const t = new Table(testData);
    const result = table_sort_by(t, r => r.age);
    expect(result.at(0).name).toBe('Bob'); // youngest
    expect(result.at(4).name).toBe('Charlie'); // oldest
  });

  test('sort_by() — descending', () => {
    const t = new Table(testData);
    const result = table_sort_by(t, r => r.salary, { desc: true });
    expect(result.at(0).name).toBe('Charlie'); // highest salary
  });

  test('limit()', () => {
    const t = new Table(testData);
    const result = table_limit(t, 3);
    expect(result.rows).toBe(3);
  });

  test('join() — inner join', () => {
    const employees = new Table([
      { id: 1, name: 'Alice', dept_id: 10 },
      { id: 2, name: 'Bob', dept_id: 20 },
      { id: 3, name: 'Charlie', dept_id: 10 },
    ]);
    const depts = new Table([
      { dept_id: 10, dept_name: 'Engineering' },
      { dept_id: 20, dept_name: 'Marketing' },
    ]);
    const result = table_join(employees, depts, {
      left: r => r.dept_id,
      right: r => r.dept_id,
    });
    expect(result.rows).toBe(3);
    expect(result.at(0).dept_name).toBe('Engineering');
  });

  test('union()', () => {
    const t1 = new Table([{ a: 1 }, { a: 2 }]);
    const t2 = new Table([{ a: 3 }, { a: 4 }]);
    const result = table_union(t1, t2);
    expect(result.rows).toBe(4);
  });

  test('drop_duplicates()', () => {
    const t = new Table([
      { email: 'a@b.com', name: 'Alice' },
      { email: 'a@b.com', name: 'Alice2' },
      { email: 'c@d.com', name: 'Charlie' },
    ]);
    const result = table_drop_duplicates(t, { by: r => r.email });
    expect(result.rows).toBe(2);
  });

  test('rename()', () => {
    const t = new Table(testData);
    const result = table_rename(t, 'name', 'full_name');
    expect(result.columns).toContain('full_name');
    expect(result.columns).not.toContain('name');
    expect(result.at(0).full_name).toBe('Alice');
  });

  test('explode()', () => {
    const t = new Table([
      { name: 'Alice', tags: ['a', 'b'] },
      { name: 'Bob', tags: ['c'] },
    ]);
    const result = table_explode(t, 'tags');
    expect(result.rows).toBe(3);
  });

  test('pivot()', () => {
    const t = new Table([
      { date: '2024-01', product: 'A', sales: 10 },
      { date: '2024-01', product: 'B', sales: 20 },
      { date: '2024-02', product: 'A', sales: 15 },
    ]);
    const result = table_pivot(t, {
      index: r => r.date,
      columns: r => r.product,
      values: r => r.sales,
    });
    expect(result.rows).toBe(2);
  });

  test('unpivot()', () => {
    const t = new Table([
      { name: 'Alice', q1: 10, q2: 20 },
      { name: 'Bob', q1: 15, q2: 25 },
    ]);
    const result = table_unpivot(t, {
      id: r => r.name,
      columns: ['q1', 'q2'],
    });
    expect(result.rows).toBe(4);
    expect(result.columns).toEqual(['id', 'variable', 'value']);
  });
});

describe('Aggregation helpers', () => {
  test('agg_sum', () => {
    const rows = [{ x: 1 }, { x: 2 }, { x: 3 }];
    expect(agg_sum(r => r.x)(rows)).toBe(6);
  });

  test('agg_count with no args', () => {
    const rows = [{}, {}, {}];
    expect(agg_count()(rows)).toBe(3);
  });

  test('agg_mean', () => {
    const rows = [{ x: 10 }, { x: 20 }, { x: 30 }];
    expect(agg_mean(r => r.x)(rows)).toBe(20);
  });

  test('agg_median', () => {
    const rows = [{ x: 1 }, { x: 3 }, { x: 5 }];
    expect(agg_median(r => r.x)(rows)).toBe(3);
  });

  test('agg_min', () => {
    const rows = [{ x: 5 }, { x: 2 }, { x: 8 }];
    expect(agg_min(r => r.x)(rows)).toBe(2);
  });

  test('agg_max', () => {
    const rows = [{ x: 5 }, { x: 2 }, { x: 8 }];
    expect(agg_max(r => r.x)(rows)).toBe(8);
  });
});

describe('Data cleaning', () => {
  test('drop_nil()', () => {
    const t = new Table([
      { name: 'Alice', email: 'a@b.com' },
      { name: 'Bob', email: null },
      { name: 'Charlie', email: 'c@d.com' },
    ]);
    const result = drop_nil(t, 'email');
    expect(result.rows).toBe(2);
  });

  test('fill_nil()', () => {
    const t = new Table([
      { name: 'Alice', city: null },
      { name: 'Bob', city: 'NYC' },
    ]);
    const result = fill_nil(t, 'city', 'Unknown');
    expect(result.at(0).city).toBe('Unknown');
    expect(result.at(1).city).toBe('NYC');
  });

  test('cast()', () => {
    const t = new Table([
      { age: '25', price: '10.5' },
    ]);
    const result = cast(t, 'age', 'Int');
    expect(result.at(0).age).toBe(25);
    expect(typeof result.at(0).age).toBe('number');
  });
});

describe('Data exploration', () => {
  test('peek() returns table unchanged', () => {
    const t = new Table(testData);
    const result = peek(t);
    expect(result).toBe(t); // same reference
  });

  test('schema_of() returns type map', () => {
    const t = new Table(testData);
    const s = schema_of(t);
    expect(s.name).toBe('String');
    expect(s.age).toBe('Int');
    expect(s.salary).toBe('Int');
  });
});

describe('Immutability', () => {
  test('operations return new tables', () => {
    const t = new Table(testData);
    const filtered = table_where(t, r => r.age > 30);
    expect(filtered).not.toBe(t);
    expect(t.rows).toBe(5); // original unchanged
    expect(filtered.rows).toBe(2);
  });

  test('derive does not mutate original', () => {
    const t = new Table(testData);
    const derived = table_derive(t, { x: r => 1 });
    expect(t.columns).not.toContain('x');
    expect(derived.columns).toContain('x');
  });
});

// ══════════════════════════════════════════════════════
// COMPREHENSIVE COVERAGE TESTS
// ══════════════════════════════════════════════════════

describe('Table constructor edge cases', () => {
  test('non-array input falls back to empty', () => {
    const t = new Table('not an array');
    expect(t.rows).toBe(0);
    expect(t.columns).toEqual([]);
  });

  test('explicit columns parameter', () => {
    const t = new Table([{ a: 1 }], ['a', 'b', 'c']);
    expect(t.columns).toEqual(['a', 'b', 'c']);
  });

  test('default constructor (no args)', () => {
    const t = new Table();
    expect(t.rows).toBe(0);
    expect(t.columns).toEqual([]);
  });

  test('null input falls back to empty', () => {
    const t = new Table(null);
    expect(t.rows).toBe(0);
  });
});

describe('Table at() edge cases', () => {
  test('negative index out of bounds', () => {
    const t = new Table(testData);
    expect(t.at(-100)).toBeNull();
  });

  test('at(-0) returns first row', () => {
    const t = new Table(testData);
    expect(t.at(-0)).toEqual(testData[0]);
  });
});

describe('Table slice() edge cases', () => {
  test('slice with no arguments', () => {
    const t = new Table(testData);
    const s = t.slice();
    expect(s.rows).toBe(5);
  });

  test('slice(0, 0) returns empty', () => {
    const t = new Table(testData);
    const s = t.slice(0, 0);
    expect(s.rows).toBe(0);
  });

  test('slice with negative indices', () => {
    const t = new Table(testData);
    const s = t.slice(-2);
    expect(s.rows).toBe(2);
    expect(s.at(0).name).toBe('Diana');
  });

  test('slice beyond bounds', () => {
    const t = new Table(testData);
    const s = t.slice(10, 20);
    expect(s.rows).toBe(0);
  });

  test('slice preserves columns', () => {
    const t = new Table(testData);
    const s = t.slice(0, 1);
    expect(s.columns).toEqual(t.columns);
  });
});

describe('Table getColumn() edge cases', () => {
  test('non-existent column returns array of undefined', () => {
    const t = new Table(testData);
    const col = t.getColumn('nonexistent');
    expect(col.length).toBe(5);
    expect(col[0]).toBeUndefined();
  });

  test('empty table getColumn', () => {
    const t = new Table([]);
    expect(t.getColumn('anything')).toEqual([]);
  });
});

describe('Table toString() edge cases', () => {
  test('empty table toString', () => {
    const t = new Table([]);
    expect(t.toString()).toBe('Table(0 rows, 0 columns)');
  });
});

describe('Table _format() edge cases', () => {
  test('empty table format', () => {
    const t = new Table([]);
    const f = t._format();
    expect(f).toContain('(empty table)');
    expect(f).toContain('0 rows × 0 columns');
  });

  test('format with title', () => {
    const t = new Table(testData);
    const f = t._format(10, 'Test Title');
    expect(f).toContain('── Test Title ──');
  });

  test('format shows more rows message', () => {
    const t = new Table(testData);
    const f = t._format(2);
    expect(f).toContain('... 3 more rows');
  });

  test('format with null values', () => {
    const t = new Table([{ a: null, b: undefined }]);
    const f = t._format();
    expect(f).toContain('nil');
  });

  test('format with long values truncated to 30 chars', () => {
    const longStr = 'x'.repeat(50);
    const t = new Table([{ val: longStr }]);
    const f = t._format();
    // Value should be sliced to 30 chars
    expect(f).not.toContain(longStr);
    expect(f).toContain('x'.repeat(30));
  });

  test('format with maxRows=1', () => {
    const t = new Table(testData);
    const f = t._format(1);
    expect(f).toContain('Alice');
    expect(f).toContain('... 4 more rows');
  });
});

describe('Table iteration edge cases', () => {
  test('spread operator', () => {
    const t = new Table(testData);
    const arr = [...t];
    expect(arr.length).toBe(5);
    expect(arr[0].name).toBe('Alice');
  });

  test('multiple iterations on same table', () => {
    const t = new Table(testData);
    const first = [...t];
    const second = [...t];
    expect(first.length).toBe(second.length);
  });
});

describe('Table where() edge cases', () => {
  test('where() with no matches returns empty table', () => {
    const t = new Table(testData);
    const result = table_where(t, () => false);
    expect(result.rows).toBe(0);
    expect(result.columns).toEqual(t.columns);
  });

  test('where() on empty table', () => {
    const t = new Table([]);
    const result = table_where(t, () => true);
    expect(result.rows).toBe(0);
  });
});

describe('Table select() edge cases', () => {
  test('select with exclude array', () => {
    const t = new Table(testData);
    const result = table_select(t, { __exclude: ['salary', 'city'] });
    expect(result.columns).toEqual(['name', 'age']);
  });

  test('select with single column', () => {
    const t = new Table(testData);
    const result = table_select(t, 'name');
    expect(result.columns).toEqual(['name']);
    expect(result.at(0)).toEqual({ name: 'Alice' });
  });

  test('select with mixed includes and excludes', () => {
    const t = new Table(testData);
    const result = table_select(t, 'name', 'age', { __exclude: 'age' });
    expect(result.columns).toEqual(['name']);
  });

  test('select mixed with only excludes (no includes)', () => {
    const t = new Table(testData);
    const result = table_select(t, { __exclude: 'salary' }, { __exclude: 'city' });
    expect(result.columns).toEqual(['name', 'age']);
  });
});

describe('Table derive() edge cases', () => {
  test('derive with non-function (static) values', () => {
    const t = new Table(testData);
    const result = table_derive(t, { status: 'active', count: 42 });
    expect(result.at(0).status).toBe('active');
    expect(result.at(0).count).toBe(42);
  });

  test('derive replacing existing column', () => {
    const t = new Table(testData);
    const result = table_derive(t, { name: r => r.name.toUpperCase() });
    expect(result.at(0).name).toBe('ALICE');
    expect(result.columns.filter(c => c === 'name').length).toBe(1);
  });
});

describe('Table group_by() edge cases', () => {
  test('group_by with string column name', () => {
    const t = new Table(testData);
    const grouped = table_group_by(t, 'city');
    expect(grouped.__grouped).toBe(true);
    expect(grouped.groups.size).toBe(3);
  });

  test('group_by with single-element groups', () => {
    const t = new Table([{ x: 1 }, { x: 2 }, { x: 3 }]);
    const grouped = table_group_by(t, r => r.x);
    expect(grouped.groups.size).toBe(3);
  });

  test('group_by with null key', () => {
    const t = new Table([{ k: null, v: 1 }, { k: null, v: 2 }, { k: 'a', v: 3 }]);
    const grouped = table_group_by(t, 'k');
    expect(grouped.groups.size).toBe(2); // "null" and "a"
  });
});

describe('Table agg() edge cases', () => {
  test('agg without group_by throws error', () => {
    expect(() => table_agg({}, { c: agg_count() })).toThrow('agg() must be called after group_by()');
  });

  test('agg on null input throws', () => {
    expect(() => table_agg(null, {})).toThrow();
  });

  test('agg with primitive group key', () => {
    const t = new Table([
      { city: 'NYC', val: 10 },
      { city: 'NYC', val: 20 },
      { city: 'LA', val: 30 },
    ]);
    const grouped = table_group_by(t, 'city');
    const result = table_agg(grouped, { total: agg_sum(r => r.val) });
    expect(result.rows).toBe(2);
    const nyc = result.toArray().find(r => r._group === 'NYC');
    expect(nyc.total).toBe(30);
    const la = result.toArray().find(r => r._group === 'LA');
    expect(la.total).toBe(30);
  });

  test('agg with empty groups produces table with no rows', () => {
    const t = new Table([]);
    const grouped = table_group_by(t, 'x');
    const result = table_agg(grouped, { count: agg_count() });
    expect(result.rows).toBe(0);
    expect(result.columns).toEqual([]);
  });
});

describe('Table sort_by() edge cases', () => {
  test('sort_by with string column name', () => {
    const t = new Table(testData);
    const result = table_sort_by(t, 'age');
    expect(result.at(0).name).toBe('Bob');
    expect(result.at(4).name).toBe('Charlie');
  });

  test('sort_by with equal values preserves order', () => {
    const t = new Table([{ name: 'A', val: 1 }, { name: 'B', val: 1 }, { name: 'C', val: 1 }]);
    const result = table_sort_by(t, 'val');
    expect(result.rows).toBe(3);
  });

  test('sort_by descending with string key', () => {
    const t = new Table(testData);
    const result = table_sort_by(t, 'salary', { desc: true });
    expect(result.at(0).salary).toBe(120000);
  });
});

describe('Table limit() edge cases', () => {
  test('limit(0)', () => {
    const t = new Table(testData);
    expect(table_limit(t, 0).rows).toBe(0);
  });

  test('limit larger than table size', () => {
    const t = new Table(testData);
    expect(table_limit(t, 100).rows).toBe(5);
  });

  test('limit(1)', () => {
    const t = new Table(testData);
    const result = table_limit(t, 1);
    expect(result.rows).toBe(1);
    expect(result.at(0).name).toBe('Alice');
  });
});

describe('Table join() edge cases', () => {
  const employees = new Table([
    { id: 1, name: 'Alice', dept_id: 10 },
    { id: 2, name: 'Bob', dept_id: 20 },
    { id: 3, name: 'Charlie', dept_id: 30 },
  ]);
  const depts = new Table([
    { dept_id: 10, dept_name: 'Engineering' },
    { dept_id: 20, dept_name: 'Marketing' },
    { dept_id: 40, dept_name: 'HR' },
  ]);

  test('join throws without left/right keys', () => {
    expect(() => table_join(employees, depts)).toThrow('join() requires left and right key functions');
    expect(() => table_join(employees, depts, { left: 'dept_id' })).toThrow();
  });

  test('left join keeps unmatched left rows', () => {
    const result = table_join(employees, depts, {
      left: r => r.dept_id, right: r => r.dept_id, how: 'left',
    });
    expect(result.rows).toBe(3);
    const charlie = result.toArray().find(r => r.name === 'Charlie');
    expect(charlie.dept_name).toBeNull();
  });

  test('right join keeps unmatched right rows', () => {
    const result = table_join(employees, depts, {
      left: r => r.dept_id, right: r => r.dept_id, how: 'right',
    });
    expect(result.rows).toBe(3); // Alice, Bob matched + HR unmatched
    const hr = result.toArray().find(r => r.dept_name === 'HR');
    expect(hr.name).toBeNull();
  });

  test('outer join keeps all unmatched rows', () => {
    const result = table_join(employees, depts, {
      left: r => r.dept_id, right: r => r.dept_id, how: 'outer',
    });
    expect(result.rows).toBe(4); // Alice, Bob, Charlie(no match), HR(no match)
  });

  test('join with string keys', () => {
    const result = table_join(employees, depts, {
      left: 'dept_id', right: 'dept_id',
    });
    expect(result.rows).toBe(2); // inner join: only 10 and 20 match
  });

  test('join with multiple matches', () => {
    const orders = new Table([
      { user_id: 1, item: 'A' },
      { user_id: 1, item: 'B' },
      { user_id: 2, item: 'C' },
    ]);
    const users = new Table([
      { user_id: 1, name: 'Alice' },
      { user_id: 2, name: 'Bob' },
    ]);
    const result = table_join(orders, users, { left: 'user_id', right: 'user_id' });
    expect(result.rows).toBe(3);
  });
});

describe('Table pivot() edge cases', () => {
  test('pivot throws without required params', () => {
    const t = new Table([]);
    expect(() => table_pivot(t, {})).toThrow('pivot() requires index, columns, and values');
    expect(() => table_pivot(t, { index: 'a' })).toThrow();
  });

  test('pivot with string keys', () => {
    const t = new Table([
      { date: '2024-01', product: 'A', sales: 10 },
      { date: '2024-01', product: 'B', sales: 20 },
    ]);
    const result = table_pivot(t, { index: 'date', columns: 'product', values: 'sales' });
    expect(result.rows).toBe(1);
    expect(result.at(0).A).toBe(10);
    expect(result.at(0).B).toBe(20);
  });
});

describe('Table unpivot() edge cases', () => {
  test('unpivot throws without required params', () => {
    const t = new Table([]);
    expect(() => table_unpivot(t, {})).toThrow('unpivot() requires id and columns');
  });

  test('unpivot with string id', () => {
    const t = new Table([{ name: 'Alice', q1: 10, q2: 20 }]);
    const result = table_unpivot(t, { id: 'name', columns: ['q1', 'q2'] });
    expect(result.rows).toBe(2);
    expect(result.at(0).id).toBe('Alice');
    expect(result.at(0).variable).toBe('q1');
    expect(result.at(0).value).toBe(10);
  });
});

describe('Table explode() edge cases', () => {
  test('explode with function key', () => {
    const t = new Table([{ name: 'Alice', tags: ['a', 'b'] }]);
    const result = table_explode(t, r => r.tags);
    expect(result.rows).toBe(2);
  });

  test('explode non-array value keeps row', () => {
    const t = new Table([{ name: 'Alice', tags: 'single' }]);
    const result = table_explode(t, 'tags');
    expect(result.rows).toBe(1);
    expect(result.at(0).name).toBe('Alice');
  });

  test('explode empty array', () => {
    const t = new Table([{ name: 'Alice', tags: [] }]);
    const result = table_explode(t, 'tags');
    expect(result.rows).toBe(0);
  });
});

describe('Table union() edge cases', () => {
  test('union with different columns', () => {
    const t1 = new Table([{ a: 1 }]);
    const t2 = new Table([{ b: 2 }]);
    const result = table_union(t1, t2);
    expect(result.columns).toEqual(['a', 'b']);
    expect(result.rows).toBe(2);
  });

  test('union with empty tables', () => {
    const t1 = new Table([]);
    const t2 = new Table([{ a: 1 }]);
    const result = table_union(t1, t2);
    expect(result.rows).toBe(1);
  });
});

describe('Table drop_duplicates() edge cases', () => {
  test('drop_duplicates without by (full row compare)', () => {
    const t = new Table([{ a: 1, b: 2 }, { a: 1, b: 2 }, { a: 3, b: 4 }]);
    const result = table_drop_duplicates(t);
    expect(result.rows).toBe(2);
  });

  test('drop_duplicates with string by', () => {
    const t = new Table([
      { email: 'a@b.com', name: 'Alice' },
      { email: 'a@b.com', name: 'Bob' },
      { email: 'c@d.com', name: 'Charlie' },
    ]);
    const result = table_drop_duplicates(t, { by: 'email' });
    expect(result.rows).toBe(2);
    expect(result.at(0).name).toBe('Alice'); // first occurrence kept
  });

  test('drop_duplicates with single row', () => {
    const t = new Table([{ a: 1 }]);
    expect(table_drop_duplicates(t).rows).toBe(1);
  });
});

describe('Table rename() edge cases', () => {
  test('rename non-existent column is no-op', () => {
    const t = new Table(testData);
    const result = table_rename(t, 'nonexistent', 'something');
    expect(result.columns).toEqual(testData[0] ? Object.keys(testData[0]) : []);
  });
});

describe('Aggregation edge cases', () => {
  test('agg_sum with string column name', () => {
    const rows = [{ x: 10 }, { x: 20 }];
    expect(agg_sum('x')(rows)).toBe(30);
  });

  test('agg_count with predicate', () => {
    const rows = [{ active: true }, { active: false }, { active: true }];
    expect(agg_count(r => r.active)(rows)).toBe(2);
  });

  test('agg_mean with empty rows', () => {
    expect(agg_mean(r => r.x)([])).toBe(0);
  });

  test('agg_mean with string column name', () => {
    const rows = [{ x: 10 }, { x: 30 }];
    expect(agg_mean('x')(rows)).toBe(20);
  });

  test('agg_median with even count', () => {
    const rows = [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }];
    expect(agg_median(r => r.x)(rows)).toBe(2.5);
  });

  test('agg_median with empty rows', () => {
    expect(agg_median(r => r.x)([])).toBe(0);
  });

  test('agg_median with string column name', () => {
    const rows = [{ x: 5 }, { x: 3 }, { x: 1 }];
    expect(agg_median('x')(rows)).toBe(3);
  });

  test('agg_median single element', () => {
    expect(agg_median(r => r.x)([{ x: 42 }])).toBe(42);
  });

  test('agg_min with empty rows returns null', () => {
    expect(agg_min(r => r.x)([])).toBeNull();
  });

  test('agg_min with string column name', () => {
    expect(agg_min('x')([{ x: 5 }, { x: 2 }])).toBe(2);
  });

  test('agg_max with empty rows returns null', () => {
    expect(agg_max(r => r.x)([])).toBeNull();
  });

  test('agg_max with string column name', () => {
    expect(agg_max('x')([{ x: 5 }, { x: 9 }])).toBe(9);
  });
});

describe('Data exploration edge cases', () => {
  test('peek with title option', () => {
    const t = new Table(testData);
    const result = peek(t, { title: 'My Table', n: 2 });
    expect(result).toBe(t);
  });

  test('peek with non-object opts', () => {
    const t = new Table(testData);
    const result = peek(t, 'not an object');
    expect(result).toBe(t);
  });

  test('describe returns stats table', () => {
    const t = new Table(testData);
    const result = table_describe(t);
    expect(result).toBeInstanceOf(Table);
    expect(result.rows).toBe(4); // 4 columns
  });

  test('describe with numeric columns shows Mean/Min/Max', () => {
    const t = new Table([{ val: 10 }, { val: 20 }, { val: 30 }]);
    const result = table_describe(t);
    const stat = result.at(0);
    expect(stat.Type).toBe('Int');
    expect(stat.Mean).toBe(20);
    expect(stat.Min).toBe(10);
    expect(stat.Max).toBe(30);
  });

  test('describe with float column', () => {
    const t = new Table([{ val: 1.5 }, { val: 2.5 }]);
    const result = table_describe(t);
    expect(result.at(0).Type).toBe('Float');
  });

  test('describe with string column shows Unique count', () => {
    const t = new Table([{ s: 'a' }, { s: 'b' }, { s: 'a' }]);
    const result = table_describe(t);
    expect(result.at(0).Type).toBe('String');
    expect(result.at(0).Unique).toBe(2);
  });

  test('describe with boolean column shows True count', () => {
    const t = new Table([{ b: true }, { b: false }, { b: true }]);
    const result = table_describe(t);
    expect(result.at(0).Type).toBe('Bool');
    expect(result.at(0).True).toBe(2);
  });

  test('describe with null values counts Non-Null', () => {
    const t = new Table([{ x: 1 }, { x: null }, { x: 3 }]);
    const result = table_describe(t);
    expect(result.at(0)['Non-Null']).toBe(2);
  });

  test('describe with all-null column', () => {
    const t = new Table([{ x: null }, { x: null }], ['x']);
    const result = table_describe(t);
    expect(result.at(0).Type).toBe('Unknown');
    expect(result.at(0)['Non-Null']).toBe(0);
  });

  test('schema_of with empty table', () => {
    const t = new Table([], ['a', 'b']);
    const s = schema_of(t);
    expect(s.a).toBe('Unknown');
    expect(s.b).toBe('Unknown');
  });

  test('schema_of with null values', () => {
    const t = new Table([{ a: null }]);
    const s = schema_of(t);
    expect(s.a).toBe('Nil');
  });

  test('schema_of with boolean values', () => {
    const t = new Table([{ a: true }]);
    const s = schema_of(t);
    expect(s.a).toBe('Bool');
  });

  test('schema_of with float values', () => {
    const t = new Table([{ a: 3.14 }]);
    const s = schema_of(t);
    expect(s.a).toBe('Float');
  });

  test('schema_of with array values', () => {
    const t = new Table([{ a: [1, 2, 3] }]);
    const s = schema_of(t);
    expect(s.a).toBe('Array');
  });

  test('schema_of with object values', () => {
    const t = new Table([{ a: { nested: true } }]);
    const s = schema_of(t);
    expect(s.a).toBe('Object');
  });
});

describe('Data cleaning edge cases', () => {
  test('cast to Float', () => {
    const t = new Table([{ price: '10.5' }]);
    const result = cast(t, 'price', 'Float');
    expect(result.at(0).price).toBe(10.5);
  });

  test('cast to String', () => {
    const t = new Table([{ val: 42 }]);
    const result = cast(t, 'val', String);
    expect(result.at(0).val).toBe('42');
  });

  test('cast to Bool', () => {
    const t = new Table([{ val: 1 }, { val: 0 }, { val: '' }]);
    const result = cast(t, 'val', Boolean);
    expect(result.at(0).val).toBe(true);
    expect(result.at(1).val).toBe(false);
    expect(result.at(2).val).toBe(false);
  });

  test('cast non-parseable value to Int defaults to 0', () => {
    const t = new Table([{ val: 'abc' }]);
    const result = cast(t, 'val', 'Int');
    expect(result.at(0).val).toBe(0);
  });

  test('cast non-parseable value to Float defaults to 0', () => {
    const t = new Table([{ val: 'abc' }]);
    const result = cast(t, 'val', 'Float');
    expect(result.at(0).val).toBe(0);
  });

  test('drop_nil with undefined values', () => {
    const t = new Table([{ name: 'Alice', email: undefined }, { name: 'Bob', email: 'b@c.com' }]);
    const result = drop_nil(t, 'email');
    expect(result.rows).toBe(1);
    expect(result.at(0).name).toBe('Bob');
  });

  test('drop_nil with function predicate', () => {
    const t = new Table([{ email: 'a@b' }, { email: null }]);
    const result = drop_nil(t, r => r.email);
    expect(result.rows).toBe(1);
  });

  test('drop_nil all rows nil gives empty table', () => {
    const t = new Table([{ x: null }, { x: null }]);
    const result = drop_nil(t, 'x');
    expect(result.rows).toBe(0);
  });

  test('fill_nil with undefined values', () => {
    const t = new Table([{ x: undefined }]);
    const result = fill_nil(t, 'x', 'filled');
    expect(result.at(0).x).toBe('filled');
  });

  test('fill_nil with no nil values is no-op', () => {
    const t = new Table([{ x: 'hello' }]);
    const result = fill_nil(t, 'x', 'default');
    expect(result.at(0).x).toBe('hello');
  });

  test('filter_ok extracts Ok values', () => {
    const t = new Table([
      { __tag: 'Ok', value: { name: 'Alice' } },
      { __tag: 'Err', error: 'bad' },
      { __tag: 'Ok', value: { name: 'Bob' } },
    ]);
    const result = filter_ok(t);
    expect(result.rows).toBe(2);
    expect(result.at(0).name).toBe('Alice');
  });

  test('filter_err extracts Err values', () => {
    const t = new Table([
      { __tag: 'Ok', value: { name: 'Alice' } },
      { __tag: 'Err', error: 'invalid email' },
      { __tag: 'Err', error: 'too young' },
    ]);
    const result = filter_err(t);
    expect(result.rows).toBe(2);
    expect(result.at(0)).toBe('invalid email');
  });

  test('filter_ok with empty table', () => {
    const t = new Table([]);
    expect(filter_ok(t).rows).toBe(0);
  });

  test('filter_err with no errors', () => {
    const t = new Table([{ __tag: 'Ok', value: 1 }]);
    expect(filter_err(t).rows).toBe(0);
  });

  test('filter_ok with rows missing __tag', () => {
    const t = new Table([{ name: 'plain' }, { __tag: 'Ok', value: { x: 1 } }]);
    expect(filter_ok(t).rows).toBe(1);
  });

  test('filter_err with rows missing __tag', () => {
    const t = new Table([{ name: 'plain' }, { __tag: 'Err', error: 'bad' }]);
    expect(filter_err(t).rows).toBe(1);
  });

  test('fill_nil with function colFn (no-op due to missing colName path)', () => {
    // When colFn is a function, colName is null so no fill happens
    const t = new Table([{ x: null, y: 'ok' }]);
    const result = fill_nil(t, r => r.x, 'default');
    // The function-based path doesn't set colName so no fill occurs
    expect(result.at(0).x).toBeNull();
  });

  test('cast with function colFn', () => {
    const t = new Table([{ price: '10.5', name: 'test' }]);
    const result = cast(t, r => r.price, 'Float');
    // Function colFn uses Object.keys(r).find(k => colFn(r) === r[k]) to find key
    expect(result.at(0).price).toBe(10.5);
  });

  test('table_agg with object key spreading', () => {
    // When group_by key function returns an object, agg should spread it into the result row
    const t = new Table([
      { city: 'NYC', val: 10 },
      { city: 'NYC', val: 20 },
    ]);
    // Use a function that returns same key for both, as an object
    const grouped = table_group_by(t, r => ({ city: r.city }));
    const result = table_agg(grouped, { total: agg_sum(r => r.val) });
    // Since String({city:'NYC'}) collides, we get 1 group with object key spread
    expect(result.rows).toBe(1);
    const row = result.at(0);
    expect(row.city).toBe('NYC');
    expect(row.total).toBe(30);
  });

  test('table_explode with function colFn finding column name', () => {
    const t = new Table([{ name: 'Alice', tags: ['a', 'b'] }]);
    const result = table_explode(t, r => r.tags);
    expect(result.rows).toBe(2);
    expect(result.at(0).tags).toBe('a');
    expect(result.at(1).tags).toBe('b');
  });
});
