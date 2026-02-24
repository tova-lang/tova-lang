# Advanced Reactivity

This page covers the advanced reactive APIs in Tova, including DOM refs, context, watchers, error boundaries, dynamic components, portals, lazy loading, and the rendering API.

## createRef

`createRef` creates a mutable reference object with a `current` property. It is primarily used to obtain references to DOM elements:

```tova
component FocusInput {
  input_ref = createRef()

  onMount(fn() {
    input_ref.current.focus()
  })

  <input ref={input_ref} placeholder="Auto-focused" />
}
```

After the component renders, `input_ref.current` points to the actual DOM `<input>` element. You can use it to call DOM methods like `focus()`, `scrollIntoView()`, or read properties like `offsetWidth`.

### Ref with Initial Value

You can pass an initial value to `createRef`:

```tova
counter_ref = createRef(0)
print(counter_ref.current)  // 0
counter_ref.current = 5
print(counter_ref.current)  // 5
```

When called without an argument, `current` defaults to `nil`.

::: warning
Refs are **not reactive**. Changing `ref.current` does not trigger effects or re-render components. Use signals for reactive values and refs for imperative DOM access.
:::

## Context (provide / inject)

Context provides a way to pass data down the component tree without threading props through every intermediate component. It is tree-based -- values are stored on the ownership tree and `inject` walks up the tree to find the nearest provider.

### Creating a Context

```tova
// Create a context with a default value
theme_ctx = createContext("light")
locale_ctx = createContext("en")
```

`createContext(defaultValue)` returns a context object. The default value is used when no provider is found in the tree.

### Providing Values

Use `provide` inside a component to supply a value to all descendants:

```tova
component App {
  state theme = "dark"

  // All descendants of App can inject theme_ctx
  provide(theme_ctx, theme)

  <div class={theme}>
    <Header />
    <Main />
    <Footer />
  </div>
}
```

The provided value can be a signal getter, a plain value, an object, or anything else.

### Injecting Values

Use `inject` in a descendant component to retrieve the nearest provided value:

```tova
component ThemedButton(label) {
  theme = inject(theme_ctx)

  <button class="btn-{theme}">{label}</button>
}
```

`inject` walks up the ownership tree from the current component. If it finds a provider for the given context, it returns that value. If no provider is found, it returns the context's default value.

### Full Context Example

```tova
client {
  // Define contexts
  theme_ctx = createContext("light")
  user_ctx = createContext(nil)

  component App {
    state theme = "light"
    state user = { name: "Alice", role: "admin" }

    provide(theme_ctx, theme)
    provide(user_ctx, user)

    <div>
      <button on:click={fn() {
        theme = if theme == "light" { "dark" } else { "light" }
      }}>
        Toggle Theme
      </button>
      <UserProfile />
    </div>
  }

  component UserProfile {
    user = inject(user_ctx)
    theme = inject(theme_ctx)

    <div class="profile profile-{theme}">
      <h2>{user.name}</h2>
      <p>Role: {user.role}</p>
    </div>
  }
}
```

## watch

`watch` observes a reactive expression and calls a callback whenever the value changes. Unlike effects, which re-run their entire body, `watch` separates the tracked expression from the side-effect callback:

```tova
client {
  state count = 0

  // Watch count and log changes
  stop = watch(fn() count, fn(new_val, old_val) {
    print("Count changed from {old_val} to {new_val}")
  })

  // Later, stop watching
  stop()
}
```

### Parameters

```
watch(getter, callback, options?)
```

- **getter** -- a function that returns the value to watch (dependencies are tracked here)
- **callback** -- called with `(newValue, oldValue)` when the watched value changes
- **options** -- optional object:
  - `immediate: true` -- call the callback immediately with the initial value (oldValue will be `undefined`)

### Immediate Mode

By default, the callback is not called with the initial value. Use `immediate: true` to invoke it right away:

```tova
watch(fn() user.name, fn(name, prev) {
  print("Name is now: {name}")
}, { immediate: true })
// Prints immediately: "Name is now: Alice"
```

### Watching Derived Values

You can watch any reactive expression, including computed values or complex expressions:

```tova
watch(fn() len(items), fn(count, prev_count) {
  if count > prev_count {
    print("{count - prev_count} items added")
  } else {
    print("{prev_count - count} items removed")
  }
})
```

### Dispose

