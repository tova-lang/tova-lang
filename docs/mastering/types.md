<script setup>
const adtCode = `// Algebraic Data Types: the backbone of Tova modeling
type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
  Triangle(a: Float, b: Float, c: Float)
}

fn area(shape) {
  match shape {
    Circle(r) => 3.14159 * r * r
    Rectangle(w, h) => w * h
    Triangle(a, b, c) => {
      // Heron's formula
      s = (a + b + c) / 2.0
      sqrt(s * (s - a) * (s - b) * (s - c))
    }
  }
}

fn perimeter(shape) {
  match shape {
    Circle(r) => 2.0 * 3.14159 * r
    Rectangle(w, h) => 2.0 * (w + h)
    Triangle(a, b, c) => a + b + c
  }
}

fn describe(shape) {
  match shape {
    Circle(r) => "Circle with radius {r}"
    Rectangle(w, h) => "{w}x{h} Rectangle"
    Triangle(a, b, c) => "Triangle ({a}, {b}, {c})"
  }
}

shapes = [Circle(5.0), Rectangle(4.0, 6.0), Triangle(3.0, 4.0, 5.0)]

for shape in shapes {
  print("{describe(shape)}: area={area(shape)}, perimeter={perimeter(shape)}")
}`

const stateCode = `// State machines with types
type OrderStatus {
  Pending
  Confirmed(confirmed_at: String)
  Shipped(tracking: String)
  Delivered(delivered_at: String)
  Cancelled(reason: String)
}

fn next_action(status) {
  match status {
    Pending => "Confirm or cancel this order"
    Confirmed(_) => "Ship this order"
    Shipped(tracking) => "Track at: {tracking}"
    Delivered(_) => "Leave a review"
    Cancelled(reason) => "Cancelled: {reason}"
  }
}

fn can_cancel(status) {
  match status {
    Pending => true
    Confirmed(_) => true
    _ => false
  }
}

// Walk through an order lifecycle
var order = Pending
print("1. {next_action(order)}, can cancel: {can_cancel(order)}")

order = Confirmed("2026-03-05")
print("2. {next_action(order)}, can cancel: {can_cancel(order)}")

order = Shipped("TRK-12345")
print("3. {next_action(order)}, can cancel: {can_cancel(order)}")

order = Delivered("2026-03-08")
print("4. {next_action(order)}")`

const domainCode = `// PROJECT: Shape Calculator with domain modeling
type Color {
  Red
  Green
  Blue
  Hex(code: String)
}

type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
  Triangle(base: Float, height: Float)
}

type StyledShape {
  Styled(shape: Shape, fill: Color, stroke: Color)
}

fn color_name(c) {
  match c {
    Red => "red"
    Green => "green"
    Blue => "blue"
    Hex(code) => code
  }
}

fn area(shape) {
  match shape {
    Circle(r) => 3.14159 * r * r
    Rectangle(w, h) => w * h
    Triangle(b, h) => 0.5 * b * h
  }
}

fn to_svg(styled) {
  match styled {
    Styled(Circle(r), fill, stroke) => {
      f = color_name(fill)
      s = color_name(stroke)
      "<circle r='{r}' fill='{f}' stroke='{s}' />"
    }
    Styled(Rectangle(w, h), fill, stroke) => {
      f = color_name(fill)
      s = color_name(stroke)
      "<rect width='{w}' height='{h}' fill='{f}' stroke='{s}' />"
    }
    Styled(Triangle(b, h), fill, stroke) => {
      f = color_name(fill)
      s = color_name(stroke)
      half_b = b / 2.0
      "<polygon points='0,{h} {half_b},0 {b},{h}' fill='{f}' stroke='{s}' />"
    }
  }
}

// Build a scene
scene = [
  Styled(Circle(50.0), Red, Hex("#333")),
  Styled(Rectangle(100.0, 60.0), Blue, Green),
  Styled(Triangle(80.0, 70.0), Hex("#ff9900"), Red)
]

print("<svg viewBox='0 0 300 200'>")
for item in scene {
  print("  {to_svg(item)}")
  match item {
    Styled(shape, _, _) => print("  <!-- area: {area(shape)} -->")
  }
}
print("</svg>")

total_area = scene
  |> map(fn(s) match s { Styled(shape, _, _) => area(shape) })
  |> sum()
print("")
print("Total area: {total_area}")`
</script>

