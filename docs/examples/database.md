---
title: Database & Models
---

# Database & Models

Lux includes a built-in ORM for database operations. This example demonstrates database configuration, model definitions, CRUD routes, and query patterns.

## Full Code

Create `blog.lux`:

```lux
shared {
  type Post {
    id: Int
    title: String
    body: String
    published: Bool
    author_id: Int
    created_at: String
  }

  type Author {
    id: Int
    name: String
    email: String
  }

  type PostWithAuthor {
    post: Post
    author: Author
  }
}

server {
  db {
    adapter: "sqlite"
    database: "blog.db"
  }

  model Author {
    name: String
    email: String
  }

  model Post {
    title: String
    body: String
    published: Bool
    author_id: Int
    created_at: String
  }

  // ── Author CRUD ─────────────────────────────────────────────

  fn list_authors() -> [Author] {
    Author.all()
  }

  fn get_author(id) -> Author {
    Author.find(id)
  }

  fn create_author(name, email) -> Author {
    Author.create({ name: name, email: email })
  }

  // ── Post CRUD ───────────────────────────────────────────────

  fn list_posts() -> [Post] {
    Post.where({ published: true })
  }

  fn get_post(id) -> PostWithAuthor {
    post = Post.find(id)
    guard post != nil else {
      return Err("Post not found")
    }

    author = Author.find(post.author_id)
    Ok(PostWithAuthor(post, author))
  }

  fn create_post(req, title, body) -> Post {
    // req.user is set by auth middleware
    Post.create({
      title: title,
      body: body,
      published: false,
      author_id: req.user.id,
      created_at: Date.new().toISOString()
    })
  }

  fn update_post(req, id, title, body) -> Post {
    post = Post.find(id)
    guard post != nil else {
      return Err("Post not found")
    }

    // Only the author can update their own post
    guard post.author_id == req.user.id else {
      return Err("Not authorized")
    }

    Post.update(id, { title: title, body: body })
    Post.find(id)
  }

  fn publish_post(req, id) -> Post {
    post = Post.find(id)
    guard post != nil else {
      return Err("Post not found")
    }

    guard post.author_id == req.user.id else {
      return Err("Not authorized")
    }

    Post.update(id, { published: true })
    Post.find(id)
  }

  fn delete_post(req, id) -> Bool {
    post = Post.find(id)
    guard post != nil else {
      return Err("Post not found")
    }

    guard post.author_id == req.user.id else {
      return Err("Not authorized")
    }

    Post.delete(id)
    Ok(true)
  }

  // ── Queries ─────────────────────────────────────────────────

  fn posts_by_author(author_id) -> [Post] {
    Post.where({ author_id: author_id, published: true })
  }

  fn recent_posts(limit) -> [Post] {
    Post.where({ published: true })
      |> sorted(fn(a, b) b.created_at > a.created_at)
      |> take(limit)
  }

  fn search_posts(query) -> [Post] {
    Post.where({ published: true })
      |> filter(fn(p) {
        p.title.includes(query) || p.body.includes(query)
      })
  }

  // ── Routes ──────────────────────────────────────────────────

  // Public routes
  route GET "/api/posts" => list_posts
  route GET "/api/posts/:id" => get_post
  route GET "/api/posts/recent/:limit" => recent_posts
  route GET "/api/posts/search" => search_posts
  route GET "/api/authors" => list_authors
  route GET "/api/authors/:id" => get_author
  route GET "/api/authors/:id/posts" => posts_by_author

  // Protected routes (require auth middleware)
  route POST "/api/posts" => create_post
  route PUT "/api/posts/:id" => update_post
  route PUT "/api/posts/:id/publish" => publish_post
  route DELETE "/api/posts/:id" => delete_post
  route POST "/api/authors" => create_author
}

client {
  state posts = []
  state current_post = nil
  state search_query = ""
  state view = "list"  // "list" | "detail" | "search"

  computed filtered_posts = match search_query {
    "" => posts
    q => posts |> filter(fn(p) {
      p.title.includes(q) || p.body.includes(q)
    })
  }

  effect {
    result = server.list_posts()
    posts = result
  }

  fn view_post(id) {
    result = server.get_post(id)
    match result {
      Ok(data) => {
        current_post = data
        view = "detail"
      }
      Err(msg) => print("Error: {msg}")
    }
  }

  fn handle_search(query) {
    search_query = query
  }

  component PostCard(post) {
    <div class="post-card" onclick={fn() view_post(post.id)}>
      <h3>{post.title}</h3>
      <p class="preview">{post.body |> take(100)}</p>
      <span class="date">{post.created_at}</span>
    </div>
  }

  component PostDetail {
    <div class="post-detail">
      <button onclick={fn() view = "list"}>"Back"</button>
      <h2>{current_post.post.title}</h2>
      <p class="author">"By {current_post.author.name}"</p>
      <div class="body">{current_post.post.body}</div>
    </div>
  }

  component App {
    <div class="app">
      <header>
        <h1>"Blog"</h1>
        <input
          type="text"
          placeholder="Search posts..."
          value={search_query}
          oninput={fn(e) handle_search(e.target.value)}
        />
      </header>

      {match view {
        "list" => <div class="post-list">
          {filtered_posts |> map(fn(post) PostCard(post))}
        </div>
        "detail" => PostDetail()
        _ => <p>"Loading..."</p>
      }}
    </div>
  }
}
```

