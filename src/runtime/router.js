// Simple client-side router for Lux

let currentRoute = null;
let routes = [];
let routeChangeCallbacks = [];

export function defineRoutes(routeMap) {
  routes = Object.entries(routeMap).map(([path, component]) => ({
    path,
    pattern: pathToRegex(path),
    component,
  }));
}

export function navigate(path) {
  if (typeof window !== 'undefined') {
    window.history.pushState({}, '', path);
    handleRouteChange();
  }
}

export function getCurrentRoute() {
  if (typeof window !== 'undefined') {
    return window.location.pathname;
  }
  return '/';
}

export function onRouteChange(callback) {
  routeChangeCallbacks.push(callback);
}

function handleRouteChange() {
  const path = getCurrentRoute();
  const matched = matchRoute(path);
  currentRoute = matched;

  for (const cb of routeChangeCallbacks) {
    cb(matched);
  }
}

function matchRoute(path) {
  for (const route of routes) {
    const match = route.pattern.exec(path);
    if (match) {
      const params = extractParams(route.path, match);
      return { path: route.path, component: route.component, params };
    }
  }
  return null;
}

function pathToRegex(path) {
  const pattern = path
    .replace(/:[a-zA-Z_]+/g, '([^/]+)')
    .replace(/\*/g, '(.*)');
  return new RegExp(`^${pattern}$`);
}

function extractParams(routePath, match) {
  const params = {};
  const paramNames = (routePath.match(/:[a-zA-Z_]+/g) || []).map(p => p.slice(1));
  paramNames.forEach((name, index) => {
    params[name] = match[index + 1];
  });
  return params;
}

// Initialize on load
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', handleRouteChange);

  // Intercept link clicks
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (link && link.href.startsWith(window.location.origin)) {
      e.preventDefault();
      navigate(link.getAttribute('href'));
    }
  });
}
