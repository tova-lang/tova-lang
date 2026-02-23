---
title: Cookbook
---

# Cookbook

Practical recipes for common tasks. Each recipe is self-contained: copy it, adapt it, ship it.

## Recipe 1: Build a REST API

A JSON API with CRUD routes, input validation, and error handling.

### Setup

```bash
tova new my-api --template api
cd my-api
```

### Define Your Types

```tova
shared {
  type Article {
    id: Int
    title: String
    body: String
    author: String
    published: Bool
  }

  fn validate_article(title: String, body: String) -> Result<Bool, String> {
    guard len(title) >= 3 else {
      return Err("Title must be at least 3 characters")
    }
    guard len(title) <= 200 else {
      return Err("Title must be under 200 characters")
    }
    guard len(body) >= 10 else {
      return Err("Body must be at least 10 characters")
    }
    Ok(true)
  }
}
```

### Define Routes and Handlers

```tova
server {
  db { path: "./articles.db" }
  model ArticleModel {}

  cors {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }

  // List all articles
  route GET "/api/articles" => fn() {
    ArticleModel.all()
  }

  // Get single article
  route GET "/api/articles/:id" => fn(id: Int) {
    article = ArticleModel.find(id)
    if article == nil {
      respond(404, { error: "Article not found" })
    } else {
      respond(200, article)
    }
  }

  // Create article with validation
  route POST "/api/articles" body: Article => fn(req) {
    let { title, body, author } = req.body

    match validate_article(title, body) {
      Err(msg) => respond(400, { error: msg })
      Ok(_) => {
        article = ArticleModel.create({
          title, body, author, published: false
        })
        respond(201, article)
      }
    }
  }

  // Update article
  route PUT "/api/articles/:id" => fn(id: Int, req) {
    existing = ArticleModel.find(id)
    if existing == nil {
      return respond(404, { error: "Article not found" })
    }
    updated = ArticleModel.update(id, req.body)
    respond(200, updated)
  }

  // Delete article
  route DELETE "/api/articles/:id" => fn(id: Int) {
    ArticleModel.delete(id)
    respond(204, nil)
  }

  // Route group with versioning
  routes "/api/v2/articles" {
    route GET "/" => fn() {
      articles = ArticleModel.all()
      respond(200, {
        data: articles,
        count: len(articles),
        version: "2"
      })
    }
  }
}
```

### Run It

```bash
tova dev
# Server starts at http://localhost:3000

# Test with curl:
curl http://localhost:3000/api/articles
curl -X POST http://localhost:3000/api/articles \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello","body":"My first article content","author":"Alice"}'
```

---

## Recipe 2: Build a Real-Time Chat

Server-Sent Events for live message streaming, with a reactive client.

### Server: Messages and SSE

```tova
shared {
  type ChatMessage {
    id: Int
    text: String
    author: String
    timestamp: String
  }
}

server {
  db { path: "./chat.db" }
  model MessageModel {}

  // Fetch recent messages
  fn get_messages(limit: Int = 50) -> [ChatMessage] {
    MessageModel.all()
      |> sorted(fn(a, b) b.id - a.id)
      |> take(limit)
      |> reversed()
  }

  // Send a message (called via RPC from client)
  fn send_message(text: String, author: String) -> ChatMessage {
    MessageModel.create({
      text,
      author,
      timestamp: dt.now() |> dt.format("HH:mm:ss")
    })
  }

  // SSE endpoint for live updates
  sse "/api/chat/stream" fn(req, send) {
    // Poll for new messages every 2 seconds
    var last_id = 0
    while true {
      messages = MessageModel.all()
        |> filter(fn(m) m.id > last_id)

      if len(messages) > 0 {
        last_id = messages[len(messages) - 1].id
        for msg in messages {
          send(json.stringify(msg))
        }
      }
      await Bun.sleep(2000)
    }
  }

  route GET "/api/messages" => get_messages
}
```

