<script setup>
const counterCode = `// A simple reactive counter
browser {
  component Counter() {
    state count = 0

    <div>
      <h2>"Count: {count}"</h2>
      <button on:click={fn() count += 1}>"+"</button>
      <button on:click={fn() count -= 1}>"-"</button>
    </div>
  }
}`

const todoAppCode = `// PROJECT: Reactive Todo App
browser {
  store todos {
    state items = []
    state filter = "all"

    computed visible = match filter {
      "active" => items |> filter(fn(t) !t.done)
      "done" => items |> filter(fn(t) t.done)
      _ => items
    }

    computed remaining = items
      |> filter(fn(t) !t.done)
      |> len()

    fn add(text) {
      items = [...items, { id: Date.now(), text: text, done: false }]
    }

    fn toggle(id) {
      items = items |> map(fn(t) {
        if t.id == id {
          { ...t, done: !t.done }
        } else {
          t
        }
      })
    }

    fn remove(id) {
      items = items |> filter(fn(t) t.id != id)
    }
  }

  component TodoInput() {
    state text = ""

    fn handleSubmit() {
      if len(trim(text)) > 0 {
        todos.add(text)
        text = ""
      }
    }

    <form on:submit.prevent={fn() handleSubmit()}>
      <input
        bind:value={text}
        placeholder="What needs doing?"
      />
      <button>"Add"</button>
    </form>
  }

  component TodoItem(item) {
    animate fadeIn {
      enter: fade(from: 0, to: 1) + slide(y: 10, to: 0)
      duration: 200
    }

    style {
      .todo { display: flex; align-items: center; padding: 8px; }
      .todo.done { opacity: 0.5; }
      .todo .text { flex: 1; margin-left: 8px; }
    }

    <div class="todo" class:done={item.done}>
      <input
        type="checkbox"
        bind:checked={item.done}
        on:change={fn() todos.toggle(item.id)}
      />
      <span class="text">{item.text}</span>
      <button on:click={fn() todos.remove(item.id)}>"x"</button>
    </div>
  }

  component FilterBar() {
    style {
      .filters { display: flex; gap: 8px; margin: 12px 0; }
      .filters button { padding: 4px 12px; border-radius: 4px; }
      .filters button.active { background: #3b82f6; color: white; }
    }

    <div class="filters">
      <button
        class:active={todos.filter == "all"}
        on:click={fn() todos.filter = "all"}
      >"All"</button>
      <button
        class:active={todos.filter == "active"}
        on:click={fn() todos.filter = "active"}
      >"Active"</button>
      <button
        class:active={todos.filter == "done"}
        on:click={fn() todos.filter = "done"}
      >"Done"</button>
    </div>
  }

  component App() {
    style {
      .app { max-width: 480px; margin: 0 auto; padding: 24px; font-family: system-ui; }
      h1 { font-size: 1.5rem; margin-bottom: 16px; }
      .footer { margin-top: 12px; color: #6b7280; font-size: 0.875rem; }
    }

    <div class="app">
      <h1>"Todo App"</h1>
      <TodoInput />
      <FilterBar />
      <div>
        for item in todos.visible key={item.id} {
          <TodoItem item={item} />
        }
      </div>
      <p class="footer">"{todos.remaining} items remaining"</p>
    </div>
  }
}`

const reactiveBasicsCode = `// Reactive state and computed values
browser {
  component Profile() {
    state firstName = "Ada"
    state lastName = "Lovelace"
    computed fullName = "{firstName} {lastName}"

    effect {
      document.title = "Profile: {fullName}"
    }

    <div>
      <h2>{fullName}</h2>
      <label>"First:"</label>
      <input bind:value={firstName} />
      <label>"Last:"</label>
      <input bind:value={lastName} />
    </div>
  }
}`

const listPatternCode = `// Lists, conditionals, and pattern matching in JSX
browser {
  type Status {
    Loading
    Error(message: String)
    Loaded(data: String)
  }

  component DataView() {
    state status = Loading

    <div>
      {match status {
        Loading => <p>"Loading..."</p>
        Error(msg) => <p class="error">"Error: {msg}"</p>
        Loaded(data) => <p class="success">{data}</p>
      }}
    </div>
  }
}`
</script>

# Chapter 13: JSX and Reactivity

Everything you have learned so far -- types, pattern matching, pipes, error handling -- culminates here. Tova is a full-stack language, and the `browser` block is where your logic meets the screen. This chapter teaches you how to build reactive user interfaces with JSX, signals, components, stores, scoped CSS, and animations.

