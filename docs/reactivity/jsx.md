# JSX Syntax

Tova uses JSX-like syntax for defining user interfaces. JSX in Tova is compiled to `tova_el`, `tova_fragment`, and `tova_keyed` calls that produce virtual DOM nodes. The reactive system then renders and updates the real DOM efficiently.

## Elements and Attributes

HTML elements use familiar angle-bracket syntax:

```tova
<div class="container" id="main">
  <h1>Title</h1>
  <p>Paragraph text</p>
</div>
```

Self-closing elements use a trailing slash:

```tova
<img src="/logo.png" alt="Logo" />
<br />
<input type="text" />
<hr />
```

### Attribute Names

Most HTML attributes use their standard names. The `class` attribute is supported directly:

```tova
<div class="header">
  <span class="icon">*</span>
</div>
```

The compiler translates `class` to `className` in the generated code.

## Text Content

JSX supports two styles of text content.

### Unquoted Text

Just write text directly inside elements, like in HTML:

```tova
<p>Hello, World!</p>
<h1>Welcome to Tova</h1>
<li>Buy groceries</li>
```

Unquoted text is split into separate text and expression children when mixed with `{ }` expressions.

### Quoted Text

Wrap text in double quotes for explicit string literals:

```tova
<p>"Hello, World!"</p>
<h1>"Welcome to Tova"</h1>
```

Quoted strings support template interpolation with `{ }`:

```tova
<p>"Hello, {name}!"</p>
<p>"Count: {count}"</p>
```

When a quoted string contains signal references, it compiles to a single reactive template literal that updates when any embedded signal changes.

Both unquoted and quoted text produce the same end result. Choose whichever style is clearer for your use case.

::: tip
The keywords `if`, `for`, `elif`, and `else` are reserved for JSX control flow. To use them as literal text, wrap in a quoted string or expression: `<p>{"Click if you dare"}</p>`.
:::

## Expressions in JSX

Use `{ }` braces to embed dynamic values:

```tova
<div class={active_class}>
  <span>{user.name}</span>
  <p>{format_date(created_at)}</p>
  <p>{count * 2 + 1}</p>
</div>
```

When an expression reads a reactive signal, the compiler wraps it in a reactive closure (`() => expr`) so the DOM updates automatically when the signal changes. This is the key to Tova's fine-grained reactivity -- only the specific text node or attribute that depends on a signal updates, not the entire component.

## Event Handlers

Prefix event names with `on:` to attach event handlers:

```tova
<button on:click={fn() count += 1}>Click me</button>
<input on:input={fn(e) name = e.target.value} />
<form on:submit={fn(e) {
  e.preventDefault()
  handle_submit()
}}>
  // form content
</form>
```

Event names after `on:` are lowercase and correspond to DOM event names:

| Tova Syntax | DOM Event |
|---|---|
| `on:click` | `click` |
| `on:input` | `input` |
| `on:change` | `change` |
| `on:submit` | `submit` |
| `on:keydown` | `keydown` |
| `on:mouseover` | `mouseover` |
| `on:focus` | `focus` |
| `on:blur` | `blur` |

Handlers receive the native DOM event object as their argument.

### Event Modifiers

Append modifiers to event names with `.` to automatically apply common event handling patterns:

```tova
// Prevent default form submission
<form on:submit.prevent={fn() handle_submit()}>

// Stop event propagation
<button on:click.stop={fn() do_something()}>Click</button>

// Only trigger if event target is the element itself
<div on:click.self={fn() close_modal()}>
  <div>Clicking here won't trigger close</div>
</div>

// Chain multiple modifiers
<a on:click.stop.prevent={fn() navigate_to("/about")}>About</a>

// Listen once then auto-remove
<button on:click.once={fn() initialize()}>Init</button>

// Use capture phase
<div on:click.capture={fn(e) log_click(e)}>...</div>
```

**Available Modifiers:**

| Modifier | Effect |
|---|---|
| `.prevent` | Calls `e.preventDefault()` |
| `.stop` | Calls `e.stopPropagation()` |
| `.self` | Only fires if `e.target === e.currentTarget` |
| `.once` | Removes handler after first invocation |
| `.capture` | Uses capture phase for event listening |

**Key Modifiers** (for `keydown`/`keyup` events):

| Modifier | Key |
|---|---|
| `.enter` | Enter |
| `.escape` | Escape |
| `.tab` | Tab |
| `.space` | Space |
| `.up` | ArrowUp |
| `.down` | ArrowDown |
| `.left` | ArrowLeft |
| `.right` | ArrowRight |
| `.delete` | Delete |
| `.backspace` | Backspace |

```tova
<input on:keydown.enter={fn() submit_search()} />
<div on:keydown.escape={fn() close_dialog()} />
```

## Two-Way Binding

Use `bind:` directives for two-way data binding between form elements and signals:

### Text Input

```tova
state name = ""
<input bind:value={name} />
```

This sets the input's value to `name` and updates `name` on every `input` event.

### Checkbox

```tova
state agreed = false
<input type="checkbox" bind:checked={agreed} />
```

This binds the checkbox's checked state to the `agreed` signal.

### Select Dropdown

```tova
state selected = "a"
<select bind:value={selected}>
  <option value="a">Option A</option>
  <option value="b">Option B</option>
  <option value="c">Option C</option>
</select>
```

For `<select>` elements, `bind:value` listens to the `change` event (rather than `input`).

### Radio Group

```tova
state choice = "red"
<input type="radio" bind:group={choice} value="red" /> Red
<input type="radio" bind:group={choice} value="green" /> Green
<input type="radio" bind:group={choice} value="blue" /> Blue
```