### Client: Reactive Chat UI

```tova
client {
  state messages: [ChatMessage] = []
  state new_text = ""
  state username = "Anonymous"

  // Load initial messages
  effect {
    messages = server.get_messages()
  }

  // Listen for new messages via SSE
  effect {
    source = EventSource.new("/api/chat/stream")
    source.onmessage = fn(event) {
      msg = json.parse(event.data)
      messages = [...messages, msg]
    }
  }

  fn handle_send() {
    guard len(new_text.trim()) > 0 else { return }
    server.send_message(new_text, username)
    new_text = ""
  }

  component App {
    <div class="chat-app">
      <div class="messages">
        for msg in messages key={msg.id} {
          <div class="message">
            <span class="author">{msg.author}</span>
            <span class="time">{msg.timestamp}</span>
            <p>{msg.text}</p>
          </div>
        }
      </div>
      <form on:submit={fn(e) {
        e.preventDefault()
        handle_send()
      }}>
        <input bind:value={new_text} placeholder="Type a message..." />
        <button type="submit">Send</button>
      </form>
    </div>
  }
}
```

---

## Recipe 3: Handle File Uploads

Accept and serve uploaded files with validation.

### Server: Upload Endpoint

```tova
server {
  // Configure upload limits
  upload {
    max_size: 10_000_000,       // 10 MB
    allowed_types: ["image/png", "image/jpeg", "image/webp", "application/pdf"]
  }

  // Serve uploaded files
  static "/uploads" => "./uploads"

  // Upload handler
  route POST "/api/upload" with auth => fn(req) {
    file = req.file
    if file == nil {
      return respond(400, { error: "No file provided" })
    }

    // Validate file type
    allowed = ["image/png", "image/jpeg", "image/webp", "application/pdf"]
    if file.type not in allowed {
      return respond(400, { error: "File type not allowed: {file.type}" })
    }

    // Validate file size (10 MB max)
    if file.size > 10_000_000 {
      return respond(400, { error: "File too large (max 10 MB)" })
    }

    // Save file
    filename = "{dt.now() |> dt.format("yyyyMMdd_HHmmss")}_{file.name}"
    path = "./uploads/{filename}"
    await Bun.write(path, file)

    respond(201, {
      filename: filename,
      url: "/uploads/{filename}",
      size: file.size,
      type: file.type
    })
  }

  // List uploaded files
  route GET "/api/uploads" => fn() {
    files = fs.read_dir("./uploads")
      |> filter(fn(f) not f.starts_with("."))
      |> map(fn(f) {
        stat = fs.stat("./uploads/{f}")
        { name: f, url: "/uploads/{f}", size: stat.size }
      })
    respond(200, files)
  }
}
```

### Client: Upload Form

```tova
client {
  state selected_file = nil
  state upload_result = nil
  state uploading = false

  async fn handle_upload() {
    guard selected_file != nil else { return }
    uploading = true

    form_data = FormData.new()
    form_data.append("file", selected_file)

    try {
      response = await fetch("/api/upload", {
        method: "POST",
        body: form_data
      })
      data = await response.json()
      upload_result = data
    } catch err {
      upload_result = { error: err.message }
    }

    uploading = false
  }

  component UploadForm {
    <div class="upload-form">
      <input
        type="file"
        accept="image/*,.pdf"
        on:change={fn(e) {
          selected_file = e.target.files[0]
        }}
      />
      <button
        on:click={fn() handle_upload()}
        disabled={selected_file == nil or uploading}
      >
        if uploading { "Uploading..." } else { "Upload" }
      </button>

      if upload_result != nil {
        if upload_result.error != nil {
          <p class="error">{upload_result.error}</p>
        } else {
          <div class="success">
            <p>Uploaded: {upload_result.filename}</p>
            <img src={upload_result.url} alt="Preview" />
          </div>
        }
      }
    </div>
  }
}
```

---

