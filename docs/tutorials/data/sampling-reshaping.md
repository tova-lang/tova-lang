# Sampling & Reshaping

Draw random subsets from your data and reshape tables between wide and long formats.

## What you'll learn

- Drawing random samples with `table_sample` (fixed count and fractional)
- Reproducible sampling with the `seed` option
- Stratified sampling across groups with `table_stratified_sample`
- Pivoting from long to wide format with `table_pivot`
- Unpivoting from wide to long format with `table_unpivot`
- Exploding array columns into individual rows with `table_explode`

## Setup

This tutorial uses the `employees.csv` and `sales.csv` sample files from the [Data Tutorials index](./).

## Sampling

When datasets are large, you often want to work with a representative subset. Tova provides three sampling strategies: random, fractional, and stratified.

### Random sample (fixed count)

Pass an integer to `table_sample` to draw exactly that many rows. The `seed` option makes the sample reproducible.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  sample5 = tableSample(employees, 5, {seed: 42})
  peek(sample5, {title: "Random Sample (n=5, seed=42)"})
}
```

This draws 5 rows at random from the 20-row employees table. The `seed: 42` option ensures you get the same 5 rows every time you run the code.

### Reproducible sampling

Seeds guarantee identical results across runs. This is essential for reproducible analysis and debugging.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  s1 = tableSample(employees, 3, {seed: 123})
  s2 = tableSample(employees, 3, {seed: 123})

  names1 = [r.name for r in s1.toArray()]
  names2 = [r.name for r in s2.toArray()]

  print("Identical: {jsonStringify(names1) == jsonStringify(names2)}")
}
```

Expected output:

```text
Identical: true
```

Both samples use the same seed, so they produce the exact same rows. Change the seed to get a different subset.

### Fractional sample

Pass a decimal between 0 and 1 to sample a percentage of the table.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  quarter = tableSample(employees, 0.25, {seed: 42})
  print("25% of {employees.rows} = {quarter.rows} rows")
}
```

Expected output:

```text
25% of 20 = 5 rows
```

Fractional sampling is useful when you want a consistent proportion regardless of table size. Here, 25% of 20 rows gives 5 rows.

### Stratified sampling

`table_stratified_sample` draws the same number of rows from each distinct value in a column. This ensures every group is represented equally.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  stratified = tableStratifiedSample(employees, "department", 2, {seed: 42})
  peek(stratified, {title: "Stratified Sample (2 per dept)"})
}
```

This pulls exactly 2 employees from each department (Engineering, Sales, Marketing), giving 6 rows total. Stratified sampling prevents large groups from dominating the sample -- every department gets equal representation.

## Reshaping

Reshaping transforms the structure of a table without changing the underlying data. The three core operations are pivot (long to wide), unpivot (wide to long), and explode (arrays to rows).

### Pivot (long to wide)

`table_pivot` works like a pivot table in a spreadsheet. It takes rows and spreads one column's values across new columns.

```tova
async fn main() {
  sales = await read("data/sales.csv")

  pivoted = sales
    |> tablePivot({index: "region", columns: "customer_type", values: "amount"})

  peek(pivoted, {title: "Pivoted: Region x Customer Type"})
}
```

The three parameters control the pivot:

| Parameter | Role | In this example |
|-----------|------|-----------------|
| `index` | Row labels (left axis) | `"region"` -- one row per region |
| `columns` | New column headers | `"customer_type"` -- Enterprise, Mid-Market, SMB |
| `values` | Cell values (summed by default) | `"amount"` -- total revenue |

Expected shape:

| region    | Enterprise | Mid-Market | SMB   |
|-----------|------------|------------|-------|
| Northeast | 399000     | 68000      | 10000 |
| West      | 240000     | 0          | 0     |
| Midwest   | 42000      | 105000     | 21200 |
| South     | 0          | 0          | 10400 |

Each cell contains the sum of `amount` for that region/customer-type combination.

#### Headcount pivot

