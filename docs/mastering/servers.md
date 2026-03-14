<script setup>
const basicServerCode = `// A simple Tova server
server {
  fn greet(name) {
    { message: "Hello, {name}!" }
  }

  route GET "/api/hello/:name" => greet
}
// Run with: tova run server.tova
// Visit: http://localhost:3000/api/hello/world`

const routesCode = `// RESTful routes with all HTTP methods
server {
  var todos = [
    { id: 1, title: "Learn Tova", done: false },
    { id: 2, title: "Build an API", done: false }
  ]
  var next_id = 3

  fn get_todos() {
    todos
  }

  fn get_todo(id) {
    found = todos |> find(fn(t) t.id == toInt(id))
    match found {
      Some(todo) => todo
      None => respond(404, { error: "Todo not found" })
    }
  }

  fn create_todo(title) {
    todo = { id: next_id, title: title, done: false }
    next_id += 1
    todos = [...todos, todo]
    respond(201, todo)
  }

  fn update_todo(id, title, done) {
    todos = todos |> map(fn(t) {
      if t.id == toInt(id) {
        { ...t, title: title, done: done }
      } else {
        t
      }
    })
    respond(200, { ok: true })
  }

  fn delete_todo(id) {
    todos = todos |> filter(fn(t) t.id != toInt(id))
    respond(200, { ok: true })
  }

  route GET "/api/todos" => get_todos
  route GET "/api/todos/:id" => get_todo
  route POST "/api/todos" => create_todo
  route PUT "/api/todos/:id" => update_todo
  route DELETE "/api/todos/:id" => delete_todo
}`

const middlewareCode = `// Middleware and error handling
server {
  middleware fn logger(req, next) {
    start = Date.now()
    result = next(req)
    elapsed = Date.now() - start
    print("[{req.method}] {req.url} - {elapsed}ms")
    result
  }

  middleware fn cors_handler(req, next) {
    result = next(req)
    result
  }

  on_error fn(err, req) {
    print("Error: {err}")
    respond(500, { error: "Internal server error" })
  }

  fn get_status() {
    { status: "ok", uptime: process.uptime() }
  }

  route GET "/api/status" => get_status
}`

const fullApiCode = `// PROJECT: Task Manager REST API
server {
  health "/health"

  cors {
    origins: ["http://localhost:5173"]
    methods: ["GET", "POST", "PUT", "DELETE"]
    headers: ["Content-Type", "Authorization"]
  }

  auth { type: "jwt", secret: "my_secret_key" }

  rate_limit { max: 100, window: 60 }

  middleware fn logger(req, next) {
    start = Date.now()
    result = next(req)
    elapsed = Date.now() - start
    print("[{req.method}] {req.url} - {elapsed}ms")
    result
  }

  on_error fn(err, req) {
    print("Server error: {err}")
    respond(500, { error: "Something went wrong" })
  }

  var tasks = []
  var next_id = 1

  fn list_tasks() {
    tasks
  }

  fn get_task(id) {
    found = tasks |> find(fn(t) t.id == toInt(id))
    match found {
      Some(task) => task
      None => respond(404, { error: "Task not found" })
    }
  }

  fn create_task(title: String, priority: String) {
    task = {
      id: next_id,
      title: title,
      priority: priority,
      done: false,
      created_at: Date.now()
    }
    next_id += 1
    tasks = [...tasks, task]
    respond(201, task)
  }

  fn update_task(id, title, priority, done) {
    tasks = tasks |> map(fn(t) {
      if t.id == toInt(id) {
        { ...t, title: title, priority: priority, done: done }
      } else {
        t
      }
    })
    respond(200, { ok: true })
  }

  fn delete_task(id) {
    tasks = tasks |> filter(fn(t) t.id != toInt(id))
    respond(200, { ok: true })
  }

  routes "/api/v1" {
    route GET "/tasks" => list_tasks
    route GET "/tasks/:id" => get_task
    route POST "/tasks" with auth => create_task
    route PUT "/tasks/:id" with auth => update_task
    route DELETE "/tasks/:id" with auth, role("admin") => delete_task
  }

  schedule "5m" fn cleanup_done() {
    tasks = tasks |> filter(fn(t) !t.done)
    print("Cleaned up completed tasks")
  }
}`
</script>

