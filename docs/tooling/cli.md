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

Scaffold a new Tova project.

```bash
tova new my-app
```

This creates a project directory with:

- `src/app.tova` -- a starter full-stack application with shared types, a server route, and a reactive client
- `package.json` -- configured with `dev` and `build` scripts
- `README.md` -- basic project documentation

After scaffolding:

```bash
cd my-app
bun install
bun run dev
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
```

**Output structure:**

| File | Description |
|------|-------------|
| `<name>.shared.js` | Shared types and functions |
| `<name>.server.js` | Default server block code |
| `<name>.server.<block>.js` | Named server blocks (e.g., `app.server.api.js`) |
| `<name>.client.js` | Default client block code |
| `runtime/` | Copied runtime files (reactivity, RPC, router) |

**Flags:**

| Flag | Description |
|------|-------------|
| `--output`, `-o` | Output directory (default: `.tova-out`) |
| `--production` | Production build with bundling, content hashing, and minification |
| `--strict` | Enable strict type checking |
| `--debug` | Verbose error output |

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

The REPL supports multi-line input, full standard library access, and special commands like `:quit`, `:help`, and `:clear`.

See [REPL](./repl.md) for more details.

### `tova test [dir]`

Discover and run `test` blocks in `.tova` files.

```bash
tova test
tova test src
tova test --filter "math"
tova test --watch
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--filter` | Run only tests matching the given pattern |
| `--watch` | Watch for file changes and re-run tests |

See [Test Runner](./test-runner.md) for more details.

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

### `tova lsp`

Start the Language Server Protocol server. This is typically invoked by editors rather than run directly.

```bash
tova lsp
```

The LSP communicates via JSON-RPC over stdio and provides diagnostics, completion, go-to-definition, hover, and signature help.

See [LSP Server](../editor/lsp.md) for more details.

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

### `tova migrate:status [file]`

Show the current status of all migrations.

```bash
tova migrate:status
tova migrate:status src/app.tova
```

Displays each migration file with its status (`applied` with timestamp, or `pending`).

## Global Flags

| Flag | Description |
|------|-------------|
| `--help`, `-h` | Show help message |
| `--version`, `-v` | Show Tova version |
| `--debug` | Verbose error output (available on most commands) |
| `--strict` | Enable strict type checking (available on `run` and `build`) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Port for the default server block |
| `PORT_<NAME>` | Port for a named server block (e.g., `PORT_API`, `PORT_EVENTS`) |
| `DEBUG` | Enable debug output (equivalent to `--debug`) |
