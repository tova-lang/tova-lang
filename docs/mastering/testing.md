<script setup>
const basicTestCode = `// Test blocks: structured testing in Tova
test "addition works" {
  assertEq(2 + 2, 4)
}

test "string concatenation" {
  greeting = "Hello" ++ " " ++ "World"
  assertEq(greeting, "Hello World")
}

test "arrays maintain order" {
  items = [3, 1, 4, 1, 5]
  assertEq(len(items), 5)
  assertEq(items[0], 3)
  assertEq(items[4], 5)
}

// Run with: tova test
print("Tests defined — run with: tova test")`

const assertionCode = `// Assertions: the building blocks of tests
test "assert — truthy check" {
  assert(len("hello") > 0)
  assert(10 > 5)
  assert(contains("Tova", "ov"))
}

test "assert_eq — equality check" {
  assertEq(2 + 3, 5)
  assertEq("hello" |> upper(), "HELLO")
  assertEq([1, 2, 3] |> len(), 3)
}

test "assert_ne — inequality check" {
  assertNe("hello", "world")
  assertNe(10, 20)
  assertNe([], [1])
}

test "assert_throws — expect an error" {
  assertThrows(fn() {
    // Code that should throw
    JSON.parse("not valid json")
  })
}

print("All assertion types demonstrated")`

const resultTestCode = `// Testing functions that return Result or Option
fn divide(a, b) {
  if b == 0 { Err("Division by zero") }
  else { Ok(a / b) }
}

fn find_user(users, name_query) {
  for user in users {
    if user.name == name_query { return Some(user) }
  }
  None
}

test "divide returns Ok for valid input" {
  result = divide(10, 2)
  assert(result.isOk())
  assertEq(result.unwrap(), 5)
}

test "divide returns Err for zero divisor" {
  result = divide(10, 0)
  assert(result.isErr())
}

test "divide error has descriptive message" {
  result = divide(10, 0)
  match result {
    Err(msg) => assertEq(msg, "Division by zero")
    Ok(_) => assert(false)
  }
}

test "find_user returns Some when found" {
  users = [{ name: "Alice" }, { name: "Bob" }]
  result = find_user(users, "Alice")
  assert(result.isSome())
  assertEq(result.unwrap().name, "Alice")
}

test "find_user returns None when missing" {
  users = [{ name: "Alice" }]
  result = find_user(users, "Charlie")
  assert(result.isNone())
  assertEq(result.unwrapOr({ name: "Guest" }).name, "Guest")
}

print("Result/Option testing demonstrated")`

