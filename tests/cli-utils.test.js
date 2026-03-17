// Tests for src/cli/utils.js — CLI utility functions

import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  _hasBun,
  _compatServe,
  _compatSpawnSync,
  isTTY,
  color,
  getStdlibForRuntime,
  getRunStdlib,
  hasNpmImports,
  bundleClientCode,
  _formatBytes,
  findFiles,
} from '../src/cli/utils.js';

async function waitForHttpReady(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      await response.arrayBuffer();
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

// ─── _hasBun ────────────────────────────────────────────────

describe('_hasBun', () => {
  test('should be true when running under Bun', () => {
    expect(_hasBun).toBe(true);
  });

  test('should be a boolean', () => {
    expect(typeof _hasBun).toBe('boolean');
  });
});

// ─── _compatServe ───────────────────────────────────────────

describe('_compatServe', () => {
  let server;

  afterEach(async () => {
    if (server) {
      try { server.stop?.(); } catch {}
      server = null;
    }
  });

  test('creates a server and responds to requests (Bun path)', async () => {
    server = _compatServe({
      port: 0,
      fetch(req) {
        return new Response('hello from tova', { status: 200 });
      },
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    await waitForHttpReady(`${baseUrl}/`);
    const res = await fetch(`${baseUrl}/`);
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toBe('hello from tova');
  });

  test('server handles custom status codes', async () => {
    server = _compatServe({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/not-found') {
          return new Response('nope', { status: 404 });
        }
        return new Response('ok', { status: 200 });
      },
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    await waitForHttpReady(`${baseUrl}/`);
    const res = await fetch(`${baseUrl}/not-found`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('nope');
  });

  test('server handles custom headers', async () => {
    server = _compatServe({
      port: 0,
      fetch(req) {
        return new Response('json body', {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-Custom': 'test-val' },
        });
      },
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    await waitForHttpReady(`${baseUrl}/`);
    const res = await fetch(`${baseUrl}/`);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('x-custom')).toBe('test-val');
  });

  test('server receives request method and URL', async () => {
    server = _compatServe({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        return new Response(JSON.stringify({ method: req.method, path: url.pathname }), { status: 200 });
      },
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    await waitForHttpReady(`${baseUrl}/`);
    const res = await fetch(`${baseUrl}/api/test`, { method: 'POST' });
    const data = await res.json();
    expect(data.method).toBe('POST');
    expect(data.path).toBe('/api/test');
  });
});

// ─── _compatSpawnSync ───────────────────────────────────────

describe('_compatSpawnSync', () => {
  test('runs echo and captures stdout', () => {
    const result = _compatSpawnSync('echo', ['hello'], { stdout: 'pipe', stderr: 'pipe' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim()).toBe('hello');
  });

  test('captures stderr on failing command', () => {
    const result = _compatSpawnSync('ls', ['--nonexistent-flag-xyz'], { stdout: 'pipe', stderr: 'pipe' });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString().length).toBeGreaterThan(0);
  });

  test('returns non-zero exitCode on failure', () => {
    const result = _compatSpawnSync('false', [], { stdout: 'pipe', stderr: 'pipe' });
    expect(result.exitCode).not.toBe(0);
  });

  test('returns zero exitCode on success', () => {
    const result = _compatSpawnSync('true', [], { stdout: 'pipe', stderr: 'pipe' });
    expect(result.exitCode).toBe(0);
  });

  test('handles multi-word arguments', () => {
    const result = _compatSpawnSync('echo', ['hello', 'world'], { stdout: 'pipe', stderr: 'pipe' });
    expect(result.stdout.toString().trim()).toBe('hello world');
  });

  test('handles cwd option', () => {
    const result = _compatSpawnSync('pwd', [], { stdout: 'pipe', stderr: 'pipe', cwd: '/tmp' });
    expect(result.exitCode).toBe(0);
    // /tmp may resolve to /private/tmp on macOS
    const out = result.stdout.toString().trim();
    expect(out === '/tmp' || out === '/private/tmp').toBe(true);
  });
});

// ─── isTTY ──────────────────────────────────────────────────

describe('isTTY', () => {
  test('is a boolean or undefined', () => {
    // In test environments, isTTY may be true, false, or undefined
    expect(isTTY === true || isTTY === false || isTTY === undefined).toBe(true);
  });
});

// ─── color ──────────────────────────────────────────────────

describe('color', () => {
  test('has all expected methods', () => {
    expect(typeof color.bold).toBe('function');
    expect(typeof color.green).toBe('function');
    expect(typeof color.yellow).toBe('function');
    expect(typeof color.red).toBe('function');
    expect(typeof color.cyan).toBe('function');
    expect(typeof color.dim).toBe('function');
  });

  test('bold wraps with ANSI codes when TTY', () => {
    const result = color.bold('test');
    if (isTTY) {
      expect(result).toBe('\x1b[1mtest\x1b[0m');
    } else {
      expect(result).toBe('test');
    }
  });

  test('green wraps with ANSI codes when TTY', () => {
    const result = color.green('test');
    if (isTTY) {
      expect(result).toBe('\x1b[32mtest\x1b[0m');
    } else {
      expect(result).toBe('test');
    }
  });

  test('yellow wraps with ANSI codes when TTY', () => {
    const result = color.yellow('test');
    if (isTTY) {
      expect(result).toBe('\x1b[33mtest\x1b[0m');
    } else {
      expect(result).toBe('test');
    }
  });

  test('red wraps with ANSI codes when TTY', () => {
    const result = color.red('test');
    if (isTTY) {
      expect(result).toBe('\x1b[31mtest\x1b[0m');
    } else {
      expect(result).toBe('test');
    }
  });

  test('cyan wraps with ANSI codes when TTY', () => {
    const result = color.cyan('test');
    if (isTTY) {
      expect(result).toBe('\x1b[36mtest\x1b[0m');
    } else {
      expect(result).toBe('test');
    }
  });

  test('dim wraps with ANSI codes when TTY', () => {
    const result = color.dim('test');
    if (isTTY) {
      expect(result).toBe('\x1b[2mtest\x1b[0m');
    } else {
      expect(result).toBe('test');
    }
  });

  test('all methods return a string', () => {
    for (const fn of [color.bold, color.green, color.yellow, color.red, color.cyan, color.dim]) {
      expect(typeof fn('hello')).toBe('string');
    }
  });

  test('all methods contain the input text', () => {
    for (const fn of [color.bold, color.green, color.yellow, color.red, color.cyan, color.dim]) {
      expect(fn('mytext')).toContain('mytext');
    }
  });
});

// ─── getStdlibForRuntime ────────────────────────────────────

describe('getStdlibForRuntime', () => {
  test('returns a non-empty string', () => {
    const stdlib = getStdlibForRuntime();
    expect(typeof stdlib).toBe('string');
    expect(stdlib.length).toBeGreaterThan(0);
  });

  test('contains common stdlib functions', () => {
    const stdlib = getStdlibForRuntime();
    // Should contain standard library function definitions
    expect(stdlib).toContain('function');
  });

  test('contains Result/Option types', () => {
    const stdlib = getStdlibForRuntime();
    expect(stdlib).toContain('Ok');
    expect(stdlib).toContain('Err');
    expect(stdlib).toContain('Some');
    expect(stdlib).toContain('None');
  });

  test('contains PROPAGATE', () => {
    const stdlib = getStdlibForRuntime();
    expect(stdlib).toContain('__propagate');
  });
});

// ─── getRunStdlib ───────────────────────────────────────────

describe('getRunStdlib', () => {
  test('returns a non-empty string', () => {
    const stdlib = getRunStdlib();
    expect(typeof stdlib).toBe('string');
    expect(stdlib.length).toBeGreaterThan(0);
  });

  test('contains NATIVE_INIT', () => {
    const stdlib = getRunStdlib();
    expect(stdlib).toContain('__tova_native');
  });

  test('contains PROPAGATE', () => {
    const stdlib = getRunStdlib();
    expect(stdlib).toContain('__propagate');
  });

  test('contains __tova_propagate marker', () => {
    const stdlib = getRunStdlib();
    expect(stdlib).toContain('__tova_propagate');
  });
});

// ─── hasNpmImports ──────────────────────────────────────────

describe('hasNpmImports', () => {
  test('returns true for bare npm import (default)', () => {
    expect(hasNpmImports('import React from "react";')).toBe(true);
  });

  test('returns true for named npm import', () => {
    expect(hasNpmImports('import { useState } from "react";')).toBe(true);
  });

  test('returns true for namespace npm import', () => {
    expect(hasNpmImports('import * as lodash from "lodash";')).toBe(true);
  });

  test('returns true for scoped npm package', () => {
    expect(hasNpmImports('import { something } from "@scope/package";')).toBe(true);
  });

  test('returns false for relative import (./)', () => {
    expect(hasNpmImports('import { foo } from "./foo.js";')).toBe(false);
  });

  test('returns false for relative import (../)', () => {
    expect(hasNpmImports('import { bar } from "../bar.js";')).toBe(false);
  });

  test('returns false for absolute import (/)', () => {
    expect(hasNpmImports('import { baz } from "/absolute/path.js";')).toBe(false);
  });

  test('returns false for no imports', () => {
    expect(hasNpmImports('const x = 42;\nconsole.log(x);')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(hasNpmImports('')).toBe(false);
  });

  test('returns true when mixed with relative imports', () => {
    const code = `
import { foo } from "./foo.js";
import React from "react";
import { bar } from "../bar.js";
    `;
    expect(hasNpmImports(code)).toBe(true);
  });

  test('returns false when only relative imports exist', () => {
    const code = `
import { foo } from "./foo.js";
import { bar } from "../bar.js";
import { baz } from "./utils/baz.js";
    `;
    expect(hasNpmImports(code)).toBe(false);
  });

  test('returns false for runtime imports (./runtime/)', () => {
    expect(hasNpmImports('import { signal } from "./runtime/reactivity.js";')).toBe(false);
  });

  test('handles single-quoted imports', () => {
    expect(hasNpmImports("import React from 'react';")).toBe(true);
  });

  test('handles import without semicolon', () => {
    expect(hasNpmImports('import React from "react"')).toBe(true);
  });

  test('returns false for dynamic imports (not matched by regex)', () => {
    // The regex only matches static import statements
    expect(hasNpmImports('const m = await import("react");')).toBe(false);
  });

  test('returns false for require calls', () => {
    expect(hasNpmImports('const x = require("react");')).toBe(false);
  });
});

// ─── bundleClientCode ───────────────────────────────────────

describe('bundleClientCode', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tova-bundle-test-'));
  });

  afterAll(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('bundles simple JS code', async () => {
    const code = 'const x = 42;\nconsole.log(x);\n';
    const result = await bundleClientCode(code, tmpDir);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('bundles code with relative runtime imports', async () => {
    const code = 'import { createSignal } from "./runtime/reactivity.js";\nconst [x, setX] = createSignal(0);\n';
    const result = await bundleClientCode(code, tmpDir);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('throws error for missing npm package', async () => {
    const code = 'import nonexistent from "this-package-definitely-does-not-exist-xyz-999";\n';
    try {
      await bundleClientCode(code, tmpDir);
      // Should not reach here
      expect(true).toBe(false);
    } catch (err) {
      // Bun.build may throw directly with "Could not resolve" or the function
      // catches it and wraps with "Missing npm packages" — either way, the error
      // should reference the missing package or resolution failure
      const msg = err.message || String(err);
      const validError =
        msg.includes('Missing npm packages') ||
        msg.includes('Could not resolve') ||
        msg.includes('Bundle failed') ||
        msg.includes('bundling failed');
      expect(validError).toBe(true);
    }
  });

  test('cleans up temp directory after bundling', async () => {
    const code = 'const x = 1;\n';
    await bundleClientCode(code, tmpDir);
    const bundleTmp = join(tmpDir, '.tova-out', '.tmp-bundle');
    expect(existsSync(bundleTmp)).toBe(false);
  });

  test('cleans up temp directory even on error', async () => {
    const code = 'import bad from "nonexistent-pkg-abc-xyz-123";\n';
    try {
      await bundleClientCode(code, tmpDir);
    } catch {}
    const bundleTmp = join(tmpDir, '.tova-out', '.tmp-bundle');
    expect(existsSync(bundleTmp)).toBe(false);
  });
});

// ─── _formatBytes ───────────────────────────────────────────

describe('_formatBytes', () => {
  test('0 bytes', () => {
    expect(_formatBytes(0)).toBe('0 B');
  });

  test('small bytes (< 1024)', () => {
    expect(_formatBytes(500)).toBe('500 B');
  });

  test('1 byte', () => {
    expect(_formatBytes(1)).toBe('1 B');
  });

  test('1023 bytes (boundary)', () => {
    expect(_formatBytes(1023)).toBe('1023 B');
  });

  test('exactly 1024 bytes = 1.0 KB', () => {
    expect(_formatBytes(1024)).toBe('1.0 KB');
  });

  test('1536 bytes = 1.5 KB', () => {
    expect(_formatBytes(1536)).toBe('1.5 KB');
  });

  test('10240 bytes = 10.0 KB', () => {
    expect(_formatBytes(10240)).toBe('10.0 KB');
  });

  test('1048575 bytes (just under 1 MB)', () => {
    expect(_formatBytes(1048575)).toBe('1024.0 KB');
  });

  test('exactly 1048576 bytes = 1.0 MB', () => {
    expect(_formatBytes(1048576)).toBe('1.0 MB');
  });

  test('1572864 bytes = 1.5 MB', () => {
    expect(_formatBytes(1572864)).toBe('1.5 MB');
  });

  test('10485760 bytes = 10.0 MB', () => {
    expect(_formatBytes(10485760)).toBe('10.0 MB');
  });

  test('large file (100 MB)', () => {
    expect(_formatBytes(104857600)).toBe('100.0 MB');
  });
});

// ─── findFiles ──────────────────────────────────────────────

describe('findFiles', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tova-findfiles-test-'));

    // Build test directory structure:
    // tmpDir/
    //   a.tova
    //   b.tova
    //   c.js
    //   sub/
    //     d.tova
    //     e.js
    //     deep/
    //       f.tova
    //   .hidden/
    //     g.tova
    //   node_modules/
    //     h.tova
    //   .secret.tova

    writeFileSync(join(tmpDir, 'a.tova'), 'file a');
    writeFileSync(join(tmpDir, 'b.tova'), 'file b');
    writeFileSync(join(tmpDir, 'c.js'), 'file c');
    writeFileSync(join(tmpDir, '.secret.tova'), 'hidden file');

    mkdirSync(join(tmpDir, 'sub'));
    writeFileSync(join(tmpDir, 'sub', 'd.tova'), 'file d');
    writeFileSync(join(tmpDir, 'sub', 'e.js'), 'file e');

    mkdirSync(join(tmpDir, 'sub', 'deep'));
    writeFileSync(join(tmpDir, 'sub', 'deep', 'f.tova'), 'file f');

    mkdirSync(join(tmpDir, '.hidden'));
    writeFileSync(join(tmpDir, '.hidden', 'g.tova'), 'file g');

    mkdirSync(join(tmpDir, 'node_modules'));
    writeFileSync(join(tmpDir, 'node_modules', 'h.tova'), 'file h');
  });

  afterAll(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('finds .tova files recursively', () => {
    const files = findFiles(tmpDir, '.tova');
    const names = files.map(f => f.replace(tmpDir + '/', ''));
    expect(names).toContain('a.tova');
    expect(names).toContain('b.tova');
    expect(names).toContain('sub/d.tova');
    expect(names).toContain('sub/deep/f.tova');
  });

  test('excludes hidden files (dot-prefixed)', () => {
    const files = findFiles(tmpDir, '.tova');
    const names = files.map(f => f.replace(tmpDir + '/', ''));
    expect(names).not.toContain('.secret.tova');
  });

  test('excludes hidden directories', () => {
    const files = findFiles(tmpDir, '.tova');
    const hasHidden = files.some(f => f.includes('.hidden'));
    expect(hasHidden).toBe(false);
  });

  test('excludes node_modules directory', () => {
    const files = findFiles(tmpDir, '.tova');
    const hasNodeModules = files.some(f => f.includes('node_modules'));
    expect(hasNodeModules).toBe(false);
  });

  test('filters by extension correctly', () => {
    const jsFiles = findFiles(tmpDir, '.js');
    const names = jsFiles.map(f => f.replace(tmpDir + '/', ''));
    expect(names).toContain('c.js');
    expect(names).toContain('sub/e.js');
    // Should not include .tova files
    expect(names).not.toContain('a.tova');
    expect(names).not.toContain('b.tova');
  });

  test('returns full paths', () => {
    const files = findFiles(tmpDir, '.tova');
    for (const f of files) {
      expect(f.startsWith(tmpDir)).toBe(true);
    }
  });

  test('returns empty array for non-existent directory', () => {
    const files = findFiles(join(tmpDir, 'nonexistent'), '.tova');
    expect(files).toEqual([]);
  });

  test('returns empty array when no files match extension', () => {
    const files = findFiles(tmpDir, '.xyz');
    expect(files).toEqual([]);
  });

  test('finds correct total count of .tova files', () => {
    const files = findFiles(tmpDir, '.tova');
    // a.tova, b.tova, sub/d.tova, sub/deep/f.tova = 4
    // .secret.tova excluded (hidden), .hidden/g.tova excluded (hidden dir), node_modules/h.tova excluded
    expect(files.length).toBe(4);
  });

  test('works with empty directory', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'tova-empty-'));
    const files = findFiles(emptyDir, '.tova');
    expect(files).toEqual([]);
    try { rmSync(emptyDir, { recursive: true, force: true }); } catch {}
  });
});
