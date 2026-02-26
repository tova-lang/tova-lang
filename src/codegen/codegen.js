// Main code generator — orchestrates shared/server/client codegen
// Supports named multi-blocks: server "api" { }, server "ws" { }
// Blocks with the same name are merged; different names produce separate output files.

import { SharedCodegen } from './shared-codegen.js';
import { BUILTIN_NAMES } from '../stdlib/inline.js';
import { ServerCodegen } from './server-codegen.js';
import { ClientCodegen } from './client-codegen.js';
import { SecurityCodegen } from './security-codegen.js';
import { CliCodegen } from './cli-codegen.js';
import { BlockRegistry } from '../registry/register-all.js';

function getServerCodegen() {
  return ServerCodegen;
}

function getClientCodegen() {
  return ClientCodegen;
}

export class CodeGenerator {
  constructor(ast, filename = '<stdin>', options = {}) {
    this.ast = ast;
    this.filename = filename;
    this._sourceMaps = options.sourceMaps !== false; // default true; pass false for REPL/check
  }

  // Group blocks by name (null name = "default")
  _groupByName(blocks) {
    const groups = new Map();
    for (const block of blocks) {
      const key = block.name || null;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(block);
    }
    return groups;
  }

  generate() {
    // Registry-driven block sorting
    const blocksByType = new Map();
    const topLevel = [];

    for (const node of this.ast.body) {
      const plugin = BlockRegistry.getByAstType(node.type);
      if (plugin) {
        if (!blocksByType.has(plugin.name)) blocksByType.set(plugin.name, []);
        blocksByType.get(plugin.name).push(node);
      } else {
        topLevel.push(node);
      }
    }

    const getBlocks = (name) => blocksByType.get(name) || [];

    // Early-return blocks (e.g., CLI mode)
    for (const plugin of BlockRegistry.all()) {
      if (plugin.codegen?.earlyReturn && getBlocks(plugin.name).length > 0) {
        return this[plugin.codegen.earlyReturnMethod](getBlocks(plugin.name), topLevel);
      }
    }

    // Convenience aliases
    const sharedBlocks = getBlocks('shared');
    const serverBlocks = getBlocks('server');
    const clientBlocks = getBlocks('client');
    const testBlocks = getBlocks('test');
    const benchBlocks = getBlocks('bench');
    const dataBlocks = getBlocks('data');
    const securityBlocks = getBlocks('security');

    // Detect module mode: no blocks, only top-level statements
    const hasAnyBlocks = BlockRegistry.all().some(p => getBlocks(p.name).length > 0);
    const isModule = !hasAnyBlocks && topLevel.length > 0;

    if (isModule) {
      const moduleGen = new SharedCodegen();
      moduleGen._sourceMapsEnabled = this._sourceMaps;
      moduleGen.setSourceFile(this.filename);
      // Use genBlockStatements for pattern optimization (array fill detection, etc.)
      const fakeBlock = { type: 'BlockStatement', body: topLevel };
      const moduleCode = moduleGen.genBlockStatements(fakeBlock);
      const helpers = moduleGen.generateHelpers();
      const combined = [helpers, moduleCode].filter(s => s.trim()).join('\n').trim();
      return {
        shared: combined,
        server: '',
        client: '',
        isModule: true,
        sourceMappings: moduleGen.getSourceMappings(),
        _sourceFile: this.filename,
      };
    }

    const sharedGen = new SharedCodegen();
    sharedGen._sourceMapsEnabled = this._sourceMaps;
    sharedGen.setSourceFile(this.filename);

    // All shared blocks (regardless of name) are merged into one shared output
    const sharedCode = sharedBlocks.map(b => sharedGen.generate(b)).join('\n');
    const topLevelCode = topLevel.length > 0
      ? sharedGen.genBlockStatements({ type: 'BlockStatement', body: topLevel })
      : '';

    // Pre-scan server/client blocks for builtin usage so shared stdlib includes them
    this._scanBlocksForBuiltins([...serverBlocks, ...clientBlocks], sharedGen._usedBuiltins);

    const helpers = sharedGen.generateHelpers();

    // Generate data block code (sources, pipelines, validators, refresh)
    const dataCode = dataBlocks.map(b => this._genDataBlock(b, sharedGen)).join('\n');

    const combinedShared = [helpers, sharedCode, topLevelCode, dataCode].filter(s => s.trim()).join('\n').trim();

    // Group server and client blocks by name
    const serverGroups = this._groupByName(serverBlocks);
    const clientGroups = this._groupByName(clientBlocks);

    // Collect function names per named server block for inter-server RPC
    const serverFunctionMap = new Map(); // blockName -> [fnName, ...]
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
    for (const [name, blocks] of serverGroups) {
      if (name) {
        const fns = [];
        for (const block of blocks) {
          fns.push(...collectFns(block.body));
        }
        serverFunctionMap.set(name, fns);
      }
    }

    // Merge security blocks into a single config
    const securityConfig = securityBlocks.length > 0
      ? SecurityCodegen.mergeSecurityBlocks(securityBlocks)
      : null;

    // Generate server outputs (one per named group)
    const servers = {};
    for (const [name, blocks] of serverGroups) {
      const gen = new (getServerCodegen())();
      gen._sourceMapsEnabled = this._sourceMaps;
      const key = name || 'default';
      // Build peer blocks map (all named blocks except self)
      let peerBlocks = null;
      if (name && serverFunctionMap.size > 1) {
        peerBlocks = new Map();
        for (const [peerName, peerFns] of serverFunctionMap) {
          if (peerName !== name) {
            peerBlocks.set(peerName, peerFns);
          }
        }
      }
      servers[key] = gen.generate(blocks, combinedShared, name, peerBlocks, sharedBlocks, securityConfig);
    }

    // Generate client outputs (one per named group)
    const clients = {};
    for (const [name, blocks] of clientGroups) {
      const gen = new (getClientCodegen())();
      gen._sourceMapsEnabled = this._sourceMaps;
      const key = name || 'default';
      clients[key] = gen.generate(blocks, combinedShared, sharedGen._usedBuiltins, securityConfig);
    }

    // Generate tests if test blocks exist
    let testCode = '';
    if (testBlocks.length > 0) {
      const testGen = new (getServerCodegen())();
      testCode = testGen.generateTests(testBlocks, combinedShared);

      // Add __handleRequest export to server code
      const defaultServer = servers['default'] || '';
      if (defaultServer) {
        servers['default'] = defaultServer + '\nexport { __handleRequest };\n';
      }
    }

    // Generate benchmarks if bench blocks exist
    let benchCode = '';
    if (benchBlocks.length > 0) {
      const benchGen = new (getServerCodegen())();
      benchCode = benchGen.generateBench(benchBlocks, combinedShared);
    }

    // Backward-compatible: if only unnamed blocks, return flat structure
    const hasNamedBlocks = [...serverGroups.keys(), ...clientGroups.keys()].some(k => k !== null);

    // Collect source mappings from all codegens
    const sourceMappings = sharedGen.getSourceMappings();

    if (!hasNamedBlocks) {
      const result = {
        shared: combinedShared,
        server: servers['default'] || '',
        client: clients['default'] || '',
        sourceMappings,
        _sourceFile: this.filename,
      };
      if (testCode) result.test = testCode;
      if (benchCode) result.bench = benchCode;
      return result;
    }

    // Multi-block output: separate files per named block
    const result = {
      shared: combinedShared,
      server: servers['default'] || '',
      client: clients['default'] || '',
      servers,   // { "api": code, "ws": code, ... }
      clients,   // { "admin": code, "dashboard": code, ... }
      multiBlock: true,
      sourceMappings,
      _sourceFile: this.filename,
    };
    if (testCode) result.test = testCode;
    if (benchCode) result.bench = benchCode;
    return result;
  }

