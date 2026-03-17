import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { createRouter, resetRouter, lazy } from '../src/runtime/router.js';

let originalWindow;
let originalDocument;
let originalRequestAnimationFrame;
let popstateHandler;
let clickHandler;

beforeEach(() => {
  resetRouter();
  popstateHandler = null;
  clickHandler = null;
  originalWindow = globalThis.window;
  originalDocument = globalThis.document;
  originalRequestAnimationFrame = globalThis.requestAnimationFrame;

  globalThis.window = {
    location: {
      pathname: '/',
      search: '',
      origin: 'http://localhost',
      href: 'http://localhost/',
    },
    history: {
      pushState: mock(() => {}),
      replaceState: mock(() => {}),
      back: mock(() => {}),
      forward: mock(() => {}),
    },
    addEventListener: mock((type, handler) => {
      if (type === 'popstate') popstateHandler = handler;
    }),
    removeEventListener: mock(() => {}),
    scrollX: 0,
    scrollY: 0,
    scrollTo: mock(() => {}),
  };

  globalThis.document = {
    ...originalDocument,
    addEventListener: mock((type, handler) => {
      if (type === 'click') clickHandler = handler;
    }),
    removeEventListener: mock(() => {}),
  };

  globalThis.requestAnimationFrame = (fn) => fn();
});

afterEach(() => {
  resetRouter();
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
});

