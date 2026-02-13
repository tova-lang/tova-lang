# Database

Tova servers include built-in database support. SQLite is the default driver, with PostgreSQL and MySQL also available. Configuration is declarative, and query methods are available throughout your server code.

## Configuration

### SQLite (Default)

```tova
server {
  db { path: "./data.db" }
}
```

SQLite requires no external service -- the database is a single file. This is the recommended default for development and many production workloads.

### PostgreSQL

```tova
server {
  db {
    driver: "postgres"
    url: "postgres://user:pass@localhost:5432/mydb"
  }
}
```

### MySQL

```tova
server {
  db {
    driver: "mysql"
    url: "mysql://user:pass@localhost:3306/mydb"
  }
}
```

::: tip
Store database connection strings in environment variables rather than hardcoding them. Use the `env` declaration to load them at startup:
```tova
env DATABASE_URL: String = "sqlite:./data.db"
db { url: DATABASE_URL }
```
:::

## Query Methods

Tova provides four core query methods on the `db` object:

### db.query

Execute a SELECT statement and return all matching rows as an array:

```tova
users = db.query("SELECT * FROM users WHERE age > ?", 18)
active = db.query("SELECT * FROM users WHERE active = ? AND role = ?", true, "admin")
```

### db.get

Execute a SELECT statement and return a single row (or `nil` if no match):

```tova
user = db.get("SELECT * FROM users WHERE id = ?", id)
```

### db.run

Execute an INSERT, UPDATE, or DELETE statement. Returns metadata about the operation (e.g., rows affected, last insert ID):

```tova
db.run("INSERT INTO users (name, email) VALUES (?, ?)", name, email)
db.run("UPDATE users SET active = ? WHERE id = ?", false, user_id)
db.run("DELETE FROM users WHERE last_login < ?", cutoff_date)
```

### db.exec

Execute raw SQL statements, typically for DDL (schema changes). Does not support parameterized values:

```tova
db.exec("CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)")
```

### Parameter Substitution

All parameterized methods (`query`, `get`, `run`) use `?` placeholders to prevent SQL injection:

```tova
// Safe -- parameters are escaped
db.query("SELECT * FROM users WHERE name = ?", user_input)

// NEVER do this -- vulnerable to SQL injection
db.query("SELECT * FROM users WHERE name = '{user_input}'")
```

## Transactions

Wrap multiple operations in a transaction to ensure atomicity. If any statement fails, the entire transaction rolls back:

```tova
db.transaction(fn() {
  db.run("INSERT INTO orders (user_id, total) VALUES (?, ?)", user_id, total)
  db.run("UPDATE inventory SET count = count - 1 WHERE id = ?", item_id)
  db.run("INSERT INTO audit_log (action) VALUES (?)", "order_placed")
})
```

If the function completes without error, the transaction commits. If it throws, the transaction rolls back automatically.

## Migrations

Migrations let you evolve your database schema over time in a controlled, versioned way.

### Creating Migrations

Use the CLI to generate a new migration file:

```sh
tova migrate:create add_users_table
```

This creates a timestamped migration file that you can fill in with your schema changes.

### Running Migrations

Apply all pending migrations:

```sh
tova migrate:up app.tova
```

### Checking Status

See which migrations have been applied and which are pending:

```sh
tova migrate:status app.tova
```

### Auto-Migration on Startup

Run pending migrations automatically when the server starts:

```tova
server {
  db { path: "./data.db" }
  db.migrate()
}
```

This is convenient for development. For production, running migrations explicitly via the CLI gives you more control.

## Race Protection

A global async mutex is available for protecting critical sections from concurrent access. Use `withLock` to serialize access:

```tova
server {
  fn update_counter() {
    withLock(fn() {
      count = db.get("SELECT count FROM counters WHERE id = 1")
      db.run("UPDATE counters SET count = ? WHERE id = 1", count.count + 1)
    })
  }
}
```

`withLock` ensures that only one invocation of the wrapped function runs at a time, even under concurrent requests. This prevents read-modify-write race conditions.

## Practical Tips

**Use transactions for multi-step writes.** Any time you perform multiple related writes, wrap them in `db.transaction`. This prevents partial updates if something fails midway.

**Prefer parameterized queries.** Always use `?` placeholders instead of string interpolation. This prevents SQL injection and handles type escaping correctly.

**Run migrations explicitly in production.** While `db.migrate()` on startup is convenient for development, production deployments benefit from running `tova migrate:up` as a separate step so you can inspect and control the migration process.