# Chapter 14: Building Servers

Every app eventually needs a backend. Tova's `server` block lets you define routes, middleware, database models, authentication, and more in a single cohesive file. No boilerplate, no framework configuration, no dependency wrangling. You write what you mean, and Tova generates a production-ready HTTP server that runs on Bun.

By the end of this chapter, you'll build a complete REST API for a task manager with auth, validation, route groups, and scheduled jobs.

## The Server Block

Everything starts with the `server` keyword:

```tova
server {
  fn hello() {
    { message: "Hello from Tova!" }
  }
}
```

Run it with `tova run server.tova` and you get a server on port 3000. Every function inside a `server` block is automatically exposed as an RPC endpoint at `/rpc/<function_name>`. But explicit routes give you full control over your API.

<TryInPlayground :code="basicServerCode" label="Basic Server" />

::: tip How It Works Under the Hood
Tova compiles your `server` block into a Bun HTTP server with routing, CORS headers, JSON parsing, request logging, and graceful shutdown -- all generated at compile time. No runtime framework overhead.
:::

## Routes

Define HTTP endpoints with `route METHOD "path" => handler`:

```tova
server {
  fn get_users() {
    [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]
  }

  fn create_user(name, email) {
    respond(201, { name: name, email: email })
  }

  route GET "/api/users" => get_users
  route POST "/api/users" => create_user
}
```

Tova supports all standard HTTP methods:

```tova
route GET "/items" => list_items
route POST "/items" => create_item
route PUT "/items/:id" => update_item
route PATCH "/items/:id" => patch_item
route DELETE "/items/:id" => delete_item
```

### Route Parameters

Use `:param` in the path to capture URL segments. Tova extracts them automatically and passes them to your handler:

```tova
server {
  fn get_user(id) {
    // id is extracted from the URL path
    { user_id: id }
  }

  fn update_user(id, name, email) {
    // id from URL, name and email from POST body
    { updated: id, name: name, email: email }
  }

  route GET "/api/users/:id" => get_user
  route PUT "/api/users/:id" => update_user
}
```

For GET requests, handler parameters are matched from URL path params and query string params. For POST/PUT/PATCH, they come from the request body (JSON).

## Request and Response

### The Request Context

When your handler takes a parameter named `req`, it receives the full request context:

```tova
server {
  fn debug_request(req) {
    {
      method: req.method,
      url: req.url,
      headers: req.headers,
      query: req.query,
      cookies: req.cookies
    }
  }

  route GET "/api/debug" => debug_request
}
```

You can also combine `req` with other parameters:

```tova
server {
  fn update_item(req, id) {
    user_agent = req.headers["user-agent"]
    { updated: id, agent: user_agent }
  }

  route PUT "/api/items/:id" => update_item
}
```

### Response Helpers

Tova provides built-in response functions:

```tova
server {
  fn create_item(name) {
    if name == "" {
      return respond(400, { error: "Name is required" })
    }
    respond(201, { name: name, created: true })
  }

  fn go_home(req) {
    redirect("/dashboard")
  }

  fn login(req) {
    // Set a cookie with options
    set_cookie("session", "abc123", {
      httpOnly: true,
      maxAge: 86400,
      sameSite: "Strict"
    })
  }

  fn events(req) {
    // Server-sent events via streaming
    stream(fn(send, close) {
      send("connected")
      send("data: hello")
      close()
    })
  }
}
```

Return values are automatically wrapped in JSON responses. If you return a plain object or array, Tova wraps it in `Response.json()`. If you use `respond()`, you control the status code and body explicitly.

::: tip The respond() Function
`respond(status, body)` creates a full HTTP Response with the given status code and JSON body. It also accepts an optional third argument for custom headers: `respond(200, data, { "X-Custom": "value" })`.
:::

## Typed Parameters and Validation

Add type annotations to handler parameters for automatic runtime validation:

```tova
server {
  fn create_user(name: String, age: Int, active: Bool) {
    { name: name, age: age, active: active }
  }

  fn set_price(amount: Float) {
    { price: amount }
  }

  fn set_tags(tags: [String]) {
    { tags: tags }
  }
}
```

