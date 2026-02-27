---
title: "Webhook Handler"
---

# Webhook Handler (AWS Lambda)

A webhook receiver deployed to AWS Lambda that verifies signatures from GitHub and Stripe, dispatches events, and integrates with the security block for JWT auth and auto-sanitization.

## The Full Application

Create `webhooks.tova`:

```tova
shared {
  type WebhookEvent {
    id: String
    source: String
    event_type: String
    timestamp: Int
  }

  type WebhookResult {
    accepted: Bool
    event_id: String
  }
}

security {
  auth jwt { secret: env("JWT_SECRET") }

  role Admin { can: [manage_webhooks, view_events] }
  role Service { can: [view_events] }

  protect "/api/admin/*" { require: Admin }
  protect "/api/events/*" { require: authenticated }

  sensitive WebhookEvent.source {
    visible_to: [Admin]
  }
}

edge {
  target: "lambda"

  env APP_ENV = "production"
  secret JWT_SECRET
  secret GITHUB_WEBHOOK_SECRET
  secret STRIPE_WEBHOOK_SECRET

  cors {
    origins: ["https://myapp.com"]
    methods: [GET, POST]
    headers: ["Content-Type", "Authorization"]
  }

  on_error fn(err, req) {
    print("Webhook error: {err.message}")
    { error: "Internal server error", request_id: crypto.randomUUID() }
  }

  // In-memory event log (in production, use DynamoDB or similar)
  events = []

  // ── Signature Verification ────────────────────────────────────

  fn verify_github_signature(payload, signature) -> Bool {
    if signature == nil { false }
    else {
      encoder = TextEncoder.new()
      key_data = encoder.encode(GITHUB_WEBHOOK_SECRET)
      key = await crypto.subtle.importKey(
        "raw", key_data, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      )
      sig_data = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
      hex = Array.from(Uint8Array.new(sig_data))
        |> map(fn(b) b.toString(16).padStart(2, "0"))
        |> join("")
      expected = "sha256={hex}"
      expected == signature
    }
  }

  fn verify_stripe_signature(payload, signature) -> Bool {
    if signature == nil { false }
    else {
      parts = signature.split(",")
      timestamp_part = parts |> find(fn(p) p.startsWith("t="))
      sig_part = parts |> find(fn(p) p.startsWith("v1="))
      if timestamp_part == nil || sig_part == nil { false }
      else {
        ts = timestamp_part.slice(2)
        signed_payload = "{ts}.{payload}"
        encoder = TextEncoder.new()
        key_data = encoder.encode(STRIPE_WEBHOOK_SECRET)
        key = await crypto.subtle.importKey(
          "raw", key_data, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
        )
        sig_data = await crypto.subtle.sign("HMAC", key, encoder.encode(signed_payload))
        hex = Array.from(Uint8Array.new(sig_data))
          |> map(fn(b) b.toString(16).padStart(2, "0"))
          |> join("")
        expected_sig = sig_part.slice(3)
        hex == expected_sig
      }
    }
  }

  // ── Event Dispatch ────────────────────────────────────────────

  fn dispatch_event(source, event_type, payload) {
    event_id = crypto.randomUUID()
    event = WebhookEvent(event_id, source, event_type, Date.now())
    events.push(event)

    match source {
      "github" => match event_type {
        "push" => print("GitHub push to {payload.repository.full_name}")
        "pull_request" => print("GitHub PR #{payload.number}: {payload.action}")
        "issues" => print("GitHub issue #{payload.issue.number}: {payload.action}")
        _ => print("GitHub event: {event_type}")
      }
      "stripe" => match event_type {
        "payment_intent.succeeded" => print("Payment succeeded: {payload.data.object.id}")
        "invoice.paid" => print("Invoice paid: {payload.data.object.id}")
        _ => print("Stripe event: {event_type}")
      }
      _ => print("Unknown source: {source}")
    }

    event_id
  }

  // ── Routes ────────────────────────────────────────────────────

  // GitHub webhook endpoint (signature verified, no JWT)
  route POST "/webhooks/github" => fn(req) {
    body = await req.text()
    signature = req.headers.get("X-Hub-Signature-256")
    event_type = req.headers.get("X-GitHub-Event") || "unknown"

    valid = await verify_github_signature(body, signature)
    if valid == false {
      Response.new(JSON.stringify({ error: "Invalid signature" }), { status: 401 })
    } else {
      payload = JSON.parse(body)
      event_id = await dispatch_event("github", event_type, payload)
      WebhookResult(true, event_id)
    }
  }

  // Stripe webhook endpoint (signature verified, no JWT)
  route POST "/webhooks/stripe" => fn(req) {
    body = await req.text()
    signature = req.headers.get("Stripe-Signature")
    payload = JSON.parse(body)
    event_type = payload.type || "unknown"

    valid = await verify_stripe_signature(body, signature)
    if valid == false {
      Response.new(JSON.stringify({ error: "Invalid signature" }), { status: 401 })
    } else {
      event_id = await dispatch_event("stripe", event_type, payload)
      WebhookResult(true, event_id)
    }
  }

  // List recent events (requires authentication)
  route GET "/api/events/recent" => fn(req) {
    // Auto-sanitize strips `source` field for non-Admin users
    recent = events.slice(-50)
    { events: recent, total: len(events) }
  }

  // Admin: get event by ID
  route GET "/api/admin/events/:id" => fn(req, params) {
    event = events |> find(fn(e) e.id == params.id)
    if event == nil {
      Response.new(JSON.stringify({ error: "Event not found" }), { status: 404 })
    } else {
      { event: event }
    }
  }

  // Admin: clear event log
  route POST "/api/admin/events/clear" => fn(req) {
    count = len(events)
    events = []
    { cleared: count }
  }
}
```

