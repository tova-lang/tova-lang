---
title: CLI Reference
---

# CLI Reference

The `lux` command-line interface is the primary tool for developing, building, and running Lux applications. It runs on [Bun](https://bun.sh) and is located at `bin/lux.js`.

## Installation

```bash
bun install lux-lang
```

After installation, the `lux` command is available globally (or via `bunx lux`).

## Commands

### `lux new <name>`

Scaffold a new Lux project.

```bash
lux new my-app
```

This creates a project directory with:

- `src/app.lux` -- a starter full-stack application with shared types, a server route, and a reactive client
- `package.json` -- configured with `dev` and `build` scripts
- `README.md` -- basic project documentation

After scaffolding:

```bash
cd my-app
bun install
bun run dev
```

### `lux run <file>`

Compile and execute a single `.lux` file with Bun. The full standard library is automatically available.

```bash
lux run src/app.lux
lux run src/app.lux --debug
```

You can also pass a `.lux` file directly without the `run` subcommand:

```bash
lux app.lux
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--debug` | Show verbose error output with full stack traces |

### `lux build [dir]`

Compile all `.lux` files in a directory to JavaScript. The default source directory is the current directory, and output goes to `.lux-out/`.

```bash
lux build
lux build src
lux build src --output dist
lux build src --production
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
| `--output`, `-o` | Output directory (default: `.lux-out`) |
| `--production` | Production build with bundling, content hashing, and minification |
| `--debug` | Verbose error output |

### `lux dev [dir]`

Start the development server with automatic file watching and rebuilds.

```bash
lux dev
lux dev src
lux dev src --port 8080
```

The dev server compiles all `.lux` files, starts server processes, serves client HTML, and watches for file changes with automatic rebuilds.

**Flags:**

| Flag | Description |
|------|-------------|
| `--port` | Server port (default: `3000`) |
| `--debug` | Verbose error output |

See [Dev Server](./dev-server.md) for more details.

### `lux repl`

Start an interactive Read-Eval-Print Loop.

```bash
lux repl
```

The REPL supports multi-line input, full standard library access, and special commands like `:quit`, `:help`, and `:clear`.

See [REPL](./repl.md) for more details.

### `lux test [dir]`

Discover and run `test` blocks in `.lux` files.

```bash
lux test
lux test src
lux test --filter "math"
lux test --watch
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--filter` | Run only tests matching the given pattern |
| `--watch` | Watch for file changes and re-run tests |

See [Test Runner](./test-runner.md) for more details.

### `lux fmt [files]`

Format `.lux` source files for consistent style.

```bash
lux fmt src/app.lux
lux fmt src/app.lux src/utils.lux
lux fmt src/app.lux --check
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--check` | Check formatting without modifying files (exits with code 1 if changes needed) |

See [Formatter](./formatter.md) for more details.

### `lux lsp`

Start the Language Server Protocol server. This is typically invoked by editors rather than run directly.

```bash
lux lsp
```

The LSP communicates via JSON-RPC over stdio and provides diagnostics, completion, go-to-definition, hover, and signature help.

See [LSP Server](../editor/lsp.md) for more details.

### `lux migrate:create <name>`

Create a new migration file in the `migrations/` directory.

```bash
lux migrate:create add_users_table
```

This generates a timestamped migration file like `20260213143022_add_users_table.js` with `up` and `down` SQL templates.

### `lux migrate:up [file]`

Run all pending migrations against the database configured in your `.lux` file.

```bash
lux migrate:up
lux migrate:up src/app.lux
```

The command reads the `db` configuration from the specified `.lux` file (or auto-discovers `main.lux` / `app.lux`), creates a `__migrations` tracking table if needed, and executes any unapplied migration files in order.

### `lux migrate:status [file]`

Show the current status of all migrations.

```bash
lux migrate:status
lux migrate:status src/app.lux
```

Displays each migration file with its status (`applied` with timestamp, or `pending`).

## Global Flags

| Flag | Description |
|------|-------------|
| `--help`, `-h` | Show help message |
| `--version`, `-v` | Show Lux version |
| `--debug` | Verbose error output (available on most commands) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Port for the default server block |
| `PORT_<NAME>` | Port for a named server block (e.g., `PORT_API`, `PORT_EVENTS`) |
| `DEBUG` | Enable debug output (equivalent to `--debug`) |
