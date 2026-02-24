# Modules

Tova uses a module system based on `import` and `pub`, similar to JavaScript ES modules. You can import from other `.tova` files, from npm packages, or from built-in modules.

## Named Imports

Import specific items from a module using curly braces:

```tova
import { map, filter, reduce } from "collections"
import { User, Post } from "./models"
import { validate_email, validate_phone } from "./validators"
```

Use the imported names directly:

```tova
import { sqrt, abs, floor } from "math"

result = sqrt(144)    // 12
rounded = floor(3.7)  // 3
```

## Default Imports

Import the default module with a plain name (no braces):

```tova
import express from "express"
import dayjs from "dayjs"
```

```tova
import Router from "./router"

app = Router()
```

## Aliased Imports

Rename imports to avoid name collisions or for convenience:

```tova
import { readFile as read, writeFile as write } from "fs"
import { User as UserModel } from "./models"
```

```tova
import { map as mapArray } from "array-utils"
import { map as mapObject } from "object-utils"

// Now both can coexist without collision
mapped_arr = mapArray(items, fn(x) x * 2)
mapped_obj = mapObject(data, fn(k, v) v.upper())
```

## Wildcard Imports

Import everything from a module under a namespace:

```tova
import * as math from "math"

result = math.sqrt(16)
pi = math.PI
```

```tova
import * as utils from "./utils"

formatted = utils.format_date(today)
cleaned = utils.sanitize(input)
```

## Exporting

### Public Functions

Mark functions as available to other modules with `pub`:

```tova
pub fn add(a, b) {
  a + b
}

pub fn multiply(a, b) {
  a * b
}

// This function is internal -- not exported
fn helper(x) {
  x * x
}
```

### Public Types

Mark type definitions as public so other modules can use them:

```tova
pub type User {
  id: Int
  name: String
  email: String
}

pub type Role {
  Admin
  Editor
  Viewer
}
```

### Public Variables

```tova
pub version = "1.0.0"
pub default_config = {
  host: "localhost",
  port: 8080
}
```

## Multi-File Block Merging

Tova automatically merges all `.tova` files in the **same directory**. All `shared {}` blocks merge into one shared output, all `server {}` blocks merge into one server output, and all `client {}` blocks merge into one client output. No imports are needed between files in the same directory.

This means you can split a large application across multiple files by concern:

```
my-app/src/
  types.tova           # shared { type Task { ... } }
  server.tova          # server { db, model, CRUD fns, routes }
  components.tova      # client { component StatsBar, component TaskItem }
  app.tova             # client { state, computed, effects, component App }
```

All four files merge by block type:
- `shared` blocks → `src.shared.js`
- `server` blocks → `src.server.js`
- `client` blocks → `src.client.js`

Components from `components.tova` are available in `app.tova` without imports. Shared types from `types.tova` are available in both server and client output. Server functions from `server.tova` are callable via `server.fn_name()` from client code in `app.tova`.

### Multiple Blocks in One File

A single `.tova` file can also contain multiple blocks of the same type. They merge the same way:

```tova
// State and data loading
client {
  state users: [User] = []

  effect {
    users = server.get_users()
  }
}

// Components (same file, separate block)
client {
  component App {
    <ul>
      for user in users {
        <li>{user.name}</li>
      }
    </ul>
  }
}
```

Both client blocks merge into one output — `App` can reference `users` directly.

### How It Works

When `tova build` or `tova dev` finds multiple `.tova` files in a directory, it:

1. Parses all files in the directory
2. Merges same-type blocks (including multiple blocks within a single file) into a single AST
3. Checks for duplicate declarations across files
4. Runs the analyzer and code generator on the merged AST
5. Outputs one set of files per directory (e.g., `src.shared.js`, `src.server.js`, `src.client.js`)

Single-file directories compile exactly as before -- no behavior change.

### What Gets Shared After Merging

When client blocks merge (whether from the same file or different files in the same directory), everything in the merged output shares the same runtime scope:

| Declaration | Shared across merged blocks? |
|-------------|------------------------------|
| `state` variables | Yes — all blocks read/write the same signals |
| `computed` values | Yes — derived values available everywhere |
| `store` instances | Yes — shared reactive stores |
| `component` definitions | Yes — any block can render any component |
| `fn` functions | Yes — callable from any block |
| `effect` blocks | Yes — all effects run in the same reactive root |

This means a `state` declared in one file's client block is the same signal referenced in another file's component — no wiring required.

### Duplicate Detection

If two files in the same directory declare the same top-level name, the compiler reports an error with both file locations:

```
Error: Duplicate component 'App'
  → first defined in app.tova:15
  → also defined in main.tova:42
```

The following are checked for conflicts:

