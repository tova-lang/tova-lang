---
layout: home

hero:
  name: Tova
  text: A Modern Programming Language
  tagline: Clean syntax. Compile-time security. High performance. One language for scripts, data pipelines, AI apps, and full-stack web.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/
    - theme: alt
      text: Why Tova?
      link: /why-tova
    - theme: alt
      text: Playground
      link: /playground

features:
  - title: Clean, Expressive Syntax
    details: "Pipe operators, pattern matching with ranges/guards/string concat, algebraic data types, generics, interfaces, derive, guard clauses, Result/Option error handling, implicit returns, no semicolons."
  - title: Compile-Time Security
    details: "One declarative security block for auth, RBAC, route protection, sensitive fields, CORS, CSP, rate limiting, CSRF, HSTS, and audit logging. Zero runtime dependencies. Compiler catches misconfigurations before your code runs."
  - title: High Performance
    details: "Result.map chain fusion (10x), array fill detection with Uint8Array upgrade (3x), range-to-for-loop rewrite, @wasm WebAssembly compilation, @fast TypedArray coercion, Rust FFI radix sort, multi-core parallel_map."
  - title: "@wasm -- Native WebAssembly"
    details: "Decorate any numeric function with @wasm to compile it to WebAssembly binary. Zero external toolchain. The compiler generates raw WASM bytes directly. Falls back to standard codegen automatically."
  - title: "@fast -- TypedArray Optimization"
    details: "Decorate functions with @fast to auto-coerce arrays to Float64Array/Int32Array. Dot product on 1M elements in 97ms. Kahan summation, vector ops, and a typed stdlib included."
  - title: Full-Stack Web
    details: "shared/server/browser blocks with automatic RPC bridge. Call server.get_users() from browser code -- the compiler handles networking, serialization, validation. Fine-grained signal reactivity."
  - title: Batteries Included
    details: "60+ stdlib functions, Tables/DataFrames, AI integration (Anthropic/OpenAI/Ollama), built-in test runner, REPL, LSP server, VS Code extension, production build with minification."
  - title: Scripting & Data
    details: "CSV/JSON/JSONL/TSV I/O, file system ops, shell execution, pipe-based data pipelines. Run any .tova file directly -- no project scaffold needed."
  - title: parallel_map -- Multi-Core
    details: "Distribute CPU-intensive work across all cores with a persistent worker pool. 3.5x speedup on 8 cores. Workers reuse across calls -- zero startup overhead after first invocation."
---

<div style="max-width: 800px; margin: 2rem auto; padding: 0 24px;">

## The Language

Tova is a general-purpose programming language. You can write scripts, CLI tools, data pipelines, AI applications, and full-stack web apps -- all in one language with one toolchain.

### Pattern Matching

```tova
fn describe(shape) {
  match shape {
    Circle(r)      => "circle with area {3.14159 * r * r}"
    Rect(w, h)     => "rectangle {w}x{h}"
    Triangle(b, h) => "triangle with area {0.5 * b * h}"
  }
}

match args() {
  ["add", name]      => add_task(name)
  ["done", id]       => complete_task(to_int(id))
  ["list"]           => list_tasks() |> each(fn(t) print(t))
  _                  => print("Usage: tasks <add|done|list>")
}
```

The compiler checks exhaustiveness and warns on uncovered variants.

### Pipes & Functional Composition

```tova
result = data
  |> filter(fn(x) x > 0)
  |> map(fn(x) x * 2)
  |> sort_by(.value)
  |> take(10)
  |> sum()
```

### Error Handling Without Exceptions

```tova
fn load_config(path) {
  content = read_file(path)?            // Early return on Err
  config = parse_json(content)?
  Ok(config)
}

// Chain maps -- the compiler fuses them at compile time (10x faster)
value = Ok(42)
  .map(fn(x) x * 2)
  .map(fn(x) x + 1)
  .unwrap()
```

### Types, Generics & Derive

```tova
type Shape {
  Circle(radius: Float)
  Rect(width: Float, height: Float)
  Triangle(base: Float, height: Float)
} derive [Eq, Show, JSON]

interface Printable {
  fn to_string() -> String
}
```

## Performance

Tova is a high-level language that generates high-performance code. The compiler applies automatic optimizations at compile time, and performance decorators let you opt in to native-speed execution for hot paths.

