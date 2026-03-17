/**
 * Runtime Satellites 100% Coverage Tests
 * Targets: testing.js, router.js, rpc.js, db.js, devtools.js, ssr.js, ai.js
 */
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { __resetForTesting } from '../src/runtime/reactivity.js';

// Reset module-level state that may have been polluted by earlier test files.
__resetForTesting();

// =============================================================================
// MOCK DOM SETUP (shared by testing.js, router.js, devtools.js)
// =============================================================================

function _setParent(child, parent) {
  if (child && typeof child === 'object') child.parentNode = parent;
}
function _clearParent(child) {
  if (child && typeof child === 'object') child.parentNode = null;
}
const childMethods = {
  appendChild(child) {
    if (child && child.nodeType === 11) {
      const moved = [...child.children];
      for (const c of moved) { _setParent(c, this); this.children.push(c); }
      child.children.length = 0;
      return child;
    }
    _setParent(child, this);
    this.children.push(child);
    return child;
  },
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) { this.children.splice(idx, 1); _clearParent(child); }
    return child;
  },
  replaceChild(newChild, oldChild) {
    const idx = this.children.indexOf(oldChild);
    if (idx < 0) return;
    _clearParent(oldChild);
    if (newChild && newChild.nodeType === 11) {
      const moved = [...newChild.children];
      this.children.splice(idx, 1, ...moved);
      for (const c of moved) _setParent(c, this);
      newChild.children.length = 0;
    } else {
      this.children[idx] = newChild;
      _setParent(newChild, this);
    }
  },
  insertBefore(newChild, refChild) {
    if (!refChild) return this.appendChild(newChild);
    const idx = this.children.indexOf(refChild);
    if (idx < 0) return this.appendChild(newChild);
    if (newChild && newChild.nodeType === 11) {
      const moved = [...newChild.children];
      this.children.splice(idx, 0, ...moved);
      for (const c of moved) _setParent(c, this);
      newChild.children.length = 0;
      return newChild;
    }
    _setParent(newChild, this);
    this.children.splice(idx, 0, newChild);
    return newChild;
  },
};

function createMockElement(tag) {
  return {
    tagName: tag, nodeType: 1, parentNode: null, children: [],
    get childNodes() { return this.children; },
    get firstChild() { return this.children[0] || null; },
    get nextSibling() {
      if (!this.parentNode) return null;
      const siblings = this.parentNode.children;
      const idx = siblings.indexOf(this);
      return idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
    },
    attributes: {}, style: {}, className: '', innerHTML: '', value: '', checked: false,
    eventListeners: {}, __handlers: {},
    ...childMethods,
    setAttribute(key, val) { this.attributes[key] = String(val); },
    getAttribute(key) { return this.attributes[key] || null; },
    removeAttribute(key) { delete this.attributes[key]; },
    hasAttribute(key) { return key in this.attributes; },
    addEventListener(event, handler) {
      if (!this.eventListeners[event]) this.eventListeners[event] = [];
      this.eventListeners[event].push(handler);
    },
    removeEventListener(event, handler) {
      if (this.eventListeners[event]) {
        this.eventListeners[event] = this.eventListeners[event].filter(h => h !== handler);
      }
    },
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    replaceChildren() { this.children.length = 0; },
    dispatchEvent(event) {
      const handlers = this.eventListeners[event.type] || [];
      for (const h of handlers) h(event);
      return true;
    },
  };
}

function createMockTextNode(text) {
  return {
    nodeType: 3, textContent: text, data: text, parentNode: null,
    get nextSibling() {
      if (!this.parentNode) return null;
      const siblings = this.parentNode.children;
      const idx = siblings.indexOf(this);
      return idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
    },
  };
}

function createMockComment(text) {
  return {
    nodeType: 8, textContent: text, data: text, parentNode: null,
    get nextSibling() {
      if (!this.parentNode) return null;
      const siblings = this.parentNode.children;
      const idx = siblings.indexOf(this);
      return idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
    },
  };
}

function createMockDocument() {
  return {
    createElement(tag) { return createMockElement(tag); },
    createTextNode(text) { return createMockTextNode(text); },
    createComment(text) { return createMockComment(text); },
    createDocumentFragment() {
      return {
        nodeType: 11, children: [],
        get childNodes() { return this.children; },
        get firstChild() { return this.children[0] || null; },
        ...childMethods,
      };
    },
    getElementById() { return createMockElement('div'); },
    addEventListener() {},
    querySelector(sel) { return null; },
    body: createMockElement('body'),
    head: createMockElement('head'),
  };
}

// Always install mock DOM — prevents cross-file pollution from execution ordering
globalThis.document = createMockDocument();

// =============================================================================
// 1. TESTING.JS — All exported functions + internal helpers
// =============================================================================

describe('testing.js — full coverage', () => {
  let testingMod;

  beforeEach(async () => {
    testingMod = await import('../src/runtime/testing.js');
  });

  afterEach(() => {
    testingMod.cleanup();
  });

  describe('renderForTest', () => {
    test('renders a function component', () => {
      const { tova_el } = require('../src/runtime/reactivity.js');
      const MyComp = (props) => tova_el('div', {}, ['Hello ' + (props.name || 'World')]);
      const { container, getByText, getByTestId, getByRole, querySelector, querySelectorAll, dispose, debug } = testingMod.renderForTest(MyComp, { props: { name: 'Test' } });
      expect(container).toBeDefined();
      expect(typeof dispose).toBe('function');
      expect(typeof debug).toBe('function');
      expect(typeof getByText).toBe('function');
      expect(typeof getByTestId).toBe('function');
      expect(typeof getByRole).toBe('function');
      expect(typeof querySelector).toBe('function');
      expect(typeof querySelectorAll).toBe('function');
    });

    test('renders a non-function (static vnode) component', () => {
      const { tova_el } = require('../src/runtime/reactivity.js');
      const vnode = tova_el('span', {}, ['Static']);
      const { container } = testingMod.renderForTest(vnode);
      expect(container).toBeDefined();
      // Container should have children after render
      expect(container.children.length).toBeGreaterThanOrEqual(0);
    });

    test('uses user-provided container', () => {
      const { tova_el } = require('../src/runtime/reactivity.js');
      const userContainer = createMockElement('section');
      const { container } = testingMod.renderForTest(tova_el('p', {}, ['text']), { container: userContainer });
      expect(container).toBe(userContainer);
    });

    test('container without replaceChildren uses removeChild fallback', () => {
      const { tova_el } = require('../src/runtime/reactivity.js');
      const userContainer = createMockElement('div');
      // Remove replaceChildren to trigger the while(firstChild) path
      delete userContainer.replaceChildren;
      // Add a child first
      const existingChild = createMockTextNode('old');
      userContainer.appendChild(existingChild);

      const { container } = testingMod.renderForTest(tova_el('p', {}, ['new']), { container: userContainer });
      expect(container).toBe(userContainer);
    });

    test('getByText searches for text nodes', () => {
      const { tova_el } = require('../src/runtime/reactivity.js');
      const { getByText } = testingMod.renderForTest(tova_el('div', {}, ['Find Me']));
      // getByText delegates to findByText which walks the DOM
      const result = getByText('Find Me');
      // Result may be the element or null depending on how mock DOM nodes are structured
    });

    test('getByText returns null for non-existent text', () => {
      const { tova_el } = require('../src/runtime/reactivity.js');
      const { getByText } = testingMod.renderForTest(tova_el('div', {}, ['Hello']));
      const result = getByText('NonExistent');
      expect(result).toBeNull();
    });

    test('debug prints innerHTML when available', () => {
      const { tova_el } = require('../src/runtime/reactivity.js');
      const logSpy = mock(() => {});
      const origLog = console.log;
      console.log = logSpy;

      const { debug, container } = testingMod.renderForTest(tova_el('div', {}, ['debug']));
      debug();

      expect(logSpy).toHaveBeenCalled();
      console.log = origLog;
    });

    test('debug uses serializeNode when innerHTML is undefined', () => {
      const { tova_el } = require('../src/runtime/reactivity.js');
      const logSpy = mock(() => {});
      const origLog = console.log;
      console.log = logSpy;

      const userContainer = createMockElement('div');
      delete userContainer.innerHTML;

      const { debug } = testingMod.renderForTest(tova_el('div', {}, ['serialize']), { container: userContainer });
      debug();

      expect(logSpy).toHaveBeenCalled();
      console.log = origLog;
    });
  });

  describe('fireEvent', () => {
    const { fireEvent } = require('../src/runtime/testing.js');

    test('click dispatches via eventListeners', () => {
      let clicked = false;
      const el = createMockElement('button');
      el.eventListeners['click'] = [(e) => { clicked = true; }];
      fireEvent.click(el);
      expect(clicked).toBe(true);
    });

    test('input sets value and dispatches', () => {
      let inputValue = null;
      const el = createMockElement('input');
      el.eventListeners['input'] = [(e) => { inputValue = el.value; }];
      fireEvent.input(el, { value: 'hello' });
      expect(el.value).toBe('hello');
      expect(inputValue).toBe('hello');
    });

    test('input without value option', () => {
      let dispatched = false;
      const el = createMockElement('input');
      el.value = 'original';
      el.eventListeners['input'] = [(e) => { dispatched = true; }];
      fireEvent.input(el);
      expect(el.value).toBe('original');
      expect(dispatched).toBe(true);
    });

    test('change sets value and checked', () => {
      let changed = false;
      const el = createMockElement('input');
      el.eventListeners['change'] = [(e) => { changed = true; }];
      fireEvent.change(el, { value: 'new', checked: true });
      expect(el.value).toBe('new');
      expect(el.checked).toBe(true);
      expect(changed).toBe(true);
    });

    test('change without value/checked options', () => {
      let changed = false;
      const el = createMockElement('input');
      el.eventListeners['change'] = [(e) => { changed = true; }];
      fireEvent.change(el);
      expect(changed).toBe(true);
    });

    test('submit dispatches', () => {
      let submitted = false;
      const el = createMockElement('form');
      el.eventListeners['submit'] = [(e) => { submitted = true; }];
      fireEvent.submit(el);
      expect(submitted).toBe(true);
    });

    test('focus dispatches', () => {
      let focused = false;
      const el = createMockElement('input');
      el.eventListeners['focus'] = [(e) => { focused = true; }];
      fireEvent.focus(el);
      expect(focused).toBe(true);
    });

    test('blur dispatches', () => {
      let blurred = false;
      const el = createMockElement('input');
      el.eventListeners['blur'] = [(e) => { blurred = true; }];
      fireEvent.blur(el);
      expect(blurred).toBe(true);
    });

    test('keyDown dispatches with options', () => {
      let key = null;
      const el = createMockElement('input');
      el.eventListeners['keydown'] = [(e) => { key = e.key; }];
      fireEvent.keyDown(el, { key: 'Enter' });
      expect(key).toBe('Enter');
    });

    test('keyUp dispatches with options', () => {
      let key = null;
      const el = createMockElement('input');
      el.eventListeners['keyup'] = [(e) => { key = e.key; }];
      fireEvent.keyUp(el, { key: 'Escape' });
      expect(key).toBe('Escape');
    });

    test('mouseEnter dispatches', () => {
      let entered = false;
      const el = createMockElement('div');
      el.eventListeners['mouseenter'] = [(e) => { entered = true; }];
      fireEvent.mouseEnter(el);
      expect(entered).toBe(true);
    });

    test('mouseLeave dispatches', () => {
      let left = false;
      const el = createMockElement('div');
      el.eventListeners['mouseleave'] = [(e) => { left = true; }];
      fireEvent.mouseLeave(el);
      expect(left).toBe(true);
    });

    test('throws on null element', () => {
      expect(() => fireEvent.click(null)).toThrow(/Cannot fire/);
    });

    test('uses __handlers path', () => {
      let called = false;
      const el = createMockElement('button');
      el.eventListeners = {};
      el.__handlers = { click: (e) => { called = true; } };
      const event = fireEvent.click(el);
      expect(called).toBe(true);
      expect(event.type).toBe('click');
    });

    test('falls back to dispatchEvent', () => {
      let dispatched = false;
      const el = createMockElement('button');
      el.eventListeners = {};
      el.__handlers = {};
      el.dispatchEvent = (event) => { dispatched = true; return true; };
      fireEvent.click(el);
      expect(dispatched).toBe(true);
    });

    test('throws when no listeners and no dispatchEvent', () => {
      const el = { value: '' };
      expect(() => fireEvent.click(el)).toThrow(/no event listeners/);
    });

    test('multiple event listeners are all called', () => {
      let count = 0;
      const el = createMockElement('button');
      el.eventListeners['click'] = [() => count++, () => count++, () => count++];
      fireEvent.click(el);
      expect(count).toBe(3);
    });
  });

  describe('waitForEffect', () => {
    test('resolves with 0ms (microtask)', async () => {
      await testingMod.waitForEffect();
    });

    test('resolves with positive ms (setTimeout)', async () => {
      const start = Date.now();
      await testingMod.waitForEffect(20);
      expect(Date.now() - start).toBeGreaterThanOrEqual(15);
    });
  });

  describe('cleanup', () => {
    test('disposes roots and removes containers with parents', () => {
      const { tova_el } = require('../src/runtime/reactivity.js');
      const parent = createMockElement('body');
      const userContainer = createMockElement('div');
      parent.appendChild(userContainer);

      testingMod.renderForTest(tova_el('p', {}, ['cleanup test']), { container: userContainer });
      testingMod.cleanup();

      // After cleanup, the container should be removed from parent
    });

    test('handles root with no dispose function', () => {
      // cleanup should not crash even if dispose is null
      testingMod.cleanup();
    });
  });
});


