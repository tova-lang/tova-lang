# Channels

Channels provide a way for concurrent tasks to communicate by sending and receiving messages. They are inspired by Go channels and work with Tova's async/await system.

For `concurrent` blocks, `spawn`, and `select` multiplexing over channels, see the [Concurrency guide](../guide/concurrency).

## Creating Channels

### Channel.new

```tova
Channel.new(capacity?) -> Channel
```

Creates a new channel. The optional `capacity` parameter sets the buffer size:

- **No capacity (or 0)**: Unbuffered -- `send` blocks until a receiver is ready
- **Positive capacity**: Buffered -- `send` blocks only when the buffer is full

```tova
// Unbuffered channel
ch = Channel.new()

// Buffered channel with capacity 10
ch = Channel.new(10)
```

> **Type handling:** JavaScript-side channels are dynamically typed — you can send any Tova value (numbers, strings, objects, etc.). WASM-side channels (used by `@wasm` functions via host imports) are currently limited to `i64` values. Future phases will extend WASM channels to support strings, arrays, and structs.

---

## Sending and Receiving

> **Important:** `send()` and `receive()` are async operations — always use `await`. Without `await`, you get a promise instead of the actual send/receive behavior.

### send

```tova
await ch.send(value) -> Nil
```

Sends a value into the channel. For unbuffered channels, this suspends until a receiver is ready. For buffered channels, this suspends only when the buffer is full.

```tova
ch = Channel.new(5)
await ch.send("hello")
await ch.send(42)
```

### receive

```tova
await ch.receive() -> Option<T>
```

Receives a value from the channel. Returns `Some(value)` if a value is available, or `None` if the channel is closed and empty.

```tova
msg = await ch.receive()
match msg {
  Some(value) => print("Got: {value}")
  None => print("Channel closed")
}
```

---

## Closing Channels

### close

```tova
ch.close() -> Nil
```

Closes the channel. After closing:
- No more values can be sent (sending will throw an error)
- Pending values in the buffer can still be received
- Once the buffer is drained, `receive()` returns `None`

```tova
ch = Channel.new(10)
await ch.send(1)
await ch.send(2)
ch.close()

await ch.receive()    // Some(1)
await ch.receive()    // Some(2)
await ch.receive()    // None
```

### Error Behavior

| Operation | After close |
|-----------|-------------|
| `ch.send(value)` | Throws an error: "Cannot send on closed channel" |
| `ch.receive()` | Returns `Some(value)` while buffer has items, then `None` |
| `ch.close()` | No-op (double-close is safe) |
| `async for ... in ch` | Drains remaining items, then exits the loop |

---

## Async Iteration

Channels support async iteration with `async for` (compiles to JavaScript's `for await...of`):

```tova
ch = Channel.new(10)

// Producer (in another async context)
async fn produce(ch) {
  for i in range(5) {
    await ch.send(i)
  }
  ch.close()
}

// Consumer
async for msg in ch {
  print("Received: {msg}")
}
// Prints: 0, 1, 2, 3, 4
```

> `async for` works with any object implementing `Symbol.asyncIterator`, including channels.

---

## Examples

### Producer-Consumer

```tova
async fn producer(ch, items) {
  for item in items {
    await ch.send(item)
  }
  ch.close()
}

async fn consumer(ch) {
  async for item in ch {
    result = process(item)
    print("Processed: {result}")
  }
}

ch = Channel.new(10)
await parallel([
  producer(ch, data),
  consumer(ch)
])
```

### Fan-Out

Distribute work across multiple consumers:

```tova
async fn worker(id, ch) {
  async for task in ch {
    print("Worker {id} processing: {task}")
    await do_work(task)
  }
}

ch = Channel.new(100)

// Start 3 workers
workers = range(3) |> map(fn(id) worker(id, ch))

// Send work
for task in tasks {
  await ch.send(task)
}
ch.close()

await parallel(workers)
```

### Pipeline

Chain channels together for multi-stage processing:

```tova
async fn stage1(input, output) {
  async for raw in input {
    await output.send(parse(raw))
  }
  output.close()
}

async fn stage2(input, output) {
  async for parsed in input {
    await output.send(transform(parsed))
  }
  output.close()
}

ch1 = Channel.new(10)
ch2 = Channel.new(10)
ch3 = Channel.new(10)

// Feed input
async fn feed(ch) {
  for item in data {
    await ch.send(item)
  }
  ch.close()
}

await parallel([
  feed(ch1),
  stage1(ch1, ch2),
  stage2(ch2, ch3),
  consumer(ch3)
])
```
