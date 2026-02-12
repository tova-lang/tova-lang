# Server Reference

The `server` block in Lux provides a comprehensive set of features for building backend services. Server code runs on Bun and compiles to a standalone HTTP server.

## Routes

### Route Declaration

```lux
server {
  fn get_users() -> [User] {
    UserModel.all()
  }

  route GET "/api/users" => get_users
  route POST "/api/users" => create_user
  route PUT "/api/users/:id" => update_user
  route DELETE "/api/users/:id" => delete_user
  route PATCH "/api/users/:id" => patch_user
}
```

Supported HTTP methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`.

### Path Parameters

```lux
route GET "/users/:id" => get_user

fn get_user(id: String) {
  UserModel.find(id)
}
```

Path parameters (`:id`) are extracted and passed to the handler. With type annotations, they are automatically validated:

```lux
fn get_user(id: Int) {    // id is auto-parsed as Int
  UserModel.find(id)
}
```

### Route Guards (Decorators)

```lux
route GET "/admin/users" with auth => get_users
route DELETE "/users/:id" with auth, role("admin") => delete_user
```

The `with` keyword attaches middleware/guards to specific routes.

### Route Groups

```lux
routes "/api/v1" {
  route GET "/users" => get_users
  route POST "/users" => create_user

  routes "/admin" {
    route GET "/stats" with auth => get_stats
  }
}
```

Route groups prefix all nested routes with the group path.

## Response Helpers

```lux
respond(200, { data: users })           // JSON response with status
respond(201, user)                       // JSON response
respond(204, nil)                        // No content
respond(200, data, { "X-Custom": "v" }) // with custom headers
redirect("/login")                       // 302 redirect
redirect("/login", 301)                  // Permanent redirect
html("<h1>Hello</h1>")                   // HTML response (optional: status, headers)
text("plain text")                       // Text response (optional: status, headers)
```

### Headers and Cookies

```lux
with_headers(response, {
  "X-Custom": "value",
  "Cache-Control": "no-cache"
})

// set_cookie returns a cookie string — attach to response headers
cookie = set_cookie("session", token, {
  httpOnly: true,
  secure: true,
  maxAge: 86400
})
with_headers(response, { "Set-Cookie": cookie })
```

### Streaming

```lux
stream(fn(send, close) {
  send("chunk 1")
  send("chunk 2")
  close()    // end stream
})
```

## Middleware

### Global Middleware

```lux
server {
  middleware fn logger(req, next) {
    start = Date.now()
    result = next(req)
    duration = Date.now() - start
    print("[{req.method}] {req.url} - {duration}ms")
    result
  }
}
```

Middleware wraps all request handlers. The `next` function calls the next middleware or the route handler.

### Per-Route Middleware

```lux
route GET "/protected" with auth => handler
route DELETE "/admin" with auth, role("admin") => handler
```

## Database

### Configuration

```lux
server {
  db { path: "./data.db" }                    // SQLite (default)
  db { driver: "postgres", url: "..." }       // PostgreSQL
  db { driver: "mysql", url: "..." }          // MySQL
}
```

### Query Methods

```lux
// Raw queries
users = db.query("SELECT * FROM users WHERE age > ?", 18)
user = db.get("SELECT * FROM users WHERE id = ?", id)
db.run("INSERT INTO users (name) VALUES (?)", name)
db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)")

// Transactions
db.transaction(fn() {
  db.run("INSERT INTO orders (user_id) VALUES (?)", user_id)
  db.run("UPDATE inventory SET count = count - 1 WHERE id = ?", item_id)
})
```

### Migrations

```lux
// Run from CLI
lux migrate:create add_users_table
lux migrate:up app.lux
lux migrate:status app.lux
```

```lux
server {
  db.migrate()    // Run pending migrations on startup
}
```

## ORM / Models

The `model` declaration generates CRUD operations from shared types:

```lux
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

This generates a `UserModel` with these methods:

| Method | Description | Example |
|--------|-------------|---------|
| `.find(id)` | Find by primary key | `UserModel.find(1)` |
| `.all()` | Get all records | `UserModel.all()` |
| `.where(conditions)` | Query with conditions object | `UserModel.where({ age: 18 })` |
| `.create(data)` | Insert a record | `UserModel.create({ name: "Alice" })` |
| `.update(id, data)` | Update a record | `UserModel.update(1, { name: "Bob" })` |
| `.delete(id)` | Delete a record | `UserModel.delete(1)` |
| `.count(conditions?)` | Count records | `UserModel.count()`, `UserModel.count({ active: true })` |

The model auto-creates the database table on first use based on the type's fields.

### Model Configuration

