<script setup>
const sharedTypeCode = `// Shared types: available to both server and browser
shared {
  type User {
    id: Int
    name: String
    email: String
    role: String
  }

  type Todo {
    id: Int
    title: String
    done: Bool
    owner_id: Int
  }

  type ApiResponse {
    Ok(data)
    Error(message: String)
  }
}

// Both server and browser can use these types
user = User { id: 1, name: "Alice", email: "alice@example.com", role: "admin" }
print("User: {user.name} ({user.role})")

todo = Todo { id: 1, title: "Learn Tova", done: false, owner_id: 1 }
print("Todo: {todo.title} — done: {todo.done}")`

const securityCode = `// Security block: centralized security policy
// This is declared at the top level of your .tova file

// security {
//   auth {
//     provider: "jwt"
//     secret: env("JWT_SECRET")
//   }
//
//   roles {
//     admin: ["manage_users", "delete_content"]
//     editor: ["edit_content", "publish"]
//     viewer: ["read"]
//   }
//
//   protect {
//     "/admin/*": { require: "admin" }
//     "/api/posts": { require: "editor", methods: ["POST", "PUT"] }
//     "/api/*": { require: "viewer" }
//   }
//
//   cors {
//     origins: ["https://myapp.com"]
//     methods: ["GET", "POST", "PUT", "DELETE"]
//   }
//
//   csrf { enabled: true }
//
//   rate_limit {
//     window: 60
//     max: 100
//   }
// }

// The compiler generates all middleware automatically:
// - JWT verification on protected routes
// - Role checking before handlers execute
// - CORS headers on every response
// - CSRF token validation on mutations
// - Rate limiting per IP

print("Security is declarative in Tova.")
print("No middleware wiring. No auth libraries.")
print("One block. Complete protection.")`

const formCode = `// Form blocks: first-class forms in browser scope
// Forms are declared with validation built in

// form signup {
//   field name: String {
//     required
//     minLength(2)
//     maxLength(50)
//   }
//
//   field email: String {
//     required
//     email
//   }
//
//   field password: String {
//     required
//     minLength(8)
//     pattern("[A-Z]", "Must contain uppercase")
//   }
//
//   field confirm_password: String {
//     required
//     matches(password)
//   }
// }

// Each field generates a signal triple:
//   signup.name.value     — the current value
//   signup.name.error     — validation error (or null)
//   signup.name.touched   — has the user interacted?

// In JSX:
// <form bind:form={signup}>
//   <input value={signup.name.value}
//          onInput={signup.name.set} />
//   {signup.name.error && <span>{signup.name.error}</span>}
//
//   <button disabled={!signup.valid}>Sign Up</button>
// </form>

print("Forms in Tova are declarative.")
print("Validation runs on both client AND server.")
print("No form libraries needed.")`

const rpcCode = `// RPC: calling server functions from browser code

// In a full-stack .tova file:
// server {
//   fn get_todos(user_id: Int) -> [Todo] {
//     db.query("SELECT * FROM todos WHERE owner_id = ?", [user_id])
//   }
//
//   fn create_todo(title: String, owner_id: Int) -> Todo {
//     db.query("INSERT INTO todos (title, owner_id) VALUES (?, ?)",
//              [title, owner_id])
//   }
// }
//
// browser {
//   async fn load_todos() {
//     // The compiler generates the fetch call automatically
//     result = await rpc(get_todos, current_user.id)
//     match result {
//       Ok(todos) => set_todos(todos)
//       Err(msg) => set_error(msg)
//     }
//   }
//
//   async fn add_todo(title) {
//     result = await rpc(create_todo, title, current_user.id)
//     match result {
//       Ok(todo) => set_todos(append(todos(), [todo]))
//       Err(msg) => set_error(msg)
//     }
//   }
// }

// rpc() is type-safe: the compiler checks that you pass
// the right arguments for the server function.
// Under the hood it generates a fetch() to /api/get_todos
// with proper serialization, auth headers, and error handling.

print("RPC bridges server and browser.")
print("Type-safe. Auto-serialized. Auth-aware.")`

const fullProjectCode = `// Full-Stack Todo App — everything in one file
// This example shows the complete pattern

// ===== Shared Types =====
// shared {
//   type Todo {
//     id: Int
//     title: String
//     done: Bool
//     owner_id: Int
//   }
// }

// ===== Validation =====
fn validate_title(title) {
  cleaned = trim(title)
  if len(cleaned) == 0 {
    Err("Title cannot be empty")
  } elif len(cleaned) > 200 {
    Err("Title too long (max 200 characters)")
  } else {
    Ok(cleaned)
  }
}

// Test the validator
tests = ["", "Buy milk", repeat("x", 201)]
for input in tests {
  result = validate_title(input)
  match result {
    Ok(title) => print("Valid: {title}")
    Err(msg) => print("Invalid: {msg}")
  }
}

print("")
print("In a full-stack app, validate_title runs")
print("on the browser (instant feedback) AND")
print("on the server (security enforcement).")`
</script>

# Chapter 15: Full-Stack Applications

Most web frameworks make you juggle two separate codebases -- a server project and a client project -- with a REST API stitched between them. Types drift apart. Validation logic gets duplicated. Security is an afterthought bolted on with middleware.

