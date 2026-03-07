# Tables & Data

Tova has first-class support for tabular data through the `Table<T>` type. Tables are thin wrappers around arrays of structs, and your `type` declaration serves as the schema. Combined with the `.column` expression syntax and the pipe operator, Tova gives you a concise, type-safe way to query, transform, and analyze data without leaving the language.

## Creating Tables

A Table is an ordered collection of rows. You can create one from an array of objects or by reading a file with [`read()`](./io):

```tova
// From an array of objects
users = Table([
  { name: "Alice", age: 30, city: "NYC" },
  { name: "Bob", age: 25, city: "LA" },
  { name: "Carol", age: 35, city: "NYC" }
])

// From a file (format inferred from extension)
sales = read("sales.csv")

// Parquet and Excel files
analytics = read("analytics.parquet")
report = read("quarterly.xlsx")
report = read("quarterly.xlsx", sheet: "Q4 Sales")

// With a type annotation for compile-time column validation
type User {
  name: String
  email: String
  age: Int
}

users: Table<User> = read("users.csv")
```

### Table Properties

Every Table exposes metadata about its shape:

```tova
users.rows       // 3 (row count)
users.columns    // ["name", "age", "city"]
users.shape      // [3, 3] — [rows, columns]
```

### Accessing Rows

```tova
first = users.at(0)        // { name: "Alice", age: 30, city: "NYC" }
last = users.at(-1)         // last row
page = users.slice(10, 20)  // Table with rows 10-19
```

### Accessing Columns

```tova
names = users.getColumn("name")  // ["Alice", "Bob", "Carol"]
```

## Column Expressions

The `.column` syntax is the core innovation for table operations. Inside a table function, `.age` compiles to `(row) => row.age`. This means you write expressions that look like direct column references, and the compiler handles the lambda wrapping.

```tova
// .age > 25 compiles to (row) => row.age > 25
users |> where(.age > 25)

// Without column expressions, you'd write:
users |> where(fn(r) r.age > 25)
```

Column expressions work with all Tova features:

```tova
// Pipes on columns
users |> derive(.name_upper = .name |> upper() |> trim())

// Pattern matching on columns
users |> derive(.tier = match .spend {
  0.0..100.0 => "bronze"
  100.0..1000.0 => "silver"
  _ => "gold"
})

// String interpolation
users |> derive(.greeting = "Hello, {.name} from {.city}!")

// If-expressions
users |> derive(.label = if .active { "active" } else { "inactive" })
```

### Negated Columns

Prefix a column with `-` to exclude it from selection:

```tova
// Select all columns EXCEPT password
users |> select(-.password)

// Exclude multiple columns
users |> select(-.password, -.secret)
```

### Column Assignments

Inside `derive()`, use `.column = expression` to create or replace columns:

```tova
users |> derive(
  .full_name = "{.first} {.last}",
  .is_adult = .age >= 18,
  .domain = .email |> split("@") |> last()
)
```

## Table Operations

All table operations are pipe-friendly. They take a table as the first argument and return a new table.

### Filtering with `where`

Keep rows that satisfy a predicate:

```tova
adults = users |> where(.age >= 18)
active = users |> where(.active and .email |> contains("@"))
```

### Selecting Columns with `select`

Pick specific columns to keep:

```tova
names_and_emails = users |> select(.name, .email)
```

Exclude columns with the `-` prefix:

```tova
safe = users |> select(-.password, -.ssn)
```

### Adding Columns with `derive`

Create new columns or transform existing ones:

```tova
enriched = users |> derive(
  .name_upper = .name |> upper(),
  .age_group = if .age < 30 { "young" } else { "senior" }
)
```

### Grouping with `group_by`

Group rows by one or more columns:

```tova
by_city = users |> group_by(.city)
```

### Aggregating with `agg`

Compute summary statistics after grouping:

```tova
summary = users
  |> group_by(.city)
  |> agg(
    count: count(),
    avg_age: mean(.age),
    total_spend: sum(.spend)
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

### Sorting with `sort_by`

```tova
sorted = users |> sort_by(.name)
ranked = users |> sort_by(.score, desc: true)
```

### Limiting with `limit`

```tova
top_10 = users |> sort_by(.score, desc: true) |> limit(10)
```

### Joining Tables

Combine two tables on matching columns:

```tova
result = orders |> join(products, left: .product_id, right: .id)
```

Join types:

```tova
// Inner join (default) — only matching rows
orders |> join(products, left: .pid, right: .id)

// Left join — all left rows, nil for unmatched right columns
orders |> join(products, left: .pid, right: .id, how: "left")

// Right join — all right rows, nil for unmatched left columns
orders |> join(products, left: .pid, right: .id, how: "right")

// Outer join — all rows from both tables
orders |> join(products, left: .pid, right: .id, how: "outer")

// Cross join — every combination (no keys needed)
sizes |> join(colors, how: "cross")

// Anti join — left rows with NO match in right (left columns only)
orders |> join(products, left: .pid, right: .id, how: "anti")

