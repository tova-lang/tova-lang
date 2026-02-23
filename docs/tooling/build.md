---
title: Build System
---

# Build System

The Tova build system compiles `.tova` source files into JavaScript, handling shared types, server blocks, client blocks, and runtime dependencies.

## Basic Build

```bash
tova build
tova build src
tova build src --output dist
tova build src --production
tova build src --binary my-app
```

By default, `tova build` compiles all `.tova` files in the current directory and outputs JavaScript to `.tova-out/`.

**Flags:**

| Flag | Description |
|------|-------------|
| `--output`, `-o` | Output directory (default: `.tova-out`) |
| `--production` | Production build with bundling, content hashing, and minification |
| `--binary <name>` | Compile to a standalone executable |
| `--watch` | Watch for file changes and rebuild |
| `--no-cache` | Skip incremental build cache |
| `--strict` | Enable strict type checking |
| `--verbose` | Show detailed output (timing, cached files) |
| `--quiet` | Suppress non-error output |

## Output Structure

After building, the `.tova-out/` directory contains:

```
.tova-out/
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

Each `.tova` source file produces up to several output files:

| Output | Source | Description |
|--------|--------|-------------|
| `<name>.shared.js` | `shared { ... }` | Types and functions available to both server and client |
| `<name>.server.js` | `server { ... }` | Default server block code |
| `<name>.server.<block>.js` | `server "<block>" { ... }` | Named server blocks |
| `<name>.client.js` | `client { ... }` | Default client block code |
| `<name>.client.<block>.js` | `client "<block>" { ... }` | Named client blocks |

## Incremental Caching

The build system caches compilation results in `.tova-out/.cache/manifest.json`. On subsequent builds, files whose content has not changed are skipped automatically:

```
  Building 5 file(s)...

  ○ src/types.tova (cached)
  ○ src/utils.tova (cached)
  ✓ src/app.tova
```

This significantly speeds up rebuilds in large projects. Use `--no-cache` to force a full recompile:

```bash
tova build --no-cache
```

For multi-file directories, the cache tracks all files in the group -- if any file changes, the entire directory is recompiled.

## Watch Mode

Use `--watch` to automatically rebuild when `.tova` files change:

```bash
tova build --watch
```

The watcher uses `fs.watch()` with a 100ms debounce timer to batch rapid saves. On change, only affected files and their transitive dependents are recompiled.

## Production Builds

```bash
tova build --production
tova build src --production --output dist
```

Production builds apply four optimizations:

1. **Bundling** -- All imports and dependencies are resolved and inlined into single output files, eliminating the need for a module loader at runtime. npm imports used in client code are bundled via `Bun.build`.

2. **Content Hashing** -- Output filenames include content hashes (e.g., `app.client.a1b2c3d4.js`) for cache-busting. When file contents change, the hash changes, ensuring browsers fetch the new version.

3. **Minification** -- Whitespace, comments, and unnecessary characters are removed to reduce file size. Uses `Bun.Transpiler` with a fallback to a custom minifier.

4. **Dead Function Elimination** -- Unreachable top-level functions are removed via reachability analysis. Starting from non-function root code, the compiler traces all transitively called functions and removes the rest.

Production builds also generate an `index.html` with hashed script references.

## Binary Builds

Compile a Tova project into a standalone executable:

```bash
tova build --binary my-app
```

This compiles all `.tova` files into a single JavaScript bundle and uses `bun build --compile` to produce a self-contained binary. If the code defines a `main()` function, it is called automatically.

## Source Maps

The build system generates source maps for compiled files. Each `.js` output file gets a corresponding `.js.map` file that maps back to the original `.tova` source.

Source maps are appended as a `sourceMappingURL` comment:

```js
// Generated JavaScript code...
//# sourceMappingURL=app.server.js.map
```

This enables debugging in browser DevTools and editor integrations that can step through the original Tova source.

## Multi-File Projects

### Same-Directory Merging

When multiple `.tova` files exist in the same directory, the build system **merges** them automatically. All same-type blocks are combined into a single output per directory:

```
src/
  types.tova           # shared { type Task { ... } }
  server.tova          # server { db, model, routes }
  components.tova      # client { component StatsBar, component TaskItem }
  app.tova             # client { state, effects, component App }
```

All `client {}` blocks from `components.tova` and `app.tova` merge into one client output. `App` can reference `StatsBar` and `TaskItem` without imports. All `shared {}` blocks merge. All `server {}` blocks merge.

The output uses the directory name as the base filename:

```
.tova-out/
  src.shared.js        # merged shared blocks
  src.server.js        # merged server blocks
  src.client.js        # merged client blocks
  runtime/
    ...
```

Single-file directories compile exactly as before -- no behavior change.

### Duplicate Detection

If two files in the same directory declare the same top-level name, the compiler reports an error with both file locations:

```
Error: Duplicate component 'App'
  → first defined in app.tova:15
  → also defined in main.tova:42
```

The following are checked for conflicts across files:

- **Client blocks:** component names, top-level state, computed, store, and fn names
- **Server blocks:** fn names, model names, route conflicts (same method + path), singleton configs (db, cors, auth, session, etc.)
- **Shared blocks:** type names, fn names, interface/trait names

Declarations scoped inside components or stores (like `state` inside a `component`) do not conflict across files.

### Cross-Directory Imports

Files in subdirectories are separate modules that require explicit imports:

```tova
// src/app.tova -- import from subdirectory
import { validate_email } from "./utils/validators.tova"
```

During compilation of cross-directory imports:

- `.tova` imports are discovered and compiled first
- Import paths are rewritten from `.tova` to `.js` in the output
- Circular dependencies are detected and reported as errors
- A compilation cache prevents re-compiling files that have already been processed

## Runtime Files

The build copies Tova runtime files into the output `runtime/` directory:

| File | Purpose |
|------|---------|
| `reactivity.js` | Reactive state management (`state`, `computed`, `effect`) |
| `rpc.js` | Client-to-server RPC call infrastructure |
| `router.js` | Client-side URL routing |

These are automatically imported by the generated server and client code.

## Named Server Block Output

When using multiple named server blocks, each gets its own output file:

```tova
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
  --> src/app.tova:12:5
   |
12 |     print(usrName)
   |           ^^^^^^^ Did you mean 'userName'?
```

The build continues compiling remaining files even when individual files fail, reporting a summary at the end:

```
  Build complete. 4/5 succeeded.
```

Use `--debug` for full stack traces on compilation errors.
