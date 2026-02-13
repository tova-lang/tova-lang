# Client Block

The `client` block defines everything that runs in the browser. It compiles to a JavaScript module that is embedded into an HTML page along with the Lux reactive runtime. The client uses a fine-grained reactive system inspired by SolidJS, where signals, computed values, and effects automatically track dependencies and update the DOM with minimal overhead.

## Purpose

The client block is where your application's UI lives:

- **Reactive state** -- signals that trigger updates when they change
- **Computed values** -- derived data that recalculates automatically
- **Effects** -- side effects that re-run when their dependencies change
- **Components** -- reusable UI elements with JSX
- **Event handlers** -- user interaction logic
- **Server calls** -- invoking server functions via the RPC bridge

## Reactive Primitives

### State (Signals)

A `state` declaration creates a reactive signal. When its value changes, everything that depends on it updates automatically:

```lux
client {
  state count = 0
  state name = "World"
  state users: [User] = []
  state loading = false
}
```

Reading a signal returns its current value. Assigning to it updates it and triggers reactivity:

```lux
client {
  state count = 0

  fn increment() {
    count = count + 1      // Triggers all dependent updates
  }

  fn reset() {
    count = 0
  }
}
```

Under the hood, `state count = 0` compiles to:

```javascript
const [count, setCount] = createSignal(0);
```

Reading `count` in generated code calls `count()` (the getter). Writing `count = 5` calls `setCount(5)` (the setter). This is all handled by the compiler transparently.

### Computed Values

Computed values derive from other reactive values and update automatically when dependencies change:

```lux
client {
  state price = 10
  state quantity = 2

  computed total = price * quantity
  computed display = "Total: $#{total}"
}
```

A computed value is read-only. You cannot assign to it -- it always reflects the latest derived value.

Under the hood, `computed total = price * quantity` compiles to:

```javascript
const total = createComputed(() => price() * quantity());
```

### Effects

Effects are side-effect functions that re-execute whenever their reactive dependencies change:

```lux
client {
  state users: [User] = []

  effect {
    users = server.get_users()
  }
}
```

This effect runs once on initialization, calling the server to load users. If any signal it reads changes, it re-runs.

Effects are the primary way to:
- Load data from the server
- Update the document title
- Log state changes
- Synchronize with external systems

```lux
client {
  state search_query = ""
  state results: [User] = []

  effect {
    if search_query.length() > 2 {
      results = server.search_users(search_query)
    }
  }
}
```

When `search_query` changes (and is longer than 2 characters), the effect automatically re-runs and fetches new results.

## Components

Components are reusable UI elements defined with JSX:

```lux
client {
  component App {
    <div>
      <h1>Hello, Lux!</h1>
      <p>Count: {count}</p>
      <button @click={increment}>Increment</button>
    </div>
  }
}
```

### Component Props

Components can accept props:

```lux
client {
  component UserCard(user) {
    <div class="card">
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  }

  component App {
    <div>
      for user in users {
        <UserCard user={user} />
      }
    </div>
  }
}
```

### Event Handling

Use `@event` syntax to bind event handlers:

```lux
client {
  component App {
    <div>
      <button @click={increment}>+1</button>
      <input @input={fn(e) { name = e.target.value }} />
      <form @submit={handle_submit}>
        // ...
      </form>
    </div>
  }
}
```

### Conditional Rendering

Use `if`/`else` inside JSX:

```lux
client {
  component App {
    <div>
      if loading {
        <p>Loading...</p>
      } else {
        <ul>
          for user in users {
            <li>{user.name}</li>
          }
        </ul>
      }
    </div>
  }
}
```

### List Rendering

Use `for` to iterate:

```lux
client {
  component TodoList {
    <ul>
      for todo in todos {
        <li class={if todo.done { "completed" } else { "" }}>
          {todo.text}
        </li>
      }
    </ul>
  }
}
```

## Calling Server Functions

The client communicates with the server by calling functions through the `server` object. Every function defined in a `server` block is available as `server.function_name()`:

```lux
server {
  fn get_users() -> [User] {
    UserModel.all()
  }

  fn create_user(name: String, email: String) -> User {
    UserModel.create({ name, email })
  }

  fn delete_user(id: Int) -> Bool {
    UserModel.delete(id)
  }
}

client {
  state users: [User] = []

  // Load on initialization
  effect {
    users = server.get_users()
  }

  // Call with arguments
  fn handle_create() {
    new_user = server.create_user(name, email)
    users = [...users, new_user]
  }

  // Call and update state
  fn handle_delete(id: Int) {
    server.delete_user(id)
    users = users.filter(fn(u) { u.id != id })
  }
}
```

All `server.fn_name()` calls are compiled to async RPC calls. Inside effects and event handlers, the compiler automatically adds `await`. See [RPC Bridge](./rpc) for details on how this works.

## Stores

For complex nested state, use stores:

```lux
client {
  store app_state = {
    user: { name: "", email: "" }
    settings: { theme: "light", notifications: true }
  }
}
```

Stores provide fine-grained reactivity for nested objects without requiring immutable update patterns.

## Lifecycle Hooks

Components have lifecycle hooks:

```lux
client {
  component Dashboard {
    onMount {
      print("Dashboard mounted")
      data = server.load_dashboard()
    }

    onUnmount {
      print("Dashboard unmounted")
    }

    <div>
      // ...
    </div>
  }
}
```

## CSS Injection

Components can include scoped styles:

```lux
client {
  component StyledButton(label) {
    css {
      .btn {
        background: blue;
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
      }
    }

    <button class="btn">{label}</button>
  }
}
```

## A Complete Example

Here is a complete client block for a simple todo application:

```lux
shared {
  type Todo {
    id: Int
    text: String
    done: Bool
  }
}

server {
  db { path: "./todos.db" }
  model Todo

  fn get_todos() -> [Todo] { TodoModel.all() }
  fn add_todo(text: String) -> Todo { TodoModel.create({ text, done: false }) }
  fn toggle_todo(id: Int) -> Todo { TodoModel.update(id, { done: !TodoModel.find(id).done }) }
  fn remove_todo(id: Int) -> Bool { TodoModel.delete(id) }
}

client {
  state todos: [Todo] = []
  state new_text = ""

  computed remaining = todos.filter(fn(t) { !t.done }).length()

  effect {
    todos = server.get_todos()
  }

  fn handle_add() {
    guard new_text.length() > 0 else { return () }
    todo = server.add_todo(new_text)
    todos = [...todos, todo]
    new_text = ""
  }

  fn handle_toggle(id: Int) {
    updated = server.toggle_todo(id)
    todos = todos.map(fn(t) { if t.id == id { updated } else { t } })
  }

  fn handle_remove(id: Int) {
    server.remove_todo(id)
    todos = todos.filter(fn(t) { t.id != id })
  }

  component App {
    <div>
      <h1>Todos ({remaining} remaining)</h1>

      <form @submit={handle_add}>
        <input value={new_text} @input={fn(e) { new_text = e.target.value }} />
        <button type="submit">Add</button>
      </form>

      <ul>
        for todo in todos {
          <li>
            <input type="checkbox" checked={todo.done} @change={fn() { handle_toggle(todo.id) }} />
            <span class={if todo.done { "done" } else { "" }}>{todo.text}</span>
            <button @click={fn() { handle_remove(todo.id) }}>x</button>
          </li>
        }
      </ul>
    </div>
  }
}
```

## Related Pages

- [Architecture Overview](./architecture) -- how the three-block model works
- [RPC Bridge](./rpc) -- how `server.fn_name()` calls work
- [Shared Block](./shared-block) -- types shared between client and server
- [Compilation](./compilation) -- how the client output is generated

For detailed reference on each reactive primitive, see the Reactive UI pages:
- [Signals](/reactivity/signals)
- [Computed Values](/reactivity/computed)
- [Effects](/reactivity/effects)
- [Components](/reactivity/components)
- [JSX](/reactivity/jsx)
- [Stores](/reactivity/stores)
- [Lifecycle](/reactivity/lifecycle)
- [Router](/reactivity/router)
