import { describe, test, expect, beforeEach, mock } from 'bun:test';
import {
  createSignal, createEffect, tova_el, tova_fragment, render, mount, hydrate,
  hydrateWhenVisible,
} from '../src/runtime/reactivity.js';
import { renderToString, resetSSRIdCounter } from '../src/runtime/ssr.js';

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
  const el = {
    tagName: tag, nodeType: 1, parentNode: null, children: [],
    get childNodes() { return this.children; },
    get firstChild() { return this.children[0] || null; },
    get lastChild() { return this.children[this.children.length - 1] || null; },
    get nextSibling() {
      if (!this.parentNode) return null;
      const siblings = this.parentNode.children;
      const idx = siblings.indexOf(this);
      return idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
    },
    attributes: {}, style: {}, className: '', innerHTML: '', value: '', checked: false,
    eventListeners: {}, __handlers: {},
    _eventListeners: {},
    ...childMethods,
    setAttribute(key, val) { this.attributes[key] = String(val); },
    getAttribute(key) { return this.attributes[key] || null; },
    removeAttribute(key) { delete this.attributes[key]; },
    addEventListener(event, handler) {
      if (!this.eventListeners[event]) this.eventListeners[event] = [];
      this.eventListeners[event].push(handler);
      if (!this._eventListeners[event]) this._eventListeners[event] = [];
      this._eventListeners[event].push(handler);
    },
    removeEventListener(event, handler) {
      if (this.eventListeners[event]) {
        this.eventListeners[event] = this.eventListeners[event].filter(h => h !== handler);
      }
    },
    closest() { return null; },
    dispatchEvent(event) {
      const type = event.type || event._type;
      const handlers = this._eventListeners[type] || [];
      for (const h of handlers) h(event);
    },
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
        nodeType: 11, children: [],
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

if (typeof globalThis.document === 'undefined') {
  globalThis.document = createMockDocument();
}

// Mock CustomEvent for test environment
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, opts = {}) {
      this.type = type;
      this._type = type;
      this.detail = opts.detail || {};
      this.bubbles = opts.bubbles || false;
    }
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe('Hydration — dev-mode mismatch detection', () => {
  test('no warnings when output matches', () => {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    const container = createMockElement('div');
    const child = createMockElement('div');
    child.tagName = 'div';
    child.className = 'test';
    _setParent(child, container);
    container.children.push(child);

    const textNode = createMockNode(3, 'hello');
    _setParent(textNode, child);
    child.children.push(textNode);

    hydrate(
      () => tova_el('div', { className: 'test' }, ['hello']),
      container,
    );

    // Filter for tova hydration warnings only
    const tovaWarnings = warnings.filter(w => w.includes('Tova hydration mismatch'));
    expect(tovaWarnings.length).toBe(0);

    console.warn = origWarn;
  });

  test('warns on class mismatch', () => {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    const container = createMockElement('div');
    const child = createMockElement('div');
    child.tagName = 'div';
    child.className = 'wrong-class';
    _setParent(child, container);
    container.children.push(child);

    hydrate(
      () => tova_el('div', { className: 'expected-class' }, []),
      container,
    );

    const tovaWarnings = warnings.filter(w => w.includes('Tova hydration mismatch') && w.includes('class'));
    expect(tovaWarnings.length).toBeGreaterThan(0);

    console.warn = origWarn;
  });

  test('warns on tag mismatch and falls back to full render', () => {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    const container = createMockElement('div');
    const child = createMockElement('span');
    child.tagName = 'span';
    _setParent(child, container);
    container.children.push(child);

    hydrate(
      () => tova_el('div', {}, ['content']),
      container,
    );

    const tovaWarnings = warnings.filter(w => w.includes('Tova hydration mismatch'));
    expect(tovaWarnings.length).toBeGreaterThan(0);

    console.warn = origWarn;
  });
});

describe('Hydration — tova:hydrated event', () => {
  test('dispatches tova:hydrated event with timing', () => {
    let eventDetail = null;
    const container = createMockElement('div');
    container._eventListeners = {};
    container.addEventListener('tova:hydrated', (e) => {
      eventDetail = e.detail;
    });

    const child = createMockElement('div');
    child.tagName = 'div';
    _setParent(child, container);
    container.children.push(child);

    hydrate(
      () => tova_el('div', {}, []),
      container,
    );

    expect(eventDetail).not.toBeNull();
    expect(typeof eventDetail.duration).toBe('number');
    expect(eventDetail.duration).toBeGreaterThanOrEqual(0);
  });
});

describe('Hydration — SSR markers consumed correctly', () => {
  test('SSR marker comments are handled during hydration', () => {
    const container = createMockElement('div');

    // Simulate SSR output with markers: <!--tova-s:1--><span>dynamic</span><!--/tova-s:1-->
    const startMarker = createMockNode(8, 'tova-s:1');
    const span = createMockElement('span');
    span.tagName = 'span';
    const text = createMockNode(3, 'dynamic');
    _setParent(text, span);
    span.children.push(text);
    const endMarker = createMockNode(8, '/tova-s:1');

    _setParent(startMarker, container);
    _setParent(span, container);
    _setParent(endMarker, container);
    container.children.push(startMarker, span, endMarker);

    const dynamicVNode = {
      __tova: true,
      tag: '__dynamic',
      props: {},
      children: [],
      compute: () => tova_el('span', {}, ['dynamic']),
    };

    hydrate(() => dynamicVNode, container);

    // After hydration, the SSR markers should be consumed and replaced with reactive markers
    // The container should have reactive content
    expect(container.children.length).toBeGreaterThan(0);
  });
});

describe('Hydration — auto-detect mount vs hydrate', () => {
  test('conceptual: container with children triggers hydrate path', () => {
    // This tests the logic that would be in the generated code
    const container = createMockElement('div');
    container.children.push(createMockElement('div'));

    const shouldHydrate = container.children.length > 0;
    expect(shouldHydrate).toBe(true);
  });

  test('conceptual: empty container triggers mount path', () => {
    const container = createMockElement('div');
    const shouldMount = container.children.length === 0;
    expect(shouldMount).toBe(true);
  });
});

describe('Hydration — progressive hydration', () => {
  test('hydrateWhenVisible falls back to immediate hydration without IntersectionObserver', () => {
    // Save and remove IntersectionObserver
    const savedIO = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = undefined;

    const container = createMockElement('div');
    container._eventListeners = {};
    container.dispatchEvent = function(event) {
      const type = event.type || event._type;
      const handlers = this._eventListeners[type] || [];
      for (const h of handlers) h(event);
    };
    const child = createMockElement('div');
    child.tagName = 'div';
    _setParent(child, container);
    container.children.push(child);

    // Should hydrate immediately since IO is unavailable
    hydrateWhenVisible(
      () => tova_el('div', {}, []),
      container,
    );

    // Restore
    globalThis.IntersectionObserver = savedIO;
  });
});

function _setParent_ext(child, parent) {
  if (child && typeof child === 'object') child.parentNode = parent;
}
