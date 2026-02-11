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

export function render(vnode) {
  if (vnode === null || vnode === undefined) {
    return document.createTextNode('');
  }

  if (typeof vnode === 'string' || typeof vnode === 'number') {
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
    for (const child of flattenChildren(vnode.children)) {
      fragment.appendChild(render(child));
    }
    return fragment;
  }

  // Element
  const el = document.createElement(vnode.tag);

  // Apply props
  for (const [key, value] of Object.entries(vnode.props)) {
    if (key === 'className') {
      el.className = typeof value === 'function' ? value() : value;
    } else if (key.startsWith('on')) {
      const eventName = key.slice(2).toLowerCase();
      el.addEventListener(eventName, value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key === 'key') {
      // Skip key prop (used for reconciliation)
    } else {
      el.setAttribute(key, typeof value === 'function' ? value() : value);
    }
  }

  // Render children
  for (const child of flattenChildren(vnode.children)) {
    el.appendChild(render(child));
  }

  return el;
}

function flattenChildren(children) {
  const result = [];
  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...flattenChildren(child));
    } else {
      result.push(child);
    }
  }
  return result;
}

export function mount(component, container) {
  if (!container) {
    console.error('Lux: Mount target not found');
    return;
  }

  let currentDom = null;

  createEffect(() => {
    const vnode = typeof component === 'function' ? component() : component;
    const newDom = render(vnode);

    if (currentDom) {
      container.replaceChild(newDom, currentDom);
    } else {
      container.innerHTML = '';
      container.appendChild(newDom);
    }
    currentDom = newDom;
  });
}
