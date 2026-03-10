# Getting Started with Tables

Load a CSV, explore its shape, and transform it with filters, sorting, derived columns, and exports — all in a single pipeline.

## What you'll learn

- Loading CSV files into tables with `read()`
- Inspecting data with `peek()`, `schema_of()`, and `describe()`
- Filtering rows with `table_where()`
- Selecting and reordering columns with `table_select()`
- Sorting with `table_sort_by()`
- Creating derived columns with `table_derive()`
- Writing results to CSV and JSON with `write()`

## Setup

Make sure you have the `data/employees.csv` file from the [Data Tutorials overview](./) in a `data/` directory alongside your Tova file.

Your project should look like this:

```text
my-project/
  main.tova
  data/
    employees.csv
```

## 1. Loading and inspecting data

Start by reading the CSV and getting a feel for the dataset.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  peek(employees, {n: 5, title: "Employees Preview"})
}
```

`read()` auto-detects CSV format from the file extension and returns a table. `peek()` prints a formatted preview — the `n` option controls how many rows to show.

Expected output:

```text
── Employees Preview (5 of 20 rows) ──────────────
  id  name           department   title              salary  hire_date   city           performance_score  is_remote
  1   Alice Chen     Engineering  Senior Engineer    145000  2019-03-15  San Francisco  4.5                true
  2   Bob Martinez   Engineering  Staff Engineer     175000  2017-06-01  San Francisco  4.8                false
  3   Carol White    Marketing    Marketing Manager  110000  2020-01-10  New York       3.9                true
  4   David Kim      Engineering  Junior Engineer    95000   2022-08-20  Austin         3.5                false
  5   Eva Johnson    Sales        Sales Director     160000  2018-04-12  New York       4.7                false
───────────────────────────────────────────────────
```

Two more inspection tools give you the column types and summary statistics:

```tova
async fn main() {
  employees = await read("data/employees.csv")

  schema = schema_of(employees)
  print(schema)

  describe(employees)
}
```

`schema_of()` returns a list of column names and inferred types. `describe()` prints summary statistics (count, mean, min, max, standard deviation) for numeric columns.

## 2. Filtering rows

Use `table_where()` with a lambda that receives each row. Rows where the lambda returns `true` are kept.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  stars = employees
    |> table_where(fn(r) r.performance_score >= 4.5)
    |> table_select("name", "department", "title", "performance_score")
    |> table_sort_by("performance_score", {desc: true})

  peek(stars, {title: "Top Performers"})
}
```

This pipeline filters to high performers, keeps only the columns we care about, and sorts descending by score. The `|>` pipe operator passes the result of each step into the next function as its first argument.

Expected output:

```text
── Top Performers (6 of 6 rows) ──────────────────
  name             department   title               performance_score
  Quinn Scott      Engineering  Principal Engineer   5.0
  Iris Brown       Engineering  Tech Lead            4.9
  Bob Martinez     Engineering  Staff Engineer       4.8
  Pat Harris       Marketing    VP Marketing         4.8
  Eva Johnson      Sales        Sales Director       4.7
  Olivia Wright    Engineering  Staff Engineer       4.6
───────────────────────────────────────────────────
```

## 3. Sorting

`table_sort_by()` sorts ascending by default. Pass `{desc: true}` for descending order.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  top3 = employees
    |> table_sort_by("salary", {desc: true})
    |> table_limit(3)
    |> table_select("name", "title", "salary")

  peek(top3, {title: "Top 3 by Salary"})
}
```

`table_limit()` takes the first N rows after sorting — useful for "top N" queries.

Expected output:

```text
── Top 3 by Salary (3 of 3 rows) ─────────────────
  name           title               salary
  Quinn Scott    Principal Engineer   210000
  Pat Harris     VP Marketing         195000
  Iris Brown     Tech Lead            185000
