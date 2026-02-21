# Data Engineering with Tova

A reference guide for building data pipelines in Tova. Covers the Table data model, column expressions, pipeline design, I/O patterns, data cleaning, aggregation, AI enrichment, joining, validation, and migrating scripts into full-stack applications.

## Table Deep Dive

### Storage Model

Tables are Tova's primary data structure for tabular data. A Table is a collection of typed, named columns stored in columnar format.

```tova
// From a literal array
table = Table([
  { name: "Alice", age: 30, active: true },
  { name: "Bob", age: 25, active: false }
])

// From a file
table = read("data.csv")

// From a URL
table = read("https://api.example.com/data.json")

// From a database query
table = read(db, "SELECT * FROM users")
```

### Properties

```tova
table.rows       // Number of rows (Int)
table.columns    // Column names ([String])
table.shape      // (rows, columns) tuple
```

### Immutability

Every table operation returns a new table. The original is never modified:

```tova
original = read("data.csv")
cleaned = original |> drop_nil(.id)    // New table — original unchanged
sorted = cleaned |> sort_by(.name)     // New table — cleaned unchanged
```

This makes pipelines safe and composable: you can branch from any intermediate step.

### Performance Characteristics

- **Column-oriented:** Aggregations over single columns are fast
- **Lazy evaluation:** Pipeline steps are chained and evaluated together
- **Cached in data blocks:** Named pipelines compute once, then cache
- **Immutable:** No in-place mutation, but internal sharing of unchanged columns

## Column Expressions

### How `.column` Works

Column expressions use dot-prefixed names to reference columns:

```tova
table |> where(.age > 30)
table |> select(.name, .email)
table |> sort_by(.created_at, desc: true)
```

Inside `derive()`, `where()`, `agg()`, and other table operations, `.column_name` compiles to a row-level accessor function. The expression `.age > 30` becomes `fn(row) row.age > 30`.

### Complex Expressions

Column expressions support full Tova operations:

```tova
// String operations on columns
table |> derive(.name = .name |> trim() |> upper())
table |> where(.email |> lower() |> contains("@gmail"))

// Arithmetic
table |> derive(.total = .quantity * .price)
table |> derive(.margin = (.price - .cost) / .price * 100.0)

// Conditional
table |> derive(.tier = match .spend {
  s if s > 1000 => "premium"
  s if s > 100 => "standard"
  _ => "basic"
})

// Combining columns
table |> derive(.full_name = "{.first_name} {.last_name}")
table |> where(.start_date <= Date.now() and .end_date >= Date.now())
```

### Column References Across Operations

After a `join()`, columns from both tables are available:

```tova
orders |> join(products, on: .product_id)
  |> derive(.total = .quantity * .price)  // .quantity from orders, .price from products
```

After `rename()`, use the new name:

```tova
table |> rename(.old_name, .new_name)
  |> where(.new_name > 0)  // Use .new_name, not .old_name
```

## Pipeline Design

### Layering

Structure pipelines in layers, each with a single responsibility:

```
Raw → Clean → Transform → Aggregate → Enrich
```

```tova
data {
  // Layer 1: Raw input
  source raw = read("orders.csv")

  // Layer 2: Clean
  pipeline clean = raw
    |> drop_nil(.customer_id)
    |> drop_duplicates(.order_id)
    |> cast(.price, Float)
    |> derive(.status = .status |> upper() |> trim())

  // Layer 3: Transform
  pipeline with_totals = clean
    |> derive(.total = .quantity * .price)
    |> where(.total > 0)

  // Layer 4: Aggregate
  pipeline summary = with_totals
    |> group_by(.category)
    |> agg(
      orders: count(),
      revenue: sum(.total),
      avg_order: mean(.total)
    )

  // Layer 5: Enrich
  pipeline enriched = with_totals
    |> derive(.segment = fast.classify("Order: ${.total}", ["small", "medium", "large"]))
}
```

### Composability

Since each pipeline is named, server functions can reference any layer:

```tova
server {
  fn get_all_orders() { with_totals }
  fn get_summary() { summary }
  fn get_enriched() { enriched }
  fn search(q: String) { with_totals |> where(.name |> contains(q)) }
}
```

### Branching

Multiple pipelines can branch from the same source:

