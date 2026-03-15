// src/cli/build.js — Build pipeline commands
import { resolve, basename, dirname, join, relative, extname } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync, chmodSync } from 'fs';
import { createHash as _cryptoHash } from 'crypto';
import { watch as fsWatch } from 'fs';
import { mergeDirectory, compileTova, fixImportPaths, compileWithImports, groupFilesByDirectory, compilationCache, moduleTypeCache, collectExports, injectRouterImport, generateFileBasedRoutes, invalidateFile } from './compile.js';
import { color, findFiles, getRunStdlib, hasNpmImports, bundleClientCode, _formatBytes, _hasBun } from './utils.js';
import { resolveConfig } from '../config/resolve.js';
import { REACTIVITY_SOURCE, RPC_SOURCE, ROUTER_SOURCE, DEVTOOLS_SOURCE, SSR_SOURCE, TESTING_SOURCE } from '../runtime/embedded.js';
import { generateSecurityScorecard } from '../diagnostics/security-scorecard.js';
import { buildSelectiveStdlib, BUILTIN_NAMES, PROPAGATE, NATIVE_INIT } from '../stdlib/inline.js';

async function buildProject(args) {
  const config = resolveConfig(process.cwd());
  const isProduction = args.includes('--production');
  const isStatic = args.includes('--static');
  const buildStrict = args.includes('--strict');
  const buildStrictSecurity = args.includes('--strict-security');
  const isVerbose = args.includes('--verbose');
  const isQuiet = args.includes('--quiet');
  const isWatch = args.includes('--watch');
  const binaryIdx = args.indexOf('--binary');
  const binaryName = binaryIdx >= 0 ? args[binaryIdx + 1] : null;
  const explicitSrc = args.filter(a => !a.startsWith('--') && a !== binaryName)[0];
  const srcDir = resolve(explicitSrc || config.project.entry || '.');
  const outIdx = args.indexOf('--output');
  const outDir = resolve(outIdx >= 0 ? args[outIdx + 1] : (config.build.output || '.tova-out'));

  // Binary compilation: compile to single standalone executable
  if (binaryName) {
    return await binaryBuild(srcDir, binaryName, outDir);
  }

  // Production build uses a separate optimized pipeline
  if (isProduction) {
    return await productionBuild(srcDir, outDir, isStatic);
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
  writeFileSync(join(runtimeDest, 'devtools.js'), DEVTOOLS_SOURCE);
  writeFileSync(join(runtimeDest, 'ssr.js'), SSR_SOURCE);
  writeFileSync(join(runtimeDest, 'testing.js'), TESTING_SOURCE);

  if (!isQuiet) console.log(`\n  Building ${tovaFiles.length} file(s)...\n`);

  let errorCount = 0;
  const buildStart = Date.now();
  compilationCache.clear(); moduleTypeCache.clear();

  // Load incremental build cache
  const noCache = args.includes('--no-cache');
  const buildCache = new BuildCache(join(outDir, '.cache'));
  if (!noCache) buildCache.load();
  let skippedCount = 0;

  // Group files by directory for multi-file merging
  const dirGroups = groupFilesByDirectory(tovaFiles);
  let _scorecardData = null; // Collect security info for scorecard

  for (const [dir, files] of dirGroups) {
    const dirName = basename(dir) === '.' ? 'app' : basename(dir);
    const relDir = relative(srcDir, dir) || '.';
    const groupStart = Date.now();
    try {
      // Check incremental cache: skip if all files in this group are unchanged
      if (!noCache) {
        if (files.length === 1) {
          const absFile = files[0];
          const sourceContent = readFileSync(absFile, 'utf-8');
          if (buildCache.isUpToDate(absFile, sourceContent)) {
            const cached = buildCache.getCached(absFile);
            if (cached) {
              skippedCount++;
              if (isVerbose && !isQuiet) {
                console.log(`  ○ ${relative(srcDir, absFile)} (cached)`);
              }
              continue;
            }
          }
        } else {
          const dirKey = `dir:${dir}`;
          if (buildCache.isGroupUpToDate(dirKey, files)) {
            const cached = buildCache.getCached(dirKey);
            if (cached) {
              skippedCount++;
              if (isVerbose && !isQuiet) {
                console.log(`  ○ ${relative(srcDir, dir)}/ (${files.length} files, cached)`);
              }
              continue;
            }
          }
        }
      }

      const result = mergeDirectory(dir, srcDir, { strict: buildStrict, strictSecurity: buildStrictSecurity });
      if (!result) continue;

      const { output, single, warnings: buildWarnings, securityConfig, hasServer, hasEdge } = result;
      if ((hasServer || hasEdge) && !_scorecardData) {
        _scorecardData = { securityConfig, warnings: buildWarnings || [], hasServer, hasEdge };
      }
      // Preserve relative directory structure in output (e.g., src/lib/math.tova → lib/math.js)
      const outBaseName = single
        ? relative(srcDir, files[0]).replace(/\.tova$/, '').replace(/\\/g, '/')
        : (relDir === '.' ? dirName : relDir + '/' + dirName);
      const relLabel = single ? relative(srcDir, files[0]) : `${relDir}/ (${files.length} files merged)`;
      const elapsed = Date.now() - groupStart;
      const timing = isVerbose ? ` (${elapsed}ms)` : '';

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

      // Ensure output subdirectory exists for nested paths (e.g., lib/math.js)
      const outSubDir = dirname(join(outDir, outBaseName));
      if (outSubDir !== outDir) mkdirSync(outSubDir, { recursive: true });

      // CLI files: write single executable <name>.js with shebang
      if (output.isCli) {
        if (output.cli && output.cli.trim()) {
          const cliPath = join(outDir, `${outBaseName}.js`);
          const shebang = '#!/usr/bin/env node\n';
          writeFileSync(cliPath, shebang + output.cli);
          try { chmodSync(cliPath, 0o755); } catch (e) { /* ignore on Windows */ }
          if (!isQuiet) console.log(`  ✓ ${relLabel} → ${relative('.', cliPath)} [cli]${timing}`);
        }
        if (!noCache) {
          const outputPaths = {};
          if (output.cli && output.cli.trim()) outputPaths.cli = join(outDir, `${outBaseName}.js`);
          if (single) {
            const absFile = files[0];
            const sourceContent = readFileSync(absFile, 'utf-8');
            buildCache.set(absFile, sourceContent, outputPaths);
          } else {
            buildCache.setGroup(`dir:${dir}`, files, outputPaths);
          }
        }
      }
      // Module files: write single <name>.js (not .shared.js)
      else if (output.isModule) {
        if (output.shared && output.shared.trim()) {
          const modulePath = join(outDir, `${outBaseName}.js`);
          writeFileSync(modulePath, fixImportPaths(generateSourceMap(output.shared, modulePath), modulePath, outDir));
          if (!isQuiet) console.log(`  ✓ ${relLabel} → ${relative('.', modulePath)}${timing}`);
        }
        // Update incremental build cache
        if (!noCache) {
          const outputPaths = {};
          if (output.shared && output.shared.trim()) outputPaths.shared = join(outDir, `${outBaseName}.js`);
          if (single) {
            const absFile = files[0];
            const sourceContent = readFileSync(absFile, 'utf-8');
            buildCache.set(absFile, sourceContent, outputPaths);
          } else {
            buildCache.setGroup(`dir:${dir}`, files, outputPaths);
          }
        }
      } else {
        // Write shared
        if (output.shared && output.shared.trim()) {
          const sharedPath = join(outDir, `${outBaseName}.shared.js`);
          writeFileSync(sharedPath, fixImportPaths(generateSourceMap(output.shared, sharedPath), sharedPath, outDir));
          if (!isQuiet) console.log(`  ✓ ${relLabel} → ${relative('.', sharedPath)}${timing}`);
        }

        // Write default server
        if (output.server) {
          const serverPath = join(outDir, `${outBaseName}.server.js`);
          writeFileSync(serverPath, fixImportPaths(generateSourceMap(output.server, serverPath), serverPath, outDir));
          if (!isQuiet) console.log(`  ✓ ${relLabel} → ${relative('.', serverPath)}${timing}`);
        }

        // Write default browser
        if (output.browser) {
          const browserPath = join(outDir, `${outBaseName}.browser.js`);
          // Pass srcDir for file-based routing injection (only for root-level browser output)
          const browserSrcDir = (relDir === '.' || relDir === '') ? srcDir : undefined;
          writeFileSync(browserPath, fixImportPaths(generateSourceMap(output.browser, browserPath), browserPath, outDir, browserSrcDir));
          if (!isQuiet) console.log(`  ✓ ${relLabel} → ${relative('.', browserPath)}${timing}`);
        }

        // Write default edge
        if (output.edge) {
          const edgePath = join(outDir, `${outBaseName}.edge.js`);
          writeFileSync(edgePath, fixImportPaths(generateSourceMap(output.edge, edgePath), edgePath, outDir));
          if (!isQuiet) console.log(`  ✓ ${relLabel} → ${relative('.', edgePath)} [edge]${timing}`);
        }

        // Write named server blocks (multi-block)
        if (output.multiBlock && output.servers) {
          for (const [name, code] of Object.entries(output.servers)) {
            if (name === 'default') continue;
            const path = join(outDir, `${outBaseName}.server.${name}.js`);
            writeFileSync(path, fixImportPaths(code, path, outDir));
            if (!isQuiet) console.log(`  ✓ ${relLabel} → ${relative('.', path)} [server:${name}]${timing}`);
          }
        }

        // Write named edge blocks (multi-block)
        if (output.multiBlock && output.edges) {
          for (const [name, code] of Object.entries(output.edges)) {
            if (name === 'default') continue;
            const path = join(outDir, `${outBaseName}.edge.${name}.js`);
            writeFileSync(path, fixImportPaths(code, path, outDir));
            if (!isQuiet) console.log(`  ✓ ${relLabel} → ${relative('.', path)} [edge:${name}]${timing}`);
          }
        }

        // Write named browser blocks (multi-block)
        if (output.multiBlock && output.browsers) {
          for (const [name, code] of Object.entries(output.browsers)) {
            if (name === 'default') continue;
            const path = join(outDir, `${outBaseName}.browser.${name}.js`);
            writeFileSync(path, fixImportPaths(code, path, outDir));
            if (!isQuiet) console.log(`  ✓ ${relLabel} → ${relative('.', path)} [browser:${name}]${timing}`);
          }
        }

        // Update incremental build cache
        if (!noCache) {
          const outputPaths = {};
          if (output.shared && output.shared.trim()) outputPaths.shared = join(outDir, `${outBaseName}.shared.js`);
          if (output.server) outputPaths.server = join(outDir, `${outBaseName}.server.js`);
          if (output.browser) outputPaths.browser = join(outDir, `${outBaseName}.browser.js`);
          if (single) {
            const absFile = files[0];
            const sourceContent = readFileSync(absFile, 'utf-8');
            buildCache.set(absFile, sourceContent, outputPaths);
          } else {
            buildCache.setGroup(`dir:${dir}`, files, outputPaths);
          }
        }
      }
    } catch (err) {
      console.error(`  ✗ ${relDir}: ${err.message}`);
      errorCount++;
    }
  }

  // Save incremental build cache and prune stale entries
  if (!noCache) {
    const dirKeys = [...dirGroups.keys()].map(d => `dir:${d}`);
    buildCache.prune(tovaFiles, dirKeys);
    buildCache.save();
  }

  const dirCount = dirGroups.size;
  const totalElapsed = Date.now() - buildStart;
  if (!isQuiet) {
    const timingStr = isVerbose ? ` in ${totalElapsed}ms` : '';
    const cachedStr = skippedCount > 0 ? ` (${skippedCount} cached)` : '';
    console.log(`\n  Build complete. ${dirCount - errorCount}/${dirCount} directory group(s) succeeded${cachedStr}${timingStr}.\n`);
  }

  // Security scorecard (shown with --verbose or --strict-security, suppressed with --quiet)
  if ((isVerbose || buildStrictSecurity) && !isQuiet && _scorecardData) {
    const scorecard = generateSecurityScorecard(
      _scorecardData.securityConfig,
      _scorecardData.warnings,
      _scorecardData.hasServer,
      _scorecardData.hasEdge
    );
    if (scorecard) console.log(scorecard.format());
  }

  if (errorCount > 0 && !isWatch) process.exit(1);

  // Watch mode for build command
  if (isWatch) {
    console.log('  Watching for changes...\n');
    let debounceTimer = null;
    const watcher = fsWatch(srcDir, { recursive: true }, (event, filename) => {
      if (!filename || !filename.endsWith('.tova')) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const changedPath = resolve(srcDir, filename);
        invalidateFile(changedPath);
        if (!isQuiet) console.log(`  Rebuilding (${filename} changed)...`);
        try {
          await buildProject(args.filter(a => a !== '--watch'));
        } catch (err) {
          // Continue watching even on error
        }
        if (!isQuiet) console.log('  Watching for changes...\n');
      }, 100);
    });
    // Keep process alive
    await new Promise(() => {});
  }
}

