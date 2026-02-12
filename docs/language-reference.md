# Language Reference

This is the complete syntax and semantics reference for the Lux programming language.

## Lexical Elements

### Comments

```lux
// Line comment (discarded by compiler)

/// Docstring comment (preserved as metadata)

/* Block comment
   supports nesting */
```

Block comments can be nested: `/* outer /* inner */ still outer */`.

### Identifiers

Identifiers start with a letter or underscore, followed by letters, digits, or underscores:

```
my_var, _private, counter2, MyType
```

### Keywords

The complete list of reserved keywords:

**Control flow:** `if`, `elif`, `else`, `for`, `while`, `match`, `return`

**Declarations:** `fn`, `var`, `let`, `type`, `import`, `from`, `export`, `as`

**Logic:** `and`, `or`, `not`, `in`

**Values:** `true`, `false`, `nil`

**Error handling:** `try`, `catch`

**Full-stack:** `server`, `client`, `shared`, `route`, `state`, `computed`, `effect`, `component`, `store`

**HTTP methods:** `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`

> **Note:** `throw` is NOT a keyword in Lux. There is no throw statement.

### Number Literals

```lux
42              // integer
3.14            // float
1_000_000       // underscore separators (ignored)
0xFF            // hexadecimal
0b1010          // binary
0o755           // octal
1.5e10          // scientific notation
2.5E-3          // scientific with negative exponent
```

### String Literals

**Double-quoted strings** support interpolation with `{expr}`:

```lux
name = "Alice"
greeting = "Hello, {name}!"             // "Hello, Alice!"
math = "1 + 2 = {1 + 2}"               // "1 + 2 = 3"
nested = "Items: {len(items)}"           // interpolation with function calls
```

**Single-quoted strings** are simple (no interpolation):

```lux
pattern = 'no {interpolation} here'     // literal text
```

**Escape sequences** (both string types):

| Sequence | Meaning |
|----------|---------|
| `\n` | Newline |
| `\t` | Tab |
| `\r` | Carriage return |
| `\\` | Backslash |
| `\"` | Double quote |
| `\'` | Single quote |
| `\{` | Literal `{` (prevents interpolation) |

### Boolean Literals

```lux
is_active = true
is_deleted = false
```

### Nil

```lux
result = nil    // absence of value
```

## Operators

### Arithmetic

| Operator | Description | Example |
|----------|-------------|---------|
| `+` | Addition | `1 + 2` |
| `-` | Subtraction / Negation | `5 - 3`, `-x` |
| `*` | Multiplication | `4 * 5` |
| `/` | Division | `10 / 3` |
| `%` | Modulo | `10 % 3` |
| `**` | Exponentiation | `2 ** 10` |

**String multiplication:** `"-" * 40` produces a string of 40 dashes.

### Comparison

| Operator | Description | Example |
|----------|-------------|---------|
| `==` | Equal | `a == b` |
| `!=` | Not equal | `a != b` |
| `<` | Less than | `a < b` |
| `<=` | Less or equal | `a <= b` |
| `>` | Greater than | `a > b` |
| `>=` | Greater or equal | `a >= b` |

**Chained comparisons** are supported (Python-style):

```lux
if 1 < x < 10 { ... }          // equivalent to: 1 < x and x < 10
if a <= b <= c { ... }
```

### Logical

| Operator | Description |
|----------|-------------|
| `and` / `&&` | Logical AND |
| `or` / `\|\|` | Logical OR |
| `not` / `!` | Logical NOT |

Both keyword and symbolic forms are supported. The keyword forms (`and`, `or`, `not`) are idiomatic Lux.

### Membership

```lux
if "banana" in fruits { ... }
if x not in excluded { ... }
```

### Assignment

| Operator | Description |
|----------|-------------|
| `=` | Assignment |
| `+=` | Add and assign |
| `-=` | Subtract and assign |
| `*=` | Multiply and assign |
| `/=` | Divide and assign |

### Other Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `\|>` | Pipe | `data \|> transform() \|> display()` |
| `..` | Range (exclusive end) | `1..10` |
| `..=` | Range (inclusive end) | `1..=10` |
| `...` | Spread | `[...arr1, ...arr2]` |
| `?.` | Optional chaining | `user?.name` |
| `??` | Null coalescing | `value ?? default` |
| `.` | Member access | `obj.prop` |
| `[]` | Subscript / index | `arr[0]` |
| `=>` | Fat arrow | match arms, routes |
| `->` | Return type annotation | `fn add(a, b) -> Int` |

### Operator Precedence

From highest to lowest:

| Level | Operators | Associativity |
|-------|-----------|--------------|
| 1 | `.`, `?.`, `[]`, `()` | Left |
| 2 | `-` (unary), `...` (spread) | Right |
| 3 | `**` | Right |
| 4 | `*`, `/`, `%` | Left |
| 5 | `+`, `-` | Left |
| 6 | `..`, `..=` | Left |
| 7 | `in`, `not in` | Left |
| 8 | `<`, `<=`, `>`, `>=`, `==`, `!=` | Left |
| 9 | `not`, `!` | Right |
| 10 | `and`, `&&` | Left |
| 11 | `or`, `\|\|` | Left |
| 12 | `??` | Left |
| 13 | `\|>` | Left |

