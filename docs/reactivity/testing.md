# Testing

Tova provides built-in testing utilities for component testing. The `testing.js` module includes helpers to render components, fire events, query the DOM, and wait for reactive updates.

## Setup

Import the testing utilities from the runtime:

```js
import { renderForTest, fireEvent, waitForEffect, cleanup } from './runtime/testing.js';
```

The testing utilities require a DOM environment. Use a test runner with DOM support — `bun:test` (built-in), `jsdom`, or `happy-dom` all work.

## renderForTest

`renderForTest(component, options?)` renders a component into a detached container and returns query helpers:

```tova
import { renderForTest, fireEvent, cleanup } from "./runtime/testing.js"

test("counter increments", fn() {
  result = renderForTest(Counter)

  fireEvent.click(result.getByText("Increment"))

  expect(result.getByText("1")).toBeTruthy()

  cleanup()
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `props` | Object | `{}` | Props to pass to the component |
| `container` | HTMLElement | auto-created `<div>` | Custom container element to render into |

### Return Value

`renderForTest` returns an object with:

| Property | Type | Description |
|----------|------|-------------|
| `container` | HTMLElement | The container DOM element |
| `dispose` | Function | Dispose the reactive root (called automatically by `cleanup()`) |
| `getByText(text)` | Function | Find an element containing the given text |
| `getByTestId(id)` | Function | Find an element with `data-testid="id"` |
| `getByRole(role)` | Function | Find an element with `role="role"` |
| `querySelector(sel)` | Function | Run `container.querySelector(sel)` |
| `querySelectorAll(sel)` | Function | Run `container.querySelectorAll(sel)` |
| `debug()` | Function | Print the current container HTML to the console |

## fireEvent

`fireEvent` provides methods for dispatching DOM events on elements. It automatically handles both real DOM and mock DOM environments.

### Available Events

| Method | Description |
|--------|-------------|
| `fireEvent.click(el, options?)` | Dispatches a click event |
| `fireEvent.input(el, options?)` | Sets `el.value` if `options.value` is provided, then dispatches an input event |
| `fireEvent.change(el, options?)` | Sets `el.value` and/or `el.checked`, then dispatches a change event |
| `fireEvent.submit(el, options?)` | Dispatches a submit event |
| `fireEvent.focus(el, options?)` | Dispatches a focus event |
| `fireEvent.blur(el, options?)` | Dispatches a blur event |
| `fireEvent.keyDown(el, options?)` | Dispatches a keydown event |
| `fireEvent.keyUp(el, options?)` | Dispatches a keyup event |
| `fireEvent.mouseEnter(el, options?)` | Dispatches a mouseenter event |
| `fireEvent.mouseLeave(el, options?)` | Dispatches a mouseleave event |

### Usage

```js
// Click a button
fireEvent.click(result.getByText('Save'));

// Type into an input
const input = result.querySelector('input[name="email"]');
fireEvent.input(input, { value: 'user@example.com' });

// Press a key
fireEvent.keyDown(input, { key: 'Enter' });

// Submit a form
fireEvent.submit(result.querySelector('form'));
```

## waitForEffect

`waitForEffect(ms?)` returns a promise that resolves after all pending effects and microtasks flush. Use this when you need to wait for reactive updates after firing events:

```js
fireEvent.click(button);
await waitForEffect();
// DOM is now updated with the new state
expect(result.getByText('Updated')).toBeTruthy();
```

Pass a millisecond value to wait for a specific duration (useful for transitions or debounced effects):

```js
await waitForEffect(100); // wait 100ms
```

## cleanup

`cleanup()` disposes all mounted test roots and removes their containers from the DOM. Call this in `afterEach()` or at the end of each test:

```js
import { cleanup } from './runtime/testing.js';

afterEach(() => {
  cleanup();
});
```

## Full Example

```tova
import { describe, test, expect, afterEach } from "bun:test"
import { renderForTest, fireEvent, waitForEffect, cleanup } from "./runtime/testing.js"

// A component to test
component TodoList() {
  state items = []
  state text = ""

  fn add() {
    if text != "" {
      items = [...items, { id: len(items), text: text }]
      text = ""
    }
  }

  <div>
    <input data-testid="input" value={text} on:input={fn(e) text = e.target.value} />
    <button on:click={add}>"Add"</button>
    <ul>
      for item in items key={item.id} {
        <li>{item.text}</li>
      }
    </ul>
  </div>
}

afterEach(fn() cleanup())

test("adds a todo item", fn() {
  result = renderForTest(TodoList)

  input = result.getByTestId("input")
  fireEvent.input(input, { value: "Buy milk" })
  fireEvent.click(result.getByText("Add"))

  await waitForEffect()

  expect(result.getByText("Buy milk")).toBeTruthy()
})

test("clears input after adding", fn() {
  result = renderForTest(TodoList)

  input = result.getByTestId("input")
  fireEvent.input(input, { value: "Walk dog" })
  fireEvent.click(result.getByText("Add"))

  await waitForEffect()

  expect(input.value).toBe("")
})
```

## Debugging

Use the `debug()` helper to inspect the current DOM state:

```js
const result = renderForTest(MyComponent);
result.debug(); // prints container HTML to console
```

This is especially useful when a query fails and you want to see the actual rendered output.
