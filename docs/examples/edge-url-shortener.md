---
title: "URL Shortener"
---

# URL Shortener (Cloudflare Workers)

A URL shortener service deployed to Cloudflare Workers. Demonstrates KV storage, redirect responses, scheduled cleanup, and open CORS -- all in one edge function.

## The Full Application

Create `shortener.tova`:

```tova
shared {
  type ShortenRequest {
    url: String
    ttl: Int
  }

  type ShortenResponse {
    code: String
    short_url: String
  }
}

edge {
  target: "cloudflare"

  kv LINKS
  env BASE_URL = "https://s.example.com"
  secret ADMIN_KEY

  cors {}

  health "/healthz"

  // Generate a random 6-character code
  fn make_code() -> String {
    chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    code = ""
    for i in range(6) {
      idx = Math.floor(Math.random() * len(chars))
      code = code ++ chars[idx]
    }
    code
  }

  // Shorten a URL
  route POST "/api/shorten" => fn(req) {
    body = await req.json()
    code = make_code()
    ttl = body.ttl || 86400

    await LINKS.put(code, body.url, { expirationTtl: ttl })

    ShortenResponse(code, "{BASE_URL}/{code}")
  }

  // Look up stats without redirecting
  route GET "/api/links/:code" => fn(req, params) {
    url = await LINKS.get(params.code)
    if url == nil {
      Response.new(JSON.stringify({ error: "Not found" }), { status: 404 })
    } else {
      { code: params.code, url: url }
    }
  }

  // Redirect to the original URL
  route GET "/:code" => fn(req, params) {
    url = await LINKS.get(params.code)
    if url == nil {
      Response.new("Not found", { status: 404 })
    } else {
      Response.redirect(url, 302)
    }
  }

  // Scheduled cleanup logging (KV handles TTL expiry natively)
  schedule "cleanup-log" cron("0 */6 * * *") {
    print("Link cleanup check at {Date.new().toISOString()}")
  }
}
```

## Running It

Build and deploy to Cloudflare Workers:

```bash
tova build shortener.tova
npx wrangler dev .tova-out/shortener.edge.js
```

The compiler generates a `wrangler.toml` with your KV namespace binding. Add your KV namespace ID, then deploy:

```bash
npx wrangler deploy
```

Test it locally:

```bash
# Shorten a URL
curl -X POST http://localhost:8787/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://tovalang.dev", "ttl": 3600}'

# Follow the short link
curl -L http://localhost:8787/abc123
```

## What This Demonstrates

### KV Store

The `kv LINKS` declaration creates a Cloudflare KV namespace binding. On Cloudflare, this is wired from the `env` parameter in the fetch handler. KV operations like `LINKS.put()` and `LINKS.get()` work directly with the platform's key-value store, including TTL-based expiration.

### Redirect Responses

Route handlers can return `Response` objects for full control. The `/:code` route uses `Response.redirect(url, 302)` for temporary redirects instead of returning JSON.

### Scheduled Tasks

The `schedule` block defines a cron job that runs every 6 hours. On Cloudflare, this compiles to a `scheduled()` export that matches `event.cron`. Cloudflare KV handles TTL expiry natively, so the schedule here is used for logging and monitoring.

### Open CORS

The empty `cors {}` block enables wildcard CORS -- any origin can call the API. The compiler generates preflight handling and adds CORS headers to all responses, including error responses.

## Key Patterns

- **Shared types** define the API contract between producer and consumer
- **Inline lambdas** on routes (`fn(req) { ... }`) keep handlers close to their routes
- **Named functions** (`fn make_code()`) can be called from any route in the edge block
- **`env` with defaults** provides configuration that can be overridden at deploy time
- **`secret`** declares values that must be set in the deployment environment (no defaults)

## What's Next

- Add authentication with a [Feature Flag Service](./edge-feature-flags.md)
- Use middleware chains with an [API Proxy](./edge-api-proxy.md)
- Learn more in the [Edge Block guide](/fullstack/edge-block)