const calculatorTestCode = `// PROJECT: Test suite for a calculator module

// ===== The Calculator Module =====
fn calc_add(a, b) { Ok(a + b) }
fn calc_subtract(a, b) { Ok(a - b) }
fn calc_multiply(a, b) { Ok(a * b) }

fn calc_divide(a, b) {
  if b == 0 { Err("Division by zero") }
  else { Ok(a / b) }
}

fn calc_power(base, exp) {
  if exp < 0 { Err("Negative exponent not supported") }
  else { Ok(pow(base, exp)) }
}

fn calc_sqrt_safe(n) {
  if n < 0 { Err("Cannot take square root of negative number") }
  else { Ok(sqrt(n)) }
}

fn parse_expression(expression) {
  // Simple expression parser: "3 + 4" => Ok(7)
  parts = split(expression, " ")
  if len(parts) != 3 {
    return Err("Invalid expression: expected 'a op b'")
  }
  a = toFloat(parts[0])
  op = parts[1]
  b = toFloat(parts[2])
  match op {
    "+" => calc_add(a, b)
    "-" => calc_subtract(a, b)
    "*" => calc_multiply(a, b)
    "/" => calc_divide(a, b)
    _ => Err("Unknown operator: {op}")
  }
}

// ===== Basic Arithmetic Tests =====
test "add returns correct sum" {
  assertEq(calc_add(2, 3).unwrap(), 5)
  assertEq(calc_add(-1, 1).unwrap(), 0)
  assertEq(calc_add(0, 0).unwrap(), 0)
}

test "subtract returns correct difference" {
  assertEq(calc_subtract(10, 3).unwrap(), 7)
  assertEq(calc_subtract(5, 5).unwrap(), 0)
  assertEq(calc_subtract(3, 10).unwrap(), -7)
}

test "multiply returns correct product" {
  assertEq(calc_multiply(4, 5).unwrap(), 20)
  assertEq(calc_multiply(-2, 3).unwrap(), -6)
  assertEq(calc_multiply(0, 100).unwrap(), 0)
}

// ===== Error Handling Tests =====
test "divide by zero returns Err" {
  result = calc_divide(10, 0)
  assert(result.isErr())
  match result {
    Err(msg) => assert(contains(msg, "zero"))
    _ => assert(false)
  }
}

test "divide valid inputs returns Ok" {
  assertEq(calc_divide(10, 2).unwrap(), 5)
  assertEq(calc_divide(7, 2).unwrap(), 3.5)
}

test "negative exponent returns Err" {
  result = calc_power(2, -1)
  assert(result.isErr())
}

test "square root of negative returns Err" {
  result = calc_sqrt_safe(-4)
  assert(result.isErr())
}

test "square root of positive returns Ok" {
  result = calc_sqrt_safe(16)
  assert(result.isOk())
  assertEq(result.unwrap(), 4)
}

// ===== Expression Parser Tests =====
test "parse simple addition" {
  assertEq(parse_expression("3 + 4").unwrap(), 7)
}

test "parse division" {
  assertEq(parse_expression("10 / 2").unwrap(), 5)
}

test "parse division by zero" {
  result = parse_expression("5 / 0")
  assert(result.isErr())
}

test "parse unknown operator" {
  result = parse_expression("3 ^ 4")
  assert(result.isErr())
  match result {
    Err(msg) => assert(contains(msg, "Unknown operator"))
    _ => assert(false)
  }
}

test "parse malformed expression" {
  result = parse_expression("3+4")
  assert(result.isErr())
}

// ===== Edge Cases =====
test "large number arithmetic" {
  result = calc_multiply(999999, 999999)
  assert(result.isOk())
}

test "floating point division" {
  result = calc_divide(1, 3)
  assert(result.isOk())
  // Floating point: check approximate equality
  val = result.unwrap()
  assert(val > 0.333 && val < 0.334)
}

print("Calculator test suite: all tests defined")
print("Run with: tova test calculator.tova")`

const asyncTestCode = `// Testing async code
async fn fetch_user_data(user_id) {
  await sleep(10)
  if user_id <= 0 {
    Err("Invalid user ID")
  } else {
    Ok({ id: user_id, name: "User {user_id}" })
  }
}

async fn fetch_user_posts(user_id) {
  await sleep(10)
  if user_id <= 0 {
    Err("Invalid user ID")
  } else {
    Ok([
      { title: "First Post", author_id: user_id },
      { title: "Second Post", author_id: user_id }
    ])
  }
}

test "fetch_user_data returns user for valid id" {
  result = await fetch_user_data(1)
  assert(result.isOk())
  user = result.unwrap()
  assertEq(user.id, 1)
  assertEq(user.name, "User 1")
}

test "fetch_user_data returns Err for invalid id" {
  result = await fetch_user_data(-1)
  assert(result.isErr())
}

test "fetch_user_posts returns posts" {
  result = await fetch_user_posts(1)
  assert(result.isOk())
  posts = result.unwrap()
  assertEq(len(posts), 2)
  assertEq(posts[0].author_id, 1)
}

test "parallel fetches both succeed" {
  results = await Promise.all([
    fetch_user_data(1),
    fetch_user_posts(1)
  ])
  assert(results[0].isOk())
  assert(results[1].isOk())
}

print("Async tests demonstrated")`