Tova takes a different approach. You write your entire application in one file (or one project), with shared types, declarative security, first-class forms, and type-safe RPC between server and browser. The compiler sorts out what runs where.

By the end of this chapter, you'll build a full-stack Todo application with shared types, server routes, a reactive browser UI, form validation, and a complete security policy.

## Shared Types

The `shared` block defines types that are available to both server and browser code:

```tova
shared {
  type User {
    id: Int
    name: String
    email: String
    role: String
  }

  type Todo {
    id: Int
    title: String
    done: Bool
    owner_id: Int
  }

  type CreateTodoRequest {
    title: String
  }
}
```

When the compiler processes a `shared` block, it emits the type definitions into both the server output and the browser output. You write the type once. Both sides see it. They never drift apart.

```tova
shared {
  type ApiError {
    NotFound(message: String)
    Unauthorized(message: String)
    ValidationFailed(errors: [String])
  }
}
```

This is especially powerful for error types. Your server returns `ValidationFailed(errors)`, and your browser code can match on it directly -- no ad-hoc JSON parsing, no guessing at field names.

<TryInPlayground :code="sharedTypeCode" label="Shared Types" />

::: tip Why Shared Types Matter
In a typical TypeScript full-stack app, you might define `User` in three places: the database schema, the API response type, and the frontend model. When one changes, the others silently break. Shared types eliminate this entire class of bugs.
:::

## Server + Browser in One File

The full-stack pattern puts everything in a single `.tova` file:

```tova
shared {
  type Todo {
    id: Int
    title: String
    done: Bool
  }
}

server {
  get "/api/todos" {
    todos = db.query("SELECT * FROM todos")
    json(todos)
  }

  post "/api/todos" {
    body = request.json()
    todo = db.query("INSERT INTO todos (title) VALUES (?) RETURNING *",
                    [body.title])
    json(todo, 201)
  }
}

browser {
  var todos = signal([])
  var error = signal(null)

  async fn load_todos() {
    result = await rpc(get_todos)
    match result {
      Ok(data) => set_todos(data)
      Err(msg) => set_error(msg)
    }
  }

  fn render() {
    <div>
      <h1>"My Todos"</h1>
      <ul>
        {todos() |> map(fn(t) <li key={t.id}>{t.title}</li>)}
      </ul>
    </div>
  }
}
```

The compiler splits this into two output files: the server code and the browser bundle. Shared types appear in both. Server functions become API endpoints. Browser code becomes a reactive single-page application. One source of truth, two runtime targets.

### How the Compiler Splits Code

| Block | Output | Runs On |
|-------|--------|---------|
| `shared { }` | Both outputs | Server and browser |
| `server { }` | `app.server.js` | Node/Bun runtime |
| `browser { }` | `app.browser.js` | Browser bundle |
| Top-level functions | Both (if referenced) | Depends on usage |

Functions defined outside any block -- like validators -- are included wherever they are called. Write a `validate_email()` at the top level, use it in both `server` and `browser`, and the compiler includes it in both outputs automatically.

## Security Blocks

Security in Tova is declarative. Instead of wiring middleware, configuring passport.js, and hoping you didn't forget a route, you declare your security policy in a single `security` block:

```tova
security {
  auth {
    provider: "jwt"
    secret: env("JWT_SECRET")
  }

  roles {
    admin: ["manage_users", "delete_content"]
    editor: ["edit_content", "publish"]
    viewer: ["read"]
  }

  protect {
    "/admin/*": { require: "admin" }
    "/api/posts": { require: "editor", methods: ["POST", "PUT", "DELETE"] }
    "/api/*": { require: "viewer" }
  }

  cors {
    origins: ["https://myapp.com"]
    methods: ["GET", "POST", "PUT", "DELETE"]
  }

  csrf { enabled: true }

  rate_limit {
    window: 60
    max: 100
  }

  sensitive {
    fields: ["password", "ssn", "credit_card"]
  }
}
```

The compiler reads this block and generates all the necessary middleware, header injection, and validation code. Let's walk through each section.

<TryInPlayground :code="securityCode" label="Security Block" />

### Authentication

```tova
security {
  auth {
    provider: "jwt"
    secret: env("JWT_SECRET")
  }
}
```

This generates JWT verification middleware. Every protected route automatically validates the `Authorization: Bearer <token>` header. The `env()` function reads from environment variables -- never hardcode secrets.

::: warning Never Hardcode Secrets
The compiler emits a `W_HARDCODED_SECRET` warning if you write `secret: "my-secret"` instead of using `env()`. Hardcoded secrets end up in version control. Use environment variables.
:::

### Roles and Permissions

```tova
security {
  roles {
    admin: ["manage_users", "delete_content", "edit_content"]
    editor: ["edit_content", "publish"]
    viewer: ["read"]
  }
}
```

Roles are collections of permissions. The compiler generates a role-checking function that your route protections reference. A user with the `admin` role has the `manage_users`, `delete_content`, and `edit_content` permissions.

### Route Protection

```tova
security {
  protect {
    "/admin/*": { require: "admin" }
    "/api/posts": { require: "editor", methods: ["POST", "PUT"] }
    "/api/*": { require: "viewer" }
  }
}
```