By the end of this chapter, you will build a full reactive todo application with filtering, animations, and scoped styles.

## Browser Blocks

All browser-side code lives inside a `browser { }` block. This is a top-level declaration, just like `server { }`:

```tova
browser {
  // Everything here runs in the browser
  state count = 0

  component App() {
    <div>"Hello from the browser!"</div>
  }
}
```

A single `.tova` file can have both a `server` block and a `browser` block. The compiler splits them into separate outputs -- server code runs on the backend, browser code ships to the client. They communicate via automatic RPC (covered in a later chapter).

::: tip One Language, Both Sides
This is the core Tova philosophy: write your entire application in one language, in one file if you want, and the compiler handles the separation. No more context-switching between Python and JavaScript, or Go and TypeScript.
:::

## JSX Fundamentals

Tova uses JSX for describing UI. If you have used React, this will feel familiar, but there are some Tova-specific details.

### Elements and Attributes

```tova
browser {
  component Page() {
    <div class="container">
      <h1>"Welcome to Tova"</h1>
      <p>"Build fast, type-safe UIs."</p>
      <img src="/logo.png" alt="Tova Logo" />
    </div>
  }
}
```

Key points:
- Text content uses string literals: `<p>"Hello"</p>`
- Self-closing tags use `/>`: `<img />`, `<input />`, `<br />`
- `class` is used directly (not `className` -- the compiler handles the translation)

### Expressions in JSX

Use curly braces `{expr}` to embed any Tova expression:

```tova
browser {
  component Greeting() {
    name = "World"
    items = [1, 2, 3]

    <div>
      <h1>"Hello, {name}!"</h1>
      <p>"Item count: {len(items)}"</p>
      <p>{if len(items) > 0 { "Has items" } else { "Empty" }}</p>
    </div>
  }
}
```

String interpolation works inside quoted strings (`"Hello, {name}!"`), and raw expressions work inside curly braces (`{len(items)}`). Both are reactive -- they update automatically when the underlying data changes.

### Fragments

When you need to return multiple sibling elements without a wrapper `<div>`, use a fragment with `<>...</>`:

```tova
browser {
  component UserInfo() {
    <>
      <h2>"Alice"</h2>
      <p>"Software Engineer"</p>
      <p>"Portland, OR"</p>
    </>
  }
}
```

Fragments produce no extra DOM elements -- the children are rendered directly into the parent. This is useful when a wrapper element would break your CSS layout or add unwanted nesting.

## Reactive State

Reactivity is Tova's killer feature for UI. Declare a `state` variable and the UI updates automatically when it changes.

### Declaring State

```tova
browser {
  component Counter() {
    state count = 0

    <div>
      <p>"Count: {count}"</p>
      <button on:click={fn() count += 1}>"Increment"</button>
    </div>
  }
}
```

Under the hood, `state count = 0` creates a **signal** -- a reactive value with a getter and setter. When you read `count` in JSX, it registers a dependency. When you write to `count`, every expression that depends on it re-evaluates automatically.

<TryInPlayground :code="counterCode" label="Reactive Counter" />

### Mutable Updates

Tova's setter transform makes state updates feel natural:

```tova
state count = 0

// All of these work:
count = 10          // Direct assignment
count += 1          // Compound assignment
count = count * 2   // Expression assignment
```

The compiler transforms `count += 1` into a setter call internally, so you write clean code and the reactivity system handles the rest.

::: warning State Lives in Components
When you declare `state` inside a `component`, each instance of that component gets its own copy of the state. State declared at the top level of a `browser` block is shared (module-level). For shared state across components, use **stores** (covered later in this chapter).
:::

## Computed Values

A `computed` value derives from other reactive values and stays in sync automatically:

```tova
browser {
  component PriceCalculator() {
    state price = 100
    state quantity = 1
    state taxRate = 0.08
    computed subtotal = price * quantity
    computed tax = subtotal * taxRate
    computed total = subtotal + tax

    <div>
      <label>"Price: "</label>
      <input bind:value={price} />
      <label>"Qty: "</label>
      <input bind:value={quantity} />
      <p>"Subtotal: ${subtotal}"</p>
      <p>"Tax: ${tax}"</p>
      <p>"Total: ${total}"</p>
    </div>
  }
}
```

`computed` values are **lazy and cached** -- they only recalculate when their dependencies change, and they never recalculate more than necessary.

<TryInPlayground :code="reactiveBasicsCode" label="Computed Values" />

## Effects

An `effect` block runs code whenever its reactive dependencies change:

```tova
browser {
  component Timer() {
    state seconds = 0

    effect {
      document.title = "Timer: {seconds}s"
    }

    effect {
      print("Seconds changed to: {seconds}")
    }

    <div>
      <p>"Elapsed: {seconds}s"</p>
      <button on:click={fn() seconds += 1}>"Tick"</button>
    </div>
  }
}
```

Effects are useful for:
- Updating the document title
- Logging state changes
- Syncing with external systems (localStorage, analytics)
- Starting/stopping timers or subscriptions

::: tip Effects Run After Render
Effects run after the DOM has been updated. They are for **side effects** -- things that happen outside the reactive UI tree. If you can express something as `computed`, prefer that over `effect`.
:::

## Event Handling

### Basic Events

Use `on:eventname` to attach event handlers:

```tova
browser {
  component Form() {
    state value = ""

    <div>
      <input on:input={fn(e) value = e.target.value} />
      <button on:click={fn() print("Clicked!")}>"Go"</button>
      <p on:mouseover={fn() print("Hovered!")}>"Hover me"</p>
    </div>
  }
}
```

The handler receives the DOM event object as its argument. For simple updates like incrementing a counter, you can skip the event parameter:

```tova
<button on:click={fn() count += 1}>"+"</button>
```

### Event Modifiers

Tova supports event modifiers using dot syntax after the event name:

```tova
// Prevent default browser behavior
<form on:submit.prevent={fn() handleSubmit()}>
  <input />
  <button>"Submit"</button>
</form>

// Stop event propagation
<button on:click.stop={fn() handleClick()}>"Click"</button>

// Only fire once
<button on:click.once={fn() initialize()}>"Init"</button>

// Only fire if event target is the element itself
<div on:click.self={fn() handleOuter()}>
  <button>"Inner clicks won't trigger outer"</button>
</div>

// Use capture phase
<div on:click.capture={fn(e) logClick(e)}>"Capture"</div>
```

You can chain modifiers:

```tova
<form on:submit.stop.prevent={fn() handleSubmit()}>
  "..."
</form>
```

### Keyboard Modifiers

For keyboard events, add key modifiers:

```tova
<input on:keydown.enter={fn() submitSearch()} />
<input on:keydown.enter.prevent={fn() submitForm()} />
```

## Conditional Rendering

Use `if`/`elif`/`else` directly inside JSX:

```tova
browser {
  component StatusBadge() {
    state status = "active"

    <div>
      if status == "active" {
        <span class="badge green">"Active"</span>
      } elif status == "paused" {
        <span class="badge yellow">"Paused"</span>
      } else {
        <span class="badge gray">"Inactive"</span>
      }
    </div>
  }
}
```

Conditionals are **reactive** -- when `status` changes, the rendered element swaps automatically.

### Inline Conditionals

For simple cases, use `if` as an expression:

```tova
<div>
  <p>{if isLoggedIn { "Welcome back!" } else { "Please log in." }}</p>
  <button show={isAdmin}>"Admin Panel"</button>
</div>
```

The `show` directive toggles `display: none` rather than removing the element from the DOM -- useful for elements that toggle frequently.

## List Rendering

Use `for` loops inside JSX to render lists:

```tova
browser {
  component UserList() {
    state users = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
      { id: 3, name: "Carol" }
    ]

    <ul>
      for user in users {
        <li>"{user.name}"</li>
      }
    </ul>
  }
}
```

### Keyed Lists

When items can be added, removed, or reordered, add a `key` to help the runtime efficiently update the DOM:

```tova
<ul>
  for user in users key={user.id} {
    <li>"{user.name}"</li>
  }
</ul>
```

Without a key, the runtime uses index-based diffing. With a key, it can match items across renders, preserving component state and avoiding unnecessary re-creation.

::: warning Always Key Dynamic Lists
If your list items have stable unique identifiers (IDs, slugs, etc.), always provide a `key`. Without it, reordering or removing items can cause subtle bugs where component state gets mixed up.
:::

## Pattern Matching in JSX

Tova's `match` expression works beautifully inside JSX for rendering different states:

```tova
browser {
  type LoadState {
    Idle
    Loading
    Error(message: String)
    Success(data: String)
  }

  component DataPanel() {
    state status = Idle

    <div>
      {match status {
        Idle => <p>"Click load to fetch data"</p>
        Loading => <div class="spinner">"Loading..."</div>
        Error(msg) => <p class="error">"Failed: {msg}"</p>
        Success(data) => <div class="data">{data}</div>
      }}
    </div>
  }
}
```

