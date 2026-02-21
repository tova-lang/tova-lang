# Tova Design Patterns

A reference guide for architectural decisions in Tova applications. Each section presents a pattern, when to use it, and common anti-patterns to avoid.

## The Four-Block Pattern

Every Tova application uses up to four block types. Each has a clear responsibility:

| Block | Runs On | Purpose |
|-------|---------|---------|
| `shared {}` | Both | Types, validation, constants, pure utility functions |
| `data {}` | Server | Sources, pipelines, validation rules, refresh policies |
| `server {}` | Server | Routes, middleware, database, AI, background jobs, events |
| `client {}` | Browser | State, computed, effects, stores, components |

### What Belongs Where

**shared** — Put it here if both server and client need it:
- Type definitions (the data contract)
- Validation functions (run on client for UX, on server for security)
- Constants and enums
- Pure utility functions (no I/O, no state)

**data** — Put it here if it's about loading, cleaning, or transforming data:
- `source` declarations for files, URLs, databases
- `pipeline` chains for cleaning and aggregation
- `validate` blocks for data quality rules
- `refresh` policies for periodic reloading

**server** — Put it here if it needs server resources:
- Route handlers and middleware
- Database models and queries
- AI provider configuration and calls
- Background jobs, scheduled tasks, event bus
- Server-side state (`var` declarations)

**client** — Put it here if it's about the UI:
- Reactive state (`state` declarations)
- Computed values and effects
- Stores for encapsulated state groups
- Components and event handlers

### Anti-Patterns

| Anti-Pattern | Problem | Fix |
|-------------|---------|-----|
| Types in server/client | Duplicated, can drift | Move to `shared {}` |
| Business logic in client | Bypassable, insecure | Move validation to server; shared for both |
| AI calls in client | Exposes API keys | Always call AI in `server {}` |
| Data pipelines in server functions | Repeated computation | Define in `data {}`, reference by name |
| State in shared | shared is stateless | Use server `var` or client `state` |

## State Management

### State vs Store vs Server State

| Mechanism | Scope | Use When |
|-----------|-------|----------|
| `state x = value` | Single component or client-global | Simple reactive values, form inputs, UI toggles |
| `store Name {}` | Client-global, encapsulated | Related state + computed + functions that belong together |
| `var x = value` (server) | Server-global, mutable | Server-side caches, session data, counters |
| `data { source/pipeline }` | Server-global, declarative | Data loaded from files/APIs, transformed datasets |

### Decision Guide

```
Is it UI-only? → state or store (client)
Is it shared data? → data block
Is it server-side mutable state? → server var
Do multiple states + computations belong together? → store
Is it a single independent value? → state
```

### Store Design

A well-designed store has:
- **State**: The raw data it manages
- **Computed**: Derived values that auto-update
- **Functions**: Mutations that maintain invariants

```tova
store CartStore {
  state items: [CartItem] = []              // Raw data
  computed total = items |> map(...) |> sum() // Derived
  fn add(product: Product) { ... }          // Mutation with logic
  fn clear() { items = [] }                 // Simple mutation
}
```

**Anti-pattern:** A store with only state and no computed values or functions. Just use `state` directly.

## Data Flow

### Data Block Layering

Structure data blocks as layers:

```
source (raw) → pipeline (clean) → pipeline (aggregate) → pipeline (enrich)
```

Each layer has one job:

```tova
data {
  source raw = read("data.csv")                     // Raw input
  pipeline clean = raw |> drop_nil(.id) |> trim()   // Cleaning
  pipeline grouped = clean |> group_by(.cat) |> agg() // Aggregation
  pipeline enriched = clean |> derive(.label = ai.classify(...)) // Enrichment
}
```

Server functions reference the layer they need:
- Detail views → `clean` (individual rows)
- Dashboard summaries → `grouped` (aggregated stats)
- AI-enhanced views → `enriched` (with AI fields)

### Server Function Interaction

Server functions can:
- Reference pipelines by name: `fn get_data() { clean }`
- Apply dynamic filters: `clean |> where(.category == cat)`
- Call AI providers: `smart.ask(...)`
- Access database models: `User.all()`
- Publish events: `publish("event_name", data)`

### Client-Side vs Server-Side Data

| Client-Side | Server-Side |
|-------------|-------------|
| Instant filtering (computed) | Complex queries (models) |
| Small datasets (<1000 rows) | Large datasets |
| UI state (search, selected) | Persistent state (database) |
| Optimistic updates | Source of truth |

## Error Handling

### Result/Option Decision Matrix

| Situation | Use | Example |
|-----------|-----|---------|
| Operation that can fail | `Result<T, E>` | `fn parse(s) -> Result<Int, String>` |
| Value that may not exist | `Option<T>` | `fn find(id) -> Option<User>` |
| External I/O (fetch, db) | `Result` with `try/catch` wrapping | `safe_fetch(url) -> Result` |
| Collection lookup | `Option` | `list |> first() -> Option<T>` |
| Validation chain | `Result` with guards | `guard x > 0 else { return Err(...) }` |
| Multiple possible errors | `Result` with typed errors | `Result<T, ValidationError>` |

### Handling Strategies

**`?` propagation** — Bail on first error. Use for sequential chains:

```tova
fn process(id: Int) -> Result<String, String> {
  user = find_user(id)?     // Returns Err if not found
  profile = build_profile(user)?
  Ok(profile.name)
}
```

