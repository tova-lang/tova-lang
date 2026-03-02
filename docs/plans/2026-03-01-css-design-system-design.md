# CSS & Design System — Design Document

**Date:** 2026-03-01
**Status:** Approved

## Overview

Seven compiler-level CSS and design features that make Tova's styling system unique. All features are compile-time (zero runtime cost except font loading), analyzer-validated, and integrate with existing scoped `style {}` blocks.

## Features

### 1. `theme {}` Block — First-Class Design Tokens

Top-level block (like `server {}`, `browser {}`, `security {}`). Single source of truth for design tokens.

```tova
theme {
  colors {
    primary: "#3b82f6"
    primary.hover: "#2563eb"
    primary.light: "#dbeafe"
    secondary: "#8b5cf6"
    surface: "#ffffff"
    surface.raised: "#f8fafc"
    text: "#1e293b"
    text.muted: "#64748b"
    border: "#e2e8f0"
    error: "#ef4444"
    success: "#22c55e"
    warning: "#f59e0b"
  }

  spacing {
    xs: 4
    sm: 8
    md: 16
    lg: 24
    xl: 32
    xxl: 48
  }

  radius {
    sm: 4
    md: 8
    lg: 16
    full: 9999
  }

  shadow {
    sm: "0 1px 2px rgba(0,0,0,0.05)"
    md: "0 4px 6px rgba(0,0,0,0.1)"
    lg: "0 10px 15px rgba(0,0,0,0.15)"
  }

  font {
    sans: "Inter, system-ui, sans-serif"
    mono: "JetBrains Mono, monospace"
    size.xs: 12
    size.sm: 14
    size.base: 16
    size.lg: 20
    size.xl: 24
    size.xxl: 32
  }

  breakpoints {
    mobile: 0
    tablet: 768
    desktop: 1024
    wide: 1440
  }

  transition {
    fast: "150ms ease"
    normal: "200ms ease"
    slow: "300ms ease-out"
  }

  dark {
    colors.surface: "#0f172a"
    colors.surface.raised: "#1e293b"
    colors.text: "#e2e8f0"
    colors.text.muted: "#94a3b8"
    colors.border: "#334155"
  }
}
```

#### Compiler Output

```css
:root {
  --tova-color-primary: #3b82f6;
  --tova-color-primary-hover: #2563eb;
  --tova-color-surface: #ffffff;
  --tova-spacing-md: 16px;
  --tova-radius-md: 8px;
  --tova-shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --tova-font-sans: Inter, system-ui, sans-serif;
  --tova-font-size-base: 16px;
  --tova-transition-normal: 200ms ease;
  /* ...all tokens... */
}

@media (prefers-color-scheme: dark) {
  :root {
    --tova-color-surface: #0f172a;
    --tova-color-text: #e2e8f0;
    /* ...dark overrides only... */
  }
}
```

#### Design Decisions

- Spacing values are unitless in source, compiler appends `px` in output
- Dot notation (`primary.hover`) flattens to dashes (`--tova-color-primary-hover`)
- `dark {}` only overrides what changes — inherits everything else
- Emitted once at the top of browser output, before any component CSS
- Theme block is optional — other features work without it (no `$token` validation)
- Multiple theme blocks are an error (analyzer enforces single theme)
- **`toggleTheme()` stdlib function:** If called, compiler switches from `@media (prefers-color-scheme)` to `[data-theme="dark"]` selector strategy and emits a toggle function that flips the attribute + persists to localStorage

#### AST

- Node type: `ThemeBlock`
- Child nodes: `ThemeSection` (colors, spacing, radius, shadow, font, breakpoints, transition, dark)
- Each section contains `ThemeToken` nodes with `name` (string, dot-separated) and `value` (number or string literal)

#### Implementation Location

- Parser: `theme-parser.js` with `installThemeParser()` pattern
- AST: `theme-ast.js` (ThemeBlock, ThemeSection, ThemeToken)
- Codegen: `theme-codegen.js` — generates CSS custom properties
- Analyzer: `visitThemeBlock()` — validates duplicate tokens, duplicate sections, multiple theme blocks
- Integration: `browser-codegen.js` emits theme CSS before component CSS; `codegen.js` passes themeConfig to browser codegen

---

### 2. `$token` Syntax — Compile-Time Validated Token References

