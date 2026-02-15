# Math

Tova provides essential math functions for numerical computation.

## Constants

### PI

```tova
PI -> Float  // 3.141592653589793
```

The ratio of a circle's circumference to its diameter.

```tova
area = PI * radius ** 2
circumference = 2 * PI * radius
```

### E

```tova
E -> Float  // 2.718281828459045
```

Euler's number, the base of natural logarithms.

### INF

```tova
INF -> Float  // Infinity
```

Positive infinity. Useful as an initial value for finding minimums.

```tova
best = INF
for val in data {
  if val < best { best = val }
}
```

---

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

### trunc

```tova
trunc(n) -> Int
```

Truncates a number toward zero (removes the decimal part).

```tova
trunc(3.7)    // 3
trunc(-3.7)   // -3
trunc(5)      // 5
```

### sign

```tova
sign(n) -> Int
```

Returns -1, 0, or 1 indicating the sign of a number.

```tova
sign(-42)     // -1
sign(0)       // 0
sign(100)     // 1
```

---

## Constraining

### clamp

```tova
clamp(n, lo, hi) -> Number
```

Constrains a number to be within the range `[lo, hi]`.

```tova
clamp(15, 0, 10)     // 10
clamp(-5, 0, 10)     // 0
clamp(5, 0, 10)      // 5
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
```

### pow

```tova
pow(base, exp) -> Number
```

Raises `base` to the power of `exp`. The `**` operator is an equivalent alternative.

```tova
pow(2, 10)    // 1024
pow(3, 3)     // 27
```

---

## Trigonometry

### sin, cos, tan

```tova
sin(n) -> Float
cos(n) -> Float
tan(n) -> Float
```

Standard trigonometric functions. Input is in radians.

```tova
sin(0)        // 0
cos(0)        // 1
sin(PI / 2)   // 1
tan(PI / 4)   // ~1
```

### asin, acos, atan

```tova
asin(n) -> Float
acos(n) -> Float
atan(n) -> Float
```

Inverse trigonometric functions. Returns radians.

```tova
asin(1)       // ~1.5708 (PI/2)
acos(1)       // 0
```

### atan2

```tova
atan2(y, x) -> Float
```

Returns the angle in radians between the positive x-axis and the point (x, y).

```tova
atan2(1, 1)   // ~0.7854 (PI/4)
```

### to_radians, to_degrees

```tova
to_radians(deg) -> Float
to_degrees(rad) -> Float
```

Convert between degrees and radians.

```tova
to_radians(180)   // PI
to_degrees(PI)    // 180
```

---

## Logarithms & Exponentials

### log

```tova
log(n) -> Float
```

Natural logarithm (base e).

```tova
log(E)        // 1
log(1)        // 0
```

### log2, log10

```tova
log2(n) -> Float
log10(n) -> Float
```

Logarithm base 2 and base 10.

```tova
log2(8)       // 3
log10(1000)   // 3
```

### exp

```tova
exp(n) -> Float
```

Returns e raised to the power of n.

```tova
exp(0)        // 1
exp(1)        // ~2.718 (E)
```

---

## Numeric Utilities

### is_nan

```tova
is_nan(n) -> Bool
```

Returns true if the value is NaN.

```tova
is_nan(0 / 0)   // true
is_nan(42)       // false
```

### is_finite

```tova
is_finite(n) -> Bool
```

Returns true if the value is a finite number (not Infinity or NaN).

```tova
is_finite(42)       // true
is_finite(INF)      // false
is_finite(0 / 0)    // false
```

### is_close

```tova
is_close(a, b, tol?) -> Bool
```

Returns true if two numbers are within `tol` of each other. Default tolerance is `1e-9`.

```tova
is_close(0.1 + 0.2, 0.3)       // true
is_close(1.0, 1.01, 0.1)       // true
is_close(1.0, 2.0)             // false
```

---

## Integer Math

### gcd

```tova
gcd(a, b) -> Int
```

Greatest common divisor of two integers.

```tova
gcd(12, 8)    // 4
gcd(7, 13)    // 1
```

### lcm

```tova
lcm(a, b) -> Int
```

Least common multiple of two integers.

```tova
lcm(4, 6)    // 12
lcm(3, 7)    // 21
```

### factorial

```tova
factorial(n) -> Int | Nil
```

Returns n! (n factorial). Returns nil for negative inputs.

```tova
factorial(5)     // 120
factorial(0)     // 1
factorial(-1)    // nil
```

---

## Randomness

### random

```tova
random() -> Float
```

Returns a random floating-point number in the range `[0, 1)`.

```tova
random()              // e.g., 0.7234...
```

### random_int

```tova
random_int(lo, hi) -> Int
```

Returns a random integer between `lo` and `hi` (inclusive).

```tova
random_int(1, 6)      // e.g., 4 (dice roll)
random_int(0, 100)    // e.g., 73
```

### random_float

```tova
random_float(lo, hi) -> Float
```

Returns a random float between `lo` (inclusive) and `hi` (exclusive).

```tova
random_float(0, 1)    // e.g., 0.4823...
random_float(-1, 1)   // e.g., -0.312...
```

### choice

```tova
choice(arr) -> T | Nil
```

Returns a random element from an array, or nil if empty.

```tova
choice(["red", "green", "blue"])   // e.g., "green"
choice([])                          // nil
```

### sample

```tova
sample(arr, n) -> List
```

Returns `n` random elements from an array without replacement.

```tova
sample([1, 2, 3, 4, 5], 3)   // e.g., [3, 1, 5]
```

### shuffle

```tova
shuffle(arr) -> List
```

Returns a new array with elements in random order. Does not mutate the original.

```tova
shuffle([1, 2, 3, 4, 5])     // e.g., [3, 5, 1, 4, 2]
```

---

## Async

### sleep

```tova
sleep(ms) -> Promise
```

Returns a Promise that resolves after `ms` milliseconds.

```tova
await sleep(1000)     // wait 1 second
```

---

## Arithmetic Operators

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
  |> map(fn(_) random_int(0, 99))
  |> sorted()

// Distance between two 2D points
fn distance(x1, y1, x2, y2) {
  sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}
```
