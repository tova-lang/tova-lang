// Client-side router for Tova — integrated with the signal system
// Route changes are reactive: components that read route() or params() auto-update.

import { createSignal, tova_el } from './reactivity.js';

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

// ─── Public API ───────────────────────────────────────────

export function defineRoutes(routeMap) {
  routeDefinitions = Object.entries(routeMap).map(([path, component]) => {
    // Special 404 route
    if (path === '404' || path === '*') {
      notFoundComponent = component;
      // Catch-all '*' still gets a regex pattern for matching
      if (path === '*') {
        return { path, pattern: /^(.*)$/, component, isCatchAll: true };
      }
      return null;
    }
    return {
      path,
      pattern: pathToRegex(path),
      component,
      isCatchAll: false,
    };
  }).filter(Boolean);
  // Match initial route
  handleRouteChange();
}

export function navigate(path) {
  if (typeof window !== 'undefined') {
    window.history.pushState({}, '', path);
    handleRouteChange();
  }
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

export function Redirect({ to }) {
  if (typeof window !== 'undefined') {
    queueMicrotask(() => navigate(to));
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
}

function matchRoute(path) {
  for (const def of routeDefinitions) {
    const match = def.pattern.exec(path);
    if (match) {
      const params = extractParams(def.path, match);
      return { path: def.path, component: def.component, params };
    }
  }
  return null;
}

function pathToRegex(path) {
  // Handle optional parameters: :id? becomes ([^/]+)?
  // Handle required parameters: :id becomes ([^/]+)
  // Handle catch-all: * becomes (.*)
  const pattern = path
    .replace(/:([a-zA-Z_]+)\?/g, '([^/]*)?')   // optional params
    .replace(/:([a-zA-Z_]+)/g, '([^/]+)')        // required params
    .replace(/\*/g, '(.*)');                       // catch-all
  return new RegExp(`^${pattern}$`);
}

function extractParams(routePath, match) {
  const params = {};
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
  window.addEventListener('popstate', handleRouteChange);

  // Intercept link clicks for client-side navigation
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (link && link.href.startsWith(window.location.origin)) {
      e.preventDefault();
      navigate(link.getAttribute('href'));
    }
  });
}
