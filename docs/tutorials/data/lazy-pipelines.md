# Lazy Pipelines

Build complex queries that defer execution until you actually need the results.

## What you'll learn

- The difference between eager and lazy evaluation for table operations
- Creating lazy tables with `lazy()`
- Chaining `.where()`, `.select()`, `.sort_by()`, `.limit()`, and `.derive()` on lazy tables
- Two ways to materialize results: `collect()` and `|> collect()`
- Transitioning from lazy to eager with `group_by`
- Composing reusable base queries with functions
- Iterating over lazy results directly with `for`

## Setup

This tutorial uses the `employees.csv` and `sales.csv` sample files from the [Data Tutorials index](./).

## Lazy vs eager evaluation

Every table function you have used so far -- `table_where()`, `table_select()`, `table_sort_by()` -- is **eager**. It processes every row the moment you call it, producing a new table immediately.

Lazy evaluation flips this around. When you call `lazy(table)`, you get back a **query plan** -- a lightweight description of what to do. Chained methods like `.where()` and `.select()` add steps to the plan without touching any data. Nothing actually runs until you **materialize** the query by calling `collect()` or iterating over it.

Why does this matter?

- **Fewer intermediate tables.** An eager pipeline with five steps creates five intermediate tables in memory. A lazy pipeline builds the plan first and executes it in a single pass.
- **Composability.** You can store a lazy query in a variable, branch it into multiple specialized queries, and materialize each one independently.
- **Readability.** The `.method()` chaining syntax reads top to bottom as a single query, similar to SQL or dataframe libraries.

## Creating a lazy table

Wrap any table in `lazy()` to enter lazy mode. Then chain operations using dot-method syntax.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  query = lazy(employees)
    .where(fn(r) r.department == "Engineering")
    .select("name", "title", "salary", "performance_score")
    .sort_by("salary", {desc: true})

  // Nothing has executed yet — query is just a plan
  result = collect(query)
  peek(result, {title: "Engineering Team (Lazy)"})
}
```

At the point where `query` is assigned, no rows have been filtered, no columns dropped, no sorting performed. The variable holds a description of those operations. The call to `collect(query)` walks the plan and produces the final table.

Expected output:

```text
── Engineering Team (Lazy) (10 of 10 rows) ──────
  name            title               salary  performance_score
  Quinn Scott     Principal Engineer   210000  5.0
  Iris Brown      Tech Lead            185000  4.9
  Bob Martinez    Staff Engineer       175000  4.8
  Olivia Wright   Staff Engineer       170000  4.6
  Sam Nelson      Senior Engineer      155000  4.1
  ...
──────────────────────────────────────────────────
```

## Chaining operations

Lazy tables support the same operations as their eager counterparts but with dot-method syntax:

| Lazy method | Eager equivalent | Description |
|---|---|---|
| `.where(fn)` | `table_where(t, fn)` | Filter rows by predicate |
| `.select(...)` | `table_select(t, ...)` | Keep only named columns |
| `.sort_by(col, opts)` | `table_sort_by(t, col, opts)` | Sort rows by a column |
| `.limit(n)` | `table_limit(t, n)` | Take the first N rows |
| `.derive({...})` | `table_derive(t, {...})` | Add computed columns |
| `.group_by(col)` | `table_group_by(t, col)` | Group rows (materializes) |

Here is a longer chain that filters, limits, and sorts in one expression:

```tova
async fn main() {
  employees = await read("data/employees.csv")

  top_performers = lazy(employees)
    .where(fn(r) r.performance_score >= 4.0)
    .select("name", "department", "performance_score", "salary")
    .sort_by("performance_score", {desc: true})
    .limit(5)
    |> collect()

  peek(top_performers, {title: "Top 5 Performers"})
}
```

Notice the `|> collect()` at the end. This is the second way to materialize a lazy query, covered in the next section.

## Two ways to materialize

There are two equivalent ways to turn a lazy query into a concrete table.

**Function call:** pass the query as an argument.

```tova
result = collect(query)
```

**Pipe:** chain `collect()` at the end of the lazy pipeline with `|>`.

```tova
result = lazy(employees)
  .where(fn(r) r.salary >= 100000)
  .select("name", "salary")
  |> collect()
```

Both produce the same table. Use whichever reads more naturally. The pipe form is convenient when you want to build and materialize a query in a single expression. The function-call form is useful when you store the query in a variable first and materialize it later.

## Lazy derive

`.derive()` works the same as `table_derive()`: pass an object where keys are new column names and values are lambdas that compute each row's value.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  enriched = lazy(employees)
    .derive({
      comp_ratio: fn(r) Math.round(r.salary / 120000 * 100) / 100,
      senior: fn(r) r.performance_score >= 4.5
    })
    .where(fn(r) r.comp_ratio > 1.0)
    .select("name", "salary", "comp_ratio", "senior")
    .sort_by("comp_ratio", {desc: true})
    |> collect()

  peek(enriched, {title: "Above-Benchmark Compensation"})
}
```

This computes a compensation ratio and a seniority flag, then filters to employees above the 1.0 benchmark -- all deferred until `collect()` runs.

