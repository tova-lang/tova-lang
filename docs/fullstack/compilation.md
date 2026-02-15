# Compilation

This page explains what happens when you run `tova build` or `tova dev`, what files are generated, and how the production build pipeline works.

## Build Command

```bash
tova build [src_dir] [--output dir] [--production]
```

By default, `tova build` compiles all `.tova` files in the current directory and writes output to `.tova-out/`.

| Flag | Description |
|------|-------------|
| `--output`, `-o` | Output directory (default: `.tova-out`) |
| `--production` | Production build with bundling, hashing, and minification |
| `--watch` | Watch for file changes and rebuild |

## Output Structure

For a file named `app.tova` with all three blocks:

```
.tova-out/
  app.shared.js             # Shared types and functions
  app.server.js             # Server code (Bun.serve)
  app.client.js             # Client code (reactive runtime)
  runtime/
    reactivity.js           # Reactive runtime (signals, effects, DOM)
    rpc.js                  # RPC bridge client
    router.js               # Client-side router
    devtools.js             # DevTools (opt-in, development only)
```

With named blocks, additional files are generated:

```
.tova-out/
  app.shared.js
  app.server.js             # Default (unnamed) server
  app.server.api.js         # server "api" { }
  app.server.events.js      # server "events" { }
  app.client.js
  runtime/
    reactivity.js
    rpc.js
    router.js
```

If only some blocks exist, only their corresponding files are generated. A file with only `server {}` produces only `app.server.js` and `app.shared.js` (if a shared block exists).

## Server Output

The server file (`app.server.js`) is a standalone Bun script. It contains:

1. **Import of shared code** -- `import ... from './app.shared.js'`
2. **Standard library functions** -- inline runtime utilities
3. **Database setup** -- SQLite connection, model registration (if `db` and `model` declarations exist)
4. **Server functions** -- all functions defined in the server block
5. **RPC endpoints** -- `POST /rpc/<name>` for each server function
6. **Route handlers** -- explicit `route GET "/path" => handler` declarations
7. **Middleware** -- request logging, CORS, auth, etc.
8. **HTTP server startup** -- `Bun.serve()` with the configured port and request handler
9. **Client HTML serving** -- the root route (`/`) serves the client HTML page

### How the Server Starts

The generated server file ends with a `Bun.serve()` call:

```javascript
Bun.serve({
  port: process.env.PORT || 3000,
  async fetch(req) {
    // Match routes, RPC endpoints, static files
    // Falls back to serving client HTML at /
  }
});
```

Routes are matched in order of specificity: static paths first, then parameterized paths (`:id`), then wildcards (`*`). RPC endpoints (`/rpc/<name>`) are registered before explicit routes.

### Running the Server

```bash
# Direct execution
bun run .tova-out/app.server.js

# With custom port
PORT=8080 bun run .tova-out/app.server.js

# Or use the dev server (recommended for development)
tova dev
```

## Client Output

The client file (`app.client.js`) is a JavaScript module that gets embedded into an HTML page. It contains:

1. **Runtime imports** -- `createSignal`, `createEffect`, `createComputed`, `mount`, and other reactive primitives from `runtime/reactivity.js`
2. **RPC import** -- `rpc` function from `runtime/rpc.js`
3. **Shared code** -- inlined shared types and functions
4. **Standard library** -- inline stdlib utilities
5. **Server RPC proxy** -- `const server = new Proxy(...)` for transparent RPC
6. **Reactive state** -- `createSignal()` calls for each `state` declaration
7. **Computed values** -- `createComputed()` calls for each `computed` declaration
8. **Functions** -- client-side functions and event handlers
9. **Effects** -- `createEffect()` calls, auto-wrapped as `async` if they contain RPC calls
10. **Components** -- component functions using the `tova_el()` virtual DOM helper
11. **Mount call** -- `mount(App, document.getElementById("app"))` to start the application

### State Compilation

Tova reactive state compiles to SolidJS-style signal pairs:

```tova
state count = 0
state name = "World"
```

Becomes:

```javascript
const [count, setCount] = createSignal(0);
const [name, setName] = createSignal("World");
```

