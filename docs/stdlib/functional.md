# Functional

Tova provides higher-order utility functions for composition, memoization, and controlling function execution.

## Composition

### compose

```tova
compose(...fns) -> Function
```

Creates a new function that applies functions right-to-left. The last function is applied first.

```tova
double = fn(x) x * 2
inc = fn(x) x + 1

double_then_inc = compose(inc, double)
double_then_inc(3)     // 7  (double(3) = 6, inc(6) = 7)

// Compose many functions
process = compose(upper, trim, fn(s) replace(s, "  ", " "))
process("  hello  world  ")   // "HELLO WORLD"
```

### pipe_fn

```tova
pipe_fn(...fns) -> Function
```

Creates a new function that applies functions left-to-right. The first function is applied first. This is the reverse of `compose`.

```tova
double = fn(x) x * 2
inc = fn(x) x + 1

inc_then_double = pipe_fn(inc, double)
inc_then_double(3)     // 8  (inc(3) = 4, double(4) = 8)

// Build a text processing pipeline
clean = pipe_fn(trim, lower, fn(s) replace(s, "  ", " "))
clean("  Hello  World  ")   // "hello world"
```

### identity

```tova
identity(x) -> x
```

Returns its argument unchanged. Useful as a default function or placeholder in compositions.

```tova
identity(42)           // 42
identity("hello")      // "hello"

// Useful as a default transformer
fn process(items, transform?) {
  t = transform ?? identity
  map(items, t)
}
```

### negate

```tova
negate(fn) -> Function
```

Returns a new function that negates the result of the given predicate function.

```tova
is_even = fn(x) x % 2 == 0
is_odd = negate(is_even)

is_odd(3)     // true
is_odd(4)     // false

// Filter with negated predicate
filter([1, 2, 3, 4, 5], negate(fn(x) x > 3))
// [1, 2, 3]
```

---

## Caching & Control

### memoize

```tova
memoize(fn) -> Function
```

Returns a version of the function that caches results based on arguments. Subsequent calls with the same arguments return the cached result without re-executing.

```tova
expensive = memoize(fn(n) {
  // Simulates expensive computation
  range(n) |> map(fn(x) x * x) |> sum()
})

expensive(1000)    // computed
expensive(1000)    // cached -- instant
```

### once

```tova
once(fn) -> Function
```

Returns a function that executes only on the first call. Subsequent calls return the first result.

```tova
init = once(fn() {
  print("Initializing...")
  { ready: true }
})

init()    // prints "Initializing...", returns { ready: true }
init()    // returns { ready: true } -- no print
init()    // returns { ready: true } -- no print
```

---

## Timing

### debounce

```tova
debounce(fn, ms) -> Function
```

Returns a debounced function that delays execution until `ms` milliseconds have passed since the last call. Useful for search-as-you-type or resize handlers.

```tova
search = debounce(fn(query) {
  print("Searching: {query}")
}, 300)

// Only the last call within 300ms fires
search("h")
search("he")
search("hel")
search("hello")
// After 300ms: "Searching: hello"
```

### throttle

```tova
throttle(fn, ms) -> Function
```

Returns a throttled function that executes at most once every `ms` milliseconds. Useful for scroll handlers or rate-limiting.

```tova
log_scroll = throttle(fn(pos) {
  print("Scroll: {pos}")
}, 100)

// No matter how often called, fires at most every 100ms
```

---

## Partial Application & Currying

### partial

```tova
partial(fn, ...args) -> Function
```

Returns a new function with some arguments pre-filled. The remaining arguments are supplied when the returned function is called.

```tova
add = fn(a, b) a + b
add5 = partial(add, 5)

add5(3)         // 8
add5(10)        // 15

// Pre-fill multiple arguments
greet = fn(greeting, name) "{greeting}, {name}!"
hello = partial(greet, "Hello")
hello("Alice")  // "Hello, Alice!"
```

### curry

```tova
curry(fn, arity?) -> Function
```

Returns a curried version of the function. Each argument can be supplied one at a time, and the function executes when all arguments are provided.

```tova
add = curry(fn(a, b, c) a + b + c)

add(1)(2)(3)       // 6
add(1, 2)(3)       // 6
add(1)(2, 3)       // 6
add(1, 2, 3)       // 6
```

### flip

```tova
flip(fn) -> Function
```

Returns a new function with the first two arguments swapped.

```tova
sub = fn(a, b) a - b
flipped_sub = flip(sub)

sub(10, 3)          // 7
flipped_sub(3, 10)  // 7  (calls sub(10, 3))

// Useful for making functions pipe-friendly
contains_in = flip(contains)
"hello" |> contains_in("ell")   // true
```

---

## Pipeline Examples

```tova
// Build a reusable data pipeline
process_users = pipe_fn(
  fn(users) filter(users, fn(u) u.active),
  fn(users) sorted(users, fn(u) u.name),
  fn(users) map(users, fn(u) pick(u, ["name", "email"]))
)

process_users(all_users)

// Compose validators
validate = compose(
  fn(s) if len(s) < 3 { Err("too short") } else { Ok(s) },
  fn(s) trim(s)
)

// Partial application for reusable transforms
multiply = curry(fn(a, b) a * b)
double = multiply(2)
triple = multiply(3)

[1, 2, 3] |> map(double)    // [2, 4, 6]
[1, 2, 3] |> map(triple)    // [3, 6, 9]
```
