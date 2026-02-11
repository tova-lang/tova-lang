# Lux

A modern programming language that transpiles to JavaScript, unifying frontend and backend development with clean, enjoyable syntax.

## Features

- **Full-stack in one file** — `server`, `client`, and `shared` blocks
- **Immutable by default** — `x = 1` is immutable, `var x = 1` is mutable
- **Reactive UI** — built-in signals, computed values, and effects
- **Seamless RPC** — call server functions from client like regular functions
- **Pattern matching** — exhaustive `match` expressions
- **Pipe operator** — `data |> transform() |> format()`
- **Python-inspired** — comprehensions, chained comparisons, `in`/`not in`, `elif`
- **Gradual typing** — optional type annotations with inference
- **npm compatible** — use any npm package

## Quick Start

```bash
# Install
bun install -g lux-lang

# Create a new project
lux new my-app

# Run development server
cd my-app
lux dev
```

## Example

```lux
shared {
  type User {
    id: Int
    name: String
    email: String
  }
}

server {
  fn get_users() -> [User] {
    db.query("SELECT * FROM users")
  }

  route GET "/api/users" => get_users
}

client {
  state users: [User] = []

  effect {
    users = server.get_users()
  }

  component App {
    <div class="app">
      <h1>"Users"</h1>
      for user in users {
        <p>"{user.name}"</p>
      }
    </div>
  }
}
```

## Syntax Highlights

```lux
// Immutable binding
name = "Lux"

// Mutable binding
var count = 0

// Functions
fn greet(name = "world") {
  "Hello, {name}!"
}

// Pattern matching
fn describe(value) {
  match value {
    0 => "zero"
    1..10 => "small"
    n if n > 100 => "big"
    _ => "other"
  }
}

// List comprehension
evens = [x * 2 for x in range(10) if x > 0]

// Pipe operator
result = [1, 2, 3, 4, 5]
  |> filter(fn(x) x > 2)
  |> map(fn(x) x * 2)
  |> sum()

// Chained comparisons
if 1 < x < 10 {
  print("in range")
}
```

## License

MIT
