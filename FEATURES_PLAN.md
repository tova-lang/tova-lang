# Lux Language: Production Readiness Review

## Context

Lux is a full-stack language transpiling to JavaScript with 1,731 passing tests, 55+ AST node types, Python-inspired syntax, fine-grained reactivity, pattern matching, and Result/Option error handling. The codebase is well-structured (Lexer → Parser → Analyzer → CodeGenerator) with comprehensive server and client codegen. This review identifies what's missing for production readiness and what features would add genuine value.

---

## TIER 1: Production Blockers

These must be addressed before developers will trust Lux for real work.

### 1. Source Maps
**Problem:** Zero source map support. When generated JS throws at line 47, developers see compiled output, not their `.lux` source. This makes debugging impossible in browser DevTools, Bun stack traces, and error monitoring (Sentry, etc.).

**Approach:** Every AST node already has `node.loc` with `{line, column, file}`. Use a `MappingBuilder` class that tracks output position during codegen. Each `gen*` method emits a mapping. Output `//# sourceMappingURL=` at end of each file; inline as data URL in dev HTML.

**Files:** `src/codegen/base-codegen.js`, `src/codegen/codegen.js`, `bin/lux.js`
**Effort:** Medium-large

---

### 2. Rich Error Messages with Code Snippets
**Problem:** All errors are bare `file:line:column -- message`. No source context, no caret pointing to the problem, no suggestions. Compare to Rust/Elm which proved error quality is a competitive advantage.

**Current:**
```
app.lux:12:5 -- Parse error: Expected '}'
```

**Target:**
```
error: Expected '}' to close server block
  --> app.lux:12:5
   |
10 |   server {
11 |     route GET "/api" => handler
12 |
   |   ^ expected '}' here
   |
 = hint: opening '{' is at line 10
```

**Approach:** Create `src/diagnostics/formatter.js` that accepts source text + location + message + optional hint. Wire into Lexer, Parser, Analyzer error paths. Source text is already available (`Lexer.source`).

**Files:** New `src/diagnostics/formatter.js`, `src/lexer/lexer.js`, `src/parser/parser.js`, `src/analyzer/analyzer.js`, `bin/lux.js`
**Effort:** Medium

---

### 3. LSP Server for IDE Integration
**Problem:** No Language Server Protocol. Developers get zero editor help: no autocomplete, no go-to-definition, no inline errors, no hover types. In 2026, this is a non-starter for team adoption.

**Approach (phased):**
- **Phase 1 (MVP):** Diagnostics on save (parse + analyze, report errors inline), keyword/identifier completion, go-to-definition via `Scope` symbol table (already has `Symbol.loc`)
- **Phase 2:** Hover docs (docstrings already parsed as `DOCSTRING` tokens), signature help, rename support
- VS Code extension with TextMate grammar for syntax highlighting

**Files:** New `src/lsp/` directory, new `lux-lang-vscode/` extension
**Effort:** Large (2-3 weeks for MVP), but analyzer already does the heavy lifting

---

### 4. Type Checking Beyond Hints
**Problem:** Types are parsed (generics, array types, function types) and completely ignored. Unknown identifiers don't even produce warnings -- typos silently become `undefined` at runtime. This contradicts Lux's safety identity (Result/Option, pattern matching).

**Approach (gradual, phased):**
1. **Warn on undefined identifiers** -- `visitIdentifier` currently silently ignores unknown symbols. Add warning with JS globals allowlist (`console`, `document`, `JSON`, etc.). ~30 lines.
2. **Argument count checking** -- Symbol table already stores `_params`. Verify `args.length` matches. ~20 lines.
3. **Type inference for literals** -- Add `resolvedType` to expressions. `NumberLiteral` = Int/Float, `StringLiteral` = String. Propagate through binary ops.
4. **Match exhaustiveness** -- See Tier 3 item below. Move `_variantFields` to analyzer, verify all variants covered.

**Files:** `src/analyzer/analyzer.js`, `src/analyzer/scope.js`, new `src/analyzer/type-checker.js`
**Effort:** Phase 1-2 small, Phase 3-4 medium

---

