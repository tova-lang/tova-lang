// src/cli/migrate.js — Database migration commands
import { resolve, join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { findFiles } from './utils.js';

// ─── Migrations ─────────────────────────────────────────────

function findTovaFile(arg) {
  if (arg && arg.endsWith('.tova')) {
    const p = resolve(arg);
    if (existsSync(p)) return p;
    console.error(`Error: File not found: ${p}`);
    process.exit(1);
  }
  for (const name of ['main.tova', 'app.tova']) {
    const p = resolve(name);
    if (existsSync(p)) return p;
  }
  const tovaFiles = findFiles(resolve('.'), '.tova');
  if (tovaFiles.length === 1) return tovaFiles[0];
  if (tovaFiles.length === 0) {
    console.error('Error: No .tova files found');
    process.exit(1);
  }
  console.error('Error: Multiple .tova files found. Specify one explicitly.');
  process.exit(1);
}

function discoverDbConfig(tovaFile) {
  const source = readFileSync(tovaFile, 'utf-8');
  const lexer = new Lexer(source, tovaFile);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, tovaFile);
  const ast = parser.parse();

  for (const node of ast.body) {
    if (node.type === 'ServerBlock') {
      for (const stmt of node.body) {
        if (stmt.type === 'DbDeclaration') {
          const cfg = {};
          if (stmt.config) {
            for (const [k, v] of Object.entries(stmt.config)) {
              if (v.type === 'StringLiteral') cfg[k] = v.value;
              else if (v.type === 'NumberLiteral') cfg[k] = Number(v.value);
              else if (v.type === 'BooleanLiteral') cfg[k] = v.value;
            }
          }
          return cfg;
        }
      }
    }
  }
  return { driver: 'sqlite', path: 'app.db' };
}

async function connectDb(cfg) {
  const driver = cfg.driver || 'sqlite';
  if (driver === 'postgres') {
    const postgres = (await import('postgres')).default;
    const sql = postgres(cfg.url || 'postgres://localhost/app');
    return {
      driver: 'postgres',
      exec: async (q) => { await sql.unsafe(q); },
      query: async (q, ...p) => { return await sql.unsafe(q, p); },
      close: async () => { await sql.end(); },
    };
  }
  if (driver === 'mysql') {
    const mysql = await import('mysql2/promise');
    const conn = await mysql.createConnection(cfg.url || 'mysql://root@localhost/app');
    return {
      driver: 'mysql',
      exec: async (q) => { await conn.execute(q); },
      query: async (q, ...p) => { const [rows] = await conn.execute(q, p); return rows; },
      close: async () => { await conn.end(); },
    };
  }
  // SQLite default
  const { Database } = await import('bun:sqlite');
  const db = new Database(cfg.path || 'app.db');
  return {
    driver: 'sqlite',
    exec: (q) => db.exec(q),
    query: (q, ...p) => db.prepare(q).all(...p),
    close: () => db.close(),
  };
}

export function migrateCreate(name) {
  if (!name) {
    console.error('Error: No migration name specified');
    console.error('Usage: tova migrate:create <name>');
    process.exit(1);
  }

  const dir = resolve('migrations');
  mkdirSync(dir, { recursive: true });

  const now = new Date();
  const ts = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0')
    + String(now.getHours()).padStart(2, '0')
    + String(now.getMinutes()).padStart(2, '0')
    + String(now.getSeconds()).padStart(2, '0');

  const filename = `${ts}_${name.replace(/[^a-zA-Z0-9_]/g, '_')}.js`;
  const filepath = join(dir, filename);

  writeFileSync(filepath, `// Migration: ${name}
// Created: ${now.toISOString()}

export const up = \`
  -- Add your migration SQL here
\`;

export const down = \`
  -- Add your rollback SQL here
\`;
`);

  console.log(`\n  Created migration: migrations/${filename}\n`);
}

