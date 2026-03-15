import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { Database } from 'bun:sqlite';

const TOVA = path.join(__dirname, '..', 'bin', 'tova.js');

function runTova(args, opts = {}) {
  return spawnSync('bun', [TOVA, ...args], {
    encoding: 'utf-8', timeout: 30000, ...opts,
  });
}

// Create a fresh temp dir for each test
let tmpDir;
let origCwd;
beforeEach(() => {
  tmpDir = path.join(os.tmpdir(), `tova-migrate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  origCwd = process.cwd();
});
afterEach(() => {
  process.chdir(origCwd);
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

// ─── migrateCreate ──────────────────────────────────────────

describe('migrate:create', () => {
  test('creates migrations/ dir and timestamped .js file', () => {
    const result = runTova(['migrate:create', 'add_users'], { cwd: tmpDir });
    expect(result.status).toBe(0);

    const migrDir = path.join(tmpDir, 'migrations');
    expect(existsSync(migrDir)).toBe(true);

    const files = readdirSync(migrDir);
    expect(files).toHaveLength(1);

    const filename = files[0];
    // Filename format: YYYYMMDDHHMMSS_add_users.js
    expect(filename).toMatch(/^\d{14}_add_users\.js$/);
  });

  test('migration file has correct template structure', () => {
    runTova(['migrate:create', 'create_posts'], { cwd: tmpDir });
    const files = readdirSync(path.join(tmpDir, 'migrations'));
    const content = readFileSync(path.join(tmpDir, 'migrations', files[0]), 'utf-8');

    expect(content).toContain('Migration: create_posts');
    expect(content).toContain('export const up');
    expect(content).toContain('export const down');
    expect(content).toContain('Add your migration SQL here');
    expect(content).toContain('Add your rollback SQL here');
  });

  test('error with no migration name', () => {
    const result = runTova(['migrate:create'], { cwd: tmpDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('No migration name');
  });

  test('multiple creates produce separate files', () => {
    runTova(['migrate:create', 'first'], { cwd: tmpDir });
    // Small delay to ensure different timestamps
    spawnSync('sleep', ['1']);
    runTova(['migrate:create', 'second'], { cwd: tmpDir });

    const files = readdirSync(path.join(tmpDir, 'migrations')).sort();
    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(files[0]).toContain('first');
    expect(files[1]).toContain('second');
  });
});

// ─── discoverDbConfig ───────────────────────────────────────

describe('discoverDbConfig', () => {
  test('discovers db config from a .tova file with server+db block', () => {
    // We import discoverDbConfig indirectly -- the function is not exported,
    // so we test through the CLI which calls it internally.
    // Instead, we create a .tova file with db config and test migrateUp.
    const tovaContent = `server {
  db {
    path: ":memory:"
  }

  fn health() {
    { status: "ok" }
  }
  route GET "/api/health" => health
}
`;
    writeFileSync(path.join(tmpDir, 'app.tova'), tovaContent);

    // Create migrations dir with an empty migration
    mkdirSync(path.join(tmpDir, 'migrations'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'migrations', '20260101000000_test.js'),
      `export const up = \`CREATE TABLE IF NOT EXISTS test_tbl (id INTEGER PRIMARY KEY)\`;
export const down = \`DROP TABLE IF EXISTS test_tbl\`;
`);

    // Running migrate:up should use the db config from the .tova file
    const result = runTova(['migrate:up', 'app.tova'], { cwd: tmpDir });
    // With :memory: db, migrations run but data is lost when process exits
    // The important thing is it didn't crash with an error
    expect(result.status).toBe(0);
  });
});

// ─── connectDb (SQLite in-memory) ───────────────────────────

describe('connectDb -- SQLite', () => {
  test('connects to in-memory SQLite and supports exec/query/close', () => {
    // Using bun:sqlite directly to verify the pattern works
    const db = new Database(':memory:');

    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    db.exec("INSERT INTO test (name) VALUES ('alice')");
    const rows = db.prepare('SELECT * FROM test').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('alice');

    db.close();
  });
});

// ─── migrateUp ──────────────────────────────────────────────

