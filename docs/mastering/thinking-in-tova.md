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

## Comments

Tova has three kinds of comments:

```tova
// Single-line comment — everything after // is ignored

/* Block comment — can span
   multiple lines */

/* Block comments /* can be nested */
   and still close correctly */

/// Doc comment — picked up by the LSP for hover tooltips
/// Place above functions, types, or variables
fn important_function() { 42 }
```

Single-line `//` comments are for inline notes. Block `/* ... */` comments are for temporarily disabling code or writing longer explanations. **Block comments nest properly** — you can comment out a region that already contains block comments without breaking anything.

Doc comments (`///`) are special: the language server reads them and shows them in your editor when you hover over the documented symbol. We cover doc comments in more detail later in this chapter.

## String Types

Tova has several string forms for different situations:

### Double-Quoted Strings (Interpolation)

The most common form. Expressions inside `{braces}` are evaluated and inserted:

```tova
name = "Alice"
greeting = "Hello, {name}!"   // "Hello, Alice!"
math = "2 + 2 = {2 + 2}"     // "2 + 2 = 4"
```

### Single-Quoted Strings (No Interpolation)

Single quotes create **literal strings** — no interpolation, no escape processing:

```tova
pattern = 'Hello, {name}'     // Literally: Hello, {name}
regex_str = '\d+\.\d+'        // Backslashes are literal
```

Use single quotes when you need literal braces or backslashes, like in regex patterns, template strings, or configuration values.

### Raw Strings

Prefix with `r` to disable all escape processing:

```tova
path = r"C:\Users\Alice\Documents"   // No \\, just \
regex = r"\d{3}-\d{4}"               // Backslashes are literal
```

Raw strings are perfect for Windows paths, regex patterns, and any text where backslashes should be literal.

### Triple-Quoted Multiline Strings

For multi-line text, use triple double quotes. Triple-quoted strings automatically **dedent** — leading whitespace common to all lines is stripped:

```tova
html = """
  <div>
    <h1>Hello</h1>
    <p>Welcome to Tova</p>
  </div>
"""
// Result has no leading indent — the common 2-space prefix is removed
```

This keeps your code indented nicely while producing clean output.

### Escape Sequences

Double-quoted strings support these escape sequences:

| Escape | Character |
|--------|-----------|
| `\n` | Newline |
| `\t` | Tab |
| `\r` | Carriage return |
| `\\` | Literal backslash |
| `\"` | Literal double quote |
| `\'` | Literal single quote |
| `\{` | Literal opening brace (prevents interpolation) |
| `\}` | Literal closing brace |

```tova
print("Line 1\nLine 2")       // Two lines
print("Tab\there")             // Tab-separated
print("Price: \{not interpolated\}")  // Literal braces
```

## Number Literals

Beyond plain decimal numbers, Tova supports several numeric literal formats that make specific domains more readable.

### Scientific Notation

For very large or very small numbers, use `e` notation:

```tova
speed_of_light = 3.0e8          // 300,000,000
planck = 6.626e-34              // 0.000...000626
avogadro = 6.022e23             // 602,200,000,000,000,000,000,000
```

Scientific notation is standard in physics, engineering, and data science. The number before `e` is the coefficient, the number after is the power of 10.

### Binary Literals: `0b`

Prefix a number with `0b` to write it in binary (base 2). This is invaluable when working with bit flags, masks, or binary protocols:

```tova
// Binary literals — each digit is a bit
permissions = 0b1010         // 10 in decimal
all_bits    = 0b11111111     // 255

// Practical: checking individual bit flags
read_flag  = 0b100
write_flag = 0b010
exec_flag  = 0b001
user_perms = 0b110           // read + write, no execute

print("Permissions: {user_perms}")  // 6
```

### Hexadecimal Literals: `0x`

Prefix with `0x` for hex (base 16). Hex is the standard for colors, memory addresses, and byte values:

```tova
// Hex literals
white    = 0xFFFFFF
red      = 0xFF0000
max_byte = 0xFF              // 255
address  = 0x1A3F

print("Red: {red}")          // 16711680
print("Max byte: {max_byte}") // 255
```

### Octal Literals: `0o`

Prefix with `0o` for octal (base 8). You will see this most often with Unix file permissions:

