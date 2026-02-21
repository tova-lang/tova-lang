# Interactive Tutorial

Learn Tova step by step. Each lesson builds on the previous one, taking you from your first variable to a full-stack application.

## Lesson 1: Variables and Printing

Tova variables are **immutable by default**. To make a variable mutable, use `var`.

```tova
// Immutable — cannot be reassigned
name = "Alice"
age = 30
pi = 3.14159

// Print with string interpolation
print("Hello, {name}! You are {age} years old.")

// Mutable — can be reassigned
var count = 0
count += 1
count += 1
print("Count: {count}")    // Count: 2
```

**Try it:** Change `name` to your own name and run again.

::: tip Key Takeaways
- No keyword needed for immutable variables: `x = 5`
- Use `var` for mutable variables: `var x = 5`
- String interpolation uses `{expr}` inside double quotes
- Single quotes `'...'` disable interpolation
:::

---

## Lesson 2: Functions

Functions are declared with `fn`. The last expression is automatically returned.

```tova
fn add(a, b) {
  a + b
}

fn greet(name, greeting = "Hello") {
  "{greeting}, {name}!"
}

print(add(3, 4))              // 7
print(greet("Alice"))         // Hello, Alice!
print(greet("Bob", "Hey"))    // Hey, Bob!
```

### Lambdas

Anonymous functions come in two flavors:

```tova
// fn lambda
double = fn(x) x * 2

// Arrow lambda
triple = x => x * 3

// Multi-line lambda
process = fn(x) {
  cleaned = x.trim()
  cleaned.upper()
}

print(double(5))      // 10
print(triple(5))      // 15
print(process("  hi  "))  // HI
```

**Try it:** Write a function `fn square(n)` that returns `n * n`.

::: tip Key Takeaways
- `fn name(params) { body }` declares a function
- The last expression is the return value (no `return` needed)
- `fn(x) expr` and `x => expr` are anonymous function forms
- Parameters can have defaults: `greeting = "Hello"`
:::

---

## Lesson 3: Type Annotations

Tova has optional type annotations. Add them when they help readability or when you want the compiler to catch errors.

```tova
// Type annotations on variables
x: Int = 42
name: String = "Alice"
scores: [Int] = [90, 85, 92]

// Type annotations on functions
fn divide(a: Float, b: Float) -> Result<Float, String> {
  if b == 0 {
    Err("Division by zero")
  } else {
    Ok(a / b)
  }
}

// Custom types
type User {
  id: Int
  name: String
  email: String
}

alice = User(1, "Alice", "alice@example.com")
print(alice.name)     // Alice
print(alice.email)    // alice@example.com
```

**Try it:** Define a `type Book { title: String, author: String, pages: Int }` and create an instance.

::: tip Key Takeaways
- Variables: `name: Type = value`
- Function params: `fn f(x: Int) -> String { ... }`
- Custom types: `type Name { field: Type }`
- Types are optional — Tova infers what it can
:::

---

## Lesson 4: Control Flow

### If / Elif / Else

```tova
score = 85

if score >= 90 {
  print("A")
} elif score >= 80 {
  print("B")
} elif score >= 70 {
  print("C")
} else {
  print("F")
}

// if as expression
grade = if score >= 90 { "A" } elif score >= 80 { "B" } else { "C" }
print("Grade: {grade}")
```

### For Loops

```tova
fruits = ["apple", "banana", "cherry"]

for fruit in fruits {
  print("I like {fruit}")
}

// With index
for i, fruit in fruits {
  print("{i}: {fruit}")
}

// Range
for i in range(5) {
  print(i)    // 0, 1, 2, 3, 4
}
```

### Guard Clauses

```tova
fn process(value) {
  guard value != nil else {
    return Err("Value is nil")
  }
  guard value > 0 else {
    return Err("Value must be positive")
  }
  Ok(value * 2)
}

print(process(5))     // Ok(10)
print(process(-1))    // Err(Value must be positive)
print(process(nil))   // Err(Value is nil)
```

**Try it:** Write a function that takes a list of numbers and prints only the positive ones.

::: tip Key Takeaways
- Use `elif`, never `else if`
- `if` is an expression — it returns a value
- `for x in items {}` — no parentheses needed
- `for i, x in items {}` gives you the index
- `guard` flattens nested conditionals
:::

---

## Lesson 5: Pattern Matching

Pattern matching is one of Tova's most powerful features.

```tova
// Basic match
fn describe(x) {
  match x {
    0 => "zero"
    1 => "one"
    _ => "something else"
  }
}

// Range patterns
fn grade(score) {
  match score {
    90..=100 => "A"
    80..90 => "B"
    70..80 => "C"
    _ => "F"
  }
}

// With guards
fn classify(n) {
  match n {
    n if n < 0 => "negative"
    0 => "zero"
    n if n % 2 == 0 => "positive even"
    _ => "positive odd"
  }
}

print(describe(0))       // zero
print(grade(85))         // B
print(classify(-3))      // negative
print(classify(4))       // positive even
```

### Matching on ADTs