```lux
model User {
  table: "my_users"           // custom table name
  timestamps: true            // adds created_at, updated_at columns
  belongs_to: [Company]       // parent relation
  has_many: [Post]            // child relation
}
```

With relations configured, the model generates accessor methods (e.g., `UserModel.company(company_id)`, `UserModel.posts(user_id)`).

## Authentication

### Configuration

```lux
server {
  auth {
    type: "jwt"
    secret: "your-secret-key"
  }
}
```

### API Key Authentication

```lux
server {
  auth {
    type: "api_key"
    keys: ["key1", "key2", "key3"]
    header: "X-API-Key"            // default header name
  }
}
```

### Auth Helpers

```lux
// Hash and verify passwords
hashed = hash_password("my_password")
is_valid = verify_password("my_password", hashed)

// JWT — sign_jwt(payload, secret?, options?)
token = sign_jwt({ user_id: 1, role: "admin" })
token = sign_jwt({ user_id: 1 }, "secret", { expires_in: 3600 })

// Protected routes
route GET "/profile" with auth => get_profile

fn get_profile(req) {
  user_id = req.user.user_id    // decoded JWT payload
  UserModel.find(user_id)
}
```

## CORS

```lux
server {
  cors {
    origins: ["https://example.com", "http://localhost:3000"]
    methods: ["GET", "POST", "PUT", "DELETE"]
    headers: ["Content-Type", "Authorization"]
    credentials: true
  }
}
```

Use `origins: ["*"]` to allow all origins.

## Rate Limiting

```lux
server {
  rate_limit {
    max: 100          // maximum requests
    window: 60        // per time window (seconds)
  }
}
```

## Server-Sent Events (SSE)

```lux
server {
  sse "/events" fn(send, close) {
    send({ type: "connected", data: "Welcome" })

    // Send periodic updates
    var i = 0
    while i < 10 {
      send({ type: "update", data: "tick {i}" })
      i += 1
    }

    close()
  }
}
```

The client can connect using the standard `EventSource` API or the Lux `sse()` helper.

## WebSocket

```lux
server {
  ws {
    on_open fn(ws) {
      print("Client connected")
      ws.send("Welcome!")
    }

    on_message fn(ws, message) {
      print("Received: {message}")
      ws.send("Echo: {message}")
    }

    on_close fn(ws, code, reason) {
      print("Disconnected: {code}")
    }

    on_error fn(ws, error) {
      print("Error: {error}")
    }
  }
}
```

## Environment Variables

```lux
server {
  env DATABASE_URL: String = "sqlite:./data.db"
  env PORT: Int = 3000
  env DEBUG: Bool = false
  env API_KEY: String        // required, no default
}
```

Environment variables are typed and validated at startup. If a required variable (no default) is missing, the server fails to start.

## Background Jobs

```lux
server {
  background fn send_email(to, subject, body) {
    // runs in background, doesn't block the request
    mail.send(to, subject, body)
  }
}
```

## Scheduled Tasks

```lux
server {
  schedule "*/5 * * * *" fn cleanup() {
    db.run("DELETE FROM sessions WHERE expires_at < ?", Date.now())
  }

  schedule "0 0 * * *" fn daily_report() {
    // runs at midnight
    generate_report()
  }
}
```

The schedule pattern is a cron expression.

## Lifecycle Hooks

```lux
server {
  on_start fn() {
    print("Server started")
    db.migrate()
  }

  on_stop fn() {
    print("Server shutting down")
    db.close()
  }
}
```

## Health Checks

```lux
server {
  health "/health"
}
```

This creates a `GET /health` endpoint that returns `{ status: "ok" }`.

## Error Handling

```lux
server {
  on_error fn(err, req) {
    print("Error: {err}")
    respond(500, { error: "Internal server error" })
  }
}
```

## Static Files

```lux
server {
  static "/public" => "./public"
  static "/assets" => "./dist/assets"
}
```

With SPA fallback:

```lux
static "/app" => "./dist" fallback "index.html"
```

## Session Management

```lux
server {
  session {
    secret: "session-secret"
    max_age: 86400
    cookie_name: "__sid"
  }
}
```

## File Upload

```lux
server {
  upload {
    max_size: 10_000_000        // 10MB
    allowed_types: ["image/png", "image/jpeg", "application/pdf"]
  }
}
```

## TLS / HTTPS

```lux
server {
  tls {
    cert: "./cert.pem"
    key: "./key.pem"
  }
}
```

## Compression

```lux
server {
  compression {
    min_size: 1024              // minimum bytes to compress
  }
}
```

The presence of the `compression` block enables compression. Responses are compressed with gzip/deflate based on the `Accept-Encoding` header.

## Caching

```lux
server {
  cache {
    max_age: 3600
    stale_while_revalidate: 60
  }
}
```

