# Security Block

The `security {}` block is a top-level language construct in Tova that centralizes your entire security policy in one place. It covers authentication, authorization, route protection, sensitive field handling, CORS, CSP, rate limiting, CSRF, HSTS, and audit logging. The compiler reads this block and generates all enforcement code into both server and client outputs -- with zero runtime dependencies and compile-time validation.

## Why a Dedicated Security Block?

Without centralized security, configuration is scattered: auth in one file, CORS in another, rate limiting wired up per-route, CSRF tokens manually validated, field sanitization done (or forgotten) in each response handler. One missed attachment, one forgotten route, and your security has a hole.

The `security {}` block solves this:

- **Centralized security policy** -- every security concern in one block, one place to audit
- **Compile-time validation** -- the compiler catches undefined roles, hardcoded secrets, CORS wildcards, and missing auth before your code runs
- **Zero runtime dependencies** -- the compiler generates all enforcement code directly. No packages to install, update, or audit
- **Cross-block enforcement** -- security rules automatically apply to both server and client outputs
- **Automatic coverage** -- adding a new route or endpoint automatically inherits the security policy. No middleware to remember to attach
- **Defense in depth** -- JWT algorithm pinning, path normalization, timing-safe CSRF comparison, HSTS auto-enablement

## Syntax Overview

```tova
security {
  auth jwt {
    secret: env("JWT_SECRET")
    expires: 86400
  }

  role Admin {
    can: [manage_users, view_analytics]
  }

  role User {
    can: [view_profile, edit_profile]
  }

  protect "/api/admin/*" {
    require: Admin
    rate_limit: { max: 100, window: 60 }
  }

  protect "/api/*" {
    require: authenticated
  }

  sensitive User.password {
    hash: "bcrypt"
    never_expose: true
  }

  sensitive User.email {
    visible_to: [Admin, "self"]
  }

  cors {
    origins: ["https://myapp.com"]
    methods: [GET, POST, PUT, DELETE]
    credentials: true
  }

  csp {
    default_src: ["self"]
    script_src: ["self"]
  }

  rate_limit {
    max: 1000
    window: 3600
  }

  csrf {
    enabled: true
    exempt: ["/api/webhooks/*"]
  }

  audit {
    events: [login, logout, manage_users]
    store: "audit_log"
    retain: 90
  }

  trust_proxy true

  hsts {
    max_age: 63072000
    include_subdomains: true
    preload: true
  }
}
```

## Authentication

The `auth` declaration configures how users authenticate. It supports JWT and API key authentication:

```tova
security {
  // JWT authentication (default)
  auth jwt {
    secret: env("JWT_SECRET")
    expires: 86400
  }
}
```

```tova
security {
  // API key authentication
  auth api_key {
    header: "X-API-Key"
  }
}
```

When auth is configured in the security block, the server automatically generates a `__authenticate()` function, and the client gets `getAuthToken()`, `setAuthToken()`, and `clearAuthToken()` helpers with automatic token injection into RPC calls.

### Token Storage

By default, auth tokens are stored in `localStorage`. For higher security, you can use HttpOnly cookies instead:

```tova
security {
  auth jwt {
    secret: env("JWT_SECRET")
    expires: 86400
    storage: "cookie"   // HttpOnly cookie instead of localStorage
  }
}
```

With `storage: "cookie"`:
- The server reads tokens from an `HttpOnly; Secure; SameSite=Lax` cookie
- The client automatically sends credentials with every RPC call
- `setAuthToken()` is a no-op (the server sets the cookie via `__setAuthCookie()`)
- `clearAuthToken()` calls the `/rpc/__logout` endpoint to clear the cookie
- Falls back to reading the `Authorization: Bearer` header if no cookie is present

Use the `__setAuthCookie(response, token)` helper in your login route to set the cookie:

```tova
server {
  fn login(email: String, password: String) {
    user = authenticate(email, password)
    token = sign_jwt({ id: user.id, role: user.role })
    __setAuthCookie(respond(200, { user }), token)
  }
}
```

## Roles

Roles define named permission groups:

```tova
security {
  role Admin {
    can: [manage_users, view_analytics, delete_posts]
  }

  role Editor {
    can: [create_posts, edit_posts, view_analytics]
  }

  role User {
    can: [view_profile, edit_profile]
  }
}
```

On the server, this generates `__hasRole(user, roleName)` and `__hasPermission(user, permission)` functions. On the client, it generates a `can(permission)` helper for conditional UI rendering.

### Multi-Role Users

Users can have a single role (`user.role = "Admin"`) or multiple roles (`user.roles = ["Admin", "Editor"]`). The role checking functions support both formats automatically:

