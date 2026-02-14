# Tova Data Layer: Language Design & Implementation Plan

## Vision

Make Tova the language where data practitioners never leave. Read data, look at it, clean it, transform it, enrich it with AI, ship it — all through pipes, pattern matching, and the type system they already know. No pandas import. No Jupyter notebook. No separate API client. Just Tova.

---

## A. Table\<T\> — First-Class Tabular Data

Tables are thin wrappers around arrays of structs. Your `type` declaration IS the schema.

```tova
type Sale {
  date: String
  region: String
  amount: Float
}

// Read with type annotation → compiler validates column access
sales: Table<Sale> = read("sales.csv")

// Query with column expressions — .column compiles to row lambdas
result = sales
  |> where(.amount > 100)
  |> select(.region, .amount)
  |> group_by(.region)
  |> agg(total: sum(.amount), orders: count())
  |> sort_by(.total, desc: true)

// Column access
names = users[.name]          // [String] — column as array
first = users[0]              // User struct
page = users[10:20]           // Table<User> slice
users.shape                   // (1000, 4) tuple
users.columns                 // ["id", "name", "age", "email"]
```

### The `.column` Expression

The core syntactic innovation. `.age > 25` inside a table operation compiles to `(row) => row.age > 25`. This means **every Tova feature automatically works on columns**:

```tova
// Pipes on columns
users |> derive(.name_upper = .name |> upper() |> trim())

// Pattern matching on columns
users |> derive(.tier = match .spend {
  0.0..100.0 => "bronze"
  100.0..1000.0 => "silver"
  _ => "gold"
})

// String interpolation with columns
users |> derive(.greeting = "Hello, {.name} from {.city}!")

// If-expressions with columns
users |> derive(.label = if .active { "active" } else { "inactive" })

// Multiple derives at once
users |> derive(
  .full_name = "{.first} {.last}",
  .is_adult = .age >= 18,
  .domain = .email |> split("@") |> last()
)
```

### Table Operations (all pipe-friendly)

| Operation | Example | Purpose |
|-----------|---------|---------|
| `where` | `\|> where(.age > 25)` | Filter rows |
| `select` | `\|> select(.name, .age)` | Pick columns |
| `select(-.)` | `\|> select(-.password)` | Exclude columns |
| `derive` | `\|> derive(.new = .a + .b)` | Add/transform columns |
| `group_by` | `\|> group_by(.region)` | Group rows |
| `agg` | `\|> agg(total: sum(.x))` | Aggregate after group |
| `sort_by` | `\|> sort_by(.name, desc: true)` | Sort rows |
| `limit` | `\|> limit(10)` | Take first N |
| `join` | `\|> join(other, left: .id, right: .uid)` | Join tables |
| `pivot` | `\|> pivot(index: .date, columns: .cat, values: .amt)` | Long to wide |
| `unpivot` | `\|> unpivot(id: .name, columns: [.q1, .q2])` | Wide to long |
| `explode` | `\|> explode(.tags)` | Unnest arrays |
| `union` | `\|> union(other_table)` | Combine tables |
| `drop_duplicates` | `\|> drop_duplicates(by: .email)` | Remove dupes |

---

## B. Universal I/O — read() / write()

Format inferred from extension. Zero config.

```tova
// Read — polymorphic
sales = read("sales.csv")                           // → Table
config = read("config.json")                        // → Object
logs = read("events.jsonl")                         // → Table (row per line)
data = read("https://api.example.com/users.json")   // → from URL
rows = read(db, "SELECT * FROM users WHERE active")  // → from DB

// Write — format from extension
sales |> write("output.csv")
sales |> write("output.json")
report |> write("report.xlsx")

// Streaming for large files
for chunk in stream("huge.csv", batch: 1000) {
  chunk |> where(.valid) |> write("clean.csv", append: true)
}

// Options
data = read("data.tsv", delimiter: "\t", header: true)
```

---

## C. AI — Multiple Providers, Rich Methods, One-Off Calls

### Multiple Named Providers

Configure as many providers as you need. Named AI blocks follow the same pattern as named server blocks (`server "api" { }`).

