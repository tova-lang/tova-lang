# CLI Block

The `cli {}` block is a top-level language construct in Tova that turns function signatures into complete command-line interfaces. You declare commands as functions with typed parameters, and the compiler generates a zero-dependency CLI executable with argument parsing, validation, help text, subcommands, and rich error messages -- all from your function signature alone.

## Why a Dedicated CLI Block?

Without first-class CLI support, building command-line tools means choosing between:

- **Manual `if/elif` dispatch** on `args()` -- brittle, no help text, no validation, no type coercion
- **External frameworks** (Click, Cobra, Commander.js) -- dependency overhead, framework-specific APIs, boilerplate decorators or builder chains

The `cli {}` block eliminates both:

- **The function signature IS the CLI interface** -- parameter names become argument names, types provide validation, `--` prefixes mark flags
- **Zero dependencies** -- the compiler generates all parsing, validation, and help text directly. No packages to install
- **Compile-time checks** -- the analyzer warns on duplicate commands, positional arguments after flags, and missing config
- **Auto-generated help** -- `--help` shows usage, arguments, options, and defaults for every command
- **Type coercion** -- `Int` parameters auto-parse from strings with error messages on invalid input
- **Single-command optimization** -- if you define only one command, the subcommand layer is skipped entirely

## Syntax Overview

```tova
cli {
  name: "deploy"
  version: "1.0.0"
  description: "Deploy your app"

  fn deploy(target: String, --env: String = "staging", --port: Int = 3000, --verbose: Bool) {
    print(bold("Deploying ") + green(target) + " to " + env)
    if verbose {
      print(dim("Port: {port}"))
    }
  }

  fn init(name: String?) {
    project = name ?? "my-app"
    print("Initializing {project}")
  }
}
```

This compiles to a standalone executable with:

```bash
$ deploy --help
deploy -- Deploy your app
Version: 1.0.0

USAGE:
  deploy <command> [options]

COMMANDS:
  deploy
  init

OPTIONS:
  --help, -h     Show help
  --version, -v  Show version

$ deploy deploy production --port 8080 --verbose
Deploying production to staging
Port: 8080

$ deploy init
Initializing my-app

$ deploy deploy
Error: Missing required argument <target>
USAGE:
  deploy deploy <target> [--env <String>] [--port <Int>] [--verbose]
```

## Config Fields

The `cli {}` block supports three config fields at the top level:

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | The CLI tool name (used in help text and usage lines) |
| `version` | String | Version string (enables `--version` / `-v` flag) |
| `description` | String | One-line description shown in help text |

```tova
cli {
  name: "mytool"
  version: "2.1.0"
  description: "A fantastic CLI tool"
}
```

All fields are optional. If `name` is omitted, the analyzer warns with `W_CLI_MISSING_NAME`.

## Commands

Each `fn` declaration inside a `cli {}` block becomes a subcommand. The function name is the command name, parameters become arguments and flags, and the function body is executed when the command is invoked.

```tova
cli {
  name: "git-like"

  fn clone(url: String, --depth: Int) {
    print("Cloning {url}")
  }

  fn push(--force: Bool, --remote: String = "origin") {
    print("Pushing to {remote}")
  }
}
```

### Async Commands

Commands can be `async` for operations that need `await`:

```tova
cli {
  name: "fetcher"

  async fn download(url: String, --output: String = "out.txt") {
    data = await fetch(url)
    fs.write_text(output, data)
    print(green("Saved to {output}"))
  }
}
```

### Single-Command Mode

If you define only one command, the compiler skips subcommand routing entirely. The user invokes the tool directly without specifying a subcommand name:

```tova
cli {
  name: "greet"
  version: "1.0.0"

  fn greet(name: String, --loud: Bool) {
    greeting = "Hello, {name}!"
    if loud {
      print(upper(greeting))
    } else {
      print(greeting)
    }
  }
}
```

```bash
$ greet Alice --loud
HELLO, ALICE!

# NOT "greet greet Alice" -- single-command mode
```

## Parameters

### Positional Arguments

Parameters without `--` are positional arguments, matched by position on the command line:

```tova
fn copy(source: String, dest: String) {
  // source = first arg, dest = second arg
}
```

