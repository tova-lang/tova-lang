// Tova code formatter — AST-based pretty printer
// Formats Tova source code with consistent style

export class Formatter {
  constructor(options = {}) {
    this.indentSize = options.indentSize || 2;
    this.maxLineLength = options.maxLineLength || 100;
    this.indent = 0;
  }

  i() {
    return ' '.repeat(this.indent * this.indentSize);
  }

  format(ast) {
    if (!ast || ast.type !== 'Program') return '';
    const lines = [];
    let lastType = null;

    for (const node of ast.body) {
      // Blank line between top-level declarations of different types
      if (lastType && this._needsBlankLine(lastType, node.type)) {
        lines.push('');
      }
      lines.push(this.formatNode(node));
      lastType = node.type;
    }

    return lines.join('\n') + '\n';
  }

  _needsBlankLine(prevType, currType) {
    const declTypes = ['FunctionDeclaration', 'TypeDeclaration', 'InterfaceDeclaration',
      'ImplDeclaration', 'TraitDeclaration', 'ServerBlock', 'ClientBlock', 'SharedBlock',
      'ComponentDeclaration', 'TestBlock'];
    return declTypes.includes(prevType) || declTypes.includes(currType);
  }

  formatNode(node) {
    if (!node) return '';

    switch (node.type) {
      case 'Program': return this.format(node);
      case 'Assignment': return this.formatAssignment(node);
      case 'VarDeclaration': return this.formatVarDeclaration(node);
      case 'LetDestructure': return this.formatLetDestructure(node);
      case 'FunctionDeclaration': return this.formatFunctionDeclaration(node);
      case 'TypeDeclaration': return this.formatTypeDeclaration(node);
      case 'TypeAlias': return this.formatTypeAlias(node);
      case 'ImportDeclaration': return this.formatImport(node);
      case 'ImportDefault': return this.formatImportDefault(node);
      case 'IfStatement': return this.formatIfStatement(node);
      case 'ForStatement': return this.formatForStatement(node);
      case 'WhileStatement': return this.formatWhileStatement(node);
      case 'TryCatchStatement': return this.formatTryCatch(node);
      case 'ReturnStatement': return this.formatReturnStatement(node);
      case 'ExpressionStatement': return `${this.i()}${this.formatExpr(node.expression)}`;
      case 'BreakStatement': return `${this.i()}break`;
      case 'ContinueStatement': return `${this.i()}continue`;
      case 'GuardStatement': return this.formatGuardStatement(node);
      case 'InterfaceDeclaration': return this.formatInterfaceDeclaration(node);
      case 'ImplDeclaration': return this.formatImplDeclaration(node);
      case 'TraitDeclaration': return this.formatTraitDeclaration(node);
      case 'DeferStatement': return this.formatDeferStatement(node);
      case 'ServerBlock': return this.formatServerBlock(node);
      case 'ClientBlock': return this.formatClientBlock(node);
      case 'SharedBlock': return this.formatSharedBlock(node);
      case 'CompoundAssignment': return `${this.i()}${this.formatExpr(node.target)} ${node.operator} ${this.formatExpr(node.value)}`;
      case 'BlockStatement': return this.formatBlock(node);
      default:
        return `${this.i()}${this.formatExpr(node)}`;
    }
  }