```tova
// Octal literals — common for file permissions
read_write_exec = 0o755      // rwxr-xr-x
read_only       = 0o444      // r--r--r--
value           = 0o17       // 15 in decimal

print("Permission: {read_write_exec}")  // 493
```

### Numeric Separators

For any numeric format, you can use underscores as visual separators to make long numbers more readable:

```tova
million     = 1_000_000
big_hex     = 0xFF_FF_FF
binary_mask = 0b1111_0000_1111_0000
```

The underscores are purely visual and have no effect on the value.

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

## Control Flow: Beyond if

Tova has several loop and control flow constructs beyond `if`/`elif`/`else`:

### while Loops

Use `while` when you don't know how many iterations you need:

```tova
var n = 1
while n < 100 {
  n = n * 2
}
print("First power of 2 >= 100: {n}")
```

### loop: Infinite Loops

`loop` runs forever — use `break` to exit:

```tova
var attempts = 0
loop {
  attempts += 1
  result = try_connect()
  if result.isOk() { break }
  if attempts >= 5 { break }
}
print("Connected after {attempts} attempts")
```

### break and continue

`break` exits a loop. `continue` skips to the next iteration:

```tova
// Skip even numbers, stop at 15
for i in range(1, 20) {
  if i % 2 == 0 { continue }
  if i > 15 { break }
  print(i)
}
```

### Labeled Loops

For nested loops, labels let you break or continue an outer loop:

```tova
// Find the first pair that sums to 10
outer: for x in range(1, 10) {
  for y in range(1, 10) {
    if x + y == 10 {
      print("Found: {x} + {y} = 10")
      break outer
    }
  }
}
```

### for...in with when Guards

Filter iterations directly with `when`:

```tova
for item in inventory when item.price > 100 {
  print("Premium: {item.name}")
}
// Equivalent to: for item in inventory { if item.price > 100 { ... } }
```

### for...else

The `for...else` construct runs the `else` block only when the loop completes **without** hitting a `break`:

```tova
for user in users {
  if user.name == "Alice" {
    print("Found Alice!")
    break
  }
} else {
  print("Alice is not in the list")
}
```

This is perfect for search patterns. Without `for...else`, you'd need a flag variable:

```tova
// Without for...else (tedious)
var found = false
for user in users {
  if user.name == "Alice" {
    found = true
    break
  }
}
if !found { print("Alice is not in the list") }

// With for...else (clean)
for user in users {
  if user.name == "Alice" { break }
} else {
  print("Alice is not in the list")
}
```

### loop as an Expression

Since everything in Tova is an expression, `loop` can return a value via `break`:

```tova
// break with a value turns loop into an expression
result = loop {
  input = get_input()
  if is_valid(input) {
    break input
  }
  print("Invalid, try again")
}
// result now holds the valid input
```

This is useful for retry-until-success patterns without needing a mutable variable outside the loop.

## Guard Clauses

Guard clauses handle preconditions cleanly — exit early if something is wrong:

```tova
fn process_order(order) {
  guard order != nil else { return Err("No order") }
  guard len(order.items) > 0 else { return Err("Empty order") }
  guard order.total > 0 else { return Err("Invalid total") }

  // Happy path — all guards passed
  Ok(ship(order))
}
```

`guard condition else { body }` checks the condition. If it's false, the `else` block runs (which must exit — via `return`, `break`, or `continue`). If true, execution continues normally.

Guards are perfect for:
- **Validating function inputs** at the top
- **Exiting loops** on bad data
- **Flattening deeply nested if/else chains**

```tova
// Without guard (nested)
fn validate(user) {
  if user != nil {
    if len(user.name) > 0 {
      if contains(user.email, "@") {
        Ok(user)
      } else { Err("Invalid email") }
    } else { Err("Empty name") }
  } else { Err("No user") }
}

// With guard (flat, readable)
fn validate(user) {
  guard user != nil else { return Err("No user") }
  guard len(user.name) > 0 else { return Err("Empty name") }
  guard contains(user.email, "@") else { return Err("Invalid email") }
  Ok(user)
}
```

::: tip The Guard Philosophy
Guards flip the logic: instead of nesting "if everything is ok," you **exit early on failure**. The happy path stays at the top indentation level, making code much more readable.
:::

## Arithmetic: The Exponentiation Operator

