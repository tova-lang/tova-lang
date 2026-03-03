# Tova UI Component Library Design

**Date:** 2026-03-03
**Status:** Approved

## Overview

A production-ready UI component library for Tova, distributed as the blessed package `tova/ui`. Developers import components via `import { Button, Dialog } from "tova/ui"` and get fully accessible, responsive, animated components that automatically integrate with their project's `theme {}` block.

### Key Differentiators (vs shadcn/Radix/Headless UI)

1. **Compiler-powered accessibility** — ARIA attributes, keyboard navigation, focus management injected automatically. Zero a11y boilerplate.
2. **Adaptive responsive by default** — Every component reshapes at breakpoints. Dialog becomes bottom sheet on mobile. Table becomes card list. Zero extra code.
3. **Built-in animation/transitions** — Polished enter/exit/state-change animations using Tova's `animate` system. Respects `prefers-reduced-motion` automatically.
4. **Theme-driven customization** — All components read from the developer's `theme {}` block via CSS custom properties. Change the theme, change every component.

### Design Decisions

- **Distribution:** Package import (`import { Button } from "tova/ui"`)
- **Customization:** Theme-driven + prop variants (not slots, not CSS-only)
- **Scope:** Essential kit (~25 components)
- **Technical format:** `.tova` source files compiled alongside user code
- **Architecture:** Flat component library (Approach A) — one component per file, shared internal primitives

## Package Structure

Created via `tova new tova-ui --template library` in `../tova-packages/`.

```
../tova-packages/ui/
├── tova.toml              # [package] name = "github.com/tova-lang/ui"
├── src/
│   ├── lib.tova           # Re-exports all components
│   ├── button.tova
│   ├── input.tova
│   ├── select.tova
│   ├── checkbox.tova
│   ├── radio.tova
│   ├── switch.tova
│   ├── textarea.tova
│   ├── label.tova
│   ├── badge.tova
│   ├── avatar.tova
│   ├── card.tova
│   ├── dialog.tova
│   ├── dropdown.tova
│   ├── toast.tova
│   ├── tooltip.tova
│   ├── tabs.tova
│   ├── accordion.tova
│   ├── table.tova
│   ├── pagination.tova
│   ├── breadcrumb.tova
│   ├── progress.tova
│   ├── spinner.tova
│   ├── alert.tova
│   ├── separator.tova
│   ├── skeleton.tova
│   └── _shared.tova       # Internal: focus trap, portal, dismiss, click-outside, auto-id, arrow-nav, type-ahead
├── .tova-out/
└── README.md
```

**Blessed shorthand:** `tova/ui` → `github.com/tova-lang/ui`

**tova.toml:**
```toml
[package]
name = "github.com/tova-lang/ui"
version = "0.1.0"
description = "Production-ready UI components for Tova"
license = "MIT"
exports = ["Button", "Input", "Select", "Checkbox", "Radio", "Switch",
           "Textarea", "Label", "Badge", "Avatar", "Card", "Dialog",
           "Dropdown", "Toast", "Tooltip", "Tabs", "Accordion", "Table",
           "Pagination", "Breadcrumb", "Progress", "Spinner", "Alert",
           "Separator", "Skeleton"]

[build]
output = ".tova-out"

[dependencies]

[npm]
```

## Component API Conventions

### Universal Props

Every component accepts:
- `variant` — Visual style variant (component-specific values)
- `size` — Size: `"sm"` | `"md"` | `"lg"`
- `class` — Additional CSS classes (merged, never replaced)
- `disabled` — Disabled state
- `id` — HTML id passthrough

### Variant Map

| Component | `variant` values | `size` values | Extra props |
|-----------|-----------------|---------------|-------------|
| Button | `primary`, `secondary`, `outline`, `ghost`, `destructive`, `link` | `sm`, `md`, `lg`, `icon` | `loading`, `type` |
| Input | `default`, `error`, `success` | `sm`, `md`, `lg` | `type`, `placeholder`, `bind:value` |
| Badge | `default`, `secondary`, `outline`, `destructive` | `sm`, `md` | — |
| Alert | `info`, `success`, `warning`, `error` | — | `dismissible`, `on:dismiss` |
| Card | `default`, `outline`, `elevated` | — | `padding` |

### Compound Components (dot notation)

Complex components expose sub-components:
- `Dialog.Title`, `Dialog.Description`, `Dialog.Footer`
- `Tabs.List`, `Tabs.Trigger`, `Tabs.Panel`
- `Table.Column`, `Table.Header`, `Table.Body`
- `Dropdown.Trigger`, `Dropdown.Menu`, `Dropdown.Item`, `Dropdown.Separator`
- `Accordion.Item`, `Accordion.Trigger`, `Accordion.Content`
- `Card.Header`, `Card.Title`, `Card.Description`, `Card.Body`, `Card.Footer`
- `Alert.Title`, `Alert.Description`
- `Breadcrumb.Item`
- `Select.Option`, `Select.Group`
- `Radio.Group`
- `Skeleton` (variants: `rect`, `circle`, `text`)