  formatExpr(node) {
    if (!node) return '';

    switch (node.type) {
      case 'Identifier': return node.name;
      case 'NumberLiteral': return String(node.value);
      case 'StringLiteral': return JSON.stringify(node.value);
      case 'BooleanLiteral': return String(node.value);
      case 'NilLiteral': return 'nil';
      case 'RegexLiteral': return `/${node.pattern}/${node.flags}`;
      case 'TemplateLiteral': return this.formatTemplateLiteral(node);
      case 'BinaryExpression': return `${this.formatExpr(node.left)} ${node.operator} ${this.formatExpr(node.right)}`;
      case 'UnaryExpression': return node.operator === 'not' ? `not ${this.formatExpr(node.operand)}` : `${node.operator}${this.formatExpr(node.operand)}`;
      case 'LogicalExpression': return `${this.formatExpr(node.left)} ${node.operator} ${this.formatExpr(node.right)}`;
      case 'CallExpression': return this.formatCallExpression(node);
      case 'MemberExpression': return node.computed ? `${this.formatExpr(node.object)}[${this.formatExpr(node.property)}]` : `${this.formatExpr(node.object)}.${node.property}`;
      case 'OptionalChain': return `${this.formatExpr(node.object)}?.${node.property}`;
      case 'PipeExpression': return `${this.formatExpr(node.left)} |> ${this.formatExpr(node.right)}`;
      case 'LambdaExpression': return this.formatLambda(node);
      case 'MatchExpression': return this.formatMatchExpression(node);
      case 'IfExpression': return this.formatIfExpression(node);
      case 'ArrayLiteral': return this.formatArrayLiteral(node);
      case 'ObjectLiteral': return this.formatObjectLiteral(node);
      case 'RangeExpression': return `${this.formatExpr(node.start)}${node.inclusive ? '..=' : '..'}${this.formatExpr(node.end)}`;
      case 'SpreadExpression': return `...${this.formatExpr(node.argument)}`;
      case 'PropagateExpression': return `${this.formatExpr(node.expression)}?`;
      case 'AwaitExpression': return `await ${this.formatExpr(node.argument)}`;
      case 'YieldExpression': return node.delegate ? `yield from ${this.formatExpr(node.argument)}` : `yield ${this.formatExpr(node.argument)}`;
      case 'TupleExpression': return `(${node.elements.map(e => this.formatExpr(e)).join(', ')})`;
      case 'NamedArgument': return `${node.name}: ${this.formatExpr(node.value)}`;
      case 'MembershipExpression': return node.negated ? `${this.formatExpr(node.value)} not in ${this.formatExpr(node.collection)}` : `${this.formatExpr(node.value)} in ${this.formatExpr(node.collection)}`;
      default:
        return `/* unknown: ${node.type} */`;
    }
  }

  formatAssignment(node) {
    if (node.targets.length === 1 && node.values.length === 1) {
      return `${this.i()}${node.targets[0]} = ${this.formatExpr(node.values[0])}`;
    }
    const targets = node.targets.join(', ');
    const values = node.values.map(v => this.formatExpr(v)).join(', ');
    return `${this.i()}${targets} = ${values}`;
  }

  formatVarDeclaration(node) {
    if (node.targets.length === 1 && node.values.length === 1) {
      return `${this.i()}var ${node.targets[0]} = ${this.formatExpr(node.values[0])}`;
    }
    const targets = node.targets.join(', ');
    const values = node.values.map(v => this.formatExpr(v)).join(', ');
    return `${this.i()}var ${targets} = ${values}`;
  }

  formatLetDestructure(node) {
    const pattern = this.formatPattern(node.pattern);
    return `${this.i()}let ${pattern} = ${this.formatExpr(node.value)}`;
  }

  formatPattern(pattern) {
    if (!pattern) return '_';
    switch (pattern.type) {
      case 'ObjectPattern': {
        const props = pattern.properties.map(p => {
          let s = p.key;
          if (p.value !== p.key) s += `: ${p.value}`;
          if (p.defaultValue) s += ` = ${this.formatExpr(p.defaultValue)}`;
          return s;
        }).join(', ');
        return `{ ${props} }`;
      }
      case 'ArrayPattern':
        return `[${pattern.elements.map(e => e || '_').join(', ')}]`;
      case 'TuplePattern':
        return `(${pattern.elements.map(e => this.formatPattern(e)).join(', ')})`;
      default:
        return '_';
    }
  }

  formatFunctionDeclaration(node) {
    const asyncPrefix = node.isAsync ? 'async ' : '';
    const pubPrefix = node.isPublic ? 'pub ' : '';
    const params = this.formatParams(node.params);
    const ret = node.returnType ? ` -> ${this.formatTypeAnnotation(node.returnType)}` : '';
    let code = `${this.i()}${pubPrefix}${asyncPrefix}fn ${node.name}(${params})${ret} {\n`;
    this.indent++;
    code += this.formatBlockBody(node.body);
    this.indent--;
    code += `\n${this.i()}}`;
    return code;
  }

  formatParams(params) {
    return params.map(p => {
      if (p.destructure) {
        if (p.destructure.type === 'ObjectPattern') {
          return this.formatPattern(p.destructure);
        }
        if (p.destructure.type === 'ArrayPattern') {
          return this.formatPattern(p.destructure);
        }
      }
      let s = p.name;
      if (p.typeAnnotation) s += `: ${this.formatTypeAnnotation(p.typeAnnotation)}`;
      if (p.defaultValue) s += ` = ${this.formatExpr(p.defaultValue)}`;
      return s;
    }).join(', ');
  }

