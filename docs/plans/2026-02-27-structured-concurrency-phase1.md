# Phase 1: Rust Runtime Foundation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Rust/Tokio/Wasmtime/Crossbeam runtime that can execute WASM modules as lightweight concurrent tasks with channel-based communication, exposed to Bun via napi-rs.

**Architecture:** A new `tova_runtime/` crate (separate from existing `native/` which handles sorting via bun:ffi) exposes N-API functions that Bun loads as a `.node` addon. The runtime manages a multi-threaded Tokio scheduler that executes WASM modules via Wasmtime, with crossbeam channels for inter-task communication wired as WASM host imports.

**Tech Stack:** Rust 1.89+, tokio (multi-threaded), wasmtime (WASM executor), crossbeam-channel (lock-free channels), napi-rs (Bun/Node N-API bindings)

**Existing context:**
- Rust installed: cargo 1.89.0, target aarch64-apple-darwin
- Existing Rust FFI: `native/` uses bun:ffi (C ABI) for sort/sum/min/max — stays untouched
- Existing WASM codegen: `src/codegen/wasm-codegen.js` generates WASM binary for numeric functions
- Existing Channel: `src/stdlib/inline.js` lines 1014-1072 (JS async queue — will eventually be replaced)
- Runtime: Bun >=1.0.0

---

### Task 1: Scaffold the `tova_runtime` Rust crate

**Files:**
- Create: `tova_runtime/Cargo.toml`
- Create: `tova_runtime/src/lib.rs`
- Create: `tova_runtime/build.rs`
- Create: `tova_runtime/.cargo/config.toml`

**Step 1: Create directory structure**

```bash
mkdir -p tova_runtime/src tova_runtime/.cargo
```

**Step 2: Write Cargo.toml**

Create `tova_runtime/Cargo.toml`:

```toml
[package]
name = "tova_runtime"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
napi = { version = "2", features = ["async", "napi8"] }
napi-derive = "2"
tokio = { version = "1", features = ["full"] }
wasmtime = "29"
crossbeam-channel = "0.5"
once_cell = "1"

[build-dependencies]
napi-build = "2"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
strip = true
```

**Step 3: Write build.rs**

Create `tova_runtime/build.rs`:

```rust
extern crate napi_build;

fn main() {
    napi_build::setup();
}
```

**Step 4: Write cargo config for macOS**

Create `tova_runtime/.cargo/config.toml`:

```toml
[target.aarch64-apple-darwin]
rustflags = ["-C", "link-args=-undefined dynamic_lookup"]

[target.x86_64-apple-darwin]
rustflags = ["-C", "link-args=-undefined dynamic_lookup"]
```

**Step 5: Write minimal lib.rs with a health-check export**

Create `tova_runtime/src/lib.rs`:

```rust
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub fn health_check() -> String {
    "tova_runtime ok".to_string()
}
```

**Step 6: Build and verify**

Run: `cd tova_runtime && cargo build --release 2>&1`
Expected: Compiles successfully, produces `tova_runtime/target/release/libtova_runtime.dylib` (macOS) which napi-rs also outputs as `tova_runtime.darwin-arm64.node`

Check the .node file exists:
```bash
ls tova_runtime/target/release/*.node 2>/dev/null || find tova_runtime -name "*.node" 2>/dev/null
```

**Step 7: Write a Bun test to load the addon**

Create `tests/runtime-foundation.test.js`:

```javascript
import { describe, test, expect } from 'bun:test';
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';

// Load the napi-rs addon
function loadRuntime() {
    const searchDirs = [
        join(__dirname, '..', 'tova_runtime'),
        join(__dirname, '..', 'tova_runtime', 'target', 'release'),
    ];
    for (const dir of searchDirs) {
        if (!existsSync(dir)) continue;
        const files = readdirSync(dir).filter(f => f.endsWith('.node'));
        for (const f of files) {
            try { return require(join(dir, f)); } catch (e) { continue; }
        }
    }
    throw new Error('Could not load tova_runtime native addon');
}

describe('tova_runtime foundation', () => {
    let runtime;

    test('loads native addon', () => {
        runtime = loadRuntime();
        expect(runtime).toBeDefined();
    });

    test('health check', () => {
        runtime = loadRuntime();
        expect(runtime.healthCheck()).toBe('tova_runtime ok');
    });
});
```

**Step 8: Run test to verify loading works**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/runtime-foundation.test.js`
Expected: 2 passing tests

**Step 9: Commit**

```bash
git add tova_runtime/ tests/runtime-foundation.test.js
git commit -m "feat: scaffold tova_runtime crate with napi-rs + Bun loading test"
```

---

### Task 2: Tokio Scheduler — spawn and await tasks

**Files:**
- Create: `tova_runtime/src/scheduler.rs`
- Modify: `tova_runtime/src/lib.rs`
- Modify: `tests/runtime-foundation.test.js`

**Step 1: Write the failing test**

Add to `tests/runtime-foundation.test.js`:

```javascript
describe('tokio scheduler', () => {
    let runtime;
    beforeAll(() => { runtime = loadRuntime(); });

    test('spawn a single async task and get result', async () => {
        const result = await runtime.spawnTask(42);
        expect(result).toBe(42);
    });

    test('spawn multiple tasks concurrently', async () => {
        const results = await runtime.concurrentAll([1, 2, 3, 4, 5]);
        expect(results).toEqual([1, 2, 3, 4, 5]);
    });

    test('spawn 10000 tasks', async () => {
        const n = 10000;
        const inputs = Array.from({ length: n }, (_, i) => i);
        const results = await runtime.concurrentAll(inputs);
        expect(results.length).toBe(n);
        expect(results[0]).toBe(0);
        expect(results[n - 1]).toBe(n - 1);
    });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/runtime-foundation.test.js`
Expected: FAIL — `runtime.spawnTask is not a function`

**Step 3: Create scheduler module**

Create `tova_runtime/src/scheduler.rs`:

```rust
use once_cell::sync::Lazy;
use tokio::runtime::Runtime;

// Global Tokio runtime — multi-threaded, work-stealing scheduler
pub static TOKIO_RT: Lazy<Runtime> = Lazy::new(|| {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .worker_threads(num_cpus())
        .build()
        .expect("Failed to create Tokio runtime")
});

fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}

/// Spawn a single task on Tokio that returns a value.
/// This is a placeholder — real tasks will execute WASM modules.
pub fn spawn_task_inner(value: i64) -> i64 {
    value
}

/// Run N tasks concurrently on Tokio, collect all results.
pub async fn concurrent_all_inner(values: Vec<i64>) -> Vec<i64> {
    let mut handles = Vec::with_capacity(values.len());

    for val in values {
        handles.push(TOKIO_RT.spawn(async move { val }));
    }

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        results.push(handle.await.unwrap());
    }
    results
}
```

**Step 4: Wire scheduler into lib.rs**

Replace `tova_runtime/src/lib.rs`:

```rust
mod scheduler;

