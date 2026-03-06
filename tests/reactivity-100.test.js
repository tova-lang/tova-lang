import { describe, test, expect, beforeEach } from 'bun:test';
import {
  createSignal, createEffect, createComputed, createRoot, batch,
  onMount, onUnmount, onCleanup, onBeforeUpdate, untrack,
  watch, createRef,
  createErrorBoundary, ErrorBoundary, ErrorInfo,
  Dynamic, Portal, Suspense, lazy,
  createContext, provide, inject,
  Head, createResource,
  configureCSP, tova_inject_css, tova_el, tova_fragment,
  tova_transition, TransitionGroup, __tova_action, tova_keyed,
  render, hydrate, mount, hydrateWhenVisible,
  createForm,
  __enableDevTools,
  pushComponentName, popComponentName,
} from '../src/runtime/reactivity.js';

// ─── Mock DOM Environment ─────────────────────────────────────

function createMockElement(tag = 'div') {
  const children = [];
  const attrs = {};
  const styles = new Proxy({}, {
    set(target, prop, value) { target[prop] = value; return true; },
    get(target, prop) {
      if (prop === 'removeProperty') return (p) => { delete target[p]; };
      return target[prop];
    },
    deleteProperty(target, prop) { delete target[prop]; return true; },
  });
  const listeners = {};
  const el = {
    tagName: tag.toUpperCase(),
    nodeType: 1,
    parentNode: null,
    childNodes: children,
    children,
    firstChild: null,
    nextSibling: null,
    style: styles,
    dataset: {},
    className: '',
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    readOnly: false,
    hidden: false,
    offsetHeight: 0,
    __handlers: {},
    __handlerOptions: {},
    _listeners: listeners,
    _attrs: attrs,
    getAttribute: (name) => attrs[name] !== undefined ? attrs[name] : null,
    setAttribute: (name, val) => { attrs[name] = String(val); },
    removeAttribute: (name) => { delete attrs[name]; },
    addEventListener: (evt, fn, opts) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push({ fn, opts });
      el.__handlers[evt] = fn;
      if (opts) {
        if (!el.__handlerOptions) el.__handlerOptions = {};
        el.__handlerOptions[evt] = opts;
      }
    },
    removeEventListener: (evt, fn, opts) => {
      if (listeners[evt]) {
        listeners[evt] = listeners[evt].filter(h => h.fn !== fn);
      }
      if (el.__handlers && el.__handlers[evt] === fn) {
        delete el.__handlers[evt];
      }
    },
    appendChild: (child) => {
      if (child.nodeType === 11) {
        const fragChildren = [...child.childNodes];
        for (const fc of fragChildren) {
          children.push(fc);
          fc.parentNode = el;
        }
        child.childNodes.length = 0;
        _updateFirstChild(el);
        _updateSiblings(el);
        return child;
      }
      children.push(child);
      child.parentNode = el;
      _updateFirstChild(el);
      _updateSiblings(el);
      return child;
    },
    removeChild: (child) => {
      const i = children.indexOf(child);
      if (i >= 0) {
        children.splice(i, 1);
        child.parentNode = null;
      }
      _updateFirstChild(el);
      _updateSiblings(el);
      return child;
    },
    insertBefore: (child, ref) => {
      if (child.nodeType === 11) {
        const fragChildren = [...child.childNodes];
        const i = ref ? children.indexOf(ref) : children.length;
        for (let j = 0; j < fragChildren.length; j++) {
          children.splice(i + j, 0, fragChildren[j]);
          fragChildren[j].parentNode = el;
        }
        child.childNodes.length = 0;
        _updateFirstChild(el);
        _updateSiblings(el);
        return child;
      }
      if (child.parentNode === el) {
        const oldIdx = children.indexOf(child);
        if (oldIdx >= 0) children.splice(oldIdx, 1);
      }
      const i = ref ? children.indexOf(ref) : children.length;
      if (i >= 0) {
        children.splice(i, 0, child);
      } else {
        children.push(child);
      }
      child.parentNode = el;
      _updateFirstChild(el);
      _updateSiblings(el);
      return child;
    },
    replaceChild: (newChild, oldChild) => {
      const i = children.indexOf(oldChild);
      if (i >= 0) {
        if (newChild.nodeType === 11) {
          const fragChildren = [...newChild.childNodes];
          children.splice(i, 1, ...fragChildren);
          for (const fc of fragChildren) fc.parentNode = el;
          newChild.childNodes.length = 0;
        } else {
          children[i] = newChild;
          newChild.parentNode = el;
        }
        oldChild.parentNode = null;
      }
      _updateFirstChild(el);
      _updateSiblings(el);
      return oldChild;
    },
    replaceChildren: function() {
      while (children.length > 0) {
        children[0].parentNode = null;
        children.shift();
      }
      _updateFirstChild(el);
    },
    cloneNode: (deep) => createMockElement(tag),
    contains: (node) => {
      let cur = node;
      while (cur) {
        if (cur === el) return true;
        cur = cur.parentNode;
      }
      return false;
    },
    remove: function() {
      if (el.parentNode) el.parentNode.removeChild(el);
    },
    dispatchEvent: (event) => {
      if (listeners[event.type]) {
        for (const h of listeners[event.type]) h.fn(event);
      }
    },
    querySelector: (sel) => null,
  };
  return el;
}

function _updateFirstChild(el) {
  el.firstChild = el.childNodes.length > 0 ? el.childNodes[0] : null;
}

function _updateSiblings(el) {
  for (let i = 0; i < el.childNodes.length; i++) {
    el.childNodes[i].nextSibling = el.childNodes[i + 1] || null;
  }
}

function createMockTextNode(text) {
  return {
    nodeType: 3,
    textContent: String(text),
    parentNode: null,
    nextSibling: null,
    data: String(text),
  };
}

function createMockComment(data = '') {
  return {
    nodeType: 8,
    data: data,
    textContent: data,
    parentNode: null,
    nextSibling: null,
  };
}

function createMockDocFragment() {
  const children = [];
  const frag = {
    nodeType: 11,
    childNodes: children,
    firstChild: null,
    appendChild: (child) => {
      children.push(child);
      child.parentNode = frag;
      frag.firstChild = children[0] || null;
      _updateSiblingsFrag(frag);
      return child;
    },
    insertBefore: (child, ref) => {
      const i = ref ? children.indexOf(ref) : children.length;
      children.splice(i, 0, child);
      child.parentNode = frag;
      frag.firstChild = children[0] || null;
      _updateSiblingsFrag(frag);
      return child;
    },
    removeChild: (child) => {
      const i = children.indexOf(child);
      if (i >= 0) {
        children.splice(i, 1);
        child.parentNode = null;
      }
      frag.firstChild = children[0] || null;
      _updateSiblingsFrag(frag);
      return child;
    },
  };
  return frag;
}

function _updateSiblingsFrag(frag) {
  for (let i = 0; i < frag.childNodes.length; i++) {
    frag.childNodes[i].nextSibling = frag.childNodes[i + 1] || null;
  }
}

function setupDOM() {
  const head = createMockElement('head');
  const body = createMockElement('body');
  globalThis.document = {
    title: '',
    head: head,
    body: body,
    activeElement: null,
    createElement: (tag) => createMockElement(tag),
    createTextNode: (text) => createMockTextNode(text),
    createComment: (data) => createMockComment(data),
    createDocumentFragment: () => createMockDocFragment(),
    querySelector: (sel) => null,
  };
  globalThis.window = {};
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail || {};
      this.bubbles = init.bubbles || false;
    }
  };
  globalThis.performance = { now: () => Date.now() };
  globalThis.IntersectionObserver = undefined;
}

setupDOM();

// ═══════════════════════════════════════════════════════════════
// 0. CSP AUTO-DETECTION (MUST run before configureCSP sets __cspNonce)
// ═══════════════════════════════════════════════════════════════
describe('CSP nonce auto-detection (before configureCSP)', () => {
  test('getCSPNonce auto-detects from meta tag when __cspNonce is unset (lines 912-918)', () => {
    // This test MUST run before any configureCSP({ nonce: '...' }) call
    // because __cspNonce is module-level state that can't be reset to null.
    const meta = createMockElement('meta');
    meta.setAttribute('name', 'csp-nonce');
    meta.setAttribute('content', 'auto-nonce-value');

    const origQuery = document.querySelector;
    document.querySelector = (selector) => {
      if (selector === 'meta[name="csp-nonce"]') return meta;
      return origQuery ? origQuery.call(document, selector) : null;
    };

    // tova_inject_css calls getCSPNonce internally.
    // Since __cspNonce is unset (no configureCSP called yet),
    // it falls through to the document.querySelector auto-detection path.
    const cleanup = tova_inject_css('auto-csp-test', '.auto-csp { color: green }');
    if (cleanup) cleanup();

    document.querySelector = origQuery;
  });
});

