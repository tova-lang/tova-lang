// Base code generation utilities shared across all codegen targets
import { RESULT_OPTION, PROPAGATE, STRING_PROTO } from '../stdlib/inline.js';

export class BaseCodegen {
  constructor() {
    this.indent = 0;
    this._counter = 0;
    this._scopes = [new Set()]; // scope stack for tracking declared variables
    this._needsContainsHelper = false; // track if __contains helper is needed
    this._needsPropagateHelper = false; // track if __propagate helper is needed
    this._variantFields = { 'Ok': ['value'], 'Err': ['error'], 'Some': ['value'] }; // map variant name -> [field names] for pattern destructuring
    // Source map tracking
    this._sourceMappings = []; // {sourceLine, sourceCol, outputLine, outputCol}
    this._outputLineCount = 0;
  }

  _uid() {
    return this._counter++;
  }

  // ─── Scope tracking ─────────────────────────────────────────

  pushScope() {
    this._scopes.push(new Set());
  }

  popScope() {
    this._scopes.pop();
  }

  declareVar(name) {
    this._scopes[this._scopes.length - 1].add(name);
  }

  isDeclared(name) {
    for (let i = this._scopes.length - 1; i >= 0; i--) {
      if (this._scopes[i].has(name)) return true;
    }
    return false;
  }

  // ─── Helpers ────────────────────────────────────────────────

  i() {
    return '  '.repeat(this.indent);
  }

  // Source map: record a mapping from source location to output line
  _addMapping(node, outputLine) {
    if (node && node.loc && node.loc.line) {
      this._sourceMappings.push({
        sourceLine: node.loc.line - 1, // 0-based
        sourceCol: (node.loc.column || 1) - 1, // 0-based
        outputLine,
        outputCol: this.indent * 2, // approximate column from indent
      });
    }
  }

  // Get collected source mappings
  getSourceMappings() {
    return this._sourceMappings;
  }

  getContainsHelper() {
    return 'function __contains(col, val) {\n' +
      '  if (Array.isArray(col) || typeof col === \'string\') return col.includes(val);\n' +
      '  if (col instanceof Set || col instanceof Map) return col.has(val);\n' +
      '  if (typeof col === \'object\' && col !== null) return val in col;\n' +
      '  return false;\n' +
      '}';
  }

  genPropagateExpression(node) {
    this._needsPropagateHelper = true;
    return `__propagate(${this.genExpression(node.expression)})`;
  }