# Chapter 6: Designing with Types

Types in Tova aren't just labels — they're design tools. A well-chosen type makes illegal states unrepresentable, guides your pattern matching, and serves as living documentation. This chapter teaches you to think in types.

By the end, you'll build a shape calculator with a complete domain model.

## Record Types

The simplest custom type is a record — a named collection of fields:

```tova
type User {
  name: String
  email: String
  age: Int
}
```

Create instances with the type name:

```tova
alice = User(name: "Alice", email: "alice@test.com", age: 30)
print(alice.name)    // "Alice"
print(alice.age)     // 30
```

Records are great for grouping related data with clear field names.

## Algebraic Data Types (ADTs)

ADTs are Tova's most powerful type feature. A type can have multiple **variants**, each with different shapes:

```tova
type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
  Triangle(base: Float, height: Float)
}
```

Each variant is its own constructor:

```tova
shapes = [
  Circle(5.0),
  Rectangle(4.0, 6.0),
  Triangle(3.0, 8.0)
]
```

ADTs pair perfectly with pattern matching:

```tova
fn area(shape) {
  match shape {
    Circle(r) => 3.14159 * r * r
    Rectangle(w, h) => w * h
    Triangle(b, h) => 0.5 * b * h
  }
}
```

The compiler ensures every variant is handled. Add a new variant and every `match` that doesn't handle it will generate a warning.

<TryInPlayground :code="adtCode" label="ADTs" />

## Unit Variants

Variants don't need fields. Fieldless variants are called **unit variants**:

```tova
type Direction { North, South, East, West }
type Color { Red, Green, Blue }
type Priority { Low, Medium, High, Critical }
```

Unit variants work like enums in other languages but are part of the full ADT system.

## The Built-in ADTs: Result and Option

Tova has two built-in ADTs that you'll use constantly:

### Option — A Value That Might Not Exist

```tova
// Option is either Some(value) or None
fn find_user(id) {
  if id == 1 { Some({ name: "Alice" }) }
  else { None }
}

match find_user(1) {
  Some(user) => print("Found: {user.name}")
  None => print("Not found")
}
```

**Use Option when:** a value may or may not be present. Instead of returning `null` or `-1`, return `Some(value)` or `None`.

### Result — An Operation That Might Fail

```tova
// Result is either Ok(value) or Err(error)
fn divide(a, b) {
  if b == 0 { Err("Division by zero") }
  else { Ok(a / b) }
}

match divide(10, 3) {
  Ok(value) => print("Result: {value}")
  Err(msg) => print("Error: {msg}")
}
```

**Use Result when:** an operation can fail. Instead of throwing exceptions, return `Ok(value)` or `Err(error)`.

::: tip Option vs. Result
- **Option**: "I might not have a value" — `None` says nothing about why
- **Result**: "I might have failed" — `Err(reason)` tells you why
- Use `Option` for lookups, searches, optional fields
- Use `Result` for parsing, validation, I/O, anything that can go wrong
:::

## Designing with "Make Illegal States Unrepresentable"

The most powerful type design principle: **if a state shouldn't exist, make it impossible to construct**.

### Bad: String-based Status

```tova
// Fragile — any string can sneak in
fn process_order(status: String) {
  if status == "pending" { /* ... */ }
  elif status == "shipped" { /* ... */ }
  // What about "Pending"? "SHIPPED"? "pendig"?
}
```

### Good: ADT Status

