---
title: Test Runner
---

# Test Runner

Tova has a built-in test runner that discovers and executes `test` blocks in `.tova` files. Tests are compiled to JavaScript and run via Bun's test infrastructure.

## Running Tests

```bash
tova test              # Run tests in the current directory
tova test src          # Run tests in the src/ directory
tova test --filter "math"   # Run only tests matching "math"
tova test --watch      # Watch for changes and re-run
tova test --coverage   # Enable coverage reporting
tova test --serial     # Force sequential execution
```

## Writing Tests

Tests are defined using `test` blocks with a description string and a body:

```tova
test "addition works" {
  assert_eq(1 + 1, 2)
}

test "string concatenation" {
  result = "Hello" + " " + "World"
  assert_eq(result, "Hello World")
}
```

### Test Timeout

Set a timeout (in milliseconds) for individual tests using the `timeout` option:

```tova
test "slow operation completes" timeout=5000 {
  result = await long_running_task()
  assert(result.isOk())
}
```

If the test does not complete within the timeout, it fails with a timeout error.

## Assertions

Tova provides three assertion functions for tests:

### `assert(condition)`

Asserts that a condition is truthy:

```tova
test "basic assertions" {
  assert(true)
  assert(1 > 0)
  assert(len([1, 2, 3]) == 3)
}
```

### `assert_eq(actual, expected)`

Asserts that two values are equal:

```tova
test "equality checks" {
  assert_eq(2 + 2, 4)
  assert_eq("hello", "hello")
  assert_eq([1, 2], [1, 2])
}
```

### `assert_ne(actual, expected)`

Asserts that two values are not equal:

```tova
test "inequality checks" {
  assert_ne(1, 2)
  assert_ne("hello", "world")
  assert_ne([], [1])
}
```

## Testing Functions

Define functions in the same file and test them:

```tova
fn factorial(n) {
  match n {
    0 => 1
    n => n * factorial(n - 1)
  }
}

test "factorial of 0" {
  assert_eq(factorial(0), 1)
}

test "factorial of 5" {
  assert_eq(factorial(5), 120)
}

test "factorial of 10" {
  assert_eq(factorial(10), 3628800)
}
```

## Testing with Types

```tova
type Point {
  x: Int
  y: Int
}

fn distance(p1, p2) {
  dx = p2.x - p1.x
  dy = p2.y - p1.y
  Math.sqrt(dx * dx + dy * dy)
}

test "distance between points" {
  p1 = Point(0, 0)
  p2 = Point(3, 4)
  assert_eq(distance(p1, p2), 5)
}
```

## Testing Result and Option

```tova
fn safe_divide(a, b) {
  match b {
    0 => Err("division by zero")
    _ => Ok(a / b)
  }
}

test "safe division succeeds" {
  result = safe_divide(10, 2)
  assert_eq(result, Ok(5))
}

test "safe division by zero returns error" {
  result = safe_divide(10, 0)
  assert_eq(result, Err("division by zero"))
}
```

## Filtering Tests

Use `--filter` to run a subset of tests matching a pattern:

```bash
tova test --filter "factorial"
```

This runs only tests whose description contains "factorial".

## Watch Mode

Use `--watch` to automatically re-run tests when `.tova` files change:

```bash
tova test --watch
```

The watcher monitors the target directory recursively and re-runs the full test suite whenever a `.tova` file is modified.

## Coverage

Use `--coverage` to enable Bun's built-in coverage reporting:

```bash
tova test --coverage
```

This shows which lines of your compiled code were exercised by the test suite.

## Sequential Execution

By default, Bun runs test files in parallel. Use `--serial` to force sequential execution:

```bash
tova test --serial
```

This is useful when tests share global state (e.g., a database) and cannot run concurrently.

## Test Organization

A recommended approach for organizing tests:

- **Inline tests**: Place `test` blocks alongside the functions they test in the same `.tova` file. This keeps tests close to the code they verify.
- **Dedicated test files**: For larger test suites, create separate `.tova` files (e.g., `math_test.tova`, `api_test.tova`) in a `tests/` directory.

```
my-project/
  src/
    app.tova          # Application code with inline tests
    utils.tova        # Utility functions with inline tests
  tests/
    integration.tova  # Integration tests
```

