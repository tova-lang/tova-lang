---
title: Authentication Flow
---

# Authentication Flow

A server with JWT-based authentication including user registration, login, and protected endpoints.

## Full Code

Create `auth.tova`:

```tova
shared {
  type User {
    id: Int
    email: String
    name: String
  }

  type AuthResponse {
    user: User
    token: String
  }

  type LoginRequest {
    email: String
    password: String
  }

  type RegisterRequest {
    email: String
    password: String
    name: String
  }
}

server {
  db {
    adapter: "sqlite"
    database: "auth.db"
  }

  model User {
    email: String
    name: String
    password_hash: String
  }

  // JWT secret -- in production, load from environment
  JWT_SECRET = process.env["JWT_SECRET"] || "dev-secret-change-in-production"

  // ── Password Hashing ────────────────────────────────────────

  fn hash_password(password) -> String {
    Bun.password.hashSync(password, { algorithm: "bcrypt", cost: 10 })
  }

  fn verify_password(password, hash) -> Bool {
    Bun.password.verifySync(password, hash)
  }

  // ── JWT Helpers ─────────────────────────────────────────────

  fn create_token(user) -> String {
    payload = {
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + 86400  // 24 hours
    }
    jwt.sign(payload, JWT_SECRET)
  }

  fn verify_token(token) -> User {
    payload = jwt.verify(token, JWT_SECRET)
    User.find(payload.sub)
  }

  // ── Auth Middleware ─────────────────────────────────────────

  middleware fn auth(req, res) {
    header = req.headers["authorization"]
    if header == nil {
      res.status(401)
    }

    token = header.replace("Bearer ", "")
    if token == "" {
      res.status(401)
    }

    user = verify_token(token)
    if user == nil {
      res.status(401)
    }
  }

  // ── Registration ────────────────────────────────────────────

  fn register(email, password, name) {
    // Check if user already exists
    existing = User.find_by({ email: email })
    guard existing == nil else {
      return Err("Email already registered")
    }

    // Validate password strength
    guard len(password) >= 8 else {
      return Err("Password must be at least 8 characters")
    }

    // Create user with hashed password
    hashed = hash_password(password)
    user = User.create({
      email: email,
      name: name,
      password_hash: hashed
    })

    // Generate token
    token = create_token(user)

    Ok(AuthResponse(
      User(user.id, user.email, user.name),
      token
    ))
  }

  // ── Login ───────────────────────────────────────────────────

  fn login(email, password) {
    user = User.find_by({ email: email })
    guard user != nil else {
      return Err("Invalid email or password")
    }

    valid = verify_password(password, user.password_hash)
    guard valid else {
      return Err("Invalid email or password")
    }

    token = create_token(user)

    Ok(AuthResponse(
      User(user.id, user.email, user.name),
      token
    ))
  }

  // ── Protected Endpoint ──────────────────────────────────────

  fn get_profile(req) -> User {
    // req.user is set by auth middleware
    User(req.user.id, req.user.email, req.user.name)
  }

  fn update_profile(req, name) -> User {
    user = req.user
    User.update(user.id, { name: name })
    User(user.id, user.email, name)
  }

  // ── Routes ──────────────────────────────────────────────────

  route POST "/api/register" => register
  route POST "/api/login" => login
  route GET "/api/profile" => get_profile       // protected by auth middleware
  route PUT "/api/profile" => update_profile    // protected by auth middleware
}

client {
  state user = nil
  state token = nil
  state email = ""
  state password = ""
  state name = ""
  state error_msg = ""
  state view = "login"  // "login" | "register" | "profile"

  computed is_logged_in = user != nil

  fn handle_login() {
    guard email != "" else { return }
    guard password != "" else { return }

    result = server.login(email, password)
    match result {
      Ok(auth) => {
        user = auth.user
        token = auth.token
        error_msg = ""
        view = "profile"
      }
      Err(msg) => {
        error_msg = msg
      }
    }
  }

  fn handle_register() {
    guard email != "" else { return }
    guard password != "" else { return }
    guard name != "" else { return }

    result = server.register(email, password, name)
    match result {
      Ok(auth) => {
        user = auth.user
        token = auth.token
        error_msg = ""
        view = "profile"
      }
      Err(msg) => {
        error_msg = msg
      }
    }
  }

  fn handle_logout() {
    user = nil
    token = nil
    view = "login"
  }

  component LoginForm {
    <div class="form">
      <h2>"Login"</h2>
      if error_msg != "" {
        <p class="error">{error_msg}</p>
      }
      <input
        type="text"
        placeholder="Email"
        value={email}
        oninput={fn(e) email = e.target.value}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        oninput={fn(e) password = e.target.value}
      />
      <button onclick={fn() handle_login()}>"Login"</button>
      <p>
        "Don't have an account? "
        <a onclick={fn() view = "register"}>"Register"</a>
      </p>
    </div>
  }

  component RegisterForm {
    <div class="form">
      <h2>"Register"</h2>
      if error_msg != "" {
        <p class="error">{error_msg}</p>
      }
      <input
        type="text"
        placeholder="Name"
        value={name}
        oninput={fn(e) name = e.target.value}
      />
      <input
        type="text"
        placeholder="Email"
        value={email}
        oninput={fn(e) email = e.target.value}
      />
      <input
        type="password"
        placeholder="Password (min 8 chars)"
        value={password}
        oninput={fn(e) password = e.target.value}
      />
      <button onclick={fn() handle_register()}>"Register"</button>
      <p>
        "Already have an account? "
        <a onclick={fn() view = "login"}>"Login"</a>
      </p>
    </div>
  }

  component Profile {
    <div class="profile">
      <h2>"Profile"</h2>
      <p>"Name: {user.name}"</p>
      <p>"Email: {user.email}"</p>
      <button onclick={fn() handle_logout()}>"Logout"</button>
    </div>
  }

  component App {
    <div class="app">
      <header>
        <h1>"Auth Demo"</h1>
      </header>

      {match view {
        "login" => LoginForm()
        "register" => RegisterForm()
        "profile" => Profile()
        _ => LoginForm()
      }}
    </div>
  }
}
```

