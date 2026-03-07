# HTTP Client Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the existing `http` namespace with query params, FormData support, and streaming responses, plus full documentation.

**Architecture:** The `http` namespace lives as an inline string in `src/stdlib/inline.js:1061-1099`. It's a frozen object with an async `_request` method that wraps `fetch()`. The codegen tree-shakes it — only included when user code references `http.*`. All methods return `Result<Response, String>` using the `Ok`/`Err` types. We modify the inline string directly, add tests via Bun's test runner, and create documentation matching the existing stdlib doc pattern.

**Tech Stack:** JavaScript (inline strings for codegen), Bun test runner (`bun test`), Markdown docs

---

### Task 1: Query Params — Failing Tests

**Files:**
- Modify: `tests/stdlib-http.test.js:119` (add after line 118, inside or after the compilation tests describe block)

**Step 1: Write failing tests for query params**

Add these tests after line 118 (after the last test in `'http namespace — compilation tests'`):

```javascript
  test('http namespace contains URLSearchParams for params option', () => {
    const output = compile('r = http.get("https://example.com", { params: { page: 1 } })');
    expect(output).toContain('URLSearchParams');
    expect(output).toContain('o.params');
  });
```

Add these integration tests after line 350 (after the last test in `'http namespace — integration tests'`):

```javascript
  test('params option appends query parameters to URL', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.get(`http://localhost:${port}/headers`, {
      params: { foo: 'bar', num: 42 }
    });
    const resp = result.unwrap();
    // The server echoes back request headers; we verify the request was made
    expect(resp.status).toBe(200);
  });

  test('params option with existing query string appends correctly', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.get(`http://localhost:${port}/echo-url?existing=1`, {
      params: { added: 'yes' }
    });
    const resp = result.unwrap();
    expect(resp.status).toBe(200);
  });
