# Tova Improvement Task List

> Tracking all improvements to make Tova a great language.
> Primary inspiration: **Python** (with Rust-quality error handling and type safety).
> JSX is kept for components. `and`/`or`/`not` are canonical. `elif` is canonical. `var` is canonical for mutability.

**Legend**: `[ ]` pending | `[x]` done | `[-]` won't do

---

## T0 — Language Identity & Consistency

Resolve all syntax dualities. Tova should feel like one language, not six.


- [ ] **T0-2**: Remove `mut` keyword — `var` is the only mutable binding keyword
  - Remove `MUT` token from lexer or make it a hard error with suggestion
  - Error message: "Use `var` for mutable variables"
  - Files: `src/lexer/tokens.js`, `src/parser/parser.js`

- [ ] **T0-3**: Make `let` exclusively for destructuring — add clear error when misused
  - `let x = 5` should error: "Use `x = 5` for binding or `var x = 5` for mutable. `let` is only for destructuring: `let {a, b} = obj`"
  - Files: `src/parser/parser.js`, `src/analyzer/analyzer.js`



- [ ] **T0-6**: Standardize `fn` keyword for all function forms
  - `fn name() {}` for declarations
  - `fn(x) x + 1` for anonymous functions
  - `x => x + 1` for arrow lambdas (keep — Python has `lambda`, this is better)
  - Document that `fn` and `=>` are the two forms, nothing else
  - Files: `docs/`

