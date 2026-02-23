# Performance

Tova includes several performance features that let you write high-performance code without dropping down to a lower-level language. These range from automatic compiler optimizations (zero effort) to explicit decorators for compute-intensive workloads.

## Automatic Optimizations

The Tova compiler detects common patterns and rewrites them to faster equivalents. You get these for free without changing your code.

### Array Fill Pattern

When the compiler sees an empty array followed by a push loop with a constant value, it replaces the entire pattern with a single pre-allocated array:

```tova
// You write:
var scores = []
for i in range(1000) {
  scores.push(0)
}

// Compiler generates: new Array(1000).fill(0)
```

For boolean fills, the compiler goes further and uses a `Uint8Array`:

```tova
// You write:
var flags = []
for i in range(1000) {
  flags.push(false)
}

// Compiler generates: new Uint8Array(1000)  (3x faster)
```

This optimization triggers automatically when:
- The variable starts as an empty array literal `[]`
- The loop body is a single `push()` call with a constant value
- The value does not depend on the loop variable

### Range Loop Optimization

`for i in range(n)` compiles to a C-style for loop instead of allocating an array:

```tova
for i in range(1000000) {
  // loop body
}

// Compiles to: for (let i = 0; i < 1000000; i++) { ... }
// NOT: for (const i of range(1000000)) { ... }
```

This avoids allocating a million-element array just to iterate.

### Result.map Chain Fusion

Chains of `.map()` calls on `Ok` or `Some` values are fused into a single operation, eliminating intermediate allocations:

```tova
result = Ok(5)
  .map(fn(x) x * 2)
  .map(fn(x) x + 3)
  .map(fn(x) x * 10)

// Compiler generates: Ok((((5 * 2) + 3) * 10))
// Instead of: Ok(5).map(...).map(...).map(...)
```

This is 10x faster for chains of 3 or more maps. The optimization applies when each `.map()` argument is a single-expression lambda.

## @wasm -- WebAssembly Compilation

The `@wasm` decorator compiles a function directly to WebAssembly binary format. Use it for CPU-intensive numeric computations where every cycle counts.

```tova
@wasm fn fibonacci(n: Int) -> Int {
  if n <= 1 { return n }
  fibonacci(n - 1) + fibonacci(n - 2)
}

// Call it like any other function
print(fibonacci(40))
```

The compiler generates a raw WASM binary embedded in the JavaScript output. No external toolchain needed.

### Supported Operations in @wasm

| Category | Supported |
|----------|-----------|
| **Types** | `Int` (i32), `Float` (f64), `Bool` (i32) |
| **Arithmetic** | `+`, `-`, `*`, `/`, `%` |
| **Comparison** | `==`, `!=`, `<`, `>`, `<=`, `>=` |
| **Logic** | `and`, `or`, `not` |
| **Control flow** | `if`/`elif`/`else`, `while`, `for` |
| **Calls** | Recursion, other `@wasm` functions |

### Limitations

- Only numeric types and booleans -- no strings, arrays, or objects
- Can only call other `@wasm` functions (no external JS calls)
- Assignment targets must be simple variables (no `arr[i] = val`)

### When to Use @wasm

Use `@wasm` for tight loops over numeric data: recursive algorithms, simulations, math-heavy computations. On tight integer loops, `@wasm` runs at ~0.87x Go performance.

## @fast -- TypedArray Optimization

The `@fast` decorator enables TypedArray coercion for function parameters. Array parameters with numeric type annotations are automatically converted to typed arrays at function entry, enabling native-speed numeric operations.

```tova
@fast fn dot_product(a: [Float], b: [Float]) -> Float {
  typed_dot(a, b)
}

@fast fn scale_vector(v: [Float], factor: Float) -> [Float] {
  typed_scale(v, factor)
}
```

### Type Mapping