// Semi join — left rows WITH a match in right (left columns only, no duplicates)
orders |> join(products, left: .pid, right: .id, how: "semi")
```

### Reshaping

```tova
// Pivot: long to wide
wide = data |> pivot(index: .date, columns: .category, values: .amount)

// Unpivot: wide to long
long = data |> unpivot(id: "name", columns: ["q1", "q2", "q3"])

// Explode: unnest arrays into rows
flat = data |> explode(.tags)
```

### Combining Tables

```tova
combined = table_a |> union(table_b)
```

### Sampling

Draw random subsets from a table:

```tova
// Random sample of 100 rows
subset = users |> sample(100)

// 10% sample
subset = users |> sample(0.1)

// Reproducible with a seed
subset = users |> sample(1000, seed: 42)

// Stratified sample: N rows per group
subset = users |> stratified_sample(.region, 50)
subset = users |> stratified_sample(.region, 0.1, seed: 42)
```

### Visualization

Generate SVG charts from table data:

```tova
// Bar chart
sales |> bar_chart(x: .region, y: .revenue, title: "Revenue by Region")

// Line chart (supports multi-series)
prices |> line_chart(x: .date, y: .price, title: "Price History")

// Scatter plot
users |> scatter_chart(x: .age, y: .income, title: "Age vs Income")

// Histogram
users |> histogram(col: .age, bins: 20, title: "Age Distribution")

// Pie chart
sales |> pie_chart(label: .category, value: .revenue, title: "Revenue Split")

// Heatmap
data |> heatmap(x: .month, y: .product, value: .sales, title: "Sales Heatmap")

// Save to file
sales |> bar_chart(x: .region, y: .revenue) |> write_text("chart.svg")
```

All chart functions return SVG strings. Default size is 600x400 via viewBox (responsive). Customize with `width`, `height`, `color`, and `labels` options.

### Deduplication

```tova
unique = users |> drop_duplicates(by: .email)
```

### Renaming Columns

```tova
renamed = users |> rename("email", "email_address")
```

## Window Functions

Window functions compute values across partitions of rows **without collapsing them** — unlike `group_by` + `agg`, which reduces rows, `window()` adds new columns while keeping every original row.

```tova
employees
  |> window(
    partition_by: .department,
    order_by: .salary,
    row_num: row_number(),
    rnk: rank(),
    running_total: running_sum(.salary)
  )
```

### How It Works

- `partition_by` divides rows into groups (like `group_by`, but rows aren't collapsed)
- `order_by` sorts rows within each partition
- All other named arguments define new columns using window functions
- The result is a new Table with all original columns plus the new window columns

Both `partition_by` and `order_by` are optional. Without `partition_by`, the entire table is one partition. Without `order_by`, rows retain their original order within each partition.

### Ranking Functions

```tova
ranked = employees |> window(
  partition_by: .dept,
  order_by: .salary,
  row_num: row_number(),        // 1, 2, 3, 4, ...
  rnk: rank(),                  // 1, 2, 2, 4  (gaps on ties)
  dense_rnk: dense_rank(),      // 1, 2, 2, 3  (no gaps)
  pct: percent_rank(),          // 0.0 to 1.0
  quartile: ntile(4)            // divide into 4 buckets
)
```

### Offset Functions

Access values from other rows within the same partition:

```tova
with_context = sales |> window(
  partition_by: .product,
  order_by: .date,
  prev_revenue: lag(.revenue),              // previous row's value
  next_revenue: lead(.revenue),             // next row's value
  prev_2: lag(.revenue, 2, 0),              // 2 rows back, default 0
  first_rev: first_value(.revenue),         // first in partition
  last_rev: last_value(.revenue)            // last in partition
)
```

### Running Aggregates

Cumulative computations that grow as you move through the partition:

```tova
cumulative = transactions |> window(
  partition_by: .account,
  order_by: .date,
  total: running_sum(.amount),
  n: running_count(),
  avg: running_avg(.amount),
  low: running_min(.amount),
  high: running_max(.amount)
)
```

### Moving Average

Compute averages over a sliding window of the last N rows:

```tova
smoothed = prices |> window(
  order_by: .date,
  ma_7: moving_avg(.price, 7),     // 7-period moving average
  ma_30: moving_avg(.price, 30)    // 30-period moving average
)
```

### Descending Order

Use `desc: true` to reverse the sort order within partitions:

```tova
top_ranked = employees |> window(
  partition_by: .dept,
  order_by: .salary,
  desc: true,
  salary_rank: row_number()   // highest salary = rank 1
)
```

### Available Window Functions

| Function | Args | Description |
|----------|------|-------------|
| `row_number()` | — | Sequential number in partition (1, 2, 3, ...) |
| `rank()` | — | Rank with gaps for ties (1, 2, 2, 4) |
| `dense_rank()` | — | Rank without gaps (1, 2, 2, 3) |
| `percent_rank()` | — | Relative rank as fraction (0.0 to 1.0) |
| `ntile(n)` | bucket count | Divide into n equal-sized buckets |
| `lag(.col, offset?, default?)` | column, offset=1, default=nil | Value from a previous row |
| `lead(.col, offset?, default?)` | column, offset=1, default=nil | Value from a following row |
| `first_value(.col)` | column | First value in the partition |
| `last_value(.col)` | column | Last value in the partition |
| `running_sum(.col)` | column | Cumulative sum |
| `running_count()` | — | Cumulative count |
| `running_avg(.col)` | column | Cumulative average |
| `running_min(.col)` | column | Running minimum |
| `running_max(.col)` | column | Running maximum |
| `moving_avg(.col, n)` | column, window size | Moving average over last n rows |

## Data Cleaning

Tova provides built-in functions for common cleaning tasks:

### Handling Missing Values

```tova
// Drop rows where a column is nil
clean = users |> drop_nil(.email)

