# Types

Tova has a rich type system that supports struct-like types, algebraic data types (ADTs), generics, and derive macros. Types help you model your domain precisely and let the compiler catch errors early.

## Built-in Types

Tova has the following built-in primitive and compound types:

| Type | Description | Examples |
|------|-------------|----------|
| `Int` | Integer numbers | `42`, `-7`, `1_000` |
| `Float` | Floating-point numbers | `3.14`, `-0.5`, `1.5e10` |
| `String` | Text | `"hello"`, `'raw'` |
| `Bool` | Boolean | `true`, `false` |
| `[T]` | Array of T | `[1, 2, 3]`, `["a", "b"]` |
| `(A, B) -> R` | Function type | `(Int, Int) -> Int` |
| `Table<T>` | Tabular data (array of typed rows) | `Table([{name: "Alice"}])` |
| `nil` | Absence of value | `nil` |

## Struct-like Types

Define a type with named fields to create a struct:

```tova
type User {
  id: Int
  name: String
  email: String
}
```

### Constructing Instances

Create instances by passing field values positionally:

```tova
alice = User(1, "Alice", "alice@example.com")
bob = User(2, "Bob", "bob@example.com")
```

### Named Construction

When a type has many fields, positional arguments can be hard to read. Use **named arguments** to make the intent clear and pass fields in any order:

```tova
alice = User(name: "Alice", id: 1, email: "alice@example.com")
bob = User(id: 2, name: "Bob", email: "bob@example.com")
```

Named arguments are reordered to match the type's field order at compile time, so `User(name: "Alice", id: 1, email: "alice@example.com")` compiles to the same code as `User(1, "Alice", "alice@example.com")`.

You can also mix positional and named arguments. Positional arguments fill fields left-to-right, then named arguments fill the rest:

```tova
// id is positional, the rest are named in any order
charlie = User(3, email: "charlie@example.com", name: "Charlie")
```

::: tip
Named construction is especially useful for types with many fields of the same type, where positional arguments would be ambiguous. The compiler validates field names and catches typos at compile time.
:::

### Accessing Fields

Use dot notation to access fields:

```tova
print(alice.name)    // "Alice"
print(alice.email)   // "alice@example.com"
```

### Using with Functions

```tova
fn display_user(user: User) -> String {
  "{user.name} ({user.email})"
}

print(display_user(alice))   // "Alice (alice@example.com)"
```

## Algebraic Data Types (ADTs)

ADTs let you define types with multiple variants. Each variant can optionally carry data:

### Simple Enums

Variants with no data act like enums:

```tova
type Color {
  Red
  Green
  Blue
}

favorite = Color.Red
```

### Variants with Data

Variants can carry fields:

```tova
type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
  Triangle(base: Float, height: Float)
}

circle = Circle(5.0)
rect = Rectangle(10.0, 20.0)
tri = Triangle(3.0, 4.0)
```

Named arguments work with variants too:

```tova
rect = Rectangle(height: 20.0, width: 10.0)
tri = Triangle(height: 4.0, base: 3.0)
```

### Mixed Variants

Some variants can have data while others do not:

```tova
type Color {
  Red
  Green
  Blue
  Custom(r: Int, g: Int, b: Int)
}

red = Color.Red
purple = Custom(128, 0, 128)
```

### Pattern Matching with ADTs

ADTs pair naturally with `match` expressions:

```tova
fn area(shape: Shape) -> Float {
  match shape {
    Circle(r) => 3.14159 * r * r
    Rectangle(w, h) => w * h
    Triangle(b, h) => 0.5 * b * h
  }
}

fn color_name(c: Color) -> String {
  match c {
    Red => "red"
    Green => "green"
    Blue => "blue"
    Custom(r, g, b) => "rgb({r},{g},{b})"
  }
}
```

## Result and Option

Tova has two built-in ADTs that are central to error handling:

```tova
// Built-in — you don't need to define these
type Result<T, E> {
  Ok(value: T)
  Err(error: E)
}

type Option<T> {
  Some(value: T)
  None
}
```

Use them with pattern matching:

```tova
fn find_user(id: Int) -> Option<User> {
  if id == 1 {
    Some(User(1, "Alice", "alice@example.com"))
  } else {
    None
  }
}

match find_user(1) {
  Some(user) => print("Found: {user.name}")
  None => print("User not found")
}
```

See the [Error Handling guide](error-handling.md) for full details on Result and Option.

## Derive

Use `derive` to automatically generate common trait implementations for your types:

```tova
type User {
  id: Int
  name: String
  email: String
} derive [Eq, Show, JSON]
```

Available derive macros:

