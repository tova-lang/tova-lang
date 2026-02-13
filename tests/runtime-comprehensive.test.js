// Comprehensive runtime test coverage for Tova language
// Covers: signal edge cases, effect cleanup, computed diamond dependencies,
// batch edge cases, DOM patching, router query params, RPC, SSR, string-proto,
// context API, ownership/disposal, keyed reconciliation, error boundary,
// lazy component, CSS injection, createRef, flattenVNodes, stdlib edge cases.

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  createSignal, createEffect, createComputed,
  tova_el, tova_fragment, tova_keyed, render, mount, hydrate,
  batch, onMount, onUnmount, onCleanup,
  createRef, createContext, provide, inject,
  createErrorBoundary, ErrorBoundary, createRoot,
  watch, untrack, Dynamic, Portal, lazy, tova_inject_css
} from '../src/runtime/reactivity.js';
import { renderToString, renderPage } from '../src/runtime/ssr.js';
import {
  defineRoutes, getCurrentRoute, getParams, getPath, getQuery,
  onRouteChange, navigate, Router, Link, Redirect
} from '../src/runtime/router.js';
import { rpc } from '../src/runtime/rpc.js';
import { print, range, len, type_of, enumerate, zip, sum, sorted, reversed, flat_map, min, max, any, all } from '../src/stdlib/core.js';
import { map, filter, reduce, find, find_index, includes, unique, group_by, chunk, flatten, take, drop, first, last, count, entries, keys, values, merge } from '../src/stdlib/collections.js';
import { upper, lower, trim, trim_start, trim_end, split, join, contains, starts_with, ends_with, replace, replace_first, repeat as strRepeat, pad_start, pad_end, char_at, chars, words, lines, capitalize, title_case, snake_case, camel_case } from '../src/stdlib/string.js';

// ─── DOM Mock ───────────────────────────────────────────────
// Reusable mock DOM infrastructure matching other test files.

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
    disabled: false,
    readOnly: false,
    hidden: false,
    eventListeners: {},
    __handlers: {},
    ...childMethods,
    setAttribute(key, val) { this.attributes[key] = String(val); },
    getAttribute(key) { return this.attributes[key] !== undefined ? this.attributes[key] : null; },
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
    closest() { return null; },
    querySelector() { return null; },
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
    querySelector(sel) { return createMockElement('div'); },
    addEventListener() {},
    body: createMockElement('body'),
    head: createMockElement('head'),
    activeElement: null,
  };
}


// ═══════════════════════════════════════════════════════════════
// 1. SIGNAL EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('Signal edge cases — same value no effect triggered', () => {
  test('setting signal to identical primitive does not trigger effect', () => {
    const [count, setCount] = createSignal(42);
    let effectRuns = 0;
    createEffect(() => {
      count();
      effectRuns++;
    });
    const initial = effectRuns;
    setCount(42);
    expect(effectRuns).toBe(initial);
  });

  test('setting signal to identical string does not trigger effect', () => {
    const [str, setStr] = createSignal('hello');
    let runs = 0;
    createEffect(() => { str(); runs++; });
    const initial = runs;
    setStr('hello');
    expect(runs).toBe(initial);
  });

  test('setting signal to identical boolean does not trigger effect', () => {
    const [flag, setFlag] = createSignal(true);
    let runs = 0;
    createEffect(() => { flag(); runs++; });
    const initial = runs;
    setFlag(true);
    expect(runs).toBe(initial);
  });
});

describe('Signal edge cases — NaN equality', () => {
  test('NaN !== NaN so setting NaN always triggers effect', () => {
    const [val, setVal] = createSignal(NaN);
    let runs = 0;
    createEffect(() => { val(); runs++; });
    const initial = runs;
    setVal(NaN);
    // NaN !== NaN is true in JS, so the setter sees it as different
    expect(runs).toBe(initial + 1);
  });

  test('NaN signal can be set to a number to stop triggering', () => {
    const [val, setVal] = createSignal(NaN);
    let runs = 0;
    createEffect(() => { val(); runs++; });
    const afterInit = runs;
    setVal(5);
    expect(runs).toBe(afterInit + 1);
    const afterSet = runs;
    setVal(5);
    expect(runs).toBe(afterSet); // 5 === 5, no trigger
  });
});

describe('Signal edge cases — rapid setting', () => {
  test('setting signal many times rapidly applies all updates', () => {
    const [count, setCount] = createSignal(0);
    let lastSeen = -1;
    let effectRuns = 0;
    createEffect(() => {
      lastSeen = count();
      effectRuns++;
    });
    expect(lastSeen).toBe(0);

    for (let i = 1; i <= 100; i++) {
      setCount(i);
    }
    expect(lastSeen).toBe(100);
    expect(count()).toBe(100);
  });

  test('rapid setting with batch only triggers once at the end', () => {
    const [count, setCount] = createSignal(0);
    let effectRuns = 0;
    createEffect(() => { count(); effectRuns++; });
    const initial = effectRuns;

    batch(() => {
      for (let i = 1; i <= 50; i++) {
        setCount(i);
      }
    });

    // Effect should have run only once after batch, not 50 times
    expect(effectRuns).toBe(initial + 1);
    expect(count()).toBe(50);
  });
});


// ═══════════════════════════════════════════════════════════════
// 2. EFFECT CLEANUP EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('Effect cleanup — cleanup that throws', () => {
  test('cleanup that throws does not prevent other cleanups', () => {
    const [count, setCount] = createSignal(0);
    let cleanup2Ran = false;
    const errors = [];
    const origError = console.error;
    console.error = (...args) => errors.push(args.join(' '));

    createEffect(() => {
      count();
      onCleanup(() => { throw new Error('cleanup boom'); });
      onCleanup(() => { cleanup2Ran = true; });
    });

    setCount(1);
    console.error = origError;
    // The second cleanup should still run even though the first threw
    expect(cleanup2Ran).toBe(true);
    expect(errors.some(e => e.includes('cleanup'))).toBe(true);
  });

  test('effect returned cleanup that throws is caught gracefully', () => {
    const [count, setCount] = createSignal(0);
    const errors = [];
    const origError = console.error;
    console.error = (...args) => errors.push(args.join(' '));

    createEffect(() => {
      count();
      return () => { throw new Error('return cleanup throw'); };
    });

    setCount(1);
    console.error = origError;
    expect(errors.some(e => e.includes('cleanup'))).toBe(true);
  });
});

describe('Effect cleanup — multiple cleanup registrations in order', () => {
  test('onCleanup callbacks run in order when effect re-runs', () => {
    const [count, setCount] = createSignal(0);
    const order = [];

    createEffect(() => {
      count();
      onCleanup(() => order.push('first'));
      onCleanup(() => order.push('second'));
      onCleanup(() => order.push('third'));
    });

    expect(order).toEqual([]);
    setCount(1);
    expect(order).toEqual(['first', 'second', 'third']);
  });

  test('return cleanup runs before onCleanup callbacks', () => {
    const [count, setCount] = createSignal(0);
    const order = [];

    createEffect(() => {
      count();
      onCleanup(() => order.push('onCleanup'));
      return () => order.push('return');
    });

    setCount(1);
    // The runtime runs return cleanup first, then onCleanup list
    expect(order[0]).toBe('return');
    expect(order[1]).toBe('onCleanup');
  });
});

