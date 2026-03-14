# Data Cleaning

Handle real-world dirty data by deduplicating, filling gaps, casting types, and validating rows in a single pipeline.

## What you'll learn

- Creating in-memory tables with `Table()` for testing
- Removing duplicate rows with `tableDropDuplicates()`
- Dropping rows with nil values using `dropNil()`
- Filling missing values with `fillNil()`
- Casting string columns to typed columns with `cast()`
- Adding validation flags with `tableDerive()`
- Processing records with `Ok`/`Err` and filtering results

## Setup

Make sure you have the `data/employees.csv` file from the [Data Tutorials overview](./) in a `data/` directory alongside your Tova file.

## 1. Creating test data

Real datasets arrive with duplicates, missing fields, and wrong types. To practice cleaning techniques without an external file, build a dirty dataset inline with `Table()`.

```tova
async fn main() {
  dirty_data = Table([
    {name: "Alice", age: "30", revenue: "45000.50", active: "true", email: "alice@co.com"},
    {name: "Bob", age: "25", revenue: "12000", active: "false", email: "bob@co.com"},
    {name: "Alice", age: "30", revenue: "45000.50", active: "true", email: "alice@co.com"},
    {name: "Carol", age: nil, revenue: "8500.75", active: "true", email: nil},
    {name: "David", age: "42", revenue: nil, active: "false", email: "david@co.com"},
    {name: "Eve", age: "35", revenue: "92000", active: "true", email: "eve@co.com"},
    {name: "Frank", age: "28", revenue: "0", active: nil, email: "frank@co.com"},
    {name: "Carol", age: nil, revenue: "8500.75", active: "true", email: nil},
    {name: "Grace", age: "31", revenue: "55000", active: "true", email: "grace@co.com"},
    {name: nil, age: nil, revenue: nil, active: nil, email: nil}
  ])

  peek(dirty_data, {title: "Dirty Data"})
}
```

This dataset has every problem you will encounter in production: duplicate rows (Alice and Carol each appear twice), nil values scattered across columns, every value stored as a string, and one completely empty row. That gives us **10 rows** to start with.

## 2. Deduplication

`tableDropDuplicates()` compares every column in each row and removes exact copies.

```tova
async fn main() {
  dirty_data = Table([
    {name: "Alice", age: "30", revenue: "45000.50", active: "true", email: "alice@co.com"},
    {name: "Bob", age: "25", revenue: "12000", active: "false", email: "bob@co.com"},
    {name: "Alice", age: "30", revenue: "45000.50", active: "true", email: "alice@co.com"},
    {name: "Carol", age: nil, revenue: "8500.75", active: "true", email: nil},
    {name: "David", age: "42", revenue: nil, active: "false", email: "david@co.com"},
    {name: "Eve", age: "35", revenue: "92000", active: "true", email: "eve@co.com"},
    {name: "Frank", age: "28", revenue: "0", active: nil, email: "frank@co.com"},
    {name: "Carol", age: nil, revenue: "8500.75", active: "true", email: nil},
    {name: "Grace", age: "31", revenue: "55000", active: "true", email: "grace@co.com"},
    {name: nil, age: nil, revenue: nil, active: nil, email: nil}
  ])

  deduped = tableDropDuplicates(dirty_data)

  peek(deduped, {title: "After Deduplication"})
}
```

Alice and Carol each had an exact duplicate. Removing them brings the count from **10 rows down to 8**.

## 3. Dropping nil rows

Some rows are too incomplete to salvage. `dropNil()` removes every row where a given column is `nil`.

