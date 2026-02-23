# Tova Language - Implementation Review Tasks

> Generated 2026-02-23 from comprehensive review of all components.
> Organized by priority. Check off tasks as completed.

---

## CRITICAL (Fix First)

### C1. Lexer: O(n^2) String Concatenation in Triple-Quoted Strings
- **File:** `src/lexer/lexer.js` lines 614-645
- **Problem:** `scanTripleQuoteString()` uses `exprSource += this.advance()` which is O(n^2) for long strings. The regular `scanString()` correctly uses array-based building (`const exprParts = []`).
- **Fix:** Change `let exprSource = ''` to `const exprParts = []`, push characters instead of concatenating, then `exprParts.join('')`.
- **Impact:** 10-100x slower for large string interpolations.
- [ ] Fix triple-quoted string scanning
- [ ] Fix raw string scanning (same issue at line 869)
- [ ] Add regression test for large interpolated strings

### C2. Lexer: Regex Objects Compiled Every Call
- **File:** `src/lexer/lexer.js` lines 81, 88, 370, 381, 392, 848
- **Problem:** Unicode char classification (`/\p{Letter}/u`) and number scanning regexes are compiled fresh on every call inside hot loops.
- **Fix:** Extract to static class properties:
  ```js
  static UNICODE_LETTER_REGEX = /\p{Letter}/u;
  static UNICODE_ALPHANUM_REGEX = /[\p{Letter}\p{Number}\p{Mark}]/u;
  static HEX_DIGIT_REGEX = /[0-9a-fA-F_]/;
  static BINARY_DIGIT_REGEX = /[01_]/;
  static OCTAL_DIGIT_REGEX = /[0-7_]/;
  static REGEX_FLAG_REGEX = /[gimsuydv]/;
  ```
- **Impact:** Measurable slowdown on files with many identifiers/numbers.
- [ ] Extract unicode regex constants (lines 81, 88)
- [ ] Extract number scanning regex constants (lines 370, 381, 392)
- [ ] Extract regex flag regex constant (line 848)
- [ ] Extract JSX-area regex (line 182)

### C3. Codegen: `_containsRPC()` and `_exprReadsSignal()` Walk AST Repeatedly
- **File:** `src/codegen/client-codegen.js` lines 14-74, 677-720
- **Problem:** These 40-60 case AST walkers are called on every effect, pipe expression, and JSX expression — potentially thousands of times per component with no memoization.
- **Fix:** Memoize results using a WeakMap keyed by AST node. Walk once during component setup.
- **Impact:** Quadratic codegen time for complex components.
- [ ] Add `_rpcCache = new WeakMap()` and memoize `_containsRPC()`
- [ ] Add `_signalCache = new WeakMap()` and memoize `_exprReadsSignal()`
- [ ] Verify no mutation of AST nodes between calls

### C4. Parser: Expression Depth Double-Decrement Bug
- **File:** `src/parser/parser.js` lines 1473-1483
- **Problem:** When expression nesting exceeds the limit, depth counter is decremented twice (once in error path before throw, once in `finally`), permanently elevating the counter for rest of file.
- **Fix:** Check before increment:
  ```js
  parseExpression() {
    if (this._expressionDepth >= Parser.MAX_EXPRESSION_DEPTH) {
      this.error('Expression nested too deeply...');
    }
    this._expressionDepth++;
    try { return this.parsePipe(); }
    finally { this._expressionDepth--; }
  }
  ```
- **Impact:** Incorrect rejection of valid expressions after first depth error.
- [ ] Fix double-decrement
- [ ] Add test for depth recovery after error

### C5. LSP: Full Reparse on Every Keystroke
- **File:** `src/lsp/server.js` lines 211-332
- **Problem:** Every document change triggers complete lexer -> parser -> analyzer pipeline. No incremental parsing.
- **Fix:** Implement debounced validation with configurable delay. Consider line-range-based reparse for large files. At minimum, increase debounce or skip validation during rapid typing.
- **Impact:** 100+ ms delay for large files, poor typing experience.
- [ ] Add debounce (e.g. 200ms) before triggering validation
- [ ] Consider caching tokenized output and only re-lexing changed regions
- [ ] Profile validation time on large files to measure baseline

---

## HIGH PRIORITY (Performance Wins)