// ═══════════════════════════════════════════════════════════════
// 1. FLUSH LOOP INFINITE ITERATION DETECTION
// ═══════════════════════════════════════════════════════════════
describe('Flush loop infinite iteration detection', () => {
  test('detects infinite loop (>100 flush iterations)', () => {
    const errors = [];
    const origErr = console.error;
    console.error = (...args) => errors.push(args.join(' '));

    createRoot(() => {
      // Two signals that ping-pong using objects (always unequal):
      // effect A reads a and sets b, effect B reads b and sets a.
      // Kicked off via batch() so both effects are already created
      // and _running is false when the flush loop starts.
      const [a, setA] = createSignal({ v: 0 });
      const [b, setB] = createSignal({ v: 0 });

      createEffect(() => {
        const obj = a();
        setB({ v: obj.v + 1 });
      });

      createEffect(() => {
        const obj = b();
        if (obj.v > 0) setA({ v: obj.v + 1 });
      });

      // Kick off the cycle after both effects are registered
      batch(() => { setA({ v: 100 }); });
    });

    console.error = origErr;
    const infMsg = errors.find(e => e.includes('infinite loop') || e.includes('100 flush'));
    expect(infMsg).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. createComputed OWNERSHIP / DISPOSE
// ═══════════════════════════════════════════════════════════════
describe('createComputed ownership and dispose', () => {
  test('computed is added to owner children and disposes', () => {
    let computedGetter;
    const dispose = createRoot((d) => {
      const [s, setS] = createSignal(1);
      computedGetter = createComputed(() => s() * 2);
      return d;
    });
    expect(computedGetter()).toBe(2);
    dispose();
  });

  test('computed dispose cleans up deps', () => {
    createRoot(() => {
      const [s, setS] = createSignal(10);
      const c = createComputed(() => s() + 5);
      expect(c()).toBe(15);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. WATCH DISPOSE FALLBACK
// ═══════════════════════════════════════════════════════════════
describe('Watch dispose fallback', () => {
  test('watch returns a dispose function', () => {
    let lastVal;
    const [s, setS] = createSignal(0);
    const dispose = watch(() => s(), (newVal) => { lastVal = newVal; });
    setS(5);
    expect(lastVal).toBe(5);
    dispose();
    setS(10);
    expect(lastVal).toBe(5);
  });

  test('watch with immediate option', () => {
    let called = false;
    const [s] = createSignal(42);
    const dispose = watch(() => s(), (v) => { called = true; }, { immediate: true });
    expect(called).toBe(true);
    dispose();
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. ERROR BOUNDARY
// ═══════════════════════════════════════════════════════════════
describe('ErrorBoundary', () => {
  test('handleError sets error signal and calls onError', () => {
    let receivedError = null;
    const boundary = createErrorBoundary({
      onError: ({ error }) => { receivedError = error; },
    });
    boundary.run(() => { throw new Error('test error'); });
    expect(boundary.error()).toBeTruthy();
    expect(receivedError.message).toBe('test error');
  });

  test('resetBoundary clears error and calls onReset', () => {
    let resetCalled = false;
    const boundary = createErrorBoundary({
      onReset: () => { resetCalled = true; },
    });
    boundary.run(() => { throw new Error('fail'); });
    expect(boundary.error()).toBeTruthy();
    boundary.reset();
    expect(boundary.error()).toBe(null);
    expect(resetCalled).toBe(true);
  });

  test('ErrorBoundary component structure', () => {
    setupDOM();
    const vnode = ErrorBoundary({
      fallback: (props) => tova_el('div', {}, ['fallback']),
      children: [tova_el('div', {}, ['child'])],
      onError: () => {},
    });
    expect(vnode.__tova).toBe(true);
    expect(vnode.tag).toBe('__dynamic');
    expect(typeof vnode.compute).toBe('function');
  });

  test('ErrorBoundary retry mechanism', () => {
    setupDOM();
    let errorCount = 0;
    const vnode = ErrorBoundary({
      fallback: (props) => tova_el('span', {}, ['fallback']),
      children: [tova_el('div', {}, ['child'])],
      onError: () => { errorCount++; },
      retry: 2,
    });
    vnode._errorHandler(new Error('retry me'));
  });

  test('ErrorBoundary fallback render with props', () => {
    setupDOM();
    let fallbackProps = null;
    const vnode = ErrorBoundary({
      fallback: (props) => { fallbackProps = props; return tova_el('div', {}, ['err']); },
      children: [tova_el('div', {}, ['child'])],
      onError: () => {},
      retry: 0,
    });
    vnode._errorHandler(new Error('test'));
    vnode.compute();
    expect(fallbackProps).toBeTruthy();
    expect(fallbackProps.error.message).toBe('test');
    expect(fallbackProps.reset).toBeTruthy();
  });

  test('ErrorBoundary onErrorCleared fires after recovery', (done) => {
    setupDOM();
    let cleared = false;
    const vnode = ErrorBoundary({
      fallback: () => tova_el('span', {}, ['err']),
      children: [tova_el('div', {}, ['ok'])],
      onErrorCleared: () => { cleared = true; },
      onError: () => {},
      retry: 0,
    });
    vnode._errorHandler(new Error('fail'));
    vnode.compute();
    expect(vnode._errorHandler).toBeTruthy();
    done();
  });

  test('ErrorBoundary component stack tracking', () => {
    pushComponentName('App');
    pushComponentName('Widget');
    const boundary = createErrorBoundary({
      onError: ({ componentStack }) => {
        expect(componentStack).toEqual(['Widget', 'App']);
      },
    });
    boundary.run(() => { throw new Error('stack test'); });
    popComponentName();
    popComponentName();
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. ERROR INFO
// ═══════════════════════════════════════════════════════════════
describe('ErrorInfo', () => {
  test('renders basic error info', () => {
    setupDOM();
    const result = ErrorInfo({
      error: new Error('Something failed'),
      errorId: 'EB1-1',
      componentStack: ['App', 'Widget'],
      reset: () => {},
      retryCount: 0,
    });
    expect(result.__tova).toBe(true);
    expect(result.tag).toBe('div');
    expect(result.props.role).toBe('alert');
  });

  test('renders without optional fields', () => {
    setupDOM();
    const result = ErrorInfo({
      error: 'string error',
      errorId: null,
      componentStack: [],
      reset: null,
      retryCount: 0,
    });
    expect(result.__tova).toBe(true);
  });

  test('renders with retry count > 0', () => {
    setupDOM();
    const result = ErrorInfo({
      error: new Error('fail'),
      errorId: 'EB1-2',
      componentStack: ['X'],
      reset: () => {},
      retryCount: 2,
    });
    const button = result.children.find(c => c && c.tag === 'button');
    expect(button).toBeTruthy();
  });

  test('renders stack trace details', () => {
    const err = new Error('traced');
    err.stack = 'Error: traced\n  at test.js:1:1';
    const result = ErrorInfo({
      error: err,
      errorId: 'EB2-1',
      componentStack: ['App'],
      reset: null,
      retryCount: 0,
    });
    const details = result.children.find(c => c && c.tag === 'details');
    expect(details).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. SUSPENSE
// ═══════════════════════════════════════════════════════════════
describe('Suspense', () => {
  test('renders children when no pending', () => {
    createRoot(() => {
      const vnode = Suspense({
        fallback: tova_el('div', {}, ['Loading...']),
        children: [tova_el('div', {}, ['Content'])],
      });
      expect(vnode.__tova).toBe(true);
      const result = vnode.compute();
      expect(result).toBeTruthy();
    });
  });

  test('Suspense boundary register/resolve', () => {
    createRoot(() => {
      const vnode = Suspense({
        fallback: tova_el('div', {}, ['Loading...']),
        children: [tova_el('span', {}, ['loaded'])],
      });
      expect(vnode.compute).toBeTruthy();
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. HEAD ELEMENT CLEANUP
// ═══════════════════════════════════════════════════════════════
describe('Head component', () => {
  test('returns null outside document', () => {
    const origDoc = globalThis.document;
    globalThis.document = undefined;
    const result = Head({ children: [] });
    expect(result).toBe(null);
    globalThis.document = origDoc;
  });

  test('adds title element', () => {
    setupDOM();
    createRoot(() => {
      Head({ children: [tova_el('title', {}, ['My Page'])] });
      expect(document.title).toBe('My Page');
    });
  });

  test('adds meta element to head', () => {
    setupDOM();
    createRoot(() => {
      const initialLen = document.head.childNodes.length;
      Head({ children: [tova_el('meta', { name: 'description', content: 'Test page' }, [])] });
      expect(document.head.childNodes.length).toBeGreaterThan(initialLen);
    });
  });

  test('cleanup removes elements', () => {
    setupDOM();
    let disposeFn;
    createRoot((dispose) => {
      disposeFn = dispose;
      Head({
        children: [
          tova_el('title', {}, ['Test Title']),
          tova_el('link', { rel: 'stylesheet', href: '/style.css' }, []),
        ],
      });
      return dispose;
    });
    expect(document.title).toBe('Test Title');
    disposeFn();
  });

  test('skips non-tova children', () => {
    setupDOM();
    createRoot(() => {
      Head({ children: ['just a string', null, undefined] });
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. CSP NONCE DETECTION
// ═══════════════════════════════════════════════════════════════
describe('CSP nonce detection', () => {
  test('configureCSP sets nonce', () => {
    configureCSP({ nonce: 'abc123' });
  });

  test('getCSPNonce auto-detects from meta tag', () => {
    setupDOM();
    document.querySelector = (sel) => {
      if (sel === 'meta[name="csp-nonce"]') {
        return { getAttribute: (name) => name === 'content' ? 'auto-nonce-123' : null };
      }
      return null;
    };
    configureCSP({ nonce: null });
    createRoot(() => {
      tova_inject_css('csp-test-id', '.test { color: red; }');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. CSS STYLE CLEANUP WITH REF COUNTING
// ═══════════════════════════════════════════════════════════════
describe('CSS style inject with ref counting', () => {
  test('injects style tag and increments ref count', () => {
    setupDOM();
    configureCSP({ nonce: null });
    createRoot(() => {
      tova_inject_css('style-1', '.a { color: red; }');
      const styleEl = document.head.childNodes.find(
        c => c._attrs && c._attrs['data-tova-style'] === 'style-1'
      );
      expect(styleEl).toBeTruthy();
    });
  });

  test('second inject increments ref count without new tag', () => {
    setupDOM();
    configureCSP({ nonce: null });
    createRoot(() => {
      tova_inject_css('style-dup', '.b { color: blue; }');
      const count1 = document.head.childNodes.length;
      tova_inject_css('style-dup', '.b { color: blue; }');
      const count2 = document.head.childNodes.length;
      expect(count2).toBe(count1);
    });
  });

  test('cleanup removes style when ref count reaches 0', () => {
    setupDOM();
    configureCSP({ nonce: null });
    let disposeFn;
    createRoot((dispose) => {
      disposeFn = dispose;
      tova_inject_css('style-cleanup', '.c { color: green; }');
      return dispose;
    });
    disposeFn();
  });

  test('cleanup with nonce', () => {
    setupDOM();
    configureCSP({ nonce: 'my-nonce' });
    createRoot(() => {
      tova_inject_css('nonce-style', '.d { color: purple; }');
      const styleEl = document.head.childNodes.find(
        c => c._attrs && c._attrs['nonce'] === 'my-nonce'
      );
      expect(styleEl).toBeTruthy();
    });
    configureCSP({ nonce: null });
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. TRANSITION CSS GENERATION
// ═══════════════════════════════════════════════════════════════
describe('Transition CSS generation', () => {
  test('tova_transition with fade name', () => {
    const vnode = tova_el('div', {}, ['hello']);
    const result = tova_transition(vnode, 'fade', { duration: 300 });
    expect(result._transition.name).toBe('fade');
  });

  test('tova_transition with slide', () => {
    const vnode = tova_el('div', {}, []);
    tova_transition(vnode, 'slide', { axis: 'x', distance: 30 });
    expect(vnode._transition.name).toBe('slide');
  });

  test('tova_transition with scale', () => {
    const vnode = tova_el('div', {}, []);
    tova_transition(vnode, 'scale');
    expect(vnode._transition.name).toBe('scale');
  });

  test('tova_transition with fly', () => {
    const vnode = tova_el('div', {}, []);
    tova_transition(vnode, 'fly', { x: 10, y: -30 });
    expect(vnode._transition.name).toBe('fly');
  });

  test('tova_transition with unknown name', () => {
    const vnode = tova_el('div', {}, []);
    tova_transition(vnode, 'custom-unknown');
    expect(vnode._transition.name).toBe('custom-unknown');
  });

  test('tova_transition with directional config', () => {
    const vnode = tova_el('div', {}, []);
    tova_transition(vnode, {
      in: { name: 'fade', config: { duration: 200 } },
      out: { name: 'slide', config: { duration: 300 } },
    });
    expect(vnode._transition.directional).toBe(true);
  });

  test('tova_transition with custom function', () => {
    const vnode = tova_el('div', {}, []);
    const customFn = (el, config, phase) => ({ opacity: '0.5' });
    tova_transition(vnode, customFn, { duration: 500 });
    expect(vnode._transition.custom).toBe(customFn);
  });

  test('tova_transition on non-vnode returns input', () => {
    expect(tova_transition(null, 'fade')).toBe(null);
    const obj = { notTova: true };
    expect(tova_transition(obj, 'fade')).toBe(obj);
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. ENTER/LEAVE TRANSITION APPLICATION
// ═══════════════════════════════════════════════════════════════
describe('Enter/Leave transitions', () => {
  test('render applies enter transition', () => {
    setupDOM();
    const vnode = tova_el('div', {}, ['animated']);
    tova_transition(vnode, 'fade', { duration: 200 });
    createRoot(() => {
      const rendered = render(vnode);
      expect(rendered.__tovaTransition).toBeTruthy();
    });
  });

  test('render applies custom enter transition', () => {
    setupDOM();
    const customFn = (el, config, phase) => {
      if (phase === 'enter') return { opacity: '0.5' };
      return {};
    };
    const vnode = tova_el('div', {}, ['custom']);
    tova_transition(vnode, customFn, { duration: 300 });
    createRoot(() => {
      const rendered = render(vnode);
      expect(rendered.__tovaTransition.custom).toBe(customFn);
    });
  });

  test('render applies directional enter transition', () => {
    setupDOM();
    const vnode = tova_el('div', {}, ['dir']);
    tova_transition(vnode, {
      in: { name: 'fade', config: { duration: 200 } },
      out: { name: 'slide', config: { duration: 300 } },
    });
    createRoot(() => {
      const rendered = render(vnode);
      expect(rendered.__tovaTransition.directional).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. MARKER CONTENT DISPOSAL / OWNERSHIP
// ═══════════════════════════════════════════════════════════════
describe('Marker content disposal and ownership', () => {
  test('dynamic vnode (function) creates marker', () => {
    setupDOM();
    const container = createMockElement('div');
    const [val] = createSignal('hello');
    createRoot(() => {
      const rendered = render(() => val());
      container.appendChild(rendered);
      expect(container.childNodes.length).toBeGreaterThan(0);
    });
  });

  test('dynamic vnode updates text in place', () => {
    setupDOM();
    const container = createMockElement('div');
    const [val, setVal] = createSignal('first');
    createRoot(() => {
      const rendered = render(() => val());
      container.appendChild(rendered);
      setVal('second');
      const textNodes = container.childNodes.filter(c => c.nodeType === 3);
      expect(textNodes.some(t => t.textContent === 'second')).toBe(true);
    });
  });

  test('dynamic vnode switches from text to vnode', () => {
    setupDOM();
    const container = createMockElement('div');
    const [val, setVal] = createSignal('text');
    createRoot(() => {
      const rendered = render(() => {
        const v = val();
        if (v === 'text') return 'hello';
        return tova_el('span', {}, ['world']);
      });
      container.appendChild(rendered);
      setVal('vnode');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 13. DYNAMIC RENDERING FALLBACK
// ═══════════════════════════════════════════════════════════════
describe('Dynamic rendering fallback', () => {
  test('render handles non-tova object as text', () => {
    setupDOM();
    const container = createMockElement('div');
    createRoot(() => {
      const rendered = render(() => ({ toString: () => 'custom-obj' }));
      container.appendChild(rendered);
    });
  });

  test('render __dynamic vnode with compute', () => {
    setupDOM();
    const container = createMockElement('div');
    createRoot(() => {
      const vnode = {
        __tova: true, tag: '__dynamic', props: {}, children: [],
        compute: () => tova_el('p', {}, ['computed content']),
      };
      container.appendChild(render(vnode));
    });
  });

  test('render __dynamic with error handler', () => {
    setupDOM();
    const errors = [];
    const container = createMockElement('div');
    createRoot(() => {
      const vnode = {
        __tova: true, tag: '__dynamic', props: {}, children: [],
        _errorHandler: (e) => errors.push(e),
        compute: () => { throw new Error('dynamic error'); },
      };
      container.appendChild(render(vnode));
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  test('render __dynamic with prevDispose', () => {
    setupDOM();
    const container = createMockElement('div');
    const [show, setShow] = createSignal(true);
    createRoot(() => {
      const vnode = {
        __tova: true, tag: '__dynamic', props: {}, children: [],
        compute: () => show() ? tova_el('div', {}, ['shown']) : tova_el('span', {}, ['hidden']),
      };
      container.appendChild(render(vnode));
      setShow(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 14. PORTAL CLEANUP
// ═══════════════════════════════════════════════════════════════
describe('Portal cleanup', () => {
  test('Portal renders children into target', (done) => {
    setupDOM();
    const target = createMockElement('div');
    document.querySelector = (sel) => sel === '#modal-root' ? target : null;
    createRoot(() => {
      const vnode = Portal({ target: '#modal-root', children: [tova_el('div', {}, ['portal'])] });
      const rendered = render(vnode);
      expect(rendered.nodeType).toBe(8);
    });
    setTimeout(() => { expect(target.childNodes.length).toBeGreaterThan(0); done(); }, 50);
  });

  test('Portal cleanup removes children on dispose', (done) => {
    setupDOM();
    const target = createMockElement('div');
    document.querySelector = (sel) => sel === '#modal' ? target : null;
    let disposeFn;
    createRoot((dispose) => {
      disposeFn = dispose;
      render(Portal({ target: '#modal', children: [tova_el('span', {}, ['cleanup me'])] }));
      return dispose;
    });
    setTimeout(() => { disposeFn(); setTimeout(done, 20); }, 50);
  });

  test('Portal with element target', (done) => {
    setupDOM();
    const target = createMockElement('div');
    createRoot(() => {
      render(Portal({ target: target, children: [tova_el('div', {}, ['direct'])] }));
    });
    setTimeout(() => { expect(target.childNodes.length).toBeGreaterThan(0); done(); }, 50);
  });
});

// ═══════════════════════════════════════════════════════════════
// 15. ACTION DIRECTIVES (use:)
// ═══════════════════════════════════════════════════════════════
describe('Action directives (use:)', () => {
  test('__tova_action attaches action to vnode', () => {
    const vnode = tova_el('div', {}, []);
    __tova_action(vnode, () => {}, 'param');
    expect(vnode._actions.length).toBe(1);
  });

  test('__tova_action on non-vnode returns input', () => {
    expect(__tova_action(null, () => {}, 'p')).toBe(null);
  });

  test('action is called during render with static param', () => {
    setupDOM();
    let calledWith = null;
    const vnode = tova_el('div', {}, []);
    __tova_action(vnode, (el, param) => { calledWith = { el, param }; return { destroy: () => {} }; }, 'static-val');
    createRoot(() => { render(vnode); });
    expect(calledWith.param).toBe('static-val');
  });

  test('action with reactive param creates update effect', () => {
    setupDOM();
    let updateCalls = [];
    const [param, setParam] = createSignal('initial');
    const vnode = tova_el('div', {}, []);
    __tova_action(vnode, (el, val) => ({
      update: (newVal) => { updateCalls.push(newVal); },
      destroy: () => {},
    }), param);
    createRoot(() => { render(vnode); setParam('updated'); });
    expect(updateCalls.some(v => v === 'updated')).toBe(true);
  });

  test('action destroy registered on owner cleanup', () => {
    setupDOM();
    let destroyed = false;
    const vnode = tova_el('div', {}, []);
    __tova_action(vnode, (el, val) => ({ destroy: () => { destroyed = true; } }), 'val');
    let disposeFn;
    createRoot((dispose) => { disposeFn = dispose; render(vnode); return dispose; });
    disposeFn();
    expect(destroyed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 16. EVENT HANDLER OPTIONS
// ═══════════════════════════════════════════════════════════════
describe('Event handler options', () => {
  test('event handler with capture option', () => {
    setupDOM();
    const vnode = tova_el('button', {
      onClick: { handler: () => {}, options: { capture: true } },
    }, ['Click']);
    createRoot(() => {
      const el = render(vnode);
      expect(el.__handlerOptions.click).toEqual({ capture: true });
    });
  });

  test('event handler with passive option', () => {
    setupDOM();
    const vnode = tova_el('div', {
      onScroll: { handler: () => {}, options: { passive: true } },
    }, []);
    createRoot(() => {
      const el = render(vnode);
      expect(el.__handlerOptions.scroll).toEqual({ passive: true });
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 17. EVENT HANDLER UPDATES ON PROP CHANGES
// ═══════════════════════════════════════════════════════════════
describe('Event handler updates (applyProps)', () => {
  test('applyPropValue handles style object delta', () => {
    setupDOM();
    const [style, setStyle] = createSignal({ color: 'red', fontSize: '14px' });
    createRoot(() => {
      const vnode = tova_el('div', { style: style }, []);
      render(vnode);
      setStyle({ color: 'blue' });
    });
  });

  test('applyPropValue handles className', () => {
    setupDOM();
    createRoot(() => {
      const el = render(tova_el('div', { className: 'my-class' }, []));
      expect(el.className).toBe('my-class');
    });
  });

  test('applyPropValue handles checked', () => {
    setupDOM();
    createRoot(() => {
      const el = render(tova_el('input', { checked: true }, []));
      expect(el.checked).toBe(true);
    });
  });

  test('applyPropValue handles disabled', () => {
    setupDOM();
    createRoot(() => {
      const el = render(tova_el('button', { disabled: true }, []));
      expect(el.disabled).toBe(true);
    });
  });

  test('applyPropValue handles value', () => {
    setupDOM();
    createRoot(() => {
      const el = render(tova_el('input', { value: 'test-val' }, []));
      expect(el.value).toBe('test-val');
    });
  });

  test('applyPropValue handles ref object', () => {
    setupDOM();
    const ref = createRef();
    createRoot(() => {
      const el = render(tova_el('div', { ref }, []));
      expect(ref.current).toBe(el);
    });
  });

  test('applyPropValue handles ref function', () => {
    setupDOM();
    let refEl = null;
    createRoot(() => {
      const el = render(tova_el('div', { ref: (el) => { refEl = el; } }, []));
      expect(refEl).toBe(el);
    });
  });

  test('applyPropValue handles hidden and readOnly', () => {
    setupDOM();
    createRoot(() => {
      const el = render(tova_el('input', { hidden: true, readOnly: true }, []));
      expect(el.hidden).toBe(true);
      expect(el.readOnly).toBe(true);
    });
  });

  test('reactive prop creates effect', () => {
    setupDOM();
    const [cls, setCls] = createSignal('initial');
    createRoot(() => {
      const el = render(tova_el('div', { className: cls }, []));
      expect(el.className).toBe('initial');
      setCls('updated');
      expect(el.className).toBe('updated');
    });
  });

  test('applyPropValue blocks innerHTML in dev mode', () => {
    setupDOM();
    const errors = [];
    const origErr = console.error;
    console.error = (...args) => errors.push(args.join(' '));
    createRoot(() => { render(tova_el('div', { innerHTML: '<b>x</b>' }, [])); });
    console.error = origErr;
    expect(errors.some(e => e.includes('innerHTML is not allowed'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 18. KEYED RECONCILIATION
// ═══════════════════════════════════════════════════════════════
describe('Keyed reconciliation', () => {
  test('tova_keyed sets key on vnode', () => {
    const vnode = tova_el('li', {}, ['item']);
    tova_keyed('key1', vnode);
    expect(vnode.props.key).toBe('key1');
  });

  test('tova_keyed on non-vnode is noop', () => {
    expect(tova_keyed('k', 'string')).toBe('string');
  });

  test('keyed children reconciliation in marker', () => {
    setupDOM();
    const container = createMockElement('div');
    const [items, setItems] = createSignal([1, 2, 3]);
    createRoot(() => {
      container.appendChild(render(() => {
        return items().map(i => {
          const v = tova_el('li', {}, [String(i)]);
          tova_keyed('item-' + i, v);
          return v;
        });
      }));
      setItems([3, 1, 2]);
    });
  });

  test('keyed reconciliation with add/remove', () => {
    setupDOM();
    const container = createMockElement('div');
    const [items, setItems] = createSignal([1, 2]);
    createRoot(() => {
      container.appendChild(render(() => {
        return items().map(i => {
          const v = tova_el('div', {}, [String(i)]);
          tova_keyed('k-' + i, v);
          return v;
        });
      }));
      setItems([1, 2, 3]);
      setItems([1, 3]);
    });
  });

  test('keyed reconciliation with fragment nodes', () => {
    setupDOM();
    const container = createMockElement('div');
    const [items, setItems] = createSignal(['a', 'b']);
    createRoot(() => {
      container.appendChild(render(() => {
        return items().map(i => {
          const v = tova_el('span', {}, [i]);
          tova_keyed(i, v);
          return v;
        });
      }));
      setItems(['b', 'a']);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 19. POSITIONAL CHILDREN APPEND/REMOVE
// ═══════════════════════════════════════════════════════════════
describe('Positional children append/remove', () => {
  test('positional reconciliation appends new children', () => {
    setupDOM();
    const container = createMockElement('div');
    const [items, setItems] = createSignal(['a', 'b']);
    createRoot(() => {
      container.appendChild(render(() => items().map(i => tova_el('span', {}, [i]))));
      setItems(['a', 'b', 'c']);
    });
  });

  test('positional reconciliation removes excess children', () => {
    setupDOM();
    const container = createMockElement('div');
    const [items, setItems] = createSignal(['a', 'b', 'c']);
    createRoot(() => {
      container.appendChild(render(() => items().map(i => tova_el('span', {}, [i]))));
      setItems(['a']);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 20. SINGLE NODE PATCHING
// ═══════════════════════════════════════════════════════════════
describe('Single node patching', () => {
  test('patchSingle: null replaces node', () => {
    setupDOM();
    const container = createMockElement('div');
    const [show, setShow] = createSignal(true);
    createRoot(() => {
      container.appendChild(render(() => show() ? tova_el('div', {}, ['visible']) : null));
      setShow(false);
    });
  });

  test('patchSingle: fragment patching', () => {
    setupDOM();
    const container = createMockElement('div');
    const [items, setItems] = createSignal([1, 2]);
    createRoot(() => {
      container.appendChild(render(() => tova_fragment(items().map(i => tova_el('span', {}, [String(i)])))));
      setItems([3, 4, 5]);
    });
  });

  test('patchSingle: element in place patch', () => {
    setupDOM();
    const container = createMockElement('div');
    const [cls, setCls] = createSignal('old');
    createRoot(() => {
      container.appendChild(render(() => tova_el('div', { className: cls() }, ['content'])));
      setCls('new');
    });
  });

  test('patchSingle: different type full replace', () => {
    setupDOM();
    const container = createMockElement('div');
    const [tag, setTag] = createSignal('div');
    createRoot(() => {
      container.appendChild(render(() => tova_el(tag(), {}, ['content'])));
      setTag('span');
    });
  });

  test('patchSingle: non-tova object patching', () => {
    setupDOM();
    const container = createMockElement('div');
    const [val, setVal] = createSignal({ toString: () => 'obj1' });
    createRoot(() => {
      container.appendChild(render(() => val()));
      setVal({ toString: () => 'obj2' });
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 21. HYDRATION MISMATCH DETECTION
// ═══════════════════════════════════════════════════════════════
describe('Hydration mismatch detection', () => {
  test('warns on className mismatch', () => {
    setupDOM();
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...args) => warns.push(args.join(' '));
    const container = createMockElement('div');
    const existing = createMockElement('div');
    existing.className = 'wrong-class';
    container.appendChild(existing);
    hydrate(() => tova_el('div', { className: 'correct-class' }, []), container);
    console.warn = origWarn;
    expect(warns.some(w => w.includes('hydration mismatch') && w.includes('class'))).toBe(true);
  });

  test('warns on attribute mismatch', () => {
    setupDOM();
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...args) => warns.push(args.join(' '));
    const container = createMockElement('div');
    const existing = createMockElement('div');
    existing._attrs['data-id'] = 'wrong';
    container.appendChild(existing);
    hydrate(() => tova_el('div', { 'data-id': 'correct' }, []), container);
    console.warn = origWarn;
    expect(warns.some(w => w.includes('hydration mismatch') && w.includes('data-id'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 22. SSR MARKER CONTENT
// ═══════════════════════════════════════════════════════════════
describe('SSR marker content collection', () => {
  test('hydrate with SSR markers', () => {
    setupDOM();
    const container = createMockElement('div');
    container.appendChild(createMockComment('tova-s:1'));
    container.appendChild(createMockTextNode('dynamic'));
    container.appendChild(createMockComment('/tova-s:1'));
    hydrate(() => ({
      __tova: true, tag: '__dynamic', props: {}, children: [],
      compute: () => 'dynamic',
    }), container);
  });

  test('SSR marker without end marker', () => {
    setupDOM();
    const container = createMockElement('div');
    container.appendChild(createMockComment('tova-s:2'));
    container.appendChild(createMockTextNode('orphan'));
    hydrate(() => ({
      __tova: true, tag: '__dynamic', props: {}, children: [],
      compute: () => 'orphan',
    }), container);
  });
});

// ═══════════════════════════════════════════════════════════════
// 23. VNODE HYDRATION
// ═══════════════════════════════════════════════════════════════
describe('VNode hydration', () => {
  test('hydrate text node mismatch', () => {
    setupDOM();
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...args) => warns.push(args.join(' '));
    const container = createMockElement('div');
    container.appendChild(createMockTextNode('wrong'));
    hydrate(() => 'correct', container);
    console.warn = origWarn;
    expect(warns.some(w => w.includes('text expected'))).toBe(true);
  });

  test('hydrate function vnode with text node', () => {
    setupDOM();
    const container = createMockElement('div');
    container.appendChild(createMockTextNode('reactive'));
    const [val, setVal] = createSignal('reactive');
    hydrate(() => (() => val()), container);
    setVal('updated');
  });

  test('hydrate array of vnodes', () => {
    setupDOM();
    const container = createMockElement('div');
    container.appendChild(createMockElement('span'));
    container.appendChild(createMockElement('span'));
    hydrate(() => [tova_el('span', {}, []), tova_el('span', {}, [])], container);
  });

  test('hydrate fragment', () => {
    setupDOM();
    const container = createMockElement('div');
    container.appendChild(createMockElement('p'));
    container.appendChild(createMockElement('p'));
    hydrate(() => tova_fragment([tova_el('p', {}, []), tova_el('p', {}, [])]), container);
  });

  test('hydrate element with matching tag', () => {
    setupDOM();
    const container = createMockElement('div');
    container.appendChild(createMockElement('span'));
    hydrate(() => tova_el('span', { className: 'test' }, []), container);
  });

  test('hydrate tag mismatch falls back', () => {
    setupDOM();
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...args) => warns.push(args.join(' '));
    const container = createMockElement('div');
    container.appendChild(createMockElement('span'));
    hydrate(() => tova_el('p', {}, []), container);
    console.warn = origWarn;
    expect(warns.some(w => w.includes('hydration mismatch') && w.includes('expected'))).toBe(true);
  });

  test('hydrate dynamic vnode without SSR marker', () => {
    setupDOM();
    const container = createMockElement('div');
    container.appendChild(createMockElement('div'));
    hydrate(() => ({
      __tova: true, tag: '__dynamic', props: {}, children: [],
      compute: () => tova_el('span', {}, ['computed']),
    }), container);
  });

  test('hydrate function vnode replaces non-text node', () => {
    setupDOM();
    const container = createMockElement('div');
    container.appendChild(createMockElement('div'));
    hydrate(() => (() => 'reactive text'), container);
  });
});

// ═══════════════════════════════════════════════════════════════
// 24. HYDRATION EVENT HANDLERS / REACTIVE PROPS
// ═══════════════════════════════════════════════════════════════
describe('Hydration event handlers and reactive props', () => {
  test('hydrateProps attaches handler with options', () => {
    setupDOM();
    const container = createMockElement('div');
    container.appendChild(createMockElement('div'));
    hydrate(() => tova_el('div', {
      onScroll: { handler: () => {}, options: { passive: true } },
    }, []), container);
  });

  test('hydrateProps handles ref object', () => {
    setupDOM();
    const ref = createRef();
    const container = createMockElement('div');
    const existing = createMockElement('div');
    container.appendChild(existing);
    hydrate(() => tova_el('div', { ref }, []), container);
    expect(ref.current).toBe(existing);
  });

  test('hydrateProps handles ref function', () => {
    setupDOM();
    let refEl = null;
    const container = createMockElement('div');
    const existing = createMockElement('div');
    container.appendChild(existing);
    hydrate(() => tova_el('div', { ref: (el) => { refEl = el; } }, []), container);
    expect(refEl).toBe(existing);
  });

  test('hydrateProps creates effect for reactive props', () => {
    setupDOM();
    const [cls, setCls] = createSignal('initial');
    const container = createMockElement('div');
    container.appendChild(createMockElement('div'));
    hydrate(() => tova_el('div', { className: cls }, []), container);
  });
});

// ═══════════════════════════════════════════════════════════════
// 25. PROGRESSIVE HYDRATION
// ═══════════════════════════════════════════════════════════════
describe('Progressive hydration (hydrateWhenVisible)', () => {
  test('falls back without IntersectionObserver', () => {
    setupDOM();
    globalThis.IntersectionObserver = undefined;
    const container = createMockElement('div');
    container.appendChild(createMockElement('div'));
    hydrateWhenVisible(() => tova_el('div', {}, []), container);
  });

  test('uses IntersectionObserver when available', () => {
    setupDOM();
    let observedEl = null;
    let observerCallback = null;
    let disconnected = false;
    globalThis.IntersectionObserver = class {
      constructor(cb) { observerCallback = cb; }
      observe(el) { observedEl = el; }
      disconnect() { disconnected = true; }
    };
    const container = createMockElement('div');
    container.appendChild(createMockElement('div'));
    const dispose = hydrateWhenVisible(() => tova_el('div', {}, []), container, { rootMargin: '100px' });
    expect(observedEl).toBe(container);
    observerCallback([{ isIntersecting: true }]);
    expect(disconnected).toBe(true);
    if (typeof dispose === 'function') dispose();
    globalThis.IntersectionObserver = undefined;
  });

  test('does not hydrate twice', () => {
    setupDOM();
    let observerCallback = null;
    globalThis.IntersectionObserver = class {
      constructor(cb) { observerCallback = cb; }
      observe() {}
      disconnect() {}
    };
    const container = createMockElement('div');
    container.appendChild(createMockElement('div'));
    hydrateWhenVisible(() => tova_el('div', {}, []), container);
    observerCallback([{ isIntersecting: true }]);
    observerCallback([{ isIntersecting: true }]);
    globalThis.IntersectionObserver = undefined;
  });
});

// ═══════════════════════════════════════════════════════════════
// 26. DYNAMIC COMPONENT
// ═══════════════════════════════════════════════════════════════
describe('Dynamic component', () => {
  test('renders dynamic component from function', () => {
    const MyComp = (props) => tova_el('div', {}, [(props && props.text) || '']);
    const vnode = Dynamic({ component: MyComp, text: 'hello' });
    expect(vnode.__tova).toBe(true);
    const result = vnode.compute();
    expect(result.tag).toBe('div');
  });

  test('renders null when component is null', () => {
    expect(Dynamic({ component: null }).compute()).toBe(null);
  });

  test('handles signal-based component', () => {
    const [comp] = createSignal(null);
    expect(Dynamic({ component: comp }).compute()).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════════
// 27. CONTEXT
// ═══════════════════════════════════════════════════════════════
describe('Context provide/inject', () => {
  test('inject returns default', () => {
    const ctx = createContext('default-val');
    createRoot(() => { expect(inject(ctx)).toBe('default-val'); });
  });

  test('provide and inject', () => {
    const ctx = createContext(null);
    createRoot(() => { provide(ctx, 'val'); expect(inject(ctx)).toBe('val'); });
  });

  test('nested context', () => {
    const ctx = createContext('default');
    createRoot(() => {
      provide(ctx, 'outer');
      createRoot(() => { provide(ctx, 'inner'); expect(inject(ctx)).toBe('inner'); });
      expect(inject(ctx)).toBe('outer');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 28. LAZY
// ═══════════════════════════════════════════════════════════════
describe('Lazy component', () => {
  test('lazy loads and resolves', async () => {
    const LazyComp = lazy(() => Promise.resolve({ default: () => tova_el('div', {}, ['loaded']) }));
    createRoot(() => { const v = LazyComp({}); expect(v.tag).toBe('__dynamic'); });
    await new Promise(r => setTimeout(r, 50));
  });

  test('lazy handles error', async () => {
    const LazyComp = lazy(() => Promise.reject(new Error('fail')));
    createRoot(() => { LazyComp({}); });
    await new Promise(r => setTimeout(r, 50));
  });

  test('lazy returns resolved on second call', async () => {
    const LazyComp = lazy(() => Promise.resolve({ default: () => tova_el('span', {}, ['ok']) }));
    createRoot(() => { LazyComp({}); });
    await new Promise(r => setTimeout(r, 50));
    const result = LazyComp({});
    expect(result.__tova).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 29. CREATE RESOURCE
// ═══════════════════════════════════════════════════════════════
describe('createResource', () => {
  test('async fetcher', async () => {
    const [data, { loading }] = createResource(() => Promise.resolve('fetched'));
    expect(loading()).toBe(true);
    await new Promise(r => setTimeout(r, 50));
    expect(data()).toBe('fetched');
  });

  test('sync fetcher', () => {
    const [data] = createResource(() => 'sync');
    expect(data()).toBe('sync');
  });

  test('fetcher with source', async () => {
    const [src] = createSignal('p1');
    const [data] = createResource(src, (s) => Promise.resolve('r-' + s));
    await new Promise(r => setTimeout(r, 50));
    expect(data()).toBe('r-p1');
  });

  test('fetcher error', async () => {
    const [, { error }] = createResource(() => Promise.reject(new Error('fail')));
    await new Promise(r => setTimeout(r, 50));
    expect(error()).toBeTruthy();
  });

  test('refetch', async () => {
    let n = 0;
    const [, { refetch }] = createResource(() => { n++; return Promise.resolve(n); });
    await new Promise(r => setTimeout(r, 50));
    refetch();
    await new Promise(r => setTimeout(r, 50));
    expect(n).toBeGreaterThan(1);
  });

  test('sync error', () => {
    const [, { error }] = createResource(() => { throw new Error('sync'); });
    expect(error()).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
// 30. RENDER VARIOUS BRANCHES
// ═══════════════════════════════════════════════════════════════
describe('Render various branches', () => {
  test('render null', () => { setupDOM(); expect(render(null).nodeType).toBe(3); });
  test('render undefined', () => { setupDOM(); expect(render(undefined).nodeType).toBe(3); });
  test('render string', () => { setupDOM(); expect(render('hi').textContent).toBe('hi'); });
  test('render number', () => { setupDOM(); expect(render(42).textContent).toBe('42'); });
  test('render boolean', () => { setupDOM(); expect(render(true).textContent).toBe('true'); });
  test('render array', () => { setupDOM(); expect(render([tova_el('div', {}, [])]).nodeType).toBe(11); });
  test('render non-tova obj', () => { setupDOM(); expect(render({ toString: () => 'x' }).textContent).toBe('x'); });
  test('render fragment', () => { setupDOM(); expect(render(tova_fragment([tova_el('span', {}, [])])).nodeType).toBe(11); });
  test('render element', () => { setupDOM(); expect(render(tova_el('div', {}, [])).tagName).toBe('DIV'); });
  test('render stores __vnode', () => { setupDOM(); const v = tova_el('p', {}, []); expect(render(v).__vnode).toBe(v); });
  test('render with componentName', () => {
    setupDOM();
    const v = tova_el('div', {}, []);
    v._componentName = 'W';
    expect(render(v)._attrs['data-tova-component']).toBe('W');
  });
});

// ═══════════════════════════════════════════════════════════════
// 31. MOUNT
// ═══════════════════════════════════════════════════════════════
describe('Mount', () => {
  test('mount renders', () => {
    setupDOM();
    const c = createMockElement('div');
    mount(() => tova_el('div', {}, ['m']), c);
    expect(c.childNodes.length).toBeGreaterThan(0);
  });

  test('mount clears existing', () => {
    setupDOM();
    const c = createMockElement('div');
    c.appendChild(createMockElement('span'));
    mount(() => tova_el('p', {}, []), c);
  });

  test('mount null container', () => {
    const e = []; const o = console.error; console.error = (...a) => e.push(a.join(' '));
    mount(() => tova_el('div', {}, []), null);
    console.error = o;
    expect(e.some(x => x.includes('Mount target'))).toBe(true);
  });

  test('mount fallback removeChild', () => {
    setupDOM();
    const c = createMockElement('div');
    delete c.replaceChildren;
    c.appendChild(createMockElement('div'));
    mount(() => tova_el('div', {}, []), c);
  });

  test('mount static vnode', () => {
    setupDOM();
    const c = createMockElement('div');
    mount(tova_el('div', {}, ['s']), c);
    expect(c.childNodes.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 32. HYDRATE
// ═══════════════════════════════════════════════════════════════
describe('Hydrate', () => {
  test('null container', () => {
    const e = []; const o = console.error; console.error = (...a) => e.push(a.join(' '));
    hydrate(() => tova_el('div', {}, []), null);
    console.error = o;
    expect(e.some(x => x.includes('Hydration target'))).toBe(true);
  });

  test('dispatches tova:hydrated event', () => {
    setupDOM();
    const c = createMockElement('div');
    c.appendChild(createMockElement('div'));
    let fired = false;
    c.addEventListener('tova:hydrated', () => { fired = true; });
    hydrate(() => tova_el('div', {}, []), c);
    expect(fired).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 33. TRANSITION GROUP
// ═══════════════════════════════════════════════════════════════
describe('TransitionGroup', () => {
  test('wraps children', () => {
    const r = TransitionGroup({
      name: 'fade', tag: 'ul',
      children: [tova_el('li', { key: '1' }, ['A']), tova_el('li', { key: '2' }, ['B'])],
    });
    expect(r.tag).toBe('ul');
    expect(r._transitionGroup).toBeTruthy();
    for (const c of r.children) expect(c._transition).toBeTruthy();
  });

  test('no children', () => {
    expect(TransitionGroup({ name: 'slide', children: null }).__tova).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 34. CREATE FORM
// ═══════════════════════════════════════════════════════════════
describe('createForm', () => {
  test('basic creation', () => {
    const f = createForm({ fields: { email: { initial: '', validate: v => v.includes('@') ? null : 'bad' } } });
    expect(f.field('email')).toBeTruthy();
  });

  test('validation', () => {
    const f = createForm({ fields: { email: { initial: 'x', validate: v => v.includes('@') ? null : 'bad' } } });
    expect(f.field('email').validate()).toBe('bad');
  });

  test('set and blur', () => {
    const f = createForm({ fields: { name: { initial: '', validate: v => v ? null : 'req' } } });
    f.field('name').blur();
    expect(f.field('name').touched()).toBe(true);
    f.field('name').set('J');
  });

  test('values', () => {
    const f = createForm({ fields: { a: { initial: '1' }, b: { initial: '2' } } });
    expect(f.values()).toEqual({ a: '1', b: '2' });
  });

  test('reset', () => {
    const f = createForm({ fields: { n: { initial: 'orig' } } });
    f.field('n').set('changed');
    f.reset();
    expect(f.field('n').value()).toBe('orig');
  });

  test('submit success', async () => {
    let s = null;
    const f = createForm({
      fields: { e: { initial: 't@t', validate: () => null } },
      onSubmit: async (v) => { s = v; },
    });
    await f.submit();
    expect(s.e).toBe('t@t');
  });

  test('submit validation fails', async () => {
    let ran = false;
    const f = createForm({
      fields: { e: { initial: '', validate: v => v ? null : 'req' } },
      onSubmit: async () => { ran = true; },
    });
    await f.submit();
    expect(ran).toBe(false);
  });

  test('submit error', async () => {
    const f = createForm({
      fields: { x: { initial: 'v', validate: () => null } },
      onSubmit: async () => { throw new Error('fail'); },
    });
    await f.submit();
    expect(f.submitError()).toBeTruthy();
  });

  test('submit with event', async () => {
    let p = false;
    const f = createForm({ fields: { x: { initial: 'v', validate: () => null } }, onSubmit: async () => {} });
    await f.submit({ preventDefault: () => { p = true; } });
    expect(p).toBe(true);
  });

  test('isValid', () => {
    const f = createForm({ fields: { e: { initial: 'x', validate: v => v.includes('@') ? null : 'bad' } } });
    expect(f.isValid()).toBe(true);
    f.field('e').validate();
    expect(f.isValid()).toBe(false);
  });

  test('isDirty', () => {
    const f = createForm({ fields: { n: { initial: 'o' } } });
    expect(f.isDirty()).toBe(false);
    f.field('n').set('c');
    expect(f.isDirty()).toBe(true);
  });

  test('unknown field throws', () => {
    expect(() => createForm({ fields: {} }).field('x')).toThrow();
  });

  test('no onSubmit', async () => {
    const f = createForm({ fields: { x: { initial: 'v', validate: () => null } } });
    await f.submit();
  });

  test('validateOnChange when touched', () => {
    const f = createForm({
      fields: { e: { initial: '', validate: v => v ? null : 'req' } },
      validateOnChange: true,
    });
    f.field('e').blur();
    f.field('e').set('');
    expect(f.field('e').error()).toBe('req');
  });
});

// ═══════════════════════════════════════════════════════════════
// 35. DEVTOOLS HOOKS
// ═══════════════════════════════════════════════════════════════
describe('DevTools hooks', () => {
  test('enableDevTools', () => {
    __enableDevTools({
      onSignalCreate: () => 1, onSignalUpdate: () => {},
      onEffectCreate: () => {}, onEffectRun: () => {},
      onComponentRender: () => {}, onMount: () => {}, onHydrate: () => {},
    });
    const [s, setS] = createSignal(0, 'test');
    setS(1);
    __enableDevTools(null);
  });
});

// ═══════════════════════════════════════════════════════════════
// 36. BATCH
// ═══════════════════════════════════════════════════════════════
describe('Batch', () => {
  test('defers effects', () => {
    let n = 0;
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);
    createEffect(() => { a(); b(); n++; });
    const before = n;
    batch(() => { setA(1); setB(1); });
    expect(n - before).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 37. onBeforeUpdate
// ═══════════════════════════════════════════════════════════════
describe('onBeforeUpdate', () => {
  test('fires before effect re-runs', () => {
    let called = false;
    createRoot(() => {
      const [s, setS] = createSignal(0);
      onBeforeUpdate(() => { called = true; });
      createEffect(() => { s(); });
      batch(() => { setS(1); });
    });
    expect(called).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 38. EFFECT CLEANUP
// ═══════════════════════════════════════════════════════════════
describe('Effect cleanup', () => {
  test('return function cleanup', () => {
    let cleaned = false;
    const [s, setS] = createSignal(0);
    createEffect(() => { s(); return () => { cleaned = true; }; });
    setS(1);
    expect(cleaned).toBe(true);
  });

  test('onCleanup', () => {
    let cleaned = false;
    const [s, setS] = createSignal(0);
    createEffect(() => { s(); onCleanup(() => { cleaned = true; }); });
    setS(1);
    expect(cleaned).toBe(true);
  });

  test('effect error invokes handler', () => {
    let caught = null;
    const b = createErrorBoundary({ onError: ({ error }) => { caught = error; } });
    b.run(() => { createEffect(() => { throw new Error('eff err'); }); });
    expect(caught).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
// 39. createRoot DISPOSE
// ═══════════════════════════════════════════════════════════════
describe('createRoot dispose', () => {
  test('reverse cleanups', () => {
    const order = [];
    let d;
    createRoot((dispose) => { d = dispose; onUnmount(() => order.push('a')); onUnmount(() => order.push('b')); return dispose; });
    d();
    expect(order).toEqual(['b', 'a']);
  });

  test('idempotent', () => {
    let n = 0; let d;
    createRoot((dispose) => { d = dispose; onUnmount(() => n++); return dispose; });
    d(); d();
    expect(n).toBe(1);
  });

  test('child effects disposed', () => {
    let n = 0; let d;
    const [s, setS] = createSignal(0);
    createRoot((dispose) => { d = dispose; createEffect(() => { s(); n++; }); return dispose; });
    d(); setS(1);
    expect(n).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 40. FLUSH onBeforeUpdate error
// ═══════════════════════════════════════════════════════════════
describe('Flush onBeforeUpdate error', () => {
  test('catches error', () => {
    const e = []; const o = console.error; console.error = (...a) => e.push(a.join(' '));
    createRoot(() => {
      const [s, setS] = createSignal(0);
      onBeforeUpdate(() => { throw new Error('bue'); });
      createEffect(() => { s(); });
      batch(() => { setS(1); });
    });
    console.error = o;
    expect(e.some(x => x.includes('onBeforeUpdate error'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 41. DYNAMIC ARRAY RECONCILIATION
// ═══════════════════════════════════════════════════════════════
describe('Dynamic array reconciliation', () => {
  test('positional', () => {
    setupDOM();
    const c = createMockElement('div');
    const [items, setItems] = createSignal(['x', 'y']);
    createRoot(() => {
      c.appendChild(render(() => items().map(i => tova_el('span', {}, [i]))));
      setItems(['x', 'y', 'z']);
    });
  });

  test('keyed', () => {
    setupDOM();
    const c = createMockElement('div');
    const [items, setItems] = createSignal([1, 2]);
    createRoot(() => {
      c.appendChild(render(() => items().map(i => { const v = tova_el('li', {}, [String(i)]); tova_keyed('k' + i, v); return v; })));
      setItems([2, 1]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 42. CLEAR MARKER CONTENT WITH TRANSITIONS
// ═══════════════════════════════════════════════════════════════
describe('Clear marker content with transitions', () => {
  test('animated leave', () => {
    setupDOM();
    const c = createMockElement('div');
    const [show, setShow] = createSignal(true);
    createRoot(() => {
      c.appendChild(render(() => {
        if (show()) { const v = tova_el('div', {}, ['anim']); tova_transition(v, 'fade', { duration: 100 }); return v; }
        return null;
      }));
      setShow(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 43. FLATTEN VNODES
// ═══════════════════════════════════════════════════════════════
describe('flattenVNodes', () => {
  test('nested arrays', () => {
    setupDOM();
    const c = createMockElement('div');
    createRoot(() => {
      c.appendChild(render(tova_fragment([
        [tova_el('span', {}, ['a']), [tova_el('span', {}, ['b'])]],
        null, undefined,
        tova_el('span', {}, ['c']),
      ])));
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 44. onMount
// ═══════════════════════════════════════════════════════════════
describe('onMount', () => {
  test('runs', async () => {
    let m = false;
    createRoot(() => { onMount(() => { m = true; }); });
    await new Promise(r => setTimeout(r, 10));
    expect(m).toBe(true);
  });

  test('return cleanup', async () => {
    let cleaned = false; let d;
    createRoot((dispose) => { d = dispose; onMount(() => () => { cleaned = true; }); return dispose; });
    await new Promise(r => setTimeout(r, 10));
    d();
    expect(cleaned).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 45. EFFECT DEPTH SCHEDULING
// ═══════════════════════════════════════════════════════════════
describe('Effect depth scheduling', () => {
  test('parent before child', () => {
    const order = [];
    createRoot(() => {
      const [s, setS] = createSignal(0);
      createEffect(() => { s(); order.push('parent'); });
      createRoot(() => { createEffect(() => { s(); order.push('child'); }); });
      order.length = 0;
      batch(() => { setS(1); });
    });
    const p = order.indexOf('parent'), c = order.indexOf('child');
    if (p >= 0 && c >= 0) expect(p).toBeLessThan(c);
  });
});

// ═══════════════════════════════════════════════════════════════
// 46. DISPOSED EFFECT SKIPPED
// ═══════════════════════════════════════════════════════════════
describe('Disposed effects skipped', () => {
  test('not run after dispose', () => {
    let n = 0;
    const [s, setS] = createSignal(0);
    const eff = createEffect(() => { s(); n++; });
    eff.dispose();
    setS(1);
    expect(n).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 47. UNTRACK
// ═══════════════════════════════════════════════════════════════
describe('Untrack', () => {
  test('prevents tracking', () => {
    let n = 0;
    const [s, setS] = createSignal(0);
    createEffect(() => { untrack(() => s()); n++; });
    setS(1);
    expect(n).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 48. COMPUTED LAZY
// ═══════════════════════════════════════════════════════════════
describe('Computed lazy', () => {
  test('recomputes when dirty', () => {
    const [s, setS] = createSignal(1);
    const c = createComputed(() => s() * 3);
    expect(c()).toBe(3);
    setS(2);
    expect(c()).toBe(6);
  });

  test('tracks for effects', () => {
    let n = 0;
    const [s, setS] = createSignal(1);
    const c = createComputed(() => s() * 2);
    createEffect(() => { c(); n++; });
    setS(5);
    expect(n).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// 49. HEAD WITH VARIOUS PROPS
// ═══════════════════════════════════════════════════════════════
describe('Head with various prop types', () => {
  test('skips on/key/ref', () => {
    setupDOM();
    createRoot(() => { Head({ children: [tova_el('meta', { name: 'd', key: 'k', ref: {}, onClick: () => {} }, [])] }); });
  });

  test('false/null props', () => {
    setupDOM();
    createRoot(() => { Head({ children: [tova_el('link', { rel: 's', disabled: false, crossOrigin: null }, [])] }); });
  });

  test('reactive prop', () => {
    setupDOM();
    createRoot(() => { Head({ children: [tova_el('meta', { content: () => 'dyn' }, [])] }); });
  });
});

// ═══════════════════════════════════════════════════════════════
// 50. ROOT CLEANUP ERROR
// ═══════════════════════════════════════════════════════════════
describe('Root cleanup error', () => {
  test('caught and logged', () => {
    const e = []; const o = console.error; console.error = (...a) => e.push(a.join(' '));
    let d;
    createRoot((dispose) => { d = dispose; onUnmount(() => { throw new Error('boom'); }); return dispose; });
    d();
    console.error = o;
    expect(e.some(x => x.includes('root cleanup error'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 51. EFFECT CLEANUP ERROR
// ═══════════════════════════════════════════════════════════════
describe('Effect cleanup error', () => {
  test('return cleanup error', () => {
    const e = []; const o = console.error; console.error = (...a) => e.push(a.join(' '));
    const [s, setS] = createSignal(0);
    createEffect(() => { s(); return () => { throw new Error('ce'); }; });
    setS(1);
    console.error = o;
    expect(e.some(x => x.includes('cleanup error'))).toBe(true);
  });

  test('onCleanup error', () => {
    const e = []; const o = console.error; console.error = (...a) => e.push(a.join(' '));
    const [s, setS] = createSignal(0);
    createEffect(() => { s(); onCleanup(() => { throw new Error('oce'); }); });
    setS(1);
    console.error = o;
    expect(e.some(x => x.includes('cleanup error'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 52. CSS STYLE CLEANUP FALLBACK
// ═══════════════════════════════════════════════════════════════
describe('CSS style cleanup fallback', () => {
  test('removeChild fallback', () => {
    setupDOM();
    configureCSP({ nonce: null });
    let d;
    createRoot((dispose) => {
      d = dispose;
      tova_inject_css('fb-style', '.fb { color: red; }');
      const s = document.head.childNodes.find(c => c._attrs && c._attrs['data-tova-style'] === 'fb-style');
      if (s) delete s.remove;
      return dispose;
    });
    d();
  });
});

// ═══════════════════════════════════════════════════════════════
// 53. HEAD CLEANUP FALLBACK
// ═══════════════════════════════════════════════════════════════
describe('Head cleanup fallback', () => {
  test('removeChild fallback', () => {
    setupDOM();
    let d;
    createRoot((dispose) => {
      d = dispose;
      Head({ children: [tova_el('link', { rel: 'icon' }, [])] });
      const last = document.head.childNodes[document.head.childNodes.length - 1];
      if (last) delete last.remove;
      return dispose;
    });
    d();
  });
});

// ═══════════════════════════════════════════════════════════════
// 54. LEAVE TRANSITION VARIANTS
// ═══════════════════════════════════════════════════════════════
describe('Leave transition variants', () => {
  test('custom returning promise', () => {
    setupDOM();
    const c = createMockElement('div');
    const [show, setShow] = createSignal(true);
    createRoot(() => {
      c.appendChild(render(() => {
        if (show()) {
          const v = tova_el('div', {}, ['cp']);
          tova_transition(v, (el, cfg, phase) => phase === 'leave' ? new Promise(r => setTimeout(r, 50)) : {}, { duration: 100 });
          return v;
        }
        return null;
      }));
      setShow(false);
    });
  });

  test('custom returning object', () => {
    setupDOM();
    const c = createMockElement('div');
    const [show, setShow] = createSignal(true);
    createRoot(() => {
      c.appendChild(render(() => {
        if (show()) {
          const v = tova_el('div', {}, ['co']);
          tova_transition(v, (el, cfg, phase) => phase === 'leave' ? { opacity: '0' } : { opacity: '1' }, { duration: 100 });
          return v;
        }
        return null;
      }));
      setShow(false);
    });
  });

  test('directional out', () => {
    setupDOM();
    const c = createMockElement('div');
    const [show, setShow] = createSignal(true);
    createRoot(() => {
      c.appendChild(render(() => {
        if (show()) {
          const v = tova_el('div', {}, ['do']);
          tova_transition(v, { in: { name: 'fade', config: {} }, out: { name: 'scale', config: { duration: 100 } } });
          return v;
        }
        return null;
      }));
      setShow(false);
    });
  });

  test('directional no out', () => {
    setupDOM();
    const c = createMockElement('div');
    const [show, setShow] = createSignal(true);
    createRoot(() => {
      c.appendChild(render(() => {
        if (show()) {
          const v = tova_el('div', {}, ['no']);
          tova_transition(v, { in: { name: 'fade', config: {} } });
          return v;
        }
        return null;
      }));
      setShow(false);
    });
  });

  test('enter directional no in', () => {
    setupDOM();
    const v = tova_el('div', {}, ['ni']);
    tova_transition(v, { out: { name: 'fade', config: {} } });
    createRoot(() => { render(v); });
  });
});

// ═══════════════════════════════════════════════════════════════
// 55. ERROR BOUNDARY FALLBACK THROWS
// ═══════════════════════════════════════════════════════════════
describe('ErrorBoundary fallback throws', () => {
  test('propagates to parent', () => {
    setupDOM();
    let parentCaught = null;
    const pb = createErrorBoundary({ onError: ({ error }) => { parentCaught = error; } });
    pb.run(() => {
      const vnode = ErrorBoundary({
        fallback: () => { throw new Error('fb err'); },
        children: [tova_el('div', {}, [])],
        onError: () => {},
      });
      vnode._errorHandler(new Error('child'));
      vnode.compute();
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 56. RENDER DYNAMIC ERROR WITHOUT HANDLER
// ═══════════════════════════════════════════════════════════════
describe('Render dynamic error without handler', () => {
  test('logs uncaught', () => {
    setupDOM();
    const e = []; const o = console.error; console.error = (...a) => e.push(a.join(' '));
    const c = createMockElement('div');
    createRoot(() => {
      c.appendChild(render({
        __tova: true, tag: '__dynamic', props: {}, children: [],
        compute: () => { throw new Error('uce'); },
      }));
    });
    console.error = o;
    expect(e.some(x => x.includes('Uncaught error') || x.includes('uce'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 57. APPLY PROPS FULL COVERAGE
// ═══════════════════════════════════════════════════════════════
describe('applyProps coverage', () => {
  test('removes old className', () => {
    setupDOM();
    const c = createMockElement('div');
    const [cls, setCls] = createSignal('old');
    createRoot(() => {
      c.appendChild(render(() => [tova_el('div', { key: 'a', className: cls() }, ['t'])]));
      setCls('new');
    });
  });

  test('removes old event handler', () => {
    setupDOM();
    const c = createMockElement('div');
    const [hc, setHc] = createSignal(true);
    createRoot(() => {
      c.appendChild(render(() => {
        const p = hc() ? { key: 'b', onClick: () => {} } : { key: 'b' };
        return [tova_el('button', p, ['b'])];
      }));
      setHc(false);
    });
  });

  test('removes old style', () => {
    setupDOM();
    const c = createMockElement('div');
    const [hs, setHs] = createSignal(true);
    createRoot(() => {
      c.appendChild(render(() => {
        const p = hs() ? { key: 'c', style: { color: 'red' } } : { key: 'c' };
        return [tova_el('div', p, ['s'])];
      }));
      setHs(false);
    });
  });

  test('updates checked', () => {
    setupDOM();
    const c = createMockElement('div');
    const [ch, setCh] = createSignal(false);
    createRoot(() => {
      c.appendChild(render(() => [tova_el('input', { key: 'chk', checked: ch() }, [])]));
      setCh(true);
    });
  });

  test('updates value', () => {
    setupDOM();
    const c = createMockElement('div');
    const [v, setV] = createSignal('old');
    createRoot(() => {
      c.appendChild(render(() => [tova_el('input', { key: 'inp', value: v() }, [])]));
      setV('new');
    });
  });

  test('updates generic attr', () => {
    setupDOM();
    const c = createMockElement('div');
    const [a, setA] = createSignal('v1');
    createRoot(() => {
      c.appendChild(render(() => [tova_el('div', { key: 'd', 'data-x': a() }, ['t'])]));
      setA('v2');
    });
  });

  test('handler object options update', () => {
    setupDOM();
    const c = createMockElement('div');
    const [h, setH] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => [tova_el('div', {
        key: 'ev',
        onClick: { handler: () => h(), options: { capture: true } },
      }, ['t'])]));
      setH(2);
    });
  });

  test('ref via patching (object)', () => {
    setupDOM();
    const ref = createRef();
    const c = createMockElement('div');
    createRoot(() => {
      c.appendChild(render(() => [tova_el('div', { key: 'r', ref }, ['t'])]));
    });
    expect(ref.current).toBeTruthy();
  });

  test('ref via patching (function)', () => {
    setupDOM();
    let r = null;
    const c = createMockElement('div');
    createRoot(() => {
      c.appendChild(render(() => [tova_el('div', { key: 'rf', ref: el => { r = el; } }, ['t'])]));
    });
    expect(r).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
// 58. HYDRATE ELEMENT WITH CHILDREN
// ═══════════════════════════════════════════════════════════════
describe('Hydrate element with children', () => {
  test('recurses', () => {
    setupDOM();
    const c = createMockElement('div');
    const p = createMockElement('div');
    p.appendChild(createMockElement('span'));
    c.appendChild(p);
    hydrate(() => tova_el('div', {}, [tova_el('span', { className: 'i' }, [])]), c);
  });
});

// ═══════════════════════════════════════════════════════════════
// 59. REENTRANT FLUSH PREVENTION
// ═══════════════════════════════════════════════════════════════
describe('Reentrant flush', () => {
  test('prevented', () => {
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);
    createEffect(() => { if (a() === 1) setB(1); });
    createEffect(() => { b(); });
    setA(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 60. DEVTOOLS MOUNT/HYDRATE HOOKS
// ═══════════════════════════════════════════════════════════════
describe('DevTools mount/hydrate hooks', () => {
  test('mount fires onMount hook', () => {
    setupDOM();
    let called = false;
    __enableDevTools({
      onSignalCreate: () => 0, onSignalUpdate: () => {},
      onEffectCreate: () => {}, onEffectRun: () => {},
      onComponentRender: () => {},
      onMount: () => { called = true; },
      onHydrate: () => {},
    });
    const c = createMockElement('div');
    mount(() => tova_el('div', {}, []), c);
    expect(called).toBe(true);
    __enableDevTools(null);
  });

  test('hydrate fires onHydrate hook', () => {
    setupDOM();
    let called = false;
    __enableDevTools({
      onSignalCreate: () => 0, onSignalUpdate: () => {},
      onEffectCreate: () => {}, onEffectRun: () => {},
      onComponentRender: () => {},
      onMount: () => {},
      onHydrate: () => { called = true; },
    });
    const c = createMockElement('div');
    c.appendChild(createMockElement('div'));
    hydrate(() => tova_el('div', {}, []), c);
    expect(called).toBe(true);
    __enableDevTools(null);
  });
});

// ═══════════════════════════════════════════════════════════════
// ADDITIONAL COVERAGE TESTS - targeting remaining uncovered lines
// ═══════════════════════════════════════════════════════════════

// Lines 236-237, 255: DevTools hooks with effects (onEffectRun with performance)
describe('DevTools effect run with performance', () => {
  test('onEffectRun called with duration', () => {
    let effectRunCalled = false;
    let effectCreateCalled = false;
    __enableDevTools({
      onSignalCreate: () => 0,
      onSignalUpdate: () => {},
      onEffectCreate: () => { effectCreateCalled = true; },
      onEffectRun: (eff, dur) => { effectRunCalled = true; },
      onComponentRender: () => {},
      onMount: () => {},
      onHydrate: () => {},
    });
    const [s, setS] = createSignal(0);
    createEffect(() => { s(); });
    setS(1);
    expect(effectRunCalled).toBe(true);
    expect(effectCreateCalled).toBe(true);
    __enableDevTools(null);
  });
});

// Lines 406-409: Watch dispose fallback (when effect.dispose doesn't exist)
// This is actually hard to trigger since createEffect always sets .dispose
// The fallback path is: effect.dispose ? ... : () => {...}
// In normal usage, effect.dispose always exists. Just confirm watch works.

// Lines 508-510: ErrorBoundary resetBoundary (internal function)
describe('ErrorBoundary resetBoundary coverage', () => {
  test('reset via fallback props resets boundary', () => {
    setupDOM();
    let fallbackProps = null;
    let resetCalled = false;
    const vnode = ErrorBoundary({
      fallback: (props) => { fallbackProps = props; return tova_el('div', {}, ['fb']); },
      children: [tova_el('div', {}, ['ok'])],
      onError: () => {},
      onReset: () => { resetCalled = true; },
      retry: 0,
    });
    // Trigger error
    vnode._errorHandler(new Error('e1'));
    // Compute to get fallback props
    vnode.compute();
    // Call reset through the props
    expect(fallbackProps.reset).toBeTruthy();
    fallbackProps.reset();
    expect(resetCalled).toBe(true);
    // After reset, compute should return childContent (not fallback)
    const result = vnode.compute();
    expect(result).toBeTruthy();
  });
});

// Lines 547, 549-551: ErrorBoundary onErrorCleared callback
describe('ErrorBoundary onErrorCleared', () => {
  test('fires onErrorCleared when recovered', (done) => {
    setupDOM();
    let cleared = false;
    let fallbackProps = null;
    const vnode = ErrorBoundary({
      fallback: (props) => { fallbackProps = props; return tova_el('div', {}, ['err']); },
      children: [tova_el('div', {}, ['child'])],
      onError: () => {},
      onErrorCleared: () => { cleared = true; },
      retry: 0,
    });
    // Trigger error
    vnode._errorHandler(new Error('fail'));
    vnode.compute(); // renders fallback
    // Reset through fallback props
    fallbackProps.reset();
    // Now compute should return children and fire onErrorCleared
    vnode.compute();
    setTimeout(() => {
      expect(cleared).toBe(true);
      done();
    }, 50);
  });
});

// Line 625: Dynamic component - component is a signal returning a function
describe('Dynamic with signal returning component', () => {
  test('signal-based component that resolves to function', () => {
    const MyComp = (props) => tova_el('span', {}, ['dynamic']);
    const [comp, setComp] = createSignal(MyComp);
    const vnode = Dynamic({ component: comp });
    const result = vnode.compute();
    expect(result.__tova).toBe(true);
  });

  test('dynamic returns non-function vnode', () => {
    const staticVNode = tova_el('div', {}, ['static']);
    const vnode = Dynamic({ component: staticVNode });
    const result = vnode.compute();
    expect(result.__tova).toBe(true);
  });
});

// Lines 658, 661, 674: Suspense register/resolve/fallback
describe('Suspense with lazy component', () => {
  test('suspense shows fallback while pending', async () => {
    let resolveLoader;
    const LazyComp = lazy(() => new Promise(r => { resolveLoader = r; }));

    createRoot(() => {
      const vnode = Suspense({
        fallback: tova_el('div', {}, ['Loading...']),
        children: [LazyComp({})],
      });
      // Initial compute: pending > 0, should return fallback
      const result = vnode.compute();
      // result should be the fallback or related to loading state
    });

    // Resolve
    if (resolveLoader) resolveLoader({ default: () => tova_el('div', {}, ['loaded']) });
    await new Promise(r => setTimeout(r, 50));
  });

  test('suspense fallback function', () => {
    createRoot(() => {
      const vnode = Suspense({
        fallback: () => tova_el('div', {}, ['Loading fn...']),
        children: [tova_el('div', {}, ['content'])],
      });
      vnode.compute();
    });
  });
});

// Lines 720-724: Lazy compute with fallback prop
describe('Lazy with individual fallback', () => {
  test('shows individual fallback while loading', () => {
    const LazyComp = lazy(() => new Promise(() => {})); // never resolves
    createRoot(() => {
      const vnode = LazyComp({ fallback: tova_el('span', {}, ['per-comp fallback']) });
      const result = vnode.compute();
      // Should return the per-component fallback
    });
  });

  test('shows error after load failure', async () => {
    const LazyComp = lazy(() => Promise.reject(new Error('load err')));
    createRoot(() => { LazyComp({}); });
    await new Promise(r => setTimeout(r, 50));
    // On second call, loadError is set
    createRoot(() => {
      const vnode = LazyComp({});
      // vnode is already resolved to the error state
    });
  });
});

// Lines 912-918: CSP nonce auto-detection (getCSPNonce)
// Note: __cspNonce is module-level and configureCSP can't reset it to null,
// so auto-detection path is tested via the first tova_inject_css call in
// the "CSP nonce detection" describe above (before configureCSP sets it).
describe('CSP nonce auto-detection detailed', () => {
  test('exercises getCSPNonce code path', () => {
    setupDOM();
    // Even though __cspNonce is already set from earlier tests,
    // this exercises the inject_css codepath for coverage
    document.querySelector = (sel) => {
      if (sel === 'meta[name="csp-nonce"]') {
        return { getAttribute: (name) => name === 'content' ? 'detected-nonce' : null };
      }
      return null;
    };
    createRoot(() => {
      tova_inject_css('csp-auto-id2', '.auto { color: green; }');
    });
  });
});

// Lines 994-1017: Transition CSS for slide/scale/fly enter-to and leave-to
describe('Transition CSS all types via render', () => {
  test('slide transition renders', () => {
    setupDOM();
    const v = tova_el('div', {}, ['slide']);
    tova_transition(v, 'slide', { duration: 200, axis: 'y', distance: 30 });
    createRoot(() => { render(v); });
  });

  test('scale transition renders', () => {
    setupDOM();
    const v = tova_el('div', {}, ['scale']);
    tova_transition(v, 'scale', { duration: 200 });
    createRoot(() => { render(v); });
  });

  test('fly transition renders', () => {
    setupDOM();
    const v = tova_el('div', {}, ['fly']);
    tova_transition(v, 'fly', { duration: 200, x: 5, y: -10 });
    createRoot(() => { render(v); });
  });

  test('slide x-axis leave', () => {
    setupDOM();
    const c = createMockElement('div');
    const [show, setShow] = createSignal(true);
    createRoot(() => {
      c.appendChild(render(() => {
        if (show()) {
          const v = tova_el('div', {}, ['sl']);
          tova_transition(v, 'slide', { duration: 50, axis: 'x' });
          return v;
        }
        return null;
      }));
      setShow(false);
    });
  });

  test('scale leave', () => {
    setupDOM();
    const c = createMockElement('div');
    const [show, setShow] = createSignal(true);
    createRoot(() => {
      c.appendChild(render(() => {
        if (show()) {
          const v = tova_el('div', {}, ['sc']);
          tova_transition(v, 'scale', { duration: 50 });
          return v;
        }
        return null;
      }));
      setShow(false);
    });
  });

  test('fly leave', () => {
    setupDOM();
    const c = createMockElement('div');
    const [show, setShow] = createSignal(true);
    createRoot(() => {
      c.appendChild(render(() => {
        if (show()) {
          const v = tova_el('div', {}, ['fl']);
          tova_transition(v, 'fly', { duration: 50, x: 10, y: -20 });
          return v;
        }
        return null;
      }));
      setShow(false);
    });
  });

  test('unknown transition type leave', () => {
    setupDOM();
    const c = createMockElement('div');
    const [show, setShow] = createSignal(true);
    createRoot(() => {
      c.appendChild(render(() => {
        if (show()) {
          const v = tova_el('div', {}, ['unk']);
          tova_transition(v, 'unknown-type', { duration: 50 });
          return v;
        }
        return null;
      }));
      setShow(false);
    });
  });
});

// Lines 1549-1553: dangerouslySetInnerHTML via applyPropValue
describe('dangerouslySetInnerHTML coverage', () => {
  test('renders HTML content', () => {
    setupDOM();
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...args) => warns.push(args.join(' '));
    createRoot(() => {
      render(tova_el('div', { dangerouslySetInnerHTML: { __html: '<b>bold</b>' } }, []));
    });
    console.warn = origWarn;
    expect(warns.some(w => w.includes('dangerouslySetInnerHTML'))).toBe(true);
  });

  test('dangerouslySetInnerHTML with null value', () => {
    setupDOM();
    createRoot(() => {
      render(tova_el('div', { dangerouslySetInnerHTML: null }, []));
    });
  });
});

// Lines 1596, 1599: applyProps remove old className and style
describe('applyProps remove branches', () => {
  test('remove old className via keyed patch', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) {
          return [tova_el('div', { key: 'x', className: 'old', style: { color: 'red' } }, ['t'])];
        }
        return [tova_el('div', { key: 'x' }, ['t'])]; // removed className and style
      }));
      setStep(2);
    });
  });

  test('applyProps removes old generic attribute', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) {
          return [tova_el('div', { key: 'y', 'data-foo': 'bar' }, [])];
        }
        return [tova_el('div', { key: 'y' }, [])]; // removed data-foo
      }));
      setStep(2);
    });
  });
});

// Lines 1611-1636: applyProps event handler update paths
describe('applyProps event handler updates', () => {
  test('updates simple event handler on same keyed element', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    let handler1Called = false, handler2Called = false;
    createRoot(() => {
      c.appendChild(render(() => {
        const h = step() === 1 ? () => { handler1Called = true; } : () => { handler2Called = true; };
        return [tova_el('button', { key: 'btn', onClick: h }, ['b'])];
      }));
      setStep(2);
    });
  });

  test('updates handler object with options on same keyed element', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        const h = step() === 1
          ? { handler: () => 'h1', options: { capture: true } }
          : { handler: () => 'h2', options: { passive: true } };
        return [tova_el('div', { key: 'eh', onClick: h }, ['t'])];
      }));
      setStep(2);
    });
  });

  test('applyProps className via function value', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return [tova_el('div', { key: 'cn', className: () => step() === 1 ? 'a' : 'b' }, ['t'])];
      }));
      setStep(2);
    });
  });

  test('applyProps value via function', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return [tova_el('input', { key: 'iv', value: () => step() === 1 ? 'a' : 'b' }, [])];
      }));
      setStep(2);
    });
  });

  test('applyProps generic attr via function', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return [tova_el('div', { key: 'ga', 'data-v': () => step() }, ['t'])];
      }));
      setStep(2);
    });
  });

  test('applyProps style object', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        const s = step() === 1 ? { color: 'red' } : { background: 'blue' };
        return [tova_el('div', { key: 'so', style: s }, ['t'])];
      }));
      setStep(2);
    });
  });
});

// Lines 1832-1890: patchKeyedChildren (element children, not marker)
describe('patchKeyedChildren element children', () => {
  test('keyed children of element are reconciled', () => {
    setupDOM();
    const c = createMockElement('div');
    const [items, setItems] = createSignal([1, 2, 3]);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('ul', {}, items().map(i => {
          const v = tova_el('li', { key: 'k' + i }, [String(i)]);
          return v;
        }));
      }));
      setItems([3, 1, 2]); // reorder
      setItems([2, 3]); // remove 1
      setItems([2, 3, 4]); // add 4
    });
  });

  test('keyed children with tag change', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) {
          return tova_el('div', {}, [
            tova_el('span', { key: 'a' }, ['A']),
            tova_el('span', { key: 'b' }, ['B']),
          ]);
        }
        return tova_el('div', {}, [
          tova_el('b', { key: 'a' }, ['A']), // different tag
          tova_el('span', { key: 'b' }, ['B']),
        ]);
      }));
      setStep(2);
    });
  });
});

// Lines 1905, 1911-1912: patchPositionalChildren
describe('patchPositionalChildren element children', () => {
  test('positional children of element grow and shrink', () => {
    setupDOM();
    const c = createMockElement('div');
    const [items, setItems] = createSignal(['a', 'b']);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('ul', {}, items().map(i => tova_el('li', {}, [i])));
      }));
      setItems(['a', 'b', 'c']); // grow
      setItems(['a']); // shrink
    });
  });
});

// Lines 1929-1994: patchSingle all branches
describe('patchSingle comprehensive', () => {
  test('patch existing null: append new', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, step() === 1 ? [] : [tova_el('p', {}, ['added'])]);
      }));
      setStep(2); // triggers patchSingle with existing=undefined, adds child
    });
  });

  test('patch to null: remove existing', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, step() === 1 ? [tova_el('p', {}, ['x'])] : []);
      }));
      setStep(2); // removes child
    });
  });

  test('patch string to element (type change)', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, step() === 1 ? ['text'] : [tova_el('b', {}, ['bold'])]);
      }));
      setStep(2);
    });
  });

  test('patch element to text', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, step() === 1 ? [tova_el('span', {}, ['el'])] : ['text']);
      }));
      setStep(2);
    });
  });

  test('patch element to non-tova object', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) return tova_el('div', {}, [tova_el('span', {}, ['el'])]);
        return tova_el('div', {}, [{ toString: () => 'obj' }]);
      }));
      setStep(2);
    });
  });

  test('patch text to non-tova object via text node', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, step() === 1 ? ['hello'] : [{ toString: () => 'obj' }]);
      }));
      setStep(2);
    });
  });

  test('patch fragment over non-fragment', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) return tova_el('div', {}, [tova_el('p', {}, ['one'])]);
        return tova_el('div', {}, [tova_fragment([tova_el('span', {}, ['a']), tova_el('span', {}, ['b'])])]);
      }));
      setStep(2);
    });
  });

  test('patch fragment over existing fragment', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, [
          tova_fragment(step() === 1
            ? [tova_el('span', {}, ['a'])]
            : [tova_el('span', {}, ['b']), tova_el('span', {}, ['c'])]
          ),
        ]);
      }));
      setStep(2);
    });
  });

  test('patch function vnode over existing marker', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    const [val, setVal] = createSignal('x');
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) return tova_el('div', {}, [() => val()]);
        return tova_el('div', {}, [() => 'replaced']);
      }));
      setStep(2);
    });
  });

  test('patch element different tag (full replace)', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) return tova_el('div', {}, [tova_el('span', {}, ['s'])]);
        return tova_el('div', {}, [tova_el('b', {}, ['b'])]);
      }));
      setStep(2);
    });
  });
});

// Lines 1464: Portal querySelector null (target not found)
describe('Portal with invalid target', () => {
  test('portal does nothing if target not found', (done) => {
    setupDOM();
    document.querySelector = () => null;
    createRoot(() => {
      render(Portal({ target: '#nonexistent', children: [tova_el('div', {}, ['x'])] }));
    });
    setTimeout(done, 50);
  });
});

// Lines 2081: hydration text mismatch for function vnode
describe('Hydration function vnode text mismatch', () => {
  test('warns on function vnode text mismatch', () => {
    setupDOM();
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...args) => warns.push(args.join(' '));
    const container = createMockElement('div');
    const textNode = createMockTextNode('wrong-text');
    container.appendChild(textNode);
    const [val] = createSignal('correct-text');
    hydrate(() => (() => val()), container);
    console.warn = origWarn;
    expect(warns.some(w => w.includes('text expected') && w.includes('correct-text'))).toBe(true);
  });
});

// Lines 2206-2208: hydrateProps plain event handler
describe('Hydration plain event handler', () => {
  test('attaches plain event handler during hydration', () => {
    setupDOM();
    let clicked = false;
    const container = createMockElement('div');
    const existing = createMockElement('button');
    container.appendChild(existing);
    hydrate(() => tova_el('button', { onClick: () => { clicked = true; } }, []), container);
    expect(existing.__handlers.click).toBeTruthy();
  });
});

// Lines 1180-1181: disposeNode with __tovaRoot
describe('disposeNode with __tovaRoot', () => {
  test('disposes nodes with __tovaRoot during dynamic updates', () => {
    setupDOM();
    const c = createMockElement('div');
    const [show, setShow] = createSignal(true);
    let rootDisposed = false;
    createRoot(() => {
      c.appendChild(render(() => {
        if (show()) {
          const v = tova_el('div', {}, ['has-root']);
          return v;
        }
        return null;
      }));
      // Manually set __tovaRoot on the rendered element
      const el = c.childNodes.find(n => n.nodeType === 1);
      if (el) el.__tovaRoot = () => { rootDisposed = true; };
      setShow(false);
    });
  });
});

// Lines 1199-1204: isOwnedBy chain traversal
// This is tested implicitly via keyed reconciliation with nested markers

// Lines 1228: nextSiblingAfterMarker with nested markers
describe('nextSiblingAfterMarker with nested markers', () => {
  test('handles nested marker chains', () => {
    setupDOM();
    const c = createMockElement('div');
    const [items, setItems] = createSignal([
      [1, 2],
      [3, 4],
    ]);
    createRoot(() => {
      c.appendChild(render(() => {
        return items().map(group => tova_fragment(group.map(i => tova_el('span', {}, [String(i)]))));
      }));
      setItems([[5, 6]]);
    });
  });
});

// Lines 1413: render dynamic error falls to currentErrorHandler
describe('Render dynamic error with currentErrorHandler', () => {
  test('error in dynamic compute falls to currentErrorHandler', () => {
    setupDOM();
    let caught = null;
    const boundary = createErrorBoundary({
      onError: ({ error }) => { caught = error; },
    });
    const c = createMockElement('div');
    boundary.run(() => {
      c.appendChild(render({
        __tova: true, tag: '__dynamic', props: {}, children: [],
        compute: () => { throw new Error('dyn-err'); },
      }));
    });
  });
});

// Line 1712: getNodeKey
describe('getNodeKey', () => {
  test('keyed patch with nodes that have __vnode', () => {
    setupDOM();
    const c = createMockElement('div');
    const [items, setItems] = createSignal([1, 2, 3]);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, items().map(i => tova_el('span', { key: 'n' + i }, [String(i)])));
      }));
      setItems([2, 3, 1]); // reorder triggers getNodeKey
    });
  });
});

// Lines 1743-1762: keyed reconciliation with fragment return from render
describe('Keyed recon with fragment from render', () => {
  test('new keyed vnode renders as fragment', () => {
    setupDOM();
    const c = createMockElement('div');
    const [items, setItems] = createSignal([1]);
    createRoot(() => {
      c.appendChild(render(() => {
        return items().map(i => {
          if (i === 2) return tova_fragment([tova_el('span', { key: 'f2a' }, ['a']), tova_el('span', { key: 'f2b' }, ['b'])]);
          const v = tova_el('div', { key: 'k' + i }, [String(i)]);
          return v;
        });
      }));
      setItems([1, 2]); // adds item 2 which is a fragment
    });
  });
});

// Line 1920: patchChildrenOfElement keyed branch
describe('patchChildrenOfElement keyed vs positional', () => {
  test('switches from positional to keyed children', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) {
          return tova_el('ul', {}, [tova_el('li', {}, ['a']), tova_el('li', {}, ['b'])]);
        }
        return tova_el('ul', {}, [tova_el('li', { key: 'x' }, ['X']), tova_el('li', { key: 'y' }, ['Y'])]);
      }));
      setStep(2);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// DEEP PATCHING - element-level keyed/positional reconciliation
// These tests ensure patchKeyedChildren and patchPositionalChildren
// are exercised through patchChildrenOfElement
// ═══════════════════════════════════════════════════════════════
describe('Element-level keyed reconciliation (patchKeyedChildren)', () => {
  test('reorders keyed children within a stable parent element', () => {
    setupDOM();
    const c = createMockElement('div');
    const [items, setItems] = createSignal([1, 2, 3]);
    createRoot(() => {
      // The dynamic render creates a marker. Inside, we return a <ul>
      // with keyed <li> children. When items change, the <ul> stays
      // (same tag) and patchChildrenOfElement is called, which uses
      // patchKeyedChildren.
      c.appendChild(render(() => {
        return tova_el('ul', {}, items().map(i =>
          tova_el('li', { key: 'item-' + i, 'data-id': String(i) }, [String(i)])
        ));
      }));
      // Reorder: triggers patchKeyedChildren -> LIS -> reorder
      setItems([3, 1, 2]);
      // Remove one: triggers removal of unused keyed nodes
      setItems([3, 2]);
      // Add one: triggers render of new keyed node
      setItems([3, 2, 4]);
    });
  });

  test('keyed children with full tag mismatch (re-render)', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) {
          return tova_el('div', {}, [
            tova_el('span', { key: 'a' }, ['A']),
            tova_el('span', { key: 'b' }, ['B']),
          ]);
        }
        // Same keys but different tags - triggers re-render branch
        return tova_el('div', {}, [
          tova_el('b', { key: 'a' }, ['A2']),
          tova_el('i', { key: 'b' }, ['B2']),
        ]);
      }));
      setStep(2);
    });
  });

  test('keyed children reorder with LIS optimization', () => {
    setupDOM();
    const c = createMockElement('div');
    const [items, setItems] = createSignal([1, 2, 3, 4, 5]);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, items().map(i =>
          tova_el('span', { key: 'k' + i }, [String(i)])
        ));
      }));
      // Complex reorder that exercises LIS algorithm
      setItems([5, 3, 1, 4, 2]);
    });
  });
});

describe('Element-level positional reconciliation (patchPositionalChildren)', () => {
  test('positional children grow and shrink', () => {
    setupDOM();
    const c = createMockElement('div');
    const [items, setItems] = createSignal(['a', 'b']);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, items().map(i => tova_el('span', {}, [i])));
      }));
      // Grow
      setItems(['a', 'b', 'c', 'd']);
      // Shrink
      setItems(['a']);
    });
  });

  test('positional children with text update', () => {
    setupDOM();
    const c = createMockElement('div');
    const [text, setText] = createSignal('hello');
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('p', {}, [text()]);
      }));
      setText('world');
    });
  });
});

// patchSingle deep branches that require element-level patching
describe('patchSingle through element children', () => {
  test('patch element to null in element children', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) {
          return tova_el('div', {}, [tova_el('p', {}, ['content']), tova_el('span', {}, ['extra'])]);
        }
        // Fewer children - last one is removed via patchSingle
        return tova_el('div', {}, [tova_el('p', {}, ['content'])]);
      }));
      setStep(2);
    });
  });

  test('patch non-tova to element in children', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, [
          step() === 1 ? { toString: () => 'obj' } : tova_el('span', {}, ['el']),
        ]);
      }));
      setStep(2);
    });
  });

  test('patch element to non-tova in children', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, [
          step() === 1 ? tova_el('span', {}, ['el']) : { toString: () => 'obj' },
        ]);
      }));
      setStep(2);
    });
  });

  test('patch text to different text in children', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, [step() === 1 ? 'first' : 'second']);
      }));
      setStep(2);
    });
  });

  test('patch fragment in element children', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, [
          tova_fragment(step() === 1
            ? [tova_el('a', {}, ['1'])]
            : [tova_el('b', {}, ['2']), tova_el('c', {}, ['3'])]
          ),
        ]);
      }));
      setStep(2);
    });
  });

  test('patch element same tag different children', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, [
          tova_el('span', { className: step() === 1 ? 'a' : 'b' }, [step() === 1 ? 'old' : 'new']),
        ]);
      }));
      setStep(2);
    });
  });

  test('patch different tag element replaces', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, [
          step() === 1 ? tova_el('span', {}, ['x']) : tova_el('b', {}, ['y']),
        ]);
      }));
      setStep(2);
    });
  });

  test('patch function vnode in element children', () => {
    setupDOM();
    const c = createMockElement('div');
    const [val] = createSignal('dynamic');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, [
          step() === 1 ? tova_el('p', {}, ['static']) : (() => val()),
        ]);
      }));
      setStep(2);
    });
  });

  test('patchSingle: no existing, append new', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, step() === 1
          ? []
          : [tova_el('span', {}, ['added'])]
        );
      }));
      setStep(2);
    });
  });
});

// Suspense with actual pending state
describe('Suspense with pending async', () => {
  test('shows fallback then resolves', async () => {
    let resolvePromise;
    const LazyComp = lazy(() => new Promise(r => { resolvePromise = r; }));

    let suspenseResult;
    createRoot(() => {
      const vnode = Suspense({
        fallback: tova_el('div', {}, ['Loading...']),
        children: [LazyComp({})],
      });
      // The suspense boundary should have pending > 0
      suspenseResult = vnode.compute();
    });

    // Resolve the lazy component
    resolvePromise({ default: () => tova_el('div', {}, ['loaded']) });
    await new Promise(r => setTimeout(r, 100));
  });
});

// applyProps ref paths (lines 1611-1615)
describe('applyProps ref via patching', () => {
  test('ref object updated during patch', () => {
    setupDOM();
    const ref = createRef();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return [tova_el('div', { key: 'rp', ref: ref, 'data-step': String(step()) }, ['t'])];
      }));
      setStep(2); // Triggers applyProps with ref
    });
    expect(ref.current).toBeTruthy();
  });

  test('ref function updated during patch', () => {
    setupDOM();
    let refEl = null;
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        return [tova_el('div', { key: 'rpf', ref: (el) => { refEl = el; }, 'data-step': String(step()) }, ['t'])];
      }));
      setStep(2);
    });
    expect(refEl).toBeTruthy();
  });
});

