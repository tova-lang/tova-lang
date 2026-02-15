#!/usr/bin/env bun

import { resolve, basename, dirname, join, relative } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync, watch as fsWatch } from 'fs';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { Program } from '../src/parser/ast.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { richError, formatDiagnostics, DiagnosticFormatter } from '../src/diagnostics/formatter.js';
import { getFullStdlib, buildSelectiveStdlib, BUILTIN_NAMES, PROPAGATE } from '../src/stdlib/inline.js';
import { Formatter } from '../src/formatter/formatter.js';
import { REACTIVITY_SOURCE, RPC_SOURCE, ROUTER_SOURCE } from '../src/runtime/embedded.js';
import '../src/runtime/string-proto.js';
import { resolveConfig } from '../src/config/resolve.js';
import { writePackageJson } from '../src/config/package-json.js';
import { addToSection, removeFromSection } from '../src/config/edit-toml.js';
import { stringifyTOML } from '../src/config/toml.js';

import { VERSION } from '../src/version.js';

const HELP = `
  ╦  ╦ ╦═╗ ╦
  ║  ║ ║ ║ ╠╣
  ╩═╝╚═╝╩═╝╩  v${VERSION}

  Created by Enoch Kujem Abassey
  A modern full-stack language that transpiles to JavaScript

Usage:
  tova <command> [options] [arguments]

Commands:
  run <file>       Compile and execute a .tova file
  build [dir]      Compile .tova files to JavaScript (default: current dir)
  dev              Start development server with live reload
  new <name>       Create a new Tova project
  install          Install npm dependencies from tova.toml
  add <pkg>        Add an npm dependency (--dev for dev dependency)
  remove <pkg>     Remove an npm dependency
  repl             Start interactive Tova REPL
  lsp              Start Language Server Protocol server
  fmt <file>      Format a .tova file (--check to verify only)
  test [dir]      Run test blocks in .tova files (--filter, --watch)
  migrate:create <name>   Create a new migration file
  migrate:up [file.tova]   Run pending migrations
  migrate:status [file.tova] Show migration status

Options:
  --help, -h       Show this help message
  --version, -v    Show version
  --output, -o     Output directory (default: .tova-out)
  --production     Production build (minify, bundle, hash)
  --watch          Watch for file changes
  --debug          Show verbose error output
  --strict         Enable strict type checking
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`Tova v${VERSION}`);
    process.exit(0);
  }

  const command = args[0];

  const isStrict = args.includes('--strict');
  switch (command) {
    case 'run':
      await runFile(args.filter(a => a !== '--strict')[1], { strict: isStrict });
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
    case 'install':
      await installDeps();
      break;
    case 'add':
      await addDep(args.slice(1));
      break;
    case 'remove':
      await removeDep(args[1]);
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
      if (command.endsWith('.tova')) {
        await runFile(command, { strict: isStrict });
      } else {
        console.error(`Unknown command: ${command}`);
        console.log(HELP);
        process.exit(1);
      }
  }
}

// ─── Compile a .tova source string ───────────────────────────

function compileTova(source, filename, options = {}) {
  const lexer = new Lexer(source, filename);
  const tokens = lexer.tokenize();

  const parser = new Parser(tokens, filename);
  const ast = parser.parse();

  const analyzer = new Analyzer(ast, filename, { strict: options.strict || false });
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
    console.error('Usage: tova fmt <file.tova> [--check]');
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

  // Find all .tova files with test blocks
  const tovaFiles = findTovaFiles(resolve(targetDir));
  const testFiles = [];

  for (const file of tovaFiles) {
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
  const tmpDir = resolve('.tova-test-out');
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
        const relPath = relative(resolve(targetDir), file).replace(/\.tova$/, '.test.js');
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
      if (filename && filename.endsWith('.tova')) {
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

function findTovaFiles(dir) {
  const files = [];
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return files;
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...findTovaFiles(full));
    } else if (entry.endsWith('.tova')) {
      files.push(full);
    }
  }
  return files;
}

// ─── Run ────────────────────────────────────────────────────

async function runFile(filePath, options = {}) {
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
    const output = compileTova(source, filePath, { strict: options.strict });

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
  const config = resolveConfig(process.cwd());
  const isProduction = args.includes('--production');
  const buildStrict = args.includes('--strict');
  const explicitSrc = args.filter(a => !a.startsWith('--'))[0];
  const srcDir = resolve(explicitSrc || config.project.entry || '.');
  const outIdx = args.indexOf('--output');
  const outDir = resolve(outIdx >= 0 ? args[outIdx + 1] : (config.build.output || '.tova-out'));

  // Production build uses a separate optimized pipeline
  if (isProduction) {
    return await productionBuild(srcDir, outDir);
  }

  const tovaFiles = findFiles(srcDir, '.tova');
  if (tovaFiles.length === 0) {
    console.error('No .tova files found');
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });

  // Write embedded runtime files to output directory
  const runtimeDest = join(outDir, 'runtime');
  mkdirSync(runtimeDest, { recursive: true });
  writeFileSync(join(runtimeDest, 'reactivity.js'), REACTIVITY_SOURCE);
  writeFileSync(join(runtimeDest, 'rpc.js'), RPC_SOURCE);
  writeFileSync(join(runtimeDest, 'router.js'), ROUTER_SOURCE);

  console.log(`\n  Building ${tovaFiles.length} file(s)...\n`);

  let errorCount = 0;
  compilationCache.clear();

  // Group files by directory for multi-file merging
  const dirGroups = groupFilesByDirectory(tovaFiles);

  for (const [dir, files] of dirGroups) {
    const dirName = basename(dir) === '.' ? 'app' : basename(dir);
    const relDir = relative(srcDir, dir) || '.';
    try {
      const result = mergeDirectory(dir, srcDir, { strict: buildStrict });
      if (!result) continue;

      const { output, single } = result;
      // Use single-file basename for single-file dirs, directory name for multi-file
      const outBaseName = single ? basename(files[0], '.tova') : dirName;
      const relLabel = single ? relative(srcDir, files[0]) : `${relDir}/ (${files.length} files merged)`;

      // Helper to generate source maps
      const generateSourceMap = (code, jsFile) => {
        if (output.sourceMappings && output.sourceMappings.length > 0) {
          const sourceFile = single ? relative(srcDir, files[0]) : relDir;
          const smb = new SourceMapBuilder(sourceFile, output._sourceFiles);
          for (const m of output.sourceMappings) {
            smb.addMapping(m.sourceLine, m.sourceCol, m.outputLine, m.outputCol, m.sourceFile);
          }
          const sourceContent = single ? readFileSync(files[0], 'utf-8') : null;
          const mapFile = jsFile + '.map';
          writeFileSync(mapFile, smb.generate(sourceContent, output._sourceContents));
          return code + `\n//# sourceMappingURL=${basename(mapFile)}`;
        }
        return code;
      };

      // Write shared
      if (output.shared && output.shared.trim()) {
        const sharedPath = join(outDir, `${outBaseName}.shared.js`);
        writeFileSync(sharedPath, generateSourceMap(output.shared, sharedPath));
        console.log(`  ✓ ${relLabel} → ${relative('.', sharedPath)}`);
      }

      // Write default server
      if (output.server) {
        const serverPath = join(outDir, `${outBaseName}.server.js`);
        writeFileSync(serverPath, generateSourceMap(output.server, serverPath));
        console.log(`  ✓ ${relLabel} → ${relative('.', serverPath)}`);
      }

      // Write default client
      if (output.client) {
        const clientPath = join(outDir, `${outBaseName}.client.js`);
        writeFileSync(clientPath, generateSourceMap(output.client, clientPath));
        console.log(`  ✓ ${relLabel} → ${relative('.', clientPath)}`);
      }

      // Write named server blocks (multi-block)
      if (output.multiBlock && output.servers) {
        for (const [name, code] of Object.entries(output.servers)) {
          if (name === 'default') continue;
          const path = join(outDir, `${outBaseName}.server.${name}.js`);
          writeFileSync(path, code);
          console.log(`  ✓ ${relLabel} → ${relative('.', path)} [server:${name}]`);
        }
      }

      // Write named client blocks (multi-block)
      if (output.multiBlock && output.clients) {
        for (const [name, code] of Object.entries(output.clients)) {
          if (name === 'default') continue;
          const path = join(outDir, `${outBaseName}.client.${name}.js`);
          writeFileSync(path, code);
          console.log(`  ✓ ${relLabel} → ${relative('.', path)} [client:${name}]`);
        }
      }
    } catch (err) {
      console.error(`  ✗ ${relDir}: ${err.message}`);
      errorCount++;
    }
  }

  const dirCount = dirGroups.size;
  console.log(`\n  Build complete. ${dirCount - errorCount}/${dirCount} directory group(s) succeeded.\n`);
  if (errorCount > 0) process.exit(1);
}

