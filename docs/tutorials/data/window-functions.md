# Window Functions

Window functions let you compute values across related rows without collapsing your data. If you have used `table_group_by` with `table_agg`, you know that aggregation reduces many rows into one row per group. Window functions do the opposite: they add new columns while keeping every original row intact.

This is powerful when you need rankings, running totals, comparisons to previous rows, or moving averages -- all while preserving the full detail of your dataset.

## Prerequisites

- Complete [Joins & Combining Data](./joins) or be comfortable with tables and pipes
- Sample data files from the [series intro](./)

## `table_window` at a Glance

Every window operation uses the same function:

```tova
tableWindow(table, options, window_functions)
```

| Argument | Description |
|----------|-------------|
| `table` | The input table |
| `options` | `{partition: "col", order: "col", desc: true/false}` -- partition groups rows (like GROUP BY but without collapsing), order sorts within each partition, desc reverses the sort |
| `window_functions` | An object mapping new column names to `win_*` function calls |

Both `partition` and `order` are optional. Without `partition`, the entire table is treated as one partition. Without `order`, rows keep their original order.

## Ranking Functions

Ranking is the most common use of window functions. Given a sorted partition, each row gets a position number.

### Row Number Within a Partition

Rank employees by salary within each department, highest first:

```tova
async fn main() {
  employees = await read("data/employees.csv")

  ranked = tableWindow(employees,
    {partition: "department", order: "salary", desc: true},
    {rank_in_dept: winRowNumber()})
    |> tableSelect("name", "department", "salary", "rank_in_dept")

  print(ranked)
}
```

`winRowNumber()` assigns 1, 2, 3, ... sequentially. Because we set `desc: true`, the highest salary in each department gets rank 1. The `partition: "department"` option restarts the numbering for each department.

### Dense Rank and Percent Rank