```javascript
// Single role — works
{ id: 1, role: "Admin" }

// Multiple roles — also works
{ id: 1, roles: ["Admin", "Editor"] }
```

On the client, `setUserRole()` accepts either a string or an array:

```javascript
setUserRole("Admin")             // single role
setUserRole(["Admin", "Editor"]) // multiple roles
can("manage_users")              // checks across all roles
```

## Route Protection

The `protect` declaration secures route patterns with role requirements:

```tova
security {
  // Require Admin role for admin routes
  protect "/api/admin/*" {
    require: Admin
    rate_limit: { max: 100, window: 60 }
  }

  // Require any authenticated user for API routes
  protect "/api/*" {
    require: authenticated
  }
}
```

- `require: authenticated` -- any authenticated user can access
- `require: RoleName` -- only users with the specified role can access
- `rate_limit` -- optional per-route rate limiting (max requests per window in seconds)

Route patterns support glob-style wildcards:

- `*` matches within a single path segment (e.g., `/api/*/users` matches `/api/v1/users` but not `/api/v1/v2/users`)
- `**` matches across path segments (e.g., `/api/**` matches `/api/v1/users`, `/api/admin/settings`, etc.)
- Special regex characters (`.`, `+`, `?`, etc.) in patterns are escaped automatically

Protection is checked automatically on every request.

## Sensitive Fields

Mark type fields as sensitive to control their visibility:

```tova
security {
  // Never include password in any response
  sensitive User.password {
    hash: "bcrypt"
    never_expose: true
  }

  // Only show email to admins or the user themselves
  sensitive User.email {
    visible_to: [Admin, "self"]
  }
}
```

This generates sanitization functions (`__sanitizeUser()`) that strip or filter fields based on the requesting user's role.

## CORS

Configure Cross-Origin Resource Sharing:

```tova
security {
  cors {
    origins: ["https://myapp.com", "https://staging.myapp.com"]
    methods: [GET, POST, PUT, DELETE]
    credentials: true
  }
}
```

## Content Security Policy

Configure CSP headers:

```tova
security {
  csp {
    default_src: ["self"]
    script_src: ["self"]
    style_src: ["self", "unsafe-inline"]
    img_src: ["self", "https://cdn.example.com"]
  }
}
```

Directive names use underscores in Tova (e.g., `default_src`) and are converted to hyphens in the output header (e.g., `default-src`).

## Rate Limiting

Set global rate limits:

```tova
security {
  rate_limit {
    max: 1000
    window: 3600
  }
}
```

- `max` -- maximum requests per window
- `window` -- window duration in seconds

Per-route rate limits can also be configured inside `protect` declarations.

## CSRF Protection

Configure CSRF token validation:

```tova
security {
  csrf {
    enabled: true
    exempt: ["/api/webhooks/*"]
  }
}
```

## Audit Logging

Track security-relevant events:

```tova
security {
  audit {
    events: [login, logout, manage_users]
    store: "audit_log"
    retain: 90
  }
}
```

- `events` -- list of event names to track
- `store` -- database table name for audit entries
- `retain` -- number of days to retain audit logs

## Client-Side Helpers

When the security block is present, the client output automatically receives:

### Auth Token Management

```javascript
// Set token after login
setAuthToken(token)

// Get current token (auto-injected into RPC calls)
getAuthToken()

// Clear token on logout
clearAuthToken()
```

### Permission Checking

```javascript
// Set the current user's role (after login)
setUserRole("Admin")

// Check if current user has a permission
if (can("manage_users")) {
  // show admin panel
}
```

## Backward Compatibility

Existing inline declarations inside `server {}` blocks (`auth {}`, `cors {}`, `rate_limit {}`) continue to work. When both a security block and inline declarations exist, the inline declaration takes precedence for that specific feature.

## Trust Proxy

Control how client IP addresses are determined. By default, `x-forwarded-for` headers are **not trusted** to prevent IP spoofing:

```tova
security {
  // Trust proxy — read x-forwarded-for (use behind a trusted reverse proxy)
  trust_proxy true

  // Don't trust proxy (default) — use direct connection IP
  trust_proxy false

  // Only trust x-forwarded-for from loopback addresses
  trust_proxy "loopback"
}
```

This affects all IP-based features: rate limiting, route protection rate limits, and audit logging.

## HSTS (HTTP Strict Transport Security)

Configure HSTS headers. When `auth` is configured, HSTS is automatically enabled with safe defaults:

```tova
security {
  // Custom HSTS configuration
  hsts {
    max_age: 63072000
    include_subdomains: true
    preload: true
  }
}
```

```tova
security {
  // Disable HSTS explicitly (even when auth is configured)
  hsts {
    enabled: false
  }
}
```