Anywhere inside a `style {}` block, `$category.name` references a design token.

```tova
style {
  .card {
    background: $color.surface.raised;
    padding: $spacing.lg;
    border-radius: $radius.md;
    box-shadow: $shadow.sm;
    border: 1px solid $color.border;
    font-family: $font.sans;
    transition: box-shadow $transition.normal;
  }
}
```

#### Compiler Output

```css
.card[data-tova-x] {
  background: var(--tova-color-surface-raised);
  padding: var(--tova-spacing-lg);
  border-radius: var(--tova-radius-md);
  /* ... */
}
```

#### Analyzer Validation

```
Error: Unknown design token '$color.primry'
  ┌─ src/components/card.tova:8:18
  │
8 │     background: $color.primry;
  │                 ^^^^^^^^^^^^^ did you mean '$color.primary'?
  │
  = available colors: primary, primary.hover, primary.light, secondary,
                      surface, surface.raised, text, text.muted, border,
                      error, success, warning
```

#### Design Decisions

- `$` prefix doesn't conflict with any CSS syntax
- Token resolution happens during CSS scoping pass in `_scopeCSS()` — before CSS is emitted
- Category mapping: `$color` → `colors {}`, `$spacing` → `spacing {}`, `$radius` → `radius {}`, `$shadow` → `shadow {}`, `$font` → `font {}`, `$transition` → `transition {}`
- Shorthand works: `padding: $spacing.sm $spacing.md;` → `padding: var(--tova-spacing-sm) var(--tova-spacing-md);`
- No theme block → warning (not error) — `var()` reference emitted anyway for external CSS compatibility
- Levenshtein distance for "did you mean?" suggestions

#### Implementation Location

- Token resolution: `_resolveTokens()` method in `browser-codegen.js`, called from `_scopeCSS()`
- Regex: `\$(\w+)\.(\w+(?:\.\w+)*)` to match `$category.name.subname`
- Analyzer: `_validateTokenReferences()` in `theme-analyzer.js`, runs on raw CSS string from `ComponentStyleBlock`

---

### 3. `variant()` Styles — Zero-Runtime Component Variants

Inside `style {}` blocks, connects component props to CSS rules at compile time.

```tova
component Button {
  prop variant: "primary" | "secondary" | "ghost" = "primary"
  prop size: "sm" | "md" | "lg" = "md"
  prop rounded: Bool = false

  <button class="btn"><slot /></button>

  style {
    .btn {
      border: none;
      cursor: pointer;
      font-family: $font.sans;
    }

    variant(variant) {
      primary { background: $color.primary; color: white; }
      primary:hover { background: $color.primary.hover; }
      secondary { background: transparent; border: 2px solid $color.primary; color: $color.primary; }
      ghost { background: transparent; color: $color.text; }
    }

    variant(size) {
      sm { padding: $spacing.xs $spacing.sm; font-size: $font.size.sm; }
      md { padding: $spacing.sm $spacing.md; font-size: $font.size.base; }
      lg { padding: $spacing.md $spacing.lg; font-size: $font.size.lg; }
    }

    variant(rounded) {
      true { border-radius: $radius.full; }
      false { border-radius: $radius.md; }
    }

    variant(variant, size) {
      primary + lg { text-transform: uppercase; letter-spacing: 0.05em; }
    }
  }
}
```

#### Compiler Output

CSS classes per variant value:

```css
.btn[data-tova-x] { border: none; cursor: pointer; }
.btn--variant-primary[data-tova-x] { background: var(--tova-color-primary); color: white; }
.btn--variant-primary[data-tova-x]:hover { background: var(--tova-color-primary-hover); }
.btn--variant-secondary[data-tova-x] { /* ... */ }
.btn--size-sm[data-tova-x] { /* ... */ }
.btn--variant-primary.btn--size-lg[data-tova-x] { text-transform: uppercase; }
```

JSX gets reactive className:

```javascript
className: () => [
  "btn",
  "btn--variant-" + __props.variant,
  "btn--size-" + __props.size,
  "btn--rounded-" + __props.rounded
].join(" ")
```

#### Design Decisions

- BEM-ish class naming (`btn--variant-primary`) for inspector debuggability
- Compound variants use `+` separator between values
- Base selector inferred from the element with `class="btn"`
- Pseudo-selectors work after variant values (`primary:hover`)
- Static (non-signal) props compile to static class strings, no reactive closure
- Bool props use `true`/`false` as variant keys

