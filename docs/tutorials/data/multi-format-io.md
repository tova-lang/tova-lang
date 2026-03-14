# Multi-Format I/O

Read and write Excel, Parquet, and SQLite alongside CSV and JSON -- one unified toolkit for every data format.

## What you'll learn

- Writing and reading Excel files with `writeExcel()` and `readExcel()`
- Working with named sheets in Excel workbooks
- Writing and reading Parquet files with compression options
- Connecting to SQLite databases with `sqlite()`
- Loading tables into SQLite and querying with SQL
- Parameterized queries and SQL joins
- Hybrid workflows: SQL results piped into Tova table operations
- Converting data between formats in a single pipeline

## Setup

This tutorial uses the `employees.csv` and `sales.csv` sample files from the [Data Tutorials index](./). Make sure they are in a `data/` directory alongside your Tova file.

```text
my-project/
  main.tova
  data/
    employees.csv
    sales.csv
    projects.csv
```

## 1. Excel I/O

Excel is the lingua franca of business data. Tova can read and write `.xlsx` files directly, including support for named sheets.

### Writing Excel files

Use `writeExcel()` to export a table to an `.xlsx` file. The simplest call takes a table and a file path:

```tova
async fn main() {
  employees = await read("data/employees.csv")

  await writeExcel(employees, "data/employees.xlsx")

  print("Wrote employees.xlsx")
}
```

This creates an Excel workbook with the data on the default sheet.

To specify a sheet name, pass an options object with a `sheet` key:

```tova
async fn main() {
  sales = await read("data/sales.csv")

  await writeExcel(sales, "data/sales.xlsx", {sheet: "Q1-Q2 Sales"})

  print("Wrote sales.xlsx with sheet 'Q1-Q2 Sales'")
}
```

### Reading Excel files

`readExcel()` loads an `.xlsx` file back into a Tova table:

```tova
async fn main() {
  emp_from_excel = await readExcel("data/employees.xlsx")

  peek(emp_from_excel, {n: 3, title: "From Excel"})
}
```

Expected output:

```text
-- From Excel (3 of 20 rows) --------------------------------
  id  name           department   title              salary  hire_date   city           performance_score  is_remote
  1   Alice Chen     Engineering  Senior Engineer    145000  2019-03-15  San Francisco  4.5                true
  2   Bob Martinez   Engineering  Staff Engineer     175000  2017-06-01  San Francisco  4.8                false
  3   Carol White    Marketing    Marketing Manager  110000  2020-01-10  New York       3.9                true
--------------------------------------------------------------
```

When reading a file with a named sheet, pass the same `sheet` option:

```tova
async fn main() {
  sales_from_excel = await readExcel("data/sales.xlsx", {sheet: "Q1-Q2 Sales"})

  peek(sales_from_excel, {n: 3, title: "Sales from Named Sheet"})
}
```

### Generic read for Excel

The `read()` function auto-detects file format from the extension. It works with `.xlsx` files too:

```tova
async fn main() {
  employees = await read("data/employees.xlsx")

  peek(employees, {n: 3, title: "Via generic read()"})
}
```

This is convenient when you want a single `read()` call regardless of whether the source is CSV, JSON, or Excel.

## 2. Parquet I/O

Parquet is a columnar storage format common in data engineering. It is compact, fast to read, and preserves column types. Tova supports Parquet with optional compression.

### Writing Parquet files

Use `writeParquet()` to export a table. Like `writeExcel()`, it takes a table and a path:

```tova
async fn main() {
  employees = await read("data/employees.csv")

  await writeParquet(employees, "data/employees.parquet")

  print("Wrote employees.parquet")
}
```

For smaller files on disk, pass a `compression` option. Gzip is a good default:

```tova
async fn main() {
  sales = await read("data/sales.csv")

  await writeParquet(sales, "data/sales.parquet", {compression: "gzip"})

  print("Wrote sales.parquet with gzip compression")
}
```

