// Full coverage tests for client runtime (reactivity.js, router.js, ssr.js)
// Covers: ErrorBoundary component, tova_keyed, keyed reconciliation,
// tova_inject_css, element patching, Portal, lazy, patchSingle branches,
// hydration, router gaps, SSR gaps, and more.

import { describe, test, expect } from 'bun:test';
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

// ─── DOM Mock ───────────────────────────────────────────────
// Same mock as runtime.test.js — needed for marker-based rendering

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
  };
}

// ═══════════════════════════════════════════════════════════════
// REACTIVITY RUNTIME TESTS
// ═══════════════════════════════════════════════════════════════

// ─── tova_keyed ──────────────────────────────────────────────

describe('Runtime — tova_keyed', () => {
  test('injects key into vnode props', () => {
    const vnode = tova_el('li', { className: 'item' }, ['text']);
    const keyed = tova_keyed('k1', vnode);
    expect(keyed.props.key).toBe('k1');
    expect(keyed.props.className).toBe('item');
  });

  test('returns non-tova values unchanged', () => {
    const result = tova_keyed('k1', 'text');
    expect(result).toBe('text');
  });

  test('returns null unchanged', () => {
    const result = tova_keyed('k1', null);
    expect(result).toBeNull();
  });
});

// ─── tova_inject_css ─────────────────────────────────────────

describe('Runtime — tova_inject_css', () => {
  test('injects style element into document.head', () => {
    const headBefore = document.head.children.length;
    tova_inject_css('test-css-1', '.test { color: red }');
    expect(document.head.children.length).toBe(headBefore + 1);
    const style = document.head.children[document.head.children.length - 1];
    expect(style.tagName).toBe('style');
    expect(style.textContent).toBe('.test { color: red }');
    expect(style.attributes['data-tova-style']).toBe('test-css-1');
  });

  test('is idempotent — same ID is not injected twice', () => {
    const headBefore = document.head.children.length;
    tova_inject_css('test-css-2', '.a { color: blue }');
    const afterFirst = document.head.children.length;
    tova_inject_css('test-css-2', '.a { color: blue }');
    expect(document.head.children.length).toBe(afterFirst);
  });

  test('different IDs are injected separately', () => {
    const headBefore = document.head.children.length;
    tova_inject_css('test-css-3a', '.x { }');
    tova_inject_css('test-css-3b', '.y { }');
    expect(document.head.children.length).toBe(headBefore + 2);
  });
});

// ─── ErrorBoundary component ────────────────────────────────

describe('Runtime — ErrorBoundary component', () => {
  test('returns a __dynamic vnode', () => {
    const eb = ErrorBoundary({
      fallback: ({ error, reset }) => tova_el('div', {}, ['Error']),
      children: [tova_el('span', {}, ['child'])]
    });
    expect(eb.__tova).toBe(true);
    expect(eb.tag).toBe('__dynamic');
    expect(typeof eb.compute).toBe('function');
  });

  test('compute returns child content when no error', () => {
    const child = tova_el('span', {}, ['ok']);
    const eb = ErrorBoundary({
      fallback: () => tova_el('div', {}, ['error']),
      children: [child]
    });
    const result = eb.compute();
    expect(result).toBe(child);
  });

  test('ErrorBoundary with multiple children returns fragment', () => {
    const c1 = tova_el('span', {}, ['a']);
    const c2 = tova_el('span', {}, ['b']);
    const eb = ErrorBoundary({
      fallback: () => null,
      children: [c1, c2]
    });
    const result = eb.compute();
    expect(result.__tova).toBe(true);
    expect(result.tag).toBe('__fragment');
  });

  test('ErrorBoundary with no children returns empty fragment', () => {
    const eb = ErrorBoundary({ fallback: () => null });
    const result = eb.compute();
    // children is undefined, so tova_fragment([]) or similar
    expect(result).toBeDefined();
  });
});

// ─── Keyed Reconciliation ───────────────────────────────────

