// CLI code generator for the Tova language
// Produces a complete zero-dependency CLI executable from cli { } blocks.

import { BaseCodegen } from './base-codegen.js';

export class CliCodegen extends BaseCodegen {

  /**
   * Merge all CliBlock nodes into a single config.
   * Multiple cli blocks are merged (last wins on config, commands accumulate).
   */
  static mergeCliBlocks(cliBlocks) {
    const config = {
      name: null,
      version: null,
      description: null,
    };
    const commands = [];

    for (const block of cliBlocks) {
      for (const field of block.config) {
        if (field.key === 'name' && field.value.type === 'StringLiteral') {
          config.name = field.value.value;
        } else if (field.key === 'version' && field.value.type === 'StringLiteral') {
          config.version = field.value.value;
        } else if (field.key === 'description' && field.value.type === 'StringLiteral') {
          config.description = field.value.value;
        }
      }
      commands.push(...block.commands);
    }

    return { config, commands };
  }

  /**
   * Generate a complete CLI executable.
   * @param {Object} cliConfig — merged config from mergeCliBlocks
   * @param {string} sharedCode — shared/top-level compiled code
   * @returns {string} — complete executable JS
   */
  generate(cliConfig, sharedCode) {
    const { config, commands } = cliConfig;
    const lines = [];

    // Emit shared code (stdlib + top-level)
    if (sharedCode && sharedCode.trim()) {
      lines.push(sharedCode);
      lines.push('');
    }

    const singleCommand = commands.length === 1;

    // Emit each command as a function
    for (const cmd of commands) {
      lines.push(this._genCommandFunction(cmd));
      lines.push('');
    }

    // Generate help functions
    lines.push(this._genMainHelp(config, commands));
    lines.push('');

    for (const cmd of commands) {
      lines.push(this._genCommandHelp(cmd, config, singleCommand));
      lines.push('');
    }

    // Generate dispatchers for each command
    for (const cmd of commands) {
      lines.push(this._genCommandDispatcher(cmd));
      lines.push('');
    }

    // Generate main entry point
    lines.push(this._genMain(config, commands, singleCommand));
    lines.push('');

    // Auto-invoke
    lines.push('__cli_main(process.argv.slice(2));');

    return lines.join('\n');
  }

  /**
   * Generate a command function: __cmd_<name>(params...)
   */
  _genCommandFunction(cmd) {
    const paramNames = cmd.params.map(p => p.name);
    const asyncPrefix = cmd.isAsync ? 'async ' : '';
    const body = this.genBlockStatements(cmd.body);
    return `${asyncPrefix}function __cmd_${cmd.name}(${paramNames.join(', ')}) {\n${body}\n}`;
  }

