# Tova for Data Professionals

Tova is a full-stack language with first-class support for tabular data, pipeline composition, and safe error handling. Whether you're an analyst exploring CSV files, a data engineer building production pipelines, a data scientist optimizing numerical code, or a full-stack data professional shipping dashboards — Tova provides a single language that scales with your ambition.

This guide walks through Tova's data capabilities by practitioner tier, with working examples at every step.

## Quick Taste

Before diving in, here's what a complete data workflow looks like in Tova:

```tova
// Load data (CSV, JSON, JSONL, Parquet, Excel — format auto-detected)
sales = read("sales.csv")

// Explore
sales |> peek()
sales |> describe()

// Transform
report = sales
  |> dropNil(.customer_id)
  |> where(.amount > 0)
  |> derive(
    .margin = (.revenue - .cost) / .revenue,
    .quarter = "Q{ceil(datePart(dateParse(.date), 'month') / 3)}"
  )
  |> groupBy(.region)
  |> agg(
    revenue: sum(.revenue),
    avg_margin: mean(.margin),
    orders: count()
  )
  |> sortBy(.revenue, desc: true)

// Output
peek(report, title: "Revenue by Region")
write(report, "report.csv")
```

No imports. No boilerplate. The pipe operator `|>` and column expressions `.column` make data pipelines read top-to-bottom, like a recipe.

---

## Tier 1: Analyst

Analysts live in spreadsheets and SQL. You want to wrangle data without fighting tooling. Tova's strength here is that **data pipelines read like English**.

### Loading Data

Tova auto-detects format from the file extension:

```tova
// Local files
customers = read("customers.csv")
config = read("settings.json")
events = read("events.jsonl")

// Parquet and Excel
analytics = read("warehouse.parquet")
report = read("quarterly.xlsx")
report = read("quarterly.xlsx", sheet: "Sales")

// Remote URLs
api_data = read("https://api.example.com/data.json")
```

`read()` returns a `Table` — an ordered collection of rows with named columns.

### Exploring Data

Three functions give you instant insight into any dataset:

```tova
customers |> peek()           // First 10 rows, formatted
customers |> describe()       // Column stats: count, mean, min, max
customers |> schema()         // Column names and inferred types
```

`peek()` is transparent — it prints a preview and passes data through unchanged, so you can drop it into any pipeline without breaking the chain:

```tova
result = sales
  |> peek()                          // see raw data
  |> where(.amount > 100)
  |> peek(title: "After filter")     // see what survived
  |> sortBy(.amount, desc: true)
```

### Filtering Rows

Use `where()` with column expressions. The `.column` syntax compiles to a row-level accessor — `.age > 25` becomes `fn(row) row.age > 25`:

```tova
adults = users |> where(.age >= 18)
active = users |> where(.active and .email |> contains("@"))

// Multiple conditions
premium = orders |> where(.amount > 1000 and .status == "completed")
```

### Selecting and Excluding Columns

```tova
// Keep only these columns
contact_info = users |> select(.name, .email, .phone)

// Exclude sensitive columns
safe = users |> select(-.password, -.ssn)
```

### Adding Computed Columns

`derive()` creates new columns or transforms existing ones:

```tova
enriched = orders |> derive(
  .total = .quantity * .price,
  .tax = .quantity * .price * 0.08,
  .status_clean = .status |> upper() |> trim()
)
```

Column expressions support full Tova operations inside `derive()`:

```tova
users |> derive(
  .full_name = "{.first} {.last}",
  .domain = .email |> split("@") |> last(),
  .tier = match .spend {
    0.0..100.0 => "bronze"
    100.0..1000.0 => "silver"
    _ => "gold"
  },
  .label = if .active { "active" } else { "inactive" }
)
```

### Sorting and Limiting

```tova
// Ascending (default)
sorted_users = users |> sortBy(.name)

// Descending
top_earners = users |> sortBy(.salary, desc: true)

// Top N
top_10 = users |> sortBy(.score, desc: true) |> limit(10)
```

### Grouping and Aggregation

Group rows, then compute summary statistics:

```tova
by_region = sales
  |> groupBy(.region)
  |> agg(
    revenue: sum(.amount),
    avg_order: mean(.amount),
    order_count: count(),
    biggest: max(.amount),
    smallest: min(.amount),
    mid: median(.amount)
  )
```

Available aggregation functions:

| Function | Description |
|----------|-------------|
| `count()` | Number of rows in each group |
| `sum(.col)` | Sum of column values |
| `mean(.col)` | Arithmetic mean |
| `median(.col)` | Median value |
| `min(.col)` | Minimum value |
| `max(.col)` | Maximum value |

Multiple group keys work naturally:

```tova
by_region_quarter = sales
  |> groupBy(.region, .quarter)
  |> agg(
    revenue: sum(.amount),
    orders: count()
  )
```

### Charts