Tova includes the `**` operator for exponentiation, so you never need a separate power function for basic math:

```tova
// Raising to a power
result = 2 ** 10        // 1024
cubed = 5 ** 3          // 125

// Fractional exponents for roots
sqrt_of_144 = 144 ** 0.5    // 12.0
cube_root   = 27 ** (1.0 / 3.0)  // 3.0

// Practical: compound interest
principal = 1000.0
rate = 0.05
years = 10
future_value = principal * (1.0 + rate) ** years
print("After {years} years: {future_value}")
```

The `**` operator is right-associative, meaning `2 ** 3 ** 2` evaluates as `2 ** (3 ** 2)` = `2 ** 9` = 512, which matches mathematical convention.

## Compound Assignments

Tova supports shorthand assignments for common operations:

```tova
var score = 100
score += 10    // score = score + 10 → 110
score -= 5     // score = score - 5 → 105
score *= 2     // score = score * 2 → 210
score /= 3     // score = score / 3 → 70
```

These only work with `var` variables (mutable bindings).

## `mut`: An Alias for `var`

If you're coming from Rust, you might prefer `mut` over `var` for mutable variables. Tova supports both:

```tova
var counter = 0      // Classic Tova style
mut counter = 0      // Same thing — Rust-flavored

counter += 1         // Both work identically
```

`mut` and `var` are completely interchangeable. Use whichever reads better to you. Most Tova codebases use `var`, but `mut` is available if your team prefers it.

## Membership Testing: `in` and `not in`

The `in` operator checks if a value exists in a collection:

```tova
fruits = ["apple", "banana", "cherry"]

print("banana" in fruits)       // true
print("mango" in fruits)        // false
print("mango" not in fruits)    // true
```

It works with strings too — checking if a substring exists:

```tova
print("ov" in "Tova")           // true
print("xyz" not in "hello")     // true
```

And with object keys:

```tova
config = { host: "localhost", port: 3000 }
print("host" in config)         // true
print("debug" in config)        // false
```

`in` is more readable than calling `contains()` and works naturally in if conditions and guard clauses:

```tova
fn process(role) {
  guard role in ["admin", "editor", "viewer"] else {
    return Err("Unknown role: {role}")
  }
  Ok("Processing as {role}")
}
```

## Optional Chaining and Null Coalescing

When working with data that might have missing fields, use `?.` and `??`:

### Optional Chaining: `?.`

Safely access nested properties without crashing on nil:

```tova
user = { name: "Alice", address: { city: "Portland" } }

// Without optional chaining — crashes if address is nil
city = user.address.city

// With optional chaining — returns nil if any part is missing
city = user?.address?.city    // "Portland"
city = user?.phone?.number    // nil (no crash)
```

### Null Coalescing: `??`

Provide a fallback for nil values:

```tova
name = user?.nickname ?? "Anonymous"
port = config?.port ?? 3000
theme = settings?.theme ?? "dark"
```

Combine them for safe nested access with defaults:

```tova
timezone = user?.preferences?.timezone ?? "UTC"
```

## Nil: The Absence of a Value

Tova uses `nil` to represent the absence of a value — the equivalent of `null` in JavaScript or `None` in Python:

```tova
empty = nil

if empty == nil {
  print("Nothing here")
}
```

You'll encounter `nil` when accessing missing object properties, when functions have no explicit return value, and as the "not found" default. In well-typed Tova code, prefer `Option` (Some/None) over raw `nil` — it forces you to handle the missing case explicitly.

## Chained Comparisons

Tova supports chained comparisons, just like mathematical notation:

```tova
age = 25

// Instead of: age >= 18 and age < 65
if 18 <= age < 65 {
  print("Working age")
}

// Chain as many as you want
if 0 < x < y < 100 {
  print("x and y are both between 0 and 100, and x < y")
}
```

Chained comparisons are syntactic sugar — `a < b < c` is equivalent to `a < b and b < c`, but each operand is evaluated only once. This is particularly useful for range checks and sorting validation.

## Type Checking with `is` and `is not`

Sometimes you need to check what type a value actually is at runtime. Tova provides the `is` and `is not` operators for clean, readable type checks:

```tova
// Basic type checks
name = "Alice"
age = 30

print(name is String)      // true
print(age is Int)          // true
print(age is String)       // false
print(name is not Int)     // true
```

