# Joins & Combining Data

Combine tables by matching rows on shared keys, and stack tables together with union.

## What you'll learn

- How join types differ and when to use each one
- Inner joins for matching rows across tables
- Left joins to keep every row from the primary table
- Anti joins to find rows with no match
- Semi joins to filter by existence in another table
- Right and outer joins for complete coverage
- Stacking tables together with `tableUnion()`

## Setup

This tutorial uses all three CSV files from the [Data Tutorials overview](./). Your project should look like this:

```text
my-project/
  main.tova
  data/
    employees.csv
    sales.csv
    projects.csv
```

## How joins work

A join combines two tables — called **left** and **right** — by comparing a key column in each. The `how` parameter controls which rows appear in the result.

Consider two small tables:

```text
Left (employees)          Right (sales_summary)
id  name                  employee_id  revenue
1   Alice                 1            50000
2   Bob                   3            30000
3   Carol
```

Here is what each join type produces:

```text
inner  — only rows where keys match in BOTH tables
         id  name    employee_id  revenue
         1   Alice   1            50000
         3   Carol   3            30000

left   — ALL left rows; nil for unmatched right columns
         id  name    employee_id  revenue
         1   Alice   1            50000
         2   Bob     nil          nil
         3   Carol   3            30000

right  — ALL right rows; nil for unmatched left columns
         id  name    employee_id  revenue
         1   Alice   1            50000
         3   Carol   3            30000

outer  — ALL rows from BOTH tables; nil where no match
         id  name    employee_id  revenue
         1   Alice   1            50000
         2   Bob     nil          nil
         3   Carol   3            30000

anti   — left rows with NO match in right (left columns only)
         id  name
         2   Bob

semi   — left rows WITH a match in right (left columns only)
         id  name
         1   Alice
         3   Carol

cross  — every combination of left x right (no key needed)
         id  name    employee_id  revenue
         1   Alice   1            50000
         1   Alice   3            30000
         2   Bob     1            50000
         2   Bob     3            30000
         3   Carol   1            50000
         3   Carol   3            30000
```

## 1. Inner join — matching sales to employees

An inner join keeps only rows where the key exists in both tables. This is the most common join type.

```tova
async fn main() {
  employees = await read("data/employees.csv")
  sales = await read("data/sales.csv")

  sales_with_names = tableJoin(sales, employees, {left: "employee_id", right: "id", how: "inner"})
    |> tableSelect("transaction_id", "name", "product", "amount", "date")
    |> tableSortBy("amount", {desc: true})
    |> tableLimit(10)

  peek(sales_with_names, {title: "Top 10 Sales with Employee Names"})
}
```

`tableJoin()` takes three arguments: the left table, the right table, and an options object with `left` (key column on the left table), `right` (key column on the right table), and `how` (join type). When keys are simple column names, pass them as strings.

Expected output:

```text
── Top 10 Sales with Employee Names (10 of 10 rows) ──
  transaction_id  name            product          amount  date
  T014            Eva Johnson     Cloud Platform   95000   2024-04-10
  T009            Eva Johnson     Server Rack      85000   2024-03-10
  T002            Bob Martinez    Cloud Platform   72000   2024-01-22
  T025            Eva Johnson     Server Rack      68000   2024-06-15
  T017            Bob Martinez    Analytics Tool   62000   2024-05-01
  T023            Bob Martinez    Security Suite   58000   2024-06-05
  T005            Eva Johnson     Analytics Tool   55000   2024-02-15
  T019            Eva Johnson     CRM Pro          51000   2024-05-10
  T011            Bob Martinez    Security Suite   48000   2024-03-20
  T001            Eva Johnson     CRM Pro          45000   2024-01-15
───────────────────────────────────────────────────────────
```

All 25 sales rows match an employee because every `employee_id` in the sales data refers to a valid employee. The inner join drops nothing here, but it would if a sales record referenced a deleted employee.

## 2. Left join — every employee with their sales

A left join keeps every row from the left table. Employees with no sales get `nil` for the right-side columns. This is useful for finding "all X, optionally with Y."

Because one employee can have many sales, we aggregate first so the join produces one row per employee.

```tova
async fn main() {
  employees = await read("data/employees.csv")
  sales = await read("data/sales.csv")

  // Pre-aggregate: total revenue and deal count per employee
  emp_sales = sales
    |> tableGroupBy("employee_id")
    |> tableAgg({total_revenue: aggSum("amount"), deal_count: aggCount()})

  // Left join: every employee, with sales summary if available
  all_emp_sales = tableJoin(employees, emp_sales, {left: "id", right: fn(r) r._group, how: "left"})
    |> tableSelect("name", "department", "title", "total_revenue", "deal_count")

  peek(all_emp_sales, {title: "All Employees with Sales"})
}
```

After `tableGroupBy()` and `tableAgg()`, the aggregated table has a `_group` column holding the group key. Since `_group` is not a simple column name (it is the result of grouping), we pass a lambda `fn(r) r._group` as the right key.

Expected output (showing a few rows):

