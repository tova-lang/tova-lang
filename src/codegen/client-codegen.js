import { BaseCodegen } from './base-codegen.js';

export class ClientCodegen extends BaseCodegen {
  constructor() {
    super();
    this.stateNames = new Set(); // Track state variable names for setter transforms
    this.computedNames = new Set(); // Track computed variable names for getter transforms
    this.componentNames = new Set(); // Track component names for JSX
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
      return `${this.i()}${setter}(__prev => __prev ${op} ${val});`;
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

    if (node.body.type === 'BlockStatement') {
      this.pushScope();
      for (const p of node.params) this.declareVar(p.name);
      const body = this.genBlockBody(node.body);
      this.popScope();
      return `(${params}) => {\n${body}\n${this.i()}}`;
    }

    // Compound assignment in lambda body: fn() count += 1
    if (node.body.type === 'CompoundAssignment' && node.body.target.type === 'Identifier' && this.stateNames.has(node.body.target.name)) {
      const name = node.body.target.name;
      const setter = `set${capitalize(name)}`;
      const op = node.body.operator[0];
      const val = this.genExpression(node.body.value);
      return `(${params}) => { ${setter}(__prev => __prev ${op} ${val}); }`;
    }

    // Assignment in lambda body: fn() count = 0
    if (node.body.type === 'Assignment' && node.body.targets.length === 1 && this.stateNames.has(node.body.targets[0])) {
      const name = node.body.targets[0];
      const setter = `set${capitalize(name)}`;
      const val = this.genExpression(node.body.values[0]);
      return `(${params}) => { ${setter}(${val}); }`;
    }

    // Non-state statement bodies
    if (node.body.type === 'CompoundAssignment' || node.body.type === 'Assignment' || node.body.type === 'VarDeclaration') {
      this.indent++;
      const stmt = super.generateStatement(node.body);
      this.indent--;
      return `(${params}) => { ${stmt.trim()} }`;
    }

    return `(${params}) => ${this.genExpression(node.body)}`;
  }

  generate(clientBlocks, sharedCode) {
    const lines = [];

    // Runtime imports
    lines.push(`import { createSignal, createEffect, createComputed, mount, lux_el, lux_fragment } from './runtime/reactivity.js';`);
    lines.push(`import { rpc } from './runtime/rpc.js';`);
    lines.push('');

    // Shared code
    if (sharedCode.trim()) {
      lines.push('// ── Shared ──');
      lines.push(sharedCode);
      lines.push('');
    }

    // Stdlib core functions (available in all Lux code)
    lines.push('// ── Stdlib ──');
    lines.push(this.getStdlibCore());
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
    const other = [];

    for (const block of clientBlocks) {
      for (const stmt of block.body) {
        switch (stmt.type) {
          case 'StateDeclaration': states.push(stmt); break;
          case 'ComputedDeclaration': computeds.push(stmt); break;
          case 'EffectDeclaration': effects.push(stmt); break;
          case 'ComponentDeclaration': components.push(stmt); break;
          default: other.push(stmt); break;
        }
      }
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
        // Check if effect body contains server.* calls (async RPC)
        const bodyCode = (() => {
          this.indent++;
          const code = this.genBlockStatements(e.body);
          this.indent--;
          return code;
        })();
        const hasRPC = bodyCode.includes('server.') || bodyCode.includes('rpc(');
        if (hasRPC) {
          lines.push(`createEffect(() => {`);
          lines.push(`  (async () => {`);
          // Re-generate with await on server calls
          this.indent += 2;
          const asyncBody = this.genBlockStatements(e.body).replace(/\b(server\.\w+\([^)]*\))/g, 'await $1');
          this.indent -= 2;
          lines.push(asyncBody);
          lines.push(`  })();`);
          lines.push(`});`);
        } else {
          lines.push(`createEffect(() => {`);
          this.indent++;
          lines.push(this.genBlockStatements(e.body));
          this.indent--;
          lines.push(`});`);
        }
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
    const hasApp = components.some(c => c.name === 'App');
    if (hasApp) {
      lines.push('// ── Mount ──');
      lines.push('document.addEventListener("DOMContentLoaded", () => {');
      lines.push('  mount(App, document.getElementById("app") || document.body);');
      lines.push('});');
    }

    return lines.join('\n');
  }

  generateComponent(comp) {
    const params = comp.params.length > 0
      ? `{ ${comp.params.map(p => p.name).join(', ')} }`
      : '';

    let code = `function ${comp.name}(${params}) {\n`;
    this.indent++;

    // Process body — find JSX elements and statements
    const jsxElements = [];
    const statements = [];

    for (const node of comp.body) {
      if (node.type === 'JSXElement' || node.type === 'JSXFor' || node.type === 'JSXIf') {
        jsxElements.push(node);
      } else {
        statements.push(node);
      }
    }

    // Generate statements first
    for (const stmt of statements) {
      code += this.generateStatement(stmt) + '\n';
    }

    // Generate JSX return
    if (jsxElements.length === 1) {
      code += `${this.i()}return ${this.genJSX(jsxElements[0])};\n`;
    } else if (jsxElements.length > 1) {
      const children = jsxElements.map(el => this.genJSX(el)).join(', ');
      code += `${this.i()}return lux_fragment([${children}]);\n`;
    }

    this.indent--;
    code += `}`;
    return code;
  }

