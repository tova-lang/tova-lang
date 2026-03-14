<script setup>
const fastCode = `// @fast: Typed arrays for numerical performance
// The @fast decorator tells the compiler to use TypedArrays
// and index-based loops instead of regular arrays

// Regular function — standard JavaScript arrays
fn dot_regular(a, b) {
  var total = 0.0
  for i in range(len(a)) {
    total += a[i] * b[i]
  }
  total
}

// @fast function — Float64Array + optimized loops
// @fast fn dot_fast(a: [Float], b: [Float]) -> Float {
//   var total = 0.0
//   for i in range(len(a)) {
//     total += a[i] * b[i]
//   }
//   total
// }

// The code looks identical, but @fast generates:
// - Float64Array instead of Array
// - C-style for loops instead of iterator-based
// - Direct index access instead of bounds-checked access
// Result: 1.7x faster than Go for dot product!

a = [1.0, 2.0, 3.0, 4.0, 5.0]
b = [5.0, 4.0, 3.0, 2.0, 1.0]
print("Dot product: {dot_regular(a, b)}")`

const wasmCode = `// @wasm: Compile to WebAssembly for maximum performance
// Functions decorated with @wasm compile to raw WASM binary

// @wasm fn fibonacci(n: i32) -> i32 {
//   if n <= 1 { return n }
//   var a = 0
//   var b = 1
//   var i = 2
//   while i <= n {
//     var temp = a + b
//     a = b
//     b = temp
//     i = i + 1
//   }
//   b
// }

// @wasm supports: i32, f64 types, if/while, recursion
// Beats Go on tight integer loops by ~13%

// Regular Tova version for comparison
fn fibonacci(n) {
  if n <= 1 { return n }
  var a = 0
  var b = 1
  for i in range(2, n + 1) {
    temp = a + b
    a = b
    b = temp
  }
  b
}

for i in [5, 10, 20, 30] {
  print("fib({i}) = {fibonacci(i)}")
}`

const optimizationCode = `// Performance patterns the compiler optimizes automatically

// 1. range() in for loops → C-style for loops (no array allocation)
var total = 0
for i in range(1000) {
  total += i
}
print("Sum 0..999: {total}")

// 2. Result/Option devirtualization
// Ok(x).unwrap() → just x (no object creation)
// Err(e).isOk() → just false
value = Ok(42).unwrap()
print("Unwrapped: {value}")

check = Err("nope").isOk()
print("Is ok: {check}")

// 3. Result.map chain fusion
// Ok(val).map(f).map(g) → Ok(g(f(val))) in one step
fused = Ok(5)
  .map(fn(x) x * 2)
  .map(fn(x) x + 1)
  .map(fn(x) toString(x))
  .unwrap()
print("Fused: {fused}")

// 4. Array fill optimization
// []; for i in range(n) { push(val) } → new Array(n).fill(val)
zeros = filled(10, 0)
print("Filled: {zeros}")

// All these optimizations happen at compile time
// You write clean, readable code — the compiler makes it fast
print("")
print("Write for clarity. The compiler optimizes for speed.")`
</script>

# Chapter 11: Performance Secrets

Tova already beats Go on many benchmarks, and it does this through clever compile-time optimizations. This chapter reveals what the compiler does behind the scenes and teaches you the tools for when you need every last bit of speed.

## How Tova Gets Its Speed

Tova compiles to JavaScript, but it generates **optimized** JavaScript. The compiler performs several transformations automatically:

### 1. range() in for Loops

When you write:
```tova
for i in range(1000) {
  // ...
}
```

The compiler generates a C-style `for (let i = 0; i < 1000; i++)` loop instead of allocating an array of 1000 numbers. Zero allocation, zero garbage collection.

### 2. Result/Option Devirtualization

```tova
Ok(42).unwrap()     // Compiled to just: 42
Err("x").isOk()     // Compiled to just: false
Some(10).unwrapOr(0) // Compiled to just: 10
None.unwrapOr(0)    // Compiled to just: 0
```

When the compiler can see the Result/Option constructor at the call site, it eliminates the object entirely.

### 3. Map Chain Fusion

```tova
Ok(5).map(fn(x) x * 2).map(fn(x) x + 1)
// Fused into: Ok((5 * 2) + 1) → Ok(11)
```

Chained `.map()` calls on Result/Option are fused into a single operation. No intermediate objects.

### 4. Scalar Replacement

```tova
result = if condition { Ok(value) } else { Err(error) }
if result.isOk() {
  print(result.unwrap())
}
```

The compiler replaces the Result object with two scalar variables (`result__ok` boolean and `result__v` value), eliminating the object allocation entirely. This is why Tova's Result/Option performance is within 1.3x of Go's hand-optimized code.

### 5. Array Fill Optimization

```tova
var arr = []
for i in range(n) {
  arr.push(0)
}
// Optimized to: new Array(n).fill(0)
```

