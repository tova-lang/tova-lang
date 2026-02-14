// Tova DevTools — opt-in development tooling
// Zero-cost when not enabled: all hooks gate on a single boolean check.

import { __enableDevTools } from './reactivity.js';

// ─── Registries ─────────────────────────────────────────────

let nextId = 1;

// Component registry: Map<id, { name, props, renderCount, totalRenderTime, domNode }>
const componentRegistry = new Map();

// Signal registry: Map<id, { name, getter, setter, subscriberCount }>
const signalRegistry = new Map();

// Effect registry: Map<id, { executionCount, totalTime, lastTime, deps }>
const effectRegistry = new Map();

// ─── Performance data ────────────────────────────────────────

const perfData = {
  renders: [],   // { timestamp, duration, componentId, componentName }
  effects: [],   // { timestamp, duration, effectId }
  signals: [],   // { timestamp, signalId, name, oldValue, newValue }
};

// ─── DevTools hooks (wired into reactivity.js) ───────────────

const hooks = {
  onSignalCreate(getter, setter, name) {
    const id = nextId++;
    const entry = { id, name: name || `signal_${id}`, getter, setter, subscriberCount: 0 };
    signalRegistry.set(id, entry);
    return id;
  },

  onSignalUpdate(id, oldValue, newValue) {
    const entry = signalRegistry.get(id);
    if (entry) {
      perfData.signals.push({
        timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        signalId: id,
        name: entry.name,
        oldValue,
        newValue,
      });
    }
  },

  onEffectCreate(effect) {
    const id = nextId++;
    effectRegistry.set(id, {
      id,
      executionCount: 0,
      totalTime: 0,
      lastTime: 0,
      deps: [],
    });
    effect.__devtools_id = id;
    return id;
  },

  onEffectRun(effect, duration) {
    const id = effect.__devtools_id;
    if (id == null) return;
    const entry = effectRegistry.get(id);
    if (entry) {
      entry.executionCount++;
      entry.totalTime += duration;
      entry.lastTime = duration;
      perfData.effects.push({
        timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        duration,
        effectId: id,
      });
    }
  },

  onComponentRender(name, domNode, duration) {
    let existing = null;
    for (const [, comp] of componentRegistry) {
      if (comp.name === name && comp.domNode === domNode) {
        existing = comp;
        break;
      }
    }

    if (existing) {
      existing.renderCount++;
      existing.totalRenderTime += duration;
    } else {
      const id = nextId++;
      componentRegistry.set(id, {
        id,
        name,
        props: null,
        renderCount: 1,
        totalRenderTime: duration,
        domNode,
      });
    }

    perfData.renders.push({
      timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      duration,
      componentName: name,
    });
  },

  onMount() {},
  onHydrate(info) {},
};

// ─── Public API exposed on window ────────────────────────────

function getComponentTree() {
  const tree = [];
  for (const [id, comp] of componentRegistry) {
    tree.push({
      id,
      name: comp.name,
      renderCount: comp.renderCount,
      totalRenderTime: comp.totalRenderTime,
    });
  }
  return tree;
}

function getSignal(id) {
  const entry = signalRegistry.get(id);
  if (!entry) return undefined;
  return { id: entry.id, name: entry.name, value: entry.getter() };
}

function setSignal(id, value) {
  const entry = signalRegistry.get(id);
  if (!entry) return false;
  entry.setter(value);
  return true;
}

function getOwnershipTree() {
  // Walk component registry to build a flat representation
  const tree = [];
  for (const [id, comp] of componentRegistry) {
    tree.push({ id, name: comp.name, renderCount: comp.renderCount });
  }
  return tree;
}

function perfSummary() {
  const totalRenders = perfData.renders.length;
  const totalRenderTime = perfData.renders.reduce((s, r) => s + r.duration, 0);
  const totalEffects = perfData.effects.length;
  const totalEffectTime = perfData.effects.reduce((s, e) => s + e.duration, 0);
  const totalSignalUpdates = perfData.signals.length;

  return {
    totalRenders,
    totalRenderTime,
    avgRenderTime: totalRenders ? totalRenderTime / totalRenders : 0,
    totalEffects,
    totalEffectTime,
    avgEffectTime: totalEffects ? totalEffectTime / totalEffects : 0,
    totalSignalUpdates,
  };
}

function clearPerf() {
  perfData.renders.length = 0;
  perfData.effects.length = 0;
  perfData.signals.length = 0;

  for (const [, entry] of effectRegistry) {
    entry.executionCount = 0;
    entry.totalTime = 0;
    entry.lastTime = 0;
  }
}

// ─── Init ─────────────────────────────────────────────────

export function initDevTools() {
  // Wire hooks into the reactivity system
  __enableDevTools(hooks);

  // Expose on window for console access
  if (typeof window !== 'undefined') {
    window.__TOVA_DEVTOOLS__ = {
      components: componentRegistry,
      getComponentTree,
      signals: signalRegistry,
      getSignal,
      setSignal,
      effects: effectRegistry,
      getOwnershipTree,
    };

    window.__TOVA_PERF__ = {
      renders: perfData.renders,
      effects: perfData.effects,
      signals: perfData.signals,
      summary: perfSummary,
      clear: clearPerf,
    };
  }

  return {
    components: componentRegistry,
    getComponentTree,
    signals: signalRegistry,
    getSignal,
    setSignal,
    effects: effectRegistry,
    getOwnershipTree,
    perf: {
      renders: perfData.renders,
      effects: perfData.effects,
      signals: perfData.signals,
      summary: perfSummary,
      clear: clearPerf,
    },
  };
}

// ─── Exported for testing ─────────────────────────────────

export { hooks as __devtools_hooks_internal };