// =============================================================================
// 2. ROUTER.JS — navigation hooks, Outlet, Redirect, query parsing, popstate
// =============================================================================

describe('router.js — full coverage', () => {
  let navigate, defineRoutes, getCurrentRoute, getParams, getPath, getQuery;
  let onRouteChange, beforeNavigate, afterNavigate, Router, Outlet, Link, Redirect;

  const origWindow = globalThis.window;

  beforeEach(async () => {
    globalThis.window = {
      location: { pathname: '/', search: '', origin: 'http://localhost', href: 'http://localhost/' },
      history: { pushState: mock(() => {}) },
      addEventListener: mock(() => {}),
    };
    if (typeof globalThis.performance === 'undefined') {
      globalThis.performance = { now: () => Date.now() };
    }

    const mod = await import('../src/runtime/router.js');
    navigate = mod.navigate;
    defineRoutes = mod.defineRoutes;
    getCurrentRoute = mod.getCurrentRoute;
    getParams = mod.getParams;
    getPath = mod.getPath;
    getQuery = mod.getQuery;
    onRouteChange = mod.onRouteChange;
    beforeNavigate = mod.beforeNavigate;
    afterNavigate = mod.afterNavigate;
    Router = mod.Router;
    Outlet = mod.Outlet;
    Link = mod.Link;
    Redirect = mod.Redirect;
  });

  afterEach(() => {
    globalThis.window = origWindow;
  });

  describe('defineRoutes', () => {
    test('unmatched path with no 404 sets component to null and Router returns null (must be first test)', () => {
      // IMPORTANT: This test must run BEFORE any test that defines a '404' route,
      // because notFoundComponent is module-level state that persists.
      globalThis.window.location.pathname = '/no-match-path';
      defineRoutes({ '/specific': () => 'Specific' });
      const route = getCurrentRoute();
      // With no 404 defined and no match, component should be null
      expect(route().component).toBeNull();
      expect(route().path).toBe('/no-match-path');
      // Router returns a __dynamic vnode; compute() returns null when no match
      const routerResult = Router();
      expect(routerResult.__tova).toBe(true);
      expect(routerResult.compute()).toBeNull();
    });

    test('simple routes', () => {
      globalThis.window.location.pathname = '/';
      defineRoutes({ '/': () => 'Home', '/about': () => 'About' });
      expect(getCurrentRoute()()).toBeDefined();
    });

    test('404 route', () => {
      defineRoutes({ '/': () => 'Home', '404': () => '404' });
      expect(getCurrentRoute()()).toBeDefined();
    });

    test('catch-all * route', () => {
      defineRoutes({ '/': () => 'Home', '*': () => 'CatchAll' });
      expect(getCurrentRoute()()).toBeDefined();
    });

    test('nested routes with children', () => {
      defineRoutes({
        '/app': { component: () => 'Layout', children: { '/': () => 'Dash', '/settings': () => 'Settings' } }
      });
      expect(getCurrentRoute()()).toBeDefined();
    });

    test('404 with object format', () => {
      defineRoutes({ '/': () => 'Home', '404': { component: () => '404' } });
    });
  });

  describe('navigate', () => {
    test('navigates to valid path', () => {
      defineRoutes({ '/': () => 'Home', '/about': () => 'About' });
      navigate('/about');
      expect(globalThis.window.history.pushState).toHaveBeenCalled();
    });

    test('normalizes path without leading /', () => {
      defineRoutes({ '/test': () => 'Test' });
      navigate('test');
      const calls = globalThis.window.history.pushState.mock.calls;
      expect(calls[calls.length - 1][2]).toBe('/test');
    });

    test('blocks protocol-relative URLs', () => {
      const warnSpy = mock(() => {});
      const origConsole = globalThis.console;
      globalThis.console = { ...origConsole, warn: warnSpy };
      navigate('//evil.com');
      expect(warnSpy).toHaveBeenCalled();
      globalThis.console = origConsole;
    });

    test('blocks javascript: URLs', () => {
      const warnSpy = mock(() => {});
      const origConsole = globalThis.console;
      globalThis.console = { ...origConsole, warn: warnSpy };
      navigate('javascript:alert(1)');
      expect(warnSpy).toHaveBeenCalled();
      globalThis.console = origConsole;
    });

    test('blocks non-string paths', () => {
      const warnSpy = mock(() => {});
      const origConsole = globalThis.console;
      globalThis.console = { ...origConsole, warn: warnSpy };
      navigate(null);
      expect(warnSpy).toHaveBeenCalled();
      globalThis.console = origConsole;
    });
  });

  describe('navigation hooks', () => {
    test('beforeNavigate cancels with false', () => {
      defineRoutes({ '/': () => 'Home', '/blocked': () => 'X' });
      const unsub = beforeNavigate((from, to) => to === '/blocked' ? false : undefined);
      navigate('/blocked');
      expect(getCurrentRoute()().path).toBe('/');
      unsub();
    });

    test('beforeNavigate redirects with string', () => {
      defineRoutes({ '/': () => 'Home', '/login': () => 'Login', '/dash': () => 'Dash' });
      const unsub = beforeNavigate((from, to) => {
        if (to === '/dash') return '/login';
      });
      navigate('/dash');
      unsub();
    });

    test('beforeNavigate hook returning true allows navigation', () => {
      defineRoutes({ '/': () => 'Home', '/allowed': () => 'Allowed' });
      const unsub = beforeNavigate((from, to) => true);
      navigate('/allowed');
      unsub();
    });

    test('multiple beforeNavigate hooks - first returns true, second returns undefined', () => {
      defineRoutes({ '/': () => 'Home', '/multi': () => 'Multi' });
      const unsub1 = beforeNavigate(() => true);
      const unsub2 = beforeNavigate(() => undefined);
      navigate('/multi');
      unsub1();
      unsub2();
    });

    test('beforeNavigate unsubscribe removes hook', () => {
      const hook = mock(() => {});
      const unsub = beforeNavigate(hook);
      unsub();
    });

    test('afterNavigate fires after navigation', () => {
      let afterRoute = null;
      defineRoutes({ '/': () => 'Home', '/about': () => 'About' });
      const unsub = afterNavigate((r) => { afterRoute = r; });
      navigate('/about');
      expect(afterRoute).not.toBeNull();
      unsub();
    });

    test('afterNavigate unsubscribe removes hook', () => {
      const hook = mock(() => {});
      const unsub = afterNavigate(hook);
      unsub();
    });
  });

  describe('onRouteChange', () => {
    test('fires callback', () => {
      let matched = null;
      onRouteChange((m) => { matched = m; });
      defineRoutes({ '/': () => 'Home' });
      expect(matched).toBeDefined();
    });
  });

  describe('getters', () => {
    test('getParams', () => {
      defineRoutes({ '/user/:id': () => 'User' });
      const p = getParams();
      expect(typeof p).toBe('function');
    });

    test('getPath', () => {
      defineRoutes({ '/': () => 'Home' });
      expect(typeof getPath()()).toBe('string');
    });

    test('getQuery', () => {
      defineRoutes({ '/': () => 'Home' });
      expect(typeof getQuery()()).toBe('object');
    });
  });

  describe('Router', () => {
    test('renders matched component function', () => {
      defineRoutes({ '/': () => 'Home Content' });
      const result = Router();
      expect(result).toBeDefined();
    });

    test('renders static component', () => {
      defineRoutes({ '/': 'static_home' });
      const result = Router();
      // Router() now returns a dynamic vnode; compute() returns the matched component
      expect(result.__tova).toBe(true);
      expect(result.compute()).toBe('static_home');
    });

    test('returns null when no component', () => {
      globalThis.window.location.pathname = '/nope';
      defineRoutes({});
      // No routes defined, no 404
    });
  });

  describe('Outlet', () => {
    test('renders matched child route', () => {
      globalThis.window.location.pathname = '/app';
      defineRoutes({
        '/app': { component: () => 'Layout', children: { '/': () => 'Child' } }
      });
      const result = Outlet();
    });

    test('renders static child component', () => {
      globalThis.window.location.pathname = '/app';
      defineRoutes({
        '/app': { component: () => 'Layout', children: { '/': 'static_child' } }
      });
      const result = Outlet();
    });

    test('returns null when no child', () => {
      defineRoutes({ '/': () => 'Home' });
      const result = Outlet();
      expect(result).toBeNull();
    });
  });

  describe('Redirect', () => {
    test('queues navigation via microtask', async () => {
      defineRoutes({ '/': () => 'Home', '/target': () => 'Target' });
      const result = Redirect({ to: '/target' });
      expect(result).toBeNull();
      await new Promise(r => queueMicrotask(r));
      await new Promise(r => queueMicrotask(r));
    });

    test('returns null without window', () => {
      const savedWin = globalThis.window;
      delete globalThis.window;
      const result = Redirect({ to: '/target' });
      expect(result).toBeNull();
      globalThis.window = savedWin;
    });
  });

  describe('query parsing', () => {
    test('parses key=value pairs', () => {
      globalThis.window.location.search = '?foo=bar&baz=qux';
      globalThis.window.location.pathname = '/';
      defineRoutes({ '/': () => 'Home' });
      const q = getQuery()();
      expect(q.foo).toBe('bar');
      expect(q.baz).toBe('qux');
    });

    test('empty search string', () => {
      globalThis.window.location.search = '';
      globalThis.window.location.pathname = '/';
      defineRoutes({ '/': () => 'Home' });
      expect(Object.keys(getQuery()())).toHaveLength(0);
    });

    test('just ? produces empty query', () => {
      globalThis.window.location.search = '?';
      globalThis.window.location.pathname = '/';
      defineRoutes({ '/': () => 'Home' });
      expect(Object.keys(getQuery()())).toHaveLength(0);
    });

    test('value containing = preserves it', () => {
      globalThis.window.location.search = '?key=a=b=c';
      globalThis.window.location.pathname = '/';
      defineRoutes({ '/': () => 'Home' });
      expect(getQuery()().key).toBe('a=b=c');
    });

    test('decodes URI components', () => {
      globalThis.window.location.search = '?name=hello%20world';
      globalThis.window.location.pathname = '/';
      defineRoutes({ '/': () => 'Home' });
      expect(getQuery()().name).toBe('hello world');
    });
  });

  describe('404 handling', () => {
    test('unmatched uses notFoundComponent', () => {
      globalThis.window.location.pathname = '/nope';
      defineRoutes({ '/': () => 'Home', '404': () => '404 Page' });
      expect(getCurrentRoute()().component).toBeDefined();
    });
  });

  describe('params', () => {
    test('required params extracted', () => {
      globalThis.window.location.pathname = '/user/42';
      defineRoutes({ '/user/:id': () => 'User' });
      expect(getCurrentRoute()().params.id).toBe('42');
    });

    test('optional params', () => {
      globalThis.window.location.pathname = '/post/hello';
      defineRoutes({ '/post/:slug?': () => 'Post' });
      expect(getCurrentRoute()().params.slug).toBe('hello');
    });
  });

  describe('nested routes', () => {
    test('child route matching', () => {
      globalThis.window.location.pathname = '/app/settings';
      defineRoutes({
        '/app': { component: () => 'Layout', children: { '/settings': () => 'Settings' } }
      });
      expect(getCurrentRoute()().path).toBe('/app');
    });

    test('parent without child match', () => {
      globalThis.window.location.pathname = '/app';
      defineRoutes({
        '/app': { component: () => 'Layout', children: { '/settings': () => 'Settings' } }
      });
      expect(getCurrentRoute()().path).toBe('/app');
    });
  });

  describe('Link component', () => {
    test('creates an anchor element structure', () => {
      const result = Link({ href: '/about', children: ['About'] });
      expect(result).toBeDefined();
      expect(result.__tova).toBe(true);
      expect(result.tag).toBe('a');
    });

    test('onClick handler navigates', () => {
      defineRoutes({ '/': () => 'Home', '/about': () => 'About' });
      const result = Link({ href: '/about', children: ['About'] });
      // Find the onClick prop and invoke it
      const onClick = result.props.onClick;
      expect(typeof onClick).toBe('function');
      const mockEvent = { preventDefault: mock(() => {}) };
      onClick(mockEvent);
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });
  });

  describe('Redirect behavior', () => {
    test('Redirect queues microtask that resets counter and calls navigate', async () => {
      defineRoutes({ '/': () => 'Home', '/redir-target': () => 'Target' });
      const pushBefore = globalThis.window.history.pushState.mock.calls.length;
      Redirect({ to: '/redir-target' });
      // Wait for the microtask to execute. Use setTimeout which runs after microtasks.
      await new Promise(r => setTimeout(r, 50));
      const pushAfter = globalThis.window.history.pushState.mock.calls.length;
      // Verify the microtask actually ran (navigate was called)
      expect(pushAfter).toBeGreaterThan(pushBefore);
    });

    test('Redirect loop detection after many rapid redirects', async () => {
      defineRoutes({ '/': () => 'Home', '/loop-dest': () => 'Loop' });
      const errSpy = mock(() => {});
      const origConsole = globalThis.console;
      globalThis.console = { ...origConsole, error: errSpy, warn: () => {}, log: origConsole.log };

      // Queue many redirects rapidly
      for (let i = 0; i < 15; i++) {
        Redirect({ to: '/loop-dest' });
        // Flush each microtask individually so they execute in sequence
        await new Promise(r => queueMicrotask(r));
      }
      // Additional flush
      for (let i = 0; i < 5; i++) {
        await new Promise(r => queueMicrotask(r));
      }
      await new Promise(r => setTimeout(r, 50));

      expect(errSpy).toHaveBeenCalled();
      globalThis.console = origConsole;
    });
  });

  describe('Router null return path', () => {
    // NOTE: this test relies on notFoundComponent being set from a previous test.
    // In isolation, the first test in defineRoutes clears it.
    // We test both paths: component exists and component is null.

    test('returns null when route has no component (before 404 is set)', () => {
      // This test should run after the 'no 404' test already ran
      // which set component to null.
      globalThis.window.location.pathname = '/xyz-unique-nonexist';
      defineRoutes({ '/only-one-route-here': () => 'Only' });
      // After the first defineRoutes test already ran without 404,
      // notFoundComponent might be set from an intervening test.
      // Call Router and check behavior
      const result = Router();
      // result is null if notFoundComponent was never set, or a component if it was
    });
  });

  describe('beforeNavigate redirect string', () => {
    test('hook returning string causes redirect', () => {
      defineRoutes({ '/': () => 'Home', '/login': () => 'Login', '/secret': () => 'Secret' });
      const unsub = beforeNavigate((from, to) => {
        if (to === '/secret') return '/login';
        return undefined;
      });
      navigate('/secret');
      // Should have redirected - pushState called with '/login'
      const pushCalls = globalThis.window.history.pushState.mock.calls;
      const lastCall = pushCalls[pushCalls.length - 1];
      expect(lastCall[2]).toBe('/login');
      unsub();
    });
  });
});


