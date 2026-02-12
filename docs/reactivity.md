# Reactivity

Lux features a fine-grained reactive system inspired by SolidJS. Reactive primitives — signals, computed values, and effects — power the UI and automatically track dependencies.

## Signals (State)

A signal is a reactive value. When it changes, everything that depends on it updates automatically.

```lux
client {
  state count = 0
  state name = "World"
  state items: [String] = []
}
```

`state` declarations compile to `createSignal()` calls. Reading a signal returns its current value; assigning to it updates it:

```lux
// Reading
print(count)        // reads the signal value

// Writing
count = 5           // sets the signal value
count += 1          // compound assignment works too
```

Under the hood, `state count = 0` becomes:

```javascript
const [count, setCount] = createSignal(0);
```

In generated code, reading `count` calls the getter `count()`, and writing calls the setter `setCount(value)`.

### Functional Updates

When the new value depends on the previous value, the compiler generates a functional update:

```lux
count += 1          // setCount(count() + 1)
items = [...items, new_item]   // setItems([...items(), new_item])
```

## Computed Values

Computed values derive from other reactive values and update automatically:

```lux
client {
  state count = 0
  computed doubled = count * 2
  computed message = "Count is {count}"
}
```

Computed values are:
- **Memoized**: cached until a dependency changes
- **Glitch-free**: always consistent, never stale
- **Eager initial**: computed on creation, then re-evaluated when dependencies change

Under the hood, `computed doubled = count * 2` becomes:

```javascript
const doubled = createComputed(() => count() * 2);
```

### Computed with Match

```lux
computed grade = match score {
  90..=100 => "A"
  80..90 => "B"
  70..80 => "C"
  _ => "F"
}
```

## Effects

Effects run side effects when their dependencies change:

```lux
client {
  state count = 0

  effect {
    print("Count changed to: {count}")
  }
}
```

The effect body is wrapped in `createEffect()`. Lux automatically tracks which signals are read inside the effect and re-runs it when any of them change.

### Async Effects

Effects that call server functions are automatically wrapped in async:

```lux
effect {
  users = server.get_users()    // async RPC call
}
```

This compiles to a synchronous effect wrapping an async IIFE (to preserve dependency tracking):

```javascript
createEffect(() => {
  (async () => {
    setUsers(await rpc("get_users", []));
  })();
});
```

### Effect Cleanup

Effects can return a cleanup function that runs before the next execution:

```lux
effect {
  timer = setInterval(fn() { tick() }, 1000)
  onCleanup(fn() { clearInterval(timer) })
}
```

## Batching

Multiple signal updates can be batched to defer effect execution:

```lux
batch(fn() {
  count = 1
  name = "Alice"
  items = []
})
// Effects run once after all updates, not three times
```

## Components

Components are reactive functions that return JSX:

```lux
component Greeting(name) {
  <div>
    <h1>Hello, {name}!</h1>
  </div>
}

component App {
  <div>
    <Greeting name="World" />
  </div>
}
```

### Component Props

Props are passed as attributes and received as parameters:

```lux
component UserCard(user, on_delete) {
  <div class="card">
    <h2>{user.name}</h2>
    <p>{user.email}</p>
    <button on:click={fn() on_delete(user.id)}>Delete</button>
  </div>
}

// Usage:
<UserCard user={current_user} on_delete={handle_delete} />
```

Props are reactive getters — they update when the parent's data changes.

### Component with Local State

```lux
component Counter {
  state count = 0

  <div>
    <p>{count}</p>
    <button on:click={fn() count += 1}>+</button>
  </div>
}
```

Components can have their own `state`, `computed`, and `effect` declarations.

## Stores

Stores encapsulate related reactive state and logic:

```lux
store TodoStore {
  state items: [Todo] = []
  state filter = "all"

  computed visible = match filter {
    "active" => [t for t in items if not t.completed]
    "completed" => [t for t in items if t.completed]
    _ => items
  }

  fn add(title: String) {
    items = [...items, Todo(len(items) + 1, title, false)]
  }

  fn toggle(id: Int) {
    items = [
      if t.id == id { Todo(t.id, t.title, not t.completed) }
      else { t }
      for t in items
    ]
  }
}
```

Store members are accessed with dot notation: `TodoStore.items`, `TodoStore.add("Buy milk")`.

## JSX Syntax

Lux uses JSX-like syntax for UI elements.

### Elements and Attributes

```lux
<div class="container" id="main">
  <h1>Title</h1>
  <img src="/logo.png" alt="Logo" />
</div>
```

### Text Content

JSX text can be written unquoted, just like in React:

```lux
<p>Hello, World!</p>
<p>Count: {count}</p>           // text + expression child — reactive
```

Quoted strings also work and support template interpolation:

```lux
<p>"Hello, World!"</p>
<p>"Count: {count}"</p>         // single reactive template literal
```

Both styles are valid. Unquoted text is split into separate text and expression children, while quoted strings with `{signal}` produce a single reactive template. The end result is the same — text updates when signals change.

> **Note:** The keywords `if`, `for`, `elif`, and `else` are reserved for JSX control flow. To use them as literal text, wrap in a quoted string or expression: `<p>{"Click if you dare"}</p>`.

