// Fine-grained reactivity system for Tova (signals-based)

const __DEV__ = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

// ─── DevTools hooks (zero-cost when disabled) ────────────
let __devtools_hooks = null;
export function __enableDevTools(hooks) {
  __devtools_hooks = hooks;
}

let currentEffect = null;
const effectStack = [];

// ─── Ownership System ─────────────────────────────────────
let currentOwner = null;
const ownerStack = [];

// ─── Batching ────────────────────────────────────────────
// Default: synchronous flush after each setter (backward compatible).
// Inside batch(): effects are deferred and flushed once when batch ends.
// This means setA(1); setB(2) causes 2 runs by default, but
// batch(() => { setA(1); setB(2); }) causes only 1 run.

let pendingEffects = new Set();
let batchDepth = 0;
let flushing = false;

function flush() {
  if (flushing) return; // prevent re-entrant flush
  flushing = true;
  let iterations = 0;
  try {
    while (pendingEffects.size > 0) {
      if (++iterations > 100) {
        console.error('Tova: Possible infinite loop in reactive updates (>100 flush iterations). Aborting.');
        pendingEffects.clear();
        break;
      }

      // Invoke onBeforeUpdate callbacks for owners that have pending effects
      const ownersNotified = new Set();
      for (const effect of pendingEffects) {
        const owner = effect._owner;
        if (owner && owner._beforeUpdate && !ownersNotified.has(owner)) {
          ownersNotified.add(owner);
          for (const cb of owner._beforeUpdate) {
            try { cb(); } catch (e) { console.error('Tova: onBeforeUpdate error:', e); }
          }
        }
      }

      const toRun = pendingEffects;
      pendingEffects = new Set();
      // Sort by depth (parents first) to avoid redundant child re-runs
      if (toRun.size > 1) {
        const sorted = Array.from(toRun);
        sorted.sort((a, b) => (a._depth || 0) - (b._depth || 0));
        for (const effect of sorted) {
          if (!effect._disposed) {
            effect();
          }
        }
      } else {
        for (const effect of toRun) {
          if (!effect._disposed) {
            effect();
          }
        }
      }
    }
  } finally {
    flushing = false;
  }
}

export function batch(fn) {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      flush();
    }
  }
}

// ─── Ownership Root ──────────────────────────────────────

export function createRoot(fn) {
  const root = {
    _children: [],
    _disposed: false,
    _cleanups: [],
    _contexts: null,
    _owner: currentOwner,
    dispose() {
      if (root._disposed) return;
      root._disposed = true;
      // Dispose children in reverse order (skip already-disposed)
      for (let i = root._children.length - 1; i >= 0; i--) {
        const child = root._children[i];
        if (!child._disposed && typeof child.dispose === 'function') child.dispose();
      }
      root._children.length = 0;
      // Run cleanups in reverse order
      for (let i = root._cleanups.length - 1; i >= 0; i--) {
        try { root._cleanups[i](); } catch (e) { console.error('Tova: root cleanup error:', e); }
      }
      root._cleanups.length = 0;
    }
  };
  ownerStack.push(currentOwner);
  currentOwner = root;
  try {
    return fn(root.dispose.bind(root));
  } finally {
    currentOwner = ownerStack.pop();
  }
}

// ─── Dependency Cleanup ──────────────────────────────────

function cleanupDeps(subscriber) {
  if (subscriber._deps) {
    for (const depSet of subscriber._deps) {
      depSet.delete(subscriber);
    }
    subscriber._deps.clear();
  }
}

function trackDep(subscriber, subscriberSet) {
  subscriberSet.add(subscriber);
  if (!subscriber._deps) subscriber._deps = new Set();
  subscriber._deps.add(subscriberSet);
}

// ─── Signals ─────────────────────────────────────────────

export function createSignal(initialValue, name) {
  let value = initialValue;
  const subscribers = new Set();
  let signalId = null;

  if (__devtools_hooks) {
    signalId = __devtools_hooks.onSignalCreate(
      () => value,
      (v) => setter(v),
      name,
    );
  }

  function getter() {
    if (currentEffect) {
      trackDep(currentEffect, subscribers);
    }
    return value;
  }

  function setter(newValue) {
    if (typeof newValue === 'function') {
      newValue = newValue(value);
    }
    if (value !== newValue) {
      const oldValue = value;
      value = newValue;
      if (__devtools_hooks && signalId != null) {
        __devtools_hooks.onSignalUpdate(signalId, oldValue, newValue);
      }
      for (const sub of subscribers) {
        if (sub._isComputed) {
          sub(); // propagate dirty flags synchronously through computed graph
        } else {
          pendingEffects.add(sub);
        }
      }
      if (batchDepth === 0) {
        flush();
      }
    }
  }

  return [getter, setter];
}

// ─── Effects ─────────────────────────────────────────────

function runCleanups(effect) {
  if (effect._cleanup) {
    try { effect._cleanup(); } catch (e) { console.error('Tova: cleanup error:', e); }
    effect._cleanup = null;
  }
  if (effect._cleanups && effect._cleanups.length > 0) {
    for (const cb of effect._cleanups) {
      try { cb(); } catch (e) { console.error('Tova: cleanup error:', e); }
    }
    effect._cleanups = [];
  }
}

export function createEffect(fn) {
  function effect() {
    if (effect._running) return;
    if (effect._disposed) return;
    effect._running = true;

    // Run cleanups from previous execution
    runCleanups(effect);

    // Remove from all previous dependency subscriber sets
    cleanupDeps(effect);

    effectStack.push(effect);
    currentEffect = effect;
    const startTime = __devtools_hooks && typeof performance !== 'undefined' ? performance.now() : 0;
    try {
      const result = fn();
      // If effect returns a function, use as cleanup
      if (typeof result === 'function') {
        effect._cleanup = result;
      }
    } catch (e) {
      console.error('Tova: Error in effect:', e);
      if (currentErrorHandler) {
        currentErrorHandler(e);
      }
    } finally {
      if (__devtools_hooks) {
        const duration = typeof performance !== 'undefined' ? performance.now() - startTime : 0;
        __devtools_hooks.onEffectRun(effect, duration);
      }
      effectStack.pop();
      currentEffect = effectStack[effectStack.length - 1] || null;
      effect._running = false;
    }
  }

  effect._deps = new Set();
  effect._running = false;
  effect._disposed = false;
  effect._cleanup = null;
  effect._cleanups = [];
  effect._owner = currentOwner;
  // Compute depth for priority scheduling (parents flush before children)
  effect._depth = currentOwner ? (currentOwner._depth || 0) + 1 : 0;

  if (__devtools_hooks) {
    __devtools_hooks.onEffectCreate(effect);
  }

  if (currentOwner && !currentOwner._disposed) {
    currentOwner._children.push(effect);
  }

  effect.dispose = function () {
    effect._disposed = true;
    runCleanups(effect);
    cleanupDeps(effect);
    pendingEffects.delete(effect);
  };

  // Run immediately (synchronous first run)
  effect();
  return effect;
}

// ─── Computed (lazy/pull-based for glitch-free reads) ────