If a client sends the wrong type, Tova returns a `400 Validation Failed` response automatically with details about which fields failed. No manual validation code needed.

## Middleware

Middleware wraps every request, letting you add logging, authentication checks, header injection, or anything else that should happen on every route:

```tova
server {
  middleware fn logger(req, next) {
    start = Date.now()
    result = next(req)
    elapsed = Date.now() - start
    print("[{req.method}] {req.url} - {elapsed}ms")
    result
  }

  middleware fn add_headers(req, next) {
    result = next(req)
    // result passes through; headers added by Tova's CORS system
    result
  }

  fn hello() { "world" }
}
```

Middleware functions take `req` (the request) and `next` (a function that calls the next middleware or the route handler). Always call `next(req)` and return its result unless you want to short-circuit the chain.

### Middleware Chain Order

Middleware runs in the order you declare it. The first middleware wraps the second, which wraps the third, and so on:

```tova
server {
  middleware fn first(req, next) {
    print("Before first")
    result = next(req)
    print("After first")
    result
  }

  middleware fn second(req, next) {
    print("Before second")
    result = next(req)
    print("After second")
    result
  }

  fn hello() { "world" }
}
// Output order: Before first -> Before second -> handler -> After second -> After first
```

<TryInPlayground :code="middlewareCode" label="Middleware & Errors" />

## Route Groups

Group related routes under a shared prefix with `routes`:

```tova
server {
  routes "/api/v1" {
    fn get_users() { [] }
    fn create_user(name: String) { name }

    route GET "/users" => get_users
    route POST "/users" => create_user
  }
}
```

The routes above resolve to `/api/v1/users`. Route groups keep your API organized and make versioning straightforward.

### Scoped Middleware

Route groups can have their own middleware that only applies to routes inside the group:

```tova
server {
  middleware fn global_logger(req, next) {
    print("All requests hit this")
    next(req)
  }

  routes "/api/v1" {
    middleware fn v1_auth(req, next) {
      // Only /api/v1/* routes go through this
      next(req)
    }

    fn get_users() { [] }
    route GET "/users" => get_users
  }

  routes "/api/v2" {
    middleware fn v2_auth(req, next) {
      // Only /api/v2/* routes go through this
      next(req)
    }

    fn get_users_v2() { [] }
    route GET "/users" => get_users_v2
  }
}
```

### API Versioning

Route groups support version metadata and deprecation headers:

```tova
server {
  routes "/api/v1" version: "1" deprecated: true sunset: "2026-06-01" {
    fn get_users() { [] }
    route GET "/users" => get_users
  }

  routes "/api/v2" version: "2" {
    fn get_users_v2() { [] }
    route GET "/users" => get_users_v2
  }
}
```

Deprecated versions automatically include `Deprecation` and `Sunset` headers in responses, helping clients migrate.

## JSON Responses and Parsing

Tova handles JSON automatically. Return any object or array from a handler, and it becomes a JSON response:

```tova
server {
  fn get_config() {
    // Automatically becomes: Content-Type: application/json
    {
      version: "1.0",
      features: ["auth", "logging", "websockets"],
      limits: {
        max_upload: 10485760,
        rate: 100
      }
    }
  }

  route GET "/api/config" => get_config
}
```

For POST/PUT requests, Tova parses the JSON body and extracts parameters by name:

```tova
server {
  fn create_item(name, price, tags) {
    // Client sends: { "name": "Widget", "price": 25, "tags": ["new"] }
    // Tova extracts name, price, and tags from the body
    { created: name, price: price, tags: tags }
  }

  route POST "/api/items" => create_item
}
```

## Database Basics

Declare a database connection with the `db` block:

```tova
server {
  db {
    path: "./app.sqlite"
  }

  fn get_users() {
    db.query("SELECT * FROM users")
  }

  fn create_user(name, email) {
    db.run("INSERT INTO users (name, email) VALUES (?, ?)", [name, email])
    respond(201, { ok: true })
  }

  route GET "/api/users" => get_users
  route POST "/api/users" => create_user
}
```

For SQLite, use `path`. For PostgreSQL or MySQL, use `driver` and `url`:

```tova
server {
  db {
    driver: "postgres"
    url: "postgres://localhost:5432/myapp"
  }

  fn get_users() {
    db.query("SELECT * FROM users")
  }
}
```

Tova auto-detects `db` usage and generates the appropriate imports. When the server shuts down, `db.close()` is called automatically.

## Model Declarations

Define data models in a `shared` block and reference them with `model` in your server:

```tova
shared {
  type User {
    id: Int
    name: String
    email: String
    active: Bool
  }

  type Task {
    id: Int
    title: String
    done: Bool
    priority: Int
  }
}

server {
  db {
    path: "./app.sqlite"
  }

  model User
  model Task

  fn get_users() {
    db.query("SELECT * FROM users")
  }

  route GET "/api/users" => get_users
}
```

The `model` declaration tells Tova to generate a SQL table schema based on the type fields. `Int` maps to `INTEGER`, `String` to `TEXT`, `Bool` to `BOOLEAN`, and `Float` to `REAL` (or `DOUBLE PRECISION` in PostgreSQL). Fields named `id` get `PRIMARY KEY AUTOINCREMENT`.

::: tip Shared Types
Types in the `shared` block are available to both server and browser code. This means your API request/response types stay in sync automatically. When you use `body: User` on a route, Tova validates incoming requests against the type's fields.
:::

## Route Body Type Validation

Annotate route bodies with shared types for automatic deep validation:

```tova
shared {
  type CreateUser {
    name: String
    email: String
    age: Int
  }
}

server {
  route POST "/api/users" body: CreateUser => fn(req) {
    // req.body is guaranteed to match CreateUser's shape
    // Invalid requests get a 400 with detailed error messages
    respond(201, { ok: true })
  }

  route POST "/api/users/batch" body: [CreateUser] => fn(req) {
    // Also works with arrays of typed objects
    respond(201, { count: len(req.body) })
  }
}
```

## Authentication

Set up JWT or API key authentication with the `auth` block:

```tova
server {
  auth { type: "jwt", secret: "your_secret_key" }

  fn public_data() {
    { data: "anyone can see this" }
  }

  fn private_data() {
    { data: "only authenticated users" }
  }

  fn admin_action() {
    { data: "admin only" }
  }

  // No auth required
  route GET "/api/public" => public_data

  // Requires valid JWT
  route GET "/api/private" with auth => private_data

  // Requires valid JWT AND admin role
  route POST "/api/admin" with auth, role("admin") => admin_action
}
```

The `with auth` decorator on a route checks the `Authorization: Bearer <token>` header. If the token is invalid or expired, Tova returns `401 Unauthorized`. The `role("admin")` decorator checks the `role` claim in the JWT payload and returns `403 Forbidden` if it doesn't match.

### API Key Authentication

For simpler use cases, use API key authentication:

```tova
server {
  auth {
    type: "api_key"
    header: "X-API-Key"
    keys: ["key_abc123", "key_def456"]
  }

  fn protected_data() {
    { data: "requires API key" }
  }

  route GET "/api/data" with auth => protected_data
}
```

::: warning Secret Management
Never hardcode secrets in production code. Use environment variables with the `env` declaration:
```tova
server {
  env JWT_SECRET: String
  auth { type: "jwt", secret: JWT_SECRET }
}
```
:::

## Environment Variables

Declare and validate environment variables at startup:

```tova
server {
  env DATABASE_URL: String
  env PORT: Int = 3000
  env DEBUG: Bool = false
  env MAX_RETRIES: Int = 3

  fn status() {
    { port: PORT, debug: DEBUG }
  }
}
```

Required variables (no default) cause the server to exit immediately with a clear error if they're missing. Variables with defaults are optional. Types are coerced automatically -- `"3000"` becomes `3000` for `Int`, `"true"` becomes `true` for `Bool`.

## WebSocket Endpoints

Add real-time communication with the `ws` block:

```tova
server {
  ws {
    on_open fn(ws) {
      print("Client connected")
      ws.send("Welcome!")
    }

    on_message fn(ws, msg) {
      print("Received: {msg}")
      // Echo back
      ws.send("Echo: {msg}")
    }

    on_close fn(ws, code, reason) {
      print("Client disconnected: {code} {reason}")
    }

    on_error fn(ws, error) {
      print("WebSocket error: {error}")
    }
  }

  fn hello() { "world" }
}
```

