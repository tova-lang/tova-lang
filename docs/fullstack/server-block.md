# Server Block

The `server` block defines everything that runs on the server. It compiles to a standalone Bun script that starts an HTTP server using `Bun.serve`, registers route handlers, sets up database connections, and exposes RPC endpoints for any functions the client needs to call.

## Purpose

The server block is where your application's backend logic lives:

- **HTTP routes** -- handle REST API requests
- **Database access** -- connect to SQLite/databases, define models
- **Server functions** -- business logic callable from the client via RPC
- **Authentication and middleware** -- protect routes and validate requests
- **WebSocket and SSE** -- real-time communication
- **Background jobs** -- scheduled tasks and workers

## Basic Structure

```tova
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

This compiles to a Bun HTTP server that:
- Opens a SQLite database at `./data.db`
- Registers a `User` model
- Creates two route handlers for `GET /api/users` and `POST /api/users`
- Automatically generates `POST /rpc/get_users` and `POST /rpc/create_user` endpoints for client RPC calls

## Server Functions and RPC

Every function defined in a `server` block automatically gets an RPC endpoint. This is the primary way the client communicates with the server:

```tova
server {
  fn get_users() -> [User] {
    UserModel.all()
  }

  fn search_users(query: String, limit: Int) -> [User] {
    UserModel.where("name LIKE ?", "%{query}%").limit(limit)
  }

  fn create_user(name: String, email: String) -> User {
    guard validate_email(email) else {
      return error("Invalid email address")
    }
    UserModel.create({ name, email })
  }
}
```

The compiler generates:
- `POST /rpc/get_users` -- calls `get_users()`, returns `{ result: [...] }`
- `POST /rpc/search_users` -- extracts `query` and `limit` from the request body, calls `search_users(query, limit)`
- `POST /rpc/create_user` -- extracts `name` and `email`, runs validation, calls `create_user(name, email)`

From the client, these are called as `server.get_users()`, `server.search_users("alice", 10)`, etc. See [RPC Bridge](./rpc) for the full details.

### Type-Based Validation

When you annotate server function parameters with types, the compiler generates automatic validation code in the RPC endpoint:

```tova
server {
  fn create_user(name: String, age: Int, active: Bool) -> User {
    UserModel.create({ name, age, active })
  }
}
```

The generated endpoint checks:
- `name` is required and must be a string
- `age` is required and must be an integer
- `active` is required and must be a boolean

If validation fails, the endpoint returns a `400` response with details before the function body executes.

## Routes

Routes map HTTP methods and paths to handler functions:

```tova
server {
  route GET "/api/users" => list_users
  route POST "/api/users" => create_user
  route GET "/api/users/:id" => get_user
  route PUT "/api/users/:id" => update_user
  route DELETE "/api/users/:id" => delete_user
}
```

Supported HTTP methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`.

### Path Parameters

Path segments prefixed with `:` are extracted and passed as arguments:

```tova
server {
  route GET "/api/users/:id" => get_user

  fn get_user(id: String) {
    UserModel.find(id)
  }
}
```

With type annotations, parameters are automatically parsed and validated:

```tova
server {
  fn get_user(id: Int) {
    UserModel.find(id)  // id is auto-parsed as Int
  }
}
```

### Route Guards

The `with` keyword attaches middleware or guards to specific routes:

```tova
server {
  route GET "/admin/users" with auth => list_users
  route DELETE "/api/users/:id" with auth, role("admin") => delete_user
}
```

## Database

The `db` declaration sets up a database connection:

```tova
server {
  db { path: "./data.db" }

  model User
  model Post
}
```

Models provide an ORM-like interface for querying:

```tova
server {
  fn get_all_users() -> [User] {
    UserModel.all()
  }

  fn find_user(id: Int) -> User {
    UserModel.find(id)
  }

  fn search(query: String) -> [User] {
    UserModel.where("name LIKE ?", "%{query}%")
  }
}
```

## Middleware

Middleware functions run before route handlers:

```tova
server {
  middleware fn log_request(req) {
    print("{req.method} {req.url}")
  }

  middleware fn cors(req) {
    // CORS headers added automatically
  }
}
```

## Authentication

Built-in auth support with JWT:

```tova
server {
  auth {
    secret: "my-secret-key"
    algorithm: "HS256"
  }

  fn protected_action() {
    // Only accessible with valid token
  }

  route GET "/api/me" with auth => get_profile
}
```

## WebSocket

Real-time bidirectional communication:

```tova
server {
  ws {
    on_open fn(socket) {
      print("Client connected")
    }

    on_message fn(socket, message) {
      socket.send("Echo: {message}")
    }

    on_close fn(socket) {
      print("Client disconnected")
    }
  }
}
```

## Server-Sent Events

One-way streaming from server to client:

```tova
server {
  sse "/events" fn(send, close) {
    send("connected", { status: "ok" })

    // Send periodic updates
    every 5.seconds() {
      send("heartbeat", { time: Date.now() })
    }
  }
}
```

## Health Checks

Built-in health endpoint:

```tova
server {
  health "/healthz"
}
```

Generates a `GET /healthz` endpoint that returns `{ "status": "ok", "uptime": ... }`.

## Error Handling

Custom error handlers for unhandled errors:

```tova
server {
  on_error fn(error, req) {
    print("Error: {error.message}")
    { status: 500, body: "Internal Server Error" }
  }
}
```

## Configuration

Server configuration with environment variables:

```tova
server {
  config {
    port: 3000
    host: "0.0.0.0"
  }
}
```

The port can be overridden with the `PORT` environment variable.

## Compilation Output

The server block compiles to a standalone Bun script. For `app.tova`:

```
.tova-out/
  app.server.js    <-- standalone Bun.serve script
```

The generated file:
1. Imports shared types from `app.shared.js`
2. Defines all server functions
3. Registers RPC endpoints (`POST /rpc/<name>`) for each function
4. Registers explicit routes (`GET /api/users`, etc.)
5. Starts the server with `Bun.serve()`
6. Serves the client HTML on the root route (`/`)

Run it with:

```bash
bun run .tova-out/app.server.js
```

Or use the dev server which handles this automatically:

```bash
tova dev
```

## Related Pages

- [Architecture Overview](./architecture) -- how the three-block model works
- [RPC Bridge](./rpc) -- how server functions become callable from the client
- [Named Blocks](./named-blocks) -- running multiple server processes
- [Compilation](./compilation) -- build output details
- [Shared Block](./shared-block) -- types and validation shared with the client
- [Form Block](./form-block) -- full-stack form validation with type-level validators

For detailed reference on each server feature, see the Server Reference pages:
- [Routes](/server/routes)
- [Middleware](/server/middleware)
- [Database](/server/database)
- [Models](/server/models)
- [Authentication](/server/auth)
- [WebSocket](/server/websocket)
- [Server-Sent Events](/server/sse)
- [Configuration](/server/configuration)
