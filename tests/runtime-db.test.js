import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { initDB, db } from '../src/runtime/db.js';

describe('Database Runtime', () => {
  beforeEach(() => {
    initDB({ url: ':memory:' });
  });

  afterEach(() => {
    db.close();
  });

  // --- initDB tests ---

  describe('initDB', () => {
    test('with no args creates in-memory SQLite db', () => {
      db.close();
      initDB();
      // Should be able to run a query on the in-memory db
      const result = db.query('SELECT 1 as val');
      expect(result).toBeDefined();
    });

    test('with { url: ":memory:" } creates in-memory SQLite db', () => {
      db.close();
      initDB({ url: ':memory:' });
      const result = db.query('SELECT 1 as val');
      expect(result).toBeDefined();
    });

    test('returns the db object', () => {
      db.close();
      const result = initDB();
      expect(result).toBe(db);
    });

    test('postgres URL throws because pg is not installed', () => {
      db.close();
      try {
        initDB({ url: 'postgres://localhost:5432/testdb' });
        // Should not reach here
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toContain('pg');
      }
    });
  });

  // --- db.query tests ---

  describe('db.query', () => {
    test('SELECT returns array of row objects', async () => {
      await db.execute('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
      await db.execute('INSERT INTO users (name) VALUES (?)', ['Alice']);
      await db.execute('INSERT INTO users (name) VALUES (?)', ['Bob']);
      const rows = await db.query('SELECT * FROM users');
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('Alice');
      expect(rows[1].name).toBe('Bob');
    });

    test('CREATE TABLE and query it', async () => {
      await db.execute('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT, count INTEGER)');
      await db.execute('INSERT INTO items (label, count) VALUES (?, ?)', ['widget', 5]);
      const rows = await db.query('SELECT * FROM items');
      expect(rows).toHaveLength(1);
      expect(rows[0].label).toBe('widget');
      expect(rows[0].count).toBe(5);
    });

    test('INSERT/UPDATE returns run result (not rows)', async () => {
      await db.execute('CREATE TABLE things (id INTEGER PRIMARY KEY, val TEXT)');
      const insertResult = await db.query('INSERT INTO things (val) VALUES (?)', ['hello']);
      // Non-SELECT queries should not return an array of row objects
      // They return a run result or an empty-ish result
      expect(Array.isArray(insertResult)).toBe(false);

      const updateResult = await db.query('UPDATE things SET val = ? WHERE id = 1', ['world']);
      expect(Array.isArray(updateResult)).toBe(false);
    });

    test('parameterized queries work', async () => {
      await db.execute('CREATE TABLE kv (key TEXT, value TEXT)');
      await db.execute('INSERT INTO kv (key, value) VALUES (?, ?)', ['color', 'blue']);
      await db.execute('INSERT INTO kv (key, value) VALUES (?, ?)', ['size', 'large']);
      const rows = await db.query('SELECT * FROM kv WHERE key = ?', ['color']);
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe('blue');
    });

    test('empty result returns empty array', async () => {
      await db.execute('CREATE TABLE empty_table (id INTEGER PRIMARY KEY, name TEXT)');
      const rows = await db.query('SELECT * FROM empty_table');
      expect(rows).toEqual([]);
    });
  });

  // --- db.execute tests ---

  describe('db.execute', () => {
    test('execute CREATE TABLE', async () => {
      const result = await db.execute('CREATE TABLE test_exec (id INTEGER PRIMARY KEY, data TEXT)');
      expect(result).toBeDefined();
      // Verify table exists by querying it
      const rows = await db.query('SELECT * FROM test_exec');
      expect(rows).toEqual([]);
    });

    test('execute INSERT with params', async () => {
      await db.execute('CREATE TABLE records (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)');
      await db.execute('INSERT INTO records (name, age) VALUES (?, ?)', ['Charlie', 30]);
      const rows = await db.query('SELECT * FROM records');
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Charlie');
      expect(rows[0].age).toBe(30);
    });

    test('execute works for non-SELECT statements', async () => {
      await db.execute('CREATE TABLE mutable (id INTEGER PRIMARY KEY, val INTEGER)');
      await db.execute('INSERT INTO mutable (val) VALUES (?)', [10]);
      await db.execute('UPDATE mutable SET val = ? WHERE id = 1', [20]);
      const rows = await db.query('SELECT * FROM mutable WHERE id = 1');
      expect(rows).toHaveLength(1);
      expect(rows[0].val).toBe(20);

      await db.execute('DELETE FROM mutable WHERE id = 1');
      const afterDelete = await db.query('SELECT * FROM mutable');
      expect(afterDelete).toEqual([]);
    });
  });

  // --- db.transaction tests ---

  describe('db.transaction', () => {
    test('transaction commits on success', async () => {
      await db.execute('CREATE TABLE tx_test (id INTEGER PRIMARY KEY, name TEXT)');

      await db.transaction(async (tx) => {
        await tx.execute('INSERT INTO tx_test (name) VALUES (?)', ['Alice']);
        await tx.execute('INSERT INTO tx_test (name) VALUES (?)', ['Bob']);
      });

      const rows = await db.query('SELECT * FROM tx_test ORDER BY id');
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('Alice');
      expect(rows[1].name).toBe('Bob');
    });

    test('transaction provides query/execute helpers', async () => {
      await db.execute('CREATE TABLE tx_helpers (id INTEGER PRIMARY KEY, val TEXT)');

      await db.transaction(async (tx) => {
        await tx.execute('INSERT INTO tx_helpers (val) VALUES (?)', ['one']);
        const rows = await tx.query('SELECT * FROM tx_helpers');
        expect(rows).toHaveLength(1);
        expect(rows[0].val).toBe('one');
      });
    });

    test('transaction rolls back on error', async () => {
      await db.execute('CREATE TABLE tx_rollback (id INTEGER PRIMARY KEY, name TEXT)');
      await db.execute('INSERT INTO tx_rollback (name) VALUES (?)', ['existing']);

      // SQLite transactions via bun:sqlite are synchronous.
      // The _db.transaction() wrapper uses BEGIN/COMMIT/ROLLBACK
      // and rolls back when the callback throws synchronously.
      try {
        await db.transaction((tx) => {
          tx.execute('INSERT INTO tx_rollback (name) VALUES (?)', ['should_vanish']);
          throw new Error('deliberate failure');
        });
      } catch (e) {
        expect(e.message).toBe('deliberate failure');
      }

      const rows = await db.query('SELECT * FROM tx_rollback');
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('existing');
    });
  });

  // --- db.close tests ---

  describe('db.close', () => {
    test('closes the database', () => {
      db.close();
      // After close, the internal _db should be null.
      // We verify by re-initializing successfully.
      initDB({ url: ':memory:' });
      const rows = db.query('SELECT 1 as val');
      expect(rows).toBeDefined();
    });

    test('after close, next query auto-inits since db.query calls initDB if _db is null', async () => {
      await db.execute('CREATE TABLE before_close (id INTEGER PRIMARY KEY)');
      db.close();

      // db.query should auto-init a new in-memory db if _db is null
      const rows = await db.query('SELECT 1 as check_val');
      expect(rows).toBeDefined();
      expect(rows[0].check_val).toBe(1);
    });
  });
});
