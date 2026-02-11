# Getting Started with Lux

## Prerequisites

- [Bun](https://bun.sh) v1.0+ installed

## Installation

```bash
# Clone the Lux compiler
git clone https://github.com/lux-lang/lux-lang.git
cd lux-lang
bun install

# Link the CLI globally
bun link
```

## Create Your First Project

```bash
lux new my-app
cd my-app
bun install
```

This creates:

```
my-app/
├── package.json
├── README.md
└── src/
    └── app.lux
```

## Your First Lux File

Open `src/app.lux`:

```lux
shared {
  type Message {
    text: String
  }
}

server {
  fn get_message() -> Message {
    Message("Hello from Lux!")
  }

  route GET "/api/message" => get_message
}

client {
  state message = ""

  effect {
    result = server.get_message()
    message = result.text
  }

  component App {
    <div class="app">
      <h1>"Welcome to {message}"</h1>
      <p>"Edit src/app.lux to get started."</p>
    </div>
  }
}
```

## Build & Run

```bash
# Development mode (compile + serve)
lux dev src

# Build to JavaScript
lux build src

# Run a single file
lux run examples/hello.lux
```

## Key Concepts

### 1. Everything is Immutable by Default

```lux
name = "Alice"        // immutable — cannot be reassigned
var count = 0         // mutable — can be reassigned
count += 1            // OK
name = "Bob"          // ERROR: cannot reassign immutable variable
```

### 2. Three Blocks, One File

| Block | Runs on | Purpose |
|-------|---------|---------|
| `shared { }` | Both | Types, validation, utilities |
| `server { }` | Server (Bun/Hono) | API routes, database, business logic |
| `client { }` | Browser | Reactive UI, components, state |

### 3. Seamless Server Calls

Server functions are callable from client code as if they were local:

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
  state count = 0                          // reactive signal
  computed doubled = count * 2             // auto-updates when count changes
  effect { print("Count: {count}") }       // runs when count changes

  component Counter {
    <div>
      <p>"{count} (doubled: {doubled})"</p>
      <button on:click={fn() count += 1}>"+"</button>
    </div>
  }
}
```

### 5. Pattern Matching

```lux
fn handle(result) {
  match result {
    Ok(value) => print("Success: {value}")
    Err(msg) if msg == "404" => print("Not found")
    Err(msg) => print("Error: {msg}")
  }
}
```

### 6. Python-Inspired Goodies

```lux
evens = [x * 2 for x in range(10) if x > 0]
if 1 < score < 100 { print("valid") }
if "admin" in roles { grant_access() }
```

## Project Structure

A typical Lux project:

```
my-app/
├── package.json
├── src/
│   ├── app.lux          # Main application (shared + server + client)
│   ├── auth.lux          # Authentication module
│   └── models.lux        # Shared type definitions
├── .lux-out/             # Compiled JavaScript output
│   ├── app.server.js
│   ├── app.client.js
│   ├── app.shared.js
│   └── index.html
└── tests/
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `lux new <name>` | Create a new Lux project |
| `lux build [dir]` | Compile .lux files to JavaScript |
| `lux dev [dir]` | Start dev server with hot reload |
| `lux run <file>` | Compile and execute a .lux file |
| `lux --help` | Show help |
| `lux --version` | Show version |

## npm Packages

Lux outputs standard JavaScript, so you can use any npm package:

```lux
import { z } from "zod"
import dayjs from "dayjs"

schema = z.object({
  name: z.string(),
  age: z.number()
})
```

## What's Next

- Read the [Syntax Reference](./syntax.md) for the full language spec
- Explore the [examples/](../examples/) directory
- Build something awesome!