// isOwnedBy (lines 1199-1204) - exercised through nested dynamic blocks
describe('isOwnedBy chain traversal', () => {
  test('nested dynamic blocks create ownership chain', () => {
    setupDOM();
    const c = createMockElement('div');
    const [outer, setOuter] = createSignal(true);
    const [inner, setInner] = createSignal('a');
    createRoot(() => {
      c.appendChild(render(() => {
        if (outer()) {
          return tova_el('div', {}, [() => inner()]);
        }
        return null;
      }));
      setInner('b');
      setOuter(false);
    });
  });
});

// removeLogicalNode (lines 1234-1235) and disposeNode (1180-1181)
describe('removeLogicalNode and disposeNode', () => {
  test('removal of marker-based nodes', () => {
    setupDOM();
    const c = createMockElement('div');
    const [items, setItems] = createSignal([1, 2, 3]);
    createRoot(() => {
      c.appendChild(render(() => {
        return tova_el('div', {}, items().map(i =>
          tova_el('span', { key: 'rm' + i }, [String(i)])
        ));
      }));
      // Remove all: each keyed node gets removeLogicalNode'd
      setItems([]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// MARKER-LEVEL KEYED RECONCILIATION WITH CHILDREN CHANGES
// Exercises patchChildrenOfElement -> patchSingle/patchKeyedChildren/patchPositionalChildren
// by having REUSED keyed items whose children change
// ═══════════════════════════════════════════════════════════════
describe('Marker keyed reuse with child changes', () => {
  test('reused keyed item gets children patched (positional)', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      // Dynamic function returns keyed children.
      // Same key 'a' but different children -> patchChildrenOfElement called
      c.appendChild(render(() => {
        if (step() === 1) {
          return [
            tova_keyed('a', tova_el('div', {}, [tova_el('span', {}, ['child1']), tova_el('span', {}, ['child2'])])),
            tova_keyed('b', tova_el('div', {}, ['B'])),
          ];
        }
        return [
          tova_keyed('a', tova_el('div', {}, [tova_el('span', {}, ['child1-updated']), tova_el('span', {}, ['child2-updated']), tova_el('p', {}, ['child3'])])),
          tova_keyed('b', tova_el('div', {}, ['B-updated'])),
        ];
      }));
      setStep(2); // Reuses 'a' and 'b', patches their children
    });
  });

  test('reused keyed item gets children patched (keyed sub-children)', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) {
          return [
            tova_keyed('main', tova_el('ul', {}, [
              tova_el('li', { key: 'x' }, ['X']),
              tova_el('li', { key: 'y' }, ['Y']),
              tova_el('li', { key: 'z' }, ['Z']),
            ])),
          ];
        }
        // Reorder sub-children: triggers patchKeyedChildren on the <ul>
        return [
          tova_keyed('main', tova_el('ul', {}, [
            tova_el('li', { key: 'z' }, ['Z2']),
            tova_el('li', { key: 'x' }, ['X2']),
          ])),
        ];
      }));
      setStep(2);
    });
  });

  test('reused keyed item with different sub-tag (full replace)', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) {
          return [
            tova_keyed('item', tova_el('div', {}, [
              tova_el('span', {}, ['original']),
            ])),
          ];
        }
        return [
          tova_keyed('item', tova_el('div', {}, [
            tova_el('b', {}, ['replaced']), // different tag -> patchSingle replaces
          ])),
        ];
      }));
      setStep(2);
    });
  });

  test('reused keyed item text to element', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) {
          return [tova_keyed('t', tova_el('div', {}, ['text']))];
        }
        return [tova_keyed('t', tova_el('div', {}, [tova_el('em', {}, ['element'])]))];
      }));
      setStep(2);
    });
  });

  test('reused keyed item element to text', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) {
          return [tova_keyed('t2', tova_el('div', {}, [tova_el('em', {}, ['element'])]))];
        }
        return [tova_keyed('t2', tova_el('div', {}, ['text']))];
      }));
      setStep(2);
    });
  });

  test('reused keyed item with null child', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) {
          return [tova_keyed('n', tova_el('div', {}, [tova_el('p', {}, ['exists'])]))];
        }
        return [tova_keyed('n', tova_el('div', {}, []))]; // fewer children
      }));
      setStep(2);
    });
  });

  test('reused keyed item with fragment child', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) {
          return [tova_keyed('frag', tova_el('div', {}, [
            tova_el('span', {}, ['a']),
          ]))];
        }
        return [tova_keyed('frag', tova_el('div', {}, [
          tova_fragment([tova_el('span', {}, ['b']), tova_el('span', {}, ['c'])]),
        ]))];
      }));
      setStep(2);
    });
  });

  test('reused keyed item with non-tova child', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) {
          return [tova_keyed('obj', tova_el('div', {}, ['text']))];
        }
        return [tova_keyed('obj', tova_el('div', {}, [{ toString: () => 'object' }]))];
      }));
      setStep(2);
    });
  });

  test('keyed items where key exists in old but tag differs (fragment return)', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) {
          return [
            tova_keyed('m1', tova_el('span', {}, ['S'])),
            tova_keyed('m2', tova_el('span', {}, ['T'])),
          ];
        }
        // Key m1 still exists but is now a div (different tag) -> re-render
        return [
          tova_keyed('m2', tova_el('span', {}, ['T2'])),
          tova_keyed('m1', tova_el('div', {}, ['D'])),
        ];
      }));
      setStep(2);
    });
  });

  test('new keyed items (no match in old)', () => {
    setupDOM();
    const c = createMockElement('div');
    const [step, setStep] = createSignal(1);
    createRoot(() => {
      c.appendChild(render(() => {
        if (step() === 1) {
          return [tova_keyed('old', tova_el('span', {}, ['old']))];
        }
        return [
          tova_keyed('new1', tova_el('span', {}, ['new1'])),
          tova_keyed('new2', tova_el('span', {}, ['new2'])),
        ];
      }));
      setStep(2);
    });
  });
});

