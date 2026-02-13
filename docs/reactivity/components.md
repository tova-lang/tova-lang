# Components

Components are the building blocks of Tova UIs. A component is a reactive function that declares state, computed values, and effects, and returns JSX describing what to render. Components are declared with the `component` keyword inside `client { }` blocks.

## Basic Components

The simplest component has no parameters and returns JSX:

```tova
client {
  component Hello {
    <div>
      <h1>Hello, World!</h1>
    </div>
  }
}
```

The JSX at the end of the component body is the return value. You do not need an explicit `return` statement -- the last JSX element (or group of elements) is returned automatically.

## Components with Props

Components accept props as parameters:

```tova
component Greeting(name) {
  <div>
    <h1>Hello, {name}!</h1>
  </div>
}
```

Multiple props are separated by commas:

```tova
component UserCard(name, email, avatar_url) {
  <div class="card">
    <img src={avatar_url} alt={name} />
    <h2>{name}</h2>
    <p>{email}</p>
  </div>
}
```

### Default Prop Values

Props can have default values:

```tova
component Button(label, variant = "primary", disabled = false) {
  <button class={variant} disabled={disabled}>
    {label}
  </button>
}

// Usage — variant defaults to "primary"
<Button label="Submit" />
<Button label="Cancel" variant="secondary" />
```

## Using Components

Components are used as JSX elements with an uppercase first letter:

```tova
component App {
  <div>
    <Greeting name="Alice" />
    <Greeting name="Bob" />
    <UserCard name="Carol" email="carol@example.com" avatar_url="/carol.png" />
  </div>
}
```

Self-closing syntax (`<Component />`) is used when there are no children. Components with children use the full open/close form:

```tova
component Layout(title) {
  <div class="layout">
    <header><h1>{title}</h1></header>
    <main>{children}</main>
  </div>
}

// Usage with children
<Layout title="My App">
  <p>Page content goes here</p>
</Layout>
```

Children are passed as a `children` prop and can be rendered in the component body.

## Props Are Reactive Getters

Props in Tova are **reactive getters**, not plain values. When a parent's signal changes, the prop in the child component updates automatically:

```tova
component Parent {
  state name = "Alice"

  <div>
    <ChildDisplay name={name} />
    <button on:click={fn() name = "Bob"}>Change Name</button>
  </div>
}

component ChildDisplay(name) {
  // name is a reactive getter — it always returns the current value
  // from the parent's signal
  <p>Name: {name}</p>
}
```

Under the hood, the compiler generates prop accessors as getter functions on the props object. When the parent writes:

```tova
<ChildDisplay name={name} />
```

The generated code creates a props object with a getter:

```javascript
ChildDisplay({ get name() { return name(); } })
```

Inside the child component, `name` is a function `() => __props.name` that accesses the getter, maintaining reactivity through the component boundary.

## Components with Local State

Components can declare their own reactive state:

```tova
component Counter {
  state count = 0

  <div>
    <p>Count: {count}</p>
    <button on:click={fn() count += 1}>+</button>
    <button on:click={fn() count -= 1}>-</button>
  </div>
}
```

Local state is scoped to the component instance. Each instance of `Counter` has its own independent `count` signal.

## Components with Computed Values

Components can declare computed values that derive from state or props:

```tova
component PriceDisplay(price, quantity) {
  computed subtotal = price * quantity
  computed tax = subtotal * 0.08
  computed total = subtotal + tax

  <div class="price-breakdown">
    <p>Subtotal: ${subtotal}</p>
    <p>Tax: ${tax}</p>
    <p>Total: ${total}</p>
  </div>
}
```

## Components with Effects

Components can include effects for side effects:

```tova
component PageTitle(title) {
  effect {
    document.title = title
  }

  <div>{title}</div>
}
```

Effects declared inside a component are automatically disposed when the component unmounts.

## Full Component Example

A component that combines state, computed values, effects, and event handling:

```tova
component TodoList {
  state items = []
  state new_text = ""
  state filter = "all"

  computed visible_items = match filter {
    "active" => [t for t in items if not t.completed]
    "completed" => [t for t in items if t.completed]
    _ => items
  }

  computed remaining = len([t for t in items if not t.completed])

  effect {
    print("Todo count: {len(items)}, visible: {len(visible_items)}")
  }

  <div class="todo-app">
    <h1>Todos</h1>
    <form on:submit={fn(e) {
      e.preventDefault()
      if len(new_text) > 0 {
        items = [...items, { id: len(items), text: new_text, completed: false }]
        new_text = ""
      }
    }}>
      <input bind:value={new_text} placeholder="What needs to be done?" />
      <button type="submit">Add</button>
    </form>

    <div class="filters">
      <button on:click={fn() filter = "all"} class:active={filter == "all"}>All</button>
      <button on:click={fn() filter = "active"} class:active={filter == "active"}>Active</button>
      <button on:click={fn() filter = "completed"} class:active={filter == "completed"}>Completed</button>
    </div>

    <ul>
      for item in visible_items key={item.id} {
        <li class:completed={item.completed}>
          <input
            type="checkbox"
            checked={item.completed}
            on:change={fn() {
              items = [
                if t.id == item.id { { ...t, completed: not t.completed } } else { t }
                for t in items
              ]
            }}
          />
          <span>{item.text}</span>
        </li>
      }
    </ul>

    <p>{remaining} items remaining</p>
  </div>
}
```

## Component Composition

Components compose naturally. Break complex UIs into smaller, reusable components:

```tova
component SearchInput(value, on_change, placeholder = "Search...") {
  <input
    type="search"
    bind:value={value}
    on:input={fn(e) on_change(e.target.value)}
    placeholder={placeholder}
  />
}

component UserRow(user, on_select) {
  <tr on:click={fn() on_select(user)}>
    <td>{user.name}</td>
    <td>{user.email}</td>
    <td>{user.role}</td>
  </tr>
}

component UserTable(users, on_select) {
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
        <th>Role</th>
      </tr>
    </thead>
    <tbody>
      for user in users key={user.id} {
        <UserRow user={user} on_select={on_select} />
      }
    </tbody>
  </table>
}
```

## Event Callback Props

Components commonly accept callback props for communication with parents:

```tova
component Modal(title, on_close) {
  <div class="modal-overlay" on:click={fn() on_close()}>
    <div class="modal" on:click={fn(e) e.stopPropagation()}>
      <header>
        <h2>{title}</h2>
        <button on:click={fn() on_close()}>X</button>
      </header>
      <div class="modal-body">{children}</div>
    </div>
  </div>
}

component App {
  state show_modal = false

  <div>
    <button on:click={fn() show_modal = true}>Open Modal</button>
    if show_modal {
      <Modal title="Settings" on_close={fn() show_modal = false}>
        <p>Modal content here</p>
      </Modal>
    }
  </div>
}
```

## Auto-Mount

If a component named `App` exists, Tova automatically mounts it to the DOM when the page loads:

```tova
client {
  component App {
    <div>
      <h1>My Application</h1>
    </div>
  }
}
```

The compiler generates:

```javascript
document.addEventListener("DOMContentLoaded", () => {
  mount(App, document.getElementById("app") || document.body);
});
```

This looks for an element with `id="app"` in the HTML, falling back to `document.body`.

## Under the Hood

When you write:

```tova
component Greeting(name) {
  <h1>Hello, {name}!</h1>
}
```

The compiler generates:

```javascript
function Greeting(__props) {
  const name = () => __props.name;
  return tova_el("h1", {}, ["Hello, ", () => name()]);
}
```

Components are plain functions that receive a props object and return virtual DOM nodes (vnodes). The reactive prop accessors ensure that when a parent signal changes, the child component's references to that prop automatically reflect the new value.
