# Performance

Tova generates high-performance code through compile-time optimizations and performance decorators. You write clean, expressive code and the compiler makes it fast. These features range from automatic rewrites (zero effort) to explicit decorators (`@wasm`, `@fast`) for compute-intensive workloads.

## Benchmark Results

All benchmarks run on Apple Silicon. Each reports the best of 3 runs.

| Benchmark | Time | Technique |
|-----------|------|-----------|
| Sort 1M integers | 27ms | Rust FFI radix sort (O(n)) |
| JSON parse 11MB | 37ms | SIMD-accelerated parser |
| JSON stringify 100K objects | 19ms | Native serialization |
| Fibonacci iterative (n=40) | 20ms | JIT-optimized tight loop |
| @fast dot product 1M | 97ms | Float64Array coercion |
| N-body simulation | 22ms | Floating-point optimization |
| @wasm integer compute (200x500K) | 117ms | Native WebAssembly binary |
| Array find (1M items, 100x) | 7ms | Optimized builtins |
| 10-arm match dispatch (10M iter) | 18.8ms | Compiled to if-chain |
| @fast Kahan sum 1M | 380ms | Float64Array + compensated summation |
| @fast vector add 1M | 90ms | TypedArray element-wise ops |
| Prime sieve 10M | 25ms | Uint8Array fill optimization |
| Result.map 3x chain (10M iter) | 10ms | Compile-time fusion |

### HTTP Server

| Mode | Requests/sec |
|------|-------------|
| Fast mode (auto-detected) | 108,000 |
| Standard mode | 90,000 |

HTTP fast mode is automatically enabled when the compiler detects a simple server (no middleware, sessions, or WebSockets). It emits synchronous handlers with direct if-chain dispatch instead of a middleware pipeline.

### Optimization Impact

Several benchmarks improved dramatically through compiler optimizations:

| Benchmark | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Prime sieve 10M | 78ms | 25ms | 3.1x (array fill + Uint8Array) |
| Result.map 3x chain | 101ms | 10ms | 10x (map chain fusion) |
| HTTP req/s | 66K | 108K | 1.6x (fast mode) |
| Lexer throughput | 0.079ms/iter | 0.045ms/iter | 1.8x (substring extraction) |

## Automatic Optimizations

These happen at compile time. You get them for free without changing your code.

### Array Fill Pattern Detection

When the compiler sees an empty array followed by a push loop with a constant value, it replaces the entire pattern with a single pre-allocated array:

```tova
// You write:
var scores = []
for i in range(1000) {
  scores.push(0)
}

// Compiler generates: new Array(1000).fill(0)
```

For boolean fills, the compiler upgrades to a `Uint8Array` for contiguous memory:

```tova
// You write:
var flags = []
for i in range(1000) {
  flags.push(false)
}

// Compiler generates: new Uint8Array(1000)
```

**Impact:** 3x faster for the prime sieve benchmark (78ms to 25ms). The `Uint8Array` upgrade gives contiguous memory access instead of boxed boolean objects.

This optimization triggers when:
- The variable starts as an empty array literal `[]`
- The next statement is a `for i in range(n)` loop
- The loop body is a single `push()` call with a value that doesn't reference the loop variable

### Range Loop Optimization

`for i in range(n)` compiles to a C-style for loop instead of allocating an array:

```tova
for i in range(1000000) {
  // loop body
}

// Compiles to: for (let i = 0; i < 1000000; i++) { ... }
// NOT: for (const i of range(1000000)) { ... }
```

This avoids allocating a million-element array just to iterate over indices.

### Result.map Chain Fusion

Chains of `.map()` calls on `Ok` or `Some` values are fused into a single operation, eliminating all intermediate allocations:

```tova
result = Ok(5)
  .map(fn(x) x * 2)
  .map(fn(x) x + 3)
  .map(fn(x) x * 10)

// Compiler generates: Ok((((5 * 2) + 3) * 10))
// Instead of creating 3 intermediate Ok wrappers
```

**Impact:** 10x faster for chains of 3+ maps (101ms to 10ms). This is a zero-cost abstraction -- the functional style compiles to the same code as manual computation.

The optimization applies when:
- The receiver is an `Ok()` or `Some()` call
- Each `.map()` argument is a single-expression lambda with one parameter
- Two or more `.map()` calls are chained

### Lexer Fast Path

The lexer uses `substring()` extraction instead of character-by-character string concatenation for identifiers and numbers:

**Impact:** 43% faster lexing (0.079ms to 0.045ms per iteration), 9% faster full compilation pipeline.

### HTTP Fast Mode

The compiler detects simple servers at compile time and emits optimized code:

