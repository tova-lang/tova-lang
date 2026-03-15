import { resolve, dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { createRequire as _createRequire } from 'module';
import { compileTova } from './compile.js';
import { getRunStdlib } from './utils.js';
import { resolveConfig } from '../config/resolve.js';
import { richError } from '../diagnostics/formatter.js';

export async function runFile(filePath, options = {}) {
  if (!filePath) {
    // If tova.toml exists, try to find a main file in the entry directory
    const config = resolveConfig(process.cwd());
    if (config._source === 'tova.toml') {
      const entryDir = resolve(config.project.entry || '.');
      for (const name of ['main.tova', 'app.tova']) {
        const candidate = join(entryDir, name);
        if (existsSync(candidate)) {
          filePath = candidate;
          break;
        }
      }
    }
    if (!filePath) {
      console.error('Error: No file specified');
      console.error('Usage: tova run <file.tova>');
      process.exit(1);
    }
  }

  const resolved = resolve(filePath);
  if (!existsSync(resolved)) {
    console.error(`Error: File not found: ${resolved}`);
    process.exit(1);
  }

  const source = readFileSync(resolved, 'utf-8');

  try {
    // Detect local .tova imports (with or without .tova extension)
    const importDetectRegex = /import\s+(?:\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+['"]([^'"]+)['"]/gm;
    let importMatch;
    const tovaImportPaths = [];
    while ((importMatch = importDetectRegex.exec(source)) !== null) {
      const importSource = importMatch[1];
      if (!importSource.startsWith('.') && !importSource.startsWith('/')) continue;
      let depPath = resolve(dirname(resolved), importSource);
      if (!depPath.endsWith('.tova') && existsSync(depPath + '.tova')) {
        depPath = depPath + '.tova';
      }
      if (depPath.endsWith('.tova') && existsSync(depPath)) {
        tovaImportPaths.push({ source: importSource, resolved: depPath });
      }
    }
    const hasTovaImports = tovaImportPaths.length > 0;

    const output = compileTova(source, filePath, { strict: options.strict, strictSecurity: options.strictSecurity });

    // Execute the generated JavaScript (with stdlib)
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const stdlib = getRunStdlib();
    const __tova_require = _createRequire(import.meta.url);

    // CLI mode: execute the cli code directly
    if (output.isCli) {
      let code = stdlib + '\n' + output.cli;
      code = code.replace(/^export /gm, '');
      // Override process.argv for cli dispatch
      const scriptArgs = options.scriptArgs || [];
      code = `process.argv = ["node", ${JSON.stringify(resolved)}, ...${JSON.stringify(scriptArgs)}];\n` + code;
      const fn = new AsyncFunction('__tova_args', '__tova_filename', '__tova_dirname', 'require', code);
      await fn(scriptArgs, resolved, dirname(resolved), __tova_require);
      return;
    }

    // Compile .tova dependencies and inline them (recursively)
    let depCode = '';
    if (hasTovaImports) {
      const compiled = new Set();
      const resolveTovaImportsRecursive = (filePath) => {
        if (compiled.has(filePath)) return;
        compiled.add(filePath);

        const depSource = readFileSync(filePath, 'utf-8');

        // Scan for transitive .tova imports
        const transitiveRegex = /import\s+(?:\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+['"]([^'"]+)['"]/g;
        let transitiveMatch;
        while ((transitiveMatch = transitiveRegex.exec(depSource)) !== null) {
          const importSource = transitiveMatch[1];
          if (!importSource.startsWith('.') && !importSource.startsWith('/')) continue;
          let transitivePath = resolve(dirname(filePath), importSource);
          if (!transitivePath.endsWith('.tova') && existsSync(transitivePath + '.tova')) {
            transitivePath = transitivePath + '.tova';
          }
          if (transitivePath.endsWith('.tova') && existsSync(transitivePath)) {
            resolveTovaImportsRecursive(transitivePath);
          }
        }

        // Compile this dependency
        const dep = compileTova(depSource, filePath, { strict: options.strict });
        let depShared = dep.shared || '';
        depShared = depShared.replace(/^export /gm, '');
        depCode += depShared + '\n';
      };

      for (const imp of tovaImportPaths) {
        resolveTovaImportsRecursive(imp.resolved);
      }
    }

    let code = stdlib + '\n' + depCode + (output.shared || '') + '\n' + (output.server || output.browser || '');
    // Strip 'export ' keywords — not valid inside AsyncFunction (used in tova build only)
    code = code.replace(/^export /gm, '');
    // Strip import lines for local modules (already inlined above)
    code = code.replace(/^import\s+(?:\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+['"][^'"]*\.(?:tova|(?:shared\.)?js)['"];?\s*$/gm, '');
    if (hasTovaImports) {
      for (const imp of tovaImportPaths) {
        const escaped = imp.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        code = code.replace(new RegExp('^import\\s+(?:\\{[^}]*\\}|[\\w$]+|\\*\\s+as\\s+[\\w$]+)\\s+from\\s+[\'"]' + escaped + '[\'"];?\\s*$', 'gm'), '');
      }
    }
    // Auto-call main() if the compiled code defines a main function
    const scriptArgs = options.scriptArgs || [];
    if (/\bfunction\s+main\s*\(/.test(code)) {
      code += '\nconst __tova_exit = await main(__tova_args); if (typeof __tova_exit === "number") process.exitCode = __tova_exit;\n';
    }
    const fn = new AsyncFunction('__tova_args', '__tova_filename', '__tova_dirname', 'require', code);
    await fn(scriptArgs, resolved, dirname(resolved), __tova_require);
  } catch (err) {
    console.error(richError(source, err, filePath));
    if (process.argv.includes('--debug') || process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}
