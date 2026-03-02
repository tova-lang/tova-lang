# CSS & Design System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 7 compiler-level CSS features — theme tokens, $token syntax, variant styles, animate blocks, responsive breakpoints, auto reduced-motion, and component-scoped fonts — to Tova's browser block.

**Architecture:** The `theme {}` block is a new top-level plugin (parser + AST + registry + analyzer + codegen). All other features extend the existing browser-codegen CSS pipeline (`_scopeCSS`, `generateComponent`) and the lexer's raw CSS capture. The `animate {}` block is component-scoped (parsed inside component bodies by browser-parser). No new runtime dependencies except a small `__tova_load_font()` function in reactivity.js.

**Tech Stack:** Bun test runner, existing Tova compiler pipeline (lexer, parser, analyzer, codegen)

**Design doc:** `docs/plans/2026-03-01-css-design-system-design.md`

---

## Task 1: `theme {}` — AST & Parser

**Files:**
- Create: `src/parser/theme-ast.js`
- Create: `src/parser/theme-parser.js`
- Modify: `src/parser/ast.js:67` (add ThemeBlock export)
- Create: `src/registry/plugins/theme-plugin.js`
- Modify: `src/registry/register-all.js:15-27` (register themePlugin)
- Test: `tests/theme-block.test.js`

**Step 1: Write the failing test**

Create `tests/theme-block.test.js` with tests for:
- Empty theme block parsing
- Colors section with simple tokens
- Dot-notation token names (primary.hover)
- Numeric values (spacing, radius)
- Font section with string and numeric values
- Breakpoints section
- Transition section
- Dark section as flat overrides
- Shadow section with complex string values
- Full theme block with all sections
- Theme coexisting with browser block

**Step 2: Run test to verify it fails**

Run: `bun test tests/theme-block.test.js`
Expected: FAIL — ThemeBlock not defined

**Step 3: Create AST nodes**

Create `src/parser/theme-ast.js` with three classes:
- `ThemeBlock(sections, darkOverrides, loc)` — type: 'ThemeBlock'
- `ThemeSection(name, tokens, loc)` — type: 'ThemeSection', name is 'colors'|'spacing'|'radius'|'shadow'|'font'|'breakpoints'|'transition'
- `ThemeToken(name, value, loc)` — type: 'ThemeToken', name is dot-separated string, value is string or number

**Step 4: Create theme parser**

Create `src/parser/theme-parser.js` with `installThemeParser(ParserClass)` following the standard plugin pattern:
- Guard: `_themeParserInstalled` flag
- `parseThemeBlock()` — consumes 'theme' identifier, LBRACE, loops sections
- Each section: identifier name, LBRACE, loop tokens, RBRACE
- `dark` section produces flat overrides (e.g., `colors.surface: "#0f172a"`)
- `_parseThemeToken()` — dot-separated name (IDENTIFIER DOT IDENTIFIER...), COLON, STRING or NUMBER value

**Step 5: Add ThemeBlock to ast.js exports**

Add re-export to `src/parser/ast.js` after EdgeBlock (line ~74):
```javascript
export { ThemeBlock, ThemeSection, ThemeToken } from './theme-ast.js';
```

**Step 6: Create theme plugin and register**

Create `src/registry/plugins/theme-plugin.js`:
- `name: 'theme'`, `astNodeType: 'ThemeBlock'`
- `detection: { strategy: 'identifier', identifierValue: 'theme' }`
- `parser: { install: installThemeParser, installedFlag: '_themeParserInstalled', method: 'parseThemeBlock' }`
- `analyzer: { visit: (analyzer, node) => analyzer.visitThemeBlock(node), noopNodeTypes: ['ThemeSection', 'ThemeToken'] }`

Register in `src/registry/register-all.js` — import and add `BlockRegistry.register(themePlugin)`.

**Step 7: Add stub analyzer**