  formatTypeAnnotation(ta) {
    if (!ta) return 'Any';
    if (ta.type === 'ArrayTypeAnnotation') return `[${this.formatTypeAnnotation(ta.elementType)}]`;
    if (ta.type === 'TupleTypeAnnotation') return `(${ta.elementTypes.map(t => this.formatTypeAnnotation(t)).join(', ')})`;
    let s = ta.name;
    if (ta.typeParams && ta.typeParams.length > 0) {
      s += `<${ta.typeParams.map(t => this.formatTypeAnnotation(t)).join(', ')}>`;
    }
    return s;
  }

  formatBlockBody(block) {
    if (!block) return '';
    if (block.type !== 'BlockStatement') {
      return `${this.i()}${this.formatExpr(block)}`;
    }
    return block.body.map(s => this.formatNode(s)).join('\n');
  }

  formatBlock(node) {
    let code = `${this.i()}{\n`;
    this.indent++;
    code += node.body.map(s => this.formatNode(s)).join('\n');
    this.indent--;
    code += `\n${this.i()}}`;
    return code;
  }

  formatTypeDeclaration(node) {
    const pubPrefix = node.isPublic ? 'pub ' : '';
    const typeParams = node.typeParams && node.typeParams.length > 0
      ? `<${node.typeParams.join(', ')}>` : '';
    let code = `${this.i()}${pubPrefix}type ${node.name}${typeParams} {\n`;
    this.indent++;
    for (const v of node.variants) {
      if (v.type === 'TypeVariant') {
        if (v.fields.length === 0) {
          code += `${this.i()}${v.name}\n`;
        } else {
          const fields = v.fields.map(f => {
            let s = f.name;
            if (f.typeAnnotation) s += `: ${this.formatTypeAnnotation(f.typeAnnotation)}`;
            return s;
          }).join(', ');
          code += `${this.i()}${v.name}(${fields})\n`;
        }
      } else if (v.type === 'TypeField') {
        code += `${this.i()}${v.name}: ${this.formatTypeAnnotation(v.typeAnnotation)}\n`;
      }
    }
    this.indent--;
    code += `${this.i()}}`;
    if (node.derive && node.derive.length > 0) {
      code += ` derive [${node.derive.join(', ')}]`;
    }
    return code;
  }

  formatTypeAlias(node) {
    return `${this.i()}type ${node.name} = ${this.formatTypeAnnotation(node.typeExpr)}`;
  }

  formatImport(node) {
    const specs = node.specifiers.map(s => {
      if (s.imported !== s.local) return `${s.imported} as ${s.local}`;
      return s.imported;
    }).join(', ');
    return `${this.i()}import { ${specs} } from "${node.source}"`;
  }

  formatImportDefault(node) {
    return `${this.i()}import ${node.local} from "${node.source}"`;
  }

  formatIfStatement(node) {
    let code = `${this.i()}if ${this.formatExpr(node.condition)} {\n`;
    this.indent++;
    code += this.formatBlockBody(node.consequent);
    this.indent--;
    code += `\n${this.i()}}`;

    for (const alt of node.alternates) {
      code += ` elif ${this.formatExpr(alt.condition)} {\n`;
      this.indent++;
      code += this.formatBlockBody(alt.body);
      this.indent--;
      code += `\n${this.i()}}`;
    }

    if (node.elseBody) {
      code += ` else {\n`;
      this.indent++;
      code += this.formatBlockBody(node.elseBody);
      this.indent--;
      code += `\n${this.i()}}`;
    }

    return code;
  }

  formatForStatement(node) {
    const vars = Array.isArray(node.variable) ? node.variable.join(', ') : node.variable;
    let code = `${this.i()}for ${vars} in ${this.formatExpr(node.iterable)} {\n`;
    this.indent++;
    code += this.formatBlockBody(node.body);
    this.indent--;
    code += `\n${this.i()}}`;

    if (node.elseBody) {
      code += ` else {\n`;
      this.indent++;
      code += this.formatBlockBody(node.elseBody);
      this.indent--;
      code += `\n${this.i()}}`;
    }

    return code;
  }

