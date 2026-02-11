import { Scope, Symbol } from './scope.js';

export class Analyzer {
  constructor(ast, filename = '<stdin>') {
    this.ast = ast;
    this.filename = filename;
    this.errors = [];
    this.warnings = [];
    this.globalScope = new Scope(null, 'module');
    this.currentScope = this.globalScope;

    // Register built-in types
    this.registerBuiltins();
  }

  registerBuiltins() {
    const builtins = [
      'Int', 'Float', 'String', 'Bool', 'Nil', 'Any',
      'print', 'range', 'len', 'type_of', 'enumerate', 'zip',
      'map', 'filter', 'reduce', 'sum', 'sorted', 'reversed',
      'fetch', 'db',
    ];
    for (const name of builtins) {
      this.globalScope.define(name, new Symbol(name, 'builtin', null, false, { line: 0, column: 0, file: '<builtin>' }));
    }
  }

  error(message, loc) {
    const l = loc || { line: 0, column: 0, file: this.filename };
    this.errors.push({
      message,
      file: l.file || this.filename,
      line: l.line,
      column: l.column,
    });
  }

  warn(message, loc) {
    const l = loc || { line: 0, column: 0, file: this.filename };
    this.warnings.push({
      message,
      file: l.file || this.filename,
      line: l.line,
      column: l.column,
    });
  }

  analyze() {
    this.visitProgram(this.ast);

    if (this.errors.length > 0) {
      const msgs = this.errors.map(e => `  ${e.file}:${e.line}:${e.column} — ${e.message}`);
      throw new Error(`Analysis errors:\n${msgs.join('\n')}`);
    }

    return { warnings: this.warnings, scope: this.globalScope };
  }

  // ─── Visitors ─────────────────────────────────────────────

  visitProgram(node) {
    for (const stmt of node.body) {
      this.visitNode(stmt);
    }
  }

  visitNode(node) {
    if (!node) return;

    switch (node.type) {
      case 'ServerBlock': return this.visitServerBlock(node);
      case 'ClientBlock': return this.visitClientBlock(node);
      case 'SharedBlock': return this.visitSharedBlock(node);
      case 'Assignment': return this.visitAssignment(node);
      case 'VarDeclaration': return this.visitVarDeclaration(node);
      case 'LetDestructure': return this.visitLetDestructure(node);
      case 'FunctionDeclaration': return this.visitFunctionDeclaration(node);
      case 'TypeDeclaration': return this.visitTypeDeclaration(node);
      case 'ImportDeclaration': return this.visitImportDeclaration(node);
      case 'ImportDefault': return this.visitImportDefault(node);
      case 'IfStatement': return this.visitIfStatement(node);
      case 'ForStatement': return this.visitForStatement(node);
      case 'WhileStatement': return this.visitWhileStatement(node);
      case 'ReturnStatement': return this.visitReturnStatement(node);
      case 'ExpressionStatement': return this.visitExpression(node.expression);
      case 'BlockStatement': return this.visitBlock(node);
      case 'CompoundAssignment': return this.visitCompoundAssignment(node);
      case 'StateDeclaration': return this.visitStateDeclaration(node);
      case 'ComputedDeclaration': return this.visitComputedDeclaration(node);
      case 'EffectDeclaration': return this.visitEffectDeclaration(node);
      case 'ComponentDeclaration': return this.visitComponentDeclaration(node);
      case 'RouteDeclaration': return this.visitRouteDeclaration(node);
      default:
        // Expression nodes
        this.visitExpression(node);
    }
  }