`watch` returns a dispose function. Call it to stop watching:

```tova
unwatch = watch(fn() route, fn(new_route, _) {
  analytics.track("page_view", new_route.path)
})

// Stop tracking page views
unwatch()
```

## untrack

`untrack` runs a function without tracking any signal reads. This lets you read a signal inside a reactive context without creating a dependency on it:

```tova
client {
  state count = 0
  state label = "Counter"

  effect {
    // count is tracked — this effect re-runs when count changes
    // label is NOT tracked — changes to label don't trigger this effect
    current_label = untrack(fn() label)
    print("{current_label}: {count}")
  }
}
```

`untrack` is useful when you want to read a signal's value for reference but do not want the containing effect/computed to re-run when that signal changes.

### Use Cases

```tova
// Log the current count without re-logging on every count change
effect {
  print("Name: {name}")
  // Read count for logging but don't re-trigger on count changes
  print("  (current count: {untrack(fn() count)})")
}
```

```tova
// Use a configuration signal without tracking it
effect {
  data = server.fetch(url)
  config = untrack(fn() app_config)
  process_data(data, config)
}
```

## Head Component

The `Head` component lets components declaratively manage document head tags (`<title>`, `<meta>`, `<link>`, etc.). When a component unmounts, its head contributions are automatically cleaned up.

```tova
component BlogPost(post) {
  <Head>
    <title>{post.title} - My Blog</title>
    <meta name="description" content={post.summary} />
    <meta property="og:title" content={post.title} />
    <link rel="canonical" href="/posts/{post.slug}" />
  </Head>

  <article>
    <h1>{post.title}</h1>
    <div>{post.content}</div>
  </article>
}
```

### How It Works

1. `Head` processes its vnode children and adds them to `document.head`
2. `<title>` children update `document.title` directly
3. Other elements (`<meta>`, `<link>`, `<style>`, `<script>`) are appended to `<head>`
4. When the component's ownership root is disposed (unmount), all added elements are removed and the previous title is restored

### Multiple Head Components

Each component can have its own `Head`. The last one to render wins for `<title>`, while `<meta>` and `<link>` tags accumulate:

```tova
component App {
  <Head>
    <title>My App</title>
    <meta name="viewport" content="width=device-width" />
  </Head>
  <Router />
}

component AboutPage {
  <Head>
    <title>About - My App</title>
    <meta name="description" content="About our company" />
  </Head>
  <div>...</div>
}
```

When navigating to `/about`, the title becomes "About - My App". When navigating away, it reverts to "My App".

### SSR

During SSR, use the `head` parameter in `renderPage()` for static head content. The `Head` component activates during client-side hydration.

## createResource

`createResource` is an async data fetching primitive that integrates with the signal system. It manages loading state, error handling, and stale response cancellation automatically.

### Basic Usage

```tova
client {
  [users, { loading, error, refetch }] = createResource(fn() {
    server.get_users()
  })

  component App {
    if loading() {
      <p>Loading...</p>
    } elif error() {
      <p>Error: {error().message}</p>
      <button on:click={refetch}>Retry</button>
    } else {
      <ul>
        for user in users() {
          <li>{user.name}</li>
        }
      </ul>
    }
  }
}
```

### With Reactive Source

Pass a signal as the first argument to re-fetch whenever the source changes:

```tova
client {
  state user_id = 1

  [user, { loading, error }] = createResource(
    fn() user_id,
    fn(id) server.get_user(id)
  )

  // When user_id changes, the fetcher re-runs automatically
}
```

The fetcher is skipped when the source value is `nil`, `undefined`, or `false`.

### Return Value

`createResource(fetcher)` returns `[data, controls]`:

| Field | Type | Description |
|---|---|---|
| `data` | signal getter | The fetched data (or `undefined` before first load) |
| `controls.loading` | signal getter | `true` while a fetch is in progress |
| `controls.error` | signal getter | The error object if the fetch failed, otherwise `undefined` |
| `controls.refetch` | function | Manually re-invoke the fetcher |
| `controls.mutate` | function | Directly update the data signal (for optimistic updates) |

### Stale Response Handling

If the source changes while a fetch is in progress, the previous response is discarded. Only the most recent fetch updates the data signal.

### Optimistic Updates

Use `mutate` to update data immediately before the server responds:

```tova
fn handle_toggle(todo) {
  // Optimistic update
  mutate(todos().map(fn(t) {
    if t.id == todo.id { { ...t, done: not t.done } } else { t }
  }))
  // Then sync with server
  server.toggle_todo(todo.id)
}
```

## Error Boundaries

Error boundaries catch errors in reactive code and display fallback UI instead of crashing the entire application. Boundaries can be nested -- an inner boundary catches errors first, and only if it doesn't handle them (or its fallback throws) does the error propagate to outer boundaries.

### createErrorBoundary

`createErrorBoundary(options?)` returns an object with:
- **error** -- a signal getter that returns the current error (or `nil` if no error)
- **run(fn)** -- executes a function within the error boundary; if it throws, the error signal is set
- **reset()** -- clears the error signal, allowing recovery

Options (all optional):
- **onError({ error, componentStack })** -- called when an error is caught. `componentStack` is an array of component names from inner to outer.
- **onReset()** -- called when the error is cleared via `reset()`

```tova
component SafeWidget {
  boundary = createErrorBoundary({
    onError: fn(info) {
      log_error(info.error, info.componentStack)
    },
    onReset: fn() {
      print("Error cleared")
    }
  })

  onMount(fn() {
    boundary.run(fn() {
      // Code that might throw
      result = risky_operation()
    })
  })

  if boundary.error != nil {
    <div class="error">
      <p>Something went wrong: {boundary.error}</p>
      <button on:click={fn() boundary.reset()}>Try Again</button>
    </div>
  } else {
    <Widget />
  }
}
```

The `onError` callback receives the error object with a `__tovaComponentStack` property attached (an array of component names from the point of error outward).

Calling with no options works the same as before -- `createErrorBoundary()` is fully backward-compatible.

### ErrorBoundary Component

`ErrorBoundary` is a built-in component that wraps children in an error boundary. It accepts a `fallback` prop -- either a vnode or a function that receives `{ error, reset }`:

```tova
component App {
  <ErrorBoundary fallback={fn(props) {
    <div class="error">
      <p>Error: {props.error}</p>
      <button on:click={fn() props.reset()}>Retry</button>
    </div>
  }}>
    <RiskyComponent />
  </ErrorBoundary>
}
```

When an error occurs in a reactive effect within the `ErrorBoundary`'s children, the fallback UI is displayed instead. Calling `reset` clears the error and re-renders the children.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `fallback` | vnode or function | required | UI to show on error. Functions receive `{ error, reset }` |
| `onError` | function | `undefined` | Called with `{ error, componentStack }` when error is caught |
| `onReset` | function | `undefined` | Called when the error is cleared |
| `retry` | number | `0` | Number of times to re-attempt rendering before showing fallback |

#### Retry

The `retry` prop lets you automatically re-attempt rendering when a transient error occurs (e.g., a race condition during initialization):

```tova
component App {
  <ErrorBoundary retry={3} fallback={fn(props) {
    <p>Failed after 3 retries: {props.error}</p>
  }}>
    <UnstableComponent />
  </ErrorBoundary>
}
```

The component will re-render up to 3 times before showing the fallback.

#### Nested Boundaries

Error boundaries can be nested. The innermost boundary catches the error first. If a fallback itself throws, the error propagates to the parent boundary:

```tova
component App {
  <ErrorBoundary fallback={fn(props) <p>Outer caught: {props.error}</p>}>
    <ErrorBoundary fallback={fn(props) <p>Inner caught: {props.error}</p>}>
      <RiskyComponent />
    </ErrorBoundary>
  </ErrorBoundary>
}
```

## Dynamic Component

`Dynamic` renders a component dynamically based on a reactive signal. This is useful when the component to render is determined at runtime:

```tova
client {
  state current_view = HomePage

  component App {
    <nav>
      <button on:click={fn() current_view = HomePage}>Home</button>
      <button on:click={fn() current_view = AboutPage}>About</button>
      <button on:click={fn() current_view = ContactPage}>Contact</button>
    </nav>
    <Dynamic component={current_view} />
  }
}
```

The `component` prop can be a signal getter that returns a component function. When it changes, `Dynamic` automatically switches to the new component.

Additional props are passed through to the rendered component:

```tova
<Dynamic component={current_tab} user={user} on_close={handle_close} />
```

## Portal

`Portal` renders its children into a different DOM node, outside the normal component tree. This is useful for modals, tooltips, and overlays that need to escape their parent's CSS stacking context:

```tova
component Modal(title, on_close) {
  <Portal target="#modal-root">
    <div class="modal-overlay" on:click={fn() on_close()}>
      <div class="modal" on:click={fn(e) e.stopPropagation()}>
        <h2>{title}</h2>
        <div class="modal-body">{children}</div>
        <button on:click={fn() on_close()}>Close</button>
      </div>
    </div>
  </Portal>
}
```

The `target` prop accepts a CSS selector string (like `"#modal-root"` or `"body"`) or a DOM element reference. The children are rendered into that target node via `queueMicrotask`, ensuring the target element exists in the DOM.

When the Portal component unmounts, its children are automatically removed from the target element and their reactive roots are disposed.

Make sure the target element exists in your HTML:

```html
<body>
  <div id="app"></div>
  <div id="modal-root"></div>
</body>
```

## Suspense

`Suspense` provides a boundary that shows a fallback while any child `lazy()` component is loading. Instead of each lazy component managing its own loading state, Suspense provides a unified loading experience:

```tova
HeavyChart = lazy(fn() import("./components/HeavyChart.js"))
DataTable = lazy(fn() import("./components/DataTable.js"))

component Dashboard {
  <Suspense fallback={<div class="loading">Loading dashboard...</div>}>
    <div>
      <HeavyChart />
      <DataTable />
    </div>
  </Suspense>
}
```

### How It Works

1. Suspense tracks a **pending count** of child lazy components that are still loading
2. While any child is pending, the `fallback` is rendered instead of children
3. Once all lazy children resolve, the actual children are rendered
4. Lazy components automatically register with the nearest Suspense boundary

### Nested Suspense

Suspense boundaries can be nested. Each lazy component registers with its nearest ancestor Suspense:

```tova
component App {
  <Suspense fallback={<p>Loading app...</p>}>
    <Header />
    <Suspense fallback={<p>Loading content...</p>}>
      <HeavyContent />
    </Suspense>
  </Suspense>
}
```

### Fallback Types

The `fallback` prop can be a vnode, a string, or a function:

```tova
// Static fallback
<Suspense fallback={<Spinner />}>...</Suspense>

// Function fallback (called each render)
<Suspense fallback={fn() <p>Loading...</p>}>...</Suspense>
```

### SSR Support

During server-side rendering, Suspense renders the fallback for any async children. The client-side hydration then takes over and resolves the lazy components.

## lazy (Code Splitting)

`lazy` enables async component loading, which is essential for code splitting. It takes a loader function that returns a promise (typically a dynamic `import()`):

```tova
// Define a lazy component
HeavyChart = lazy(fn() import("./components/HeavyChart.js"))

component Dashboard {
  <div>
    <h1>Dashboard</h1>
    <HeavyChart fallback={<p>Loading chart...</p>} />
  </div>
}
```

### How It Works

1. The first time the lazy component renders, the loader function is called
2. While the module is loading, the `fallback` prop is displayed (if provided)
3. Once loaded, the default export (or the module itself) is used as the component
4. Subsequent renders use the cached component -- the loader only runs once

### Error Handling

If the loader fails, an error message is displayed:

```tova
HeavyComponent = lazy(fn() import("./HeavyComponent.js"))

// If the import fails, a <span class="tova-error"> is rendered
// with the error message
<HeavyComponent fallback={<p>Loading...</p>} />
```

## mount

`mount` renders a component into a DOM container, replacing any existing content:

```tova
mount(App, document.getElementById("app"))
```

`mount(component, container)`:
1. Creates a reactive ownership root (`createRoot`)
2. Calls the component function to produce vnodes
3. Safely clears the container's children
4. Renders the vnodes into real DOM and appends to the container
5. Returns a dispose function to tear down the reactive tree

```tova
// Manual mount with dispose
dispose = mount(App, document.getElementById("app"))

// Later, tear down the app
dispose()
```

::: tip
If you define a component named `App`, Tova automatically detects whether the container already has server-rendered content. If it does, `hydrate` is called instead of `mount`. You typically do not need to call either yourself.
:::

## hydrate

`hydrate` attaches reactivity to server-rendered HTML without re-rendering from scratch:

```tova
hydrate(App, document.getElementById("app"))
```

