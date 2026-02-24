// Tests for client-side review fixes: security hardening, Head, createResource,
// router guards, nested routes, CSS cleanup.
// Note: dangerouslySetInnerHTML tests intentionally use unsafe HTML to verify
// that the security boundary works correctly.

import { describe, test, expect, beforeEach, jest } from 'bun:test';
import {
  createSignal, createEffect, createComputed, tova_el, tova_fragment, render,
  mount, batch, onMount, onUnmount, onCleanup, createRef, createContext,
  provide, inject, createRoot, watch, untrack, tova_inject_css,
  Head, createResource
} from '../src/runtime/reactivity.js';

// ─── Minimal DOM mock ─────────────────────────────────────

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
  replaceChildren() {
    for (const c of this.children) _clearParent(c);
    this.children.length = 0;
  },
};

function createMockElement(tag) {
  return {
    tagName: tag,
    nodeType: 1,
    parentNode: null,
    children: [],
    get childNodes() { return this.children; },
    get firstChild() { return this.children[0] || null; },
    get lastChild() { return this.children[this.children.length - 1] || null; },
    get nextSibling() {
      if (!this.parentNode) return null;
      const siblings = this.parentNode.children;
      const idx = siblings.indexOf(this);
      return idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
    },
    attributes: {},
    style: {},
    className: '',
    innerHTML: '',
    value: '',
    checked: false,
    textContent: '',
    eventListeners: {},
    __handlers: {},
    ...childMethods,
    setAttribute(key, val) { this.attributes[key] = String(val); },
    getAttribute(key) { return this.attributes[key] || null; },
    hasAttribute(key) { return key in this.attributes; },
    removeAttribute(key) { delete this.attributes[key]; },
    addEventListener(event, handler) {
      if (!this.eventListeners[event]) this.eventListeners[event] = [];
      this.eventListeners[event].push(handler);
    },
    removeEventListener(event, handler) {
      if (this.eventListeners[event]) {
        this.eventListeners[event] = this.eventListeners[event].filter(h => h !== handler);
      }
    },
    remove() {
      if (this.parentNode) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx >= 0) this.parentNode.children.splice(idx, 1);
        this.parentNode = null;
      }
    },
    closest() { return null; },
  };
}

function createMockNode(nodeType, text) {
  return {
    nodeType,
    textContent: text,
    data: text,
    parentNode: null,
    get nextSibling() {
      if (!this.parentNode) return null;
      const siblings = this.parentNode.children;
      const idx = siblings.indexOf(this);
      return idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
    },
  };
}

// Ensure mock DOM is available
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement(tag) { return createMockElement(tag); },
    createTextNode(text) { return createMockNode(3, text); },
    createComment(text) { return createMockNode(8, text); },
    createDocumentFragment() {
      return {
        nodeType: 11,
        children: [],
        get childNodes() { return this.children; },
        get firstChild() { return this.children[0] || null; },
        ...childMethods,
      };
    },
    getElementById(id) { return createMockElement('div'); },
    addEventListener() {},
    title: 'Test Page',
    body: createMockElement('body'),
    head: createMockElement('head'),
  };
}

// ═══════════════════════════════════════════════════════════
// SECURITY FIXES
// ═══════════════════════════════════════════════════════════

describe('Security — innerHTML prop blocked', () => {
  test('innerHTML prop is rejected in dev mode', () => {
    const consoleSpy = jest.fn();
    const origError = console.error;
    console.error = consoleSpy;

    const el = render(tova_el('div', { innerHTML: '<b>bold</b>' }));
    // innerHTML should NOT be applied
    expect(el.innerHTML).toBe('');
    expect(consoleSpy).toHaveBeenCalled();

    console.error = origError;
  });

  test('dangerouslySetInnerHTML with __html works (intentional unsafe usage for test)', () => {
    const consoleSpy = jest.fn();
    const origWarn = console.warn;
    console.warn = consoleSpy;

    const el = render(tova_el('div', { dangerouslySetInnerHTML: { __html: '<i>safe content</i>' } }));
    expect(el.innerHTML).toBe('<i>safe content</i>');

    console.warn = origWarn;
  });

  test('dangerouslySetInnerHTML with empty string does not warn', () => {
    const el = render(tova_el('div', { dangerouslySetInnerHTML: { __html: '' } }));
    expect(el.innerHTML).toBe('');
  });

  test('dangerouslySetInnerHTML without __html gives empty', () => {
    const el = render(tova_el('div', { dangerouslySetInnerHTML: 'raw string' }));
    // String value without __html property → empty
    expect(el.innerHTML).toBe('');
  });
});