```tova
server {
  // Default provider (unnamed) — used via ai.ask(), ai.embed(), etc.
  ai {
    provider: "anthropic"
    model: "claude-sonnet-4-20250514"
    api_key: env("ANTHROPIC_API_KEY")
    max_tokens: 4096
  }

  // Named providers — used via claude.ask(), gpt.embed(), etc.
  ai "claude" {
    provider: "anthropic"
    model: "claude-sonnet-4-20250514"
    api_key: env("ANTHROPIC_API_KEY")
    max_tokens: 4096
    temperature: 0.7
  }

  ai "gpt" {
    provider: "openai"
    model: "gpt-4o"
    api_key: env("OPENAI_API_KEY")
  }

  ai "local" {
    provider: "ollama"
    model: "llama3"
    base_url: "http://localhost:11434"
  }

  // Any custom/self-hosted model — fully open config
  ai "custom" {
    base_url: "https://my-company.com/v1"
    api_key: env("INTERNAL_API_KEY")
    model: "our-fine-tuned-model-v3"
    timeout: 60000
    headers: { "X-Team": "data-engineering" }
    // Any key-value pairs are passed through to the provider
  }
}
```

### The `ai {}` block is fully open

Every property in the block is passed to the provider client. No hardcoded property list. This means developers can use any model with any configuration — not just the popular ones. Common properties like `provider`, `model`, `api_key`, `base_url`, `temperature`, `max_tokens`, `timeout` have conventional meaning, but any extra properties are passed through as provider-specific config.

### AI Methods: ask, chat, embed, extract, classify

Each AI provider instance (named or default) exposes these methods:

```tova
server {
  ai { provider: "anthropic", model: "claude-sonnet-4-20250514", api_key: env("KEY") }

  // ai.ask — simple prompt → string response
  answer = ai.ask("What is the capital of France?")
  summary = ai.ask("Summarize: {article}")

  // Named provider
  answer = claude.ask("What is the capital of France?")

  // ai.chat — multi-turn conversation with message history
  response = ai.chat([
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello!" },
    { role: "assistant", content: "Hi! How can I help?" },
    { role: "user", content: "What's the weather like?" }
  ])

  // ai.embed — generate embeddings (single or batch)
  vec = ai.embed("some text")                         // [Float]
  vecs = ai.embed(["text1", "text2", "text3"])         // [[Float]]
  articles |> derive(.embedding = ai.embed(.content))  // in pipeline

  // ai.extract — structured output via the type system
  type ProductInfo { name: String, price: Float, category: String }
  info: ProductInfo = ai.extract("Extract product info: {raw_text}")
  // Compiler sends type schema → provider returns structured JSON

  // ai.classify — classification against categories or ADTs
  type Sentiment { Positive, Negative, Neutral }
  result: Sentiment = ai.classify("Great product!", Sentiment)
  // Or with string categories:
  category = ai.classify("Fix login bug", ["feature", "bug", "docs"])

  // ai.ask with tools — tool use / function calling
  tools = [
    {
      name: "get_weather",
      description: "Get current weather for a location",
      params: { location: String, unit: String }
    },
    {
      name: "search_db",
      description: "Search the database",
      params: { query: String }
    }
  ]
  response = ai.ask("What's the weather in Tokyo?", tools: tools)
  // response.tool_calls contains the tool invocations to handle
}
```

### AI in Data Pipelines

```tova
server {
  ai "fast" { provider: "anthropic", model: "claude-haiku", api_key: env("KEY") }
  ai "smart" { provider: "anthropic", model: "claude-sonnet-4-20250514", api_key: env("KEY") }

  // Use fast model for bulk classification, smart model for analysis
  enriched = reviews
    |> derive(.sentiment = fast.classify(.text, Sentiment))
    |> derive(.summary = fast.ask("Summarize in 10 words: {.text}"))
    |> where(.sentiment == Negative)
    |> derive(.root_cause = smart.ask("Analyze root cause: {.text}"))
}
```

### One-Off Calls (No Block Required)

For quick scripts or when you just need one AI call, no config block is required:

```tova
server {
  // One-off call with inline config — no ai {} block needed
  answer = ai.ask("What is 2+2?",
    provider: "anthropic",
    model: "claude-haiku",
    api_key: env("ANTHROPIC_API_KEY")
  )

  // One-off in a function
  fn summarize(text: String) -> String {
    ai.ask("Summarize: {text}",
      provider: "openai",
      model: "gpt-4o-mini",
      api_key: env("OPENAI_API_KEY")
    )
  }

  // One-off embedding
  vec = ai.embed("hello world",
    provider: "openai",
    model: "text-embedding-3-small",
    api_key: env("OPENAI_API_KEY")
  )
}
```

### Provider Interface (Internal)

Every provider implements this interface. Adding a new provider = one module:

```
Provider {
  ask(prompt: String, options: Object) -> String
  chat(messages: [Message], options: Object) -> String
  embed(text: String | [String], options: Object) -> [Float] | [[Float]]
  extract(prompt: String, schema: Object, options: Object) -> Object
  classify(text: String, categories: [String] | Type, options: Object) -> String
}
```

Built-in providers: `anthropic`, `openai`, `ollama`, `custom` (raw HTTP).
Custom providers use `base_url` + standard OpenAI-compatible chat completions API format, which most providers support.

---

## D. The `data {}` Block — Declarative Data Layer

The `data {}` block is a new top-level block (alongside `shared`, `server`, `client`) for declaring data sources, reusable pipelines, validation rules, and refresh policies. It separates the **what** (data definitions) from the **how** (serving/rendering).

### Why a Data Block?

Without it, data source declarations, cleaning logic, and validation rules are scattered across server functions. The `data {}` block centralizes the data layer:

- **Source registry** — all data sources declared in one place
- **Named pipelines** — reusable transform chains referenced by name
- **Validation rules** — per-type constraints
- **Refresh/cache policies** — how often sources reload
- **Self-documenting** — new team members read `data {}` to understand the data flow

### Syntax

```tova
data {
  // ── Sources ──────────────────────────────────────
  // Declarative data source definitions
  // Loaded lazily on first access, cached by default

  source customers: Table<Customer> = read("customers.csv")
  source orders: Table<Order> = read("orders.csv")
  source products: Table<Product> = read(db, "SELECT * FROM products")
  source exchange_rates = read("https://api.exchangerate.host/latest")

  // Sources with options
  source logs: Table<LogEntry> = read("logs.jsonl", batch: true)

  // ── Pipelines ────────────────────────────────────
  // Named, reusable transform chains
  // Can reference sources and other pipelines

  pipeline clean_customers = customers
    |> drop_nil(.email)
    |> fill_nil(.spend, 0.0)
    |> derive(
      .name = .name |> trim(),
      .email = .email |> lower()
    )
    |> where(.spend > 0)

  pipeline customer_summary = clean_customers
    |> group_by(.country)
    |> agg(
      count: count(),
      total_spend: sum(.spend),
      avg_spend: mean(.spend)
    )
    |> sort_by(.total_spend, desc: true)

  pipeline top_products = orders
    |> join(products, left: .product_id, right: .id)
    |> group_by(.name)
    |> agg(revenue: sum(.amount), units: sum(.quantity))
    |> sort_by(.revenue, desc: true)
    |> limit(20)

  // ── Validation ───────────────────────────────────
  // Declarative validation rules per type

  validate Customer {
    .email |> contains("@")
    .name |> len() > 0
    .spend >= 0
  }

  validate Order {
    .quantity > 0
    .amount > 0
  }

  // ── Refresh Policies ─────────────────────────────
  // How often sources are reloaded (for long-running servers)

  refresh exchange_rates every 1.hour
  refresh customers every 15.minutes
  refresh orders on_demand     // only refreshed when explicitly called
}
```

### How `data {}` Interacts with Other Blocks

```tova
data {
  source users: Table<User> = read("users.csv")
  pipeline active_users = users |> where(.active)
}

server {
  // Reference pipelines directly — they're in scope
  fn get_active_users() -> Table<User> {
    active_users    // returns the cached pipeline result
  }

  fn get_user(id: Int) -> Option<User> {
    users |> find(fn(u) u.id == id)
  }

  route GET "/api/users" => get_active_users
}

client {
  state users: Table<User> = Table([])

  effect {
    users = server.get_active_users()
  }
}
```

### What Data Block Compiles To

Sources compile to lazy-initialized cached getters. Pipelines compile to functions that chain the transforms. Validation compiles to validator functions. Refresh policies compile to interval timers.

