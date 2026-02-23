// Base code generation utilities shared across all codegen targets
import { RESULT_OPTION, PROPAGATE, BUILTIN_NAMES, STDLIB_DEPS } from '../stdlib/inline.js';
import { PIPE_TARGET } from '../parser/ast.js';
import { compileWasmFunction, compileWasmModule, generateWasmGlue, generateMultiWasmGlue } from './wasm-codegen.js';

export class BaseCodegen {
  constructor() {
    this.indent = 0;
    this._counter = 0;
    this._scopes = [new Set()]; // scope stack for tracking declared variables
    this._visibleNames = new Set(); // flattened view of all declared names for O(1) lookup
    this._nameRefCount = new Map(); // name -> count of scopes declaring it (for O(1) popScope)
    this._needsContainsHelper = false; // track if __contains helper is needed
    this._needsPropagateHelper = false; // track if __propagate helper is needed
    this._usedBuiltins = new Set(); // track which stdlib builtins are actually used
    this._userDefinedNames = new Set(); // track user-defined top-level names (to avoid stdlib conflicts)
    this._needsResultOption = false; // track if Ok/Err/Some/None are used
    this._variantFields = { 'Ok': ['value'], 'Err': ['error'], 'Some': ['value'] }; // map variant name -> [field names] for pattern destructuring
    this._traitDecls = new Map(); // traitName -> { methods: [...] }
    this._traitImpls = new Map(); // "TraitName:TypeName" -> ImplDeclaration node
    // Source map tracking
    this._sourceMapsEnabled = true; // can be disabled for REPL/check mode
    this._propagateCache = new WeakMap(); // memoize _containsPropagate()
    this._yieldCache = new WeakMap(); // memoize _containsYield()
    this._sourceMappings = []; // {sourceLine, sourceCol, outputLine, outputCol, sourceFile?}
    this._outputLineCount = 0;
    this._sourceFile = null; // current source file for multi-file source maps
    // @fast mode for TypedArray optimization
    this._fastMode = false;
    this._typedArrayParams = new Map(); // paramName -> 'Float64Array' | 'Int32Array' | 'Uint8Array'
    this._typedArrayLocals = new Map(); // varName -> 'Float64Array' | 'Int32Array' | 'Uint8Array'
  }

  static TYPED_ARRAY_MAP = {
    'Int': 'Int32Array',
    'Float': 'Float64Array',
    'Byte': 'Uint8Array',
    'Int8': 'Int8Array',
    'Int16': 'Int16Array',
    'Int32': 'Int32Array',
    'Uint8': 'Uint8Array',
    'Uint16': 'Uint16Array',
    'Uint32': 'Uint32Array',
    'Float32': 'Float32Array',
    'Float64': 'Float64Array',
  };

  _uid() {
    return this._counter++;
  }

  // Returns true for AST nodes with no side effects that are safe to evaluate multiple times
  _isSimpleExpression(node) {
    if (!node) return false;
    switch (node.type) {
      case 'Identifier':
      case 'NumberLiteral':
      case 'StringLiteral':
      case 'BooleanLiteral':
      case 'NilLiteral':
        return true;
      case 'MemberExpression':
        return !node.computed && this._isSimpleExpression(node.object);
      default:
        return false;
    }
  }

  // Check if an AST expression references a given variable name
  _exprReferencesName(node, name) {
    if (!node) return false;
    switch (node.type) {
      case 'Identifier': return node.name === name;
      case 'BinaryExpression':
      case 'LogicalExpression':
        return this._exprReferencesName(node.left, name) || this._exprReferencesName(node.right, name);
      case 'UnaryExpression':
        return this._exprReferencesName(node.operand, name);
      case 'CallExpression':
        return this._exprReferencesName(node.callee, name) || node.arguments.some(a => this._exprReferencesName(a, name));
      case 'MemberExpression':
        return this._exprReferencesName(node.object, name) || (node.computed && this._exprReferencesName(node.property, name));
      case 'NumberLiteral':
      case 'StringLiteral':
      case 'BooleanLiteral':
      case 'NilLiteral':
        return false;
      default:
        return true; // conservative: assume it references the name
    }
  }

  // Known void/side-effect-only calls that shouldn't be implicitly returned
  static VOID_FNS = new Set(['print', 'assert', 'assert_eq', 'assert_ne']);
  _isVoidCall(expr) {
    if (expr.type !== 'CallExpression') return false;
    if (expr.callee.type === 'Identifier') {
      return BaseCodegen.VOID_FNS.has(expr.callee.name);
    }
    return false;
  }

  // ─── Scope tracking ─────────────────────────────────────────

  pushScope() {
    this._scopes.push(new Set());
  }

  popScope() {
    const removed = this._scopes.pop();
    // O(n) cleanup using reference counts instead of O(n*m) scope search
    for (const name of removed) {
      const rc = this._nameRefCount.get(name) - 1;
      if (rc <= 0) {
        this._nameRefCount.delete(name);
        this._visibleNames.delete(name);
      } else {
        this._nameRefCount.set(name, rc);
      }
    }
  }

  declareVar(name) {
    this._scopes[this._scopes.length - 1].add(name);
    this._visibleNames.add(name);
    this._nameRefCount.set(name, (this._nameRefCount.get(name) || 0) + 1);
  }

  isDeclared(name) {
    return this._visibleNames.has(name);
  }

  // ─── Helpers ────────────────────────────────────────────────

  i() {
    return '  '.repeat(this.indent);
  }

  // Set current source file for multi-file source map tracking
  setSourceFile(filename) {
    this._sourceFile = filename;
  }

  // Source map: record a mapping from source location to output line
  _addMapping(node, outputLine) {
    if (!this._sourceMapsEnabled) return;
    if (node && node.loc && node.loc.line) {
      const mapping = {
        sourceLine: node.loc.line - 1, // 0-based
        sourceCol: (node.loc.column || 1) - 1, // 0-based
        outputLine,
        outputCol: this.indent * 2, // approximate column from indent
      };
      if (this._sourceFile) mapping.sourceFile = this._sourceFile;
      this._sourceMappings.push(mapping);
    }
  }

  // Count newlines in a generated string to update output line tracking
  _countLines(code) {
    if (!code) return 0;
    let count = 0;
    for (let i = 0; i < code.length; i++) {
      if (code.charCodeAt(i) === 10) count++;
    }
    return count;
  }

  // Get collected source mappings
  getSourceMappings() {
    return this._sourceMappings;
  }

  getUsedBuiltins() {
    // Exclude builtins that the user has redefined at top level
    if (this._userDefinedNames.size > 0) {
      const filtered = new Set(this._usedBuiltins);
      for (const name of this._userDefinedNames) {
        filtered.delete(name);
      }
      return filtered;
    }
    return this._usedBuiltins;
  }

  // Track a builtin and its transitive dependencies from the stdlib dependency graph
  _trackBuiltin(name) {
    this._usedBuiltins.add(name);
    const deps = STDLIB_DEPS[name];
    if (deps) {
      for (const dep of deps) {
        this._usedBuiltins.add(dep);
      }
    }
  }

  getContainsHelper() {
    return [
      'function __contains(col, val) {',
      '  if (Array.isArray(col) || typeof col === \'string\') return col.includes(val);',
      '  if (col instanceof Set || col instanceof Map) return col.has(val);',
      '  if (typeof col === \'object\' && col !== null) return val in col;',
      '  return false;',
      '}',
    ].join('\n');
  }

  genPropagateExpression(node) {
    this._needsPropagateHelper = true;
    return `__propagate(${this.genExpression(node.expression)})`;
  }

