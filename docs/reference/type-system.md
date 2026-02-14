# Type System

Tova features a gradual type system with type annotations that are checked at compile time and erased at runtime. Types can be inferred in most situations, but explicit annotations serve as documentation and enable stronger checking.

## Built-in Types

Tova provides the following primitive types:

| Type | Description | Examples |
|------|-------------|---------|
| `Int` | Integer numbers | `0`, `42`, `-7`, `0xFF` |
| `Float` | Floating-point numbers | `3.14`, `1.5e10`, `-0.5` |
| `String` | Text strings | `"hello"`, `'world'` |
| `Bool` | Boolean values | `true`, `false` |
| `Nil` | Absence of value | `nil` |

## Collection Types

### Arrays

Array types use bracket syntax:

```tova
scores: [Int] = [90, 85, 92, 78]
names: [String] = ["Alice", "Bob", "Charlie"]
matrix: [[Int]] = [[1, 2], [3, 4]]
```

### Objects / Maps

Object types are written as inline record types or using named types:

```tova
point = {x: 10, y: 20}

type Config {
  host: String
  port: Int
}
```

## Function Types

Function types describe the signature of a callable:

```tova
// A function from (Int, Int) to Int
(Int, Int) -> Int

// A function from String to Bool
(String) -> Bool

// A function with no parameters returning String
() -> String
```

Function types are used in type annotations for higher-order functions:

```tova
fn apply(f: (Int) -> Int, x: Int) -> Int {
  f(x)
}
```

## Type Annotations

### On Variables

```tova
name: String = "Alice"
count: Int = 42
ratio: Float = 0.75
active: Bool = true
```

### On Function Parameters

```tova
fn greet(name: String) {
  print("Hello, {name}!")
}

fn add(a: Int, b: Int) {
  a + b
}
```

### On Return Types

Use the `->` arrow to annotate a function's return type:

```tova
fn square(x: Int) -> Int {
  x * x
}

fn is_positive(n: Int) -> Bool {
  n > 0
}

fn format_name(first: String, last: String) -> String {
  "{first} {last}"
}
```

### Full Signature

```tova
fn divide(a: Float, b: Float) -> Result<Float, String> {
  if b == 0.0 {
    Error("division by zero")
  } else {
    Ok(a / b)
  }
}
```

## Type Declarations

### Struct Types (Product Types)

A type with named fields:

```tova
type Point {
  x: Float
  y: Float
}

type User {
  name: String
  email: String
  age: Int
}
```

Struct instances are created by calling the type as a function:

```tova
p = Point(1.0, 2.0)
u = User("Alice", "alice@example.com", 30)
```

Fields are accessed with dot notation:

```tova
print(p.x)       // 1.0
print(u.name)    // "Alice"
```

### Algebraic Data Types (Sum Types)

A type with multiple variants, each of which can carry different data:

```tova
type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
  Triangle(a: Float, b: Float, c: Float)
}
```

Variants are constructed by name:

```tova
s1 = Circle(5.0)
s2 = Rectangle(3.0, 4.0)
```

Sum types are used with pattern matching:

```tova
fn area(shape: Shape) -> Float {
  match shape {
    Circle(r) => 3.14159 * r ** 2
    Rectangle(w, h) => w * h
    Triangle(a, b, c) => {
      s = (a + b + c) / 2.0
      sqrt(s * (s - a) * (s - b) * (s - c))
    }
  }
}
```

### Mixed Types

A type can have both variants and fields. Variants without payloads serve as enumerations:

```tova
type Color {
  Red
  Green
  Blue
  Custom(r: Int, g: Int, b: Int)
}
```

## Generics

Types and functions can be parameterized with type variables using angle bracket syntax:

### Generic Types

```tova
type Option<T> {
  Some(T)
  None
}

type Result<T, E> {
  Ok(T)
  Error(E)
}

type Pair<A, B> {
  first: A
  second: B
}
```

Usage:

```tova
maybe_name: Option<String> = Some("Alice")
result: Result<Int, String> = Ok(42)
pair = Pair(1, "hello")
```

### Generic Functions

Functions can accept generic type parameters:

```tova
fn identity<T>(x: T) -> T {
  x
}

fn first<T>(items: [T]) -> Option<T> {
  if items.length > 0 {
    Some(items[0])
  } else {
    None
  }
}
```

## Type Inference

Tova infers types in most contexts, so explicit annotations are optional. The compiler determines types from:

- **Literal values**: `42` is `Int`, `"hello"` is `String`
- **Operators**: `a + b` where `a: Int` infers `b: Int`
- **Function return values**: inferred from the body's last expression
- **Variable assignments**: inferred from the right-hand side

```tova
// All types inferred -- no annotations needed
name = "Alice"           // String
count = 42               // Int
ratio = count / 100.0    // Float
items = [1, 2, 3]        // [Int]
doubled = items |> map(fn(x) x * 2)  // [Int]
```

Annotations are recommended for:
- Public API boundaries (exported functions)
- Complex or ambiguous cases
- Documentation purposes

## `Type.new()` Constructor

For JavaScript built-in types, use `Type.new()` to invoke the constructor:

```tova
regex = RegExp.new("\\d+", "g")
date = Date.new()
buf = ArrayBuffer.new(1024)
map = Map.new()
set = Set.new()
```

This transpiles to JavaScript's `new` operator:

```js
const regex = new RegExp("\\d+", "g");
const date = new Date();
```

