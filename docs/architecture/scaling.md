# Scaling Tova Applications

A reference guide for growing Tova applications from prototype to production. Covers server scaling, database migration, caching strategies, background processing, security hardening, and deployment.

## Single Server to Multi-Server

### When to Split

Start with a single `server {}` block. Split into named servers when:

- Different endpoints need different scaling characteristics (API vs WebSocket)
- You need independent deployment of services
- Background processing is competing with request handling

### Migration Pattern

**Before:** Single server handling everything.

```tova
server {
  // Routes, WebSocket, scheduled tasks, all in one
  route GET "/api/users" => get_users
  websocket "/ws" { ... }
  schedule "cleanup" cron("0 * * * *") { ... }
}
```

**After:** Named servers with clear responsibilities.

```tova
server "api" {
  port 3000
  route GET "/api/users" => get_users
  route POST "/api/users" => create_user
}

server "realtime" {
  port 3001
  websocket "/ws" { ... }
  sse "/events" fn(send, close) { ... }
}

server "worker" {
  port 3002
  schedule "cleanup" cron("0 * * * *") { ... }
  subscribe "user_created" fn(user) { ... }
}
```

### Service Discovery

Named servers can discover each other:

```tova
server "api" {
  discover "worker" {
    url: "http://localhost:3002",
    health: "/health",
    circuit_breaker: {
      failure_threshold: 3,
      reset_timeout: 30.seconds
    }
  }
}
```

### Circuit Breaker Tuning

| Parameter | Low Tolerance | Balanced | High Tolerance |
|-----------|--------------|----------|----------------|
| `failure_threshold` | 2 | 5 | 10 |
| `reset_timeout` | 10s | 30s | 60s |
| `half_open_requests` | 1 | 2 | 5 |

- **Low tolerance:** Critical dependencies that must be fast. Fail fast when they're down.
- **High tolerance:** Non-critical services. Tolerate intermittent failures before opening the circuit.

## Database Scaling

### SQLite to PostgreSQL

**Development (SQLite):**

```tova
db {
  adapter: "sqlite"
  database: "app.db"
}
```

**Production (PostgreSQL):**

```tova
db {
  adapter: "postgres"
  url: env("DATABASE_URL")
  pool: 20
}
```

Model definitions and queries stay the same. The adapter handles SQL dialect differences.

### Connection Pooling

```tova
db {
  adapter: "postgres"
  url: env("DATABASE_URL")
  pool: 20                  // Max connections
}
```

Pool size guidelines:
- **Small app (< 100 req/s):** 5–10 connections
- **Medium app (100–1000 req/s):** 10–20 connections
- **Large app (1000+ req/s):** 20–50 connections

Rule of thumb: `pool = (2 × CPU cores) + number_of_disks`. For cloud databases, check your provider's connection limits.

## Data Layer Scaling

### Streaming Large Files

For files too large to fit in memory:

```tova
stream("huge_file.csv", batch: 10000)
  |> each(fn(batch) {
    cleaned = batch |> drop_nil(.id) |> where(.active == true)
    write(cleaned, "output.csv", append: true)
  })
```

Batch size guidelines:
- **Small rows (< 100 bytes):** 50,000–100,000 per batch
- **Medium rows (100–1000 bytes):** 10,000–50,000 per batch
- **Large rows (> 1000 bytes):** 1,000–10,000 per batch

### Refresh Policies

```tova
data {
  source data = read("data.csv")
  refresh data every 10.minutes    // Periodic refresh
}
```

Choose refresh intervals based on data staleness tolerance:
- **Real-time dashboards:** 1–5 minutes
- **Analytics:** 10–60 minutes
- **Reference data:** 1–24 hours

### Caching

Data block pipelines are automatically cached — they only recompute when the source refreshes or when dynamic parameters change. For server-level caching:

```tova
cache {
  default: "public, max-age=300, stale-while-revalidate=60"
}
```

Per-route caching with helpers:

```tova
fn get_products(req, res) {
  cache_control(res, "public, max-age=60")
  etag(res, products_hash)
  Product.all()
}
```

## Background Processing

### Jobs vs Scheduled Tasks vs Event Bus

| Mechanism | Trigger | Use When |
|-----------|---------|----------|
| `background fn` + `spawn_job` | On-demand | One-off async work (send email, process upload) |
| `schedule` + `cron()` | Time-based | Periodic tasks (cleanup, polling, reports) |
| `subscribe` + `publish` | Event-based | Decoupled reactions (user created → send welcome email) |

### Combining Patterns

