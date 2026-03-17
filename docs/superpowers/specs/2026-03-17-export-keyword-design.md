# Export Keyword & Post-Declaration Exports

## Summary

Add `export` as a full synonym for `pub`, plus two new capabilities: post-declaration named export lists (`export { foo, bar }`) and default exports (`export default`).

## Motivation

JavaScript developers expect `export` to work. Currently only `pub` is available. Adding `export` as an alias lowers the learning curve while preserving Tova's identity (`pub` remains valid).

## Syntax

### Existing (unchanged)

```tova
pub fn add(a, b) { a + b }
pub type Color { Red, Green, Blue }
pub x = 42
pub { add, subtract } from "./math"
pub * from "./utils"
```

### New: `export` as alias for `pub`

```tova
export fn add(a, b) { a + b }
export type Color { Red, Green, Blue }
export x = 42
export { add, subtract } from "./math"
export * from "./utils"
export async fn fetch_data() { ... }
```

### New: Post-declaration named exports (both keywords)

```tova
fn add(a, b) { a + b }
fn subtract(a, b) { a - b }

pub { add, subtract }
export { add, subtract }
export { add as addition, subtract as sub }
```

### New: Default exports

```tova
export default fn main() { "hello" }
export default config
```

## Implementation

### 1. Lexer

`EXPORT` token already exists. `DEFAULT` does NOT — must be added as a **contextual keyword**.

**File**: `src/lexer/tokens.js`
- Add `DEFAULT: 'DEFAULT'` to TokenType
- Add `'default': TokenType.DEFAULT` to Keywords map

**Contextual keyword handling**: `default` becomes a reserved word. This is acceptable — it is not currently used as a variable name in Tova codebases, and matches JS reserved word semantics. The codegen emits `default` in JS output (e.g., edge-codegen `export default {`), but that is generated JS, not Tova source, so no conflict.

### 2. Parser

**File**: `src/parser/parser.js`

**Route EXPORT to parsePubDeclaration:**
- In `parseStatement()` (~line 551): add `if (this.check(TokenType.EXPORT)) return this.parsePubDeclaration();`
- Add `TokenType.EXPORT` to both `_synchronize()` (~line 112) and `_synchronizeBlock()` (~line 163) error recovery token lists
- `parseTopLevel()` falls through to `parseStatement()` so no separate handling needed there

**Update parsePubDeclaration:**
- Track which keyword was consumed: `const keyword = this.current().type;` before `this.advance()`
- Update duplicate check: `if (this.check(TokenType.PUB) || this.check(TokenType.EXPORT))` — this fires BEFORE any recursive `parseStatement()` call, preventing infinite loops
- After consuming keyword, check for `DEFAULT` (only valid when `keyword === TokenType.EXPORT`; if `keyword === TokenType.PUB`, emit error: "Use 'export default', not 'pub default'")
- After consuming keyword, check for `{ ... }` without `from` via `_looksLikeExportList()` — applies to BOTH `pub` and `export`
- Re-export check (`_looksLikeReExport`) runs first (checks for `from` after `}`); export list check runs second (no `from` after `}`)

**New methods:**
- `_looksLikeExportList()`: peeks for `{ ident [as ident], ... }` where `}` is NOT followed by `from`. No ambiguity with destructuring — `pub`/`export` keyword has already been consumed, so `export { a, b }` cannot be a destructuring assignment.
- `parseExportList(loc)`: parses `{ name, name as alias }` into `ExportList` node
- `export default` parsing: consumes DEFAULT, then calls `parseStatement()` to get the value. Wraps in `ExportDefault` node. The inner statement's `isPublic` is NOT set (the `ExportDefault` wrapper handles export semantics).

**Update parseReExport error messages:**
- Line 650: change `"Expected 'from' after 'pub *'"` to `"Expected 'from' after '*'"` (keyword-agnostic)

**Restriction: `export default type` is a parser error.**
`export default` followed by `TypeDeclaration` emits: "Cannot use 'export default' with type declarations. Use 'export type' instead." Reason: type declarations generate multiple JS statements, incompatible with `export default`.

**Restriction: module-level only.**
`ExportDefault` and `ExportList` nodes are only valid at module level. Inside `server {}`, `browser {}`, or `edge {}` blocks, these produce a parser error: "`export default` / `export { }` is only valid at module level." Implementation: `parsePubDeclaration` can check `this._blockContext` or similar scope tracking.