const benchCode = `// Benchmarking: measure before you optimize
fn sum_loop(n) {
  var total = 0
  for i in range(n) {
    total += i
  }
  total
}

fn sum_formula(n) {
  n * (n - 1) / 2
}

fn sum_pipe(n) {
  range(n) |> sum()
}

// Simple benchmark helper
fn run_benchmark(label, iterations, f) {
  start_time = Date.now()
  for _ in range(iterations) {
    f()
  }
  elapsed = Date.now() - start_time
  per_op = elapsed / toFloat(iterations)
  print("{label}: {elapsed}ms total ({per_op}ms/op)")
}

n = 10000
iters = 1000

run_benchmark("Loop sum", iters, fn() sum_loop(n))
run_benchmark("Formula sum", iters, fn() sum_formula(n))
run_benchmark("Pipe sum", iters, fn() sum_pipe(n))

// Verify all produce the same result
loop_result = sum_loop(n)
formula_result = sum_formula(n)
pipe_result = sum_pipe(n)

print("")
print("Verification:")
print("  Loop:    {loop_result}")
print("  Formula: {formula_result}")
print("  Pipe:    {pipe_result}")
print("  Match:   {loop_result == formula_result && formula_result == pipe_result}")`
</script>

# Chapter 17: Testing and Debugging

Code without tests is a house without a foundation. Tova makes testing a first-class part of the language with built-in `test` blocks, a rich assertion library, and error messages designed to show you exactly what went wrong and where. This chapter teaches you to write tests that catch bugs before your users do, and to debug effectively when something slips through.

By the end, you will build a complete test suite for a calculator module.

## Test Blocks

In Tova, tests are declared with the `test` keyword followed by a descriptive name and a block of assertions:

```tova
test "addition works correctly" {
  assertEq(2 + 2, 4)
}

test "strings can be joined" {
  result = "Hello" ++ " " ++ "World"
  assertEq(result, "Hello World")
}

test "empty arrays have zero length" {
  assertEq(len([]), 0)
}
```

Each `test` block is an isolated unit. Variables declared inside one test do not leak into another. If any assertion fails, the test reports the failure with the name you gave it.

Run all tests with:

```bash
tova test
```

Or run tests in a specific file:

```bash
tova test calculator.tova
```

<TryInPlayground :code="basicTestCode" label="Basic Tests" />

### Naming Tests Well

The name you give a test is its documentation. When a test fails six months from now, the name is the first thing you see. Make it describe the **behavior**, not the implementation:

```tova
// Good: describes the behavior
test "divide returns Err when divisor is zero" { ... }
test "user search returns None for unknown name" { ... }
test "sorted output preserves duplicate values" { ... }

// Bad: describes the implementation
test "test divide function" { ... }
test "check result" { ... }
test "test 3" { ... }
```

## Assertions

Tova provides four core assertion functions. Each one produces a clear error message when it fails.

### `assert(condition)` -- Truthy Check

The simplest assertion. Passes if the condition is truthy, fails otherwise:

```tova
test "basic assertions" {
  assert(10 > 5)
  assert(len("hello") == 5)
  assert(contains([1, 2, 3], 2))
}
```

### `assertEq(actual, expected)` -- Equality

Checks that two values are equal. On failure, it shows both the actual and expected values:

```tova
test "equality assertions" {
  assertEq(2 + 3, 5)
  assertEq("hello" |> upper(), "HELLO")
  assertEq([1, 2] |> len(), 2)
}
```

### `assertNe(actual, expected)` -- Inequality

Checks that two values are **not** equal:

```tova
test "inequality assertions" {
  assertNe("hello", "world")
  assertNe([], [1, 2, 3])
  assertNe(Ok(1), Err("fail"))
}
```

### `assertThrows(fn)` -- Expects an Error

Passes if the function throws an exception. Useful for testing JavaScript interop or boundary validation:

```tova
test "invalid JSON throws" {
  assertThrows(fn() {
    JSON.parse("{broken")
  })
}
```

<TryInPlayground :code="assertionCode" label="Assertions" />

## Snapshot Testing

For complex output that is tedious to assert field-by-field, Tova supports snapshot testing with `assert_snapshot`:

```tova
test "formatted report matches snapshot" {
  report = generate_report(sample_data)
  assertSnapshot(report)
}
```

The first time a snapshot test runs, it saves the output as the "expected" snapshot. On subsequent runs, it compares the current output against the saved snapshot. If the output changes intentionally, update the snapshot:

```bash
tova test --update-snapshots
```

Snapshots are saved alongside your test files in a `__snapshots__` directory. Commit them to version control so your team shares the same expectations.

::: tip When to Use Snapshots
Snapshots are ideal for formatted output, serialized data structures, or generated code. Avoid them for simple values where `assert_eq` is clearer. Overusing snapshots leads to tests that nobody reads when they fail.
:::

## Running Tests

The `tova test` command finds and runs all test blocks in your project:

```bash
# Run all tests
tova test

# Run tests in a specific file
tova test math.tova

# Run tests matching a pattern
tova test --filter "divide"

# Run with verbose output (shows passing tests too)
tova test --verbose

# Update snapshots
tova test --update-snapshots
```

### Test Output

When tests pass:

```
  math.tova
    [PASS] addition works correctly
    [PASS] divide returns Ok for valid input
    [PASS] divide returns Err when divisor is zero

  3 passed, 0 failed
```

When a test fails:

```
  math.tova
    [PASS] addition works correctly
    [FAIL] divide returns Ok for valid input

      assert_eq failed:
        expected: 5
        actual:   4

      at math.tova:12:3

  1 passed, 1 failed
```

The failure message tells you what was expected, what you got, and exactly where in the file the assertion lives.

## Test Organization

### Grouping by Feature

Organize tests into files that mirror your source structure:

```
my-project/
  src/
    math.tova
    users.tova
    parser.tova
  tests/
    math.test.tova
    users.test.tova
    parser.test.tova
```

Within a test file, group related tests by placing them close together with consistent naming:

```tova
// math.test.tova

// --- Addition ---
test "add positive numbers" {
  assertEq(calc_add(2, 3).unwrap(), 5)
}

test "add negative numbers" {
  assertEq(calc_add(-2, -3).unwrap(), -5)
}

test "add zero" {
  assertEq(calc_add(5, 0).unwrap(), 5)
}

// --- Division ---
test "divide valid inputs" {
  assertEq(calc_divide(10, 2).unwrap(), 5)
}

test "divide by zero returns Err" {
  assert(calc_divide(10, 0).isErr())
}
```

### Setup and Shared Helpers

When multiple tests need the same data, define helper functions and data at the top of the file:

```tova
// test helpers
fn make_test_users() {
  [
    { name: "Alice", role: "admin", active: true },
    { name: "Bob", role: "editor", active: true },
    { name: "Charlie", role: "viewer", active: false }
  ]
}

fn make_test_config() {
  { max_retries: 3, timeout_ms: 5000, debug: false }
}

test "find active users" {
  users = make_test_users()
  active = users |> filter(fn(u) u.active)
  assertEq(len(active), 2)
}

test "find admin users" {
  users = make_test_users()
  admins = users |> filter(fn(u) u.role == "admin")
  assertEq(len(admins), 1)
  assertEq(admins[0].name, "Alice")
}
```

## Testing Result and Option

Functions that return `Result` or `Option` need specific testing patterns. You want to verify both the success and failure paths.

### Testing Result Functions

```tova
fn parse_port(text) {
  n = toInt(text)
  if n == null { return Err("Not a number: {text}") }
  if n < 1 || n > 65535 { return Err("Port out of range: {n}") }
  Ok(n)
}

// Test the happy path
test "parse_port accepts valid port" {
  result = parse_port("8080")
  assert(result.isOk())
  assertEq(result.unwrap(), 8080)
}

// Test each error case
test "parse_port rejects non-numeric input" {
  result = parse_port("abc")
  assert(result.isErr())
}

test "parse_port rejects out-of-range port" {
  result = parse_port("99999")
  assert(result.isErr())
}

// Test error messages are helpful
test "parse_port error message includes input" {
  result = parse_port("abc")
  match result {
    Err(msg) => assert(contains(msg, "abc"))
    Ok(_) => assert(false)   // Should never reach here
  }
}
```

