// Tests for Suspense, CSS scoping improvements, and Phase 5 features.
// Covers: Suspense component, lazy() loading, CSS scoping edge cases in ClientCodegen.

import { describe, test, expect } from 'bun:test';
import {
  createSignal, createEffect, createComputed, createRoot,
  Suspense, lazy, tova_el, tova_fragment
} from '../src/runtime/reactivity.js';
import { ClientCodegen } from '../src/codegen/client-codegen.js';

// ─── DOM Mock ───────────────────────────────────────────────

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

// ─── Suspense Tests ──────────────────────────────────────────

describe('Suspense', () => {
  test('Suspense component exists and is a function', () => {
    expect(typeof Suspense).toBe('function');
  });

  test('Suspense renders children when nothing is pending', () => {
    const childVNode = tova_el('div', {}, ['Hello']);
    const result = Suspense({
      fallback: tova_el('span', {}, ['Loading...']),
      children: [childVNode],
    });

    expect(result).toBeTruthy();
    expect(result.__tova).toBe(true);
    expect(result.tag).toBe('__dynamic');
    expect(typeof result.compute).toBe('function');

    // When nothing is pending, compute() should return children (not fallback)
    createRoot(() => {
      const computed = result.compute();
      // The child content should be the childVNode (single child unwrapped)
      expect(computed).toBeTruthy();
      expect(computed.__tova).toBe(true);
      expect(computed.tag).toBe('div');
      expect(computed.children[0]).toBe('Hello');
    });
  });

  test('Suspense returns a dynamic vnode with __tova flag', () => {
    const result = Suspense({
      fallback: 'Loading...',
      children: [tova_el('p', {}, ['Content'])],
    });

    expect(result.__tova).toBe(true);
    expect(result.tag).toBe('__dynamic');
    expect(typeof result.compute).toBe('function');
  });

  test('Suspense with multiple children wraps them in a fragment', () => {
    const child1 = tova_el('p', {}, ['First']);
    const child2 = tova_el('p', {}, ['Second']);
    const result = Suspense({
      fallback: 'Loading...',
      children: [child1, child2],
    });

    createRoot(() => {
      const computed = result.compute();
      // Multiple children should be wrapped in a fragment
      expect(computed.__tova).toBe(true);
      expect(computed.tag).toBe('__fragment');
      expect(computed.children.length).toBe(2);
    });
  });

  test('Suspense with no children renders empty fragment', () => {
    const result = Suspense({
      fallback: 'Loading...',
      children: [],
    });

    createRoot(() => {
      const computed = result.compute();
      expect(computed.__tova).toBe(true);
      expect(computed.tag).toBe('__fragment');
      expect(computed.children.length).toBe(0);
    });
  });

  test('Suspense fallback can be a function', () => {
    const result = Suspense({
      fallback: () => tova_el('div', {}, ['Loading spinner']),
      children: [tova_el('div', {}, ['Content'])],
    });

    // The fallback function is invoked when pending > 0 — we just verify the vnode shape
    expect(result.__tova).toBe(true);
    expect(typeof result.compute).toBe('function');
  });
});

// ─── lazy() Tests ────────────────────────────────────────────

describe('lazy', () => {
  test('lazy returns a function (LazyWrapper)', () => {
    const LazyComp = lazy(() => Promise.resolve({ default: () => tova_el('div', {}, ['Loaded']) }));
    expect(typeof LazyComp).toBe('function');
  });

  test('lazy wrapper returns a dynamic vnode', () => {
    const LazyComp = lazy(() => Promise.resolve({ default: () => tova_el('div', {}, ['Loaded']) }));

    createRoot(() => {
      const vnode = LazyComp({});
      expect(vnode).toBeTruthy();
      expect(vnode.__tova).toBe(true);
      expect(vnode.tag).toBe('__dynamic');
      expect(typeof vnode.compute).toBe('function');
    });
  });

  test('lazy wrapper uses individual fallback prop when provided', () => {
    const LazyComp = lazy(() => new Promise(() => {})); // never resolves

    createRoot(() => {
      const fallbackEl = tova_el('span', {}, ['Individual loading...']);
      const vnode = LazyComp({ fallback: fallbackEl });

      // Before resolution, compute() should return the individual fallback
      const computed = vnode.compute();
      expect(computed).toBeTruthy();
      expect(computed.__tova).toBe(true);
      expect(computed.tag).toBe('span');
      expect(computed.children[0]).toBe('Individual loading...');
    });
  });

  test('lazy wrapper returns null when no fallback and not resolved', () => {
    const LazyComp = lazy(() => new Promise(() => {})); // never resolves

    createRoot(() => {
      const vnode = LazyComp({});
      const computed = vnode.compute();
      expect(computed).toBeNull();
    });
  });
});