export function createComputed(fn) {
  let value;
  let dirty = true;
  const subscribers = new Set();

  // notify is called synchronously when a source signal changes.
  // It marks the computed dirty and propagates to downstream subscribers.
  function notify() {
    if (!dirty) {
      dirty = true;
      notify._dirty = true;
      for (const sub of subscribers) {
        if (sub._isComputed) {
          if (!sub._dirty) sub(); // skip already-dirty computeds
        } else {
          pendingEffects.add(sub);
        }
      }
    }
  }

  notify._deps = new Set();
  notify._disposed = false;
  notify._isComputed = true;
  notify._owner = currentOwner;

  if (currentOwner && !currentOwner._disposed) {
    currentOwner._children.push(notify);
  }

  notify.dispose = function () {
    notify._disposed = true;
    cleanupDeps(notify);
  };

  function recompute() {
    cleanupDeps(notify);

    effectStack.push(notify);
    currentEffect = notify;
    try {
      value = fn();
      dirty = false;
      notify._dirty = false;
    } finally {
      effectStack.pop();
      currentEffect = effectStack[effectStack.length - 1] || null;
    }
  }

  // Initial computation
  recompute();

  function getter() {
    if (currentEffect) {
      trackDep(currentEffect, subscribers);
    }
    if (dirty) {
      recompute();
    }
    return value;
  }

  return getter;
}

// ─── Lifecycle Hooks ─────────────────────────────────────

export function onMount(fn) {
  const owner = currentOwner;
  queueMicrotask(() => {
    const result = fn();
    if (typeof result === 'function' && owner && !owner._disposed) {
      owner._cleanups.push(result);
    }
  });
}

export function onUnmount(fn) {
  if (currentOwner && !currentOwner._disposed) {
    currentOwner._cleanups.push(fn);
  }
}

export function onCleanup(fn) {
  if (currentEffect) {
    if (!currentEffect._cleanups) currentEffect._cleanups = [];
    currentEffect._cleanups.push(fn);
  }
}

export function onBeforeUpdate(fn) {
  if (currentOwner && !currentOwner._disposed) {
    if (!currentOwner._beforeUpdate) currentOwner._beforeUpdate = [];
    currentOwner._beforeUpdate.push(fn);
  }
}

// ─── Untrack ─────────────────────────────────────────────
// Run a function without tracking any signal reads (opt out of reactivity)

export function untrack(fn) {
  const prev = currentEffect;
  currentEffect = null;
  try {
    return fn();
  } finally {
    currentEffect = prev;
  }
}

// ─── Watch ───────────────────────────────────────────────
// Watch a reactive expression, calling callback with (newValue, oldValue)
// Returns a dispose function to stop watching.

export function watch(getter, callback, options = {}) {
  let oldValue = undefined;
  let initialized = false;

  const effect = createEffect(() => {
    const newValue = getter();
    if (initialized) {
      untrack(() => callback(newValue, oldValue));
    } else if (options.immediate) {
      untrack(() => callback(newValue, undefined));
    }
    oldValue = newValue;
    initialized = true;
  });

  return effect.dispose ? effect.dispose.bind(effect) : () => {
    effect._disposed = true;
    runCleanups(effect);
    cleanupDeps(effect);
    pendingEffects.delete(effect);
  };
}

// ─── Refs ────────────────────────────────────────────────

export function createRef(initialValue) {
  return { current: initialValue !== undefined ? initialValue : null };
}

// ─── Error Boundaries ────────────────────────────────────

// Stack-based error handler for correct nested boundary propagation
const errorHandlerStack = [];
let currentErrorHandler = null;

function pushErrorHandler(handler) {
  errorHandlerStack.push(currentErrorHandler);
  currentErrorHandler = handler;
}

function popErrorHandler() {
  currentErrorHandler = errorHandlerStack.pop() || null;
}

// Component name tracking for stack traces
const componentNameStack = [];

export function pushComponentName(name) {
  componentNameStack.push(name);
}

export function popComponentName() {
  componentNameStack.pop();
}

function buildComponentStack() {
  return [...componentNameStack].reverse();
}

export function createErrorBoundary(options = {}) {
  const { onError, onReset } = options;
  const [error, setError] = createSignal(null);

  function run(fn) {
    pushErrorHandler((e) => {
      const stack = buildComponentStack();
      if (e && typeof e === 'object') e.__tovaComponentStack = stack;
      setError(e);
      if (onError) onError({ error: e, componentStack: stack });
    });
    try {
      return fn();
    } catch (e) {
      const stack = buildComponentStack();
      if (e && typeof e === 'object') e.__tovaComponentStack = stack;
      setError(e);
      if (onError) onError({ error: e, componentStack: stack });
      return null;
    } finally {
      popErrorHandler();
    }
  }

  function reset() {
    setError(null);
    if (onReset) onReset();
  }

  return { error, run, reset };
}

let __errorBoundaryIdCounter = 0;

export function ErrorBoundary({ fallback, children, onError, onReset, onErrorCleared, retry = 0 }) {
  const [error, setError] = createSignal(null);
  const [retryCount, setRetryCount] = createSignal(0);
  const boundaryId = ++__errorBoundaryIdCounter;
  let lastErrorId = 0;

  function handleError(e) {
    const stack = buildComponentStack();
    const errorId = `EB${boundaryId}-${++lastErrorId}`;

    if (e && typeof e === 'object') {
      e.__tovaComponentStack = stack;
      e.__tovaErrorId = errorId;
    }

    if (retryCount() < retry) {
      setRetryCount(c => c + 1);
      setError(null); // clear to re-trigger render
      return;
    }
    setError(e);
    if (onError) onError({ error: e, componentStack: stack, errorId, retryCount: retryCount() });
  }

  function resetBoundary() {
    setRetryCount(0);
    setError(null);
    if (onReset) onReset();
  }

  // Return a reactive wrapper that switches between children and fallback
  const childContent = children && children.length === 1 ? children[0] : tova_fragment(children || []);

  const vnode = {
    __tova: true,
    tag: '__dynamic',
    props: {},
    children: [],
    _fallback: fallback,
    _componentName: 'ErrorBoundary',
    _errorHandler: handleError, // Active during __dynamic effect render cycle
    compute: () => {
      const err = error();
      if (err) {
        // Render fallback — if fallback itself throws, propagate to parent boundary
        try {
          const errorId = err && typeof err === 'object' ? err.__tovaErrorId : null;
          return typeof fallback === 'function'
            ? fallback({
                error: err,
                errorId,
                retryCount: retryCount(),
                componentStack: err && typeof err === 'object' ? err.__tovaComponentStack : [],
                reset: resetBoundary,
              })
            : fallback;
        } catch (fallbackError) {
          // Fallback threw — propagate to parent error boundary
          if (currentErrorHandler) {
            currentErrorHandler(fallbackError);
          }
          return null;
        }
      }
      // Children rendered successfully — fire onErrorCleared if we recovered from an error
      if (onErrorCleared && lastErrorId > 0 && retryCount() === 0) {
        queueMicrotask(() => onErrorCleared());
      }
      return childContent;
    },
  };

  return vnode;
}