## Setup and Teardown

Use `before_each` and `after_each` blocks to run code before and after every test in the file:

```tova
var db = nil

before_each {
  db = create_test_db()
}

after_each {
  db.close()
}

test "can insert user" {
  db.insert("users", { name: "Alice" })
  assert_eq(db.count("users"), 1)
}

test "can query users" {
  db.insert("users", { name: "Bob" })
  users = db.query("SELECT * FROM users")
  assert(len(users) > 0)
}
```

## Benchmarks

Use `bench` blocks to measure execution time of code snippets:

```tova
bench "array sorting" {
  data = range(1000) |> shuffle()
  sorted(data)
}

bench "string concatenation" {
  var result = ""
  for i in range(1000) {
    result = result + "{i}"
  }
}
```

Run benchmarks with the dedicated bench command:

```bash
tova bench
tova bench src
```

## Property-Based Testing

Tova includes built-in support for property-based testing with random data generators and the `forAll` function.

### Generators

```tova
Gen.int()                    // random integer
Gen.int(0, 100)              // random integer in range
Gen.float()                  // random float
Gen.bool()                   // random boolean
Gen.string()                 // random string
Gen.string(10)               // random string up to length 10
Gen.array(Gen.int())         // random array of integers
Gen.array(Gen.int(), 5)      // random array up to length 5
Gen.oneOf(["a", "b", "c"])   // random choice from list
```

### forAll

```tova
test "reverse is its own inverse" {
  forAll([Gen.array(Gen.int())], fn(arr) {
    assert_eq(reversed(reversed(arr)), arr)
  })
}

test "sort is idempotent" {
  forAll([Gen.array(Gen.int())], fn(arr) {
    assert_eq(sorted(sorted(arr)), sorted(arr))
  })
}

// Configure number of runs
test "addition is commutative" {
  forAll([Gen.int(), Gen.int()], fn(a, b) {
    assert_eq(a + b, b + a)
  }, { runs: 500 })
}
```

## Snapshot Testing

Use `assert_snapshot` to compare a value against a stored snapshot. On the first run, the snapshot is created. On subsequent runs, the value is compared against the saved snapshot:

```tova
test "user serialization" {
  user = User(1, "Alice", "alice@example.com")
  assert_snapshot(user.to_json())
}

test "html rendering" {
  html = render_component(Greeting("World"))
  assert_snapshot(html, "greeting-output")
}
```

## Spy and Mock

### Spies

Create a spy to track function calls:

```tova
test "callback is called" {
  spy = create_spy()
  run_with_callback(spy)
  assert(spy.called)
  assert_eq(spy.call_count, 1)
}

test "callback receives correct args" {
  spy = create_spy()
  process(items, on_complete: spy)
  assert(spy.called_with([items]))
}

test "spy with implementation" {
  spy = create_spy(fn(x) x * 2)
  result = spy(5)
  assert_eq(result, 10)
  assert_eq(spy.call_count, 1)
}
```

Spy properties:
- `.called` -- `true` if called at least once
- `.call_count` -- number of times called
- `.calls` -- array of argument arrays from each call
- `.called_with(args)` -- returns `true` if called with matching args
- `.reset()` -- clears all call tracking

### Mocks

Create a mock that returns a fixed value:

```tova
test "uses mock data" {
  mock_fetch = create_mock({ status: 200, body: "ok" })
  result = process_response(mock_fetch)
  assert_eq(result, "ok")
  assert(mock_fetch.called)
}
```

## assert_throws

Assert that a function throws an error:

```tova
test "division by zero throws" {
  assert_throws(fn() divide(1, 0))
}

test "validation rejects bad input" {
  assert_throws(fn() validate_email("not-an-email"), "invalid email")
}
```

See the [Assertions stdlib page](../stdlib/assertions.md) for full details on `assert_throws`.

## How It Works

Under the hood, `tova test` performs these steps:

1. Scans the target directory for `.tova` files containing `test` blocks
2. Compiles each file to JavaScript, extracting the test code
3. Writes compiled test files to `.tova-test-out/`
4. Runs the compiled tests using `bun test`
5. Reports results and exits with the appropriate exit code