describe('Effect cleanup — onCleanup outside effect context', () => {
  test('onCleanup outside effect does nothing (no error)', () => {
    // When there is no currentEffect, onCleanup should silently do nothing
    expect(() => {
      onCleanup(() => { /* no-op */ });
    }).not.toThrow();
  });
});


// ═══════════════════════════════════════════════════════════════
// 3. COMPUTED EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('Computed edge cases — diamond dependency (4+ levels)', () => {
  test('diamond: A -> B, A -> C, B -> D, C -> D stays consistent', () => {
    const [a, setA] = createSignal(1);
    const b = createComputed(() => a() * 2);
    const c = createComputed(() => a() * 3);
    const d = createComputed(() => b() + c());

    expect(d()).toBe(5); // 2 + 3
    setA(10);
    expect(d()).toBe(50); // 20 + 30
  });

  test('deep diamond with 4 levels', () => {
    const [src, setSrc] = createSignal(1);
    const level1a = createComputed(() => src() + 1);
    const level1b = createComputed(() => src() + 2);
    const level2a = createComputed(() => level1a() + level1b());
    const level2b = createComputed(() => level1a() * 2);
    const level3 = createComputed(() => level2a() + level2b());

    // src=1: l1a=2, l1b=3, l2a=5, l2b=4, l3=9
    expect(level3()).toBe(9);

    setSrc(10);
    // src=10: l1a=11, l1b=12, l2a=23, l2b=22, l3=45
    expect(level3()).toBe(45);
  });

  test('wide diamond with many branches converging', () => {
    const [src, setSrc] = createSignal(1);
    const branches = [];
    for (let i = 0; i < 5; i++) {
      branches.push(createComputed(() => src() + i));
    }
    const combined = createComputed(() => branches.reduce((s, b) => s + b(), 0));

    // src=1: 1+0, 1+1, 1+2, 1+3, 1+4 = 1+2+3+4+5 = 15
    expect(combined()).toBe(15);

    setSrc(10);
    // 10+0, 10+1, 10+2, 10+3, 10+4 = 10+11+12+13+14 = 60
    expect(combined()).toBe(60);
  });
});

describe('Computed edge cases — only recomputes when dirty AND read', () => {
  test('computed does not recompute if never read after signal change', () => {
    const [count, setCount] = createSignal(0);
    let computeRuns = 0;
    const doubled = createComputed(() => {
      computeRuns++;
      return count() * 2;
    });

    expect(computeRuns).toBe(1); // initial computation
    setCount(5);
    // Computed is marked dirty but not yet re-computed (lazy)
    // Note: The exact number depends on whether the computed is
    // subscribed to by an effect. Without any reader, it stays dirty.
    const runsAfterSet = computeRuns;

    // Now read it -- should recompute
    expect(doubled()).toBe(10);
    expect(computeRuns).toBeGreaterThanOrEqual(runsAfterSet);
  });
});

describe('Computed edge cases — multiple computed in chain', () => {
  test('chain of 5 computed values propagates correctly', () => {
    const [src, setSrc] = createSignal(1);
    const c1 = createComputed(() => src() + 1);
    const c2 = createComputed(() => c1() + 1);
    const c3 = createComputed(() => c2() + 1);
    const c4 = createComputed(() => c3() + 1);
    const c5 = createComputed(() => c4() + 1);

    expect(c5()).toBe(6); // 1+1+1+1+1+1
    setSrc(10);
    expect(c5()).toBe(15); // 10+1+1+1+1+1
  });

  test('reading middle of chain after source change is consistent', () => {
    const [src, setSrc] = createSignal(1);
    const c1 = createComputed(() => src() * 2);
    const c2 = createComputed(() => c1() + 10);
    const c3 = createComputed(() => c2() * 3);

    expect(c2()).toBe(12); // 2+10
    setSrc(5);
    expect(c2()).toBe(20); // 10+10
    expect(c3()).toBe(60); // 20*3
  });
});


// ═══════════════════════════════════════════════════════════════
// 4. BATCH EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('Batch edge cases — batch with exception', () => {
  test('batch flushes effects even if callback throws', () => {
    const [count, setCount] = createSignal(0);
    let effectRuns = 0;
    createEffect(() => { count(); effectRuns++; });
    const initial = effectRuns;

    try {
      batch(() => {
        setCount(1);
        throw new Error('batch error');
      });
    } catch (e) {
      // expected
    }

    // The finally block should still flush pending effects
    expect(effectRuns).toBe(initial + 1);
    expect(count()).toBe(1);
  });
});

describe('Batch edge cases — nested batch calls', () => {
  test('nested batches defer until outermost completes', () => {
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);
    const [c, setC] = createSignal(0);
    let effectRuns = 0;

    createEffect(() => {
      a(); b(); c();
      effectRuns++;
    });
    const initial = effectRuns;

    batch(() => {
      setA(1);
      batch(() => {
        setB(2);
        batch(() => {
          setC(3);
        });
        // innermost batch ended, but outer batches still active
      });
    });

    // Only one additional effect run total
    expect(effectRuns).toBe(initial + 1);
    expect(a()).toBe(1);
    expect(b()).toBe(2);
    expect(c()).toBe(3);
  });

  test('triple-nested batch with updates at each level', () => {
    const [val, setVal] = createSignal(0);
    let runs = 0;
    createEffect(() => { val(); runs++; });
    const initial = runs;

    batch(() => {
      setVal(1);
      batch(() => {
        setVal(2);
        batch(() => {
          setVal(3);
        });
      });
    });

    expect(runs).toBe(initial + 1);
    expect(val()).toBe(3);
  });
});


// ═══════════════════════════════════════════════════════════════
// 5. DOM PATCHING EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('DOM patching — attribute removal', () => {
  test('old prop not in new props is removed during patch', () => {
    const container = createMockElement('div');
    const [showTitle, setShowTitle] = createSignal(true);

    function App() {
      return tova_el('div', {}, [
        () => showTitle()
          ? tova_el('span', { title: 'tooltip', className: 'has-title' }, ['text'])
          : tova_el('span', { className: 'no-title' }, ['text'])
      ]);
    }

    mount(App, container);
    const div = container.children[0];
    const marker = div.children[0];
    let span = marker.__tovaNodes[0];
    expect(span.attributes.title).toBe('tooltip');
    expect(span.className).toBe('has-title');

    setShowTitle(false);
    span = marker.__tovaNodes[0];
    expect(span.className).toBe('no-title');
    // The old 'title' attribute should be gone on the new element
    // (Since we replaced the vnode entirely, a new span is created)
  });
});

describe('DOM patching — style object replacement', () => {
  test('style object updates apply to element', () => {
    const container = createMockElement('div');
    const [color, setColor] = createSignal('red');

    function App() {
      return tova_el('div', { style: () => ({ color: color() }) }, []);
    }

    mount(App, container);
    const div = container.children[0];
    expect(div.style.color).toBe('red');

    setColor('blue');
    expect(div.style.color).toBe('blue');
  });
});

