# Visualization

Generate zero-dependency SVG charts directly from your data pipelines -- no external libraries, no build steps, no configuration files.

## What you'll learn

- Creating bar, line, scatter, pie, histogram, and heatmap charts
- Saving SVG output with `write_text()`
- Customizing chart appearance with options
- The aggregate-then-chart pattern for grouped data
- Combining `table_group_by`, `table_agg`, and `table_derive` with chart functions

## Overview

Every chart function in Tova returns an SVG string. You save it to a file with `write_text()`, open it in any browser, or embed it in an HTML page. There are no runtime dependencies -- the SVG is self-contained.

All six chart functions follow the same pattern:

```text
svg_string = chart_function(table, {options})
write_text("path/to/chart.svg", svg_string)
```

The `x`, `y`, `label`, `value`, and `col` options are lambdas that extract a field from each row. This keeps the chart functions flexible -- you decide what data maps to each axis.

## Setup

This tutorial uses the `employees.csv` and `sales.csv` sample files from the [Data Tutorials index](./). Make sure you also have a `data/charts/` directory for the output (the code below creates it with `mkdir`).

## Bar chart

Bar charts compare quantities across categories. Use them when you have a discrete set of groups and want to show a single numeric value per group.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  dept_counts = employees
    |> table_group_by("department")
    |> table_agg({headcount: agg_count()})

  chart_svg = bar_chart(dept_counts, {
    x: fn(r) r._group,
    y: fn(r) r.headcount,
    title: "Headcount by Department",
    color: "#4A90D9"
  })

  mkdir("data/charts")
  write_text("data/charts/dept_headcount.svg", chart_svg)
}
```

The `x` lambda returns the category label (the `_group` column from `table_group_by`). The `y` lambda returns the bar height. The `color` option sets the fill color for all bars.

### Bar chart options

| Option | Type | Description |
|--------|------|-------------|
| `x` | lambda | Category label for each bar |
| `y` | lambda | Numeric value (bar height) |
| `title` | string | Chart title displayed above the chart |
| `color` | string | Hex color for all bars (default: blue) |

## Line chart

Line charts show trends over an ordered sequence, typically time. Use them when the x-axis has a natural order and you want to emphasize the direction of change.

```tova
async fn main() {
  sales = await read("data/sales.csv")

  monthly = sales
    |> table_derive({month: fn(r) r.date.slice(0, 7)})
    |> table_group_by("month")
    |> table_agg({revenue: agg_sum("amount")})
    |> table_sort_by("_group")

  line_svg = line_chart(monthly, {
    x: fn(r) r._group,
    y: fn(r) r.revenue,
    title: "Monthly Revenue Trend",
    color: "#E74C3C",
    points: true
  })

  write_text("data/charts/monthly_revenue.svg", line_svg)
}
```

The pipeline first derives a `month` column by slicing the date, groups by it, sums the revenue, and sorts chronologically. The `points` option adds visible dots at each data point, making individual months easier to read.

### Line chart options

| Option | Type | Description |
|--------|------|-------------|
| `x` | lambda | Value for each point on the x-axis |
| `y` | lambda | Numeric value for the y-axis |
| `title` | string | Chart title |
| `color` | string | Hex color for the line and points |
| `points` | bool | Show dots at each data point (default: false) |

## Scatter chart

Scatter charts reveal relationships between two numeric variables. Use them when you want to see whether values correlate, cluster, or contain outliers.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  scatter_svg = scatter_chart(employees, {
    x: fn(r) r.salary,
    y: fn(r) r.performance_score,
    title: "Salary vs Performance Score",
    color: "#9B59B6"
  })

  write_text("data/charts/salary_vs_perf.svg", scatter_svg)
}
```

Unlike bar and line charts, scatter charts work directly on raw rows -- no aggregation needed. Each row becomes one dot positioned by its salary (x) and performance score (y).

### Scatter chart options

| Option | Type | Description |
|--------|------|-------------|
| `x` | lambda | Numeric value for the horizontal axis |
| `y` | lambda | Numeric value for the vertical axis |
| `title` | string | Chart title |
| `color` | string | Hex color for all dots |

## Histogram

Histograms show the distribution of a single numeric variable by dividing it into equal-width bins and counting how many values fall in each. Use them when you want to understand the shape of your data -- is it clustered, skewed, or spread out?

```tova
async fn main() {
  employees = await read("data/employees.csv")

  hist_svg = histogram(employees, {
    col: fn(r) r.salary,
    bins: 8,
    title: "Salary Distribution",
    color: "#F39C12"
  })

  write_text("data/charts/salary_histogram.svg", hist_svg)
}
```

The `col` lambda extracts the numeric value to bin. The `bins` option controls how many bins to divide the range into -- more bins show finer detail, fewer bins show broader patterns.

### Histogram options

| Option | Type | Description |
|--------|------|-------------|
| `col` | lambda | Numeric value to distribute into bins |
| `bins` | int | Number of bins (default varies) |
| `title` | string | Chart title |
| `color` | string | Hex color for all bars |

