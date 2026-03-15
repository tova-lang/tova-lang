// CLI-specific analyzer methods for the Tova language
// Extracted from analyzer.js for lazy loading — only loaded when cli { } blocks are encountered.

import { Symbol } from './scope.js';

export function installCliAnalyzer(AnalyzerClass) {
  if (AnalyzerClass.prototype._cliAnalyzerInstalled) return;
  AnalyzerClass.prototype._cliAnalyzerInstalled = true;

  AnalyzerClass.prototype.visitCliBlock = function(node) {
    const validKeys = new Set(['name', 'version', 'description']);

    // Validate config keys
    for (const field of node.config) {
      if (!validKeys.has(field.key)) {
        this.warnings.push({
          message: `Unknown cli config key '${field.key}' — valid keys are: ${[...validKeys].join(', ')}`,
          loc: field.loc,
          code: 'W_UNKNOWN_CLI_CONFIG',
        });
      }
    }

    // Validate commands
    const commandNames = new Set();
    for (const cmd of node.commands) {
      // Duplicate command names
      if (commandNames.has(cmd.name)) {
        this.warnings.push({
          message: `Duplicate cli command '${cmd.name}'`,
          loc: cmd.loc,
          code: 'W_DUPLICATE_CLI_COMMAND',
        });
      }
      commandNames.add(cmd.name);

      // Check for positional args after flags
      let seenFlag = false;
      for (const param of cmd.params) {
        if (param.isFlag) {
          seenFlag = true;
        } else if (seenFlag) {
          this.warnings.push({
            message: `Positional argument '${param.name}' after flag in command '${cmd.name}' — positionals should come before flags`,
            loc: param.loc,
            code: 'W_POSITIONAL_AFTER_FLAG',
          });
        }
      }

      // Visit command body with params in scope
      this.pushScope('function');
      for (const param of cmd.params) {
        this.currentScope.define(param.name,
          new Symbol(param.name, 'parameter', null, false, param.loc));
      }
      this.visitNode(cmd.body);
      this.popScope();
    }
  };

  AnalyzerClass.prototype._validateCliCrossBlock = function() {
    const cliBlocks = this.ast.body.filter(n => n.type === 'CliBlock');
    if (cliBlocks.length === 0) return;

    // Warn if cli + server coexist
    const hasServer = this.ast.body.some(n => n.type === 'ServerBlock');
    if (hasServer) {
      this.warnings.push({
        message: 'cli {} and server {} blocks in the same file — cli produces a standalone executable, not a web server',
        loc: cliBlocks[0].loc,
        code: 'W_CLI_WITH_SERVER',
      });
    }

    // Check for missing name across all cli blocks
    let hasName = false;
    for (const block of cliBlocks) {
      for (const field of block.config) {
        if (field.key === 'name') hasName = true;
      }
    }
    if (!hasName) {
      this.warnings.push({
        message: 'cli block has no name: field — consider adding name: "your-tool"',
        loc: cliBlocks[0].loc,
        code: 'W_CLI_MISSING_NAME',
      });
    }
  };
}