```tova
type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
}

fn area(shape) {
  match shape {
    Circle(r) => 3.14159 * r * r
    Rectangle(w, h) => w * h
  }
}

print(area(Circle(5.0)))           // 78.53975
print(area(Rectangle(4.0, 6.0)))   // 24.0
```

**Try it:** Add a `Triangle(base: Float, height: Float)` variant to `Shape` and handle it in `area`.

::: tip Key Takeaways
- `match value { pattern => result }` is an expression
- `_` is the wildcard catch-all pattern
- Range patterns: `0..10` (exclusive), `0..=10` (inclusive)
- Guards: `n if n > 0 => ...`
- ADT variants destructure naturally
:::

---

## Lesson 6: Collections and Pipes

### List Comprehensions

```tova
squares = [x * x for x in range(10)]
print(squares)    // [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]

evens = [x for x in range(20) if x % 2 == 0]
print(evens)      // [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]
```

### Slicing

```tova
items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

print(items[2:5])      // [2, 3, 4]
print(items[:3])       // [0, 1, 2]
print(items[-3:])      // [7, 8, 9]
print(items[::2])      // [0, 2, 4, 6, 8]
print(items[::-1])     // [9, 8, 7, ..., 0]
```

### Pipe Operator

The `|>` operator passes the left-hand value as the first argument to the right-hand function:

```tova
// Without pipes — nested, hard to read
result = sorted(filter(map(numbers, fn(x) x * 2), fn(x) x > 0))

// With pipes — reads top to bottom
result = numbers
  |> map(fn(x) x * 2)
  |> filter(fn(x) x > 0)
  |> sorted()

// Real-world example
active_emails = users
  |> filter(fn(u) u.active)
  |> map(fn(u) u.email)
  |> sorted()
  |> join(", ")
```

**Try it:** Use pipes to take a list of numbers, filter out negatives, double each one, and sum the result.

::: tip Key Takeaways
- `[expr for x in items if condition]` — list comprehension
- `items[start:end:step]` — Python-style slicing
- `x |> f()` is equivalent to `f(x)`
- Chain pipes for readable data transformations
:::

---

## Lesson 7: Error Handling

Tova uses `Result` and `Option` types instead of exceptions.

### Result

```tova
fn parse_age(input: String) -> Result<Int, String> {
  n = to_int(input)
  if n == nil {
    Err("Not a number: {input}")
  } elif n < 0 {
    Err("Age cannot be negative")
  } elif n > 150 {
    Err("Age seems unrealistic")
  } else {
    Ok(n)
  }
}

// Handle with match
match parse_age("25") {
  Ok(age) => print("Your age is {age}")
  Err(msg) => print("Error: {msg}")
}

// Chain with methods
display = parse_age("25")
  .map(fn(age) "Age: {age}")
  .unwrapOr("Invalid input")
print(display)    // Age: 25
```

### Error Propagation with `!`

```tova
fn process(input: String) -> Result<String, String> {
  age = parse_age(input)!        // returns Err early if it fails
  category = categorize(age)!
  Ok("You are {category}")
}
```

### Option

```tova
fn find_user(users, name) -> Option<User> {
  for user in users {
    if user.name == name {
      return Some(user)
    }
  }
  None
}

match find_user(users, "Alice") {
  Some(user) => print("Found: {user.email}")
  None => print("Not found")
}

// Or use unwrapOr for a default
email = find_user(users, "Alice")
  .map(fn(u) u.email)
  .unwrapOr("unknown@example.com")
```

**Try it:** Write a function `fn safe_divide(a, b) -> Result<Float, String>` that returns `Err` for division by zero.

::: tip Key Takeaways
- `Result<T, E>` = `Ok(value)` or `Err(error)`
- `Option<T>` = `Some(value)` or `None`
- `!` propagates errors: `risky_call()!`
- `.map()`, `.flatMap()`, `.unwrapOr()` for chaining
- No `throw` — errors are values
:::

---

## Lesson 8: The Full-Stack Model

Tova's defining feature: write server and client in one file.

```tova
shared {
  // Types available to both server and client
  type Message {
    id: Int
    text: String
    author: String
  }
}

server {
  // Server-side: HTTP routes, database
  db { path: "./chat.db" }
  model MessageModel {}

  fn get_messages() -> [Message] {
    MessageModel.all()
  }

  fn send_message(text: String, author: String) -> Message {
    MessageModel.create({ text, author })
  }
}

client {
  // Client-side: reactive UI
  state messages: [Message] = []
  state new_text = ""
  state username = "Anonymous"

  effect {
    messages = server.get_messages()
  }

  component App {
    <div class="chat">
      <h1>Chat</h1>
      <div class="messages">
        for msg in messages {
          <div class="message">
            <strong>{msg.author}</strong>: {msg.text}
          </div>
        }
      </div>
      <div class="input">
        <input bind:value={new_text} placeholder="Type a message..." />
        <button on:click={fn() {
          server.send_message(new_text, username)
          new_text = ""
          messages = server.get_messages()
        }}>Send</button>
      </div>
    </div>
  }
}
```

### How It Compiles