## Recipe 4: Add Authentication

JWT-based authentication with registration, login, and protected routes.

### Shared: User Types and Validation

```tova
shared {
  type User {
    id: Int
    username: String
    email: String
  }

  type LoginRequest {
    email: String
    password: String
  }

  type RegisterRequest {
    username: String
    email: String
    password: String
  }

  fn validate_email(email: String) -> Bool {
    email.contains("@") and len(email) >= 5
  }

  fn validate_password(password: String) -> Result<Bool, String> {
    if len(password) < 8 {
      Err("Password must be at least 8 characters")
    } elif not re.test('[A-Z]', password) {
      Err("Password must contain an uppercase letter")
    } elif not re.test('[0-9]', password) {
      Err("Password must contain a number")
    } else {
      Ok(true)
    }
  }
}
```

### Server: Auth Endpoints and Middleware

```tova
server {
  db { path: "./auth.db" }
  model UserModel {}

  // JWT configuration
  auth {
    secret: env("JWT_SECRET", "change-me-in-production"),
    expiry: 86400    // 24 hours
  }

  // Auth middleware — checks JWT and attaches user to request
  middleware fn require_auth(req, next) {
    token = req.headers["authorization"]
    if token == nil {
      return respond(401, { error: "No token provided" })
    }

    // Strip "Bearer " prefix
    token = token.replace("Bearer ", "")

    try {
      payload = jwt.verify(token, env("JWT_SECRET", "change-me-in-production"))
      req.user = payload
      next(req)
    } catch err {
      respond(401, { error: "Invalid token" })
    }
  }

  // Register
  route POST "/api/auth/register" body: RegisterRequest => fn(req) {
    let { username, email, password } = req.body

    // Validate
    if not validate_email(email) {
      return respond(400, { error: "Invalid email" })
    }
    match validate_password(password) {
      Err(msg) => return respond(400, { error: msg })
      Ok(_) => {}
    }

    // Check if user exists
    existing = UserModel.where({ email: email })
    if len(existing) > 0 {
      return respond(409, { error: "Email already registered" })
    }

    // Hash password and create user
    hashed = await Bun.password.hash(password)
    user = UserModel.create({ username, email, password_hash: hashed })

    // Generate JWT
    token = jwt.sign({ id: user.id, email: user.email }, env("JWT_SECRET", "change-me-in-production"))

    respond(201, {
      user: { id: user.id, username: user.username, email: user.email },
      token: token
    })
  }

  // Login
  route POST "/api/auth/login" body: LoginRequest => fn(req) {
    let { email, password } = req.body

    users = UserModel.where({ email: email })
    if len(users) == 0 {
      return respond(401, { error: "Invalid credentials" })
    }

    user = users[0]
    valid = await Bun.password.verify(password, user.password_hash)
    if not valid {
      return respond(401, { error: "Invalid credentials" })
    }

    token = jwt.sign({ id: user.id, email: user.email }, env("JWT_SECRET", "change-me-in-production"))

    respond(200, {
      user: { id: user.id, username: user.username, email: user.email },
      token: token
    })
  }

  // Protected route
  route GET "/api/me" with require_auth => fn(req) {
    user = UserModel.find(req.user.id)
    respond(200, { id: user.id, username: user.username, email: user.email })
  }

  // Protected resource
  routes "/api/admin" {
    route GET "/users" with require_auth => fn() {
      UserModel.all()
        |> map(fn(u) { id: u.id, username: u.username, email: u.email })
    }
  }
}
```

### Client: Login and Registration Forms