### H1. Generated Code: Range Expressions Create Full Arrays
- **File:** `src/codegen/base-codegen.js` lines 1919-1921
- **Problem:** `1..1000000` generates `Array.from({length: 999999}, (_, i) => 1 + i)` — allocates entire array eagerly.
- **Fix:** When used in `for` loop context, emit a simple for-loop instead. For standalone range, consider a generator-based helper or lazy range object.
- **Impact:** Range-heavy code allocates enormous arrays unnecessarily.
- [ ] Detect range in for-loop context and emit `for (let i = start; i <= end; i++)`
- [ ] For standalone range, emit stdlib `range()` function call (already exists)
- [ ] Add benchmark test comparing range implementations

### H2. Generated Code: Excessive IIFE Wrappers
- **File:** `src/codegen/base-codegen.js` line 829; `src/codegen/client-codegen.js` lines 1041, 1120, 1152, 1185
- **Problem:**
  - Every `??` operator creates IIFE for NaN-safety
  - Every component with computed props wrapped in IIFE
  - JSX for/if/match wraps even static (non-reactive) content in `() => { ... }`
- **Fix:**
  - For `??`: Only create IIFE when operands could be NaN (check if numeric context). Simple cases like `x ?? default` should use `x != null ? x : default`.
  - For JSX: Check `_exprReadsSignal()` before wrapping. Skip closure for static content.
- **Impact:** Prevents V8 inlining, adds GC pressure, bloats stack traces.
- [ ] Optimize `??` codegen for simple non-NaN cases
- [ ] Skip reactive wrapper for static JSX if/for/match content
- [ ] Skip IIFE for component props when no memoization needed

### H3. Parser: Sequential If-Checks in Postfix Parsing
- **File:** `src/parser/parser.js` lines 1715-1774
- **Problem:** `parsePostfix()` checks 5 token types sequentially every loop iteration even after a match. No `else if` or `continue`.
- **Fix:** Use `else if` chain or single token type lookup with `continue`:
  ```js
  while (true) {
    const type = this.current().type;
    if (type === TokenType.DOT) { /* ... */ continue; }
    else if (type === TokenType.QUESTION_DOT) { /* ... */ continue; }
    else if (type === TokenType.LBRACKET) { /* ... */ continue; }
    else if (type === TokenType.LPAREN) { /* ... */ continue; }
    else if (type === TokenType.QUESTION) { /* ... */ continue; }
    else break;
  }
  ```
- **Impact:** Every chained expression like `obj.a.b.c[0].method()` does 5x more work than needed.
- [ ] Convert to `else if` chain with `continue`
- [ ] Similarly optimize `parsePrimary()` (lines 1862-1978) to use switch

### H4. Server Codegen: Circuit Breaker Duplicated Per Peer
- **File:** `src/codegen/server-codegen.js` lines 514-599
- **Problem:** Full circuit breaker class (~30 lines) regenerated for every peer server instead of emitted once and instantiated.
- **Fix:** Emit a shared `class __CircuitBreaker { ... }` once at the top of generated server code, then instantiate `new __CircuitBreaker()` per peer.
- **Impact:** Generated server code bloat — 30 lines * N peers.
- [ ] Extract circuit breaker to single class emission
- [ ] Instantiate per peer with `new __CircuitBreaker(options)`
- [ ] Similarly check retry/RPC proxy for deduplication

### H5. Codegen: Scope Lookup is O(n) Per Identifier
- **File:** `src/codegen/base-codegen.js` lines 69-74
- **Problem:** `isDeclared()` linearly scans the scope stack on every identifier check.
- **Fix:** Maintain a single `Set` of all visible names at current depth. Push/pop to track entering/leaving scopes.
- **Impact:** Hot path in code generation — called for every identifier.
- [ ] Add `_visibleNames = new Set()` tracking
- [ ] Update on `pushScope()`/`popScope()`
- [ ] Replace linear scan with Set.has()

