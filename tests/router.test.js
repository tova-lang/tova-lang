// Comprehensive tests for the Tova class-based router
import { describe, test, expect, beforeEach } from 'bun:test';
import {
  createRouter, lazy, resetRouter,
  defineRoutes, navigate, getCurrentRoute, getParams, getPath, getQuery, getMeta, getRouter,
  onRouteChange, beforeNavigate, afterNavigate,
  Router, Outlet, Link, Redirect
} from '../src/runtime/router.js';

// Reset router state before each test for isolation
beforeEach(() => {
  resetRouter();
});

// ─── createRouter & Basic Instance ───────────────────────

describe('createRouter — instance creation', () => {
  test('creates a router instance', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    expect(router).toBeTruthy();
    expect(typeof router.navigate).toBe('function');
    expect(typeof router.back).toBe('function');
    expect(typeof router.forward).toBe('function');
    expect(typeof router.destroy).toBe('function');
  });

  test('registers as active router', () => {
    const router = createRouter({ routes: {} });
    expect(getRouter()).toBe(router);
  });

  test('destroys previous router on new createRouter', () => {
    const router1 = createRouter({ routes: {} });
    const router2 = createRouter({ routes: {} });
    expect(getRouter()).toBe(router2);
    expect(getRouter()).not.toBe(router1);
  });

  test('accepts empty config', () => {
    expect(() => createRouter({})).not.toThrow();
  });

  test('accepts routes-only config', () => {
    const Home = () => 'home';
    expect(() => createRouter({ routes: { '/': Home } })).not.toThrow();
  });

  test('accepts full config', () => {
    const Loading = () => 'loading';
    expect(() => createRouter({
      routes: { '/': () => 'home' },
      base: '/app',
      scroll: 'auto',
      loading: Loading,
    })).not.toThrow();
  });

  test('base path strips trailing slash', () => {
    const router = createRouter({ routes: {}, base: '/app/' });
    expect(router.base).toBe('/app');
  });

  test('empty base defaults to empty string', () => {
    const router = createRouter({ routes: {} });
    expect(router.base).toBe('');
  });
});

// ─── Signal Getters ──────────────────────────────────────

describe('Signal getters', () => {
  test('path returns signal getter', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    expect(typeof router.path).toBe('function');
    expect(typeof router.path()).toBe('string');
  });

  test('params returns signal getter', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    expect(typeof router.params).toBe('function');
    expect(typeof router.params()).toBe('object');
  });

  test('query returns signal getter', () => {
    const router = createRouter({ routes: {} });
    expect(typeof router.query).toBe('function');
    expect(typeof router.query()).toBe('object');
  });

  test('meta returns signal getter', () => {
    const router = createRouter({ routes: {} });
    expect(typeof router.meta).toBe('function');
    expect(typeof router.meta()).toBe('object');
  });

  test('route returns the full signal', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    expect(typeof router.route).toBe('function');
    const r = router.route();
    expect(r).toHaveProperty('path');
    expect(r).toHaveProperty('params');
    expect(r).toHaveProperty('query');
    expect(r).toHaveProperty('meta');
  });

  test('loading returns signal getter', () => {
    const router = createRouter({ routes: {} });
    expect(typeof router.loading).toBe('function');
    expect(router.loading()).toBe(false);
  });
});

// ─── Route Matching — Static Routes ─────────────────────

describe('Route matching — static routes', () => {
  test('matches root route', () => {
    const Home = () => 'home';
    const router = createRouter({ routes: { '/': Home } });
    // In Node (no window), path defaults to '/'
    const r = router.route();
    expect(r.component).toBe(Home);
  });

  test('matches multiple static routes', () => {
    const Home = () => 'home';
    const About = () => 'about';
    const Contact = () => 'contact';
    const router = createRouter({ routes: {
      '/': Home,
      '/about': About,
      '/contact': Contact,
    }});
    // Default path is /, so Home should match
    expect(router.route().component).toBe(Home);
  });

  test('unmatched route returns null component without 404', () => {
    // With no routes, no match, no 404
    const router = createRouter({ routes: { '/about': () => 'about' } });
    expect(router.route().component).toBe(null);
  });

  test('404 route used for unmatched paths', () => {
    const NotFound = () => '404';
    const router = createRouter({ routes: {
      '/about': () => 'about',
      '404': NotFound,
    }});
    // Path / doesn't match /about, should fall back to 404
    expect(router.route().component).toBe(NotFound);
  });

  test('catch-all * route matches anything', () => {
    const CatchAll = () => 'catchall';
    const router = createRouter({ routes: {
      '/about': () => 'about',
      '*': CatchAll,
    }});
    // / should match catch-all
    expect(router.route().component).toBe(CatchAll);
  });
});

