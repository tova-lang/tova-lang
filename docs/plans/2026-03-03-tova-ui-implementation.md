# Tova UI Component Library — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a 25-component UI library (`tova/ui`) as a blessed package with compiler-powered a11y, adaptive responsive, and built-in animations.

**Architecture:** Components are `.tova` source files in `../tova-packages/ui/`. Each component is defined inside a `browser {}` block using Tova's component/style/variant/animate features. The compiler needs a small extension: allow `pub component` to export components from library packages. The package integrates with the developer's `theme {}` via CSS custom properties. Compound components (e.g., `Dialog.Title`) are implemented as sub-components attached as properties on the parent component function.

**Tech Stack:** Tova compiler, browser-codegen, CSS custom properties, Tova animate system

**Critical pre-work:** The compiler currently restricts components to `browser {}` blocks and has no mechanism for exporting components from packages. Tasks 1-3 address this by adding `pub component` support for library packages.

---

### Task 1: Register `tova/ui` as a Blessed Package

**Files:**
- Modify: `src/config/module-path.js:6-17`

**Step 1: Write the failing test**

Create a test that verifies `tova/ui` is recognized as a blessed package:

```javascript
// In tests/ — add to existing module-path tests or create new
import { expandBlessedPackage, isTovModule } from '../src/config/module-path.js';

test('tova/ui is a blessed package', () => {
  expect(expandBlessedPackage('tova/ui')).toBe('github.com/tova-lang/ui');
  expect(isTovModule('tova/ui')).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/module-path.test.js` (or whichever file contains the test)
Expected: FAIL — `tova/ui` not in BLESSED_PACKAGES

**Step 3: Add `ui` to BLESSED_PACKAGES**

In `src/config/module-path.js`, add to the BLESSED_PACKAGES object:

```javascript
ui: 'github.com/tova-lang/ui',
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/module-path.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config/module-path.js tests/module-path.test.js
git commit -m "feat: register tova/ui as blessed package"
```

---

### Task 2: Allow `pub component` Export in Library Packages

