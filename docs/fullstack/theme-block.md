---
title: Theme Block
---

# Theme Block

The `theme {}` block is a top-level language construct in Tova that defines design tokens for your application. You declare colors, spacing, typography, shadows, breakpoints, and transitions in one central place, and the compiler generates CSS custom properties on `:root`. Dark mode overrides compile to a `@media (prefers-color-scheme: dark)` block automatically. One theme per app, zero runtime dependencies.

## Defining a Theme

The `theme {}` block sits at the top level of your Tova file, alongside `server {}`, `browser {}`, and other blocks. It contains named sections, each holding key-value token definitions:

```tova
theme {
  colors {
    primary: "#3b82f6"
    secondary: "#64748b"
    text: "#1e293b"
    surface: "#ffffff"
  }

  spacing {
    sm: 8
    md: 16
    lg: 24
  }

  radius {
    md: 8
    full: 9999
  }
}
```

This compiles to CSS custom properties injected into your page's `:root`:

```css
:root {
  --tova-color-primary: #3b82f6;
  --tova-color-secondary: #64748b;
  --tova-color-text: #1e293b;
  --tova-color-surface: #ffffff;
  --tova-spacing-sm: 8px;
  --tova-spacing-md: 16px;
  --tova-spacing-lg: 24px;
  --tova-radius-md: 8px;
  --tova-radius-full: 9999px;
}
```

Only one `theme {}` block is allowed per application. The compiler warns if it encounters more than one.

## Token Sections

Each section inside `theme {}` holds a specific category of design tokens. Token names support dot-notation for nested variants (e.g., `primary.hover`), which compiles to a hyphenated custom property name.

### Colors

The `colors {}` section defines your color palette. Values are strings (hex, rgb, hsl, or any valid CSS color). Use dot-notation for color variants:

```tova
theme {
  colors {
    primary: "#3b82f6"
    primary.hover: "#2563eb"
    primary.light: "#dbeafe"
    secondary: "#64748b"
    danger: "#ef4444"
    success: "#22c55e"
    text: "#1e293b"
    text.muted: "#64748b"
    surface: "#ffffff"
    border: "#e2e8f0"
  }
}
```

Color values are emitted as-is (no `px` suffix). The CSS variable prefix is `--tova-color-`:

```css
:root {
  --tova-color-primary: #3b82f6;
  --tova-color-primary-hover: #2563eb;
  --tova-color-primary-light: #dbeafe;
  --tova-color-text: #1e293b;
  --tova-color-text-muted: #64748b;
  /* ... */
}
```

### Spacing

The `spacing {}` section defines spacing values for margins, padding, and gaps. Numeric values automatically get a `px` suffix in the compiled output:

```tova
theme {
  spacing {
    xs: 4
    sm: 8
    md: 16
    lg: 24
    xl: 32
    xxl: 48
  }
}
```

Compiles to:

```css
:root {
  --tova-spacing-xs: 4px;
  --tova-spacing-sm: 8px;
  --tova-spacing-md: 16px;
  --tova-spacing-lg: 24px;
  --tova-spacing-xl: 32px;
  --tova-spacing-xxl: 48px;
}
```

### Border Radius

The `radius {}` section defines border radius values. Like spacing, numeric values get a `px` suffix:

```tova
theme {
  radius {
    sm: 4
    md: 8
    lg: 16
    full: 9999
  }
}
```

Compiles to:

```css
:root {
  --tova-radius-sm: 4px;
  --tova-radius-md: 8px;
  --tova-radius-lg: 16px;
  --tova-radius-full: 9999px;
}
```

### Shadows

The `shadow {}` section defines box shadow values. Values are strings and are emitted verbatim (no `px` suffix):

```tova
theme {
  shadow {
    sm: "0 1px 2px rgba(0,0,0,0.05)"
    md: "0 4px 6px rgba(0,0,0,0.1)"
    lg: "0 10px 15px rgba(0,0,0,0.1)"
  }
}
```

Compiles to:

```css
:root {
  --tova-shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --tova-shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --tova-shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
}
```