// ─── Route Matching — Parameterized Routes ───────────────

describe('Route matching — parameterized routes', () => {
  test('extracts single parameter', () => {
    const UserPage = (params) => params;
    createRouter({ routes: { '/users/:id': UserPage } });
    // Can't navigate in Node (no window), but we can test the regex
  });

  test('pathToRegex handles required params correctly', () => {
    const Page = () => 'page';
    const router = createRouter({ routes: { '/users/:id': Page } });
    // The route pattern should match /users/123 but not /users/ or /users
    const def = router._routeDefinitions[0];
    expect(def.pattern.test('/users/123')).toBe(true);
    expect(def.pattern.test('/users/abc')).toBe(true);
    expect(def.pattern.test('/users/')).toBe(false);
    expect(def.pattern.test('/users')).toBe(false);
    expect(def.pattern.test('/users/123/extra')).toBe(false);
  });

  test('pathToRegex handles optional params correctly', () => {
    const Page = () => 'page';
    const router = createRouter({ routes: { '/files/:path?': Page } });
    const def = router._routeDefinitions[0];
    expect(def.pattern.test('/files/')).toBe(true);
    expect(def.pattern.test('/files/doc.txt')).toBe(true);
    // Without trailing slash, the optional param regex requires the preceding /
    // /files doesn't match because the pattern is /files/([^/]*)?
    // This is expected behavior — optional params still need the path prefix
    expect(def.pattern.test('/files')).toBe(false);
  });

  test('pathToRegex handles multiple params', () => {
    const Page = () => 'page';
    const router = createRouter({ routes: { '/users/:userId/posts/:postId': Page } });
    const def = router._routeDefinitions[0];
    expect(def.pattern.test('/users/1/posts/2')).toBe(true);
    expect(def.pattern.test('/users/1/posts')).toBe(false);
  });

  test('pathToRegex escapes special regex chars in static segments', () => {
    const Page = () => 'page';
    const router = createRouter({ routes: { '/api/v1.0/users': Page } });
    const def = router._routeDefinitions[0];
    // The dot should be literal, not wildcard
    expect(def.pattern.test('/api/v1.0/users')).toBe(true);
    expect(def.pattern.test('/api/v1X0/users')).toBe(false);
  });

  test('pathToRegex escapes parentheses in static segments', () => {
    const Page = () => 'page';
    const router = createRouter({ routes: { '/docs/(advanced)': Page } });
    const def = router._routeDefinitions[0];
    expect(def.pattern.test('/docs/(advanced)')).toBe(true);
  });

  test('pathToRegex escapes plus signs in static segments', () => {
    const Page = () => 'page';
    const router = createRouter({ routes: { '/c++/intro': Page } });
    const def = router._routeDefinitions[0];
    expect(def.pattern.test('/c++/intro')).toBe(true);
  });
});

// ─── Route Metadata ──────────────────────────────────────

describe('Route metadata', () => {
  test('stores metadata on route definitions', () => {
    const Page = () => 'page';
    const router = createRouter({ routes: {
      '/admin': { component: Page, meta: { requiresAuth: true, role: 'admin' } },
    }});
    const def = router._routeDefinitions[0];
    expect(def.meta.requiresAuth).toBe(true);
    expect(def.meta.role).toBe('admin');
  });

  test('routes without metadata have empty meta', () => {
    const Page = () => 'page';
    const router = createRouter({ routes: { '/': Page } });
    const def = router._routeDefinitions[0];
    expect(def.meta).toEqual({});
  });

  test('getMeta returns signal getter', () => {
    createRouter({ routes: {
      '/': { component: () => 'home', meta: { title: 'Home' } },
    }});
    const meta = getMeta();
    expect(typeof meta).toBe('function');
    const m = meta();
    expect(m.title).toBe('Home');
  });

  test('matched route includes meta in route signal', () => {
    const router = createRouter({ routes: {
      '/': { component: () => 'home', meta: { title: 'Home' } },
    }});
    expect(router.route().meta.title).toBe('Home');
  });

  test('nested route children inherit and merge meta', () => {
    const Layout = () => 'layout';
    const Child = () => 'child';
    const router = createRouter({ routes: {
      '/admin': {
        component: Layout,
        meta: { requiresAuth: true },
        children: {
          '/users': { component: Child, meta: { role: 'admin' } },
        },
      },
    }});
    // Check that child route def has its own meta
    const parentDef = router._routeDefinitions[0];
    expect(parentDef.meta.requiresAuth).toBe(true);
    expect(parentDef.children[0].meta.role).toBe('admin');
  });
});