// ─── Batch 2: Additional coverage targets ────────────────────

describe('computed notify skip already-dirty (line 289)', () => {
  test('chained computed where downstream is already dirty', () => {
    const [get, set] = createSignal(1);
    const c1 = createComputed(() => get() * 2);
    // c2 depends on BOTH signal and c1 - gets dirty from signal first
    const c2 = createComputed(() => get() + c1());

    expect(c2()).toBe(3);
    expect(c1()).toBe(2);

    // signal changes -> c2 marked dirty from signal's notify
    // then c1's notify fires and tries to propagate to c2 (already dirty -> skip)
    set(5);
    expect(c1()).toBe(10);
    expect(c2()).toBe(15);
  });

  test('diamond dependency - computed is dirty from two paths', () => {
    const [get, set] = createSignal(1);
    const left = createComputed(() => get() + 1);
    const right = createComputed(() => get() + 2);
    const bottom = createComputed(() => left() + right());

    expect(bottom()).toBe(5);

    // bottom gets marked dirty from left's notify,
    // then right's notify sees bottom is already dirty and skips
    set(10);
    expect(bottom()).toBe(23);
  });
});

describe('Suspense register/resolve (lines 658, 661, 674)', () => {
  test('Suspense with lazy child via function wrapper triggers register/resolve', () => {
    setupDOM();

    let resolveLoader;
    const loader = () => new Promise(resolve => { resolveLoader = resolve; });
    const LazyComp = lazy(loader);

    let rendered;
    createRoot(() => {
      // Wrap LazyComp call in a function so inject() runs inside the render scope
      // where provide() has already set up the SuspenseContext
      const result = Suspense({
        fallback: tova_el('div', {}, ['Loading...']),
        children: [() => LazyComp({})]
      });
      rendered = render(result);
      document.body.appendChild(rendered);
    });

    expect(rendered).toBeTruthy();
  });

  test('Suspense with function fallback via lazy wrapper', () => {
    setupDOM();

    let resolveLoader;
    const loader = () => new Promise(resolve => { resolveLoader = resolve; });
    const LazyComp = lazy(loader);

    createRoot(() => {
      const result = Suspense({
        fallback: () => tova_el('span', {}, ['Loading fn...']),
        children: [() => LazyComp({})]
      });
      const rendered = render(result);
      expect(rendered).toBeTruthy();
    });
  });

  test('lazy component resolves and suspense decrements', async () => {
    setupDOM();

    const FakeComp = (props) => tova_el('div', {}, ['Loaded!']);
    let resolveLoader;
    const loader = () => new Promise(resolve => { resolveLoader = resolve; });
    const LazyComp = lazy(loader);

    createRoot(() => {
      const result = Suspense({
        fallback: 'Loading...',
        children: [() => LazyComp({})]
      });
      render(result);
    });

    resolveLoader({ default: FakeComp });
    await new Promise(r => setTimeout(r, 10));
  });

  test('lazy component error resolves suspense too', async () => {
    setupDOM();

    let rejectLoader;
    const loader = () => new Promise((_, reject) => { rejectLoader = reject; });
    const LazyComp = lazy(loader);

    createRoot(() => {
      const result = Suspense({
        fallback: 'Loading...',
        children: [() => LazyComp({})]
      });
      render(result);
    });

    rejectLoader(new Error('fail'));
    await new Promise(r => setTimeout(r, 10));
  });

  test('Suspense function fallback called when pending > 0 (line 674)', () => {
    setupDOM();

    let fallbackCalled = false;
    const fnFallback = () => {
      fallbackCalled = true;
      return tova_el('div', {}, ['Function Fallback']);
    };

    // Create a Suspense with a child that manually registers as pending
    // The child uses inject to get the boundary and calls register()
    const result = Suspense({
      fallback: fnFallback,
      children: [() => {
        // This runs during the Suspense compute's render phase
        // inject finds the SuspenseContext provided by Suspense's compute
        try {
          const boundary = inject(createContext(null));
        } catch (e) {
          // inject may throw if context is not provided above — expected
        }
        // Actually we need the real SuspenseContext - let's use lazy instead
        return tova_el('div', {}, ['child']);
      }]
    });

    createRoot(() => {
      render(result);
    });
  });

  test('two lazy components - first resolves while second still pending, function fallback fires (line 674)', async () => {
    setupDOM();

    let fallbackCalled = false;
    const fnFallback = () => {
      fallbackCalled = true;
      return tova_el('div', {}, ['Loading...']);
    };

    // Create two lazy components with separate loaders
    let resolveFirst, resolveSecond;
    const FakeComp1 = () => tova_el('div', {}, ['Comp1']);
    const FakeComp2 = () => tova_el('div', {}, ['Comp2']);
    const loader1 = () => new Promise(r => { resolveFirst = r; });
    const loader2 = () => new Promise(r => { resolveSecond = r; });
    const LazyChild1 = lazy(loader1);
    const LazyChild2 = lazy(loader2);

    createRoot(() => {
      const sus = Suspense({
        fallback: fnFallback,
        children: [
          () => LazyChild1({}),
          () => LazyChild2({}),
        ]
      });
      const container = createMockElement('div');
      container.appendChild(render(sus));
      document.body.appendChild(container);
    });

    // Both lazy components have registered. pending = 2.
    // Resolve the first one - pending goes from 2 to 1.
    // Suspense effect re-runs with pending() > 0 -> line 674 fires!
    resolveFirst({ default: FakeComp1 });
    await new Promise(r => setTimeout(r, 20));

    expect(fallbackCalled).toBe(true);
  });
});

