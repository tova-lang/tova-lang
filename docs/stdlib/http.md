# HTTP

Tova's `http` namespace provides a complete HTTP client for making network requests. Every method returns a `Result<Response, String>`, integrating naturally with Tova's error-handling model. Request bodies are auto-serialized and response bodies are auto-parsed, so working with JSON APIs requires no manual encoding or decoding.

---

## GET

### http.get

```tova
http.get(url, opts?) -> Result<Response, String>
```

Sends an HTTP GET request. The response body is automatically parsed as JSON when the server returns `application/json`, otherwise it is returned as a plain text string.

```tova
// Simple GET
result = http.get("https://api.example.com/users")
response = result.unwrap()
response.status   // 200
response.ok       // true
response.body     // [{ id: 1, name: "Alice" }, ...]

// GET with options
result = http.get("https://api.example.com/users", {
  headers: { "Accept": "application/json" },
  timeout: 5000
})
```

---

## POST

### http.post

```tova
http.post(url, body, opts?) -> Result<Response, String>
```

Sends an HTTP POST request. Objects passed as `body` are automatically serialized to JSON and the `Content-Type` header is set to `application/json`.

```tova
// POST JSON
result = http.post("https://api.example.com/users", {
  name: "Alice",
  email: "alice@example.com"
})
response = result.unwrap()
response.status   // 201
response.body     // { id: 42, name: "Alice", email: "alice@example.com" }

// POST with custom headers
result = http.post("https://api.example.com/events", { type: "click" }, {
  headers: { "X-Request-Id": uuid() }
})
```

---

## PUT

### http.put

```tova
http.put(url, body, opts?) -> Result<Response, String>
```

Sends an HTTP PUT request. Body serialization follows the same rules as `http.post`.

```tova
result = http.put("https://api.example.com/users/42", {
  name: "Alice Updated",
  email: "alice-new@example.com"
})
response = result.unwrap()
response.status   // 200
```

---

## PATCH

### http.patch

```tova
http.patch(url, body, opts?) -> Result<Response, String>
```

Sends an HTTP PATCH request for partial updates.

```tova
result = http.patch("https://api.example.com/users/42", {
  email: "alice-patched@example.com"
})
response = result.unwrap()
response.ok   // true
```

---

## DELETE

### http.delete

```tova
http.delete(url, opts?) -> Result<Response, String>
```

Sends an HTTP DELETE request.

```tova
result = http.delete("https://api.example.com/users/42")
response = result.unwrap()
response.status   // 204
```

---

## HEAD

### http.head

```tova
http.head(url, opts?) -> Result<Response, String>
```

Sends an HTTP HEAD request. The response contains only headers and status -- no body.

```tova
result = http.head("https://api.example.com/health")
response = result.unwrap()
response.status              // 200
response.headers["x-version"]   // "1.4.0"
```

---

## Streaming

### http.get_stream

```tova
http.get_stream(url, opts?) -> Result<StreamResponse, String>
```

Sends a GET request and returns the body as a `ReadableStream` instead of a fully buffered value. Use this for large downloads or server-sent events where processing data chunk-by-chunk is preferable to loading the entire response into memory.

```tova
result = http.get_stream("https://api.example.com/large-export.csv")
response = result.unwrap()
response.status   // 200
response.body     // ReadableStream
```

You can also enable streaming on any method by setting `stream: true` in the options:

```tova
result = http.post("https://api.example.com/generate", { prompt: "Hello" }, {
  stream: true
})
response = result.unwrap()
// response.body is a ReadableStream
```

---

## Options

All HTTP methods accept an optional options object as their last argument.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| headers | Object | {} | Custom request headers |
| bearer | String | - | Bearer token (sets Authorization header) |
| timeout | Int | 30000 | Request timeout in milliseconds |
| retries | Int | 0 | Number of retry attempts on failure |
| retry_delay | Int | 1000 | Base delay between retries (multiplied by attempt number) |
| follow_redirects | Bool | true | Follow HTTP redirects (false = manual) |
| params | Object | - | Query parameters appended to URL |
| stream | Bool | false | Return raw ReadableStream body |

```tova
http.get("https://api.example.com/data", {
  bearer: env("API_TOKEN"),
  timeout: 10000,
  retries: 3,
  retry_delay: 500,
  params: { page: "2", limit: "25" }
})
```

