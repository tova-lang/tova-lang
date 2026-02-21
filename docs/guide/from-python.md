# Tova for Python Developers

If you know Python, you already know most of Tova. Tova takes Python's readability and adds Rust-quality type safety, immutability by default, and a full-stack compilation model. This guide maps the Python you know to the Tova equivalents.

## At a Glance

| Concept | Python | Tova |
|---------|--------|------|
| Immutable binding | `x = 5` (convention) | `x = 5` (enforced) |
| Mutable binding | `x = 5` (everything is mutable) | `var x = 5` |
| Print | `print(f"Hello, {name}")` | `print("Hello, {name}")` |
| Function | `def greet(name):` | `fn greet(name) {` |
| Lambda | `lambda x: x + 1` | `fn(x) x + 1` or `x => x + 1` |
| If/elif/else | `if / elif / else:` | `if / elif / else {` |
| For loop | `for x in items:` | `for x in items {` |
| List comprehension | `[x*2 for x in items]` | `[x*2 for x in items]` |
| Dict comprehension | `{k: v for k, v in pairs}` | `{k: v for k, v in pairs}` |
| Boolean operators | `and`, `or`, `not` | `and`, `or`, `not` |
| None | `None` | `nil` |
| Type hints | `def f(x: int) -> str:` | `fn f(x: Int) -> String {` |
| Pattern matching | `match / case` (3.10+) | `match { ... => }` |
| Pipe | N/A | `\|>` |
| String multiply | `"-" * 40` | `"-" * 40` |
| Slicing | `items[1:5:2]` | `items[1:5:2]` |
| Membership | `x in items` | `x in items` |
| Chained comparison | `1 < x < 10` | `1 < x < 10` |
| Error handling | `try / except` | `Result<T, E>` and `match` |

## Variables

Python makes everything mutable by default. Tova flips this: variables are **immutable by default**, and you opt into mutability with `var`.

::: code-group
```python [Python]
name = "Alice"      # mutable — can be reassigned
name = "Bob"        # fine

count = 0
count += 1          # fine
```

```tova [Tova]
name = "Alice"      // immutable — cannot be reassigned
// name = "Bob"     // Error: cannot reassign immutable variable

var count = 0       // explicitly mutable
count += 1          // OK
```
:::

### Destructuring

Python uses tuple unpacking. Tova uses `let` for destructuring (and `let` is *only* for destructuring — not for declaring variables like in JavaScript):

::: code-group
```python [Python]
name, age = "Alice", 30
first, *rest = [1, 2, 3, 4]
```

```tova [Tova]
name, age = "Alice", 30
let [first, ...rest] = [1, 2, 3, 4]
```
:::

Object destructuring has no direct Python equivalent:

```tova
person = { name: "Alice", age: 30 }
let { name, age } = person
```

## Functions

Python uses `def` with indentation. Tova uses `fn` with curly braces and has implicit returns.

::: code-group
```python [Python]
def add(a, b):
    return a + b

def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"
```

```tova [Tova]
fn add(a, b) {
  a + b    // implicit return — last expression is returned
}

fn greet(name, greeting = "Hello") {
  "{greeting}, {name}!"
}
```
:::

### Lambdas

Python's `lambda` is limited to single expressions. Tova's anonymous functions have no such restriction:

::: code-group
```python [Python]
double = lambda x: x * 2
add = lambda a, b: a + b

# Multi-line? You need a def.
```

```tova [Tova]
double = fn(x) x * 2
add = fn(a, b) a + b

// Or with arrow syntax:
double = x => x * 2
add = (a, b) => a + b

// Multi-line lambdas are fine:
process = fn(item) {
  cleaned = item.trim()
  validate(cleaned)
}
```
:::

### Type Annotations

Both languages support optional type hints, with similar syntax:

::: code-group
```python [Python]
def divide(a: float, b: float) -> float:
    return a / b
```

```tova [Tova]
fn divide(a: Float, b: Float) -> Float {
  a / b
}
```
:::

## Control Flow

### If / Elif / Else

Almost identical, except Tova uses braces instead of colons and indentation:

::: code-group
```python [Python]
if score >= 90:
    grade = "A"
elif score >= 80:
    grade = "B"
elif score >= 70:
    grade = "C"
else:
    grade = "F"
```

