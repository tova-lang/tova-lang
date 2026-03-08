# Auth Block

The `auth {}` block is a top-level language construct in Tova that provides complete authentication for your application. Declare your providers, and the compiler generates server endpoints, browser components, route guards, and token management -- with zero runtime dependencies and compile-time security validation.

## Why a Dedicated Auth Block?

Without first-class auth support, adding authentication to a web app means:

- **Manual endpoint wiring** -- writing signup, login, logout, token refresh, password reset, email confirmation, and OAuth callback routes by hand
- **Security footguns everywhere** -- timing-safe comparison, PBKDF2 tuning, PKCE for OAuth, refresh token rotation, replay detection -- one mistake and your auth is broken
- **Scattered UI boilerplate** -- login forms, signup forms, auth guards, loading states, cross-tab session sync all written manually in every project
- **OAuth complexity** -- each provider has different URLs, scopes, profile shapes, and token formats

The `auth {}` block solves this:

- **One block, complete auth** -- declare providers and the compiler generates everything: server endpoints, database tables, browser components, and route guards
- **Always-on security** -- PBKDF2 with 100k iterations, timing-safe comparison, PKCE on every OAuth flow, refresh token rotation with replay detection, brute-force lockout
- **Compile-time validation** -- the analyzer catches hardcoded secrets, weak passwords, short tokens, missing providers, and undefined roles before your code runs
- **Zero boilerplate** -- auto-generated `<LoginForm />`, `<SignupForm />`, `<AuthGuard />`, and `$currentUser` / `$isAuthenticated` reactive signals
- **Cross-block integration** -- works with `security {}` for role-based route protection and `server {}` for `with auth` route guards

## Syntax Overview

```tova
auth {
  secret: env("AUTH_SECRET")
  token_expires: 900
  refresh_expires: 604800
  storage: "cookie"

  provider email {
    confirm_email: true
    password_min: 8
    max_attempts: 5
    lockout_duration: 900
  }

  provider google {
    client_id: env("GOOGLE_CLIENT_ID")
    client_secret: env("GOOGLE_CLIENT_SECRET")
    scopes: ["email", "profile"]
  }

  provider github {
    client_id: env("GITHUB_CLIENT_ID")
    client_secret: env("GITHUB_CLIENT_SECRET")
    scopes: ["user:email"]
  }

  provider magic_link {
    send: fn(email, link) {
      send_email(email, "Login to MyApp", "Click here: " ++ link)
    }
    expires: 600
  }

  on signup fn(user) {
    send_welcome_email(user.email)
  }

  on login fn(user) {
    update_last_login(user.id)
  }

  protected_route "/dashboard" { redirect: "/login" }
  protected_route "/admin/*" { require: Admin, redirect: "/unauthorized" }

  loading_component: fn() { <div class="spinner" /> }
}
```

## Minimal Example

The simplest auth block -- email/password authentication with sensible defaults:

```tova
auth {
  provider email {
    confirm_email: true
  }
}
```

This generates: signup, login, logout, refresh, me, forgot-password, and reset-password endpoints; a built-in users table; JWT tokens stored in HttpOnly cookies; `$currentUser` and `$isAuthenticated` signals; and `<LoginForm />` / `<SignupForm />` components.

## Config Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `secret` | Expression | `env("AUTH_SECRET")` | JWT signing secret. Use `env()` -- hardcoded strings trigger a warning |
| `token_expires` | Int | `900` | Access token lifetime in seconds (15 minutes) |
| `refresh_expires` | Int | `604800` | Refresh token lifetime in seconds (7 days) |
| `storage` | String | `"cookie"` | Token storage: `"cookie"` (HttpOnly) or `"local"` (localStorage) |

## Providers

### Email/Password

The `email` provider generates signup and login endpoints with password hashing, brute-force lockout, email confirmation, and password reset.