`hydrate(component, container)`:
1. Creates a reactive ownership root
2. Calls the component function to produce the vnode tree
3. Walks the existing DOM nodes alongside the vnode tree, attaching event handlers, reactive props, and effects to the existing elements
4. For dynamic blocks (conditionals, loops), inserts comment-node markers and sets up reactive effects
5. Dispatches a `tova:hydrated` event on the container when complete

Hydration is used for server-side rendering (SSR) -- the server renders static HTML, and the client hydrates it to make it interactive without a full re-render.

### SSR Marker-Aware Hydration

When SSR output includes hydration markers (`<!--tova-s:ID-->...<!--/tova-s:ID-->`), the hydrator recognizes and consumes them, replacing marker pairs with reactive comment-node markers. This enables correct hydration of dynamic content (error boundaries, conditionals, loops) rendered by `renderToString` or `renderToReadableStream`.

### Hydration Completion Event

After hydration completes, a `tova:hydrated` CustomEvent is dispatched on the container element with timing information:

```js
document.getElementById("app").addEventListener("tova:hydrated", (e) => {
  console.log(`Hydration completed in ${e.detail.duration}ms`);
});
```

### Dev-Mode Mismatch Warnings

In development mode (`NODE_ENV !== 'production'`), Tova warns in the console when the server-rendered HTML doesn't match the client-side vnode tree. Warnings are emitted for:
- **Class mismatch** -- server-rendered `class` attribute differs from expected
- **Attribute mismatch** -- other attribute values differ
- **Text mismatch** -- text content differs
- **Tag mismatch** -- element tag doesn't match (triggers full re-render of that subtree)

These warnings help catch SSR/client rendering inconsistencies during development without affecting production performance.

### Auto-Detect SSR

When an `App` component is defined, the generated client code automatically chooses between `mount` and `hydrate`:

```js
const container = document.getElementById("app") || document.body;
if (container.children.length > 0) {
  hydrate(App, container);   // SSR content exists
} else {
  mount(App, container);     // Fresh client render
}
```

## hydrateWhenVisible

`hydrateWhenVisible` defers hydration of a component until it scrolls into view. This is useful for below-the-fold content where you want to avoid hydrating off-screen components on page load:

```js
import { hydrateWhenVisible } from './runtime/reactivity.js';

hydrateWhenVisible(HeavyComponent, document.getElementById("heavy-section"));
```

It uses `IntersectionObserver` with a 200px root margin (so hydration starts slightly before the element becomes visible). Falls back to immediate hydration in environments without `IntersectionObserver` support.

Returns a cleanup function to disconnect the observer:

```js
const stop = hydrateWhenVisible(Widget, container);
// Later, cancel observation
stop();
```

## createRoot

`createRoot` creates an ownership root for reactive primitives. All signals, effects, and computed values created inside the root are tracked and can be disposed together:

```tova
dispose = createRoot(fn(dispose) {
  state = createSignal(0)
  // ... create effects, computeds, etc.

  // Return dispose for later use, or call it to tear down
  dispose
})

// Later:
dispose()  // Disposes all reactive primitives created in the root
```

`createRoot` is used internally by `mount` and `hydrate`. You typically use it directly when you need manual control over a reactive scope outside of components, such as in tests or when integrating Tova's reactivity with non-Tova code.

### Ownership Hierarchy

Roots form a tree. A root created inside another root becomes its child. When a parent root is disposed, all child roots are disposed in reverse order:

```
Root (App mount)
  +-- Component A (owner)
  |     +-- Effect 1
  |     +-- Effect 2
  +-- Component B (owner)
        +-- Computed 1
        +-- Effect 3
```

Disposing the top-level root disposes everything: Component B's Effect 3 and Computed 1 first, then Component A's Effect 2 and Effect 1.

## createForm

`createForm` provides reactive form handling with field-level validation, submission management, and dirty tracking.

### Basic Usage

