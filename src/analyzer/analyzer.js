import { Scope, Symbol } from './scope.js';
import { PIPE_TARGET } from '../parser/ast.js';
import { BUILTIN_NAMES } from '../stdlib/inline.js';
import {
  Type, PrimitiveType, NilType, AnyType, UnknownType,
  ArrayType, TupleType, FunctionType, RecordType, ADTType,
  GenericType, TypeVariable, UnionType,
  typeAnnotationToType, typeFromString, typesCompatible,
  isNumericType, isFloatNarrowing,
} from './types.js';

const _JS_GLOBALS = new Set([
  'console', 'document', 'window', 'globalThis', 'self',
  'JSON', 'Math', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError',
  'Promise', 'Set', 'Map', 'WeakSet', 'WeakMap', 'Symbol',
  'Array', 'Object', 'String', 'Number', 'Boolean', 'Function',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'NaN', 'Infinity',
  'undefined', 'null', 'true', 'false',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'queueMicrotask', 'structuredClone',
  'URL', 'URLSearchParams', 'Headers', 'Request', 'Response',
  'FormData', 'Blob', 'File', 'FileReader',
  'AbortController', 'AbortSignal',
  'TextEncoder', 'TextDecoder',
  'crypto', 'performance', 'navigator', 'location', 'history',
  'localStorage', 'sessionStorage',
  'fetch', 'alert', 'confirm', 'prompt',
  'Bun', 'Deno', 'process', 'require', 'module', 'exports', '__dirname', '__filename',
  'Buffer', 'atob', 'btoa',
]);

const _TOVA_RUNTIME = new Set([
  'Ok', 'Err', 'Some', 'None', 'Result', 'Option',
  'db', 'server', 'client', 'shared',
]);

export class Analyzer {
  constructor(ast, filename = '<stdin>', options = {}) {
    this.ast = ast;
    this.filename = filename;
    this.errors = [];
    this.warnings = [];
    this.tolerant = options.tolerant || false;
    this.strict = options.strict || false;
    this.globalScope = new Scope(null, 'module');
    this.currentScope = this.globalScope;
    this._allScopes = []; // Track all scopes for unused variable checking
    this._functionReturnTypeStack = []; // Stack of expected return types for type checking
    this._asyncDepth = 0; // Track nesting inside async functions for await validation

    // Type registry for LSP
    this.typeRegistry = {
      types: new Map(),   // type name → ADTType | RecordType
      impls: new Map(),   // type name → [{ name, params, returnType }]
      traits: new Map(),  // trait name → [{ name, paramTypes, returnType }]
    };

    // Register built-in types
    this.registerBuiltins();
  }

  registerBuiltins() {
    const builtins = [
      'Int', 'Float', 'String', 'Bool', 'Nil', 'Any',
      'print', 'range', 'len', 'type_of', 'enumerate', 'zip',
      'map', 'filter', 'reduce', 'sum', 'sorted', 'reversed',
      'fetch', 'db',
      'Ok', 'Err', 'Some', 'None', 'Result', 'Option',
      // Collections
      'find', 'any', 'all', 'flat_map', 'unique', 'group_by',
      'chunk', 'flatten', 'take', 'drop', 'first', 'last',
      'count', 'partition',
      // Math
      'abs', 'floor', 'ceil', 'round', 'clamp', 'sqrt', 'pow', 'random',
      // Strings
      'trim', 'split', 'join', 'replace', 'repeat',
      // Utility
      'keys', 'values', 'entries', 'merge', 'freeze', 'clone',
      // Async
      'sleep',
      // String functions
      'upper', 'lower', 'contains', 'starts_with', 'ends_with',
      'chars', 'words', 'lines', 'capitalize', 'title_case',
      'snake_case', 'camel_case',
      // Math extras
      'min', 'max',
      // Table operations
      'Table', 'table_where', 'table_select', 'table_derive',
      'table_group_by', 'table_agg', 'table_sort_by', 'table_limit',
      'table_join', 'table_pivot', 'table_unpivot', 'table_explode',
      'table_union', 'table_drop_duplicates', 'table_rename',
      // Table aggregation helpers
      'agg_sum', 'agg_count', 'agg_mean', 'agg_median', 'agg_min', 'agg_max',
      // Data exploration
      'peek', 'describe', 'schema_of',
      // Data cleaning
      'cast', 'drop_nil', 'fill_nil', 'filter_ok', 'filter_err',
      // I/O
      'read', 'write', 'stream',
      // CSV/JSONL helpers
      '__parseCSV', '__parseJSONL',
      // Table operation aliases (short names)
      'where', 'select', 'derive', 'agg', 'sort_by', 'limit',
      'pivot', 'unpivot', 'explode', 'union', 'drop_duplicates', 'rename',
      'mean', 'median',
      // Strings (new)
      'index_of', 'last_index_of', 'count_of', 'reverse_str', 'substr',
      'is_empty', 'kebab_case', 'center',
      // Collections (new)
      'zip_with', 'frequencies', 'scan', 'min_by', 'max_by', 'sum_by',
      'product', 'from_entries', 'has_key', 'get', 'pick', 'omit',
      'map_values', 'sliding_window',
      // JSON
      'json_parse', 'json_stringify', 'json_pretty',
      // Functional
      'compose', 'pipe_fn', 'identity', 'memoize', 'debounce', 'throttle',
      'once', 'negate',
      // Error handling
      'try_fn', 'try_async',
      // Async
      'parallel', 'timeout', 'retry',
      // Encoding
      'base64_encode', 'base64_decode', 'url_encode', 'url_decode',
      // Math (new)
      'hypot', 'lerp', 'divmod', 'avg',
      // Date/Time
      'now', 'now_iso',
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

  strictError(message, loc) {
    if (this.strict) {
      this.error(message, loc);
    } else {
      this.warn(message, loc);
    }
  }

  analyze() {
    // Pre-pass: collect named server block functions for inter-server RPC validation
    this.serverBlockFunctions = new Map(); // blockName -> [functionName, ...]
    const collectFns = (stmts) => {
      const fns = [];
      for (const stmt of stmts) {
        if (stmt.type === 'FunctionDeclaration') {
          fns.push(stmt.name);
        } else if (stmt.type === 'RouteGroupDeclaration') {
          fns.push(...collectFns(stmt.body));
        }
      }
      return fns;
    };
    for (const node of this.ast.body) {
      if (node.type === 'ServerBlock' && node.name) {
        const fns = collectFns(node.body);
        if (this.serverBlockFunctions.has(node.name)) {
          this.serverBlockFunctions.get(node.name).push(...fns);
        } else {
          this.serverBlockFunctions.set(node.name, fns);
        }
      }
    }

    this.visitProgram(this.ast);

    // Check for unused variables/imports (#9)
    this._collectAllScopes(this.globalScope);
    this._checkUnusedSymbols();

    if (this.errors.length > 0) {
      if (this.tolerant) {
        return { warnings: this.warnings, errors: this.errors, scope: this.globalScope, typeRegistry: this.typeRegistry };
      }
      const msgs = this.errors.map(e => `  ${e.file}:${e.line}:${e.column} — ${e.message}`);
      const err = new Error(`Analysis errors:\n${msgs.join('\n')}`);
      err.errors = this.errors;
      err.warnings = this.warnings;
      throw err;
    }

    return { warnings: this.warnings, scope: this.globalScope, typeRegistry: this.typeRegistry };
  }

  _checkUnusedSymbols() {
    for (const scope of this._allScopes) {
      // Only check inside functions, not module/server/client level
      if (!this._isScopeInsideFunction(scope)) continue;

      for (const [name, sym] of scope.symbols) {
        if (sym.kind === 'builtin') continue;
        if (name.startsWith('_')) continue;
        if (sym.kind === 'type') continue;
        if (sym.kind === 'parameter') continue;

        if (!sym.used && sym.loc && sym.loc.line > 0) {
          this.warn(`'${name}' is declared but never used`, sym.loc);
        }
      }
    }
  }

  _collectAllScopes(scope) {
    this._allScopes.push(scope);
    for (const child of scope.children) {
      this._collectAllScopes(child);
    }
  }

  _isScopeInsideFunction(scope) {
    let s = scope;
    while (s) {
      if (s.context === 'function') return true;
      if (s.context === 'module' || s.context === 'server' || s.context === 'client' || s.context === 'shared') return false;
      s = s.parent;
    }
    return false;
  }

  // ─── Type Inference ──────────────────────────────────────

  _inferType(expr) {
    if (!expr) return null;
    switch (expr.type) {
      case 'NumberLiteral':
        return Number.isInteger(expr.value) ? 'Int' : 'Float';
      case 'StringLiteral':
      case 'TemplateLiteral':
        return 'String';
      case 'BooleanLiteral':
        return 'Bool';
      case 'NilLiteral':
        return 'Nil';
      case 'ArrayLiteral':
        if (expr.elements.length > 0) {
          const elType = this._inferType(expr.elements[0]);
          return elType ? `[${elType}]` : '[Any]';
        }
        return '[Any]';
      case 'CallExpression':
        if (expr.callee.type === 'Identifier') {
          const name = expr.callee.name;
          if (name === 'Ok') {
            const innerType = expr.arguments.length > 0 ? this._inferType(expr.arguments[0]) : null;
            return innerType ? `Result<${innerType}, _>` : 'Result';
          }
          if (name === 'Err') {
            const innerType = expr.arguments.length > 0 ? this._inferType(expr.arguments[0]) : null;
            return innerType ? `Result<_, ${innerType}>` : 'Result';
          }
          if (name === 'Some') {
            const innerType = expr.arguments.length > 0 ? this._inferType(expr.arguments[0]) : null;
            return innerType ? `Option<${innerType}>` : 'Option';
          }
          if (name === 'len' || name === 'count') return 'Int';
          if (name === 'type_of') return 'String';
          if (name === 'random') return 'Float';
          // Look up declared return type from function symbol
          const fnSym = this.currentScope.lookup(name);
          if (fnSym && fnSym.kind === 'function') {
            if (fnSym._variantOf) return fnSym._variantOf;
            if (fnSym.type) return this._typeAnnotationToString(fnSym.type);
          }
        }
        return null;
      case 'Identifier':
        if (expr.name === 'None') return 'Option<_>';
        if (expr.name === 'true' || expr.name === 'false') return 'Bool';
        // Look up stored type
        const sym = this.currentScope.lookup(expr.name);
        return sym ? sym.inferredType : null;
      case 'TupleExpression':
        return `(${expr.elements.map(e => this._inferType(e) || 'Any').join(', ')})`;
      case 'BinaryExpression':
        if (expr.operator === '++') return 'String';
        if (['+', '-', '*', '/', '%', '**'].includes(expr.operator)) {
          const lt = this._inferType(expr.left);
          const rt = this._inferType(expr.right);
          if (!lt && !rt) return null;
          if (lt === 'Float' || rt === 'Float') return 'Float';
          if (lt === 'String' || rt === 'String') return 'String';
          return 'Int';
        }
        if (['==', '!=', '<', '>', '<=', '>='].includes(expr.operator)) return 'Bool';
        return null;
      case 'UnaryExpression':
        if (expr.operator === 'not' || expr.operator === '!') return 'Bool';
        if (expr.operator === '-') return this._inferType(expr.operand);
        return null;
      case 'LogicalExpression':
        return 'Bool';
      default:
        return null;
    }
  }

  _typeAnnotationToString(ann) {
    if (!ann) return null;
    if (typeof ann === 'string') return ann;
    switch (ann.type) {
      case 'TypeAnnotation':
        if (ann.typeParams && ann.typeParams.length > 0) {
          const params = ann.typeParams.map(p => this._typeAnnotationToString(p)).join(', ');
          return `${ann.name}<${params}>`;
        }
        return ann.name;
      case 'ArrayTypeAnnotation':
        return `[${this._typeAnnotationToString(ann.elementType) || 'Any'}]`;
      case 'TupleTypeAnnotation':
        return `(${ann.elementTypes.map(t => this._typeAnnotationToString(t) || 'Any').join(', ')})`;
      case 'FunctionTypeAnnotation':
        return 'Function';
      default:
        return null;
    }
  }

  _parseGenericType(typeStr) {
    if (!typeStr) return { base: typeStr, params: [] };
    const ltIdx = typeStr.indexOf('<');
    if (ltIdx === -1) return { base: typeStr, params: [] };
    const base = typeStr.slice(0, ltIdx);
    const inner = typeStr.slice(ltIdx + 1, typeStr.lastIndexOf('>'));
    // Split on top-level commas (respecting nested <>)
    const params = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === '<') depth++;
      else if (inner[i] === '>') depth--;
      else if (inner[i] === ',' && depth === 0) {
        params.push(inner.slice(start, i).trim());
        start = i + 1;
      }
    }
    params.push(inner.slice(start).trim());
    return { base, params };
  }