### Expressions in JSX

Use `{ }` braces for dynamic values:

```lux
<div class={active_class}>
  <span>{user.name}</span>
  <p>{format_date(created_at)}</p>
</div>
```

### Event Handlers

Prefix event names with `on:`:

```lux
<button on:click={fn() count += 1}>Click</button>
<input on:input={fn(e) name = e.target.value} />
<form on:submit={fn(e) { e.preventDefault(); handle_submit() }}>
```

### Two-Way Binding

Use `bind:` for two-way data binding:

```lux
<input bind:value={name} />              // text input
<input type="checkbox" bind:checked={agreed} />  // checkbox
<select bind:value={selected}>           // select dropdown
  <option value="a">Option A</option>
  <option value="b">Option B</option>
</select>
<input type="radio" bind:group={choice} value="x" />  // radio group
```

### Conditional Classes

```lux
<div class:active={is_active} class:error={has_error}>
```

This adds/removes the class based on the boolean expression.

### Spread Attributes

```lux
<button {...button_props}>Click</button>
```

## JSX Control Flow

### Conditional Rendering

```lux
<div>
  if is_logged_in {
    <p>Welcome, {user.name}!</p>
  } elif is_loading {
    <p>Loading...</p>
  } else {
    <p>Please log in</p>
  }
</div>
```

### List Rendering

```lux
<ul>
  for item in items {
    <li>{item.name}</li>
  }
</ul>
```

With keys for efficient reconciliation:

```lux
<ul>
  for item in items key={item.id} {
    <li>{item.name}</li>
  }
</ul>
```

## CSS Scoping

Components can include scoped styles:

```lux
component Button(label) {
  <button class="btn">{label}</button>

  style {
    .btn {
      background: blue;
      color: white;
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
    }
    .btn:hover {
      background: darkblue;
    }
  }
}
```

Styles are scoped to the component using a hash-based scope ID derived from both the component name and the CSS content. The compiler adds `[data-lux-HASH]` attribute selectors to CSS rules and `data-lux-HASH` attributes to elements, preventing style leaks between components.

## Lifecycle Hooks

```lux
component App {
  onMount(fn() {
    print("Component mounted")
  })

  onUnmount(fn() {
    print("Component unmounted")
  })

  onCleanup(fn() {
    print("Cleanup")
  })

  <div>Hello</div>
}
```

## Advanced Reactivity

### createRef

```lux
ref = createRef()

<input ref={ref} />

onMount(fn() {
  ref.current.focus()
})
```

### Context (provide / inject)

```lux
// In parent component
theme_ctx = createContext("light")
provide(theme_ctx, "dark")

// In child component
theme = inject(theme_ctx)
```

### watch

```lux
watch(fn() count, fn(new_val, old_val) {
  print("Changed from {old_val} to {new_val}")
})
```

### untrack

Read a signal without creating a dependency:

```lux
effect {
  // count is tracked, name is NOT tracked
  print("{count} - {untrack(fn() name)}")
}
```

### Error Boundaries

`createErrorBoundary()` returns an object with `error` (signal), `run` (wrapped execution), and `reset`:

```lux
component SafeApp {
  boundary = createErrorBoundary()

  onMount(fn() {
    boundary.run(fn() {
      // Code that might throw
    })
  })

  if boundary.error {
    <div class="error">Error occurred</div>
    <button on:click={fn() boundary.reset()}>Retry</button>
  } else {
    <App />
  }
```

### Dynamic Components

```lux
<Dynamic component={current_component} props={current_props} />
```

### Portal

Render children into a different DOM node:

```lux
<Portal target={document.body}>
  <div class="modal">Modal Content</div>
</Portal>
```

### Lazy Loading

```lux
HeavyComponent = lazy(fn() import("./heavy.js"))
```

## Rendering

### mount

Mount a component to a DOM element:

```lux
mount(App, document.getElementById("app"))
```

### hydrate

Hydrate server-rendered HTML:

```lux
hydrate(App, document.getElementById("app"))
```

## Comparison with Other Frameworks

### Signal Reactivity

| Feature | Lux | React | SolidJS | Svelte |
|---------|-----|-------|---------|--------|
| State | `state x = 0` | `useState(0)` | `createSignal(0)` | `let x = $state(0)` |
| Computed | `computed y = x * 2` | `useMemo(() => x * 2)` | `createMemo(() => x() * 2)` | `$derived(x * 2)` |
| Effect | `effect { ... }` | `useEffect(() => { ... })` | `createEffect(() => { ... })` | `$effect(() => { ... })` |
| Update | `x += 1` | `setX(x + 1)` | `setX(x() + 1)` | `x += 1` |

### Component Syntax

| Feature | Lux | React | SolidJS |
|---------|-----|-------|---------|
| Define | `component App { <div/> }` | `function App() { return <div/> }` | `function App() { return <div/> }` |
| Props | `component C(name) { }` | `function C({ name }) { }` | `function C(props) { }` |
| Event | `on:click={handler}` | `onClick={handler}` | `onClick={handler}` |
| Binding | `bind:value={val}` | controlled input pattern | custom directive |
| Scoped CSS | `style { ... }` inside component | CSS modules / styled-components | `<style>` in `.svelte` |
