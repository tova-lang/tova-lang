import { BaseCodegen } from './base-codegen.js';
import { getClientStdlib, buildSelectiveStdlib, RESULT_OPTION, PROPAGATE } from '../stdlib/inline.js';

export class ClientCodegen extends BaseCodegen {
  constructor() {
    super();
    this.stateNames = new Set(); // Track state variable names for setter transforms
    this.computedNames = new Set(); // Track computed variable names for getter transforms
    this.componentNames = new Set(); // Track component names for JSX
    this.storeNames = new Set(); // Track store names
    this._asyncContext = false; // When true, server.xxx() calls emit `await`
  }

  // AST-walk to check if a subtree contains server.xxx() RPC calls
  _containsRPC(node) {
    if (!node) return false;
    if (node.type === 'CallExpression' && this._isRPCCall(node)) return true;
    if (node.type === 'BlockStatement') return node.body.some(s => this._containsRPC(s));
    if (node.type === 'ExpressionStatement') return this._containsRPC(node.expression);
    if (node.type === 'Assignment') return node.values.some(v => this._containsRPC(v));
    if (node.type === 'VarDeclaration') return node.values.some(v => this._containsRPC(v));
    if (node.type === 'ReturnStatement') return this._containsRPC(node.value);
    if (node.type === 'IfStatement') {
      return this._containsRPC(node.condition) || this._containsRPC(node.consequent) ||
        node.alternates.some(a => this._containsRPC(a.body)) ||
        this._containsRPC(node.elseBody);
    }
    if (node.type === 'IfExpression') {
      return this._containsRPC(node.condition) || this._containsRPC(node.consequent) ||
        (node.alternates && node.alternates.some(a => this._containsRPC(a.condition) || this._containsRPC(a.body))) ||
        this._containsRPC(node.elseBody);
    }
    if (node.type === 'ForStatement') return this._containsRPC(node.iterable) || this._containsRPC(node.body);
    if (node.type === 'WhileStatement') return this._containsRPC(node.condition) || this._containsRPC(node.body);
    if (node.type === 'CallExpression') {
      return this._containsRPC(node.callee) || node.arguments.some(a => this._containsRPC(a));
    }
    if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
      return this._containsRPC(node.left) || this._containsRPC(node.right);
    }
    if (node.type === 'MemberExpression') return this._containsRPC(node.object);
    if (node.type === 'CompoundAssignment') return this._containsRPC(node.value);
    if (node.type === 'LambdaExpression') return this._containsRPC(node.body);
    if (node.type === 'NamedArgument') return this._containsRPC(node.value);
    if (node.type === 'MatchExpression') {
      return this._containsRPC(node.subject) || node.arms.some(a => this._containsRPC(a.body));
    }
    if (node.type === 'TryCatchStatement') {
      return (node.tryBody && node.tryBody.some(s => this._containsRPC(s))) ||
        (node.catchBody && node.catchBody.some(s => this._containsRPC(s))) ||
        (node.finallyBody && node.finallyBody.some(s => this._containsRPC(s)));
    }
    if (node.type === 'PipeExpression') {
      return this._containsRPC(node.left) || this._containsRPC(node.right);
    }
    if (node.type === 'GuardStatement') {
      return this._containsRPC(node.condition) || this._containsRPC(node.elseBody);
    }
    if (node.type === 'LetDestructure') return this._containsRPC(node.value);
    if (node.type === 'ArrayLiteral') return node.elements.some(e => this._containsRPC(e));
    if (node.type === 'ObjectLiteral') return node.properties.some(p => this._containsRPC(p.value));
    if (node.type === 'SpreadExpression') return this._containsRPC(node.argument);
    if (node.type === 'AwaitExpression') return this._containsRPC(node.argument);
    if (node.type === 'PropagateExpression') return this._containsRPC(node.expression);
    if (node.type === 'UnaryExpression') return this._containsRPC(node.operand);
    if (node.type === 'TemplateLiteral') return node.parts.some(p => p.type === 'expr' && this._containsRPC(p.value));
    if (node.type === 'ChainedComparison') return node.operands.some(o => this._containsRPC(o));
    if (node.type === 'RangeExpression') return this._containsRPC(node.start) || this._containsRPC(node.end);
    if (node.type === 'SliceExpression') return this._containsRPC(node.object) || this._containsRPC(node.start) || this._containsRPC(node.end) || this._containsRPC(node.step);
    if (node.type === 'ListComprehension') return this._containsRPC(node.iterable) || this._containsRPC(node.expression) || this._containsRPC(node.condition);
    if (node.type === 'DictComprehension') return this._containsRPC(node.iterable) || this._containsRPC(node.key) || this._containsRPC(node.value) || this._containsRPC(node.condition);
    if (node.type === 'DeferStatement') return this._containsRPC(node.body);
    return false;
  }

  _isRPCCall(node) {
    return node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      node.callee.object.type === 'Identifier' &&
      node.callee.object.name === 'server';
  }

  // Override genCallExpression to add await for server.xxx() in async context
  genCallExpression(node) {
    const isRPC = this._isRPCCall(node);
    const base = super.genCallExpression(node);
    if (isRPC && this._asyncContext) {
      return `await ${base}`;
    }
    return base;
  }

  // Override to add () for signal/computed reads
  genExpression(node) {
    if (node && node.type === 'Identifier' &&
        (this.stateNames.has(node.name) || this.computedNames.has(node.name))) {
      return `${node.name}()`;
    }
    return super.genExpression(node);
  }

  // Override to transform state assignments to setter calls
  generateStatement(node) {
    if (!node) return '';

    // Intercept compound assignments to state variables: count += 1 → setCount(prev => prev + 1)
    if (node.type === 'CompoundAssignment' && node.target.type === 'Identifier' && this.stateNames.has(node.target.name)) {
      const name = node.target.name;
      const setter = `set${capitalize(name)}`;
      const op = node.operator[0]; // += → +, -= → -, etc.
      const val = this.genExpression(node.value);
      return `${this.i()}${setter}(__tova_p => __tova_p ${op} ${val});`;
    }

    // Intercept assignments to state variables: count = 0 → setCount(0)
    if (node.type === 'Assignment' && node.targets.length === 1 && this.stateNames.has(node.targets[0])) {
      const name = node.targets[0];
      const setter = `set${capitalize(name)}`;
      const val = this.genExpression(node.values[0]);
      return `${this.i()}${setter}(${val});`;
    }

    return super.generateStatement(node);
  }

  // Override lambda expression to handle state mutations in lambda bodies
  genLambdaExpression(node) {
    const params = this.genParams(node.params);
    const hasPropagate = this._containsPropagate(node.body);
    const asyncPrefix = node.isAsync ? 'async ' : '';

    if (node.body.type === 'BlockStatement') {
      this.pushScope();
      for (const p of node.params) { if (p.destructure) this._declareDestructureVars(p.destructure); else this.declareVar(p.name); }
      const body = this.genBlockBody(node.body);
      this.popScope();
      if (hasPropagate) {
        return `${asyncPrefix}(${params}) => {\n${this.i()}  try {\n${body}\n${this.i()}  } catch (__e) {\n${this.i()}    if (__e && __e.__tova_propagate) return __e.value;\n${this.i()}    throw __e;\n${this.i()}  }\n${this.i()}}`;
      }
      return `${asyncPrefix}(${params}) => {\n${body}\n${this.i()}}`;
    }

    // Compound assignment in lambda body: fn() count += 1
    if (node.body.type === 'CompoundAssignment' && node.body.target.type === 'Identifier' && this.stateNames.has(node.body.target.name)) {
      const name = node.body.target.name;
      const setter = `set${capitalize(name)}`;
      const op = node.body.operator[0];
      const val = this.genExpression(node.body.value);
      return `${asyncPrefix}(${params}) => { ${setter}(__tova_p => __tova_p ${op} ${val}); }`;
    }

    // Assignment in lambda body: fn() count = 0
    if (node.body.type === 'Assignment' && node.body.targets.length === 1 && this.stateNames.has(node.body.targets[0])) {
      const name = node.body.targets[0];
      const setter = `set${capitalize(name)}`;
      const val = this.genExpression(node.body.values[0]);
      return `${asyncPrefix}(${params}) => { ${setter}(${val}); }`;
    }

    // Non-state statement bodies
    if (node.body.type === 'CompoundAssignment' || node.body.type === 'Assignment' || node.body.type === 'VarDeclaration') {
      this.pushScope();
      for (const p of node.params) { if (p.destructure) this._declareDestructureVars(p.destructure); else this.declareVar(p.name); }
      this.indent++;
      const stmt = super.generateStatement(node.body);
      this.indent--;
      this.popScope();
      return `${asyncPrefix}(${params}) => { ${stmt.trim()} }`;
    }

    if (hasPropagate) {
      return `${asyncPrefix}(${params}) => { try { return ${this.genExpression(node.body)}; } catch (__e) { if (__e && __e.__tova_propagate) return __e.value; throw __e; } }`;
    }
    return `${asyncPrefix}(${params}) => ${this.genExpression(node.body)}`;
  }

  generate(clientBlocks, sharedCode, sharedBuiltins = null) {
    this._sharedBuiltins = sharedBuiltins || new Set();
    const lines = [];

    // Runtime imports
    lines.push(`import { createSignal, createEffect, createComputed, mount, hydrate, tova_el, tova_fragment, tova_keyed, tova_inject_css, batch, onMount, onUnmount, onCleanup, createRef, createContext, provide, inject, createErrorBoundary, ErrorBoundary, createRoot, watch, untrack, Dynamic, Portal, lazy } from './runtime/reactivity.js';`);
    lines.push(`import { rpc } from './runtime/rpc.js';`);

    // Hoist import lines from shared code to the top of the module
    let sharedRest = sharedCode;
    if (sharedCode.trim()) {
      const sharedLines = sharedCode.split('\n');
      const importLines = [];
      const nonImportLines = [];
      for (const line of sharedLines) {
        if (/^\s*import\s+/.test(line)) {
          importLines.push(line);
        } else {
          nonImportLines.push(line);
        }
      }
      if (importLines.length > 0) {
        for (const imp of importLines) {
          lines.push(imp);
        }
      }
      sharedRest = nonImportLines.join('\n');
    }

    lines.push('');

    // Shared code (non-import lines)
    if (sharedRest.trim()) {
      lines.push('// ── Shared ──');
      lines.push(sharedRest);
      lines.push('');
    }

    // Stdlib placeholder — filled after all client code is generated so tree-shaking sees all usages
    const stdlibPlaceholderIdx = lines.length;
    lines.push('// ── Stdlib ──');
    lines.push('__STDLIB_PLACEHOLDER__');
    lines.push('');

    // Server RPC proxy
    lines.push('// ── Server RPC Proxy ──');
    lines.push('const server = new Proxy({}, {');
    lines.push('  get(_, name) {');
    lines.push('    return (...args) => rpc(name, args);');
    lines.push('  }');
    lines.push('});');
    lines.push('');

    const states = [];
    const computeds = [];
    const effects = [];
    const components = [];
    const stores = [];
    const imports = [];
    const other = [];

    for (const block of clientBlocks) {
      for (const stmt of block.body) {
        switch (stmt.type) {
          case 'StateDeclaration': states.push(stmt); break;
          case 'ComputedDeclaration': computeds.push(stmt); break;
          case 'EffectDeclaration': effects.push(stmt); break;
          case 'ComponentDeclaration': components.push(stmt); break;
          case 'StoreDeclaration': stores.push(stmt); break;
          case 'ImportDeclaration': imports.push(stmt); break;
          case 'ImportDefault': imports.push(stmt); break;
          case 'ImportWildcard': imports.push(stmt); break;
          default: other.push(stmt); break;
        }
      }
    }

    // Generate client block imports (hoisted after runtime imports)
    if (imports.length > 0) {
      lines.push('// ── Client Imports ──');
      for (const stmt of imports) {
        lines.push(this.generateStatement(stmt));
      }
      lines.push('');
    }

    // Register state names for setter transforms
    for (const s of states) {
      this.stateNames.add(s.name);
    }

    // Register computed names for getter transforms
    for (const c of computeds) {
      this.computedNames.add(c.name);
    }

    // Register component names
    for (const comp of components) {
      this.componentNames.add(comp.name);
    }

    // Register store names
    for (const store of stores) {
      this.storeNames.add(store.name);
    }

    // Generate state signals
    if (states.length > 0) {
      lines.push('// ── Reactive State ──');
      for (const s of states) {
        const init = this.genExpression(s.initialValue);
        lines.push(`const [${s.name}, set${capitalize(s.name)}] = createSignal(${init});`);
      }
      lines.push('');
    }

    // Generate computed values
    if (computeds.length > 0) {
      lines.push('// ── Computed Values ──');
      for (const c of computeds) {
        const expr = this.genExpression(c.expression);
        lines.push(`const ${c.name} = createComputed(() => ${expr});`);
      }
      lines.push('');
    }

    // Generate stores
    if (stores.length > 0) {
      lines.push('// ── Stores ──');
      for (const store of stores) {
        lines.push(this.generateStore(store));
        lines.push('');
      }
    }

    // Generate other statements
    for (const stmt of other) {
      lines.push(this.generateStatement(stmt));
    }

    // Generate components
    if (components.length > 0) {
      lines.push('// ── Components ──');
      for (const comp of components) {
        lines.push(this.generateComponent(comp));
        lines.push('');
      }
    }

    // Generate effects
    if (effects.length > 0) {
      lines.push('// ── Effects ──');
      for (const e of effects) {
        lines.push(this._generateEffect(e.body));
        lines.push('');
      }
    }

    // Include __contains helper if needed
    if (this._needsContainsHelper) {
      lines.push('// ── Runtime Helpers ──');
      lines.push(this.getContainsHelper());
      lines.push('');
    }

    // Auto-mount the App component if it exists
    // Auto-detect SSR: if the container already has children, hydrate instead of mount
    const hasApp = components.some(c => c.name === 'App');
    if (hasApp) {
      lines.push('// ── Mount ──');
      lines.push('document.addEventListener("DOMContentLoaded", () => {');
      lines.push('  const container = document.getElementById("app") || document.body;');
      lines.push('  if (container.children.length > 0) {');
      lines.push('    hydrate(App, container);');
      lines.push('  } else {');
      lines.push('    mount(App, container);');
      lines.push('  }');
      lines.push('});');
    }

    // Replace stdlib placeholder now that all client code has been generated
    lines[stdlibPlaceholderIdx + 1] = this.getStdlibCore();

    return lines.join('\n');
  }

  _generateEffect(body) {
    const hasRPC = this._containsRPC(body);
    let code;
    if (hasRPC) {
      code = `createEffect(() => {\n`;
      code += `${this.i()}  (async () => {\n`;
      this.indent += 2;
      const prevAsync = this._asyncContext;
      this._asyncContext = true;
      code += this.genBlockStatements(body);
      this._asyncContext = prevAsync;
      this.indent -= 2;
      code += `\n${this.i()}  })();\n`;
      code += `${this.i()}});`;
    } else {
      code = `createEffect(() => {\n`;
      this.indent++;
      code += this.genBlockStatements(body);
      this.indent--;
      code += `\n${this.i()}});`;
    }
    return code;
  }

  // Generate a short hash from component name + CSS content (for CSS scoping)
  _genScopeId(name, css) {
    const str = name + ':' + (css || '');
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36).slice(0, 6);
  }

  // Scope CSS selectors by appending [data-tova-HASH] to each selector
  _scopeCSS(css, scopeAttr) {
    return css.replace(/([^{}@/]+)\{/g, (match, selectorGroup) => {
      const selectors = selectorGroup.split(',').map(s => {
        s = s.trim();
        if (!s || s.startsWith('@') || s === 'from' || s === 'to' || /^\d+%$/.test(s)) return s;
        // Handle pseudo-elements (::before, ::after)
        const pseudoElMatch = s.match(/(::[\w-]+)$/);
        if (pseudoElMatch) {
          return s.slice(0, -pseudoElMatch[0].length) + scopeAttr + pseudoElMatch[0];
        }
        // Handle pseudo-classes (:hover, :focus, etc.)
        const pseudoClsMatch = s.match(/(:[\w-]+(?:\([^)]*\))?)$/);
        if (pseudoClsMatch) {
          return s.slice(0, -pseudoClsMatch[0].length) + scopeAttr + pseudoClsMatch[0];
        }
        return s + scopeAttr;
      }).join(', ');
      return selectors + ' {';
    });
  }

  generateComponent(comp) {
    const hasParams = comp.params.length > 0;
    const paramStr = hasParams ? '__props' : '';

    // Save state/computed names so component-local names don't leak
    const savedState = new Set(this.stateNames);
    const savedComputed = new Set(this.computedNames);

    let code = `function ${comp.name}(${paramStr}) {\n`;
    this.indent++;

    // Generate reactive prop accessors — each prop is accessed through __props getter
    // This ensures parent signal changes propagate reactively to the child
    if (hasParams) {
      for (const p of comp.params) {
        this.computedNames.add(p.name);
        const def = p.default || p.defaultValue;
        if (def) {
          const defaultExpr = this.genExpression(def);
          code += `${this.i()}const ${p.name} = () => __props.${p.name} !== undefined ? __props.${p.name} : ${defaultExpr};\n`;
        } else {
          code += `${this.i()}const ${p.name} = () => __props.${p.name};\n`;
        }
      }
    }

    // Separate JSX elements, style blocks, and statements
    const jsxElements = [];
    const styleBlocks = [];
    const bodyItems = [];

    for (const node of comp.body) {
      if (node.type === 'JSXElement' || node.type === 'JSXFor' || node.type === 'JSXIf') {
        jsxElements.push(node);
      } else if (node.type === 'ComponentStyleBlock') {
        styleBlocks.push(node);
      } else {
        bodyItems.push(node);
      }
    }

    // Set up scoped CSS if style blocks exist
    const savedScopeId = this._currentScopeId;
    if (styleBlocks.length > 0) {
      const rawCSS = styleBlocks.map(s => s.css).join('\n');
      const scopeId = this._genScopeId(comp.name, rawCSS);
      this._currentScopeId = scopeId;
      const scopedCSS = this._scopeCSS(rawCSS, `[data-tova-${scopeId}]`);
      code += `${this.i()}tova_inject_css(${JSON.stringify(scopeId)}, ${JSON.stringify(scopedCSS)});\n`;
    }

    // Generate body items in order (state, computed, effect, other statements)
    for (const node of bodyItems) {
      if (node.type === 'StateDeclaration') {
        this.stateNames.add(node.name);
        const init = this.genExpression(node.initialValue);
        code += `${this.i()}const [${node.name}, set${capitalize(node.name)}] = createSignal(${init});\n`;
      } else if (node.type === 'ComputedDeclaration') {
        this.computedNames.add(node.name);
        const expr = this.genExpression(node.expression);
        code += `${this.i()}const ${node.name} = createComputed(() => ${expr});\n`;
      } else if (node.type === 'EffectDeclaration') {
        this.indent++;
        const effectCode = this._generateEffect(node.body);
        this.indent--;
        code += `${this.i()}${effectCode}\n`;
      } else {
        code += this.generateStatement(node) + '\n';
      }
    }

    // Generate JSX return
    if (jsxElements.length === 1) {
      code += `${this.i()}return ${this.genJSX(jsxElements[0])};\n`;
    } else if (jsxElements.length > 1) {
      const children = jsxElements.map(el => this.genJSX(el)).join(', ');
      code += `${this.i()}return tova_fragment([${children}]);\n`;
    }

    this.indent--;
    code += `}`;

    // Restore scoped names and scope id
    this.stateNames = savedState;
    this.computedNames = savedComputed;
    this._currentScopeId = savedScopeId;

    return code;
  }

  generateStore(store) {
    // Save/restore state and computed names so store-internal names don't leak
    const savedState = new Set(this.stateNames);
    const savedComputed = new Set(this.computedNames);

    // Collect store-local state and computed names
    const storeStates = [];
    const storeComputeds = [];
    const storeFunctions = [];

    for (const node of store.body) {
      if (node.type === 'StateDeclaration') {
        storeStates.push(node);
        this.stateNames.add(node.name);
      } else if (node.type === 'ComputedDeclaration') {
        storeComputeds.push(node);
        this.computedNames.add(node.name);
      } else if (node.type === 'FunctionDeclaration') {
        storeFunctions.push(node);
      }
    }

    let code = `const ${store.name} = (() => {\n`;
    this.indent++;

    // Generate state signals
    for (const s of storeStates) {
      const init = this.genExpression(s.initialValue);
      code += `${this.i()}const [${s.name}, set${capitalize(s.name)}] = createSignal(${init});\n`;
    }

    // Generate computed values
    for (const c of storeComputeds) {
      const expr = this.genExpression(c.expression);
      code += `${this.i()}const ${c.name} = createComputed(() => ${expr});\n`;
    }

    // Generate functions
    for (const fn of storeFunctions) {
      code += this.genFunctionDeclaration(fn) + '\n';
    }

    // Build return object with getters/setters
    code += `${this.i()}return {\n`;
    this.indent++;

    for (const s of storeStates) {
      code += `${this.i()}get ${s.name}() { return ${s.name}(); },\n`;
      code += `${this.i()}set ${s.name}(v) { set${capitalize(s.name)}(v); },\n`;
    }

    for (const c of storeComputeds) {
      code += `${this.i()}get ${c.name}() { return ${c.name}(); },\n`;
    }

    for (const fn of storeFunctions) {
      code += `${this.i()}${fn.name},\n`;
    }

    this.indent--;
    code += `${this.i()}};\n`;

    this.indent--;
    code += `${this.i()}})();`;

    // Restore state/computed names
    this.stateNames = savedState;
    this.computedNames = savedComputed;

    return code;
  }

  // Check if an AST expression references any signal/computed name
  _exprReadsSignal(node) {
    if (!node) return false;
    if (node.type === 'Identifier') return this.stateNames.has(node.name) || this.computedNames.has(node.name);
    if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
      return this._exprReadsSignal(node.left) || this._exprReadsSignal(node.right);
    }
    if (node.type === 'UnaryExpression') return this._exprReadsSignal(node.operand);
    if (node.type === 'CallExpression') {
      return this._exprReadsSignal(node.callee) || node.arguments.some(a => this._exprReadsSignal(a));
    }
    if (node.type === 'MemberExpression') {
      if (node.object.type === 'Identifier' && this.storeNames.has(node.object.name)) {
        return true; // Store property access is reactive (getters call signals)
      }
      return this._exprReadsSignal(node.object);
    }
    if (node.type === 'TemplateLiteral') {
      return node.parts.some(p => p.type === 'expr' && this._exprReadsSignal(p.value));
    }
    if (node.type === 'ChainedComparison') return node.operands.some(o => this._exprReadsSignal(o));
    if (node.type === 'PipeExpression') return this._exprReadsSignal(node.left) || this._exprReadsSignal(node.right);
    if (node.type === 'ArrayLiteral') return node.elements.some(e => this._exprReadsSignal(e));
    if (node.type === 'ObjectLiteral') return node.properties.some(p => this._exprReadsSignal(p.value));
    if (node.type === 'IfExpression') {
      return this._exprReadsSignal(node.condition) || this._exprReadsSignal(node.consequent) ||
        (node.alternates && node.alternates.some(a => this._exprReadsSignal(a.condition) || this._exprReadsSignal(a.body))) ||
        this._exprReadsSignal(node.elseBody);
    }
    if (node.type === 'MatchExpression') {
      if (this._exprReadsSignal(node.subject)) return true;
      return node.arms.some(arm => this._exprReadsSignal(arm.body));
    }
    if (node.type === 'SpreadExpression') return this._exprReadsSignal(node.argument);
    if (node.type === 'AwaitExpression') return this._exprReadsSignal(node.argument);
    if (node.type === 'RangeExpression') return this._exprReadsSignal(node.start) || this._exprReadsSignal(node.end);
    if (node.type === 'SliceExpression') return this._exprReadsSignal(node.object) || this._exprReadsSignal(node.start) || this._exprReadsSignal(node.end);
    if (node.type === 'ListComprehension') return this._exprReadsSignal(node.iterable) || this._exprReadsSignal(node.expression);
    if (node.type === 'LambdaExpression') return this._exprReadsSignal(node.body);
    if (node.type === 'PropagateExpression') return this._exprReadsSignal(node.expression);
    return false;
  }

  genJSX(node) {
    if (!node) return 'null';

    switch (node.type) {
      case 'JSXElement': return this.genJSXElement(node);
      case 'JSXText': return this.genJSXText(node);
      case 'JSXExpression': {
        // If expression reads a signal, wrap as () => expr for fine-grained reactivity
        const expr = this.genExpression(node.expression);
        if (this._exprReadsSignal(node.expression)) {
          return `() => ${expr}`;
        }
        return expr;
      }
      case 'JSXFor': return this.genJSXFor(node);
      case 'JSXIf': return this.genJSXIf(node);
      default: return this.genExpression(node);
    }
  }

  genJSXElement(node) {
    const isComponent = node.tag[0] === node.tag[0].toUpperCase() && /^[A-Z]/.test(node.tag);

    // Attributes
    const attrs = {};
    const events = {};
    const classDirectives = [];
    const spreads = []; // collected spread expressions

    for (const attr of node.attributes) {
      if (attr.type === 'JSXSpreadAttribute') {
        spreads.push(this.genExpression(attr.expression));
        continue;
      }
      if (attr.name === 'bind:value') {
        // Two-way binding: bind:value={name} → reactive value + event handler
        const expr = this.genExpression(attr.value);
        const reactive = this._exprReadsSignal(attr.value);
        attrs.value = reactive ? `() => ${expr}` : expr;
        const exprName = attr.value.name;
        if (this.stateNames.has(exprName)) {
          // <select> fires 'change', all other inputs fire 'input'
          const eventName = node.tag === 'select' ? 'change' : 'input';
          events[eventName] = `(e) => { set${capitalize(exprName)}(e.target.value); }`;
        }
      } else if (attr.name === 'bind:checked') {
        // Two-way binding: bind:checked={flag} → reactive checked + onChange
        const expr = this.genExpression(attr.value);
        const reactive = this._exprReadsSignal(attr.value);
        attrs.checked = reactive ? `() => ${expr}` : expr;
        const exprName = attr.value.name;
        if (this.stateNames.has(exprName)) {
          events.change = `(e) => { set${capitalize(exprName)}(e.target.checked); }`;
        }
      } else if (attr.name === 'bind:group') {
        // Radio/checkbox group binding
        // For radio: bind:group={selected} → checked = selected === value, onChange sets selected = value
        // For checkbox: bind:group={items} → checked = items.includes(value), onChange toggles value in array
        const expr = this.genExpression(attr.value);
        const exprName = attr.value.name;
        const reactive = this._exprReadsSignal(attr.value);
        // Determine type from other attributes
        const typeAttr = node.attributes.find(a => a.name === 'type');
        const typeStr = typeAttr ? (typeAttr.value.value || '') : '';
        const valueAttr = node.attributes.find(a => a.name === 'value');
        const valueExpr = valueAttr ? this.genExpression(valueAttr.value) : '""';

        if (typeStr === 'checkbox') {
          // Array-based: checked when array includes value
          attrs.checked = reactive
            ? `() => ${expr}.includes(${valueExpr})`
            : `${expr}.includes(${valueExpr})`;
          if (this.stateNames.has(exprName)) {
            events.change = `(e) => { const v = ${valueExpr}; if (e.target.checked) { set${capitalize(exprName)}(__tova_p => [...__tova_p, v]); } else { set${capitalize(exprName)}(__tova_p => __tova_p.filter(x => x !== v)); } }`;
          }
        } else {
          // Radio: single value
          attrs.checked = reactive
            ? `() => ${expr} === ${valueExpr}`
            : `${expr} === ${valueExpr}`;
          if (this.stateNames.has(exprName)) {
            events.change = `(e) => { set${capitalize(exprName)}(${valueExpr}); }`;
          }
        }
      } else if (attr.name.startsWith('class:')) {
        // Conditional class: class:active={cond}
        const className = attr.name.slice(6);
        classDirectives.push({ className, condition: this.genExpression(attr.value), node: attr.value });
      } else if (attr.name.startsWith('on:')) {
        const eventName = attr.name.slice(3);
        events[eventName] = this.genExpression(attr.value);
      } else {
        const attrName = attr.name === 'class' ? 'className' : attr.name;
        const expr = this.genExpression(attr.value);
        const reactive = this._exprReadsSignal(attr.value);
        attrs[attrName] = reactive ? `() => ${expr}` : expr;
      }
    }

    // Merge class directives with className
    if (classDirectives.length > 0) {
      const parts = [];
      if (attrs.className) {
        parts.push(attrs.className);
      }
      for (const { className, condition } of classDirectives) {
        parts.push(`${condition} && "${className}"`);
      }
      const isReactive = classDirectives.some(d => this._exprReadsSignal(d.node));
      const classExpr = `[${parts.join(', ')}].filter(Boolean).join(" ")`;
      attrs.className = isReactive ? `() => ${classExpr}` : classExpr;
    }

    // Add scoped CSS attribute to HTML elements (not components)
    if (this._currentScopeId && !isComponent) {
      attrs[`"data-tova-${this._currentScopeId}"`] = '""';
    }

    const propParts = [];
    for (const [key, val] of Object.entries(attrs)) {
      // For component props, convert reactive () => wrappers to JS getter syntax
      // so the prop stays reactive through the __props access pattern
      if (isComponent && spreads.length === 0 && typeof val === 'string' && val.startsWith('() => ')) {
        const rawExpr = val.slice(6);
        propParts.push(`get ${key}() { return ${rawExpr}; }`);
      } else {
        propParts.push(`${key}: ${val}`);
      }
    }
    for (const [event, handler] of Object.entries(events)) {
      propParts.push(`on${capitalize(event)}: ${handler}`);
    }

    // Build props object, merging spreads if present
    let propsStr;
    if (spreads.length > 0) {
      const ownProps = `{${propParts.join(', ')}}`;
      propsStr = `Object.assign({}, ${spreads.join(', ')}, ${ownProps})`;
    } else {
      propsStr = `{${propParts.join(', ')}}`;
    }

    // Components: call as function, passing props (with children if any)
    if (isComponent) {
      if (!node.selfClosing && node.children.length > 0) {
        // Named slots: children with slot="name" become named props
        const defaultChildren = [];
        const namedSlots = {};

        for (const child of node.children) {
          if (child.type === 'JSXElement') {
            const slotAttr = child.attributes.find(a => a.name === 'slot');
            if (slotAttr && slotAttr.value.type === 'StringLiteral') {
              const slotName = slotAttr.value.value;
              if (!namedSlots[slotName]) namedSlots[slotName] = [];
              namedSlots[slotName].push(child);
              continue;
            }
          }
          defaultChildren.push(child);
        }

        // Add named slot props
        for (const [slotName, slotChildren] of Object.entries(namedSlots)) {
          const slotContent = slotChildren.map(c => this.genJSX(c)).join(', ');
          propParts.push(`${slotName}: [${slotContent}]`);
        }

        if (defaultChildren.length > 0) {
          const children = defaultChildren.map(c => this.genJSX(c)).join(', ');
          propParts.push(`children: [${children}]`);
        }

        if (spreads.length > 0) {
          propsStr = `Object.assign({}, ${spreads.join(', ')}, {${propParts.join(', ')}})`;
        } else {
          propsStr = `{${propParts.join(', ')}}`;
        }
      }
      return `(() => { const __v = ${node.tag}(${propsStr}); if (__v && __v.__tova) __v._componentName = "${node.tag}"; return __v; })()`;
    }

    const tag = JSON.stringify(node.tag);

    if (node.selfClosing || node.children.length === 0) {
      return `tova_el(${tag}, ${propsStr})`;
    }

    const children = node.children.map(c => this.genJSX(c)).join(', ');
    return `tova_el(${tag}, ${propsStr}, [${children}])`;
  }

  genJSXText(node) {
    if (node.value.type === 'StringLiteral') {
      return JSON.stringify(node.value.value);
    }
    if (node.value.type === 'TemplateLiteral') {
      const code = this.genTemplateLiteral(node.value);
      // Wrap in reactive closure if the template reads signals
      if (this._exprReadsSignal(node.value)) {
        return `() => ${code}`;
      }
      return code;
    }
    return this.genExpression(node.value);
  }

  genJSXFor(node) {
    const varName = node.variable;
    const iterable = this.genExpression(node.iterable);
    const children = node.body.map(c => this.genJSX(c));

    // Wrap in reactive closure so the runtime creates a dynamic block that
    // re-evaluates when the iterable signal changes
    if (node.keyExpr) {
      const keyExpr = this.genExpression(node.keyExpr);
      if (children.length === 1) {
        return `() => ${iterable}.map((${varName}) => tova_keyed(${keyExpr}, ${children[0]}))`;
      }
      return `() => ${iterable}.map((${varName}) => tova_keyed(${keyExpr}, tova_fragment([${children.join(', ')}])))`;
    }

    if (children.length === 1) {
      return `() => ${iterable}.map((${varName}) => ${children[0]})`;
    }
    return `() => ${iterable}.map((${varName}) => tova_fragment([${children.join(', ')}]))`;
  }

  genJSXIf(node) {
    const cond = this.genExpression(node.condition);
    const consequent = node.consequent.map(c => this.genJSX(c));
    const thenPart = consequent.length === 1 ? consequent[0] : `tova_fragment([${consequent.join(', ')}])`;

    // Build chained ternary: cond1 ? a : cond2 ? b : cond3 ? c : else
    let result = `(${cond}) ? ${thenPart}`;

    // elif chains
    if (node.alternates && node.alternates.length > 0) {
      for (const alt of node.alternates) {
        const elifCond = this.genExpression(alt.condition);
        const elifBody = alt.body.map(c => this.genJSX(c));
        const elifPart = elifBody.length === 1 ? elifBody[0] : `tova_fragment([${elifBody.join(', ')}])`;
        result += ` : (${elifCond}) ? ${elifPart}`;
      }
    }

    if (node.alternate) {
      const alt = node.alternate.map(c => this.genJSX(c));
      const elsePart = alt.length === 1 ? alt[0] : `tova_fragment([${alt.join(', ')}])`;
      result += ` : ${elsePart}`;
    } else {
      result += ` : null`;
    }

    // Wrap in reactive closure so the runtime creates a dynamic block
    return `() => ${result}`;
  }

  // Override to add await for piped RPC calls
  genPipeExpression(node) {
    const result = super.genPipeExpression(node);
    // If the pipe target is an RPC call and we're in async context, wrap with await
    if (this._asyncContext && this._containsRPC(node.right)) {
      return `await ${result}`;
    }
    return result;
  }

  // Override function declaration to make async if it contains server.* calls
  genFunctionDeclaration(node) {
    const hasRPC = this._containsRPC(node.body);
    const hasPropagate = this._containsPropagate(node.body);
    const isGenerator = this._containsYield(node.body);
    const exportPrefix = node.isPublic ? 'export ' : '';
    const asyncPrefix = (hasRPC || node.isAsync) ? 'async ' : '';
    const genStar = isGenerator ? '*' : '';
    const params = this.genParams(node.params);
    this.pushScope();
    for (const p of node.params) {
      if (p.destructure) {
        this._declareDestructureVars(p.destructure);
      } else {
        this.declareVar(p.name);
      }
    }
    const prevAsync = this._asyncContext;
    if (hasRPC || node.isAsync) this._asyncContext = true;
    const body = this.genBlockBody(node.body);
    this._asyncContext = prevAsync;
    this.popScope();
    if (hasPropagate) {
      return `${this.i()}${exportPrefix}${asyncPrefix}function${genStar} ${node.name}(${params}) {\n${this.i()}  try {\n${body}\n${this.i()}  } catch (__e) {\n${this.i()}    if (__e && __e.__tova_propagate) return __e.value;\n${this.i()}    throw __e;\n${this.i()}  }\n${this.i()}}`;
    }
    return `${this.i()}${exportPrefix}${asyncPrefix}function${genStar} ${node.name}(${params}) {\n${body}\n${this.i()}}`;
  }

  getStdlibCore() {
    const parts = [];
    // Only include builtins used in client blocks that aren't already in shared code
    const clientOnly = new Set();
    for (const name of this._usedBuiltins) {
      if (!this._sharedBuiltins || !this._sharedBuiltins.has(name)) {
        clientOnly.add(name);
      }
    }
    const selectiveStdlib = buildSelectiveStdlib(clientOnly);
    if (selectiveStdlib) parts.push(selectiveStdlib);
    // Include Result/Option if Ok/Err/Some/None are used
    if (this._needsResultOption) parts.push(RESULT_OPTION);
    // Include propagate if needed
    if (this._needsPropagateHelper) parts.push(PROPAGATE);
    return parts.join('\n');
  }
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
