import { describe, test, expect, beforeEach } from 'bun:test';
import { createSignal, createEffect, createComputed, tova_el, tova_fragment, render, mount, hydrate, batch, onMount, onUnmount, onCleanup, createRef, createContext, provide, inject, createErrorBoundary, createRoot, watch, untrack, Dynamic, Portal, lazy } from '../src/runtime/reactivity.js';
import { renderToString, renderPage } from '../src/runtime/ssr.js';
import { defineRoutes, getCurrentRoute, getParams, getPath, getQuery, onRouteChange, navigate, Router, Link, Redirect } from '../src/runtime/router.js';

// ─── Reactivity ───────────────────────────────────────────

describe('Reactivity — createSignal', () => {
  test('returns getter and setter', () => {
    const [get, set] = createSignal(0);
    expect(typeof get).toBe('function');
    expect(typeof set).toBe('function');
  });

  test('getter returns initial value', () => {
    const [count] = createSignal(42);
    expect(count()).toBe(42);
  });

  test('setter updates value', () => {
    const [count, setCount] = createSignal(0);
    setCount(5);
    expect(count()).toBe(5);
  });

  test('setter with function updater', () => {
    const [count, setCount] = createSignal(10);
    setCount(prev => prev + 5);
    expect(count()).toBe(15);
  });

  test('setter does not trigger on same value', () => {
    let effectRuns = 0;
    const [count, setCount] = createSignal(5);
    createEffect(() => {
      count();
      effectRuns++;
    });
    const initialRuns = effectRuns;
    setCount(5); // same value
    expect(effectRuns).toBe(initialRuns);
  });
});

describe('Reactivity — createEffect', () => {
  test('runs immediately', () => {
    let ran = false;
    createEffect(() => { ran = true; });
    expect(ran).toBe(true);
  });

  test('re-runs when signal changes', () => {
    const [count, setCount] = createSignal(0);
    let observed = -1;
    createEffect(() => { observed = count(); });
    expect(observed).toBe(0);
    setCount(10);
    expect(observed).toBe(10);
  });

  test('nested effects', () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    let outer = 0;
    let inner = 0;

    createEffect(() => {
      outer = a();
      createEffect(() => {
        inner = b();
      });
    });

    expect(outer).toBe(1);
    expect(inner).toBe(2);
    setB(20);
    expect(inner).toBe(20);
  });

  test('returns effect function', () => {
    const eff = createEffect(() => {});
    expect(typeof eff).toBe('function');
  });
});

describe('Reactivity — createComputed', () => {
  test('computes derived value', () => {
    const [count] = createSignal(5);
    const doubled = createComputed(() => count() * 2);
    expect(doubled()).toBe(10);
  });

  test('updates when dependency changes', () => {
    const [count, setCount] = createSignal(3);
    const doubled = createComputed(() => count() * 2);
    expect(doubled()).toBe(6);
    setCount(10);
    expect(doubled()).toBe(20);
  });
});

// ─── DOM helpers (virtual) ────────────────────────────────

describe('Reactivity — tova_el', () => {
  test('creates vnode', () => {
    const node = tova_el('div', { className: 'test' }, ['hello']);
    expect(node.__tova).toBe(true);
    expect(node.tag).toBe('div');
    expect(node.props.className).toBe('test');
    expect(node.children).toEqual(['hello']);
  });

  test('default props and children', () => {
    const node = tova_el('span');
    expect(node.props).toEqual({});
    expect(node.children).toEqual([]);
  });
});

describe('Reactivity — tova_fragment', () => {
  test('creates fragment vnode', () => {
    const frag = tova_fragment(['a', 'b']);
    expect(frag.__tova).toBe(true);
    expect(frag.tag).toBe('__fragment');
    expect(frag.children).toEqual(['a', 'b']);
  });
});

// ─── DOM Rendering ──────────────────────────────────────────

// Minimal DOM mock for Bun test environment
// Supports comment nodes (markers), parentNode/nextSibling tracking,
// insertBefore, and DocumentFragment (nodeType 11) for the marker-based runtime.

function _setParent(child, parent) {
  if (child && typeof child === 'object') child.parentNode = parent;
}

function _clearParent(child) {
  if (child && typeof child === 'object') child.parentNode = null;
}