```bash
$ tool copy /tmp/a.txt /tmp/b.txt
```

### Flags

Parameters prefixed with `--` are named flags:

```tova
fn serve(--host: String = "localhost", --port: Int = 3000) {
  print("Serving on {host}:{port}")
}
```

```bash
$ tool serve --host 0.0.0.0 --port 8080
```

Flags also support `--flag=value` syntax:

```bash
$ tool serve --port=8080
```

### Type Annotations

Parameter types control how argv strings are parsed:

| Type | Parsing | Error on invalid |
|------|---------|------------------|
| `String` | No conversion (default) | -- |
| `Int` | `parseInt()` with NaN check | `"Error: --port must be an integer, got "abc""` |
| `Float` | `parseFloat()` with NaN check | `"Error: --rate must be a number, got "xyz""` |
| `Bool` | Toggle flag (no value needed) | -- |

### Bool Flags

Bool flags are toggles -- they don't take a value. They default to `false` and become `true` when present:

```tova
fn build(--verbose: Bool, --minify: Bool) {
  if verbose { print("Verbose mode on") }
  if minify { print("Minifying output") }
}
```

```bash
$ tool build --verbose --minify
```

Bool flags also support `--no-` prefix to explicitly set `false`:

```bash
$ tool build --no-minify
```

### Optional Parameters

Add `?` after the type to make a positional argument optional:

```tova
fn init(name: String?) {
  project = name ?? "my-app"
  print("Initializing {project}")
}
```

```bash
$ tool init           # name is undefined, falls back to "my-app"
$ tool init my-proj   # name is "my-proj"
```

### Default Values

Both positional and flag parameters support default values:

```tova
fn deploy(target: String, --env: String = "staging", --replicas: Int = 1) {
  print("Deploying {target} to {env} with {replicas} replicas")
}
```

Defaults are shown in help text and used when the argument is not provided.

### Repeated Flags

Use `[Type]` to collect multiple values for a flag:

```tova
fn build(--include: [String]) {
  for path in include {
    print("Including {path}")
  }
}
```

```bash
$ tool build --include src --include lib --include vendor
```

Each occurrence of `--include` appends to the array.

## Help and Version

The compiler auto-generates help handlers:

- `--help` / `-h` shows overall help (command list + global options)
- `<command> --help` shows per-command help (arguments, flags, defaults)
- `--version` / `-v` shows the version (only when `version:` is configured)

### Overall Help

```
mytool -- A fantastic CLI tool
Version: 2.1.0

USAGE:
  mytool <command> [options]

COMMANDS:
  deploy
  init

OPTIONS:
  --help, -h     Show help
  --version, -v  Show version
```

### Per-Command Help

```
USAGE:
  mytool deploy <target> [--env <String>] [--port <Int>] [--verbose]

ARGUMENTS:
  target           <String>

OPTIONS:
  --env            <String> (default: "staging")
  --port           <Int> (default: 3000)
  --verbose
  --help, -h      Show help
```

## Error Handling

The generated CLI produces clear error messages for common mistakes:

**Missing required argument:**
```
Error: Missing required argument <target>
USAGE:
  deploy deploy <target> [--env <String>]
```

**Invalid type:**
```
Error: --port must be an integer, got "abc"
```

**Unknown flag:**
```
Error: Unknown flag --foobar
```

All errors exit with code 1.

## Rich Output

Tova provides stdlib functions designed for CLI output. These are available everywhere, but especially useful inside `cli {}` blocks:

### Colors

```tova
print(green("Success!"))
print(red("Error: something failed"))
print(yellow("Warning: check your config"))
print(bold("Important message"))
print(dim("Less important"))
```

Available: `green()`, `red()`, `yellow()`, `blue()`, `cyan()`, `magenta()`, `gray()`, `bold()`, `dim()`, `underline()`, `strikethrough()`, `color(text, name)`.

All color functions respect `NO_COLOR` and non-TTY environments.

### Tables

```tova
table([
  {name: "Alice", role: "Admin"},
  {name: "Bob", role: "User"}
])
```

```
 name  | role
-------+------
 Alice | Admin
 Bob   | User
```

### Panels

```tova
panel("Status", "All systems operational\nUptime: 99.9%")
```