Add `visitThemeBlock(node) {}` stub to `src/analyzer/analyzer.js` near other visit methods.

**Step 8: Run test to verify it passes**

Run: `bun test tests/theme-block.test.js`
Expected: PASS

**Step 9: Run existing tests for regressions**

Run: `bun test`
Expected: All existing tests pass

**Step 10: Commit**

```
feat: add theme {} block parser and AST nodes
```

---

## Task 2: `theme {}` — Analyzer Validation

**Files:**
- Modify: `src/analyzer/analyzer.js` (flesh out `visitThemeBlock`)
- Modify: `tests/theme-block.test.js` (add analyzer tests)

**Step 1: Write the failing tests**

Add analyzer tests for:
- `W_UNKNOWN_THEME_SECTION` — warns on unknown section name
- `W_DUPLICATE_THEME_SECTION` — warns on duplicate section
- `W_DUPLICATE_THEME_TOKEN` — warns on duplicate token within section
- `W_MULTIPLE_THEME_BLOCKS` — warns on multiple theme blocks
- No warnings on valid theme
- `W_DARK_OVERRIDE_UNKNOWN_SECTION` — warns on dark override referencing unknown section

**Step 2: Run tests to verify they fail**

**Step 3: Implement visitThemeBlock**

Replace stub with full validation:
- Track `_themeBlockSeen` flag for multiple-block detection
- Validate section names against `VALID_THEME_SECTIONS` set (colors, spacing, radius, shadow, font, breakpoints, transition)
- Check duplicate sections via Set
- Check duplicate tokens within each section via Set
- Validate dark overrides: split on first dot, check section name exists
- Store tokens on `this._themeTokens` Map (category -> Set of names) for later $token validation
- Set `this._hasThemeBlock = true` flag

Category mapping for token storage: `colors` -> `color`, `spacing` -> `spacing`, `radius` -> `radius`, `shadow` -> `shadow`, `font` -> `font`, `breakpoints` -> `breakpoint`, `transition` -> `transition`

**Step 4: Run tests, verify pass**

**Step 5: Run full test suite**

**Step 6: Commit**

```
feat: theme block analyzer validation
```

---

## Task 3: `theme {}` — Codegen (CSS Custom Properties)

**Files:**
- Create: `src/codegen/theme-codegen.js`
- Modify: `src/codegen/codegen.js:87-96` (collect themeBlocks, pass themeConfig)
- Modify: `src/codegen/browser-codegen.js:190` (accept themeConfig, emit theme CSS)
- Modify: `tests/theme-block.test.js` (add codegen tests)

**Step 1: Write the failing tests**

Add codegen tests for:
- CSS custom properties for colors (`:root { --tova-color-primary: #3b82f6; }`)
- Spacing tokens with px units (`--tova-spacing-sm: 8px`)
- Radius tokens with px units
- Font size tokens with px units, font family without px
- Dot-notation flattens to dashes (`primary.hover` -> `primary-hover`)
- Shadow tokens without modification
- Transition tokens without modification
- Dark mode overrides in `@media (prefers-color-scheme: dark)`
- Breakpoints as CSS custom properties (no px suffix)
- Theme CSS emitted via `tova_inject_css`

**Step 2: Run tests to verify they fail**

**Step 3: Create theme codegen**

Create `src/codegen/theme-codegen.js` with `ThemeCodegen` class:
- `static mergeThemeBlocks(themeBlocks)` — merges sections and darkOverrides into config object
- `static generateCSS(themeConfig)` — generates `:root { ... }` + dark mode `@media` query
- `static _formatValue(sectionName, tokenName, value)` — appends `px` for spacing/radius/font.size.* numeric values
- Category mapping: `colors`->`color`, etc. Same as analyzer.

**Step 4: Wire into codegen.js**

