# Task Queue

This example demonstrates async patterns and error resilience in Tova: sequential vs parallel execution, Result-based error handling for async operations, retry logic, concurrency-limited task queues, defer for cleanup, and error aggregation across parallel work.

## The Full Application

```tova
shared {
  type TaskStatus { Pending, Running, Completed, Failed(reason: String) }

  type TaskResult<T> {
    id: String
    status: TaskStatus
    value: Option<T>
    attempts: Int
    duration_ms: Int
  }

  type RetryConfig {
    max_attempts: Int
    delay_ms: Int
    backoff: Float
  }
}

// --- Sequential vs Parallel Async ---

fn fetch_user(id: Int) {
  response = await fetch("https://api.example.com/users/{id}")
  match response.ok {
    true => Ok(await response.json())
    false => Err("Failed to fetch user {id}: {response.status}")
  }
}

fn fetch_posts(user_id: Int) {
  response = await fetch("https://api.example.com/users/{user_id}/posts")
  match response.ok {
    true => Ok(await response.json())
    false => Err("Failed to fetch posts: {response.status}")
  }
}

// Sequential: each step depends on the previous
fn get_user_with_posts(id: Int) {
  user = fetch_user(id)!
  posts = fetch_posts(user.id)!
  Ok({ user: user, posts: posts })
}

// Parallel: independent fetches run concurrently
fn get_dashboard_data() {
  results = await Promise.all([
    fetch("https://api.example.com/users") |> then(fn(r) r.json()),
    fetch("https://api.example.com/stats") |> then(fn(r) r.json()),
    fetch("https://api.example.com/alerts") |> then(fn(r) r.json())
  ])
  users = results[0]
  stats = results[1]
  alerts = results[2]
  Ok({ users: users, stats: stats, alerts: alerts })
}

// --- Async Result Patterns ---

fn safe_fetch(url: String) -> Result<any, String> {
  var result = Err("Network error: unknown")
  try {
    response = await fetch(url)
    result = match response.ok {
      true => Ok(await response.json())
      false => Err("HTTP {response.status}: {response.statusText}")
    }
  } catch err {
    result = Err("Network error: {err.message}")
  }
  result
}

fn fetch_and_transform(url: String) -> Result<[String], String> {
  safe_fetch(url)
    |> map(fn(data) data.items)
    |> map(fn(items) items |> map(fn(i) i.name))
    |> mapErr(fn(e) "Transform failed: {e}")
}

fn fetch_with_fallback(primary: String, fallback: String) -> Result<any, String> {
  match safe_fetch(primary) {
    Ok(data) => Ok(data)
    Err(_) => safe_fetch(fallback)
      |> mapErr(fn(e) "Both primary and fallback failed: {e}")
  }
}

// --- Retry Logic ---

fn default_retry_config() -> RetryConfig {
  RetryConfig {
    max_attempts: 3,
    delay_ms: 1000,
    backoff: 2.0
  }
}

fn with_retry(operation: () -> Result<any, String>, config: RetryConfig) -> Result<any, String> {
  var attempt = 1
  var delay = config.delay_ms
  var last_error = ""
  var final_result = Err("")
  var done = false

  while attempt <= config.max_attempts and not done {
    match operation() {
      Ok(value) => {
        final_result = Ok(value)
        done = true
      }
      Err(err) => {
        last_error = err
        match attempt < config.max_attempts {
          true => {
            print("Attempt {attempt}/{config.max_attempts} failed: {err}. Retrying in {delay}ms...")
            await sleep(delay)
            delay = (delay |> to_float() * config.backoff) |> to_int()
            attempt = attempt + 1
          }
          false => {
            attempt = attempt + 1
          }
        }
      }
    }
  }

  match done {
    true => final_result
    false => Err("Failed after {config.max_attempts} attempts. Last error: {last_error}")
  }
}

fn fetch_with_retry(url: String) -> Result<any, String> {
  with_retry(
    fn() safe_fetch(url),
    default_retry_config()
  )
}

fn fetch_with_custom_retry(url: String) -> Result<any, String> {
  config = RetryConfig { max_attempts: 5, delay_ms: 500, backoff: 1.5 }
  with_retry(
    fn() safe_fetch(url),
    config
  )
}

// --- Parallel Task Processing with Error Isolation ---

fn process_batch(items, processor) {
  results = await Promise.all(
    items |> map(fn(item) {
      match processor(item) {
        Ok(value) => { success: true, value: Some(value), error: None, item: item }
        Err(err) => { success: false, value: None, error: Some(err), item: item }
      }
    })
  )

  succeeded = results
    |> filter(fn(r) r.success)
    |> map(fn(r) r.value |> unwrap())

  failed = results
    |> filter(fn(r) !r.success)
    |> map(fn(r) { item: r.item, error: r.error |> unwrap() })

  { succeeded: succeeded, failed: failed }
}

fn process_urls(urls: [String]) {
  process_batch(urls, fn(url) safe_fetch(url))
}

// --- Defer for Cleanup ---

fn process_with_lock(resource_id: String) -> Result<String, String> {
  lock = await acquire_lock(resource_id)
  defer { release_lock(lock) }

  // Even if this fails, the lock is released
  data = safe_fetch("https://api.example.com/resources/{resource_id}")!
  processed = transform(data)!

  Ok(processed)
}

fn write_with_cleanup(path: String, data: String) -> Result<String, String> {
  file = await open_file(path, "w")
  defer { close_file(file) }

  await write_file(file, data)
  Ok("Written to {path}")
}

fn with_temp_file(operation: (String) -> Result<any, String>) -> Result<any, String> {
  tmp_path = "/tmp/tova-{uuid()}"
  defer { delete_file(tmp_path) }

  operation(tmp_path)
}

// --- Task Queue with Concurrency Limits ---

type Task<T> {
  id: String
  execute: () -> Result<T, String>
  retry_config: Option<RetryConfig>
}

fn run_queue(tasks: [Task], concurrency: Int) -> [TaskResult] {
  var results = []
  var queue = tasks
  var active = 0

  fn process_next() {
    match queue |> len() {
      0 => {}
      _ => {
        task = queue[0]
        queue = queue |> slice(1)
        active = active + 1

        start = Date.now()

        result = match task.retry_config {
          Some(config) => with_retry(task.execute, config)
          None => task.execute()
        }

        duration = Date.now() - start

        task_result = match result {
          Ok(value) => TaskResult {
            id: task.id,
            status: Completed,
            value: Some(value),
            attempts: 1,
            duration_ms: duration
          }
          Err(reason) => TaskResult {
            id: task.id,
            status: Failed(reason),
            value: None,
            attempts: task.retry_config |> map(fn(c) c.max_attempts) |> unwrapOr(1),
            duration_ms: duration
          }
        }

        results = [...results, task_result]
        active = active - 1
        process_next()
      }
    }
  }

  // Start up to `concurrency` tasks in parallel
  count = Math.min(concurrency, tasks |> len())
  range(0, count) |> each(fn(_) process_next())

  results
}

// --- Error Aggregation ---

type ErrorEntry {
  id: String
  error: String
}

type BatchReport<T> {
  total: Int
  succeeded: Int
  failed: Int
  results: [TaskResult<T>]
  errors: [ErrorEntry]
}

fn run_and_report(tasks: [Task], concurrency: Int) -> BatchReport {
  results = run_queue(tasks, concurrency)

  succeeded = results |> filter(fn(r) match r.status { Completed => true, _ => false })
  failed_results = results |> filter(fn(r) match r.status { Failed(_) => true, _ => false })

  errors = failed_results |> map(fn(r) {
    reason = match r.status {
      Failed(reason) => reason
      _ => "Unknown"
    }
    { id: r.id, error: reason }
  })

  BatchReport {
    total: results |> len(),
    succeeded: succeeded |> len(),
    failed: failed_results |> len(),
    results: results,
    errors: errors
  }
}

// --- Example Usage ---

fn main(args: [String]) {
  // Sequential fetch with error propagation
  match get_user_with_posts(1) {
    Ok(data) => print("User: {data.user.name}, Posts: {data.posts |> len()}")
    Err(e) => print("Error: {e}")
  }

  // Parallel fetch with retry
  match fetch_with_retry("https://api.example.com/data") {
    Ok(data) => print("Fetched: {data}")
    Err(e) => print("Failed after retries: {e}")
  }

  // Batch processing with error isolation
  urls = [
    "https://api.example.com/a",
    "https://api.example.com/b",
    "https://api.example.com/c"
  ]
  batch = process_urls(urls)
  print("Succeeded: {batch.succeeded |> len()}, Failed: {batch.failed |> len()}")

  // Task queue with concurrency limit
  tasks = urls |> map(fn(url) Task {
    id: url,
    execute: fn() safe_fetch(url),
    retry_config: Some(default_retry_config())
  })

  report = run_and_report(tasks, 5)
  print("Batch: {report.succeeded}/{report.total} succeeded")
  report.errors |> each(fn(e) print("  Failed: {e.id} - {e.error}"))
}
```