// Built-in ErrorInfo component — renders a formatted error display
// Usage: <ErrorBoundary fallback={fn(props) ErrorInfo(props)} />
export function ErrorInfo({ error, errorId, componentStack, reset, retryCount }) {
  const message = error instanceof Error ? error.message : String(error);
  const stackTrace = error instanceof Error && error.stack ? error.stack : '';
  const compStack = (componentStack || []).join(' > ');

  const children = [
    tova_el('h3', { style: { margin: '0 0 8px 0', color: '#e53e3e' } }, ['Something went wrong']),
    tova_el('p', { style: { margin: '4px 0', fontFamily: 'monospace', fontSize: '14px' } }, [message]),
  ];

  if (compStack) {
    children.push(
      tova_el('p', { style: { margin: '4px 0', fontSize: '12px', color: '#718096' } }, [
        'Component: ', compStack
      ])
    );
  }

  if (errorId) {
    children.push(
      tova_el('p', { style: { margin: '4px 0', fontSize: '11px', color: '#a0aec0' } }, [
        'Error ID: ', errorId
      ])
    );
  }

  if (stackTrace) {
    children.push(
      tova_el('details', { style: { marginTop: '8px', fontSize: '12px' } }, [
        tova_el('summary', { style: { cursor: 'pointer', color: '#4a5568' } }, ['Stack trace']),
        tova_el('pre', { style: { margin: '4px 0', padding: '8px', background: '#1a202c', color: '#e2e8f0', borderRadius: '4px', overflow: 'auto', fontSize: '11px', maxHeight: '200px' } }, [stackTrace]),
      ])
    );
  }

  if (reset) {
    children.push(
      tova_el('button', {
        style: { marginTop: '8px', padding: '6px 16px', background: '#3182ce', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' },
        onClick: reset,
      }, [retryCount > 0 ? 'Retry again' : 'Try again'])
    );
  }

  return tova_el('div', {
    style: { padding: '16px', border: '1px solid #fed7d7', borderRadius: '8px', background: '#fff5f5', color: '#2d3748', fontFamily: 'system-ui, -apple-system, sans-serif' },
    role: 'alert',
  }, children);
}

// ─── Dynamic Component ──────────────────────────────────
// Renders a component dynamically based on a reactive signal.
// Usage: Dynamic({ component: mySignal, ...props })

export function Dynamic({ component, ...rest }) {
  return {
    __tova: true,
    tag: '__dynamic',
    props: {},
    children: [],
    compute: () => {
      const comp = typeof component === 'function' && !component.__tova ? component() : component;
      if (!comp) return null;
      if (typeof comp === 'function') {
        return comp(rest);
      }
      return comp;
    },
  };
}

// ─── Portal ─────────────────────────────────────────────
// Renders children into a different DOM target.
// Usage: Portal({ target: "#modal-root", children })

export function Portal({ target, children }) {
  return {
    __tova: true,
    tag: '__portal',
    props: { target },
    children: children || [],
  };
}

// ─── Suspense ────────────────────────────────────────────
// Renders fallback while any child lazy() component is loading.
// Usage: Suspense({ fallback: loadingEl, children: [LazyComp(props)] })

const SuspenseContext = createContext(null);

export function Suspense({ fallback, children }) {
  const [pending, setPending] = createSignal(0);
  const childContent = children && children.length === 1 ? children[0] : tova_fragment(children || []);

  const boundary = {
    register() {
      setPending(p => p + 1);
    },
    resolve() {
      setPending(p => Math.max(0, p - 1));
    },
  };

  return {
    __tova: true,
    tag: '__dynamic',
    props: {},
    children: [],
    compute: () => {
      provide(SuspenseContext, boundary);
      if (pending() > 0) {
        return typeof fallback === 'function' ? fallback() : fallback;
      }
      return childContent;
    },
  };
}

// ─── Lazy ───────────────────────────────────────────────
// Async component loading with optional fallback.
// Usage: const LazyComp = lazy(() => import('./HeavyComponent.js'))

export function lazy(loader) {
  let resolved = null;
  let loadError = null;
  let promise = null;

  return function LazyWrapper(props) {
    if (resolved) {
      return resolved(props);
    }

    // Check for Suspense boundary
    const suspense = inject(SuspenseContext);

    if (!promise) {
      if (suspense) suspense.register();
      promise = loader()
        .then(mod => {
          resolved = mod.default || mod;
          if (suspense) suspense.resolve();
        })
        .catch(e => {
          loadError = e;
          if (suspense) suspense.resolve();
        });
    }

    const [tick, setTick] = createSignal(0);

    // Trigger re-render when promise settles
    promise.then(() => setTick(1)).catch(() => setTick(1));

    return {
      __tova: true,
      tag: '__dynamic',
      props: {},
      children: [],
      compute: () => {
        tick(); // Track for reactivity
        if (loadError) return tova_el('span', { className: 'tova-error' }, [String(loadError)]);
        if (resolved) return resolved(props);
        // Fallback while loading (individual or Suspense-level)
        return props && props.fallback ? props.fallback : null;
      },
    };
  };
}

// ─── Context (Provide/Inject) ────────────────────────────
// Tree-based: values are stored on the ownership tree, inject walks up.

export function createContext(defaultValue) {
  const id = Symbol('context');
  return { _id: id, _default: defaultValue };
}

export function provide(context, value) {
  const owner = currentOwner;
  if (owner) {
    if (!owner._contexts) owner._contexts = new Map();
    owner._contexts.set(context._id, value);
  }
}

export function inject(context) {
  let owner = currentOwner;
  while (owner) {
    if (owner._contexts && owner._contexts.has(context._id)) {
      return owner._contexts.get(context._id);
    }
    owner = owner._owner;
  }
  return context._default;
}

// ─── DOM Rendering ────────────────────────────────────────

// Inject scoped CSS into the page (idempotent — only injects once per id)
const __tovaInjectedStyles = new Set();
export function tova_inject_css(id, css) {
  if (__tovaInjectedStyles.has(id)) return;
  __tovaInjectedStyles.add(id);
  const style = document.createElement('style');
  style.setAttribute('data-tova-style', id);
  style.textContent = css;
  document.head.appendChild(style);
}

export function tova_el(tag, props = {}, children = []) {
  return { __tova: true, tag, props, children };
}

export function tova_fragment(children) {
  return { __tova: true, tag: '__fragment', props: {}, children };
}

// ─── Transitions ──────────────────────────────────────────
// CSS transition directives for mount/unmount animations.
// Usage: tova_transition(vnode, "fade", { duration: 300 })

const TRANSITION_DEFAULTS = {
  fade: { duration: 200, easing: 'ease' },
  slide: { duration: 300, easing: 'ease-out', axis: 'y' },
  scale: { duration: 200, easing: 'ease' },
  fly: { duration: 300, easing: 'ease-out', x: 0, y: -20 },
};

function getTransitionCSS(name, config, phase) {
  const opts = { ...TRANSITION_DEFAULTS[name], ...config };
  const dur = opts.duration + 'ms';
  const ease = opts.easing;

  switch (name) {
    case 'fade':
      if (phase === 'enter-from' || phase === 'leave-to') {
        return { opacity: '0', transition: `opacity ${dur} ${ease}` };
      }
      return { opacity: '1', transition: `opacity ${dur} ${ease}` };

    case 'slide': {
      const axis = opts.axis || 'y';
      const prop = axis === 'x' ? 'translateX' : 'translateY';
      const dist = (opts.distance || 20) + 'px';
      if (phase === 'enter-from' || phase === 'leave-to') {
        return { transform: `${prop}(${dist})`, opacity: '0', transition: `transform ${dur} ${ease}, opacity ${dur} ${ease}` };
      }
      return { transform: `${prop}(0)`, opacity: '1', transition: `transform ${dur} ${ease}, opacity ${dur} ${ease}` };
    }

    case 'scale':
      if (phase === 'enter-from' || phase === 'leave-to') {
        return { transform: 'scale(0)', opacity: '0', transition: `transform ${dur} ${ease}, opacity ${dur} ${ease}` };
      }
      return { transform: 'scale(1)', opacity: '1', transition: `transform ${dur} ${ease}, opacity ${dur} ${ease}` };

    case 'fly': {
      const x = (opts.x || 0) + 'px';
      const y = (opts.y || -20) + 'px';
      if (phase === 'enter-from' || phase === 'leave-to') {
        return { transform: `translate(${x}, ${y})`, opacity: '0', transition: `transform ${dur} ${ease}, opacity ${dur} ${ease}` };
      }
      return { transform: 'translate(0, 0)', opacity: '1', transition: `transform ${dur} ${ease}, opacity ${dur} ${ease}` };
    }

    default:
      return {};
  }
}

export function tova_transition(vnode, nameOrConfig, config = {}) {
  if (!vnode || !vnode.__tova) return vnode;

  // Directional transitions: tova_transition(vnode, { in: {...}, out: {...} })
  if (typeof nameOrConfig === 'object' && nameOrConfig !== null && !nameOrConfig.__tova && (nameOrConfig.in || nameOrConfig.out)) {
    vnode._transition = { directional: true, in: nameOrConfig.in, out: nameOrConfig.out };
    return vnode;
  }

  // Custom transition function: tova_transition(vnode, myTransitionFn, config)
  if (typeof nameOrConfig === 'function') {
    vnode._transition = { custom: nameOrConfig, config };
    return vnode;
  }

  // Built-in transition: tova_transition(vnode, "fade", config)
  vnode._transition = { name: nameOrConfig, config };
  return vnode;
}

// ─── Actions ──────────────────────────────────────────────
// use: directive support. Calls actionFn(el, param) after render.
// Returns the wrapped vnode. The action lifecycle (update/destroy) is managed.

export function __tova_action(vnode, actionFn, param) {
  if (!vnode || !vnode.__tova) return vnode;
  if (!vnode._actions) vnode._actions = [];
  vnode._actions.push({ fn: actionFn, param });
  return vnode;
}

// Apply enter transition to a DOM element after render
function applyEnterTransition(el, trans) {
  if (!trans) return;

  // Custom transition function
  if (trans.custom) {
    const result = trans.custom(el, trans.config || {}, 'enter');
    if (result && typeof result === 'object' && !result.then) {
      Object.assign(el.style, result);
    }
    return;
  }

  // Directional: use 'in' config for enter
  const name = trans.directional ? (trans.in ? trans.in.name : null) : trans.name;
  const config = trans.directional ? (trans.in ? trans.in.config : {}) : trans.config;
  if (!name) return;

  const fromStyles = getTransitionCSS(name, config, 'enter-from');
  const toStyles = getTransitionCSS(name, config, 'enter-to');

  // Set initial state
  Object.assign(el.style, fromStyles);

  // Force reflow, then apply target state
  void el.offsetHeight;
  Object.assign(el.style, toStyles);
}

// Apply leave transition and return a Promise that resolves when done
function applyLeaveTransition(el, trans) {
  if (!trans) return Promise.resolve();

  // Custom transition function
  if (trans.custom) {
    const result = trans.custom(el, trans.config || {}, 'leave');
    if (result && typeof result.then === 'function') {
      // Race with timeout to prevent leaked promises from custom transitions
      const dur = (trans.config && trans.config.duration) || 5000;
      return Promise.race([result, new Promise(r => setTimeout(r, dur + 100))]);
    }
    if (result && typeof result === 'object') {
      Object.assign(el.style, result);
    }
    const dur = (trans.config && trans.config.duration) || 200;
    return new Promise(resolve => setTimeout(resolve, dur));
  }

  // Directional: use 'out' config for leave
  const name = trans.directional ? (trans.out ? trans.out.name : null) : trans.name;
  const config = trans.directional ? (trans.out ? trans.out.config : {}) : trans.config;
  if (!name) return Promise.resolve();

  const duration = (config && config.duration) || TRANSITION_DEFAULTS[name]?.duration || 200;
  const toStyles = getTransitionCSS(name, config, 'leave-to');
  Object.assign(el.style, toStyles);

  return new Promise(resolve => {
    const handler = () => {
      el.removeEventListener('transitionend', handler);
      resolve();
    };
    el.addEventListener('transitionend', handler);
    // Fallback timeout in case transitionend doesn't fire
    setTimeout(resolve, duration + 50);
  });
}

// Inject a key prop into a vnode for keyed reconciliation
export function tova_keyed(key, vnode) {
  if (vnode && vnode.__tova) {
    vnode.props = { ...vnode.props, key };
  }
  return vnode;
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

// ─── Marker-based DOM helpers ─────────────────────────────
// Instead of wrapping dynamic blocks/fragments in <span style="display:contents">,
// we use comment node markers. A marker's __tovaNodes tracks its content nodes.
// Content nodes have __tovaOwner pointing to their owning marker.

// Recursively dispose ownership roots attached to a DOM subtree
function disposeNode(node) {
  if (!node) return;
  if (node.__tovaRoot) {
    node.__tovaRoot();
    node.__tovaRoot = null;
  }
  // If this is a marker, dispose and remove its content nodes
  if (node.__tovaNodes) {
    for (const cn of node.__tovaNodes) {
      disposeNode(cn);
      if (cn.parentNode) cn.parentNode.removeChild(cn);
    }
    node.__tovaNodes = [];
  }
  if (node.childNodes) {
    for (const child of Array.from(node.childNodes)) {
      disposeNode(child);
    }
  }
}

// Check if a node is transitively owned by a marker (walks __tovaOwner chain)
function isOwnedBy(node, marker) {
  let owner = node.__tovaOwner;
  while (owner) {
    if (owner === marker) return true;
    owner = owner.__tovaOwner;
  }
  return false;
}

// Get logical children of a parent element (skips marker content nodes)
function getLogicalChildren(parent) {
  const logical = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i];
    if (!node.__tovaOwner) {
      logical.push(node);
    }
  }
  return logical;
}

