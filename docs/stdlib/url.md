# URL & UUID

Tova provides functions for URL manipulation and unique identifier generation -- essential building blocks for web applications.

## UUID Generation

### uuid

```tova
uuid() -> String
```

Generates a UUID v4 string. Uses `crypto.randomUUID()` when available, with a fallback for older environments.

```tova
uuid()    // "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
uuid()    // "f47ac10b-58cc-4372-a567-0e02b2c3d479"

// Always unique
id1 = uuid()
id2 = uuid()
assert_ne(id1, id2)
```

---

## URL Parsing

### parse_url

```tova
parse_url(s) -> Result<Object, String>
```

Parses a URL string into its components. Returns `Ok` with `{ protocol, host, pathname, search, hash }` on success, or `Err` for invalid URLs.

```tova
result = parse_url("https://example.com/path?q=1#top")
url = result.unwrap()
url.protocol     // "https"
url.host         // "example.com"
url.pathname     // "/path"
url.search       // "?q=1"
url.hash         // "#top"

// Invalid URL
parse_url("not a url")
// Err("Invalid URL: not a url")
```

### build_url

```tova
build_url(parts) -> String
```

Builds a URL string from a parts object. Defaults to `https` protocol and `/` pathname.

```tova
build_url({ protocol: "https", host: "example.com", pathname: "/api" })
// "https://example.com/api"

build_url({ host: "example.com", search: "q=1", hash: "top" })
// "https://example.com/?q=1#top"

build_url({ protocol: "http", host: "localhost:3000", pathname: "/users" })
// "http://localhost:3000/users"
```

---

## Query Strings

### parse_query

```tova
parse_query(s) -> Object
```

Parses a query string into an object. Handles URL-encoded values and optional leading `?`.

```tova
parse_query("a=1&b=hello")
// { a: "1", b: "hello" }

parse_query("?x=10&y=20")
// { x: "10", y: "20" }

parse_query("name=hello%20world")
// { name: "hello world" }

parse_query("")
// {}
```

### build_query

```tova
build_query(obj) -> String
```

Builds a query string from an object. Values are URL-encoded.

```tova
build_query({ a: "1", b: "2" })
// "a=1&b=2"

build_query({ name: "hello world", page: "1" })
// "name=hello%20world&page=1"
```

---

## Pipeline Examples

```tova
// Parse and modify a URL
url = "https://api.example.com/search?q=tova&page=1"
parts = parse_url(url).unwrap()
query = parse_query(parts.search)
query = merge(query, { page: "2" })
new_url = build_url(merge(parts, { search: build_query(query) }))

// Generate unique IDs for records
users = [
  { id: uuid(), name: "Alice" },
  { id: uuid(), name: "Bob" },
]

// Build API endpoint
endpoint = build_url({
  host: "api.example.com",
  pathname: "/v1/users",
  search: build_query({ limit: "10", offset: "0" })
})
```
