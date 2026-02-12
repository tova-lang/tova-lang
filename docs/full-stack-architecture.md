# Full-Stack Architecture

Lux uses a unique three-block model that lets you write an entire full-stack application in a single `.lux` file. The compiler separates client, server, and shared code automatically.

## The Three-Block Model

Every Lux application can contain three types of blocks:

```lux
shared {
  // Types, validation, constants — available to BOTH client and server
}

server {
  // HTTP handlers, database, middleware — runs on the server (Bun)
}

client {
  // Reactive state, components, UI — runs in the browser
}
```

### Shared Block

The `shared` block defines types and functions available to both client and server. Use it for data contracts:

```lux
shared {
  type User {
    id: Int
    name: String
    email: String
  }

  type ApiError {
    code: Int
    message: String
  }

  fn validate_email(email: String) -> Bool {
    email.contains("@")
  }
}
```

Shared code is compiled into a separate `.shared.js` file and imported by both client and server output.

### Server Block

The `server` block runs on the server using Bun. It handles HTTP routes, database access, authentication, and business logic:

```lux
server {
  db { path: "./data.db" }
  model User

  fn get_users() -> [User] {
    UserModel.all()
  }

  fn create_user(name: String, email: String) -> User {
    UserModel.create({ name, email })
  }

  route GET "/api/users" => get_users
  route POST "/api/users" => create_user
}
```

### Client Block

The `client` block runs in the browser. It uses reactive primitives (signals, effects, computed values) and JSX-like components:

```lux
client {
  state users: [User] = []
  state name = ""

  effect {
    users = server.get_users()
  }

  component App {
    <div>
      <h1>Users</h1>
      <ul>
        for user in users {
          <li>{user.name}</li>
        }
      </ul>
    </div>
  }
}
```

## RPC Bridge

The most powerful feature of the three-block model is the automatic RPC bridge. Any function defined in a `server` block can be called from the `client` block using `server.functionName()`:

```lux
server {
  fn get_users() -> [User] {
    UserModel.all()
  }
}

client {
  effect {
    users = server.get_users()    // Compiles to: await rpc("get_users", [])
  }
}
```

The compiler automatically:
1. Generates an HTTP POST endpoint at `/rpc/<function_name>` for each server function
2. Replaces `server.functionName(args)` in client code with an async `rpc()` call
3. Serializes arguments as `{ __args: [...] }` in the request body
4. Returns `{ result: value }` from the server and unwraps it on the client

This means you write `server.get_users()` and the compiler handles all the networking boilerplate.

### How RPC Works Under the Hood

**Server side** — each function gets an RPC endpoint:

```javascript
// Generated: POST /rpc/get_users
__addRoute("POST", "/rpc/get_users", async (req) => {
  const body = await req.json();
  const args = body.__args || [];
  const result = get_users(...args);
  return Response.json({ result });
});
```

**Client side** — a Proxy-based `server` object delegates to `rpc()`:

```javascript
// server.get_users() compiles to calls through:
const server = new Proxy({}, {
  get: (_, name) => (...args) => rpc(name, args)
});

async function rpc(name, args) {
  const res = await fetch("/rpc/" + name, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ __args: args })
  });
  const data = await res.json();
  return data.result;
}
```

### RPC with Arguments

```lux
server {
  fn search_users(query: String, limit: Int) -> [User] {
    UserModel.where("name LIKE ?", "%{query}%").limit(limit)
  }
}

client {
  fn handle_search() {
    results = server.search_users(query, 10)
  }
}
```

Arguments are passed as a JSON array and spread into the server function's parameters.

## Named Blocks

For larger applications, you can run multiple server processes using **named blocks**:

```lux
server "api" {
  // REST API server
  route GET "/api/users" => get_users
}

server "events" {
  // WebSocket/SSE server
  ws { ... }
  sse "/stream" fn(send, close) { ... }
}

server "worker" {
  // Background job processor
  schedule "*/5 * * * *" fn cleanup() { ... }
}
```

### How Named Blocks Work

Each named server block compiles to its own JavaScript file and runs as a separate process:

```
.lux-out/
  app.server.api.js       # from server "api" { }
  app.server.events.js    # from server "events" { }
  app.server.worker.js    # from server "worker" { }
  app.client.js
  app.shared.js
```

### Port Assignment

Named servers get their own ports:

| Block | Default Port | Env Var |
|-------|-------------|---------|
| `server { }` (unnamed) | 3000 | `PORT` |
| `server "api" { }` | 3001 | `PORT_API` |
| `server "events" { }` | 3002 | `PORT_EVENTS` |
| `server "worker" { }` | 3003 | `PORT_WORKER` |

When an unnamed `server {}` block exists, it gets port 3000 and named blocks start from 3001. If only named blocks exist, the first one gets port 3000.

### Cross-Server Communication

Named blocks can call functions from other named blocks via service discovery:

```lux
server "api" {
  discover "events" at "http://localhost:3002"

  fn create_user(name: String) -> User {
    user = UserModel.create({ name })
    events.push_event("user_created", name)
    user
  }
}
```

## Compilation Output

When you run `lux build`, the compiler generates:

```
.lux-out/
  app.server.js       # Server code
  app.client.js       # Client code (bundled with runtime)
  app.shared.js       # Shared types and functions
  runtime/
    reactivity.js     # Reactive runtime (signals, effects, etc.)
    router.js         # Client-side router
```

### Server Output

The server file is a standalone Bun script that:
- Imports shared types
- Sets up HTTP routes (using Bun's native `Bun.serve`)
- Registers RPC endpoints for all server functions
- Configures middleware, CORS, auth, etc.
- Serves the client HTML on the root route

### Client Output

The client file is embedded into an HTML page that:
- Includes the reactive runtime (inlined)
- Imports shared types
- Initializes signals, effects, and computed values
- Mounts the root `App` component

### Dev Server

`lux dev` starts a development server that:
1. Compiles all `.lux` files
2. Inlines the reactive runtime into the client HTML
3. Serves the HTML on the root route (`/`)
4. Handles all API routes and RPC endpoints
5. Serves all configured routes and endpoints

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                   app.lux                        │
├──────────┬───────────────┬──────────────────────┤
│ shared { │  server {     │  client {            │
│   types  │    routes     │    state             │
│   utils  │    db         │    computed           │
│          │    auth       │    effects            │
│          │    functions  │    components          │
│          │  }            │  }                    │
│ }        │               │                       │
├──────────┴───────────────┴──────────────────────┤
│                 lux build                        │
├──────────┬───────────────┬──────────────────────┤
│ shared.js│  server.js    │  client.js + HTML     │
│ (types)  │  (Bun.serve)  │  (reactive runtime)   │
└──────────┴───────────────┴──────────────────────┘
             │ ← RPC bridge → │
             │  fetch() calls │
```

## Best Practices

1. **Keep shared types lean.** Only put data contracts and validation in `shared {}`. Business logic goes in `server {}`.

2. **Use named blocks for separation of concerns.** If your API and WebSocket logic are complex, split them into `server "api"` and `server "events"`.

3. **Prefer RPC over manual routes.** Use `server.functionName()` from client code instead of manually fetching API endpoints. The compiler generates efficient RPC endpoints.

4. **Type your server functions.** Adding type annotations to server function parameters enables automatic request validation.

5. **Shared validation.** Put validation functions in `shared {}` so the same validation runs on both client (for UX) and server (for security).
