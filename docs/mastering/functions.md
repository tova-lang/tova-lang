<script setup>
const basicFnCode = `// Functions are declared with fn
fn greet(name) {
  "Hello, {name}!"
}

print(greet("World"))

// The last expression is the return value — no return keyword needed
fn add(a, b) {
  a + b
}

print(add(3, 4))

// Single-expression functions are concise
fn double(x) { x * 2 }
fn square(x) { x * x }
fn is_even(x) { x % 2 == 0 }

print(double(5))
print(square(4))
print(is_even(7))`

const lambdasCode = `// Lambdas: anonymous functions
double = fn(x) x * 2
add = fn(a, b) a + b

print(double(21))
print(add(3, 4))

// Lambdas shine with higher-order functions
numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

evens = numbers |> filter(fn(x) x % 2 == 0)
print("Evens: {evens}")

squared = numbers |> map(fn(x) x * x)
print("Squared: {squared}")

total = numbers |> reduce(fn(acc, x) acc + x, 0)
print("Sum: {total}")

// Lambdas with multiple lines use braces
transform = fn(items) {
  items
    |> filter(fn(x) x > 3)
    |> map(fn(x) x * 10)
}

print(transform(numbers))`

const closureCode = `// Closures capture their environment
fn make_greeter(greeting) {
  fn(name) "{greeting}, {name}!"
}

hello = make_greeter("Hello")
howdy = make_greeter("Howdy")

print(hello("Alice"))
print(howdy("Bob"))

// Practical: create a multiplier factory
fn multiplier(factor) {
  fn(x) x * factor
}

triple = multiplier(3)
times_ten = multiplier(10)

numbers = [1, 2, 3, 4, 5]
print(numbers |> map(triple))
print(numbers |> map(times_ten))

// Counter with mutable closure
fn make_counter(start) {
  var current = start
  {
    next: fn() {
      current += 1
      current
    },
    value: fn() current
  }
}

ctr = make_counter(0)
print(ctr.next())
print(ctr.next())
print(ctr.next())
print("Current: {ctr.value()}")`

const recursionCode = `// Classic recursion: factorial
fn factorial(n) {
  if n <= 1 { 1 }
  else { n * factorial(n - 1) }
}

print("5! = {factorial(5)}")
print("10! = {factorial(10)}")

// Fibonacci with recursion
fn fib(n) {
  match n {
    0 => 0
    1 => 1
    n => fib(n - 1) + fib(n - 2)
  }
}

for i in range(10) {
  print("fib({i}) = {fib(i)}")
}

// Practical recursion: flatten nested arrays
fn flatten(items) {
  var result = []
  for item in items {
    if type_of(item) == "List" {
      for sub in flatten(item) {
        result.push(sub)
      }
    } else {
      result.push(item)
    }
  }
  result
}

nested = [1, [2, 3], [4, [5, 6]], 7]
print(flatten(nested))`

const mathToolkitCode = `// PROJECT: Math Toolkit
// Higher-order functions + closures in action

// Compose two functions into one
fn compose(f, g) {
  fn(x) f(g(x))
}

// Apply a function n times
fn apply_n(f, n_times, start) {
  var result = start
  for _ in range(n_times) {
    result = f(result)
  }
  result
}

// Numerical derivative (approximation)
fn derivative(f, dx) {
  fn(x) (f(x + dx) - f(x)) / dx
}

// Create some functions
square = fn(x) x * x
increment = fn(x) x + 1

// Compose: (x + 1)²
inc_then_square = compose(square, increment)
print("inc_then_square(4) = {inc_then_square(4)}")

// Apply: double 5 times starting from 1
result = apply_n(fn(x) x * 2, 5, 1)
print("2^5 = {result}")

// Derivative of x² is approximately 2x
d_square = derivative(square, 0.0001)
print("d/dx(x²) at x=3: {d_square(3.0)}")
print("d/dx(x²) at x=5: {d_square(5.0)}")

// Sum a series with a custom term function
fn sum_series(from_n, to_n, term) {
  var total = 0.0
  for i in range(from_n, to_n + 1) {
    total += term(i)
  }
  total
}

// Sum of squares: 1² + 2² + ... + 10²
sum_sq = sum_series(1, 10, fn(n) to_float(n * n))
print("Sum of squares 1..10: {sum_sq}")

// Approximate pi using Leibniz formula
pi_approx = 4.0 * sum_series(0, 10000, fn(k) {
  sign = if k % 2 == 0 { 1.0 } else { -1.0 }
  sign / (2.0 * to_float(k) + 1.0)
})
print("Pi approx: {pi_approx}")`
</script>

# Chapter 2: Functions That Shine

