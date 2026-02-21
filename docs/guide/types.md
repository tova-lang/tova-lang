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

Create instances by passing field values in order:

```tova
alice = User(1, "Alice", "alice@example.com")
bob = User(2, "Bob", "bob@example.com")
```

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