```tova
data {
  source raw = read("data.csv")
  pipeline clean = raw |> drop_nil(.id)

  // Branch 1: Aggregate by region
  pipeline by_region = clean |> group_by(.region) |> agg(total: sum(.sales))

  // Branch 2: Aggregate by product
  pipeline by_product = clean |> group_by(.product) |> agg(total: sum(.sales))

  // Branch 3: AI enrichment
  pipeline labeled = clean |> derive(.label = fast.classify(...))
}
```

## I/O Patterns

### Reading

```tova
// Auto-detect format from extension
read("data.csv")        // CSV → Table
read("data.json")       // JSON array → Table
read("data.jsonl")      // JSON Lines → Table
read("data.tsv")        // TSV → Table

// From URL
read("https://api.example.com/data.json")

// From database
read(db, "SELECT * FROM users WHERE active = true")

// With options
read("data.csv", delimiter: ";", headers: false)
```

### Writing

```tova
// Auto-detect format from extension
write(table, "output.csv")
write(table, "output.json")
write(table, "output.jsonl")

// Append mode
write(table, "log.jsonl", append: true)
```

### Streaming

For files too large to fit in memory:

```tova
stream("huge_file.csv", batch: 10000)
  |> each(fn(batch) {
    processed = batch
      |> drop_nil(.id)
      |> where(.active == true)
      |> derive(.total = .quantity * .price)
    write(processed, "output.csv", append: true)
  })
```

### Batch Size Guidelines

| Row Size | Recommended Batch |
|----------|------------------|
| < 100 bytes | 50,000–100,000 |
| 100–1,000 bytes | 10,000–50,000 |
| > 1,000 bytes | 1,000–10,000 |

## Data Cleaning Cookbook

### Deduplication

```tova
// Remove duplicate rows based on a key column
table |> drop_duplicates(.id)

// Keep first occurrence (default)
table |> drop_duplicates(.email)
```

### Nil Handling

```tova
// Remove rows where column is nil
table |> drop_nil(.email)

// Fill nil with a default value
table |> fill_nil(.country, "Unknown")
table |> fill_nil(.score, 0.0)
```

### Type Casting

```tova
table |> cast(.price, Float)
table |> cast(.quantity, Int)
table |> cast(.active, Bool)
table |> cast(.created_at, String)
```

### String Normalization

```tova
table |> derive(
  .name = .name |> trim(),
  .email = .email |> lower() |> trim(),
  .category = .category |> upper() |> trim(),
  .slug = .name |> lower() |> replace(" ", "-")
)
```

### Filtering

```tova
table |> where(.age >= 18)
table |> where(.status == "active")
table |> where(.name |> contains("alice"))
table |> where(.score > 0 and .verified == true)
```

### Renaming Columns

```tova
table |> rename(.old_name, .new_name)
table |> rename(.unit_cost, .cost)
```

## Aggregation

### group_by + agg Combinations

```tova
// Single grouping
table |> group_by(.category) |> agg(count: count())

// Multiple aggregations
table |> group_by(.region) |> agg(
  total: sum(.revenue),
  average: mean(.revenue),
  mid: median(.revenue),
  highest: max(.revenue),
  lowest: min(.revenue),
  items: count()
)

// Multiple group keys
table |> group_by(.region, .category) |> agg(
  revenue: sum(.sales),
  orders: count()
)
```

### Available Aggregation Functions

| Function | Description |
|----------|-------------|
| `count()` | Number of rows in group |
| `sum(.col)` | Sum of column values |
| `mean(.col)` | Average of column values |
| `median(.col)` | Median of column values |
| `min(.col)` | Minimum value |
| `max(.col)` | Maximum value |

### Pivot and Unpivot

```tova
// Long → Wide: one column per category
table
  |> group_by(.month, .category)
  |> agg(revenue: sum(.sales))
  |> pivot(index: .month, columns: .category, values: .revenue)

// Wide → Long: collapse columns back to rows
wide_table |> unpivot(index: .month, name: "category", value: "revenue")
```

### Multi-Level Aggregation

```tova
// First level: by region and category
level1 = table
  |> group_by(.region, .category)
  |> agg(revenue: sum(.sales))

// Second level: by region only (roll up categories)
level2 = level1
  |> group_by(.region)
  |> agg(
    total_revenue: sum(.revenue),
    categories: count()
  )
```

## AI Enrichment at Scale

### Batching

AI calls in `derive()` run once per row. For large tables, this can be expensive. Use pipeline layering to control which rows get enriched:

