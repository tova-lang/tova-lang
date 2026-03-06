<script setup>
const cliBasicCode = `// CLI Tools in Tova
// The cli block defines a complete command-line application

// cli {
//   name: "greeter"
//   version: "1.0.0"
//   description: "A friendly greeting tool"
//
//   fn hello(name: String, --loud: Bool) {
//     greeting = "Hello, {name}!"
//     if loud {
//       print(upper(greeting))
//     } else {
//       print(greeting)
//     }
//   }
// }

// Usage:
//   greeter hello Alice            -> Hello, Alice!
//   greeter hello Alice --loud     -> HELLO, ALICE!
//   greeter --help                 -> shows help text
//   greeter hello --help           -> shows hello command help

// For this playground demo, we simulate the CLI behavior:
fn greet(name, loud) {
  greeting = "Hello, {name}!"
  if loud {
    print(upper(greeting))
  } else {
    print(greeting)
  }
}

greet("Alice", false)
greet("Bob", true)`

const cliProjectCode = `// PROJECT: File Organizer CLI Tool
// A tool that organizes files by extension into folders

// cli {
//   name: "organize"
//   version: "1.0.0"
//   description: "Organize files by type into folders"
//
//   fn sort(directory: String, --dry-run: Bool, --verbose: Bool) {
//     // Scan directory and group files by extension
//     // Move each file to its category folder
//   }
//
//   fn undo(directory: String) {
//     // Reverse the last organization
//   }
//
//   fn stats(directory: String, --format: String = "table") {
//     // Show file type distribution
//   }
// }

// Simulating the stats command output:
fn show_stats(files) {
  // Group files by extension
  var groups = {}
  for file in files {
    parts = split(file, ".")
    ext = if len(parts) > 1 { last(parts) } else { "none" }
    if groups[ext] == undefined {
      groups[ext] = []
    }
    groups[ext].push(file)
  }

  print("File Distribution:")
  print(repeat("-", 30))
  for ext in keys(groups) {
    file_count = len(groups[ext])
    bar = repeat("=", file_count * 2)
    print("  .{pad_end(ext, 6)} {bar} ({file_count})")
  }
}

files = [
  "report.pdf", "notes.txt", "photo.jpg",
  "data.csv", "readme.md", "app.js",
  "style.css", "logo.png", "backup.txt",
  "invoice.pdf", "config.json", "avatar.jpg"
]

show_stats(files)
print("")
print("Organizing would create: documents/, images/, code/, data/")`

const cliInteractiveCode = `// Interactive CLI features
// Tova provides built-in prompt functions for user interaction

// ask(prompt) — get text input
// confirm(prompt) — get yes/no
// choose(prompt, options) — single selection
// choose_many(prompt, options) — multiple selection
// secret(prompt) — hidden input (for passwords)

// Example: project scaffolding wizard
// fn setup() {
//   name = ask("Project name?")
//   lang = choose("Language:", ["Tova", "JavaScript", "TypeScript"])
//   features = choose_many("Features:", ["tests", "linting", "ci", "docker"])
//   use_git = confirm("Initialize git?")
//
//   print("Creating {name} with {lang}...")
//   for feature in features {
//     print("  Adding {feature}")
//   }
//   if use_git { print("  Initializing git repo") }
// }

// Simulating the output:
print("Project Setup Wizard")
print(repeat("=", 30))
print("")
print("> Project name? my-app")
print("> Language: Tova")
print("> Features: tests, linting, ci")
print("> Initialize git? yes")
print("")
print("Creating my-app with Tova...")
print("  Adding tests")
print("  Adding linting")
print("  Adding ci")
print("  Initializing git repo")
print("")
print("Done! cd my-app to get started.")`

const edgeBasicCode = `// Edge Computing in Tova
// Deploy serverless functions to the edge

// edge {
//   target: "cloudflare"
//   kv CACHE
//   env API_URL = "https://api.example.com"
//
//   route GET "/api/hello" => fn(req) {
//     { message: "Hello from the edge!" }
//   }
//
//   route GET "/api/cached/:key" => fn(req, params) {
//     cached = CACHE.get(params.key)
//     if cached != null {
//       { value: cached, source: "cache" }
//     } else {
//       { error: "Not found" }
//     }
//   }
// }

// Edge functions run in 300+ data centers worldwide
// They handle: API routes, caching, auth, scheduled jobs

// Simulating edge handler behavior:
fn handle_request(method, path) {
  match path {
    "/api/hello" => {
      print("{method} {path} -> 200")
      print("  { message: 'Hello from the edge!' }")
    }
    "/api/status" => {
      print("{method} {path} -> 200")
      print("  { status: 'healthy', region: 'us-east-1' }")
    }
    _ => {
      print("{method} {path} -> 404")
      print("  { error: 'Not Found' }")
    }
  }
}

handle_request("GET", "/api/hello")
print("")
handle_request("GET", "/api/status")
print("")
handle_request("GET", "/api/unknown")`