In `src/codegen/codegen.js`:
- Add lazy loader for ThemeCodegen (same pattern as `getSecurityCodegen`)
- After convenience aliases (~line 96): `const themeBlocks = getBlocks('theme');`
- After securityConfig merge (~line 172): merge themeConfig if themeBlocks exist
- Pass themeConfig as 6th arg to browser codegen `gen.generate()`

**Step 5: Wire into browser-codegen.js**

- Add themeConfig as 6th parameter to `generate()` method signature
- Store as `this._themeConfig = themeConfig`
- Import ThemeCodegen at top of file
- After stdlib placeholder (~line 234): if themeConfig exists, generate CSS and emit `tova_inject_css("__tova_theme", css)`

**Step 6: Run tests, verify pass**

**Step 7: Run full test suite**

**Step 8: Commit**

```
feat: theme block codegen — CSS custom properties + dark mode
```

---

## Task 4: `$token` Syntax — Token Resolution in Style Blocks

**Files:**
- Modify: `src/codegen/browser-codegen.js` (add `_resolveTokens()`, call from `generateComponent`)
- Test: `tests/css-tokens.test.js`

**Step 1: Write the failing tests**

Create `tests/css-tokens.test.js` with tests for:
- `$color.primary` -> `var(--tova-color-primary)`
- `$spacing.md` -> `var(--tova-spacing-md)`
- `$font.size.lg` -> `var(--tova-font-size-lg)` (dots to dashes)
- `$shadow.md` resolves correctly
- `$radius.full` resolves correctly
- `$transition.normal` resolves correctly
- Multiple tokens in one property (`$spacing.sm $spacing.md`)
- Token mixed with regular CSS (`1px solid $color.primary`)
- Tokens work without theme block (emits var anyway)

**Step 2: Run tests to verify they fail**

**Step 3: Implement `_resolveTokens()`**

Add to BrowserCodegen class:
- `TOKEN_CATEGORY_MAP` static property mapping category names
- `_resolveTokens(css)` method using regex `\$(\w+)\.([\w.]+)` to replace with `var(--tova-prefix-name-with-dashes)`

**Step 4: Call in generateComponent CSS pipeline**

In `generateComponent()` around line 600, insert `_resolveTokens()` call between raw CSS collection and `_scopeCSS`:

```javascript
const rawCSS = styleBlocks.map(s => s.css).join('\n');
const resolvedCSS = this._resolveTokens(rawCSS);  // NEW
const scopeId = this._genScopeId(comp.name, rawCSS);
this._currentScopeId = scopeId;
const scopedCSS = this._scopeCSS(resolvedCSS, `[data-tova-${scopeId}]`);
```

**Step 5: Run tests, verify pass**

**Step 6: Run full test suite**

**Step 7: Commit**

```
feat: $token syntax — resolve design tokens to CSS var() references
```

---

## Task 5: `$token` — Analyzer Validation

**Files:**
- Modify: `src/analyzer/analyzer.js` — add `_validateStyleTokens()`, `_findClosestMatch()`, `_levenshtein()`
- Modify: `tests/css-tokens.test.js` (add analyzer tests)

**Step 1: Write the failing tests**

Add analyzer tests for:
- `W_UNKNOWN_THEME_TOKEN` — warns on unknown token with typo suggestion
- `W_UNKNOWN_THEME_CATEGORY` — warns on unknown category name
- No warning for valid token references
- No warning when no theme block exists (tokens pass through)

**Step 2: Implement `_validateStyleTokens()`**

- Scan CSS string for `$category.name` patterns using regex
- Cross-reference against `this._themeTokens` Map (populated by `visitThemeBlock`)
- If category unknown: emit `W_UNKNOWN_THEME_CATEGORY`
- If token unknown in category: emit `W_UNKNOWN_THEME_TOKEN` with Levenshtein suggestion
- Skip validation entirely if `!this._hasThemeBlock`

Wire into `visitNode` — add case for `ComponentStyleBlock` that calls both `_validateStyleTokens` and (later) `_validateResponsiveBreakpoints`.