```javascript
// data { source customers = read("customers.csv") }
// compiles to:
let __data_customers_cache = null;
function __data_customers() {
  if (!__data_customers_cache) {
    __data_customers_cache = read("customers.csv");
  }
  return __data_customers_cache;
}

// data { pipeline clean = customers |> where(.active) }
// compiles to:
function __data_clean() {
  return where(__data_customers(), (row) => row.active);
}

// data { refresh customers every 15.minutes }
// compiles to:
setInterval(() => { __data_customers_cache = null; }, 15 * 60 * 1000);
```

---

## E. Data Exploration — peek, describe, schema

```tova
// peek() — prints preview, passes data through (transparent in pipes)
sales = read("sales.csv")
  |> peek()                        // shows first 10 rows
  |> where(.amount > 0)
  |> peek(title: "After filter")   // labeled preview
  |> sort_by(.amount, desc: true)

// describe() — statistical summary per column
sales |> describe()
// Column │ Type  │ Non-Null │ Mean  │ Min │ Max
// amount │ Float │ 4982     │ 245.3 │ 0.5 │ 9999.0

// schema() — column types
sales |> schema()

// Properties
sales.shape      // (5000, 6)
sales.columns    // ["date", "region", "product", "amount", "qty", "discount"]
sales.rows       // 5000
```

`peek()` is the data practitioner's best friend. Insert it anywhere in a pipeline to see what the data looks like at that point, without breaking the chain.

---

## F. Data Cleaning & Validation

```tova
// Refinement types — compile-time + runtime validation
type Email = String where { it.contains("@") and it.contains(".") }
type Age = Int where { 0 <= it and it <= 150 }

// Cleaning pipeline
clean = raw_data
  |> cast(.age, Int)
  |> cast(.price, Float)
  |> drop_nil(.email)
  |> fill_nil(.city, "Unknown")
  |> drop_duplicates(by: .email)
  |> rename(.old_name, "new_name")
  |> derive(.email = .email |> lower() |> trim())

// Validation with Result types
validated = data |> validate(fn(row) {
  guard row.age > 0 else { return Err("Age must be positive") }
  guard row.email |> contains("@") else { return Err("Invalid email") }
  Ok(row)
})
good = validated |> filter_ok()
bad = validated |> filter_err()
```

---

## G. Full-Stack Data App (End-to-End Example)

```tova
shared {
  type Customer {
    id: Int
    name: String
    email: String
    spend: Float
    country: String
  }

  type Sentiment { Positive, Negative, Neutral }
}

data {
  source raw_customers: Table<Customer> = read("customers.csv")

  pipeline customers = raw_customers
    |> drop_nil(.email)
    |> fill_nil(.spend, 0.0)
    |> derive(.name = .name |> trim(), .email = .email |> lower())
    |> where(.spend > 0)
    |> sort_by(.spend, desc: true)

  pipeline summary = customers
    |> group_by(.country)
    |> agg(
      count: count(),
      total_spend: sum(.spend),
      avg_spend: mean(.spend)
    )
    |> sort_by(.total_spend, desc: true)

  validate Customer {
    .email |> contains("@")
    .name |> len() > 0
    .spend >= 0
  }

  refresh raw_customers every 10.minutes
}

server {
  ai "fast" {
    provider: "anthropic"
    model: "claude-haiku"
    api_key: env("ANTHROPIC_API_KEY")
  }

  ai "smart" {
    provider: "anthropic"
    model: "claude-sonnet-4-20250514"
    api_key: env("ANTHROPIC_API_KEY")
  }

  fn get_customers() -> Table<Customer> { customers }
  fn get_summary() { summary }

  fn get_insights() {
    customers
      |> derive(
        .sentiment = fast.classify(.email, Sentiment),
        .segment = smart.ask("Segment: spend={.spend}, country={.country}. Reply: budget/mid/premium")
      )
  }

  route GET "/api/customers" => get_customers
  route GET "/api/summary" => get_summary
  route GET "/api/insights" => get_insights
}

client {
  state customers: Table<Customer> = Table([])
  state summary = []
  state search = ""

  computed filtered = customers
    |> where(.name |> lower() |> contains(search |> lower()))

  effect {
    customers = server.get_customers()
    summary = server.get_summary()
  }

  component App {
    <div>
      <h1>Customer Dashboard</h1>
      <input bind:value={search} placeholder="Search..." />
      <DataTable data={filtered} />
    </div>
  }
}
```

