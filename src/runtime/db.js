// Database abstraction for Tova server-side code
// Supports Bun's built-in SQLite and PostgreSQL via connection string

let _db = null;
let _dbType = null;

export function initDB(config = {}) {
  const connectionString = config.url || process.env.DATABASE_URL || ':memory:';

  if (connectionString.startsWith('postgres')) {
    _dbType = 'postgres';
    // Lazy load pg — user must install it
    try {
      const { Pool } = require('pg');
      _db = new Pool({ connectionString });
    } catch (e) {
      throw new Error('PostgreSQL support requires the "pg" package. Run: bun add pg');
    }
  } else {
    _dbType = 'sqlite';
    // Use Bun's built-in SQLite
    try {
      const { Database } = require('bun:sqlite');
      _db = new Database(connectionString === ':memory:' ? ':memory:' : connectionString);
      _db.exec("PRAGMA journal_mode = WAL;");
    } catch (e) {
      throw new Error(`Failed to initialize SQLite database: ${e.message}`);
    }
  }

  return db;
}

export const db = {
  async query(sql, params = []) {
    if (!_db) {
      initDB();
    }

    if (_dbType === 'postgres') {
      const result = await _db.query(sql, params);
      return result.rows;
    }

    // SQLite
    if (sql.trim().toUpperCase().startsWith('SELECT') ||
        sql.trim().toUpperCase().startsWith('RETURNING')) {
      return _db.prepare(sql).all(...params);
    }
    return _db.prepare(sql).run(...params);
  },

  async execute(sql, params = []) {
    if (!_db) {
      initDB();
    }

    if (_dbType === 'postgres') {
      return await _db.query(sql, params);
    }

    return _db.prepare(sql).run(...params);
  },

  async transaction(fn) {
    if (!_db) {
      initDB();
    }

    if (_dbType === 'postgres') {
      const client = await _db.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          query: (sql, params) => client.query(sql, params).then(r => r.rows),
          execute: (sql, params) => client.query(sql, params),
        });
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    // SQLite transaction
    const txn = _db.transaction(fn);
    return txn({
      query: (sql, params = []) => _db.prepare(sql).all(...params),
      execute: (sql, params = []) => _db.prepare(sql).run(...params),
    });
  },

  close() {
    if (_db) {
      if (_dbType === 'postgres') {
        _db.end();
      } else {
        _db.close();
      }
      _db = null;
    }
  }
};