In generated code:
- **Reading** `count` becomes `count()` (calling the getter)
- **Writing** `count = 5` becomes `setCount(5)` (calling the setter)
- **Compound** `count += 1` becomes `setCount(count() + 1)`

### HTML Generation

The client JS is embedded into an HTML page. During development, `tova dev` generates an HTML file like:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tova App</title>
</head>
<body>
  <div id="app"></div>
  <script type="module">
    // Reactive runtime inlined here
    // RPC runtime inlined here
    // Client code inlined here
  </script>
</body>
</html>
```

The runtime is inlined directly into the HTML so there are no extra network requests during development. The server serves this HTML at the root route (`/`).

## Shared Output

The shared file (`app.shared.js`) contains plain JavaScript from the `shared {}` block. Both the server and client import from it:

```javascript
// app.shared.js
function User(id, name, email) {
  return { id, name, email };
}

function validate_email(email) {
  return email.includes("@");
}
```

If the shared block is empty or absent, no `app.shared.js` file is generated.

## Dev Server

`tova dev` provides a complete development experience:

```bash
tova dev [src_dir] [--port 3000]
```

The dev server performs the following steps:

### 1. Compile

All `.tova` files in the source directory are compiled. Output goes to `.tova-out/` inside the source directory.

### 2. Copy Runtime

Runtime files (`reactivity.js`, `rpc.js`, `router.js`) are copied from the Tova installation to `.tova-out/runtime/`.

### 3. Generate HTML

For each client block, the dev server generates an `index.html` file with the reactive runtime and client code inlined as a module script.

### 4. Start Server Processes

Each server block (default and named) is spawned as a separate Bun child process with its assigned port:

```
Starting server on port 3000
Starting server:api on port 3001
Starting server:events on port 3002
```

The default server serves the client HTML on `/` and handles all routes and RPC endpoints. Named servers handle their own routes.

### 5. Watch for Changes

The dev server watches for `.tova` file changes using a file watcher with debounce. When a file changes:

1. All server processes are killed
2. All `.tova` files are recompiled
3. New server processes are spawned
4. The page in the browser needs a manual refresh (no hot module replacement yet)

### Dev Server Output Example

```
  Tova dev server starting...

  Compiled 1 file(s)
  Output: .tova-out/
  Starting server on port 3000
  Client: .tova-out/index.html

  1 server process(es) running
    -> server: http://localhost:3000
```

## Production Build

`tova build --production` generates optimized output for deployment:

```bash
tova build --production
```

### What Production Build Does

1. **Compiles** all `.tova` files
2. **Bundles** all server code into a single file, all client code into a single file, all shared code into a single file
3. **Inlines** the reactive runtime and RPC runtime into the client bundle (eliminating import statements)
4. **Hashes** output filenames for cache busting: `server.<hash>.js`, `client.<hash>.js`
5. **Minifies** client JavaScript using Bun's built-in bundler (`Bun.build` with `minify: true`)
6. **Generates** production HTML referencing the hashed client bundle

### Production Output Structure

```
.tova-out/
  server.a1b2c3d4e5f6.js        # Bundled server (stdlib + shared + server code)
  client.f6e5d4c3b2a1.js        # Bundled client (runtime + shared + client code)
  client.f6e5d4c3b2a1.min.js    # Minified client
  index.html                     # Production HTML referencing hashed client JS
```

### Content Hashing

File hashes are generated using SHA-256 (first 12 hex characters). The hash changes whenever the file content changes, enabling long-lived cache headers:

```
Cache-Control: public, max-age=31536000, immutable
```

### Production HTML

The generated `index.html` is minimal:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tova App</title>
</head>
<body>
  <div id="app"></div>
  <script src="client.f6e5d4c3b2a1.js"></script>
</body>
</html>
```

### Running in Production

```bash
# Build
tova build --production

# Run the server
bun run .tova-out/server.<hash>.js
```

The production server is a standalone Bun script, same as development. It serves the client HTML and handles all routes and RPC endpoints.

## Source Maps

The build pipeline generates source maps for debugging. When the compiler emits code, it tracks source-to-output line mappings and writes `.map` files alongside the JavaScript output:

```
.tova-out/
  app.server.js
  app.server.js.map          # Source map for server
  app.client.js
  app.client.js.map          # Source map for client
```