WebSocket connections are upgraded automatically when a client sends a WebSocket handshake. The `ws` object provides `send(message)` for sending data back to the client.

### Building a Chat Room

```tova
server {
  var clients = []

  ws {
    on_open fn(ws) {
      clients = [...clients, ws]
      // Broadcast to all
      for client in clients {
        client.send("A new user joined!")
      }
    }

    on_message fn(ws, msg) {
      // Broadcast message to all connected clients
      for client in clients {
        client.send(msg)
      }
    }

    on_close fn(ws, code, reason) {
      clients = clients |> filter(fn(c) c != ws)
    }
  }

  fn status() {
    { connected: len(clients) }
  }

  route GET "/api/status" => status
}
```

## Server-Sent Events

For one-way real-time streaming (server to client), use the `stream()` helper:

```tova
server {
  fn event_feed(req) {
    stream(fn(send, close) {
      send("event: connected")
      send("data: hello")
      // In practice, you'd send events over time
      close()
    })
  }

  route GET "/api/events" => event_feed
}
```

The `stream()` function creates a `ReadableStream` with `text/event-stream` content type, perfect for SSE. The `send` callback enqueues data, and `close` ends the stream.

For generator-based SSE, use `yield` in your handler:

```tova
server {
  fn stream_updates(req) {
    yield "Starting stream..."
    yield "Processing batch 1"
    yield "Processing batch 2"
    yield "Complete!"
  }

  route GET "/api/stream" => stream_updates
}
```

Tova detects `yield` in the handler and automatically wraps it in an SSE-compatible `ReadableStream`.

## Health Checks

Add a health check endpoint with a single line:

```tova
server {
  health "/health"

  fn hello() { "world" }
}
```

This generates a `GET /health` endpoint that returns:

```json
{ "status": "ok", "uptime": 12345 }
```

### Health Checks with Database

If you have a database, you can add a database health check:

```tova
server {
  db {
    path: "./app.sqlite"
  }

  health "/health" { check_db }

  fn get_data() {
    db.query("SELECT * FROM items")
  }
}
```

The `check_db` option runs a `SELECT 1` query to verify the database connection is alive.

## Error Handlers

Define a global error handler for unhandled exceptions:

```tova
server {
  on_error fn(err, req) {
    print("Error on {req.method} {req.url}: {err}")
    respond(500, {
      error: "Internal server error",
      message: "Something went wrong"
    })
  }

  fn risky_operation() {
    // If this throws, on_error catches it
    db.query("SELECT * FROM nonexistent_table")
  }

  route GET "/api/risky" => risky_operation
}
```

Without a custom error handler, Tova still catches errors and returns a generic 500 response. But defining `on_error` lets you log, report to error tracking services, or return custom error formats.

## Static Files

Serve static files from a directory:

```tova
server {
  static "/assets" => "./public"

  fn hello() { "world" }
}
```

Any request starting with `/assets/` will look for a matching file in the `./public` directory. For example, `GET /assets/style.css` serves `./public/style.css`.

## CORS Configuration

Configure Cross-Origin Resource Sharing:

```tova
server {
  cors {
    origins: ["https://myapp.com", "https://admin.myapp.com"]
    methods: ["GET", "POST", "PUT", "DELETE"]
    headers: ["Content-Type", "Authorization"]
  }

  fn hello() { "world" }
}
```

Without a `cors` block, Tova defaults to `Access-Control-Allow-Origin: *` (open to all origins). In production, always restrict to your specific domains.

::: warning CORS in Production
Open CORS (`*`) is fine during development but dangerous in production. Always list your specific origins.
:::

## Rate Limiting

Protect your API from abuse:

```tova
server {
  rate_limit { max: 100, window: 60 }

  fn hello() { "world" }
}
```

This limits each client IP to 100 requests per 60-second window. Exceeding the limit returns `429 Too Many Requests` with a `Retry-After` header. Tova automatically cleans up expired rate limit entries.

### Per-Route Rate Limits