### 5. Production Build Pipeline
**Problem:** `lux build` just transpiles to JS and copies runtime files. No bundling, minification, tree-shaking, dead code elimination, or code splitting. CSS is injected at runtime. Not deployable.

**Approach:** Add `lux build --production` that: (1) bundles client code via Bun.build(), (2) minifies, (3) generates HTML with hashed asset filenames, (4) extracts CSS to static file, (5) optimizes server output.

**Files:** `bin/lux.js`
**Effort:** Medium

---

## TIER 2: Production Essentials

What makes the difference between "usable" and "pleasant."

### 6. Watch Mode with Auto-Reload
**Problem:** Dev server compiles once and starts. No file watching, no recompilation, no browser reload.

**Approach:** `fs.watch` on `.lux` files → recompile → restart server process + WebSocket reload signal to browser.

**Files:** `bin/lux.js`
**Effort:** Medium

### 7. Break/Continue in Loops
**Problem:** No `break` or `continue` keywords. Loops cannot be exited early. This is a basic control flow feature every developer expects.

**Approach:** Add tokens, AST nodes, parse in `parseStatement`, generate as `break;`/`continue;`, validate in analyzer (only inside loops).

**Files:** `src/lexer/tokens.js`, `src/parser/ast.js`, `src/parser/parser.js`, `src/codegen/base-codegen.js`, `src/analyzer/analyzer.js`
**Effort:** Small (~50 lines total)

### 8. Async/Await as First-Class Keywords
**Problem:** Async is auto-detected from RPC calls. You can't write `async fn fetch_data()` or `await fetch("/api")`. If a JS library returns a Promise, there's no way to await it from Lux.

**Approach:** Add `async`/`await` keywords. `async fn` in parser, `AwaitExpression` as prefix unary. Keep RPC auto-detection as convenience. Generate directly to JS async/await.

**Files:** `src/lexer/tokens.js`, `src/parser/parser.js`, `src/parser/ast.js`, `src/codegen/base-codegen.js`
**Effort:** Small-medium

### 9. Unused Variable & Import Warnings
**Problem:** `Symbol.used` is tracked but never checked. Infrastructure is built, just not connected.

**Approach:** At end of `analyze()`, walk all scopes, warn on `used === false` (excluding `_`-prefixed params and exports).

**Files:** `src/analyzer/analyzer.js`
**Effort:** Small (~20 lines)

### 10. Multi-file Project Support
**Problem:** Each `.lux` file compiles independently. No cross-file imports between Lux modules. Real apps need `import { User } from "./models.lux"`.

**Approach:** When codegen encounters a `.lux` import path, resolve and compile that file first, then rewrite the import to target compiled output. Add compilation cache to avoid recompilation.

**Files:** `bin/lux.js`, `src/codegen/codegen.js`
**Effort:** Medium

### 11. REPL
**Problem:** No interactive shell for exploration and learning.

**Approach:** `lux repl` command using `readline`. Compile each input through the pipeline, `eval()` in persistent context. Handle multi-line input (detect open braces/parens).

**Files:** `bin/lux.js`
**Effort:** Small-medium

---

## TIER 3: Valuable Language Features

Features that reinforce Lux's identity and make developers choose it.

### 12. Exhaustive Match Checking
**Problem:** `match` doesn't verify all cases are handled. Given Lux's Result/Option identity, a `match result { Ok(v) => v }` should warn that `Err` is unhandled.

**Approach:** Move `_variantFields` to analyzer. When subject has known type, collect variant set, compare against match arms, warn if uncovered and no wildcard.

**Files:** `src/analyzer/analyzer.js`, new `src/analyzer/exhaustiveness.js`
**Effort:** Medium

### 13. Pipe Operator Enhancements
**Problem:** `|>` only inserts left as first argument. Two additions would make it much more powerful:
- **Placeholder**: `data |> transform(_, options)` -- `_` marks where piped value goes
- **Method pipe**: `items |> .filter(fn(x) x > 0) |> .map(fn(x) x * 2)` -- `.method()` calls on piped value

**Files:** `src/codegen/base-codegen.js`, minor parser tweak
**Effort:** Small

### 14. Interfaces / Protocols
**Problem:** No way to define contracts that types must satisfy. Full-stack apps have many "things that share a shape."

