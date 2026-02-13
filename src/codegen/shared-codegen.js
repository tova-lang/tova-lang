import { BaseCodegen } from './base-codegen.js';
import { buildSelectiveStdlib, RESULT_OPTION, PROPAGATE } from '../stdlib/inline.js';

export class SharedCodegen extends BaseCodegen {
  generate(block) {
    const code = block.body.map(stmt => this.generateStatement(stmt)).join('\n');
    return code;
  }

  // Generate any needed helpers (called after all code is generated)
  generateHelpers() {
    const helpers = [];
    helpers.push(this.getStringProtoHelper());
    // Only include Result/Option if Ok/Err/Some/None are used
    if (this._needsResultOption) {
      helpers.push(this.getResultOptionHelper());
    }
    if (this._needsContainsHelper) {
      helpers.push(this.getContainsHelper());
    }
    if (this._needsPropagateHelper) {
      helpers.push(this.getPropagateHelper());
    }
    // Include only used builtin functions
    const selectiveStdlib = buildSelectiveStdlib(this._usedBuiltins);
    if (selectiveStdlib) helpers.push(selectiveStdlib);
    return helpers.join('\n');
  }
}