Visualize results with built-in SVG charting -- no external libraries needed:

```tova
by_region
  |> barChart(x: .region, y: .revenue, title: "Revenue by Region")
  |> writeText("revenue_chart.svg")

// Line chart for trends
sales
  |> lineChart(x: .date, y: .amount, title: "Sales Trend")
  |> writeText("trend.svg")

// Histogram for distributions
orders
  |> histogram(col: .amount, bins: 15, title: "Order Size Distribution")
  |> writeText("distribution.svg")
```

Six chart types: `bar_chart`, `line_chart`, `scatter_chart`, `histogram`, `pie_chart`, `heatmap`. All return SVG strings -- pipe to `writeText()` to save.

### Joining Tables

Combine two tables on matching columns:

```tova
// Inner join (default) — only matching rows
order_details = orders |> join(products, left: .product_id, right: .product_id)

// Left join — all rows from left table
full_report = orders |> join(products, left: .product_id, right: .product_id, how: "left")

// When column names differ between tables
merged = orders |> join(products, left: .prod_id, right: .product_id)
```

Join types: `"inner"` (default), `"left"`, `"right"`, `"outer"`, `"cross"`, `"anti"`, `"semi"`.

After a join, columns from both tables are available:

```tova
order_details = orders
  |> join(products, left: .product_id, right: .product_id)
  |> derive(
    .total = .quantity * .price,        // .quantity from orders
    .margin = (.price - .cost) * .quantity  // .cost from products
  )
```

### A Complete Analyst Workflow

Here's a realistic analysis — load two files, clean, join, aggregate, and output:

```tova
// Load
customers = read("customers.csv")
orders = read("orders.csv")

// Clean
clean_orders = orders
  |> dropNil(.customer_id)
  |> fillNil(.quantity, 1)
  |> cast(.price, Float)
  |> where(.status != "cancelled")

// Join and enrich
detailed = clean_orders
  |> join(customers, left: .customer_id, right: .id, how: "left")
  |> derive(.total = .quantity * .price)

// Aggregate: lifetime value per customer
lifetime_value = detailed
  |> groupBy(.customer_id, .name)
  |> agg(
    orders: count(),
    total_spent: sum(.total),
    avg_order: mean(.total)
  )
  |> sortBy(.total_spent, desc: true)

// Output
peek(lifetime_value, title: "Customer Lifetime Value")
write(lifetime_value, "customer_ltv.csv")
print("Done — {lifetime_value.rows} customers analyzed")
```

### From Analysis to CLI Tool

Your analysis script works. Now your manager wants the team to use it. In Python, that means `argparse` boilerplate and packaging. In Tova, wrap it in a `cli {}` block:

```tova
cli {
  name: "sales-report"
  version: "1.0.0"
  description: "Generate sales reports from CSV data"

  fn generate(file: String, --region: String = "all", --top: Int = 10, --output: String = "report.csv") {
    data = read(file)

    filtered = if region != "all" {
      data |> where(.region == region)
    } else {
      data
    }

    result = filtered
      |> sortBy(.revenue, desc: true)
      |> limit(top)

    peek(result, title: "Sales Report: {region}")
    write(result, output)
    print(green("Written to {output}"))
  }
}
```

Run it:

```bash
# Auto-generated help
./sales-report --help

# Run with defaults
./sales-report generate sales.csv

# Custom options
./sales-report generate sales.csv --region=west --top=20 --output=west_report.csv
```

Auto-generated help, argument validation, colored output. **Zero friction from analysis to tool.**

---

## Tier 2: Data Engineer

Data engineers build pipelines that run reliably in production. Silent failures — a `None` slipping through a transform at 3am — are the enemy. Tova addresses this structurally.

### Result and Option: Errors as Values

Tova uses Rust's error model. Functions that can fail return `Result` (either `Ok(value)` or `Err(message)`). Functions that might not have a value return `Option` (either `Some(value)` or `None`):

```tova
fn parse_amount(raw: String) -> Result<Float, String> {
  cleaned = raw |> trim() |> replace("$", "") |> replace(",", "")
  match toFloat(cleaned) {
    Some(n) => if n >= 0 { Ok(n) } else { Err("Negative amount: {raw}") }
    None => Err("Not a number: {raw}")
  }
}
```

The compiler enforces handling — if you `match` on a `Result`, it warns when you forget the `Err` case.

### The `?` Propagation Operator

The `?` operator short-circuits on error, eliminating nested if-else pyramids:

```tova
fn process_record(raw: String) -> Result {
  parts = split(raw, ",")
  guard len(parts) == 4 else {
    return Err("Expected 4 fields, got {len(parts)}")
  }

  amount = parse_amount(parts[2])?     // returns Err early if parse fails
  date = dateParse(parts[3])?         // returns Err early if invalid date

  Ok({
    id: parts[0],
    name: parts[1] |> trim(),
    amount: amount,
    date: date
  })
}
```