```tova
client {
  form = createForm({
    fields: {
      email: {
        initial: "",
        validate: fn(v) if v.includes("@") { nil } else { "Invalid email" }
      },
      password: {
        initial: "",
        validate: fn(v) if len(v) >= 8 { nil } else { "At least 8 characters" }
      }
    },
    onSubmit: async fn(values) {
      server.register(values)
    }
  })

  component RegisterForm {
    email = form.field("email")
    password = form.field("password")

    <form on:submit={form.submit}>
      <input
        type="email"
        bind:value={email.value}
        on:blur={fn() email.blur()}
        placeholder="Email"
      />
      if email.error() {
        <span class="error">{email.error()}</span>
      }

      <input
        type="password"
        bind:value={password.value}
        on:blur={fn() password.blur()}
        placeholder="Password"
      />
      if password.error() {
        <span class="error">{password.error()}</span>
      }

      <button type="submit" disabled={form.submitting()}>
        {if form.submitting() { "Submitting..." } else { "Register" }}
      </button>

      if form.submitError() {
        <p class="error">Server error: {form.submitError().message}</p>
      }
    </form>
  }
}
```

### Configuration

```
createForm({
  fields: { [name]: { initial, validate? } },
  onSubmit?: async fn(values) -> void,
  validateOnChange?: bool,   // default: true
  validateOnBlur?: bool,     // default: true
})
```

### Field Object

Each `form.field(name)` returns:

| Property | Type | Description |
|----------|------|-------------|
| `value` | signal getter | Current field value |
| `error` | signal getter | Validation error message or `nil` |
| `touched` | signal getter | Whether the field has been blurred |
| `set(val)` | function | Update the field value |
| `blur()` | function | Mark as touched, trigger validation |
| `validate()` | function | Run validation manually |

### Form-Level API

| Property | Type | Description |
|----------|------|-------------|
| `field(name)` | function | Get a field accessor |
| `values()` | function | Get all field values as an object |
| `reset()` | function | Reset all fields to initial values |
| `submit(event?)` | async function | Validate and submit (calls `preventDefault` on events) |
| `validate()` | function | Validate all fields, returns `true` if valid |
| `submitting` | signal getter | `true` while `onSubmit` is running |
| `submitError` | signal getter | Error from the last `onSubmit` failure |
| `submitCount` | signal getter | Number of submit attempts |
| `isValid` | computed | `true` when all fields pass validation |
| `isDirty` | computed | `true` when any field differs from its initial value |

## configureCSP

`configureCSP` enables Content Security Policy (CSP) compliance for dynamically injected `<style>` tags:

```tova
// Set the nonce at app startup
configureCSP({ nonce: "abc123xyz" })
```

When a nonce is configured, all scoped CSS style tags created by `tova_inject_css` will include the `nonce` attribute, allowing them to pass strict CSP policies.

### Auto-Detection

If you include a meta tag in your HTML, the nonce is auto-detected:

```html
<meta name="csp-nonce" content="abc123xyz">
```

### SSR Integration

When using `renderPage()` or `renderPageToStream()`, pass `cspNonce` to add the nonce to the script tag:

```js
renderPage(App, {
  title: 'My App',
  cspNonce: 'abc123xyz',
})
// Output: <script type="module" src="/client.js" nonce="abc123xyz"></script>
```

## Summary

| API | Purpose |
|---|---|
| `createRef(initial?)` | Mutable reference, typically for DOM elements |
| `createContext(default)` | Create a context for tree-based data passing |
| `provide(ctx, value)` | Supply a context value to descendants |
| `inject(ctx)` | Retrieve the nearest context value |
| `watch(getter, cb, opts?)` | Watch a reactive expression with old/new values |
| `untrack(fn)` | Read signals without tracking dependencies |
| `createErrorBoundary(opts?)` | Programmatic error boundary (`error`, `run`, `reset`, `onError`, `onReset`) |
| `ErrorBoundary({ fallback, onError?, onReset?, retry? })` | Component-based error boundary with retry support |
| `Dynamic({ component })` | Render a dynamically-selected component |
| `Portal({ target })` | Render children into a different DOM node |
| `lazy(loader)` | Async component loading for code splitting |
| `mount(component, container)` | Render and mount a component to the DOM |
| `hydrate(component, container)` | Attach reactivity to server-rendered HTML, dispatches `tova:hydrated` event |
| `hydrateWhenVisible(component, node)` | Defer hydration until element is visible in viewport |
| `createRoot(fn)` | Create an ownership root for manual control |
| `Head({ title?, meta?, children? })` | Declarative document head management with cleanup |
| `createResource(fetcher, opts?)` | Async data fetching with `loading`, `error`, `refetch`, `mutate` signals |
| `createForm({ fields, onSubmit? })` | Reactive form handling with validation, submission, and dirty tracking |
| `configureCSP({ nonce })` | Set CSP nonce for dynamically injected style tags |
