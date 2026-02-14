# API Gateway

This example builds a production-ready API server with comprehensive configuration: environment variables, CORS, rate limiting, compression, caching, sessions, file uploads, TLS, middleware composition, and health checks. It serves as a template for deploying Tova in production.

## The Full Application

```tova
shared {
  type User {
    id: Int
    name: String
    email: String
    role: String
  }

  type ApiMeta {
    timestamp: String
    request_id: String
  }

  type ApiResponse<T> {
    data: T
    meta: ApiMeta
  }

  type ApiError {
    code: Int
    message: String
    details: Option<String>
  }
}

server {
  // --- Environment Variables ---

  env PORT: Int = 3000
  env HOST: String = "0.0.0.0"
  env DATABASE_URL: String
  env JWT_SECRET: String
  env ALLOWED_ORIGINS: String = "http://localhost:5173"
  env MAX_UPLOAD_MB: Int = 10
  env RATE_LIMIT_RPM: Int = 100
  env LOG_LEVEL: String = "info"
  env TLS_CERT: Option<String> = None
  env TLS_KEY: Option<String> = None

  // --- CORS ---

  cors {
    origins: env("ALLOWED_ORIGINS") |> split(","),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    headers: ["Content-Type", "Authorization", "X-Request-ID"],
    credentials: true,
    max_age: 86400
  }

  // --- Rate Limiting ---

  rate_limit {
    requests: RATE_LIMIT_RPM,
    window: 1.minute,
    key: fn(req) req.ip,
    on_limit: fn(req, res) {
      res.status(429)
      res.json({ error: "Rate limit exceeded. Try again later." })
    }
  }

  // --- Compression ---

  compression {
    enabled: true,
    threshold: 1024,
    encodings: ["gzip", "deflate"]
  }

  // --- Caching ---

  cache {
    default: "public, max-age=300, stale-while-revalidate=60"
  }

  // --- Static Files ---

  static "/" => "public" fallback "index.html"

  // --- Sessions ---

  session {
    secret: JWT_SECRET,
    cookie: "session",
    max_age: 7.days,
    secure: true,
    http_only: true,
    same_site: "strict"
  }

  // --- File Uploads ---

  upload {
    max_size: MAX_UPLOAD_MB.megabytes,
    allowed_types: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
    destination: "uploads/"
  }

  // --- TLS ---

  tls {
    cert: TLS_CERT,
    key: TLS_KEY
  }

  // --- Max Body Size ---

  max_body 5.megabytes

  // --- Database ---

  db {
    adapter: "postgres"
    url: DATABASE_URL
    pool: 20
  }

  model User {
    name: String
    email: String
    role: String
    password_hash: String
  }

  // --- Middleware ---

  middleware fn request_id(req, res) {
    id = req.headers["x-request-id"] |> unwrapOr(uuid())
    req.id = id
    res.setHeader("X-Request-ID", id)
  }

  middleware fn logger(req, res) {
    start = Date.now()
    print("[{LOG_LEVEL}] {req.method} {req.path} - started (id: {req.id})")

    res.on_finish(fn() {
      duration = Date.now() - start
      print("[{LOG_LEVEL}] {req.method} {req.path} - {res.status} ({duration}ms)")
    })
  }

  middleware fn auth(req, res) {
    token = req.headers["authorization"]
      |> map(fn(h) h |> replace("Bearer ", ""))

    match token {
      None => {
        res.status(401)
        res.json({ error: "Authorization header required" })
      }
      Some(t) => {
        match jwt.verify(t, JWT_SECRET) {
          Ok(payload) => { req.user = payload }
          Err(_) => {
            res.status(401)
            res.json({ error: "Invalid or expired token" })
          }
        }
      }
    }
  }

  middleware fn require_role(role: String) {
    fn(req, res) {
      guard req.user.role == role else {
        res.status(403)
        res.json({ error: "Requires role: {role}" })
        return
      }
    }
  }

  // --- Error Handler ---

  on_error fn(err, req, res) {
    print("[ERROR] {req.method} {req.path} - {err.message} (id: {req.id})")

    code = match err.status {
      Some(status) => status
      None => 500
    }

    res.status(code)
    api_err = ApiError {
      code: code,
      message: match code {
        400 => "Bad request"
        401 => "Unauthorized"
        403 => "Forbidden"
        404 => "Not found"
        429 => "Rate limit exceeded"
        _ => "Internal server error"
      },
      details: match LOG_LEVEL {
        "debug" => Some(err.message)
        _ => None
      }
    }
    res.json(api_err)
  }

  // --- Health Check ---

  fn health() {
    {
      status: "ok",
      uptime: Process.uptime(),
      version: env("APP_VERSION") |> unwrapOr("dev"),
      timestamp: Date.now()
    }
  }

  // --- API Routes ---

  fn list_users(req) -> [User] {
    page = req.query.page |> unwrapOr(1)
    per_page = req.query.per_page |> unwrapOr(20)
    User.all() |> paginate(page, per_page)
  }

  fn get_user(req, id: Int) -> Result<User, ApiError> {
    not_found = ApiError { code: 404, message: "User not found", details: None }
    User.find(id)
      |> ok_or(not_found)
  }

  fn create_user(req) -> Result<User, ApiError> {
    guard req.body.name |> len() > 0 else {
      name_err = ApiError { code: 400, message: "Name required", details: None }
      return Err(name_err)
    }
    guard req.body.email |> contains("@") else {
      email_err = ApiError { code: 400, message: "Valid email required", details: None }
      return Err(email_err)
    }

    hash = Bun.password.hashSync(req.body.password, { algorithm: "bcrypt" })

    User.create({
      name: req.body.name,
      email: req.body.email,
      role: "user",
      password_hash: hash
    }) |> Ok()
  }

  fn upload_avatar(req) {
    file = req.file
    {
      filename: file.name,
      size: file.size,
      url: "/uploads/{file.name}"
    }
  }

  // --- Route Registration ---

  route GET "/health" => health

  route GET "/api/users" => list_users with auth
  route GET "/api/users/:id" => get_user with auth
  route POST "/api/users" => create_user with auth, require_role("admin")
  route POST "/api/users/avatar" => upload_avatar with auth
}
```

