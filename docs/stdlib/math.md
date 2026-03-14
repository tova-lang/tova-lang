# Math & Stats

Tova provides essential math functions for numerical computation, statistics, and number formatting.

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
var best = INF
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
toRadians(deg) -> Float
toDegrees(rad) -> Float
```

Convert between degrees and radians.

```tova
toRadians(180)   // PI
toDegrees(PI)    // 180
```

---

## Logarithms & Exponentials

### ln

```tova
ln(n) -> Float
```

Natural logarithm (base e). Also available as `math.log(n)`.

```tova
ln(E)         // 1
ln(1)         // 0
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
isNaN(n) -> Bool
```

Returns true if the value is NaN.

```tova
isNaN(0 / 0)   // true
isNaN(42)       // false
```

### is_finite

```tova
isFinite(n) -> Bool
```

Returns true if the value is a finite number (not Infinity or NaN).

```tova
isFinite(42)       // true
isFinite(INF)      // false
isFinite(0 / 0)    // false
```

### is_close

```tova
isClose(a, b, tol?) -> Bool
```

Returns true if two numbers are within `tol` of each other. Default tolerance is `1e-9`.

```tova
isClose(0.1 + 0.2, 0.3)       // true
isClose(1.0, 1.01, 0.1)       // true
isClose(1.0, 2.0)             // false
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
randomInt(lo, hi) -> Int
```

Returns a random integer between `lo` and `hi` (inclusive).

```tova
randomInt(1, 6)      // e.g., 4 (dice roll)
randomInt(0, 100)    // e.g., 73
```

### random_float

```tova
randomFloat(lo, hi) -> Float
```

Returns a random float between `lo` (inclusive) and `hi` (exclusive).

```tova
randomFloat(0, 1)    // e.g., 0.4823...
randomFloat(-1, 1)   // e.g., -0.312...
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

## Geometry & Interpolation

### hypot

```tova
hypot(a, b) -> Float
```

Returns the hypotenuse (length of the vector from origin to point `(a, b)`). More numerically stable than `sqrt(a**2 + b**2)`.

```tova
hypot(3, 4)      // 5
hypot(5, 12)     // 13
hypot(0, 0)      // 0
```

### lerp

```tova
lerp(a, b, t) -> Float
```

Linear interpolation between `a` and `b`. When `t` is `0`, returns `a`; when `t` is `1`, returns `b`.

```tova
lerp(0, 10, 0.5)    // 5
lerp(0, 10, 0)      // 0
lerp(0, 10, 1)      // 10
lerp(0, 100, 0.25)  // 25
```

### divmod

```tova
divmod(a, b) -> [Int, Int]
```

Returns both the quotient and remainder as a tuple.

```tova
divmod(10, 3)    // [3, 1]
divmod(7, 2)     // [3, 1]
divmod(6, 3)     // [2, 0]
```

### avg

```tova
avg(arr) -> Float
```

Returns the arithmetic mean of an array. Returns `0` for an empty array.

```tova
avg([1, 2, 3, 4, 5])    // 3
avg([10])                 // 10
avg([])                   // 0
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

## Statistics

### mean

```tova
mean(arr) -> Float
mean(fn) -> AggFn
```

When called with an array, returns the arithmetic mean. When called with a function or string, returns an aggregation helper for use with `agg()`.

```tova
mean([1, 2, 3, 4, 5])     // 3
mean([10])                  // 10
mean([])                    // 0