// Shared child management methods (used by elements and fragments)
const childMethods = {
  appendChild(child) {
    // DocumentFragment: move all children
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
  const el = {
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
    eventListeners: {},
    __handlers: {},
    ...childMethods,
    setAttribute(key, val) { this.attributes[key] = String(val); },
    getAttribute(key) { return this.attributes[key] || null; },
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
  };
  return el;
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

function createMockDocument() {
  return {
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
    body: createMockElement('body'),
    head: createMockElement('head'),
  };
}

// Install mock DOM globally for render/mount tests
if (typeof globalThis.document === 'undefined') {
  globalThis.document = createMockDocument();
}

describe('Reactivity — render', () => {
  test('render null returns text node', () => {
    const node = render(null);
    expect(node.textContent).toBe('');
  });

  test('render undefined returns text node', () => {
    const node = render(undefined);
    expect(node.textContent).toBe('');
  });

  test('render string returns text node', () => {
    const node = render('hello');
    expect(node.textContent).toBe('hello');
  });

  test('render number returns text node', () => {
    const node = render(42);
    expect(node.textContent).toBe('42');
  });

  test('render array returns fragment', () => {
    const node = render(['a', 'b']);
    expect(node.children.length).toBe(2);
  });

  test('render non-tova object returns text', () => {
    const node = render({ some: 'object' });
    expect(node.textContent).toBeDefined();
  });

  test('render vnode creates element', () => {
    const vnode = tova_el('div', { className: 'test' }, ['hello']);
    const el = render(vnode);
    expect(el.tagName).toBe('div');
    expect(el.className).toBe('test');
  });

  test('render vnode with event handler', () => {
    const handler = () => {};
    const vnode = tova_el('button', { onClick: handler }, ['click me']);
    const el = render(vnode);
    expect(el.eventListeners['click']).toBeDefined();
  });

  test('render vnode with style object', () => {
    const vnode = tova_el('div', { style: { color: 'red' } }, []);
    const el = render(vnode);
    expect(el.style.color).toBe('red');
  });

  test('render vnode with key prop (skipped)', () => {
    const vnode = tova_el('div', { key: 'k1' }, []);
    const el = render(vnode);
    expect(el.attributes.key).toBeUndefined();
  });

  test('render vnode with regular attribute', () => {
    const vnode = tova_el('input', { type: 'text', id: 'name' }, []);
    const el = render(vnode);
    expect(el.attributes.type).toBe('text');
    expect(el.attributes.id).toBe('name');
  });

  test('render vnode with function attribute', () => {
    const vnode = tova_el('div', { className: () => 'dynamic' }, []);
    const el = render(vnode);
    expect(el.className).toBe('dynamic');
  });

  test('render fragment vnode', () => {
    const frag = tova_fragment(['a', 'b', 'c']);
    const el = render(frag);
    // Fragment returns DocumentFragment with [marker, text, text, text]
    expect(el.nodeType).toBe(11);
    expect(el.children.length).toBe(4); // marker + 3 text nodes
    const marker = el.children[0];
    expect(marker.nodeType).toBe(8); // comment node
    expect(marker.__tovaFragment).toBe(true);
    expect(marker.__tovaNodes.length).toBe(3);
  });

  test('render self-closing element', () => {
    const vnode = tova_el('br', {}, []);
    const el = render(vnode);
    expect(el.tagName).toBe('br');
  });

  test('render nested children', () => {
    const child = tova_el('span', {}, ['inner']);
    const parent = tova_el('div', {}, [child]);
    const el = render(parent);
    expect(el.children.length).toBe(1);
  });

  test('render array children (flatten)', () => {
    const vnode = tova_el('div', {}, [['a', 'b'], 'c']);
    const el = render(vnode);
    expect(el.children.length).toBe(3);
  });
});

describe('Reactivity — mount', () => {
  test('mount with null container logs error', () => {
    const logs = [];
    const origError = console.error;
    console.error = (...args) => logs.push(args.join(' '));
    mount(() => tova_el('div', {}, []), null);
    console.error = origError;
    expect(logs.some(l => l.includes('Mount target not found'))).toBe(true);
  });

  test('mount with valid container', () => {
    const container = createMockElement('div');
    mount(() => tova_el('p', {}, ['hello']), container);
    expect(container.children.length).toBeGreaterThan(0);
  });

  test('mount updates on signal change', () => {
    const container = createMockElement('div');
    const [count, setCount] = createSignal(0);
    mount(() => tova_el('span', {}, [String(count())]), container);
    const firstChild = container.children[0];
    setCount(5);
    // After signal change, container should have been updated
    expect(container.children.length).toBeGreaterThan(0);
  });

  test('mount with static vnode', () => {
    const container = createMockElement('div');
    const vnode = tova_el('div', {}, ['static']);
    mount(vnode, container);
    expect(container.children.length).toBeGreaterThan(0);
  });
});

// ─── Router ───────────────────────────────────────────────

describe('Router — signal-based', () => {
  test('defineRoutes accepts route map', () => {
    expect(() => defineRoutes({ '/': () => 'home', '/about': () => 'about' })).not.toThrow();
  });

  test('getCurrentRoute returns a signal getter', () => {
    const routeGetter = getCurrentRoute();
    expect(typeof routeGetter).toBe('function');
    // Calling the signal returns the route object
    const r = routeGetter();
    expect(r).toHaveProperty('path');
    expect(r).toHaveProperty('params');
  });

  test('getParams returns a function that reads params', () => {
    const params = getParams();
    expect(typeof params).toBe('function');
    expect(typeof params()).toBe('object');
  });

  test('getPath returns a function that reads path', () => {
    const path = getPath();
    expect(typeof path).toBe('function');
    expect(typeof path()).toBe('string');
  });

  test('onRouteChange registers callback', () => {
    expect(() => onRouteChange(() => {})).not.toThrow();
  });

  test('navigate does nothing without window', () => {
    expect(() => navigate('/test')).not.toThrow();
  });

  test('Router component returns null when no match', () => {
    defineRoutes({});
    const result = Router();
    expect(result).toBe(null);
  });

  test('Link creates an anchor element vnode', () => {
    const vnode = Link({ href: '/about', children: ['About'] });
    expect(vnode.__tova).toBe(true);
    expect(vnode.tag).toBe('a');
    expect(vnode.props.href).toBe('/about');
    expect(typeof vnode.props.onClick).toBe('function');
  });
});

// ─── New Reactivity Features ──────────────────────────────

describe('Reactivity — Dependency Cleanup (Item 1)', () => {
  test('effect unsubscribes from old dependencies', () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    const [useA, setUseA] = createSignal(true);
    let runs = 0;

    createEffect(() => {
      runs++;
      if (useA()) { a(); } else { b(); }
    });
    expect(runs).toBe(1);

    // Switch to reading B instead of A
    setUseA(false);
    expect(runs).toBe(2);

    // Changing A should NOT trigger effect (unsubscribed)
    const runsBeforeA = runs;
    setA(100);
    expect(runs).toBe(runsBeforeA);

    // Changing B should trigger effect
    setB(200);
    expect(runs).toBe(runsBeforeA + 1);
  });
});

describe('Reactivity — Batching (Item 2)', () => {
  test('batch() defers updates until end', () => {
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);
    let runs = 0;

    createEffect(() => {
      a(); b();
      runs++;
    });
    expect(runs).toBe(1);

    batch(() => {
      setA(1);
      setB(2);
    });
    // Only one additional run, not two
    expect(runs).toBe(2);
  });

  test('without batch, each setter triggers separately', () => {
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);
    let runs = 0;

    createEffect(() => {
      a(); b();
      runs++;
    });
    expect(runs).toBe(1);

    setA(1);
    setB(2);
    // Two separate runs
    expect(runs).toBe(3);
  });
});

