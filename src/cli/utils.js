// src/cli/utils.js — Shared CLI utilities
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'fs';
import { spawnSync as _spawnSync } from 'child_process';
import { createServer as _createHttpServer } from 'http';
import { getFullStdlib, PROPAGATE, NATIVE_INIT } from '../stdlib/inline.js';
import { REACTIVITY_SOURCE, RPC_SOURCE, ROUTER_SOURCE } from '../runtime/embedded.js';

export const _hasBun = typeof Bun !== 'undefined';

// ─── Compat: Bun.serve() fallback to Node http.createServer ─
export function _compatServe({ port, fetch: fetchHandler }) {
  if (_hasBun) {
    return Bun.serve({ port, fetch: fetchHandler });
  }
  // Node.js fallback using http.createServer
  return new Promise((resolve, reject) => {
    const server = _createHttpServer(async (req, res) => {
      try {
        const url = `http://localhost:${port}${req.url}`;
        const headers = new Headers();
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
        }
        const request = new Request(url, {
          method: req.method,
          headers,
          ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: req, duplex: 'half' } : {}),
        });
        const response = await fetchHandler(request);
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        if (response.body) {
          const reader = response.body.getReader();
          const pump = async () => {
            while (true) {
              const { done, value } = await reader.read();
              if (done) { res.end(); return; }
              res.write(value);
            }
          };
          pump().catch(() => res.end());
        } else {
          const buf = Buffer.from(await response.arrayBuffer());
          res.end(buf);
        }
      } catch (err) {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });
    server.listen(port, () => resolve(server));
    server.on('error', reject);
  });
}

// ─── Compat: spawnSync fallback to child_process.spawnSync ─
// Accepts Bun-style opts: { stdout: 'pipe', stderr: 'pipe', cwd, timeout }
export function _compatSpawnSync(cmd, args, opts) {
  if (_hasBun) return Bun.spawnSync([cmd, ...args], opts);
  // Translate Bun-style stdout/stderr to Node-style stdio
  const nodeOpts = { ...opts };
  if (!nodeOpts.stdio) {
    nodeOpts.stdio = [
      'pipe',
      nodeOpts.stdout === 'pipe' ? 'pipe' : (nodeOpts.stdout || 'pipe'),
      nodeOpts.stderr === 'pipe' ? 'pipe' : (nodeOpts.stderr || 'pipe'),
    ];
  }
  delete nodeOpts.stdout;
  delete nodeOpts.stderr;
  const result = _spawnSync(cmd, args, nodeOpts);
  return {
    ...result,
    exitCode: result.status,
    stdout: result.stdout ? (typeof result.stdout === 'string' ? result.stdout : result.stdout.toString()) : '',
    stderr: result.stderr ? (typeof result.stderr === 'string' ? result.stderr : result.stderr.toString()) : '',
  };
}

// ─── CLI Color Helpers ──────────────────────────────────────
export const isTTY = process.stdout?.isTTY;
export const color = {
  bold:    s => isTTY ? `\x1b[1m${s}\x1b[0m` : s,
  green:   s => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  yellow:  s => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  red:     s => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  cyan:    s => isTTY ? `\x1b[36m${s}\x1b[0m` : s,
  dim:     s => isTTY ? `\x1b[2m${s}\x1b[0m` : s,
};

// ─── Utilities ──────────────────────────────────────────────

export function getStdlibForRuntime() {
  return getFullStdlib();  // Full stdlib for REPL
}
export function getRunStdlib() { // NATIVE_INIT + PROPAGATE — codegen tree-shakes stdlib into output.shared
  return NATIVE_INIT + '\n' + PROPAGATE;
}

// ─── npm Interop Utilities ───────────────────────────────────

export function hasNpmImports(code) {
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

export async function bundleClientCode(clientCode, srcDir) {
  if (!_hasBun) {
    throw new Error('Client bundling with npm imports requires Bun. Install from https://bun.sh and run with: bun tova build --production');
  }
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

export function _formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function findFiles(dir, ext) {
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
