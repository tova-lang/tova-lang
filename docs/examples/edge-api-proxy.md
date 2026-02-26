---
title: "API Proxy with Caching"
---

# API Proxy with Caching (Deno Deploy)

An API proxy that caches upstream responses in Deno KV. Demonstrates the Deno Deploy target, middleware chains, KV caching, and error handling.

## The Full Application

Create `proxy.tova`:

```tova
shared {
  type CacheEntry {
    data: String
    timestamp: Int
    ttl: Int
  }

  type ProxyResponse {
    source: String
    data: String
    cached: Bool
  }
}

edge {
  target: "deno"

  kv CACHE
  env UPSTREAM_URL = "https://api.weatherapi.com/v1"
  env CACHE_TTL = "300"
  secret WEATHER_API_KEY

  on_error fn(err, req) {
    { error: err.message, path: req.url, timestamp: Date.now() }
  }

  // Track request timing
  middleware fn timing(req, next) {
    start = Date.now()
    res = next(req)
    elapsed = Date.now() - start
    print("[{elapsed}ms] {req.method} {req.url}")
    res
  }

  // Verify API token on protected routes
  middleware fn verify_token(req, next) {
    token = req.headers.get("X-API-Token")
    if token == nil {
      Response.new(JSON.stringify({ error: "Missing API token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      })
    } else {
      next(req)
    }
  }

  // Cache-aside helper
  fn get_cached(key) {
    raw = await CACHE.get(key)
    if raw == nil {
      nil
    } else {
      entry = JSON.parse(raw)
      age = Date.now() - entry.timestamp
      if age > entry.ttl * 1000 {
        nil
      } else {
        entry.data
      }
    }
  }

  fn set_cached(key, data, ttl) {
    entry = CacheEntry(data, Date.now(), ttl)
    await CACHE.put(key, JSON.stringify(entry))
  }

  // Current weather
  fn fetch_weather(req, params) {
    cache_key = "weather:{params.city}"
    cached = await get_cached(cache_key)
    if cached != nil {
      ProxyResponse("cache", cached, true)
    } else {
      url = "{UPSTREAM_URL}/current.json?key={WEATHER_API_KEY}&q={params.city}"
      upstream = await fetch(url)
      data = await upstream.text()
      await set_cached(cache_key, data, int(CACHE_TTL))
      ProxyResponse("upstream", data, false)
    }
  }

  // Weather forecast
  fn fetch_forecast(req, params) {
    cache_key = "forecast:{params.city}:{params.days}"
    cached = await get_cached(cache_key)
    if cached != nil {
      ProxyResponse("cache", cached, true)
    } else {
      url = "{UPSTREAM_URL}/forecast.json?key={WEATHER_API_KEY}&q={params.city}&days={params.days}"
      upstream = await fetch(url)
      data = await upstream.text()
      await set_cached(cache_key, data, int(CACHE_TTL))
      ProxyResponse("upstream", data, false)
    }
  }

  route GET "/api/weather/:city" => fetch_weather
  route GET "/api/forecast/:city/:days" => fetch_forecast

  // Cache management (no auth required for health)
  route DELETE "/api/cache/:key" => fn(req, params) {
    await CACHE.delete(params.key)
    { deleted: params.key }
  }

  route GET "/api/stats" => fn(req) {
    { status: "ok", target: "deno", timestamp: Date.now() }
  }
}
```

## Running It

Build and deploy to Deno Deploy:

```bash
tova build proxy.tova
deployctl deploy --project=my-proxy .tova-out/proxy.edge.js
```

For local development:

```bash
deno run --allow-net --allow-env .tova-out/proxy.edge.js
```

Test the proxy:

```bash
# First request -- fetches from upstream
curl -H "X-API-Token: my-token" http://localhost:8000/api/weather/london

# Second request -- served from cache
curl -H "X-API-Token: my-token" http://localhost:8000/api/weather/london
```

## What This Demonstrates

### Deno Target

Setting `target: "deno"` generates a `Deno.serve()` handler. KV is initialized with `Deno.openKv()`, environment variables use `Deno.env.get()`, and secrets follow the same pattern. The output runs directly with `deno run`.

### Middleware Chains

Middleware functions execute in declaration order. Here, `timing` runs first (measuring total request time), then `verify_token` checks authentication. If `verify_token` returns a response directly (without calling `next`), the route handler is never reached.

### KV Caching

The cache-aside pattern checks KV first, falls back to the upstream API, then stores the result. The `CacheEntry` type tracks timestamps so entries can be expired based on a configurable TTL, even though Deno KV doesn't support TTL natively.

### Error Handling

The `on_error` handler catches any uncaught exceptions in route handlers or middleware. It returns a structured JSON error response with the request path and a timestamp for debugging.

### Secret Key Management

The `secret WEATHER_API_KEY` declaration requires the value to be set in the deployment environment. On Deno Deploy, set it via the dashboard or CLI. The compiler never includes default values for secrets.

## Key Patterns

- **Named function handlers** (`fn fetch_weather(...)`) referenced by routes keep complex logic organized
- **Helper functions** (`get_cached`, `set_cached`) share caching logic across handlers
- **Middleware ordering** matters -- `timing` wraps everything including `verify_token`
- **Shared types** (`CacheEntry`, `ProxyResponse`) document the data shapes
- **Multiple KV operations** on Deno share a single `Deno.openKv()` instance

## What's Next

- Add security with a [Feature Flag Service](./edge-feature-flags.md)
- Use named blocks with an [Image Pipeline](./edge-image-pipeline.md)
- Learn more in the [Edge Block guide](/fullstack/edge-block)