function cleanBuild(args) {
  const config = resolveConfig(process.cwd());
  const outDir = resolve(config.build?.output || '.tova-out');

  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
    console.log(`  Cleaned ${relative('.', outDir)}/`);
  } else {
    console.log(`  Nothing to clean (${relative('.', outDir)}/ does not exist)`);
  }
}

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

async function binaryBuild(srcDir, outputName, outDir) {
  const tovaFiles = findFiles(srcDir, '.tova');
  if (tovaFiles.length === 0) {
    console.error('No .tova files found');
    process.exit(1);
  }

  const tmpDir = join(outDir, '.tova-binary-tmp');
  mkdirSync(tmpDir, { recursive: true });

  console.log(`\n  Compiling to binary: ${outputName}\n`);

  // Step 1: Compile all .tova files to JS
  const sharedParts = [];
  const serverParts = [];
  const browserParts = [];

  for (const file of tovaFiles) {
    try {
      const source = readFileSync(file, 'utf-8');
      const output = compileTova(source, file);
      if (output.shared) sharedParts.push(output.shared);
      if (output.server) serverParts.push(output.server);
      if (output.browser) browserParts.push(output.browser);
    } catch (err) {
      console.error(`  Error in ${relative(srcDir, file)}: ${err.message}`);
      process.exit(1);
    }
  }

  // Step 2: Bundle into a single JS file
  const stdlib = getRunStdlib();
  const allShared = sharedParts.join('\n');
  const allServer = serverParts.join('\n');

  let bundledCode;
  if (allServer.trim()) {
    // Server app
    bundledCode = stdlib + '\n' + allShared + '\n' + allServer;
  } else {
    // Script/shared-only app
    bundledCode = stdlib + '\n' + allShared;
    // Auto-call main() if it exists
    if (/\bfunction\s+main\s*\(/.test(bundledCode)) {
      bundledCode += '\nconst __tova_exit = await main(process.argv.slice(2)); if (typeof __tova_exit === "number") process.exitCode = __tova_exit;\n';
    }
  }

  // Strip import/export statements (everything is inlined)
  bundledCode = bundledCode.replace(/^export /gm, '');
  bundledCode = bundledCode.replace(/^\s*import\s+(?:\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+['"][^'"]+['"];?\s*$/gm, '');

  const entryPath = join(tmpDir, 'entry.js');
  writeFileSync(entryPath, bundledCode);
  console.log(`  Compiled ${tovaFiles.length} file(s) to JS`);

  // Step 3: Use Bun to compile to standalone binary
  const outputPath = resolve(outputName);
  try {
    const { execFileSync } = await import('child_process');
    execFileSync('bun', ['build', '--compile', entryPath, '--outfile', outputPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    // Get file size
    const stat = statSync(outputPath);
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
    console.log(`  Created binary: ${outputPath} (${sizeMB}MB)`);
  } finally {
    // Clean up temp files
    try {
      rmSync(tmpDir, { recursive: true });
    } catch {}
  }

  const displayPath = outputPath.startsWith(process.cwd()) ? './' + relative(process.cwd(), outputPath) : outputPath;
  console.log(`\n  Done! Run with: ${displayPath}\n`);
}

async function productionBuild(srcDir, outDir, isStatic = false) {
  const config = resolveConfig(process.cwd());
  const basePath = config.deploy?.base || '/';
  const base = basePath.endsWith('/') ? basePath : basePath + '/';

  const tovaFiles = findFiles(srcDir, '.tova');
  if (tovaFiles.length === 0) {
    console.error('No .tova files found');
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });

  console.log(`\n  Production build...\n`);

  const browserParts = [];
  const serverParts = [];
  const sharedParts = [];
  let cssContent = '';

  for (const file of tovaFiles) {
    try {
      const source = readFileSync(file, 'utf-8');
      const output = compileWithImports(source, file, srcDir);

      if (output.shared) sharedParts.push(output.shared);
      if (output.server) serverParts.push(output.server);
      if (output.browser) browserParts.push(output.browser);
    } catch (err) {
      console.error(`  Error in ${relative(srcDir, file)}: ${err.message}`);
      process.exit(1);
    }
  }

  const allClientCode = browserParts.join('\n');
  const allServerCode = serverParts.join('\n');
  const allSharedCode = sharedParts.join('\n');

  // Generate content hash for cache busting
  const hashCode = (s) => {
    if (_hasBun) return Bun.hash(s).toString(16).slice(0, 12);
    return _cryptoHash('md5').update(s).digest('hex').slice(0, 12);
  };

  // Write server bundle
  if (allServerCode.trim()) {
    const stdlib = getRunStdlib();
    const serverBundle = stdlib + '\n' + allSharedCode + '\n' + allServerCode;
    const hash = hashCode(serverBundle);
    const serverPath = join(outDir, `server.${hash}.js`);
    writeFileSync(serverPath, serverBundle);
    console.log(`  server.${hash}.js`);

    // Write stable server.js entrypoint for Docker/deployment
    writeFileSync(join(outDir, 'server.js'), `import "./server.${hash}.js";\n`);
  }

  // Write script bundle for plain scripts (no server/client blocks)
  if (!allServerCode.trim() && !allClientCode.trim() && allSharedCode.trim()) {
    const stdlib = getRunStdlib();
    const scriptBundle = stdlib + '\n' + allSharedCode;
    const hash = hashCode(scriptBundle);
    const scriptPath = join(outDir, `script.${hash}.js`);
    writeFileSync(scriptPath, scriptBundle);
    console.log(`  script.${hash}.js`);
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
      const usesRouter = /\b(defineRoutes|Router|getPath|getQuery|getParams|getCurrentRoute|navigate|onRouteChange|beforeNavigate|afterNavigate|Outlet|Link|Redirect)\b/.test(allClientCode);
      const routerCode = usesRouter ? ROUTER_SOURCE.replace(/^export /gm, '').replace(/^\s*import\s+(?:\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+['"][^'"]+['"];?\s*$/gm, '') : '';
      clientBundle = reactivityCode + '\n' + rpcCode + '\n' + (routerCode ? routerCode + '\n' : '') + allSharedCode + '\n' +
        allClientCode.replace(/^\s*import\s+(?:\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+['"][^'"]+['"];?\s*$/gm, '').trim();
    }

    const hash = hashCode(clientBundle);
    const clientPath = join(outDir, `client.${hash}.js`);
    writeFileSync(clientPath, clientBundle);
    console.log(`  client.${hash}.js`);

    // Generate production HTML
    const scriptTag = useModule
      ? `<script type="module" src="${base}.tova-out/client.${hash}.js"></script>`
      : `<script src="${base}.tova-out/client.${hash}.js"></script>`;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tova App</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body>
  <div id="app"></div>
  ${scriptTag}
</body>
</html>`;
    writeFileSync(join(outDir, 'index.html'), html);
    console.log(`  index.html`);

    // SPA fallback files for various static hosts
    writeFileSync(join(outDir, '404.html'), html);
    console.log(`  404.html (GitHub Pages SPA fallback)`);
    writeFileSync(join(outDir, '200.html'), html);
    console.log(`  200.html (Surge SPA fallback)`);
  }

  // Minify all JS bundles using Bun's built-in transpiler
  const jsFiles = readdirSync(outDir).filter(f => f.endsWith('.js') && !f.endsWith('.min.js'));
  let minified = 0;
  for (const f of jsFiles) {
    const filePath = join(outDir, f);
    const minPath = join(outDir, f.replace('.js', '.min.js'));
    try {
      // Use Bun.Transpiler for minification without bundling (preserves imports)
      const source = readFileSync(filePath, 'utf-8');
      const transpiler = new Bun.Transpiler({ minifyWhitespace: true, trimUnusedImports: true });
      const minCode = transpiler.transformSync(source);
      writeFileSync(minPath, minCode);
      const originalSize = Buffer.byteLength(source);
      const minSize = Buffer.byteLength(minCode);
      const ratio = ((1 - minSize / originalSize) * 100).toFixed(0);
      console.log(`  ${f.replace('.js', '.min.js')} (${_formatBytes(minSize)}, ${ratio}% smaller)`);
      minified++;
    } catch {
      // Bun.build not available — fall back to simple whitespace stripping
      try {
        const source = readFileSync(filePath, 'utf-8');
        const stripped = _simpleMinify(source);
        writeFileSync(minPath, stripped);
        const originalSize = Buffer.byteLength(source);
        const minSize = Buffer.byteLength(stripped);
        const ratio = ((1 - minSize / originalSize) * 100).toFixed(0);
        console.log(`  ${f.replace('.js', '.min.js')} (${_formatBytes(minSize)}, ${ratio}% smaller)`);
        minified++;
      } catch {
        // Skip files that can't be minified
      }
    }
  }

  // Rewrite min entrypoints to import minified hashed files
  for (const f of ['server.min.js', 'script.min.js']) {
    const minEntry = join(outDir, f);
    try {
      const content = readFileSync(minEntry, 'utf-8');
      const rewritten = content.replace(/\.js(["'])/g, '.min.js$1');
      writeFileSync(minEntry, rewritten);
    } catch {}
  }

  if (minified === 0 && jsFiles.length > 0) {
    console.log('  (minification skipped — Bun.build unavailable)');
  }

  // Static generation: pre-render each route to its own HTML file
  if (isStatic && allClientCode.trim()) {
    console.log(`\n  Static generation...\n`);

    const routePaths = extractRoutePaths(allClientCode);
    if (routePaths.length > 0) {
      // Read the generated index.html to use as the shell for all routes
      const shellHtml = readFileSync(join(outDir, 'index.html'), 'utf-8');
      for (const routePath of routePaths) {
        const htmlPath = routePath === '/'
          ? join(outDir, 'index.html')
          : join(outDir, routePath.replace(/^\//, ''), 'index.html');

        mkdirSync(dirname(htmlPath), { recursive: true });
        writeFileSync(htmlPath, shellHtml);
        const relPath = relative(outDir, htmlPath);
        console.log(`  ${relPath}`);
      }
      console.log(`\n  Pre-rendered ${routePaths.length} route(s)`);
    }
  }

  console.log(`\n  Production build complete.\n`);
}

function extractRoutePaths(code) {
  // Support both defineRoutes({...}) and createRouter({ routes: {...} })
  let match = code.match(/defineRoutes\s*\(\s*\{([^}]+)\}\s*\)/);
  if (!match) {
    match = code.match(/routes\s*:\s*\{([^}]+)\}/);
  }
  if (!match) return [];

  const paths = [];
  const entries = match[1].matchAll(/"([^"]+)"\s*:/g);
  for (const entry of entries) {
    const path = entry[1];
    if (path === '404' || path === '*') continue;
    if (path.includes(':')) continue;
    paths.push(path);
  }
  return paths;
}

// Fallback JS minifier — string/regex-aware, no AST required
function _simpleMinify(code) {
  // Phase 1: Strip comments while respecting strings and regexes
  let stripped = '';
  let i = 0;
  const len = code.length;
  while (i < len) {
    const ch = code[i];
    // String literals — pass through unchanged
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      stripped += ch;
      i++;
      while (i < len) {
        const c = code[i];
        stripped += c;
        if (c === '\\') { i++; if (i < len) { stripped += code[i]; i++; } continue; }
        if (quote === '`' && c === '$' && code[i + 1] === '{') {
          // Template literal expression — track brace depth
          stripped += code[++i]; // '{'
          i++;
          let depth = 1;
          while (i < len && depth > 0) {
            const tc = code[i];
            if (tc === '{') depth++;
            else if (tc === '}') depth--;
            if (depth > 0) { stripped += tc; i++; }
          }
          if (i < len) { stripped += code[i]; i++; } // closing '}'
          continue;
        }
        if (c === quote) { i++; break; }
        i++;
      }
      continue;
    }
    // Single-line comment
    if (ch === '/' && code[i + 1] === '/') {
      while (i < len && code[i] !== '\n') i++;
      continue;
    }
    // Multi-line comment
    if (ch === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < len - 1 && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    stripped += ch;
    i++;
  }

  // Phase 2: Process line by line
  const lines = stripped.split('\n');
  const out = [];
  for (let j = 0; j < lines.length; j++) {
    let line = lines[j].trim();
    if (!line) continue; // remove blank lines
    // Strip console.log/debug/warn/info statements (production only)
    if (/^\s*console\.(log|debug|warn|info)\s*\(/.test(line)) {
      // Simple balanced-paren check for single-line console calls
      let parens = 0, inStr = false, sq = '';
      for (let k = 0; k < line.length; k++) {
        const c = line[k];
        if (inStr) { if (c === '\\') k++; else if (c === sq) inStr = false; continue; }
        if (c === '"' || c === "'" || c === '`') { inStr = true; sq = c; continue; }
        if (c === '(') parens++;
        if (c === ')') { parens--; if (parens === 0) break; }
      }
      if (parens === 0) continue; // balanced — safe to strip
    }
    out.push(line);
  }

  // Phase 3: Collapse whitespace — protect string literals with placeholders
  let joined = out.join('\n');
  const strings = [];
  // Extract all string literals into placeholders so regexes don't mangle them
  let prot = '';
  let pi = 0;
  const plen = joined.length;
  while (pi < plen) {
    const pc = joined[pi];
    if (pc === '"' || pc === "'" || pc === '`') {
      const q = pc;
      let s = pc;
      pi++;
      while (pi < plen) {
        const c = joined[pi];
        s += c;
        if (c === '\\') { pi++; if (pi < plen) { s += joined[pi]; pi++; } continue; }
        if (q === '`' && c === '$' && joined[pi + 1] === '{') {
          s += joined[++pi]; pi++;
          let d = 1;
          while (pi < plen && d > 0) {
            const tc = joined[pi];
            if (tc === '{') d++; else if (tc === '}') d--;
            if (d > 0) { s += tc; pi++; }
          }
          if (pi < plen) { s += joined[pi]; pi++; }
          continue;
        }
        if (c === q) { pi++; break; }
        pi++;
      }
      strings.push(s);
      prot += `\x01${strings.length - 1}\x01`;
    } else {
      prot += pc;
      pi++;
    }
  }

  // Collapse runs of spaces/tabs to single space
  prot = prot.replace(/[ \t]+/g, ' ');
  // Remove spaces around braces, brackets, parens, semicolons, commas
  prot = prot.replace(/ ?([{}[\]();,]) ?/g, '$1');
  // Restore space after keywords that need it
  prot = prot.replace(/\b(return|const|let|var|if|else|for|while|do|switch|case|throw|new|typeof|instanceof|in|of|yield|await|export|import|from|function|class|extends|async|delete|void)\b(?=[^\s;,})\]])/g, '$1 ');
  // Add space after colon in object literals (key: value)
  prot = prot.replace(/([a-zA-Z0-9_$]):([^\s}])/g, '$1: $2');

  // Restore string literals
  let result = prot.replace(/\x01(\d+)\x01/g, (_, idx) => strings[idx]);

  // Phase 4: Dead function elimination — remove unused top-level functions
  result = _eliminateDeadFunctions(result);

  return result;
}