---

## Response Object

### Standard Response

Every successful request resolves with a response containing these fields:

```
{
  status: Int,        // HTTP status code
  headers: Object,    // Response headers as key-value pairs
  body: Any,          // Parsed JSON object or text string
  ok: Bool,           // true if status 200-299
  json() -> Result    // Explicit JSON parse of body
}
```

The `json()` method is available for cases where the server does not set the `application/json` content type but the body is valid JSON.

```tova
response = http.get("https://example.com/data.txt").unwrap()
parsed = response.json().unwrap()   // Manually parse text body as JSON
```

### Streaming Response

When using `http.get_stream` or the `stream: true` option, the response body is a `ReadableStream`:

```
{
  status: Int,
  headers: Object,
  body: ReadableStream,  // Raw stream for chunk-by-chunk processing
  ok: Bool
}
```

---

## Body Serialization

Request bodies are automatically serialized based on their type:

- **Object** -- serialized to JSON; `Content-Type: application/json` is set automatically
- **FormData** -- sent as multipart/form-data; `Content-Type` is set by the runtime
- **`{ __form: true, ...fields }`** -- converted to `FormData` automatically
- **ArrayBuffer / Uint8Array** -- sent as raw binary
- **String** -- sent as-is with no transformation

```tova
// JSON body (automatic)
http.post("https://api.example.com/items", { name: "Widget", price: 9.99 })

// FormData via __form shorthand
http.post("https://api.example.com/upload", {
  __form: true,
  title: "My Document",
  file: file_handle
})

// Raw string body
http.post("https://api.example.com/raw", "plain text content")
```

---

## Response Auto-Parsing

Tova parses response bodies automatically based on the `Content-Type` header:

- `application/json` -- body is a parsed JSON object
- Everything else -- body is a text string

```tova
// JSON endpoint
resp = http.get("https://api.example.com/users/1").unwrap()
resp.body.name   // "Alice" -- already parsed

// Plain text endpoint
resp = http.get("https://example.com/robots.txt").unwrap()
resp.body        // "User-agent: *\nDisallow: /admin"
```

---

## Practical Examples

### Fetching JSON from a REST API

```tova
users = http.get("https://api.example.com/users").unwrap().body
for user in users {
  print("{user.name}: {user.email}")
}
```

### POST with JSON Body

```tova
new_user = http.post("https://api.example.com/users", {
  name: "Bob",
  email: "bob@example.com",
  role: "admin"
}).unwrap()
print("Created user #{new_user.body.id}")
```

### Bearer Auth

```tova
result = http.get("https://api.example.com/me", {
  bearer: env("AUTH_TOKEN")
})
profile = result.unwrap().body
print("Logged in as {profile.username}")
```

### Query Parameters

```tova
result = http.get("https://api.example.com/search", {
  params: { q: "tova lang", page: "1", limit: "20" }
})
results = result.unwrap().body
print("Found {len(results.items)} results")
```

### File Upload with FormData

```tova
result = http.post("https://api.example.com/upload", {
  __form: true,
  title: "Report Q4",
  file: file_handle
}, {
  bearer: env("API_TOKEN"),
  timeout: 60000
})
match result {
  Ok(resp) => print("Uploaded: {resp.body.url}")
  Err(msg) => print("Upload failed: {msg}")
}
```

### Streaming a Response

```tova
result = http.get_stream("https://api.example.com/events")
match result {
  Ok(resp) => {
    reader = resp.body.getReader()
    loop {
      chunk = await reader.read()
      if chunk.done { break }
      print("Chunk: {chunk.value}")
    }
  }
  Err(msg) => print("Stream error: {msg}")
}
```

### Error Handling with Result and match

```tova
result = http.get("https://api.example.com/users/999")

match result {
  Err(msg) => print("Network error: {msg}")
  Ok(resp) => {
    if resp.ok {
      print("User: {resp.body.name}")
    } else {
      print("HTTP {resp.status}: user not found")
    }
  }
}
```

### Retry with Timeout

```tova
result = http.get("https://unreliable-api.example.com/data", {
  timeout: 5000,
  retries: 3,
  retry_delay: 1000
})

match result {
  Ok(resp) => print("Got data after retries: {resp.body}")
  Err(msg) => print("All attempts failed: {msg}")
}
```
