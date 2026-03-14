<script setup>
const basicAsyncCode = `// async/await in Tova
async fn fetch_data(url) {
  // Simulated async operation
  await sleep(100)
  { url: url, status: 200, body: "Response from {url}" }
}

// Calling async functions
async fn main_flow() {
  result = await fetch_data("https://api.example.com/users")
  print("Status: {result.status}")
  print("Body: {result.body}")
}

main_flow()
print("Request started (async)")`

const parallelCode = `// Running async operations in parallel
async fn fetch_item(id) {
  await sleep(50)
  { id: id, name: "Item {id}", price: id * 10 }
}

// Sequential — slow (one after another)
async fn fetch_sequential() {
  start_time = Date.now()
  item1 = await fetch_item(1)
  item2 = await fetch_item(2)
  item3 = await fetch_item(3)
  elapsed = Date.now() - start_time
  print("Sequential: {elapsed}ms")
  print("Items: {item1.name}, {item2.name}, {item3.name}")
}

// Parallel — fast (all at once)
async fn fetch_parallel() {
  start_time = Date.now()
  items = await Promise.all([
    fetch_item(1),
    fetch_item(2),
    fetch_item(3)
  ])
  elapsed = Date.now() - start_time
  print("Parallel: {elapsed}ms")
  for item in items {
    print("  {item.name}: \${item.price}")
  }
}

fetch_sequential()
fetch_parallel()`

const errorAsyncCode = `// Error handling in async code
async fn fetch_user(id) {
  await sleep(50)
  if id <= 0 {
    Err("Invalid user ID: {id}")
  } elif id > 100 {
    Err("User not found: {id}")
  } else {
    Ok({ id: id, name: "User {id}" })
  }
}

async fn fetch_profile(user_id) {
  // Chain async operations with Result
  user_result = await fetch_user(user_id)

  match user_result {
    Ok(user) => {
      print("Found user: {user.name}")
      Ok(user)
    }
    Err(msg) => {
      print("Error: {msg}")
      Err(msg)
    }
  }
}

// Test with various IDs
async fn demo() {
  await fetch_profile(42)
  await fetch_profile(-1)
  await fetch_profile(999)
}

demo()`

const fetcherCode = `// PROJECT: Parallel Data Fetcher
// Fetch multiple resources concurrently with error handling

async fn fetch_resource(resource) {
  await sleep(toInt(Math.random() * 100))

  // Simulate occasional failures
  if Math.random() < 0.2 {
    Err("Network timeout for {resource}")
  } else {
    Ok({ resource: resource, data: "Data for {resource}", timestamp: Date.now() })
  }
}

async fn fetch_all_with_retry(resources, max_retries) {
  var results = []

  for resource in resources {
    var attempt = 0
    var success = false

    while attempt < max_retries && !success {
      attempt += 1
      result = await fetch_resource(resource)

      match result {
        Ok(data) => {
          results.push(data)
          success = true
        }
        Err(msg) => {
          if attempt < max_retries {
            print("  Retry {attempt}/{max_retries} for {resource}: {msg}")
          } else {
            print("  Failed after {max_retries} attempts: {resource}")
            results.push({ resource: resource, data: "FAILED", timestamp: 0 })
          }
        }
      }
    }
  }

  results
}

async fn demo() {
  resources = ["users", "posts", "comments", "settings", "analytics"]

  print("Fetching {len(resources)} resources (max 3 retries each)...")
  print("")

  results = await fetch_all_with_retry(resources, 3)

  print("")
  print("Results:")
  print(repeat("-", 40))
  for r in results {
    status = if r.data == "FAILED" { "FAILED" } else { "OK" }
    print("  {padEnd(r.resource, 12)} [{status}]")
  }

  succeeded = results |> filter(fn(r) r.data != "FAILED") |> len()
  print("")
  print("{succeeded}/{len(resources)} resources fetched successfully")
}

demo()`
</script>

# Chapter 10: Async Programming

Modern applications constantly wait — for network responses, file reads, database queries, timers. Async programming lets you do useful work during that waiting time. Tova uses `async`/`await` to make asynchronous code read almost like synchronous code.

By the end of this chapter, you'll build a parallel data fetcher with retry logic.

## async and await

Mark a function as `async` to enable `await` inside it:

```tova
async fn fetch_data(url) {
  await sleep(100)  // Simulated network delay
  { url: url, status: 200, body: "Response from {url}" }
}
```

