# Advanced

This page covers advanced server features including background jobs, scheduled tasks, lifecycle hooks, service discovery, event-driven architecture, distributed tracing, and auto-generated API documentation.

## Background Jobs

Background jobs let you offload work that does not need to complete before responding to a request. Declare a background function and dispatch it with `spawn_job`:

```lux
server {
  background fn send_email(to, subject, body) {
    // Runs in the background, does not block the request
    mail.send(to, subject, body)
  }

  fn register_user(req) {
    let { name, email } = req.body
    user = UserModel.create({ name: name, email: email })
    spawn_job("send_email", email, "Welcome!", "Hello {name}, welcome aboard!")
    respond(201, user)
  }

  route POST "/api/register" => register_user
}
```

The `spawn_job` call returns immediately. The background function runs asynchronously without blocking the HTTP response.

### spawn_job

```lux
spawn_job("function_name", arg1, arg2, ...)
```

| Parameter | Description |
|-----------|-------------|
| First argument | The name of the background function (as a string) |
| Remaining arguments | Arguments passed to the background function |

## Scheduled Tasks

Run functions on a recurring schedule using cron expressions:

```lux
server {
  schedule "*/5 * * * *" fn cleanup() {
    db.run("DELETE FROM sessions WHERE expires_at < ?", Date.now())
  }

  schedule "0 0 * * *" fn daily_report() {
    // Runs at midnight every day
    report = generate_report()
    spawn_job("send_email", "admin@example.com", "Daily Report", report)
  }

  schedule "0 */6 * * *" fn sync_data() {
    // Runs every 6 hours
    fetch_external_data()
  }
}
```

### Cron Expression Format

```
* * * * *
| | | | |
| | | | +-- day of week (0-7, where 0 and 7 are Sunday)
| | | +---- month (1-12)
| | +------ day of month (1-31)
| +-------- hour (0-23)
+---------- minute (0-59)
```

| Expression | Meaning |
|------------|---------|
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour |
| `0 0 * * *` | Daily at midnight |
| `0 0 * * 1` | Every Monday at midnight |
| `0 9,17 * * 1-5` | 9 AM and 5 PM on weekdays |

## Lifecycle Hooks

Run code when the server starts or stops:

```lux
server {
  on_start fn() {
    print("Server started")
    db.migrate()
    cache.warm()
  }

  on_stop fn() {
    print("Server shutting down")
    db.close()
    cache.flush()
  }
}
```

### on_start

Runs after the server binds to a port and is ready to accept requests. Use it for initialization tasks like running migrations, warming caches, or logging startup information.

### on_stop

Runs when the server receives a shutdown signal (e.g., SIGTERM, SIGINT). Use it for cleanup tasks like closing database connections, flushing buffers, or deregistering from service discovery.

## Error Handling

Define a global error handler that catches unhandled errors in route handlers:

```lux
server {
  on_error fn(err, req) {
    print("Error on {req.method} {req.url}: {err}")
    respond(500, {
      error: "Internal server error",
      message: err.message
    })
  }
}
```

The error handler receives the error object and the original request. Without a custom error handler, unhandled errors return a generic 500 response.

## Service Discovery

In multi-server architectures (using named server blocks), `discover` lets one server call functions on another. Lux includes a built-in circuit breaker to protect against cascading failures:

```lux
server "api" {
  discover "events" at "http://localhost:3002"
  discover "auth" at "http://localhost:3003" with {
    threshold: 5              // open circuit after 5 consecutive failures
    timeout: 3000             // request timeout in milliseconds
    reset_timeout: 30000      // try again after 30 seconds
  }
}
```

### Circuit Breaker Options

| Option | Type | Description |
|--------|------|-------------|
| `threshold` | `Int` | Number of consecutive failures before the circuit opens |
| `timeout` | `Int` | Request timeout in milliseconds |
| `reset_timeout` | `Int` | Time in milliseconds before the circuit transitions from open to half-open |

Once a service is discovered, you can call its functions as if they were local:

```lux
// Calls the "events" service's create_event function via RPC
events.create_event({ type: "user_signup", user_id: user.id })
```

When the circuit is open, calls fail immediately without attempting the network request, preventing a failing downstream service from slowing down your server.

## Event Bus (Pub/Sub)

Named server blocks can communicate via an event bus. Use `subscribe` to listen for events and `publish` to emit them:

```lux
server "api" {
  subscribe "user.created" fn(data) {
    print("New user created: {data.name}")
    spawn_job("send_welcome_email", data.email)
  }

  subscribe "order.completed" fn(data) {
    print("Order {data.id} completed")
  }

  fn create_user(req) {
    user = UserModel.create(req.body)
    publish("user.created", user)    // notifies all subscribers + peer servers
    respond(201, user)
  }

  route POST "/api/users" with auth => create_user
}
```

Events are delivered to all subscribers in the current server and to peer servers in a multi-server setup. This enables loose coupling between services.

