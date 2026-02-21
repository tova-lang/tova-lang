# Tova Language Improvement Roadmap

> Comprehensive task list based on senior language design review.
> Mark items with `[x]` as they are completed.

---

## P0 — Language Credibility (Do First)

These are the changes that shift perception from "impressive indie project" to "language I'd actually use."

### Syntax Ergonomics

- [x] **Lightweight lambda syntax** — Add `x -> x + 1` shorthand alongside `fn(x) x + 1`
  - Single param: `x -> x + 1` (no parens)
  - Multi param: `(x, y) -> x + y`
  - Zero param: `() -> "hello"`
  - Keep `fn(x) { body }` for multi-statement lambdas
  - Files: `src/parser/parser.js`

- [ ] **Implicit `it` parameter (Kotlin-style)** — Allow `users |> filter(it.age > 18)` for single-param lambdas
  - Desugar `it` references into `fn(it) expr` at parse or codegen level
  - Files: `src/parser/parser.js`, `src/codegen/base-codegen.js`

- [x] **Support `else if` alongside `elif`** — Accept both forms, zero cost, big ergonomic win
  - Files: `src/parser/parser.js`

- [x] **`mut` keyword alongside `var`** — `mut count = 0` reads better and avoids JS `var` baggage
  - `mut` added as keyword, `var` kept as alias for backwards compat
  - Files: `src/lexer/tokens.js`, `src/parser/parser.js`, `src/analyzer/analyzer.js`

### Type System

- [ ] **Generics** — The #1 missing feature for type system credibility
  - Generic functions: `fn identity<T>(x: T) -> T { x }`
  - Generic types: `type Stack<T> { items: [T] }`
  - Bounded generics: `fn print<T: Show>(x: T)`
  - Type inference for generic params
  - Files: `src/parser/parser.js`, `src/analyzer/analyzer.js`, `src/codegen/base-codegen.js`

### Error Messages

- [x] **"Did you mean?" suggestions** — Levenshtein distance matching for undefined identifiers
  - Matches against scope chain, builtins, JS globals, and runtime names
  - Shows hint: `did you mean 'filter'?`
  - Files: `src/analyzer/analyzer.js`, `src/lsp/server.js`

- [x] **Show expected vs actual types in mismatches**
  - Hints like `try toString(value)`, `try toInt(value)`, `try Ok(value)` at all mismatch sites
  - Files: `src/analyzer/analyzer.js`, `src/lsp/server.js`

---

## P1 — Developer Delight (Do Next)

These make developers fall in love with the language.

### Type System Enhancements

- [ ] **Union types** — `type StringOrNumber = String | Int`
  - Support in type annotations, function params, match exhaustiveness
  - Files: `src/parser/parser.js`, `src/analyzer/analyzer.js`

- [ ] **Type narrowing in conditionals** — After `if typeOf(x) == "String"`, narrow `x` to `String`
  - Files: `src/analyzer/analyzer.js`

- [ ] **Generic type aliases** — `type Handler<T> = async (Request) -> Result<T, Error>`
  - Files: `src/parser/parser.js`, `src/analyzer/analyzer.js`

- [ ] **Extensible derive** — Allow `derive` for user-defined traits, not just hardcoded [Eq, Show, JSON]
  - Files: `src/codegen/base-codegen.js`, `src/parser/parser.js`

### LSP & Editor Experience

- [x] **LSP code actions / quick fixes**
  - Unused variable: offer "prefix with `_`"
  - Undefined identifier: offer "did you mean?" replacement
  - Type mismatch: offer "wrap in Ok()" or "toString()"
  - Files: `src/lsp/server.js`

- [ ] **Scope-aware rename** — Current rename replaces all occurrences regardless of scope
  - Track semantic scopes, only rename within the correct scope
  - Files: `src/lsp/server.js`

- [x] **Hover documentation for all stdlib functions** — 150+ stdlib functions documented
  - Shows signatures with parameter names, types, and return types
  - Files: `src/lsp/server.js`

- [x] **Completion: show parameter names and arities** — Shows `fn(arr, fn)` instead of `fn(...)`
  - Parses stdlib source to extract param names dynamically
  - Files: `src/lsp/server.js`

- [x] **VS Code snippets** — 20 snippets for common patterns
  - `fn`, `fnr`, `match`, `for`, `comp`, `state`, `effect`, `route`, `type`, `pipe`, `if`, `ife`, `guard`, `server`, `import`, `test`, `afn`, `while`, `mut`, `try`
  - Files: `editors/vscode/snippets/tova.json`, `editors/vscode/package.json`