```text
── All Employees with Sales (20 of 20 rows) ──────────
  name            department   title               total_revenue  deal_count
  Alice Chen      Engineering  Senior Engineer      nil            nil
  Bob Martinez    Engineering  Staff Engineer       240000         4
  Carol White     Marketing    Marketing Manager    nil            nil
  David Kim       Engineering  Junior Engineer      nil            nil
  Eva Johnson     Sales        Sales Director       399000         6
  Frank Lee       Marketing    Content Lead         nil            nil
  ...
───────────────────────────────────────────────────────
```

All 20 employees appear. The 14 who made no sales have `nil` for `total_revenue` and `deal_count`.

## 3. Anti join — employees with no sales

An anti join returns left rows that have **no match** in the right table. Only the left table's columns are kept. It answers the question: "which employees have never closed a deal?"

```tova
async fn main() {
  employees = await read("data/employees.csv")
  sales = await read("data/sales.csv")

  // Get distinct employee IDs from sales
  sales_emp_ids = sales
    |> tableSelect("employee_id")
    |> tableDropDuplicates()

  // Anti join: employees NOT in sales
  non_sales = tableJoin(employees, sales_emp_ids, {left: "id", right: "employee_id", how: "anti"})

  peek(non_sales, {title: "Employees with No Sales"})
}
```

We first extract the unique `employee_id` values from the sales table using `tableSelect()` and `tableDropDuplicates()`. The anti join then returns every employee whose `id` is absent from that set.

Expected output:

```text
── Employees with No Sales (14 of 14 rows) ────────────
  id  name            department   title               salary  ...
  1   Alice Chen      Engineering  Senior Engineer      145000
  3   Carol White     Marketing    Marketing Manager    110000
  4   David Kim       Engineering  Junior Engineer      95000
  6   Frank Lee       Marketing    Content Lead         98000
  7   Grace Park      Engineering  Senior Engineer      148000
  9   Iris Brown      Engineering  Tech Lead            185000
  11  Karen Davis     Engineering  Senior Engineer      152000
  12  Leo Adams       Marketing    SEO Specialist       88000
  13  Mia Thomas      Engineering  Junior Engineer      92000
  15  Olivia Wright   Engineering  Staff Engineer       170000
  16  Pat Harris      Marketing    VP Marketing         195000
  17  Quinn Scott     Engineering  Principal Engineer   210000
  19  Sam Nelson      Engineering  Senior Engineer      155000
  20  Tina Lopez      Marketing    Designer             95000
────────────────────────────────────────────────────────
```

14 out of 20 employees have never made a sale. These are all Engineering and Marketing staff.

## 4. Semi join — employees who have sold

A semi join is the opposite of an anti join. It returns left rows that **do** have a match in the right table. Like anti, it keeps only the left table's columns and never duplicates rows.

```tova
async fn main() {
  employees = await read("data/employees.csv")
  sales = await read("data/sales.csv")

  sales_emp_ids = sales
    |> tableSelect("employee_id")
    |> tableDropDuplicates()

  // Semi join: employees who appear in sales
  sales_people = tableJoin(employees, sales_emp_ids, {left: "id", right: "employee_id", how: "semi"})

  peek(sales_people, {title: "Employees with Sales"})
}
```

Expected output:

```text
── Employees with Sales (6 of 6 rows) ─────────────────
  id  name            department  title               salary  ...
  2   Bob Martinez    Engineering Staff Engineer       175000
  5   Eva Johnson     Sales       Sales Director       160000
  8   Hank Wilson     Sales       Account Executive    85000
  10  Jack Taylor     Sales       Sales Rep            72000
  14  Noah Clark      Sales       Account Executive    88000
  18  Rosa Green      Sales       Sales Manager        130000
────────────────────────────────────────────────────────
```

::: tip Anti vs. Semi
Anti and semi are complementary. Together, they partition the left table into two non-overlapping groups: rows that match and rows that do not. If you need both groups, run both joins against the same right table.
:::

## 5. Right join — ensuring full region coverage

A right join keeps every row from the **right** table. This is useful when you have a reference table (like all regions) and want to see which ones have data.

```tova
async fn main() {
  sales = await read("data/sales.csv")

  // Reference table with all regions
  all_regions = Table([
    {region: "Northeast"},
    {region: "Midwest"},
    {region: "South"},
    {region: "West"},
    {region: "Southeast"}
  ])

  // Aggregate sales by region
  region_sales = sales
    |> tableGroupBy("region")
    |> tableAgg({revenue: aggSum("amount"), deals: aggCount()})

  // Right join: all regions, even those with no sales
  full_region = tableJoin(region_sales, all_regions, {left: fn(r) r._group, right: "region", how: "right"})

  peek(full_region, {title: "Sales by Region (all regions)"})
}
```

Expected output:

```text
── Sales by Region (all regions) (5 of 5 rows) ────────
  _group     revenue  deals  region
  Northeast  477000   10     Northeast
  Midwest    187500   8      Midwest
  South      10400    3      South
  West       240000   4      West
  nil        nil      nil    Southeast
────────────────────────────────────────────────────────
```

Southeast has no sales data, but the right join ensures it still appears in the result with `nil` values. This is how you spot coverage gaps.

## 6. Outer join — full coverage from both sides

