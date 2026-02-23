# Assertions

Tova provides three assertion functions for verifying invariants during development and testing. Assertions throw errors when their conditions are not met, helping you catch bugs early.

## assert

```tova
assert(condition, msg?) -> Nil
```

Throws an error if `condition` is falsy (i.e., `false` or `nil`). If `msg` is provided, it is used as the error message.

```tova
assert(true)                       // passes
assert(len(items) > 0)             // passes if items is non-empty
// assert(false)                   -- throws "Assertion failed"
// assert(false, "must be true")   -- throws "must be true"
```

```tova
fn withdraw(account, amount) {
  assert(amount > 0, "withdrawal amount must be positive")
  assert(account.balance >= amount, "insufficient funds")
  { ...account, balance: account.balance - amount }
}
```

---

## assert_eq

```tova
assert_eq(a, b, msg?) -> Nil
```

Throws an error if `a !== b`. The error message includes both values for easy debugging. An optional `msg` provides additional context.

```tova
assert_eq(2 + 2, 4)                        // passes
assert_eq("hello", "hello")                 // passes
// assert_eq(2 + 2, 5)                      -- throws, shows "4" vs "5"
// assert_eq(x, 10, "x should be 10")       -- throws with custom message
```

```tova
// In tests
fn test_add() {
  assert_eq(add(1, 2), 3)
  assert_eq(add(0, 0), 0)
  assert_eq(add(-1, 1), 0)
}

fn test_string_utils() {
  assert_eq(upper("hello"), "HELLO")
  assert_eq(trim("  hi  "), "hi")
  assert_eq(len(split("a,b,c", ",")), 3)
}
```

---

## assert_ne

```tova
assert_ne(a, b, msg?) -> Nil
```

Throws an error if `a === b`. The inverse of `assert_eq`.

```tova
assert_ne(1, 2)                              // passes
assert_ne("hello", "world")                  // passes
// assert_ne(5, 5)                            -- throws
// assert_ne(x, 0, "x must not be zero")      -- throws with custom message
```

```tova
fn test_random() {
  // random() should not return the same value twice (very unlikely)
  a = random()
  b = random()
  assert_ne(a, b, "random() returned same value twice")
}
```

---

## assert_throws

```tova
assert_throws(func, expected?) -> Nil
```

Calls `func` and asserts that it throws an error. If no error is thrown, the assertion fails. The optional `expected` parameter can be:

- A **string**: passes if the error message contains the string
- A **RegExp**: passes if the error message matches the pattern

```tova
assert_throws(fn() divide(1, 0))                        // passes if it throws
assert_throws(fn() divide(1, 0), "divide by zero")      // passes if message contains "divide by zero"
assert_throws(fn() parse("abc"), RegExp.new("invalid"))  // passes if message matches /invalid/
```

```tova
fn test_validation() {
  assert_throws(fn() withdraw(account, -10), "must be positive")
  assert_throws(fn() withdraw(account, 99999), "insufficient")
}
```

---

## assert_snapshot

```tova
assert_snapshot(value, name?) -> Nil
```

Compares a value against a previously stored snapshot. On first run, creates the snapshot. On subsequent runs, asserts the value matches the stored snapshot. The optional `name` parameter provides a label for the snapshot file.

```tova
test "user serialization" {
  user = User(1, "Alice", "alice@example.com")
  assert_snapshot(user.to_json())
}

test "rendering output" {
  html = render(Greeting("World"))
  assert_snapshot(html, "greeting-output")
}
```

To update snapshots when output intentionally changes:

```bash
tova test --update-snapshots
```

---

## Usage in Tests

Assertions are the primary tool for writing Tova tests. Tova test files use `fn test_*()` naming conventions:

```tova
fn test_sorted() {
  assert_eq(sorted([3, 1, 2]), [1, 2, 3])
  assert_eq(sorted([]), [])
  assert_eq(sorted([1]), [1])
}

fn test_reversed() {
  assert_eq(reversed([1, 2, 3]), [3, 2, 1])
  assert_eq(reversed([]), [])
}

fn test_partition() {
  evens, odds = partition([1, 2, 3, 4], fn(x) x % 2 == 0)
  assert_eq(evens, [2, 4])
  assert_eq(odds, [1, 3])
}
```

## Usage for Preconditions

Assertions are useful for validating function inputs during development:

```tova
fn divide(a, b) {
  assert(b != 0, "cannot divide by zero")
  a / b
}

fn get_page(items, page_size, page_num) {
  assert(page_size > 0, "page_size must be positive")
  assert(page_num >= 0, "page_num must be non-negative")
  items |> drop(page_size * page_num) |> take(page_size)
}
```

## Usage for Debugging

When debugging, assertions help narrow down where things go wrong:

```tova
fn process_data(raw) {
  parsed = parse(raw)
  assert(parsed != nil, "parse returned nil for: {raw}")

  transformed = transform(parsed)
  assert(len(transformed) > 0, "transform produced empty result")

  result = validate(transformed)
  assert(result.isOk(), "validation failed: {result.unwrapErr()}")

  result.unwrap()
}
```

## Comparison with Result/Option

Assertions and Result/Option serve different purposes:

| Approach | Use When |
|---|---|
| `assert` | Catching programmer errors; conditions that should **never** be false if the code is correct |
| `Result` / `Option` | Expected failure cases; user input validation; I/O operations that can fail |

```tova
// assert: a bug if this fails -- should never happen
assert(len(matrix) > 0, "matrix must not be empty")

// Result: expected failure -- user might give bad input
fn parse_age(input) {
  n = parse_int(input)
  if n.isErr() { return Err("not a number") }
  age = n.unwrap()
  if age < 0 or age > 150 { return Err("age out of range") }
  Ok(age)
}
```