- [x] **Format on save by default** in VS Code extension
  - Files: `editors/vscode/package.json`

### Stdlib

- [ ] **Lazy iterators / sequences** — Avoid intermediate array allocation in pipelines
  - `iter()`, lazy `filter()`, `map()`, `take()`, `collect()`
  - Critical for performance with large datasets
  - Files: `src/stdlib/inline.js`

- [x] **`andThen` alias for `flatMap` on Result/Option** — Rust convention, more readable for error chains
  - Added to Ok, Err, Some, and None
  - Files: `src/stdlib/inline.js`

---

## P2 — Production Ready (Real-World Applications)

These are needed for teams building real applications.

### Language Features

- [x] **Error context / wrapping** — `.context("message")` on Result for error chain stacking
  - Output: `Error: validating config → caused by: field 'port' invalid`
  - Ok.context() passes through, Err.context(msg) wraps with chain
  - Files: `src/stdlib/inline.js`

- [x] **Async iteration** — `async for chunk in stream { ... }`
  - Compiles to `for await (const chunk of stream) { ... }`
  - Async generators already supported via `async fn` + `yield`
  - Files: `src/parser/parser.js`, `src/parser/ast.js`, `src/codegen/base-codegen.js`

- [x] **`loop` keyword** — `loop { if done { break } }` instead of `while true`
  - Compiles to `while (true) { ... }`
  - Supports labels: `outer: loop { break outer }`
  - Files: `src/lexer/tokens.js`, `src/parser/parser.js`, `src/parser/ast.js`, `src/codegen/base-codegen.js`, `src/analyzer/analyzer.js`

- [x] **Named break / continue** — `outer: for row in matrix { break outer }`
  - Label syntax: `name: for/while/loop { ... }`, then `break name` or `continue name`
  - Analyzer validates label exists in scope, rejects undefined labels
  - Files: `src/parser/parser.js`, `src/parser/ast.js`, `src/codegen/base-codegen.js`, `src/analyzer/analyzer.js`

- [x] **`when` guards on for loops** — `for user in users when user.active { ... }`
  - Compiles to `if (!(guard)) continue;` at top of loop body
  - Works with for-else and labels
  - Files: `src/lexer/tokens.js`, `src/parser/parser.js`, `src/parser/ast.js`, `src/codegen/base-codegen.js`, `src/analyzer/analyzer.js`

- [x] **Destructuring without `let`** — `{name, age} = user` (braces/brackets already disambiguate)
  - Also: `[a, b] = pair` — array destructuring without `let`
  - Files: `src/parser/parser.js`

- [ ] **Tuple first-class support** — `point.0`, `point.1` for positional access
  - Files: `src/parser/parser.js`, `src/codegen/base-codegen.js`

- [ ] **String interpolation sigil** — Consider `"count: ${count}"` instead of `"count: {count}"`
  - Prevents accidental interpolation in JSON strings
  - Files: `src/lexer/lexer.js` (breaking change — needs migration path)

### CLI & Tooling

- [x] **`tova check` command** — Type-check only, no codegen, fast for CI
  - `$ tova check src/` → `12 files checked, 0 errors, 2 warnings`
  - Supports `--strict`, `--verbose`, `--quiet` flags
  - Files: `bin/tova.js`

- [x] **`tova clean` command** — Delete `.tova-out/` build artifacts
  - Files: `bin/tova.js`

- [x] **`--verbose` / `--quiet` flags** — Control output verbosity
  - `--verbose`: Shows per-file compile timing and total build time
  - `--quiet`: Suppresses non-error output
  - Files: `bin/tova.js`

- [x] **Build performance reporting** — `Compiled app.tova (45ms), shared.tova (12ms)`
  - Enabled via `--verbose` flag on `tova build` and `tova check`
  - Files: `bin/tova.js`

- [x] **`--watch` flag for build command** — `tova build --watch`
  - Watches .tova files and rebuilds on changes with 100ms debounce
  - Files: `bin/tova.js`

### Error Handling

- [x] **Error suggestions for common mistakes**
  - `let x = 5` → "use `x = 5` for binding, `let` is for destructuring"
  - `throw` → "Tova uses Result/Option, try `Err(message)`"
  - Files: `src/parser/parser.js`, `src/analyzer/analyzer.js`