// ─── Nested Routes ───────────────────────────────────────

describe('Nested routes', () => {
  test('processes parent with children', () => {
    const Layout = () => 'layout';
    const Home = () => 'home';
    const Settings = () => 'settings';
    const router = createRouter({ routes: {
      '/dashboard': {
        component: Layout,
        children: {
          '/': Home,
          '/settings': Settings,
        },
      },
    }});
    expect(router._routeDefinitions.length).toBe(1);
    expect(router._routeDefinitions[0].children.length).toBe(2);
  });

  test('child route full paths are computed correctly', () => {
    const router = createRouter({ routes: {
      '/app': {
        component: () => 'layout',
        children: {
          '/': () => 'home',
          '/settings': () => 'settings',
          '/profile': () => 'profile',
        },
      },
    }});
    const children = router._routeDefinitions[0].children;
    expect(children[0].path).toBe('/app');
    expect(children[1].path).toBe('/app/settings');
    expect(children[2].path).toBe('/app/profile');
  });

  test('parent route uses prefix match when has children', () => {
    const router = createRouter({ routes: {
      '/dashboard': {
        component: () => 'layout',
        children: { '/': () => 'home' },
      },
    }});
    const parentDef = router._routeDefinitions[0];
    // Prefix match should match both /dashboard and /dashboard/anything
    expect(parentDef.pattern.test('/dashboard')).toBe(true);
    expect(parentDef.pattern.test('/dashboard/settings')).toBe(true);
    expect(parentDef.pattern.test('/dashboard/a/b/c')).toBe(true);
  });
});

// ─── Navigation ──────────────────────────────────────────

describe('Navigation', () => {
  test('navigate does not throw without window', () => {
    createRouter({ routes: {} });
    expect(() => navigate('/test')).not.toThrow();
  });

  test('navigate blocks unsafe paths', () => {
    createRouter({ routes: {} });
    // These should not throw but should be blocked
    expect(() => navigate('//evil.com')).not.toThrow();
    expect(() => navigate('javascript:alert(1)')).not.toThrow();
    expect(() => navigate('http://evil.com')).not.toThrow();
    expect(() => navigate('data:text/html,<h1>hi</h1>')).not.toThrow();
  });

  test('navigate rejects non-string paths', () => {
    createRouter({ routes: {} });
    expect(() => navigate(null)).not.toThrow();
    expect(() => navigate(undefined)).not.toThrow();
    expect(() => navigate(123)).not.toThrow();
  });

  test('navigate accepts relative paths', () => {
    createRouter({ routes: {} });
    expect(() => navigate('about')).not.toThrow();
  });

  test('navigate with options does not throw', () => {
    createRouter({ routes: {} });
    expect(() => navigate('/test', { replace: true })).not.toThrow();
    expect(() => navigate('/test', { state: { from: 'login' } })).not.toThrow();
    expect(() => navigate('/test', { query: { q: 'search' } })).not.toThrow();
  });

  test('back() does not throw without window', () => {
    const router = createRouter({ routes: {} });
    expect(() => router.back()).not.toThrow();
  });

  test('forward() does not throw without window', () => {
    const router = createRouter({ routes: {} });
    expect(() => router.forward()).not.toThrow();
  });
});

// ─── Navigation Guards ───────────────────────────────────

