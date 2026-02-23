# Directives

Tova provides several JSX directives for common UI patterns. Directives are special attributes prefixed with a keyword followed by `:`.

## `on:` — Event Handlers

Attach DOM event listeners:

```tova
<button on:click={fn() count += 1}>Click</button>
<input on:input={fn(e) name = e.target.value} />
```

See [Event Handlers](/reactivity/jsx#event-handlers) and [Event Modifiers](/reactivity/jsx#event-modifiers) for full documentation.

## `bind:` — Two-Way Binding

Create two-way data bindings between form elements and signals:

| Directive | Element | Signal Type |
|---|---|---|
| `bind:value` | `<input>`, `<textarea>`, `<select>` | String/Number |
| `bind:checked` | `<input type="checkbox">` | Boolean |
| `bind:group` | `<input type="radio/checkbox">` | String/Array |
| `bind:this` | Any element | Ref object |

```tova
state name = ""
state agreed = false

<input bind:value={name} />
<input type="checkbox" bind:checked={agreed} />
```

See [Two-Way Binding](/reactivity/jsx#two-way-binding) for full documentation.

## `class:` — Conditional Classes

Toggle CSS classes based on expressions:

```tova
<div class:active={is_active} class:hidden={!visible}>
  Content
</div>
```

Multiple `class:` directives merge with any static `class` attribute.

See [Conditional Classes](/reactivity/jsx#conditional-classes) for full documentation.

## `show` — Conditional Display

Toggle element visibility without removing from DOM:

```tova
<div show={is_visible}>
  This content is hidden with display:none when is_visible is false
</div>
```

Unlike `if` blocks which add/remove elements from the DOM, `show` keeps the element in the DOM and toggles `display: none`. Use `show` when:
- You want to preserve element state (form inputs, scroll position)
- Toggling is frequent and you want to avoid re-rendering costs

## `use:` — Actions

Run imperative code when an element is created. Actions are functions that receive the DOM element and an optional parameter:

```tova
fn tooltip(el, text) {
  tip = document.createElement("div")
  tip.textContent = text
  tip.className = "tooltip"

  el.addEventListener("mouseenter", fn() {
    document.body.appendChild(tip)
  })
  el.addEventListener("mouseleave", fn() {
    tip.remove()
  })

  // Return lifecycle methods
  {
    update: fn(new_text) { tip.textContent = new_text },
    destroy: fn() { tip.remove() }
  }
}

<button use:tooltip="Hover for help">?</button>
```

### Action Lifecycle

An action function is called with `(element, parameter)` when the element is created. It can return an object with:

- `update(newValue)` — called when a reactive parameter changes
- `destroy()` — called when the element is removed from the DOM

### Reactive Parameters

When the parameter reads a signal, the action's `update` method is called whenever the signal changes:

```tova
state tip_text = "Initial tooltip"

<button use:tooltip={tip_text}>?</button>
```

### Multiple Actions

Multiple `use:` directives can be applied to the same element:

```tova
<div use:draggable use:resizable={min_size}>
  Draggable and resizable
</div>
```

## `transition:` — Animations

Apply CSS transitions when elements enter or leave the DOM:

```tova
<div transition:fade>Fades in and out</div>
<div transition:slide={{duration: 300}}>Slides</div>
```

See [Transitions](/reactivity/transitions) for full documentation including directional and custom transitions.

## `in:` / `out:` — Directional Transitions

Apply different transitions for entering and leaving:

```tova
<div in:fade out:slide>
  Fades in, slides out
</div>
```

See [Directional Transitions](/reactivity/transitions#directional-transitions) for full documentation.

## Directive Summary

| Directive | Purpose | Example |
|---|---|---|
| `on:event` | Event handler | `on:click={handler}` |
| `on:event.mod` | Event with modifier | `on:click.stop={handler}` |
| `bind:value` | Two-way text binding | `bind:value={name}` |
| `bind:checked` | Two-way checkbox binding | `bind:checked={flag}` |
| `bind:group` | Radio/checkbox group | `bind:group={selected}` |
| `bind:this` | Element reference | `bind:this={ref}` |
| `class:name` | Conditional class | `class:active={cond}` |
| `show` | Toggle visibility | `show={visible}` |
| `use:action` | Element action | `use:tooltip={text}` |
| `transition:name` | Enter/leave animation | `transition:fade` |
| `in:name` | Enter-only animation | `in:fade` |
| `out:name` | Leave-only animation | `out:slide` |
