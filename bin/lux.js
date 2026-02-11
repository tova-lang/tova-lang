#!/usr/bin/env bun

import { resolve, basename, dirname, join, relative } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'fs';
import { spawn } from 'child_process';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
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
  dev              Start development server with hot reload
  new <name>       Create a new Lux project

Options:
  --help, -h       Show this help message
  --version, -v    Show version
  --output, -o     Output directory (default: .lux-out)
  --debug          Show verbose error output
`;

function main() {
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
      runFile(args[1]);
      break;
    case 'build':
      buildProject(args.slice(1));
      break;
    case 'dev':
      devServer(args.slice(1));
      break;
    case 'new':
      newProject(args[1]);
      break;
    default:
      if (command.endsWith('.lux')) {
        runFile(command);
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

  for (const w of warnings) {
    console.warn(`  ⚠ ${w.file}:${w.line}:${w.column} — ${w.message}`);
  }

  const codegen = new CodeGenerator(ast, filename);
  return codegen.generate();
}

// ─── Run ────────────────────────────────────────────────────

function runFile(filePath) {
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
    const stdlib = getStdlibForRuntime();
    const code = stdlib + '\n' + output.shared + '\n' + (output.server || output.client || '');
    const fn = new AsyncFunction(code);
    fn();
  } catch (err) {
    console.error(`\n  Error in ${filePath}:`);
    console.error(`  ${err.message}\n`);
    if (process.argv.includes('--debug') || process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// ─── Build ──────────────────────────────────────────────────

function buildProject(args) {
  const srcDir = resolve(args[0] || '.');
  const outIdx = args.indexOf('--output');
  const outDir = resolve(outIdx >= 0 ? args[outIdx + 1] : '.lux-out');

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
  for (const file of luxFiles) {
    const rel = relative(srcDir, file);
    try {
      const source = readFileSync(file, 'utf-8');
      const output = compileLux(source, file);
      const baseName = basename(file, '.lux');

      // Write shared
      if (output.shared && output.shared.trim()) {
        const sharedPath = join(outDir, `${baseName}.shared.js`);
        writeFileSync(sharedPath, output.shared);
        console.log(`  ✓ ${rel} → ${relative('.', sharedPath)}`);
      }

      // Write default server
      if (output.server) {
        const serverPath = join(outDir, `${baseName}.server.js`);
        writeFileSync(serverPath, output.server);
        console.log(`  ✓ ${rel} → ${relative('.', serverPath)}`);
      }

      // Write default client
      if (output.client) {
        const clientPath = join(outDir, `${baseName}.client.js`);
        writeFileSync(clientPath, output.client);
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

  console.log(`\n  Press Ctrl+C to stop\n`);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n  Shutting down...');
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

// ─── Utilities ──────────────────────────────────────────────

function getStdlibForRuntime() {
  return `function print(...args) { console.log(...args); }
function len(v) { if (v == null) return 0; if (typeof v === 'string' || Array.isArray(v)) return v.length; if (typeof v === 'object') return Object.keys(v).length; return 0; }
function range(s, e, st) { if (e === undefined) { e = s; s = 0; } if (st === undefined) st = s < e ? 1 : -1; const r = []; if (st > 0) { for (let i = s; i < e; i += st) r.push(i); } else { for (let i = s; i > e; i += st) r.push(i); } return r; }
function enumerate(a) { return a.map((v, i) => [i, v]); }
function sum(a) { return a.reduce((x, y) => x + y, 0); }
function sorted(a, k) { const c = [...a]; if (k) c.sort((x, y) => { const kx = k(x), ky = k(y); return kx < ky ? -1 : kx > ky ? 1 : 0; }); else c.sort((x, y) => x < y ? -1 : x > y ? 1 : 0); return c; }
function reversed(a) { return [...a].reverse(); }
function zip(...as) { const m = Math.min(...as.map(a => a.length)); const r = []; for (let i = 0; i < m; i++) r.push(as.map(a => a[i])); return r; }
function min(a) { return Math.min(...a); }
function max(a) { return Math.max(...a); }
function type_of(v) { if (v === null) return 'Nil'; if (Array.isArray(v)) return 'List'; if (v?.__tag) return v.__tag; const t = typeof v; switch(t) { case 'number': return Number.isInteger(v) ? 'Int' : 'Float'; case 'string': return 'String'; case 'boolean': return 'Bool'; case 'function': return 'Function'; case 'object': return 'Object'; default: return 'Unknown'; } }
function filter(arr, fn) { return arr.filter(fn); }
function map(arr, fn) { return arr.map(fn); }`;
}

function findFiles(dir, ext) {
  const results = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
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