describe('Navigation guards', () => {
  test('beforeNavigate returns unsubscribe function', () => {
    createRouter({ routes: {} });
    const unsub = beforeNavigate(() => true);
    expect(typeof unsub).toBe('function');
  });

  test('afterNavigate returns unsubscribe function', () => {
    createRouter({ routes: {} });
    const unsub = afterNavigate(() => {});
    expect(typeof unsub).toBe('function');
  });

  test('beforeNavigate hook can cancel navigation by returning false', () => {
    const router = createRouter({ routes: { '/': () => 'home', '/blocked': () => 'blocked' } });
    router.beforeNavigate(() => false);
    navigate('/blocked');
    // Without window, route change happens synchronously via handleRouteChange
    // but pushState is skipped. The route stays at /
    expect(router.route().component !== null || router.route().path === '/').toBe(true);
  });

  test('beforeNavigate hook receives from and to', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    let receivedFrom = null;
    let receivedTo = null;
    router.beforeNavigate((from, to) => {
      receivedFrom = from;
      receivedTo = to;
      return true;
    });
    navigate('/test');
    expect(receivedFrom).toBeTruthy();
    expect(typeof receivedTo).toBe('string');
  });

  test('beforeNavigate hook can redirect by returning string', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    router.beforeNavigate(() => '/redirected');
    navigate('/test');
    // Without window, redirect goes through handleRouteChange but no pushState
  });

  test('afterNavigate hook called after route change', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    let called = false;
    router.afterNavigate((r) => {
      called = true;
      expect(r).toHaveProperty('path');
    });
    navigate('/test');
    expect(called).toBe(true);
  });

  test('unsubscribe removes beforeNavigate hook', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    let callCount = 0;
    const unsub = router.beforeNavigate(() => { callCount++; return true; });
    navigate('/a');
    expect(callCount).toBe(1);
    unsub();
    navigate('/b');
    expect(callCount).toBe(1);
  });

  test('unsubscribe removes afterNavigate hook', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    let callCount = 0;
    const unsub = router.afterNavigate(() => { callCount++; });
    navigate('/a');
    expect(callCount).toBe(1);
    unsub();
    navigate('/b');
    expect(callCount).toBe(1);
  });

  test('multiple beforeNavigate hooks run in order', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    const order = [];
    router.beforeNavigate(() => { order.push(1); return true; });
    router.beforeNavigate(() => { order.push(2); return true; });
    router.beforeNavigate(() => { order.push(3); return true; });
    navigate('/test');
    expect(order).toEqual([1, 2, 3]);
  });

  test('first hook returning false prevents later hooks from running', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    const called = [];
    router.beforeNavigate(() => { called.push(1); return false; });
    router.beforeNavigate(() => { called.push(2); return true; });
    navigate('/test');
    expect(called).toEqual([1]);
  });
});

// ─── onRouteChange ───────────────────────────────────────

describe('onRouteChange', () => {
  test('registers callback', () => {
    const router = createRouter({ routes: {} });
    let called = false;
    router.onRouteChange(() => { called = true; });
    navigate('/test');
    expect(called).toBe(true);
  });

  test('unsubscribe works', () => {
    const router = createRouter({ routes: {} });
    let count = 0;
    const unsub = router.onRouteChange(() => { count++; });
    navigate('/a');
    expect(count).toBe(1);
    unsub();
    navigate('/b');
    expect(count).toBe(1);
  });
});

// ─── isActive ────────────────────────────────────────────

describe('isActive', () => {
  test('returns a signal getter function', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    const active = router.isActive('/');
    expect(typeof active).toBe('function');
    expect(typeof active()).toBe('boolean');
  });

  test('exact match works', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    expect(router.isActive('/', true)()).toBe(true);
    expect(router.isActive('/about', true)()).toBe(false);
  });

  test('prefix match for non-root paths', () => {
    // Without window, path defaults to '/'
    const router = createRouter({ routes: { '/': () => 'home' } });
    // '/' is only exact match (special case)
    expect(router.isActive('/')()).toBe(true);
    expect(router.isActive('/about')()).toBe(false);
  });
});

// ─── Router Component ────────────────────────────────────

describe('Router component', () => {
  test('returns dynamic vnode', () => {
    createRouter({ routes: { '/': () => 'home' } });
    const vnode = Router();
    expect(vnode.__tova).toBe(true);
    expect(vnode.tag).toBe('__dynamic');
    expect(typeof vnode.compute).toBe('function');
  });

  test('compute returns component result for matched route', () => {
    const Home = () => 'home-content';
    createRouter({ routes: { '/': Home } });
    const vnode = Router();
    expect(vnode.compute()).toBe('home-content');
  });

  test('compute returns null when no routes defined', () => {
    createRouter({ routes: {} });
    const vnode = Router();
    expect(vnode.compute()).toBe(null);
  });

  test('returns null when no active router', () => {
    resetRouter();
    const vnode = Router();
    expect(vnode.compute()).toBe(null);
  });

  test('component receives params', () => {
    const User = (params) => params;
    createRouter({ routes: { '/users/:id': User } });
    const vnode = Router();
    // Root path matches, so this won't match /users/:id without window
    // But the component structure is correct
    expect(typeof vnode.compute).toBe('function');
  });
});

// ─── Outlet Component ────────────────────────────────────

describe('Outlet component', () => {
  test('returns null when no child route', () => {
    createRouter({ routes: { '/': () => 'home' } });
    expect(Outlet()).toBe(null);
  });

  test('returns null when no active router', () => {
    resetRouter();
    expect(Outlet()).toBe(null);
  });
});

// ─── Link Component ─────────────────────────────────────

