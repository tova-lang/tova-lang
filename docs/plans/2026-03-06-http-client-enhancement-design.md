# HTTP Client Enhancement Design

## Status

The `http` namespace already exists in `src/stdlib/inline.js:1061-1099` with basic functionality. This design adds three features and full documentation.

## Current State

The `http` namespace provides:
- `http.get(url, opts?)`, `http.post(url, body, opts?)`, `http.put()`, `http.patch()`, `http.delete()`, `http.head()`
- Options: `{ headers, timeout, retries, retry_delay, follow_redirects, bearer }`
- Returns `Result<Response, String>` where Response is `{ status, headers, body, ok, json() }`
- Auto-JSON serialization of request bodies and response parsing
- Timeout via `AbortController`, retry with exponential backoff
- Bearer token auth shortcut
- Tests exist in `tests/stdlib-http.test.js` (compilation, shape, and integration)
- No standalone `src/stdlib/http.js` file (inline only)
- No documentation (`docs/stdlib/http.md` does not exist)
- Not listed in `docs/stdlib/index.md`

## Enhancements

### 1. Query Parameters Helper

Add a `params` option to `_request` that auto-appends query parameters to the URL.

```
result = http.get("https://api.example.com/users", {
  params: { page: 1, limit: 20, sort: "name" }
})
// fetches: https://api.example.com/users?page=1&limit=20&sort=name
```

Implementation: Before the fetch call in `_request`, check if `o.params` exists. If so, construct a `URLSearchParams` from the object and append to the URL. Handle the case where the URL already has query parameters.

### 2. FormData & File Upload

Support `FormData` bodies for multipart uploads. Two mechanisms:

**A. Native FormData passthrough:** When `body instanceof FormData`, skip JSON serialization and let the runtime set the multipart Content-Type with boundary.

**B. `__form: true` convenience:** When a plain object has `__form: true`, convert it to `FormData` automatically.

```
// Native FormData
form = FormData()
form.append("file", blob_data)
result = http.post("https://api.example.com/upload", form)

// Convenience shorthand
result = http.post("https://api.example.com/form", {
  __form: true,
  name: "test",
  email: "user@example.com"
})
```

Implementation: In `_request`, before the JSON serialization check, detect `FormData` instances and `__form: true` objects. For `__form`, iterate keys (excluding `__form`) and call `formData.append()` for each. Delete the `Content-Type` header so the runtime auto-sets it with the boundary.

### 3. Streaming Responses

Add an `http.get_stream()` method and a `stream: true` option that returns the raw response body as a `ReadableStream` instead of buffering.

```
result = http.get_stream("https://example.com/large-file.csv")
match result {
  Ok(resp) => {
    // resp.body is a ReadableStream
    for await chunk in resp.body {
      process(chunk)
    }
  }
  Err(e) => print("Failed: ${e}")
}
```

Implementation: Add a `_stream_request` method that performs the fetch but returns the raw `Response.body` stream instead of calling `.text()` or `.json()`. The response shape is `{ status, headers, ok, body: ReadableStream }`. The `stream: true` option on regular methods delegates to `_stream_request`.

Also add `http.get_stream(url, opts?)` as a convenience shortcut.

## Files Modified

| File | Change |
|---|---|
| `src/stdlib/inline.js` | Enhance `http` namespace object with params, FormData, streaming |
| `tests/stdlib-http.test.js` | Add tests for params, FormData, streaming |
| `docs/stdlib/http.md` | New file: full API reference with examples |
| `docs/stdlib/index.md` | Add HTTP row to categories table and quick reference |

## Non-Goals

- Base URL / session factory (`http.create()`) -- deferred
- Cookie jar management -- deferred
- Proxy support -- deferred
- Response caching -- deferred

## Response Shape

After enhancement, the response from `http.get()` etc. remains:

```
{
  status: Int,        // HTTP status code
  headers: Object,    // Response headers as key-value pairs
  body: Any,          // Parsed JSON object or text string
  ok: Bool,           // true if status 200-299
  json() -> Result    // Explicit JSON parse of body
}
```

For streaming responses (`http.get_stream` or `stream: true`):

```
{
  status: Int,
  headers: Object,
  body: ReadableStream,  // Raw stream for chunk-by-chunk processing
  ok: Bool
}
```
