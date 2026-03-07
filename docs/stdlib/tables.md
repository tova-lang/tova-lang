# Tables

The `Table` class provides a tabular data structure for structured data processing. Tables are the primary data type returned by `read()` when loading CSV, JSON arrays, and other tabular formats.

For reading and writing table data, see the [I/O guide](../guide/io.md). For data pipelines and the `data {}` block, see [Tables & Data](../guide/data.md).

::: warning Partial Implementation
Table query methods (`.where()`, `.select()`, `.derive()`, `.sort_by()`, `.group_by()`, `.join()`, etc.) are not yet available as instance methods. Use the standalone collection functions (`filter`, `sorted`, `map`) on `t.rows` as an alternative.
:::

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
t.rows -> Int
```

The number of rows in the table.

### length

```tova
t.length -> Int
```

Alias for `rows`. The number of rows in the table.

### columns

```tova
t.columns -> [String]
```

The column names in order.

### shape

```tova
t.shape -> [Int, Int]
```

Returns `[row_count, column_count]`.

```tova
t.shape    // [3, 3]
```

---

## Access

### toArray

```tova
t.toArray() -> [Object]
```

Returns the underlying rows as an array of objects.

### at

```tova
t.at(index) -> Object | Nil
```

Returns the row at the given index. Supports negative indices.

```tova
first = t.at(0)     // first row
last = t.at(-1)     // last row
```

### slice

```tova
t.slice(start, end) -> Table
```

Returns a new table with rows from `start` to `end`.

### getColumn

```tova
t.getColumn(name) -> [Any]
```

Returns all values of a column as an array.

```tova
names = t.getColumn("name")   // ["Alice", "Bob", "Carol"]
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

Aggregates grouped data. Inside `agg()`, use these aggregation functions (the compiler automatically transforms them to their `agg_*` runtime equivalents):

| Function | Description |
|----------|-------------|
| `sum(.column)` | Sum of column values |
| `count()` | Number of rows in each group |
| `mean(.column)` | Mean (average) of column values |
| `median(.column)` | Median of column values |
| `min(.column)` | Minimum column value |
| `max(.column)` | Maximum column value |

```tova
summary = t
  |> group_by(.city)
  |> agg(
    count: count(),
    avg_age: mean(.age),
    oldest: max(.age)
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
- `left` / `right` -- column names or accessors to join on
- `how` -- join type: `"inner"` (default), `"left"`

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

// Inner join (default)
result = users |> join(orders, left: "id", right: "user_id")

// Left join — keeps all rows from the left table
left_result = users |> join(orders, left: "id", right: "user_id", how: "left")
```

---

## Reshaping

### pivot

```tova
t |> pivot(index: column, columns: column, values: column) -> Table
```

Pivots rows into columns. Takes named arguments `index`, `columns`, and `values`.

```tova
sales = Table([
  { region: "East", quarter: "Q1", revenue: 100 },
  { region: "East", quarter: "Q2", revenue: 150 },
  { region: "West", quarter: "Q1", revenue: 200 }
])

sales |> pivot(index: "region", columns: "quarter", values: "revenue")
// { _index: "East", Q1: 100, Q2: 150 }
// { _index: "West", Q1: 200, Q2: nil }
```

Note: The index column is renamed to `_index` in the output.

### unpivot

```tova
t |> unpivot(id: column, columns: [String]) -> Table
```

Converts columns into rows (the inverse of pivot). Takes named arguments `id` (the identifier column) and `columns` (column names to unpivot). Returns a table with `id`, `variable`, and `value` columns.

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
t |> drop_duplicates(by?: column) -> Table
```

Removes duplicate rows. Optionally specify a column to check for uniqueness via the `by` option. Without `by`, compares entire rows.

```tova
t |> drop_duplicates()
t |> drop_duplicates(by: .email)
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
t |> drop_nil(column) -> Table
```

Removes rows where the specified column is `nil`.

```tova
t |> drop_nil(.email)
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
t |> peek(n?: Int, title?: String) -> Table
```

Prints a preview of the table and returns it (passthrough for pipelines). Shows the first `n` rows (default 10).

```tova
data |> peek()
data |> peek(n: 5, title: "Sample data")
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

## Window Functions

### window

```tova
t |> window(partition_by?: column, order_by?: column, desc?: Bool, ...fns) -> Table
```

Computes values across partitions of rows without collapsing them. Returns a new Table with all original columns plus new window columns.

Options:
- `partition_by` -- column to partition rows by (optional; without it, entire table is one partition)
- `order_by` -- column to sort rows within each partition (optional)
- `desc` -- sort descending within partitions (default `false`)

All other named arguments define new columns using window functions.

```tova
result = employees |> window(
  partition_by: .dept,
  order_by: .salary,
  rn: row_number(),
  rnk: rank(),
  prev_salary: lag(.salary, 1),
  running_total: running_sum(.salary)
)
```

#### Ranking Functions

| Function | Description |
|----------|-------------|
| `row_number()` | Sequential number in partition (1, 2, 3, ...) |
| `rank()` | Rank with gaps for ties (1, 2, 2, 4) |
| `dense_rank()` | Rank without gaps (1, 2, 2, 3) |
| `percent_rank()` | Relative rank as fraction (0.0 to 1.0) |
| `ntile(n)` | Divide into n equal-sized buckets |

#### Offset Functions

| Function | Description |
|----------|-------------|
| `lag(.col, offset?, default?)` | Value from a previous row (default offset=1) |
| `lead(.col, offset?, default?)` | Value from a following row (default offset=1) |
| `first_value(.col)` | First value in the partition |
| `last_value(.col)` | Last value in the partition |

#### Running Aggregates

| Function | Description |
|----------|-------------|
| `running_sum(.col)` | Cumulative sum |
| `running_count()` | Cumulative count |
| `running_avg(.col)` | Cumulative average |
| `running_min(.col)` | Running minimum |
| `running_max(.col)` | Running maximum |
| `moving_avg(.col, n)` | Moving average over last n rows |

```tova
// Ranking within departments
employees |> window(
  partition_by: .dept,
  order_by: .salary,
  desc: true,
  salary_rank: row_number()
)

// Running totals and moving averages
sales |> window(
  order_by: .date,
  cumulative: running_sum(.revenue),
  trend: moving_avg(.revenue, 7)
)

// Previous/next row comparison
prices |> window(
  order_by: .date,
  prev_price: lag(.price),
  next_price: lead(.price)
)
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
    total: sum(.amount),
    count: count(),
    avg: mean(.amount)
  )
  |> sort_by(.total, desc: true)
  |> peek(title: "Revenue by Region")

result |> write("revenue_summary.csv")
```
