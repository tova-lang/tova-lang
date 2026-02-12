const __clientHTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>Lux App</title>\n  <style>\n    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }\n    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #1a1a1a; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }\n    #app { max-width: 520px; margin: 0 auto; padding: 2rem 1rem; }\n    .app { background: white; border-radius: 16px; padding: 2rem; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }\n    header { text-align: center; margin-bottom: 1.5rem; }\n    h1 { font-size: 2rem; margin-bottom: 0.25rem; color: #333; }\n    h2 { font-size: 1.2rem; margin-bottom: 0.75rem; color: #555; }\n    .subtitle { font-size: 0.9rem; color: #888; letter-spacing: 0.1em; text-transform: uppercase; }\n    button { cursor: pointer; padding: 0.5rem 1rem; border: 1px solid #ddd; border-radius: 8px; background: white; font-size: 0.9rem; transition: all 0.15s; }\n    button:hover { background: #f0f0f0; transform: translateY(-1px); }\n    button:active { transform: translateY(0); }\n    input[type=\"text\"] { padding: 0.6rem 0.75rem; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 0.9rem; width: 100%; outline: none; transition: border-color 0.2s; }\n    input[type=\"text\"]:focus { border-color: #667eea; }\n    ul { list-style: none; }\n    .done { text-decoration: line-through; opacity: 0.5; }\n    .timer-section { text-align: center; padding: 1.5rem; margin-bottom: 1.5rem; background: #f8f9ff; border-radius: 12px; }\n    .timer-label { font-size: 0.85rem; color: #888; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.25rem; }\n    .timer-display { font-size: 3.5rem; font-weight: 700; font-variant-numeric: tabular-nums; color: #333; margin-bottom: 0.75rem; font-family: 'SF Mono', 'Fira Code', monospace; }\n    .timer-controls { display: flex; gap: 0.5rem; justify-content: center; margin-bottom: 0.75rem; }\n    .timer-controls button { min-width: 80px; }\n    .btn-start { background: #667eea !important; color: white !important; border-color: #667eea !important; }\n    .btn-start:hover { background: #5a6fd6 !important; }\n    .btn-pause { background: #f59e0b !important; color: white !important; border-color: #f59e0b !important; }\n    .btn-add { background: #667eea; color: white; border-color: #667eea; white-space: nowrap; }\n    .btn-add:hover { background: #5a6fd6; }\n    .pomodoro-total { font-size: 0.85rem; color: #888; }\n    .task-section { border-top: 1px solid #eee; padding-top: 1.5rem; }\n    .input-row { display: flex; gap: 0.5rem; margin-bottom: 1rem; }\n    .task-list { margin-bottom: 1rem; }\n    .task-item { display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0; border-bottom: 1px solid #f0f0f0; }\n    .task-content { display: flex; align-items: center; gap: 0.5rem; flex: 1; }\n    .check-btn { background: none !important; border: none !important; padding: 0.25rem !important; font-size: 1.1rem; min-width: auto !important; }\n    .task-title { flex: 1; cursor: pointer; }\n    .delete-btn { background: none !important; border: none !important; color: #ccc; font-size: 1.2rem; padding: 0.25rem !important; min-width: auto !important; }\n    .delete-btn:hover { color: #e74c3c !important; }\n    .stats { text-align: center; font-size: 0.85rem; color: #888; }\n    .active { background: #f0f4ff; border-radius: 6px; padding-left: 0.5rem !important; }\n  </style>\n</head>\n<body>\n  <div id=\"app\"></div>\n  <script>\n// ── Lux Runtime: Reactivity ──\n// Fine-grained reactivity system for Lux (signals-based)\n\nlet currentEffect = null;\nconst effectStack = [];\n\n// ─── Ownership System ─────────────────────────────────────\nlet currentOwner = null;\nconst ownerStack = [];\n\n// ─── Batching ────────────────────────────────────────────\n// Default: synchronous flush after each setter (backward compatible).\n// Inside batch(): effects are deferred and flushed once when batch ends.\n// This means setA(1); setB(2) causes 2 runs by default, but\n// batch(() => { setA(1); setB(2); }) causes only 1 run.\n\nlet pendingEffects = new Set();\nlet batchDepth = 0;\nlet flushing = false;\n\nfunction flush() {\n  if (flushing) return; // prevent re-entrant flush\n  flushing = true;\n  let iterations = 0;\n  try {\n    while (pendingEffects.size > 0) {\n      if (++iterations > 100) {\n        console.error('Lux: Possible infinite loop in reactive updates (>100 flush iterations). Aborting.');\n        pendingEffects.clear();\n        break;\n      }\n      const toRun = [...pendingEffects];\n      pendingEffects.clear();\n      for (const effect of toRun) {\n        if (!effect._disposed) {\n          effect();\n        }\n      }\n    }\n  } finally {\n    flushing = false;\n  }\n}\n\nfunction batch(fn) {\n  batchDepth++;\n  try {\n    fn();\n  } finally {\n    batchDepth--;\n    if (batchDepth === 0) {\n      flush();\n    }\n  }\n}\n\n// ─── Ownership Root ──────────────────────────────────────\n\nfunction createRoot(fn) {\n  const root = {\n    _children: [],\n    _disposed: false,\n    _cleanups: [],\n    _contexts: null,\n    _owner: currentOwner,\n    dispose() {\n      if (root._disposed) return;\n      root._disposed = true;\n      // Dispose children in reverse order\n      for (let i = root._children.length - 1; i >= 0; i--) {\n        const child = root._children[i];\n        if (typeof child.dispose === 'function') child.dispose();\n      }\n      root._children.length = 0;\n      // Run cleanups in reverse order\n      for (let i = root._cleanups.length - 1; i >= 0; i--) {\n        try { root._cleanups[i](); } catch (e) { console.error('Lux: root cleanup error:', e); }\n      }\n      root._cleanups.length = 0;\n    }\n  };\n  ownerStack.push(currentOwner);\n  currentOwner = root;\n  try {\n    return fn(root.dispose.bind(root));\n  } finally {\n    currentOwner = ownerStack.pop();\n  }\n}\n\n// ─── Dependency Cleanup ──────────────────────────────────\n\nfunction cleanupDeps(subscriber) {\n  if (subscriber._deps) {\n    for (const depSet of subscriber._deps) {\n      depSet.delete(subscriber);\n    }\n    subscriber._deps.clear();\n  }\n}\n\nfunction trackDep(subscriber, subscriberSet) {\n  subscriberSet.add(subscriber);\n  if (!subscriber._deps) subscriber._deps = new Set();\n  subscriber._deps.add(subscriberSet);\n}\n\n// ─── Signals ─────────────────────────────────────────────\n\nfunction createSignal(initialValue) {\n  let value = initialValue;\n  const subscribers = new Set();\n\n  function getter() {\n    if (currentEffect) {\n      trackDep(currentEffect, subscribers);\n    }\n    return value;\n  }\n\n  function setter(newValue) {\n    if (typeof newValue === 'function') {\n      newValue = newValue(value);\n    }\n    if (value !== newValue) {\n      value = newValue;\n      for (const sub of [...subscribers]) {\n        if (sub._isComputed) {\n          sub(); // propagate dirty flags synchronously through computed graph\n        } else {\n          pendingEffects.add(sub);\n        }\n      }\n      if (batchDepth === 0) {\n        flush();\n      }\n    }\n  }\n\n  return [getter, setter];\n}\n\n// ─── Effects ─────────────────────────────────────────────\n\nfunction runCleanups(effect) {\n  if (effect._cleanup) {\n    try { effect._cleanup(); } catch (e) { console.error('Lux: cleanup error:', e); }\n    effect._cleanup = null;\n  }\n  if (effect._cleanups && effect._cleanups.length > 0) {\n    for (const cb of effect._cleanups) {\n      try { cb(); } catch (e) { console.error('Lux: cleanup error:', e); }\n    }\n    effect._cleanups = [];\n  }\n}\n\nfunction createEffect(fn) {\n  function effect() {\n    if (effect._running) return;\n    if (effect._disposed) return;\n    effect._running = true;\n\n    // Run cleanups from previous execution\n    runCleanups(effect);\n\n    // Remove from all previous dependency subscriber sets\n    cleanupDeps(effect);\n\n    effectStack.push(effect);\n    currentEffect = effect;\n    try {\n      const result = fn();\n      // If effect returns a function, use as cleanup\n      if (typeof result === 'function') {\n        effect._cleanup = result;\n      }\n    } catch (e) {\n      console.error('Lux: Error in effect:', e);\n      if (currentErrorHandler) {\n        currentErrorHandler(e);\n      }\n    } finally {\n      effectStack.pop();\n      currentEffect = effectStack[effectStack.length - 1] || null;\n      effect._running = false;\n    }\n  }\n\n  effect._deps = new Set();\n  effect._running = false;\n  effect._disposed = false;\n  effect._cleanup = null;\n  effect._cleanups = [];\n  effect._owner = currentOwner;\n\n  if (currentOwner && !currentOwner._disposed) {\n    currentOwner._children.push(effect);\n  }\n\n  effect.dispose = function () {\n    effect._disposed = true;\n    runCleanups(effect);\n    cleanupDeps(effect);\n    pendingEffects.delete(effect);\n    // Remove from owner's children\n    if (effect._owner) {\n      const idx = effect._owner._children.indexOf(effect);\n      if (idx >= 0) effect._owner._children.splice(idx, 1);\n    }\n  };\n\n  // Run immediately (synchronous first run)\n  effect();\n  return effect;\n}\n\n// ─── Computed (lazy/pull-based for glitch-free reads) ────\n\nfunction createComputed(fn) {\n  let value;\n  let dirty = true;\n  const subscribers = new Set();\n\n  // notify is called synchronously when a source signal changes.\n  // It marks the computed dirty and propagates to downstream subscribers.\n  function notify() {\n    if (!dirty) {\n      dirty = true;\n      for (const sub of [...subscribers]) {\n        if (sub._isComputed) {\n          sub(); // cascade dirty flags synchronously\n        } else {\n          pendingEffects.add(sub);\n        }\n      }\n    }\n  }\n\n  notify._deps = new Set();\n  notify._disposed = false;\n  notify._isComputed = true;\n  notify._owner = currentOwner;\n\n  if (currentOwner && !currentOwner._disposed) {\n    currentOwner._children.push(notify);\n  }\n\n  notify.dispose = function () {\n    notify._disposed = true;\n    cleanupDeps(notify);\n    if (notify._owner) {\n      const idx = notify._owner._children.indexOf(notify);\n      if (idx >= 0) notify._owner._children.splice(idx, 1);\n    }\n  };\n\n  function recompute() {\n    cleanupDeps(notify);\n\n    effectStack.push(notify);\n    currentEffect = notify;\n    try {\n      value = fn();\n      dirty = false;\n    } finally {\n      effectStack.pop();\n      currentEffect = effectStack[effectStack.length - 1] || null;\n    }\n  }\n\n  // Initial computation\n  recompute();\n\n  function getter() {\n    if (currentEffect) {\n      trackDep(currentEffect, subscribers);\n    }\n    if (dirty) {\n      recompute();\n    }\n    return value;\n  }\n\n  return getter;\n}\n\n// ─── Lifecycle Hooks ─────────────────────────────────────\n\nfunction onMount(fn) {\n  const owner = currentOwner;\n  queueMicrotask(() => {\n    const result = fn();\n    if (typeof result === 'function' && owner && !owner._disposed) {\n      owner._cleanups.push(result);\n    }\n  });\n}\n\nfunction onUnmount(fn) {\n  if (currentOwner && !currentOwner._disposed) {\n    currentOwner._cleanups.push(fn);\n  }\n}\n\nfunction onCleanup(fn) {\n  if (currentEffect) {\n    if (!currentEffect._cleanups) currentEffect._cleanups = [];\n    currentEffect._cleanups.push(fn);\n  }\n}\n\n// ─── Untrack ─────────────────────────────────────────────\n// Run a function without tracking any signal reads (opt out of reactivity)\n\nfunction untrack(fn) {\n  const prev = currentEffect;\n  currentEffect = null;\n  try {\n    return fn();\n  } finally {\n    currentEffect = prev;\n  }\n}\n\n// ─── Watch ───────────────────────────────────────────────\n// Watch a reactive expression, calling callback with (newValue, oldValue)\n// Returns a dispose function to stop watching.\n\nfunction watch(getter, callback, options = {}) {\n  let oldValue = undefined;\n  let initialized = false;\n\n  const effect = createEffect(() => {\n    const newValue = getter();\n    if (initialized) {\n      callback(newValue, oldValue);\n    } else if (options.immediate) {\n      callback(newValue, undefined);\n    }\n    oldValue = newValue;\n    initialized = true;\n  });\n\n  return effect.dispose ? effect.dispose.bind(effect) : () => {\n    effect._disposed = true;\n    runCleanups(effect);\n    cleanupDeps(effect);\n    pendingEffects.delete(effect);\n  };\n}\n\n// ─── Refs ────────────────────────────────────────────────\n\nfunction createRef(initialValue) {\n  return { current: initialValue !== undefined ? initialValue : null };\n}\n\n// ─── Error Boundaries ────────────────────────────────────\n\nlet currentErrorHandler = null;\n\nfunction createErrorBoundary() {\n  const [error, setError] = createSignal(null);\n\n  function run(fn) {\n    const prev = currentErrorHandler;\n    currentErrorHandler = (e) => setError(e);\n    try {\n      return fn();\n    } catch (e) {\n      setError(e);\n      return null;\n    } finally {\n      currentErrorHandler = prev;\n    }\n  }\n\n  function reset() {\n    setError(null);\n  }\n\n  return { error, run, reset };\n}\n\nfunction ErrorBoundary({ fallback, children }) {\n  const [error, setError] = createSignal(null);\n\n  const prev = currentErrorHandler;\n  currentErrorHandler = (e) => setError(e);\n\n  // Return a reactive wrapper that switches between children and fallback\n  // The __lux_dynamic marker tells the renderer to create an effect for this node\n  const childContent = children && children.length === 1 ? children[0] : lux_fragment(children || []);\n\n  currentErrorHandler = prev;\n\n  return {\n    __lux: true,\n    tag: '__dynamic',\n    props: {},\n    children: [],\n    compute: () => {\n      const err = error();\n      if (err) {\n        return typeof fallback === 'function'\n          ? fallback({ error: err, reset: () => setError(null) })\n          : fallback;\n      }\n      return childContent;\n    },\n  };\n}\n\n// ─── Dynamic Component ──────────────────────────────────\n// Renders a component dynamically based on a reactive signal.\n// Usage: Dynamic({ component: mySignal, ...props })\n\nfunction Dynamic({ component, ...rest }) {\n  return {\n    __lux: true,\n    tag: '__dynamic',\n    props: {},\n    children: [],\n    compute: () => {\n      const comp = typeof component === 'function' && !component.__lux ? component() : component;\n      if (!comp) return null;\n      if (typeof comp === 'function') {\n        return comp(rest);\n      }\n      return comp;\n    },\n  };\n}\n\n// ─── Portal ─────────────────────────────────────────────\n// Renders children into a different DOM target.\n// Usage: Portal({ target: \"#modal-root\", children })\n\nfunction Portal({ target, children }) {\n  return {\n    __lux: true,\n    tag: '__portal',\n    props: { target },\n    children: children || [],\n  };\n}\n\n// ─── Lazy ───────────────────────────────────────────────\n// Async component loading with optional fallback.\n// Usage: const LazyComp = lazy(() => import('./HeavyComponent.js'))\n\nfunction lazy(loader) {\n  let resolved = null;\n  let promise = null;\n\n  return function LazyWrapper(props) {\n    if (resolved) {\n      return resolved(props);\n    }\n\n    const [comp, setComp] = createSignal(null);\n    const [err, setErr] = createSignal(null);\n\n    if (!promise) {\n      promise = loader()\n        .then(mod => {\n          resolved = mod.default || mod;\n          setComp(() => resolved);\n        })\n        .catch(e => setErr(e));\n    }\n\n    return {\n      __lux: true,\n      tag: '__dynamic',\n      props: {},\n      children: [],\n      compute: () => {\n        const e = err();\n        if (e) return lux_el('span', { className: 'lux-error' }, [String(e)]);\n        const c = comp();\n        if (c) return c(props);\n        // Fallback while loading\n        return props && props.fallback ? props.fallback : null;\n      },\n    };\n  };\n}\n\n// ─── Context (Provide/Inject) ────────────────────────────\n// Tree-based: values are stored on the ownership tree, inject walks up.\n\nfunction createContext(defaultValue) {\n  const id = Symbol('context');\n  return { _id: id, _default: defaultValue };\n}\n\nfunction provide(context, value) {\n  const owner = currentOwner;\n  if (owner) {\n    if (!owner._contexts) owner._contexts = new Map();\n    owner._contexts.set(context._id, value);\n  }\n}\n\nfunction inject(context) {\n  let owner = currentOwner;\n  while (owner) {\n    if (owner._contexts && owner._contexts.has(context._id)) {\n      return owner._contexts.get(context._id);\n    }\n    owner = owner._owner;\n  }\n  return context._default;\n}\n\n// ─── DOM Rendering ────────────────────────────────────────\n\n// Inject scoped CSS into the page (idempotent — only injects once per id)\nconst __luxInjectedStyles = new Set();\nfunction lux_inject_css(id, css) {\n  if (__luxInjectedStyles.has(id)) return;\n  __luxInjectedStyles.add(id);\n  const style = document.createElement('style');\n  style.setAttribute('data-lux-style', id);\n  style.textContent = css;\n  document.head.appendChild(style);\n}\n\nfunction lux_el(tag, props = {}, children = []) {\n  return { __lux: true, tag, props, children };\n}\n\nfunction lux_fragment(children) {\n  return { __lux: true, tag: '__fragment', props: {}, children };\n}\n\n// Inject a key prop into a vnode for keyed reconciliation\nfunction lux_keyed(key, vnode) {\n  if (vnode && vnode.__lux) {\n    vnode.props = { ...vnode.props, key };\n  }\n  return vnode;\n}\n\n// Flatten nested arrays and vnodes into a flat list of vnodes\nfunction flattenVNodes(children) {\n  const result = [];\n  for (const child of children) {\n    if (child === null || child === undefined) {\n      continue;\n    } else if (Array.isArray(child)) {\n      result.push(...flattenVNodes(child));\n    } else {\n      result.push(child);\n    }\n  }\n  return result;\n}\n\n// ─── Marker-based DOM helpers ─────────────────────────────\n// Instead of wrapping dynamic blocks/fragments in <span style=\"display:contents\">,\n// we use comment node markers. A marker's __luxNodes tracks its content nodes.\n// Content nodes have __luxOwner pointing to their owning marker.\n\n// Recursively dispose ownership roots attached to a DOM subtree\nfunction disposeNode(node) {\n  if (!node) return;\n  if (node.__luxRoot) {\n    node.__luxRoot();\n    node.__luxRoot = null;\n  }\n  // If this is a marker, dispose and remove its content nodes\n  if (node.__luxNodes) {\n    for (const cn of node.__luxNodes) {\n      disposeNode(cn);\n      if (cn.parentNode) cn.parentNode.removeChild(cn);\n    }\n    node.__luxNodes = [];\n  }\n  if (node.childNodes) {\n    for (const child of Array.from(node.childNodes)) {\n      disposeNode(child);\n    }\n  }\n}\n\n// Check if a node is transitively owned by a marker (walks __luxOwner chain)\nfunction isOwnedBy(node, marker) {\n  let owner = node.__luxOwner;\n  while (owner) {\n    if (owner === marker) return true;\n    owner = owner.__luxOwner;\n  }\n  return false;\n}\n\n// Get logical children of a parent element (skips marker content nodes)\nfunction getLogicalChildren(parent) {\n  const logical = [];\n  for (let i = 0; i < parent.childNodes.length; i++) {\n    const node = parent.childNodes[i];\n    if (!node.__luxOwner) {\n      logical.push(node);\n    }\n  }\n  return logical;\n}\n\n// Find the first DOM sibling after all of a marker's content\nfunction nextSiblingAfterMarker(marker) {\n  if (!marker.__luxNodes || marker.__luxNodes.length === 0) {\n    return marker.nextSibling;\n  }\n  let last = marker.__luxNodes[marker.__luxNodes.length - 1];\n  // If last content is itself a marker, recurse to find physical end\n  while (last && last.__luxNodes && last.__luxNodes.length > 0) {\n    last = last.__luxNodes[last.__luxNodes.length - 1];\n  }\n  return last ? last.nextSibling : marker.nextSibling;\n}\n\n// Remove a logical node (marker + its content, or a regular node) from the DOM\nfunction removeLogicalNode(parent, node) {\n  disposeNode(node);\n  if (node.parentNode === parent) parent.removeChild(node);\n}\n\n// Insert rendered result (could be single node or DocumentFragment) before ref,\n// setting __luxOwner on top-level inserted nodes. Returns array of inserted nodes.\nfunction insertRendered(parent, rendered, ref, owner) {\n  if (rendered.nodeType === 11) {\n    const nodes = Array.from(rendered.childNodes);\n    for (const n of nodes) {\n      if (!n.__luxOwner) n.__luxOwner = owner;\n    }\n    parent.insertBefore(rendered, ref);\n    return nodes;\n  }\n  if (!rendered.__luxOwner) rendered.__luxOwner = owner;\n  parent.insertBefore(rendered, ref);\n  return [rendered];\n}\n\n// Clear a marker's content from the DOM and reset __luxNodes\nfunction clearMarkerContent(marker) {\n  for (const node of marker.__luxNodes) {\n    disposeNode(node);\n    if (node.parentNode) node.parentNode.removeChild(node);\n  }\n  marker.__luxNodes = [];\n}\n\n// ─── Render ───────────────────────────────────────────────\n\n// Create real DOM nodes from a vnode (with fine-grained reactive bindings).\n// Returns a single DOM node for elements/text, or a DocumentFragment for\n// markers (dynamic blocks, fragments) containing [marker, ...content].\nfunction render(vnode) {\n  if (vnode === null || vnode === undefined) {\n    return document.createTextNode('');\n  }\n\n  // Reactive dynamic block (JSXIf, JSXFor, reactive text, etc.)\n  if (typeof vnode === 'function') {\n    const marker = document.createComment('');\n    marker.__luxDynamic = true;\n    marker.__luxNodes = [];\n\n    const frag = document.createDocumentFragment();\n    frag.appendChild(marker);\n\n    createEffect(() => {\n      const val = vnode();\n      const parent = marker.parentNode;\n      const ref = nextSiblingAfterMarker(marker);\n\n      // Array: keyed or positional reconciliation within marker range\n      if (Array.isArray(val)) {\n        const flat = flattenVNodes(val);\n        const hasKeys = flat.some(c => getKey(c) != null);\n        if (hasKeys) {\n          patchKeyedInMarker(marker, flat);\n        } else {\n          patchPositionalInMarker(marker, flat);\n        }\n        return;\n      }\n\n      // Text: optimize single text node update in place\n      if (val == null || typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {\n        const text = val == null ? '' : String(val);\n        if (marker.__luxNodes.length === 1 && marker.__luxNodes[0].nodeType === 3) {\n          if (marker.__luxNodes[0].textContent !== text) {\n            marker.__luxNodes[0].textContent = text;\n          }\n          return;\n        }\n        clearMarkerContent(marker);\n        const textNode = document.createTextNode(text);\n        textNode.__luxOwner = marker;\n        parent.insertBefore(textNode, ref);\n        marker.__luxNodes = [textNode];\n        return;\n      }\n\n      // Vnode or other: clear and re-render\n      clearMarkerContent(marker);\n      if (val && val.__lux) {\n        const rendered = render(val);\n        marker.__luxNodes = insertRendered(parent, rendered, ref, marker);\n      } else {\n        const textNode = document.createTextNode(String(val));\n        textNode.__luxOwner = marker;\n        parent.insertBefore(textNode, ref);\n        marker.__luxNodes = [textNode];\n      }\n    });\n\n    return frag;\n  }\n\n  if (typeof vnode === 'string' || typeof vnode === 'number' || typeof vnode === 'boolean') {\n    return document.createTextNode(String(vnode));\n  }\n\n  if (Array.isArray(vnode)) {\n    const fragment = document.createDocumentFragment();\n    for (const child of vnode) {\n      fragment.appendChild(render(child));\n    }\n    return fragment;\n  }\n\n  if (!vnode.__lux) {\n    return document.createTextNode(String(vnode));\n  }\n\n  // Fragment — marker + children (no wrapper element)\n  if (vnode.tag === '__fragment') {\n    const marker = document.createComment('');\n    marker.__luxFragment = true;\n    marker.__luxNodes = [];\n    marker.__vnode = vnode;\n\n    const frag = document.createDocumentFragment();\n    frag.appendChild(marker);\n\n    for (const child of flattenVNodes(vnode.children)) {\n      const rendered = render(child);\n      const inserted = insertRendered(frag, rendered, null, marker);\n      marker.__luxNodes.push(...inserted);\n    }\n\n    return frag;\n  }\n\n  // Dynamic reactive node (ErrorBoundary, Dynamic component, etc.)\n  if (vnode.tag === '__dynamic' && typeof vnode.compute === 'function') {\n    const marker = document.createComment('');\n    marker.__luxDynamic = true;\n    marker.__luxNodes = [];\n\n    const frag = document.createDocumentFragment();\n    frag.appendChild(marker);\n\n    let prevDispose = null;\n    createEffect(() => {\n      const inner = vnode.compute();\n      const parent = marker.parentNode;\n      const ref = nextSiblingAfterMarker(marker);\n\n      if (prevDispose) {\n        prevDispose();\n        prevDispose = null;\n      }\n      clearMarkerContent(marker);\n\n      createRoot((dispose) => {\n        prevDispose = dispose;\n        const rendered = render(inner);\n        marker.__luxNodes = insertRendered(parent, rendered, ref, marker);\n      });\n    });\n\n    return frag;\n  }\n\n  // Portal — render children into a different DOM target\n  if (vnode.tag === '__portal') {\n    const placeholder = document.createComment('portal');\n    const targetSelector = vnode.props.target;\n    queueMicrotask(() => {\n      const targetEl = typeof targetSelector === 'string'\n        ? document.querySelector(targetSelector)\n        : targetSelector;\n      if (targetEl) {\n        for (const child of flattenVNodes(vnode.children)) {\n          targetEl.appendChild(render(child));\n        }\n      }\n    });\n    return placeholder;\n  }\n\n  // Element\n  const el = document.createElement(vnode.tag);\n  applyReactiveProps(el, vnode.props);\n\n  // Render children\n  for (const child of flattenVNodes(vnode.children)) {\n    el.appendChild(render(child));\n  }\n\n  // Store vnode reference for patching\n  el.__vnode = vnode;\n\n  return el;\n}\n\n// Apply reactive props — function-valued props get their own effect\nfunction applyReactiveProps(el, props) {\n  for (const [key, value] of Object.entries(props)) {\n    if (key === 'ref') {\n      if (typeof value === 'object' && value !== null && 'current' in value) {\n        value.current = el;\n      } else if (typeof value === 'function') {\n        value(el);\n      }\n    } else if (key.startsWith('on')) {\n      const eventName = key.slice(2).toLowerCase();\n      el.addEventListener(eventName, value);\n      if (!el.__handlers) el.__handlers = {};\n      el.__handlers[eventName] = value;\n    } else if (key === 'key') {\n      // Skip\n    } else if (typeof value === 'function' && !key.startsWith('on')) {\n      // Reactive prop — create effect for fine-grained updates\n      createEffect(() => {\n        const val = value();\n        applyPropValue(el, key, val);\n      });\n    } else {\n      applyPropValue(el, key, value);\n    }\n  }\n}\n\nfunction applyPropValue(el, key, val) {\n  if (key === 'className') {\n    if (el.className !== val) el.className = val || '';\n  } else if (key === 'innerHTML' || key === 'dangerouslySetInnerHTML') {\n    const html = typeof val === 'object' && val !== null ? val.__html || '' : val || '';\n    if (el.innerHTML !== html) el.innerHTML = html;\n  } else if (key === 'value') {\n    if (el !== document.activeElement && el.value !== val) {\n      el.value = val;\n    }\n  } else if (key === 'checked') {\n    el.checked = !!val;\n  } else if (key === 'disabled' || key === 'readOnly' || key === 'hidden') {\n    el[key] = !!val;\n  } else if (key === 'style' && typeof val === 'object') {\n    Object.assign(el.style, val);\n  } else {\n    const s = val == null ? '' : String(val);\n    if (el.getAttribute(key) !== s) {\n      el.setAttribute(key, s);\n    }\n  }\n}\n\n// Apply/update props on a DOM element (used by patcher for full-tree mode)\nfunction applyProps(el, newProps, oldProps) {\n  // Remove old props that are no longer present\n  for (const key of Object.keys(oldProps)) {\n    if (!(key in newProps)) {\n      if (key.startsWith('on')) {\n        const eventName = key.slice(2).toLowerCase();\n        if (el.__handlers && el.__handlers[eventName]) {\n          el.removeEventListener(eventName, el.__handlers[eventName]);\n          delete el.__handlers[eventName];\n        }\n      } else if (key === 'className') {\n        el.className = '';\n      } else if (key === 'style') {\n        el.removeAttribute('style');\n      } else {\n        el.removeAttribute(key);\n      }\n    }\n  }\n\n  // Apply new props\n  for (const [key, value] of Object.entries(newProps)) {\n    if (key === 'className') {\n      const val = typeof value === 'function' ? value() : value;\n      if (el.className !== val) el.className = val;\n    } else if (key === 'ref') {\n      if (typeof value === 'object' && value !== null && 'current' in value) {\n        value.current = el;\n      } else if (typeof value === 'function') {\n        value(el);\n      }\n    } else if (key.startsWith('on')) {\n      const eventName = key.slice(2).toLowerCase();\n      const oldHandler = el.__handlers && el.__handlers[eventName];\n      if (oldHandler !== value) {\n        if (oldHandler) el.removeEventListener(eventName, oldHandler);\n        el.addEventListener(eventName, value);\n        if (!el.__handlers) el.__handlers = {};\n        el.__handlers[eventName] = value;\n      }\n    } else if (key === 'style' && typeof value === 'object') {\n      Object.assign(el.style, value);\n    } else if (key === 'key') {\n      // Skip\n    } else if (key === 'value') {\n      const val = typeof value === 'function' ? value() : value;\n      if (el !== document.activeElement && el.value !== val) {\n        el.value = val;\n      }\n    } else if (key === 'checked') {\n      el.checked = !!value;\n    } else {\n      const val = typeof value === 'function' ? value() : value;\n      if (el.getAttribute(key) !== String(val)) {\n        el.setAttribute(key, val);\n      }\n    }\n  }\n}\n\n// ─── Keyed Reconciliation ────────────────────────────────\n\nfunction getKey(vnode) {\n  if (vnode && vnode.__lux && vnode.props) return vnode.props.key;\n  return undefined;\n}\n\nfunction getNodeKey(node) {\n  if (node && node.__vnode && node.__vnode.props) return node.__vnode.props.key;\n  return undefined;\n}\n\n// Keyed reconciliation within a marker's content range\nfunction patchKeyedInMarker(marker, newVNodes) {\n  const parent = marker.parentNode;\n  const oldNodes = [...marker.__luxNodes];\n  const oldKeyMap = new Map();\n\n  for (const node of oldNodes) {\n    const key = getNodeKey(node);\n    if (key != null) oldKeyMap.set(key, node);\n  }\n\n  const newNodes = [];\n  const usedOld = new Set();\n\n  for (const newChild of newVNodes) {\n    const key = getKey(newChild);\n\n    if (key != null && oldKeyMap.has(key)) {\n      const oldNode = oldKeyMap.get(key);\n      usedOld.add(oldNode);\n\n      if (oldNode.nodeType === 1 && newChild.__lux &&\n          oldNode.tagName.toLowerCase() === newChild.tag.toLowerCase()) {\n        const oldVNode = oldNode.__vnode || { props: {}, children: [] };\n        applyProps(oldNode, newChild.props, oldVNode.props);\n        patchChildrenOfElement(oldNode, flattenVNodes(newChild.children));\n        oldNode.__vnode = newChild;\n        newNodes.push(oldNode);\n      } else {\n        const node = render(newChild);\n        // render may return Fragment — collect nodes\n        if (node.nodeType === 11) {\n          const nodes = Array.from(node.childNodes);\n          for (const n of nodes) { if (!n.__luxOwner) n.__luxOwner = marker; }\n          parent.insertBefore(node, nextSiblingAfterMarker(marker));\n          newNodes.push(...nodes);\n        } else {\n          if (!node.__luxOwner) node.__luxOwner = marker;\n          newNodes.push(node);\n        }\n      }\n    } else {\n      const node = render(newChild);\n      if (node.nodeType === 11) {\n        const nodes = Array.from(node.childNodes);\n        for (const n of nodes) { if (!n.__luxOwner) n.__luxOwner = marker; }\n        parent.insertBefore(node, nextSiblingAfterMarker(marker));\n        newNodes.push(...nodes);\n      } else {\n        if (!node.__luxOwner) node.__luxOwner = marker;\n        newNodes.push(node);\n      }\n    }\n  }\n\n  // Remove unused old nodes\n  for (const node of oldNodes) {\n    if (!usedOld.has(node)) {\n      disposeNode(node);\n      if (node.parentNode === parent) parent.removeChild(node);\n    }\n  }\n\n  // Arrange in correct order after marker using cursor approach\n  let cursor = marker.nextSibling;\n  for (const node of newNodes) {\n    if (node === cursor) {\n      cursor = node.nextSibling;\n    } else {\n      parent.insertBefore(node, cursor);\n    }\n  }\n\n  marker.__luxNodes = newNodes;\n}\n\n// Positional reconciliation within a marker's content range\nfunction patchPositionalInMarker(marker, newChildren) {\n  const parent = marker.parentNode;\n  const oldNodes = [...marker.__luxNodes];\n  const oldCount = oldNodes.length;\n  const newCount = newChildren.length;\n\n  // Patch in place\n  const patchCount = Math.min(oldCount, newCount);\n  for (let i = 0; i < patchCount; i++) {\n    patchSingle(parent, oldNodes[i], newChildren[i]);\n  }\n\n  // Append new children\n  const ref = nextSiblingAfterMarker(marker);\n  for (let i = oldCount; i < newCount; i++) {\n    const rendered = render(newChildren[i]);\n    const inserted = insertRendered(parent, rendered, ref, marker);\n    oldNodes.push(...inserted);\n  }\n\n  // Remove excess children\n  for (let i = newCount; i < oldCount; i++) {\n    disposeNode(oldNodes[i]);\n    if (oldNodes[i].parentNode === parent) parent.removeChild(oldNodes[i]);\n  }\n\n  marker.__luxNodes = oldNodes.slice(0, Math.max(newCount, oldCount > newCount ? newCount : oldNodes.length));\n  // Simplify: rebuild __luxNodes from what should remain\n  if (newCount <= oldCount) {\n    marker.__luxNodes = oldNodes.slice(0, newCount);\n  }\n}\n\n// Keyed reconciliation for children of an element (not marker-based)\nfunction patchKeyedChildren(parent, newVNodes) {\n  const logical = getLogicalChildren(parent);\n  const oldKeyMap = new Map();\n\n  for (const node of logical) {\n    const key = getNodeKey(node);\n    if (key != null) oldKeyMap.set(key, node);\n  }\n\n  const newNodes = [];\n  const usedOld = new Set();\n\n  for (const newChild of newVNodes) {\n    const key = getKey(newChild);\n\n    if (key != null && oldKeyMap.has(key)) {\n      const oldNode = oldKeyMap.get(key);\n      usedOld.add(oldNode);\n\n      if (oldNode.nodeType === 1 && newChild.__lux &&\n          oldNode.tagName.toLowerCase() === newChild.tag.toLowerCase()) {\n        const oldVNode = oldNode.__vnode || { props: {}, children: [] };\n        applyProps(oldNode, newChild.props, oldVNode.props);\n        patchChildrenOfElement(oldNode, flattenVNodes(newChild.children));\n        oldNode.__vnode = newChild;\n        newNodes.push(oldNode);\n      } else {\n        newNodes.push(render(newChild));\n      }\n    } else {\n      newNodes.push(render(newChild));\n    }\n  }\n\n  // Remove unused old logical nodes\n  for (const node of logical) {\n    if (!usedOld.has(node) && node.parentNode === parent) {\n      removeLogicalNode(parent, node);\n    }\n  }\n\n  // Arrange in correct order\n  for (let i = 0; i < newNodes.length; i++) {\n    const expected = newNodes[i];\n    const logicalNow = getLogicalChildren(parent);\n    const current = logicalNow[i];\n    if (current !== expected) {\n      parent.insertBefore(expected, current || null);\n    }\n  }\n}\n\n// Positional reconciliation for children of an element\nfunction patchPositionalChildren(parent, newChildren) {\n  const logical = getLogicalChildren(parent);\n  const oldCount = logical.length;\n  const newCount = newChildren.length;\n\n  for (let i = 0; i < Math.min(oldCount, newCount); i++) {\n    patchSingle(parent, logical[i], newChildren[i]);\n  }\n\n  for (let i = oldCount; i < newCount; i++) {\n    parent.appendChild(render(newChildren[i]));\n  }\n\n  // Remove excess logical children\n  const currentLogical = getLogicalChildren(parent);\n  while (currentLogical.length > newCount) {\n    const node = currentLogical.pop();\n    removeLogicalNode(parent, node);\n  }\n}\n\n// Patch children of a regular element\nfunction patchChildrenOfElement(el, newChildren) {\n  const hasKeys = newChildren.some(c => getKey(c) != null);\n  if (hasKeys) {\n    patchKeyedChildren(el, newChildren);\n  } else {\n    patchPositionalChildren(el, newChildren);\n  }\n}\n\n// Patch a single logical node in place\nfunction patchSingle(parent, existing, newVNode) {\n  if (!existing) {\n    parent.appendChild(render(newVNode));\n    return;\n  }\n\n  if (newVNode === null || newVNode === undefined) {\n    removeLogicalNode(parent, existing);\n    return;\n  }\n\n  // Function vnode — replace with new dynamic block\n  if (typeof newVNode === 'function') {\n    const rendered = render(newVNode);\n    if (existing.__luxNodes) {\n      // Existing is a marker — clear its content and replace\n      clearMarkerContent(existing);\n      parent.replaceChild(rendered, existing);\n    } else {\n      disposeNode(existing);\n      parent.replaceChild(rendered, existing);\n    }\n    return;\n  }\n\n  // Text\n  if (typeof newVNode === 'string' || typeof newVNode === 'number' || typeof newVNode === 'boolean') {\n    const text = String(newVNode);\n    if (existing.nodeType === 3) {\n      if (existing.textContent !== text) existing.textContent = text;\n    } else {\n      removeLogicalNode(parent, existing);\n      parent.insertBefore(document.createTextNode(text), null);\n    }\n    return;\n  }\n\n  if (!newVNode.__lux) {\n    const text = String(newVNode);\n    if (existing.nodeType === 3) {\n      if (existing.textContent !== text) existing.textContent = text;\n    } else {\n      removeLogicalNode(parent, existing);\n      parent.insertBefore(document.createTextNode(text), null);\n    }\n    return;\n  }\n\n  // Fragment — patch marker content\n  if (newVNode.tag === '__fragment') {\n    if (existing.__luxFragment) {\n      // Patch children within the marker range\n      const oldNodes = [...existing.__luxNodes];\n      const newChildren = flattenVNodes(newVNode.children);\n      // Simple approach: clear and re-render fragment content\n      clearMarkerContent(existing);\n      const ref = nextSiblingAfterMarker(existing);\n      for (const child of newChildren) {\n        const rendered = render(child);\n        const inserted = insertRendered(parent, rendered, ref, existing);\n        existing.__luxNodes.push(...inserted);\n      }\n      existing.__vnode = newVNode;\n      return;\n    }\n    removeLogicalNode(parent, existing);\n    parent.appendChild(render(newVNode));\n    return;\n  }\n\n  // Element — patch in place\n  if (existing.nodeType === 1 && newVNode.tag &&\n      existing.tagName.toLowerCase() === newVNode.tag.toLowerCase()) {\n    const oldVNode = existing.__vnode || { props: {}, children: [] };\n    applyProps(existing, newVNode.props, oldVNode.props);\n    patchChildrenOfElement(existing, flattenVNodes(newVNode.children));\n    existing.__vnode = newVNode;\n    return;\n  }\n\n  // Different type — full replace\n  removeLogicalNode(parent, existing);\n  parent.appendChild(render(newVNode));\n}\n\n// ─── Hydration (SSR) ─────────────────────────────────────\n// SSR renders flat HTML without markers. Hydration attaches reactivity\n// to existing DOM nodes and inserts markers for dynamic blocks.\n\nfunction hydrateVNode(domNode, vnode) {\n  if (!domNode) return null;\n  if (vnode === null || vnode === undefined) return domNode;\n\n  // Function vnode (reactive text, JSXIf, JSXFor)\n  if (typeof vnode === 'function') {\n    if (domNode.nodeType === 3) {\n      // Reactive text: attach effect to existing text node\n      domNode.__luxReactive = true;\n      createEffect(() => {\n        const val = vnode();\n        const text = val == null ? '' : String(val);\n        if (domNode.textContent !== text) domNode.textContent = text;\n      });\n      return domNode.nextSibling;\n    }\n    // Complex dynamic block: insert marker-based render, replace SSR node\n    const parent = domNode.parentNode;\n    const next = domNode.nextSibling;\n    const rendered = render(vnode);\n    parent.replaceChild(rendered, domNode);\n    // rendered is a DocumentFragment — its children are now in parent\n    // Find the next unprocessed node\n    return next;\n  }\n\n  // Primitive text — already correct from SSR\n  if (typeof vnode === 'string' || typeof vnode === 'number' || typeof vnode === 'boolean') {\n    return domNode.nextSibling;\n  }\n\n  // Array\n  if (Array.isArray(vnode)) {\n    let cursor = domNode;\n    for (const child of flattenVNodes(vnode)) {\n      if (!cursor) break;\n      cursor = hydrateVNode(cursor, child);\n    }\n    return cursor;\n  }\n\n  if (!vnode.__lux) return domNode.nextSibling;\n\n  // Fragment — children rendered inline in SSR (no wrapper)\n  if (vnode.tag === '__fragment') {\n    const children = flattenVNodes(vnode.children);\n    let cursor = domNode;\n    for (const child of children) {\n      if (!cursor) break;\n      cursor = hydrateVNode(cursor, child);\n    }\n    return cursor;\n  }\n\n  // Dynamic node — replace SSR content with reactive marker\n  if (vnode.tag === '__dynamic' && typeof vnode.compute === 'function') {\n    const parent = domNode.parentNode;\n    const next = domNode.nextSibling;\n    const rendered = render(vnode);\n    parent.replaceChild(rendered, domNode);\n    return next;\n  }\n\n  // Element — attach event handlers, reactive props, refs\n  if (domNode.nodeType === 1 && domNode.tagName.toLowerCase() === vnode.tag.toLowerCase()) {\n    hydrateProps(domNode, vnode.props);\n    domNode.__vnode = vnode;\n\n    const children = flattenVNodes(vnode.children || []);\n    let cursor = domNode.firstChild;\n    for (const child of children) {\n      if (!cursor) break;\n      cursor = hydrateVNode(cursor, child);\n    }\n    return domNode.nextSibling;\n  }\n\n  // Tag mismatch — fall back to full render\n  const parent = domNode.parentNode;\n  const next = domNode.nextSibling;\n  const rendered = render(vnode);\n  parent.replaceChild(rendered, domNode);\n  return next;\n}\n\nfunction hydrateProps(el, props) {\n  for (const [key, value] of Object.entries(props)) {\n    if (key === 'ref') {\n      if (typeof value === 'object' && value !== null && 'current' in value) {\n        value.current = el;\n      } else if (typeof value === 'function') {\n        value(el);\n      }\n    } else if (key.startsWith('on')) {\n      const eventName = key.slice(2).toLowerCase();\n      el.addEventListener(eventName, value);\n      if (!el.__handlers) el.__handlers = {};\n      el.__handlers[eventName] = value;\n    } else if (key === 'key') {\n      // Skip\n    } else if (typeof value === 'function' && !key.startsWith('on')) {\n      createEffect(() => {\n        const val = value();\n        applyPropValue(el, key, val);\n      });\n    }\n  }\n}\n\nfunction hydrate(component, container) {\n  if (!container) {\n    console.error('Lux: Hydration target not found');\n    return;\n  }\n\n  return createRoot(() => {\n    const vnode = typeof component === 'function' ? component() : component;\n    if (container.firstChild) {\n      hydrateVNode(container.firstChild, vnode);\n    }\n  });\n}\n\nfunction mount(component, container) {\n  if (!container) {\n    console.error('Lux: Mount target not found');\n    return;\n  }\n\n  return createRoot((dispose) => {\n    const vnode = typeof component === 'function' ? component() : component;\n    container.innerHTML = '';\n    container.appendChild(render(vnode));\n    return dispose;\n  });\n}\n\n\n// ── Lux Runtime: RPC ──\n// RPC bridge — client calls to server functions are auto-routed via HTTP\n\nconst RPC_BASE = typeof window !== 'undefined'\n  ? (window.__LUX_RPC_BASE || '')\n  : 'http://localhost:3000';\n\nasync function rpc(functionName, args = []) {\n  const url = `${RPC_BASE}/rpc/${functionName}`;\n\n  // Convert positional args to object if needed\n  let body;\n  if (args.length === 1 && typeof args[0] === 'object' && !Array.isArray(args[0])) {\n    body = args[0];\n  } else if (args.length > 0) {\n    // Send as array, server will handle positional mapping\n    body = { __args: args };\n  } else {\n    body = {};\n  }\n\n  try {\n    const response = await fetch(url, {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify(body),\n    });\n\n    if (!response.ok) {\n      const errorText = await response.text();\n      throw new Error(`RPC call to '${functionName}' failed: ${response.status} ${errorText}`);\n    }\n\n    const data = await response.json();\n    return data.result;\n  } catch (error) {\n    if (error.message.includes('RPC call')) throw error;\n    throw new Error(`RPC call to '${functionName}' failed: ${error.message}`);\n  }\n}\n\n// Configure RPC base URL\nfunction configureRPC(baseUrl) {\n  if (typeof window !== 'undefined') {\n    window.__LUX_RPC_BASE = baseUrl;\n  }\n}\n\n\n// ── App ──\n// ── Shared ──\n// Lux string methods\n(function() {\n  const m = {\n    upper() { return this.toUpperCase(); },\n    lower() { return this.toLowerCase(); },\n    contains(s) { return this.includes(s); },\n    starts_with(s) { return this.startsWith(s); },\n    ends_with(s) { return this.endsWith(s); },\n    chars() { return [...this]; },\n    words() { return this.split(/\\s+/).filter(Boolean); },\n    lines() { return this.split('\\n'); },\n    capitalize() { return this.length ? this.charAt(0).toUpperCase() + this.slice(1) : this; },\n    title_case() { return this.replace(/\\b\\w/g, c => c.toUpperCase()); },\n    snake_case() { return this.replace(/[-\\s]+/g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/^_/, ''); },\n    camel_case() { return this.replace(/[-_\\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '').replace(/^[A-Z]/, c => c.toLowerCase()); },\n  };\n  for (const [n, fn] of Object.entries(m)) {\n    if (!String.prototype[n]) Object.defineProperty(String.prototype, n, { value: fn, writable: true, configurable: true });\n  }\n})();\nconst Low = Object.freeze({ __tag: \"Low\" });\nconst Medium = Object.freeze({ __tag: \"Medium\" });\nconst High = Object.freeze({ __tag: \"High\" });\n\n// ── Stdlib ──\nfunction print(...args) { console.log(...args); }\nfunction len(v) { if (v == null) return 0; if (typeof v === 'string' || Array.isArray(v)) return v.length; if (typeof v === 'object') return Object.keys(v).length; return 0; }\nfunction range(s, e, st) { if (e === undefined) { e = s; s = 0; } if (st === undefined) st = s < e ? 1 : -1; const r = []; if (st > 0) { for (let i = s; i < e; i += st) r.push(i); } else { for (let i = s; i > e; i += st) r.push(i); } return r; }\nfunction enumerate(a) { return a.map((v, i) => [i, v]); }\nfunction sum(a) { return a.reduce((x, y) => x + y, 0); }\nfunction sorted(a, k) { const c = [...a]; if (k) c.sort((x, y) => { const kx = k(x), ky = k(y); return kx < ky ? -1 : kx > ky ? 1 : 0; }); else c.sort((x, y) => x < y ? -1 : x > y ? 1 : 0); return c; }\nfunction reversed(a) { return [...a].reverse(); }\nfunction zip(...as) { const m = Math.min(...as.map(a => a.length)); const r = []; for (let i = 0; i < m; i++) r.push(as.map(a => a[i])); return r; }\nfunction min(a) { return Math.min(...a); }\nfunction max(a) { return Math.max(...a); }\n\n// ── Server RPC Proxy ──\nconst server = new Proxy({}, {\n  get(_, name) {\n    return (...args) => rpc(name, args);\n  }\n});\n\n// ── Reactive State ──\nconst [count, setCount] = createSignal(0);\nconst [step, setStep] = createSignal(1);\nconst [notes, setNotes] = createSignal([]);\nconst [note_input, setNote_input] = createSignal(\"\");\nconst [note_count_id, setNote_count_id] = createSignal(0);\nconst [selected_priority, setSelected_priority] = createSignal(\"Medium\");\n\n// ── Computed Values ──\nconst doubled = createComputed(() => (count() * 2));\nconst is_even = createComputed(() => ((count() % 2) == 0));\nconst parity_text = createComputed(() => ((is_even()) ? (\"even\") : (\"odd\")));\nconst total_notes = createComputed(() => len(notes()));\nconst high_count = createComputed(() => len(notes().filter((n) => (n.priority == \"High\"))));\n\nfunction increment() {\n  setCount(__lux_p => __lux_p + step());\n}\nfunction decrement() {\n  setCount(__lux_p => __lux_p - step());\n}\nfunction reset() {\n  setCount(0);\n}\nfunction add_note() {\n  if ((note_input() != \"\")) {\n    setNote_count_id(__lux_p => __lux_p + 1);\n    setNotes([...notes(), { id: note_count_id(), text: note_input(), priority: selected_priority(), created_at: count() }]);\n    setNote_input(\"\");\n  }\n}\nfunction remove_note(id) {\n  setNotes(notes().filter((n) => (n.id != id)));\n}\nfunction priority_color(p) {\n  if ((p == \"High\")) {\n    return \"#e74c3c\";\n  } else if ((p == \"Medium\")) {\n    return \"#f39c12\";\n  } else {\n    return \"#27ae60\";\n  }\n}\n// ── Components ──\nfunction Badge(__props) {\n  const text = () => __props.text;\n  const color = () => __props.color;\n  return lux_el(\"span\", {style: () => `background: ${color()}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;`}, [() => `${text()}`]);\n}\n\nfunction NoteItem(__props) {\n  const note = () => __props.note;\n  return lux_el(\"div\", {style: () => `display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; margin-bottom: 0.5rem; background: #f8f9fa; border-radius: 8px; border-left: 3px solid ${priority_color(note().priority)};`}, [lux_el(\"div\", {style: \"flex: 1;\"}, [lux_el(\"div\", {style: \"display: flex; align-items: center; gap: 0.5rem;\"}, [Badge({get text() { return note().priority; }, get color() { return priority_color(note().priority); }}), lux_el(\"span\", {}, [() => `${note().text}`])]), lux_el(\"div\", {style: \"font-size: 0.75rem; color: #888; margin-top: 0.25rem;\"}, [() => `Added at count: ${note().created_at}`])]), lux_el(\"button\", {style: \"background: none; border: none; color: #ccc; cursor: pointer; font-size: 1.2rem; padding: 0.25rem;\", onClick: () => remove_note(note().id)}, [\"x\"])]);\n}\n\nfunction App() {\n  return lux_el(\"div\", {style: \"max-width: 520px; margin: 2rem auto; padding: 0 1rem; font-family: system-ui, -apple-system, sans-serif;\"}, [lux_el(\"div\", {style: \"background: white; border-radius: 16px; padding: 2rem; box-shadow: 0 20px 60px rgba(0,0,0,0.1);\"}, [lux_el(\"header\", {style: \"text-align: center; margin-bottom: 1.5rem;\"}, [lux_el(\"h1\", {style: \"margin: 0; font-size: 1.8rem; color: #333;\"}, [\"Lux Counter\"]), lux_el(\"p\", {style: \"margin: 0.25rem 0 0; color: #888; font-size: 0.85rem;\"}, [\"Reactivity Test App\"])]), lux_el(\"div\", {id: \"counter-display\", style: \"text-align: center; padding: 1.5rem; background: #f0f4ff; border-radius: 12px; margin-bottom: 1.5rem;\"}, [lux_el(\"div\", {style: \"font-size: 3.5rem; font-weight: 700; color: #333; font-variant-numeric: tabular-nums;\"}, [() => `${count()}`]), lux_el(\"div\", {style: \"font-size: 0.85rem; color: #667eea; margin-top: 0.25rem;\"}, [() => `doubled: ${doubled()} | ${parity_text()}`])]), lux_el(\"div\", {style: \"display: flex; gap: 0.5rem; justify-content: center; margin-bottom: 1rem;\"}, [lux_el(\"button\", {id: \"btn-dec\", style: \"padding: 0.5rem 1.25rem; border: 1px solid #ddd; border-radius: 8px; background: white; cursor: pointer; font-size: 1rem;\", onClick: decrement}, [\"-\"]), lux_el(\"button\", {id: \"btn-reset\", style: \"padding: 0.5rem 1.25rem; border: 1px solid #ddd; border-radius: 8px; background: white; cursor: pointer; font-size: 0.9rem;\", onClick: reset}, [\"Reset\"]), lux_el(\"button\", {id: \"btn-inc\", style: \"padding: 0.5rem 1.25rem; border: 1px solid #667eea; border-radius: 8px; background: #667eea; color: white; cursor: pointer; font-size: 1rem;\", onClick: increment}, [\"+\"])]), lux_el(\"div\", {style: \"display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 1.5rem;\"}, [lux_el(\"label\", {style: \"font-size: 0.85rem; color: #666;\"}, [\"Step:\"]), lux_el(\"input\", {id: \"step-input\", type: \"text\", value: () => step(), style: \"width: 50px; padding: 0.4rem; border: 2px solid #e0e0e0; border-radius: 6px; text-align: center; font-size: 0.9rem;\", onInput: (e) => { setStep(((__lux_v) => __lux_v != null && __lux_v === __lux_v ? __lux_v : 1)(parseInt(e.target.value))); }})]), lux_el(\"div\", {style: \"border-top: 1px solid #eee; padding-top: 1.5rem;\"}, [lux_el(\"h2\", {style: \"margin: 0 0 0.75rem; font-size: 1.1rem; color: #333;\"}, [() => `Notes (${total_notes()})`, () => ((high_count() > 0)) ? lux_el(\"span\", {style: \"color: #e74c3c; font-size: 0.8rem; margin-left: 0.5rem;\"}, [() => `${high_count()} high priority`]) : null]), lux_el(\"div\", {style: \"display: flex; gap: 0.5rem; margin-bottom: 1rem;\"}, [lux_el(\"input\", {id: \"note-input\", type: \"text\", placeholder: \"Add a note...\", value: () => note_input(), style: \"flex: 1; padding: 0.6rem 0.75rem; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 0.9rem; outline: none;\", onInput: (e) => { setNote_input(e.target.value); }, onKeydown: (e) => {\n    if ((e.key == \"Enter\")) {\n      add_note();\n    }\n  }}), lux_el(\"select\", {id: \"priority-select\", value: () => selected_priority(), style: \"padding: 0.5rem; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 0.85rem;\", onChange: (e) => { setSelected_priority(e.target.value); }}, [lux_el(\"option\", {value: \"Low\"}, [\"Low\"]), lux_el(\"option\", {value: \"Medium\"}, [\"Medium\"]), lux_el(\"option\", {value: \"High\"}, [\"High\"])]), lux_el(\"button\", {id: \"btn-add-note\", style: \"padding: 0.5rem 1rem; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 0.9rem; white-space: nowrap;\", onClick: add_note}, [\"Add\"])]), lux_el(\"div\", {id: \"notes-list\"}, [() => notes().map((note) => NoteItem({note: note}))]), () => ((total_notes() == 0)) ? lux_el(\"div\", {style: \"text-align: center; color: #ccc; padding: 1.5rem; font-size: 0.9rem;\"}, [\"No notes yet. Add one above!\"]) : null])])]);\n}\n\n// ── Mount ──\ndocument.addEventListener(\"DOMContentLoaded\", () => {\n  mount(App, document.getElementById(\"app\") || document.body);\n});\n  </script>\n</body>\n</html>";
// ── Shared ──
// Lux string methods
(function() {
  const m = {
    upper() { return this.toUpperCase(); },
    lower() { return this.toLowerCase(); },
    contains(s) { return this.includes(s); },
    starts_with(s) { return this.startsWith(s); },
    ends_with(s) { return this.endsWith(s); },
    chars() { return [...this]; },
    words() { return this.split(/\s+/).filter(Boolean); },
    lines() { return this.split('\n'); },
    capitalize() { return this.length ? this.charAt(0).toUpperCase() + this.slice(1) : this; },
    title_case() { return this.replace(/\b\w/g, c => c.toUpperCase()); },
    snake_case() { return this.replace(/[-\s]+/g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/^_/, ''); },
    camel_case() { return this.replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '').replace(/^[A-Z]/, c => c.toLowerCase()); },
  };
  for (const [n, fn] of Object.entries(m)) {
    if (!String.prototype[n]) Object.defineProperty(String.prototype, n, { value: fn, writable: true, configurable: true });
  }
})();
const Low = Object.freeze({ __tag: "Low" });
const Medium = Object.freeze({ __tag: "Medium" });
const High = Object.freeze({ __tag: "High" });

