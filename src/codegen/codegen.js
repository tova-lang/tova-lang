// Main code generator — orchestrates shared/server/client codegen
// Supports named multi-blocks: server "api" { }, server "ws" { }
// Blocks with the same name are merged; different names produce separate output files.

import { SharedCodegen } from './shared-codegen.js';
import { ServerCodegen } from './server-codegen.js';
import { ClientCodegen } from './client-codegen.js';

export class CodeGenerator {
  constructor(ast, filename = '<stdin>') {
    this.ast = ast;
    this.filename = filename;
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
    const sharedBlocks = [];
    const serverBlocks = [];
    const clientBlocks = [];
    const topLevel = [];

    for (const node of this.ast.body) {
      switch (node.type) {
        case 'SharedBlock': sharedBlocks.push(node); break;
        case 'ServerBlock': serverBlocks.push(node); break;
        case 'ClientBlock': clientBlocks.push(node); break;
        default: topLevel.push(node); break;
      }
    }

    const sharedGen = new SharedCodegen();

    // All shared blocks (regardless of name) are merged into one shared output
    const sharedCode = sharedBlocks.map(b => sharedGen.generate(b)).join('\n');
    const topLevelCode = topLevel.map(s => sharedGen.generateStatement(s)).join('\n');
    const helpers = sharedGen.generateHelpers();
    const combinedShared = [helpers, sharedCode, topLevelCode].filter(s => s.trim()).join('\n').trim();

    // Group server and client blocks by name
    const serverGroups = this._groupByName(serverBlocks);
    const clientGroups = this._groupByName(clientBlocks);

    // Collect function names per named server block for inter-server RPC
    const serverFunctionMap = new Map(); // blockName -> [fnName, ...]
    for (const [name, blocks] of serverGroups) {
      if (name) {
        const fns = [];
        for (const block of blocks) {
          for (const stmt of block.body) {
            if (stmt.type === 'FunctionDeclaration') {
              fns.push(stmt.name);
            }
          }
        }
        serverFunctionMap.set(name, fns);
      }
    }

    // Generate server outputs (one per named group)
    const servers = {};
    for (const [name, blocks] of serverGroups) {
      const gen = new ServerCodegen();
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
      servers[key] = gen.generate(blocks, combinedShared, name, peerBlocks);
    }

    // Generate client outputs (one per named group)
    const clients = {};
    for (const [name, blocks] of clientGroups) {
      const gen = new ClientCodegen();
      const key = name || 'default';
      clients[key] = gen.generate(blocks, combinedShared);
    }

    // Backward-compatible: if only unnamed blocks, return flat structure
    const hasNamedBlocks = [...serverGroups.keys(), ...clientGroups.keys()].some(k => k !== null);

    if (!hasNamedBlocks) {
      return {
        shared: combinedShared,
        server: servers['default'] || '',
        client: clients['default'] || '',
      };
    }

    // Multi-block output: separate files per named block
    return {
      shared: combinedShared,
      server: servers['default'] || '',
      client: clients['default'] || '',
      servers,   // { "api": code, "ws": code, ... }
      clients,   // { "admin": code, "dashboard": code, ... }
      multiBlock: true,
    };
  }
}
