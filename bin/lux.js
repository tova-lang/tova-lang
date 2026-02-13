#!/usr/bin/env bun

import { resolve, basename, dirname, join, relative } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, watch as fsWatch } from 'fs';
import { spawn } from 'child_process';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { richError, formatDiagnostics, DiagnosticFormatter } from '../src/diagnostics/formatter.js';
import { getFullStdlib, BUILTINS, PROPAGATE } from '../src/stdlib/inline.js';
import { Formatter } from '../src/formatter/formatter.js';
import '../src/runtime/string-proto.js';

const VERSION = '0.1.0';

const HELP = `
  ╦  ╦ ╦═╗ ╦
  ║  ║ ║ ║ ╠╣
  ╩═╝╚═╝╩═╝╩  v${VERSION}

  A modern full-stack language that transpiles to JavaScript

Usage:
  lux <command> [options] [arguments]

Commands:
  run <file>       Compile and execute a .lux file
  build [dir]      Compile .lux files to JavaScript (default: current dir)
  dev              Start development server with file watching
  repl             Start interactive Lux REPL
  lsp              Start Language Server Protocol server
  new <name>       Create a new Lux project
  fmt <file>      Format a .lux file (--check to verify only)
  test [dir]      Run test blocks in .lux files (--filter, --watch)
  migrate:create <name>   Create a new migration file
  migrate:up [file.lux]   Run pending migrations
  migrate:status [file.lux] Show migration status

Options:
  --help, -h       Show this help message
  --version, -v    Show version
  --output, -o     Output directory (default: .lux-out)
  --production     Production build (minify, bundle, hash)
  --watch          Watch for file changes
  --debug          Show verbose error output
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`Lux v${VERSION}`);
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'run':
      await runFile(args[1]);
      break;
    case 'build':
      buildProject(args.slice(1));
      break;
    case 'dev':
      devServer(args.slice(1));
      break;
    case 'repl':
      await startRepl();
      break;
    case 'lsp':
      await startLsp();
      break;
    case 'new':
      newProject(args[1]);
      break;
    case 'fmt':
      formatFile(args.slice(1));
      break;
    case 'test':
      await runTests(args.slice(1));
      break;
    case 'migrate:create':
      migrateCreate(args[1]);
      break;
    case 'migrate:up':
      await migrateUp(args.slice(1));
      break;
    case 'migrate:status':
      await migrateStatus(args.slice(1));
      break;
    default:
      if (command.endsWith('.lux')) {
        await runFile(command);
      } else {
        console.error(`Unknown command: ${command}`);
        console.log(HELP);
        process.exit(1);
      }
  }
}

// ─── Compile a .lux source string ───────────────────────────

function compileLux(source, filename) {
  const lexer = new Lexer(source, filename);
  const tokens = lexer.tokenize();

  const parser = new Parser(tokens, filename);
  const ast = parser.parse();

  const analyzer = new Analyzer(ast, filename);
  const { warnings } = analyzer.analyze();

  if (warnings.length > 0) {
    const formatter = new DiagnosticFormatter(source, filename);
    for (const w of warnings) {
      console.warn(formatter.formatWarning(w.message, { line: w.line, column: w.column }));
    }
  }

  const codegen = new CodeGenerator(ast, filename);
  return codegen.generate();
}

// ─── Format ─────────────────────────────────────────────────

function formatFile(args) {
  const checkOnly = args.includes('--check');
  const files = args.filter(a => !a.startsWith('--'));

  if (files.length === 0) {
    console.error('Error: No file specified');
    console.error('Usage: lux fmt <file.lux> [--check]');
    process.exit(1);
  }

  let hasChanges = false;

  for (const filePath of files) {
    const resolved = resolve(filePath);
    if (!existsSync(resolved)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }

    const source = readFileSync(resolved, 'utf-8');
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, resolved);
    const ast = parser.parse();
    const formatter = new Formatter();
    const formatted = formatter.format(ast);

    if (checkOnly) {
      if (formatted !== source) {
        console.log(`Would reformat: ${filePath}`);
        hasChanges = true;
      }
    } else {
      if (formatted !== source) {
        writeFileSync(resolved, formatted);
        console.log(`Formatted: ${filePath}`);
      } else {
        console.log(`Already formatted: ${filePath}`);
      }
    }
  }

  if (checkOnly && hasChanges) {
    process.exit(1);
  }
}

// ─── Test Runner ────────────────────────────────────────────

async function runTests(args) {
  const filterPattern = args.find((a, i) => args[i - 1] === '--filter') || null;
  const watchMode = args.includes('--watch');
  const targetDir = args.find(a => !a.startsWith('--') && a !== filterPattern) || '.';

  // Find all .lux files with test blocks
  const luxFiles = findLuxFiles(resolve(targetDir));
  const testFiles = [];

  for (const file of luxFiles) {
    const source = readFileSync(file, 'utf-8');
    // Quick check for test blocks
    if (/\btest\s+["'{]/m.test(source) || /\btest\s*\{/m.test(source)) {
      testFiles.push(file);
    }
  }

  if (testFiles.length === 0) {
    console.log('No test files found.');
    return;
  }

  console.log(`Found ${testFiles.length} test file(s)\n`);

  // Compile test files to temp directory
  const tmpDir = resolve('.lux-test-out');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const compiledFiles = [];

  for (const file of testFiles) {
    try {
      const source = readFileSync(file, 'utf-8');
      const lexer = new Lexer(source, file);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, file);
      const ast = parser.parse();

      const codegen = new CodeGenerator(ast, file);
      const result = codegen.generate();

      if (result.test) {
        const relPath = relative(resolve(targetDir), file).replace(/\.lux$/, '.test.js');
        const outPath = join(tmpDir, relPath);
        const outDir = dirname(outPath);
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

        // Include stdlib + shared code + test code
        const stdlib = getFullStdlib();
        const fullTest = result.test;
        writeFileSync(outPath, fullTest);
        compiledFiles.push(outPath);
        console.log(`  Compiled: ${relative('.', file)}`);
      }
    } catch (err) {
      console.error(`  Error compiling ${relative('.', file)}: ${err.message}`);
    }
  }

  if (compiledFiles.length === 0) {
    console.log('\nNo test blocks compiled.');
    return;
  }

  console.log(`\nRunning ${compiledFiles.length} test file(s)...\n`);

  // Run tests via bun test
  const bunArgs = ['test', ...compiledFiles];
  if (filterPattern) {
    bunArgs.push('-t', filterPattern);
  }

  const runBunTest = () => {
    return new Promise((res) => {
      const proc = spawn('bun', bunArgs, { stdio: 'inherit' });
      proc.on('close', (code) => res(code));
    });
  };

  const exitCode = await runBunTest();

  if (watchMode) {
    console.log('\nWatching for changes... (Ctrl+C to stop)\n');
    const watched = resolve(targetDir);
    fsWatch(watched, { recursive: true }, async (event, filename) => {
      if (filename && filename.endsWith('.lux')) {
        console.log(`\nFile changed: ${filename}\n`);
        // Recompile and re-run
        await runTests(args.filter(a => a !== '--watch'));
      }
    });
  } else {
    // Clean up temp dir on exit (non-watch mode)
    process.exitCode = exitCode;
  }
}

function findLuxFiles(dir) {
  const files = [];
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return files;
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...findLuxFiles(full));
    } else if (entry.endsWith('.lux')) {
      files.push(full);
    }
  }
  return files;
}

// ─── Run ────────────────────────────────────────────────────

async function runFile(filePath) {
  if (!filePath) {
    console.error('Error: No file specified');
    console.error('Usage: lux run <file.lux>');
    process.exit(1);
  }

  const resolved = resolve(filePath);
  if (!existsSync(resolved)) {
    console.error(`Error: File not found: ${resolved}`);
    process.exit(1);
  }

  const source = readFileSync(resolved, 'utf-8');

  try {
    const output = compileLux(source, filePath);

    // Execute the generated JavaScript (with stdlib)
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const stdlib = getRunStdlib();
    const code = stdlib + '\n' + (output.shared || '') + '\n' + (output.server || output.client || '');
    const fn = new AsyncFunction(code);
    await fn();
  } catch (err) {
    console.error(richError(source, err, filePath));
    if (process.argv.includes('--debug') || process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// ─── Build ──────────────────────────────────────────────────

async function buildProject(args) {
  const isProduction = args.includes('--production');
  const srcDir = resolve(args.filter(a => !a.startsWith('--'))[0] || '.');
  const outIdx = args.indexOf('--output');
  const outDir = resolve(outIdx >= 0 ? args[outIdx + 1] : '.lux-out');

  // Production build uses a separate optimized pipeline
  if (isProduction) {
    return await productionBuild(srcDir, outDir);
  }

  const luxFiles = findFiles(srcDir, '.lux');
  if (luxFiles.length === 0) {
    console.error('No .lux files found');
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });

  // Copy runtime files to output directory
  const luxRoot = resolve(dirname(import.meta.url.replace('file://', '')), '..');
  const runtimeSrc = join(luxRoot, 'src', 'runtime');
  const runtimeDest = join(outDir, 'runtime');
  mkdirSync(runtimeDest, { recursive: true });
  for (const file of ['reactivity.js', 'rpc.js', 'router.js']) {
    const src = join(runtimeSrc, file);
    if (existsSync(src)) {
      copyFileSync(src, join(runtimeDest, file));
    }
  }

  console.log(`\n  Building ${luxFiles.length} file(s)...\n`);

  let errorCount = 0;
  compilationCache.clear();
  for (const file of luxFiles) {
    const rel = relative(srcDir, file);
    try {
      const source = readFileSync(file, 'utf-8');
      const output = compileWithImports(source, file, srcDir);
      const baseName = basename(file, '.lux');

      // Generate source map if mappings available
      const generateSourceMap = (code, jsFile) => {
        if (output.sourceMappings && output.sourceMappings.length > 0) {
          const smb = new SourceMapBuilder(rel);
          for (const m of output.sourceMappings) {
            smb.addMapping(m.sourceLine, m.sourceCol, m.outputLine, m.outputCol);
          }
          const mapFile = jsFile + '.map';
          writeFileSync(mapFile, smb.generate(source));
          return code + `\n//# sourceMappingURL=${basename(mapFile)}`;
        }
        return code;
      };

      // Write shared
      if (output.shared && output.shared.trim()) {
        const sharedPath = join(outDir, `${baseName}.shared.js`);
        writeFileSync(sharedPath, generateSourceMap(output.shared, sharedPath));
        console.log(`  ✓ ${rel} → ${relative('.', sharedPath)}`);
      }

      // Write default server
      if (output.server) {
        const serverPath = join(outDir, `${baseName}.server.js`);
        writeFileSync(serverPath, generateSourceMap(output.server, serverPath));
        console.log(`  ✓ ${rel} → ${relative('.', serverPath)}`);
      }

      // Write default client
      if (output.client) {
        const clientPath = join(outDir, `${baseName}.client.js`);
        writeFileSync(clientPath, generateSourceMap(output.client, clientPath));
        console.log(`  ✓ ${rel} → ${relative('.', clientPath)}`);
      }

      // Write named server blocks (multi-block)
      if (output.multiBlock && output.servers) {
        for (const [name, code] of Object.entries(output.servers)) {
          if (name === 'default') continue; // already written above
          const path = join(outDir, `${baseName}.server.${name}.js`);
          writeFileSync(path, code);
          console.log(`  ✓ ${rel} → ${relative('.', path)} [server:${name}]`);
        }
      }

      // Write named client blocks (multi-block)
      if (output.multiBlock && output.clients) {
        for (const [name, code] of Object.entries(output.clients)) {
          if (name === 'default') continue;
          const path = join(outDir, `${baseName}.client.${name}.js`);
          writeFileSync(path, code);
          console.log(`  ✓ ${rel} → ${relative('.', path)} [client:${name}]`);
        }
      }
    } catch (err) {
      console.error(`  ✗ ${rel}: ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\n  Build complete. ${luxFiles.length - errorCount}/${luxFiles.length} succeeded.\n`);
  if (errorCount > 0) process.exit(1);
}

