// src/cli/dev.js — Development server
import { resolve, basename, dirname, join, relative, extname } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync } from 'fs';
import { spawn } from 'child_process';
import { watch as fsWatch } from 'fs';
import { mergeDirectory, fixImportPaths, groupFilesByDirectory, compilationCache, moduleTypeCache, compilationInProgress, moduleExports, invalidateFile } from './compile.js';
import { color, findFiles, _compatServe, hasNpmImports, bundleClientCode, _hasBun } from './utils.js';
import { resolveConfig } from '../config/resolve.js';
import { REACTIVITY_SOURCE, RPC_SOURCE, ROUTER_SOURCE, DEVTOOLS_SOURCE, SSR_SOURCE, TESTING_SOURCE } from '../runtime/embedded.js';

async function devServer(args) {
  const config = resolveConfig(process.cwd());
  // Parse --port value first, then filter positional args (skip flag values)
  const explicitPort = args.find((_, i, a) => a[i - 1] === '--port');
  const basePort = parseInt(explicitPort || config.dev?.port || '3000');
  const flagsWithValues = new Set(['--port']);
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { if (flagsWithValues.has(args[i])) i++; continue; }
    positional.push(args[i]);
  }
  const explicitSrc = positional[0];
  const srcDir = resolve(explicitSrc || config.project?.entry || '.');
  const buildStrict = args.includes('--strict');
  const buildStrictSecurity = args.includes('--strict-security');

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
      reloadServer = await _compatServe({
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
  writeFileSync(join(runtimeDest, 'devtools.js'), DEVTOOLS_SOURCE);
  writeFileSync(join(runtimeDest, 'ssr.js'), SSR_SOURCE);
  writeFileSync(join(runtimeDest, 'testing.js'), TESTING_SOURCE);

  const serverFiles = [];
  let hasClient = false;

  // Clear import caches for fresh compilation
  compilationCache.clear(); moduleTypeCache.clear();
  compilationInProgress.clear();
  moduleExports.clear();

  // Compile via directory merging
  const dirGroups = groupFilesByDirectory(tovaFiles);
  let clientHTML = '';

  // Pass 1: Merge each directory, write shared/client outputs, collect clientHTML
  const dirResults = [];
  const allSharedParts = [];
  let browserCode = '';
  for (const [dir, files] of dirGroups) {
    const dirName = basename(dir) === '.' ? 'app' : basename(dir);
    try {
      const result = mergeDirectory(dir, srcDir, { strict: buildStrict, strictSecurity: buildStrictSecurity, isDev: true });
      if (!result) continue;

      const { output, single } = result;
      const relDir = relative(srcDir, dir);
      const outBaseName = single
        ? relative(srcDir, files[0]).replace(/\.tova$/, '').replace(/\\/g, '/')
        : (relDir === '.' ? dirName : relDir + '/' + dirName);
      dirResults.push({ dir, output, outBaseName, single, files });

      // Ensure output subdirectory exists for nested paths
      const outSubDir = dirname(join(outDir, outBaseName));
      if (outSubDir !== outDir) mkdirSync(outSubDir, { recursive: true });

      if (output.shared && output.shared.trim()) {
        // Use .js (not .shared.js) for module files to match build output
        const ext = (output.isModule || (!output.browser && !output.server)) ? '.js' : '.shared.js';
        const sp = join(outDir, `${outBaseName}${ext}`);
        const fixedShared = fixImportPaths(output.shared, sp, outDir);
        writeFileSync(sp, fixedShared);
        allSharedParts.push(fixedShared);
      }

      if (output.browser) {
        const p = join(outDir, `${outBaseName}.browser.js`);
        const browserSrcDir = (relative(srcDir, dir) === '.' || relative(srcDir, dir) === '') ? srcDir : undefined;
        const fixedBrowser = fixImportPaths(output.browser, p, outDir, browserSrcDir);
        writeFileSync(p, fixedBrowser);
        browserCode = fixedBrowser;
        hasClient = true;
      }
    } catch (err) {
      console.error(`  ✗ ${relative(srcDir, dir)}: ${err.message}`);
    }
  }

  // Generate dev HTML with all shared code prepended to browser code
  // Skip if the project has its own index.html (uses import maps or custom module loading)
  const hasCustomIndex = existsSync(join(process.cwd(), 'index.html'));
  if (hasClient && !hasCustomIndex) {
    const allSharedCode = allSharedParts.join('\n').replace(/^export /gm, '');
    const fullClientCode = allSharedCode ? allSharedCode + '\n' + browserCode : browserCode;
    clientHTML = await generateDevHTML(fullClientCode, srcDir, actualReloadPort);
    writeFileSync(join(outDir, 'index.html'), clientHTML);
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

    if (output.multiBlock && output.browsers) {
      for (const [name, code] of Object.entries(output.browsers)) {
        if (name === 'default') continue;
        const p = join(outDir, `${outBaseName}.browser.${name}.js`);
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
      env: { ...process.env, [envKey]: String(port), PORT: String(port), __TOVA_HMR_STATE_PATH: join(outDir, '.hmr-state.json') },
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

  // If no server blocks were found but we have a client, start a static file server
  if (processes.length === 0 && hasClient) {
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.mjs': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.map': 'application/json',
    };

    const staticServer = await _compatServe({
      port: basePort,
      async fetch(req) {
        const url = new URL(req.url);
        let pathname = url.pathname;

        // Try to serve the file directly from outDir, srcDir, or project root
        const tryPaths = [
          join(outDir, pathname),
          join(srcDir, pathname),
          join(process.cwd(), pathname),
        ];

        for (const filePath of tryPaths) {
          if (existsSync(filePath) && statSync(filePath).isFile()) {
            const ext = extname(filePath);
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            const content = readFileSync(filePath);
            return new Response(content, {
              headers: {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }
        }

        // SPA fallback: serve index.html for non-file routes
        const indexPath = join(outDir, 'index.html');
        if (existsSync(indexPath)) {
          return new Response(readFileSync(indexPath), {
            headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' },
          });
        }

        const rootIndex = join(process.cwd(), 'index.html');
        if (existsSync(rootIndex)) {
          return new Response(readFileSync(rootIndex), {
            headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' },
          });
        }

        return new Response('Not Found', { status: 404 });
      },
    });

    console.log(`\n  Static file server running:`);
    console.log(`    → http://localhost:${basePort}`);
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

    // invalidateFile() was already called by startWatcher — just clear transient state
    compilationInProgress.clear();

    try {
      // Merge each directory group, collect client HTML
      const rebuildDirGroups = groupFilesByDirectory(currentFiles);
      let rebuildClientHTML = '';
      const rebuildSharedParts = [];
      let rebuildBrowserCode = '';
      let rebuildHasClient = false;

      // First pass: collect all outputs without writing server files yet
      const dirOutputs = [];
      for (const [dir, files] of rebuildDirGroups) {
        const dirName = basename(dir) === '.' ? 'app' : basename(dir);
        const result = mergeDirectory(dir, srcDir, { strict: buildStrict, strictSecurity: buildStrictSecurity, isDev: true });
        if (!result) continue;

        const { output, single } = result;
        const relDir = relative(srcDir, dir);
        const outBaseName = single
          ? relative(srcDir, files[0]).replace(/\.tova$/, '').replace(/\\/g, '/')
          : (relDir === '.' ? dirName : relDir + '/' + dirName);

        // Ensure output subdirectory exists for nested paths
        const outSubDir = dirname(join(outDir, outBaseName));
        if (outSubDir !== outDir) mkdirSync(outSubDir, { recursive: true });

        if (output.shared && output.shared.trim()) {
          const ext = (output.isModule || (!output.browser && !output.server)) ? '.js' : '.shared.js';
          const sp = join(outDir, `${outBaseName}${ext}`);
          const fixedShared = fixImportPaths(output.shared, sp, outDir);
          writeFileSync(sp, fixedShared);
          rebuildSharedParts.push(fixedShared);
        }
        if (output.browser) {
          const p = join(outDir, `${outBaseName}.browser.js`);
          const browserSrcDir = (relative(srcDir, dir) === '.' || relative(srcDir, dir) === '') ? srcDir : undefined;
          const fixedBrowser = fixImportPaths(output.browser, p, outDir, browserSrcDir);
          writeFileSync(p, fixedBrowser);
          rebuildBrowserCode = fixedBrowser;
          rebuildHasClient = true;
        }

        // Store outputs for second pass
        dirOutputs.push({ output, outBaseName });
      }

      // Generate dev HTML with all shared code prepended to browser code
      if (rebuildHasClient) {
        const rebuildAllShared = rebuildSharedParts.join('\n').replace(/^export /gm, '');
        const rebuildFullClient = rebuildAllShared ? rebuildAllShared + '\n' + rebuildBrowserCode : rebuildBrowserCode;
        rebuildClientHTML = await generateDevHTML(rebuildFullClient, srcDir, actualReloadPort);
        writeFileSync(join(outDir, 'index.html'), rebuildClientHTML);
      }

      // Second pass: write server files with correct __clientHTML
      for (const { output, outBaseName } of dirOutputs) {
        if (output.server) {
          let serverCode = output.server;
          if (rebuildClientHTML) {
            serverCode = `const __clientHTML = ${JSON.stringify(rebuildClientHTML)};\n` + serverCode;
          }
          const p = join(outDir, `${outBaseName}.server.js`);
          writeFileSync(p, fixImportPaths(serverCode, p, outDir));
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
        env: { ...process.env, PORT: String(port), __TOVA_HMR_STATE_PATH: join(outDir, '.hmr-state.json') },
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
    // Clean up HMR state file for fresh start next time
    const hmrPath = join(outDir, '.hmr-state.json');
    try { if (existsSync(hmrPath)) rmSync(hmrPath); } catch {}
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
}

async function generateDevHTML(clientCode, srcDir, reloadPort = 0) {
  const liveReloadScript = reloadPort ? `
  <script>
    (function() {
      var reloadUrl = "http://localhost:${reloadPort}/__tova_reload";
      var es = new EventSource(reloadUrl);
      var errorCount = 0;
      es.onopen = function() { errorCount = 0; };
      es.onmessage = function(e) { if (e.data === "reload") window.location.reload(); };
      es.onerror = function() {
        errorCount++;
        // EventSource auto-reconnects — only intervene after repeated failures
        if (errorCount < 3) return;
        es.close();
        // SSE server is likely gone (dev server restarting) — poll until back
        var check = setInterval(function() {
          fetch(reloadUrl, { mode: "no-cors" }).then(function(r) {
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

  // Detect if client code uses routing (defineRoutes, Router, getPath, navigate, etc.)
  const usesRouter = /\b(createRouter|lazy|resetRouter|defineRoutes|Router|getPath|getQuery|getParams|getCurrentRoute|getMeta|getRouter|navigate|onRouteChange|beforeNavigate|afterNavigate|Outlet|Link|Redirect)\b/.test(clientCode);
  const inlineRouter = usesRouter ? ROUTER_SOURCE.replace(/^export /gm, '').replace(/^\s*import\s+(?:\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+['"][^'"]+['"];?\s*$/gm, '') : '';

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

${usesRouter ? '// ── Tova Runtime: Router ──\n' + inlineRouter : ''}

// ── App ──
${inlineClient}
  </script>${liveReloadScript}
</body>
</html>`;
}

function startWatcher(srcDir, callback) {
  let debounceTimer = null;
  let pendingChanges = new Set();

  console.log(`  Watching for changes in ${srcDir}...`);

  const watcher = fsWatch(srcDir, { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith('.tova')) return;
    pendingChanges.add(resolve(srcDir, filename));
    // Debounce rapid file changes
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const changed = pendingChanges;
      pendingChanges = new Set();
      console.log(`\n  File changed: ${[...changed].map(f => basename(f)).join(', ')}`);
      try {
        for (const changedPath of changed) {
          invalidateFile(changedPath);
        }
        callback();
      } catch (err) {
        console.error(`  Rebuild error: ${err.message}`);
      }
    }, 100);
  });

  return watcher;
}

export { devServer };