  _containsPropagate(node) {
    if (!node) return false;
    if (node.type === 'PropagateExpression') return true;
    // Stop at nested function/lambda boundaries — they get their own wrapper
    if (node.type === 'FunctionDeclaration' || node.type === 'LambdaExpression') return false;
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'type') continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && this._containsPropagate(item)) return true;
        }
      } else if (val && typeof val === 'object' && val.type) {
        if (this._containsPropagate(val)) return true;
      }
    }
    return false;
  }

  getPropagateHelper() {
    return PROPAGATE;
  }

  getResultOptionHelper() {
    return RESULT_OPTION;
  }

  getStringProtoHelper() {
    return STRING_PROTO;
  }

  generateStatement(node) {
    if (!node) return '';

    // Record source mapping before generating
    this._addMapping(node, this._outputLineCount);

    let result;
    switch (node.type) {
      case 'Assignment': result = this.genAssignment(node); break;
      case 'VarDeclaration': result = this.genVarDeclaration(node); break;
      case 'LetDestructure': result = this.genLetDestructure(node); break;
      case 'FunctionDeclaration': result = this.genFunctionDeclaration(node); break;
      case 'TypeDeclaration': result = this.genTypeDeclaration(node); break;
      case 'ImportDeclaration': result = this.genImport(node); break;
      case 'ImportDefault': result = this.genImportDefault(node); break;
      case 'IfStatement': result = this.genIfStatement(node); break;
      case 'ForStatement': result = this.genForStatement(node); break;
      case 'WhileStatement': result = this.genWhileStatement(node); break;
      case 'TryCatchStatement': result = this.genTryCatchStatement(node); break;
      case 'ReturnStatement': result = this.genReturnStatement(node); break;
      case 'ExpressionStatement': result = `${this.i()}${this.genExpression(node.expression)};`; break;
      case 'BlockStatement': result = this.genBlock(node); break;
      case 'CompoundAssignment': result = this.genCompoundAssignment(node); break;
      case 'BreakStatement': result = `${this.i()}break;`; break;
      case 'ContinueStatement': result = `${this.i()}continue;`; break;
      case 'GuardStatement': result = this.genGuardStatement(node); break;
      case 'InterfaceDeclaration': result = this.genInterfaceDeclaration(node); break;
      default:
        result = `${this.i()}${this.genExpression(node)};`;
    }

    // Track output line count
    if (result) {
      const newlines = result.split('\n').length - 1;
      this._outputLineCount += newlines + 1; // +1 for the line itself (join with \n)
    }

    return result;
  }

  genExpression(node) {
    if (!node) return 'undefined';

    switch (node.type) {
      case 'Identifier': return node.name === '_' ? '_' : node.name;
      case 'NumberLiteral': return String(node.value);
      case 'StringLiteral': return JSON.stringify(node.value);
      case 'BooleanLiteral': return String(node.value);
      case 'NilLiteral': return 'null';
      case 'TemplateLiteral': return this.genTemplateLiteral(node);
      case 'BinaryExpression': return this.genBinaryExpression(node);
      case 'UnaryExpression': return this.genUnaryExpression(node);
      case 'LogicalExpression': return this.genLogicalExpression(node);
      case 'ChainedComparison': return this.genChainedComparison(node);
      case 'MembershipExpression': return this.genMembershipExpression(node);
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
      default:
        return `/* unknown: ${node.type} */`;
    }
  }

  // ─── Statements ───────────────────────────────────────────

  genAssignment(node) {
    if (node.targets.length === 1 && node.values.length === 1) {
      const target = node.targets[0];
      if (target === '_') {
        return `${this.i()}${this.genExpression(node.values[0])};`;
      }
      if (this.isDeclared(target)) {
        // Reassignment to an already-declared variable (must be mutable)
        return `${this.i()}${target} = ${this.genExpression(node.values[0])};`;
      }
      this.declareVar(target);
      return `${this.i()}const ${target} = ${this.genExpression(node.values[0])};`;
    }

    // Multiple assignment: a, b = 1, 2 (uses destructuring for atomicity)
    const vals = node.values.map(v => this.genExpression(v));
    const allDeclared = node.targets.every(t => this.isDeclared(t));

    if (allDeclared) {
      // Reassignment (e.g., swap): [a, b] = [v1, v2]
      return `${this.i()}[${node.targets.join(', ')}] = [${vals.join(', ')}];`;
    }

    // New declarations: const [a, b] = [v1, v2]
    for (const t of node.targets) this.declareVar(t);
    return `${this.i()}const [${node.targets.join(', ')}] = [${vals.join(', ')}];`;
  }

  genVarDeclaration(node) {
    if (node.targets.length === 1 && node.values.length === 1) {
      this.declareVar(node.targets[0]);
      return `${this.i()}let ${node.targets[0]} = ${this.genExpression(node.values[0])};`;
    }
    const lines = [];
    for (let idx = 0; idx < node.targets.length; idx++) {
      this.declareVar(node.targets[idx]);
      const val = idx < node.values.length ? node.values[idx] : node.values[node.values.length - 1];
      lines.push(`${this.i()}let ${node.targets[idx]} = ${this.genExpression(val)};`);
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
    if (node.pattern.type === 'ArrayPattern') {
      for (const e of node.pattern.elements) if (e) this.declareVar(e);
      const els = node.pattern.elements.map(e => e || '').join(', ');
      return `${this.i()}const [${els}] = ${this.genExpression(node.value)};`;
    }
    return '';
  }

  genFunctionDeclaration(node) {
    const params = this.genParams(node.params);
    const hasPropagate = this._containsPropagate(node.body);
    const asyncPrefix = node.isAsync ? 'async ' : '';
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
    if (hasPropagate) {
      return `${this.i()}${asyncPrefix}function ${node.name}(${params}) {\n${this.i()}  try {\n${body}\n${this.i()}  } catch (__e) {\n${this.i()}    if (__e && __e.__lux_propagate) return __e.value;\n${this.i()}    throw __e;\n${this.i()}  }\n${this.i()}}`;
    }
    return `${this.i()}${asyncPrefix}function ${node.name}(${params}) {\n${body}\n${this.i()}}`;
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
        if (p.destructure.type === 'ArrayPattern') {
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

  genIfStatement(node) {
    let code = `${this.i()}if (${this.genExpression(node.condition)}) {\n`;
    this.indent++;
    this.pushScope();
    code += this.genBlockStatements(node.consequent);
    this.popScope();
    this.indent--;
    code += `\n${this.i()}}`;

    for (const alt of node.alternates) {
      code += ` else if (${this.genExpression(alt.condition)}) {\n`;
      this.indent++;
      this.pushScope();
      code += this.genBlockStatements(alt.body);
      this.popScope();
      this.indent--;
      code += `\n${this.i()}}`;
    }

    if (node.elseBody) {
      code += ` else {\n`;
      this.indent++;
      this.pushScope();
      code += this.genBlockStatements(node.elseBody);
      this.popScope();
      this.indent--;
      code += `\n${this.i()}}`;
    }

    return code;
  }

  genForStatement(node) {
    const vars = Array.isArray(node.variable) ? node.variable : [node.variable];
    const iterExpr = this.genExpression(node.iterable);

    if (node.elseBody) {
      // for-else: run else if iterable was empty
      const tempVar = `__iter_${this._uid()}`;
      let code = `${this.i()}{\n`;
      this.indent++;
      code += `${this.i()}const ${tempVar} = ${iterExpr};\n`;
      code += `${this.i()}let __entered = false;\n`;
      this.pushScope();
      for (const v of vars) this.declareVar(v);
      if (vars.length === 2) {
        code += `${this.i()}for (const [${vars[0]}, ${vars[1]}] of ${tempVar}) {\n`;
      } else {
        code += `${this.i()}for (const ${vars[0]} of ${tempVar}) {\n`;
      }
      this.indent++;
      code += `${this.i()}__entered = true;\n`;
      code += this.genBlockStatements(node.body);
      this.indent--;
      code += `\n${this.i()}}\n`;
      this.popScope();
      this.pushScope();
      code += `${this.i()}if (!__entered) {\n`;
      this.indent++;
      code += this.genBlockStatements(node.elseBody);
      this.indent--;
      code += `\n${this.i()}}\n`;
      this.popScope();
      this.indent--;
      code += `${this.i()}}`;
      return code;
    }

    this.pushScope();
    for (const v of vars) this.declareVar(v);
    let code;
    if (vars.length === 2) {
      code = `${this.i()}for (const [${vars[0]}, ${vars[1]}] of ${iterExpr}) {\n`;
    } else {
      code = `${this.i()}for (const ${vars[0]} of ${iterExpr}) {\n`;
    }
    this.indent++;
    code += this.genBlockStatements(node.body);
    this.indent--;
    code += `\n${this.i()}}`;
    this.popScope();

    return code;
  }

  genWhileStatement(node) {
    let code = `${this.i()}while (${this.genExpression(node.condition)}) {\n`;
    this.indent++;
    this.pushScope();
    code += this.genBlockStatements(node.body);
    this.popScope();
    this.indent--;
    code += `\n${this.i()}}`;
    return code;
  }

  genTryCatchStatement(node) {
    let code = `${this.i()}try {\n`;
    this.indent++;
    this.pushScope();
    for (const stmt of node.tryBody) {
      code += this.generateStatement(stmt) + '\n';
    }
    this.popScope();
    this.indent--;

    if (node.catchBody) {
      code += `${this.i()}} catch`;
      if (node.catchParam) {
        code += ` (${node.catchParam})`;
        this.pushScope();
        this.declareVar(node.catchParam);
      } else {
        code += ' (__err)';
        this.pushScope();
      }
      code += ` {\n`;
      this.indent++;
      for (const stmt of node.catchBody) {
        code += this.generateStatement(stmt) + '\n';
      }
      this.popScope();
      this.indent--;
      code += `${this.i()}}`;
    }

    if (node.finallyBody) {
      if (!node.catchBody) {
        // try/finally without catch
        code += `${this.i()}}`;
      }
      code += ` finally {\n`;
      this.indent++;
      this.pushScope();
      for (const stmt of node.finallyBody) {
        code += this.generateStatement(stmt) + '\n';
      }
      this.popScope();
      this.indent--;
      code += `${this.i()}}`;
    }

    return code;
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
    let code = `{\n`;
    this.indent++;
    this.pushScope();
    code += this.genBlockStatements(node);
    this.popScope();
    this.indent--;
    code += `\n${this.i()}}`;
    return code;
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
    const lines = [];
    for (let idx = 0; idx < stmts.length; idx++) {
      const stmt = stmts[idx];
      const isLast = idx === stmts.length - 1;
      // Implicit return: last expression in function body
      if (isLast && stmt.type === 'ExpressionStatement') {
        lines.push(`${this.i()}return ${this.genExpression(stmt.expression)};`);
      } else if (isLast && stmt.type === 'IfStatement' && stmt.elseBody) {
        // If the last statement is an if/elif/else chain, add returns to each branch
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

  _genIfStatementWithReturns(node) {
    let code = `${this.i()}if (${this.genExpression(node.condition)}) {\n`;
    code += this._genBlockBodyReturns(node.consequent);
    code += `\n${this.i()}}`;

    for (const alt of node.alternates) {
      code += ` else if (${this.genExpression(alt.condition)}) {\n`;
      code += this._genBlockBodyReturns(alt.body);
      code += `\n${this.i()}}`;
    }

    if (node.elseBody) {
      code += ` else {\n`;
      code += this._genBlockBodyReturns(node.elseBody);
      code += `\n${this.i()}}`;
    }

    return code;
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
      } else {
        lines.push(this.generateStatement(stmt));
      }
    }
    this.indent--;
    return lines.join('\n');
  }

  genBlockStatements(block) {
    if (!block) return '';
    const stmts = block.type === 'BlockStatement' ? block.body : [block];
    return stmts.map(s => this.generateStatement(s)).join('\n');
  }

  // ─── Expressions ──────────────────────────────────────────

  genTemplateLiteral(node) {
    const parts = node.parts.map(p => {
      if (p.type === 'text') {
        return p.value.replace(/`/g, '\\`').replace(/\$/g, '\\$');
      }
      return `\${${this.genExpression(p.value)}}`;
    }).join('');
    return `\`${parts}\``;
  }

  genBinaryExpression(node) {
    const left = this.genExpression(node.left);
    const right = this.genExpression(node.right);
    const op = node.operator;

    // String multiply: "ha" * 3 => "ha".repeat(3)
    if (op === '*' &&
      (node.left.type === 'StringLiteral' || node.left.type === 'TemplateLiteral')) {
      return `${left}.repeat(${right})`;
    }

    // Lux ?? is NaN-safe: catches null, undefined, AND NaN
    if (op === '??') {
      return `((__lux_v) => __lux_v != null && __lux_v === __lux_v ? __lux_v : ${right})(${left})`;
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
    // a < b < c => (a < b) && (b < c)
    const parts = [];
    for (let idx = 0; idx < node.operators.length; idx++) {
      const left = this.genExpression(node.operands[idx]);
      const right = this.genExpression(node.operands[idx + 1]);
      parts.push(`(${left} ${node.operators[idx]} ${right})`);
    }
    return `(${parts.join(' && ')})`;
  }

  genMembershipExpression(node) {
    const val = this.genExpression(node.value);
    const col = this.genExpression(node.collection);
    this._needsContainsHelper = true;
    if (node.negated) {
      return `(!__contains(${col}, ${val}))`;
    }
    return `__contains(${col}, ${val})`;
  }

  genCallExpression(node) {
    // Transform Foo.new(...) → new Foo(...)
    if (node.callee.type === 'MemberExpression' && !node.callee.computed && node.callee.property === 'new') {
      const obj = this.genExpression(node.callee.object);
      const args = node.arguments.map(a => this.genExpression(a)).join(', ');
      return `new ${obj}(${args})`;
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

  genMemberExpression(node) {
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
        right.callee.object.type === 'Identifier' && right.callee.object.name === '') {
      // This is the .method() case - handled through special MemberExpression with empty object
      const method = right.callee.property;
      const args = right.arguments.map(a => this.genExpression(a)).join(', ');
      return `${left}.${method}(${args})`;
    }

    // If right is a call expression, check for placeholder _ or insert as first arg
    if (right.type === 'CallExpression') {
      const hasPlaceholder = right.arguments.some(a => a.type === 'Identifier' && a.name === '_');
      if (hasPlaceholder) {
        // Replace _ placeholder with left value
        const callee = this.genExpression(right.callee);
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
    if (right.type === 'MemberExpression' && right.object.type === 'Identifier' && right.object.name === '') {
      return `${left}.${right.property}`;
    }
    // Fallback
    return `(${this.genExpression(right)})(${left})`;
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
        return `${asyncPrefix}(${params}) => {\n${this.i()}  try {\n${body}\n${this.i()}  } catch (__e) {\n${this.i()}    if (__e && __e.__lux_propagate) return __e.value;\n${this.i()}    throw __e;\n${this.i()}  }\n${this.i()}}`;
      }
      return `${asyncPrefix}(${params}) => {\n${body}\n${this.i()}}`;
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
      return `${asyncPrefix}(${params}) => { try { return ${this.genExpression(node.body)}; } catch (__e) { if (__e && __e.__lux_propagate) return __e.value; throw __e; } }`;
    }
    return `${asyncPrefix}(${params}) => ${this.genExpression(node.body)}`;
  }

  genMatchExpression(node) {
    // Generate as IIFE with if-else chain
    const subject = this.genExpression(node.subject);
    const tempVar = '__match';

    let code = `((${tempVar}) => {\n`;
    this.indent++;

    for (let idx = 0; idx < node.arms.length; idx++) {
      const arm = node.arms[idx];
      const condition = this.genPatternCondition(arm.pattern, tempVar, arm.guard);

      if (arm.pattern.type === 'WildcardPattern' || arm.pattern.type === 'BindingPattern') {
        if (idx === node.arms.length - 1 && !arm.guard) {
          // Default case
          if (arm.pattern.type === 'BindingPattern') {
            code += `${this.i()}const ${arm.pattern.name} = ${tempVar};\n`;
          }
          if (arm.body.type === 'BlockStatement') {
            code += this.genBlockStatements(arm.body) + '\n';
          } else {
            code += `${this.i()}return ${this.genExpression(arm.body)};\n`;
          }
          break;
        }
      }

      const keyword = idx === 0 ? 'if' : 'else if';
      code += `${this.i()}${keyword} (${condition}) {\n`;
      this.indent++;

      // Bind variables from pattern
      code += this.genPatternBindings(arm.pattern, tempVar);

      if (arm.body.type === 'BlockStatement') {
        code += this.genBlockStatements(arm.body) + '\n';
      } else {
        code += `${this.i()}return ${this.genExpression(arm.body)};\n`;
      }
      this.indent--;
      code += `${this.i()}}\n`;
    }

    this.indent--;
    code += `${this.i()}})(${subject})`;
    return code;
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

    // Full IIFE for multi-statement branches
    let code = `(() => {\n`;
    this.indent++;

    code += `${this.i()}if (${this.genExpression(node.condition)}) {\n`;
    code += this.genBlockBody(node.consequent);
    code += `\n${this.i()}}`;

    for (const alt of node.alternates) {
      code += ` else if (${this.genExpression(alt.condition)}) {\n`;
      code += this.genBlockBody(alt.body);
      code += `\n${this.i()}}`;
    }

    code += ` else {\n`;
    code += this.genBlockBody(node.elseBody);
    code += `\n${this.i()}}`;

    this.indent--;
    code += `\n${this.i()}})()`;
    return code;
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
      case 'VariantPattern':
        cond = `${subject}?.__tag === "${pattern.name}"`;
        break;
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
          // Use the actual declared field name for property access
          const propName = declaredFields[idx] || f;
          return `${this.i()}const ${f} = ${subject}.${propName};\n`;
        }).join('');
      }
      case 'ArrayPattern':
        return pattern.elements.map((el, idx) => {
          if (el.type === 'BindingPattern') {
            return `${this.i()}const ${el.name} = ${subject}[${idx}];\n`;
          }
          return this.genPatternBindings(el, `${subject}[${idx}]`);
        }).filter(s => s).join('');
      case 'StringConcatPattern':
        if (pattern.rest.type === 'BindingPattern') {
          return `${this.i()}const ${pattern.rest.name} = ${subject}.slice(${pattern.prefix.length});\n`;
        }
        return '';
      default:
        return '';
    }
  }

  genArrayLiteral(node) {
    const elements = node.elements.map(e => this.genExpression(e)).join(', ');
    return `[${elements}]`;
  }

  genObjectLiteral(node) {
    const props = node.properties.map(p => {
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
      return `${iter}.filter((${varName}) => ${cond}).map((${varName}) => ${expr})`;
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
    if (node.inclusive) {
      return `Array.from({length: ${end} - ${start} + 1}, (_, i) => ${start} + i)`;
    }
    return `Array.from({length: ${end} - ${start}}, (_, i) => ${start} + i)`;
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
    let code = `${this.i()}if (!(${this.genExpression(node.condition)})) {\n`;
    this.indent++;
    this.pushScope();
    code += this.genBlockStatements(node.elseBody);
    this.popScope();
    this.indent--;
    code += `\n${this.i()}}`;
    return code;
  }

  genInterfaceDeclaration(node) {
    // Interfaces are compile-time only — generate as a documentation comment
    const methods = node.methods.map(m => {
      const params = m.params.map(p => {
        let s = p.name;
        if (p.typeAnnotation) s += `: ${p.typeAnnotation.name || 'any'}`;
        return s;
      }).join(', ');
      const ret = m.returnType ? ` -> ${m.returnType.name || 'any'}` : '';
      return `${this.i()} *   fn ${m.name}(${params})${ret}`;
    }).join('\n');
    return `${this.i()}/* interface ${node.name} {\n${methods}\n${this.i()} * } */`;
  }

  genTypeDeclaration(node) {
    const lines = [];

    const hasVariants = node.variants.some(v => v.type === 'TypeVariant');

    if (hasVariants) {
      for (const variant of node.variants) {
        if (variant.type === 'TypeVariant') {
          this.declareVar(variant.name);
          const fieldNames = variant.fields.map(f => f.name);
          this._variantFields[variant.name] = fieldNames;
          if (variant.fields.length === 0) {
            lines.push(`${this.i()}const ${variant.name} = Object.freeze({ __tag: "${variant.name}" });`);
          } else {
            const params = fieldNames.join(', ');
            const obj = fieldNames.map(f => `${f}`).join(', ');
            lines.push(`${this.i()}function ${variant.name}(${params}) { return Object.freeze({ __tag: "${variant.name}", ${obj} }); }`);
          }
        }
      }
    } else {
      this.declareVar(node.name);
      const fieldNames = node.variants.map(f => f.name);
      const params = fieldNames.join(', ');
      const obj = fieldNames.map(f => `${f}`).join(', ');
      lines.push(`${this.i()}function ${node.name}(${params}) { return { ${obj} }; }`);
    }

    // Derive clause: generate methods
    if (node.derive && node.derive.length > 0) {
      const targetName = hasVariants ? null : node.name;
      const fieldNames = hasVariants ? [] : node.variants.map(f => f.name);

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
      }

      // For variant types with derive
      if (hasVariants) {
        for (const trait of node.derive) {
          if (trait === 'Eq') {
            lines.push(`${this.i()}function __eq_${node.name}(a, b) { return a.__tag === b.__tag && JSON.stringify(a) === JSON.stringify(b); }`);
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
}
