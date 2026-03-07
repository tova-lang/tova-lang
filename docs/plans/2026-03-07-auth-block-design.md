# Auth Block Design

## Overview

A new top-level `auth {}` block that declares authentication for Tova apps declaratively. Compiles to server handlers, browser components, route guards, and edge middleware automatically.

**Auth methods**: Email/password, OAuth (Google, GitHub, Apple, Discord, custom), Magic links (passwordless).

**Philosophy**: One block, complete auth. Maximum DX with maximum security. Zero boilerplate for common cases, full customization when needed.

## Syntax

### Minimal (just works)

```tova
auth {
  provider email {
    confirm_email: true
  }
}
```

### Full

```tova
auth {
  secret: env("AUTH_SECRET")
  token_expires: 900           // 15 min access token
  refresh_expires: 604800      // 7 day refresh token
  storage: "cookie"            // "cookie" (HttpOnly) | "local" (localStorage)

  provider email {
    confirm_email: true
    password_min: 8
    password_require: [uppercase, number, special]
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

  provider apple {
    client_id: env("APPLE_CLIENT_ID")
    team_id: env("APPLE_TEAM_ID")
    key_id: env("APPLE_KEY_ID")
    private_key: env("APPLE_PRIVATE_KEY")
  }

  provider magic_link {
    send: fn(email, link) {
      send_email(email, "Login to MyApp", "Click here: " ++ link)
    }
    expires: 600
  }

  provider custom "gitlab" {
    client_id: env("GITLAB_CLIENT_ID")
    client_secret: env("GITLAB_CLIENT_SECRET")
    auth_url: "https://gitlab.com/oauth/authorize"
    token_url: "https://gitlab.com/oauth/token"
    profile_url: "https://gitlab.com/api/v4/user"
    scopes: ["read_user"]
    profile_map: {
      email: "email"
      name: "name"
      avatar: "avatar_url"
    }
  }

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

  protected_route "/dashboard" { redirect: "/login" }
  protected_route "/settings/*" { redirect: "/login" }
  protected_route "/admin/*" { require: Admin, redirect: "/unauthorized" }

  loading_component: fn() { <div class="spinner" /> }
}
```

## Architecture

### AST Nodes

- `AuthBlock` — top-level container (body: Array of auth statements)
- `AuthConfigField` — key/value config (secret, token_expires, etc.)
- `AuthProviderDeclaration` — provider type + optional name + config
- `AuthHookDeclaration` — event name + handler function
- `AuthProtectedRoute` — pattern + config (redirect, require)

New AST file: `src/parser/auth-ast.js`

### Parser

New file: `src/parser/auth-parser.js` with `installAuthParser()` pattern.

Follows existing block parser conventions:
- Lazy-loaded when `auth` keyword encountered
- `parseAuthBlock()` → dispatches to sub-parsers
- `parseAuthProvider()` — handles `provider <type> [name] { ... }`
- `parseAuthHook()` — handles `on <event> fn(...) { ... }`
- `parseAuthProtectedRoute()` — handles `protected_route "pattern" { ... }`
- `parseAuthConfigField()` — handles `key: value`

`auth` keyword added to lexer token set.

### Codegen

New file: `src/codegen/auth-codegen.js` — `AuthCodegen` class with:
- `generate(authBlock, options)` — main entry, returns `{ server, browser, helpers }`
- Server code generation (endpoints, user table, token logic)
- Browser code generation (components, signals, route guards)
- Integration points with existing SecurityCodegen, ServerCodegen, BrowserCodegen

Integrated into `src/codegen/codegen.js`:
- Detects `AuthBlock` in AST
- Passes auth config to server-codegen and browser-codegen
- Auth endpoints injected before user-defined routes

### Analyzer

Added to `src/analyzer/analyzer.js`:
- `visitAuthBlock()` — validates config, providers, hooks
- Cross-block validation with security block (role references)
- Compile-time warnings (see Warnings section)

## Generated Server Endpoints

### Email/Password Provider

| Endpoint | Method | Description |
|---|---|---|
| `POST /auth/signup` | Creates user, hashes password, sends confirmation (if enabled), returns tokens |
| `POST /auth/login` | Validates credentials, lockout check, returns access + refresh tokens |
| `POST /auth/logout` | Invalidates refresh token, clears cookie |
| `POST /auth/refresh` | Rotates refresh token, issues new access token |
| `GET /auth/me` | Returns current user from token |
| `GET /auth/confirm/:token` | Confirms email address |
| `POST /auth/forgot-password` | Sends password reset link |
| `POST /auth/reset-password` | Validates reset token, updates password |

### OAuth Providers

| Endpoint | Method | Description |
|---|---|---|
| `GET /auth/oauth/:provider` | Redirects to provider consent screen (with PKCE) |
| `GET /auth/oauth/:provider/callback` | Handles callback, creates/links user, issues tokens |

### Magic Link Provider

| Endpoint | Method | Description |
|---|---|---|
| `POST /auth/magic-link` | Generates token, calls developer's send function |
| `GET /auth/magic-link/verify/:token` | Validates token, creates session, returns tokens |

## Token Strategy

- **Dual-token**: Short-lived access token (default 15min) + long-lived refresh token (default 7 days)
- **Rotation**: Each refresh issues a new refresh token; old one invalidated
- **Replay detection**: Used refresh tokens stored; reuse invalidates entire token family
- **Storage**: HttpOnly cookies by default; optional localStorage with XSS warning

## Built-in Users Table

Auto-created when auth block is present:

```
__auth_users:
  id            TEXT PRIMARY KEY (UUID)
  email         TEXT UNIQUE NOT NULL
  password_hash TEXT
  email_confirmed BOOLEAN DEFAULT false
  role          TEXT DEFAULT 'user'
  provider      TEXT           -- 'email', 'google', 'github', etc.
  provider_id   TEXT           -- external provider's user ID
  locked_until  INTEGER        -- Unix timestamp, NULL if not locked
  failed_attempts INTEGER DEFAULT 0
  created_at    INTEGER NOT NULL
  updated_at    INTEGER NOT NULL

__auth_refresh_tokens:
  id         TEXT PRIMARY KEY
  user_id    TEXT NOT NULL REFERENCES __auth_users(id)
  token_hash TEXT NOT NULL
  family     TEXT NOT NULL     -- token family for replay detection
  expires_at INTEGER NOT NULL
  used       BOOLEAN DEFAULT false
  created_at INTEGER NOT NULL

__auth_magic_tokens:
  id         TEXT PRIMARY KEY
  email      TEXT NOT NULL
  token_hash TEXT NOT NULL
  expires_at INTEGER NOT NULL
  used       BOOLEAN DEFAULT false

__auth_email_confirmations:
  id         TEXT PRIMARY KEY
  user_id    TEXT NOT NULL REFERENCES __auth_users(id)
  token_hash TEXT NOT NULL
  expires_at INTEGER NOT NULL

__auth_password_resets:
  id         TEXT PRIMARY KEY
  user_id    TEXT NOT NULL REFERENCES __auth_users(id)
  token_hash TEXT NOT NULL
  expires_at INTEGER NOT NULL
  used       BOOLEAN DEFAULT false
```

## Browser-Side Generation

### System-Injected `$` Signals

Convention: `$` prefix = framework-managed reactive state (applies to all system-injected signals across the language, not just auth).

| Signal | Type | Description |
|---|---|---|
| `$currentUser` | `User \| nil` | Current authenticated user |
| `$isAuthenticated` | `Bool` | Whether user is logged in |
| `$authLoading` | `Bool` | True during token refresh / initial load |

Plus `logout()` function (action, not signal).

### Auto-Generated Components

- `<LoginForm />` — Email/password + OAuth buttons + magic link
- `<SignupForm />` — Registration with password rules + OAuth
- `<ForgotPasswordForm />` — Email input, sends reset link
- `<ResetPasswordForm />` — New password input from reset link
- `<AuthGuard />` — Wraps content requiring auth, with fallback and role support

All components accept `on:success`, `on:error`, `redirect` props. All support render-prop override for custom markup.

### Route Guards

```tova
protected_route "/dashboard" { redirect: "/login" }
```

Compiles to route middleware checking `$isAuthenticated` / roles before rendering. Shows `loading_component` during auth check to prevent flash of protected content.

### Cross-Tab Session Sync

BroadcastChannel-based sync: logout in one tab propagates to all tabs.

## OAuth Details

### Built-in Provider Configs

| Provider | Auth URL | Token URL | Profile URL |
|---|---|---|---|
| google | accounts.google.com/o/oauth2/v2/auth | oauth2.googleapis.com/token | googleapis.com/oauth2/v2/userinfo |
| github | github.com/login/oauth/authorize | github.com/login/oauth/access_token | api.github.com/user |
| apple | appleid.apple.com/auth/authorize | appleid.apple.com/auth/token | (from id_token) |
| discord | discord.com/oauth2/authorize | discord.com/api/oauth2/token | discord.com/api/users/@me |
| custom | developer provides all URLs | developer provides | developer provides |

### Account Linking

When same email exists across providers, auto-links by default. Configurable: `auto_link: true` (default) or `auto_link: false`.

### PKCE

All OAuth flows use S256 code challenge. Code verifier stored in HttpOnly cookie during redirect.

## Security Guarantees (always on)

| Protection | Implementation |
|---|---|
| Password hashing | PBKDF2 100k iterations + random salt |
| Timing-safe comparison | `crypto.timingSafeEqual` for all token/password checks |
| PKCE for OAuth | S256 code challenge on every OAuth flow |
| CSRF protection | Double-submit cookie pattern |
| Token rotation | Refresh tokens single-use, rotated on each refresh |
| Replay detection | Used refresh tokens stored; reuse invalidates family |
| Rate limiting | Login: 5 attempts / 15 min / IP (configurable) |
| Brute-force lockout | Account locked after N failed attempts (configurable) |
| Secure cookies | HttpOnly, Secure, SameSite=Lax |
| State parameter | Crypto-random state in OAuth for CSRF prevention |
| Token hashing | Confirmation/reset/magic tokens SHA-256 hashed in DB |

## Analyzer Warnings

| Code | Trigger |
|---|---|
| `W_AUTH_HARDCODED_SECRET` | `secret: "literal"` instead of `env(...)` |
| `W_AUTH_SHORT_TOKEN` | `token_expires` < 300s |
| `W_AUTH_LONG_REFRESH` | `refresh_expires` > 30 days |
| `W_AUTH_WEAK_PASSWORD` | `password_min` < 8 |
| `W_AUTH_NO_CONFIRM` | Email provider without `confirm_email: true` |
| `W_AUTH_LOCAL_STORAGE` | `storage: "local"` (XSS risk warning) |
| `W_AUTH_MISSING_PROVIDER` | `auth {}` with no providers |
| `W_AUTH_PROTECTED_NO_REDIRECT` | `protected_route` without `redirect` |

## Integration with Existing Blocks

### security block

Auth block reads roles from security block for `protected_route { require: RoleName }` and `<AuthGuard require={RoleName}>`. Cross-validated at compile time.

### server block

`with auth` route modifier uses auth block's `__authenticate()`. `auth.user` available in authenticated route handlers.

### browser block

`$` signals injected into all components. Auth components available globally. Route guards integrated with SPA router.

### edge block

Auth block's JWT config shared with edge codegen for `__authenticate()` on edge runtimes (Web Crypto API).