### H6. Analyzer: Return Path Analysis False Negative for Exhaustive Match
- **File:** `src/analyzer/analyzer.js` lines 2014-2019
- **Problem:** `_definitelyReturns()` for match expressions requires a wildcard pattern. An exhaustive match over all ADT variants (no wildcard needed) is NOT considered "definitely returns", causing false W205 warnings.
- **Fix:** In the `MatchExpression` case of `_definitelyReturns()`, also check `_isMatchExhaustive(node)`:
  ```js
  case 'MatchExpression': {
    const hasWildcard = node.arms.some(arm =>
      arm.pattern.type === 'WildcardPattern' ||
      (arm.pattern.type === 'BindingPattern' && !arm.guard));
    const isExhaustive = hasWildcard || this._isMatchExhaustive(node);
    if (!isExhaustive) return false;
    return node.arms.every(arm => this._definitelyReturns(arm.body));
  }
  ```
- **Impact:** False warnings on correct code using exhaustive pattern matching.
- [ ] Implement exhaustive match check in return path analysis
- [ ] Add test case for exhaustive match without wildcard

### H7. Parser: Comparison Operators Use `array.some()`
- **File:** `src/parser/parser.js` line 1557
- **Problem:** `compOps.some(op => this.check(op))` iterates through the array on every comparison. Creates closure each time.
- **Fix:** Use a pre-built Set:
  ```js
  static COMPARISON_OPS = new Set([TokenType.LESS, TokenType.LESS_EQUAL,
    TokenType.GREATER, TokenType.GREATER_EQUAL, TokenType.EQUAL, TokenType.NOT_EQUAL]);
  // Then: if (Parser.COMPARISON_OPS.has(this.current().type)) { ... }
  ```
- [ ] Extract comparison operators to static Set
- [ ] Use `Set.has()` instead of `array.some()`

---

## MEDIUM PRIORITY (Quality & Correctness)

### M1. Analyzer: Type Checking Allocates Sets in Hot Paths
- **File:** `src/analyzer/analyzer.js` lines 2205, 2213, 2224
- **Problem:** `['-', '*', '/', '%', '**'].includes(op)` and `new Set(['Int', 'Float'])` allocated on every binary expression check.
- **Fix:** Extract to module-level constants:
  ```js
  const ARITHMETIC_OPS = new Set(['-', '*', '/', '%', '**']);
  const NUMERIC_TYPES = new Set(['Int', 'Float']);
  ```
- [ ] Extract operator sets to module-level constants
- [ ] Extract type sets to module-level constants

### M2. Stdlib: Regex Compilation on Every Call
- **File:** `src/stdlib/inline.js` ~line 340
- **Problem:** `regex_match()` creates `new RegExp(pattern, flags)` every call. Expensive for repeated calls with same pattern.
- **Fix:** Add regex cache:
  ```js
  const __regexCache = new Map();
  function regex_match(s, pattern, flags) {
    const key = pattern + ':' + (flags || '');
    let re = __regexCache.get(key);
    if (!re) { re = new RegExp(pattern, flags); __regexCache.set(key, re); }
    // ... use re
  }
  ```
- [ ] Add `__regexCache` Map
- [ ] Cache in `regex_match()`, `regex_capture()`, `regex_replace()`
- [ ] Add cache size limit (e.g. 1000 entries)

### M3. Runtime: Transition Promise Can Leak
- **File:** `src/runtime/reactivity.js` lines 1031-1046
- **Problem:** If `applyLeaveTransition()` Promise never resolves (e.g., error), the node reference stays alive indefinitely. No `.catch()` handler.
- **Fix:** Add `.catch()` fallback:
  ```js
  applyLeaveTransition(el, el.__tovaTransition)
    .then(() => { disposeNode(el); if (el.parentNode) el.parentNode.removeChild(el); })
    .catch(() => { disposeNode(el); if (el.parentNode) el.parentNode.removeChild(el); });
  ```
- [ ] Add `.catch()` handler for transition cleanup
- [ ] Add timeout fallback for transitions that never complete

### M4. Runtime: Positional Reconciliation Patches Identical Vnodes
- **File:** `src/runtime/reactivity.js` lines 1554-1581
- **Problem:** No identity check before patching — even unchanged children get processed.
- **Fix:** Add identity check at top of patch loop:
  ```js
  if (oldNodes[i] && oldNodes[i] === newChildren[i]) continue;
  ```
- [ ] Add vnode identity check in positional patching
- [ ] Benchmark improvement on static lists

