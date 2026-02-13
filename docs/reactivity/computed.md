# Computed Values

Computed values are derived reactive values that automatically recalculate when their dependencies change. They are declared with the `computed` keyword and provide a clean way to express values that depend on other reactive state.

## Basic Computed Values

Use `computed` to declare a value derived from one or more signals:

```tova
client {
  state count = 0
  computed doubled = count * 2
  computed tripled = count * 3
  computed message = "Count is {count}"
}
```

A computed value automatically tracks which signals it reads. When any of those signals change, the computed value is marked as dirty and will be recalculated the next time it is read.

## Reading Computed Values

Reading a computed value works exactly like reading a signal -- just use the variable name:

```tova
client {
  state price = 100
  state tax_rate = 0.08
  computed total = price * (1 + tax_rate)

  component Receipt {
    <div>
      <p>Price: ${price}</p>
      <p>Tax: ${price * tax_rate}</p>
      <p>Total: ${total}</p>
    </div>
  }
}
```

Computed values are **read-only**. You cannot assign to a computed value -- it is always derived from its expression.

## Memoization

Computed values are memoized. The computation only re-runs when a dependency actually changes, not every time the value is read:

```tova
client {
  state items = [1, 2, 3, 4, 5]
  state filter_text = ""

  // This expensive filter only re-runs when items or filter_text changes,
  // not every time a component reads filtered_items
  computed filtered_items = [
    item for item in items
    if to_string(item) |> contains(filter_text)
  ]
}
```

If `filtered_items` is read by multiple effects or components, the filtering computation runs only once per change -- subsequent reads return the cached result.

## Glitch-Free Consistency

Tova's computed values use a pull-based evaluation model that guarantees glitch-free reads. This means you never observe an inconsistent or stale intermediate state:

```tova
client {
  state first = "Alice"
  state last = "Smith"
  computed full_name = "{first} {last}"

  effect {
    // This always sees a consistent full_name.
    // It never sees "Alice Smith" after first is set to "Bob"
    // but before full_name recalculates.
    print(full_name)
  }
}
```

When a source signal changes, computed values are marked dirty synchronously (propagating through the dependency graph), but the actual recalculation is deferred until the computed value is next read. Effects that depend on computed values will read the fresh value when they execute.

## Computed with Expressions

Computed values can use any Tova expression, including complex logic:

```tova
client {
  state items = []
  state show_completed = false

  computed visible_items = if show_completed {
    items
  } else {
    [item for item in items if not item.completed]
  }

  computed item_count = len(visible_items)
  computed has_items = item_count > 0
}
```

## Computed with Match

Pattern matching works inside computed declarations, providing a clean way to derive values from state:

```tova
client {
  state score = 85

  computed grade = match score {
    90..=100 => "A"
    80..90 => "B"
    70..80 => "C"
    60..70 => "D"
    _ => "F"
  }

  component ScoreCard {
    <div>
      <p>Score: {score}</p>
      <p>Grade: {grade}</p>
    </div>
  }
}
```

## Chained Computed Values

Computed values can depend on other computed values, forming a dependency chain:

```tova
client {
  state cart_items = []

  computed subtotal = cart_items
    |> map(fn(item) item.price * item.quantity)
    |> sum()

  computed tax = subtotal * 0.08

  computed shipping = if subtotal > 50 { 0 } else { 5.99 }

  computed total = subtotal + tax + shipping
}
```

When `cart_items` changes, `subtotal` is marked dirty, which marks `tax`, `shipping`, and `total` as dirty. When any of these values is read (by an effect, component, or another computed), it recalculates from the bottom up in dependency order.

## Computed Values in Components

Components can declare local computed values alongside local state:

```tova
component SearchBar(items) {
  state query = ""

  computed results = [
    item for item in items
    if contains(lowercase(item.name), lowercase(query))
  ]

  computed result_count = len(results)

  <div>
    <input bind:value={query} placeholder="Search..." />
    <p>{result_count} results</p>
    <ul>
      for result in results {
        <li>{result.name}</li>
      }
    </ul>
  </div>
}
```

## Under the Hood: createComputed

The `computed` keyword is syntactic sugar for `createComputed`. When you write:

```tova
computed doubled = count * 2
```

The compiler generates:

```javascript
const doubled = createComputed(() => count() * 2);
```

`createComputed(fn)` returns a getter function that:

1. **Tracks dependencies** -- during the initial computation (and each recomputation), it records which signals were read
2. **Marks dirty on change** -- when any dependency's value changes, the computed is marked dirty and the dirty flag propagates downstream to dependent computeds and effects
3. **Recomputes on read** -- the function only re-runs when the computed is dirty and is being read, making it lazy/pull-based
4. **Caches the result** -- if nothing has changed, reading returns the cached value without recomputing

This lazy evaluation model means computed values that are not currently being read by any effect or component do not waste cycles recalculating.

## Summary

| Concept | Syntax | Description |
|---|---|---|
| Declare | `computed x = expr` | Create a derived reactive value |
| Read | `x` | Get the current value (auto-tracks, triggers recompute if dirty) |
| Memoized | Automatic | Only recalculates when dependencies change |
| Glitch-free | Automatic | Never exposes stale intermediate values |
| Read-only | By design | Cannot be assigned to -- always derived from its expression |
| Generated | `createComputed(() => expr)` | The underlying runtime API |