use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub fn health_check() -> String {
    "tova_runtime ok".to_string()
}

#[napi]
pub async fn spawn_task(value: i64) -> Result<i64> {
    let result = scheduler::TOKIO_RT
        .spawn(async move { scheduler::spawn_task_inner(value) })
        .await
        .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?;
    Ok(result)
}

#[napi]
pub async fn concurrent_all(values: Vec<i64>) -> Result<Vec<i64>> {
    let results = scheduler::concurrent_all_inner(values).await;
    Ok(results)
}
```

**Step 5: Build**

Run: `cd tova_runtime && cargo build --release 2>&1`
Expected: Compiles with tokio and napi dependencies

**Step 6: Run tests**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/runtime-foundation.test.js`
Expected: All tests pass (health check + scheduler tests)

**Step 7: Commit**

```bash
git add tova_runtime/src/ tests/runtime-foundation.test.js
git commit -m "feat: Tokio scheduler with spawnTask and concurrentAll"
```

---

### Task 3: Wasmtime Executor — load and run WASM modules

**Files:**
- Create: `tova_runtime/src/executor.rs`
- Modify: `tova_runtime/src/lib.rs`
- Create: `tests/fixtures/gen-test-wasm.js`
- Modify: `tests/runtime-foundation.test.js`

**Step 1: Create WASM test module generator**

Create `tests/fixtures/gen-test-wasm.js`:

```javascript
// Generate minimal WASM modules for testing the Tova runtime
// Based on wasm-codegen.js binary encoding patterns

function uleb128(value) {
    const r = [];
    do {
        let b = value & 0x7F;
        value >>>= 7;
        if (value !== 0) b |= 0x80;
        r.push(b);
    } while (value !== 0);
    return r;
}

function encodeSection(id, contents) {
    return [id, ...uleb128(contents.length), ...contents];
}

function encodeString(s) {
    const bytes = new TextEncoder().encode(s);
    return [...uleb128(bytes.length), ...bytes];
}

const I64 = 0x7E;
const FUNC_TYPE = 0x60;

/** add(a: i64, b: i64) -> i64 */
function generateAddModule() {
    const bytes = [];
    bytes.push(0x00, 0x61, 0x73, 0x6D); // \0asm
    bytes.push(0x01, 0x00, 0x00, 0x00); // version 1

    const typeBody = [1, FUNC_TYPE, 2, I64, I64, 1, I64];
    bytes.push(...encodeSection(1, typeBody));
    bytes.push(...encodeSection(3, [1, 0]));

    const exportBody = [1, ...encodeString("add"), 0x00, 0];
    bytes.push(...encodeSection(7, exportBody));

    const funcBody = [0, 0x20, 0x00, 0x20, 0x01, 0x7C, 0x0B];
    const codeSectionBody = [1, ...uleb128(funcBody.length), ...funcBody];
    bytes.push(...encodeSection(10, codeSectionBody));

    return new Uint8Array(bytes);
}

/** fib(n: i64) -> i64 — iterative fibonacci */
function generateFibModule() {
    const bytes = [];
    bytes.push(0x00, 0x61, 0x73, 0x6D);
    bytes.push(0x01, 0x00, 0x00, 0x00);

    const typeBody = [1, FUNC_TYPE, 1, I64, 1, I64];
    bytes.push(...encodeSection(1, typeBody));
    bytes.push(...encodeSection(3, [1, 0]));

    const exportBody = [1, ...encodeString("fib"), 0x00, 0];
    bytes.push(...encodeSection(7, exportBody));

    const wrappedFuncBody = [
        3, 1, I64, 1, I64, 1, I64, // 3 locals: a, b, counter
        0x42, 0x01, 0x21, 0x02,     // b = 1
        0x02, 0x40,                   // block
        0x03, 0x40,                   // loop
          0x20, 0x03, 0x20, 0x00, 0x53, 0x0D, 0x01, // if counter>=n br_if 1
          0x20, 0x01, 0x20, 0x02, 0x7C,               // a + b
          0x20, 0x02, 0x21, 0x01,                       // a = b
          0x21, 0x02,                                   // b = a+b
          0x20, 0x03, 0x42, 0x01, 0x7C, 0x21, 0x03,   // counter++
          0x0C, 0x00,                                   // br 0
        0x0B, 0x0B,                                     // end loop, end block
        0x20, 0x01, 0x0B,                               // return a, end func
    ];

    const codeSectionBody = [1, ...uleb128(wrappedFuncBody.length), ...wrappedFuncBody];
    bytes.push(...encodeSection(10, codeSectionBody));

    return new Uint8Array(bytes);
}

module.exports = { generateAddModule, generateFibModule };
```

**Step 2: Write the failing test**

Add to `tests/runtime-foundation.test.js`:

```javascript
const { generateAddModule, generateFibModule } = require('./fixtures/gen-test-wasm.js');

describe('wasmtime executor', () => {
    let runtime;
    beforeAll(() => { runtime = loadRuntime(); });

    test('execute a WASM module (add)', async () => {
        const wasmBytes = generateAddModule();
        const result = await runtime.execWasm(Buffer.from(wasmBytes), 'add', [3, 4]);
        expect(result).toBe(7);
    });

    test('execute WASM fib(10)', async () => {
        const wasmBytes = generateFibModule();
        const result = await runtime.execWasm(Buffer.from(wasmBytes), 'fib', [10]);
        expect(result).toBe(55);
    });

    test('execute WASM on Tokio — multiple tasks concurrently', async () => {
        const wasmBytes = Buffer.from(generateAddModule());
        const tasks = [
            { wasm: wasmBytes, func: 'add', args: [1, 2] },
            { wasm: wasmBytes, func: 'add', args: [10, 20] },
            { wasm: wasmBytes, func: 'add', args: [100, 200] },
        ];
        const results = await runtime.concurrentWasm(tasks);
        expect(results).toEqual([3, 30, 300]);
    });

    test('1000 concurrent WASM tasks', async () => {
        const wasmBytes = Buffer.from(generateAddModule());
        const tasks = Array.from({ length: 1000 }, (_, i) => ({
            wasm: wasmBytes,
            func: 'add',
            args: [i, i],
        }));
        const results = await runtime.concurrentWasm(tasks);
        expect(results.length).toBe(1000);
        expect(results[0]).toBe(0);
        expect(results[999]).toBe(1998);
    });
});
```

**Step 3: Run test to verify it fails**

Run: `bun test tests/runtime-foundation.test.js`
Expected: FAIL — `runtime.execWasm is not a function`

**Step 4: Create executor module**

Create `tova_runtime/src/executor.rs`:

```rust
use wasmtime::*;
use std::sync::Arc;

/// Execute a single WASM module function with i64 args, returning i64 result.
pub fn exec_wasm_sync(wasm_bytes: &[u8], func_name: &str, args: &[i64]) -> Result<i64, String> {
    let engine = Engine::default();
    let module = Module::new(&engine, wasm_bytes)
        .map_err(|e| format!("WASM compile error: {}", e))?;

    let mut store = Store::new(&engine, ());
    let instance = Instance::new(&mut store, &module, &[])
        .map_err(|e| format!("WASM instantiation error: {}", e))?;

    let func = instance
        .get_func(&mut store, func_name)
        .ok_or_else(|| format!("function '{}' not found in WASM module", func_name))?;

    let wasm_args: Vec<Val> = args.iter().map(|&v| Val::I64(v)).collect();
    let mut results = vec![Val::I64(0)];

    func.call(&mut store, &wasm_args, &mut results)
        .map_err(|e| format!("WASM execution error: {}", e))?;

    match results[0] {
        Val::I64(v) => Ok(v),
        Val::I32(v) => Ok(v as i64),
        _ => Err("unexpected return type".to_string()),
    }
}

/// Execute many tasks sharing a single compiled WASM module.
/// Compiles once, instantiates per-task (cheap — new Store + Instance only).
pub fn exec_many_shared(
    wasm_bytes: &[u8],
    tasks: Vec<(String, Vec<i64>)>,
) -> Vec<Result<i64, String>> {
    let engine = Engine::default();
    let module = match Module::new(&engine, wasm_bytes) {
        Ok(m) => m,
        Err(e) => {
            let err = format!("compile: {}", e);
            return tasks.iter().map(|_| Err(err.clone())).collect();
        }
    };

    tasks
        .into_iter()
        .map(|(func_name, args)| {
            let mut store = Store::new(&engine, ());
            let instance = Instance::new(&mut store, &module, &[])
                .map_err(|e| format!("instantiate: {}", e))?;

            let func = instance
                .get_func(&mut store, &func_name)
                .ok_or_else(|| format!("func '{}' not found", func_name))?;

            let wasm_args: Vec<Val> = args.iter().map(|&v| Val::I64(v)).collect();
            let mut results = vec![Val::I64(0)];

            func.call(&mut store, &wasm_args, &mut results)
                .map_err(|e| format!("exec: {}", e))?;

            match results[0] {
                Val::I64(v) => Ok(v),
                Val::I32(v) => Ok(v as i64),
                _ => Err("unexpected return type".to_string()),
            }
        })
        .collect()
}
```

**Step 5: Wire executor into lib.rs**

Update `tova_runtime/src/lib.rs`:

```rust
mod scheduler;
mod executor;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::Arc;

#[napi]
pub fn health_check() -> String {
    "tova_runtime ok".to_string()
}

#[napi]
pub async fn spawn_task(value: i64) -> Result<i64> {
    let result = scheduler::TOKIO_RT
        .spawn(async move { scheduler::spawn_task_inner(value) })
        .await
        .map_err(|e| Error::from_reason(format!("task failed: {}", e)))?;
    Ok(result)
}

#[napi]
pub async fn concurrent_all(values: Vec<i64>) -> Result<Vec<i64>> {
    let results = scheduler::concurrent_all_inner(values).await;
    Ok(results)
}

#[napi(object)]
pub struct WasmTask {
    pub wasm: Buffer,
    pub func: String,
    pub args: Vec<i64>,
}

#[napi]
pub async fn exec_wasm(wasm: Buffer, func: String, args: Vec<i64>) -> Result<i64> {
    let wasm_bytes = wasm.to_vec();
    let result = scheduler::TOKIO_RT
        .spawn(async move {
            executor::exec_wasm_sync(&wasm_bytes, &func, &args)
        })
        .await
        .map_err(|e| Error::from_reason(format!("task join error: {}", e)))?
        .map_err(|e| Error::from_reason(e))?;
    Ok(result)
}

#[napi]
pub async fn concurrent_wasm(tasks: Vec<WasmTask>) -> Result<Vec<i64>> {
    let mut handles = Vec::with_capacity(tasks.len());

    for task in tasks {
        let wasm_bytes = task.wasm.to_vec();
        let func = task.func;
        let args = task.args;
        handles.push(scheduler::TOKIO_RT.spawn(async move {
            executor::exec_wasm_sync(&wasm_bytes, &func, &args)
        }));
    }

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        let r = handle
            .await
            .map_err(|e| Error::from_reason(format!("join: {}", e)))?
            .map_err(|e| Error::from_reason(e))?;
        results.push(r);
    }
    Ok(results)
}

#[napi]
pub async fn concurrent_wasm_shared(tasks: Vec<WasmTask>) -> Result<Vec<i64>> {
    if tasks.is_empty() {
        return Ok(vec![]);
    }

    let wasm_bytes = tasks[0].wasm.to_vec();
    let chunk_size = (tasks.len() + 7) / 8;
    let task_data: Vec<(String, Vec<i64>)> = tasks
        .into_iter()
        .map(|t| (t.func, t.args))
        .collect();

    let chunks: Vec<Vec<(String, Vec<i64>)>> = task_data
        .chunks(chunk_size.max(1))
        .map(|c| c.to_vec())
        .collect();

    let wasm_arc = Arc::new(wasm_bytes);
    let mut handles = Vec::new();

    for chunk in chunks {
        let wasm = Arc::clone(&wasm_arc);
        handles.push(scheduler::TOKIO_RT.spawn_blocking(move || {
            executor::exec_many_shared(&wasm, chunk)
        }));
    }

    let mut all_results = Vec::new();
    for handle in handles {
        let chunk_results = handle
            .await
            .map_err(|e| Error::from_reason(format!("join: {}", e)))?;
        for r in chunk_results {
            all_results.push(r.map_err(|e| Error::from_reason(e))?);
        }
    }
    Ok(all_results)
}
```