### Theme Integration

All components read from the developer's `theme {}` block via CSS custom properties:

```
theme {
  colors {
    primary: "#3b82f6"
    primary.hover: "#2563eb"
    primary.foreground: "#ffffff"
    destructive: "#ef4444"
    destructive.foreground: "#ffffff"
    muted: "#f1f5f9"
    muted.foreground: "#64748b"
    border: "#e2e8f0"
    ring: "#3b82f6"
    background: "#ffffff"
    foreground: "#0f172a"
    accent: "#f1f5f9"
    accent.foreground: "#0f172a"
  }
  radius { sm: 4; md: 8; lg: 12 }
  spacing { sm: 8; md: 12; lg: 16 }
}
```

Components reference as `$color.primary`, `$radius.md`, `$spacing.sm`, etc.

## Responsive Adaptation

Every component automatically adapts at theme breakpoints. Zero developer code required.

| Component | Desktop | Mobile |
|-----------|---------|--------|
| Dialog | Centered modal | Bottom sheet, swipe to dismiss |
| Dropdown | Floating popover below trigger | Full-width bottom sheet |
| Select | Inline dropdown | Full-screen picker with search |
| Table | Standard columns | Stacked card layout per row |
| Tabs | Horizontal tab bar | Scrollable tabs |
| Toast | Top-right stack | Bottom-center, full-width |
| Tooltip | Floating near trigger | Hidden (long-press on touch) |
| Pagination | Full page numbers | Compact prev/next + current |
| Breadcrumb | Full path | Collapsed with ellipsis |

Uses Tova's `responsive {}` block within component `style {}`:

```
style {
  .dialog-content {
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%); max-width: 480px;
  }
  responsive {
    mobile {
      .dialog-content {
        top: auto; bottom: 0; left: 0;
        transform: none; width: 100%; max-width: 100%;
        border-radius: $radius.lg $radius.lg 0 0;
        max-height: 85vh; overflow-y: auto;
      }
    }
  }
}
```

## Built-in Animations

Every component ships with polished enter/exit transitions via Tova's `animate` system.

| Component | Enter | Exit | State Change |
|-----------|-------|------|-------------|
| Dialog | Fade + scale up | Fade out | — |
| Dialog (mobile) | Slide up | Slide down | — |
| Toast | Slide in from edge | Slide out + fade | — |
| Dropdown | Fade + slide down 4px | Fade out | — |
| Accordion | Height expand (spring) | Height collapse | — |
| Tabs.Panel | Fade crossfade | Fade out | — |
| Tooltip | Fade + scale from 0.95 | Fade out | — |
| Skeleton | — | — | Pulse shimmer loop |
| Progress | — | — | Width transition (smooth) |
| Switch | — | — | Thumb slide + color transition |
| Alert (dismissible) | Fade + slide in | Collapse height | — |

All animations respect `prefers-reduced-motion` automatically.

## Accessibility

### Automatic ARIA Injection

| Component | Auto-generated A11y |
|-----------|-------------------|
| Button | `type="button"`, `aria-disabled`, `aria-busy` when loading |
| Dialog | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → Title, `aria-describedby` → Description |
| Tabs.Trigger | `role="tab"`, `aria-selected`, `aria-controls` → Panel |
| Tabs.Panel | `role="tabpanel"`, `aria-labelledby` → Trigger |
| Tabs.List | `role="tablist"` |
| Accordion | `aria-expanded` on trigger, `aria-controls` → content, `role="region"` on content |
| Alert | `role="alert"` or `role="status"` |
| Toast | `role="status"`, `aria-live="polite"` (or `"assertive"` for errors) |
| Tooltip | `role="tooltip"`, trigger gets `aria-describedby` |
| Progress | `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` |
| Dropdown | `role="menu"`, items `role="menuitem"`, trigger `aria-haspopup`, `aria-expanded` |
| Select | `role="listbox"`, options `role="option"`, `aria-selected` |
| Switch | `role="switch"`, `aria-checked` |
| Checkbox | `role="checkbox"`, `aria-checked` (supports indeterminate) |
| Spinner | `role="status"`, `aria-label="Loading"` |
| Skeleton | `aria-hidden="true"` |

### Keyboard Navigation

**Focus Trap** (Dialog, Dropdown, Select): Tab/Shift+Tab cycles within component. Focus returns to trigger on close.

