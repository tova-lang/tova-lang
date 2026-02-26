// Scope and symbol management for the Tova analyzer

export class Symbol {
  constructor(name, kind, type, mutable, loc) {
    this.name = name;
    this.kind = kind;       // 'variable', 'function', 'type', 'parameter', 'state', 'computed', 'component'
    this.type = type;       // Type object or raw type annotation (optional)
    this.mutable = mutable; // true for 'var' declarations
    this.loc = loc;
    this.used = false;
    this.declaredType = null; // raw annotation for display purposes
  }
}

export class Scope {
  constructor(parent = null, context = 'module') {
    this.parent = parent;
    this.context = context; // 'module', 'server', 'browser', 'shared', 'function', 'block'
    this.symbols = new Map();
    this.children = [];
    this.startLoc = null; // { line, column } for positional scope lookup
    this.endLoc = null;
    this._indexed = false;
  }

  define(name, symbol) {
    if (this.symbols.has(name)) {
      const existing = this.symbols.get(name);
      // Allow user code to shadow builtins
      if (existing.kind === 'builtin') {
        this.symbols.set(name, symbol);
        return;
      }
      throw new Error(
        `${symbol.loc.file}:${symbol.loc.line}:${symbol.loc.column} — '${name}' is already defined in this scope`
      );
    }
    this.symbols.set(name, symbol);
  }

  lookup(name) {
    if (this.symbols.has(name)) {
      return this.symbols.get(name);
    }
    if (this.parent) {
      return this.parent.lookup(name);
    }
    return null;
  }

  lookupLocal(name) {
    return this.symbols.get(name) || null;
  }

  getContext() {
    if (this.context === 'server' || this.context === 'browser' || this.context === 'client' || this.context === 'shared') {
      return this.context;
    }
    if (this.parent) {
      return this.parent.getContext();
    }
    return 'module';
  }

  child(context) {
    const c = new Scope(this, context || this.context);
    this.children.push(c);
    return c;
  }

  /**
   * Build a sorted index of children for fast binary-search lookup.
   * Call once after analysis is complete.
   */
  buildIndex() {
    // Sort children with position info by start line, then column
    if (this.children.length > 1) {
      this.children.sort((a, b) => {
        if (!a.startLoc) return 1;
        if (!b.startLoc) return -1;
        if (a.startLoc.line !== b.startLoc.line) return a.startLoc.line - b.startLoc.line;
        return a.startLoc.column - b.startLoc.column;
      });
    }
    this._indexed = true;
    for (const child of this.children) {
      child.buildIndex();
    }
  }

  /**
   * Find the narrowest scope containing a given position.
   * Uses binary search if buildIndex() has been called.
   */
  findScopeAtPosition(line, column) {
    if (this._indexed && this.children.length > 4) {
      return this._findScopeIndexed(line, column);
    }
    // Linear fallback for small lists or un-indexed scopes
    for (const child of this.children) {
      if (child.startLoc && child.endLoc) {
        if ((line > child.startLoc.line || (line === child.startLoc.line && column >= child.startLoc.column)) &&
            (line < child.endLoc.line || (line === child.endLoc.line && column <= child.endLoc.column))) {
          const nested = child.findScopeAtPosition(line, column);
          return nested || child;
        }
      } else {
        const nested = child.findScopeAtPosition(line, column);
        if (nested) return nested;
      }
    }
    if (this.startLoc && this.endLoc) {
      if ((line > this.startLoc.line || (line === this.startLoc.line && column >= this.startLoc.column)) &&
          (line < this.endLoc.line || (line === this.endLoc.line && column <= this.endLoc.column))) {
        return this;
      }
    }
    return null;
  }

  _findScopeIndexed(line, column) {
    // Binary search for the last child whose start is <= target position
    const children = this.children;
    let lo = 0, hi = children.length - 1;
    let candidate = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = children[mid];
      if (!c.startLoc) { lo = mid + 1; continue; }
      if (c.startLoc.line < line || (c.startLoc.line === line && c.startLoc.column <= column)) {
        candidate = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    // Check candidate and neighbors (scopes can nest, so check a small window)
    if (candidate >= 0) {
      // Check candidate and up to 2 before it (overlapping scopes)
      const start = Math.max(0, candidate - 2);
      const end = Math.min(children.length - 1, candidate + 1);
      for (let i = start; i <= end; i++) {
        const child = children[i];
        if (child.startLoc && child.endLoc) {
          if ((line > child.startLoc.line || (line === child.startLoc.line && column >= child.startLoc.column)) &&
              (line < child.endLoc.line || (line === child.endLoc.line && column <= child.endLoc.column))) {
            const nested = child.findScopeAtPosition(line, column);
            return nested || child;
          }
        }
      }
    }

    // Fallback: check children without position info
    for (const child of children) {
      if (!child.startLoc) {
        const nested = child.findScopeAtPosition(line, column);
        if (nested) return nested;
      }
    }

    if (this.startLoc && this.endLoc) {
      if ((line > this.startLoc.line || (line === this.startLoc.line && column >= this.startLoc.column)) &&
          (line < this.endLoc.line || (line === this.endLoc.line && column <= this.endLoc.column))) {
        return this;
      }
    }
    return null;
  }
}