Route protection is pattern-based. The wildcard `*` matches any sub-path. More specific routes take precedence over broader ones. The `methods` field restricts protection to specific HTTP methods -- so `GET /api/posts` is open to viewers, but `POST /api/posts` requires the editor role.

The compiler generates a check that runs before every matching route handler. If the user lacks the required role, the server responds with `401 Unauthorized` (no token) or `403 Forbidden` (wrong role).

### CORS

```tova
security {
  cors {
    origins: ["https://myapp.com", "https://staging.myapp.com"]
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
}
```

The compiler injects the correct `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, and `Access-Control-Allow-Headers` response headers. It also generates a preflight (`OPTIONS`) handler automatically.

::: warning Wildcard CORS
Setting `origins: ["*"]` triggers a `W_CORS_WILDCARD` warning. Wildcard CORS is fine for public APIs, but for applications with authentication, always list your specific origins.
:::

### CSRF Protection

```tova
security {
  csrf { enabled: true }
}
```

When enabled, the compiler generates CSRF token creation and validation. Tokens are injected into forms automatically (via the `bind:form` directive) and validated on every state-changing request (`POST`, `PUT`, `DELETE`).

### Rate Limiting

```tova
security {
  rate_limit {
    window: 60
    max: 100
  }
}
```

This limits each IP address to 100 requests per 60-second window. The compiler generates an in-memory rate limiter with sliding window counters.

### Sensitive Field Filtering

```tova
security {
  sensitive {
    fields: ["password", "ssn", "credit_card"]
  }
}
```

The auto-sanitize system strips sensitive fields from API responses. If your server handler returns a user object that contains `password`, the compiler-generated middleware removes it before the response reaches the client.

### Putting Security Together

Here is how security integrates with server routes:

```tova
security {
  auth { provider: "jwt", secret: env("JWT_SECRET") }
  roles { admin: ["manage_users"], editor: ["edit_content"] }
  protect { "/api/admin/*": { require: "admin" } }
  cors { origins: ["https://myapp.com"] }
  rate_limit { window: 60, max: 100 }
  sensitive { fields: ["password"] }
}

server {
  get "/api/admin/users" {
    // Only admins reach this handler
    // The security block handles auth + role check
    users = db.query("SELECT * FROM users")
    json(users)
    // Password field is automatically stripped from response
  }

  post "/api/login" {
    body = request.json()
    user = db.query("SELECT * FROM users WHERE email = ?", [body.email])
    if verify_password(body.password, user.password_hash) {
      token = jwt_sign({ id: user.id, role: user.role })
      json({ token: token })
    } else {
      json({ error: "Invalid credentials" }, 401)
    }
  }
}
```

No middleware imports. No auth library configuration. No CORS headers scattered across route handlers. The security block is the single source of truth.

## Form Blocks

Forms are a first-class concept in Tova's browser scope. Instead of wiring up state, validation, and error display manually, you declare a `form` block:

```tova
browser {
  form signup {
    field name: String {
      required
      minLength(2)
      maxLength(50)
    }

    field email: String {
      required
      email
    }

    field password: String {
      required
      minLength(8)
      pattern("[A-Z]", "Must contain an uppercase letter")
    }

    field confirm_password: String {
      required
      matches(password)
    }
  }
}
```

<TryInPlayground :code="formCode" label="Form Blocks" />

### What the Compiler Generates

For each field, the compiler creates a **signal triple**:

- `signup.name.value` -- the current value (a reactive signal)
- `signup.name.error` -- the validation error message, or `null`
- `signup.name.touched` -- whether the user has interacted with the field

It also generates:
- `signup.valid` -- `true` when all fields pass validation
- `signup.values()` -- returns an object with all current field values
- `signup.reset()` -- clears all fields back to defaults
- `signup.submit(handler)` -- calls `handler` only if all fields are valid

### Built-in Validators

| Validator | Description |
|-----------|-------------|
| `required` | Field must not be empty |
| `minLength(n)` | Minimum string length |
| `maxLength(n)` | Maximum string length |
| `min(n)` | Minimum numeric value |
| `max(n)` | Maximum numeric value |
| `pattern(regex, msg)` | Must match regex pattern |
| `email` | Must be a valid email format |
| `matches(other_field)` | Must match another field's value |
| `oneOf(values)` | Must be one of the listed values |
| `validate(fn)` | Custom synchronous validator |
| `async validate(fn)` | Custom asynchronous validator |

### Using Forms in JSX

The `bind:form` directive connects a `<form>` element to a form block:

```tova
browser {
  form signup {
    field name: String { required, minLength(2) }
    field email: String { required, email }
  }

  async fn handle_signup() {
    result = await rpc(create_user, signup.values())
    match result {
      Ok(user) => navigate("/dashboard")
      Err(msg) => set_error(msg)
    }
  }

  fn render() {
    <form bind:form={signup} onSubmit={handle_signup}>
      <div>
        <label>"Name"</label>
        <input value={signup.name.value} onInput={signup.name.set} />
        {signup.name.touched && signup.name.error &&
          <span class="error">{signup.name.error}</span>}
      </div>

      <div>
        <label>"Email"</label>
        <input type="email" value={signup.email.value}
               onInput={signup.email.set} />
        {signup.email.touched && signup.email.error &&
          <span class="error">{signup.email.error}</span>}
      </div>

      <button type="submit" disabled={!signup.valid}>
        "Create Account"
      </button>
    </form>
  }
}
```

The `bind:form` directive wires up the form's `onSubmit` to validate all fields and prevent submission if any fail. Error messages appear only after the user has interacted with a field (`touched`), so the form doesn't scream at the user before they've started typing.

### Form Groups

Group related fields together with `group`:

```tova
form profile {
  field name: String { required }

  group address {
    field street: String { required }
    field city: String { required }
    field state: String { required, minLength(2), maxLength(2) }
    field zip: String { required, pattern("[0-9]{5}", "Must be 5 digits") }
  }
}