export async function migrateUp(args) {
  const tovaFile = findTovaFile(args[0]);
  const cfg = discoverDbConfig(tovaFile);
  const db = await connectDb(cfg);

  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS __migrations (
      id INTEGER PRIMARY KEY ${db.driver === 'postgres' ? 'GENERATED ALWAYS AS IDENTITY' : 'AUTOINCREMENT'},
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (${db.driver === 'postgres' ? "NOW()::TEXT" : "datetime('now')"})
    )`);

    const applied = await db.query('SELECT name FROM __migrations ORDER BY name');
    const appliedSet = new Set(applied.map(r => r.name));

    const migrDir = resolve('migrations');
    if (!existsSync(migrDir)) {
      console.log('\n  No migrations directory found. Run migrate:create first.\n');
      return;
    }

    const files = readdirSync(migrDir)
      .filter(f => f.endsWith('.js'))
      .sort();

    const pending = files.filter(f => !appliedSet.has(f));
    if (pending.length === 0) {
      console.log('\n  All migrations are up to date.\n');
      return;
    }

    console.log(`\n  Running ${pending.length} pending migration(s)...\n`);

    for (const file of pending) {
      const mod = await import(join(migrDir, file));
      if (!mod.up) {
        console.error(`  Skipping ${file}: no 'up' export`);
        continue;
      }
      const sql = mod.up.trim();
      if (sql) {
        await db.exec(sql);
      }
      const ph = db.driver === 'postgres' ? '$1' : '?';
      await db.query(`INSERT INTO __migrations (name) VALUES (${ph})`, file);
      console.log(`  \u2713 ${file}`);
    }

    console.log(`\n  Done. ${pending.length} migration(s) applied.\n`);
  } finally {
    await db.close();
  }
}

export async function migrateDown(args) {
  const tovaFile = findTovaFile(args[0]);
  const cfg = discoverDbConfig(tovaFile);
  const db = await connectDb(cfg);

  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS __migrations (
      id INTEGER PRIMARY KEY ${db.driver === 'postgres' ? 'GENERATED ALWAYS AS IDENTITY' : 'AUTOINCREMENT'},
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (${db.driver === 'postgres' ? "NOW()::TEXT" : "datetime('now')"})
    )`);

    const applied = await db.query('SELECT name FROM __migrations ORDER BY name DESC');
    if (applied.length === 0) {
      console.log('\n  No migrations to roll back.\n');
      return;
    }

    const migrDir = resolve('migrations');
    const lastMigration = applied[0].name;

    console.log(`\n  Rolling back: ${lastMigration}...\n`);

    const mod = await import(join(migrDir, lastMigration));
    if (!mod.down) {
      console.error(`  Error: ${lastMigration} has no 'down' export \u2014 cannot roll back`);
      process.exit(1);
    }

    const sql = mod.down.trim();
    if (sql) {
      await db.exec(sql);
    }

    await db.exec(`DELETE FROM __migrations WHERE name = '${lastMigration}'`);
    console.log(`  \u2713 Rolled back: ${lastMigration}`);
    console.log(`\n  Done.\n`);
  } finally {
    await db.close();
  }
}