Currently, components can only exist inside `browser {}` blocks and cannot be exported with `pub`. We need to:
1. Allow `component` declarations at the top level of a `.tova` file (when it's a library)
2. Allow `pub component` to mark a component as exported
3. Generate `export function ComponentName(...)` in the compiled output

**Files:**
- Modify: `src/parser/browser-parser.js` (allow `parseComponent` to be called from top-level when preceded by `pub`)
- Modify: `src/parser/parser.js` (recognize `pub component` at top level)
- Modify: `src/parser/ast.js` (add `pub` field to ComponentDeclaration)
- Modify: `src/analyzer/browser-analyzer.js:94-98` (relax browser-only restriction for `pub component`)
- Modify: `src/codegen/browser-codegen.js` (generate `export function` for pub components)
- Test: `tests/pub-component.test.js`

**Step 1: Write failing test for `pub component` parsing**

```javascript
// tests/pub-component.test.js
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

test('pub component parses at top level', () => {
  const source = `
pub component Button(variant, size, children) {
  style {
    .btn { padding: 8px 16px; }
  }
  <button class="btn">{children}</button>
}
`;
  const lexer = new Lexer(source, 'test.tova');
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, 'test.tova');
  const ast = parser.parse();

  expect(ast.body.length).toBe(1);
  expect(ast.body[0].type).toBe('ComponentDeclaration');
  expect(ast.body[0].name).toBe('Button');
  expect(ast.body[0].pub).toBe(true);
  expect(ast.body[0].params.length).toBe(3);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/pub-component.test.js`
Expected: FAIL — parser doesn't recognize `pub component` at top level

**Step 3: Implement `pub component` parsing**

In `src/parser/parser.js`, in the top-level `parseDeclaration()` or `parseStatement()` method, add handling for `pub component`:

When the parser sees `pub` followed by `component`, it should:
1. Set a `pub` flag
2. Delegate to `parseComponent()` (from browser-parser.js)
3. Attach `pub: true` to the resulting ComponentDeclaration node

In `src/parser/ast.js`, add `pub` field to `ComponentDeclaration`:
```javascript
// In ComponentDeclaration constructor, add:
this.pub = options?.pub || false;
```

In `src/parser/browser-parser.js`, ensure `parseComponent()` can accept a `pub` parameter and attach it.

**Step 4: Run test to verify it passes**

Run: `bun test tests/pub-component.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/parser/parser.js src/parser/ast.js src/parser/browser-parser.js tests/pub-component.test.js
git commit -m "feat: parse pub component at top level"
```

---

### Task 3: Compile `pub component` to Exported Functions

**Files:**
- Modify: `src/codegen/codegen.js` (route top-level ComponentDeclaration to browser-codegen)
- Modify: `src/codegen/browser-codegen.js` (generate `export function` for pub components)
- Modify: `src/analyzer/browser-analyzer.js:94-98` (allow pub component outside browser block)
- Test: `tests/pub-component.test.js` (add codegen tests)

**Step 1: Write failing test for `pub component` codegen**

```javascript
test('pub component compiles to export function', () => {
  const source = `
pub component Button(variant, size, children) {
  <button class="btn">{children}</button>
}
`;
  const result = compile(source);
  expect(result).toContain('export function Button');
  expect(result).toContain('tova_el');
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/pub-component.test.js`
Expected: FAIL — analyzer error "component can only be used inside a browser block"

**Step 3: Implement codegen for pub component**

In `src/analyzer/browser-analyzer.js`, modify `visitComponentDeclaration`:
```javascript
if (ctx !== 'browser' && !node.pub) {
  this.error(`'component' can only be used inside a browser block`, ...);
}
```

In `src/codegen/codegen.js`, add handling for top-level ComponentDeclaration:
- When encountering a ComponentDeclaration at the top level (not inside a browser block), delegate to browser-codegen's component generation
- Prefix with `export` if `node.pub === true`
- Include the reactivity runtime imports (createSignal, createEffect, etc.)
- Include the DOM runtime (tova_el, tova_fragment, etc.)

**Step 4: Run test to verify it passes**

Run: `bun test tests/pub-component.test.js`
Expected: PASS

**Step 5: Run full test suite to verify no regressions**

Run: `bun test`
Expected: All existing tests pass

**Step 6: Commit**

```bash
git add src/codegen/codegen.js src/codegen/browser-codegen.js src/analyzer/browser-analyzer.js tests/pub-component.test.js
git commit -m "feat: compile pub component to exported functions"
```

---

### Task 4: Support Compound Components (Dot Notation)

Components like `Dialog.Title` need the parent component function to have sub-component properties. This is a pattern like:

```javascript
export function Dialog(...) { ... }
Dialog.Title = function DialogTitle(...) { ... };
Dialog.Description = function DialogDescription(...) { ... };
Dialog.Footer = function DialogFooter(...) { ... };
```

**Files:**
- Modify: `src/parser/browser-parser.js` or `src/parser/parser.js` (parse `component Dialog.Title`)
- Modify: `src/codegen/browser-codegen.js` (emit property assignment for dot-notation components)
- Test: `tests/pub-component.test.js`

**Step 1: Write failing test**

```javascript
test('compound component Dialog.Title parses and compiles', () => {
  const source = `
pub component Dialog(open, on_close, children) {
  <div class="dialog">{children}</div>
}

pub component Dialog.Title(children) {
  <h2 class="dialog-title">{children}</h2>
}

pub component Dialog.Footer(children) {
  <div class="dialog-footer">{children}</div>
}
`;
  const result = compile(source);
  expect(result).toContain('export function Dialog');
  expect(result).toContain('Dialog.Title = function DialogTitle');
  expect(result).toContain('Dialog.Footer = function DialogFooter');
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/pub-component.test.js`
Expected: FAIL

**Step 3: Implement compound component support**

Parser changes:
- After parsing `component`, check if the next token after the name is `.` (DOT)
- If so, parse `Parent.Child` as the component name
- Store `parent: "Dialog"` and `child: "Title"` on the AST node

Codegen changes:
- For compound components, instead of `export function Dialog_Title`, emit:
  ```javascript
  Dialog.Title = function DialogTitle(__props) { ... };
  ```
- The parent component must be declared before its children

**Step 4: Run test to verify it passes**

Run: `bun test tests/pub-component.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/parser/browser-parser.js src/parser/parser.js src/codegen/browser-codegen.js tests/pub-component.test.js
git commit -m "feat: compound component dot notation (Dialog.Title)"
```

---

### Task 5: Create the `tova-ui` Package Scaffold

**Step 1: Create the package directory**

```bash
cd /Users/macm1/new-y-combinator/tova-packages
mkdir ui
```

**Step 2: Create `tova.toml`**

```toml
[package]
name = "tova/ui"
version = "0.1.0"
description = "Production-ready UI components for Tova — accessible, responsive, animated"
license = "MIT"

[build]
output = ".tova-out"

[dependencies]

[npm]
```

**Step 3: Create `src/lib.tova`**

```tova
// tova/ui — Production-ready UI components
//
// Usage:
//   import { Button, Input, Card, Dialog } from "tova/ui"

pub fn version() {
  "0.1.0"
}
```

**Step 4: Create `.gitignore`**

```
node_modules/
.tova-out/
*.db
.DS_Store
```

**Step 5: Create `README.md`**

Basic readme with usage instructions.

**Step 6: Initialize git**

```bash
cd ui && git init
```

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: initial tova/ui package scaffold"
```

---

### Task 6: Internal Shared Primitives (`_shared.tova`)

Behavioral primitives used internally by overlay/interactive components. NOT exported publicly.

**Files:**
- Create: `../tova-packages/ui/src/_shared.tova`

**Implementation:**

```tova
// Internal behavioral primitives — not exported

fn _autoId() {
  _autoId._counter = (_autoId._counter || 0) + 1
  "tova-ui-" ++ str(_autoId._counter)
}

fn _focusTrap(container) {
  // Returns cleanup function
  // On Tab: cycle focus within container
  // On Shift+Tab: cycle backwards
  focusable = container.querySelectorAll(
    "button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])"
  )
  first_el = focusable[0]
  last_el = focusable[len(focusable) - 1]

  handler = fn(e) {
    if e.key == "Tab" {
      if e.shiftKey {
        if document.activeElement == first_el {
          e.preventDefault()
          last_el.focus()
        }
      } else {
        if document.activeElement == last_el {
          e.preventDefault()
          first_el.focus()
        }
      }
    }
  }
  container.addEventListener("keydown", handler)
  first_el.focus()
  fn() container.removeEventListener("keydown", handler)
}

fn _dismissOnEscape(callback) {
  handler = fn(e) {
    if e.key == "Escape" {
      callback()
    }
  }
  document.addEventListener("keydown", handler)
  fn() document.removeEventListener("keydown", handler)
}

fn _dismissOnClickOutside(el, callback) {
  handler = fn(e) {
    if !el.contains(e.target) {
      callback()
    }
  }
  // Use setTimeout to avoid catching the opening click
  timer = setTimeout(fn() {
    document.addEventListener("mousedown", handler)
  }, 0)
  fn() {
    clearTimeout(timer)
    document.removeEventListener("mousedown", handler)
  }
}

fn _arrowNavigation(container, orientation) {
  // orientation: "horizontal" or "vertical"
  prev_key = if orientation == "horizontal" { "ArrowLeft" } else { "ArrowUp" }
  next_key = if orientation == "horizontal" { "ArrowRight" } else { "ArrowDown" }

  handler = fn(e) {
    items = Array.from(container.querySelectorAll("[role=tab], [role=menuitem], [role=option], [role=radio]"))
    idx = items.indexOf(document.activeElement)
    if idx < 0 { return () }

    match e.key {
      k if k == next_key => {
        e.preventDefault()
        next_idx = if idx >= len(items) - 1 { 0 } else { idx + 1 }
        items[next_idx].focus()
      }
      k if k == prev_key => {
        e.preventDefault()
        prev_idx = if idx <= 0 { len(items) - 1 } else { idx - 1 }
        items[prev_idx].focus()
      }
      "Home" => {
        e.preventDefault()
        items[0].focus()
      }
      "End" => {
        e.preventDefault()
        items[len(items) - 1].focus()
      }
      _ => ()
    }
  }
  container.addEventListener("keydown", handler)
  fn() container.removeEventListener("keydown", handler)
}

fn _typeAhead(container, onMatch) {
  buf = ""
  timer = nil

  handler = fn(e) {
    if len(e.key) == 1 {
      clearTimeout(timer)
      buf = buf ++ e.key
      onMatch(buf)
      timer = setTimeout(fn() { buf = "" }, 300)
    }
  }
  container.addEventListener("keydown", handler)
  fn() container.removeEventListener("keydown", handler)
}

fn _portal(content_fn) {
  // Creates a portal container in document.body
  portal = document.createElement("div")
  portal.setAttribute("data-tova-portal", "true")
  document.body.appendChild(portal)
  content_fn(portal)
  fn() document.body.removeChild(portal)
}
```

**Step 1:** Write the file
**Step 2:** Verify it compiles: `cd ../tova-packages/ui && tova build`
**Step 3:** Commit

---

### Task 7: Button Component

The first and simplest component. Establishes the pattern for all others.

**Files:**
- Create: `../tova-packages/ui/src/button.tova`
- Modify: `../tova-packages/ui/src/lib.tova` (re-export)

**Implementation:**

```tova
pub component Button(variant, size, loading, disabled, type, class, children) {
  // Defaults
  btn_variant = variant || "primary"
  btn_size = size || "md"
  btn_type = type || "button"
  is_loading = loading || false
  is_disabled = disabled || is_loading

  style {
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-weight: 500;
      border: 1px solid transparent;
      cursor: pointer;
      transition: background-color 150ms ease, border-color 150ms ease, opacity 150ms ease;
      font-family: inherit;
      line-height: 1;
      white-space: nowrap;
      text-decoration: none;
    }
    .btn:focus-visible {
      outline: 2px solid $color.ring;
      outline-offset: 2px;
    }
    .btn:disabled, .btn[aria-disabled="true"] {
      opacity: 0.5;
      cursor: not-allowed;
      pointer-events: none;
    }
    .btn .spinner {
      animation: btn-spin 600ms linear infinite;
    }
    @keyframes btn-spin {
      to { transform: rotate(360deg); }
    }

    variant(variant) {
      primary {
        background: $color.primary;
        color: $color.primary.foreground;
        border-color: $color.primary;
      }
      primary:hover {
        background: $color.primary.hover;
        border-color: $color.primary.hover;
      }
      secondary {
        background: $color.muted;
        color: $color.muted.foreground;
        border-color: $color.border;
      }
      secondary:hover {
        background: $color.accent;
      }
      outline {
        background: transparent;
        color: $color.foreground;
        border-color: $color.border;
      }
      outline:hover {
        background: $color.accent;
        color: $color.accent.foreground;
      }
      ghost {
        background: transparent;
        color: $color.foreground;
      }
      ghost:hover {
        background: $color.accent;
        color: $color.accent.foreground;
      }
      destructive {
        background: $color.destructive;
        color: $color.destructive.foreground;
      }
      destructive:hover {
        opacity: 0.9;
      }
      link {
        background: transparent;
        color: $color.primary;
        text-decoration: underline;
        text-underline-offset: 4px;
      }
      link:hover {
        text-decoration-thickness: 2px;
      }
    }

    variant(size) {
      sm {
        height: 32px;
        padding: 0 12px;
        font-size: 13px;
        border-radius: $radius.sm;
      }
      md {
        height: 40px;
        padding: 0 16px;
        font-size: 14px;
        border-radius: $radius.md;
      }
      lg {
        height: 48px;
        padding: 0 24px;
        font-size: 16px;
        border-radius: $radius.lg;
      }
      icon {
        height: 40px;
        width: 40px;
        padding: 0;
        border-radius: $radius.md;
      }
    }
  }

  variant_class = "btn btn--variant-" ++ btn_variant ++ " btn--size-" ++ btn_size
  full_class = if class { variant_class ++ " " ++ class } else { variant_class }

  <button
    type={btn_type}
    class={full_class}
    disabled={is_disabled}
    aria-disabled={if is_disabled { "true" } else { nil }}
    aria-busy={if is_loading { "true" } else { nil }}
  >
    if is_loading {
      <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" opacity="0.25" />
        <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round" />
      </svg>
    }
    {children}
  </button>
}
```

**Step 1:** Write `button.tova`
**Step 2:** Add to `lib.tova`: import and re-export
**Step 3:** Verify it compiles: `cd ../tova-packages/ui && tova build`
**Step 4:** Write test (see Task 26)
**Step 5:** Commit

---

### Task 8: Input Component

**Files:**
- Create: `../tova-packages/ui/src/input.tova`

```tova
pub component Input(type, placeholder, value, variant, size, disabled, readonly, class, id) {
  input_type = type || "text"
  input_variant = variant || "default"
  input_size = size || "md"

  style {
    .input {
      display: block;
      width: 100%;
      font-family: inherit;
      background: $color.background;
      color: $color.foreground;
      border: 1px solid $color.border;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }
    .input::placeholder {
      color: $color.muted.foreground;
    }
    .input:focus {
      outline: none;
      border-color: $color.ring;
      box-shadow: 0 0 0 2px color-mix(in srgb, $color.ring 25%, transparent);
    }
    .input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background: $color.muted;
    }

    variant(variant) {
      default {}
      error {
        border-color: $color.destructive;
      }
      error:focus {
        border-color: $color.destructive;
        box-shadow: 0 0 0 2px color-mix(in srgb, $color.destructive 25%, transparent);
      }
      success {
        border-color: #22c55e;
      }
      success:focus {
        border-color: #22c55e;
        box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25);
      }
    }

    variant(size) {
      sm {
        height: 32px;
        padding: 0 8px;
        font-size: 13px;
        border-radius: $radius.sm;
      }
      md {
        height: 40px;
        padding: 0 12px;
        font-size: 14px;
        border-radius: $radius.md;
      }
      lg {
        height: 48px;
        padding: 0 16px;
        font-size: 16px;
        border-radius: $radius.lg;
      }
    }
  }

  variant_class = "input input--variant-" ++ input_variant ++ " input--size-" ++ input_size
  full_class = if class { variant_class ++ " " ++ class } else { variant_class }

  <input
    type={input_type}
    placeholder={placeholder}
    value={value}
    class={full_class}
    disabled={disabled}
    readonly={readonly}
    id={id}
  />
}
```

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 9: Textarea Component

**Files:**
- Create: `../tova-packages/ui/src/textarea.tova`

Similar pattern to Input but with `rows`, `autoResize`, `maxRows` props. Uses a `<textarea>` element. Auto-resize implemented via `effect` that adjusts `style.height` on input.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 10: Label Component

**Files:**
- Create: `../tova-packages/ui/src/label.tova`

Simple component: `<label>` with `for` prop, optional `required` asterisk.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 11: Checkbox Component

**Files:**
- Create: `../tova-packages/ui/src/checkbox.tova`

Custom-styled checkbox with `bind:checked`, `indeterminate` support, ARIA `role="checkbox"`, `aria-checked`. Keyboard: Space toggles.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 12: Radio Component

**Files:**
- Create: `../tova-packages/ui/src/radio.tova`

Two components: `pub component Radio` and `pub component Radio.Group`. Group manages `bind:value`, Radio items use `aria-checked`, arrow key navigation.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 13: Switch Component

**Files:**
- Create: `../tova-packages/ui/src/switch.tova`

Toggle switch with `role="switch"`, `aria-checked`, thumb slide animation via CSS transition.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 14: Select Component

**Files:**
- Create: `../tova-packages/ui/src/select.tova`

Components: `Select`, `Select.Option`, `Select.Group`. Custom dropdown (not native `<select>`). Features: `role="listbox"`, `role="option"`, arrow navigation, type-ahead, escape to close, click-outside dismiss. Adaptive: becomes full-screen picker on mobile.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 15: Badge Component

**Files:**
- Create: `../tova-packages/ui/src/badge.tova`

Simple inline element with variant colors and sizes. No interactivity.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 16: Avatar Component

**Files:**
- Create: `../tova-packages/ui/src/avatar.tova`

Image with fallback to initials. Handles `onerror` on `<img>` to show fallback. Circle or rounded variants.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 17: Card Component

**Files:**
- Create: `../tova-packages/ui/src/card.tova`

Components: `Card`, `Card.Header`, `Card.Title`, `Card.Description`, `Card.Body`, `Card.Footer`. Pure layout components with variant styles.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 18: Separator Component

**Files:**
- Create: `../tova-packages/ui/src/separator.tova`

`<hr>` with horizontal/vertical orientation. `decorative` prop sets `aria-hidden="true"`.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 19: Alert Component

**Files:**
- Create: `../tova-packages/ui/src/alert.tova`

Components: `Alert`, `Alert.Title`, `Alert.Description`. Variants: info/success/warning/error with appropriate icons. `role="alert"` or `role="status"`. Dismissible with fade+collapse animation.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 20: Dialog Component

**Files:**
- Create: `../tova-packages/ui/src/dialog.tova`

Components: `Dialog`, `Dialog.Title`, `Dialog.Description`, `Dialog.Footer`. Uses `_portal`, `_focusTrap`, `_dismissOnEscape`, `_dismissOnClickOutside` from `_shared.tova`. ARIA: `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`. Animations: fade+scale on desktop, slide-up on mobile. Adaptive: bottom sheet on mobile.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 21: Dropdown Component

**Files:**
- Create: `../tova-packages/ui/src/dropdown.tova`

Components: `Dropdown`, `Dropdown.Trigger`, `Dropdown.Menu`, `Dropdown.Item`, `Dropdown.Separator`. Uses `_arrowNavigation`, `_dismissOnEscape`, `_dismissOnClickOutside`, `_typeAhead`. ARIA: `role="menu"`, `role="menuitem"`, `aria-haspopup`, `aria-expanded`. Adaptive: bottom sheet on mobile.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 22: Tooltip Component

**Files:**
- Create: `../tova-packages/ui/src/tooltip.tova`

Floating tooltip with position calculation (top/bottom/left/right). `role="tooltip"`, `aria-describedby`. Delay prop (default 400ms). Hidden on touch devices. Fade+scale animation.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 23: Toast Component

**Files:**
- Create: `../tova-packages/ui/src/toast.tova`

`Toast.Provider` component + `Toast.show()` imperative API. Uses a shared signal store for active toasts. `role="status"`, `aria-live`. Auto-dismiss with configurable duration. Slide-in animation. Adaptive: full-width bottom on mobile.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 24: Tabs Component

**Files:**
- Create: `../tova-packages/ui/src/tabs.tova`

Components: `Tabs`, `Tabs.List`, `Tabs.Trigger`, `Tabs.Panel`. ARIA: `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`, `aria-labelledby`. Arrow key navigation. Fade crossfade on panel change. Adaptive: scrollable on mobile.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 25: Accordion Component

**Files:**
- Create: `../tova-packages/ui/src/accordion.tova`

Components: `Accordion`, `Accordion.Item`, `Accordion.Trigger`, `Accordion.Content`. `type="single"` (one open) or `type="multiple"`. `aria-expanded`, `aria-controls`. Height expand/collapse animation. Arrow key navigation between triggers.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 26: Table Component

**Files:**
- Create: `../tova-packages/ui/src/table.tova`

Components: `Table`, `Table.Column`. Declarative column definitions with `key`, `header`, `sortable`, custom render function. Sort state managed internally. Adaptive: stacked card layout on mobile. Props: `striped`, `hoverable`, `compact`.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 27: Pagination Component

**Files:**
- Create: `../tova-packages/ui/src/pagination.tova`

Generates page buttons with ellipsis. `siblingCount` controls visible page range. `on:change` callback. Adaptive: compact prev/next on mobile.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 28: Breadcrumb Component

**Files:**
- Create: `../tova-packages/ui/src/breadcrumb.tova`

Components: `Breadcrumb`, `Breadcrumb.Item`. Links with separator (default "/"). `active` item is non-linked. `aria-label="Breadcrumb"` on nav. Adaptive: collapsed with ellipsis on mobile.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 29: Progress Component

**Files:**
- Create: `../tova-packages/ui/src/progress.tova`

`role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`. Smooth width transition. `indeterminate` mode with shimmer animation. Size variants.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 30: Spinner Component

**Files:**
- Create: `../tova-packages/ui/src/spinner.tova`

SVG-based spinning loader. `role="status"`, `aria-label="Loading"`. Size variants.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 31: Skeleton Component

**Files:**
- Create: `../tova-packages/ui/src/skeleton.tova`

Loading placeholder. Variants: `rect`, `circle`, `text` (multiple lines). Pulse shimmer animation. `aria-hidden="true"`.

**Steps:** Write file → add to lib.tova → verify build → commit

---

### Task 32: lib.tova — Wire All Exports

**Files:**
- Modify: `../tova-packages/ui/src/lib.tova`

Add imports from all component files and re-export them. The `lib.tova` file should import from each `.tova` file in the same directory (which get merged during build) or use `pub component` directly.

Since all `.tova` files in `src/` are merged during `tova build`, the `lib.tova` just needs to re-export the `version()` function. All `pub component` declarations from other files in `src/` are automatically included.

Update `tova.toml` exports list with all 25 component names + compound sub-components.

**Steps:** Update lib.tova → update tova.toml → verify build → commit

---

### Task 33: Integration Tests

**Files:**
- Create: `tests/tova-ui.test.js` (in the main lux-lang repo)

Write end-to-end tests that:
1. Compile a `.tova` file that imports from `tova/ui`
2. Verify the compiled output contains the expected component functions
3. Verify ARIA attributes are present
4. Verify CSS variant classes are generated
5. Verify compound components are attached as properties

```javascript
test('Button component compiles with variants', () => {
  const source = `
import { Button } from "tova/ui"

browser {
  component App {
    <div>
      <Button variant="primary" size="lg">"Click me"</Button>
    </div>
  }
}
`;
  // This test depends on the package being available locally
  // May need to set up module resolution for test environment
});
```

**Steps:** Write tests → run → fix any issues → commit

---

### Task 34: Build and Verify Full Package

**Step 1:** Build the package

```bash
cd /Users/macm1/new-y-combinator/tova-packages/ui
tova build
```

**Step 2:** Verify the compiled output in `.tova-out/src.js`

Check that:
- All 25 components are exported
- Compound components have property assignments
- CSS is properly scoped
- ARIA attributes are in the HTML output
- Variant classes are correct
- Responsive media queries are present

**Step 3:** Run the main Tova test suite

```bash
cd /Users/macm1/new-y-combinator/lux-lang
bun test
```

Expected: All existing tests pass + new pub-component tests pass

**Step 4:** Final commit

```bash
cd /Users/macm1/new-y-combinator/tova-packages/ui
git add -A && git commit -m "feat: tova/ui v0.1.0 — 25 production-ready components"
```
