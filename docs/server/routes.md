# Routes

Routes are the foundation of any Tova server. They map HTTP methods and URL paths to handler functions that process requests and return responses.

## Route Declaration

Declare routes with the `route` keyword, followed by an HTTP method, a path, and a handler function:

```tova
server {
  fn get_users() -> [User] {
    UserModel.all()
  }

  fn create_user(req) {
    UserModel.create(req.body)
  }

  route GET "/api/users" => get_users
  route POST "/api/users" => create_user
}
```

## HTTP Methods

Tova supports all standard HTTP methods:

| Method | Typical Use |
|--------|-------------|
| `GET` | Retrieve resources |
| `POST` | Create resources |
| `PUT` | Replace resources |
| `DELETE` | Remove resources |
| `PATCH` | Partially update resources |
| `HEAD` | Retrieve headers only |
| `OPTIONS` | Preflight / capability checks |

```tova
server {
  route GET "/api/users" => list_users
  route POST "/api/users" => create_user
  route PUT "/api/users/:id" => replace_user
  route DELETE "/api/users/:id" => delete_user
  route PATCH "/api/users/:id" => patch_user
  route HEAD "/api/users" => users_head
  route OPTIONS "/api/users" => users_options
}
```

## Path Parameters

Use `:param` syntax to capture dynamic segments from the URL. Parameters are extracted and passed as arguments to the handler:

```tova
route GET "/users/:id" => get_user

fn get_user(id: String) {
  UserModel.find(id)
}
```

With type annotations, path parameters are automatically validated and converted:

```tova
fn get_user(id: Int) {
  // id is auto-parsed as Int; invalid values return a 400 error
  UserModel.find(id)
}
```

Multiple path parameters work as you would expect:

```tova
route GET "/users/:user_id/posts/:post_id" => get_user_post

fn get_user_post(user_id: Int, post_id: Int) {
  PostModel.where({ user_id: user_id, id: post_id })
}
```

## Route Guards and Decorators

The `with` keyword attaches middleware or guard functions to specific routes. Guards run before the handler and can reject requests early:

```tova
route GET "/admin/users" with auth => get_users
```

Chain multiple guards with commas. They execute left to right:

```tova
route DELETE "/users/:id" with auth, role("admin") => delete_user
route PUT "/settings" with auth, rate_limit(10) => update_settings
```

If any guard rejects the request, subsequent guards and the handler do not run.

## Route Groups

Use `routes` to group routes under a shared path prefix. Groups can nest:

```tova
routes "/api/v1" {
  route GET "/users" => get_users
  route POST "/users" => create_user

  routes "/admin" {
    route GET "/stats" with auth => get_stats
    route GET "/logs" with auth, role("admin") => get_logs
  }
}
```

In this example, the nested routes resolve to `/api/v1/admin/stats` and `/api/v1/admin/logs`.

## Wildcard Routes

Routes support wildcard parameters for capturing the remainder of a path:

```tova
route GET "/files/*path" => serve_file     // *param captures the rest of the URL
route GET "/proxy/*" => proxy_request      // trailing * is a catch-all
```

The wildcard value is passed to the handler as a parameter:

```tova
fn serve_file(path: String) {
  // path contains everything after /files/
  // e.g., /files/images/logo.png -> path = "images/logo.png"
  read_file("./uploads/{path}")
}
```

## Response Helpers

Tova provides built-in functions for constructing common HTTP responses.

### JSON Responses

```tova
respond(200, { data: users })           // JSON response with status 200
respond(201, user)                       // JSON response with status 201
respond(204, nil)                        // No content
```

### Custom Headers

Pass a third argument to `respond` to include custom response headers:

```tova
respond(200, data, { "X-Request-Id": req_id, "X-Total-Count": "42" })
```

### Redirects

```tova
redirect("/login")                      // 302 temporary redirect (default)
redirect("/login", 301)                 // 301 permanent redirect
```

### HTML and Text

```tova
html("<h1>Hello, world!</h1>")          // HTML response with Content-Type: text/html
text("plain text response")             // Text response with Content-Type: text/plain
```

Both `html` and `text` accept optional status code and header arguments.

## Headers and Cookies

### Setting Headers

Use `with_headers` to attach headers to a response:

```tova
response = respond(200, data)
with_headers(response, {
  "X-Custom": "value",
  "Cache-Control": "no-cache"
})
```

### Setting Cookies

`set_cookie` produces a cookie string. Attach it to the response via headers:

```tova
cookie = set_cookie("session", token, {
  httpOnly: true,
  secure: true,
  maxAge: 86400
})
with_headers(response, { "Set-Cookie": cookie })
```

Common cookie options:

| Option | Description |
|--------|-------------|
| `httpOnly` | Cookie inaccessible to client-side JavaScript |
| `secure` | Cookie only sent over HTTPS |
| `maxAge` | Lifetime in seconds |
| `path` | URL path scope |
| `sameSite` | `"Strict"`, `"Lax"`, or `"None"` |

## Streaming

Use `stream` to send chunked responses progressively:

```tova
stream(fn(send, close) {
  send("chunk 1\n")
  send("chunk 2\n")
  send("chunk 3\n")
  close()    // end the stream
})
```

This is useful for large responses, real-time data feeds, or server-side rendering where you want to flush content incrementally.

## Content Negotiation

The `negotiate` function inspects the request's `Accept` header and dispatches to the appropriate formatter:

```tova
fn get_user(req, id: Int) {
  user = UserModel.find(id)
  negotiate(req, user, {
    html: fn(data) html("<h1>{data.name}</h1>"),
    xml: fn(data) text("<user><name>{data.name}</name></user>")
  })
}
```

If the client sends `Accept: text/html`, the `html` handler is called. If it sends `Accept: application/xml`, the `xml` handler runs. JSON is the default fallback.

## Practical Tips

**Keep handlers thin.** Route handlers should validate input, call a service function, and return a response. Business logic belongs in separate functions.

**Use route groups for API versioning.** Wrapping routes in `routes "/api/v2" { ... }` makes it straightforward to maintain multiple API versions side by side.

**Prefer typed path parameters.** Adding type annotations like `id: Int` gives you automatic validation for free -- malformed parameters return a 400 error before your handler runs.

**Use guards for cross-cutting concerns.** Authentication, authorization, rate limiting, and input validation are all natural fits for the `with` decorator pattern.
