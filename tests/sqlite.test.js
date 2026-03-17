import { describe, test, expect } from 'bun:test';
import { tova_sqlite, Table } from '../src/runtime/table.js';

describe('sqlite connector', () => {
  test('open in-memory database', () => {
    const db = tova_sqlite(':memory:');
    expect(db).toBeDefined();
    expect(typeof db.query).toBe('function');
    expect(typeof db.exec).toBe('function');
    expect(typeof db.close).toBe('function');
    db.close();
  });

  test('create table and insert', () => {
    const db = tova_sqlite(':memory:');
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)');
    const r = db.exec('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30]);
    expect(r.changes).toBe(1);
    db.close();
  });

  test('query returns Table', () => {
    const db = tova_sqlite(':memory:');
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)');
    db.exec('INSERT INTO users (name, age) VALUES (?, ?)', ['Alice', 30]);
    db.exec('INSERT INTO users (name, age) VALUES (?, ?)', ['Bob', 25]);
    const result = db.query('SELECT * FROM users');
    expect(result).toBeInstanceOf(Table);
    expect(result.rows).toBe(2);
    expect(result.at(0).name).toBe('Alice');
    expect(result.at(1).age).toBe(25);
    db.close();
  });

  test('parameterized query', () => {
    const db = tova_sqlite(':memory:');
    db.exec('CREATE TABLE items (id INTEGER, val TEXT)');
    db.exec('INSERT INTO items VALUES (?, ?)', [1, 'a']);
    db.exec('INSERT INTO items VALUES (?, ?)', [2, 'b']);
    const result = db.query('SELECT * FROM items WHERE id = ?', [1]);
    expect(result.rows).toBe(1);
    expect(result.at(0).val).toBe('a');
    db.close();
  });

  test('write Table to SQLite', () => {
    const db = tova_sqlite(':memory:');
    const data = new Table([
      { name: 'Alice', score: 95.5, active: true },
      { name: 'Bob', score: 87.0, active: false },
    ]);
    db.writeTable(data, 'scores');
    const result = db.query('SELECT * FROM scores');
    expect(result.rows).toBe(2);
    expect(result.at(0).name).toBe('Alice');
    expect(typeof result.at(0).score).toBe('number');
    db.close();
  });

  test('write Table with append', () => {
    const db = tova_sqlite(':memory:');
    const batch1 = new Table([{ id: 1, val: 'a' }]);
    const batch2 = new Table([{ id: 2, val: 'b' }]);
    db.writeTable(batch1, 'items');
    db.writeTable(batch2, 'items', { append: true });
    const result = db.query('SELECT * FROM items ORDER BY id');
    expect(result.rows).toBe(2);
    db.close();
  });

  test('type inference for CREATE TABLE', () => {
    const db = tova_sqlite(':memory:');
    const data = new Table([
      { name: 'test', count: 42, score: 3.14, active: true, notes: null },
    ]);
    db.writeTable(data, 'typed');
    const result = db.query('SELECT * FROM typed');
    expect(result.at(0).name).toBe('test');
    expect(result.at(0).count).toBe(42);
    expect(Math.abs(result.at(0).score - 3.14)).toBeLessThan(0.01);
    db.close();
  });

  test('empty query returns empty Table', () => {
    const db = tova_sqlite(':memory:');
    db.exec('CREATE TABLE empty_t (id INTEGER)');
    const result = db.query('SELECT * FROM empty_t');
    expect(result.rows).toBe(0);
    db.close();
  });

  test('_isTovaSqlite flag', () => {
    const db = tova_sqlite(':memory:');
    expect(db._isTovaSqlite).toBe(true);
    db.close();
  });

  test('writeTable accepts plain arrays and normalizes booleans and nullish values', () => {
    const db = tova_sqlite(':memory:');
    db.writeTable([
      { id: 1, active: true, score: 9.5, note: undefined, maybe: null },
      { id: 2, active: false, score: 7, note: 'ok', maybe: 'value' },
    ], 'normalized');

    const result = db.query('SELECT * FROM normalized ORDER BY id');
    expect(result.rows).toBe(2);
    expect(result.at(0).id).toBe(1);
    expect(result.at(0).active).toBe(1);
    expect(result.at(0).note).toBeNull();
    expect(result.at(0).maybe).toBeNull();
    expect(result.at(1).active).toBe(0);
    expect(result.at(1).note).toBe('ok');
    db.close();
  });

  test('writeTable with empty input is a no-op', () => {
    const db = tova_sqlite(':memory:');
    db.writeTable([], 'nothing_here');
    const result = db.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'nothing_here'`);
    expect(result.rows).toBe(0);
    db.close();
  });
});
