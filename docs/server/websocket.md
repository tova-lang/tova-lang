# WebSocket

Tova servers support WebSocket connections for real-time, bidirectional communication. The `ws` block defines event handlers for the WebSocket lifecycle, and built-in room management makes it straightforward to build chat applications, live dashboards, and collaborative tools.

## WebSocket Block

Declare a `ws` block inside your server with handlers for each lifecycle event:

```tova
server {
  ws {
    on_open fn(ws) {
      print("Client connected")
      ws.send("Welcome!")
    }

    on_message fn(ws, message) {
      print("Received: {message}")
      ws.send("Echo: {message}")
    }

    on_close fn(ws, code, reason) {
      print("Disconnected: {code} - {reason}")
    }

    on_error fn(ws, error) {
      print("Error: {error}")
    }
  }
}
```

### Lifecycle Events

| Event | Handler Signature | Description |
|-------|-------------------|-------------|
| `on_open` | `fn(ws)` | Called when a client establishes a connection |
| `on_message` | `fn(ws, message)` | Called when a message is received from the client |
| `on_close` | `fn(ws, code, reason)` | Called when the connection closes |
| `on_error` | `fn(ws, error)` | Called when a WebSocket error occurs |

All four handlers are optional. Define only the ones you need.

## Sending Messages

Use `ws.send(data)` to send a message to a specific connected client:

```tova
on_message fn(ws, message) {
  // Parse the incoming message
  data = JSON.parse(message)

  // Process and respond
  result = process(data)
  ws.send(JSON.stringify({ type: "result", data: result }))
}
```

## Room-Based Messaging

Rooms let you organize connected clients into named groups. This is the foundation for features like chat rooms, topic subscriptions, and scoped broadcasts.

### Joining and Leaving Rooms

```tova
join(ws, "room_name")      // add a client to a room
leave(ws, "room_name")     // remove a client from a room
```

### Broadcasting

Send a message to all connected clients, or to all clients in a specific room:

```tova
broadcast(data)                          // send to all connected clients
broadcast(data, ws)                      // send to all except the sender
broadcast_to("room_name", data)          // send to all clients in a room
broadcast_to("room_name", data, ws)      // send to all in room except the sender
```

The optional `exclude` parameter (typically `ws`) prevents the sender from receiving their own message.

### Room Functions

| Function | Description |
|----------|-------------|
| `join(ws, room)` | Add a WebSocket connection to a room |
| `leave(ws, room)` | Remove a WebSocket connection from a room |
| `broadcast(data, exclude?)` | Send to all connected clients |
| `broadcast_to(room, data, exclude?)` | Send to all clients in a specific room |

## Chat Room Example

Here is a complete chat application using rooms:

```tova
server {
  ws {
    on_open fn(ws) {
      join(ws, "general")
      broadcast_to("general", JSON.stringify({
        type: "system",
        text: "A new user joined"
      }), ws)
      ws.send(JSON.stringify({
        type: "system",
        text: "Welcome to the chat!"
      }))
    }

    on_message fn(ws, message) {
      data = JSON.parse(message)

      match data.type {
        "chat" => {
          broadcast_to("general", JSON.stringify({
            type: "chat",
            user: data.user,
            text: data.text
          }), ws)
        }
        "join_room" => {
          leave(ws, "general")
          join(ws, data.room)
          ws.send(JSON.stringify({
            type: "system",
            text: "Joined room: {data.room}"
          }))
        }
        _ => {
          ws.send(JSON.stringify({
            type: "error",
            text: "Unknown message type"
          }))
        }
      }
    }

    on_close fn(ws, code, reason) {
      broadcast_to("general", JSON.stringify({
        type: "system",
        text: "A user left the chat"
      }))
    }

    on_error fn(ws, error) {
      print("WebSocket error: {error}")
    }
  }
}
```

## Live Dashboard Example

WebSockets are well-suited for pushing live data to clients:

```tova
server {
  ws {
    on_open fn(ws) {
      join(ws, "dashboard")
      // Send initial state
      stats = get_current_stats()
      ws.send(JSON.stringify({ type: "init", data: stats }))
    }

    on_message fn(ws, message) {
      data = JSON.parse(message)
      match data.action {
        "subscribe" => join(ws, data.channel)
        "unsubscribe" => leave(ws, data.channel)
        _ => ws.send(JSON.stringify({ type: "error", text: "Unknown action" }))
      }
    }

    on_close fn(ws, code, reason) {
      leave(ws, "dashboard")
    }
  }

  // Elsewhere in the server, push updates to connected dashboards:
  fn update_stats() {
    stats = compute_stats()
    broadcast_to("dashboard", JSON.stringify({ type: "update", data: stats }))
  }
}
```

## Practical Tips

**Use rooms for scoped communication.** Instead of broadcasting to every connected client and filtering on the client side, use rooms to send messages only to interested clients. This reduces bandwidth and simplifies client logic.

**Serialize messages as JSON.** WebSocket messages are strings. Use `JSON.stringify` on the server and `JSON.parse` on the client to maintain a structured message format.

**Handle disconnections gracefully.** Clients can disconnect at any time. Use `on_close` to clean up state, leave rooms, and notify other clients as needed.

**Exclude the sender when echoing.** When broadcasting a chat message, pass the sender's `ws` as the exclude parameter to prevent them from receiving their own message.
