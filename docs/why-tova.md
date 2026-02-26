# Why Tova?

Tova is a general-purpose programming language with clean syntax, compile-time security, and high performance. You can use it for scripts, CLI tools, data pipelines, AI applications, and full-stack web -- all with one language and one toolchain.

## One Language, Many Domains

Most languages specialize. Scripting languages are convenient but slow. Systems languages are fast but verbose. Web frameworks require gluing together dozens of packages. Tova aims to be productive across all of these:

```tova
// Script: process a CSV in three lines
data = read("sales.csv")
  |> filter(fn(row) row.revenue > 1000)
  |> sort_by(.region)

write(data, "summary.json")
```

```tova
// CLI tool: function signatures become the interface
cli {
  name: "tasks"
  fn add(name: String)            { add_task(name) }
  fn done(id: Int)                { complete_task(id) }
  fn list(--all: Bool)            { list_tasks(all) |> each(fn(t) print(t)) }
}
// Auto-generates --help, type validation, error messages
```

```tova
// AI: built-in multi-provider support
response = ask("Summarize this document", provider: "anthropic")
embeddings = embed(texts, provider: "openai")
category = classify(text, ["positive", "negative", "neutral"])
```

```tova
// Full-stack web: server + client in one file
server {
  fn get_users() -> [User] { UserModel.all() }
}

client {
  state users = []
  effect { users = server.get_users() }

  component App() {
    <ul>for u in users { <li>"{u.name}"</li> }</ul>
  }
}
```

No configuration files, no package manager dance, no boilerplate. Each of these runs with `tova run file.tova`.

## Language Design

Tova is designed around a few core principles: expressiveness without verbosity, safety without ceremony, and performance without dropping to a lower level.

### Pattern Matching

`match` is one of the most powerful features. It supports literals, ranges, variant destructuring, arrays, string concatenation, wildcards, and guards:

```tova
fn classify(value) {
  match value {
    0          => "zero"
    1..10      => "small"
    n if n > 100 => "big: {n}"
    _          => "other"
  }
}

fn area(shape) {
  match shape {
    Circle(r)      => 3.14159 * r * r
    Rect(w, h)     => w * h
    Triangle(b, h) => 0.5 * b * h
  }
}

match url {
  "/api" ++ rest   => handle_api(rest)
  "/static" ++ _   => serve_static(url)
  _                => not_found()
}
```

The compiler checks exhaustiveness and warns on uncovered variants.

### Pipes

The pipe operator `|>` chains function calls left to right, turning nested calls into readable pipelines:

```tova
result = data
  |> filter(fn(x) x > 0)
  |> map(fn(x) x * 2)
  |> sort_by(.value)
  |> take(10)
  |> sum()

// Placeholder for non-first-position arguments
"hello" |> replace(_, "l", "r")   // "herro"
```

### Error Handling Without Exceptions

Tova uses `Result` and `Option` types instead of exceptions. Errors are values that flow through the type system:

```tova
fn divide(a, b) {
  if b == 0 { Err("division by zero") }
  else { Ok(a / b) }
}

// Pattern match on results
match divide(10, 3) {
  Ok(value) => print("Result: {value}")
  Err(msg)  => print("Error: {msg}")
}

// Propagate errors with ?
fn load_config(path) {
  content = read_file(path)?            // Returns Err early if read fails
  config = parse_json(content)?
  Ok(config)
}

// Chain operations -- fused at compile time (10x faster)
value = Ok(42)
  .map(fn(x) x * 2)
  .map(fn(x) x + 1)
  .unwrap()
```

### Algebraic Data Types

Define record types and variants with `type`. Use `derive` to auto-generate common behavior:

```tova
type User {
  id: Int
  name: String
  email: String
}

type Shape {
  Circle(radius: Float)
  Rect(width: Float, height: Float)
  Triangle(base: Float, height: Float)
} derive [Eq, Show, JSON]

type Color {
  Red
  Green
  Blue
  Custom(r: Int, g: Int, b: Int)
}
```

### Guard Clauses

Early exits without deep nesting:

```tova
fn process(data) {
  guard data != nil else { return Err("no data") }
  guard len(data) > 0 else { return Err("empty") }
  Ok(transform(data))
}
```

### Interfaces & Generics

```tova
interface Printable {
  fn to_string() -> String
}

interface Comparable {
  fn compare(other) -> Int
}
```

### Async/Await

First-class async support:

```tova
async fn fetch_data(url) {
  response = await fetch(url)
  data = await response.json()
  Ok(data)
}
```

### Modules