| Derive | What It Generates |
|--------|-------------------|
| `Eq` | Equality comparison (`==`, `!=`) |
| `Show` | String representation for display |
| `JSON` | JSON serialization and deserialization |

```tova
type Point {
  x: Float
  y: Float
} derive [Eq, Show]

a = Point(1.0, 2.0)
b = Point(1.0, 2.0)
print(a == b)        // true
print(a)             // Point(1.0, 2.0)
```

```tova
type Config {
  host: String
  port: Int
  debug: Bool
} derive [JSON]

config = Config("localhost", 8080, true)
json_str = config.to_json()    // {"host":"localhost","port":8080,"debug":true}
```

## Type Aliases

Create shorter names for complex types:

```tova
type UserList = [User]
type Handler = (Request) -> Response
type Pair = (String, Int)
```

## Union Types

Define a type that can be one of several other types:

```tova
type StringOrInt = String | Int
type Primitive = String | Int | Float | Bool
```

Union types are checked at compile time and work with type narrowing:

```tova
fn display(value: String | Int) {
  if value is String {
    print("String: {value}")
  } elif value is Int {
    print("Number: {value}")
  }
}
```

## Refinement Types

Refine an existing type with validation predicates using `where`:

```tova
type Email = String where {
  it |> contains("@")
  it |> contains(".")
}

type PositiveInt = Int where {
  it > 0
}

type Percentage = Float where {
  it >= 0.0
  it <= 100.0
}
```

Each line in the `where` block is a predicate that must return `true`. The `it` keyword refers to the value being validated. Refinement types compile to runtime validator functions.

## Tuples

Tova supports tuple types for grouping a fixed number of values:

```tova
point = (10, 20)
name_age = ("Alice", 30)
```

Access elements by position:

```tova
x = point.0    // 10
y = point.1    // 20
```

Destructure tuples with `let`:

```tova
let (x, y) = point
print(x)    // 10
print(y)    // 20

let (name, age) = ("Alice", 30)
```

## Runtime Type Checking

The `is` operator tests whether a value is of a given type at runtime. Use `is not` for the negated form:

```tova
value = "hello"
value is String       // true
value is Int          // false
value is not Nil      // true
```

### With ADT Variants

`is` works with custom type variants:

```tova
result = Ok(42)
result is Ok          // true
result is Err         // false

option = Some("data")
option is Some        // true
option is None        // false
```

### Supported Type Checks

| Type | Checks for |
|------|-----------|
| `String` | String values |
| `Int` | Integer numbers |
| `Float` | Floating-point numbers |
| `Number` | Any numeric value (Int or Float) |
| `Bool` | Boolean values |
| `Nil` | The `nil` value |
| `Array` | Array values |
| `Function` | Function values |
| *VariantName* | Any custom ADT variant (e.g., `Ok`, `Some`, `Circle`) |

### Type Narrowing

The compiler narrows the type of a variable after an `is` check:

```tova
fn process(value) {
  if value is String {
    // value is known to be a String here
    print(value.upper())
  } elif value is Int {
    // value is known to be an Int here
    print(value * 2)
  }
}
```

## Type.new() for JavaScript Constructors

When you need to call JavaScript constructors (like `new Date()` or `new Map()`), use the `.new()` syntax:

```tova
date = Date.new()
map = Map.new()
set = Set.new([1, 2, 3])
regex = RegExp.new("\\d+", "g")
```

This compiles to `new Date()`, `new Map()`, etc. in JavaScript.

## Practical Tips

**Model your domain with types.** Instead of passing raw strings and numbers around, define types that make your code self-documenting:

```tova
// Instead of:
fn create_order(customer_name: String, amount: Float, currency: String) { ... }

// Prefer:
type Money {
  amount: Float
  currency: String
}

type Customer {
  name: String
  email: String
}

fn create_order(customer: Customer, total: Money) { ... }

order = create_order(
  customer: Customer(name: "Alice", email: "alice@example.com"),
  total: Money(amount: 29.99, currency: "USD")
)
```

**Use ADTs for state machines.** When something can be in one of several states, an ADT makes each state explicit:

```tova
type LoadingState {
  Idle
  Loading
  Success(data: String)
  Error(message: String)
}

fn render(state: LoadingState) {
  match state {
    Idle => "<p>Ready</p>"
    Loading => "<p>Loading...</p>"
    Success(data) => "<p>{data}</p>"
    Error(msg) => "<p class='error'>{msg}</p>"
  }
}
```

**Always derive what you need.** Adding `derive [Eq, Show, JSON]` takes a moment and saves you from writing boilerplate comparison, display, and serialization code.