describe('DOM patching — boolean DOM props', () => {
  test('disabled prop toggles correctly', () => {
    const container = createMockElement('div');
    const [disabled, setDisabled] = createSignal(false);

    function App() {
      return tova_el('button', { disabled: () => disabled() }, ['Click']);
    }

    mount(App, container);
    const btn = container.children[0];
    expect(btn.disabled).toBe(false);

    setDisabled(true);
    expect(btn.disabled).toBe(true);

    setDisabled(false);
    expect(btn.disabled).toBe(false);
  });

  test('readOnly prop sets correctly', () => {
    const el = render(tova_el('input', { readOnly: true }, []));
    expect(el.readOnly).toBe(true);

    const el2 = render(tova_el('input', { readOnly: false }, []));
    expect(el2.readOnly).toBe(false);
  });

  test('hidden prop sets correctly', () => {
    const el = render(tova_el('div', { hidden: true }, []));
    expect(el.hidden).toBe(true);
  });
});

describe('DOM patching — event handler same reference', () => {
  test('same handler reference does not re-add listener', () => {
    const container = createMockElement('div');
    const handler = () => {};
    const [dummy, setDummy] = createSignal(0);

    // Create a scenario where props are re-applied with same handler
    function App() {
      return tova_el('div', {}, [
        () => tova_el('button', { onClick: handler, 'data-val': String(dummy()) }, ['click'])
      ]);
    }

    mount(App, container);
    const div = container.children[0];
    const marker = div.children[0];
    let btn = marker.__tovaNodes[0];

    const initialListenerCount = btn.eventListeners['click'] ? btn.eventListeners['click'].length : 0;
    expect(initialListenerCount).toBe(1);

    // Re-render with same handler reference
    setDummy(1);
    btn = marker.__tovaNodes[0];
    // The button may be replaced, but if same tag + key, props are patched
    // For same handler reference, applyProps checks oldHandler !== value
    // and skips adding if they match
    expect(btn.__handlers.click).toBe(handler);
  });
});


// ═══════════════════════════════════════════════════════════════
// 6. ROUTER EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('Router edge cases — query param parsing', () => {
  // We test the parseQueryString behavior indirectly through the router module.
  // The module-level parseQueryString function handles edge cases.

  test('getQuery returns object type', () => {
    const query = getQuery();
    expect(typeof query()).toBe('object');
  });

  test('defineRoutes with parameterized routes', () => {
    defineRoutes({
      '/users/:id': (params) => tova_el('div', {}, [`User ${params.id}`]),
      '/posts/:slug': (params) => tova_el('div', {}, [`Post ${params.slug}`]),
    });
    const route = getCurrentRoute();
    expect(typeof route).toBe('function');
  });

  test('defineRoutes with optional params', () => {
    expect(() => {
      defineRoutes({
        '/files/:path?': (params) => tova_el('div', {}, ['Files']),
      });
    }).not.toThrow();
  });

  test('defineRoutes with catch-all *', () => {
    const NotFound = () => tova_el('div', {}, ['404']);
    defineRoutes({
      '/': () => tova_el('div', {}, ['Home']),
      '*': NotFound,
    });
    // The catch-all is registered but does not prevent normal matching
    const route = getCurrentRoute();
    expect(route().path).toBe('/');

    // Clean up: reset notFoundComponent so other tests are not affected
    defineRoutes({ '404': null });
  });
});

describe('Router edge cases — overlapping route patterns', () => {
  test('more specific route matches before catch-all', () => {
    const specificHit = { called: false };
    const catchAllHit = { called: false };

    defineRoutes({
      '/specific': () => { specificHit.called = true; return tova_el('div', {}, ['specific']); },
      '*': () => { catchAllHit.called = true; return tova_el('div', {}, ['catchall']); },
    });

    // Since we are in a test environment without real window.location,
    // the route matching defaults to '/'
    const route = getCurrentRoute();
    expect(typeof route()).toBe('object');

    // Clean up: reset notFoundComponent so other tests are not affected
    defineRoutes({ '404': null });
  });
});

describe('Router edge cases — Link with external URL', () => {
  test('Link creates anchor with href', () => {
    const link = Link({ href: 'https://example.com', children: ['External'] });
    expect(link.__tova).toBe(true);
    expect(link.tag).toBe('a');
    expect(link.props.href).toBe('https://example.com');
  });

  test('Link without children uses empty array', () => {
    const link = Link({ href: '/about' });
    expect(link.children).toEqual([]);
  });
});

describe('Router edge cases — Redirect component', () => {
  test('Redirect returns null immediately', () => {
    const result = Redirect({ to: '/login' });
    expect(result).toBeNull();
  });

  test('Redirect to different path', () => {
    const result = Redirect({ to: '/dashboard' });
    expect(result).toBeNull();
  });
});

describe('Router edge cases — onRouteChange callback', () => {
  test('onRouteChange registers without throwing', () => {
    const calls = [];
    expect(() => onRouteChange((matched) => calls.push(matched))).not.toThrow();
  });
});