  /**
   * Generate overall --help output
   */
  _genMainHelp(config, commands) {
    const lines = [];
    lines.push('function __cli_help() {');
    lines.push('  const lines = [];');

    if (config.name) {
      if (config.description) {
        lines.push(`  lines.push("${config.name} — ${this._escStr(config.description)}");`);
      } else {
        lines.push(`  lines.push("${this._escStr(config.name)}");`);
      }
    }
    if (config.version) {
      lines.push(`  lines.push("Version: ${this._escStr(config.version)}");`);
    }

    lines.push('  lines.push("");');
    lines.push('  lines.push("USAGE:");');

    if (commands.length === 1) {
      const cmd = commands[0];
      const usage = this._buildUsageLine(cmd, config);
      lines.push(`  lines.push("  ${usage}");`);
    } else {
      lines.push(`  lines.push("  ${config.name || 'cli'} <command> [options]");`);
      lines.push('  lines.push("");');
      lines.push('  lines.push("COMMANDS:");');

      for (const cmd of commands) {
        const desc = this._getCommandDescription(cmd);
        lines.push(`  lines.push("  ${cmd.name.padEnd(16)}${this._escStr(desc)}");`);
      }
    }

    lines.push('  lines.push("");');
    lines.push('  lines.push("OPTIONS:");');
    lines.push('  lines.push("  --help, -h     Show help");');
    if (config.version) {
      lines.push('  lines.push("  --version, -v  Show version");');
    }

    lines.push('  console.log(lines.join("\\n"));');
    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Generate per-command help: __cli_command_help_<name>()
   */
  _genCommandHelp(cmd, config, singleCommand) {
    const lines = [];
    lines.push(`function __cli_command_help_${cmd.name}() {`);
    lines.push('  const lines = [];');

    const usage = this._buildUsageLine(cmd, config);
    lines.push(`  lines.push("USAGE:");`);
    lines.push(`  lines.push("  ${usage}");`);

    const positionals = cmd.params.filter(p => !p.isFlag);
    const flags = cmd.params.filter(p => p.isFlag);

    if (positionals.length > 0) {
      lines.push('  lines.push("");');
      lines.push('  lines.push("ARGUMENTS:");');
      for (const p of positionals) {
        const typeSuffix = p.typeAnnotation ? ` <${p.typeAnnotation}>` : '';
        const optSuffix = p.isOptional ? ' (optional)' : '';
        const defSuffix = p.defaultValue ? ` (default: ${this._getDefaultStr(p)})` : '';
        lines.push(`  lines.push("  ${p.name.padEnd(16)}${this._escStr(typeSuffix + optSuffix + defSuffix)}");`);
      }
    }

    if (flags.length > 0) {
      lines.push('  lines.push("");');
      lines.push('  lines.push("OPTIONS:");');
      for (const f of flags) {
        const typePart = f.typeAnnotation === 'Bool' ? '' : (f.typeAnnotation ? ` <${f.typeAnnotation}>` : '');
        const defPart = f.defaultValue ? ` (default: ${this._getDefaultStr(f)})` : '';
        lines.push(`  lines.push("  --${f.name.padEnd(14)}${this._escStr(typePart + defPart)}");`);
      }
    }

    lines.push('  lines.push("  --help, -h".padEnd(18) + "Show help");');
    lines.push('  console.log(lines.join("\\n"));');
    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Generate argv dispatcher for a command: __cli_dispatch_<name>(argv)
   */
  _genCommandDispatcher(cmd) {
    const lines = [];
    const asyncPrefix = cmd.isAsync ? 'async ' : '';
    lines.push(`${asyncPrefix}function __cli_dispatch_${cmd.name}(argv) {`);

    const positionals = cmd.params.filter(p => !p.isFlag);
    const flags = cmd.params.filter(p => p.isFlag);

    // Initialize flag variables with defaults
    for (const f of flags) {
      if (f.typeAnnotation === 'Bool') {
        lines.push(`  let __flag_${f.name} = false;`);
      } else if (f.isRepeated) {
        lines.push(`  let __flag_${f.name} = [];`);
      } else if (f.defaultValue) {
        lines.push(`  let __flag_${f.name} = ${this.genExpression(f.defaultValue)};`);
      } else {
        lines.push(`  let __flag_${f.name} = undefined;`);
      }
    }

    // Positional collector
    lines.push('  const __positionals = [];');

    // Parse argv
    lines.push('  for (let __i = 0; __i < argv.length; __i++) {');
    lines.push('    const __arg = argv[__i];');

    // Check --help
    lines.push(`    if (__arg === "--help" || __arg === "-h") { __cli_command_help_${cmd.name}(); return; }`);

    // Check each flag
    for (const f of flags) {
      if (f.typeAnnotation === 'Bool') {
        lines.push(`    if (__arg === "--${f.name}") { __flag_${f.name} = true; continue; }`);
        lines.push(`    if (__arg === "--no-${f.name}") { __flag_${f.name} = false; continue; }`);
      } else if (f.isRepeated) {
        lines.push(`    if (__arg === "--${f.name}") {`);
        lines.push(`      if (__i + 1 >= argv.length) { console.error("Error: --${f.name} requires a value"); process.exit(1); }`);
        lines.push(`      __flag_${f.name}.push(${this._genCoercion(`argv[++__i]`, f.typeAnnotation, f.name)});`);
        lines.push('      continue;');
        lines.push('    }');
      } else {
        lines.push(`    if (__arg === "--${f.name}") {`);
        lines.push(`      if (__i + 1 >= argv.length) { console.error("Error: --${f.name} requires a value"); process.exit(1); }`);
        lines.push(`      __flag_${f.name} = ${this._genCoercion(`argv[++__i]`, f.typeAnnotation, f.name)};`);
        lines.push('      continue;');
        lines.push('    }');
        // Support --flag=value syntax
        lines.push(`    if (__arg.startsWith("--${f.name}=")) {`);
        lines.push(`      __flag_${f.name} = ${this._genCoercion(`__arg.slice(${f.name.length + 3})`, f.typeAnnotation, f.name)};`);
        lines.push('      continue;');
        lines.push('    }');
      }
    }

    // Unknown flags
    lines.push('    if (__arg.startsWith("--")) { console.error("Error: Unknown flag " + __arg); process.exit(1); }');

    // Collect positionals
    lines.push('    __positionals.push(__arg);');
    lines.push('  }');

    // Validate and assign positionals
    for (let i = 0; i < positionals.length; i++) {
      const p = positionals[i];
      if (!p.isOptional && !p.defaultValue) {
        lines.push(`  if (__positionals.length <= ${i}) {`);
        lines.push(`    console.error("Error: Missing required argument <${p.name}>");`);
        lines.push(`    __cli_command_help_${cmd.name}();`);
        lines.push('    process.exit(1);');
        lines.push('  }');
      }
    }

    // Build call arguments
    const callArgs = [];
    for (const p of cmd.params) {
      if (p.isFlag) {
        callArgs.push(`__flag_${p.name}`);
      } else {
        const idx = positionals.indexOf(p);
        if (p.isOptional || p.defaultValue) {
          const def = p.defaultValue ? this.genExpression(p.defaultValue) : 'undefined';
          callArgs.push(`__positionals.length > ${idx} ? ${this._genCoercion(`__positionals[${idx}]`, p.typeAnnotation, p.name)} : ${def}`);
        } else {
          callArgs.push(this._genCoercion(`__positionals[${idx}]`, p.typeAnnotation, p.name));
        }
      }
    }

    const awaitPrefix = cmd.isAsync ? 'await ' : '';
    lines.push(`  ${awaitPrefix}__cmd_${cmd.name}(${callArgs.join(', ')});`);
    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Generate main entry point
   */
  _genMain(config, commands, singleCommand) {
    const lines = [];
    lines.push('async function __cli_main(argv) {');

    if (singleCommand) {
      const cmd = commands[0];
      // Single-command mode: no subcommand routing
      lines.push('  if (argv.includes("--help") || argv.includes("-h")) { __cli_help(); return; }');
      if (config.version) {
        lines.push(`  if (argv.includes("--version") || argv.includes("-v")) { console.log("${this._escStr(config.version)}"); return; }`);
      }
      lines.push(`  await __cli_dispatch_${cmd.name}(argv);`);
    } else {
      // Multi-command: subcommand routing
      lines.push('  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") { __cli_help(); return; }');
      if (config.version) {
        lines.push(`  if (argv[0] === "--version" || argv[0] === "-v") { console.log("${this._escStr(config.version)}"); return; }`);
      }
      lines.push('  const __subcmd = argv[0];');
      lines.push('  const __subargv = argv.slice(1);');
      lines.push('  switch (__subcmd) {');
      for (const cmd of commands) {
        lines.push(`    case "${cmd.name}": await __cli_dispatch_${cmd.name}(__subargv); break;`);
      }
      lines.push('    default:');
      lines.push('      console.error("Error: Unknown command \\"" + __subcmd + "\\"");');
      lines.push('      __cli_help();');
      lines.push('      process.exit(1);');
      lines.push('  }');
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Generate type coercion code for argv string → target type
   */
  _genCoercion(expr, type, name) {
    switch (type) {
      case 'Int':
        return `(function(v) { const n = parseInt(v, 10); if (isNaN(n)) { console.error("Error: --${name} must be an integer, got \\"" + v + "\\""); process.exit(1); } return n; })(${expr})`;
      case 'Float':
        return `(function(v) { const n = parseFloat(v); if (isNaN(n)) { console.error("Error: --${name} must be a number, got \\"" + v + "\\""); process.exit(1); } return n; })(${expr})`;
      case 'Bool':
        return `(${expr} === "true" || ${expr} === "1" || ${expr} === "yes")`;
      case 'String':
      default:
        return expr;
    }
  }

  /**
   * Build a usage line for a command
   */
  _buildUsageLine(cmd, config) {
    const prefix = config.name || 'cli';
    const parts = [prefix];
    // Only show command name if multi-command
    // (Caller should decide; we always include for per-command help)
    parts.push(cmd.name);

    for (const p of cmd.params) {
      if (p.isFlag) {
        if (p.typeAnnotation === 'Bool') {
          parts.push(`[--${p.name}]`);
        } else {
          parts.push(`[--${p.name} <${p.typeAnnotation || 'value'}>]`);
        }
      } else {
        if (p.isOptional || p.defaultValue) {
          parts.push(`[${p.name}]`);
        } else {
          parts.push(`<${p.name}>`);
        }
      }
    }
    return parts.join(' ');
  }

  _getCommandDescription(cmd) {
    // Could be extended to parse docstrings — for now, just the command name
    return '';
  }

  _getDefaultStr(param) {
    if (!param.defaultValue) return '';
    if (param.defaultValue.type === 'StringLiteral') return `"${param.defaultValue.value}"`;
    if (param.defaultValue.type === 'NumberLiteral') return String(param.defaultValue.value);
    if (param.defaultValue.type === 'BooleanLiteral') return String(param.defaultValue.value);
    return '...';
  }

  _escStr(s) {
    if (!s) return '';
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}
