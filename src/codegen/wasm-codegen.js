// WASM binary code generator for @wasm-annotated Tova functions
// Compiles a subset of Tova (numeric types, control flow, recursion) to WebAssembly binary format
// No external dependencies — generates WASM binary directly

// WASM type constants
const I32 = 0x7F;
const I64 = 0x7E;
const F64 = 0x7C;
const VOID = 0x40;
const FUNC_TYPE = 0x60;

// WASM section IDs
const SEC_TYPE = 1;
const SEC_FUNCTION = 3;
const SEC_EXPORT = 7;
const SEC_CODE = 10;

// WASM opcodes
const OP = {
  unreachable: 0x00,
  nop: 0x01,
  block: 0x02,
  loop: 0x03,
  if: 0x04,
  else: 0x05,
  end: 0x0B,
  br: 0x0C,
  br_if: 0x0D,
  return: 0x0F,
  call: 0x10,
  drop: 0x1A,
  select: 0x1B,
  local_get: 0x20,
  local_set: 0x21,
  local_tee: 0x22,
  i32_const: 0x41,
  i64_const: 0x42,
  f64_const: 0x44,
  i32_eqz: 0x45,
  i32_eq: 0x46,
  i32_ne: 0x47,
  i32_lt_s: 0x48,
  i32_gt_s: 0x4A,
  i32_le_s: 0x4C,
  i32_ge_s: 0x4E,
  f64_eq: 0x61,
  f64_ne: 0x62,
  f64_lt: 0x63,
  f64_gt: 0x64,
  f64_le: 0x65,
  f64_ge: 0x66,
  i32_add: 0x6A,
  i32_sub: 0x6B,
  i32_mul: 0x6C,
  i32_div_s: 0x6D,
  i32_rem_s: 0x6F,
  i32_and: 0x71,
  i32_or: 0x72,
  f64_neg: 0x9A,
  f64_add: 0xA0,
  f64_sub: 0xA1,
  f64_mul: 0xA2,
  f64_div: 0xA3,
  f64_convert_i32_s: 0xB7,
  i32_trunc_f64_s: 0xAA,
};

// LEB128 encoding
function uleb128(value) {
  const r = [];
  do {
    let b = value & 0x7F;
    value >>>= 7;
    if (value !== 0) b |= 0x80;
    r.push(b);
  } while (value !== 0);
  return r;
}

function sleb128(value) {
  const r = [];
  let more = true;
  while (more) {
    let b = value & 0x7F;
    value >>= 7;
    if ((value === 0 && (b & 0x40) === 0) || (value === -1 && (b & 0x40) !== 0)) {
      more = false;
    } else {
      b |= 0x80;
    }
    r.push(b);
  }
  return r;
}

function encodeString(s) {
  const bytes = new TextEncoder().encode(s);
  return [...uleb128(bytes.length), ...bytes];
}

function encodeSection(id, contents) {
  return [id, ...uleb128(contents.length), ...contents];
}

function encodeF64(value) {
  const buf = new ArrayBuffer(8);
  new Float64Array(buf)[0] = value;
  return [...new Uint8Array(buf)];
}

// Map Tova type annotations to WASM types
function tovaTypeToWasm(typeStr) {
  if (!typeStr) return I32;
  const t = typeof typeStr === 'string' ? typeStr : (typeStr.name || typeStr.value || String(typeStr));
  switch (t) {
    case 'Int': case 'int': case 'i32': case 'Bool': case 'bool': return I32;
    case 'Float': case 'float': case 'f64': case 'Number': return F64;
    default: return I32;
  }
}

// Compile a single @wasm function to WASM binary
export function compileWasmFunction(funcNode) {
  const ctx = new WasmFuncContext(funcNode);
  const bodyBytes = ctx.compile();
  return buildModule(funcNode.name, ctx.paramTypes, ctx.returnType, ctx.localTypes, bodyBytes);
}

// Compile multiple @wasm functions into a single module
export function compileWasmModule(funcNodes) {
  if (funcNodes.length === 1) return compileWasmFunction(funcNodes[0]);
  const contexts = funcNodes.map(f => new WasmFuncContext(f));
  const nameMap = {};
  funcNodes.forEach((f, i) => { nameMap[f.name] = i; });
  contexts.forEach(ctx => { ctx.funcNameMap = nameMap; });
  const bodies = contexts.map(ctx => ctx.compile());
  return buildMultiModule(funcNodes.map(f => f.name), contexts, bodies);
}

