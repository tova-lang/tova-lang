# Plan: Comprehensive Tova Language Documentation

## Context

Tova is a full-stack programming language that transpiles to JavaScript, featuring reactive UI primitives, seamless client-server RPC, pattern matching, and Python-inspired syntax. Currently there is no proper documentation — only example files and test suites. Engineers and academicians need a well-organized, authoritative reference to learn and use the language effectively.

## Documentation Structure

Create a `docs/` directory with the following files:

### 1. `docs/index.md` — Overview & Table of Contents
- What Tova is and its design philosophy
- Key differentiators (single-file full-stack, zero-config RPC, reactive primitives, Python-inspired syntax)
- Navigation to all other docs
- Quick "Hello World" teaser

### 2. `docs/getting-started.md` — Installation & First Steps
- Prerequisites (Bun runtime)
- Installing the CLI (`npm install -g tova-lang` or equivalent)
- `tova new my-app` walkthrough
- Project structure explanation
- `tova dev`, `tova build`, `tova run` quick usage
- First full-stack app tutorial (counter with server persistence)

### 3. `docs/language-reference.md` — Complete Syntax Reference
- **Lexical Elements**: comments (`//`, `///`, `/* */`), identifiers, keywords (full list), number literals (int, float, hex, binary, octal, underscore separators), string literals (double-quoted with `{expr}` interpolation, single-quoted simple strings), booleans, `nil`
- **Operators**: arithmetic (`+`,`-`,`*`,`/`,`%`,`**`), comparison (`==`,`!=`,`<`,`<=`,`>`,`>=`), chained comparisons, logical (`and`/`&&`, `or`/`||`, `not`/`!`), assignment (`=`,`+=`,`-=`,`*=`,`/=`), range (`..`, `..=`), pipe (`|>`), spread (`...`), optional chain (`?.`), null coalesce (`??`), member access (`.`), subscript (`[]`), slice (`[start:end:step]`)
- **Operator Precedence Table** (13 levels)
- **Variables**: immutable by default (`x = 5`), mutable (`var x = 5`), multiple assignment (`a, b = 1, 2`), destructuring (`let {x, y} = obj`, `let [a, b] = arr`)
- **Functions**: `fn name(params) { body }`, default params, type annotations, implicit return, lambdas (`fn(x) x * 2`, `x => x * 2`), named arguments at call site
- **Control Flow**: `if`/`elif`/`else`, `for item in collection { }`, `for i, item in ...`, for-else, `while`, `match` with patterns, `try`/`catch`, `return`
- **Pattern Matching**: literal, range (`1..10`, `1..=10`), wildcard (`_`), binding (`n`), variant (`Circle(r)`), array (`[a, b]`), guards (`n if n > 0`)
- **Type System**: type declarations (struct-like fields, algebraic variants), generics (`type Result<T, E>`), type annotations (`: Type`, `-> ReturnType`), built-in types (`Int`, `Float`, `String`, `Bool`, `[Type]`, `(Params) -> Return`)
- **Collections**: array literals, object literals (shorthand `{x, y}`), list comprehensions (`[x * 2 for x in items if x > 0]`), dict comprehensions
- **Modules**: `import { a, b } from "module"`, `import Default from "module"`, `as` aliasing, `export`
- **String Features**: interpolation `"Hello {name}"`, escape sequences, string multiply (`"-" * 40`), string methods (`.upper()`, `.lower()`, `.contains()`, `.starts_with()`, `.ends_with()`, `.chars()`, `.words()`, `.lines()`, `.capitalize()`, `.title_case()`, `.snake_case()`, `.camel_case()`)

### 4. `docs/full-stack-architecture.md` — The Three-Block Model
- **Concept**: `shared {}`, `server {}`, `client {}` in one `.tova` file
- **Shared Block**: types, validation functions, constants available to both sides
- **Server Block**: HTTP handlers, database, middleware, auth
- **Client Block**: reactive state, components, UI
- **RPC Bridge**: how `server.functionName()` works transparently from client
- **Named Blocks**: `server "api" {}`, `server "events" {}` — multi-process architecture
- **Compilation Output**: what files get generated and how they connect
- **Port Assignment**: default ports, `PORT_<NAME>` env vars

