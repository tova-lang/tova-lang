---
title: "Image Pipeline"
---

# Queue-Driven Image Pipeline (Cloudflare Workers)

A two-worker image processing pipeline deployed to Cloudflare Workers. Demonstrates named edge blocks, all five Cloudflare binding types (KV, SQL, Storage, Queue, Env/Secret), queue producer/consumer, wildcard routes, health checks with memory monitoring, and scheduled reports.

## The Full Application

Create `pipeline.tova`:

```tova
shared {
  type UploadResult {
    id: String
    status: String
    queue_position: Int
  }

  type ImageRecord {
    id: String
    original_key: String
    processed_key: String
    status: String
    created_at: Int
  }

  type PipelineStats {
    total: Int
    processed: Int
    pending: Int
    failed: Int
  }
}

// ── API Worker ──────────────────────────────────────────────────

edge "api" {
  target: "cloudflare"

  kv METADATA
  sql DB
  storage IMAGES
  queue PROCESS_QUEUE
  env MAX_FILE_SIZE = "10485760"
  secret API_KEY

  cors {
    origins: ["https://myapp.com"]
    methods: [GET, POST, DELETE]
    headers: ["Content-Type", "Authorization", "X-API-Key"]
    credentials: true
  }

  health "/healthz" {
    check_memory
  }

  on_error fn(err, req) {
    print("API error: {err.message}")
    { error: err.message, worker: "api" }
  }

  middleware fn auth_check(req, next) {
    key = req.headers.get("X-API-Key")
    if key != API_KEY {
      Response.new(JSON.stringify({ error: "Invalid API key" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      })
    } else {
      next(req)
    }
  }

  // Upload an image
  route POST "/api/images" => fn(req) {
    id = crypto.randomUUID()
    content_type = req.headers.get("Content-Type") || "image/png"
    body = await req.arrayBuffer()

    // Check file size
    if body.byteLength > int(MAX_FILE_SIZE) {
      Response.new(JSON.stringify({ error: "File too large" }), { status: 413 })
    } else {
      // Store original in R2
      original_key = "originals/{id}"
      await IMAGES.put(original_key, body, {
        httpMetadata: { contentType: content_type }
      })

      // Record in D1
      await DB.prepare(
        "INSERT INTO images (id, original_key, status, created_at) VALUES (?, ?, ?, ?)"
      ).bind(id, original_key, "pending", Date.now()).run()

      // Enqueue for processing
      await PROCESS_QUEUE.send({ id: id, key: original_key })

      // Cache metadata
      await METADATA.put("img:{id}", JSON.stringify({
        id: id, status: "pending", original_key: original_key
      }))

      UploadResult(id, "queued", 0)
    }
  }

  // Get image metadata
  route GET "/api/images/:id" => fn(req, params) {
    cached = await METADATA.get("img:{params.id}")
    if cached != nil {
      JSON.parse(cached)
    } else {
      row = await DB.prepare(
        "SELECT * FROM images WHERE id = ?"
      ).bind(params.id).first()
      if row == nil {
        Response.new(JSON.stringify({ error: "Not found" }), { status: 404 })
      } else {
        row
      }
    }
  }

  // Serve an image file (original or processed)
  route GET "/images/*path" => fn(req, params) {
    obj = await IMAGES.get(params.path)
    if obj == nil {
      Response.new("Not found", { status: 404 })
    } else {
      headers = { "Content-Type": obj.httpMetadata.contentType || "image/png" }
      Response.new(obj.body, { headers: headers })
    }
  }

  // Delete an image
  route DELETE "/api/images/:id" => fn(req, params) {
    row = await DB.prepare(
      "SELECT * FROM images WHERE id = ?"
    ).bind(params.id).first()
    if row == nil {
      Response.new(JSON.stringify({ error: "Not found" }), { status: 404 })
    } else {
      await IMAGES.delete(row.original_key)
      if row.processed_key != nil {
        await IMAGES.delete(row.processed_key)
      }
      await DB.prepare("DELETE FROM images WHERE id = ?").bind(params.id).run()
      await METADATA.delete("img:{params.id}")
      { deleted: params.id }
    }
  }

  // Pipeline statistics
  route GET "/api/stats" => fn(req) {
    total = await DB.prepare("SELECT COUNT(*) as c FROM images").first()
    processed = await DB.prepare("SELECT COUNT(*) as c FROM images WHERE status = 'processed'").first()
    pending = await DB.prepare("SELECT COUNT(*) as c FROM images WHERE status = 'pending'").first()
    failed = await DB.prepare("SELECT COUNT(*) as c FROM images WHERE status = 'failed'").first()
    PipelineStats(total.c, processed.c, pending.c, failed.c)
  }

  // Scheduled daily report
  schedule "daily-report" cron("0 9 * * *") {
    total = await DB.prepare("SELECT COUNT(*) as c FROM images").first()
    pending = await DB.prepare("SELECT COUNT(*) as c FROM images WHERE status = 'pending'").first()
    print("Daily report: {total.c} total, {pending.c} pending")
  }
}

// ── Processor Worker ────────────────────────────────────────────

edge "processor" {
  target: "cloudflare"

  kv METADATA
  sql DB
  storage IMAGES

  on_error fn(err, req) {
    print("Processor error: {err.message}")
    { error: err.message, worker: "processor" }
  }

  // Process queued images
  consume PROCESS_QUEUE fn(messages) {
    for msg in messages {
      job = msg.body
      id = job.id
      original_key = job.key

      // Fetch the original image
      obj = await IMAGES.get(original_key)
      if obj == nil {
        await DB.prepare(
          "UPDATE images SET status = 'failed' WHERE id = ?"
        ).bind(id).run()
      } else {
        // Process the image (resize, optimize, etc.)
        data = await obj.arrayBuffer()
        processed = data  // In production: apply transforms here

        // Store processed version
        processed_key = "processed/{id}"
        await IMAGES.put(processed_key, processed, {
          httpMetadata: { contentType: obj.httpMetadata.contentType || "image/png" }
        })

        // Update database
        await DB.prepare(
          "UPDATE images SET status = 'processed', processed_key = ? WHERE id = ?"
        ).bind(processed_key, id).run()

        // Update cache
        await METADATA.put("img:{id}", JSON.stringify({
          id: id, status: "processed",
          original_key: original_key, processed_key: processed_key
        }))

        print("Processed image {id}")
      }
    }
  }

  // Health check for the processor
  health "/healthz"
}
```

