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
    this._rpcCache = new WeakMap(); // Memoize _containsRPC() results
    this._signalCache = new WeakMap(); // Memoize _exprReadsSignal() results
  }

  // AST-walk to check if a subtree contains server.xxx() RPC calls (memoized)
  _containsRPC(node) {
    if (!node) return false;
    const cached = this._rpcCache.get(node);
    if (cached !== undefined) return cached;
    const result = this._containsRPCImpl(node);
    this._rpcCache.set(node, result);
    return result;
  }

  _containsRPCImpl(node) {
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
    lines.push(`import { createSignal, createEffect, createComputed, mount, hydrate, tova_el, tova_fragment, tova_keyed, tova_transition, tova_inject_css, batch, onMount, onUnmount, onCleanup, onBeforeUpdate, createRef, createContext, provide, inject, createErrorBoundary, ErrorBoundary, ErrorInfo, createRoot, watch, untrack, Dynamic, Portal, lazy, Suspense, Head, createResource, __tova_action, TransitionGroup, createForm, configureCSP } from './runtime/reactivity.js';`);
    lines.push(`import { rpc, configureRPC, addRPCInterceptor, setCSRFToken } from './runtime/rpc.js';`);
    lines.push(`import { navigate, getCurrentRoute, getParams, getPath, getQuery, defineRoutes, onRouteChange, beforeNavigate, afterNavigate, Router, Outlet, Link, Redirect } from './runtime/router.js';`);

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
    const p = [];
    if (hasRPC) {
      p.push(`createEffect(() => {\n`);
      p.push(`${this.i()}  (async () => {\n`);
      this.indent += 2;
      const prevAsync = this._asyncContext;
      this._asyncContext = true;
      p.push(this.genBlockStatements(body));
      this._asyncContext = prevAsync;
      this.indent -= 2;
      p.push(`\n${this.i()}  })();\n`);
      p.push(`${this.i()}});`);
    } else {
      p.push(`createEffect(() => {\n`);
      this.indent++;
      p.push(this.genBlockStatements(body));
      this.indent--;
      p.push(`\n${this.i()}});`);
    }
    return p.join('');
  }

  // Generate a scope hash from component name + CSS content (for CSS scoping)
  // Uses FNV-1a for better distribution and 8-char output to reduce collision risk.
  _genScopeId(name, css) {
    const str = name + ':' + (css || '');
    let h = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193); // FNV prime
    }
    return (h >>> 0).toString(36).padStart(8, '0').slice(0, 8);
  }

  // Scope CSS selectors by appending [data-tova-HASH] to each selector
  // Uses a lightweight tokenizer to properly handle:
  // - @media, @keyframes, @layer blocks (don't scope their content selectors)
  // - :is(), :where(), :has() pseudo-functions
  // - :global() escape hatch (strip wrapper, don't scope)
  // - CSS comments /* */
  // - Nested CSS
  // - Multiple rules in sequence
  _scopeCSS(css, scopeAttr) {
    const result = [];
    let i = 0;
    let depth = 0;
    let buf = '';
    const noScopeDepths = new Set(); // Depths where we DON'T scope (property decls, @keyframes, @font-face)

    while (i < css.length) {
      // Skip CSS comments
      if (css[i] === '/' && css[i + 1] === '*') {
        const end = css.indexOf('*/', i + 2);
        if (end === -1) { buf += css.slice(i); break; }
        buf += css.slice(i, end + 2);
        i = end + 2;
        continue;
      }

      // Skip quoted strings
      if (css[i] === '"' || css[i] === "'") {
        const q = css[i];
        buf += css[i++];
        while (i < css.length && css[i] !== q) {
          if (css[i] === '\\') buf += css[i++];
          buf += css[i++];
        }
        if (i < css.length) buf += css[i++];
        continue;
      }

      // Opening brace — process accumulated buf as selector or pass through
      if (css[i] === '{') {
        const trimmed = buf.trim();

        if (noScopeDepths.has(depth)) {
          // Inside a no-scope context (property declarations, @keyframes) — pass through
          result.push(buf + '{');
        } else if (trimmed.startsWith('@')) {
          // @keyframes, @font-face: mark inner as no-scope
          if (/^@keyframes\s/.test(trimmed) || /^@font-face/.test(trimmed)) {
            noScopeDepths.add(depth + 1);
          }
          // @media, @supports, @layer: keep scoping inside (don't mark)
          result.push(buf + '{');
        } else {
          // Regular selector — scope it and mark inner depth as no-scope (property declarations)
          const scopedSelectors = buf.split(',').map(s => {
            s = s.trim();
            if (!s || s === 'from' || s === 'to' || /^\d+%$/.test(s)) return s;
            return this._scopeSelector(s, scopeAttr);
          }).join(', ');
          result.push(scopedSelectors + '{');
          noScopeDepths.add(depth + 1);
        }

        depth++;
        buf = '';
        i++;
        continue;
      }

      // Closing brace
      if (css[i] === '}') {
        result.push(buf + '}');
        buf = '';
        noScopeDepths.delete(depth);
        depth--;
        i++;
        continue;
      }

      // Accumulate character
      buf += css[i];
      i++;
    }

    if (buf) result.push(buf);
    return result.join('');
  }

  // Scope a single CSS selector
  _scopeSelector(selector, scopeAttr) {
    let s = selector.trim();

    // :global() escape hatch — strip wrapper, don't scope
    if (s.startsWith(':global(') && s.endsWith(')')) {
      return s.slice(8, -1);
    }
    // Inline :global() in the middle of a selector
    s = s.replace(/:global\(([^)]+)\)/g, '$1');

    // Handle pseudo-elements (::before, ::after, ::placeholder, etc.)
    const pseudoElMatch = s.match(/(::[\w-]+(?:\([^)]*\))?)$/);
    if (pseudoElMatch) {
      return s.slice(0, -pseudoElMatch[0].length) + scopeAttr + pseudoElMatch[0];
    }
    // Handle pseudo-classes with functions (:is(), :where(), :has(), :not(), :hover, etc.)
    const pseudoClsMatch = s.match(/((?::[\w-]+(?:\([^)]*\))?)+)$/);
    if (pseudoClsMatch) {
      const pseudoPart = pseudoClsMatch[0];
      const basePart = s.slice(0, -pseudoPart.length);
      if (basePart.trim()) {
        return basePart + scopeAttr + pseudoPart;
      }
    }
    return s + scopeAttr;
  }

  generateComponent(comp) {
    const hasParams = comp.params.length > 0;
    const paramStr = hasParams ? '__props' : '';

    // Save state/computed names so component-local names don't leak
    const savedState = new Set(this.stateNames);
    const savedComputed = new Set(this.computedNames);

    const p = [];
    p.push(`function ${comp.name}(${paramStr}) {\n`);
    this.indent++;

    // Generate reactive prop accessors — each prop is accessed through __props getter
    // This ensures parent signal changes propagate reactively to the child
    if (hasParams) {
      for (const param of comp.params) {
        this.computedNames.add(param.name);
        const def = param.default || param.defaultValue;
        if (def) {
          const defaultExpr = this.genExpression(def);
          p.push(`${this.i()}const ${param.name} = () => __props.${param.name} !== undefined ? __props.${param.name} : ${defaultExpr};\n`);
        } else {
          p.push(`${this.i()}const ${param.name} = () => __props.${param.name};\n`);
        }
      }
    }

    // Separate JSX elements, style blocks, and statements
    const jsxElements = [];
    const styleBlocks = [];
    const bodyItems = [];

    for (const node of comp.body) {
      if (node.type === 'JSXElement' || node.type === 'JSXFragment' || node.type === 'JSXFor' || node.type === 'JSXIf') {
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
      p.push(`${this.i()}tova_inject_css(${JSON.stringify(scopeId)}, ${JSON.stringify(scopedCSS)});\n`);
    }

    // Generate body items in order (state, computed, effect, other statements)
    for (const node of bodyItems) {
      if (node.type === 'StateDeclaration') {
        this.stateNames.add(node.name);
        const init = this.genExpression(node.initialValue);
        p.push(`${this.i()}const [${node.name}, set${capitalize(node.name)}] = createSignal(${init});\n`);
      } else if (node.type === 'ComputedDeclaration') {
        this.computedNames.add(node.name);
        const expr = this.genExpression(node.expression);
        p.push(`${this.i()}const ${node.name} = createComputed(() => ${expr});\n`);
      } else if (node.type === 'EffectDeclaration') {
        this.indent++;
        const effectCode = this._generateEffect(node.body);
        this.indent--;
        p.push(`${this.i()}${effectCode}\n`);
      } else {
        p.push(this.generateStatement(node) + '\n');
      }
    }

    // Generate JSX return
    if (jsxElements.length === 1) {
      p.push(`${this.i()}return ${this.genJSX(jsxElements[0])};\n`);
    } else if (jsxElements.length > 1) {
      const children = jsxElements.map(el => this.genJSX(el)).join(', ');
      p.push(`${this.i()}return tova_fragment([${children}]);\n`);
    }

    this.indent--;
    p.push(`}`);

    // Restore scoped names and scope id
    this.stateNames = savedState;
    this.computedNames = savedComputed;
    this._currentScopeId = savedScopeId;

    return p.join('');
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

    const p = [];
    p.push(`const ${store.name} = (() => {\n`);
    this.indent++;

    // Generate state signals
    for (const s of storeStates) {
      const init = this.genExpression(s.initialValue);
      p.push(`${this.i()}const [${s.name}, set${capitalize(s.name)}] = createSignal(${init});\n`);
    }

    // Generate computed values
    for (const c of storeComputeds) {
      const expr = this.genExpression(c.expression);
      p.push(`${this.i()}const ${c.name} = createComputed(() => ${expr});\n`);
    }

    // Generate functions
    for (const fn of storeFunctions) {
      p.push(this.genFunctionDeclaration(fn) + '\n');
    }

    // Build return object with getters/setters
    p.push(`${this.i()}return {\n`);
    this.indent++;

    for (const s of storeStates) {
      p.push(`${this.i()}get ${s.name}() { return ${s.name}(); },\n`);
      p.push(`${this.i()}set ${s.name}(v) { set${capitalize(s.name)}(v); },\n`);
    }

    for (const c of storeComputeds) {
      p.push(`${this.i()}get ${c.name}() { return ${c.name}(); },\n`);
    }

    for (const fn of storeFunctions) {
      p.push(`${this.i()}${fn.name},\n`);
    }

    this.indent--;
    p.push(`${this.i()}};\n`);

    this.indent--;
    p.push(`${this.i()}})();`);

    // Restore state/computed names
    this.stateNames = savedState;
    this.computedNames = savedComputed;

    return p.join('');
  }

  // Check if an AST expression references any signal/computed name (memoized)
  _exprReadsSignal(node) {
    if (!node) return false;
    // Cannot cache Identifier lookups — result depends on current stateNames/computedNames
    if (node.type === 'Identifier') return this.stateNames.has(node.name) || this.computedNames.has(node.name);
    const cached = this._signalCache.get(node);
    if (cached !== undefined) return cached;
    const result = this._exprReadsSignalImpl(node);
    this._signalCache.set(node, result);
    return result;
  }

  _exprReadsSignalImpl(node) {
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
      return this._exprReadsSignal(node.object) || (node.computed && this._exprReadsSignal(node.property));
    }
    if (node.type === 'OptionalChain') {
      return this._exprReadsSignal(node.object) || (node.computed && this._exprReadsSignal(node.property));
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
      case 'JSXFragment': return this.genJSXFragment(node);
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
      case 'JSXMatch': return this.genJSXMatch(node);
      default: return this.genExpression(node);
    }
  }

  genJSXElement(node) {
    // <slot /> or <slot name="header" /> — render children passed from parent
    if (node.tag === 'slot') {
      const nameAttr = node.attributes.find(a => a.name === 'name');
      const slotProps = node.attributes.filter(a => a.name !== 'name');

      if (nameAttr && nameAttr.value.type === 'StringLiteral') {
        // Named slot: <slot name="header" />
        const slotName = nameAttr.value.value;
        return `(__props.${slotName} || '')`;
      }

      if (slotProps.length > 0) {
        // Scoped slot: <slot count={count()} /> — pass props to render function
        const propParts = slotProps.map(a => {
          const val = this.genExpression(a.value);
          return `${a.name}: ${val}`;
        });
        return `(typeof __props.children === 'function' ? __props.children({${propParts.join(', ')}}) : (__props.children || ''))`;
      }

      // Default slot: <slot />
      return `(__props.children || '')`;
    }

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
          // For number/range inputs, coerce e.target.value to Number
          const typeAttr = node.attributes.find(a => a.name === 'type');
          const typeStr = typeAttr && typeAttr.value ? (typeAttr.value.value || '') : '';
          const isNumeric = typeStr === 'number' || typeStr === 'range';
          const valueExpr = isNumeric ? 'Number(e.target.value)' : 'e.target.value';
          events[eventName] = `(e) => { set${capitalize(exprName)}(${valueExpr}); }`;
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
      } else if (attr.name === 'show') {
        // show={condition} → toggles display:none instead of removing from DOM
        const expr = this.genExpression(attr.value);
        const reactive = this._exprReadsSignal(attr.value);
        const displayExpr = `(${expr}) ? "" : "none"`;
        // Store show directive to merge with style later
        node._showDirective = { expr: displayExpr, reactive };
      } else if (attr.name.startsWith('class:')) {
        // Conditional class: class:active={cond}
        const className = attr.name.slice(6);
        classDirectives.push({ className, condition: this.genExpression(attr.value), node: attr.value });
      } else if (attr.name.startsWith('use:')) {
        // use:action directive: use:tooltip={params}
        const actionName = attr.name.slice(4);
        const param = attr.value.type === 'BooleanLiteral' ? 'undefined' : this.genExpression(attr.value);
        const reactive = attr.value.type !== 'BooleanLiteral' && this._exprReadsSignal(attr.value);
        if (!node._actions) node._actions = [];
        node._actions.push({ name: actionName, param, reactive });
      } else if (attr.name.startsWith('in:')) {
        // in:fade — enter-only transition
        const transName = attr.name.slice(3);
        const config = attr.value.type === 'BooleanLiteral' ? '{}' : this.genExpression(attr.value);
        node._inTransition = { name: transName, config };
      } else if (attr.name.startsWith('out:')) {
        // out:slide — leave-only transition
        const transName = attr.name.slice(4);
        const config = attr.value.type === 'BooleanLiteral' ? '{}' : this.genExpression(attr.value);
        node._outTransition = { name: transName, config };
      } else if (attr.name.startsWith('transition:')) {
        // transition:fade, transition:slide={duration: 300}, etc.
        const transName = attr.name.slice(11); // 'fade', 'slide', 'scale', 'fly'
        const builtins = new Set(['fade', 'slide', 'scale', 'fly']);
        const config = attr.value.type === 'BooleanLiteral' ? '{}' : this.genExpression(attr.value);
        // Store transition info for element wrapping
        if (!node._transitions) node._transitions = [];
        node._transitions.push({ name: transName, config, custom: !builtins.has(transName) });
      } else if (attr.name === 'bind:this') {
        // bind:this={ref} → ref: refValue (works with both ref objects and functions)
        attrs.ref = this.genExpression(attr.value);
      } else if (attr.name.startsWith('on:')) {
        const fullName = attr.name.slice(3); // e.g. "click.stop.prevent"
        const parts = fullName.split('.');
        const eventName = parts[0];
        const modifiers = parts.slice(1);
        let handler = this.genExpression(attr.value);

        if (modifiers.length > 0) {
          const guards = [];
          let useCapture = false;
          let useOnce = false;

          // Key modifier map for keydown/keyup events
          const keyMap = {
            enter: '"Enter"', escape: '"Escape"', tab: '"Tab"', space: '" "',
            up: '"ArrowUp"', down: '"ArrowDown"', left: '"ArrowLeft"', right: '"ArrowRight"',
            delete: '"Delete"', backspace: '"Backspace"',
          };

          for (const mod of modifiers) {
            if (mod === 'prevent') {
              guards.push('e.preventDefault()');
            } else if (mod === 'stop') {
              guards.push('e.stopPropagation()');
            } else if (mod === 'self') {
              guards.push('if (e.target !== e.currentTarget) return');
            } else if (mod === 'capture') {
              useCapture = true;
            } else if (mod === 'once') {
              useOnce = true;
            } else if (keyMap[mod]) {
              guards.push(`if (e.key !== ${keyMap[mod]}) return`);
            }
          }

          if (guards.length > 0) {
            handler = `(e) => { ${guards.join('; ')}; (${handler})(e); }`;
          }

          if (useCapture || useOnce) {
            const opts = [];
            if (useCapture) opts.push('capture: true');
            if (useOnce) opts.push('once: true');
            handler = `{ handler: ${handler}, options: { ${opts.join(', ')} } }`;
          }
        }

        events[eventName] = handler;
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

    // Merge show directive with style (show toggles display:none)
    if (node._showDirective) {
      const { expr: displayExpr, reactive } = node._showDirective;
      if (attrs.style) {
        // Merge with existing style object
        const existing = attrs.style;
        if (reactive) {
          attrs.style = `() => Object.assign({}, ${existing}, { display: ${displayExpr} })`;
        } else {
          attrs.style = `Object.assign({}, ${existing}, { display: ${displayExpr} })`;
        }
      } else {
        attrs.style = reactive
          ? `() => ({ display: ${displayExpr} })`
          : `{ display: ${displayExpr} }`;
      }
    }

    // Add scoped CSS attribute to HTML elements (not components)
    if (this._currentScopeId && !isComponent) {
      attrs[`"data-tova-${this._currentScopeId}"`] = '""';
    }

    const propParts = [];
    const memoizedProps = []; // Computed memoization for complex expressions
    for (const [key, val] of Object.entries(attrs)) {
      // For component props, convert reactive () => wrappers to JS getter syntax
      // so the prop stays reactive through the __props access pattern
      if (isComponent && spreads.length === 0 && typeof val === 'string' && val.startsWith('() => ')) {
        const rawExpr = val.slice(6);
        // Simple signal read: just use a getter (no overhead)
        // Complex expressions: memoize with createComputed
        const isSimple = /^[a-zA-Z_$]\w*\(\)$/.test(rawExpr);
        if (isSimple) {
          propParts.push(`get ${key}() { return ${rawExpr}; }`);
        } else {
          const memoName = `__memo_${key}`;
          memoizedProps.push(`const ${memoName} = createComputed(() => ${rawExpr})`);
          propParts.push(`get ${key}() { return ${memoName}(); }`);
        }
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
      if (memoizedProps.length > 0) {
        return `(() => { ${memoizedProps.join('; ')}; const __v = ${node.tag}(${propsStr}); if (__v && __v.__tova) __v._componentName = "${node.tag}"; return __v; })()`;
      }
      return `((__tova_v) => (__tova_v && __tova_v.__tova && (__tova_v._componentName = "${node.tag}"), __tova_v))(${node.tag}(${propsStr}))`;
    }

    const tag = JSON.stringify(node.tag);

    let result;
    if (node.selfClosing || node.children.length === 0) {
      result = `tova_el(${tag}, ${propsStr})`;
    } else {
      const children = node.children.map(c => this.genJSX(c)).join(', ');
      result = `tova_el(${tag}, ${propsStr}, [${children}])`;
    }

    // Wrap with transition directives if present
    if (node._transitions && node._transitions.length > 0) {
      for (const t of node._transitions) {
        if (t.custom) {
          result = `tova_transition(${result}, ${t.name}, ${t.config})`;
        } else {
          result = `tova_transition(${result}, "${t.name}", ${t.config})`;
        }
      }
    }

    // Wrap with directional transitions if present
    if (node._inTransition || node._outTransition) {
      const inPart = node._inTransition ? `in: { name: "${node._inTransition.name}", config: ${node._inTransition.config} }` : '';
      const outPart = node._outTransition ? `out: { name: "${node._outTransition.name}", config: ${node._outTransition.config} }` : '';
      const parts = [inPart, outPart].filter(Boolean).join(', ');
      result = `tova_transition(${result}, { ${parts} })`;
    }

    // Wrap with use: action directives if present
    if (node._actions && node._actions.length > 0) {
      for (const a of node._actions) {
        if (a.reactive) {
          result = `__tova_action(${result}, ${a.name}, () => ${a.param})`;
        } else {
          result = `__tova_action(${result}, ${a.name}, ${a.param})`;
        }
      }
    }

    return result;
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

  _genJSXForVar(variable) {
    if (typeof variable === 'string') return variable;
    if (variable.type === 'ArrayPattern') {
      return `[${variable.elements.join(', ')}]`;
    }
    if (variable.type === 'ObjectPattern') {
      return `{${variable.properties.map(p => p.value ? `${p.key}: ${p.value}` : p.key).join(', ')}}`;
    }
    return String(variable);
  }

  genJSXFor(node) {
    const varName = this._genJSXForVar(node.variable);
    const iterable = this.genExpression(node.iterable);
    const children = node.body.map(c => this.genJSX(c));
    const needsReactive = this._exprReadsSignal(node.iterable);
    const wrap = needsReactive ? '() => ' : '';

    if (node.keyExpr) {
      const keyExpr = this.genExpression(node.keyExpr);
      if (children.length === 1) {
        return `${wrap}${iterable}.map((${varName}) => tova_keyed(${keyExpr}, ${children[0]}))`;
      }
      return `${wrap}${iterable}.map((${varName}) => tova_keyed(${keyExpr}, tova_fragment([${children.join(', ')}])))`;
    }

    if (children.length === 1) {
      return `${wrap}${iterable}.map((${varName}) => ${children[0]})`;
    }
    return `${wrap}${iterable}.map((${varName}) => tova_fragment([${children.join(', ')}]))`;
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

    // Only wrap in reactive closure if the condition reads signals
    const needsReactive = this._exprReadsSignal(node.condition) ||
      (node.alternates && node.alternates.some(a => this._exprReadsSignal(a.condition)));
    if (needsReactive) {
      return `() => ${result}`;
    }
    return result;
  }

  genJSXMatch(node) {
    const subject = this.genExpression(node.subject);
    const p = [];
    p.push(`((__match) => { `);

    for (let idx = 0; idx < node.arms.length; idx++) {
      const arm = node.arms[idx];
      const condition = this.genPatternCondition(arm.pattern, '__match', arm.guard);
      const body = arm.body.map(c => this.genJSX(c));
      const bodyExpr = body.length === 1 ? body[0] : `tova_fragment([${body.join(', ')}])`;

      if (arm.pattern.type === 'WildcardPattern' || arm.pattern.type === 'BindingPattern') {
        if (idx === node.arms.length - 1 && !arm.guard) {
          // Default case
          if (arm.pattern.type === 'BindingPattern') {
            p.push(`const ${arm.pattern.name} = __match; `);
          }
          p.push(`return ${bodyExpr}; `);
          break;
        }
      }

      const keyword = idx === 0 ? 'if' : 'else if';
      p.push(`${keyword} (${condition}) { `);
      p.push(this.genPatternBindings(arm.pattern, '__match'));
      p.push(`return ${bodyExpr}; } `);
    }

    p.push(`})(${subject})`);
    // Only wrap in reactive closure if the subject reads signals
    if (this._exprReadsSignal(node.subject)) {
      return `() => ${p.join('')}`;
    }
    return p.join('');
  }

  genJSXFragment(node) {
    const children = node.children.map(c => this.genJSX(c)).join(', ');
    return `tova_fragment([${children}])`;
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
