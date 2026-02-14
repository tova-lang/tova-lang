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
users.rows       // 3
users.columns    // ["name", "age", "city"]
users.shape      // (3, 3) — (rows, columns)
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

// Left join — all rows from left table
orders |> join(products, left: .pid, right: .id, how: "left")

// Right join — all rows from right table
orders |> join(products, left: .pid, right: .id, how: "right")

// Outer join — all rows from both tables
orders |> join(products, left: .pid, right: .id, how: "outer")
```

### Reshaping

```tova
// Pivot: long to wide
wide = data |> pivot(index: .date, columns: .category, values: .amount)

// Unpivot: wide to long
long = data |> unpivot(id: .name, columns: [.q1, .q2, .q3])

// Explode: unnest arrays into rows
flat = data |> explode(.tags)
```

### Combining Tables

```tova
combined = table_a |> union(table_b)
```

### Deduplication

```tova
unique = users |> drop_duplicates(by: .email)
```

### Renaming Columns

```tova
renamed = users |> rename(.email, "email_address")
```

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

### `schema()`

Inspect column names and types:

```tova
sales |> schema()
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
| `join` | `\|> join(other, left: .id, right: .uid)` | Join tables |
| `pivot` | `\|> pivot(index: .date, columns: .cat, values: .amt)` | Long to wide |
| `unpivot` | `\|> unpivot(id: .name, columns: [.q1, .q2])` | Wide to long |
| `explode` | `\|> explode(.tags)` | Unnest arrays |
| `union` | `\|> union(other_table)` | Combine tables |
| `drop_duplicates` | `\|> drop_duplicates(by: .email)` | Remove dupes |
| `drop_nil` | `\|> drop_nil(.email)` | Remove rows with nil |
| `fill_nil` | `\|> fill_nil(.city, "Unknown")` | Replace nil values |
| `cast` | `\|> cast(.age, "Int")` | Convert column type |
| `rename` | `\|> rename(.old, "new")` | Rename a column |
| `peek` | `\|> peek()` | Preview data (transparent) |
| `describe` | `\|> describe()` | Statistical summary |
| `schema` | `\|> schema()` | Column types |

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
