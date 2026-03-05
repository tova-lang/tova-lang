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
scores = [90, 85, 92, 78]
names = ["Alice", "Bob", "Charlie"]
matrix = [[1, 2], [3, 4]]
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

## Tuple Types

Tuple types represent a fixed-size, ordered collection of values with potentially different types:

```tova
(Int, String)               // pair of Int and String
(Int, String, Bool)         // triple
(Float, Float)              // pair of floats
```

Tuple values are created with parenthesized expressions:

```tova
point = (10, 20)
record = ("Alice", 30, true)
```

Elements are accessed by position using dot notation with numeric indices:

```tova
point.0    // 10
point.1    // 20
```

Tuples are destructured with `let`:

```tova
let (x, y) = point
let (name, age, active) = record
```

::: tip
Tuple types and function types share similar syntax. `(Int, String) -> Bool` is a **function type**, while `(Int, String)` alone is a **tuple type**. The presence of `->` determines which is parsed.
:::

## Type Annotations

Type annotations are supported on function parameters and return types. Variable types are inferred automatically.

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
    Err("division by zero")
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

Struct instances are created by calling the type as a function with positional arguments:

```tova
p = Point(1.0, 2.0)
u = User("Alice", "alice@example.com", 30)
```

#### Named Construction

Fields can be passed by name in any order. The compiler reorders them to match the type declaration:

```tova
u = User(age: 30, name: "Alice", email: "alice@example.com")
// compiles to: User("Alice", "alice@example.com", 30)
```

Positional and named arguments can be mixed. Positional arguments fill fields left-to-right, named arguments fill remaining slots:

```tova
u = User("Alice", age: 30, email: "alice@example.com")
```

The compiler validates named arguments at compile time:
- Unknown field names produce an error
- Duplicate named arguments produce an error
- Named arguments that overlap with positional slots produce an error
- Type mismatches on named arguments are checked against field types

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

Named arguments work with variant constructors as well:

```tova
s2 = Rectangle(height: 4.0, width: 3.0)
s3 = Triangle(c: 5.0, a: 3.0, b: 4.0)
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

Types can be parameterized with type variables using angle bracket syntax. Functions support both implicit generics through type inference and explicit type parameter declarations.

### Generic Types

```tova
type Option<T> {
  Some(T)
  None
}

type Result<T, E> {
  Ok(T)
  Err(E)
}

type Pair<A, B> {
  first: A
  second: B
}
```

Usage:

```tova
maybe_name = Some("Alice")
result = Ok(42)
pair = Pair(1, "hello")
```

### Generic Functions

Functions can be generic implicitly (through type inference) or explicitly (with type parameter declarations):

```tova
// Implicit — types inferred from arguments
fn identity(x) {
  x
}

// Explicit — type parameters declared with angle brackets
fn identity<T>(x: T) -> T {
  x
}

fn pair<A, B>(a: A, b: B) -> (A, B) {
  (a, b)
}

fn wrap<T>(value: T) -> Result<T, String> {
  Ok(value)
}
```

Type parameters are resolved from call-site arguments. `identity(42)` infers `T = Int`.

### Generic Type Aliases

Type aliases can have their own type parameters:

```tova
type Pair<A, B> = (A, B)
type MyResult<T> = Result<T, String>
type Callback<T> = (T) -> Nil
```

### Generic Type Instantiation

Use angle brackets to specify type arguments in annotations:

```tova
fn parse(s: String) -> Result<Int, String> { ... }
fn find(id: Int) -> Option<User> { ... }
items: [Option<Int>] = [Some(1), None, Some(3)]
```

Nested generics are fully supported. Bare generics (without type arguments) are compatible with parameterized versions through gradual typing — see [Type Compatibility](#type-compatibility) below.

## Type Inference

Tova infers types in most contexts, so explicit annotations are optional. The compiler determines types from:

- **Literal values**: `42` is `Int`, `"hello"` is `String`
- **Operators**: `a + b` where `a: Int` infers `b: Int`
- **Function return values**: inferred from the body's last expression
- **Variable assignments**: inferred from the right-hand side

```tova
// All types inferred -- no annotations needed
name = "Alice"           // String
total = 42               // Int
ratio = total / 100.0    // Float
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

| Trait | Generated Method | Behavior |
|-------|-----------------|----------|
| `Eq` | `Type.__eq(a, b)` | Structural equality (deep field comparison) |
| `Show` | `Type.__show(obj)` | Human-readable string representation |
| `JSON` | `Type.toJSON(obj)` / `Type.fromJSON(str)` | Serialization to/from JSON |

Multiple derives are specified in a single bracket list:

```tova
type User {
  name: String
  email: String
  age: Int
} derive [Eq, Show, JSON]
```

The generated methods are called as static methods on the type:

```tova
p1 = Point(1.0, 2.0)
p2 = Point(1.0, 2.0)

Point.__eq(p1, p2)       // true (structural equality)
Point.__show(p1)          // "Point(x: 1.0, y: 2.0)"
json_str = Point.toJSON(p1)  // JSON serialization
```

## Impl Blocks

`impl` blocks add behavior to types. Methods with `self` are **instance methods** (called on instances). Methods without `self` are **associated functions** (called on the type).

```tova
type Circle {
  radius: Float
}

impl Circle {
  // Associated function — Circle.unit()
  fn unit() -> Circle {
    Circle(1.0)
  }

  // Instance method — c.area()
  fn area(self) -> Float {
    3.14159 * self.radius * self.radius
  }
}

c = Circle.unit()
print(c.area())    // 3.14159
```

Instance methods compile to prototype methods. Associated functions compile to properties on the constructor.

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
var total = 10
total = 3.14  // warning: Potential data loss: assigning Float to Int variable
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

