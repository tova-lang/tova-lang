# Lux Language: Full Production Readiness Roadmap

## Context

Lux is a full-stack JS-transpiling language with 3,338 passing tests, reactive UI, server routing, pattern matching, Result/Option, and JSX. This plan covers all production blockers, quality gaps, and new language features — verified against the actual codebase.

**Already verified as working:** break/continue loop validation, propagate operator, named arguments (partial).

---

## Implementation Order (18 items)

### Step 1: String Method Integration (fix dead code)
**Problem:** `src/stdlib/inline.js:67-86` defines 12 string methods on `String.prototype`, but `getStringProtoHelper()` is never called — the methods are dead code. They also use prototype pollution (anti-pattern).
**Plan:**
- Convert `.upper()`, `.lower()`, `.contains()`, etc. into standalone stdlib functions that take the string as first arg
- In codegen, rewrite `str.upper()` calls to `__lux_upper(str)` or make them work via pipe: `str |> upper()`
- Remove `String.prototype` modification entirely
- Add the string functions to `BUILTINS` in inline.js
- Add tests for all 12 string methods
**Files:** `src/stdlib/inline.js`, `src/codegen/base-codegen.js`, `tests/`

### Step 2: Import Validation
**Problem:** `import { Foo } from "./bar.lux"` succeeds even if `bar.lux` doesn't export `Foo`. Typos become silent runtime errors.
**Plan:**
- In `compileWithImports()` (`bin/lux.js`), collect the export list from each compiled module's AST
- Store exports in a module registry map
- In the analyzer, when visiting import declarations for `.lux` files, check that each imported name exists in the target module's export list
- Emit error: `"Module './bar.lux' does not export 'Foo'"`
**Files:** `bin/lux.js`, `src/analyzer/analyzer.js`

### Step 3: Propagate Operator Robustness
**Problem:** `?` uses sentinel exceptions (`__lux_propagate` flag). If user code has a `try/catch` that catches all errors, it swallows the propagation sentinel.
**Plan:**
- Replace exception-based flow with explicit early-return checks in codegen
- Instead of `try { __propagate(val) } catch(e) { ... }`, generate:
  ```js
  const __tmp = val;
  if (__tmp && (__tmp.__tag === "Err" || __tmp.__tag === "None")) return __tmp;
  const x = __tmp.__tag === "Ok" || __tmp.__tag === "Some" ? __tmp.value : __tmp;
  ```
