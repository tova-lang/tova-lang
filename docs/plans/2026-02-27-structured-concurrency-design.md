# Tova Structured Concurrency Design

**Date:** 2026-02-27
**Status:** Approved

## Overview

Tova gains Go-level concurrency with structured scoping, Result-based error propagation, and data-race safety by construction. Concurrent task bodies compile to WebAssembly and execute on a Rust/Tokio runtime embedded as a native addon (napi-rs, targeting Bun). Channels are lock-free crossbeam queues. Select multiplexes across channels via Tokio's select.

Non-concurrent Tova code continues to compile to JS unchanged. The concurrent runtime activates only when `spawn` or `concurrent {}` is used.

## Mental Model

- **Millions of lightweight tasks** — each WASM task is ~64 bytes of state on Tokio's scheduler (like goroutines)
- **M:N scheduling** — Tokio multiplexes tasks onto a small OS thread pool (like Go's GMP scheduler)
- **No shared mutable state** — each task gets its own WASM linear memory. Communication only through channels. Data races are impossible.
- **Structured scoping** — all tasks must complete (or be cancelled) before a `concurrent {}` block exits. No leaked tasks.
- **Result propagation** — every spawned task returns `Result<T, Error>`. No panics, no crashes.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Tova Program                       │
│            (JS for non-concurrent code)               │
├──────────────────────────────────────────────────────┤
│             spawn / concurrent { }                    │
│          (task bodies compiled to WASM)               │
├──────────────────────────────────────────────────────┤
│            Rust Runtime (napi-rs addon)               │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │   Tokio   │  │ Wasmtime  │  │    Channels      │ │
│  │ Scheduler │  │  (executes│  │  (crossbeam —    │ │
│  │ M:N tasks │  │   WASM)   │  │   lock-free)     │ │
│  └───────────┘  └───────────┘  └──────────────────┘ │
│  ┌──────────────────────────────────────────────────┐│
│  │  Host Imports: I/O, channels, memory, timers     ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

### Why WASM + Wasmtime (not direct Rust compilation)

- Tova already has `wasm-codegen.js` — extend it, don't rewrite
- Wasmtime instantiates WASM modules in microseconds
- Each task gets its own linear memory — true isolation
- WASM is platform-independent — task code needs no cross-compilation
- Host imports provide a clean FFI boundary for channels, I/O, timers

### Why this beats JS Workers

- Tokio task: ~64 bytes. Bun Worker: ~2MB per isolate.
- Crossbeam channels: lock-free, nanosecond sends. JS async queue: microtask overhead.
- Tokio's work-stealing scheduler: automatic load balancing across CPU cores.

### Bun Compatibility

Tova's runtime is Bun (not Node). Key considerations:
- Bun supports N-API — napi-rs addons load via `require()` or `import`
- Bun's event loop differs from Node's libuv — async N-API callbacks need testing
- Bun's `Worker` API differs from Node's `worker_threads` — not relevant since we use Tokio threads, not JS workers
- Pre-built binaries distributed per-platform: `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`, `win32-x64`
- Fallback to source compilation via `cargo build` if no prebuild matches

## Syntax & Primitives

### `spawn` and `concurrent {}` blocks

`spawn` launches a lightweight task onto the Tokio runtime. Must appear inside a `concurrent {}` block (structured scope).

```tova
concurrent {
    users = spawn fetch_users()
    posts = spawn fetch_posts()
    stats = spawn compute_stats(data)
}
// All three complete here
// users, posts, stats are all Result<T, Error>

match users {
    Ok(list) => print(len(list))
    Err(e) => print("failed: " ++ e.message)
}
```

Rules:
- Every `spawn` returns `Result<T, Error>`
- `concurrent {}` waits for all tasks to finish
- Unbound spawns (`spawn fire_and_forget()`) still complete before block exits
- Tasks start executing immediately when `spawn` is called

### Channels

Typed, bounded communication pipes. Implemented as crossbeam lock-free queues in Rust, exposed to WASM via host imports.

```tova
ch = Channel.new(10)    // buffered, capacity 10

concurrent {
    // Producer
    spawn fn() {
        for i in range(100) {
            ch.send(i)
        }
        ch.close()
    }

    // Consumer
    spawn fn() {
        for msg in ch {
            print(msg)
        }
    }
}
```

API:
- `Channel.new(capacity)` — bounded channel. `0` = unbuffered (rendezvous)
- `ch.send(value)` — blocks (yields to scheduler) if full
- `ch.receive()` — returns `Option<T>`: `Some(val)` or `None` if closed
- `ch.close()` — signals no more values
- `for msg in ch { ... }` — iterates until closed

### `select` statement

Multiplexes across multiple channel operations. Compiles to Tokio's `tokio::select!`.

```tova
select {
    msg from ch1      => print("ch1: " ++ msg)
    msg from ch2      => print("ch2: " ++ msg)
    _ from done       => break
    timeout(5000)     => {
        print("no activity for 5s")
        break
    }
}
```

Cases:
- `value from channel` — receive
- `channel.send(value)` — send (blocks until accepted)
- `timeout(ms)` — fires after N milliseconds
- `_` — default (non-blocking, runs if nothing else ready)

If multiple cases are ready, one is chosen randomly (like Go).

### Cancellation & Block Modes

```tova
// Default: wait for all, collect all results
concurrent {
    a = spawn might_fail()     // Err("oops")
    b = spawn will_succeed()   // Ok(42)
}
// a = Err("oops"), b = Ok(42) — both available

// Cancel siblings on first error
concurrent cancel_on_error {
    a = spawn risky_op_1()
    b = spawn risky_op_2()
}
// If a returns Err, b is cancelled. Block returns the Err.

// Race: first success wins
concurrent first {
    spawn fetch_primary()
    spawn fetch_replica()
}
// First Ok wins, other cancelled. Returns Result<T, Error>.
```

### Timeouts

```tova
// Timeout entire block
concurrent timeout(5000) {
    a = spawn slow_operation()
}
// If 5s elapses: all tasks cancelled, block returns Err(Timeout)

// Timeout individual task
concurrent {
    a = spawn with_timeout(3000, fn() {
        fetch_from_slow_api()
    })
}
```

### Task Isolation

Each task gets its own WASM linear memory. No shared mutable state. Communication only through channels.

```tova
// Safe — each task has its own `count`
concurrent {
    spawn fn() {
        count = 0
        for i in range(1000000) { count = count + 1 }
        ch.send(count)
    }
    spawn fn() {
        count = 0
        for i in range(1000000) { count = count + 1 }
        ch.send(count)
    }
}
```

## Compilation Model

### Two Compilation Paths

```
                        Tova Source
                            │
                     ┌──────┴──────┐
                     │   Parser    │
                     └──────┬──────┘
                            │ AST
                    ┌───────┴───────┐
                    │               │
              Regular code    spawn/concurrent
                    │               │
              ┌─────┴─────┐   ┌────┴──────┐
              │ JS Codegen │   │WASM Codegen│
              │ (existing) │   │ (extended) │
              └─────┬─────┘   └────┬──────┘
                    │               │
                 app.js        .wasm modules
                    │               │
                    └───────┬───────┘
                            │
                   Rust Runtime (napi-rs)
                   ┌────────┴────────┐
                   │ Tokio + Wasmtime│
                   │ + Crossbeam     │
                   └─────────────────┘
```

### WASM Task Compilation

When the compiler encounters `spawn fn_name(args)` or `spawn fn() { ... }`:

1. Extract the task function body from the AST
2. Analyze whether it can compile to WASM (type-check all operations)
3. Compile the body to a WASM module via extended `wasm-codegen.js`
4. Inject host imports for channels, I/O, timers
5. Emit a JS stub that loads the WASM and submits it to the Tokio runtime

Compiled output (simplified):
```javascript
const __task_fib_wasm = /* base64 WASM bytes */;
const { __result } = await __tova_runtime.concurrent([
    { wasm: __task_fib_wasm, args: [40], name: 'fib' }
]);
const result = __result[0];
```

### Host Imports (WASM ↔ Rust Boundary)

WASM modules call host-imported functions provided by the Rust runtime:

```wat
(import "tova" "chan_send"    (func $chan_send    (param i32 i32) (result i32)))
(import "tova" "chan_receive" (func $chan_receive (param i32) (result i32 i32)))
(import "tova" "chan_close"   (func $chan_close   (param i32)))
(import "tova" "http_get"    (func $http_get     (param i32 i32) (result i32 i32)))
(import "tova" "sleep"       (func $sleep        (param i64)))
(import "tova" "print"       (func $print        (param i32 i32)))
(import "tova" "mem_alloc"   (func $mem_alloc    (param i32) (result i32)))
```

When a WASM task calls `chan_send`, execution yields to Tokio's scheduler (the task suspends until the channel has capacity). This is how millions of tasks cooperate — exactly like goroutines yielding at channel operations.

### Cancellation Mechanics

Tokio's cooperative cancellation: when cancelled, a task's next yield point (channel op, I/O, sleep) returns a cancellation signal. The WASM task sees a special host import return code and unwinds.

Long-running pure compute without yield points gets a **fuel limit** — Wasmtime's fuel metering interrupts WASM execution after N instructions, giving the scheduler a chance to cancel.

### Fallback for Non-WASM-Compatible Code

Not everything compiles to WASM (especially early on). The compiler handles this gracefully:

```tova
spawn compute_primes(1000000)     // ✓ compiles to WASM

spawn format_report(users)        // ✗ compiler warning:
                                  //   "task body uses String operations
                                  //    not yet supported in WASM.
                                  //    Falling back to async JS task."
```

Fallback: Promise-based execution on Bun's event loop. The task still participates in the `concurrent {}` block, respects cancellation, returns `Result`. Just runs on V8 instead of Tokio.

Developers get correct semantics from day one. Performance improves as WASM codegen expands.

## Error Handling

- Every spawned task returns `Result<T, Error>` — enforced at compile time
- WASM traps, host import failures, and explicit `Err` all become `Err(error)`
- No task failure crashes the runtime
- Block modes control group error behavior:
  - Default: collect all results
  - `cancel_on_error`: first Err cancels siblings
  - `first`: first Ok cancels siblings
  - `timeout(ms)`: all cancelled after deadline, returns `Err(Timeout)`

## Rust Runtime Crate Structure

```
tova_runtime/
├── Cargo.toml          # tokio, wasmtime, crossbeam-channel, napi-rs
├── src/
│   ├── lib.rs          # napi-rs entry point, exports to Bun/Node
│   ├── scheduler.rs    # Tokio runtime + task lifecycle management
│   ├── executor.rs     # Wasmtime WASM execution engine
│   ├── channels.rs     # Crossbeam channels + host import wiring
│   ├── select.rs       # Select multiplexer
│   ├── io.rs           # Async I/O host imports (HTTP, file, timer)
│   └── memory.rs       # WASM linear memory management, serialization
└── build.rs            # napi-rs build config
```

N-API exports:
- `__tova_runtime.concurrent(tasks, mode)` — run task group
- `__tova_runtime.channel(capacity)` — create channel, returns handle ID
- `__tova_runtime.spawn(wasm_bytes, args)` — submit single task
- `__tova_runtime.cancel(task_id)` — cancel a task
- `__tova_runtime.shutdown()` — graceful shutdown

## Tova vs Go Comparison

| Feature | Go | Tova |
|---------|-----|------|
| Lightweight tasks | goroutines | WASM tasks on Tokio |
| Structured scoping | No (goroutine leak is common) | `concurrent {}` — no leaks |
| Error propagation | `panic` crashes program | `Result<T, E>` from every task |
| Cancellation | `context.Context` (manual) | Block modes, cooperative |
| Race pattern | Manual `select` + goroutine | `concurrent first { }` |
| Timeout | `context.WithTimeout` (manual) | `concurrent timeout(ms) { }` |
| Data race safety | Possible (shared memory) | Impossible (WASM isolation) |
| Channels | Built-in | Built-in (crossbeam, lock-free) |
| Select | Built-in | Built-in |

## Phased Build Plan

### Phase 1 — Rust Runtime Foundation
Build `tova_runtime` crate. Tokio scheduler, Wasmtime executor, crossbeam channels. Expose to Bun via napi-rs. Test: load a WASM module, run it on a Tokio task, send/receive on a channel. Hand-written WASM test modules (no compiler changes).

**Exit criteria:** 1M concurrent WASM tasks, channel throughput > 10M msg/sec, benchmarks vs Go goroutines.

### Phase 2 — Compiler: `concurrent` / `spawn` / `Channel`
New AST nodes: `ConcurrentBlock`, `SpawnExpression`. Parser handles `concurrent {}`, `spawn expr`. Codegen routes numeric-compatible functions through extended `wasm-codegen.js`, emits JS stubs calling `__tova_runtime.concurrent()`. Promise fallback for non-WASM bodies.

**Exit criteria:** `concurrent { a = spawn fib(40); b = spawn fib(40) }` runs both on Tokio.

### Phase 3 — `select` + Cancellation
Parser/codegen for `select { msg from ch => ... }`. Block modes: `cancel_on_error`, `first`, `timeout`. Wasmtime fuel metering for compute-bound cancellation.

**Exit criteria:** Select across 3 channels. Cancellation stops siblings. Timeout fires.

### Phase 4 — Extended WASM Codegen
Strings (linear memory, length-prefixed UTF-8). Arrays (typed arrays in linear memory). Structs/types (flattened memory layouts). `Result<T, E>` and `Option<T>` as tagged unions.

**Exit criteria:** Task body with strings, arrays, structs compiles to WASM and runs on Tokio.

### Phase 5 — I/O Host Imports
HTTP client via hyper. File I/O via `tokio::fs`. DNS, TCP, UDP. Each I/O call yields the task.

**Exit criteria:** 100K concurrent HTTP requests from spawned tasks. Benchmark vs Go.

### Phase 6 — Analyzer + Polish
Warnings: non-WASM-compatible bodies, unbounded channels, send-after-close. LSP support for concurrent blocks. Full test suite and documentation.

**Exit criteria:** Complete test coverage, LSP integration, analyzer warnings.

## New AST Nodes

```
ConcurrentBlock {
    type: "ConcurrentBlock"
    mode: "all" | "cancel_on_error" | "first"
    timeout: Expression | null          // ms expression for timeout mode
    body: [Statement]
}

SpawnExpression {
    type: "SpawnExpression"
    callee: Expression                  // function to spawn
    arguments: [Expression]
}

SelectStatement {
    type: "SelectStatement"
    cases: [SelectCase]
}

SelectCase {
    type: "SelectCase"
    kind: "receive" | "send" | "timeout" | "default"
    channel: Expression | null          // channel expression
    binding: Identifier | null          // variable to bind received value
    value: Expression | null            // value for send, ms for timeout
    body: [Statement]
}
```

## New Keywords / Tokens

- `concurrent` — block keyword
- `spawn` — expression keyword
- `select` — statement keyword (already may conflict with JS — verify)
- `from` — used in select cases (`msg from ch`)
- `timeout` — used in select cases and block modifiers
- `cancel_on_error` — block mode modifier
- `first` — block mode modifier