### 5. `docs/reactivity.md` — Reactive UI System
- **Signals**: `state count = 0` → `createSignal`, getter/setter semantics, functional updates
- **Computed Values**: `computed doubled = count * 2` → lazy, glitch-free, memoized
- **Effects**: `effect { ... }` → auto-dependency tracking, cleanup, async support
- **Batching**: `batch(() => { ... })` → defer effect execution
- **Components**: `component Name(props) { JSX }`, props as reactive getters, local state
- **Stores**: `store Name { state ..., computed ..., fn ... }` → encapsulated reactive state
- **JSX Syntax**: elements, attributes, event handlers (`on:click`), two-way binding (`bind:value`, `bind:checked`, `bind:group`), conditional classes (`class:active={cond}`), style binding (`style:color={val}`)
- **JSX Control Flow**: `if`/`elif`/`else` in JSX, `for item in items key={item.id} { }` in JSX
- **CSS Scoping**: `style { }` block inside components, hash-based scope IDs
- **Lifecycle Hooks**: `onMount`, `onUnmount`, `onCleanup`
- **Advanced**: `createRef`, `createContext`/`provide`/`inject`, `createErrorBoundary`, `watch`, `untrack`, `Dynamic`, `Portal`, `lazy`
- **Rendering**: `mount(App, el)`, `hydrate(App, el)`, keyed reconciliation

### 6. `docs/server-reference.md` — Server Features
- **Routes**: `route METHOD "/path" => handler`, `get "/path" fn(req) {}` shorthand, path params (`:id`), query params, body extraction
- **Route Groups**: `routes "/prefix" { ... }`
- **Middleware**: `middleware fn name(req, next) { }`, per-route (`with auth`), global
- **Type-Safe Params**: auto-validation from type annotations (`id: Int`)
- **Response Helpers**: `respond(status, body)`, `redirect(url)`, `html()`, `text()`, `set_cookie()`, `with_headers()`, `stream()`
- **Database**: `db { driver, path/url }`, `db.query()`, `db.run()`, `db.get()`, `db.exec()`, `db.transaction()`, `db.migrate()` — SQLite/PostgreSQL/MySQL
- **ORM/Models**: `model User` → auto-CRUD from shared types (`.find()`, `.all()`, `.where()`, `.create()`, `.update()`, `.delete()`, `.count()`)
- **Migrations**: `tova migrate:create`, `tova migrate:up`, `tova migrate:status`
- **Authentication**: `auth { type: "jwt", ... }`, `sign_jwt()`, `hash_password()`, `verify_password()`, route guards
- **CORS**: `cors { origins, methods, headers, credentials }`
- **Rate Limiting**: `rate_limit { max_requests, window }`
- **SSE**: `sse "/path" fn(send, close) { }`
- **WebSocket**: `ws { on_open, on_message, on_close, on_error }`
- **Environment Variables**: `env KEY: Type = default`
- **Background Jobs**: `background fn name() { }`
- **Scheduled Tasks**: `schedule "cron" fn() { }`
- **Lifecycle Hooks**: `on_start`, `on_stop`
- **Health Checks**: `health "/path"`
- **OpenAPI**: auto `/openapi.json` + `/docs`
- **Content Negotiation**: `negotiate(req, data, handlers)`
- **Race Protection**: `__Mutex`, `withLock(fn)`
- **Error Handling**: `on_error fn(err, req) { }`
- **Static Files**: `static "/public" => "./public"`
- **Session, Upload, TLS, Compression, Caching** configs
- **Service Discovery**: `discover "name" at "url"` with circuit breaker
- **Distributed Tracing**: request IDs, `AsyncLocalStorage` context

### 7. `docs/stdlib.md` — Standard Library Reference
- **I/O**: `print(...args)`
- **Collections**: `len(x)`, `range(n)`, `enumerate(arr)`, `zip(...arrs)`, `map(arr, fn)`, `filter(arr, fn)`, `reduce(arr, fn, init)`, `sum(arr)`, `sorted(arr, key?)`, `reversed(arr)`, `min(arr)`, `max(arr)`
- **Type Introspection**: `type_of(x)`
- **Network**: `fetch(url)`
- **String Methods**: full list with examples
- **Array Slice Syntax**: `arr[start:end:step]`