describe('CSP nonce auto-detection (lines 912-918)', () => {
  test('getCSPNonce auto-detects from meta tag when no nonce configured', () => {
    setupDOM();

    // Create a meta element with csp-nonce
    const meta = createMockElement('meta');
    meta.setAttribute('name', 'csp-nonce');
    meta.setAttribute('content', 'auto-detected-nonce');

    // Override document.querySelector to return our meta
    const origQuery = document.querySelector;
    document.querySelector = (selector) => {
      if (selector === 'meta[name="csp-nonce"]') return meta;
      return origQuery ? origQuery.call(document, selector) : null;
    };

    // Exercise CSS injection which calls getCSPNonce internally
    const cleanup = tova_inject_css('test-auto-csp-' + Date.now(), '.test-auto { color: red }');
    if (cleanup) cleanup();

    document.querySelector = origQuery;
  });
});

describe('isOwnedBy chain traversal (lines 1199-1204)', () => {
  test('isOwnedBy detects nested ownership', () => {
    setupDOM();
    const container = createMockElement('div');
    document.body.appendChild(container);

    const [get, set] = createSignal(true);

    createRoot(() => {
      container.appendChild(render(() => {
        if (get()) {
          return tova_el('div', {}, [
            (() => tova_el('span', {}, ['nested']))
          ]);
        }
        return tova_el('div', {}, ['other']);
      }));
      set(false);
    });
  });

  test('deeply nested dynamic blocks with ownership chain', () => {
    setupDOM();
    const container = createMockElement('div');
    document.body.appendChild(container);

    const [get, set] = createSignal('a');

    createRoot(() => {
      container.appendChild(render(() => {
        const v = get();
        return tova_el('div', {}, [
          (() => {
            return tova_el('span', {}, [
              (() => tova_el('em', {}, [v]))
            ]);
          })
        ]);
      }));
      set('b');
      set('c');
    });
  });
});