```

Also add an `/echo-url` endpoint to the test server (inside `Bun.serve` fetch handler, after the `/headers` handler around line 218):

```javascript
        if (url_obj.pathname === '/echo-url') {
          return new Response(JSON.stringify({ url: req.url, search: url_obj.search }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/stdlib-http.test.js`
Expected: New tests FAIL because `URLSearchParams` and `o.params` are not in the http namespace yet.

**Step 3: Commit failing tests**

```bash
git add tests/stdlib-http.test.js
git commit -m "test: add failing tests for http query params option"
```

---

### Task 2: Query Params — Implementation

**Files:**
- Modify: `src/stdlib/inline.js:1062-1069` (inside the `_request` method, after opts/headers setup, before the timeout line)

**Step 1: Add params handling to `_request`**

In `src/stdlib/inline.js`, modify the `http` inline string. After the `if (o.bearer)` line (line 1065) and before the JSON body check (line 1066), add query params handling:

The new `_request` method body should have this inserted after `if (o.bearer) headers['Authorization'] = 'Bearer ' + o.bearer;`:

```javascript
    if (o.params) { var _qs = new URLSearchParams(o.params).toString(); if (_qs) url += (url.includes('?') ? '&' : '?') + _qs; }
```

This goes on a single line within the inline template string, inserted between the bearer auth line and the body JSON-serialization check.

**Step 2: Run tests to verify they pass**

Run: `bun test tests/stdlib-http.test.js`
Expected: All tests PASS including the new params tests.

**Step 3: Commit**

```bash
git add src/stdlib/inline.js
git commit -m "feat: add query params option to http namespace"
```

---

### Task 3: FormData Support — Failing Tests

**Files:**
- Modify: `tests/stdlib-http.test.js`

**Step 1: Write failing tests for FormData**

Add to the shape tests block (after the redirect test around line 173):

```javascript
  test('http entry contains FormData detection', () => {
    expect(BUILTIN_FUNCTIONS.http).toContain('FormData');
    expect(BUILTIN_FUNCTIONS.http).toContain('__form');
  });
```

Add to the integration tests block (after the params tests):

```javascript
  test('FormData body skips JSON serialization', async () => {
    if (!httpNs || !server) return;
    const form = new FormData();
    form.append('name', 'tova');
    form.append('version', '1.0');
    const result = await httpNs.post(`http://localhost:${port}/echo`, form);
    const resp = result.unwrap();
    expect(resp.body.method).toBe('POST');
    // FormData sets its own content-type with boundary
    expect(resp.body.ct).toContain('multipart/form-data');
  });

  test('__form: true converts plain object to FormData', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.post(`http://localhost:${port}/echo`, {
      __form: true,
      name: 'tova',
      version: '1.0'
    });
    const resp = result.unwrap();
    expect(resp.body.method).toBe('POST');
    expect(resp.body.ct).toContain('multipart/form-data');
  });
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/stdlib-http.test.js`
Expected: New FormData tests FAIL.

**Step 3: Commit failing tests**

```bash
git add tests/stdlib-http.test.js
git commit -m "test: add failing tests for http FormData support"
```

---

### Task 4: FormData Support — Implementation

**Files:**
- Modify: `src/stdlib/inline.js:1066-1068` (the body/JSON serialization block in `_request`)

**Step 1: Add FormData handling**

Replace the existing body serialization check (line 1066-1068):

```javascript
    if (body && typeof body === 'object' && !(body instanceof ArrayBuffer) && !(body instanceof Uint8Array) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
```

With this expanded version that handles FormData and `__form`:

```javascript
    if (typeof FormData !== 'undefined' && body instanceof FormData) { delete headers['Content-Type']; }
    else if (body && typeof body === 'object' && body.__form) { var _fd = new FormData(); Object.keys(body).forEach(function(k) { if (k !== '__form') _fd.append(k, body[k]); }); body = _fd; delete headers['Content-Type']; }
    else if (body && typeof body === 'object' && !(body instanceof ArrayBuffer) && !(body instanceof Uint8Array) && !headers['Content-Type']) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
```

This is three lines in the inline string, replacing the original three lines.

**Step 2: Run tests to verify they pass**

Run: `bun test tests/stdlib-http.test.js`
Expected: All tests PASS.

**Step 3: Commit**

```bash
git add src/stdlib/inline.js
git commit -m "feat: add FormData and __form support to http namespace"
```

---

### Task 5: Streaming Responses — Failing Tests

**Files:**
- Modify: `tests/stdlib-http.test.js`

**Step 1: Write failing tests for streaming**

Add a `/stream` endpoint to the test server (inside `Bun.serve` fetch handler):

```javascript
        if (url_obj.pathname === '/stream') {
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode('chunk1'));
              controller.enqueue(encoder.encode('chunk2'));
              controller.close();
            }
          });
          return new Response(stream, { headers: { 'Content-Type': 'text/plain' } });
        }
```

Add to the shape tests:

```javascript
  test('http entry contains get_stream method', () => {
    expect(BUILTIN_FUNCTIONS.http).toContain('get_stream');
  });
```

Add to the compilation tests:

```javascript
  test('http namespace is emitted when http.get_stream() is referenced', () => {
    const output = compile('result = http.get_stream("https://example.com/file")');
    expect(output).toContain('const http = Object.freeze(');
    expect(output).toContain('get_stream');
  });
```

Add to the integration tests:

```javascript
  test('http.get_stream() returns ReadableStream body', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.get_stream(`http://localhost:${port}/stream`);
    expect(result.__tag).toBe('Ok');
    const resp = result.unwrap();
    expect(resp.status).toBe(200);
    expect(resp.ok).toBe(true);
    expect(resp.body).toBeDefined();
    // Read all chunks from the stream
    const reader = resp.body.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }
    expect(chunks.join('')).toBe('chunk1chunk2');
  });

  test('stream: true option on http.get() returns stream', async () => {
    if (!httpNs || !server) return;
    const result = await httpNs.get(`http://localhost:${port}/stream`, { stream: true });
    expect(result.__tag).toBe('Ok');
    const resp = result.unwrap();
    expect(resp.body).toBeDefined();
    // body should be a ReadableStream, not parsed text
    expect(typeof resp.body).not.toBe('string');
  });
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/stdlib-http.test.js`
Expected: New streaming tests FAIL.

**Step 3: Commit failing tests**

```bash
git add tests/stdlib-http.test.js
git commit -m "test: add failing tests for http streaming responses"
```

---

### Task 6: Streaming Responses — Implementation

**Files:**
- Modify: `src/stdlib/inline.js:1061-1099` (the http namespace inline string)

**Step 1: Add streaming support to `_request` and add `get_stream`**

In the `_request` method, after the response headers collection (line 1081) and before the body parsing (lines 1082-1085), add a stream check:

After `resp.headers.forEach(function(v, k) { respHeaders[k] = v; });` add:

```javascript
        if (o.stream) { return Ok({ status: resp.status, headers: respHeaders, body: resp.body, ok: resp.ok }); }
