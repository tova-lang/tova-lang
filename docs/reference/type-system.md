# Type System

Lux features a gradual type system with type annotations that are checked at compile time and erased at runtime. Types can be inferred in most situations, but explicit annotations serve as documentation and enable stronger checking.

## Built-in Types

Lux provides the following primitive types:

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

```lux
scores: [Int] = [90, 85, 92, 78]
names: [String] = ["Alice", "Bob", "Charlie"]
matrix: [[Int]] = [[1, 2], [3, 4]]
```

### Objects / Maps

Object types are written as inline record types or using named types:

```lux
point = {x: 10, y: 20}

type Config {
  host: String
  port: Int
}
```

## Function Types

Function types describe the signature of a callable:

```lux
// A function from (Int, Int) to Int
(Int, Int) -> Int

// A function from String to Bool
(String) -> Bool

// A function with no parameters returning String
() -> String
```

Function types are used in type annotations for higher-order functions:

```lux
fn apply(f: (Int) -> Int, x: Int) -> Int {
  f(x)
}
```

## Type Annotations

### On Variables

```lux
name: String = "Alice"
count: Int = 42
ratio: Float = 0.75
active: Bool = true
```

### On Function Parameters

```lux
fn greet(name: String) {
  print("Hello, {name}!")
}

fn add(a: Int, b: Int) {
  a + b
}
```

### On Return Types

Use the `->` arrow to annotate a function's return type:

```lux
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

```lux
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

```lux
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

```lux
p = Point(1.0, 2.0)
u = User("Alice", "alice@example.com", 30)
```

Fields are accessed with dot notation:

```lux
print(p.x)       // 1.0
print(u.name)    // "Alice"
```

### Algebraic Data Types (Sum Types)

A type with multiple variants, each of which can carry different data:

```lux
type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
  Triangle(a: Float, b: Float, c: Float)
}
```

Variants are constructed by name:

```lux
s1 = Circle(5.0)
s2 = Rectangle(3.0, 4.0)
```

Sum types are used with pattern matching:

```lux
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

```lux
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

```lux
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

```lux
maybe_name: Option<String> = Some("Alice")
result: Result<Int, String> = Ok(42)
pair = Pair(1, "hello")
```

### Generic Functions

Functions can accept generic type parameters:

```lux
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

Lux infers types in most contexts, so explicit annotations are optional. The compiler determines types from:

- **Literal values**: `42` is `Int`, `"hello"` is `String`
- **Operators**: `a + b` where `a: Int` infers `b: Int`
- **Function return values**: inferred from the body's last expression
- **Variable assignments**: inferred from the right-hand side

```lux
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

```lux
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
`Type.new()` is the standard way to create instances of JavaScript built-in types in Lux. For Lux-defined types, use the type name directly as a constructor: `Point(1.0, 2.0)`.
:::

## Derive

The `derive` keyword automatically generates implementations of common traits for a type. It follows the type declaration:

```lux
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

```lux
type User {
  name: String
  email: String
  age: Int
} derive [Eq, Show, JSON]
```

The generated methods can be used directly:

```lux
p1 = Point(1.0, 2.0)
p2 = Point(1.0, 2.0)

p1 == p2              // true (Eq)
print(p1)             // "Point(1.0, 2.0)" (Show)
json_str = to_json(p1)  // JSON serialization
```

## Interfaces

Interfaces define a structural contract that types can implement:

```lux
interface Printable {
  fn to_string(self) -> String
}

interface Comparable {
  fn compare(self, other) -> Int
}
```

Types satisfy an interface by implementing the required methods via `impl`:

```lux
impl Printable for Point {
  fn to_string(self) -> String {
    "({self.x}, {self.y})"
  }
}
```

## Common Type Patterns

### Option for Nullable Values

```lux
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

```lux
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

```lux
match fetch_user(id) {
  Ok(user) => render(user)
  Error("not found") => show_404()
  Error(msg) => show_error(msg)
}
```