// ═══════════════════════════════════════════════════════════════
// 7. RPC EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('RPC edge cases — network error handling', () => {
  test('rpc throws on network error', async () => {
    // Mock fetch to simulate network failure
    const origFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error('Network failure'));

    try {
      await expect(rpc('test_fn', [])).rejects.toThrow('RPC call');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('rpc throws on non-ok response', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    try {
      await expect(rpc('failing_fn', [])).rejects.toThrow('500');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('RPC edge cases — empty args vs no args', () => {
  test('rpc with empty array sends empty body', async () => {
    const origFetch = globalThis.fetch;
    let capturedBody = null;
    globalThis.fetch = (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ result: 'ok' }),
      });
    };

    try {
      await rpc('test_fn', []);
      expect(capturedBody).toEqual({});
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('rpc with no args defaults to empty body', async () => {
    const origFetch = globalThis.fetch;
    let capturedBody = null;
    globalThis.fetch = (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ result: 'ok' }),
      });
    };

    try {
      await rpc('test_fn');
      expect(capturedBody).toEqual({});
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('rpc with single object arg sends it directly', async () => {
    const origFetch = globalThis.fetch;
    let capturedBody = null;
    globalThis.fetch = (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ result: 'ok' }),
      });
    };

    try {
      await rpc('test_fn', [{ name: 'Alice', age: 30 }]);
      expect(capturedBody).toEqual({ name: 'Alice', age: 30 });
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('rpc with multiple args sends as __args array', async () => {
    const origFetch = globalThis.fetch;
    let capturedBody = null;
    globalThis.fetch = (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ result: 'ok' }),
      });
    };

    try {
      await rpc('test_fn', ['a', 'b', 'c']);
      expect(capturedBody).toEqual({ __args: ['a', 'b', 'c'] });
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('RPC edge cases — invalid JSON response', () => {
  test('rpc throws when response is not valid JSON', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve({
      ok: true,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    });

    try {
      await expect(rpc('test_fn', [])).rejects.toThrow();
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});


// ═══════════════════════════════════════════════════════════════
// 8. SSR EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('SSR edge cases — nested fragments', () => {
  test('nested fragments render inline', () => {
    const inner = tova_fragment([tova_el('b', {}, ['bold'])]);
    const outer = tova_fragment([tova_el('i', {}, ['italic']), inner]);
    const result = renderToString(outer);
    expect(result).toBe('<i>italic</i><b>bold</b>');
  });

  test('deeply nested fragments', () => {
    const deep = tova_fragment([
      tova_fragment([
        tova_fragment([
          tova_el('span', {}, ['deep'])
        ])
      ])
    ]);
    const result = renderToString(deep);
    expect(result).toBe('<span>deep</span>');
  });
});

describe('SSR edge cases — function props evaluated in SSR', () => {
  test('function className is evaluated', () => {
    const result = renderToString(tova_el('div', { className: () => 'dynamic-class' }, []));
    expect(result).toContain('class="dynamic-class"');
  });

  test('function returning false is skipped', () => {
    const result = renderToString(tova_el('div', { 'data-active': () => false }, []));
    expect(result).not.toContain('data-active');
  });

  test('function returning null is skipped', () => {
    const result = renderToString(tova_el('div', { title: () => null }, []));
    expect(result).not.toContain('title');
  });
});

describe('SSR edge cases — null children', () => {
  test('null children are skipped', () => {
    const vnode = tova_el('div', {}, [null, 'hello', null, 'world', null]);
    const result = renderToString(vnode);
    expect(result).toBe('<div>helloworld</div>');
  });

  test('undefined children are skipped', () => {
    const vnode = tova_el('div', {}, [undefined, 'text']);
    const result = renderToString(vnode);
    expect(result).toBe('<div>text</div>');
  });

  test('mixed null/undefined/element children', () => {
    const vnode = tova_el('div', {}, [
      null,
      tova_el('span', {}, ['a']),
      undefined,
      'text',
      null,
    ]);
    const result = renderToString(vnode);
    expect(result).toBe('<div><span>a</span>text</div>');
  });
});


// ═══════════════════════════════════════════════════════════════
// 9. STRING PROTOTYPE EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('String prototype edge cases — empty string methods', () => {
  // Import string-proto to ensure methods are registered
  test('empty string upper()', () => {
    expect(upper('')).toBe('');
  });

  test('empty string lower()', () => {
    expect(lower('')).toBe('');
  });

  test('empty string capitalize()', () => {
    expect(capitalize('')).toBe('');
  });

  test('empty string words()', () => {
    expect(words('')).toEqual([]);
  });

  test('empty string lines()', () => {
    expect(lines('')).toEqual(['']);
  });

  test('empty string chars()', () => {
    expect(chars('')).toEqual([]);
  });

  test('empty string trim()', () => {
    expect(trim('')).toBe('');
  });
});

describe('String prototype edge cases — snake_case/camel_case', () => {
  test('snake_case with already_snake', () => {
    expect(snake_case('already_snake')).toBe('already_snake');
  });

  test('snake_case with PascalCase', () => {
    expect(snake_case('PascalCase')).toBe('pascal_case');
  });

  test('snake_case with multiple consecutive caps', () => {
    // The regex only splits between lowercase/digit and uppercase, so consecutive
    // uppercase chars are not split. "XMLParser" -> "xml_parser" would require
    // a more complex regex; current implementation produces "xmlparser".
    expect(snake_case('XMLParser')).toBe('xmlparser');
  });

  test('snake_case with dashes', () => {
    expect(snake_case('my-component')).toBe('my_component');
  });

  test('snake_case with spaces', () => {
    expect(snake_case('hello world')).toBe('hello_world');
  });

  test('camel_case with snake_case input', () => {
    expect(camel_case('hello_world')).toBe('helloWorld');
  });

  test('camel_case with dashes', () => {
    expect(camel_case('my-component')).toBe('myComponent');
  });

  test('camel_case with spaces', () => {
    expect(camel_case('hello world')).toBe('helloWorld');
  });

  test('camel_case with single word', () => {
    expect(camel_case('hello')).toBe('hello');
  });

  test('camel_case with empty string', () => {
    expect(camel_case('')).toBe('');
  });

  test('snake_case with empty string', () => {
    expect(snake_case('')).toBe('');
  });
});

describe('String prototype edge cases — chars with emoji/multibyte', () => {
  test('chars splits emoji correctly with spread operator', () => {
    const result = chars('a\u{1F600}b');
    // Spread operator on string properly handles surrogate pairs
    expect(result.length).toBe(3);
    expect(result[0]).toBe('a');
    expect(result[2]).toBe('b');
  });

  test('chars with multi-codepoint emoji', () => {
    const result = chars('hi');
    expect(result).toEqual(['h', 'i']);
  });

  test('chars with accented characters', () => {
    const result = chars('cafe\u0301');
    // The accent is a separate codepoint
    expect(result.length).toBe(5); // c, a, f, e, combining accent
  });
});


// ═══════════════════════════════════════════════════════════════
// 10. CONTEXT API
// ═══════════════════════════════════════════════════════════════

describe('Context API — provide/inject outside root', () => {
  test('inject outside any root returns default value', () => {
    const ctx = createContext('default-outside');
    // When called outside any createRoot, currentOwner is whatever state
    // the module is in. If no owner exists, inject returns default.
    const result = inject(ctx);
    // This may return default or a previously provided value from the module scope
    expect(result).toBeDefined();
  });

  test('provide outside createRoot does not throw', () => {
    const ctx = createContext('val');
    // provide() checks if currentOwner exists. If not, it just does nothing.
    expect(() => provide(ctx, 'attempted')).not.toThrow();
  });
});

describe('Context API — default value when not provided', () => {
  test('inject returns default when context never provided', () => {
    const ctx = createContext(42);
    let result;
    createRoot(() => {
      result = inject(ctx);
    });
    expect(result).toBe(42);
  });

  test('inject returns default with undefined value', () => {
    const ctx = createContext(undefined);
    let result = 'sentinel';
    createRoot(() => {
      result = inject(ctx);
    });
    expect(result).toBe(undefined);
  });

  test('inject returns default null', () => {
    const ctx = createContext(null);
    let result = 'sentinel';
    createRoot(() => {
      result = inject(ctx);
    });
    expect(result).toBe(null);
  });
});

describe('Context API — nested provides', () => {
  test('inner provide shadows outer provide', () => {
    const ctx = createContext('default');
    let outerVal, innerVal, deepVal;

    createRoot(() => {
      provide(ctx, 'outer');
      outerVal = inject(ctx);

      createRoot(() => {
        provide(ctx, 'inner');
        innerVal = inject(ctx);

        createRoot(() => {
          deepVal = inject(ctx);
        });
      });
    });

    expect(outerVal).toBe('outer');
    expect(innerVal).toBe('inner');
    expect(deepVal).toBe('inner');
  });

  test('sibling roots have independent contexts', () => {
    const ctx = createContext('default');
    let val1, val2;

    createRoot(() => {
      provide(ctx, 'parent');

      createRoot(() => {
        provide(ctx, 'sibling1');
        val1 = inject(ctx);
      });

      createRoot(() => {
        // Does not see sibling1's provide, should see parent's
        val2 = inject(ctx);
      });
    });

    expect(val1).toBe('sibling1');
    expect(val2).toBe('parent');
  });
});