- [ ] **T0-7**: Establish naming convention: `snake_case` for everything except types
  - Functions, variables, parameters: `snake_case`
  - Types, components, stores: `PascalCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Enforce in analyzer as warnings
  - Files: `src/analyzer/analyzer.js`

---

## T1 — Type System Foundations

The type system is the biggest gap between Tova's ambitions and reality.

- [ ] **T1-1**: Implement real generics with type parameter tracking
  - `type Result<T, E> { Ok(value: T), Err(error: E) }` should track T and E through the analyzer
  - Generic function declarations: `fn map<T, U>(arr: [T], f: fn(T) -> U) -> [U]`
  - Type parameter inference at call sites
  - Files: `src/analyzer/analyzer.js`, `src/analyzer/types.js`

- [ ] **T1-2**: Implement type narrowing after nil checks
  - `if x != nil { x.name }` — `x` is narrowed from `T | Nil` to `T` inside the block
  - `guard x != nil else { return }` — narrows in the rest of the function
  - `match` arms narrow based on pattern
  - Files: `src/analyzer/analyzer.js`, `src/analyzer/scope.js`

- [ ] **T1-3**: Implement union types
  - Syntax: `type StringOrInt = String | Int`
  - Type narrowing works with `type_of()` checks
  - Pattern matching on union types
  - Files: `src/parser/parser.js`, `src/analyzer/analyzer.js`, `src/analyzer/types.js`

- [ ] **T1-4**: Fix Float -> Int silent assignment
  - Make `Float -> Int` a warning in normal mode, error in `--strict`
  - Require explicit `to_int(value)` for narrowing
  - Keep `Int -> Float` widening as implicit (safe)
  - Files: `src/analyzer/types.js`, `src/analyzer/analyzer.js`

- [ ] **T1-5**: Implement generic type aliases
  - `type Callback<T> = fn(T) -> Result<T, String>`
  - `type UserList = [User]`
  - Files: `src/parser/parser.js`, `src/analyzer/analyzer.js`

- [ ] **T1-6**: Tighten `UnknownType` assignability
  - Currently `UnknownType.isAssignableTo()` returns `true` for everything
  - In `--strict` mode: unknown types should not be assignable to concrete types
  - Normal mode: keep current behavior (gradual typing)
  - Files: `src/analyzer/types.js`

- [ ] **T1-7**: Add type inference for collection operations
  - `[1, 2, 3] |> map(fn(x) x * 2)` should infer `[Int]`
  - `users |> filter(fn(u) u.active)` should preserve `[User]`
  - Files: `src/analyzer/analyzer.js`

---

## T2 — Standard Library Architecture

Move from flat global namespace to discoverable, namespaced modules.

- [ ] **T2-1**: Design namespace module system
  - `math.sin()`, `math.floor()`, `math.PI`
  - `str.upper()`, `str.trim()`, `str.split()`
  - `arr.sorted()`, `arr.unique()`, `arr.flatten()`
  - `fs.read_text()`, `fs.write_text()`, `fs.exists()`
  - `json.parse()`, `json.stringify()`
  - `re.test()`, `re.match()`, `re.find_all()`
  - `dt.now()`, `dt.parse()`, `dt.format()`
  - `url.parse()`, `url.build()`
  - Flat imports still work as convenience: `from std import sin, cos`
  - Files: Design doc first, then `src/stdlib/`, `src/analyzer/analyzer.js`, `src/codegen/base-codegen.js`

- [ ] **T2-2**: Resolve name collisions in global builtins
  - Audit: `filter`, `map`, `find`, `replace`, `keys`, `values`, `contains`, `type`
  - These are extremely common variable names users will want
  - Strategy: keep as builtins but don't shadow user variables (user wins)
  - Analyzer should not warn when user defines `filter` etc.
  - Files: `src/analyzer/analyzer.js`

- [ ] **T2-3**: Move stdlib from inline strings to real JS files
  - Currently: `BUILTIN_FUNCTIONS.sin = "function sin(n) { return Math.sin(n); }"`
  - Target: actual `.js` files that get bundled during compilation
  - Enables: proper testing of stdlib functions, IDE support, easier maintenance
  - Files: `src/stdlib/inline.js` -> `src/stdlib/modules/`

- [ ] **T2-4**: Add method syntax for common operations
  - `[1, 2, 3].map(fn(x) x * 2)` should work alongside `map([1, 2, 3], fn(x) x * 2)`
  - `"hello".upper()` should work alongside `upper("hello")`
  - Python-style: both function and method forms
  - Files: `src/codegen/base-codegen.js`, `src/analyzer/analyzer.js`

- [ ] **T2-5**: Add `collections` module for advanced data structures
  - `OrderedDict`, `DefaultDict`, `Counter`, `Deque`
  - Python-inspired but with immutable-first API
  - Files: `src/stdlib/modules/collections.js`

---

## T3 — Syntax & Missing Features

Features real-world users will hit immediately.

- [ ] **T3-1**: Add multiline strings (triple-quote)
  - `"""multiline string"""` (Python-style)
  - Preserves whitespace, supports interpolation
  - Auto-dedent based on closing `"""`
  - Files: `src/lexer/lexer.js`, `src/parser/parser.js`

- [ ] **T3-2**: Add escape for `{` in string interpolation
  - `"price: \{not interpolated\}"` or `"price: {{not interpolated}}"`
  - Decide: `\{` (backslash escape) is more consistent with other escapes
  - Files: `src/lexer/lexer.js`

- [ ] **T3-3**: Add destructured function parameters
  - `fn handler({name, age}: User) { ... }`
  - `fn first([head, ...tail]) { head }`
  - Files: `src/parser/parser.js`, `src/codegen/base-codegen.js`

- [ ] **T3-4**: Add simple enums (fieldless ADT variants)
  - `type Color = Red | Green | Blue` (no fields, just tags)
  - Should be as ergonomic as Python's `Enum`
  - Codegen: `const Red = Object.freeze({ __tag: "Red" })`
  - Files: `src/parser/parser.js`, `src/codegen/base-codegen.js`

- [ ] **T3-5**: Add implicit `it` parameter for single-arg lambdas
  - `users |> filter(it.active) |> map(it.name)`
  - `numbers |> filter(it > 0)`
  - Kotlin-inspired, massive DX win for pipes
  - Files: `src/parser/parser.js`, `src/codegen/base-codegen.js`

- [ ] **T3-6**: Add tuple first-class support
  - Tuple literal: `(1, "hello", true)`
  - Tuple access: `t.0`, `t.1`, `t.2`
  - Tuple destructuring: `let (a, b) = get_pair()`
  - Tuple type: `(Int, String, Bool)`
  - Files: `src/parser/parser.js`, `src/codegen/base-codegen.js`, `src/analyzer/types.js`

- [ ] **T3-7**: Add `with` statement for resource management
  - Python-inspired context manager pattern:
    ```
    with open("file.txt") as f {
      data = f.read()
    }
    ```
  - Compiles to try/finally with cleanup
  - Aligns with Python primary inspiration
  - Files: `src/lexer/tokens.js`, `src/parser/parser.js`, `src/codegen/base-codegen.js`

- [ ] **T3-8**: Add f-string style interpolation sigil (optional)
  - `f"Hello, {name}!"` — explicit interpolation marker
  - Plain `"Hello"` — never interpolated
  - `"Hello, {name}"` — still works (current behavior, kept for compatibility)
  - Files: `src/lexer/lexer.js`

- [ ] **T3-9**: Add `is` keyword for type checking
  - `if value is String { ... }` — type check + narrowing
  - `if value is not Nil { ... }` — negated check + narrowing
  - Python-inspired syntax, enables clean type narrowing
  - Files: `src/lexer/tokens.js`, `src/parser/parser.js`, `src/analyzer/analyzer.js`

---

## T4 — Error Messages & Diagnostics

Elm/Rust-quality error messages differentiate a language.

- [ ] **T4-1**: Add source code context to all error messages
  - Every error shows the offending line with a caret pointing to the exact column
  - Show 1-2 lines of context above and below
  - Example:
    ```
    error: Type mismatch in function call
      --> app.tova:12:5
       |
    12 |   add("hello", 5)
       |       ^^^^^^^ expected Int, got String
       |
    hint: try to_int("hello") to convert
    ```
  - Files: `src/diagnostics/formatter.js`

- [ ] **T4-2**: Add fix suggestions with diffs to every error
  - For every error, compute a concrete fix when possible
  - "Did you mean `sorted` instead of `sort`?"
  - "Add `var` to make this mutable: `var count = 0`"
  - "Missing return type, inferred as `-> Int`"
  - Files: `src/analyzer/analyzer.js`, `src/diagnostics/formatter.js`

- [ ] **T4-3**: Improve parser error recovery
  - On syntax error, skip to next statement boundary and continue
  - Report all errors in a file, not just the first
  - Currently partially implemented — make it robust
  - Files: `src/parser/parser.js`

- [ ] **T4-4**: Add error codes for all diagnostics
  - `E001: Undefined variable`, `E002: Type mismatch`, `W001: Unused variable`
  - Enables: `// tova-ignore E001` comments to suppress specific errors
  - Documentation page listing all error codes with examples
  - Files: `src/analyzer/analyzer.js`, `src/diagnostics/`

- [ ] **T4-5**: LSP quick-fix for every analyzer error
  - Every error/warning should have a corresponding code action
  - "Add `_` prefix to unused variable"
  - "Convert to `var` for mutable binding"
  - "Wrap in `Ok()` for Result return"
  - "Add type annotation"
  - Files: `src/lsp/server.js`

---

## T5 — Code Generation Quality

Move from string concatenation to robust codegen.

- [ ] **T5-1**: Use array-join pattern instead of string concatenation
  - Replace `result += "const " + name + ...` with `parts.push(...)` + `parts.join('\n')`
  - Measurable perf improvement for large files
  - Files: `src/codegen/base-codegen.js`, `src/codegen/server-codegen.js`, `src/codegen/client-codegen.js`

- [ ] **T5-2**: Implement proper source map generation
  - Use standard source map format (v3)
  - Map every generated line back to Tova source
  - Enable browser/Node debugger to step through `.tova` files
  - Files: `src/codegen/base-codegen.js`

- [ ] **T5-3**: Implement incremental compilation
  - Cache ASTs per-file based on content hash
  - Only re-lex/parse/analyze changed files
  - Reuse unchanged codegen output
  - Critical for `tova dev` performance as projects grow
  - Files: `bin/tova.js`, `src/codegen/codegen.js`

- [ ] **T5-4**: Pre-compute stdlib dependency graph
  - Some builtins depend on others (e.g., `describe` uses `Table`)
  - Build dependency graph at build time, not runtime scanning
  - Files: `src/stdlib/inline.js`, `src/codegen/base-codegen.js`

- [ ] **T5-5**: Minify generated code in production builds
  - Strip comments, shorten variable names, collapse whitespace
  - Only in `--production` mode
  - Use Bun's built-in minifier or simple custom pass
  - Files: `bin/tova.js`

---

## T6 — Module System & Project Structure

Enable libraries and larger projects.

- [ ] **T6-1**: Allow plain `.tova` module files without blocks
  - A file with no `server`/`client`/`shared` blocks is a regular module
  - Compiles to a standard ES module
  - Can be imported by other `.tova` files
  - Enables: libraries, shared utilities, code organization
  - Files: `src/codegen/codegen.js`, `bin/tova.js`

- [ ] **T6-2**: Implement cross-file imports for `.tova` files
  - `import { helper } from "./utils.tova"`
  - Resolver strips `.tova` extension, maps to compiled `.js`
  - Circular import detection already exists — extend it
  - Files: `src/codegen/codegen.js`, `bin/tova.js`

- [ ] **T6-3**: Add `pub` export semantics for modules
  - `pub fn helper()` — exported from module
  - `fn internal()` — private to module
  - `pub type User { ... }` — exported type
  - Files: `src/parser/parser.js`, `src/codegen/base-codegen.js`

- [ ] **T6-4**: Implement import support in REPL
  - `import { helper } from "./utils.tova"` works in REPL
  - Compile imported file on-demand
  - Files: `bin/tova.js`

- [ ] **T6-5**: Add `tova init` as alias for `tova new`
  - `tova init` in existing directory (like `npm init`)
  - `tova new <name>` creates new directory (current behavior)
  - Files: `bin/tova.js`

---

## T7 — JSX & Component System

Keep JSX but make it more robust and Tova-native.

- [ ] **T7-1**: Simplify JSX lexer state machine
  - Currently 7 state flags for JSX context tracking
  - Refactor into a dedicated JSX sublexer that activates inside component bodies
  - Reduce bug surface area
  - Files: `src/lexer/lexer.js`

- [ ] **T7-2**: Add JSX fragment support
  - `<> ... </>` for grouping without wrapper element
  - Files: `src/lexer/lexer.js`, `src/parser/parser.js`, `src/codegen/client-codegen.js`

- [ ] **T7-3**: Add `show` directive for conditional rendering
  - `<div show={isVisible}>` — toggles display:none instead of removing from DOM
  - Lighter than `if` for frequent toggling
  - Files: `src/parser/parser.js`, `src/codegen/client-codegen.js`

- [ ] **T7-4**: Add `transition` directive for animations
  - `<div transition:fade>` — CSS transition on mount/unmount
  - `<div transition:slide={duration: 300}>` — configurable
  - Svelte-inspired, works naturally with JSX
  - Files: `src/parser/parser.js`, `src/codegen/client-codegen.js`, `src/runtime/`

- [ ] **T7-5**: Improve component error boundaries
  - `<ErrorBoundary fallback={<p>"Error"</p>}>` wrapper component
  - Catches render errors in child tree
  - Files: `src/runtime/`, `src/codegen/client-codegen.js`

---

## T8 — Testing & Quality

Make the testing story production-grade.

- [ ] **T8-1**: Allow separate test files
  - `tests/utils.test.tova` can import from `src/utils.tova`
  - `tova test` discovers `*.test.tova` and `*_test.tova` files
  - Files: `bin/tova.js`

- [ ] **T8-2**: Add `before_each`/`after_each` lifecycle hooks
  - ```
    test "suite" {
      before_each { setup() }
      after_each { teardown() }
      fn test_a() { ... }
    }
    ```
  - Files: `src/parser/parser.js`, `src/codegen/server-codegen.js`

- [ ] **T8-3**: Add test timeout support
  - `test "slow test" timeout=5000 { ... }`
  - Default timeout: 10 seconds
  - Files: `src/codegen/server-codegen.js`

- [ ] **T8-4**: Add `--coverage` flag
  - Instruments generated JS with coverage tracking
  - Reports line/branch/function coverage
  - Output: terminal summary + `coverage/` directory with HTML report
  - Files: `bin/tova.js`

- [ ] **T8-5**: Add parallel test execution
  - Tests in different files run in parallel by default
  - Tests within a file run sequentially
  - `--serial` flag to force sequential
  - Files: `bin/tova.js`

- [ ] **T8-6**: Add `assert_throws` for error testing
  - `assert_throws(fn() divide(1, 0), "Division by zero")`
  - Files: `src/stdlib/inline.js`

- [ ] **T8-7**: Add mock/spy utilities
  - `spy = create_spy()` — tracks calls
  - `mock = create_mock(fn_name, return_value)` — replaces function
  - `spy.called`, `spy.call_count`, `spy.calls`
  - Files: `src/stdlib/inline.js`

---

## T9 — Server & Full-Stack

Improve the server-side story.

- [ ] **T9-1**: Add request validation with types
  - `route POST "/api/users" body: User => create_user`
  - Automatic 400 error if body doesn't match `User` type
  - Files: `src/codegen/server-codegen.js`

- [ ] **T9-2**: Add response type annotations for routes
  - `route GET "/api/users" -> [User] => get_users`
  - Enables: auto-generated OpenAPI/Swagger docs
  - Files: `src/parser/parser.js`, `src/codegen/server-codegen.js`

- [ ] **T9-3**: Add streaming response support
  - `route GET "/api/stream" => fn(req) { yield "chunk1"; yield "chunk2" }`
  - Generator-based streaming
  - Files: `src/codegen/server-codegen.js`

- [ ] **T9-4**: Add database migration improvements
  - `tova migrate:down` — rollback last migration
  - `tova migrate:reset` — rollback all migrations
  - `tova migrate:fresh` — drop all + re-run
  - Files: `bin/tova.js`

- [ ] **T9-5**: Add API versioning support
  - `route group "/api/v2" { ... }` with version negotiation
  - Files: `src/parser/parser.js`, `src/codegen/server-codegen.js`

---

## T10 — Developer Experience & Tooling

Polish that makes developers love the language.

- [ ] **T10-1**: Add `tova upgrade` command
  - Self-update the Tova compiler to latest version
  - Files: `bin/tova.js`

- [ ] **T10-2**: Add `tova info` command
  - Shows: Tova version, Bun version, project config, installed deps
  - Files: `bin/tova.js`

- [ ] **T10-3**: Improve REPL with syntax highlighting
  - Color keywords, strings, numbers in REPL input
  - Show type of last expression automatically
  - Tab completion for builtins and variables
  - Files: `bin/tova.js`

- [ ] **T10-4**: Add `--explain` flag for errors
  - `tova check --explain E002` shows full documentation for error E002
  - With examples of what causes it and how to fix it
  - Files: `bin/tova.js`

- [ ] **T10-5**: Add playground improvements
  - Share button (generates URL with code)
  - Show generated JS side-by-side
  - Example gallery
  - Files: `docs/`

- [ ] **T10-6**: Add LSP rename symbol support (scope-aware)
  - Rename a variable/function across all usages in scope
  - Respect shadowing — only rename the correct binding
  - Files: `src/lsp/server.js`

- [ ] **T10-7**: Add LSP inlay hints
  - Show inferred types inline: `x = 42` shows `: Int` after `x`
  - Show parameter names at call sites: `add(/*a:*/ 1, /*b:*/ 2)`
  - Files: `src/lsp/server.js`

---

## T11 — Performance

Compiler and runtime performance.

- [ ] **T11-1**: Skip insignificant tokens during parsing instead of pre-filtering
  - Currently: `this.tokens = tokens.filter(t => t.type !== NEWLINE && ...)`
  - Better: skip in `advance()` / `current()` methods
  - Avoids creating a new array for every parse
  - Files: `src/parser/parser.js`

- [ ] **T11-2**: Add build caching with content hashing
  - Hash source file content, skip compilation if unchanged
  - Store in `.tova-out/.cache/`
  - Files: `bin/tova.js`

- [ ] **T11-3**: Lazy-load codegen modules
  - Don't import `ServerCodegen` if no server blocks exist
  - Don't import `ClientCodegen` if no client blocks exist
  - Files: `src/codegen/codegen.js`

- [ ] **T11-4**: Profile and optimize hot paths
  - Lexer: batch whitespace skipping
  - Parser: reduce lookahead in common cases
  - Codegen: pre-allocate string builders
  - Files: all compiler files

---

## T12 — Documentation & Community

- [ ] **T12-1**: Write "Tova for Python developers" guide
  - Side-by-side comparison of Python and Tova syntax
  - Highlight what's similar and what's different
  - Files: `docs/guide/`

- [ ] **T12-2**: Write "Tova for JavaScript developers" guide
  - Focus on what Tova adds over plain JS/TS
  - Explain the `server`/`client`/`shared` model
  - Files: `docs/guide/`

- [ ] **T12-3**: Create interactive tutorial
  - Step-by-step in-browser tutorial
  - Each step builds on the previous
  - Covers: variables, functions, types, match, server, client
  - Files: `docs/`

- [ ] **T12-4**: Add cookbook / recipes section
  - "How to build a REST API"
  - "How to build a real-time chat"
  - "How to handle file uploads"
  - "How to add authentication"
  - Files: `docs/examples/`

- [ ] **T12-5**: Create a language specification document
  - Formal grammar (EBNF)
  - Type system rules
  - Evaluation semantics
  - Serves as reference implementation guide
  - Files: `docs/reference/spec.md`

---

## Implementation Order (Recommended)

### Phase 1 — Foundation (do first)
1. T0-1 through T0-7 (identity cleanup)
2. T3-1 (multiline strings)
3. T3-2 (escape `{` in interpolation)
4. T4-1 (source context in errors)
5. T6-1 (plain module files)

### Phase 2 — Type System
6. T1-1 (real generics)
7. T1-2 (type narrowing)
8. T1-3 (union types)
9. T1-4 (Float->Int fix)
10. T3-9 (`is` keyword for type checks)

### Phase 3 — Developer Experience
11. T3-5 (implicit `it` parameter)
12. T3-3 (destructured function params)
13. T3-4 (simple enums)
14. T3-6 (tuple support)
15. T4-2 through T4-5 (error messages)

### Phase 4 — Stdlib & Modules
16. T2-1 (namespace modules)
17. T2-2 (name collision fixes)
18. T2-3 (stdlib from real files)
19. T2-4 (method syntax)
20. T6-2 through T6-4 (cross-file imports)

### Phase 5 — Polish
21. T5-1 through T5-5 (codegen quality)
22. T7-1 through T7-5 (JSX improvements)
23. T8-1 through T8-7 (testing)
24. T9-1 through T9-5 (server)
25. T10-1 through T10-7 (tooling)
26. T11-1 through T11-4 (performance)
27. T12-1 through T12-5 (documentation)

---

## Stats

| Tier | Tasks | Description |
|------|-------|-------------|
| T0   | 7     | Language Identity |
| T1   | 7     | Type System |
| T2   | 5     | Standard Library |
| T3   | 9     | Syntax & Features |
| T4   | 5     | Error Messages |
| T5   | 5     | Code Generation |
| T6   | 5     | Module System |
| T7   | 5     | JSX & Components |
| T8   | 7     | Testing |
| T9   | 5     | Server & Full-Stack |
| T10  | 7     | Developer Experience |
| T11  | 4     | Performance |
| T12  | 5     | Documentation |
| **Total** | **76** | |
