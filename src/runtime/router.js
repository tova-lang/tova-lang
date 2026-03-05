// Client-side router for Tova — class-based, signal-integrated, production-grade.
// Route changes are reactive: components that read route signals auto-update.

import { createSignal, tova_el, tova_fragment, createEffect, onCleanup } from './reactivity.js';

// ─── Active Router Instance ──────────────────────────────
let _activeRouter = null;

// ─── Path Validation ─────────────────────────────────────
function isValidPath(path) {
  if (typeof path !== 'string') return false;
  if (path.startsWith('//')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(path)) return false;
  return true;
}

// ─── Query String Helpers ────────────────────────────────
function parseQueryString(search) {
  const query = {};
  if (!search || search === '?') return query;
  const str = search.startsWith('?') ? search.slice(1) : search;
  for (const pair of str.split('&')) {
    const [key, ...rest] = pair.split('=');
    const value = rest.join('=');
    if (key) {
      const decodedKey = decodeURIComponent(key);
      const decodedValue = value !== undefined ? decodeURIComponent(value) : '';
      // Support repeated keys as arrays
      if (decodedKey in query) {
        if (Array.isArray(query[decodedKey])) {
          query[decodedKey].push(decodedValue);
        } else {
          query[decodedKey] = [query[decodedKey], decodedValue];
        }
      } else {
        query[decodedKey] = decodedValue;
      }
    }
  }
  return query;
}

function serializeQuery(query) {
  if (!query || typeof query !== 'object') return '';
  const parts = [];
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(v));
      }
    } else if (value === true) {
      parts.push(encodeURIComponent(key));
    } else if (value !== undefined && value !== null && value !== false) {
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}

