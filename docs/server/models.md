# Models

The `model` declaration generates a full set of CRUD operations from a shared type definition. Instead of writing boilerplate database queries by hand, you declare a model and Tova generates a typed interface for creating, reading, updating, and deleting records.

## Defining a Model

Start with a type in the `shared` block, then declare a `model` in the `server` block:

```tova
shared {
  type User {
    id: Int
    name: String
    email: String
  }
}

server {
  db { path: "./data.db" }
  model User
}
```

The `model User` declaration generates a `UserModel` object with methods for all standard database operations. The database table is auto-created on first use, with columns derived from the type's fields.

## Generated Methods

Every model provides the following methods:

| Method | Description | Example |
|--------|-------------|---------|
| `.find(id)` | Find a single record by primary key | `UserModel.find(1)` |
| `.all()` | Retrieve all records | `UserModel.all()` |
| `.where(conditions)` | Query records matching a conditions object | `UserModel.where({ role: "admin" })` |
| `.create(data)` | Insert a new record | `UserModel.create({ name: "Alice", email: "alice@example.com" })` |
| `.update(id, data)` | Update an existing record by primary key | `UserModel.update(1, { name: "Bob" })` |
| `.delete(id)` | Delete a record by primary key | `UserModel.delete(1)` |
| `.count(conditions?)` | Count records, optionally with conditions | `UserModel.count()`, `UserModel.count({ active: true })` |
| `.paginate(page?, perPage?)` | Paginated results with metadata | `UserModel.paginate(2, 10)` |
| `.soft_delete(id)` | Mark a record as deleted without removing it | `UserModel.soft_delete(1)` |
| `.restore(id)` | Restore a soft-deleted record | `UserModel.restore(1)` |
| `.active()` | Retrieve only non-soft-deleted records | `UserModel.active()` |

### find

Retrieve a single record by its primary key. Returns the record or `nil`:

```tova
user = UserModel.find(1)
```

### all

Retrieve every record in the table:

```tova
users = UserModel.all()
```

### where

Query records matching a set of conditions. Pass an object where keys are column names and values are the expected values:

```tova
admins = UserModel.where({ role: "admin" })
active_members = UserModel.where({ active: true, role: "member" })
```

### create

Insert a new record and return it (including the generated `id`):

```tova
user = UserModel.create({
  name: "Alice",
  email: "alice@example.com"
})
// user.id is now set
```

### update

Update a record by primary key. Pass the fields to change:

```tova
UserModel.update(1, { name: "Alice Smith", email: "alice.smith@example.com" })
```

### delete

Remove a record by primary key:

```tova
UserModel.delete(1)
```

### count

Count records in the table. Optionally pass conditions to count a subset:

```tova
total = UserModel.count()
active_count = UserModel.count({ active: true })
```

### paginate

Retrieve records in pages. Returns an object with the page of data and pagination metadata:

```tova
result = UserModel.paginate(1, 10)
// result.data       — array of records for this page
// result.page       — current page number (1-indexed)
// result.perPage    — records per page
// result.total      — total record count
// result.totalPages — total number of pages
```

Both arguments are optional. `page` defaults to `1` and `perPage` defaults to `20`. The `perPage` value is clamped to a maximum of `100` to prevent oversized queries:

```tova
// Default: page 1, 20 records per page
first_page = UserModel.paginate()

// Page 3, 50 records per page
page_three = UserModel.paginate(3, 50)
```

Use it in a route handler to build paginated API endpoints:

```tova
fn list_users(req) {
  page = req.query.page || 1
  result = UserModel.paginate(page, 20)
  respond(200, result)
}

route GET "/api/users" => list_users
```

### soft_delete

Mark a record as deleted by setting a `deleted_at` timestamp, without actually removing the row from the database. Returns the updated record:

```tova
UserModel.soft_delete(1)
// The row still exists in the database, but deleted_at is now set
```

::: tip
Soft deletes are useful when you need to retain data for auditing or allow users to undo deletions. Use `.active()` to query only non-deleted records, and `.restore()` to undo a soft delete.
:::

### restore

Clear the `deleted_at` timestamp on a soft-deleted record, making it active again. Returns the restored record:

```tova
UserModel.restore(1)
// deleted_at is now NULL — the record is active again
```

### active

Retrieve all records that have not been soft-deleted (where `deleted_at IS NULL`):

```tova
active_users = UserModel.active()
```

This pairs with `soft_delete` and `restore` to give you a complete soft-deletion workflow:

```tova
fn deactivate_user(id: Int) {
  UserModel.soft_delete(id)
  respond(200, { message: "User deactivated" })
}

fn reactivate_user(id: Int) {
  UserModel.restore(id)
  respond(200, { message: "User reactivated" })
}

fn list_active_users() {
  respond(200, UserModel.active())
}
```