`await` pauses the function until the async operation completes, then gives you the result. The rest of your program keeps running.

```tova
async fn main_flow() {
  // This pauses until the fetch completes
  result = await fetch_data("https://api.example.com/users")
  print("Status: {result.status}")
}

main_flow()
// Code here runs immediately — doesn't wait for main_flow
```

<TryInPlayground :code="basicAsyncCode" label="Basic Async" />

::: tip Understanding await
Think of `await` as "pause here until this is ready." The function suspends, other code runs, and when the result arrives, the function resumes right where it left off. No callbacks, no .then() chains.
:::

## Sequential vs. Parallel

The biggest async mistake is running things sequentially when they could be parallel.

### Sequential (Slow)

```tova
async fn get_dashboard() {
  users = await fetch_users()       // Wait...
  orders = await fetch_orders()     // Then wait...
  stats = await fetch_stats()       // Then wait...
  { users, orders, stats }
}
// Total time: fetch_users + fetch_orders + fetch_stats
```

Each `await` waits for the previous one to finish before starting the next.

### Parallel (Fast)

```tova
async fn get_dashboard() {
  results = await Promise.all([
    fetch_users(),
    fetch_orders(),
    fetch_stats()
  ])
  { users: results[0], orders: results[1], stats: results[2] }
}
// Total time: max(fetch_users, fetch_orders, fetch_stats)
```

`Promise.all` starts all operations at once and waits for all of them to complete.

<TryInPlayground :code="parallelCode" label="Sequential vs Parallel" />

### When to Use Which

**Sequential** when each step depends on the previous:
```tova
async fn process_order(order_id) {
  order = await fetch_order(order_id)          // Need order first
  user = await fetch_user(order.user_id)       // Need order to get user_id
  await send_email(user.email, order.summary)  // Need both
}
```

**Parallel** when operations are independent:
```tova
async fn load_page_data(user_id) {
  // These don't depend on each other
  results = await Promise.all([
    fetch_profile(user_id),
    fetch_notifications(user_id),
    fetch_recommendations(user_id)
  ])
  { profile: results[0], notifications: results[1], recommendations: results[2] }
}
```

## Error Handling in Async Code

Combine `async` with `Result` for robust error handling:

```tova
async fn safe_fetch(url) {
  result = await tryAsync(fn() fetch_data(url))
  match result {
    Ok(data) => Ok(data)
    Err(msg) => Err("Fetch failed for {url}: {msg}")
  }
}

async fn load_user(id) {
  result = await safe_fetch("/api/users/{id}")
  match result {
    Ok(data) => Ok(data)
    Err(msg) => Err("Failed to load user {id}: {msg}")
  }
}
```

<TryInPlayground :code="errorAsyncCode" label="Async Errors" />

### Handling Partial Failures

When running parallel operations, sometimes you want all results even if some fail:

```tova
async fn fetch_all_safe(urls) {
  promises = urls |> map(fn(url) safe_fetch(url))
  results = await Promise.all(promises)

  succeeded = results |> filter(fn(r) r.isOk())
  failed = results |> filter(fn(r) r.isErr())

  print("{len(succeeded)} succeeded, {len(failed)} failed")
  results
}
```

## sleep(ms) -- Pausing Execution

The `sleep(ms)` stdlib function pauses execution for a given number of milliseconds. It returns a promise that resolves after the delay:

```tova
async fn delayed_greeting() {
  print("Wait for it...")
  await sleep(1000)
  print("Hello!")
}
```

This is useful for delays, polling intervals, and simulated latency in tests. Since `sleep` is async, it does not block the event loop -- other code continues running while the function waits.

```tova
async fn countdown(n) {
  var i = n
  while i > 0 {
    print("{i}...")
    await sleep(1000)
    i -= 1
  }
  print("Go!")
}
```

## retry(fn, options) -- Retrying Operations

Tova's stdlib includes a `retry` function for retrying async operations that **throw exceptions** on failure:

```tova
result = await retry(fn() fetch_data(url), { times: 3, delay: 100 })
```

The first argument is a zero-argument function that performs the operation. The second is an options object:

| Option | Description | Default |
|--------|-------------|---------|
| `times` | Maximum number of attempts | `3` |
| `delay` | Milliseconds between retries | `100` |
| `backoff` | Multiplier applied to delay after each attempt | `1` |

`retry` returns the first successful result, or throws the final error if all attempts fail.

