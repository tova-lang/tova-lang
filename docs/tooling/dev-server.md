---
title: Dev Server
---

# Dev Server

The Lux dev server provides a full development environment with automatic compilation, server process management, and live reloading on file changes.

## Starting the Dev Server

```bash
lux dev              # Current directory
lux dev src          # Specify source directory
lux dev src --port 8080  # Custom port
```

## What It Does

When you run `lux dev`, the following happens:

1. **Compiles** all `.lux` files in the target directory to `.lux-out/`
2. **Copies** runtime files (reactivity, RPC, router) to `.lux-out/runtime/`
3. **Generates** client HTML with inlined reactive runtime
4. **Starts** server processes for each server block
5. **Watches** for file changes and auto-rebuilds

```
  Lux dev server starting...

  Compiled 1 file(s)
  Output: .lux-out/
  Starting server on port 3000

  1 server process(es) running
    -> server: http://localhost:3000
  Client: .lux-out/index.html

  Watching for changes. Press Ctrl+C to stop
```

## Client HTML Generation

The dev server generates an `index.html` that inlines the Lux reactive runtime directly into the page, avoiding any module loading overhead during development. This includes:

- The **reactivity runtime** (`state`, `computed`, `effect`, component rendering)
- The **RPC runtime** (client-to-server function calls)
- Your **compiled client code**

The generated HTML is served at the root route `/` by the server.

## Server Processes

Each server block in your `.lux` files runs as a separate Bun process:

```lux
server {
  route GET "/api/users" => list_users
}
```

This starts a single server on port 3000 (the default).

### Multiple Server Blocks

Named server blocks each get their own process and port:

```lux
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
PORT=3000 PORT_EVENTS=4000 lux dev
```

## File Watching

The dev server watches the source directory for changes to `.lux` files. When a change is detected:

1. A short debounce period ensures multiple rapid saves are batched
2. All `.lux` files are recompiled
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
lux new my-app
cd my-app

# 2. Install dependencies
bun install

# 3. Start development
lux dev src

# 4. Open in browser
open http://localhost:3000

# 5. Edit src/app.lux -- changes apply automatically
```