  genJSX(node) {
    if (!node) return 'null';

    switch (node.type) {
      case 'JSXElement': return this.genJSXElement(node);
      case 'JSXText': return this.genJSXText(node);
      case 'JSXExpression': return this.genExpression(node.expression);
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

    for (const attr of node.attributes) {
      if (attr.name.startsWith('on:')) {
        const eventName = attr.name.slice(3);
        events[eventName] = this.genExpression(attr.value);
      } else {
        const attrName = attr.name === 'class' ? 'className' : attr.name;
        attrs[attrName] = this.genExpression(attr.value);
      }
    }

    let propsStr = '{';
    const propParts = [];
    for (const [key, val] of Object.entries(attrs)) {
      propParts.push(`${key}: ${val}`);
    }
    for (const [event, handler] of Object.entries(events)) {
      propParts.push(`on${capitalize(event)}: ${handler}`);
    }
    propsStr += propParts.join(', ');
    propsStr += '}';

    // Components: call as function, passing props
    if (isComponent) {
      return `${node.tag}(${propsStr})`;
    }

    const tag = JSON.stringify(node.tag);

    if (node.selfClosing || node.children.length === 0) {
      return `lux_el(${tag}, ${propsStr})`;
    }

    const children = node.children.map(c => this.genJSX(c)).join(', ');
    return `lux_el(${tag}, ${propsStr}, [${children}])`;
  }

  genJSXText(node) {
    if (node.value.type === 'StringLiteral') {
      return JSON.stringify(node.value.value);
    }
    if (node.value.type === 'TemplateLiteral') {
      return this.genTemplateLiteral(node.value);
    }
    return this.genExpression(node.value);
  }

  genJSXFor(node) {
    const varName = node.variable;
    const iterable = this.genExpression(node.iterable);
    const children = node.body.map(c => this.genJSX(c));

    if (children.length === 1) {
      return `...${iterable}.map((${varName}) => ${children[0]})`;
    }
    return `...${iterable}.map((${varName}) => lux_fragment([${children.join(', ')}]))`;
  }

  genJSXIf(node) {
    const cond = this.genExpression(node.condition);
    const consequent = node.consequent.map(c => this.genJSX(c));
    const thenPart = consequent.length === 1 ? consequent[0] : `lux_fragment([${consequent.join(', ')}])`;

    if (node.alternate) {
      const alt = node.alternate.map(c => this.genJSX(c));
      const elsePart = alt.length === 1 ? alt[0] : `lux_fragment([${alt.join(', ')}])`;
      return `(${cond}) ? ${thenPart} : ${elsePart}`;
    }

    return `(${cond}) ? ${thenPart} : null`;
  }

  // Override function declaration to make async if it contains server.* calls
  genFunctionDeclaration(node) {
    const params = this.genParams(node.params);
    this.pushScope();
    for (const p of node.params) this.declareVar(p.name);
    const body = this.genBlockBody(node.body);
    this.popScope();
    const hasRPC = body.includes('server.') || body.includes('rpc(');
    const asyncPrefix = hasRPC ? 'async ' : '';
    let finalBody = body;
    if (hasRPC) {
      finalBody = body.replace(/\b(server\.\w+\([^)]*\))/g, 'await $1');
    }
    return `${this.i()}${asyncPrefix}function ${node.name}(${params}) {\n${finalBody}\n${this.i()}}`;
  }

  getStdlibCore() {
    return `function print(...args) { console.log(...args); }
function len(v) { if (v == null) return 0; if (typeof v === 'string' || Array.isArray(v)) return v.length; if (typeof v === 'object') return Object.keys(v).length; return 0; }
function range(s, e, st) { if (e === undefined) { e = s; s = 0; } if (st === undefined) st = s < e ? 1 : -1; const r = []; if (st > 0) { for (let i = s; i < e; i += st) r.push(i); } else { for (let i = s; i > e; i += st) r.push(i); } return r; }
function enumerate(a) { return a.map((v, i) => [i, v]); }
function sum(a) { return a.reduce((x, y) => x + y, 0); }
function sorted(a, k) { const c = [...a]; if (k) c.sort((x, y) => { const kx = k(x), ky = k(y); return kx < ky ? -1 : kx > ky ? 1 : 0; }); else c.sort((x, y) => x < y ? -1 : x > y ? 1 : 0); return c; }
function reversed(a) { return [...a].reverse(); }
function zip(...as) { const m = Math.min(...as.map(a => a.length)); const r = []; for (let i = 0; i < m; i++) r.push(as.map(a => a[i])); return r; }
function min(a) { return Math.min(...a); }
function max(a) { return Math.max(...a); }`;
  }
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