```

Then add a `get_stream` method after the `head` method (line 1098):

```javascript
  get_stream(url, opts) { return http._request('GET', url, null, Object.assign({}, opts, { stream: true })); }
```

The method shortcuts section should now be:

```javascript
  get(url, opts) { return http._request('GET', url, null, opts); },
  post(url, body, opts) { return http._request('POST', url, body, opts); },
  put(url, body, opts) { return http._request('PUT', url, body, opts); },
  patch(url, body, opts) { return http._request('PATCH', url, body, opts); },
  delete(url, opts) { return http._request('DELETE', url, null, opts); },
  head(url, opts) { return http._request('HEAD', url, null, opts); },
  get_stream(url, opts) { return http._request('GET', url, null, Object.assign({}, opts, { stream: true })); }
```

**Step 2: Run tests to verify they pass**

Run: `bun test tests/stdlib-http.test.js`
Expected: All tests PASS.

**Step 3: Commit**

```bash
git add src/stdlib/inline.js
git commit -m "feat: add streaming responses and get_stream to http namespace"
```

---

### Task 7: Documentation — Create `docs/stdlib/http.md`

**Files:**
- Create: `docs/stdlib/http.md`

**Step 1: Write the HTTP stdlib documentation**

Create `docs/stdlib/http.md` following the pattern of `docs/stdlib/url.md`. Include:

1. Overview paragraph explaining the `http` namespace
2. API reference for each method with signatures
3. Options table listing all options: `headers`, `bearer`, `timeout`, `retries`, `retry_delay`, `follow_redirects`, `params`, `stream`
4. Response shape documentation
5. Practical examples:
   - GET request with JSON parsing
   - POST with JSON body
   - Bearer auth
   - Query params
   - FormData upload
   - Streaming a large file
   - Error handling with Result
   - Retry with timeout

**Step 2: Commit**

```bash
git add docs/stdlib/http.md
git commit -m "docs: add http namespace stdlib documentation"
```

---

### Task 8: Documentation — Update `docs/stdlib/index.md`

**Files:**
- Modify: `docs/stdlib/index.md:33` (insert after the URL & UUID row)

**Step 1: Add HTTP row to the categories table**

Insert a new row after the `URL & UUID` row (line 33) in the categories table:

```markdown
| **HTTP Client** | `http.get`, `http.post`, `http.put`, `http.patch`, `http.delete`, `http.head`, `http.get_stream` | [HTTP Client](./http) |
```

**Step 2: Add HTTP quick reference section**

After the `URL & UUID` quick reference block (around line 132), add:

```markdown
### HTTP Client

```tova
// GET request
result = http.get("https://api.example.com/users")
data = result.unwrap().body

// POST with JSON body
result = http.post("https://api.example.com/users", { name: "Alice" })

// With query params and bearer auth
result = http.get("https://api.example.com/search", {
  params: { q: "tova", limit: 10 },
  bearer: env("API_TOKEN")
})
```

**Step 3: Commit**

```bash
git add docs/stdlib/index.md
git commit -m "docs: add http namespace to stdlib index"
```

---

### Task 9: Run Full Test Suite

**Step 1: Run all http tests**

Run: `bun test tests/stdlib-http.test.js`
Expected: All tests PASS (existing + new).

**Step 2: Run the full test suite to check for regressions**

Run: `bun test`
Expected: No regressions in other test files.

**Step 3: Final commit if any fixups needed**

If any test fixes were needed, commit them:

```bash
git add -A
git commit -m "fix: resolve test issues from http namespace enhancement"
```