You can pivot any numeric value. To count occurrences, derive a column of 1s and pivot that.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  dept_pivot = employees
    |> tableDerive({val: fn(r) 1})
    |> tablePivot({index: "department", columns: "city", values: "val"})

  peek(dept_pivot, {title: "Headcount: Department x City"})
}
```

The `table_derive` adds a column `val` set to 1 for every row. Pivoting then sums these 1s, producing a headcount for each department-city combination.

### Unpivot (wide to long)

`table_unpivot` is the inverse of pivot. It takes columns and stacks them into rows, converting wide data back to long format.

```tova
async fn main() {
  wide_data = Table([
    {employee: "Alice", q1_sales: 30000, q2_sales: 45000, q3_sales: 38000},
    {employee: "Bob", q1_sales: 22000, q2_sales: 18000, q3_sales: 25000},
    {employee: "Carol", q1_sales: 41000, q2_sales: 52000, q3_sales: 47000}
  ])

  long_data = tableUnpivot(wide_data, {
    id: "employee",
    columns: ["q1_sales", "q2_sales", "q3_sales"]
  })

  peek(long_data, {title: "Unpivoted: Quarterly Sales"})
}
```

The `id` parameter identifies which column stays fixed (one value per original row). The `columns` parameter lists which columns to fold into rows.

Expected output:

| employee | variable  | value |
|----------|-----------|-------|
| Alice    | q1_sales  | 30000 |
| Alice    | q2_sales  | 45000 |
| Alice    | q3_sales  | 38000 |
| Bob      | q1_sales  | 22000 |
| Bob      | q2_sales  | 18000 |
| Bob      | q3_sales  | 25000 |
| Carol    | q1_sales  | 41000 |
| Carol    | q2_sales  | 52000 |
| Carol    | q3_sales  | 47000 |

The 3-row, 4-column wide table becomes a 9-row, 3-column long table. Each original quarterly column becomes a row with `variable` (the column name) and `value` (the cell value).

### Explode (arrays to rows)

`table_explode` takes a column containing arrays and creates one row per array element, duplicating all other columns.

```tova
async fn main() {
  with_skills = Table([
    {name: "Alice", skills: ["Python", "SQL", "Spark"]},
    {name: "Bob", skills: ["JavaScript", "React"]},
    {name: "Carol", skills: ["Python", "R", "SQL", "Tableau"]}
  ])

  exploded = tableExplode(with_skills, "skills")
  print("{with_skills.rows} rows to {exploded.rows} rows after exploding")
}
```

Expected output:

```text
3 rows to 9 rows after exploding
```

Alice had 3 skills, Bob had 2, Carol had 4 -- that is 9 rows total. Each row now has a single skill value in the `skills` column.

### Explode + analysis

Exploding is most powerful when combined with grouping and aggregation. After exploding, each skill is its own row, so you can count, rank, and filter skills directly.

```tova
async fn main() {
  with_skills = Table([
    {name: "Alice", skills: ["Python", "SQL", "Spark"]},
    {name: "Bob", skills: ["JavaScript", "React"]},
    {name: "Carol", skills: ["Python", "R", "SQL", "Tableau"]}
  ])

  exploded = tableExplode(with_skills, "skills")

  skill_counts = exploded
    |> tableGroupBy("skills")
    |> tableAgg({people_with_skill: aggCount()})
    |> tableSortBy("people_with_skill", {desc: true})

  peek(skill_counts, {title: "Skill Frequency"})
}
```

Expected output:

| _group     | people_with_skill |
|------------|-------------------|
| Python     | 2                 |
| SQL        | 2                 |
| Spark      | 1                 |
| JavaScript | 1                 |
| React      | 1                 |
| R          | 1                 |
| Tableau    | 1                 |

The pattern is: explode the array column, then group by the exploded values. This works for tags, categories, skills, or any column where rows contain lists.

## Try it yourself

1. **Weighted sample**: Sample 10% of the sales data with `seed: 99`. How many rows do you get? Try changing the seed -- does the count stay the same?

2. **Stratified regions**: Use `table_stratified_sample` on the sales table, stratifying by `"region"` with 2 rows per region. How many total rows are in the result?

3. **Revenue pivot**: Pivot the sales data with `"product"` as the index, `"region"` as the columns, and `"quantity"` as the values. Which product has the most units sold in the Northeast?

4. **Unpivot and re-pivot**: Take the quarterly sales `wide_data` from the unpivot example, unpivot it, then pivot it back with `employee` as the index and `variable` as the columns. Do you get the original shape back?

5. **Tag analysis**: Create a table of blog posts where each post has an array of tags. Explode the tags, then find the 3 most common tags using `table_group_by`, `table_agg`, and `table_sort_by`.

## Next

You've completed all 9 data tutorials! For more: [Tables API](/stdlib/tables), [Data Professionals Guide](/guide/data-professionals)