// ─── Dev Server ─────────────────────────────────────────────

async function devServer(args) {
  const srcDir = resolve(args[0] || '.');
  const basePort = parseInt(args.find((_, i, a) => a[i - 1] === '--port') || '3000');

  const luxFiles = findFiles(srcDir, '.lux');
  if (luxFiles.length === 0) {
    console.error('No .lux files found');
    process.exit(1);
  }

  console.log(`\n  Lux dev server starting...\n`);

  // Compile all files
  const outDir = join(srcDir, '.lux-out');
  mkdirSync(outDir, { recursive: true });

  // Copy runtime files to output directory
  const luxRoot = resolve(dirname(import.meta.url.replace('file://', '')), '..');
  const runtimeSrc = join(luxRoot, 'src', 'runtime');
  const runtimeDest = join(outDir, 'runtime');
  mkdirSync(runtimeDest, { recursive: true });
  for (const file of ['reactivity.js', 'rpc.js', 'router.js']) {
    const src = join(runtimeSrc, file);
    if (existsSync(src)) {
      copyFileSync(src, join(runtimeDest, file));
    }
  }

  const serverFiles = [];
  let hasClient = false;

  for (const file of luxFiles) {
    try {
      const source = readFileSync(file, 'utf-8');
      const output = compileLux(source, file);
      const baseName = basename(file, '.lux');

      if (output.shared && output.shared.trim()) {
        writeFileSync(join(outDir, `${baseName}.shared.js`), output.shared);
      }

      // Default client (generate HTML first so server can embed it)
      let clientHTML = '';
      if (output.client) {
        const p = join(outDir, `${baseName}.client.js`);
        writeFileSync(p, output.client);
        clientHTML = generateDevHTML(output.client);
        writeFileSync(join(outDir, 'index.html'), clientHTML);
        hasClient = true;
      }

      // Default server (inject client HTML for serving at /)
      if (output.server) {
        let serverCode = output.server;
        if (clientHTML) {
          // Inject __clientHTML constant before the request handler
          const htmlConst = `const __clientHTML = ${JSON.stringify(clientHTML)};\n`;
          serverCode = htmlConst + serverCode;
        }
        const p = join(outDir, `${baseName}.server.js`);
        writeFileSync(p, serverCode);
        serverFiles.push({ path: p, name: 'default', baseName });
      }

      // Named server blocks
      if (output.multiBlock && output.servers) {
        for (const [name, code] of Object.entries(output.servers)) {
          if (name === 'default') continue;
          const p = join(outDir, `${baseName}.server.${name}.js`);
          writeFileSync(p, code);
          serverFiles.push({ path: p, name, baseName });
        }
      }

      // Named client blocks
      if (output.multiBlock && output.clients) {
        for (const [name, code] of Object.entries(output.clients)) {
          if (name === 'default') continue;
          const p = join(outDir, `${baseName}.client.${name}.js`);
          writeFileSync(p, code);
        }
      }
    } catch (err) {
      console.error(`  ✗ ${relative(srcDir, file)}: ${err.message}`);
    }
  }

  console.log(`  ✓ Compiled ${luxFiles.length} file(s)`);
  console.log(`  ✓ Output: ${relative('.', outDir)}/`);

  // Orchestrate: spawn each server block as a separate Bun process
  const processes = [];
  let portOffset = 0;

  for (const sf of serverFiles) {
    const port = basePort + portOffset;
    const label = sf.name === 'default' ? 'server' : `server:${sf.name}`;
    const envKey = sf.name === 'default'
      ? 'PORT'
      : `PORT_${sf.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

    console.log(`  ✓ Starting ${label} on port ${port}`);

    const child = spawn('bun', ['run', sf.path], {
      stdio: 'inherit',
      env: { ...process.env, [envKey]: String(port), PORT: String(port) },
    });

    child.on('error', (err) => {
      console.error(`  ✗ ${label} failed: ${err.message}`);
    });

    processes.push({ child, label, port });
    portOffset++;
  }

  if (processes.length > 0) {
    console.log(`\n  ${processes.length} server process(es) running`);
    for (const p of processes) {
      console.log(`    → ${p.label}: http://localhost:${p.port}`);
    }
  }

  if (hasClient) {
    console.log(`  ✓ Client: ${relative('.', outDir)}/index.html`);
  }

  // Start file watcher for auto-rebuild
  const watcher = startWatcher(srcDir, async () => {
    console.log('  Rebuilding...');

    // Recompile first — keep old processes alive until success
    const currentFiles = findFiles(srcDir, '.lux');
    const newServerFiles = [];
    try {
      for (const file of currentFiles) {
        const source = readFileSync(file, 'utf-8');
        const output = compileLux(source, file);
        const baseName = basename(file, '.lux');

        if (output.shared && output.shared.trim()) {
          writeFileSync(join(outDir, `${baseName}.shared.js`), output.shared);
        }
        if (output.client) {
          writeFileSync(join(outDir, `${baseName}.client.js`), output.client);
          const html = generateDevHTML(output.client);
          writeFileSync(join(outDir, 'index.html'), html);
        }
        if (output.server) {
          let serverCode = output.server;
          if (output.client) {
            const html = generateDevHTML(output.client);
            serverCode = `const __clientHTML = ${JSON.stringify(html)};\n` + serverCode;
          }
          const p = join(outDir, `${baseName}.server.js`);
          writeFileSync(p, serverCode);
          newServerFiles.push(p);
        }
      }
    } catch (err) {
      console.error(`  ✗ Rebuild failed: ${err.message}`);
      return; // Keep old processes running
    }

    // Compilation succeeded — now kill old processes and wait for exit
    const killPromises = processes.map(p => new Promise(resolve => {
      p.child.once('exit', resolve);
      p.child.kill('SIGTERM');
      setTimeout(() => {
        try { p.child.kill('SIGKILL'); } catch {}
        resolve();
      }, 2000); // Escalate to SIGKILL after timeout
    }));
    await Promise.all(killPromises);
    processes.length = 0;

    // Spawn new processes with correct port offsets
    let rebuildPortOffset = 0;
    for (const serverPath of newServerFiles) {
      const port = basePort + rebuildPortOffset;
      const child = spawn('bun', ['run', serverPath], {
        stdio: 'inherit',
        env: { ...process.env, PORT: String(port) },
      });
      processes.push({ child, label: 'server', port });
      rebuildPortOffset++;
    }
    console.log('  ✓ Rebuild complete');
  });

  console.log(`\n  Watching for changes. Press Ctrl+C to stop\n`);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n  Shutting down...');
    watcher.close();
    for (const p of processes) {
      p.child.kill('SIGTERM');
    }
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
}