```tova
type OrderStatus {
  Pending
  Confirmed(confirmed_at: String)
  Shipped(tracking: String)
  Delivered(delivered_at: String)
  Cancelled(reason: String)
}

fn process_order(status) {
  match status {
    Pending => // ...
    Confirmed(date) => // ...
    Shipped(tracking) => // ...
    Delivered(date) => // ...
    Cancelled(reason) => // ...
  }
}
```

Now:
- You can't create an invalid status — it's always one of the five variants
- Each variant carries exactly the data it needs
- The compiler warns if you miss a case
- Adding a new status updates every match in the codebase

### State Machines as Types

ADTs naturally model state machines:

```tova
type Connection {
  Disconnected
  Connecting(url: String)
  Connected(url: String, session_id: String)
  Error(url: String, reason: String)
}

fn handle(state) {
  match state {
    Disconnected => Connecting("ws://server.com")
    Connecting(url) => {
      // Try to connect...
      Connected(url, "sess_123")
    }
    Connected(_, session) => {
      print("Active session: {session}")
      state
    }
    Error(url, reason) => {
      print("Error: {reason}, retrying...")
      Connecting(url)
    }
  }
}
```

Notice how each state transition only produces valid next states. A `Disconnected` connection can only become `Connecting` — not jump straight to `Connected`.

<TryInPlayground :code="stateCode" label="State Machines" />

## Nested Types

Types can contain other types, building complex models from simple pieces:

```tova
type Address {
  street: String
  city: String
  country: String
}

type ContactInfo {
  Email(address: String)
  Phone(number: String)
  Mail(address: Address)
}

type User {
  name: String
  contact: ContactInfo
}
```

Pattern matching handles nested types elegantly:

```tova
fn contact_summary(user) {
  match user.contact {
    Email(addr) => "Email: {addr}"
    Phone(num) => "Phone: {num}"
    Mail(addr) => "Mail: {addr.street}, {addr.city}"
  }
}
```

## Derive: Auto-generating Behavior

The `derive` keyword auto-generates common functionality:

```tova
type Point {
  x: Float
  y: Float
} derive [Eq, Show, JSON]
```

Available derive traits:
- **Eq**: Equality comparison (`==`)
- **Show**: String representation (`toString`)
- **JSON**: JSON serialization/deserialization

```tova
type Color { Red, Green, Blue } derive [Eq, Show]

print(Red == Red)       // true
print(Red == Blue)      // false
print(toString(Red))   // "Red"
```

## Type Aliases

Create shorthand names for complex types:

```tova
type UserId = Int
type Email = String
type UserMap = Map<UserId, User>
```

Aliases don't create new types — they're just alternative names for readability.

## Union Types

Sometimes a value can legitimately be one of several types. The `|` operator in type annotations expresses this:

```tova
fn process(input: String | Int) -> String {
  match input {
    s if typeOf(s) == "String" => upper(s)
    n => toString(n)
  }
}

process("hello")   // "HELLO"
process(42)        // "42"
```

Union types are especially useful for functions that accept flexible inputs:

```tova
// Accept multiple types for display
fn display(value: String | Int | Float) -> String {
  toString(value)
}

// A config value can be a string, number, or boolean
fn set_config(key: String, value: String | Int | Bool) {
  config[key] = value
}
```

Union types work naturally with pattern matching and the `is` keyword:

```tova
fn describe(value: String | Int | Float) -> String {
  if value is String {
    "text: {value}"
  } elif value is Int {
    "integer: {value}"
  } else {
    "decimal: {value}"
  }
}
```

::: tip Union Types vs. ADTs
Use **union types** when a function accepts multiple existing types (like `String | Int`). Use **ADTs** when you're defining a new domain concept with named variants (like `Shape` with `Circle`, `Rectangle`, etc.). ADTs carry more meaning; union types offer flexibility.
:::

## Tuple Types

Tuples are fixed-length collections where each position has a known type. They're perfect for returning multiple values from a function:

