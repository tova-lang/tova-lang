---
title: Multi-Server Architecture
---

# Multi-Server Architecture

Tova supports named server blocks that compile to independent processes, each running on its own port. This enables separation of concerns for complex applications.

## Full Code

Create `app.tova`:

```tova
shared {
  type User {
    id: Int
    name: String
    email: String
  }
}

shared {
  type Event {
    kind: String
    payload: String
    timestamp: String
  }
}

server "api" {
  db {
    adapter: "sqlite"
    database: "app.db"
  }

  model User {
    name: String
    email: String
  }

  // CORS middleware for API
  middleware fn cors(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  }

  // Authentication middleware
  middleware fn auth(req, res) {
    token = req.headers["authorization"]
    if token == nil {
      res.status(401)
    }
  }

  // Rate limiting middleware
  var request_count = 0

  middleware fn rate_limit(req, res) {
    if request_count >= 100 {
      res.status(429)
    }

    request_count = request_count + 1
  }

  fn list_users() -> [User] {
    User.all()
  }

  fn get_user(id) -> User {
    User.find(id)
  }

  fn create_user(name, email) -> User {
    User.create({ name: name, email: email })
  }

  route GET "/api/users" => list_users
  route GET "/api/users/:id" => get_user
  route POST "/api/users" => create_user
}

server "events" {
  var connections = []

  fn ws_connect(ws) {
    connections = [...connections, ws]

    ws.on("close", fn() {
      connections = connections |> filter(fn(c) c != ws)
    })

    ws.on("message", fn(data) {
      event = JSON.parse(data)

      // Broadcast to all other connections
      for conn in connections {
        match conn != ws {
          true => conn.send(JSON.stringify(event))
          false => nil
        }
      }
    })
  }

  fn broadcast(event) {
    data = JSON.stringify(event)
    for conn in connections {
      conn.send(data)
    }
  }

  // WebSocket route: ws_connect handles upgrade at "/ws"
  // WebSocket support uses a different pattern than HTTP routes
  route GET "/ws" => ws_connect
}

browser {
  state users = []
  state events = []
  state ws_connected = false

  // Load users from the API server
  effect {
    result = server.list_users()
    users = result
  }

  // Connect to the events WebSocket server
  effect {
    ws = WebSocket.new("ws://localhost:3001/ws")

    ws.onopen = fn() {
      ws_connected = true
    }

    ws.onmessage = fn(e) {
      event = JSON.parse(e.data)
      events = [event, ...events]
    }

    ws.onclose = fn() {
      ws_connected = false
    }
  }

  component UserItem(user) {
    <li>"{user.name} ({user.email})"</li>
  }

  component UserList {
    <div class="user-list">
      <h2>"Users"</h2>
      <ul>
        {users |> map(fn(user) UserItem(user))}
      </ul>
    </div>
  }

  component EventItem(event) {
    <li>"[{event.kind}] {event.payload}"</li>
  }

  component EventFeed {
    <div class="event-feed">
      <h2>"Live Events"</h2>
      <p class="status">
        {match ws_connected {
          true => "Connected"
          false => "Disconnected"
        }}
      </p>
      <ul>
        {events |> map(fn(event) EventItem(event))}
      </ul>
    </div>
  }

  component App {
    <div class="app">
      <header>
        <h1>"Dashboard"</h1>
      </header>

      <div class="grid">
        {UserList()}
        {EventFeed()}
      </div>
    </div>
  }
}
```

Run it:

```bash
tova dev .
```

Output:

```
  Starting server:api on port 3000
  Starting server:events on port 3001

  2 server process(es) running
    -> server:api: http://localhost:3000
    -> server:events: http://localhost:3001
```

## Walkthrough

### Named Server Blocks

```tova
server "api" {
  // REST API server
}

server "events" {
  // WebSocket server
}
```

Each named server block compiles to a separate JavaScript file and runs as its own Bun process:

| Block | Output file | Default port |
|-------|-------------|-------------|
| `server "api"` | `app.server.api.js` | 3000 |
| `server "events"` | `app.server.events.js` | 3001 |

Ports increment automatically from the base port. Override them with environment variables:

```bash
PORT_API=4000 PORT_EVENTS=4001 tova dev .
```

### Why Separate Servers?

Separating concerns into named server blocks provides several benefits:

1. **Independent scaling** -- The API server and WebSocket server can be scaled independently. If WebSocket connections are the bottleneck, scale only the events server.

2. **Isolation** -- A crash or memory leak in the events server does not affect the API server.

3. **Different protocols** -- The API server handles HTTP REST requests while the events server handles WebSocket connections. Keeping them separate avoids protocol-handling complexity.

4. **Deployment flexibility** -- In production, each server can be deployed to different machines or containers.

### Database and Models

```tova
server "api" {
  db {
    adapter: "sqlite"
    database: "app.db"
  }

  model User {
    name: String
    email: String
  }
}
```

The `db` block configures the database connection. The `model` keyword defines an ORM model that maps to a database table. Model instances provide methods like `.all()`, `.find(id)`, and `.create(fields)`.

### Middleware Stack

```tova
middleware fn cors(req, res) { ... }
middleware fn auth(req, res) { ... }
middleware fn rate_limit(req, res) { ... }
```

Middleware functions run before route handlers. They can:
- Modify the request/response (`res.setHeader(...)`)
- Short-circuit with an error (`res.status(401)`)
- Validate request data using `if` checks

### WebSocket Server

```tova
server "events" {
  var connections = []

  fn ws_connect(ws) {
    connections = [...connections, ws]

    ws.on("close", fn() {
      connections = connections |> filter(fn(c) c != ws)
    })

    ws.on("message", fn(data) {
      event = JSON.parse(data)
      for conn in connections {
        match conn != ws {
          true => conn.send(JSON.stringify(event))
          false => nil
        }
      }
    })
  }

  // WebSocket route: ws_connect handles upgrade at "/ws"
  route GET "/ws" => ws_connect
}
```

The events server manages WebSocket connections:
- New connections are tracked in the `connections` list using spread syntax
- Disconnected connections are removed via `filter`
- Messages from one connection are broadcast to all other connections
- The WebSocket upgrade is handled by the `ws_connect` function

### Client Connecting to Multiple Servers

```tova
browser {
  // REST API call to server:api
  effect {
    result = server.list_users()
    users = result
  }

  // WebSocket connection to server:events
  effect {
    ws = WebSocket.new("ws://localhost:3001/ws")
    ws.onmessage = fn(e) {
      event = JSON.parse(e.data)
      events = [event, ...events]
    }
  }
}
```

The client can consume both servers:
- RPC calls (`server.list_users()`) go to the API server
- WebSocket connections go directly to the events server

## What's Next

- Add authentication to the API server with [Auth Flow](./auth-flow.md)
- Learn about database patterns with [Database & Models](./database.md)
