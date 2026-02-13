# Modules

Lux uses a module system based on `import` and `export`, similar to JavaScript ES modules. You can import from other `.lux` files, from npm packages, or from built-in modules.

## Named Imports

Import specific items from a module using curly braces:

```lux
import { map, filter, reduce } from "collections"
import { User, Post } from "./models"
import { validate_email, validate_phone } from "./validators"
```

Use the imported names directly:

```lux
import { sqrt, abs, floor } from "math"

result = sqrt(144)    // 12
rounded = floor(3.7)  // 3
```

## Default Imports

Import the default export of a module with a plain name (no braces):

```lux
import express from "express"
import dayjs from "dayjs"
```

```lux
import Router from "./router"

app = Router()
```

## Aliased Imports

Rename imports to avoid name collisions or for convenience:

```lux
import { readFile as read, writeFile as write } from "fs"
import { User as UserModel } from "./models"
```

```lux
import { map as mapArray } from "array-utils"
import { map as mapObject } from "object-utils"

// Now both can coexist without collision
mapped_arr = mapArray(items, fn(x) x * 2)
mapped_obj = mapObject(data, fn(k, v) v.upper())
```

## Wildcard Imports

Import everything from a module under a namespace:

```lux
import * as math from "math"

result = math.sqrt(16)
pi = math.PI
```

```lux
import * as utils from "./utils"

formatted = utils.format_date(today)
cleaned = utils.sanitize(input)
```

## Exporting

### Export Functions

Mark functions as available to other modules with `export`:

```lux
export fn add(a, b) {
  a + b
}

export fn multiply(a, b) {
  a * b
}

// This function is internal -- not exported
fn helper(x) {
  x * x
}
```

### Export Types

Export type definitions so other modules can use them:

```lux
export type User {
  id: Int
  name: String
  email: String
}

export type Role {
  Admin
  Editor
  Viewer
}
```

### Export Variables

```lux
export version = "1.0.0"
export default_config = {
  host: "localhost",
  port: 8080
}
```

## Multi-file Lux Projects

Lux's compiler resolves `.lux` imports automatically. When you import from a `.lux` file, the compiler compiles it and rewrites the import to point to the generated `.js` output.

### Project Structure

A typical multi-file project:

```
my-app/
  src/
    app.lux           # Main entry point
    models.lux        # Type definitions
    validators.lux    # Validation functions
    utils.lux         # Utility functions
  package.json
```

### models.lux

```lux
export type User {
  id: Int
  name: String
  email: String
} derive [Eq, Show, JSON]

export type Post {
  id: Int
  title: String
  body: String
  author_id: Int
} derive [JSON]
```

### validators.lux

```lux
import { User } from "./models"

export fn validate_email(email: String) -> Result<String, String> {
  if email.contains("@") {
    Ok(email)
  } else {
    Err("Invalid email: {email}")
  }
}

export fn validate_user(user: User) -> Result<User, String> {
  validate_email(user.email)!
  if user.name.length == 0 {
    Err("Name cannot be empty")
  } else {
    Ok(user)
  }
}
```

### app.lux

```lux
import { User, Post } from "./models"
import { validate_user } from "./validators"

fn main() {
  user = User(1, "Alice", "alice@example.com")

  match validate_user(user) {
    Ok(valid_user) => print("Valid: {valid_user.name}")
    Err(error) => print("Error: {error}")
  }
}

main()
```

## Using npm Packages

Since Lux compiles to JavaScript, any npm package works out of the box. Install packages normally with `bun install` or `npm install`, then import them:

```lux
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

```lux
import dayjs from "dayjs"

fn format_date(date) {
  dayjs(date).format("YYYY-MM-DD")
}

fn time_ago(date) {
  dayjs(date).fromNow()
}
```

```lux
import chalk from "chalk"

fn success(msg) {
  print(chalk.green(msg))
}

fn error(msg) {
  print(chalk.red(msg))
}
```

## Import Conventions

Lux follows these conventions for resolving imports:

| Import Path | Resolution |
|-------------|-----------|
| `"./file"` | Relative `.lux` file in same directory |
| `"../file"` | Relative `.lux` file in parent directory |
| `"./dir/file"` | Relative `.lux` file in subdirectory |
| `"package"` | npm package from `node_modules` |
| `"builtin"` | Built-in Lux module |

## Practical Tips

**Keep modules focused.** Each `.lux` file should have a clear responsibility -- types, validation, utilities, etc. This makes imports self-documenting.

**Export types alongside their functions.** If a module defines a `User` type, export the functions that operate on it from the same module:

```lux
export type User {
  id: Int
  name: String
  email: String
}

export fn create_user(name, email) {
  User(next_id(), name, email)
}

export fn display_user(user: User) -> String {
  "{user.name} <{user.email}>"
}
```

**Use aliases to resolve naming conflicts.** When two modules export the same name, aliased imports keep things clear without renaming the source:

```lux
import { parse as parse_json } from "json"
import { parse as parse_yaml } from "yaml"
```
