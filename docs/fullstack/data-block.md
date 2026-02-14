# Data Block

The `data {}` block is a top-level block alongside `shared`, `server`, and `client`. It provides a declarative home for data source definitions, reusable transform pipelines, validation rules, and refresh policies. Instead of scattering data logic across server functions, the `data {}` block centralizes your data layer in one place.

## Why a Data Block?

Without it, data sources, cleaning pipelines, and validation rules end up spread across server functions. The `data {}` block gives you:

- **Source registry** -- all data sources declared in one place
- **Named pipelines** -- reusable transform chains referenced by name
- **Validation rules** -- per-type constraints declared alongside the data
- **Refresh policies** -- how often sources reload
- **Self-documenting** -- new team members read `data {}` to understand the data flow

## Sources

A `source` declares a named data source. Sources are loaded lazily on first access and cached by default:

```tova
data {
  source customers = read("customers.csv")
  source orders = read("orders.csv")
  source exchange_rates = read("https://api.exchangerate.host/latest")
}
```

### Type Annotations

Add a type annotation to enable compile-time column validation:

```tova
data {
  source customers: Table<Customer> = read("customers.csv")
  source orders: Table<Order> = read("orders.csv")
}
```

### How Sources Compile

Sources compile to lazy-initialized cached getters. The data is loaded once on first access, then cached:

```tova
// This source declaration:
data {
  source customers = read("customers.csv")
}

// Compiles roughly to:
// let __data_customers_cache = null;
// function __data_customers() {
//   if (!__data_customers_cache) {
//     __data_customers_cache = read("customers.csv");
//   }
//   return __data_customers_cache;
// }
```

## Pipelines

A `pipeline` declares a named, reusable transform chain. Pipelines can reference sources and other pipelines:

```tova
data {
  source raw_customers = read("customers.csv")

  pipeline clean = raw_customers
    |> drop_nil(.email)
    |> fill_nil(.spend, 0.0)
    |> derive(
      .name = .name |> trim(),
      .email = .email |> lower()
    )
    |> where(.spend > 0)

  pipeline summary = clean
    |> group_by(.country)
    |> agg(
      count: count(),
      total_spend: sum(.spend),
      avg_spend: mean(.spend)
    )
    |> sort_by(.total_spend, desc: true)
}
```

Pipelines compile to async functions that execute the transform chain when called.

## Validation Rules

The `validate` keyword declares per-type validation rules using column expressions:

```tova
data {
  validate Customer {
    .email |> contains("@"),
    .name |> len() > 0,
    .spend >= 0
  }

  validate Order {
    .quantity > 0,
    .amount > 0
  }
}
```

Each rule is a predicate on a column. The validate block compiles to a validator function that returns `{ valid: true/false, errors: [...] }`:

```tova
// Compiled validator can be called as:
result = __validate_Customer(row)
// result.valid → true or false
// result.errors → ["Validation rule 1 failed", ...]
```

## Refresh Policies

For long-running servers, refresh policies control how often source data is reloaded. Two modes are available:

### Interval Refresh

Reload a source on a timer:

```tova
data {
  source exchange_rates = read("https://api.exchangerate.host/latest")
  refresh exchange_rates every 1.hour

  source customers = read("customers.csv")
  refresh customers every 15.minutes
}
```

Supported time units: `seconds`, `minutes`, `hours` (and their singular forms `second`, `minute`, `hour`).

Interval refresh compiles to a `setInterval` that clears the source cache, so the next access triggers a fresh load.

### On-Demand Refresh

Reload only when explicitly triggered:

```tova
data {
  source orders = read("orders.csv")
  refresh orders on_demand
}
```

This generates a `refresh_orders()` function that clears the cache, letting the next access reload the data.

## Interaction with Other Blocks

Sources and pipelines declared in `data {}` are available in `server {}` and `client {}` blocks by name:

```tova
data {
  source users = read("users.csv")
  pipeline active_users = users |> where(.active)
}

server {
  fn get_active_users() {
    active_users    // references the pipeline directly
  }

  fn get_user(id: Int) {
    users |> find(fn(u) u.id == id)
  }

  route GET "/api/users" => get_active_users
}

client {
  state users = []

  effect {
    users = server.get_active_users()
  }
}
```

## Complete Example

A full data block showing all features together:

```tova
shared {
  type Customer {
    id: Int
    name: String
    email: String
    spend: Float
    country: String
  }
}

data {
  source customers: Table<Customer> = read("customers.csv")
  source orders = read("orders.csv")

  pipeline clean = customers
    |> drop_nil(.email)
    |> fill_nil(.spend, 0.0)
    |> derive(.name = .name |> trim(), .email = .email |> lower())
    |> where(.spend > 0)

  pipeline summary = clean
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

  refresh customers every 10.minutes
  refresh orders on_demand
}

server {
  fn get_customers() { clean }
  fn get_summary() { summary }

  route GET "/api/customers" => get_customers
  route GET "/api/summary" => get_summary
}
```

## Practical Tips

**Put all data definitions in `data {}`.** Keep server functions focused on serving and routing. Data loading, cleaning, and transformation belong in the data block.

**Name your pipelines descriptively.** Pipeline names like `clean_customers` and `top_products` serve as documentation. Other developers can read the `data {}` block to understand the full data flow.

**Use `on_demand` for expensive sources.** If a source is expensive to reload (large file, slow API), use `refresh ... on_demand` and trigger refreshes explicitly instead of on a timer.

**Layer pipelines.** Pipelines can reference other pipelines, so build incrementally: raw data → cleaned → filtered → aggregated. Each step is reusable on its own.
