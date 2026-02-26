// Block Registry — central registry for block-type plugins.
// Each plugin describes how to detect, parse, analyze, and codegen a block type.

const _plugins = new Map();       // name → plugin
const _astTypeMap = new Map();    // astNodeType → plugin | _NOOP_SENTINEL
const _order = [];                // registration order

// Sentinel value for noop AST types (returned by getByAstType to avoid a second lookup)
const _NOOP_SENTINEL = Object.freeze({ __noop: true });

export const BlockRegistry = {
  NOOP: _NOOP_SENTINEL,

  register(plugin) {
    if (_plugins.has(plugin.name)) {
      throw new Error(`Block plugin "${plugin.name}" already registered`);
    }
    _plugins.set(plugin.name, plugin);
    _order.push(plugin);

    // Map primary AST node type
    if (plugin.astNodeType) {
      _astTypeMap.set(plugin.astNodeType, plugin);
    }

    // Map child AST node types (for analyzer dispatch)
    if (plugin.analyzer?.childNodeTypes) {
      for (const t of plugin.analyzer.childNodeTypes) {
        _astTypeMap.set(t, plugin);
      }
    }

    // Register no-op leaf types as sentinel in the same map
    if (plugin.analyzer?.noopNodeTypes) {
      for (const t of plugin.analyzer.noopNodeTypes) {
        _astTypeMap.set(t, _NOOP_SENTINEL);
      }
    }
  },

  get(name) {
    return _plugins.get(name) || null;
  },

  getByAstType(type) {
    return _astTypeMap.get(type) || null;
  },

  isNoopType(type) {
    return _astTypeMap.get(type) === _NOOP_SENTINEL;
  },

  all() {
    return _order; // callers must not mutate; treated as read-only
  },
};
