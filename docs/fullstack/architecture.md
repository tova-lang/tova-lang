# Architecture Overview

Tova is a full-stack language where a single `.tova` file contains everything needed for both the server and the client. The compiler reads the file, splits it into separate outputs, and wires them together automatically -- including a transparent RPC bridge that lets client code call server functions as if they were local.

## The Four-Block Model

Every Tova application is organized into four kinds of blocks:

```tova
shared {
  // Types, validation, constants -- available to BOTH client and server
}

data {
  // Data sources, pipelines, validation, refresh policies
}

server {
  // HTTP routes, database, auth, business logic -- runs on Bun
}

client {
  // Reactive state, components, UI -- runs in the browser
}
```

You can write all four in a single file, or spread them across multiple files in the same directory. The compiler merges same-type blocks from all files in a directory, then separates them at build time.

### Shared Block

The `shared` block defines data types, validation functions, and constants that must be identical on both sides. When the compiler processes a `.tova` file, the shared block is emitted as its own JavaScript module (e.g., `app.shared.js`) and imported by both the server and client outputs.

**Runtime environment:** None (it is library code imported by both runtimes).

Typical contents:
- Type definitions (`type User { id: Int, name: String }`)
- Validation functions (`fn validate_email(email) { ... }`)
- Constants and enums
- Shared utility functions

### Data Block

The `data` block declares data sources, reusable transform pipelines, validation rules, and refresh policies. It centralizes your data layer so that server functions can reference named pipelines directly.

**Runtime environment:** Server (data block code runs alongside server code).

Typical contents:
- Source declarations (`source users = read("users.csv")`)
- Named pipelines (`pipeline clean = users |> drop_nil(.email)`)
- Validation rules (`validate User { .email |> contains("@") }`)
- Refresh policies (`refresh users every 15.minutes`)

See [Data Block](./data-block) for full documentation.

### Server Block

The `server` block contains everything that runs on the server. It compiles to a standalone Bun script that starts an HTTP server via `Bun.serve`.

