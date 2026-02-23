# Interfaces and Traits

Tova provides two mechanisms for defining shared behavior across types: **interfaces** and **traits**. Both let you specify a set of methods that a type must implement, enabling polymorphism and code reuse.

## Interfaces

An `interface` declares a contract -- a set of method signatures that any implementing type must provide:

```tova
interface Printable {
  fn to_string() -> String
}
```

### Implementing an Interface

Use `impl` to provide the method bodies for a specific type:

```tova
type User {
  id: Int
  name: String
  email: String
}

impl Printable for User {
  fn to_string() {
    "{self.name} <{self.email}>"
  }
}
```

Now any `User` value can call `.to_string()`:

```tova
alice = User(1, "Alice", "alice@example.com")
print(alice.to_string())   // "Alice <alice@example.com>"
```

### Multiple Interfaces

A type can implement as many interfaces as needed:

```tova
interface Printable {
  fn to_string() -> String
}

interface Comparable {
  fn compare(other) -> Int
}

type Temperature {
  degrees: Float
  unit: String
}

impl Printable for Temperature {
  fn to_string() {
    "{self.degrees}{self.unit}"
  }
}

impl Comparable for Temperature {
  fn compare(other) {
    if self.degrees < other.degrees { -1 }
    elif self.degrees > other.degrees { 1 }
    else { 0 }
  }
}
```

### Interfaces with Multiple Methods

Interfaces can require more than one method:

```tova
interface Collection {
  fn length() -> Int
  fn is_empty() -> Bool
  fn contains(item) -> Bool
}

type Stack {
  items: [Int]
}

impl Collection for Stack {
  fn length() {
    len(self.items)
  }

  fn is_empty() {
    len(self.items) == 0
  }

  fn contains(item) {
    item in self.items
  }
}
```

## Traits

Traits work similarly to interfaces. Use `trait` to declare shared behavior:

```tova
trait Serializable {
  fn serialize() -> String
}

trait Deserializable {
  fn deserialize(data: String) -> Self
}
```

### Implementing Traits

The `impl` syntax is the same:

```tova
type Config {
  host: String
  port: Int
  debug: Bool
}

impl Serializable for Config {
  fn serialize() {
    JSON.stringify({
      host: self.host,
      port: self.port,
      debug: self.debug
    })
  }
}
```

### Traits with Default Implementations

Traits can provide default method bodies that implementing types inherit for free. Types can override them if needed:

```tova
trait Describable {
  fn name() -> String

  fn description() -> String {
    "A {self.name()}"
  }
}

type Car {
  make: String
  model: String
}

impl Describable for Car {
  fn name() {
    "{self.make} {self.model}"
  }
  // description() is inherited: "A Toyota Camry"
}
```

## When to Use Interface vs Trait

Both `interface` and `trait` define shared behavior. The choice between them is largely stylistic, but here is a general guideline:

- Use **interface** when you are defining a pure contract -- just method signatures, no default implementations.
- Use **trait** when you want to provide default method bodies that types can inherit or override.

## Derive Macros

For common traits, Tova can automatically generate implementations with `derive`:

```tova
type Point {
  x: Float
  y: Float
} derive [Eq, Show, JSON]
```

This generates:
- **Eq** -- equality (`==`) and inequality (`!=`) based on field-by-field comparison.
- **Show** -- a string representation for display/debugging.
- **JSON** -- `to_json()` and `from_json()` for serialization.

### Derive with ADTs

Derive works with algebraic data types too:

```tova
type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
} derive [Eq, Show]

a = Circle(5.0)
b = Circle(5.0)
c = Rectangle(3.0, 4.0)

print(a == b)   // true
print(a == c)   // false
print(a)        // Circle(5.0)
```

### Available Derive Macros

| Macro | Generated Behavior |
|-------|-------------------|
| `Eq` | `==` and `!=` operators |
| `Show` | Human-readable string representation |
| `JSON` | `.to_json()` and `.from_json()` methods |

## Putting It All Together

Here is a more complete example combining types, interfaces, traits, and derive:

```tova
interface Renderable {
  fn render() -> String
}

type Heading {
  level: Int
  text: String
} derive [Eq, Show]

type Paragraph {
  text: String
} derive [Eq, Show]

type Bold {
  text: String
} derive [Eq, Show]

impl Renderable for Heading {
  fn render() {
    tag = "h{self.level}"
    "<{tag}>{self.text}</{tag}>"
  }
}

impl Renderable for Paragraph {
  fn render() {
    "<p>{self.text}</p>"
  }
}

impl Renderable for Bold {
  fn render() {
    "<strong>{self.text}</strong>"
  }
}

fn render_all(elements) {
  elements.map(fn(el) el.render()).join("\n")
}

doc = [
  Heading(1, "Welcome"),
  Paragraph("This is a paragraph."),
  Heading(2, "Details"),
  Paragraph("More text with a "),
  Bold("bold word"),
  Paragraph(".")
]

print(render_all(doc))
```

## Plain `impl` Blocks

You can use `impl` without a trait to add methods directly to a type:

```tova
type Point {
  x: Float
  y: Float
}

impl Point {
  fn distance(self, other) {
    dx = other.x - self.x
    dy = other.y - self.y
    Math.sqrt(dx * dx + dy * dy)
  }

  fn magnitude(self) {
    Math.sqrt(self.x * self.x + self.y * self.y)
  }

  fn scale(self, factor) {
    Point(self.x * factor, self.y * factor)
  }
}
```

The `self` parameter refers to the instance the method is called on:

```tova
a = Point(0, 0)
b = Point(3, 4)
print(a.distance(b))   // 5
print(b.magnitude())   // 5
print(b.scale(2))      // Point(6, 8)
```

Plain `impl` blocks are compiled to prototype methods, so they are shared across all instances with no per-instance memory cost.

You can combine plain `impl` blocks with trait implementations on the same type:

```tova
impl Point {
  fn translate(self, dx, dy) {
    Point(self.x + dx, self.y + dy)
  }
}

impl Printable for Point {
  fn to_string() {
    "({self.x}, {self.y})"
  }
}
```

## Practical Tips

**Derive early and often.** Adding `derive [Eq, Show]` to a type costs nothing and gives you equality checks and debug printing for free. Add `JSON` when the type needs to cross a serialization boundary.

**Keep interfaces small.** An interface with one or two methods is easier to implement and compose than one with ten. Prefer multiple small interfaces over one large one.

**Use `impl` blocks to organize related behavior.** Even for a single type, splitting behavior into separate `impl` blocks by interface keeps your code modular:

```tova
type User {
  id: Int
  name: String
  email: String
} derive [Eq, JSON]

impl Printable for User {
  fn to_string() { self.name }
}

impl Comparable for User {
  fn compare(other) { self.id - other.id }
}
```