Each `?` either unwraps the `Ok` value or returns the `Err` to the caller. No try/catch. No exception hierarchies. Just linear code that reads top-to-bottom.

### Validation Pipelines

Validate entire datasets, separating successes from failures:

```tova
raw = readText("raw_data.csv")
  |> fn(r) r.unwrapOr("")
  |> lines()
  |> drop(1)     // skip header

results = raw |> map(process_record)

clean   = filterOk(results)
errors  = filterErr(results)

print("Parsed {len(clean)} records, {len(errors)} errors")

// Write both outputs
write(Table(clean), "clean_data.csv")
write(Table(errors), "validation_errors.jsonl")
```

Every failure is accounted for. No silent `NaN` propagation. No "why is this column empty?" debugging sessions.

### Pattern Matching for Data Routing

Route records based on complex conditions:

```tova
fn route_event(event) {
  match event {
    { type: "purchase", amount } if amount > 1000 =>
      send_to_high_value_queue(event)

    { type: "purchase" } =>
      send_to_standard_queue(event)

    { type: "refund", reason: "fraud" ++ _ } =>
      alert_fraud_team(event)

    { type: "refund" } =>
      process_refund(event)

    _ =>
      log("Unknown event type: {event.type}")
  }
}
```

The string concat pattern `"fraud" ++ _` matches any reason starting with "fraud" — no regex needed. The compiler warns if you miss a case.

### Guard Clauses for Validation

Guard clauses flatten nested conditionals into linear assertions:

```tova
fn validate_transaction(t) -> Result {
  guard t.amount > 0 else { return Err("Amount must be positive") }
  guard isUuid(t.id) else { return Err("Invalid transaction ID: {t.id}") }
  guard t.currency in ["USD", "EUR", "GBP"] else {
    return Err("Unsupported currency: {t.currency}")
  }
  guard dateParse(t.date) is Ok(_) else {
    return Err("Invalid date: {t.date}")
  }

  Ok(t)
}
```

### Data Cleaning Cookbook

Common cleaning operations, all pipe-friendly:

```tova
// Deduplication
orders |> dropDuplicates(by: .order_id)

// Nil handling
orders |> dropNil(.email)
orders |> fillNil(.country, "Unknown")
orders |> fillNil(.score, 0.0)

// Type casting
orders |> cast(.price, Float)
orders |> cast(.quantity, Int)
orders |> cast(.active, Bool)

// String normalization
orders |> derive(
  .name = .name |> trim(),
  .email = .email |> lower() |> trim(),
  .category = .category |> upper() |> trim(),
  .slug = .name |> lower() |> replace(" ", "-")
)

// Renaming
orders |> rename("unit_cost", "cost")
```

### Reshaping: Pivot and Unpivot

```tova
// Long to wide: one column per category
wide = revenue_data
  |> groupBy(.month, .category)
  |> agg(revenue: sum(.sales))
  |> pivot(index: .month, columns: .category, values: .revenue)

// Wide to long: collapse columns back to rows
long = wide
  |> unpivot(index: .month, name: "category", value: "revenue")

// Explode: unnest arrays into rows
expanded = data |> explode(.tags)
```

### Pipeline Layering

Structure production pipelines in layers, each with a single responsibility:

```tova
data {
  // Layer 1: Raw input
  source raw = read("orders.csv")

  // Layer 2: Clean
  pipeline clean = raw
    |> dropNil(.customer_id)
    |> dropDuplicates(by: .order_id)
    |> cast(.price, Float)
    |> derive(.status = .status |> upper() |> trim())

  // Layer 3: Transform
  pipeline with_totals = clean
    |> derive(.total = .quantity * .price)
    |> where(.total > 0)

  // Layer 4: Aggregate
  pipeline summary = with_totals
    |> groupBy(.category)
    |> agg(
      orders: count(),
      revenue: sum(.total),
      avg_order: mean(.total)
    )

  // Refresh policy
  refresh raw every 1.hour
}
```

Named pipelines are cached. Downstream consumers get the cached result between refreshes.

### Streaming Large Files

For files too large to fit in memory, `stream()` processes data in batches:

```tova
stream("huge_file.csv", batch: 10000)
  |> each(fn(batch) {
    cleaned = batch
      |> dropNil(.id)
      |> where(.active == true)
      |> derive(.total = .quantity * .price)
    write(cleaned, "output.csv", append: true)
  })
```

Batch size guidelines:

| Row Size | Recommended Batch |
|----------|------------------|
| < 100 bytes | 50,000 - 100,000 |
| 100 - 1,000 bytes | 10,000 - 50,000 |
| > 1,000 bytes | 1,000 - 10,000 |

### Lazy Table API

Build composable query chains that evaluate only when materialized:

```tova
result = lazy(huge_table)
  |> where(.status == "active")
  |> derive(.score = .revenue * .frequency)
  |> sortBy(.score, desc: true)
  |> limit(100)
  |> collect()     // materialize here
```