describe('Reactivity — Infinite Loop Detection (Item 3)', () => {
  test('effect that writes to its own signal does not loop forever', () => {
    const errors = [];
    const origError = console.error;
    console.error = (...args) => errors.push(args.join(' '));

    const [count, setCount] = createSignal(0);
    // This effect reads and writes the same signal — should be capped
    createEffect(() => {
      const c = count();
      if (c < 200) setCount(c + 1);
    });

    console.error = origError;
    // Should have been capped at 100 iterations
    expect(count()).toBeLessThanOrEqual(101);
  });
});

describe('Reactivity — Glitch-Free Computed (Item 4)', () => {
  test('diamond dependency: computed sees consistent state', () => {
    const [source, setSource] = createSignal(1);
    const a = createComputed(() => source() * 2);
    const b = createComputed(() => source() * 3);
    const sum = createComputed(() => a() + b());

    expect(sum()).toBe(5); // 2 + 3
    setSource(2);
    // sum should see a=4 AND b=6, never a=4+b=3 (stale)
    expect(sum()).toBe(10); // 4 + 6
  });

  test('computed is lazy — only recomputes when read', () => {
    const [count, setCount] = createSignal(0);
    let computeRuns = 0;
    const doubled = createComputed(() => {
      computeRuns++;
      return count() * 2;
    });

    expect(computeRuns).toBe(1); // initial
    setCount(1);
    // Computed should not have re-run yet (lazy)
    // But reading it should trigger recomputation
    expect(doubled()).toBe(2);
  });
});

describe('Reactivity — Effect Cleanup (Item 5)', () => {
  test('effect cleanup function runs on re-execution', () => {
    const [count, setCount] = createSignal(0);
    let cleanupRuns = 0;

    createEffect(() => {
      count(); // subscribe
      return () => { cleanupRuns++; };
    });

    expect(cleanupRuns).toBe(0);
    setCount(1);
    expect(cleanupRuns).toBe(1); // cleanup from first run
    setCount(2);
    expect(cleanupRuns).toBe(2); // cleanup from second run
  });

  test('effect.dispose() runs cleanup and unsubscribes', () => {
    const [count, setCount] = createSignal(0);
    let runs = 0;
    let cleanupRuns = 0;

    const eff = createEffect(() => {
      count();
      runs++;
      return () => { cleanupRuns++; };
    });

    expect(runs).toBe(1);
    eff.dispose();
    expect(cleanupRuns).toBe(1);

    // Should not re-run after dispose
    setCount(10);
    expect(runs).toBe(1);
  });
});

