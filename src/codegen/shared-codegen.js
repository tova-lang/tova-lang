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
    // Runtime bridge for WASM-Tokio concurrent execution
    if (this._needsRuntimeBridge) {
      // Try multiple paths: relative to script, package require, absolute from process.cwd()
      helpers.push(`let __tova_rt = null; try { const __p = require('path'); const __d = __p.dirname(typeof __filename !== 'undefined' ? __filename : process.argv[1] || ''); const __candidates = [__p.join(__d, '..', 'src', 'stdlib', 'runtime-bridge.js'), __p.join(process.cwd(), 'src', 'stdlib', 'runtime-bridge.js')]; for (const __c of __candidates) { try { __tova_rt = require(__c); break; } catch(_) {} } } catch(_) {}`);
    }
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
    const selectiveStdlib = buildSelectiveStdlib(this.getUsedBuiltins());
    if (selectiveStdlib) helpers.push(selectiveStdlib);
    return helpers.join('\n');
  }
}