```tova
// lib/math.tova
pub fn square(x) { x * x }
pub fn cube(x) { x * x * x }
pub TAU = 6.28318

// app.tova
import { square, cube, TAU } from "./lib/math"
```

## Performance

Tova generates high-performance code through compile-time optimizations and performance decorators. You write clean, expressive code and the compiler makes it fast.

### Automatic Optimizations (Zero Effort)

These happen at compile time with no changes to your code:

**Result.map chain fusion** -- chains of `.map()` on `Ok`/`Some` are fused into a single expression, eliminating intermediate allocations:

```tova
// You write:
result = Ok(5).map(fn(x) x * 2).map(fn(x) x + 3).map(fn(x) x * 10)

// Compiler generates: Ok((((5 * 2) + 3) * 10))
// 10x faster -- zero intermediate objects
```

**Array fill detection** -- push loops become pre-allocated arrays; boolean fills upgrade to `Uint8Array`:

```tova
// You write:
var flags = []
for i in range(n) { flags.push(false) }

// Compiler generates: new Uint8Array(n)
// 3x faster -- contiguous memory
```

**Range loop optimization** -- `for i in range(n)` becomes a C-style loop (no array allocation).

### @wasm -- WebAssembly Compilation

Decorate a function with `@wasm` to compile it directly to a WebAssembly binary. No external toolchain. The Tova compiler generates raw WASM bytes:

```tova
@wasm fn fibonacci(n: Int) -> Int {
  if n <= 1 { return n }
  fibonacci(n - 1) + fibonacci(n - 2)
}

print(fibonacci(40))   // Runs as native WASM
```

Supports `Int` (i32), `Float` (f64), `Bool`, arithmetic, comparisons, control flow, and recursion. Falls back to standard codegen automatically if the function uses unsupported features.

### @fast -- TypedArray Optimization

Decorate numeric functions with `@fast` to coerce array parameters to TypedArrays. This gives the runtime contiguous, unboxed memory to work with:

```tova
@fast fn dot_product(a: [Float], b: [Float]) -> Float {
  typed_dot(a, b)
}

@fast fn normalize(v: [Float]) -> [Float] {
  n = typed_norm(v)
  typed_scale(v, 1.0 / n)
}
```

Includes a typed stdlib: `typed_sum` (Kahan compensated), `typed_dot`, `typed_add`, `typed_scale`, `typed_map`, `typed_reduce`, `typed_sort`, `typed_zeros`, `typed_ones`, `typed_fill`, `typed_linspace`, `typed_norm`, `typed_range`.

### parallel_map -- Multi-Core

Distribute CPU-intensive work across all cores with a persistent worker pool:

```tova
results = await parallel_map(large_array, fn(item) {
  expensive_computation(item)
})
```

Workers are created once and reused across calls. 3.5x speedup on 8 cores for CPU-bound work.

### Benchmark Highlights

| Benchmark | Time | Technique |
|-----------|------|-----------|
| Sort 1M integers | 27ms | Rust FFI radix sort (O(n)) |
| JSON parse 11MB | 37ms | SIMD-accelerated parser |
| Fibonacci iterative | 20ms | JIT-optimized tight loop |
| Dot product 1M floats | 97ms | @fast Float64Array coercion |
| N-body simulation | 22ms | Floating-point optimization |
| @wasm integer compute | 117ms | Native WebAssembly binary |
| HTTP requests/sec | 108K | Compile-time fast mode |
| Result.map 3x chain | 10ms | Compile-time fusion (was 101ms) |
| Prime sieve 10M | 25ms | Uint8Array fill optimization (was 78ms) |
| parallel_map 8 cores | 379ms | Persistent worker pool (was 1,355ms sequential) |

See the [full performance guide](/guide/performance).

## Compile-Time Security

The `security {}` block is a top-level language construct that centralizes your entire security policy. The compiler reads it and generates all enforcement code -- auth, authorization, CORS, CSP, CSRF, rate limiting, HSTS, field sanitization, and audit logging.

```tova
security {
  auth jwt { secret: env("JWT_SECRET"), expires: 86400 }

  role Admin  { can: [manage_users, view_analytics, delete_posts] }
  role Editor { can: [create_posts, edit_posts, view_analytics] }
  role User   { can: [view_profile, edit_profile] }

  protect "/api/admin/**" { require: Admin, rate_limit: { max: 100, window: 60 } }
  protect "/api/posts/*"  { require: Editor }
  protect "/api/*"        { require: authenticated }

  sensitive User.password { hash: "bcrypt", never_expose: true }
  sensitive User.email    { visible_to: [Admin, "self"] }

  cors { origins: ["https://myapp.com"], methods: [GET, POST, PUT, DELETE], credentials: true }
  csp { default_src: ["self"], script_src: ["self"], style_src: ["self", "unsafe-inline"] }
  rate_limit { max: 1000, window: 3600 }
  csrf { enabled: true, exempt: ["/api/webhooks/*"] }
  audit { events: [login, logout, manage_users], store: "audit_log", retain: 90 }
  trust_proxy true
  hsts { max_age: 63072000, include_subdomains: true, preload: true }
}
```

