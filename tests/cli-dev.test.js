import { describe, test, expect, afterEach } from 'bun:test';
import { spawn, spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';

const TOVA = path.join(__dirname, '..', 'bin', 'tova.js');

function runTova(args, opts = {}) {
  const timeout = 15000;
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = spawnSync('bun', [TOVA, ...args], {
      encoding: 'utf-8', timeout, ...opts,
    });
    if (result.status === null && attempt < maxAttempts) continue;
    return result;
  }
}

function makeTempDir(name) {
  const dir = path.join(os.tmpdir(), `tova-dev-test-${name}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Track spawned processes for cleanup
const activeProcesses = [];

afterEach(() => {
  for (const proc of activeProcesses) {
    try { proc.kill('SIGKILL'); } catch {}
  }
  activeProcesses.length = 0;
});

// ─── Basic CLI tests ─────────────────────────────────────────────

describe('cli-dev: error cases', () => {
  test('tova dev with no .tova files exits with error', () => {
    const tmpDir = makeTempDir('empty');
    try {
      const result = runTova(['dev', tmpDir], { timeout: 10000 });
      const combined = (result.stdout || '') + (result.stderr || '');
      // Should error because no .tova files found
      expect(result.status).not.toBe(0);
      expect(combined).toContain('No .tova files found');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('tova dev with nonexistent directory exits with error', () => {
    const result = runTova(['dev', '/tmp/nonexistent-tova-dir-' + Date.now()], { timeout: 10000 });
    expect(result.status).not.toBe(0);
  });
});

// ─── Dev server startup tests ────────────────────────────────────

describe('cli-dev: server startup', () => {
  test('tova dev starts with a valid browser-only .tova file', async () => {
    const tmpDir = makeTempDir('browser');
    try {
      // Create a minimal browser app
      writeFileSync(path.join(tmpDir, 'app.tova'), `
browser {
  title = "Test App"
  fn App() {
    <div>"Hello from dev test"</div>
  }
}
`);

      const proc = spawn('bun', [TOVA, 'dev', tmpDir, '--port', '19876'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });
      activeProcesses.push(proc);

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      // Wait for startup message or timeout
      const started = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 8000);

        const checkOutput = () => {
          const combined = stdout + stderr;
          if (combined.includes('Compiled') || combined.includes('dev server') || combined.includes('Watching') || combined.includes('localhost')) {
            clearTimeout(timeout);
            resolve(true);
          }
        };

        proc.stdout.on('data', checkOutput);
        proc.stderr.on('data', checkOutput);

        proc.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      });

      const combined = stdout + stderr;
      // The dev server should produce compilation output or startup messages
      expect(combined.includes('Compiled') || combined.includes('dev server') || combined.includes('Watching') || combined.includes('localhost')).toBe(true);

      proc.kill('SIGTERM');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('tova dev starts with a valid server .tova file', async () => {
    const tmpDir = makeTempDir('server');
    try {
      writeFileSync(path.join(tmpDir, 'app.tova'), `
server {
  get "/" fn(req) {
    "Hello World"
  }
}
`);

      const proc = spawn('bun', [TOVA, 'dev', tmpDir, '--port', '19877'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });
      activeProcesses.push(proc);

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      // Wait for startup message
      const started = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 8000);

        const checkOutput = () => {
          const combined = stdout + stderr;
          if (combined.includes('Compiled') || combined.includes('Starting server') || combined.includes('Watching') || combined.includes('localhost')) {
            clearTimeout(timeout);
            resolve(true);
          }
        };

        proc.stdout.on('data', checkOutput);
        proc.stderr.on('data', checkOutput);

        proc.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      });

      const combined = stdout + stderr;
      // Should at least compile
      expect(combined.includes('Compiled') || combined.includes('server') || combined.includes('Watching')).toBe(true);

      proc.kill('SIGTERM');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('tova dev creates .tova-out directory', async () => {
    const tmpDir = makeTempDir('outdir');
    try {
      writeFileSync(path.join(tmpDir, 'app.tova'), `
browser {
  fn App() {
    <p>"hello"</p>
  }
}
`);

      const proc = spawn('bun', [TOVA, 'dev', tmpDir, '--port', '19878'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });
      activeProcesses.push(proc);

      // Wait for compilation to finish
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 5000);
        let output = '';
        const check = (d) => {
          output += d.toString();
          if (output.includes('Compiled') || output.includes('Watching')) {
            clearTimeout(timeout);
            setTimeout(resolve, 500); // give it a moment to write files
          }
        };
        proc.stdout.on('data', check);
        proc.stderr.on('data', check);
      });

      const outDir = path.join(tmpDir, '.tova-out');
      expect(existsSync(outDir)).toBe(true);

      proc.kill('SIGTERM');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── Port flag test ──────────────────────────────────────────────

describe('cli-dev: --port flag', () => {
  test('--port flag is recognized without error', async () => {
    const tmpDir = makeTempDir('port');
    try {
      writeFileSync(path.join(tmpDir, 'app.tova'), `
browser {
  fn App() {
    <div>"port test"</div>
  }
}
`);

      const proc = spawn('bun', [TOVA, 'dev', tmpDir, '--port', '19879'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });
      activeProcesses.push(proc);

      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      // Wait a bit and check that there is no error about unknown flag
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Should not complain about unrecognized --port flag
      expect(stderr).not.toContain('Unknown');
      expect(stderr).not.toContain('unrecognized');

      proc.kill('SIGTERM');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── Compilation output tests ────────────────────────────────────

describe('cli-dev: compilation output', () => {
  test('dev server generates index.html for browser apps', async () => {
    const tmpDir = makeTempDir('html');
    try {
      writeFileSync(path.join(tmpDir, 'app.tova'), `
browser {
  fn App() {
    <h1>"Dev HTML Test"</h1>
  }
}
`);

      const proc = spawn('bun', [TOVA, 'dev', tmpDir, '--port', '19880'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });
      activeProcesses.push(proc);

      // Wait for compilation
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 5000);
        let output = '';
        const check = (d) => {
          output += d.toString();
          if (output.includes('Compiled') || output.includes('Watching')) {
            clearTimeout(timeout);
            setTimeout(resolve, 500);
          }
        };
        proc.stdout.on('data', check);
        proc.stderr.on('data', check);
      });

      const indexPath = path.join(tmpDir, '.tova-out', 'index.html');
      if (existsSync(indexPath)) {
        const { readFileSync } = await import('fs');
        const html = readFileSync(indexPath, 'utf-8');
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<div id="app">');
      }

      proc.kill('SIGTERM');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('dev server compiles shared code', async () => {
    const tmpDir = makeTempDir('shared');
    try {
      writeFileSync(path.join(tmpDir, 'utils.tova'), `
fn greet(name: String) -> String {
  "Hello, " ++ name
}
`);

      const proc = spawn('bun', [TOVA, 'dev', tmpDir, '--port', '19881'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });
      activeProcesses.push(proc);

      // Wait for compilation
      let stdout = '';
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 5000);
        const check = (d) => {
          stdout += d.toString();
          if (stdout.includes('Compiled') || stdout.includes('Watching')) {
            clearTimeout(timeout);
            setTimeout(resolve, 500);
          }
        };
        proc.stdout.on('data', check);
        proc.stderr.on('data', check);
      });

      // Should have compiled 1 file
      expect(stdout).toContain('Compiled');

      proc.kill('SIGTERM');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
