---
title: Styling
---

# Styling

Tova provides several ways to style your components: utility classes with Tailwind CSS, scoped component styles, conditional classes, inline styles, and dynamic class expressions. You can freely combine these approaches.

Beyond basic styling, Tova includes a full design system layer. When you define a [theme block](/fullstack/theme-block), you unlock design tokens (`$token` references), named responsive breakpoints, component variants, declarative animations, and component-scoped font loading -- all resolved at compile time with zero runtime overhead.

## Tailwind CSS

Tova includes Tailwind CSS out of the box via CDN -- no installation or configuration required. Every utility class works immediately in development (`tova dev`) and production builds (`tova build --production`).

```tova
component Card(title, description) {
  <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-all">
    <h3 class="text-lg font-semibold text-gray-900 mb-2">title goes here</h3>
    <p class="text-sm text-gray-500 leading-relaxed">description goes here</p>
  </div>
}
```

Use curly braces for dynamic values in attributes and children, like component props.

Responsive, hover, focus, and all other Tailwind variants work as expected:

```tova
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  <button class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors">
    Save
  </button>
</div>
```

::: tip
Tailwind is the recommended approach for most styling in Tova. It avoids naming CSS classes, keeps styles co-located with markup, and produces minimal CSS in production.
:::

## Scoped CSS

Components can include `style` blocks that are automatically scoped to that component. Styles never leak into other components, even if they share the same class names.

```tova
component Button(label) {
  <button class="btn">Click me</button>

  style {
    .btn {
      background: #4f46e5;
      color: white;
      padding: 8px 16px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #4338ca;
    }
  }
}
```

Pass dynamic text from a prop by wrapping it in curly braces inside the element.

### How Scoping Works

The compiler generates a unique hash from the component name and CSS content, then:

1. Adds `data-tova-HASH` to every HTML element in the component
2. Rewrites CSS selectors to include the attribute: `.btn` becomes `.btn[data-tova-HASH]`
3. Injects the CSS into `<head>` via `tova_inject_css()` -- idempotent, so rendering the component multiple times only injects the style once

### Pseudo-Classes and Pseudo-Elements

Scoping correctly handles all pseudo-classes and pseudo-elements. The scope attribute is inserted before the pseudo-selector:

```tova
style {
  .input:focus { border-color: #4f46e5; }
  .input:hover { border-color: #a5b4fc; }
  .input::placeholder { color: #9ca3af; }
  .list li:first-child { border-top: none; }
  .btn:focus-visible { outline: 2px solid #4f46e5; }
}
```

Compiles to:

```css
.input[data-tova-abc]:focus { border-color: #4f46e5; }
.input[data-tova-abc]:hover { border-color: #a5b4fc; }
.input[data-tova-abc]::placeholder { color: #9ca3af; }
.list[data-tova-abc] li[data-tova-abc]:first-child { border-top: none; }
.btn[data-tova-abc]:focus-visible { outline: 2px solid #4f46e5; }
```

Functional pseudo-classes like `:is()`, `:where()`, `:has()`, and `:nth-child()` are also handled correctly -- selectors inside the function arguments are scoped.

### At-Rules

Scoped styles support all standard CSS at-rules:

**`@media`** -- selectors inside are scoped:

```tova
style {
  .sidebar { width: 300px; }

  @media (max-width: 768px) {
    .sidebar { width: 100%; position: fixed; }
  }
}
```

**`@keyframes`** -- selectors inside (`from`, `to`, `0%`, `100%`) are **not** scoped, since they are animation step names, not element selectors:

```tova
style {
  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
}
```

**`@font-face`** -- not scoped, since font declarations are global by nature:

```tova
style {
  @font-face {
    font-family: "CustomFont";
    src: url("/fonts/custom.woff2") format("woff2");
  }

  .heading { font-family: "CustomFont", sans-serif; }
}
```

**`@layer`** and **`@supports`** -- selectors inside are scoped:

```tova
style {
  @layer components {
    .card { border-radius: 12px; padding: 16px; }
  }

  @supports (backdrop-filter: blur(8px)) {
    .glass { backdrop-filter: blur(8px); background: rgba(255,255,255,0.8); }
  }
}
```

### `:global()` Escape Hatch

To write styles that are not scoped, wrap selectors in `:global()`:

```tova
component Modal {
  <div class="overlay">
    <div class="content">...</div>
  </div>

  style {
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); }
    .content { max-width: 600px; margin: auto; }

    // This targets the body element globally -- not scoped
    :global(body.modal-open) { overflow: hidden; }
  }
}
```

`:global()` also works inline within a compound selector, so you can scope part of the selector and leave part global:

```tova
style {
  // .widget is scoped, .third-party-class is not
  .widget :global(.third-party-class) { color: red; }
}
```

## Conditional Classes

Use `class:` directives to toggle classes based on expressions:

```tova
<div class:active={is_active} class:error={has_error}>
  Content
</div>
```

The class is added when the expression is truthy and removed when falsy. Multiple `class:` directives merge with any static `class` attribute:

```tova
<button class="btn" class:primary={is_primary} class:loading={is_loading}>
  Submit
</button>
```

When any referenced signal changes, the class list updates reactively.

## Dynamic Class Expressions

For more complex class logic, pass an expression to `class`:

```tova
<div class={if is_active { "bg-indigo-600 text-white" } else { "bg-gray-100 text-gray-600" }}>
  Tab
</div>
```

### Match Expressions for Class Variants

Use `match` to map values to class strings -- useful for variants, priorities, statuses:

```tova
fn badge_classes(status) {
  match status {
    "success" => "bg-green-100 text-green-700 border-green-200"
    "warning" => "bg-amber-100 text-amber-700 border-amber-200"
    "error"   => "bg-red-100 text-red-700 border-red-200"
    _         => "bg-gray-100 text-gray-700 border-gray-200"
  }
}
```

Then use it in a component:

```tova
component Badge(status) {
  <div class={badge_classes(status)}>
    Active
  </div>
}
```

### String Interpolation in Classes

Embed expressions directly in class strings with curly braces:

```tova
state highlighted = true

<div class="p-4 rounded-lg">
  Dynamic classes
</div>
```

When `highlighted` is true, use a dynamic `class` expression with `if` to conditionally add `"ring-2 ring-indigo-500"` to the class list.

## Inline Styles

### Static Styles

Pass a CSS string to the `style` attribute:

```tova
<div style="color: red; font-size: 14px;">
  Red text
</div>
```

### Dynamic Style Objects

Pass a JavaScript-style object for programmatic styles:

<!-- {% raw %} -->
```tova
<div style={{ color: text_color, fontSize: "14px", opacity: if visible { 1 } else { 0 } }}>
  Dynamic styling
</div>
```
<!-- {% endraw %} -->

Style object properties use camelCase (matching the DOM `style` API): `fontSize` not `font-size`, `backgroundColor` not `background-color`.

### The `show` Directive

The `show` directive toggles visibility by setting `display: none`:

```tova
<div show={is_visible}>
  This stays in the DOM but is hidden when is_visible is false
</div>
```

Unlike `if` blocks which add and remove elements from the DOM, `show` preserves the element and its state. Use `show` when:

- You need to preserve form inputs, scroll position, or focus state
- Toggling is frequent and you want to avoid re-render costs

## Combining Approaches

In practice, most Tova apps combine Tailwind for layout and utility styling with scoped CSS for complex component-specific animations or third-party overrides:

```tova
component AnimatedCard() {
  <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 card">
    <h3 class="text-lg font-semibold text-gray-900">Card title</h3>
  </div>

  style {
    .card {
      animation: slideUp 0.3s ease-out;
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  }
}
```

## Design Tokens

The `$category.name` syntax references theme tokens inside `style {}` blocks. At compile time, each token reference is replaced with a CSS custom property call: `$colors.primary` becomes `var(--tova-color-primary)`. This requires a `theme {}` block in your project.

```tova
theme {
  colors {
    primary: "#3b82f6"
    primary.hover: "#2563eb"
    surface: "#ffffff"
    text: "#1e293b"
    border: "#e2e8f0"
  }
  spacing {
    md: 16
    lg: 24
  }
  radius {
    md: 8
  }
}

browser {
  component Card() {
    style {
      .card {
        background: $colors.surface;
        color: $colors.text;
        padding: $spacing.lg;
        border-radius: $radius.md;
        border: 1px solid $colors.border;
      }
      .card:hover {
        border-color: $colors.primary;
      }
    }
    <div class="card">
      <p>"Content goes here"</p>
    </div>
  }
}
```

Compiles to:

```css
.card[data-tova-xxx] {
  background: var(--tova-color-surface);
  color: var(--tova-color-text);
  padding: var(--tova-spacing-lg);
  border-radius: var(--tova-radius-md);
  border: 1px solid var(--tova-color-border);
}
.card[data-tova-xxx]:hover {
  border-color: var(--tova-color-primary);
}
```

Dot-separated token names become dashes in the generated CSS variable: `$colors.primary.hover` compiles to `var(--tova-color-primary-hover)`.