// ── Distributed Tracing ──
import { AsyncLocalStorage } from "node:async_hooks";
const __requestContext = new AsyncLocalStorage();
function __getRequestId() {
  const store = __requestContext.getStore();
  return store ? store.rid : null;
}
function __getLocals() {
  const store = __requestContext.getStore();
  return store ? store.locals : {};
}

// ── Runtime Helpers ──
function respond(status, body, headers = {}) {
  const __hasContentType = Object.keys(headers).some(k => k.toLowerCase() === "content-type");
  if (__hasContentType) {
    const data = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(data, { status, headers });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function __parseQuery(searchParams) {
  const q = {};
  for (const [k, v] of searchParams) {
    if (q[k] !== undefined) {
      if (!Array.isArray(q[k])) q[k] = [q[k]];
      q[k].push(v);
    } else { q[k] = v; }
  }
  return q;
}
function __parseCookies(str) {
  const c = {};
  if (!str) return c;
  for (const pair of str.split(";")) {
    const [k, ...v] = pair.trim().split("=");
    if (k) c[k.trim()] = v.join("=").trim();
  }
  return c;
}

async function __readBodyBytes(req) {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > __maxBodySize) throw new Error("__BODY_TOO_LARGE__");
    chunks.push(value);
  }
  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
async function __parseBody(req) {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("multipart/form-data")) {
    try {
      const fd = await req.formData();
      const obj = {};
      for (const [k, v] of fd) {
        if (obj[k] !== undefined) {
          if (!Array.isArray(obj[k])) obj[k] = [obj[k]];
          obj[k].push(v);
        } else { obj[k] = v; }
      }
      return obj;
    } catch { return null; }
  }
  const raw = await __readBodyBytes(req);
  const text = new TextDecoder().decode(raw);
  if (ct.includes("application/x-www-form-urlencoded")) {
    try {
      const sp = new URLSearchParams(text);
      const obj = {};
      for (const [k, v] of sp) {
        if (obj[k] !== undefined) {
          if (!Array.isArray(obj[k])) obj[k] = [obj[k]];
          obj[k].push(v);
        } else { obj[k] = v; }
      }
      return obj;
    } catch { return null; }
  }
  try { return JSON.parse(text); } catch { return null; }
}
// ── Response Helpers ──
function redirect(url, status = 302) {
  return new Response(null, { status, headers: { Location: url } });
}
function set_cookie(name, value, options = {}) {
  let cookie = `${name}=${encodeURIComponent(value)}`;
  if (options.maxAge) cookie += `; Max-Age=${options.maxAge}`;
  if (options.path) cookie += `; Path=${options.path}`;
  if (options.domain) cookie += `; Domain=${options.domain}`;
  if (options.httpOnly) cookie += "; HttpOnly";
  if (options.secure) cookie += "; Secure";
  if (options.sameSite) cookie += `; SameSite=${options.sameSite}`;
  return cookie;
}
function stream(fn) {
  const readable = new ReadableStream({
    start(controller) {
      const send = (data) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
      const close = () => controller.close();
      fn(send, close);
    }
  });
  return new Response(readable, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } });
}
function sse(fn) {
  let cancelled = false;
  const readable = new ReadableStream({
    async start(controller) {
      const send = (data, event) => {
        if (cancelled) return;
        let msg = "";
        if (event) msg += `event: ${event}\n`;
        msg += `data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`;
        controller.enqueue(new TextEncoder().encode(msg));
      };
      const close = () => { cancelled = true; controller.close(); };
      await fn(send, close);
    },
    cancel() { cancelled = true; }
  });
  return new Response(readable, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } });
}
function html(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { "Content-Type": "text/html", ...headers } });
}
function text(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain", ...headers } });
}
function with_headers(response, headers) {
  const h = new Headers(response.headers);
  for (const [k, v] of Object.entries(headers)) h.set(k, v);
  return new Response(response.body, { status: response.status, headers: h });
}