```tova
async fn main() {
  dirty_data = Table([
    {name: "Alice", age: "30", revenue: "45000.50", active: "true", email: "alice@co.com"},
    {name: "Bob", age: "25", revenue: "12000", active: "false", email: "bob@co.com"},
    {name: "Alice", age: "30", revenue: "45000.50", active: "true", email: "alice@co.com"},
    {name: "Carol", age: nil, revenue: "8500.75", active: "true", email: nil},
    {name: "David", age: "42", revenue: nil, active: "false", email: "david@co.com"},
    {name: "Eve", age: "35", revenue: "92000", active: "true", email: "eve@co.com"},
    {name: "Frank", age: "28", revenue: "0", active: nil, email: "frank@co.com"},
    {name: "Carol", age: nil, revenue: "8500.75", active: "true", email: nil},
    {name: "Grace", age: "31", revenue: "55000", active: "true", email: "grace@co.com"},
    {name: nil, age: nil, revenue: nil, active: nil, email: nil}
  ])

  deduped = tableDropDuplicates(dirty_data)
  named = dropNil(deduped, "name")

  peek(named, {title: "After Dropping Nil Names"})
}
```

The all-nil row had no name, so it is removed. That brings us from **8 rows down to 7**. The remaining rows (Carol, David, Frank) still have nil values in other columns, but their names are intact so we keep them.

## 4. Filling nil values

Rather than dropping rows with partial data, fill in sensible defaults with `fillNil()`. The pipe operator makes it easy to chain multiple fills.

```tova
async fn main() {
  dirty_data = Table([
    {name: "Alice", age: "30", revenue: "45000.50", active: "true", email: "alice@co.com"},
    {name: "Bob", age: "25", revenue: "12000", active: "false", email: "bob@co.com"},
    {name: "Alice", age: "30", revenue: "45000.50", active: "true", email: "alice@co.com"},
    {name: "Carol", age: nil, revenue: "8500.75", active: "true", email: nil},
    {name: "David", age: "42", revenue: nil, active: "false", email: "david@co.com"},
    {name: "Eve", age: "35", revenue: "92000", active: "true", email: "eve@co.com"},
    {name: "Frank", age: "28", revenue: "0", active: nil, email: "frank@co.com"},
    {name: "Carol", age: nil, revenue: "8500.75", active: "true", email: nil},
    {name: "Grace", age: "31", revenue: "55000", active: "true", email: "grace@co.com"},
    {name: nil, age: nil, revenue: nil, active: nil, email: nil}
  ])

  deduped = tableDropDuplicates(dirty_data)
  named = dropNil(deduped, "name")

  filled = named
    |> fillNil("age", "0")
    |> fillNil("revenue", "0")
    |> fillNil("active", "false")
    |> fillNil("email", "unknown@placeholder.com")

  peek(filled, {title: "After Filling Nils"})
}
```

The row count stays at **7 rows** -- no rows are added or removed. Carol now has `age: "0"` and `email: "unknown@placeholder.com"`, David has `revenue: "0"`, and Frank has `active: "false"`. Every cell has a value, which makes the next step possible.

## 5. Type casting

CSV data and inline strings are all text. `cast()` converts a column to the type you specify: `"Int"`, `"Float"`, or `"Bool"`.

```tova
async fn main() {
  dirty_data = Table([
    {name: "Alice", age: "30", revenue: "45000.50", active: "true", email: "alice@co.com"},
    {name: "Bob", age: "25", revenue: "12000", active: "false", email: "bob@co.com"},
    {name: "Alice", age: "30", revenue: "45000.50", active: "true", email: "alice@co.com"},
    {name: "Carol", age: nil, revenue: "8500.75", active: "true", email: nil},
    {name: "David", age: "42", revenue: nil, active: "false", email: "david@co.com"},
    {name: "Eve", age: "35", revenue: "92000", active: "true", email: "eve@co.com"},
    {name: "Frank", age: "28", revenue: "0", active: nil, email: "frank@co.com"},
    {name: "Carol", age: nil, revenue: "8500.75", active: "true", email: nil},
    {name: "Grace", age: "31", revenue: "55000", active: "true", email: "grace@co.com"},
    {name: nil, age: nil, revenue: nil, active: nil, email: nil}
  ])

  deduped = tableDropDuplicates(dirty_data)
  named = dropNil(deduped, "name")

  filled = named
    |> fillNil("age", "0")
    |> fillNil("revenue", "0")
    |> fillNil("active", "false")
    |> fillNil("email", "unknown@placeholder.com")

  typed = filled
    |> cast("age", "Int")
    |> cast("revenue", "Float")
    |> cast("active", "Bool")

  peek(typed, {title: "After Type Casting"})
}
```