───────────────────────────────────────────────────
```

## 4. Derived columns

`table_derive()` adds new columns computed from existing data. Pass an object where keys are column names and values are lambdas.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  salary_analysis = employees
    |> table_derive({
      annual_bonus: fn(r) r.salary * 0.15,
      tax_bracket: fn(r) {
        match true {
          _ if r.salary >= 180000 => "High"
          _ if r.salary >= 120000 => "Mid-High"
          _ if r.salary >= 90000 => "Mid"
          _ => "Standard"
        }
      },
      tenure_years: fn(r) {
        year = parseInt(r.hire_date.split("-")[0])
        2024 - year
      }
    })
    |> table_select("name", "salary", "annual_bonus", "tax_bracket", "tenure_years")
    |> table_sort_by("salary", {desc: true})

  peek(salary_analysis, {title: "Salary Breakdown"})
}
```

Each lambda receives a row object. You can use any Tova expression inside, including `match` for conditional logic and string operations for parsing dates.

Expected output (first 5 rows):

```text
── Salary Breakdown (20 of 20 rows) ──────────────
  name           salary  annual_bonus  tax_bracket  tenure_years
  Quinn Scott    210000  31500         High         10
  Pat Harris     195000  29250         High         9
  Iris Brown     185000  27750         High         8
  Bob Martinez   175000  26250         Mid-High     7
  Olivia Wright  170000  25500         Mid-High     7
  ...
───────────────────────────────────────────────────
```

## 5. Renaming columns

`table_rename()` changes a column name without affecting the data.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  renamed = employees
    |> table_select("name", "department", "salary")
    |> table_rename("name", "employee_name")
    |> table_rename("department", "dept")
    |> table_limit(5)

  peek(renamed, {title: "Renamed Columns"})
}
```

Expected output:

```text
── Renamed Columns (5 of 5 rows) ─────────────────
  employee_name   dept         salary
  Alice Chen      Engineering  145000
  Bob Martinez    Engineering  175000
  Carol White     Marketing    110000
  David Kim       Engineering  95000
  Eva Johnson     Sales        160000
───────────────────────────────────────────────────
```

## 6. Excluding columns

Instead of listing every column you want, you can exclude the ones you do not want by passing an object with an `__exclude` key.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  no_salary = employees
    |> table_select({__exclude: ["salary", "is_remote"]})
    |> table_limit(5)

  peek(no_salary, {title: "Excluding salary & is_remote"})
}
```

This keeps all columns except `salary` and `is_remote`.

## 7. Writing results

`write()` exports a table to a file. The format is inferred from the extension.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  stars = employees
    |> table_where(fn(r) r.performance_score >= 4.5)
    |> table_select("name", "department", "title", "performance_score")
    |> table_sort_by("performance_score", {desc: true})

  salary_analysis = employees
    |> table_derive({
      annual_bonus: fn(r) r.salary * 0.15,
      tax_bracket: fn(r) {
        match true {
          _ if r.salary >= 180000 => "High"
          _ if r.salary >= 120000 => "Mid-High"
          _ if r.salary >= 90000 => "Mid"
          _ => "Standard"
        }
      },
      tenure_years: fn(r) {
        year = parseInt(r.hire_date.split("-")[0])
        2024 - year
      }
    })
    |> table_select("name", "salary", "annual_bonus", "tax_bracket", "tenure_years")
    |> table_sort_by("salary", {desc: true})

  await write(stars, "data/high_performers.csv")
  await write(salary_analysis, "data/salary_analysis.json")

  print("Wrote high_performers.csv and salary_analysis.json")
}
```

- `.csv` writes comma-separated values
- `.json` writes an array of row objects

Both `read()` and `write()` are async, so remember the `await` keyword.

## Try it yourself

1. **Mid-range filter**: Find employees with salaries between 90,000 and 150,000. Select their name, title, and salary. Sort by salary ascending.

2. **City report**: Derive a column called `cost_of_living` that returns `"High"` for San Francisco and New York, and `"Moderate"` for everything else. Sort by city.

3. **Remote engineers**: Filter to remote employees in the Engineering department. Select name, title, and performance score. Write the result to `data/remote_engineers.csv`.

## Next steps

Now that you can load, inspect, filter, sort, and transform tables, the next tutorial covers aggregating data across groups.

Next: [Grouping & Aggregation](./grouping)