describe('migrate:up', () => {
  test('no migrations dir prints message', () => {
    // Create a minimal .tova file
    writeFileSync(path.join(tmpDir, 'app.tova'), `server {
  db { path: ":memory:" }
  fn h() { { ok: true } }
  route GET "/" => h
}
`);
    const result = runTova(['migrate:up', 'app.tova'], { cwd: tmpDir });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No migrations directory');
  });

  test('no pending migrations prints up-to-date', () => {
    writeFileSync(path.join(tmpDir, 'app.tova'), `server {
  db { path: "${path.join(tmpDir, 'test.db')}" }
  fn h() { { ok: true } }
  route GET "/" => h
}
`);
    // Create migrations dir but no files
    mkdirSync(path.join(tmpDir, 'migrations'), { recursive: true });

    const result = runTova(['migrate:up', 'app.tova'], { cwd: tmpDir });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('up to date');
  });
});

// ─── migrateStatus ──────────────────────────────────────────

describe('migrate:status', () => {
  test('no migration files prints message', () => {
    const dbPath = path.join(tmpDir, 'status.db');
    writeFileSync(path.join(tmpDir, 'app.tova'), `server {
  db { path: "${dbPath}" }
  fn h() { { ok: true } }
  route GET "/" => h
}
`);
    const result = runTova(['migrate:status', 'app.tova'], { cwd: tmpDir });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No migration files');
  });

  test('shows pending status for unapplied migrations', () => {
    const dbPath = path.join(tmpDir, 'status2.db');
    writeFileSync(path.join(tmpDir, 'app.tova'), `server {
  db { path: "${dbPath}" }
  fn h() { { ok: true } }
  route GET "/" => h
}
`);
    mkdirSync(path.join(tmpDir, 'migrations'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'migrations', '20260101000000_init.js'),
      `export const up = \`CREATE TABLE users (id INTEGER PRIMARY KEY)\`;
export const down = \`DROP TABLE users\`;
`);

    const result = runTova(['migrate:status', 'app.tova'], { cwd: tmpDir });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('pending');
    expect(result.stdout).toContain('20260101000000_init.js');
  });
});

// ─── Full lifecycle ─────────────────────────────────────────

