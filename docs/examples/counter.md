---
title: Counter App
---

# Counter App

A client-only reactive counter that demonstrates Tova's reactivity system, computed values, pattern matching, and JSX components.

## Full Code

Create `counter.tova`:

```tova
browser {
  // Reactive state -- the single source of truth
  state count = 0

  // Computed values -- automatically update when count changes
  computed doubled = count * 2

  computed message = match count {
    0 => "Click to start counting"
    1 => "You clicked once"
    n if n < 10 => "Keep going! Count is {n}"
    n if n < 50 => "Getting high: {n}"
    _ => "Wow, {count} clicks!"
  }

  // Component with JSX
  component App {
    <div class="app">
      <header>
        <h1>"Counter"</h1>
        <p class="subtitle">"Tova Reactivity Demo"</p>
      </header>

      <div class="counter-section">
        <p class="count">{count}</p>
        <p class="doubled">"Doubled: {doubled}"</p>
        <p class="message">{message}</p>
      </div>

      <div class="controls">
        <button onclick={fn() count = count - 1}>"-"</button>
        <button onclick={fn() count = 0}>"Reset"</button>
        <button onclick={fn() count = count + 1}>"+"</button>
      </div>
    </div>
  }
}
```

Run the dev server:

```bash
tova dev .
```

Open `http://localhost:3000` in your browser.

## Walkthrough

### Reactive State

```tova
state count = 0
```

The `state` keyword creates a reactive variable. When `count` changes, anything that depends on it automatically re-evaluates and the DOM updates.

### Computed Values

```tova
computed doubled = count * 2
```

A `computed` value is derived from reactive state. It re-calculates whenever its dependencies change. Here, `doubled` always equals `count * 2` -- you never need to manually keep them in sync.

### Pattern Matching in Computed

```tova
computed message = match count {
  0 => "Click to start counting"
  1 => "You clicked once"
  n if n < 10 => "Keep going! Count is {n}"
  n if n < 50 => "Getting high: {n}"
  _ => "Wow, {count} clicks!"
}
```

The `match` expression assigns different messages based on the count value. Pattern matching supports:

- **Literal patterns** (`0`, `1`) -- match exact values
- **Binding with guards** (`n if n < 10`) -- bind the value to `n` and check a condition
- **Wildcard** (`_`) -- matches anything (the default case)

The `message` computed value re-evaluates whenever `count` changes, automatically picking the right message.

### JSX Components

```tova
component App {
  <div class="app">
    <h1>"Counter"</h1>
    <p class="count">{count}</p>
    <button onclick={fn() count = count + 1}>"+"</button>
  </div>
}
```

Components use JSX syntax. Key points:

- **Text content** is written in quotes: `"Counter"`
- **Expressions** are embedded with curly braces: `{count}`, `{doubled}`
- **Event handlers** are functions: `onclick={fn() count = count + 1}`
- **Reactive updates** happen automatically -- when `count` changes, the DOM patches only the elements that depend on it

### Event Handlers

```tova
<button onclick={fn() count = count - 1}>"-"</button>
<button onclick={fn() count = 0}>"Reset"</button>
<button onclick={fn() count = count + 1}>"+"</button>
```

Event handlers are anonymous functions using `fn()` syntax. Assigning to a `state` variable triggers a reactive update cycle:

1. `count` changes
2. `doubled` and `message` recompute
3. The DOM updates to reflect new values

There is no manual DOM manipulation, no `setState` call, and no virtual DOM diffing. Tova's fine-grained reactivity updates only the specific DOM nodes that changed.

## What's Next

- Add a server to persist the count with the [Todo App](./todo-app.md) example
- Learn about [full-stack architecture](./todo-app.md) with shared types and RPC
