import { BaseCodegen } from './base-codegen.js';

export class SharedCodegen extends BaseCodegen {
  generate(block) {
    return block.body.map(stmt => this.generateStatement(stmt)).join('\n');
  }
}