| Feature | What it does | Impact |
|---------|-------------|--------|
| Result.map chain fusion | `Ok(v).map(f).map(g)` compiles to `Ok(g(f(v)))` | 10x faster (zero allocation) |
| Array fill detection | Push loops become `new Array(n).fill(val)` | 3x faster |
| Boolean fill upgrade | Boolean arrays become `Uint8Array` | Contiguous memory |
| Range-to-for rewrite | `for i in range(n)` becomes a C-style loop | No array allocation |
| `@wasm` decorator | Compiles to WebAssembly binary | Native WASM speed |
| `@fast` decorator | Coerces arrays to TypedArrays | 97ms dot product on 1M elements |
| `parallel_map` | Persistent worker pool across cores | 3.5x speedup on 8 cores |
| Radix sort FFI | O(n) sort for numeric arrays via Rust FFI | Sort 1M in 27ms |
| HTTP fast mode | Sync handlers, direct dispatch | 108K req/s |

See the [full performance guide](/guide/performance).

## Compile-Time Security

The `security {}` block centralizes your entire security policy in one place. The compiler generates all enforcement code -- zero runtime dependencies.

```tova
security {
  auth jwt { secret: env("JWT_SECRET"), expires: 86400 }

  role Admin { can: [manage_users, view_analytics] }
  role User  { can: [view_profile, edit_profile] }

  protect "/api/admin/*" { require: Admin }
  protect "/api/*" { require: authenticated }

  sensitive User.password { never_expose: true }
  sensitive User.email { visible_to: [Admin, "self"] }

  cors { origins: ["https://myapp.com"], credentials: true }
  csp { default_src: ["self"], script_src: ["self"] }
  rate_limit { max: 1000, window: 3600 }
  csrf { enabled: true, exempt: ["/api/webhooks/*"] }
  audit { events: [login, logout, manage_users], store: "audit_log" }
}
```

From this, the compiler generates JWT validation, role checking, route middleware, field sanitization, CSRF tokens, rate limit tracking, CSP headers, and audit logging. Compile-time warnings catch undefined roles, hardcoded secrets, and CORS wildcards before your code ever runs. [Learn more](/fullstack/security-block).

## Full-Stack Web

When you need a web application, Tova's block model lets you write server and client code in one file:

```tova
shared {
  type Todo { id: Int, text: String, done: Bool }
}

server {
  var todos = []

  fn all_todos() -> [Todo] { todos }

  fn add_todo(text: String) -> Todo {
    t = Todo(len(todos) + 1, text, false)
    todos = [...todos, t]
    t
  }
}

browser {
  state todos = []
  state draft = ""

  effect { todos = server.all_todos() }

  component App() {
    <div>
      <input value={draft} on:input={fn(e) draft = e.target.value} />
      <button on:click={fn() {
        server.add_todo(draft)
        draft = ""
        todos = server.all_todos()
      }}>"Add"</button>
      <ul>for t in todos { <li>"{t.text}"</li> }</ul>
    </div>
  }
}
```

`server.add_todo(draft)` is a compile-time RPC call. The compiler generates the HTTP endpoint, the fetch call, the serialization, and the async wrapping. You never write networking code.

## Scripting & Data

Tova works without web blocks. Scripts, CLI tools, data pipelines, AI apps:

```tova
// Data pipeline with pipes
data = read("sales.csv")
  |> filter(fn(row) row.revenue > 1000)
  |> sort_by(.region)
  |> group_by(.region, fn(rows) {
    { total: sum_by(rows, .revenue), count: len(rows) }
  })

write(data, "summary.json")
```

```tova
// AI integration built in
response = ask("Summarize this document", provider: "anthropic")
embeddings = embed(texts, provider: "openai")
category = classify(text, ["positive", "negative", "neutral"])
```

## Developer Experience

- **LSP server** with diagnostics, completion, go-to-definition, hover, and signature help
- **VS Code extension** with syntax highlighting and LSP integration
- **REPL** with multi-line input and stdlib context
- **Dev server** with hot reload on save
- **Production build** with bundling, content hashing, and minification
- **Rich error messages** with source context, carets, and suggestions
- **6,700+ tests** across 85 test files

## Get Started

```bash
curl -fsSL https://raw.githubusercontent.com/tova-lang/tova-lang/main/install.sh | sh
tova new my-app
cd my-app && tova dev
```

[Installation guide](/getting-started/) | [10-minute tour](/getting-started/tour) | [Tutorial](/tutorial) | [Why Tova?](/why-tova)

</div>