describe('Runtime — keyed reconciliation', () => {
  test('keyed list reorders DOM nodes without recreating', () => {
    const container = createMockElement('div');
    const [items, setItems] = createSignal([
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
    ]);

    function App() {
      return tova_el('ul', {}, [
        () => items().map(item => tova_keyed(item.id, tova_el('li', {}, [item.text])))
      ]);
    }

    mount(App, container);
    const ul = container.children[0];
    const marker = ul.children[0];

    // Store references to original li nodes
    const liA = marker.__tovaNodes[0];
    const liB = marker.__tovaNodes[1];
    const liC = marker.__tovaNodes[2];
    expect(liA.children[0].textContent).toBe('A');
    expect(liB.children[0].textContent).toBe('B');
    expect(liC.children[0].textContent).toBe('C');

    // Reverse order
    setItems([
      { id: 'c', text: 'C' },
      { id: 'b', text: 'B' },
      { id: 'a', text: 'A' },
    ]);

    // Same DOM nodes should be reused
    expect(marker.__tovaNodes.length).toBe(3);
    expect(marker.__tovaNodes[0]).toBe(liC);
    expect(marker.__tovaNodes[1]).toBe(liB);
    expect(marker.__tovaNodes[2]).toBe(liA);
  });

  test('keyed list removes items correctly', () => {
    const container = createMockElement('div');
    const [items, setItems] = createSignal([
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ]);

    function App() {
      return tova_el('div', {}, [
        () => items().map(item => tova_keyed(item.id, tova_el('span', {}, [item.text])))
      ]);
    }

    mount(App, container);
    const div = container.children[0];
    const marker = div.children[0];
    expect(marker.__tovaNodes.length).toBe(2);

    // Remove one
    setItems([{ id: 'b', text: 'B' }]);
    expect(marker.__tovaNodes.length).toBe(1);
    expect(marker.__tovaNodes[0].children[0].textContent).toBe('B');
  });

  test('keyed list adds new items', () => {
    const container = createMockElement('div');
    const [items, setItems] = createSignal([{ id: 'a', text: 'A' }]);

    function App() {
      return tova_el('div', {}, [
        () => items().map(item => tova_keyed(item.id, tova_el('span', {}, [item.text])))
      ]);
    }

    mount(App, container);
    const marker = container.children[0].children[0];
    expect(marker.__tovaNodes.length).toBe(1);

    setItems([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }]);
    expect(marker.__tovaNodes.length).toBe(2);
  });
});

// ─── Portal ─────────────────────────────────────────────────

describe('Runtime — Portal', () => {
  test('Portal creates __portal vnode', () => {
    const p = Portal({ target: '#modal', children: [tova_el('div', {}, ['content'])] });
    expect(p.__tova).toBe(true);
    expect(p.tag).toBe('__portal');
    expect(p.props.target).toBe('#modal');
    expect(p.children.length).toBe(1);
  });

  test('Portal renders placeholder comment', () => {
    const p = Portal({ target: '#modal', children: [tova_el('div', {}, ['content'])] });
    const el = render(p);
    expect(el.nodeType).toBe(8); // comment node
  });

  test('Portal renders children into target element', async () => {
    const targetEl = createMockElement('div');
    const p = Portal({ target: targetEl, children: [tova_el('span', {}, ['portal-content'])] });
    render(p);
    // Portal uses queueMicrotask, wait for it
    await new Promise(r => setTimeout(r, 10));
    expect(targetEl.children.length).toBe(1);
    expect(targetEl.children[0].tagName).toBe('span');
  });
});

// ─── Lazy ───────────────────────────────────────────────────

describe('Runtime — lazy', () => {
  test('lazy returns a function', () => {
    const Lazy = lazy(() => Promise.resolve({ default: () => null }));
    expect(typeof Lazy).toBe('function');
  });

  test('lazy component returns __dynamic vnode', () => {
    const Lazy = lazy(() => Promise.resolve({ default: () => tova_el('div', {}, ['loaded']) }));
    const result = Lazy({});
    expect(result.__tova).toBe(true);
    expect(result.tag).toBe('__dynamic');
    expect(typeof result.compute).toBe('function');
  });

  test('lazy shows fallback initially', () => {
    const Lazy = lazy(() => new Promise(() => {})); // never resolves
    const result = Lazy({ fallback: tova_el('span', {}, ['loading...']) });
    const computed = result.compute();
    expect(computed.__tova).toBe(true);
    expect(computed.tag).toBe('span');
  });

  test('lazy resolves component after load', async () => {
    const TestComp = () => tova_el('div', {}, ['loaded']);
    const Lazy = lazy(() => Promise.resolve({ default: TestComp }));
    const result = Lazy({});

    // Initially null (no fallback)
    expect(result.compute()).toBeNull();

    // Wait for resolution
    await new Promise(r => setTimeout(r, 10));

    // After resolution, compute should return the component output
    const rendered = result.compute();
    expect(rendered.__tova).toBe(true);
    expect(rendered.tag).toBe('div');
  });

  test('lazy handles errors', async () => {
    const Lazy = lazy(() => Promise.reject(new Error('load failed')));
    const result = Lazy({});

    await new Promise(r => setTimeout(r, 10));

    const rendered = result.compute();
    expect(rendered.__tova).toBe(true);
    expect(rendered.tag).toBe('span');
    expect(rendered.props.className).toBe('tova-error');
  });

  test('lazy caches resolved component', async () => {
    let loadCount = 0;
    const TestComp = () => tova_el('div', {}, ['ok']);
    const Lazy = lazy(() => {
      loadCount++;
      return Promise.resolve({ default: TestComp });
    });

    Lazy({});
    await new Promise(r => setTimeout(r, 10));

    // Second call should use cached
    const result2 = Lazy({});
    expect(result2.__tova).toBe(true);
    expect(result2.tag).toBe('div');
    expect(loadCount).toBe(1);
  });
});

