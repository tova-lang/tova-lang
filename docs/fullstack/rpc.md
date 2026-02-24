# RPC Bridge

The RPC (Remote Procedure Call) bridge is the mechanism that lets client code call server functions as if they were local. When you write `server.get_users()` in a `client` block, the compiler transforms it into an async HTTP request to the server, handles serialization, and returns the result. You never write fetch calls, parse JSON, or manage endpoints manually.

## How It Works

The RPC bridge has two sides:

1. **Server side:** Each function defined in a `server` block gets a `POST /rpc/<function_name>` endpoint. The endpoint reads the request body, extracts arguments, calls the function, and returns the result as JSON.

2. **Client side:** A Proxy-based `server` object intercepts property access. When you call `server.get_users()`, the proxy delegates to an async `rpc()` function that performs a `fetch()` to the matching endpoint.

The compiler automatically wires both sides. You define a function in `server {}`, call it from `client {}` as `server.fn_name()`, and everything in between is generated.

## Server Side: RPC Endpoints

For each function in a `server` block, the compiler generates a POST endpoint:

```tova
server {
  fn get_users() -> [User] {
    UserModel.all()
  }

  fn create_user(name: String, email: String) -> User {
    UserModel.create({ name, email })
  }
}
```

This generates:

```javascript
// POST /rpc/get_users
__addRoute("POST", "/rpc/get_users", async (req) => {
  const body = await req.json();
  const result = await get_users();
  return Response.json({ result });
});

// POST /rpc/create_user
__addRoute("POST", "/rpc/create_user", async (req) => {
  const body = await req.json();
  const name = body.__args ? body.__args[0] : body.name;
  const email = body.__args ? body.__args[1] : body.email;
  const __validationErrors = [];
  if (name === undefined || name === null) __validationErrors.push("name is required");
  else if (typeof name !== "string") __validationErrors.push("name must be a string");
  if (email === undefined || email === null) __validationErrors.push("email is required");
  else if (typeof email !== "string") __validationErrors.push("email must be a string");
  if (__validationErrors.length > 0)
    return Response.json({ error: "Validation failed", details: __validationErrors }, { status: 400 });
  const result = await create_user(name, email);
  return Response.json({ result });
});
```

Key details:

- **Endpoint pattern:** `POST /rpc/<function_name>`
- **Request body:** The endpoint accepts either `{ "__args": [arg1, arg2, ...] }` (positional) or `{ "name": "alice", "email": "a@b.com" }` (named). Positional format is used by the auto-generated client proxy; named format is useful for external callers.
- **Validation:** When parameters have type annotations (`name: String`, `email: String`), the compiler generates validation checks. If validation fails, the endpoint returns a `400` status with error details before the function body ever runs.
- **Response:** Always `{ "result": <return_value> }`.

## Client Side: The Server Proxy

The client output includes a Proxy-based `server` object and an `rpc()` function:

```javascript
import { rpc } from './runtime/rpc.js';

const server = new Proxy({}, {
  get(_, name) {
    return (...args) => rpc(name, args);
  }
});
```

When you write `server.get_users()` in Tova, the generated JavaScript calls `rpc("get_users", [])`. When you write `server.create_user("alice", "alice@example.com")`, it calls `rpc("create_user", ["alice", "alice@example.com"])`.

### The `rpc()` Function

The `rpc()` function lives in `src/runtime/rpc.js` and handles the HTTP communication. It includes CSRF protection, request timeouts, and interceptor middleware:

```javascript
export async function rpc(functionName, args = []) {
  const url = `${config.base}/rpc/${functionName}`;

  // Build body from args
  let body;
  if (args.length === 1 && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    body = args[0];              // Single object arg: send as-is
  } else if (args.length > 0) {
    body = { __args: args };     // Multiple args: send as array
  } else {
    body = {};                   // No args
  }

  // Headers include CSRF token when available
  const headers = { 'Content-Type': 'application/json' };
  const csrf = getCSRFToken();
  if (csrf) headers['X-Tova-CSRF'] = csrf;

  // Request with AbortController timeout (30s default)
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    credentials: config.credentials, // 'same-origin' by default
    signal: controller.signal,
  });

  const data = await response.json();
  return data.result;
}
```

Key details:

- **Base URL:** Determined by `window.__TOVA_RPC_BASE` (defaults to same origin in the browser, `http://localhost:3000` for non-browser contexts).
- **Single object argument:** If you pass a single object, it is sent directly as the body (useful for structured payloads).
- **Multiple arguments:** Wrapped in `{ "__args": [arg1, arg2, ...] }`.
- **No arguments:** Empty body `{}`.
- **Error handling:** Non-OK responses throw an error with the status code and response text. Errors include `.status` and `.functionName` properties.
- **Return value:** The `.result` field from the JSON response is unwrapped and returned.
- **CSRF protection:** Automatically attaches a CSRF token header when available (see [CSRF Protection](#csrf-protection) below).
- **Timeout:** Requests abort after 30 seconds by default (see [Configuration](#rpc-configuration)).
- **Interceptors:** Request, response, and error interceptors can modify behavior (see [Interceptors](#request-interceptors)).

## Automatic Async Handling

The compiler is smart about `async/await`. When it detects a `server.fn_name()` call inside an effect, event handler, or function body, it automatically wraps the containing function as `async` and adds `await` to the RPC call:

```tova
client {
  effect {
    users = server.get_users()
  }

  fn handle_submit() {
    result = server.create_user(name, email)
    users = [...users, result]
  }
}
```

Compiles to:

```javascript
createEffect(async () => {
  setUsers(await server.get_users());
});

async function handle_submit() {
  const result = await server.create_user(name(), email());
  setUsers([...users(), result]);
}
```

The compiler walks the AST to detect whether a function or effect body contains any `server.xxx()` calls. If it does, the function is marked `async` and each RPC call gets `await`. You never need to write `async` or `await` explicitly for RPC.

This also works with pipe expressions. When a pipe chain involves an RPC call, the compiler automatically awaits the result:

```tova
client {
  fn load_active_names() {
    names = server.get_users() |> filter(fn(u) u.active) |> map(fn(u) u.name)
  }
}
```

The `server.get_users()` call within the pipe is automatically awaited before the result flows through the rest of the pipeline.

## Full Example: Tova to Generated JS

Here is a complete example showing both the Tova source and the generated JavaScript on each side.

### Tova Source

```tova
shared {
  type User { id: Int, name: String, email: String }
}

server {
  db { path: "./data.db" }
  model User

  fn get_users() -> [User] {
    UserModel.all()
  }

  fn create_user(name: String, email: String) -> User {
    UserModel.create({ name, email })
  }
}

client {
  state users: [User] = []
  state name = ""
  state email = ""

  effect {
    users = server.get_users()
  }

  fn handle_create() {
    new_user = server.create_user(name, email)
    users = [...users, new_user]
    name = ""
    email = ""
  }

  component App {
    <div>
      <h1>Users</h1>
      <ul>
        for user in users {
          <li>{user.name} ({user.email})</li>
        }
      </ul>
      <input value={name} on:input={fn(e) { name = e.target.value }} placeholder="Name" />
      <input value={email} on:input={fn(e) { email = e.target.value }} placeholder="Email" />
      <button on:click={handle_create}>Create User</button>
    </div>
  }
}
```

### Generated Server (simplified)

```javascript
// app.server.js
import { User } from './app.shared.js';

// ... database setup, model registration ...

function get_users() {
  return UserModel.all();
}

function create_user(name, email) {
  return UserModel.create({ name, email });
}

// RPC Endpoints
__addRoute("POST", "/rpc/get_users", async (req) => {
  const body = await req.json();
  const result = await get_users();
  return Response.json({ result });
});

__addRoute("POST", "/rpc/create_user", async (req) => {
  const body = await req.json();
  const name = body.__args ? body.__args[0] : body.name;
  const email = body.__args ? body.__args[1] : body.email;
  const __validationErrors = [];
  if (name === undefined || name === null) __validationErrors.push("name is required");
  else if (typeof name !== "string") __validationErrors.push("name must be a string");
  if (email === undefined || email === null) __validationErrors.push("email is required");
  else if (typeof email !== "string") __validationErrors.push("email must be a string");
  if (__validationErrors.length > 0)
    return Response.json({ error: "Validation failed", details: __validationErrors }, { status: 400 });
  const result = await create_user(name, email);
  return Response.json({ result });
});

// ... Bun.serve() startup ...
```

### Generated Client (simplified)

```javascript
// app.client.js
import { createSignal, createEffect, mount, tova_el } from './runtime/reactivity.js';
import { rpc } from './runtime/rpc.js';

const server = new Proxy({}, {
  get(_, name) { return (...args) => rpc(name, args); }
});

const [users, setUsers] = createSignal([]);
const [name, setName] = createSignal("");
const [email, setEmail] = createSignal("");

createEffect(async () => {
  setUsers(await server.get_users());
});

async function handle_create() {
  const new_user = await server.create_user(name(), email());
  setUsers([...users(), new_user]);
  setName("");
  setEmail("");
}

function App() {
  return tova_el("div", {},
    tova_el("h1", {}, "Users"),
    tova_el("ul", {},
      () => users().map(user =>
        tova_el("li", {}, () => `${user.name} (${user.email})`)
      )
    ),
    tova_el("input", { value: name, oninput: (e) => setName(e.target.value), placeholder: "Name" }),
    tova_el("input", { value: email, oninput: (e) => setEmail(e.target.value), placeholder: "Email" }),
    tova_el("button", { onclick: handle_create }, "Create User")
  );
}

mount(App, document.getElementById("app"));
```

## RPC with Arguments

Arguments are serialized as a JSON array and spread into the server function's parameters on the other side:

```tova
// Client calls:
server.search_users("alice", 10, true)

// Sends HTTP POST to /rpc/search_users:
// Body: { "__args": ["alice", 10, true] }

// Server endpoint extracts:
// query = body.__args[0]   -> "alice"
// limit = body.__args[1]   -> 10
// active = body.__args[2]  -> true
// Then calls: search_users("alice", 10, true)
```

If you pass a single object argument, it is sent directly as the body (not wrapped in `__args`):

```tova
// Client calls:
server.create_user({ name: "Alice", email: "alice@example.com" })

// Sends HTTP POST to /rpc/create_user:
// Body: { "name": "Alice", "email": "alice@example.com" }
```

## RPC Configuration {#rpc-configuration}

By default, RPC calls use the same origin as the page (in the browser) or `http://localhost:3000` (in non-browser contexts). Use `configureRPC` to customize behavior:

```javascript
import { configureRPC } from './runtime/rpc.js';

// Simple: just set the base URL (backward compatible)
configureRPC("https://api.example.com");

// Full: pass an options object
configureRPC({
  baseUrl: "https://api.example.com",
  timeout: 15000,                   // 15s timeout (default: 30000)
  csrfToken: "my-csrf-token",       // Set CSRF token manually
  csrfHeader: "X-Custom-CSRF",      // Custom header name (default: "X-Tova-CSRF")
  credentials: "include",           // fetch credentials mode (default: "same-origin")
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | String | `''` (same origin) | Base URL for all RPC calls |
| `timeout` | Number | `30000` | Request timeout in milliseconds. Set to `0` to disable |
| `csrfToken` | String | `null` | CSRF token value (auto-detected from meta tag if not set) |
| `csrfHeader` | String | `'X-Tova-CSRF'` | HTTP header name for the CSRF token |
| `credentials` | String | `'same-origin'` | fetch `credentials` mode (`'same-origin'`, `'include'`, `'omit'`) |

You can also set the base URL via a global:

```javascript
window.__TOVA_RPC_BASE = "https://api.example.com";
```

## CSRF Protection {#csrf-protection}

Tova's RPC bridge includes built-in CSRF (Cross-Site Request Forgery) protection. When a CSRF token is available, it is automatically included as a custom HTTP header on every RPC request.

### Automatic Detection

If your server renders a `<meta>` tag with the token, Tova detects it automatically:

```html
<!-- Server-rendered HTML -->
<meta name="csrf-token" content="abc123-token-value">
```

No client-side setup is needed — the RPC bridge reads the token from the meta tag on the first request.

### Manual Token Management

For SPAs or cases where the token is provided differently:

```javascript
import { setCSRFToken } from './runtime/rpc.js';

// Set the token after login or page load
setCSRFToken("abc123-token-value");
```

### Server-Side Validation

Your server should validate the CSRF header on every RPC request:

```tova
server {
  fn validate_csrf(req) {
    token = req.headers.get("X-Tova-CSRF")
    if token != expected_token {
      // Reject the request
    }
  }
}
```

## Request Interceptors {#request-interceptors}

Interceptors let you add cross-cutting concerns to all RPC calls — authentication headers, logging, error reporting, response transformation, and more.

### Adding an Interceptor

```javascript
import { addRPCInterceptor } from './runtime/rpc.js';

const removeInterceptor = addRPCInterceptor({
  // Called before each request — modify headers, add auth, log, etc.
  request({ url, functionName, args, options }) {
    options.headers['Authorization'] = 'Bearer ' + getAuthToken();
    return options;
  },

  // Called after a successful response — transform data, log, etc.
  response(data, { url, functionName, args, response }) {
    console.log(`RPC ${functionName} completed`);
    return data; // return modified data, or undefined to keep original
  },

  // Called when an error occurs — log, report, suppress, etc.
  error(err, { url, functionName, args, response }) {
    reportError(err);
    // Return false to suppress the error (prevents throw)
    // Return anything else (or undefined) to let it propagate
  },
});

// Later, remove the interceptor:
removeInterceptor();
```

### Interceptor Hooks

| Hook | Arguments | Return | Description |
|------|-----------|--------|-------------|
| `request` | `{ url, functionName, args, options }` | Modified `options` object, or `undefined` | Runs before `fetch()`. Return modified request options to override headers, body, etc. |
| `response` | `(data, { url, functionName, args, response })` | Modified `data`, or `undefined` | Runs after a successful response. Return transformed data or `undefined` to keep the original |
| `error` | `(error, { url, functionName, args, response? })` | `false` to suppress | Runs on request failure or non-OK response. Return `false` to suppress the error |

All hooks are optional — include only the ones you need.

### Common Patterns

**Authentication:**

```javascript
addRPCInterceptor({
  request({ options }) {
    options.headers['Authorization'] = `Bearer ${getToken()}`;
    return options;
  },
  error(err) {
    if (err.status === 401) {
      redirectToLogin();
      return false; // suppress the error
    }
  },
});
```

**Request logging:**

```javascript
addRPCInterceptor({
  request({ functionName, args }) {
    console.log(`→ RPC ${functionName}`, args);
  },
  response(data, { functionName }) {
    console.log(`← RPC ${functionName}`, data);
  },
});
```

## Limitations and Considerations

### Serialization

All arguments and return values must be JSON-serializable. Functions, class instances with methods, circular references, and other non-serializable values cannot be passed through RPC.

```tova
// Works: primitives, arrays, plain objects
server.create_user("Alice", 25)
server.update_settings({ theme: "dark", notifications: true })

// Does NOT work: functions, DOM nodes, etc.
server.process(fn(x) { x + 1 })  // Functions are not serializable
```

### Error Handling

When a server function throws an error or the HTTP request fails, the RPC call throws on the client side:

```tova
client {
  fn handle_action() {
    match server.risky_operation() {
      Ok(result) => show_success(result)
      Err(error) => show_error(error)
    }
  }
}
```

Non-OK HTTP responses (400, 500, etc.) cause the `rpc()` function to throw an `Error` with the status code and response text.

### No Streaming

RPC calls are request-response. The client sends a request, the server processes it, and returns a complete result. For streaming data, use WebSocket or Server-Sent Events instead.

### Security

RPC endpoints are standard HTTP POST endpoints. They are accessible to anyone who can reach the server. Tova provides several built-in security mechanisms:

- **CSRF protection:** The RPC bridge automatically attaches a CSRF token header to every request (see [CSRF Protection](#csrf-protection)). Configure your server to validate this token.
- **Request timeouts:** All requests abort after 30 seconds by default, preventing hung connections. Configure via `configureRPC({ timeout: ms })`.
- **Input validation:** When server functions have type annotations, the compiler generates validation checks that reject invalid input before your function body runs.
- **Credentials control:** The `credentials` option (default `'same-origin'`) controls whether cookies are sent with cross-origin requests.

Always validate inputs on the server side, implement authentication for sensitive operations, and never trust client-supplied data.

### Performance

Each `server.fn_name()` call is a full HTTP round-trip. Avoid calling server functions in tight loops. Instead, design server functions that return batches of data:

```tova
// Bad: N+1 calls
client {
  fn load_details() {
    for id in user_ids {
      detail = server.get_user(id)    // One HTTP call per user
    }
  }
}

// Good: single batch call
client {
  fn load_details() {
    details = server.get_users_batch(user_ids)    // One HTTP call total
  }
}
```

## Related Pages

- [Architecture Overview](./architecture) -- the three-block model
- [Server Block](./server-block) -- defining server functions
- [Client Block](./client-block) -- calling server functions from the UI
- [Named Blocks](./named-blocks) -- cross-server RPC between named blocks
- [Compilation](./compilation) -- how RPC code is generated
