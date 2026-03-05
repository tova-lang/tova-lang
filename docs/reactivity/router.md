# Router

Tova includes a built-in client-side router that integrates with the reactive signal system. Route changes are reactive -- components that read route signals automatically re-render when the URL changes. The router supports dynamic parameters, nested layouts, lazy loading, navigation guards, scroll restoration, active link styling, and base path deployment -- everything you need for a production single-page application.

## Creating a Router

Use `createRouter` to set up your application's routing. Pass a configuration object with a `routes` map that maps URL patterns to components:

```tova
browser {
  createRouter({
    routes: {
      "/": HomePage,
      "/about": AboutPage,
      "/users": UserListPage,
      "/users/:id": UserDetailPage,
      "404": NotFoundPage
    }
  })

  component App {
    <div>
      <NavBar />
      <Router />
    </div>
  }
}
```

`createRouter` processes the route map, sets up browser listeners, and immediately matches the current URL. If a router already exists, it is destroyed and replaced.

### Configuration Options

`createRouter` accepts these options:

| Option | Type | Default | Description |
|---|---|---|---|
| `routes` | Object | required | Map of URL patterns to components or route configs |
| `base` | String | `""` | URL prefix for deployment in a subdirectory |
| `scroll` | `"auto"` \| `"none"` \| Function | `"auto"` | Scroll restoration behavior on navigation |
| `loading` | Component | `nil` | Component shown while lazy routes load |
| `error` | Component | `nil` | Component shown when lazy routes fail to load |

```tova
createRouter({
  routes: { "/": HomePage, "/about": AboutPage },
  base: "/myapp",
  scroll: "auto",
  loading: LoadingSpinner,
  error: ErrorFallback,
})
```

## Route Patterns

### Static Routes

Static routes match exact paths:

```tova
createRouter({
  routes: {
    "/": HomePage,
    "/about": AboutPage,
    "/contact": ContactPage
  }
})
```

### Path Parameters

Use `:name` to capture dynamic path segments. Matched values are URL-decoded and passed to the component as function arguments:

```tova
createRouter({
  routes: {
    "/users/:id": UserPage,
    "/posts/:slug": PostPage,
    "/users/:user_id/posts/:post_id": UserPostPage
  }
})
```

When the URL `/users/42` is matched against `/users/:id`, the params object contains `{ id: "42" }`. The component receives these params as its argument:

```tova
component UserPage(id) {
  <h1>"User {id}"</h1>
}
```

### Optional Parameters

Append `?` to make a parameter optional:

```tova
createRouter({
  routes: {
    "/posts/:id?": PostPage
  }
})
```

This matches `/posts/` (where `id` is absent) and `/posts/42` (where `id` is `"42"`). The trailing slash is required for the optional segment -- `/posts` without a slash does not match.

### Catch-All Routes

Use `*` in a path to capture all remaining segments:

```tova
createRouter({
  routes: {
    "/blog/*": BlogCatchAll
  }
})
```

The captured value is available as `params["*"]`. For the URL `/blog/2024/hello-world`, `params["*"]` would be `"2024/hello-world"`.

### 404 Not Found

Use the special key `"404"` to designate a component that renders when no route matches:

```tova
createRouter({
  routes: {
    "/": HomePage,
    "/about": AboutPage,
    "404": NotFoundPage
  }
})
```

You can also use `"*"` as a catch-all fallback. The difference:
- `"404"` is a special key -- the component renders when no route pattern matches
- `"*"` is a pattern-matched route that captures everything -- it acts as a fallback within the regular matching pipeline

Both serve as fallbacks, but `"*"` has lower priority than specific routes.

### Route Metadata

Attach metadata to any route by using an object with `component` and `meta`:

```tova
createRouter({
  routes: {
    "/": HomePage,
    "/admin": {
      component: AdminPage,
      meta: { title: "Admin", requiresAuth: true, role: "admin" }
    },
    "/users": {
      component: UsersPage,
      meta: { title: "Users" }
    }
  }
})
```

Metadata is accessible via `getMeta()` or `router.meta()` and is commonly used for page titles, auth checks, and analytics.

## The Router Component

Use the `<Router />` component to render the currently matched route:

```tova
component App {
  <div class="app">
    <NavBar />
    <main>
      <Router />
    </main>
    <Footer />
  </div>
}
```