// Find the first DOM sibling after all of a marker's content
function nextSiblingAfterMarker(marker) {
  if (!marker.__tovaNodes || marker.__tovaNodes.length === 0) {
    return marker.nextSibling;
  }
  let last = marker.__tovaNodes[marker.__tovaNodes.length - 1];
  // If last content is itself a marker, recurse to find physical end
  while (last && last.__tovaNodes && last.__tovaNodes.length > 0) {
    last = last.__tovaNodes[last.__tovaNodes.length - 1];
  }
  return last ? last.nextSibling : marker.nextSibling;
}

// Remove a logical node (marker + its content, or a regular node) from the DOM
function removeLogicalNode(parent, node) {
  disposeNode(node);
  if (node.parentNode === parent) parent.removeChild(node);
}

// Insert rendered result (could be single node or DocumentFragment) before ref,
// setting __tovaOwner on top-level inserted nodes. Returns array of inserted nodes.
function insertRendered(parent, rendered, ref, owner) {
  if (rendered.nodeType === 11) {
    const nodes = Array.from(rendered.childNodes);
    for (const n of nodes) {
      if (!n.__tovaOwner) n.__tovaOwner = owner;
    }
    parent.insertBefore(rendered, ref);
    return nodes;
  }
  if (!rendered.__tovaOwner) rendered.__tovaOwner = owner;
  parent.insertBefore(rendered, ref);
  return [rendered];
}

