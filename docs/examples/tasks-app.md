---
title: Tasks App
---

# Tasks App

A full-stack task management application with SQLite persistence, TailwindCSS styling, priority levels, filtering, search, and complete CRUD operations. Demonstrates **multi-file architecture** -- server logic lives in its own file, separate from shared types and client UI.

## Project Structure

```
tasks-app/
  src/
    app.tova       # Shared types + client UI (components, state, effects)
    server.tova    # Server block (database, ORM, CRUD functions, routes)
```

## Full Code

Create a new project:

```bash
tova new tasks-app
cd tasks-app
```

### `src/server.tova` -- Server Logic

Create `src/server.tova` with the database config, ORM model, CRUD functions, and routes:

```tova
// Server — Database, ORM, CRUD Functions & Routes

server {
  db {
    driver: "sqlite"
    path: "tasks.db"
  }

  model Task {
    title: String
    description: String
    priority: String
    completed: Bool
    created_at: String
  }

  // CREATE
  fn create_task(title: String, description: String, priority: String) -> Task {
    Task.create({
      title: title,
      description: description,
      priority: priority,
      completed: false,
      created_at: Date.new().toISOString()
    })
  }

  // READ
  fn list_tasks() -> [Task] {
    Task.all()
  }

  fn get_task(id: Int) -> Task {
    Task.find(id)
  }

  // UPDATE
  fn update_task(id: Int, title: String, description: String, priority: String) {
    task = Task.find(id)
    guard task != nil else { return nil }
    Task.update(id, {
      title: title,
      description: description,
      priority: priority
    })
    Task.find(id)
  }

  fn toggle_task(id: Int) {
    task = Task.find(id)
    guard task != nil else { return nil }
    Task.update(id, { completed: not task.completed })
    Task.find(id)
  }

  // DELETE
  fn delete_task(id: Int) {
    task = Task.find(id)
    guard task != nil else { return false }
    Task.delete(id)
    true
  }

  fn delete_completed() {
    completed = Task.where({ completed: true })
    for task in completed {
      Task.delete(task.id)
    }
    true
  }

  // Routes
  route GET    "/api/tasks"              => list_tasks
  route GET    "/api/tasks/:id"          => get_task
  route POST   "/api/tasks"              => create_task
  route PUT    "/api/tasks/:id"          => update_task
  route PUT    "/api/tasks/:id/toggle"   => toggle_task
  route DELETE "/api/tasks/:id"          => delete_task
  route DELETE "/api/tasks/completed"    => delete_completed
}
```

### `src/app.tova` -- Shared Types & Client UI

Replace `src/app.tova` with shared types and client components:

```tova
// Tasks App — Shared Types & Client UI
// Server logic lives in server.tova

shared {
  type Task {
    id: Int
    title: String
    description: String
    priority: String
    completed: Bool
    created_at: String
  }
}

client {
  state tasks: [Task] = []
  state filter_mode = "all"
  state search_query = ""
  state show_form = false
  state editing_id = 0

  // Form state
  state form_title = ""
  state form_description = ""
  state form_priority = "medium"

  // Computed values
  computed total_count = len(tasks)
  computed completed_count = len([t for t in tasks if t.completed])
  computed pending_count = len(tasks) - len([t for t in tasks if t.completed])

  // Load tasks on mount
  effect {
    tasks = server.list_tasks()
  }

  fn refresh_tasks() {
    tasks = server.list_tasks()
  }

  fn reset_form() {
    form_title = ""
    form_description = ""
    form_priority = "medium"
    editing_id = 0
    show_form = false
  }

  fn handle_submit() {
    if form_title != "" {
      if editing_id > 0 {
        server.update_task(editing_id, form_title, form_description, form_priority)
      } else {
        server.create_task(form_title, form_description, form_priority)
      }
      reset_form()
      refresh_tasks()
    }
  }

  fn handle_edit(task) {
    form_title = task.title
    form_description = task.description
    form_priority = task.priority
    editing_id = task.id
    show_form = true
  }

  fn handle_toggle(id) {
    server.toggle_task(id)
    refresh_tasks()
  }

  fn handle_delete(id) {
    server.delete_task(id)
    refresh_tasks()
  }

  fn handle_clear_completed() {
    server.delete_completed()
    refresh_tasks()
  }

  fn get_priority_badge(p) {
    match p {
      "high"   => "bg-red-100 text-red-700 border border-red-200"
      "medium" => "bg-amber-100 text-amber-700 border border-amber-200"
      "low"    => "bg-green-100 text-green-700 border border-green-200"
      _        => "bg-gray-100 text-gray-700 border border-gray-200"
    }
  }

  fn get_filtered_tasks() {
    base = match filter_mode {
      "completed" => [t for t in tasks if t.completed]
      "pending"   => [t for t in tasks if not t.completed]
      "high"      => [t for t in tasks if t.priority == "high"]
      "medium"    => [t for t in tasks if t.priority == "medium"]
      "low"       => [t for t in tasks if t.priority == "low"]
      _           => tasks
    }
    if search_query == "" {
      base
    } else {
      [t for t in base if t.title.includes(search_query) or t.description.includes(search_query)]
    }
  }

  component StatsBar {
    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <p class="text-sm text-gray-500">"Total"</p>
        <p class="text-2xl font-bold text-gray-900">"{total_count}"</p>
      </div>
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <p class="text-sm text-gray-500">"Pending"</p>
        <p class="text-2xl font-bold text-amber-600">"{pending_count}"</p>
      </div>
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <p class="text-sm text-gray-500">"Done"</p>
        <p class="text-2xl font-bold text-green-600">"{completed_count}"</p>
      </div>
    </div>
  }

  component TaskForm {
    <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">
        if editing_id > 0 {
          "Edit Task"
        } else {
          "New Task"
        }
      </h2>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">"Title"</label>
          <input
            type="text"
            placeholder="What needs to be done?"
            value={form_title}
            on:input={fn(e) form_title = e.target.value}
            class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">"Description"</label>
          <input
            type="text"
            placeholder="Add some details..."
            value={form_description}
            on:input={fn(e) form_description = e.target.value}
            class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">"Priority"</label>
          <div class="flex gap-3">
            <button
              on:click={fn() form_priority = "low"}
              class="px-4 py-2 rounded-lg text-sm font-medium border bg-green-50 text-green-600 border-green-200 hover:bg-green-100"
            >"Low"</button>
            <button
              on:click={fn() form_priority = "medium"}
              class="px-4 py-2 rounded-lg text-sm font-medium border bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100"
            >"Medium"</button>
            <button
              on:click={fn() form_priority = "high"}
              class="px-4 py-2 rounded-lg text-sm font-medium border bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
            >"High"</button>
          </div>
        </div>
        <div class="flex gap-3 pt-2">
          <button
            on:click={handle_submit}
            class="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 shadow-sm"
          >
            if editing_id > 0 {
              "Update Task"
            } else {
              "Add Task"
            }
          </button>
          <button
            on:click={reset_form}
            class="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200"
          >"Cancel"</button>
        </div>
      </div>
    </div>
  }

  component TaskItem(task) {
    <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all">
      <div class="flex items-start gap-3">
        <button
          on:click={fn() handle_toggle(task.id)}
          class="mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center border-gray-300 hover:border-indigo-400"
        >
          if task.completed {
            <span class="text-green-500 text-xs">"&#10003;"</span>
          }
        </button>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <h3 class="font-medium text-gray-900">"{task.title}"</h3>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium {get_priority_badge(task.priority)}">
              "{task.priority}"
            </span>
          </div>
          if task.description != "" {
            <p class="text-sm text-gray-500">"{task.description}"</p>
          }
          <p class="text-xs text-gray-400 mt-1">"{task.created_at}"</p>
        </div>
        <div class="flex gap-1">
          <button
            on:click={fn() handle_edit(task)}
            class="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
          >"&#9998;"</button>
          <button
            on:click={fn() handle_delete(task.id)}
            class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
          >"&#10005;"</button>
        </div>
      </div>
    </div>
  }

  component FilterBar {
    <div class="flex flex-wrap items-center gap-2 mb-6">
      <div class="flex-1">
        <input
          type="text"
          placeholder="Search tasks..."
          value={search_query}
          on:input={fn(e) search_query = e.target.value}
          class="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
        />
      </div>
      <div class="flex gap-1 bg-gray-100 p-1 rounded-lg">
        <button on:click={fn() filter_mode = "all"} class="px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 hover:bg-white">"All"</button>
        <button on:click={fn() filter_mode = "pending"} class="px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 hover:bg-white">"Pending"</button>
        <button on:click={fn() filter_mode = "completed"} class="px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 hover:bg-white">"Done"</button>
        <button on:click={fn() filter_mode = "high"} class="px-3 py-1.5 rounded-md text-xs font-medium text-red-600 hover:bg-white">"High"</button>
        <button on:click={fn() filter_mode = "medium"} class="px-3 py-1.5 rounded-md text-xs font-medium text-amber-600 hover:bg-white">"Med"</button>
        <button on:click={fn() filter_mode = "low"} class="px-3 py-1.5 rounded-md text-xs font-medium text-green-600 hover:bg-white">"Low"</button>
      </div>
    </div>
  }

  component App {
    <div class="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
      <div class="max-w-2xl mx-auto px-4 py-8">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h1 class="text-3xl font-bold text-gray-900">"Tasks"</h1>
            <p class="text-gray-500 text-sm mt-1">"Manage your tasks efficiently"</p>
          </div>
          <button
            on:click={fn() show_form = not show_form}
            class="px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 shadow-sm flex items-center gap-2"
          >
            "+ New Task"
          </button>
        </div>

        <StatsBar />

        if show_form {
          <TaskForm />
        }

        <FilterBar />

        for task in get_filtered_tasks() {
          <div class="mb-3">
            <TaskItem task={task} />
          </div>
        }

        if completed_count > 0 {
          <div class="mt-6 text-center">
            <button
              on:click={handle_clear_completed}
              class="text-sm text-red-500 hover:text-red-700 font-medium"
            >"Clear completed tasks"</button>
          </div>
        }
      </div>
    </div>
  }
}
```