```lux
interface Serializable {
  fn to_json() -> String
  fn from_json(data: String) -> Self
}
```

**Approach:** New keyword, new AST node, parser + analyzer changes. Generate as documentation/type comments (no runtime cost).

**Files:** `src/lexer/tokens.js`, `src/parser/parser.js`, `src/parser/ast.js`, `src/analyzer/analyzer.js`
**Effort:** Medium

### 15. Derive for Types
**Problem:** Types generate only constructors + freeze. No `toString()`, equality, serialization.

```lux
type User {
  name: String
  email: String
} derive [Eq, Show, JSON]
```

`Eq` = deep equality, `Show` = readable toString, `JSON` = toJSON/fromJSON.

**Files:** `src/parser/parser.js`, `src/codegen/base-codegen.js`
**Effort:** Medium

### 16. String Pattern Matching
**Problem:** Match only supports literal string equality. URL/string manipulation is core to full-stack apps.

```lux
match url {
  "/api" ++ rest => handle_api(rest)
  "/ws" ++ _ => upgrade_websocket()
  _ => not_found()
}
```

**Files:** `src/parser/parser.js`, `src/codegen/base-codegen.js`
**Effort:** Small-medium

### 17. Destructuring in Function Parameters
**Problem:** Parameters only accept simple identifiers. Can't write `fn process({name, email}) { ... }`.

**Files:** `src/parser/parser.js`, `src/codegen/base-codegen.js`
**Effort:** Small-medium

### 18. Guard Clauses
**Problem:** No idiomatic way to do early validation. Elixir-inspired guard syntax fits Lux's safety identity.

```lux
fn divide(a, b) {
  guard b != 0 else { return Err("division by zero") }
  Ok(a / b)
}
```

**Files:** `src/lexer/tokens.js`, `src/parser/parser.js`, `src/codegen/base-codegen.js`
**Effort:** Small

---

## Structural Issues to Address

### Duplicated Stdlib
The stdlib is defined **three times**: `base-codegen.js` (`getStdlibCore`), `client-codegen.js` (`getStdlibCore`), `bin/lux.js` (`getStdlibForRuntime`). Any change requires updating three locations. Extract to a single `src/stdlib/inline.js` that all three import from.

### Server Codegen Too Large
`server-codegen.js` is the largest file by far. Split into: route generation, middleware generation, ORM generation, OpenAPI generation, and server bootstrap modules.

### No Incremental Compilation
Every file compiles from scratch. For watch mode and LSP, incremental compilation (cache ASTs, only reparse changed files) will be essential.

---

## Priority Matrix

| # | Item | Effort | Impact | Priority |
|---|------|--------|--------|----------|
| 1 | Source maps | M-L | Critical | P0 |
| 2 | Rich error messages | M | Critical | P0 |
| 3 | LSP server | L | Critical | P0 |
| 4 | Type checking (phases 1-2) | S | High | P0 |
| 5 | Production build pipeline | M | High | P1 |
| 6 | Watch mode + auto-reload | M | High | P1 |
| 7 | Break/continue | S | High | P1 |
| 8 | Async/await keywords | S-M | High | P1 |
| 9 | Unused variable warnings | S | Medium | P1 |
| 10 | Multi-file projects | M | High | P2 |
| 11 | REPL | S-M | Medium | P2 |
| 12 | Exhaustive match checking | M | High | P2 |
| 13 | Pipe enhancements | S | Medium | P2 |
| 14 | Interfaces/protocols | M | Medium | P3 |
| 15 | Derive for types | M | Medium | P3 |
| 16 | String pattern matching | S-M | Medium | P3 |
| 17 | Destructuring params | S-M | Medium | P3 |
| 18 | Guard clauses | S | Low-Med | P3 |

---

## Verification

For each implemented item:
- Run `bun test` to verify all 1,731 existing tests still pass
- Add new tests for each feature (in existing test file pattern)
- Manual testing with example `.lux` files
- For source maps: verify browser DevTools show `.lux` source
- For LSP: verify VS Code shows inline errors and completions
- For build pipeline: verify production output is minified and bundled