  _typesCompatible(expected, actual) {
    // Unknown types are always compatible (gradual typing)
    if (!expected || !actual) return true;
    if (expected === 'Any' || actual === 'Any') return true;
    if (expected === '_' || actual === '_') return true;
    // Exact match
    if (expected === actual) return true;
    // Numeric compatibility: Int and Float are interchangeable
    const numerics = new Set(['Int', 'Float']);
    if (numerics.has(expected) && numerics.has(actual)) return true;
    // Nil is compatible with Option
    if (actual === 'Nil' && (expected === 'Option' || expected.startsWith('Option'))) return true;
    if ((expected === 'Nil') && (actual === 'Option' || actual.startsWith('Option'))) return true;
    // Array compatibility: check element types
    if (expected.startsWith('[') && actual.startsWith('[')) {
      const expEl = expected.slice(1, -1);
      const actEl = actual.slice(1, -1);
      return this._typesCompatible(expEl, actEl);
    }
    // Tuple compatibility: check element types pairwise
    if (expected.startsWith('(') && actual.startsWith('(')) {
      const expEls = expected.slice(1, -1).split(', ');
      const actEls = actual.slice(1, -1).split(', ');
      if (expEls.length !== actEls.length) return false;
      return expEls.every((e, i) => this._typesCompatible(e, actEls[i]));
    }
    // Generic type compatibility: Result<Int, String> vs Result<String, Int>
    const expG = this._parseGenericType(expected);
    const actG = this._parseGenericType(actual);
    if (expG.params.length > 0 || actG.params.length > 0) {
      // Base types must match
      if (expG.base !== actG.base) return false;
      // If one has no params (plain `Result`), compatible with any parameterized version (gradual typing)
      if (expG.params.length === 0 || actG.params.length === 0) return true;
      // Compare params pairwise
      if (expG.params.length !== actG.params.length) return false;
      return expG.params.every((ep, i) => this._typesCompatible(ep, actG.params[i]));
    }
    return false;
  }

  // ─── Visitors ─────────────────────────────────────────────