// ─── Path → Regex Conversion ─────────────────────────────
function pathToRegex(path, prefixMatch) {
  // Split on dynamic segments (:param, :param?, *) and escape static parts
  const segments = path.split(/(:[\w]+\??|\*)/);
  let pattern = '';
  for (const segment of segments) {
    if (!segment) continue;
    if (segment === '*') {
      pattern += '(.*)';
    } else if (segment.startsWith(':')) {
      if (segment.endsWith('?')) {
        pattern += '([^/]*)?';
      } else {
        pattern += '([^/]+)';
      }
    } else {
      // Escape regex special chars in static path segments
      pattern += segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  if (prefixMatch) {
    return new RegExp('^' + pattern + '(?:/.*)?$');
  }
  return new RegExp('^' + pattern + '$');
}

function extractParams(routePath, match) {
  const params = {};
  if (!match) return params;
  const paramNames = (routePath.match(/:([a-zA-Z_]+)\??/g) || [])
    .map(p => p.replace(/^:/, '').replace(/\?$/, ''));
  for (let i = 0; i < paramNames.length; i++) {
    const val = match[i + 1];
    if (val !== undefined && val !== '') {
      params[paramNames[i]] = decodeURIComponent(val);
    }
  }
  // Handle catch-all wildcard
  if (routePath.includes('*') && match[paramNames.length + 1] !== undefined) {
    params['*'] = match[paramNames.length + 1];
  }
  return params;
}

// ─── Lazy Route Marker ───────────────────────────────────
export function lazy(importFn) {
  return { __lazy: true, load: importFn, _cached: null, _error: null };
}

// ─── TovRouter Class ─────────────────────────────────────
class TovRouter {
  constructor(config = {}) {
    // Config
    this.base = (config.base || '').replace(/\/$/, '');
    this.scrollBehavior = config.scroll || 'auto';
    this.loadingComponent = config.loading || null;
    this.errorComponent = config.error || null;

    // Signals
    const [routeSignal, setRouteSignal] = createSignal({
      path: '/',
      pattern: null,
      component: null,
      params: {},
      query: {},
      meta: {},
    });
    this._route = routeSignal;
    this._setRoute = setRouteSignal;

    const [childRoute, setChildRoute] = createSignal(null);
    this._childRoute = childRoute;
    this._setChildRoute = setChildRoute;

    const [isLoadingSignal, setIsLoadingSignal] = createSignal(false);
    this._isLoading = isLoadingSignal;
    this._setIsLoading = setIsLoadingSignal;

    // Route definitions
    this._routeDefinitions = [];
    this._notFoundComponent = null;

    // Hooks
    this._beforeHooks = [];
    this._afterHooks = [];
    this._onChangeCallbacks = [];

    // Scroll positions (keyed by history state key or path)
    this._scrollPositions = new Map();
    this._historyIndex = 0;

    // Redirect loop protection
    this._redirectCount = 0;
    this._redirectWindowStart = 0;

    // Bound handlers for cleanup
    this._popstateHandler = null;
    this._clickHandler = null;

    // Process routes if provided
    if (config.routes) {
      this._processRoutes(config.routes);
    }

    // Setup browser listeners
    this._setupBrowserListeners();

    // Register as active router
    _activeRouter = this;

    // Match initial route
    this._handleRouteChange();
  }

  // ─── Signal Getters (reactive) ───────────────────────────
  get path() { return () => this._route().path; }
  get params() { return () => this._route().params; }
  get query() { return () => this._route().query; }
  get meta() { return () => this._route().meta; }
  get route() { return this._route; }
  get loading() { return this._isLoading; }

  // ─── Navigation ──────────────────────────────────────────
  navigate(path, options = {}) {
    if (!isValidPath(path)) {
      if (typeof console !== 'undefined') {
        console.warn('Tova router: Blocked navigation to unsafe path: ' + path);
      }
      return;
    }

    // Parse path for query string
    let normalizedPath = path.startsWith('/') ? path : '/' + path;
    let queryString = '';

    // Extract query from path if present
    const qIdx = normalizedPath.indexOf('?');
    if (qIdx !== -1) {
      queryString = normalizedPath.slice(qIdx);
      normalizedPath = normalizedPath.slice(0, qIdx);
    }

    // Merge query option
    if (options.query) {
      const serialized = serializeQuery(options.query);
      queryString = serialized || queryString;
    }

    // Extract hash
    let hash = '';
    const hashIdx = normalizedPath.indexOf('#');
    if (hashIdx !== -1) {
      hash = normalizedPath.slice(hashIdx);
      normalizedPath = normalizedPath.slice(0, hashIdx);
    }

    // Run beforeNavigate hooks
    const from = this._route();
    const to = normalizedPath;
    for (const hook of this._beforeHooks) {
      const result = hook(from, to);
      if (result === false) return;
      if (typeof result === 'string' && isValidPath(result)) {
        // Redirect
        this._pushState(result, options);
        this._handleRouteChange();
        return;
      }
    }

    // Save scroll position before navigating
    this._saveScrollPosition();

    // Push or replace history state
    const fullUrl = this.base + normalizedPath + queryString + hash;
    const state = { __tova_idx: ++this._historyIndex, ...(options.state || {}) };

    if (typeof window !== 'undefined' && window.history) {
      if (options.replace) {
        window.history.replaceState(state, '', fullUrl);
      } else {
        window.history.pushState(state, '', fullUrl);
      }
    }

    this._handleRouteChange();

    // Restore or reset scroll
    if (!options.replace) {
      this._restoreScrollPosition(normalizedPath, false);
    }
  }

  back() {
    if (typeof window !== 'undefined' && window.history) {
      window.history.back();
    }
  }

  forward() {
    if (typeof window !== 'undefined' && window.history) {
      window.history.forward();
    }
  }

  // ─── Active State ────────────────────────────────────────
  isActive(path, exact = false) {
    return () => {
      const currentPath = this._route().path;
      if (exact) return currentPath === path;
      if (path === '/') return currentPath === '/';
      return currentPath === path || currentPath.startsWith(path + '/');
    };
  }

  // ─── Navigation Guards ───────────────────────────────────
  beforeNavigate(callback) {
    this._beforeHooks.push(callback);
    return () => {
      const idx = this._beforeHooks.indexOf(callback);
      if (idx !== -1) this._beforeHooks.splice(idx, 1);
    };
  }

  afterNavigate(callback) {
    this._afterHooks.push(callback);
    return () => {
      const idx = this._afterHooks.indexOf(callback);
      if (idx !== -1) this._afterHooks.splice(idx, 1);
    };
  }

  onRouteChange(callback) {
    this._onChangeCallbacks.push(callback);
    return () => {
      const idx = this._onChangeCallbacks.indexOf(callback);
      if (idx !== -1) this._onChangeCallbacks.splice(idx, 1);
    };
  }

  // ─── Cleanup ─────────────────────────────────────────────
  destroy() {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      if (this._popstateHandler) window.removeEventListener('popstate', this._popstateHandler);
      if (this._clickHandler && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
        document.removeEventListener('click', this._clickHandler);
      }
    }
    this._routeDefinitions = [];
    this._notFoundComponent = null;
    this._beforeHooks = [];
    this._afterHooks = [];
    this._onChangeCallbacks = [];
    this._scrollPositions.clear();
    if (_activeRouter === this) _activeRouter = null;
  }

  // ─── Route Processing ────────────────────────────────────
  _processRoutes(routeMap) {
    this._routeDefinitions = [];
    this._notFoundComponent = null;
    const entries = Object.entries(routeMap);
    for (const [path, value] of entries) {
      // Handle lazy routes
      const isLazy = value && value.__lazy;
      const isObjectConfig = typeof value === 'object' && value !== null && !isLazy;

      // Special 404 route
      if (path === '404' || path === '*') {
        const component = (isObjectConfig && value.component) ? value.component : value;
        this._notFoundComponent = component;
        if (path === '*') {
          this._routeDefinitions.push({
            path, pattern: /^(.*)$/, component, isCatchAll: true,
            children: null, meta: (isObjectConfig && value.meta) || {},
          });
        }
        continue;
      }

      if (isObjectConfig && value.component) {
        // Nested or metadata route
        const meta = value.meta || {};
        const parentDef = {
          path,
          pattern: pathToRegex(path, !!value.children),
          component: value.component,
          isCatchAll: false,
          children: [],
          meta,
        };
        if (value.children) {
          for (const [childPath, childValue] of Object.entries(value.children)) {
            const fullPath = childPath === '/' ? path : path + childPath;
            const childIsLazy = childValue && childValue.__lazy;
            const childIsObj = typeof childValue === 'object' && childValue !== null && !childIsLazy;
            parentDef.children.push({
              path: fullPath,
              relativePath: childPath,
              pattern: pathToRegex(fullPath),
              component: childIsObj ? childValue.component : childValue,
              isCatchAll: false,
              children: null,
              meta: (childIsObj && childValue.meta) || {},
            });
          }
        }
        this._routeDefinitions.push(parentDef);
      } else {
        // Simple route or lazy route
        this._routeDefinitions.push({
          path,
          pattern: pathToRegex(path),
          component: value,
          isCatchAll: false,
          children: null,
          meta: {},
        });
      }
    }
  }

  // ─── Route Matching ──────────────────────────────────────
  _matchRoute(path) {
    for (const def of this._routeDefinitions) {
      if (def.children && def.children.length > 0) {
        for (const child of def.children) {
          const childMatch = child.pattern.exec(path);
          if (childMatch) {
            const childParams = extractParams(child.path, childMatch);
            this._setChildRoute({ component: child.component, params: childParams, meta: child.meta });
            const parentMatch = def.pattern.exec(path);
            const parentParams = extractParams(def.path, parentMatch || []);
            return {
              path: def.path,
              component: def.component,
              params: { ...parentParams, ...childParams },
              meta: { ...def.meta, ...child.meta },
            };
          }
        }
        const parentMatch = def.pattern.exec(path);
        if (parentMatch) {
          this._setChildRoute(null);
          const params = extractParams(def.path, parentMatch);
          return { path: def.path, component: def.component, params, meta: def.meta };
        }
      } else {
        const match = def.pattern.exec(path);
        if (match) {
          this._setChildRoute(null);
          const params = extractParams(def.path, match);
          return { path: def.path, component: def.component, params, meta: def.meta };
        }
      }
    }
    this._setChildRoute(null);
    return null;
  }

  // ─── Route Change Handler ────────────────────────────────
  _handleRouteChange() {
    let path = '/';
    let query = {};
    if (typeof window !== 'undefined' && window.location) {
      path = window.location.pathname;
      query = parseQueryString(window.location.search);
      // Strip base prefix
      if (this.base && path.startsWith(this.base)) {
        path = path.slice(this.base.length) || '/';
      }
    }

    const matched = this._matchRoute(path);

    if (matched) {
      // Handle lazy routes
      if (matched.component && matched.component.__lazy) {
        this._loadLazyRoute(matched, query);
        return;
      }
      this._setRoute({ ...matched, query });
    } else if (this._notFoundComponent) {
      this._setRoute({ path, pattern: null, component: this._notFoundComponent, params: {}, query, meta: {} });
    } else {
      this._setRoute({ path, pattern: null, component: null, params: {}, query, meta: {} });
    }

    // Fire callbacks
    for (const cb of this._onChangeCallbacks) {
      cb(matched);
    }

    // Run afterNavigate hooks
    const currentRoute = this._route();
    for (const hook of this._afterHooks) {
      hook(currentRoute);
    }
  }

  // ─── Lazy Loading ────────────────────────────────────────
  _loadLazyRoute(matched, query) {
    const lazyDef = matched.component;

    // If already cached, use it
    if (lazyDef._cached) {
      this._setRoute({ ...matched, component: lazyDef._cached, query });
      this._firePostNavigateHooks(matched);
      return;
    }

    // Show loading state
    this._setIsLoading(true);
    if (this.loadingComponent) {
      this._setRoute({ ...matched, component: this.loadingComponent, query });
    }

    const loadPromise = lazyDef.load();
    loadPromise.then((module) => {
      const component = module.default || module.Page || module;
      lazyDef._cached = component;
      this._setIsLoading(false);
      this._setRoute({ ...matched, component, query });
      this._firePostNavigateHooks(matched);
    }).catch((err) => {
      lazyDef._error = err;
      this._setIsLoading(false);
      if (this.errorComponent) {
        this._setRoute({ ...matched, component: this.errorComponent, query });
      } else {
        if (typeof console !== 'undefined') {
          console.error('Tova router: Failed to load lazy route:', err);
        }
        this._setRoute({ ...matched, component: null, query });
      }
      this._firePostNavigateHooks(matched);
    });
  }

  _firePostNavigateHooks(matched) {
    for (const cb of this._onChangeCallbacks) {
      cb(matched);
    }
    const currentRoute = this._route();
    for (const hook of this._afterHooks) {
      hook(currentRoute);
    }
  }

  // ─── Scroll Restoration ──────────────────────────────────
  _saveScrollPosition() {
    if (typeof window === 'undefined' || !window.location) return;
    const key = window.location.pathname + window.location.search;
    this._scrollPositions.set(key, { x: window.scrollX, y: window.scrollY });
    // Cap stored positions to prevent memory leak
    if (this._scrollPositions.size > 200) {
      const firstKey = this._scrollPositions.keys().next().value;
      this._scrollPositions.delete(firstKey);
    }
  }

  _restoreScrollPosition(path, isBack) {
    if (typeof window === 'undefined') return;
    if (this.scrollBehavior === 'none') return;

    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => fn();
    const scrollTo = typeof window.scrollTo === 'function' ? (x, y) => window.scrollTo(x, y) : () => {};

    if (typeof this.scrollBehavior === 'function') {
      const saved = this._scrollPositions.get(path) || null;
      const result = this.scrollBehavior({ savedPosition: saved, to: path });
      if (result) {
        raf(() => scrollTo(result.x || 0, result.y || 0));
      }
      return;
    }

    // Default "auto" behavior
    if (isBack) {
      const saved = this._scrollPositions.get(path);
      if (saved) {
        raf(() => scrollTo(saved.x, saved.y));
        return;
      }
    }
    // New navigation: scroll to top
    raf(() => scrollTo(0, 0));
  }

  // ─── Browser Listeners ───────────────────────────────────
  _setupBrowserListeners() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    this._popstateHandler = () => {
      const from = this._route();
      const toPath = window.location.pathname;

      for (const hook of this._beforeHooks) {
        const result = hook(from, toPath);
        if (result === false) {
          // Cancel: restore the previous URL without triggering another popstate
          window.history.pushState({}, '', this.base + from.path);
          return;
        }
      }

      this._handleRouteChange();
      // Restore scroll on back/forward
      let path = toPath;
      if (this.base && path.startsWith(this.base)) {
        path = path.slice(this.base.length) || '/';
      }
      this._restoreScrollPosition(path, true);
    };
    window.addEventListener('popstate', this._popstateHandler);

    this._clickHandler = (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      if (!link.href.startsWith(window.location.origin)) return;
      if (link.target === '_blank') return;
      if (typeof link.hasAttribute === 'function' && link.hasAttribute('download')) return;
      if (typeof link.getAttribute === 'function') {
        const rel = link.getAttribute('rel');
        if (rel && rel.includes('external')) return;
      }
      // Skip if meta/ctrl/shift click (open in new tab)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      e.preventDefault();
      try {
        const url = new URL(link.href);
        let navPath = url.pathname;
        // Strip base prefix for internal navigation
        if (this.base && navPath.startsWith(this.base)) {
          navPath = navPath.slice(this.base.length) || '/';
        }
        this.navigate(navPath + (url.search || '') + (url.hash || ''));
      } catch (_) {
        const href = typeof link.getAttribute === 'function' ? link.getAttribute('href') : link.href;
        if (href && isValidPath(href)) this.navigate(href);
      }
    };
    document.addEventListener('click', this._clickHandler);
  }

  // ─── History State Helper ────────────────────────────────
  _pushState(path, options = {}) {
    if (typeof window === 'undefined' || !window.history) return;
    const fullUrl = this.base + (path.startsWith('/') ? path : '/' + path);
    const state = { __tova_idx: ++this._historyIndex, ...(options.state || {}) };
    if (options.replace) {
      window.history.replaceState(state, '', fullUrl);
    } else {
      window.history.pushState(state, '', fullUrl);
    }
  }
}

