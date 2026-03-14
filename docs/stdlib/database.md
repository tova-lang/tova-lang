# Database

Tova provides a built-in SQLite connector via `sqlite()`. It uses Bun's native `bun:sqlite` module (or `better-sqlite3` as a Node.js fallback) for zero-dependency, synchronous database access.

---

## Quick Start

```tova
db = sqlite(":memory:")

db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)")
db.exec("INSERT INTO users (name, age) VALUES (?, ?)", ["Alice", 30])
db.exec("INSERT INTO users (name, age) VALUES (?, ?)", ["Bob", 25])

users = db.query("SELECT * FROM users WHERE age > ?", [20])
peek(users)

db.close()
```

---

## sqlite

```tova
sqlite(path) -> Database
```

Opens (or creates) a SQLite database at the given path. Use `":memory:"` for an in-memory database.

```tova
db = sqlite("app.db")          // file-based
db = sqlite(":memory:")         // in-memory
```

Returns a database object with `.query()`, `.exec()`, `.writeTable()`, and `.close()` methods.

---

## Methods

### query

```tova
db.query(sql, params?) -> Table
```

Runs a SELECT query and returns the results as a `Table`. Parameters are positional (`?` placeholders) to prevent SQL injection.

```tova
// All users
users = db.query("SELECT * FROM users")

// Parameterized query
active = db.query("SELECT * FROM users WHERE active = ? AND age > ?", [1, 18])

// Use the result as a normal Table
active |> sortBy(.name) |> peek()
```

The returned `Table` has all the standard table operations available — `where`, `derive`, `groupBy`, `agg`, `sortBy`, `join`, etc.

### exec

```tova
db.exec(sql, params?) -> { changes: Int }
```

Runs a statement that modifies data (INSERT, UPDATE, DELETE, CREATE, DROP). Returns an object with the number of affected rows.

```tova
db.exec("CREATE TABLE logs (id INTEGER PRIMARY KEY, msg TEXT, ts REAL)")

result = db.exec("INSERT INTO logs (msg, ts) VALUES (?, ?)", ["hello", now()])
print("{result.changes} row(s) inserted")

db.exec("UPDATE logs SET msg = ? WHERE id = ?", ["updated", 1])
db.exec("DELETE FROM logs WHERE ts < ?", [cutoff])
```

### writeTable

```tova
write(table, db, tableName, opts?) -> Nil
```

Writes an entire `Table` to a database table. By default, drops and recreates the table. Use `append: true` to add rows to an existing table.

```tova
sales = read("sales.csv")

// Create table from data (DROP + CREATE + INSERT)
write(sales, db, "sales")

// Append new data to existing table
new_sales = read("new_sales.csv")
write(new_sales, db, "sales", append: true)
```

**Type inference:** Column types are inferred from the first row of data:

| JS Type | SQLite Type |
|---------|-------------|
| `string` | TEXT |
| `number` (integer) | INTEGER |
| `number` (float) | REAL |
| `boolean` | INTEGER (0/1) |
| `null` | TEXT |

### close

```tova
db.close() -> Nil
```

Closes the database connection. Always close when done to release resources.

```tova
db.close()
```

---

## Integration with read/write

The `sqlite()` connector integrates with Tova's `read()` and `write()` functions:

```tova
db = sqlite("analytics.db")

// Read via db.query
users = db.query("SELECT * FROM users")

// Write a Table to the database
write(users, db, "users_backup")

// Round-trip: query, transform, write back
active = db.query("SELECT * FROM users WHERE active = 1")
  |> derive(.last_seen = nowIso())
write(active, db, "active_users")
```

---

## Parameterized Queries

Always use `?` placeholders for user-supplied values. This prevents SQL injection:

```tova
// Safe — parameterized
user = db.query("SELECT * FROM users WHERE id = ?", [user_id])
```

Parameters are positional. Pass them as an array matching the `?` order in the SQL.

---

## Transactions

Bulk inserts via `writeTable()` are automatically wrapped in a transaction for performance. For custom transactions, use `exec()` with BEGIN/COMMIT:

```tova
db.exec("BEGIN")
db.exec("INSERT INTO accounts (id, balance) VALUES (?, ?)", [1, 1000])
db.exec("INSERT INTO accounts (id, balance) VALUES (?, ?)", [2, 2000])
db.exec("COMMIT")
```

---

## Patterns

### ETL: CSV to SQLite

```tova
db = sqlite("warehouse.db")

// Load and clean
orders = read("orders.csv")
  |> dropNil(.customer_id)
  |> cast(.amount, Float)

// Store in database
write(orders, db, "orders")

// Query the stored data
big_orders = db.query("SELECT * FROM orders WHERE amount > ? ORDER BY amount DESC", [1000])
peek(big_orders)

db.close()
```

### Analytics Cache

```tova
db = sqlite(":memory:")

// Load raw data
raw = read("events.csv")
write(raw, db, "events")

// Run SQL analytics
daily = db.query("
  SELECT date, COUNT(*) as event_count, SUM(value) as total
  FROM events
  GROUP BY date
  ORDER BY date
")

daily |> lineChart(x: .date, y: .total) |> writeText("trend.svg")

db.close()
```

### Multi-Table Joins

```tova
db = sqlite("app.db")

// SQL joins work alongside Tova table joins
result = db.query("
  SELECT u.name, COUNT(o.id) as order_count, SUM(o.total) as lifetime_value
  FROM users u
  LEFT JOIN orders o ON u.id = o.user_id
  GROUP BY u.id
  ORDER BY lifetime_value DESC
  LIMIT 50
")

peek(result, title: "Top 50 Customers")
```

---

## Limitations

- **Synchronous only** — `bun:sqlite` is synchronous by design. Queries block the event loop. For async workloads, use the `data {}` block with `refresh`.
- **No connection pooling** — each `sqlite()` call opens one connection.
- **No migrations** — use `exec()` with CREATE/ALTER statements directly.
- **No ORM** — queries are plain SQL. Use Tova table operations for transformations after querying.
