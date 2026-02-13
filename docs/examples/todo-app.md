---
title: Todo App
---

# Todo App

A full-stack todo application demonstrating shared types, server CRUD operations, client reactivity, RPC calls, and component composition.

## Full Code

Create `todo.tova`:

```tova
shared {
  type Todo {
    id: Int
    title: String
    completed: Bool
  }
}

server {
  mut todos = []
  mut next_id = 1

  fn list_todos() -> [Todo] {
    todos
  }

  fn add_todo(title) -> Todo {
    todo = Todo(next_id, title, false)
    next_id = next_id + 1
    todos = todos ++ [todo]
    todo
  }

  fn toggle_todo(id) -> Todo {
    todos = todos |> map(fn(t) {
      match t.id == id {
        true => Todo(t.id, t.title, !t.completed)
        false => t
      }
    })
    todos |> filter(fn(t) t.id == id) |> first()
  }

  fn delete_todo(id) -> Bool {
    todos = todos |> filter(fn(t) t.id != id)
    true
  }

  route GET "/api/todos" => list_todos
  route POST "/api/todos" => add_todo
  route PUT "/api/todos/:id/toggle" => toggle_todo
  route DELETE "/api/todos/:id" => delete_todo
}

client {
  state todos = []
  state new_title = ""

  computed remaining = todos |> filter(fn(t) !t.completed) |> len()
  computed total = len(todos)

  computed summary = match remaining {
    0 => "All done!"
    1 => "1 task remaining"
    n => "{n} tasks remaining"
  }

  // Load todos on mount
  effect {
    result = server.list_todos()
    todos = result
  }

  fn handle_add() {
    guard new_title != "" else { return }
    todo = server.add_todo(new_title)
    todos = todos ++ [todo]
    new_title = ""
  }

  fn handle_toggle(id) {
    updated = server.toggle_todo(id)
    todos = todos |> map(fn(t) {
      match t.id == id {
        true => updated
        false => t
      }
    })
  }

  fn handle_delete(id) {
    server.delete_todo(id)
    todos = todos |> filter(fn(t) t.id != id)
  }

  component TodoItem(todo) {
    <li class={match todo.completed { true => "done" _ => "" }}>
      <span class="todo-content" onclick={fn() handle_toggle(todo.id)}>
        <span class="check">{match todo.completed { true => "x" _ => "o" }}</span>
        <span class="title">{todo.title}</span>
      </span>
      <button class="delete-btn" onclick={fn() handle_delete(todo.id)}>
        "x"
      </button>
    </li>
  }

  component App {
    <div class="app">
      <header>
        <h1>"Todos"</h1>
        <p class="subtitle">{summary}</p>
      </header>

      <div class="input-row">
        <input
          type="text"
          placeholder="What needs to be done?"
          value={new_title}
          oninput={fn(e) new_title = e.target.value}
          onkeydown={fn(e) {
            match e.key {
              "Enter" => handle_add()
              _ => nil
            }
          }}
        />
        <button class="btn-add" onclick={fn() handle_add()}>"Add"</button>
      </div>

      <ul class="task-list">
        {todos |> map(fn(todo) TodoItem(todo))}
      </ul>

      <div class="stats">
        "{remaining} of {total} remaining"
      </div>
    </div>
  }
}
```

Run it:

```bash
tova dev .
```

## Walkthrough

### Shared Types

```tova
shared {
  type Todo {
    id: Int
    title: String
    completed: Bool
  }
}
```

The `shared` block defines types available to both server and client. The `Todo` type is a record with three fields. Types defined in `shared` ensure the server and client agree on data shapes at compile time.

### Server Block

```tova
server {
  mut todos = []
  mut next_id = 1

  fn add_todo(title) -> Todo {
    todo = Todo(next_id, title, false)
    next_id = next_id + 1
    todos = todos ++ [todo]
    todo
  }

  route POST "/api/todos" => add_todo
}
```

Key concepts:

- **`mut`** declares mutable server state that persists across requests
- **Functions** contain the business logic. `add_todo` creates a new `Todo`, appends it to the list, and returns it
- **`route`** maps HTTP methods and paths to handler functions. Parameters in the URL (like `:id`) are extracted and passed to the handler

### RPC Calls

```tova
// In the client:
todo = server.add_todo(new_title)
```

The `server.` prefix generates an RPC call to the corresponding server function. Tova compiles this to a `fetch()` call to the appropriate route, serializing arguments and deserializing the response. Shared types guarantee the data format matches.

### Client Reactivity

```tova
client {
  state todos = []
  state new_title = ""

  computed remaining = todos |> filter(fn(t) !t.completed) |> len()
}
```

- **`state`** creates reactive variables. Assigning a new value triggers reactive updates.
- **`computed`** derives values from state. `remaining` automatically recalculates whenever `todos` changes.

### Effects

```tova
effect {
  result = server.list_todos()
  todos = result
}
```

An `effect` block runs after the component mounts. This is where you perform side effects like fetching data from the server. Here, the todos are loaded from the server and stored in the reactive `todos` state.

### Guard Clauses

```tova
fn handle_add() {
  guard new_title != "" else { return }
  todo = server.add_todo(new_title)
  todos = todos ++ [todo]
  new_title = ""
}
```

`guard` provides early return when a condition is not met. If `new_title` is empty, the function returns without doing anything.

### Component Composition

```tova
component TodoItem(todo) {
  <li class={match todo.completed { true => "done" _ => "" }}>
    <span onclick={fn() handle_toggle(todo.id)}>{todo.title}</span>
    <button onclick={fn() handle_delete(todo.id)}>"x"</button>
  </li>
}

component App {
  <ul>
    {todos |> map(fn(todo) TodoItem(todo))}
  </ul>
}
```

Components can accept parameters and be composed together. The `App` component maps over the `todos` list, rendering a `TodoItem` for each entry. When `todos` changes, only the affected list items update.

### Inline Match in JSX

```tova
<li class={match todo.completed { true => "done" _ => "" }}>
```

Match expressions can be used inline within JSX attributes. This sets the CSS class based on the todo's completion status.

## What's Next

- Add real-time updates with the [Chat App](./chat.md) example
- Split into multiple servers with [Multi-Server Architecture](./multi-server.md)
- Add authentication with [Auth Flow](./auth-flow.md)