### Reading Parquet files

`readParquet()` loads a `.parquet` file back into a table:

```tova
async fn main() {
  emp_from_parquet = await readParquet("data/employees.parquet")

  peek(emp_from_parquet, {n: 3, title: "From Parquet"})
}
```

Expected output:

```text
-- From Parquet (3 of 20 rows) ------------------------------
  id  name           department   title              salary  hire_date   city           performance_score  is_remote
  1   Alice Chen     Engineering  Senior Engineer    145000  2019-03-15  San Francisco  4.5                true
  2   Bob Martinez   Engineering  Staff Engineer     175000  2017-06-01  San Francisco  4.8                false
  3   Carol White    Marketing    Marketing Manager  110000  2020-01-10  New York       3.9                true
--------------------------------------------------------------
```

Parquet preserves numeric types exactly, so columns like `salary` and `performance_score` remain numbers without needing type inference on read.

## 3. SQLite

SQLite gives you the full power of SQL without setting up a database server. Tova's `sqlite()` function opens (or creates) a database file, and you can load tables into it, run queries, and export results.

### Connecting and loading data

```tova
async fn main() {
  db = sqlite("data/warehouse.db")

  employees = await read("data/employees.csv")
  sales = await read("data/sales.csv")
  projects = await read("data/projects.csv")

  db.writeTable(employees, "employees")
  db.writeTable(sales, "sales")
  db.writeTable(projects, "projects")

  print("Loaded 3 tables into warehouse.db")

  db.close()
}
```

`sqlite()` opens (or creates) the database file. `db.writeTable()` loads a Tova table into a SQL table, creating the schema automatically from the column names and types. Always call `db.close()` when you are done.

### Basic queries

`db.query()` runs a SQL statement and returns the result as a Tova table. This means you can pipe SQL results straight into table operations.

```tova
async fn main() {
  db = sqlite("data/warehouse.db")
  employees = await read("data/employees.csv")
  db.writeTable(employees, "employees")

  dept_count = db.query("SELECT department, COUNT(*) as headcount FROM employees GROUP BY department ORDER BY headcount DESC")

  print(dept_count)

  db.close()
}
```

Expected output:

| department  | headcount |
|-------------|-----------|
| Engineering | 10        |
| Marketing   | 5         |
| Sales       | 5         |

### Parameterized queries

To avoid SQL injection and keep queries readable, pass parameters as an array. Use `?` as a placeholder in the SQL string:

```tova
async fn main() {
  db = sqlite("data/warehouse.db")
  employees = await read("data/employees.csv")
  db.writeTable(employees, "employees")

  threshold = 140000
  high_earners = db.query(
    "SELECT name, department, salary FROM employees WHERE salary >= ? ORDER BY salary DESC",
    [threshold]
  )

  print(high_earners)

  db.close()
}
```

Expected output:

| name          | department  | salary |
|---------------|-------------|--------|
| Quinn Scott   | Engineering | 210000 |
| Pat Harris    | Marketing   | 195000 |
| Iris Brown    | Engineering | 185000 |
| Bob Martinez  | Engineering | 175000 |
| Olivia Wright | Engineering | 170000 |
| Eva Johnson   | Sales       | 160000 |
| Sam Nelson    | Engineering | 155000 |
| Karen Davis   | Engineering | 152000 |
| Grace Park    | Engineering | 148000 |
| Alice Chen    | Engineering | 145000 |

### SQL joins

One of SQL's greatest strengths is joining related tables. Here we join `sales` and `employees` to see revenue per person:

```tova
async fn main() {
  db = sqlite("data/warehouse.db")
  employees = await read("data/employees.csv")
  sales = await read("data/sales.csv")
  db.writeTable(employees, "employees")
  db.writeTable(sales, "sales")

  sales_report = db.query("SELECT e.name, e.department, SUM(s.amount) as total_revenue FROM sales s JOIN employees e ON s.employee_id = e.id GROUP BY e.id ORDER BY total_revenue DESC")

  print(sales_report)

  db.close()
}
```

