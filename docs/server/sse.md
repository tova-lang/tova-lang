# Server-Sent Events

Server-Sent Events (SSE) provide a one-way channel from the server to the client over HTTP. Unlike WebSockets, SSE uses a standard HTTP connection and is natively supported by browsers via the `EventSource` API. SSE is ideal for live feeds, notifications, progress updates, and any scenario where the server pushes data to the client.

## SSE Endpoint

Declare an SSE endpoint with the `sse` keyword, a path, and a handler function that receives `send` and `close` callbacks:

```tova
server {
  sse "/events" fn(send, close) {
    send({ type: "connected", data: "Welcome" })

    // Send periodic updates
    var i = 0
    while i < 10 {
      send({ type: "update", data: "tick {i}" })
      i += 1
    }

    close()
  }
}
```

### Handler Arguments

| Argument | Description |
|----------|-------------|
| `send` | Function to push an event to the client. Accepts an object with `type` and `data` fields. |
| `close` | Function to end the SSE connection. |

### Event Format

Each event sent to the client has a `type` (maps to the SSE event name) and `data` (the payload):

```tova
send({ type: "notification", data: "You have a new message" })
send({ type: "status", data: JSON.stringify({ online: 42, active: 18 }) })
```

On the client side, the `type` determines which event listener fires.

## Client Connection

Clients connect to an SSE endpoint using the browser's built-in `EventSource` API:

```js
const source = new EventSource("/events");

source.addEventListener("connected", (e) => {
  console.log("Connected:", e.data);
});

source.addEventListener("update", (e) => {
  console.log("Update:", e.data);
});

source.addEventListener("error", (e) => {
  console.error("SSE error:", e);
});
```

In Tova client code, you can use the same API:

```tova
browser {
  source = EventSource.new("/events")

  source.addEventListener("update", fn(event) {
    print("Got update: {event.data}")
  })
}
```

## SSE Channels

For more advanced use cases, SSE channels let you manage named streams of events. Channels decouple event production from the SSE endpoint handler, so any part of your server code can push events to connected clients.

### Creating a Channel

```tova
channel = sse_channel("updates")
```

### Sending Events

Push data to all clients subscribed to the channel:

```tova
channel.send({ type: "new_data", data: payload })
```

### Checking Subscriber Count

```tova
count = channel.count()
print("Active subscribers: {count}")
```

### Channel Example

```tova
server {
  channel = sse_channel("orders")

  sse "/order-updates" fn(send, close) {
    send({ type: "connected", data: "Listening for order updates" })
    // The channel handles sending events; the connection stays open
  }

  fn create_order(req) {
    order = OrderModel.create(req.body)
    // Notify all connected SSE clients
    channel.send({ type: "new_order", data: JSON.stringify(order) })
    respond(201, order)
  }

  route POST "/api/orders" => create_order
}
```

## Live Feed Example

A practical example of a real-time activity feed:

```tova
server {
  activity_channel = sse_channel("activity")

  sse "/activity" fn(send, close) {
    send({ type: "init", data: "Connected to activity feed" })
  }

  fn create_post(req) {
    post = PostModel.create(req.body)
    activity_channel.send({
      type: "new_post",
      data: JSON.stringify({ id: post.id, title: post.title, author: post.author })
    })
    respond(201, post)
  }

  fn add_comment(req, post_id: Int) {
    comment = CommentModel.create({ post_id: post_id, ...req.body })
    activity_channel.send({
      type: "new_comment",
      data: JSON.stringify({ post_id: post_id, author: comment.author })
    })
    respond(201, comment)
  }

  route POST "/api/posts" with auth => create_post
  route POST "/api/posts/:post_id/comments" with auth => add_comment
}
```

## SSE vs WebSocket

| Feature | SSE | WebSocket |
|---------|-----|-----------|
| Direction | Server to client only | Bidirectional |
| Protocol | HTTP | WebSocket (upgraded HTTP) |
| Browser support | Built-in `EventSource` | Built-in `WebSocket` |
| Reconnection | Automatic | Manual |
| Data format | Text (UTF-8) | Text or binary |
| Best for | Notifications, live feeds, progress | Chat, games, collaboration |

Use SSE when you only need server-to-client communication. The automatic reconnection and simpler protocol make it the better choice for one-way data streams.

## Practical Tips

**Use channels for decoupled event production.** Instead of sending events directly in the SSE handler, create a channel and push events from anywhere in your server code. This keeps your SSE endpoint clean and lets multiple parts of your application contribute events.

**Send structured data.** Use `JSON.stringify` for complex payloads in the `data` field. The client can then parse them with `JSON.parse`.

**Use meaningful event types.** The `type` field maps to `EventSource` event listeners on the client. Using descriptive names like `"new_order"` or `"status_update"` makes client-side handling cleaner than routing everything through the generic `"message"` event.
