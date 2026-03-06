<script setup>
const basicImportCode = `// Importing from other Tova files
// import { function_name } from "./other-file"

// Tova resolves .tova files automatically
// import { calculate_tax } from "./utils"
// import { User, validate_user } from "./models/user"

// Practical example: organizing a project
// -- math-utils.tova --
fn add(a, b) { a + b }
fn multiply(a, b) { a * b }
fn clamp_val(value, low, high) {
  if value < low { low }
  elif value > high { high }
  else { value }
}

// -- main.tova --
// import { add, multiply, clamp_val } from "./math-utils"

// For this demo, we'll just use them directly
print(add(3, 4))
print(multiply(5, 6))
print(clamp_val(150, 0, 100))`

const organizationCode = `// A well-organized Tova project structure:
//
// my-app/
//   main.tova           ← entry point
//   models/
//     user.tova          ← User type + validation
//     order.tova         ← Order type + business logic
//   utils/
//     strings.tova       ← String helpers
//     validation.tova    ← Shared validators
//   config.tova          ← App configuration
//
// Each file exports what it provides:
//   models/user.tova:
//     type User { name: String, email: String }
//     fn validate_user(data) { ... }
//     fn create_user(name, email) { ... }
//
//   main.tova:
//     import { User, create_user } from "./models/user"
//     import { validate_email } from "./utils/validation"

// Principle: one concept per file
// user.tova has User type + User functions
// order.tova has Order type + Order functions
// Don't put User logic in order.tova

print("Module organization is about clarity")
print("Group by domain concept, not by code type")`
</script>

# Chapter 9: Modules and Architecture

As your programs grow beyond a single file, you need a way to organize code into manageable pieces. Tova's module system is simple: every `.tova` file is a module, and you use `import` to bring in what you need.

This chapter teaches you to structure real projects cleanly.

## Imports and Exports

Every function and type defined in a `.tova` file is available for import:

```tova
// math-utils.tova
fn add(a, b) { a + b }
fn multiply(a, b) { a * b }
fn clamp_val(value, lo, hi) {
  if value < lo { lo }
  elif value > hi { hi }
  else { value }
}
```

Import what you need:

```tova
// main.tova
import { add, multiply } from "./math-utils"

result = add(3, multiply(4, 5))
print(result)   // 23
```

<TryInPlayground :code="basicImportCode" label="Basic Imports" />

### Import Forms

Tova supports several import styles:

```tova
// Named imports (most common)
import { add, multiply } from "./math"

// Import with alias
import { calculate as calc } from "./math"

// Default import (for JS/npm modules)
import lodash from "lodash"

// Wildcard import (namespace)
import * as math from "./math-utils"
math.add(1, 2)
math.multiply(3, 4)
```

### Import Rules

1. **Paths are relative** to the importing file: `"./utils"`, `"../shared/types"`
2. **The `.tova` extension is optional**: `"./utils"` resolves to `./utils.tova`
3. **Import only what you use**: Named imports keep dependencies clear
4. **Default imports** work for JavaScript/npm packages: `import axios from "axios"`
5. **Wildcard imports** namespace everything: `import * as utils from "./utils"`

## Project Structure

Here's how experienced Tova developers organize projects:

### Small Projects (1-5 files)

```
my-script/
  main.tova
  helpers.tova
```

Everything is flat. No need for directories.

### Medium Projects (5-20 files)

```
my-app/
  main.tova
  config.tova
  models/
    user.tova
    order.tova
    product.tova
  utils/
    validation.tova
    formatting.tova
  services/
    auth.tova
    email.tova
```

Group by domain concept. All user-related code lives in `models/user.tova`.

### Large Projects

```
my-platform/
  main.tova
  config.tova
  shared/
    types.tova
    constants.tova
  features/
    auth/
      auth-service.tova
      auth-types.tova
    orders/
      order-service.tova
      order-types.tova
      order-validation.tova
    users/
      user-service.tova
      user-types.tova
  utils/
    validation.tova
    formatting.tova
    http.tova
```

Group by feature. Each feature has its own directory with types, services, and logic.

<TryInPlayground :code="organizationCode" label="Project Organization" />

## Exports

By default, all top-level functions and types in a `.tova` file are available for import. You can use `pub` to mark items as part of your module's public API (see Chapter 6):

```tova
// users.tova
pub type User { name: String, email: String }
pub fn create_user(name, email) { User(name: name, email: email) }

// Internal helper — not exported
fn validate_email(email) { contains(email, "@") }
```