This is one of Tova's greatest strengths: the same pattern matching you use for data processing works directly in your UI. Every variant is handled, and the compiler warns you if you miss one.

<TryInPlayground :code="listPatternCode" label="Patterns in JSX" />

## Two-Way Binding

For form inputs, `bind:value` creates a two-way connection between state and the input:

```tova
browser {
  component LoginForm() {
    state email = ""
    state password = ""
    state rememberMe = false

    <form on:submit.prevent={fn() handleLogin()}>
      <input type="text" bind:value={email} placeholder="Email" />
      <input type="password" bind:value={password} placeholder="Password" />

      <label>
        <input type="checkbox" bind:checked={rememberMe} />
        "Remember me"
      </label>

      <button>"Log In"</button>
    </form>
  }
}
```

| Binding | Element | What it binds |
|---------|---------|---------------|
| `bind:value` | `<input>` | `e.target.value` via `onInput` |
| `bind:value` | `<select>` | `e.target.value` via `onChange` |
| `bind:checked` | `<input type="checkbox">` | `e.target.checked` via `onChange` |
| `bind:group` | `<input type="radio">` | Groups radio buttons to a single state value |
| `bind:this` | Any element | Stores a reference to the DOM element |

`bind:value` is shorthand for setting both the `value` attribute and an `onInput` (or `onChange` for `<select>`) handler. It keeps the state and the input in perfect sync.

### Radio Groups with bind:group

For radio buttons, `bind:group` ties multiple inputs to the same state variable:

```tova
browser {
  component SizeSelector() {
    state selected_size = "medium"

    <div>
      <label>
        <input type="radio" bind:group={selected_size} value="small" />
        "Small"
      </label>
      <label>
        <input type="radio" bind:group={selected_size} value="medium" />
        "Medium"
      </label>
      <label>
        <input type="radio" bind:group={selected_size} value="large" />
        "Large"
      </label>
      <p>"Selected: {selected_size}"</p>
    </div>
  }
}
```

### Element References with bind:this

Sometimes you need direct access to a DOM element -- for focusing an input, measuring dimensions, or integrating with a third-party library. Use `bind:this`:

```tova
browser {
  component AutoFocus() {
    state inputRef = null

    effect {
      if inputRef != null {
        inputRef.focus()
      }
    }

    <input bind:this={inputRef} placeholder="I auto-focus!" />
  }
}
```

`bind:this` stores the actual DOM element in the state variable after the component mounts. Use it in effects, not directly during rendering.

## Components

Components are reusable pieces of UI declared with the `component` keyword:

```tova
browser {
  component Card(title) {
    <div class="card">
      <h3>{title}</h3>
      <div class="card-body">
        {children}
      </div>
    </div>
  }

  component App() {
    <div>
      <Card title="Welcome">
        <p>"This is the card body."</p>
      </Card>
      <Card title="Features">
        <ul>
          <li>"Fast"</li>
          <li>"Type-safe"</li>
          <li>"Reactive"</li>
        </ul>
      </Card>
    </div>
  }
}
```

### Component Props

Parameters declared in the component signature become **props**:

```tova
component Avatar(name, size, online) {
  initials = split(name, " ")
    |> map(fn(w) w[0])
    |> join("")
    |> upper()

  <div class="avatar" style="width: {size}px; height: {size}px;">
    <span>{initials}</span>
    if online {
      <span class="status-dot">"*"</span>
    }
  </div>
}

// Usage
<Avatar name="Ada Lovelace" size={48} online={true} />
```

### Children

Content placed between a component's opening and closing tags is passed as `children`:

```tova
component Button(variant) {
  <button class="btn btn-{variant}">
    {children}
  </button>
}

// Usage
<Button variant="primary">
  <span>"Click me"</span>
</Button>
```

Self-closing components have no children:

```tova
<Icon name="star" />
```

### Spread Attributes

When you have an object whose properties match a component's props, you can **spread** it with `...` to pass all properties at once:

```tova
props = { name: "Alice", age: 30, role: "admin" }

// Spread all properties as attributes
<UserCard ...props />

// Combine spread with explicit attributes
<UserCard ...props active={true} />
```

Explicit attributes take precedence over spread values. If the object has a `name` property and you also write `name="Bob"`, the explicit `name="Bob"` wins.

This pattern is especially useful for **forwarding props** -- passing all received props down to a child component without listing them one by one:

```tova
component Wrapper(props) {
  <div class="wrapper">
    <Inner ...props />
  </div>
}
```