### Typography

The `font {}` section defines font families, sizes, and weights. It uses dot-notation to organize sub-categories:

```tova
theme {
  font {
    family: "'Inter', system-ui, sans-serif"
    mono: "'Fira Code', monospace"
    size.sm: 14
    size.base: 16
    size.lg: 20
    size.xl: 24
    weight.normal: "400"
    weight.medium: "500"
    weight.bold: "700"
  }
}
```

Font size tokens (`font.size.*`) are numeric and get a `px` suffix. Family and weight tokens are strings and are emitted verbatim:

```css
:root {
  --tova-font-family: 'Inter', system-ui, sans-serif;
  --tova-font-mono: 'Fira Code', monospace;
  --tova-font-size-sm: 14px;
  --tova-font-size-base: 16px;
  --tova-font-size-lg: 20px;
  --tova-font-size-xl: 24px;
  --tova-font-weight-normal: 400;
  --tova-font-weight-medium: 500;
  --tova-font-weight-bold: 700;
}
```

### Breakpoints

The `breakpoints {}` section defines named breakpoints for responsive design. Values are numeric (pixels):

```tova
theme {
  breakpoints {
    mobile: 0
    tablet: 768
    desktop: 1024
    wide: 1440
  }
}
```

Breakpoint values compile to CSS custom properties with a `px` suffix:

```css
:root {
  --tova-breakpoint-mobile: 0px;
  --tova-breakpoint-tablet: 768px;
  --tova-breakpoint-desktop: 1024px;
  --tova-breakpoint-wide: 1440px;
}
```

These named breakpoints can be referenced in responsive `style {}` blocks within your components.

### Transitions

The `transition {}` section defines timing values for CSS transitions. Values are strings containing duration and easing:

```tova
theme {
  transition {
    fast: "150ms ease"
    normal: "300ms ease"
    slow: "500ms ease-in-out"
  }
}
```

Compiles to:

```css
:root {
  --tova-transition-fast: 150ms ease;
  --tova-transition-normal: 300ms ease;
  --tova-transition-slow: 500ms ease-in-out;
}
```

## Dark Mode Overrides

The `dark {}` section inside `theme {}` overrides specific tokens for dark color schemes. It uses `section.token` dot-notation to reference tokens from other sections:

```tova
theme {
  colors {
    primary: "#3b82f6"
    text: "#1e293b"
    surface: "#ffffff"
    border: "#e2e8f0"
  }

  shadow {
    md: "0 4px 6px rgba(0,0,0,0.1)"
  }

  dark {
    colors.primary: "#60a5fa"
    colors.text: "#f1f5f9"
    colors.surface: "#1e293b"
    colors.border: "#334155"
    shadow.md: "0 4px 6px rgba(0,0,0,0.3)"
  }
}
```