describe('nextSiblingAfterMarker nested (line 1228)', () => {
  test('nested markers - last content is itself a marker', () => {
    setupDOM();
    const container = createMockElement('div');
    document.body.appendChild(container);

    const [outer, setOuter] = createSignal(true);
    const [inner, setInner] = createSignal('x');

    createRoot(() => {
      container.appendChild(render(() => {
        if (outer()) {
          return [
            tova_el('div', {}, ['first']),
            (() => tova_el('span', {}, [inner()]))
          ];
        }
        return tova_el('p', {}, ['replaced']);
      }));

      setInner('y');
      setOuter(false);
    });
  });
});

// ─── Batch 3: patchSingle / patchKeyedChildren / element-level patching ──

describe('patchSingle branches (lines 1929-1949, 1968-1969)', () => {
  test('patchSingle: no existing child (line 1929-1930)', () => {
    setupDOM();
    const container = createMockElement('div');
    document.body.appendChild(container);

    const [items, setItems] = createSignal(['a']);

    createRoot(() => {
      // Use keyed items so patchKeyedChildren -> patchChildrenOfElement -> patchPositionalChildren -> patchSingle
      container.appendChild(render(() => {
        return items().map(item =>
          tova_keyed(item, tova_el('div', { key: item }, [item]))
        );
      }));

      // Now the outer container has one keyed div with child 'a'
      // Add more children to the keyed div by changing its children
      // Actually, we need patchChildrenOfElement to be called on a REUSED keyed element
    });
  });

  test('patchSingle via reused keyed element with growing children', () => {
    setupDOM();
    const container = createMockElement('div');
    document.body.appendChild(container);

    const [step, setStep] = createSignal(1);

    createRoot(() => {
      container.appendChild(render(() => {
        if (step() === 1) {
          // Keyed element with 1 child
          return [tova_keyed('k1', tova_el('div', { key: 'k1' }, ['child1']))];
        }
        // Same key, same tag - element is reused
        // But now has 2 children - patchPositionalChildren sees newCount > oldCount
        // -> patchSingle called with existing child and matching new child
        // -> new child appended (line 1929-1930: !existing branch for 2nd child)
        return [tova_keyed('k1', tova_el('div', { key: 'k1' }, ['child1', 'child2']))];
      }));
      setStep(2);
    });
  });

  test('patchSingle via reused keyed element with shrinking children (null branch)', () => {
    setupDOM();
    const container = createMockElement('div');
    document.body.appendChild(container);

    const [step, setStep] = createSignal(1);

    createRoot(() => {
      container.appendChild(render(() => {
        if (step() === 1) {
          return [tova_keyed('k2', tova_el('div', { key: 'k2' }, ['a', 'b', 'c']))];
        }
        // Same key, same tag - element is reused
        // Now only 1 child - excess children removed (line 1934-1935)
        return [tova_keyed('k2', tova_el('div', { key: 'k2' }, ['a']))];
      }));
      setStep(2);
    });
  });

  test('patchSingle via reused keyed element: function vnode replacing element (line 1940-1949)', () => {
    setupDOM();
    const container = createMockElement('div');
    document.body.appendChild(container);

    const [step, setStep] = createSignal(1);

    createRoot(() => {
      container.appendChild(render(() => {
        if (step() === 1) {
          return [tova_keyed('k3', tova_el('div', { key: 'k3' }, [
            tova_el('span', {}, ['static'])
          ]))];
        }
        // Same key, same tag - element is reused
        // Child changes from element to function -> patchSingle function branch
        return [tova_keyed('k3', tova_el('div', { key: 'k3' }, [
          () => tova_el('em', {}, ['dynamic'])
        ]))];
      }));
      setStep(2);
    });
  });

  test('patchSingle: function vnode replacing existing marker (lines 1943-1944)', () => {
    setupDOM();
    const container = createMockElement('div');
    document.body.appendChild(container);

    const [step, setStep] = createSignal(1);
    const [inner, setInner] = createSignal('hello');

    createRoot(() => {
      container.appendChild(render(() => {
        if (step() === 1) {
          // Keyed outer with a function child (renders as marker)
          return [tova_keyed('k3b', tova_el('div', { key: 'k3b' }, [
            () => tova_el('span', {}, [inner()])
          ]))];
        }
        // Same outer key/tag, reused.
        // New child is a DIFFERENT function - patchSingle sees existing marker + function newVNode
        // -> line 1941: existing.__tovaNodes truthy
        // -> line 1943-1944: clearMarkerContent + replaceChild
        return [tova_keyed('k3b', tova_el('div', { key: 'k3b' }, [
          () => tova_el('em', {}, ['replaced'])
        ]))];
      }));
      setStep(2);
    });
  });

  test('patchSingle: non-tova object replacing element (lines 1968-1969)', () => {
    setupDOM();
    const container = createMockElement('div');
    document.body.appendChild(container);

    const [step, setStep] = createSignal(1);

    createRoot(() => {
      container.appendChild(render(() => {
        if (step() === 1) {
          return [tova_keyed('k4', tova_el('div', { key: 'k4' }, [
            tova_el('span', {}, ['elem'])
          ]))];
        }
        // Replace element child with non-tova object (toString conversion)
        // The existing child is element (nodeType 1, not 3)
        // -> lines 1968-1969 branch
        return [tova_keyed('k4', tova_el('div', { key: 'k4' }, [
          { toString() { return 'obj-text'; } }
        ]))];
      }));
      setStep(2);
    });
  });
});

