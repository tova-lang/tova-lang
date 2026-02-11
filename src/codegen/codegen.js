// Main code generator — orchestrates shared/server/client codegen

import { SharedCodegen } from './shared-codegen.js';
import { ServerCodegen } from './server-codegen.js';
import { ClientCodegen } from './client-codegen.js';

export class CodeGenerator {
  constructor(ast, filename = '<stdin>') {
    this.ast = ast;
    this.filename = filename;
  }

  generate() {
    const shared = [];
    const server = [];
    const client = [];
    const topLevel = [];

    for (const node of this.ast.body) {
      switch (node.type) {
        case 'SharedBlock':
          shared.push(node);
          break;
        case 'ServerBlock':
          server.push(node);
          break;
        case 'ClientBlock':
          client.push(node);
          break;
        default:
          topLevel.push(node);
          break;
      }
    }

    const sharedGen = new SharedCodegen();
    const serverGen = new ServerCodegen();
    const clientGen = new ClientCodegen();

    const sharedCode = shared.map(b => sharedGen.generate(b)).join('\n');
    const topLevelCode = topLevel.map(s => sharedGen.generateStatement(s)).join('\n');
    const serverCode = server.length > 0
      ? serverGen.generate(server, sharedCode)
      : '';
    const clientCode = client.length > 0
      ? clientGen.generate(client, sharedCode)
      : '';

    return {
      shared: sharedCode + '\n' + topLevelCode,
      server: serverCode,
      client: clientCode,
    };
  }
}