`Router` reads the active route signal and renders the matched component. When the URL changes, `Router` automatically re-renders with the new component. If the matched component is a function, it receives the route params as its argument.

## Programmatic Navigation

Use `navigate(path)` to change the route from code:

```tova
component LoginForm {
  state username = ""
  state password = ""

  fn handle_submit() {
    result = server.login(username, password)
    if result.success {
      navigate("/dashboard")
    }
  }

  <form on:submit={fn(e) {
    e.preventDefault()
    handle_submit()
  }}>
    <input bind:value={username} placeholder="Username" />
    <input type="password" bind:value={password} placeholder="Password" />
    <button type="submit">"Log In"</button>
  </form>
}
```

`navigate` calls `window.history.pushState` to update the URL without a page reload. The route signal updates and any components reading it re-render. Paths without a leading `/` are automatically normalized (e.g., `"about"` becomes `"/about"`).

If no router has been created yet, calling `navigate()` will auto-create a default router.

### Navigation Options

`navigate` accepts an optional second argument with these options:

| Option | Type | Description |
|---|---|---|
| `replace` | Bool | Replace the current history entry instead of pushing a new one |
| `state` | Object | Custom state object attached to the history entry |
| `query` | Object | Query parameters to set on the URL (replaces any query in the path) |

```tova
// Replace history (back button skips this entry)
navigate("/step-2", { replace: true })

// Attach state
navigate("/checkout", { state: { fromCart: true } })

// Set query parameters — navigates to /search?q=hello&category=docs
navigate("/search", { query: { q: "hello", category: "docs" } })
```

### Back and Forward

The router also provides `back()` and `forward()` for browser history navigation:

```tova
router = getRouter()
router.back()     // equivalent to browser back button
router.forward()  // equivalent to browser forward button
```

## Link Component

The `Link` component provides client-side navigation without a full page reload:

```tova
component NavBar {
  <nav>
    <Link href="/">"Home"</Link>
    <Link href="/about">"About"</Link>
    <Link href="/users">"Users"</Link>
  </nav>
}
```

`Link` renders an `<a>` tag that intercepts clicks for client-side navigation. It accepts all standard `<a>` attributes plus routing-specific props.

### Active Link Styling

`Link` supports automatic class toggling based on the current route:

```tova
<Link
  href="/users"
  class="nav-link"
  activeClass="active"
  exactActiveClass="current"
>
  "Users"
</Link>
```

| Prop | Description |
|---|---|
| `activeClass` | Added when the current path starts with the link's `href` (prefix match) |
| `exactActiveClass` | Added only when the current path exactly equals the link's `href` |

When both props are provided, `exactActiveClass` takes priority on an exact match -- they do not both apply simultaneously. On `/users`, a link with `href="/users"` gets `exactActiveClass`. On `/users/42`, it gets `activeClass`.

For the root path `/`, `activeClass` uses exact matching to avoid being active on every page.

Active classes are computed reactively -- they update automatically when the route changes.

```tova
// Common pattern: highlight current section
component SiteNav {
  <nav class="flex gap-4">
    <Link href="/" exactActiveClass="text-indigo-600 font-semibold" class="text-gray-500">"Home"</Link>
    <Link href="/docs" activeClass="text-indigo-600 font-semibold" class="text-gray-500">"Docs"</Link>
    <Link href="/blog" activeClass="text-indigo-600 font-semibold" class="text-gray-500">"Blog"</Link>
  </nav>
}
```

### External Links

`Link` is for internal navigation. For external links, use a regular `<a>` tag. The router's global click handler automatically skips interception for:
- Links with `target="_blank"` -- opens in new tab
- Links with a `download` attribute -- triggers file download
- Links with `rel="external"` -- treated as external navigation
- Meta/Ctrl/Shift/Alt + click -- opens in new tab (standard browser behavior)
- Links pointing to a different origin

## Redirect Component

The `Redirect` component immediately navigates to a different path when rendered:

```tova
component ProtectedPage {
  user = inject(auth_ctx)

  if user == nil {
    <Redirect to="/login" />
  } else {
    <Dashboard user={user} />
  }
}
```

`Redirect` navigates after the current render cycle using `queueMicrotask`, avoiding synchronous navigation during rendering. It includes redirect loop protection -- if more than 10 redirects happen within one second, the router aborts and logs an error.

## Nested Routes

For applications with shared layouts (dashboards, admin panels, settings pages), define nested routes with a `children` map:

```tova
createRouter({
  routes: {
    "/": HomePage,
    "/settings": {
      component: SettingsLayout,
      children: {
        "/profile": ProfileSettings,
        "/account": AccountSettings,
        "/billing": BillingSettings
      }
    },
    "404": NotFoundPage
  }
})
```

### How Child Paths Resolve

Child paths are concatenated with the parent path:

| Parent | Child | Resolved |
|---|---|---|
| `/settings` | `/profile` | `/settings/profile` |
| `/settings` | `/account` | `/settings/account` |
| `/dashboard` | `/` | `/dashboard` |

The special child path `"/"` matches the parent path exactly, making it the default child.

### Outlet Component

Inside a layout component, use `<Outlet />` to render the matched child:

```tova
component SettingsLayout {
  <div class="flex gap-8">
    <aside>
      <nav class="space-y-1">
        <Link href="/settings/profile" activeClass="bg-indigo-50 text-indigo-700" class="block px-3 py-2 rounded-lg text-sm">"Profile"</Link>
        <Link href="/settings/account" activeClass="bg-indigo-50 text-indigo-700" class="block px-3 py-2 rounded-lg text-sm">"Account"</Link>
        <Link href="/settings/billing" activeClass="bg-indigo-50 text-indigo-700" class="block px-3 py-2 rounded-lg text-sm">"Billing"</Link>
      </nav>
    </aside>
    <main>
      <Outlet />
    </main>
  </div>
}
```

When the URL is `/settings/profile`, `SettingsLayout` renders with `ProfileSettings` in the `<Outlet />` slot. `Outlet` returns null if no child route matches or if no router exists.

### Nested Route Metadata

Child routes can have their own metadata. When a child matches, metadata is merged (child overrides parent):

```tova
"/settings": {
  component: SettingsLayout,
  meta: { section: "settings" },
  children: {
    "/profile": { component: ProfileSettings, meta: { title: "Profile" } },
    "/account": { component: AccountSettings, meta: { title: "Account" } }
  }
}
```

For `/settings/profile`, `getMeta()()` returns `{ section: "settings", title: "Profile" }`.

## Lazy Loading

For large applications, load route components on demand with `lazy()`:

```tova
createRouter({
  routes: {
    "/": HomePage,
    "/dashboard": lazy(fn() import("./dashboard")),
    "/admin": lazy(fn() import("./admin")),
    "/reports": lazy(fn() import("./reports"))
  },
  loading: LoadingSpinner,
  error: LoadError,
})
```

`lazy` takes a function that returns a dynamic import promise. The component is loaded the first time the route is visited and cached for subsequent visits.

### Loading and Error States

Configure components to show during lazy loading:

```tova
component LoadingSpinner {
  <div class="flex items-center justify-center py-16">
    <div class="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
  </div>
}

component LoadError {
  <div class="text-center py-16">
    <p class="text-red-600">"Failed to load page"</p>
    <button on:click={fn() navigate(getPath()())}>"Retry"</button>
  </div>
}

createRouter({
  routes: { "/heavy": lazy(fn() import("./heavy")) },
  loading: LoadingSpinner,
  error: LoadError,
})
```

The `loading` signal is available via `getRouter().loading()` for custom loading indicators.

### Module Resolution

When a lazy import resolves, the router looks for the component in this order:
1. `module.default` -- the default export
2. `module.Page` -- a named `Page` export
3. The module itself -- if it's a function

## Reactive Route Signals

The router exposes signal-based accessors for reading route information reactively. There are two API styles: module-level functions (simple) and router instance getters (advanced).

### Module-Level Functions

These work without a reference to the router instance:

```tova
component Breadcrumb {
  route = getCurrentRoute()

  <nav>
    <span>"Current: {route().path}"</span>
  </nav>
}
```

| Function | Returns | Description |
|---|---|---|
| `getCurrentRoute()` | Signal | Full route object: `{ path, params, query, meta, component }` |
| `getPath()` | Signal | The matched route pattern (e.g., `/users/:id`) |
| `getParams()` | Signal | Extracted path parameters (e.g., `{ id: "42" }`) |
| `getQuery()` | Signal | Parsed query string (e.g., `{ q: "hello", page: "2" }`) |
| `getMeta()` | Signal | Route metadata (e.g., `{ title: "Users" }`) |
| `getRouter()` | Router | The active router instance |

