// Client-side router for Tova — integrated with the signal system
// Route changes are reactive: components that read route() or params() auto-update.

import { createSignal, tova_el, tova_fragment, createEffect, onCleanup } from './reactivity.js';

// ─── Route Signal ─────────────────────────────────────────
// The route is a signal, so any component/effect that reads it
// will automatically re-run when the route changes.

const [route, setRoute] = createSignal({
  path: '/',
  pattern: null,
  component: null,
  params: {},
  query: {},
});

let routeDefinitions = [];
let routeChangeCallbacks = [];
let notFoundComponent = null;
let beforeNavigateHooks = [];
let afterNavigateHooks = [];

// ─── Path Validation ─────────────────────────────────────
// Reject absolute URLs, protocol-relative URLs, and javascript: URIs
// to prevent open redirects and XSS.

function isValidPath(path) {
  if (typeof path !== 'string') return false;
  // Reject protocol-relative URLs (//evil.com)
  if (path.startsWith('//')) return false;
  // Reject absolute URLs with schemes (http:, javascript:, data:, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(path)) return false;
  // Must start with / or be a relative path segment
  return true;
}

// ─── Public API ───────────────────────────────────────────

export function defineRoutes(routeMap) {
  routeDefinitions = [];
  const entries = Object.entries(routeMap);
  for (const [path, value] of entries) {
    // Special 404 route
    if (path === '404' || path === '*') {
      const component = (typeof value === 'object' && value !== null && value.component) ? value.component : value;
      notFoundComponent = component;
      // Catch-all '*' still gets a regex pattern for matching
      if (path === '*') {
        routeDefinitions.push({ path, pattern: /^(.*)$/, component, isCatchAll: true, children: null });
      }
      continue;
    }

    if (typeof value === 'object' && value !== null && value.component) {
      // Nested route definition: { component: Layout, children: { "/": Home, "/settings": Settings } }
      const parentDef = {
        path,
        pattern: pathToRegex(path, true), // prefix match for parent
        component: value.component,
        isCatchAll: false,
        children: [],
      };
      if (value.children) {
        for (const [childPath, childComponent] of Object.entries(value.children)) {
          const fullPath = childPath === '/' ? path : path + childPath;
          parentDef.children.push({
            path: fullPath,
            relativePath: childPath,
            pattern: pathToRegex(fullPath),
            component: childComponent,
            isCatchAll: false,
            children: null,
          });
        }
      }
      routeDefinitions.push(parentDef);
    } else {
      routeDefinitions.push({
        path,
        pattern: pathToRegex(path),
        component: value,
        isCatchAll: false,
        children: null,
      });
    }
  }
  // Match initial route
  handleRouteChange();
}

export function navigate(path) {
  // Validate path first — reject unsafe URLs regardless of environment
  if (!isValidPath(path)) {
    if (typeof console !== 'undefined') {
      console.warn('Tova router: Blocked navigation to unsafe path: ' + path);
    }
    return;
  }
  // Normalize: ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : '/' + path;

  // Run beforeNavigate hooks — any returning false cancels navigation
  const from = route();
  for (const hook of beforeNavigateHooks) {
    const result = hook(from, normalizedPath);
    if (result === false) return;
    // If hook returns a string, redirect to that path instead
    if (typeof result === 'string' && isValidPath(result)) {
      if (typeof window !== 'undefined') {
        window.history.pushState({}, '', result);
      }
      handleRouteChange();
      return;
    }
  }

  if (typeof window !== 'undefined') {
    window.history.pushState({}, '', normalizedPath);
  }
  handleRouteChange();
}

export function getCurrentRoute() {
  return route;  // returns the signal getter
}

export function getParams() {
  return () => route().params;
}

export function getPath() {
  return () => route().path;
}

export function getQuery() {
  return () => route().query;
}

// Legacy callback API (still works alongside signals)
export function onRouteChange(callback) {
  routeChangeCallbacks.push(callback);
}

// ─── Navigation Guards ───────────────────────────────────
// beforeNavigate: called before route changes. Return false to cancel,
// return a string to redirect, return true/undefined to proceed.
// afterNavigate: called after route has changed.

export function beforeNavigate(callback) {
  beforeNavigateHooks.push(callback);
  // Return unsubscribe function
  return () => {
    const idx = beforeNavigateHooks.indexOf(callback);
    if (idx !== -1) beforeNavigateHooks.splice(idx, 1);
  };
}

export function afterNavigate(callback) {
  afterNavigateHooks.push(callback);
  // Return unsubscribe function
  return () => {
    const idx = afterNavigateHooks.indexOf(callback);
    if (idx !== -1) afterNavigateHooks.splice(idx, 1);
  };
}

// ─── Router Component ─────────────────────────────────────
// Renders the matched route's component reactively.
// Usage: <Router /> in JSX

export function Router() {
  const r = route();
  if (r && r.component) {
    return typeof r.component === 'function' ? r.component(r.params) : r.component;
  }
  return null;
}

// ─── Outlet Component ────────────────────────────────────
// Renders the matched child route's component inside a parent layout.
// Usage: <Outlet /> inside a layout component
// Child route is stored as a signal for reactivity and isolation.

const [currentChildRoute, setCurrentChildRoute] = createSignal(null);

export function Outlet() {
  const child = currentChildRoute();
  if (child && child.component) {
    const comp = child.component;
    const params = child.params || {};
    return typeof comp === 'function' ? comp(params) : comp;
  }
  return null;
}

// ─── Link Component ───────────────────────────────────────
// Client-side navigation link.
// Usage: <Link href="/about">"About"</Link>

export function Link({ href, children, ...rest }) {
  return tova_el('a', {
    href,
    onClick: (e) => {
      e.preventDefault();
      navigate(href);
    },
    ...rest,
  }, children || []);
}

