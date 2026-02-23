# Router

Tova includes a built-in client-side router that integrates with the reactive signal system. Route changes are reactive -- components that read the route signal automatically re-render when the URL changes.

## Defining Routes

Use `defineRoutes` to declare your application's routes. Pass an object mapping URL patterns to components:

```tova
client {
  defineRoutes({
    "/": HomePage,
    "/about": AboutPage,
    "/users": UserListPage,
    "/users/:id": UserDetailPage,
    "/settings": SettingsPage,
    "404": NotFoundPage
  })
}
```

`defineRoutes` processes the route map and immediately matches the current URL. If no route matches, the `"404"` component is rendered.

## Route Patterns

### Static Routes

Static routes match exact paths:

```tova
defineRoutes({
  "/": HomePage,
  "/about": AboutPage,
  "/contact": ContactPage
})
```

### Path Parameters

Use `:name` to capture dynamic path segments:

```tova
defineRoutes({
  "/users/:id": UserPage,
  "/posts/:slug": PostPage,
  "/users/:user_id/posts/:post_id": UserPostPage
})
```

When the URL `/users/42` is matched against `/users/:id`, the params object will contain `{ id: "42" }`.

### Optional Parameters

Append `?` to make a parameter optional:

```tova
defineRoutes({
  "/posts/:id?": PostPage
})
```

This matches both `/posts` (where `id` is `nil`) and `/posts/42` (where `id` is `"42"`).

### Catch-All Route

Use `"*"` to match any URL that doesn't match a defined route:

```tova
defineRoutes({
  "/": HomePage,
  "/about": AboutPage,
  "*": CatchAllPage
})
```

The catch-all route is different from the `"404"` route:
- `"*"` is a pattern-matched route that captures everything -- it acts as a fallback with the full routing infrastructure
- `"404"` is a special key that designates a component to render when no route matches

Both serve as fallbacks, but `"*"` has a lower priority than specific routes and is treated as the last pattern to try.

## The Router Component

Use the `Router` component to render the currently matched route:

```tova
component App {
  defineRoutes({
    "/": HomePage,
    "/about": AboutPage,
    "/users/:id": UserPage,
    "404": NotFoundPage
  })

  <div class="app">
    <NavBar />
    <main>
      <Router />
    </main>
    <Footer />
  </div>
}
```

`Router` reads the route signal and renders the matched component. When the route changes, `Router` automatically re-renders with the new component. The matched component receives the route params as its argument.

## Programmatic Navigation

Use `navigate(path)` to change the route programmatically:

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
    <button type="submit">Log In</button>
  </form>
}
```

`navigate(path)` calls `window.history.pushState` and triggers route matching. The route signal updates, and any components reading it re-render.

## Link Component

The `Link` component provides client-side navigation without a full page reload:

```tova
component NavBar {
  <nav>
    <Link href="/">Home</Link>
    <Link href="/about">About</Link>
    <Link href="/users">Users</Link>
    <Link href="/settings">Settings</Link>
  </nav>
}
```

`Link` renders an `<a>` tag with an `onClick` handler that calls `e.preventDefault()` and `navigate(href)`. It accepts all standard `<a>` attributes in addition to `href`:

```tova
<Link href="/profile" class="nav-link" id="profile-link">
  Profile
</Link>
```

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

`Redirect` uses `queueMicrotask` to navigate after the current render cycle, avoiding issues with synchronous navigation during rendering.

## Reactive Route Signals

The router exposes several signal-based accessors for reading route information reactively.

### getCurrentRoute

Returns the route signal getter. The signal value is an object with `path`, `params`, `query`, and `component`:

```tova
component Breadcrumb {
  route = getCurrentRoute()

  <nav class="breadcrumb">
    <span>Current path: {route().path}</span>
  </nav>
}
```

The route object shape:

```javascript
{
  path: "/users/:id",     // The matched route pattern
  params: { id: "42" },   // Extracted path parameters
  query: { tab: "posts" }, // Parsed query string parameters
  component: UserPage      // The matched component
}
```

### getParams

Returns a signal getter for the route params:

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
    <p>Loading...</p>
  }
}
```

### getPath

Returns a signal getter for the current matched path pattern:

```tova
component NavItem(href, label) {
  path = getPath()

  <Link href={href} class:active={path() == href}>
    {label}
  </Link>
}
```

### getQuery