## Running It

```bash
tova run tasks.tova
```

## What This Demonstrates

### Sequential vs Parallel Async

Sequential — each step depends on the previous:

```tova
user = fetch_user(id)!        // Wait for user
posts = fetch_posts(user.id)! // Then fetch posts (needs user.id)
```

Parallel — independent operations run concurrently:

```tova
results = await Promise.all([
  fetch("/users") |> then(fn(r) r.json()),
  fetch("/stats") |> then(fn(r) r.json()),
  fetch("/alerts") |> then(fn(r) r.json())
])
users = results[0]
stats = results[1]
alerts = results[2]
```

Use `!` propagation for sequential chains. Use `Promise.all` for independent fetches.

### Async Result Patterns

Wrap `fetch` in `Result` for type-safe error handling:

```tova
fn safe_fetch(url: String) -> Result<any, String> {
  var result = Err("Network error: unknown")
  try {
    response = await fetch(url)
    result = match response.ok {
      true => Ok(await response.json())
      false => Err("HTTP {response.status}")
    }
  } catch err {
    result = Err("Network error: {err.message}")
  }
  result
}
```

Then chain with `map`, `flatMap`, and `mapErr`:

```tova
safe_fetch(url)
  |> map(fn(data) data.items)
  |> mapErr(fn(e) "Transform failed: {e}")
```