- [x] **Circular import error messages** — Show full chain: `a.tova → b.tova → a.tova`
  - Tracks import chain and shows all files in cycle
  - Files: `bin/tova.js`

### REPL Improvements

- [x] **`_` last result reference** — `1 + 2` → `3`, then `_ * 10` → `30`
  - Files: `bin/tova.js` (REPL section)

- [x] **`:type expr` command** — Show inferred type without evaluating
  - Shows Tova type names: Int, Float, String, Bool, List, etc.
  - Files: `bin/tova.js` (REPL section)

- [ ] **Import support in REPL** — `import { utils } from "./module.tova"`
  - Files: `bin/tova.js` (REPL section)

---

## P3 — Ecosystem & Community Growth

These are for building a community around the language.

### Documentation & Learning

- [x] **`tova doc` command** — Auto-generate HTML docs from `///` docstrings
  - Parser attaches docstrings to AST nodes, DocGenerator produces HTML/Markdown with Catppuccin styling
  - Files: `src/parser/parser.js`, `src/docs/generator.js`, `bin/tova.js`

- [x] **Playground: "Tour of Tova"** — Guided examples in sidebar (like Go Tour)
  - 10-step tutorial with prev/next navigation, progress dots, "Try this code" buttons
  - Files: `playground/build.js`, `playground/` (new examples)

- [x] **Playground: show generated JS** — Side-by-side Tova → JS view
  - JS Output tab active by default with CodeMirror editor
  - Files: `playground/build.js`

- [x] **Deployment guide** — Production deployment docs for common platforms
  - Covers Docker, Fly.io, Railway, Vercel, static hosting
  - Files: `docs/tooling/deployment.md`

- [x] **JS interop guide** — Detailed examples of calling JS libraries from Tova
  - npm packages, extern declarations, FFI patterns, browser APIs, Type.new()
  - Files: `docs/guide/js-interop.md`

### Testing Framework

- [x] **Snapshot testing** — `assert_snapshot(output)` for golden-file testing
  - `assert_snapshot(value, name?)` in stdlib with update mode via `TOVA_UPDATE_SNAPSHOTS=1`
  - Files: `src/stdlib/inline.js`

- [x] **Property-based testing** — `forAll(fn(n: Int) n + 0 == n)`
  - `Gen.int()`, `Gen.float()`, `Gen.bool()`, `Gen.string()`, `Gen.array()`, `Gen.oneOf()` + `forAll()`
  - Files: `src/stdlib/inline.js`

- [x] **Benchmark support** — `bench "sort 1000 items" { sort(large_list) }`
  - `bench` keyword, `BenchBlock` AST node, `tova bench [dir]` CLI, warmup + timing + percentiles
  - Files: `src/parser/parser.js`, `src/parser/ast.js`, `src/codegen/codegen.js`, `src/codegen/server-codegen.js`, `bin/tova.js`

### Stdlib Additions

- [x] **Async utilities** — `parallel(tasks, limit: 5)`, `race()`, `timeout()`, `retry()`
  - `parallel`, `timeout`, `retry`, `try_async`, `race` all in stdlib
  - Files: `src/stdlib/inline.js`

- [x] **Filesystem operations** — `readFile()`, `writeFile()`, `glob()`, `pathExists()`, `dirname()`
  - `read_text`, `write_text`, `read_bytes`, `exists`, `is_dir`, `glob_files`, `mkdir`, `rm`, `cp`, `mv`, `path_*` all in stdlib
  - Files: `src/stdlib/inline.js`

- [x] **Regex builder API** — `Regex.new() |> .digits(4) |> .literal("-") |> .build()`
  - Fluent `RegexBuilder` class with chainable methods + `regex_builder()` constructor
  - Files: `src/stdlib/inline.js`

- [x] **`Ordering` type** — `type Ordering = Less | Equal | Greater` for custom sorting
  - `Less`, `Equal`, `Greater` + `compare(a, b)` + `compare_by(arr, fn)`
  - Files: `src/stdlib/inline.js`

- [x] **Channel-based async** — `Channel.new()`, `.send()`, `.receive()` for complex async flows
  - Buffered/unbuffered channels with Promise-based queuing, `Symbol.asyncIterator`
  - Files: `src/stdlib/inline.js`

### Package Ecosystem