## Pie chart

Pie charts show the proportion of a whole that each category represents. Use them when you have a small number of categories (roughly 2-7) and want to emphasize relative shares.

```tova
async fn main() {
  sales = await read("data/sales.csv")

  cat_revenue = sales
    |> table_group_by("category")
    |> table_agg({revenue: agg_sum("amount")})

  pie_svg = pie_chart(cat_revenue, {
    label: fn(r) r._group,
    value: fn(r) r.revenue,
    title: "Revenue by Category"
  })

  write_text("data/charts/revenue_by_category.svg", pie_svg)
}
```

The `label` lambda provides the name for each slice, and `value` provides its size. Colors are assigned automatically to each slice.

### Pie chart options

| Option | Type | Description |
|--------|------|-------------|
| `label` | lambda | Text label for each slice |
| `value` | lambda | Numeric value determining slice size |
| `title` | string | Chart title |

## Heatmap

Heatmaps show the magnitude of a value across two categorical dimensions using color intensity. Use them when you have two grouping variables and want to spot patterns in their combination -- for example, which department-city pairs have the highest salaries.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  dept_city = employees
    |> table_group_by(fn(r) "{r.department}|{r.city}")
    |> table_agg({avg_salary: agg_mean("salary")})
    |> table_derive({
      department: fn(r) r._group.split("|")[0],
      city: fn(r) r._group.split("|")[1]
    })

  heat_svg = heatmap(dept_city, {
    x: fn(r) r.city,
    y: fn(r) r.department,
    value: fn(r) r.avg_salary,
    title: "Avg Salary: Department x City"
  })

  write_text("data/charts/dept_city_heatmap.svg", heat_svg)
}
```

The pipeline creates a cross-tabulation by combining department and city into a single group key with a `|` delimiter, aggregates the mean salary, then splits the key back into separate columns for the chart axes. This is the same cross-tabulation pattern from the [Grouping & Aggregation](./grouping) tutorial.

### Heatmap options

| Option | Type | Description |
|--------|------|-------------|
| `x` | lambda | Category for the horizontal axis |
| `y` | lambda | Category for the vertical axis |
| `value` | lambda | Numeric value controlling color intensity |
| `title` | string | Chart title |

## Common pattern: aggregate first, then chart

Most charts require summarized data, not raw rows. The typical workflow is:

1. **Group** the raw data with `table_group_by`
2. **Aggregate** each group with `table_agg`
3. **Sort** if order matters (especially for line charts)
4. **Chart** the summarized table

```tova
async fn main() {
  sales = await read("data/sales.csv")

  // Step 1-3: aggregate and sort
  region_revenue = sales
    |> table_group_by("region")
    |> table_agg({total: agg_sum("amount")})
    |> table_sort_by("total", {desc: true})

  // Step 4: chart
  svg = bar_chart(region_revenue, {
    x: fn(r) r._group,
    y: fn(r) r.total,
    title: "Revenue by Region"
  })

  write_text("data/charts/region_revenue.svg", svg)
}
```

The two exceptions to this pattern are scatter charts and histograms, which typically take raw (unaggregated) data as input.

## Chart function reference

| Function | Purpose | Key options |
|----------|---------|-------------|
| `bar_chart(table, opts)` | Compare values across categories | `x`, `y`, `title`, `color` |
| `line_chart(table, opts)` | Show trends over ordered values | `x`, `y`, `title`, `color`, `points` |
| `scatter_chart(table, opts)` | Reveal relationships between two numbers | `x`, `y`, `title`, `color` |
| `histogram(table, opts)` | Show distribution of a numeric column | `col`, `bins`, `title`, `color` |
| `pie_chart(table, opts)` | Show proportional breakdown | `label`, `value`, `title` |
| `heatmap(table, opts)` | Show intensity across two categories | `x`, `y`, `value`, `title` |

## Try it yourself

1. **Top products bar chart**: Group sales by `product`, aggregate total revenue with `agg_sum("amount")`, sort descending, and create a bar chart. Save it to `data/charts/product_revenue.svg`.

2. **Deal count line chart**: Derive a `month` column from the sales date, group by month, count deals with `agg_count()`, sort by month, and create a line chart with `points: true`. Save it to `data/charts/monthly_deals.svg`.

3. **Salary scatter by tenure**: Derive a `tenure` column (`2024 - parseInt(r.hire_date.split("-")[0])`) on employees, then create a scatter chart with tenure on the x-axis and salary on the y-axis. Does experience correlate with pay?

4. **Performance histogram**: Create a histogram of `performance_score` from the employees table with 5 bins. Save it to `data/charts/performance_dist.svg`.

5. **Region pie chart**: Group sales by `region`, aggregate total revenue, and create a pie chart showing each region's share. Save it to `data/charts/region_share.svg`.

6. **Cross-tabulation heatmap**: Build a heatmap of average deal size (`agg_mean("amount")`) with `region` on the x-axis and `category` on the y-axis. Which region-category pair has the largest average deal?

## Next

Next: [Sampling & Reshaping](./sampling-reshaping)