## Running It

Build both workers:

```bash
tova build pipeline.tova
```

This produces two output files:
- `.tova-out/pipeline.edge.api.js` -- the API worker
- `.tova-out/pipeline.edge.processor.js` -- the queue consumer worker

Each gets its own `wrangler.toml`. Deploy them separately:

```bash
# Deploy the API worker
cd .tova-out && npx wrangler deploy --config wrangler.api.toml

# Deploy the processor worker
cd .tova-out && npx wrangler deploy --config wrangler.processor.toml
```

For local development:

```bash
npx wrangler dev .tova-out/pipeline.edge.api.js
```

Test the pipeline:

```bash
# Upload an image
curl -X POST http://localhost:8787/api/images \
  -H "X-API-Key: your-key" \
  -H "Content-Type: image/png" \
  --data-binary @photo.png

# Check status
curl -H "X-API-Key: your-key" http://localhost:8787/api/images/<id>

# Get pipeline stats
curl -H "X-API-Key: your-key" http://localhost:8787/api/stats
```

## What This Demonstrates

### Named Edge Blocks

The `edge "api"` and `edge "processor"` blocks compile to separate worker files. Each block has its own config, bindings, routes, and handlers. Named blocks let you split concerns -- the API handles HTTP requests while the processor handles queue messages.

### All Five Binding Types

This example uses every Cloudflare binding:

| Binding | Declaration | Usage |
|---------|------------|-------|
| **KV** | `kv METADATA` | Caching image metadata for fast lookups |
| **SQL** | `sql DB` | D1 database for durable image records |
| **Storage** | `storage IMAGES` | R2 bucket for original and processed image files |
| **Queue** | `queue PROCESS_QUEUE` | Async job dispatch from API to processor |
| **Env/Secret** | `env MAX_FILE_SIZE`, `secret API_KEY` | Configuration and credentials |

### Queue Producer/Consumer

The API worker **produces** messages with `PROCESS_QUEUE.send()`. The processor worker **consumes** them with `consume PROCESS_QUEUE fn(messages) { ... }`. The consumer receives batches of messages and processes each one. The generated `wrangler.toml` includes both `[[queues.producers]]` and `[[queues.consumers]]` sections.

### Wildcard Routes

The `route GET "/images/*path"` pattern captures everything after `/images/` into `params.path`. This serves both `originals/` and `processed/` image files from a single route.

### Health Check with Memory

The `health "/healthz" { check_memory }` block returns heap usage information alongside the status check, useful for monitoring worker memory consumption.

### Scheduled Reports

The `schedule "daily-report" cron("0 9 * * *")` block runs daily and queries the database for pipeline statistics. On Cloudflare, this compiles to a `scheduled()` handler that matches the cron expression.

### Wrangler.toml Generation

The compiler generates `wrangler.toml` files with all the binding configuration:

```toml
name = "pipeline-api"
main = "pipeline.edge.api.js"

[[kv_namespaces]]
binding = "METADATA"
id = "TODO_METADATA_ID"

[[d1_databases]]
binding = "DB"
database_name = "pipeline"
database_id = "TODO_DB_ID"

[[r2_buckets]]
binding = "IMAGES"
bucket_name = "images"

[[queues.producers]]
binding = "PROCESS_QUEUE"
queue = "process-queue"

[triggers]
crons = ["0 9 * * *"]
```

## Key Patterns

- **Separation of concerns** -- API and processor workers have different responsibilities and scale independently
- **Cache-aside with KV** -- fast metadata reads with database fallback
- **Async processing** -- uploads return immediately, processing happens in the background via queues
- **All bindings from one file** -- the compiler generates correct platform-specific initialization for each binding type
- **File size validation** -- check `arrayBuffer().byteLength` before storing

## What's Next

- Add webhook processing with a [Webhook Handler](./edge-webhook-handler.md)
- Start with a simpler example: [URL Shortener](./edge-url-shortener.md)
- Learn more in the [Edge Block guide](/fullstack/edge-block)