### M5. CLI: Full Cache Flush on Any File Change
- **File:** `bin/tova.js` line 845
- **Problem:** Watch mode clears entire compilation cache when any `.tova` file changes.
- **Fix:** Only invalidate changed file and its dependents. Build a dependency graph during compilation.
- [ ] Track file dependency graph during `compileWithImports()`
- [ ] On change, only invalidate changed file + transitive dependents
- [ ] Keep unchanged files in cache

### M6. CLI: Module Type Detection Uses Regex Heuristic
- **File:** `bin/tova.js` lines 3020-3033
- **Problem:** `getCompiledExtension()` uses regex to detect block keywords. Can false-match on comments or strings.
- **Fix:** Use the already-parsed AST to determine if file contains `shared`/`server`/`client` blocks.
- [ ] Replace regex heuristic with AST-based detection
- [ ] Cache result per file

### M7. Analyzer: Type Candidate Ambiguity in Exhaustive Match
- **File:** `src/analyzer/analyzer.js` line 1857
- **Problem:** When multiple types share variant names, `candidates.length !== 1` so no exhaustiveness warning is produced.
- **Fix:** When the match subject has a known type (from parameter annotation or inference), use that type directly instead of candidate search.
- [ ] Check subject's inferred type first
- [ ] Fall back to candidate search only when type unknown
- [ ] Add test for types with shared variant names

### M8. Analyzer: Generic Type Parsing Not Cached
- **File:** `src/analyzer/analyzer.js` lines 565-585
- **Problem:** `_parseGenericType()` re-parses `Result<Int, String>` on each compatibility check. Called for every function argument type comparison.
- **Fix:** Add `_parseCache = new Map()` in analyzer constructor. Cache parsed results.
- [ ] Add parse cache Map
- [ ] Cache in `_parseGenericType()`
- [ ] Clear cache between files

### M9. Codegen: `_containsPropagate()` Walks AST Multiple Times
- **File:** `src/codegen/base-codegen.js` lines 155-172
- **Problem:** Called in `genFunctionDeclaration()`, then again in `genBlockBody()`, then again for implicit return detection. No memoization.
- **Fix:** Cache result on AST node or use WeakMap.
- [ ] Add WeakMap cache for `_containsPropagate()`
- [ ] Add WeakMap cache for `_containsYield()`

### M10. Codegen: Source Map Overhead Even When Not Needed
- **File:** `src/codegen/base-codegen.js` lines 88-114
- **Problem:** `_countLines()` loop called after every statement. Counts newlines character-by-character even when source maps aren't requested.
- **Fix:** Gate source map logic behind a flag. Only compute line counts when source maps are enabled.
- [ ] Add `_sourceMapsEnabled` flag
- [ ] Skip `_addMapping()` and `_countLines()` when disabled
- [ ] Default to enabled for production builds, disabled for REPL/check

---

## LOWER PRIORITY (Maintainability & Polish)

### L1. Lexer: Escape Sequence Logic Duplicated 3 Times
- **File:** `src/lexer/lexer.js` lines 456-464, 590-598, 788-794
- **Problem:** Three identical switch statements for escape sequences.
- **Fix:** Extract to `_processEscapeChar(esc)` method.
- [ ] Create `_processEscapeChar()` method
- [ ] Replace all three occurrences

### L2. Lexer: JSX Value Types Array Repeated 3 Times
- **File:** `src/lexer/lexer.js` lines 102-105, 1076-1078
- **Problem:** Same array of value-producing token types checked in 3 places. If new token types added, all must be updated.
- **Fix:** Extract to `static VALUE_TOKEN_TYPES = new Set([...])` with `static isValueToken(type)` method.
- [ ] Create static Set constant
- [ ] Replace all occurrences with Set.has()

### L3. Lexer: JSX Control-Flow Keywords Array Created 3 Times
- **File:** `src/lexer/lexer.js` lines 247, 281, 305
- **Problem:** `['if', 'for', 'elif', 'else', 'match'].includes(word)` creates array literal each time.
- **Fix:** `static JSX_CF_KEYWORDS = new Set(['if', 'for', 'elif', 'else', 'match'])`
- [ ] Extract to static Set
- [ ] Replace all 3 occurrences

### L4. Lexer: Number Exponent Backtracking Doesn't Save Line
- **File:** `src/lexer/lexer.js` lines 419-434
- **Problem:** Backtracking saves `pos` and `column` but not `line`. If exponent sign crosses a line boundary (extremely rare), line count is incorrect.
- **Fix:** Add `const savedLine = this.line;` and restore it on backtrack.
- [ ] Save/restore line number

