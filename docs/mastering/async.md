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
    print("  {item.name}: ${item.price}")
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
  await sleep(to_int(Math.random() * 100))

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
    print("  {pad_end(r.resource, 12)} [{status}]")
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
  response = await http_get(url)
  response.body
}
```

`await` pauses the function until the async operation completes, then gives you the result. The rest of your program keeps running.

```tova
async fn main_flow() {
  // This pauses until the fetch completes
  data = await fetch_data("https://api.example.com/users")
  print("Got {len(data)} users")
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
  try {
    response = await http_get(url)
    if response.status == 200 {
      Ok(response.body)
    } else {
      Err("HTTP {response.status}")
    }
  } catch err {
    Err("Network error: {err}")
  }
}

async fn load_user(id) {
  result = await safe_fetch("/api/users/{id}")
  match result {
    Ok(data) => Ok(parse_json(data))
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

## Retry Pattern

For unreliable operations, implement retry logic:

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
        // Wait before retrying (exponential backoff)
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

## Timeout Pattern

Don't let async operations hang forever:

```tova
async fn with_timeout(operation, ms) {
  timeout_promise = async fn() {
    await sleep(ms)
    Err("Timeout after {ms}ms")
  }

  await Promise.race([
    operation(),
    timeout_promise()
  ])
}
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
await process_in_batches(items, 10, fn(item) process(item))
```

## Concurrent Blocks

Tova provides a `concurrent` block for structured concurrency:

```tova
concurrent {
  users = spawn fetch_users()
  orders = spawn fetch_orders()
  stats = spawn fetch_stats()
}
// All three run in parallel
// users, orders, stats are available here
```

The `spawn` keyword starts each operation concurrently. The block waits for all spawned tasks to complete before continuing.

## Project: Parallel Data Fetcher

Let's build a robust fetcher that handles retries, timeouts, and partial failures:

```tova
async fn fetch_resource(resource) {
  await sleep(to_int(Math.random() * 100))
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