Run it:

```bash
lux dev .
```

## Walkthrough

### Database Configuration

```lux
server {
  db {
    adapter: "sqlite"
    database: "blog.db"
  }
}
```

The `db` block configures the database connection. Supported adapters include:

| Adapter | Value | Description |
|---------|-------|-------------|
| SQLite | `"sqlite"` | File-based, no setup required |
| PostgreSQL | `"postgres"` | Full-featured relational database |

For PostgreSQL, provide a connection string:

```lux
db {
  adapter: "postgres"
  url: process.env["DATABASE_URL"]
}
```

### Model Definitions

```lux
model Author {
  name: String
  email: String
}

model Post {
  title: String
  body: String
  published: Bool
  author_id: Int
  created_at: String
}
```

A `model` defines the fields and their types. Lux generates a database table and provides ORM methods on the model.

The `id` field is automatically added as an auto-incrementing primary key -- you do not need to declare it.

### ORM Methods

Each model provides these built-in query methods:

| Method | Description |
|--------|-------------|
| `Model.all()` | Fetch all records |
| `Model.find(id)` | Find a record by primary key |
| `Model.find_by(fields)` | Find the first record matching field values |
| `Model.where(fields)` | Find all records matching field values |
| `Model.create(fields)` | Insert a new record and return it |
| `Model.update(id, fields)` | Update a record by primary key |
| `Model.delete(id)` | Delete a record by primary key |

### Creating Records

```lux
fn create_post(req, title, body) -> Post {
  Post.create({
    title: title,
    body: body,
    published: false,
    author_id: req.user.id,
    created_at: Date.new().toISOString()
  })
}
```

`Model.create(fields)` inserts a new row and returns the created record with its generated `id`.

### Querying Records

```lux
// Find all published posts
fn list_posts() -> [Post] {
  Post.where({ published: true })
}

// Find a single post with its author
fn get_post(id) -> PostWithAuthor {
  post = Post.find(id)
  author = Author.find(post.author_id)
  PostWithAuthor(post, author)
}

// Composite queries with pipes
fn recent_posts(limit) -> [Post] {
  Post.where({ published: true })
    |> sorted(fn(a, b) b.created_at > a.created_at)
    |> take(limit)
}
```

Use `where` for filtered queries and pipe the results through standard library functions (`sorted`, `filter`, `take`) for additional processing.

### Relations

While Lux does not have a formal `has_many` / `belongs_to` DSL, you can model relations through foreign key fields and manual joins:

```lux
// Author has many Posts (via author_id)
fn posts_by_author(author_id) -> [Post] {
  Post.where({ author_id: author_id, published: true })
}

// Post belongs to Author (via author_id)
fn get_post(id) -> PostWithAuthor {
  post = Post.find(id)
  author = Author.find(post.author_id)
  PostWithAuthor(post, author)
}
```

### Authorization Guards

```lux
fn update_post(req, id, title, body) -> Post {
  post = Post.find(id)
  guard post != nil else {
    return Err("Post not found")
  }

  guard post.author_id == req.user.id else {
    return Err("Not authorized")
  }

  Post.update(id, { title: title, body: body })
  Post.find(id)
}
```

Guard clauses provide a clean pattern for authorization checks:
1. Find the resource
2. Verify it exists
3. Verify the current user owns it
4. Proceed with the operation

Each guard clause short-circuits the function with an error if the condition fails.

### Search Patterns

```lux
fn search_posts(query) -> [Post] {
  Post.where({ published: true })
    |> filter(fn(p) {
      p.title.includes(query) || p.body.includes(query)
    })
}
```

For simple text search, fetch records and filter in application code. For production workloads with large datasets, use database-level full-text search through raw SQL queries.

## Migrations

Use the migration commands to manage database schema changes:

```bash
# Create a new migration
lux migrate:create add_posts_table

# Run pending migrations
lux migrate:up

# Check migration status
lux migrate:status
```

See the [CLI Reference](../tooling/cli.md) for more details on migration commands.

## What's Next

- Add authentication with [Auth Flow](./auth-flow.md)
- Scale with [Multi-Server Architecture](./multi-server.md)
- Explore the full [CLI Reference](../tooling/cli.md)
