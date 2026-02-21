# JavaScript Interop

Tova compiles to JavaScript, so interop with the JS ecosystem is seamless.

## Using npm Packages

### Adding npm Dependencies

```bash
tova add npm:lodash
tova add npm:@types/node --dev
```

This adds the package to the `[npm]` section of `tova.toml`:

```toml
[npm]
lodash = "^4.17.21"

[npm.dev]
"@types/node" = "^20.0.0"
```

### Importing npm Packages

```tova
import { debounce } from "lodash"
import express from "express"

server {
  fn get_data(req) {
    result = debounce(fn() fetch_from_api(), 300)
    result
  }
}
```

npm packages are imported using their package name, just like in JavaScript.

## JS Globals

Tova recognizes all standard JavaScript globals. You can use them directly:

```tova
// Browser APIs
result = JSON.parse(data)
timestamp = Date.now()
id = setTimeout(fn() print("delayed"), 1000)

// Console
console.log("debug info")
console.error("something went wrong")

// Math
value = Math.PI * radius * radius

// Fetch API
response = await fetch("https://api.example.com/data")
data = await response.json()
```

## Type Constructors

Use `Type.new()` syntax to call JavaScript constructors:

```tova
// Creates: new Map()
cache = Map.new()
cache.set("key", "value")

// Creates: new Set([1, 2, 3])
unique = Set.new([1, 2, 3])

// Creates: new Date()
today = Date.new()

// Creates: new URL("https://example.com")
url = URL.new("https://example.com")

// Creates: new RegExp("\\d+", "g")
pattern = RegExp.new("\\d+", "g")
```

## Extern Declarations

Declare external JavaScript functions for better tooling support:

```tova
extern fn fetch(url: String) -> Promise
extern fn setTimeout(callback: Function, ms: Int) -> Int
extern async fn readFile(path: String) -> String
```

Extern declarations tell the analyzer about functions defined outside Tova, preventing "undefined identifier" warnings and enabling completion.

## Browser APIs

```tova
client {
  // DOM manipulation
  element = document.getElementById("app")
  element.classList.add("active")

  // Event listeners
  document.addEventListener("click", fn(event) {
    print("Clicked at: {event.clientX}, {event.clientY}")
  })

  // Local Storage
  localStorage.setItem("theme", "dark")
  theme = localStorage.getItem("theme")

  // URL handling
  params = URLSearchParams.new(window.location.search)
  page = params.get("page")
}
```

## Working with Promises

Tova's `async`/`await` works exactly like JavaScript:

```tova
async fn fetch_users() {
  response = await fetch("/api/users")
  if response.ok {
    data = await response.json()
    Ok(data)
  } else {
    Err("Failed to fetch: {response.status}")
  }
}
```

Use `try_async` for safe error handling:

```tova
async fn safe_fetch(url) {
  result = await try_async(fn() fetch(url))
  match result {
    Ok(response) => Ok(await response.json())
    Err(msg) => Err("Network error: {msg}")
  }
}
```

## FFI Patterns

### Wrapping JS Libraries

Create Tova-idiomatic wrappers around JavaScript libraries:

```tova
import axios from "axios"

/// Make an HTTP GET request
/// @param url The URL to fetch
/// @returns Result with response data or error message
async fn http_get(url: String) -> Result {
  result = await try_async(fn() axios.get(url))
  match result {
    Ok(response) => Ok(response.data)
    Err(msg) => Err("HTTP GET failed: {msg}")
  }
}

/// Make an HTTP POST request
async fn http_post(url: String, body) -> Result {
  result = await try_async(fn() axios.post(url, body))
  match result {
    Ok(response) => Ok(response.data)
    Err(msg) => Err("HTTP POST failed: {msg}")
  }
}
```

### Using JavaScript Classes

```tova
import { EventEmitter } from "events"

emitter = EventEmitter.new()
emitter.on("data", fn(payload) {
  print("Received: {payload}")
})
emitter.emit("data", { message: "hello" })
```

### WebSocket Client

```tova
client {
  ws = WebSocket.new("ws://localhost:8080")

  ws.onopen = fn() {
    ws.send(json_stringify({ type: "hello" }))
  }

  ws.onmessage = fn(event) {
    data = json_parse(event.data)
    match data {
      Ok(msg) => print("Message: {msg.type}")
      Err(e) => print("Parse error: {e}")
    }
  }
}
```

## Tova Standard Library vs JS

Tova provides a rich standard library that wraps common JavaScript operations in a more ergonomic API:

| Tova | JavaScript |
|------|-----------|
| `len(arr)` | `arr.length` |
| `sorted(arr)` | `[...arr].sort()` |
| `filter(arr, fn)` | `arr.filter(fn)` |
| `map(arr, fn)` | `arr.map(fn)` |
| `keys(obj)` | `Object.keys(obj)` |
| `json_parse(s)` | `JSON.parse(s)` (but returns Result) |
| `sleep(ms)` | `new Promise(r => setTimeout(r, ms))` |
| `read_text(path)` | `fs.readFileSync(path, 'utf-8')` (but returns Result) |

You can use either style — Tova stdlib functions or direct JavaScript methods.