## Type Compatibility

Tova uses a gradual type system with specific compatibility rules. Understanding these rules helps you write correct, type-safe code.

### Int-to-Float Widening

`Int` is always assignable to `Float` because integer-to-floating-point conversion is safe (no data loss):

```tova
fn needs_float(x: Float) -> Float { x * 2.0 }

needs_float(42)     // OK — Int widens to Float automatically
```

### Float-to-Int Narrowing

`Float` is **not** implicitly assignable to `Int` because floating-point-to-integer conversion loses data. The compiler warns and suggests an explicit conversion:

```tova
fn needs_int(x: Int) -> Int { x * 2 }

needs_int(3.14)     // Warning: type mismatch Float → Int
                    // Hint: try floor(value) or round(value) to convert
```

In strict mode, this becomes a hard error rather than a warning.

### Nil and Option Compatibility

`nil` is assignable to any `Option<T>` type. This allows natural assignment of nil where an optional value is expected:

```tova
fn find_user(id: Int) -> Option<User> {
  if id == 0 {
    nil    // OK — nil is compatible with Option<User>
  } else {
    Some(User(id, "Alice", "alice@example.com"))
  }
}
```

### Gradual Typing (Bare Generics)

A generic type used without type arguments (e.g., bare `Result`) is compatible with any parameterized version of that type:

```tova
fn get_result() -> Result {
  Ok(42)
}

fn process(r: Result<Int, String>) -> Int {
  r.unwrapOr(0)
}

process(get_result())   // OK — bare Result compatible with Result<Int, String>
```

This allows gradual adoption of type annotations. You can start with unparameterized generic types and add type arguments as your codebase matures.

### Union Type Compatibility

A value is assignable to a union type if it matches any member of the union:

```tova
fn display(value: String | Int) {
  // ...
}

display("hello")   // OK — String is a member of String | Int
display(42)        // OK — Int is a member of String | Int
```

### Assignability Summary

| Source | Target | Compatible? | Notes |
|--------|--------|-------------|-------|
| `Int` | `Float` | Yes | Safe widening |
| `Float` | `Int` | No | Needs explicit `floor()` or `round()` |
| `nil` | `Option<T>` | Yes | Nil represents absence |
| `Result` | `Result<T, E>` | Yes | Gradual typing |
| `Result<T, E>` | `Result` | Yes | Gradual typing |
| `T` | `T \| U` | Yes | Member of union |
| Any type | `Any` | Yes | Universal target |

## Type Narrowing

Type narrowing refines a variable's type within a code block based on runtime checks. The compiler tracks these refinements through control flow, giving you precise types inside conditional branches.

### Nil Checks

After checking that a value is not nil, the compiler narrows its type:

```tova
fn process(name: String | Nil) {
  if name != nil {
    // name is narrowed to String here
    print(name.upper())
  } else {
    // name is Nil here
    print("no name")
  }
}
```

### Result Narrowing with `.isOk()` / `.isErr()`

```tova
fn handle(result: Result<Int, String>) {
  if result.isOk() {
    // result is narrowed to Ok variant
    print("Success: {result.unwrap()}")
  } else {
    // result is narrowed to Err variant
    print("Error: {result.unwrapErr()}")
  }
}
```

### Option Narrowing with `.isSome()` / `.isNone()`

```tova
fn display(maybe_user: Option<User>) {
  if maybe_user.isSome() {
    // maybe_user is narrowed to Some variant
    user = maybe_user.unwrap()
    print(user.name)
  }
}
```

### `typeOf()` Narrowing

The compiler recognizes `typeOf()` checks and narrows accordingly:

```tova
fn serialize(value) {
  if type_of(value) == "String" {
    // value is narrowed to String
    "\"" ++ value ++ "\""
  } elif type_of(value) == "Number" {
    // value is narrowed to a numeric type
    str(value)
  } else {
    "unknown"
  }
}
```

### `is` Operator Narrowing

The `is` keyword narrows types in conditional branches:

```tova
fn process(value) {
  if value is String {
    // value is narrowed to String
    print(value.upper())
  } elif value is Int {
    // value is narrowed to Int
    print(value * 2)
  }
}
```

### Guard Statement Narrowing

`guard` statements narrow the type for the **rest of the enclosing scope** (not just a branch):

```tova
fn process(name: String | Nil) {
  guard name != nil else { return }
  // name is narrowed to String for ALL subsequent code
  print(name.upper())
  print(name.lower())
}
```

This is particularly useful for early returns that eliminate nil or error cases.

### Union Type Narrowing

After an `is` check, the type of a union variable is narrowed in each branch:

```tova
fn format(value: String | Int | Float) {
  if value is String {
    "text: {value}"
  } elif value is Int {
    "integer: {value}"
  } elif value is Float {
    "decimal: {value}"
  }
}
```

### Narrowing Patterns Summary

| Pattern | Narrows to |
|---------|-----------|
| `x != nil` | Non-nil type (strips `Nil` from union) |
| `x == nil` | `Nil` in consequent; non-nil in alternate |
| `x.isOk()` | Ok variant in consequent; Err in alternate |
| `x.isErr()` | Err variant in consequent; Ok in alternate |
| `x.isSome()` | Some variant in consequent; None in alternate |
| `x.isNone()` | None in consequent; Some in alternate |
| `x is Type` | The checked type |
| `type_of(x) == "String"` | The corresponding Tova type |
| `guard x != nil else { ... }` | Non-nil for rest of scope |

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
    Err("invalid integer: {s}")
  }
}
```

### Pattern Matching on Types

```tova
match fetch_user(id) {
  Ok(user) => render(user)
  Err("not found") => show_404()
  Err(msg) => show_error(msg)
}
```