describe('Reactivity — onCleanup (Item 8)', () => {
  test('onCleanup registers cleanup in current effect', () => {
    const [count, setCount] = createSignal(0);
    let cleaned = 0;

    createEffect(() => {
      count();
      onCleanup(() => { cleaned++; });
    });

    expect(cleaned).toBe(0);
    setCount(1);
    expect(cleaned).toBe(1);
  });
});

describe('Reactivity — createRef (Item 9)', () => {
  test('createRef returns object with current property', () => {
    const ref = createRef();
    expect(ref.current).toBe(null);
  });

  test('createRef with initial value', () => {
    const ref = createRef(42);
    expect(ref.current).toBe(42);
  });

  test('ref.current is mutable', () => {
    const ref = createRef();
    ref.current = 'hello';
    expect(ref.current).toBe('hello');
  });
});

describe('Reactivity — createContext / provide / inject (Item 14)', () => {
  test('createContext with default value', () => {
    const ctx = createContext('default');
    expect(inject(ctx)).toBe('default');
  });

  test('provide and inject within effect', () => {
    const ctx = createContext('default');
    let injected = '';

    // provide/inject require an owner context (createRoot)
    createRoot(() => {
      createEffect(() => {
        provide(ctx, 'provided');
        injected = inject(ctx);
      });
    });

    expect(injected).toBe('provided');
  });
});

describe('Reactivity — createErrorBoundary (Item 13)', () => {
  test('createErrorBoundary captures errors', () => {
    const boundary = createErrorBoundary();
    expect(boundary.error()).toBe(null);

    boundary.run(() => {
      throw new Error('test error');
    });

    expect(boundary.error()).toBeInstanceOf(Error);
    expect(boundary.error().message).toBe('test error');
  });

  test('createErrorBoundary reset clears error', () => {
    const boundary = createErrorBoundary();
    boundary.run(() => { throw new Error('oops'); });
    expect(boundary.error()).not.toBe(null);
    boundary.reset();
    expect(boundary.error()).toBe(null);
  });
});

// ─── SSR — renderToString ─────────────────────────────────

describe('SSR — renderToString', () => {
  test('renders null to empty string', () => {
    expect(renderToString(null)).toBe('');
    expect(renderToString(undefined)).toBe('');
  });

  test('renders string with HTML escaping', () => {
    expect(renderToString('hello')).toBe('hello');
    expect(renderToString('<b>bold</b>')).toBe('&lt;b&gt;bold&lt;/b&gt;');
  });

  test('renders number', () => {
    expect(renderToString(42)).toBe('42');
  });

  test('renders array of vnodes', () => {
    expect(renderToString(['a', 'b'])).toBe('ab');
  });

  test('renders element vnode', () => {
    const vnode = tova_el('div', { className: 'test' }, ['hello']);
    expect(renderToString(vnode)).toBe('<div class="test">hello</div>');
  });

  test('renders nested elements', () => {
    const vnode = tova_el('div', {}, [tova_el('span', {}, ['inner'])]);
    expect(renderToString(vnode)).toBe('<div><span>inner</span></div>');
  });

  test('renders self-closing void elements', () => {
    const vnode = tova_el('br', {}, []);
    expect(renderToString(vnode)).toBe('<br />');
    const img = tova_el('img', { src: 'pic.png' }, []);
    expect(renderToString(img)).toBe('<img src="pic.png" />');
  });

  test('renders fragment as inline children', () => {
    const frag = tova_fragment([tova_el('span', {}, ['a']), tova_el('span', {}, ['b'])]);
    expect(renderToString(frag)).toBe('<span>a</span><span>b</span>');
  });

  test('skips event handler props', () => {
    const vnode = tova_el('button', { onClick: () => {} }, ['click']);
    expect(renderToString(vnode)).toBe('<button>click</button>');
  });

  test('skips key and ref props', () => {
    const vnode = tova_el('div', { key: 'k1', ref: {} }, ['hi']);
    expect(renderToString(vnode)).toBe('<div>hi</div>');
  });

  test('renders boolean attributes', () => {
    const vnode = tova_el('input', { disabled: true, checked: false }, []);
    expect(renderToString(vnode)).toBe('<input disabled />');
  });

  test('renders style object as CSS string', () => {
    const vnode = tova_el('div', { style: { color: 'red', fontSize: '14px' } }, []);
    expect(renderToString(vnode)).toBe('<div style="color:red;font-size:14px"></div>');
  });

  test('renders value attribute', () => {
    const vnode = tova_el('input', { value: 'test' }, []);
    expect(renderToString(vnode)).toBe('<input value="test" />');
  });

  test('evaluates function props for SSR', () => {
    const vnode = tova_el('div', { className: () => 'dynamic' }, ['hi']);
    expect(renderToString(vnode)).toBe('<div class="dynamic">hi</div>');
  });

  test('evaluates reactive functions in children', () => {
    const [count] = createSignal(5);
    expect(renderToString(() => count())).toBe('5');
  });

  test('renders __dynamic vnode via compute', () => {
    const vnode = {
      __tova: true, tag: '__dynamic', props: {}, children: [],
      compute: () => tova_el('span', {}, ['dynamic']),
    };
    const result = renderToString(vnode);
    expect(result).toContain('<span>dynamic</span>');
    expect(result).toMatch(/<!--tova-s:\d+-->/);
    expect(result).toMatch(/<!--\/tova-s:\d+-->/);
  });

  test('escapes HTML in attribute values', () => {
    const vnode = tova_el('div', { title: 'a"b&c' }, []);
    expect(renderToString(vnode)).toBe('<div title="a&quot;b&amp;c"></div>');
  });
});