## Running It

Build and deploy to AWS Lambda:

```bash
tova build webhooks.tova
cp .tova-out/webhooks.edge.js index.mjs
```

Package and deploy with SAM:

```bash
sam init  # If you don't have a template.yaml yet
sam deploy --guided
```

Or use the AWS CDK, Serverless Framework, or manually upload to Lambda with an API Gateway trigger.

Set environment variables in Lambda:

```bash
aws lambda update-function-configuration \
  --function-name my-webhooks \
  --environment "Variables={JWT_SECRET=...,GITHUB_WEBHOOK_SECRET=...,STRIPE_WEBHOOK_SECRET=...}"
```

Test the webhooks locally with SAM:

```bash
sam local start-api

# Send a GitHub webhook
curl -X POST http://localhost:3000/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -H "X-Hub-Signature-256: sha256=..." \
  -d '{"repository": {"full_name": "org/repo"}, "ref": "refs/heads/main"}'
```

## What This Demonstrates

### Lambda Target

Setting `target: "lambda"` generates `export const handler` for API Gateway integration. The compiler creates a request adapter that converts Lambda's event format (with `event.rawPath`, `event.headers`, `event.body`) into a standard `Request` object, so route handlers work the same as on other targets.

### Webhook Signature Verification

Both GitHub and Stripe webhooks use HMAC-SHA256 signatures. The verification functions use the Web Crypto API (`crypto.subtle.importKey` and `crypto.subtle.sign`) which is available on all edge runtimes, including Lambda@Edge and standard Lambda with Node.js 18+.

GitHub sends `X-Hub-Signature-256: sha256=<hex>`. Stripe sends `Stripe-Signature: t=<timestamp>,v1=<hex>` with a timestamp-prefixed payload. Each gets its own verification function.

### Security on Lambda

The `security {}` block generates JWT authentication that works on Lambda. The compiler adds `__authenticate(request)` using Web Crypto API, `__checkProtection(pathname, user)` for route-level access control, and `__autoSanitize(result, user)` for response filtering.

Webhook endpoints (`/webhooks/*`) are not protected by JWT -- they use their own signature verification. The `/api/events/*` and `/api/admin/*` endpoints require JWT tokens.

### Auto-Sanitization

The `sensitive WebhookEvent.source { visible_to: [Admin] }` rule means that when non-Admin users query `/api/events/recent`, the `source` field is stripped from each event in the response. Admin users see the full data. The compiler generates this filtering automatically.

### Lambda Event Adapter

The generated code adapts Lambda's API Gateway event format into a standard `Request`. The adapter:
- Creates `Request` from `event.rawPath` + `event.headers` + `event.body`
- Adds a `headers.get()` method for case-insensitive header access
- Extracts path parameters from the URL pattern matching
- Converts the handler's `Response` back to Lambda's expected format

## Key Patterns

- **Webhook endpoints skip JWT** -- they use HMAC signature verification instead
- **Web Crypto API** works across all edge targets for cryptographic operations
- **Pattern matching for dispatch** -- nested `match` routes events by source and type
- **Pipe expressions** simplify data transforms (`events |> find(fn(e) ...)`)
- **Security block** integrates automatically with the Lambda target

## What's Next

- Build a simpler edge function: [URL Shortener](./edge-url-shortener.md)
- Add caching with an [API Proxy](./edge-api-proxy.md)
- Learn more in the [Edge Block guide](/fullstack/edge-block)