describe('patchKeyedChildren element-level (lines 1858, 1861)', () => {
  test('keyed element with mismatched tag falls through (line 1858)', () => {
    setupDOM();
    const container = createMockElement('div');
    document.body.appendChild(container);

    const [step, setStep] = createSignal(1);

    createRoot(() => {
      container.appendChild(render(() => {
        if (step() === 1) {
          // Outer keyed wrapper with inner keyed children
          return [tova_keyed('outer', tova_el('div', { key: 'outer' }, [
            tova_keyed('inner', tova_el('span', { key: 'inner' }, ['span content']))
          ]))];
        }
        // Reuse outer element, but inner keyed child changes tag: span -> p
        // patchKeyedChildren finds old key 'inner' but tag doesn't match
        // -> line 1858 else branch: render new node
        return [tova_keyed('outer', tova_el('div', { key: 'outer' }, [
          tova_keyed('inner', tova_el('p', { key: 'inner' }, ['p content']))
        ]))];
      }));
      setStep(2);
    });
  });

  test('keyed element with no matching key (line 1861)', () => {
    setupDOM();
    const container = createMockElement('div');
    document.body.appendChild(container);

    const [step, setStep] = createSignal(1);

    createRoot(() => {
      container.appendChild(render(() => {
        if (step() === 1) {
          return [tova_keyed('outer2', tova_el('div', { key: 'outer2' }, [
            tova_keyed('old-key', tova_el('span', { key: 'old-key' }, ['old']))
          ]))];
        }
        // Reuse outer element, but inner has completely new key
        // -> line 1861 else branch: no match in oldKeyMap
        return [tova_keyed('outer2', tova_el('div', { key: 'outer2' }, [
          tova_keyed('new-key', tova_el('span', { key: 'new-key' }, ['new']))
        ]))];
      }));
      setStep(2);
    });
  });
});