Check if `_levenshtein` already exists in analyzer — if so, reuse it.

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```
feat: compile-time validation for $token references with typo suggestions
```

---

## Task 6: `responsive {}` — Parse & Generate Named Breakpoints

**Files:**
- Modify: `src/codegen/browser-codegen.js` (add `_extractResponsive()`, `_getBreakpoints()`)
- Test: `tests/responsive-styles.test.js`

**Step 1: Write the failing tests**

Create `tests/responsive-styles.test.js` with tests for:
- Mobile breakpoint (0) emits without media query wrapper
- Tablet breakpoint emits `@media (min-width: 768px)`
- Multiple breakpoints emit in ascending order
- Selectors inside responsive are scoped with `[data-tova-x]`
- Works with default breakpoints when no theme block
- Works with `$token` references inside responsive blocks

**Step 2: Implement `_extractResponsive()`**

Add two methods to BrowserCodegen:
- `_extractResponsive(css)` — finds `responsive { ... }` block, extracts breakpoint sub-blocks, returns `{ baseCss, responsiveBlocks: [{name, css, value}] }`
- `_getBreakpoints()` — reads from `this._themeConfig.sections.get('breakpoints')` or falls back to `DEFAULT_BREAKPOINTS`
- `DEFAULT_BREAKPOINTS` static: `{ mobile: 0, tablet: 768, desktop: 1024, wide: 1440 }`

**Step 3: Wire into generateComponent CSS pipeline**

After token resolution, before scoping:
1. `_extractResponsive(resolvedCSS)` -> `{ baseCss, responsiveBlocks }`
2. Scope baseCss normally with `_scopeCSS`
3. Sort responsiveBlocks by breakpoint value ascending
4. For each block: scope its CSS, wrap in `@media (min-width: Npx)` (skip wrapper for value 0)
5. Append to scopedCSS

**Step 4: Run tests, verify pass**

**Step 5: Run full test suite**

**Step 6: Commit**

```
feat: responsive {} blocks with named breakpoints in style blocks
```

---

## Task 7: `responsive {}` — Analyzer Validation

**Files:**
- Modify: `src/analyzer/analyzer.js` — add `_validateResponsiveBreakpoints()`
- Modify: `tests/responsive-styles.test.js` (add analyzer tests)

**Step 1: Write the failing tests**

- `W_UNKNOWN_BREAKPOINT` — warns on unknown breakpoint name
- No warning for valid breakpoint names

**Step 2: Implement**

Add `_validateResponsiveBreakpoints(css, loc)`:
- If no theme block, skip validation
- Parse breakpoint names from `responsive { name { ... } }` pattern in raw CSS
- Cross-reference against `this._themeTokens.get('breakpoint')` or default set
- Emit `W_UNKNOWN_BREAKPOINT` with available list

Wire into `ComponentStyleBlock` handler alongside `_validateStyleTokens`.

**Step 3: Run tests, commit**

```
feat: analyzer validation for responsive breakpoint names
```

---

## Task 8: Auto `prefers-reduced-motion`

**Files:**
- Modify: `src/codegen/browser-codegen.js` (add `_generateReducedMotion()`)
- Modify: `src/lexer/lexer.js:902-934` (support `style(motion: full)` syntax)
- Modify: `src/parser/browser-ast.js:45-51` (add config field to ComponentStyleBlock)
- Test: `tests/reduced-motion.test.js`

**Step 1: Write the failing tests**

Create `tests/reduced-motion.test.js` with tests for:
- Adds reduced-motion query when CSS has `transition` property
- Adds reduced-motion query when CSS has `animation` property
- No reduced-motion query when CSS has no animation/transition
- Opt-out with `style(motion: full)` disables auto-injection

**Step 2: Implement `_generateReducedMotion()`**