---

## Implementation Plan

### Phase 1: Table Runtime & Stdlib Functions

**No compiler changes.** Build the Table class and all query functions. Test with explicit lambdas: `users |> where(fn(r) r.age > 25)`.

**New files:**
- `src/runtime/table.js` — Table class (rows, shape, columns, iteration, slicing, JSON serialization)
- `src/runtime/io.js` — `read()` / `write()` with CSV parser, JSON/JSONL support, URL fetching

**Modified files:**
- `src/stdlib/inline.js` — Add table operation functions as inline strings (same pattern as existing `filter`, `map`, etc.): `table_where`, `table_select`, `table_derive`, `table_group_by`, `table_agg`, `table_sort_by`, `table_join`, `table_pivot`, `table_unpivot`, `peek`, `describe`, `schema_of`, `cast`, `drop_nil`, `fill_nil`, `drop_duplicates`, `table_rename`, `explode`, `table_union`, `mean`, `median`
- `src/stdlib/core.js` — Register new builtins for tree-shaking
- `src/analyzer/analyzer.js` — Register table builtins in `registerBuiltins()`

**Design decisions:**
- Row-based storage (array of JS objects) — simple, JSON-native, fast enough for target scale
- All operations return new Tables (immutable, matching Tova philosophy)
- `peek()` returns data unchanged — transparent pipeline debugging

### Phase 2: Column Expression Syntax

**Compiler changes** to enable `.column` syntax instead of explicit lambdas.

**Modified files:**
- `src/parser/ast.js` — Add `ColumnExpression` node (name, loc) and `ColumnAssignment` node (target name, expression, loc)
- `src/parser/parser.js` — In `parsePrimary()`: when `.IDENTIFIER` appears at expression-start (after `(`, `,`, `=`, `:`, `PIPE`), parse as `ColumnExpression` instead of `MemberExpression`
- `src/codegen/base-codegen.js` — In `genExpression()`: `ColumnExpression` compiles to `(row) => row.name`. Inside `derive()` arguments, `ColumnAssignment` compiles to `{ col_name: (row) => expr }`. Inside `select()`, `ColumnExpression` compiles to string `"name"`. Negative column (`-ColumnExpression`) compiles to exclude descriptor
- `src/analyzer/types.js` — Add `TableType` class wrapping a `RecordType` for column validation
- `src/analyzer/analyzer.js` — Validate `.column` references against struct fields when table type is known

### Phase 3: AI Integration

**Compiler + runtime.** Named `ai {}` blocks follow the named `server/client` block pattern.

**New files:**
- `src/runtime/ai.js` — AI client runtime with:
  - **Provider registry**: built-in `anthropic`, `openai`, `ollama`, `custom` (raw HTTP OpenAI-compatible)
  - **Provider interface**: `ask()`, `chat()`, `embed()`, `extract()`, `classify()` — each provider implements these
  - **Named instances**: `ai "claude" { ... }` creates `claude` variable with `.ask()`, `.chat()`, `.embed()`, `.extract()`, `.classify()` methods
  - **Default instance**: unnamed `ai { ... }` creates the `ai` object itself with the same methods
  - **One-off calls**: `ai.ask("...", provider: "...", model: "...", api_key: "...")` — inline config merged with defaults
  - **Tool use**: `ai.ask("...", tools: [...])` — tool definitions passed to provider, tool calls returned in response
  - **Batch concurrency**: when used in `derive()` on tables, automatically batches with configurable `max_concurrent` (default 5)
  - **Open config**: all key-value pairs in the `ai {}` block passed through to the provider client — no hardcoded property list

**Modified files:**
- `src/parser/ast.js` — Add `AiConfigDeclaration` node with `name` (optional string, null for default), `config` (key-value map)
- `src/parser/parser.js` — In `parseServerStatement()` and top-level: recognize `ai` keyword + optional string name + `{` config `}`. Same parsing pattern as `db {}` but with optional name like named server blocks
- `src/codegen/server-codegen.js` — Emit AI client initialization. Named blocks: `const claude = __createAI({...config})`. Default: `const ai = __createAI({...config})`
- `src/analyzer/analyzer.js` — Register AI provider names as variables in scope. Register `ai.ask`, `ai.chat`, `ai.embed`, `ai.extract`, `ai.classify` as known methods. When `ai.extract()` result has a type annotation, emit the type schema