For JavaScript interop, you can use `export` to explicitly export values:

```tova
export fn greet(name) { "Hello, {name}!" }
export type Config { port: Int, debug: Bool }
```

## The REPL

Tova includes an interactive Read-Eval-Print Loop for exploring the language and testing ideas quickly:

```bash
tova repl
```

The REPL gives you a live environment with the full standard library available:

```
tova> 1 + 2
3
tova> [1, 2, 3] |> map(fn(x) x * 2)
[2, 4, 6]
tova> fn greet(name) { "Hello, {name}!" }
tova> greet("Alice")
"Hello, Alice!"
```

### REPL Commands

| Command | Description |
|---------|-------------|
| `:help` | Show available commands |
| `:clear` | Clear the screen |
| `:quit` | Exit the REPL |

The REPL supports **multi-line input** — if your expression is incomplete (e.g., you opened a brace but didn't close it), the REPL waits for more input. This makes it easy to define functions and types interactively:

```
tova> fn factorial(n) {
...>   if n <= 1 { 1 }
...>   else { n * factorial(n - 1) }
...> }
tova> factorial(10)
3628800
```

::: tip When to Use the REPL
The REPL is perfect for exploring stdlib functions, testing small snippets, debugging logic, and learning Tova syntax. For anything longer than a few lines, write a `.tova` file and run it with `tova run`.
:::

## Module Design Principles

### 1. One Concept per File

A file should have a single, clear purpose:

```tova
// GOOD: user.tova — everything about Users
type User { name: String, email: String, role: String }
fn create_user(name, email) { User(name: name, email: email, role: "member") }
fn validate_user(user) { /* ... */ }
fn format_user(user) { "{user.name} <{user.email}>" }

// BAD: models.tova — everything dumped together
type User { /* ... */ }
type Order { /* ... */ }
type Product { /* ... */ }
fn validate_user(u) { /* ... */ }
fn calculate_total(o) { /* ... */ }
```

### 2. Depend on Abstractions, Not Implementations

When module A imports from module B, A depends on B. Keep dependencies flowing one way:

```
main.tova → services/ → models/
                       → utils/
```

Models don't import from services. Utils don't import from models. This prevents circular dependencies.

### 3. Export a Clean Interface

Not everything needs to be imported. Only export the functions and types that other modules need:

```tova
// user.tova — public interface
type User { name: String, email: String }
fn create_user(name, email) { /* ... */ }
fn validate_user(data) { /* ... */ }

// These are internal — used only within this file
fn normalize_email(email) { lower(trim(email)) }
fn check_name_length(name) { len(name) >= 2 }
```

Importers see `create_user` and `validate_user`. The helper functions stay internal.

### 4. Use the `@/` Prefix for Project-Root Imports

For larger projects, relative paths get awkward (`"../../shared/types"`). Use `@/` to import from the project root:

```tova
// Instead of:
import { User } from "../../models/user"

// Use:
import { User } from "@/models/user"
```

The `@/` prefix always resolves relative to the project root directory.

## Importing JavaScript

Tova can import from npm packages:

```tova
import lodash from "lodash"
import { format } from "date-fns"
import axios from "axios"
```

JavaScript interop is seamless — imported functions work like any other function:

```tova
import { format } from "date-fns"

today = Date.new()
formatted = format(today, "yyyy-MM-dd")
print("Today is {formatted}")
```

::: tip JavaScript Interop Tip
When using JavaScript libraries, wrap them in Tova functions that return `Result` or `Option` instead of throwing. This keeps your Tova code consistent:
```tova
import { parse } from "date-fns"

fn safe_parse_date(text, fmt) {
  try {
    Ok(parse(text, fmt, Date.new()))
  } catch err {
    Err("Invalid date: {text}")
  }
}
```
:::

## Extern Declarations

When you need to call a function that exists at runtime but isn't defined in Tova or an npm package, use `extern`:

```tova
extern fn performance_now() -> Float
extern fn crypto_random_uuid() -> String
extern fn wasm_compute(data: [Int]) -> Int
```

`extern` tells the compiler "this function exists — trust me." The compiler won't look for an implementation; it just emits the call as-is. This is how you bridge to:

- **WebAssembly modules** loaded at runtime
- **Native bindings** provided by Bun
- **Global browser APIs** not in the stdlib
- **Runtime-injected functions** from your deployment environment

```tova
extern fn fetch_native(url: String) -> Promise
extern fn console_time(label: String)
extern fn console_time_end(label: String)

async fn benchmark_fetch(url) {
  console_time("fetch")
  result = await fetch_native(url)
  console_time_end("fetch")
  result
}
```

::: warning Type Safety
`extern` declarations bypass Tova's type checking. If the declared signature doesn't match the actual function, you'll get runtime errors. Use `extern` sparingly and prefer Tova's stdlib or npm imports when available.
:::

## `Type.new()` for JavaScript Constructors

When you need to call a JavaScript constructor (the `new` keyword), Tova uses the `.new()` syntax:

```tova
date = Date.new()                         // new Date()
regex = RegExp.new("\\d+", "g")          // new RegExp("\\d+", "g")
buffer = ArrayBuffer.new(1024)            // new ArrayBuffer(1024)
map_obj = Map.new()                       // new Map()
```

This works with any JavaScript class, including imported ones:

```tova
import EventEmitter from "events"

emitter = EventEmitter.new()
```

## Multi-File Compilation

When you run `tova build`, the compiler:
1. Starts from your entry file
2. Follows all `import` statements
3. Compiles each `.tova` file to `.js`
4. Rewrites imports to reference the compiled files
5. Outputs everything to `.tova-out/`

```bash
tova build main.tova
# Compiles main.tova and all its dependencies
# Output in .tova-out/
```

For development, the dev server watches all imported files:

```bash
tova dev main.tova
# Auto-rebuilds when any .tova file changes
```

## Practical: Organizing a Calculator Project

Let's see how to split the expression evaluator from Chapter 5 into modules:

```tova
// types.tova — Type definitions
type Expr {
  Num(value: Float)
  Add(left: Expr, right: Expr)
  Mul(left: Expr, right: Expr)
  Neg(expr: Expr)
}
```

```tova
// evaluator.tova — Evaluation logic
import { Expr, Num, Add, Mul, Neg } from "./types"

fn eval_expr(expr) {
  match expr {
    Num(v) => v
    Add(l, r) => eval_expr(l) + eval_expr(r)
    Mul(l, r) => eval_expr(l) * eval_expr(r)
    Neg(e) => 0.0 - eval_expr(e)
  }
}
```

```tova
// formatter.tova — Display logic
import { Expr, Num, Add, Mul, Neg } from "./types"

fn format_expr(expr) {
  match expr {
    Num(v) => to_string(v)
    Add(l, r) => "({format_expr(l)} + {format_expr(r)})"
    Mul(l, r) => "({format_expr(l)} * {format_expr(r)})"
    Neg(e) => "-{format_expr(e)}"
  }
}
```

```tova
// main.tova — Entry point
import { Num, Add, Mul, Neg } from "./types"
import { eval_expr } from "./evaluator"
import { format_expr } from "./formatter"

expr = Mul(Add(Num(2.0), Num(3.0)), Neg(Num(4.0)))
print("{format_expr(expr)} = {eval_expr(expr)}")
```

Each file has a clear responsibility. Types are shared, logic is separated, and the entry point ties everything together.

## Exercises

**Exercise 9.1:** Take the word frequency counter from Chapter 3 and split it into three files:
- `text-utils.tova` — word splitting, cleaning, counting functions
- `display.tova` — histogram formatting, table output
- `main.tova` — orchestrates the pipeline

**Exercise 9.2:** Create a `validation.tova` module with reusable validators:
- `validate_required(value, field_name)` → Result
- `validate_min_length(text, min_len, field_name)` → Result
- `validate_email(text)` → Result
- `validate_range(n, lo, hi, field_name)` → Result

Then import and use them in a `user-form.tova` file.

**Exercise 9.3:** Design the module structure for a "library catalog" app. Write out the file tree, the types each file would export, and the import relationships. Don't implement it — just plan the architecture. Think about: books, authors, categories, borrowing, search.

## Challenge

Build a **multi-file task manager** with:
1. `types.tova` — Task, Priority, Status types
2. `storage.tova` — Functions to add, remove, update, and list tasks
3. `search.tova` — Search and filter tasks by various criteria
4. `display.tova` — Format tasks as tables, summaries, and reports
5. `main.tova` — Demo that exercises all functionality

Each module should import only what it needs. No circular dependencies.

---

[← Previous: Pipes and Transformations](./pipes) | [Next: Async Programming →](./async)
