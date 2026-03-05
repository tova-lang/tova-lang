<script setup>
const expressionsCode = `// Everything is an expression in Tova
status = "active"

label = if status == "active" { "ON" } else { "OFF" }
print(label)

// Match is an expression too
priority = 3
urgency = match priority {
  1 => "critical"
  2 => "high"
  3 => "medium"
  _ => "low"
}
print("Priority {priority} is {urgency}")

// The last expression in a block IS the return value
fn classify(temp) {
  if temp < 0 { "freezing" }
  elif temp < 20 { "cold" }
  elif temp < 30 { "comfortable" }
  else { "hot" }
}

print(classify(15))
print(classify(35))`

const immutabilityCode = `// Immutable by default — this is a feature, not a limitation
name = "Alice"
base_price = 29.99
tax_rate = 0.08

// Derive new values instead of mutating
total = base_price * (1 + tax_rate)
print("{name}'s total: {total}")

// Use var ONLY when mutation is genuinely needed
var retries = 0
var connected = false

// Simulating a retry loop
for _ in range(3) {
  retries += 1
  if retries == 2 {
    connected = true
  }
}
print("Connected after {retries} tries: {connected}")`

const converterCode = `// PROJECT: Temperature Converter
// Demonstrates values, expressions, functions, and string interpolation

fn celsius_to_fahrenheit(c) {
  c * 9.0 / 5.0 + 32.0
}

fn fahrenheit_to_celsius(f) {
  (f - 32.0) * 5.0 / 9.0
}

fn format_temp(value, unit) {
  rounded = to_int(value * 10) / 10
  "{rounded} {unit}"
}

fn describe_temp(celsius) {
  description = match celsius {
    c if c <= 0 => "freezing"
    c if c <= 10 => "cold"
    c if c <= 20 => "cool"
    c if c <= 30 => "warm"
    _ => "hot"
  }
  description
}

// Convert some temperatures
temps_c = [0, 15, 25, 37, 100]

for temp in temps_c {
  f = celsius_to_fahrenheit(to_float(temp))
  desc = describe_temp(temp)
  c_label = format_temp(to_float(temp), "C")
  f_label = format_temp(f, "F")
  print("{c_label} = {f_label} ({desc})")
}`
</script>

# Chapter 1: Thinking in Tova

Before you write a single function or define a type, there's something more important to learn: **how Tova wants you to think**. Every language has a philosophy, and understanding Tova's will make everything else click.

This chapter teaches three foundational ideas:
1. Everything is an expression
2. Immutability is the default
3. Values flow through transformations

By the end, you'll build a temperature converter that demonstrates all three.

## Everything Is an Expression

In many languages, `if` is a statement — it does something but doesn't return a value. In Tova, **everything is an expression**. An `if` block, a `match`, even a block of code — they all produce values.

```tova
// if is an expression — it returns a value
mood = if hour < 12 { "morning" } else { "afternoon" }
```

No ternary operator needed. No separate syntax for "if that returns a value." It's just `if`.

```tova
// match is an expression
icon = match file_type {
  "pdf" => "📄"
  "jpg" => "🖼"
  "mp3" => "🎵"
  _ => "📁"
}
```

The last expression in any block is its return value. No `return` keyword needed (though you can use it for early returns):

```tova
fn max_of(a, b) {
  if a > b { a } else { b }
}
// The if expression IS the return value
```

This means you can chain expressions naturally:

```tova
message = "You have " ++ to_string(len(items)) ++ match len(items) {
  1 => " item"
  _ => " items"
}
```

<TryInPlayground :code="expressionsCode" label="Expressions Everywhere" />

::: tip Why This Matters
When everything is an expression, you write less code and the code you write is more declarative. Instead of "create a variable, then conditionally assign to it," you say "this variable IS the result of this condition." That's easier to read, easier to reason about, and produces fewer bugs.
:::

## Immutability by Default

When you write `x = 10` in Tova, that's a promise: `x` will always be `10`. You can't reassign it.

```tova
name = "Alice"
name = "Bob"    // Compile error: cannot reassign immutable variable 'name'
```

If you genuinely need a variable that changes, you opt in with `var`:

```tova
var counter = 0
counter += 1    // Fine — you asked for mutability
```

**This isn't a restriction — it's a superpower.** When you see `total = price * quantity`, you know `total` will never secretly change later. You can trust every value.

### The Tova Way: Transform, Don't Mutate

Instead of mutating a value in place, create a new value:

```tova
// Instead of this (imperative, mutation-heavy):
var prices = [10, 20, 30]
var total = 0
for p in prices {
  total += p
}

// Prefer this (expression-based, no mutation):
prices = [10, 20, 30]
total = prices |> sum()
```

Both work. But the second version is one line, impossible to have an off-by-one error, and immediately readable.

```tova
// Transform data by creating new values
original = [3, 1, 4, 1, 5, 9]
sorted_vals = original |> sorted()
unique_vals = original |> unique()
doubled = original |> map(fn(x) x * 2)

// original is untouched — you can trust it
print(original)     // [3, 1, 4, 1, 5, 9]
print(sorted_vals)  // [1, 1, 3, 4, 5, 9]
print(doubled)      // [6, 2, 8, 2, 10, 18]
```