// ─── Redirect Component ──────────────────────────────────
// Immediately navigates to a different path when rendered.
// Usage: <Redirect to="/login" />
// Loop protection: max 10 redirects in 1 second to prevent infinite loops.

let _redirectCount = 0;
let _redirectWindowStart = 0;
const _MAX_REDIRECTS = 10;
const _REDIRECT_WINDOW_MS = 1000;

export function Redirect({ to }) {
  if (typeof window !== 'undefined') {
    queueMicrotask(() => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - _redirectWindowStart > _REDIRECT_WINDOW_MS) {
        _redirectCount = 0;
        _redirectWindowStart = now;
      }
      _redirectCount++;
      if (_redirectCount > _MAX_REDIRECTS) {
        console.error(`Tova router: Redirect loop detected (>${_MAX_REDIRECTS} redirects in ${_REDIRECT_WINDOW_MS}ms). Aborting redirect to "${to}".`);
        return;
      }
      navigate(to);
    });
  }
  return null;
}

// ─── Internals ────────────────────────────────────────────

function parseQueryString(search) {
  const query = {};
  if (!search || search === '?') return query;
  const str = search.startsWith('?') ? search.slice(1) : search;
  for (const pair of str.split('&')) {
    const [key, ...rest] = pair.split('=');
    const value = rest.join('=');
    if (key) {
      query[decodeURIComponent(key)] = value !== undefined ? decodeURIComponent(value) : '';
    }
  }
  return query;
}

function handleRouteChange() {
  let path = '/';
  let query = {};
  if (typeof window !== 'undefined') {
    path = window.location.pathname;
    query = parseQueryString(window.location.search);
  }

  const matched = matchRoute(path);

  if (matched) {
    setRoute({ ...matched, query });
  } else if (notFoundComponent) {
    setRoute({ path, pattern: null, component: notFoundComponent, params: {}, query });
  } else {
    setRoute({ path, pattern: null, component: null, params: {}, query });
  }

  for (const cb of routeChangeCallbacks) {
    cb(matched);
  }

  // Run afterNavigate hooks
  const currentRoute = route();
  for (const hook of afterNavigateHooks) {
    hook(currentRoute);
  }
}

function matchRoute(path) {
  for (const def of routeDefinitions) {
    if (def.children && def.children.length > 0) {
      for (const child of def.children) {
        const childMatch = child.pattern.exec(path);
        if (childMatch) {
          const childParams = extractParams(child.path, childMatch);
          setCurrentChildRoute({ component: child.component, params: childParams });
          const parentMatch = def.pattern.exec(path);
          const parentParams = extractParams(def.path, parentMatch || []);
          return { path: def.path, component: def.component, params: { ...parentParams, ...childParams } };
        }
      }
      const parentMatch = def.pattern.exec(path);
      if (parentMatch) {
        setCurrentChildRoute(null);
        const params = extractParams(def.path, parentMatch);
        return { path: def.path, component: def.component, params };
      }
    } else {
      const match = def.pattern.exec(path);
      if (match) {
        setCurrentChildRoute(null);
        const params = extractParams(def.path, match);
        return { path: def.path, component: def.component, params };
      }
    }
  }
  setCurrentChildRoute(null);
  return null;
}

function pathToRegex(path, prefixMatch) {
  // Handle optional parameters: :id? becomes ([^/]*)?
  // Handle required parameters: :id becomes ([^/]+)
  // Handle catch-all: * becomes (.*)
  const pattern = path
    .replace(/:([a-zA-Z_]+)\?/g, '([^/]*)?')   // optional params
    .replace(/:([a-zA-Z_]+)/g, '([^/]+)')        // required params
    .replace(/\*/g, '(.*)');                       // catch-all
  // For parent routes with children, match as prefix
  if (prefixMatch) {
    return new RegExp('^' + pattern + '(?:/.*)?$');
  }
  return new RegExp('^' + pattern + '$');
}

function extractParams(routePath, match) {
  const params = {};
  if (!match) return params;
  // Match both required (:name) and optional (:name?) params
  const paramNames = (routePath.match(/:([a-zA-Z_]+)\??/g) || [])
    .map(p => p.replace(/^:/, '').replace(/\?$/, ''));
  paramNames.forEach((name, index) => {
    const val = match[index + 1];
    if (val !== undefined && val !== '') {
      params[name] = val;
    }
  });
  return params;
}

// ─── Browser Init ─────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    // Run beforeNavigate hooks for browser back/forward
    const from = route();
    const toPath = window.location.pathname;
    for (const hook of beforeNavigateHooks) {
      const result = hook(from, toPath);
      if (result === false) {
        // Cancel: push the previous path back
        window.history.pushState({}, '', from.path);
        return;
      }
    }
    handleRouteChange();
  });

  // Intercept link clicks for client-side navigation
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    // Use the resolved href for origin comparison (not raw attribute)
    if (!link.href.startsWith(window.location.origin)) return;
    // Skip links with target, download, or external rel
    if (link.target === '_blank') return;
    if (typeof link.hasAttribute === 'function' && link.hasAttribute('download')) return;
    if (typeof link.getAttribute === 'function') {
      const rel = link.getAttribute('rel');
      if (rel && rel.includes('external')) return;
    }
    e.preventDefault();
    // Use pathname from the resolved URL for safe navigation
    try {
      const url = new URL(link.href);
      navigate(url.pathname + (url.search || '') + (url.hash || ''));
    } catch (_) {
      // Fallback for environments without URL constructor
      const href = typeof link.getAttribute === 'function' ? link.getAttribute('href') : link.href;
      if (href && isValidPath(href)) navigate(href);
    }
  });
}
