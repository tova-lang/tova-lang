<script setup>
const composeCode = `// compose: build new functions from existing ones
fn add_one(x) { x + 1 }
fn double(x) { x * 2 }
fn square(x) { x * x }

// compose runs right-to-left: square first, then double
double_then_square = compose(square, double)
print(double_then_square(3))   // square(double(3)) = square(6) = 36

// pipe_fn runs left-to-right: add_one first, then double, then square
pipeline = pipe_fn(add_one, double, square)
print(pipeline(3))   // square(double(add_one(3))) = square(double(4)) = square(8) = 64

// Build data processing pipelines
normalize = pipe_fn(
  fn(s) trim(s),
  fn(s) lower(s),
  fn(s) replace(s, " ", "_")
)

print(normalize("  Hello World  "))   // "hello_world"
print(normalize(" FOO BAR "))         // "foo_bar"`

const curryPartialCode = `// curry: transform a multi-argument function into a chain of single-argument functions
fn add(a, b, c) { a + b + c }

curried_add = curry(add)
print(curried_add(1)(2)(3))   // 6

// Partially apply for reusable specialized functions
add_ten = curried_add(10)
add_ten_and_five = add_ten(5)
print(add_ten_and_five(3))    // 18

// partial: fix the first arguments, leave the rest open
fn log_message(level, category, msg) {
  print("[{level}] ({category}) {msg}")
}

info = partial(log_message, "INFO")
info("auth", "User logged in")
info("db", "Connection established")

error = partial(log_message, "ERROR")
error("auth", "Invalid credentials")

// Combine partial with collection operations
fn multiply(a, b) { a * b }
double_all = partial(map, _, fn(x) multiply(2, x))

// Or more naturally with curry
times = curry(multiply)
triple = times(3)
print([1, 2, 3, 4] |> map(triple))   // [3, 6, 9, 12]`

const memoizeCode = `// memoize: cache expensive function results
fn slow_fibonacci(n) {
  if n <= 1 { n }
  else { slow_fibonacci(n - 1) + slow_fibonacci(n - 2) }
}

// Without memoize: exponentially slow
// With memoize: each value computed only once
fast_fib = memoize(fn(n) {
  if n <= 1 { n }
  else { fast_fib(n - 1) + fast_fib(n - 2) }
})

for i in range(0, 15) {
  print("fib({i}) = {fast_fib(i)}")
}

// Practical: cache API responses
fn make_cached_lookup() {
  lookup = memoize(fn(key) {
    print("  Computing for key: {key}")
    key |> upper() |> repeat(3)
  })

  print("First call:")
  print(lookup("hello"))

  print("Second call (cached):")
  print(lookup("hello"))

  print("Different key:")
  print(lookup("world"))
}

make_cached_lookup()`

const utilsCode = `// once: ensure a function runs only once
init = once(fn() {
  print("Initializing system...")
  { status: "ready", timestamp: "now" }
})

result1 = init()
print("First:  {result1.status}")

result2 = init()
print("Second: {result2.status}")   // Same result, no re-initialization

// negate: flip a predicate
is_positive = fn(x) x > 0
is_not_positive = negate(is_positive)

numbers = [-3, -1, 0, 2, 5, -4, 7]
print("Non-positive: {numbers |> filter(is_not_positive)}")

// flip: swap the first two arguments
fn divide(a, b) { a / b }
inverse_divide = flip(divide)

print(divide(10, 2))          // 5
print(inverse_divide(10, 2))  // 0.2 (args swapped: 2 / 10)

// Practical: flip is useful with partial application
fn greet(greeting, name) { "{greeting}, {name}!" }

greet_alice = partial(flip(greet), "Alice")
print(greet_alice("Hello"))     // "Hello, Alice!"
print(greet_alice("Bonjour"))   // "Bonjour, Alice!"

// identity: the do-nothing function (surprisingly useful)
values = [0, "", false, "hello", 42, nil, true]
truthy = values |> filter(identity)
print("Truthy values: {truthy}")   // ["hello", 42, true]`

const debounceThrottleCode = `// debounce and throttle control function execution frequency

// debounce: wait until calls stop, then execute once
// Useful for: search-as-you-type, window resize handlers
fn make_search_demo() {
  search = debounce(fn(query) {
    print("Searching for: {query}")
  }, 300)

  // Rapid calls — only the last one fires (after 300ms pause)
  search("h")
  search("he")
  search("hel")
  search("hell")
  search("hello")
  // Only "hello" triggers the actual search
}

// throttle: execute at most once per interval
// Useful for: scroll handlers, rate-limited APIs, progress updates
fn make_progress_demo() {
  report = throttle(fn(pct) {
    print("Progress: {pct}%")
  }, 500)

  // Even if called 100 times, only fires every 500ms
  for i in range(0, 101) {
    report(i)
  }
}

print("--- Debounce Demo ---")
make_search_demo()

print("")
print("--- Throttle Demo ---")
make_progress_demo()`

