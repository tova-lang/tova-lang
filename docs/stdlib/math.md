# Math

Tova provides essential math functions for numerical computation.

## Rounding

### abs

```tova
abs(n) -> Number
```

Returns the absolute value of a number.

```tova
abs(-5)      // 5
abs(5)       // 5
abs(-3.14)   // 3.14
abs(0)       // 0
```

### floor

```tova
floor(n) -> Int
```

Rounds a number down to the nearest integer.

```tova
floor(3.7)    // 3
floor(3.2)    // 3
floor(-1.5)   // -2
floor(5)      // 5
```

### ceil

```tova
ceil(n) -> Int
```

Rounds a number up to the nearest integer.

```tova
ceil(3.2)     // 4
ceil(3.7)     // 4
ceil(-1.5)    // -1
ceil(5)       // 5
```

### round

```tova
round(n) -> Int
```

Rounds a number to the nearest integer.

```tova
round(3.5)    // 4
round(3.4)    // 3
round(-1.5)   // -1
round(7)      // 7
```

---

## Constraining

### clamp

```tova
clamp(n, lo, hi) -> Number
```

Constrains a number to be within the range `[lo, hi]`. If `n` is below `lo`, returns `lo`. If `n` is above `hi`, returns `hi`. Otherwise returns `n`.

```tova
clamp(15, 0, 10)     // 10
clamp(-5, 0, 10)     // 0
clamp(5, 0, 10)      // 5
```

```tova
// Practical: constrain a percentage
progress = clamp(raw_progress, 0, 100)

// Constrain an array index
index = clamp(requested, 0, len(items) - 1)
```

---

## Powers & Roots

### sqrt

```tova
sqrt(n) -> Float
```

Returns the square root of a number.

```tova
sqrt(16)      // 4
sqrt(2)       // 1.4142135623730951
sqrt(0)       // 0
```

```tova
// Distance between two points
fn distance(x1, y1, x2, y2) {
  dx = x2 - x1
  dy = y2 - y1
  sqrt(dx ** 2 + dy ** 2)
}
```

### pow

```tova
pow(base, exp) -> Number
```

Raises `base` to the power of `exp`. The `**` operator is an equivalent alternative.

```tova
pow(2, 10)    // 1024
pow(3, 3)     // 27
pow(10, 0)    // 1

// Using the ** operator instead
2 ** 10       // 1024
3 ** 3        // 27
```

---

## Randomness

### random

```tova
random() -> Float
```

Returns a random floating-point number in the range `[0, 1)` (0 inclusive, 1 exclusive).

```tova
random()              // e.g., 0.7234...

// Random integer in a range
fn random_int(min, max) {
  floor(random() * (max - min + 1)) + min
}

// Random element from an array
fn random_choice(arr) {
  arr[floor(random() * len(arr))]
}
```

---

## Async

### sleep

```tova
sleep(ms) -> Promise
```

Returns a Promise that resolves after `ms` milliseconds. Use with `await` to pause execution.

```tova
await sleep(1000)     // wait 1 second

// Retry with delay
fn retry(action, attempts, delay) {
  for _ in range(attempts) {
    result = action()
    if result.isOk() {
      return result
    }
    await sleep(delay)
  }
  Err("max retries exceeded")
}
```

---

## Arithmetic Operators

In addition to the math functions above, Tova has the standard arithmetic operators:

| Operator | Description | Example |
|---|---|---|
| `+` | Addition | `3 + 4` is `7` |
| `-` | Subtraction | `10 - 3` is `7` |
| `*` | Multiplication | `3 * 4` is `12` |
| `/` | Division | `10 / 3` is `3.333...` |
| `%` | Modulo (remainder) | `10 % 3` is `1` |
| `**` | Exponentiation | `2 ** 8` is `256` |

---

## Pipeline Examples

```tova
// Normalize scores to 0-100 range
scores
  |> map(fn(s) clamp(s, 0, 100))
  |> sorted()

// Generate random sample
range(10)
  |> map(fn(_) floor(random() * 100))
  |> sorted()
```