**Runtime environment:** [Bun](https://bun.sh) (server-side JavaScript runtime).

Typical contents:
- Route declarations (`route GET "/api/users" => handler`)
- Database configuration and models (`db { path: "./data.db" }`)
- Server functions that become RPC endpoints
- Middleware, authentication, authorization
- WebSocket and SSE handlers
- Background jobs and scheduled tasks

### Client Block

The `client` block contains everything that runs in the browser. It compiles to a JavaScript module that is embedded into an HTML page along with the Tova reactive runtime.

**Runtime environment:** Browser.

Typical contents:
- Reactive state (`state count = 0`)
- Computed values (`computed total = price * quantity`)
- Effects (`effect { users = server.get_users() }`)
- Components with JSX (`component App { <div>...</div> }`)
- Event handlers and UI logic

## How Compilation Works

When you run `tova build`, the compiler performs the following steps:

1. **Group** `.tova` files by directory
2. **Merge** same-type blocks from all files in each directory into a unified AST
3. **Validate** the merged AST for duplicate declarations across files
4. **Generate** JavaScript for each block type using its specialized code generator
5. **Wire** the RPC bridge -- server functions get HTTP endpoints, client code gets a `server` proxy
6. **Output** separate files to the `.tova-out/` directory

For a single-file project, this is identical to the previous behavior. For multi-file projects, the merge step combines blocks before code generation:

```
                         tova build
                            |
                            v
  +-----------------------------------------------------------+
  |  types.tova    server.tova   components.tova   app.tova   |
  |                                                           |
  |  shared { }    server { }    client { }        client { } |
  +-----------------------------------------------------------+
                            |
                     merge by type
                            |
              +-------------+-------------+
              |             |             |
              v             v             v
        src.shared.js  src.server.js  src.client.js
        (types, utils) (Bun.serve,   (reactive runtime,
                        RPC endpoints, signals, effects,
                        data layer,    components, RPC proxy)
                        routes, db,
                        AI clients)
                            |             |
                            +------+------+
                                   |
                              index.html
                       (client JS + runtime inlined)
```

Components defined in any file within the directory are available to all other files without imports. The `App` component in `app.tova` can reference `StatsBar` from `components.tova` directly.

The server output imports `app.shared.js` for type definitions. The client output also imports `app.shared.js`. Both sides have identical type definitions and validation logic without any duplication.

## The RPC Bridge

The most powerful part of the three-block model is the automatic RPC (Remote Procedure Call) bridge. Any function defined in a `server` block can be called from the `client` block using `server.function_name()`:

```tova
server {
  fn get_users() -> [User] {
    UserModel.all()
  }

  fn create_user(name: String, email: String) -> User {
    UserModel.create({ name, email })
  }
}

client {
  state users: [User] = []

  effect {
    users = server.get_users()
  }

  fn handle_submit() {
    new_user = server.create_user(name, email)
    users = [...users, new_user]
  }
}
```

Under the hood, the compiler:

1. **Server side:** Generates a `POST /rpc/get_users` endpoint for each server function. The endpoint reads `{ __args: [...] }` from the request body, spreads args into the function, and returns `{ result: value }`.

2. **Client side:** Creates a `server` Proxy object. When you write `server.get_users()`, the proxy intercepts the call and delegates to an async `rpc()` function that performs a `fetch()` to the corresponding endpoint.

The result is that you write `server.get_users()` and the compiler handles all the networking, serialization, and deserialization. See [RPC Bridge](./rpc) for full details.

## Architecture Diagram

Here is the complete picture of how a Tova application runs:

```
  Browser                                    Server (Bun)
  ========                                   ============

  index.html
    |
    v
  +--------------------------+               +---------------------------+
  | app.client.js            |               | app.server.js             |
  |                          |               |                           |
  | - createSignal()         |   HTTP POST   | - Bun.serve()             |
  | - createEffect()         | ------------> | - RPC endpoints           |
  | - components (JSX)       |  /rpc/<name>  | - route handlers          |
  | - server.fn_name()       | <------------ | - database access         |
  |   (via rpc() proxy)      |  { result }   | - middleware              |
  |                          |               |                           |
  | imports:                 |               | imports:                  |
  |   app.shared.js          |               |   app.shared.js           |
  |   runtime/reactivity.js  |               |                           |
  |   runtime/rpc.js         |               |                           |
  +--------------------------+               +---------------------------+
              |                                          |
              +------------------------------------------+
                               |
                         app.shared.js
                         (types, validation, constants)
```

## Best Practices

### Keep Shared Lean

Only put data contracts and pure validation in `shared {}`. Business logic, database calls, and anything with side effects belongs in `server {}`. UI state and rendering belongs in `client {}`.

```tova
// Good: shared contains only types and validation
shared {
  type User { id: Int, name: String, email: String }

  fn validate_email(email: String) -> Bool {
    email.contains("@") && email.length() > 3
  }
}

// Bad: don't put business logic in shared
shared {
  fn create_user(name, email) {  // This belongs in server {}
    UserModel.create({ name, email })
  }
}
```

### Type Your Server Functions

Adding type annotations to server function parameters enables automatic request validation. The compiler generates validation code that checks types before executing the function:

```tova
server {
  // With types: compiler auto-validates that name is String, age is Int
  fn create_user(name: String, age: Int) -> User {
    UserModel.create({ name, age })
  }
}
```

If a client sends incorrect types, the RPC endpoint returns a 400 error with validation details before the function body ever executes.

### Shared Validation for Both Sides

Put validation functions in `shared {}` so the same logic runs on both the client (for instant UX feedback) and the server (for security):

```tova
shared {
  fn validate_email(email: String) -> Bool {
    email.contains("@") && email.length() > 3
  }

  fn validate_name(name: String) -> Bool {
    name.length() >= 2 && name.length() <= 100
  }
}

client {
  fn handle_submit() {
    guard validate_email(email) else { show_error("Invalid email") }
    guard validate_name(name) else { show_error("Name too short") }
    server.create_user(name, email)
  }
}

server {
  fn create_user(name: String, email: String) -> User {
    guard validate_email(email) else { return error("Invalid email") }
    guard validate_name(name) else { return error("Invalid name") }
    UserModel.create({ name, email })
  }
}
```

### Prefer RPC Over Manual Routes

Use `server.function_name()` from client code instead of manually fetching API endpoints. The compiler generates efficient RPC endpoints automatically and handles serialization for you.

```tova
// Preferred: let the compiler handle networking
client {
  fn load_data() {
    users = server.get_users()
  }
}

// Avoid: manual fetch calls bypass the RPC bridge
client {
  fn load_data() {
    response = fetch("/api/users")   // Manual -- no type safety, no auto-wiring
    users = response.json()
  }
}
```

## Next Steps

- [Shared Block](./shared-block) -- deep dive into shared types and validation
- [Data Block](./data-block) -- sources, pipelines, validation, and refresh policies
- [Server Block](./server-block) -- routes, database, and server functions
- [Client Block](./client-block) -- reactive UI and components
- [RPC Bridge](./rpc) -- how the automatic RPC system works
- [Named Blocks](./named-blocks) -- multi-server architecture
- [Compilation](./compilation) -- build output and production optimization
