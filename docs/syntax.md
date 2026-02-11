# Lux Syntax Reference

## Variables

```lux
// Immutable (default)
name = "Lux"
age = 25
pi = 3.14

// Mutable
var count = 0
count += 1

// Multiple assignment
a, b = 1, 2

// Swap (requires var)
var x = 1
var y = 2
x, y = y, x

// Destructuring
let { name, age } = user
let [first, second] = pair
```

## Types

```lux
// Primitive types: Int, Float, String, Bool, Nil

// Struct-like type
type User {
  name: String
  age: Int
  email: String
}

// Algebraic type (tagged union)
type Shape {
  Circle(radius: Float)
  Rect(width: Float, height: Float)
  Point
}

// Generic type
type Result<T, E> {
  Ok(value: T)
  Err(error: E)
}

// Array type annotation
fn get_users() -> [User] { ... }
```

## Functions

```lux
// Basic function (implicit return — last expression is returned)
fn add(a, b) {
  a + b
}

// Typed function
fn add(a: Int, b: Int) -> Int {
  a + b
}

// Default parameters
fn greet(name = "world") {
  "Hello, {name}!"
}

// Named arguments at call site
greet(name: "Alice")

// Lambda expressions
double = fn(x) x * 2
double = x => x * 2
add = (a, b) => a + b

// Lambda with block body
transform = fn(x) {
  y = x * 2
  y + 1
}
```

## Strings

```lux
// Simple strings
name = "Alice"
path = '/usr/local'

// String interpolation (double quotes only)
greeting = "Hello, {name}!"
math = "2 + 2 = {2 + 2}"
method = "Name: {user.name.upper()}"

// String multiply
divider = "-" * 40

// Escape sequences: \n \t \r \\ \" \{
```

## Control Flow

```lux
// if / elif / else
if x > 0 {
  print("positive")
} elif x == 0 {
  print("zero")
} else {
  print("negative")
}

// for loop
for item in items {
  print(item)
}

// for with index (using enumerate)
for i, item in enumerate(items) {
  print("{i}: {item}")
}

// for with key-value
for key, value in entries(obj) {
  print("{key} = {value}")
}

// for-else (runs else if loop never entered)
for user in users {
  print(user.name)
} else {
  print("No users found")
}

// while loop
var n = 10
while n > 0 {
  print(n)
  n -= 1
}
```

## Pattern Matching

```lux
result = match value {
  0 => "zero"
  1..10 => "small"
  n if n > 100 => "big: {n}"
  _ => "other"
}

// Match on algebraic types
fn area(shape) {
  match shape {
    Circle(radius) => 3.14 * radius ** 2
    Rect(w, h) => w * h
    Point => 0
  }
}

// Match with block body
match status {
  "ok" => {
    print("Success")
    true
  }
  "error" => {
    print("Failed")
    false
  }
  _ => false
}
```

## Operators

```lux
// Arithmetic: + - * / % **
// Comparison: == != < <= > >=
// Logical: and or not  (also: && || !)
// Assignment: = += -= *= /=
// Pipe: |>
// Range: .. ..=
// Spread: ...
// Optional chain: ?.
// Member: .
```

## Pipe Operator

```lux
// Left-to-right function chaining
result = data
  |> filter(fn(x) x > 0)
  |> map(fn(x) x * 2)
  |> sum()

// The pipe inserts the left value as the first argument
// x |> f(a) becomes f(x, a)
```

## Python-Inspired Features

```lux
// List comprehension
evens = [x * 2 for x in range(10) if x > 0]

// Dict comprehension
squares = {x: x ** 2 for x in range(5)}

// Chained comparisons
if 1 < x < 10 { ... }
if 0 <= index < len(list) { ... }

// Membership test
if "apple" in fruits { ... }
if x not in banned { ... }

// Boolean operators
if a and b or not c { ... }

// Slice syntax
first_three = list[0:3]
reversed = list[::-1]
every_other = list[::2]

// Truthiness
if users {        // truthy if non-empty
  print("has users")
}

// Discard with _
_ = some_side_effect()
```

## Modules

```lux
// Named imports (JS-style)
import { map, filter } from "utils"

// Default import
import React from "react"

// Aliased import
import { Component as Comp } from "react"
```

## Full-Stack Blocks

```lux
// Shared code — runs on both server and client
shared {
  type User {
    name: String
    email: String
  }

  fn validate_email(email: String) -> Bool {
    email.contains("@")
  }
}

// Server code — Bun.serve() native HTTP (zero dependencies)
server {
  fn get_users() -> [User] {
    db.query("SELECT * FROM users")
  }

  route GET "/api/users" => get_users
  route POST "/api/users" => create_user
}

// Client code — reactive UI
client {
  state count = 0
  computed doubled = count * 2

  effect {
    print("Count changed: {count}")
  }

  component Counter {
    <div>
      <p>"{count}"</p>
      <button on:click={fn() count += 1}>"+"</button>
    </div>
  }
}
```

## Named Multi-Blocks (Multi-Process)

Multiple blocks of the same type can run as **separate processes**, each on its
own port. Give each block a string name:

```lux
// API server — port 3000 (env: PORT_API)
server "api" {
  fn get_users() -> [User] { users }
  route GET "/api/users" => get_users
}

// WebSocket server — port 3001 (env: PORT_EVENTS)
server "events" {
  fn subscribe() { ... }
  route GET "/events" => subscribe
}

// Admin dashboard
client "admin" {
  state users: [User] = []
  component AdminPanel { ... }
}
```

Build output:
```
.lux-out/
├── app.server.api.js      # Separate Bun.serve() process
├── app.server.events.js   # Separate Bun.serve() process
├── app.client.admin.js    # Separate client bundle
└── app.shared.js
```

Dev orchestration (`lux dev`) automatically starts each named server block
on an incrementing port and shuts them all down together on Ctrl+C.

Port assignment:
- Default (unnamed) → `PORT` env var or 3000
- Named → `PORT_<NAME>` env var or auto-assigned

Blocks with the **same name** are merged. Blocks with **different names**
compile to separate files and run as independent processes.

## Reactive Primitives (Client)

```lux
// Signal (reactive variable)
state count = 0
state name: String = ""

// Computed (derived value)
computed doubled = count * 2
computed greeting = "Hello, {name}!"

// Effect (side-effect that re-runs when dependencies change)
effect {
  print("count is now {count}")
}
```

## Components (Client)

```lux
component App {
  <div class="app">
    <h1>"Title"</h1>
    <p>"{message}"</p>
  </div>
}

// Component with props
component Card(title, body) {
  <div class="card">
    <h2>"{title}"</h2>
    <p>"{body}"</p>
  </div>
}

// JSX control flow
component UserList(users) {
  <ul>
    for user in users {
      <li>"{user.name}"</li>
    }
  </ul>
}

// Event handling
component Button(label, on_click) {
  <button on:click={on_click}>"{label}"</button>
}
```

## Server RPC

```lux
// Server functions are automatically available to client via RPC
server {
  fn get_data() { ... }
}

client {
  effect {
    // This becomes an HTTP POST to /rpc/get_data
    data = server.get_data()
  }
}
```

## Comments

```lux
// Single line comment

/* Block comment
   can span multiple lines */

/* Block comments /* can be nested */ */

/// Doc comment (preserved in output)
fn important_function() { ... }
```