// Access grouped fields with dot notation:
// profile.address.city.value
// profile.address.city.error
```

Groups can be conditional with `when`:

```tova
form checkout {
  field payment_method: String { required, oneOf(["card", "bank"]) }

  group card_details when payment_method == "card" {
    field card_number: String { required, minLength(16) }
    field expiry: String { required, pattern("[0-9]{2}/[0-9]{2}") }
    field cvv: String { required, minLength(3), maxLength(4) }
  }

  group bank_details when payment_method == "bank" {
    field routing: String { required }
    field account: String { required }
  }
}
```

When the condition is false, the group's fields are excluded from validation and `values()`.

### Wizard Steps

For multi-step forms, use `steps`:

```tova
form onboarding {
  steps {
    step "Account" {
      field email: String { required, email }
      field password: String { required, minLength(8) }
    }

    step "Profile" {
      field name: String { required }
      field bio: String { maxLength(500) }
    }

    step "Preferences" {
      field theme: String { oneOf(["light", "dark"]) }
      field notifications: Bool {}
    }
  }
}
```

The compiler generates navigation helpers:

- `onboarding.currentStep` -- index of the current step (0-based)
- `onboarding.canNext` -- `true` if current step is valid and not the last
- `onboarding.canPrev` -- `true` if not on the first step
- `onboarding.next()` -- advance to the next step
- `onboarding.prev()` -- go back to the previous step
- `onboarding.progress` -- a float from 0.0 to 1.0

```tova
fn render() {
  <div>
    <div class="progress-bar" style="width: {onboarding.progress * 100}%"></div>

    {match onboarding.currentStep {
      0 => <AccountStep />
      1 => <ProfileStep />
      2 => <PreferencesStep />
    }}

    <div class="nav">
      <button disabled={!onboarding.canPrev} onClick={onboarding.prev}>
        "Back"
      </button>
      <button disabled={!onboarding.canNext} onClick={onboarding.next}>
        "Next"
      </button>
    </div>
  </div>
}
```

### Async Validation

For validations that require a server round-trip (like checking if a username is taken), use `async validate`:

```tova
form register {
  field username: String {
    required
    minLength(3)
    async validate fn(value) {
      result = await rpc(check_username_available, value)
      match result {
        Ok(true) => Ok(value)
        Ok(false) => Err("Username already taken")
        Err(msg) => Err(msg)
      }
    }
  }
}
```

Async validators are automatically debounced (300ms by default) to avoid flooding the server with requests on every keystroke. The compiler generates a version counter to handle out-of-order responses -- if the user keeps typing, only the latest response is applied.

## RPC: Server-Browser Bridge

**RPC** (Remote Procedure Call) is Tova's way of calling server functions from browser code. Instead of manually building `fetch()` calls, constructing URLs, serializing JSON, and handling errors, you call `rpc()`:

```tova
server {
  fn get_todos(user_id: Int) -> [Todo] {
    db.query("SELECT * FROM todos WHERE owner_id = ?", [user_id])
  }

  fn create_todo(title: String, owner_id: Int) -> Todo {
    db.query(
      "INSERT INTO todos (title, owner_id) VALUES (?, ?) RETURNING *",
      [title, owner_id]
    )
  }

  fn toggle_todo(id: Int) -> Todo {
    db.query(
      "UPDATE todos SET done = NOT done WHERE id = ? RETURNING *",
      [id]
    )
  }
}

browser {
  async fn load_todos() {
    result = await rpc(get_todos, current_user.id)
    match result {
      Ok(todos) => set_todos(todos)
      Err(msg) => set_error("Failed to load: {msg}")
    }
  }

  async fn add_todo(title) {
    result = await rpc(create_todo, title, current_user.id)
    match result {
      Ok(todo) => set_todos(append(todos(), [todo]))
      Err(msg) => set_error(msg)
    }
  }

  async fn toggle(id) {
    result = await rpc(toggle_todo, id)
    match result {
      Ok(updated) => {
        set_todos(todos() |> map(fn(t) if t.id == updated.id { updated } else { t }))
      }
      Err(msg) => set_error(msg)
    }
  }
}
```

<TryInPlayground :code="rpcCode" label="RPC Pattern" />

### What the Compiler Does

When you write `rpc(get_todos, user_id)`, the compiler generates:

1. **Server side**: An HTTP endpoint at `/api/get_todos` that deserializes the request, calls `get_todos`, and serializes the response
2. **Browser side**: A `fetch()` call to `/api/get_todos` with the arguments serialized as JSON, the auth token attached, and the response deserialized back into a Tova `Result`

The function name, argument types, and return type from the `server` block are all used to generate the correct serialization code. If you change the server function's signature, the compiler catches mismatches in the browser code.

### RPC and Security

RPC calls automatically include the JWT token from the current session. If the security block protects the route that an RPC call targets, the auth and role checks happen transparently:

```tova
security {
  auth { provider: "jwt", secret: env("JWT_SECRET") }
  protect { "/api/*": { require: "viewer" } }
}

