# Examples

Annotated examples demonstrating Lux features, from simple to complex.

## Hello World

The simplest Lux program:

```lux
print("Hello, World!")
```

With string interpolation:

```lux
name = "Lux"
print("Hello from {name}!")
```

## Variables & Functions

```lux
// Immutable by default
x = 42
greeting = "Hello"

// Mutable with var
var count = 0
count += 1

// Functions with implicit return
fn add(a, b) {
  a + b
}

// Default parameters
fn greet(name = "World") {
  "Hello, {name}!"
}

// Type annotations
fn divide(a: Float, b: Float) -> Float {
  a / b
}

print(add(1, 2))           // 3
print(greet())              // Hello, World!
print(greet("Alice"))       // Hello, Alice!

// Multiple assignment & swap
var a = 1
var b = 2
a, b = b, a
print("a={a}, b={b}")      // a=2, b=1
```

## Pattern Matching

```lux
// Algebraic types
type Color {
  Red,
  Green,
  Blue,
  Custom(r: Int, g: Int, b: Int)
}

fn color_name(c) {
  match c {
    Red => "red"
    Green => "green"
    Blue => "blue"
    Custom(r, g, b) => "rgb({r},{g},{b})"
  }
}

print(color_name(Red))                  // "red"
print(color_name(Custom(255, 128, 0)))  // "rgb(255,128,0)"

// Range and guard patterns
fn describe(value) {
  match value {
    0 => "zero"
    1..10 => "small"
    n if n > 100 => "big: {n}"
    _ => "other"
  }
}

print(describe(0))     // "zero"
print(describe(5))     // "small"
print(describe(200))   // "big: 200"
print(describe(50))    // "other"

// Array patterns
fn first_two(list) {
  match list {
    [] => "empty"
    [x] => "one: {x}"
    [a, b] => "pair: {a}, {b}"
    _ => "many items"
  }
}
```

## List Comprehensions & Pipes

```lux
numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

// List comprehension with filter
evens = [x * 2 for x in numbers if x > 3]
print(evens)    // [8, 10, 12, 14, 16, 18, 20]

// Pipe operator
result = numbers
  |> filter(fn(x) x > 3)
  |> map(fn(x) x * 10)
  |> sum()
print("Pipe result: {result}")    // 280

// Chained comparisons
y = 5
if 1 < y < 10 {
  print("{y} is between 1 and 10")
}

// Membership test
fruits = ["apple", "banana", "cherry"]
if "banana" in fruits {
  print("We have bananas!")
}

// Dict comprehension
squares = {x: x ** 2 for x in range(5)}
// {0: 0, 1: 1, 2: 4, 3: 9, 4: 16}
```

## Counter App (Client-Only)

A reactive counter demonstrating signals, computed values, and event handling:

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
    <div class="counter-app">
      <h1>Lux Counter</h1>
      <p class="count">{count}</p>
      <p class="doubled">Doubled: {doubled}</p>
      <p class="message">{message}</p>
      <div class="buttons">
        <button on:click={fn() count -= 1}>-</button>
        <button on:click={fn() count += 1}>+</button>
        <button on:click={fn() count = 0}>Reset</button>
      </div>
    </div>
  }
}
```

## Todo App (Full-Stack)

A complete full-stack todo application:

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

  route GET "/api/todos" => get_todos
}

client {
  state todos: [Todo] = []
  state new_title = ""

  computed remaining = len([t for t in todos if not t.completed])
  computed total = len(todos)

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

  fn handle_toggle(id) {
    server.toggle_todo(id)
    todos = server.get_todos()
  }

  fn handle_delete(id) {
    server.delete_todo(id)
    todos = server.get_todos()
  }

  component TodoItem(todo) {
    <li class="todo-item">
      <input
        type="checkbox"
        checked={todo.completed}
        on:change={fn() handle_toggle(todo.id)}
      />
      <span class="todo-text">{todo.title}</span>
      <button on:click={fn() handle_delete(todo.id)}>x</button>
    </li>
  }

  component App {
    <div class="todo-app">
      <h1>Lux Todo</h1>
      <div class="input-row">
        <input
          type="text"
          placeholder="What needs to be done?"
          value={new_title}
          on:input={fn(e) new_title = e.target.value}
        />
        <button on:click={handle_add}>Add</button>
      </div>
      <ul class="todo-list">
        for todo in todos {
          <TodoItem todo={todo} />
        }
      </ul>
      <p class="status">{remaining} of {total} remaining</p>
    </div>
  }
}
```

## Multi-Server Architecture

Demonstrates named server blocks, ORM, SSE, auth, CORS, rate limiting, and WebSocket:

```lux
shared {
  type User {
    id: Int
    name: String
    email: String
  }

  type Event {
    kind: String
    data: String
    timestamp: Int
  }
}

// API server — REST endpoints with ORM
server "api" {
  health "/health"

  db { path: "./data.db" }
  model User

  cors {
    origins: ["*"]
    methods: ["GET", "POST", "PUT", "DELETE"]
    headers: ["Content-Type", "Authorization"]
  }

  auth {
    type: "jwt"
    secret: "my-secret-key"
  }

  rate_limit {
    max: 100
    window: 60
  }

  middleware fn logger(req, next) {
    result = next(req)
    result
  }

  on_error fn(err, req) {
    respond(500, { error: "Internal server error" })
  }

  fn get_users() -> [User] {
    UserModel.all()
  }

  fn create_user(name: String, email: String) -> User {
    UserModel.create({ name, email })
  }

  route GET "/api/users" => get_users
  route POST "/api/users" => create_user
  route PUT "/api/users/:id" with auth => update_user
  route DELETE "/api/users/:id" with auth, role("admin") => delete_user

  sse "/api/stream" fn(send, close) {
    send({ kind: "connected" })
  }
}

// WebSocket server — real-time events
server "events" {
  health "/health"

  var event_log = []

  ws {
    on_open fn(ws) {
      print("Client connected")
    }
    on_message fn(ws, msg) {
      print("Received: " + msg)
    }
    on_close fn(ws, code, reason) {
      print("Client disconnected")
    }
  }

  fn get_events() -> [Event] {
    event_log
  }

  fn push_event(kind: String, data: String) -> Event {
    event = Event(kind, data, 0)
    event_log = [...event_log, event]
    event
  }

  route GET "/events" => get_events
  route POST "/events" => push_event
}

// Client UI
client {
  state users: [User] = []
  state events: [Event] = []

  effect {
    users = server.get_users()
  }

  component App {
    <div class="app">
      <h1>Multi-Server Demo</h1>
      <section>
        <h2>Users (from api server)</h2>
        <ul>
          for user in users {
            <li>{user.name} ({user.email})</li>
          }
        </ul>
      </section>
      <section>
        <h2>Events (from events server)</h2>
        <ul>
          for event in events {
            <li>[{event.kind}] {event.data}</li>
          }
        </ul>
      </section>
    </div>
  }
}
```

## Database & Models

```lux
shared {
  type Post {
    id: Int
    title: String
    body: String
    author_id: Int
    published: Bool
  }
}

server {
  db { path: "./blog.db" }
  model Post

  fn get_published_posts() -> [Post] {
    PostModel.where("published = ?", true)
  }

  fn get_post(id: Int) -> Post {
    post = PostModel.find(id)
    if post == nil {
      return respond(404, { error: "Post not found" })
    }
    post
  }

  fn create_post(title: String, body: String, author_id: Int) -> Post {
    PostModel.create({
      title,
      body,
      author_id,
      published: false
    })
  }

  fn publish_post(id: Int) -> Post {
    PostModel.update(id, { published: true })
  }

  route GET "/posts" => get_published_posts
  route GET "/posts/:id" => get_post
  route POST "/posts" with auth => create_post
  route PATCH "/posts/:id/publish" with auth => publish_post
}
```

## Authentication Flow

```lux
shared {
  type User {
    id: Int
    username: String
    email: String
  }

  type LoginRequest {
    username: String
    password: String
  }
}

server {
  db { path: "./auth.db" }
  model User

  auth {
    type: "jwt"
    secret: "your-secret-key"
    expiry: 86400
  }

  fn register(username: String, email: String, password: String) {
    existing = UserModel.where("username = ?", username)
    if len(existing) > 0 {
      return respond(409, { error: "Username taken" })
    }

    hashed = hash_password(password)
    user = UserModel.create({
      username,
      email,
      password_hash: hashed
    })
    respond(201, { id: user.id, username: user.username })
  }

  fn login(username: String, password: String) {
    users = UserModel.where("username = ?", username)
    if len(users) == 0 {
      return respond(401, { error: "Invalid credentials" })
    }

    user = users[0]
    if not verify_password(password, user.password_hash) {
      return respond(401, { error: "Invalid credentials" })
    }

    token = sign_jwt({ user_id: user.id, username: user.username })
    respond(200, { token })
  }

  fn get_profile(req) {
    UserModel.find(req.user.user_id)
  }

  route POST "/auth/register" => register
  route POST "/auth/login" => login
  route GET "/auth/profile" with auth => get_profile
}
```

## Real-Time with SSE

```lux
shared {
  type ChatMessage {
    user: String
    text: String
    timestamp: Int
  }
}

server {
  var messages = []

  fn get_messages() -> [ChatMessage] {
    messages
  }

  fn post_message(user: String, text: String) -> ChatMessage {
    msg = ChatMessage(user, text, 0)
    messages = [...messages, msg]
    msg
  }

  sse "/chat/stream" fn(send, close) {
    send({ type: "connected", data: "Welcome to chat" })
  }

  route GET "/chat/messages" => get_messages
  route POST "/chat/messages" => post_message
}

client {
  state messages: [ChatMessage] = []
  state username = ""
  state text = ""

  effect {
    messages = server.get_messages()
  }

  fn send_message() {
    if text != "" and username != "" {
      server.post_message(username, text)
      text = ""
      messages = server.get_messages()
    }
  }

  component App {
    <div class="chat">
      <h1>Lux Chat</h1>
      <div class="messages">
        for msg in messages {
          <div class="message">
            <strong>{msg.user}</strong>
            <span>{msg.text}</span>
          </div>
        }
      </div>
      <div class="input-area">
        <input
          placeholder="Username"
          bind:value={username}
        />
        <input
          placeholder="Message"
          bind:value={text}
        />
        <button on:click={send_message}>Send</button>
      </div>
    </div>
  }
}
```