function generateDevHTML(clientCode) {
  // Read runtime files to inline them (no import needed)
  const luxRoot = resolve(dirname(import.meta.url.replace('file://', '')), '..');
  const reactivityCode = readFileSync(join(luxRoot, 'src', 'runtime', 'reactivity.js'), 'utf-8');
  const rpcCode = readFileSync(join(luxRoot, 'src', 'runtime', 'rpc.js'), 'utf-8');

  // Strip import/export keywords from runtime code for inlining
  const inlineReactivity = reactivityCode.replace(/^export /gm, '');
  const inlineRpc = rpcCode.replace(/^export /gm, '');

  // Strip import lines from client code (we inline the runtime instead)
  const inlineClient = clientCode
    .replace(/^import\s+\{[^}]+\}\s+from\s+'[^']+';?\s*$/gm, '')
    .trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lux App</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #1a1a1a; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
    #app { max-width: 520px; margin: 0 auto; padding: 2rem 1rem; }
    .app { background: white; border-radius: 16px; padding: 2rem; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
    header { text-align: center; margin-bottom: 1.5rem; }
    h1 { font-size: 2rem; margin-bottom: 0.25rem; color: #333; }
    h2 { font-size: 1.2rem; margin-bottom: 0.75rem; color: #555; }
    .subtitle { font-size: 0.9rem; color: #888; letter-spacing: 0.1em; text-transform: uppercase; }
    button { cursor: pointer; padding: 0.5rem 1rem; border: 1px solid #ddd; border-radius: 8px; background: white; font-size: 0.9rem; transition: all 0.15s; }
    button:hover { background: #f0f0f0; transform: translateY(-1px); }
    button:active { transform: translateY(0); }
    input[type="text"] { padding: 0.6rem 0.75rem; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 0.9rem; width: 100%; outline: none; transition: border-color 0.2s; }
    input[type="text"]:focus { border-color: #667eea; }
    ul { list-style: none; }
    .done { text-decoration: line-through; opacity: 0.5; }
    .timer-section { text-align: center; padding: 1.5rem; margin-bottom: 1.5rem; background: #f8f9ff; border-radius: 12px; }
    .timer-label { font-size: 0.85rem; color: #888; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.25rem; }
    .timer-display { font-size: 3.5rem; font-weight: 700; font-variant-numeric: tabular-nums; color: #333; margin-bottom: 0.75rem; font-family: 'SF Mono', 'Fira Code', monospace; }
    .timer-controls { display: flex; gap: 0.5rem; justify-content: center; margin-bottom: 0.75rem; }
    .timer-controls button { min-width: 80px; }
    .btn-start { background: #667eea !important; color: white !important; border-color: #667eea !important; }
    .btn-start:hover { background: #5a6fd6 !important; }
    .btn-pause { background: #f59e0b !important; color: white !important; border-color: #f59e0b !important; }
    .btn-add { background: #667eea; color: white; border-color: #667eea; white-space: nowrap; }
    .btn-add:hover { background: #5a6fd6; }
    .pomodoro-total { font-size: 0.85rem; color: #888; }
    .task-section { border-top: 1px solid #eee; padding-top: 1.5rem; }
    .input-row { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
    .task-list { margin-bottom: 1rem; }
    .task-item { display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0; border-bottom: 1px solid #f0f0f0; }
    .task-content { display: flex; align-items: center; gap: 0.5rem; flex: 1; }
    .check-btn { background: none !important; border: none !important; padding: 0.25rem !important; font-size: 1.1rem; min-width: auto !important; }
    .task-title { flex: 1; cursor: pointer; }
    .delete-btn { background: none !important; border: none !important; color: #ccc; font-size: 1.2rem; padding: 0.25rem !important; min-width: auto !important; }
    .delete-btn:hover { color: #e74c3c !important; }
    .stats { text-align: center; font-size: 0.85rem; color: #888; }
    .active { background: #f0f4ff; border-radius: 6px; padding-left: 0.5rem !important; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
// ── Lux Runtime: Reactivity ──
${inlineReactivity}

// ── Lux Runtime: RPC ──
${inlineRpc}

// ── App ──
${inlineClient}
  </script>
</body>
</html>`;
}

// ─── New Project ────────────────────────────────────────────

function newProject(name) {
  if (!name) {
    console.error('Error: No project name specified');
    console.error('Usage: lux new <project-name>');
    process.exit(1);
  }

  const projectDir = resolve(name);
  if (existsSync(projectDir)) {
    console.error(`Error: Directory '${name}' already exists`);
    process.exit(1);
  }

  console.log(`\n  Creating new Lux project: ${name}\n`);

  mkdirSync(projectDir, { recursive: true });
  mkdirSync(join(projectDir, 'src'));

  // package.json
  writeFileSync(join(projectDir, 'package.json'), JSON.stringify({
    name,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'lux dev src',
      build: 'lux build src',
    },
    dependencies: {
      'lux-lang': '^0.1.0',
    },
  }, null, 2) + '\n');

  // Main app file
  writeFileSync(join(projectDir, 'src', 'app.lux'), `// ${name} — Built with Lux

shared {
  type Message {
    text: String
  }
}

server {
  fn get_message() -> Message {
    Message("Hello from Lux! 🌟")
  }

  route GET "/api/message" => get_message
}

client {
  state message = ""

  effect {
    result = server.get_message()
    message = result.text
  }

  component App {
    <div class="app">
      <h1>"Welcome to {message}"</h1>
      <p>"Edit src/app.lux to get started."</p>
    </div>
  }
}
`);

  // README
  writeFileSync(join(projectDir, 'README.md'), `# ${name}

Built with [Lux](https://github.com/lux-lang/lux) — a modern full-stack language.

## Development

\`\`\`bash
bun install
bun run dev
\`\`\`

## Build

\`\`\`bash
bun run build
\`\`\`
`);

  console.log(`  ✓ Created ${name}/package.json`);
  console.log(`  ✓ Created ${name}/src/app.lux`);
  console.log(`  ✓ Created ${name}/README.md`);
  console.log(`\n  Get started:\n`);
  console.log(`    cd ${name}`);
  console.log(`    bun install`);
  console.log(`    bun run dev\n`);
}

// ─── Migrations ─────────────────────────────────────────────

function findLuxFile(arg) {
  if (arg && arg.endsWith('.lux')) {
    const p = resolve(arg);
    if (existsSync(p)) return p;
    console.error(`Error: File not found: ${p}`);
    process.exit(1);
  }
  for (const name of ['main.lux', 'app.lux']) {
    const p = resolve(name);
    if (existsSync(p)) return p;
  }
  const luxFiles = findFiles(resolve('.'), '.lux');
  if (luxFiles.length === 1) return luxFiles[0];
  if (luxFiles.length === 0) {
    console.error('Error: No .lux files found');
    process.exit(1);
  }
  console.error('Error: Multiple .lux files found. Specify one explicitly.');
  process.exit(1);
}

function discoverDbConfig(luxFile) {
  const source = readFileSync(luxFile, 'utf-8');
  const lexer = new Lexer(source, luxFile);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, luxFile);
  const ast = parser.parse();

  for (const node of ast.body) {
    if (node.type === 'ServerBlock') {
      for (const stmt of node.body) {
        if (stmt.type === 'DbDeclaration') {
          const cfg = {};
          if (stmt.config) {
            for (const [k, v] of Object.entries(stmt.config)) {
              if (v.type === 'StringLiteral') cfg[k] = v.value;
              else if (v.type === 'NumberLiteral') cfg[k] = Number(v.value);
              else if (v.type === 'BooleanLiteral') cfg[k] = v.value;
            }
          }
          return cfg;
        }
      }
    }
  }
  return { driver: 'sqlite', path: 'app.db' };
}

async function connectDb(cfg) {
  const driver = cfg.driver || 'sqlite';
  if (driver === 'postgres') {
    const postgres = (await import('postgres')).default;
    const sql = postgres(cfg.url || 'postgres://localhost/app');
    return {
      driver: 'postgres',
      exec: async (q) => { await sql.unsafe(q); },
      query: async (q, ...p) => { return await sql.unsafe(q, p); },
      close: async () => { await sql.end(); },
    };
  }
  if (driver === 'mysql') {
    const mysql = await import('mysql2/promise');
    const conn = await mysql.createConnection(cfg.url || 'mysql://root@localhost/app');
    return {
      driver: 'mysql',
      exec: async (q) => { await conn.execute(q); },
      query: async (q, ...p) => { const [rows] = await conn.execute(q, p); return rows; },
      close: async () => { await conn.end(); },
    };
  }
  // SQLite default
  const { Database } = await import('bun:sqlite');
  const db = new Database(cfg.path || 'app.db');
  return {
    driver: 'sqlite',
    exec: (q) => db.exec(q),
    query: (q, ...p) => db.prepare(q).all(...p),
    close: () => db.close(),
  };
}

function migrateCreate(name) {
  if (!name) {
    console.error('Error: No migration name specified');
    console.error('Usage: lux migrate:create <name>');
    process.exit(1);
  }

  const dir = resolve('migrations');
  mkdirSync(dir, { recursive: true });

  const now = new Date();
  const ts = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0')
    + String(now.getHours()).padStart(2, '0')
    + String(now.getMinutes()).padStart(2, '0')
    + String(now.getSeconds()).padStart(2, '0');

  const filename = `${ts}_${name.replace(/[^a-zA-Z0-9_]/g, '_')}.js`;
  const filepath = join(dir, filename);

  writeFileSync(filepath, `// Migration: ${name}
// Created: ${now.toISOString()}

export const up = \`
  -- Add your migration SQL here
\`;

export const down = \`
  -- Add your rollback SQL here
\`;
`);

  console.log(`\n  Created migration: migrations/${filename}\n`);
}

async function migrateUp(args) {
  const luxFile = findLuxFile(args[0]);
  const cfg = discoverDbConfig(luxFile);
  const db = await connectDb(cfg);

  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS __migrations (
      id INTEGER PRIMARY KEY ${db.driver === 'postgres' ? 'GENERATED ALWAYS AS IDENTITY' : 'AUTOINCREMENT'},
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (${db.driver === 'postgres' ? "NOW()::TEXT" : "datetime('now')"})
    )`);

    const applied = await db.query('SELECT name FROM __migrations ORDER BY name');
    const appliedSet = new Set(applied.map(r => r.name));

    const migrDir = resolve('migrations');
    if (!existsSync(migrDir)) {
      console.log('\n  No migrations directory found. Run migrate:create first.\n');
      return;
    }

    const files = readdirSync(migrDir)
      .filter(f => f.endsWith('.js'))
      .sort();

    const pending = files.filter(f => !appliedSet.has(f));
    if (pending.length === 0) {
      console.log('\n  All migrations are up to date.\n');
      return;
    }

    console.log(`\n  Running ${pending.length} pending migration(s)...\n`);

    for (const file of pending) {
      const mod = await import(join(migrDir, file));
      if (!mod.up) {
        console.error(`  Skipping ${file}: no 'up' export`);
        continue;
      }
      const sql = mod.up.trim();
      if (sql) {
        await db.exec(sql);
      }
      const ph = db.driver === 'postgres' ? '$1' : '?';
      await db.exec(`INSERT INTO __migrations (name) VALUES ('${file.replace(/'/g, "''")}')`);
      console.log(`  ✓ ${file}`);
    }

    console.log(`\n  Done. ${pending.length} migration(s) applied.\n`);
  } finally {
    await db.close();
  }
}

async function migrateStatus(args) {
  const luxFile = findLuxFile(args[0]);
  const cfg = discoverDbConfig(luxFile);
  const db = await connectDb(cfg);

  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS __migrations (
      id INTEGER PRIMARY KEY ${db.driver === 'postgres' ? 'GENERATED ALWAYS AS IDENTITY' : 'AUTOINCREMENT'},
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (${db.driver === 'postgres' ? "NOW()::TEXT" : "datetime('now')"})
    )`);

    const applied = await db.query('SELECT name, applied_at FROM __migrations ORDER BY name');
    const appliedMap = new Map(applied.map(r => [r.name, r.applied_at]));

    const migrDir = resolve('migrations');
    const files = existsSync(migrDir)
      ? readdirSync(migrDir).filter(f => f.endsWith('.js')).sort()
      : [];

    if (files.length === 0) {
      console.log('\n  No migration files found.\n');
      return;
    }

    console.log('\n  Migration Status:');
    console.log('  ' + '-'.repeat(60));

    for (const file of files) {
      const appliedAt = appliedMap.get(file);
      const status = appliedAt ? `applied (${appliedAt})` : 'pending';
      const icon = appliedAt ? '✓' : '○';
      console.log(`  ${icon} ${file}  ${status}`);
    }

    const pendingCount = files.filter(f => !appliedMap.has(f)).length;
    console.log('  ' + '-'.repeat(60));
    console.log(`  ${files.length} total, ${files.length - pendingCount} applied, ${pendingCount} pending\n`);
  } finally {
    await db.close();
  }
}

// ─── Utilities ──────────────────────────────────────────────

function getStdlibForRuntime() {
  return getFullStdlib();  // Full stdlib for REPL
}  
function getRunStdlib() { // Excludes RESULT_OPTION (emitted by codegen)
  return `${BUILTINS}
${PROPAGATE}`;
}

// ─── LSP Server ──────────────────────────────────────────────

async function startLsp() {
  // Import and start the LSP server - it handles stdio communication
  await import('../src/lsp/server.js');
}

// ─── REPL ────────────────────────────────────────────────────

async function startRepl() {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'lux> ',
  });

  console.log(`\n  Lux REPL v${VERSION}`);
  console.log('  Type expressions to evaluate. Use :quit to exit.\n');

  const context = {};
  const stdlib = getStdlibForRuntime();
  // Initialize stdlib in context — dynamically extract all function names
  const fnNameRegex = /\bfunction\s+([a-zA-Z_]\w*)/g;
  const stdlibNames = [];
  let fnMatch;
  while ((fnMatch = fnNameRegex.exec(stdlib)) !== null) stdlibNames.push(fnMatch[1]);
  // Also include const bindings (Ok, Err, Some, None, __propagate)
  const constRegex = /\bconst\s+([a-zA-Z_]\w*)/g;
  while ((fnMatch = constRegex.exec(stdlib)) !== null) stdlibNames.push(fnMatch[1]);
  const initFn = new Function(stdlib + '\nObject.assign(this, {' + stdlibNames.join(',') + '});');
  initFn.call(context);

  let buffer = '';
  let braceDepth = 0;

  rl.prompt();

  rl.on('line', (line) => {
    const trimmed = line.trim();

    if (trimmed === ':quit' || trimmed === ':exit' || trimmed === ':q') {
      console.log('  Goodbye!\n');
      rl.close();
      process.exit(0);
    }

    if (trimmed === ':help') {
      console.log('  :quit    Exit the REPL');
      console.log('  :help    Show this help');
      console.log('  :clear   Clear context\n');
      rl.prompt();
      return;
    }

    if (trimmed === ':clear') {
      initFn.call(context);
      console.log('  Context cleared.\n');
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
      process.stdout.write('...  ');
      return;
    }

    braceDepth = 0;
    const input = buffer;
    buffer = '';

    try {
      const output = compileLux(input, '<repl>');
      const code = output.shared || '';
      if (code.trim()) {
        // Try wrapping last expression statement as a return for value display
        const lines = code.trim().split('\n');
        const lastLine = lines[lines.length - 1].trim();
        let evalCode = code;
        // If the last line looks like an expression (doesn't start with const/let/var/function/if/for/while/class)
        if (!/^(const |let |var |function |if |for |while |class |try |switch )/.test(lastLine) && !lastLine.endsWith('{')) {
          // Replace the last statement with a return
          const allButLast = lines.slice(0, -1).join('\n');
          // Strip trailing semicolon from last line for the return
          const returnExpr = lastLine.endsWith(';') ? lastLine.slice(0, -1) : lastLine;
          evalCode = allButLast + (allButLast ? '\n' : '') + `return (${returnExpr});`;
        }
        try {
          const keys = Object.keys(context);
          const destructure = keys.length > 0 ? `const {${keys.join(',')}} = __ctx;` : '';
          const fn = new Function('__ctx', `${destructure}\n${evalCode}`);
          const result = fn(context);
          if (result !== undefined) {
            console.log(' ', result);
          }
        } catch (e) {
          // If return-wrapping fails, fall back to plain execution
          const keys = Object.keys(context);
          const destructure = keys.length > 0 ? `const {${keys.join(',')}} = __ctx;` : '';
          const fn = new Function('__ctx', `${destructure}\n${code}`);
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

// ─── Watch Mode ──────────────────────────────────────────────

function startWatcher(srcDir, callback) {
  let debounceTimer = null;

  console.log(`  Watching for changes in ${srcDir}...`);

  const watcher = fsWatch(srcDir, { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith('.lux')) return;
    // Debounce rapid file changes
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`\n  File changed: ${filename}`);
      try {
        compilationCache.clear();
        callback();
      } catch (err) {
        console.error(`  Rebuild error: ${err.message}`);
      }
    }, 100);
  });

  return watcher;
}

// ─── Source Map Support ──────────────────────────────────────

class SourceMapBuilder {
  constructor(sourceFile) {
    this.sourceFile = sourceFile;
    this.mappings = [];
    this.outputLine = 0;
    this.outputCol = 0;
  }

  addMapping(sourceLine, sourceCol, outputLine, outputCol) {
    this.mappings.push({ sourceLine, sourceCol, outputLine, outputCol });
  }

  // Generate a VLQ-encoded source map
  generate(sourceContent) {
    const sources = [this.sourceFile];
    const names = [];

    // Sort mappings by output position
    this.mappings.sort((a, b) => a.outputLine - b.outputLine || a.outputCol - b.outputCol);

    // Encode mappings using VLQ
    let prevOutputCol = 0;
    let prevSourceLine = 0;
    let prevSourceCol = 0;
    let currentOutputLine = 0;
    const lines = [];
    let currentLine = [];

    for (const m of this.mappings) {
      // Fill empty lines
      while (currentOutputLine < m.outputLine) {
        lines.push(currentLine.join(','));
        currentLine = [];
        currentOutputLine++;
        prevOutputCol = 0;
      }

      const segment = [];
      segment.push(this._vlqEncode(m.outputCol - prevOutputCol));
      segment.push(this._vlqEncode(0)); // source index (always 0)
      segment.push(this._vlqEncode(m.sourceLine - prevSourceLine));
      segment.push(this._vlqEncode(m.sourceCol - prevSourceCol));

      currentLine.push(segment.join(''));
      prevOutputCol = m.outputCol;
      prevSourceLine = m.sourceLine;
      prevSourceCol = m.sourceCol;
    }
    lines.push(currentLine.join(','));

    return JSON.stringify({
      version: 3,
      file: this.sourceFile.replace('.lux', '.js'),
      sources,
      sourcesContent: sourceContent ? [sourceContent] : undefined,
      names,
      mappings: lines.join(';'),
    });
  }

  _vlqEncode(value) {
    let vlq = value < 0 ? ((-value) << 1) + 1 : value << 1;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let encoded = '';
    do {
      let digit = vlq & 0x1f;
      vlq >>= 5;
      if (vlq > 0) digit |= 0x20;
      encoded += chars[digit];
    } while (vlq > 0);
    return encoded;
  }

  toDataURL(sourceContent) {
    const mapJson = this.generate(sourceContent);
    const base64 = Buffer.from(mapJson).toString('base64');
    return `//# sourceMappingURL=data:application/json;base64,${base64}`;
  }
}

// ─── Production Build ────────────────────────────────────────

async function productionBuild(srcDir, outDir) {
  const luxFiles = findFiles(srcDir, '.lux');
  if (luxFiles.length === 0) {
    console.error('No .lux files found');
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });

  console.log(`\n  Production build...\n`);

  let allClientCode = '';
  let allServerCode = '';
  let allSharedCode = '';
  let cssContent = '';

  for (const file of luxFiles) {
    try {
      const source = readFileSync(file, 'utf-8');
      const output = compileLux(source, file);

      if (output.shared) allSharedCode += output.shared + '\n';
      if (output.server) allServerCode += output.server + '\n';
      if (output.client) allClientCode += output.client + '\n';
    } catch (err) {
      console.error(`  Error in ${relative(srcDir, file)}: ${err.message}`);
      process.exit(1);
    }
  }

  // Generate content hash for cache busting
  const hashCode = (s) => {
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(s);
    return hasher.digest('hex').slice(0, 12);
  };

  // Write server bundle
  if (allServerCode.trim()) {
    const stdlib = getRunStdlib();
    const serverBundle = stdlib + '\n' + allSharedCode + '\n' + allServerCode;
    const hash = hashCode(serverBundle);
    const serverPath = join(outDir, `server.${hash}.js`);
    writeFileSync(serverPath, serverBundle);
    console.log(`  server.${hash}.js`);
  }

  // Write client bundle
  if (allClientCode.trim()) {
    const luxRoot = resolve(dirname(import.meta.url.replace('file://', '')), '..');
    const reactivityCode = readFileSync(join(luxRoot, 'src', 'runtime', 'reactivity.js'), 'utf-8').replace(/^export /gm, '');
    const rpcCode = readFileSync(join(luxRoot, 'src', 'runtime', 'rpc.js'), 'utf-8').replace(/^export /gm, '');

    const clientBundle = reactivityCode + '\n' + rpcCode + '\n' + allSharedCode + '\n' +
      allClientCode.replace(/^import\s+\{[^}]+\}\s+from\s+'[^']+';?\s*$/gm, '').trim();

    const hash = hashCode(clientBundle);
    const clientPath = join(outDir, `client.${hash}.js`);
    writeFileSync(clientPath, clientBundle);
    console.log(`  client.${hash}.js`);

    // Generate production HTML
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lux App</title>
</head>
<body>
  <div id="app"></div>
  <script src="client.${hash}.js"></script>
</body>
</html>`;
    writeFileSync(join(outDir, 'index.html'), html);
    console.log(`  index.html`);
  }

  // Try to use Bun.build for minification if available
  try {
    const clientFiles = readdirSync(outDir).filter(f => f.startsWith('client.') && f.endsWith('.js'));
    for (const f of clientFiles) {
      const filePath = join(outDir, f);
      const result = await Bun.build({
        entrypoints: [filePath],
        outdir: outDir,
        minify: true,
        naming: f.replace('.js', '.min.js'),
      });
      if (result.success) {
        console.log(`  ${f.replace('.js', '.min.js')} (minified)`);
      }
    }
  } catch (e) {
    // Bun.build not available, skip minification
  }

  console.log(`\n  Production build complete.\n`);
}

// ─── Multi-file Import Support ───────────────────────────────

const compilationCache = new Map();
const compilationInProgress = new Set();

// Track module exports for cross-file import validation
const moduleExports = new Map();

function collectExports(ast, filename) {
  const publicExports = new Set();
  const allNames = new Set();
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration') {
      allNames.add(node.name);
      if (node.isPublic) publicExports.add(node.name);
    }
    if (node.type === 'Assignment' && node.targets) {
      for (const t of node.targets) {
        allNames.add(t);
        if (node.isPublic) publicExports.add(t);
      }
    }
    if (node.type === 'TypeDeclaration') {
      allNames.add(node.name);
      if (node.isPublic) publicExports.add(node.name);
      if (node.variants) {
        for (const v of node.variants) {
          if (v.type === 'TypeVariant') {
            allNames.add(v.name);
            if (node.isPublic) publicExports.add(v.name);
          }
        }
      }
    }
    if (node.type === 'VarDeclaration' && node.targets) {
      for (const t of node.targets) {
        allNames.add(t);
        if (node.isPublic) publicExports.add(t);
      }
    }
    if (node.type === 'InterfaceDeclaration') {
      allNames.add(node.name);
      if (node.isPublic) publicExports.add(node.name);
    }
    if (node.type === 'TraitDeclaration') {
      allNames.add(node.name);
      if (node.isPublic) publicExports.add(node.name);
    }
    if (node.type === 'TypeAlias') {
      allNames.add(node.name);
      if (node.isPublic) publicExports.add(node.name);
    }
    if (node.type === 'ImplDeclaration') { /* impl doesn't export a name */ }
  }
  moduleExports.set(filename, { publicExports, allNames });
  return { publicExports, allNames };
}

function compileWithImports(source, filename, srcDir) {
  if (compilationCache.has(filename)) {
    return compilationCache.get(filename);
  }

  compilationInProgress.add(filename);

  try {
    // Parse and find .lux imports
    const lexer = new Lexer(source, filename);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, filename);
    const ast = parser.parse();

    // Collect this module's exports for validation
    collectExports(ast, filename);

    // Resolve .lux imports first
    for (const node of ast.body) {
      if (node.type === 'ImportDeclaration' && node.source.endsWith('.lux')) {
        const importPath = resolve(dirname(filename), node.source);
        if (compilationInProgress.has(importPath)) {
          throw new Error(`Circular import detected: ${filename} → ${importPath}`);
        } else if (existsSync(importPath) && !compilationCache.has(importPath)) {
          const importSource = readFileSync(importPath, 'utf-8');
          compileWithImports(importSource, importPath, srcDir);
        }
        // Validate imported names exist in target module's public exports
        if (moduleExports.has(importPath)) {
          const { publicExports, allNames } = moduleExports.get(importPath);
          for (const spec of node.specifiers) {
            if (!publicExports.has(spec.imported)) {
              if (allNames.has(spec.imported)) {
                throw new Error(`'${spec.imported}' is private in module '${node.source}'. Add 'pub' to export it.`);
              } else {
                throw new Error(`Module '${node.source}' does not export '${spec.imported}'`);
              }
            }
          }
        }
        // Rewrite the import path to .js
        node.source = node.source.replace('.lux', '.shared.js');
      }
      if (node.type === 'ImportDefault' && node.source.endsWith('.lux')) {
        const importPath = resolve(dirname(filename), node.source);
        if (compilationInProgress.has(importPath)) {
          throw new Error(`Circular import detected: ${filename} → ${importPath}`);
        } else if (existsSync(importPath) && !compilationCache.has(importPath)) {
          const importSource = readFileSync(importPath, 'utf-8');
          compileWithImports(importSource, importPath, srcDir);
        }
        node.source = node.source.replace('.lux', '.shared.js');
      }
      if (node.type === 'ImportWildcard' && node.source.endsWith('.lux')) {
        const importPath = resolve(dirname(filename), node.source);
        if (compilationInProgress.has(importPath)) {
          throw new Error(`Circular import detected: ${filename} → ${importPath}`);
        } else if (existsSync(importPath) && !compilationCache.has(importPath)) {
          const importSource = readFileSync(importPath, 'utf-8');
          compileWithImports(importSource, importPath, srcDir);
        }
        node.source = node.source.replace('.lux', '.shared.js');
      }
    }

    const analyzer = new Analyzer(ast, filename);
    const { warnings } = analyzer.analyze();

    if (warnings.length > 0) {
      const formatter = new DiagnosticFormatter(source, filename);
      for (const w of warnings) {
        console.warn(formatter.formatWarning(w.message, { line: w.line, column: w.column }));
      }
    }

    const codegen = new CodeGenerator(ast, filename);
    const output = codegen.generate();
    compilationCache.set(filename, output);
    return output;
  } finally {
    compilationInProgress.delete(filename);
  }
}

function findFiles(dir, ext) {
  const results = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...findFiles(full, ext));
    } else if (entry.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

main();
