---
title: Build System
---

# Build System

The Lux build system compiles `.lux` source files into JavaScript, handling shared types, server blocks, client blocks, and runtime dependencies.

## Basic Build

```bash
lux build
lux build src
lux build src --output dist
```

By default, `lux build` compiles all `.lux` files in the current directory and outputs JavaScript to `.lux-out/`.

## Output Structure

After building, the `.lux-out/` directory contains:

```
.lux-out/
  app.shared.js          # Shared types and functions
  app.server.js          # Default server block
  app.server.api.js      # Named server block "api"
  app.server.events.js   # Named server block "events"
  app.client.js          # Default client block
  runtime/
    reactivity.js        # Reactive state runtime
    rpc.js               # Server RPC client
    router.js            # Client-side router
```

Each `.lux` source file produces up to several output files:

| Output | Source | Description |
|--------|--------|-------------|
| `<name>.shared.js` | `shared { ... }` | Types and functions available to both server and client |
| `<name>.server.js` | `server { ... }` | Default server block code |
| `<name>.server.<block>.js` | `server "<block>" { ... }` | Named server blocks |
| `<name>.client.js` | `client { ... }` | Default client block code |
| `<name>.client.<block>.js` | `client "<block>" { ... }` | Named client blocks |

## Production Builds

```bash
lux build --production
lux build src --production --output dist
```

Production builds apply three optimizations:

1. **Bundling** -- All imports and dependencies are resolved and inlined into single output files, eliminating the need for a module loader at runtime.

2. **Content Hashing** -- Output filenames include content hashes (e.g., `app.client.a1b2c3d4.js`) for cache-busting. When file contents change, the hash changes, ensuring browsers fetch the new version.

3. **Minification** -- Whitespace, comments, and unnecessary characters are removed to reduce file size.

## Source Maps

The build system generates source maps for compiled files. Each `.js` output file gets a corresponding `.js.map` file that maps back to the original `.lux` source.

Source maps are appended as a `sourceMappingURL` comment:

```js
// Generated JavaScript code...
//# sourceMappingURL=app.server.js.map
```

This enables debugging in browser DevTools and editor integrations that can step through the original Lux source.

## Multi-File Projects

For projects with multiple `.lux` files that import from each other, the build system uses `compileWithImports` to resolve the dependency graph:

```lux
// utils.lux
shared {
  fn format_date(d) -> String {
    // ...
  }
}
```

```lux
// app.lux
import { format_date } from "./utils"

server {
  fn get_post() {
    post = fetch_post()
    post.date = format_date(post.created_at)
    post
  }
}
```

During compilation:

- `.lux` imports are discovered and compiled first
- Import paths are rewritten from `.lux` to `.js` in the output
- Circular dependencies are detected and reported as errors
- A compilation cache prevents re-compiling files that have already been processed

## Runtime Files

The build copies Lux runtime files into the output `runtime/` directory:

| File | Purpose |
|------|---------|
| `reactivity.js` | Reactive state management (`state`, `computed`, `effect`) |
| `rpc.js` | Client-to-server RPC call infrastructure |
| `router.js` | Client-side URL routing |

These are automatically imported by the generated server and client code.

## Named Server Block Output

When using multiple named server blocks, each gets its own output file:

```lux
server "api" {
  route GET "/api/users" => list_users
}

server "events" {
  // WebSocket server
}
```

This compiles to:

- `app.server.api.js` -- the API server
- `app.server.events.js` -- the events server

Each named server runs as a separate process on its own port, configurable via `PORT_<NAME>` environment variables (e.g., `PORT_API=3001`, `PORT_EVENTS=3002`).

## Build Errors

When compilation fails, the build reports errors with Rust/Elm-style diagnostics including source context and caret markers pointing to the exact location:

```
error: Undefined identifier 'usrName'
  --> src/app.lux:12:5
   |
12 |     print(usrName)
   |           ^^^^^^^ Did you mean 'userName'?
```

The build continues compiling remaining files even when individual files fail, reporting a summary at the end:

```
  Build complete. 4/5 succeeded.
```

Use `--debug` for full stack traces on compilation errors.