**File**: `src/parser/ast.js`

New AST nodes:
- `ExportDefault(value, loc)` — value is a FunctionDeclaration or expression node
- `ExportList(specifiers, loc)` — specifiers: `[{local, exported}]` (same shape as ReExportSpecifier but no source)

### 3. Codegen

**File**: `src/codegen/base-codegen.js`

**New cases in generate() switch:**
- `'ExportDefault'` → `genExportDefault(node)`
- `'ExportList'` → `genExportList(node)`

**genExportDefault(node):**
- Check `node.value.type`:
  - `'FunctionDeclaration'` → generate function body, emit `export default function name(...) { ... }` (do NOT set `isPublic` on the inner node to avoid double `export`)
  - Any other type → call `genExpression(node.value)` and emit `export default <expr>;`

**genExportList(node):**
- Emit `export { name1, name2 as alias };`

No changes to existing `isPublic` codegen — `pub fn` and `export fn` both set `isPublic = true` via the same `parsePubDeclaration` path.

### 4. Analyzer

**File**: `src/analyzer/analyzer.js`

**Add cases to `visitNode` switch:**
- `case 'ExportDefault':` → `visitExportDefault(node)`
- `case 'ExportList':` → `visitExportList(node)`

**visitExportDefault(node):**
- Visit `node.value` normally (recurse into inner statement/expression)
- Track default export on module scope; warn on duplicate (`W_DUPLICATE_DEFAULT_EXPORT`)

**visitExportList(node):**
- For each specifier, look up `specifier.local` in current scope
- If not found, emit undefined identifier warning
- If found, mark symbol as `isPublic = true` to suppress unused-variable warnings

### 5. collectExports() Update

**File**: `bin/tova.js` (or wherever `collectExports()` lives)

Add handling for new AST nodes:
- `ExportDefault` → add `'default'` to `publicExports` set
- `ExportList` → add each `specifier.exported` name to `publicExports` set

Without this, cross-file import validation would not recognize names exported via these new patterns.

### 6. Supporting Changes

**LSP** (`src/lsp/server.js`):
- Add `export` and `default` to keyword completions

**TextMate grammar** (`editors/vscode/syntaxes/tova.tmLanguage.json`):
- Add `export` and `default` as keywords

### 7. Error Cases

| Input | Error |
|---|---|
| `pub default fn foo()` | "Use 'export default', not 'pub default'" |
| `export export fn` | "Duplicate visibility modifier" |
| `pub export fn` / `export pub fn` | "Duplicate visibility modifier" |
| `export { undeclared }` | Undefined identifier warning |
| Two `export default` in one module | `W_DUPLICATE_DEFAULT_EXPORT` |
| `export default type Foo { A, B }` | "Cannot use 'export default' with type declarations. Use 'export type' instead." |
| `export default` inside server/browser/edge block | "`export default` is only valid at module level" |
| `export { a, b }` inside server/browser/edge block | "`export { }` is only valid at module level" |

### 8. Tests

New file: `tests/export-keyword.test.js`

Coverage:
- Parser: `export fn`, `export type`, `export x = 10` produce same AST as `pub` equivalents
- Parser: `export async fn` works correctly
- Parser: `export { a, b }` and `pub { a, b }` post-declaration lists (both keywords)
- Parser: `export { a as b }` aliased post-declaration exports
- Parser: `export default fn`, `export default expr`
- Parser: `export { a } from "mod"` and `export * from "mod"` re-exports
- Codegen: JS output for all new patterns
- Codegen: `export default fn` produces `export default function ...`
- Codegen: `export default expr` produces `export default expr;`
- Codegen: `export { a, b as c }` produces `export { a, b as c };`
- Analyzer: error cases (duplicate modifiers, `pub default`, undefined names in export list)
- Analyzer: `W_DUPLICATE_DEFAULT_EXPORT` for two default exports
- Analyzer: `export default type` error
- Analyzer: `export default` / `export { }` inside server/browser/edge blocks error
- Integration: mixed `pub` and `export` in same file
- Error recovery: EXPORT token in `_synchronize` lists

## Non-Goals

- No `import type` additions
- No changes to existing import syntax
- No deprecation of `pub` — both keywords coexist permanently