  visitProgram(node) {
    for (const stmt of node.body) {
      if (this.tolerant) {
        try { this.visitNode(stmt); } catch (e) { /* skip nodes that crash in tolerant mode */ }
      } else {
        this.visitNode(stmt);
      }
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
      case 'ImportWildcard': return this.visitImportWildcard(node);
      case 'IfStatement': return this.visitIfStatement(node);
      case 'ForStatement': return this.visitForStatement(node);
      case 'WhileStatement': return this.visitWhileStatement(node);
      case 'TryCatchStatement': return this.visitTryCatchStatement(node);
      case 'ReturnStatement': return this.visitReturnStatement(node);
      case 'ExpressionStatement': return this.visitExpression(node.expression);
      case 'BlockStatement': return this.visitBlock(node);
      case 'CompoundAssignment': return this.visitCompoundAssignment(node);
      case 'BreakStatement': return this.visitBreakStatement(node);
      case 'ContinueStatement': return this.visitContinueStatement(node);
      case 'GuardStatement': return this.visitGuardStatement(node);
      case 'InterfaceDeclaration': return this.visitInterfaceDeclaration(node);
      case 'StateDeclaration': return this.visitStateDeclaration(node);
      case 'ComputedDeclaration': return this.visitComputedDeclaration(node);
      case 'EffectDeclaration': return this.visitEffectDeclaration(node);
      case 'ComponentDeclaration': return this.visitComponentDeclaration(node);
      case 'StoreDeclaration': return this.visitStoreDeclaration(node);
      case 'RouteDeclaration': return this.visitRouteDeclaration(node);
      case 'MiddlewareDeclaration': return this.visitMiddlewareDeclaration(node);
      case 'HealthCheckDeclaration': return this.visitHealthCheckDeclaration(node);
      case 'CorsDeclaration': return this.visitCorsDeclaration(node);
      case 'ErrorHandlerDeclaration': return this.visitErrorHandlerDeclaration(node);
      case 'WebSocketDeclaration': return this.visitWebSocketDeclaration(node);
      case 'StaticDeclaration': return this.visitStaticDeclaration(node);
      case 'DiscoverDeclaration': return this.visitDiscoverDeclaration(node);
      case 'AuthDeclaration': return this.visitAuthDeclaration(node);
      case 'MaxBodyDeclaration': return this.visitMaxBodyDeclaration(node);
      case 'RouteGroupDeclaration': return this.visitRouteGroupDeclaration(node);
      case 'RateLimitDeclaration': return this.visitRateLimitDeclaration(node);
      case 'LifecycleHookDeclaration': return this.visitLifecycleHookDeclaration(node);
      case 'SubscribeDeclaration': return this.visitSubscribeDeclaration(node);
      case 'EnvDeclaration': return this.visitEnvDeclaration(node);
      case 'ScheduleDeclaration': return this.visitScheduleDeclaration(node);
      case 'UploadDeclaration': return this.visitUploadDeclaration(node);
      case 'SessionDeclaration': return this.visitSessionDeclaration(node);
      case 'DbDeclaration': return this.visitDbDeclaration(node);
      case 'TlsDeclaration': return this.visitTlsDeclaration(node);
      case 'CompressionDeclaration': return this.visitCompressionDeclaration(node);
      case 'BackgroundJobDeclaration': return this.visitBackgroundJobDeclaration(node);
      case 'CacheDeclaration': return this.visitCacheDeclaration(node);
      case 'SseDeclaration': return this.visitSseDeclaration(node);
      case 'ModelDeclaration': return this.visitModelDeclaration(node);
      case 'AiConfigDeclaration': return; // handled at block level
      case 'DataBlock': return this.visitDataBlock(node);
      case 'SourceDeclaration': return;
      case 'PipelineDeclaration': return;
      case 'ValidateBlock': return;
      case 'RefreshPolicy': return;
      case 'RefinementType': return;
      case 'TestBlock': return this.visitTestBlock(node);
      case 'ComponentStyleBlock': return; // raw CSS — no analysis needed
      case 'ImplDeclaration': return this.visitImplDeclaration(node);
      case 'TraitDeclaration': return this.visitTraitDeclaration(node);
      case 'TypeAlias': return this.visitTypeAlias(node);
      case 'DeferStatement': return this.visitDeferStatement(node);
      case 'ExternDeclaration': return this.visitExternDeclaration(node);
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
        this._checkBinaryExprTypes(node);
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
        // Validate inter-server RPC calls: peerName.functionName()
        if (this._currentServerBlockName && node.callee.type === 'MemberExpression' &&
            node.callee.object.type === 'Identifier' && !node.callee.computed) {
          const targetName = node.callee.object.name;
          const fnName = node.callee.property;
          if (targetName === this._currentServerBlockName) {
            this.warn(`Server block "${targetName}" is calling itself via RPC — consider calling the function directly`, node.loc);
          } else if (this.serverBlockFunctions.has(targetName)) {
            const peerFns = this.serverBlockFunctions.get(targetName);
            if (!peerFns.includes(fnName)) {
              this.error(`No function '${fnName}' in server block "${targetName}"`, node.loc);
            }
          }
        }
        // Argument count and type validation for known functions
        this._checkCallArgCount(node);
        this._checkCallArgTypes(node);
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
          if (prop.spread) {
            // Spread property: {...expr}
            this.visitExpression(prop.argument);
          } else if (prop.shorthand) {
            // Shorthand: {name} — key IS the variable reference
            this.visitExpression(prop.key);
          } else {
            // Non-shorthand: {key: value} — only visit value, key is a label
            this.visitExpression(prop.value);
          }
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
      case 'PropagateExpression':
        this.visitExpression(node.expression);
        return;
      case 'AwaitExpression':
        if (this._asyncDepth === 0) {
          this.error("'await' can only be used inside an async function", node.loc);
        }
        this.visitExpression(node.argument);
        return;
      case 'YieldExpression':
        if (node.argument) this.visitExpression(node.argument);
        return;
      case 'TupleExpression':
        for (const el of node.elements) this.visitExpression(el);
        return;
      case 'IfExpression':
        this.visitExpression(node.condition);
        this.visitNode(node.consequent);
        for (const alt of node.alternates) {
          this.visitExpression(alt.condition);
          this.visitNode(alt.body);
        }
        this.visitNode(node.elseBody);
        return;
      case 'JSXElement':
        return this.visitJSXElement(node);
      // Column expressions (for table operations) — no semantic analysis needed
      case 'ColumnExpression':
        return;
      case 'ColumnAssignment':
        this.visitExpression(node.expression);
        return;
      case 'NegatedColumnExpression':
        return;
    }
  }

  // ─── Block visitors ───────────────────────────────────────

  visitServerBlock(node) {
    const prevScope = this.currentScope;
    const prevServerBlockName = this._currentServerBlockName;
    this._currentServerBlockName = node.name || null;
    this.currentScope = this.currentScope.child('server');

    try {
      // Register peer server block names as valid identifiers in this scope
      if (node.name && this.serverBlockFunctions.size > 0) {
        for (const [peerName] of this.serverBlockFunctions) {
          if (peerName !== node.name) {
            try {
              this.currentScope.define(peerName,
                new Symbol(peerName, 'builtin', null, false, { line: 0, column: 0, file: '<peer-server>' }));
            } catch (e) {
              // Ignore if already defined
            }
          }
        }
      }

      // Register AI provider names as variables (named: claude, gpt, etc.; default: ai)
      for (const stmt of node.body) {
        if (stmt.type === 'AiConfigDeclaration') {
          const aiName = stmt.name || 'ai';
          try {
            this.currentScope.define(aiName,
              new Symbol(aiName, 'builtin', null, false, stmt.loc));
          } catch (e) {
            // Ignore if already defined
          }
        }
      }

      for (const stmt of node.body) {
        this.visitNode(stmt);
      }
    } finally {
      this.currentScope = prevScope;
      this._currentServerBlockName = prevServerBlockName;
    }
  }

  visitDataBlock(node) {
    // Register source and pipeline names in global scope
    for (const stmt of node.body) {
      if (stmt.type === 'SourceDeclaration') {
        try {
          this.currentScope.define(stmt.name,
            new Symbol(stmt.name, 'variable', null, false, stmt.loc));
        } catch (e) { /* already defined */ }
        if (stmt.expression) this.visitExpression(stmt.expression);
      } else if (stmt.type === 'PipelineDeclaration') {
        try {
          this.currentScope.define(stmt.name,
            new Symbol(stmt.name, 'variable', null, false, stmt.loc));
        } catch (e) { /* already defined */ }
        if (stmt.expression) this.visitExpression(stmt.expression);
      }
    }
  }

  visitClientBlock(node) {
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('client');
    try {
      for (const stmt of node.body) {
        this.visitNode(stmt);
      }
    } finally {
      this.currentScope = prevScope;
    }
  }