Expected output:

| name         | department | total_revenue |
|--------------|------------|---------------|
| Eva Johnson  | Sales      | 399000        |
| Bob Martinez | Engineering| 240000        |
| Rosa Green   | Sales      | 147000        |
| Noah Clark   | Sales      | 78000         |
| Hank Wilson  | Sales      | 25500         |
| Jack Taylor  | Sales      | 20400         |

### Window functions

SQLite supports window functions for ranking and running calculations:

```tova
async fn main() {
  db = sqlite("data/warehouse.db")
  employees = await read("data/employees.csv")
  db.writeTable(employees, "employees")

  ranked = db.query("SELECT name, department, salary, RANK() OVER (PARTITION BY department ORDER BY salary DESC) as dept_rank FROM employees ORDER BY department, dept_rank")

  peek(ranked, {n: 8, title: "Department Salary Rankings"})

  db.close()
}
```

Expected output:

```text
-- Department Salary Rankings (8 of 20 rows) -----------------
  name           department   salary  dept_rank
  Quinn Scott    Engineering  210000  1
  Iris Brown     Engineering  185000  2
  Bob Martinez   Engineering  175000  3
  Olivia Wright  Engineering  170000  4
  Sam Nelson     Engineering  155000  5
  Karen Davis    Engineering  152000  6
  Grace Park     Engineering  148000  7
  Alice Chen     Engineering  145000  8
--------------------------------------------------------------
```

`RANK() OVER (PARTITION BY department ORDER BY salary DESC)` ranks each employee within their department by salary.

### Hybrid: SQL results into Tova pipelines

SQL is great for filtering and joining, but Tova's table operations shine for custom transformations. You can combine both by querying with SQL and then piping the result into a Tova pipeline:

```tova
async fn main() {
  db = sqlite("data/warehouse.db")
  employees = await read("data/employees.csv")
  db.writeTable(employees, "employees")

  eng = db.query("SELECT * FROM employees WHERE department = 'Engineering'")

  eng_analysis = eng
    |> tableDerive({
      salary_band: fn(r) {
        match true {
          _ if r.salary >= 180000 => "Principal"
          _ if r.salary >= 150000 => "Senior+"
          _ => "Mid"
        }
      }
    })
    |> tableGroupBy("salary_band")
    |> tableAgg({
      count_val: aggCount(),
      avg_perf: aggMean("performance_score")
    })

  print(eng_analysis)

  db.close()
}
```

Expected output:

| _group    | count_val | avg_perf |
|-----------|-----------|----------|
| Principal | 2         | 4.95     |
| Senior+   | 4         | 4.48     |
| Mid       | 4         | 3.55     |

The SQL `WHERE` clause does the heavy lifting for filtering, and then Tova's `table_derive`, `table_group_by`, and `table_agg` handle the classification and summary -- the best of both worlds.

### Exporting SQL results

Since `db.query()` returns a standard Tova table, you can write SQL results to any format:

```tova
async fn main() {
  db = sqlite("data/warehouse.db")
  employees = await read("data/employees.csv")
  sales = await read("data/sales.csv")
  db.writeTable(employees, "employees")
  db.writeTable(sales, "sales")

  full_report = db.query("SELECT e.name, e.department, e.salary, COALESCE(SUM(s.amount), 0) as total_sales FROM employees e LEFT JOIN sales s ON e.id = s.employee_id GROUP BY e.id ORDER BY total_sales DESC")

  await write(full_report, "data/full_report.csv")
  await writeExcel(full_report, "data/full_report.xlsx")

  print("Exported SQL report to CSV and Excel")

  db.close()
}
```

## 4. Format comparison

Each format has different strengths. Use this table to pick the right one for your use case.