```tova
client {
  state current_user: User = nil
  state token: String = nil
  state auth_error = ""
  state page = "login"    // "login" | "register" | "dashboard"

  // Check for stored token on load
  effect {
    stored = localStorage.getItem("token")
    if stored != nil {
      token = stored
      try {
        response = await fetch("/api/me", {
          headers: { "Authorization": "Bearer {stored}" }
        })
        if response.ok {
          current_user = await response.json()
          page = "dashboard"
        }
      } catch _ {}
    }
  }

  async fn login(email, password) {
    auth_error = ""
    try {
      response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      })
      data = await response.json()
      if response.ok {
        token = data.token
        current_user = data.user
        localStorage.setItem("token", data.token)
        page = "dashboard"
      } else {
        auth_error = data.error
      }
    } catch err {
      auth_error = "Network error: {err.message}"
    }
  }

  async fn register(username, email, password) {
    auth_error = ""
    match validate_password(password) {
      Err(msg) => {
        auth_error = msg
        return
      }
      Ok(_) => {}
    }

    try {
      response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password })
      })
      data = await response.json()
      if response.ok {
        token = data.token
        current_user = data.user
        localStorage.setItem("token", data.token)
        page = "dashboard"
      } else {
        auth_error = data.error
      }
    } catch err {
      auth_error = "Network error: {err.message}"
    }
  }

  fn logout() {
    current_user = nil
    token = nil
    localStorage.removeItem("token")
    page = "login"
  }

  component LoginForm {
    state email = ""
    state password = ""

    <form on:submit={fn(e) {
      e.preventDefault()
      login(email, password)
    }}>
      <h2>Login</h2>
      if auth_error != "" {
        <p class="error">{auth_error}</p>
      }
      <input bind:value={email} type="email" placeholder="Email" />
      <input bind:value={password} type="password" placeholder="Password" />
      <button type="submit">Login</button>
      <p>
        No account?
        <a on:click={fn() page = "register"}>Register</a>
      </p>
    </form>
  }

  component RegisterForm {
    state username = ""
    state email = ""
    state password = ""

    <form on:submit={fn(e) {
      e.preventDefault()
      register(username, email, password)
    }}>
      <h2>Register</h2>
      if auth_error != "" {
        <p class="error">{auth_error}</p>
      }
      <input bind:value={username} placeholder="Username" />
      <input bind:value={email} type="email" placeholder="Email" />
      <input bind:value={password} type="password" placeholder="Password" />
      <button type="submit">Register</button>
      <p>
        Have an account?
        <a on:click={fn() page = "login"}>Login</a>
      </p>
    </form>
  }

  component Dashboard {
    <div>
      <h2>Welcome, {current_user.username}!</h2>
      <p>Email: {current_user.email}</p>
      <button on:click={fn() logout()}>Logout</button>
    </div>
  }

  component App {
    match page {
      "login" => <LoginForm />
      "register" => <RegisterForm />
      "dashboard" => <Dashboard />
      _ => <LoginForm />
    }
  }
}
```

---

## Recipe 5: WebSocket Communication

Bi-directional real-time communication.

```tova
server {
  ws {
    on_open fn(ws) {
      print("Client connected")
      ws.send(json.stringify({ type: "welcome", message: "Connected!" }))
    }

    on_message fn(ws, message) {
      data = json.parse(message)
      match data.type {
        "ping" => ws.send(json.stringify({ type: "pong" }))
        "broadcast" => {
          // Echo to all connected clients
          ws.publish("chat", message)
        }
        _ => ws.send(json.stringify({ type: "error", message: "Unknown type" }))
      }
    }

    on_close fn(ws) {
      print("Client disconnected")
    }
  }
}

client {
  state connected = false
  state messages = []

  effect {
    socket = WebSocket.new("ws://localhost:3000/ws")

    socket.onopen = fn() {
      connected = true
    }

    socket.onmessage = fn(event) {
      data = json.parse(event.data)
      messages = [...messages, data]
    }

    socket.onclose = fn() {
      connected = false
    }
  }
}
```

---

## Recipe 6: Background Jobs and Scheduling

Run tasks on a schedule or in the background.

