# Tables

The `Table` class provides a tabular data structure for structured data processing. Tables are the primary data type returned by `read()` when loading CSV, JSON arrays, and other tabular formats.

For reading and writing table data, see the [I/O guide](../guide/io.md). For data pipelines and the `data {}` block, see [Tables & Data](../guide/data.md).

---

## Constructor

### Table

```tova
Table(rows, columns?) -> Table
```

Creates a table from an array of row objects. Optionally specify column names.

```tova
t = Table([
  { name: "Alice", age: 30, city: "NYC" },
  { name: "Bob", age: 25, city: "LA" },
  { name: "Carol", age: 35, city: "NYC" }
])
```

---

## Properties

### rows

```tova
t.rows -> [Object]
```

The underlying array of row objects.

### columns

```tova
t.columns -> [String]
```

The column names in order.

### shape

```tova
t.shape -> (Int, Int)
```

Returns `(row_count, column_count)`.

```tova
t.shape    // (3, 3)
```

---

## Query

### where

```tova
t.where(predicate) -> Table
```

Filters rows matching a predicate. Use `.column` shorthand for column access.

```tova
adults = t.where(.age >= 18)
nyc = t.where(.city == "NYC")
```

### select

```tova
t.select(...columns) -> Table
```

Returns a table with only the specified columns.

```tova
names = t.select("name", "age")
```

### derive

```tova
t.derive(column = expr) -> Table
```

Adds or replaces a column with a computed value.

```tova
t.derive(.name_upper = .name |> upper())
t.derive(.age_group = if .age >= 30 { "senior" } else { "junior" })
```

### sort_by

```tova
t.sort_by(column, desc?) -> Table
```

Sorts the table by a column. Optionally in descending order.

```tova
t.sort_by(.age)
t.sort_by(.age, desc: true)
```

### limit

```tova
t.limit(n) -> Table
```

Returns the first `n` rows.

```tova
top_5 = t.sort_by(.age, desc: true).limit(5)
```

---

## Grouping and Aggregation

### group_by

```tova
t.group_by(column) -> GroupedTable
```

Groups rows by a column value. Must be followed by `agg()`.

```tova
t.group_by(.city)
```

### agg

```tova
grouped.agg(name: agg_fn, ...) -> Table
```

Aggregates grouped data. Available aggregation functions:

| Function | Description |
|----------|-------------|
| `agg_sum(column)` | Sum of column values |
| `agg_count()` | Number of rows in each group |
| `agg_mean(column)` | Mean (average) of column values |
| `agg_median(column)` | Median of column values |
| `agg_min(column)` | Minimum column value |
| `agg_max(column)` | Maximum column value |

```tova
summary = t
  |> group_by(.city)
  |> agg(
    count: agg_count(),
    avg_age: agg_mean(.age),
    oldest: agg_max(.age)
  )
```

---

## Joins

### join

```tova
t.join(other, opts) -> Table
```

Joins two tables on matching columns.

Options:
- `on` -- the column to join on (same name in both tables)
- `left` / `right` -- column names if they differ
- `how` -- join type: `"inner"` (default), `"left"`, `"outer"`

```tova
users = Table([
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" }
])

orders = Table([
  { user_id: 1, amount: 50 },
  { user_id: 1, amount: 30 },
  { user_id: 2, amount: 70 }
])

result = users.join(orders, left: "id", right: "user_id")
// Inner join by default

left_result = users.join(orders, left: "id", right: "user_id", how: "left")
```

---

## Reshaping

### pivot

```tova
t.pivot(index, columns, values) -> Table
```

Pivots rows into columns.

```tova
sales = Table([
  { region: "East", quarter: "Q1", revenue: 100 },
  { region: "East", quarter: "Q2", revenue: 150 },
  { region: "West", quarter: "Q1", revenue: 200 }
])

sales.pivot("region", "quarter", "revenue")
// { region: "East", Q1: 100, Q2: 150 }
// { region: "West", Q1: 200, Q2: nil }
```

### unpivot

```tova
t.unpivot(columns, names) -> Table
```

Converts columns into rows (the inverse of pivot).

### explode

```tova
t.explode(column) -> Table
```

Expands array values in a column into separate rows.

```tova
t = Table([
  { name: "Alice", tags: ["admin", "user"] },
  { name: "Bob", tags: ["user"] }
])

t.explode("tags")
// { name: "Alice", tags: "admin" }
// { name: "Alice", tags: "user" }
// { name: "Bob", tags: "user" }
```

---

## Cleaning

### drop_duplicates

```tova
t.drop_duplicates(columns?) -> Table
```

Removes duplicate rows. Optionally specify columns to check for uniqueness.

```tova
t.drop_duplicates()
t.drop_duplicates(["name", "email"])
```

### rename

```tova
t.rename(old, new) -> Table
```

Renames a column.

```tova
t.rename("name", "full_name")
```

### cast

```tova
t.cast(column, type) -> Table
```

Converts a column to a different type.

```tova
t.cast("age", "Int")
t.cast("price", "Float")
```

### drop_nil

```tova
t.drop_nil(column?) -> Table
```

Removes rows where the specified column is `nil`. If no column is specified, removes rows where any column is `nil`.

```tova
t.drop_nil(.email)
t.drop_nil()
```

### fill_nil

```tova
t.fill_nil(column, value) -> Table
```

Replaces `nil` values in a column with a default value.

```tova
t.fill_nil(.score, 0)
t.fill_nil(.status, "unknown")
```

---

## Inspection

### peek

```tova
t.peek(n?, title?) -> Table
```

Prints a preview of the table and returns it (passthrough for pipelines). Shows the first `n` rows (default 10).

```tova
data |> peek()
data |> peek(5, title: "Sample data")
```

### describe

```tova
t.describe() -> Table
```

Returns summary statistics for numeric columns (count, mean, std, min, max, quartiles).

```tova
t.describe() |> peek()
```

### schema_of

```tova
schema_of(table) -> Object
```

Returns the inferred schema (column names and types) of a table.

```tova
schema_of(users)
// { name: "String", age: "Int", email: "String" }
```

---

## Combination

### union

```tova
union(a, b) -> Table
```

Combines two tables with the same columns, appending all rows.

```tova
all_users = union(active_users, inactive_users)
```

---

## Pipeline Example

```tova
result = read("sales.csv")
  |> drop_nil(.amount)
  |> fill_nil(.region, "Unknown")
  |> where(.amount > 0)
  |> derive(.quarter = date_format(.date, "QQ YYYY"))
  |> group_by(.region)
  |> agg(
    total: agg_sum(.amount),
    count: agg_count(),
    avg: agg_mean(.amount)
  )
  |> sort_by(.total, desc: true)
  |> peek(title: "Revenue by Region")

result |> write("revenue_summary.csv")
```