1. `shared {}` becomes `chat.shared.js` — imported by both sides
2. `server {}` becomes `chat.server.js` — runs on Bun with `Bun.serve()`
3. `client {}` becomes `chat.client.js` — embedded in `index.html` with the reactive runtime
4. `server.get_messages()` in client code compiles to a `fetch()` call to an auto-generated RPC endpoint

### Reactive Primitives

| Primitive | Purpose |
|-----------|---------|
| `state x = value` | Reactive signal — UI updates when it changes |
| `computed y = expr` | Derived value — auto-recomputes when dependencies change |
| `effect { ... }` | Side effect — re-runs when its dependencies change |
| `component Name { jsx }` | UI component with optional props |

### JSX in Tova

```tova
component TodoItem(todo, on_toggle) {
  <li class={if todo.done { "done" } else { "" }}>
    <input
      type="checkbox"
      checked={todo.done}
      on:change={fn() on_toggle(todo.id)}
    />
    <span>{todo.title}</span>
  </li>
}
```

::: tip Key Takeaways
- `shared {}` — types and validation for both sides
- `server {}` — routes, database, business logic (runs on Bun)
- `client {}` — reactive UI with JSX (runs in browser)
- `server.fn_name()` from client becomes an RPC call automatically
- `state`, `computed`, `effect` are the reactive primitives
- JSX uses Tova control flow (`if`, `for`) not JS expressions
:::

---

## Lesson 9: Stores and Components

### Stores

Group related state into a `store`:

```tova
client {
  store Counter {
    state count = 0
    computed doubled = count * 2
    computed is_even = count % 2 == 0

    fn increment() {
      count += 1
    }

    fn decrement() {
      count -= 1
    }

    fn reset() {
      count = 0
    }
  }
}
```

### Component Composition

```tova
component Button(label, on_click, variant = "primary") {
  <button
    class="btn btn-{variant}"
    on:click={on_click}
  >
    {label}
  </button>
}

component Counter {
  state count = 0

  <div>
    <p>Count: {count}</p>
    <Button label="+" on_click={fn() count += 1} />
    <Button label="-" on_click={fn() count -= 1} />
    <Button label="Reset" on_click={fn() count = 0} variant="secondary" />
  </div>
}
```

### Conditional and List Rendering

```tova
component UserList(users, loading) {
  if loading {
    <p>Loading...</p>
  } elif len(users) == 0 {
    <p>No users found.</p>
  } else {
    <ul>
      for user in users key={user.id} {
        <li>
          <strong>{user.name}</strong> — {user.email}
        </li>
      }
    </ul>
  }
}
```

::: tip Key Takeaways
- `store` groups related state, computed values, and functions
- Components accept props as function parameters
- Props can have defaults: `variant = "primary"`
- Use `if`/`elif`/`else` and `for` directly in JSX
- `key={expr}` on `for` loops optimizes list rendering
:::

---

## Lesson 10: Server Routes and Database

### Declaring Routes

```tova
server {
  db { path: "./app.db" }

  model User {}
  model Post {}

  // Route declarations
  route GET "/api/users" => list_users
  route POST "/api/users" => create_user
  route GET "/api/users/:id" => get_user
  route DELETE "/api/users/:id" => delete_user

  fn list_users() {
    User.all()
  }

  fn create_user(req) {
    User.create(req.body)
  }

  fn get_user(id: Int) {
    User.find(id)
  }

  fn delete_user(id: Int) {
    User.delete(id)
  }

  // Route groups
  routes "/api/v1" {
    route GET "/posts" => fn() Post.all()
    route POST "/posts" with auth => fn(req) Post.create(req.body)
  }

  // Middleware
  middleware fn auth(req, next) {
    token = req.headers["authorization"]
    if token == nil {
      return respond(401, { error: "Unauthorized" })
    }
    next(req)
  }
}
```

### Running Your App

```bash
# Create a new project
tova new my-app
cd my-app

# Start development server (hot reload)
tova dev

# Build for production
tova build --production

# Run tests
tova test
```

::: tip Key Takeaways
- `route METHOD "/path" => handler` declares HTTP routes
- `route ... with guard => handler` adds middleware
- `routes "/prefix" { ... }` groups routes under a path
- `db { path: "..." }` configures the database
- `model Name {}` creates a database model
- `tova dev` for development, `tova build` for production
:::

---

## Next Steps

You now know the fundamentals of Tova. Here is where to go next:

- **[Variables](./guide/variables)** — deep dive into bindings and destructuring
- **[Functions](./guide/functions)** — default params, destructuring params, closures
- **[Types](./guide/types)** — ADTs, generics, derive macros
- **[Pattern Matching](./guide/pattern-matching)** — all pattern forms
- **[Pipes](./guide/pipes)** — pipe operator and pipeline patterns
- **[Error Handling](./guide/error-handling)** — Result, Option, and `!` operator
- **[Full-Stack Architecture](./fullstack/architecture)** — the server/client/shared model
- **[Reactivity](./reactivity/signals)** — signals, computed, effects in depth
- **[Standard Library](./stdlib/)** — all built-in functions and modules
- **[Examples](./examples/)** — complete example applications