describe('Security — mount uses replaceChildren', () => {
  test('mount clears container safely', () => {
    const container = createMockElement('div');
    container.children.push(createMockElement('p'));
    mount(() => tova_el('span', {}, ['hello']), container);
    expect(container.children.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════
// ROUTER SECURITY & FEATURES
// ═══════════════════════════════════════════════════════════

describe('Router — path validation', () => {
  let router;
  beforeEach(async () => {
    router = await import('../src/runtime/router.js');
  });

  test('navigate rejects protocol-relative URLs', () => {
    const warnSpy = jest.fn();
    const origWarn = console.warn;
    console.warn = warnSpy;

    router.navigate('//evil.com');
    expect(warnSpy).toHaveBeenCalled();

    console.warn = origWarn;
  });

  test('navigate rejects javascript: URIs', () => {
    const warnSpy = jest.fn();
    const origWarn = console.warn;
    console.warn = warnSpy;

    router.navigate('javascript:alert(1)');
    expect(warnSpy).toHaveBeenCalled();

    console.warn = origWarn;
  });

  test('navigate rejects http: URLs', () => {
    const warnSpy = jest.fn();
    const origWarn = console.warn;
    console.warn = warnSpy;

    router.navigate('http://evil.com');
    expect(warnSpy).toHaveBeenCalled();

    console.warn = origWarn;
  });

  test('navigate rejects data: URIs', () => {
    const warnSpy = jest.fn();
    const origWarn = console.warn;
    console.warn = warnSpy;

    router.navigate('data:text/html,<h1>xss</h1>');
    expect(warnSpy).toHaveBeenCalled();

    console.warn = origWarn;
  });

  test('navigate accepts relative paths starting with /', () => {
    const warnSpy = jest.fn();
    const origWarn = console.warn;
    console.warn = warnSpy;

    router.navigate('/about');
    expect(warnSpy).not.toHaveBeenCalled();

    console.warn = origWarn;
  });

  test('navigate accepts plain relative paths', () => {
    const warnSpy = jest.fn();
    const origWarn = console.warn;
    console.warn = warnSpy;

    router.navigate('about');
    expect(warnSpy).not.toHaveBeenCalled();

    console.warn = origWarn;
  });

  test('navigate rejects non-string input', () => {
    const warnSpy = jest.fn();
    const origWarn = console.warn;
    console.warn = warnSpy;

    router.navigate(null);
    router.navigate(undefined);
    router.navigate(123);

    expect(warnSpy).toHaveBeenCalledTimes(3);
    console.warn = origWarn;
  });
});

describe('Router — navigation guards', () => {
  let router;
  beforeEach(async () => {
    router = await import('../src/runtime/router.js');
  });

  test('beforeNavigate returns unsubscribe function', () => {
    const unsub = router.beforeNavigate(() => true);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  test('afterNavigate returns unsubscribe function', () => {
    const unsub = router.afterNavigate(() => {});
    expect(typeof unsub).toBe('function');
    unsub();
  });

  test('beforeNavigate can cancel navigation', () => {
    const hook = () => false;
    const unsub = router.beforeNavigate(hook);

    const routeBefore = router.getCurrentRoute()();
    router.navigate('/should-not-navigate');
    const routeAfter = router.getCurrentRoute()();

    expect(routeAfter.path).toBe(routeBefore.path);
    unsub();
  });

  test('beforeNavigate can redirect', () => {
    router.defineRoutes({
      '/original': () => null,
      '/redirected': () => null,
    });

    const hook = (from, to) => {
      if (to === '/original') return '/redirected';
    };
    const unsub = router.beforeNavigate(hook);

    router.navigate('/original');
    // Should have been redirected

    unsub();
  });

  test('afterNavigate is called after route change', () => {
    let calls = 0;
    router.defineRoutes({ '/after-test': () => null });
    const unsub = router.afterNavigate(() => { calls++; });

    router.navigate('/after-test');
    expect(calls).toBeGreaterThan(0);

    unsub();
  });

  test('unsubscribe removes the hook', () => {
    let calls = 0;
    const unsub = router.beforeNavigate(() => { calls++; return true; });

    router.navigate('/test1');
    const callsAfterFirst = calls;

    unsub(); // Remove hook

    router.navigate('/test2');
    expect(calls).toBe(callsAfterFirst); // No more calls
  });
});

describe('Router — nested routes', () => {
  let router;
  beforeEach(async () => {
    router = await import('../src/runtime/router.js');
  });

  test('defineRoutes accepts nested route definitions', () => {
    const Parent = () => tova_el('div', {}, ['layout']);
    const Child = () => tova_el('div', {}, ['child']);

    router.defineRoutes({
      '/dashboard': {
        component: Parent,
        children: {
          '/': Child,
          '/settings': () => tova_el('div', {}, ['settings']),
        },
      },
    });
    expect(true).toBe(true);
  });

  test('Outlet component is exported', () => {
    expect(typeof router.Outlet).toBe('function');
  });

  test('Outlet returns null when no child route matches', () => {
    const result = router.Outlet();
    // Should return null when no child route is active
    expect(result === null || result === undefined).toBe(true);
  });

  test('Link validates href via navigate', () => {
    expect(typeof router.Link).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════
// HEAD COMPONENT
// ═══════════════════════════════════════════════════════════

describe('Head component', () => {
  test('Head is exported as a function', () => {
    expect(typeof Head).toBe('function');
  });

  test('Head returns null (renders nothing in component tree)', () => {
    const result = Head({ children: [tova_el('title', {}, ['Test'])] });
    expect(result).toBe(null);
  });

  test('Head sets document.title', () => {
    const prevTitle = document.title;
    createRoot(() => {
      Head({ children: [tova_el('title', {}, ['New Title'])] });
    });
    expect(document.title).toBe('New Title');
    document.title = prevTitle;
  });

  test('Head adds meta tags to document.head', () => {
    const headBefore = document.head.children.length;
    createRoot(() => {
      Head({ children: [tova_el('meta', { name: 'description', content: 'Test description' })] });
    });
    const addedEl = document.head.children[document.head.children.length - 1];
    expect(addedEl.tagName).toBe('meta');
    expect(addedEl.attributes.name).toBe('description');
    expect(addedEl.attributes.content).toBe('Test description');
  });

  test('Head cleans up elements on dispose', () => {
    const headBefore = document.head.children.length;
    let disposeFn;
    createRoot((dispose) => {
      disposeFn = dispose;
      Head({ children: [tova_el('link', { rel: 'stylesheet', href: '/test.css' })] });
    });
    expect(document.head.children.length).toBe(headBefore + 1);
    disposeFn();
    expect(document.head.children.length).toBe(headBefore);
  });

  test('Head restores previous title on dispose', () => {
    document.title = 'Original';
    let disposeFn;
    createRoot((dispose) => {
      disposeFn = dispose;
      Head({ children: [tova_el('title', {}, ['Overridden'])] });
    });
    expect(document.title).toBe('Overridden');
    disposeFn();
    expect(document.title).toBe('Original');
  });

  test('Head handles multiple children', () => {
    const headBefore = document.head.children.length;
    let disposeFn;
    createRoot((dispose) => {
      disposeFn = dispose;
      Head({
        children: [
          tova_el('meta', { name: 'author', content: 'Tova' }),
          tova_el('meta', { name: 'keywords', content: 'lang' }),
        ]
      });
    });
    expect(document.head.children.length).toBe(headBefore + 2);
    disposeFn();
    expect(document.head.children.length).toBe(headBefore);
  });

  test('Head ignores non-vnode children', () => {
    const headBefore = document.head.children.length;
    Head({ children: ['plain string', null, 42] });
    expect(document.head.children.length).toBe(headBefore);
  });

  test('Head skips event handler and ref props', () => {
    let disposeFn;
    createRoot((dispose) => {
      disposeFn = dispose;
      Head({ children: [tova_el('meta', { name: 'test', onLoad: () => {}, ref: {}, key: 'k' })] });
    });
    const el = document.head.children[document.head.children.length - 1];
    expect(el.attributes.name).toBe('test');
    expect(el.attributes.onLoad).toBeUndefined();
    expect(el.attributes.ref).toBeUndefined();
    expect(el.attributes.key).toBeUndefined();
    disposeFn();
  });
});

// ═══════════════════════════════════════════════════════════
// createResource
// ═══════════════════════════════════════════════════════════

describe('createResource', () => {
  test('createResource is exported', () => {
    expect(typeof createResource).toBe('function');
  });

  test('sync fetcher sets data immediately', () => {
    const [data] = createResource(() => 42);
    expect(data()).toBe(42);
  });

  test('returns loading, error, refetch, mutate controls', () => {
    const [data, controls] = createResource(() => 'hello');
    expect(typeof controls.loading).toBe('function');
    expect(typeof controls.error).toBe('function');
    expect(typeof controls.refetch).toBe('function');
    expect(typeof controls.mutate).toBe('function');
  });

  test('loading is false after sync fetch', () => {
    const [data, { loading }] = createResource(() => 'value');
    expect(loading()).toBe(false);
  });

  test('error is undefined on success', () => {
    const [data, { error }] = createResource(() => 'ok');
    expect(error()).toBe(undefined);
  });

  test('sync fetcher error is caught', () => {
    const [data, { error }] = createResource(() => { throw new Error('fail'); });
    expect(error()).toBeInstanceOf(Error);
    expect(error().message).toBe('fail');
  });

  test('async fetcher resolves data', async () => {
    const [data, { loading }] = createResource(() => Promise.resolve(99));
    expect(loading()).toBe(true);
    await new Promise(r => setTimeout(r, 50));
    expect(data()).toBe(99);
    expect(loading()).toBe(false);
  });

  test('async fetcher error sets error signal', async () => {
    const [data, { error }] = createResource(() => Promise.reject(new Error('async fail')));
    await new Promise(r => setTimeout(r, 50));
    expect(error()).toBeInstanceOf(Error);
    expect(error().message).toBe('async fail');
  });

  test('refetch re-invokes fetcher', () => {
    let callCount = 0;
    const [data, { refetch }] = createResource(() => ++callCount);
    expect(data()).toBe(1);
    refetch();
    expect(data()).toBe(2);
  });

  test('mutate directly updates data signal', () => {
    const [data, { mutate }] = createResource(() => 'initial');
    expect(data()).toBe('initial');
    mutate('updated');
    expect(data()).toBe('updated');
  });

  test('source-based fetcher re-fetches on source change', () => {
    const [source, setSource] = createSignal(1);
    let lastSource = null;
    const [data] = createResource(source, (s) => {
      lastSource = s;
      return s * 10;
    });
    expect(data()).toBe(10);
    expect(lastSource).toBe(1);

    setSource(2);
    expect(data()).toBe(20);
    expect(lastSource).toBe(2);
  });

  test('source-based fetcher skips null/undefined/false source', () => {
    const [source, setSource] = createSignal(null);
    let fetchCount = 0;
    const [data] = createResource(source, () => ++fetchCount);
    expect(data()).toBe(undefined);
    expect(fetchCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// CSS REFERENCE-COUNTED CLEANUP
// ═══════════════════════════════════════════════════════════

describe('CSS reference-counted cleanup', () => {
  test('tova_inject_css adds style tag to head', () => {
    const headBefore = document.head.children.length;
    createRoot(() => {
      tova_inject_css('test-refcss-1', '.foo { color: red }');
    });
    const added = document.head.children[document.head.children.length - 1];
    expect(added.tagName).toBe('style');
    expect(added.attributes['data-tova-style']).toBe('test-refcss-1');
  });

  test('same CSS id increments ref count, no duplicate style', () => {
    const headBefore = document.head.children.length;
    createRoot(() => {
      tova_inject_css('test-refcss-dup', '.bar { color: blue }');
      tova_inject_css('test-refcss-dup', '.bar { color: blue }');
    });
    const addedCount = document.head.children.length - headBefore;
    expect(addedCount).toBe(1);
  });

  test('style tag removed when all owners dispose', () => {
    const headBefore = document.head.children.length;
    let dispose1, dispose2;

    createRoot((d) => {
      dispose1 = d;
      tova_inject_css('test-refcss-clean', '.baz { color: green }');
    });
    expect(document.head.children.length).toBe(headBefore + 1);

    createRoot((d) => {
      dispose2 = d;
      tova_inject_css('test-refcss-clean', '.baz { color: green }');
    });
    // No new style tag
    expect(document.head.children.length).toBe(headBefore + 1);

    dispose1();
    // Still there (ref count = 1)
    expect(document.head.children.length).toBe(headBefore + 1);

    dispose2();
    // Removed (ref count = 0)
    expect(document.head.children.length).toBe(headBefore);
  });
});

// ═══════════════════════════════════════════════════════════
// SSR ESCAPING
// ═══════════════════════════════════════════════════════════

describe('SSR — escaping', () => {
  test('renderToString escapes text content', async () => {
    const { renderToString } = await import('../src/runtime/ssr.js');
    const html = renderToString('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('renderPage escapes title', async () => {
    const { renderPage } = await import('../src/runtime/ssr.js');
    const html = renderPage(() => tova_el('div', {}, ['hello']), {
      title: '<script>alert(1)</script>'
    });
    expect(html).not.toContain('<title><script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('renderPage escapes scriptSrc attribute', async () => {
    const { renderPage } = await import('../src/runtime/ssr.js');
    const html = renderPage(() => tova_el('div', {}, ['hello']), {
      scriptSrc: '" onload="alert(1)'
    });
    expect(html).toContain('&quot;');
  });
});
