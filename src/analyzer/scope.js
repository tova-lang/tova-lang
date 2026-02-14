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
    this.context = context; // 'module', 'server', 'client', 'shared', 'function', 'block'
    this.symbols = new Map();
    this.children = [];
    this.startLoc = null; // { line, column } for positional scope lookup
    this.endLoc = null;
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
    if (this.context === 'server' || this.context === 'client' || this.context === 'shared') {
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
   * Find the narrowest scope containing a given position.
   */
  findScopeAtPosition(line, column) {
    // Check children first (narrower scopes)
    for (const child of this.children) {
      if (child.startLoc && child.endLoc) {
        if ((line > child.startLoc.line || (line === child.startLoc.line && column >= child.startLoc.column)) &&
            (line < child.endLoc.line || (line === child.endLoc.line && column <= child.endLoc.column))) {
          const nested = child.findScopeAtPosition(line, column);
          return nested || child;
        }
      } else {
        // No position info — recurse anyway
        const nested = child.findScopeAtPosition(line, column);
        if (nested) return nested;
      }
    }
    // If this scope contains the position, return this
    if (this.startLoc && this.endLoc) {
      if ((line > this.startLoc.line || (line === this.startLoc.line && column >= this.startLoc.column)) &&
          (line < this.endLoc.line || (line === this.endLoc.line && column <= this.endLoc.column))) {
        return this;
      }
    }
    return null;
  }
}