function buildModule(name, paramTypes, returnType, localTypes, bodyBytes) {
  const typeSection = encodeSection(SEC_TYPE, [
    ...uleb128(1), FUNC_TYPE,
    ...uleb128(paramTypes.length), ...paramTypes,
    ...(returnType !== null ? [1, returnType] : [0])
  ]);
  const funcSection = encodeSection(SEC_FUNCTION, [...uleb128(1), ...uleb128(0)]);
  const exportSection = encodeSection(SEC_EXPORT, [
    ...uleb128(1), ...encodeString(name), 0x00, ...uleb128(0),
  ]);
  const localDecls = encodeLocalDecls(localTypes);
  const funcBody = [...localDecls, ...bodyBytes, OP.end];
  const codeSection = encodeSection(SEC_CODE, [...uleb128(1), ...uleb128(funcBody.length), ...funcBody]);

  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00,
    ...typeSection, ...funcSection, ...exportSection, ...codeSection,
  ]);
}

function buildMultiModule(names, contexts, bodies) {
  const types = [];
  for (const ctx of contexts) {
    types.push(FUNC_TYPE, ...uleb128(ctx.paramTypes.length), ...ctx.paramTypes,
      ...(ctx.returnType !== null ? [1, ctx.returnType] : [0]));
  }
  const typeSection = encodeSection(SEC_TYPE, [...uleb128(contexts.length), ...types]);
  const funcSection = encodeSection(SEC_FUNCTION, [...uleb128(contexts.length), ...contexts.map((_, i) => uleb128(i)).flat()]);
  const exports = [];
  for (let i = 0; i < names.length; i++) exports.push(...encodeString(names[i]), 0x00, ...uleb128(i));
  const exportSection = encodeSection(SEC_EXPORT, [...uleb128(names.length), ...exports]);
  const funcBodies = [];
  for (let i = 0; i < contexts.length; i++) {
    const fb = [...encodeLocalDecls(contexts[i].localTypes), ...bodies[i], OP.end];
    funcBodies.push(...uleb128(fb.length), ...fb);
  }
  const codeSection = encodeSection(SEC_CODE, [...uleb128(contexts.length), ...funcBodies]);
  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6D, 0x01, 0x00, 0x00, 0x00,
    ...typeSection, ...funcSection, ...exportSection, ...codeSection,
  ]);
}

function encodeLocalDecls(localTypes) {
  if (localTypes.length === 0) return uleb128(0);
  const groups = [];
  let cur = localTypes[0], count = 1;
  for (let i = 1; i < localTypes.length; i++) {
    if (localTypes[i] === cur) { count++; }
    else { groups.push([count, cur]); cur = localTypes[i]; count = 1; }
  }
  groups.push([count, cur]);
  const r = [...uleb128(groups.length)];
  for (const [cnt, typ] of groups) r.push(...uleb128(cnt), typ);
  return r;
}

// ─── WASM Function Context ─────────────────────────────────

class WasmFuncContext {
  constructor(funcNode) {
    this.funcNode = funcNode;
    this.name = funcNode.name;
    this.locals = new Map();       // name -> local index
    this.localTypes = [];          // types of non-param locals
    this.paramTypes = [];
    this.returnType = null;
    this.funcNameMap = { [funcNode.name]: 0 };
    this.blockDepth = 0;

    // Parse params — Tova AST: param.name, param.typeAnnotation
    for (const p of funcNode.params) {
      const pName = p.name || '_';
      const wt = tovaTypeToWasm(p.typeAnnotation);
      this.locals.set(pName, this.locals.size);
      this.paramTypes.push(wt);
    }

    // Parse return type
    this.returnType = funcNode.returnType ? tovaTypeToWasm(funcNode.returnType) : I32;
  }

  addLocal(name, wasmType) {
    if (this.locals.has(name)) return this.locals.get(name);
    const idx = this.locals.size;
    this.locals.set(name, idx);
    this.localTypes.push(wasmType || I32);
    return idx;
  }

  getLocal(name) { return this.locals.get(name); }

  typeOf(name) {
    const idx = this.locals.get(name);
    if (idx === undefined) return I32;
    if (idx < this.paramTypes.length) return this.paramTypes[idx];
    return this.localTypes[idx - this.paramTypes.length];
  }

  compile() {
    const body = this.funcNode.body;
    if (body.type === 'BlockStatement') return this.compileBlockAsValue(body);
    return this.compileExpr(body);
  }

  // ─── Block compilation (implicit return from last expression) ───