## Running It

```bash
# Development
DATABASE_URL="postgres://localhost/myapp" JWT_SECRET="dev-secret" tova dev gateway.tova

# Production
tova build gateway.tova
DATABASE_URL="..." JWT_SECRET="..." TLS_CERT="/path/cert.pem" TLS_KEY="/path/key.pem" bun run dist/server.js
```

## What This Demonstrates

### Environment Variables with Types

```tova
env PORT: Int = 3000
env DATABASE_URL: String          // Required — no default
env TLS_CERT: Option<String> = None   // Optional
```

Typed `env` declarations validate environment variables at startup. Missing required variables without defaults cause a startup error. `Option` types allow genuinely optional configuration.

### CORS Configuration

```tova
cors {
  origins: env("ALLOWED_ORIGINS") |> split(","),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  max_age: 86400
}
```

Origins can be dynamic (from environment) or static. `max_age` controls preflight cache duration.

### Rate Limiting

```tova
rate_limit {
  requests: 100,
  window: 1.minute,
  key: fn(req) req.ip,
  on_limit: fn(req, res) { res.status(429); ... }
}
```

The `key` function determines how requests are grouped (by IP, by user, by API key). The `on_limit` handler customizes the response.

### Middleware Composition

Middleware is applied with `with` on route declarations:

```tova
route GET "/api/users" => list_users with auth
route POST "/api/users" => create_user with auth, require_role("admin")
```

Multiple middleware run in order: `request_id → logger → auth → require_role → handler`. Global middleware (declared without routes) runs on every request. Per-route middleware is added with `with`.

### Parameterized Middleware

```tova
middleware fn require_role(role: String) {
  fn(req, res) {
    guard req.user.role == role else { ... }
  }
}
```

`require_role("admin")` returns a middleware function. This pattern creates configurable middleware.

### Global Error Handler

```tova
on_error fn(err, req, res) {
  // Log the error with request ID for tracing
  // Return structured error response
  // Hide details in production
}
```

The `on_error` handler catches all unhandled errors and returns consistent `ApiError` responses. The `LOG_LEVEL` env var controls whether error details are exposed.

### Health Check

```tova
route GET "/health" => health  // No middleware — always accessible
```

The health endpoint returns uptime, version, and timestamp. No auth middleware so load balancers and orchestrators can probe it.

### Sessions and File Uploads

```tova
sessions {
  secret: JWT_SECRET,
  max_age: 7.days,
  secure: true, http_only: true, same_site: "strict"
}

uploads {
  max_size: 10.megabytes,
  allowed_types: ["image/png", "image/jpeg", "application/pdf"],
  destination: "uploads/"
}
```

Session cookies are configured for security. File uploads are restricted by size and MIME type.

### TLS

```tova
tls {
  cert: TLS_CERT,
  key: TLS_KEY
}
```

When `TLS_CERT` and `TLS_KEY` are provided, the server runs over HTTPS. When they're `None`, it runs over HTTP (suitable for development or when behind a reverse proxy).

## Key Patterns

**Environment-driven configuration.** All deployment-specific values come from `env` declarations with sensible defaults for development.

**Layered middleware.** Global middleware (request_id, logger) applies everywhere. Auth middleware applies per-route. Parameterized middleware (require_role) adds fine-grained access control.

**Structured errors.** A single `ApiError` type and `on_error` handler ensure consistent error responses across all endpoints.

**Production security.** CORS, rate limiting, TLS, secure sessions, and body size limits are all configured declaratively.