Source maps use the standard VLQ-encoded format and reference the original `.tova` file(s). The JavaScript output includes a `//# sourceMappingURL=` comment pointing to the map file.

This means that when debugging in browser devtools or in a Bun error stack trace, line numbers point back to the original `.tova` source rather than the generated JavaScript.

### Source Map Structure

The Tova compiler uses a `SourceMapBuilder` class that tracks `(sourceLine, sourceCol) -> (outputLine, outputCol)` mappings during code generation. Each code generator method (`genExpression`, `genStatement`, etc.) records these mappings via a `_sourceMappings` array in the base codegen.

For merged multi-file output, the source map lists all contributing `.tova` files in its `sources` array and includes the content of each file in `sourcesContent`. This allows debuggers to map generated lines back to the correct original file.

## Multi-File Projects

### Same-Directory Merging

When multiple `.tova` files exist in the same directory, the compiler **merges** them before code generation. All same-type blocks are combined into a single output:

```
src/
  types.tova       # shared { type User { ... } }
  server.tova      # server { db, routes, functions }
  components.tova  # client { component Header, component UserList }
  app.tova         # client { state, effects, component App }
```

All `client {}` blocks from `components.tova` and `app.tova` merge into one client output. `App` can reference `Header` and `UserList` without imports. All `shared {}` blocks merge. All `server {}` blocks merge.

The compiler checks for duplicate declarations across files. If two files define the same component name, state variable, server function, route, or type, a clear error is reported showing both file locations.

### Output for Merged Projects

The output uses the directory name as the base filename:

```
.tova-out/
  src.shared.js      # merged shared blocks from all files in src/
  src.server.js      # merged server blocks
  src.client.js      # merged client blocks
  runtime/
    ...
```

### Cross-Directory Imports

Files in subdirectories are separate modules. They require explicit imports:

```tova
// src/app.tova
import { validate_email } from "./utils/validators.tova"
```

The `compileWithImports()` function resolves `.tova` imports across directories, compiles dependencies, and rewrites import paths to point to the generated `.js` files. Circular imports are detected and reported as errors.

### Output for Cross-Directory Projects

```
.tova-out/
  src.shared.js           # merged from src/*.tova
  src.server.js
  src.client.js
  validators.shared.js    # from src/utils/validators.tova (separate module)
  runtime/
    ...
```

## Build Pipeline Summary

```
  .tova source files (grouped by directory)
         |
         v
  +------------------+
  | Group by         |  Same-directory files are merged;
  | Directory        |  subdirectories compiled separately
  +------------------+
         |
         v  (per directory group)
  +-------------+
  | Lexer       |  Tokenize each file
  +-------------+
         |
         v
  +-------------+
  | Parser      |  Build AST per file
  +-------------+
         |
         v
  +------------------+
  | Merge ASTs       |  Combine same-type blocks, strip
  |                  |  same-directory imports, tag source files
  +------------------+
         |
         v
  +------------------+
  | Validate         |  Detect duplicate declarations
  | Merged AST       |  across files
  +------------------+
         |
         v
  +-------------+
  | Analyzer    |  Validate, warn on issues
  +-------------+
         |
         v
  +-------------------+     +-------------------+     +--------------------+
  | ServerCodegen     |     | ClientCodegen     |     | SharedCodegen      |
  | - RPC endpoints   |     | - Reactive state  |     | - Types            |
  | - Routes          |     | - Components      |     | - Validation       |
  | - DB setup        |     | - RPC proxy       |     | - Constants        |
  | - Bun.serve()     |     | - mount()         |     |                    |
  +-------------------+     +-------------------+     +--------------------+
         |                         |                         |
         v                         v                         v
  src.server.js             src.client.js             src.shared.js
                                  |
                                  v
                            index.html
                   (runtime + client inlined)
```

## Related Pages

- [Architecture Overview](./architecture) -- the three-block model
- [Server Block](./server-block) -- what goes in the server output
- [Client Block](./client-block) -- what goes in the client output
- [Shared Block](./shared-block) -- what goes in the shared output
- [Named Blocks](./named-blocks) -- multi-server compilation
- [RPC Bridge](./rpc) -- how RPC endpoints are generated