Functions are the heart of Tova. A well-written Tova program is a collection of small, focused functions that compose together to solve big problems. This chapter covers every function form in the language — and by the end, you'll build a math toolkit that computes derivatives using nothing but functions.

## Declaring Functions

The `fn` keyword declares a function. The last expression in the body is the return value:

```tova
fn greet(name) {
  "Hello, {name}!"
}

fn add(a, b) {
  a + b
}

// Single-expression functions can be compact
fn double(x) { x * 2 }
fn is_positive(x) { x > 0 }
```

No `return` keyword needed for the common case. The body is an expression, and expressions produce values.

::: tip When to Use `return`
Use `return` only for **early exits** — when you want to bail out of a function before reaching the end:
```tova
fn find_first_negative(items) {
  for item in items {
    if item < 0 { return item }
  }
  None
}
```
For everything else, let the last expression be the return value.
:::

<TryInPlayground :code="basicFnCode" label="Basic Functions" />

## Default Parameters

Give parameters default values with `=`:

```tova
fn greet(name, greeting = "Hello") {
  "{greeting}, {name}!"
}

print(greet("Alice"))              // "Hello, Alice!"
print(greet("Alice", "Bonjour"))   // "Bonjour, Alice!"
```

```tova
fn create_user(name, role = "member", active = true) {
  { name: name, role: role, active: active }
}

user = create_user("Alice")
admin = create_user("Bob", "admin")
```

## Type Annotations on Functions

Annotate parameters and return types for clarity:

```tova
fn calculate_area(width: Float, height: Float) -> Float {
  width * height
}

fn is_valid_email(email: String) -> Bool {
  contains(email, "@")
}
```

Type annotations are optional but excellent documentation. Use them on public-facing functions and when the types aren't obvious from the code.

## Lambdas (Anonymous Functions)

Lambdas are functions without names. They're written as `fn(params) body`:

```tova
double = fn(x) x * 2
add = fn(a, b) a + b
```

Lambdas are essential for working with higher-order functions:

```tova
numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

evens = numbers |> filter(fn(x) x % 2 == 0)
squared = numbers |> map(fn(x) x * x)
total = numbers |> reduce(fn(acc, x) acc + x, 0)
```

Multi-line lambdas use braces:

```tova
process = fn(items) {
  items
    |> filter(fn(x) x > 0)
    |> map(fn(x) x * 2)
    |> sorted()
}
```

<TryInPlayground :code="lambdasCode" label="Lambdas" />

::: warning Lambda Syntax
Tova lambdas use `fn(x) body`, **not** `fn(x) => body`. There's no arrow. The body follows the parameter list directly.
:::

## Higher-Order Functions

A higher-order function takes a function as an argument or returns a function. You've already seen `map`, `filter`, and `reduce` — they're all higher-order functions from the stdlib. Let's write our own:

```tova
// Takes a function, applies it to every element
fn apply_to_all(items, f) {
  var result = []
  for item in items {
    result.push(f(item))
  }
  result
}

labels = apply_to_all(["alice", "bob"], fn(name) upper(name))
print(labels)   // ["ALICE", "BOB"]
```

```tova
// Returns a function that checks a threshold
fn above(threshold) {
  fn(x) x > threshold
}

numbers = [10, 25, 3, 47, 8, 31]
big_numbers = numbers |> filter(above(20))
print(big_numbers)   // [25, 47, 31]
```

## Closures

When a function captures variables from its surrounding scope, it creates a **closure**. The captured variables live as long as the function does:

```tova
fn make_greeter(greeting) {
  fn(name) "{greeting}, {name}!"
}

hello = make_greeter("Hello")
hola = make_greeter("Hola")

print(hello("World"))   // "Hello, World!"
print(hola("Mundo"))    // "Hola, Mundo!"
```

Closures are powerful for creating specialized functions:

```tova
fn multiplier(factor) {
  fn(x) x * factor
}

triple = multiplier(3)
percent = multiplier(0.01)

print(triple(7))     // 21
print(percent(250))  // 2.5
```

```tova
fn make_counter(start) {
  var n = start
  {
    next: fn() { n += 1; n },
    reset: fn() { n = start },
    value: fn() n
  }
}

ctr = make_counter(0)
print(ctr.next())    // 1
print(ctr.next())    // 2
print(ctr.next())    // 3
ctr.reset()
print(ctr.value())   // 0
```

<TryInPlayground :code="closureCode" label="Closures" />

## Destructuring Parameters

Functions can destructure their arguments directly in the parameter list:

```tova
// Object destructuring
fn full_name({first, last}) {
  "{first} {last}"
}

user = { first: "Alice", last: "Smith", age: 30 }
print(full_name(user))   // "Alice Smith"
```

