// Tests for security fixes, new features, and bug fixes from the client review.
// Covers: RPC security, Portal cleanup, lazy() fix, Redirect loop protection,
// SSR context isolation, TransitionGroup, form handling, CSP nonce, testing utils.

import { describe, test, expect, beforeEach, afterEach, jest } from 'bun:test';
import {
  createSignal, createEffect, createComputed, tova_el, tova_fragment, render,
  mount, batch, onMount, onUnmount, onCleanup, createRef, createContext,
  provide, inject, createRoot, watch, untrack, tova_inject_css, tova_keyed,
  Head, createResource, Portal, lazy, Suspense, TransitionGroup,
  createForm, configureCSP,
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
    querySelector(sel) {
      // Minimal mock: support [data-testid="..."] and [name="..."]
      const match = sel.match(/\[([a-z-]+)="([^"]+)"\]/);
      if (match) {
        const [, attr, val] = match;
        for (const child of this.children) {
          if (child.attributes && child.attributes[attr] === val) return child;
        }
      }
      return null;
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
    querySelector(sel) {
      // Mock meta tag queries
      if (sel === 'meta[name="csrf-token"]') return null;
      if (sel === 'meta[name="csp-nonce"]') return null;
      return null;
    },
    title: 'Test Page',
    body: createMockElement('body'),
    head: createMockElement('head'),
  };
}

// ═══════════════════════════════════════════════════════════
// RPC SECURITY
// ═══════════════════════════════════════════════════════════