You can also spread into HTML elements:

```tova
attrs = { id: "main-input", placeholder: "Type here", disabled: true }
<input ...attrs />
```

::: tip When to Use Spread
Spread attributes shine in wrapper components, higher-order components, and any situation where you forward an unknown set of attributes. For components with a small, fixed set of props, listing them explicitly is clearer.
:::

### Component-Scoped State

Each component instance gets its own reactive state:

```tova
component Toggle() {
  state active = false

  <button
    on:click={fn() active = !active}
    class:active={active}
  >
    {if active { "ON" } else { "OFF" }}
  </button>
}

// Each Toggle has independent state
<div>
  <Toggle />
  <Toggle />
  <Toggle />
</div>
```

## Stores

When multiple components need to share state, use a **store**:

```tova
browser {
  store counter {
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

  component Display() {
    <div>
      <p>"Count: {counter.count}"</p>
      <p>"Doubled: {counter.doubled}"</p>
    </div>
  }

  component Controls() {
    <div>
      <button on:click={fn() counter.increment()}>"+"</button>
      <button on:click={fn() counter.decrement()}>"-"</button>
      <button on:click={fn() counter.reset()}>"Reset"</button>
    </div>
  }

  component App() {
    <div>
      <Display />
      <Controls />
    </div>
  }
}
```

A store is a singleton reactive object. It can contain:
- **`state`** -- reactive values with automatic getters and setters
- **`computed`** -- derived values (getter only, no setter)
- **`fn`** -- actions that modify state

Access store members with dot notation: `counter.count`, `counter.increment()`. Store state is reactive in JSX -- when `counter.count` changes, every component reading it re-renders.

::: tip When to Use Stores vs. Component State
Use **component state** for UI-local concerns: "is this dropdown open?", "what did the user type in this input?"

Use **stores** for shared application state: "who is the logged-in user?", "what items are in the cart?", "what filter is selected?"
:::

## Scoped CSS

Declare a `style` block inside a component to add styles that are **automatically scoped** to that component:

```tova
browser {
  component Card(title) {
    style {
      .card {
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
        margin: 8px 0;
      }
      .card:hover {
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .card h3 {
        margin: 0 0 8px 0;
        font-size: 1.125rem;
      }
    }

    <div class="card">
      <h3>{title}</h3>
      {children}
    </div>
  }
}
```

The compiler scopes styles by adding a unique `data-tova-HASH` attribute to the component's elements and rewriting CSS selectors to include that attribute. Your `.card` style will never leak to other components, even if they also have a `.card` class.

### Pseudo-classes and Pseudo-elements

Scoped CSS handles pseudo-classes and pseudo-elements correctly:

```tova
style {
  .btn { background: blue; color: white; }
  .btn:hover { background: darkblue; }
  .btn:focus-visible { outline: 2px solid blue; }
  .input::placeholder { color: #9ca3af; }
  li:first-child { border-top: none; }
  tr:nth-child(2n) { background: #f9fafb; }
}
```

All of these get scoped to the component automatically.

## Class Binding

The `class:name` directive toggles a CSS class based on a condition:

```tova
<div class:active={isActive}>"Tab"</div>
```

When `isActive` is truthy, the element gets the `active` class. When it is falsy, the class is removed.

### Combining with Static Classes

`class:name` merges with any static `class` attribute:

```tova
<button class="btn" class:primary={isPrimary} class:disabled={isDisabled}>
  "Click me"
</button>
```

This button always has the `btn` class. The `primary` and `disabled` classes toggle independently based on their conditions.

### Dynamic Classes

For fully dynamic class strings, use an expression:

```tova
<div class={if isDark { "bg-gray-900 text-white" } else { "bg-white text-gray-900" }}>
  "Content"
</div>
```

Or with string interpolation:

```tova
state size = "lg"
<div class="text-{size} font-bold">"Sized text"</div>
```

## Theme Blocks

The `theme` block defines design tokens -- colors, spacing, fonts, shadows -- as CSS custom properties. Declare it at the top level and reference tokens in your component styles:

```tova
theme {
  colors {
    primary: "#3b82f6"
    primary.hover: "#2563eb"
    surface: "#ffffff"
    text: "#1e293b"
    text.muted: "#64748b"
  }

  spacing {
    sm: 8
    md: 16
    lg: 24
    xl: 32
  }

  radius {
    md: 8
    full: 9999
  }

  font {
    sans: "Inter, system-ui, sans-serif"
    size.base: 16
    size.lg: 20
  }

  shadow {
    sm: "0 1px 2px rgba(0,0,0,0.05)"
    md: "0 4px 6px rgba(0,0,0,0.1)"
  }

  transition {
    fast: "150ms ease"
    normal: "200ms ease"
  }
}
```