## Model Configuration

Customize the model with a configuration block:

```tova
model User {
  table: "my_users"           // custom table name (default: lowercase plural of type name)
  timestamps: true            // adds created_at and updated_at columns
  belongs_to: [Company]       // parent relation
  has_many: [Post]            // child relation
}
```

### Custom Table Name

By default, the table name is the lowercase, pluralized version of the type name (e.g., `User` becomes `users`). Override this with the `table` option:

```tova
model User {
  table: "app_users"
}
```

### Timestamps

When `timestamps: true` is set, Tova automatically adds `created_at` and `updated_at` columns. `created_at` is set on insert, and `updated_at` is refreshed on every update:

```tova
model User {
  timestamps: true
}
```

### Relations

Declare relationships between models using `belongs_to` and `has_many`:

```tova
shared {
  type Company {
    id: Int
    name: String
  }

  type User {
    id: Int
    name: String
    company_id: Int
  }

  type Post {
    id: Int
    title: String
    user_id: Int
  }
}

server {
  db { path: "./data.db" }

  model Company {
    has_many: [User]
  }

  model User {
    belongs_to: [Company]
    has_many: [Post]
  }

  model Post {
    belongs_to: [User]
  }
}
```

Relations generate accessor methods on the model:

```tova
// Get the company a user belongs to
company = UserModel.company(user.company_id)

// Get all posts for a user
posts = UserModel.posts(user.id)

// Get all users in a company
users = CompanyModel.users(company.id)
```

## Using Models in Route Handlers

Models pair naturally with routes:

```tova
server {
  db { path: "./data.db" }
  model User

  fn get_users() {
    UserModel.all()
  }

  fn get_user(id: Int) {
    user = UserModel.find(id)
    if user == nil {
      respond(404, { error: "User not found" })
    } else {
      respond(200, user)
    }
  }

  fn create_user(req) {
    user = UserModel.create(req.body)
    respond(201, user)
  }

  fn update_user(req, id: Int) {
    UserModel.update(id, req.body)
    respond(200, UserModel.find(id))
  }

  fn delete_user(id: Int) {
    UserModel.delete(id)
    respond(204, nil)
  }

  route GET "/api/users" => get_users
  route GET "/api/users/:id" => get_user
  route POST "/api/users" => create_user
  route PUT "/api/users/:id" => update_user
  route DELETE "/api/users/:id" => delete_user
}
```

## SQL Injection Protection

Every generated model includes a column whitelist that validates column names before building SQL. When you call `.where()`, `.create()`, `.update()`, or `.count()` with a conditions object, the model checks every key against the set of known columns from your type definition. If an invalid column name is passed, the model throws an error immediately — before any SQL is executed:

```tova
// This works — "name" is a valid column
UserModel.where({ name: "Alice" })

// This throws "Invalid column: malicious_input" at runtime
UserModel.where({ malicious_input: "'; DROP TABLE users; --" })
```

All query values are passed as parameterized placeholders (`?` for SQLite, `$1`/`$2`/... for PostgreSQL), so values are never interpolated into the SQL string. This two-layer defense — column whitelist plus parameterized queries — prevents SQL injection through both column names and values.

## Database Driver Differences

Models work transparently across database drivers, but there are a few differences in the generated SQL:

| Feature | SQLite | PostgreSQL |
|---------|--------|------------|
| Primary key | `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| Float type | `REAL` | `DOUBLE PRECISION` |
| Bool type | `INTEGER` | `BOOLEAN` |
| Query placeholders | `?` | `$1`, `$2`, ... |
| Insert return | Re-selects by `lastInsertRowid` | `RETURNING *` |
| Soft delete timestamp | `datetime('now')` | `NOW()` |
| Method signatures | Synchronous | `async` (all methods return promises) |

When using PostgreSQL, all model methods are async and must be awaited. With SQLite, they are synchronous. Your Tova code stays the same either way — the compiler handles the difference.

## Practical Tips

**Define types in the shared block.** Since models derive from shared types, the same type definitions are available on both the server and the client. This keeps your API contract consistent.

**Use timestamps for audit trails.** Enabling `timestamps: true` gives you automatic tracking of when records were created and last modified, which is valuable for debugging and compliance.

**Use `.where` for filtered queries.** Instead of writing raw SQL for simple conditions, use `.where({ column: value })`. It is more readable and handles parameter escaping automatically.

**Use `.paginate` for list endpoints.** Returning all records with `.all()` works for small datasets, but for anything user-facing, use `.paginate(page, perPage)` to avoid loading unbounded result sets into memory.

**Prefer soft deletes for user-facing data.** Using `.soft_delete()` instead of `.delete()` lets you retain records for auditing and support undo functionality. Combine with `.active()` in your queries to filter out deleted records.
