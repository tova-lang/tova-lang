# Stores

Stores encapsulate related reactive state, computed values, and functions into a cohesive unit. They provide a structured way to manage shared application state outside of individual components.

## Declaring a Store

Use the `store` keyword to declare a store:

```lux
client {
  store CounterStore {
    state count = 0

    computed doubled = count * 2

    fn increment() {
      count += 1
    }

    fn decrement() {
      count -= 1
    }

    fn reset() {
      count = 0
    }
  }
}
```

A store can contain:
- **`state`** declarations -- reactive signals
- **`computed`** declarations -- derived reactive values
- **`fn`** declarations -- functions that read and mutate the store's state

## Accessing Store Members

Store members are accessed with dot notation:

```lux
// Reading state (reactive)
print(CounterStore.count)

// Reading computed values (reactive)
print(CounterStore.doubled)

// Calling functions
CounterStore.increment()
CounterStore.reset()
```

Stores use JavaScript getters and setters under the hood, so reading `CounterStore.count` triggers the signal getter (with dependency tracking), and writing `CounterStore.count = 5` triggers the signal setter (with subscriber notification).

## Using Stores in Components

Stores are available to any component in the same client block:

```lux
client {
  store CartStore {
    state items = []

    computed total = items
      |> map(fn(item) item.price * item.quantity)
      |> sum()

    computed item_count = len(items)

    fn add(product, quantity = 1) {
      existing = find(items, fn(i) i.product_id == product.id)
      if existing != nil {
        items = [
          if i.product_id == product.id {
            { ...i, quantity: i.quantity + quantity }
          } else { i }
          for i in items
        ]
      } else {
        items = [...items, {
          product_id: product.id,
          name: product.name,
          price: product.price,
          quantity: quantity
        }]
      }
    }

    fn remove(product_id) {
      items = [i for i in items if i.product_id != product_id]
    }

    fn clear() {
      items = []
    }
  }

  component CartBadge {
    <span class="badge">{CartStore.item_count}</span>
  }

  component CartSummary {
    <div class="cart">
      <h2>Cart ({CartStore.item_count} items)</h2>
      for item in CartStore.items key={item.product_id} {
        <div class="cart-item">
          <span>{item.name} x{item.quantity}</span>
          <span>${item.price * item.quantity}</span>
          <button on:click={fn() CartStore.remove(item.product_id)}>Remove</button>
        </div>
      }
      <p class="total">Total: ${CartStore.total}</p>
      <button on:click={fn() CartStore.clear()}>Clear Cart</button>
    </div>
  }

  component ProductCard(product) {
    <div class="product">
      <h3>{product.name}</h3>
      <p>${product.price}</p>
      <button on:click={fn() CartStore.add(product)}>Add to Cart</button>
    </div>
  }
}
```

Since stores are reactive, components that read store properties automatically re-render when those properties change. `CartBadge` updates whenever `item_count` changes, and `CartSummary` updates whenever `items` or `total` changes.

## Store with Match Expressions

Computed values inside stores can use pattern matching:

```lux
store TodoStore {
  state items = []
  state filter = "all"

  computed visible = match filter {
    "active" => [t for t in items if not t.completed]
    "completed" => [t for t in items if t.completed]
    _ => items
  }

  computed counts = {
    total: len(items),
    active: len([t for t in items if not t.completed]),
    completed: len([t for t in items if t.completed])
  }

  fn add(title) {
    items = [...items, { id: len(items) + 1, title: title, completed: false }]
  }

  fn toggle(id) {
    items = [
      if t.id == id {
        { ...t, completed: not t.completed }
      } else { t }
      for t in items
    ]
  }

  fn remove(id) {
    items = [t for t in items if t.id != id]
  }

  fn clear_completed() {
    items = [t for t in items if not t.completed]
  }
}
```

## Multiple Stores

An application can have multiple stores, each managing a different concern:

```lux
client {
  store AuthStore {
    state user = nil
    state token = nil

    computed is_logged_in = user != nil

    fn login(username, password) {
      result = server.authenticate(username, password)
      user = result.user
      token = result.token
    }

    fn logout() {
      user = nil
      token = nil
    }
  }

  store UIStore {
    state theme = "light"
    state sidebar_open = true

    fn toggle_theme() {
      theme = if theme == "light" { "dark" } else { "light" }
    }

    fn toggle_sidebar() {
      sidebar_open = not sidebar_open
    }
  }

  component App {
    <div class={UIStore.theme}>
      if AuthStore.is_logged_in {
        <Dashboard />
      } else {
        <LoginForm />
      }
    </div>
  }
}
```

Stores can reference each other's public members, enabling coordination between different state domains.

## Under the Hood

When you write:

```lux
store TodoStore {
  state items = []
  computed count = len(items)
  fn add(title) {
    items = [...items, { title: title }]
  }
}
```

The compiler generates an immediately-invoked function expression (IIFE) that creates the signals and returns an object with getters/setters:

```javascript
const TodoStore = (() => {
  const [items, setItems] = createSignal([]);
  const count = createComputed(() => len(items()));

  function add(title) {
    setItems([...items(), { title: title }]);
  }

  return {
    get items() { return items(); },
    set items(v) { setItems(v); },
    get count() { return count(); },
    add,
  };
})();
```

Key aspects of the generated code:
- **State** becomes a signal pair, exposed through a getter (calling the signal) and a setter (calling the signal setter)
- **Computed values** become `createComputed` calls, exposed through a read-only getter
- **Functions** are included directly in the return object and have access to the signals via closure
- The IIFE pattern ensures state and computed names are scoped to the store and do not leak

## Summary

| Concept | Syntax | Description |
|---|---|---|
| Declare | `store Name { ... }` | Create a store with encapsulated state |
| State | `state x = value` | Reactive signal within the store |
| Computed | `computed x = expr` | Derived value within the store |
| Functions | `fn name() { ... }` | Methods that read/mutate store state |
| Read | `Store.x` | Access state or computed (reactive) |
| Write | `Store.x = value` | Update state through the setter |
| Call | `Store.method()` | Invoke a store function |
