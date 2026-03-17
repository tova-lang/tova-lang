import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { initDB, db } from '../src/runtime/db.js';

beforeEach(() => {
  try { db.close(); } catch {}
});

afterEach(() => {
  try { db.close(); } catch {}
  mock.restore();
  mock.clearAllMocks();
});

describe('runtime db mocked driver coverage', () => {
  test('postgres query returns rows from Pool.query', async () => {
    const poolQuery = mock(async (sql, params) => ({ rows: [{ sql, params }] }));
    const end = mock(() => {});

    mock.module('pg', () => ({
      Pool: class Pool {
        constructor() {
          this.query = poolQuery;
          this.end = end;
        }
      }
    }));

    initDB({ url: 'postgres://localhost:5432/testdb' });
    const rows = await db.query('SELECT 1', [123]);

    expect(rows).toEqual([{ sql: 'SELECT 1', params: [123] }]);
    expect(poolQuery).toHaveBeenCalledWith('SELECT 1', [123]);
  });

  test('postgres execute returns the raw Pool.query result', async () => {
    const result = { rowCount: 2, command: 'UPDATE' };
    const poolQuery = mock(async () => result);
    const end = mock(() => {});

    mock.module('pg', () => ({
      Pool: class Pool {
        constructor() {
          this.query = poolQuery;
          this.end = end;
        }
      }
    }));

    initDB({ url: 'postgres://localhost:5432/testdb' });
    const executed = await db.execute('UPDATE users SET active = $1', [true]);

    expect(executed).toBe(result);
  });

  test('postgres transaction commits and releases client on success', async () => {
    const queryCalls = [];
    const client = {
      query: mock(async (sql, params) => {
        queryCalls.push([sql, params]);
        if (sql === 'SELECT * FROM users') {
          return { rows: [{ id: 1, name: 'Ada' }] };
        }
        return { rowCount: 1 };
      }),
      release: mock(() => {}),
    };
    const connect = mock(async () => client);
    const end = mock(() => {});

    mock.module('pg', () => ({
      Pool: class Pool {
        constructor() {
          this.connect = connect;
          this.end = end;
        }
      }
    }));

    initDB({ url: 'postgres://localhost:5432/testdb' });
    const result = await db.transaction(async (tx) => {
      const rows = await tx.query('SELECT * FROM users', []);
      await tx.execute('UPDATE users SET seen = $1', [true]);
      return rows[0].name;
    });

    expect(result).toBe('Ada');
    expect(queryCalls[0][0]).toBe('BEGIN');
    expect(queryCalls.some(([sql]) => sql === 'COMMIT')).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });

  test('postgres transaction rolls back and releases client on error', async () => {
    const queryCalls = [];
    const client = {
      query: mock(async (sql, params) => {
        queryCalls.push([sql, params]);
        return { rowCount: 1, rows: [] };
      }),
      release: mock(() => {}),
    };
    const connect = mock(async () => client);
    const end = mock(() => {});

    mock.module('pg', () => ({
      Pool: class Pool {
        constructor() {
          this.connect = connect;
          this.end = end;
        }
      }
    }));

    initDB({ url: 'postgres://localhost:5432/testdb' });

    await expect(db.transaction(async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');

    expect(queryCalls[0][0]).toBe('BEGIN');
    expect(queryCalls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });

  test('sqlite init wraps driver construction failures', () => {
    expect(() => initDB({ url: '/tmp' })).toThrow('Failed to initialize SQLite database: unable to open database file');
  });
});
