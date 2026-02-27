---
title: "Feature Flag Service"
---

# Feature Flag Service (Vercel Edge)

A feature flag evaluation service deployed to Vercel Edge Functions. Demonstrates the Vercel target, security block integration with JWT authentication, restricted CORS, and consistent hashing for deterministic flag evaluation.

## The Full Application

Create `flags.tova`:

```tova
security {
  auth jwt { secret: env("JWT_SECRET") }

  role Admin { can: [manage_flags, evaluate_flags] }
  role Developer { can: [evaluate_flags] }

  protect "/api/admin/*" { require: Admin }
  protect "/api/flags/*" { require: authenticated }
}

edge {
  target: "vercel"

  env DEFAULT_ROLLOUT = "50"
  secret JWT_SECRET

  cors {
    origins: ["https://myapp.com", "https://staging.myapp.com"]
    methods: [GET, POST, PUT]
    headers: ["Content-Type", "Authorization"]
    credentials: true
  }

  on_error fn(err, req) {
    { error: err.message, service: "feature-flags" }
  }

  middleware fn log_request(req, next) {
    print("[flags] {req.method} {req.url}")
    next(req)
  }

  // In-memory flag store (in production, back with KV or database)
  FLAGS = {
    dark_mode: { enabled: true, rollout: 100 },
    new_checkout: { enabled: true, rollout: 30 },
    beta_search: { enabled: false, rollout: 0 },
    ai_assistant: { enabled: true, rollout: 50 }
  }

  // Consistent hash for deterministic flag evaluation
  fn hash_user(user_id, flag_name) -> Int {
    input = "{user_id}:{flag_name}"
    hash_val = 0
    for i in range(len(input)) {
      ch = input.charCodeAt(i)
      hash_val = ((hash_val * 31) + ch) % 1000000007
    }
    hash_val % 100
  }

  // Evaluate a single flag for a user
  fn evaluate_flag(flag_name, user_id) {
    flag = FLAGS[flag_name]
    if flag == nil {
      { flag: flag_name, enabled: false, reason: "unknown_flag" }
    } elif flag.enabled == false {
      { flag: flag_name, enabled: false, reason: "disabled" }
    } else {
      bucket = hash_user(user_id, flag_name)
      enabled = bucket < flag.rollout
      { flag: flag_name, enabled: enabled, bucket: bucket, rollout: flag.rollout }
    }
  }

  // Evaluate flags for a user (requires authentication)
  route GET "/api/flags/evaluate/:flag" => fn(req, params) {
    url = URL.new(req.url)
    user_id = url.searchParams.get("user_id") || "anonymous"
    evaluate_flag(params.flag, user_id)
  }

  // Evaluate all flags at once
  route GET "/api/flags/all" => fn(req) {
    url = URL.new(req.url)
    user_id = url.searchParams.get("user_id") || "anonymous"
    results = {}
    for key in Object.keys(FLAGS) {
      results[key] = evaluate_flag(key, user_id)
    }
    { user_id: user_id, flags: results }
  }

  // Admin: list all flags with their config
  route GET "/api/admin/flags" => fn(req) {
    { flags: FLAGS }
  }

  // Admin: update a flag
  route PUT "/api/admin/flags/:flag" => fn(req, params) {
    body = await req.json()
    flag = FLAGS[params.flag]
    if flag == nil {
      Response.new(JSON.stringify({ error: "Flag not found" }), { status: 404 })
    } else {
      if body.enabled != nil {
        flag.enabled = body.enabled
      }
      if body.rollout != nil {
        flag.rollout = body.rollout
      }
      { updated: params.flag, config: flag }
    }
  }
}
```

## Running It

Build and deploy to Vercel:

```bash
tova build flags.tova
cp .tova-out/flags.edge.js api/index.js
vercel dev
```

For production:

```bash
vercel deploy --prod
```

Set the JWT secret in Vercel's environment settings:

```bash
vercel env add JWT_SECRET
```

Test the service:

```bash
# Evaluate a flag (requires JWT token)
TOKEN="eyJhbGci..."
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/flags/evaluate/dark_mode?user_id=user123"

# Get all flags
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/flags/all?user_id=user123"

# Admin: update rollout (requires Admin role)
curl -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rollout": 75}' \
  "http://localhost:3000/api/admin/flags/new_checkout"
```

## What This Demonstrates

### Vercel Target

Setting `target: "vercel"` generates `export default function handler(request)` with `runtime: "edge"` configuration. Environment variables are accessed via `process.env`. The output file goes into Vercel's `api/` directory.

### Security Integration

The `security {}` block defines JWT authentication and role-based access. The edge compiler generates:

- **JWT verification** using Web Crypto API (`crypto.subtle`) -- no Node.js dependencies
- **Route protection** -- `/api/admin/*` requires Admin role, `/api/flags/*` requires any authenticated user
- **Algorithm pinning** -- only HS256 tokens accepted
- **Automatic 401/403 responses** before the route handler executes

### Restricted CORS

Unlike open CORS (`cors {}`), this example specifies exact origins, methods, and headers. The `credentials: true` setting allows cookies and auth headers. The compiler validates the `Origin` header against the allowlist.

### Middleware

The `log_request` middleware runs on every request, including those that fail security checks. Middleware executes in declaration order, before the route handler.

### Consistent Hashing

The `hash_user` function produces deterministic flag evaluations. The same user always gets the same flag value for a given flag name, enabling gradual rollouts where a specific percentage of users see a feature.

## Key Patterns

- **Security + edge integration** gives you auth without any runtime dependencies
- **Consistent hashing** enables percentage-based rollouts with deterministic evaluation
- **Role-based admin endpoints** separate read (Developer) from write (Admin) access
- **In-memory state** works for edge functions with low-latency reads (back with KV for persistence)
- **Query parameters** accessed via `URL.new(req.url).searchParams`

## What's Next

- Add queue processing with an [Image Pipeline](./edge-image-pipeline.md)
- Deploy webhooks with a [Webhook Handler](./edge-webhook-handler.md)
- Learn more in the [Edge Block guide](/fullstack/edge-block)