const edgeFullCode = `// Full edge application with bindings and scheduled jobs

// edge "api" {
//   target: "cloudflare"
//   kv SESSIONS
//   sql DB
//   queue EMAILS
//   secret JWT_SECRET
//   env APP_ENV = "production"
//
//   route GET "/api/users" => fn(req) {
//     users = DB.prepare("SELECT * FROM users").all()
//     { users: users }
//   }
//
//   route POST "/api/login" => fn(req) {
//     // Authenticate and create session
//     token = create_jwt(req.body, JWT_SECRET)
//     SESSIONS.put(token, req.body.email)
//     { token: token }
//   }
//
//   schedule "cleanup" cron("0 0 * * *") {
//     // Run daily at midnight
//     expired = SESSIONS.list({ prefix: "expired:" })
//     for key in expired {
//       SESSIONS.delete(key)
//     }
//   }
//
//   consume EMAILS fn(messages) {
//     for msg in messages {
//       send_email(msg.to, msg.subject, msg.body)
//     }
//   }
// }

// Named edge blocks generate separate output files:
//   tova build -> app.edge.api.js

// Simulating the edge application:
print("Edge Application: api")
print(repeat("=", 35))
print("")
print("Target:    Cloudflare Workers")
print("Bindings:  SESSIONS (KV), DB (SQL), EMAILS (Queue)")
print("Secrets:   JWT_SECRET")
print("")
print("Routes:")
print("  GET  /api/users  -> query DB")
print("  POST /api/login  -> create JWT + session")
print("")
print("Scheduled:")
print("  cleanup -> 0 0 * * * (daily at midnight)")
print("")
print("Consumers:")
print("  EMAILS -> process email queue")`
</script>

# Chapter 16: CLI Tools and Edge Computing

Tova gives you first-class language support for two things that usually require mountains of boilerplate: command-line tools and edge-deployed serverless functions. The `cli` block turns a few lines of Tova into a polished CLI application with argument parsing, help text, and colored output. The `edge` block deploys your code to the world's edge networks with built-in bindings for KV stores, databases, queues, and more.

By the end of this chapter, you'll build a file organizer CLI tool and understand how to deploy Tova to five different edge platforms.

## Part 1: CLI Tools

### The cli Block

Every CLI tool in Tova starts with a `cli` block at the top level of your file:

```tova
cli {
  name: "greet"
  version: "1.0.0"
  description: "A friendly greeting tool"

  fn hello(name: String) {
    print("Hello, {name}!")
  }
}
```

That is a complete, working CLI application. Run `tova build` and you get a standalone executable that handles argument parsing, validation, help text, and error messages. No external libraries, no setup.

```bash
$ greet hello Alice
Hello, Alice!

$ greet --help
greet v1.0.0 - A friendly greeting tool

COMMANDS:
  hello  <name>

$ greet hello --help
Usage: greet hello <name>

ARGUMENTS:
  name    String (required)
```

<TryInPlayground :code="cliBasicCode" label="CLI Basics" />

### Configuration

The config fields at the top of a `cli` block define your tool's identity:

```tova
cli {
  name: "deploy"
  version: "2.5.0"
  description: "Deploy applications to production"

  // commands go here...
}
```

| Field | Purpose |
|-------|---------|
| `name` | Tool name, shown in help text |
| `version` | Shown with `--version` flag |
| `description` | One-line summary in help output |

All three are optional, but including them makes your tool feel professional. The `--version` flag is auto-generated when you provide a `version` field.

### Commands as Functions

Each `fn` inside a `cli` block becomes a subcommand. The function name is the command name, and the parameters become its arguments:

```tova
cli {
  name: "todo"

  fn add(task: String) {
    print("Added: {task}")
  }

  fn list() {
    print("Showing all tasks...")
  }

  fn remove(id: Int) {
    print("Removed task {id}")
  }
}
```

```bash
$ todo add "Buy groceries"
Added: Buy groceries

$ todo list
Showing all tasks...

$ todo remove 3
Removed task 3
```

Commands can also be async:

```tova
cli {
  name: "deploy"

  async fn push(target: String) {
    print("Deploying to {target}...")
    await deploy_to(target)
    print("Done!")
  }
}
```

### Parameters

CLI parameters come in several forms. Positional arguments are required by default, while flags are prefixed with `--`:

```tova
cli {
  name: "serve"

  fn start(directory: String, --port: Int = 3000, --verbose: Bool) {
    print("Serving {directory} on port {port}")
    if verbose {
      print("Verbose logging enabled")
    }
  }
}
```