// Remove top-level function declarations that are never reachable from non-function code.
// Uses reachability analysis to handle mutual recursion (foo<->bar both dead).
function _eliminateDeadFunctions(code) {
  const funcDeclRe = /^function\s+([\w$]+)\s*\(/gm;
  const allDecls = []; // [{ name, start, end }]
  let m;

  // First pass: find all top-level function declarations and their full extent
  while ((m = funcDeclRe.exec(code)) !== null) {
    const name = m[1];
    const start = m.index;
    let depth = 0, i = start, inStr = false, strCh = '', foundOpen = false;
    while (i < code.length) {
      const ch = code[i];
      if (inStr) { if (ch === '\\') { i += 2; continue; } if (ch === strCh) inStr = false; i++; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strCh = ch; i++; continue; }
      if (ch === '{') { depth++; foundOpen = true; }
      else if (ch === '}') { depth--; if (foundOpen && depth === 0) { i++; break; } }
      i++;
    }
    allDecls.push({ name, start, end: i });
  }

  if (allDecls.length === 0) return code;

  // Build a set of all declared function names
  const declaredNames = new Set(allDecls.map(d => d.name));

  // Helper: find which declared names are referenced in a text region
  function findRefs(text) {
    const refs = new Set();
    for (const name of declaredNames) {
      const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      if (new RegExp('\\b' + escaped + '\\b').test(text)) refs.add(name);
    }
    return refs;
  }

  // Build "root" code — everything outside function declarations
  const sortedDecls = [...allDecls].sort((a, b) => a.start - b.start);
  let rootCode = '';
  let pos = 0;
  for (const decl of sortedDecls) {
    rootCode += code.slice(pos, decl.start);
    pos = decl.end;
  }
  rootCode += code.slice(pos);

  // Find which functions are directly reachable from root code
  const rootRefs = findRefs(rootCode);

  // Build dependency graph: for each function, which other declared functions does it reference?
  const deps = new Map();
  for (const decl of allDecls) {
    const body = code.slice(decl.start, decl.end);
    const bodyRefs = findRefs(body);
    bodyRefs.delete(decl.name); // ignore self-references
    deps.set(decl.name, bodyRefs);
  }

  // BFS from root refs to find all transitively reachable functions
  const reachable = new Set();
  const queue = [...rootRefs];
  while (queue.length > 0) {
    const name = queue.pop();
    if (reachable.has(name)) continue;
    reachable.add(name);
    const fnDeps = deps.get(name);
    if (fnDeps) for (const dep of fnDeps) queue.push(dep);
  }

  // Remove unreachable functions
  const toRemove = allDecls.filter(d => !reachable.has(d.name));
  if (toRemove.length === 0) return code;

  toRemove.sort((a, b) => b.start - a.start);
  let result = code;
  for (const { start, end } of toRemove) {
    let removeEnd = end;
    while (removeEnd < result.length && (result[removeEnd] === '\n' || result[removeEnd] === '\r')) removeEnd++;
    result = result.slice(0, start) + result.slice(removeEnd);
  }

  return result;
}

class BuildCache {
  constructor(cacheDir) {
    this._cacheDir = cacheDir;
    this._manifest = null; // { files: { [absPath]: { hash, outputs: {...} } } }
  }

  _manifestPath() {
    return join(this._cacheDir, 'manifest.json');
  }

  _hashContent(content) {
    if (typeof Bun !== 'undefined' && Bun.hash) return Bun.hash(content).toString(16);
    return _cryptoHash('md5').update(content).digest('hex');
  }

  load() {
    try {
      if (existsSync(this._manifestPath())) {
        this._manifest = JSON.parse(readFileSync(this._manifestPath(), 'utf-8'));
      }
    } catch {
      this._manifest = null;
    }
    if (!this._manifest) this._manifest = { files: {} };
  }

  save() {
    mkdirSync(this._cacheDir, { recursive: true });
    writeFileSync(this._manifestPath(), JSON.stringify(this._manifest, null, 2));
  }

  // Check if a source file is unchanged since last build
  isUpToDate(absPath, sourceContent) {
    if (!this._manifest) return false;
    const entry = this._manifest.files[absPath];
    if (!entry) return false;
    return entry.hash === this._hashContent(sourceContent);
  }

  // Check if a multi-file group (directory) is unchanged since last build
  isGroupUpToDate(dirKey, files) {
    if (!this._manifest) return false;
    const entry = this._manifest.files[dirKey];
    if (!entry) return false;
    return entry.hash === this._hashGroup(files);
  }

  // Hash multiple files together for group caching
  _hashGroup(files) {
    let combined = '';
    for (const f of files.slice().sort()) {
      combined += f + readFileSync(f, 'utf-8');
    }
    if (typeof Bun !== 'undefined' && Bun.hash) return Bun.hash(combined).toString(16);
    return _cryptoHash('md5').update(combined).digest('hex');
  }

  // Store compiled output for a multi-file group
  setGroup(dirKey, files, outputs) {
    if (!this._manifest) this._manifest = { files: {} };
    this._manifest.files[dirKey] = {
      hash: this._hashGroup(files),
      outputs,
      timestamp: Date.now(),
    };
  }

  // Get cached compiled output for a source file
  getCached(absPath) {
    if (!this._manifest) return null;
    const entry = this._manifest.files[absPath];
    if (!entry || !entry.outputs) return null;
    // Verify cached output files still exist on disk
    for (const outFile of Object.values(entry.outputs)) {
      if (outFile && !existsSync(outFile)) return null;
    }
    return entry.outputs;
  }

  // Store compiled output for a source file
  set(absPath, sourceContent, outputs) {
    if (!this._manifest) this._manifest = { files: {} };
    this._manifest.files[absPath] = {
      hash: this._hashContent(sourceContent),
      outputs,
      timestamp: Date.now(),
    };
  }

  // Remove stale entries for files/dirs that no longer exist
  prune(existingFiles, existingDirs) {
    if (!this._manifest) return;
    const existingSet = new Set(existingFiles);
    const dirSet = existingDirs ? new Set(existingDirs) : null;
    for (const key of Object.keys(this._manifest.files)) {
      if (key.startsWith('dir:')) {
        if (dirSet && !dirSet.has(key)) delete this._manifest.files[key];
      } else if (!existingSet.has(key)) {
        delete this._manifest.files[key];
      }
    }
  }
}

export { buildProject, cleanBuild };