// ─── CSS Scoping Tests ──────────────────────────────────────

describe('CSS Scoping (_scopeCSS)', () => {
  const codegen = new ClientCodegen();
  const scopeAttr = '[data-tova-test]';

  test('handles basic selectors', () => {
    const input = '.foo { color: red; }';
    const result = codegen._scopeCSS(input, scopeAttr);
    expect(result).toContain('.foo[data-tova-test]');
    expect(result).toContain('color: red;');
  });

  test('handles pseudo-classes like :hover', () => {
    const input = '.foo:hover { color: blue; }';
    const result = codegen._scopeCSS(input, scopeAttr);
    // Scope attr should be inserted before the pseudo-class
    expect(result).toContain('.foo[data-tova-test]:hover');
  });

  test('handles pseudo-elements like ::before', () => {
    const input = '.foo::before { content: ""; }';
    const result = codegen._scopeCSS(input, scopeAttr);
    // Scope attr should be inserted before the pseudo-element
    expect(result).toContain('.foo[data-tova-test]::before');
  });

  test('skips @keyframes internals', () => {
    const input = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    const result = codegen._scopeCSS(input, scopeAttr);
    // from and to should NOT be scoped
    expect(result).not.toContain('from[data-tova-test]');
    expect(result).not.toContain('to[data-tova-test]');
    // @keyframes should be preserved
    expect(result).toContain('@keyframes spin');
    expect(result).toContain('from');
    expect(result).toContain('to');
  });

  test('handles @media wrapping — selectors inside @media are scoped', () => {
    const input = '@media (max-width: 600px) { .foo { color: red; } }';
    const result = codegen._scopeCSS(input, scopeAttr);
    // .foo inside @media should be scoped
    expect(result).toContain('.foo[data-tova-test]');
    // @media rule should be preserved
    expect(result).toContain('@media (max-width: 600px)');
  });

  test('handles :global() escape hatch', () => {
    const input = ':global(.body) { margin: 0; }';
    const result = codegen._scopeCSS(input, scopeAttr);
    // :global() should be stripped, leaving just .body without scope attr
    expect(result).toContain('.body');
    expect(result).not.toContain(':global');
    expect(result).not.toContain('.body[data-tova-test]');
  });

  test('handles CSS comments — preserved but selectors still scoped', () => {
    const input = '/* comment */ .foo { color: red; }';
    const result = codegen._scopeCSS(input, scopeAttr);
    // Comment should be preserved
    expect(result).toContain('/* comment */');
    // .foo should be scoped
    expect(result).toContain('.foo[data-tova-test]');
  });

  test('handles comma-separated selectors', () => {
    const input = '.a, .b { color: red; }';
    const result = codegen._scopeCSS(input, scopeAttr);
    // Both selectors should be scoped
    expect(result).toContain('.a[data-tova-test]');
    expect(result).toContain('.b[data-tova-test]');
  });

  test('handles :is() pseudo-function', () => {
    const input = '.foo:is(.bar) { color: red; }';
    const result = codegen._scopeCSS(input, scopeAttr);
    // The scope attr should be applied to .foo, and the :is(.bar) part preserved
    expect(result).toContain('[data-tova-test]');
    expect(result).toContain(':is(.bar)');
  });

  test('handles element selectors', () => {
    const input = 'h1 { font-size: 2em; }';
    const result = codegen._scopeCSS(input, scopeAttr);
    expect(result).toContain('h1[data-tova-test]');
  });

  test('handles nested pseudo-classes like :not()', () => {
    const input = '.foo:not(.bar) { display: none; }';
    const result = codegen._scopeCSS(input, scopeAttr);
    expect(result).toContain('[data-tova-test]');
    expect(result).toContain(':not(.bar)');
  });

  test('handles @font-face — internals not scoped', () => {
    const input = '@font-face { font-family: "MyFont"; src: url("font.woff2"); }';
    const result = codegen._scopeCSS(input, scopeAttr);
    // @font-face internals should not be scoped
    expect(result).toContain('@font-face');
    expect(result).not.toContain('[data-tova-test]');
  });

  test('handles multiple rules in sequence', () => {
    const input = '.a { color: red; } .b { color: blue; }';
    const result = codegen._scopeCSS(input, scopeAttr);
    expect(result).toContain('.a[data-tova-test]');
    expect(result).toContain('.b[data-tova-test]');
  });

  test('handles percentage keyframe selectors inside @keyframes', () => {
    const input = '@keyframes grow { 0% { width: 0; } 50% { width: 50%; } 100% { width: 100%; } }';
    const result = codegen._scopeCSS(input, scopeAttr);
    // Percentage selectors should NOT be scoped
    expect(result).not.toContain('0%[data-tova-test]');
    expect(result).not.toContain('50%[data-tova-test]');
    expect(result).not.toContain('100%[data-tova-test]');
  });

  test('handles descendant selectors', () => {
    const input = '.parent .child { color: red; }';
    const result = codegen._scopeCSS(input, scopeAttr);
    // The entire selector should get the scope attribute on the last part
    expect(result).toContain('[data-tova-test]');
  });

  test('_genScopeId produces consistent hashes', () => {
    const id1 = codegen._genScopeId('MyComponent', '.foo { color: red; }');
    const id2 = codegen._genScopeId('MyComponent', '.foo { color: red; }');
    expect(id1).toBe(id2);
    // Different inputs produce different hashes
    const id3 = codegen._genScopeId('Other', '.bar { color: blue; }');
    expect(id1).not.toBe(id3);
  });

  test('_genScopeId produces short alphanumeric strings', () => {
    const id = codegen._genScopeId('TestComp', '.test { display: flex; }');
    expect(typeof id).toBe('string');
    expect(id.length).toBeLessThanOrEqual(8);
    expect(/^[a-z0-9]+$/.test(id)).toBe(true);
  });
});

