# Configuration

Tova server blocks support a variety of declarative configuration blocks for CORS, rate limiting, sessions, file uploads, TLS, and more. Each block is placed directly inside the `server { }` block.

## CORS

Configure Cross-Origin Resource Sharing to control which origins can access your server:

```tova
server {
  cors {
    origins: ["https://example.com", "http://localhost:3000"]
    methods: ["GET", "POST", "PUT", "DELETE"]
    headers: ["Content-Type", "Authorization"]
    credentials: true
  }
}
```

Use `origins: ["*"]` to allow all origins (not recommended for production with credentials):

```tova
cors {
  origins: ["*"]
  methods: ["GET", "POST"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `origins` | `[String]` | Allowed origin URLs |
| `methods` | `[String]` | Allowed HTTP methods |
| `headers` | `[String]` | Allowed request headers |
| `credentials` | `Bool` | Whether to allow cookies and auth headers |

## Rate Limiting

Protect your server from abuse by limiting the number of requests a client can make within a time window:

```tova
server {
  rate_limit {
    max: 100          // maximum requests per window
    window: 60        // window duration in seconds
  }
}
```

When a client exceeds the limit, the server responds with `429 Too Many Requests`.

| Field | Type | Description |
|-------|------|-------------|
| `max` | `Int` | Maximum number of requests allowed per window |
| `window` | `Int` | Time window in seconds |

## Environment Variables

Declare typed environment variables with optional default values. Variables are validated at startup:

```tova
server {
  env DATABASE_URL: String = "sqlite:./data.db"
  env PORT: Int = 3000
  env DEBUG: Bool = false
  env API_KEY: String        // required -- no default value
}
```

| Feature | Syntax | Behavior |
|---------|--------|----------|
| With default | `env PORT: Int = 3000` | Uses the default if the variable is not set |
| Required | `env API_KEY: String` | Server fails to start if the variable is not set |
| String type | `env NAME: String` | No conversion needed |
| Int type | `env PORT: Int` | Parsed as an integer at startup |
| Bool type | `env DEBUG: Bool` | Parsed as a boolean (`"true"`, `"1"` are truthy) |

Environment variables are available as regular variables throughout the server block:

```tova
server {
  env PORT: Int = 3000
  env DATABASE_URL: String

  db { url: DATABASE_URL }

  on_start fn() {
    print("Server running on port {PORT}")
  }
}
```

## Static Files

Serve static files from a directory:

```tova
server {
  static "/public" => "./public"
  static "/assets" => "./dist/assets"
}
```

The first argument is the URL path prefix, and the second is the filesystem directory.

### SPA Fallback

For single-page applications, use the `fallback` keyword to serve a fallback file when no static file matches:

```tova
static "/app" => "./dist" fallback "index.html"
```

This serves `./dist/index.html` for any request under `/app` that does not match an existing file, enabling client-side routing.

## Sessions

Enable server-side session management:

```tova
server {
  session {
    secret: "your-session-secret"
    max_age: 86400              // session lifetime in seconds (24 hours)
    cookie_name: "__sid"        // name of the session cookie
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `secret` | `String` | Secret used to sign the session cookie |
| `max_age` | `Int` | Session lifetime in seconds |
| `cookie_name` | `String` | Name of the session cookie (default: `"__sid"`) |

## File Upload

Configure file upload limits and allowed types:

```tova
server {
  upload {
    max_size: 10_000_000        // 10MB maximum file size
    allowed_types: ["image/png", "image/jpeg", "application/pdf"]
  }
}
```

Requests that exceed the size limit or send a disallowed content type are rejected with a `413` or `415` response.

| Field | Type | Description |
|-------|------|-------------|
| `max_size` | `Int` | Maximum upload size in bytes |
| `allowed_types` | `[String]` | List of permitted MIME types |

## TLS / HTTPS

Enable TLS for encrypted connections:

```tova
server {
  tls {
    cert: "./cert.pem"
    key: "./key.pem"
  }
}
```

When TLS is configured, the server listens on HTTPS. Both `cert` and `key` are paths to PEM-encoded files.

| Field | Type | Description |
|-------|------|-------------|
| `cert` | `String` | Path to the TLS certificate file |
| `key` | `String` | Path to the TLS private key file |

## Compression

Enable response compression. Responses are compressed using gzip or deflate based on the client's `Accept-Encoding` header:

```tova
server {
  compression {
    min_size: 1024              // only compress responses larger than 1KB
  }
}
```

The presence of the `compression` block enables compression. Responses smaller than `min_size` are sent uncompressed.

| Field | Type | Description |
|-------|------|-------------|
| `min_size` | `Int` | Minimum response size in bytes to trigger compression |

## Caching

Configure default cache headers for responses:

```tova
server {
  cache {
    max_age: 3600                        // Cache-Control max-age in seconds
    stale_while_revalidate: 60           // seconds to serve stale content while revalidating
  }
}
```

This sets the `Cache-Control` header on responses. Individual routes can override these defaults using the `cache_control` helper (see [Advanced](advanced.md)).

| Field | Type | Description |
|-------|------|-------------|
| `max_age` | `Int` | Time in seconds the response is considered fresh |
| `stale_while_revalidate` | `Int` | Time in seconds to serve stale content while fetching a fresh copy |

## Max Body Size

Set a global limit on request body size:

```tova
server {
  max_body 10_000_000          // 10MB limit
}
```

Requests with bodies exceeding this limit are rejected with a `413 Payload Too Large` response.

## Health Checks

Add a health check endpoint with a single line:

```tova
server {
  health "/health"
}
```

This creates a `GET /health` endpoint that returns `{ status: "ok" }` with a 200 status code. Health checks are commonly used by load balancers, container orchestrators, and monitoring systems.

## Complete Configuration Example

Here is a server block demonstrating multiple configuration options together:

```tova
server {
  // Environment
  env PORT: Int = 3000
  env DATABASE_URL: String = "sqlite:./data.db"
  env JWT_SECRET: String

  // Database
  db { url: DATABASE_URL }

  // Auth
  auth { type: "jwt", secret: JWT_SECRET }

  // Security
  cors {
    origins: ["https://myapp.com"]
    methods: ["GET", "POST", "PUT", "DELETE"]
    headers: ["Content-Type", "Authorization"]
    credentials: true
  }
  rate_limit { max: 100, window: 60 }
  max_body 5_000_000

  // Performance
  compression { min_size: 1024 }
  cache { max_age: 3600 }

  // Static files
  static "/assets" => "./public/assets"
  static "/" => "./public/dist" fallback "index.html"

  // Sessions
  session { secret: "session-secret", max_age: 86400 }

  // Uploads
  upload { max_size: 10_000_000, allowed_types: ["image/png", "image/jpeg"] }

  // Health
  health "/health"

  // Routes
  route GET "/api/users" with auth => get_users
  route POST "/api/users" with auth, role("admin") => create_user
}
```

## Practical Tips

**Set rate limits early.** Even a simple rate limit prevents a single client from overwhelming your server. Adjust the `max` and `window` values based on your expected traffic.

**Use environment variables for secrets.** Never hardcode secrets for sessions, JWT, or database connections. Use `env` declarations so values come from the runtime environment.

**Enable compression for API responses.** JSON responses compress well. A `min_size` of 1024 bytes avoids the overhead of compressing very small payloads.

**Use SPA fallback for client-side routing.** When serving a single-page application, the `fallback` option ensures that deep links (e.g., `/app/settings/profile`) serve the application shell instead of returning a 404.