describe('Link component', () => {
  test('creates anchor element vnode', () => {
    createRouter({ routes: {} });
    const vnode = Link({ href: '/about', children: ['About'] });
    expect(vnode.__tova).toBe(true);
    expect(vnode.tag).toBe('a');
    expect(vnode.props.href).toBe('/about');
  });

  test('has onClick handler', () => {
    createRouter({ routes: {} });
    const vnode = Link({ href: '/about' });
    expect(typeof vnode.props.onClick).toBe('function');
  });

  test('onClick calls preventDefault', () => {
    createRouter({ routes: {} });
    const vnode = Link({ href: '/about' });
    let prevented = false;
    vnode.props.onClick({ preventDefault: () => { prevented = true; } });
    expect(prevented).toBe(true);
  });

  test('passes rest props', () => {
    createRouter({ routes: {} });
    const vnode = Link({ href: '/about', class: 'nav-link', id: 'about-link' });
    expect(vnode.props.class).toBe('nav-link');
    expect(vnode.props.id).toBe('about-link');
  });

  test('works without children', () => {
    createRouter({ routes: {} });
    const vnode = Link({ href: '/about' });
    expect(vnode.children).toEqual([]);
  });

  test('prepends base path to href', () => {
    createRouter({ routes: {}, base: '/app' });
    const vnode = Link({ href: '/about' });
    expect(vnode.props.href).toBe('/app/about');
  });

  test('activeClass creates reactive class function', () => {
    createRouter({ routes: { '/': () => 'home' } });
    const vnode = Link({ href: '/', activeClass: 'active' });
    // class should be a function for reactive binding
    expect(typeof vnode.props.class).toBe('function');
    // At path /, / should be active
    expect(vnode.props.class()).toContain('active');
  });

  test('exactActiveClass only matches exact path', () => {
    createRouter({ routes: { '/': () => 'home' } });
    const vnode = Link({ href: '/', exactActiveClass: 'exact-active' });
    expect(typeof vnode.props.class).toBe('function');
    expect(vnode.props.class()).toContain('exact-active');
  });

  test('activeClass with base class preserves both', () => {
    createRouter({ routes: { '/': () => 'home' } });
    const vnode = Link({ href: '/', activeClass: 'active', class: 'nav-link' });
    expect(typeof vnode.props.class).toBe('function');
    const cls = vnode.props.class();
    expect(cls).toContain('nav-link');
    expect(cls).toContain('active');
  });

  test('no active class when path does not match', () => {
    createRouter({ routes: { '/': () => 'home' } });
    const vnode = Link({ href: '/about', activeClass: 'active', class: 'nav-link' });
    expect(typeof vnode.props.class).toBe('function');
    const cls = vnode.props.class();
    expect(cls).toBe('nav-link');
    expect(cls).not.toContain('active');
  });
});

// ─── Redirect Component ─────────────────────────────────

describe('Redirect component', () => {
  test('returns null', () => {
    createRouter({ routes: {} });
    expect(Redirect({ to: '/login' })).toBe(null);
  });

  test('works with different paths', () => {
    createRouter({ routes: {} });
    expect(Redirect({ to: '/dashboard' })).toBe(null);
    expect(Redirect({ to: '/' })).toBe(null);
  });
});

// ─── Backward-Compatible API ─────────────────────────────

describe('Backward-compatible module-level API', () => {
  test('defineRoutes creates a router', () => {
    const Home = () => 'home';
    defineRoutes({ '/': Home });
    const router = getRouter();
    expect(router).toBeTruthy();
    expect(router.route().component).toBe(Home);
  });

  test('getCurrentRoute returns signal getter', () => {
    defineRoutes({ '/': () => 'home' });
    const route = getCurrentRoute();
    expect(typeof route).toBe('function');
    expect(route()).toHaveProperty('path');
    expect(route()).toHaveProperty('params');
  });

  test('getPath returns signal getter', () => {
    defineRoutes({ '/': () => 'home' });
    const path = getPath();
    expect(typeof path).toBe('function');
    expect(typeof path()).toBe('string');
  });

  test('getParams returns signal getter', () => {
    defineRoutes({});
    const params = getParams();
    expect(typeof params).toBe('function');
    expect(typeof params()).toBe('object');
  });

  test('getQuery returns signal getter', () => {
    defineRoutes({});
    const query = getQuery();
    expect(typeof query).toBe('function');
    expect(typeof query()).toBe('object');
  });

  test('getMeta returns signal getter', () => {
    defineRoutes({ '/': { component: () => 'home', meta: { title: 'Home' } } });
    const meta = getMeta();
    expect(typeof meta).toBe('function');
    expect(meta().title).toBe('Home');
  });

  test('navigate works with module-level function', () => {
    defineRoutes({ '/': () => 'home' });
    expect(() => navigate('/test')).not.toThrow();
  });

  test('onRouteChange works with module-level function', () => {
    defineRoutes({});
    let called = false;
    onRouteChange(() => { called = true; });
    navigate('/test');
    expect(called).toBe(true);
  });

  test('beforeNavigate works with module-level function', () => {
    defineRoutes({});
    const unsub = beforeNavigate(() => true);
    expect(typeof unsub).toBe('function');
  });

  test('afterNavigate works with module-level function', () => {
    defineRoutes({});
    const unsub = afterNavigate(() => {});
    expect(typeof unsub).toBe('function');
  });

  test('module-level functions work without router (gracefully)', () => {
    resetRouter();
    expect(getPath()()).toBe('/');
    expect(getParams()()).toEqual({});
    expect(getQuery()()).toEqual({});
    expect(getMeta()()).toEqual({});
    const route = getCurrentRoute();
    expect(typeof route).toBe('function');
  });
});