Add to BrowserCodegen:
- Scan scopedCSS for `\banimation\s*:` and `\btransition\s*:` regex patterns
- If found, append `@media (prefers-reduced-motion: reduce) { [scopeAttr] { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; } }`
- Uses `0.01ms` not `0ms` to prevent skipped transitionend events

**Step 3: Handle `style(motion: full)` in lexer**

Modify lexer style block detection (~line 902):
- After matching `style`, check for `(` before `{`
- If `(` found: capture config string until `)`, skip whitespace, then match `{`
- Encode config in token value as prefix: `__CONFIG:motion: full__` + raw CSS
- Browser-codegen strips prefix when processing ComponentStyleBlock

Alternative (cleaner): Add `config` field to `ComponentStyleBlock` AST node. Parse the config in browser-parser when creating the node from the STYLE_BLOCK token.

**Step 4: Wire into generateComponent**

After final scopedCSS is computed:
- Check if any style block has `motion: full` config
- If not, call `_generateReducedMotion(scopedCSS, scopeAttr)` and use result

**Step 5: Run tests, verify pass**

**Step 6: Run full test suite**

**Step 7: Commit**

```
feat: auto prefers-reduced-motion for animated components
```

---

## Task 9: `variant()` Styles — Parse & Generate

**Files:**
- Modify: `src/codegen/browser-codegen.js` (add `_extractVariants()`, `_parseVariantEntries()`, `_generateVariantCSS()`)
- Test: `tests/variant-styles.test.js`

**Step 1: Write the failing tests**

Create `tests/variant-styles.test.js` with tests for:
- Generates CSS class per variant value (`btn--variant-primary`)
- Generates reactive className from variant prop
- Multiple `variant()` blocks (variant + size)
- Variant with pseudo-selectors (`primary:hover`)
- Variant with Bool prop (`true`/`false` keys)
- Compound variant with `+` separator
- Variant works with `$token` references

**Step 2: Implement variant extraction**

Add to BrowserCodegen:
- `_extractVariants(css)` — finds `variant(...) { ... }` blocks, extracts them, returns `{ baseCss, variants: [{propNames, content}] }`
- `_parseVariantEntries(content, propNames)` — parses entries like `primary { ... }`, `primary:hover { ... }`, `primary + lg { ... }`
- `_generateVariantCSS(variants, baseClass, scopeAttr)` — generates `.btn--variant-primary[scope] { ... }` CSS for each entry

Variant CSS class naming: `.baseClass--propName-value[scopeAttr]`
Compound: `.baseClass--prop1-val1.baseClass--prop2-val2[scopeAttr]`
Pseudo: `.baseClass--propName-value[scopeAttr]:hover`

**Step 3: Wire into generateComponent**

In the CSS pipeline:
1. After token resolution: `_extractVariants(resolvedCSS)` -> `{ baseCss, variants }`
2. Scope baseCss normally
3. Generate variant CSS with `_generateVariantCSS(variants, baseClass, scopeAttr)`
4. Append to scopedCSS

For the className: detect the base class name from the first `class="name"` attribute. Store `this._currentVariants` with the extracted variants. When generating JSX class attributes, if variants are active, produce:
```javascript
className: () => ["btn", "btn--variant-" + __props.variant, "btn--size-" + __props.size].join(" ")
```

This requires modifying the class attribute handling in JSX generation to check for active variants and merge them into the className expression.

**Step 4: Run tests, verify pass**

**Step 5: Run full test suite**

**Step 6: Commit**

```
feat: variant() styles — zero-runtime component variants
```

---

## Task 10: `variant()` — Analyzer Validation

**Files:**
- Modify: `src/analyzer/analyzer.js`
- Modify: `tests/variant-styles.test.js` (add analyzer tests)

**Step 1: Write the failing tests**

- `W_VARIANT_UNKNOWN_PROP` — warns when variant references non-existent prop
- No warning for valid variant prop reference

**Step 2: Implement**

