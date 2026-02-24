// Testing utilities for Tova applications.
// Provides helpers to render components, fire events, and wait for reactive updates.
//
// Usage:
//   import { renderForTest, fireEvent, waitForEffect, cleanup } from './runtime/testing.js';
//
//   test('counter increments', async () => {
//     const { container, getByText } = renderForTest(Counter);
//     fireEvent.click(getByText('Increment'));
//     await waitForEffect();
//     expect(getByText('1')).toBeTruthy();
//     cleanup();
//   });

import { createRoot, render, mount, tova_el, batch } from './reactivity.js';

// Track all mounted roots for cleanup
const _activeRoots = [];

// ─── Minimal DOM (for non-browser environments) ──────────
function ensureDOM() {
  if (typeof document !== 'undefined' && document.createElement) return;
  throw new Error('Tova testing: DOM environment required. Use a test runner with DOM support (bun:test, jsdom, happy-dom).');
}

// ─── renderForTest ────────────────────────────────────────
// Renders a component into a detached container and returns query helpers.
// The component is mounted inside a reactive root for proper cleanup.

export function renderForTest(component, { props = {}, container: userContainer } = {}) {
  ensureDOM();

  const container = userContainer || document.createElement('div');
  let disposeFn = null;

  createRoot((dispose) => {
    disposeFn = dispose;
    const vnode = typeof component === 'function' ? component(props) : component;
    if (typeof container.replaceChildren === 'function') {
      container.replaceChildren();
    } else {
      while (container.firstChild) container.removeChild(container.firstChild);
    }
    container.appendChild(render(vnode));
  });

  _activeRoots.push({ dispose: disposeFn, container });

  return {
    container,
    dispose: disposeFn,
    // Query helpers
    getByText: (text) => findByText(container, text),
    getByTestId: (id) => container.querySelector(`[data-testid="${id}"]`),
    getByRole: (role) => container.querySelector(`[role="${role}"]`),
    querySelector: (sel) => container.querySelector(sel),
    querySelectorAll: (sel) => container.querySelectorAll(sel),
    // Debug helper
    debug: () => {
      if (container.innerHTML !== undefined) {
        console.log(container.innerHTML);
      } else {
        console.log(serializeNode(container));
      }
    },
  };
}

// ─── fireEvent ────────────────────────────────────────────
// Dispatches DOM events on elements. Works with both real DOM and mock DOM.

export const fireEvent = {
  click(el, options = {}) {
    return _dispatchEvent(el, 'click', options);
  },
  input(el, options = {}) {
    if (options.value !== undefined && el) {
      el.value = options.value;
    }
    return _dispatchEvent(el, 'input', options);
  },
  change(el, options = {}) {
    if (options.value !== undefined && el) {
      el.value = options.value;
    }
    if (options.checked !== undefined && el) {
      el.checked = options.checked;
    }
    return _dispatchEvent(el, 'change', options);
  },
  submit(el, options = {}) {
    return _dispatchEvent(el, 'submit', options);
  },
  focus(el, options = {}) {
    return _dispatchEvent(el, 'focus', options);
  },
  blur(el, options = {}) {
    return _dispatchEvent(el, 'blur', options);
  },
  keyDown(el, options = {}) {
    return _dispatchEvent(el, 'keydown', options);
  },
  keyUp(el, options = {}) {
    return _dispatchEvent(el, 'keyup', options);
  },
  mouseEnter(el, options = {}) {
    return _dispatchEvent(el, 'mouseenter', options);
  },
  mouseLeave(el, options = {}) {
    return _dispatchEvent(el, 'mouseleave', options);
  },
};

function _dispatchEvent(el, eventName, options = {}) {
  if (!el) throw new Error(`Tova testing: Cannot fire "${eventName}" on null/undefined element`);

  // Mock DOM path: call event listeners directly
  if (el.eventListeners && el.eventListeners[eventName]) {
    const event = {
      type: eventName,
      target: el,
      currentTarget: el,
      preventDefault: () => {},
      stopPropagation: () => {},
      ...options,
    };
    for (const handler of el.eventListeners[eventName]) {
      handler(event);
    }
    return event;
  }

  // Real DOM: use __handlers (Tova's internal handler map)
  if (el.__handlers && el.__handlers[eventName]) {
    const event = {
      type: eventName,
      target: el,
      currentTarget: el,
      preventDefault: () => {},
      stopPropagation: () => {},
      ...options,
    };
    el.__handlers[eventName](event);
    return event;
  }

  // Fall back to dispatchEvent for real DOM elements
  if (typeof el.dispatchEvent === 'function') {
    const EventClass = typeof Event !== 'undefined' ? Event : function(type) { this.type = type; };
    const event = new EventClass(eventName, { bubbles: true, cancelable: true, ...options });
    el.dispatchEvent(event);
    return event;
  }

  throw new Error(`Tova testing: Element has no event listeners for "${eventName}"`);
}

// ─── waitForEffect ────────────────────────────────────────
// Returns a promise that resolves after all pending effects and microtasks flush.
// Usage: await waitForEffect();

export function waitForEffect(ms = 0) {
  return new Promise(resolve => {
    if (ms > 0) {
      setTimeout(resolve, ms);
    } else {
      // Flush microtasks (queueMicrotask + Promise)
      queueMicrotask(() => queueMicrotask(resolve));
    }
  });
}

// ─── cleanup ──────────────────────────────────────────────
// Disposes all mounted test roots and removes containers.
// Call this in afterEach() or at end of test.

export function cleanup() {
  for (const root of _activeRoots) {
    if (root.dispose) root.dispose();
    if (root.container && root.container.parentNode) {
      root.container.parentNode.removeChild(root.container);
    }
  }
  _activeRoots.length = 0;
}

// ─── Query Helpers ────────────────────────────────────────

function findByText(container, text) {
  // Search through child nodes for text content match
  const walker = walkNodes(container);
  for (const node of walker) {
    if (node.nodeType === 1) {
      // Element node — check direct text content
      const directText = getDirectText(node);
      if (directText.includes(text)) return node;
    }
    if (node.nodeType === 3 && node.textContent && node.textContent.includes(text)) {
      return node.parentNode;
    }
  }
  return null;
}

function* walkNodes(node) {
  if (!node) return;
  const children = node.childNodes || node.children || [];
  for (let i = 0; i < children.length; i++) {
    yield children[i];
    yield* walkNodes(children[i]);
  }
}

function getDirectText(el) {
  let text = '';
  const children = el.childNodes || el.children || [];
  for (let i = 0; i < children.length; i++) {
    if (children[i].nodeType === 3) {
      text += children[i].textContent || '';
    }
  }
  return text;
}

// Serialize a DOM node to a readable string (for debug output)
function serializeNode(node, depth = 0) {
  if (!node) return '';
  const indent = '  '.repeat(depth);
  if (node.nodeType === 3) return `${indent}${JSON.stringify(node.textContent)}\n`;
  if (node.nodeType === 8) return `${indent}<!--${node.data}-->\n`;
  const tag = (node.tagName || 'unknown').toLowerCase();
  let result = `${indent}<${tag}`;
  if (node.className) result += ` class="${node.className}"`;
  result += '>\n';
  const children = node.childNodes || node.children || [];
  for (let i = 0; i < children.length; i++) {
    result += serializeNode(children[i], depth + 1);
  }
  result += `${indent}</${tag}>\n`;
  return result;
}