An outer join (also called a full outer join) keeps every row from **both** tables. Unmatched rows on either side get `nil` for the missing columns.

```tova
async fn main() {
  sales = await read("data/sales.csv")

  all_regions = Table([
    {region: "Northeast"},
    {region: "Midwest"},
    {region: "South"},
    {region: "West"},
    {region: "Southeast"}
  ])

  region_sales = sales
    |> tableGroupBy("region")
    |> tableAgg({revenue: aggSum("amount"), deals: aggCount()})

  // Outer join: all regions AND all sales regions
  full_coverage = tableJoin(region_sales, all_regions, {left: fn(r) r._group, right: "region", how: "outer"})

  peek(full_coverage, {title: "Full Region Coverage"})
}
```

Expected output:

```text
── Full Region Coverage (5 of 5 rows) ─────────────────
  _group     revenue  deals  region
  Northeast  477000   10     Northeast
  West       240000   4      West
  Midwest    187500   8      Midwest
  South      10400    3      South
  nil        nil      nil    Southeast
────────────────────────────────────────────────────────
```

In this dataset the result is the same as the right join because every sales region is also in the reference table. Outer joins matter when both sides have unique entries — for example, if sales contained a "Pacific" region not in the reference list, it would still appear.

::: tip Right vs. Outer
Use a **right join** when the right table is the authoritative list and you only want its rows. Use an **outer join** when both tables may have entries the other lacks and you want complete visibility.
:::

## 7. Multi-step workflow — building a leaderboard

Real analysis often chains multiple joins and transformations. Here we build a sales leaderboard by joining, aggregating, and combining results from different departments.

```tova
async fn main() {
  employees = await read("data/employees.csv")
  sales = await read("data/sales.csv")

  // Top 3 from Engineering by performance
  top_eng = employees
    |> tableWhere(fn(r) r.department == "Engineering")
    |> tableSortBy("performance_score", {desc: true})
    |> tableLimit(3)
    |> tableSelect("name", "department", "performance_score", "salary")

  // Top 3 from Sales by performance
  top_sales = employees
    |> tableWhere(fn(r) r.department == "Sales")
    |> tableSortBy("performance_score", {desc: true})
    |> tableLimit(3)
    |> tableSelect("name", "department", "performance_score", "salary")

  // Stack them together
  combined = tableUnion(top_eng, top_sales)

  peek(combined, {title: "Top Performers: Engineering + Sales"})
}
```

`tableUnion()` stacks two tables vertically. Both tables should have the same columns (or at least overlapping ones). Columns unique to one table will have `nil` values in rows from the other.

Expected output:

```text
── Top Performers: Engineering + Sales (6 of 6 rows) ──
  name            department   performance_score  salary
  Quinn Scott     Engineering  5.0                210000
  Iris Brown      Engineering  4.9                185000
  Bob Martinez    Engineering  4.8                175000
  Eva Johnson     Sales        4.7                160000
  Rosa Green      Sales        4.2                130000
  Noah Clark      Sales        4.0                88000
────────────────────────────────────────────────────────
```

## Join type reference

| Join type | `how` value | Rows in result | Columns in result |
|-----------|-------------|----------------|-------------------|
| Inner | `"inner"` | Only rows matching in both tables | All columns from both |
| Left | `"left"` | All left rows; matching right rows | All columns from both (`nil` for unmatched right) |
| Right | `"right"` | All right rows; matching left rows | All columns from both (`nil` for unmatched left) |
| Outer | `"outer"` | All rows from both tables | All columns from both (`nil` where no match) |
| Anti | `"anti"` | Left rows with **no** match in right | Left columns only |
| Semi | `"semi"` | Left rows **with** a match in right | Left columns only |
| Cross | `"cross"` | Every left row paired with every right row | All columns from both |

## Key patterns

**String keys vs. lambda keys.** When the join column has a simple name, pass a string: `{left: "id", right: "employee_id"}`. When the column requires extraction (like `_group` from an aggregation), use a lambda: `{right: fn(r) r._group}`.

**Pre-aggregate before joining.** If the right table has many rows per key, aggregate first to avoid row explosion. The left join example above aggregated sales per employee before joining.

**Deduplicate before anti/semi.** Anti and semi joins check for existence, not quantity. Deduplicating the right table with `tableDropDuplicates()` keeps the join clean and fast.

## Try it yourself

1. **Project leads**: Inner join `projects.csv` with `employees.csv` on `lead_id` / `id`. Select the project name, lead name, budget, and status. Sort by budget descending.

2. **Idle employees**: Use an anti join to find employees who are not leading any project. How many are there?

3. **Department budget report**: Group projects by department, aggregate total budget and count. Left join this onto a reference table of all departments (`Engineering`, `Marketing`, `Sales`, `HR`, `Finance`) so every department appears, even those with no projects.

4. **Cross join use case**: Create a table of two products and a table of three regions. Cross join them to generate every product-region combination.

## Next steps

You can now combine tables from multiple sources, fill in gaps with outer joins, and filter by existence with anti and semi joins. The next tutorial covers window functions for ranking and running totals.

Next: [Window Functions](./window-functions)
