// Shared mock DOM preload for Bun test runner.
// Bun runs all test files in a single process, so module-level state
// (like globalThis.document) is shared. This preload installs a
// comprehensive mock DOM BEFORE any test file imports runtime modules,
// ensuring consistent behavior across macOS (APFS) and Linux (ext4)
// which have different readdir ordering.

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
    textContent: '',
    value: '',
    checked: false,
    eventListeners: {},
    __handlers: {},
    ...childMethods,
    setAttribute(key, val) { this.attributes[key] = String(val); },
    getAttribute(key) { return this.attributes[key] || null; },
    removeAttribute(key) { delete this.attributes[key]; },
    hasAttribute(key) { return key in this.attributes; },
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
    querySelectorAll() { return []; },
    replaceChildren() { this.children.length = 0; },
    remove() {
      if (this.parentNode) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx >= 0) this.parentNode.children.splice(idx, 1);
        this.parentNode = null;
      }
    },
    dispatchEvent(event) {
      const handlers = this.eventListeners[event.type] || [];
      for (const h of handlers) h(event);
      return true;
    },
  };
  return el;
}

function createMockTextNode(text) {
  return {
    nodeType: 3,
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

function createMockComment(text) {
  return {
    nodeType: 8,
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

function createMockDocFragment() {
  return {
    nodeType: 11,
    children: [],
    get childNodes() { return this.children; },
    get firstChild() { return this.children[0] || null; },
    ...childMethods,
  };
}

export const __setupDomTestHooks = {
  createMockElement,
  createMockTextNode,
  createMockComment,
  createMockDocFragment,
};

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    title: '',
    head: createMockElement('head'),
    body: createMockElement('body'),
    activeElement: null,
    createElement(tag) { return createMockElement(tag); },
    createTextNode(text) { return createMockTextNode(text); },
    createComment(text) { return createMockComment(text); },
    createDocumentFragment() { return createMockDocFragment(); },
    getElementById() { return createMockElement('div'); },
    querySelector(sel) { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
  };
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {};
}

if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail || {};
      this.bubbles = init.bubbles || false;
    }
  };
}

if (typeof globalThis.performance === 'undefined') {
  globalThis.performance = { now: () => Date.now() };
}
