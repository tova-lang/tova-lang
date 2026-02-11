// Scope and symbol management for the Lux analyzer

export class Symbol {
  constructor(name, kind, type, mutable, loc) {
    this.name = name;
    this.kind = kind;       // 'variable', 'function', 'type', 'parameter', 'state', 'computed', 'component'
    this.type = type;       // type annotation (optional)
    this.mutable = mutable; // true for 'var' declarations
    this.loc = loc;
    this.used = false;
  }
}

export class Scope {
  constructor(parent = null, context = 'module') {
    this.parent = parent;
    this.context = context; // 'module', 'server', 'client', 'shared', 'function', 'block'
    this.symbols = new Map();
  }

  define(name, symbol) {
    if (this.symbols.has(name)) {
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
    return new Scope(this, context || this.context);
  }
}