Expected output:

```text
── Above-Benchmark Compensation (8 of 8 rows) ───
  name            salary  comp_ratio  senior
  Quinn Scott     210000  1.75        true
  Pat Harris      195000  1.63        true
  Iris Brown      185000  1.54        true
  Bob Martinez    175000  1.46        true
  Olivia Wright   170000  1.42        true
  ...
──────────────────────────────────────────────────
```

## Lazy to group_by transition

Calling `.group_by()` on a lazy table materializes the filtered data and returns a grouped table. From that point on, you continue with eager functions like `table_agg`.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  dept_stats = lazy(employees)
    .where(fn(r) r.is_remote == "true")
    .group_by("department")
    |> table_agg({
      remote_count: agg_count(),
      avg_salary: agg_mean("salary")
    })

  peek(dept_stats, {title: "Remote Employees by Department"})
}
```

The lazy portion (`.where()`) defers filtering. The `.group_by()` call triggers execution and groups the matching rows. After that, `table_agg` runs eagerly on the grouped result.

Expected output:

```text
── Remote Employees by Department (3 of 3 rows) ─
  _group       remote_count  avg_salary
  Engineering  4             135000
  Marketing    4             97750
  Sales        1             72000
──────────────────────────────────────────────────
```

## Composable queries with functions

Because a lazy query is just a value, you can wrap a base query in a function and reuse it across multiple specialized queries. This avoids repeating the same filter logic.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  fn eng_base() {
    lazy(employees).where(fn(r) r.department == "Engineering")
  }

  seniors = eng_base()
    .where(fn(r) r.performance_score >= 4.0)
    .select("name", "title", "salary")
    |> collect()

  juniors = eng_base()
    .where(fn(r) r.title == "Junior Engineer")
    .select("name", "salary")
    |> collect()

  peek(seniors, {title: "Senior Engineers"})
  peek(juniors, {title: "Junior Engineers"})
}
```

`eng_base()` returns a fresh lazy query each time it is called. You can chain additional filters, selects, and sorts onto each branch independently. Neither query runs until its own `collect()` call.

Expected output:

```text
── Senior Engineers (7 of 7 rows) ────────────────
  name            title               salary
  Quinn Scott     Principal Engineer   210000
  Iris Brown      Tech Lead            185000
  Bob Martinez    Staff Engineer       175000
  Olivia Wright   Staff Engineer       170000
  Sam Nelson      Senior Engineer      155000
  ...
──────────────────────────────────────────────────

── Junior Engineers (2 of 2 rows) ────────────────
  name          salary
  David Kim     95000
  Mia Thomas    92000
──────────────────────────────────────────────────
```

## Iterating over lazy results

You do not always need to materialize a lazy query into a table. A `for` loop over a lazy query iterates through the matching rows directly.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  high_earners = lazy(employees)
    .where(fn(r) r.salary >= 160000)
    .select("name", "salary")
    .sort_by("salary", {desc: true})

  for row in high_earners {
    print("  {row.name}: ${row.salary}")
  }
}
```

The `for` loop triggers execution of the lazy pipeline and yields one row at a time. This is useful when you want to process rows individually -- for example, formatting output, writing to a file line by line, or feeding data into another system.

Expected output:

```text
  Quinn Scott: $210000
  Pat Harris: $195000
  Iris Brown: $185000
  Bob Martinez: $175000
  Olivia Wright: $170000
  Eva Johnson: $160000
```

## When to use lazy vs eager

Both styles produce the same results. Choose based on the situation:

| Situation | Recommendation |
|---|---|
| Quick, one-off transformation | Eager (`table_where`, `table_select`, etc.) |
| Long pipeline with many steps | Lazy -- avoids intermediate tables |
| Reusable base query branched multiple ways | Lazy -- compose with functions |
| Grouping and aggregation at the end | Lazy for filtering, then transition to eager for `table_agg` |
| Iterating row by row | Lazy -- use `for` loop directly |
| Simple two-step filter and sort | Either works -- use whichever reads better |

A good rule of thumb: if your pipeline has three or more chained operations, or if you want to reuse the same base filter across multiple queries, reach for `lazy()`.

## Try it yourself

1. **Sales pipeline**: Create a lazy query over `sales.csv` that filters to Enterprise customers, selects `product`, `amount`, and `date`, and sorts by `amount` descending. Materialize it with `collect()` and print with `peek()`.

2. **Reusable base**: Write a function `sf_employees()` that returns a lazy query filtering employees to those in San Francisco. Use it to create two separate queries: one for high performers (score >= 4.5) and one for all staff sorted by salary.

3. **Lazy to grouped**: Start with a lazy query that derives a `salary_tier` column (`"High"` for salaries above 150000, `"Standard"` otherwise), then transition to `group_by("salary_tier")` and compute the count and average performance score for each tier.

4. **Row iteration**: Create a lazy pipeline that finds remote Marketing employees, then use a `for` loop to print each person's name and title on a separate line.

## Next

Next: [Visualization](./visualization)