### Testing Option Functions

```tova
fn find_by_name(items, name_query) {
  for item in items {
    if item.name == name_query { return Some(item) }
  }
  None
}

test "find_by_name returns Some when found" {
  items = [{ name: "Alice", id: 1 }, { name: "Bob", id: 2 }]
  result = find_by_name(items, "Bob")
  assert(result.isSome())
  assertEq(result.unwrap().id, 2)
}

test "find_by_name returns None when not found" {
  items = [{ name: "Alice", id: 1 }]
  result = find_by_name(items, "Zoe")
  assert(result.isNone())
}

test "find_by_name with unwrapOr provides default" {
  items = []
  result = find_by_name(items, "Anyone")
  user = result.unwrapOr({ name: "Guest", id: 0 })
  assertEq(user.name, "Guest")
}
```

<TryInPlayground :code="resultTestCode" label="Testing Result/Option" />

### Testing flatMap Chains

When your code chains multiple Result operations, test each link in the chain independently, then test the full chain:

```tova
fn parse_and_validate(input) {
  parse_port(input)
    .flatMap(fn(port) {
      if port < 1024 { Err("Privileged port: {port}") }
      else { Ok(port) }
    })
    .map(fn(port) { port: port, secure: port == 443 || port == 8443 })
}

// Test individual steps
test "parse step rejects garbage" {
  assert(parse_port("xyz").isErr())
}

// Test the full chain
test "parse_and_validate full success" {
  result = parse_and_validate("8080")
  assert(result.isOk())
  assertEq(result.unwrap().port, 8080)
  assertEq(result.unwrap().secure, false)
}

test "parse_and_validate rejects privileged port" {
  result = parse_and_validate("80")
  assert(result.isErr())
}
```

## Testing Async Code

Async test functions use `async` and `await` just like regular async code:

```tova
async fn fetch_user(id) {
  await sleep(10)
  if id <= 0 { Err("Invalid ID") }
  else { Ok({ id: id, name: "User {id}" }) }
}

test "fetch_user returns user for valid id" {
  result = await fetch_user(1)
  assert(result.isOk())
  assertEq(result.unwrap().name, "User 1")
}

test "fetch_user returns Err for invalid id" {
  result = await fetch_user(-1)
  assert(result.isErr())
}
```

### Testing Parallel Operations

```tova
test "parallel fetches all succeed" {
  results = await Promise.all([
    fetch_user(1),
    fetch_user(2),
    fetch_user(3)
  ])
  assertEq(len(results), 3)
  for result in results {
    assert(result.isOk())
  }
}

test "parallel fetch with one failure" {
  results = await Promise.all([
    fetch_user(1),
    fetch_user(-1),
    fetch_user(3)
  ])
  assert(results[0].isOk())
  assert(results[1].isErr())
  assert(results[2].isOk())
}
```

<TryInPlayground :code="asyncTestCode" label="Async Tests" />

::: warning Timeouts in Async Tests
Async tests can hang if the awaited operation never completes. If your test runner supports it, set a timeout. As a defensive pattern, you can wrap the await in a Promise.race with a timer.
:::

## Rich Error Messages

One of Tova's standout features is its error diagnostics. When something goes wrong at compile time, Tova does not just say "error on line 12." It shows you exactly what happened, with source context, carets pointing to the problem, and a suggested fix.

### Anatomy of a Tova Error

```
error: Type mismatch in function argument
  --> calculator.tova:15:20
   |
15 |   result = calc_add("five", 3)
   |                     ^^^^^^
   |
   = expected: Number
   = got:      String
   = help: calc_add takes two numeric arguments
```

Every error message has:
1. **Error type** -- What category of problem it is
2. **Location** -- File, line, and column
3. **Source context** -- The actual code with carets pointing to the problem
4. **Details** -- What was expected vs. what was found
5. **Help** -- A suggestion for how to fix it

