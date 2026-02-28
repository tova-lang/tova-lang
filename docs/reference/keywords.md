# Keywords

This page lists every reserved keyword in the Tova language in alphabetical order. Each entry includes a brief description and a minimal code example.

## Reserved Keywords

| Keyword | Description |
|---------|-------------|
| [`ai`](#ai) | Declare an AI provider configuration |
| [`and`](#and) | Logical AND (keyword form) |
| [`as`](#as) | Alias in imports |
| [`async`](#async) | Mark a function as asynchronous |
| [`await`](#await) | Wait for an async result |
| [`bench`](#bench) | Define a benchmark block |
| [`break`](#break) | Exit a loop early |
| [`catch`](#catch) | Handle errors from a try block |
| [`browser`](#browser) | Define a browser block |
| [`component`](#component) | Declare a reactive UI component |
| [`computed`](#computed) | Declare a derived reactive value |
| [`concurrent`](#concurrent) | Define a structured concurrency block |
| [`continue`](#continue) | Skip to the next loop iteration |
| [`data`](#data) | Define a data block for sources, pipelines, and validation |
| [`defer`](#defer) | Schedule code to run at scope exit |
| [`derive`](#derive) | Auto-derive trait implementations for a type |
| [`effect`](#effect) | Declare a reactive side effect |
| [`elif`](#elif) | Chained conditional branch |
| [`else`](#else) | Fallback conditional branch |
| `export` | Reserved keyword (use [`pub`](#pub) instead) |
| [`extern`](#extern) | Declare an external (foreign) binding |
| [`false`](#false) | Boolean false literal |
| [`field`](#field) | Declare a form field inside a form block |
| [`finally`](#finally) | Code that always runs after try/catch |
| [`fn`](#fn) | Declare a function |
| [`for`](#for) | Iterate over a collection or range |
| [`form`](#form) | Declare a reactive form inside a browser/component scope |
| [`from`](#from) | Specify the module source in an import; receive from a channel in `select` |
| [`group`](#group) | Declare a field group inside a form block |
| [`guard`](#guard) | Assert a condition or execute an else block |
| [`if`](#if) | Conditional branch |
| [`impl`](#impl) | Implement methods or traits for a type |
| [`is`](#is) | Type-checking operator |
| [`import`](#import) | Bring names from another module into scope |
| [`in`](#in) | Membership test; iteration target in for loops |
| [`interface`](#interface) | Define a structural type contract |
| [`let`](#let) | Destructuring binding |
| [`loop`](#loop) | Infinite loop |
| [`match`](#match) | Pattern matching expression |
| [`mut`](#mut) | Reserved (use `var` instead) |
| [`nil`](#nil) | The absence-of-value literal |
| [`not`](#not) | Logical NOT (keyword form) |
| [`or`](#or) | Logical OR (keyword form) |
| [`pipeline`](#pipeline) | Declare a named transform chain in a data block |
| [`pub`](#pub) | Mark a declaration as public |
| [`refresh`](#refresh) | Set a refresh policy for a data source |
| [`return`](#return) | Explicit early return from a function |
| [`route`](#route) | Define an HTTP route in a server block |
| [`select`](#select) | Multiplex across channel operations |
| [`server`](#server) | Define a server-side block |
| [`shared`](#shared) | Define a block shared between server and browser |
| [`source`](#source) | Declare a data source in a data block |
| [`spawn`](#spawn) | Launch a concurrent task inside a `concurrent` block |
| [`state`](#state) | Declare a reactive state variable |
| [`steps`](#steps) | Declare wizard steps inside a form block |
| [`store`](#store) | Declare a reactive store |
| [`test`](#test) | Define a test block |
| [`trait`](#trait) | Define a named set of behaviors |
| [`true`](#true) | Boolean true literal |
| [`try`](#try) | Begin an error-handling block |
| [`type`](#type) | Declare a custom type (struct or ADT) |
| [`validate`](#validate) | Declare validation rules for a type in a data block |
| [`var`](#var) | Declare a mutable variable |
| [`when`](#when) | Guard condition in for loops |
| [`while`](#while) | Loop while a condition is true |
| [`with`](#with) | Resource management with cleanup |
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
| `HEAD` | HTTP HEAD method |
| `OPTIONS` | HTTP OPTIONS method |

---

## Keyword Details

### `ai`

Declares an AI provider configuration inside a `server` block. Can be unnamed (default) or named for multiple providers.

```tova
server {
  ai {
    provider: "anthropic"
    model: "claude-sonnet-4-20250514"
    api_key: env("ANTHROPIC_API_KEY")
  }

  ai "gpt" {
    provider: "openai"
    model: "gpt-4o"
    api_key: env("OPENAI_API_KEY")
  }

  answer = ai.ask("Hello")
  other = gpt.ask("Hello")
}
```

### `and`

Logical AND operator. Short-circuits: the right operand is not evaluated if the left is falsy.

```tova
if is_valid and is_active {
  process()
}
```

### `as`

Renames an import to a local alias.

```tova
import { readFile as read } from "fs"
```

### `async`

Marks a function as asynchronous. An async function returns a Promise.

```tova
async fn fetch_data(url) {
  response = await fetch(url)
  await response.json()
}
```

### `await`

Suspends execution until an asynchronous value resolves.

```tova
data = await fetch_data("/api/users")
```

### `bench`

Defines a benchmark block inside a test file. Used to measure execution time of a code snippet.

```tova
bench "array sorting" {
  data = range(1000) |> shuffle()
  sorted(data)
}
```

### `break`

Exits the nearest enclosing `for` or `while` loop immediately.

```tova
for item in items {
  if item == target {
    break
  }
}
```

### `catch`

Handles errors thrown in a `try` block. The caught error is bound to an optional variable.

```tova
try {
  data = parse(input)
} catch err {
  log("Parse error: {err}")
}
```

### `browser`

Opens a browser block. Code inside is compiled only for the browser.

```tova
browser {
  state count = 0
  component Counter() {
    <button on:click={fn() count += 1}>{count}</button>
  }
}
```

### `component`

Declares a reactive UI component that renders JSX.

```tova
component Greeting(name) {
  <h1>"Hello, {name}!"</h1>
}
```

### `computed`

Declares a derived value that automatically updates when its dependencies change.

```tova
state items = []
computed total = len(items)
```

### `continue`

Skips the remainder of the current loop iteration and proceeds to the next.

```tova
for i in 0..100 {
  if i % 2 == 0 {
    continue
  }
  print(i)
}
```

### `concurrent`

Defines a structured concurrency block. All spawned tasks within the block must complete (or be cancelled) before execution continues past it. Supports mode modifiers: `cancel_on_error`, `first`, and `timeout(ms)`.

```tova
concurrent {
    users = spawn fetch_users()
    posts = spawn fetch_posts()
}
// users and posts are Result values

concurrent cancel_on_error {
    a = spawn validate(input)
    b = spawn check_permissions(user)
}

concurrent timeout(5000) {
    data = spawn slow_operation()
}
```

See the [Concurrency guide](/guide/concurrency) for full details.

### `data`

Opens a data block for declaring sources, pipelines, validation rules, and refresh policies. The `data {}` block is a top-level block alongside `shared`, `server`, and `browser`.

```tova
data {
  source users = read("users.csv")
  pipeline active = users |> where(.active)
  validate User { .email |> contains("@") }
  refresh users every 15.minutes
}
```

### `defer`

Schedules an expression to run when the enclosing scope exits, regardless of how it exits.

```tova
fn process_file(path) {
  file = open(path)
  defer close(file)
  read(file)
}
```

### `derive`

Automatically generates trait implementations for a type.

```tova
type Point {
  x: Float
  y: Float
} derive [Eq, Show, JSON]
```

### `effect`

Declares a reactive side effect that re-runs when its dependencies change.

```tova
state query = ""
effect {
  results = search(query)
  render(results)
}
```

### `elif`

A chained conditional branch. Tova uses `elif`, **not** `else if`.

```tova
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

```tova
if condition {
  handle_true()
} else {
  handle_false()
}
```

### `export`

Reserved keyword. Use [`pub`](#pub) to make declarations accessible to other modules.

### `extern`

Declares an external binding provided by the host environment.

```tova
extern fn console_log(msg)
```

### `false`

The boolean false literal.

```tova
is_done = false
```

### `field`

Declares a form field inside a `form` block. Each field gets reactive value, error, and touched signals with optional validators.

```tova
form login {
  field email: String = "" {
    required("Email is required")
    email("Must be valid")
  }
}
```

See [Form Block](/fullstack/form-block) for full documentation.

### `finally`

Specifies a block that always executes after `try`/`catch`, whether or not an error occurred.

```tova
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

```tova
fn add(a, b) {
  a + b
}

double = fn(x) x * 2
```

### `for`

Iterates over a range or collection. Supports an optional second variable for key/index.

```tova
for item in items {
  print(item)
}

for i, val in items {
  print("{i}: {val}")
}
```

### `form`

Declares a reactive form controller inside a `browser {}` or `component` scope. Supports fields, groups, arrays, wizard steps, and built-in validators.

```tova
form checkout {
  field email: String = "" { required("Required") }
  group shipping {
    field street: String = "" { required("Required") }
  }
  on submit { server.placeOrder(checkout.values) }
}
```

See [Form Block](/fullstack/form-block) for full documentation.

### `from`

Specifies the module path in an import statement.

```tova
import { sqrt, PI } from "math"
```

### `group`

Declares a field group inside a `form` block. Groups namespace related fields and support conditional visibility with `when`.

```tova
form checkout {
  group shipping {
    field street: String = "" { required("Required") }
    field city: String = "" { required("Required") }
  }
  group billing {
    field sameAsShipping: Bool = true
    group address when !sameAsShipping {
      field street: String = "" { required("Required") }
    }
  }
}
```

See [Form Block](/fullstack/form-block#groups) for full documentation.

### `guard`

Asserts a condition. If the condition is false, the `else` block executes (typically returning or breaking).

```tova
fn process(input) {
  guard input != nil else {
    return Err("input is nil")
  }
  // continue with valid input
  Ok(transform(input))
}
```

### `if`

Conditional branching. Can be used as a statement or an expression.

```tova
// As statement
if ready {
  start()
}

// As expression
label = if count == 1 { "item" } else { "items" }
```

### `is`

Type-checking operator. Tests whether a value is of a given type or ADT variant at runtime. Can be negated with `is not`.

```tova
value = "hello"
value is String       // true
value is Int          // false
value is not Nil      // true

// Works with ADT variants
result = Ok(42)
result is Ok          // true
result is Err         // false
```

### `impl`

Implements methods or trait conformance for a type.

```tova
impl Point {
  fn distance(self, other) {
    sqrt((self.x - other.x) ** 2 + (self.y - other.y) ** 2)
  }
}
```

### `import`

Brings named exports from another module into the current scope.

```tova
import { map, filter, reduce } from "stdlib/collections"
```

### `in`

Tests membership or specifies the iteration target in a `for` loop.

```tova
if "admin" in roles { grant_access() }

for x in 0..10 { print(x) }
```

### `interface`

Defines a structural contract that types can implement.

```tova
interface Printable {
  fn to_string(self) -> String
}
```

### `let`

Performs destructuring binding from a value.

```tova
let { name, email } = user
let [first, ...rest] = items
```

::: warning
`let` is NOT used for simple variable declarations. Use `x = value` for simple bindings and `var x = value` for mutable variables.
:::

### `loop`

Creates an infinite loop that runs until explicitly terminated with `break`. Useful for polling, event loops, and retry patterns.

```tova
var attempts = 0
loop {
  result = try_connect()
  if result.isOk() {
    break
  }
  attempts += 1
  if attempts > 5 {
    break
  }
}
```

Labels work with `loop` for nested loop control:

```tova
outer: loop {
  inner: loop {
    if done {
      break outer
    }
  }
}
```

### `match`

Pattern matching expression. Exhaustive by design.

```tova
match result {
  Ok(value) => print(value)
  Err(msg) => print("Error: {msg}")
}
```

### `mut`

Reserved keyword that produces a compile-time error. Tova uses `var` for mutable variables instead.

```tova
// This will NOT compile:
// mut x = 10  // Error: 'mut' is not supported in Tova. Use 'var' for mutable variables

// Use 'var' instead:
var x = 10
x = 20  // OK
```

### `nil`

The absence-of-value literal, equivalent to JavaScript's `null`.

```tova
result = nil
```

### `not`

Logical NOT operator (keyword form).

```tova
if not is_empty(list) {
  process(list)
}
```

### `or`

Logical OR operator. Short-circuits: the right operand is not evaluated if the left is truthy.

```tova
name = input or "default"
```

### `pipeline`

Declares a named transform chain inside a `data {}` block. Pipelines can reference sources and other pipelines.

```tova
data {
  source users = read("users.csv")
  pipeline active = users |> where(.active)
  pipeline summary = active |> group_by(.role) |> agg(count: count())
}
```

### `pub`

Marks a declaration as publicly visible.

```tova
pub fn api_handler(req) {
  respond(200, "ok")
}
```

### `refresh`

Sets a refresh policy for a data source inside a `data {}` block. Supports interval-based or on-demand refresh.

```tova
data {
  source rates = read("https://api.example.com/rates")
  refresh rates every 1.hour

  source orders = read("orders.csv")
  refresh orders on_demand
}
```

### `return`

Explicitly returns a value from a function. Optional when the last expression is the return value.

```tova
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

```tova
server {
  route GET "/api/users" => {
    users = db.query("SELECT * FROM users")
    json(users)
  }
}
```

### `select`

Multiplexes across multiple channel operations. Waits until one case is ready, then executes its body. Supports receive, send, timeout, and default cases.

```tova
select {
    msg from ch1     => print("Got: {msg}")
    ch2.send(value)  => print("Sent")
    timeout(5000)    => print("Timed out")
    _                => print("Nothing ready")
}
```

See the [Concurrency guide](/guide/concurrency#select) for full details.

### `server`

Opens a server-side block. Code inside is compiled only for the server.

```tova
server {
  db { url: "postgres://localhost/mydb" }
  route GET "/health" => "ok"
}
```

### `shared`

Opens a block whose code is available on both server and client.

```tova
shared {
  type User {
    name: String
    email: String
  }
}
```

### `spawn`

Launches a concurrent task inside a `concurrent` block. The spawned call returns `Result<T, Error>` -- success wraps in `Ok`, exceptions wrap in `Err`.

```tova
concurrent {
    result = spawn compute(data)
    spawn log_event("started")   // fire-and-forget
}
```

See the [Concurrency guide](/guide/concurrency#spawn) for full details.

### `source`

Declares a named data source inside a `data {}` block. Sources are lazily loaded and cached.

```tova
data {
  source users = read("users.csv")
  source config = read("config.json")
  source users: Table<User> = read("users.csv")  // with type annotation
}
```

### `state`

Declares a reactive state variable in a browser block or component.

```tova
state count = 0
state name = "world"
```

### `store`

Groups related reactive state, computed values, and methods.

```tova
store TodoStore {
  state items = []
  computed count = len(items)
  fn add(text) {
    items = [...items, {text: text, done: false}]
  }
}
```

### `steps`

Declares wizard steps inside a `form` block. Each step references fields, groups, or arrays that must be valid before advancing.

```tova
form checkout {
  field email: String = "" { required("Required") }
  group shipping { /* ... */ }
  group payment { /* ... */ }

  steps {
    step "Account" { email }
    step "Shipping" { shipping }
    step "Payment" { payment }
  }
}
```

See [Form Block](/fullstack/form-block#wizard-steps) for full documentation.

### `test`

Defines a test block with a description string and body containing assertions. Tests are discovered and run by `tova test`.

```tova
test "addition works" {
  assert_eq(1 + 1, 2)
}

test "string interpolation" {
  name = "world"
  assert_eq("Hello, {name}!", "Hello, world!")
}
```

### `trait`

Defines a named set of behavior (similar to a typeclass or protocol).

```tova
trait Comparable {
  fn compare(self, other) -> Int
}
```

### `true`

The boolean true literal.

```tova
is_ready = true
```

### `try`

Begins an error-handling block. Must be followed by `catch` and optionally `finally`.

```tova
try {
  data = parse(raw_input)
} catch err {
  data = default_value
}
```

### `type`

Declares a custom type -- either a struct (product type) or an algebraic data type (sum type).

```tova
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

### `validate`

Declares validation rules for a type inside a `data {}` block. Each rule is a column predicate.

```tova
data {
  validate User {
    .email |> contains("@"),
    .name |> len() > 0,
    .age >= 0
  }
}
```

### `var`

Declares a mutable variable with an initial value.

```tova
var counter = 0
counter += 1
```

### `when`

Guard condition in `for` loops. Filters elements before the loop body executes, acting as an inline filter.

```tova
for item in items when item.active {
  process(item)
}

// Equivalent to:
for item in items {
  if item.active {
    process(item)
  }
}
```

### `while`

Loops while a condition is true.

```tova
var i = 0
while i < 10 {
  print(i)
  i += 1
}
```

### `with`

Resource management statement. Opens a resource and guarantees cleanup when the block exits, similar to a try/finally pattern.

```tova
with open("data.txt") as file {
  content = file.read()
  process(content)
}
// file is automatically cleaned up here
```

### `yield`

Yields a value from a generator function.

```tova
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

The following are **not** keywords in Tova, even though they might be expected from other languages:

| Word | Status in Tova |
|------|---------------|
| `throw` | Not a keyword. Tova uses `Result`/`Option` for error handling. |
| `class` | Not a keyword. Use `type` for data types and `impl` for methods. |
| `this` | Not a keyword. Use `self` in `impl` blocks (passed explicitly). |
| `else if` | Not valid syntax. Use `elif` instead. |