  visitSharedBlock(node) {
    const prevScope = this.currentScope;
    const sharedScope = this.currentScope.child('shared');
    this.currentScope = sharedScope;
    try {
      for (const stmt of node.body) {
        this.visitNode(stmt);
      }
    } finally {
      this.currentScope = prevScope;
    }
    // Promote shared types and functions to parent scope
    // so server/client blocks can reference them (but not variables)
    for (const [name, sym] of sharedScope.symbols) {
      if (!prevScope.symbols.has(name) && (sym.kind === 'type' || sym.kind === 'function')) {
        prevScope.symbols.set(name, sym);
      }
    }
  }

  // ─── Declaration visitors ─────────────────────────────────

  visitAssignment(node) {
    // Visit values first (for type inference)
    for (const val of node.values) {
      this.visitExpression(val);
    }

    // Check if any target is already defined (immutable reassignment check)
    for (let i = 0; i < node.targets.length; i++) {
      const target = node.targets[i];
      const existing = this._lookupAssignTarget(target);
      if (existing) {
        if (!existing.mutable) {
          this.error(`Cannot reassign immutable variable '${target}'. Use 'var' for mutable variables.`, node.loc);
        }
        // Type check reassignment
        if (existing.inferredType && i < node.values.length) {
          const newType = this._inferType(node.values[i]);
          if (!this._typesCompatible(existing.inferredType, newType)) {
            this.strictError(`Type mismatch: '${target}' is ${existing.inferredType}, but assigned ${newType}`, node.loc);
          }
          // Float narrowing warning in strict mode
          if (this.strict && newType === 'Float' && existing.inferredType === 'Int') {
            this.warn(`Potential data loss: assigning Float to Int variable '${target}'`, node.loc);
          }
        }
        existing.used = true;
      } else {
        // New binding — define in current scope with inferred type
        const inferredType = i < node.values.length ? this._inferType(node.values[i]) : null;
        // Warn if this shadows a variable from an outer function scope
        if (this._existsInOuterScope(target)) {
          this.warn(`Variable '${target}' shadows a binding in an outer scope`, node.loc);
        }
        try {
          const sym = new Symbol(target, 'variable', null, false, node.loc);
          sym.inferredType = inferredType;
          this.currentScope.define(target, sym);
        } catch (e) {
          this.error(e.message);
        }
      }
    }
  }

  visitVarDeclaration(node) {
    // Visit values first so type inference can work
    for (const val of node.values) {
      this.visitExpression(val);
    }
    for (let i = 0; i < node.targets.length; i++) {
      const target = node.targets[i];
      const inferredType = i < node.values.length ? this._inferType(node.values[i]) : null;
      try {
        const sym = new Symbol(target, 'variable', null, true, node.loc);
        sym.inferredType = inferredType;
        this.currentScope.define(target, sym);
      } catch (e) {
        this.error(e.message);
      }
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
    } else if (node.pattern.type === 'ArrayPattern' || node.pattern.type === 'TuplePattern') {
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
      const sym = new Symbol(node.name, 'function', node.returnType, false, node.loc);
      sym._params = node.params.map(p => p.name);
      sym._totalParamCount = node.params.length;
      sym._requiredParamCount = node.params.filter(p => !p.defaultValue).length;
      sym._paramTypes = node.params.map(p => p.typeAnnotation || null);
      this.currentScope.define(node.name, sym);
    } catch (e) {
      this.error(e.message);
    }

    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('function');
    if (node.loc) {
      this.currentScope.startLoc = { line: node.loc.line, column: node.loc.column };
    }

    // Push expected return type for return-statement checking
    const expectedReturn = node.returnType ? this._typeAnnotationToString(node.returnType) : null;
    this._functionReturnTypeStack.push(expectedReturn);
    const prevAsyncDepth = this._asyncDepth;
    if (node.isAsync) {
      this._asyncDepth++;
    } else {
      this._asyncDepth = 0; // Non-async function resets async context
    }

    try {
      for (const param of node.params) {
        if (param.destructure) {
          this._defineDestructureParams(param.destructure, param.loc);
        } else {
          try {
            const paramSym = new Symbol(param.name, 'parameter', param.typeAnnotation, false, param.loc);
            paramSym.inferredType = param.typeAnnotation ? this._typeAnnotationToString(param.typeAnnotation) : null;
            this.currentScope.define(param.name, paramSym);
          } catch (e) {
            this.error(e.message);
          }
        }
        if (param.defaultValue) {
          this.visitExpression(param.defaultValue);
        }
      }

      this.visitNode(node.body);

      // Return path analysis: check that all paths return a value
      if (expectedReturn && node.body.type === 'BlockStatement') {
        if (!this._definitelyReturns(node.body)) {
          this.warn(`Function '${node.name}' declares return type ${expectedReturn} but not all code paths return a value`, node.loc);
        }
      }
    } finally {
      this._asyncDepth = prevAsyncDepth;
      this._functionReturnTypeStack.pop();
      this.currentScope = prevScope;
    }
  }

  visitExternDeclaration(node) {
    const sym = new Symbol(node.name, 'function', node.returnType, false, node.loc);
    sym._params = node.params.map(p => p.name || `arg${node.params.indexOf(p)}`);
    sym._totalParamCount = node.params.length;
    sym._requiredParamCount = node.params.filter(p => !p.defaultValue).length;
    sym._paramTypes = node.params.map(p => p.typeAnnotation || null);
    sym.extern = true;
    sym.isAsync = node.isAsync;
    // Extern declarations can override builtins (they provide more precise type info)
    const existing = this.currentScope.lookupLocal(node.name);
    if (existing && existing.kind === 'builtin') {
      this.currentScope.symbols.set(node.name, sym);
    } else {
      try {
        this.currentScope.define(node.name, sym);
      } catch (e) {
        this.error(e.message);
      }
    }
  }

  _defineDestructureParams(pattern, loc) {
    if (pattern.type === 'ObjectPattern') {
      for (const prop of pattern.properties) {
        try {
          this.currentScope.define(prop.value,
            new Symbol(prop.value, 'parameter', null, false, loc));
        } catch (e) {
          this.error(e.message);
        }
      }
    } else if (pattern.type === 'ArrayPattern' || pattern.type === 'TuplePattern') {
      for (const el of pattern.elements) {
        if (el) {
          try {
            this.currentScope.define(el,
              new Symbol(el, 'parameter', null, false, loc));
          } catch (e) {
            this.error(e.message);
          }
        }
      }
    }
  }