Run it:

```bash
tova dev src
```

## Walkthrough

### Multi-File Architecture

Tova automatically **merges** all `.tova` files in the same directory before compilation. No imports are needed between files in the same directory -- the compiler combines all same-type blocks into a unified output:

- **`server.tova`** -- Contains only a `server` block. The `model Task` declaration repeats the field names so the ORM can generate the database table and CRUD methods independently.
- **`app.tova`** -- Contains a `shared` block (the `Task` type definition shared between server and client) and a `client` block (all UI components, state, and event handlers).

When `tova dev src` runs, the compiler:

1. Finds both `server.tova` and `app.tova` in the `src/` directory
2. Merges the `server {}` blocks from both files (only `server.tova` has one here)
3. Merges the `shared {}` blocks (only `app.tova` has one)
4. Merges the `client {}` blocks (only `app.tova` has one)
5. Validates for duplicate declarations across files
6. Generates unified output: `src.shared.js`, `src.server.js`, `src.client.js`

Shared types from `app.tova` are available to the server code in `server.tova`. Client code can call `server.list_tasks()` and it routes to the function defined in `server.tova` via the RPC bridge -- all without any imports between the two files.

### SQLite Database Configuration

```tova
server {
  db {
    driver: "sqlite"
    path: "tasks.db"
  }

  model Task {
    title: String
    description: String
    priority: String
    completed: Bool
    created_at: String
  }
}
```

