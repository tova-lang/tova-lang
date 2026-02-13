---
title: Chat App
---

# Chat App

A real-time chat application using Server-Sent Events (SSE) for live message streaming from server to client.

## Full Code

Create `chat.lux`:

```lux
shared {
  type ChatMessage {
    username: String
    text: String
    timestamp: String
  }
}

server {
  mut messages = []
  mut clients = []

  fn get_messages() -> [ChatMessage] {
    messages
  }

  fn send_message(username, text) -> ChatMessage {
    msg = ChatMessage(username, text, Date.new().toISOString())
    messages = messages ++ [msg]

    // Broadcast to all connected SSE clients
    for client in clients {
      client.send(JSON.stringify(msg))
    }

    msg
  }

  fn sse_connect(req, res) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    })

    client = { send: fn(data) res.write("data: {data}\n\n") }
    clients = clients ++ [client]

    req.on("close", fn() {
      clients = clients |> filter(fn(c) c != client)
    })
  }

  route GET "/api/messages" => get_messages
  route POST "/api/messages" => send_message
  route GET "/api/events" => sse_connect
}

client {
  state messages = []
  state username = ""
  state text = ""
  state connected = false

  computed message_count = len(messages)

  // Load existing messages and connect to SSE stream
  effect {
    result = server.get_messages()
    messages = result

    // Connect to Server-Sent Events for real-time updates
    source = EventSource.new("/api/events")

    source.onmessage = fn(event) {
      msg = JSON.parse(event.data)
      messages = messages ++ [msg]
    }

    source.onopen = fn() {
      connected = true
    }

    source.onerror = fn() {
      connected = false
    }
  }

  fn handle_send() {
    guard username != "" else { return }
    guard text != "" else { return }

    server.send_message(username, text)
    text = ""
  }

  component MessageBubble(msg) {
    <div class="message">
      <span class="username">{msg.username}</span>
      <span class="text">{msg.text}</span>
      <span class="time">{msg.timestamp}</span>
    </div>
  }

  component App {
    <div class="app">
      <header>
        <h1>"Chat"</h1>
        <p class="subtitle">
          {match connected {
            true => "Connected -- {message_count} messages"
            false => "Disconnected"
          }}
        </p>
      </header>

      <div class="messages">
        {messages |> map(fn(msg) MessageBubble(msg))}
      </div>

      <div class="input-area">
        <input
          type="text"
          placeholder="Username"
          value={username}
          oninput={fn(e) username = e.target.value}
        />
        <input
          type="text"
          placeholder="Type a message..."
          value={text}
          oninput={fn(e) text = e.target.value}
          onkeydown={fn(e) {
            match e.key {
              "Enter" => handle_send()
              _ => nil
            }
          }}
        />
        <button onclick={fn() handle_send()}>"Send"</button>
      </div>
    </div>
  }
}
```

Run it:

```bash
lux dev .
```

Open multiple browser tabs at `http://localhost:3000` to see real-time messaging.

## Walkthrough

### Shared Message Type

```lux
shared {
  type ChatMessage {
    username: String
    text: String
    timestamp: String
  }
}
```

The `ChatMessage` type is shared between server and client, ensuring both sides agree on the message structure.

### Server-Side Message Storage

```lux
server {
  mut messages = []
  mut clients = []
}
```

The server maintains two mutable arrays:
- `messages` stores all chat messages for history
- `clients` tracks connected SSE clients for broadcasting

### Server-Sent Events Endpoint

```lux
fn sse_connect(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  })

  client = { send: fn(data) res.write("data: {data}\n\n") }
  clients = clients ++ [client]

  req.on("close", fn() {
    clients = clients |> filter(fn(c) c != client)
  })
}
```

The SSE endpoint:
1. Sets the appropriate headers for an event stream
2. Creates a `client` object with a `send` function that writes SSE-formatted data
3. Adds the client to the `clients` list
4. Removes the client when the connection closes

### Broadcasting Messages

```lux
fn send_message(username, text) -> ChatMessage {
  msg = ChatMessage(username, text, Date.new().toISOString())
  messages = messages ++ [msg]

  // Broadcast to all connected SSE clients
  for client in clients {
    client.send(JSON.stringify(msg))
  }

  msg
}
```

When a message is sent:
1. A new `ChatMessage` is created with a timestamp
2. It is appended to the `messages` history
3. It is broadcast to all connected SSE clients as a JSON string
4. The message is returned to the caller

### Client SSE Connection

```lux
effect {
  result = server.get_messages()
  messages = result

  source = EventSource.new("/api/events")

  source.onmessage = fn(event) {
    msg = JSON.parse(event.data)
    messages = messages ++ [msg]
  }
}
```

The client effect:
1. Fetches existing messages via RPC
2. Opens an `EventSource` connection to the SSE endpoint
3. When a new message arrives, parses it and appends it to the reactive `messages` state
4. The DOM updates automatically to show the new message

### Connection Status

```lux
state connected = false

// In effect:
source.onopen = fn() { connected = true }
source.onerror = fn() { connected = false }
```

The `connected` state tracks the SSE connection status. The header displays a different message depending on whether the client is connected or disconnected, using inline `match`:

```lux
{match connected {
  true => "Connected -- {message_count} messages"
  false => "Disconnected"
}}
```

### Guard Clauses for Validation

```lux
fn handle_send() {
  guard username != "" else { return }
  guard text != "" else { return }
  server.send_message(username, text)
  text = ""
}
```

Guard clauses validate that both `username` and `text` are non-empty before sending. This is cleaner than nested `if` blocks for sequential validation.

## What's Next

- Scale with [Multi-Server Architecture](./multi-server.md) to separate API and event handling
- Add user authentication with [Auth Flow](./auth-flow.md)
