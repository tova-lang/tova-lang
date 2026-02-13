# Async Programming

Tova has first-class support for asynchronous programming with `async` and `await` keywords. Since Tova compiles to JavaScript, async operations map directly to JavaScript promises with zero overhead.

## Async Functions

Declare an asynchronous function by prefixing `fn` with `async`:

```tova
async fn fetch_data(url) {
  response = await fetch(url)
  data = await response.json()
  data
}
```

An `async fn` always returns a promise. Within the function body, you can use `await` to pause execution until a promise resolves.

## Await

The `await` keyword pauses the async function until the awaited promise resolves, then returns the result:

```tova
async fn get_user(id) {
  response = await fetch("/api/users/{id}")
  user = await response.json()
  user
}
```

You can `await` any expression that returns a promise:

```tova
async fn load_config() {
  response = await fetch("/config.json")
  config = await response.json()
  print("Loaded config: {config.app_name}")
  config
}
```

## Sequential vs Parallel Awaits

### Sequential

By default, `await` calls run one after another:

```tova
async fn load_page_data() {
  user = await fetch_user(current_user_id)
  posts = await fetch_posts(user.id)
  comments = await fetch_comments(posts[0].id)

  // Each await waits for the previous one to complete
  { user, posts, comments }
}
```

### Parallel

To run multiple async operations concurrently, use `Promise.all()`:

```tova
async fn load_dashboard() {
  results = await Promise.all([
    fetch_user(user_id),
    fetch_notifications(),
    fetch_stats()
  ])

  let [user, notifications, stats] = results
  { user, notifications, stats }
}
```

This starts all three requests simultaneously and waits for all of them to finish, which is much faster than sequential awaits when the operations are independent.

## Async Lambdas

Anonymous functions can be async too:

```tova
handler = async fn(request) {
  data = await process(request.body)
  { status: 200, body: data }
}
```

```tova
items = ["url1", "url2", "url3"]
results = await Promise.all(
  items.map(async fn(url) {
    response = await fetch(url)
    await response.json()
  })
)
```

## Error Handling in Async Code

### With Try/Catch

Since `await` can reject (throw), use `try`/`catch` for JavaScript interop:

```tova
async fn safe_fetch(url) {
  try {
    response = await fetch(url)
    if response.ok {
      Ok(await response.json())
    } else {
      Err("HTTP {response.status}")
    }
  } catch err {
    Err("Network error: {err.message}")
  }
}
```

### With Result

Wrap async results in Result for idiomatic Tova error handling:

```tova
async fn fetch_user(id) -> Result<User, String> {
  try {
    response = await fetch("/api/users/{id}")
    if response.ok {
      data = await response.json()
      Ok(data)
    } else {
      Err("User not found")
    }
  } catch err {
    Err("Request failed: {err.message}")
  }
}

async fn display_user(id) {
  match await fetch_user(id) {
    Ok(user) => print("Hello, {user.name}!")
    Err(error) => print("Error: {error}")
  }
}
```

## Using with the Fetch API

The browser's `fetch` API is the most common use case for async in Tova:

### GET Request

```tova
async fn get_todos() {
  response = await fetch("/api/todos")
  todos = await response.json()
  todos
}
```

### POST Request

```tova
async fn create_todo(title) {
  response = await fetch("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title, completed: false })
  })
  created = await response.json()
  created
}
```

### PUT Request

```tova
async fn update_todo(id, updates) {
  response = await fetch("/api/todos/{id}", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates)
  })
  await response.json()
}
```

### DELETE Request

```tova
async fn delete_todo(id) {
  await fetch("/api/todos/{id}", {
    method: "DELETE"
  })
}
```

## Async in Client Blocks

In Tova's full-stack architecture, async is commonly used in client blocks with `effect`:

```tova
client {
  state users = []
  state loading = true

  effect {
    data = await fetch("/api/users")
    users_data = await data.json()
    users = users_data
    loading = false
  }

  component UserList {
    if loading {
      <p>"Loading..."</p>
    } else {
      <ul>
        for user in users {
          <li>"{user.name}"</li>
        }
      </ul>
    }
  }
}
```

## Practical Tips

**Prefer parallel when possible.** If two async operations do not depend on each other, run them with `Promise.all()` instead of awaiting them sequentially. This can dramatically improve performance:

```tova
// Slow: sequential (total time = time_a + time_b)
a = await fetch_a()
b = await fetch_b()

// Fast: parallel (total time = max(time_a, time_b))
results = await Promise.all([fetch_a(), fetch_b()])
let [a, b] = results
```

**Always handle errors.** Every `await` can fail. Wrap fetch calls in `try`/`catch` or return `Result` types to handle failures gracefully.

**Keep async boundaries clear.** An `async fn` returns a promise, which means callers must `await` it. Be aware of which functions in your codebase are async and which are synchronous.

**Use async lambdas for inline handlers:**

```tova
button.on("click", async fn() {
  data = await save_changes()
  update_ui(data)
})
```