server {
  fn get_todos(user_id: Int) -> [Todo] {
    // This is automatically protected — only authenticated
    // users with the "viewer" role (or higher) can call it
    db.query("SELECT * FROM todos WHERE owner_id = ?", [user_id])
  }
}

browser {
  async fn load_todos() {
    // The JWT token is included automatically
    result = await rpc(get_todos, current_user.id)
    // If the token is expired or invalid, result is Err("Unauthorized")
    match result {
      Ok(todos) => set_todos(todos)
      Err(msg) => {
        if msg == "Unauthorized" {
          navigate("/login")
        } else {
          set_error(msg)
        }
      }
    }
  }
}
```

## Shared Validation

One of the most powerful patterns in full-stack Tova is writing validators that run on both client and server. Define them at the top level (outside any block):

```tova
// Top-level: included in both server and browser output
fn validate_title(title) {
  cleaned = trim(title)
  if len(cleaned) == 0 {
    Err("Title cannot be empty")
  } elif len(cleaned) > 200 {
    Err("Title must be 200 characters or fewer")
  } else {
    Ok(cleaned)
  }
}

fn validate_email(addr) {
  if !contains(addr, "@") {
    Err("Invalid email address")
  } elif len(addr) < 5 {
    Err("Email too short")
  } else {
    Ok(trim(addr))
  }
}
```

Now use these validators in both contexts:

```tova
browser {
  form new_todo {
    field title: String {
      required
      validate fn(val) validate_title(val)
    }
  }
}

server {
  post "/api/todos" {
    body = request.json()

    // Same validator runs server-side
    match validate_title(body.title) {
      Ok(clean_title) => {
        todo = db.query(
          "INSERT INTO todos (title, owner_id) VALUES (?, ?) RETURNING *",
          [clean_title, request.user.id]
        )
        json(todo, 201)
      }
      Err(msg) => json({ error: msg }, 400)
    }
  }
}
```

The browser form validates as the user types (instant feedback). The server validates again on submission (security enforcement). The validation logic is written once. If the rules change -- say the max length moves from 200 to 300 -- you change one function and both sides update.

<TryInPlayground :code="fullProjectCode" label="Shared Validation" />

::: tip Defense in Depth
Never trust the client. Even though the browser validates input, a malicious user can bypass your frontend entirely and send raw HTTP requests. Server-side validation is not optional -- it's the real security boundary. Shared validators make it effortless to have both.
:::

## Data Blocks

The `data` block provides a declarative way to define data sources, transform pipelines, validation rules, and refresh policies. It sits alongside `shared`, `server`, and `browser` blocks and makes your data layer explicit:

```tova
data {
  source customers = read("customers.csv")
  source orders = read("orders.csv")

  pipeline active = customers |> where(.active)
  pipeline summary = active
    |> group_by(.country)
    |> agg(total: count(), revenue: sum(.spend))

  validate Customer {
    .email |> contains("@"),
    .name |> len() > 0,
    .spend >= 0
  }

  refresh customers every 15.minutes
  refresh orders on_demand
}
```

Data sources and pipelines are globally accessible -- use them in `server` and `browser` blocks by name.

### Source Declarations

A `source` defines a named data source with lazy loading and caching:

```tova
data {
  // Basic source
  source users = read("users.csv")

  // With type annotation
  source customers: Table<Customer> = read("customers.csv")

  // From an API
  source exchange_rates = read("https://api.exchangerate.host/latest")
}
```

Sources are **lazy** -- they don't load until first accessed. Once loaded, results are cached. This means you can define many sources without paying for unused ones.

```tova
server {
  get "/api/users" {
    // First access triggers load; subsequent calls use cache
    json(users)
  }
}
```

### Pipeline Declarations

A `pipeline` transforms a source (or another pipeline) through a chain of operations using the pipe operator:

```tova
data {
  source raw = read("data.csv")

  // Simple filter
  pipeline adults = raw |> where(.age >= 18)

  // Multi-step transformation
  pipeline clean = raw
    |> drop_nil(.email)
    |> fill_nil(.spend, 0.0)
    |> derive(.name = .name |> trim())
    |> where(.spend > 0)

  // Aggregation
  pipeline by_country = clean
    |> group_by(.country)
    |> agg(count: count(), total: sum(.spend))

  // Sort
  pipeline top_spenders = clean
    |> sort_by(.spend, desc: true)

  // Column selection
  pipeline contacts = clean
    |> select(.name, .email, .phone)
}
```

#### Pipeline Operators

| Operator | Purpose | Example |
|----------|---------|---------|
| `where(.condition)` | Filter rows by predicate | `where(.age >= 18)` |
| `select(.col1, .col2)` | Choose specific columns | `select(.name, .email)` |
| `drop_nil(.col)` | Remove rows where column is null | `drop_nil(.email)` |
| `fill_nil(.col, val)` | Replace nulls with default | `fill_nil(.spend, 0.0)` |
| `derive(.col = expr)` | Add computed columns | `derive(.total = .price * .qty)` |
| `group_by(.col)` | Group rows by column | `group_by(.country)` |
| `agg(name: fn())` | Aggregate grouped data | `agg(n: count(), sum: sum(.val))` |
| `sort_by(.col)` | Sort rows | `sort_by(.spend, desc: true)` |

The dot-prefix syntax (`.age`, `.email`) refers to columns in the current row. This is specific to data block pipelines and makes transformations concise and readable.

### Validate Blocks

Define validation rules for your data types. Each rule is a predicate that returns true or false:

```tova
data {
  validate Customer {
    .email |> contains("@"),
    .name |> len() > 0,
    .spend >= 0
  }

  validate Order {
    .quantity > 0,
    .amount > 0
  }
}
```

The compiler generates a `__validate_Customer()` function that returns `{ valid: true, errors: [] }` on success or `{ valid: false, errors: ["..."] }` with descriptive error messages on failure. Use it in server handlers:

```tova
server {
  post "/api/customers" {
    body = request.json()
    result = __validate_Customer(body)
    if result.valid {
      db.query("INSERT INTO customers ...")
      json(body, 201)
    } else {
      json({ errors: result.errors }, 400)
    }
  }
}
```

### Refresh Policies

Control when cached data reloads:

```tova
data {
  source users = read("users.csv")
  source exchange_rates = read("https://api.rates.io/latest")
  source expensive_report = compute_report()

  // Automatic refresh on interval
  refresh users every 15.minutes
  refresh exchange_rates every 1.hour

  // Manual refresh — generates refresh_expensive_report() function
  refresh expensive_report on_demand
}
```

#### Time Units

| Syntax | Duration |
|--------|----------|
| `N.seconds` or `N.second` | N seconds |
| `N.minutes` or `N.minute` | N minutes |
| `N.hours` or `N.hour` | N hours |
| `N.days` or `N.day` | N days |

Interval refresh uses `setInterval` to periodically invalidate the cache, triggering a fresh load on next access. On-demand refresh generates a `refresh_<source>()` function you can call explicitly:

```tova
server {
  post "/api/admin/refresh" {
    refresh_expensive_report()
    json({ refreshed: true })
  }
}
```

### Data + Server Integration

Data sources and pipelines are accessible by name in server blocks:

```tova
data {
  source products = read("products.csv")
  pipeline in_stock = products |> where(.quantity > 0)
  pipeline by_category = in_stock
    |> group_by(.category)
    |> agg(count: count(), avg_price: avg(.price))
}

