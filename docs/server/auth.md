# Authentication

Lux provides built-in support for JWT and API key authentication. Configuration is declarative, and helper functions handle the common tasks of password hashing, token generation, and route protection.

## JWT Authentication

### Configuration

Enable JWT authentication with the `auth` block:

```lux
server {
  auth {
    type: "jwt"
    secret: "your-secret-key"
  }
}
```

::: tip
Store your JWT secret in an environment variable rather than hardcoding it:
```lux
env JWT_SECRET: String
auth {
  type: "jwt"
  secret: JWT_SECRET
}
```
:::

### Signing Tokens

Use `sign_jwt` to create a JWT from a payload:

```lux
token = sign_jwt({ user_id: 1, role: "admin" })
```

Pass an explicit secret and options for more control:

```lux
token = sign_jwt({ user_id: 1 }, "custom-secret", { expires_in: 3600 })
```

The `expires_in` option sets the token lifetime in seconds.

### Protected Routes

Attach the `auth` guard to routes that require authentication:

```lux
route GET "/profile" with auth => get_profile
route PUT "/profile" with auth => update_profile
```

When a request hits a protected route, the `auth` middleware:
1. Extracts the token from the `Authorization` header (expects `Bearer <token>`)
2. Verifies the token signature and expiration
3. Decodes the payload and attaches it to `req.user`
4. If verification fails, returns a `401 Unauthorized` response

### Accessing the User

Inside a protected handler, the decoded JWT payload is available on `req.user`:

```lux
fn get_profile(req) {
  user_id = req.user.user_id
  user = UserModel.find(user_id)
  respond(200, user)
}
```

### Full Login Example

```lux
server {
  auth {
    type: "jwt"
    secret: "your-secret-key"
  }

  db { path: "./data.db" }
  model User

  fn login(req) {
    let { email, password } = req.body
    user = db.get("SELECT * FROM users WHERE email = ?", email)

    guard user != nil else {
      return respond(401, { error: "Invalid credentials" })
    }

    guard verify_password(password, user.password_hash) else {
      return respond(401, { error: "Invalid credentials" })
    }

    token = sign_jwt({ user_id: user.id, role: user.role }, nil, { expires_in: 86400 })
    respond(200, { token: token })
  }

  fn get_profile(req) {
    user = UserModel.find(req.user.user_id)
    respond(200, user)
  }

  route POST "/login" => login
  route GET "/profile" with auth => get_profile
}
```

## API Key Authentication

### Configuration

For service-to-service communication or simple API access, use API key authentication:

```lux
server {
  auth {
    type: "api_key"
    keys: ["key-abc-123", "key-def-456", "key-ghi-789"]
    header: "X-API-Key"
  }
}
```

The `header` field specifies which HTTP header to read the key from (defaults to `X-API-Key`).

### Protecting Routes

API key authentication uses the same `with auth` syntax as JWT:

```lux
route GET "/api/data" with auth => get_data
```

The middleware checks the configured header for a valid key. If the key is missing or not in the allowed list, it returns `401 Unauthorized`.

## Auth Helpers

### Password Hashing

Lux provides secure password hashing functions:

```lux
// Hash a password (uses bcrypt under the hood)
hashed = hash_password("my_password")

// Verify a password against a hash
is_valid = verify_password("my_password", hashed)    // true or false
```

Always store hashed passwords in your database, never plaintext:

```lux
fn register(req) {
  let { name, email, password } = req.body
  hashed = hash_password(password)
  user = UserModel.create({ name: name, email: email, password_hash: hashed })
  respond(201, { id: user.id, name: user.name, email: user.email })
}
```

### sign_jwt

The `sign_jwt` function accepts up to three arguments:

```lux
sign_jwt(payload)                              // uses configured secret, no expiration
sign_jwt(payload, secret)                      // custom secret, no expiration
sign_jwt(payload, secret, { expires_in: 3600 }) // custom secret, expires in 1 hour
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `payload` | Object | Data to encode in the token |
| `secret` | String? | Signing secret (defaults to the `auth` block secret) |
| `options` | Object? | Additional options like `expires_in` (seconds) |

## Role-Based Authorization

Combine the `auth` guard with a `role` guard for fine-grained access control:

```lux
fn role(required_role) {
  fn(req, next) {
    if req.user.role != required_role {
      respond(403, { error: "Forbidden" })
    } else {
      next(req)
    }
  }
}

route GET "/admin/dashboard" with auth, role("admin") => admin_dashboard
route DELETE "/users/:id" with auth, role("admin") => delete_user
route GET "/reports" with auth, role("manager") => get_reports
```

The `auth` guard runs first and populates `req.user`. Then the `role` guard checks whether the user has the required role.

## Practical Tips

**Use environment variables for secrets.** Never hardcode JWT secrets or API keys in your source code. Use `env` declarations to load them from the environment.

**Set token expiration.** Always pass an `expires_in` option to `sign_jwt`. Tokens without expiration remain valid forever, which is a security risk.

**Hash passwords with `hash_password`.** This function uses a secure hashing algorithm with proper salting. Do not implement your own hashing.

**Separate authentication from authorization.** Use `auth` to verify identity (who is the user?) and `role` to check permissions (what can they do?). This separation makes your access control easier to maintain.