```bash
$ serve start ./public                     # port defaults to 3000
$ serve start ./public --port 8080         # override port
$ serve start ./public --port=8080         # equals syntax works too
$ serve start ./public --verbose           # boolean flag toggled on
$ serve start ./public --no-verbose        # explicitly off
```

Here is the full parameter syntax:

| Syntax | Meaning | Example |
|--------|---------|---------|
| `name: String` | Required positional | `fn run(target: String)` |
| `name: String?` | Optional positional | `fn init(name: String?)` |
| `--flag: Type` | Named flag | `fn run(--port: Int)` |
| `--flag: Type = val` | Flag with default | `fn run(--port: Int = 3000)` |
| `--flag: Bool` | Boolean toggle | `fn run(--verbose: Bool)` |
| `--flag: [String]` | Repeated flag (array) | `fn build(--include: [String])` |

**Boolean flags** are implicitly optional (they default to `false`). Tova also generates a `--no-` variant for each boolean flag.

**Repeated flags** collect multiple values into an array:

```tova
cli {
  fn build(--include: [String]) {
    print("Including: {include}")
  }
}
```

```bash
$ build --include src --include lib --include vendor
Including: ["src", "lib", "vendor"]
```

**Type validation** happens automatically. If someone passes `--port abc`, Tova prints a clear error:

```
Error: --port expects an integer, got "abc"
```

### Single-Command Optimization

When your `cli` block has only one command, Tova skips the subcommand routing entirely. The command's arguments become top-level arguments:

```tova
cli {
  name: "minify"
  version: "1.0.0"

  fn run(file: String, --output: String?) {
    print("Minifying {file}...")
    // minification logic here
  }
}
```

```bash
# No subcommand needed — "run" is implied:
$ minify style.css
$ minify style.css --output style.min.css
```

This is ideal for focused, single-purpose tools. Multi-command tools like `git` need subcommands; single-purpose tools like `minify` do not.

### Auto-Generated Help

Every `cli` tool gets `--help` for free. Tova generates help text from your command names, parameter names, types, and defaults:

```bash
$ mytool --help
mytool v1.0.0 - Does great things

COMMANDS:
  deploy   <target> [options]
  status
  rollback <version>

Run 'mytool <command> --help' for details.

$ mytool deploy --help
Usage: mytool deploy <target> [options]

ARGUMENTS:
  target     String (required)

OPTIONS:
  --port     Int (default: 3000)
  --verbose  Bool
  --env      String (default: "staging")
```

You never write help text manually. Rename a parameter, and the help updates automatically.

### Interactive Prompts

For tools that need user input, Tova provides built-in prompt functions:

```tova
cli {
  name: "scaffold"

  fn new() {
    name = ask("Project name?")
    lang = choose("Language:", ["Tova", "JavaScript", "Python"])
    features = choose_many("Features:", ["tests", "linting", "ci", "docker"])
    confirmed = confirm("Create project '{name}'?")

    if confirmed {
      print("Creating {name} with {lang}...")
      for feature in features {
        print("  Setting up {feature}")
      }
    }
  }
}
```

| Function | Purpose | Returns |
|----------|---------|---------|
| `ask("prompt")` | Free-text input | `String` |
| `confirm("prompt")` | Yes/no question | `Bool` |
| `choose("prompt", options)` | Single selection from list | `String` |
| `choose_many("prompt", options)` | Multiple selection from list | `[String]` |
| `secret("prompt")` | Hidden input (passwords) | `String` |

The `secret` function hides keystrokes, which is essential for password or API key input:

```tova
cli {
  fn login() {
    username = ask("Username:")
    password = secret("Password:")
    // password input is hidden from the terminal
    print("Logging in as {username}...")
  }
}
```

<TryInPlayground :code="cliInteractiveCode" label="Interactive CLI" />

### Colored Output

Tova includes color functions that work across terminals:

```tova
cli {
  fn status() {
    print(green("All systems operational"))
    print(yellow("Warning: disk usage at 85%"))
    print(red("Error: database connection failed"))
    print(blue("Info: 42 active connections"))
    print(cyan("Debug: request processed in 3ms"))
    print(bold("Important notice"))
    print(dim("Less important detail"))
  }
}
```

Colors nest and compose naturally:

```tova
print(bold(red("CRITICAL")) ++ ": " ++ "Server is down")
print(green("PASS") ++ " " ++ dim("test_user_creation (12ms)"))
```

Available color functions: `red()`, `green()`, `yellow()`, `blue()`, `cyan()`, `magenta()`, `gray()`. Text style functions: `bold()`, `dim()`, `underline()`, `strikethrough()`.

### Formatting

For structured output, Tova provides formatting helpers:

```tova
cli {
  fn report() {
    // Table output
    data = [
      ["Name", "Status", "CPU"],
      ["web-1", "running", "23%"],
      ["web-2", "running", "45%"],
      ["db-1", "stopped", "0%"]
    ]
    table(data)

    // Panel (boxed section)
    panel("Summary", "3 servers total\n2 running, 1 stopped")

    // Progress bar
    for i in range(1, 11) {
      progress(i, 10)
    }

    // Spinner for long operations
    spin("Deploying...")
  }
}
```

| Function | Purpose |
|----------|---------|
| `table(rows)` | Formatted table with alignment |
| `panel(title, content)` | Boxed content with a title |
| `progress(current, total)` | Progress bar |
| `spin(message)` | Loading spinner |

### Building Executables

Run `tova build` on a file with a `cli` block to produce a standalone executable:

```bash
$ tova build organizer.tova
# Creates: organizer.js (with #!/usr/bin/env node shebang, chmod 755)

$ ./organizer.js sort ./downloads --verbose
Sorting files in ./downloads...
```

The output is a self-contained JavaScript file with a shebang line. It needs Node.js or Bun on the target system, but no other dependencies. No `node_modules`, no package.json.

### Project: File Organizer CLI Tool

Let's bring all of this together into a practical tool that organizes files by type:

```tova
cli {
  name: "organize"
  version: "1.0.0"
  description: "Organize files by type into folders"

  fn sort(directory: String, --dry-run: Bool, --verbose: Bool) {
    print(bold("Organizing files in {directory}"))
    print("")

    // Define category mappings
    categories = {
      documents: ["pdf", "doc", "docx", "txt", "md"],
      images: ["jpg", "jpeg", "png", "gif", "svg", "webp"],
      code: ["js", "ts", "tova", "py", "go", "rs"],
      data: ["csv", "json", "xml", "yaml", "toml"],
      media: ["mp3", "mp4", "wav", "avi", "mkv"]
    }

    // Scan and categorize files
    var moved = 0
    var skipped = 0

    files = list_files(directory)
    for file in files {
      ext = file_extension(file)
      category = find_category(ext, categories)

      match category {
        Some(cat) => {
          if dry_run {
            print(dim("  Would move: {file} -> {cat}/"))
          } else {
            move_file(file, "{directory}/{cat}/{file}")
            if verbose {
              print(green("  Moved: {file} -> {cat}/"))
            }
          }
          moved += 1
        }
        None => {
          skipped += 1
          if verbose {
            print(yellow("  Skipped: {file} (unknown type)"))
          }
        }
      }
    }

    print("")
    if dry_run {
      print(yellow("Dry run: {moved} files would be moved, {skipped} skipped"))
    } else {
      print(green("Done: {moved} files moved, {skipped} skipped"))
    }
  }

  fn stats(directory: String, --format: String = "table") {
    files = list_files(directory)
    var groups = {}

    for file in files {
      ext = file_extension(file)
      if groups[ext] == undefined {
        groups[ext] = 0
      }
      groups[ext] += 1
    }

    match format {
      "table" => {
        rows = [["Extension", "Count"]]
        for ext in keys(groups) {
          rows.push([".{ext}", to_string(groups[ext])])
        }
        table(rows)
      }
      "bar" => {
        for ext in keys(groups) {
          bar = repeat("=", groups[ext] * 2)
          print("  .{pad_end(ext, 6)} {bar} ({groups[ext]})")
        }
      }
      _ => print(red("Unknown format: {format}. Use 'table' or 'bar'."))
    }
  }

  fn undo(directory: String) {
    confirmed = confirm("Undo last organization of {directory}?")
    if confirmed {
      print("Reversing file moves...")
      // Restore files from category folders
      print(green("Done! Files restored to original locations."))
    } else {
      print("Cancelled.")
    }
  }
}
```

```bash
$ organize sort ~/Downloads --dry-run --verbose
Organizing files in /Users/me/Downloads

  Would move: report.pdf -> documents/
  Would move: photo.jpg -> images/
  Would move: data.csv -> data/
  Skipped: mystery.xyz (unknown type)

Dry run: 3 files would be moved, 1 skipped

$ organize stats ~/Downloads --format bar
  .pdf    ==== (2)
  .jpg    ====== (3)
  .csv    == (1)
  .js     ==== (2)

$ organize sort ~/Downloads
$ organize undo ~/Downloads
```

<TryInPlayground :code="cliProjectCode" label="File Organizer" />

## Part 2: Edge Computing

### The edge Block

The `edge` block deploys your code to edge networks -- serverless functions running in data centers around the world, close to your users:

```tova
edge {
  target: "cloudflare"

  route GET "/api/hello" => fn(req) {
    { message: "Hello from the edge!" }
  }

  route GET "/api/time" => fn(req) {
    { timestamp: Date.now() }
  }
}
```

This compiles to a Cloudflare Worker, a Deno Deploy function, a Vercel Edge Function, an AWS Lambda, or a Bun server -- depending on the `target` field. The Tova code stays the same.