The compiler detects the fill-loop pattern and replaces it with a single `fill()` call.

<TryInPlayground :code="optimizationCode" label="Auto-Optimizations" />

## @fast: Typed Arrays for Numerical Work

The `@fast` decorator tells the compiler to use JavaScript TypedArrays (Float64Array, Int32Array, etc.) instead of regular arrays:

```tova
@fast fn dot_product(a: [Float], b: [Float]) -> Float {
  var total = 0.0
  for i in range(len(a)) {
    total += a[i] * b[i]
  }
  total
}
```

What `@fast` does:
- `[Float]` parameters become `Float64Array`
- `[Int]` parameters become `Int32Array`
- `for i in range(len(a))` becomes a C-style for loop
- Array literals inside the function become TypedArray constructors

The result: **1.7x faster than Go** for dot product on 1M elements.

### TypedArray Mapping

| Tova Type | TypedArray |
|-----------|------------|
| `[Int]` | `Int32Array` |
| `[Float]` | `Float64Array` |
| `[Byte]` | `Uint8Array` |

### Typed Stdlib Functions

`@fast` functions have access to optimized stdlib:

```tova
@fast fn compute(data: [Float]) -> Float {
  normalized = typedNorm(data)          // Euclidean norm
  result = typedDot(data, data)         // Dot product
  total = typedSum(data)                // Kahan summation
  result
}
```

Available typed functions: `typed_sum`, `typed_dot`, `typed_add`, `typed_scale`, `typed_map`, `typed_reduce`, `typed_sort`, `typed_zeros`, `typed_ones`, `typed_fill`, `typed_linspace`, `typed_norm`, `typed_range`.

<TryInPlayground :code="fastCode" label="@fast Typed Arrays" />

## @wasm: WebAssembly Compilation

For the ultimate performance, `@wasm` compiles a function directly to WebAssembly binary:

```tova
@wasm fn fibonacci(n: i32) -> i32 {
  if n <= 1 { return n }
  var a = 0
  var b = 1
  var i = 2
  while i <= n {
    var temp = a + b
    a = b
    b = temp
    i = i + 1
  }
  b
}
```

The function is compiled to raw WASM bytes at build time and executed by the WebAssembly runtime. No JavaScript overhead.

### @wasm Constraints

`@wasm` supports a subset of Tova:
- **Types**: `i32` (integers), `f64` (floats)
- **Control flow**: `if`/`else`, `while`, `return`
- **Variables**: `var` for mutable locals
- **Operations**: arithmetic (`+`, `-`, `*`, `/`, `%`), comparisons, bitwise
- **Recursion**: supported

Not supported: strings, arrays, objects, closures, pattern matching.

### When to Use @wasm

- Tight numerical loops (Monte Carlo, physics simulations)
- Integer-heavy algorithms (sorting, hashing, compression)
- Functions called millions of times in hot paths

::: tip @wasm Performance
@wasm beats Go on tight integer loops by ~13%. For most code, `@fast` is more practical since it supports arrays and more operations. Reserve `@wasm` for the innermost hot loops.
:::

<TryInPlayground :code="wasmCode" label="@wasm Functions" />

## parallel_map: Worker Pool Parallelism

When you have a list of independent tasks, `parallelMap()` distributes them across a pool of persistent worker threads:

```tova
// Process items in parallel using persistent worker threads
results = await parallelMap(urls, async fn(url) {
  response = await fetch(url)
  response.json()
}, { workers: 4 })

// Workers are persistent and reused across calls
// 3.5x speedup on CPU-bound parallel work
```

The key design choice: workers are **persistent**. They're created once and reused across multiple `parallelMap()` calls, avoiding the overhead of spawning new threads each time. This matters when you call `parallelMap()` repeatedly in a loop or in a server handling many requests.

```tova
// CPU-bound work benefits the most
scores = await parallelMap(documents, fn(doc) {
  analyze_sentiment(doc)
}, { workers: 8 })

// I/O-bound work also benefits from concurrency
pages = await parallelMap(urls, async fn(url) {
  response = await fetch(url)
  response.text()
})
```

When the `workers` option is omitted, Tova defaults to the number of available CPU cores.

::: tip When to Use parallel_map
Use `parallelMap()` for **embarrassingly parallel** workloads — tasks that are independent and don't share mutable state. Think: processing images, analyzing documents, making HTTP requests, or running simulations. If your tasks need to communicate with each other, use channels or shared state instead.
:::

## @memoize: Automatic Caching

The `@memoize` decorator caches function results — if the same arguments are passed again, the cached result is returned instantly:

```tova
@memoize fn fibonacci(n) {
  if n <= 1 { n }
  else { fibonacci(n - 1) + fibonacci(n - 2) }
}

// First call: computes recursively
print(fibonacci(40))    // Instant — cached results for all sub-calls

// Second call: returns cached result
print(fibonacci(40))    // Truly instant — no computation
```