The lazy API builds a query plan. Tova can optimize the execution order — pushing filters before derives, for instance.

### SQLite

Connect to SQLite databases for persistent storage or querying existing datasets:

```tova
db = sqlite(":memory:")
db.exec("CREATE TABLE metrics (name TEXT, value REAL)")
db.exec("INSERT INTO metrics VALUES (?, ?)", ["cpu", 72.5])

results = db.query("SELECT * FROM metrics WHERE value > ?", [50])
peek(results)

// Write a Table directly to a database table
write(order_details, db, "order_details")

// Append new data
write(new_orders, db, "order_details", append: true)

db.close()
```

### Sampling

For large datasets, work with representative subsets:

```tova
// Random sample
subset = huge_table |> sample(10000, seed: 42)

// Stratified: proportional representation per group
balanced = huge_table |> stratified_sample(.category, 500, seed: 42)
```

### A Complete Data Engineering Pipeline

```tova
type Order {
  order_id: Int
  customer_id: Int
  product_id: Int
  quantity: Int
  price: Float
  order_date: String
  status: String
}

type Product {
  product_id: Int
  name: String
  category: String
  unit_cost: Float
}

// --- Load ---
raw_orders = read("orders.csv")
raw_products = read("products.csv")

// --- Clean ---
orders = raw_orders
  |> dropNil(.customer_id)
  |> dropNil(.product_id)
  |> fillNil(.quantity, 1)
  |> cast(.price, Float)
  |> derive(.status = .status |> upper() |> trim())
  |> where(.status != "CANCELLED")
  |> dropDuplicates(by: .order_id)
  |> sortBy(.order_date)

products = raw_products
  |> dropNil(.name)
  |> derive(
    .name = .name |> trim(),
    .category = .category |> lower() |> trim()
  )

// --- Join ---
order_details = orders
  |> join(products, left: .product_id, right: .product_id)
  |> derive(
    .total = .quantity * .price,
    .margin = (.price - .unit_cost) * .quantity
  )

// --- Aggregate ---
by_category = order_details
  |> groupBy(.category)
  |> agg(
    order_count: count(),
    total_revenue: sum(.total),
    total_margin: sum(.margin),
    avg_order: mean(.total),
    median_order: median(.total)
  )
  |> sortBy(.total_revenue, desc: true)

by_customer = order_details
  |> groupBy(.customer_id)
  |> agg(
    orders: count(),
    total_spent: sum(.total),
    avg_spent: mean(.total)
  )
  |> sortBy(.total_spent, desc: true)
  |> limit(50)

// --- Output ---
write(order_details, "output/order_details.csv")
write(by_category, "output/category_summary.json")
write(by_customer, "output/top_customers.json")

print("Pipeline complete:")
print("  {order_details.rows} order details")
print("  {by_category.rows} categories")
print("  {by_customer.rows} top customers")
```

---

## Tier 3: Data Scientist

Data scientists prototype in notebooks, then suffer when things need to be fast or go to production. Tova collapses that gap with performance decorators that optimize individual functions without rewriting the rest of your code.

### Statistics Built In

```tova
readings = read("sensor_data.csv") |> fn(t) t.getColumn("temperature")

print("Mean:       {mean(readings)}")
print("Median:     {percentile(readings, 50)}")
print("Std Dev:    {stdev(readings)}")
print("Variance:   {variance(readings)}")
print("Mode:       {mode(readings)}")
print("P95:        {percentile(readings, 95)}")
print("P99:        {percentile(readings, 99)}")
```

Get a full statistical summary of any table:

```tova
read("sensor_data.csv") |> describe()
// Column      | Type  | Non-Null | Mean   | Min  | Max
// temperature | Float | 4982     | 22.3   | -5.1 | 45.8
// humidity    | Float | 4980     | 65.7   | 12.0 | 99.9
```

### @fast: TypedArray Optimization

The `@fast` decorator tells the compiler that numeric array parameters should use TypedArrays — contiguous, unboxed memory instead of JS arrays of boxed numbers:

```tova
@fast
fn dot_product(a: [Float], b: [Float]) -> Float {
  var s = 0.0
  for i in range(len(a)) {
    s = s + a[i] * b[i]
  }
  s
}

// [Float] compiles to Float64Array
// for-in-range compiles to C-style for loop
// Result: 1.7x faster than equivalent Go code on 1M elements
```

Type mapping:

| Tova Annotation | TypedArray | Bytes per Element |
|----------------|------------|-------------------|
| `[Int]` | `Int32Array` | 4 |
| `[Float]` | `Float64Array` | 8 |
| `[Byte]` | `Uint8Array` | 1 |
| `[Float32]` | `Float32Array` | 4 |
| `[Uint16]` | `Uint16Array` | 2 |