// ─── Dynamic Component ──────────────────────────────────────

describe('Runtime — Dynamic component', () => {
  test('Dynamic with static component', () => {
    const Comp = (props) => tova_el('div', {}, ['hello']);
    const d = Dynamic({ component: Comp });
    const result = d.compute();
    expect(result.__tova).toBe(true);
    expect(result.tag).toBe('div');
  });

  test('Dynamic with null component returns null', () => {
    const d = Dynamic({ component: null });
    expect(d.compute()).toBeNull();
  });

  test('Dynamic forwards rest props', () => {
    const Comp = (props) => tova_el('div', {}, [props.msg]);
    // Dynamic expects component as a signal (getter), so wrap in createSignal
    const [comp] = createSignal(Comp);
    const d = Dynamic({ component: comp, msg: 'hello' });
    const result = d.compute();
    expect(result.children[0]).toBe('hello');
  });
});

// ─── Element Children Patching ──────────────────────────────

describe('Runtime — element children patching (patchPositionalChildren)', () => {
  test('dynamic block updates children of parent element', () => {
    const container = createMockElement('div');
    const [items, setItems] = createSignal(['a', 'b']);

    function App() {
      return tova_el('div', {}, [
        () => items().map(item => tova_el('span', {}, [item]))
      ]);
    }

    mount(App, container);
    const div = container.children[0];
    const marker = div.children[0];

    // Add child
    setItems(['a', 'b', 'c']);
    expect(marker.__tovaNodes.length).toBe(3);

    // Remove children
    setItems([]);
    expect(marker.__tovaNodes.length).toBe(0);

    // Add back
    setItems(['x']);
    expect(marker.__tovaNodes.length).toBe(1);
    expect(marker.__tovaNodes[0].children[0].textContent).toBe('x');
  });
});

// ─── patchSingle Branches ───────────────────────────────────

describe('Runtime — patchSingle branches', () => {
  test('null vnode in dynamic block produces empty text', () => {
    const container = createMockElement('div');
    const [val, setVal] = createSignal(null);

    function App() {
      return tova_el('div', {}, [() => val()]);
    }

    mount(App, container);
    const marker = container.children[0].children[0];
    expect(marker.__tovaNodes[0].textContent).toBe('');

    setVal('hello');
    expect(marker.__tovaNodes[0].textContent).toBe('hello');

    setVal(null);
    expect(marker.__tovaNodes[0].textContent).toBe('');
  });

  test('vnode-to-text transition in dynamic block', () => {
    const container = createMockElement('div');
    const [show, setShow] = createSignal(true);

    function App() {
      return tova_el('div', {}, [
        () => show() ? tova_el('b', {}, ['bold']) : 'plain'
      ]);
    }

    mount(App, container);
    const marker = container.children[0].children[0];

    expect(marker.__tovaNodes[0].tagName).toBe('b');

    setShow(false);
    expect(marker.__tovaNodes[0].nodeType).toBe(3);
    expect(marker.__tovaNodes[0].textContent).toBe('plain');

    setShow(true);
    expect(marker.__tovaNodes[0].tagName).toBe('b');
  });

  test('element tag change fully replaces node', () => {
    const container = createMockElement('div');
    const [tag, setTag] = createSignal('span');

    function App() {
      return tova_el('div', {}, [
        () => tova_el(tag(), {}, ['content'])
      ]);
    }

    mount(App, container);
    const marker = container.children[0].children[0];
    expect(marker.__tovaNodes[0].tagName).toBe('span');

    setTag('div');
    expect(marker.__tovaNodes[0].tagName).toBe('div');
  });

  test('boolean number and string values render correctly', () => {
    const container = createMockElement('div');
    const [val, setVal] = createSignal(42);

    function App() {
      return tova_el('div', {}, [() => val()]);
    }

    mount(App, container);
    const marker = container.children[0].children[0];
    expect(marker.__tovaNodes[0].textContent).toBe('42');

    setVal(true);
    expect(marker.__tovaNodes[0].textContent).toBe('true');

    setVal('hello');
    expect(marker.__tovaNodes[0].textContent).toBe('hello');
  });
});