**`match` — Branch on success/failure:**

```tova
match result {
  Ok(value) => handle_success(value)
  Err(err) => handle_error(err)
}
```

**`unwrapOr` — Provide a default:**

```tova
name = find_user(id) |> map(fn(u) u.name) |> unwrapOr("Guest")
```

**Collect all errors — Run all validations, gather failures:**

```tova
errors = [validate_name(n), validate_email(e), validate_age(a)]
  |> filter(fn(r) r |> is_err())
  |> map(fn(r) r |> unwrap_err())
```

## AI Patterns

### Fast/Smart Model Strategy

```tova
ai "fast" { model: "claude-haiku" }    // Cheap, fast: classification, extraction
ai "smart" { model: "claude-sonnet" }  // Capable: summaries, analysis, complex reasoning
```

| Task | Model | Method |
|------|-------|--------|
| Bulk classification | fast | `classify()` |
| Sentiment analysis | fast | `classify()` |
| Keyword extraction | fast | `extract()` |
| Detailed summaries | smart | `ask()` |
| Complex analysis | smart | `chat()` with tools |
| Embeddings | fast | `embed()` |

### Caching AI Results

AI calls in `data {}` pipelines are cached with the pipeline. Use `refresh` policies to control re-evaluation:

```tova
data {
  pipeline enriched = articles
    |> derive(.category = fast.classify(...))

  refresh articles every 1.hour  // AI enrichment runs hourly, not per-request
}
```

### Fallback Chains

```tova
ai "primary" { provider: "anthropic", model: "claude-sonnet" }
ai "fallback" { provider: "ollama", model: "llama3" }

fn analyze(text: String) -> String {
  match try { primary.ask(text) } catch { Err(_) } {
    Ok(result) => result
    Err(_) => fallback.ask(text)
  }
}
```

## Component Patterns

### Composition

Break complex UIs into focused components:

```tova
component App {
  <div>
    <Header />
    <main>
      {match view {
        "list" => <ItemList />
        "detail" => <ItemDetail />
      }}
    </main>
    <Footer />
  </div>
}
```

Each component manages its own rendering logic. Pass data through props.

### Render Delegation

Components can delegate rendering based on data:

```tova
component StatusBadge(status: OrderStatus) {
  <span class={match status {
    Pending => "badge-yellow"
    Shipped(_) => "badge-blue"
    Delivered => "badge-green"
    Cancelled(_) => "badge-red"
    _ => "badge-gray"
  }}>
    {match status {
      Pending => "Pending"
      Shipped(tracking) => "Shipped: {tracking}"
      Delivered => "Delivered"
      Cancelled(reason) => "Cancelled: {reason}"
      _ => "Unknown"
    }}
  </span>
}
```

### Conditional Rendering

```tova
// if for presence/absence
{if show_details { <Details /> }}

// match for multiple states
{match loading {
  true => <Spinner />
  false => <Content />
}}

// Option matching
{match selected {
  Some(item) => <ItemView item={item} />
  None => <EmptyState />
}}
```

## Validation Patterns

### Shared Validation

Define validation in `shared {}` so it runs on both client and server:

```tova
shared {
  fn validate_email(email: String) -> Result<String, String> {
    guard email |> contains("@") else { return Err("Invalid email") }
    Ok(email |> lower() |> trim())
  }
}
```

Client uses it for instant feedback. Server uses it as a security check.

### Refinement Types vs Guards vs Validate Blocks

| Mechanism | When to Use | Scope |
|-----------|------------|-------|
| Refinement type | Constraint is part of the domain model | Type definition |
| Guard clause | Validation in a function with early return | Function body |
| Validate block | Data quality rules for table rows | Data block |

```tova
// Refinement type: constraint at the type level
type Email = String where { it |> contains("@") }

// Guard: validation with early return
fn create_user(email: String) {
  guard email |> contains("@") else { return Err("Invalid") }
}

// Validate block: rules for data rows
data { validate Customer { .email |> contains("@") } }
```

## Middleware Patterns

### Composition Ordering

Middleware runs in declaration order. Global middleware runs first, then per-route middleware:

```
request_id → logger → cors → auth → require_role → handler
(global)     (global) (global) (per-route) (per-route)
```

### Per-Route vs Global

```tova
// Global — runs on every request
middleware fn logger(req, res) { ... }

// Per-route — only on specific routes
route GET "/api/admin" => admin_panel with auth, require_role("admin")
route GET "/api/public" => public_data  // No auth needed
```

## Real-Time Patterns

### SSE vs WebSocket

| Feature | SSE | WebSocket |
|---------|-----|-----------|
| Direction | Server → Client | Bidirectional |
| Reconnection | Automatic | Manual |
| Use Case | Notifications, feeds | Chat, live data, commands |
| Protocol | HTTP | WS |
| Browser Support | Native EventSource | Native WebSocket |

**Use SSE when:** Clients only receive data (alerts, notifications, status updates).

**Use WebSocket when:** Clients need to send data too (chat messages, commands, subscriptions).

```tova
// SSE: one-way push
sse "/events" fn(send, close) { ... }

// WebSocket: bidirectional
websocket "/ws" {
  on_open(ws) { ... }
  on_message(ws, msg) { ... }
}
```