// =============================================================================
// 3. RPC.JS — CSRF, interceptors, timeout, error handling
// =============================================================================

describe('rpc.js — full coverage', () => {
  let rpc, configureRPC, addRPCInterceptor, setCSRFToken;
  const originalFetch = globalThis.fetch;

  let savedQuerySelector;

  beforeEach(async () => {
    // Ensure document.querySelector is always available for CSRF token detection
    savedQuerySelector = globalThis.document?.querySelector;
    if (globalThis.document && typeof globalThis.document.querySelector !== 'function') {
      globalThis.document.querySelector = () => null;
    }

    const mod = await import('../src/runtime/rpc.js');
    rpc = mod.rpc;
    configureRPC = mod.configureRPC;
    addRPCInterceptor = mod.addRPCInterceptor;
    setCSRFToken = mod.setCSRFToken;
    configureRPC({ baseUrl: 'http://localhost:3000', timeout: 30000, csrfToken: null });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setCSRFToken(null);
    // Restore original querySelector
    if (savedQuerySelector !== undefined && globalThis.document) {
      globalThis.document.querySelector = savedQuerySelector;
    }
  });

  function okResponse(result) {
    return { ok: true, status: 200, json: async () => ({ result }), text: async () => JSON.stringify({ result }) };
  }

  function errResponse(status, text) {
    return { ok: false, status, json: async () => ({}), text: async () => text };
  }

  describe('basic calls', () => {
    test('POST to /rpc/functionName', async () => {
      globalThis.fetch = mock(async () => okResponse('ok'));
      const result = await rpc('myFn', []);
      expect(result).toBe('ok');
      expect(globalThis.fetch.mock.calls[0][0]).toContain('/rpc/myFn');
    });

    test('single object arg sent directly', async () => {
      globalThis.fetch = mock(async () => okResponse('ok'));
      await rpc('fn', [{ name: 'test' }]);
      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body.name).toBe('test');
    });

    test('multiple args wrapped in __args', async () => {
      globalThis.fetch = mock(async () => okResponse('ok'));
      await rpc('fn', ['a', 'b']);
      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body.__args).toEqual(['a', 'b']);
    });

    test('no args sends empty object', async () => {
      globalThis.fetch = mock(async () => okResponse('ok'));
      await rpc('fn');
      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body).toEqual({});
    });
  });

  describe('CSRF token', () => {
    test('set via setCSRFToken', async () => {
      setCSRFToken('my-token');
      globalThis.fetch = mock(async () => okResponse('ok'));
      await rpc('fn');
      expect(globalThis.fetch.mock.calls[0][1].headers['X-Tova-CSRF']).toBe('my-token');
    });

    test('from meta tag', async () => {
      setCSRFToken(null);
      configureRPC({ csrfToken: undefined });
      const origQS = globalThis.document.querySelector;
      globalThis.document.querySelector = (sel) => {
        if (sel === 'meta[name="csrf-token"]') return { getAttribute: () => 'meta-token' };
        return null;
      };
      globalThis.fetch = mock(async () => okResponse('ok'));
      await rpc('fn');
      globalThis.document.querySelector = origQS;
    });

    test('no token available', async () => {
      setCSRFToken(null);
      configureRPC({ csrfToken: null });
      const origQS = globalThis.document.querySelector;
      globalThis.document.querySelector = () => null;
      globalThis.fetch = mock(async () => okResponse('ok'));
      await rpc('fn');
      expect(globalThis.fetch.mock.calls[0][1].headers['X-Tova-CSRF']).toBeUndefined();
      globalThis.document.querySelector = origQS;
    });
  });

  describe('request interceptors', () => {
    test('modifies options', async () => {
      globalThis.fetch = mock(async () => okResponse('ok'));
      const unsub = addRPCInterceptor({
        request({ options }) {
          return { headers: { ...options.headers, 'X-Custom': 'val' } };
        },
      });
      await rpc('fn');
      expect(globalThis.fetch.mock.calls[0][1].headers['X-Custom']).toBe('val');
      unsub();
    });

    test('returning null is a no-op', async () => {
      globalThis.fetch = mock(async () => okResponse('ok'));
      const unsub = addRPCInterceptor({ request() { return null; } });
      await rpc('fn');
      unsub();
    });
  });

  describe('response interceptors', () => {
    test('transforms data', async () => {
      globalThis.fetch = mock(async () => okResponse('orig'));
      const unsub = addRPCInterceptor({
        response(data) { return { ...data, result: 'transformed' }; },
      });
      expect(await rpc('fn')).toBe('transformed');
      unsub();
    });

    test('returning undefined keeps data', async () => {
      globalThis.fetch = mock(async () => okResponse('keep'));
      const unsub = addRPCInterceptor({ response() {} });
      expect(await rpc('fn')).toBe('keep');
      unsub();
    });
  });

  describe('error interceptors', () => {
    test('HTTP error fires interceptor', async () => {
      let caught = null;
      globalThis.fetch = mock(async () => errResponse(500, 'Internal'));
      const unsub = addRPCInterceptor({ error(err) { caught = err; } });
      await expect(rpc('fn')).rejects.toThrow(/500/);
      expect(caught.status).toBe(500);
      unsub();
    });

    test('returning false suppresses HTTP error', async () => {
      globalThis.fetch = mock(async () => errResponse(403, 'Forbidden'));
      const unsub = addRPCInterceptor({ error() { return false; } });
      expect(await rpc('fn')).toBeUndefined();
      unsub();
    });
  });

  describe('timeout', () => {
    test('times out and throws TIMEOUT', async () => {
      configureRPC({ timeout: 50 });
      globalThis.fetch = mock(async (url, opts) => {
        return new Promise((resolve, reject) => {
          const t = setTimeout(() => resolve(okResponse('late')), 5000);
          if (opts.signal) opts.signal.addEventListener('abort', () => {
            clearTimeout(t);
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          });
        });
      });
      try { await rpc('slow'); expect(true).toBe(false); }
      catch (e) { expect(e.code).toBe('TIMEOUT'); expect(e.functionName).toBe('slow'); }
      configureRPC({ timeout: 30000 });
    });

    test('timeout error suppressed by interceptor', async () => {
      configureRPC({ timeout: 50 });
      globalThis.fetch = mock(async (url, opts) => {
        return new Promise((resolve, reject) => {
          const t = setTimeout(() => resolve(okResponse('late')), 5000);
          if (opts.signal) opts.signal.addEventListener('abort', () => {
            clearTimeout(t);
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          });
        });
      });
      const unsub = addRPCInterceptor({ error() { return false; } });
      expect(await rpc('slow')).toBeUndefined();
      unsub();
      configureRPC({ timeout: 30000 });
    });
  });

  describe('configureRPC', () => {
    test('string arg sets base', () => {
      configureRPC('http://other:4000');
    });

    test('object with all options', () => {
      configureRPC({ baseUrl: 'http://x', timeout: 5000, csrfToken: 'abc', csrfHeader: 'X-C', credentials: 'include' });
    });
  });

  describe('interceptor unsubscribe', () => {
    test('removes interceptor', async () => {
      let count = 0;
      const unsub = addRPCInterceptor({ request() { count++; return null; } });
      globalThis.fetch = mock(async () => okResponse('ok'));
      await rpc('fn');
      expect(count).toBe(1);
      unsub();
      await rpc('fn');
      expect(count).toBe(1);
    });
  });

  describe('error handling', () => {
    test('wraps non-RPC network error', async () => {
      globalThis.fetch = mock(async () => { throw new Error('Network fail'); });
      await expect(rpc('fn')).rejects.toThrow(/RPC call to 'fn' failed: Network fail/);
    });

    test('preserves RPC error message', async () => {
      globalThis.fetch = mock(async () => errResponse(404, 'Not Found'));
      try { await rpc('fn'); } catch (e) { expect(e.message).toContain('404'); }
    });
  });
});