  formatWhileStatement(node) {
    let code = `${this.i()}while ${this.formatExpr(node.condition)} {\n`;
    this.indent++;
    code += this.formatBlockBody(node.body);
    this.indent--;
    code += `\n${this.i()}}`;
    return code;
  }

  formatTryCatch(node) {
    let code = `${this.i()}try {\n`;
    this.indent++;
    for (const stmt of node.tryBody) {
      code += this.formatNode(stmt) + '\n';
    }
    this.indent--;

    if (node.catchBody) {
      const param = node.catchParam ? ` ${node.catchParam}` : '';
      code += `${this.i()}} catch${param} {\n`;
      this.indent++;
      for (const stmt of node.catchBody) {
        code += this.formatNode(stmt) + '\n';
      }
      this.indent--;
    }

    if (node.finallyBody) {
      if (!node.catchBody) code += `${this.i()}}`;
      code += ` finally {\n`;
      this.indent++;
      for (const stmt of node.finallyBody) {
        code += this.formatNode(stmt) + '\n';
      }
      this.indent--;
    }

    code += `${this.i()}}`;
    return code;
  }

  formatReturnStatement(node) {
    if (node.value) return `${this.i()}return ${this.formatExpr(node.value)}`;
    return `${this.i()}return`;
  }

  formatGuardStatement(node) {
    let code = `${this.i()}guard ${this.formatExpr(node.condition)} else {\n`;
    this.indent++;
    code += this.formatBlockBody(node.elseBody);
    this.indent--;
    code += `\n${this.i()}}`;
    return code;
  }

  formatInterfaceDeclaration(node) {
    let code = `${this.i()}interface ${node.name} {\n`;
    this.indent++;
    for (const m of node.methods) {
      const params = this.formatParams(m.params);
      const ret = m.returnType ? ` -> ${this.formatTypeAnnotation(m.returnType)}` : '';
      code += `${this.i()}fn ${m.name}(${params})${ret}\n`;
    }
    this.indent--;
    code += `${this.i()}}`;
    return code;
  }

  formatImplDeclaration(node) {
    const traitPart = node.traitName ? `${node.traitName} for ` : '';
    let code = `${this.i()}impl ${traitPart}${node.typeName} {\n`;
    this.indent++;
    for (const method of node.methods) {
      code += this.formatFunctionDeclaration(method) + '\n';
    }
    this.indent--;
    code += `${this.i()}}`;
    return code;
  }

  formatTraitDeclaration(node) {
    let code = `${this.i()}trait ${node.name} {\n`;
    this.indent++;
    for (const m of node.methods) {
      const params = this.formatParams(m.params);
      const ret = m.returnType ? ` -> ${this.formatTypeAnnotation(m.returnType)}` : '';
      if (m.body) {
        code += `${this.i()}fn ${m.name}(${params})${ret} {\n`;
        this.indent++;
        code += this.formatBlockBody(m.body);
        this.indent--;
        code += `\n${this.i()}}\n`;
      } else {
        code += `${this.i()}fn ${m.name}(${params})${ret}\n`;
      }
    }
    this.indent--;
    code += `${this.i()}}`;
    return code;
  }

  formatDeferStatement(node) {
    if (node.body.type === 'BlockStatement') {
      let code = `${this.i()}defer {\n`;
      this.indent++;
      code += this.formatBlockBody(node.body);
      this.indent--;
      code += `\n${this.i()}}`;
      return code;
    }
    return `${this.i()}defer ${this.formatExpr(node.body)}`;
  }

  formatServerBlock(node) {
    const name = node.name ? ` "${node.name}"` : '';
    let code = `${this.i()}server${name} {\n`;
    this.indent++;
    code += node.body.map(s => this.formatNode(s)).join('\n');
    this.indent--;
    code += `\n${this.i()}}`;
    return code;
  }

  formatClientBlock(node) {
    const name = node.name ? ` "${node.name}"` : '';
    let code = `${this.i()}client${name} {\n`;
    this.indent++;
    code += node.body.map(s => this.formatNode(s)).join('\n');
    this.indent--;
    code += `\n${this.i()}}`;
    return code;
  }

  formatSharedBlock(node) {
    const name = node.name ? ` "${node.name}"` : '';
    let code = `${this.i()}shared${name} {\n`;
    this.indent++;
    code += node.body.map(s => this.formatNode(s)).join('\n');
    this.indent--;
    code += `\n${this.i()}}`;
    return code;
  }