### Typed Stdlib for Numerical Work

Optimized functions that operate directly on TypedArrays:

```tova
@fast
fn normalize(data: [Float]) -> [Float] {
  mu = typedSum(data) / len(data)
  diff = typedMap(data, fn(x) (x - mu) * (x - mu))
  sigma = sqrt(typedSum(diff) / len(data))
  typedMap(data, fn(x) (x - mu) / sigma)
}
```

Available typed functions:

| Function | Description |
|----------|-------------|
| `typedSum(arr)` | Sum with Kahan compensated summation (minimizes float error) |
| `typedDot(a, b)` | Dot product |
| `typedNorm(arr)` | L2 norm (Euclidean length) |
| `typedAdd(a, b)` | Element-wise addition |
| `typedScale(arr, s)` | Multiply every element by a scalar |
| `typedMap(arr, f)` | Map function over elements, preserving type |
| `typedReduce(arr, f, init)` | Reduce with typed array input |
| `typedSort(arr)` | Sort (returns new typed array) |
| `typedZeros(n)` | Float64Array of zeros |
| `typedOnes(n)` | Float64Array of ones |
| `typedFill(n, val)` | New Float64Array filled with value |
| `typedLinspace(start, end, n)` | n evenly-spaced values |
| `typedRange(start, end, step)` | Float64Array range |

### Numerically Stable Summation

```tova
@fast
fn precise_sum(data: [Float]) -> Float {
  typedSum(data)
}

// Regular sum of [1e16, 1, -1e16] might lose the 1
// typed_sum uses Kahan compensated summation to preserve it
result = precise_sum([1e16, 1.0, -1e16])
print(result)   // 1.0 (not 0)
```

### @wasm: Compile Hot Paths to WebAssembly

The `@wasm` decorator compiles a function directly to WebAssembly binary. No external toolchain. No Rust/C setup. Write Tova, get WASM:

```tova
@wasm
fn fibonacci(n: Int) -> Int {
  if n <= 1 { n }
  else { fibonacci(n - 1) + fibonacci(n - 2) }
}

print(fibonacci(40))    // compiled to native WASM
```

Supported in `@wasm` functions:

| Category | Supported |
|----------|-----------|
| **Types** | `Int` (i32), `Float` (f64), `Bool` (i32) |
| **Arithmetic** | `+`, `-`, `*`, `/`, `%` |
| **Comparison** | `==`, `!=`, `<`, `>`, `<=`, `>=` |
| **Logic** | `and`, `or`, `not` |
| **Control flow** | `if`/`elif`/`else`, `while`, `for` |
| **Calls** | Self-recursion, other `@wasm` functions |

::: warning Limitations
`@wasm` only supports numeric types and booleans — no strings, arrays, or objects. It's for numerical hot paths only.
:::

Use `@wasm` for CPU-bound numeric kernels: recursive algorithms, simulations, mathematical computations.

### parallel_map: Multi-Core Processing

Distribute array processing across all CPU cores using a persistent worker pool:

```tova
// Process chunks in parallel (4 workers)
chunks = chunk(large_dataset, 1000)
results = await parallelMap(chunks, fn(batch) {
  batch
    |> map(fn(r) expensive_transform(r))
    |> filter(fn(r) r.score > threshold)
}, 4)

final = flatten(results)
```

| Implementation | Time (64 items x 10M work) | Speedup |
|----------------|---------------------------|---------|
| Sequential `map()` | 1,355ms | 1.0x |
| `parallel_map` (pooled) | 379ms | 3.57x |

Workers persist and are reused across calls — no fork overhead per invocation.

### Composing Performance Features

The decorators compose naturally. Layer them for demanding workloads:

```tova
// WASM kernel for the inner computation
@wasm
fn kernel(x: Float, y: Float) -> Float {
  var result = 0.0
  var i = 0
  while i < 1000 {
    result = result + x * y / (1.0 + result)
    i = i + 1
  }
  result
}

// TypedArray processing with WASM inner loop
@fast
fn process(data: [Float]) -> [Float] {
  typedMap(data, fn(x) kernel(x, 1.0))
}

// Distribute across CPU cores
results = await parallelMap(batches, fn(batch) process(batch))
```

### Benchmark Results

All benchmarks on Apple Silicon, best of 3 runs:

| Benchmark | Time | Technique |
|-----------|------|-----------|
| Sort 1M integers | 27ms | Rust FFI radix sort |
| @fast dot product 1M | 97ms | Float64Array coercion |
| @wasm integer compute | 117ms | Native WebAssembly |
| N-body simulation | 22ms | Float optimization |
| Prime sieve 10M | 25ms | Uint8Array fill |
| Result.map 3x chain (10M) | 10ms | Compile-time fusion |
| JSON parse 11MB | 37ms | SIMD-accelerated |
| Fibonacci iterative (n=40) | 20ms | JIT-optimized tight loop |