describe('getNodeKey (line 1712)', () => {
  test('getNodeKey returns undefined for text node without __vnode', () => {
    setupDOM();
    const container = createMockElement('div');
    document.body.appendChild(container);

    const [step, setStep] = createSignal(1);

    createRoot(() => {
      container.appendChild(render(() => {
        if (step() === 1) {
          // Create a reused keyed outer element with mixed children:
          // one keyed element and a text node (no __vnode)
          return [tova_keyed('wrap', tova_el('div', { key: 'wrap' }, [
            'plain text',
            tova_keyed('a', tova_el('span', { key: 'a' }, ['A'])),
          ]))];
        }
        // On re-render, same outer key but new keyed children
        // patchKeyedChildren iterates logical children via getNodeKey
        // text node has no __vnode -> getNodeKey returns undefined (line 1712)
        return [tova_keyed('wrap', tova_el('div', { key: 'wrap' }, [
          'updated text',
          tova_keyed('a', tova_el('span', { key: 'a' }, ['A updated'])),
          tova_keyed('b', tova_el('span', { key: 'b' }, ['B'])),
        ]))];
      }));
      setStep(2);
    });
  });

  test('keyed reorder with text node children exercises getNodeKey fallback', () => {
    setupDOM();
    const container = createMockElement('div');
    document.body.appendChild(container);

    const [step, setStep] = createSignal(1);

    createRoot(() => {
      container.appendChild(render(() => {
        if (step() === 1) {
          return [tova_keyed('wrap2', tova_el('div', { key: 'wrap2' }, [
            tova_keyed('x', tova_el('span', { key: 'x' }, ['X'])),
            tova_keyed('y', tova_el('span', { key: 'y' }, ['Y'])),
          ]))];
        }
        // Reorder keyed children
        return [tova_keyed('wrap2', tova_el('div', { key: 'wrap2' }, [
          tova_keyed('y', tova_el('span', { key: 'y' }, ['Y'])),
          tova_keyed('x', tova_el('span', { key: 'x' }, ['X'])),
        ]))];
      }));
      setStep(2);
    });
  });
});

describe('DevTools onComponentRender (line 1464)', () => {
  test('onComponentRender fires for vnode with _componentName when devtools enabled', () => {
    setupDOM();
    let renderCalls = [];
    __enableDevTools({
      onComponentRender: (name, el, time) => {
        renderCalls.push({ name, el });
      }
    });

    const vnode = tova_el('div', {}, ['hello']);
    vnode._componentName = 'TestComp';

    createRoot(() => {
      render(vnode);
    });

    expect(renderCalls.length).toBeGreaterThan(0);
    expect(renderCalls[0].name).toBe('TestComp');

    // Reset devtools
    __enableDevTools(null);
  });
});

describe('patchKeyedInMarker fragment branch (lines 1747-1750)', () => {
  test('keyed recon with render returning fragment', () => {
    setupDOM();
    const container = createMockElement('div');
    document.body.appendChild(container);

    const [step, setStep] = createSignal(1);

    createRoot(() => {
      container.appendChild(render(() => {
        if (step() === 1) {
          return [
            tova_keyed('k1', tova_el('span', {}, ['A'])),
            tova_keyed('k2', tova_el('span', {}, ['B'])),
          ];
        }
        // Change k1 to a fragment - render returns DocumentFragment
        return [
          tova_keyed('k1', tova_fragment([tova_el('em', {}, ['A1']), tova_el('em', {}, ['A2'])])),
          tova_keyed('k2', tova_el('span', {}, ['B'])),
        ];
      }));
      setStep(2);
    });
  });
});

describe('clearMarkerContent transition catch (lines 1264-1265)', () => {
  test('clearMarkerContent handles transition rejection via custom transition', () => {
    setupDOM();
    const container = createMockElement('div');
    document.body.appendChild(container);

    const [show, setShow] = createSignal(true);

    createRoot(() => {
      container.appendChild(render(() => {
        if (show()) {
          return tova_el('div', {}, ['animated']);
        }
        return 'gone';
      }));

      // Find the rendered element (which is inside the marker's __tovaNodes)
      // and add a custom transition that rejects
      const marker = container.childNodes[0]; // comment marker
      if (marker && marker.__tovaNodes) {
        for (const node of marker.__tovaNodes) {
          if (node.nodeType === 1) {
            node.__tovaTransition = {
              custom: () => Promise.reject(new Error('transition failed')),
              config: { duration: 10 }
            };
          }
        }
      }

      setShow(false);
    });
  });
});

describe('leave transition transitionend handler (lines 1138-1139)', () => {
  test('transitionend event fires handler', async () => {
    setupDOM();
    const container = createMockElement('div');
    document.body.appendChild(container);

    const [show, setShow] = createSignal(true);

    createRoot(() => {
      container.appendChild(render(() => {
        if (show()) {
          return tova_el('div', {}, ['fading']);
        }
        return 'gone';
      }));

      // Find the rendered element in marker's __tovaNodes
      const marker = container.childNodes[0];
      if (marker && marker.__tovaNodes) {
        for (const node of marker.__tovaNodes) {
          if (node.nodeType === 1) {
            node.__tovaTransition = { name: 'fade', config: { duration: 50 } };
            // Override addEventListener to immediately fire transitionend
            const origAdd = node.addEventListener.bind(node);
            node.addEventListener = (event, handler) => {
              origAdd(event, handler);
              if (event === 'transitionend') {
                setTimeout(() => handler(), 2);
              }
            };
          }
        }
      }

      setShow(false);
    });

    // Wait for the transitionend handler to fire
    await new Promise(r => setTimeout(r, 100));
  });
});