### L5. Parser: Cache EOF Token in Constructor
- **File:** `src/parser/parser.js` lines 39-50
- **Problem:** `this.tokens[this.tokens.length - 1]` computed in 3 methods (`current()`, `peek()`, `advance()`).
- **Fix:** Cache in constructor: `this._eof = this.tokens[this.tokens.length - 1]`
- [ ] Cache EOF token
- [ ] Use in current(), peek(), advance()

### L6. Parser: JSX Destructure Patterns Stored as Strings
- **File:** `src/parser/client-parser.js` lines 397-471
- **Problem:** JSX for-loop destructure patterns built as strings (`[${elements.join(', ')}]`) rather than AST nodes. Codegen must re-parse these strings.
- **Fix:** Create AST pattern nodes directly (ObjectPattern/ArrayPattern).
- [ ] Replace string-based pattern with AST nodes
- [ ] Update client codegen to handle AST patterns

### L7. CLI: Fallback Minifier Too Simple
- **File:** `bin/tova.js` lines 2892-2902
- **Problem:** `_simpleMinify()` only strips comments and collapses whitespace. No dead code elimination or identifier shortening.
- **Fix:** Consider using Bun.build as primary and warn when it's not available, or implement basic identifier mangling.
- [ ] Improve fallback minifier or require Bun.build
- [ ] Add tree-shaking for unused exports

### L8. CLI: Test Temp Directory Not Cleaned Up
- **File:** `bin/tova.js` line 316
- **Problem:** `.tova-test-out` temp directory not cleaned after tests complete in non-watch mode.
- **Fix:** Add cleanup in finally block after test execution.
- [ ] Add cleanup for `.tova-test-out` after tests
- [ ] Similarly clean bench temp directories

### L9. Runtime: Style Object Updates Iterate All Properties
- **File:** `src/runtime/reactivity.js` lines 1319-1328
- **Problem:** Iterates all `el.style` properties on every update to find removed properties.
- **Fix:** Track previous style object reference for delta updates:
  ```js
  if (el.__prevStyle) {
    for (const prop of Object.keys(el.__prevStyle)) {
      if (!(prop in val)) el.style.removeProperty(prop);
    }
  }
  el.__prevStyle = { ...val };
  Object.assign(el.style, val);
  ```
- [ ] Track previous style for delta updates

### L10. Runtime: Double RAF in Transition Animations
- **File:** `src/runtime/reactivity.js` lines 879-881
- **Problem:** Two nested `requestAnimationFrame` calls. Could use forced reflow instead.
- **Fix:** Replace with `el.offsetHeight` forced reflow between style applications.
- [ ] Replace double RAF with forced reflow pattern

### L11. Stdlib: CSV Parser Regex Per-Cell
- **File:** `src/stdlib/inline.js` ~line 237
- **Problem:** `parseLine` function defined inside outer function (recreated each call). Numeric detection regex compiled per-cell.
- **Fix:** Hoist `parseLine` and pre-compile regex patterns.
- [ ] Hoist inner functions
- [ ] Pre-compile numeric detection regexes

### L12. Server Codegen: JWT Verification Uses Manual XOR
- **File:** `src/codegen/server-codegen.js` lines 871-892
- **Problem:** Manual XOR loop for constant-time comparison instead of `crypto.timingSafeEqual()`.
- **Fix:** Use `crypto.timingSafeEqual()` or `crypto.subtle.verify()` in generated code.
- [ ] Replace manual XOR with `timingSafeEqual()`

### L13. Server Codegen: Rate Limit Cleanup Memory Leak
- **File:** `src/codegen/server-codegen.js` lines 935-942
- **Problem:** Cleanup runs every 60s but only removes entries with no timestamps. Entries with empty timestamp arrays stay in map forever.
- **Fix:** Also check `entry.timestamps.length === 0`.
- [ ] Fix cleanup predicate to remove empty-timestamp entries

### L14. Server Codegen: Env Validation Shows Only First Error
- **File:** `src/codegen/server-codegen.js` lines 313-349
- **Problem:** `process.exit(1)` called after first missing env var. Other missing vars not reported.
- **Fix:** Collect all errors, show all, then exit.
- [ ] Collect all env validation errors before exiting