This is inspired by Rust and Elm's error messages. The goal is that you can fix the problem from the error message alone, without having to search the documentation.

### Multi-line Errors

When an error spans multiple lines, the diagnostics highlight the full range:

```
error: Exhaustive match missing variant
  --> parser.tova:28:3
   |
28 | /  match token {
29 | |    Number(n) => handle_number(n)
30 | |    String(s) => handle_string(s)
31 | |  }
   | |__^
   |
   = missing variants: Boolean, Null
   = help: add a wildcard arm: _ => ...
```

## Analyzer Warnings

The Tova analyzer catches potential issues before your code runs. These are not errors -- your code will still compile -- but they often point to bugs.

### Unused Variable Warnings

```
warning: Unused variable 'temp'
  --> math.tova:8:3
   |
 8 |   temp = compute(x)
   |   ^^^^
   |
   = help: if intentional, prefix with underscore: _temp
```

The analyzer only warns about unused variables inside function scopes, not at the module level. To suppress a warning, prefix the variable with `_`:

```tova
fn process(data) {
  _unused = setup()    // No warning: underscore prefix
  transform(data)
}
```

### Exhaustive Match Warnings

When you match on a type with known variants, the analyzer checks that you handle every case:

```tova
type Shape {
  Circle(Float)
  Rectangle(Float, Float)
  Triangle(Float, Float, Float)
}

fn area(shape) {
  match shape {
    Circle(r) => 3.14159 * r * r
    Rectangle(w, h) => w * h
    // Warning: missing variant Triangle
  }
}
```

Add the missing arm to silence the warning and handle all cases:

```tova
fn area(shape) {
  match shape {
    Circle(r) => 3.14159 * r * r
    Rectangle(w, h) => w * h
    Triangle(a, b, c) => {
      // Heron's formula
      s = (a + b + c) / 2
      sqrt(s * (s - a) * (s - b) * (s - c))
    }
  }
}
```

### Type Checking Warnings

The analyzer catches undefined identifiers and suspicious operations:

```
warning: Undefined identifier 'userr'
  --> app.tova:12:10
   |
12 |   full_name = userr.name
   |               ^^^^^
   |
   = help: did you mean 'user'?
```

::: tip Treat Warnings as Errors
In production code, treat every warning as a bug waiting to happen. The analyzer found it before your users did. Fix warnings immediately rather than accumulating them.
:::

## Debugging Tips

When tests fail or behavior is unexpected, here are practical strategies.

### Print Debugging

The simplest and often most effective approach. Add `print()` calls to trace values through your code:

```tova
fn process_data(items) {
  print("Input: {len(items)} items")

  filtered = items |> filter(fn(x) x.active)
  print("After filter: {len(filtered)} items")

  transformed = filtered |> map(fn(x) x.value * 2)
  print("After transform: {transformed}")

  total_value = transformed |> sum()
  print("Total: {total_value}")

  total_value
}
```

### Stepping Through Pipelines

When a pipe chain produces unexpected results, break it apart:

```tova
// Instead of debugging this all at once:
result = data
  |> filter(fn(x) x.score > 80)
  |> map(fn(x) x.name)
  |> sorted()
  |> take(5)

// Break it down:
step1 = data |> filter(fn(x) x.score > 80)
print("After filter: {step1}")

step2 = step1 |> map(fn(x) x.name)
print("After map: {step2}")

step3 = step2 |> sorted()
print("After sort: {step3}")

result = step3 |> take(5)
print("Final: {result}")
```

### Isolating Failures

When a test fails in a chain of operations, write a test for each step:

```tova
// Original failing test
test "full pipeline produces correct output" {
  result = raw_data |> parse_input() |> validate_data() |> transform_data()
  assertEq(result, expected)
}

// Break into smaller tests to find the bug
test "parse step works" {
  parsed = raw_data |> parse_input()
  assertEq(parsed, expected_parsed)
}

test "validate step works" {
  validated = known_good_parsed |> validate_data()
  assertEq(validated, expected_validated)
}

test "transform step works" {
  transformed = known_good_validated |> transform_data()
  assertEq(transformed, expected)
}
```