The `db` block configures the database driver and file path. Tova supports `sqlite`, `postgres`, and `mysql` drivers. The `model` block defines the ORM schema -- Tova automatically creates the `tasks` table (pluralized from `Task`) and generates CRUD methods:

- `Task.all()` -- fetch all rows
- `Task.find(id)` -- find by primary key
- `Task.create(data)` -- insert a new row
- `Task.update(id, data)` -- update specific fields
- `Task.delete(id)` -- remove a row
- `Task.where(conditions)` -- query with filters

### Guard Clauses for Safety

```tova
fn update_task(id: Int, title: String, description: String, priority: String) {
  task = Task.find(id)
  guard task != nil else { return nil }
  Task.update(id, {
    title: title,
    description: description,
    priority: priority
  })
  Task.find(id)
}
```

`guard` provides early returns when conditions aren't met. If the task doesn't exist, the function returns `nil` immediately instead of attempting to update a nonexistent row.

### Computed Values

```tova
computed total_count = len(tasks)
computed completed_count = len([t for t in tasks if t.completed])
computed pending_count = len(tasks) - len([t for t in tasks if t.completed])
```

Computed values are derived from reactive state. They automatically recalculate whenever `tasks` changes. List comprehensions (`[t for t in tasks if t.completed]`) provide a concise way to filter collections.

### Match-Based Filtering

```tova
fn get_filtered_tasks() {
  base = match filter_mode {
    "completed" => [t for t in tasks if t.completed]
    "pending"   => [t for t in tasks if not t.completed]
    "high"      => [t for t in tasks if t.priority == "high"]
    _           => tasks
  }
  if search_query == "" {
    base
  } else {
    [t for t in base if t.title.includes(search_query) or t.description.includes(search_query)]
  }
}
```

`match` expressions work like enhanced switch statements with pattern matching. The `_` wildcard catches all remaining cases. The function chains filtering by status/priority with text search.

### Conditional Component Rendering

```tova
component App {
  if show_form {
    <TaskForm />
  }

  for task in get_filtered_tasks() {
    <div class="mb-3">
      <TaskItem task={task} />
    </div>
  }

  if completed_count > 0 {
    <div class="mt-6 text-center">
      <button on:click={handle_clear_completed}>"Clear completed tasks"</button>
    </div>
  }
}
```

Tova uses `if` and `for` directly inside component templates. `if show_form` conditionally renders the task form. `for task in get_filtered_tasks()` iterates over the filtered list, rendering a `TaskItem` for each entry. Components reactively update when the underlying state changes.

### Form State Management

```tova
fn handle_submit() {
  if form_title != "" {
    if editing_id > 0 {
      server.update_task(editing_id, form_title, form_description, form_priority)
    } else {
      server.create_task(form_title, form_description, form_priority)
    }
    reset_form()
    refresh_tasks()
  }
}
```

The form handles both creating and editing tasks. When `editing_id > 0`, it calls `server.update_task` (RPC to the server); otherwise it calls `server.create_task`. After submission, `reset_form()` clears the form fields and `refresh_tasks()` reloads from the server.

### TailwindCSS Styling

Tova's dev server includes TailwindCSS out of the box. Use utility classes directly in your component templates:

```tova
<button
  class="px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 shadow-sm"
>
  "+ New Task"
</button>
```

### Dynamic CSS Classes with Match

```tova
fn get_priority_badge(p) {
  match p {
    "high"   => "bg-red-100 text-red-700 border border-red-200"
    "medium" => "bg-amber-100 text-amber-700 border border-amber-200"
    "low"    => "bg-green-100 text-green-700 border border-green-200"
    _        => "bg-gray-100 text-gray-700 border border-gray-200"
  }
}
```

Use `match` expressions to dynamically compute CSS class strings based on data values. This pattern keeps styling logic clean and readable.

## What's Next

- Learn about database patterns with [Database & Models](./database.md)
- Add authentication with [Auth Flow](./auth-flow.md)
- Explore real-time features with the [Chat App](./chat.md)
