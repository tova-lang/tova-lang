# Async & Error Handling

Tova provides utility functions for working with asynchronous code and wrapping fallible operations into Result types.

## Error Handling

### try_fn

```tova
try_fn(fn) -> Result
```

Wraps a synchronous function call in a try/catch and returns `Ok(value)` on success or `Err(message)` on failure.

```tova
try_fn(fn() to_int("42"))
// Ok(42)

try_fn(fn() {
  data = json_parse("bad json").unwrap()
  data.name
})
// Err("Called unwrap on Err: ...")
```

```tova
// Safe division
fn safe_divide(a, b) {
  try_fn(fn() {
    assert(b != 0, "division by zero")
    a / b
  })
}

safe_divide(10, 2)    // Ok(5)
safe_divide(10, 0)    // Err("division by zero")
```

### try_async

```tova
try_async(fn) -> Promise[Result]
```

Wraps an async function call in a try/catch and returns a Promise of `Ok(value)` or `Err(message)`.

```tova
result = await try_async(fn() fetch("/api/data"))
match result {
  Ok(response) => process(response)
  Err(msg) => print("Request failed: {msg}")
}
```

---

## Concurrency

### parallel

```tova
parallel(list) -> Promise[List]
```

Runs multiple promises concurrently and waits for all to complete. A wrapper around `Promise.all`.

```tova
results = await parallel([
  fetch("/api/users"),
  fetch("/api/posts"),
  fetch("/api/comments")
])
// [users_response, posts_response, comments_response]
```

### timeout

```tova
timeout(promise, ms) -> Promise
```

Adds a timeout to a promise. If the promise does not resolve within `ms` milliseconds, it rejects with a timeout error.

```tova
// Fail if API takes longer than 5 seconds
result = await try_async(fn() {
  timeout(fetch("/api/slow-endpoint"), 5000)
})

match result {
  Ok(data) => process(data)
  Err(msg) => print("Timed out or failed: {msg}")
}
```

### retry

```tova
retry(fn, opts?) -> Promise
```

Retries an async function up to `times` attempts with configurable delay and exponential backoff.

Options:
- `times` -- number of attempts (default: 3)
- `delay` -- base delay in ms between retries (default: 100)
- `backoff` -- multiplier for exponential backoff (default: 1)

```tova
// Retry up to 3 times with default settings
data = await retry(fn() fetch("/api/unreliable"))

// Retry 5 times with exponential backoff
data = await retry(
  fn() fetch("/api/flaky"),
  { times: 5, delay: 200, backoff: 2 }
)
// Delays: 200ms, 400ms, 800ms, 1600ms between retries
```

---

## Date & Time

### now

```tova
now() -> Int
```

Returns the current timestamp in milliseconds since the Unix epoch.

```tova
start = now()
// ... do work ...
elapsed = now() - start
print("Took {elapsed}ms")
```

### now_iso

```tova
now_iso() -> String
```

Returns the current date and time as an ISO 8601 string.

```tova
now_iso()
// "2024-01-15T10:30:00.000Z"

log_entry = { timestamp: now_iso(), message: "Server started" }
```

---

## Pipeline Examples

```tova
// Fetch with retry and timeout, returning Result
await try_async(fn() {
  retry(fn() timeout(fetch("/api/data"), 3000), { times: 3 })
})

// Parallel fetch with error handling
urls = ["/api/a", "/api/b", "/api/c"]
results = await parallel(
  map(urls, fn(url) try_async(fn() fetch(url)))
)
// List of Ok/Err results
```