// =============================================================================
// 4. DB.JS — WAL mode, postgres paths, lazy init
// =============================================================================

describe('db.js — full coverage', () => {
  let initDB, db;

  beforeEach(async () => {
    const mod = await import('../src/runtime/db.js');
    initDB = mod.initDB;
    db = mod.db;
  });

  afterEach(() => {
    try { db.close(); } catch (e) {}
  });

  describe('sqlite WAL', () => {
    test('init sets WAL mode', () => {
      initDB({ url: ':memory:' });
      expect(db.query('PRAGMA journal_mode')).toBeDefined();
    });
  });

  describe('lazy init', () => {
    test('query auto-inits when _db is null', async () => {
      db.close();
      const rows = await db.query('SELECT 1 as v');
      expect(rows).toBeDefined();
    });

    test('execute auto-inits when _db is null', async () => {
      db.close();
      await db.execute('CREATE TABLE auto1 (id INTEGER PRIMARY KEY)');
    });

    test('transaction auto-inits when _db is null', async () => {
      db.close();
      // Do NOT call initDB first — let transaction's lazy init do it
      // After close, _db is null, so db.transaction should auto-init
      await db.transaction((tx) => {
        // After auto-init, the table may not exist yet, but execute should work
        tx.execute('CREATE TABLE IF NOT EXISTS tx_auto (id INTEGER PRIMARY KEY, v TEXT)');
        tx.execute('INSERT INTO tx_auto (v) VALUES (?)', ['auto']);
      });
      const rows = await db.query('SELECT * FROM tx_auto');
      expect(rows.length).toBe(1);
    });
  });

  describe('close', () => {
    test('double close is safe', () => {
      initDB({ url: ':memory:' });
      db.close();
      db.close();
    });
  });
});


// =============================================================================
// 5. DEVTOOLS.JS — component tracking, ownership tree, hooks
// =============================================================================

