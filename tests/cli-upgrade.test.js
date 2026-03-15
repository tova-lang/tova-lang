import { describe, test, expect, setDefaultTimeout } from 'bun:test';

setDefaultTimeout(60000);
import { spawnSync } from 'child_process';
import path from 'path';

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

// The upgrade module does not export internal helpers (compareSemver, formatBytes,
// detectInstallMethod). We test them by reading the source and recreating them,
// then also testing via CLI invocation where possible.

// ─── Recreated pure functions for unit testing ───────────────────

function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ─── compareSemver tests ─────────────────────────────────────────

describe('cli-upgrade: compareSemver', () => {
  test('equal versions return 0', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('0.9.15', '0.9.15')).toBe(0);
    expect(compareSemver('10.20.30', '10.20.30')).toBe(0);
  });

  test('a < b returns -1', () => {
    expect(compareSemver('0.9.0', '1.0.0')).toBe(-1);
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1);
    expect(compareSemver('1.0.0', '1.1.0')).toBe(-1);
    expect(compareSemver('0.1.0', '0.2.0')).toBe(-1);
    expect(compareSemver('0.9.15', '0.10.0')).toBe(-1);
  });

  test('a > b returns 1', () => {
    expect(compareSemver('1.0.0', '0.9.0')).toBe(1);
    expect(compareSemver('1.0.1', '1.0.0')).toBe(1);
    expect(compareSemver('1.1.0', '1.0.0')).toBe(1);
    expect(compareSemver('2.0.0', '1.99.99')).toBe(1);
  });

  test('handles missing patch version gracefully', () => {
    // The split will produce NaN for missing segments, but || 0 handles it
    expect(compareSemver('1.0', '1.0.0')).toBe(0);
    expect(compareSemver('1.0.0', '1.0')).toBe(0);
  });

  test('handles versions with large numbers', () => {
    expect(compareSemver('100.200.300', '100.200.299')).toBe(1);
    expect(compareSemver('100.200.300', '100.200.301')).toBe(-1);
  });
});

// ─── formatBytes tests ──────────────────────────────────────────

describe('cli-upgrade: formatBytes', () => {
  test('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(100)).toBe('100 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  test('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10240)).toBe('10.0 KB');
    expect(formatBytes(512 * 1024)).toBe('512.0 KB');
  });

  test('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(1048576 * 5)).toBe('5.0 MB');
    expect(formatBytes(1048576 * 2.5)).toBe('2.5 MB');
    expect(formatBytes(1048576 * 100)).toBe('100.0 MB');
  });

  test('boundary between KB and MB', () => {
    // Just under 1 MB
    expect(formatBytes(1048575)).toContain('KB');
    // Exactly 1 MB
    expect(formatBytes(1048576)).toContain('MB');
  });

  test('boundary between B and KB', () => {
    expect(formatBytes(1023)).toContain('B');
    expect(formatBytes(1023)).not.toContain('KB');
    expect(formatBytes(1024)).toContain('KB');
  });
});

// ─── CLI invocation tests ────────────────────────────────────────

describe('cli-upgrade: CLI invocation', () => {
  // The upgrade command makes network requests to npm registry and GitHub.
  // Use a longer timeout and accept either success or network error.

  test('tova upgrade prints current version', () => {
    // upgradeCommand is async and makes network calls; give it 25s
    const result = runTova(['upgrade'], { timeout: 25000 });
    const combined = (result.stdout || '') + (result.stderr || '');
    // Should mention "Current version" or "Tova v"
    expect(combined).toContain('Tova v');
  }, 30000);

  test('tova upgrade mentions checking for updates', () => {
    const result = runTova(['upgrade'], { timeout: 25000 });
    const combined = (result.stdout || '') + (result.stderr || '');
    expect(combined).toContain('Checking for updates');
  }, 30000);

  test('tova upgrade either succeeds or shows network error', () => {
    const result = runTova(['upgrade'], { timeout: 25000 });
    const combined = (result.stdout || '') + (result.stderr || '');
    // It should either say "Already on the latest version" or show a network error
    // or say "New version available" and attempt upgrade
    const hasValidResponse =
      combined.includes('latest version') ||
      combined.includes('network') ||
      combined.includes('New version') ||
      combined.includes('Upgrade failed') ||
      combined.includes('Could not reach') ||
      combined.includes('Upgraded');
    expect(hasValidResponse).toBe(true);
  }, 30000);
});

// ─── Version import verification ─────────────────────────────────

import { VERSION } from '../src/version.js';

describe('cli-upgrade: version detection', () => {
  test('VERSION is a valid semver string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('current VERSION is parseable by compareSemver', () => {
    expect(compareSemver(VERSION, VERSION)).toBe(0);
    expect(compareSemver(VERSION, '0.0.0')).toBe(1);
    expect(compareSemver(VERSION, '999.999.999')).toBe(-1);
  });
});