### What the compiler generates:

**Server-side:**
- JWT token validation with algorithm pinning (rejects `alg: "none"`)
- `__hasRole()` and `__hasPermission()` for role checking
- Route protection middleware with glob-to-regex pattern matching
- Per-route and global rate limiting with sliding window
- Auto-sanitization of all RPC responses (strips sensitive fields based on requester identity)
- CSRF token generation with timing-safe comparison
- Path normalization (URL-decode, collapse double slashes, resolve `../`, strip trailing slashes)
- CORS, CSP, HSTS headers
- Audit event logging to database

**Client-side:**
- `getAuthToken()`, `setAuthToken()`, `clearAuthToken()` with auto-injection into RPC calls
- `can(permission)` helper for conditional UI rendering
- HttpOnly cookie mode option

**Compile-time warnings:**
- Undefined roles, duplicate roles, hardcoded secrets
- CORS wildcards, missing auth config, invalid rate limits
- CSRF disabled warnings

All of this from a single declarative block. No dependencies, no middleware to wire up, no routes to remember to protect. The compiler enforces it. [Learn more](/fullstack/security-block).

## Full-Stack Web

When you need a web application, Tova's five-block model (`shared`, `data`, `security`, `server`, `client`) lets you write everything in one file:

### Automatic RPC

```tova
server {
  fn get_users() -> [User] { UserModel.all() }
  fn create_user(name: String, email: String) -> User {
    UserModel.create({ name, email })
  }
}

client {
  state users = []
  effect { users = server.get_users() }

  fn handle_submit() {
    server.create_user(name, email)
    users = server.get_users()
  }
}
```

`server.get_users()` is a compile-time RPC call. The compiler generates HTTP endpoints, fetch calls, serialization, and async wrapping. You never write networking code.

### Signal-Based Reactivity

Tova uses fine-grained signals. When a signal changes, only the DOM nodes that read it update -- no diffing, no reconciliation:

```tova
client {
  state count = 0
  computed doubled = count * 2

  component Counter() {
    <div>
      <p>"{count} x 2 = {doubled}"</p>
      <button on:click={fn() count += 1}>"+"</button>
    </div>
  }
}
```

### Shared Types

The `shared` block compiles to a module imported by both server and client. Same types, same validation, zero duplication:

```tova
shared {
  type User { id: Int, name: String, email: String }

  fn validate_email(email: String) -> Bool {
    email.contains("@") and email.length() > 3
  }
}
```

## Batteries Included

| Category | What's included |
|----------|----------------|
| **Stdlib** | 60+ functions: collections, strings, math, regex, validation, URL, datetime, JSON, encoding, async, Result/Option |
| **Data** | Tables/DataFrames, CSV/JSON/JSONL/TSV I/O, pipelines, group_by, sort_by, filter |
| **AI** | Multi-provider: Anthropic, OpenAI, Ollama. ask, chat, embed, extract, classify |
| **Testing** | Built-in test runner with assertions, describe/it blocks |
| **Tooling** | REPL, formatter, dev server with hot reload, production build, LSP server |
| **Editor** | VS Code extension with syntax highlighting, diagnostics, completion, go-to-definition |
| **Deployment** | `tova build --production` with bundling, content hashing, minification |

## Developer Experience

- **Rich error messages** with source context, carets, and fix suggestions
- **LSP server** with diagnostics, completion, go-to-definition, hover, and signature help
- **VS Code extension** with TextMate syntax highlighting and LSP integration
- **REPL** with multi-line input and stdlib context
- **Dev server** with hot reload on save
- **Exhaustive match checking** -- the compiler warns on uncovered variants
- **Unused variable warnings** in function scopes
- **Source maps** for debugging compiled output
- **6,700+ tests** across 85 test files

## Get Started

```bash
curl -fsSL https://raw.githubusercontent.com/tova-lang/tova-lang/main/install.sh | sh
tova new my-app
cd my-app && tova dev
```

- [Installation](/getting-started/)
- [10-minute tour](/getting-started/tour)
- [Full tutorial](/tutorial)
- [Performance guide](/guide/performance)
- [Security block reference](/fullstack/security-block)
- [Full-stack architecture](/fullstack/architecture)
- [Examples](/examples/)