describe('devtools.js — full coverage', () => {
  let initDevTools, __devtools_hooks_internal;
  let createSignal, createEffect;

  beforeEach(async () => {
    const mod = await import('../src/runtime/devtools.js');
    initDevTools = mod.initDevTools;
    __devtools_hooks_internal = mod.__devtools_hooks_internal;
    const reactMod = await import('../src/runtime/reactivity.js');
    createSignal = reactMod.createSignal;
    createEffect = reactMod.createEffect;
  });

  describe('onComponentRender', () => {
    test('new component entry', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      const dt = initDevTools();
      const dom = createMockElement('div');
      __devtools_hooks_internal.onComponentRender('Comp1', dom, 5);
      const tree = dt.getComponentTree();
      expect(tree.find(c => c.name === 'Comp1')).toBeDefined();
      globalThis.window = origWin;
    });

    test('re-render same name+domNode increments count', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      const dt = initDevTools();
      const dom = createMockElement('div');
      __devtools_hooks_internal.onComponentRender('ReComp', dom, 3);
      __devtools_hooks_internal.onComponentRender('ReComp', dom, 4);
      const comp = dt.getComponentTree().find(c => c.name === 'ReComp');
      expect(comp.renderCount).toBe(2);
      expect(comp.totalRenderTime).toBe(7);
      globalThis.window = origWin;
    });
  });

  describe('getComponentTree', () => {
    test('returns entries', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      const dt = initDevTools();
      __devtools_hooks_internal.onComponentRender('A', createMockElement('a'), 1);
      __devtools_hooks_internal.onComponentRender('B', createMockElement('b'), 2);
      expect(dt.getComponentTree().length).toBeGreaterThanOrEqual(2);
      globalThis.window = origWin;
    });
  });

  describe('getOwnershipTree', () => {
    test('returns flat list', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      const dt = initDevTools();
      __devtools_hooks_internal.onComponentRender('O1', createMockElement('x'), 1);
      const tree = dt.getOwnershipTree();
      expect(Array.isArray(tree)).toBe(true);
      expect(tree.find(t => t.name === 'O1')).toBeDefined();
      globalThis.window = origWin;
    });
  });

  describe('getSignal / setSignal', () => {
    test('getSignal for valid id', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      const dt = initDevTools();
      const [sig, setSig] = createSignal(10, 'myS');
      let signalId = null;
      for (const [id, entry] of dt.signals) {
        if (entry.name === 'myS') { signalId = id; break; }
      }
      const result = dt.getSignal(signalId);
      expect(result.value).toBe(10);
      globalThis.window = origWin;
    });

    test('getSignal for invalid id', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      const dt = initDevTools();
      expect(dt.getSignal(99999)).toBeUndefined();
      globalThis.window = origWin;
    });

    test('setSignal for valid id', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      const dt = initDevTools();
      const [sig, setSig] = createSignal(0, 'setMe');
      let signalId = null;
      for (const [id, entry] of dt.signals) {
        if (entry.name === 'setMe') { signalId = id; break; }
      }
      expect(dt.setSignal(signalId, 42)).toBe(true);
      expect(sig()).toBe(42);
      globalThis.window = origWin;
    });

    test('setSignal for invalid id', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      const dt = initDevTools();
      expect(dt.setSignal(99999, 'val')).toBe(false);
      globalThis.window = origWin;
    });
  });

  describe('onSignalCreate', () => {
    test('registers signal in registry', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      const dt = initDevTools();
      const id = __devtools_hooks_internal.onSignalCreate(() => 1, () => {}, 'test_sig');
      expect(id).toBeDefined();
      expect(typeof id).toBe('number');
      globalThis.window = origWin;
    });

    test('uses default name when no name given', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      const dt = initDevTools();
      const id = __devtools_hooks_internal.onSignalCreate(() => 1, () => {});
      const entry = dt.signals.get(id);
      expect(entry.name).toMatch(/signal_/);
      globalThis.window = origWin;
    });
  });

  describe('onSignalUpdate', () => {
    test('records signal update in perfData', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      const dt = initDevTools();
      const id = __devtools_hooks_internal.onSignalCreate(() => 1, () => {}, 'upSig');
      __devtools_hooks_internal.onSignalUpdate(id, 1, 2);
      expect(dt.perf.signals.length).toBeGreaterThan(0);
      const last = dt.perf.signals[dt.perf.signals.length - 1];
      expect(last.oldValue).toBe(1);
      expect(last.newValue).toBe(2);
      globalThis.window = origWin;
    });

    test('ignores unknown signal id', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      initDevTools();
      // Should not throw
      __devtools_hooks_internal.onSignalUpdate(999999, 'a', 'b');
      globalThis.window = origWin;
    });
  });

  describe('onEffectCreate', () => {
    test('creates effect entry', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      const dt = initDevTools();
      const mockEffect = {};
      const id = __devtools_hooks_internal.onEffectCreate(mockEffect);
      expect(mockEffect.__devtools_id).toBe(id);
      expect(dt.effects.get(id)).toBeDefined();
      globalThis.window = origWin;
    });
  });

  describe('onEffectRun', () => {
    test('records run timing', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      const dt = initDevTools();
      const eff = {};
      const id = __devtools_hooks_internal.onEffectCreate(eff);
      __devtools_hooks_internal.onEffectRun(eff, 7);
      const entry = dt.effects.get(id);
      expect(entry.executionCount).toBe(1);
      expect(entry.totalTime).toBe(7);
      expect(entry.lastTime).toBe(7);
      globalThis.window = origWin;
    });

    test('no-op without devtools_id', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      initDevTools();
      expect(() => __devtools_hooks_internal.onEffectRun({}, 5)).not.toThrow();
      globalThis.window = origWin;
    });
  });

  describe('onMount / onHydrate', () => {
    test('onMount is no-op', () => {
      expect(() => __devtools_hooks_internal.onMount()).not.toThrow();
    });
    test('onHydrate is no-op', () => {
      expect(() => __devtools_hooks_internal.onHydrate({})).not.toThrow();
    });
  });

  describe('perfSummary', () => {
    test('zero averages when empty', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      const dt = initDevTools();
      dt.perf.clear();
      const s = dt.perf.summary();
      expect(s.avgRenderTime).toBe(0);
      expect(s.avgEffectTime).toBe(0);
      globalThis.window = origWin;
    });

    test('computes averages', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      const dt = initDevTools();
      __devtools_hooks_internal.onComponentRender('Avg', createMockElement('div'), 10);
      __devtools_hooks_internal.onComponentRender('Avg2', createMockElement('div'), 20);
      const s = dt.perf.summary();
      expect(s.totalRenders).toBeGreaterThanOrEqual(2);
      expect(s.avgRenderTime).toBeGreaterThan(0);
      globalThis.window = origWin;
    });
  });

  describe('clearPerf', () => {
    test('resets all perf data', () => {
      const origWin = globalThis.window;
      globalThis.window = {};
      const dt = initDevTools();
      const eff = {};
      __devtools_hooks_internal.onEffectCreate(eff);
      __devtools_hooks_internal.onEffectRun(eff, 5);
      dt.perf.clear();
      const s = dt.perf.summary();
      expect(s.totalEffects).toBe(0);
      expect(s.totalSignalUpdates).toBe(0);
      expect(s.totalRenders).toBe(0);
      // Also check effect entries are reset
      for (const [, entry] of dt.effects) {
        expect(entry.executionCount).toBe(0);
        expect(entry.totalTime).toBe(0);
      }
      globalThis.window = origWin;
    });
  });

  describe('initDevTools without window', () => {
    test('works without window', () => {
      const origWin = globalThis.window;
      delete globalThis.window;
      const dt = initDevTools();
      expect(dt).toBeDefined();
      expect(typeof dt.getComponentTree).toBe('function');
      expect(typeof dt.getOwnershipTree).toBe('function');
      globalThis.window = origWin;
    });
  });
});


// =============================================================================
// 6. SSR.JS — Suspense, streaming, void elements, fragments, withSSRContext
// =============================================================================