  visitTypeDeclaration(node) {
    // Build ADT type structure
    const variants = new Map();
    for (const variant of node.variants) {
      if (variant.type === 'TypeVariant') {
        const fields = new Map();
        for (const f of variant.fields) {
          const fieldType = f.typeAnnotation ? typeAnnotationToType(f.typeAnnotation) : Type.ANY;
          fields.set(f.name, fieldType || Type.ANY);
        }
        variants.set(variant.name, fields);
      }
    }
    const adtType = new ADTType(node.name, node.typeParams || [], variants);

    try {
      const typeSym = new Symbol(node.name, 'type', null, false, node.loc);
      typeSym._typeParams = node.typeParams || [];
      typeSym._typeStructure = adtType;
      this.currentScope.define(node.name, typeSym);

      // Register in type registry for LSP
      this.typeRegistry.types.set(node.name, adtType);
    } catch (e) {
      this.error(e.message);
    }

    // Define variant constructors as functions
    for (const variant of node.variants) {
      if (variant.type === 'TypeVariant') {
        try {
          const varSym = new Symbol(variant.name, 'function', null, false, variant.loc);
          varSym._params = variant.fields.map(f => f.name);
          varSym._totalParamCount = variant.fields.length;
          varSym._requiredParamCount = variant.fields.length;
          varSym._variantOf = node.name;
          varSym._paramTypes = variant.fields.map(f => f.typeAnnotation || null);
          this.currentScope.define(variant.name, varSym);
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

  visitImportWildcard(node) {
    try {
      this.currentScope.define(node.local,
        new Symbol(node.local, 'module', null, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }
  }

  // ─── Statement visitors ───────────────────────────────────

  visitBlock(node) {
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');
    if (node.loc) {
      this.currentScope.startLoc = { line: node.loc.line, column: node.loc.column };
    }
    try {
      for (const stmt of node.body) {
        this.visitNode(stmt);
      }
    } finally {
      if (node.loc) {
        this.currentScope.endLoc = { line: node.endLoc?.line || node.loc.line + 100, column: node.endLoc?.column || 0 };
      }
      this.currentScope = prevScope;
    }
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
    this.currentScope._isLoop = true;

    try {
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
    } finally {
      this.currentScope = prevScope;
    }

    if (node.elseBody) {
      this.visitNode(node.elseBody);
    }
  }

  visitWhileStatement(node) {
    this.visitExpression(node.condition);
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');
    this.currentScope._isLoop = true;
    try {
      this.visitNode(node.body);
    } finally {
      this.currentScope = prevScope;
    }
  }

  visitTryCatchStatement(node) {
    const prevScope = this.currentScope;

    this.currentScope = prevScope.child('block');
    try {
      for (const stmt of node.tryBody) this.visitNode(stmt);
    } finally {
      this.currentScope = prevScope;
    }

    if (node.catchBody) {
      this.currentScope = prevScope.child('block');
      try {
        if (node.catchParam) {
          this.currentScope.define(node.catchParam, new Symbol(node.catchParam, 'variable', null, false, node.loc));
        }
        for (const stmt of node.catchBody) this.visitNode(stmt);
      } finally {
        this.currentScope = prevScope;
      }
    }

    if (node.finallyBody) {
      this.currentScope = prevScope.child('block');
      try {
        for (const stmt of node.finallyBody) this.visitNode(stmt);
      } finally {
        this.currentScope = prevScope;
      }
    }
  }

  visitReturnStatement(node) {
    if (node.value) {
      this.visitExpression(node.value);
    }
    // Return must be inside a function
    if (this._functionReturnTypeStack.length === 0) {
      this.error("'return' can only be used inside a function", node.loc);
      return;
    }
    // Check return type against declared function return type
    if (this._functionReturnTypeStack.length > 0) {
      const expectedReturn = this._functionReturnTypeStack[this._functionReturnTypeStack.length - 1];
      if (expectedReturn) {
        const actualType = node.value ? this._inferType(node.value) : 'Nil';
        if (!this._typesCompatible(expectedReturn, actualType)) {
          this.error(`Type mismatch: function expects return type ${expectedReturn}, but got ${actualType}`, node.loc);
        }
      }
    }
  }

  visitCompoundAssignment(node) {
    // Target must be mutable
    if (node.target.type === 'Identifier') {
      const sym = this.currentScope.lookup(node.target.name);
      if (sym && !sym.mutable && sym.kind !== 'builtin') {
        this.error(`Cannot use '${node.operator}' on immutable variable '${node.target.name}'`, node.loc);
      }
      // Type check compound assignment
      if (sym && sym.inferredType) {
        const op = node.operator;
        const numerics = new Set(['Int', 'Float']);
        if (['-=', '*=', '/='].includes(op)) {
          if (!numerics.has(sym.inferredType) && sym.inferredType !== 'Any') {
            this.strictError(`Type mismatch: '${op}' requires numeric type, but '${node.target.name}' is ${sym.inferredType}`, node.loc);
          }
          const valType = this._inferType(node.value);
          if (valType && !numerics.has(valType) && valType !== 'Any') {
            this.strictError(`Type mismatch: '${op}' requires numeric value, but got ${valType}`, node.loc);
          }
        } else if (op === '+=') {
          // += on numerics requires numeric value, on strings requires string
          if (numerics.has(sym.inferredType)) {
            const valType = this._inferType(node.value);
            if (valType && !numerics.has(valType) && valType !== 'Any') {
              this.strictError(`Type mismatch: '${op}' on numeric variable requires numeric value, but got ${valType}`, node.loc);
            }
          } else if (sym.inferredType === 'String') {
            const valType = this._inferType(node.value);
            if (valType && valType !== 'String' && valType !== 'Any') {
              this.strictError(`Type mismatch: '${op}' on String variable requires String value, but got ${valType}`, node.loc);
            }
          }
        }
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
    try {
      for (const child of node.body) {
        this.visitNode(child);
      }
    } finally {
      this.currentScope = prevScope;
    }
  }

  visitStoreDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'client') {
      this.error(`'store' can only be used inside a client block`, node.loc);
    }
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'variable', null, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }

    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');
    try {
      for (const child of node.body) {
        this.visitNode(child);
      }
    } finally {
      this.currentScope = prevScope;
    }
  }

  visitRouteDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'route' can only be used inside a server block`, node.loc);
    }
    this.visitExpression(node.handler);

    // Route param ↔ handler signature type safety
    if (node.handler.type === 'Identifier') {
      const handlerName = node.handler.name;
      // Find the function declaration in the current server block scope
      const fnSym = this.currentScope.lookup(handlerName);
      if (fnSym && fnSym.kind === 'function' && fnSym._params) {
        const pathParams = new Set();
        const pathStr = node.path || '';
        const paramMatches = pathStr.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g);
        if (paramMatches) {
          for (const m of paramMatches) pathParams.add(m.slice(1));
        }
        const handlerParams = fnSym._params.filter(p => p !== 'req');
        for (const hp of handlerParams) {
          if (pathParams.size > 0 && !pathParams.has(hp) && node.method.toUpperCase() === 'GET') {
            // For GET routes, params not in path come from query — this is fine, just a warning
            this.warn(`Handler '${handlerName}' param '${hp}' not in route path '${pathStr}' — will be extracted from query string`, node.loc);
          }
        }
      }
    }
  }

  visitMiddlewareDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'middleware' can only be used inside a server block`, node.loc);
    }
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'function', null, false, node.loc));
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
    try {
      this.visitNode(node.body);
    } finally {
      this.currentScope = prevScope;
    }
  }

  visitHealthCheckDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'health' can only be used inside a server block`, node.loc);
    }
  }

  visitCorsDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'cors' can only be used inside a server block`, node.loc);
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  }

  visitErrorHandlerDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'on_error' can only be used inside a server block`, node.loc);
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
    try {
      this.visitNode(node.body);
    } finally {
      this.currentScope = prevScope;
    }
  }

  visitWebSocketDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'ws' can only be used inside a server block`, node.loc);
    }
    for (const [, handler] of Object.entries(node.handlers)) {
      if (!handler) continue;
      const prevScope = this.currentScope;
      this.currentScope = this.currentScope.child('function');
      for (const param of handler.params) {
        try {
          this.currentScope.define(param.name,
            new Symbol(param.name, 'parameter', param.typeAnnotation, false, param.loc));
        } catch (e) {
          this.error(e.message);
        }
      }
      try {
        this.visitNode(handler.body);
      } finally {
        this.currentScope = prevScope;
      }
    }
  }

  visitStaticDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'static' can only be used inside a server block`, node.loc);
    }
  }

  visitDiscoverDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'discover' can only be used inside a server block`, node.loc);
    }
    this.visitExpression(node.urlExpression);
  }

  visitAuthDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'auth' can only be used inside a server block`, node.loc);
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  }

  visitMaxBodyDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'max_body' can only be used inside a server block`, node.loc);
    }
    this.visitExpression(node.limit);
  }

  visitRouteGroupDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'routes' can only be used inside a server block`, node.loc);
    }
    for (const stmt of node.body) {
      this.visitNode(stmt);
    }
  }

  visitRateLimitDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'rate_limit' can only be used inside a server block`, node.loc);
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  }

  visitLifecycleHookDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'on_${node.hook}' can only be used inside a server block`, node.loc);
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
    try {
      this.visitNode(node.body);
    } finally {
      this.currentScope = prevScope;
    }
  }

  visitSubscribeDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'subscribe' can only be used inside a server block`, node.loc);
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
    try {
      this.visitNode(node.body);
    } finally {
      this.currentScope = prevScope;
    }
  }

  visitEnvDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'env' can only be used inside a server block`, node.loc);
    }
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'variable', node.typeAnnotation, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }
    if (node.defaultValue) {
      this.visitExpression(node.defaultValue);
    }
  }

  visitScheduleDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'schedule' can only be used inside a server block`, node.loc);
    }
    if (node.name) {
      try {
        this.currentScope.define(node.name,
          new Symbol(node.name, 'function', null, false, node.loc));
      } catch (e) {
        this.error(e.message);
      }
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
    try {
      this.visitNode(node.body);
    } finally {
      this.currentScope = prevScope;
    }
  }

  visitUploadDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'upload' can only be used inside a server block`, node.loc);
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  }

  visitSessionDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'session' can only be used inside a server block`, node.loc);
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  }

  visitDbDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'db' can only be used inside a server block`, node.loc);
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  }

  visitTlsDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'tls' can only be used inside a server block`, node.loc);
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  }

  visitCompressionDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'compression' can only be used inside a server block`, node.loc);
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  }

  visitBackgroundJobDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'background' can only be used inside a server block`, node.loc);
    }
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'function', null, false, node.loc));
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
    try {
      this.visitNode(node.body);
    } finally {
      this.currentScope = prevScope;
    }
  }

  visitCacheDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'cache' can only be used inside a server block`, node.loc);
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  }

  visitSseDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'sse' can only be used inside a server block`, node.loc);
    }
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');
    for (const p of node.params) {
      this.currentScope.define(p.name, { kind: 'param' });
    }
    try {
      for (const stmt of node.body.body || []) {
        this.visitNode(stmt);
      }
    } finally {
      this.currentScope = prevScope;
    }
  }

  visitModelDeclaration(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'model' can only be used inside a server block`, node.loc);
    }
    if (node.config) {
      for (const value of Object.values(node.config)) {
        this.visitExpression(value);
      }
    }
  }

  visitTestBlock(node) {
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');
    try {
      for (const stmt of node.body) {
        this.visitNode(stmt);
      }
    } finally {
      this.currentScope = prevScope;
    }
  }

  // ─── Expression visitors ──────────────────────────────────

  visitIdentifier(node) {
    if (node.name === '_') return; // wildcard is always valid
    if (node.name === PIPE_TARGET) return; // pipe target placeholder from method pipe

    const sym = this.currentScope.lookup(node.name);
    if (!sym) {
      if (!this._isKnownGlobal(node.name)) {
        this.warn(`'${node.name}' is not defined`, node.loc);
      }
    } else {
      sym.used = true;
    }
  }

  _isKnownGlobal(name) {
    // Tova stdlib (auto-synced from BUILTIN_FUNCTIONS in inline.js)
    if (BUILTIN_NAMES.has(name)) return true;

    // Tova runtime names
    if (_TOVA_RUNTIME.has(name)) return true;

    // JS globals / platform APIs
    return _JS_GLOBALS.has(name);
  }

  visitLambda(node) {
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('function');

    const expectedReturn = node.returnType ? this._typeAnnotationToString(node.returnType) : null;
    this._functionReturnTypeStack.push(expectedReturn);
    const prevAsyncDepth = this._asyncDepth;
    if (node.isAsync) {
      this._asyncDepth++;
    } else {
      this._asyncDepth = 0; // Non-async lambda resets async context
    }

    try {
      for (const param of node.params) {
        try {
          const paramSym = new Symbol(param.name, 'parameter', param.typeAnnotation, false, param.loc);
          paramSym.inferredType = param.typeAnnotation ? this._typeAnnotationToString(param.typeAnnotation) : null;
          this.currentScope.define(param.name, paramSym);
        } catch (e) {
          this.error(e.message);
        }
      }
      if (node.body.type === 'BlockStatement') {
        this.visitNode(node.body);
        // Return path analysis for lambdas with block bodies and declared return types
        if (expectedReturn && !this._definitelyReturns(node.body)) {
          this.warn(`Lambda declares return type ${expectedReturn} but not all code paths return a value`, node.loc);
        }
      } else {
        // Single-expression body — always returns implicitly
        this.visitExpression(node.body);
      }
    } finally {
      this._asyncDepth = prevAsyncDepth;
      this._functionReturnTypeStack.pop();
      this.currentScope = prevScope;
    }
  }

  visitMatchExpression(node) {
    this.visitExpression(node.subject);
    for (const arm of node.arms) {
      const prevScope = this.currentScope;
      this.currentScope = this.currentScope.child('block');

      try {
        this.visitPattern(arm.pattern);
        if (arm.guard) this.visitExpression(arm.guard);

        if (arm.body.type === 'BlockStatement') {
          this.visitNode(arm.body);
        } else {
          this.visitExpression(arm.body);
        }
      } finally {
        this.currentScope = prevScope;
      }
    }

    // Exhaustive match checking (#12)
    this._checkMatchExhaustiveness(node);
  }

  _checkMatchExhaustiveness(node) {
    // Check if the match has a wildcard/binding catch-all
    const hasWildcard = node.arms.some(arm =>
      arm.pattern.type === 'WildcardPattern' ||
      (arm.pattern.type === 'BindingPattern' && !arm.guard)
    );
    if (hasWildcard) return; // Catch-all exists, always exhaustive

    // Try to resolve the subject type for better checking
    let subjectType = null;
    if (node.subject) {
      const subjectTypeStr = this._inferType(node.subject);
      if (subjectTypeStr) {
        // Look up type structure from type registry
        const typeStructure = this.typeRegistry.types.get(subjectTypeStr);
        if (typeStructure instanceof ADTType) {
          subjectType = typeStructure;
        }
      }
      // Also try to find type from identifier
      if (!subjectType && node.subject.type === 'Identifier') {
        const sym = this.currentScope.lookup(node.subject.name);
        if (sym && sym.inferredType) {
          const typeStructure = this.typeRegistry.types.get(sym.inferredType);
          if (typeStructure instanceof ADTType) {
            subjectType = typeStructure;
          }
        }
      }
    }

    const variantNames = new Set();
    const coveredVariants = new Set();

    // Collect all variant patterns used in the match
    for (const arm of node.arms) {
      if (arm.pattern.type === 'VariantPattern') {
        coveredVariants.add(arm.pattern.name);
      }
    }

    // If we have variant patterns, check if all known variants are covered
    if (coveredVariants.size > 0) {
      // If we have the ADT type structure, use it for precise checking
      if (subjectType) {
        const allVariants = subjectType.getVariantNames();
        for (const v of allVariants) {
          if (!coveredVariants.has(v)) {
            this.warn(`Non-exhaustive match: missing '${v}' variant from type '${subjectType.name}'`, node.loc);
          }
        }
        return; // Done — used precise ADT checking
      }

      // Check built-in Result/Option types
      if (coveredVariants.has('Ok') || coveredVariants.has('Err')) {
        if (!coveredVariants.has('Ok')) {
          this.warn(`Non-exhaustive match: missing 'Ok' variant`, node.loc);
        }
        if (!coveredVariants.has('Err')) {
          this.warn(`Non-exhaustive match: missing 'Err' variant`, node.loc);
        }
      }
      if (coveredVariants.has('Some') || coveredVariants.has('None')) {
        if (!coveredVariants.has('Some')) {
          this.warn(`Non-exhaustive match: missing 'Some' variant`, node.loc);
        }
        if (!coveredVariants.has('None')) {
          this.warn(`Non-exhaustive match: missing 'None' variant`, node.loc);
        }
      }

      // Check user-defined types — find the single best-matching type whose variants
      // contain ALL covered variant names (avoids false positives with shared names)
      const candidates = [];
      this._collectTypeCandidates(this.ast.body, coveredVariants, candidates);
      // Only warn if exactly one type contains all covered variants
      if (candidates.length === 1) {
        const [typeName, typeVariants] = candidates[0];
        for (const v of typeVariants) {
          if (!coveredVariants.has(v)) {
            this.warn(`Non-exhaustive match: missing '${v}' variant from type '${typeName}'`, node.loc);
          }
        }
      }
    }
  }

  _collectTypeCandidates(nodes, coveredVariants, candidates) {
    for (const node of nodes) {
      if (node.type === 'TypeDeclaration') {
        const typeVariants = node.variants.filter(v => v.type === 'TypeVariant').map(v => v.name);
        if (typeVariants.length === 0) continue;
        // All covered variants must be contained in this type's variants
        const allCovered = [...coveredVariants].every(v => typeVariants.includes(v));
        if (allCovered) {
          candidates.push([node.name, typeVariants]);
        }
      }
      if (node.type === 'SharedBlock' || node.type === 'ServerBlock' || node.type === 'ClientBlock') {
        this._collectTypeCandidates(node.body, coveredVariants, candidates);
      }
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
          if (typeof field === 'string') {
            // Legacy: plain string field names
            try {
              this.currentScope.define(field,
                new Symbol(field, 'variable', null, false, pattern.loc));
            } catch (e) {
              this.error(e.message);
            }
          } else {
            // Nested pattern (e.g., Some(Ok(value)))
            this.visitPattern(field);
          }
        }
        break;
      case 'ArrayPattern':
      case 'TuplePattern':
        if (pattern.elements) {
          for (const el of pattern.elements) {
            this.visitPattern(el);
          }
        }
        break;
      case 'StringConcatPattern':
        if (pattern.rest) {
          this.visitPattern(pattern.rest);
        }
        break;
    }
  }

  visitListComprehension(node) {
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');

    try {
      this.visitExpression(node.iterable);
      try {
        this.currentScope.define(node.variable,
          new Symbol(node.variable, 'variable', null, false, node.loc));
      } catch (e) {
        this.error(e.message);
      }
      if (node.condition) this.visitExpression(node.condition);
      this.visitExpression(node.expression);
    } finally {
      this.currentScope = prevScope;
    }
  }

  visitDictComprehension(node) {
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');

    try {
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
    } finally {
      this.currentScope = prevScope;
    }
  }

  visitJSXElement(node) {
    for (const attr of node.attributes) {
      if (attr.type === 'JSXSpreadAttribute') {
        this.visitExpression(attr.expression);
      } else {
        this.visitExpression(attr.value);
      }
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
    try {
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
    } finally {
      this.currentScope = prevScope;
    }
  }

  visitJSXIf(node) {
    this.visitExpression(node.condition);
    for (const child of node.consequent) {
      this.visitNode(child);
    }
    if (node.alternates) {
      for (const alt of node.alternates) {
        this.visitExpression(alt.condition);
        for (const child of alt.body) {
          this.visitNode(child);
        }
      }
    }
    if (node.alternate) {
      for (const child of node.alternate) {
        this.visitNode(child);
      }
    }
  }

  // ─── New feature visitors ─────────────────────────────────

  visitBreakStatement(node) {
    if (!this._isInsideLoop()) {
      this.error("'break' can only be used inside a loop", node.loc);
    }
  }

  visitContinueStatement(node) {
    if (!this._isInsideLoop()) {
      this.error("'continue' can only be used inside a loop", node.loc);
    }
  }

  _definitelyReturns(node) {
    if (!node) return false;
    switch (node.type) {
      case 'ReturnStatement':
        return true;
      case 'BlockStatement':
        if (node.body.length === 0) return false;
        // Any statement that definitely returns makes the block definitely return
        return node.body.some(stmt => this._definitelyReturns(stmt));
      case 'IfStatement':
        if (!node.elseBody) return false;
        const consequentReturns = this._definitelyReturns(node.consequent);
        const elseReturns = this._definitelyReturns(node.elseBody);
        const allAlternatesReturn = (node.alternates || []).every(alt => this._definitelyReturns(alt.body));
        return consequentReturns && elseReturns && allAlternatesReturn;
      case 'GuardStatement':
        // Guard only handles the failure case — when condition is true, execution falls through
        // A guard alone never guarantees return on ALL paths
        return false;
      case 'MatchExpression': {
        const hasWildcard = node.arms.some(arm =>
          arm.pattern.type === 'WildcardPattern' ||
          (arm.pattern.type === 'BindingPattern' && !arm.guard)
        );
        if (!hasWildcard) return false;
        return node.arms.every(arm => this._definitelyReturns(arm.body));
      }
      case 'TryCatchStatement': {
        const tryReturns = node.tryBody.length > 0 &&
          node.tryBody.some(s => this._definitelyReturns(s));
        const catchReturns = !node.catchBody || (node.catchBody.length > 0 &&
          node.catchBody.some(s => this._definitelyReturns(s)));
        return tryReturns && catchReturns;
      }
      case 'ExpressionStatement':
        return this._definitelyReturns(node.expression);
      case 'CallExpression':
        return false;
      default:
        return false;
    }
  }

  _checkCallArgCount(node) {
    if (node.callee.type !== 'Identifier') return;
    const fnSym = this.currentScope.lookup(node.callee.name);
    if (!fnSym || fnSym.kind === 'builtin' || fnSym._totalParamCount === undefined) return;

    // Skip check if any argument uses spread (unknown count)
    const hasSpread = node.arguments.some(a => a.type === 'SpreadExpression');
    if (hasSpread) return;

    // Named arguments are collapsed into a single object at codegen
    const hasNamedArgs = node.arguments.some(a => a.type === 'NamedArgument');
    if (hasNamedArgs) {
      const positionalCount = node.arguments.filter(a => a.type !== 'NamedArgument').length;
      var actualCount = positionalCount + 1; // named args become one object
    } else {
      var actualCount = node.arguments.length;
    }
    const name = node.callee.name;

    if (actualCount > fnSym._totalParamCount) {
      this.strictError(`'${name}' expects ${fnSym._totalParamCount} argument${fnSym._totalParamCount !== 1 ? 's' : ''}, but got ${actualCount}`, node.loc);
    } else if (actualCount < fnSym._requiredParamCount) {
      this.strictError(`'${name}' expects at least ${fnSym._requiredParamCount} argument${fnSym._requiredParamCount !== 1 ? 's' : ''}, but got ${actualCount}`, node.loc);
    }
  }

  _checkCallArgTypes(node) {
    if (node.callee.type !== 'Identifier') return;
    const fnSym = this.currentScope.lookup(node.callee.name);
    if (!fnSym || fnSym.kind === 'builtin' || !fnSym._paramTypes) return;

    const hasSpread = node.arguments.some(a => a.type === 'SpreadExpression');
    if (hasSpread) return;

    for (let i = 0; i < node.arguments.length && i < fnSym._paramTypes.length; i++) {
      const arg = node.arguments[i];
      if (arg.type === 'NamedArgument' || arg.type === 'SpreadExpression') continue;
      const paramTypeAnn = fnSym._paramTypes[i];
      if (!paramTypeAnn) continue;
      const expectedType = this._typeAnnotationToString(paramTypeAnn);
      const actualType = this._inferType(arg);
      if (!this._typesCompatible(expectedType, actualType)) {
        const paramName = fnSym._params ? fnSym._params[i] : `argument ${i + 1}`;
        this.error(`Type mismatch: '${paramName}' expects ${expectedType}, but got ${actualType}`, arg.loc || node.loc);
      }
    }
  }

  _checkBinaryExprTypes(node) {
    const op = node.operator;
    const leftType = this._inferType(node.left);
    const rightType = this._inferType(node.right);

    if (op === '++') {
      // String concatenation: both sides should be String
      if (leftType && leftType !== 'String' && leftType !== 'Any') {
        this.strictError(`Type mismatch: '++' expects String on left side, but got ${leftType}`, node.loc);
      }
      if (rightType && rightType !== 'String' && rightType !== 'Any') {
        this.strictError(`Type mismatch: '++' expects String on right side, but got ${rightType}`, node.loc);
      }
    } else if (['-', '*', '/', '%', '**'].includes(op)) {
      // String literal * Int is valid (string repeat) — skip warning for that case
      if (op === '*') {
        const leftIsStr = node.left.type === 'StringLiteral' || node.left.type === 'TemplateLiteral';
        const rightIsStr = node.right.type === 'StringLiteral' || node.right.type === 'TemplateLiteral';
        if (leftIsStr || rightIsStr) return;
      }
      // Arithmetic: both sides must be numeric
      const numerics = new Set(['Int', 'Float']);
      if (leftType && !numerics.has(leftType) && leftType !== 'Any') {
        this.strictError(`Type mismatch: '${op}' expects numeric type, but got ${leftType}`, node.loc);
      }
      if (rightType && !numerics.has(rightType) && rightType !== 'Any') {
        this.strictError(`Type mismatch: '${op}' expects numeric type, but got ${rightType}`, node.loc);
      }
    } else if (op === '+') {
      // Addition: both sides must be numeric (Tova uses ++ for strings)
      const numerics = new Set(['Int', 'Float']);
      if (leftType && !numerics.has(leftType) && leftType !== 'Any') {
        this.strictError(`Type mismatch: '+' expects numeric type, but got ${leftType}`, node.loc);
      }
      if (rightType && !numerics.has(rightType) && rightType !== 'Any') {
        this.strictError(`Type mismatch: '+' expects numeric type, but got ${rightType}`, node.loc);
      }
    }
  }

  // Search for a variable from current scope up to the nearest function/module boundary.
  // This ensures `x = 20` inside an if/for block finds `x = 10` from the enclosing function,
  // preventing silent shadowing of immutable bindings within the same function.
  _lookupAssignTarget(name) {
    let scope = this.currentScope;
    while (scope) {
      const sym = scope.symbols.get(name);
      if (sym) return sym;
      // Stop after checking a function or top-level scope (don't cross function boundaries)
      if (scope.context === 'function' || scope.context === 'module' ||
          scope.context === 'server' || scope.context === 'client' || scope.context === 'shared') {
        break;
      }
      scope = scope.parent;
    }
    return null;
  }

  // Check if a name exists in any outer scope beyond the current function boundary.
  // Used to warn about shadowing of outer variables.
  _existsInOuterScope(name) {
    let scope = this.currentScope;
    let crossedBoundary = false;
    while (scope) {
      if (!crossedBoundary && (scope.context === 'function' || scope.context === 'module' ||
          scope.context === 'server' || scope.context === 'client' || scope.context === 'shared')) {
        crossedBoundary = true;
        scope = scope.parent;
        continue;
      }
      if (crossedBoundary) {
        const sym = scope.symbols.get(name);
        if (sym) return true;
      }
      scope = scope.parent;
    }
    return false;
  }

  pushScope(context) {
    this.currentScope = this.currentScope.child(context);
  }

  popScope() {
    this.currentScope = this.currentScope.parent;
  }

  _isInsideLoop() {
    // Walk up the AST context — check if any parent is a for/while loop scope
    // Stop at function boundaries so break/continue inside lambdas is rejected
    let scope = this.currentScope;
    while (scope) {
      if (scope._isLoop) return true;
      if (scope.context === 'function') return false;
      scope = scope.parent;
    }
    return false;
  }

  visitGuardStatement(node) {
    this.visitExpression(node.condition);
    this.visitNode(node.elseBody);
  }

  visitInterfaceDeclaration(node) {
    try {
      const sym = new Symbol(node.name, 'type', null, false, node.loc);
      // Store method signatures for conformance checking
      sym._interfaceMethods = (node.methods || []).map(m => ({
        name: m.name,
        paramTypes: (m.params || []).map(p => typeAnnotationToType(p.typeAnnotation)),
        returnType: typeAnnotationToType(m.returnType),
        paramCount: (m.params || []).filter(p => p.name !== 'self').length,
      }));
      this.currentScope.define(node.name, sym);

      // Register in type registry for LSP
      this.typeRegistry.traits.set(node.name, sym._interfaceMethods);
    } catch (e) {
      this.error(e.message);
    }
  }

  visitImplDeclaration(node) {
    // Collect provided method names for conformance checking
    const providedMethods = new Map();
    for (const method of node.methods) {
      providedMethods.set(method.name, {
        paramCount: (method.params || []).filter(p => p.name !== 'self').length,
        returnType: method.returnType ? typeAnnotationToType(method.returnType) : null,
      });
    }

    // Register impl methods in type registry for LSP
    const typeName = node.typeName || node.target;
    if (typeName) {
      const existingImpls = this.typeRegistry.impls.get(typeName) || [];
      for (const method of node.methods) {
        existingImpls.push({
          name: method.name,
          params: (method.params || []).map(p => p.name),
          paramTypes: (method.params || []).map(p => typeAnnotationToType(p.typeAnnotation)),
          returnType: typeAnnotationToType(method.returnType),
        });
      }
      this.typeRegistry.impls.set(typeName, existingImpls);
    }

    // Trait/interface conformance checking
    if (node.traitName) {
      const traitSym = this.currentScope.lookup(node.traitName);
      if (traitSym && traitSym._interfaceMethods) {
        for (const required of traitSym._interfaceMethods) {
          const provided = providedMethods.get(required.name);
          if (!provided) {
            this.warn(`Impl for '${typeName || 'type'}' missing required method '${required.name}' from trait '${node.traitName}'`, node.loc);
          } else {
            // Check parameter count matches (excluding self)
            if (required.paramCount > 0 && provided.paramCount !== required.paramCount) {
              this.warn(`Method '${required.name}' in impl for '${typeName}' has ${provided.paramCount} parameters, but trait '${node.traitName}' expects ${required.paramCount}`, node.loc);
            }
            // Check return type matches if both are annotated
            if (required.returnType && provided.returnType) {
              if (!provided.returnType.isAssignableTo(required.returnType)) {
                this.warn(`Method '${required.name}' return type mismatch in impl for '${typeName}': expected ${required.returnType}, got ${provided.returnType}`, node.loc);
              }
            }
          }
        }
      }
    }

    // Validate that methods reference the type
    for (const method of node.methods) {
      this.pushScope('function');
      try {
        // self is implicitly available
        try {
          this.currentScope.define('self',
            new Symbol('self', 'variable', null, true, method.loc));
        } catch (e) { /* ignore */ }
        for (const p of method.params) {
          if (p.name && p.name !== 'self') {
            try {
              this.currentScope.define(p.name,
                new Symbol(p.name, 'variable', null, false, p.loc));
            } catch (e) { /* ignore */ }
          }
        }
        if (method.body) {
          this.visitBlock(method.body);
        }
      } finally {
        this.popScope();
      }
    }
  }

  visitTraitDeclaration(node) {
    try {
      const sym = new Symbol(node.name, 'type', null, false, node.loc);
      // Store method signatures for conformance checking
      sym._interfaceMethods = (node.methods || []).map(m => ({
        name: m.name,
        paramTypes: (m.params || []).map(p => typeAnnotationToType(p.typeAnnotation)),
        returnType: typeAnnotationToType(m.returnType),
        paramCount: (m.params || []).filter(p => p.name !== 'self').length,
      }));
      this.currentScope.define(node.name, sym);

      // Register in type registry for LSP
      this.typeRegistry.traits.set(node.name, sym._interfaceMethods);
    } catch (e) {
      this.error(e.message);
    }
    // Visit default implementations
    for (const method of node.methods) {
      if (method.body) {
        this.pushScope('function');
        try {
          for (const p of method.params) {
            if (p.name) {
              try {
                this.currentScope.define(p.name,
                  new Symbol(p.name, 'variable', null, false, p.loc || node.loc));
              } catch (e) { /* ignore */ }
            }
          }
          this.visitBlock(method.body);
        } finally {
          this.popScope();
        }
      }
    }
  }

  visitTypeAlias(node) {
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'type', null, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }
  }

  visitDeferStatement(node) {
    // Validate defer is inside a function
    let scope = this.currentScope;
    let insideFunction = false;
    while (scope) {
      if (scope.context === 'function') {
        insideFunction = true;
        break;
      }
      scope = scope.parent;
    }
    if (!insideFunction) {
      this.warn("'defer' used outside of a function", node.loc);
    }
    if (node.body) {
      if (node.body.type === 'BlockStatement') {
        this.visitBlock(node.body);
      } else {
        this.visitExpression(node.body);
      }
    }
  }
}
