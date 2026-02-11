// Base code generation utilities shared across all codegen targets

export class BaseCodegen {
  constructor() {
    this.indent = 0;
  }

  i() {
    return '  '.repeat(this.indent);
  }

  generateStatement(node) {
    if (!node) return '';

    switch (node.type) {
      case 'Assignment': return this.genAssignment(node);
      case 'VarDeclaration': return this.genVarDeclaration(node);
      case 'LetDestructure': return this.genLetDestructure(node);
      case 'FunctionDeclaration': return this.genFunctionDeclaration(node);
      case 'TypeDeclaration': return this.genTypeDeclaration(node);
      case 'ImportDeclaration': return this.genImport(node);
      case 'ImportDefault': return this.genImportDefault(node);
      case 'IfStatement': return this.genIfStatement(node);
      case 'ForStatement': return this.genForStatement(node);
      case 'WhileStatement': return this.genWhileStatement(node);
      case 'ReturnStatement': return this.genReturnStatement(node);
      case 'ExpressionStatement': return `${this.i()}${this.genExpression(node.expression)};`;
      case 'BlockStatement': return this.genBlock(node);
      case 'CompoundAssignment': return this.genCompoundAssignment(node);
      default:
        return `${this.i()}${this.genExpression(node)};`;
    }
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
      case 'ArrayLiteral': return this.genArrayLiteral(node);
      case 'ObjectLiteral': return this.genObjectLiteral(node);
      case 'ListComprehension': return this.genListComprehension(node);
      case 'DictComprehension': return this.genDictComprehension(node);
      case 'RangeExpression': return this.genRangeExpression(node);
      case 'SliceExpression': return this.genSliceExpression(node);
      case 'SpreadExpression': return `...${this.genExpression(node.argument)}`;
      case 'NamedArgument': return this.genExpression(node.value);
      default:
        return `/* unknown: ${node.type} */`;
    }
  }

  // ─── Statements ───────────────────────────────────────────

  genAssignment(node) {
    if (node.targets.length === 1 && node.values.length === 1) {
      return `${this.i()}const ${node.targets[0]} = ${this.genExpression(node.values[0])};`;
    }
    // Multiple assignment: a, b = 1, 2
    const lines = [];
    for (let idx = 0; idx < node.targets.length; idx++) {
      const val = idx < node.values.length ? node.values[idx] : node.values[node.values.length - 1];
      lines.push(`${this.i()}const ${node.targets[idx]} = ${this.genExpression(val)};`);
    }
    return lines.join('\n');
  }

  genVarDeclaration(node) {
    if (node.targets.length === 1 && node.values.length === 1) {
      return `${this.i()}let ${node.targets[0]} = ${this.genExpression(node.values[0])};`;
    }
    const lines = [];
    for (let idx = 0; idx < node.targets.length; idx++) {
      const val = idx < node.values.length ? node.values[idx] : node.values[node.values.length - 1];
      lines.push(`${this.i()}let ${node.targets[idx]} = ${this.genExpression(val)};`);
    }
    return lines.join('\n');
  }

  genLetDestructure(node) {
    if (node.pattern.type === 'ObjectPattern') {
      const props = node.pattern.properties.map(p => {
        let str = p.key;
        if (p.value !== p.key) str += `: ${p.value}`;
        if (p.defaultValue) str += ` = ${this.genExpression(p.defaultValue)}`;
        return str;
      }).join(', ');
      return `${this.i()}const { ${props} } = ${this.genExpression(node.value)};`;
    }
    if (node.pattern.type === 'ArrayPattern') {
      const els = node.pattern.elements.map(e => e || '').join(', ');
      return `${this.i()}const [${els}] = ${this.genExpression(node.value)};`;
    }
    return '';
  }

  genFunctionDeclaration(node) {
    const params = this.genParams(node.params);
    const body = this.genBlockBody(node.body);
    return `${this.i()}function ${node.name}(${params}) {\n${body}\n${this.i()}}`;
  }

  genParams(params) {
    return params.map(p => {
      if (p.defaultValue) {
        return `${p.name} = ${this.genExpression(p.defaultValue)}`;
      }
      return p.name;
    }).join(', ');
  }

  genTypeDeclaration(node) {
    const lines = [];

    // Check if it's a struct-like type (all TypeField) or an enum (TypeVariant)
    const hasVariants = node.variants.some(v => v.type === 'TypeVariant');

    if (hasVariants) {
      // Generate as tagged union factory functions
      for (const variant of node.variants) {
        if (variant.type === 'TypeVariant') {
          if (variant.fields.length === 0) {
            lines.push(`${this.i()}const ${variant.name} = Object.freeze({ __tag: "${variant.name}" });`);
          } else {
            const fieldNames = variant.fields.map(f => f.name);
            const params = fieldNames.join(', ');
            const obj = fieldNames.map(f => `${f}`).join(', ');
            lines.push(`${this.i()}function ${variant.name}(${params}) { return Object.freeze({ __tag: "${variant.name}", ${obj} }); }`);
          }
        }
      }
    } else {
      // Struct-like: generate a constructor function
      const fieldNames = node.variants.map(f => f.name);
      const params = fieldNames.join(', ');
      const obj = fieldNames.map(f => `${f}`).join(', ');
      lines.push(`${this.i()}function ${node.name}(${params}) { return { ${obj} }; }`);
    }

    return lines.join('\n');
  }

  genImport(node) {
    const specs = node.specifiers.map(s => {
      if (s.imported !== s.local) return `${s.imported} as ${s.local}`;
      return s.imported;
    }).join(', ');
    return `${this.i()}import { ${specs} } from ${JSON.stringify(node.source)};`;
  }

  genImportDefault(node) {
    return `${this.i()}import ${node.local} from ${JSON.stringify(node.source)};`;
  }

  genIfStatement(node) {
    let code = `${this.i()}if (${this.genExpression(node.condition)}) {\n`;
    this.indent++;
    code += this.genBlockStatements(node.consequent);
    this.indent--;
    code += `\n${this.i()}}`;

    for (const alt of node.alternates) {
      code += ` else if (${this.genExpression(alt.condition)}) {\n`;
      this.indent++;
      code += this.genBlockStatements(alt.body);
      this.indent--;
      code += `\n${this.i()}}`;
    }

    if (node.elseBody) {
      code += ` else {\n`;
      this.indent++;
      code += this.genBlockStatements(node.elseBody);
      this.indent--;
      code += `\n${this.i()}}`;
    }

    return code;
  }

  genForStatement(node) {
    const vars = Array.isArray(node.variable) ? node.variable : [node.variable];
    const iterExpr = this.genExpression(node.iterable);

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

    if (node.elseBody) {
      // for-else: run else if iterable was empty
      const tempVar = `__iter_${Date.now() % 10000}`;
      const wrappedCode = `${this.i()}{\n`;
      this.indent++;
      const inner = `${this.i()}const ${tempVar} = ${iterExpr};\n` +
        `${this.i()}let __entered = false;\n` +
        (vars.length === 2
          ? `${this.i()}for (const [${vars[0]}, ${vars[1]}] of ${tempVar}) {\n`
          : `${this.i()}for (const ${vars[0]} of ${tempVar}) {\n`);
      this.indent++;
      const bodyCode = `${this.i()}__entered = true;\n` + this.genBlockStatements(node.body);
      this.indent--;
      const elseCode = `\n${this.i()}}\n${this.i()}if (!__entered) {\n`;
      this.indent++;
      const elseBody = this.genBlockStatements(node.elseBody);
      this.indent--;

      return wrappedCode + inner + bodyCode + elseCode + elseBody + `\n${this.i()}}\n` + `${this.i().slice(2)}}`;
    }

    return code;
  }

  genWhileStatement(node) {
    let code = `${this.i()}while (${this.genExpression(node.condition)}) {\n`;
    this.indent++;
    code += this.genBlockStatements(node.body);
    this.indent--;
    code += `\n${this.i()}}`;
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
    code += this.genBlockStatements(node);
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
      // Implicit return: last expression in function body
      if (idx === stmts.length - 1 && stmt.type === 'ExpressionStatement') {
        lines.push(`${this.i()}return ${this.genExpression(stmt.expression)};`);
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
    if (node.negated) {
      return `(!${col}.includes(${val}))`;
    }
    return `${col}.includes(${val})`;
  }

  genCallExpression(node) {
    const callee = this.genExpression(node.callee);
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

    // If right is a call expression, insert left as the first argument
    if (right.type === 'CallExpression') {
      const callee = this.genExpression(right.callee);
      const args = [left, ...right.arguments.map(a => this.genExpression(a))].join(', ');
      return `${callee}(${args})`;
    }
    // If right is an identifier, call it with left as argument
    if (right.type === 'Identifier') {
      return `${right.name}(${left})`;
    }
    // Fallback
    return `(${this.genExpression(right)})(${left})`;
  }

  genLambdaExpression(node) {
    const params = this.genParams(node.params);

    if (node.body.type === 'BlockStatement') {
      const body = this.genBlockBody(node.body);
      return `(${params}) => {\n${body}\n${this.i()}}`;
    }

    // Statement bodies (compound assignment, assignment in lambda)
    if (node.body.type === 'CompoundAssignment' || node.body.type === 'Assignment' || node.body.type === 'VarDeclaration') {
      this.indent++;
      const stmt = this.generateStatement(node.body);
      this.indent--;
      return `(${params}) => { ${stmt.trim()} }`;
    }

    return `(${params}) => ${this.genExpression(node.body)}`;
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
      case 'VariantPattern':
        return pattern.fields.map(f =>
          `${this.i()}const ${f} = ${subject}.${f};\n`
        ).join('');
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
      return `((a, s, e, st) => { const r = []; for(let i = s || 0; i < (e || a.length); i += st) r.push(a[i]); return r; })(${obj}, ${start || '0'}, ${end || `${obj}.length`}, ${step})`;
    }

    if (!start && !end) return `${obj}.slice()`;
    if (!start) return `${obj}.slice(0, ${end})`;
    if (!end) return `${obj}.slice(${start})`;
    return `${obj}.slice(${start}, ${end})`;
  }
}