Run it:

```bash
tova dev .
```

## Walkthrough

### Shared Auth Types

```tova
shared {
  type User {
    id: Int
    email: String
    name: String
  }

  type AuthResponse {
    user: User
    token: String
  }
}
```

The shared types define the contract between server and client. Note that the shared `User` type does not include `password_hash` -- only the server model has that field. This prevents sensitive data from leaking to the client.

### Password Hashing

```tova
fn hash_password(password) -> String {
  Bun.password.hashSync(password, { algorithm: "bcrypt", cost: 10 })
}

fn verify_password(password, hash) -> Bool {
  Bun.password.verifySync(password, hash)
}
```

Passwords are hashed using bcrypt via Bun's built-in password hashing. The cost factor of 10 provides a balance between security and speed. Passwords are never stored in plain text.

### JWT Token Management

```tova
fn create_token(user) -> String {
  payload = {
    sub: user.id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + 86400
  }
  jwt.sign(payload, JWT_SECRET)
}
```

Tokens are created with:
- `sub` (subject): the user ID
- `email`: for convenience in the token payload
- `exp` (expiration): 24 hours from creation

The JWT secret should be loaded from an environment variable in production.

### Auth Middleware

```tova
middleware fn auth(req, res) {
  header = req.headers["authorization"]
  if header == nil {
    res.status(401)
  }

  token = header.replace("Bearer ", "")
  if token == "" {
    res.status(401)
  }

  user = verify_token(token)
  if user == nil {
    res.status(401)
  }
}
```

The `auth` middleware uses `if` checks to validate the request:
1. Check that the `Authorization` header exists
2. Extract and validate the token format
3. Verify the token and load the user

If any check fails, the middleware sets a 401 status and the route handler is never called. Note the `fn` keyword after `middleware` -- this is required by the parser.

### Registration with Validation

```tova
fn register(email, password, name) {
  existing = User.find_by({ email: email })
  guard existing == nil else {
    return Err("Email already registered")
  }

  guard len(password) >= 8 else {
    return Err("Password must be at least 8 characters")
  }

  hashed = hash_password(password)
  user = User.create({ ... })
  token = create_token(user)

  Ok(AuthResponse(User(user.id, user.email, user.name), token))
}
```

Registration follows a validation-first pattern using guard clauses:
1. Check for existing email
2. Validate password strength
3. Hash the password
4. Create the user record
5. Generate and return a JWT token

The function returns `Result` -- either `Ok(AuthResponse)` or `Err(message)`.

### Client-Side View Routing

```tova
state view = "login"

component App {
  {match view {
    "login" => LoginForm()
    "register" => RegisterForm()
    "profile" => Profile()
    _ => LoginForm()
  }}
}
```

The client uses a `view` state variable to switch between login, registration, and profile views. The `match` expression in JSX renders the appropriate component.

### Error Display Pattern

```tova
if error_msg != "" {
  <p class="error">{error_msg}</p>
}
```

Error messages from the server are displayed conditionally using an `if` block inside JSX. When `error_msg` is empty, nothing is rendered. When an error exists, it displays in a styled paragraph. This pattern avoids using `match` with JSX elements in match arms, which is not supported since JSX elements are not valid in expression position.

## Security Considerations

- Passwords are hashed with bcrypt before storage
- JWT tokens expire after 24 hours
- The shared `User` type excludes `password_hash`
- Auth middleware validates every protected request
- Guard clauses in functions and `if` checks in middleware ensure early rejection of invalid requests
- In production, load `JWT_SECRET` from environment variables

## What's Next

- Add database models with [Database & Models](./database.md)
- Scale with [Multi-Server Architecture](./multi-server.md)