`bind:group` binds a radio group to a single signal. The signal holds the `value` of the currently selected radio button.

### Checkbox Group

```tova
state selected_colors = []
<input type="checkbox" bind:group={selected_colors} value="red" /> Red
<input type="checkbox" bind:group={selected_colors} value="green" /> Green
<input type="checkbox" bind:group={selected_colors} value="blue" /> Blue
```

For checkboxes, `bind:group` manages an array signal. Checking a box adds its value to the array; unchecking removes it.

## Conditional Classes

Use `class:` directives to conditionally toggle CSS classes:

```tova
<div class:active={is_active} class:error={has_error} class:hidden={not is_visible}>
  Content
</div>
```

The class is added when the expression is truthy and removed when falsy. Multiple `class:` directives can be combined, and they merge with any static `class` attribute:

```tova
<button class="btn" class:primary={is_primary} class:disabled={is_disabled}>
  {label}
</button>
```

See [Styling](/reactivity/styling) for dynamic class expressions, match-based variants, inline styles, and more.

## Spread Attributes

Use the spread operator to pass all properties of an object as attributes:

```tova
props = { class: "btn", id: "submit", disabled: false }
<button {...props}>Submit</button>
```

Spread attributes are merged with explicitly declared attributes. Explicit attributes take precedence over spread values.

## Conditional Rendering

Use `if`, `elif`, and `else` directly inside JSX for conditional rendering:

```tova
<div>
  if is_logged_in {
    <p>Welcome, {user.name}!</p>
  } elif is_loading {
    <Spinner />
  } else {
    <p>Please log in</p>
  }
</div>
```

The condition is reactive -- when the signals it reads change, the rendered content updates automatically.

### Simple If/Else

```tova
<div>
  if show_details {
    <Details item={item} />
  }
</div>
```

When `show_details` is falsy, nothing is rendered in that slot. The compiler wraps conditional rendering in a reactive closure that returns a ternary expression:

```javascript
() => show_details() ? Details({...}) : null
```

## List Rendering

Use `for...in` inside JSX to render lists:

```tova
<ul>
  for item in items {
    <li>{item.name}</li>
  }
</ul>
```

The list re-renders when the iterable signal changes.

### Keyed Lists

For efficient list reconciliation, provide a `key` expression:

```tova
<ul>
  for item in items key={item.id} {
    <li>{item.name} - {item.status}</li>
  }
</ul>
```

Keys help the renderer identify which items changed, were added, or were removed. Without keys, items are reconciled positionally (by index). Use keys when:
- Items can be reordered
- Items can be inserted or removed from the middle
- Items have their own local state that should be preserved

The `key` expression is evaluated for each item and should produce a unique, stable identifier.

### Multi-Element Loop Body

If the loop body contains multiple elements, they are wrapped in a fragment:

```tova
<div>
  for section in sections key={section.id} {
    <h2>{section.title}</h2>
    <p>{section.content}</p>
  }
</div>
```

### Nested Loops

Loops can be nested:

```tova
<table>
  for row in rows key={row.id} {
    <tr>
      for cell in row.cells key={cell.id} {
        <td>{cell.value}</td>
      }
    </tr>
  }
</table>
```

## Scoped CSS

Components can include `style { }` blocks that are automatically scoped to that component:

```tova
component Button(label) {
  <button class="btn">{label}</button>

  style {
    .btn {
      background: blue;
      color: white;
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .btn:hover {
      background: darkblue;
    }
  }
}
```

The compiler generates a unique hash, adds `data-tova-HASH` to elements, and rewrites selectors (`.btn` becomes `.btn[data-tova-HASH]`) so styles never leak between components. Pseudo-classes, pseudo-elements, `@media`, `@keyframes`, and `:global()` are all handled correctly.

See [Styling](/reactivity/styling) for the full guide covering scoped CSS, Tailwind, conditional classes, dynamic class expressions, inline styles, and at-rule support.

## Refs

Use `createRef` to get a reference to a DOM element:

```tova
component AutoFocusInput {
  ref = createRef()

  onMount(fn() {
    ref.current.focus()
  })

  <input ref={ref} placeholder="Type here..." />
}
```

The `ref` attribute accepts a ref object (created by `createRef()`). After the element is rendered, `ref.current` points to the real DOM node.

### `bind:this`

As an alternative to `ref={myRef}`, you can use `bind:this` to bind a DOM element reference:

```tova
component Canvas {
  canvas_el = createRef()

  onMount(fn() {
    ctx = canvas_el.current.getContext("2d")
    ctx.fillRect(0, 0, 100, 100)
  })

  <canvas bind:this={canvas_el} width="400" height="300" />
}
```

`bind:this` works identically to the `ref` attribute — it accepts both ref objects and callback functions.

## Fragments

When a component returns multiple root elements, they are wrapped in a fragment:

```tova
component TableRow(name, email) {
  <td>{name}</td>
  <td>{email}</td>
}
```

Fragments render their children directly without a wrapping element, using comment-node markers in the DOM for tracking.

## Under the Hood

JSX elements compile to `tova_el` calls:

```tova
<div class="hello" id="main">
  <p>Hello</p>
</div>
```

Becomes:

```javascript
tova_el("div", { className: "hello", id: "main" }, [
  tova_el("p", {}, ["Hello"])
])
```

Components compile to function calls:

```tova
<Greeting name={name} />
```

Becomes:

```javascript
Greeting({ get name() { return name(); } })
```

Reactive expressions compile to closures:

```tova
<p>{count}</p>
```

Becomes:

```javascript
tova_el("p", {}, [() => count()])
```

The renderer creates a fine-grained effect for each reactive closure, so only the specific text node updates when `count` changes -- not the entire `<p>` element or its parent.