**Arrow Navigation** (Tabs, Dropdown, Select, Radio): Up/Down or Left/Right moves between items. Home/End jump to first/last. Wraps around.

**Dismiss** (Dialog, Dropdown, Toast, Tooltip, Select): Escape closes. Click outside closes (configurable).

**Type-ahead** (Select, Dropdown): Typing characters jumps to matching item. 300ms debounced reset.

| Component | Keyboard | Behavior |
|-----------|----------|----------|
| Dialog | Escape | Close, return focus to trigger |
| Tabs | Arrow Left/Right | Switch tabs; Home/End first/last |
| Accordion | Arrow Up/Down | Navigate triggers; Enter/Space toggle |
| Dropdown | Arrow Down opens, arrows navigate, Enter selects |
| Select | Space/Enter opens, arrows navigate, Enter selects, Escape closes |
| Toast | Escape | Dismiss focused toast |
| Switch | Space | Toggle on/off |
| Checkbox | Space | Toggle checked |

### Behavioral Primitives (`_shared.tova`, internal only)

```
fn _focusTrap(container)
fn _dismissOnEscape(callback)
fn _dismissOnClickOutside(el, callback)
fn _arrowNavigation(items, orientation)
fn _typeAhead(items, onMatch)
fn _portal(content)
fn _autoId()
```

## Full Component Specifications

### Input Components

**Button** — Props: `variant` (primary/secondary/outline/ghost/destructive/link), `size` (sm/md/lg/icon), `loading`, `disabled`, `type` (button/submit/reset)

**Input** — Props: `type`, `placeholder`, `bind:value`, `variant` (default/error/success), `size`, `disabled`, `readonly`

**Textarea** — Props: `placeholder`, `bind:value`, `rows`, `autoResize`, `maxRows`, `variant`, `size`, `disabled`

**Select** — Compound: `Select.Option` (value), `Select.Group` (label). Props: `bind:value`, `placeholder`, `searchable`, `multiple`, `disabled`, `size`

**Checkbox** — Props: `bind:checked`, `indeterminate`, `disabled`, `id`. Children = label text.

**Radio** — Compound: `Radio.Group` (bind:value, orientation). `Radio` (value, disabled). Children = label text.

**Switch** — Props: `bind:checked`, `disabled`, `size`. Children = label text.

**Label** — Props: `for`, `required` (shows asterisk).

### Layout & Containers

**Card** — Compound: `Card.Header`, `Card.Title`, `Card.Description`, `Card.Body`, `Card.Footer`. Props: `variant` (default/outline/elevated), `padding` (none/sm/md/lg).

**Separator** — Props: `orientation` (horizontal/vertical), `decorative`.

### Feedback & Status

**Badge** — Props: `variant` (default/secondary/outline/destructive), `size` (sm/md).

**Alert** — Compound: `Alert.Title`, `Alert.Description`. Props: `variant` (info/success/warning/error), `dismissible`, `on:dismiss`.

**Toast** — `Toast.Provider` (position, maxVisible) placed in App. Imperative: `Toast.show(message, variant, duration, dismissible)`.

**Progress** — Props: `value`, `max`, `size`, `indeterminate`, `variant`.

**Spinner** — Props: `size`, `label` (screen reader text).

**Skeleton** — Props: `variant` (rect/circle/text), `width`, `height`, `size`, `lines`.

### Overlay & Popover

**Dialog** — Compound: `Dialog.Title`, `Dialog.Description`, `Dialog.Footer`. Props: `open`, `on:close`, `closeOnOverlay`, `closeOnEscape`.

**Dropdown** — Compound: `Dropdown.Trigger`, `Dropdown.Menu`, `Dropdown.Item`, `Dropdown.Separator`. `Dropdown.Item` props: `on:select`, `disabled`, `variant`.

**Tooltip** — Props: `content`, `position` (top/bottom/left/right), `delay` (default 400ms).

### Navigation

**Tabs** — Compound: `Tabs.List`, `Tabs.Trigger` (value, disabled), `Tabs.Panel` (value). Props: `default`, `on:change`, `orientation`.

**Accordion** — Compound: `Accordion.Item` (value), `Accordion.Trigger`, `Accordion.Content`. Props: `type` (single/multiple), `collapsible`, `default`.

**Breadcrumb** — Compound: `Breadcrumb.Item` (href, active, separator). Default separator: "/".

**Pagination** — Props: `total`, `pageSize`, `current`, `on:change`, `siblingCount`.

### Data Display

**Table** — Compound: `Table.Column` (key, header, sortable, width, render fn via children). Props: `data`, `striped`, `hoverable`, `compact`.

**Avatar** — Props: `src`, `alt`, `fallback` (initials), `size`.