  compileBlockAsValue(block) {
    const stmts = block.body || [];
    if (stmts.length === 0) return this.defaultValue();

    const bytes = [];
    for (let i = 0; i < stmts.length; i++) {
      const stmt = stmts[i];
      const isLast = i === stmts.length - 1;

      if (isLast) {
        if (stmt.type === 'ExpressionStatement') {
          bytes.push(...this.compileExpr(stmt.expression));
        } else if (stmt.type === 'ReturnStatement') {
          if (stmt.value) bytes.push(...this.compileExpr(stmt.value));
          bytes.push(OP.return);
        } else if (stmt.type === 'IfStatement') {
          bytes.push(...this.compileIfExpr(stmt));
        } else {
          bytes.push(...this.compileStatement(stmt));
          bytes.push(...this.defaultValue());
        }
      } else {
        bytes.push(...this.compileStatement(stmt));
      }
    }
    return bytes;
  }

  compileBlockValue(block) {
    if (block.type === 'BlockStatement') {
      const stmts = block.body || [];
      if (stmts.length === 0) return this.defaultValue();
      const bytes = [];
      for (let i = 0; i < stmts.length - 1; i++) bytes.push(...this.compileStatement(stmts[i]));
      const last = stmts[stmts.length - 1];
      if (last.type === 'ExpressionStatement') {
        bytes.push(...this.compileExpr(last.expression));
      } else if (last.type === 'ReturnStatement') {
        if (last.value) bytes.push(...this.compileExpr(last.value));
        bytes.push(OP.return);
      } else if (last.type === 'IfStatement') {
        bytes.push(...this.compileIfExpr(last));
      } else {
        bytes.push(...this.compileStatement(last));
        bytes.push(...this.defaultValue());
      }
      return bytes;
    }
    return this.compileExpr(block);
  }

  defaultValue() {
    return this.returnType === F64 ? [OP.f64_const, ...encodeF64(0)] : [OP.i32_const, ...sleb128(0)];
  }

  // ─── Statement compilation ───

  compileStatement(stmt) {
    switch (stmt.type) {
      case 'VarDeclaration': return this.compileVarDecl(stmt);
      case 'Assignment': return this.compileAssignment(stmt);
      case 'ExpressionStatement': {
        const bytes = this.compileExpr(stmt.expression);
        bytes.push(OP.drop);
        return bytes;
      }
      case 'ReturnStatement': {
        const bytes = [];
        if (stmt.value) bytes.push(...this.compileExpr(stmt.value));
        bytes.push(OP.return);
        return bytes;
      }
      case 'IfStatement': return this.compileIfStmt(stmt);
      case 'WhileStatement': return this.compileWhile(stmt);
      default:
        throw new Error(`@wasm: unsupported statement type '${stmt.type}'`);
    }
  }

  // Tova VarDeclaration: { targets: [identifier], values: [expression] }
  compileVarDecl(node) {
    const bytes = [];
    const targets = node.targets || [];
    const values = node.values || [];
    for (let i = 0; i < targets.length; i++) {
      const name = typeof targets[i] === 'string' ? targets[i] : targets[i].name;
      const init = values[i];
      let wt = I32;
      if (init) wt = this.inferType(init);
      const idx = this.addLocal(name, wt);
      if (init) {
        bytes.push(...this.compileExpr(init));
        bytes.push(OP.local_set, ...uleb128(idx));
      }
    }
    return bytes;
  }