// ─── createRouter Factory ────────────────────────────────
export function createRouter(config) {
  // Destroy previous router if exists
  if (_activeRouter) {
    _activeRouter.destroy();
  }
  return new TovRouter(config);
}

// ─── resetRouter (for testing) ───────────────────────────
export function resetRouter() {
  if (_activeRouter) {
    _activeRouter.destroy();
  }
  _activeRouter = null;
}

// ─── Router Component ────────────────────────────────────
export function Router() {
  return {
    __tova: true,
    tag: '__dynamic',
    compute: () => {
      const router = _activeRouter;
      if (!router) return null;
      const r = router._route();
      if (r && r.component) {
        return typeof r.component === 'function' ? r.component(r.params) : r.component;
      }
      return null;
    },
    props: {},
    children: [],
  };
}

// ─── Outlet Component ────────────────────────────────────
export function Outlet() {
  const router = _activeRouter;
  if (!router) return null;
  const child = router._childRoute();
  if (child && child.component) {
    const comp = child.component;
    const params = child.params || {};
    return typeof comp === 'function' ? comp(params) : comp;
  }
  return null;
}

// ─── Link Component ──────────────────────────────────────
export function Link({ href, children, activeClass, exactActiveClass, ...rest }) {
  const router = _activeRouter;
  const baseHref = router ? router.base + href : href;

  const props = {
    href: baseHref,
    onClick: (e) => {
      e.preventDefault();
      if (router) {
        router.navigate(href);
      }
    },
    ...rest,
  };

  // Active class computation — returns a function for reactive binding
  if ((activeClass || exactActiveClass) && router) {
    const baseClass = rest.class || '';
    props.class = () => {
      const currentPath = router._route().path;
      const isExact = currentPath === href;
      const isPrefix = href === '/' ? isExact : (currentPath === href || currentPath.startsWith(href + '/'));
      let cls = baseClass;
      if (exactActiveClass && isExact) {
        cls = cls ? cls + ' ' + exactActiveClass : exactActiveClass;
      } else if (activeClass && isPrefix) {
        cls = cls ? cls + ' ' + activeClass : activeClass;
      }
      return cls;
    };
  }

  return tova_el('a', props, children || []);
}