The category prefix follows a mapping: `colors` becomes `color`, `spacing` stays `spacing`, `radius` stays `radius`, `shadow` stays `shadow`, `font` stays `font`, and `transition` stays `transition`.

The analyzer validates every token reference against your theme and suggests corrections for typos, so misspelling `$colors.primray` will produce a warning pointing you to `$colors.primary`.

::: tip
Define your tokens in a `theme {}` block. See [Theme Block](/fullstack/theme-block) for the full reference.
:::

## Responsive Blocks

Named breakpoints inside `style {}` blocks let you write responsive CSS without remembering pixel values. The `responsive {}` block uses breakpoints from your theme, or falls back to defaults: mobile (0px), tablet (768px), desktop (1024px), and wide (1440px).

```tova
browser {
  component Layout() {
    style {
      .container {
        padding: 16px;
        max-width: 100%;
      }
      responsive {
        tablet {
          .container { padding: 24px; max-width: 720px; }
        }
        desktop {
          .container { padding: 32px; max-width: 960px; }
        }
        wide {
          .container { max-width: 1200px; }
        }
      }
    }
    <div class="container">
      <p>"Responsive content"</p>
    </div>
  }
}
```

Each named breakpoint compiles to a mobile-first `@media (min-width: ...)` query. Breakpoints are sorted by value, so the generated CSS cascades correctly regardless of the order you write them.

Token references work inside responsive blocks, so you can use `$spacing.lg` or `$colors.primary` within any breakpoint.

::: tip
Custom breakpoints from your `theme { breakpoints { ... } }` are used automatically. If no theme exists, the defaults are used.
:::

## Component Variants

The `variant(propName)` syntax inside `style {}` blocks generates CSS classes for each variant value. The compiler injects reactive className logic automatically -- there is no runtime JavaScript overhead for variant resolution.

```tova
browser {
  component Button(variant: String, size: String) {
    style {
      .btn {
        border: none;
        cursor: pointer;
        font-weight: 500;
      }
      variant(variant) {
        primary {
          background: $colors.primary;
          color: white;
        }
        primary:hover {
          background: $colors.primary.hover;
        }
        secondary {
          background: transparent;
          color: $colors.text;
          border: 1px solid $colors.border;
        }
        danger {
          background: $colors.danger;
          color: white;
        }
      }
      variant(size) {
        sm { font-size: 14px; padding: 6px 12px; }
        md { font-size: 16px; padding: 8px 16px; }
        lg { font-size: 18px; padding: 12px 24px; }
      }
    }
    <button class="btn">"Click me"</button>
  }
}
```

### How Variants Work

Each variant value generates a scoped CSS class following the pattern `.btn--{propName}-{value}[data-tova-xxx]`. The `class` attribute on the element is made reactive, producing a string like `"btn btn--variant-primary btn--size-md"` that updates when props change.

Pseudo-selectors work naturally: `primary:hover` in a variant block generates `.btn--variant-primary[data-tova-xxx]:hover`.

Multiple `variant()` blocks on different props are combined automatically. Token references (`$token`) resolve inside variant blocks.

### Compound Variants

Compound variants match combinations of multiple props at once:

```tova
variant(variant + size) {
  primary + lg {
    font-weight: 700;
    letter-spacing: 0.05em;
  }
}
```

This generates a selector that requires both classes: `.btn--variant-primary.btn--size-lg[data-tova-xxx]`. Use compound variants for styles that should only apply when a specific combination of props is active.

### Boolean Variants

When a prop is a boolean, use `true` and `false` as variant keys:

```tova
variant(disabled) {
  true { opacity: 0.5; cursor: not-allowed; }
  false { opacity: 1; }
}
```

## Declarative Animations

The `animate {}` block defines named animations inside components using composable primitives. Animations generate `@keyframes` CSS at compile time.

```tova
browser {
  component Notification() {
    animate slideIn {
      enter: slide(y: 20, to: 0) + fade(from: 0, to: 1)
      exit: fade(from: 1, to: 0)
      duration: 300
      easing: "ease-out"
    }

    <div animate:slideIn>
      <p>"New message!"</p>
    </div>
  }
}
```

### Animation Primitives

Five built-in primitives cover the most common animation needs:

| Primitive | Parameters | CSS Property |
|-----------|-----------|--------------|
| `fade(from, to)` | opacity values (0-1) | `opacity` |
| `slide(x, y, to)` | pixel offsets | `transform: translate` |
| `scale(from, to)` | scale factors | `transform: scale` |
| `rotate(from, to)` | degrees | `transform: rotate` |
| `blur(from, to)` | pixel values | `filter: blur` |

### Composition Operators

Primitives can be combined with two operators:

**Parallel (`+`)** runs animations simultaneously. Properties from each primitive merge into a single keyframe:

```tova
enter: fade(from: 0, to: 1) + slide(y: 20, to: 0)
```

**Sequential (`then`)** runs one animation after another. Keyframes are split into percentage ranges:

```tova
enter: fade(from: 0, to: 1) then scale(from: 0.9, to: 1)
```

This generates `0%`, `50%`, and `100%` keyframe stops, with the fade occupying the first half and the scale occupying the second half.

The `+` operator binds tighter than `then`, so `a + b then c` means "run a and b together, then run c".

### Configuration Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enter` | composition | -- | Animation when element appears |
| `exit` | composition | -- | Animation when element leaves |
| `duration` | number | 300 | Duration in milliseconds |
| `easing` | string | `"ease"` | CSS easing function |
| `stagger` | number | -- | Delay between list items (ms) |
| `stay` | number | -- | Auto-dismiss delay (ms) |

### Using Animations

Apply an animation to any element with the `animate:name` directive:

```tova
// Always animate
<div animate:fadeIn>"Content"</div>

// Conditional animation
<div animate:fadeIn={is_visible}>"Appears when visible"</div>
```

### Staggered List Animations

The `stagger` property adds an incremental delay to each item in a list. The first item animates at 0ms, the second at the stagger value, the third at twice the stagger value, and so on:

```tova
animate listFade {
  enter: fade(from: 0, to: 1) + slide(y: 10, to: 0)
  duration: 200
  stagger: 50
}

<ul>
  for item in items {
    <li animate:listFade>{item.name}</li>
  }
</ul>
```

Each list item appears 50ms after the previous one, creating a cascading reveal effect.

## Component-Scoped Fonts

The `font` declaration loads fonts that are scoped to a component's lifecycle. Remote fonts are lazily loaded when the component mounts and cleaned up (with reference counting) when all instances unmount.

```tova
browser {
  component Article() {
    font heading from "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700"
    font code from "./fonts/FiraCode.woff2" {
      weight: "400"
      style: "normal"
      display: "swap"
    }

    style {
      h1 { font-family: "Playfair Display", serif; }
      code { font-family: "FiraCode", monospace; }
    }

    <article>
      <h1>"Article Title"</h1>
      <code>"const x = 42"</code>
    </article>
  }
}
```

**Remote fonts** (URLs starting with `http` or `//`) inject a `<link>` stylesheet tag into `<head>`. The tag is removed when the component unmounts.

**Local fonts** (relative paths) generate `@font-face` CSS rules with `font-display: swap` by default.

The optional **config block** lets you set `weight`, `style`, and `display` for the `@font-face` rule.

Reference counting ensures that when multiple instances of a component are mounted, the font is only loaded once and only removed when the last instance unmounts.

## Auto Reduced Motion

The compiler automatically injects a `@media (prefers-reduced-motion: reduce)` block when your component's CSS contains `transition` or `animation` properties. This ensures accessibility compliance without any extra effort.

```tova
component Card() {
  style {
    .card {
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
  }
  <div class="card">"Content"</div>
}
```

The compiler automatically appends:

```css
@media (prefers-reduced-motion: reduce) {
  [data-tova-xxx] {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

The duration is set to `0.01ms` rather than `0ms` to prevent browsers from skipping `transitionend` events, which could break JavaScript that listens for animation completion.

### Opting Out

Use `style(motion: full)` for animations that are essential to understanding the UI, such as progress indicators or loading bars:

```tova
component ProgressBar() {
  style(motion: full) {
    .bar {
      transition: width 0.5s linear;
    }
  }
  <div class="bar">"Loading..."</div>
}
```

When `motion: full` is set, the compiler skips the reduced-motion media query for that component.

## Quick Reference

| Approach | When to Use |
|----------|-------------|
| Tailwind classes | Layout, spacing, colors, typography -- most styling |
| Scoped `style` blocks | Animations, complex selectors, third-party overrides |
| `class:name` directive | Toggle a single class on/off |
| Dynamic `class` | Computed class strings, variant mapping |
| Dynamic `style` | One-off programmatic styles (e.g., computed positions) |
| `show` directive | Toggle visibility while preserving DOM state |
| `:global()` | Escape scoping for body-level or third-party styles |
| `$token` references | Use theme design tokens in scoped styles |
| `responsive {}` | Named breakpoint media queries in style blocks |
| `variant(prop)` | Zero-runtime component style variants |
| `animate {}` | Declarative composable enter/exit animations |
| `font ... from` | Component-scoped lazy font loading |
| `style(motion: full)` | Opt out of auto reduced-motion |