::: warning retry works with exceptions, not Result types
`retry` uses `try/catch` internally — it only retries when the function **throws an exception**. If your function returns `Err(...)` (Tova's idiomatic error handling), `retry` treats that as a successful return and won't retry. For functions that return `Result`, use a manual retry loop instead.
:::

For Tova-idiomatic error handling with `Result` types, build a manual retry loop:

```tova
async fn with_retry(operation, max_attempts) {
  var attempt = 0
  while attempt < max_attempts {
    attempt += 1
    result = await operation()
    match result {
      Ok(value) => { return Ok(value) }
      Err(msg) => {
        if attempt == max_attempts {
          return Err("Failed after {max_attempts} attempts: {msg}")
        }
        // Exponential backoff
        await sleep(100 * attempt)
      }
    }
  }
  Err("Exhausted retries")
}

// Usage
async fn fetch_with_retry(url) {
  await with_retry(fn() safe_fetch(url), 3)
}
```

::: tip When to Use retry vs. Manual Loops
Use `retry(fn, options)` when your async function signals failure by throwing (e.g., wrapping a JavaScript library). Use a manual loop when your function returns `Result` types, when you need exponential backoff, or when you want logging between retries.
:::

## timeout(promise, ms) -- Time-Limited Operations

The `timeout` stdlib function races a promise against a time limit. The first argument is a **promise** (not a function), and the second is the deadline in milliseconds. If the promise doesn't resolve in time, `timeout` throws a timeout error:

```tova
// Pass a promise (the call itself), not a function
async fn fetch_with_deadline(url) {
  result = await tryAsync(fn() timeout(fetch_data(url), 5000))

  match result {
    Ok(data) => print("Got data: {data}")
    Err(msg) => print("Error: {msg}")
    // msg will be "Timeout after 5000ms" if it times out
  }
}
```

Since `timeout` throws on expiry, wrap it with `try_async` to get a `Result`, or use `try/catch`:

```tova
async fn safe_timed_fetch(url) {
  try {
    data = await timeout(fetch_data(url), 3000)
    Ok(data)
  } catch err {
    Err("Request failed: {err}")
  }
}
```

This is essential for network requests, database queries, or any operation that might hang. Combine it with `retry` for robust data fetching (since both use exception-based error handling, they compose naturally):

```tova
async fn resilient_fetch(url) {
  await retry(fn() timeout(fetch_data(url), 3000), { times: 3, delay: 500 })
}
// Retries up to 3 times, each attempt limited to 3 seconds
```

## Async Iteration

Process items asynchronously one at a time:

```tova
async fn process_batch(items, processor) {
  var results = []
  for item in items {
    result = await processor(item)
    results.push(result)
  }
  results
}
```

Or in parallel batches (for rate limiting):

```tova
async fn process_in_batches(items, batch_size, processor) {
  var all_results = []

  var i = 0
  while i < len(items) {
    batch = items |> drop(i) |> take(batch_size)
    results = await Promise.all(batch |> map(processor))
    for r in results {
      all_results.push(r)
    }
    i += batch_size
  }

  all_results
}

// Process 100 items, 10 at a time
await process_in_batches(items, 10, fn(item) transform(item))
```

## Channels -- Async Communication

The `Channel` class provides a way for async producers and consumers to communicate. A channel is a queue: one side sends values, the other receives them:

```tova
ch = Channel.new()

// Producer
async fn produce(ch) {
  for i in range(5) {
    await ch.send(i)
  }
  ch.close()
}

// Consumer — async for iterates until channel is closed
async fn consume(ch) {
  async for value in ch {
    print("Got: {value}")
  }
  print("Channel closed")
}

// Run both concurrently
concurrent {
  _p = spawn produce(ch)
  _c = spawn consume(ch)
}
```

Channels implement `async for` iteration: the loop receives values until the channel is closed and drained. Under the hood, `receive()` returns `Some(value)` while the channel is open, and `None` after the producer calls `ch.close()`.

Channels are useful for:
- Decoupling producers from consumers
- Coordinating work between async tasks
- Building streaming data pipelines

```tova
// Pipeline: generate -> transform -> collect
source = Channel.new()
transformed = Channel.new()

async fn generate(source) {
  for i in range(10) {
    await source.send(i)
  }
  source.close()
}

async fn transform(source, transformed) {
  async for n in source {
    await transformed.send(n * n)
  }
  transformed.close()
}

async fn collect(transformed) {
  var results = []
  async for val in transformed {
    results.push(val)
  }
  print("Squares: {results}")
}

concurrent {
  _g = spawn generate(source)
  _t = spawn transform(source, transformed)
  _c = spawn collect(transformed)
}
```

::: tip Channels vs. Shared State
Use channels when tasks need to pass data in sequence (streaming, pipelines, work queues). Use shared state (stores, mutable variables) when tasks need random access to the same data.
:::

## parallel_map -- Worker Pool Processing

For CPU-intensive work across many items, `parallel_map` distributes tasks across a persistent worker pool:

```tova
results = await parallelMap(urls, fn(url) fetch(url), 4)
// Processes up to 4 URLs concurrently using persistent worker threads
```

The third argument is the number of worker threads (defaults to CPU core count if omitted):

```tova
parallelMap(array, transform_fn)        // uses all CPU cores
parallelMap(array, transform_fn, 4)     // uses 4 worker threads
```

Workers are **persistent** -- they are created once and reused across calls, avoiding the overhead of spinning up new threads for each batch. This gives significant speedups for workloads with many small tasks.

```tova
// Process 1000 images using 8 worker threads
processed = await parallelMap(
  images,
  fn(img) resize_image(img, 800, 600),
  8
)
print("Processed {len(processed)} images")
```

### When to Use parallel_map vs. Promise.all

| Scenario | Use |
|----------|-----|
| I/O-bound tasks (fetch, DB queries) | `Promise.all` or `concurrent { }` |
| CPU-bound tasks (image processing, parsing) | `parallel_map` |
| Need to limit concurrency | `parallel_map` with worker count |
| Dynamic number of heavy tasks | `parallel_map` |

::: tip Performance
`parallel_map` uses real OS threads (worker threads), not just async scheduling. For CPU-heavy work like data transformation, compression, or number crunching, it can achieve near-linear speedups -- a 4-worker pool can be 3.5x faster than sequential processing.
:::

## Concurrent Blocks

Tova provides `concurrent` blocks for structured concurrency — a safer, more readable alternative to `Promise.all`:

### Basic Concurrent Block

```tova
concurrent {
  users = spawn fetch_users()
  orders = spawn fetch_orders()
  stats = spawn fetch_stats()
}
// All three ran in parallel
// Each result is wrapped in Ok/Err — use match to unwrap
match users {
  Ok(list) => print("Got {len(list)} users")
  Err(e) => print("Failed to fetch users: {e}")
}
```

The `spawn` keyword starts each operation concurrently. The block waits for **all** spawned tasks to complete before continuing. Variables assigned via `spawn` are available after the block, wrapped in `Ok(value)` on success or `Err(error)` if the task threw an exception.

### Concurrent Modes

Concurrent blocks support different completion strategies:

```tova
// Default: wait for ALL tasks (each result is Ok or Err)
concurrent {
  a = spawn task_a()
  b = spawn task_b()
}

// cancel_on_error: abort all if any fails
concurrent cancel_on_error {
  data = spawn fetch_critical_data()
  config = spawn load_config()
}
// If either throws, the other is cancelled

// first: take the first result, cancel the rest
concurrent first {
  result = spawn fetch_from_primary()
  fallback = spawn fetch_from_backup()
}
// Resolves with whichever finishes first

// timeout: cancel all tasks if total time exceeds a limit
concurrent timeout(5000) {
  data = spawn fetch_data()
  backup = spawn fetch_backup()
}
// Cancels all tasks if total time exceeds 5 seconds
```

The `timeout` mode is particularly valuable for operations that must complete within a deadline. If the timeout elapses, all spawned tasks are cancelled and the block returns with an error. Combine it with `cancel_on_error` patterns to build robust data-fetching pipelines:

```tova
concurrent timeout(3000) {
  user = spawn fetch_user(id)
  prefs = spawn fetch_preferences(id)
  history = spawn fetch_history(id)
}
// All three must complete within 3 seconds, or none of them count
// Each variable holds Ok(value) or Err(error)
match user {
  Ok(u) => print("User: {u.name}")
  Err(e) => print("Failed or timed out: {e}")
}
```

### When to Use Concurrent Blocks vs. Promise.all

| Scenario | Use |
|----------|-----|
| Simple parallel operations | `concurrent { }` |
| Need to cancel on first failure | `concurrent cancel_on_error { }` |
| Race between alternatives | `concurrent first { }` |
| Must complete within a deadline | `concurrent timeout(ms) { }` |
| Dynamic number of parallel tasks | `Promise.all(items \|> map(fn))` |
| Fine-grained Promise control | `Promise.all` or `Promise.race` |

::: tip Structured Concurrency
Concurrent blocks guarantee that all spawned tasks complete (or are cancelled) before execution continues past the block. This prevents "fire and forget" bugs where background tasks outlive their expected lifetime.
:::

## Select: Racing Multiple Operations

The `select` statement races multiple async operations and executes the branch for whichever completes first:

```tova
select {
  msg from channel => {
    print("Got message: {msg}")
  }
  timeout(5000) => {
    print("Timed out after 5 seconds")
  }
  _ => {
    print("Default case")
  }
}
```

Each arm uses one of the following forms:
- `binding from channel =>` — receive a value from a channel
- `_ from channel =>` — receive from a channel (discard value)
- `channel.send(value) =>` — send a value to a channel
- `timeout(ms) =>` — trigger after a delay
- `_ =>` — default case

The first operation to complete wins — the rest are cancelled. This is similar to Go's `select` statement.

### Common select Patterns

**Timeout with fallback:**

```tova
select {
  result from data_channel => {
    print("Operation completed: {result}")
  }
  timeout(3000) => {
    print("Operation timed out, using default")
  }
}
```

**User cancellation:**

```tova
select {
  data from download_channel => {
    save(data)
  }
  _ from cancel_signal => {
    print("Download cancelled by user")
  }
}
```

**Send or timeout:**

```tova
select {
  output_channel.send(result) => {
    print("Sent result to output")
  }
  timeout(1000) => {
    print("Send timed out")
  }
}
```

::: tip select vs concurrent first
`select` is for choosing between fundamentally different channel operations (a receive vs. a send vs. a timeout). `concurrent first` is for racing similar operations (fetching from multiple mirrors). Use whichever reads more naturally for your use case.
:::

## Project: Parallel Data Fetcher

Let's build a robust fetcher that handles retries, timeouts, and partial failures:

```tova
async fn fetch_resource(resource) {
  await sleep(toInt(Math.random() * 100))
  if Math.random() < 0.2 {
    Err("Network timeout for {resource}")
  } else {
    Ok({ resource: resource, data: "Data for {resource}" })
  }
}

async fn fetch_all_with_retry(resources, max_retries) {
  var results = []

  for resource in resources {
    var attempt = 0
    var success = false

    while attempt < max_retries && !success {
      attempt += 1
      result = await fetch_resource(resource)

      match result {
        Ok(data) => {
          results.push(data)
          success = true
        }
        Err(msg) => {
          if attempt < max_retries {
            print("  Retry {attempt}/{max_retries}: {msg}")
          } else {
            results.push({ resource: resource, data: "FAILED" })
          }
        }
      }
    }
  }

  results
}

async fn demo() {
  resources = ["users", "posts", "comments", "settings", "analytics"]
  print("Fetching {len(resources)} resources...")

  results = await fetch_all_with_retry(resources, 3)

  succeeded = results |> filter(fn(r) r.data != "FAILED") |> len()
  print("{succeeded}/{len(resources)} succeeded")
}

demo()
```

<TryInPlayground :code="fetcherCode" label="Parallel Fetcher" />

## Exercises

**Exercise 10.1:** Write an `async fn race_fetch(urls)` that fetches all URLs in parallel and returns the **first** successful result, ignoring the rest. If all fail, return `Err` with all error messages.

**Exercise 10.2:** Implement `async fn throttled_map(items, concurrency, fn)` that processes items with at most `concurrency` operations running at the same time. For example, `throttled_map(urls, 3, fetch)` fetches at most 3 URLs simultaneously.

**Exercise 10.3:** Build a simple cache layer: `async fn cached_fetch(url, cache, ttl_ms)` that checks the cache first, and only fetches if the cached value is missing or expired. The cache should be a mutable object passed as an argument.

## Challenge

Build an **async pipeline processor** where each stage runs concurrently. Given a series of stage functions (each async), set up a processing pipeline where:
1. Stage 1 processes items and passes them to Stage 2
2. Stage 2 processes in parallel with Stage 1's next item
3. Each stage has a configurable concurrency limit
4. Failed items go to a dead-letter queue
5. Print progress updates as items flow through stages

---

[← Previous: Modules and Architecture](./modules) | [Next: Performance Secrets →](./performance)