  visitExpression(node) {
    if (!node) return;

    switch (node.type) {
      case 'Identifier':
        return this.visitIdentifier(node);
      case 'NumberLiteral':
      case 'StringLiteral':
      case 'BooleanLiteral':
      case 'NilLiteral':
        return;
      case 'TemplateLiteral':
        for (const part of node.parts) {
          if (part.type === 'expr') this.visitExpression(part.value);
        }
        return;
      case 'BinaryExpression':
        this.visitExpression(node.left);
        this.visitExpression(node.right);
        return;
      case 'UnaryExpression':
        this.visitExpression(node.operand);
        return;
      case 'LogicalExpression':
        this.visitExpression(node.left);
        this.visitExpression(node.right);
        return;
      case 'ChainedComparison':
        for (const op of node.operands) this.visitExpression(op);
        return;
      case 'MembershipExpression':
        this.visitExpression(node.value);
        this.visitExpression(node.collection);
        return;
      case 'CallExpression':
        this.visitExpression(node.callee);
        for (const arg of node.arguments) {
          if (arg.type === 'NamedArgument') {
            this.visitExpression(arg.value);
          } else {
            this.visitExpression(arg);
          }
        }
        return;
      case 'MemberExpression':
      case 'OptionalChain':
        this.visitExpression(node.object);
        if (node.computed) this.visitExpression(node.property);
        return;
      case 'PipeExpression':
        this.visitExpression(node.left);
        this.visitExpression(node.right);
        return;
      case 'LambdaExpression':
        return this.visitLambda(node);
      case 'MatchExpression':
        return this.visitMatchExpression(node);
      case 'ArrayLiteral':
        for (const el of node.elements) this.visitExpression(el);
        return;
      case 'ObjectLiteral':
        for (const prop of node.properties) {
          this.visitExpression(prop.key);
          this.visitExpression(prop.value);
        }
        return;
      case 'ListComprehension':
        return this.visitListComprehension(node);
      case 'DictComprehension':
        return this.visitDictComprehension(node);
      case 'RangeExpression':
        this.visitExpression(node.start);
        this.visitExpression(node.end);
        return;
      case 'SliceExpression':
        this.visitExpression(node.object);
        if (node.start) this.visitExpression(node.start);
        if (node.end) this.visitExpression(node.end);
        if (node.step) this.visitExpression(node.step);
        return;
      case 'SpreadExpression':
        this.visitExpression(node.argument);
        return;
      case 'JSXElement':
        return this.visitJSXElement(node);
    }
  }

  // ─── Block visitors ───────────────────────────────────────

  visitServerBlock(node) {
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('server');
    for (const stmt of node.body) {
      this.visitNode(stmt);
    }
    this.currentScope = prevScope;
  }

  visitClientBlock(node) {
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('client');
    for (const stmt of node.body) {
      this.visitNode(stmt);
    }
    this.currentScope = prevScope;
  }

  visitSharedBlock(node) {
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('shared');
    for (const stmt of node.body) {
      this.visitNode(stmt);
    }
    this.currentScope = prevScope;
  }

  // ─── Declaration visitors ─────────────────────────────────

  visitAssignment(node) {
    // Check if any target is already defined (immutable reassignment check)
    for (const target of node.targets) {
      const existing = this.currentScope.lookupLocal(target);
      if (existing) {
        if (!existing.mutable) {
          this.error(`Cannot reassign immutable variable '${target}'. Use 'var' for mutable variables.`, node.loc);
        }
      } else {
        // New binding — define in current scope
        try {
          this.currentScope.define(target,
            new Symbol(target, 'variable', null, false, node.loc));
        } catch (e) {
          this.error(e.message);
        }
      }
    }

    for (const val of node.values) {
      this.visitExpression(val);
    }
  }

  visitVarDeclaration(node) {
    for (const target of node.targets) {
      try {
        this.currentScope.define(target,
          new Symbol(target, 'variable', null, true, node.loc));
      } catch (e) {
        this.error(e.message);
      }
    }
    for (const val of node.values) {
      this.visitExpression(val);
    }
  }

  visitLetDestructure(node) {
    this.visitExpression(node.value);

    if (node.pattern.type === 'ObjectPattern') {
      for (const prop of node.pattern.properties) {
        try {
          this.currentScope.define(prop.value,
            new Symbol(prop.value, 'variable', null, false, node.loc));
        } catch (e) {
          this.error(e.message);
        }
      }
    } else if (node.pattern.type === 'ArrayPattern') {
      for (const el of node.pattern.elements) {
        if (el) {
          try {
            this.currentScope.define(el,
              new Symbol(el, 'variable', null, false, node.loc));
          } catch (e) {
            this.error(e.message);
          }
        }
      }
    }
  }