Returns a signal getter for the parsed query string:

```tova
component SearchResults {
  query = getQuery()

  state results = []

  effect {
    search_term = query().q
    if search_term != nil {
      results = server.search(search_term)
    }
  }

  <div>
    <h1>Results for "{query().q}"</h1>
    for result in results key={result.id} {
      <ResultCard result={result} />
    }
  </div>
}
```

The query string is parsed automatically. For a URL like `/search?q=hello&page=2`, `getQuery()()` returns `{ q: "hello", page: "2" }`. All values are strings.

## onRouteChange (Legacy Callback API)

For code that does not use the reactive signal pattern, `onRouteChange` registers a callback that fires on every route change:

```tova
onRouteChange(fn(matched) {
  print("Route changed to: {matched.path}")
  analytics.track_page_view(matched.path)
})
```

The callback receives the matched route object (or `nil` if no route matched). This API works alongside the signal-based approach -- you can use both.

## Browser Integration

The router automatically integrates with the browser's navigation APIs:

### History API

- `navigate(path)` calls `window.history.pushState({}, '', path)` to update the URL without a page reload
- The router listens for `popstate` events (triggered by the browser's back/forward buttons) and re-matches the route

### Link Interception

The router installs a global click handler on `document` that intercepts clicks on `<a>` tags. If a link's `href` points to the same origin, the click is intercepted for client-side navigation instead of a full page load:

```javascript
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href]');
  if (link && link.href.startsWith(window.location.origin)) {
    e.preventDefault();
    navigate(link.getAttribute('href'));
  }
});
```

This means even regular `<a>` tags (not just `<Link>` components) get client-side navigation automatically when they link to same-origin paths.

## Full Router Example

```tova
client {
  component App {
    defineRoutes({
      "/": HomePage,
      "/about": AboutPage,
      "/users": UserListPage,
      "/users/:id": UserDetailPage,
      "/settings": SettingsPage,
      "404": NotFoundPage
    })

    <div class="app">
      <header>
        <nav>
          <Link href="/" class="logo">MyApp</Link>
          <Link href="/about">About</Link>
          <Link href="/users">Users</Link>
          <Link href="/settings">Settings</Link>
        </nav>
      </header>
      <main>
        <Router />
      </main>
    </div>
  }

  component HomePage {
    <div>
      <h1>Welcome</h1>
      <p>This is the home page.</p>
    </div>
  }

  component AboutPage {
    <div>
      <h1>About</h1>
      <p>Learn more about us.</p>
    </div>
  }

  component UserListPage {
    state users = []

    effect {
      users = server.get_users()
    }

    <div>
      <h1>Users</h1>
      <ul>
        for user in users key={user.id} {
          <li>
            <Link href="/users/{user.id}">{user.name}</Link>
          </li>
        }
      </ul>
    </div>
  }

  component UserDetailPage {
    params = getParams()
    state user = nil

    effect {
      user = server.get_user(params().id)
    }

    if user != nil {
      <div>
        <h1>{user.name}</h1>
        <p>Email: {user.email}</p>
        <p>Role: {user.role}</p>
        <button on:click={fn() navigate("/users")}>Back to Users</button>
      </div>
    } else {
      <p>Loading user...</p>
    }
  }

  component SettingsPage {
    <div>
      <h1>Settings</h1>
      <p>Configure your preferences.</p>
    </div>
  }

  component NotFoundPage {
    <div>
      <h1>404</h1>
      <p>Page not found.</p>
      <Link href="/">Go Home</Link>
    </div>
  }
}
```

## Summary

| API | Description |
|---|---|
| `defineRoutes(map)` | Declare route patterns and their components |
| `navigate(path)` | Programmatic navigation via `pushState` |
| `getCurrentRoute()` | Signal getter for the full route object |
| `getParams()` | Signal getter for `route().params` |
| `getPath()` | Signal getter for `route().path` |
| `getQuery()` | Signal getter for `route().query` |
| `Router` | Component that renders the matched route |
| `Link({ href })` | Client-side navigation link |
| `Redirect({ to })` | Immediate redirect component |
| `onRouteChange(cb)` | Legacy callback for route change events |
| `:param` | Path parameter (e.g., `/users/:id`) |
| `:param?` | Optional path parameter |
| `"404"` | Not-found component key |
| `"*"` | Catch-all route pattern |