```tova
// When the server has no middleware, sessions, WebSockets, or error handlers:
server {
  fn get_users() -> [User] { users }
  fn add_user(name: String) -> User { ... }
}

// Compiler emits:
// - Synchronous handler (not async)
// - Direct if-chain route dispatch (no middleware pipeline)
// - No AsyncLocalStorage, request IDs, or per-request timing
```

**Impact:** 64% improvement (66K to 108K req/s).

## @wasm -- WebAssembly Compilation

The `@wasm` decorator compiles a function directly to WebAssembly binary format. No external toolchain required. The Tova compiler includes a complete WASM code generator that produces raw binary bytes embedded in the output.

```tova
@wasm fn fibonacci(n: Int) -> Int {
  if n <= 1 { return n }
  fibonacci(n - 1) + fibonacci(n - 2)
}

// Call it like any other function
print(fibonacci(40))
```

### How it works

The compiler's WASM code generator (`src/codegen/wasm-codegen.js`):

1. Parses the function AST
2. Infers types from annotations and context
3. Emits WASM binary sections (type, function, export, code)
4. Uses LEB128 encoding for variable-length integers
5. Handles i32/f64 type conversions at instruction boundaries
6. Generates glue code that instantiates the WASM module at runtime

If WASM compilation fails (unsupported operation), the compiler falls back to standard codegen with a warning.

### Supported operations

| Category | Supported |
|----------|-----------|
| **Types** | `Int` (i32), `Float` (f64), `Bool` (i32) |
| **Arithmetic** | `+`, `-`, `*`, `/`, `%` |
| **Comparison** | `==`, `!=`, `<`, `>`, `<=`, `>=` |
| **Logic** | `and`, `or`, `not` |
| **Control flow** | `if`/`elif`/`else`, `while`, `for` |
| **Variables** | `var`, assignment |
| **Calls** | Self-recursion, other `@wasm` functions |

### Limitations

- Only numeric types and booleans -- no strings, arrays, or objects
- Can only call other `@wasm` functions (no external calls)
- No closures or captured variables
- Assignment targets must be simple variables

### Performance

| Benchmark | @wasm | Standard codegen |
|-----------|-------|-----------------|
| compute 200x500K | **117ms** | 170ms |
| fibonacci(40) | **554ms** | 936ms |

The WASM path avoids JIT warmup and deoptimization overhead for pure numeric computation.

### When to use @wasm

Use `@wasm` for CPU-bound numeric kernels: recursive algorithms, simulations, mathematical computations. The sweet spot is tight loops over integers or floats with no string/object manipulation.

## @fast -- TypedArray Optimization

The `@fast` decorator enables TypedArray coercion for function parameters. Array parameters with numeric type annotations are automatically converted to typed arrays at function entry, enabling native-speed numeric operations.

```tova
@fast fn dot_product(a: [Float], b: [Float]) -> Float {
  typed_dot(a, b)
}

@fast fn scale_vector(v: [Float], factor: Float) -> [Float] {
  typed_scale(v, factor)
}

@fast fn normalize(v: [Float]) -> [Float] {
  n = typed_norm(v)
  typed_scale(v, 1.0 / n)
}
```

### How it works

1. The compiler detects `@fast` on a function declaration
2. Array parameters with numeric type annotations (e.g., `[Float]`, `[Int]`) are wrapped in TypedArray constructors at function entry
3. For-loops over typed arrays use index-based iteration (avoids iterator protocol overhead)
4. Numeric array literals in the function body are emitted as typed arrays

### Type mapping

| Tova Annotation | TypedArray | Bytes per element |
|----------------|------------|-------------------|
| `[Int]` | `Int32Array` | 4 |
| `[Float]` | `Float64Array` | 8 |
| `[Byte]` | `Uint8Array` | 1 |
| `[Int8]` | `Int8Array` | 1 |
| `[Int16]` | `Int16Array` | 2 |
| `[Int32]` | `Int32Array` | 4 |
| `[Uint8]` | `Uint8Array` | 1 |
| `[Uint16]` | `Uint16Array` | 2 |
| `[Uint32]` | `Uint32Array` | 4 |
| `[Float32]` | `Float32Array` | 4 |
| `[Float64]` | `Float64Array` | 8 |

### Typed stdlib functions

These are optimized for TypedArray input and available without imports:

| Function | Description |
|----------|-------------|
| `typed_sum(arr)` | Sum with Kahan compensation (minimizes float error) |
| `typed_dot(a, b)` | Dot product of two arrays |
| `typed_norm(arr)` | L2 norm (Euclidean length) |
| `typed_add(a, b)` | Element-wise addition (returns new typed array) |
| `typed_scale(arr, s)` | Multiply every element by scalar |
| `typed_map(arr, f)` | Map function over elements, preserving type |
| `typed_reduce(arr, f, init)` | Reduce with typed array input |
| `typed_sort(arr)` | Sort (returns new typed array) |
| `typed_zeros(n)` | Float64Array of zeros |
| `typed_ones(n)` | Float64Array of ones |
| `typed_fill(n, val)` | New Float64Array filled with value |
| `typed_range(start, end, step)` | Float64Array range |
| `typed_linspace(start, end, n)` | n evenly-spaced Float64Array values |

