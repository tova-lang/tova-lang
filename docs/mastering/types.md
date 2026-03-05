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
- **Show**: String representation (`to_string`)
- **JSON**: JSON serialization/deserialization

```tova
type Color { Red, Green, Blue } derive [Eq, Show]

print(Red == Red)       // true
print(Red == Blue)      // false
print(to_string(Red))   // "Red"
```

## Type Aliases

Create shorthand names for complex types:

```tova
type UserId = Int
type Email = String
type UserMap = Map<UserId, User>
```

Aliases don't create new types — they're just alternative names for readability.

## Generics

Types can be parameterized:

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
3. A `type_of(expr)` function that infers the type of an expression
4. A `check(expr, expected_type)` function that returns `Ok(type)` or `Err(mismatch_message)`

---

[← Previous: Pattern Matching Power](./pattern-matching) | [Next: Fearless Error Handling →](./error-handling)