// ─── Redirect Component ──────────────────────────────────
const _MAX_REDIRECTS = 10;
const _REDIRECT_WINDOW_MS = 1000;

export function Redirect({ to }) {
  if (typeof window !== 'undefined') {
    queueMicrotask(() => {
      const router = _activeRouter;
      if (!router) return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - router._redirectWindowStart > _REDIRECT_WINDOW_MS) {
        router._redirectCount = 0;
        router._redirectWindowStart = now;
      }
      router._redirectCount++;
      if (router._redirectCount > _MAX_REDIRECTS) {
        console.error('Tova router: Redirect loop detected (>' + _MAX_REDIRECTS + ' redirects in ' + _REDIRECT_WINDOW_MS + 'ms). Aborting redirect to "' + to + '".');
        return;
      }
      router.navigate(to);
    });
  }
  return null;
}

// ─── Backward-Compatible Module-Level API ────────────────
// These functions delegate to the active router instance.
// Existing code using defineRoutes/navigate/getPath/etc. continues working.

export function defineRoutes(routeMap) {
  createRouter({ routes: routeMap });
}

export function navigate(path, options) {
  if (_activeRouter) {
    _activeRouter.navigate(path, options);
  } else {
    // Auto-create a router if none exists
    createRouter({});
    _activeRouter.navigate(path, options);
  }
}

export function getCurrentRoute() {
  if (!_activeRouter) return () => ({ path: '/', params: {}, query: {}, meta: {} });
  return _activeRouter._route;
}

export function getParams() {
  return () => {
    if (!_activeRouter) return {};
    return _activeRouter._route().params;
  };
}

export function getPath() {
  return () => {
    if (!_activeRouter) return '/';
    return _activeRouter._route().path;
  };
}

export function getQuery() {
  return () => {
    if (!_activeRouter) return {};
    return _activeRouter._route().query;
  };
}

export function getMeta() {
  return () => {
    if (!_activeRouter) return {};
    return _activeRouter._route().meta;
  };
}

export function onRouteChange(callback) {
  if (_activeRouter) return _activeRouter.onRouteChange(callback);
  return () => {};
}

export function beforeNavigate(callback) {
  if (_activeRouter) return _activeRouter.beforeNavigate(callback);
  return () => {};
}

export function afterNavigate(callback) {
  if (_activeRouter) return _activeRouter.afterNavigate(callback);
  return () => {};
}

// ─── Utility Exports ─────────────────────────────────────
export function getRouter() {
  return _activeRouter;
}