| Tova Annotation | TypedArray |
|----------------|------------|
| `[Int]` | `Int32Array` |
| `[Float]` | `Float64Array` |
| `[Byte]` | `Uint8Array` |
| `[Int8]` | `Int8Array` |
| `[Int16]` | `Int16Array` |
| `[Int32]` | `Int32Array` |
| `[Uint8]` | `Uint8Array` |
| `[Uint16]` | `Uint16Array` |
| `[Uint32]` | `Uint32Array` |
| `[Float32]` | `Float32Array` |

### Typed Stdlib Functions

Use these with `@fast` for maximum performance on numeric arrays:

| Function | Description |
|----------|-------------|
| `typed_sum(arr)` | Sum with Kahan compensation (minimizes float error) |
| `typed_dot(a, b)` | Dot product of two arrays |
| `typed_norm(arr)` | L2 norm (Euclidean length) |
| `typed_add(a, b)` | Element-wise addition |
| `typed_scale(arr, s)` | Multiply every element by scalar |
| `typed_map(arr, f)` | Map function over elements, preserving type |
| `typed_reduce(arr, f, init)` | Reduce with typed array input |
| `typed_sort(arr)` | Sort (returns new typed array) |
| `typed_zeros(n)` | Float64Array of zeros |
| `typed_ones(n)` | Float64Array of ones |
| `typed_fill(arr, val)` | New typed array filled with value |
| `typed_range(start, end, step)` | Float64Array range |
| `typed_linspace(start, end, n)` | n evenly-spaced values |

### Example: Kahan Summation

```tova
@fast fn precise_sum(data: [Float]) -> Float {
  typed_sum(data)
}

// Regular sum of [1e16, 1, -1e16] might lose the 1
// typed_sum uses compensated summation to preserve it
```

### When to Use @fast

Use `@fast` for array-heavy numeric code: signal processing, statistics, linear algebra, simulations. `@fast` dot product runs 1.7x faster than equivalent Go code on 1M elements.

## parallel_map -- Worker Pool

`parallel_map` distributes array processing across multiple CPU cores using a persistent worker pool:

```tova
results = await parallel_map(large_array, fn(item) {
  expensive_computation(item)
})
```

Workers are created once and reused across calls. The array is chunked evenly across available cores.

```tova
// Specify number of workers explicitly
results = await parallel_map(data, process_item, 8)
```

### Behavior

- Automatically detects CPU core count
- Falls back to sequential processing for arrays smaller than 4 elements
- Workers persist across calls (no startup overhead on subsequent calls)

### When to Use parallel_map

Use it when you have a large array and each element requires significant computation. The 3.5x speedup applies to CPU-bound work. For I/O-bound work (network requests, file reads), use `async` with `Promise.all` instead.

## filled() -- Pre-allocated Arrays

`filled(n, value)` creates a pre-allocated array in a single operation:

```tova
grid = filled(1000, 0)
flags = filled(256, false)
names = filled(10, "unknown")
```

This is faster than building an array with a push loop because it allocates the full size upfront.

## Performance Comparison

Tova beats Go on several benchmarks:

| Benchmark | Tova vs Go |
|-----------|-----------|
| Sort (radix) | 3.5x faster |
| Typed arrays | 4x faster |
| JSON processing | 2x faster |
| Fibonacci (iterative) | 2x faster |
| N-body simulation | 1.5x faster |
| @fast dot product | 1.7x faster |
| @wasm integer compute | 0.87x (13% slower) |
| 10-arm match | Faster |
| unwrapOr | Faster |

## Combining Features

These features compose naturally:

```tova
@fast fn process_batch(data: [Float]) -> Float {
  // TypedArray coercion at entry
  typed_dot(data, data) |> Math.sqrt()
}

// Process many batches in parallel
norms = await parallel_map(all_batches, process_batch)
```

For the most demanding workloads, you can use `@wasm` for the inner kernel and `@fast` + `parallel_map` for the data pipeline around it.