server {
  get "/api/products" {
    json(in_stock)
  }

  get "/api/categories" {
    json(by_category)
  }

  get "/api/products/:id" {
    product = products |> find(fn(p) p.id == to_int(params.id))
    match product {
      Some(p) => json(p)
      None => json({ error: "Not found" }, 404)
    }
  }
}
```

::: tip When to Use Data Blocks
Data blocks are ideal for **read-heavy applications** with known data sources: dashboards, analytics, content sites, configuration-driven APIs. For write-heavy CRUD apps, use server routes with direct database queries instead. The two approaches compose well -- use data blocks for reference data and server routes for transactional data.
:::

## Full-Stack Data Flow

Let's trace a complete data flow through a full-stack Tova application. The user adds a new todo item. Here is every step:

```
User types "Buy groceries" into the form
  |
  v
1. Form field validation (browser)
   validate_title("Buy groceries") -> Ok("Buy groceries")
   signup.title.error = null, signup.valid = true
  |
  v
2. User clicks "Add" — form submit handler fires
   handle_add() calls rpc(create_todo, "Buy groceries", user.id)
  |
  v
3. RPC serialization (browser, compiler-generated)
   POST /api/create_todo
   Body: {"args": ["Buy groceries", 1]}
   Headers: Authorization: Bearer <jwt-token>
  |
  v