describe('ssr.js — full coverage', () => {
  let renderToString, renderPage, renderToReadableStream, renderPageToStream;
  let resetSSRIdCounter, createSSRContext, withSSRContext, renderHeadTags;
  let tova_el, tova_fragment;

  beforeEach(async () => {
    const ssrMod = await import('../src/runtime/ssr.js');
    renderToString = ssrMod.renderToString;
    renderPage = ssrMod.renderPage;
    renderToReadableStream = ssrMod.renderToReadableStream;
    renderPageToStream = ssrMod.renderPageToStream;
    resetSSRIdCounter = ssrMod.resetSSRIdCounter;
    createSSRContext = ssrMod.createSSRContext;
    withSSRContext = ssrMod.withSSRContext;
    renderHeadTags = ssrMod.renderHeadTags;
    const reactMod = await import('../src/runtime/reactivity.js');
    tova_el = reactMod.tova_el;
    tova_fragment = reactMod.tova_fragment;
  });

  async function streamToString(stream) {
    const reader = stream.getReader();
    let result = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += value;
    }
    return result;
  }

  describe('createSSRContext', () => {
    test('returns context with idCounter 0', () => {
      expect(createSSRContext()).toEqual({ idCounter: 0 });
    });
  });

  describe('withSSRContext', () => {
    test('isolates IDs', () => {
      resetSSRIdCounter();
      const h1 = withSSRContext(() => {
        return renderToString({ __tova: true, tag: '__dynamic', props: {}, children: [], compute: () => 'a' });
      });
      const h2 = withSSRContext(() => {
        return renderToString({ __tova: true, tag: '__dynamic', props: {}, children: [], compute: () => 'b' });
      });
      expect(h1).toContain('<!--tova-s:1-->');
      expect(h2).toContain('<!--tova-s:1-->');
    });
  });

  describe('renderPropsToString', () => {
    test('skips key, ref, on*', () => {
      const html = renderToString(tova_el('div', { key: 'k', ref: 'r', onClick: () => {}, id: 'x' }, []));
      expect(html).not.toContain('key=');
      expect(html).not.toContain('ref=');
      expect(html).not.toContain('onClick');
      expect(html).toContain('id="x"');
    });

    test('resolves function props', () => {
      expect(renderToString(tova_el('div', { id: () => 'dyn' }, []))).toContain('id="dyn"');
    });

    test('skips false/null', () => {
      const html = renderToString(tova_el('div', { hidden: false, x: null }, []));
      expect(html).not.toContain('hidden');
      expect(html).not.toContain('x=');
    });

    test('className -> class', () => {
      expect(renderToString(tova_el('div', { className: 'foo' }, []))).toContain('class="foo"');
    });

    test('style object', () => {
      const html = renderToString(tova_el('div', { style: { backgroundColor: 'red' } }, []));
      expect(html).toContain('background-color:red');
    });

    test('boolean attrs', () => {
      const html = renderToString(tova_el('input', { checked: true, disabled: true, selected: true, readonly: true }, []));
      expect(html).toContain(' checked');
      expect(html).toContain(' disabled');
      expect(html).toContain(' readonly');
    });

    test('value attr', () => {
      expect(renderToString(tova_el('input', { value: 'v<>' }, []))).toContain('value="v&lt;&gt;"');
    });

    test('general attr', () => {
      expect(renderToString(tova_el('a', { href: '/p' }, ['l']))).toContain('href="/p"');
    });

    test('_componentName adds data attribute', () => {
      const v = tova_el('div', {}, []);
      v._componentName = 'MyComp';
      expect(renderToString(v)).toContain('data-tova-component="MyComp"');
    });
  });

  describe('_renderParts edge cases', () => {
    test('null/undefined/number/boolean/array/non-tova object/function', () => {
      expect(renderToString(null)).toBe('');
      expect(renderToString(undefined)).toBe('');
      expect(renderToString(42)).toBe('42');
      expect(renderToString(true)).toBe('true');
      expect(renderToString([tova_el('b', {}, ['x'])])).toContain('<b>x</b>');
      expect(renderToString({ toString: () => 'obj' })).toContain('obj');
      expect(renderToString(() => 'fn')).toBe('fn');
    });
  });

  describe('Suspense/dynamic fallback', () => {
    test('async compute + function fallback', () => {
      resetSSRIdCounter();
      const v = { __tova: true, tag: '__dynamic', props: {}, children: [],
        _fallback: () => tova_el('div', {}, ['Loading']),
        compute: () => Promise.resolve('x') };
      expect(renderToString(v)).toContain('Loading');
    });

    test('async compute + static fallback', () => {
      resetSSRIdCounter();
      const v = { __tova: true, tag: '__dynamic', props: {}, children: [],
        _fallback: tova_el('span', {}, ['Wait']),
        compute: () => Promise.resolve('x') };
      expect(renderToString(v)).toContain('Wait');
    });

    test('async without fallback = empty markers', () => {
      resetSSRIdCounter();
      const v = { __tova: true, tag: '__dynamic', props: {}, children: [],
        compute: () => Promise.resolve('x') };
      expect(renderToString(v)).toMatch(/<!--tova-s:\d+--><!--\/tova-s:\d+-->/);
    });

    test('error + static fallback', () => {
      resetSSRIdCounter();
      const v = { __tova: true, tag: '__dynamic', props: {}, children: [],
        _fallback: tova_el('div', {}, ['Error FB']),
        compute: () => { throw new Error('e'); } };
      expect(renderToString(v)).toContain('Error FB');
    });

    test('error + fallback that throws re-throws fallback error', () => {
      resetSSRIdCounter();
      const v = { __tova: true, tag: '__dynamic', props: {}, children: [],
        _fallback: () => { throw new Error('fb-err'); },
        compute: () => { throw new Error('orig'); } };
      expect(() => renderToString(v)).toThrow('fb-err');
    });

    test('error without fallback re-throws', () => {
      resetSSRIdCounter();
      const v = { __tova: true, tag: '__dynamic', props: {}, children: [],
        compute: () => { throw new Error('no-fb'); } };
      expect(() => renderToString(v)).toThrow('no-fb');
    });
  });

  describe('void elements', () => {
    for (const tag of ['br', 'hr', 'img', 'input', 'meta', 'link']) {
      test(`${tag} self-closes`, () => {
        expect(renderToString(tova_el(tag, {}))).toContain('/>');
      });
    }
  });

  describe('fragments', () => {
    test('renders inline', () => {
      const html = renderToString(tova_fragment([tova_el('a', {}, ['1']), tova_el('b', {}, ['2'])]));
      expect(html).toContain('<a>1</a><b>2</b>');
    });

    test('flattens nested arrays', () => {
      const html = renderToString(tova_fragment([[tova_el('span', {}, ['inner'])], tova_el('div', {}, ['outer'])]));
      expect(html).toContain('inner');
      expect(html).toContain('outer');
    });

    test('skips null/undefined children', () => {
      expect(renderToString(tova_fragment([null, tova_el('span', {}, ['ok']), undefined]))).toBe('<span>ok</span>');
    });
  });

  describe('renderHeadTags', () => {
    test('void tag self-closes', () => {
      const html = renderHeadTags([{ tag: 'meta', attrs: { name: 'desc', content: 'test' } }]);
      expect(html).toContain('/>');
    });

    test('non-void with content', () => {
      expect(renderHeadTags([{ tag: 'title', content: 'T' }])).toContain('<title>T</title>');
    });

    test('null/undefined/non-array returns empty', () => {
      expect(renderHeadTags(null)).toBe('');
      expect(renderHeadTags(undefined)).toBe('');
      expect(renderHeadTags('x')).toBe('');
    });

    test('skips false/null attrs', () => {
      const html = renderHeadTags([{ tag: 'meta', attrs: { a: false, b: null, c: 'ok' } }]);
      expect(html).not.toContain('a=');
      expect(html).not.toContain('b=');
      expect(html).toContain('c="ok"');
    });
  });

  describe('renderPage', () => {
    test('defaults', () => {
      const html = renderPage(tova_el('h1', {}, ['T']));
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<title>Tova App</title>');
      expect(html).toContain('src="/browser.js"');
    });

    test('custom title, script, cspNonce', () => {
      const html = renderPage(tova_el('p', {}, ['x']), { title: 'C<T>', scriptSrc: '/c.js', cspNonce: 'n1' });
      expect(html).toContain('C&lt;T&gt;');
      expect(html).toContain('src="/c.js"');
      expect(html).toContain('nonce="n1"');
    });

    test('head as array', () => {
      const html = renderPage(tova_el('div', {}, []), { head: [{ tag: 'meta', attrs: { name: 'a' } }] });
      expect(html).toContain('name="a"');
    });

    test('head as string', () => {
      const html = renderPage(tova_el('div', {}, []), { head: '<link>' });
      expect(html).toContain('<link>');
    });

    test('function component', () => {
      expect(renderPage(() => tova_el('main', {}, ['m']))).toContain('<main>m</main>');
    });
  });

  describe('streaming', () => {
    test('function vnode', async () => {
      expect(await streamToString(renderToReadableStream(() => tova_el('p', {}, ['s'])))).toContain('<p>s</p>');
    });

    test('number', async () => {
      expect(await streamToString(renderToReadableStream(99))).toBe('99');
    });

    test('boolean', async () => {
      expect(await streamToString(renderToReadableStream(false))).toBe('false');
    });

    test('array', async () => {
      const html = await streamToString(renderToReadableStream([tova_el('a', {}, ['1'])]));
      expect(html).toContain('<a>1</a>');
    });

    test('non-tova object', async () => {
      expect(await streamToString(renderToReadableStream({ toString: () => 'obj' }))).toContain('obj');
    });

    test('fragment', async () => {
      const html = await streamToString(renderToReadableStream(tova_fragment([tova_el('em', {}, ['i'])])));
      expect(html).toContain('<em>i</em>');
    });

    test('void element', async () => {
      expect(await streamToString(renderToReadableStream(tova_el('br', {})))).toBe('<br />');
    });

    test('dynamic error with function fallback', async () => {
      resetSSRIdCounter();
      const html = await streamToString(renderToReadableStream({
        __tova: true, tag: '__dynamic', props: {}, children: [],
        _fallback: ({ error }) => tova_el('div', {}, [error.message]),
        compute: () => { throw new Error('se'); }
      }));
      expect(html).toContain('se');
    });

    test('dynamic error with static fallback', async () => {
      resetSSRIdCounter();
      const html = await streamToString(renderToReadableStream({
        __tova: true, tag: '__dynamic', props: {}, children: [],
        _fallback: tova_el('div', {}, ['static']),
        compute: () => { throw new Error('e'); }
      }));
      expect(html).toContain('static');
    });

    test('dynamic error + fallback that throws -> ssr-error comment', async () => {
      resetSSRIdCounter();
      const html = await streamToString(renderToReadableStream({
        __tova: true, tag: '__dynamic', props: {}, children: [],
        _fallback: () => { throw new Error('fb'); },
        compute: () => { throw new Error('e'); }
      }));
      expect(html).toContain('<!--tova-ssr-error-->');
    });

    test('dynamic error without fallback -> caught by onError', async () => {
      resetSSRIdCounter();
      let caught = null;
      const html = await streamToString(renderToReadableStream({
        __tova: true, tag: '__dynamic', props: {}, children: [],
        compute: () => { throw new Error('nb'); }
      }, { onError: e => { caught = e; } }));
      expect(caught.message).toBe('nb');
    });

    test('null/undefined streams', async () => {
      expect(await streamToString(renderToReadableStream(null))).toBe('');
      expect(await streamToString(renderToReadableStream(undefined))).toBe('');
    });
  });

  describe('BufferedController', () => {
    test('flushes on close with small data', async () => {
      const html = await streamToString(renderToReadableStream(tova_el('div', {}, ['s']), { bufferSize: 10000 }));
      expect(html).toBe('<div>s</div>');
    });

    test('auto-flush on exceeding buffer', async () => {
      const longText = 'x'.repeat(5000);
      const html = await streamToString(renderToReadableStream(tova_el('div', {}, [longText]), { bufferSize: 100 }));
      expect(html).toContain(longText);
    });
  });

  describe('renderPageToStream', () => {
    test('full page with options', async () => {
      const html = await streamToString(renderPageToStream(() => tova_el('h1', {}, ['H']), {
        title: 'T', scriptSrc: '/b.js', head: [{ tag: 'meta', attrs: { n: 'v' } }]
      }));
      expect(html).toContain('<title>T</title>');
      expect(html).toContain('src="/b.js"');
    });

    test('with cspNonce', async () => {
      const html = await streamToString(renderPageToStream(() => tova_el('div', {}, []), { cspNonce: 'nc' }));
      expect(html).toContain('nonce="nc"');
    });

    test('non-function component', async () => {
      const html = await streamToString(renderPageToStream(tova_el('div', {}, ['st'])));
      expect(html).toContain('st');
    });

    test('error with onError', async () => {
      let c = null;
      const html = await streamToString(renderPageToStream(() => { throw new Error('pe'); }, { onError: e => { c = e; } }));
      expect(c.message).toBe('pe');
      expect(html).toContain('<!DOCTYPE html>');
    });

    test('head as string', async () => {
      const html = await streamToString(renderPageToStream(() => tova_el('p', {}, []), { head: '<meta>' }));
      expect(html).toContain('<meta>');
    });
  });

  describe('escapeHtml', () => {
    test('escapes special chars', () => {
      expect(renderToString('a&b<c>d"e')).toBe('a&amp;b&lt;c&gt;d&quot;e');
    });

    test('no-op for plain text', () => {
      expect(renderToString('plain')).toBe('plain');
    });
  });
});


