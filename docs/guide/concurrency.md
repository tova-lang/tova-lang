# Concurrency

Tova has built-in structured concurrency with `concurrent` blocks, `spawn` expressions, `select` multiplexing, and typed channels. Every spawned task returns a `Result`, concurrent blocks enforce structured scoping (no leaked tasks), and channels provide safe communication between tasks.

## Concurrent Blocks

A `concurrent` block runs multiple tasks in parallel and waits for all of them to complete before continuing:

```tova
fn fetch_users() -> List { get("/api/users") }
fn fetch_posts() -> List { get("/api/posts") }

async fn load_dashboard() {
    concurrent {
        users = spawn fetch_users()
        posts = spawn fetch_posts()
    }
    // Both complete here. users and posts are Result values.

    match users {
        Ok(list) => print("Got {len(list)} users")
        Err(e) => print("Failed: {e}")
    }
}
```

Key rules:

- Every `spawn` returns `Result<T, Error>` -- success wraps in `Ok`, exceptions wrap in `Err`
- The block waits for **all** tasks to finish before continuing
- Variables assigned inside the block are visible after it
- Tasks start executing immediately when `spawn` is called

## Spawn

`spawn` launches a task inside a `concurrent` block. It can call a named function or an inline lambda:

```tova
concurrent {
    // Spawn a named function
    a = spawn compute(data)

    // Spawn an inline lambda
    b = spawn fn() {
        result = expensive_work()
        result * 2
    }
}
```

Fire-and-forget spawns (no assignment) still run and complete before the block exits:

```tova
concurrent {
    spawn log_event("dashboard_loaded")
    users = spawn fetch_users()
}
// Both the log and the fetch have completed here
```

### Unwrapping Results

Since every spawn returns a `Result`, use pattern matching to handle success and failure:

```tova
fn divide(a: Float, b: Float) -> Float { a / b }

async fn main() {
    concurrent {
        result = spawn divide(10.0, 0.0)
    }

    match result {
        Ok(value) => print("Answer: {value}")
        Err(e) => print("Division failed: {e}")
    }
}
```

Or use Result methods for concise handling:

```tova
concurrent {
    users = spawn fetch_users()
    posts = spawn fetch_posts()
}

user_list = users.unwrapOr([])
post_list = posts.unwrapOr([])
```

## Block Modes

The default `concurrent` block waits for all tasks and collects all results. Three alternative modes change how the block handles errors and completion.

### cancel_on_error

Cancel all sibling tasks when the first error occurs:

```tova
concurrent cancel_on_error {
    a = spawn validate_input(data)
    b = spawn check_permissions(user)
    c = spawn reserve_inventory(item)
}
// If any task returns Err, the others are cancelled.
// Successful tasks still have their Ok results.
```

### first

Race mode -- return the first successful result and cancel the rest:

```tova
concurrent first {
    result = spawn fetch_from_primary()
    spawn fetch_from_replica()
    spawn fetch_from_cache()
}
// The fastest Ok wins. Others are cancelled.
match result {
    Ok(data) => print("Got: {data}")
    Err(e) => print("All failed: {e}")
}
```

> In `first` mode, **all** named variables receive the winner's result (there is only one winning value). Use a single variable for clarity.

### timeout

Cancel all tasks if the block exceeds a time limit:

```tova
concurrent timeout(5000) {
    data = spawn slow_network_call()
    stats = spawn compute_stats(dataset)
}
// If 5 seconds elapse, all tasks are cancelled
// and the block throws a timeout error.
```

> **Cancellation is cooperative, not preemptive.** Tova uses `AbortController` for cancellation, which signals at the next async yield point. CPU-bound synchronous code will not be interrupted mid-execution. For compute-heavy tasks, consider using `@wasm` functions, which will support fuel-based preemptive cancellation in a future release.

## Channels

Channels are typed, bounded communication pipes for passing messages between concurrent tasks. See the [Channels stdlib reference](../stdlib/channels) for the full API.

```tova
ch = Channel.new(10)    // buffered channel, capacity 10

concurrent {
    // Producer
    spawn fn() {
        for i in range(5) {
            await ch.send(i)
        }
        ch.close()
    }

    // Consumer
    spawn fn() {
        async for msg in ch {
            print("Got: {msg}")
        }
    }
}
```

### Channel API Summary

| Method | Description |
|--------|-------------|
| `Channel.new(capacity?)` | Create a channel. `0` or omitted = unbuffered |
| `await ch.send(value)` | Send a value. Blocks if buffer is full |
| `await ch.receive()` | Receive a value. Returns `Option` -- `Some(val)` or `None` if closed |
| `ch.close()` | Close the channel. Pending values can still be drained |

> **Important:** `send()` and `receive()` are async operations — always use `await` when calling them. Without `await`, the operation returns a promise instead of blocking until the value is sent or received.

### Buffered vs Unbuffered

- **Unbuffered** (`Channel.new()` or `Channel.new(0)`): `send` blocks until a receiver is ready. This synchronizes the sender and receiver.
- **Buffered** (`Channel.new(10)`): `send` only blocks when the buffer is full. This decouples the sender and receiver.

## Select

`select` multiplexes across multiple channel operations. It waits until one of the cases is ready, then executes that case's body:

```tova
async fn router(commands, events, done) {
    select {
        cmd from commands => {
            print("Command: {cmd}")
            process(cmd)
        }
        evt from events => {
            print("Event: {evt}")
            log(evt)
        }
        _ from done => {
            print("Shutting down")
        }
    }
}
```

### Select Cases

Four kinds of case are supported:

**Receive** -- bind a value from a channel:

```tova
select {
    msg from ch => print("Got: {msg}")
}
```

**Send** -- send a value when the channel has capacity:

```tova
select {
    ch.send(value) => print("Sent")
}
```

**Timeout** -- fire after a duration:

```tova
select {
    msg from ch => print(msg)
    timeout(3000) => print("No message in 3 seconds")
}
```

**Default** -- run immediately if no other case is ready (non-blocking):

```tova
select {
    msg from ch => print(msg)
    _ => print("Nothing ready, moving on")
}
```

### Select in a Loop

Combine `select` with a loop to continuously multiplex:

```tova
async fn event_loop(commands, events, quit) {
    running = true
    while running {
        select {
            cmd from commands => handle_command(cmd)
            evt from events => handle_event(evt)
            _ from quit => { running = false }
            timeout(10000) => print("Idle for 10s")
        }
    }
}
```

## Patterns

### Fan-Out

Distribute work across multiple consumers sharing a single channel:

```tova
async fn worker(id, tasks) {
    async for task in tasks {
        result = process(task)
        print("Worker {id} finished: {result}")
    }
}

ch = Channel.new(100)

concurrent {
    // Start 4 workers
    spawn worker(1, ch)
    spawn worker(2, ch)
    spawn worker(3, ch)
    spawn worker(4, ch)

    // Feed work
    spawn fn() {
        for item in work_items {
            await ch.send(item)
        }
        ch.close()
    }
}
```

### Pipeline

Chain channels together for multi-stage processing:

```tova
async fn stage(name, input, output, transform) {
    async for item in input {
        await output.send(transform(item))
    }
    output.close()
}

raw = Channel.new(10)
parsed = Channel.new(10)
final = Channel.new(10)

concurrent {
    spawn stage("parse", raw, parsed, fn(x) parse(x))
    spawn stage("transform", parsed, final, fn(x) transform(x))

    // Feed raw data
    spawn fn() {
        for item in data {
            await raw.send(item)
        }
        raw.close()
    }

    // Collect results
    spawn fn() {
        async for result in final {
            save(result)
        }
    }
}
```

### Timeout with Fallback

Use `concurrent first` to race a slow operation against a fallback:

```tova
concurrent first {
    result = spawn fetch_from_api()
    spawn fn() {
        await sleep(2000)
        get_cached_value()
    }
}
// Uses whichever finishes first
data = result.unwrapOr(default_data)
```

## When to Use What

Tova offers several ways to run things concurrently. Here's when to use each:

| Pattern | Use When |
|---------|----------|
| `concurrent { spawn ... }` | You have 2+ independent tasks and need structured scoping |
| `concurrent cancel_on_error` | All tasks must succeed (validation, multi-step operations) |
| `concurrent first` | You want the fastest result (redundant requests, cache racing) |
| `concurrent timeout(ms)` | You need a hard deadline on a group of tasks |
| `select { }` | You're multiplexing across channels (event loops, routers) |
| `Channel.new()` | Tasks need to communicate (producer-consumer, pipelines) |
| `parallel([...])` | Quick one-liner for independent promises |
| `await Promise.all([...])` | JS interop, simple promise collection |
| `parallel_map(arr, fn)` | CPU-bound work on large arrays across worker threads |

## Compiler Diagnostics

The Tova analyzer produces warnings for common concurrency mistakes:

| Warning Code | Description |
|-------------|-------------|
| `W_SPAWN_OUTSIDE_CONCURRENT` | `spawn` used outside a `concurrent` block |
| `W_EMPTY_CONCURRENT` | `concurrent` block with no statements |
| `W_EMPTY_SELECT` | `select` block with no cases |
| `W_DUPLICATE_SELECT_DEFAULT` | Multiple `default` cases in a `select` |
| `W_DUPLICATE_SELECT_TIMEOUT` | Multiple `timeout` cases in a `select` |
| `W_SELECT_DEFAULT_TIMEOUT` | Both `default` and `timeout` in a `select` (default makes timeout unreachable) |
| `W_MISSING_TIMEOUT` | `concurrent timeout` mode without a timeout value |

## Error Handling Summary

- Every `spawn` wraps its result in `Result<T, Error>` -- no unhandled exceptions
- A failing task returns `Err(error)` without crashing sibling tasks (default mode)
- `cancel_on_error` mode aborts siblings on first `Err`
- `first` mode aborts losers when a winner returns `Ok`
- `timeout` mode cancels all tasks after the deadline
- Use `match`, `.unwrapOr()`, `.map()`, or `.isOk()` to work with results

```tova
concurrent {
    a = spawn risky_operation()
    b = spawn safe_operation()
}

// Pattern match for full control
match a {
    Ok(val) => use(val)
    Err(e) => log_error(e)
}

// Or use methods for the common case
safe_val = b.unwrapOr(default_value)
```