Scan `ComponentStyleBlock` CSS for `variant(propName)` patterns. Cross-reference `propName` against the current component's props (requires component context in the analyzer). The browser-analyzer's `visitComponentDeclaration` should collect prop names and pass them through.

**Step 3: Run tests, commit**

```
feat: variant() analyzer — validate prop references
```

---

## Task 11: `animate {}` — Parser & AST

**Files:**
- Create: `src/parser/animate-ast.js`
- Modify: `src/parser/browser-parser.js` (add `parseAnimateDeclaration` and composition parsing)
- Test: `tests/animate-block.test.js`

**Step 1: Write the failing tests**

Create `tests/animate-block.test.js` with parser tests for:
- Simple animate declaration with name, enter, duration
- Enter and exit phases
- Parallel composition with `+` (produces AnimateParallel node)
- Sequential composition with `then` (produces AnimateSequence node)
- Stagger property
- Stay property (auto-dismiss)
- Easing property
- `animate:name` directive on JSX element

**Step 2: Create AST nodes**

Create `src/parser/animate-ast.js` with:
- `AnimateDeclaration(name, enter, exit, duration, easing, stagger, stay, loc)`
- `AnimatePrimitive(name, params, loc)` — name is 'fade'|'slide'|'scale'|'rotate'|'blur', params is object
- `AnimateSequence(children, loc)` — ordered array of children
- `AnimateParallel(children, loc)` — simultaneous array of children

**Step 3: Add parser methods to browser-parser.js**

In the component body loop (inside `parseComponent`), check for `animate` identifier:
```javascript
if (this.check(TokenType.IDENTIFIER) && this.current().value === 'animate') {
  // Peek ahead: if next is IDENTIFIER + LBRACE, it's animate declaration
  // If next is COLON, it's handled as JSX attribute
  bodyItems.push(this.parseAnimateDeclaration());
}
```

Implement:
- `parseAnimateDeclaration()` — consumes animate, name, LBRACE, loops config keys (enter/exit/duration/easing/stagger/stay), RBRACE
- `_parseAnimateComposition()` — recursive descent with `then` (lowest precedence) and `+` (higher precedence)
- `_parseAnimatePrimitive()` — name LPAREN key:value pairs RPAREN, supports grouped `(expr)` for precedence override

`animate:name` directive: Already handled by JSX namespace attribute parsing (same as `on:click`, `bind:value`). Verify it works.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```
feat: animate {} block parser — declarative animation sequences
```

---

## Task 12: `animate {}` — Codegen (@keyframes generation)

**Files:**
- Modify: `src/codegen/browser-codegen.js` (keyframe generation, animate directive handling)
- Modify: `tests/animate-block.test.js` (add codegen tests)

**Step 1: Write the failing tests**

Add codegen tests for:
- Generates `@keyframes` for enter animation
- Generates parallel animation (merged properties in same keyframe range)
- Stagger adds `animationDelay` based on index
- Sequential composition calculates keyframe percentages

**Step 2: Implement keyframe generation**

Add to BrowserCodegen:
- `_generateAnimateKeyframes(anim, scopeId)` — dispatches to builders per composition type
- `_buildKeyframes(name, composition, duration, easing)` — handles Primitive/Parallel/Sequence
- `_primitiveToKeyframes(name, prim)` — converts each primitive type to from/to CSS properties:
  - `fade`: `opacity: from -> to`
  - `slide`: `transform: translateX/Y(distance) -> translateX/Y(0)` based on from/to direction
  - `scale`: `transform: scale(from) -> scale(to)`
  - `rotate`: `transform: rotate(from) -> rotate(to)`
  - `blur`: `filter: blur(from) -> blur(to)`
- `_parallelToKeyframes` — merges all primitive properties into same `from` and `to` blocks
- `_sequenceToKeyframes` — calculates percentage splits (2 children = 0-50%, 50-100%)