## Variables

### Immutable Variables

Variables are immutable by default:

```lux
name = "Alice"
x = 42
items = [1, 2, 3]
```

### Mutable Variables

Use `var` to declare mutable variables:

```lux
var count = 0
count += 1
count = 10
```

### Multiple Assignment

```lux
a, b = 1, 2
a, b = b, a         // swap
x, y, z = get_coordinates()
```

### Destructuring

```lux
let { name, age } = person
let { x, y: vertical } = point      // rename
let [first, second] = pair
let [head, ...rest] = items          // rest pattern
```

## Functions

### Basic Functions

```lux
fn greet(name) {
  "Hello, {name}!"
}
```

The last expression in a function body is the implicit return value.

### Default Parameters

```lux
fn greet(name = "World") {
  "Hello, {name}!"
}

greet()          // "Hello, World!"
greet("Alice")   // "Hello, Alice!"
```

### Type Annotations

```lux
fn add(a: Int, b: Int) -> Int {
  a + b
}
```

### Explicit Return

```lux
fn find_first(items, predicate) {
  for item in items {
    if predicate(item) {
      return item
    }
  }
  nil
}
```

### Lambda Expressions

```lux
// Full form
double = fn(x) { x * 2 }

// Expression body (no braces needed)
double = fn(x) x * 2

// Arrow syntax
double = x => x * 2

// Multi-parameter
add = fn(a, b) a + b
```

### Named Arguments

```lux
fn create_user(name, age, role = "user") { ... }

create_user(name: "Alice", age: 30, role: "admin")
```

### Pipe Operator

The pipe operator passes the left value as the first argument to the right function:

```lux
result = [1, 2, 3, 4, 5]
  |> filter(fn(x) x > 2)
  |> map(fn(x) x * 10)
  |> sum()
// result = 120
```

## Control Flow

### If / Elif / Else

```lux
if score >= 90 {
  "A"
} elif score >= 80 {
  "B"
} elif score >= 70 {
  "C"
} else {
  "F"
}
```

> **Note:** Lux uses `elif`, not `else if`.

`if` can be used as an expression (when all branches return values):

```lux
grade = if score >= 90 { "A" } elif score >= 80 { "B" } else { "F" }
```

### For Loops

```lux
// Iterate over collection
for item in items {
  print(item)
}

// With index
for i, item in items {
  print("{i}: {item}")
}

// Over a range
for i in range(10) {
  print(i)
}

// For-else (runs else block if loop never executes)
for item in items {
  print(item)
} else {
  print("No items")
}
```

> **Note:** For loop destructuring uses comma-separated identifiers: `for key, val in pairs {}`, NOT `for [a, b] in items {}`.

### While Loops

```lux
var i = 0
while i < 10 {
  print(i)
  i += 1
}
```

### Match Expressions

```lux
fn describe(value) {
  match value {
    0 => "zero"
    1..10 => "small"
    n if n > 100 => "big: {n}"
    _ => "other"
  }
}
```