Apply stricter limits to specific routes:

```tova
server {
  fn login(email, password) {
    // authenticate...
    { token: "..." }
  }

  fn get_data() {
    { items: [] }
  }

  // Strict rate limit on login: 10 per 60 seconds
  route POST "/api/login" with rate_limit(10, 60) => login

  // Default rate limiting on other routes
  route GET "/api/data" => get_data
}
```

## Scheduled Jobs

Run tasks on a timer or cron schedule:

```tova
server {
  schedule "5m" fn cleanup() {
    print("Running cleanup every 5 minutes")
  }

  schedule "1h" fn hourly_report() {
    print("Generating hourly report")
  }

  schedule "*/5 * * * *" fn cron_task() {
    print("Cron: every 5 minutes")
  }

  fn hello() { "world" }
}
```

Simple intervals use shorthand: `"30s"` (seconds), `"5m"` (minutes), `"1h"` (hours). For complex schedules, use standard cron expressions.

Scheduled tasks are registered after the server starts and their intervals are cleaned up during graceful shutdown.

## Lifecycle Hooks

Run code when the server starts or stops:

```tova
server {
  on_start fn() {
    print("Server is ready!")
  }

  on_stop fn() {
    print("Server is shutting down, cleaning up...")
  }

  fn hello() { "world" }
}
```

`on_start` runs after `Bun.serve()` is called. `on_stop` runs during graceful shutdown (SIGINT/SIGTERM). You can have multiple hooks of each type.

## Named Servers and Multi-Server

For microservice architectures, use named server blocks:

```tova
server "api" {
  health "/health"

  fn get_users() { [] }
  fn create_user(name) { name }

  route GET "/api/users" => get_users
  route POST "/api/users" => create_user
}

server "events" {
  health "/health"

  fn push_event(kind, data) { kind }
  route POST "/events" => push_event
}
```

Each named server compiles to a separate file and runs on its own port. Tova automatically generates RPC proxies between them -- the `api` server gets a `events.push_event()` function, and the `events` server gets `api.get_users()` and `api.create_user()`. No manual HTTP client code needed.

### Service Discovery

For deployment, configure service discovery:

```tova
server "api" {
  discover "events" at "http://events.local:4000"

  fn get_users() { [] }
}

server "events" {
  fn push_event(kind) { kind }
}
```

## Pub/Sub Event Bus

For event-driven architectures within a server:

```tova
server {
  subscribe "user.created" fn(data) {
    print("New user: {data.name}")
    // Send welcome email, update analytics, etc.
  }

  subscribe "order.placed" fn(data) {
    print("New order: {data.id}")
  }

  fn create_user(name, email) {
    user = { name: name, email: email }
    publish("user.created", user)
    respond(201, user)
  }

  route POST "/api/users" => create_user
}
```

The `publish(event, data)` function dispatches to all handlers that `subscribe` to that event. In multi-server setups, events are forwarded between peers automatically.

## Route Decorators

Routes support multiple decorators for composable middleware:

```tova
server {
  auth { type: "jwt", secret: "secret" }

  fn get_data() { [] }
  fn slow_query() { db.query("SELECT ...") }

  // Auth required
  route GET "/api/data" with auth => get_data

  // Auth + admin role
  route DELETE "/api/data" with auth, role("admin") => get_data

  // Timeout after 5 seconds (returns 504)
  route GET "/api/slow" with timeout(5000) => slow_query

  // Auth + rate limit + timeout
  route POST "/api/heavy" with auth, rate_limit(10, 60), timeout(10000) => slow_query
}
```

## Auto-Generated API Docs

When your server uses shared types, Tova generates an OpenAPI 3.0 specification automatically:

```tova
shared {
  type User {
    id: Int
    name: String
    email: String
  }
}

server {
  fn get_users(req) { [] }
  fn create_user(name: String, email: String) { "ok" }

  route GET "/api/users" -> [User] => get_users
  route POST "/api/users" body: User => fn(req) { "ok" }
}
```

The `-> [User]` annotation on the GET route declares the response type. Tova uses these annotations to generate:
- `/openapi.json` -- the full OpenAPI spec
- `/docs` -- a documentation UI

## Putting It All Together