```tova
data {
  pipeline base = raw |> drop_nil(.id) |> where(.needs_review == true)

  // Only enrich rows that need it (not the full dataset)
  pipeline enriched = base
    |> limit(100)  // Cap per refresh cycle
    |> derive(.category = fast.classify(...))
}
```

### Cost Management

| Strategy | Approach |
|----------|----------|
| Use fast model | `fast.classify()` instead of `smart.classify()` |
| Limit rows | `|> limit(n)` before enrichment |
| Filter first | `|> where(.needs_enrichment == true)` |
| Refresh less often | `refresh every 6.hours` instead of every 10 minutes |
| Cache in data block | Pipeline results are cached automatically |

### Caching

Data block pipelines are cached. The enrichment pipeline re-runs only when:
- The source `refresh` fires
- The application restarts

Between refreshes, server functions reading `enriched` get the cached result.

## Joining and Combining

### Join Types

```tova
// Inner join (default): only matching rows
orders |> join(products, on: .product_id)

// Left join: all rows from left, matching from right
orders |> join(products, on: .product_id, type: "left")
```

### Key Functions

When column names differ between tables:

```tova
orders |> join(products, left: .prod_id, right: .product_id)
```

### Union

Combine two tables with the same schema:

```tova
all_data = table_a |> union(table_b)
```

### Schema Mismatches

When joining tables with different schemas, only columns present in both tables are available after the join. Use `select()` or `derive()` to normalize:

```tova
// Normalize before joining
normalized_a = table_a |> select(.id, .name, .value)
normalized_b = table_b |> select(.id, .name, .value)
combined = normalized_a |> union(normalized_b)
```

## Validation Architecture

### Validate Blocks

Define data quality rules in the data block:

```tova
data {
  validate Customer {
    .email |> contains("@"),
    .name |> len() > 0,
    .age >= 0,
    .age < 150
  }
}
```

Validation runs when data is loaded. Invalid rows are flagged but not removed by default.

### Refinement Types

For domain-level constraints:

```tova
shared {
  type Email = String where {
    it |> contains("@"),
    it |> contains(".")
  }

  type PositiveFloat = Float where { it > 0.0 }
}
```

Refinement types are checked at construction time and enforce constraints at the type level.

### Combining Validation Approaches

```tova
shared {
  type Email = String where { it |> contains("@") }
  fn validate_order_total(total: Float) -> Result<Float, String> {
    guard total > 0 else { return Err("Total must be positive") }
    Ok(total)
  }
}

data {
  validate Order {
    .email |> contains("@"),
    .total > 0
  }
}

server {
  fn create_order(email: String, total: Float) -> Result<Order, String> {
    guard email |> contains("@") else { return Err("Invalid email") }
    validated_total = validate_order_total(total)?
    // ...
  }
}
```

Three layers of validation:
1. **Refinement types** catch invalid data at construction
2. **Validate blocks** catch invalid data in pipelines
3. **Guard clauses** catch invalid data in API endpoints

## Script to Server

### Standalone Script

Start with a standalone data script:

```tova
raw = read("sales.csv")
clean = raw |> drop_nil(.id) |> cast(.amount, Float)
summary = clean |> group_by(.region) |> agg(total: sum(.amount))
write(summary, "report.json")
print("Done!")
```

### Add a Data Block

Wrap pipelines in a data block for caching and refresh:

```tova
data {
  source raw = read("sales.csv")
  pipeline clean = raw |> drop_nil(.id) |> cast(.amount, Float)
  pipeline summary = clean |> group_by(.region) |> agg(total: sum(.amount))
  refresh raw every 1.hour
}
```

### Add a Server

Expose pipelines via API:

```tova
server {
  fn get_summary() { summary }
  fn get_details(region: String) { clean |> where(.region == region) }
  route GET "/api/summary" => get_summary
  route GET "/api/details/:region" => get_details
}
```

### Add a Client

Build a dashboard:

```tova
client {
  state data = []
  effect { data = server.get_summary() }

  component App {
    <div>
      {for row in data {
        <div>"{row.region}: ${row.total}"</div>
      }}
    </div>
  }
}
```

### Add Shared Types

Formalize the data contract:

```tova
shared {
  type Sale { id: Int, region: String, amount: Float }
  type RegionSummary { region: String, total: Float }
}
```

The progression is: **script → data block → server → client → shared types**. Each step adds structure without rewriting the previous work.
