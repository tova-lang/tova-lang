// src/cli/repl.js — Interactive REPL
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { compileTova } from './compile.js';
import { getStdlibForRuntime, color } from './utils.js';
import { VERSION } from '../version.js';
import { BUILTIN_NAMES } from '../stdlib/inline.js';

async function startRepl() {
  const readline = await import('readline');

  // ─── ANSI color helpers ──────────────────────────
  const c = {
    reset: '\x1b[0m',
    keyword: '\x1b[35m',    // magenta
    string: '\x1b[32m',     // green
    number: '\x1b[33m',     // yellow
    boolean: '\x1b[33m',    // yellow
    comment: '\x1b[90m',    // gray
    builtin: '\x1b[36m',    // cyan
    type: '\x1b[34m',       // blue
    nil: '\x1b[90m',        // gray
    prompt: '\x1b[1;36m',   // bold cyan
    result: '\x1b[90m',     // gray
    typeHint: '\x1b[2;36m', // dim cyan
  };

  const KEYWORDS = new Set([
    'fn', 'let', 'var', 'if', 'elif', 'else', 'for', 'while', 'loop', 'when',
    'in', 'return', 'match', 'type', 'import', 'from', 'and', 'or', 'not',
    'try', 'catch', 'finally', 'break', 'continue', 'async', 'await',
    'guard', 'interface', 'derive', 'pub', 'impl', 'trait', 'defer',
    'yield', 'extern', 'is', 'with', 'as', 'export', 'server', 'client', 'browser', 'shared',
  ]);

  const TYPE_NAMES = new Set([
    'Int', 'Float', 'String', 'Bool', 'Nil', 'Any', 'Result', 'Option',
    'Function', 'List', 'Object', 'Promise',
  ]);

  const RUNTIME_NAMES = new Set(['Ok', 'Err', 'Some', 'None', 'true', 'false', 'nil']);

  // ─── Syntax highlighter ──────────────────────────
  function highlight(line) {
    let out = '';
    let i = 0;
    while (i < line.length) {
      // Comments
      if (line[i] === '/' && line[i + 1] === '/') {
        out += c.comment + line.slice(i) + c.reset;
        break;
      }
      // Strings
      if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
        const quote = line[i];
        let j = i + 1;
        // Handle triple-quoted strings
        if (quote === '"' && line[j] === '"' && line[j + 1] === '"') {
          j += 2;
          while (j < line.length && !(line[j] === '"' && line[j + 1] === '"' && line[j + 2] === '"')) j++;
          if (j < line.length) j += 3;
          out += c.string + line.slice(i, j) + c.reset;
          i = j;
          continue;
        }
        while (j < line.length && line[j] !== quote) {
          if (line[j] === '\\') j++;
          j++;
        }
        if (j < line.length) j++;
        out += c.string + line.slice(i, j) + c.reset;
        i = j;
        continue;
      }
      // Numbers
      if (/[0-9]/.test(line[i]) && (i === 0 || !/[a-zA-Z_]/.test(line[i - 1]))) {
        let j = i;
        while (j < line.length && /[0-9._eExXbBoO]/.test(line[j])) j++;
        out += c.number + line.slice(i, j) + c.reset;
        i = j;
        continue;
      }
      // Identifiers and keywords
      if (/[a-zA-Z_]/.test(line[i])) {
        let j = i;
        while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
        const word = line.slice(i, j);
        if (KEYWORDS.has(word)) {
          out += c.keyword + word + c.reset;
        } else if (TYPE_NAMES.has(word)) {
          out += c.type + word + c.reset;
        } else if (RUNTIME_NAMES.has(word)) {
          out += c.boolean + word + c.reset;
        } else if (BUILTIN_NAMES.has(word)) {
          out += c.builtin + word + c.reset;
        } else {
          out += word;
        }
        i = j;
        continue;
      }
      out += line[i];
      i++;
    }
    return out;
  }

  // ─── Tab completions ─────────────────────────────
  const completionWords = [
    ...KEYWORDS, ...TYPE_NAMES, ...RUNTIME_NAMES, ...BUILTIN_NAMES,
    ':quit', ':exit', ':help', ':clear', ':type',
  ];
  const userDefinedNames = new Set();

  function completer(line) {
    const allWords = [...new Set([...completionWords, ...userDefinedNames])];
    // Find the last word being typed
    const match = line.match(/([a-zA-Z_:][a-zA-Z0-9_]*)$/);
    if (!match) return [[], line];
    const prefix = match[1];
    const hits = allWords.filter(w => w.startsWith(prefix));
    return [hits, prefix];
  }

  // ─── Type display helper ─────────────────────────
  function inferType(val) {
    if (val === null || val === undefined) return 'Nil';
    if (Array.isArray(val)) {
      if (val.length === 0) return '[_]';
      const elemType = inferType(val[0]);
      return `[${elemType}]`;
    }
    if (val?.__tag) return val.__tag;
    if (typeof val === 'number') return Number.isInteger(val) ? 'Int' : 'Float';
    if (typeof val === 'string') return 'String';
    if (typeof val === 'boolean') return 'Bool';
    if (typeof val === 'function') return 'Function';
    if (typeof val === 'object') return 'Object';
    return 'Unknown';
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${c.prompt}tova>${c.reset} `,
    completer,
  });

  console.log(`\n  Tova REPL v${VERSION}`);
  console.log('  Type expressions to evaluate. Use :quit to exit.');
  console.log('  Use _ to reference the last result. Tab for completions.\n');

  const context = {};
  const stdlib = getStdlibForRuntime();
  // Use authoritative BUILTIN_NAMES + runtime names (Ok, Err, Some, None, __propagate)
  // Filter out internal __ prefixed names that don't define a same-named variable
  const stdlibNames = [...BUILTIN_NAMES].filter(n => !n.startsWith('__')).concat(['Ok', 'Err', 'Some', 'None', '__propagate']);
  // REPL context: initializing stdlib in eval context (intentional dynamic eval)
  const initFn = new Function(stdlib + '\nObject.assign(this, {' + stdlibNames.join(',') + '});');
  initFn.call(context);

  let buffer = '';
  let braceDepth = 0;

  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();

    if (trimmed === ':quit' || trimmed === ':exit' || trimmed === ':q') {
      console.log('  Goodbye!\n');
      rl.close();
      process.exit(0);
    }

    if (trimmed === ':help') {
      console.log('  :quit    Exit the REPL');
      console.log('  :help    Show this help');
      console.log('  :clear   Clear context');
      console.log('  :type    Show inferred type of expression');
      console.log('  _        Reference the last result');
      console.log('  Tab      Autocomplete keywords, builtins, and variables\n');
      rl.prompt();
      return;
    }

    if (trimmed.startsWith(':type ')) {
      const expr = trimmed.slice(6).trim();
      try {
        const output = compileTova(expr, '<repl>', { sourceMaps: false });
        const code = output.shared || '';
        const ctxKeys = Object.keys(context).filter(k => k !== '__mutable');
        const destructure = ctxKeys.length > 0 ? `const {${ctxKeys.join(',')}} = __ctx;\n` : '';
        // REPL context: evaluating user-provided Tova expressions (intentional dynamic eval)
        const fn = new Function('__ctx', `${destructure}return (${code.replace(/;$/, '')});`);
        const val = fn(context);
        const typeStr = val === null ? 'Nil' : Array.isArray(val) ? 'List' : val?.__tag ? val.__tag : typeof val === 'number' ? (Number.isInteger(val) ? 'Int' : 'Float') : typeof val === 'string' ? 'String' : typeof val === 'boolean' ? 'Bool' : typeof val === 'function' ? 'Function' : typeof val === 'object' ? 'Object' : 'Unknown';
        console.log(`  ${expr} : ${typeStr}`);
      } catch (err) {
        console.error(`  Error: ${err.message}`);
      }
      rl.prompt();
      return;
    }

    if (trimmed === ':clear') {
      for (const key of Object.keys(context)) delete context[key];
      delete context.__mutable;
      initFn.call(context);
      userDefinedNames.clear();
      console.log('  Context cleared.\n');
      rl.prompt();
      return;
    }

    // Handle import statements
    const tovaImportMatch = trimmed.match(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]*\.tova)['"]\s*$/);
    const npmImportNamedMatch = !tovaImportMatch && trimmed.match(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]\s*$/);
    const npmImportDefaultMatch = !tovaImportMatch && !npmImportNamedMatch && trimmed.match(/^import\s+([\w$]+)\s+from\s+['"]([^'"]+)['"]\s*$/);

    if (tovaImportMatch) {
      // .tova file import: compile and inject into context
      const names = tovaImportMatch[1].split(',').map(n => n.trim()).filter(Boolean);
      const modulePath = resolve(process.cwd(), tovaImportMatch[2]);
      try {
        if (!existsSync(modulePath)) {
          throw new Error(`Module not found: ${tovaImportMatch[2]}`);
        }
        const modSource = readFileSync(modulePath, 'utf-8');
        const modOutput = compileTova(modSource, modulePath);
        let modCode = (modOutput.shared || '');
        // Strip export keywords
        modCode = modCode.replace(/^export /gm, '');
        // REPL context: executing compiled Tova module code (intentional dynamic eval)
        const modFn = new Function('__ctx', modCode + '\n' + names.map(n => `__ctx.${n} = ${n};`).join('\n'));
        modFn(context);
        console.log(`  Imported { ${names.join(', ')} } from ${tovaImportMatch[2]}`);
      } catch (err) {
        console.error(`  Error: ${err.message}`);
      }
      rl.prompt();
      return;
    }

    if (npmImportNamedMatch || npmImportDefaultMatch) {
      // npm/JS module import via dynamic import()
      const moduleName = (npmImportNamedMatch || npmImportDefaultMatch)[2];
      try {
        const mod = await import(moduleName);
        if (npmImportNamedMatch) {
          const names = npmImportNamedMatch[1].split(',').map(n => n.trim()).filter(Boolean);
          for (const name of names) {
            if (name in mod) {
              context[name] = mod[name];
            } else {
              console.error(`  Warning: '${name}' not found in '${moduleName}'`);
            }
          }
          console.log(`  Imported { ${names.join(', ')} } from ${moduleName}`);
        } else {
          const name = npmImportDefaultMatch[1];
          context[name] = mod.default || mod;
          console.log(`  Imported ${name} from ${moduleName}`);
        }
      } catch (err) {
        console.error(`  Error: ${err.message}`);
      }
      rl.prompt();
      return;
    }

    buffer += (buffer ? '\n' : '') + line;

    // Track open braces for multi-line input (skip braces inside strings)
    let inStr = null;
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (inStr) {
        if (ch === '\\') { ci++; continue; }
        if (ch === inStr) inStr = null;
      } else {
        if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
        if (ch === '{' || ch === '(' || ch === '[') braceDepth++;
        if (ch === '}' || ch === ')' || ch === ']') braceDepth--;
      }
    }

    if (braceDepth > 0) {
      process.stdout.write(`${c.prompt}...${c.reset}  `);
      return;
    }

    braceDepth = 0;
    const input = buffer;
    buffer = '';

    try {
      const output = compileTova(input, '<repl>', { suppressWarnings: true, sourceMaps: false });
      const code = output.shared || '';
      if (code.trim()) {
        // Extract function/const/let names from compiled code
        const declaredInCode = new Set();
        for (const m of code.matchAll(/\bfunction\s+([a-zA-Z_]\w*)/g)) { declaredInCode.add(m[1]); userDefinedNames.add(m[1]); }
        for (const m of code.matchAll(/\bconst\s+([a-zA-Z_]\w*)/g)) { declaredInCode.add(m[1]); userDefinedNames.add(m[1]); }
        // Extract destructured names: const { a, b } = ... or const [ a, b ] = ...
        for (const m of code.matchAll(/\bconst\s+\{\s*([^}]+)\}/g)) {
          for (const part of m[1].split(',')) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            // Handle renaming: "key: alias" or "key: alias = default" — extract the alias
            const colonMatch = trimmed.match(/^\w+\s*:\s*([a-zA-Z_]\w*)/);
            const name = colonMatch ? colonMatch[1] : trimmed.match(/^([a-zA-Z_]\w*)/)?.[1];
            if (name) { declaredInCode.add(name); userDefinedNames.add(name); }
          }
        }
        for (const m of code.matchAll(/\bconst\s+\[\s*([^\]]+)\]/g)) {
          for (const part of m[1].split(',')) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            const name = trimmed.startsWith('...') ? trimmed.slice(3).trim() : trimmed;
            const id = name.match(/^([a-zA-Z_]\w*)/)?.[1];
            if (id) { declaredInCode.add(id); userDefinedNames.add(id); }
          }
        }
        for (const m of code.matchAll(/\blet\s+([a-zA-Z_]\w*)/g)) {
          declaredInCode.add(m[1]);
          userDefinedNames.add(m[1]);
          // Track mutable variables for proper let destructuring
          if (!context.__mutable) context.__mutable = new Set();
          context.__mutable.add(m[1]);
        }

        // Fix REPL reassignment: when compiled code declares variables that
        // already exist in context, convert to reassignment to avoid TDZ errors.
        // e.g., "a, b = b, a" compiles to "const [a, b] = [b, a];" but b/a on
        // the RHS are in TDZ because they're excluded from context destructure.
        let replCode = code;
        // Array/tuple destructuring: const [a, b] = [...] → [a, b] = [...]
        replCode = replCode.replace(/^(const|let)\s+(\[[^\]]+\])\s*=/gm, (match, kw, targets) => {
          const names = targets.slice(1, -1).split(',').map(n => n.trim()).filter(Boolean);
          if (names.length > 0 && names.every(n => n in context)) {
            for (const n of names) {
              declaredInCode.delete(n);
              if (!context.__mutable) context.__mutable = new Set();
              context.__mutable.add(n);
            }
            return `${targets} =`;
          }
          return match;
        });
        // Single variable: const x = expr → x = expr (when x exists in context)
        replCode = replCode.replace(/^(const|let)\s+([a-zA-Z_]\w*)\s*=/gm, (match, kw, name) => {
          if (name in context) {
            declaredInCode.delete(name);
            if (!context.__mutable) context.__mutable = new Set();
            context.__mutable.add(name);
            return `${name} =`;
          }
          return match;
        });

        // Save declared variables back to context for persistence across inputs
        const saveNewDecls = declaredInCode.size > 0
          ? [...declaredInCode].map(n => `if(typeof ${n}!=='undefined')__ctx.${n}=${n};`).join('\n')
          : '';
        // Also save mutable variables that may have been modified (not newly declared)
        const mutKeys = context.__mutable
          ? [...context.__mutable].filter(n => !declaredInCode.has(n) && n in context)
          : [];
        const saveMut = mutKeys.map(n => `__ctx.${n}=${n};`).join('\n');
        const allSave = [saveNewDecls, saveMut].filter(Boolean).join('\n');

        // Context destructuring: use let for mutable, const for immutable
        const ctxKeys = Object.keys(context).filter(k => !declaredInCode.has(k) && k !== '__mutable');
        const constKeys = ctxKeys.filter(k => !context.__mutable || !context.__mutable.has(k));
        const letKeys = ctxKeys.filter(k => context.__mutable && context.__mutable.has(k));
        const destructure =
          (constKeys.length > 0 ? `const {${constKeys.join(',')}} = __ctx;\n` : '') +
          (letKeys.length > 0 ? `let {${letKeys.join(',')}} = __ctx;\n` : '');

        // Try wrapping last expression statement as a return for value display
        const lines = replCode.trim().split('\n');
        const lastLine = lines[lines.length - 1].trim();
        let evalCode = replCode;
        // For simple assignments (const x = expr;), echo the assigned value
        const constAssignMatch = lastLine.match(/^(const|let)\s+([a-zA-Z_]\w*)\s*=\s*(.+);?$/);
        if (constAssignMatch) {
          const varName = constAssignMatch[2];
          if (allSave) {
            evalCode = `${replCode}\n${allSave}\nreturn ${varName};`;
          } else {
            evalCode = `${replCode}\nreturn ${varName};`;
          }
        } else if (!/^(const |let |var |function |if |for |while |class |try |switch )/.test(lastLine) && !lastLine.endsWith('{')) {
          // Replace the last statement with a return
          const allButLast = lines.slice(0, -1).join('\n');
          // Strip trailing semicolon from last line for the return
          const returnExpr = lastLine.endsWith(';') ? lastLine.slice(0, -1) : lastLine;
          // Use try/finally so save runs after return expression evaluates (captures updated mutable values)
          if (allSave) {
            evalCode = `try {\n${allButLast}\nreturn (${returnExpr});\n} finally {\n${allSave}\n}`;
          } else {
            evalCode = allButLast + (allButLast ? '\n' : '') + `return (${returnExpr});`;
          }
        } else {
          evalCode = replCode + (allSave ? '\n' + allSave : '');
        }
        try {
          // REPL context: evaluating compiled Tova code (intentional dynamic eval)
          const fn = new Function('__ctx', `${destructure}${evalCode}`);
          const result = fn(context);
          if (result !== undefined) {
            context._ = result; // Save as last result
            const typeStr = inferType(result);
            console.log(`  ${result} ${c.typeHint}: ${typeStr}${c.reset}`);
          }
        } catch (e) {
          // If return-wrapping fails, fall back to plain execution
          const fallbackCode = replCode + (allSave ? '\n' + allSave : '');
          // REPL context: fallback execution of compiled Tova code (intentional dynamic eval)
          const fn = new Function('__ctx', `${destructure}${fallbackCode}`);
          fn(context);
        }
      }
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

export { startRepl };
