# Transitions

Tova provides CSS transitions for animating elements when they enter or leave the DOM. Transitions are applied as directives on JSX elements.

## Built-in Transitions

Four built-in transitions are available:

| Transition | Effect | Default Duration |
|---|---|---|
| `fade` | Opacity 0 → 1 (enter) / 1 → 0 (leave) | 200ms |
| `slide` | Translate + opacity | 300ms |
| `scale` | Scale 0 → 1 + opacity | 200ms |
| `fly` | Translate from offset + opacity | 300ms |

### Basic Usage

```tova
<div transition:fade>
  Fades in when added, fades out when removed
</div>

<p transition:slide>Slides in and out</p>
<span transition:scale>Scales in and out</span>
```

### Configuration

Pass an object to customize transition behavior:

```tova
<div transition:fade={{duration: 500, easing: "ease-in-out"}}>
  Slow fade
</div>

<div transition:slide={{duration: 400, axis: "x", distance: 50}}>
  Slides 50px horizontally
</div>

<div transition:fly={{x: 100, y: -50, duration: 400}}>
  Flies in from offset
</div>
```

**Common options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `duration` | Number | varies | Animation duration in milliseconds |
| `easing` | String | `"ease"` | CSS easing function |

**Slide-specific:**

| Option | Type | Default | Description |
|---|---|---|---|
| `axis` | `"x"` or `"y"` | `"y"` | Slide direction |
| `distance` | Number | `20` | Slide distance in pixels |

**Fly-specific:**

| Option | Type | Default | Description |
|---|---|---|---|
| `x` | Number | `0` | Horizontal offset in pixels |
| `y` | Number | `-20` | Vertical offset in pixels |

## Directional Transitions

Use `in:` and `out:` to apply different transitions for entering and leaving:

```tova
// Fade in, slide out
<div in:fade out:slide>Content</div>

// Fly in from left, scale out
<div in:fly={{x: -100}} out:scale>Content</div>

// Only animate on enter
<div in:fade>Fades in but disappears instantly</div>

// Only animate on leave
<div out:fade>Appears instantly but fades out</div>
```

### Combining with Configuration

```tova
<div in:fade={{duration: 300}} out:slide={{duration: 500, axis: "x"}}>
  Fades in over 300ms, slides out horizontally over 500ms
</div>
```

## Custom Transitions

For transitions beyond the built-in set, define a custom transition function:

```tova
fn typewriter(el, config, phase) {
  duration = config.duration or 500

  if phase == "enter" {
    el.style.overflow = "hidden"
    el.style.width = "0"
    el.style.transition = "width {duration}ms steps({len(el.textContent)}, end)"
    // Return target styles
    { width: "{el.scrollWidth}px" }
  } else {
    el.style.transition = "width {duration}ms steps({len(el.textContent)}, end)"
    { width: "0" }
  }
}

<p transition:typewriter={{duration: 1000}}>Hello, World!</p>
```

### Custom Transition API

A custom transition function receives three arguments:

1. `el` — the DOM element
2. `config` — the configuration object passed in the directive
3. `phase` — either `"enter"` or `"leave"`

It can:
- Return a **style object** — applied to the element for the transition
- Return a **Promise** — the transition waits for it to resolve before removing the element (leave only)
- Directly manipulate `el.style` for imperative control

### Using Custom Transitions

Custom transitions are referenced by variable name (not string):

```tova
// Built-in: referenced by string internally
<div transition:fade>...</div>

// Custom: referenced by variable
<div transition:typewriter={{duration: 800}}>...</div>
```

The compiler detects non-builtin names and passes them as variable references rather than strings.

## How Transitions Work

### Enter Transitions

When an element with a transition is rendered:

1. Initial styles are applied (e.g., `opacity: 0`)
2. After a double `requestAnimationFrame` (to force browser reflow), target styles are applied (e.g., `opacity: 1`)
3. The CSS `transition` property handles the animation

### Leave Transitions

When an element with a transition is removed:

1. Leave styles are applied (e.g., `opacity: 0`)
2. The runtime waits for `transitionend` event (with a fallback timeout)
3. Only after the animation completes is the element removed from the DOM

### Transitions with Conditional Rendering

Transitions work naturally with `if` blocks:

```tova
state show = false

<button on:click={fn() show = not show}>Toggle</button>

if show {
  <div transition:fade>
    This fades in and out
  </div>
}
```

### Transitions in Lists

Transitions can be applied to items in `for` loops:

```tova
for item in items key={item.id} {
  <div transition:slide>
    {item.name}
  </div>
}
```

Each item animates independently when added or removed from the list.

## TransitionGroup

`TransitionGroup` animates enter and leave transitions for items in a keyed list. It wraps a list of keyed children in a container element and applies transitions to each child.

### Basic Usage

```tova
component TodoList(items) {
  <TransitionGroup name="fade" tag="ul">
    for item in items key={item.id} {
      <li>{item.text}</li>
    }
  </TransitionGroup>
}
```

When items are added to or removed from the list, each item animates with the specified transition.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `name` | String | `"fade"` | Built-in transition name (`fade`, `slide`, `scale`, `fly`) |
| `tag` | String | `"div"` | HTML tag for the wrapper element |
| `config` | Object | `{}` | Transition configuration (duration, easing, etc.) |

### Configuration

```tova
<TransitionGroup name="slide" tag="ul" config={{duration: 300, axis: "x"}}>
  for item in items key={item.id} {
    <li>{item.text}</li>
  }
</TransitionGroup>
```

### How It Works

1. `TransitionGroup` annotates each child vnode with the specified transition
2. When a new child appears, its enter transition plays automatically
3. When a child is removed, its leave transition plays before DOM removal
4. The container element receives a `data-tova-transition-group` attribute for styling