```tova
auth {
  provider email {
    confirm_email: true
    password_min: 8
    max_attempts: 5
    lockout_duration: 900
  }
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `confirm_email` | Bool | `false` | Require email confirmation before login |
| `password_min` | Int | `8` | Minimum password length |
| `max_attempts` | Int | `5` | Failed login attempts before lockout |
| `lockout_duration` | Int | `900` | Lockout duration in seconds (15 minutes) |

Passwords are hashed with PBKDF2 (100,000 iterations, SHA-512, random salt). All comparisons use `crypto.timingSafeEqual`.

### OAuth Providers

Built-in support for Google, GitHub, Apple, and Discord. Each requires a `client_id` and `client_secret`:

```tova
auth {
  provider google {
    client_id: env("GOOGLE_CLIENT_ID")
    client_secret: env("GOOGLE_CLIENT_SECRET")
    scopes: ["email", "profile"]
  }

  provider github {
    client_id: env("GITHUB_CLIENT_ID")
    client_secret: env("GITHUB_CLIENT_SECRET")
    scopes: ["user:email"]
  }

  provider apple {
    client_id: env("APPLE_CLIENT_ID")
    client_secret: env("APPLE_CLIENT_SECRET")
  }

  provider discord {
    client_id: env("DISCORD_CLIENT_ID")
    client_secret: env("DISCORD_CLIENT_SECRET")
    scopes: ["identify", "email"]
  }
}
```

All OAuth flows use PKCE (S256 code challenge) and a cryptographic `state` parameter. The code verifier is stored in an HttpOnly cookie during the redirect.

**Apple** is handled specially: Apple does not expose a profile URL, so user data is extracted from the `id_token` JWT returned in the token response.

**Account linking**: When a user signs in via OAuth with the same email as an existing account, the accounts are linked automatically.

### Custom OAuth Providers

For any OAuth 2.0 provider not built in, use `provider custom`:

```tova
auth {
  provider custom "gitlab" {
    client_id: env("GITLAB_CLIENT_ID")
    client_secret: env("GITLAB_CLIENT_SECRET")
    auth_url: "https://gitlab.com/oauth/authorize"
    token_url: "https://gitlab.com/oauth/token"
    profile_url: "https://gitlab.com/api/v4/user"
    scopes: ["read_user"]
  }
}
```

The custom provider generates the same PKCE-secured OAuth flow as built-in providers, using the URLs you specify.

### Magic Links

Passwordless authentication via email link:

```tova
auth {
  provider magic_link {
    send: fn(email, link) {
      send_email(email, "Login to MyApp", "Click here: " ++ link)
    }
    expires: 600
  }
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `send` | Function | required | Called with `(email, link)` to deliver the magic link |
| `expires` | Int | `600` | Token lifetime in seconds (10 minutes) |

The `send` function is your responsibility -- use it to call your email service. The compiler generates the token, hashes it, stores it, and verifies it on click.

## Event Hooks

React to authentication lifecycle events:

```tova
auth {
  on signup fn(user) {
    send_welcome_email(user.email)
  }

  on login fn(user) {
    update_last_login(user.id)
  }

  on logout fn(user) {
    // cleanup
  }

  on oauth_link fn(user, provider, profile) {
    user.avatar = profile.picture
  }
}
```

| Event | Arguments | When |
|---|---|---|
| `signup` | `(user)` | After a new user is created (any provider) |
| `login` | `(user)` | After successful authentication (any provider) |
| `logout` | `(user)` | After logout |
| `oauth_link` | `(user, provider, profile)` | When an OAuth login links to an existing user |

## Protected Routes

Guard browser routes by authentication status or role:

```tova
auth {
  protected_route "/dashboard" { redirect: "/login" }
  protected_route "/settings/*" { redirect: "/login" }
  protected_route "/admin/*" { require: Admin, redirect: "/unauthorized" }
}
```

- `redirect` -- where to send unauthenticated users
- `require` -- role name (validated against `security {}` block roles at compile time)
- `*` -- wildcard matching within path segments

The route guard checks `$isAuthenticated` and optionally the user's role. During the initial auth check, the `loading_component` is shown to prevent a flash of protected content.

## Generated Server Endpoints

The auth block generates these endpoints automatically:

### Email/Password

| Endpoint | Method | Description |
|---|---|---|
| `POST /auth/signup` | Creates user, hashes password, returns tokens (or sends confirmation) |
| `POST /auth/login` | Validates credentials, lockout check, returns access + refresh tokens |
| `POST /auth/logout` | Invalidates session, clears cookie |
| `POST /auth/refresh` | Rotates refresh token, issues new access token |
| `GET /auth/me` | Returns current user from token |
| `POST /auth/confirm` | Confirms email address (when `confirm_email: true`) |
| `POST /auth/forgot-password` | Generates password reset token |
| `POST /auth/reset-password` | Validates reset token, updates password |

### OAuth

| Endpoint | Method | Description |
|---|---|---|
| `GET /auth/oauth/:provider` | Redirects to provider consent screen (with PKCE) |
| `GET /auth/oauth/:provider/callback` | Handles callback, creates/links user, issues tokens |

### Magic Link

| Endpoint | Method | Description |
|---|---|---|
| `POST /auth/magic-link` | Generates token, calls your `send` function |
| `GET /auth/magic-link/verify/:token` | Validates token, creates session, redirects |

## Token Strategy

- **Dual-token**: Short-lived access token (default 15 min) + long-lived refresh token (default 7 days)
- **Rotation**: Each refresh issues a new refresh token; the old one is invalidated
- **Replay detection**: Used refresh tokens are tracked. If a used token is presented, the entire token family is invalidated -- this detects token theft
- **Storage**: HttpOnly cookies by default (`storage: "cookie"`). Optional localStorage with a compile-time XSS warning (`storage: "local"`)

## Built-in Users Table

The auth block auto-creates SQLite tables when present:

```
__auth_users
  id              TEXT PRIMARY KEY (UUID)
  email           TEXT UNIQUE NOT NULL
  password_hash   TEXT
  email_confirmed INTEGER DEFAULT 0
  role            TEXT DEFAULT 'user'
  provider        TEXT
  provider_id     TEXT
  locked_until    INTEGER
  failed_attempts INTEGER DEFAULT 0
  created_at      INTEGER NOT NULL
  updated_at      INTEGER NOT NULL

__auth_refresh_tokens
  id         TEXT PRIMARY KEY
  user_id    TEXT NOT NULL
  token_hash TEXT NOT NULL
  family     TEXT NOT NULL
  expires_at INTEGER NOT NULL
  used       INTEGER DEFAULT 0
  created_at INTEGER NOT NULL

__auth_magic_tokens
  id         TEXT PRIMARY KEY
  email      TEXT NOT NULL
  token_hash TEXT NOT NULL
  expires_at INTEGER NOT NULL
  used       INTEGER DEFAULT 0

__auth_email_confirmations
  id         TEXT PRIMARY KEY
  user_id    TEXT NOT NULL
  token_hash TEXT NOT NULL
  expires_at INTEGER NOT NULL

__auth_password_resets
  id         TEXT PRIMARY KEY
  user_id    TEXT NOT NULL
  token_hash TEXT NOT NULL
  expires_at INTEGER NOT NULL
  used       INTEGER DEFAULT 0
```

All tokens (confirmation, reset, magic link, refresh) are SHA-256 hashed before storage. Raw tokens are never persisted.

## Browser-Side Generation

### Reactive Signals

The auth block injects three `$`-prefixed reactive signals into your browser scope:

| Signal | Type | Description |
|---|---|---|
| `$currentUser` | `User \| nil` | The authenticated user object, or `nil` |
| `$isAuthenticated` | `Bool` | Whether a user is logged in |
| `$authLoading` | `Bool` | `true` during initial auth check and token refresh |

The `$` prefix denotes framework-managed reactive state. These are regular Tova signals -- use them in JSX like any other state:

```tova
browser {
  component Header {
    if $isAuthenticated {
      <p>"Welcome, {$currentUser.email}"</p>
      <button onclick={fn() logout()}>"Log out"</button>
    } else {
      <a href="/login">"Sign in"</a>
    }
  }
}
```

The `logout()` function is also injected and handles clearing the session, updating signals, and notifying other tabs.

### Auto-Generated Components

When the `email` provider is present, these components are generated:

| Component | Description |
|---|---|
| `<LoginForm />` | Email/password form with OAuth provider buttons |
| `<SignupForm />` | Registration form |
| `<ForgotPasswordForm />` | Email input, sends reset link |
| `<ResetPasswordForm />` | New password input from reset link |
| `<AuthGuard />` | Wraps content requiring authentication |

All components accept `onSuccess` and `redirect` props:

```tova
browser {
  component LoginPage {
    <div class="login-page">
      <h1>"Sign In"</h1>
      <LoginForm redirect="/dashboard" />
    </div>
  }
}
```

OAuth buttons are automatically added to `<LoginForm />` based on the configured OAuth providers.

### AuthGuard

Wrap content that requires authentication:

```tova
browser {
  component Dashboard {
    <AuthGuard require="Admin" fallback={<p>"Access denied"</p>}>
      <h1>"Admin Dashboard"</h1>
      <AdminPanel />
    </AuthGuard>
  }
}
```

| Prop | Type | Description |
|---|---|---|
| `require` | String? | Role name required for access |
| `fallback` | Element? | Shown when not authenticated or wrong role |
| `loading` | Element? | Shown during initial auth check |

### Cross-Tab Session Sync

The auth block uses `BroadcastChannel` to synchronize authentication state across browser tabs. When a user logs out in one tab, all other tabs update automatically. When a user logs in, other tabs refresh their auth state.

## Security Guarantees

These protections are always on -- they cannot be disabled:

| Protection | Implementation |
|---|---|
| Password hashing | PBKDF2, 100,000 iterations, SHA-512, random salt |
| Timing-safe comparison | `crypto.timingSafeEqual` for all token and password checks |
| PKCE for OAuth | S256 code challenge on every OAuth flow |
| Token rotation | Refresh tokens are single-use, rotated on each refresh |
| Replay detection | Used refresh tokens tracked; reuse invalidates entire family |
| Rate limiting | Login: 5 attempts / 15 min / IP (configurable) |
| Brute-force lockout | Account locked after N failed attempts (configurable) |
| Secure cookies | HttpOnly, Secure, SameSite=Lax (when `storage: "cookie"`) |
| State parameter | Crypto-random state in OAuth for CSRF prevention |
| Token hashing | All tokens (confirmation, reset, magic, refresh) SHA-256 hashed in DB |

## Compile-Time Warnings

The analyzer validates your auth configuration and produces warnings:

| Code | Trigger |
|---|---|
| `W_AUTH_HARDCODED_SECRET` | `secret: "literal"` instead of `env(...)` |
| `W_AUTH_SHORT_TOKEN` | `token_expires` < 300 seconds |
| `W_AUTH_LONG_REFRESH` | `refresh_expires` > 30 days |
| `W_AUTH_WEAK_PASSWORD` | `password_min` < 8 |
| `W_AUTH_NO_CONFIRM` | Email provider without `confirm_email: true` |
| `W_AUTH_LOCAL_STORAGE` | `storage: "local"` (XSS risk) |
| `W_AUTH_MISSING_PROVIDER` | `auth {}` block with no providers |
| `W_AUTH_PROTECTED_NO_REDIRECT` | `protected_route` without `redirect` |
| `W_AUTH_DUPLICATE_PROVIDER` | Same provider type declared twice |
| `W_AUTH_UNKNOWN_HOOK` | Unrecognized event name in `on` declaration |
| `W_AUTH_UNKNOWN_ROLE` | `protected_route { require: RoleName }` references undefined role |

## Integration with Other Blocks

### security block

The auth block reads roles from the `security {}` block for role-based route protection. Role references in `protected_route { require: RoleName }` and `<AuthGuard require="RoleName">` are cross-validated at compile time:

```tova
security {
  role Admin {
    can: [manage_users, view_analytics]
  }

  role User {
    can: [view_profile]
  }
}

auth {
  provider email {}

  // "Admin" is validated against security block roles
  protected_route "/admin/*" { require: Admin, redirect: "/login" }
}
```

### server block

Server routes with `with auth` use the auth block's `__authenticate()` function. The authenticated user is available as `auth.user` in route handlers:

```tova
auth {
  provider email {}
}

server {
  route GET "/api/profile" with auth => fn(req) {
    respond(200, { user: req.user })
  }
}
```

### browser block

The `$currentUser`, `$isAuthenticated`, and `$authLoading` signals are injected into all browser components. Auth components (`<LoginForm />`, `<SignupForm />`, etc.) are available globally. Route guards integrate with the SPA router.

### edge block

The auth block's JWT configuration is shared with edge codegen for token verification on edge runtimes using the Web Crypto API.

## Full Example

A complete app with email/password auth, Google OAuth, role-based access, and protected routes:

```tova
security {
  role Admin {
    can: [manage_users, view_analytics]
  }

  role User {
    can: [view_profile, edit_profile]
  }
}

auth {
  secret: env("AUTH_SECRET")
  token_expires: 900
  refresh_expires: 604800
  storage: "cookie"

  provider email {
    confirm_email: true
    password_min: 10
    max_attempts: 5
    lockout_duration: 900
  }

  provider google {
    client_id: env("GOOGLE_CLIENT_ID")
    client_secret: env("GOOGLE_CLIENT_SECRET")
    scopes: ["email", "profile"]
  }

  on signup fn(user) {
    send_welcome_email(user.email)
  }

  on login fn(user) {
    db.run("UPDATE users SET last_login = ? WHERE id = ?", [Date.now(), user.id])
  }

  protected_route "/dashboard" { redirect: "/login" }
  protected_route "/admin/*" { require: Admin, redirect: "/unauthorized" }
}

server {
  db { adapter: "sqlite", database: "app.db" }

  fn get_dashboard(req) {
    respond(200, { message: "Welcome, {req.user.email}" })
  }

  route GET "/api/dashboard" with auth => get_dashboard
}

browser {
  component App {
    if $authLoading {
      <div class="spinner" />
    } elif $isAuthenticated {
      <div>
        <h1>"Welcome, {$currentUser.email}"</h1>
        <button onclick={fn() logout()}>"Log out"</button>
      </div>
    } else {
      <div>
        <h1>"Please sign in"</h1>
        <LoginForm redirect="/dashboard" />
      </div>
    }
  }
}
```

## Auth Block vs Manual Auth

Tova supports two approaches to authentication:

| | Auth Block (`auth {}`) | Manual (in `server {}`) |
|---|---|---|
| Setup | Declarative, one block | Write every endpoint manually |
| Endpoints | Auto-generated (12+ routes) | Hand-coded per route |
| OAuth | Built-in PKCE, state, providers | Manual OAuth flow implementation |
| Browser | Auto `$currentUser`, components | Manual signals and forms |
| Security | Always-on (PBKDF2, timing-safe, replay detection) | Your responsibility |
| Flexibility | Hooks for customization | Full control |

Use the `auth {}` block for most applications. Use manual auth (documented in [Server Authentication](/server/auth)) when you need complete control over the authentication flow or are integrating with an external auth service.