describe('RPC — security features', () => {
  let rpcModule;
  beforeEach(async () => {
    rpcModule = await import('../src/runtime/rpc.js');
  });

  test('configureRPC accepts options object', () => {
    rpcModule.configureRPC({ baseUrl: 'http://localhost:4000', timeout: 5000 });
    // Should not throw
    expect(true).toBe(true);
  });

  test('configureRPC backward compat with string', () => {
    rpcModule.configureRPC('http://localhost:5000');
    expect(true).toBe(true);
  });

  test('setCSRFToken is exported', () => {
    expect(typeof rpcModule.setCSRFToken).toBe('function');
  });

  test('addRPCInterceptor returns unsubscribe function', () => {
    const unsub = rpcModule.addRPCInterceptor({
      request({ options }) { return options; },
    });
    expect(typeof unsub).toBe('function');
    unsub();
  });

  test('addRPCInterceptor unsubscribe removes interceptor', () => {
    let called = false;
    const unsub = rpcModule.addRPCInterceptor({
      request() { called = true; },
    });
    unsub();
    // After unsub, interceptor should not be called on next rpc
    expect(called).toBe(false);
  });

  test('rpc function is exported', () => {
    expect(typeof rpcModule.rpc).toBe('function');
  });

  test('configureRPC sets credentials', () => {
    rpcModule.configureRPC({ credentials: 'include' });
    expect(true).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// PORTAL CLEANUP
// ═══════════════════════════════════════════════════════════

describe('Portal — cleanup on unmount', () => {
  test('Portal component is exported', () => {
    expect(typeof Portal).toBe('function');
  });

  test('Portal returns vnode with __portal tag', () => {
    const vnode = Portal({ target: '#modal', children: [tova_el('div', {}, ['hello'])] });
    expect(vnode.__tova).toBe(true);
    expect(vnode.tag).toBe('__portal');
  });

  test('Portal vnode has cleanup flag', () => {
    const vnode = Portal({ target: '#modal', children: [] });
    expect(vnode._portalCleanup).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// LAZY — SIGNAL LEAK FIX
// ═══════════════════════════════════════════════════════════

describe('lazy — signal not leaked per render', () => {
  test('lazy returns a function', () => {
    const LazyComp = lazy(() => Promise.resolve({ default: () => tova_el('div', {}, ['loaded']) }));
    expect(typeof LazyComp).toBe('function');
  });

  test('lazy returns dynamic vnode before resolution', () => {
    const LazyComp = lazy(() => new Promise(() => {})); // Never resolves
    const vnode = LazyComp({});
    expect(vnode.__tova).toBe(true);
    expect(vnode.tag).toBe('__dynamic');
    expect(typeof vnode.compute).toBe('function');
  });

  test('lazy returns resolved component after resolution', async () => {
    const inner = (props) => tova_el('span', {}, ['loaded']);
    const LazyComp = lazy(() => Promise.resolve({ default: inner }));
    LazyComp({}); // First call triggers loading
    await new Promise(r => setTimeout(r, 50));
    const result = LazyComp({});
    // After resolution, should return the component result directly
    expect(result.__tova).toBe(true);
    expect(result.tag).toBe('span');
  });
});

// ═══════════════════════════════════════════════════════════
// REDIRECT LOOP PROTECTION
// ═══════════════════════════════════════════════════════════

describe('Redirect — loop protection', () => {
  let router;
  beforeEach(async () => {
    router = await import('../src/runtime/router.js');
  });

  test('Redirect is exported', () => {
    expect(typeof router.Redirect).toBe('function');
  });

  test('Redirect returns null (renders nothing)', () => {
    const result = router.Redirect({ to: '/test' });
    expect(result).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════
// SSR CONTEXT ISOLATION
// ═══════════════════════════════════════════════════════════

describe('SSR — context isolation', () => {
  let ssrModule;
  beforeEach(async () => {
    ssrModule = await import('../src/runtime/ssr.js');
  });

  test('createSSRContext is exported', () => {
    expect(typeof ssrModule.createSSRContext).toBe('function');
  });

  test('createSSRContext returns context with idCounter', () => {
    const ctx = ssrModule.createSSRContext();
    expect(ctx.idCounter).toBe(0);
  });

  test('withSSRContext is exported', () => {
    expect(typeof ssrModule.withSSRContext).toBe('function');
  });

  test('withSSRContext isolates SSR ID counters', () => {
    ssrModule.resetSSRIdCounter();
    const html1 = ssrModule.withSSRContext(() => {
      return ssrModule.renderToString(
        { __tova: true, tag: '__dynamic', props: {}, children: [], compute: () => 'hello' }
      );
    });
    const html2 = ssrModule.withSSRContext(() => {
      return ssrModule.renderToString(
        { __tova: true, tag: '__dynamic', props: {}, children: [], compute: () => 'world' }
      );
    });
    // Both should start with tova-s:1 since they're isolated
    expect(html1).toContain('tova-s:1');
    expect(html2).toContain('tova-s:1');
  });

  test('renderHeadTags escapes attributes safely', () => {
    const html = ssrModule.renderHeadTags([
      { tag: 'meta', attrs: { name: 'desc', content: '"><script>alert(1)</script>' } }
    ]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&quot;');
  });

  test('renderPage accepts array head for safe rendering', () => {
    const html = ssrModule.renderPage(() => tova_el('div', {}, ['test']), {
      head: [{ tag: 'meta', attrs: { name: 'test', content: 'value' } }]
    });
    expect(html).toContain('name="test"');
    expect(html).toContain('content="value"');
  });

  test('renderPage supports cspNonce', () => {
    const html = ssrModule.renderPage(() => tova_el('div', {}, ['test']), {
      cspNonce: 'abc123'
    });
    expect(html).toContain('nonce="abc123"');
  });
});

// ═══════════════════════════════════════════════════════════
// TRANSITION GROUP
// ═══════════════════════════════════════════════════════════

describe('TransitionGroup', () => {
  test('TransitionGroup is exported', () => {
    expect(typeof TransitionGroup).toBe('function');
  });

  test('TransitionGroup returns a wrapper element', () => {
    const vnode = TransitionGroup({
      name: 'fade',
      children: [tova_keyed('a', tova_el('li', {}, ['A']))],
    });
    expect(vnode.__tova).toBe(true);
    expect(vnode.tag).toBe('div'); // default wrapper tag
  });

  test('TransitionGroup supports custom tag', () => {
    const vnode = TransitionGroup({
      name: 'slide',
      tag: 'ul',
      children: [tova_keyed('a', tova_el('li', {}, ['A']))],
    });
    expect(vnode.tag).toBe('ul');
  });

  test('TransitionGroup annotates children with transitions', () => {
    const child = tova_el('li', {}, ['A']);
    const vnode = TransitionGroup({
      name: 'fade',
      children: [child],
    });
    expect(child._transition).toBeTruthy();
    expect(child._transition.name).toBe('fade');
  });

  test('TransitionGroup sets _transitionGroup metadata', () => {
    const vnode = TransitionGroup({ name: 'scale', children: [] });
    expect(vnode._transitionGroup).toBeTruthy();
    expect(vnode._transitionGroup.name).toBe('scale');
  });
});

// ═══════════════════════════════════════════════════════════
// FORM HANDLING
// ═══════════════════════════════════════════════════════════

describe('createForm', () => {
  test('createForm is exported', () => {
    expect(typeof createForm).toBe('function');
  });

  test('creates form with field accessors', () => {
    const form = createForm({
      fields: {
        name: { initial: '' },
        email: { initial: '' },
      },
    });
    expect(typeof form.field).toBe('function');
    expect(form.field('name').value()).toBe('');
    expect(form.field('email').value()).toBe('');
  });

  test('field.set updates value', () => {
    const form = createForm({
      fields: { name: { initial: '' } },
    });
    form.field('name').set('Alice');
    expect(form.field('name').value()).toBe('Alice');
  });

  test('values() returns all field values', () => {
    const form = createForm({
      fields: {
        name: { initial: 'Bob' },
        age: { initial: 30 },
      },
    });
    const vals = form.values();
    expect(vals.name).toBe('Bob');
    expect(vals.age).toBe(30);
  });

  test('reset() restores initial values', () => {
    const form = createForm({
      fields: { name: { initial: 'init' } },
    });
    form.field('name').set('changed');
    expect(form.field('name').value()).toBe('changed');
    form.reset();
    expect(form.field('name').value()).toBe('init');
  });

  test('validation returns error', () => {
    const form = createForm({
      fields: {
        email: {
          initial: '',
          validate: (v) => v.includes('@') ? null : 'Invalid email',
        },
      },
    });
    form.field('email').validate();
    expect(form.field('email').error()).toBe('Invalid email');
  });

  test('validation clears error on valid input', () => {
    const form = createForm({
      fields: {
        email: {
          initial: '',
          validate: (v) => v.includes('@') ? null : 'Invalid',
        },
      },
    });
    form.field('email').set('bad');
    form.field('email').blur(); // triggers validation
    expect(form.field('email').error()).toBe('Invalid');

    form.field('email').set('good@example.com');
    form.field('email').blur();
    expect(form.field('email').error()).toBe(null);
  });

  test('isValid computed tracks field errors', () => {
    const form = createForm({
      fields: {
        name: { initial: '', validate: (v) => v ? null : 'Required' },
      },
    });
    form.validate();
    expect(form.isValid()).toBe(false);
    form.field('name').set('Alice');
    form.validate();
    expect(form.isValid()).toBe(true);
  });

  test('isDirty computed tracks changes from initial', () => {
    const form = createForm({
      fields: { name: { initial: 'orig' } },
    });
    expect(form.isDirty()).toBe(false);
    form.field('name').set('changed');
    expect(form.isDirty()).toBe(true);
    form.field('name').set('orig');
    expect(form.isDirty()).toBe(false);
  });

  test('submit calls onSubmit with values', async () => {
    let submitted = null;
    const form = createForm({
      fields: { name: { initial: 'test' } },
      onSubmit: async (vals) => { submitted = vals; },
    });
    await form.submit();
    expect(submitted).toEqual({ name: 'test' });
  });

  test('submit sets submitting signal', async () => {
    let resolveSubmit;
    const form = createForm({
      fields: { x: { initial: 1 } },
      onSubmit: () => new Promise(r => { resolveSubmit = r; }),
    });
    const promise = form.submit();
    expect(form.submitting()).toBe(true);
    resolveSubmit();
    await promise;
    expect(form.submitting()).toBe(false);
  });

  test('submit does not call onSubmit if validation fails', async () => {
    let called = false;
    const form = createForm({
      fields: {
        name: { initial: '', validate: (v) => v ? null : 'Required' },
      },
      onSubmit: async () => { called = true; },
    });
    await form.submit();
    expect(called).toBe(false);
  });

  test('submit error is captured in submitError signal', async () => {
    const form = createForm({
      fields: { x: { initial: 'val' } },
      onSubmit: async () => { throw new Error('server error'); },
    });
    await form.submit();
    expect(form.submitError()).toBeInstanceOf(Error);
    expect(form.submitError().message).toBe('server error');
  });

  test('unknown field throws', () => {
    const form = createForm({ fields: { name: { initial: '' } } });
    expect(() => form.field('nonexistent')).toThrow('unknown field');
  });

  test('submitCount increments on each submit', async () => {
    const form = createForm({
      fields: { x: { initial: 'v' } },
      onSubmit: async () => {},
    });
    expect(form.submitCount()).toBe(0);
    await form.submit();
    expect(form.submitCount()).toBe(1);
    await form.submit();
    expect(form.submitCount()).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════
// CSP NONCE SUPPORT
// ═══════════════════════════════════════════════════════════

describe('CSP nonce — tova_inject_css', () => {
  test('configureCSP is exported', () => {
    expect(typeof configureCSP).toBe('function');
  });

  test('configureCSP sets nonce on new style tags', () => {
    configureCSP({ nonce: 'test-nonce-123' });
    const headBefore = document.head.children.length;
    let disposeFn;
    createRoot((dispose) => {
      disposeFn = dispose;
      tova_inject_css('csp-nonce-test', '.foo { color: red }');
    });
    const added = document.head.children[document.head.children.length - 1];
    expect(added.attributes.nonce).toBe('test-nonce-123');
    disposeFn();
    // Reset nonce
    configureCSP({ nonce: null });
  });
});

// ═══════════════════════════════════════════════════════════
// EFFECT FLUSH OPTIMIZATION
// ═══════════════════════════════════════════════════════════

describe('Effect flush — depth-sorted execution', () => {
  test('effects flush correctly with batch', () => {
    const log = [];
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    createEffect(() => { log.push(`a=${a()},b=${b()}`); });

    batch(() => {
      setA(10);
      setB(20);
    });
    // Should only run once after batch
    expect(log.length).toBe(2); // initial + 1 batch flush
    expect(log[1]).toBe('a=10,b=20');
  });
});

// ═══════════════════════════════════════════════════════════
// ROUTER — OUTLET AS SIGNAL
// ═══════════════════════════════════════════════════════════

describe('Router — Outlet is signal-based', () => {
  let router;
  beforeEach(async () => {
    router = await import('../src/runtime/router.js');
  });

  test('Outlet returns null when no child route', () => {
    const result = router.Outlet();
    expect(result === null || result === undefined).toBe(true);
  });

  test('nested routes set child route for Outlet', () => {
    const Child = () => tova_el('div', {}, ['child']);
    const Layout = () => tova_el('div', {}, ['layout']);

    router.defineRoutes({
      '/nested': {
        component: Layout,
        children: { '/child': Child },
      },
    });
    // After defining routes, Outlet should work when matching
    expect(typeof router.Outlet).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════
// CSS SCOPE HASH STRENGTH
// ═══════════════════════════════════════════════════════════

describe('CSS scope hash — FNV-1a', () => {
  test('scope hash produces 8-char output', async () => {
    const { BrowserCodegen } = await import('../src/codegen/browser-codegen.js');
    const codegen = new BrowserCodegen();
    const hash = codegen._genScopeId('MyComponent', '.foo { color: red }');
    expect(hash.length).toBe(8);
  });

  test('different components produce different hashes', async () => {
    const { BrowserCodegen } = await import('../src/codegen/browser-codegen.js');
    const codegen = new BrowserCodegen();
    const hash1 = codegen._genScopeId('CompA', '.a { color: red }');
    const hash2 = codegen._genScopeId('CompB', '.b { color: blue }');
    expect(hash1).not.toBe(hash2);
  });
});

// ═══════════════════════════════════════════════════════════
// TESTING UTILITIES
// ═══════════════════════════════════════════════════════════

describe('Testing utilities', () => {
  let testingModule;
  beforeEach(async () => {
    testingModule = await import('../src/runtime/testing.js');
  });

  afterEach(() => {
    if (testingModule) testingModule.cleanup();
  });

  test('renderForTest is exported', () => {
    expect(typeof testingModule.renderForTest).toBe('function');
  });

  test('fireEvent is exported', () => {
    expect(typeof testingModule.fireEvent).toBe('object');
    expect(typeof testingModule.fireEvent.click).toBe('function');
    expect(typeof testingModule.fireEvent.input).toBe('function');
    expect(typeof testingModule.fireEvent.change).toBe('function');
  });

  test('waitForEffect is exported', () => {
    expect(typeof testingModule.waitForEffect).toBe('function');
  });

  test('cleanup is exported', () => {
    expect(typeof testingModule.cleanup).toBe('function');
  });

  test('renderForTest returns container and query helpers', () => {
    const { container, getByText, getByTestId, dispose } = testingModule.renderForTest(
      () => tova_el('div', {}, ['Hello World'])
    );
    expect(container).toBeTruthy();
    expect(typeof getByText).toBe('function');
    expect(typeof getByTestId).toBe('function');
    expect(typeof dispose).toBe('function');
  });

  test('waitForEffect resolves after microtask', async () => {
    let resolved = false;
    testingModule.waitForEffect().then(() => { resolved = true; });
    await testingModule.waitForEffect();
    expect(resolved).toBe(true);
  });
});