The `is` operator works with all of Tova's built-in types:

```tova
fn describe(value) {
  if value is String { "a string" }
  elif value is Int { "an integer" }
  elif value is Float { "a float" }
  elif value is Bool { "a boolean" }
  elif value is Array { "an array" }
  elif value is Nil { "nil" }
  else { "something else" }
}

print(describe("hello"))   // "a string"
print(describe(42))        // "an integer"
print(describe(3.14))      // "a float"
print(describe(true))      // "a boolean"
```

### Using `is` with Custom Types

The `is` operator also works with your own types and variants, which is especially useful when processing mixed data:

```tova
type Shape {
  Circle(Float)
  Rectangle(Float, Float)
}

fn area(shape) {
  if shape is Circle {
    // handle circle
    print("It's a circle")
  }
  if shape is not Rectangle {
    print("Not a rectangle")
  }
}
```

::: tip When to Use `is` vs `match`
Use `is` for quick single-type checks in conditionals. Use `match` when you need to handle multiple variants and extract data from them. They complement each other nicely.
:::

## Defer: Cleanup That Always Runs

`defer` schedules code to run when the current scope exits, no matter what:

```tova
fn process_file(path) {
  file = open(path)
  defer close(file)       // Will run when function returns

  data = read(file)
  transform(data)         // Even if this fails, file gets closed
}
```

Multiple defers run in **reverse** order (LIFO — last in, first out):

```tova
fn example() {
  defer print("third")
  defer print("second")
  defer print("first")
}
// Prints: first, second, third
```

`defer` is perfect for:
- **Closing files or connections** after use
- **Releasing resources** regardless of errors
- **Logging** function exit

## Doc Comments

Regular comments (`//`) are for you and your team. **Doc comments** (`///`) are for your tools. When you write a `///` comment above a function, type, or variable declaration, Tova's language server picks it up and shows it in editor hover tooltips, autocomplete, and documentation generation.

```tova
/// Calculates the Body Mass Index from weight and height.
/// Returns a classification string: "underweight", "normal",
/// "overweight", or "obese".
fn bmi(weight_kg: Float, height_m: Float) -> String {
  index = weight_kg / (height_m ** 2)
  match index {
    i if i < 18.5 => "underweight"
    i if i < 25.0 => "normal"
    i if i < 30.0 => "overweight"
    _ => "obese"
  }
}

/// The gravitational constant in m/s^2.
gravity = 9.81

/// Represents a 2D point in space.
type Point {
  x: Float
  y: Float
}
```

When you hover over `bmi` in your editor, the LSP shows the doc comment alongside the function signature and type information. This is especially valuable in larger codebases where functions may be defined far from where they are used.

### Doc Comment Best Practices

- Start with a one-line summary of **what** the function does
- Add additional `///` lines for details, parameters, or edge cases
- Document the **why**, not just the **what** -- future readers will thank you
- Consecutive `///` lines are grouped together as a single doc block

```tova
/// Retries an operation up to `max` times with exponential backoff.
/// Waits 100ms after the first failure, doubling each time.
/// Returns the first successful result, or the last error.
fn retry(max: Int, operation: Function) -> Result {
  var attempts = 0
  var delay = 100
  loop {
    attempts += 1
    result = operation()
    if result.isOk() { return result }
    if attempts >= max { return result }
    sleep(delay)
    delay *= 2
  }
}
```

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

**Exercise 1.4:** Write a function `find_pair_sum(numbers, target)` that uses labeled loops to find two numbers in the array that add up to the target. Return the pair as `[a, b]` or `None` if no pair exists.

**Exercise 1.5:** Rewrite the following nested validation using guard clauses:
```tova
fn check(data) {
  if data != nil {
    if data.age >= 18 {
      if data.name != "" {
        Ok(data)
      } else { Err("no name") }
    } else { Err("too young") }
  } else { Err("no data") }
}
```

## Challenge

Build a **tip calculator** that takes a bill amount, tip percentage, and number of people. It should:
1. Calculate the tip amount
2. Calculate total per person
3. Print a nicely formatted receipt using string interpolation
4. Handle the edge case of zero people (return a descriptive error string instead of dividing by zero)

All without a single `var`.

---

[Next: Functions That Shine →](./functions)
