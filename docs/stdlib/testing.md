# Testing

Tova provides a built-in testing standard library with random data generators, property-based testing, snapshot testing, and spy/mock utilities. These functions are available in any `test` block.

For usage patterns and running tests, see the [Test Runner](../tooling/test-runner.md) guide.

## Generators

The `Gen` object provides random data generators for property-based testing.

### Gen.int

```tova
Gen.int() -> Generator<Int>
Gen.int(min, max) -> Generator<Int>
```

Generates a random integer. Optionally constrained to a range.

```tova
Gen.int()              // any integer
Gen.int(0, 100)        // integer between 0 and 100
Gen.int(-10, 10)       // integer between -10 and 10
```

### Gen.float

```tova
Gen.float() -> Generator<Float>
```

Generates a random floating-point number.

```tova
Gen.float()            // any float
```

### Gen.bool

```tova
Gen.bool() -> Generator<Bool>
```

Generates a random boolean.

```tova
Gen.bool()             // true or false
```

### Gen.string

```tova
Gen.string() -> Generator<String>
Gen.string(maxLen) -> Generator<String>
```

Generates a random string. Optionally limited to a maximum length.

```tova
Gen.string()           // random string
Gen.string(10)         // random string up to 10 characters
```

### Gen.array

```tova
Gen.array(gen) -> Generator<[T]>
Gen.array(gen, maxLen) -> Generator<[T]>
```

Generates a random array using another generator for elements. Optionally limited to a maximum length.

```tova
Gen.array(Gen.int())         // array of random integers
Gen.array(Gen.string(), 5)   // array of up to 5 random strings
```

### Gen.oneOf

```tova
Gen.oneOf(choices) -> Generator<T>
```

Generates a random value chosen from the given array.

```tova
Gen.oneOf(["red", "green", "blue"])    // random color
Gen.oneOf([1, 2, 3, 4, 5])            // random number from list
```

---

## Property-Based Testing

### forAll

```tova
forAll(generators, property, options?) -> Nil
```

Runs a property function with randomly generated inputs. The property should use assertions to verify invariants. By default, runs 100 iterations.

**Parameters:**
- `generators` -- array of `Gen` generators
- `property` -- function that receives generated values and asserts invariants
- `options` -- optional object with `{ runs: Int }` to control iteration count

```tova
test "reverse is its own inverse" {
  forAll([Gen.array(Gen.int())], fn(arr) {
    assert_eq(reversed(reversed(arr)), arr)
  })
}

test "sort produces sorted output" {
  forAll([Gen.array(Gen.int())], fn(arr) {
    result = sorted(arr)
    assert(is_sorted(result))
  })
}

test "addition is commutative" {
  forAll([Gen.int(), Gen.int()], fn(a, b) {
    assert_eq(a + b, b + a)
  }, { runs: 500 })
}
```

---

## Snapshot Testing

### assert_snapshot

```tova
assert_snapshot(value, name?) -> Nil
```

Compares a value against a previously stored snapshot. On first run, creates the snapshot file. On subsequent runs, asserts the value matches the stored snapshot.

**Parameters:**
- `value` -- the value to snapshot (serialized to string)
- `name` -- optional name for the snapshot (defaults to auto-generated)

```tova
test "user serialization" {
  user = User(1, "Alice", "alice@example.com")
  assert_snapshot(user.to_json())
}

test "component rendering" {
  html = render(Greeting("World"))
  assert_snapshot(html, "greeting-html")
}
```

To update snapshots when output intentionally changes, run:

```bash
tova test --update-snapshots
```

---

## Spies

### create_spy

```tova
create_spy(impl?) -> Spy
```

Creates a spy function that records all calls. Optionally wraps an implementation function.

**Parameters:**
- `impl` -- optional function to execute when the spy is called

**Returns:** A callable spy with tracking properties.

```tova
test "tracks calls" {
  spy = create_spy()
  spy("hello")
  spy("world")

  assert(spy.called)
  assert_eq(spy.call_count, 2)
  assert_eq(spy.calls, [["hello"], ["world"]])
}

test "spy with implementation" {
  spy = create_spy(fn(x) x * 2)
  result = spy(5)
  assert_eq(result, 10)
  assert_eq(spy.call_count, 1)
}
```

### Spy Properties

| Property | Type | Description |
|----------|------|-------------|
| `.called` | `Bool` | `true` if called at least once |
| `.call_count` | `Int` | Number of times the spy was called |
| `.calls` | `[[T]]` | Array of argument arrays from each call |

### Spy Methods

| Method | Description |
|--------|-------------|
| `.called_with(args)` | Returns `true` if the spy was ever called with the given arguments |
| `.reset()` | Clears all call tracking (resets `called`, `call_count`, `calls`) |

```tova
test "reset clears tracking" {
  spy = create_spy()
  spy(1)
  spy(2)
  assert_eq(spy.call_count, 2)

  spy.reset()
  assert_eq(spy.call_count, 0)
  assert(not spy.called)
}
```

---

## Mocks

### create_mock

```tova
create_mock(returnValue) -> Mock
```

Creates a mock function that returns a fixed value and tracks calls like a spy.

```tova
test "returns mock value" {
  mock_fn = create_mock(42)
  result = mock_fn("any", "args")
  assert_eq(result, 42)
  assert(mock_fn.called)
  assert_eq(mock_fn.call_count, 1)
}

test "mock API response" {
  mock_fetch = create_mock({ status: 200, body: '{"ok": true}' })
  response = mock_fetch("/api/data")
  assert_eq(response.status, 200)
}
```

Mocks have the same tracking properties as spies: `.called`, `.call_count`, `.calls`, `.called_with()`, and `.reset()`.