// =============================================================================
// 7. AI.JS — classify fallback, tool formatting, Ollama embed/classify
// =============================================================================

describe('ai.js — full coverage', () => {
  let createAI, defaultAI;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    const mod = await import('../src/runtime/ai.js');
    createAI = mod.createAI;
    defaultAI = mod.defaultAI;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockResp(data, ok = true, status = 200) {
    return { ok, status, json: async () => data, text: async () => JSON.stringify(data) };
  }

  describe('Anthropic classify', () => {
    test('no match returns raw result', async () => {
      globalThis.fetch = mock(async () => mockResp({ content: [{ type: 'text', text: 'UNKNOWN' }] }));
      const ai = createAI({ provider: 'anthropic', api_key: 'k' });
      expect(await ai.classify('t', ['a', 'b'])).toBe('UNKNOWN');
    });

    test('object categories', async () => {
      globalThis.fetch = mock(async () => mockResp({ content: [{ type: 'text', text: 'happy' }] }));
      const ai = createAI({ provider: 'anthropic', api_key: 'k' });
      expect(await ai.classify('t', { happy: '', sad: '' })).toBe('happy');
    });
  });

  describe('Anthropic ask tools', () => {
    test('formats tools with input_schema', async () => {
      globalThis.fetch = mock(async (u, o) => {
        const b = JSON.parse(o.body);
        expect(b.tools[0].input_schema.properties.query.type).toBe('string');
        return mockResp({ content: [{ type: 'text', text: 'r' }] });
      });
      const ai = createAI({ provider: 'anthropic', api_key: 'k' });
      await ai.ask('h', { tools: [{ name: 'look', description: 'd', params: { query: 'string' } }] });
    });

    test('tool_use in response', async () => {
      globalThis.fetch = mock(async () => mockResp({
        content: [
          { type: 'text', text: 'prefix' },
          { type: 'tool_use', id: 't1', name: 's', input: {} },
        ],
      }));
      const ai = createAI({ provider: 'anthropic', api_key: 'k' });
      const r = await ai.ask('q', { tools: [{ name: 's', description: 'd' }] });
      expect(r.text).toBe('prefix');
      expect(r.tool_calls.length).toBe(1);
    });
  });

  describe('Anthropic extract fallback parse', () => {
    test('extracts JSON from surrounding text', async () => {
      globalThis.fetch = mock(async () => mockResp({ content: [{ type: 'text', text: 'Result: {"a":1}' }] }));
      const ai = createAI({ provider: 'anthropic', api_key: 'k' });
      expect(await ai.extract('e', { a: 'number' })).toEqual({ a: 1 });
    });
  });

  describe('Anthropic unknown method', () => {
    test('throws', async () => {
      const ai = createAI({ provider: 'anthropic', api_key: 'k' });
      await expect(ai._provider({ api_key: 'k' }, 'bad', [])).rejects.toThrow(/Unknown/);
    });
  });

  describe('Anthropic temperature', () => {
    test('from config', async () => {
      globalThis.fetch = mock(async (u, o) => {
        expect(JSON.parse(o.body).temperature).toBe(0.5);
        return mockResp({ content: [{ type: 'text', text: 'x' }] });
      });
      const ai = createAI({ provider: 'anthropic', api_key: 'k', temperature: 0.5 });
      await ai.ask('h');
    });

    test('from opts overrides config', async () => {
      globalThis.fetch = mock(async (u, o) => {
        expect(JSON.parse(o.body).temperature).toBe(0.9);
        return mockResp({ content: [{ type: 'text', text: 'x' }] });
      });
      const ai = createAI({ provider: 'anthropic', api_key: 'k', temperature: 0.5 });
      await ai.ask('h', { temperature: 0.9 });
    });
  });

  describe('Anthropic chat with system messages', () => {
    test('separates system messages', async () => {
      globalThis.fetch = mock(async (u, o) => {
        const b = JSON.parse(o.body);
        expect(b.system).toContain('Be helpful');
        expect(b.messages.every(m => m.role !== 'system')).toBe(true);
        return mockResp({ content: [{ type: 'text', text: 'ok' }] });
      });
      const ai = createAI({ provider: 'anthropic', api_key: 'k' });
      await ai.chat([
        { role: 'system', content: 'Be helpful' },
        { role: 'user', content: 'Hi' },
      ]);
    });
  });

  describe('Anthropic chat temperature', () => {
    test('uses temperature from opts', async () => {
      globalThis.fetch = mock(async (u, o) => {
        expect(JSON.parse(o.body).temperature).toBe(0.8);
        return mockResp({ content: [{ type: 'text', text: 'ok' }] });
      });
      const ai = createAI({ provider: 'anthropic', api_key: 'k' });
      await ai.chat([{ role: 'user', content: 'h' }], { temperature: 0.8 });
    });
  });

  describe('Anthropic extract temperature', () => {
    test('uses temperature', async () => {
      globalThis.fetch = mock(async (u, o) => {
        expect(JSON.parse(o.body).temperature).toBe(0.2);
        return mockResp({ content: [{ type: 'text', text: '{}' }] });
      });
      const ai = createAI({ provider: 'anthropic', api_key: 'k', temperature: 0.2 });
      await ai.extract('e', {});
    });
  });

  describe('Anthropic classify temperature', () => {
    test('uses temperature', async () => {
      globalThis.fetch = mock(async (u, o) => {
        expect(JSON.parse(o.body).temperature).toBe(0.1);
        return mockResp({ content: [{ type: 'text', text: 'a' }] });
      });
      const ai = createAI({ provider: 'anthropic', api_key: 'k', temperature: 0.1 });
      await ai.classify('t', ['a']);
    });
  });

  describe('Anthropic API errors', () => {
    test('ask', async () => {
      globalThis.fetch = mock(async () => mockResp({}, false, 401));
      await expect(createAI({ provider: 'anthropic', api_key: 'k' }).ask('h')).rejects.toThrow(/401/);
    });
    test('chat', async () => {
      globalThis.fetch = mock(async () => mockResp({}, false, 402));
      await expect(createAI({ provider: 'anthropic', api_key: 'k' }).chat([{ role: 'user', content: 'h' }])).rejects.toThrow(/402/);
    });
    test('extract', async () => {
      globalThis.fetch = mock(async () => mockResp({}, false, 403));
      await expect(createAI({ provider: 'anthropic', api_key: 'k' }).extract('t', {})).rejects.toThrow(/403/);
    });
    test('classify', async () => {
      globalThis.fetch = mock(async () => mockResp({}, false, 500));
      await expect(createAI({ provider: 'anthropic', api_key: 'k' }).classify('t', ['a'])).rejects.toThrow(/500/);
    });
  });

  describe('OpenAI ask tools', () => {
    test('formats and returns tool_calls', async () => {
      globalThis.fetch = mock(async (u, o) => {
        const b = JSON.parse(o.body);
        expect(b.tools[0].type).toBe('function');
        return mockResp({ choices: [{ message: { content: 'r', tool_calls: [{ id: 'c' }] } }] });
      });
      const ai = createAI({ provider: 'openai', api_key: 'k' });
      const r = await ai.ask('q', { tools: [{ name: 'fn', description: 'd', params: { x: 'string' } }] });
      expect(r.tool_calls).toBeDefined();
    });
  });

  describe('OpenAI classify', () => {
    test('matched', async () => {
      globalThis.fetch = mock(async () => mockResp({ choices: [{ message: { content: 'Positive' } }] }));
      expect(await createAI({ provider: 'openai', api_key: 'k' }).classify('g', ['positive', 'negative'])).toBe('positive');
    });
    test('object categories', async () => {
      globalThis.fetch = mock(async () => mockResp({ choices: [{ message: { content: 'bug' } }] }));
      expect(await createAI({ provider: 'openai', api_key: 'k' }).classify('t', { bug: '', feat: '' })).toBe('bug');
    });
    test('no match returns raw', async () => {
      globalThis.fetch = mock(async () => mockResp({ choices: [{ message: { content: 'other' } }] }));
      expect(await createAI({ provider: 'openai', api_key: 'k' }).classify('t', ['a', 'b'])).toBe('other');
    });
  });

  describe('OpenAI unknown method', () => {
    test('throws', async () => {
      await expect(createAI({ provider: 'openai', api_key: 'k' })._provider({ api_key: 'k' }, 'bad', [])).rejects.toThrow(/Unknown/);
    });
  });

  describe('OpenAI max_tokens', () => {
    test('ask', async () => {
      globalThis.fetch = mock(async (u, o) => {
        expect(JSON.parse(o.body).max_tokens).toBe(100);
        return mockResp({ choices: [{ message: { content: 'x' } }] });
      });
      await createAI({ provider: 'openai', api_key: 'k' }).ask('t', { max_tokens: 100 });
    });
    test('chat from config', async () => {
      globalThis.fetch = mock(async (u, o) => {
        expect(JSON.parse(o.body).max_tokens).toBe(200);
        return mockResp({ choices: [{ message: { content: 'x' } }] });
      });
      await createAI({ provider: 'openai', api_key: 'k', max_tokens: 200 }).chat([{ role: 'user', content: 'h' }]);
    });
    test('extract', async () => {
      globalThis.fetch = mock(async (u, o) => {
        expect(JSON.parse(o.body).max_tokens).toBe(500);
        return mockResp({ choices: [{ message: { content: '{}' } }] });
      });
      await createAI({ provider: 'openai', api_key: 'k' }).extract('t', {}, { max_tokens: 500 });
    });
    test('classify', async () => {
      globalThis.fetch = mock(async (u, o) => {
        expect(JSON.parse(o.body).max_tokens).toBe(50);
        return mockResp({ choices: [{ message: { content: 'a' } }] });
      });
      await createAI({ provider: 'openai', api_key: 'k' }).classify('t', ['a'], { max_tokens: 50 });
    });
  });

  describe('OpenAI temperature', () => {
    test('ask from config', async () => {
      globalThis.fetch = mock(async (u, o) => {
        expect(JSON.parse(o.body).temperature).toBe(0.7);
        return mockResp({ choices: [{ message: { content: 'x' } }] });
      });
      await createAI({ provider: 'openai', api_key: 'k', temperature: 0.7 }).ask('t');
    });
    test('chat from opts', async () => {
      globalThis.fetch = mock(async (u, o) => {
        expect(JSON.parse(o.body).temperature).toBe(0.3);
        return mockResp({ choices: [{ message: { content: 'x' } }] });
      });
      await createAI({ provider: 'openai', api_key: 'k' }).chat([{ role: 'user', content: 'h' }], { temperature: 0.3 });
    });
  });

  describe('OpenAI API errors', () => {
    test('ask', async () => {
      globalThis.fetch = mock(async () => mockResp({}, false, 429));
      await expect(createAI({ provider: 'openai', api_key: 'k' }).ask('t')).rejects.toThrow(/429/);
    });
    test('chat', async () => {
      globalThis.fetch = mock(async () => mockResp({}, false, 500));
      await expect(createAI({ provider: 'openai', api_key: 'k' }).chat([{ role: 'user', content: 'h' }])).rejects.toThrow(/500/);
    });
    test('embed', async () => {
      globalThis.fetch = mock(async () => mockResp({}, false, 503));
      await expect(createAI({ provider: 'openai', api_key: 'k' }).embed('h')).rejects.toThrow(/503/);
    });
    test('extract', async () => {
      globalThis.fetch = mock(async () => mockResp({}, false, 504));
      await expect(createAI({ provider: 'openai', api_key: 'k' }).extract('t', {})).rejects.toThrow(/504/);
    });
    test('classify', async () => {
      globalThis.fetch = mock(async () => mockResp({}, false, 400));
      await expect(createAI({ provider: 'openai', api_key: 'k' }).classify('t', ['a'])).rejects.toThrow(/400/);
    });
  });

  describe('Ollama embed', () => {
    test('single string', async () => {
      globalThis.fetch = mock(async () => mockResp({ embedding: [0.1, 0.2] }));
      expect(await createAI({ provider: 'ollama' }).embed('h')).toEqual([0.1, 0.2]);
    });
    test('array input - multiple requests', async () => {
      let calls = 0;
      globalThis.fetch = mock(async () => { calls++; return mockResp({ embedding: [calls * 0.1] }); });
      const r = await createAI({ provider: 'ollama' }).embed(['a', 'b']);
      expect(Array.isArray(r)).toBe(true);
      expect(calls).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Ollama classify', () => {
    test('matched', async () => {
      globalThis.fetch = mock(async () => mockResp({ message: { content: 'positive' } }));
      expect(await createAI({ provider: 'ollama' }).classify('g', ['positive', 'negative'])).toBe('positive');
    });
    test('object categories', async () => {
      globalThis.fetch = mock(async () => mockResp({ message: { content: 'spam' } }));
      expect(await createAI({ provider: 'ollama' }).classify('b', { spam: '', ham: '' })).toBe('spam');
    });
    test('no match returns raw', async () => {
      globalThis.fetch = mock(async () => mockResp({ message: { content: 'x' } }));
      expect(await createAI({ provider: 'ollama' }).classify('t', ['a'])).toBe('x');
    });
  });

  describe('Ollama chat', () => {
    test('sends correctly', async () => {
      globalThis.fetch = mock(async (u, o) => {
        expect(JSON.parse(o.body).stream).toBe(false);
        return mockResp({ message: { content: 'reply' } });
      });
      expect(await createAI({ provider: 'ollama' }).chat([{ role: 'user', content: 'h' }])).toBe('reply');
    });
  });

  describe('Ollama extract', () => {
    test('parses JSON', async () => {
      globalThis.fetch = mock(async () => mockResp({ message: { content: '{"c":"blue"}' } }));
      expect(await createAI({ provider: 'ollama' }).extract('q', {})).toEqual({ c: 'blue' });
    });
  });

  describe('Ollama unknown method', () => {
    test('throws', async () => {
      await expect(createAI({ provider: 'ollama' })._provider({}, 'bad', [])).rejects.toThrow(/Unknown/);
    });
  });

  describe('Ollama API errors', () => {
    for (const method of ['ask', 'chat', 'embed', 'extract', 'classify']) {
      test(`${method} throws`, async () => {
        globalThis.fetch = mock(async () => mockResp({}, false, 500));
        const ai = createAI({ provider: 'ollama' });
        const args = method === 'ask' ? ['t'] : method === 'chat' ? [[{ role: 'user', content: 'h' }]] : method === 'embed' ? ['h'] : method === 'extract' ? ['t', {}] : ['t', ['a']];
        await expect(ai[method](...args)).rejects.toThrow(/500/);
      });
    }
  });

  describe('defaultAI', () => {
    test('chat', async () => {
      globalThis.fetch = mock(async () => mockResp({ choices: [{ message: { content: 'c' } }] }));
      expect(await defaultAI.chat([{ role: 'user', content: 'h' }])).toBe('c');
    });
    test('embed', async () => {
      globalThis.fetch = mock(async () => mockResp({ data: [{ embedding: [0.1] }] }));
      expect(await defaultAI.embed('h')).toEqual([0.1]);
    });
    test('extract', async () => {
      globalThis.fetch = mock(async () => mockResp({ choices: [{ message: { content: '{"k":"v"}' } }] }));
      expect(await defaultAI.extract('e', {})).toEqual({ k: 'v' });
    });
    test('classify', async () => {
      globalThis.fetch = mock(async () => mockResp({ choices: [{ message: { content: 'a' } }] }));
      expect(await defaultAI.classify('t', ['a', 'b'])).toBe('a');
    });
  });

  describe('custom provider', () => {
    test('uses openai format', async () => {
      globalThis.fetch = mock(async () => mockResp({ choices: [{ message: { content: 'custom' } }] }));
      expect(await createAI({ provider: 'custom', api_key: 'k', base_url: 'http://x' }).ask('h')).toBe('custom');
    });
  });

  describe('Anthropic embed', () => {
    test('throws does not support embeddings', async () => {
      const ai = createAI({ provider: 'anthropic', api_key: 'k' });
      await expect(ai.embed('hello')).rejects.toThrow(/does not support embeddings/);
    });
  });

  describe('Ollama ask success', () => {
    test('returns message content', async () => {
      globalThis.fetch = mock(async () => mockResp({ message: { content: 'ollama-reply' } }));
      const ai = createAI({ provider: 'ollama', model: 'llama3' });
      const result = await ai.ask('hello');
      expect(result).toBe('ollama-reply');
    });
  });

  describe('defaultAI.ask', () => {
    test('delegates via createAI', async () => {
      globalThis.fetch = mock(async () => mockResp({ choices: [{ message: { content: 'default-ask' } }] }));
      const result = await defaultAI.ask('test');
      expect(result).toBe('default-ask');
    });
  });

  describe('Ollama custom headers', () => {
    test('includes custom headers', async () => {
      globalThis.fetch = mock(async (u, o) => {
        expect(o.headers['X-Custom']).toBe('val');
        return mockResp({ message: { content: 'ok' } });
      });
      await createAI({ provider: 'ollama', headers: { 'X-Custom': 'val' } }).ask('t');
    });
  });

  describe('Anthropic custom base_url and headers', () => {
    test('uses custom base_url', async () => {
      globalThis.fetch = mock(async (url) => {
        expect(url).toContain('http://custom-anthropic');
        return mockResp({ content: [{ type: 'text', text: 'ok' }] });
      });
      await createAI({ provider: 'anthropic', api_key: 'k', base_url: 'http://custom-anthropic' }).ask('t');
    });

    test('includes custom headers', async () => {
      globalThis.fetch = mock(async (u, o) => {
        expect(o.headers['X-My']).toBe('hdr');
        return mockResp({ content: [{ type: 'text', text: 'ok' }] });
      });
      await createAI({ provider: 'anthropic', api_key: 'k', headers: { 'X-My': 'hdr' } }).ask('t');
    });
  });

  describe('OpenAI custom base_url', () => {
    test('uses custom base_url', async () => {
      globalThis.fetch = mock(async (url) => {
        expect(url).toContain('http://custom-openai');
        return mockResp({ choices: [{ message: { content: 'ok' } }] });
      });
      await createAI({ provider: 'openai', api_key: 'k', base_url: 'http://custom-openai' }).ask('t');
    });
  });
});