### Event Bus Functions

| Function | Description |
|----------|-------------|
| `subscribe(event, handler)` | Register a handler for a named event |
| `publish(event, data)` | Emit an event with associated data |

## Distributed Tracing

Lux automatically generates and propagates request IDs across server boundaries. This makes it possible to trace a request through multiple services.

### Request ID Functions

```lux
request_id = __getRequestId()     // get the current request's trace ID
locals = __getLocals()            // get request-scoped storage (AsyncLocalStorage)
```

### Automatic Propagation

When one server calls another via RPC or service discovery, the `X-Request-Id` header is automatically propagated. This creates a trace that spans multiple services:

```
Client -> Server A (X-Request-Id: abc-123)
           |
           +-> Server B (X-Request-Id: abc-123)
           |
           +-> Server C (X-Request-Id: abc-123)
```

Use the request ID in logging to correlate log entries across services:

```lux
middleware fn trace_logger(req, next) {
  rid = __getRequestId()
  print("[{rid}] {req.method} {req.url}")
  result = next(req)
  print("[{rid}] completed")
  result
}
```

## OpenAPI Auto-Generation

Lux automatically generates OpenAPI 3.0 documentation from your routes and types. Two endpoints are available by default:

| Endpoint | Description |
|----------|-------------|
| `GET /openapi.json` | OpenAPI 3.0 specification in JSON format |
| `GET /docs` | Interactive Swagger UI for exploring and testing your API |

Route parameters, request bodies, and response types are derived from function signatures and shared type declarations. No manual documentation is needed.

### Example

Given this server:

```lux
shared {
  type User {
    id: Int
    name: String
    email: String
  }
}

server {
  model User

  fn get_users() -> [User] {
    UserModel.all()
  }

  fn create_user(req) -> User {
    UserModel.create(req.body)
  }

  route GET "/api/users" => get_users
  route POST "/api/users" with auth => create_user
}
```

The generated OpenAPI spec includes the `/api/users` endpoints with the `User` schema, parameter types, and authentication requirements.

## Cache Control Helpers

Fine-tune HTTP caching on individual responses:

```lux
cache_control(response, 3600, { private: true })     // Cache-Control: private, max-age=3600
etag(response, "hash123")                             // ETag: "hash123"
```

### cache_control

```lux
cache_control(response, max_age)
cache_control(response, max_age, options)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `response` | Response | The response to set headers on |
| `max_age` | `Int` | Cache lifetime in seconds |
| `options` | Object? | Additional directives like `private`, `no_cache`, `no_store` |

### etag

```lux
etag(response, hash)
```

Sets the `ETag` header on a response. Clients can use this for conditional requests with `If-None-Match`, enabling `304 Not Modified` responses.

## Complete Advanced Example

Here is a server combining several advanced features:

```lux
server "api" {
  env PORT: Int = 3000
  db { path: "./data.db" }
  auth { type: "jwt", secret: "secret" }

  // Service discovery
  discover "notifications" at "http://localhost:3002"

  // Lifecycle
  on_start fn() {
    db.migrate()
    print("API server started on port {PORT}")
  }

  on_stop fn() {
    db.close()
    print("API server stopped")
  }

  // Error handling
  on_error fn(err, req) {
    rid = __getRequestId()
    print("[{rid}] Error: {err.message}")
    respond(500, { error: "Internal server error", request_id: rid })
  }

  // Background jobs
  background fn send_welcome(email, name) {
    mail.send(email, "Welcome!", "Hello {name}!")
  }

  // Scheduled tasks
  schedule "0 * * * *" fn hourly_cleanup() {
    db.run("DELETE FROM sessions WHERE expires_at < ?", Date.now())
  }

  // Event bus
  subscribe "user.created" fn(user) {
    notifications.notify({ type: "new_user", data: user })
  }

  // Routes
  model User

  fn create_user(req) {
    user = UserModel.create(req.body)
    spawn_job("send_welcome", user.email, user.name)
    publish("user.created", user)
    respond(201, user)
  }

  route POST "/api/users" with auth => create_user
}
```

## Practical Tips

**Use background jobs for slow operations.** Email sending, image processing, and external API calls should not block the HTTP response. Use `background fn` and `spawn_job` to offload them.

**Set up lifecycle hooks for clean startup and shutdown.** Run migrations and warm caches in `on_start`. Close connections and flush state in `on_stop`. This ensures your server starts in a known-good state and shuts down gracefully.

**Configure circuit breakers for service calls.** When using `discover`, always set a reasonable `timeout` and `threshold`. Without circuit breakers, a single slow or failing service can bring down your entire system.

**Use the event bus for loose coupling.** Instead of having services call each other directly for every interaction, publish events and let interested services subscribe. This reduces coupling and makes your architecture more resilient.

**Check `/docs` during development.** The auto-generated Swagger UI is a quick way to explore and test your API without writing a separate client.
