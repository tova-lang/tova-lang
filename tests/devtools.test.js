import { describe, test, expect, beforeEach } from 'bun:test';
import {
  createSignal, createEffect, createComputed, tova_el, render, __enableDevTools,
} from '../src/runtime/reactivity.js';
import { initDevTools, __devtools_hooks_internal } from '../src/runtime/devtools.js';

// ─── Mock DOM ──────────────────────────────────────────────
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
}

function createMockDocument() {
  return {
    createElement(tag) { return createMockElement(tag); },
    createTextNode(text) {
      return {
        nodeType: 3, textContent: text, data: text, parentNode: null,
        get nextSibling() {
          if (!this.parentNode) return null;
          const siblings = this.parentNode.children;
          const idx = siblings.indexOf(this);
          return idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
        },
      };
    },
    createComment(text) {
      return {
        nodeType: 8, textContent: text, data: text, parentNode: null,
        get nextSibling() {
          if (!this.parentNode) return null;
          const siblings = this.parentNode.children;
          const idx = siblings.indexOf(this);
          return idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
        },
      };
    },
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
    body: createMockElement('body'),
    head: createMockElement('head'),
  };
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = createMockDocument();
}

// ─── Tests ──────────────────────────────────────────────────

describe('DevTools — initDevTools', () => {
  test('initDevTools creates window.__TOVA_DEVTOOLS__', () => {
    // Set up window for test
    const origWindow = globalThis.window;
    globalThis.window = {};

    initDevTools();

    expect(window.__TOVA_DEVTOOLS__).toBeDefined();
    expect(typeof window.__TOVA_DEVTOOLS__.getComponentTree).toBe('function');
    expect(typeof window.__TOVA_DEVTOOLS__.getSignal).toBe('function');
    expect(typeof window.__TOVA_DEVTOOLS__.setSignal).toBe('function');
    expect(typeof window.__TOVA_DEVTOOLS__.getOwnershipTree).toBe('function');
    expect(window.__TOVA_DEVTOOLS__.signals).toBeDefined();
    expect(window.__TOVA_DEVTOOLS__.effects).toBeDefined();
    expect(window.__TOVA_DEVTOOLS__.components).toBeDefined();

    globalThis.window = origWindow;
  });

  test('initDevTools creates window.__TOVA_PERF__', () => {
    const origWindow = globalThis.window;
    globalThis.window = {};

    initDevTools();

    expect(window.__TOVA_PERF__).toBeDefined();
    expect(Array.isArray(window.__TOVA_PERF__.renders)).toBe(true);
    expect(Array.isArray(window.__TOVA_PERF__.effects)).toBe(true);
    expect(Array.isArray(window.__TOVA_PERF__.signals)).toBe(true);
    expect(typeof window.__TOVA_PERF__.summary).toBe('function');
    expect(typeof window.__TOVA_PERF__.clear).toBe('function');

    globalThis.window = origWindow;
  });
});

describe('DevTools — signal tracking', () => {
  test('signal creation registers in registry', () => {
    const origWindow = globalThis.window;
    globalThis.window = {};
    const dt = initDevTools();

    const [count, setCount] = createSignal(0, 'count');

    // Find the signal by name
    let found = false;
    for (const [, entry] of dt.signals) {
      if (entry.name === 'count') {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);

    globalThis.window = origWindow;
  });

  test('console read/write of signals works', () => {
    const origWindow = globalThis.window;
    globalThis.window = {};
    const dt = initDevTools();

    const [count, setCount] = createSignal(42, 'testSignal');

    // Find signal id
    let signalId = null;
    for (const [id, entry] of dt.signals) {
      if (entry.name === 'testSignal') {
        signalId = id;
        break;
      }
    }

    expect(signalId).not.toBeNull();

    // Read
    const read = dt.getSignal(signalId);
    expect(read).toBeDefined();
    expect(read.value).toBe(42);

    // Write
    const success = dt.setSignal(signalId, 100);
    expect(success).toBe(true);
    expect(count()).toBe(100);

    globalThis.window = origWindow;
  });
});

describe('DevTools — effect tracking', () => {
  test('effect timing recorded', () => {
    const origWindow = globalThis.window;
    globalThis.window = {};
    const dt = initDevTools();

    let ran = false;
    createEffect(() => { ran = true; });

    expect(ran).toBe(true);
    // At least one effect should be tracked
    expect(dt.perf.effects.length).toBeGreaterThan(0);

    globalThis.window = origWindow;
  });
});

describe('DevTools — component attributes', () => {
  test('data-tova-component attribute set on rendered elements with _componentName', () => {
    const origWindow = globalThis.window;
    globalThis.window = {};
    initDevTools();

    const vnode = tova_el('div', { className: 'wrapper' }, ['test']);
    vnode._componentName = 'MyComponent';

    const el = render(vnode);
    expect(el.attributes['data-tova-component']).toBe('MyComponent');

    globalThis.window = origWindow;
  });
});

describe('DevTools — performance', () => {
  test('summary returns correct aggregates', () => {
    const origWindow = globalThis.window;
    globalThis.window = {};
    const dt = initDevTools();

    // Create some activity
    const [x, setX] = createSignal(0, 'x');
    createEffect(() => { x(); });
    setX(1);
    setX(2);

    const summary = dt.perf.summary();
    expect(typeof summary.totalRenders).toBe('number');
    expect(typeof summary.totalEffects).toBe('number');
    expect(typeof summary.totalSignalUpdates).toBe('number');
    expect(summary.totalSignalUpdates).toBeGreaterThanOrEqual(2);

    globalThis.window = origWindow;
  });

  test('clear resets perf data', () => {
    const origWindow = globalThis.window;
    globalThis.window = {};
    const dt = initDevTools();

    const [y, setY] = createSignal(0, 'y');
    createEffect(() => { y(); });
    setY(1);

    dt.perf.clear();

    const summary = dt.perf.summary();
    expect(summary.totalEffects).toBe(0);
    expect(summary.totalSignalUpdates).toBe(0);
    expect(summary.totalRenders).toBe(0);

    globalThis.window = origWindow;
  });
});

describe('DevTools — hooks disabled', () => {
  test('hooks are no-ops when DevTools not enabled', () => {
    // Disable devtools by passing null
    __enableDevTools(null);

    // These should all work fine without devtools
    const [a, setA] = createSignal(1);
    expect(a()).toBe(1);
    setA(2);
    expect(a()).toBe(2);

    let effectRan = false;
    createEffect(() => { a(); effectRan = true; });
    expect(effectRan).toBe(true);
  });
});