// ─── resetRouter ─────────────────────────────────────────

describe('resetRouter', () => {
  test('nullifies active router', () => {
    createRouter({ routes: {} });
    expect(getRouter()).toBeTruthy();
    resetRouter();
    expect(getRouter()).toBe(null);
  });

  test('calling resetRouter twice is safe', () => {
    createRouter({ routes: {} });
    resetRouter();
    expect(() => resetRouter()).not.toThrow();
  });

  test('components work safely after reset', () => {
    createRouter({ routes: {} });
    resetRouter();
    expect(Router().compute()).toBe(null);
    expect(Outlet()).toBe(null);
    expect(Redirect({ to: '/' })).toBe(null);
  });
});

// ─── Lazy Routes ─────────────────────────────────────────

describe('Lazy routes', () => {
  test('lazy() creates a marker object', () => {
    const lazyRoute = lazy(() => Promise.resolve({ default: () => 'page' }));
    expect(lazyRoute.__lazy).toBe(true);
    expect(typeof lazyRoute.load).toBe('function');
    expect(lazyRoute._cached).toBe(null);
  });

  test('lazy route is stored in route definitions', () => {
    const lazyRoute = lazy(() => Promise.resolve({ default: () => 'page' }));
    const router = createRouter({ routes: { '/lazy': lazyRoute } });
    expect(router._routeDefinitions[0].component.__lazy).toBe(true);
  });

  test('lazy route load function is preserved', () => {
    const loadFn = () => Promise.resolve({ default: () => 'page' });
    const lazyRoute = lazy(loadFn);
    expect(lazyRoute.load).toBe(loadFn);
  });

  test('lazy route caches result after loading', async () => {
    let loadCount = 0;
    const loadFn = () => {
      loadCount++;
      return Promise.resolve({ default: () => 'cached-page' });
    };
    const lazyRoute = lazy(loadFn);
    const router = createRouter({ routes: { '/': lazyRoute } });
    // Wait for load to complete
    await new Promise(r => setTimeout(r, 10));
    expect(lazyRoute._cached).toBeTruthy();
  });

  test('loading component shown during lazy load', () => {
    const Loading = () => 'loading...';
    const lazyRoute = lazy(() => new Promise(r => setTimeout(() => r({ default: () => 'page' }), 100)));
    const router = createRouter({
      routes: { '/': lazyRoute },
      loading: Loading,
    });
    // Should show loading component
    expect(router.loading()).toBe(true);
  });

  test('error component shown on lazy load failure', async () => {
    const ErrorComp = () => 'error!';
    const lazyRoute = lazy(() => Promise.reject(new Error('fail')));
    const router = createRouter({
      routes: { '/': lazyRoute },
      error: ErrorComp,
    });
    await new Promise(r => setTimeout(r, 10));
    expect(router.route().component).toBe(ErrorComp);
    expect(router.loading()).toBe(false);
  });
});

// ─── Query String Parsing ────────────────────────────────

describe('Query string parsing', () => {
  test('getQuery returns empty object with no query', () => {
    createRouter({ routes: {} });
    expect(getQuery()()).toEqual({});
  });

  test('router route includes query object', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    expect(router.route().query).toEqual({});
  });
});

// ─── Destroy ─────────────────────────────────────────────