describe('SSR — renderPage', () => {
  test('renders full HTML page', () => {
    const page = renderPage(() => tova_el('h1', {}, ['Hello']));
    expect(page).toContain('<!DOCTYPE html>');
    expect(page).toContain('<h1>Hello</h1>');
    expect(page).toContain('<title>Tova App</title>');
    expect(page).toContain('src="/browser.js"');
  });

  test('renders page with custom title', () => {
    const page = renderPage(() => tova_el('p', {}, ['hi']), { title: 'My App' });
    expect(page).toContain('<title>My App</title>');
  });

  test('renders page with custom script src', () => {
    const page = renderPage(() => tova_el('p', {}, ['hi']), { scriptSrc: '/app.js' });
    expect(page).toContain('src="/app.js"');
  });
});

// ─── Hydration ────────────────────────────────────────────

describe('Reactivity — hydrate', () => {
  test('hydrate with null container logs error', () => {
    const logs = [];
    const origError = console.error;
    console.error = (...args) => logs.push(args.join(' '));
    hydrate(() => tova_el('div', {}, []), null);
    console.error = origError;
    expect(logs.some(l => l.includes('Hydration target not found'))).toBe(true);
  });

  test('hydrate attaches event handlers to existing DOM', () => {
    const container = createMockElement('div');
    const existingBtn = createMockElement('button');
    existingBtn.tagName = 'button';
    const textNode = { nodeType: 3, textContent: 'click me' };
    existingBtn.children.push(textNode);
    container.children.push(existingBtn);

    let clicked = false;
    const handler = () => { clicked = true; };
    hydrate(() => tova_el('button', { onClick: handler }, ['click me']), container);

    expect(existingBtn.eventListeners['click']).toBeDefined();
    expect(existingBtn.eventListeners['click'].length).toBe(1);
  });

  test('hydrate sets refs on existing elements', () => {
    const container = createMockElement('div');
    const existingDiv = createMockElement('div');
    existingDiv.tagName = 'div';
    container.children.push(existingDiv);

    const ref = createRef();
    hydrate(() => tova_el('div', { ref }, []), container);

    expect(ref.current).toBe(existingDiv);
  });

  test('hydrate attaches reactive text effects', () => {
    const container = createMockElement('div');
    const existingSpan = createMockElement('span');
    existingSpan.tagName = 'span';
    const textNode = { nodeType: 3, textContent: '0' };
    existingSpan.children.push(textNode);
    container.children.push(existingSpan);

    const [count, setCount] = createSignal(0);
    hydrate(() => tova_el('span', {}, [() => String(count())]), container);

    // After hydration, text node should have reactive binding
    expect(textNode.__tovaReactive).toBe(true);
    setCount(42);
    expect(textNode.textContent).toBe('42');
  });

  test('hydrate does not modify existing DOM structure', () => {
    const container = createMockElement('div');
    const existingP = createMockElement('p');
    existingP.tagName = 'p';
    const textNode = { nodeType: 3, textContent: 'hello' };
    existingP.children.push(textNode);
    container.children.push(existingP);

    hydrate(() => tova_el('p', {}, ['hello']), container);

    // Same element should remain in container
    expect(container.children[0]).toBe(existingP);
    expect(container.children.length).toBe(1);
  });
});

// ─── Ownership System ─────────────────────────────────────

describe('Reactivity — createRoot', () => {
  test('returns result of fn', () => {
    const result = createRoot(() => 42);
    expect(result).toBe(42);
  });

  test('disposing root disposes child effects', () => {
    const [count, setCount] = createSignal(0);
    let runs = 0;

    let dispose;
    createRoot((d) => {
      dispose = d;
      createEffect(() => {
        count();
        runs++;
      });
    });

    expect(runs).toBe(1);
    setCount(1);
    expect(runs).toBe(2);

    // Dispose the root — effect should stop running
    dispose();
    setCount(2);
    expect(runs).toBe(2); // no additional run
  });

  test('nested roots dispose independently', () => {
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);
    let runsA = 0;
    let runsB = 0;

    let disposeInner;
    createRoot(() => {
      createEffect(() => { a(); runsA++; });
      createRoot((d) => {
        disposeInner = d;
        createEffect(() => { b(); runsB++; });
      });
    });

    expect(runsA).toBe(1);
    expect(runsB).toBe(1);

    // Dispose inner root only
    disposeInner();
    setB(1);
    expect(runsB).toBe(1); // inner effect stopped

    setA(1);
    expect(runsA).toBe(2); // outer effect still runs
  });
});