<TryInPlayground :code="edgeBasicCode" label="Edge Basics" />

### Named Edge Blocks

You can define multiple edge blocks in the same file, each with its own name and purpose:

```tova
edge "api" {
  target: "cloudflare"
  route GET "/api/users" => fn(req) { get_users() }
  route POST "/api/users" => fn(req) { create_user(req.body) }
}

edge "assets" {
  target: "cloudflare"
  route GET "/img/:path" => fn(req, params) {
    serve_static("images/{params.path}")
  }
}
```

Named blocks generate separate output files: `app.edge.api.js` and `app.edge.assets.js`. This lets you deploy different parts of your application independently.

### Target Platforms

Tova supports five edge deployment targets:

| Target | Platform | Output |
|--------|----------|--------|
| `"cloudflare"` | Cloudflare Workers | `export default { fetch() }` |
| `"deno"` | Deno Deploy | `Deno.serve()` |
| `"vercel"` | Vercel Edge Functions | Edge Runtime handler |
| `"lambda"` | AWS Lambda | Lambda handler |
| `"bun"` | Bun server | `Bun.serve()` |

If you omit `target`, Tova defaults to Cloudflare. Your route handlers, middleware, and business logic are identical across all five -- the compiler generates the platform-specific wiring.

```tova
// Same routes, different targets:
edge {
  target: "deno"   // Change this one line to switch platforms

  route GET "/api/status" => fn(req) {
    { status: "healthy", platform: "deno" }
  }
}
```

### Routes in Edge

Edge routes use the same syntax as Tova's `server` block. If you already know how to write server routes, you know edge routes:

```tova
edge {
  target: "cloudflare"

  // Static path
  route GET "/api/health" => fn(req) {
    { status: "ok" }
  }

  // Path parameters
  route GET "/api/users/:id" => fn(req, params) {
    user = fetch_user(params.id)
    { user: user }
  }

  // Different HTTP methods
  route POST "/api/users" => fn(req) {
    created = create_user(req.body)
    { user: created, status: 201 }
  }

  route DELETE "/api/users/:id" => fn(req, params) {
    delete_user(params.id)
    { deleted: true }
  }
}
```

You can also define handler functions separately and reference them by name:

```tova
edge {
  fn get_users() { query_db("SELECT * FROM users") }
  fn create_user(req) { insert_db("users", req.body) }

  route GET "/api/users" => get_users
  route POST "/api/users" => create_user
}
```

Middleware works the same way:

```tova
edge {
  middleware fn logger(req, next) {
    start = Date.now()
    response = next(req)
    elapsed = Date.now() - start
    print("[{req.method}] {req.url} - {elapsed}ms")
    response
  }

  route GET "/api/data" => fn(req) { { data: "value" } }
}
```

### Runtime Bindings

Edge platforms provide managed services -- key-value stores, databases, object storage, queues. Tova gives you a declarative way to wire them up:

```tova
edge {
  target: "cloudflare"

  // Key-Value store
  kv CACHE

  // SQL database
  sql DB

  // Object storage (R2, S3, etc.)
  storage UPLOADS

  // Message queue
  queue EMAILS

  // Environment variable with default
  env API_URL = "https://api.example.com"

  // Secret (no default, must be set in platform dashboard)
  secret JWT_SECRET

  route GET "/api/cached/:key" => fn(req, params) {
    // Use bindings directly in handlers
    value = CACHE.get(params.key)
    if value != null {
      { value: value, source: "cache" }
    } else {
      { error: "Not found" }
    }
  }
}
```

| Binding | Syntax | Purpose |
|---------|--------|---------|
| `kv NAME` | Key-value store | Caching, sessions, config |
| `sql NAME` | SQL database | D1, Deno KV, bun:sqlite |
| `storage NAME` | Object storage | File uploads, assets |
| `queue NAME` | Message queue | Background jobs, email |
| `env NAME = "default"` | Environment variable | Configuration |
| `secret NAME` | Secret (no default) | API keys, tokens |

Each binding compiles to the correct platform-specific code. A `kv CACHE` on Cloudflare uses the `env` parameter from the fetch handler; on Deno it calls `Deno.openKv()`; on Bun and Vercel it uses `process.env` for env/secret bindings.

::: tip Binding Support Varies
Not all platforms support all bindings. The Tova analyzer warns you when you use an unsupported binding for your target. For example, `queue` is only fully supported on Cloudflare. Check the warning messages -- they tell you exactly what works where.
:::

### Scheduled Jobs

Run code on a schedule using cron expressions:

```tova
edge {
  target: "cloudflare"

  schedule "cleanup" cron("0 0 * * *") {
    // Runs daily at midnight UTC
    expired = SESSIONS.list({ prefix: "expired:" })
    for key in expired.keys {
      SESSIONS.delete(key)
    }
    print("Cleaned up expired sessions")
  }

  schedule "report" cron("0 9 * * 1") {
    // Runs every Monday at 9am UTC
    stats = generate_weekly_report()
    send_email("team@company.com", "Weekly Report", stats)
  }

  route GET "/" => fn(req) { { status: "ok" } }
}
```

The cron expression follows standard cron format: `minute hour day month weekday`. On Cloudflare, this generates a `scheduled()` handler. On Deno, it uses `Deno.cron()`.

::: warning Platform Support
Scheduled jobs are best supported on Cloudflare and Deno. The analyzer emits `W_UNSUPPORTED_SCHEDULE` for Vercel, Lambda, and Bun targets where native cron support is limited. For those platforms, use an external scheduler to trigger an HTTP endpoint instead.
:::

### Queue Consumers

Process messages from a queue with the `consume` declaration:

```tova
edge {
  target: "cloudflare"
  queue EMAILS

  consume EMAILS fn(messages) {
    for msg in messages {
      match msg.type {
        "welcome" => send_welcome_email(msg.to)
        "reset" => send_reset_email(msg.to, msg.token)
        _ => print("Unknown email type: {msg.type}")
      }
    }
  }

  route POST "/api/send-email" => fn(req) {
    // Enqueue instead of sending directly
    EMAILS.send(req.body)
    { queued: true }
  }
}
```

Queue consumers run asynchronously. When a route handler pushes a message onto a queue, the consumer function processes it in the background. This is the edge equivalent of a background job system.

On Cloudflare, this generates a `queue()` handler in the Worker and entries in `wrangler.toml`. Queue consumers are currently only supported on Cloudflare; the analyzer warns you with `W_UNSUPPORTED_CONSUME` on other targets.

### Edge + Security

Tova's `security` block integrates seamlessly with edge deployments. JWT authentication uses the Web Crypto API, which is available on all edge runtimes:

```tova
security {
  auth: "jwt"
  secret: "my-secret-key"

  roles {
    admin: ["manage_users", "view_analytics"]
    user: ["view_own_profile"]
  }

  protect {
    "/api/admin/*": ["admin"]
    "/api/users/:id": ["user", "admin"]
  }
}

edge {
  target: "cloudflare"
  secret JWT_SECRET

  route GET "/api/public" => fn(req) {
    { message: "Anyone can see this" }
  }

  route GET "/api/admin/stats" => fn(req) {
    // Only admin users reach here — security block handles auth
    { active_users: 1234, revenue: 56789 }
  }

  route GET "/api/users/:id" => fn(req, params) {
    // User or admin access
    { id: params.id, name: "User {params.id}" }
  }
}
```

The compiler generates authentication and authorization middleware using `crypto.subtle` for JWT verification, which works across Cloudflare Workers, Deno Deploy, Vercel Edge Functions, and all other edge runtimes. No Node.js-specific JWT libraries needed.

Protected routes automatically return:
- `401 Unauthorized` when no valid JWT is present
- `403 Forbidden` when the user lacks the required role

The `auto_sanitize` feature from the security block also works on edge -- response fields are filtered based on user roles and `visible_to` annotations.

<TryInPlayground :code="edgeFullCode" label="Full Edge App" />

### Multi-Target Deployment

A single Tova file can produce deployments for multiple platforms. Use named edge blocks with different targets:

```tova
// Shared business logic
fn get_users() {
  [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]
}

edge "cloudflare" {
  target: "cloudflare"
  kv CACHE

  route GET "/api/users" => fn(req) {
    cached = CACHE.get("users")
    if cached != null { cached }
    else {
      users = get_users()
      CACHE.put("users", users)
      users
    }
  }
}

edge "deno" {
  target: "deno"
  kv CACHE

  route GET "/api/users" => fn(req) {
    cached = CACHE.get("users")
    if cached != null { cached }
    else { get_users() }
  }
}
```

Build produces both outputs:

```bash
$ tova build app.tova
# Output: app.edge.cloudflare.js, app.edge.deno.js
```

### Building and Deploying

Build your edge application:

```bash
$ tova build app.tova
# For Cloudflare: generates app.edge.js + wrangler.toml
# For Deno: generates app.edge.js (deploy with deployctl)
# For Vercel: generates app.edge.js (place in api/)
# For Lambda: generates app.edge.js (deploy with AWS CLI/SAM)
# For Bun: generates app.edge.js (run with bun)
```

Cloudflare deployments also generate a `wrangler.toml` with KV namespaces, queue consumer bindings, and other configuration.

## Part 3: Deploy Blocks

### Infrastructure as Code

The `deploy` block lets you describe your deployment infrastructure directly in your Tova source file. Instead of maintaining separate Dockerfiles, nginx configs, and shell scripts, you declare what you need and Tova generates the provisioning scripts:

```tova
deploy "prod" {
  server: "root@159.65.100.42"
  domain: "myapp.com"
  instances: 2
  memory: "1gb"
}
```

That's a complete production deployment configuration. Run `tova deploy prod` and Tova will:
1. **Infer infrastructure** from your code (Bun runtime, Caddy reverse proxy, databases)
2. **Generate provisioning scripts** (idempotent bash, systemd units, Caddy config)
3. **Deploy your application** with zero-downtime rollouts

### Deploy Block Syntax

Every deploy block requires a name (the environment) and two required fields:

```tova
deploy "prod" {
  server: "root@example.com"     // Required: SSH target
  domain: "myapp.com"            // Required: domain for reverse proxy + SSL

  // Optional configuration with defaults:
  instances: 2                   // Number of app instances (default: 1)
  memory: "1gb"                  // Memory limit per instance (default: "512mb")
  branch: "main"                 // Git branch to deploy (default: "main")
  health: "/healthz"             // Health check endpoint (default: "/healthz")
  health_interval: 30            // Seconds between health checks (default: 30)
  health_timeout: 5              // Seconds before health check timeout (default: 5)
  restart_on_failure: true       // Auto-restart on crash (default: true)
  keep_releases: 5               // Number of old releases to keep (default: 5)
}
```

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `server` | String | *required* | SSH target (user@host) |
| `domain` | String | *required* | Domain for reverse proxy + auto-SSL |
| `instances` | Int | 1 | Number of app processes |
| `memory` | String | "512mb" | Memory limit per instance |
| `branch` | String | "main" | Git branch to deploy from |
| `health` | String | "/healthz" | Health check endpoint path |
| `health_interval` | Int | 30 | Seconds between health checks |
| `health_timeout` | Int | 5 | Health check timeout in seconds |
| `restart_on_failure` | Bool | true | Auto-restart crashed processes |
| `keep_releases` | Int | 5 | Old releases to keep for rollback |

### Environment Variables

The `env` sub-block defines environment variables for the deployment:

```tova
deploy "prod" {
  server: "root@example.com"
  domain: "myapp.com"

  env {
    NODE_ENV: "production"
    PORT: 3000
    LOG_LEVEL: "info"
    API_KEY: "your-api-key"
  }
}
```

These are written to `.env.production` on the server and loaded via the systemd `EnvironmentFile` directive.

### Database Configuration

The `db` sub-block lets you override database settings for the deployment:

```tova
deploy "prod" {
  server: "root@example.com"
  domain: "myapp.com"

  db {
    postgres {
      name: "myapp_db"
      port: 5432
    }
    redis {
      maxmemory: "512mb"
    }
  }
}
```

Supported database engines: `postgres`, `redis`, `sqlite`. The provisioner automatically installs and configures each database on the target server.

### Multiple Environments

Define separate deploy blocks for each environment:

```tova
deploy "prod" {
  server: "root@prod.example.com"
  domain: "myapp.com"
  instances: 2
  memory: "1gb"

  env {
    NODE_ENV: "production"
    LOG_LEVEL: "warn"
  }

  db {
    postgres { name: "myapp_prod" }
  }
}

deploy "staging" {
  server: "root@staging.example.com"
  domain: "staging.myapp.com"
  instances: 1
  memory: "512mb"
  branch: "develop"

  env {
    NODE_ENV: "staging"
    LOG_LEVEL: "debug"
  }

  db {
    postgres { name: "myapp_staging" }
  }
}
```

Deploy to a specific environment:

```bash
$ tova deploy prod        # Deploy to production
$ tova deploy staging     # Deploy to staging
```

### Infrastructure Inference

The compiler scans your entire application to infer what infrastructure is needed. You don't have to specify it manually:

| Your Code Contains | Tova Provisions |
|---|---|
| `server { }` block | Bun runtime, systemd service, Caddy reverse proxy |
| `server { db { type: "postgres" } }` | PostgreSQL, database user, database |
| `server { db { type: "redis" } }` | Redis installation and configuration |
| `browser { }` block | Static file serving via Caddy |
| `security { auth { secret: env(...) } }` | Required secrets validation |
| `deploy { domain: "..." }` | Caddy auto-SSL via Let's Encrypt |
| WebSocket routes | Caddy WebSocket proxy configuration |

### Deploy CLI Commands

```bash
$ tova deploy prod                    # Deploy to production
$ tova deploy prod --plan             # Show what would happen (dry run)
$ tova deploy prod --rollback         # Roll back to previous release
$ tova deploy prod --status           # Check app and database status
$ tova deploy prod --logs             # Tail application logs
$ tova deploy prod --logs --since "1 hour ago"   # Recent logs
$ tova deploy prod --logs --instance 1           # Specific instance
$ tova deploy prod --ssh              # SSH into the server
$ tova deploy prod --setup-git        # Enable git push deployment
$ tova deploy prod --remove           # Remove app from server
$ tova deploy --list --server root@host  # List all apps on a server
```