Tova beats Go on: sort (3.5x), fibonacci iterative (2x), n-body (1.5x), typed arrays (4x), JSON (2x).

See [Performance](./performance) for the full benchmark suite and optimization details.

---

## Tier 4: Full-Stack Data Professional

This is where Tova diverges from every other data language. **No other tool lets you go from CSV to deployed data product in a single file.**

### Script to Server in Four Steps

**Step 1: Start with a standalone script**

```tova
raw = read("sales.csv")
clean = raw |> dropNil(.id) |> cast(.amount, Float)
summary = clean |> groupBy(.region) |> agg(total: sum(.amount))
write(summary, "report.json")
print("Done!")
```

**Step 2: Wrap in a data block for caching and refresh**

```tova
data {
  source raw = read("sales.csv")
  pipeline clean = raw |> dropNil(.id) |> cast(.amount, Float)
  pipeline summary = clean |> groupBy(.region) |> agg(total: sum(.amount))
  refresh raw every 1.hour
}
```

**Step 3: Add an API**

```tova
server {
  get "/api/summary" => fn(req) {
    { json: summary.toArray() }
  }

  get "/api/details/:region" => fn(req) {
    details = clean |> where(.region == req.params.region)
    { json: details.toArray() }
  }
}
```

**Step 4: Add a dashboard**

```tova
browser {
  fn Dashboard() {
    data = signal([])
    loading = signal(true)

    effect(fn() {
      result = await fetch("/api/summary").json()
      data(result)
      loading(false)
    })

    <div>
      <h1>"Sales by Region"</h1>
      {if loading() {
        <p>"Loading..."</p>
      } else {
        <table>
          <tr><th>"Region"</th><th>"Revenue"</th></tr>
          {data() |> map(fn(row) {
            <tr>
              <td>{row.region}</td>
              <td>"${toFixed(row.total, 2)}"</td>
            </tr>
          })}
        </table>
      }}
    </div>
  }
}
```

Each step adds structure without rewriting the previous work. The same pipeline expressions used in step 1 power the API in step 3.

### Security

Add JWT auth and role-based access with a `security {}` block:

```tova
security {
  auth {
    type: "jwt"
    secret: env("JWT_SECRET")
    algorithm: "HS256"
  }

  roles {
    admin: ["read", "write", "delete"]
    analyst: ["read"]
    viewer: ["read"]
  }

  route "/api/*" {
    required_role: "analyst"
  }

  route "/api/admin/*" {
    required_role: "admin"
  }

  cors {
    origins: ["https://dashboard.example.com"]
    methods: ["GET", "POST"]
  }

  rate_limit {
    window: 60
    max: 100
  }
}
```

The compiler integrates security into both `server {}` and `edge {}` code generation. JWT validation, route protection, CORS headers, and rate limiting are handled for you.

### Deploy to the Edge

The same data logic deploys to five edge platforms from one block:

```tova
edge "analytics" {
  target: "cloudflare"

  kv { cache: "METRIC_CACHE" }

  get "/api/fast-metrics" => fn(req) {
    cached = await cache.get("latest")
    if cached {
      { json: jsonParse(cached) }
    } else {
      data = compute_metrics()
      await cache.put("latest", jsonStringify(data), {expirationTtl: 300})
      { json: data }
    }
  }
}
```

Change `target: "cloudflare"` to `"deno"`, `"vercel"`, `"lambda"`, or `"bun"` — the compiler generates platform-specific code for each.

### Forms for Data Input

Collect structured data with built-in validation:

```tova
form DataEntry {
  field name: String {
    validators: [required(), minLength(2)]
  }

  field email: String {
    validators: [required(), email()]
  }

  field amount: Float {
    validators: [required(), min(0)]
  }

  field category: String {
    validators: [required(), oneOf(["sales", "marketing", "engineering"])]
  }
}
```

Forms generate signal-backed reactive UI with per-field validation, error messages, and touched state tracking. See [Form Block](../fullstack/form-block) for the full API.

### A Complete Data Application

Here's a realistic full-stack data application in a single file:

```tova
// === Shared Types ===

shared {
  type Metric {
    name: String
    value: Float
    timestamp: String
    category: String
  }

  type Summary {
    category: String
    current: Float
    average: Float
    trend: String
  }
}

// === Data Layer ===

data {
  source metrics = read("metrics.csv")

  pipeline clean = metrics
    |> dropNil(.name)
    |> cast(.value, Float)

  pipeline by_category = clean
    |> groupBy(.category)
    |> agg(
      current: max(.value),
      average: mean(.value)
    )
    |> derive(
      .trend = if .current > .average { "up" } else { "down" }
    )

  refresh metrics every 5.minutes
}

// === API ===

server {
  port: 8080

  get "/api/summary" => fn(req) {
    { json: by_category.toArray() }
  }

  get "/api/metrics/:category" => fn(req) {
    details = clean
      |> where(.category == req.params.category)
      |> sortBy(.timestamp, desc: true)
      |> limit(100)
    { json: details.toArray() }
  }

  get "/api/export" => fn(req) {
    format = req.query.format or "csv"
    match format {
      "csv" => { text: table_to_csv(by_category) }
      "json" => { json: by_category.toArray() }
      _ => { status: 400, json: { error: "Unsupported format" } }
    }
  }
}

// === Security ===

security {
  auth { type: "jwt", secret: env("JWT_SECRET") }
  roles {
    admin: ["read", "write"]
    viewer: ["read"]
  }
  route "/api/*" { required_role: "viewer" }
}

// === Dashboard ===

browser {
  fn App() {
    summary = signal([])
    loading = signal(true)
    selected = signal(nil)
    details = signal([])

    effect(fn() {
      data = await fetch("/api/summary").json()
      summary(data)
      loading(false)
    })

    fn select_category(cat) {
      selected(cat)
      result = await fetch("/api/metrics/{cat}").json()
      details(result)
    }

    <div>
      <h1>"Metrics Dashboard"</h1>

      {if loading() {
        <p>"Loading..."</p>
      } else {
        <div>
          <table>
            <tr>
              <th>"Category"</th>
              <th>"Current"</th>
              <th>"Average"</th>
              <th>"Trend"</th>
            </tr>
            {summary() |> map(fn(row) {
              <tr onclick={fn() select_category(row.category)}>
                <td>{row.category}</td>
                <td>{toFixed(row.current, 2)}</td>
                <td>{toFixed(row.average, 2)}</td>
                <td>{row.trend}</td>
              </tr>
            })}
          </table>

          {if selected() != nil {
            <div>
              <h2>"Details: {selected()}"</h2>
              <table>
                <tr><th>"Name"</th><th>"Value"</th><th>"Time"</th></tr>
                {details() |> map(fn(m) {
                  <tr>
                    <td>{m.name}</td>
                    <td>{toFixed(m.value, 2)}</td>
                    <td>{timeAgo(dateParse(m.timestamp))}</td>
                  </tr>
                })}
              </table>
            </div>
          }}
        </div>
      }}
    </div>
  }
}
```

Build and run:

```bash
tova build --production    # bundles, minifies, hashes
tova run app.tova          # development mode with hot reload
```

---

## Stdlib Quick Reference for Data Work

### Collections

| Function | Description |
|----------|-------------|
| `map(arr, fn)` | Transform each element |
| `filter(arr, fn)` | Keep matching elements |
| `reduce(arr, fn, init)` | Accumulate to single value |
| `flatMap(arr, fn)` | Map and flatten |
| `sum(arr)` | Sum numeric array |
| `mean(arr)` | Average |
| `min(arr)` / `max(arr)` | Minimum / maximum |
| `sorted(arr)` | Sort (Rust FFI for large numeric arrays) |
| `unique(arr)` | Remove duplicates |
| `groupBy(arr, fn)` | Group by key function |
| `frequencies(arr)` | Count occurrences |
| `zip(a, b)` | Combine arrays pairwise |
| `enumerate(arr)` | With indices |
| `chunk(arr, n)` | Split into n-sized chunks |
| `flatten(arr)` | Flatten one level |
| `partition(arr, fn)` | Split by predicate |
| `take(arr, n)` / `drop(arr, n)` | First N / skip N |
| `find(arr, fn)` | First match or null |
| `combinations(arr, r)` | r-length combinations |
| `scan(arr, fn, init)` | Running accumulation |

### Math and Statistics

| Function | Description |
|----------|-------------|
| `stdev(arr)` | Standard deviation |
| `variance(arr)` | Variance |
| `percentile(arr, p)` | p-th percentile (0-100) |
| `mode(arr)` | Most frequent value |
| `avg(arr)` | Average (alias for mean) |
| `abs(x)` / `sqrt(x)` / `pow(b, e)` | Basic math |
| `floor(x)` / `ceil(x)` / `round(x)` | Rounding |
| `clamp(x, lo, hi)` | Constrain to range |
| `randomInt(lo, hi)` | Random integer |
| `gcd(a, b)` / `lcm(a, b)` | Number theory |
| `lerp(a, b, t)` | Linear interpolation |
| `isClose(a, b, tol)` | Float comparison |

### Strings

| Function | Description |
|----------|-------------|
| `upper(s)` / `lower(s)` | Case conversion |
| `trim(s)` | Strip whitespace |
| `split(s, sep)` / `join(arr, sep)` | Split and join |
| `contains(s, sub)` | Substring check |
| `replace(s, from, to)` | Replace all |
| `startsWith(s, pre)` / `endsWith(s, suf)` | Prefix/suffix |
| `padStart(s, n, fill)` / `padEnd(s, n, fill)` | Padding |
| `slug(s)` | URL-safe slug |
| `snakeCase(s)` / `camelCase(s)` | Case styles |
| `isEmail(s)` / `isUrl(s)` / `isUuid(s)` | Validation |

