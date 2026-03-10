# Grouping & Aggregation

Split your data into groups and compute summary statistics with a single pipeline.

## What you'll learn

- Grouping rows with `table_group_by`
- Computing aggregates: count, sum, mean, min, max, median
- Sorting grouped results
- Deriving columns before grouping for custom breakdowns
- Cross-tabulation patterns
- Pivoting data with `table_pivot`

## Setup

This tutorial uses the `employees.csv` and `sales.csv` sample files from the [Data Tutorials index](./).

## Basic group-by

The most common analytics task: split rows by a column, then summarize each group. In Tova, this is a two-step pipeline -- `table_group_by` followed by `table_agg`.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  dept_summary = employees
    |> table_group_by("department")
    |> table_agg({
      headcount: agg_count(),
      avg_salary: agg_mean("salary"),
      max_salary: agg_max("salary"),
      min_salary: agg_min("salary"),
      median_salary: agg_median("salary"),
      avg_score: agg_mean("performance_score")
    })
    |> table_sort_by("avg_salary", {desc: true})

  print(dept_summary)
}
```

Expected output:

| _group      | headcount | avg_salary | max_salary | min_salary | median_salary | avg_score |
|-------------|-----------|------------|------------|------------|---------------|-----------|
| Engineering | 10        | 152700     | 210000     | 92000      | 150000        | 4.34      |
| Sales       | 5         | 107000     | 160000     | 72000      | 88000         | 3.82      |
| Marketing   | 5         | 117200     | 195000     | 88000      | 98000         | 4.06      |

The grouped column appears as `_group` in the output. Results are sorted by average salary, highest first.

## Aggregation functions reference

Tova provides six built-in aggregation functions. Each takes a column name (except `agg_count`).

| Function | Argument | Description |
|---|---|---|
| `agg_count()` | none | Number of rows in each group |
| `agg_sum("col")` | column name | Sum of values in the column |
| `agg_mean("col")` | column name | Arithmetic mean of values |
| `agg_min("col")` | column name | Minimum value |
| `agg_max("col")` | column name | Maximum value |
| `agg_median("col")` | column name | Median value (middle element) |

You can use any combination of these inside a single `table_agg` call. Each key in the object becomes a column name in the output.

## Group by different columns

You are not limited to one grouping column. Any column works -- just change the string passed to `table_group_by`.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  city_counts = employees
    |> table_group_by("city")
    |> table_agg({
      headcount: agg_count(),
      total_payroll: agg_sum("salary"),
      avg_performance: agg_mean("performance_score")
    })
    |> table_sort_by("headcount", {desc: true})

  print(city_counts)
}
```

Expected output:

| _group        | headcount | total_payroll | avg_performance |
|---------------|-----------|---------------|-----------------|
| San Francisco | 5         | 855000        | 4.76            |
| Austin        | 5         | 562000        | 3.64            |
| Chicago       | 5         | 533000        | 3.80            |
| New York      | 5         | 625000        | 4.36            |

Here is another example, this time grouping sales by product:

```tova
async fn main() {
  sales = await read("data/sales.csv")

  product_revenue = sales
    |> table_group_by("product")
    |> table_agg({
      total_revenue: agg_sum("amount"),
      num_deals: agg_count(),
      avg_deal_size: agg_mean("amount"),
      total_units: agg_sum("quantity")
    })
    |> table_sort_by("total_revenue", {desc: true})

  print(product_revenue)
}
```

Expected output:

| _group         | total_revenue | num_deals | avg_deal_size | total_units |
|----------------|---------------|-----------|---------------|-------------|
| Cloud Platform | 220000        | 4         | 55000         | 7           |
| CRM Pro        | 156000        | 4         | 39000         | 10          |
| Server Rack    | 195000        | 3         | 65000         | 5           |
| Security Suite | 124000        | 3         | 41333         | 11          |
| Analytics Tool | 174000        | 4         | 43500         | 15          |
| Office Suite   | 15900         | 4         | 3975          | 27          |
| Laptop Pro     | 30000         | 3         | 10000         | 12          |

## Derived columns before grouping

Sometimes the column you want to group by does not exist yet. Use `table_derive` to create it first, then group.

A common pattern is extracting a time period from a date column:

```tova
async fn main() {
  sales = await read("data/sales.csv")

  monthly = sales
    |> table_derive({month: fn(r) r.date.slice(0, 7)})
    |> table_group_by("month")
    |> table_agg({revenue: agg_sum("amount"), deals: agg_count()})
    |> table_sort_by("_group")

  print(monthly)
}
```

Expected output:

| _group  | revenue | deals |
|---------|---------|-------|
| 2024-01 | 117000  | 2     |
| 2024-02 | 91700   | 4     |
| 2024-03 | 183500  | 4     |
| 2024-04 | 149300  | 4     |
| 2024-05 | 121400  | 4     |
| 2024-06 | 252100  | 7     |

The `table_derive` call adds a `month` column by slicing the first 7 characters of each date (e.g., `"2024-01-15"` becomes `"2024-01"`). Note the lambda syntax: `fn(r) r.date.slice(0, 7)` -- no arrow, just the function keyword followed by parameters and the body expression.

Sorting by `"_group"` orders the results by the group key itself, giving chronological order.

## Cross-tabulation

To analyze data across two dimensions, combine the dimensions into a single group key using `table_derive`, then group on that derived column.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  cross = employees
    |> table_derive({dept_city: fn(r) "{r.department}|{r.city}"})
    |> table_group_by("dept_city")
    |> table_agg({headcount: agg_count(), avg_salary: agg_mean("salary")})
    |> table_sort_by("headcount", {desc: true})

  print(cross)
}
```

Expected output (first few rows):

| _group               | headcount | avg_salary |
|----------------------|-----------|------------|
| Engineering\|Austin  | 3         | 114000     |
| Engineering\|San Francisco | 3   | 176667     |
| Sales\|New York      | 2         | 124000     |
| Marketing\|Chicago   | 3         | 93667      |
| ...                  | ...       | ...        |

The pattern is: derive a combined key with a delimiter (here `|`), then group on it. You can split the key back apart in downstream processing if needed.

## Pivot tables

For a spreadsheet-style pivot, use `table_pivot`. This transforms grouped data so that one column's distinct values become output columns.

```tova
async fn main() {
  sales = await read("data/sales.csv")

  pivoted = sales
    |> table_pivot({index: "region", columns: "category", values: "amount"})

  print(pivoted)
}
```

The three arguments control the pivot:

| Parameter | Description |
|---|---|
| `index` | Column whose values become rows (left axis) |
| `columns` | Column whose distinct values become new column headers |
| `values` | Column to aggregate into the cells (summed by default) |

This gives you one row per region with revenue broken out by product category -- similar to a pivot table in Excel or Google Sheets.

## Try it yourself

1. **Top-performing departments**: Group employees by department and find which department has the highest average `performance_score`.

2. **Quarterly sales**: Derive a `quarter` column from the sales date (hint: use `.slice(0, 7)` to get the month, then map months to quarters), group by it, and compute total revenue per quarter.

3. **City payroll breakdown**: Group employees by city, compute `total_payroll` using `agg_sum("salary")`, and sort by total payroll descending. Which city has the highest total payroll?

4. **Product units pivot**: Pivot the sales data with `region` as the index, `product` as the columns, and `quantity` as the values to see how many units of each product sold in each region.

## Next

Next: [Joins & Combining Data](./joins)