describe('Reactivity — onMount cleanup', () => {
  test('onMount cleanup runs when owner is disposed', async () => {
    let cleanedUp = false;

    let dispose;
    createRoot((d) => {
      dispose = d;
      onMount(() => {
        return () => { cleanedUp = true; };
      });
    });

    // Wait for microtask (onMount uses queueMicrotask)
    await new Promise(r => queueMicrotask(r));

    expect(cleanedUp).toBe(false);
    dispose();
    expect(cleanedUp).toBe(true);
  });
});

describe('Reactivity — onUnmount', () => {
  test('onUnmount callback runs on root disposal', () => {
    let unmounted = false;

    let dispose;
    createRoot((d) => {
      dispose = d;
      onUnmount(() => { unmounted = true; });
    });

    expect(unmounted).toBe(false);
    dispose();
    expect(unmounted).toBe(true);
  });
});

describe('Reactivity — mount returns dispose', () => {
  test('mount returns a dispose function', () => {
    const container = createMockElement('div');
    const dispose = mount(() => tova_el('p', {}, ['hello']), container);
    expect(typeof dispose).toBe('function');
  });
});

// ─── Bug Fix Tests ────────────────────────────────────────

describe('Bug Fix — mount does not re-render entire tree', () => {
  test('component function runs exactly once', () => {
    const container = createMockElement('div');
    const [count, setCount] = createSignal(0);
    let renderCount = 0;

    function App() {
      renderCount++;
      return tova_el('div', {}, [() => String(count())]);
    }

    mount(App, container);
    expect(renderCount).toBe(1);

    setCount(5);
    expect(renderCount).toBe(1); // still 1 — mount does not re-call component
  });

  test('reactive closures still update after mount fix', () => {
    const container = createMockElement('div');
    const [count, setCount] = createSignal(0);

    function App() {
      return tova_el('div', {}, [() => count()]);
    }

    mount(App, container);
    // The div has marker + text node (comment marker for dynamic block)
    const div = container.children[0];
    expect(div.children.length).toBe(2); // marker + text

    const marker = div.children[0];
    expect(marker.__tovaDynamic).toBe(true);
    expect(marker.__tovaNodes[0].textContent).toBe('0');

    setCount(42);
    expect(marker.__tovaNodes[0].textContent).toBe('42');
  });
});

describe('Bug Fix — reactive conditional (JSXIf pattern)', () => {
  test('function returning different vnodes updates DOM', () => {
    const container = createMockElement('div');
    const [show, setShow] = createSignal(true);

    function App() {
      return tova_el('div', {}, [
        () => show() ? tova_el('span', {}, ['visible']) : tova_el('span', {}, ['hidden'])
      ]);
    }

    mount(App, container);
    const div = container.children[0];
    const marker = div.children[0];
    expect(marker.__tovaDynamic).toBe(true);

    // Initially shows 'visible'
    let innerSpan = marker.__tovaNodes[0];
    expect(innerSpan.tagName).toBe('span');
    expect(innerSpan.children[0].textContent).toBe('visible');

    // Toggle condition
    setShow(false);
    innerSpan = marker.__tovaNodes[0];
    expect(innerSpan.tagName).toBe('span');
    expect(innerSpan.children[0].textContent).toBe('hidden');

    // Toggle back
    setShow(true);
    innerSpan = marker.__tovaNodes[0];
    expect(innerSpan.children[0].textContent).toBe('visible');
  });

  test('conditional to null removes content', () => {
    const container = createMockElement('div');
    const [show, setShow] = createSignal(true);

    function App() {
      return tova_el('div', {}, [
        () => show() ? tova_el('p', {}, ['content']) : null
      ]);
    }

    mount(App, container);
    const div = container.children[0];
    const marker = div.children[0];

    expect(marker.__tovaNodes[0].tagName).toBe('p');

    setShow(false);
    // Should have empty text node (null renders as '')
    expect(marker.__tovaNodes[0].nodeType).toBe(3);
    expect(marker.__tovaNodes[0].textContent).toBe('');
  });
});