// ─── _scopeSelector Tests ────────────────────────────────────

describe('CSS _scopeSelector', () => {
  const codegen = new ClientCodegen();
  const scopeAttr = '[data-tova-test]';

  test('scopes a simple class selector', () => {
    const result = codegen._scopeSelector('.btn', scopeAttr);
    expect(result).toBe('.btn[data-tova-test]');
  });

  test('scopes an element selector', () => {
    const result = codegen._scopeSelector('div', scopeAttr);
    expect(result).toBe('div[data-tova-test]');
  });

  test('scopes selector with pseudo-class :hover', () => {
    const result = codegen._scopeSelector('.btn:hover', scopeAttr);
    expect(result).toBe('.btn[data-tova-test]:hover');
  });

  test('scopes selector with pseudo-element ::after', () => {
    const result = codegen._scopeSelector('.btn::after', scopeAttr);
    expect(result).toBe('.btn[data-tova-test]::after');
  });

  test('handles :global() by stripping wrapper and not scoping', () => {
    const result = codegen._scopeSelector(':global(.body)', scopeAttr);
    expect(result).toBe('.body');
  });

  test('scopes selector with :is() pseudo-function', () => {
    const result = codegen._scopeSelector('.foo:is(.bar, .baz)', scopeAttr);
    expect(result).toContain('[data-tova-test]');
    expect(result).toContain(':is(.bar, .baz)');
  });

  test('scopes selector with chained pseudo-classes', () => {
    const result = codegen._scopeSelector('.foo:first-child:hover', scopeAttr);
    expect(result).toContain('.foo[data-tova-test]');
    expect(result).toContain(':first-child');
    expect(result).toContain(':hover');
  });
});

// ─── tova_fragment Tests ─────────────────────────────────────

describe('tova_fragment', () => {
  test('creates a fragment vnode', () => {
    const frag = tova_fragment(['Hello', 'World']);
    expect(frag.__tova).toBe(true);
    expect(frag.tag).toBe('__fragment');
    expect(frag.children.length).toBe(2);
  });

  test('creates an empty fragment', () => {
    const frag = tova_fragment([]);
    expect(frag.__tova).toBe(true);
    expect(frag.tag).toBe('__fragment');
    expect(frag.children.length).toBe(0);
  });
});

// ─── tova_el Tests ───────────────────────────────────────────

describe('tova_el', () => {
  test('creates an element vnode', () => {
    const el = tova_el('div', { className: 'test' }, ['Hello']);
    expect(el.__tova).toBe(true);
    expect(el.tag).toBe('div');
    expect(el.props.className).toBe('test');
    expect(el.children[0]).toBe('Hello');
  });

  test('creates a self-closing element with no children', () => {
    const el = tova_el('br', {});
    expect(el.__tova).toBe(true);
    expect(el.tag).toBe('br');
    expect(el.children.length).toBe(0);
  });
});