### Phase 4: Data Block & Refinement Types

**Compiler changes** for `data { }` block and `type X = Y where { ... }`.

**Modified files for data block:**
- `src/parser/ast.js` — Add `DataBlock` (body), `SourceDeclaration` (name, type, expression), `PipelineDeclaration` (name, expression), `ValidateBlock` (typeName, rules), `RefreshPolicy` (sourceName, interval)
- `src/parser/parser.js` — Add `parseDataBlock()`: recognizes `data {` at top level. Inside: `source`, `pipeline`, `validate`, `refresh` keywords. Source/pipeline parse as name = expression. Validate parses a block of column predicates. Refresh parses `every N.unit` or `on_demand`
- `src/codegen/server-codegen.js` — Sources compile to lazy cached getters. Pipelines compile to functions. Validate compiles to validator functions. Refresh compiles to `setInterval` cache invalidation
- `src/analyzer/analyzer.js` — Register source and pipeline names in scope. Validate that pipeline references exist

**Modified files for refinement types:**
- `src/parser/ast.js` — Add `RefinementType` node (name, baseType, predicate)
- `src/parser/parser.js` — After parsing `type Alias = BaseType`, check for `where` keyword + block. Parse block with `it` as implicit parameter
- `src/codegen/base-codegen.js` — Emit validator function `__validate_TypeName(it) { ... }`. Insert validation calls at annotated function parameters
- `src/analyzer/analyzer.js` — Track refinement types, validate base type compatibility

### Phase 5: Client Integration & Polish

**Modified files:**
- `src/codegen/client-codegen.js` — Table-aware signal serialization (Tables crossing RPC boundary serialize as JSON arrays, reconstruct on client)
- `src/runtime/embedded.js` — Embed table runtime for client-side table operations on reactive state

---

## Verification

### Phase 1 (Table Runtime)
```bash
# Test file using explicit lambdas
echo 'server {
  sales = read("test.csv")
    |> peek()
    |> where(fn(r) r.amount > 100)
    |> group_by(fn(r) r.region)
    |> peek(title: "Grouped")
}' > test_table.tova
tova run test_table.tova
```

### Phase 2 (Column Syntax)
```bash
echo 'server {
  sales = read("test.csv")
    |> where(.amount > 100)
    |> select(.region, .amount)
    |> derive(.double = .amount * 2)
    |> peek()
}' > test_columns.tova
tova run test_columns.tova
```

### Phase 3 (AI — Multiple Providers)
```bash
echo 'server {
  ai "claude" {
    provider: "anthropic"
    model: "claude-haiku"
    api_key: env("ANTHROPIC_API_KEY")
  }
  result = claude.ask("Say hello")
  print(result)

  // One-off call
  answer = ai.ask("What is 2+2?",
    provider: "openai",
    model: "gpt-4o-mini",
    api_key: env("OPENAI_API_KEY")
  )
  print(answer)
}' > test_ai.tova
tova run test_ai.tova
```

### Phase 4 (Data Block + Refinement Types)
```bash
echo 'shared {
  type Email = String where { it |> contains("@") }
  type User { name: String, email: Email, age: Int }
}
data {
  source users: Table<User> = read("users.csv")
  pipeline adults = users |> where(.age >= 18)
  validate User { .name |> len() > 0, .age >= 0 }
}
server {
  fn get_adults() { adults }
  route GET "/api/adults" => get_adults
}' > test_data.tova
tova run test_data.tova
```

### Unit Tests
- `tests/table.test.js` — Table class, all query operations, edge cases
- `tests/column-expr.test.js` — Column expression parsing and codegen
- `tests/io.test.js` — read/write for CSV, JSON, JSONL
- `tests/ai.test.js` — AI config parsing, named providers, all methods, tools, one-off calls
- `tests/data-block.test.js` — source, pipeline, validate, refresh declarations
- `tests/refinement.test.js` — Refinement type parsing, validation codegen