```tova
// Scheduled task publishes events
schedule "check_payments" cron("*/5 * * * *") {
  pending = Payment.where({ status: "pending" })
  pending |> each(fn(p) publish("payment_check", p))
}

// Event handler spawns background jobs
subscribe "payment_check" fn(payment) {
  spawn_job(process_payment, payment)
}

// Background job does the work
background fn process_payment(payment) {
  result = charge_card(payment)
  match result {
    Ok(_) => Payment.update(payment.id, { status: "completed" })
    Err(e) => {
      Payment.update(payment.id, { status: "failed", error: e })
      publish("payment_failed", payment)
    }
  }
}
```

## Caching Strategy

### Layers

1. **Data block caching** — Automatic. Pipelines cache their results.
2. **Server-level caching** — `cache {}` block sets default HTTP headers.
3. **Route-level caching** — `cache_control()` and `etag()` helpers.
4. **Client-side caching** — Browser respects cache headers.

### Cache Header Patterns

```tova
// Static assets: long cache, immutable
static { cache: "public, max-age=31536000, immutable" }

// API data: short cache with revalidation
cache { default: "public, max-age=60, stale-while-revalidate=30" }

// User-specific data: no shared cache
fn get_profile(req, res) {
  cache_control(res, "private, max-age=300")
  // ...
}

// Never cache
fn get_notifications(req, res) {
  cache_control(res, "no-store")
  // ...
}
```

## Security Hardening

### CORS

```tova
cors {
  origins: env("ALLOWED_ORIGINS") |> split(","),  // Never use "*" in production
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
  max_age: 86400
}
```

### Rate Limiting

```tova
rate_limit {
  requests: 100,
  window: 1.minute,
  key: fn(req) req.ip
}
```

For API keys, rate limit per key:

```tova
rate_limit {
  requests: 1000,
  window: 1.hour,
  key: fn(req) req.headers["x-api-key"] |> unwrapOr(req.ip)
}
```

### TLS

```tova
tls {
  cert: env("TLS_CERT"),
  key: env("TLS_KEY")
}
```

Always use TLS in production. If behind a reverse proxy (nginx, Cloudflare), TLS can terminate there.

### Sessions

```tova
sessions {
  secret: env("SESSION_SECRET"),
  max_age: 7.days,
  secure: true,          // HTTPS only
  http_only: true,       // No JavaScript access
  same_site: "strict"    // CSRF protection
}
```

### Environment Management

```tova
env PORT: Int = 3000                    // With default
env DATABASE_URL: String                // Required
env FEATURE_FLAG: Bool = false          // Feature toggle
env API_KEY: Option<String> = None      // Optional
```

Required `env` declarations without defaults cause a startup error if the variable is missing. Use `Option` for genuinely optional configuration.

### Body Size Limits

```tova
max_body 5.megabytes

uploads {
  max_size: 10.megabytes,
  allowed_types: ["image/png", "image/jpeg", "application/pdf"]
}
```

Always set body size limits to prevent denial-of-service via large payloads.

## Deployment

### Building

```bash
tova build app.tova
```

This produces a `dist/` directory with:
- `server.js` — Server bundle (runs on Bun)
- `client/` — Client bundle (static files)

### Running in Production

```bash
bun run dist/server.js
```

The server serves both the API and the static client files.

### Health Checks

Every server should expose a health endpoint for orchestrators:

```tova
fn health() {
  { status: "ok", uptime: Process.uptime(), timestamp: Date.now() }
}

route GET "/health" => health
```

Orchestrators (Kubernetes, Docker, AWS ECS) probe this endpoint to determine if the service is healthy.

### Environment Variables

Set environment variables through your deployment platform:

```bash
# Docker
docker run -e DATABASE_URL="..." -e JWT_SECRET="..." app

# Kubernetes (via ConfigMap/Secret)
# AWS ECS (via task definition)
# Fly.io (via fly secrets set)
```

## Monitoring

### Distributed Tracing

Propagate request IDs across services:

```tova
middleware fn trace(req, res) {
  req_id = req.headers["x-request-id"] |> unwrapOr(uuid())
  req.id = req_id
  res.setHeader("X-Request-ID", req_id)
}
```

When service A calls service B, pass the request ID:

```tova
await fetch("http://service-b/api/data", {
  headers: { "X-Request-ID": req.id }
})
```

### Structured Logging

```tova
middleware fn logger(req, res) {
  start = Date.now()
  res.on_finish(fn() {
    duration = Date.now() - start
    print(JSON.stringify({
      method: req.method,
      path: req.path,
      status: res.status,
      duration_ms: duration,
      request_id: req.id
    }))
  })
}
```

JSON-structured logs are parseable by log aggregation systems (Datadog, Grafana, ELK).

### Error Tracking

```tova
on_error fn(err, req, res) {
  print(JSON.stringify({
    level: "error",
    message: err.message,
    stack: err.stack,
    request_id: req.id,
    path: req.path,
    method: req.method
  }))

  res.status(500)
  res.json({ error: "Internal error", request_id: req.id })
}
```

Include the request ID in error responses so users can reference it in bug reports.