### Retry with Exponential Backoff

```tova
fn with_retry(operation: () -> Result<any, String>, config: RetryConfig) -> Result<any, String>
```

The retry function accepts any `() -> Result<T, String>` operation and a config with max attempts, initial delay, and backoff multiplier. Each failed attempt waits longer before retrying.

### Defer for Cleanup

```tova
fn process_with_lock(resource_id: String) -> Result<String, String> {
  lock = await acquire_lock(resource_id)
  defer { release_lock(lock) }

  data = safe_fetch(url)!    // If this fails...
  processed = transform(data)!  // ...or this fails...
  Ok(processed)               // ...the lock is still released
}
```

`defer` guarantees cleanup code runs when the function exits, regardless of whether it succeeds or fails. It works like `finally` but scoped to the function.

### Error Isolation in Parallel Work

```tova
fn process_batch(items, processor) -> {
  succeeded: [any],
  failed: [{ item: any, error: String }]
}
```

Each item is processed independently. Failures don't stop other items from completing. Results are partitioned into succeeded and failed.

### Task Queue with Concurrency Limits

```tova
tasks = urls |> map(fn(url) Task {
  id: url,
  execute: fn() safe_fetch(url),
  retry_config: Some(default_retry_config())
})

report = run_and_report(tasks, 5)  // Max 5 concurrent
```

The queue runs up to `concurrency` tasks at a time. Each task can optionally have retry configuration. Results are aggregated into a `BatchReport`.

## Key Patterns

**`!` for sequential, `Promise.all` for parallel.** Choose based on whether operations depend on each other.

**Result wrapping.** Wrap all async I/O in `Result` at the boundary. Then use `map`/`flatMap`/`mapErr` for transformation chains.

**Retry as a combinator.** `with_retry` takes any operation and a config. It's generic over the return type and reusable across different operations.

**Defer for guaranteed cleanup.** Locks, file handles, temp files — anything that must be released regardless of success or failure.

**Error aggregation.** Don't fail the batch on one error. Collect all results, partition into succeeded/failed, and report.