const projectCode = `// PROJECT: Validation Pipeline Builder
// Compose validators into reusable pipelines

// A validator returns Ok(value) or Err(message)
fn required(value) {
  if value == nil or value == "" {
    Err("Value is required")
  } else {
    Ok(value)
  }
}

fn min_length(n) {
  fn(value) {
    if len(to_string(value)) < n {
      Err("Must be at least {n} characters")
    } else {
      Ok(value)
    }
  }
}

fn max_length(n) {
  fn(value) {
    if len(to_string(value)) > n {
      Err("Must be at most {n} characters")
    } else {
      Ok(value)
    }
  }
}

fn matches_pattern(pattern, message) {
  fn(value) {
    if regex_test(pattern, to_string(value)) {
      Ok(value)
    } else {
      Err(message)
    }
  }
}

// Compose validators: run each in sequence, stop on first error
fn validate_all(...validators) {
  fn(value) {
    var current = Ok(value)
    for v in validators {
      match current {
        Ok(val) => { current = v(val) }
        Err(_) => { return current }
      }
    }
    current
  }
}

// Build specific validators by composing primitives
validate_username = validate_all(
  required,
  min_length(3),
  max_length(20),
  matches_pattern(r"^[a-zA-Z0-9_]+$", "Only letters, numbers, and underscores")
)

validate_email = validate_all(
  required,
  min_length(5),
  matches_pattern(r"@", "Must contain @")
)

// Test the validators
test_values = [
  { field: "username", value: "", validator: validate_username },
  { field: "username", value: "ab", validator: validate_username },
  { field: "username", value: "alice_123", validator: validate_username },
  { field: "username", value: "has spaces!", validator: validate_username },
  { field: "email", value: "alice@test.com", validator: validate_email },
  { field: "email", value: "invalid", validator: validate_email },
]

for t in test_values {
  result = t.validator(t.value)
  status = match result {
    Ok(_) => green("PASS")
    Err(msg) => red("FAIL: {msg}")
  }
  print("{pad_end(t.field, 10)} {pad_end(to_string(t.value), 20)} {status}")
}`
</script>

# Chapter 13: Functional Programming

Tova's standard library includes a set of powerful functional programming utilities that let you build complex behavior by composing simple functions. These tools — `compose`, `curry`, `partial`, `memoize`, and others — aren't just academic exercises. They're practical tools for building reusable, testable code.

By the end of this chapter, you'll build a composable validation pipeline.

## compose and pipe_fn

These two functions let you build new functions by chaining existing ones together.

### compose — Right to Left

`compose(f, g)` creates a new function that applies `g` first, then `f`:

```tova
fn add_one(x) { x + 1 }
fn double(x) { x * 2 }

add_then_double = compose(double, add_one)
print(add_then_double(3))   // double(add_one(3)) = double(4) = 8
```

`compose` reads like mathematical notation: `compose(f, g)(x)` = `f(g(x))`. You can compose any number of functions:

```tova
fn negate_num(x) { 0 - x }

transform = compose(negate_num, double, add_one)
print(transform(3))   // negate(double(add_one(3))) = negate(8) = -8
```

### pipe_fn — Left to Right

`pipe_fn` does the same thing but in the order you read:

```tova
pipeline = pipe_fn(add_one, double, negate_num)
print(pipeline(3))   // same result: -8
```

`pipe_fn` is often more intuitive because the data flows left-to-right, matching how you read code. Use whichever feels more natural.

```tova
// Build a text normalizer by piping string operations
normalize = pipe_fn(
  fn(s) trim(s),
  fn(s) lower(s),
  fn(s) replace(s, " ", "_")
)

print(normalize("  Hello World  "))   // "hello_world"
```

<TryInPlayground :code="composeCode" label="compose and pipe_fn" />

::: tip compose vs. pipe_fn vs. |>
The `|>` pipe operator works on **values**: `value |> fn1() |> fn2()`. `compose` and `pipe_fn` work on **functions**: they create a new function without calling it. Use `|>` when you have data to process now. Use `compose`/`pipe_fn` when you're building a reusable transformation to apply later.
:::

## curry — One Argument at a Time

`curry` transforms a function that takes multiple arguments into a series of functions that each take one:

```tova
fn add(a, b) { a + b }

curried = curry(add)
add_five = curried(5)

print(add_five(3))    // 8
print(add_five(10))   // 15
```

Each call returns a new function until all arguments are provided:

```tova
fn volume(l, w, h) { l * w * h }

curried_vol = curry(volume)
print(curried_vol(2)(3)(4))   // 24

// Create specialized functions
boxes_2m_wide = curried_vol(2)
boxes_2x3 = boxes_2m_wide(3)
print(boxes_2x3(5))   // 30
```

### Currying with Collection Operations

Currying shines when combined with `map`, `filter`, and other higher-order functions:

```tova
fn multiply(a, b) { a * b }

times = curry(multiply)
double = times(2)
triple = times(3)

numbers = [1, 2, 3, 4, 5]
print(numbers |> map(double))   // [2, 4, 6, 8, 10]
print(numbers |> map(triple))   // [3, 6, 9, 12, 15]
```

```tova
fn greater_than(threshold, value) { value > threshold }

above = curry(greater_than)
above_10 = above(10)
above_50 = above(50)

scores = [5, 12, 48, 73, 8, 55, 91]
print(scores |> filter(above_10))   // [12, 48, 73, 55, 91]
print(scores |> filter(above_50))   // [73, 55, 91]
```

<TryInPlayground :code="curryPartialCode" label="curry and partial" />

## partial — Fix Some Arguments

`partial` is similar to currying but fixes specific arguments upfront and returns a function that takes the rest:

```tova
fn log_message(level, category, msg) {
  print("[{level}] ({category}) {msg}")
}

// Fix the first argument
info = partial(log_message, "INFO")
error = partial(log_message, "ERROR")

info("auth", "User logged in")
// [INFO] (auth) User logged in

error("db", "Connection failed")
// [ERROR] (db) Connection failed

// Fix two arguments
auth_info = partial(log_message, "INFO", "auth")
auth_info("Session started")
// [INFO] (auth) Session started
```

### curry vs. partial

| Feature | `curry` | `partial` |
|---------|---------|-----------|
| Arguments applied | One at a time | Any number at once |
| Returns | Curried function chain | Single partially-applied function |
| Best for | Creating families of functions | Fixing known arguments |

```tova
// curry: create a family of comparators
fn clamp(lo, hi, value) { max(lo, min(hi, value)) }

bounded = curry(clamp)
percent = bounded(0)(100)       // clamp to 0-100
byte_val = bounded(0)(255)      // clamp to 0-255

print(percent(150))   // 100
print(byte_val(-5))   // 0

// partial: fix known context
fn send_email(from, to, subject, body) {
  print("From: {from} | To: {to} | {subject}")
}

send_from_system = partial(send_email, "system@app.com")
send_from_system("user@test.com", "Welcome", "Hello!")
```

## memoize — Cache Results

`memoize` wraps a function so that repeated calls with the same arguments return a cached result instead of recomputing:

```tova
expensive = memoize(fn(n) {
  print("Computing for {n}...")
  n * n * n
})

print(expensive(5))   // "Computing for 5..." then 125
print(expensive(5))   // 125 (no computation — cached)
print(expensive(3))   // "Computing for 3..." then 27
print(expensive(5))   // 125 (still cached)
```

### Memoized Recursion

Memoization transforms exponential-time recursion into linear time:

```tova
// Without memoize: O(2^n) — unusably slow for n > 30
fn slow_fib(n) {
  if n <= 1 { n }
  else { slow_fib(n - 1) + slow_fib(n - 2) }
}

// With memoize: O(n) — instant even for large n
fast_fib = memoize(fn(n) {
  if n <= 1 { n }
  else { fast_fib(n - 1) + fast_fib(n - 2) }
})

print(fast_fib(50))   // 12586269025 (instant)
```

<TryInPlayground :code="memoizeCode" label="memoize" />

::: warning Memoize Caveats
`memoize` uses argument serialization for cache keys. It works well for primitives (numbers, strings, booleans) but may not behave as expected for complex objects. Also, the cache grows indefinitely — don't memoize functions with unbounded input ranges in long-running processes.
:::

## once — Run Exactly Once

`once` ensures a function executes only on its first call. Subsequent calls return the first result:

```tova
init_database = once(fn() {
  print("Connecting to database...")
  { connection: "db://localhost", status: "connected" }
})

// First call: runs the function
db = init_database()
print(db.status)   // "connected"

// Second call: returns cached result, no re-execution
db2 = init_database()
print(db2.status)  // "connected" (same object, no reconnection)
```

Use `once` for:
- **Initialization** that should happen exactly once
- **Expensive setup** (database connections, config loading)
- **Singleton patterns** without global mutable state