Still **7 rows**. The difference is in the values: `age` is now a number you can compare with `>` and `<`, `revenue` is a float for arithmetic, and `active` is a boolean. Without this step, a filter like `r.revenue > 20000` would be comparing strings, not numbers.

## 6. Validation with derive

Once the data is clean and typed, use `tableDerive()` to add boolean flags that mark each row's quality. This keeps the original data intact while making it easy to filter on validity later.

```tova
async fn main() {
  dirty_data = Table([
    {name: "Alice", age: "30", revenue: "45000.50", active: "true", email: "alice@co.com"},
    {name: "Bob", age: "25", revenue: "12000", active: "false", email: "bob@co.com"},
    {name: "Alice", age: "30", revenue: "45000.50", active: "true", email: "alice@co.com"},
    {name: "Carol", age: nil, revenue: "8500.75", active: "true", email: nil},
    {name: "David", age: "42", revenue: nil, active: "false", email: "david@co.com"},
    {name: "Eve", age: "35", revenue: "92000", active: "true", email: "eve@co.com"},
    {name: "Frank", age: "28", revenue: "0", active: nil, email: "frank@co.com"},
    {name: "Carol", age: nil, revenue: "8500.75", active: "true", email: nil},
    {name: "Grace", age: "31", revenue: "55000", active: "true", email: "grace@co.com"},
    {name: nil, age: nil, revenue: nil, active: nil, email: nil}
  ])

  deduped = tableDropDuplicates(dirty_data)
  named = dropNil(deduped, "name")

  filled = named
    |> fillNil("age", "0")
    |> fillNil("revenue", "0")
    |> fillNil("active", "false")
    |> fillNil("email", "unknown@placeholder.com")

  typed = filled
    |> cast("age", "Int")
    |> cast("revenue", "Float")
    |> cast("active", "Bool")

  validated = typed
    |> tableDerive({
      has_email: fn(r) r.email != "unknown@placeholder.com",
      is_high_value: fn(r) r.revenue > 20000,
      age_valid: fn(r) r.age > 0 && r.age < 100,
      all_valid: fn(r) r.email != "unknown@placeholder.com" && r.age > 0 && r.revenue >= 0
    })

  peek(validated, {title: "With Validation Flags"})
}
```

Each lambda receives a row and returns a boolean. The four new columns tell you at a glance:

| Flag | Meaning |
|------|---------|
| `has_email` | The row has a real email, not the placeholder |
| `is_high_value` | Revenue exceeds 20,000 |
| `age_valid` | Age is between 1 and 99 |
| `all_valid` | All checks pass simultaneously |

Carol will have `has_email: false` and `age_valid: false` because her email was filled with the placeholder and her age was filled with 0. You can later filter to only fully valid rows with `tableWhere(fn(r) r.all_valid)`.

## 7. Result-based processing

Not all cleaning fits into a table pipeline. When you need to classify each record as a success or failure with a reason, use Tova's `Ok` and `Err` types.

`Ok(value)` wraps a successfully parsed record. `Err(message)` wraps a failure with a human-readable reason. After processing, `filterOk()` extracts the successes and `filterErr()` extracts the failures.