// As aggregation helper
table |> groupBy("dept") |> agg({ avg_salary: mean("salary") })
```

### median

```tova
median(arr) -> Float | Nil
median(fn) -> AggFn
```

When called with an array, returns the middle value (or average of two middle values for even-length arrays). When called with a function or string, returns an aggregation helper.

```tova
median([1, 2, 3, 4, 5])   // 3
median([1, 2, 3, 4])       // 2.5
median([])                  // nil
```

### mode

```tova
mode(arr) -> T | Nil
```

Returns the most frequently occurring element. Returns `nil` for empty arrays.

```tova
mode([1, 2, 2, 3, 3, 3])      // 3
mode(["a", "b", "a"])          // "a"
mode([])                        // nil
```

### stdev

```tova
stdev(arr) -> Float
```

Returns the population standard deviation.

```tova
stdev([2, 4, 4, 4, 5, 5, 7, 9])   // ~2.0
stdev([5, 5, 5])                    // 0
stdev([])                           // 0
```

### variance

```tova
variance(arr) -> Float
```

Returns the population variance.

```tova
variance([2, 4, 4, 4, 5, 5, 7, 9])   // ~4.0
variance([5, 5, 5])                    // 0
```

### percentile

```tova
percentile(arr, p) -> Float | Nil
```

Returns the `p`-th percentile (0--100) of a numeric array. Uses linear interpolation between data points.

```tova
percentile([1, 2, 3, 4, 5], 50)   // 3
percentile([1, 2, 3, 4], 25)      // 1.75
percentile([10, 20, 30], 0)       // 10
percentile([10, 20, 30], 100)     // 30
percentile([], 50)                  // nil
```

---

## Number Formatting

### format_number

```tova
formatNumber(n, opts?) -> String
```

Formats a number with thousands separators. Options: `separator` (default: `","`), `decimals` (fixed decimal places).

```tova
formatNumber(1234567)                     // "1,234,567"
formatNumber(1234.5, { decimals: 2 })    // "1,234.50"
formatNumber(1234567, { separator: "." })  // "1.234.567"
```

### to_hex

```tova
toHex(n) -> String
```

Converts an integer to a hexadecimal string.

```tova
toHex(255)    // "ff"
toHex(16)     // "10"
toHex(0)      // "0"
```

### to_binary

```tova
toBinary(n) -> String
```

Converts an integer to a binary string.

```tova
toBinary(10)      // "1010"
toBinary(255)     // "11111111"
toBinary(0)       // "0"
```

### to_octal

```tova
toOctal(n) -> String
```

Converts an integer to an octal string.

```tova
toOctal(8)        // "10"
toOctal(255)      // "377"
```

### to_fixed

```tova
toFixed(n, decimals) -> Number
```

Rounds a number to a fixed number of decimal places and returns a number (not a string). Returns `Float` when `decimals > 0`, `Int` when `decimals == 0`.

```tova
toFixed(3.14159, 2)    // 3.14  (Float)
toFixed(3.7, 0)         // 4    (Int)
toFixed(1.005, 2)       // 1.0  (Float, due to IEEE 754 rounding)
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

## Typed Array Functions

These functions operate on TypedArrays (`Float64Array`, `Int32Array`, etc.) for high-performance numeric computation. They are designed for use with the `@fast` decorator (see [Performance](../guide/performance.md)).

### typed_sum

```tova
typedSum(arr) -> Float
```

Computes the sum using Kahan compensated summation, which minimizes floating-point error accumulation:

```tova
@fast fn precise_total(data: [Float]) -> Float {
  typedSum(data)
}
```

### typed_dot

```tova
typedDot(a, b) -> Float
```

Computes the dot product of two arrays:

```tova
@fast fn dot(a: [Float], b: [Float]) -> Float {
  typedDot(a, b)
}
```

### typed_norm

```tova
typedNorm(arr) -> Float
```

Computes the L2 (Euclidean) norm of an array.

### typed_add

```tova
typedAdd(a, b) -> TypedArray
```

Returns a new typed array with element-wise addition of `a` and `b`.

### typed_scale

```tova
typedScale(arr, scalar) -> TypedArray
```

Returns a new typed array with every element multiplied by `scalar`.

### typed_map

```tova
typedMap(arr, f) -> TypedArray
```

Applies `f` to each element, returning a new typed array of the same type.

### typed_reduce

```tova
typedReduce(arr, f, init) -> T
```

Reduces the typed array with function `f` and initial value `init`.

### typed_sort

```tova
typedSort(arr) -> TypedArray
```

Returns a new sorted typed array.

### typed_zeros

```tova
typedZeros(n) -> Float64Array
```

Creates a `Float64Array` of `n` zeros.

### typed_ones

```tova
typedOnes(n) -> Float64Array
```

Creates a `Float64Array` of `n` ones.

### typed_fill

```tova
typedFill(arr, value) -> TypedArray
```

Returns a new typed array of the same type filled with `value`.

### typed_range

```tova
typedRange(start, end, step) -> Float64Array
```

Creates a `Float64Array` with values from `start` to `end` (exclusive), incrementing by `step`.

### typed_linspace

```tova
typedLinspace(start, end, n) -> Float64Array
```

Creates a `Float64Array` of `n` evenly-spaced values from `start` to `end` (inclusive).

---

## Pipeline Examples

```tova
// Normalize scores to 0-100 range
scores
  |> map(fn(s) clamp(s, 0, 100))
  |> sorted()

// Generate random sample
range(10)
  |> map(fn(_) randomInt(0, 99))
  |> sorted()

// Distance between two 2D points
fn distance(x1, y1, x2, y2) {
  sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}

// Statistical summary
data = [12, 15, 18, 22, 29, 34, 41]
print("Mean: {mean(data)}")
print("Median: {median(data)}")
print("Stdev: {stdev(data)}")
print("P90: {percentile(data, 90)}")
```