See [Pattern Matching](#pattern-matching) for full pattern syntax.

### Try / Catch

```lux
try {
  result = risky_operation()
  process(result)
} catch err {
  print("Error: {err}")
}
```

## Pattern Matching

The `match` expression supports these pattern types:

### Literal Patterns

```lux
match status {
  200 => "OK"
  404 => "Not Found"
  500 => "Server Error"
  "custom" => "Custom status"
  true => "Yes"
  _ => "Unknown"
}
```

### Range Patterns

```lux
match score {
  0..60 => "Fail"          // exclusive end: 0 to 59
  60..=100 => "Pass"       // inclusive end: 60 to 100
}
```

### Binding Patterns

```lux
match value {
  n if n > 0 => "positive: {n}"
  n if n < 0 => "negative: {n}"
  n => "zero: {n}"
}
```

### Variant Patterns

```lux
type Shape {
  Circle(radius: Float),
  Rectangle(width: Float, height: Float),
  Point
}

match shape {
  Circle(r) => 3.14 * r ** 2
  Rectangle(w, h) => w * h
  Point => 0
}
```

### Array Patterns

```lux
match list {
  [] => "empty"
  [x] => "one: {x}"
  [a, b] => "two: {a}, {b}"
  _ => "many"
}
```

### Wildcard Pattern

```lux
match value {
  _ => "matches anything"
}
```

### Guards

Any pattern can include a guard condition with `if`:

```lux
match value {
  n if n > 0 and n < 100 => "in range"
  n => "out of range"
}
```

## Type System

### Type Declarations

**Struct-like types** (all fields, no variants):

```lux
type User {
  id: Int
  name: String
  email: String
}

user = User(1, "Alice", "alice@example.com")
print(user.name)
```

**Algebraic types** (variants):

```lux
type Color {
  Red,
  Green,
  Blue,
  Custom(r: Int, g: Int, b: Int)
}

c = Custom(255, 128, 0)
```

**Mixed** (variants with fields):

```lux
type Result {
  Ok(value: String),
  Err(message: String)
}
```

### Generics

```lux
type Option<T> {
  Some(value: T),
  None
}

type Pair<A, B> {
  first: A
  second: B
}
```

### Type Annotations

```lux
x: Int = 42
name: String = "Alice"
items: [Int] = [1, 2, 3]

fn add(a: Int, b: Int) -> Int {
  a + b
}

fn transform(items: [String], f: (String) -> Int) -> [Int] {
  map(items, f)
}
```

### Built-in Types

| Type | Description |
|------|-------------|
| `Int` | Integer |
| `Float` | Floating-point number |
| `String` | Text string |
| `Bool` | Boolean (`true`/`false`) |
| `[T]` | Array of type T |
| `(A, B) -> R` | Function type |

### Constructing JS Built-ins

Use `.new()` to call JavaScript constructors:

```lux
response = Response.new(body, { status: 200 })
date = Date.new()
```

`Type.new(args)` transpiles to `new Type(args)` in JavaScript.

## Collections

### Arrays

```lux
numbers = [1, 2, 3, 4, 5]
empty = []
mixed = [1, "two", true, nil]
nested = [[1, 2], [3, 4]]
```

### Objects

```lux
person = { name: "Alice", age: 30 }

// Shorthand (variable name becomes key)
name = "Alice"
age = 30
person = { name, age }        // { name: "Alice", age: 30 }
```

### Spread

```lux
combined = [...arr1, ...arr2]
extended = { ...base, extra: true }
```

### List Comprehensions

```lux
squares = [x ** 2 for x in range(10)]
evens = [x for x in numbers if x % 2 == 0]
names = [u.name.upper() for u in users if u.active]
```

### Dict Comprehensions

```lux
squares = {x: x ** 2 for x in range(5)}
```

### Slice Syntax

```lux
arr = [0, 1, 2, 3, 4, 5]
arr[1:4]         // [1, 2, 3]
arr[::2]         // [0, 2, 4]       (every other element)
arr[1:5:2]       // [1, 3]          (start:end:step)
arr[::-1]        // [5, 4, 3, 2, 1, 0]  (reversed)
```

## Modules

### Named Imports

```lux
import { Router, Link } from "lux/router"
import { createSignal } from "lux/reactivity"
```

### Default Imports

```lux
import dayjs from "dayjs"
```

### Aliased Imports

```lux
import { Component as Comp } from "framework"
```

### Exports

```lux
export fn helper() { ... }
export type Config { ... }
```

## String Features

### Interpolation

```lux
name = "World"
"Hello, {name}!"                    // Hello, World!
"Sum: {1 + 2}"                      // Sum: 3
"Length: {len(items)}"               // Length: 5
```

### String Multiplication

```lux
line = "-" * 40                     // 40 dashes
indent = "  " * depth               // indentation
```

### String Methods

| Method | Description |
|--------|-------------|
| `.upper()` | Convert to uppercase |
| `.lower()` | Convert to lowercase |
| `.contains(sub)` | Check if contains substring |
| `.starts_with(prefix)` | Check if starts with prefix |
| `.ends_with(suffix)` | Check if ends with suffix |
| `.chars()` | Split into array of characters |
| `.words()` | Split into array of words |
| `.lines()` | Split into array of lines |
| `.capitalize()` | Capitalize first letter |
| `.title_case()` | Title Case Each Word |
| `.snake_case()` | convert_to_snake_case |
| `.camel_case()` | convertToCamelCase |

## Comparison with Other Languages

### Variable Declaration

| Lux | Python | JavaScript | Rust |
|-----|--------|------------|------|
| `x = 5` | `x = 5` | `const x = 5` | `let x = 5;` |
| `var x = 5` | `x = 5` (all mutable) | `let x = 5` | `let mut x = 5;` |

### Functions

| Lux | Python | JavaScript |
|-----|--------|------------|
| `fn add(a, b) { a + b }` | `def add(a, b): return a + b` | `function add(a, b) { return a + b }` |
| `fn(x) x * 2` | `lambda x: x * 2` | `(x) => x * 2` |

### Pattern Matching

| Lux | Python | Rust |
|-----|--------|------|
| `match x { 1 => "one" }` | `match x: case 1: "one"` | `match x { 1 => "one" }` |
| `1..10 => "range"` | `case n if 1 <= n < 10:` | `1..10 => "range"` |
| `Circle(r) => ...` | `case Circle(r):` | `Circle(r) => ...` |

### Loops

| Lux | Python | JavaScript |
|-----|--------|------------|
| `for x in items { }` | `for x in items:` | `for (const x of items) { }` |
| `for i, x in items { }` | `for i, x in enumerate(items):` | `items.forEach((x, i) => { })` |
| `[x*2 for x in arr]` | `[x*2 for x in arr]` | `arr.map(x => x*2)` |