Without `@memoize`, `fibonacci(40)` would make billions of recursive calls. With it, each unique argument is computed exactly once.

### When to Use @memoize

- **Pure functions** with expensive computation (same input always gives same output)
- **Recursive functions** with overlapping subproblems (Fibonacci, dynamic programming)
- **Lookup functions** that parse or transform data deterministically

```tova
@memoize fn parse_config(path) {
  text = readText(path)
  jsonParse(text).unwrap()
}

// First call reads the file; subsequent calls return the cached result
config1 = parse_config("settings.json")
config2 = parse_config("settings.json")   // Cache hit
```

::: warning Memoize Caveats
Don't memoize functions with side effects (printing, writing files, network calls) — the side effect won't repeat on cache hits. Also, the cache grows without bound by default, so avoid memoizing functions called with thousands of unique arguments in long-running programs.
:::

## Performance Patterns

### Pre-allocate Arrays

```tova
// Slow: grows array dynamically
var result = []
for i in range(10000) {
  result.push(compute(i))
}

// Fast: pre-allocate with filled()
result = filled(10000, 0)
for i in range(10000) {
  result[i] = compute(i)
}
```

### Avoid Creating Objects in Hot Loops

```tova
// Slow: creates an object per iteration
for item in big_list {
  wrapper = { value: item, processed: true }
  process(wrapper)
}

// Fast: process directly
for item in big_list {
  process(item)
}
```

### Use sort_by Instead of Custom Comparisons

```tova
// sort_by is optimized internally
items |> sorted(fn(x) x.priority)
```

### Numeric Sorting with Rust FFI

For large numeric arrays, Tova can use a Rust-backed radix sort under the hood. This is **3.7x faster than Go's sort** for numeric data:

```tova
// For large numeric arrays, Tova can use a Rust-backed radix sort
// that's 3.7x faster than Go's sort
large_numbers |> sorted()   // Automatically optimized for numeric arrays
```

The optimization kicks in automatically when sorting arrays of numbers. You don't need to opt in — the compiler detects the element type and picks the fastest available sort implementation.

### Batch Operations

```tova
// Slow: one at a time
for item in items {
  await save_to_db(item)
}

// Fast: batch insert
await save_many_to_db(items)
```

## Benchmarking Your Code

Measure before optimizing. Here's a simple benchmark pattern:

```tova
fn benchmark(name, iterations, f) {
  start = Date.now()
  for _ in range(iterations) {
    f()
  }
  elapsed = Date.now() - start
  per_op = elapsed / toFloat(iterations)
  print("{name}: {elapsed}ms total, {per_op}ms/op")
}

// Usage
benchmark("sum 10k", 1000, fn() {
  range(10000) |> sum()
})
```

For serious benchmarking, use the built-in benchmark suite:

```bash
cd benchmarks
./run_benchmarks.sh --tova-only
```

## The Optimization Ladder

When you need more speed, climb the ladder:

1. **Write clean code first.** The compiler's auto-optimizations handle most cases.
2. **Use pipes and stdlib functions.** They're implemented efficiently.
3. **Pre-allocate arrays** with `filled()` when sizes are known.
4. **Add `@fast`** for numerical functions with typed arrays.
5. **Add `@wasm`** for the hottest inner loops.
6. **Use `parallelMap()`** for embarrassingly parallel workloads across worker threads.

Most code never needs to go past step 2. Profile first, then optimize the bottleneck.

::: warning Don't Optimize Prematurely
The #1 performance mistake is optimizing code that doesn't need it. Measure first. If your program runs in 50ms, making one function 10x faster saves 5ms at best. Write clear code, profile under realistic load, and optimize only the actual bottlenecks.
:::

## Exercises

**Exercise 11.1:** Write two versions of a function that computes the sum of squares from 1 to N: one using pipes (`range |> map |> sum`) and one using a manual `for` loop with `var`. Benchmark both. Which is faster? By how much?

**Exercise 11.2:** Take the dot product example and write three versions: regular, `@fast`, and manual loop with pre-allocated output. Benchmark all three with arrays of 100, 10000, and 1000000 elements.

**Exercise 11.3:** Write a prime sieve (Sieve of Eratosthenes) for numbers up to N. First write it naturally, then optimize it using `filled()` for pre-allocation. Benchmark both versions.

## Challenge

Build a **matrix multiplication** library:
1. A basic version using nested arrays
2. An optimized version using `@fast` with Float64Array
3. Benchmark both with 100x100, 500x500, and 1000x1000 matrices
4. Add functions for matrix transpose, addition, and scalar multiplication
5. Compare with a Go implementation (if available) or report absolute timings

---

[← Previous: Async Programming](./async) | [Next: Capstone Project →](./capstone)