The `dark {}` section compiles to a `@media (prefers-color-scheme: dark)` block that overrides only the specified custom properties:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --tova-color-primary: #60a5fa;
    --tova-color-text: #f1f5f9;
    --tova-color-surface: #1e293b;
    --tova-color-border: #334155;
    --tova-shadow-md: 0 4px 6px rgba(0,0,0,0.3);
  }
}
```

::: tip
You only need to override the tokens that change in dark mode. Any tokens not listed in `dark {}` retain their default values.
:::

::: warning
The `dark {}` section must reference sections that exist in your theme. Writing `dark { foo.bar: "red" }` where `foo` is not a defined section triggers the `W_DARK_OVERRIDE_UNKNOWN_SECTION` warning.
:::

## Compiled Output

The compiler transforms the `theme {}` block into CSS custom properties following a consistent naming convention:

**Naming pattern:** `--tova-{category}-{token}`

Where `{category}` is the singular CSS category name derived from the section, and `{token}` is the token name with dots converted to hyphens.

| Section | CSS Prefix | Numeric suffix |
|---------|-----------|----------------|
| `colors` | `--tova-color-` | none |
| `spacing` | `--tova-spacing-` | `px` |
| `radius` | `--tova-radius-` | `px` |
| `shadow` | `--tova-shadow-` | none |
| `font` | `--tova-font-` | `px` for `size.*` tokens |
| `breakpoints` | `--tova-breakpoint-` | `px` |
| `transition` | `--tova-transition-` | none |

**Suffix rules:**

- Numeric values in `spacing`, `radius`, `breakpoints`, and `font.size.*` tokens get an automatic `px` suffix
- String values (colors, shadows, font families, weights, transitions) are emitted verbatim with quotes stripped

Here is a complete example showing a full theme and its compiled output:

```tova
theme {
  colors {
    primary: "#3b82f6"
    primary.hover: "#2563eb"
    danger: "#ef4444"
    text: "#1e293b"
  }

  spacing {
    sm: 8
    md: 16
  }

  radius {
    md: 8
    full: 9999
  }

  shadow {
    md: "0 4px 6px rgba(0,0,0,0.1)"
  }

  font {
    family: "'Inter', sans-serif"
    size.base: 16
    weight.bold: "700"
  }

  transition {
    normal: "300ms ease"
  }

  dark {
    colors.primary: "#60a5fa"
    colors.text: "#f1f5f9"
  }
}
```

Compiled CSS:

```css
:root {
  --tova-color-primary: #3b82f6;
  --tova-color-primary-hover: #2563eb;
  --tova-color-danger: #ef4444;
  --tova-color-text: #1e293b;
  --tova-spacing-sm: 8px;
  --tova-spacing-md: 16px;
  --tova-radius-md: 8px;
  --tova-radius-full: 9999px;
  --tova-shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --tova-font-family: 'Inter', sans-serif;
  --tova-font-size-base: 16px;
  --tova-font-weight-bold: 700;
  --tova-transition-normal: 300ms ease;
}

@media (prefers-color-scheme: dark) {
  :root {
    --tova-color-primary: #60a5fa;
    --tova-color-text: #f1f5f9;
  }
}
```

## Using Tokens in Components

Inside `browser {}` components, you reference theme tokens in `style {}` blocks using the `$category.name` syntax:

```tova
browser {
  component Button(label: String) {
    style {
      .btn {
        background: $color.primary
        color: $color.surface
        padding: $spacing.sm $spacing.md
        border-radius: $radius.md
        font-family: $font.family
        font-size: $font.size.base
        transition: background $transition.fast
        box-shadow: $shadow.sm
      }

      .btn:hover {
        background: $color.primary.hover
      }
    }

    <button class="btn">{label}</button>
  }
}
```

The `$color.primary` reference compiles to `var(--tova-color-primary)` in the generated CSS. This gives you full type-safe access to your design tokens with compile-time warnings if you reference a token that does not exist.

For full details on styling, scoped CSS, and responsive breakpoints, see the [Styling](/reactivity/styling) page.

## Analyzer Warnings

The Tova analyzer validates your `theme {}` block at compile time and produces the following warnings:

| Warning Code | Description |
|-------------|-------------|
| `W_UNKNOWN_THEME_SECTION` | A section name is not one of the recognized types (`colors`, `spacing`, `radius`, `shadow`, `font`, `breakpoints`, `transition`, `dark`). |
| `W_DUPLICATE_THEME_SECTION` | The same section appears more than once in the theme block. |
| `W_DUPLICATE_THEME_TOKEN` | The same token name is defined more than once within a single section. |
| `W_MULTIPLE_THEME_BLOCKS` | More than one `theme {}` block exists in the application. Only one theme is allowed. |
| `W_DARK_OVERRIDE_UNKNOWN_SECTION` | A `dark {}` override references a section name (e.g., `foo.bar`) where `foo` is not a section defined in the theme. |

## Related Pages

- [Browser Block](/fullstack/browser-block) -- where components and UI live
- [Styling](/reactivity/styling) -- using `$token` references and scoped CSS in components
- [Security Block](/fullstack/security-block) -- centralized security policy
- [Architecture](/fullstack/architecture) -- how blocks fit together in a Tova application