## Max Body Size

```lux
server {
  max_body 10_000_000          // 10MB limit
}
```

## OpenAPI Documentation

Lux auto-generates OpenAPI documentation from your routes and types:

- `GET /openapi.json` — OpenAPI 3.0 specification
- `GET /docs` — Interactive Swagger UI

Route parameters, request bodies, and response types are derived from function signatures and shared type declarations.

## Content Negotiation

```lux
fn get_user(req, id: Int) {
  user = UserModel.find(id)
  negotiate(req, user, {
    html: fn(data) html("<h1>{data.name}</h1>"),
    xml: fn(data) text("<user><name>{data.name}</name></user>")
  })
}
```

The `negotiate` function checks the `Accept` header and calls the appropriate handler.

## Race Protection

A global async mutex is automatically available. `withLock` takes a single function argument:

```lux
server {
  fn update_counter() {
    withLock(fn() {
      count = db.get("SELECT count FROM counters WHERE id = 1")
      db.run("UPDATE counters SET count = ? WHERE id = 1", count + 1)
    })
  }
}
```

## Service Discovery

```lux
server "api" {
  discover "events" at "http://localhost:3002"
  discover "auth" at "http://localhost:3003" with {
    threshold: 5         // circuit breaker threshold
    timeout: 3000        // request timeout in ms
    reset_timeout: 30000 // circuit breaker reset timeout
  }
}
```

Discovered services can be called as `service_name.function_name()`. The circuit breaker pattern protects against cascading failures.

## Distributed Tracing

Request IDs are automatically generated and propagated by the server runtime. The following are available in any server code:

- `__getRequestId()` — returns the current request's trace ID
- `__getLocals()` — returns request-scoped storage (via `AsyncLocalStorage`)

Cross-server RPC calls automatically propagate the `X-Request-Id` header.

## Event Bus (Pub/Sub)

Named server blocks can communicate via events:

```lux
server "api" {
  subscribe "user.created" fn(data) {
    print("New user: {data.name}")
  }

  fn create_user(name: String) {
    user = UserModel.create({ name })
    publish("user.created", user)    // notifies all subscribers + peer servers
    user
  }
}
```

## Background Job Dispatch

Background jobs defined with `background fn` are invoked via `spawn_job`:

```lux
server {
  background fn send_email(to, subject, body) {
    mail.send(to, subject, body)
  }

  fn register_user(name, email) {
    user = UserModel.create({ name, email })
    spawn_job("send_email", email, "Welcome", "Hello {name}!")
    user
  }
}
```

## WebSocket Rooms

WebSocket blocks support room-based messaging:

```lux
ws {
  on_open fn(ws) {
    join(ws, "general")       // join a room
  }
  on_message fn(ws, msg) {
    broadcast_to("general", msg, ws)  // broadcast to room (exclude sender)
  }
  on_close fn(ws, code, reason) {
    leave(ws, "general")     // leave a room
  }
}
```

Available functions: `join(ws, room)`, `leave(ws, room)`, `broadcast(data, exclude?)`, `broadcast_to(room, data, exclude?)`.

## SSE Channels

When SSE endpoints are defined, channel management is available:

```lux
channel = sse_channel("updates")
channel.send({ type: "new_data", data: payload })    // send to all subscribers
channel.count()                                        // number of subscribers
```

## Cache Control Helpers

```lux
cache_control(response, 3600, { private: true })     // set Cache-Control header
etag(response, "hash123")                             // set ETag header
```

## Wildcard Routes

Routes support wildcard parameters:

```lux
route GET "/files/*path" => serve_file     // *param captures remainder
route GET "/proxy/*" => proxy_request      // trailing * is catch-all
```

## Comparison with Other Frameworks

### Route Definition

| Feature | Lux | Express | Hono |
|---------|-----|---------|------|
| Route | `route GET "/users" => handler` | `app.get("/users", handler)` | `app.get("/users", handler)` |
| Params | `:id` auto-extracted | `req.params.id` | `c.req.param("id")` |
| Middleware | `with auth` on route | `app.use(auth)` | `app.use(auth)` |
| Groups | `routes "/api" { ... }` | `express.Router()` | `app.route("/api")` |

### Database

| Feature | Lux | Prisma | Drizzle |
|---------|-----|--------|---------|
| Setup | `db { path: "./data.db" }` | Schema file + generate | Schema + config |
| Model | `model User` (auto-CRUD) | `prisma.user.findMany()` | `db.select().from(users)` |
| Query | `db.query("SELECT ...")` | Raw queries available | SQL-like builder |
| Migrate | `lux migrate:up` | `prisma migrate dev` | `drizzle-kit push` |