The `--plan` flag is especially useful -- it shows exactly what Tova would do without making any changes:

```bash
$ tova deploy prod --plan
Plan for "prod" deployment:
  Target: root@159.65.100.42
  Domain: myapp.com (auto-SSL via Let's Encrypt)
  Instances: 2 (ports 3000, 3001)
  Memory: 1gb per instance
  Databases: postgres (myapp_db), redis
  Health check: /healthz every 30s
```

### Secret Management

Manage deployment secrets without storing them in code:

```bash
$ tova env prod list                  # List secret names
$ tova env prod set JWT_SECRET=abc123 # Set a secret
```

Secrets are stored in `.env.production` on the server and never committed to version control.

### What Gets Generated

Behind the scenes, `tova deploy` generates:

1. **Provisioning script** (`provision.sh`) -- Idempotent bash that installs Bun, Caddy, databases, and configures the firewall
2. **systemd service** -- Auto-restart, memory limits, environment file loading
3. **Caddy config** -- Reverse proxy with round-robin load balancing, auto-SSL, health checks, WebSocket support
4. **Release directory structure** -- Symlink-based releases for instant rollback

::: tip Zero-Config Deployment
The deploy block embodies Tova's philosophy: declare what you want, let the compiler figure out how. You never write nginx configs, Dockerfiles, or CI/CD pipelines for simple deployments. For complex infrastructure, the generated scripts are a starting point you can customize.
:::

## Putting It All Together

CLI tools and edge functions often work together. You might build a CLI tool that deploys to an edge platform, or a CLI that manages edge-deployed resources:

```tova
// deploy-tool.tova — a CLI that manages edge deployments
cli {
  name: "deploy"
  version: "1.0.0"
  description: "Deploy and manage edge applications"

  fn push(app: String, --target: String = "cloudflare", --dry-run: Bool) {
    if dry_run {
      print(yellow("Dry run: would deploy {app} to {target}"))
      return
    }
    print(bold("Deploying {app} to {target}..."))
    spin("Building...")
    // build logic here
    print(green("Deployed successfully!"))
  }

  fn status(app: String) {
    print(bold("Status for {app}:"))
    rows = [
      ["Region", "Status", "Latency"],
      ["us-east", green("healthy"), "12ms"],
      ["eu-west", green("healthy"), "8ms"],
      ["ap-south", yellow("degraded"), "45ms"]
    ]
    table(rows)
  }

  fn logs(app: String, --tail: Bool, --lines: Int = 50) {
    print(dim("Showing last {lines} log lines for {app}"))
    // stream logs here
  }
}
```

## Exercises

**Exercise 16.1:** Build a `todo` CLI tool with three commands: `add` (takes a `task: String` and optional `--priority: String = "medium"`), `list` (takes an optional `--filter: String?`), and `done` (takes an `id: Int`). Include colored output: high-priority tasks in red, medium in yellow, low in green.

**Exercise 16.2:** Create an edge block targeting Cloudflare that implements a URL shortener. Define a `kv URLS` binding. Add routes: `POST /api/shorten` (accepts a URL and returns a short code), `GET /:code` (looks up the code in KV and redirects). Add a `schedule` that runs daily to clean up expired links.

**Exercise 16.3:** Write a CLI tool called `httpie` (a simplified HTTP client) with a single command that takes a `url: String` positional argument and flags `--method: String = "GET"`, `--header: [String]`, and `--body: String?`. Use the single-command optimization so users can run `httpie https://api.example.com` directly without a subcommand.

## Challenge

Build a **deployment pipeline CLI + edge API** in two files:

1. **pipeline.tova** -- A CLI tool with commands:
   - `init` -- scaffolds a new project with `ask()` and `choose()` prompts
   - `build` -- compiles the project with `progress()` output and `--target` flag for platform selection
   - `deploy` -- deploys with `spin()` animation, supports `--dry-run` and `--verbose`
   - `status` -- shows deployment status across regions with `table()` output

2. **api.tova** -- An edge block with:
   - `target: "cloudflare"` with `kv DEPLOYS` and `secret DEPLOY_TOKEN`
   - `POST /api/deploy` -- receives deployment payloads (protected by auth)
   - `GET /api/status/:app` -- returns deployment status from KV
   - `schedule "cleanup" cron("0 0 * * 0")` -- weekly cleanup of old deployments
   - A `security` block protecting the deploy endpoint

The CLI tool should call the edge API. Design the interaction so that `pipeline deploy my-app` sends a request to the edge API, which stores the deployment record in KV and returns a status URL.

---

[← Previous: Full-Stack Applications](./fullstack) | [Back to Mastering Tova →](./)
