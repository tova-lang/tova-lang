# DevTools

Tova includes opt-in development tooling for inspecting signals, effects, components, and performance from the browser console. DevTools have zero overhead when not enabled -- all instrumentation is gated behind a single boolean check.

## Enabling DevTools

Call `initDevTools()` to activate instrumentation and expose the DevTools API on `window`:

```js
import { initDevTools } from './runtime/devtools.js';

// Enable before creating any signals/effects
initDevTools();
```

::: tip
Only enable DevTools in development. In production builds, omit the import entirely for zero overhead.
:::

Once enabled, two objects are available on `window`:
- `window.__TOVA_DEVTOOLS__` -- inspect components, signals, and effects
- `window.__TOVA_PERF__` -- performance profiling data

## Inspecting Signals

All signals created after `initDevTools()` is called are registered in the signal registry. You can name signals for easier identification:

```js
const [count, setCount] = createSignal(0, 'count');
const [user, setUser] = createSignal(null, 'currentUser');
```

The second argument to `createSignal` is an optional name string. It has no effect on behavior -- it only labels the signal in DevTools. If omitted, signals are auto-named as `signal_1`, `signal_2`, etc.

### Reading Signals from the Console

```js
// List all registered signals
window.__TOVA_DEVTOOLS__.signals
// => Map { 1 => { name: 'count', getter, setter, ... }, ... }

// Read a specific signal by ID
window.__TOVA_DEVTOOLS__.getSignal(1)
// => { id: 1, name: 'count', value: 42 }

// Write a signal value from the console
window.__TOVA_DEVTOOLS__.setSignal(1, 100)
// => true (signal updated, effects re-run)
```

## Inspecting Effects

Effects are tracked with execution counts and timing:

```js
window.__TOVA_DEVTOOLS__.effects
// => Map { 1 => { executionCount: 5, totalTime: 1.2, lastTime: 0.3, ... }, ... }
```

Each effect entry includes:
- `executionCount` -- how many times the effect has run
- `totalTime` -- cumulative execution time in milliseconds
- `lastTime` -- duration of the most recent execution

## Inspecting Components

Components rendered with a `_componentName` (automatically set by the Tova compiler) are tracked in the component registry:

```js
window.__TOVA_DEVTOOLS__.getComponentTree()
// => [{ id: 1, name: 'App', renderCount: 1, totalRenderTime: 2.5 }, ...]
```

Components with names also get a `data-tova-component` DOM attribute, making them easy to find in the browser's element inspector.

## Ownership Tree

View the component ownership hierarchy:

```js
window.__TOVA_DEVTOOLS__.getOwnershipTree()
// => [{ id: 1, name: 'App', renderCount: 1 }, { id: 2, name: 'Header', renderCount: 1 }, ...]
```

## Performance Profiling

`window.__TOVA_PERF__` provides arrays of timestamped performance entries and aggregate statistics.

### Raw Data

```js
// All render events
window.__TOVA_PERF__.renders
// => [{ timestamp, duration, componentName }, ...]

// All effect executions
window.__TOVA_PERF__.effects
// => [{ timestamp, duration, effectId }, ...]

// All signal updates
window.__TOVA_PERF__.signals
// => [{ timestamp, signalId, name, oldValue, newValue }, ...]
```

### Summary Statistics

```js
window.__TOVA_PERF__.summary()
// => {
//   totalRenders: 15,
//   totalRenderTime: 8.3,
//   avgRenderTime: 0.55,
//   totalEffects: 42,
//   totalEffectTime: 12.1,
//   avgEffectTime: 0.29,
//   totalSignalUpdates: 67,
// }
```

### Clearing Data

Reset all performance counters and data arrays:

```js
window.__TOVA_PERF__.clear()
```

This clears the `renders`, `effects`, and `signals` arrays and resets all effect execution counters.

## Zero-Cost When Disabled

All DevTools hooks in the reactivity system are gated behind a single check:

```js
if (__devtools_hooks) {
  __devtools_hooks.onSignalCreate(/* ... */);
}
```

When `initDevTools()` has not been called, `__devtools_hooks` is `null` and the check short-circuits. This means:
- No function calls
- No object allocations
- No timing measurements
- No registry lookups

Production code pays only the cost of a single falsy boolean check per signal/effect operation.

## API Reference

### `window.__TOVA_DEVTOOLS__`

| Property / Method | Description |
|-------------------|-------------|
| `components` | `Map` of all tracked components |
| `getComponentTree()` | Array of component summaries |
| `signals` | `Map` of all tracked signals |
| `getSignal(id)` | Read a signal's current value by ID |
| `setSignal(id, value)` | Write a signal's value by ID |
| `effects` | `Map` of all tracked effects |
| `getOwnershipTree()` | Flat list of components with render counts |

### `window.__TOVA_PERF__`

| Property / Method | Description |
|-------------------|-------------|
| `renders` | Array of render timing entries |
| `effects` | Array of effect timing entries |
| `signals` | Array of signal update entries |
| `summary()` | Aggregate statistics object |
| `clear()` | Reset all performance data |