```tova
server {
  // Run every 5 minutes
  schedule "*/5 * * * *" fn cleanup_expired_sessions() {
    expired = SessionModel.where("expires_at < ?", dt.now())
    for session in expired {
      SessionModel.delete(session.id)
    }
    print("Cleaned {len(expired)} expired sessions")
  }

  // Run daily at midnight
  schedule "0 0 * * *" fn daily_report() {
    users = UserModel.all()
    active_today = users
      |> filter(fn(u) u.last_login >= dt.today())
    print("Daily active users: {len(active_today)}")
  }

  // Background job (runs once, off the request path)
  background fn send_welcome_email(user_id: Int) {
    user = UserModel.find(user_id)
    await email.send({
      to: user.email,
      subject: "Welcome to our app!",
      body: "Hello {user.username}, thanks for signing up!"
    })
  }

  // Trigger background job from a route
  route POST "/api/users" => fn(req) {
    user = UserModel.create(req.body)
    send_welcome_email(user.id)    // runs in background
    respond(201, user)
  }

  // Lifecycle hooks
  on_start fn() {
    print("Server starting...")
  }

  on_stop fn() {
    print("Server shutting down, cleaning up...")
  }
}
```

---

## Recipe 7: Data Pipeline with Pipes

Process and transform data using pipes.

```tova
// Process a CSV file
fn process_sales_data(csv_path) {
  raw = fs.read_text(csv_path)

  sales = raw
    |> trim()
    |> split("\n")
    |> map(fn(line) split(line, ","))
    |> filter(fn(row) len(row) == 4)      // skip malformed rows
    |> map(fn(row) {
      { date: row[0], region: row[1], product: row[2], amount: to_float(row[3]) }
    })

  // Aggregate by region
  by_region = {}
  for sale in sales {
    if sale.region not in by_region {
      by_region[sale.region] = { total: 0.0, count: 0 }
    }
    by_region[sale.region].total += sale.amount
    by_region[sale.region].count += 1
  }

  // Report
  for region, data in by_region {
    avg = data.total / data.count
    print("{region}: {data.count} sales, total ${data.total}, avg ${avg}")
  }

  // Top 10 sales
  top_10 = sales
    |> sorted(fn(a, b) b.amount - a.amount)
    |> take(10)

  print("\nTop 10 sales:")
  for i, sale in top_10 {
    print("  {i + 1}. {sale.product} in {sale.region}: ${sale.amount}")
  }
}
```

---

## Recipe 8: CLI Tool with Pattern Matching

A command-line utility that parses arguments and processes files.

```tova
fn main(args) {
  match args {
    ["count", path] => count_lines(path)
    ["search", pattern, path] => search_file(pattern, path)
    ["replace", old, new, path] => replace_in_file(old, new, path)
    ["stats", path] => file_stats(path)
    _ => {
      print("Usage:")
      print("  tova run tool.tova count <file>")
      print("  tova run tool.tova search <pattern> <file>")
      print("  tova run tool.tova replace <old> <new> <file>")
      print("  tova run tool.tova stats <file>")
    }
  }
}

fn count_lines(path) {
  content = fs.read_text(path)
  lines = content |> split("\n")
  print("{len(lines)} lines in {path}")
}

fn search_file(pattern, path) {
  content = fs.read_text(path)
  lines = content |> split("\n")
  for i, line in lines {
    if line.contains(pattern) {
      print("{i + 1}: {line}")
    }
  }
}

fn replace_in_file(old, new, path) {
  content = fs.read_text(path)
  updated = content.replace(old, new)
  fs.write_text(path, updated)
  count = len(content.split(old)) - 1
  print("Replaced {count} occurrences of '{old}' with '{new}'")
}

fn file_stats(path) {
  content = fs.read_text(path)
  lines = content |> split("\n")
  words = content |> words()
  chars = content |> chars()

  print("File: {path}")
  print("  Lines: {len(lines)}")
  print("  Words: {len(words)}")
  print("  Characters: {len(chars)}")
  print("  Size: {len(content)} bytes")
}
```