### Testing Edge Cases

The bugs are always in the edges. Test these systematically:

```tova
// Empty input
test "handles empty array" {
  assertEq(process([]), [])
}

// Single element
test "handles single element" {
  assertEq(process([42]), [42])
}

// Negative numbers
test "handles negative values" {
  result = calc_add(-5, -3)
  assertEq(result.unwrap(), -8)
}

// Zero
test "handles zero" {
  assertEq(calc_multiply(0, 1000000).unwrap(), 0)
}

// Large values
test "handles large numbers" {
  result = calc_add(999999999, 1)
  assert(result.isOk())
}

// Special strings
test "handles empty string" {
  result = parse_port("")
  assert(result.isErr())
}
```

## Benchmarking

When you need to know how fast your code is, Tova supports `bench` blocks for performance measurement:

```tova
bench "sum with loop" {
  var total = 0
  for i in range(10000) {
    total += i
  }
}

bench "sum with pipe" {
  range(10000) |> sum()
}

bench "sum with formula" {
  n = 10000
  n * (n - 1) / 2
}
```

Run benchmarks with:

```bash
tova test --bench
```

### Manual Benchmarking

For more control, write your own benchmark harness:

```tova
fn run_benchmark(label, iterations, f) {
  start_time = Date.now()
  for _ in range(iterations) {
    f()
  }
  elapsed = Date.now() - start_time
  per_op = elapsed / toFloat(iterations)
  print("{label}: {elapsed}ms total ({per_op}ms/op)")
}

// Compare approaches
run_benchmark("loop sum", 1000, fn() {
  var total = 0
  for i in range(10000) { total += i }
})

run_benchmark("pipe sum", 1000, fn() {
  range(10000) |> sum()
})

run_benchmark("formula sum", 1000, fn() {
  n = 10000
  n * (n - 1) / 2
})
```

<TryInPlayground :code="benchCode" label="Benchmarking" />

::: warning Benchmark Pitfalls
- Run benchmarks multiple times. A single run can be misleading due to JIT warmup and GC pauses.
- Benchmark with realistic data sizes, not toy inputs.
- Measure the bottleneck. If your code spends 95% of its time in I/O, optimizing the 5% CPU work will not help.
- Do not optimize until you have measured. Write correct code first.
:::

### Using the Built-in Benchmark Suite

For comprehensive performance testing, Tova includes a benchmark runner:

```bash
cd benchmarks
./run_benchmarks.sh              # Full suite: Tova vs Go vs Python
./run_benchmarks.sh --tova-only  # Just Tova
./run_benchmarks.sh --quick      # Fast mode, fewer iterations
```

The suite covers 14 benchmarks across categories like sorting, recursion, numeric computation, and data processing.

## Project: Calculator Test Suite

Let us put it all together. Here is a complete test suite for a calculator module that covers basic operations, error handling, edge cases, and expression parsing.

First, the calculator module:

```tova
// ===== The Calculator Module =====
fn calc_add(a, b) { Ok(a + b) }
fn calc_subtract(a, b) { Ok(a - b) }
fn calc_multiply(a, b) { Ok(a * b) }

fn calc_divide(a, b) {
  if b == 0 { Err("Division by zero") }
  else { Ok(a / b) }
}

fn calc_power(base, exp) {
  if exp < 0 { Err("Negative exponent not supported") }
  else { Ok(pow(base, exp)) }
}

fn calc_sqrt_safe(n) {
  if n < 0 { Err("Cannot take square root of negative number") }
  else { Ok(sqrt(n)) }
}

fn parse_expression(expression) {
  parts = split(expression, " ")
  if len(parts) != 3 {
    return Err("Invalid expression: expected 'a op b'")
  }
  a = toFloat(parts[0])
  op = parts[1]
  b = toFloat(parts[2])
  match op {
    "+" => calc_add(a, b)
    "-" => calc_subtract(a, b)
    "*" => calc_multiply(a, b)
    "/" => calc_divide(a, b)
    _ => Err("Unknown operator: {op}")
  }
}
```

