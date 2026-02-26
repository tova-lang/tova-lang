---
title: CLI Reference
---

# CLI Reference

The `tova` command-line interface is the primary tool for developing, building, and running Tova applications. It runs on [Bun](https://bun.sh) and is located at `bin/tova.js`.

## Installation

```bash
bun install tova-lang
```

After installation, the `tova` command is available globally (or via `bunx tova`).

## Commands

### `tova new <name>`

Scaffold a new Tova project with an interactive template picker.

```bash
tova new my-app
tova new my-app --template api
```

**Templates:**

| Template | Description |
|----------|-------------|
| `fullstack` | Full-stack app with server + client + shared blocks (default) |
| `api` | API server with HTTP routes, no frontend |
| `script` | Standalone `.tova` script |
| `library` | Reusable module with exports |
| `blank` | Empty project skeleton |

When run without `--template`, an interactive picker is shown. The project also gets a `git init` automatically.

This creates a project directory with:

- `tova.toml` -- the project manifest (name, version, build settings, npm dependencies)
- Source file (varies by template) -- e.g., `src/app.tova` for fullstack, `src/main.tova` for script
- `.gitignore` -- ignores `node_modules/`, `.tova-out/`, `package.json`, `bun.lock`
- `README.md` -- basic project documentation

After scaffolding:

```bash
cd my-app
tova dev
```

### `tova init`

Initialize a Tova project in the current directory. Unlike `tova new`, this does not create a new directory -- it sets up the project structure in place.

```bash
tova init
```

This creates:

- `tova.toml` -- project manifest using the current directory name
- `src/` directory
- `.gitignore` (if not already present)
- `src/app.tova` starter file (only if no `.tova` files exist in `src/`)

If a `tova.toml` already exists, the command exits with an error.

### `tova.toml` Manifest

Every Tova project uses a `tova.toml` file as its project manifest. This replaces `package.json` as the primary configuration file.

```toml
[project]
name = "my-app"
version = "0.1.0"
description = "A full-stack Tova application"
entry = "src"

[build]
output = ".tova-out"

[dev]
port = 3000

[dependencies]
# future: tova-native packages

[npm]
htmx = "^2.0.0"
zod = "^3.0.0"

[npm.dev]
prettier = "^3.0.0"
```

| Section | Description |
|---------|-------------|
| `[project]` | Project name, version, description, and entry directory |
| `[build]` | Build output directory |
| `[dev]` | Development server settings (port) |
| `[dependencies]` | Reserved for future Tova-native packages |
| `[npm]` | npm production dependencies |
| `[npm.dev]` | npm development dependencies |

When npm dependencies are present, `tova install` generates a shadow `package.json` (included in `.gitignore`) and runs `bun install`.

### `tova install`

Install npm dependencies defined in `tova.toml`.

```bash
tova install
```

This reads the `[npm]` and `[npm.dev]` sections from `tova.toml`, generates a shadow `package.json`, and runs `bun install`. If no `tova.toml` exists, it falls back to running `bun install` directly.

### `tova add <package>`

Add an npm package to `tova.toml` and install it.

```bash
tova add htmx
tova add zod@3.22.0
tova add prettier --dev
tova add npm:lodash
```

Packages can be specified with or without the `npm:` prefix. Version pinning is supported with `@version`. For native Tova dependencies, use `file:` or `git:` prefixes.

**Flags:**

| Flag | Description |
|------|-------------|
| `--dev` | Add to `[npm.dev]` instead of `[npm]` |

### `tova remove <package>`

Remove an npm package from `tova.toml` and update the install. Searches `[dependencies]`, `[npm]`, and `[npm.dev]` sections.

```bash
tova remove htmx
```

### `tova run <file>`

Compile and execute a single `.tova` file with Bun. The full standard library is automatically available.

```bash
tova run src/app.tova
tova run src/app.tova --debug
```

You can also pass a `.tova` file directly without the `run` subcommand:

```bash
tova app.tova
```

If no file is specified and a `tova.toml` exists, the command auto-discovers `main.tova` or `app.tova` from the configured entry directory.

Script arguments can be passed after `--`:

```bash
tova run script.tova -- arg1 arg2 arg3
```

If the file defines a `main()` function, it is called automatically after compilation.

If the file contains a `cli {}` block, the generated CLI receives the script arguments as `process.argv`:

```bash
tova run mycli.tova -- add "Buy milk" --priority 1
tova run mycli.tova -- --help
```

See the [CLI Block guide](/fullstack/cli-block) for details.

**Flags:**

| Flag | Description |
|------|-------------|
| `--debug` | Show verbose error output with full stack traces |
| `--strict` | Enable strict type checking (type mismatches and argument errors become hard errors) |

### `tova build [dir]`

Compile all `.tova` files in a directory to JavaScript. The default source directory is the current directory, and output goes to `.tova-out/`.

```bash
tova build
tova build src
tova build src --output dist
tova build src --production
tova build src --binary my-app
```

**Output structure:**

| File | Description |
|------|-------------|
| `<name>.shared.js` | Shared types and functions |
| `<name>.server.js` | Default server block code |
| `<name>.server.<block>.js` | Named server blocks (e.g., `app.server.api.js`) |
| `<name>.client.js` | Default browser block code |
| `runtime/` | Copied runtime files (reactivity, RPC, router) |

**Flags:**

| Flag | Description |
|------|-------------|
| `--output`, `-o` | Output directory (default: `.tova-out`) |
| `--production` | Production build with bundling, content hashing, and minification |
| `--binary <name>` | Compile to a standalone executable via `bun build --compile` |
| `--watch` | Watch for file changes and rebuild automatically |
| `--no-cache` | Skip incremental build cache (force full recompile) |
| `--strict` | Enable strict type checking |
| `--verbose` | Show detailed output (timing, cached files) |
| `--quiet` | Suppress non-error output |

**Incremental caching:** The build system caches compilation results in `.tova-out/.cache/manifest.json`. Unchanged files are skipped on subsequent builds. Use `--no-cache` to force a full rebuild.

**Binary builds:** `--binary <name>` compiles all `.tova` files into a single JavaScript bundle and uses `bun build --compile` to produce a standalone executable. If the code defines a `main()` function, it is called automatically.

See [Build System](./build.md) for more details.

### `tova check [dir]`

Type-check `.tova` files without generating code.

```bash
tova check
tova check src
tova check src --explain E202
```

Reports diagnostics (errors and warnings) and exits with a summary. No JavaScript output is generated.

**Flags:**

| Flag | Description |
|------|-------------|
| `--explain <code>` | Show a detailed explanation for a specific error code inline |
| `--strict` | Enable strict type checking |

### `tova clean`

Delete the `.tova-out/` build artifacts directory.

```bash
tova clean
```

Reads the output directory from `tova.toml` if present, otherwise defaults to `.tova-out/`.

### `tova dev [dir]`

Start the development server with automatic file watching and rebuilds.

```bash
tova dev
tova dev src
tova dev src --port 8080
```

The dev server compiles all `.tova` files, starts server processes, serves client HTML, and watches for file changes with automatic rebuilds.

**Flags:**

| Flag | Description |
|------|-------------|
| `--port` | Server port (default: `3000`) |
| `--debug` | Verbose error output |

See [Dev Server](./dev-server.md) for more details.

### `tova repl`

Start an interactive Read-Eval-Print Loop.

```bash
tova repl
```

The REPL supports syntax highlighting, tab completion, multi-line input, full standard library access, imports, and special commands like `:quit`, `:help`, `:clear`, and `:type`.

See [REPL](./repl.md) for more details.

### `tova test [dir]`

Discover and run `test` blocks in `.tova` files. Discovers both inline `test` blocks and dedicated test files (`*.test.tova`, `*_test.tova`).

```bash
tova test
tova test src
tova test --filter "math"
tova test --watch
tova test --coverage
tova test --serial
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--filter` | Run only tests matching the given pattern |
| `--watch` | Watch for file changes and re-run tests |
| `--coverage` | Enable Bun coverage reporting |
| `--serial` | Force sequential test execution (default is parallel) |

See [Test Runner](./test-runner.md) for more details.

### `tova bench [dir]`

Discover and run `bench` blocks in `.tova` files.

```bash
tova bench
tova bench src
```

Scans for files containing `bench` blocks, compiles them to `.tova-bench-out/`, and executes them via Bun.

See the [Benchmarks section](./test-runner.md#benchmarks) of the Test Runner page for how to write `bench` blocks.

### `tova fmt [files]`

Format `.tova` source files for consistent style.

```bash
tova fmt src/app.tova
tova fmt src/app.tova src/utils.tova
tova fmt src/app.tova --check
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--check` | Check formatting without modifying files (exits with code 1 if changes needed) |

See [Formatter](./formatter.md) for more details.

### `tova doc [dir]`

Generate documentation from `///` docstrings in `.tova` files.

```bash
tova doc
tova doc src
tova doc src --output api-docs
tova doc src --format html
```

Scans for `.tova` files containing `///` docstrings, extracts documentation, and generates output files.

**Flags:**

| Flag | Description |
|------|-------------|
| `--output`, `-o` | Output directory (default: `docs-out`) |
| `--format` | Output format (default: `html`) |

### `tova lsp`

Start the Language Server Protocol server. This is typically invoked by editors rather than run directly.

```bash
tova lsp
```

The LSP communicates via JSON-RPC over stdio and provides diagnostics, completion, go-to-definition, hover, and signature help.

See [LSP Server](../editor/lsp.md) for more details.

### `tova explain <code>`

Show a detailed explanation for an error or warning code.

```bash
tova explain E202
tova explain W301
```

Each diagnostic emitted by the compiler includes a code (e.g., `E202`). This command shows what the error means and how to fix it.

### `tova migrate:create <name>`

Create a new migration file in the `migrations/` directory.

```bash
tova migrate:create add_users_table
```

This generates a timestamped migration file like `20260213143022_add_users_table.js` with `up` and `down` SQL templates.

### `tova migrate:up [file]`

Run all pending migrations against the database configured in your `.tova` file.

```bash
tova migrate:up
tova migrate:up src/app.tova
```

The command reads the `db` configuration from the specified `.tova` file (or auto-discovers `main.tova` / `app.tova`), creates a `__migrations` tracking table if needed, and executes any unapplied migration files in order.

### `tova migrate:down [file]`

Roll back the most recently applied migration.

```bash
tova migrate:down
tova migrate:down src/app.tova
```

Runs the `down` export of the last applied migration and removes it from the `__migrations` table.

### `tova migrate:reset [file]`

Roll back all applied migrations in reverse order.

```bash
tova migrate:reset
tova migrate:reset src/app.tova
```

Iterates through all applied migrations from newest to oldest, running each `down` export.

### `tova migrate:fresh [file]`

Drop all tables and re-run all migrations from scratch.

```bash
tova migrate:fresh
tova migrate:fresh src/app.tova
```

This is a destructive operation -- it drops every table in the database, re-creates the `__migrations` table, and runs all migration files. Supports SQLite, PostgreSQL, and MySQL.

### `tova migrate:status [file]`

Show the current status of all migrations.

```bash
tova migrate:status
tova migrate:status src/app.tova
```

Displays each migration file with its status (`applied` with timestamp, or `pending`).

### `tova upgrade`

Upgrade Tova to the latest version.

```bash
tova upgrade
```

Automatically detects the install method:

- **Binary installs** (`~/.tova/bin/tova`): Downloads the latest release from GitHub
- **npm/bun installs**: Uses the detected package manager (Bun, npm, pnpm, or yarn)

### `tova info`

Show Tova version, Bun version, platform info, project configuration, and installed dependencies.

```bash
tova info
```

Displays:

- Tova and Bun versions
- Platform and architecture
- Project configuration from `tova.toml` (if present)
- Installed npm dependencies
- Build output status

### `tova doctor`

Check your development environment for common issues.

```bash
tova doctor
```

Runs a series of checks:

- Tova version and install location
- Bun availability (>= 1.0 recommended)
- PATH configuration (`~/.tova/bin` in `$PATH`)
- Shell profile (Tova PATH entry in `~/.zshrc`, `~/.bashrc`, etc.)
- git availability
- `tova.toml` in current directory
- Build output directory status

Each check shows a green `✓` (pass), yellow `⚠` (warning), or red `✗` (failure).

### `tova completions <shell>`

Generate shell completions for tab-completion of commands and flags.

```bash
tova completions bash
tova completions zsh
tova completions fish
```

**Installation:**

```bash
# Bash — add to ~/.bashrc:
eval "$(tova completions bash)"

# Zsh — add to ~/.zshrc:
eval "$(tova completions zsh)"

# Fish — save to completions directory:
tova completions fish > ~/.config/fish/completions/tova.fish
```

Covers all subcommands and their flags, including `--template` values for `tova new`.

## Global Flags

| Flag | Description |
|------|-------------|
| `--help`, `-h` | Show help message |
| `--version`, `-v` | Show Tova version |
| `--output`, `-o` | Output directory (default: `.tova-out`) |
| `--production` | Production build (minify, bundle, hash) |
| `--watch` | Watch for file changes and rebuild |
| `--verbose` | Show detailed output during compilation |
| `--quiet` | Suppress non-error output |
| `--debug` | Verbose error output (available on most commands) |
| `--strict` | Enable strict type checking (available on `run`, `build`, and `check`) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Port for the default server block |
| `PORT_<NAME>` | Port for a named server block (e.g., `PORT_API`, `PORT_EVENTS`) |
| `DEBUG` | Enable debug output (equivalent to `--debug`) |
