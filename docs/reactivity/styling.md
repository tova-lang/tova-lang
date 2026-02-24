---
title: Styling
---

# Styling

Tova provides several ways to style your components: utility classes with Tailwind CSS, scoped component styles, conditional classes, inline styles, and dynamic class expressions. You can freely combine these approaches.

## Tailwind CSS

Tova includes Tailwind CSS out of the box via CDN -- no installation or configuration required. Every utility class works immediately in development (`tova dev`) and production builds (`tova build --production`).

```tova
component Card(title, description) {
  <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-all">
    <h3 class="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
    <p class="text-sm text-gray-500 leading-relaxed">{description}</p>
  </div>
}
```

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

Components can include `style { }` blocks that are automatically scoped to that component. Styles never leak into other components, even if they share the same class names.

```tova
component Button(label) {
  <button class="btn">{label}</button>

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
  {label}
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

component Badge(status, label) {
  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border {badge_classes(status)}">
    {label}
  </span>
}
```

### String Interpolation in Classes

Embed expressions directly in class strings with `{ }`:

```tova
<div class="p-4 rounded-lg {if highlighted { "ring-2 ring-indigo-500" } else { "" }}">
  {content}
</div>
```

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

```tova
<div style={{ color: text_color, fontSize: "14px", opacity: if visible { 1 } else { 0 } }}>
  Dynamic styling
</div>
```

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
component AnimatedCard(title) {
  <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 card">
    <h3 class="text-lg font-semibold text-gray-900">{title}</h3>
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

## Quick Reference

| Approach | When to Use |
|----------|-------------|
| Tailwind classes | Layout, spacing, colors, typography -- most styling |
| Scoped `style { }` | Animations, complex selectors, third-party overrides |
| `class:name={cond}` | Toggle a single class on/off |
| `class={expr}` | Computed class strings, variant mapping |
| `style={{ ... }}` | One-off programmatic styles (e.g., computed positions) |
| `show={cond}` | Toggle visibility while preserving DOM state |
| `:global()` | Escape scoping for body-level or third-party styles |