```tova [Tova]
if score >= 90 {
  grade = "A"
} elif score >= 80 {
  grade = "B"
} elif score >= 70 {
  grade = "C"
} else {
  grade = "F"
}
```
:::

::: warning
Tova uses `elif`, just like Python. Never write `else if` — Tova will reject it.
:::

In Tova, `if` is an expression that returns a value:

```tova
status = if age >= 18 { "adult" } else { "minor" }
```

### For Loops

::: code-group
```python [Python]
for name in names:
    print(name)

for i, name in enumerate(names):
    print(f"{i}: {name}")

for i in range(10):
    print(i)
```

```tova [Tova]
for name in names {
  print(name)
}

for i, name in names {    // index is built-in, no enumerate needed
  print("{i}: {name}")
}

for i in range(10) {
  print(i)
}
```
:::

Tova also has Python's `for...else` pattern:

```tova
for item in items {
  if item.is_special() {
    print("Found it!")
    break
  }
} else {
  print("Not found")
}
```

### Guard Clauses

Python has no direct equivalent. Guards flatten nested conditionals:

```tova
fn process_order(order) {
  guard order != nil else {
    return Err("Order is nil")
  }
  guard order.total > 0 else {
    return Err("Total must be positive")
  }
  // happy path continues here
  submit(order)
}
```

## Pattern Matching

Python 3.10 added structural pattern matching. Tova's version is more powerful with exhaustive checking, range patterns, and string destructuring.

::: code-group
```python [Python]
match command:
    case "start":
        start_server()
    case "stop":
        stop_server()
    case _:
        print("Unknown")
```

```tova [Tova]
match command {
  "start" => start_server()
  "stop" => stop_server()
  _ => print("Unknown")
}
```
:::

### Range Patterns

```tova
fn classify_age(age) {
  match age {
    0..13 => "child"
    13..=19 => "teenager"
    20..=64 => "adult"
    _ => "senior"
  }
}
```

### Variant Patterns (ADTs)

Python uses classes for this; Tova has algebraic data types:

::: code-group
```python [Python]
from dataclasses import dataclass

@dataclass
class Circle:
    radius: float

@dataclass
class Rectangle:
    width: float
    height: float

def area(shape):
    match shape:
        case Circle(radius=r):
            return 3.14 * r * r
        case Rectangle(width=w, height=h):
            return w * h
```

```tova [Tova]
type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
}

fn area(shape) {
  match shape {
    Circle(r) => 3.14 * r * r
    Rectangle(w, h) => w * h
  }
}
```
:::

### String Patterns

Tova can destructure strings — no Python equivalent:

```tova
fn parse_route(url) {
  match url {
    "/api" ++ rest => handle_api(rest)
    "/admin" ++ rest => handle_admin(rest)
    "/" => home_page()
    _ => not_found()
  }
}
```

## Collections

### List Comprehensions

Identical syntax:

::: code-group
```python [Python]
squares = [x * x for x in range(10)]
evens = [x for x in range(20) if x % 2 == 0]
```

```tova [Tova]
squares = [x * x for x in range(10)]
evens = [x for x in range(20) if x % 2 == 0]
```
:::

### Dict Comprehensions

::: code-group
```python [Python]
squares = {x: x * x for x in range(5)}
```

```tova [Tova]
squares = {x: x * x for x in range(5)}
```
:::

### Slicing

Also identical:

::: code-group
```python [Python]
items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
items[2:5]      # [2, 3, 4]
items[:3]       # [0, 1, 2]
items[-3:]      # [7, 8, 9]
items[::2]      # [0, 2, 4, 6, 8]
items[::-1]     # [9, 8, 7, ..., 0]
```

```tova [Tova]
items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
items[2:5]      // [2, 3, 4]
items[:3]       // [0, 1, 2]
items[-3:]      // [7, 8, 9]
items[::2]      // [0, 2, 4, 6, 8]
items[::-1]     // [9, 8, 7, ..., 0]
```
:::

### Membership Testing

::: code-group
```python [Python]
if "apple" in fruits:
    print("Found!")

if "mango" not in fruits:
    print("Missing!")
```

```tova [Tova]
if "apple" in fruits {
  print("Found!")
}

if "mango" not in fruits {
  print("Missing!")
}
```
:::

### Chained Comparisons

::: code-group
```python [Python]
if 1 < x < 10:
    print("In range")
```

```tova [Tova]
if 1 < x < 10 {
  print("In range")
}
```
:::

