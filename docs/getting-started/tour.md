---
title: Tour of Tova
description: A rapid 10-minute walkthrough of every major Tova concept.
---

<script setup>
const variablesCode = `x = 5
var y = 10
y += 1
print("x = {x}, y = {y}")`

const functionsCode = `fn greet(name) {
  "Hello, {name}!"
}

print(greet("Alice"))

double = fn(x) x * 2
print("double(5) = {double(5)}")

fn connect(host, port = 8080) {
  print("Connecting to {host}:{port}")
}

connect("localhost")
connect("localhost", 3000)`

const controlFlowCode = `fn classify(score) {
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

for s in [95, 82, 71, 55] {
  print("{s} => {classify(s)}")
}`

const patternMatchCode = `fn describe(value) {
  match value {
    0          => "zero"
    1..10      => "small"
    n if n > 100 => "big: {n}"
    _          => "other"
  }
}

print(describe(0))
print(describe(7))
print(describe(200))
print(describe(50))`

const typesCode = `type Color {
  Red
  Green
  Blue
  Custom(r: Int, g: Int, b: Int)
}

type User {
  id: Int
  name: String
  email: String
}

user = User(1, "Alice", "alice@example.com")
print(user.name)

bg = Custom(30, 60, 90)
print(bg)`

const errorHandlingCode = `fn divide(a, b) {
  if b == 0 {
    Err("division by zero")
  } else {
    Ok(a / b)
  }
}

match divide(10, 3) {
  Ok(value) => print("Result: {value}")
  Err(msg)  => print("Error: {msg}")
}

match divide(5, 0) {
  Ok(value) => print("Result: {value}")
  Err(msg)  => print("Error: {msg}")
}`

const pipesCode = `data = [3, -1, 4, -2, 5, 0]

result = data
  |> filter(fn(x) x > 0)
  |> map(fn(x) x * 2)
  |> sum()

print("Result: {result}")`
</script>

# Tour of Tova

This is a fast-paced tour of the Tova language. Tova is a general-purpose language -- you can use it for scripting, CLI tools, data processing, AI integration, and full-stack web development. Each section introduces a concept with a short code example. By the end, you will have seen every major feature.

## 1. Variables

Bindings are immutable by default. Use `var` for mutable variables. Use `let` for destructuring.

```tova
x = 5                   // immutable
var y = 10              // mutable
y += 1                  // OK

let { name, age } = user    // destructure an object
let [a, b, c] = items       // destructure an array
```

<TryInPlayground :code="variablesCode" label="Variables" />

## 2. Functions

Functions are declared with `fn`. The last expression is the return value.

```tova
fn greet(name) {
  "Hello, {name}!"
}

greet("Alice")   // "Hello, Alice!"
```

Lambdas use the same keyword without a name:

```tova
double = fn(x) x * 2
```

Functions can have default parameters:

```tova
fn connect(host, port = 8080) {
  print("Connecting to {host}:{port}")
}

connect("localhost")        // port defaults to 8080
connect("localhost", 3000)  // port is 3000
```

<TryInPlayground :code="functionsCode" label="Functions" />

## 3. Control Flow

Tova uses `if`/`elif`/`else` -- there is no `else if`:

```tova
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

```tova
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

```tova
fn process(data) {
  guard data != nil else { return Err("no data") }
  guard len(data) > 0 else { return Err("empty") }
  Ok(transform(data))
}
```

<TryInPlayground :code="controlFlowCode" label="Control Flow" />

## 4. Pattern Matching

`match` is one of the most powerful features in Tova. It supports literals, ranges, variant destructuring, wildcards, and guards.

```tova
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

```tova
fn area(shape) {
  match shape {
    Circle(r)       => 3.14159 * r * r
    Rect(w, h)      => w * h
    Triangle(b, h)  => 0.5 * b * h
  }
}
```

Match on arrays and strings:

```tova
match list {
  []        => "empty"
  [x]       => "one element: {x}"
  [x, y]    => "two: {x}, {y}"
  _         => "many elements"
}

match path {
  "/api" ++ rest => handle_api(rest)
  "/static" ++ _ => serve_static(path)
  _              => not_found()
}
```

The compiler warns you if you forget to handle a case.

<TryInPlayground :code="patternMatchCode" label="Pattern Matching" />

## 5. Types

Define record types and algebraic data types (ADTs):

```tova
type User {
  id: Int
  name: String
  email: String
}

user = User(1, "Alice", "alice@example.com")
print(user.name)   // "Alice"
```

ADTs with variants:

```tova
type Color {
  Red
  Green
  Blue
  Custom(r: Int, g: Int, b: Int)
}