### Performance

| Operation (1M elements, 100 iterations) | Time |
|----------------------------------------|------|
| Dot product | 97ms |
| Kahan sum | 380ms |
| Vector add | 90ms |
| Vector norm | 324ms |

### Example: numerically stable summation

```tova
@fast fn precise_sum(data: [Float]) -> Float {
  typed_sum(data)
}

// Regular sum of [1e16, 1, -1e16] might lose the 1
// typed_sum uses Kahan compensated summation to preserve it
result = precise_sum([1e16, 1.0, -1e16])
print(result)   // 1.0 (not 0)
```

### When to use @fast

Use `@fast` for array-heavy numeric code: signal processing, statistics, linear algebra, physics simulations, financial calculations. TypedArrays give the runtime contiguous, unboxed memory to work with, which enables SIMD-level optimization.

## parallel_map -- Multi-Core Worker Pool

`parallel_map` distributes array processing across all CPU cores using a persistent worker pool:

```tova
results = await parallel_map(large_array, fn(item) {
  expensive_computation(item)
})
```

### How it works

1. On first call, creates one worker thread per CPU core
2. Workers persist and are reused for all subsequent calls (zero startup overhead)
3. The array is chunked evenly across workers
4. Each worker reconstructs the mapped function and processes its chunk
5. Results are gathered and returned in order

```tova
// Specify number of workers explicitly
results = await parallel_map(data, process_item, 8)
```

### Performance

| Implementation | Time (64 items x 10M work) | Speedup |
|----------------|---------------------------|---------|
| Sequential `map()` | 1,355ms | 1.0x |
| **`parallel_map` (pooled)** | **379ms** | **3.57x** |

The persistent pool eliminates worker creation overhead. Second call latency drops from 50-90ms (per-call workers) to 6ms (pooled workers).

### When to use parallel_map

- Array of 4+ elements (falls back to sequential below this)
- Each element requires significant computation (CPU-bound, not I/O-bound)
- For I/O-bound work (network requests, file reads), use `async` with `Promise.all` instead

## Radix Sort via Rust FFI

Tova's `sorted()` function uses a 3-tier strategy for maximum performance on numeric arrays:

1. **Arrays > 128 elements, numeric, FFI available:** Radix sort via Rust FFI (O(n) time)
2. **Arrays > 128 elements, numeric, no FFI:** Float64Array.sort() fallback
3. **Arrays <= 128 elements:** Standard comparator sort (low overhead)

| Size | Time (Rust FFI) |
|------|----------------|
| 10K | 0.4ms |
| 100K | 2.4ms |
| 1M | 23.6ms |

Radix sort achieves O(n) time complexity vs comparison sort's O(n log n), which is why it scales efficiently to large arrays.

## filled() -- Pre-allocated Arrays

`filled(n, value)` creates a pre-allocated array in a single operation:

```tova
grid = filled(1000, 0)
flags = filled(256, false)
names = filled(10, "unknown")
```

This compiles to `new Array(n).fill(val)` and is faster than building arrays with push loops because it allocates the full size upfront.

## Combining Features

These features compose naturally:

```tova
@fast fn process_batch(data: [Float]) -> Float {
  typed_dot(data, data) |> Math.sqrt()
}

// Process many batches in parallel across all CPU cores
norms = await parallel_map(all_batches, process_batch)
```

For the most demanding workloads, layer them:

```tova
@wasm fn kernel(x: Float, y: Float) -> Float {
  // Inner computation as native WASM
  var result = 0.0
  var i = 0
  while i < 1000 {
    result = result + x * y / (1.0 + result)
    i = i + 1
  }
  result
}

@fast fn process(data: [Float]) -> [Float] {
  // TypedArray operations with WASM kernel
  typed_map(data, fn(x) kernel(x, 1.0))
}

// Distribute across cores
results = await parallel_map(batches, fn(batch) process(batch))
```

## Running the Benchmarks

The benchmark suite lives in `benchmarks/` and includes 14 workloads:

```bash
# Run all benchmarks
./benchmarks/run_benchmarks.sh

# Quick mode (benchmarks 01-07 only)
./benchmarks/run_benchmarks.sh --quick

# Tova only
./benchmarks/run_benchmarks.sh --tova-only

# Single benchmark
./benchmarks/run_benchmarks.sh 03
```

The runner executes each benchmark and outputs a formatted results table.
