# Router Rewrite: Class-Based, Production-Grade

**Date:** 2026-03-04
**Status:** Approved

## Overview

Rewrite Tova's router from module-level singletons to a class-based `TovRouter` instance created via `createRouter(config)`. Adds lazy loading, route metadata, scroll restoration, active links, navigate options, base path support, file-based routing, and comprehensive behavioral tests.

## Architecture

```
createRouter(config) → TovRouter instance → registers as _activeRouter
                                          → Router/Link/Outlet/Redirect read from _activeRouter
                                          → getPath/navigate/etc delegate to _activeRouter
```

Backward compatibility: all existing module-level functions (`defineRoutes`, `navigate`, `getPath`, etc.) continue working by delegating to `_activeRouter`.

## TovRouter Class

### Constructor Config

```javascript
createRouter({
  routes: {
    "/": HomePage,
    "/dashboard": { component: Dashboard, meta: { requiresAuth: true } },
    "/users/:id": lazy(() => import('./pages/user.js')),
    "/admin": {
      component: AdminLayout,
      children: { "/": AdminHome, "/users": AdminUsers }
    },
    "404": NotFoundPage,
  },
  base: "/app",
  scroll: "auto",       // "auto" | "none" | function
  loading: LoadingSpinner,
})
```

### Instance API

- `router.path` / `router.params` / `router.query` / `router.meta` — signal getters
- `router.route` — full route signal
- `router.isLoading` — lazy load state signal
- `router.navigate(path, { replace, state, query })` — with options
- `router.back()` / `router.forward()` — history navigation
- `router.isActive(path, exact?)` — reactive active state
- `router.beforeNavigate(hook)` / `router.afterNavigate(hook)` — guards
- `router.destroy()` — cleanup

## Features

### Lazy Loading
`lazy(importFn)` marker. On match: set `isLoading`, show `loading` component, call importFn, cache result, render.

### Route Metadata
`{ component: X, meta: { key: value } }`. Accessible via `router.meta()`. Guards read `to.meta`.

### Scroll Restoration
Save `{ x, y }` keyed by path. On back/forward restore saved. On new nav scroll to top. Custom function option.

### Active Link
`<Link href="/x" activeClass="active" exactActiveClass="exact">` — reactive class computation.

### Navigate Options
`navigate(path, { replace: true, state: {...}, query: { q: 'foo' } })`.

### Base Path
Strip from incoming URLs, prepend to outgoing pushState URLs and Link hrefs.

### pathToRegex Fix
Split on params/wildcards, escape static segments properly.

### Reset for Testing
`resetRouter()` destroys active router, nulls `_activeRouter`.

## File-Based Routing

Convention: `src/pages/` directory maps to routes at compile time.

```
src/pages/index.tova       → /
src/pages/about.tova       → /about
src/pages/users/[id].tova  → /users/:id
src/pages/blog/[...slug].tova → /blog/*
src/pages/_layout.tova     → Layout wrapper
src/pages/404.tova         → 404 page
```

Naming: `[param]` = dynamic, `[[param]]` = optional, `[...slug]` = catch-all, `_layout` = wrapper.

Opt-in: activates when `src/pages/` exists. Manual `createRouter()` takes precedence.

## Test Plan

Comprehensive behavioral tests:
- Route matching (static, params, optional, catch-all, nested, deep nested)
- Navigation (pushState, replaceState, back/forward, query serialization)
- Lazy loading lifecycle
- Guards (cancel, redirect, multiple, popstate)
- Scroll restoration
- Active link reactivity
- Base path
- Path validation (security)
- Router reset/destroy
- Edge cases (rapid navigation, redirect loops, special chars)
- File-based routing generation