  // Tova Assignment: { targets: [identifier/expr], values: [expression] }
  compileAssignment(node) {
    const bytes = [];
    const targets = node.targets || [];
    const values = node.values || [];
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const name = typeof target === 'string' ? target : target.name;
      if (!name) throw new Error('@wasm: assignment target must be a simple identifier');
      let idx = this.getLocal(name);
      if (idx === undefined) {
        // Implicit variable declaration (Tova allows `x = 5` without `var`)
        const wt = values[i] ? this.inferType(values[i]) : I32;
        idx = this.addLocal(name, wt);
      }
      bytes.push(...this.compileExpr(values[i]));
      bytes.push(OP.local_set, ...uleb128(idx));
    }
    return bytes;
  }

  // ─── If statement (void) ───

  compileIfStmt(node) {
    const bytes = [];
    bytes.push(...this.compileExpr(node.condition));
    bytes.push(OP.if, VOID);
    if (node.consequent) {
      const stmts = node.consequent.body || [node.consequent];
      for (const s of stmts) bytes.push(...this.compileStatement(s));
    }
    // Handle elif chains
    if (node.alternates && node.alternates.length > 0) {
      for (const alt of node.alternates) {
        bytes.push(OP.else);
        bytes.push(...this.compileExpr(alt.condition));
        bytes.push(OP.if, VOID);
        const altStmts = alt.body.body || [alt.body];
        for (const s of altStmts) bytes.push(...this.compileStatement(s));
      }
      // Close all elif if-blocks
      if (node.elseBody) {
        bytes.push(OP.else);
        const elseStmts = node.elseBody.body || [node.elseBody];
        for (const s of elseStmts) bytes.push(...this.compileStatement(s));
      }
      for (let i = 0; i < node.alternates.length; i++) bytes.push(OP.end);
    } else if (node.elseBody) {
      bytes.push(OP.else);
      const elseStmts = node.elseBody.body || [node.elseBody];
      for (const s of elseStmts) bytes.push(...this.compileStatement(s));
    }
    bytes.push(OP.end);
    return bytes;
  }

  // ─── If expression (returns a value) ───

  compileIfExpr(node) {
    const bytes = [];
    bytes.push(...this.compileExpr(node.condition));
    bytes.push(OP.if, this.returnType);

    // Then branch
    if (node.consequent) {
      bytes.push(...this.compileBlockValue(node.consequent));
    } else {
      bytes.push(...this.defaultValue());
    }

    // Handle elif chains
    if (node.alternates && node.alternates.length > 0) {
      for (const alt of node.alternates) {
        bytes.push(OP.else);
        bytes.push(...this.compileExpr(alt.condition));
        bytes.push(OP.if, this.returnType);
        bytes.push(...this.compileBlockValue(alt.body));
      }
      // Final else
      bytes.push(OP.else);
      if (node.elseBody) {
        bytes.push(...this.compileBlockValue(node.elseBody));
      } else {
        bytes.push(...this.defaultValue());
      }
      // Close all elif if-blocks
      for (let i = 0; i < node.alternates.length; i++) bytes.push(OP.end);
    } else {
      // Simple if/else
      bytes.push(OP.else);
      if (node.elseBody) {
        bytes.push(...this.compileBlockValue(node.elseBody));
      } else {
        bytes.push(...this.defaultValue());
      }
    }

    bytes.push(OP.end);
    return bytes;
  }

  // ─── While loop ───

  compileWhile(node) {
    const bytes = [];
    bytes.push(OP.block, VOID);
    bytes.push(OP.loop, VOID);
    this.blockDepth += 2;

    bytes.push(...this.compileExpr(node.condition));
    bytes.push(OP.i32_eqz);
    bytes.push(OP.br_if, ...uleb128(1));

    const bodyStmts = node.body.body || [node.body];
    for (const s of bodyStmts) bytes.push(...this.compileStatement(s));

    bytes.push(OP.br, ...uleb128(0));
    bytes.push(OP.end);
    bytes.push(OP.end);
    this.blockDepth -= 2;
    return bytes;
  }

  // ─── Expression compilation ───

  compileExpr(node) {
    switch (node.type) {
      case 'NumberLiteral': return this.compileNumber(node);
      case 'BooleanLiteral': return [OP.i32_const, ...sleb128(node.value ? 1 : 0)];
      case 'Identifier': return this.compileIdentifier(node);
      case 'BinaryExpression': return this.compileBinary(node);
      case 'UnaryExpression': return this.compileUnary(node);
      case 'CallExpression': return this.compileCall(node);
      case 'IfStatement': return this.compileIfExpr(node);
      case 'LogicalExpression': return this.compileLogical(node);
      case 'BlockStatement': return this.compileBlockAsValue(node);
      default:
        throw new Error(`@wasm: unsupported expression type '${node.type}'`);
    }
  }

  compileNumber(node) {
    const val = node.value;
    if (Number.isInteger(val) && val >= -2147483648 && val <= 2147483647) {
      return [OP.i32_const, ...sleb128(val)];
    }
    return [OP.f64_const, ...encodeF64(val)];
  }

  compileIdentifier(node) {
    const name = node.name;
    const idx = this.getLocal(name);
    if (idx === undefined) throw new Error(`@wasm: undefined variable '${name}'`);
    return [OP.local_get, ...uleb128(idx)];
  }

  compileBinary(node) {
    const lt = this.inferType(node.left);
    const rt = this.inferType(node.right);
    const t = (lt === F64 || rt === F64) ? F64 : I32;

    const bytes = [];
    bytes.push(...this.compileExpr(node.left));
    if (t === F64 && lt === I32) bytes.push(OP.f64_convert_i32_s);
    bytes.push(...this.compileExpr(node.right));
    if (t === F64 && rt === I32) bytes.push(OP.f64_convert_i32_s);

    switch (node.operator) {
      case '+': bytes.push(t === F64 ? OP.f64_add : OP.i32_add); break;
      case '-': bytes.push(t === F64 ? OP.f64_sub : OP.i32_sub); break;
      case '*': bytes.push(t === F64 ? OP.f64_mul : OP.i32_mul); break;
      case '/': bytes.push(t === F64 ? OP.f64_div : OP.i32_div_s); break;
      case '%': bytes.push(OP.i32_rem_s); break;
      case '==': bytes.push(t === F64 ? OP.f64_eq : OP.i32_eq); break;
      case '!=': bytes.push(t === F64 ? OP.f64_ne : OP.i32_ne); break;
      case '<': bytes.push(t === F64 ? OP.f64_lt : OP.i32_lt_s); break;
      case '>': bytes.push(t === F64 ? OP.f64_gt : OP.i32_gt_s); break;
      case '<=': bytes.push(t === F64 ? OP.f64_le : OP.i32_le_s); break;
      case '>=': bytes.push(t === F64 ? OP.f64_ge : OP.i32_ge_s); break;
      default:
        throw new Error(`@wasm: unsupported binary operator '${node.operator}'`);
    }
    return bytes;
  }

  compileUnary(node) {
    switch (node.operator) {
      case '-': {
        const t = this.inferType(node.operand);
        if (t === F64) {
          return [...this.compileExpr(node.operand), OP.f64_neg];
        }
        return [OP.i32_const, ...sleb128(0), ...this.compileExpr(node.operand), OP.i32_sub];
      }
      case 'not': case '!':
        return [...this.compileExpr(node.operand), OP.i32_eqz];
      default:
        throw new Error(`@wasm: unsupported unary operator '${node.operator}'`);
    }
  }

  compileCall(node) {
    const name = node.callee.name;
    if (!name) throw new Error('@wasm: only direct function calls are supported');
    const funcIdx = this.funcNameMap[name];
    if (funcIdx === undefined) throw new Error(`@wasm: undefined function '${name}'`);
    const bytes = [];
    for (const arg of node.arguments) bytes.push(...this.compileExpr(arg));
    bytes.push(OP.call, ...uleb128(funcIdx));
    return bytes;
  }

  compileLogical(node) {
    const bytes = [];
    if (node.operator === 'and' || node.operator === '&&') {
      bytes.push(...this.compileExpr(node.left));
      bytes.push(OP.if, I32);
      bytes.push(...this.compileExpr(node.right));
      bytes.push(OP.else, OP.i32_const, ...sleb128(0));
      bytes.push(OP.end);
    } else {
      bytes.push(...this.compileExpr(node.left));
      bytes.push(OP.if, I32);
      bytes.push(OP.i32_const, ...sleb128(1));
      bytes.push(OP.else);
      bytes.push(...this.compileExpr(node.right));
      bytes.push(OP.end);
    }
    return bytes;
  }

  // ─── Type inference ───

  inferType(node) {
    if (!node) return I32;
    switch (node.type) {
      case 'NumberLiteral':
        return (Number.isInteger(node.value) && node.value >= -2147483648 && node.value <= 2147483647) ? I32 : F64;
      case 'BooleanLiteral': return I32;
      case 'Identifier': return this.typeOf(node.name);
      case 'BinaryExpression': {
        if (['==', '!=', '<', '>', '<=', '>='].includes(node.operator)) return I32;
        const lt = this.inferType(node.left);
        const rt = this.inferType(node.right);
        return (lt === F64 || rt === F64) ? F64 : I32;
      }
      case 'UnaryExpression': return this.inferType(node.operand);
      case 'CallExpression': return this.returnType || I32;
      default: return I32;
    }
  }
}

// Generate JS glue code for a @wasm function
export function generateWasmGlue(funcNode, wasmBytes) {
  const bytesStr = Array.from(wasmBytes).join(',');
  const name = funcNode.name;
  return `const ${name} = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array([${bytesStr}]))).exports.${name};`;
}

// Generate JS glue code for a multi-function WASM module
export function generateMultiWasmGlue(funcNodes, wasmBytes) {
  const bytesStr = Array.from(wasmBytes).join(',');
  const names = funcNodes.map(f => f.name);
  return `const { ${names.join(', ')} } = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array([${bytesStr}]))).exports;`;
}