- [x] **Native package registry vision** — `tova add tova-router` vs `tova add npm:lodash`
  - `tova add foo` (Tova native) vs `tova add npm:lodash` (npm), `[dependencies]` section, `tova.lock` generation
  - Files: `bin/tova.js`, `src/config/resolve.js`

- [x] **Opinionated formatter** — One true style like `gofmt`, no configuration options
  - `tova fmt` and `tova fmt --check` CLI commands, 559-line formatter
  - Files: `src/formatter/formatter.js`, `bin/tova.js`

### VS Code Extension Polish

- [x] **Extension bundling** — Self-contained extension, no bun dependency required
  - esbuild build script, bundles LSP server + extension client
  - Files: `editors/vscode/build.js`

- [x] **Debug support** — Breakpoints, step debugging, watch expressions
  - Debug adapter compiles .tova → .js with source maps, delegates to Node.js debugger
  - Files: `editors/vscode/debug-adapter.js`, `editors/vscode/extension.js`

- [x] **Theme/icon pack** — `.tova` file icon, syntax theme optimized for Tova
  - Catppuccin Mocha-inspired "Tova Dark" theme, SVG file icon
  - Files: `editors/vscode/themes/tova-dark-color-theme.json`, `editors/vscode/icons/tova-icon.svg`

- [x] **Extension README** — Marketplace-ready description with screenshots
  - Feature list, snippets table, debugging instructions, build from source
  - Files: `editors/vscode/README.md`

---

## P4 — Performance & Code Quality

These improve the quality of generated output.

### Codegen Optimizations

- [x] **Match → ternary chain** — Simple match expressions emit ternaries, not IIFEs
  - `match x { 0 => "zero", _ => "other" }` → `(x === 0 ? "zero" : "other")`
  - `_isSimpleMatch()` detects safe cases, `_genSimpleMatch()` emits ternary chain
  - Files: `src/codegen/base-codegen.js`

- [x] **Specialize `in` checks by type** — `arr.includes(x)` for arrays, `set.has(x)` for sets, `x in obj` for objects
  - `_specializeContains()` pattern-matches AST: ArrayLiteral→includes, StringLiteral→includes, Set/Map.new→has, ObjectLiteral→in
  - Skips `__contains` helper when all checks are specialized (smaller output)
  - Files: `src/codegen/base-codegen.js`

- [x] **Dead code elimination** — Warns on:
  - Unused private functions at module level (skip pub, _, main, extern, variant constructors)
  - Unreachable code after `return`/`break`/`continue`
  - Unreachable match arms after catch-all pattern
  - Constant conditionals: `if true`, `if false`, `while false`
  - Files: `src/analyzer/analyzer.js`

- [x] **Reduce IIFE usage** — For simple expressions that don't need scope isolation, emit inline code
  - `??`: inline NaN-safe check when left is simple expression
  - if/elif/else: nested ternary when all branches are single expressions
  - Pipe with multiple `_`: inline when left is simple
  - Chained comparisons: inline when intermediate operands are simple
  - Files: `src/codegen/base-codegen.js`

### Parser Robustness

- [x] **Improve arrow lambda error recovery** — Better error hints when `=` or `==` follows lambda-like parens
  - Hints: "Use `->`  or `=>` for arrow functions"
  - Improved catch block comments for speculative parse failures
  - Files: `src/parser/parser.js`

- [x] **Reduce regex detection lookahead** — Replaced positive whitelist with negative list approach
  - `divisionContextTokens` (9 tokens) instead of `regexPreceders` (20+ tokens)
  - New token types default to regex context instead of being silently missed
  - Files: `src/lexer/lexer.js`

- [x] **Better JSX disambiguation** — Negative check for comparison/logical operators after identifier
  - `a < b && c > d` correctly parsed as comparison, not JSX
  - Rejects LESS_EQUAL, GREATER_EQUAL, AND_AND, OR_OR, EQUAL, NOT_EQUAL after tag name
  - Files: `src/parser/parser.js`

---

## Progress Tracker

| Priority | Total | Done | Remaining |
|----------|-------|------|-----------|
| P0       | 7     | 5    | 2         |
| P1       | 11    | 6    | 5         |
| P2       | 17    | 14   | 3         |
| P3       | 16    | 16   | 0         |
| P4       | 7     | 7    | 0         |
| **Total**| **58**| **48**| **10**   |

---

*Generated from comprehensive language review — 2026-02-21*
*Update this file as items are completed.*
