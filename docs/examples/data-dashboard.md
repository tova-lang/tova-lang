# Data Dashboard

This example builds a full-stack customer analytics dashboard. It demonstrates the complete data layer: reading CSV files, cleaning data, computing aggregations, enriching with AI, and rendering an interactive UI.

## The Full Application

```tova
shared {
  type Customer {
    id: Int
    name: String
    email: String
    spend: Float
    country: String
    active: Bool
  }

  type Sentiment { Positive, Negative, Neutral }
}

data {
  source raw_customers: Table<Customer> = read("customers.csv")

  pipeline customers = raw_customers
    |> drop_nil(.email)
    |> fill_nil(.spend, 0.0)
    |> derive(
      .name = .name |> trim(),
      .email = .email |> lower()
    )
    |> where(.spend > 0)
    |> sort_by(.spend, desc: true)

  pipeline by_country = customers
    |> group_by(.country)
    |> agg(
      count: count(),
      total_spend: sum(.spend),
      avg_spend: mean(.spend)
    )
    |> sort_by(.total_spend, desc: true)

  validate Customer {
    .email |> contains("@"),
    .name |> len() > 0,
    .spend >= 0
  }

  refresh raw_customers every 10.minutes
}

server {
  ai "fast" {
    provider: "anthropic"
    model: "claude-haiku"
    api_key: env("ANTHROPIC_API_KEY")
  }

  fn get_customers() { customers }
  fn get_summary() { by_country }

  fn get_top_customers(n: Int) {
    customers |> limit(n)
  }

  fn search_customers(query: String) {
    customers
      |> where(.name |> lower() |> contains(query |> lower()))
  }

  fn get_insights() {
    customers
      |> limit(100)
      |> derive(
        .segment = fast.classify(
          "Customer spend={.spend}, country={.country}. Classify: budget/mid/premium",
          ["budget", "mid", "premium"]
        )
      )
  }

  route GET "/api/customers" => get_customers
  route GET "/api/summary" => get_summary
}

client {
  state customers: Table<Customer> = Table([])
  state summary = []
  state search = ""
  state loading = true

  computed filtered = customers
    |> where(.name |> lower() |> contains(search |> lower()))

  computed total_spend = customers
    |> agg(total: sum(.spend))

  effect {
    customers = server.get_customers()
    summary = server.get_summary()
    loading = false
  }

  component SearchBar {
    <input
      type="text"
      bind:value={search}
      placeholder="Search customers..."
    />
  }

  component StatsCard(label, value) {
    <div class="stat-card">
      <div class="stat-label">{label}</div>
      <div class="stat-value">{value}</div>
    </div>
  }

  component App {
    <div class="dashboard">
      <h1>"Customer Dashboard"</h1>

      <div class="stats">
        <StatsCard label="Total Customers" value={customers.rows} />
        <StatsCard label="Countries" value={summary.length} />
      </div>

      <SearchBar />

      <h2>"Customers"</h2>
      <table>
        <thead>
          <tr>
            <th>"Name"</th>
            <th>"Email"</th>
            <th>"Country"</th>
            <th>"Spend"</th>
          </tr>
        </thead>
        <tbody>
          {for customer in filtered {
            <tr>
              <td>{customer.name}</td>
              <td>{customer.email}</td>
              <td>{customer.country}</td>
              <td>{"${customer.spend}"}</td>
            </tr>
          }}
        </tbody>
      </table>
    </div>
  }
}
```

## What This Demonstrates

### Data Block

The `data {}` block centralizes all data definitions:

- **`source raw_customers`** loads the CSV file, cached and lazily initialized
- **`pipeline customers`** cleans the raw data: drops nil emails, fills nil spend, trims names, lowercases emails, filters out zero-spend rows
- **`pipeline by_country`** aggregates the cleaned data by country with count, total, and average
- **`validate Customer`** declares validation rules for the Customer type
- **`refresh`** reloads the CSV every 10 minutes

### AI Integration

The `get_insights()` function uses a named AI provider (`fast`) to classify customer segments using the `classify()` method inside a `derive()` pipeline step.

### Server Functions

Server functions reference pipelines by name (`customers`, `by_country`). The `search_customers` function shows how to apply dynamic filters using column expressions.

### Client Reactivity

The client uses `computed` values that automatically update when the search filter changes. The `filtered` computed reruns the `where()` query whenever `search` changes.

## Running It

1. Create a `customers.csv` file with columns: `id`, `name`, `email`, `spend`, `country`, `active`
2. Set the `ANTHROPIC_API_KEY` environment variable (only needed for the insights endpoint)
3. Run the application:

```bash
tova run app.tova
```

## Key Patterns

**Data block for centralization.** All data logic lives in `data {}`. Server functions just reference pipeline names.

**Column expressions in pipelines.** `.name |> trim()` and `.email |> lower()` compile to row-level lambdas automatically.

**AI in derive.** `fast.classify(...)` inside `derive()` enriches each row with AI-generated classifications.

**Reactive filtering.** The `computed filtered` value re-evaluates automatically when `search` changes, giving instant client-side search without server round-trips.

**Type safety across blocks.** The `Customer` type in `shared {}` is used in `data {}` for schema validation, in `server {}` for return types, and in `client {}` for state typing.