The compiler generates CSS custom properties from your tokens:

```css
:root {
  --tova-color-primary: #3b82f6;
  --tova-color-primary-hover: #2563eb;
  --tova-spacing-sm: 8px;
  --tova-spacing-md: 16px;
  --tova-radius-md: 8px;
  --tova-font-sans: Inter, system-ui, sans-serif;
  --tova-font-size-base: 16px;
  --tova-shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --tova-transition-fast: 150ms ease;
}
```

Numeric values get automatic units: `spacing` and `radius` get `px`, `font.size.*` gets `px`, while `colors`, `shadow`, and `transition` are strings and pass through as-is.

### Theme Sections

| Section | Value Type | Unit | Example |
|---------|-----------|------|---------|
| `colors` | String | none | `primary: "#3b82f6"` |
| `spacing` | Number | `px` | `md: 16` |
| `radius` | Number | `px` | `md: 8` |
| `shadow` | String | none | `md: "0 4px 6px rgba(0,0,0,0.1)"` |
| `font` | String/Number | `px` for sizes | `sans: "Inter, sans-serif"` |
| `breakpoints` | Number | `px` | `tablet: 768` |
| `transition` | String | none | `fast: "150ms ease"` |

### Referencing Tokens in Styles

Inside component `style` blocks, use `$category.token` to reference theme tokens:

```tova
browser {
  component Button() {
    style {
      .btn {
        background: $color.primary;
        color: $color.surface;
        padding: $spacing.sm $spacing.md;
        border-radius: $radius.md;
        font-family: $font.sans;
        font-size: $font.size.base;
        transition: background $transition.fast;
        box-shadow: $shadow.md;
      }
      .btn:hover {
        background: $color.primary.hover;
      }
    }

    <button class="btn">{children}</button>
  }
}
```

The compiler replaces `$color.primary` with `var(--tova-color-primary)`, so your components use the theme tokens without hardcoding values.

### Dark Mode

Add a `dark` section with flat overrides using `section.token` syntax:

```tova
theme {
  colors {
    surface: "#ffffff"
    text: "#1e293b"
    primary: "#3b82f6"
  }

  dark {
    colors.surface: "#0f172a"
    colors.text: "#e2e8f0"
    colors.primary: "#60a5fa"
  }
}
```

The compiler generates a `@media (prefers-color-scheme: dark)` block that overrides the relevant custom properties. Your components don't need any dark-mode logic -- the CSS handles it automatically.

::: tip One Theme Per Project
The analyzer enforces a single `theme` block per project and warns on unknown sections, duplicate tokens, and dark overrides referencing undefined sections. This keeps your design tokens consistent and prevents drift.
:::

## Animations

Tova provides declarative `animate` blocks for enter/exit animations inside components:

```tova
browser {
  component Notification() {
    animate fadeSlide {
      enter: fade(from: 0, to: 1) + slide(y: 20, to: 0)
      exit: fade(from: 1, to: 0)
      duration: 300
      easing: "ease-out"
    }

    <div class="notification">
      "Something happened!"
    </div>
  }
}
```

### Animation Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enter` | Composition | required | Animation when element appears |
| `exit` | Composition | optional | Animation when element is removed |
| `duration` | Number (ms) | 300 | Animation length |
| `easing` | String | "ease" | CSS easing function |
| `stagger` | Number (ms) | 0 | Delay between list items |
| `stay` | Number (ms) | -- | Auto-dismiss after N ms |

### Animation Primitives

Tova includes five built-in animation primitives:

```tova
// Opacity
fade(from: 0, to: 1)

// Translation (X, Y, or both)
slide(y: 20, to: 0)       // Slide from 20px below
slide(x: -100, to: 0)     // Slide from 100px left
slide(x: 50, y: 20, to: 0) // Diagonal slide

// Scale
scale(from: 0.8, to: 1)

// Rotation (degrees)
rotate(from: 0, to: 360)

// Blur filter
blur(from: 10, to: 0)     // Blur clearing
```

### Composition

Combine primitives with `+` (parallel) and `then` (sequential):