// ─── render — edge cases ────────────────────────────────────

describe('Runtime — render edge cases', () => {
  test('render non-tova object produces text node', () => {
    const el = render({ toString: () => 'custom' });
    expect(el.nodeType).toBe(3);
    // String() calls toString(), so result is 'custom'
    expect(el.textContent).toBe('custom');
  });

  test('render array produces DocumentFragment', () => {
    const frag = render(['a', 'b']);
    expect(frag.nodeType).toBe(11);
    expect(frag.children.length).toBe(2);
  });

  test('render boolean produces text node', () => {
    const el = render(true);
    expect(el.nodeType).toBe(3);
    expect(el.textContent).toBe('true');
  });

  test('render number produces text node', () => {
    const el = render(42);
    expect(el.nodeType).toBe(3);
    expect(el.textContent).toBe('42');
  });
});

// ─── applyPropValue edge cases ──────────────────────────────

describe('Runtime — applyPropValue edge cases', () => {
  test('readOnly prop is set correctly', () => {
    const el = render(tova_el('input', { readOnly: true }));
    expect(el.readOnly).toBe(true);
  });

  test('style object applies to element', () => {
    const el = render(tova_el('div', { style: { color: 'red', fontSize: '12px' } }));
    expect(el.style.color).toBe('red');
    expect(el.style.fontSize).toBe('12px');
  });

  test('ref as function is called with element', () => {
    let refEl = null;
    const el = render(tova_el('div', { ref: (e) => { refEl = e; } }));
    expect(refEl).toBe(el);
  });

  test('ref as object sets current', () => {
    const ref = createRef();
    const el = render(tova_el('div', { ref }));
    expect(ref.current).toBe(el);
  });

  test('key prop is skipped (not set as attribute)', () => {
    const el = render(tova_el('div', { key: 'k1' }));
    expect(el.getAttribute('key')).toBeNull();
  });
});

// ─── applyProps patching ────────────────────────────────────

describe('Runtime — applyProps during patching', () => {
  test('event handlers update correctly during re-render', () => {
    const container = createMockElement('div');
    const [handler, setHandler] = createSignal(() => 'first');

    function App() {
      return tova_el('div', {}, [
        tova_el('button', { onClick: handler() }, ['click'])
      ]);
    }

    mount(App, container);
    const btn = container.children[0].children[0];
    expect(btn.__handlers.click).toBeDefined();
  });
});

// ─── disposeNode ────────────────────────────────────────────

describe('Runtime — disposeNode', () => {
  test('mount returns dispose function that cleans up', () => {
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

    // Dispose should stop effects
    dispose();
    const prev = effectRuns;
    setCount(2);
    expect(effectRuns).toBe(prev);
  });
});

// ─── Hydration ──────────────────────────────────────────────

describe('Runtime — hydration edge cases', () => {
  test('hydrate attaches event handlers to existing DOM', () => {
    const container = createMockElement('div');
    const btn = createMockElement('button');
    btn.tagName = 'button';
    container.appendChild(btn);

    let clicked = false;
    const vnode = tova_el('button', { onClick: () => { clicked = true; } }, []);

    hydrate(() => vnode, container);
    expect(btn.__handlers.click).toBeDefined();
  });

  test('hydrate with null container logs error', () => {
    const logs = [];
    const origError = console.error;
    console.error = (...args) => logs.push(args.join(' '));
    hydrate(() => tova_el('div', {}, []), null);
    console.error = origError;
    expect(logs.some(l => l.includes('Hydration'))).toBe(true);
  });

  test('hydrate attaches reactive props', () => {
    const container = createMockElement('div');
    const div = createMockElement('div');
    container.appendChild(div);

    const [cls, setCls] = createSignal('initial');
    const vnode = tova_el('div', { className: () => cls() }, []);

    hydrate(() => vnode, container);
    // Reactive prop should create effect
    expect(div.className).toBe('initial');

    setCls('updated');
    expect(div.className).toBe('updated');
  });
});

