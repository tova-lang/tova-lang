// Fine-grained reactivity system for Lux (signals-based)

let currentEffect = null;
const effectStack = [];

export function createSignal(initialValue) {
  let value = initialValue;
  const subscribers = new Set();

  function getter() {
    if (currentEffect) {
      subscribers.add(currentEffect);
    }
    return value;
  }

  function setter(newValue) {
    if (typeof newValue === 'function') {
      newValue = newValue(value);
    }
    if (value !== newValue) {
      value = newValue;
      // Batch updates
      const toRun = [...subscribers];
      for (const effect of toRun) {
        effect();
      }
    }
  }

  return [getter, setter];
}

export function createEffect(fn) {
  function effect() {
    effectStack.push(effect);
    currentEffect = effect;
    try {
      fn();
    } finally {
      effectStack.pop();
      currentEffect = effectStack[effectStack.length - 1] || null;
    }
  }
  effect();
  return effect;
}

export function createComputed(fn) {
  const [value, setValue] = createSignal(undefined);
  createEffect(() => {
    setValue(fn());
  });
  return value;
}

// ─── DOM Rendering ────────────────────────────────────────

export function lux_el(tag, props = {}, children = []) {
  return { __lux: true, tag, props, children };
}

export function lux_fragment(children) {
  return { __lux: true, tag: '__fragment', props: {}, children };
}

// Flatten nested arrays and vnodes into a flat list of vnodes
function flattenVNodes(children) {
  const result = [];
  for (const child of children) {
    if (child === null || child === undefined) {
      continue;
    } else if (Array.isArray(child)) {
      result.push(...flattenVNodes(child));
    } else {
      result.push(child);
    }
  }
  return result;
}

// Create a real DOM node from a vnode
export function render(vnode) {
  if (vnode === null || vnode === undefined) {
    return document.createTextNode('');
  }

  if (typeof vnode === 'string' || typeof vnode === 'number' || typeof vnode === 'boolean') {
    return document.createTextNode(String(vnode));
  }

  if (Array.isArray(vnode)) {
    const fragment = document.createDocumentFragment();
    for (const child of vnode) {
      fragment.appendChild(render(child));
    }
    return fragment;
  }

  if (!vnode.__lux) {
    return document.createTextNode(String(vnode));
  }

  // Fragment
  if (vnode.tag === '__fragment') {
    const fragment = document.createDocumentFragment();
    for (const child of flattenVNodes(vnode.children)) {
      fragment.appendChild(render(child));
    }
    return fragment;
  }

  // Element
  const el = document.createElement(vnode.tag);
  applyProps(el, vnode.props, {});

  // Render children
  for (const child of flattenVNodes(vnode.children)) {
    el.appendChild(render(child));
  }

  // Store vnode reference for patching
  el.__vnode = vnode;

  return el;
}

// Apply/update props on a DOM element
function applyProps(el, newProps, oldProps) {
  // Remove old props that are no longer present
  for (const key of Object.keys(oldProps)) {
    if (!(key in newProps)) {
      if (key.startsWith('on')) {
        // Can't easily remove anonymous listeners, skip
      } else if (key === 'className') {
        el.className = '';
      } else if (key === 'style') {
        el.removeAttribute('style');
      } else {
        el.removeAttribute(key);
      }
    }
  }

  // Apply new props
  for (const [key, value] of Object.entries(newProps)) {
    if (key === 'className') {
      const val = typeof value === 'function' ? value() : value;
      if (el.className !== val) el.className = val;
    } else if (key.startsWith('on')) {
      // Re-attach event listeners (store reference to remove old one)
      const eventName = key.slice(2).toLowerCase();
      const oldHandler = el.__handlers && el.__handlers[eventName];
      if (oldHandler !== value) {
        if (oldHandler) el.removeEventListener(eventName, oldHandler);
        el.addEventListener(eventName, value);
        if (!el.__handlers) el.__handlers = {};
        el.__handlers[eventName] = value;
      }
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key === 'key') {
      // Skip
    } else if (key === 'value') {
      // For input elements, set .value property directly (not attribute)
      // and skip if element is focused (user is typing)
      const val = typeof value === 'function' ? value() : value;
      if (el !== document.activeElement && el.value !== val) {
        el.value = val;
      }
    } else if (key === 'checked') {
      el.checked = !!value;
    } else {
      const val = typeof value === 'function' ? value() : value;
      if (el.getAttribute(key) !== String(val)) {
        el.setAttribute(key, val);
      }
    }
  }
}

// Patch existing DOM to match new vnode (in-place updates, preserves focus)
function patch(parent, oldNode, newVNode, index = 0) {
  const existing = parent.childNodes[index];

  // No existing node — append new one
  if (!existing) {
    parent.appendChild(render(newVNode));
    return;
  }

  // New vnode is null/undefined — remove existing
  if (newVNode === null || newVNode === undefined) {
    parent.removeChild(existing);
    return;
  }

  // Text node
  if (typeof newVNode === 'string' || typeof newVNode === 'number' || typeof newVNode === 'boolean') {
    const text = String(newVNode);
    if (existing.nodeType === 3) {
      // Existing is text node — just update content
      if (existing.textContent !== text) {
        existing.textContent = text;
      }
    } else {
      // Replace non-text with text
      parent.replaceChild(document.createTextNode(text), existing);
    }
    return;
  }

  // Non-lux vnode — render as text
  if (!newVNode.__lux) {
    const text = String(newVNode);
    if (existing.nodeType === 3) {
      if (existing.textContent !== text) existing.textContent = text;
    } else {
      parent.replaceChild(document.createTextNode(text), existing);
    }
    return;
  }

  // Fragment — patch children directly into parent starting at index
  if (newVNode.tag === '__fragment') {
    const children = flattenVNodes(newVNode.children);
    for (let i = 0; i < children.length; i++) {
      patch(parent, null, children[i], index + i);
    }
    return;
  }

  // Element — check if we can patch in-place
  if (existing.nodeType === 1 && existing.tagName.toLowerCase() === newVNode.tag.toLowerCase()) {
    // Same tag — patch props and children in place
    const oldVNode = existing.__vnode || { props: {}, children: [] };
    applyProps(existing, newVNode.props, oldVNode.props);

    // Patch children
    const newChildren = flattenVNodes(newVNode.children);
    const oldChildCount = existing.childNodes.length;
    const newChildCount = newChildren.length;

    // Patch existing children
    for (let i = 0; i < Math.min(oldChildCount, newChildCount); i++) {
      patch(existing, existing.childNodes[i], newChildren[i], i);
    }

    // Add new children
    for (let i = oldChildCount; i < newChildCount; i++) {
      existing.appendChild(render(newChildren[i]));
    }

    // Remove extra old children
    while (existing.childNodes.length > newChildCount) {
      existing.removeChild(existing.lastChild);
    }

    existing.__vnode = newVNode;
    return;
  }

  // Different tag or node type — full replace
  parent.replaceChild(render(newVNode), existing);
}

function flattenChildren(children) {
  return flattenVNodes(children);
}

export function mount(component, container) {
  if (!container) {
    console.error('Lux: Mount target not found');
    return;
  }

  let firstRender = true;

  createEffect(() => {
    const vnode = typeof component === 'function' ? component() : component;

    if (firstRender) {
      container.innerHTML = '';
      container.appendChild(render(vnode));
      firstRender = false;
    } else {
      // Patch existing DOM in-place (preserves focus, input state)
      patch(container, container.firstChild, vnode, 0);
    }
  });
}