  // Generate CLI executable from cli {} blocks
  _generateCli(cliBlocks, topLevel) {
    const sharedGen = new SharedCodegen();
    sharedGen._sourceMapsEnabled = this._sourceMaps;
    sharedGen.setSourceFile(this.filename);

    // Generate top-level code (shared helpers, type declarations, etc.)
    const topLevelCode = topLevel.length > 0
      ? sharedGen.genBlockStatements({ type: 'BlockStatement', body: topLevel })
      : '';

    // Scan cli command bodies for builtin usage
    for (const block of cliBlocks) {
      for (const cmd of block.commands) {
        this._scanBlocksForBuiltins([cmd.body], sharedGen._usedBuiltins);
      }
    }
    // Also scan top-level for builtins
    this._scanBlocksForBuiltins(topLevel, sharedGen._usedBuiltins);

    const helpers = sharedGen.generateHelpers();
    const combinedShared = [helpers, topLevelCode].filter(s => s.trim()).join('\n').trim();

    const cliConfig = CliCodegen.mergeCliBlocks(cliBlocks);
    const cliGen = new CliCodegen();
    cliGen._sourceMapsEnabled = this._sourceMaps;
    const cliCode = cliGen.generate(cliConfig, combinedShared);

    return {
      cli: cliCode,
      isCli: true,
      shared: '',
      server: '',
      client: '',
      sourceMappings: sharedGen.getSourceMappings(),
      _sourceFile: this.filename,
    };
  }