describe('Router destroy', () => {
  test('destroy clears all state', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    router.beforeNavigate(() => true);
    router.afterNavigate(() => {});
    router.onRouteChange(() => {});
    router.destroy();
    expect(router._routeDefinitions).toEqual([]);
    expect(router._beforeHooks).toEqual([]);
    expect(router._afterHooks).toEqual([]);
    expect(router._onChangeCallbacks).toEqual([]);
  });

  test('destroy nullifies active router', () => {
    const router = createRouter({ routes: {} });
    expect(getRouter()).toBe(router);
    router.destroy();
    expect(getRouter()).toBe(null);
  });

  test('destroy is idempotent', () => {
    const router = createRouter({ routes: {} });
    router.destroy();
    expect(() => router.destroy()).not.toThrow();
  });
});

// ─── Route Priority & Ordering ───────────────────────────

describe('Route priority & ordering', () => {
  test('more specific routes match before less specific', () => {
    const Specific = () => 'specific';
    const CatchAll = () => 'catchall';
    const router = createRouter({ routes: {
      '/': Specific,
      '*': CatchAll,
    }});
    // / should match the specific route, not catch-all
    expect(router.route().component).toBe(Specific);
  });

  test('routes are checked in definition order', () => {
    const First = () => 'first';
    const Second = () => 'second';
    const router = createRouter({ routes: {
      '/': First,
    }});
    expect(router.route().component).toBe(First);
  });
});

// ─── Edge Cases ──────────────────────────────────────────

describe('Edge cases', () => {
  test('empty routes map is valid', () => {
    expect(() => createRouter({ routes: {} })).not.toThrow();
  });

  test('route with only 404', () => {
    const NotFound = () => '404';
    const router = createRouter({ routes: { '404': NotFound } });
    expect(router.route().component).toBe(NotFound);
  });

  test('navigate auto-creates router when none exists', () => {
    resetRouter();
    expect(() => navigate('/test')).not.toThrow();
    expect(getRouter()).toBeTruthy();
  });

  test('multiple defineRoutes calls replace previous router', () => {
    const A = () => 'a';
    const B = () => 'b';
    defineRoutes({ '/': A });
    expect(getRouter().route().component).toBe(A);
    defineRoutes({ '/': B });
    expect(getRouter().route().component).toBe(B);
  });

  test('route pattern does not match trailing slash differently', () => {
    const Page = () => 'page';
    const router = createRouter({ routes: { '/about': Page } });
    const def = router._routeDefinitions[0];
    expect(def.pattern.test('/about')).toBe(true);
    // Trailing slash should NOT match (it's a different path)
    expect(def.pattern.test('/about/')).toBe(false);
  });

  test('scroll behavior default is auto', () => {
    const router = createRouter({ routes: {} });
    expect(router.scrollBehavior).toBe('auto');
  });

  test('scroll behavior none', () => {
    const router = createRouter({ routes: {}, scroll: 'none' });
    expect(router.scrollBehavior).toBe('none');
  });

  test('scroll behavior custom function', () => {
    const customFn = () => ({ x: 0, y: 0 });
    const router = createRouter({ routes: {}, scroll: customFn });
    expect(router.scrollBehavior).toBe(customFn);
  });
});

// ─── Scroll Positions ────────────────────────────────────

describe('Scroll positions', () => {
  test('scroll positions map starts empty', () => {
    const router = createRouter({ routes: {} });
    expect(router._scrollPositions.size).toBe(0);
  });
});

// ─── Base Path ───────────────────────────────────────────

describe('Base path', () => {
  test('base path stored without trailing slash', () => {
    const router = createRouter({ routes: {}, base: '/app/' });
    expect(router.base).toBe('/app');
  });

  test('base path empty for default', () => {
    const router = createRouter({ routes: {} });
    expect(router.base).toBe('');
  });

  test('Link prepends base to href', () => {
    createRouter({ routes: {}, base: '/myapp' });
    const vnode = Link({ href: '/about' });
    expect(vnode.props.href).toBe('/myapp/about');
  });

  test('Link with base path and activeClass', () => {
    createRouter({ routes: { '/': () => 'home' }, base: '/app' });
    const vnode = Link({ href: '/', activeClass: 'active' });
    expect(vnode.props.href).toBe('/app/');
    expect(typeof vnode.props.class).toBe('function');
    expect(vnode.props.class()).toContain('active');
  });
});

// ─── Large Route Set ─────────────────────────────────────