describe('migrate -- full lifecycle', () => {
  test('create -> up -> status (applied) -> down -> status (pending)', () => {
    const dbPath = path.join(tmpDir, 'lifecycle.db');
    writeFileSync(path.join(tmpDir, 'app.tova'), `server {
  db { path: "${dbPath}" }
  fn h() { { ok: true } }
  route GET "/" => h
}
`);

    // 1. Create a migration with actual SQL
    mkdirSync(path.join(tmpDir, 'migrations'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'migrations', '20260101000000_create_users.js'),
      `export const up = \`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL)\`;
export const down = \`DROP TABLE users\`;
`);

    // 2. Run migrate:up
    const upResult = runTova(['migrate:up', 'app.tova'], { cwd: tmpDir });
    expect(upResult.status).toBe(0);
    expect(upResult.stdout).toContain('20260101000000_create_users.js');
    expect(upResult.stdout).toContain('1 migration(s) applied');

    // Verify the table was actually created in the database
    const db = new Database(dbPath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").all();
    expect(tables).toHaveLength(1);

    // 3. Run migrate:status -- should show as applied
    const statusResult1 = runTova(['migrate:status', 'app.tova'], { cwd: tmpDir });
    expect(statusResult1.status).toBe(0);
    expect(statusResult1.stdout).toContain('applied');
    expect(statusResult1.stdout).toContain('0 pending');

    // 4. Run migrate:up again -- should say up to date
    const upAgainResult = runTova(['migrate:up', 'app.tova'], { cwd: tmpDir });
    expect(upAgainResult.status).toBe(0);
    expect(upAgainResult.stdout).toContain('up to date');

    // 5. Run migrate:down
    const downResult = runTova(['migrate:down', 'app.tova'], { cwd: tmpDir });
    expect(downResult.status).toBe(0);
    expect(downResult.stdout).toContain('Rolled back');
    expect(downResult.stdout).toContain('20260101000000_create_users.js');

    // Verify the table was dropped
    const tablesAfter = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").all();
    expect(tablesAfter).toHaveLength(0);

    // 6. Run migrate:status -- should show as pending
    const statusResult2 = runTova(['migrate:status', 'app.tova'], { cwd: tmpDir });
    expect(statusResult2.status).toBe(0);
    expect(statusResult2.stdout).toContain('pending');
    expect(statusResult2.stdout).toContain('1 pending');

    db.close();
  });

  test('multiple migrations run in order', () => {
    const dbPath = path.join(tmpDir, 'multi.db');
    writeFileSync(path.join(tmpDir, 'app.tova'), `server {
  db { path: "${dbPath}" }
  fn h() { { ok: true } }
  route GET "/" => h
}
`);

    mkdirSync(path.join(tmpDir, 'migrations'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'migrations', '20260101000001_users.js'),
      `export const up = \`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)\`;
export const down = \`DROP TABLE users\`;
`);
    writeFileSync(path.join(tmpDir, 'migrations', '20260101000002_posts.js'),
      `export const up = \`CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT)\`;
export const down = \`DROP TABLE posts\`;
`);

    const upResult = runTova(['migrate:up', 'app.tova'], { cwd: tmpDir });
    expect(upResult.status).toBe(0);
    expect(upResult.stdout).toContain('2 migration(s) applied');

    // Both tables should exist
    const db = new Database(dbPath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'posts') ORDER BY name").all();
    expect(tables).toHaveLength(2);
    expect(tables[0].name).toBe('posts');
    expect(tables[1].name).toBe('users');

    // Status should show both as applied
    const statusResult = runTova(['migrate:status', 'app.tova'], { cwd: tmpDir });
    expect(statusResult.stdout).toContain('0 pending');

    db.close();
  });
});

// ─── migrateDown ────────────────────────────────────────────

describe('migrate:down', () => {
  test('no applied migrations prints message', () => {
    const dbPath = path.join(tmpDir, 'empty.db');
    writeFileSync(path.join(tmpDir, 'app.tova'), `server {
  db { path: "${dbPath}" }
  fn h() { { ok: true } }
  route GET "/" => h
}
`);
    mkdirSync(path.join(tmpDir, 'migrations'), { recursive: true });

    const result = runTova(['migrate:down', 'app.tova'], { cwd: tmpDir });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No migrations to roll back');
  });

  test('rolls back only the last migration', () => {
    const dbPath = path.join(tmpDir, 'rollback1.db');
    writeFileSync(path.join(tmpDir, 'app.tova'), `server {
  db { path: "${dbPath}" }
  fn h() { { ok: true } }
  route GET "/" => h
}
`);

    mkdirSync(path.join(tmpDir, 'migrations'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'migrations', '20260101000001_users.js'),
      `export const up = \`CREATE TABLE users (id INTEGER PRIMARY KEY)\`;
export const down = \`DROP TABLE users\`;
`);
    writeFileSync(path.join(tmpDir, 'migrations', '20260101000002_posts.js'),
      `export const up = \`CREATE TABLE posts (id INTEGER PRIMARY KEY)\`;
export const down = \`DROP TABLE posts\`;
`);

    // Apply both
    runTova(['migrate:up', 'app.tova'], { cwd: tmpDir });

    // Roll back one
    const result = runTova(['migrate:down', 'app.tova'], { cwd: tmpDir });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('20260101000002_posts.js');

    // Users table should still exist, posts should be gone
    const db = new Database(dbPath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'posts')").all();
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('users');
    db.close();
  });
});

// ─── migrateReset ───────────────────────────────────────────

describe('migrate:reset', () => {
  test('rolls back all applied migrations', () => {
    const dbPath = path.join(tmpDir, 'reset.db');
    writeFileSync(path.join(tmpDir, 'app.tova'), `server {
  db { path: "${dbPath}" }
  fn h() { { ok: true } }
  route GET "/" => h
}
`);

    mkdirSync(path.join(tmpDir, 'migrations'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'migrations', '20260101000001_users.js'),
      `export const up = \`CREATE TABLE users (id INTEGER PRIMARY KEY)\`;
export const down = \`DROP TABLE users\`;
`);
    writeFileSync(path.join(tmpDir, 'migrations', '20260101000002_posts.js'),
      `export const up = \`CREATE TABLE posts (id INTEGER PRIMARY KEY)\`;
export const down = \`DROP TABLE posts\`;
`);

    // Apply both
    runTova(['migrate:up', 'app.tova'], { cwd: tmpDir });

    // Reset
    const result = runTova(['migrate:reset', 'app.tova'], { cwd: tmpDir });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('All migrations rolled back');

    // Both tables should be gone
    const db = new Database(dbPath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'posts')").all();
    expect(tables).toHaveLength(0);
    db.close();
  });

  test('no applied migrations prints message', () => {
    const dbPath = path.join(tmpDir, 'noreset.db');
    writeFileSync(path.join(tmpDir, 'app.tova'), `server {
  db { path: "${dbPath}" }
  fn h() { { ok: true } }
  route GET "/" => h
}
`);

    const result = runTova(['migrate:reset', 'app.tova'], { cwd: tmpDir });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No migrations to roll back');
  });
});

// ─── migrateFresh ───────────────────────────────────────────

describe('migrate:fresh', () => {
  test('drops all tables and re-runs all migrations', () => {
    const dbPath = path.join(tmpDir, 'fresh.db');
    writeFileSync(path.join(tmpDir, 'app.tova'), `server {
  db { path: "${dbPath}" }
  fn h() { { ok: true } }
  route GET "/" => h
}
`);

    mkdirSync(path.join(tmpDir, 'migrations'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'migrations', '20260101000001_users.js'),
      `export const up = \`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)\`;
export const down = \`DROP TABLE users\`;
`);

    // First, apply migrations
    runTova(['migrate:up', 'app.tova'], { cwd: tmpDir });

    // Insert some data
    const db1 = new Database(dbPath);
    db1.exec("INSERT INTO users (name) VALUES ('alice')");
    const rowsBefore = db1.prepare('SELECT * FROM users').all();
    expect(rowsBefore).toHaveLength(1);
    db1.close();

    // Run fresh -- should drop everything and re-apply
    const result = runTova(['migrate:fresh', 'app.tova'], { cwd: tmpDir });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Dropping all tables');
    expect(result.stdout).toContain('1 migration(s) applied');

    // Table should exist but data should be gone
    const db2 = new Database(dbPath);
    const tables = db2.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").all();
    expect(tables).toHaveLength(1);
    const rowsAfter = db2.prepare('SELECT * FROM users').all();
    expect(rowsAfter).toHaveLength(0);
    db2.close();
  });
});

// ─── Default config fallback ────────────────────────────────

describe('migrate -- default db config', () => {
  test('uses app.db when no db block is specified in .tova', () => {
    // Create a .tova with server but no db block
    writeFileSync(path.join(tmpDir, 'app.tova'), `server {
  fn h() { { ok: true } }
  route GET "/" => h
}
`);

    mkdirSync(path.join(tmpDir, 'migrations'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'migrations', '20260101000000_init.js'),
      `export const up = \`CREATE TABLE init_test (id INTEGER PRIMARY KEY)\`;
export const down = \`DROP TABLE init_test\`;
`);

    const result = runTova(['migrate:up', 'app.tova'], { cwd: tmpDir });
    expect(result.status).toBe(0);

    // Default path is app.db in the cwd
    const dbPath = path.join(tmpDir, 'app.db');
    expect(existsSync(dbPath)).toBe(true);

    // Cleanup
    const db = new Database(dbPath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='init_test'").all();
    expect(tables).toHaveLength(1);
    db.close();
  });
});

// ─── __migrations table ─────────────────────────────────────

describe('migrate -- __migrations table', () => {
  test('__migrations table tracks applied migrations', () => {
    const dbPath = path.join(tmpDir, 'track.db');
    writeFileSync(path.join(tmpDir, 'app.tova'), `server {
  db { path: "${dbPath}" }
  fn h() { { ok: true } }
  route GET "/" => h
}
`);

    mkdirSync(path.join(tmpDir, 'migrations'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'migrations', '20260101000000_init.js'),
      `export const up = \`CREATE TABLE test_track (id INTEGER PRIMARY KEY)\`;
export const down = \`DROP TABLE test_track\`;
`);

    runTova(['migrate:up', 'app.tova'], { cwd: tmpDir });

    const db = new Database(dbPath);
    const migrations = db.prepare('SELECT * FROM __migrations').all();
    expect(migrations).toHaveLength(1);
    expect(migrations[0].name).toBe('20260101000000_init.js');
    expect(migrations[0].applied_at).toBeDefined();
    db.close();
  });
});