// ─── Dev Server ─────────────────────────────────────────────

async function devServer(args) {
  const config = resolveConfig(process.cwd());
  const explicitSrc = args.filter(a => !a.startsWith('--'))[0];
  const srcDir = resolve(explicitSrc || config.project.entry || '.');
  const explicitPort = args.find((_, i, a) => a[i - 1] === '--port');
  const basePort = parseInt(explicitPort || config.dev.port || '3000');
  const buildStrict = args.includes('--strict');

  const tovaFiles = findFiles(srcDir, '.tova');
  if (tovaFiles.length === 0) {
    console.error('No .tova files found');
    process.exit(1);
  }

  const reloadPort = basePort + 100;

  // Start live-reload SSE server early so actualReloadPort is available for HTML generation
  const reloadClients = new Set();
  let reloadServer;
  let actualReloadPort = reloadPort;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      reloadServer = Bun.serve({
        port: actualReloadPort,
        fetch(req) {
          return handleReloadFetch(req);
        },
      });
      break;
    } catch {
      actualReloadPort++;
    }
  }
  if (!reloadServer) {
    console.log('  ⚠ Could not start live-reload server (ports in use)');
    actualReloadPort = 0;
  }

  console.log(`\n  Tova dev server starting...\n`);

  // Compile all files
  const outDir = join(srcDir, '.tova-out');
  mkdirSync(outDir, { recursive: true });

  // Write embedded runtime files to output directory
  const runtimeDest = join(outDir, 'runtime');
  mkdirSync(runtimeDest, { recursive: true });
  writeFileSync(join(runtimeDest, 'reactivity.js'), REACTIVITY_SOURCE);
  writeFileSync(join(runtimeDest, 'rpc.js'), RPC_SOURCE);
  writeFileSync(join(runtimeDest, 'router.js'), ROUTER_SOURCE);

  const serverFiles = [];
  let hasClient = false;

  // Clear import caches for fresh compilation
  compilationCache.clear();
  compilationInProgress.clear();
  moduleExports.clear();

  // Compile via directory merging
  const dirGroups = groupFilesByDirectory(tovaFiles);
  let clientHTML = '';

  // Pass 1: Merge each directory, write shared/client outputs, collect clientHTML
  const dirResults = [];
  for (const [dir, files] of dirGroups) {
    const dirName = basename(dir) === '.' ? 'app' : basename(dir);
    try {
      const result = mergeDirectory(dir, srcDir, { strict: buildStrict });
      if (!result) continue;

      const { output, single } = result;
      const outBaseName = single ? basename(files[0], '.tova') : dirName;
      dirResults.push({ dir, output, outBaseName, single, files });

      if (output.shared && output.shared.trim()) {
        writeFileSync(join(outDir, `${outBaseName}.shared.js`), output.shared);
      }

      if (output.client) {
        const p = join(outDir, `${outBaseName}.client.js`);
        writeFileSync(p, output.client);
        clientHTML = await generateDevHTML(output.client, srcDir, actualReloadPort);
        writeFileSync(join(outDir, 'index.html'), clientHTML);
        hasClient = true;
      }
    } catch (err) {
      console.error(`  ✗ ${relative(srcDir, dir)}: ${err.message}`);
    }
  }

  // Pass 2: Write server files with clientHTML injected
  for (const { output, outBaseName } of dirResults) {
    if (output.server) {
      let serverCode = output.server;
      if (clientHTML) {
        const htmlConst = `const __clientHTML = ${JSON.stringify(clientHTML)};\n`;
        serverCode = htmlConst + serverCode;
      }
      const p = join(outDir, `${outBaseName}.server.js`);
      writeFileSync(p, serverCode);
      serverFiles.push({ path: p, name: 'default', baseName: outBaseName });
    }

    if (output.multiBlock && output.servers) {
      for (const [name, code] of Object.entries(output.servers)) {
        if (name === 'default') continue;
        const p = join(outDir, `${outBaseName}.server.${name}.js`);
        writeFileSync(p, code);
        serverFiles.push({ path: p, name, baseName: outBaseName });
      }
    }

    if (output.multiBlock && output.clients) {
      for (const [name, code] of Object.entries(output.clients)) {
        if (name === 'default') continue;
        const p = join(outDir, `${outBaseName}.client.${name}.js`);
        writeFileSync(p, code);
      }
    }
  }

  console.log(`  ✓ Compiled ${tovaFiles.length} file(s) from ${dirGroups.size} directory group(s)`);
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

  function handleReloadFetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/__tova_reload') {
        const stream = new ReadableStream({
          start(controller) {
            const client = { controller };
            reloadClients.add(client);
            // Send heartbeat to keep connection alive
            const heartbeat = setInterval(() => {
              try { controller.enqueue(new TextEncoder().encode(': heartbeat\n\n')); } catch { clearInterval(heartbeat); }
            }, 15000);
            req.signal.addEventListener('abort', () => {
              clearInterval(heartbeat);
              reloadClients.delete(client);
            });
          },
        });
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      return new Response('Not Found', { status: 404 });
  }

  function notifyReload() {
    const msg = new TextEncoder().encode('data: reload\n\n');
    for (const client of reloadClients) {
      try { client.controller.enqueue(msg); } catch { reloadClients.delete(client); }
    }
  }

  if (reloadServer) console.log(`  ✓ Live reload on port ${actualReloadPort}`);

  // Start file watcher for auto-rebuild
  const watcher = startWatcher(srcDir, async () => {
    console.log('  Rebuilding...');

    // Recompile first — keep old processes alive until success
    const currentFiles = findFiles(srcDir, '.tova');
    const newServerFiles = [];

    // Clear import caches for fresh compilation
    compilationCache.clear();
    compilationInProgress.clear();
    moduleExports.clear();

    try {
      // Merge each directory group, collect client HTML
      const rebuildDirGroups = groupFilesByDirectory(currentFiles);
      let rebuildClientHTML = '';

      for (const [dir, files] of rebuildDirGroups) {
        const dirName = basename(dir) === '.' ? 'app' : basename(dir);
        const result = mergeDirectory(dir, srcDir, { strict: buildStrict });
        if (!result) continue;

        const { output, single } = result;
        const outBaseName = single ? basename(files[0], '.tova') : dirName;

        if (output.shared && output.shared.trim()) {
          writeFileSync(join(outDir, `${outBaseName}.shared.js`), output.shared);
        }
        if (output.client) {
          writeFileSync(join(outDir, `${outBaseName}.client.js`), output.client);
          rebuildClientHTML = await generateDevHTML(output.client, srcDir, actualReloadPort);
          writeFileSync(join(outDir, 'index.html'), rebuildClientHTML);
        }
        if (output.server) {
          let serverCode = output.server;
          if (rebuildClientHTML) {
            serverCode = `const __clientHTML = ${JSON.stringify(rebuildClientHTML)};\n` + serverCode;
          }
          const p = join(outDir, `${outBaseName}.server.js`);
          writeFileSync(p, serverCode);
          newServerFiles.push(p);
        }
        if (output.multiBlock && output.servers) {
          for (const [name, code] of Object.entries(output.servers)) {
            if (name === 'default') continue;
            const p = join(outDir, `${outBaseName}.server.${name}.js`);
            writeFileSync(p, code);
            newServerFiles.push(p);
          }
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

    // Wait for server to be ready before triggering browser reload
    if (processes.length > 0) {
      const serverPort = processes[0].port;
      for (let i = 0; i < 50; i++) {
        try {
          const res = await fetch(`http://localhost:${serverPort}/`);
          if (res.ok || res.status === 404) break;
        } catch {}
        await new Promise(r => setTimeout(r, 100));
      }
    }
    console.log('  ✓ Rebuild complete');
    notifyReload();
  });

  console.log(`\n  Watching for changes. Press Ctrl+C to stop\n`);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n  Shutting down...');
    watcher.close();
    if (reloadServer) reloadServer.stop();
    for (const p of processes) {
      try { p.child.kill('SIGKILL'); } catch {}
    }
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
}

async function generateDevHTML(clientCode, srcDir, reloadPort = 0) {
  const liveReloadScript = reloadPort ? `
  <script>
    (function() {
      var es = new EventSource("http://localhost:${reloadPort}/__tova_reload");
      es.onmessage = function(e) { if (e.data === "reload") window.location.reload(); };
      es.onerror = function() {
        es.close();
        // Server is rebuilding — poll until it's back, then reload
        var check = setInterval(function() {
          fetch(window.location.href, { mode: "no-cors" }).then(function() {
            clearInterval(check);
            window.location.reload();
          }).catch(function() {});
        }, 500);
      };
    })();
  </script>` : '';

  // Check if client code uses npm packages — if so, bundle with Bun.build
  if (srcDir && hasNpmImports(clientCode)) {
    const bundled = await bundleClientCode(clientCode, srcDir);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tova App</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #1a1a1a; }
    ul { list-style: none; }
    .done { text-decoration: line-through; opacity: 0.5; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module">
${bundled}
  </script>${liveReloadScript}
</body>
</html>`;
  }

  // Original path: no npm imports — inline runtime, no bundling overhead
  // Use embedded runtime sources (no disk reads needed)
  const inlineReactivity = REACTIVITY_SOURCE.replace(/^export /gm, '');
  const inlineRpc = RPC_SOURCE.replace(/^export /gm, '');

  // Strip all import lines from client code (we inline the runtime instead)
  const inlineClient = clientCode
    .replace(/^\s*import\s+(?:\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
    .trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tova App</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #1a1a1a; }
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
// ── Tova Runtime: Reactivity ──
${inlineReactivity}

// ── Tova Runtime: RPC ──
${inlineRpc}

// ── App ──
${inlineClient}
  </script>${liveReloadScript}
</body>
</html>`;
}

// ─── New Project ────────────────────────────────────────────

function newProject(name) {
  if (!name) {
    console.error('Error: No project name specified');
    console.error('Usage: tova new <project-name>');
    process.exit(1);
  }

  const projectDir = resolve(name);
  if (existsSync(projectDir)) {
    console.error(`Error: Directory '${name}' already exists`);
    process.exit(1);
  }

  console.log(`\n  Creating new Tova project: ${name}\n`);

  mkdirSync(projectDir, { recursive: true });
  mkdirSync(join(projectDir, 'src'));

  // tova.toml
  const tomlContent = stringifyTOML({
    project: {
      name,
      version: '0.1.0',
      description: 'A full-stack Tova application',
      entry: 'src',
    },
    build: {
      output: '.tova-out',
    },
    dev: {
      port: 3000,
    },
    dependencies: {},
    npm: {},
  });
  writeFileSync(join(projectDir, 'tova.toml'), tomlContent);

  // .gitignore
  writeFileSync(join(projectDir, '.gitignore'), `node_modules/
.tova-out/
package.json
bun.lock
*.db
*.db-shm
*.db-wal
`);

  // Main app file
  writeFileSync(join(projectDir, 'src', 'app.tova'), `// ${name} — Built with Tova

shared {
  type Message {
    text: String
  }
}

server {
  fn get_message() -> Message {
    Message("Hello from Tova! 🌟")
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
      <h1>"{message}"</h1>
      <p>"Edit src/app.tova to get started."</p>
    </div>
  }
}
`);

  // README
  writeFileSync(join(projectDir, 'README.md'), `# ${name}

Built with [Tova](https://github.com/tova-lang/tova-lang) — a modern full-stack language.

## Development

\`\`\`bash
tova install
tova dev
\`\`\`

## Build

\`\`\`bash
tova build
\`\`\`

## Add npm packages

\`\`\`bash
tova add htmx
tova add prettier --dev
\`\`\`
`);

  console.log(`  ✓ Created ${name}/tova.toml`);
  console.log(`  ✓ Created ${name}/.gitignore`);
  console.log(`  ✓ Created ${name}/src/app.tova`);
  console.log(`  ✓ Created ${name}/README.md`);
  console.log(`\n  Get started:\n`);
  console.log(`    cd ${name}`);
  console.log(`    tova install`);
  console.log(`    tova dev\n`);
}

// ─── Package Management ─────────────────────────────────────

async function installDeps() {
  const cwd = process.cwd();
  const config = resolveConfig(cwd);

  if (config._source !== 'tova.toml') {
    // No tova.toml — just run bun install as normal
    console.log('  No tova.toml found, running bun install...\n');
    const proc = spawn('bun', ['install'], { stdio: 'inherit', cwd });
    const code = await new Promise(res => proc.on('close', res));
    process.exit(code);
    return;
  }

  // Generate shadow package.json from tova.toml
  const wrote = writePackageJson(config, cwd);
  if (wrote) {
    console.log('  Generated package.json from tova.toml');
    const proc = spawn('bun', ['install'], { stdio: 'inherit', cwd });
    const code = await new Promise(res => proc.on('close', res));
    process.exit(code);
  } else {
    console.log('  No npm dependencies in tova.toml. Nothing to install.\n');
  }
}

async function addDep(args) {
  const isDev = args.includes('--dev');
  const pkg = args.find(a => !a.startsWith('--'));

  if (!pkg) {
    console.error('Error: No package specified');
    console.error('Usage: tova add <package> [--dev]');
    process.exit(1);
  }

  const cwd = process.cwd();
  const tomlPath = join(cwd, 'tova.toml');

  if (!existsSync(tomlPath)) {
    console.error('Error: No tova.toml found in current directory');
    console.error('Run `tova new <name>` to create a new project, or create tova.toml manually.');
    process.exit(1);
  }

  // Parse package name and version
  let name = pkg;
  let version = 'latest';
  if (pkg.includes('@') && !pkg.startsWith('@')) {
    const atIdx = pkg.lastIndexOf('@');
    name = pkg.slice(0, atIdx);
    version = pkg.slice(atIdx + 1);
  } else if (pkg.startsWith('@') && pkg.includes('@', 1)) {
    // Scoped package with version: @scope/name@version
    const atIdx = pkg.lastIndexOf('@');
    name = pkg.slice(0, atIdx);
    version = pkg.slice(atIdx + 1);
  }

  // If version is 'latest', resolve it via npm registry
  if (version === 'latest') {
    try {
      const proc = spawn('npm', ['view', name, 'version'], { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      proc.stdout.on('data', d => out += d);
      const code = await new Promise(res => proc.on('close', res));
      if (code === 0 && out.trim()) {
        version = `^${out.trim()}`;
      } else {
        version = '*';
      }
    } catch {
      version = '*';
    }
  }

  const section = isDev ? 'npm.dev' : 'npm';
  addToSection(tomlPath, section, name, version);

  console.log(`  Added ${name}@${version} to [${section}] in tova.toml`);

  // Run install
  await installDeps();
}

async function removeDep(pkg) {
  if (!pkg) {
    console.error('Error: No package specified');
    console.error('Usage: tova remove <package>');
    process.exit(1);
  }

  const cwd = process.cwd();
  const tomlPath = join(cwd, 'tova.toml');

  if (!existsSync(tomlPath)) {
    console.error('Error: No tova.toml found in current directory');
    process.exit(1);
  }

  // Try removing from [npm] first, then [npm.dev]
  const removed = removeFromSection(tomlPath, 'npm', pkg) ||
                  removeFromSection(tomlPath, 'npm.dev', pkg);

  if (removed) {
    console.log(`  Removed ${pkg} from tova.toml`);
    await installDeps();
  } else {
    console.error(`  Package '${pkg}' not found in tova.toml`);
    process.exit(1);
  }
}

// ─── Migrations ─────────────────────────────────────────────

function findTovaFile(arg) {
  if (arg && arg.endsWith('.tova')) {
    const p = resolve(arg);
    if (existsSync(p)) return p;
    console.error(`Error: File not found: ${p}`);
    process.exit(1);
  }
  for (const name of ['main.tova', 'app.tova']) {
    const p = resolve(name);
    if (existsSync(p)) return p;
  }
  const tovaFiles = findFiles(resolve('.'), '.tova');
  if (tovaFiles.length === 1) return tovaFiles[0];
  if (tovaFiles.length === 0) {
    console.error('Error: No .tova files found');
    process.exit(1);
  }
  console.error('Error: Multiple .tova files found. Specify one explicitly.');
  process.exit(1);
}

function discoverDbConfig(tovaFile) {
  const source = readFileSync(tovaFile, 'utf-8');
  const lexer = new Lexer(source, tovaFile);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, tovaFile);
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
    console.error('Usage: tova migrate:create <name>');
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
  const tovaFile = findTovaFile(args[0]);
  const cfg = discoverDbConfig(tovaFile);
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
  const tovaFile = findTovaFile(args[0]);
  const cfg = discoverDbConfig(tovaFile);
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
function getRunStdlib() { // Only PROPAGATE — codegen tree-shakes stdlib into output.shared
  return PROPAGATE;
}

// ─── npm Interop Utilities ───────────────────────────────────

function hasNpmImports(code) {
  // Match import statements with bare specifiers (not relative paths or runtime imports)
  const importRegex = /^\s*import\s+(?:\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    const source = match[1];
    // Skip relative imports and runtime imports
    if (source.startsWith('./') || source.startsWith('../') || source.startsWith('/') || source.startsWith('./runtime/')) {
      continue;
    }
    return true;
  }
  return false;
}

async function bundleClientCode(clientCode, srcDir) {
  const tmpDir = join(srcDir, '.tova-out', '.tmp-bundle');
  try {
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(join(tmpDir, 'runtime'), { recursive: true });

    // Write runtime files so Bun.build can resolve ./runtime/ imports
    writeFileSync(join(tmpDir, 'runtime', 'reactivity.js'), REACTIVITY_SOURCE);
    writeFileSync(join(tmpDir, 'runtime', 'rpc.js'), RPC_SOURCE);
    writeFileSync(join(tmpDir, 'runtime', 'router.js'), ROUTER_SOURCE);

    // Write client code as entrypoint
    const entryPath = join(tmpDir, '__entry.js');
    writeFileSync(entryPath, clientCode);

    const result = await Bun.build({
      entrypoints: [entryPath],
      bundle: true,
      format: 'esm',
      target: 'browser',
    });

    if (!result.success) {
      const errors = result.logs.filter(l => l.level === 'error').map(l => l.message);
      // Check for missing package errors and provide actionable message
      const missingPkgs = errors
        .map(e => {
          const m = e.match(/Could not resolve ["']([^"']+)["']/);
          return m ? m[1] : null;
        })
        .filter(Boolean);
      if (missingPkgs.length > 0) {
        throw new Error(`Missing npm packages in client block. Run: bun install ${missingPkgs.join(' ')}`);
      }
      throw new Error(`Client bundling failed:\n${errors.join('\n')}`);
    }

    // Read the bundled output
    const bundled = await result.outputs[0].text();
    return bundled;
  } finally {
    // Clean up temp files
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
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
    prompt: 'tova> ',
  });

  console.log(`\n  Tova REPL v${VERSION}`);
  console.log('  Type expressions to evaluate. Use :quit to exit.\n');

  const context = {};
  const stdlib = getStdlibForRuntime();
  // Use authoritative BUILTIN_NAMES + runtime names (Ok, Err, Some, None, __propagate)
  const stdlibNames = [...BUILTIN_NAMES, 'Ok', 'Err', 'Some', 'None', '__propagate'];
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
      const output = compileTova(input, '<repl>');
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
          // Extract function/const names from compiled code to avoid shadowing conflicts
          const declaredInCode = new Set();
          for (const m of evalCode.matchAll(/\bfunction\s+([a-zA-Z_]\w*)/g)) declaredInCode.add(m[1]);
          for (const m of evalCode.matchAll(/\bconst\s+([a-zA-Z_]\w*)/g)) declaredInCode.add(m[1]);
          const ctxKeys = Object.keys(context).filter(k => !declaredInCode.has(k));
          const destructure = ctxKeys.length > 0 ? `const {${ctxKeys.join(',')}} = __ctx;` : '';
          const fn = new Function('__ctx', `${destructure}\n${evalCode}`);
          const result = fn(context);
          if (result !== undefined) {
            console.log(' ', result);
          }
        } catch (e) {
          // If return-wrapping fails, fall back to plain execution
          const declaredInCode = new Set();
          for (const m of code.matchAll(/\bfunction\s+([a-zA-Z_]\w*)/g)) declaredInCode.add(m[1]);
          for (const m of code.matchAll(/\bconst\s+([a-zA-Z_]\w*)/g)) declaredInCode.add(m[1]);
          const ctxKeys = Object.keys(context).filter(k => !declaredInCode.has(k));
          const destructure = ctxKeys.length > 0 ? `const {${ctxKeys.join(',')}} = __ctx;` : '';
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
    if (!filename || !filename.endsWith('.tova')) return;
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
  constructor(sourceFile, sourceFiles = null) {
    this.sourceFile = sourceFile;
    // Multi-source support: array of all source files for merged output
    this.sourceFiles = sourceFiles || [sourceFile];
    this._sourceIndex = new Map();
    for (let i = 0; i < this.sourceFiles.length; i++) {
      this._sourceIndex.set(this.sourceFiles[i], i);
    }
    this.mappings = [];
    this.outputLine = 0;
    this.outputCol = 0;
  }

  addMapping(sourceLine, sourceCol, outputLine, outputCol, sourceFile = null) {
    const srcIdx = sourceFile ? (this._sourceIndex.get(sourceFile) || 0) : 0;
    this.mappings.push({ sourceLine, sourceCol, outputLine, outputCol, sourceIdx: srcIdx });
  }

  // Generate a VLQ-encoded source map
  generate(sourceContent, sourceContentsMap = null) {
    const sources = this.sourceFiles;
    const names = [];

    // Build sourcesContent array for multi-source
    let sourcesContent;
    if (sourceContentsMap && sourceContentsMap instanceof Map) {
      sourcesContent = sources.map(s => sourceContentsMap.get(s) || null);
    } else if (sourceContent) {
      sourcesContent = [sourceContent];
    }

    // Sort mappings by output position
    this.mappings.sort((a, b) => a.outputLine - b.outputLine || a.outputCol - b.outputCol);

    // Encode mappings using VLQ
    let prevOutputCol = 0;
    let prevSourceIdx = 0;
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
      segment.push(this._vlqEncode(m.sourceIdx - prevSourceIdx));
      segment.push(this._vlqEncode(m.sourceLine - prevSourceLine));
      segment.push(this._vlqEncode(m.sourceCol - prevSourceCol));

      currentLine.push(segment.join(''));
      prevOutputCol = m.outputCol;
      prevSourceIdx = m.sourceIdx;
      prevSourceLine = m.sourceLine;
      prevSourceCol = m.sourceCol;
    }
    lines.push(currentLine.join(','));

    const outFile = typeof this.sourceFile === 'string' ? this.sourceFile.replace('.tova', '.js') : 'merged.js';
    return JSON.stringify({
      version: 3,
      file: outFile,
      sources,
      sourcesContent: sourcesContent || undefined,
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

  toDataURL(sourceContent, sourceContentsMap = null) {
    const mapJson = this.generate(sourceContent, sourceContentsMap);
    const base64 = Buffer.from(mapJson).toString('base64');
    return `//# sourceMappingURL=data:application/json;base64,${base64}`;
  }
}

// ─── Production Build ────────────────────────────────────────

async function productionBuild(srcDir, outDir) {
  const tovaFiles = findFiles(srcDir, '.tova');
  if (tovaFiles.length === 0) {
    console.error('No .tova files found');
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });

  console.log(`\n  Production build...\n`);

  let allClientCode = '';
  let allServerCode = '';
  let allSharedCode = '';
  let cssContent = '';

  for (const file of tovaFiles) {
    try {
      const source = readFileSync(file, 'utf-8');
      const output = compileTova(source, file);

      if (output.shared) allSharedCode += output.shared + '\n';
      if (output.server) allServerCode += output.server + '\n';
      if (output.client) allClientCode += output.client + '\n';
    } catch (err) {
      console.error(`  Error in ${relative(srcDir, file)}: ${err.message}`);
      process.exit(1);
    }
  }

  // Generate content hash for cache busting
  const hashCode = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);

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
    const fullClientModule = allSharedCode + '\n' + allClientCode;

    let clientBundle;
    let useModule = false;

    if (hasNpmImports(fullClientModule)) {
      // npm imports detected — bundle with Bun.build to resolve bare specifiers
      clientBundle = await bundleClientCode(fullClientModule, srcDir);
      useModule = true;
    } else {
      // No npm imports — inline runtime, strip all imports
      const reactivityCode = REACTIVITY_SOURCE.replace(/^export /gm, '');
      const rpcCode = RPC_SOURCE.replace(/^export /gm, '');
      clientBundle = reactivityCode + '\n' + rpcCode + '\n' + allSharedCode + '\n' +
        allClientCode.replace(/^\s*import\s+(?:\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+['"][^'"]+['"];?\s*$/gm, '').trim();
    }

    const hash = hashCode(clientBundle);
    const clientPath = join(outDir, `client.${hash}.js`);
    writeFileSync(clientPath, clientBundle);
    console.log(`  client.${hash}.js`);

    // Generate production HTML
    const scriptTag = useModule
      ? `<script type="module" src="client.${hash}.js"></script>`
      : `<script src="client.${hash}.js"></script>`;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tova App</title>
</head>
<body>
  <div id="app"></div>
  ${scriptTag}
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

  function collectFromNode(node) {
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

  for (const node of ast.body) {
    // Also collect exports from inside shared/server/client blocks
    if (node.type === 'SharedBlock' || node.type === 'ServerBlock' || node.type === 'ClientBlock') {
      if (node.body) {
        for (const inner of node.body) {
          collectFromNode(inner);
        }
      }
      continue;
    }
    collectFromNode(node);
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
    // Parse and find .tova imports
    const lexer = new Lexer(source, filename);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, filename);
    const ast = parser.parse();

    // Collect this module's exports for validation
    collectExports(ast, filename);

    // Resolve .tova imports first
    for (const node of ast.body) {
      if (node.type === 'ImportDeclaration' && node.source.endsWith('.tova')) {
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
        node.source = node.source.replace('.tova', '.shared.js');
      }
      if (node.type === 'ImportDefault' && node.source.endsWith('.tova')) {
        const importPath = resolve(dirname(filename), node.source);
        if (compilationInProgress.has(importPath)) {
          throw new Error(`Circular import detected: ${filename} → ${importPath}`);
        } else if (existsSync(importPath) && !compilationCache.has(importPath)) {
          const importSource = readFileSync(importPath, 'utf-8');
          compileWithImports(importSource, importPath, srcDir);
        }
        node.source = node.source.replace('.tova', '.shared.js');
      }
      if (node.type === 'ImportWildcard' && node.source.endsWith('.tova')) {
        const importPath = resolve(dirname(filename), node.source);
        if (compilationInProgress.has(importPath)) {
          throw new Error(`Circular import detected: ${filename} → ${importPath}`);
        } else if (existsSync(importPath) && !compilationCache.has(importPath)) {
          const importSource = readFileSync(importPath, 'utf-8');
          compileWithImports(importSource, importPath, srcDir);
        }
        node.source = node.source.replace('.tova', '.shared.js');
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

// ─── Multi-file Directory Merging ────────────────────────────

function validateMergedAST(mergedBlocks, sourceFiles) {
  const errors = [];

  function addDup(kind, name, loc1, loc2) {
    const f1 = loc1.source || 'unknown';
    const f2 = loc2.source || 'unknown';
    errors.push(
      `Duplicate ${kind} '${name}'\n` +
      `  → first defined in ${basename(f1)}:${loc1.line}\n` +
      `  → also defined in ${basename(f2)}:${loc2.line}`
    );
  }

  // Check client blocks — top-level declarations only
  const clientDecls = { component: new Map(), state: new Map(), computed: new Map(), store: new Map(), fn: new Map() };
  for (const block of mergedBlocks.clientBlocks) {
    for (const stmt of block.body) {
      const loc = stmt.loc || block.loc;
      if (stmt.type === 'ComponentDeclaration') {
        if (clientDecls.component.has(stmt.name)) addDup('component', stmt.name, clientDecls.component.get(stmt.name), loc);
        else clientDecls.component.set(stmt.name, loc);
      } else if (stmt.type === 'StateDeclaration') {
        const name = stmt.name || (stmt.targets && stmt.targets[0]);
        if (name) {
          if (clientDecls.state.has(name)) addDup('state', name, clientDecls.state.get(name), loc);
          else clientDecls.state.set(name, loc);
        }
      } else if (stmt.type === 'ComputedDeclaration') {
        const name = stmt.name;
        if (name) {
          if (clientDecls.computed.has(name)) addDup('computed', name, clientDecls.computed.get(name), loc);
          else clientDecls.computed.set(name, loc);
        }
      } else if (stmt.type === 'StoreDeclaration') {
        if (clientDecls.store.has(stmt.name)) addDup('store', stmt.name, clientDecls.store.get(stmt.name), loc);
        else clientDecls.store.set(stmt.name, loc);
      } else if (stmt.type === 'FunctionDeclaration') {
        if (clientDecls.fn.has(stmt.name)) addDup('function', stmt.name, clientDecls.fn.get(stmt.name), loc);
        else clientDecls.fn.set(stmt.name, loc);
      }
    }
  }

  // Check server blocks — group by block name, check within same-name groups
  const serverGrouped = new Map();
  for (const block of mergedBlocks.serverBlocks) {
    const key = block.name || null;
    if (!serverGrouped.has(key)) serverGrouped.set(key, []);
    serverGrouped.get(key).push(block);
  }

  for (const [, blocks] of serverGrouped) {
    const serverDecls = { fn: new Map(), model: new Map(), route: new Map() };
    const singletons = new Map(); // db, cors, auth, session, etc.
    const SINGLETON_TYPES = {
      'DbDeclaration': 'db', 'CorsDeclaration': 'cors', 'AuthDeclaration': 'auth',
      'SessionDeclaration': 'session', 'CompressionDeclaration': 'compression',
      'TlsDeclaration': 'tls', 'UploadDeclaration': 'upload', 'RateLimitDeclaration': 'rate_limit',
    };

    for (const block of blocks) {
      const walkBody = (stmts) => {
        for (const stmt of stmts) {
          const loc = stmt.loc || block.loc;
          if (stmt.type === 'FunctionDeclaration') {
            if (serverDecls.fn.has(stmt.name)) addDup('server function', stmt.name, serverDecls.fn.get(stmt.name), loc);
            else serverDecls.fn.set(stmt.name, loc);
          } else if (stmt.type === 'ModelDeclaration') {
            if (serverDecls.model.has(stmt.name)) addDup('model', stmt.name, serverDecls.model.get(stmt.name), loc);
            else serverDecls.model.set(stmt.name, loc);
          } else if (stmt.type === 'RouteDeclaration') {
            const routeKey = `${stmt.method} ${stmt.path}`;
            if (serverDecls.route.has(routeKey)) addDup('route', routeKey, serverDecls.route.get(routeKey), loc);
            else serverDecls.route.set(routeKey, loc);
          } else if (SINGLETON_TYPES[stmt.type]) {
            const sName = SINGLETON_TYPES[stmt.type];
            if (singletons.has(sName)) addDup('server config', sName, singletons.get(sName), loc);
            else singletons.set(sName, loc);
          } else if (stmt.type === 'RouteGroupDeclaration') {
            walkBody(stmt.body);
          }
        }
      };
      walkBody(block.body);
    }
  }

  // Check shared blocks
  const sharedDecls = { type: new Map(), fn: new Map(), interface: new Map() };
  for (const block of mergedBlocks.sharedBlocks) {
    for (const stmt of block.body) {
      const loc = stmt.loc || block.loc;
      if (stmt.type === 'TypeDeclaration') {
        if (sharedDecls.type.has(stmt.name)) addDup('type', stmt.name, sharedDecls.type.get(stmt.name), loc);
        else sharedDecls.type.set(stmt.name, loc);
      } else if (stmt.type === 'FunctionDeclaration') {
        if (sharedDecls.fn.has(stmt.name)) addDup('shared function', stmt.name, sharedDecls.fn.get(stmt.name), loc);
        else sharedDecls.fn.set(stmt.name, loc);
      } else if (stmt.type === 'InterfaceDeclaration' || stmt.type === 'TraitDeclaration') {
        if (sharedDecls.interface.has(stmt.name)) addDup('interface/trait', stmt.name, sharedDecls.interface.get(stmt.name), loc);
        else sharedDecls.interface.set(stmt.name, loc);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error('Merge validation failed:\n\n' + errors.join('\n\n'));
  }
}

function mergeDirectory(dir, srcDir, options = {}) {
  // Find all .tova files in this directory only (non-recursive)
  const entries = readdirSync(dir);
  const tovaFiles = entries
    .filter(e => e.endsWith('.tova') && !e.startsWith('.'))
    .map(e => join(dir, e))
    .filter(f => statSync(f).isFile())
    .sort();

  if (tovaFiles.length === 0) return null;
  if (tovaFiles.length === 1) {
    // Single file — use existing per-file compilation
    const file = tovaFiles[0];
    const source = readFileSync(file, 'utf-8');
    return { output: compileWithImports(source, file, srcDir), files: [file], single: true };
  }

  // Parse all files in the directory
  const parsedFiles = [];
  for (const file of tovaFiles) {
    const source = readFileSync(file, 'utf-8');
    const lexer = new Lexer(source, file);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, file);
    const ast = parser.parse();

    // Collect exports for cross-file import validation
    collectExports(ast, file);

    // Resolve cross-directory .tova imports (same logic as compileWithImports)
    for (const node of ast.body) {
      if ((node.type === 'ImportDeclaration' || node.type === 'ImportDefault' || node.type === 'ImportWildcard') && node.source.endsWith('.tova')) {
        const importPath = resolve(dirname(file), node.source);
        // Only process imports from OTHER directories (same-dir files are merged)
        if (dirname(importPath) !== dir) {
          if (compilationInProgress.has(importPath)) {
            throw new Error(`Circular import detected: ${file} → ${importPath}`);
          } else if (existsSync(importPath) && !compilationCache.has(importPath)) {
            const importSource = readFileSync(importPath, 'utf-8');
            compileWithImports(importSource, importPath, srcDir);
          }
          // Validate imported names
          if (node.type === 'ImportDeclaration' && moduleExports.has(importPath)) {
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
          // Rewrite to .js
          node.source = node.source.replace('.tova', '.shared.js');
        } else {
          // Same-directory import — remove it since files are merged
          node._removed = true;
        }
      }
    }

    parsedFiles.push({ file, source, ast });
  }

  // Merge ASTs: collect blocks from all files, tagged with source file
  const mergedBody = [];
  const sharedBlocks = [];
  const serverBlocks = [];
  const clientBlocks = [];

  for (const { file, ast } of parsedFiles) {
    for (const node of ast.body) {
      // Skip removed same-directory imports
      if (node._removed) continue;

      // Tag node with source file for source maps and error reporting
      if (node.loc) node.loc.source = file;
      else node.loc = { line: 1, column: 0, source: file };

      // Tag children too
      if (node.body && Array.isArray(node.body)) {
        for (const child of node.body) {
          if (child.loc) child.loc.source = file;
          else child.loc = { line: 1, column: 0, source: file };
        }
      }

      if (node.type === 'SharedBlock') sharedBlocks.push(node);
      else if (node.type === 'ServerBlock') serverBlocks.push(node);
      else if (node.type === 'ClientBlock') clientBlocks.push(node);

      mergedBody.push(node);
    }
  }

  // Validate for duplicate declarations across files
  validateMergedAST({ sharedBlocks, serverBlocks, clientBlocks }, tovaFiles);

  // Build merged Program AST
  const mergedAST = new Program(mergedBody);

  // Run analyzer on merged AST
  const analyzer = new Analyzer(mergedAST, dir);
  const { warnings } = analyzer.analyze();

  if (warnings.length > 0) {
    for (const w of warnings) {
      console.warn(`  Warning: ${w.message} (line ${w.line})`);
    }
  }

  // Run codegen on merged AST
  const codegen = new CodeGenerator(mergedAST, dir);
  const output = codegen.generate();

  // Collect source content from all files for source maps
  const sourceContents = new Map();
  for (const { file, source } of parsedFiles) {
    sourceContents.set(file, source);
  }
  output._sourceContents = sourceContents;
  output._sourceFiles = tovaFiles;

  return { output, files: tovaFiles, single: false };
}

// Group .tova files by their parent directory
function groupFilesByDirectory(files) {
  const groups = new Map();
  for (const file of files) {
    const dir = dirname(file);
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push(file);
  }
  return groups;
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