If no explicit `hsts` block is present but `auth` is configured, the compiler auto-generates `Strict-Transport-Security: max-age=31536000; includeSubDomains`.

## Auto-Sanitization

When `sensitive` fields are declared, the compiler generates an `__autoSanitize()` function that automatically strips sensitive fields from **all** RPC responses. This means you don't need to manually call sanitization functions -- any object returned from a server function will have sensitive fields removed based on the requesting user's permissions.

The auto-sanitizer:
- Dispatches to type-specific sanitizers by checking `data.__type` or `data.constructor.name`
- Recurses into arrays and nested objects
- Passes the authenticated user for role-based visibility checks

## Compile-Time Warnings

The analyzer produces warnings for:

- **Undefined roles** (`W_UNDEFINED_ROLE`) -- a `protect` rule or `sensitive` `visible_to` references a role that isn't defined in any security block
- **Duplicate roles** (`W_DUPLICATE_ROLE`) -- the same role name is defined more than once in a single security block
- **Protect without auth** (`W_PROTECT_WITHOUT_AUTH`) -- route protection rules exist but no `auth` configuration is present, meaning all protected routes will be inaccessible
- **Protect without require** (`W_PROTECT_NO_REQUIRE`) -- a `protect` rule has no `require` key, leaving the route unprotected
- **Hardcoded secret** (`W_HARDCODED_SECRET`) -- the auth secret is a string literal instead of `env("SECRET_NAME")`
- **CORS wildcard** (`W_CORS_WILDCARD`) -- CORS origins contains `"*"`, which allows any origin
- **Unknown auth type** (`W_UNKNOWN_AUTH_TYPE`) -- using an unsupported authentication type
- **Invalid rate limit** (`W_INVALID_RATE_LIMIT`) -- rate limit values are invalid
- **CSRF disabled** (`W_CSRF_DISABLED`) -- CSRF protection is explicitly disabled

Role validation works across multiple security blocks -- a role defined in one block can be referenced by a `protect` rule or `sensitive` declaration in another block.

## Security Hardening

The security block implementation includes several hardening measures:

- **JWT algorithm validation** -- Only `HS256` tokens are accepted; tokens with `alg: "none"` or other algorithms are rejected, preventing algorithm confusion attacks
- **Path normalization** -- Request paths are URL-decoded, double slashes collapsed, `../` sequences resolved, and trailing slashes stripped before routing, preventing path traversal bypasses
- **CSRF raw byte comparison** -- CSRF token signatures are compared using `timingSafeEqual` on raw bytes, not hex string comparison, preventing timing attacks
- **CSRF exempt patterns** -- Webhook and API callback routes can be exempted from CSRF validation using glob patterns in `csrf { exempt: [...] }`
- **HSTS auto-enablement** -- When `auth` is configured, the compiler automatically generates `Strict-Transport-Security: max-age=31536000; includeSubDomains` unless explicitly disabled
- **Client-side advisory** -- The `can()` helper on the client includes a code comment noting it's for UI purposes only; all authorization is enforced server-side
- **Auto-sanitization** -- The `__autoSanitize()` function is applied to all RPC responses, recursively walking objects and arrays to strip sensitive fields based on `__type`/`__tag` markers

## What the Compiler Generates

For a security block with auth, roles, protections, and sensitive fields, the compiler generates:

**Server-side (zero runtime dependencies):**
- `__authenticate(req)` -- extracts and validates JWT/API key from request headers or cookies
- `__hasRole(user, roleName)` -- checks single-role or multi-role users
- `__hasPermission(user, permission)` -- checks if user's role(s) include the permission
- Route protection middleware with glob-to-regex pattern matching
- Per-route and global rate limiting with sliding window counters
- `__sanitizeUser()`, `__sanitizeOrder()`, etc. -- per-type field sanitization
- `__autoSanitize(data, user)` -- recursive response sanitization applied to all RPC returns
- CSRF token generation and timing-safe validation
- Path normalization middleware
- CORS, CSP, HSTS header generation
- Audit event logging with database insertion and error handling

**Client-side:**
- `getAuthToken()`, `setAuthToken(token)`, `clearAuthToken()` -- token lifecycle
- Automatic `Authorization: Bearer` injection into all RPC calls
- `setUserRole(role)` -- accepts string or array for multi-role
- `can(permission)` -- UI-side permission check (advisory only)
- HttpOnly cookie mode when `storage: "cookie"` is configured

All generated code has zero runtime dependencies. The security block is designed so that adding a new route or endpoint automatically inherits the security policy. You never forget to attach middleware because there is no middleware to attach -- the compiler enforces it.