## negate — Flip a Predicate

`negate` takes a predicate function and returns one that returns the opposite boolean:

```tova
is_even = fn(x) x % 2 == 0
is_odd = negate(is_even)

numbers = [1, 2, 3, 4, 5, 6, 7, 8]
print(numbers |> filter(is_even))   // [2, 4, 6, 8]
print(numbers |> filter(is_odd))    // [1, 3, 5, 7]
```

This is cleaner than writing `fn(x) !is_even(x)` and composes well with other functional utilities:

```tova
is_empty_str = fn(s) len(trim(s)) == 0
has_content = negate(is_empty_str)

inputs = ["hello", "", "  ", "world", "   ", "tova"]
valid = inputs |> filter(has_content)
print(valid)   // ["hello", "world", "tova"]
```

## flip — Swap Arguments

`flip` takes a function and returns a new one with the first two arguments swapped:

```tova
fn divide(a, b) { a / b }

// Normal: divide(10, 2) = 5
print(divide(10, 2))

// Flipped: divide(2, 10) = 0.2
flipped_divide = flip(divide)
print(flipped_divide(10, 2))
```

`flip` is useful when you want to partially apply the *second* argument:

```tova
fn starts_with_check(prefix, text) { starts_with(text, prefix) }

// We want to fix the text, not the prefix
check_greeting = partial(flip(starts_with_check), "Hello World")
print(check_greeting("Hello"))   // true
print(check_greeting("Bye"))     // false
```

## identity — The Do-Nothing Function

`identity` returns its argument unchanged. This seems useless, but it's surprisingly handy:

```tova
print(identity(42))        // 42
print(identity("hello"))   // "hello"
```

### Practical Uses of identity

**Filter truthy values:**

```tova
values = [0, "", nil, "hello", 42, false, true]
truthy = values |> filter(identity)
print(truthy)   // ["hello", 42, true]
```

**Default transformation:**

```tova
fn process(items, transform) {
  transform_fn = transform ?? identity
  items |> map(transform_fn)
}

// No transform — identity passes values through
print(process([1, 2, 3], nil))           // [1, 2, 3]
print(process([1, 2, 3], fn(x) x * 2))  // [2, 4, 6]
```

**Conditional pipeline steps:**

```tova
fn build_pipeline(options) {
  pipe_fn(
    fn(s) trim(s),
    if options.lowercase { fn(s) lower(s) } else { identity },
    if options.truncate { fn(s) substr(s, 0, 10) } else { identity }
  )
}

clean = build_pipeline({ lowercase: true, truncate: false })
print(clean("  HELLO WORLD  "))   // "hello world"
```

<TryInPlayground :code="utilsCode" label="once, negate, flip, identity" />

## debounce — Wait for Calm

`debounce(fn, ms)` creates a function that delays execution until `ms` milliseconds have passed since the last call. If called again before the delay expires, the timer resets:

```tova
save_draft = debounce(fn(text) {
  print("Saving: {text}")
}, 1000)

// User types rapidly
save_draft("H")
save_draft("He")
save_draft("Hel")
save_draft("Hell")
save_draft("Hello")
// Only "Hello" is saved — after 1 second of no typing
```

Use `debounce` for:
- **Search-as-you-type** (wait until the user stops typing)
- **Window resize handlers** (recalculate only after resizing stops)
- **Auto-save** (save after a pause in editing)

## throttle — Limit Frequency

`throttle(fn, ms)` creates a function that executes at most once every `ms` milliseconds. Calls during the cooldown period are ignored:

```tova
report_scroll = throttle(fn(position) {
  print("Scroll position: {position}")
}, 200)

// Even if scroll fires 60 times per second,
// this logs at most every 200ms
```

Use `throttle` for:
- **Scroll and mouse move handlers** (limit processing frequency)
- **Rate-limited API calls** (respect API rate limits)
- **Progress reporting** (update UI at a reasonable frequency)

<TryInPlayground :code="debounceThrottleCode" label="debounce and throttle" />

### debounce vs. throttle

| Behavior | `debounce` | `throttle` |
|----------|------------|------------|
| When it fires | After `ms` of silence | At most every `ms` |
| During rapid calls | Keeps resetting timer | Fires on first, ignores rest until cooldown |
| Best for | "Wait until done" | "Limit frequency" |
| Example | Search input | Scroll handler |

## Combining Functional Utilities

The real power of these tools emerges when you combine them:

```tova
// Build a robust API client with functional composition
fn make_api(base_url) {
  // Cache responses
  cached_fetch = memoize(fn(endpoint) {
    print("Fetching {base_url}{endpoint}...")
    { data: "response from {endpoint}" }
  })

  // Throttle requests to respect rate limits
  throttled_fetch = throttle(cached_fetch, 1000)

  // Return a clean interface
  {
    get: fn(endpoint) throttled_fetch(endpoint),
    url: base_url
  }
}

api = make_api("https://api.example.com")
```

```tova
// Build a data processing pipeline with reusable transforms
parse_number = pipe_fn(
  fn(s) trim(s),
  fn(s) replace(s, ",", ""),
  fn(s) to_float(s)
)

format_currency = pipe_fn(
  fn(n) round(n * 100) / 100,
  fn(n) to_string(n),
  fn(s) "$" ++ s
)

process_price = pipe_fn(parse_number, format_currency)

prices = ["  1,234.5 ", "99.999", " 42 "]
print(prices |> map(process_price))
// ["$1234.5", "$100.0", "$42.0"]
```

## Project: Validation Pipeline Builder

Let's build a composable validation system using functional programming:

```tova
// Base validators return Ok(value) or Err(message)
fn required(value) {
  if value == nil or value == "" {
    Err("Value is required")
  } else {
    Ok(value)
  }
}

fn min_length(n) {
  fn(value) {
    if len(to_string(value)) < n {
      Err("Must be at least {n} characters")
    } else {
      Ok(value)
    }
  }
}

fn max_length(n) {
  fn(value) {
    if len(to_string(value)) > n {
      Err("Must be at most {n} characters")
    } else {
      Ok(value)
    }
  }
}

fn matches_pattern(pattern, message) {
  fn(value) {
    if regex_test(pattern, to_string(value)) {
      Ok(value)
    } else {
      Err(message)
    }
  }
}

// Compose validators: run each in sequence, stop on first error
fn validate_all(...validators) {
  fn(value) {
    var current = Ok(value)
    for v in validators {
      match current {
        Ok(val) => { current = v(val) }
        Err(_) => { return current }
      }
    }
    current
  }
}

// Build specific validators by composing primitives
validate_username = validate_all(
  required,
  min_length(3),
  max_length(20),
  matches_pattern(r"^[a-zA-Z0-9_]+$", "Only letters, numbers, and underscores")
)

validate_email = validate_all(
  required,
  min_length(5),
  matches_pattern(r"@", "Must contain @")
)

// Test
tests = ["", "ab", "alice_123", "has spaces!", "valid_user"]
for t in tests {
  result = validate_username(t)
  status = match result {
    Ok(_) => "PASS"
    Err(msg) => "FAIL: {msg}"
  }
  print("{pad_end(t, 15)} {status}")
}
```

The key insight: each validator is a function. `validate_all` composes them. `min_length(3)` and `max_length(20)` are **factory functions** — they use closures to capture configuration and return validators. This is functional programming at its most practical.

<TryInPlayground :code="projectCode" label="Validation Pipeline" />

## Exercises

**Exercise 13.1:** Write a `retry_fn(f, n)` function using `compose` or `pipe_fn` that creates a function which tries `f()` up to `n` times, returning the first `Ok` result or the last `Err`. Don't use a loop — use recursion with a counter closure.

**Exercise 13.2:** Use `curry` to create a family of string formatting functions: `pad_to(width, char, text)`. Then create `pad_to_20 = curry(pad_to)(20)(" ")` and use it with `map` to align a list of strings.

**Exercise 13.3:** Build a `middleware` combinator. Given an array of functions `[fn(x) -> x, fn(x) -> x, ...]`, compose them into a single function that runs each in sequence, passing the result of one to the next. Then build a request processing pipeline: `log -> authenticate -> validate -> handle`.

**Exercise 13.4:** Create a memoized `factorize(n)` function that returns the prime factors of a number. Use `memoize` to cache results so that `factorize(12)` benefits from already having computed `factorize(6)` and `factorize(4)`.

## Challenge

Build a **function testing framework** using functional programming:
1. `describe(name, ...tests)` — groups tests under a label
2. `it(name, fn)` — defines a single test case
3. `expect(value)` — returns an object with `.toBe(x)`, `.toContain(x)`, `.toThrow()`
4. All assertions should use `Result` — `Ok` for pass, `Err` for failure
5. The runner should compose all test results and print a summary

Use `compose`, `partial`, and `pipe_fn` to build the assertion chain. Use `once` to ensure setup functions run exactly once. Use `memoize` to cache test fixtures.

---

[← Previous: Capstone: Text Analyzer](./capstone) | [Next: Standard Library Mastery →](./stdlib-mastery)