describe('router browser coverage', () => {
  test('parses repeated query params into arrays', () => {
    globalThis.window.location.pathname = '/';
    globalThis.window.location.search = '?tag=a&tag=b';

    const router = createRouter({ routes: { '/': () => 'home' } });

    expect(router.route().query).toEqual({ tag: ['a', 'b'] });
  });

  test('navigate serializes array and boolean query params and omits falsey unsupported values', () => {
    const router = createRouter({ routes: { '/items': () => 'items' } });

    router.navigate('/items', {
      replace: true,
      query: {
        tag: ['a', 'b'],
        flag: true,
        q: 'ok',
        skip: false,
        empty: null,
        missing: undefined,
      },
    });

    expect(globalThis.window.history.replaceState).toHaveBeenCalled();
    expect(globalThis.window.history.replaceState.mock.calls.at(-1)[2]).toBe('/items?tag=a&tag=b&flag&q=ok');
  });

  test('navigate preserves query string from path', () => {
    const router = createRouter({ routes: { '/docs': () => 'docs' } });

    router.navigate('/docs?tab=api');

    expect(globalThis.window.history.pushState.mock.calls.at(-1)[2]).toBe('/docs?tab=api');
  });

  test('navigate preserves hash from path', () => {
    const router = createRouter({ routes: { '/docs': () => 'docs' } });

    router.navigate('/docs#intro');

    expect(globalThis.window.history.pushState.mock.calls.at(-1)[2]).toBe('/docs#intro');
  });

  test('back and forward delegate to window.history', () => {
    const router = createRouter({ routes: {} });

    router.back();
    router.forward();

    expect(globalThis.window.history.back).toHaveBeenCalled();
    expect(globalThis.window.history.forward).toHaveBeenCalled();
  });

  test('destroy removes popstate and click listeners when they were registered', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });

    expect(typeof popstateHandler).toBe('function');
    expect(typeof clickHandler).toBe('function');

    router.destroy();

    expect(globalThis.window.removeEventListener).toHaveBeenCalledWith('popstate', popstateHandler);
    expect(globalThis.document.removeEventListener).toHaveBeenCalledWith('click', clickHandler);
  });

  test('base path is stripped during initial route handling', () => {
    const Dashboard = () => 'dashboard';
    globalThis.window.location.pathname = '/app/dashboard';

    const router = createRouter({
      base: '/app',
      routes: { '/dashboard': Dashboard },
    });

    expect(router.route().path).toBe('/dashboard');
    expect(router.route().component).toBe(Dashboard);
  });

  test('cached lazy route sets component immediately and fires post-navigation hooks', () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    const CachedPage = () => 'cached';
    const lazyRoute = lazy(() => Promise.resolve({ default: () => 'unused' }));
    lazyRoute._cached = CachedPage;

    let changed = 0;
    let after = 0;
    router.onRouteChange(() => { changed += 1; });
    router.afterNavigate(() => { after += 1; });

    router._loadLazyRoute({ path: '/lazy', component: lazyRoute, params: {}, meta: {} }, { from: 'cache' });

    expect(router.route().component).toBe(CachedPage);
    expect(router.route().query).toEqual({ from: 'cache' });
    expect(changed).toBe(1);
    expect(after).toBe(1);
  });

  test('lazy route failure without error component logs and clears component', async () => {
    const router = createRouter({ routes: { '/': () => 'home' } });
    const lazyRoute = lazy(() => Promise.reject(new Error('boom')));
    const originalConsole = globalThis.console;
    const errorSpy = mock(() => {});
    globalThis.console = { ...originalConsole, error: errorSpy };

    router._loadLazyRoute({ path: '/lazy', component: lazyRoute, params: {}, meta: {} }, {});
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errorSpy).toHaveBeenCalled();
    expect(router.route().component).toBe(null);
    expect(router.loading()).toBe(false);

    globalThis.console = originalConsole;
  });

  test('saveScrollPosition evicts the oldest entry after 200 items', () => {
    const router = createRouter({ routes: {} });

    for (let i = 0; i < 201; i++) {
      globalThis.window.location.pathname = '/p' + i;
      globalThis.window.location.search = '?n=' + i;
      globalThis.window.scrollX = i;
      globalThis.window.scrollY = i + 1;
      router._saveScrollPosition();
    }

    expect(router._scrollPositions.size).toBe(200);
    expect(router._scrollPositions.has('/p0?n=0')).toBe(false);
    expect(router._scrollPositions.has('/p200?n=200')).toBe(true);
  });

  test('custom scroll behavior receives saved position and scrolls to returned coordinates', () => {
    let received = null;
    const router = createRouter({
      routes: {},
      scroll: ({ savedPosition, to }) => {
        received = { savedPosition, to };
        return { x: 12, y: 34 };
      },
    });

    router._scrollPositions.set('/target', { x: 3, y: 4 });
    router._restoreScrollPosition('/target', false);

    expect(received).toEqual({ savedPosition: { x: 3, y: 4 }, to: '/target' });
    expect(globalThis.window.scrollTo).toHaveBeenCalledWith(12, 34);
  });

  test('back navigation restores saved scroll position', () => {
    const router = createRouter({ routes: {} });
    router._scrollPositions.set('/back', { x: 7, y: 8 });

    router._restoreScrollPosition('/back', true);

    expect(globalThis.window.scrollTo).toHaveBeenCalledWith(7, 8);
  });

  test('popstate cancellation restores the previous URL', () => {
    const router = createRouter({ routes: { '/': () => 'home', '/blocked': () => 'blocked' } });
    router.beforeNavigate(() => false);
    globalThis.window.location.pathname = '/blocked';

    popstateHandler();

    expect(globalThis.window.history.pushState).toHaveBeenCalledWith({}, '', '/');
  });

  test('popstate strips base path and restores scroll for back navigation', () => {
    const Dashboard = () => 'dashboard';
    globalThis.window.location.pathname = '/app/dashboard';

    const router = createRouter({
      base: '/app',
      routes: { '/dashboard': Dashboard },
    });

    router._scrollPositions.set('/dashboard', { x: 9, y: 11 });
    globalThis.window.location.pathname = '/app/dashboard';

    popstateHandler();

    expect(router.route().path).toBe('/dashboard');
    expect(globalThis.window.scrollTo).toHaveBeenCalledWith(9, 11);
  });

  test('click handler strips base path before navigating internal links', () => {
    createRouter({
      base: '/app',
      routes: { '/docs': () => 'docs' },
    });

    const preventDefault = mock(() => {});
    const link = {
      href: 'http://localhost/app/docs?tab=api#hash',
      target: '',
      hasAttribute: () => false,
      getAttribute: (name) => name === 'rel' ? null : '/app/docs?tab=api#hash',
    };

    clickHandler({
      target: { closest: () => link },
      preventDefault,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(globalThis.window.history.pushState.mock.calls.at(-1)[2]).toBe('/app/docs?tab=api#hash');
  });

  test('click handler falls back to href attribute when URL construction fails', () => {
    createRouter({ routes: { '/fallback': () => 'fallback' } });
    const OriginalURL = globalThis.URL;
    globalThis.URL = class URL {
      constructor() {
        throw new Error('bad url');
      }
    };

    const preventDefault = mock(() => {});
    const link = {
      href: 'http://localhost/fallback',
      target: '',
      hasAttribute: () => false,
      getAttribute: (name) => name === 'rel' ? null : '/fallback',
    };

    clickHandler({
      target: { closest: () => link },
      preventDefault,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(globalThis.window.history.pushState.mock.calls.at(-1)[2]).toBe('/fallback');

    globalThis.URL = OriginalURL;
  });
});