```tova
// Fade and slide at the same time
enter: fade(from: 0, to: 1) + slide(y: 20, to: 0)

// Three animations in parallel
enter: fade(from: 0, to: 1) + slide(y: 20, to: 0) + scale(from: 0.9, to: 1)

// Fade in, then scale up (sequential)
enter: fade(from: 0, to: 1) then scale(from: 0.8, to: 1)

// Three-step sequence
enter: fade(from: 0, to: 1) then slide(y: 20, to: 0) then scale(from: 0.9, to: 1)
```

The `+` operator binds tighter than `then`. So `fade(...) + slide(...) then scale(...)` means "fade and slide in parallel, then scale." Use parentheses to override precedence:

```tova
// Group explicitly
enter: (fade(from: 0, to: 1) then slide(y: 20, to: 0)) + scale(from: 0.8, to: 1)
```

### The animate: Directive

Apply animations to elements using the `animate:` directive:

```tova
component Card() {
  animate fadeIn {
    enter: fade(from: 0, to: 1)
    duration: 300
  }

  // Apply animation to element
  <div animate:fadeIn>"Hello"</div>
}
```

Make animations conditional by passing a boolean expression:

```tova
component Panel(visible) {
  animate slideUp {
    enter: slide(y: 20, to: 0) + fade(from: 0, to: 1)
    exit: slide(y: 0, to: 20) + fade(from: 1, to: 0)
    duration: 400
  }

  // Only animate when visible is true
  <div animate:slideUp={visible}>"Content"</div>
}
```

Multiple animations can be applied to one element:

```tova
<div animate:fadeIn animate:slideUp>"Both animations"</div>
```

### Staggered List Animations

For lists, add `stagger` to create a cascading effect:

```tova
component TodoList() {
  animate listItem {
    enter: fade(from: 0, to: 1) + slide(y: 10, to: 0)
    duration: 200
    stagger: 50
  }

  <ul>
    for item in items key={item.id} {
      <li animate:listItem>{item.text}</li>
    }
  </ul>
}
```

Each item animates in sequence, 50ms apart, creating a smooth cascading entrance.

### Toast Notifications with `stay`

The `stay` property auto-dismisses elements after a timeout:

```tova
component Toast(message) {
  animate toast {
    enter: slide(y: 30, to: 0) + fade(from: 0, to: 1)
    exit: fade(from: 1, to: 0)
    stay: 3000
    duration: 300
  }

  <div class="toast" animate:toast>
    {message}
  </div>
}
```

The toast slides in, stays visible for 3 seconds, then fades out.

::: tip Accessibility
Tova automatically generates `@media (prefers-reduced-motion: reduce)` rules to disable animations for users who have requested reduced motion. You don't need to handle this manually.
:::

## Putting It All Together

Here is a complete reactive todo application that uses every concept from this chapter:

```tova
browser {
  store todos {
    state items = []
    state filter = "all"

    computed visible = match filter {
      "active" => items |> filter(fn(t) !t.done)
      "done" => items |> filter(fn(t) t.done)
      _ => items
    }

    computed remaining = items
      |> filter(fn(t) !t.done)
      |> len()

    fn add(text) {
      items = [...items, { id: Date.now(), text: text, done: false }]
    }

    fn toggle(id) {
      items = items |> map(fn(t) {
        if t.id == id { { ...t, done: !t.done } } else { t }
      })
    }

    fn remove(id) {
      items = items |> filter(fn(t) t.id != id)
    }
  }

  component TodoInput() {
    state text = ""

    fn handleSubmit() {
      if len(trim(text)) > 0 {
        todos.add(text)
        text = ""
      }
    }

    <form on:submit.prevent={fn() handleSubmit()}>
      <input bind:value={text} placeholder="What needs doing?" />
      <button>"Add"</button>
    </form>
  }

  component TodoItem(item) {
    animate fadeIn {
      enter: fade(from: 0, to: 1) + slide(y: 10, to: 0)
      duration: 200
    }

    style {
      .todo { display: flex; align-items: center; padding: 8px; }
      .todo.done { opacity: 0.5; text-decoration: line-through; }
      .text { flex: 1; margin-left: 8px; }
    }

    <div class="todo" class:done={item.done}>
      <input type="checkbox" on:change={fn() todos.toggle(item.id)} />
      <span class="text">{item.text}</span>
      <button on:click={fn() todos.remove(item.id)}>"x"</button>
    </div>
  }

  component FilterBar() {
    style {
      .filters { display: flex; gap: 8px; margin: 12px 0; }
      .active { background: #3b82f6; color: white; }
    }

    <div class="filters">
      <button class:active={todos.filter == "all"}
        on:click={fn() todos.filter = "all"}>"All"</button>
      <button class:active={todos.filter == "active"}
        on:click={fn() todos.filter = "active"}>"Active"</button>
      <button class:active={todos.filter == "done"}
        on:click={fn() todos.filter = "done"}>"Done"</button>
    </div>
  }

  component App() {
    style {
      .app { max-width: 480px; margin: 0 auto; padding: 24px; font-family: system-ui; }
      h1 { margin-bottom: 16px; }
      .footer { margin-top: 12px; color: #6b7280; font-size: 0.875rem; }
    }

    <div class="app">
      <h1>"Todo App"</h1>
      <TodoInput />
      <FilterBar />
      <div>
        for item in todos.visible key={item.id} {
          <TodoItem item={item} />
        }
      </div>
      <p class="footer">"{todos.remaining} items remaining"</p>
    </div>
  }
}
```