```tova
// Array destructuring
fn head_and_tail([head, ...tail]) {
  print("Head: {head}")
  print("Tail: {tail}")
}

head_and_tail([1, 2, 3, 4, 5])
```

```tova
// Combine with defaults
fn connect({host = "localhost", port = 3000}) {
  print("Connecting to {host}:{port}")
}

connect({ port: 8080 })   // "Connecting to localhost:8080"
```

## Recursion

Tova supports recursion naturally. Use it when a problem has recursive structure:

```tova
fn factorial(n) {
  if n <= 1 { 1 }
  else { n * factorial(n - 1) }
}
```

Pattern matching makes recursive functions elegant:

```tova
fn fib(n) {
  match n {
    0 => 0
    1 => 1
    n => fib(n - 1) + fib(n - 2)
  }
}
```

Recursive data processing:

```tova
fn depth(tree) {
  match tree {
    { left: l, right: r } => 1 + max_of(depth(l), depth(r))
    _ => 0
  }
}
```

<TryInPlayground :code="recursionCode" label="Recursion" />

::: tip Recursion vs. Iteration
Use recursion when the problem is naturally recursive (trees, nested structures, divide-and-conquer). Use iteration (`for`, `while`) for flat data or when performance matters. Tova doesn't currently optimize tail calls, so very deep recursion can overflow the stack.
:::

## Generators

Generators produce values lazily using `yield`:

```tova
fn* naturals() {
  var n = 0
  while true {
    yield n
    n += 1
  }
}

fn* take(iter, n_items) {
  var count = 0
  for item in iter {
    if count >= n_items { return }
    yield item
    count += 1
  }
}

// Get first 5 natural numbers
var first_five = []
for item in take(naturals(), 5) {
  first_five.push(item)
}
print(first_five)   // [0, 1, 2, 3, 4]
```

Generators are useful for:
- Infinite sequences
- Processing large datasets without loading everything into memory
- Custom iteration patterns

## Project: Math Toolkit

Let's build a toolkit that demonstrates higher-order functions and closures working together:

```tova
// Compose: chain two functions into one
fn compose(f, g) {
  fn(x) f(g(x))
}

// Apply a function n times
fn apply_n(f, n_times, start) {
  var result = start
  for _ in range(n_times) {
    result = f(result)
  }
  result
}

// Numerical derivative approximation
fn derivative(f, dx) {
  fn(x) (f(x + dx) - f(x)) / dx
}

// Sum a mathematical series
fn sum_series(from_n, to_n, term) {
  var total = 0.0
  for i in range(from_n, to_n + 1) {
    total += term(i)
  }
  total
}

// Put it all together
square = fn(x) x * x
cube = fn(x) x * x * x

// Compose: square after increment
square_plus_one = compose(square, fn(x) x + 1)
print(square_plus_one(4))   // 25 = (4+1)²

// Derivative of x² ≈ 2x
d_square = derivative(square, 0.0001)
print(d_square(3.0))   // ≈ 6.0

// 2^10 by doubling 10 times
print(apply_n(fn(x) x * 2, 10, 1))   // 1024

// Approximate pi with Leibniz series
pi = 4.0 * sum_series(0, 10000, fn(k) {
  sign = if k % 2 == 0 { 1.0 } else { -1.0 }
  sign / (2.0 * to_float(k) + 1.0)
})
print("Pi ≈ {pi}")
```

The key insight: `derivative` returns a **function**. You pass it a function and get back a new function that computes the derivative at any point. This is the power of higher-order functions.

<TryInPlayground :code="mathToolkitCode" label="Math Toolkit" />

## Exercises

**Exercise 2.1:** Write a `memoize(f)` function that takes a single-argument function and returns a new function that caches results. If called with the same argument twice, it should return the cached result instead of recomputing. Hint: use a closure over a mutable object.

**Exercise 2.2:** Write a `pipe(...fns)` function that takes any number of single-argument functions and returns a new function that applies them left to right. `pipe(f, g, h)(x)` should equal `h(g(f(x)))`. Test it by piping `double`, `add_one`, and `to_string` together.

**Exercise 2.3:** Write a `retry(f, n_times)` function that calls `f()` and if it returns `Err`, retries up to `n_times`. Return the first `Ok` result or the last `Err`. Hint: use a for loop with early return.

## Challenge

Build a **function calculator** that can:
1. Take a mathematical function as a string description (e.g., "square", "double", "increment")
2. Look it up from a registry (an object mapping names to functions)
3. Compose multiple named functions together
4. Compute the numerical derivative
5. Print a table of values for x = 0 to 10

For example: "double then square" should produce [0, 4, 16, 36, 64, ...].

---

[← Previous: Thinking in Tova](./thinking-in-tova) | [Next: Mastering Collections →](./collections)