```
┌─ Status ───────────────────┐
│ All systems operational     │
│ Uptime: 99.9%              │
└─────────────────────────────┘
```

### Progress Bars

```tova
for item in progress(items, label: "Processing") {
  process(item)
}
```

Shows a progress bar on stderr that updates in place:

```
Processing [████████░░░░░░░░] 50% 5/10
```

### Spinners

```tova
result = await spin("Deploying", async fn() {
  await deploy_to_server()
})
```

Shows a braille spinner animation while the async function runs, then a checkmark or cross on completion.

## Interactive Prompts

For commands that need user input, Tova provides async prompt functions:

```tova
cli {
  name: "setup"

  async fn init() {
    name = await ask("Project name:", default: "my-app")
    lang = await choose("Language:", ["Tova", "TypeScript", "Python"])
    confirmed = await confirm("Create project?")

    if confirmed {
      print(green("Creating {name} with {lang}"))
    }
  }
}
```

| Function | Description |
|----------|-------------|
| `ask(prompt, default?)` | Text input with optional default |
| `confirm(prompt, default?)` | Yes/no with `[Y/n]` or `[y/N]` hint |
| `choose(prompt, options)` | Numbered list, returns selected value |
| `choose_many(prompt, options)` | Comma-separated multi-select |
| `secret(prompt)` | Hidden input with `*` masking |

See [Scripting I/O](/stdlib/io) for the full reference.

## Running and Building

### Running

```bash
tova run mycli.tova -- add "Buy milk" --priority 1
```

Everything after `--` is passed to the CLI as arguments.

### Building

```bash
tova build src --output dist
```

CLI files produce a single `.js` file with a `#!/usr/bin/env node` shebang and executable permissions:

```bash
$ node dist/mycli.js --help
$ chmod +x dist/mycli.js && ./dist/mycli.js --help
```

### Standalone Binary

```bash
tova build --binary mycli
```

Compiles to a self-contained binary via `bun build --compile`.

## Compile-Time Warnings

The analyzer produces warnings for:

| Code | Warning |
|------|---------|
| `W_UNKNOWN_CLI_CONFIG` | Unknown config key (valid: `name`, `version`, `description`) |
| `W_DUPLICATE_CLI_COMMAND` | Two commands with the same name in a cli block |
| `W_POSITIONAL_AFTER_FLAG` | Positional argument declared after a flag -- positionals should come first |
| `W_CLI_MISSING_NAME` | No `name:` field in any cli block |
| `W_CLI_WITH_SERVER` | `cli {}` and `server {}` in the same file -- cli produces a standalone executable, not a web server |

## Top-Level Code

Code outside the `cli {}` block is included in the output as shared code. This is useful for type definitions, helper functions, and constants:

```tova
type Priority = Low | Medium | High

fn format_priority(p) {
  match p {
    Low => green("low")
    Medium => yellow("medium")
    High => red("high")
  }
}

cli {
  name: "tasks"

  fn add(task: String, --priority: String = "medium") {
    print("Added: {task} ({priority})")
  }
}
```

## Complete Example

Here is a full-featured CLI tool:

```tova
cli {
  name: "todo"
  version: "0.1.0"
  description: "A simple todo list manager"

  fn add(task: String, --priority: Int = 3) {
    print(green("Added: ") + bold(task) + dim(" (priority: {priority})"))
  }

  fn list(--all: Bool) {
    print(bold("Your tasks:"))
    print("  1. Buy groceries (priority: 2)")
    print("  2. Write docs (priority: 1)")
    if all {
      print(dim("  3. [done] Setup project"))
    }
  }

  fn remove(id: Int) {
    print(yellow("Removed task #{id}"))
  }
}
```

```bash
$ todo add "Buy milk" --priority 1
Added: Buy milk (priority: 1)

$ todo list --all
Your tasks:
  1. Buy groceries (priority: 2)
  2. Write docs (priority: 1)
  3. [done] Setup project

$ todo remove 2
Removed task #2

$ todo --help
todo -- A simple todo list manager
Version: 0.1.0

USAGE:
  todo <command> [options]

COMMANDS:
  add
  list
  remove

OPTIONS:
  --help, -h     Show help
  --version, -v  Show version
```
