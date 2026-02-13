# Advanced Reactivity

This page covers the advanced reactive APIs in Lux, including DOM refs, context, watchers, error boundaries, dynamic components, portals, lazy loading, and the rendering API.

## createRef

`createRef` creates a mutable reference object with a `current` property. It is primarily used to obtain references to DOM elements:

```lux
component FocusInput {
  input_ref = createRef()

  onMount(fn() {
    input_ref.current.focus()
  })

  <input ref={input_ref} placeholder="Auto-focused" />
}
```

After the component renders, `input_ref.current` points to the actual DOM `<input>` element. You can use it to call DOM methods like `focus()`, `scrollIntoView()`, or read properties like `offsetWidth`.

### Ref with Initial Value

You can pass an initial value to `createRef`:

```lux
counter_ref = createRef(0)
print(counter_ref.current)  // 0
counter_ref.current = 5
print(counter_ref.current)  // 5
```

When called without an argument, `current` defaults to `null`.

::: warning
Refs are **not reactive**. Changing `ref.current` does not trigger effects or re-render components. Use signals for reactive values and refs for imperative DOM access.
:::

## Context (provide / inject)

Context provides a way to pass data down the component tree without threading props through every intermediate component. It is tree-based -- values are stored on the ownership tree and `inject` walks up the tree to find the nearest provider.

### Creating a Context

```lux
// Create a context with a default value
theme_ctx = createContext("light")
locale_ctx = createContext("en")
```

`createContext(defaultValue)` returns a context object. The default value is used when no provider is found in the tree.

### Providing Values

Use `provide` inside a component to supply a value to all descendants:

```lux
component App {
  state theme = "dark"

  // All descendants of App can inject theme_ctx
  provide(theme_ctx, theme)

  <div class={theme}>
    <Header />
    <Main />
    <Footer />
  </div>
}
```

The provided value can be a signal getter, a plain value, an object, or anything else.

### Injecting Values

Use `inject` in a descendant component to retrieve the nearest provided value:

```lux
component ThemedButton(label) {
  theme = inject(theme_ctx)

  <button class="btn-{theme}">{label}</button>
}
```

`inject` walks up the ownership tree from the current component. If it finds a provider for the given context, it returns that value. If no provider is found, it returns the context's default value.

### Full Context Example

```lux
client {
  // Define contexts
  theme_ctx = createContext("light")
  user_ctx = createContext(nil)

  component App {
    state theme = "light"
    state user = { name: "Alice", role: "admin" }

    provide(theme_ctx, theme)
    provide(user_ctx, user)

    <div>
      <button on:click={fn() {
        theme = if theme == "light" { "dark" } else { "light" }
      }}>
        Toggle Theme
      </button>
      <UserProfile />
    </div>
  }

  component UserProfile {
    user = inject(user_ctx)
    theme = inject(theme_ctx)

    <div class="profile profile-{theme}">
      <h2>{user.name}</h2>
      <p>Role: {user.role}</p>
    </div>
  }
}
```

## watch

`watch` observes a reactive expression and calls a callback whenever the value changes. Unlike effects, which re-run their entire body, `watch` separates the tracked expression from the side-effect callback:

```lux
client {
  state count = 0

  // Watch count and log changes
  stop = watch(fn() count, fn(new_val, old_val) {
    print("Count changed from {old_val} to {new_val}")
  })

  // Later, stop watching
  stop()
}
```

### Parameters

```
watch(getter, callback, options?)
```

- **getter** -- a function that returns the value to watch (dependencies are tracked here)
- **callback** -- called with `(newValue, oldValue)` when the watched value changes
- **options** -- optional object:
  - `immediate: true` -- call the callback immediately with the initial value (oldValue will be `undefined`)

### Immediate Mode

By default, the callback is not called with the initial value. Use `immediate: true` to invoke it right away:

```lux
watch(fn() user.name, fn(name, prev) {
  print("Name is now: {name}")
}, { immediate: true })
// Prints immediately: "Name is now: Alice"
```

### Watching Derived Values

You can watch any reactive expression, including computed values or complex expressions:

```lux
watch(fn() len(items), fn(count, prev_count) {
  if count > prev_count {
    print("{count - prev_count} items added")
  } else {
    print("{prev_count - count} items removed")
  }
})
```

### Dispose