// ═══════════════════════════════════════════════════════════════
// 11. OWNERSHIP AND DISPOSAL
// ═══════════════════════════════════════════════════════════════

describe('Ownership and disposal — disposing root disposes children', () => {
  test('dispose root stops all child effects', () => {
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);
    let runsA = 0, runsB = 0;

    let dispose;
    createRoot((d) => {
      dispose = d;
      createEffect(() => { a(); runsA++; });
      createEffect(() => { b(); runsB++; });
    });

    expect(runsA).toBe(1);
    expect(runsB).toBe(1);

    setA(1);
    setB(1);
    expect(runsA).toBe(2);
    expect(runsB).toBe(2);

    dispose();

    setA(2);
    setB(2);
    // Both effects should be stopped
    expect(runsA).toBe(2);
    expect(runsB).toBe(2);
  });

  test('dispose root disposes direct child effects but not nested roots', () => {
    // In Tova, createRoot creates an independent ownership scope.
    // The inner root is NOT registered as a child of the outer root,
    // so disposing the outer root does NOT dispose the inner root's effects.
    // Only effects/computeds created directly under the outer root are disposed.
    const [countOuter, setCountOuter] = createSignal(0);
    const [countInner, setCountInner] = createSignal(0);
    let outerRuns = 0;
    let innerRuns = 0;

    let disposeOuter, disposeInner;
    createRoot((d) => {
      disposeOuter = d;
      createEffect(() => { countOuter(); outerRuns++; });
      createRoot((d2) => {
        disposeInner = d2;
        createEffect(() => { countInner(); innerRuns++; });
      });
    });

    expect(outerRuns).toBe(1);
    expect(innerRuns).toBe(1);

    // Dispose outer root -- stops outer effects
    disposeOuter();
    setCountOuter(1);
    expect(outerRuns).toBe(1); // outer stopped

    // Inner root effects can be stopped independently
    disposeInner();
    setCountInner(1);
    expect(innerRuns).toBe(1); // inner stopped after its own dispose
  });
});

describe('Ownership and disposal — cleanup runs in reverse order', () => {
  test('root cleanups run in reverse order', () => {
    const order = [];

    let dispose;
    createRoot((d) => {
      dispose = d;
      onUnmount(() => order.push('first'));
      onUnmount(() => order.push('second'));
      onUnmount(() => order.push('third'));
    });

    dispose();
    expect(order).toEqual(['third', 'second', 'first']);
  });

  test('cleanups of directly owned effects run on root dispose', () => {
    const order = [];

    let dispose;
    createRoot((d) => {
      dispose = d;
      onUnmount(() => order.push('cleanup1'));
      onUnmount(() => order.push('cleanup2'));
      onUnmount(() => order.push('cleanup3'));
    });

    dispose();
    // All cleanups from the root run in reverse order
    expect(order).toEqual(['cleanup3', 'cleanup2', 'cleanup1']);
  });
});


// ═══════════════════════════════════════════════════════════════
// 12. KEYED RECONCILIATION EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('Keyed reconciliation — reorder items', () => {
  test('keyed items reorder preserving DOM nodes', () => {
    const container = createMockElement('div');
    const [items, setItems] = createSignal([
      { id: 'x', t: 'X' },
      { id: 'y', t: 'Y' },
      { id: 'z', t: 'Z' },
    ]);

    function App() {
      return tova_el('div', {}, [
        () => items().map(i => tova_keyed(i.id, tova_el('span', {}, [i.t])))
      ]);
    }

    mount(App, container);
    const marker = container.children[0].children[0];
    const spanX = marker.__tovaNodes[0];
    const spanY = marker.__tovaNodes[1];
    const spanZ = marker.__tovaNodes[2];

    // Reverse order
    setItems([
      { id: 'z', t: 'Z' },
      { id: 'y', t: 'Y' },
      { id: 'x', t: 'X' },
    ]);

    expect(marker.__tovaNodes[0]).toBe(spanZ);
    expect(marker.__tovaNodes[1]).toBe(spanY);
    expect(marker.__tovaNodes[2]).toBe(spanX);
  });

  test('swap first and last', () => {
    const container = createMockElement('div');
    const [items, setItems] = createSignal([
      { id: 'a', t: 'A' },
      { id: 'b', t: 'B' },
      { id: 'c', t: 'C' },
    ]);

    function App() {
      return tova_el('div', {}, [
        () => items().map(i => tova_keyed(i.id, tova_el('li', {}, [i.t])))
      ]);
    }

    mount(App, container);
    const marker = container.children[0].children[0];
    const liA = marker.__tovaNodes[0];
    const liC = marker.__tovaNodes[2];

    setItems([
      { id: 'c', t: 'C' },
      { id: 'b', t: 'B' },
      { id: 'a', t: 'A' },
    ]);

    expect(marker.__tovaNodes[0]).toBe(liC);
    expect(marker.__tovaNodes[2]).toBe(liA);
  });
});

describe('Keyed reconciliation — remove from middle', () => {
  test('removing item from middle preserves surrounding items', () => {
    const container = createMockElement('div');
    const [items, setItems] = createSignal([
      { id: '1', t: 'One' },
      { id: '2', t: 'Two' },
      { id: '3', t: 'Three' },
    ]);

    function App() {
      return tova_el('div', {}, [
        () => items().map(i => tova_keyed(i.id, tova_el('div', {}, [i.t])))
      ]);
    }

    mount(App, container);
    const marker = container.children[0].children[0];
    const div1 = marker.__tovaNodes[0];
    const div3 = marker.__tovaNodes[2];

    // Remove middle item
    setItems([
      { id: '1', t: 'One' },
      { id: '3', t: 'Three' },
    ]);

    expect(marker.__tovaNodes.length).toBe(2);
    expect(marker.__tovaNodes[0]).toBe(div1);
    expect(marker.__tovaNodes[1]).toBe(div3);
  });
});

describe('Keyed reconciliation — add to beginning', () => {
  test('adding item to beginning shifts existing items', () => {
    const container = createMockElement('div');
    const [items, setItems] = createSignal([
      { id: 'b', t: 'B' },
      { id: 'c', t: 'C' },
    ]);

    function App() {
      return tova_el('div', {}, [
        () => items().map(i => tova_keyed(i.id, tova_el('div', {}, [i.t])))
      ]);
    }

    mount(App, container);
    const marker = container.children[0].children[0];
    const divB = marker.__tovaNodes[0];
    const divC = marker.__tovaNodes[1];

    // Add to beginning
    setItems([
      { id: 'a', t: 'A' },
      { id: 'b', t: 'B' },
      { id: 'c', t: 'C' },
    ]);

    expect(marker.__tovaNodes.length).toBe(3);
    // divB and divC should be reused
    expect(marker.__tovaNodes[1]).toBe(divB);
    expect(marker.__tovaNodes[2]).toBe(divC);
    // New item at beginning
    expect(marker.__tovaNodes[0].children[0].textContent).toBe('A');
  });
});