```tova
fn divide(a: Int, b: Int) -> (Int, Int) {
  (a / b, a % b)
}

let (quotient, remainder) = divide(17, 5)
print("17 / 5 = {quotient} remainder {remainder}")
```

Tuples are lighter than defining a full record type when you just need to group a few values together:

```tova
// Return multiple values without defining a type
fn min_max(items) -> (Int, Int) {
  (min(items), max(items))
}

let (lo, hi) = min_max([3, 1, 4, 1, 5, 9])
print("Range: {lo} to {hi}")
```

You can also use tuples inline for temporary grouping:

```tova
// Zip two lists into pairs
pairs = zip(names, ages)
for pair in pairs {
  let (name, age) = pair
  print("{name} is {age} years old")
}
```

::: tip Tuples vs. Records
Use **tuples** for quick, positional groupings (coordinates, min/max pairs, divmod results). Use **records** when the fields have meaningful names and you'll pass the structure around. If you find yourself writing comments like "first element is the name, second is the age," switch to a record.
:::

## Function Types

Functions are first-class values in Tova, and their types can be expressed with the arrow syntax:

```tova
// A function that takes a String and returns an Int
type Parser = (String) -> Int

// A function that takes two Ints and returns a Bool
type Comparator = (Int, Int) -> Bool

// A function that takes nothing and returns a String
type Thunk = () -> String
```

Function types are useful for declaring callback parameters and storing functions in data structures:

```tova
fn apply(value: Int, transform: (Int) -> Int) -> Int {
  transform(value)
}

fn run_all(tasks: [()] -> String) -> [String] {
  tasks |> map(fn(task) task())
}
```

You can also use function types in type definitions:

```tova
type EventHandler {
  name: String
  callback: (String) -> Void
}

type Middleware = (Request, (Request) -> Response) -> Response
```

## Array Types

When annotating arrays, use square brackets around the element type:

```tova
names: [String] = ["Alice", "Bob", "Charlie"]
scores: [Int] = [95, 87, 92, 100]
prices: [Float] = [9.99, 24.50, 3.75]
matrix: [[Int]] = [[1, 2], [3, 4], [5, 6]]
```

Array types in function signatures communicate what the function expects and returns:

```tova
fn average(values: [Float]) -> Float {
  values |> sum() / toFloat(len(values))
}

fn names_of(users: [User]) -> [String] {
  users |> map(fn(u) u.name)
}
```

::: tip Type Inference
You don't need to annotate every array. Tova infers `[Int]` from `[1, 2, 3]` automatically. Use explicit array types in function signatures and when the type isn't obvious from context.
:::

## Generics

Types can be parameterized with type variables:

```tova
type Pair<A, B> {
  first: A
  second: B
}

type Stack<T> {
  Empty
  Push(value: T, rest: Stack<T>)
}
```

Generic types are instantiated with concrete type arguments:

```tova
type Box<T> {
  value: T
}

string_box = Box(value: "hello")
int_box = Box(value: 42)
```

### Generic Functions

Functions can also be generic:

```tova
fn identity<T>(x: T) -> T { x }
fn wrap<T>(value: T) -> Box<T> { Box(value: value) }
fn map_pair<A, B, C>(pair: Pair<A, B>, f: (A) -> C) -> Pair<C, B> {
  Pair(first: f(pair.first), second: pair.second)
}
```

## Interfaces

Interfaces define a contract that types must satisfy — a set of methods without implementation:

```tova
interface Printable {
  fn display(self) -> String
}

interface Measurable {
  fn area(self) -> Float
  fn perimeter(self) -> Float
}
```

Types satisfy an interface by implementing all its methods:

```tova
type Circle {
  radius: Float
}

impl Measurable for Circle {
  fn area(self) { 3.14159 * self.radius * self.radius }
  fn perimeter(self) { 2.0 * 3.14159 * self.radius }
}

impl Printable for Circle {
  fn display(self) { "Circle(r={self.radius})" }
}
```

You can then write functions that accept any type satisfying an interface:

```tova
fn print_measurement(shape: Measurable) {
  print("Area: {shape.area()}, Perimeter: {shape.perimeter()}")
}

c = Circle(radius: 5.0)
print_measurement(c)
```

Interfaces enable **polymorphism** — different types can be used interchangeably as long as they satisfy the same interface.

## Traits

Traits are like interfaces but can include **default implementations**:

```tova
trait Describable {
  fn name(self) -> String

  // Default implementation — types can override
  fn describe(self) -> String {
    "A {self.name()}"
  }
}
```

Types opt in with `impl`:

```tova
type Dog { breed: String }

impl Describable for Dog {
  fn name(self) { self.breed }
  // describe() uses the default: "A {self.name()}"
}

type Robot { model: String, version: Int }

impl Describable for Robot {
  fn name(self) { self.model }
  fn describe(self) { "{self.model} v{self.version}" }  // Override default
}
```

### When to Use Interfaces vs. Traits

| Need | Use |
|------|-----|
| Pure contract, no defaults | Interface |
| Shared default behavior | Trait |
| Multiple implementations of same method | Interface |
| Mix shared and custom behavior | Trait |

## Impl Blocks

`impl` blocks attach methods directly to a type:

```tova
type Vector2 {
  x: Float
  y: Float
}

impl Vector2 {
  fn magnitude(self) -> Float {
    sqrt(self.x * self.x + self.y * self.y)
  }

  fn add(self, other: Vector2) -> Vector2 {
    Vector2(x: self.x + other.x, y: self.y + other.y)
  }

  fn scale(self, factor: Float) -> Vector2 {
    Vector2(x: self.x * factor, y: self.y * factor)
  }
}

v = Vector2(x: 3.0, y: 4.0)
print("Magnitude: {v.magnitude()}")       // 5.0
doubled = v.scale(2.0)
print("Doubled: ({doubled.x}, {doubled.y})")  // (6.0, 8.0)
```

Use `impl` for:
- Methods that operate on a type's data
- Builder patterns and fluent APIs
- Keeping related functions organized with their type

## Visibility with `pub`

By default, functions and types in a module are **private** — only accessible within the same file. The `pub` keyword makes them available to other modules:

```tova
// Only pub items are accessible from other modules
pub fn create_user(name: String) -> User {
  User(name: name, role: "member")
}

pub type User {
  name: String
  role: String
}

// Internal helper — not pub, not accessible from imports
fn validate_name(name: String) -> Bool {
  len(name) >= 2
}
```

When another file imports this module, only `create_user` and `User` are available. `validate_name` stays hidden — it's an implementation detail:

```tova
// In another file
import { create_user, User } from "./users"

alice = create_user("Alice")    // Works — pub function
// validate_name("x")           // Error — not pub
```

### What to Make `pub`

Think of `pub` as your module's **public API**. A good rule of thumb:

```tova
// Public: the operations others need
pub fn connect(url: String) -> Result<Connection, String> { /* ... */ }
pub fn query(conn: Connection, sql: String) -> Result<Rows, String> { /* ... */ }
pub fn close(conn: Connection) { /* ... */ }

// Public: types that appear in your public function signatures
pub type Connection {
  url: String
  session_id: String
}

// Private: implementation details
fn build_query_string(sql: String) -> String { /* ... */ }
fn retry_connection(url: String, attempts: Int) -> Result<Connection, String> { /* ... */ }
```

::: tip Start Private, Go Public
Default to keeping things private. If another module needs something, make it `pub`. This approach gives you the freedom to refactor internals without breaking code that depends on your module.
:::

## Type Checking with `is`

Check a value's type at runtime using `is`:

```tova
fn describe_value(val) {
  if val is String {
    print("A string: {val}")
  } elif val is Int {
    print("An integer: {val}")
  } else {
    print("Something else")
  }
}

describe_value("hello")   // "A string: hello"
describe_value(42)         // "An integer: 42"
```