`watch` returns a dispose function. Call it to stop watching:

```lux
unwatch = watch(fn() route, fn(new_route, _) {
  analytics.track("page_view", new_route.path)
})

// Stop tracking page views
unwatch()
```

## untrack

`untrack` runs a function without tracking any signal reads. This lets you read a signal inside a reactive context without creating a dependency on it:

```lux
client {
  state count = 0
  state label = "Counter"

  effect {
    // count is tracked — this effect re-runs when count changes
    // label is NOT tracked — changes to label don't trigger this effect
    current_label = untrack(fn() label)
    print("{current_label}: {count}")
  }
}
```

`untrack` is useful when you want to read a signal's value for reference but do not want the containing effect/computed to re-run when that signal changes.

### Use Cases

```lux
// Log the current count without re-logging on every count change
effect {
  print("Name: {name}")
  // Read count for logging but don't re-trigger on count changes
  print("  (current count: {untrack(fn() count)})")
}
```

```lux
// Use a configuration signal without tracking it
effect {
  data = server.fetch(url)
  config = untrack(fn() app_config)
  process_data(data, config)
}
```

## Error Boundaries

Error boundaries catch errors in reactive code and display fallback UI instead of crashing the entire application.

### createErrorBoundary

`createErrorBoundary()` returns an object with:
- **error** -- a signal getter that returns the current error (or `null` if no error)
- **run(fn)** -- executes a function within the error boundary; if it throws, the error signal is set
- **reset()** -- clears the error signal, allowing recovery

```lux
component SafeWidget {
  boundary = createErrorBoundary()

  onMount(fn() {
    boundary.run(fn() {
      // Code that might throw
      result = risky_operation()
    })
  })

  if boundary.error != nil {
    <div class="error">
      <p>Something went wrong: {boundary.error}</p>
      <button on:click={fn() boundary.reset()}>Try Again</button>
    </div>
  } else {
    <Widget />
  }
}
```

### ErrorBoundary Component

`ErrorBoundary` is a built-in component that wraps children in an error boundary. It accepts a `fallback` prop -- either a vnode or a function that receives `{ error, reset }`:

```lux
component App {
  <ErrorBoundary fallback={fn(props) {
    <div class="error">
      <p>Error: {props.error}</p>
      <button on:click={fn() props.reset()}>Retry</button>
    </div>
  }}>
    <RiskyComponent />
  </ErrorBoundary>
}
```

When an error occurs in a reactive effect within the `ErrorBoundary`'s children, the fallback UI is displayed instead. Calling `reset` clears the error and re-renders the children.

## Dynamic Component

`Dynamic` renders a component dynamically based on a reactive signal. This is useful when the component to render is determined at runtime:

```lux
client {
  state current_view = HomePage

  component App {
    <nav>
      <button on:click={fn() current_view = HomePage}>Home</button>
      <button on:click={fn() current_view = AboutPage}>About</button>
      <button on:click={fn() current_view = ContactPage}>Contact</button>
    </nav>
    <Dynamic component={current_view} />
  }
}
```

The `component` prop can be a signal getter that returns a component function. When it changes, `Dynamic` automatically switches to the new component.

Additional props are passed through to the rendered component:

```lux
<Dynamic component={current_tab} user={user} on_close={handle_close} />
```

## Portal

`Portal` renders its children into a different DOM node, outside the normal component tree. This is useful for modals, tooltips, and overlays that need to escape their parent's CSS stacking context:

```lux
component Modal(title, on_close) {
  <Portal target="#modal-root">
    <div class="modal-overlay" on:click={fn() on_close()}>
      <div class="modal" on:click={fn(e) e.stopPropagation()}>
        <h2>{title}</h2>
        <div class="modal-body">{children}</div>
        <button on:click={fn() on_close()}>Close</button>
      </div>
    </div>
  </Portal>
}
```

The `target` prop accepts a CSS selector string (like `"#modal-root"` or `"body"`) or a DOM element reference. The children are rendered into that target node via `queueMicrotask`, ensuring the target element exists in the DOM.

Make sure the target element exists in your HTML:

```html
<body>
  <div id="app"></div>
  <div id="modal-root"></div>
</body>
```

## lazy (Code Splitting)

`lazy` enables async component loading, which is essential for code splitting. It takes a loader function that returns a promise (typically a dynamic `import()`):