export async function migrateReset(args) {
  const tovaFile = findTovaFile(args[0]);
  const cfg = discoverDbConfig(tovaFile);
  const db = await connectDb(cfg);

  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS __migrations (
      id INTEGER PRIMARY KEY ${db.driver === 'postgres' ? 'GENERATED ALWAYS AS IDENTITY' : 'AUTOINCREMENT'},
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (${db.driver === 'postgres' ? "NOW()::TEXT" : "datetime('now')"})
    )`);

    const applied = await db.query('SELECT name FROM __migrations ORDER BY name DESC');
    if (applied.length === 0) {
      console.log('\n  No migrations to roll back.\n');
      return;
    }

    const migrDir = resolve('migrations');
    console.log(`\n  Rolling back ${applied.length} migration(s)...\n`);

    for (const row of applied) {
      const file = row.name;
      try {
        const mod = await import(join(migrDir, file));
        if (mod.down) {
          const sql = mod.down.trim();
          if (sql) {
            await db.exec(sql);
          }
        } else {
          console.error(`  \u26a0 ${file} has no 'down' export \u2014 skipping rollback`);
          continue;
        }
      } catch (e) {
        console.error(`  \u26a0 Error rolling back ${file}: ${e.message}`);
        continue;
      }
      await db.exec(`DELETE FROM __migrations WHERE name = '${file}'`);
      console.log(`  \u2713 Rolled back: ${file}`);
    }

    console.log(`\n  Done. All migrations rolled back.\n`);
  } finally {
    await db.close();
  }
}

export async function migrateFresh(args) {
  const tovaFile = findTovaFile(args[0]);
  const cfg = discoverDbConfig(tovaFile);
  const db = await connectDb(cfg);

  try {
    // Drop all tables
    console.log('\n  Dropping all tables...\n');
    if (db.driver === 'sqlite') {
      const tables = await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      for (const t of tables) {
        await db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
        console.log(`  \u2713 Dropped: ${t.name}`);
      }
    } else if (db.driver === 'postgres') {
      const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
      for (const t of tables) {
        await db.exec(`DROP TABLE IF EXISTS "${t.tablename}" CASCADE`);
        console.log(`  \u2713 Dropped: ${t.tablename}`);
      }
    } else if (db.driver === 'mysql') {
      const tables = await db.query("SHOW TABLES");
      for (const t of tables) {
        const tableName = Object.values(t)[0];
        await db.exec(`DROP TABLE IF EXISTS \`${tableName}\``);
        console.log(`  \u2713 Dropped: ${tableName}`);
      }
    }

    // Re-create migrations table and run all migrations
    await db.exec(`CREATE TABLE IF NOT EXISTS __migrations (
      id INTEGER PRIMARY KEY ${db.driver === 'postgres' ? 'GENERATED ALWAYS AS IDENTITY' : 'AUTOINCREMENT'},
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (${db.driver === 'postgres' ? "NOW()::TEXT" : "datetime('now')"})
    )`);

    const migrDir = resolve('migrations');
    if (!existsSync(migrDir)) {
      console.log('  No migrations directory found.\n');
      return;
    }

    const files = readdirSync(migrDir)
      .filter(f => f.endsWith('.js'))
      .sort();

    if (files.length === 0) {
      console.log('  No migration files found.\n');
      return;
    }

    console.log(`\n  Running ${files.length} migration(s)...\n`);

    for (const file of files) {
      const mod = await import(join(migrDir, file));
      if (!mod.up) {
        console.error(`  Skipping ${file}: no 'up' export`);
        continue;
      }
      const sql = mod.up.trim();
      if (sql) {
        await db.exec(sql);
      }
      const ph = db.driver === 'postgres' ? '$1' : '?';
      await db.query(`INSERT INTO __migrations (name) VALUES (${ph})`, file);
      console.log(`  \u2713 ${file}`);
    }

    console.log(`\n  Done. Fresh database with ${files.length} migration(s) applied.\n`);
  } finally {
    await db.close();
  }
}

export async function migrateStatus(args) {
  const tovaFile = findTovaFile(args[0]);
  const cfg = discoverDbConfig(tovaFile);
  const db = await connectDb(cfg);

  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS __migrations (
      id INTEGER PRIMARY KEY ${db.driver === 'postgres' ? 'GENERATED ALWAYS AS IDENTITY' : 'AUTOINCREMENT'},
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (${db.driver === 'postgres' ? "NOW()::TEXT" : "datetime('now')"})
    )`);

    const applied = await db.query('SELECT name, applied_at FROM __migrations ORDER BY name');
    const appliedMap = new Map(applied.map(r => [r.name, r.applied_at]));

    const migrDir = resolve('migrations');
    const files = existsSync(migrDir)
      ? readdirSync(migrDir).filter(f => f.endsWith('.js')).sort()
      : [];

    if (files.length === 0) {
      console.log('\n  No migration files found.\n');
      return;
    }

    console.log('\n  Migration Status:');
    console.log('  ' + '-'.repeat(60));

    for (const file of files) {
      const appliedAt = appliedMap.get(file);
      const status = appliedAt ? `applied (${appliedAt})` : 'pending';
      const icon = appliedAt ? '\u2713' : '\u25cb';
      console.log(`  ${icon} ${file}  ${status}`);
    }

    const pendingCount = files.filter(f => !appliedMap.has(f)).length;
    console.log('  ' + '-'.repeat(60));
    console.log(`  ${files.length} total, ${files.length - pendingCount} applied, ${pendingCount} pending\n`);
  } finally {
    await db.close();
  }
}
