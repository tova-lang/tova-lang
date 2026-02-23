# Named Blocks

For applications that outgrow a single server process, Tova supports **named blocks**. A named block is a `server` (or `client`) block with a string label. Each named block compiles to its own JavaScript file and runs as a separate process, letting you split your backend into multiple services within a single `.tova` file.

## Syntax

A named block has a string after the `server` keyword:

```tova
server "api" {
  // REST API server
  route GET "/api/users" => get_users
  route POST "/api/users" => create_user
}

server "events" {
  // WebSocket / SSE server for real-time
  ws { ... }
  sse "/stream" fn(send, close) { ... }
}

server "worker" {
  // Background job processor
  schedule "*/5 * * * *" fn cleanup() {
    // Run every 5 minutes
  }
}
```

An unnamed `server { }` block is the "default" server. Named blocks are additional servers that run alongside it.

## Output Structure

Each named block compiles to its own JavaScript file. For a single file named `app.tova` (or a directory of `.tova` files):

```
.tova-out/
  app.shared.js               # shared block (one file, imported by all)
  app.server.js                # unnamed server { } block (default)
  app.server.api.js            # server "api" { }
  app.server.events.js         # server "events" { }
  app.server.worker.js         # server "worker" { }
  app.client.js                # client block
  runtime/
    reactivity.js
    rpc.js
    router.js
```

Each named server file is a standalone Bun script. It imports `app.shared.js` for shared types, registers its own routes and RPC endpoints, and starts its own `Bun.serve()` instance.

### Named Blocks Across Files

In multi-file projects, named blocks with the same name from different files in the same directory are merged. For example:

```
src/
  api-routes.tova      # server "api" { route GET "/users" => ... }
  api-models.tova      # server "api" { model User { ... } }
```

Both `server "api"` blocks merge into a single `src.server.api.js` output. The same duplicate detection rules apply -- if both files define a function with the same name, the compiler reports an error.

## Port Assignment

Each server process needs its own port. Tova assigns ports automatically:

| Block | Default Port | Environment Variable |
|-------|-------------|---------------------|
| `server { }` (unnamed/default) | 3000 | `PORT` |
| `server "api" { }` | 3001 | `PORT_API` |
| `server "events" { }` | 3002 | `PORT_EVENTS` |
| `server "worker" { }` | 3003 | `PORT_WORKER` |

**Rules:**
- When an unnamed `server {}` block exists, it gets port 3000 and named blocks start from 3001.
- If only named blocks exist (no unnamed `server {}`), the first named block gets port 3000.
- Port numbers increment in the order blocks appear in the file.
- Ports can be overridden with environment variables: `PORT`, `PORT_API`, `PORT_EVENTS`, etc.

The environment variable name is derived from the block name: uppercase, non-alphanumeric characters replaced with underscores, prefixed with `PORT_`.

### Custom Base Port

Use the `--port` flag to change the starting port:

```bash
tova dev --port 8000
# default server -> 8000
# server "api"  -> 8001
# server "events" -> 8002
```

## Running Named Blocks

### Development

`tova dev` automatically compiles all blocks, spawns each named server as a separate Bun child process, and reports their ports:

```
  Tova dev server starting...

  Compiled 1 file(s)
  Output: .tova-out/
  Starting server on port 3000
  Starting server:api on port 3001
  Starting server:events on port 3002
  Starting server:worker on port 3003

  4 server process(es) running
    -> server: http://localhost:3000
    -> server:api: http://localhost:3001
    -> server:events: http://localhost:3002
    -> server:worker: http://localhost:3003
```

File watching rebuilds all blocks and restarts all processes when any `.tova` file changes.

### Production

`tova build` generates the files. You run each one manually or with a process manager:

```bash
tova build

# Run each server
PORT=3000 bun run .tova-out/app.server.js &
PORT_API=3001 bun run .tova-out/app.server.api.js &
PORT_EVENTS=3002 bun run .tova-out/app.server.events.js &
PORT_WORKER=3003 bun run .tova-out/app.server.worker.js &
```

## Cross-Server Communication

Named blocks can call functions defined in other named blocks using the `discover` directive. This sets up inter-service RPC:

```tova
server "api" {
  discover "events" at "http://localhost:3002"

  fn create_user(name: String) -> User {
    user = UserModel.create({ name })
    // Call a function on the "events" server
    events.push_event("user_created", user.name)
    user
  }
}

server "events" {
  fn push_event(event_type: String, data: String) {
    broadcast(event_type, data)
  }
}
```

When the `api` server calls `events.push_event(...)`, the compiler generates an HTTP call to `POST http://localhost:3002/rpc/push_event`, just like client-to-server RPC but between servers.

### How Discover Works

The `discover` directive tells the compiler that this server block needs to call functions on another named block. The compiler generates:

1. A base URL constant for the peer server (from the `at` URL or the environment variable)
2. A proxy object with methods for each function the peer exports
3. HTTP fetch calls routed through the RPC endpoint pattern (`/rpc/<function_name>`)

```tova
server "api" {
  discover "events" at "http://localhost:3002"
}
```

Generates:

```javascript
const events = {
  __baseUrl: "http://localhost:3002",
  async push_event(...args) {
    // ... (see circuit breaker section below)
    const res = await fetch(`${events.__baseUrl}/rpc/push_event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ __args: args }),
    });
    return (await res.json()).result;
  },
};
```

### Environment Variable Override

The base URL can be overridden at runtime using an environment variable derived from the peer name:

```bash
# Override the events server URL
PORT_EVENTS=4000 bun run .tova-out/app.server.api.js
```

If no `discover` directive provides a URL, the compiler falls back to `http://localhost:${process.env.PORT_<NAME>}`.

## Circuit Breaker

Cross-server RPC calls include an automatic circuit breaker to handle failures gracefully. If a peer server is down or slow, the circuit breaker prevents cascading failures:

```tova
server "api" {
  discover "events" at "http://localhost:3002" {
    threshold: 5          // Open circuit after 5 failures
    reset_timeout: 30000  // Try again after 30 seconds
    timeout: 10000        // Individual call timeout: 10 seconds
  }
}
```

The circuit breaker has three states:

| State | Behavior |
|-------|----------|
| **CLOSED** | Normal operation. Calls go through to the peer. |
| **OPEN** | Too many failures. Calls fail immediately without attempting the request. |
| **HALF-OPEN** | After `reset_timeout`, one call is allowed through to test if the peer has recovered. |

### Default Values

If no circuit breaker configuration is specified, the defaults are:

- `threshold`: 5 failures
- `reset_timeout`: 30000 ms (30 seconds)
- `timeout`: 10000 ms (10 seconds)

### Retry with Backoff

Cross-server calls also include automatic retry with exponential backoff. Failed calls are retried up to 2 times with increasing delays (100ms, 200ms, 400ms) before the failure counts against the circuit breaker.

## Request Tracing

Cross-server RPC calls automatically propagate a request ID via the `X-Request-Id` header. This enables distributed tracing across named blocks:

```javascript
// Generated cross-server call includes:
headers: {
  'Content-Type': 'application/json',
  'X-Request-Id': __getRequestId() || ''
}
```

## Event Bus

Named blocks can subscribe to events published by other blocks:

```tova
server "api" {
  discover "events" at "http://localhost:3002"

  fn create_user(name: String) -> User {
    user = UserModel.create({ name })
    emit "user_created" { user_id: user.id, name: user.name }
    user
  }
}

server "events" {
  subscribe "user_created" fn(data) {
    broadcast("new_user", data)
  }
}
```

Events are delivered via a special `POST /rpc/__event` endpoint that the compiler generates on servers with subscriptions. The emitting server fans out the event to all known peer URLs.

## Example: Multi-Server Application

Here is a complete example with three named servers:

```tova
shared {
  type User { id: Int, name: String, email: String }
  type Message { id: Int, sender_id: Int, text: String }
}

server "api" {
  db { path: "./data.db" }
  model User

  discover "realtime" at "http://localhost:3002"

  fn get_users() -> [User] {
    UserModel.all()
  }

  fn create_user(name: String, email: String) -> User {
    user = UserModel.create({ name, email })
    realtime.notify("user_joined", user.name)
    user
  }
}

server "realtime" {
  fn notify(event: String, data: String) {
    broadcast(event, { message: data })
  }

  ws {
    on_open fn(socket) {
      print("Client connected")
    }
    on_message fn(socket, msg) {
      broadcast("chat", msg)
    }
  }
}

server "worker" {
  discover "api" at "http://localhost:3001"

  schedule "0 * * * *" fn hourly_report() {
    users = api.get_users()
    print("Total users: {len(users)}")
  }
}

client {
  state users: [User] = []

  effect {
    users = server.get_users()
  }

  component App {
    <div>
      <h1>Users ({len(users)})</h1>
      <ul>
        for user in users {
          <li>{user.name}</li>
        }
      </ul>
    </div>
  }
}
```

This produces:

```
.tova-out/
  app.shared.js
  app.server.api.js       # Port 3000 (first named, no default)
  app.server.realtime.js   # Port 3001
  app.server.worker.js     # Port 3002
  app.client.js
```

## Best Practices

### Split by Concern, Not by Feature

Each named block should own one architectural concern: the API layer, the real-time layer, the background processing layer. Avoid splitting by feature (e.g., "users" and "posts") unless you genuinely need separate processes.

### Keep Shared Types Central

All servers import `app.shared.js`. Put types used across services in the shared block so every server agrees on data shapes.

### Use Circuit Breaker Configuration

Always configure circuit breaker settings for production deployments. The defaults are reasonable, but tuning `threshold`, `reset_timeout`, and `timeout` for your specific latency requirements prevents cascading failures.

### Prefer Named Blocks Over Separate Files

Tova named blocks give you the benefits of microservices (independent scaling, fault isolation) with the development experience of a monolith (single file, shared types, compiler-verified cross-service calls).

## Related Pages

- [Architecture Overview](./architecture) -- the three-block model
- [Server Block](./server-block) -- single-server reference
- [RPC Bridge](./rpc) -- how client-to-server RPC works
- [Compilation](./compilation) -- build output structure
