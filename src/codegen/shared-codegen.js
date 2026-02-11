import { BaseCodegen } from './base-codegen.js';

export class SharedCodegen extends BaseCodegen {
  generate(block) {
    const code = block.body.map(stmt => this.generateStatement(stmt)).join('\n');
    return code;
  }

  // Generate any needed helpers (called after all code is generated)
  generateHelpers() {
    const helpers = [];
    helpers.push(this.getStringProtoHelper());
    if (this._needsContainsHelper) {
      helpers.push(this.getContainsHelper());
    }
    return helpers.join('\n');
  }
}