**Step 6: Build**

Run: `cd tova_runtime && cargo build --release 2>&1`
Expected: Compiles with wasmtime dependency (first build may take 2-3 min)

**Step 7: Run tests**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/runtime-foundation.test.js`
Expected: All tests pass — WASM add, fib, concurrent execution

**Step 8: Commit**

```bash
git add tova_runtime/src/ tests/fixtures/gen-test-wasm.js tests/runtime-foundation.test.js
git commit -m "feat: Wasmtime executor — load and run WASM modules on Tokio tasks"
```

---

### Task 4: Crossbeam Channels — create, send, receive, close

**Files:**
- Create: `tova_runtime/src/channels.rs`
- Modify: `tova_runtime/src/lib.rs`
- Modify: `tests/runtime-foundation.test.js`

**Step 1: Write the failing test**

Add to `tests/runtime-foundation.test.js`:

```javascript
describe('channels', () => {
    let runtime;
    beforeAll(() => { runtime = loadRuntime(); });

    test('create a channel and get handle', () => {
        const chId = runtime.channelCreate(10);
        expect(typeof chId).toBe('number');
        expect(chId).toBeGreaterThanOrEqual(0);
    });

    test('send and receive on a channel', () => {
        const chId = runtime.channelCreate(10);
        runtime.channelSend(chId, 42);
        runtime.channelSend(chId, 99);
        const v1 = runtime.channelReceive(chId);
        const v2 = runtime.channelReceive(chId);
        expect(v1).toBe(42);
        expect(v2).toBe(99);
    });

    test('close channel — receive returns null after drain', () => {
        const chId = runtime.channelCreate(1);
        runtime.channelSend(chId, 7);
        runtime.channelClose(chId);
        const v1 = runtime.channelReceive(chId);
        expect(v1).toBe(7);
        const v2 = runtime.channelReceive(chId);
        expect(v2).toBeNull();
    });

    test('channel 100 messages', () => {
        const chId = runtime.channelCreate(100);
        for (let i = 0; i < 100; i++) {
            runtime.channelSend(chId, i);
        }
        runtime.channelClose(chId);
        const values = [];
        let v;
        while ((v = runtime.channelReceive(chId)) !== null) {
            values.push(v);
        }
        expect(values.length).toBe(100);
        expect(values[0]).toBe(0);
        expect(values[99]).toBe(99);
    });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/runtime-foundation.test.js`
Expected: FAIL — `runtime.channelCreate is not a function`

**Step 3: Create channels module**

Create `tova_runtime/src/channels.rs`:

```rust
use crossbeam_channel::{bounded, Sender, Receiver, TryRecvError};
use std::collections::HashMap;
use std::sync::Mutex;
use once_cell::sync::Lazy;

struct ChannelEntry {
    sender: Sender<i64>,
    receiver: Receiver<i64>,
    closed: bool,
}

static CHANNELS: Lazy<Mutex<HashMap<u32, ChannelEntry>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static NEXT_ID: Lazy<Mutex<u32>> = Lazy::new(|| Mutex::new(0));

pub fn create(capacity: u32) -> u32 {
    let cap = if capacity == 0 { 0 } else { capacity as usize };
    let (sender, receiver) = bounded(cap);

    let mut id_lock = NEXT_ID.lock().unwrap();
    let id = *id_lock;
    *id_lock += 1;
    drop(id_lock);

    let mut channels = CHANNELS.lock().unwrap();
    channels.insert(id, ChannelEntry { sender, receiver, closed: false });
    id
}

pub fn send(id: u32, value: i64) -> bool {
    let channels = CHANNELS.lock().unwrap();
    if let Some(entry) = channels.get(&id) {
        if entry.closed {
            return false;
        }
        let sender = entry.sender.clone();
        drop(channels);
        sender.send(value).is_ok()
    } else {
        false
    }
}

pub fn receive(id: u32) -> Option<i64> {
    let channels = CHANNELS.lock().unwrap();
    if let Some(entry) = channels.get(&id) {
        let receiver = entry.receiver.clone();
        drop(channels);
        match receiver.try_recv() {
            Ok(val) => Some(val),
            Err(_) => None,
        }
    } else {
        None
    }
}

/// Blocking receive — waits until a value is available or channel is closed+empty.
pub fn receive_blocking(id: u32) -> Option<i64> {
    let channels = CHANNELS.lock().unwrap();
    if let Some(entry) = channels.get(&id) {
        let receiver = entry.receiver.clone();
        drop(channels);
        match receiver.recv() {
            Ok(val) => Some(val),
            Err(_) => None,
        }
    } else {
        None
    }
}

pub fn close(id: u32) {
    let mut channels = CHANNELS.lock().unwrap();
    if let Some(entry) = channels.get_mut(&id) {
        entry.closed = true;
        // Replace sender with a dropped clone to signal disconnection
        // Receivers will get RecvError after buffer drains
    }
    // Drop the entry's sender by removing and re-inserting without it
    if let Some(mut entry) = channels.remove(&id) {
        let (_, receiver) = bounded(0); // dummy
        let real_receiver = entry.receiver.clone();
        // Drop original sender by letting entry go out of scope
        drop(entry.sender);
        channels.insert(id, ChannelEntry {
            sender: bounded(0).0, // dead sender
            receiver: real_receiver,
            closed: true,
        });
    }
}

pub fn destroy(id: u32) {
    let mut channels = CHANNELS.lock().unwrap();
    channels.remove(&id);
}
```

**Step 4: Wire channels into lib.rs**

Add to `tova_runtime/src/lib.rs`:

```rust
mod channels;

#[napi]
pub fn channel_create(capacity: u32) -> u32 {
    channels::create(capacity)
}

#[napi]
pub fn channel_send(id: u32, value: i64) -> bool {
    channels::send(id, value)
}

#[napi]
pub fn channel_receive(id: u32) -> Option<i64> {
    channels::receive(id)
}

#[napi]
pub fn channel_close(id: u32) {
    channels::close(id)
}
```

**Step 5: Build**

Run: `cd tova_runtime && cargo build --release 2>&1`
Expected: Compiles successfully

**Step 6: Run tests**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/runtime-foundation.test.js`
Expected: All channel tests pass

**Step 7: Commit**

```bash
git add tova_runtime/src/channels.rs tests/runtime-foundation.test.js
git commit -m "feat: crossbeam channels with create/send/receive/close"
```

---

### Task 5: WASM Host Imports — wire channels into WASM tasks

WASM modules call `chan_send` / `chan_receive` as imported host functions, allowing tasks to communicate through channels.

**Files:**
- Create: `tova_runtime/src/host_imports.rs`
- Modify: `tova_runtime/src/executor.rs`
- Modify: `tova_runtime/src/lib.rs`
- Create: `tests/fixtures/gen-channel-wasm.js`
- Modify: `tests/runtime-foundation.test.js`

**Step 1: Create WASM module generators that use host imports**

Create `tests/fixtures/gen-channel-wasm.js`:

```javascript
// Generate WASM modules that use host-imported channel functions
// Host imports: (import "tova" "chan_send" (func (param i32 i64) (result i32)))
//               (import "tova" "chan_receive" (func (param i32) (result i64)))

function uleb128(value) {
    const r = [];
    do {
        let b = value & 0x7F;
        value >>>= 7;
        if (value !== 0) b |= 0x80;
        r.push(b);
    } while (value !== 0);
    return r;
}

function encodeSection(id, contents) {
    return [id, ...uleb128(contents.length), ...contents];
}

function encodeString(s) {
    const bytes = new TextEncoder().encode(s);
    return [...uleb128(bytes.length), ...bytes];
}

const I32 = 0x7F;
const I64 = 0x7E;
const FUNC_TYPE = 0x60;

/**
 * Producer: sends values 0..count-1 to a channel, returns count sent.
 * Exports: producer(channel_id: i32, count: i64) -> i64
 * Imports: tova.chan_send(ch: i32, val: i64) -> i32
 */
function generateProducerModule() {
    const bytes = [];
    bytes.push(0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00);

    // Types: chan_send(i32,i64)->i32, producer(i32,i64)->i64
    const typeBody = [
        2,
        FUNC_TYPE, 2, I32, I64, 1, I32,
        FUNC_TYPE, 2, I32, I64, 1, I64,
    ];
    bytes.push(...encodeSection(1, typeBody));

    // Import: tova.chan_send as func 0
    const importBody = [1, ...encodeString("tova"), ...encodeString("chan_send"), 0x00, 0];
    bytes.push(...encodeSection(2, importBody));

    // Function section: func 1 (producer) is type 1
    bytes.push(...encodeSection(3, [1, 1]));

    // Export: "producer" = func 1
    const exportBody = [1, ...encodeString("producer"), 0x00, 1];
    bytes.push(...encodeSection(7, exportBody));

    // Code: producer(ch_id, count) { for i in 0..count: chan_send(ch_id, i); return count }
    const funcBody = [
        1, 1, I64, // 1 local: i (index 2)
        0x02, 0x40,                                     // block
        0x03, 0x40,                                     // loop
          0x20, 0x02, 0x20, 0x01, 0x53, 0x0D, 0x01,   // if i>=count br_if 1
          0x20, 0x00, 0x20, 0x02,                       // ch_id, i
          0x10, 0x00, 0x1A,                             // call chan_send, drop result
          0x20, 0x02, 0x42, 0x01, 0x7C, 0x21, 0x02,   // i++
          0x0C, 0x00,                                   // br 0
        0x0B, 0x0B,                                     // end loop, end block
        0x20, 0x01, 0x0B,                               // return count
    ];
    bytes.push(...encodeSection(10, [1, ...uleb128(funcBody.length), ...funcBody]));

    return new Uint8Array(bytes);
}

/**
 * Consumer: receives count values, returns their sum.
 * Exports: consumer(channel_id: i32, count: i64) -> i64
 * Imports: tova.chan_receive(ch: i32) -> i64
 */
function generateConsumerModule() {
    const bytes = [];
    bytes.push(0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00);

    // Types: chan_receive(i32)->i64, consumer(i32,i64)->i64
    const typeBody = [
        2,
        FUNC_TYPE, 1, I32, 1, I64,
        FUNC_TYPE, 2, I32, I64, 1, I64,
    ];
    bytes.push(...encodeSection(1, typeBody));

    // Import: tova.chan_receive as func 0
    const importBody = [1, ...encodeString("tova"), ...encodeString("chan_receive"), 0x00, 0];
    bytes.push(...encodeSection(2, importBody));

    // Function section
    bytes.push(...encodeSection(3, [1, 1]));

    // Export
    const exportBody = [1, ...encodeString("consumer"), 0x00, 1];
    bytes.push(...encodeSection(7, exportBody));

    // Code: consumer(ch_id, count) { sum=0; for i in 0..count: sum += chan_receive(ch_id); return sum }
    const funcBody = [
        2, 1, I64, 1, I64, // 2 locals: sum (index 2), i (index 3)
        0x02, 0x40,                                     // block
        0x03, 0x40,                                     // loop
          0x20, 0x03, 0x20, 0x01, 0x53, 0x0D, 0x01,   // if i>=count br_if 1
          0x20, 0x02,                                   // sum
          0x20, 0x00, 0x10, 0x00,                       // chan_receive(ch_id)
          0x7C, 0x21, 0x02,                             // sum = sum + received
          0x20, 0x03, 0x42, 0x01, 0x7C, 0x21, 0x03,   // i++
          0x0C, 0x00,                                   // br 0
        0x0B, 0x0B,                                     // end loop, end block
        0x20, 0x02, 0x0B,                               // return sum
    ];
    bytes.push(...encodeSection(10, [1, ...uleb128(funcBody.length), ...funcBody]));

    return new Uint8Array(bytes);
}

module.exports = { generateProducerModule, generateConsumerModule };
```

**Step 2: Write the failing test**

Add to `tests/runtime-foundation.test.js`:

```javascript
const { generateProducerModule, generateConsumerModule } = require('./fixtures/gen-channel-wasm.js');

describe('WASM host imports — channels', () => {
    let runtime;
    beforeAll(() => { runtime = loadRuntime(); });

    test('producer WASM sends values through channel', async () => {
        const chId = runtime.channelCreate(100);
        const wasmBytes = Buffer.from(generateProducerModule());
        const sent = await runtime.execWasmWithChannels(wasmBytes, 'producer', [chId, 10]);
        expect(sent).toBe(10);

        const values = [];
        let v;
        while ((v = runtime.channelReceive(chId)) !== null) {
            values.push(v);
        }
        expect(values).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    test('producer + consumer via channel on separate Tokio tasks', async () => {
        const chId = runtime.channelCreate(50);
        const producerWasm = Buffer.from(generateProducerModule());
        const consumerWasm = Buffer.from(generateConsumerModule());

        const results = await runtime.concurrentWasmWithChannels([
            { wasm: producerWasm, func: 'producer', args: [chId, 100] },
            { wasm: consumerWasm, func: 'consumer', args: [chId, 100] },
        ]);

        expect(results[0]).toBe(100);  // producer sent 100
        expect(results[1]).toBe(4950); // consumer sum(0..99)
    });
});
```

**Step 3: Run test to verify it fails**

Run: `bun test tests/runtime-foundation.test.js`
Expected: FAIL — `runtime.execWasmWithChannels is not a function`

**Step 4: Create host_imports module**

Create `tova_runtime/src/host_imports.rs`:

```rust
use wasmtime::*;
use crate::channels;

/// Add channel host imports to a WASM linker.
pub fn add_channel_imports(linker: &mut Linker<()>) -> Result<(), String> {
    linker
        .func_wrap("tova", "chan_send", |ch_id: i32, value: i64| -> i32 {
            if channels::send(ch_id as u32, value) { 0 } else { -1 }
        })
        .map_err(|e| format!("failed to add chan_send: {}", e))?;

    linker
        .func_wrap("tova", "chan_receive", |ch_id: i32| -> i64 {
            // Blocking receive
            channels::receive_blocking(ch_id as u32).unwrap_or(-1)
        })
        .map_err(|e| format!("failed to add chan_receive: {}", e))?;

    Ok(())
}
```

**Step 5: Add host-import-aware execution to executor.rs**

Add to `tova_runtime/src/executor.rs`:

```rust
use crate::host_imports;

/// Execute WASM with channel host imports available.
pub fn exec_wasm_with_channels(wasm_bytes: &[u8], func_name: &str, args: &[i64]) -> Result<i64, String> {
    let engine = Engine::default();
    let module = Module::new(&engine, wasm_bytes)
        .map_err(|e| format!("WASM compile error: {}", e))?;

    let mut linker = Linker::new(&engine);
    host_imports::add_channel_imports(&mut linker)?;

    let mut store = Store::new(&engine, ());
    let instance = linker
        .instantiate(&mut store, &module)
        .map_err(|e| format!("WASM instantiation error: {}", e))?;

    let func = instance
        .get_func(&mut store, func_name)
        .ok_or_else(|| format!("function '{}' not found", func_name))?;

    let func_ty = func.ty(&store);
    let wasm_args: Vec<Val> = args
        .iter()
        .zip(func_ty.params())
        .map(|(&v, ty)| match ty {
            ValType::I32 => Val::I32(v as i32),
            ValType::I64 => Val::I64(v),
            _ => Val::I64(v),
        })
        .collect();

    let mut results = vec![Val::I64(0)];

    func.call(&mut store, &wasm_args, &mut results)
        .map_err(|e| format!("WASM exec error: {}", e))?;

    match results[0] {
        Val::I64(v) => Ok(v),
        Val::I32(v) => Ok(v as i64),
        _ => Err("unexpected return type".to_string()),
    }
}
```

**Step 6: Wire into lib.rs**

Add to `tova_runtime/src/lib.rs`:

```rust
mod host_imports;

#[napi]
pub async fn exec_wasm_with_channels(wasm: Buffer, func: String, args: Vec<i64>) -> Result<i64> {
    let wasm_bytes = wasm.to_vec();
    let result = scheduler::TOKIO_RT
        .spawn(async move {
            executor::exec_wasm_with_channels(&wasm_bytes, &func, &args)
        })
        .await
        .map_err(|e| Error::from_reason(format!("join: {}", e)))?
        .map_err(|e| Error::from_reason(e))?;
    Ok(result)
}

#[napi]
pub async fn concurrent_wasm_with_channels(tasks: Vec<WasmTask>) -> Result<Vec<i64>> {
    let mut handles = Vec::with_capacity(tasks.len());

    for task in tasks {
        let wasm_bytes = task.wasm.to_vec();
        let func = task.func;
        let args = task.args;
        handles.push(scheduler::TOKIO_RT.spawn(async move {
            executor::exec_wasm_with_channels(&wasm_bytes, &func, &args)
        }));
    }

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        let r = handle
            .await
            .map_err(|e| Error::from_reason(format!("join: {}", e)))?
            .map_err(|e| Error::from_reason(e))?;
        results.push(r);
    }
    Ok(results)
}
```

**Step 7: Build**

Run: `cd tova_runtime && cargo build --release 2>&1`
Expected: Compiles successfully

**Step 8: Run tests**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/runtime-foundation.test.js`
Expected: All tests pass — producer sends through channel, consumer receives and sums

**Step 9: Commit**

```bash
git add tova_runtime/src/host_imports.rs tests/fixtures/gen-channel-wasm.js tests/runtime-foundation.test.js
git commit -m "feat: WASM host imports for channels — producer/consumer across Tokio tasks"
```

---

### Task 6: JS Bridge — runtime loader with fallback

**Files:**
- Create: `src/stdlib/runtime-bridge.js`
- Modify: `tests/runtime-foundation.test.js`

**Step 1: Write the failing test**

Add to `tests/runtime-foundation.test.js`:

```javascript
describe('runtime bridge', () => {
    test('loads runtime via bridge', () => {
        const bridge = require('../src/stdlib/runtime-bridge.js');
        expect(bridge.isRuntimeAvailable()).toBe(true);
    });

    test('bridge exposes high-level API', () => {
        const bridge = require('../src/stdlib/runtime-bridge.js');
        const chId = bridge.channelCreate(10);
        bridge.channelSend(chId, 42);
        const val = bridge.channelReceive(chId);
        expect(val).toBe(42);
    });
});
```

**Step 2: Create the bridge**

Create `src/stdlib/runtime-bridge.js`:

```javascript
// Tova Concurrency Runtime Bridge
// Loads the napi-rs native addon for Tokio/Wasmtime/Crossbeam runtime.
// Falls back gracefully when native runtime is unavailable.

let _runtime = null;
let _available = false;

function _findAddon() {
    const { existsSync, readdirSync } = require('fs');
    const { join, dirname } = require('path');

    const searchDirs = [
        join(dirname(__filename), '..', '..', 'tova_runtime'),
        join(dirname(__filename), '..', '..', 'tova_runtime', 'target', 'release'),
        join(process.env.HOME || '', '.tova', 'lib'),
        dirname(process.argv[1] || ''),
    ];

    for (const dir of searchDirs) {
        if (!existsSync(dir)) continue;
        try {
            const files = readdirSync(dir).filter(f => f.endsWith('.node'));
            for (const f of files) {
                const path = join(dir, f);
                if (existsSync(path)) return path;
            }
        } catch (e) { continue; }
    }
    return null;
}

function _init() {
    if (_runtime !== null) return _available;

    try {
        const addonPath = _findAddon();
        if (!addonPath) {
            _runtime = false;
            _available = false;
            return false;
        }
        _runtime = require(addonPath);
        _available = true;
        return true;
    } catch (e) {
        _runtime = false;
        _available = false;
        return false;
    }
}

function isRuntimeAvailable() { return _init(); }
function healthCheck() { if (!_init()) return null; return _runtime.healthCheck(); }

function channelCreate(cap) { if (!_init()) throw new Error('tova_runtime not available'); return _runtime.channelCreate(cap); }
function channelSend(id, val) { if (!_init()) throw new Error('tova_runtime not available'); return _runtime.channelSend(id, val); }
function channelReceive(id) { if (!_init()) throw new Error('tova_runtime not available'); return _runtime.channelReceive(id); }
function channelClose(id) { if (!_init()) throw new Error('tova_runtime not available'); return _runtime.channelClose(id); }

async function execWasm(bytes, func, args) { if (!_init()) throw new Error('tova_runtime not available'); return _runtime.execWasm(Buffer.from(bytes), func, args); }
async function execWasmWithChannels(bytes, func, args) { if (!_init()) throw new Error('tova_runtime not available'); return _runtime.execWasmWithChannels(Buffer.from(bytes), func, args); }
async function concurrentWasm(tasks) { if (!_init()) throw new Error('tova_runtime not available'); return _runtime.concurrentWasm(tasks); }
async function concurrentWasmWithChannels(tasks) { if (!_init()) throw new Error('tova_runtime not available'); return _runtime.concurrentWasmWithChannels(tasks); }
async function concurrentWasmShared(tasks) { if (!_init()) throw new Error('tova_runtime not available'); return _runtime.concurrentWasmShared(tasks); }

module.exports = {
    isRuntimeAvailable, healthCheck,
    channelCreate, channelSend, channelReceive, channelClose,
    execWasm, execWasmWithChannels, concurrentWasm, concurrentWasmWithChannels, concurrentWasmShared,
};
```

**Step 3: Run tests**

Run: `bun test tests/runtime-foundation.test.js`
Expected: All tests pass including bridge tests

**Step 4: Commit**

```bash
git add src/stdlib/runtime-bridge.js tests/runtime-foundation.test.js
git commit -m "feat: runtime bridge with auto-discovery and graceful fallback"
```

---

### Task 7: Benchmark — Go comparison

**Files:**
- Create: `benchmarks/concurrent/tova_bench.js`
- Create: `benchmarks/concurrent/go_bench.go`
- Create: `benchmarks/concurrent/run.sh`

**Step 1: Create Tova benchmark**

Create `benchmarks/concurrent/tova_bench.js`:

```javascript
const bridge = require('../../src/stdlib/runtime-bridge.js');
const { generateAddModule, generateFibModule } = require('../../tests/fixtures/gen-test-wasm.js');

if (!bridge.isRuntimeAvailable()) {
    console.error('tova_runtime not available — build with: cd tova_runtime && cargo build --release');
    process.exit(1);
}

async function benchTaskSpawning() {
    const n = 100_000;
    console.log(`\n--- ${n.toLocaleString()} concurrent WASM tasks (add) ---`);
    const wasmBytes = Buffer.from(generateAddModule());
    const tasks = Array.from({ length: n }, (_, i) => ({
        wasm: wasmBytes, func: 'add', args: [i, i],
    }));
    const start = performance.now();
    const results = await bridge.concurrentWasmShared(tasks);
    const elapsed = performance.now() - start;
    console.log(`Tova (Tokio+Wasmtime): ${elapsed.toFixed(0)}ms (${(n / elapsed * 1000).toFixed(0)} tasks/sec)`);
    console.log(`Verify: results[0]=${results[0]}, results[${n-1}]=${results[n-1]}`);
}

async function benchChannelThroughput() {
    const n = 1_000_000;
    console.log(`\n--- Channel throughput: ${n.toLocaleString()} messages ---`);
    const chId = bridge.channelCreate(1024);
    const start = performance.now();
    for (let i = 0; i < n; i++) bridge.channelSend(chId, i);
    for (let i = 0; i < n; i++) bridge.channelReceive(chId);
    const elapsed = performance.now() - start;
    console.log(`Tova (crossbeam): ${elapsed.toFixed(0)}ms (${(n / elapsed * 1000).toFixed(0)} msg/sec)`);
}

async function benchFibConcurrent() {
    const n = 1000;
    const fibN = 30;
    console.log(`\n--- ${n} concurrent fib(${fibN}) WASM tasks ---`);
    const wasmBytes = Buffer.from(generateFibModule());
    const tasks = Array.from({ length: n }, () => ({
        wasm: wasmBytes, func: 'fib', args: [fibN],
    }));
    const start = performance.now();
    const results = await bridge.concurrentWasmShared(tasks);
    const elapsed = performance.now() - start;
    console.log(`Tova (Wasmtime): ${elapsed.toFixed(0)}ms`);
    console.log(`Each fib(${fibN}) = ${results[0]}`);
}

async function main() {
    console.log('=== Tova Concurrency Benchmarks ===');
    await benchTaskSpawning();
    await benchChannelThroughput();
    await benchFibConcurrent();
}

main().catch(console.error);
```

**Step 2: Create Go comparison benchmark**

Create `benchmarks/concurrent/go_bench.go`:

```go
package main

import (
	"fmt"
	"sync"
	"time"
)

func fib(n int64) int64 {
	a, b := int64(0), int64(1)
	for i := int64(0); i < n; i++ {
		a, b = b, a+b
	}
	return a
}

func benchTasks() {
	n := 100_000
	fmt.Printf("\n--- %d concurrent goroutines (add) ---\n", n)
	start := time.Now()
	var wg sync.WaitGroup
	results := make([]int64, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(idx int) {
			results[idx] = int64(idx) + int64(idx)
			wg.Done()
		}(i)
	}
	wg.Wait()
	elapsed := time.Since(start)
	fmt.Printf("Go (goroutines): %dms (%d tasks/sec)\n",
		elapsed.Milliseconds(), int64(float64(n)/elapsed.Seconds()))
}

func benchChannels() {
	n := 1_000_000
	fmt.Printf("\n--- Channel throughput: %d messages ---\n", n)
	ch := make(chan int64, 1024)
	start := time.Now()
	go func() {
		for i := int64(0); i < int64(n); i++ {
			ch <- i
		}
		close(ch)
	}()
	for range ch {
	}
	elapsed := time.Since(start)
	fmt.Printf("Go (channels): %dms (%d msg/sec)\n",
		elapsed.Milliseconds(), int64(float64(n)/elapsed.Seconds()))
}

func benchFib() {
	n := 1000
	fibN := int64(30)
	fmt.Printf("\n--- %d concurrent fib(%d) goroutines ---\n", n, fibN)
	start := time.Now()
	var wg sync.WaitGroup
	results := make([]int64, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(idx int) {
			results[idx] = fib(fibN)
			wg.Done()
		}(i)
	}
	wg.Wait()
	elapsed := time.Since(start)
	fmt.Printf("Go (goroutines): %dms\n", elapsed.Milliseconds())
	fmt.Printf("Each fib(%d) = %d\n", fibN, results[0])
}

func main() {
	fmt.Println("=== Go Concurrency Benchmarks ===")
	benchTasks()
	benchChannels()
	benchFib()
}
```

**Step 3: Create runner script**

Create `benchmarks/concurrent/run.sh`:

```bash
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Building Tova runtime..."
cd "$ROOT_DIR/tova_runtime" && cargo build --release 2>&1 | tail -1

echo ""
echo "Running Tova benchmark..."
cd "$ROOT_DIR" && bun benchmarks/concurrent/tova_bench.js

echo ""
echo "Building Go benchmark..."
cd "$SCRIPT_DIR" && go build -o go_bench go_bench.go

echo ""
echo "Running Go benchmark..."
./go_bench

rm -f go_bench
```

**Step 4: Make executable and run**

```bash
chmod +x benchmarks/concurrent/run.sh
bash benchmarks/concurrent/run.sh
```

Expected: Both Tova and Go benchmarks produce numbers for comparison

**Step 5: Commit**

```bash
git add benchmarks/concurrent/
git commit -m "feat: concurrency benchmarks — Tova (Tokio/Wasmtime) vs Go (goroutines)"
```

---

## Summary

| Task | What it builds | Key deliverable |
|------|---------------|-----------------|
| 1 | Crate scaffold | napi-rs addon loads in Bun |
| 2 | Tokio scheduler | `spawnTask()`, `concurrentAll()` |
| 3 | Wasmtime executor | `execWasm()`, `concurrentWasm()`, `concurrentWasmShared()` |
| 4 | Crossbeam channels | `channelCreate/Send/Receive/Close` |
| 5 | WASM host imports | Producer/consumer WASM tasks communicate via channels |
| 6 | JS bridge | `runtime-bridge.js` with auto-discovery + fallback |
| 7 | Benchmarks | Tova vs Go comparison numbers |

**Exit criteria for Phase 1:**
- Rust runtime loads in Bun via napi-rs
- WASM modules execute on Tokio thread pool
- Channels work across WASM tasks (producer/consumer pattern)
- 10K+ concurrent WASM tasks complete successfully
- Channel throughput measured and compared to Go
- All tests in `tests/runtime-foundation.test.js` pass
- Graceful fallback when native addon not available