`is` works with custom types too:

```tova
if shape is Circle {
  print("It's a circle with radius {shape.radius}")
}
```

::: tip Prefer Pattern Matching Over `is`
For ADT variants, `match` is usually cleaner than `is` checks. Use `is` for checking basic types or when you need a quick type guard without full destructuring.
:::

::: tip Start Simple, Add Types Later
Don't over-engineer your types upfront. Start with simple data, then extract types when you see patterns. Tova's type inference means you can often get by without explicit types until the domain model becomes clear.
:::

## Project: Shape Calculator

Let's build a complete shape system with colors, styling, and SVG output:

```tova
type Color {
  Red
  Green
  Blue
  Hex(code: String)
}

type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
  Triangle(base: Float, height: Float)
}

type StyledShape {
  Styled(shape: Shape, fill: Color, stroke: Color)
}

fn color_name(c) {
  match c {
    Red => "red"
    Green => "green"
    Blue => "blue"
    Hex(code) => code
  }
}

fn area(shape) {
  match shape {
    Circle(r) => 3.14159 * r * r
    Rectangle(w, h) => w * h
    Triangle(b, h) => 0.5 * b * h
  }
}

fn to_svg(styled) {
  match styled {
    Styled(Circle(r), fill, stroke) =>
      "<circle r=\"{r}\" fill=\"{color_name(fill)}\" stroke=\"{color_name(stroke)}\" />"
    Styled(Rectangle(w, h), fill, stroke) =>
      "<rect width=\"{w}\" height=\"{h}\" fill=\"{color_name(fill)}\" stroke=\"{color_name(stroke)}\" />"
    Styled(Triangle(b, h), fill, stroke) =>
      "<polygon points=\"0,{h} {b/2.0},0 {b},{h}\" fill=\"{color_name(fill)}\" stroke=\"{color_name(stroke)}\" />"
  }
}

// Build and render a scene
scene = [
  Styled(Circle(50.0), Red, Hex("#333")),
  Styled(Rectangle(100.0, 60.0), Blue, Green),
  Styled(Triangle(80.0, 70.0), Hex("#ff9900"), Red)
]

for item in scene {
  print(to_svg(item))
}

total = scene
  |> map(fn(s) match s { Styled(shape, _, _) => area(shape) })
  |> sum()
print("Total area: {total}")
```

<TryInPlayground :code="domainCode" label="Shape Calculator" />

## Exercises

**Exercise 6.1:** Model a **playing card** system. Define types for `Suit` (Hearts, Diamonds, Clubs, Spades), `Rank` (Ace through King), and `Card(suit, rank)`. Write `card_value(card)` for Blackjack scoring (Ace=11, face cards=10) and `display(card)` for a readable string.

**Exercise 6.2:** Model a **file system** with types for `FSEntry`: `File(name, size_bytes)`, `Directory(name, children)`. Write `total_size(entry)` that recursively calculates total bytes, and `find_large(entry, threshold)` that returns all files over the threshold.

**Exercise 6.3:** Model an **authentication flow**: `AuthState` with variants `LoggedOut`, `Authenticating(username)`, `Authenticated(user, token)`, `Failed(error)`. Write a `transition(state, event)` function where events include "login", "success", "failure", "logout". Ensure only valid transitions are possible.

## Challenge

Build a **simple type checker**. Define:
1. `Type` variants: `TInt`, `TFloat`, `TString`, `TBool`, `TArray(element_type)`, `TFunction(param_types, return_type)`
2. `Expr` variants: `IntLit`, `FloatLit`, `StringLit`, `BoolLit`, `ArrayLit(items)`, `FuncCall(name, args)`
3. A `typeOf(expr)` function that infers the type of an expression
4. A `check(expr, expected_type)` function that returns `Ok(type)` or `Err(mismatch_message)`

---

[← Previous: Pattern Matching Power](./pattern-matching) | [Next: Fearless Error Handling →](./error-handling)
