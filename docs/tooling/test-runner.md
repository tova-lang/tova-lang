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
```

## Writing Tests

Tests are defined using `test` blocks with a description string and a body:

```tova
test "addition works" {
  assert_eq(1 + 1, 2)
}

test "string concatenation" {
  result = "Hello" ++ " " ++ "World"
  assert_eq(result, "Hello World")
}
```

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

## How It Works

Under the hood, `tova test` performs these steps:

1. Scans the target directory for `.tova` files containing `test` blocks
2. Compiles each file to JavaScript, extracting the test code
3. Writes compiled test files to `.tova-test-out/`
4. Runs the compiled tests using `bun test`
5. Reports results and exits with the appropriate exit code