  visitFunctionDeclaration(node) {
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'function', node.returnType, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }

    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('function');

    for (const param of node.params) {
      try {
        this.currentScope.define(param.name,
          new Symbol(param.name, 'parameter', param.typeAnnotation, false, param.loc));
      } catch (e) {
        this.error(e.message);
      }
      if (param.defaultValue) {
        this.visitExpression(param.defaultValue);
      }
    }

    this.visitNode(node.body);
    this.currentScope = prevScope;
  }

  visitTypeDeclaration(node) {
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'type', null, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }

    // Define variant constructors as functions
    for (const variant of node.variants) {
      if (variant.type === 'TypeVariant') {
        try {
          this.currentScope.define(variant.name,
            new Symbol(variant.name, 'function', null, false, variant.loc));
        } catch (e) {
          this.error(e.message);
        }
      }
    }
  }

  visitImportDeclaration(node) {
    for (const spec of node.specifiers) {
      try {
        this.currentScope.define(spec.local,
          new Symbol(spec.local, 'variable', null, false, spec.loc));
      } catch (e) {
        this.error(e.message);
      }
    }
  }

  visitImportDefault(node) {
    try {
      this.currentScope.define(node.local,
        new Symbol(node.local, 'variable', null, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }
  }

  // ─── Statement visitors ───────────────────────────────────

  visitBlock(node) {
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');
    for (const stmt of node.body) {
      this.visitNode(stmt);
    }
    this.currentScope = prevScope;
  }

  visitIfStatement(node) {
    this.visitExpression(node.condition);
    this.visitNode(node.consequent);
    for (const alt of node.alternates) {
      this.visitExpression(alt.condition);
      this.visitNode(alt.body);
    }
    if (node.elseBody) {
      this.visitNode(node.elseBody);
    }
  }

  visitForStatement(node) {
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');

    this.visitExpression(node.iterable);

    // Define loop variable(s)
    const vars = Array.isArray(node.variable) ? node.variable : [node.variable];
    for (const v of vars) {
      try {
        this.currentScope.define(v,
          new Symbol(v, 'variable', null, false, node.loc));
      } catch (e) {
        this.error(e.message);
      }
    }

    this.visitNode(node.body);
    this.currentScope = prevScope;

    if (node.elseBody) {
      this.visitNode(node.elseBody);
    }
  }

  visitWhileStatement(node) {
    this.visitExpression(node.condition);
    this.visitNode(node.body);
  }

  visitReturnStatement(node) {
    if (node.value) {
      this.visitExpression(node.value);
    }
  }

  visitCompoundAssignment(node) {
    // Target must be mutable
    if (node.target.type === 'Identifier') {
      const sym = this.currentScope.lookup(node.target.name);
      if (sym && !sym.mutable && sym.kind !== 'builtin') {
        this.error(`Cannot use '${node.operator}' on immutable variable '${node.target.name}'`, node.loc);
      }
    }
    this.visitExpression(node.target);
    this.visitExpression(node.value);
  }

  // ─── Client-specific visitors ─────────────────────────────

  visitStateDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'client') {
      this.error(`'state' can only be used inside a client block`, node.loc);
    }
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'state', node.typeAnnotation, true, node.loc));
    } catch (e) {
      this.error(e.message);
    }
    this.visitExpression(node.initialValue);
  }

  visitComputedDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'client') {
      this.error(`'computed' can only be used inside a client block`, node.loc);
    }
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'computed', null, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }
    this.visitExpression(node.expression);
  }

  visitEffectDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'client') {
      this.error(`'effect' can only be used inside a client block`, node.loc);
    }
    this.visitNode(node.body);
  }

  visitComponentDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'client') {
      this.error(`'component' can only be used inside a client block`, node.loc);
    }
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'component', null, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }

    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('function');
    for (const param of node.params) {
      try {
        this.currentScope.define(param.name,
          new Symbol(param.name, 'parameter', param.typeAnnotation, false, param.loc));
      } catch (e) {
        this.error(e.message);
      }
    }
    for (const child of node.body) {
      this.visitNode(child);
    }
    this.currentScope = prevScope;
  }

  visitRouteDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'route' can only be used inside a server block`, node.loc);
    }
    this.visitExpression(node.handler);
  }

  // ─── Expression visitors ──────────────────────────────────

  visitIdentifier(node) {
    if (node.name === '_') return; // wildcard is always valid

    const sym = this.currentScope.lookup(node.name);
    if (!sym) {
      // Allow server.xxx in client context (RPC calls)
      // Don't error on unknown identifiers — could be globals
      // We'll just warn for now, strict mode can enforce later
    } else {
      sym.used = true;
    }
  }

  visitLambda(node) {
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('function');
    for (const param of node.params) {
      try {
        this.currentScope.define(param.name,
          new Symbol(param.name, 'parameter', param.typeAnnotation, false, param.loc));
      } catch (e) {
        this.error(e.message);
      }
    }
    if (node.body.type === 'BlockStatement') {
      this.visitNode(node.body);
    } else {
      this.visitExpression(node.body);
    }
    this.currentScope = prevScope;
  }

  visitMatchExpression(node) {
    this.visitExpression(node.subject);
    for (const arm of node.arms) {
      const prevScope = this.currentScope;
      this.currentScope = this.currentScope.child('block');

      this.visitPattern(arm.pattern);
      if (arm.guard) this.visitExpression(arm.guard);

      if (arm.body.type === 'BlockStatement') {
        this.visitNode(arm.body);
      } else {
        this.visitExpression(arm.body);
      }
      this.currentScope = prevScope;
    }
  }

  visitPattern(pattern) {
    if (!pattern) return;

    switch (pattern.type) {
      case 'WildcardPattern':
      case 'LiteralPattern':
      case 'RangePattern':
        break;
      case 'BindingPattern':
        try {
          this.currentScope.define(pattern.name,
            new Symbol(pattern.name, 'variable', null, false, pattern.loc));
        } catch (e) {
          this.error(e.message);
        }
        break;
      case 'VariantPattern':
        for (const field of pattern.fields) {
          try {
            this.currentScope.define(field,
              new Symbol(field, 'variable', null, false, pattern.loc));
          } catch (e) {
            this.error(e.message);
          }
        }
        break;
    }
  }

  visitListComprehension(node) {
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');

    this.visitExpression(node.iterable);
    try {
      this.currentScope.define(node.variable,
        new Symbol(node.variable, 'variable', null, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }
    if (node.condition) this.visitExpression(node.condition);
    this.visitExpression(node.expression);

    this.currentScope = prevScope;
  }

  visitDictComprehension(node) {
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');

    this.visitExpression(node.iterable);
    for (const v of node.variables) {
      try {
        this.currentScope.define(v,
          new Symbol(v, 'variable', null, false, node.loc));
      } catch (e) {
        this.error(e.message);
      }
    }
    if (node.condition) this.visitExpression(node.condition);
    this.visitExpression(node.key);
    this.visitExpression(node.value);

    this.currentScope = prevScope;
  }

  visitJSXElement(node) {
    for (const attr of node.attributes) {
      this.visitExpression(attr.value);
    }
    for (const child of node.children) {
      if (child.type === 'JSXElement') {
        this.visitJSXElement(child);
      } else if (child.type === 'JSXExpression') {
        this.visitExpression(child.expression);
      } else if (child.type === 'JSXFor') {
        this.visitJSXFor(child);
      } else if (child.type === 'JSXIf') {
        this.visitJSXIf(child);
      }
    }
  }

  visitJSXFor(node) {
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');
    this.visitExpression(node.iterable);
    try {
      this.currentScope.define(node.variable,
        new Symbol(node.variable, 'variable', null, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }
    for (const child of node.body) {
      this.visitNode(child);
    }
    this.currentScope = prevScope;
  }

  visitJSXIf(node) {
    this.visitExpression(node.condition);
    for (const child of node.consequent) {
      this.visitNode(child);
    }
    if (node.alternate) {
      for (const child of node.alternate) {
        this.visitNode(child);
      }
    }
  }
}