- Remove `__propagate` function from stdlib
- Handle the lambda case (can't `return` from arrow, use labeled blocks or IIFE)
- Update all codegen paths: `base-codegen.js` (functions), `client-codegen.js` (lambdas)
**Files:** `src/stdlib/inline.js`, `src/codegen/base-codegen.js`, `src/codegen/client-codegen.js`

### Step 4: Visibility Modifiers (`pub`)
**Problem:** Everything in a module is implicitly exported. No way to hide implementation details.
**Plan:**
- Add `PUB` token to `src/lexer/tokens.js` and `Keywords` map
- In parser, recognize `pub fn`, `pub type`, `pub x = ...` — set `isPublic: true` on the AST node
- Default: private (not exported). Only `pub`-marked declarations get `export` in generated JS
- Backward compat: for now, treat top-level declarations without `pub` as public (with deprecation warning), to avoid breaking existing code. In a future version, make private the default.
- Update codegen to only emit `export` for `pub`-marked items
**Files:** `src/lexer/tokens.js`, `src/lexer/lexer.js`, `src/parser/parser.js`, `src/parser/ast.js`, `src/codegen/base-codegen.js`, `src/analyzer/analyzer.js`

### Step 5: Method Syntax / `impl` Blocks
**Problem:** Functions on types are detached. No way to call `user.display()` — must use `display(user)`.
**Plan:**
- Add `IMPL` token and keyword
- New AST node: `ImplDeclaration { typeName, methods[] }`
- Parser: `impl TypeName { fn method(self, ...) { ... } }`
- `self` is a special first parameter that receives the instance
- Codegen: Generate methods as prototype assignments or as functions that take `self`:
  ```js
  // Option A: Prototype-based
  User.prototype.display = function() { return `${this.name} <${this.email}>`; }
  // Option B: Plain function, rewrite call sites
  function User_display(self) { ... }
  // user.display() → User_display(user)
  ```
- Prototype-based is simpler and works with JS ecosystem. Use Option A.
- Analyzer: Track impl methods in scope, validate `self` usage
**Files:** `src/lexer/tokens.js`, `src/parser/parser.js`, `src/parser/ast.js`, `src/analyzer/analyzer.js`, `src/codegen/base-codegen.js`

### Step 6: Type Aliases
**Problem:** No way to write `type Url = String` or `type Handler = fn(Request) -> Response`.
**Plan:**
- Extend `parseTypeDeclaration()` in parser to detect `type Name = TypeExpr` (when `=` follows the type name instead of `{`)
- New AST node: `TypeAlias { name, typeExpr }`
- Codegen: Type aliases are compile-time only (no JS output), but generate `// type alias: Url = String` comment for readability
- Analyzer: Register alias in scope, resolve when used in annotations
**Files:** `src/parser/parser.js`, `src/parser/ast.js`, `src/analyzer/analyzer.js`, `src/codegen/base-codegen.js`

### Step 7: Local Type Inference
**Problem:** All types default to `Any` if not annotated. Basic inference from literals is missing.
**Plan:**
- Infer types from:
  - Literals: `x = 42` → Int, `x = "hi"` → String, `x = true` → Bool
  - Constructors: `x = Ok(42)` → Result<Int, _>, `x = Some("a")` → Option<String>
  - Array literals: `x = [1, 2]` → [Int]
  - Known function returns: `x = len(arr)` → Int
- Store inferred type in the symbol table entry
- Use inferred types for downstream warnings (passing Int where String expected)
- Function signatures remain explicit — do not infer function parameter/return types
**Files:** `src/analyzer/analyzer.js`, potentially new `src/analyzer/type-inference.js`

### Step 8: Code Formatter (`lux fmt`)
**Problem:** No formatter means inconsistent style across projects.
**Plan:**
- New `src/formatter/formatter.js`: Walk the AST, pretty-print with rules:
  - 2-space indentation
  - Consistent brace style (same-line opening)
  - One statement per line
  - Blank line between top-level declarations
  - Max line length ~100 chars with wrapping
- Parse → format → output (preserves semantics via AST round-trip)
- Challenge: Comments are discarded by lexer. Need to modify lexer to preserve comment tokens with locations, then reattach during formatting.
- Add `lux fmt <file>` and `lux fmt --check` CLI commands
- Wire into LSP `textDocument/formatting`
**Files:** New `src/formatter/formatter.js`, `src/lexer/lexer.js` (comment preservation), `bin/lux.js`, `src/lsp/server.js`

### Step 9: Trait System (evolve `interface`)
**Problem:** `interface` only declares shapes. No default implementations, no ad-hoc polymorphism.
**Plan:**
- Add `TRAIT` token and keyword
- Traits define method signatures with optional default implementations:
  ```lux
  trait Display {
    fn display(self) -> String          // required
    fn print(self) { print(self.display()) }  // default
  }
  ```
- `impl Trait for Type { ... }` syntax (extends Step 5's impl blocks)
- Codegen: Generate prototype assignments for default methods, override with explicit impls
- Analyzer: Verify all required methods are implemented, check trait bounds on generics
- Keep `interface` working as-is for backward compat (trait is the evolution)
**Files:** `src/lexer/tokens.js`, `src/parser/parser.js`, `src/parser/ast.js`, `src/analyzer/analyzer.js`, `src/codegen/base-codegen.js`

### Step 10: `defer` Statement
**Problem:** No cleanup guarantee on early returns. Must use try/finally manually.
**Plan:**
- Add `DEFER` token and keyword
- AST node: `DeferStatement { body }`
- Parser: `defer expr` or `defer { block }`
- Codegen: Collect all defer statements in current function, wrap function body in try/finally:
  ```js
  function foo() {
    const file = open("x");
    // defer file.close()
    try {
      // ... rest of function body ...
    } finally {
      file.close();
    }
  }
  ```
- Multiple defers execute in LIFO order (like Go)
- Analyzer: Validate defer is inside a function (not at module level)
**Files:** `src/lexer/tokens.js`, `src/parser/parser.js`, `src/parser/ast.js`, `src/codegen/base-codegen.js`, `src/analyzer/analyzer.js`

### Step 11: Tuple Types
**Problem:** No lightweight pair/triple syntax. Must declare full types for simple returns.
**Plan:**
- Tuple expression: `(a, b)` — disambiguate from grouping by requiring `,`
- Tuple type: `(Int, String)` in annotations
- Destructuring: `let (x, y) = expr`
- Codegen: Tuples compile to JS arrays: `(1, "hi")` → `[1, "hi"]`
- Access: `t.0`, `t.1` → `t[0]`, `t[1]` (or named access later)
- AST nodes: `TupleExpression`, `TupleType`, `TuplePattern`
**Files:** `src/parser/parser.js`, `src/parser/ast.js`, `src/codegen/base-codegen.js`, `src/analyzer/analyzer.js`

### Step 12: Generic Type Validation
**Problem:** Generics are parsed but never checked. `Box<Int>` and `Box<String>` are identical.
**Plan:**
- Track type parameter declarations in type/function definitions
- When a generic type is instantiated, verify the correct number of type args
- Add type parameter bounds: `fn sort<T: Ord>(items: [T])` — verify T implements Ord trait (connects to Step 9)
- Store generic parameter info in symbol table
- Emit warnings for mismatched type parameter counts
**Files:** `src/analyzer/analyzer.js`

### Step 13: Named Arguments (complete + test)
**Problem:** Parser and codegen exist (`src/parser/ast.js:376-383`, `base-codegen.js:625-645`) but no tests.
**Plan:**
- Add comprehensive tests for named arguments: pure named, mixed positional+named, named in pipes
- Verify edge cases: duplicate named args, named args to built-in functions
- Add analyzer warning for unknown named parameter names (if function signature is known)
**Files:** `tests/new-features.test.js`

### Step 14: LSP Robustness
**Problem:** Only 4 tests. Missing rename, formatting, workspace symbols, semantic highlighting.
**Plan:**
- Add `textDocument/rename` (find all references of symbol, rename in scope)
- Add `textDocument/formatting` (delegates to formatter from Step 8)
- Add `textDocument/semanticTokens` (provide semantic token types for richer highlighting)
- Add `workspace/symbol` (search all symbols across files)
- Expand test coverage to 30+ tests covering all LSP methods
**Files:** `src/lsp/server.js`, `tests/lsp.test.js`

### Step 15: Unicode Identifier Support
**Problem:** `isAlpha()` in `src/lexer/lexer.js:61-63` only checks ASCII a-z, A-Z.
**Plan:**
- Replace ASCII check with Unicode-aware check using regex: `/\p{Letter}/u` or `/[\p{ID_Start}]/u`
- Also update `isAlphaNumeric()` to use `/[\p{ID_Continue}]/u`
- Add tests for identifiers with accented characters, CJK, emoji (if desired)
**Files:** `src/lexer/lexer.js`

### Step 16: Generators / Iterators
**Problem:** No lazy sequences. Must materialize all collections.
**Plan:**
- Add `YIELD` token and keyword
- Functions containing `yield` become generator functions
- Codegen: `fn* name() { yield value }` → JS `function* name() { yield value; }`
- Support `yield from` for delegation: `yield from other_iterator()`
- Integrate with for loops: `for x in generator() { ... }` (already works since JS generators are iterable)
- Add iterator helpers to stdlib: `take`, `drop`, `zip_lazy`, `chain`
**Files:** `src/lexer/tokens.js`, `src/parser/parser.js`, `src/parser/ast.js`, `src/codegen/base-codegen.js`

### Step 17: Test Runner (`lux test`)
**Problem:** `test` blocks exist but no built-in runner with filtering, coverage, watch.
**Plan:**
- Add `lux test` CLI command that:
  - Finds all `.lux` files with `test` blocks
  - Compiles them to JS test files
  - Runs via Bun's test runner
- Add `--filter "pattern"` for test name filtering
- Add `--watch` for re-run on changes
- Add assertion functions to stdlib: `assert_eq`, `assert_ne`, `assert_throws`
- Add `--coverage` flag (delegates to Bun's coverage)
**Files:** `bin/lux.js`, `src/stdlib/inline.js`

### Step 18: Nice-to-Have Polish
**Regex literals:** Add `/pattern/flags` syntax to lexer/parser. Codegen: `new RegExp("pattern", "flags")`.
**Raw strings:** `r"no\escapes"` syntax — lexer skips escape processing.
**Package manager:** `lux add <pkg>` wraps npm/bun install + adds to project config.
**HMR:** WebSocket-based hot module replacement in dev server.

---

## Verification

After each step:
1. `bun test` — all existing tests must pass (currently 3,338)
2. New tests added for each feature
3. Manual test with sample `.lux` file exercising the feature
4. Check generated JS output is valid and runnable
5. Verify LSP still works after parser/analyzer changes