Here is a complete task manager API that uses most of the features from this chapter:

```tova
server {
  health "/health"

  cors {
    origins: ["http://localhost:5173"]
    methods: ["GET", "POST", "PUT", "DELETE"]
    headers: ["Content-Type", "Authorization"]
  }

  auth { type: "jwt", secret: "my_secret_key" }

  rate_limit { max: 100, window: 60 }

  middleware fn logger(req, next) {
    start = Date.now()
    result = next(req)
    elapsed = Date.now() - start
    print("[{req.method}] {req.url} - {elapsed}ms")
    result
  }

  on_error fn(err, req) {
    print("Server error: {err}")
    respond(500, { error: "Something went wrong" })
  }

  var tasks = []
  var next_id = 1

  fn list_tasks() {
    tasks
  }

  fn get_task(id) {
    found = tasks |> find(fn(t) t.id == toInt(id))
    match found {
      Some(task) => task
      None => respond(404, { error: "Task not found" })
    }
  }

  fn create_task(title: String, priority: String) {
    task = {
      id: next_id,
      title: title,
      priority: priority,
      done: false,
      created_at: Date.now()
    }
    next_id += 1
    tasks = [...tasks, task]
    respond(201, task)
  }

  fn update_task(id, title, priority, done) {
    tasks = tasks |> map(fn(t) {
      if t.id == toInt(id) {
        { ...t, title: title, priority: priority, done: done }
      } else {
        t
      }
    })
    respond(200, { ok: true })
  }

  fn delete_task(id) {
    tasks = tasks |> filter(fn(t) t.id != toInt(id))
    respond(200, { ok: true })
  }

  routes "/api/v1" {
    route GET "/tasks" => list_tasks
    route GET "/tasks/:id" => get_task
    route POST "/tasks" with auth => create_task
    route PUT "/tasks/:id" with auth => update_task
    route DELETE "/tasks/:id" with auth, role("admin") => delete_task
  }

  schedule "5m" fn cleanup_done() {
    tasks = tasks |> filter(fn(t) !t.done)
    print("Cleaned up completed tasks")
  }
}
```

<TryInPlayground :code="fullApiCode" label="Task Manager API" />

This single file gives you:
- A RESTful API with all CRUD operations
- JWT authentication on write operations
- Admin-only delete
- Rate limiting (100 requests/minute)
- CORS configured for your frontend
- Request logging middleware
- Global error handling
- Health check endpoint
- A scheduled job to clean up completed tasks
- Automatic input validation on typed parameters
- Graceful shutdown with request draining

## Exercises

**Exercise 14.1:** Build a simple bookmarks API. Create a server with routes to list, create, and delete bookmarks. Each bookmark should have a `url`, `title`, and `tags` (an array of strings). Add a `GET "/api/bookmarks/search"` route that takes a `tag` query parameter and returns matching bookmarks.

**Exercise 14.2:** Add middleware to your bookmarks API that measures response time and sets an `X-Response-Time` header on every response. Also add a `rate_limit` that allows 50 requests per 30-second window, and a health check at `/health`.

**Exercise 14.3:** Create a server with two route groups: `/api/v1` and `/api/v2`. In v1, the `GET "/users"` route returns `[{ name: "Alice" }]`. In v2, it returns `[{ name: "Alice", email: "alice@test.com" }]`. Mark v1 as deprecated with a sunset date. Add scoped middleware on v2 that logs "v2 request" for every request.

## Challenge

Build a **real-time notification system** with these features:

1. A REST API for creating notifications (`POST /api/notifications` with `title`, `message`, `priority`)
2. WebSocket support so connected clients receive notifications instantly when one is created (use `publish` to bridge the REST handler and WebSocket broadcaster)
3. An SSE endpoint (`GET /api/notifications/stream`) as an alternative to WebSocket for clients that don't support it
4. JWT authentication on all write endpoints
5. A scheduled job that runs every hour to delete notifications older than 24 hours
6. Rate limiting of 20 notification creates per minute per client
7. A route group under `/api/v1` for all endpoints
8. A health check with database connectivity check

---

[← Previous: Testing](./testing) | [Next: JSX and Reactivity →](./jsx-and-reactivity)