4. Security middleware (server, compiler-generated)
   - Rate limit check: 42/100 requests this window -> pass
   - JWT verification: token valid, user = {id: 1, role: "editor"}
   - Route protection: /api/* requires "viewer", editor >= viewer -> pass
   - CSRF token: valid -> pass
  |
  v
5. Server handler (server)
   validate_title("Buy groceries") -> Ok("Buy groceries")
   db.query("INSERT INTO todos ...") -> {id: 7, title: "Buy groceries", done: false}
  |
  v
6. Response sanitization (server, compiler-generated)
   sensitive fields check: no sensitive fields in Todo -> pass through
  |
  v
7. RPC deserialization (browser, compiler-generated)
   Response: {id: 7, title: "Buy groceries", done: false, owner_id: 1}
   Wrapped as: Ok(todo)
  |
  v
8. UI update (browser)
   set_todos(append(todos(), [new_todo]))
   Reactive signal triggers re-render
   New todo appears in the list
```

Eight steps, but the developer writes only three things: the shared validator, the server handler, and the browser submit function. The compiler generates steps 3, 4, 6, and 7 entirely.

## Project: Full-Stack Todo App

Let's build the complete application. This ties together every concept from the chapter.

```tova
// ==========================================
// Full-Stack Todo App
// ==========================================

// --- Shared Types ---
shared {
  type Todo {
    id: Int
    title: String
    done: Bool
    owner_id: Int
    created_at: String
  }

  type User {
    id: Int
    name: String
    email: String
    role: String
  }
}

// --- Shared Validation ---
fn validate_title(title) {
  cleaned = trim(title)
  if len(cleaned) == 0 {
    Err("Title cannot be empty")
  } elif len(cleaned) > 200 {
    Err("Title must be 200 characters or fewer")
  } else {
    Ok(cleaned)
  }
}

fn validate_email(addr) {
  cleaned = trim(addr)
  if !contains(cleaned, "@") || len(cleaned) < 5 {
    Err("Invalid email address")
  } else {
    Ok(cleaned)
  }
}

fn validate_password(pw) {
  if len(pw) < 8 {
    Err("Password must be at least 8 characters")
  } else {
    Ok(pw)
  }
}

// --- Security ---
security {
  auth {
    provider: "jwt"
    secret: env("JWT_SECRET")
  }

  roles {
    admin: ["manage_users", "manage_todos"]
    user: ["own_todos"]
  }

  protect {
    "/api/admin/*": { require: "admin" }
    "/api/todos": { require: "user" }
    "/api/todos/*": { require: "user" }
  }

  cors {
    origins: [env("FRONTEND_URL")]
  }

  csrf { enabled: true }

  rate_limit {
    window: 60
    max: 100
  }

  sensitive {
    fields: ["password", "password_hash"]
  }
}

// --- Server ---
server {
  fn login(email_input: String, password_input: String) {
    match validate_email(email_input) {
      Err(msg) => { return json({ error: msg }, 400) }
      Ok(clean_email) => {
        user = db.query(
          "SELECT * FROM users WHERE email = ?",
          [clean_email]
        )
        guard user != null else { return json({ error: "Invalid credentials" }, 401) }
        guard verify_password(password_input, user.password_hash) else {
          return json({ error: "Invalid credentials" }, 401)
        }

        token = jwt_sign({ id: user.id, role: user.role })
        json({ token: token, user: { id: user.id, name: user.name, role: user.role } })
      }
    }
  }

  fn get_todos(user_id: Int) -> [Todo] {
    db.query("SELECT * FROM todos WHERE owner_id = ? ORDER BY created_at DESC",
             [user_id])
  }

  fn create_todo(title: String, owner_id: Int) -> Result {
    match validate_title(title) {
      Err(msg) => Err(msg)
      Ok(clean_title) => {
        todo = db.query(
          "INSERT INTO todos (title, owner_id, done) VALUES (?, ?, false) RETURNING *",
          [clean_title, owner_id]
        )
        Ok(todo)
      }
    }
  }

  fn toggle_todo(todo_id: Int, user_id: Int) -> Result {
    todo = db.query("SELECT * FROM todos WHERE id = ?", [todo_id])
    guard todo != null else { return Err("Todo not found") }
    guard todo.owner_id == user_id else { return Err("Not authorized") }

    updated = db.query(
      "UPDATE todos SET done = NOT done WHERE id = ? RETURNING *",
      [todo_id]
    )
    Ok(updated)
  }

  fn delete_todo(todo_id: Int, user_id: Int) -> Result {
    todo = db.query("SELECT * FROM todos WHERE id = ?", [todo_id])
    guard todo != null else { return Err("Todo not found") }
    guard todo.owner_id == user_id else { return Err("Not authorized") }

    db.query("DELETE FROM todos WHERE id = ?", [todo_id])
    Ok("Deleted")
  }
}

// --- Browser ---
browser {
  // State
  var todos = signal([])
  var current_user = signal(null)
  var error = signal(null)
  var loading = signal(false)

  // Login form
  form login_form {
    field email: String {
      required
      email
    }
    field password: String {
      required
      minLength(8)
    }
  }

  // New todo form
  form todo_form {
    field title: String {
      required
      validate fn(val) validate_title(val)
    }
  }

  // Actions
  async fn handle_login() {
    set_loading(true)
    set_error(null)
    result = await rpc(login, login_form.email.value, login_form.password.value)
    match result {
      Ok(data) => {
        set_current_user(data.user)
        localStorage.setItem("token", data.token)
        login_form.reset()
        await load_todos()
      }
      Err(msg) => set_error(msg)
    }
    set_loading(false)
  }

  async fn load_todos() {
    set_loading(true)
    result = await rpc(get_todos, current_user().id)
    match result {
      Ok(data) => set_todos(data)
      Err(msg) => set_error("Failed to load todos: {msg}")
    }
    set_loading(false)
  }

  async fn handle_add_todo() {
    result = await rpc(create_todo, todo_form.title.value, current_user().id)
    match result {
      Ok(todo) => {
        set_todos(prepend(todos(), todo))
        todo_form.reset()
      }
      Err(msg) => set_error(msg)
    }
  }

  async fn handle_toggle(todo_id) {
    result = await rpc(toggle_todo, todo_id, current_user().id)
    match result {
      Ok(updated) => {
        set_todos(todos() |> map(fn(t) {
          if t.id == updated.id { updated } else { t }
        }))
      }
      Err(msg) => set_error(msg)
    }
  }

  async fn handle_delete(todo_id) {
    result = await rpc(delete_todo, todo_id, current_user().id)
    match result {
      Ok(_) => {
        set_todos(todos() |> filter(fn(t) t.id != todo_id))
      }
      Err(msg) => set_error(msg)
    }
  }

  fn handle_logout() {
    localStorage.removeItem("token")
    set_current_user(null)
    set_todos([])
  }

  // Components
  fn LoginPage() {
    <div class="login">
      <h1>"Welcome Back"</h1>
      {error() && <div class="error">{error()}</div>}

      <form bind:form={login_form} onSubmit={handle_login}>
        <div class="field">
          <label>"Email"</label>
          <input type="email"
                 value={login_form.email.value}
                 onInput={login_form.email.set}
                 placeholder="you@example.com" />
          {login_form.email.touched && login_form.email.error &&
            <span class="field-error">{login_form.email.error}</span>}
        </div>

        <div class="field">
          <label>"Password"</label>
          <input type="password"
                 value={login_form.password.value}
                 onInput={login_form.password.set} />
          {login_form.password.touched && login_form.password.error &&
            <span class="field-error">{login_form.password.error}</span>}
        </div>

        <button type="submit" disabled={!login_form.valid || loading()}>
          {if loading() { "Signing in..." } else { "Sign In" }}
        </button>
      </form>
    </div>
  }

  fn TodoList() {
    <div class="todos">
      <header>
        <h1>"My Todos"</h1>
        <span>"({len(todos())} items)"</span>
        <button onClick={handle_logout}>"Logout"</button>
      </header>

      {error() && <div class="error">{error()}</div>}

      <form bind:form={todo_form} onSubmit={handle_add_todo} class="add-form">
        <input value={todo_form.title.value}
               onInput={todo_form.title.set}
               placeholder="What needs doing?" />
        <button type="submit" disabled={!todo_form.valid}>
          "Add"
        </button>
      </form>

      <ul class="todo-list">
        {todos() |> map(fn(todo) {
          <li key={todo.id} class={if todo.done { "done" } else { "" }}>
            <input type="checkbox"
                   checked={todo.done}
                   onChange={fn() handle_toggle(todo.id)} />
            <span>{todo.title}</span>
            <button onClick={fn() handle_delete(todo.id)}>"x"</button>
          </li>
        })}
      </ul>

      {len(todos()) == 0 && !loading() &&
        <p class="empty">"No todos yet. Add one above."</p>}
    </div>
  }

  fn render() {
    <div class="app">
      {if current_user() == null {
        <LoginPage />
      } else {
        <TodoList />
      }}
    </div>
  }
}
```

This single file produces a complete application: a login page with validated forms, a todo list with add/toggle/delete operations, JWT authentication, role-based route protection, CORS, CSRF, rate limiting, and sensitive field filtering. The compiler generates the API layer, the security middleware, and the client-server bridge.

## Exercises

**Exercise 15.1:** Add a `shared` type called `Category` with fields `id: Int`, `name: String`, and `color: String`. Add a `category_id: Int` field to the `Todo` type. Write a server function `get_categories()` and modify `create_todo` to accept a `category_id`. On the browser side, add a `<select>` dropdown to the todo form that lets the user pick a category.

**Exercise 15.2:** Add a `security` block with rate limiting that allows only 10 todo creations per minute (but 100 reads per minute). Research how you might express per-route rate limits in the security block. Write the `protect` rules so that only the todo owner can toggle or delete their own todos, and admins can delete any todo.

**Exercise 15.3:** Build a `form` block called `profile_editor` with a `group` for personal info (name, bio) and a conditional `group` for notification preferences that only appears when `notifications_enabled` is true. Use `async validate` on the `name` field to check for uniqueness via RPC. Wire it up with `bind:form` and display validation errors inline.

## Challenge

Build a **full-stack blog platform** with the following:

1. **Shared types**: `Post` (id, title, body, author_id, published, created_at), `Comment` (id, post_id, author_id, body, created_at), `User` (id, name, email, role)
2. **Security**: JWT auth, three roles (`admin`, `author`, `reader`). Authors can create and edit their own posts. Admins can delete any post. Readers can only comment. Add CSRF, CORS, and rate limiting.
3. **Server**: CRUD routes for posts and comments. A search endpoint that accepts a query string and returns matching posts.
4. **Browser**: A post list page, a single-post page with comments, a "new post" form with a rich text field (use a `<textarea>` and validate minimum length of 100 characters), and a comment form.
5. **Shared validation**: `validate_post_title`, `validate_post_body`, `validate_comment` -- all used in both form blocks and server handlers.
6. **Wizard form**: The "new post" form should be a 3-step wizard: Step 1 (title and category), Step 2 (body), Step 3 (preview and publish toggle).

The entire application should live in a single `.tova` file. Trace the data flow for "user publishes a new post" from form input to database to the post appearing in the list.

---

[← Previous: JSX and Reactivity](./jsx-and-reactivity) | [Next: CLI and Edge Computing →](./cli-and-edge)
