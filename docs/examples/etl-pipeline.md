# ETL Pipeline

This example builds a standalone data pipeline that reads CSV files, cleans and transforms data, joins tables, computes aggregations, and writes results in multiple formats. No server or client blocks — this is Tova as a data engineering tool.

## The Full Application

```tova
type Order {
  order_id: Int
  customer_id: Int
  product_id: Int
  quantity: Int
  price: Float
  order_date: String
  status: String
}

type Product {
  product_id: Int
  name: String
  category: String
  unit_cost: Float
  supplier: String
}

// --- Data Loading ---

raw_orders = read("orders.csv")
raw_products = read("products.csv")

// Quick data exploration
raw_orders |> peek()
raw_orders |> describe()
raw_orders |> schema_of() |> print()

// --- Cleaning Pipeline ---

orders = raw_orders
  |> drop_nil(.customer_id)
  |> drop_nil(.product_id)
  |> fill_nil(.quantity, 1)
  |> fill_nil(.price, 0.0)
  |> cast(.price, Float)
  |> cast(.quantity, Int)
  |> derive(
    .status = .status |> upper() |> trim(),
    .order_date = .order_date |> trim()
  )
  |> where(.status != "CANCELLED")
  |> drop_duplicates(.order_id)
  |> sort_by(.order_date)

products = raw_products
  |> drop_nil(.name)
  |> rename(.unit_cost, .cost)
  |> derive(
    .name = .name |> trim(),
    .category = .category |> lower() |> trim()
  )

// --- Joining ---

order_details = orders
  |> join(products, on: .product_id)
  |> derive(
    .total = .quantity * .price,
    .margin = (.price - .cost) * .quantity
  )

// --- Aggregation ---

by_category = order_details
  |> group_by(.category)
  |> agg(
    order_count: count(),
    total_revenue: sum(.total),
    total_margin: sum(.margin),
    avg_order: mean(.total),
    median_order: median(.total),
    max_order: max(.total),
    min_order: min(.total)
  )
  |> sort_by(.total_revenue, desc: true)

by_customer = order_details
  |> group_by(.customer_id)
  |> agg(
    orders: count(),
    total_spent: sum(.total),
    avg_spent: mean(.total)
  )
  |> sort_by(.total_spent, desc: true)
  |> limit(50)

// --- Pivot / Unpivot ---

monthly_category = order_details
  |> derive(.month = .order_date |> split("-") |> first())
  |> group_by(.month, .category)
  |> agg(revenue: sum(.total))
  |> pivot(index: .month, columns: .category, values: .revenue)

// Unpivot back to long format
monthly_long = monthly_category
  |> unpivot(index: .month, name: "category", value: "revenue")

// --- Streaming for Large Files ---

fn process_large_file(path: String, output_path: String) {
  stream(path, batch: 10000)
    |> each(fn(batch) {
      cleaned = batch
        |> drop_nil(.customer_id)
        |> where(.status != "CANCELLED")
        |> derive(.total = .quantity * .price)

      write(cleaned, output_path, append: true)
    })
}

// --- Output ---

fn main(args: [String]) {
  match args {
    ["full"] => {
      write(order_details, "output/order_details.csv")
      write(by_category, "output/category_summary.json")
      write(by_customer, "output/top_customers.json")
      write(monthly_category, "output/monthly_pivot.csv")
      print("Full pipeline complete. Output written to output/")
    }

    ["summary"] => {
      by_category |> peek()
      by_customer |> peek()
      print("Pipeline summary displayed above")
    }

    ["stream", input, output] => {
      process_large_file(input, output)
      print("Streaming pipeline complete")
    }

    _ => {
      print("Usage:")
      print("  tova run etl.tova full")
      print("  tova run etl.tova summary")
      print("  tova run etl.tova stream <input.csv> <output.csv>")
    }
  }
}
```

## Running It

```bash
# Run the full pipeline — reads, cleans, joins, aggregates, writes
tova run etl.tova full

# Preview aggregation results without writing files
tova run etl.tova summary

# Stream a large file in 10k-row batches
tova run etl.tova stream big_orders.csv cleaned_orders.csv
```

## What This Demonstrates

### Data Exploration

Before transforming data, inspect it:

```tova
raw_orders |> peek()           // Shows first few rows
raw_orders |> describe()       // Column stats: count, mean, min, max, nulls
raw_orders |> schema_of()      // Column names and inferred types
```

These functions print to stdout and pass the table through, so they work inline in pipelines.

### Data Cleaning

The cleaning pipeline chains operations that handle real-world data quality issues:

```tova
orders = raw_orders
  |> drop_nil(.customer_id)           // Remove rows with nil customer
  |> fill_nil(.quantity, 1)           // Default nil quantity to 1
  |> cast(.price, Float)              // Ensure price is numeric
  |> derive(.status = .status |> upper() |> trim())  // Normalize strings
  |> where(.status != "CANCELLED")    // Filter out cancelled
  |> drop_duplicates(.order_id)       // Remove duplicate orders
  |> sort_by(.order_date)             // Sort chronologically
```

Each operation returns a new table — tables are immutable.

### Joining Two Tables

```tova
order_details = orders
  |> join(products, on: .product_id)
  |> derive(
    .total = .quantity * .price,
    .margin = (.price - .cost) * .quantity
  )
```

`join()` performs an inner join by default, matching rows where `.product_id` is equal in both tables. The `derive()` after the join can reference columns from both tables to compute new values.

### Aggregation

```tova
by_category = order_details
  |> group_by(.category)
  |> agg(
    order_count: count(),
    total_revenue: sum(.total),
    avg_order: mean(.total),
    median_order: median(.total)
  )
```

`group_by` partitions the table, and `agg` computes named aggregate values per group. Available functions: `count()`, `sum()`, `mean()`, `median()`, `min()`, `max()`.

### Pivot and Unpivot

Reshape data between wide and long formats:

```tova
// Long → Wide: one column per category, revenue as values
monthly_category
  |> pivot(index: .month, columns: .category, values: .revenue)

// Wide → Long: collapse columns back to rows
monthly_category
  |> unpivot(index: .month, name: "category", value: "revenue")
```

### Streaming Large Files

For files too large to fit in memory, `stream()` processes data in batches:

```tova
stream("huge_file.csv", batch: 10000)
  |> each(fn(batch) {
    cleaned = batch |> drop_nil(.id) |> where(.active == true)
    write(cleaned, "output.csv", append: true)
  })
```

Each `batch` is a table with up to 10,000 rows. The `append: true` option on `write()` adds to the output file without overwriting.

### Multi-Format Output

```tova
write(table, "output.csv")      // CSV
write(table, "output.json")     // JSON array
write(table, "output.jsonl")    // JSON Lines (one object per line)
```

`write()` detects the format from the file extension.

## Key Patterns

**No blocks needed.** Data scripts don't need `shared {}`, `server {}`, or `client {}`. Top-level code runs as a script.

**Column expressions.** `.column_name` compiles to a row-level accessor. Inside `derive()`, `where()`, and `agg()`, column expressions are lambdas that operate on each row.

**Immutable tables.** Every operation returns a new table. The original is never modified. This makes pipelines composable and safe.

**Streaming for scale.** When data doesn't fit in memory, `stream()` with `batch` processes chunks incrementally and `write()` with `append: true` builds the output file incrementally.