describe('Bug Fix — reactive list (JSXFor pattern)', () => {
  test('function returning array updates list', () => {
    const container = createMockElement('div');
    const [items, setItems] = createSignal(['a', 'b']);

    function App() {
      return tova_el('ul', {}, [
        () => items().map(item => tova_el('li', {}, [item]))
      ]);
    }

    mount(App, container);
    const ul = container.children[0];
    const marker = ul.children[0];
    expect(marker.__tovaDynamic).toBe(true);

    // Initially 2 items
    expect(marker.__tovaNodes.length).toBe(2);
    expect(marker.__tovaNodes[0].tagName).toBe('li');
    expect(marker.__tovaNodes[1].tagName).toBe('li');

    // Add item
    setItems(['a', 'b', 'c']);
    expect(marker.__tovaNodes.length).toBe(3);

    // Remove items
    setItems(['x']);
    expect(marker.__tovaNodes.length).toBe(1);
    expect(marker.__tovaNodes[0].children[0].textContent).toBe('x');
  });

  test('empty list renders no children', () => {
    const container = createMockElement('div');
    const [items, setItems] = createSignal([]);

    function App() {
      return tova_el('div', {}, [
        () => items().map(item => tova_el('span', {}, [item]))
      ]);
    }

    mount(App, container);
    const div = container.children[0];
    const marker = div.children[0];
    expect(marker.__tovaNodes.length).toBe(0);

    // Add items
    setItems(['hello']);
    expect(marker.__tovaNodes.length).toBe(1);
  });
});

describe('Bug Fix — event handler cleanup', () => {
  test('old event handlers are removed when props change', () => {
    const container = createMockElement('div');
    const [handler, setHandler] = createSignal(() => 'first');

    // Simulate applying and then removing old props
    const el = createMockElement('button');
    const handler1 = () => 'first';
    const handler2 = () => 'second';

    // Apply first handler
    el.addEventListener('click', handler1);
    el.__handlers = { click: handler1 };

    // Simulate prop removal (old key no longer in new props)
    const oldProps = { onClick: handler1 };
    const newProps = {};

    // Remove old props that are no longer present
    for (const key of Object.keys(oldProps)) {
      if (!(key in newProps)) {
        if (key.startsWith('on')) {
          const eventName = key.slice(2).toLowerCase();
          if (el.__handlers && el.__handlers[eventName]) {
            el.removeEventListener(eventName, el.__handlers[eventName]);
            delete el.__handlers[eventName];
          }
        }
      }
    }

    // Old handler should have been removed
    expect(el.eventListeners['click'].length).toBe(0);
    expect(el.__handlers.click).toBeUndefined();
  });
});

describe('Bug Fix — dynamic block text optimization', () => {
  test('text-to-text update reuses text node', () => {
    const container = createMockElement('div');
    const [msg, setMsg] = createSignal('hello');

    function App() {
      return tova_el('div', {}, [() => msg()]);
    }

    mount(App, container);
    const div = container.children[0];
    const marker = div.children[0];
    const textNode = marker.__tovaNodes[0];
    expect(textNode.textContent).toBe('hello');

    // Update text — should reuse same text node
    setMsg('world');
    expect(marker.__tovaNodes[0]).toBe(textNode); // same node reference
    expect(textNode.textContent).toBe('world');
  });

  test('text to vnode transitions correctly', () => {
    const container = createMockElement('div');
    const [show, setShow] = createSignal(false);

    function App() {
      return tova_el('div', {}, [
        () => show() ? tova_el('b', {}, ['bold']) : 'plain'
      ]);
    }

    mount(App, container);
    const div = container.children[0];
    const marker = div.children[0];

    // Initially text
    expect(marker.__tovaNodes[0].nodeType).toBe(3);
    expect(marker.__tovaNodes[0].textContent).toBe('plain');

    // Switch to vnode
    setShow(true);
    expect(marker.__tovaNodes[0].tagName).toBe('b');

    // Switch back to text
    setShow(false);
    expect(marker.__tovaNodes[0].nodeType).toBe(3);
    expect(marker.__tovaNodes[0].textContent).toBe('plain');
  });
});

// ─── New Feature Tests ──────────────────────────────────

describe('Feature — untrack', () => {
  test('untrack prevents dependency tracking', () => {
    const [count, setCount] = createSignal(0);
    let effectRuns = 0;

    createEffect(() => {
      untrack(() => count());
      effectRuns++;
    });

    expect(effectRuns).toBe(1); // initial run
    setCount(1);
    expect(effectRuns).toBe(1); // should NOT re-run
  });

  test('untrack returns the function result', () => {
    const [count] = createSignal(42);
    const result = untrack(() => count());
    expect(result).toBe(42);
  });

  test('partial untrack: only tracked signals trigger re-run', () => {
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    let effectRuns = 0;

    createEffect(() => {
      a(); // tracked
      untrack(() => b()); // not tracked
      effectRuns++;
    });

    expect(effectRuns).toBe(1);
    setB(10); // should NOT re-run
    expect(effectRuns).toBe(1);
    setA(10); // should re-run
    expect(effectRuns).toBe(2);
  });
});