### Date and Time

| Function | Description |
|----------|-------------|
| `now()` | Milliseconds since epoch |
| `nowIso()` | ISO 8601 string |
| `dateParse(s)` | Parse date string |
| `dateFormat(d, fmt)` | Format date |
| `dateAdd(d, n, unit)` | Add time |
| `dateDiff(d1, d2, unit)` | Time difference |
| `datePart(d, part)` | Extract year, month, day, etc. |
| `timeAgo(d)` | "2 hours ago" |

### I/O

| Function | Description |
|----------|-------------|
| `read(path)` | Auto-detect CSV/JSON/JSONL/Parquet/Excel |
| `write(table, path)` | Write CSV/JSON/JSONL/Parquet/Excel |
| `sqlite(path)` | Open SQLite database |
| `readText(path)` | Read raw text |
| `writeText(path, content)` | Write raw text |
| `exists(path)` | File exists check |
| `globFiles(pattern)` | Match file pattern |
| `ls(dir)` | List directory |
| `mkdir(dir)` | Create directory |

### Functional

| Function | Description |
|----------|-------------|
| `compose(...fns)` | Right-to-left composition |
| `pipeFn(...fns)` | Left-to-right composition |
| `partial(fn, ...args)` | Bind first N arguments |
| `memoize(fn)` | Cache results |
| `curry(fn)` | Curried version |
| `identity(x)` | Return input as-is |
| `once(fn)` | Execute only once |

### Async

| Function | Description |
|----------|-------------|
| `parallel(promises)` | Promise.all |
| `race(promises)` | Promise.race |
| `timeout(promise, ms)` | Reject if exceeds ms |
| `retry(fn, opts)` | Exponential backoff |
| `sleep(ms)` | Async delay |

See [Standard Library](/stdlib/) for the complete API reference.

---

## Comparison with Python/Pandas

| Task | Python/Pandas | Tova |
|------|--------------|------|
| Load CSV | `pd.read_csv("f.csv")` | `read("f.csv")` |
| Filter rows | `df[df['age'] > 25]` | `t \|> where(.age > 25)` |
| Select columns | `df[['name', 'age']]` | `t \|> select(.name, .age)` |
| Add column | `df['total'] = df['qty'] * df['price']` | `t \|> derive(.total = .qty * .price)` |
| Group + agg | `df.groupby('region').agg(...)` | `t \|> groupBy(.region) \|> agg(...)` |
| Sort | `df.sort_values('score', ascending=False)` | `t \|> sortBy(.score, desc: true)` |
| Join | `pd.merge(a, b, on='id')` | `a \|> join(b, left: .id, right: .id)` |
| Pivot | `df.pivot_table(...)` | `t \|> pivot(index: .date, columns: .cat, values: .amt)` |
| Handle nulls | `df.dropna(subset=['email'])` | `t \|> dropNil(.email)` |
| Fill nulls | `df['col'].fillna(0)` | `t \|> fillNil(.col, 0)` |
| Deduplicate | `df.dropDuplicates(subset=['id'])` | `t \|> dropDuplicates(by: .id)` |
| Describe | `df.describe()` | `t \|> describe()` |
| Error handling | `try/except` (silent failures) | `Result` with `?` (enforced) |
| Deploy as API | Flask + CORS + gunicorn + Docker | `server { }` block |
| Deploy dashboard | Flask + React + build pipeline | `browser { }` block |
| Make CLI tool | argparse + setup.py | `cli { }` block |
| Auth/security | Passport/JWT library + config | `security { }` block |
| Edge deploy | Not practical | `edge { }` block |

The key difference is not any single operation — it's that Tova **eliminates the boundary between analysis and deployment**. The same pipeline expressions used in exploration become the API's data source, the dashboard's content, and the CLI tool's logic.

---

## Where to Go Next

- **[Tables & Data](./data)** — Complete table operations reference with column expressions
- **[Data Engineering](../architecture/data-engineering)** — Pipeline architecture, validation, streaming patterns
- **[ETL Pipeline Example](../examples/etl-pipeline)** — Complete standalone ETL application
- **[Data Dashboard Example](../examples/data-dashboard)** — Full-stack data dashboard
- **[Performance](./performance)** — Benchmark suite, @fast, @wasm, parallel_map details
- **[Pipes](./pipes)** — Pipe operator deep dive with patterns
- **[Error Handling](./error-handling)** — Result, Option, and the `?` operator
- **[Standard Library](/stdlib/)** — Complete API reference
- **[CLI Block](../fullstack/cli-block)** — Building command-line data tools
- **[Edge Block](../fullstack/edge-block)** — Deploying to edge platforms
- **[From Python](./from-python)** — Side-by-side Python to Tova translation
