# Middleware

Middleware functions wrap request handling, letting you run logic before and after route handlers. Common uses include logging, authentication, timing, and request transformation.

## Global Middleware

Declare middleware at the server level with the `middleware` keyword. A middleware function receives the current request and a `next` function that passes control to the next middleware (or the route handler):

```tova
server {
  middleware fn logger(req, next) {
    start = Date.now()
    result = next(req)
    duration = Date.now() - start
    print("[{req.method}] {req.url} - {duration}ms")
    result
  }
}
```

Global middleware applies to every route in the server. You can declare multiple global middleware functions, and they execute in the order they are defined:

```tova
server {
  middleware fn request_id(req, next) {
    req.id = generate_id()
    next(req)
  }

  middleware fn logger(req, next) {
    start = Date.now()
    result = next(req)
    print("[{req.id}] {req.method} {req.url} - {Date.now() - start}ms")
    result
  }

  middleware fn error_wrapper(req, next) {
    try {
      next(req)
    } catch err {
      print("Error: {err.message}")
      respond(500, { error: "Internal server error" })
    }
  }
}
```

In this example, the execution order is: `request_id` -> `logger` -> `error_wrapper` -> route handler.

## Per-Route Middleware

Attach middleware to specific routes using the `with` keyword:

```tova
route GET "/protected" with auth => handler
```

This runs the `auth` middleware before `handler`. Only this route is affected -- other routes remain unguarded.

## Multiple Middleware

Chain multiple middleware functions with commas. They execute left to right:

```tova
route DELETE "/users/:id" with auth, role("admin") => delete_user
route POST "/upload" with auth, validate_body, rate_limit(5) => upload_file
```

In the first example, `auth` runs first. If it passes, `role("admin")` runs next. Only if both succeed does `delete_user` execute.

## Middleware Execution Flow

The middleware chain forms a pipeline around the handler. Each middleware calls `next` to pass control forward, and can inspect or modify both the request and the response:

```
Request
  |
  v
middleware_1(req, next)
  |  next(req)  -->  middleware_2(req, next)
  |                    |  next(req)  -->  handler(req)
  |                    |                    |
  |                    |  <-- response <----+
  |  <-- response <----+
  |
  v
Response
```

A middleware can:
- **Modify the request** before calling `next`
- **Short-circuit** by returning a response without calling `next`
- **Modify the response** after `next` returns
- **Measure timing** by recording timestamps before and after `next`

### Modifying Requests

```tova
middleware fn add_timestamp(req, next) {
  req.received_at = Date.now()
  next(req)
}
```

### Short-Circuiting

```tova
fn auth(req, next) {
  token = req.headers["authorization"]
  if token == nil {
    respond(401, { error: "Unauthorized" })
  } else {
    req.user = verify_jwt(token)
    next(req)
  }
}
```

When `auth` returns a 401 response directly, `next` is never called and the route handler does not run.

### Modifying Responses

```tova
middleware fn add_cors_headers(req, next) {
  response = next(req)
  with_headers(response, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE"
  })
}
```

### Parameterized Middleware

Middleware that takes configuration returns a middleware function:

```tova
fn role(required_role) {
  fn(req, next) {
    if req.user.role != required_role {
      respond(403, { error: "Forbidden" })
    } else {
      next(req)
    }
  }
}

// Usage
route DELETE "/users/:id" with auth, role("admin") => delete_user
```

## Practical Tips

**Order matters for global middleware.** Declare logging and request-ID middleware first so they wrap everything. Place error-handling middleware early so it catches errors from all downstream middleware.

**Keep middleware focused.** Each middleware function should do one thing. Composing small, single-purpose middleware is easier to test and reason about than monolithic functions.

**Use short-circuiting judiciously.** Returning early from middleware is powerful for auth checks and validation, but be aware that downstream middleware and the handler will not execute.
