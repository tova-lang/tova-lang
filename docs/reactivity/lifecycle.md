# Lifecycle

Tova provides lifecycle hooks that let you run code at specific points in a component's or effect's life. These hooks integrate with the reactive ownership system to ensure proper cleanup and resource management.

## onMount

`onMount` runs a function after the component has been mounted to the DOM. It executes asynchronously via `queueMicrotask`, ensuring the DOM elements are available:

```tova
component AutoFocusInput {
  ref = createRef()

  onMount(fn() {
    ref.current.focus()
  })

  <input ref={ref} placeholder="Type here..." />
}
```

### When It Runs

`onMount` fires once after the component's initial render is committed to the DOM. It does not re-run on subsequent state changes -- it is a one-time initialization hook.

### Mount Cleanup

`onMount` can return a cleanup function. If the callback returns a function, that function is registered as a cleanup on the component's owner and runs when the component is disposed:

```tova
component KeyboardListener {
  state last_key = ""

  onMount(fn() {
    handler = fn(e) { last_key = e.key }
    document.addEventListener("keydown", handler)

    // Return cleanup — runs when component unmounts
    fn() {
      document.removeEventListener("keydown", handler)
    }
  })

  <p>Last key pressed: {last_key}</p>
}
```

This pattern is useful for setting up event listeners, timers, subscriptions, or other resources that need cleanup.

### Common Use Cases

```tova
component Chart(data) {
  ref = createRef()

  onMount(fn() {
    // Initialize a third-party library
    chart = ThirdPartyChart.new(ref.current, { data: data })

    // Return cleanup to destroy the chart instance
    fn() {
      chart.destroy()
    }
  })

  <div ref={ref} class="chart-container" />
}
```

```tova
component Timer {
  state elapsed = 0

  onMount(fn() {
    id = setInterval(fn() { elapsed += 1 }, 1000)
    fn() { clearInterval(id) }
  })

  <p>Elapsed: {elapsed}s</p>
}
```

## onUnmount

`onUnmount` registers a function to run when the component's owner is disposed -- typically when the component unmounts from the DOM:

```tova
component WebSocketChat(room_id) {
  state messages = []

  ws = nil

  onMount(fn() {
    ws = WebSocket.new("wss://example.com/chat/{room_id}")
    ws.onmessage = fn(e) {
      messages = [...messages, JSON.parse(e.data)]
    }
  })

  onUnmount(fn() {
    if ws != nil {
      ws.close()
    }
  })

  <div class="chat">
    for msg in messages {
      <p>{msg.text}</p>
    }
  </div>
}
```

### Difference from onMount Cleanup

Both `onMount` returning a cleanup function and `onUnmount` register cleanup on the component's owner. The practical difference is:
- **onMount cleanup** -- ties the cleanup directly to the setup in onMount, keeping related code together
- **onUnmount** -- standalone cleanup hook, useful when cleanup logic is independent of mount setup or when you want to register cleanup from elsewhere in the component body

Both approaches are valid. Choose whichever keeps your code clearest.

## onCleanup

`onCleanup` registers a cleanup function on the **current effect**. It is designed for use inside `effect { }` blocks rather than at the component level:

```tova
component PollingComponent(url) {
  state data = nil

  effect {
    id = setInterval(fn() {
      data = server.fetch_data(url)
    }, 5000)

    onCleanup(fn() {
      clearInterval(id)
    })
  }

  if data != nil {
    <DataView data={data} />
  } else {
    <p>Loading...</p>
  }
}
```

### When onCleanup Runs

The cleanup function registered with `onCleanup` runs in two situations:

1. **Before the effect re-runs** -- when a dependency changes and the effect is about to re-execute, all registered cleanups run first
2. **When the effect is disposed** -- when the owning component unmounts or the effect is otherwise destroyed

This makes `onCleanup` essential for effects that set up resources:

```tova
component EventTracker(event_name) {
  state count = 0

  effect {
    handler = fn() { count += 1 }
    document.addEventListener(event_name, handler)
    onCleanup(fn() {
      document.removeEventListener(event_name, handler)
    })
  }

  <p>"{event_name}" fired {count} times</p>
}
```

When `event_name` changes (it is a reactive prop), the effect re-runs. Before re-running, the cleanup removes the old event listener. Then the effect sets up a new listener for the new event name.

### Multiple Cleanups in One Effect

You can call `onCleanup` multiple times within a single effect. All registered cleanup functions run in reverse order:

```tova
effect {
  // Resource A
  timer_a = setInterval(fn() { update_a() }, 1000)
  onCleanup(fn() { clearInterval(timer_a) })

  // Resource B
  timer_b = setInterval(fn() { update_b() }, 2000)
  onCleanup(fn() { clearInterval(timer_b) })

  // Cleanup order: timer_b first, then timer_a (reverse registration order)
}
```

## Lifecycle in the Ownership Tree

All lifecycle hooks participate in Tova's ownership system. When a component or root is disposed, cleanup runs in reverse order through the ownership tree:

```tova
component Parent {
  state show_child = true

  onUnmount(fn() { print("Parent unmounted") })

  <div>
    if show_child {
      <Child />
    }
    <button on:click={fn() show_child = not show_child}>Toggle</button>
  </div>
}

component Child {
  onMount(fn() {
    print("Child mounted")
    fn() { print("Child mount-cleanup") }
  })

  onUnmount(fn() { print("Child unmounted") })

  <p>Child component</p>
}
```

When `show_child` changes from `true` to `false`, the `Child` component's owner is disposed, which triggers its `onUnmount` callback and the cleanup returned from `onMount`.

## Comparing the Three Hooks

| Hook | Scope | Runs When | Re-runs? | Use Case |
|---|---|---|---|---|
| `onMount(fn)` | Component | After first DOM render | No (once) | DOM setup, third-party libraries, initial data fetch |
| `onUnmount(fn)` | Component | When component is disposed | No (once) | Final cleanup, disconnect, save state |
| `onCleanup(fn)` | Current effect | Before effect re-run or disposal | Yes (each re-run) | Timer cleanup, listener removal, cancellation |

## Practical Example

A component that ties together all three lifecycle hooks:

```tova
component LiveSearch(api_endpoint) {
  state query = ""
  state results = []
  state loading = false
  ref = createRef()

  // onMount: focus the input and load initial results
  onMount(fn() {
    ref.current.focus()
    results = server.search(api_endpoint, "")
  })

  // onUnmount: log analytics
  onUnmount(fn() {
    print("LiveSearch component unmounted")
  })

  // effect with onCleanup: debounced search
  effect {
    current_query = query
    timeout = setTimeout(fn() {
      loading = true
      results = server.search(api_endpoint, current_query)
      loading = false
    }, 300)

    // Clean up the timeout if query changes before it fires
    onCleanup(fn() {
      clearTimeout(timeout)
    })
  }

  <div class="live-search">
    <input ref={ref} bind:value={query} placeholder="Search..." />
    if loading {
      <p>Searching...</p>
    } else {
      <ul>
        for result in results key={result.id} {
          <li>{result.name}</li>
        }
      </ul>
    }
  </div>
}
```