<TryInPlayground :code="immutabilityCode" label="Immutability" />

### When to Use `var`

Use `var` for:
- **Loop counters** that need to increment
- **Accumulators** where a running total builds up step by step
- **State flags** like `var done = false`

Don't use `var` for:
- Values computed from other values (use expressions instead)
- Collections you're transforming (use `map`, `filter`, `reduce` instead)
- Anything where you could compute the final value in one expression

::: warning Common Mistake
New developers sometimes write `var` everywhere out of habit from other languages. Fight this urge. Start immutable, and only reach for `var` when the compiler tells you to — or when mutation genuinely makes the code clearer.
:::

## Type Annotations: Optional but Useful

Tova infers types, so you rarely need to write them. But when you want to be explicit — for documentation, for clarity, or for the type checker — use the `: Type` syntax:

```tova
name: String = "Alice"
age: Int = 30
rate: Float = 0.085
items: [String] = ["apple", "banana", "cherry"]
```

Type annotations shine in function signatures where they communicate intent:

```tova
fn calculate_tax(price: Float, rate: Float) -> Float {
  price * rate
}
```

You don't have to use them everywhere. Many Tova developers annotate function parameters and return types but leave local variables inferred.

## Multiple Assignment

Tova lets you assign multiple variables at once:

```tova
x, y = 10, 20
name, age, active = "Alice", 30, true
```

This is particularly elegant for swaps:

```tova
var a = "left"
var b = "right"
a, b = b, a
// a is now "right", b is now "left"
```

And for functions that return multiple values:

```tova
fn divide_with_remainder(a, b) {
  a / b, a % b
}

quotient, remainder = divide_with_remainder(17, 5)
print("{quotient} remainder {remainder}")   // 3 remainder 2
```

## Destructuring: Unpacking Data

When you have structured data, destructuring pulls out the pieces you need:

```tova
// Object destructuring
config = { host: "localhost", port: 8080, debug: true }
{ host, port } = config
print("Server at {host}:{port}")

// Array destructuring
coordinates = [10, 20, 30]
[x, y, z] = coordinates

// Rest patterns grab everything else
numbers = [1, 2, 3, 4, 5]
[first, second, ...rest] = numbers
print("First two: {first}, {second}")
print("The rest: {rest}")   // [3, 4, 5]
```

Destructuring works in function parameters too (we'll cover this in Chapter 2).

## Project: Temperature Converter

Let's put it all together. This converter demonstrates expressions, immutability, and clean data flow:

```tova
fn celsius_to_fahrenheit(c) {
  c * 9.0 / 5.0 + 32.0
}

fn fahrenheit_to_celsius(f) {
  (f - 32.0) * 5.0 / 9.0
}

fn format_temp(value, unit) {
  rounded = to_int(value * 10) / 10
  "{rounded} {unit}"
}

fn describe_temp(celsius) {
  match celsius {
    c if c <= 0 => "freezing"
    c if c <= 10 => "cold"
    c if c <= 20 => "cool"
    c if c <= 30 => "warm"
    _ => "hot"
  }
}

temps_c = [0, 15, 25, 37, 100]

for temp in temps_c {
  f = celsius_to_fahrenheit(to_float(temp))
  desc = describe_temp(temp)
  c_label = format_temp(to_float(temp), "C")
  f_label = format_temp(f, "F")
  print("{c_label} = {f_label} ({desc})")
}
```

Notice what's happening:
- No `var` anywhere — every value is computed once and never changes
- `match` is used as an expression to produce the description
- Functions are small and focused — each does one thing
- String interpolation makes output readable

<TryInPlayground :code="converterCode" label="Temperature Converter" />

## Exercises

**Exercise 1.1:** Write a function `bmi(weight_kg, height_m)` that calculates BMI (`weight / height²`) and returns a string classification: "underweight" (< 18.5), "normal" (18.5-24.9), "overweight" (25-29.9), or "obese" (30+). Use `match` with guards.

**Exercise 1.2:** Write a function `fizzbuzz(n)` that returns "Fizz" for multiples of 3, "Buzz" for multiples of 5, "FizzBuzz" for multiples of both, and the number as a string otherwise. Then print FizzBuzz for 1 to 30. Hint: use `match` with guards checking `n % 15`, `n % 3`, `n % 5`.

**Exercise 1.3:** Create a simple unit converter that handles at least three conversion types (km to miles, kg to pounds, liters to gallons). Define a function for each conversion, then loop through a list of test values and print the results.

## Challenge

Build a **tip calculator** that takes a bill amount, tip percentage, and number of people. It should:
1. Calculate the tip amount
2. Calculate total per person
3. Print a nicely formatted receipt using string interpolation
4. Handle the edge case of zero people (return a descriptive error string instead of dividing by zero)

All without a single `var`.

---

[Next: Functions That Shine →](./functions)