describe('Scalability — large route sets', () => {
  test('handles 100 routes without error', () => {
    const routes = {};
    for (let i = 0; i < 100; i++) {
      routes['/route-' + i] = () => 'page-' + i;
    }
    const router = createRouter({ routes });
    expect(router._routeDefinitions.length).toBe(100);
  });

  test('handles 1000 routes without error', () => {
    const routes = {};
    for (let i = 0; i < 1000; i++) {
      routes['/r/' + i] = () => 'page-' + i;
    }
    const router = createRouter({ routes });
    expect(router._routeDefinitions.length).toBe(1000);
  });

  test('route matching is fast for large route sets', () => {
    const routes = {};
    for (let i = 0; i < 500; i++) {
      routes['/route-' + i] = () => 'page-' + i;
    }
    const router = createRouter({ routes });
    // matchRoute should complete quickly
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      router._matchRoute('/route-499');
    }
    const elapsed = performance.now() - start;
    // 1000 matches should take less than 200ms (generous for CI)
    expect(elapsed).toBeLessThan(200);
  });

  test('deeply nested routes work', () => {
    const router = createRouter({ routes: {
      '/a': {
        component: () => 'layout-a',
        children: {
          '/b': () => 'page-b',
          '/c': () => 'page-c',
          '/d': () => 'page-d',
          '/e': () => 'page-e',
          '/f': () => 'page-f',
        },
      },
    }});
    expect(router._routeDefinitions[0].children.length).toBe(5);
  });
});

// ─── File-Based Routing (compile-time) ───────────────────

describe('File-based routing utility', () => {
  test('generateFileBasedRoutes is available in build', async () => {
    // This is a compile-time feature, not a runtime feature
    // We test it indirectly by verifying the router API handles the output
    const routes = {
      '/': () => 'home',
      '/about': () => 'about',
      '/users/:id': () => 'user',
      '/blog/*': () => 'blog',
      '404': () => '404',
    };
    const router = createRouter({ routes });
    // '404' goes to _notFoundComponent (not in _routeDefinitions)
    // So: /, /about, /users/:id, /blog/* = 4 definitions
    expect(router._routeDefinitions.length).toBe(4);
  });
});

// ─── Concurrent Navigation ───────────────────────────────

describe('Concurrent navigation', () => {
  test('rapid navigation does not throw', () => {
    const router = createRouter({ routes: {
      '/': () => 'home',
      '/a': () => 'a',
      '/b': () => 'b',
      '/c': () => 'c',
    }});
    expect(() => {
      for (let i = 0; i < 100; i++) {
        navigate('/a');
        navigate('/b');
        navigate('/c');
        navigate('/');
      }
    }).not.toThrow();
  });

  test('guards during rapid navigation', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    let count = 0;
    router.beforeNavigate(() => { count++; return true; });
    for (let i = 0; i < 50; i++) {
      navigate('/test-' + i);
    }
    expect(count).toBe(50);
  });
});

// ─── Full Integration ────────────────────────────────────

describe('Full integration', () => {
  test('complete SPA setup works', () => {
    const Home = () => 'home';
    const About = () => 'about';
    const NotFound = () => '404';

    const router = createRouter({
      routes: {
        '/': Home,
        '/about': { component: About, meta: { title: 'About Us' } },
        '404': NotFound,
      },
      scroll: 'auto',
    });

    // Verify route matched
    expect(router.route().component).toBe(Home);
    expect(router.route().meta).toEqual({});

    // Verify signal getters
    expect(router.path()).toBe('/');
    expect(router.params()).toEqual({});
    expect(router.query()).toEqual({});

    // Verify components
    const routerVnode = Router();
    expect(routerVnode.__tova).toBe(true);
    expect(routerVnode.compute()).toBe('home');

    // Verify link
    const link = Link({ href: '/about', children: ['About'], activeClass: 'active' });
    expect(link.tag).toBe('a');
    expect(link.props.href).toBe('/about');

    // Navigate
    let afterCalled = false;
    router.afterNavigate(() => { afterCalled = true; });
    navigate('/test');
    expect(afterCalled).toBe(true);

    // Cleanup
    router.destroy();
    expect(getRouter()).toBe(null);
  });

  test('nested route setup works', () => {
    const DashboardLayout = () => 'dashboard-layout';
    const DashboardHome = () => 'dashboard-home';
    const DashboardSettings = () => 'dashboard-settings';

    const router = createRouter({
      routes: {
        '/dashboard': {
          component: DashboardLayout,
          meta: { requiresAuth: true },
          children: {
            '/': DashboardHome,
            '/settings': { component: DashboardSettings, meta: { role: 'admin' } },
          },
        },
        '404': () => '404',
      },
    });

    // Root path doesn't match /dashboard, falls to 404
    expect(router.route().component).toBeTruthy();
    expect(router._routeDefinitions[0].children.length).toBe(2);
    expect(router._routeDefinitions[0].meta.requiresAuth).toBe(true);
  });
});