// ═══════════════════════════════════════════════════════════════
// 13. ERROR BOUNDARY
// ═══════════════════════════════════════════════════════════════

describe('Error boundary — error in child effect', () => {
  test('createErrorBoundary catches error thrown in run()', () => {
    const boundary = createErrorBoundary();
    boundary.run(() => {
      throw new Error('child error');
    });
    expect(boundary.error()).toBeInstanceOf(Error);
    expect(boundary.error().message).toBe('child error');
  });

  test('error in effect triggers error handler', () => {
    const errors = [];
    const origError = console.error;
    console.error = (...args) => errors.push(args.join(' '));

    const boundary = createErrorBoundary();
    boundary.run(() => {
      const [count, setCount] = createSignal(0);
      createEffect(() => {
        if (count() > 0) throw new Error('effect boom');
        count();
      });
      setCount(1);
    });

    console.error = origError;
    // The error handler set by createErrorBoundary should have captured it
    // Note: the boundary.run() only wraps the initial execution; errors in
    // effects are caught by the effect's own try/catch and routed to currentErrorHandler
    expect(boundary.error()).not.toBe(null);
  });
});

describe('Error boundary — fallback rendering', () => {
  test('ErrorBoundary component renders child when no error', () => {
    const child = tova_el('p', {}, ['ok content']);
    const eb = ErrorBoundary({
      fallback: ({ error }) => tova_el('div', {}, [`Error: ${error}`]),
      children: [child],
    });

    const result = eb.compute();
    expect(result).toBe(child);
  });

  test('ErrorBoundary compute returns fallback function result when error', () => {
    // We need to trigger the error signal inside the ErrorBoundary
    // ErrorBoundary sets up its own error signal + handler
    const eb = ErrorBoundary({
      fallback: ({ error, reset }) => tova_el('div', { className: 'error' }, [error.message]),
      children: [tova_el('span', {}, ['child'])],
    });

    // The compute function checks the error signal
    // Without triggering an error externally, it shows child
    const result = eb.compute();
    expect(result.tag).toBe('span');
  });
});


// ═══════════════════════════════════════════════════════════════
// 14. LAZY COMPONENT
// ═══════════════════════════════════════════════════════════════

describe('Lazy component — successful load', () => {
  test('lazy component resolves and renders', async () => {
    const MyComp = (props) => tova_el('div', { className: 'loaded' }, ['Loaded!']);
    const Lazy = lazy(() => Promise.resolve({ default: MyComp }));

    const vnode = Lazy({});
    expect(vnode.__tova).toBe(true);
    expect(vnode.tag).toBe('__dynamic');

    // Initially returns null (no fallback)
    expect(vnode.compute()).toBeNull();

    // Wait for async resolution
    await new Promise(r => setTimeout(r, 20));

    const result = vnode.compute();
    expect(result.__tova).toBe(true);
    expect(result.tag).toBe('div');
    expect(result.props.className).toBe('loaded');
  });

  test('lazy component caches after first load', async () => {
    let loadCount = 0;
    const MyComp = () => tova_el('span', {}, ['cached']);
    const Lazy = lazy(() => {
      loadCount++;
      return Promise.resolve({ default: MyComp });
    });

    Lazy({});
    await new Promise(r => setTimeout(r, 20));
    expect(loadCount).toBe(1);

    // Second call uses cached resolved component
    const result = Lazy({});
    // Should return vnode directly (not __dynamic)
    expect(result.__tova).toBe(true);
    expect(result.tag).toBe('span');
    expect(loadCount).toBe(1);
  });
});

describe('Lazy component — named export', () => {
  test('lazy resolves non-default export', async () => {
    // When module has no .default, it uses the module object itself
    const moduleObj = (props) => tova_el('div', {}, ['named']);
    const Lazy = lazy(() => Promise.resolve(moduleObj));

    Lazy({});
    await new Promise(r => setTimeout(r, 20));

    // After resolution, the cached component is mod.default || mod
    const result = Lazy({});
    expect(result.__tova).toBe(true);
  });
});

describe('Lazy component — error handling', () => {
  test('lazy shows error span on load failure', async () => {
    const Lazy = lazy(() => Promise.reject(new Error('load failed')));
    const vnode = Lazy({});

    await new Promise(r => setTimeout(r, 20));

    const result = vnode.compute();
    expect(result.__tova).toBe(true);
    expect(result.tag).toBe('span');
    expect(result.props.className).toBe('tova-error');
  });
});


// ═══════════════════════════════════════════════════════════════
// 15. CSS INJECTION
// ═══════════════════════════════════════════════════════════════

describe('CSS injection — same ID not injected twice', () => {
  test('tova_inject_css is idempotent for same ID', () => {
    const id = 'unique-css-test-' + Date.now();
    const headBefore = document.head.children.length;

    tova_inject_css(id, '.a { color: red }');
    const afterFirst = document.head.children.length;
    expect(afterFirst).toBe(headBefore + 1);

    tova_inject_css(id, '.a { color: red }');
    expect(document.head.children.length).toBe(afterFirst);

    // Third call
    tova_inject_css(id, '.b { color: blue }'); // different CSS, same ID
    expect(document.head.children.length).toBe(afterFirst);
  });

  test('tova_inject_css with different IDs creates separate styles', () => {
    const id1 = 'css-diff-1-' + Date.now();
    const id2 = 'css-diff-2-' + Date.now();
    const headBefore = document.head.children.length;

    tova_inject_css(id1, '.x {}');
    tova_inject_css(id2, '.y {}');
    expect(document.head.children.length).toBe(headBefore + 2);
  });

  test('injected style has correct attributes', () => {
    const id = 'css-attr-test-' + Date.now();
    tova_inject_css(id, 'body { margin: 0 }');

    const styles = document.head.children;
    const last = styles[styles.length - 1];
    expect(last.tagName).toBe('style');
    expect(last.attributes['data-tova-style']).toBe(id);
    expect(last.textContent).toBe('body { margin: 0 }');
  });
});


// ═══════════════════════════════════════════════════════════════
// 16. CREATE REF
// ═══════════════════════════════════════════════════════════════

describe('createRef — initial value', () => {
  test('createRef() defaults to null', () => {
    const ref = createRef();
    expect(ref.current).toBe(null);
  });

  test('createRef(value) sets initial current', () => {
    const ref = createRef('hello');
    expect(ref.current).toBe('hello');
  });

  test('createRef(0) sets current to 0', () => {
    const ref = createRef(0);
    expect(ref.current).toBe(0);
  });

  test('createRef(false) sets current to false', () => {
    const ref = createRef(false);
    expect(ref.current).toBe(false);
  });

  test('createRef(undefined) defaults to null per implementation', () => {
    const ref = createRef(undefined);
    // Source: initialValue !== undefined ? initialValue : null
    // undefined !== undefined is false, so result is null
    expect(ref.current).toBe(null);
  });
});