// Clear a marker's content from the DOM and reset __tovaNodes
function clearMarkerContent(marker) {
  for (const node of marker.__tovaNodes) {
    // If element has a leave transition, animate out before removing
    if (node.__tovaTransition && node.nodeType === 1) {
      const el = node;
      applyLeaveTransition(el, el.__tovaTransition).then(() => {
        disposeNode(el);
        if (el.parentNode) el.parentNode.removeChild(el);
      }).catch(() => {
        disposeNode(el);
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    } else {
      disposeNode(node);
      if (node.parentNode) node.parentNode.removeChild(node);
    }
  }
  marker.__tovaNodes = [];
}

// ─── Render ───────────────────────────────────────────────

// Create real DOM nodes from a vnode (with fine-grained reactive bindings).
// Returns a single DOM node for elements/text, or a DocumentFragment for
// markers (dynamic blocks, fragments) containing [marker, ...content].
export function render(vnode) {
  if (vnode === null || vnode === undefined) {
    return document.createTextNode('');
  }

  // Reactive dynamic block (JSXIf, JSXFor, reactive text, etc.)
  if (typeof vnode === 'function') {
    const marker = document.createComment('');
    marker.__tovaDynamic = true;
    marker.__tovaNodes = [];

    const frag = document.createDocumentFragment();
    frag.appendChild(marker);

    createEffect(() => {
      const val = vnode();
      const parent = marker.parentNode;
      const ref = nextSiblingAfterMarker(marker);

      // Array: keyed or positional reconciliation within marker range
      if (Array.isArray(val)) {
        const flat = flattenVNodes(val);
        const hasKeys = flat.some(c => getKey(c) != null);
        if (hasKeys) {
          patchKeyedInMarker(marker, flat);
        } else {
          patchPositionalInMarker(marker, flat);
        }
        return;
      }

      // Text: optimize single text node update in place
      if (val == null || typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        const text = val == null ? '' : String(val);
        if (marker.__tovaNodes.length === 1 && marker.__tovaNodes[0].nodeType === 3) {
          if (marker.__tovaNodes[0].textContent !== text) {
            marker.__tovaNodes[0].textContent = text;
          }
          return;
        }
        clearMarkerContent(marker);
        const textNode = document.createTextNode(text);
        textNode.__tovaOwner = marker;
        parent.insertBefore(textNode, ref);
        marker.__tovaNodes = [textNode];
        return;
      }

      // Vnode or other: clear and re-render
      clearMarkerContent(marker);
      if (val && val.__tova) {
        const rendered = render(val);
        marker.__tovaNodes = insertRendered(parent, rendered, ref, marker);
      } else {
        const textNode = document.createTextNode(String(val));
        textNode.__tovaOwner = marker;
        parent.insertBefore(textNode, ref);
        marker.__tovaNodes = [textNode];
      }
    });

    return frag;
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

  if (!vnode.__tova) {
    return document.createTextNode(String(vnode));
  }

  // Fragment — marker + children (no wrapper element)
  if (vnode.tag === '__fragment') {
    const marker = document.createComment('');
    marker.__tovaFragment = true;
    marker.__tovaNodes = [];
    marker.__vnode = vnode;

    const frag = document.createDocumentFragment();
    frag.appendChild(marker);

    for (const child of flattenVNodes(vnode.children)) {
      const rendered = render(child);
      const inserted = insertRendered(frag, rendered, null, marker);
      marker.__tovaNodes.push(...inserted);
    }

    return frag;
  }

  // Dynamic reactive node (ErrorBoundary, Dynamic component, etc.)
  if (vnode.tag === '__dynamic' && typeof vnode.compute === 'function') {
    const marker = document.createComment('');
    marker.__tovaDynamic = true;
    marker.__tovaNodes = [];

    const frag = document.createDocumentFragment();
    frag.appendChild(marker);

    let prevDispose = null;
    const errHandler = vnode._errorHandler || null;
    createEffect(() => {
      if (errHandler) pushErrorHandler(errHandler);
      try {
        const inner = vnode.compute();
        const parent = marker.parentNode;
        const ref = nextSiblingAfterMarker(marker);

        if (prevDispose) {
          prevDispose();
          prevDispose = null;
        }
        clearMarkerContent(marker);

        createRoot((dispose) => {
          prevDispose = dispose;
          const rendered = render(inner);
          marker.__tovaNodes = insertRendered(parent, rendered, ref, marker);
        });
      } catch (e) {
        if (errHandler) {
          errHandler(e);
        } else if (currentErrorHandler) {
          currentErrorHandler(e);
        } else {
          console.error('Uncaught error during render:', e);
        }
      } finally {
        if (errHandler) popErrorHandler();
      }
    });

    return frag;
  }

  // Portal — render children into a different DOM target
  if (vnode.tag === '__portal') {
    const placeholder = document.createComment('portal');
    const targetSelector = vnode.props.target;
    queueMicrotask(() => {
      const targetEl = typeof targetSelector === 'string'
        ? document.querySelector(targetSelector)
        : targetSelector;
      if (targetEl) {
        for (const child of flattenVNodes(vnode.children)) {
          targetEl.appendChild(render(child));
        }
      }
    });
    return placeholder;
  }

  // Element
  const el = document.createElement(vnode.tag);
  applyReactiveProps(el, vnode.props);

  // Set data-tova-component attribute for DevTools
  if (vnode._componentName) {
    el.setAttribute('data-tova-component', vnode._componentName);
    if (__devtools_hooks && __devtools_hooks.onComponentRender) {
      __devtools_hooks.onComponentRender(vnode._componentName, el, 0);
    }
  }

  // Render children
  for (const child of flattenVNodes(vnode.children)) {
    el.appendChild(render(child));
  }

  // Store vnode reference for patching
  el.__vnode = vnode;

  // Apply enter transition if present
  if (vnode._transition) {
    el.__tovaTransition = vnode._transition;
    applyEnterTransition(el, vnode._transition);
  }

  // Apply use: actions if present
  if (vnode._actions && vnode._actions.length > 0) {
    for (const action of vnode._actions) {
      const paramValue = typeof action.param === 'function' ? action.param() : action.param;
      const result = action.fn(el, paramValue);
      if (result) {
        // If param is reactive, set up effect for updates
        if (typeof action.param === 'function') {
          createEffect(() => {
            const newVal = action.param();
            if (result.update) result.update(newVal);
          });
        }
        // Register destroy on cleanup
        if (result.destroy) {
          if (currentOwner && !currentOwner._disposed) {
            currentOwner._cleanups.push(result.destroy);
          }
        }
      }
    }
  }

  return el;
}

// Apply reactive props — function-valued props get their own effect
function applyReactiveProps(el, props) {
  for (const [key, value] of Object.entries(props)) {
    if (key === 'ref') {
      if (typeof value === 'object' && value !== null && 'current' in value) {
        value.current = el;
      } else if (typeof value === 'function') {
        value(el);
      }
    } else if (key.startsWith('on')) {
      const eventName = key.slice(2).toLowerCase();
      if (typeof value === 'object' && value !== null && value.handler) {
        el.addEventListener(eventName, value.handler, value.options);
        if (!el.__handlers) el.__handlers = {};
        el.__handlers[eventName] = value.handler;
        el.__handlerOptions = el.__handlerOptions || {};
        el.__handlerOptions[eventName] = value.options;
      } else {
        el.addEventListener(eventName, value);
        if (!el.__handlers) el.__handlers = {};
        el.__handlers[eventName] = value;
      }
    } else if (key === 'key') {
      // Skip
    } else if (typeof value === 'function' && !key.startsWith('on')) {
      // Reactive prop — create effect for fine-grained updates
      createEffect(() => {
        const val = value();
        applyPropValue(el, key, val);
      });
    } else {
      applyPropValue(el, key, value);
    }
  }
}

function applyPropValue(el, key, val) {
  if (key === 'className') {
    if (el.className !== val) el.className = val || '';
  } else if (key === 'innerHTML' || key === 'dangerouslySetInnerHTML') {
    const html = typeof val === 'object' && val !== null ? val.__html || '' : val || '';
    if (__DEV__ && html) {
      console.warn('Tova: Setting innerHTML can expose your app to XSS attacks. Ensure the content is sanitized.');
    }
    if (el.innerHTML !== html) el.innerHTML = html;
  } else if (key === 'value') {
    if (el !== document.activeElement && el.value !== val) {
      el.value = val;
    }
  } else if (key === 'checked') {
    el.checked = !!val;
  } else if (key === 'disabled' || key === 'readOnly' || key === 'hidden') {
    el[key] = !!val;
  } else if (key === 'style' && typeof val === 'object') {
    // Delta update: only remove properties that were in previous style but not in new
    if (el.__prevStyle) {
      for (const prop of Object.keys(el.__prevStyle)) {
        if (!(prop in val)) el.style.removeProperty(prop);
      }
    }
    el.__prevStyle = { ...val };
    Object.assign(el.style, val);
  } else {
    const s = val == null ? '' : String(val);
    if (el.getAttribute(key) !== s) {
      el.setAttribute(key, s);
    }
  }
}

// Apply/update props on a DOM element (used by patcher for full-tree mode)
function applyProps(el, newProps, oldProps) {
  // Remove old props that are no longer present
  for (const key of Object.keys(oldProps)) {
    if (!(key in newProps)) {
      if (key.startsWith('on')) {
        const eventName = key.slice(2).toLowerCase();
        if (el.__handlers && el.__handlers[eventName]) {
          el.removeEventListener(eventName, el.__handlers[eventName]);
          delete el.__handlers[eventName];
        }
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
    } else if (key === 'ref') {
      if (typeof value === 'object' && value !== null && 'current' in value) {
        value.current = el;
      } else if (typeof value === 'function') {
        value(el);
      }
    } else if (key.startsWith('on')) {
      const eventName = key.slice(2).toLowerCase();
      if (typeof value === 'object' && value !== null && value.handler) {
        const oldHandler = el.__handlers && el.__handlers[eventName];
        if (oldHandler !== value.handler) {
          const oldOpts = el.__handlerOptions && el.__handlerOptions[eventName];
          if (oldHandler) el.removeEventListener(eventName, oldHandler, oldOpts);
          el.addEventListener(eventName, value.handler, value.options);
          if (!el.__handlers) el.__handlers = {};
          el.__handlers[eventName] = value.handler;
          el.__handlerOptions = el.__handlerOptions || {};
          el.__handlerOptions[eventName] = value.options;
        }
      } else {
        const oldHandler = el.__handlers && el.__handlers[eventName];
        if (oldHandler !== value) {
          if (oldHandler) el.removeEventListener(eventName, oldHandler);
          el.addEventListener(eventName, value);
          if (!el.__handlers) el.__handlers = {};
          el.__handlers[eventName] = value;
        }
      }
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key === 'key') {
      // Skip
    } else if (key === 'value') {
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

// ─── Longest Increasing Subsequence (O(n log n)) ────────
// Used by keyed reconciliation to minimize DOM moves.

function longestIncreasingSubsequence(arr) {
  const n = arr.length;
  if (n === 0) return [];

  // tails[i] = index in arr of smallest tail element for IS of length i+1
  const tails = [];
  // parent[i] = index in arr of predecessor of arr[i] in the LIS
  const parent = new Array(n).fill(-1);
  // indices[i] = index in arr of tails[i]
  const indices = [];

  for (let i = 0; i < n; i++) {
    const val = arr[i];
    if (val < 0) continue; // skip removed items (marker -1)

    // Binary search for the insertion point
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < val) lo = mid + 1;
      else hi = mid;
    }

    tails[lo] = val;
    indices[lo] = i;

    if (lo > 0) {
      parent[i] = indices[lo - 1];
    }
  }

  // Reconstruct
  const result = new Array(tails.length);
  let k = indices[tails.length - 1];
  for (let i = tails.length - 1; i >= 0; i--) {
    result[i] = k;
    k = parent[k];
  }

  return result;
}

// ─── Keyed Reconciliation ────────────────────────────────

function getKey(vnode) {
  if (vnode && vnode.__tova && vnode.props) return vnode.props.key;
  return undefined;
}

function getNodeKey(node) {
  if (node && node.__vnode && node.__vnode.props) return node.__vnode.props.key;
  return undefined;
}

// Keyed reconciliation within a marker's content range
function patchKeyedInMarker(marker, newVNodes) {
  const parent = marker.parentNode;
  const oldNodes = [...marker.__tovaNodes];
  const oldKeyMap = new Map();

  for (const node of oldNodes) {
    const key = getNodeKey(node);
    if (key != null) oldKeyMap.set(key, node);
  }

  const newNodes = [];
  const usedOld = new Set();

  for (const newChild of newVNodes) {
    const key = getKey(newChild);

    if (key != null && oldKeyMap.has(key)) {
      const oldNode = oldKeyMap.get(key);
      usedOld.add(oldNode);

      if (oldNode.nodeType === 1 && newChild.__tova &&
          oldNode.tagName.toLowerCase() === newChild.tag.toLowerCase()) {
        const oldVNode = oldNode.__vnode || { props: {}, children: [] };
        applyProps(oldNode, newChild.props, oldVNode.props);
        patchChildrenOfElement(oldNode, flattenVNodes(newChild.children));
        oldNode.__vnode = newChild;
        newNodes.push(oldNode);
      } else {
        const node = render(newChild);
        // render may return Fragment — collect nodes
        if (node.nodeType === 11) {
          const nodes = Array.from(node.childNodes);
          for (const n of nodes) { if (!n.__tovaOwner) n.__tovaOwner = marker; }
          parent.insertBefore(node, nextSiblingAfterMarker(marker));
          newNodes.push(...nodes);
        } else {
          if (!node.__tovaOwner) node.__tovaOwner = marker;
          newNodes.push(node);
        }
      }
    } else {
      const node = render(newChild);
      if (node.nodeType === 11) {
        const nodes = Array.from(node.childNodes);
        for (const n of nodes) { if (!n.__tovaOwner) n.__tovaOwner = marker; }
        parent.insertBefore(node, nextSiblingAfterMarker(marker));
        newNodes.push(...nodes);
      } else {
        if (!node.__tovaOwner) node.__tovaOwner = marker;
        newNodes.push(node);
      }
    }
  }

  // Remove unused old nodes
  for (const node of oldNodes) {
    if (!usedOld.has(node)) {
      disposeNode(node);
      if (node.parentNode === parent) parent.removeChild(node);
    }
  }

  // LIS-based reorder: compute old positions, find LIS, only move non-LIS nodes
  const oldPosMap = new Map();
  for (let i = 0; i < oldNodes.length; i++) {
    oldPosMap.set(oldNodes[i], i);
  }
  const positions = newNodes.map(n => oldPosMap.has(n) ? oldPosMap.get(n) : -1);
  const lisIndices = new Set(longestIncreasingSubsequence(positions));

  // Insert nodes: only move nodes not in the LIS
  let cursor = marker.nextSibling;
  for (let i = 0; i < newNodes.length; i++) {
    const node = newNodes[i];
    if (lisIndices.has(i) && node === cursor) {
      cursor = node.nextSibling;
    } else {
      parent.insertBefore(node, cursor);
    }
  }

  marker.__tovaNodes = newNodes;
}

// Positional reconciliation within a marker's content range
function patchPositionalInMarker(marker, newChildren) {
  const parent = marker.parentNode;
  const oldNodes = [...marker.__tovaNodes];
  const oldCount = oldNodes.length;
  const newCount = newChildren.length;

  // Patch in place (skip identical vnodes)
  const patchCount = Math.min(oldCount, newCount);
  for (let i = 0; i < patchCount; i++) {
    if (oldNodes[i] === newChildren[i]) continue;
    patchSingle(parent, oldNodes[i], newChildren[i]);
  }

  // Append new children
  const ref = nextSiblingAfterMarker(marker);
  for (let i = oldCount; i < newCount; i++) {
    const rendered = render(newChildren[i]);
    const inserted = insertRendered(parent, rendered, ref, marker);
    oldNodes.push(...inserted);
  }

  // Remove excess children
  for (let i = newCount; i < oldCount; i++) {
    disposeNode(oldNodes[i]);
    if (oldNodes[i].parentNode === parent) parent.removeChild(oldNodes[i]);
  }

  marker.__tovaNodes = oldNodes.slice(0, newCount);
}

// Keyed reconciliation for children of an element (not marker-based)
function patchKeyedChildren(parent, newVNodes) {
  const logical = getLogicalChildren(parent);
  const oldKeyMap = new Map();

  for (const node of logical) {
    const key = getNodeKey(node);
    if (key != null) oldKeyMap.set(key, node);
  }

  const newNodes = [];
  const usedOld = new Set();

  for (const newChild of newVNodes) {
    const key = getKey(newChild);

    if (key != null && oldKeyMap.has(key)) {
      const oldNode = oldKeyMap.get(key);
      usedOld.add(oldNode);

      if (oldNode.nodeType === 1 && newChild.__tova &&
          oldNode.tagName.toLowerCase() === newChild.tag.toLowerCase()) {
        const oldVNode = oldNode.__vnode || { props: {}, children: [] };
        applyProps(oldNode, newChild.props, oldVNode.props);
        patchChildrenOfElement(oldNode, flattenVNodes(newChild.children));
        oldNode.__vnode = newChild;
        newNodes.push(oldNode);
      } else {
        newNodes.push(render(newChild));
      }
    } else {
      newNodes.push(render(newChild));
    }
  }

  // Remove unused old logical nodes
  for (const node of logical) {
    if (!usedOld.has(node) && node.parentNode === parent) {
      removeLogicalNode(parent, node);
    }
  }

  // LIS-based reorder for element children
  const logicalAfterRemove = getLogicalChildren(parent);
  const oldPosMap = new Map();
  for (let i = 0; i < logicalAfterRemove.length; i++) {
    oldPosMap.set(logicalAfterRemove[i], i);
  }
  const positions = newNodes.map(n => oldPosMap.has(n) ? oldPosMap.get(n) : -1);
  const lisIndices = new Set(longestIncreasingSubsequence(positions));

  for (let i = 0; i < newNodes.length; i++) {
    const expected = newNodes[i];
    if (!lisIndices.has(i)) {
      const logicalNow = getLogicalChildren(parent);
      const current = logicalNow[i];
      if (current !== expected) {
        parent.insertBefore(expected, current || null);
      }
    }
  }
}

// Positional reconciliation for children of an element
function patchPositionalChildren(parent, newChildren) {
  const logical = getLogicalChildren(parent);
  const oldCount = logical.length;
  const newCount = newChildren.length;

  for (let i = 0; i < Math.min(oldCount, newCount); i++) {
    patchSingle(parent, logical[i], newChildren[i]);
  }

  for (let i = oldCount; i < newCount; i++) {
    parent.appendChild(render(newChildren[i]));
  }

  // Remove excess logical children
  const currentLogical = getLogicalChildren(parent);
  while (currentLogical.length > newCount) {
    const node = currentLogical.pop();
    removeLogicalNode(parent, node);
  }
}

// Patch children of a regular element
function patchChildrenOfElement(el, newChildren) {
  const hasKeys = newChildren.some(c => getKey(c) != null);
  if (hasKeys) {
    patchKeyedChildren(el, newChildren);
  } else {
    patchPositionalChildren(el, newChildren);
  }
}

// Patch a single logical node in place
function patchSingle(parent, existing, newVNode) {
  if (!existing) {
    parent.appendChild(render(newVNode));
    return;
  }

  if (newVNode === null || newVNode === undefined) {
    removeLogicalNode(parent, existing);
    return;
  }

  // Function vnode — replace with new dynamic block
  if (typeof newVNode === 'function') {
    const rendered = render(newVNode);
    if (existing.__tovaNodes) {
      // Existing is a marker — clear its content and replace
      clearMarkerContent(existing);
      parent.replaceChild(rendered, existing);
    } else {
      disposeNode(existing);
      parent.replaceChild(rendered, existing);
    }
    return;
  }

  // Text
  if (typeof newVNode === 'string' || typeof newVNode === 'number' || typeof newVNode === 'boolean') {
    const text = String(newVNode);
    if (existing.nodeType === 3) {
      if (existing.textContent !== text) existing.textContent = text;
    } else {
      removeLogicalNode(parent, existing);
      parent.insertBefore(document.createTextNode(text), null);
    }
    return;
  }

  if (!newVNode.__tova) {
    const text = String(newVNode);
    if (existing.nodeType === 3) {
      if (existing.textContent !== text) existing.textContent = text;
    } else {
      removeLogicalNode(parent, existing);
      parent.insertBefore(document.createTextNode(text), null);
    }
    return;
  }

  // Fragment — patch marker content
  if (newVNode.tag === '__fragment') {
    if (existing.__tovaFragment) {
      // Patch children within the marker range
      const oldNodes = [...existing.__tovaNodes];
      const newChildren = flattenVNodes(newVNode.children);
      // Simple approach: clear and re-render fragment content
      clearMarkerContent(existing);
      const ref = nextSiblingAfterMarker(existing);
      for (const child of newChildren) {
        const rendered = render(child);
        const inserted = insertRendered(parent, rendered, ref, existing);
        existing.__tovaNodes.push(...inserted);
      }
      existing.__vnode = newVNode;
      return;
    }
    removeLogicalNode(parent, existing);
    parent.appendChild(render(newVNode));
    return;
  }

  // Element — patch in place
  if (existing.nodeType === 1 && newVNode.tag &&
      existing.tagName.toLowerCase() === newVNode.tag.toLowerCase()) {
    const oldVNode = existing.__vnode || { props: {}, children: [] };
    applyProps(existing, newVNode.props, oldVNode.props);
    patchChildrenOfElement(existing, flattenVNodes(newVNode.children));
    existing.__vnode = newVNode;
    return;
  }

  // Different type — full replace
  removeLogicalNode(parent, existing);
  parent.appendChild(render(newVNode));
}

// ─── Hydration (SSR) ─────────────────────────────────────
// SSR renders flat HTML without markers. Hydration attaches reactivity
// to existing DOM nodes and inserts markers for dynamic blocks.

// Dev-mode hydration mismatch detection
function checkHydrationMismatch(domNode, vnode) {
  if (!__DEV__) return;
  if (!domNode || !vnode || !vnode.__tova) return;

  const props = vnode.props || {};

  // Check className
  if (props.className !== undefined) {
    const expected = typeof props.className === 'function' ? props.className() : props.className;
    const actual = domNode.className || '';
    if (expected && actual !== expected) {
      console.warn(`Tova hydration mismatch: <${vnode.tag}> class expected "${expected}" but got "${actual}"`);
    }
  }

  // Check attributes
  for (const [key, value] of Object.entries(props)) {
    if (key === 'key' || key === 'ref' || key === 'className' || key.startsWith('on')) continue;
    if (typeof value === 'function') continue; // reactive props — skip static check

    if (domNode.getAttribute) {
      const attrName = key === 'className' ? 'class' : key;
      const actual = domNode.getAttribute(attrName);
      const expected = String(value);
      if (actual !== null && actual !== expected) {
        console.warn(`Tova hydration mismatch: <${vnode.tag}> attribute "${key}" expected "${expected}" but got "${actual}"`);
      }
    }
  }
}

// Check if a DOM node is an SSR marker comment (<!--tova-s:ID-->)
function isSSRMarker(node) {
  return node && node.nodeType === 8 && typeof node.data === 'string' && node.data.startsWith('tova-s:');
}

// Find the closing SSR marker and collect content nodes between them
function collectSSRMarkerContent(startMarker) {
  const id = startMarker.data.replace('tova-s:', '');
  const closingText = `/tova-s:${id}`;
  const content = [];
  let cursor = startMarker.nextSibling;
  while (cursor) {
    if (cursor.nodeType === 8 && cursor.data === closingText) {
      return { content, endMarker: cursor };
    }
    content.push(cursor);
    cursor = cursor.nextSibling;
  }
  return { content, endMarker: null };
}

function hydrateVNode(domNode, vnode) {
  if (!domNode) return null;
  if (vnode === null || vnode === undefined) return domNode;

  // Function vnode (reactive text, JSXIf, JSXFor)
  if (typeof vnode === 'function') {
    if (domNode.nodeType === 3) {
      // Dev-mode: warn if text content differs
      if (__DEV__) {
        const val = vnode();
        const expected = val == null ? '' : String(val);
        if (domNode.textContent !== expected) {
          console.warn(`Tova hydration mismatch: text expected "${expected}" but got "${domNode.textContent}"`);
        }
      }
      // Reactive text: attach effect to existing text node
      domNode.__tovaReactive = true;
      createEffect(() => {
        const val = vnode();
        const text = val == null ? '' : String(val);
        if (domNode.textContent !== text) domNode.textContent = text;
      });
      return domNode.nextSibling;
    }
    // Complex dynamic block: insert marker-based render, replace SSR node
    const parent = domNode.parentNode;
    const next = domNode.nextSibling;
    const rendered = render(vnode);
    parent.replaceChild(rendered, domNode);
    return next;
  }

  // Primitive text — already correct from SSR
  if (typeof vnode === 'string' || typeof vnode === 'number' || typeof vnode === 'boolean') {
    if (__DEV__ && domNode.nodeType === 3) {
      const expected = String(vnode);
      if (domNode.textContent !== expected) {
        console.warn(`Tova hydration mismatch: text expected "${expected}" but got "${domNode.textContent}"`);
      }
    }
    return domNode.nextSibling;
  }

  // Array
  if (Array.isArray(vnode)) {
    let cursor = domNode;
    for (const child of flattenVNodes(vnode)) {
      if (!cursor) break;
      cursor = hydrateVNode(cursor, child);
    }
    return cursor;
  }

  if (!vnode.__tova) return domNode.nextSibling;

  // Fragment — children rendered inline in SSR (no wrapper)
  if (vnode.tag === '__fragment') {
    const children = flattenVNodes(vnode.children);
    let cursor = domNode;
    for (const child of children) {
      if (!cursor) break;
      cursor = hydrateVNode(cursor, child);
    }
    return cursor;
  }

  // Dynamic node — SSR marker-aware hydration
  if (vnode.tag === '__dynamic' && typeof vnode.compute === 'function') {
    // Check if current domNode is an SSR marker (<!--tova-s:ID-->)
    if (isSSRMarker(domNode)) {
      const { content, endMarker } = collectSSRMarkerContent(domNode);
      const parent = domNode.parentNode;

      // Remove SSR markers and content, replace with reactive marker
      const afterEnd = endMarker ? endMarker.nextSibling : null;
      for (const node of content) {
        if (node.parentNode === parent) parent.removeChild(node);
      }
      if (endMarker && endMarker.parentNode === parent) parent.removeChild(endMarker);

      const rendered = render(vnode);
      parent.replaceChild(rendered, domNode);
      return afterEnd;
    }

    // No SSR marker — fall back to standard behavior
    const parent = domNode.parentNode;
    const next = domNode.nextSibling;
    const rendered = render(vnode);
    parent.replaceChild(rendered, domNode);
    return next;
  }

  // Element — attach event handlers, reactive props, refs
  if (domNode.nodeType === 1 && domNode.tagName.toLowerCase() === vnode.tag.toLowerCase()) {
    if (__DEV__) checkHydrationMismatch(domNode, vnode);
    hydrateProps(domNode, vnode.props);
    domNode.__vnode = vnode;

    const children = flattenVNodes(vnode.children || []);
    let cursor = domNode.firstChild;
    for (const child of children) {
      if (!cursor) break;
      cursor = hydrateVNode(cursor, child);
    }
    return domNode.nextSibling;
  }

  // Tag mismatch — fall back to full render
  if (__DEV__) {
    const expectedTag = vnode.tag || '(unknown)';
    const actualTag = domNode.tagName ? domNode.tagName.toLowerCase() : `nodeType:${domNode.nodeType}`;
    console.warn(`Tova hydration mismatch: expected <${expectedTag}> but got <${actualTag}>, falling back to full render`);
  }
  const parent = domNode.parentNode;
  const next = domNode.nextSibling;
  const rendered = render(vnode);
  parent.replaceChild(rendered, domNode);
  return next;
}

function hydrateProps(el, props) {
  for (const [key, value] of Object.entries(props)) {
    if (key === 'ref') {
      if (typeof value === 'object' && value !== null && 'current' in value) {
        value.current = el;
      } else if (typeof value === 'function') {
        value(el);
      }
    } else if (key.startsWith('on')) {
      const eventName = key.slice(2).toLowerCase();
      if (typeof value === 'object' && value !== null && value.handler) {
        el.addEventListener(eventName, value.handler, value.options);
        if (!el.__handlers) el.__handlers = {};
        el.__handlers[eventName] = value.handler;
        el.__handlerOptions = el.__handlerOptions || {};
        el.__handlerOptions[eventName] = value.options;
      } else {
        el.addEventListener(eventName, value);
        if (!el.__handlers) el.__handlers = {};
        el.__handlers[eventName] = value;
      }
    } else if (key === 'key') {
      // Skip
    } else if (typeof value === 'function' && !key.startsWith('on')) {
      createEffect(() => {
        const val = value();
        applyPropValue(el, key, val);
      });
    }
  }
}

export function hydrate(component, container) {
  if (!container) {
    console.error('Tova: Hydration target not found');
    return;
  }

  const startTime = typeof performance !== 'undefined' ? performance.now() : 0;

  const result = createRoot(() => {
    const vnode = typeof component === 'function' ? component() : component;
    if (container.firstChild) {
      hydrateVNode(container.firstChild, vnode);
    }
  });

  // Dispatch hydration completion event
  const duration = typeof performance !== 'undefined' ? performance.now() - startTime : 0;
  if (typeof CustomEvent !== 'undefined' && typeof container.dispatchEvent === 'function') {
    container.dispatchEvent(new CustomEvent('tova:hydrated', { detail: { duration }, bubbles: true }));
  }

  if (__devtools_hooks && __devtools_hooks.onHydrate) {
    __devtools_hooks.onHydrate({ duration });
  }

  return result;
}

export function mount(component, container) {
  if (!container) {
    console.error('Tova: Mount target not found');
    return;
  }

  const result = createRoot((dispose) => {
    const vnode = typeof component === 'function' ? component() : component;
    container.innerHTML = '';
    container.appendChild(render(vnode));
    return dispose;
  });

  if (__devtools_hooks && __devtools_hooks.onMount) {
    __devtools_hooks.onMount();
  }

  return result;
}

// ─── Progressive Hydration ──────────────────────────────────
// Hydrate a component only when it becomes visible in the viewport.

export function hydrateWhenVisible(component, domNode, options = {}) {
  if (typeof IntersectionObserver === 'undefined') {
    // Fallback: hydrate immediately
    return hydrate(component, domNode);
  }

  const { rootMargin = '200px' } = options;
  let hydrated = false;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !hydrated) {
          hydrated = true;
          observer.disconnect();
          hydrate(component, domNode);
        }
      }
    },
    { rootMargin },
  );

  observer.observe(domNode);

  return () => {
    observer.disconnect();
  };
}
