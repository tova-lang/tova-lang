---
title: Tour of Lux
description: A rapid 10-minute walkthrough of every major Lux concept.
---

# Tour of Lux

This is a fast-paced tour of the Lux language. Each section introduces a concept with a short code example. By the end, you will have seen every major feature.

## 1. Variables

Bindings are immutable by default. Use `var` for mutable variables. Use `let` for destructuring.

```lux
x = 5                   // immutable
var y = 10              // mutable
y += 1                  // OK

let { name, age } = user    // destructure an object
let [first, ...rest] = items // destructure an array
```

## 2. Functions

Functions are declared with `fn`. The last expression is the return value.

```lux
fn greet(name) {
  "Hello, {name}!"
}

greet("Alice")   // "Hello, Alice!"
```

Lambdas use the same keyword without a name:

```lux
double = fn(x) x * 2
```

Functions can have default parameters:

```lux
fn connect(host, port = 8080) {
  print("Connecting to {host}:{port}")
}

connect("localhost")        // port defaults to 8080
connect("localhost", 3000)  // port is 3000
```

## 3. Control Flow

Lux uses `if`/`elif`/`else` -- there is no `else if`:

```lux
fn classify(score) {
  if score >= 90 {
    "A"
  } elif score >= 80 {
    "B"
  } elif score >= 70 {
    "C"
  } else {
    "F"
  }
}
```

Loops with `for` and `while`, plus `break` and `continue`:

```lux
for item in items {
  if item == "skip" { continue }
  if item == "stop" { break }
  print(item)
}

var n = 1
while n <= 10 {
  print(n)
  n += 1
}
```

Guard clauses for early exits:

```lux
fn process(data) {
  guard data != nil else { return Err("no data") }
  guard len(data) > 0 else { return Err("empty") }
  Ok(transform(data))
}
```

## 4. Pattern Matching

`match` is one of the most powerful features in Lux. It supports literals, ranges, variant destructuring, wildcards, and guards.

```lux
fn describe(value) {
  match value {
    0          => "zero"
    1..10      => "small"
    n if n > 100 => "big: {n}"
    _          => "other"
  }
}
```

Match on custom type variants:

```lux
fn area(shape) {
  match shape {
    Circle(r)       => 3.14159 * r * r
    Rect(w, h)      => w * h
    Triangle(b, h)  => 0.5 * b * h
  }
}
```

Match on arrays and strings:

```lux
match list {
  []        => "empty"
  [x]       => "one element: {x}"
  [x, y]    => "two: {x}, {y}"
  [_, ...rest] => "many, rest has {len(rest)}"
}

match url {
  "/api" ++ rest => handle_api(rest)
  "/static" ++ _ => serve_static(url)
  _              => not_found()
}
```

The compiler warns you if you forget to handle a case.

## 5. Types

Define record types and algebraic data types (ADTs):

```lux
type User {
  id: Int
  name: String
  email: String
}

user = User(1, "Alice", "alice@example.com")
print(user.name)   // "Alice"
```

ADTs with variants:

```lux
type Color {
  Red
  Green
  Blue
  Custom(r: Int, g: Int, b: Int)
}

bg = Custom(30, 60, 90)
```

Generic types:

```lux
type Option<T> {
  Some(T)
  None
}

type Result<T, E> {
  Ok(T)
  Err(E)
}
```

## 6. Collections

Arrays, objects, spread, slicing, and comprehensions:

```lux
// Arrays
nums = [1, 2, 3, 4, 5]
first = nums[0]
slice = nums[1:4]          // [2, 3, 4]

// Spread
combined = [...nums, 6, 7]

// Objects
config = { host: "localhost", port: 8080 }

// Comprehensions
evens = [x * 2 for x in range(10)]
squares = [x * x for x in range(10) if x > 0]
```

## 7. Error Handling

Lux uses `Result` and `Option` types instead of exceptions:

```lux
fn divide(a, b) {
  if b == 0 {
    Err("division by zero")
  } else {
    Ok(a / b)
  }
}

result = divide(10, 3)

match result {
  Ok(value) => print("Result: {value}")
  Err(msg)  => print("Error: {msg}")
}
```