Now the tests, organized by feature:

```tova
// --- Basic Arithmetic ---
test "add returns correct sum" {
  assertEq(calc_add(2, 3).unwrap(), 5)
  assertEq(calc_add(-1, 1).unwrap(), 0)
  assertEq(calc_add(0, 0).unwrap(), 0)
}

test "subtract returns correct difference" {
  assertEq(calc_subtract(10, 3).unwrap(), 7)
  assertEq(calc_subtract(3, 10).unwrap(), -7)
}

test "multiply returns correct product" {
  assertEq(calc_multiply(4, 5).unwrap(), 20)
  assertEq(calc_multiply(-2, 3).unwrap(), -6)
  assertEq(calc_multiply(0, 100).unwrap(), 0)
}

// --- Error Handling ---
test "divide by zero returns Err" {
  result = calc_divide(10, 0)
  assert(result.isErr())
  match result {
    Err(msg) => assert(contains(msg, "zero"))
    _ => assert(false)
  }
}

test "negative exponent returns Err" {
  assert(calc_power(2, -1).isErr())
}

test "square root of negative returns Err" {
  assert(calc_sqrt_safe(-4).isErr())
}

// --- Expression Parser ---
test "parse simple expressions" {
  assertEq(parse_expression("3 + 4").unwrap(), 7)
  assertEq(parse_expression("10 / 2").unwrap(), 5)
  assertEq(parse_expression("6 * 7").unwrap(), 42)
}

test "parse unknown operator returns Err" {
  result = parse_expression("3 ^ 4")
  assert(result.isErr())
}

test "parse malformed expression returns Err" {
  assert(parse_expression("3+4").isErr())
  assert(parse_expression("").isErr())
  assert(parse_expression("1 + 2 + 3").isErr())
}

// --- Edge Cases ---
test "floating point division" {
  val = calc_divide(1, 3).unwrap()
  assert(val > 0.333 && val < 0.334)
}

test "large number arithmetic" {
  assert(calc_multiply(999999, 999999).isOk())
}
```

This test suite demonstrates every technique from the chapter: descriptive names, testing both success and failure paths, checking error messages, verifying edge cases, and organized grouping.

<TryInPlayground :code="calculatorTestCode" label="Calculator Tests" />

## Exercises

**Exercise 17.1:** Write a test suite for a `stack` module that implements `push(stack, value)`, `pop(stack)` (returns `Option`), `peek(stack)` (returns `Option`), and `isEmpty(stack)`. Test the empty stack case, push-then-pop ordering, and peek not removing elements.

**Exercise 17.2:** Write a function `validate_email(text)` that returns `Result`. It should check: non-empty, contains exactly one `@`, has text before and after `@`, and the domain contains a dot. Write at least 8 tests covering valid emails, missing `@`, multiple `@`, empty local part, and empty domain.

**Exercise 17.3:** Write an async function `retry(f, max_attempts)` that calls `f()` up to `max_attempts` times, returning the first `Ok` result or the last `Err`. Write tests for: succeeds on first try, succeeds on third try (use a mutable counter), and fails after all attempts exhausted.

## Challenge

Build a **test framework mini-clone**. Implement:
1. A `suite(name, tests)` function that takes a name and an array of test functions
2. A `run_suite(s)` function that runs each test and collects results
3. An `expect(value)` function that returns an object with `.toBe(expected)`, `.toContain(item)`, `.toBeGreaterThan(n)`, and `.toThrow()` methods
4. A `report(results)` function that prints a formatted summary with pass/fail counts and failure details
5. Support for `before_each` and `after_each` setup/teardown hooks

Run it against your calculator module and compare the output to Tova's built-in test runner.

---

[← Previous: I/O and System](./io-and-system) | [Next: Server Development →](./servers)