### L15. Analyzer: Symbol Usage Tracking in Annotations
- **File:** `src/analyzer/analyzer.js` line 1647
- **Problem:** Type annotations count as "usage", suppressing unused variable warnings.
- **Fix:** Only mark `used = true` in expression/statement context, not type annotations.
- [ ] Add context flag to `visitExpression()` for annotation vs. runtime usage
- [ ] Only set `used = true` for runtime usage

### L16. LSP: Naive Reference Search
- **File:** `src/lsp/server.js` lines 1560-1587
- **Problem:** Uses regex word matching with no scope awareness. Finds ALL occurrences, not just same symbol.
- **Fix:** Use analyzer scope information for accurate reference resolution.
- [ ] Integrate scope-aware symbol lookup for references
- [ ] Distinguish same-scope vs cross-scope references

---

## NICE-TO-HAVE (Future Optimization)

### N1. Analyzer: Levenshtein Suggestions Are Expensive
- **File:** `src/analyzer/analyzer.js` lines 1662-1685
- **Problem:** O(candidates * name.length^2) for each undefined variable. 170+ builtins + all scope symbols.
- **Fix:** Pre-build sorted candidate list at analyze start. Use early exit (skip if length difference > maxDist).
- [ ] Pre-build candidate set once
- [ ] Add early exit for length mismatch (already partially done)

### N2. Analyzer: Scope Position Lookup is Linear
- **File:** `src/analyzer/scope.js` lines 73-96
- **Problem:** `findScopeAtPosition()` linearly searches all child scopes. Impacts LSP go-to-definition.
- **Fix:** Sort scopes by line number and use binary search.
- [ ] Build sorted scope index after analysis
- [ ] Use binary search for position-based lookup

### N3. Runtime: Computed Graph Redundant Recomputation
- **File:** `src/runtime/reactivity.js` lines 277-287
- **Problem:** Calling `sub()` on computed subscribers during signal update causes immediate recomputation. Multiple signal updates before effect flush cause redundant work.
- **Fix:** Mark dirty instead of immediate recompute. Defer recomputation to read time.
- [ ] Replace `sub()` call with `sub._needsRecompute = true`
- [ ] Recompute lazily on next read

### N4. Runtime: SSR Streaming Buffer Optimization
- **File:** `src/runtime/ssr.js` lines 302-340
- **Problem:** Each `controller.enqueue()` call sends a tiny string chunk. No batching.
- **Fix:** Add `BufferedController` wrapper that batches to ~1KB chunks before sending.
- [ ] Implement BufferedController with configurable buffer size
- [ ] Flush on stream close

### N5. Stdlib: Table Chaining Creates Intermediate Arrays
- **File:** `src/stdlib/inline.js` ~line 164
- **Problem:** `.where().select().limit()` creates multiple intermediate arrays.
- **Fix:** Consider lazy evaluation for table operations.
- [ ] Design lazy table API
- [ ] Implement as Seq-based chaining

### N6. CLI: Incremental LSP Parsing
- **File:** `src/lsp/server.js`
- **Problem:** Full document sync (change: 1). No incremental sync support.
- **Fix:** Implement incremental text document sync (change: 2) with line-range tracking.
- [ ] Switch to incremental sync mode
- [ ] Track changed ranges
- [ ] Only re-lex/parse changed regions

---

## Summary Stats

| Priority | Count | Description |
|----------|-------|-------------|
| CRITICAL | 5 | Bugs and severe performance issues |
| HIGH | 7 | Significant performance wins |
| MEDIUM | 10 | Quality, correctness, moderate perf |
| LOWER | 16 | Maintainability, polish, minor fixes |
| NICE-TO-HAVE | 6 | Future optimization opportunities |
| **TOTAL** | **44** | |

## Implementation Order Recommendation

1. **Session 1:** C1-C4 (lexer/parser critical fixes) — fast, contained changes
2. **Session 2:** C5, H3, H5, H7 (parser/codegen perf) — compilation speed
3. **Session 3:** H1, H2 (generated code quality) — runtime performance
4. **Session 4:** H4, H6, M1-M3 (codegen/analyzer) — correctness + perf
5. **Session 5:** M4-M10 (medium priority batch)
6. **Session 6+:** Lower priority items as time permits