Chain operations with `.map()` and `.unwrap()`:

```lux
value = divide(10, 2)
  |> Result.map(fn(x) x * 2)
  |> Result.unwrap()

print(value)   // 10
```

Propagate errors with `!`:

```lux
fn load_config(path) {
  content = read_file(path)!     // returns Err early if read fails
  parse_json(content)!           // returns Err early if parse fails
  Ok(content)
}
```

## 8. Pipes

The pipe operator `|>` chains function calls left to right:

```lux
result = data
  |> filter(fn(x) x > 0)
  |> map(fn(x) x * 2)
  |> sum()

// Equivalent to: sum(map(filter(data, fn(x) x > 0), fn(x) x * 2))
```

Use `_` as a placeholder when the value should not go in the first position:

```lux
"hello" |> replace(_, "l", "r")   // "herro"
```

## 9. Modules

Import and export between files:

```lux
// math.lux
export fn square(x) { x * x }
export fn cube(x) { x * x * x }
export PI = 3.14159
```

```lux
// app.lux
import { square, cube, PI } from "./math"

print(square(5))   // 25
print(PI)          // 3.14159
```

Import npm packages the same way:

```lux
import { z } from "zod"
import dayjs from "dayjs"
```

## 10. Full-Stack

Lux's defining feature is the three-block model. A single `.lux` file can contain `shared`, `server`, and `client` blocks:

```lux
shared {
  type Message {
    id: Int
    text: String
    author: String
  }
}

server {
  var messages = []

  fn get_messages() -> [Message] {
    messages
  }

  fn post_message(text: String, author: String) -> Message {
    msg = Message(len(messages) + 1, text, author)
    messages = [...messages, msg]
    msg
  }
}

client {
  state messages = []
  state draft = ""
  state username = "Anonymous"

  effect {
    messages = server.get_messages()
  }

  fn send() {
    if draft != "" {
      server.post_message(draft, username)
      draft = ""
      messages = server.get_messages()
    }
  }

  component App() {
    <div>
      <h1>"Chat"</h1>
      <ul>
        for msg in messages {
          <li>
            <strong>"{msg.author}: "</strong>
            "{msg.text}"
          </li>
        }
      </ul>
      <input value={draft} on:input={fn(e) draft = e.target.value} />
      <button on:click={send}>"Send"</button>
    </div>
  }
}
```

Key concepts:
- **`shared`** -- types and constants available on both server and client.
- **`server`** -- runs on the server (Bun). Functions here are exposed as RPC endpoints.
- **`client`** -- runs in the browser. Call server functions with `server.fn_name()`.
- **`state`** -- reactive signal. When it changes, dependent UI updates automatically.
- **`computed`** -- derived value that recalculates when its dependencies change.
- **`effect`** -- side effect that runs when its dependencies change.
- **`component`** -- a reactive UI component that renders JSX.

## 11. Async

Lux supports `async` and `await` as first-class keywords:

```lux
async fn fetch_data(url) {
  response = await fetch(url)
  data = await response.json()
  Ok(data)
}

async fn load_users() {
  users = await fetch_data("/api/users")
  match users {
    Ok(data) => print("Loaded {len(data)} users")
    Err(e)   => print("Failed: {e}")
  }
}
```

## 12. Interfaces

Define shared behavior across types:

```lux
interface Printable {
  fn to_string() -> String
}

interface Comparable {
  fn compare(other) -> Int
}
```

Use `derive` to auto-implement common interfaces:

```lux
type Point {
  x: Int
  y: Int
} derive [Eq, Show, JSON]
```

This generates equality checking, string representation, and JSON serialization automatically.

---

That covers the core of Lux. For deeper dives into each topic, continue to the language guide:

- [Variables](/guide/variables)
- [Functions](/guide/functions)
- [Control Flow](/guide/control-flow)
- [Pattern Matching](/guide/pattern-matching)
- [Types](/guide/types)
- [Error Handling](/guide/error-handling)
- [Pipes](/guide/pipes)
- [Modules](/guide/modules)
- [Async](/guide/async)
- [Full-Stack Architecture](/fullstack/architecture)
