# Keywords

This page lists every reserved keyword in the Lux language in alphabetical order. Each entry includes a brief description and a minimal code example.

## Reserved Keywords

| Keyword | Description |
|---------|-------------|
| [`and`](#and) | Logical AND (keyword form) |
| [`as`](#as) | Alias in imports |
| [`async`](#async) | Mark a function as asynchronous |
| [`await`](#await) | Wait for an async result |
| [`break`](#break) | Exit a loop early |
| [`catch`](#catch) | Handle errors from a try block |
| [`client`](#client) | Define a client-side block |
| [`component`](#component) | Declare a reactive UI component |
| [`computed`](#computed) | Declare a derived reactive value |
| [`continue`](#continue) | Skip to the next loop iteration |
| [`defer`](#defer) | Schedule code to run at scope exit |
| [`derive`](#derive) | Auto-derive trait implementations for a type |
| [`effect`](#effect) | Declare a reactive side effect |
| [`elif`](#elif) | Chained conditional branch |
| [`else`](#else) | Fallback conditional branch |
| [`export`](#export) | Make a declaration available to other modules |
| [`extern`](#extern) | Declare an external (foreign) binding |
| [`false`](#false) | Boolean false literal |
| [`finally`](#finally) | Code that always runs after try/catch |
| [`fn`](#fn) | Declare a function |
| [`for`](#for) | Iterate over a collection or range |
| [`from`](#from) | Specify the module source in an import |
| [`guard`](#guard) | Assert a condition or execute an else block |
| [`if`](#if) | Conditional branch |
| [`impl`](#impl) | Implement methods or traits for a type |
| [`import`](#import) | Bring names from another module into scope |
| [`in`](#in) | Membership test; iteration target in for loops |
| [`interface`](#interface) | Define a structural type contract |
| [`let`](#let) | Destructuring binding |
| [`match`](#match) | Pattern matching expression |
| [`nil`](#nil) | The absence-of-value literal |
| [`not`](#not) | Logical NOT (keyword form) |
| [`or`](#or) | Logical OR (keyword form) |
| [`pub`](#pub) | Mark a declaration as public |
| [`return`](#return) | Explicit early return from a function |
| [`route`](#route) | Define an HTTP route in a server block |
| [`server`](#server) | Define a server-side block |
| [`shared`](#shared) | Define a block shared between server and client |
| [`state`](#state) | Declare a reactive state variable |
| [`store`](#store) | Declare a reactive store |
| [`trait`](#trait) | Define a named set of behaviors |
| [`true`](#true) | Boolean true literal |
| [`try`](#try) | Begin an error-handling block |
| [`type`](#type) | Declare a custom type (struct or ADT) |
| [`var`](#var) | Declare a mutable variable |
| [`while`](#while) | Loop while a condition is true |
| [`yield`](#yield) | Yield a value from a generator |

## Contextual Keywords (HTTP Methods)

These identifiers are reserved only within `server` blocks for route declarations:

| Keyword | Description |
|---------|-------------|
| `GET` | HTTP GET method |
| `POST` | HTTP POST method |
| `PUT` | HTTP PUT method |
| `DELETE` | HTTP DELETE method |
| `PATCH` | HTTP PATCH method |

---

## Keyword Details

### `and`

Logical AND operator. Short-circuits: the right operand is not evaluated if the left is falsy.

```lux
if is_valid and is_active {
  process()
}
```

### `as`

Renames an import to a local alias.

```lux
import { readFile as read } from "fs"
```

### `async`

Marks a function as asynchronous. An async function returns a Promise.

```lux
async fn fetch_data(url) {
  response = await fetch(url)
  await response.json()
}
```

### `await`

Suspends execution until an asynchronous value resolves.

```lux
data = await fetch_data("/api/users")
```

### `break`

Exits the nearest enclosing `for` or `while` loop immediately.

```lux
for item in items {
  if item == target {
    break
  }
}
```

### `catch`

Handles errors thrown in a `try` block. The caught error is bound to an optional variable.

```lux
try {
  data = parse(input)
} catch err {
  log("Parse error: {err}")
}
```

### `client`

Opens a client-side block. Code inside is compiled only for the browser.

```lux
client {
  state count = 0
  component Counter() {
    <button on:click={fn() count += 1}>{count}</button>
  }
}
```

### `component`

Declares a reactive UI component that renders JSX.

```lux
component Greeting(name) {
  <h1>"Hello, {name}!"</h1>
}
```

### `computed`

Declares a derived value that automatically updates when its dependencies change.

```lux
state items = []
computed total = items.length
```

### `continue`

Skips the remainder of the current loop iteration and proceeds to the next.

```lux
for i in 0..100 {
  if i % 2 == 0 {
    continue
  }
  print(i)
}
```

### `defer`

Schedules an expression to run when the enclosing scope exits, regardless of how it exits.

```lux
fn process_file(path) {
  file = open(path)
  defer close(file)
  read(file)
}
```

### `derive`

Automatically generates trait implementations for a type.

```lux
type Point {
  x: Float
  y: Float
} derive [Eq, Show, JSON]
```

### `effect`

Declares a reactive side effect that re-runs when its dependencies change.

```lux
state query = ""
effect {
  results = search(query)
  render(results)
}
```

### `elif`

A chained conditional branch. Lux uses `elif`, **not** `else if`.

```lux
if score >= 90 {
  "A"
} elif score >= 80 {
  "B"
} elif score >= 70 {
  "C"
} else {
  "F"
}
```

### `else`

The fallback branch of an `if`/`elif` chain or a `for` loop.

```lux
if condition {
  handle_true()
} else {
  handle_false()
}
```

### `export`

Makes a declaration accessible to other modules.

```lux
export fn greet(name) {
  "Hello, {name}!"
}
```

### `extern`

Declares an external binding provided by the host environment.

```lux
extern fn console_log(msg)
```

### `false`

The boolean false literal.

```lux
is_done = false
```

### `finally`

Specifies a block that always executes after `try`/`catch`, whether or not an error occurred.

```lux
try {
  data = load()
} catch err {
  log(err)
} finally {
  cleanup()
}
```

### `fn`

Declares a named function or an anonymous lambda.

```lux
fn add(a, b) {
  a + b
}

double = fn(x) x * 2
```

### `for`

Iterates over a range or collection. Supports an optional second variable for key/index.

```lux
for item in items {
  print(item)
}

for i, val in enumerate(items) {
  print("{i}: {val}")
}
```

### `from`

Specifies the module path in an import statement.

```lux
import { sqrt, PI } from "math"
```

### `guard`

Asserts a condition. If the condition is false, the `else` block executes (typically returning or breaking).

```lux
fn process(input) {
  guard input != nil else {
    return Error("input is nil")
  }
  // continue with valid input
  Ok(transform(input))
}
```

### `if`

Conditional branching. Can be used as a statement or an expression.

```lux
// As statement
if ready {
  start()
}

// As expression
label = if count == 1 { "item" } else { "items" }
```

### `impl`

Implements methods or trait conformance for a type.

```lux
impl Point {
  fn distance(self, other) {
    sqrt((self.x - other.x) ** 2 + (self.y - other.y) ** 2)
  }
}
```

### `import`

Brings named exports from another module into the current scope.

```lux
import { map, filter, reduce } from "stdlib/collections"
```

### `in`

Tests membership or specifies the iteration target in a `for` loop.

```lux
if "admin" in roles { grant_access() }

for x in 0..10 { print(x) }
```

### `interface`

Defines a structural contract that types can implement.

```lux
interface Printable {
  fn to_string(self) -> String
}
```

### `let`

Performs destructuring binding from a value.

```lux
let { name, email } = user
let [first, ...rest] = items
```

::: warning
`let` is NOT used for simple variable declarations. Use `x = value` for simple bindings and `var x = value` for mutable variables.
:::

### `match`

Pattern matching expression. Exhaustive by design.

```lux
match result {
  Ok(value) => print(value)
  Error(msg) => print("Error: {msg}")
}
```

### `nil`

The absence-of-value literal, equivalent to JavaScript's `null`.

```lux
result = nil
```

### `not`

Logical NOT operator (keyword form).

```lux
if not is_empty(list) {
  process(list)
}
```

### `or`

Logical OR operator. Short-circuits: the right operand is not evaluated if the left is truthy.

```lux
name = input or "default"
```

### `pub`

Marks a declaration as publicly visible.

```lux
pub fn api_handler(req) {
  respond(200, "ok")
}
```

### `return`

Explicitly returns a value from a function. Optional when the last expression is the return value.

```lux
fn find(items, target) {
  for item in items {
    if item == target {
      return item
    }
  }
  nil
}
```

### `route`

Defines an HTTP route handler inside a `server` block.

```lux
server {
  route GET "/api/users" => {
    users = db.query("SELECT * FROM users")
    json(users)
  }
}
```

### `server`

Opens a server-side block. Code inside is compiled only for the server.

```lux
server {
  db { url: "postgres://localhost/mydb" }
  route GET "/health" => "ok"
}
```

### `shared`

Opens a block whose code is available on both server and client.

```lux
shared {
  type User {
    name: String
    email: String
  }
}
```

### `state`

Declares a reactive state variable in a client block or component.

```lux
state count = 0
state name = "world"
```

### `store`

Groups related reactive state, computed values, and methods.

```lux
store TodoStore {
  state items = []
  computed count = items.length
  fn add(text) {
    items = [...items, {text: text, done: false}]
  }
}
```

### `trait`

Defines a named set of behavior (similar to a typeclass or protocol).

```lux
trait Comparable {
  fn compare(self, other) -> Int
}
```

### `true`

The boolean true literal.

```lux
is_ready = true
```

### `try`

Begins an error-handling block. Must be followed by `catch` and optionally `finally`.

```lux
try {
  data = parse(raw_input)
} catch err {
  data = default_value
}
```

### `type`

Declares a custom type -- either a struct (product type) or an algebraic data type (sum type).

```lux
// Struct
type Point {
  x: Float
  y: Float
}

// ADT (sum type)
type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
}
```

### `var`

Declares a mutable variable with an initial value.

```lux
var counter = 0
counter += 1
```

### `while`

Loops while a condition is true.

```lux
var i = 0
while i < 10 {
  print(i)
  i += 1
}
```

### `yield`

Yields a value from a generator function.

```lux
fn fibonacci() {
  var a = 0
  var b = 1
  while true {
    yield a
    a, b = b, a + b
  }
}
```

## Non-Keywords

The following are **not** keywords in Lux, even though they might be expected from other languages:

| Word | Status in Lux |
|------|---------------|
| `throw` | Not a keyword. Lux uses `Result`/`Option` for error handling. |
| `class` | Not a keyword. Use `type` for data types and `impl` for methods. |
| `this` | Not a keyword. Use `self` in `impl` blocks (passed explicitly). |
| `else if` | Not valid syntax. Use `elif` instead. |
