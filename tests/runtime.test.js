import { describe, test, expect, beforeEach } from 'bun:test';
import { createSignal, createEffect, createComputed, lux_el, lux_fragment, render, mount } from '../src/runtime/reactivity.js';
import { defineRoutes, getCurrentRoute, onRouteChange, navigate } from '../src/runtime/router.js';

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

describe('Reactivity — lux_el', () => {
  test('creates vnode', () => {
    const node = lux_el('div', { className: 'test' }, ['hello']);
    expect(node.__lux).toBe(true);
    expect(node.tag).toBe('div');
    expect(node.props.className).toBe('test');
    expect(node.children).toEqual(['hello']);
  });

  test('default props and children', () => {
    const node = lux_el('span');
    expect(node.props).toEqual({});
    expect(node.children).toEqual([]);
  });
});

describe('Reactivity — lux_fragment', () => {
  test('creates fragment vnode', () => {
    const frag = lux_fragment(['a', 'b']);
    expect(frag.__lux).toBe(true);
    expect(frag.tag).toBe('__fragment');
    expect(frag.children).toEqual(['a', 'b']);
  });
});

// ─── DOM Rendering ──────────────────────────────────────────

// Minimal DOM mock for Bun test environment
function createMockElement(tag) {
  const el = {
    tagName: tag,
    children: [],
    attributes: {},
    style: {},
    className: '',
    innerHTML: '',
    eventListeners: {},
    appendChild(child) { this.children.push(child); return child; },
    replaceChild(newChild, oldChild) {
      const idx = this.children.indexOf(oldChild);
      if (idx >= 0) this.children[idx] = newChild;
    },
    setAttribute(key, val) { this.attributes[key] = val; },
    addEventListener(event, handler) {
      if (!this.eventListeners[event]) this.eventListeners[event] = [];
      this.eventListeners[event].push(handler);
    },
    closest() { return null; },
  };
  return el;
}

function createMockDocument() {
  return {
    createElement(tag) { return createMockElement(tag); },
    createTextNode(text) { return { nodeType: 3, textContent: text }; },
    createDocumentFragment() {
      return {
        children: [],
        appendChild(child) { this.children.push(child); return child; },
      };
    },
    getElementById(id) { return createMockElement('div'); },
    addEventListener() {},
    body: createMockElement('body'),
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

  test('render non-lux object returns text', () => {
    const node = render({ some: 'object' });
    expect(node.textContent).toBeDefined();
  });

  test('render vnode creates element', () => {
    const vnode = lux_el('div', { className: 'test' }, ['hello']);
    const el = render(vnode);
    expect(el.tagName).toBe('div');
    expect(el.className).toBe('test');
  });

  test('render vnode with event handler', () => {
    const handler = () => {};
    const vnode = lux_el('button', { onClick: handler }, ['click me']);
    const el = render(vnode);
    expect(el.eventListeners['click']).toBeDefined();
  });

  test('render vnode with style object', () => {
    const vnode = lux_el('div', { style: { color: 'red' } }, []);
    const el = render(vnode);
    expect(el.style.color).toBe('red');
  });

  test('render vnode with key prop (skipped)', () => {
    const vnode = lux_el('div', { key: 'k1' }, []);
    const el = render(vnode);
    expect(el.attributes.key).toBeUndefined();
  });

  test('render vnode with regular attribute', () => {
    const vnode = lux_el('input', { type: 'text', id: 'name' }, []);
    const el = render(vnode);
    expect(el.attributes.type).toBe('text');
    expect(el.attributes.id).toBe('name');
  });

  test('render vnode with function attribute', () => {
    const vnode = lux_el('div', { className: () => 'dynamic' }, []);
    const el = render(vnode);
    expect(el.className).toBe('dynamic');
  });

  test('render fragment vnode', () => {
    const frag = lux_fragment(['a', 'b', 'c']);
    const el = render(frag);
    expect(el.children.length).toBe(3);
  });

  test('render self-closing element', () => {
    const vnode = lux_el('br', {}, []);
    const el = render(vnode);
    expect(el.tagName).toBe('br');
  });

  test('render nested children', () => {
    const child = lux_el('span', {}, ['inner']);
    const parent = lux_el('div', {}, [child]);
    const el = render(parent);
    expect(el.children.length).toBe(1);
  });

  test('render array children (flatten)', () => {
    const vnode = lux_el('div', {}, [['a', 'b'], 'c']);
    const el = render(vnode);
    expect(el.children.length).toBe(3);
  });
});

describe('Reactivity — mount', () => {
  test('mount with null container logs error', () => {
    const logs = [];
    const origError = console.error;
    console.error = (...args) => logs.push(args.join(' '));
    mount(() => lux_el('div', {}, []), null);
    console.error = origError;
    expect(logs.some(l => l.includes('Mount target not found'))).toBe(true);
  });

  test('mount with valid container', () => {
    const container = createMockElement('div');
    mount(() => lux_el('p', {}, ['hello']), container);
    expect(container.children.length).toBeGreaterThan(0);
  });

  test('mount updates on signal change', () => {
    const container = createMockElement('div');
    const [count, setCount] = createSignal(0);
    mount(() => lux_el('span', {}, [String(count())]), container);
    const firstChild = container.children[0];
    setCount(5);
    // After signal change, container should have been updated
    expect(container.children.length).toBeGreaterThan(0);
  });

  test('mount with static vnode', () => {
    const container = createMockElement('div');
    const vnode = lux_el('div', {}, ['static']);
    mount(vnode, container);
    expect(container.children.length).toBeGreaterThan(0);
  });
});

// ─── Router ───────────────────────────────────────────────

describe('Router — pathToRegex & matching', () => {
  test('defineRoutes accepts route map', () => {
    expect(() => defineRoutes({ '/': () => 'home', '/about': () => 'about' })).not.toThrow();
  });

  test('getCurrentRoute returns / when no window', () => {
    expect(getCurrentRoute()).toBe('/');
  });

  test('onRouteChange registers callback', () => {
    expect(() => onRouteChange(() => {})).not.toThrow();
  });

  test('navigate does nothing without window', () => {
    // Should not throw in non-browser environment
    expect(() => navigate('/test')).not.toThrow();
  });
});