```tova
async fn main() {
  dirty_data = Table([
    {name: "Alice", age: "30", revenue: "45000.50", active: "true", email: "alice@co.com"},
    {name: "Bob", age: "25", revenue: "12000", active: "false", email: "bob@co.com"},
    {name: "Alice", age: "30", revenue: "45000.50", active: "true", email: "alice@co.com"},
    {name: "Carol", age: nil, revenue: "8500.75", active: "true", email: nil},
    {name: "David", age: "42", revenue: nil, active: "false", email: "david@co.com"},
    {name: "Eve", age: "35", revenue: "92000", active: "true", email: "eve@co.com"},
    {name: "Frank", age: "28", revenue: "0", active: nil, email: "frank@co.com"},
    {name: "Carol", age: nil, revenue: "8500.75", active: "true", email: nil},
    {name: "Grace", age: "31", revenue: "55000", active: "true", email: "grace@co.com"},
    {name: nil, age: nil, revenue: nil, active: nil, email: nil}
  ])

  fn parse_record(row) {
    if row.name == nil {
      Err("Missing name")
    } elif row.revenue == nil || row.revenue == "nil" {
      Err("Missing revenue for {row.name}")
    } else {
      Ok({name: row.name, revenue: parseFloat(row.revenue) || 0, valid: true})
    }
  }

  results = [parse_record(row) for row in dirty_data.toArray()]
  successes = filterOk(results)
  failures = filterErr(results)

  print("Successes: {len(successes)}")
  print("Failures: {len(failures)}")

  for failure in failures {
    print("  - {failure}")
  }
}
```

The `parse_record` function checks each row against business rules and returns either `Ok` with a cleaned record or `Err` with an explanation. Working against the original 10-row `dirty_data`:

- **Successes**: 7 records (Alice x2, Bob, Carol x2, Eve, Frank, Grace all have names and revenue)
- **Failures**: 3 records (David has nil revenue, and the all-nil row has no name; Carol's duplicate also succeeds since it has both fields)

This pattern is useful when you want to log exactly why each row was rejected rather than silently dropping it.

## 8. Real-world cleaning pipeline

Putting it all together on the employees CSV from the [Data Tutorials overview](./). This pipeline casts numeric columns and derives a salary band -- a common step before aggregation or reporting.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  clean_employees = employees
    |> cast("salary", "Int")
    |> cast("performance_score", "Float")
    |> tableDerive({
      salary_band: fn(r) {
        match true {
          _ if r.salary >= 180000 => "L6+"
          _ if r.salary >= 140000 => "L5"
          _ if r.salary >= 100000 => "L4"
          _ if r.salary >= 80000 => "L3"
          _ => "L2"
        }
      }
    })

  peek(clean_employees, {title: "Employees with Salary Bands"})
}
```

The `match true` pattern works like a cond expression: each guard is evaluated top to bottom and the first match wins. This is cleaner than nested if/elif chains when you have many thresholds.

Expected output (first 5 rows):

```text
── Employees with Salary Bands (20 of 20 rows) ────
  id  name           department   salary  performance_score  salary_band
  1   Alice Chen     Engineering  145000  4.5                L5
  2   Bob Martinez   Engineering  175000  4.8                L5
  3   Carol White    Marketing    110000  3.9                L4
  4   David Kim      Engineering  95000   3.5                L3
  5   Eva Johnson    Sales        160000  4.7                L5
  ...
────────────────────────────────────────────────────
```

## Cleaning step summary

Here is how the row count changes through the full inline pipeline:

| Step | Function | Rows |
|------|----------|------|
| Start | `Table(...)` | 10 |
| Dedup | `tableDropDuplicates()` | 8 |
| Drop nil names | `dropNil(_, "name")` | 7 |
| Fill nils | `fillNil(...)` | 7 |
| Cast types | `cast(...)` | 7 |
| Validate | `tableDerive(...)` | 7 |

The row count only drops during dedup and drop_nil. Every other step transforms values in place.

## Try it yourself

1. **Strict validation**: After the full cleaning pipeline, use `tableWhere()` to keep only rows where `all_valid` is `true`. How many rows survive?

2. **Custom fill strategy**: Instead of filling missing revenue with `"0"`, try filling it with the string `"8500.75"` (the median of known revenues). Does David's `is_high_value` flag change?

3. **Result report**: Modify `parse_record` to also reject rows where `active` is `nil`. How many failures do you get now? Print each failure message.

4. **Band distribution**: After deriving `salary_band` on the employees CSV, use `tableGroupBy()` and `table_count()` to count how many employees fall into each band.

## Next steps

Your data is now clean, typed, and validated. The next tutorial covers reading and writing multiple file formats beyond CSV.

Next: [Multi-Format I/O](./multi-format-io)