**Step 3: Wire into generateComponent**

- Detect `AnimateDeclaration` nodes in component body
- Generate keyframes CSS and inject into scoped CSS via `tova_inject_css`
- When generating JSX for elements with `animate:name` attribute, add animation CSS properties and map to the generated keyframe name

For stagger: when processing a keyed list (`JSXFor`), if the child has `animate:name`, add `style: { animationDelay: (__tova_idx * stagger) + "ms" }` to each child.

**Step 4: Run tests, verify pass**

**Step 5: Run full test suite**

**Step 6: Commit**

```
feat: animate {} codegen — @keyframes with composition operators
```

---

## Task 13: Component-Scoped Font Loading

**Files:**
- Modify: `src/parser/browser-ast.js` (add FontDeclaration class)
- Modify: `src/parser/browser-parser.js` (add `parseComponentFontDeclaration`)
- Modify: `src/codegen/browser-codegen.js` (generate font loading calls)
- Modify: `src/runtime/reactivity.js` (add `__tova_load_font` function)
- Test: `tests/font-loading.test.js`

**Step 1: Write the failing tests**

Create `tests/font-loading.test.js` with tests for:
- Parses font declaration with URL
- Parses font declaration with local path and config block
- Emits `__tova_load_font` call for remote URL
- Emits `@font-face` for local font with `font-display: swap`
- Imports `__tova_load_font` from runtime

**Step 2: Create FontDeclaration AST node**

Add to `src/parser/browser-ast.js`:
- `FontDeclaration(name, source, config, loc)` — name is identifier, source is URL/path string, config is `{ weight, style, display }` or null

**Step 3: Add parser method**

In component body loop, check for `font` identifier followed by IDENTIFIER + 'from' keyword:
- `parseComponentFontDeclaration()` — consumes `font`, name, `from` (contextual), STRING source
- Optional config block: `{ weight: "700" style: "normal" display: "swap" }`

**Step 4: Add `__tova_load_font` to reactivity.js**

Add near `tova_inject_css` (~line 961):
- Reference-counted `<link>` tag injection (same pattern as `tova_inject_css`)
- `__tovaFontRefs` Map for tracking
- Cleanup on `currentOwner._cleanups`

**Step 5: Wire codegen**

In `generateComponent`:
- Detect `FontDeclaration` nodes
- Remote URLs (starts with `http`/`//`): emit `__tova_load_font("id", "url")` call
- Local files: emit `@font-face { font-family: "name"; src: url("path"); font-display: swap; }` via `tova_inject_css`

Add `__tova_load_font` to the runtime import line in `generate()` method.

**Step 6: Run tests, verify pass**

**Step 7: Run full test suite**

**Step 8: Commit**

```
feat: component-scoped font loading with reference counting
```

---

## Task 14: Integration Tests

**Files:**
- Modify: `tests/styling.test.js` (add cross-feature integration tests)

**Step 1: Write integration tests**

Add tests for:
- Theme + $token + responsive + variant in one component (all features working together)
- Theme + animate + font in one component
- Verify no regression on existing styling tests (static class, dynamic class, class: directive, show directive, inline styles)

**Step 2: Run all tests**

Run: `bun test`
Expected: All tests pass

**Step 3: Commit**

```
test: CSS design system integration tests
```

---

## Task 15: Full Regression Test & Final Commit

**Step 1: Run the complete test suite**

Run: `bun test`
Expected: All tests pass (existing + new)

**Step 2: Count new tests**

Run: `bun test tests/theme-block.test.js tests/css-tokens.test.js tests/responsive-styles.test.js tests/reduced-motion.test.js tests/variant-styles.test.js tests/animate-block.test.js tests/font-loading.test.js`

Expected: ~100+ new tests across 7 files

**Step 3: Final commit**

```
feat: complete CSS design system — theme, tokens, variants, animate, responsive, reduced-motion, fonts
```