// ── Auth Builtins ──
let __jwtSignKey = null;
async function sign_jwt(payload, secret, options = {}) {
  const __secret = secret || (typeof __authSecret !== "undefined" ? __authSecret : "secret");
  if (!__jwtSignKey || __secret !== (typeof __authSecret !== "undefined" ? __authSecret : "")) {
    __jwtSignKey = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(__secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
  }
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = { ...payload, iat: now };
  if (options.expires_in) claims.exp = now + options.expires_in;
  if (options.exp) claims.exp = options.exp;
  const __b64url = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const __headerB64 = __b64url(header);
  const __payloadB64 = __b64url(claims);
  const __sigData = __headerB64 + "." + __payloadB64;
  const __sig = await crypto.subtle.sign("HMAC", __jwtSignKey, new TextEncoder().encode(__sigData));
  const __sigB64 = btoa(String.fromCharCode(...new Uint8Array(__sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return __sigData + "." + __sigB64;
}

async function hash_password(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  const saltHex = [...salt].map(b => b.toString(16).padStart(2, "0")).join("");
  const hashHex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2:100000:${saltHex}:${hashHex}`;
}

async function verify_password(password, stored) {
  const parts = stored.split(":");
  if (parts[0] !== "pbkdf2" || parts.length !== 4) return false;
  const iterations = parseInt(parts[1], 10);
  const salt = new Uint8Array(parts[2].match(/.{2}/g).map(b => parseInt(b, 16)));
  const expectedHash = parts[3];
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  const hashHex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex === expectedHash;
}

// ── Router ──
const __routes = [];
function __addRoute(method, path, handler) {
  let pattern = path
    .replace(/\*([a-zA-Z_][a-zA-Z0-9_]*)/g, "(?<$1>.+)")
    .replace(/\*$/g, "(.*)")
    .replace(/:([^/]+)/g, "(?<$1>[^/]+)");
  __routes.push({ method, regex: new RegExp(`^${pattern}$`), handler, _path: path });
}

// ── CORS ──
function __getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// ── Max Body Size ──
const __maxBodySize = 1048576;

function cache_control(res, maxAge, options = {}) {
  const h = new Headers(res.headers);
  let directive = options.private ? "private" : "public";
  directive += `, max-age=${maxAge}`;
  if (options.stale_while_revalidate) directive += `, stale-while-revalidate=${options.stale_while_revalidate}`;
  if (options.no_cache) directive = "no-cache";
  if (options.no_store) directive = "no-store";
  h.set("Cache-Control", directive);
  return new Response(res.body, { status: res.status, headers: h });
}
function etag(res, tag) {
  const h = new Headers(res.headers);
  h.set("ETag", `"${tag}"`);
  return new Response(res.body, { status: res.status, headers: h });
}

// ── Content Negotiation ──
function negotiate(req, data, options = {}) {
  const accept = (req.headers.get("Accept") || "application/json").toLowerCase();
  if (accept.includes("text/html") && options.html) {
    const body = typeof options.html === "function" ? options.html(data) : options.html;
    return new Response(body, { status: options.status || 200, headers: { "Content-Type": "text/html" } });
  }
  if (accept.includes("text/xml") || accept.includes("application/xml")) {
    if (options.xml) {
      const body = typeof options.xml === "function" ? options.xml(data) : options.xml;
      return new Response(body, { status: options.status || 200, headers: { "Content-Type": "application/xml" } });
    }
  }
  if (accept.includes("text/plain")) {
    const body = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return new Response(body, { status: options.status || 200, headers: { "Content-Type": "text/plain" } });
  }
  return Response.json(data, { status: options.status || 200 });
}

// ── Async Mutex ──
class __Mutex {
  constructor() { this._queue = []; this._locked = false; }
  async acquire() {
    if (!this._locked) { this._locked = true; return; }
    return new Promise(resolve => this._queue.push(resolve));
  }
  release() {
    if (this._queue.length > 0) { this._queue.shift()(); }
    else { this._locked = false; }
  }
}
const __mutex = new __Mutex();
async function withLock(fn) {
  await __mutex.acquire();
  try { return await fn(); } finally { __mutex.release(); }
}

// ── Routes ──
__addRoute("GET", "/", async (req, params) => {
  const __result = await ((req) => {
  return new Response(__clientHTML, { headers: { "Content-Type": "text/html" } });
})(req, params);
  if (__result instanceof Response) return __result;
  return Response.json(__result);
});

// ── OpenAPI Spec ──
const __openApiSpec = {
  openapi: "3.0.3",
  info: { title: "Lux API", version: "1.0.0" },
  paths: {},
  components: { schemas: {} },
};
if (!__openApiSpec.paths["/"]) __openApiSpec.paths["/"] = {};
__openApiSpec.paths["/"]["get"] = {
  responses: { "200": { description: "Success" } },
};
__addRoute("GET", "/openapi.json", async () => {
  return Response.json(__openApiSpec);
});
__addRoute("GET", "/docs", async () => {
  const html = `<!DOCTYPE html><html><head><title>API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
    <body><div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>SwaggerUIBundle({ url: "/openapi.json", dom_id: "#swagger-ui" });</script>
    </body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
});

// ── Structured Logging ──
let __reqCounter = 0;
function __genRequestId() {
  return `${Date.now().toString(36)}-${(++__reqCounter).toString(36)}`;
}
const __logLevels = { debug: 0, info: 1, warn: 2, error: 3 };
const __logMinLevel = __logLevels[process.env.LOG_LEVEL || "info"] || 1;
let __logFile = null;
if (process.env.LOG_FILE) {
  const __fs = await import("node:fs");
  __logFile = __fs.createWriteStream(process.env.LOG_FILE, { flags: "a" });
}
function __log(level, msg, meta = {}) {
  if ((__logLevels[level] || 0) < __logMinLevel) return;
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, msg, ...meta });
  console.log(entry);
  if (__logFile) __logFile.write(entry + "\n");
}

// ── Graceful Drain ──
let __activeRequests = 0;
let __shuttingDown = false;

// ── Request Handler ──
async function __handleRequest(req) {
  if (__shuttingDown) {
    return new Response("Service Unavailable", { status: 503 });
  }
  __activeRequests++;
  const url = new URL(req.url);
  const __rid = req.headers.get("X-Request-Id") || __genRequestId();
  const __startTime = Date.now();
  const __cors = __getCorsHeaders(req);
  return __requestContext.run({ rid: __rid, locals: {} }, async () => {
  try {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: __cors });
  }
  const __contentLength = parseInt(req.headers.get("Content-Length") || "0", 10);
  if (__contentLength > __maxBodySize) {
    return Response.json({ error: "Payload Too Large" }, { status: 413, headers: __cors });
  }
  for (const route of __routes) {
    if (req.method === route.method || (route.method === "GET" && req.method === "HEAD" && !__routes.some(r => r.method === "HEAD" && r.regex.source === route.regex.source))) {
      const match = url.pathname.match(route.regex);
      if (match) {
        try {
          const res = await route.handler(req, match.groups || {});
          __log("info", `${req.method} ${url.pathname}`, { rid: __rid, status: res.status, ms: Date.now() - __startTime });
          const headers = new Headers(res.headers);
          for (const [k, v] of Object.entries(__cors)) headers.set(k, v);
          return new Response(res.body, { status: res.status, headers });
        } catch (err) {
          if (err.message === "__BODY_TOO_LARGE__") return Response.json({ error: "Payload Too Large" }, { status: 413, headers: __cors });
          return Response.json({ error: err.message }, { status: 500, headers: __cors });
        }
      }
    }
  }
  if (url.pathname === "/" && typeof __clientHTML !== "undefined") {
    return new Response(__clientHTML, { status: 200, headers: { "Content-Type": "text/html", ...(__cors) } });
  }
  const __notFound = Response.json({ error: "Not Found" }, { status: 404, headers: __cors });
  __log("warn", "Not Found", { rid: __rid, method: req.method, path: url.pathname, status: 404, ms: Date.now() - __startTime });
  return __notFound;
  } finally {
    __activeRequests--;
  }
  });
}

// ── Start Server ──
const __port = process.env.PORT || process.env.PORT || 3000;
const __server = Bun.serve({
  port: __port,
  maxRequestBodySize: __maxBodySize,
  fetch: __handleRequest,
});
console.log(`Lux server running on ${__server.url}`);

// ── Graceful Shutdown ──
async function __shutdown() {
  console.log(`Lux server shutting down...`);
  __shuttingDown = true;
  __server.stop();
  const __drainStart = Date.now();
  while (__activeRequests > 0 && Date.now() - __drainStart < 10000) {
    await new Promise(r => setTimeout(r, 50));
  }
  if (__logFile) __logFile.end();
  process.exit(0);
}
process.on("SIGINT", __shutdown);
process.on("SIGTERM", __shutdown);