## Strings

### Interpolation

Python uses f-strings. Tova interpolates by default in double-quoted strings:

::: code-group
```python [Python]
name = "Alice"
greeting = f"Hello, {name}!"
math = f"1 + 2 = {1 + 2}"
```

```tova [Tova]
name = "Alice"
greeting = "Hello, {name}!"      // always interpolated
math = "1 + 2 = {1 + 2}"
```
:::

Use single quotes for raw strings (no interpolation):

```tova
raw = 'no {interpolation} here'
```

### String Multiplication

Both languages support it:

::: code-group
```python [Python]
separator = "-" * 40
```

```tova [Tova]
separator = "-" * 40
```
:::

### String Concatenation

::: code-group
```python [Python]
result = first + ", " + second
```

```tova [Tova]
result = first ++ ", " ++ second
// or better:
result = "{first}, {second}"
```
:::

## Pipe Operator

This is the biggest syntax addition over Python. Instead of nesting calls, chain them left-to-right:

::: code-group
```python [Python]
# Nested calls — reads inside-out
result = sorted(list(filter(lambda x: x > 0, map(lambda x: x * 2, data))))
```

```tova [Tova]
// Pipe chain — reads top-to-bottom
result = data
  |> map(fn(x) x * 2)
  |> filter(fn(x) x > 0)
  |> sorted()
```
:::

This is transformative for data processing pipelines:

```tova
active_emails = users
  |> filter(fn(u) u.active)
  |> map(fn(u) u.email)
  |> sorted()
  |> join(", ")
```

## Error Handling

Python uses exceptions. Tova uses `Result` and `Option` types — errors are values, not control flow.

::: code-group
```python [Python]
def divide(a, b):
    if b == 0:
        raise ValueError("Division by zero")
    return a / b

try:
    result = divide(10, 0)
except ValueError as e:
    print(f"Error: {e}")
```

```tova [Tova]
fn divide(a: Float, b: Float) -> Result<Float, String> {
  if b == 0 {
    Err("Division by zero")
  } else {
    Ok(a / b)
  }
}

match divide(10.0, 0.0) {
  Ok(value) => print("Result: {value}")
  Err(error) => print("Error: {error}")
}
```
:::

### Error Propagation

Python exceptions propagate automatically. In Tova, use `!` for explicit propagation:

```tova
fn process_data(input: String) -> Result<Data, String> {
  parsed = parse(input)!            // return Err early if parse fails
  validated = validate(parsed)!     // return Err early if validation fails
  Ok(transform(validated))
}
```

### Option for Missing Values

Python uses `None` and relies on runtime checks. Tova's `Option` type makes absence explicit:

::: code-group
```python [Python]
def find_user(users, name):
    for user in users:
        if user.name == name:
            return user
    return None

user = find_user(users, "Alice")
if user is not None:
    print(user.email)
```

```tova [Tova]
fn find_user(users, name) -> Option<User> {
  for user in users {
    if user.name == name {
      return Some(user)
    }
  }
  None
}

match find_user(users, "Alice") {
  Some(user) => print(user.email)
  None => print("Not found")
}
```
:::

## Types and Data Modeling

### Dataclasses vs Tova Types

::: code-group
```python [Python]
from dataclasses import dataclass

@dataclass
class User:
    id: int
    name: str
    email: str
```

```tova [Tova]
type User {
  id: Int
  name: String
  email: String
} derive [Eq, Show, JSON]
```
:::

The `derive` macro generates equality, display, and serialization — similar to `@dataclass(eq=True)` plus `__str__` and JSON support.

### Enums

::: code-group
```python [Python]
from enum import Enum

class Color(Enum):
    RED = "red"
    GREEN = "green"
    BLUE = "blue"
```

```tova [Tova]
type Color {
  Red
  Green
  Blue
}
```
:::

### Enums with Data (Sum Types)

Python has no clean equivalent. Tova handles this natively:

```tova
type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
  Triangle(base: Float, height: Float)
}

// Then pattern match on it
fn area(shape) {
  match shape {
    Circle(r) => 3.14 * r * r
    Rectangle(w, h) => w * h
    Triangle(b, h) => 0.5 * b * h
  }
}
```

### Generics

::: code-group
```python [Python]
from typing import Generic, TypeVar

T = TypeVar("T")

class Box(Generic[T]):
    def __init__(self, value: T):
        self.value = value
```