- **Client blocks:** component names, top-level state, computed, store, and fn names
- **Server blocks:** fn names, model names, route conflicts (same method + path), singleton configs (db, cors, auth, session, etc.)
- **Shared blocks:** type names, fn names, interface/trait names

Declarations **scoped inside** components or stores (like `state` inside a `component`) do **not** conflict across files. Two components can each have their own `state count` without issues.

### Same-Directory Imports

If a file in the directory imports from another file in the same directory, the import is automatically stripped since both files are merged together:

```tova
// This import is valid but unnecessary -- it's removed during merge
import { Task } from "./types.tova"
```

### Subdirectories Are Separate Modules

Only files in the **same** directory are merged. Subdirectories are separate modules that require explicit imports:

```
my-app/src/
  app.tova             # merged with types.tova
  types.tova           # merged with app.tova
  utils/
    validators.tova    # separate module -- needs import
```

```tova
// src/app.tova -- import from subdirectory
import { validate_email } from "./utils/validators.tova"
```

### Named Blocks Are Kept Separate

[Named blocks](/fullstack/named-blocks) (`client "admin" {}`, `server "api" {}`) with **different names** are not merged together — each produces its own output file. Named blocks with the **same name** from different files in the same directory are merged:

```tova
// admin-state.tova
client "admin" { state users = [] }

// admin-ui.tova
client "admin" { component AdminPanel { ... } }
// → Both merge into one admin client output
```

```tova
// These are SEPARATE outputs — not merged:
client "admin" { ... }   // → app.client.admin.js
client "public" { ... }  // → app.client.public.js
```

## Cross-File Imports

Tova's compiler resolves `.tova` imports automatically. When you import from a `.tova` file in a different directory, the compiler compiles it and rewrites the import to point to the generated `.js` output.

### Project Structure

A typical multi-file project:

```
my-app/
  src/
    app.tova           # Main entry point
    models.tova        # Type definitions (merged with app.tova)
    utils/
      validators.tova  # Separate module -- imported explicitly
  package.json
```

### models.tova

```tova
shared {
  type User {
    id: Int
    name: String
    email: String
  }

  type Post {
    id: Int
    title: String
    body: String
    author_id: Int
  }
}
```

### utils/validators.tova

```tova
shared {
  pub fn validate_email(email: String) -> Result<String, String> {
    if email.contains("@") {
      Ok(email)
    } else {
      Err("Invalid email: {email}")
    }
  }
}
```

### app.tova

```tova
// Cross-directory import -- validators.tova is in a subdirectory
import { validate_email } from "./utils/validators.tova"

// No import needed for User or Post -- models.tova is in the same directory

server {
  fn create_user(name: String, email: String) {
    guard validate_email(email) else { return Err("bad email") }
    Ok(User(1, name, email))
  }
}

client {
  state users: [User] = []

  effect {
    users = server.get_users()
  }

  component App {
    <div>"Users"</div>
  }
}
```

## Using npm Packages

Since Tova compiles to JavaScript, any npm package works out of the box. Install packages normally with `bun install` or `npm install`, then import them:

```tova
import { z } from "zod"

user_schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().min(0)
})

fn validate(data) {
  try {
    Ok(user_schema.parse(data))
  } catch err {
    Err(err.message)
  }
}
```

```tova
import dayjs from "dayjs"

fn format_date(date) {
  dayjs(date).format("YYYY-MM-DD")
}

fn time_ago(date) {
  dayjs(date).fromNow()
}
```

```tova
import chalk from "chalk"

fn success(msg) {
  print(chalk.green(msg))
}

fn error(msg) {
  print(chalk.red(msg))
}
```

## Import Conventions

Tova follows these conventions for resolving imports:

| Import Path | Resolution |
|-------------|-----------|
| `"./file"` | Relative `.tova` file in same directory |
| `"../file"` | Relative `.tova` file in parent directory |
| `"./dir/file"` | Relative `.tova` file in subdirectory |
| `"package"` | npm package from `node_modules` |
| `"builtin"` | Built-in Tova module |

## Practical Tips

**Keep modules focused.** Each `.tova` file should have a clear responsibility -- types, validation, utilities, etc. This makes imports self-documenting.

**Publish types alongside their functions.** If a module defines a `User` type, make the functions that operate on it public from the same module:

```tova
pub type User {
  id: Int
  name: String
  email: String
}

pub fn create_user(name, email) {
  User(next_id(), name, email)
}

pub fn display_user(user: User) -> String {
  "{user.name} <{user.email}>"
}
```

**Use aliases to resolve naming conflicts.** When two modules publish the same name, aliased imports keep things clear without renaming the source:

```tova
import { parse as parse_json } from "json"
import { parse as parse_yaml } from "yaml"
```