#### Analyzer Validation

- `variant(x)` where `x` is not a prop name → error
- Variant value not in prop's type union → error
- Compound variant referencing unknown value → error

#### Implementation Location

- Parser: `variant()` parsed inside style block raw CSS — `_parseVariantBlocks()` in `browser-codegen.js`
- Codegen: `_generateVariantCSS()` generates classes, `_generateVariantClassName()` generates JSX className expression
- Analyzer: `_validateVariants()` cross-references against component props

---

### 4. `animate {}` — Declarative Animation Sequences

Named animation declarations inside components. Compose with `then` (sequential) and `+` (parallel). Bind via `animate:name` directive.

```tova
component Notification {
  state visible = false

  animate toast {
    enter: slide(from: right, distance: 100) + fade(to: 1)
    exit: fade(to: 0) then slide(to: right, distance: 50)
    duration: 300
    easing: "ease-out"
  }

  if visible {
    <div animate:toast class="notification"><slot /></div>
  }
}
```

#### Built-in Primitives

| Primitive | Parameters | Effect |
|-----------|-----------|--------|
| `fade` | `to`, `from` (0-1) | opacity |
| `slide` | `from`/`to` (left/right/top/bottom), `distance` | translateX/Y |
| `scale` | `from`, `to` (number) | scale() |
| `rotate` | `from`, `to` (degrees) | rotate() |
| `blur` | `from`, `to` (px) | filter: blur() |

#### Composition

```tova
// Sequential
slide(from: left) then fade(to: 1)

// Parallel
fade(to: 1) + scale(from: 0.9, to: 1)

// Mixed
(slide(from: bottom) + fade(to: 1)) then scale(from: 0.95, to: 1)
```

#### Stagger

```tova
animate appear {
  enter: fade(to: 1) + slide(from: bottom, distance: 20)
  stagger: 60
  duration: 400
}
```

Each child gets `animation-delay: calc(index * 60ms)`.

#### Auto-Dismiss

```tova
animate banner {
  enter: slide(from: top, distance: 40) + fade(to: 1)
  stay: 5000
  exit: fade(to: 0)
}
```

After enter completes, wait 5s, then trigger exit and remove element.

#### Compiler Output

`then` operator calculates keyframe percentages. `fade then slide` with equal durations → `0%-50%` fade, `50%-100%` slide. `+` operator merges properties into the same keyframe range.

Stagger: compiler adds index tracking to keyed list iteration, applies `animation-delay`.

Stay: emits a timeout in the transition lifecycle (extends `tova_transition` infrastructure).

#### Design Decisions

- `animate {}` is component-scoped, not global
- Existing `transition:fade` / `in:slide` / `out:scale` directives unchanged — `animate {}` is the higher-level alternative
- Analyzer warns if both `transition:` and `animate:` are on the same element
- Unknown primitive → error with suggestions
- `animate:name` referencing undeclared block → error
- `stagger` on non-list element → warning
- `stay` without `exit` → warning

#### Implementation Location

- Parser: `animate-parser.js` with `installAnimateParser()` — parses `animate name { ... }` blocks inside component scope
- AST: `AnimateDeclaration` with `AnimatePhase` (enter/exit), `AnimatePrimitive`, `AnimateComposition` (then/parallel)
- Codegen: `_generateAnimateKeyframes()` in `browser-codegen.js` — computes keyframe percentages from composition tree
- Runtime: extends `tova_transition()` for `stay` support — small addition to `reactivity.js`

---

### 5. `responsive {}` — Named Breakpoints Inside Style Blocks

Replaces raw `@media` queries with semantic breakpoint names from `theme {}`.

```tova
style {
  .nav {
    display: flex;
    align-items: center;
    padding: $spacing.md;
  }

  .links { display: flex; gap: $spacing.sm; }
  .menu-btn { display: none; }

  responsive {
    mobile {
      .nav { flex-direction: column; }
      .links { display: none; }
      .menu-btn { display: block; }
    }
    tablet {
      .nav { flex-direction: row; justify-content: space-between; }
      .links { display: flex; }
      .menu-btn { display: none; }
    }
    desktop {
      .nav { padding: $spacing.lg $spacing.xl; }
      .links { gap: $spacing.md; }
    }
  }
}
```

