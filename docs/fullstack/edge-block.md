# Edge Block

The `edge {}` block is a top-level language construct in Tova that compiles to deployment-ready edge functions and serverless handlers. You write routes, middleware, scheduled tasks, and queue consumers using the same Tova syntax you already know, and the compiler generates optimized output for your chosen platform -- Cloudflare Workers, Deno Deploy, Vercel Edge Functions, AWS Lambda, or Bun.

## Why a Dedicated Edge Block?

Edge/serverless computing has different constraints from traditional servers:

- **No long-running process** -- functions spin up per-request and must be fast
- **Platform-specific APIs** -- each provider has its own handler signature, binding system, and deployment format
- **Limited runtime** -- no filesystem, no persistent connections, cold starts matter
- **Global distribution** -- code runs close to users, but needs careful state management

Without first-class support, deploying to edge means:

- Writing platform-specific boilerplate (Cloudflare's `export default { fetch }` vs Vercel's `export default function` vs Lambda's `export const handler`)
- Managing bindings differently per platform (Cloudflare env params vs Deno APIs vs process.env)
- Losing type safety and compile-time checks
- Duplicating middleware and error handling logic per target

The `edge {}` block solves this:

- **One syntax, five targets** -- write once, compile to any platform
- **Automatic binding wiring** -- KV, SQL, storage, queues, env vars, and secrets are initialized per-platform
- **Compile-time validation** -- the analyzer warns on unsupported bindings, invalid cron expressions, and missing handlers
- **Security integration** -- combine with `security {}` for JWT auth, route protection, and field sanitization on edge runtimes
- **Wrangler.toml generation** -- for Cloudflare deployments, the compiler generates your config file

## Syntax Overview

```tova
edge {
  target: "cloudflare"

  kv CACHE
  env API_URL = "https://api.example.com"
  secret API_KEY

  cors {
    origins: ["https://myapp.com"]
    methods: [GET, POST]
  }

  middleware fn logger(req, next) {
    start = Date.now()
    res = next(req)
    print("Request took {Date.now() - start}ms")
    res
  }

  route GET "/api/users" => fn(req) {
    { users: ["Alice", "Bob"] }
  }

  route GET "/api/users/:id" => fn(req, params) {
    { id: params.id }
  }

  schedule "cleanup" cron("0 0 * * *") {
    print("Running daily cleanup")
  }

  health "/healthz"
}
```

This compiles to a complete Cloudflare Worker with:
- KV namespace binding initialized from the `env` parameter
- Environment variables read from `env`
- CORS preflight handling and header injection
- Middleware chain wrapping all route handlers
- Pattern-matched route dispatch
- Cron-triggered scheduled handler
- Health check endpoint returning `{ status: "ok" }`

## Deployment Targets

Set the target with the `target:` config field. Each target produces platform-specific output:

| Target | Output | Handler Signature | Bindings |
|--------|--------|-------------------|----------|
| `cloudflare` | ES module with `export default { fetch, scheduled, queue }` | `fetch(request, env, ctx)` | KV, D1, R2, Queues via `env` param |
| `deno` | `Deno.serve()` + `Deno.cron()` | `(request) => Response` | KV via `Deno.openKv()`, env via `Deno.env` |
| `vercel` | `export default function handler` with `runtime: "edge"` config | `handler(request)` | env via `process.env` |
| `lambda` | `export const handler` for API Gateway | `handler(event, context)` | env via `process.env` |
| `bun` | `Bun.serve()` | `fetch(request)` | SQL via `bun:sqlite`, env via `process.env` |

```tova
edge {
  target: "deno"   // or "cloudflare", "vercel", "lambda", "bun"

  route GET "/" => fn(req) { { hello: "world" } }
}
```

If `target:` is omitted, it defaults to `cloudflare`.

## Routes

Routes map HTTP methods and URL patterns to handler functions:

```tova
edge {
  // Static path
  route GET "/api/status" => fn(req) { { status: "ok" } }

  // Path parameters
  route GET "/api/users/:id" => fn(req, params) {
    { userId: params.id }
  }

  // Wildcard
  route GET "/files/*path" => fn(req, params) {
    { file: params.path }
  }

  // Multiple methods
  route POST "/api/items" => fn(req) {
    body = req.json()
    { created: body }
  }

  // Named function reference
  fn get_items(req) { [] }
  route GET "/api/items" => get_items
}
```

Route handlers receive `(request, params)` where `params` is an object of captured path parameters. Return a plain object to send JSON, or return a `Response` for full control:

```tova
route GET "/api/data" => fn(req) {
  // Return plain object -> auto-serialized as JSON with 200 status
  { data: [1, 2, 3] }
}

route GET "/api/custom" => fn(req) {
  // Return Response for full control over status, headers, body
  Response.new(JSON.stringify({ ok: true }), {
    status: 201,
    headers: { "X-Custom": "value" }
  })
}
```

## Middleware

Middleware functions wrap the request pipeline. They receive the request and a `next` function, and can modify the request, response, or both:

```tova
edge {
  middleware fn auth(req, next) {
    token = req.headers.get("Authorization")
    if token == nil {
      Response.new("Unauthorized", { status: 401 })
    } else {
      next(req)
    }
  }

  middleware fn logger(req, next) {
    start = Date.now()
    res = next(req)
    print("[{req.method}] {req.url} - {Date.now() - start}ms")
    res
  }

  route GET "/api/data" => fn(req) { { data: "protected" } }
}
```

Middleware is applied in declaration order. In this example, every request passes through `auth` first, then `logger`, then the route handler. The middleware chain is wrapped in try/catch with proper error handling on all five targets.

## Bindings

Bindings declare external resources your edge function needs. The compiler generates platform-specific initialization code for each:

### KV (Key-Value Store)

```tova
edge {
  kv CACHE
  kv SESSIONS

  route GET "/api/cached" => fn(req, params, env) {
    value = await CACHE.get("key")
    { cached: value }
  }
}
```

| Target | Implementation |
|--------|---------------|
| Cloudflare | Bound from `env.CACHE` (requires wrangler.toml `[[kv_namespaces]]`) |
| Deno | `Deno.openKv()` (all KV bindings share one store) |
| Others | Stubbed as `null` with `W_UNSUPPORTED_KV` warning |

### SQL (Database)

```tova
edge {
  sql DB

  route GET "/api/users" => fn(req) {
    users = DB.prepare("SELECT * FROM users").all()
    { users }
  }
}
```

| Target | Implementation |
|--------|---------------|
| Cloudflare | D1 database bound from `env.DB` |
| Bun | `bun:sqlite` with `Database("DB.sqlite")` |
| Others | Stubbed as `null` with `W_UNSUPPORTED_SQL` warning |

### Storage (Object/Blob Store)

```tova
edge {
  storage ASSETS

  route GET "/files/:key" => fn(req, params) {
    obj = await ASSETS.get(params.key)
    obj
  }
}
```

| Target | Implementation |
|--------|---------------|
| Cloudflare | R2 bucket bound from `env.ASSETS` |
| Others | Stubbed as `null` with `W_UNSUPPORTED_STORAGE` warning |

### Queue

```tova
edge {
  queue TASKS

  route POST "/api/enqueue" => fn(req) {
    body = req.json()
    await TASKS.send(body)
    { queued: true }
  }

  consume TASKS fn(messages) {
    for msg in messages {
      print("Processing: {msg.body}")
    }
  }
}
```

| Target | Implementation |
|--------|---------------|
| Cloudflare | Queue producer/consumer bound from `env.TASKS` |
| Others | Stubbed as `null` with `W_UNSUPPORTED_QUEUE` warning |

### Environment Variables and Secrets

```tova
edge {
  env API_URL = "https://api.example.com"
  env DEBUG_MODE = "false"
  secret API_KEY
  secret DATABASE_URL

  route GET "/api/config" => fn(req) {
    { apiUrl: API_URL, debug: DEBUG_MODE }
  }
}
```

Environment variables support default values. Secrets never have defaults.

| Target | Implementation |
|--------|---------------|
| Cloudflare | Read from `env` parameter in handlers |
| Deno | `Deno.env.get("NAME")` |
| Vercel / Lambda / Bun | `process.env.NAME` |

## Scheduled Tasks (Cron)

Schedule recurring tasks with cron expressions:

```tova
edge {
  target: "cloudflare"

  schedule "cleanup" cron("0 0 * * *") {
    print("Running daily cleanup at midnight")
  }

  schedule "report" cron("0 9 * * 1") {
    print("Weekly report every Monday at 9am")
  }
}
```

| Target | Implementation |
|--------|---------------|
| Cloudflare | `scheduled(event, env, ctx)` handler with `event.cron` matching |
| Deno | `Deno.cron(name, expression, callback)` |
| Others | `W_UNSUPPORTED_SCHEDULE` warning (vercel, lambda, bun don't support cron natively) |

The Cloudflare target generates `else if` chains for multiple schedules, so only the matching cron body executes.

## Queue Consumers

Process messages from a queue binding:

```tova
edge {
  target: "cloudflare"

  queue TASKS

  consume TASKS fn(messages) {
    for msg in messages {
      print("Got: {msg.body}")
    }
  }
}
```

Queue consumers are only supported on Cloudflare Workers. The analyzer warns with `W_UNSUPPORTED_CONSUME` on other targets and `W_CONSUME_UNKNOWN_QUEUE` if the consume references a queue that wasn't declared.

## CORS

Add CORS headers to all responses:

```tova
edge {
  // Open CORS (wildcard *)
  cors {}

  route GET "/api/data" => fn(req) { "ok" }
}
```

```tova
edge {
  // Restricted CORS
  cors {
    origins: ["https://myapp.com", "https://staging.myapp.com"]
    methods: [GET, POST, PUT, DELETE]
    headers: ["Content-Type", "Authorization"]
    credentials: true
    max_age: 86400
  }

  route GET "/api/data" => fn(req) { "ok" }
}
```

When CORS is configured, the compiler automatically:
- Handles `OPTIONS` preflight requests with a 204 response
- Adds CORS headers to all responses (including error responses)
- Checks the `Origin` header against the allowed origins list

## Health Checks

Add a health check endpoint:

```tova
edge {
  health "/healthz"
}
```

Returns `{ status: "ok" }` on `GET /healthz`.

With memory checks (where supported):

```tova
edge {
  health "/healthz" {
    check_memory
  }
}
```

Returns `{ status: "healthy", checks: { memory: { status: "healthy", heapUsed: ..., heapTotal: ... } } }`.

## Error Handling

Define a custom error handler:

```tova
edge {
  on_error fn(err, req) {
    { error: err.message, path: req.url }
  }

  route GET "/api/risky" => fn(req) {
    // If this throws, on_error handles it
    do_something_dangerous()
  }
}
```

The error handler receives the error and the original request. All targets wrap route dispatch (both middleware and non-middleware paths) in try/catch, invoking the error handler if defined and falling back to a generic 500 JSON response.

## Security Integration

Combine `security {}` with `edge {}` to get JWT authentication, route protection, and sensitive field sanitization on edge runtimes:

```tova
security {
  auth jwt { secret: env("JWT_SECRET") }

  role Admin { can: [manage_users] }
  role User { can: [view_profile] }

  protect "/api/admin/*" { require: Admin }
  protect "/api/*" { require: authenticated }

  sensitive User.ssn { never_expose: true }
}

edge {
  route GET "/api/users" => fn(req) {
    [{ name: "Alice", ssn: "123-45-6789" }]
  }

  route GET "/api/admin/stats" => fn(req) {
    { totalUsers: 1000 }
  }
}
```

The compiler generates:
- **JWT verification** using the Web Crypto API (`crypto.subtle`) -- works on all edge runtimes without Node.js dependencies
- **Route protection** checks before dispatch -- returns 401 (unauthenticated) or 403 (insufficient role)
- **Auto-sanitization** of response data -- strips sensitive fields based on the user's role
- **Algorithm pinning** -- only HS256 tokens are accepted, preventing algorithm confusion attacks
- **Expiry checking** -- expired tokens are rejected

## Named Edge Blocks

Use named blocks to generate separate edge functions from one file:

```tova
edge "api" {
  target: "cloudflare"
  route GET "/api/data" => fn(req) { "api" }
}

edge "assets" {
  target: "cloudflare"
  route GET "/static/*path" => fn(req, params) { params }
}
```

This produces two output files:
- `app.edge.api.js` -- the API worker
- `app.edge.assets.js` -- the assets worker

Named edge blocks can coexist with `server {}` and `browser {}` blocks in the same file.

## Building and Deploying

### Build

```bash
tova build myapp.tova
```

Produces `.tova-out/myapp.edge.js` (or `.tova-out/myapp.edge.{name}.js` for named blocks).

### Cloudflare Workers

The compiler can generate a `wrangler.toml` from your edge config:

```toml
name = "myapp"
main = ".tova-out/myapp.edge.js"
compatibility_date = "2026-02-26"

[[kv_namespaces]]
binding = "CACHE"
id = "TODO_CACHE_ID"

[[queues.producers]]
binding = "TASKS"
queue = "tasks"

[[queues.consumers]]
queue = "tasks"
max_batch_size = 10
max_batch_timeout = 30

[triggers]
crons = ["0 0 * * *"]

[vars]
API_URL = "https://api.example.com"
```

Deploy with:

```bash
npx wrangler deploy
```

### Deno Deploy

```bash
deployctl deploy --project=myapp .tova-out/myapp.edge.js
```

### Vercel Edge Functions

Place the output in `api/` and deploy:

```bash
cp .tova-out/myapp.edge.js api/index.js
vercel deploy
```

### AWS Lambda

Package the output and deploy with SAM or CDK:

```bash
cp .tova-out/myapp.edge.js index.mjs
sam deploy
```

### Bun

Run directly:

```bash
bun .tova-out/myapp.edge.js
```

## Compile-Time Warnings

The analyzer validates edge blocks and produces warnings for common issues:

| Code | Warning |
|------|---------|
| `W_UNKNOWN_EDGE_CONFIG` | Unknown config key (valid: `target`) |
| `W_UNKNOWN_EDGE_TARGET` | Unknown target (valid: cloudflare, deno, vercel, lambda, bun) |
| `W_DUPLICATE_EDGE_BINDING` | Two bindings with the same name |
| `W_UNSUPPORTED_KV` | KV not supported on target (stubbed as null) |
| `W_UNSUPPORTED_SQL` | SQL not supported on target (stubbed as null) |
| `W_UNSUPPORTED_STORAGE` | Storage not supported on target (stubbed as null) |
| `W_UNSUPPORTED_QUEUE` | Queues not supported on target (stubbed as null) |
| `W_DENO_MULTI_KV` | Multiple KV bindings on Deno (shares one store) |
| `W_UNSUPPORTED_SCHEDULE` | Scheduled tasks not supported on target |
| `W_UNSUPPORTED_CONSUME` | Queue consumers not supported on target |
| `W_CONSUME_UNKNOWN_QUEUE` | Consume references a queue not declared in the edge block |
| `W_INVALID_CRON` | Cron expression doesn't have 5 or 6 fields |
| `W_EDGE_NO_HANDLERS` | Edge block has no routes, schedules, or consumers |
| `W_EDGE_WITH_CLI` | Edge and CLI blocks in same file (CLI takes priority) |

## Platform Support Matrix

| Feature | Cloudflare | Deno | Vercel | Lambda | Bun |
|---------|-----------|------|--------|--------|-----|
| Routes | Yes | Yes | Yes | Yes | Yes |
| Middleware | Yes | Yes | Yes | Yes | Yes |
| CORS | Yes | Yes | Yes | Yes | Yes |
| Health Check | Yes | Yes | Yes | Yes | Yes |
| Error Handler | Yes | Yes | Yes | Yes | Yes |
| KV | Yes | Yes | -- | -- | -- |
| SQL | Yes | -- | -- | -- | Yes |
| Storage | Yes | -- | -- | -- | -- |
| Queues | Yes | -- | -- | -- | -- |
| Scheduled | Yes | Yes | -- | -- | -- |
| Consumers | Yes | -- | -- | -- | -- |
| Env / Secrets | Yes | Yes | Yes | Yes | Yes |
| Security | Yes | Yes | Yes | Yes | Yes |

## Complete Example

A full-featured edge function with auth, caching, scheduled cleanup, and error handling:

```tova
security {
  auth jwt { secret: env("JWT_SECRET") }
  protect "/api/*" { require: authenticated }
}

edge {
  target: "cloudflare"

  kv CACHE
  sql DB
  env CACHE_TTL = "3600"
  secret API_KEY

  cors {
    origins: ["https://myapp.com"]
    credentials: true
  }

  on_error fn(err, req) {
    { error: err.message, timestamp: Date.now() }
  }

  middleware fn timing(req, next) {
    start = Date.now()
    res = next(req)
    print("[{Date.now() - start}ms] {req.method} {req.url}")
    res
  }

  route GET "/api/users" => fn(req) {
    cached = await CACHE.get("users")
    if cached != nil {
      JSON.parse(cached)
    } else {
      users = DB.prepare("SELECT * FROM users").all()
      await CACHE.put("users", JSON.stringify(users), { expirationTtl: int(CACHE_TTL) })
      { users }
    }
  }

  route GET "/api/users/:id" => fn(req, params) {
    user = DB.prepare("SELECT * FROM users WHERE id = ?").bind(params.id).first()
    if user == nil {
      Response.new(JSON.stringify({ error: "Not found" }), { status: 404 })
    } else {
      { user }
    }
  }

  route POST "/api/users" => fn(req) {
    body = await req.json()
    DB.prepare("INSERT INTO users (name, email) VALUES (?, ?)").bind(body.name, body.email).run()
    await CACHE.delete("users")
    { created: true }
  }

  schedule "cache-cleanup" cron("0 */6 * * *") {
    await CACHE.delete("users")
    print("Cache cleared")
  }

  health "/healthz"
}
```

This single file compiles to a production-ready Cloudflare Worker with JWT authentication, D1 database queries, KV caching, CORS, middleware, scheduled cache invalidation, and health monitoring.
