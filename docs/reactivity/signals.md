# Signals (State)

Signals are the foundational reactive primitive in Tova. A signal holds a value and automatically notifies anything that depends on it when that value changes. In Tova, you create signals with the `state` keyword inside `browser { }` blocks or components.

## Declaring State

Use `state` to declare a reactive signal:

```tova
browser {
  state count = 0
  state name = "World"
  state logged_in = false
}
```

Each `state` declaration creates a signal with the given initial value. The variable name becomes both the getter (for reading) and the target (for writing) -- the compiler handles the transformation automatically.

## Reading Signals

Reading a signal is as simple as using the variable name. Tova transparently calls the underlying getter function:

```tova
browser {
  state count = 0

  // Reading in an expression
  doubled = count * 2

  // Reading in a template string
  print("Count is {count}")

  // Reading in JSX
  component App {
    <p>{count}</p>
  }
}
```

Any reactive context (effect, computed value, or JSX expression) that reads a signal automatically subscribes to it. When the signal changes, those subscribers re-run.

## Writing Signals

Assign to the signal variable to update its value:

```tova
browser {
  state count = 0

  // Direct assignment
  count = 5

  // Compound assignment
  count += 1
  count -= 1
  count *= 2
}
```

The compiler transforms these assignments into setter calls:

| Tova Code | Generated JavaScript |
|---|---|
| `count = 5` | `setCount(5)` |
| `count += 1` | `setCount(__tova_p => __tova_p + 1)` |
| `count -= 3` | `setCount(__tova_p => __tova_p - 3)` |

Compound assignments (`+=`, `-=`, `*=`, `/=`, `%=`) use functional updates under the hood, meaning the setter receives a function of the previous value. This ensures correctness even during batched updates.

## Functional Updates

When the new value depends on the previous value, the compiler generates functional update forms automatically:

```tova
browser {
  state items = []

  // Append an item — the compiler sees the self-reference and generates
  // setItems(__tova_p => [...__tova_p, new_item])
  items = [...items, new_item]
}
```

The runtime's `createSignal` setter accepts either a plain value or a function. If a function is passed, it receives the current value and returns the new one:

```javascript
// Under the hood
function setter(newValue) {
  if (typeof newValue === 'function') {
    newValue = newValue(currentValue);
  }
  // ... update and notify
}
```

## Type Annotations

You can annotate the type of a signal for documentation and clarity:

```tova
browser {
  state items: [String] = []
  state count: Int = 0
  state user: User = User("Alice", "alice@example.com")
  state selected: String? = nil
}
```

Type annotations appear between the variable name and the `=` sign, following Tova's standard type annotation syntax.

## Signals in Event Handlers

Signals are commonly updated from event handlers in JSX. The lambda syntax `fn()` creates a handler that writes to the signal:

```tova
component Counter {
  state count = 0

  <div>
    <p>{count}</p>
    <button on:click={fn() count += 1}>Increment</button>
    <button on:click={fn() count -= 1}>Decrement</button>
    <button on:click={fn() count = 0}>Reset</button>
  </div>
}
```

## Equality Check

Signals only notify subscribers when the value actually changes. The runtime uses strict equality (`!==`) to compare the old and new values:

```tova
browser {
  state count = 5
  count = 5    // No update — value hasn't changed, subscribers don't re-run
  count = 6    // Subscribers re-run — value changed from 5 to 6
}
```

This avoids unnecessary work when setting a signal to its current value.

## Under the Hood: createSignal

The `state` keyword is syntactic sugar for `createSignal`. When you write:

```tova
state count = 0
```

The compiler generates:

```javascript
const [count, setCount] = createSignal(0);
```

`createSignal(initialValue)` returns a two-element array:
- **getter** -- a function that returns the current value and tracks the caller as a subscriber
- **setter** -- a function that updates the value and notifies all subscribers

When the setter is called and the value has changed, all dependent effects are scheduled. By default, effects flush synchronously after each setter call (unless inside a `batch()`).

## Signals Inside Components

Components can have their own local signals. These are scoped to the component and not visible outside:

```tova
component TodoInput(on_add) {
  state text = ""

  <div>
    <input bind:value={text} />
    <button on:click={fn() {
      on_add(text)
      text = ""
    }}>Add</button>
  </div>
}
```

Each instance of the component gets its own independent signal. The signal is created when the component mounts and disposed when it unmounts.

## Multiple Signals

A component or browser block can have any number of signals:

```tova
component RegistrationForm {
  state username = ""
  state email = ""
  state password = ""
  state agree_to_terms = false
  state errors: [String] = []

  <form on:submit={fn(e) {
    e.preventDefault()
    handle_submit()
  }}>
    <input bind:value={username} placeholder="Username" />
    <input bind:value={email} placeholder="Email" />
    <input type="password" bind:value={password} placeholder="Password" />
    <label>
      <input type="checkbox" bind:checked={agree_to_terms} />
      I agree to the terms
    </label>
    if len(errors) > 0 {
      <ul class="errors">
        for err in errors {
          <li>{err}</li>
        }
      </ul>
    }
    <button type="submit">Register</button>
  </form>
}
```

## Summary

| Concept | Syntax | Description |
|---|---|---|
| Declare | `state x = value` | Create a reactive signal |
| Read | `x` | Get the current value (auto-tracks) |
| Write | `x = newValue` | Set a new value (notifies subscribers) |
| Compound | `x += 1` | Functional update based on previous value |
| Type | `state x: Type = value` | Optional type annotation |
| Generated | `createSignal(value)` | The underlying runtime API |
