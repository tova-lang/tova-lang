# CLI Reference

The `lux` command-line interface compiles and runs Lux programs.

## Commands

### `lux new <name>`

Create a new Lux project:

```bash
lux new my-app
cd my-app
bun install
```

Creates a project directory with:

```
my-app/
├── package.json
├── README.md
└── src/
    └── app.lux
```

### `lux dev [directory]`

Start a development server:

```bash
lux dev .
lux dev src
lux dev ./my-project
```

The dev server:
- Compiles all `.lux` files in the directory
- Starts the server (default port 3000)
- Inlines the reactive runtime into the client HTML
- Serves client HTML on the root route (`/`)
- Handles all API routes and RPC endpoints

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--port <n>` | Server port | `3000` |
| `--debug` | Enable debug output | `false` |

### `lux build [directory]`

Compile `.lux` files to JavaScript:

```bash
lux build .
lux build src
```

**Output:**

```
.lux-out/
├── app.server.js       # Server code
├── app.client.js       # Client code
├── app.shared.js       # Shared types/functions
└── runtime/
    ├── reactivity.js   # Reactive runtime
    └── router.js       # Client-side router
```

For named server blocks:

```
.lux-out/
├── app.server.api.js       # server "api" { }
├── app.server.events.js    # server "events" { }
├── app.client.js
└── app.shared.js
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--output <dir>` | Output directory | `.lux-out/` |
| `--debug` | Enable debug output | `false` |

### `lux run <file>`

Compile and execute a single Lux file:

```bash
lux run hello.lux
lux run examples/counter.lux
```

This compiles the file to JavaScript and runs it immediately with Bun. Standard library functions (`print`, `len`, `range`, etc.) are available automatically.

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--debug` | Enable debug output | `false` |

### `lux migrate:create <name>`

Create a new database migration:

```bash
lux migrate:create add_users_table
```

Creates a migration file in the `migrations/` directory with a timestamp prefix.

### `lux migrate:up [file]`

Run pending database migrations:

```bash
lux migrate:up app.lux
lux migrate:up              # uses default app.lux
```

Reads the database configuration from the specified `.lux` file and runs all pending migrations in order.

### `lux migrate:status [file]`

Show the status of database migrations:

```bash
lux migrate:status app.lux
```

Displays which migrations have been run and which are pending.

## Global Flags

These flags work with all commands:

| Flag | Description |
|------|-------------|
| `--help`, `-h` | Show help information |
| `--version`, `-v` | Show Lux version |
| `--debug` | Enable verbose debug output |

## Examples

```bash
# Create and run a simple program
echo 'print("Hello!")' > hello.lux
lux run hello.lux

# Start development server
lux dev .

# Build for production
lux build src

# Run with debug output
lux run --debug app.lux

# Database migrations
lux migrate:create create_posts
lux migrate:up app.lux
lux migrate:status app.lux
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port for unnamed server block | `3000` |
| `PORT_<NAME>` | Port for named server block (e.g., `PORT_API`) | Auto-assigned |

When an unnamed `server {}` block exists, it gets port 3000 and named blocks start from 3001. If only named blocks exist, the first one gets port 3000.