  _containsPropagate(node) {
    if (!node) return false;
    if (node.type === 'PropagateExpression') return true;
    if (node.type === 'FunctionDeclaration' || node.type === 'LambdaExpression') return false;
    const cached = this._propagateCache.get(node);
    if (cached !== undefined) return cached;
    let result = false;
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'type') continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && this._containsPropagate(item)) { result = true; break; }
        }
      } else if (val && typeof val === 'object' && val.type) {
        if (this._containsPropagate(val)) { result = true; break; }
      }
      if (result) break;
    }
    this._propagateCache.set(node, result);
    return result;
  }

  getPropagateHelper() {
    return PROPAGATE;
  }

  getResultOptionHelper() {
    return RESULT_OPTION;
  }

  getStringProtoHelper() {
    return '// String methods are now standalone stdlib functions';
  }

  generateStatement(node) {
    if (!node) return '';

    // Record source mapping before generating (skip when source maps disabled)
    if (this._sourceMapsEnabled) this._addMapping(node, this._outputLineCount);

    let result;
    switch (node.type) {
      case 'Assignment': result = this.genAssignment(node); break;
      case 'VarDeclaration': result = this.genVarDeclaration(node); break;
      case 'LetDestructure': result = this.genLetDestructure(node); break;
      case 'FunctionDeclaration': result = this.genFunctionDeclaration(node); break;
      case 'TypeDeclaration': result = this.genTypeDeclaration(node); break;
      case 'ImportDeclaration': result = this.genImport(node); break;
      case 'ImportDefault': result = this.genImportDefault(node); break;
      case 'ImportWildcard': result = this.genImportWildcard(node); break;
      case 'IfStatement': result = this.genIfStatement(node); break;
      case 'ForStatement': result = this.genForStatement(node); break;
      case 'WhileStatement': result = this.genWhileStatement(node); break;
      case 'LoopStatement': result = this.genLoopStatement(node); break;
      case 'TryCatchStatement': result = this.genTryCatchStatement(node); break;
      case 'ReturnStatement': result = this.genReturnStatement(node); break;
      case 'ExpressionStatement': result = `${this.i()}${this.genExpression(node.expression)};`; break;
      case 'BlockStatement': result = this.genBlock(node); break;
      case 'CompoundAssignment': result = this.genCompoundAssignment(node); break;
      case 'BreakStatement': result = node.label ? `${this.i()}break ${node.label};` : `${this.i()}break;`; break;
      case 'ContinueStatement': result = node.label ? `${this.i()}continue ${node.label};` : `${this.i()}continue;`; break;
      case 'GuardStatement': result = this.genGuardStatement(node); break;
      case 'InterfaceDeclaration': result = this.genInterfaceDeclaration(node); break;
      case 'ImplDeclaration': result = this.genImplDeclaration(node); break;
      case 'TraitDeclaration': result = this.genTraitDeclaration(node); break;
      case 'TypeAlias': result = this.genTypeAlias(node); break;
      case 'DeferStatement': result = this.genDeferStatement(node); break;
      case 'WithStatement': result = this.genWithStatement(node); break;
      case 'ExternDeclaration': result = `${this.i()}// extern: ${node.name}`; break;
      // Config declarations handled at block level — emit nothing in statement context
      case 'AiConfigDeclaration': result = ''; break;
      case 'DataBlock': result = ''; break;
      case 'SourceDeclaration': result = ''; break;
      case 'PipelineDeclaration': result = ''; break;
      case 'ValidateBlock': result = ''; break;
      case 'RefreshPolicy': result = ''; break;
      case 'RefinementType': result = this.genRefinementType(node); break;
      default:
        result = `${this.i()}${this.genExpression(node)};`;
    }

    // Track output line count using fast character scan (skip when source maps disabled)
    if (this._sourceMapsEnabled && result) {
      this._outputLineCount += this._countLines(result) + 1; // +1 for the join newline
    }

    return result;
  }

  genExpression(node) {
    if (!node) return 'undefined';

    switch (node.type) {
      case 'Identifier':
        // Parameter substitution for map chain fusion
        if (this._paramSubstitutions && this._paramSubstitutions.has(node.name)) {
          return this._paramSubstitutions.get(node.name);
        }
        // Track builtin identifier usage (e.g., None used without call)
        if (BUILTIN_NAMES.has(node.name)) {
          this._usedBuiltins.add(node.name);
        }
        if (node.name === 'Ok' || node.name === 'Err' || node.name === 'Some' || node.name === 'None') {
          this._needsResultOption = true;
        }
        return node.name === '_' ? '_' : node.name;
      case 'NumberLiteral': return String(node.value);
      case 'StringLiteral': return JSON.stringify(node.value);
      case 'BooleanLiteral': return String(node.value);
      case 'NilLiteral': return 'null';
      case 'RegexLiteral': return `/${node.pattern}/${node.flags}`;
      case 'TemplateLiteral': return this.genTemplateLiteral(node);
      case 'BinaryExpression': return this.genBinaryExpression(node);
      case 'UnaryExpression': return this.genUnaryExpression(node);
      case 'LogicalExpression': return this.genLogicalExpression(node);
      case 'ChainedComparison': return this.genChainedComparison(node);
      case 'MembershipExpression': return this.genMembershipExpression(node);
      case 'IsExpression': return this.genIsExpression(node);
      case 'CallExpression': return this.genCallExpression(node);
      case 'MemberExpression': return this.genMemberExpression(node);
      case 'OptionalChain': return this.genOptionalChain(node);
      case 'PipeExpression': return this.genPipeExpression(node);
      case 'LambdaExpression': return this.genLambdaExpression(node);
      case 'MatchExpression': return this.genMatchExpression(node);
      case 'IfExpression': return this.genIfExpression(node);
      case 'ArrayLiteral': return this.genArrayLiteral(node);
      case 'ObjectLiteral': return this.genObjectLiteral(node);
      case 'ListComprehension': return this.genListComprehension(node);
      case 'DictComprehension': return this.genDictComprehension(node);
      case 'RangeExpression': return this.genRangeExpression(node);
      case 'SliceExpression': return this.genSliceExpression(node);
      case 'SpreadExpression': return `...${this.genExpression(node.argument)}`;
      case 'PropagateExpression': return this.genPropagateExpression(node);
      case 'NamedArgument': return this.genExpression(node.value);
      case 'AwaitExpression': return `(await ${this.genExpression(node.argument)})`;
      case 'YieldExpression': return node.delegate ? `(yield* ${this.genExpression(node.argument)})` : `(yield ${this.genExpression(node.argument)})`;
      case 'TupleExpression': return `[${node.elements.map(e => this.genExpression(e)).join(', ')}]`;
      // Column expressions (for table operations)
      case 'ColumnExpression': return this.genColumnExpression(node);
      case 'ColumnAssignment': return this.genColumnAssignment(node);
      case 'NegatedColumnExpression': return `{ __exclude: ${JSON.stringify(node.name)} }`;
      default:
        throw new Error(`Codegen: unknown expression type '${node.type}'`);
    }
  }

  // ─── Statements ───────────────────────────────────────────

  genAssignment(node) {
    const exportPrefix = node.isPublic ? 'export ' : '';
    if (node.targets.length === 1 && node.values.length === 1) {
      const target = node.targets[0];
      const value = node.values[0];
      // Member expression target: obj.x = expr, arr[i] = expr
      if (typeof target === 'object' && target.type === 'MemberExpression') {
        // IIFE elimination: match/if on RHS of member assignment
        if (this._needsIIFE(value)) {
          const memberExpr = this.genExpression(target);
          const lines = [];
          if (value.type === 'MatchExpression') {
            lines.push(this._genMatchAssign(value, memberExpr));
          } else {
            lines.push(this._genIfAssign(value, memberExpr));
          }
          return lines.join('\n');
        }
        return `${this.i()}${this.genExpression(target)} = ${this.genExpression(value)};`;
      }
      if (target === '_') {
        return `${this.i()}${this.genExpression(value)};`;
      }
      if (this.isDeclared(target)) {
        // Reassignment to an already-declared variable (must be mutable)
        // IIFE elimination: match/if on RHS of reassignment (skip if binding conflicts)
        if (this._needsIIFE(value) && !this._matchBindingsConflict(value, target)) {
          if (value.type === 'MatchExpression') {
            return this._genMatchAssign(value, target);
          } else {
            return this._genIfAssign(value, target);
          }
        }
        return `${this.i()}${target} = ${this.genExpression(value)};`;
      }
      this.declareVar(target);
      // Track top-level user definitions to avoid stdlib conflicts
      if (this._scopes.length === 1 && BUILTIN_NAMES.has(target)) {
        this._userDefinedNames.add(target);
      }
      // @fast mode: track typed array local variables for loop optimization
      if (this._fastMode && this._typedArrayLocals) {
        const taType = this._detectTypedArrayExpr(value);
        if (taType) this._typedArrayLocals.set(target, taType);
      }
      // IIFE elimination: match/if on RHS of new const declaration (skip if binding conflicts)
      if (this._needsIIFE(value) && !this._matchBindingsConflict(value, target)) {
        const lines = [];
        lines.push(`${this.i()}${exportPrefix}let ${target};`);
        if (value.type === 'MatchExpression') {
          lines.push(this._genMatchAssign(value, target));
        } else {
          lines.push(this._genIfAssign(value, target));
        }
        return lines.join('\n');
      }
      return `${this.i()}${exportPrefix}const ${target} = ${this.genExpression(value)};`;
    }

    // Multiple assignment: a, b = 1, 2 (uses destructuring for atomicity)
    const vals = node.values.map(v => this.genExpression(v));
    const allDeclared = node.targets.every(t => this.isDeclared(t));
    const noneDeclared = node.targets.every(t => !this.isDeclared(t));

    if (allDeclared) {
      // Reassignment (e.g., swap): [a, b] = [v1, v2]
      return `${this.i()}[${node.targets.join(', ')}] = [${vals.join(', ')}];`;
    }

    if (noneDeclared) {
      // New declarations: const [a, b] = [v1, v2]
      for (const t of node.targets) this.declareVar(t);
      return `${this.i()}${exportPrefix}const [${node.targets.join(', ')}] = [${vals.join(', ')}];`;
    }

    // Mixed: some declared, some new — generate individual assignments
    const lines = [];
    const tempArr = `__tmp_${this._uid()}`;
    lines.push(`${this.i()}const ${tempArr} = [${vals.join(', ')}];`);
    for (let idx = 0; idx < node.targets.length; idx++) {
      const t = node.targets[idx];
      if (this.isDeclared(t)) {
        lines.push(`${this.i()}${t} = ${tempArr}[${idx}];`);
      } else {
        this.declareVar(t);
        lines.push(`${this.i()}const ${t} = ${tempArr}[${idx}];`);
      }
    }
    return lines.join('\n');
  }

  genVarDeclaration(node) {
    const exportPrefix = node.isPublic ? 'export ' : '';
    if (node.targets.length === 1 && node.values.length === 1) {
      const target = node.targets[0];
      const value = node.values[0];
      this.declareVar(target);
      // IIFE elimination for var declarations too (skip if binding conflicts)
      if (this._needsIIFE(value) && !this._matchBindingsConflict(value, target)) {
        const lines = [];
        lines.push(`${this.i()}${exportPrefix}let ${target};`);
        if (value.type === 'MatchExpression') {
          lines.push(this._genMatchAssign(value, target));
        } else {
          lines.push(this._genIfAssign(value, target));
        }
        return lines.join('\n');
      }
      return `${this.i()}${exportPrefix}let ${target} = ${this.genExpression(value)};`;
    }
    const lines = [];
    for (let idx = 0; idx < node.targets.length; idx++) {
      this.declareVar(node.targets[idx]);
      const val = idx < node.values.length ? node.values[idx] : node.values[node.values.length - 1];
      lines.push(`${this.i()}${exportPrefix}let ${node.targets[idx]} = ${this.genExpression(val)};`);
    }
    return lines.join('\n');
  }

  genLetDestructure(node) {
    if (node.pattern.type === 'ObjectPattern') {
      for (const p of node.pattern.properties) this.declareVar(p.value);
      const props = node.pattern.properties.map(p => {
        let str = p.key;
        if (p.value !== p.key) str += `: ${p.value}`;
        if (p.defaultValue) str += ` = ${this.genExpression(p.defaultValue)}`;
        return str;
      }).join(', ');
      return `${this.i()}const { ${props} } = ${this.genExpression(node.value)};`;
    }
    if (node.pattern.type === 'ArrayPattern' || node.pattern.type === 'TuplePattern') {
      for (const e of node.pattern.elements) if (e) this.declareVar(e);
      const els = node.pattern.elements.map(e => e || '').join(', ');
      return `${this.i()}const [${els}] = ${this.genExpression(node.value)};`;
    }
    return '';
  }

  genFunctionDeclaration(node) {
    // Check for @wasm decorator — compile to WebAssembly
    if (node.decorators && node.decorators.some(d => d.name === 'wasm')) {
      return this.genWasmFunction(node);
    }
    // Check for @fast decorator — enable TypedArray optimizations
    const isFast = node.decorators && node.decorators.some(d => d.name === 'fast');
    const prevFastMode = this._fastMode;
    const prevTypedParams = this._typedArrayParams;
    const prevTypedLocals = this._typedArrayLocals;
    if (isFast) {
      this._fastMode = true;
      this._typedArrayParams = new Map();
      this._typedArrayLocals = new Map(); // track locally-created typed arrays
      // Scan params for typed array annotations: param: [Int], param: [Float], param: [Byte]
      for (const p of node.params) {
        if (p.typeAnnotation && p.typeAnnotation.type === 'ArrayTypeAnnotation' && p.typeAnnotation.elementType) {
          const elemName = p.typeAnnotation.elementType.name;
          const typedArrayType = BaseCodegen.TYPED_ARRAY_MAP[elemName];
          if (typedArrayType) {
            this._typedArrayParams.set(p.name, typedArrayType);
          }
        }
      }
    }
    const params = this.genParams(node.params);
    const hasPropagate = this._containsPropagate(node.body);
    const isGenerator = this._containsYield(node.body);
    const exportPrefix = node.isPublic ? 'export ' : '';
    const asyncPrefix = node.isAsync ? 'async ' : '';
    const genStar = isGenerator ? '*' : '';
    this.pushScope();
    for (const p of node.params) {
      if (p.destructure) {
        this._declareDestructureVars(p.destructure);
      } else {
        this.declareVar(p.name);
      }
    }
    const body = this.genBlockBody(node.body);
    this.popScope();
    const lines = [];
    lines.push(`${this.i()}${exportPrefix}${asyncPrefix}function${genStar} ${node.name}(${params}) {`);
    // In @fast mode, convert typed array params at function entry
    if (isFast && this._typedArrayParams.size > 0) {
      for (const [pName, taType] of this._typedArrayParams) {
        lines.push(`${this.i()}  ${pName} = ${pName} instanceof ${taType} ? ${pName} : new ${taType}(${pName});`);
      }
    }
    if (hasPropagate) {
      lines.push(`${this.i()}  try {`);
      lines.push(body);
      lines.push(`${this.i()}  } catch (__e) {`);
      lines.push(`${this.i()}    if (__e && __e.__tova_propagate) return __e.value;`);
      lines.push(`${this.i()}    throw __e;`);
      lines.push(`${this.i()}  }`);
    } else {
      lines.push(body);
    }
    lines.push(`${this.i()}}`);
    // Restore @fast state
    if (isFast) {
      this._fastMode = prevFastMode;
      this._typedArrayParams = prevTypedParams;
      this._typedArrayLocals = prevTypedLocals;
    }
    return lines.join('\n');
  }

  genWasmFunction(node) {
    try {
      // Track as user-defined to suppress stdlib version
      if (BUILTIN_NAMES.has(node.name)) this._userDefinedNames.add(node.name);
      const wasmBytes = compileWasmFunction(node);
      const glue = generateWasmGlue(node, wasmBytes);
      const exportPrefix = node.isPublic ? 'export ' : '';
      return `${this.i()}${exportPrefix}${glue}`;
    } catch (e) {
      // Fall back to JS if WASM compilation fails
      console.error(`Warning: @wasm compilation failed for '${node.name}': ${e.message}. Falling back to JS.`);
      node.decorators = node.decorators.filter(d => d.name !== 'wasm');
      return this.genFunctionDeclaration(node);
    }
  }

  genParams(params) {
    return params.map(p => {
      if (p.destructure) {
        if (p.destructure.type === 'ObjectPattern') {
          const props = p.destructure.properties.map(prop => {
            let str = prop.key;
            if (prop.value !== prop.key) str += `: ${prop.value}`;
            if (prop.defaultValue) str += ` = ${this.genExpression(prop.defaultValue)}`;
            return str;
          }).join(', ');
          return `{ ${props} }`;
        }
        if (p.destructure.type === 'ArrayPattern' || p.destructure.type === 'TuplePattern') {
          return `[${p.destructure.elements.join(', ')}]`;
        }
      }
      if (p.defaultValue) {
        return `${p.name} = ${this.genExpression(p.defaultValue)}`;
      }
      return p.name;
    }).join(', ');
  }

  genImport(node) {
    for (const s of node.specifiers) this.declareVar(s.local);
    const specs = node.specifiers.map(s => {
      if (s.imported !== s.local) return `${s.imported} as ${s.local}`;
      return s.imported;
    }).join(', ');
    return `${this.i()}import { ${specs} } from ${JSON.stringify(node.source)};`;
  }

  genImportDefault(node) {
    this.declareVar(node.local);
    return `${this.i()}import ${node.local} from ${JSON.stringify(node.source)};`;
  }

  genImportWildcard(node) {
    this.declareVar(node.local);
    return `${this.i()}import * as ${node.local} from ${JSON.stringify(node.source)};`;
  }

  genIfStatement(node) {
    const p = [];
    p.push(`${this.i()}if (${this.genExpression(node.condition)}) {\n`);
    this.indent++;
    this.pushScope();
    p.push(this.genBlockStatements(node.consequent));
    this.popScope();
    this.indent--;
    p.push(`\n${this.i()}}`);

    for (const alt of node.alternates) {
      p.push(` else if (${this.genExpression(alt.condition)}) {\n`);
      this.indent++;
      this.pushScope();
      p.push(this.genBlockStatements(alt.body));
      this.popScope();
      this.indent--;
      p.push(`\n${this.i()}}`);
    }

    if (node.elseBody) {
      p.push(` else {\n`);
      this.indent++;
      this.pushScope();
      p.push(this.genBlockStatements(node.elseBody));
      this.popScope();
      this.indent--;
      p.push(`\n${this.i()}}`);
    }

    return p.join('');
  }

  // Check if a for-loop over a range can be emitted as a C-style for loop
  _isRangeForOptimizable(node) {
    const vars = Array.isArray(node.variable) ? node.variable : [node.variable];
    if (vars.length !== 1 || typeof vars[0] !== 'string' || node.isAsync || node.elseBody) return false;
    if (node.iterable.type === 'RangeExpression') return true;
    // Optimize for i in range(n) / range(start, end) / range(start, end, step)
    if (node.iterable.type === 'CallExpression' &&
        node.iterable.callee.type === 'Identifier' &&
        node.iterable.callee.name === 'range' &&
        node.iterable.arguments.length >= 1 && node.iterable.arguments.length <= 3) return true;
    return false;
  }

  // @fast mode: detect if an expression produces a TypedArray
  // Returns the TypedArray type string (e.g. 'Float64Array') or null
  _detectTypedArrayExpr(value) {
    if (!value) return null;
    // Type.new(n) → new Type(n), where Type is a TypedArray
    if (value.type === 'MethodCall' && value.methodName === 'new' &&
        value.object && value.object.type === 'Identifier') {
      const taType = BaseCodegen.TYPED_ARRAY_MAP[value.object.name];
      if (taType) return taType;
      // Direct TypedArray names: Float64Array.new(n)
      if (Object.values(BaseCodegen.TYPED_ARRAY_MAP).includes(value.object.name)) return value.object.name;
    }
    // typed_add/typed_scale/typed_map/typed_sort return same type as input
    if (value.type === 'CallExpression' && value.callee && value.callee.type === 'Identifier') {
      const fname = value.callee.name;
      if (['typed_add', 'typed_scale', 'typed_map', 'typed_sort'].includes(fname)) {
        return 'Float64Array'; // conservative default
      }
      // typed_linspace returns Float64Array
      if (fname === 'typed_linspace') return 'Float64Array';
    }
    return null;
  }

  // @fast mode: check if a for-loop iterates over a known typed array
  // Returns the TypedArray type or null
  _getTypedArrayIterable(node) {
    if (!this._fastMode) return null;
    const iter = node.iterable;
    if (iter.type !== 'Identifier') return null;
    const name = iter.name;
    return this._typedArrayParams.get(name) || (this._typedArrayLocals && this._typedArrayLocals.get(name)) || null;
  }

  genForStatement(node) {
    const vars = Array.isArray(node.variable) ? node.variable : [node.variable];
    const labelPrefix = node.label ? `${node.label}: ` : '';
    const awaitKeyword = node.isAsync ? ' await' : '';

    // Optimization: for i in start..end => C-style for loop (avoids array allocation)
    if (this._isRangeForOptimizable(node)) {
      const varName = vars[0];
      let start, end, step, cmpOp;

      if (node.iterable.type === 'RangeExpression') {
        start = this.genExpression(node.iterable.start);
        end = this.genExpression(node.iterable.end);
        cmpOp = node.iterable.inclusive ? '<=' : '<';
        step = null;
      } else {
        // range(n) / range(start, end) / range(start, end, step)
        const args = node.iterable.arguments;
        if (args.length === 1) {
          start = '0';
          end = this.genExpression(args[0]);
          cmpOp = '<';
        } else if (args.length === 2) {
          start = this.genExpression(args[0]);
          end = this.genExpression(args[1]);
          cmpOp = '<';
        } else {
          start = this.genExpression(args[0]);
          end = this.genExpression(args[1]);
          step = this.genExpression(args[2]);
          cmpOp = '<';
        }
      }

      this.pushScope();
      this.declareVar(varName);
      const p = [];
      if (step) {
        // With explicit step: need to handle positive and negative step
        const stepVar = `__step_${this._uid()}`;
        p.push(`${this.i()}${labelPrefix}{ const ${stepVar} = ${step};\n`);
        p.push(`${this.i()}for (let ${varName} = ${start}; ${stepVar} > 0 ? ${varName} < ${end} : ${varName} > ${end}; ${varName} += ${stepVar}) {\n`);
      } else {
        p.push(`${this.i()}${labelPrefix}for (let ${varName} = ${start}; ${varName} ${cmpOp} ${end}; ${varName}++) {\n`);
      }
      this.indent++;
      if (node.guard) {
        p.push(`${this.i()}if (!(${this.genExpression(node.guard)})) continue;\n`);
      }
      p.push(this.genBlockStatements(node.body));
      this.indent--;
      p.push(`\n${this.i()}}`);
      if (step) p.push(`\n${this.i()}}`);
      this.popScope();
      return p.join('');
    }

    // @fast mode optimization: for val in typedArray => index-based loop (avoids iterator overhead)
    if (vars.length === 1 && !node.isAsync && !node.elseBody) {
      const taType = this._getTypedArrayIterable(node);
      if (taType) {
        const varName = vars[0];
        const arrName = node.iterable.name;
        const idxVar = `__i_${this._uid()}`;
        this.pushScope();
        this.declareVar(varName);
        const p = [];
        p.push(`${this.i()}${labelPrefix}for (let ${idxVar} = 0; ${idxVar} < ${arrName}.length; ${idxVar}++) {\n`);
        this.indent++;
        p.push(`${this.i()}const ${varName} = ${arrName}[${idxVar}];\n`);
        if (node.guard) {
          p.push(`${this.i()}if (!(${this.genExpression(node.guard)})) continue;\n`);
        }
        p.push(this.genBlockStatements(node.body));
        this.indent--;
        p.push(`\n${this.i()}}`);
        this.popScope();
        return p.join('');
      }
    }

    const iterExpr = this.genExpression(node.iterable);

    if (node.elseBody) {
      // for-else: run else if iterable was empty
      const tempVar = `__iter_${this._uid()}`;
      const enteredVar = `__entered_${this._uid()}`;
      const p = [];
      p.push(`${this.i()}{\n`);
      this.indent++;
      p.push(`${this.i()}const ${tempVar} = ${iterExpr};\n`);
      p.push(`${this.i()}let ${enteredVar} = false;\n`);
      this.pushScope();
      for (const v of vars) this.declareVar(v);
      if (vars.length === 2) {
        p.push(`${this.i()}${labelPrefix}for${awaitKeyword} (const [${vars[0]}, ${vars[1]}] of ${tempVar}) {\n`);
      } else {
        p.push(`${this.i()}${labelPrefix}for${awaitKeyword} (const ${vars[0]} of ${tempVar}) {\n`);
      }
      this.indent++;
      p.push(`${this.i()}${enteredVar} = true;\n`);
      if (node.guard) {
        p.push(`${this.i()}if (!(${this.genExpression(node.guard)})) continue;\n`);
      }
      p.push(this.genBlockStatements(node.body));
      this.indent--;
      p.push(`\n${this.i()}}\n`);
      this.popScope();
      this.pushScope();
      p.push(`${this.i()}if (!${enteredVar}) {\n`);
      this.indent++;
      p.push(this.genBlockStatements(node.elseBody));
      this.indent--;
      p.push(`\n${this.i()}}\n`);
      this.popScope();
      this.indent--;
      p.push(`${this.i()}}`);
      return p.join('');
    }

    this.pushScope();
    for (const v of vars) this.declareVar(v);
    const p = [];
    if (vars.length === 2) {
      p.push(`${this.i()}${labelPrefix}for${awaitKeyword} (const [${vars[0]}, ${vars[1]}] of ${iterExpr}) {\n`);
    } else {
      p.push(`${this.i()}${labelPrefix}for${awaitKeyword} (const ${vars[0]} of ${iterExpr}) {\n`);
    }
    this.indent++;
    if (node.guard) {
      p.push(`${this.i()}if (!(${this.genExpression(node.guard)})) continue;\n`);
    }
    p.push(this.genBlockStatements(node.body));
    this.indent--;
    p.push(`\n${this.i()}}`);
    this.popScope();

    return p.join('');
  }

  genWhileStatement(node) {
    const labelPrefix = node.label ? `${node.label}: ` : '';
    const p = [];
    p.push(`${this.i()}${labelPrefix}while (${this.genExpression(node.condition)}) {\n`);
    this.indent++;
    this.pushScope();
    p.push(this.genBlockStatements(node.body));
    this.popScope();
    this.indent--;
    p.push(`\n${this.i()}}`);
    return p.join('');
  }

  genLoopStatement(node) {
    const labelPrefix = node.label ? `${node.label}: ` : '';
    const p = [];
    p.push(`${this.i()}${labelPrefix}while (true) {\n`);
    this.indent++;
    this.pushScope();
    p.push(this.genBlockStatements(node.body));
    this.popScope();
    this.indent--;
    p.push(`\n${this.i()}}`);
    return p.join('');
  }

  genTryCatchStatement(node) {
    const p = [];
    p.push(`${this.i()}try {\n`);
    this.indent++;
    this.pushScope();
    for (const stmt of node.tryBody) {
      p.push(this.generateStatement(stmt) + '\n');
    }
    this.popScope();
    this.indent--;

    if (node.catchBody) {
      const catchVar = node.catchParam || '__err';
      p.push(`${this.i()}} catch (${catchVar}) {\n`);
      this.pushScope();
      this.declareVar(catchVar);
      this.indent++;
      // Re-throw propagation sentinels so ? operator works through user try/catch
      p.push(`${this.i()}if (${catchVar} && ${catchVar}.__tova_propagate) throw ${catchVar};\n`);
      for (const stmt of node.catchBody) {
        p.push(this.generateStatement(stmt) + '\n');
      }
      this.popScope();
      this.indent--;
      p.push(`${this.i()}}`);
    }

    if (node.finallyBody) {
      if (!node.catchBody) {
        // try/finally without catch
        p.push(`${this.i()}}`);
      }
      p.push(` finally {\n`);
      this.indent++;
      this.pushScope();
      for (const stmt of node.finallyBody) {
        p.push(this.generateStatement(stmt) + '\n');
      }
      this.popScope();
      this.indent--;
      p.push(`${this.i()}}`);
    }

    return p.join('');
  }

  genReturnStatement(node) {
    if (node.value) {
      return `${this.i()}return ${this.genExpression(node.value)};`;
    }
    return `${this.i()}return;`;
  }

  genCompoundAssignment(node) {
    return `${this.i()}${this.genExpression(node.target)} ${node.operator} ${this.genExpression(node.value)};`;
  }

  genBlock(node) {
    const p = [];
    p.push(`{\n`);
    this.indent++;
    this.pushScope();
    p.push(this.genBlockStatements(node));
    this.popScope();
    this.indent--;
    p.push(`\n${this.i()}}`);
    return p.join('');
  }

  genBlockBody(block) {
    if (block.type !== 'BlockStatement') {
      this.indent++;
      const code = `${this.i()}return ${this.genExpression(block)};`;
      this.indent--;
      return code;
    }

    this.indent++;
    const stmts = block.body;

    // Collect defer statements and separate them from regular statements
    const regularStmts = [];
    const deferBodies = [];
    for (const stmt of stmts) {
      if (stmt.type === 'DeferStatement') {
        deferBodies.push(stmt.body);
      } else {
        regularStmts.push(stmt);
      }
    }

    const lines = [];

    // If there are defers, wrap in try/finally
    if (deferBodies.length > 0) {
      lines.push(`${this.i()}try {`);
      this.indent++;
    }

    // Pre-scan for array fill patterns in function bodies
    const bodySkipSet = new Set();
    for (let i = 0; i < regularStmts.length - 1; i++) {
      const fillResult = this._detectArrayFillPattern(regularStmts[i], regularStmts[i + 1]);
      if (fillResult) {
        bodySkipSet.add(i);
        bodySkipSet.add(i + 1);
        lines.push(fillResult);
      }
    }

    for (let idx = 0; idx < regularStmts.length; idx++) {
      if (bodySkipSet.has(idx)) continue;
      const stmt = regularStmts[idx];
      const isLast = idx === regularStmts.length - 1;
      // Implicit return: last expression in function body
      // Skip implicit return for known void/side-effect-only calls (print, assert, etc.)
      if (isLast && stmt.type === 'ExpressionStatement' && !this._isVoidCall(stmt.expression)) {
        // IIFE elimination: match/if as last expression in function body → direct returns
        const expr = stmt.expression;
        if (expr.type === 'MatchExpression' && !this._isSimpleMatch(expr)) {
          lines.push(this._genMatchReturn(expr));
        } else if (expr.type === 'IfExpression' && this._needsIIFE(expr)) {
          lines.push(this._genIfReturn(expr));
        } else {
          lines.push(`${this.i()}return ${this.genExpression(stmt.expression)};`);
        }
      } else if (isLast && stmt.type === 'IfStatement' && stmt.elseBody) {
        lines.push(this._genIfStatementWithReturns(stmt));
      } else if (isLast && stmt.type === 'MatchExpression') {
        lines.push(`${this.i()}return ${this.genExpression(stmt)};`);
      } else {
        lines.push(this.generateStatement(stmt));
      }
    }

    if (deferBodies.length > 0) {
      this.indent--;
      lines.push(`${this.i()}} finally {`);
      this.indent++;
      // Execute defers in LIFO order
      for (let i = deferBodies.length - 1; i >= 0; i--) {
        const body = deferBodies[i];
        if (body.type === 'BlockStatement') {
          lines.push(this.genBlockStatements(body));
        } else {
          lines.push(`${this.i()}${this.genExpression(body)};`);
        }
      }
      this.indent--;
      lines.push(`${this.i()}}`);
    }

    this.indent--;
    return lines.join('\n');
  }

  _genIfStatementWithReturns(node) {
    const p = [];
    p.push(`${this.i()}if (${this.genExpression(node.condition)}) {\n`);
    p.push(this._genBlockBodyReturns(node.consequent));
    p.push(`\n${this.i()}}`);

    for (const alt of node.alternates) {
      p.push(` else if (${this.genExpression(alt.condition)}) {\n`);
      p.push(this._genBlockBodyReturns(alt.body));
      p.push(`\n${this.i()}}`);
    }

    if (node.elseBody) {
      p.push(` else {\n`);
      p.push(this._genBlockBodyReturns(node.elseBody));
      p.push(`\n${this.i()}}`);
    }

    return p.join('');
  }

  _genBlockBodyReturns(block) {
    // Like genBlockBody but always adds return to the last statement
    if (!block) return '';
    const stmts = block.type === 'BlockStatement' ? block.body : [block];
    this.indent++;
    const lines = [];
    for (let idx = 0; idx < stmts.length; idx++) {
      const stmt = stmts[idx];
      const isLast = idx === stmts.length - 1;
      if (isLast && stmt.type === 'ExpressionStatement') {
        lines.push(`${this.i()}return ${this.genExpression(stmt.expression)};`);
      } else if (isLast && stmt.type === 'IfStatement' && stmt.elseBody) {
        lines.push(this._genIfStatementWithReturns(stmt));
      } else if (isLast && stmt.type === 'MatchExpression') {
        lines.push(`${this.i()}return ${this.genExpression(stmt)};`);
      } else {
        lines.push(this.generateStatement(stmt));
      }
    }
    this.indent--;
    return lines.join('\n');
  }

  _genBlockBodyAssign(block, targetVar) {
    // Like _genBlockBodyReturns but emits `targetVar = expr` instead of `return expr`
    if (!block) return '';
    const stmts = block.type === 'BlockStatement' ? block.body : [block];
    this.indent++;
    const lines = [];
    for (let idx = 0; idx < stmts.length; idx++) {
      const stmt = stmts[idx];
      const isLast = idx === stmts.length - 1;
      if (isLast && stmt.type === 'ExpressionStatement') {
        lines.push(`${this.i()}${targetVar} = ${this.genExpression(stmt.expression)};`);
      } else if (isLast && stmt.type === 'IfStatement' && stmt.elseBody) {
        lines.push(this._genIfStatementWithAssigns(stmt, targetVar));
      } else if (isLast && stmt.type === 'MatchExpression') {
        // Nested match inside block — generate as assignment too
        lines.push(this._genMatchAssign(stmt, targetVar));
      } else {
        lines.push(this.generateStatement(stmt));
      }
    }
    this.indent--;
    return lines.join('\n');
  }

  _genIfStatementWithAssigns(node, targetVar) {
    const p = [];
    p.push(`${this.i()}if (${this.genExpression(node.condition)}) {\n`);
    p.push(this._genBlockBodyAssign(node.consequent, targetVar));
    p.push(`\n${this.i()}}`);

    for (const alt of node.alternates) {
      p.push(` else if (${this.genExpression(alt.condition)}) {\n`);
      p.push(this._genBlockBodyAssign(alt.body, targetVar));
      p.push(`\n${this.i()}}`);
    }

    if (node.elseBody) {
      p.push(` else {\n`);
      p.push(this._genBlockBodyAssign(node.elseBody, targetVar));
      p.push(`\n${this.i()}}`);
    }

    return p.join('');
  }

  genBlockStatements(block) {
    if (!block) return '';
    const stmts = block.type === 'BlockStatement' ? block.body : [block];
    const lines = [];
    const skipSet = new Set(); // indices to skip (consumed by pattern optimizations)
    // Pre-scan for array fill patterns: arr = []; for i in range(n) { arr.push(val) }
    for (let i = 0; i < stmts.length - 1; i++) {
      const fillResult = this._detectArrayFillPattern(stmts[i], stmts[i + 1]);
      if (fillResult) {
        skipSet.add(i);
        skipSet.add(i + 1);
        lines.push(fillResult);
      }
    }
    for (let i = 0; i < stmts.length; i++) {
      if (skipSet.has(i)) continue;
      const s = stmts[i];
      lines.push(this.generateStatement(s));
      // Dead code elimination: stop after unconditional return/break/continue
      if (s.type === 'ReturnStatement' || s.type === 'BreakStatement' || s.type === 'ContinueStatement') break;
    }
    return lines.join('\n');
  }

  // Detect pattern: arr = []; for i in range(n) { arr.push(val) }
  // Also handles: var arr = []; for i in range(n) { arr.push(val) }
  // Returns optimized code string or null
  _detectArrayFillPattern(assignStmt, forStmt) {
    // Step 1: Check first statement is `arr = []` or `var arr = []` (empty array)
    let target, isVar = false, exportPrefix = '';
    if (assignStmt.type === 'Assignment') {
      if (assignStmt.targets.length !== 1 || assignStmt.values.length !== 1) return null;
      target = assignStmt.targets[0];
      if (typeof target !== 'string') return null;
      const val = assignStmt.values[0];
      if (val.type !== 'ArrayLiteral' || val.elements.length !== 0) return null;
      exportPrefix = assignStmt.isPublic ? 'export ' : '';
    } else if (assignStmt.type === 'VarDeclaration') {
      if (assignStmt.targets.length !== 1 || assignStmt.values.length !== 1) return null;
      target = assignStmt.targets[0];
      if (typeof target !== 'string') return null;
      const val = assignStmt.values[0];
      if (val.type !== 'ArrayLiteral' || val.elements.length !== 0) return null;
      isVar = true;
      exportPrefix = assignStmt.isPublic ? 'export ' : '';
    } else {
      return null;
    }

    // Step 2: Check second statement is `for _ in range(n) { arr.push(fillVal) }`
    if (forStmt.type !== 'ForStatement') return null;
    if (forStmt.elseBody || forStmt.guard || forStmt.isAsync) return null;
    if (!this._isRangeForOptimizable(forStmt)) return null;

    // Get the range size
    let sizeExpr;
    if (forStmt.iterable.type === 'RangeExpression') {
      return null; // Only handle range(n) for now
    } else {
      const args = forStmt.iterable.arguments;
      if (args.length === 1) {
        sizeExpr = this.genExpression(args[0]);
      } else {
        return null; // range(start, end) / range(start, end, step) — not a simple fill
      }
    }

    // Step 3: Check the body is a single `arr.push(fillVal)` statement
    const body = forStmt.body;
    const bodyStmts = body.type === 'BlockStatement' ? body.body : [body];
    if (bodyStmts.length !== 1) return null;
    const bodyStmt = bodyStmts[0];
    // It should be an ExpressionStatement wrapping a CallExpression
    let callExpr;
    if (bodyStmt.type === 'ExpressionStatement') {
      callExpr = bodyStmt.expression;
    } else if (bodyStmt.type === 'CallExpression') {
      callExpr = bodyStmt;
    } else {
      return null;
    }
    if (callExpr.type !== 'CallExpression') return null;
    if (callExpr.callee.type !== 'MemberExpression') return null;
    if (callExpr.callee.property !== 'push') return null;
    if (callExpr.callee.object.type !== 'Identifier') return null;
    if (callExpr.callee.object.name !== target) return null;
    if (callExpr.arguments.length !== 1) return null;

    const fillArg = callExpr.arguments[0];
    // Ensure the fill value doesn't reference the loop variable (must be a constant fill)
    const loopVar = Array.isArray(forStmt.variable) ? forStmt.variable[0] : forStmt.variable;
    if (this._exprReferencesName(fillArg, loopVar)) return null;
    const fillExpr = this.genExpression(fillArg);

    // Declare the variable
    const isDeclared = this.isDeclared(target);
    if (!isDeclared) {
      this.declareVar(target);
    }
    const declKeyword = isVar ? `${exportPrefix}let ` : (isDeclared ? '' : `${exportPrefix}const `);
    // Boolean fills use Uint8Array for contiguous memory (3x faster for sieve-like patterns)
    if (fillArg.type === 'BooleanLiteral') {
      const fillVal = fillArg.value ? 1 : 0;
      return `${this.i()}${declKeyword}${target} = new Uint8Array(${sizeExpr})${fillVal ? '.fill(1)' : ''};`;
    }
    return `${this.i()}${declKeyword}${target} = new Array(${sizeExpr}).fill(${fillExpr});`;
  }

  // ─── Expressions ──────────────────────────────────────────

  genTemplateLiteral(node) {
    const parts = node.parts.map(p => {
      if (p.type === 'text') {
        return p.value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
      }
      return `\${${this.genExpression(p.value)}}`;
    }).join('');
    return `\`${parts}\``;
  }

  genBinaryExpression(node) {
    const op = node.operator;

    // Constant folding: arithmetic on two number literals
    if (node.left.type === 'NumberLiteral' && node.right.type === 'NumberLiteral') {
      const l = node.left.value, r = node.right.value;
      let folded = null;
      switch (op) {
        case '+': folded = l + r; break;
        case '-': folded = l - r; break;
        case '*': folded = l * r; break;
        case '/': if (r !== 0) folded = l / r; break;
        case '%': if (r !== 0) folded = l % r; break;
        case '**': folded = l ** r; break;
      }
      if (folded !== null && Number.isFinite(folded)) {
        return folded < 0 ? `(${folded})` : String(folded);
      }
    }

    // Constant folding: string concatenation with ++
    if (op === '++' && node.left.type === 'StringLiteral' && node.right.type === 'StringLiteral') {
      return JSON.stringify(node.left.value + node.right.value);
    }

    const left = this.genExpression(node.left);
    const right = this.genExpression(node.right);

    // String multiply: "ha" * 3 => "ha".repeat(3), also x * 3 when x is string
    if (op === '*' &&
      (node.left.type === 'StringLiteral' || node.left.type === 'TemplateLiteral')) {
      return `${left}.repeat(${right})`;
    }
    if (op === '*' &&
      (node.right.type === 'StringLiteral' || node.right.type === 'TemplateLiteral')) {
      return `${right}.repeat(${left})`;
    }

    // Tova ?? is NaN-safe: catches null, undefined, AND NaN
    if (op === '??') {
      if (this._isSimpleExpression(node.left)) {
        return `((${left} != null && ${left} === ${left}) ? ${left} : ${right})`;
      }
      return `((__tova_v) => (__tova_v != null && __tova_v === __tova_v) ? __tova_v : ${right})(${left})`;
    }

    return `(${left} ${op} ${right})`;
  }

  genUnaryExpression(node) {
    const operand = this.genExpression(node.operand);
    if (node.operator === 'not') return `(!${operand})`;
    return `(${node.operator}${operand})`;
  }

  genLogicalExpression(node) {
    const left = this.genExpression(node.left);
    const right = this.genExpression(node.right);
    const op = node.operator === 'and' ? '&&' : node.operator === 'or' ? '||' : node.operator;
    return `(${left} ${op} ${right})`;
  }

  genChainedComparison(node) {
    // a < b < c => ((__t0 = a) < (__t1 = b) && __t1 < c)
    // Use temp vars for intermediate operands to avoid evaluating expressions multiple times
    if (node.operators.length === 1) {
      // Simple case: no duplication needed
      const left = this.genExpression(node.operands[0]);
      const right = this.genExpression(node.operands[1]);
      return `(${left} ${node.operators[0]} ${right})`;
    }
    // Optimization: if all intermediate operands are simple (no side effects),
    // we can inline them without temp vars or IIFE
    const intermediateOperands = node.operands.slice(1, -1);
    const allSimple = intermediateOperands.every(op => this._isSimpleExpression(op));

    if (allSimple) {
      const parts = [];
      for (let idx = 0; idx < node.operators.length; idx++) {
        const left = this.genExpression(node.operands[idx]);
        const right = this.genExpression(node.operands[idx + 1]);
        parts.push(`(${left} ${node.operators[idx]} ${right})`);
      }
      return `(${parts.join(' && ')})`;
    }

    const temps = [];
    const parts = [];
    for (let idx = 0; idx < node.operators.length; idx++) {
      let left, right;
      if (idx === 0) {
        left = this.genExpression(node.operands[idx]);
      } else {
        left = temps[idx - 1];
      }
      if (idx < node.operators.length - 1) {
        // Intermediate operand: assign to temp var so it's not evaluated twice
        const tmp = `__cmp_${this._uid()}`;
        temps.push(tmp);
        right = `(${tmp} = ${this.genExpression(node.operands[idx + 1])})`;
      } else {
        right = this.genExpression(node.operands[idx + 1]);
      }
      parts.push(`(${left} ${node.operators[idx]} ${right})`);
    }
    if (temps.length > 0) {
      return `(() => { let ${temps.join(', ')}; return (${parts.join(' && ')}); })()`;
    }
    return `(${parts.join(' && ')})`;
  }

  // Try to specialize `in` checks based on the collection's AST type
  _specializeContains(collectionNode, colCode, valCode) {
    switch (collectionNode.type) {
      case 'ArrayLiteral':
        return `${colCode}.includes(${valCode})`;
      case 'StringLiteral':
      case 'TemplateLiteral':
        return `${colCode}.includes(${valCode})`;
      case 'CallExpression':
        if (collectionNode.callee.type === 'MemberExpression' &&
            !collectionNode.callee.computed &&
            collectionNode.callee.property === 'new') {
          const objName = collectionNode.callee.object.type === 'Identifier'
            ? collectionNode.callee.object.name : null;
          if (objName === 'Set' || objName === 'Map') {
            return `${colCode}.has(${valCode})`;
          }
        }
        return null;
      case 'ObjectLiteral':
        return `(${valCode} in ${colCode})`;
      default:
        return null;
    }
  }

  genMembershipExpression(node) {
    const val = this.genExpression(node.value);
    const col = this.genExpression(node.collection);

    // Try specialized check based on collection type
    const specialized = this._specializeContains(node.collection, col, val);
    if (specialized) {
      if (node.negated) {
        return `(!${specialized})`;
      }
      return specialized;
    }

    this._needsContainsHelper = true;
    if (node.negated) {
      return `(!__contains(${col}, ${val}))`;
    }
    return `__contains(${col}, ${val})`;
  }

  genIsExpression(node) {
    const val = this.genExpression(node.value);
    const op = node.negated ? '!==' : '===';
    const notOp = node.negated ? '!' : '';

    // Map Tova type names to JS runtime checks
    switch (node.typeName) {
      case 'String':
        return `(typeof ${val} ${op} 'string')`;
      case 'Int':
        return node.negated
          ? `(typeof ${val} !== 'number' || !Number.isInteger(${val}))`
          : `(typeof ${val} === 'number' && Number.isInteger(${val}))`;
      case 'Float':
        return node.negated
          ? `(typeof ${val} !== 'number' || Number.isInteger(${val}))`
          : `(typeof ${val} === 'number' && !Number.isInteger(${val}))`;
      case 'Bool':
        return `(typeof ${val} ${op} 'boolean')`;
      case 'Nil':
        return `(${val} ${op} null)`;
      case 'Array':
        return `(${notOp}Array.isArray(${val}))`;
      case 'Function':
        return `(typeof ${val} ${op} 'function')`;
      case 'Number':
        return `(typeof ${val} ${op} 'number')`;
      default:
        // For ADT variants, check __tag; for classes, use instanceof
        return node.negated
          ? `(!(${val} != null && (${val}.__tag === '${node.typeName}' || ${val} instanceof (typeof ${node.typeName} !== 'undefined' ? ${node.typeName} : function(){}))))`
          : `(${val} != null && (${val}.__tag === '${node.typeName}' || ${val} instanceof (typeof ${node.typeName} !== 'undefined' ? ${node.typeName} : function(){})))`;
    }
  }

  genCallExpression(node) {
    // Result/Option .map() chain fusion: Ok(val).map(fn(x) e1).map(fn(x) e2) → Ok(e2(e1(val)))
    const fusedResult = this._tryFuseMapChain(node);
    if (fusedResult !== null) return fusedResult;

    // Transform Foo.new(...) → new Foo(...)
    if (node.callee.type === 'MemberExpression' && !node.callee.computed && node.callee.property === 'new') {
      const obj = this.genExpression(node.callee.object);
      const args = node.arguments.map(a => this.genExpression(a)).join(', ');
      return `new ${obj}(${args})`;
    }

    // Track builtin usage for tree-shaking (with dependency resolution)
    if (node.callee.type === 'Identifier') {
      if (BUILTIN_NAMES.has(node.callee.name)) {
        this._trackBuiltin(node.callee.name);
      }
      if (node.callee.name === 'Ok' || node.callee.name === 'Err' || node.callee.name === 'Some') {
        this._needsResultOption = true;
      }
      // Seq is a dependency of iter — handled by _trackBuiltin via STDLIB_DEPS
      if (node.callee.name === 'iter') {
        this._needsResultOption = true; // Seq.first()/find() return Option
      }

      // Inline string/collection builtins to direct method calls
      const inlined = this._tryInlineBuiltin(node);
      if (inlined !== null) return inlined;
    }

    // Track namespace builtin usage: math.sin() → include 'math' namespace + deps
    if (node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        BUILTIN_NAMES.has(node.callee.object.name)) {
      const ns = node.callee.object.name;
      this._trackBuiltin(ns);
      // Namespaces that depend on Ok/Err need Result/Option
      const deps = STDLIB_DEPS[ns];
      if (deps && (deps.includes('Ok') || deps.includes('Err'))) {
        this._needsResultOption = true;
      }
    }

    // Check for table operation calls with column expressions
    const hasColumnExprs = node.arguments.some(a => this._containsColumnExpr(a));
    if (hasColumnExprs || (node.callee.type === 'Identifier' && ['agg', 'table_agg'].includes(node.callee.name))) {
      const tableArgs = this._genTableCallArgs(node);
      if (tableArgs) {
        const callee = this.genExpression(node.callee);
        return `${callee}(${tableArgs.join(', ')})`;
      }
    }

    const callee = this.genExpression(node.callee);
    const hasNamedArgs = node.arguments.some(a => a.type === 'NamedArgument');

    if (hasNamedArgs) {
      const allNamed = node.arguments.every(a => a.type === 'NamedArgument');
      if (allNamed) {
        // All named args → single object argument
        const parts = node.arguments.map(a => `${a.name}: ${this.genExpression(a.value)}`);
        return `${callee}({ ${parts.join(', ')} })`;
      }
      // Mixed: positional first, then named as trailing object
      const positional = [];
      const named = [];
      for (const a of node.arguments) {
        if (a.type === 'NamedArgument') {
          named.push(`${a.name}: ${this.genExpression(a.value)}`);
        } else {
          positional.push(this.genExpression(a));
        }
      }
      return `${callee}(${[...positional, `{ ${named.join(', ')} }`].join(', ')})`;
    }

    const args = node.arguments.map(a => this.genExpression(a)).join(', ');
    return `${callee}(${args})`;
  }

  // Fuse Ok(val).map(fn(x) e1).map(fn(x) e2) → Ok(composed(val))
  // Eliminates intermediate Ok/Some allocations in .map() chains
  _tryFuseMapChain(node) {
    // Must be a .map() call with exactly 1 argument
    if (node.callee.type !== 'MemberExpression' || node.callee.computed) return null;
    if (node.callee.property !== 'map') return null;
    if (node.arguments.length !== 1) return null;

    // Collect the chain of .map() calls
    const mapFns = []; // array of lambda AST nodes, outermost first
    let current = node;
    while (
      current.type === 'CallExpression' &&
      current.callee.type === 'MemberExpression' &&
      !current.callee.computed &&
      current.callee.property === 'map' &&
      current.arguments.length === 1
    ) {
      const lambda = current.arguments[0];
      // Only fuse simple single-expression lambdas with exactly 1 param
      if (lambda.type !== 'FunctionExpression' && lambda.type !== 'ArrowFunction' && lambda.type !== 'LambdaExpression') return null;
      const params = lambda.params || [];
      if (params.length !== 1) return null;
      const paramName = typeof params[0] === 'string' ? params[0] : (params[0].name || null);
      if (!paramName) return null;
      // Body must be a single expression (not a BlockStatement, or a block with 1 expression)
      let bodyExpr = lambda.body;
      if (bodyExpr && bodyExpr.type === 'BlockStatement') {
        if (bodyExpr.body.length === 1) {
          const s = bodyExpr.body[0];
          if (s.type === 'ExpressionStatement') bodyExpr = s.expression;
          else if (s.type === 'ReturnStatement' && s.value) bodyExpr = s.value;
          else return null;
        } else {
          return null;
        }
      }
      mapFns.unshift({ paramName, bodyExpr }); // prepend so inner is first
      current = current.callee.object;
    }

    // Need at least 2 .map() calls to benefit from fusion
    if (mapFns.length < 2) return null;

    // The base must be Ok(val) or Some(val)
    if (current.type !== 'CallExpression') return null;
    if (current.callee.type !== 'Identifier') return null;
    const wrapperFn = current.callee.name;
    if (wrapperFn !== 'Ok' && wrapperFn !== 'Some') return null;
    if (current.arguments.length !== 1) return null;

    this._needsResultOption = true;

    // Compose the lambdas: val → f1(val) → f2(f1(val)) → ...
    // Generate inner-to-outer composition
    let innerExpr = this.genExpression(current.arguments[0]);
    for (const { paramName, bodyExpr } of mapFns) {
      // Substitute paramName with the current innerExpr in bodyExpr
      innerExpr = this._substituteParam(bodyExpr, paramName, innerExpr);
    }

    return `${wrapperFn}(${innerExpr})`;
  }

  // Generate expression code with a parameter substituted by a value expression string
  _substituteParam(exprNode, paramName, valueCode) {
    // Simple approach: generate the expression, but override identifier resolution
    // We save and restore a substitution map
    if (!this._paramSubstitutions) this._paramSubstitutions = new Map();
    this._paramSubstitutions.set(paramName, valueCode);
    const result = this.genExpression(exprNode);
    this._paramSubstitutions.delete(paramName);
    return result;
  }

  // Inline known builtins to direct method calls, eliminating wrapper overhead.
  // Returns the inlined code string, or null if not inlineable.
  _tryInlineBuiltin(node) {
    const name = node.callee.name;
    const args = node.arguments;

    switch (name) {
      // String methods: fn(str, ...) → str.method(...)
      case 'split':
        if (args.length === 2)
          return `${this.genExpression(args[0])}.split(${this.genExpression(args[1])})`;
        break;
      case 'join':
        if (args.length === 2)
          return `${this.genExpression(args[0])}.join(${this.genExpression(args[1])})`;
        if (args.length === 1)
          return `${this.genExpression(args[0])}.join('')`;
        break;
      case 'replace':
        if (args.length === 3)
          return `${this.genExpression(args[0])}.replaceAll(${this.genExpression(args[1])}, ${this.genExpression(args[2])})`;
        break;
      case 'contains':
        if (args.length === 2)
          return `${this.genExpression(args[0])}.includes(${this.genExpression(args[1])})`;
        break;
      case 'upper':
        if (args.length === 1)
          return `${this.genExpression(args[0])}.toUpperCase()`;
        break;
      case 'lower':
        if (args.length === 1)
          return `${this.genExpression(args[0])}.toLowerCase()`;
        break;
      case 'trim':
        if (args.length === 1)
          return `${this.genExpression(args[0])}.trim()`;
        break;
      case 'trim_start':
        if (args.length === 1)
          return `${this.genExpression(args[0])}.trimStart()`;
        break;
      case 'trim_end':
        if (args.length === 1)
          return `${this.genExpression(args[0])}.trimEnd()`;
        break;
      case 'repeat':
        if (args.length === 2)
          return `${this.genExpression(args[0])}.repeat(${this.genExpression(args[1])})`;
        break;
      case 'starts_with':
        if (args.length === 2)
          return `${this.genExpression(args[0])}.startsWith(${this.genExpression(args[1])})`;
        break;
      case 'ends_with':
        if (args.length === 2)
          return `${this.genExpression(args[0])}.endsWith(${this.genExpression(args[1])})`;
        break;
      case 'pad_start':
        if (args.length >= 2)
          return `${this.genExpression(args[0])}.padStart(${this.genExpression(args[1])}${args[2] ? ', ' + this.genExpression(args[2]) : ''})`;
        break;
      case 'pad_end':
        if (args.length >= 2)
          return `${this.genExpression(args[0])}.padEnd(${this.genExpression(args[1])}${args[2] ? ', ' + this.genExpression(args[2]) : ''})`;
        break;
      case 'includes':
        if (args.length === 2)
          return `${this.genExpression(args[0])}.includes(${this.genExpression(args[1])})`;
        break;
      case 'char_at':
        if (args.length === 2)
          return `${this.genExpression(args[0])}[${this.genExpression(args[1])}]`;
        break;
    }

    return null;
  }

  genMemberExpression(node) {
    // Track namespace builtin usage: math.PI → include 'math' namespace + deps
    if (node.object.type === 'Identifier' && BUILTIN_NAMES.has(node.object.name)) {
      this._trackBuiltin(node.object.name);
    }
    const obj = this.genExpression(node.object);
    if (node.computed) {
      return `${obj}[${this.genExpression(node.property)}]`;
    }
    return `${obj}.${node.property}`;
  }

  genOptionalChain(node) {
    const obj = this.genExpression(node.object);
    if (node.computed) {
      return `${obj}?.[${this.genExpression(node.property)}]`;
    }
    return `${obj}?.${node.property}`;
  }

  genPipeExpression(node) {
    const left = this.genExpression(node.left);
    const right = node.right;

    // Method pipe: x |> .method(args) => x.method(args)
    if (right.type === 'CallExpression' && right.callee.type === 'MemberExpression' &&
        right.callee.object.type === 'Identifier' && right.callee.object.name === PIPE_TARGET) {
      // This is the .method() case - handled through special MemberExpression with empty object
      const method = right.callee.property;
      const args = right.arguments.map(a => this.genExpression(a)).join(', ');
      return `${left}.${method}(${args})`;
    }

    // If right is a call expression, check for placeholder _ or insert as first arg
    if (right.type === 'CallExpression') {
      // Check for table operations with column expressions
      const hasColumnExprs = right.arguments.some(a => this._containsColumnExpr(a));
      if (hasColumnExprs || (right.callee.type === 'Identifier' && ['agg', 'table_agg'].includes(right.callee.name))) {
        const tableArgs = this._genTableCallArgs(right);
        if (tableArgs) {
          const callee = this.genExpression(right.callee);
          // Track builtin usage
          if (right.callee.type === 'Identifier' && BUILTIN_NAMES.has(right.callee.name)) {
            this._usedBuiltins.add(right.callee.name);
          }
          return `${callee}(${[left, ...tableArgs].join(', ')})`;
        }
      }

      const placeholderCount = right.arguments.filter(a => a.type === 'Identifier' && a.name === '_').length;
      if (placeholderCount > 0) {
        const callee = this.genExpression(right.callee);
        if (placeholderCount > 1) {
          // Multiple placeholders: inline if left is simple, otherwise IIFE temp var
          if (this._isSimpleExpression(node.left)) {
            const args = right.arguments.map(a => {
              if (a.type === 'Identifier' && a.name === '_') return left;
              return this.genExpression(a);
            }).join(', ');
            return `${callee}(${args})`;
          }
          const tmp = `__pipe_${this._uid()}`;
          const args = right.arguments.map(a => {
            if (a.type === 'Identifier' && a.name === '_') return tmp;
            return this.genExpression(a);
          }).join(', ');
          return `((${tmp}) => ${callee}(${args}))(${left})`;
        }
        // Single placeholder: inline directly
        const args = right.arguments.map(a => {
          if (a.type === 'Identifier' && a.name === '_') return left;
          return this.genExpression(a);
        }).join(', ');
        return `${callee}(${args})`;
      }
      const callee = this.genExpression(right.callee);
      const args = [left, ...right.arguments.map(a => this.genExpression(a))].join(', ');
      return `${callee}(${args})`;
    }
    // If right is an identifier, call it with left as argument
    if (right.type === 'Identifier') {
      return `${right.name}(${left})`;
    }
    // Method pipe without call: x |> .method => x.method
    if (right.type === 'MemberExpression' && right.object.type === 'Identifier' && right.object.name === PIPE_TARGET) {
      return `${left}.${right.property}`;
    }
    // Fallback
    return `(${this.genExpression(right)})(${left})`;
  }

  // ─── Column expressions ──────────────────────────────────

  // Context flag for whether we're inside a select() call argument list
  _columnAsString = false;

  genColumnExpression(node) {
    // Inside select(), column expressions compile to string names
    if (this._columnAsString) {
      return JSON.stringify(node.name);
    }
    // Default: compile to row lambda
    return `(__row) => __row.${node.name}`;
  }

  genColumnAssignment(node) {
    // Compile to object entry for derive(): { colName: (row) => expr }
    // The expression inside the assignment may reference other columns
    const expr = this._genColumnBody(node.expression);
    return `${JSON.stringify(node.target)}: (__row) => ${expr}`;
  }

  // Generate an expression body that wraps column references as __row.col
  _genColumnBody(node) {
    if (!node) return 'undefined';
    if (node.type === 'ColumnExpression') {
      return `__row.${node.name}`;
    }
    if (node.type === 'BinaryExpression') {
      return `(${this._genColumnBody(node.left)} ${node.operator} ${this._genColumnBody(node.right)})`;
    }
    if (node.type === 'LogicalExpression') {
      const op = node.operator === 'and' ? '&&' : node.operator === 'or' ? '||' : node.operator;
      return `(${this._genColumnBody(node.left)} ${op} ${this._genColumnBody(node.right)})`;
    }
    if (node.type === 'UnaryExpression') {
      return `${node.operator}${this._genColumnBody(node.operand)}`;
    }
    if (node.type === 'CallExpression') {
      // Check if callee is a builtin used as pipe target
      const callee = this.genExpression(node.callee);
      const args = node.arguments.map(a => this._genColumnBody(a)).join(', ');
      return `${callee}(${args})`;
    }
    if (node.type === 'PipeExpression') {
      const left = this._genColumnBody(node.left);
      const right = node.right;
      if (right.type === 'CallExpression') {
        const callee = this.genExpression(right.callee);
        const args = [left, ...right.arguments.map(a => this._genColumnBody(a))].join(', ');
        return `${callee}(${args})`;
      }
      if (right.type === 'Identifier') {
        return `${right.name}(${left})`;
      }
      return `(${this._genColumnBody(right)})(${left})`;
    }
    if (node.type === 'TemplateLiteral') {
      // Template literal with column references
      const parts = node.parts.map(p => {
        if (p.type === 'text') return p.value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
        return `\${${this._genColumnBody(p.value)}}`;
      });
      return '`' + parts.join('') + '`';
    }
    if (node.type === 'ConditionalExpression' || node.type === 'IfExpression') {
      const cond = this._genColumnBody(node.condition);
      const cons = this._genColumnBody(node.consequent);
      const alt = node.alternate || node.elseBody;
      const altCode = alt ? this._genColumnBody(alt) : 'undefined';
      return `(${cond} ? ${cons} : ${altCode})`;
    }
    if (node.type === 'MatchExpression') {
      // Match on column value
      const subject = this._genColumnBody(node.subject);
      const tmp = `__match_${this._uid()}`;
      let code = `((__m) => { `;
      for (const arm of node.arms) {
        if (arm.pattern.type === 'WildcardPattern') {
          const body = this._genColumnBody(arm.body);
          code += `return ${body}; `;
        } else if (arm.pattern.type === 'RangePattern') {
          const start = this.genExpression(arm.pattern.start);
          const end = this.genExpression(arm.pattern.end);
          const op = arm.pattern.inclusive ? '<=' : '<';
          code += `if (__m >= ${start} && __m ${op} ${end}) return ${this._genColumnBody(arm.body)}; `;
        } else {
          const pat = this.genExpression(arm.pattern.value || arm.pattern);
          code += `if (__m === ${pat}) return ${this._genColumnBody(arm.body)}; `;
        }
      }
      code += `})(${subject})`;
      return code;
    }
    if (node.type === 'MemberExpression') {
      const obj = this._genColumnBody(node.object);
      if (node.computed) {
        return `${obj}[${this._genColumnBody(node.property)}]`;
      }
      return `${obj}.${node.property}`;
    }
    // Fallback to normal expression generation for constants, strings, etc.
    return this.genExpression(node);
  }

  // Override genCallExpression to handle table operations with column expressions
  _genTableCallArgs(node) {
    const calleeName = node.callee.type === 'Identifier' ? node.callee.name : null;

    // select() — column expressions should compile to strings
    if (calleeName === 'select' || calleeName === 'table_select') {
      this._columnAsString = true;
      const args = node.arguments.map(a => this.genExpression(a));
      this._columnAsString = false;
      return args;
    }

    // where() — column expressions compile to row lambdas
    if (calleeName === 'where' || calleeName === 'table_where') {
      return node.arguments.map(a => {
        if (this._containsColumnExpr(a)) {
          return `(__row) => ${this._genColumnBody(a)}`;
        }
        return this.genExpression(a);
      });
    }

    // sort_by() — column expression compiles to row lambda
    if (calleeName === 'sort_by' || calleeName === 'table_sort_by') {
      return node.arguments.map(a => {
        if (this._containsColumnExpr(a)) {
          return `(__row) => ${this._genColumnBody(a)}`;
        }
        return this.genExpression(a);
      });
    }

    // group_by() — column expression compiles to row lambda
    if (calleeName === 'group_by' || calleeName === 'table_group_by') {
      return node.arguments.map(a => {
        if (this._containsColumnExpr(a)) {
          return `(__row) => ${this._genColumnBody(a)}`;
        }
        return this.genExpression(a);
      });
    }

    // derive() — column assignments compile to { name: (row) => expr }
    if (calleeName === 'derive' || calleeName === 'table_derive') {
      const parts = [];
      for (const a of node.arguments) {
        if (a.type === 'ColumnAssignment') {
          parts.push(this.genColumnAssignment(a));
        } else {
          parts.push(this.genExpression(a));
        }
      }
      // Wrap column assignments in an object
      const hasAssignments = node.arguments.some(a => a.type === 'ColumnAssignment');
      if (hasAssignments) {
        return [`{ ${parts.join(', ')} }`];
      }
      return parts;
    }

    // agg() — named arguments with aggregation functions
    if (calleeName === 'agg' || calleeName === 'table_agg') {
      const parts = [];
      for (const a of node.arguments) {
        if (a.type === 'NamedArgument') {
          // Named agg: total: sum(.amount) → total: agg_sum((__row) => __row.amount)
          const val = a.value;
          if (val.type === 'CallExpression' && val.callee.type === 'Identifier') {
            const aggName = val.callee.name;
            const aggFn = `agg_${aggName}`;
            if (['sum', 'count', 'mean', 'median', 'min', 'max'].includes(aggName)) {
              this._usedBuiltins.add(aggFn);
              if (val.arguments.length === 0) {
                // count() with no args
                parts.push(`${a.name}: ${aggFn}()`);
              } else {
                const inner = val.arguments[0];
                if (this._containsColumnExpr(inner)) {
                  parts.push(`${a.name}: ${aggFn}((__row) => ${this._genColumnBody(inner)})`);
                } else {
                  parts.push(`${a.name}: ${aggFn}(${this.genExpression(inner)})`);
                }
              }
              continue;
            }
          }
          parts.push(`${a.name}: ${this.genExpression(a.value)}`);
        } else {
          parts.push(this.genExpression(a));
        }
      }
      const hasNamed = node.arguments.some(a => a.type === 'NamedArgument');
      if (hasNamed) {
        return [`{ ${parts.join(', ')} }`];
      }
      return parts;
    }

    // drop_nil/fill_nil — column expression compiles to string or lambda
    if (calleeName === 'drop_nil' || calleeName === 'fill_nil') {
      return node.arguments.map(a => {
        if (a.type === 'ColumnExpression') {
          return JSON.stringify(a.name);
        }
        return this.genExpression(a);
      });
    }

    // join() — handle left/right column expressions
    if (calleeName === 'join' || calleeName === 'table_join') {
      return node.arguments.map(a => {
        if (a.type === 'NamedArgument') {
          if ((a.name === 'left' || a.name === 'right') && a.value.type === 'ColumnExpression') {
            return this.genExpression(a); // NamedArgument genExpression handles it
          }
        }
        return this.genExpression(a);
      });
    }

    return null; // No special handling needed
  }

  _containsColumnExpr(node) {
    if (!node) return false;
    if (node.type === 'ColumnExpression' || node.type === 'ColumnAssignment' || node.type === 'NegatedColumnExpression') return true;
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'type') continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && this._containsColumnExpr(item)) return true;
        }
      } else if (val && typeof val === 'object' && val.type) {
        if (this._containsColumnExpr(val)) return true;
      }
    }
    return false;
  }

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
        const p = [];
        p.push(`${asyncPrefix}(${params}) => {`);
        p.push(`${this.i()}  try {`);
        p.push(body);
        p.push(`${this.i()}  } catch (__e) {`);
        p.push(`${this.i()}    if (__e && __e.__tova_propagate) return __e.value;`);
        p.push(`${this.i()}    throw __e;`);
        p.push(`${this.i()}  }`);
        p.push(`${this.i()}}`);
        return p.join('\n');
      }
      return [`${asyncPrefix}(${params}) => {`, body, `${this.i()}}`].join('\n');
    }

    // Statement bodies (compound assignment, assignment in lambda)
    if (node.body.type === 'CompoundAssignment' || node.body.type === 'Assignment' || node.body.type === 'VarDeclaration') {
      this.pushScope();
      for (const p of node.params) { if (p.destructure) this._declareDestructureVars(p.destructure); else this.declareVar(p.name); }
      this.indent++;
      const stmt = this.generateStatement(node.body);
      this.indent--;
      this.popScope();
      return `${asyncPrefix}(${params}) => { ${stmt.trim()} }`;
    }

    if (hasPropagate) {
      return `${asyncPrefix}(${params}) => { try { return ${this.genExpression(node.body)}; } catch (__e) { if (__e && __e.__tova_propagate) return __e.value; throw __e; } }`;
    }
    return `${asyncPrefix}(${params}) => ${this.genExpression(node.body)}`;
  }

  // Check if a match can be emitted as a ternary chain instead of IIFE
  _isSimpleMatch(node) {
    if (!this._isSimpleExpression(node.subject)) return false;
    for (const arm of node.arms) {
      // All bodies must be expressions (not block statements)
      if (arm.body.type === 'BlockStatement') return false;
      // No patterns that need variable bindings
      if (this._patternNeedsBindings(arm.pattern)) return false;
      // Guards with BindingPattern need IIFE for binding
      if (arm.guard && arm.pattern.type === 'BindingPattern') return false;
    }
    return true;
  }

  // Check recursively whether a pattern requires const bindings
  _patternNeedsBindings(pattern) {
    switch (pattern.type) {
      case 'LiteralPattern':
      case 'WildcardPattern':
      case 'RangePattern':
        return false;
      case 'BindingPattern':
        return true;
      case 'VariantPattern':
        return pattern.fields.some(f => typeof f === 'string' || (f && this._patternNeedsBindings(f)));
      case 'ArrayPattern':
      case 'TuplePattern':
        return pattern.elements.some(el => el && this._patternNeedsBindings(el));
      default:
        return true; // Conservative: unknown patterns may need bindings
    }
  }

  // Generate a simple match as nested ternary
  _genSimpleMatch(node) {
    const subject = this.genExpression(node.subject);
    let result = '';
    for (let idx = 0; idx < node.arms.length; idx++) {
      const arm = node.arms[idx];
      const body = this.genExpression(arm.body);
      // Last arm with wildcard → else branch
      if ((arm.pattern.type === 'WildcardPattern' || arm.pattern.type === 'BindingPattern') && !arm.guard) {
        result += body;
        break;
      }
      const condition = this.genPatternCondition(arm.pattern, subject, arm.guard);
      result += `(${condition}) ? ${body} : `;
      // If this is the last arm and not a wildcard, add undefined as fallback
      if (idx === node.arms.length - 1) {
        result += 'undefined';
      }
    }
    return `(${result})`;
  }

  // Check if all arms are literal patterns (string/number/boolean) or wildcard, with no guards
  _isLiteralMatch(node) {
    let hasWildcard = false;
    for (const arm of node.arms) {
      if (arm.guard) return false;
      const pt = arm.pattern.type;
      if (pt === 'LiteralPattern') continue;
      if (pt === 'WildcardPattern' || pt === 'BindingPattern') {
        hasWildcard = true;
        continue;
      }
      return false;
    }
    return true;
  }

  _genSwitchMatch(node) {
    const subject = this.genExpression(node.subject);
    const tempVar = '__match';
    const p = [];
    p.push(`((${tempVar}) => {\n`);
    this.indent++;
    p.push(`${this.i()}switch (${tempVar}) {\n`);
    this.indent++;

    for (const arm of node.arms) {
      if (arm.pattern.type === 'WildcardPattern') {
        p.push(`${this.i()}default:\n`);
        this.indent++;
        if (arm.body.type === 'BlockStatement') {
          p.push(this.genBlockBody(arm.body) + '\n');
        } else {
          p.push(`${this.i()}return ${this.genExpression(arm.body)};\n`);
        }
        this.indent--;
      } else if (arm.pattern.type === 'BindingPattern') {
        p.push(`${this.i()}default: {\n`);
        this.indent++;
        p.push(`${this.i()}const ${arm.pattern.name} = ${tempVar};\n`);
        if (arm.body.type === 'BlockStatement') {
          p.push(this.genBlockBody(arm.body) + '\n');
        } else {
          p.push(`${this.i()}return ${this.genExpression(arm.body)};\n`);
        }
        this.indent--;
        p.push(`${this.i()}}\n`);
      } else {
        // LiteralPattern
        p.push(`${this.i()}case ${JSON.stringify(arm.pattern.value)}:\n`);
        this.indent++;
        if (arm.body.type === 'BlockStatement') {
          p.push(this.genBlockBody(arm.body) + '\n');
        } else {
          p.push(`${this.i()}return ${this.genExpression(arm.body)};\n`);
        }
        this.indent--;
      }
    }

    this.indent--;
    p.push(`${this.i()}}\n`);
    this.indent--;
    p.push(`${this.i()}})(${subject})`);
    return p.join('');
  }

  genMatchExpression(node) {
    // Optimization: simple matches emit ternary chain instead of IIFE
    if (this._isSimpleMatch(node)) {
      return this._genSimpleMatch(node);
    }

    // Optimization: literal-only patterns emit switch for V8 jump tables
    if (this._isLiteralMatch(node)) {
      return this._genSwitchMatch(node);
    }

    // Generate as IIFE with if-else chain
    const subject = this.genExpression(node.subject);
    const tempVar = '__match';

    const p = [];
    p.push(`((${tempVar}) => {\n`);
    this.indent++;

    for (let idx = 0; idx < node.arms.length; idx++) {
      const arm = node.arms[idx];
      const condition = this.genPatternCondition(arm.pattern, tempVar, arm.guard);

      if (arm.pattern.type === 'WildcardPattern' || arm.pattern.type === 'BindingPattern') {
        if (idx === node.arms.length - 1 && !arm.guard) {
          // Default case
          if (arm.pattern.type === 'BindingPattern') {
            p.push(`${this.i()}const ${arm.pattern.name} = ${tempVar};\n`);
          }
          if (arm.body.type === 'BlockStatement') {
            p.push(this.genBlockBody(arm.body) + '\n');
          } else {
            p.push(`${this.i()}return ${this.genExpression(arm.body)};\n`);
          }
          break;
        }
      }

      const keyword = idx === 0 ? 'if' : 'else if';
      p.push(`${this.i()}${keyword} (${condition}) {\n`);
      this.indent++;

      // Bind variables from pattern
      p.push(this.genPatternBindings(arm.pattern, tempVar));

      if (arm.body.type === 'BlockStatement') {
        p.push(this.genBlockBody(arm.body) + '\n');
      } else {
        p.push(`${this.i()}return ${this.genExpression(arm.body)};\n`);
      }
      this.indent--;
      p.push(`${this.i()}}\n`);
    }

    this.indent--;
    p.push(`${this.i()}})(${subject})`);
    return p.join('');
  }

  genIfExpression(node) {
    // Optimization: if all branches are single expressions, use ternary
    const isSingleExpr = (block) =>
      block.type === 'BlockStatement' && block.body.length === 1 && block.body[0].type === 'ExpressionStatement';

    if (node.alternates.length === 0 && isSingleExpr(node.consequent) && isSingleExpr(node.elseBody)) {
      const cond = this.genExpression(node.condition);
      const thenExpr = this.genExpression(node.consequent.body[0].expression);
      const elseExpr = this.genExpression(node.elseBody.body[0].expression);
      return `((${cond}) ? (${thenExpr}) : (${elseExpr}))`;
    }

    // Extended optimization: if/elif/else where ALL branches are single expressions → nested ternary
    if (node.alternates.length > 0 && node.elseBody &&
        isSingleExpr(node.consequent) && isSingleExpr(node.elseBody) &&
        node.alternates.every(alt => isSingleExpr(alt.body))) {
      let result = `((${this.genExpression(node.condition)}) ? (${this.genExpression(node.consequent.body[0].expression)})`;
      for (const alt of node.alternates) {
        result += ` : (${this.genExpression(alt.condition)}) ? (${this.genExpression(alt.body.body[0].expression)})`;
      }
      result += ` : (${this.genExpression(node.elseBody.body[0].expression)}))`;
      return result;
    }

    // Full IIFE for multi-statement branches
    const p = [];
    p.push(`(() => {\n`);
    this.indent++;

    p.push(`${this.i()}if (${this.genExpression(node.condition)}) {\n`);
    p.push(this.genBlockBody(node.consequent));
    p.push(`\n${this.i()}}`);

    for (const alt of node.alternates) {
      p.push(` else if (${this.genExpression(alt.condition)}) {\n`);
      p.push(this.genBlockBody(alt.body));
      p.push(`\n${this.i()}}`);
    }

    p.push(` else {\n`);
    p.push(this.genBlockBody(node.elseBody));
    p.push(`\n${this.i()}}`);

    this.indent--;
    p.push(`\n${this.i()}})()`);
    return p.join('');
  }

  // ─── IIFE-free match/if codegen (assign to variable instead of return) ───

  _genMatchAssign(node, targetVar) {
    // Block-scoped match that assigns to targetVar instead of wrapping in IIFE
    // Handles switch optimization and general if-else chain

    // Simple ternary matches don't need this optimization (already no IIFE)
    // Literal-only switch matches benefit from assignment form

    if (this._isLiteralMatch(node)) {
      return this._genSwitchMatchAssign(node, targetVar);
    }

    const subject = this.genExpression(node.subject);
    const tempVar = `__match`;
    const p = [];
    p.push(`${this.i()}{\n`);
    this.indent++;
    p.push(`${this.i()}const ${tempVar} = ${subject};\n`);

    for (let idx = 0; idx < node.arms.length; idx++) {
      const arm = node.arms[idx];
      const condition = this.genPatternCondition(arm.pattern, tempVar, arm.guard);

      if (arm.pattern.type === 'WildcardPattern' || arm.pattern.type === 'BindingPattern') {
        if (idx === node.arms.length - 1 && !arm.guard) {
          // Default case — wrap in else if preceded by if branches
          if (idx > 0) {
            p.push(` else {\n`);
            this.indent++;
          }
          if (arm.pattern.type === 'BindingPattern') {
            p.push(`${this.i()}const ${arm.pattern.name} = ${tempVar};\n`);
          }
          if (arm.body.type === 'BlockStatement') {
            p.push(this._genBlockBodyAssign(arm.body, targetVar) + '\n');
          } else {
            p.push(`${this.i()}${targetVar} = ${this.genExpression(arm.body)};\n`);
          }
          if (idx > 0) {
            this.indent--;
            p.push(`${this.i()}}\n`);
          }
          break;
        }
      }

      if (idx === 0) {
        p.push(`${this.i()}if (${condition}) {\n`);
      } else {
        p.push(` else if (${condition}) {\n`);
      }
      this.indent++;

      // Bind variables from pattern
      p.push(this.genPatternBindings(arm.pattern, tempVar));

      if (arm.body.type === 'BlockStatement') {
        p.push(this._genBlockBodyAssign(arm.body, targetVar) + '\n');
      } else {
        p.push(`${this.i()}${targetVar} = ${this.genExpression(arm.body)};\n`);
      }
      this.indent--;
      p.push(`${this.i()}}`);
    }
    p.push('\n');

    this.indent--;
    p.push(`${this.i()}}`);
    return p.join('');
  }

  _genSwitchMatchAssign(node, targetVar) {
    // Switch-based match that assigns to targetVar instead of wrapping in IIFE
    const subject = this.genExpression(node.subject);
    const tempVar = '__match';
    const p = [];
    p.push(`${this.i()}{\n`);
    this.indent++;
    p.push(`${this.i()}const ${tempVar} = ${subject};\n`);
    p.push(`${this.i()}switch (${tempVar}) {\n`);
    this.indent++;

    for (const arm of node.arms) {
      if (arm.pattern.type === 'WildcardPattern') {
        p.push(`${this.i()}default:\n`);
        this.indent++;
        if (arm.body.type === 'BlockStatement') {
          p.push(this._genBlockBodyAssign(arm.body, targetVar) + '\n');
        } else {
          p.push(`${this.i()}${targetVar} = ${this.genExpression(arm.body)};\n`);
        }
        p.push(`${this.i()}break;\n`);
        this.indent--;
      } else if (arm.pattern.type === 'BindingPattern') {
        p.push(`${this.i()}default: {\n`);
        this.indent++;
        p.push(`${this.i()}const ${arm.pattern.name} = ${tempVar};\n`);
        if (arm.body.type === 'BlockStatement') {
          p.push(this._genBlockBodyAssign(arm.body, targetVar) + '\n');
        } else {
          p.push(`${this.i()}${targetVar} = ${this.genExpression(arm.body)};\n`);
        }
        p.push(`${this.i()}break;\n`);
        this.indent--;
        p.push(`${this.i()}}\n`);
      } else {
        // LiteralPattern
        p.push(`${this.i()}case ${JSON.stringify(arm.pattern.value)}:\n`);
        this.indent++;
        if (arm.body.type === 'BlockStatement') {
          p.push(this._genBlockBodyAssign(arm.body, targetVar) + '\n');
        } else {
          p.push(`${this.i()}${targetVar} = ${this.genExpression(arm.body)};\n`);
        }
        p.push(`${this.i()}break;\n`);
        this.indent--;
      }
    }

    this.indent--;
    p.push(`${this.i()}}\n`);
    this.indent--;
    p.push(`${this.i()}}`);
    return p.join('');
  }

  _genIfAssign(node, targetVar) {
    // Block-scoped if expression that assigns to targetVar instead of wrapping in IIFE
    const p = [];
    p.push(`${this.i()}if (${this.genExpression(node.condition)}) {\n`);
    p.push(this._genBlockBodyAssign(node.consequent, targetVar));
    p.push(`\n${this.i()}}`);

    for (const alt of node.alternates) {
      p.push(` else if (${this.genExpression(alt.condition)}) {\n`);
      p.push(this._genBlockBodyAssign(alt.body, targetVar));
      p.push(`\n${this.i()}}`);
    }

    if (node.elseBody) {
      p.push(` else {\n`);
      p.push(this._genBlockBodyAssign(node.elseBody, targetVar));
      p.push(`\n${this.i()}}`);
    }

    return p.join('');
  }

  // IIFE-free match/if that emits direct returns (for function body last expression)
  _genMatchReturn(node) {
    const subject = this.genExpression(node.subject);
    const tempVar = `__match`;
    const p = [];
    p.push(`${this.i()}{\n`);
    this.indent++;
    p.push(`${this.i()}const ${tempVar} = ${subject};\n`);

    for (let idx = 0; idx < node.arms.length; idx++) {
      const arm = node.arms[idx];
      const condition = this.genPatternCondition(arm.pattern, tempVar, arm.guard);

      if (arm.pattern.type === 'WildcardPattern' || arm.pattern.type === 'BindingPattern') {
        if (idx === node.arms.length - 1 && !arm.guard) {
          if (idx > 0) {
            p.push(` else {\n`);
            this.indent++;
          }
          if (arm.pattern.type === 'BindingPattern') {
            p.push(`${this.i()}const ${arm.pattern.name} = ${tempVar};\n`);
          }
          if (arm.body.type === 'BlockStatement') {
            p.push(this._genBlockBodyReturns(arm.body) + '\n');
          } else {
            p.push(`${this.i()}return ${this.genExpression(arm.body)};\n`);
          }
          if (idx > 0) {
            this.indent--;
            p.push(`${this.i()}}\n`);
          }
          break;
        }
      }

      if (idx === 0) {
        p.push(`${this.i()}if (${condition}) {\n`);
      } else {
        p.push(` else if (${condition}) {\n`);
      }
      this.indent++;
      p.push(this.genPatternBindings(arm.pattern, tempVar));
      if (arm.body.type === 'BlockStatement') {
        p.push(this._genBlockBodyReturns(arm.body) + '\n');
      } else {
        p.push(`${this.i()}return ${this.genExpression(arm.body)};\n`);
      }
      this.indent--;
      p.push(`${this.i()}}`);
    }
    p.push('\n');
    this.indent--;
    p.push(`${this.i()}}`);
    return p.join('');
  }

  _genIfReturn(node) {
    const p = [];
    p.push(`${this.i()}if (${this.genExpression(node.condition)}) {\n`);
    p.push(this._genBlockBodyReturns(node.consequent));
    p.push(`\n${this.i()}}`);

    for (const alt of node.alternates) {
      p.push(` else if (${this.genExpression(alt.condition)}) {\n`);
      p.push(this._genBlockBodyReturns(alt.body));
      p.push(`\n${this.i()}}`);
    }

    if (node.elseBody) {
      p.push(` else {\n`);
      p.push(this._genBlockBodyReturns(node.elseBody));
      p.push(`\n${this.i()}}`);
    }

    return p.join('');
  }

  // Check if a match/if expression would need IIFE (not simple ternary)
  _needsIIFE(node) {
    if (node.type === 'MatchExpression') {
      return !this._isSimpleMatch(node);
    }
    if (node.type === 'IfExpression') {
      const isSingleExpr = (block) =>
        block.type === 'BlockStatement' && block.body.length === 1 && block.body[0].type === 'ExpressionStatement';
      // Simple if/elif → ternary (no IIFE)
      if (node.alternates.length === 0 && isSingleExpr(node.consequent) && isSingleExpr(node.elseBody)) return false;
      if (node.alternates.length > 0 && node.elseBody &&
          isSingleExpr(node.consequent) && isSingleExpr(node.elseBody) &&
          node.alternates.every(alt => isSingleExpr(alt.body))) return false;
      // Otherwise needs IIFE (or our new assign path)
      return true;
    }
    return false;
  }

  // Check if a match has any pattern bindings that would conflict with the target variable
  _matchBindingsConflict(node, targetVar) {
    if (node.type !== 'MatchExpression') return false;
    for (const arm of node.arms) {
      if (this._patternBindsName(arm.pattern, targetVar)) return true;
    }
    return false;
  }

  _patternBindsName(pattern, name) {
    switch (pattern.type) {
      case 'BindingPattern':
        return pattern.name === name;
      case 'VariantPattern':
        return pattern.fields.some(f => {
          if (typeof f === 'string') return f === name;
          if (f && f.type) return this._patternBindsName(f, name);
          return false;
        });
      case 'ArrayPattern':
      case 'TuplePattern':
        return pattern.elements.some(el => el && this._patternBindsName(el, name));
      case 'StringConcatPattern':
        return pattern.rest && pattern.rest.type === 'BindingPattern' && pattern.rest.name === name;
      default:
        return false;
    }
  }

  genPatternCondition(pattern, subject, guard) {
    let cond;

    switch (pattern.type) {
      case 'LiteralPattern':
        cond = `${subject} === ${JSON.stringify(pattern.value)}`;
        break;
      case 'RangePattern':
        if (pattern.inclusive) {
          cond = `${subject} >= ${pattern.start} && ${subject} <= ${pattern.end}`;
        } else {
          cond = `${subject} >= ${pattern.start} && ${subject} < ${pattern.end}`;
        }
        break;
      case 'VariantPattern': {
        const vchecks = [`${subject}?.__tag === "${pattern.name}"`];
        const declFields = this._variantFields[pattern.name] || [];
        for (let i = 0; i < pattern.fields.length; i++) {
          const f = pattern.fields[i];
          if (typeof f === 'object' && f.type && f.type !== 'WildcardPattern' && f.type !== 'BindingPattern') {
            const fieldName = f.type === 'BindingPattern' ? f.name : null;
            const propName = declFields[i] || fieldName || `value`;
            const fCond = this.genPatternCondition(f, `${subject}.${propName}`, null);
            if (fCond !== 'true') vchecks.push(fCond);
          }
        }
        cond = vchecks.join(' && ');
        break;
      }
      case 'ArrayPattern': {
        // Check it's an array with the right length, then check each element pattern
        const checks = [`Array.isArray(${subject})`, `${subject}.length === ${pattern.elements.length}`];
        for (let i = 0; i < pattern.elements.length; i++) {
          const elPat = pattern.elements[i];
          if (elPat.type !== 'WildcardPattern' && elPat.type !== 'BindingPattern') {
            const elCond = this.genPatternCondition(elPat, `${subject}[${i}]`, null);
            if (elCond !== 'true') checks.push(elCond);
          }
        }
        cond = checks.join(' && ');
        break;
      }
      case 'TuplePattern': {
        const checks = [`Array.isArray(${subject})`, `${subject}.length === ${pattern.elements.length}`];
        for (let i = 0; i < pattern.elements.length; i++) {
          const elPat = pattern.elements[i];
          if (elPat.type !== 'WildcardPattern' && elPat.type !== 'BindingPattern') {
            const elCond = this.genPatternCondition(elPat, `${subject}[${i}]`, null);
            if (elCond !== 'true') checks.push(elCond);
          }
        }
        cond = checks.join(' && ');
        break;
      }
      case 'StringConcatPattern':
        cond = `typeof ${subject} === 'string' && ${subject}.startsWith(${JSON.stringify(pattern.prefix)})`;
        break;
      case 'WildcardPattern':
        cond = 'true';
        break;
      case 'BindingPattern':
        cond = 'true';
        break;
      default:
        cond = 'true';
    }

    if (guard) {
      // For binding patterns, we need to bind first for the guard
      if (pattern.type === 'BindingPattern') {
        cond = `((${pattern.name}) => ${this.genExpression(guard)})(${subject})`;
      } else {
        cond = `(${cond}) && (${this.genExpression(guard)})`;
      }
    }

    return cond;
  }

  genPatternBindings(pattern, subject) {
    switch (pattern.type) {
      case 'BindingPattern':
        return `${this.i()}const ${pattern.name} = ${subject};\n`;
      case 'VariantPattern': {
        const declaredFields = this._variantFields[pattern.name] || [];
        return pattern.fields.map((f, idx) => {
          // Determine field name for property access
          const fieldName = typeof f === 'string' ? f : (f.type === 'BindingPattern' ? f.name : null);
          const propName = declaredFields[idx] || fieldName || `value`;
          const accessor = `${subject}.${propName}`;
          // String fields (legacy) — simple binding
          if (typeof f === 'string') {
            return `${this.i()}const ${f} = ${accessor};\n`;
          }
          // Nested pattern — recurse for bindings
          if (f.type === 'BindingPattern') {
            return `${this.i()}const ${f.name} = ${accessor};\n`;
          }
          if (f.type === 'WildcardPattern') return '';
          // Nested variant, array, tuple patterns
          return this.genPatternBindings(f, accessor);
        }).join('');
      }
      case 'ArrayPattern':
        return pattern.elements.map((el, idx) => {
          if (el.type === 'BindingPattern') {
            return `${this.i()}const ${el.name} = ${subject}[${idx}];\n`;
          }
          return this.genPatternBindings(el, `${subject}[${idx}]`);
        }).filter(s => s).join('');
      case 'TuplePattern':
        return pattern.elements.map((el, idx) => {
          if (el.type === 'BindingPattern') {
            return `${this.i()}const ${el.name} = ${subject}[${idx}];\n`;
          }
          return this.genPatternBindings(el, `${subject}[${idx}]`);
        }).filter(s => s).join('');
      case 'StringConcatPattern':
        if (pattern.rest && pattern.rest.type === 'BindingPattern') {
          return `${this.i()}const ${pattern.rest.name} = ${subject}.slice(${pattern.prefix.length});\n`;
        }
        return '';
      default:
        return '';
    }
  }

  genArrayLiteral(node) {
    const elements = node.elements.map(e => this.genExpression(e)).join(', ');
    // In @fast mode, detect all-numeric arrays and emit TypedArrays
    if (this._fastMode && node.elements.length > 0 && node.elements.every(e => e.type === 'NumberLiteral')) {
      const hasFloat = node.elements.some(e => String(e.value).includes('.'));
      const taType = hasFloat ? 'Float64Array' : 'Int32Array';
      return `new ${taType}([${elements}])`;
    }
    return `[${elements}]`;
  }

  genObjectLiteral(node) {
    const props = node.properties.map(p => {
      if (p.spread) {
        return `...${this.genExpression(p.argument)}`;
      }
      if (p.shorthand) {
        return this.genExpression(p.key);
      }
      return `${this.genExpression(p.key)}: ${this.genExpression(p.value)}`;
    }).join(', ');
    return `{ ${props} }`;
  }

  genListComprehension(node) {
    const iter = this.genExpression(node.iterable);
    const varName = node.variable;
    const expr = this.genExpression(node.expression);

    if (node.condition) {
      const cond = this.genExpression(node.condition);
      // Skip redundant .map() when expression is just the loop variable
      if (expr === varName) {
        return `${iter}.filter((${varName}) => ${cond})`;
      }
      // Single-pass loop avoids intermediate array from filter().map()
      return `${iter}.reduce((acc, ${varName}) => { if (${cond}) acc.push(${expr}); return acc; }, [])`;
    }
    return `${iter}.map((${varName}) => ${expr})`;
  }

  genDictComprehension(node) {
    const iter = this.genExpression(node.iterable);
    const vars = node.variables;
    const key = this.genExpression(node.key);
    const value = this.genExpression(node.value);

    const destructure = vars.length === 2 ? `[${vars[0]}, ${vars[1]}]` : vars[0];

    let code = `Object.fromEntries(${iter}`;
    if (node.condition) {
      code += `.filter((${destructure}) => ${this.genExpression(node.condition)})`;
    }
    code += `.map((${destructure}) => [${key}, ${value}]))`;
    return code;
  }

  genRangeExpression(node) {
    const start = this.genExpression(node.start);
    const end = this.genExpression(node.end);
    // Use stdlib range() — handles step and direction, avoids Array.from overhead
    this._trackBuiltin('range');
    if (node.inclusive) {
      return `range(${start}, (${end}) + 1)`;
    }
    return `range(${start}, ${end})`;
  }

  genSliceExpression(node) {
    const obj = this.genExpression(node.object);
    const start = node.start ? this.genExpression(node.start) : '';
    const end = node.end ? this.genExpression(node.end) : '';

    if (node.step) {
      const step = this.genExpression(node.step);
      const s = node.start ? this.genExpression(node.start) : 'null';
      const e = node.end ? this.genExpression(node.end) : 'null';
      // Handles both positive and negative step directions
      return `((a, s, e, st) => { const r = []; if (st > 0) { for (let i = s !== null ? s : 0; i < (e !== null ? e : a.length); i += st) r.push(a[i]); } else { for (let i = s !== null ? s : a.length - 1; i > (e !== null ? e : -1); i += st) r.push(a[i]); } return r; })(${obj}, ${s}, ${e}, ${step})`;
    }

    if (!start && !end) return `${obj}.slice()`;
    if (!start) return `${obj}.slice(0, ${end})`;
    if (!end) return `${obj}.slice(${start})`;
    return `${obj}.slice(${start}, ${end})`;
  }

  _declareDestructureVars(pattern) {
    if (pattern.type === 'ObjectPattern') {
      for (const p of pattern.properties) this.declareVar(p.value);
    } else if (pattern.type === 'ArrayPattern') {
      for (const e of pattern.elements) if (e) this.declareVar(e);
    }
  }

  genGuardStatement(node) {
    const p = [];
    p.push(`${this.i()}if (!(${this.genExpression(node.condition)})) {\n`);
    this.indent++;
    this.pushScope();
    p.push(this.genBlockStatements(node.elseBody));
    this.popScope();
    this.indent--;
    p.push(`\n${this.i()}}`);
    return p.join('');
  }

  genInterfaceDeclaration(node) {
    // Interfaces are compile-time only — generate as a documentation comment
    const exportStr = node.isPublic ? 'export ' : '';
    const methods = node.methods.map(m => {
      const params = m.params.map(p => {
        let s = p.name;
        if (p.typeAnnotation) s += `: ${p.typeAnnotation.name || 'any'}`;
        return s;
      }).join(', ');
      const ret = m.returnType ? ` -> ${m.returnType.name || 'any'}` : '';
      return `${this.i()} *   fn ${m.name}(${params})${ret}`;
    }).join('\n');
    return `${this.i()}/* ${exportStr}interface ${node.name} {\n${methods}\n${this.i()} * } */`;
  }

  genTypeDeclaration(node) {
    const lines = [];
    const exportPrefix = node.isPublic ? 'export ' : '';

    const hasVariants = node.variants.some(v => v.type === 'TypeVariant');

    if (hasVariants) {
      for (const variant of node.variants) {
        if (variant.type === 'TypeVariant') {
          this.declareVar(variant.name);
          const rawFieldNames = variant.fields.map(f => f.name);
          // Deduplicate field names: Add(Expr, Expr) → _0, _1 (prevents property collision)
          const nameCount = {};
          rawFieldNames.forEach(n => nameCount[n] = (nameCount[n] || 0) + 1);
          const hasDupes = Object.values(nameCount).some(c => c > 1);
          const fieldNames = hasDupes ? rawFieldNames.map((_, i) => `_${i}`) : rawFieldNames;
          this._variantFields[variant.name] = fieldNames;
          if (variant.fields.length === 0) {
            lines.push(`${this.i()}${exportPrefix}const ${variant.name} = Object.freeze({ __tag: "${variant.name}" });`);
          } else {
            const params = fieldNames.join(', ');
            const obj = fieldNames.map(f => `${f}`).join(', ');
            lines.push(`${this.i()}${exportPrefix}function ${variant.name}(${params}) { return { __tag: "${variant.name}", ${obj} }; }`);
          }
        }
      }
    } else {
      this.declareVar(node.name);
      const fieldNames = node.variants.map(f => f.name);
      const params = fieldNames.join(', ');
      const obj = fieldNames.map(f => `${f}`).join(', ');
      lines.push(`${this.i()}${exportPrefix}function ${node.name}(${params}) { return Object.assign(Object.create(${node.name}.prototype), { ${obj} }); }`);
    }

    // Derive clause: generate methods
    if (node.derive && node.derive.length > 0) {
      const targetName = hasVariants ? null : node.name;
      const fieldNames = hasVariants ? [] : node.variants.map(f => f.name);

      const builtinTraits = new Set(['Eq', 'Show', 'JSON']);
      for (const trait of node.derive) {
        if (trait === 'Eq' && targetName) {
          // Deep equality: compare all fields
          const checks = fieldNames.map(f => `a.${f} === b.${f}`).join(' && ');
          lines.push(`${this.i()}${targetName}.__eq = function(a, b) { return ${checks || 'true'}; };`);
        }
        if (trait === 'Show' && targetName) {
          const fields = fieldNames.map(f => `${f}: \${JSON.stringify(obj.${f})}`).join(', ');
          lines.push(`${this.i()}${targetName}.__show = function(obj) { return \`${targetName}(${fields})\`; };`);
        }
        if (trait === 'JSON' && targetName) {
          lines.push(`${this.i()}${targetName}.toJSON = function(obj) { return JSON.stringify(obj); };`);
          lines.push(`${this.i()}${targetName}.fromJSON = function(str) { const d = JSON.parse(str); return ${targetName}(${fieldNames.map(f => `d.${f}`).join(', ')}); };`);
        }

        // Extensible derive: user-defined traits
        if (!builtinTraits.has(trait) && targetName) {
          const traitDecl = this._traitDecls.get(trait);
          if (traitDecl) {
            for (const method of traitDecl.methods) {
              if (method.body) {
                // Trait has a default implementation — use it
                lines.push(`${this.i()}${targetName}.prototype.${method.name} = __trait_${trait}_${method.name};`);
              }
            }
          }
        }
      }

      // For variant types with derive
      if (hasVariants) {
        for (const trait of node.derive) {
          if (trait === 'Eq') {
            lines.push(`${this.i()}function __eq_${node.name}(a, b) { if (a === b) return true; if (!a || !b || a.__tag !== b.__tag) return false; for (const k of Object.keys(a)) { if (k === '__tag') continue; if (a[k] !== b[k]) { if (typeof a[k] === 'object' && typeof b[k] === 'object' && a[k]?.__tag && b[k]?.__tag) { if (!__eq_${node.name}(a[k], b[k])) return false; } else return false; } } return true; }`);
          }
          if (trait === 'Show') {
            lines.push(`${this.i()}function __show_${node.name}(obj) { return obj.__tag + "(" + Object.entries(obj).filter(([k]) => k !== "__tag").map(([k, v]) => k + ": " + JSON.stringify(v)).join(", ") + ")"; }`);
          }
          if (trait === 'JSON') {
            lines.push(`${this.i()}function __toJSON_${node.name}(obj) { return JSON.stringify(obj); }`);
          }
        }
      }
    }

    return lines.join('\n');
  }

  genImplDeclaration(node) {
    // Register trait impl for extensible derive
    if (node.traitName) {
      this._traitImpls.set(`${node.traitName}:${node.typeName}`, node);
    }

    const lines = [];
    for (const method of node.methods) {
      const hasSelf = method.params.some(p => p.name === 'self');
      const params = method.params.filter(p => p.name !== 'self');
      const paramStr = this.genParams(params);
      const hasPropagate = this._containsPropagate(method.body);
      const asyncPrefix = method.isAsync ? 'async ' : '';
      this.pushScope();
      if (hasSelf) this.declareVar('self');
      for (const p of params) {
        if (p.destructure) this._declareDestructureVars(p.destructure);
        else this.declareVar(p.name);
      }
      const body = this.genBlockBody(method.body);
      this.popScope();
      const selfBinding = hasSelf ? `\n${this.i()}  const self = this;` : '';
      if (hasPropagate) {
        lines.push(`${this.i()}${node.typeName}.prototype.${method.name} = ${asyncPrefix}function(${paramStr}) {${selfBinding}\n${this.i()}  try {\n${body}\n${this.i()}  } catch (__e) {\n${this.i()}    if (__e && __e.__tova_propagate) return __e.value;\n${this.i()}    throw __e;\n${this.i()}  }\n${this.i()}};`);
      } else {
        lines.push(`${this.i()}${node.typeName}.prototype.${method.name} = ${asyncPrefix}function(${paramStr}) {${selfBinding}\n${body}\n${this.i()}};`);
      }
    }
    return lines.join('\n');
  }

  genTraitDeclaration(node) {
    // Register trait for extensible derive
    this._traitDecls.set(node.name, { methods: node.methods });

    // Traits are mostly compile-time, but generate default implementations as functions
    const lines = [];
    const defaultMethods = node.methods.filter(m => m.body);
    if (defaultMethods.length > 0) {
      lines.push(`${this.i()}/* trait ${node.name} */`);
      for (const method of defaultMethods) {
        const params = this.genParams(method.params);
        this.pushScope();
        for (const p of method.params) {
          if (p.destructure) this._declareDestructureVars(p.destructure);
          else if (p.name) this.declareVar(p.name);
        }
        const body = this.genBlockBody(method.body);
        this.popScope();
        lines.push(`${this.i()}function __trait_${node.name}_${method.name}(${params}) {\n${body}\n${this.i()}}`);
      }
    } else {
      lines.push(`${this.i()}/* trait ${node.name} { ${node.methods.map(m => `fn ${m.name}()`).join(', ')} } */`);
    }
    return lines.join('\n');
  }

  genTypeAlias(node) {
    // Type aliases are compile-time only
    const exportStr = node.isPublic ? 'export ' : '';
    const typeParams = node.typeParams && node.typeParams.length > 0 ? `<${node.typeParams.join(', ')}>` : '';
    const typeStr = this._typeAnnotationToString(node.typeExpr);
    return `${this.i()}/* ${exportStr}type alias: ${node.name}${typeParams} = ${typeStr} */`;
  }

  _typeAnnotationToString(ann) {
    if (!ann) return 'any';
    if (ann.type === 'UnionTypeAnnotation') {
      return ann.members.map(m => this._typeAnnotationToString(m)).join(' | ');
    }
    if (ann.type === 'ArrayTypeAnnotation') {
      return `[${this._typeAnnotationToString(ann.elementType)}]`;
    }
    if (ann.type === 'TupleTypeAnnotation') {
      return `(${ann.elementTypes.map(t => this._typeAnnotationToString(t)).join(', ')})`;
    }
    if (ann.type === 'FunctionTypeAnnotation') {
      const params = ann.paramTypes.map(t => this._typeAnnotationToString(t)).join(', ');
      return `(${params}) -> ${this._typeAnnotationToString(ann.returnType)}`;
    }
    if (ann.typeParams && ann.typeParams.length > 0) {
      const params = ann.typeParams.map(t => this._typeAnnotationToString(t)).join(', ');
      return `${ann.name}<${params}>`;
    }
    return ann.name || 'any';
  }

  genRefinementType(node) {
    // Refinement types compile to validator functions
    // type Email = String where { it |> contains("@") }
    // → function __validate_Email(it) { return it.includes("@"); }
    const predExpr = this.genExpression(node.predicate);
    return `${this.i()}function __validate_${node.name}(it) {\n${this.i()}  if (!(${predExpr})) throw new Error("Refinement type ${node.name} validation failed");\n${this.i()}  return it;\n${this.i()}}`;
  }

  genDeferStatement(node) {
    // Defer is handled by genBlockBody which collects defers and wraps in try/finally.
    // If called outside genBlockBody (e.g., via genBlockStatements), generate a no-op comment.
    // The actual defer logic is emitted correctly when genBlockBody processes the enclosing function.
    return `${this.i()}/* defer */`;
  }

  genWithStatement(node) {
    const expr = this.genExpression(node.expression);
    const name = node.name;
    this.declareVar(name);
    const p = [];
    p.push(`${this.i()}const ${name} = ${expr};`);
    p.push(`${this.i()}try {`);
    this.indent++;
    this.pushScope();
    p.push(this.genBlockStatements(node.body));
    this.popScope();
    this.indent--;
    p.push(`${this.i()}} finally {`);
    this.indent++;
    p.push(`${this.i()}if (${name} != null && typeof ${name}.close === 'function') ${name}.close();`);
    p.push(`${this.i()}else if (${name} != null && typeof ${name}.dispose === 'function') ${name}.dispose();`);
    p.push(`${this.i()}else if (${name} != null && typeof ${name}[Symbol.dispose] === 'function') ${name}[Symbol.dispose]();`);
    this.indent--;
    p.push(`${this.i()}}`);
    return p.join('\n');
  }

  // Check if a function body contains yield expressions (for generator detection)
  _containsYield(node) {
    if (!node) return false;
    if (node.type === 'YieldExpression') return true;
    if (node.type === 'FunctionDeclaration' || node.type === 'LambdaExpression') return false;
    const cached = this._yieldCache.get(node);
    if (cached !== undefined) return cached;
    let result = false;
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'type') continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && this._containsYield(item)) { result = true; break; }
        }
      } else if (val && typeof val === 'object' && val.type) {
        if (this._containsYield(val)) { result = true; break; }
      }
      if (result) break;
    }
    this._yieldCache.set(node, result);
    return result;
  }
}