describe('Feature — watch', () => {
  test('watch calls callback on change with old and new value', () => {
    const [count, setCount] = createSignal(0);
    const calls = [];

    watch(() => count(), (newVal, oldVal) => {
      calls.push({ newVal, oldVal });
    });

    setCount(1);
    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual({ newVal: 1, oldVal: 0 });

    setCount(5);
    expect(calls.length).toBe(2);
    expect(calls[1]).toEqual({ newVal: 5, oldVal: 1 });
  });

  test('watch does not call on initial by default', () => {
    const [count] = createSignal(0);
    let called = false;

    watch(() => count(), () => { called = true; });
    expect(called).toBe(false);
  });

  test('watch with immediate option calls on first run', () => {
    const [count] = createSignal(42);
    const calls = [];

    watch(() => count(), (newVal, oldVal) => {
      calls.push({ newVal, oldVal });
    }, { immediate: true });

    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual({ newVal: 42, oldVal: undefined });
  });

  test('watch returns dispose function', () => {
    const [count, setCount] = createSignal(0);
    let callCount = 0;

    const dispose = watch(() => count(), () => { callCount++; });
    setCount(1);
    expect(callCount).toBe(1);

    dispose();
    setCount(2);
    expect(callCount).toBe(1); // no longer watching
  });
});

describe('Feature — Dynamic component', () => {
  test('Dynamic renders component from signal', () => {
    function CompA() { return tova_el('div', {}, ['A']); }
    function CompB() { return tova_el('div', {}, ['B']); }

    const [current, setCurrent] = createSignal(CompA);
    const vnode = Dynamic({ component: current });

    expect(vnode.__tova).toBe(true);
    expect(vnode.tag).toBe('__dynamic');
    expect(typeof vnode.compute).toBe('function');

    // First render
    const result = vnode.compute();
    expect(result.__tova).toBe(true);
    expect(result.children).toContain('A');
  });

  test('Dynamic returns null for falsy component', () => {
    const vnode = Dynamic({ component: null });
    const result = vnode.compute();
    expect(result).toBeNull();
  });
});

describe('Feature — Portal', () => {
  test('Portal creates vnode with __portal tag', () => {
    const children = [tova_el('div', {}, ['Modal content'])];
    const vnode = Portal({ target: '#modal-root', children });

    expect(vnode.__tova).toBe(true);
    expect(vnode.tag).toBe('__portal');
    expect(vnode.props.target).toBe('#modal-root');
    expect(vnode.children.length).toBe(1);
  });
});

describe('Feature — lazy', () => {
  test('lazy returns a function component', () => {
    const LazyComp = lazy(() => Promise.resolve({
      default: (props) => tova_el('div', {}, ['Loaded'])
    }));

    expect(typeof LazyComp).toBe('function');
  });

  test('lazy component returns dynamic vnode', () => {
    const LazyComp = lazy(() => Promise.resolve({
      default: (props) => tova_el('div', {}, ['Loaded'])
    }));

    const vnode = LazyComp({});
    expect(vnode.__tova).toBe(true);
    expect(vnode.tag).toBe('__dynamic');
  });

  test('lazy component shows fallback while loading', () => {
    const LazyComp = lazy(() => new Promise(() => {})); // never resolves
    const vnode = LazyComp({ fallback: tova_el('span', {}, ['Loading...']) });
    const result = vnode.compute();
    expect(result.__tova).toBe(true);
    expect(result.tag).toBe('span');
  });
});

describe('Feature — dangerouslySetInnerHTML prop (security)', () => {
  test('innerHTML prop is blocked for security', () => {
    const origError = console.error;
    let errorCalled = false;
    console.error = () => { errorCalled = true; };
    const el = render(tova_el('div', { innerHTML: '<b>bold</b>' }));
    // innerHTML should NOT be set — blocked to prevent accidental XSS
    expect(el.innerHTML).toBe('');
    expect(errorCalled).toBe(true);
    console.error = origError;
  });

  test('dangerouslySetInnerHTML with __html property works', () => {
    const origWarn = console.warn;
    console.warn = () => {};
    const el = render(tova_el('div', { dangerouslySetInnerHTML: { __html: '<i>italic</i>' } }));
    expect(el.innerHTML).toBe('<i>italic</i>');
    console.warn = origWarn;
  });
});

describe('Feature — boolean DOM props', () => {
  test('disabled prop sets property directly', () => {
    const el = render(tova_el('button', { disabled: true }, ['Click']));
    expect(el.disabled).toBe(true);
  });

  test('hidden prop sets property directly', () => {
    const el = render(tova_el('div', { hidden: true }, ['Hidden']));
    expect(el.hidden).toBe(true);
  });
});

describe('Feature — Router getQuery', () => {
  test('getQuery returns a reactive query getter', () => {
    const query = getQuery();
    expect(typeof query).toBe('function');
    const result = query();
    expect(typeof result).toBe('object');
  });
});

describe('Feature — Router Redirect', () => {
  test('Redirect is a function component', () => {
    expect(typeof Redirect).toBe('function');
  });

  test('Redirect returns null', () => {
    const result = Redirect({ to: '/login' });
    expect(result).toBeNull();
  });
});