```lux
// Define a lazy component
HeavyChart = lazy(fn() import("./components/HeavyChart.js"))

component Dashboard {
  <div>
    <h1>Dashboard</h1>
    <HeavyChart fallback={<p>Loading chart...</p>} />
  </div>
}
```

### How It Works

1. The first time the lazy component renders, the loader function is called
2. While the module is loading, the `fallback` prop is displayed (if provided)
3. Once loaded, the default export (or the module itself) is used as the component
4. Subsequent renders use the cached component -- the loader only runs once

### Error Handling

If the loader fails, an error message is displayed:

```lux
HeavyComponent = lazy(fn() import("./HeavyComponent.js"))

// If the import fails, a <span class="lux-error"> is rendered
// with the error message
<HeavyComponent fallback={<p>Loading...</p>} />
```

## mount

`mount` renders a component into a DOM container, replacing any existing content:

```lux
mount(App, document.getElementById("app"))
```

`mount(component, container)`:
1. Creates a reactive ownership root (`createRoot`)
2. Calls the component function to produce vnodes
3. Clears the container's innerHTML
4. Renders the vnodes into real DOM and appends to the container
5. Returns a dispose function to tear down the reactive tree

```lux
// Manual mount with dispose
dispose = mount(App, document.getElementById("app"))

// Later, tear down the app
dispose()
```

::: tip
If you define a component named `App`, Lux automatically generates a `DOMContentLoaded` handler that calls `mount(App, document.getElementById("app") || document.body)`. You typically do not need to call `mount` yourself.
:::

## hydrate

`hydrate` attaches reactivity to server-rendered HTML without re-rendering from scratch:

```lux
hydrate(App, document.getElementById("app"))
```

`hydrate(component, container)`:
1. Creates a reactive ownership root
2. Calls the component function to produce the vnode tree
3. Walks the existing DOM nodes alongside the vnode tree, attaching event handlers, reactive props, and effects to the existing elements
4. For dynamic blocks (conditionals, loops), inserts comment-node markers and sets up reactive effects

Hydration is used for server-side rendering (SSR) -- the server renders static HTML, and the client hydrates it to make it interactive without a full re-render.

## createRoot

`createRoot` creates an ownership root for reactive primitives. All signals, effects, and computed values created inside the root are tracked and can be disposed together:

```lux
dispose = createRoot(fn(dispose) {
  state = createSignal(0)
  // ... create effects, computeds, etc.

  // Return dispose for later use, or call it to tear down
  dispose
})

// Later:
dispose()  // Disposes all reactive primitives created in the root
```

`createRoot` is used internally by `mount` and `hydrate`. You typically use it directly when you need manual control over a reactive scope outside of components, such as in tests or when integrating Lux's reactivity with non-Lux code.

### Ownership Hierarchy

Roots form a tree. A root created inside another root becomes its child. When a parent root is disposed, all child roots are disposed in reverse order:

```
Root (App mount)
  +-- Component A (owner)
  |     +-- Effect 1
  |     +-- Effect 2
  +-- Component B (owner)
        +-- Computed 1
        +-- Effect 3
```

Disposing the top-level root disposes everything: Component B's Effect 3 and Computed 1 first, then Component A's Effect 2 and Effect 1.

## Summary

| API | Purpose |
|---|---|
| `createRef(initial?)` | Mutable reference, typically for DOM elements |
| `createContext(default)` | Create a context for tree-based data passing |
| `provide(ctx, value)` | Supply a context value to descendants |
| `inject(ctx)` | Retrieve the nearest context value |
| `watch(getter, cb, opts?)` | Watch a reactive expression with old/new values |
| `untrack(fn)` | Read signals without tracking dependencies |
| `createErrorBoundary()` | Programmatic error boundary (`error`, `run`, `reset`) |
| `ErrorBoundary({ fallback })` | Component-based error boundary |
| `Dynamic({ component })` | Render a dynamically-selected component |
| `Portal({ target })` | Render children into a different DOM node |
| `lazy(loader)` | Async component loading for code splitting |
| `mount(component, container)` | Render and mount a component to the DOM |
| `hydrate(component, container)` | Attach reactivity to server-rendered HTML |
| `createRoot(fn)` | Create an ownership root for manual control |