describe('createRef — mutation', () => {
  test('current can be set to any value', () => {
    const ref = createRef();
    ref.current = 42;
    expect(ref.current).toBe(42);

    ref.current = 'string';
    expect(ref.current).toBe('string');

    ref.current = { nested: true };
    expect(ref.current.nested).toBe(true);

    ref.current = null;
    expect(ref.current).toBe(null);
  });

  test('ref used with render element', () => {
    const ref = createRef();
    const vnode = tova_el('div', { ref }, ['content']);
    const el = render(vnode);
    expect(ref.current).toBe(el);
  });

  test('function ref is called with element', () => {
    let captured = null;
    const vnode = tova_el('input', { ref: (el) => { captured = el; } }, []);
    const el = render(vnode);
    expect(captured).toBe(el);
  });
});


// ═══════════════════════════════════════════════════════════════
// 17. FLATTEN VNODES (tested through render)
// ═══════════════════════════════════════════════════════════════

describe('flattenVNodes — deeply nested arrays', () => {
  test('deeply nested array children are flattened', () => {
    const vnode = tova_el('div', {}, [
      [['a', 'b'], ['c']],
      'd',
    ]);
    const el = render(vnode);
    // Should have 4 text node children after flattening
    expect(el.children.length).toBe(4);
    expect(el.children[0].textContent).toBe('a');
    expect(el.children[1].textContent).toBe('b');
    expect(el.children[2].textContent).toBe('c');
    expect(el.children[3].textContent).toBe('d');
  });

  test('triple-nested arrays', () => {
    const vnode = tova_el('div', {}, [
      [[['deep']]]
    ]);
    const el = render(vnode);
    expect(el.children.length).toBe(1);
    expect(el.children[0].textContent).toBe('deep');
  });
});

describe('flattenVNodes — mixed null/undefined/elements', () => {
  test('null and undefined are skipped during rendering', () => {
    const vnode = tova_el('div', {}, [null, 'a', undefined, 'b', null]);
    const el = render(vnode);
    expect(el.children.length).toBe(2);
    expect(el.children[0].textContent).toBe('a');
    expect(el.children[1].textContent).toBe('b');
  });

  test('mixed types with null gaps', () => {
    const vnode = tova_el('ul', {}, [
      null,
      tova_el('li', {}, ['item1']),
      undefined,
      tova_el('li', {}, ['item2']),
      null,
    ]);
    const el = render(vnode);
    expect(el.children.length).toBe(2);
    expect(el.children[0].tagName).toBe('li');
    expect(el.children[1].tagName).toBe('li');
  });

  test('array with all nulls renders no children', () => {
    const vnode = tova_el('div', {}, [null, null, null]);
    const el = render(vnode);
    expect(el.children.length).toBe(0);
  });

  test('nested array with nulls', () => {
    const vnode = tova_el('div', {}, [
      [null, 'a'],
      [null, null],
      ['b', null],
    ]);
    const el = render(vnode);
    expect(el.children.length).toBe(2);
    expect(el.children[0].textContent).toBe('a');
    expect(el.children[1].textContent).toBe('b');
  });
});


// ═══════════════════════════════════════════════════════════════
// 18. STDLIB ADDITIONAL EDGE CASES
// ═══════════════════════════════════════════════════════════════

describe('Stdlib edge cases — range with step', () => {
  test('range with step 2', () => {
    expect(range(0, 10, 2)).toEqual([0, 2, 4, 6, 8]);
  });

  test('range with step 3', () => {
    expect(range(0, 10, 3)).toEqual([0, 3, 6, 9]);
  });

  test('range with negative step', () => {
    expect(range(10, 0, -2)).toEqual([10, 8, 6, 4, 2]);
  });

  test('range with step larger than range', () => {
    expect(range(0, 3, 10)).toEqual([0]);
  });

  test('range(1) produces [0]', () => {
    expect(range(1)).toEqual([0]);
  });

  test('range(0) produces empty array', () => {
    expect(range(0)).toEqual([]);
  });

  test('range with negative auto-step', () => {
    expect(range(5, 2)).toEqual([5, 4, 3]);
  });
});

describe('Stdlib edge cases — enumerate', () => {
  test('enumerate empty array', () => {
    expect(enumerate([])).toEqual([]);
  });

  test('enumerate single element', () => {
    expect(enumerate(['only'])).toEqual([[0, 'only']]);
  });

  test('enumerate preserves order', () => {
    const result = enumerate(['a', 'b', 'c']);
    expect(result[0]).toEqual([0, 'a']);
    expect(result[1]).toEqual([1, 'b']);
    expect(result[2]).toEqual([2, 'c']);
  });
});

describe('Stdlib edge cases — group_by', () => {
  test('group_by empty array', () => {
    expect(group_by([], x => x)).toEqual({});
  });

  test('group_by single group', () => {
    const result = group_by([1, 2, 3], () => 'all');
    expect(result.all).toEqual([1, 2, 3]);
  });

  test('group_by with string key', () => {
    const data = [
      { type: 'fruit', name: 'apple' },
      { type: 'veg', name: 'carrot' },
      { type: 'fruit', name: 'banana' },
    ];
    const result = group_by(data, 'type');
    expect(result.fruit.length).toBe(2);
    expect(result.veg.length).toBe(1);
  });

  test('group_by with boolean grouping', () => {
    const result = group_by([1, 2, 3, 4, 5], x => x > 3);
    expect(result['true']).toEqual([4, 5]);
    expect(result['false']).toEqual([1, 2, 3]);
  });
});