  // Walk AST nodes to find builtin function calls/identifiers
  _scanBlocksForBuiltins(blocks, targetSet) {
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'Identifier' && BUILTIN_NAMES.has(node.name)) {
        targetSet.add(node.name);
      }
      if (node.type === 'CallExpression' && node.callee && node.callee.type === 'Identifier' && BUILTIN_NAMES.has(node.callee.name)) {
        targetSet.add(node.callee.name);
      }
      // Track namespace builtin usage: math.sin() or math.PI
      if (node.type === 'MemberExpression' &&
          node.object.type === 'Identifier' &&
          BUILTIN_NAMES.has(node.object.name)) {
        targetSet.add(node.object.name);
      }
      for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'type') continue;
        const val = node[key];
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item === 'object') walk(item);
          }
        } else if (val && typeof val === 'object' && val.type) {
          walk(val);
        }
      }
    };
    for (const block of blocks) walk(block);
  }

  _genDataBlock(node, gen) {
    const lines = [];
    lines.push('// ── Data Block ──');

    for (const stmt of node.body) {
      switch (stmt.type) {
        case 'SourceDeclaration': {
          // Source: lazy cached getter
          const expr = gen.genExpression(stmt.expression);
          lines.push(`let __data_${stmt.name}_cache = null;`);
          lines.push(`async function __data_${stmt.name}_load() {`);
          lines.push(`  if (__data_${stmt.name}_cache === null) {`);
          lines.push(`    __data_${stmt.name}_cache = await ${expr};`);
          lines.push(`  }`);
          lines.push(`  return __data_${stmt.name}_cache;`);
          lines.push(`}`);
          // Also expose as a simple getter variable via lazy init
          lines.push(`let ${stmt.name} = null;`);
          lines.push(`Object.defineProperty(globalThis, ${JSON.stringify(stmt.name)}, {`);
          lines.push(`  get() { if (${stmt.name} === null) { ${stmt.name} = __data_${stmt.name}_load(); } return ${stmt.name}; },`);
          lines.push(`  configurable: true,`);
          lines.push(`});`);
          break;
        }
        case 'PipelineDeclaration': {
          // Pipeline: function that chains transforms
          const expr = gen.genExpression(stmt.expression);
          lines.push(`async function __pipeline_${stmt.name}() {`);
          lines.push(`  return ${expr};`);
          lines.push(`}`);
          lines.push(`let ${stmt.name} = null;`);
          lines.push(`Object.defineProperty(globalThis, ${JSON.stringify(stmt.name)}, {`);
          lines.push(`  get() { if (${stmt.name} === null) { ${stmt.name} = __pipeline_${stmt.name}(); } return ${stmt.name}; },`);
          lines.push(`  configurable: true,`);
          lines.push(`});`);
          break;
        }
        case 'ValidateBlock': {
          // Validate: validator function — include rule expression in error for debuggability
          const rules = stmt.rules.map(r => gen.genExpression(r));
          lines.push(`function __validate_${stmt.typeName}(it) {`);
          lines.push(`  const errors = [];`);
          for (let i = 0; i < rules.length; i++) {
            const escapedRule = rules[i].replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            lines.push(`  if (!(${rules[i]})) errors.push("Validation failed for ${stmt.typeName}: expected \`${escapedRule}\`");`);
          }
          lines.push(`  return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };`);
          lines.push(`}`);
          break;
        }
        case 'RefreshPolicy': {
          // Refresh: interval cache invalidation
          if (stmt.interval === 'on_demand') {
            lines.push(`function refresh_${stmt.sourceName}() { __data_${stmt.sourceName}_cache = null; ${stmt.sourceName} = null; }`);
          } else {
            const { value, unit } = stmt.interval;
            let ms;
            switch (unit) {
              case 'seconds': case 'second': ms = value * 1000; break;
              case 'minutes': case 'minute': ms = value * 60 * 1000; break;
              case 'hours': case 'hour': ms = value * 60 * 60 * 1000; break;
              case 'days': case 'day': ms = value * 24 * 60 * 60 * 1000; break;
              default: ms = value * 60 * 1000; // default to minutes
            }
            lines.push(`setInterval(() => { __data_${stmt.sourceName}_cache = null; ${stmt.sourceName} = null; }, ${ms});`);
          }
          break;
        }
      }
    }

    return lines.join('\n');
  }
}
