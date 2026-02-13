# Effects

Effects are reactive side effects that automatically re-run when their dependencies change. They are the bridge between the reactive system and the outside world -- use them to update the DOM, make network requests, set up timers, log to the console, or perform any other operation that should happen in response to state changes.

## Basic Effects

Declare an effect with the `effect` keyword:

```lux
client {
  state count = 0

  effect {
    print("Count changed to: {count}")
  }
}
```

The effect body runs immediately when created, and then re-runs every time any signal it reads changes. In this example, the effect reads `count`, so it re-runs whenever `count` is updated.

## Automatic Dependency Tracking

Lux automatically tracks which signals an effect reads. You do not need to declare a dependency list -- the runtime figures it out at execution time:

```lux
client {
  state first = "Alice"
  state last = "Smith"
  state show_full = true

  effect {
    if show_full {
      print("{first} {last}")
    } else {
      print(first)
    }
  }
}
```

When `show_full` is `true`, the effect tracks `show_full`, `first`, and `last`. When `show_full` is `false`, it only tracks `show_full` and `first` (since `last` is never read). Dependencies are re-evaluated on every run, so the tracking is always accurate.

## Effects in Components

Components can have their own local effects:

```lux
component DocumentTitle(title) {
  effect {
    document.title = title
  }

  <div>Content</div>
}
```

Component-scoped effects are automatically disposed when the component unmounts, preventing memory leaks.

## Async Effects with Server Calls

Effects that call server functions (RPC) are automatically wrapped in an async context. The compiler detects `server.xxx()` calls and generates the appropriate async pattern:

```lux
client {
  state users = []

  effect {
    users = server.get_users()
  }
}
```

This compiles to a synchronous effect wrapping an async IIFE. The outer effect captures signal dependencies synchronously, while the async work runs inside:

```javascript
createEffect(() => {
  (async () => {
    setUsers(await rpc("get_users", []));
  })();
});
```

A more complete example with loading and error state:

```lux
component UserList {
  state users = []
  state loading = true
  state error = nil

  effect {
    loading = true
    error = nil
    users = server.fetch_users()
    loading = false
  }

  if loading {
    <p>Loading...</p>
  } elif error != nil {
    <p class="error">{error}</p>
  } else {
    <ul>
      for user in users {
        <li>{user.name}</li>
      }
    </ul>
  }
}
```

## Effect Cleanup

Effects often need to clean up after themselves -- for example, clearing timers, removing event listeners, or cancelling subscriptions. Use `onCleanup` inside an effect to register a cleanup function:

```lux
client {
  state interval_ms = 1000
  state ticks = 0

  effect {
    timer = setInterval(fn() { ticks += 1 }, interval_ms)
    onCleanup(fn() {
      clearInterval(timer)
    })
  }
}
```

The cleanup function runs:
- **Before the effect re-runs** (when a dependency changes)
- **When the effect is disposed** (when the component unmounts or the owner is cleaned up)

This ensures resources are always properly released.

### Return-Based Cleanup

Effects can also return a cleanup function directly. If the effect body returns a function, it is used as the cleanup:

```lux
effect {
  handler = fn(e) { print("Key: {e.key}") }
  document.addEventListener("keydown", handler)

  // Return a cleanup function
  fn() { document.removeEventListener("keydown", handler) }
}
```

Both `onCleanup` and the return-based approach work. Use `onCleanup` when you have multiple cleanup tasks or want to register cleanup at a specific point in the effect body. Use the return approach for simple single-cleanup effects.

## Multiple Cleanups

You can register multiple cleanup functions within a single effect:

```lux
effect {
  // Set up a timer
  timer = setInterval(fn() { tick() }, 1000)
  onCleanup(fn() { clearInterval(timer) })

  // Set up an event listener
  handler = fn() { handle_resize() }
  window.addEventListener("resize", handler)
  onCleanup(fn() { window.removeEventListener("resize", handler) })
}
```

All registered cleanups run in reverse order when the effect re-executes or is disposed.

## Batching with batch()

By default, each signal update triggers an immediate flush of pending effects. If you update multiple signals in sequence, each update flushes independently:

```lux
// Without batching: effects may run up to 3 times
count = 1      // flush
name = "Alice" // flush
items = []     // flush
```

Use `batch` to defer effect execution until all updates are complete:

```lux
batch(fn() {
  count = 1
  name = "Alice"
  items = []
})
// Effects run once after all three updates
```

Batching is useful when you need to update multiple related signals atomically. All signal writes inside the `batch` callback are applied, and effects only flush once the outermost batch ends.

### Nested Batching

Batches can be nested. The flush only happens when the outermost batch completes:

```lux
batch(fn() {
  count = 1
  batch(fn() {
    name = "Alice"
    items = []
  })
  // Effects haven't run yet — still inside outer batch
  status = "updated"
})
// Now all effects run once
```

## Effects and the Ownership Tree

Effects created inside a component or `createRoot` are tracked in the ownership tree. When the owner is disposed, all effects within it are automatically cleaned up:

```lux
component Timer {
  state seconds = 0

  effect {
    id = setInterval(fn() { seconds += 1 }, 1000)
    onCleanup(fn() { clearInterval(id) })
  }

  <p>{seconds} seconds</p>
}
// When Timer unmounts, the effect is disposed and the interval is cleared
```

You do not need to manually dispose effects in components -- the reactive system handles this automatically through the ownership hierarchy.

## Under the Hood: createEffect

The `effect` keyword is syntactic sugar for `createEffect`. When you write:

```lux
effect {
  print(count)
}
```

The compiler generates:

```javascript
createEffect(() => {
  print(count());
});
```

`createEffect(fn)` creates an effect that:

1. **Runs immediately** -- the function executes synchronously on creation
2. **Tracks dependencies** -- during execution, it records which signals were read
3. **Re-runs on change** -- when any tracked signal changes, the effect is scheduled to re-run
4. **Cleans up between runs** -- cleanup functions (from `onCleanup` or the return value) execute before each re-run
5. **Supports disposal** -- the returned effect object has a `dispose()` method and integrates with the ownership tree

### Infinite Loop Protection

The runtime includes protection against infinite loops in reactive updates. If effects trigger more than 100 flush iterations (an effect updating a signal that triggers the same effect), the runtime aborts and logs an error.

## Summary

| Concept | Syntax | Description |
|---|---|---|
| Declare | `effect { ... }` | Run side effects when dependencies change |
| Auto-tracking | Automatic | Dependencies detected at runtime |
| Cleanup | `onCleanup(fn() { ... })` | Register cleanup for current effect |
| Return cleanup | `fn() { ... }` as last expression | Alternative cleanup via return value |
| Batching | `batch(fn() { ... })` | Defer effect execution until batch ends |
| Async | `server.xxx()` in effect | Automatically wrapped in async IIFE |
| Generated | `createEffect(() => { ... })` | The underlying runtime API |