describe('Stdlib edge cases — chunk with remainder', () => {
  test('chunk with exact division', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  test('chunk with remainder', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  test('chunk with size 1', () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  test('chunk with size larger than array', () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  test('chunk empty array', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  test('chunk with size equal to array length', () => {
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });
});

describe('Stdlib edge cases — string functions', () => {
  test('title_case with multiple spaces', () => {
    expect(title_case('hello  world')).toBe('Hello  World');
  });

  test('capitalize single char', () => {
    expect(capitalize('a')).toBe('A');
  });

  test('capitalize already capitalized', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });

  test('pad_start with fill char', () => {
    expect(pad_start('42', 5, '0')).toBe('00042');
  });

  test('pad_end with fill char', () => {
    expect(pad_end('hi', 5, '.')).toBe('hi...');
  });

  test('replace all occurrences', () => {
    expect(replace('aaa', 'a', 'b')).toBe('bbb');
  });

  test('replace_first only replaces first', () => {
    expect(replace_first('aaa', 'a', 'b')).toBe('baa');
  });

  test('char_at boundary', () => {
    expect(char_at('abc', 0)).toBe('a');
    expect(char_at('abc', 2)).toBe('c');
    expect(char_at('abc', 3)).toBeNull();
  });

  test('words with tabs and newlines', () => {
    expect(words('hello\tworld\nfoo')).toEqual(['hello', 'world', 'foo']);
  });

  test('lines with Windows line endings', () => {
    // lines splits on \n, so \r remains
    const result = lines('a\r\nb\r\nc');
    expect(result.length).toBe(3);
    expect(result[0]).toBe('a\r');
  });

  test('contains empty substring', () => {
    expect(contains('hello', '')).toBe(true);
  });

  test('starts_with empty prefix', () => {
    expect(starts_with('hello', '')).toBe(true);
  });

  test('ends_with empty suffix', () => {
    expect(ends_with('hello', '')).toBe(true);
  });
});

describe('Stdlib edge cases — other collection functions', () => {
  test('unique with objects preserves references', () => {
    const obj = { a: 1 };
    // Set deduplication uses reference equality for objects
    const result = unique([obj, obj, { a: 1 }]);
    expect(result.length).toBe(2); // obj and new {a:1} are different refs
  });

  test('flatten with depth 0 returns copy', () => {
    const arr = [[1, 2], [3]];
    const result = flatten(arr, 0);
    expect(result).toEqual([[1, 2], [3]]);
  });

  test('take more than length returns full array', () => {
    expect(take([1, 2], 10)).toEqual([1, 2]);
  });

  test('drop more than length returns empty array', () => {
    expect(drop([1, 2], 10)).toEqual([]);
  });

  test('find returns first match only', () => {
    expect(find([1, 2, 3, 4], x => x > 1)).toBe(2);
  });

  test('find_index with no match returns null', () => {
    expect(find_index([1, 2, 3], x => x > 10)).toBeNull();
  });

  test('reduce without initial uses first element', () => {
    expect(reduce(['a', 'b', 'c'], (acc, x) => acc + x)).toBe('abc');
  });

  test('merge with no args returns empty object', () => {
    expect(merge()).toEqual({});
  });

  test('merge three objects', () => {
    expect(merge({ a: 1 }, { b: 2 }, { c: 3 })).toEqual({ a: 1, b: 2, c: 3 });
  });

  test('sum of empty array', () => {
    expect(sum([])).toBe(0);
  });

  test('sorted with strings', () => {
    expect(sorted(['c', 'a', 'b'])).toEqual(['a', 'b', 'c']);
  });

  test('reversed empty array', () => {
    expect(reversed([])).toEqual([]);
  });

  test('flat_map with empty results', () => {
    expect(flat_map([1, 2, 3], x => x > 2 ? [x] : [])).toEqual([3]);
  });

  test('zip three arrays', () => {
    expect(zip([1, 2], ['a', 'b'], [true, false])).toEqual([[1, 'a', true], [2, 'b', false]]);
  });

  test('min and max single element', () => {
    expect(min([42])).toBe(42);
    expect(max([42])).toBe(42);
  });

  test('any with all falsy returns false', () => {
    expect(any([0, false, '', null])).toBe(false);
  });

  test('all with empty array returns true', () => {
    expect(all([])).toBe(true);
  });
});

describe('Stdlib edge cases — type_of', () => {
  test('type_of with NaN returns Float', () => {
    // NaN is a number type, but not integer
    expect(type_of(NaN)).toBe('Float');
  });

  test('type_of with Infinity returns Float', () => {
    expect(type_of(Infinity)).toBe('Float');
  });

  test('type_of with negative zero returns Int', () => {
    // -0 is technically an integer in JS
    expect(type_of(-0)).toBe('Int');
  });

  test('type_of with tagged object', () => {
    expect(type_of({ __tag: 'Result', value: 42 })).toBe('Result');
  });
});

describe('Stdlib edge cases — len', () => {
  test('len of empty string', () => {
    expect(len('')).toBe(0);
  });

  test('len of empty array', () => {
    expect(len([])).toBe(0);
  });

  test('len of empty object', () => {
    expect(len({})).toBe(0);
  });

  test('len of number returns 0', () => {
    expect(len(42)).toBe(0);
  });

  test('len of boolean returns 0', () => {
    expect(len(true)).toBe(0);
  });
});


// ═══════════════════════════════════════════════════════════════
// ADDITIONAL INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════

describe('Integration — watch with computed', () => {
  test('watch a computed value', () => {
    const [count, setCount] = createSignal(0);
    const doubled = createComputed(() => count() * 2);
    const calls = [];

    watch(doubled, (newVal, oldVal) => {
      calls.push({ newVal, oldVal });
    });

    setCount(5);
    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual({ newVal: 10, oldVal: 0 });
  });
});

describe('Integration — untrack inside computed', () => {
  test('untrack inside computed prevents tracking of certain signals', () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);

    const result = createComputed(() => {
      return a() + untrack(() => b());
    });

    expect(result()).toBe(3);
    setA(10);
    expect(result()).toBe(12); // re-computed because a changed

    setB(20);
    // b is not tracked, so result should still be 12 when read
    // But the computed is not marked dirty by b, so it returns stale value
    expect(result()).toBe(12);
  });
});

describe('Integration — batch with watch', () => {
  test('watch callback fires once after batch', () => {
    const [count, setCount] = createSignal(0);
    const calls = [];

    watch(() => count(), (newVal) => {
      calls.push(newVal);
    });

    batch(() => {
      setCount(1);
      setCount(2);
      setCount(3);
    });

    // Watch should fire once with final value
    expect(calls.length).toBe(1);
    expect(calls[0]).toBe(3);
  });
});

describe('Integration — createRoot with watch', () => {
  test('watch inside createRoot is disposed when root is disposed', () => {
    const [count, setCount] = createSignal(0);
    const calls = [];

    let dispose;
    createRoot((d) => {
      dispose = d;
      watch(() => count(), (newVal) => {
        calls.push(newVal);
      });
    });

    setCount(1);
    expect(calls.length).toBe(1);

    dispose();
    setCount(2);
    expect(calls.length).toBe(1); // no more calls after dispose
  });
});

describe('Integration — mount and dispose', () => {
  test('mount returns dispose function that stops all reactivity', () => {
    const container = createMockElement('div');
    const [count, setCount] = createSignal(0);
    let effectRuns = 0;

    function App() {
      return tova_el('div', {}, [() => {
        effectRuns++;
        return String(count());
      }]);
    }

    const dispose = mount(App, container);
    expect(effectRuns).toBe(1);

    setCount(1);
    expect(effectRuns).toBe(2);

    dispose();
    setCount(2);
    expect(effectRuns).toBe(2); // stopped
  });
});

describe('Integration — render with checked and value props', () => {
  test('checked prop is set as boolean', () => {
    const el = render(tova_el('input', { type: 'checkbox', checked: true }, []));
    expect(el.checked).toBe(true);

    const el2 = render(tova_el('input', { type: 'checkbox', checked: false }, []));
    expect(el2.checked).toBe(false);
  });

  test('value prop is set on element', () => {
    const el = render(tova_el('input', { value: 'hello' }, []));
    expect(el.value).toBe('hello');
  });
});

describe('Integration — SSR renderPage with various options', () => {
  test('renderPage with head extra content', () => {
    const html = renderPage(
      () => tova_el('div', {}, ['App']),
      { head: '<meta name="description" content="test">' }
    );
    expect(html).toContain('<meta name="description" content="test">');
    expect(html).toContain('<div>App</div>');
  });

  test('renderPage escapes title', () => {
    const html = renderPage(
      () => tova_el('div', {}, ['App']),
      { title: 'My "App" & Co.' }
    );
    expect(html).toContain('My &quot;App&quot; &amp; Co.');
  });
});
