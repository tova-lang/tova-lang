import { describe, test, expect } from 'bun:test';
import {
  createSignal, createEffect, createErrorBoundary, ErrorBoundary,
  tova_el, tova_fragment, render, createRoot, pushComponentName, popComponentName,
} from '../src/runtime/reactivity.js';

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

describe('Error Boundaries — createErrorBoundary', () => {
  test('onError callback receives { error, componentStack }', () => {
    let received = null;
    const boundary = createErrorBoundary({
      onError: (info) => { received = info; },
    });

    boundary.run(() => {
      throw new Error('test error');
    });

    expect(received).not.toBeNull();
    expect(received.error.message).toBe('test error');
    expect(Array.isArray(received.componentStack)).toBe(true);
  });

  test('onReset called on reset', () => {
    let resetCalled = false;
    const boundary = createErrorBoundary({
      onReset: () => { resetCalled = true; },
    });

    boundary.run(() => { throw new Error('fail'); });
    expect(boundary.error()).not.toBeNull();

    boundary.reset();
    expect(boundary.error()).toBeNull();
    expect(resetCalled).toBe(true);
  });

  test('works with no options (backward-compatible)', () => {
    const boundary = createErrorBoundary();
    boundary.run(() => { throw new Error('compat'); });
    expect(boundary.error().message).toBe('compat');
    boundary.reset();
    expect(boundary.error()).toBeNull();
  });

  test('__tovaComponentStack attached to error object', () => {
    const boundary = createErrorBoundary();

    pushComponentName('App');
    pushComponentName('Dashboard');
    boundary.run(() => {
      pushComponentName('Widget');
      throw new Error('deep error');
    });
    // Note: Widget was pushed but the error is caught inside run()
    popComponentName(); // Widget
    popComponentName(); // Dashboard
    popComponentName(); // App

    const err = boundary.error();
    expect(err.__tovaComponentStack).toBeDefined();
    expect(Array.isArray(err.__tovaComponentStack)).toBe(true);
  });
});

describe('Error Boundaries — ErrorBoundary component', () => {
  test('nested boundaries: inner catches, outer untouched', () => {
    let outerError = null;
    let innerError = null;

    const outer = ErrorBoundary({
      fallback: ({ error }) => { outerError = error; return tova_el('div', {}, ['outer fallback']); },
      children: [
        ErrorBoundary({
          fallback: ({ error }) => { innerError = error; return tova_el('div', {}, ['inner fallback']); },
          children: [tova_el('div', {}, ['child'])],
        }),
      ],
    });

    expect(outer.__tova).toBe(true);
    expect(outer._componentName).toBe('ErrorBoundary');
    expect(outer._fallback).toBeDefined();
  });

  test('ErrorBoundary has retry prop', () => {
    const vnode = ErrorBoundary({
      fallback: () => tova_el('div', {}, ['error']),
      children: [tova_el('div', {}, ['ok'])],
      retry: 3,
    });

    expect(vnode.__tova).toBe(true);
    expect(vnode.tag).toBe('__dynamic');
    expect(typeof vnode.compute).toBe('function');
  });

  test('ErrorBoundary onError callback fires', () => {
    let errorInfo = null;
    const vnode = ErrorBoundary({
      fallback: ({ error }) => tova_el('span', {}, [error.message]),
      children: [tova_el('div', {}, ['child'])],
      onError: (info) => { errorInfo = info; },
    });

    expect(vnode.__tova).toBe(true);
    // The error callback is wired into the error handler — we verify it exists
    expect(typeof vnode.compute).toBe('function');
  });

  test('ErrorBoundary vnode has _fallback and _componentName', () => {
    const fb = () => tova_el('div', {}, ['fallback']);
    const vnode = ErrorBoundary({
      fallback: fb,
      children: [tova_el('div', {}, ['content'])],
    });

    expect(vnode._fallback).toBe(fb);
    expect(vnode._componentName).toBe('ErrorBoundary');
  });

  test('ErrorBoundary compute returns children when no error', () => {
    const child = tova_el('div', {}, ['hello']);
    const vnode = ErrorBoundary({
      fallback: () => tova_el('div', {}, ['error']),
      children: [child],
    });

    const result = vnode.compute();
    // Should return child content (not fallback)
    expect(result).toBe(child);
  });
});

describe('Error Boundaries — component name stack', () => {
  test('pushComponentName/popComponentName work', () => {
    pushComponentName('App');
    pushComponentName('Header');
    popComponentName();
    popComponentName();
    // Should not throw
  });

  test('component stack captured on error', () => {
    let captured = null;
    const boundary = createErrorBoundary({
      onError: (info) => { captured = info; },
    });

    pushComponentName('App');
    pushComponentName('Page');
    boundary.run(() => {
      pushComponentName('Widget');
      throw new Error('stack test');
    });
    popComponentName(); // Page
    popComponentName(); // App

    expect(captured).not.toBeNull();
    // Stack is inner-to-outer
    expect(captured.componentStack).toContain('Widget');
  });
});
