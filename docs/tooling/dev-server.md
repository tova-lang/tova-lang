---
title: Dev Server
---

# Dev Server

The Tova dev server provides a full development environment with automatic compilation, server process management, and live reloading on file changes.

## Starting the Dev Server

```bash
tova dev              # Current directory
tova dev src          # Specify source directory
tova dev src --port 8080  # Custom port
```

## What It Does

When you run `tova dev`, the following happens:

1. **Groups** all `.tova` files by directory
2. **Merges** same-type blocks from all files in each directory into a unified AST
3. **Compiles** the merged AST to `.tova-out/`
4. **Copies** runtime files (reactivity, RPC, router) to `.tova-out/runtime/`
5. **Generates** client HTML with inlined reactive runtime
6. **Starts** server processes for each server block
7. **Watches** for file changes and auto-rebuilds

```
  Tova dev server starting...

  Compiled 2 file(s)
  Output: .tova-out/
  Starting server on port 3000

  1 server process(es) running
    -> server: http://localhost:3000
  Client: .tova-out/index.html

  Watching for changes. Press Ctrl+C to stop
```

For multi-file projects, the dev server merges all `.tova` files in the same directory before compilation. Components, state, and server functions defined in any file are available to all other files in the same directory without imports.

## Client HTML Generation

The dev server generates an `index.html` that inlines the Tova reactive runtime directly into the page, avoiding any module loading overhead during development. This includes:

- The **reactivity runtime** (`state`, `computed`, `effect`, component rendering)
- The **RPC runtime** (client-to-server function calls)
- Your **compiled client code**

The generated HTML is served at the root route `/` by the server.

## Server Processes

Each server block in your `.tova` files runs as a separate Bun process:

```tova
server {
  route GET "/api/users" => list_users
}
```

This starts a single server on port 3000 (the default).

### Multiple Server Blocks

Named server blocks each get their own process and port:

```tova
server "api" {
  route GET "/api/users" => list_users
}

server "events" {
  // WebSocket/SSE server
}
```

```
  Starting server:api on port 3000
  Starting server:events on port 3001

  2 server process(es) running
    -> server:api: http://localhost:3000
    -> server:events: http://localhost:3001
```

Ports increment automatically from the base port. You can also configure them via environment variables:

```bash
PORT=3000 PORT_EVENTS=4000 tova dev
```

## File Watching

The dev server watches the source directory for changes to `.tova` files. When a change is detected:

1. A short debounce period ensures multiple rapid saves are batched
2. All `.tova` files in the changed file's directory are re-merged and recompiled
3. If compilation succeeds, old server processes are gracefully terminated (SIGTERM, with SIGKILL escalation after 2 seconds)
4. New server processes are spawned with the updated code
5. If compilation fails, the error is reported and old processes continue running

```
  Rebuilding...
  Rebuild complete
```

This means your application stays available even if a save introduces a syntax error.

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `--port` | `3000` | Base port for server processes |
| `--debug` | off | Verbose error output |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Override the default server port |
| `PORT_<NAME>` | Override the port for a named server block |

## Graceful Shutdown

Press `Ctrl+C` to stop the dev server. This:

1. Closes the file watcher
2. Sends SIGTERM to all server processes
3. Exits cleanly

## Typical Workflow

```bash
# 1. Create a new project
tova new my-app
cd my-app

# 2. Install dependencies
bun install

# 3. Start development
tova dev src

# 4. Open in browser
open http://localhost:3000

# 5. Edit src/app.tova -- changes apply automatically
```