### Reading Params in Components

The most common pattern is reading dynamic params:

```tova
component UserPage {
  params = getParams()
  state user = nil

  effect {
    user = server.get_user(params().id)
  }

  if user != nil {
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  } else {
    <p>"Loading..."</p>
  }
}
```

Components with dynamic route params also receive params as function arguments:

```tova
component UserPage(id) {
  // id is extracted from /users/:id and passed directly
  <h1>"User {id}"</h1>
}
```

### Reading Query Parameters

Query strings are parsed automatically. For a URL like `/search?q=hello&page=2`, `getQuery()()` returns `{ q: "hello", page: "2" }`. All values are strings.

```tova
component SearchResults {
  query_signal = getQuery()

  state results = []

  effect {
    search_term = query_signal().q
    if search_term != nil {
      results = server.search(search_term)
    }
  }

  <div>
    <h1>"Results for \"{query_signal().q}\""</h1>
    for item in results key={item.id} {
      <ResultCard result={item} />
    }
  </div>
}
```

Repeated query parameters are collected into arrays:

```tova
// URL: /search?tag=rust&tag=wasm
query_signal().tag  // ["rust", "wasm"]
```

All query values are strings. Boolean-style parameters (key without `=`) resolve to empty strings:

```tova
// URL: /search?verbose&limit=10
query_signal().verbose  // ""
query_signal().limit    // "10"
```

### Router Instance API

For advanced control, access the router instance via `getRouter()`:

```tova
router = getRouter()

// Reactive signal getters
router.path()     // matched route pattern (e.g., "/users/:id")
router.params()   // route parameters
router.query()    // parsed query string
router.meta()     // route metadata
router.route()    // full route object
router.loading()  // true during lazy loading

// Navigation
router.navigate("/path", { replace: true })
router.back()
router.forward()

// Active state checking
router.isActive("/users")        // prefix match (reactive)
router.isActive("/users", true)  // exact match (reactive)

// Lifecycle
router.destroy()  // remove all listeners and clean up
```

## Navigation Guards

Guards run before or after route changes. Use them for authentication, unsaved form protection, analytics, or data prefetching.

### beforeNavigate

`beforeNavigate(callback)` registers a hook that runs before every navigation. Return `false` to cancel, or return a path string to redirect:

```tova
browser {
  // Protect authenticated routes
  beforeNavigate(fn(from, to_path) {
    if to_path.startsWith("/dashboard") and not is_logged_in() {
      "/login"  // Redirect to login
    }
  })

  // Prevent navigation with unsaved changes
  beforeNavigate(fn(from, to_path) {
    if has_unsaved_changes {
      false  // Cancel navigation
    }
  })
}
```

The callback receives:
- **from** -- the current route object (`{ path, params, query, meta, component }`)
- **to_path** -- the path string being navigated to

Return values:
- `false` -- cancel navigation entirely
- A path string (e.g., `"/login"`) -- redirect to that path instead
- `true`, `nil`, or nothing -- allow navigation to proceed

Guards also run on browser back/forward (`popstate` events). If a guard cancels during popstate, the previous URL is restored.

### afterNavigate

`afterNavigate(callback)` runs after every successful route change. This is the right place for analytics, document title updates, and post-navigation effects:

```tova
browser {
  // Update document title from route metadata
  afterNavigate(fn(current) {
    if current.meta != undefined {
      if current.meta.title != undefined {
        document.title = "{current.meta.title} | My App"
      }
    }
  })

  // Track page views
  afterNavigate(fn(current) {
    analytics.track("page_view", current.path)
  })
}
```

### Unsubscribing

Both `beforeNavigate` and `afterNavigate` return an unsubscribe function:

```tova
unsub = beforeNavigate(fn(from, to_path) {
  // guard logic
})

// Later, remove the guard
unsub()
```

### onRouteChange

`onRouteChange(callback)` is a simpler hook that fires on every route change. The callback receives the matched route object (or `nil` if nothing matched):

```tova
onRouteChange(fn(matched) {
  print("Route changed to: {matched.path}")
})
```

## Scroll Restoration

The router manages scroll position automatically based on the `scroll` option.

### Auto (Default)

With `scroll: "auto"`:
- **New navigation**: scrolls to the top of the page
- **Back/forward**: restores the previously saved scroll position

The router saves scroll positions keyed by URL (pathname + query) before each navigation, keeping up to 200 entries to prevent memory leaks.

