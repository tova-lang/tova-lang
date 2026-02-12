# Getting Started

## Prerequisites

Lux requires [Bun](https://bun.sh/) as its runtime. Install Bun if you haven't already:

```bash
curl -fsSL https://bun.sh/install | bash
```

## Installation

Clone and link the Lux compiler:

```bash
git clone https://github.com/lux-lang/lux-lang.git
cd lux-lang
bun install
bun link
```

## Your First Lux Program

Create a file called `hello.lux`:

```lux
name = "World"
print("Hello, {name}!")

fn add(a, b) {
  a + b
}

print("1 + 2 = {add(1, 2)}")
```

Run it:

```bash
lux run hello.lux
```

Output:

```
Hello, World!
1 + 2 = 3
```

## Project Structure

A typical Lux project:

```
my-app/
├── src/
│   └── app.lux            # Main application (shared + server + client)
├── package.json
└── README.md
```

After building (`lux build`), compiled output goes to `.lux-out/`. If using a database, `data.db` is auto-created at runtime.

## CLI Quick Reference

| Command | Description |
|---------|-------------|
| `lux new <name>` | Create a new Lux project |
| `lux dev [dir]` | Start development server |
| `lux build [dir]` | Compile `.lux` files to JavaScript |
| `lux run <file>` | Compile and execute a `.lux` file |
| `lux migrate:create <name>` | Create a database migration |
| `lux migrate:up [file]` | Run pending migrations |
| `lux migrate:status [file]` | Show migration status |
| `lux --help` | Show help |
| `lux --version` | Show version |

See the [CLI Reference](cli-reference.md) for all commands and flags.

## Key Concepts

### 1. Immutable by Default

```lux
name = "Alice"        // immutable — cannot be reassigned
var count = 0         // mutable — can be reassigned
count += 1            // OK
```

### 2. Three Blocks, One File

| Block | Runs on | Purpose |
|-------|---------|---------|
| `shared { }` | Both | Types, validation, constants |
| `server { }` | Server (Bun) | API routes, database, business logic |
| `client { }` | Browser | Reactive UI, components, state |

### 3. Seamless Server Calls

Server functions are callable from client code transparently:

```lux
server {
  fn get_users() { db.query("SELECT * FROM users") }
}

client {
  effect {
    users = server.get_users()  // auto-generates HTTP RPC call
  }
}
```

### 4. Reactive UI with Signals

```lux
client {
  state count = 0
  computed doubled = count * 2

  component Counter {
    <div>
      <p>{count} (doubled: {doubled})</p>
      <button on:click={fn() count += 1}>+</button>
    </div>
  }
}
```

### 5. Pattern Matching

```lux
fn describe(value) {
  match value {
    0 => "zero"
    1..10 => "small"
    n if n > 100 => "big: {n}"
    _ => "other"
  }
}
```

### 6. Python-Inspired Features

```lux
evens = [x * 2 for x in range(10) if x > 0]   // list comprehension
if 1 < score < 100 { print("valid") }           // chained comparison
if "admin" in roles { grant_access() }           // membership test
```

## Tutorial: Counter App

Create `counter.lux`:

```lux
client {
  state count = 0

  computed doubled = count * 2
  computed message = match count {
    0 => "Click the button!"
    1..5 => "Keep going..."
    n if n >= 10 => "You're on fire!"
    _ => "Nice!"
  }

  component App {
    <div>
      <h1>Lux Counter</h1>
      <p>{count}</p>
      <p>Doubled: {doubled}</p>
      <p>{message}</p>
      <button on:click={fn() count -= 1}>-</button>
      <button on:click={fn() count += 1}>+</button>
      <button on:click={fn() count = 0}>Reset</button>
    </div>
  }
}
```

Run with `lux dev .` and open your browser.

## Tutorial: Full-Stack Todo App

Create `todo.lux`:

```lux
shared {
  type Todo {
    id: Int
    title: String
    completed: Bool
  }
}

server {
  var todos = []
  var next_id = 1

  fn get_todos() -> [Todo] {
    todos
  }

  fn add_todo(title: String) -> Todo {
    todo = Todo(next_id, title, false)
    next_id += 1
    todos = [...todos, todo]
    todo
  }

  fn toggle_todo(id: Int) -> Todo {
    for t in todos {
      if t.id == id {
        return Todo(t.id, t.title, not t.completed)
      }
    }
    nil
  }

  fn delete_todo(id: Int) {
    todos = [t for t in todos if t.id != id]
  }
}

client {
  state todos: [Todo] = []
  state new_title = ""

  computed remaining = len([t for t in todos if not t.completed])

  effect {
    todos = server.get_todos()
  }

  fn handle_add() {
    if new_title != "" {
      server.add_todo(new_title)
      new_title = ""
      todos = server.get_todos()
    }
  }

  component App {
    <div>
      <h1>Todos</h1>
      <div>
        <input
          type="text"
          value={new_title}
          on:input={fn(e) new_title = e.target.value}
        />
        <button on:click={handle_add}>Add</button>
      </div>
      <ul>
        for todo in todos {
          <li>{todo.title}</li>
        }
      </ul>
      <p>{remaining} remaining</p>
    </div>
  }
}
```

Run with `lux dev .` for a full-stack todo app with:

- **Shared types** ensuring client and server agree on data shapes
- **Server functions** automatically exposed as RPC endpoints
- **`server.get_todos()`** called transparently from client code
- **Reactive UI** that updates when state changes

## Using npm Packages

Lux outputs standard JavaScript, so any npm package works:

```lux
import { z } from "zod"
import dayjs from "dayjs"

schema = z.object({
  name: z.string(),
  age: z.number()
})
```

## Next Steps

- [Language Reference](language-reference.md) — complete syntax and semantics
- [Reactivity](reactivity.md) — deep dive into reactive UI
- [Server Reference](server-reference.md) — databases, auth, middleware
- [Full-Stack Architecture](full-stack-architecture.md) — the three-block model
- [Examples](examples.md) — annotated real-world examples