When two employees share the same score, `winDenseRank()` gives them the same rank and does not skip numbers. `winPercentRank()` returns a value between 0.0 and 1.0 representing relative position.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  perf_ranked = tableWindow(employees,
    {order: "performance_score", desc: true},
    {perf_rank: winDenseRank(), percentile: winPercentRank()})
    |> tableSelect("name", "department", "performance_score",
                    "perf_rank", "percentile")
    |> tableLimit(10)

  print(perf_ranked)
}
```

Notice there is no `partition` here -- the entire company is ranked together. The top performer gets `perf_rank` 1 and `percentile` 0.0 (the highest). The lowest performer gets `percentile` 1.0.

::: tip Dense Rank vs Rank
`winRank()` leaves gaps after ties (1, 2, 2, 4), while `winDenseRank()` does not (1, 2, 2, 3). Use dense rank when you want consecutive bucket numbers.
:::

### Ntile: Dividing into Buckets

`winNtile(n)` splits the ordered rows into `n` roughly equal groups. This is how you compute quartiles, deciles, or percentile buckets:

```tova
async fn main() {
  employees = await read("data/employees.csv")

  quartiles = tableWindow(employees,
    {order: "salary", desc: true},
    {salary_quartile: winNtile(4)})
    |> tableDerive({quartile_label: fn(r) {
      match r.salary_quartile {
        1 => "Top 25%"
        2 => "Upper Mid"
        3 => "Lower Mid"
        4 => "Bottom 25%"
        _ => "Unknown"
      }
    }})

  print(quartiles |> tableSelect("name", "salary",
    "salary_quartile", "quartile_label"))
}
```

The highest-paid employees land in quartile 1 (top 25%), and we use `table_derive` with a `match` expression to attach human-readable labels.

## Running Aggregates

Running (cumulative) aggregates grow as you move through the rows. They are essential for tracking totals over time, counting events, or computing running averages.

```tova
async fn main() {
  sales = await read("data/sales.csv")

  running = tableWindow(sales |> tableSortBy("date"),
    {order: "date"},
    {
      cumulative_revenue: winRunningSum("amount"),
      deal_number: winRunningCount(),
      running_avg_deal: winRunningAvg("amount")
    })

  print(running |> tableSelect("date", "product", "amount",
    "cumulative_revenue", "deal_number", "running_avg_deal"))
}
```

| Function | What it computes |
|----------|-----------------|
| `winRunningSum("amount")` | Sum of `amount` from the first row up to the current row |
| `winRunningCount()` | How many rows have been seen so far (1, 2, 3, ...) |
| `winRunningAvg("amount")` | Average of `amount` from the first row up to the current row |
| `winRunningMin("amount")` | Smallest `amount` seen so far |
| `winRunningMax("amount")` | Largest `amount` seen so far |

Note that we sort the sales table by date first with `tableSortBy("date")` and also set `order: "date"` in the window options. The sort ensures the input rows are in chronological order, and the window order determines row sequencing within partitions.

## Lag and Lead

`win_lag` and `win_lead` let you look at values from neighboring rows. This is invaluable for period-over-period comparisons.

```tova
async fn main() {
  sales = await read("data/sales.csv")

  comparison = tableWindow(sales |> tableSortBy("date"),
    {order: "date"},
    {
      prev_amount: winLag("amount", 1, 0),
      next_amount: winLead("amount", 1, 0)
    })
    |> tableDerive({change_from_prev: fn(r) r.amount - r.prev_amount})

  print(comparison |> tableSelect("date", "product", "amount",
    "prev_amount", "next_amount", "change_from_prev"))
}
```

`winLag("amount", 1, 0)` says: look 1 row back in the partition, and if there is no previous row (the first row), return 0 as the default. `win_lead` does the same but looks forward.

After computing lag and lead, we use `table_derive` to calculate the change from the previous deal. A positive `change_from_prev` means the current deal was larger; negative means it was smaller.

::: info Lag/Lead Arguments
The full signature is `winLag(column, offset, default)`. The offset defaults to 1 and the default value defaults to nil. Always provide a default (like 0) if you plan to do arithmetic on the result -- otherwise the first/last rows will contain nil.
:::

## Moving Averages

A moving average smooths out noise by averaging over a sliding window of the last N rows. This is commonly used for trend lines in time-series data.

```tova
async fn main() {
  sales = await read("data/sales.csv")

  smoothed = tableWindow(sales |> tableSortBy("date"),
    {order: "date"},
    {
      ma_3: winMovingAvg("amount", 3),
      running_min: winRunningMin("amount"),
      running_max: winRunningMax("amount")
    })

  print(smoothed |> tableSelect("date", "amount",
    "ma_3", "running_min", "running_max"))
}
```

`winMovingAvg("amount", 3)` averages the current row and the two rows before it. For the first row, the window contains only that row, so the moving average equals the value itself. For the second row, it averages two values, and from the third row onward it averages three.

Combining the moving average with running min and max gives you a complete picture: the trend line, the floor, and the ceiling.

## First and Last Value

`win_first_value` and `win_last_value` retrieve the value from the first or last row within each partition. This is useful for showing boundaries alongside every row.

```tova
async fn main() {
  employees = await read("data/employees.csv")

  hire_bounds = tableWindow(employees,
    {partition: "department", order: "hire_date"},
    {
      first_hired: winFirstValue("name"),
      last_hired: winLastValue("name")
    })

  print(hire_bounds |> tableSelect("name", "department",
    "hire_date", "first_hired", "last_hired"))
}
```

Every Engineering row will show the name of the earliest and most recent hire in Engineering. Every Marketing row will show the same for Marketing. The values are constant within a partition but differ across partitions.

## Putting It All Together

Here is a complete example that combines several window techniques in a single pipeline:

```tova
async fn main() {
  employees = await read("data/employees.csv")
  sales = await read("data/sales.csv")

  // Rank employees within their department
  ranked = tableWindow(employees,
    {partition: "department", order: "salary", desc: true},
    {rank_in_dept: winRowNumber()})
    |> tableSelect("name", "department", "salary", "rank_in_dept")

  // Dense rank + percent rank across the company
  perf_ranked = tableWindow(employees,
    {order: "performance_score", desc: true},
    {perf_rank: winDenseRank(), percentile: winPercentRank()})
    |> tableSelect("name", "department", "performance_score",
                    "perf_rank", "percentile")
    |> tableLimit(10)

  // Salary quartiles with labels
  quartiles = tableWindow(employees,
    {order: "salary", desc: true},
    {salary_quartile: winNtile(4)})
    |> tableDerive({quartile_label: fn(r) {
      match r.salary_quartile {
        1 => "Top 25%"
        2 => "Upper Mid"
        3 => "Lower Mid"
        4 => "Bottom 25%"
        _ => "Unknown"
      }
    }})

  // Running totals on sales
  running = tableWindow(sales |> tableSortBy("date"),
    {order: "date"},
    {
      cumulative_revenue: winRunningSum("amount"),
      deal_number: winRunningCount(),
      running_avg_deal: winRunningAvg("amount")
    })

  // Lag/lead comparison
  comparison = tableWindow(sales |> tableSortBy("date"),
    {order: "date"},
    {
      prev_amount: winLag("amount", 1, 0),
      next_amount: winLead("amount", 1, 0)
    })
    |> tableDerive({change_from_prev: fn(r) r.amount - r.prev_amount})

  // Moving average with running bounds
  smoothed = tableWindow(sales |> tableSortBy("date"),
    {order: "date"},
    {
      ma_3: winMovingAvg("amount", 3),
      running_min: winRunningMin("amount"),
      running_max: winRunningMax("amount")
    })

  // First and last hire per department
  hire_bounds = tableWindow(employees,
    {partition: "department", order: "hire_date"},
    {
      first_hired: winFirstValue("name"),
      last_hired: winLastValue("name")
    })

  print(ranked)
  print(perf_ranked)
  print(running)
}
```

## Window Function Reference

All 16 window functions available in Tova:

### Ranking

| Function | Description |
|----------|-------------|
| `winRowNumber()` | Sequential number in partition (1, 2, 3, ...) |
| `winRank()` | Rank with gaps for ties (1, 2, 2, 4) |
| `winDenseRank()` | Rank without gaps (1, 2, 2, 3) |
| `winPercentRank()` | Relative rank as a fraction (0.0 to 1.0) |
| `winNtile(n)` | Divide into n equal-sized buckets |

### Offset

| Function | Description |
|----------|-------------|
| `winLag(col, offset?, default?)` | Value from a previous row (default offset: 1) |
| `winLead(col, offset?, default?)` | Value from a following row (default offset: 1) |
| `winFirstValue(col)` | First value in the partition |
| `winLastValue(col)` | Last value in the partition |

### Running Aggregates

| Function | Description |
|----------|-------------|
| `winRunningSum(col)` | Cumulative sum from first row to current |
| `winRunningCount()` | Cumulative count (1, 2, 3, ...) |
| `winRunningAvg(col)` | Cumulative average from first row to current |
| `winRunningMin(col)` | Smallest value seen so far |
| `winRunningMax(col)` | Largest value seen so far |

### Sliding Window

| Function | Description |
|----------|-------------|
| `winMovingAvg(col, n)` | Average over the last n rows |

### `table_window` Options

| Option | Type | Description |
|--------|------|-------------|
| `partition` | String | Column name to partition by (optional -- omit to treat the whole table as one partition) |
| `order` | String | Column name to sort by within each partition (optional) |
| `desc` | Bool | If true, sort in descending order (default: false) |

## Window Functions vs Group By

Choosing between `table_window` and `table_group_by` + `table_agg` depends on whether you need to keep individual rows:

| | `table_group_by` + `table_agg` | `table_window` |
|---|---|---|
| **Rows** | Collapses to one per group | Keeps every row |
| **Use case** | Summary reports, totals | Rankings, running totals, row comparisons |
| **Result size** | Fewer rows than input | Same number of rows as input |
| **Example** | Average salary per department | Salary rank within department |

A good rule of thumb: if your output should have the same number of rows as the input, use `table_window`. If you want a summary with fewer rows, use `table_group_by` with `table_agg`.

## Try It Yourself

1. **Top earner per department.** Use `winRowNumber()` with `partition: "department"` and `order: "salary"` (desc) to rank employees, then filter for `rank_in_dept == 1` to get only the highest-paid person in each department.

2. **Month-over-month change.** Sort sales by date and use `winLag("amount", 1, 0)` to get the previous deal amount. Derive a `pct_change` column that computes `(amount - prev_amount) / prev_amount * 100`.

3. **Salary deciles.** Use `winNtile(10)` to split employees into 10 groups by salary. Derive a label like "Top 10%", "Top 20%", etc.

4. **Running total by region.** Partition sales by `region`, order by `date`, and compute `winRunningSum("amount")` to see how revenue accumulates over time within each region.

5. **5-deal moving average.** Use `winMovingAvg("amount", 5)` on sales sorted by date. Compare the smoothed trend against the raw amounts to spot outliers.

---

Next: [Data Cleaning](./data-cleaning)