```tova [Tova]
type Box<T> {
  value: T
}

int_box = Box(42)
str_box = Box("hello")
```
:::

## Interfaces and Traits

Python uses abstract base classes or protocols. Tova has `interface` and `trait`:

::: code-group
```python [Python]
from abc import ABC, abstractmethod

class Printable(ABC):
    @abstractmethod
    def to_string(self) -> str: ...

class User:
    def to_string(self) -> str:
        return f"{self.name} <{self.email}>"
```

```tova [Tova]
interface Printable {
  fn to_string() -> String
}

type User {
  name: String
  email: String
}

impl Printable for User {
  fn to_string() {
    "{self.name} <{self.email}>"
  }
}
```
:::

## Async

Both languages use `async`/`await` with similar syntax:

::: code-group
```python [Python]
import aiohttp

async def fetch_data(url):
    async with aiohttp.ClientSession() as session:
        response = await session.get(url)
        return await response.json()
```

```tova [Tova]
async fn fetch_data(url) {
  response = await fetch(url)
  await response.json()
}
```
:::

## Standard Library Comparison

| Python | Tova | Notes |
|--------|------|-------|
| `math.sin(x)` | `math.sin(x)` | Namespaced identically |
| `math.floor(x)` | `math.floor(x)` | |
| `str.upper()` | `str.upper()` or `upper(s)` | Both method and function form |
| `str.split(",")` | `str.split(",")` or `split(s, ",")` | |
| `len(items)` | `len(items)` | Identical |
| `range(10)` | `range(10)` | Identical |
| `sorted(items)` | `sorted(items)` | Identical |
| `sum(items)` | `sum(items)` | Identical |
| `map(f, items)` | `map(items, f)` or `items.map(f)` | Args reversed for piping |
| `filter(f, items)` | `filter(items, f)` or `items.filter(f)` | Args reversed for piping |
| `json.dumps(obj)` | `json.stringify(obj)` | JS-style naming |
| `json.loads(s)` | `json.parse(s)` | JS-style naming |
| `re.match(pat, s)` | `re.match(pat, s)` | Similar |
| `datetime.now()` | `dt.now()` | Shorter namespace |

## Full-Stack: What Python Doesn't Have

Tova's defining feature is the full-stack compilation model. A single `.tova` file contains server, client, and shared code:

```tova
shared {
  type Todo {
    id: Int
    title: String
    done: Bool
  }
}

server {
  db { path: "./todos.db" }
  model TodoModel {}

  fn get_todos() -> [Todo] {
    TodoModel.all()
  }

  fn add_todo(title: String) -> Todo {
    TodoModel.create({ title, done: false })
  }

  route GET "/api/todos" => get_todos
  route POST "/api/todos" => add_todo
}

client {
  state todos: [Todo] = []

  effect {
    todos = server.get_todos()
  }

  component App {
    <div>
      <h1>Todos</h1>
      <ul>
        for todo in todos {
          <li>{todo.title}</li>
        }
      </ul>
    </div>
  }
}
```

The compiler splits this into separate server and client outputs and automatically wires up RPC calls. `server.get_todos()` in the client becomes a `fetch()` under the hood.

In Python, you would need Flask/Django for the server, a separate React/Vue app for the client, a shared JSON schema, and manual API wiring. Tova collapses all of that into one file with one type system.

## Quick Reference: Key Differences

| Topic | Python | Tova |
|-------|--------|------|
| Blocks | Indentation | `{ }` curly braces |
| Comments | `#` | `//` and `/* */` |
| None/nil | `None` | `nil` |
| Boolean operators | `and`, `or`, `not` | `and`, `or`, `not` (same!) |
| String concat | `+` | `++` |
| String format | `f"Hello, {name}"` | `"Hello, {name}"` |
| Raw strings | `r"no\escape"` | `'no\escape'` |
| Mutability | Everything mutable | Immutable default, `var` for mutable |
| No value return | `None` implicit | Last expression implicit |
| Semicolons | Not used | Optional (newlines work) |
| `self` in methods | Explicit `self` parameter | Implicit `self` in `impl` blocks |
| Package manager | `pip` | `bun` (npm-compatible) |
| Runtime | CPython | Bun (server), Browser (client) |
| REPL | `python` | `tova repl` |
| Formatter | `black` | `tova fmt` |
| Test runner | `pytest` | `tova test` |