bg = Custom(30, 60, 90)
```

Tova has built-in generic types `Option<T>` and `Result<T, E>`:

```tova
val = Some(42)       // Option: Some(T) or None
res = Ok("hello")    // Result: Ok(T) or Err(E)
```

<TryInPlayground :code="typesCode" label="Types" />

## 6. Collections

Arrays, objects, spread, slicing, and comprehensions:

```tova
// Arrays
nums = [1, 2, 3, 4, 5]
head = nums[0]
part = nums[1:4]           // [2, 3, 4]

// Spread
combined = [...nums, 6, 7]

// Objects
config = { host: "localhost", port: 8080 }

// Comprehensions
evens = [x * 2 for x in range(10)]
squares = [x * x for x in range(10) if x > 0]
```

## 7. Error Handling

Tova uses `Result` and `Option` types instead of exceptions:

```tova
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

```tova
value = divide(10, 2)
  |> .map(fn(x) x * 2)
  |> .unwrap()

print(value)   // 10
```

Propagate errors with `?`:

```tova
fn load_config(path) {
  content = read_file(path)?     // returns Err early if read fails
  config = parse_json(content)?  // returns Err early if parse fails
  Ok(config)
}
```

<TryInPlayground :code="errorHandlingCode" label="Error Handling" />

## 8. Pipes

The pipe operator `|>` chains function calls left to right:

```tova
result = data
  |> filter(fn(x) x > 0)
  |> map(fn(x) x * 2)
  |> sum()

// Equivalent to: sum(map(filter(data, fn(x) x > 0), fn(x) x * 2))
```

Use `_` as a placeholder when the value should not go in the first position:

```tova
"hello" |> replace(_, "l", "r")   // "herro"
```

<TryInPlayground :code="pipesCode" label="Pipes" />

## 9. Modules

Import and publish declarations between files:

```tova
// lib/math.tova
pub fn square(x) { x * x }
pub fn cube(x) { x * x * x }
pub TAU = 6.28318
```

```tova
// app.tova
import { square, cube, TAU } from "./lib/math"

print(square(5))   // 25
print(TAU)         // 6.28318
```

Import npm packages the same way:

```tova
import { z } from "zod"
import dayjs from "dayjs"
```

## 10. Full-Stack Web (Optional)

Everything from sections 1-9 works standalone with `tova run my_script.tova` -- no server or client blocks needed. When you want to build a web application, Tova's three-block model lets you write server and client code in a single `.tova` file:

```tova
shared {
  type Message {
    id: Int
    text: String
    author: String
  }
}

server {
  var messages = []

  fn get_messages() {
    messages
  }

  fn post_message(text, author) {
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

::: tip Not building for the web?
Everything from lessons 1-9 works standalone with `tova run my_script.tova`. No server or client blocks needed. See the [I/O guide](/guide/io) and [CLI Tool example](/examples/cli-tool).
:::

### CLI Tools

For command-line tools, the `cli {}` block turns function signatures into a complete CLI interface with argument parsing, validation, and help text:

```tova
cli {
  name: "todo"
  version: "1.0.0"

  fn add(task: String, --priority: Int = 3) {
    print(green("Added: ") + bold(task))
  }

  fn list(--all: Bool) {
    print("Listing tasks...")
  }
}
```

This auto-generates `--help`, type validation, subcommand routing, and error messages. See the [CLI Block guide](/fullstack/cli-block) for the full reference.

## 11. Async

Tova supports `async` and `await` as first-class keywords:

```tova
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

```tova
interface Printable {
  fn to_string() -> String
}

interface Comparable {
  fn compare(other) -> Int
}
```

Use `derive` to auto-implement common interfaces:

```tova
type Point {
  x: Int
  y: Int
} derive [Eq, Show, JSON]
```

This generates equality checking, string representation, and JSON serialization automatically.

---

That covers the core of Tova. For deeper dives into each topic, continue to the language guide:

- [Variables](/guide/variables)
- [Functions](/guide/functions)
- [Control Flow](/guide/control-flow)
- [Pattern Matching](/guide/pattern-matching)
- [Types](/guide/types)
- [Error Handling](/guide/error-handling)
- [Pipes](/guide/pipes)
- [Modules](/guide/modules)
- [Tables & Data](/guide/data)
- [I/O](/guide/io)
- [AI Integration](/guide/ai)
- [Async](/guide/async)
- [Full-Stack Architecture](/fullstack/architecture)