### 8. `docs/cli-reference.md` — Command-Line Interface
- `tova new <name>` — scaffold project
- `tova dev [dir]` — development server with hot reload
- `tova build [dir]` — compile to JavaScript
- `tova run <file>` — compile and execute
- `tova migrate:create <name>` — create migration
- `tova migrate:up [file]` — run migrations
- `tova migrate:status [file]` — show migration status
- Global flags: `--help`, `--version`, `--debug`, `--port`, `--output`

### 9. `docs/examples.md` — Annotated Examples
- Hello World (minimal)
- Variables & Functions
- Pattern Matching
- List Comprehensions & Pipes
- Counter App (client-only)
- Todo App (full-stack)
- Multi-Server Architecture
- Database & Models
- Authentication Flow
- Real-time with SSE/WebSocket

### 10. `docs/grammar.md` — Formal EBNF Grammar (Appendix)
- Complete EBNF specification derived from `parser.js` and `tokens.js`
- Organized by: lexical grammar (tokens, literals, keywords) → expressions → statements → declarations → top-level program
- Each production rule with brief prose explanation
- Covers: all expression precedence levels, statement forms, pattern syntax, type annotations, JSX grammar, block declarations

### 11. Comparison Tables (embedded in relevant sections)
- Side-by-side syntax comparisons in `language-reference.md`, `reactivity.md`, and `server-reference.md`
- Languages: Python, JavaScript, Rust (where relevant)
- Examples: variable declaration, functions, pattern matching, loops, comprehensions, type definitions, reactivity (vs React/Solid/Svelte), server routes (vs Express/Hono)

## Important Syntax Clarifications (from latest source)
- `throw` is NOT a keyword — Tova has no throw statement
- For loop with two vars: `for key, val in pairs {}` (comma-separated identifiers, NOT array destructuring)
- `Type.new(args)` transpiles to `new Type(args)` for constructing JS built-ins (e.g., `Response.new(...)`)
- JSX text template literals with signals must be reactive: `"{count}"` → `() => \`${count()}\``

## Files to Create

| # | File | Description |
|---|------|-------------|
| 1 | `docs/index.md` | Overview, philosophy, navigation |
| 2 | `docs/getting-started.md` | Installation, first project, tutorial |
| 3 | `docs/language-reference.md` | Complete syntax & semantics reference + comparison tables |
| 4 | `docs/full-stack-architecture.md` | Three-block model, RPC, named blocks |
| 5 | `docs/reactivity.md` | Signals, effects, components, JSX, stores + comparison tables |
| 6 | `docs/server-reference.md` | Routes, DB, auth, middleware, SSE, WS + comparison tables |
| 7 | `docs/stdlib.md` | Standard library functions & methods |
| 8 | `docs/cli-reference.md` | CLI commands and options |
| 9 | `docs/examples.md` | Annotated real-world examples |
| 10 | `docs/grammar.md` | Formal EBNF grammar appendix |

## Key Source Files to Reference

- Lexer/Tokens: `src/lexer/lexer.js`, `src/lexer/tokens.js`
- Parser/AST: `src/parser/parser.js`, `src/parser/ast.js`
- Analyzer: `src/analyzer/analyzer.js`
- Codegen: `src/codegen/base-codegen.js`, `src/codegen/client-codegen.js`, `src/codegen/server-codegen.js`, `src/codegen/codegen.js`
- Runtime: `src/runtime/reactivity.js`, `src/runtime/router.js`, `src/runtime/ssr.js`
- CLI: `bin/tova.js`
- Examples: `examples/*.tova`

## Verification

1. Review each doc file for accuracy against source code
2. Verify all code examples compile with `tova run` or `tova build`
3. Cross-reference with test suite (1652 tests) to ensure no features are missed
4. Check that all keywords from `tokens.js` are documented
5. Ensure all AST node types from `ast.js` are covered in the language reference