  formatCallExpression(node) {
    const callee = this.formatExpr(node.callee);
    const args = node.arguments.map(a => this.formatExpr(a)).join(', ');
    return `${callee}(${args})`;
  }

  formatLambda(node) {
    const asyncPrefix = node.isAsync ? 'async ' : '';
    const params = this.formatParams(node.params);
    if (node.body.type === 'BlockStatement') {
      let code = `${asyncPrefix}fn(${params}) {\n`;
      this.indent++;
      code += this.formatBlockBody(node.body);
      this.indent--;
      code += `\n${this.i()}}`;
      return code;
    }
    return `${asyncPrefix}fn(${params}) ${this.formatExpr(node.body)}`;
  }

  formatMatchExpression(node) {
    let code = `match ${this.formatExpr(node.subject)} {\n`;
    this.indent++;
    for (const arm of node.arms) {
      const pat = this.formatMatchPattern(arm.pattern);
      const guard = arm.guard ? ` if ${this.formatExpr(arm.guard)}` : '';
      if (arm.body.type === 'BlockStatement') {
        code += `${this.i()}${pat}${guard} => {\n`;
        this.indent++;
        code += this.formatBlockBody(arm.body);
        this.indent--;
        code += `\n${this.i()}}\n`;
      } else {
        code += `${this.i()}${pat}${guard} => ${this.formatExpr(arm.body)}\n`;
      }
    }
    this.indent--;
    code += `${this.i()}}`;
    return code;
  }

  formatMatchPattern(pattern) {
    switch (pattern.type) {
      case 'WildcardPattern': return '_';
      case 'LiteralPattern': return JSON.stringify(pattern.value);
      case 'BindingPattern': return pattern.name;
      case 'VariantPattern':
        if (pattern.fields.length === 0) return pattern.name;
        return `${pattern.name}(${pattern.fields.join(', ')})`;
      case 'RangePattern':
        return `${pattern.start}${pattern.inclusive ? '..=' : '..'}${pattern.end}`;
      case 'ArrayPattern':
        return `[${pattern.elements.map(e => this.formatMatchPattern(e)).join(', ')}]`;
      case 'TuplePattern':
        return `(${pattern.elements.map(e => this.formatMatchPattern(e)).join(', ')})`;
      case 'StringConcatPattern':
        return `${JSON.stringify(pattern.prefix)} ++ ${this.formatMatchPattern(pattern.rest)}`;
      default:
        return '_';
    }
  }

  formatIfExpression(node) {
    let code = `if ${this.formatExpr(node.condition)} {\n`;
    this.indent++;
    code += this.formatBlockBody(node.consequent);
    this.indent--;
    code += `\n${this.i()}}`;
    for (const alt of node.alternates) {
      code += ` elif ${this.formatExpr(alt.condition)} {\n`;
      this.indent++;
      code += this.formatBlockBody(alt.body);
      this.indent--;
      code += `\n${this.i()}}`;
    }
    code += ` else {\n`;
    this.indent++;
    code += this.formatBlockBody(node.elseBody);
    this.indent--;
    code += `\n${this.i()}}`;
    return code;
  }

  formatArrayLiteral(node) {
    if (node.elements.length === 0) return '[]';
    const inner = node.elements.map(e => this.formatExpr(e)).join(', ');
    if (inner.length > this.maxLineLength - this.indent * this.indentSize - 2) {
      // Multi-line array
      this.indent++;
      const lines = node.elements.map(e => `${this.i()}${this.formatExpr(e)}`).join(',\n');
      this.indent--;
      return `[\n${lines}\n${this.i()}]`;
    }
    return `[${inner}]`;
  }

  formatObjectLiteral(node) {
    if (node.properties.length === 0) return '{}';
    const props = node.properties.map(p => {
      if (p.shorthand) return this.formatExpr(p.key);
      return `${this.formatExpr(p.key)}: ${this.formatExpr(p.value)}`;
    }).join(', ');
    return `{ ${props} }`;
  }

  formatTemplateLiteral(node) {
    const parts = node.parts.map(p => {
      if (p.type === 'text') return p.value;
      return `{${this.formatExpr(p.value)}}`;
    }).join('');
    return `"${parts}"`;
  }
}