// Fill nil values with a default
filled = users |> fill_nil(.city, "Unknown")
```

### Type Casting

```tova
// Cast a column to a different type
typed = data |> cast(.age, "Int")
typed = data |> cast(.price, "Float")
typed = data |> cast(.active, "Bool")
typed = data |> cast(.name, "String")
```

## Data Exploration

### `peek()`

Insert `peek()` anywhere in a pipeline to print a preview of the data at that point. It returns the data unchanged, so it does not break the chain:

```tova
result = sales
  |> peek()                         // shows first 10 rows
  |> where(.amount > 100)
  |> peek(title: "After filter")    // labeled preview
  |> sort_by(.amount, desc: true)
```

`peek()` is the data practitioner's best friend. Drop it into any pipeline stage to see what the data looks like without interrupting the flow.

### `describe()`

Get statistical summaries per column:

```tova
sales |> describe()
// Column │ Type  │ Non-Null │ Mean  │ Min │ Max
// amount │ Float │ 4982     │ 245.3 │ 0.5 │ 9999.0
```

### `schema_of()`

Inspect column names and types:

```tova
sales |> schema_of()
// Schema:
//   date: String
//   region: String
//   amount: Float
```

## Operation Reference

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
| `join` | `\|> join(other, left: .id, right: .uid, how: "left")` | Join tables (inner/left/right/outer/cross/anti/semi) |
| `pivot` | `\|> pivot(index: .date, columns: .cat, values: .amt)` | Long to wide |
| `unpivot` | `\|> unpivot(id: "name", columns: ["q1", "q2"])` | Wide to long |
| `explode` | `\|> explode(.tags)` | Unnest arrays |
| `union` | `\|> union(other_table)` | Combine tables |
| `drop_duplicates` | `\|> drop_duplicates(by: .email)` | Remove dupes |
| `drop_nil` | `\|> drop_nil(.email)` | Remove rows with nil |
| `fill_nil` | `\|> fill_nil(.city, "Unknown")` | Replace nil values |
| `cast` | `\|> cast(.age, "Int")` | Convert column type |
| `rename` | `\|> rename("old", "new")` | Rename a column |
| `window` | `\|> window(partition_by: .col, row_num: row_number())` | Window functions |
| `sample` | `\|> sample(100, seed: 42)` | Random sample |
| `stratified_sample` | `\|> stratified_sample(.col, 50)` | Stratified sample |
| `bar_chart` | `\|> bar_chart(x: .col, y: .val)` | SVG bar chart |
| `line_chart` | `\|> line_chart(x: .col, y: .val)` | SVG line chart |
| `scatter_chart` | `\|> scatter_chart(x: .col, y: .val)` | SVG scatter plot |
| `histogram` | `\|> histogram(col: .col, bins: 20)` | SVG histogram |
| `pie_chart` | `\|> pie_chart(label: .col, value: .val)` | SVG pie chart |
| `heatmap` | `\|> heatmap(x: .col, y: .col, value: .val)` | SVG heatmap |
| `peek` | `\|> peek()` | Preview data (transparent) |
| `describe` | `\|> describe()` | Statistical summary |
| `schema_of` | `\|> schema_of()` | Column types |

## Practical Tips

**Use type annotations for schema validation.** When you annotate a table with `Table<User>`, the compiler validates that column references like `.name` actually exist on the `User` type.

**Chain operations with pipes.** Every table operation takes a table as the first argument and returns a new table. This makes them naturally composable with `|>`:

```tova
result = raw_data
  |> drop_nil(.email)
  |> fill_nil(.spend, 0.0)
  |> where(.spend > 0)
  |> group_by(.country)
  |> agg(total: sum(.spend), count: count())
  |> sort_by(.total, desc: true)
  |> limit(20)
```

**Use `peek()` for debugging.** Instead of breaking your pipeline to inspect intermediate results, insert `peek()` at any point. It prints a preview and passes the data through unchanged.

**Tables are immutable.** Every operation returns a new Table, leaving the original unchanged. This matches Tova's immutable-by-default philosophy and makes pipelines safe to compose.