| Feature | CSV | JSON | Excel | Parquet | SQLite |
|---|---|---|---|---|---|
| Human-readable | Yes | Yes | Via app | No | Via app |
| Column types preserved | No | Partial | Partial | Yes | Yes |
| Compression | No | No | Built-in | Yes (gzip, snappy) | No |
| Multiple sheets/tables | No | No | Yes | No | Yes |
| SQL queries | No | No | No | No | Yes |
| File size (relative) | Medium | Large | Medium | Small | Medium |
| Read speed (large data) | Slow | Slow | Medium | Fast | Fast |
| Best for | Interchange | APIs | Business users | Data pipelines | Local analytics |

**Rule of thumb**: Use CSV for simple interchange, JSON for APIs, Excel for sharing with non-technical colleagues, Parquet for data pipelines and archival, and SQLite when you need SQL queries or multiple related tables.

## 5. Format conversion pipeline

A common real-world task is converting data through multiple formats. Tova makes this a straightforward pipeline since every format reads into the same table type:

```tova
async fn main() {
  // CSV -> Excel -> Parquet round-trip
  source = await read("data/employees.csv")

  await writeExcel(source, "data/converted.xlsx")
  from_excel = await readExcel("data/converted.xlsx")

  await writeParquet(from_excel, "data/converted.parquet")
  from_parquet = await readParquet("data/converted.parquet")

  peek(from_parquet, {n: 3, title: "After CSV -> Excel -> Parquet"})
}
```

Expected output:

```text
-- After CSV -> Excel -> Parquet (3 of 20 rows) -------------
  id  name           department   title              salary  hire_date   city           performance_score  is_remote
  1   Alice Chen     Engineering  Senior Engineer    145000  2019-03-15  San Francisco  4.5                true
  2   Bob Martinez   Engineering  Staff Engineer     175000  2017-06-01  San Francisco  4.8                false
  3   Carol White    Marketing    Marketing Manager  110000  2020-01-10  New York       3.9                true
--------------------------------------------------------------
```

Data survives the round-trip because all three formats produce the same Tova table representation.

### Multi-format output

When you need to deliver data to different audiences, filter once and write to every format:

```tova
async fn main() {
  employees = await read("data/employees.csv")

  final = employees
    |> tableWhere(fn(r) r.performance_score >= 4.0)
    |> tableSelect("name", "department", "salary", "performance_score")

  await write(final, "data/top_performers.csv")
  await write(final, "data/top_performers.json")
  await writeExcel(final, "data/top_performers.xlsx")
  await writeParquet(final, "data/top_performers.parquet")

  print("Exported top performers to 4 formats")
}
```

Four files, one pipeline. The `write()` function handles CSV and JSON via file extension, while `writeExcel()` and `writeParquet()` handle their respective formats.

## Try it yourself

1. **Excel sheet names**: Load `sales.csv`, filter to transactions above 50,000, and write the result to an Excel file with the sheet name `"Big Deals"`. Read it back and verify the row count matches.

2. **Compressed Parquet round-trip**: Write the employees table to Parquet with gzip compression. Read it back and compute the average salary using `table_group_by` and `table_agg` to confirm the data is intact.

3. **SQLite analytics**: Load all three CSV files into a SQLite database. Write a SQL query that joins `projects` and `employees` (on `lead_id = id`) to find each project lead's name, project name, budget, and the lead's salary. Sort by budget descending.

4. **Hybrid pipeline**: Use SQLite to join `sales` and `employees`, then pipe the SQL result into a Tova pipeline that derives a `deal_tier` column (`"Large"` for amounts >= 50000, `"Medium"` for >= 20000, `"Small"` otherwise). Group by `deal_tier` and compute the total revenue and deal count for each tier.

5. **Four-format export**: Filter employees to the Engineering department, select name, title, salary, and performance score, then write the result to CSV, JSON, Excel, and Parquet. Open the Excel file to verify it looks correct.

## Next

Next: [Lazy Pipelines](./lazy-pipelines)