::: tip
`Type.new()` is the standard way to create instances of JavaScript built-in types in Tova. For Tova-defined types, use the type name directly as a constructor: `Point(1.0, 2.0)`.
:::

## Derive

The `derive` keyword automatically generates implementations of common traits for a type. It follows the type declaration:

```tova
type Point {
  x: Float
  y: Float
} derive [Eq, Show, JSON]
```

### Available Derivations

| Trait | Generated Behavior |
|-------|-------------------|
| `Eq` | Structural equality (`==` and `!=`) |
| `Show` | Human-readable string representation |
| `JSON` | Serialization to/from JSON (`to_json`, `from_json`) |

Multiple derives are specified in a single bracket list:

```tova
type User {
  name: String
  email: String
  age: Int
} derive [Eq, Show, JSON]
```

The generated methods can be used directly:

```tova
p1 = Point(1.0, 2.0)
p2 = Point(1.0, 2.0)

p1 == p2              // true (Eq)
print(p1)             // "Point(1.0, 2.0)" (Show)
json_str = to_json(p1)  // JSON serialization
```

## Interfaces

Interfaces define a structural contract that types can implement:

```tova
interface Printable {
  fn to_string(self) -> String
}

interface Comparable {
  fn compare(self, other) -> Int
}
```

Types satisfy an interface by implementing the required methods via `impl`:

```tova
impl Printable for Point {
  fn to_string(self) -> String {
    "({self.x}, {self.y})"
  }
}
```

## Strict Mode

By default, Tova uses gradual typing — type mismatches produce warnings but don't prevent compilation. Strict mode upgrades these warnings to hard errors, catching more bugs at compile time.

### Enabling Strict Mode

```bash
tova run app.tova --strict
tova build src --strict
```

### What Strict Mode Enforces

In strict mode, the following produce **errors** instead of warnings:

| Check | Example | Default | Strict |
|-------|---------|---------|--------|
| Binary operator type mismatch | `"hello" - 5` | warning | error |
| Variable reassignment type mismatch | `var x = 10; x = "hello"` | warning | error |
| Compound assignment type mismatch | `var s = "hi"; s -= 1` | warning | error |
| Function argument count mismatch | `add(1, 2, 3)` when `fn add(a, b)` | warning | error |

Strict mode also warns about potential data loss from **float narrowing**:

```tova
var count: Int = 10
count = 3.14  // warning: Potential data loss: assigning Float to Int variable
```

### Trait Conformance

When implementing a trait or interface via `impl`, the compiler checks that all required methods are provided:

```tova
interface Printable {
  fn to_string(self) -> String
}

impl Printable for Point {
  // Missing to_string → warning: Impl for 'Point' missing required method 'to_string' from trait 'Printable'
}
```

The compiler also validates that parameter counts and return types match the trait definition.

### Match Exhaustiveness

The compiler checks `match` expressions against the known variants of a type:

```tova
type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
}

fn area(s: Shape) -> Float {
  match s {
    Circle(r) => 3.14 * r ** 2
    // warning: Non-exhaustive match: missing 'Rectangle' variant from type 'Shape'
  }
}
```

Add a wildcard `_` or binding pattern as a catch-all to suppress the warning:

```tova
match s {
  Circle(r) => 3.14 * r ** 2
  _ => 0.0
}
```

::: tip
The LSP server always runs with strict mode enabled, so you'll see all type issues as diagnostics in your editor regardless of how you compile.
:::

## Refinement Types

Refinement types add runtime constraints to existing types using a `where` clause. They let you express invariants like "a string that contains @" or "an integer between 0 and 150" directly in the type system.

### Syntax

```tova
type Email = String where {
  it |> contains("@")
  it |> contains(".")
}

type Age = Int where {
  0 <= it and it <= 150
}

type NonEmpty = String where {
  it |> len() > 0
}
```

The `it` keyword refers to the value being validated. Each line in the `where` block is a predicate that must return `true`.

### Multiple Predicates

A refinement type can have multiple predicates. All must hold for a value to be valid:

```tova
type StrongPassword = String where {
  it |> len() >= 8
  it |> contains_upper()
  it |> contains_digit()
}
```

### Using Refinement Types

Refinement types work anywhere a regular type does -- in function parameters, variable annotations, and struct fields:

```tova
type User {
  name: NonEmpty
  email: Email
  age: Age
}

fn send_email(to: Email, subject: String) {
  // 'to' is guaranteed to contain "@" and "."
}
```

### How They Compile

Each refinement type compiles to a validator function. When a value is annotated with a refinement type, the validator runs at the boundary:

```tova
// type Email = String where { it |> contains("@") }
// compiles roughly to:
// function __validate_Email(it) {
//   if (!(it.includes("@"))) return false;
//   return true;
// }
```

### Alongside Regular Types

Refinement types and regular type aliases can coexist in the same file:

```tova
type UserId = Int
type Email = String where { it |> contains("@") }

type User {
  id: UserId
  email: Email
}
```

## Common Type Patterns

### Option for Nullable Values

```tova
fn find(items: [String], target: String) -> Option<Int> {
  for i, item in enumerate(items) {
    if item == target {
      return Some(i)
    }
  }
  None
}
```

### Result for Error Handling

```tova
fn parse_int(s: String) -> Result<Int, String> {
  // ... parsing logic
  if valid {
    Ok(parsed_value)
  } else {
    Error("invalid integer: {s}")
  }
}
```

### Pattern Matching on Types

```tova
match fetch_user(id) {
  Ok(user) => render(user)
  Error("not found") => show_404()
  Error(msg) => show_error(msg)
}
```