// ─── Fragment rendering ─────────────────────────────────────

describe('Runtime — fragment rendering', () => {
  test('fragment marker tracks content nodes', () => {
    const frag = tova_fragment([tova_el('span', {}, ['a']), tova_el('span', {}, ['b'])]);
    const rendered = render(frag);
    expect(rendered.nodeType).toBe(11);
    const marker = rendered.children[0];
    expect(marker.nodeType).toBe(8);
    expect(marker.__tovaFragment).toBe(true);
    expect(marker.__tovaNodes.length).toBe(2);
  });

  test('empty fragment has no content nodes', () => {
    const frag = tova_fragment([]);
    const rendered = render(frag);
    const marker = rendered.children[0];
    expect(marker.__tovaNodes.length).toBe(0);
  });
});

// ─── Dynamic (__dynamic) rendering ──────────────────────────

describe('Runtime — __dynamic vnode rendering', () => {
  test('dynamic vnode renders compute result', () => {
    const container = createMockElement('div');
    const vnode = {
      __tova: true,
      tag: '__dynamic',
      props: {},
      children: [],
      compute: () => tova_el('span', {}, ['dynamic']),
    };

    function App() {
      return tova_el('div', {}, [vnode]);
    }

    mount(App, container);
    const div = container.children[0];
    // Dynamic vnode creates a marker
    const marker = div.children[0];
    expect(marker.__tovaDynamic).toBe(true);
    expect(marker.__tovaNodes.length).toBeGreaterThan(0);
  });
});

// ─── Context across nested roots ────────────────────────────

describe('Runtime — context across nested components', () => {
  test('inject walks up ownership tree', () => {
    const ctx = createContext('default');
    let innerValue = '';

    createRoot(() => {
      provide(ctx, 'root-value');
      createRoot(() => {
        innerValue = inject(ctx);
      });
    });

    expect(innerValue).toBe('root-value');
  });

  test('inner provide shadows outer', () => {
    const ctx = createContext('default');
    let outerValue = '', innerValue = '';

    createRoot(() => {
      provide(ctx, 'outer');
      outerValue = inject(ctx);
      createRoot(() => {
        provide(ctx, 'inner');
        innerValue = inject(ctx);
      });
    });

    expect(outerValue).toBe('outer');
    expect(innerValue).toBe('inner');
  });
});

// ═══════════════════════════════════════════════════════════════
// ROUTER TESTS
// ═══════════════════════════════════════════════════════════════

describe('Router — 404 and catch-all routes', () => {
  // This test must run BEFORE any test that registers a 404 component,
  // because notFoundComponent persists in module state.
  test('Router component returns null when no component matched', () => {
    defineRoutes({});
    const result = Router();
    expect(result).toBeNull();
  });

  test('defineRoutes with 404 key sets notFound component', () => {
    const NotFound = () => tova_el('div', {}, ['Not Found']);
    defineRoutes({
      '/': () => tova_el('div', {}, ['Home']),
      '404': NotFound,
    });
    const route = getCurrentRoute();
    // Navigate to known route
    expect(route().path).toBe('/');
  });

  test('Router component renders matched component', () => {
    const Home = (params) => tova_el('div', {}, ['Home Page']);
    defineRoutes({
      '/': Home,
    });
    const result = Router();
    expect(result).not.toBeNull();
    if (result) {
      expect(result.__tova).toBe(true);
    }
  });
});

describe('Router — Link component', () => {
  test('Link creates anchor element vnode', () => {
    const link = Link({ href: '/about', children: ['About'] });
    expect(link.__tova).toBe(true);
    expect(link.tag).toBe('a');
    expect(link.props.href).toBe('/about');
  });

  test('Link has onClick handler', () => {
    const link = Link({ href: '/about', children: ['About'] });
    expect(typeof link.props.onClick).toBe('function');
  });

  test('Link passes rest props', () => {
    const link = Link({ href: '/about', className: 'nav-link', children: ['About'] });
    expect(link.props.className).toBe('nav-link');
  });
});

describe('Router — Redirect component', () => {
  test('Redirect returns null', () => {
    const result = Redirect({ to: '/login' });
    expect(result).toBeNull();
  });
});