#### Compiler Output

Mobile-first `@media (min-width: ...)` queries. Lowest breakpoint (`mobile: 0`) emits without wrapper. Scoping preserved on all selectors.

#### Design Decisions

- Mobile-first ordering: breakpoints sorted by value ascending
- Breakpoint names from `theme { breakpoints {} }`. Defaults if no theme: mobile: 0, tablet: 768, desktop: 1024
- Subset allowed: only list breakpoints where styles change
- Raw `@media` still works alongside `responsive {}`
- One `responsive {}` per `style {}` block
- Unknown breakpoint name → error with available list
- Breakpoints not ascending → warning

#### Implementation Location

- Parsed during CSS scoping pass: `_parseResponsiveBlock()` in `browser-codegen.js`
- Emits `@media` rules after base styles in scoped CSS output
- Analyzer: `_validateResponsiveBreakpoints()` cross-references theme

---

### 6. Auto `prefers-reduced-motion`

Zero-config compiler behavior. Any component CSS containing `animation` or `transition` properties gets an automatic reduced-motion counterpart.

#### Compiler Output

```css
@media (prefers-reduced-motion: reduce) {
  .card[data-tova-x] {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

#### Design Decisions

- Per-component, not global blanket rule
- Only emitted when CSS actually contains `transition` or `animation` properties
- `animate {}` blocks also get this treatment
- Uses `0.01ms` not `0ms` (prevents skipped `transitionend` events)
- **Opt-out:** `style(motion: full) { ... }` for cases where motion IS the content (progress bars, etc.)

#### Implementation Location

- `_generateReducedMotion()` in `browser-codegen.js` — scans emitted CSS for animation/transition properties, emits media query block
- Called after `_scopeCSS()` and `_resolveTokens()`

---

### 7. Component-Scoped Font Loading

Declare font dependencies at the component level. Compiler handles preloading, injection, and cleanup.

#### Remote Fonts

```tova
component CodeBlock {
  font mono from "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700"

  style {
    .code { font-family: $font.mono, monospace; }
  }
}
```

Compiler emits `__tova_load_font(id, url)` call — reference counted, cleaned up on unmount.

#### Local Fonts

```tova
component Branding {
  font heading from "./fonts/CustomHeading.woff2" {
    weight: "700"
    style: "normal"
    display: "swap"
  }
}
```

Generates `@font-face` block inside component's scoped CSS.

#### Design Decisions

- Reference counted — same pattern as `tova_inject_css()`
- `font-display: swap` by default
- Remote URLs → `<link>` tag. Local files → `@font-face`
- Component-scoped: only loaded when component mounts
- Analyzer warns if font name shadows a `theme { font {} }` token

#### Runtime Addition

Small `__tova_load_font(id, url)` function in `reactivity.js` — mirrors `tova_inject_css` pattern with reference counting and owner cleanup.

#### Implementation Location

- Parser: `font` declaration parsed in component scope — `parseComponentFontDeclaration()` in `browser-parser.js`
- AST: `FontDeclaration` with name, source (URL or path), config (weight, style, display)
- Codegen: `_generateFontLoading()` in `browser-codegen.js`
- Runtime: `__tova_load_font()` in `reactivity.js`

---

## Implementation Order

1. **`theme {}` block** — foundation; other features depend on it
2. **`$token` syntax** — depends on theme; enables all style blocks to reference tokens
3. **`responsive {}`** — depends on theme breakpoints; scoped CSS extension
4. **Auto `prefers-reduced-motion`** — standalone; small addition to CSS scoping
5. **`variant()` styles** — depends on $token; needs component prop cross-referencing
6. **`animate {}`** — depends on existing transition infrastructure; most complex
7. **Font loading** — standalone; small runtime addition

## Testing Strategy

Each feature gets its own test file:
- `tests/theme-block.test.js`
- `tests/css-tokens.test.js`
- `tests/responsive-styles.test.js`
- `tests/reduced-motion.test.js`
- `tests/variant-styles.test.js`
- `tests/animate-block.test.js`
- `tests/font-loading.test.js`

Integration tests in `tests/styling.test.js` for cross-feature scenarios (theme + tokens + variants + responsive in one component).