This small application demonstrates:
- **Store** for shared state (`todos`)
- **Computed values** for derived data (`visible`, `remaining`)
- **Pattern matching** in computed for filter logic
- **Components** with props (`TodoItem`, `Card`)
- **Two-way binding** (`bind:value` on the input)
- **Event modifiers** (`.prevent` on form submit)
- **Conditional class binding** (`class:done`, `class:active`)
- **Keyed list rendering** (`for item in todos.visible key={item.id}`)
- **Scoped CSS** (each component has isolated styles)
- **Animations** (fade+slide on new items)

<TryInPlayground :code="todoAppCode" label="Todo App" />

## Quick Reference

| Feature | Syntax |
|---------|--------|
| State | `state x = 0` |
| Computed | `computed y = x * 2` |
| Effect | `effect { print(x) }` |
| Event | `on:click={fn() ...}` |
| Modifier | `on:click.stop.prevent={fn() ...}` |
| Binding | `bind:value={text}`, `bind:checked={flag}` |
| Radio group | `bind:group={state}` |
| Element ref | `bind:this={ref}` |
| Fragment | `<>...</>` |
| Conditional | `if cond { <A /> } elif ... { <B /> } else { <C /> }` |
| Loop | `for item in list key={item.id} { <Item /> }` |
| Match | `{match val { A => <X /> B => <Y /> }}` |
| Class toggle | `class:active={flag}` |
| Show/hide | `show={flag}` |
| Spread attrs | `<Comp ...props />` |
| Component | `component Name(props) { <div /> }` |
| Store | `store name { state x = 0  fn inc() { x += 1 } }` |
| Scoped CSS | `style { .cls { color: red; } }` |
| Theme token | `$color.primary` in style blocks |
| Dark mode | `dark { colors.surface: "#0f172a" }` in theme |
| Animation | `animate name { enter: ... duration: 300 }` |
| Animate directive | `<div animate:name>` or `<div animate:name={cond}>` |

## Exercises

**Exercise 13.1:** Build a `PasswordStrength` component. It should have a text input for a password and display a strength meter below it. Use `computed` to calculate strength based on length, presence of numbers, uppercase letters, and special characters. Use `class:weak`, `class:medium`, and `class:strong` to color the meter bar. Add a scoped `style` block for the meter styling.

**Exercise 13.2:** Build a `Tabs` component with a `store`. The store should hold an array of tab objects (`{ id, label, content }`) and track the active tab ID. Render tab buttons at the top with `class:active` on the selected one, and the content of the active tab below. Use `match` or `if` to show only the active tab's content. Add enter/exit animations when switching tabs.

**Exercise 13.3:** Build a `SearchableList` component. Given a list of items, render a search input at the top and filter the displayed items using a `computed` that matches the search text against item names. Use `bind:value` on the input, `for` to render the filtered list with keys, and show a "No results" message with an `if` when the filtered list is empty. Add a `stagger` animation for search results appearing.

## Challenge

Build a **Kanban board** with three columns: "To Do", "In Progress", and "Done". Requirements:

1. Use a store with a list of tasks, each having an `id`, `title`, and `status` field
2. Use `computed` values to filter tasks into three lists by status
3. Each column renders its tasks with `for` loops and keys
4. Add buttons on each card to move it to the next/previous column (use `match` on the current status to determine where it goes)
5. Add an input at the top to create new tasks (always start in "To Do")
6. Style each column differently with scoped CSS and use `class:` bindings to highlight columns that have tasks
7. Add `fade` + `slide` animations with `stagger` when tasks enter a column
8. Show a count badge on each column header using `computed`

---

[← Previous: Server Development](./servers) | [Next: Full-Stack Applications →](./fullstack)