### None

With `scroll: "none"`, the router does not manage scroll position at all.

### Custom Function

Pass a function for full control:

```tova
createRouter({
  routes: { ... },
  scroll: fn(context) {
    if context.savedPosition != nil {
      context.savedPosition  // restore on back/forward
    } else {
      { x: 0, y: 0 }  // scroll to top on new navigation
    }
  }
})
```

The context object contains:
- `savedPosition` -- `{ x, y }` from a previous visit (or `nil`)
- `to` -- the target path

## Base Path

Deploy your app in a subdirectory by setting the `base` option:

```tova
createRouter({
  routes: { "/": HomePage, "/about": AboutPage },
  base: "/myapp"
})
```

### How Base Path Works

**Incoming URLs** are stripped of the base prefix before matching:
- Browser URL `/myapp/about` is matched as `/about`

**Outgoing URLs** have the base prefix prepended:
- `navigate("/about")` pushes `/myapp/about` to the browser history
- `<Link href="/about">` renders as `<a href="/myapp/about">`

This means your route definitions and navigation calls always use paths relative to the base -- you never include the base prefix in your application code.

## Browser Integration

The router automatically integrates with the browser's navigation APIs.

### History API

- `navigate(path)` calls `window.history.pushState` to update the URL without a page reload
- The router listens for `popstate` events (triggered by the browser's back/forward buttons) and re-matches the route

### Link Interception

The router installs a global click handler on `document` that intercepts clicks on `<a>` tags. Same-origin links are handled with client-side navigation instead of a full page load. These links are not intercepted:
- Links with `target="_blank"`
- Links with a `download` attribute
- Links with `rel="external"`
- Clicks with Meta, Ctrl, Shift, or Alt held (opens in new tab)
- Links pointing to a different origin

### Path Validation (Security)

`navigate()` validates all paths before navigation. The following are blocked to prevent open redirects and XSS:

- Protocol-relative URLs (`//evil.com`)
- Absolute URLs with schemes (`http://evil.com`, `javascript:alert(1)`, `data:...`)
- Non-string values

Only relative paths (starting with `/` or a path segment) are allowed. Invalid paths are logged as warnings and silently ignored.

## Full Example

A complete single-page application with navigation, dynamic routes, nested layouts, metadata, and guards:

```tova
browser {
  component NavBar {
    <nav class="flex gap-6 p-4 border-b">
      <Link href="/" exactActiveClass="text-indigo-600 font-bold" class="text-gray-500">"Home"</Link>
      <Link href="/users" activeClass="text-indigo-600 font-bold" class="text-gray-500">"Users"</Link>
      <Link href="/settings" activeClass="text-indigo-600 font-bold" class="text-gray-500">"Settings"</Link>
    </nav>
  }

  component HomePage {
    <div class="p-8">
      <h1>"Welcome"</h1>
      <p>"Navigate using the links above."</p>
    </div>
  }

  fn go_to_user(uid) {
    navigate("/users/{uid}")
  }

  component UsersPage {
    <div class="p-8">
      <h1>"Users"</h1>
      <ul>
        <li on:click={fn() go_to_user("1")}>"Alice"</li>
        <li on:click={fn() go_to_user("2")}>"Bob"</li>
      </ul>
    </div>
  }

  component UserPage(id) {
    <div class="p-8">
      <button on:click={fn() navigate("/users")}>"Back"</button>
      <h1>"User {id}"</h1>
      <p>"Dynamic param :id = {id}"</p>
    </div>
  }

  component SettingsLayout {
    <div class="flex gap-8 p-8">
      <aside>
        <Link href="/settings/profile" activeClass="font-bold">"Profile"</Link>
        <Link href="/settings/account" activeClass="font-bold">"Account"</Link>
      </aside>
      <main>
        <Outlet />
      </main>
    </div>
  }

  component ProfileSettings {
    <div>
      <h2>"Profile Settings"</h2>
      <p>"Nested child rendered via Outlet."</p>
    </div>
  }

  component AccountSettings {
    <div>
      <h2>"Account Settings"</h2>
      <p>"Another nested child."</p>
    </div>
  }

  component NotFoundPage {
    <div class="p-8 text-center">
      <h1>"404"</h1>
      <p>"Page not found."</p>
      <Link href="/">"Go Home"</Link>
    </div>
  }

  // ─── Router setup ─────────────────────────────────────────
  createRouter({
    routes: {
      "/": HomePage,
      "/users": { component: UsersPage, meta: { title: "Users" } },
      "/users/:id": { component: UserPage, meta: { title: "User Detail" } },
      "/settings": {
        component: SettingsLayout,
        children: {
          "/profile": { component: ProfileSettings, meta: { title: "Profile" } },
          "/account": { component: AccountSettings, meta: { title: "Account" } },
        },
      },
      "404": NotFoundPage,
    },
    scroll: "auto",
  })

  // Update document title from route meta
  afterNavigate(fn(current) {
    if current.meta != undefined {
      if current.meta.title != undefined {
        document.title = "{current.meta.title} | My App"
      }
    }
  })

  component App {
    <div>
      <NavBar />
      <Router />
    </div>
  }
}
```

## Quick Start with Templates

The `tova new` command generates projects with routing already configured:

```bash
# Single-page app with full routing demo
tova new my-app --template spa

# Static site with page-based routing
tova new my-site --template site

# Full-stack app with server + client routing
tova new my-app --template fullstack
```

Each template includes `createRouter`, `Link` with active classes, `afterNavigate` for title updates, and a `404` page out of the box.

## API Reference

### Router Creation

| API | Description |
|---|---|
| `createRouter(config)` | Create a router with routes, base path, scroll behavior, and loading/error components |
| `defineRoutes(map)` | Shorthand that calls `createRouter({ routes: map })` |
| `getRouter()` | Get the active router instance |
| `resetRouter()` | Destroy the active router (useful in tests) |

### Navigation

| API | Description |
|---|---|
| `navigate(path, options?)` | Navigate to a path. Options: `replace`, `state`, `query` |
| `router.navigate(path, options?)` | Instance method equivalent |
| `router.back()` | Go back in browser history |
| `router.forward()` | Go forward in browser history |

### Reactive Signals

| API | Returns | Description |
|---|---|---|
| `getCurrentRoute()` | Signal | Full route object: `{ path, params, query, meta, component }` |
| `getPath()` | Signal | Matched route pattern |
| `getParams()` | Signal | Extracted path parameters |
| `getQuery()` | Signal | Parsed query string parameters |
| `getMeta()` | Signal | Route metadata |
| `router.path()` | String | Matched route pattern (reactive -- auto-updates on route change) |
| `router.params()` | Object | Route parameters (reactive) |
| `router.query()` | Object | Query parameters (reactive) |
| `router.meta()` | Object | Route metadata (reactive) |
| `router.route()` | Object | Full route object (reactive) |
| `router.loading()` | Bool | Whether a lazy route is loading (reactive) |

### Guards and Hooks

| API | Description |
|---|---|
| `beforeNavigate(cb)` | Run before navigation. Return `false` to cancel, string to redirect |
| `afterNavigate(cb)` | Run after navigation completes |
| `onRouteChange(cb)` | Callback on every route change |
| `router.isActive(path, exact?)` | Reactive function that returns whether a path is active |

### Components

| Component | Props | Description |
|---|---|---|
| `<Router />` | none | Renders the matched route component |
| `<Outlet />` | none | Renders the matched child route in nested layouts |
| `<Link>` | `href`, `activeClass`, `exactActiveClass`, + any `<a>` attr | Client-side navigation link |
| `<Redirect>` | `to` | Immediate redirect (with loop protection) |

### Route Patterns

| Pattern | Example | Matches |
|---|---|---|
| Static | `/about` | `/about` exactly |
| Dynamic | `/users/:id` | `/users/42`, `/users/alice` |
| Optional | `/posts/:id?` | `/posts/` and `/posts/42` |
| Catch-all | `/blog/*` | `/blog/anything/here` |
| Nested | `{ component, children }` | Parent layout with child routes |
| Not found | `"404"` | When no route matches |

### Lazy Loading

| API | Description |
|---|---|
| `lazy(fn)` | Wrap a dynamic import for on-demand route loading |

## Related Pages

- [Signals](/reactivity/signals) -- the reactive primitives that power route signals
- [Components](/reactivity/components) -- building the page components that routes render
- [Effects](/reactivity/effects) -- reacting to route changes with side effects
- [Browser Block](/fullstack/browser-block) -- the `browser {}` scope where routing lives
- [Architecture](/fullstack/architecture) -- how routing fits into the full-stack model