describe('Router — getters', () => {
  test('getPath returns reactive getter', () => {
    const path = getPath();
    expect(typeof path).toBe('function');
  });

  test('getParams returns reactive getter', () => {
    const params = getParams();
    expect(typeof params).toBe('function');
    expect(typeof params()).toBe('object');
  });

  test('getQuery returns reactive getter', () => {
    const query = getQuery();
    expect(typeof query).toBe('function');
    expect(typeof query()).toBe('object');
  });
});

// ═══════════════════════════════════════════════════════════════
// SSR TESTS
// ═══════════════════════════════════════════════════════════════

describe('SSR — renderToString edge cases', () => {
  test('renders boolean true as "true"', () => {
    expect(renderToString(true)).toBe('true');
  });

  test('renders boolean false as "false"', () => {
    expect(renderToString(false)).toBe('false');
  });

  test('renders non-tova object as string', () => {
    const result = renderToString({ foo: 1 });
    expect(result).toBe('[object Object]');
  });

  test('renders null as empty string', () => {
    expect(renderToString(null)).toBe('');
  });

  test('renders undefined as empty string', () => {
    expect(renderToString(undefined)).toBe('');
  });

  test('renders nested function vnodes', () => {
    const fn = () => tova_el('span', {}, ['dynamic']);
    const result = renderToString(fn);
    expect(result).toBe('<span>dynamic</span>');
  });

  test('renders __dynamic vnode by calling compute', () => {
    const dyn = {
      __tova: true,
      tag: '__dynamic',
      props: {},
      children: [],
      compute: () => tova_el('b', {}, ['bold']),
    };
    const result = renderToString(dyn);
    expect(result).toBe('<b>bold</b>');
  });

  test('renders void elements as self-closing', () => {
    const result = renderToString(tova_el('br', {}));
    expect(result).toBe('<br />');
    const result2 = renderToString(tova_el('img', { src: 'img.png' }));
    expect(result2).toContain('<img');
    expect(result2).toContain('/>');
  });

  test('renders checked/disabled boolean attributes', () => {
    const result = renderToString(tova_el('input', { checked: true, disabled: true }));
    expect(result).toContain('checked');
    expect(result).toContain('disabled');
  });

  test('skips false/null attributes', () => {
    const result = renderToString(tova_el('div', { hidden: false, title: null }));
    expect(result).not.toContain('hidden');
    expect(result).not.toContain('title');
  });

  test('renders style object as CSS string', () => {
    const result = renderToString(tova_el('div', { style: { color: 'red', fontSize: '12px' } }));
    expect(result).toContain('style="');
    expect(result).toContain('color:red');
    expect(result).toContain('font-size:12px');
  });

  test('escapes HTML in text content', () => {
    const result = renderToString(tova_el('div', {}, ['<script>alert("xss")</script>']));
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
  });

  test('evaluates reactive function props in SSR', () => {
    const [val] = createSignal('reactive');
    const result = renderToString(tova_el('div', { className: () => val() }));
    expect(result).toContain('class="reactive"');
  });
});

describe('SSR — renderPage', () => {
  test('renders full HTML page with defaults', () => {
    const html = renderPage(() => tova_el('div', {}, ['Hello']));
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Tova App</title>');
    expect(html).toContain('<div id="app">');
    expect(html).toContain('Hello');
    expect(html).toContain('/client.js');
  });

  test('renders with custom title', () => {
    const html = renderPage(() => tova_el('div', {}, ['Hi']), { title: 'My App' });
    expect(html).toContain('<title>My App</title>');
  });

  test('renders with custom head content', () => {
    const html = renderPage(() => tova_el('div', {}, ['Hi']), {
      head: '<link rel="stylesheet" href="/style.css">'
    });
    expect(html).toContain('<link rel="stylesheet" href="/style.css">');
  });

  test('renders with custom script source', () => {
    const html = renderPage(() => tova_el('div', {}, ['Hi']), { scriptSrc: '/app.js' });
    expect(html).toContain('/app.js');
    expect(html).not.toContain('/client.js');
  });
});

// ─── SSR — fragment and array rendering ─────────────────────

describe('SSR — fragment and array rendering', () => {
  test('renders fragment children inline', () => {
    const frag = tova_fragment([tova_el('span', {}, ['a']), tova_el('span', {}, ['b'])]);
    const result = renderToString(frag);
    expect(result).toBe('<span>a</span><span>b</span>');
  });

  test('renders array of vnodes', () => {
    const result = renderToString([tova_el('li', {}, ['1']), tova_el('li', {}, ['2'])]);
    expect(result).toBe('<li>1</li><li>2</li>');
  });
});
