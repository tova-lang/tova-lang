# Tova Package Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement decentralized, git-based package management for Tova with Go-style module paths, global cache, minimum version selection, and full npm interop.

**Architecture:** Tova modules are identified by domain-qualified paths (e.g., `github.com/alice/tova-http`). Versions map to git tags. A global cache at `~/.tova/pkg/` stores fetched modules. The resolver walks the dependency tree using minimum version selection. `compileWithImports()` is extended to resolve and compile Tova module imports from the cache.

**Tech Stack:** Bun runtime, git CLI for fetching, bun:test for testing, GitHub REST API for search.

**Design doc:** `docs/plans/2026-02-27-package-management-design.md`

---

### Task 1: Module Path Utilities

**Files:**
- Create: `src/config/module-path.js`
- Test: `tests/module-path.test.js`

**Step 1: Write the failing tests**

```javascript
// tests/module-path.test.js
import { describe, test, expect } from 'bun:test';
import { isTovModule, parseModulePath, moduleToGitUrl } from '../src/config/module-path.js';

describe('isTovModule', () => {
  test('detects github.com module path', () => {
    expect(isTovModule('github.com/alice/tova-http')).toBe(true);
  });
  test('detects gitlab.com module path', () => {
    expect(isTovModule('gitlab.com/bob/router')).toBe(true);
  });
  test('detects custom domain', () => {
    expect(isTovModule('gitea.mycompany.com/internal/auth')).toBe(true);
  });
  test('rejects relative path', () => {
    expect(isTovModule('./utils')).toBe(false);
  });
  test('rejects parent path', () => {
    expect(isTovModule('../lib/helpers')).toBe(false);
  });
  test('rejects npm package', () => {
    expect(isTovModule('zod')).toBe(false);
  });
  test('rejects scoped npm package', () => {
    expect(isTovModule('@scope/pkg')).toBe(false);
  });
  test('rejects node built-in', () => {
    expect(isTovModule('node:fs')).toBe(false);
  });
  test('rejects empty string', () => {
    expect(isTovModule('')).toBe(false);
  });
});

describe('parseModulePath', () => {
  test('parses simple module path', () => {
    const result = parseModulePath('github.com/alice/tova-http');
    expect(result).toEqual({
      host: 'github.com',
      owner: 'alice',
      repo: 'tova-http',
      subpath: null,
      full: 'github.com/alice/tova-http',
    });
  });
  test('parses module path with subpath', () => {
    const result = parseModulePath('github.com/alice/tova-db/postgres');
    expect(result).toEqual({
      host: 'github.com',
      owner: 'alice',
      repo: 'tova-db',
      subpath: 'postgres',
      full: 'github.com/alice/tova-db',
    });
  });
  test('parses deep subpath', () => {
    const result = parseModulePath('github.com/alice/tova-db/adapters/postgres');
    expect(result).toEqual({
      host: 'github.com',
      owner: 'alice',
      repo: 'tova-db',
      subpath: 'adapters/postgres',
      full: 'github.com/alice/tova-db',
    });
  });
  test('throws on invalid path', () => {
    expect(() => parseModulePath('zod')).toThrow();
  });
});

describe('moduleToGitUrl', () => {
  test('converts github path to HTTPS URL', () => {
    expect(moduleToGitUrl('github.com/alice/tova-http')).toBe('https://github.com/alice/tova-http.git');
  });
  test('converts gitlab path to HTTPS URL', () => {
    expect(moduleToGitUrl('gitlab.com/bob/router')).toBe('https://gitlab.com/bob/router.git');
  });
  test('converts custom domain path to HTTPS URL', () => {
    expect(moduleToGitUrl('gitea.mycompany.com/internal/auth')).toBe('https://gitea.mycompany.com/internal/auth.git');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/module-path.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```javascript
// src/config/module-path.js

/**
 * Determines if an import source is a Tova module path.
 * A Tova module has a dot in its first path segment (e.g., github.com).
 */
export function isTovModule(source) {
  if (!source || source.startsWith('.') || source.startsWith('/') || source.startsWith('@') || source.includes(':')) {
    return false;
  }
  const firstSegment = source.split('/')[0];
  return firstSegment.includes('.');
}

/**
 * Parses a module path into its components.
 * "github.com/alice/tova-db/postgres" → { host, owner, repo, subpath, full }
 */
export function parseModulePath(source) {
  if (!isTovModule(source)) {
    throw new Error(`Invalid Tova module path: "${source}"`);
  }
  const parts = source.split('/');
  if (parts.length < 3) {
    throw new Error(`Invalid Tova module path: "${source}" — expected at least host/owner/repo`);
  }
  const host = parts[0];
  const owner = parts[1];
  const repo = parts[2];
  const subpath = parts.length > 3 ? parts.slice(3).join('/') : null;
  return {
    host,
    owner,
    repo,
    subpath,
    full: `${host}/${owner}/${repo}`,
  };
}

/**
 * Converts a module path to a git HTTPS URL.
 */
export function moduleToGitUrl(modulePath) {
  const parsed = typeof modulePath === 'string' ? parseModulePath(modulePath) : modulePath;
  return `https://${parsed.full}.git`;
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/module-path.test.js`
Expected: PASS — all tests green

**Step 5: Commit**

```bash
git add src/config/module-path.js tests/module-path.test.js
git commit -m "feat: module path utilities — isTovModule, parseModulePath, moduleToGitUrl"
```

---

### Task 2: Semver Utilities

**Files:**
- Create: `src/config/semver.js`
- Test: `tests/semver.test.js`

**Step 1: Write the failing tests**

```javascript
// tests/semver.test.js
import { describe, test, expect } from 'bun:test';
import { parseSemver, compareSemver, parseConstraint, satisfies, selectMinVersion } from '../src/config/semver.js';

describe('parseSemver', () => {
  test('parses major.minor.patch', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });
  test('parses with v prefix', () => {
    expect(parseSemver('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });
  test('parses major.minor (patch defaults to 0)', () => {
    expect(parseSemver('1.2')).toEqual({ major: 1, minor: 2, patch: 0 });
  });
  test('throws on invalid', () => {
    expect(() => parseSemver('abc')).toThrow();
  });
});

describe('compareSemver', () => {
  test('equal versions return 0', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });
  test('greater major returns 1', () => {
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
  });
  test('lesser minor returns -1', () => {
    expect(compareSemver('1.1.0', '1.2.0')).toBe(-1);
  });
  test('greater patch returns 1', () => {
    expect(compareSemver('1.2.4', '1.2.3')).toBe(1);
  });
});

describe('parseConstraint', () => {
  test('parses caret ^1.2.0', () => {
    const c = parseConstraint('^1.2.0');
    expect(c.type).toBe('caret');
    expect(c.version).toEqual({ major: 1, minor: 2, patch: 0 });
  });
  test('parses tilde ~1.2.0', () => {
    const c = parseConstraint('~1.2.0');
    expect(c.type).toBe('tilde');
  });
  test('parses exact 1.2.0', () => {
    const c = parseConstraint('1.2.0');
    expect(c.type).toBe('exact');
  });
  test('parses >=1.0.0', () => {
    const c = parseConstraint('>=1.0.0');
    expect(c.type).toBe('gte');
  });
});

describe('satisfies', () => {
  test('^1.2.0 satisfied by 1.2.0', () => {
    expect(satisfies('1.2.0', '^1.2.0')).toBe(true);
  });
  test('^1.2.0 satisfied by 1.9.9', () => {
    expect(satisfies('1.9.9', '^1.2.0')).toBe(true);
  });
  test('^1.2.0 NOT satisfied by 2.0.0', () => {
    expect(satisfies('2.0.0', '^1.2.0')).toBe(false);
  });
  test('^1.2.0 NOT satisfied by 1.1.0', () => {
    expect(satisfies('1.1.0', '^1.2.0')).toBe(false);
  });
  test('~1.2.0 satisfied by 1.2.5', () => {
    expect(satisfies('1.2.5', '~1.2.0')).toBe(true);
  });
  test('~1.2.0 NOT satisfied by 1.3.0', () => {
    expect(satisfies('1.3.0', '~1.2.0')).toBe(false);
  });
  test('exact 1.2.0 satisfied by 1.2.0', () => {
    expect(satisfies('1.2.0', '1.2.0')).toBe(true);
  });
  test('exact 1.2.0 NOT satisfied by 1.2.1', () => {
    expect(satisfies('1.2.1', '1.2.0')).toBe(false);
  });
});

describe('selectMinVersion', () => {
  test('selects minimum from available versions satisfying constraint', () => {
    const versions = ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '2.0.0'];
    expect(selectMinVersion(versions, '^1.2.0')).toBe('1.2.0');
  });
  test('selects minimum for multiple constraints', () => {
    const versions = ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '2.0.0'];
    expect(selectMinVersion(versions, ['^1.1.0', '^1.2.0'])).toBe('1.2.0');
  });
  test('returns null when no version satisfies', () => {
    const versions = ['1.0.0', '1.1.0'];
    expect(selectMinVersion(versions, '^2.0.0')).toBe(null);
  });
  test('returns null when constraints conflict', () => {
    const versions = ['1.0.0', '1.5.0', '2.0.0', '2.5.0'];
    expect(selectMinVersion(versions, ['^1.0.0', '^2.0.0'])).toBe(null);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/semver.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```javascript
// src/config/semver.js

export function parseSemver(str) {
  const s = str.startsWith('v') ? str.slice(1) : str;
  const parts = s.split('.');
  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1] || '0', 10);
  const patch = parseInt(parts[2] || '0', 10);
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    throw new Error(`Invalid semver: "${str}"`);
  }
  return { major, minor, patch };
}

export function compareSemver(a, b) {
  const va = typeof a === 'string' ? parseSemver(a) : a;
  const vb = typeof b === 'string' ? parseSemver(b) : b;
  if (va.major !== vb.major) return va.major > vb.major ? 1 : -1;
  if (va.minor !== vb.minor) return va.minor > vb.minor ? 1 : -1;
  if (va.patch !== vb.patch) return va.patch > vb.patch ? 1 : -1;
  return 0;
}

export function parseConstraint(constraint) {
  if (constraint.startsWith('^')) {
    return { type: 'caret', version: parseSemver(constraint.slice(1)) };
  }
  if (constraint.startsWith('~')) {
    return { type: 'tilde', version: parseSemver(constraint.slice(1)) };
  }
  if (constraint.startsWith('>=')) {
    return { type: 'gte', version: parseSemver(constraint.slice(2)) };
  }
  if (constraint.startsWith('>')) {
    return { type: 'gt', version: parseSemver(constraint.slice(1)) };
  }
  return { type: 'exact', version: parseSemver(constraint) };
}

export function satisfies(version, constraint) {
  const v = typeof version === 'string' ? parseSemver(version) : version;
  const c = typeof constraint === 'string' ? parseConstraint(constraint) : constraint;

  switch (c.type) {
    case 'exact':
      return compareSemver(v, c.version) === 0;
    case 'caret':
      if (compareSemver(v, c.version) < 0) return false;
      return v.major === c.version.major;
    case 'tilde':
      if (compareSemver(v, c.version) < 0) return false;
      return v.major === c.version.major && v.minor === c.version.minor;
    case 'gte':
      return compareSemver(v, c.version) >= 0;
    case 'gt':
      return compareSemver(v, c.version) > 0;
    default:
      return false;
  }
}

export function selectMinVersion(versions, constraints) {
  const constraintList = Array.isArray(constraints) ? constraints : [constraints];
  const sorted = [...versions].sort((a, b) => compareSemver(a, b));
  for (const ver of sorted) {
    if (constraintList.every(c => satisfies(ver, c))) {
      return ver;
    }
  }
  return null;
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/semver.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config/semver.js tests/semver.test.js
git commit -m "feat: semver utilities — parse, compare, satisfy, minimum version selection"
```

---

### Task 3: Global Cache Manager

**Files:**
- Create: `src/config/module-cache.js`
- Test: `tests/module-cache.test.js`

**Step 1: Write the failing tests**

```javascript
// tests/module-cache.test.js
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import {
  getCacheDir,
  getModuleCachePath,
  isVersionCached,
  listCachedVersions,
  getCacheSize,
  cleanUnusedVersions,
} from '../src/config/module-cache.js';

const TEST_CACHE = join(import.meta.dir, '.tmp-cache-test');

describe('getCacheDir', () => {
  test('returns ~/.tova/pkg by default', () => {
    const dir = getCacheDir();
    expect(dir).toContain('.tova');
    expect(dir).toEndWith('pkg');
  });
  test('respects TOVA_CACHE_DIR env', () => {
    const dir = getCacheDir(TEST_CACHE);
    expect(dir).toBe(TEST_CACHE);
  });
});

describe('getModuleCachePath', () => {
  test('returns correct path for module + version', () => {
    const p = getModuleCachePath('github.com/alice/tova-http', '1.3.0', TEST_CACHE);
    expect(p).toBe(join(TEST_CACHE, 'github.com', 'alice', 'tova-http', 'v1.3.0'));
  });
});

describe('isVersionCached', () => {
  beforeEach(() => {
    if (existsSync(TEST_CACHE)) rmSync(TEST_CACHE, { recursive: true, force: true });
  });
  afterEach(() => {
    if (existsSync(TEST_CACHE)) rmSync(TEST_CACHE, { recursive: true, force: true });
  });

  test('returns false when not cached', () => {
    expect(isVersionCached('github.com/alice/tova-http', '1.0.0', TEST_CACHE)).toBe(false);
  });
  test('returns true when cached', () => {
    const p = join(TEST_CACHE, 'github.com', 'alice', 'tova-http', 'v1.0.0');
    mkdirSync(p, { recursive: true });
    writeFileSync(join(p, 'tova.toml'), '[package]\nname = "test"\n');
    expect(isVersionCached('github.com/alice/tova-http', '1.0.0', TEST_CACHE)).toBe(true);
  });
});

describe('listCachedVersions', () => {
  beforeEach(() => {
    if (existsSync(TEST_CACHE)) rmSync(TEST_CACHE, { recursive: true, force: true });
  });
  afterEach(() => {
    if (existsSync(TEST_CACHE)) rmSync(TEST_CACHE, { recursive: true, force: true });
  });

  test('returns empty array when nothing cached', () => {
    expect(listCachedVersions('github.com/alice/tova-http', TEST_CACHE)).toEqual([]);
  });
  test('returns sorted versions', () => {
    const base = join(TEST_CACHE, 'github.com', 'alice', 'tova-http');
    mkdirSync(join(base, 'v1.2.0'), { recursive: true });
    mkdirSync(join(base, 'v1.0.0'), { recursive: true });
    mkdirSync(join(base, 'v1.1.0'), { recursive: true });
    const versions = listCachedVersions('github.com/alice/tova-http', TEST_CACHE);
    expect(versions).toEqual(['1.0.0', '1.1.0', '1.2.0']);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/module-cache.test.js`
Expected: FAIL

**Step 3: Write the implementation**

```javascript
// src/config/module-cache.js
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'fs';
import { homedir } from 'os';
import { compareSemver } from './semver.js';
import { parseModulePath } from './module-path.js';

const DEFAULT_CACHE = join(homedir(), '.tova', 'pkg');

export function getCacheDir(override) {
  return override || process.env.TOVA_CACHE_DIR || DEFAULT_CACHE;
}

export function getModuleCachePath(modulePath, version, cacheDir) {
  const dir = getCacheDir(cacheDir);
  const parsed = typeof modulePath === 'string' ? parseModulePath(modulePath) : modulePath;
  return join(dir, parsed.host, parsed.owner, parsed.repo, `v${version}`);
}

export function isVersionCached(modulePath, version, cacheDir) {
  const p = getModuleCachePath(modulePath, version, cacheDir);
  return existsSync(p) && existsSync(join(p, 'tova.toml'));
}

export function listCachedVersions(modulePath, cacheDir) {
  const dir = getCacheDir(cacheDir);
  const parsed = typeof modulePath === 'string' ? parseModulePath(modulePath) : modulePath;
  const moduleDir = join(dir, parsed.host, parsed.owner, parsed.repo);
  if (!existsSync(moduleDir)) return [];
  const entries = readdirSync(moduleDir).filter(e => e.startsWith('v'));
  const versions = entries.map(e => e.slice(1));
  return versions.sort((a, b) => compareSemver(a, b));
}

export function getCompileCachePath(modulePath, version, cacheDir) {
  const dir = getCacheDir(cacheDir);
  return join(dir, '.cache', modulePath, `v${version}`);
}

export function getCacheSize(cacheDir) {
  const dir = getCacheDir(cacheDir);
  if (!existsSync(dir)) return { modules: 0, bytes: 0 };
  let bytes = 0;
  let modules = 0;
  function walk(d) {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else bytes += stat.size;
    }
  }
  // Count module directories at host/owner/repo level
  try { walk(dir); } catch { /* empty cache */ }
  return { bytes };
}

export function cleanUnusedVersions(modulePath, keepVersions, cacheDir) {
  const dir = getCacheDir(cacheDir);
  const parsed = typeof modulePath === 'string' ? parseModulePath(modulePath) : modulePath;
  const moduleDir = join(dir, parsed.host, parsed.owner, parsed.repo);
  if (!existsSync(moduleDir)) return [];
  const entries = readdirSync(moduleDir).filter(e => e.startsWith('v'));
  const keepSet = new Set(keepVersions.map(v => `v${v}`));
  const removed = [];
  for (const entry of entries) {
    if (!keepSet.has(entry)) {
      rmSync(join(moduleDir, entry), { recursive: true, force: true });
      removed.push(entry.slice(1));
    }
  }
  return removed;
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/module-cache.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config/module-cache.js tests/module-cache.test.js
git commit -m "feat: global cache manager — cache paths, version lookup, cleanup"
```

---

### Task 4: Git Fetch & Tag Resolution

**Files:**
- Create: `src/config/git-resolver.js`
- Test: `tests/git-resolver.test.js`

**Step 1: Write the failing tests**

```javascript
// tests/git-resolver.test.js
import { describe, test, expect } from 'bun:test';
import { parseTagList, sortTags, pickLatestTag } from '../src/config/git-resolver.js';

// Unit tests for tag parsing (no network calls)
describe('parseTagList', () => {
  test('parses git ls-remote output', () => {
    const output = `a1b2c3d4\trefs/tags/v1.0.0\na1b2c3d4\trefs/tags/v1.0.0^{}\nb2c3d4e5\trefs/tags/v1.1.0\nb2c3d4e5\trefs/tags/v1.1.0^{}`;
    const tags = parseTagList(output);
    expect(tags).toEqual([
      { version: '1.0.0', sha: 'a1b2c3d4' },
      { version: '1.1.0', sha: 'b2c3d4e5' },
    ]);
  });
  test('skips non-semver tags', () => {
    const output = `abc123\trefs/tags/latest\ndef456\trefs/tags/v1.0.0\ndef456\trefs/tags/v1.0.0^{}`;
    const tags = parseTagList(output);
    expect(tags).toEqual([{ version: '1.0.0', sha: 'def456' }]);
  });
  test('handles empty output', () => {
    expect(parseTagList('')).toEqual([]);
  });
});

describe('sortTags', () => {
  test('sorts by semver ascending', () => {
    const tags = [
      { version: '1.2.0', sha: 'a' },
      { version: '1.0.0', sha: 'b' },
      { version: '1.1.0', sha: 'c' },
    ];
    const sorted = sortTags(tags);
    expect(sorted.map(t => t.version)).toEqual(['1.0.0', '1.1.0', '1.2.0']);
  });
});

describe('pickLatestTag', () => {
  test('returns highest version', () => {
    const tags = [
      { version: '1.0.0', sha: 'a' },
      { version: '2.0.0', sha: 'b' },
      { version: '1.5.0', sha: 'c' },
    ];
    expect(pickLatestTag(tags)).toEqual({ version: '2.0.0', sha: 'b' });
  });
  test('returns null for empty list', () => {
    expect(pickLatestTag([])).toBe(null);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/git-resolver.test.js`
Expected: FAIL

**Step 3: Write the implementation**

```javascript
// src/config/git-resolver.js
import { spawn } from 'child_process';
import { join } from 'path';
import { mkdirSync, renameSync, rmSync, existsSync } from 'fs';
import { parseSemver, compareSemver } from './semver.js';
import { moduleToGitUrl, parseModulePath } from './module-path.js';
import { getModuleCachePath, getCacheDir } from './module-cache.js';

/**
 * Parses `git ls-remote --tags` output into tag objects.
 * Prefers the ^{} (dereferenced) SHA when available.
 */
export function parseTagList(output) {
  if (!output.trim()) return [];
  const lines = output.trim().split('\n');
  const tagMap = new Map(); // version → sha

  for (const line of lines) {
    const [sha, ref] = line.split('\t');
    if (!ref || !ref.startsWith('refs/tags/')) continue;
    const tagName = ref.replace('refs/tags/', '');
    const isDeref = tagName.endsWith('^{}');
    const cleanName = isDeref ? tagName.slice(0, -3) : tagName;
    const versionStr = cleanName.startsWith('v') ? cleanName.slice(1) : cleanName;

    try {
      parseSemver(versionStr);
    } catch {
      continue; // skip non-semver tags
    }

    // Prefer dereferenced SHA (actual commit)
    if (isDeref || !tagMap.has(versionStr)) {
      tagMap.set(versionStr, sha);
    }
  }

  return Array.from(tagMap.entries()).map(([version, sha]) => ({ version, sha }));
}

export function sortTags(tags) {
  return [...tags].sort((a, b) => compareSemver(a.version, b.version));
}

export function pickLatestTag(tags) {
  if (tags.length === 0) return null;
  const sorted = sortTags(tags);
  return sorted[sorted.length - 1];
}

/**
 * Lists remote tags for a module. Returns array of { version, sha }.
 */
export function listRemoteTags(modulePath) {
  const gitUrl = moduleToGitUrl(modulePath);
  return new Promise((resolve, reject) => {
    const proc = spawn('git', ['ls-remote', '--tags', gitUrl], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Failed to list tags for ${modulePath}: ${stderr.trim()}`));
        return;
      }
      resolve(parseTagList(stdout));
    });
  });
}

/**
 * Fetches a specific version of a module into the global cache.
 * Uses shallow clone of the tag.
 */
export function fetchModule(modulePath, version, cacheDir) {
  const gitUrl = moduleToGitUrl(modulePath);
  const destPath = getModuleCachePath(modulePath, version, cacheDir);
  const dir = getCacheDir(cacheDir);
  const tmpPath = join(dir, '.tmp-' + Date.now());

  return new Promise((resolve, reject) => {
    const proc = spawn('git', [
      'clone', '--depth', '1', '--branch', `v${version}`, gitUrl, tmpPath,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => {
      if (code !== 0) {
        if (existsSync(tmpPath)) rmSync(tmpPath, { recursive: true, force: true });
        reject(new Error(`Failed to fetch ${modulePath}@v${version}: ${stderr.trim()}`));
        return;
      }
      // Remove .git directory to save space
      const dotGit = join(tmpPath, '.git');
      if (existsSync(dotGit)) rmSync(dotGit, { recursive: true, force: true });
      // Move to final destination
      mkdirSync(join(destPath, '..'), { recursive: true });
      renameSync(tmpPath, destPath);
      resolve(destPath);
    });
  });
}

/**
 * Gets the commit SHA for a cached module version.
 * Reads from .tova-sha file written during fetch.
 */
export function getCommitSha(modulePath, version, cacheDir) {
  const gitUrl = moduleToGitUrl(modulePath);
  return new Promise((resolve, reject) => {
    const proc = spawn('git', ['ls-remote', gitUrl, `refs/tags/v${version}^{}`, `refs/tags/v${version}`], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    proc.stdout.on('data', d => stdout += d);
    proc.on('close', code => {
      if (code !== 0) { reject(new Error('Failed to get SHA')); return; }
      const tags = parseTagList(stdout);
      const tag = tags.find(t => t.version === version);
      resolve(tag ? tag.sha : null);
    });
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/git-resolver.test.js`
Expected: PASS (unit tests only — no network)

**Step 5: Commit**

```bash
git add src/config/git-resolver.js tests/git-resolver.test.js
git commit -m "feat: git resolver — tag parsing, remote listing, module fetching"
```

---

### Task 5: Dependency Tree Resolver

**Files:**
- Create: `src/config/resolver.js`
- Test: `tests/resolver.test.js`

**Step 1: Write the failing tests**

```javascript
// tests/resolver.test.js
import { describe, test, expect } from 'bun:test';
import { buildDependencyTree, mergeDependencies, mergeNpmDeps, detectConflicts } from '../src/config/resolver.js';

describe('mergeDependencies', () => {
  test('merges non-overlapping deps', () => {
    const a = { 'github.com/alice/http': '^1.0.0' };
    const b = { 'github.com/bob/jwt': '^2.0.0' };
    const merged = mergeDependencies(a, b);
    expect(merged).toEqual({
      'github.com/alice/http': ['^1.0.0'],
      'github.com/bob/jwt': ['^2.0.0'],
    });
  });
  test('collects multiple constraints for same module', () => {
    const a = { 'github.com/alice/http': '^1.0.0' };
    const b = { 'github.com/alice/http': '^1.2.0' };
    const merged = mergeDependencies(a, b);
    expect(merged).toEqual({
      'github.com/alice/http': ['^1.0.0', '^1.2.0'],
    });
  });
});

describe('mergeNpmDeps', () => {
  test('merges npm deps from multiple modules', () => {
    const modules = [
      { npm: { prod: { zod: '^3.0.0' } } },
      { npm: { prod: { express: '^4.0.0' } } },
    ];
    const merged = mergeNpmDeps(modules);
    expect(merged).toEqual({ zod: '^3.0.0', express: '^4.0.0' });
  });
  test('keeps highest constraint for same npm package', () => {
    const modules = [
      { npm: { prod: { zod: '^3.0.0' } } },
      { npm: { prod: { zod: '^3.2.0' } } },
    ];
    const merged = mergeNpmDeps(modules);
    expect(merged).toEqual({ zod: '^3.2.0' });
  });
});

describe('detectConflicts', () => {
  test('no conflict for compatible constraints', () => {
    const constraints = { 'github.com/alice/http': ['^1.0.0', '^1.2.0'] };
    const available = { 'github.com/alice/http': ['1.0.0', '1.2.0', '1.5.0'] };
    const conflicts = detectConflicts(constraints, available);
    expect(conflicts).toEqual([]);
  });
  test('detects conflict for incompatible major versions', () => {
    const constraints = { 'github.com/alice/http': ['^1.0.0', '^2.0.0'] };
    const available = { 'github.com/alice/http': ['1.0.0', '1.5.0', '2.0.0'] };
    const conflicts = detectConflicts(constraints, available);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].module).toBe('github.com/alice/http');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/resolver.test.js`
Expected: FAIL

**Step 3: Write the implementation**

```javascript
// src/config/resolver.js
import { selectMinVersion, satisfies, parseSemver, compareSemver } from './semver.js';

/**
 * Merges dependency maps from multiple sources, collecting all constraints per module.
 */
export function mergeDependencies(...depMaps) {
  const merged = {};
  for (const deps of depMaps) {
    for (const [mod, constraint] of Object.entries(deps)) {
      if (!merged[mod]) merged[mod] = [];
      if (Array.isArray(constraint)) {
        merged[mod].push(...constraint);
      } else {
        merged[mod].push(constraint);
      }
    }
  }
  return merged;
}

/**
 * Merges npm dependencies from multiple module configs.
 * For conflicts, picks the highest constraint version.
 */
export function mergeNpmDeps(moduleConfigs) {
  const merged = {};
  for (const config of moduleConfigs) {
    const prod = config.npm?.prod || {};
    for (const [name, version] of Object.entries(prod)) {
      if (!merged[name]) {
        merged[name] = version;
      } else {
        // Keep whichever specifies a higher minimum
        try {
          const existing = parseSemver(merged[name].replace(/^[\^~>=<]*/, ''));
          const incoming = parseSemver(version.replace(/^[\^~>=<]*/, ''));
          if (compareSemver(incoming, existing) > 0) {
            merged[name] = version;
          }
        } catch {
          merged[name] = version;
        }
      }
    }
  }
  return merged;
}

/**
 * Detects version conflicts — modules where no single version satisfies all constraints.
 */
export function detectConflicts(constraintMap, availableVersions) {
  const conflicts = [];
  for (const [mod, constraints] of Object.entries(constraintMap)) {
    const versions = availableVersions[mod] || [];
    const resolved = selectMinVersion(versions, constraints);
    if (resolved === null && constraints.length > 1) {
      conflicts.push({
        module: mod,
        constraints,
        available: versions,
      });
    }
  }
  return conflicts;
}

/**
 * Resolves all dependencies to exact versions.
 * Returns a map of modulePath → { version, sha, source, npmDeps }.
 *
 * This is the high-level orchestrator called by `tova install`.
 * It takes callbacks for I/O operations (fetching tags, reading configs)
 * so the core logic is testable without network access.
 */
export async function resolveDependencies(rootDeps, options = {}) {
  const {
    getAvailableVersions, // async (modulePath) => ['1.0.0', '1.1.0', ...]
    getModuleConfig,      // async (modulePath, version) => { dependencies, npm }
    getVersionSha,        // async (modulePath, version) => 'sha...'
  } = options;

  const resolved = {};         // modulePath → { version, sha }
  const allConstraints = {};   // modulePath → [constraints...]
  const allNpmDeps = [];       // [{ npm: { prod: {...} } }, ...]
  const queue = [rootDeps];    // queue of dependency maps to process

  while (queue.length > 0) {
    const deps = queue.shift();
    for (const [mod, constraint] of Object.entries(deps)) {
      if (!allConstraints[mod]) allConstraints[mod] = [];
      allConstraints[mod].push(constraint);

      // Get available versions
      const versions = await getAvailableVersions(mod);
      const version = selectMinVersion(versions, allConstraints[mod]);

      if (version === null) {
        const conflicts = detectConflicts(
          { [mod]: allConstraints[mod] },
          { [mod]: versions }
        );
        if (conflicts.length > 0) {
          throw new Error(
            `Version conflict for ${mod}:\n` +
            conflicts[0].constraints.map(c => `  requires ${c}`).join('\n') +
            `\n  Available: ${versions.join(', ')}`
          );
        }
        throw new Error(
          `No version of ${mod} satisfies constraint: ${allConstraints[mod].join(', ')}\n` +
          `  Available: ${versions.join(', ') || 'none'}`
        );
      }

      // Skip if we already resolved this module to the same or higher version
      if (resolved[mod] && compareSemver(resolved[mod].version, version) >= 0) {
        continue;
      }

      const sha = await getVersionSha(mod, version);
      resolved[mod] = { version, sha, source: `https://${mod}.git` };

      // Read this module's config for transitive deps
      const config = await getModuleConfig(mod, version);
      if (config) {
        allNpmDeps.push(config);
        if (config.dependencies && Object.keys(config.dependencies).length > 0) {
          queue.push(config.dependencies);
        }
      }
    }
  }

  const npmDeps = mergeNpmDeps(allNpmDeps);

  return { resolved, npmDeps };
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/resolver.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config/resolver.js tests/resolver.test.js
git commit -m "feat: dependency resolver — merge constraints, detect conflicts, minimum version selection"
```

---

### Task 6: tova.toml [package] Support & Lock File

**Files:**
- Modify: `src/config/resolve.js` (add `[package]` normalization)
- Create: `src/config/lock-file.js`
- Test: `tests/lock-file.test.js`
- Modify: `tests/config.test.js` (add [package] tests)

**Step 1: Write the failing tests for [package] support**

Add to `tests/config.test.js`:

```javascript
describe('package config', () => {
  test('normalizes [package] section', () => {
    const tomlPath = join(TMP_DIR, 'tova.toml');
    writeFileSync(tomlPath, `
[package]
name = "github.com/alice/tova-http"
version = "1.3.0"
description = "HTTP server"
license = "MIT"
exports = ["serve", "router"]

[dependencies]
"github.com/bob/jwt" = "^1.0.0"
`);
    const config = resolveConfig(TMP_DIR);
    expect(config.package).toBeDefined();
    expect(config.package.name).toBe('github.com/alice/tova-http');
    expect(config.package.version).toBe('1.3.0');
    expect(config.package.exports).toEqual(['serve', 'router']);
    expect(config.isPackage).toBe(true);
  });
});
```

**Step 2: Write lock file tests**

```javascript
// tests/lock-file.test.js
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { writeLockFile, readLockFile } from '../src/config/lock-file.js';

const TMP_DIR = join(import.meta.dir, '.tmp-lock-test');

beforeEach(() => {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('writeLockFile', () => {
  test('writes TOML lock file', () => {
    const resolved = {
      'github.com/alice/tova-http': { version: '1.3.0', sha: 'a1b2c3d4', source: 'https://github.com/alice/tova-http.git' },
    };
    const npmDeps = { 'cookie-parser': '1.4.7' };
    writeLockFile(TMP_DIR, resolved, npmDeps);
    const content = readFileSync(join(TMP_DIR, 'tova.lock'), 'utf-8');
    expect(content).toContain('[lock]');
    expect(content).toContain('github.com/alice/tova-http');
    expect(content).toContain('1.3.0');
    expect(content).toContain('a1b2c3d4');
  });
});

describe('readLockFile', () => {
  test('reads lock file and returns resolved map', () => {
    const lockContent = `[lock]
generated = "2026-02-27T10:00:00Z"

["github.com/alice/tova-http"]
version = "1.3.0"
sha = "a1b2c3d4"
source = "https://github.com/alice/tova-http.git"

[npm]
cookie-parser = "1.4.7"
`;
    writeFileSync(join(TMP_DIR, 'tova.lock'), lockContent);
    const lock = readLockFile(TMP_DIR);
    expect(lock.modules['github.com/alice/tova-http'].version).toBe('1.3.0');
    expect(lock.modules['github.com/alice/tova-http'].sha).toBe('a1b2c3d4');
    expect(lock.npm['cookie-parser']).toBe('1.4.7');
  });
  test('returns null when no lock file exists', () => {
    expect(readLockFile(TMP_DIR)).toBe(null);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `bun test tests/lock-file.test.js && bun test tests/config.test.js`
Expected: FAIL

**Step 4: Implement lock-file.js**

```javascript
// src/config/lock-file.js
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { parseTOML } from './toml-parser.js';

export function writeLockFile(cwd, resolvedModules, npmDeps) {
  const lines = [];
  lines.push('[lock]');
  lines.push(`generated = "${new Date().toISOString()}"`);
  lines.push('');

  for (const [mod, info] of Object.entries(resolvedModules)) {
    lines.push(`["${mod}"]`);
    lines.push(`version = "${info.version}"`);
    lines.push(`sha = "${info.sha}"`);
    lines.push(`source = "${info.source}"`);
    lines.push('');
  }

  if (npmDeps && Object.keys(npmDeps).length > 0) {
    lines.push('[npm]');
    for (const [name, version] of Object.entries(npmDeps)) {
      lines.push(`${name} = "${version}"`);
    }
    lines.push('');
  }

  writeFileSync(join(cwd, 'tova.lock'), lines.join('\n'));
}

export function readLockFile(cwd) {
  const lockPath = join(cwd, 'tova.lock');
  if (!existsSync(lockPath)) return null;
  const content = readFileSync(lockPath, 'utf-8');
  const parsed = parseTOML(content);

  const modules = {};
  const npm = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'lock') continue;
    if (key === 'npm') {
      Object.assign(npm, value);
      continue;
    }
    // Module entries are quoted keys like "github.com/alice/http"
    if (typeof value === 'object' && value.version) {
      modules[key] = {
        version: value.version,
        sha: value.sha,
        source: value.source,
      };
    }
  }

  return { modules, npm, generated: parsed.lock?.generated };
}
```

**Step 5: Update resolve.js for [package] support**

Add to `normalizeConfig()` in `src/config/resolve.js`:

```javascript
// After existing project/build/dev normalization, add:
if (parsed.package) {
  config.package = {
    name: parsed.package.name || '',
    version: parsed.package.version || '0.1.0',
    description: parsed.package.description || '',
    license: parsed.package.license || '',
    keywords: parsed.package.keywords || [],
    homepage: parsed.package.homepage || '',
    exports: parsed.package.exports || null,
    entry: parsed.package.entry || null,
  };
  config.isPackage = true;
} else {
  config.isPackage = false;
}
```

**Step 6: Run tests to verify they pass**

Run: `bun test tests/lock-file.test.js && bun test tests/config.test.js`
Expected: PASS

**Step 7: Commit**

```bash
git add src/config/lock-file.js src/config/resolve.js tests/lock-file.test.js tests/config.test.js
git commit -m "feat: lock file TOML format + [package] section support in tova.toml"
```

---

### Task 7: CLI Commands — add/install/remove/update/cache

**Files:**
- Modify: `bin/tova.js` (update existing commands, add new ones)
- Test: `tests/cli-pkg-management.test.js`

**Step 1: Write the failing tests**

```javascript
// tests/cli-pkg-management.test.js
import { describe, test, expect } from 'bun:test';
import { isTovModule } from '../src/config/module-path.js';

// Test the detection logic used by `tova add`
describe('tova add detection', () => {
  test('detects Tova module from add argument', () => {
    expect(isTovModule('github.com/alice/tova-http')).toBe(true);
  });
  test('detects Tova module with version suffix', () => {
    // The @ version is stripped before checking
    const arg = 'github.com/alice/tova-http@1.3.0';
    const name = arg.includes('@') ? arg.slice(0, arg.lastIndexOf('@')) : arg;
    expect(isTovModule(name)).toBe(true);
  });
  test('npm: prefix still routes to npm', () => {
    expect(isTovModule('npm:zod')).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail (or pass if detection already works)**

Run: `bun test tests/cli-pkg-management.test.js`

**Step 3: Update `addDep()` in bin/tova.js**

In `bin/tova.js`, update the `addDep()` function. After the existing `isNpm` check, add a new branch for Tova modules:

```javascript
// Inside addDep(), after `const isNpm = pkg.startsWith('npm:');`
// Add before the existing else branch:

const { isTovModule: isTovMod } = await import('../src/config/module-path.js');

// Parse potential @version suffix
let pkgName = isNpm ? pkg.slice(4) : pkg;
let versionConstraint = null;
if (!isNpm && pkgName.includes('@') && !pkgName.startsWith('@')) {
  const atIdx = pkgName.lastIndexOf('@');
  versionConstraint = pkgName.slice(atIdx + 1);
  pkgName = pkgName.slice(0, atIdx);
}

if (!isNpm && isTovMod(pkgName)) {
  // Tova module: fetch tags, pick version, add to [dependencies]
  const { listRemoteTags, pickLatestTag } = await import('../src/config/git-resolver.js');
  try {
    const tags = await listRemoteTags(pkgName);
    if (tags.length === 0) {
      console.error(`  No version tags found for ${pkgName}`);
      process.exit(1);
    }
    if (!versionConstraint) {
      const latest = pickLatestTag(tags);
      versionConstraint = `^${latest.version}`;
    }
    addToSection(tomlPath, 'dependencies', `"${pkgName}"`, versionConstraint);
    console.log(`  Added ${pkgName}@${versionConstraint} to [dependencies] in tova.toml`);
    await installDeps();
  } catch (err) {
    console.error(`  Failed to add ${pkgName}: ${err.message}`);
    process.exit(1);
  }
  return;
}
```

**Step 4: Update `installDeps()` in bin/tova.js**

Add Tova module resolution before npm install:

```javascript
async function installDeps() {
  const cwd = process.cwd();
  const config = resolveConfig(cwd);

  // ... existing tova.toml check ...

  // NEW: Resolve Tova module dependencies
  const tovaDeps = config.dependencies || {};
  if (Object.keys(tovaDeps).length > 0) {
    const { resolveDependencies } = await import('../src/config/resolver.js');
    const { listRemoteTags } = await import('../src/config/git-resolver.js');
    const { fetchModule, getCommitSha } = await import('../src/config/git-resolver.js');
    const { isVersionCached, getModuleCachePath } = await import('../src/config/module-cache.js');
    const { readLockFile, writeLockFile } = await import('../src/config/lock-file.js');

    console.log('  Resolving Tova dependencies...');

    const lock = readLockFile(cwd);
    const { resolved, npmDeps } = await resolveDependencies(tovaDeps, {
      getAvailableVersions: async (mod) => {
        // Check lock file first
        if (lock?.modules[mod]) return [lock.modules[mod].version];
        const tags = await listRemoteTags(mod);
        return tags.map(t => t.version);
      },
      getModuleConfig: async (mod, version) => {
        // Fetch if not cached
        if (!isVersionCached(mod, version)) {
          console.log(`  Fetching ${mod}@v${version}...`);
          await fetchModule(mod, version);
        }
        // Read the module's tova.toml
        const modPath = getModuleCachePath(mod, version);
        const { resolveConfig: resolveModConfig } = await import('../src/config/resolve.js');
        return resolveModConfig(modPath);
      },
      getVersionSha: async (mod, version) => {
        if (lock?.modules[mod]?.sha) return lock.modules[mod].sha;
        return await getCommitSha(mod, version);
      },
    });

    // Write lock file
    writeLockFile(cwd, resolved, npmDeps);
    console.log(`  Resolved ${Object.keys(resolved).length} Tova module(s)`);

    // Merge transitive npm deps into config
    if (Object.keys(npmDeps).length > 0) {
      if (!config.npm) config.npm = {};
      if (!config.npm.prod) config.npm.prod = {};
      Object.assign(config.npm.prod, npmDeps);
    }
  }

  // Existing: generate shadow package.json and run bun install
  const wrote = writePackageJson(config, cwd);
  if (wrote) {
    console.log('  Generated package.json from tova.toml');
    const proc = spawn('bun', ['install'], { stdio: 'inherit', cwd });
    const code = await new Promise(res => proc.on('close', res));
    process.exit(code);
  } else if (Object.keys(tovaDeps).length === 0) {
    console.log('  No dependencies in tova.toml. Nothing to install.\n');
  }
}
```

**Step 5: Add `tova update` command**

In the CLI argument handler in `bin/tova.js`, add:

```javascript
case 'update': {
  const pkg = args[1] || null;
  const { resolveDependencies } = await import('../src/config/resolver.js');
  const { listRemoteTags } = await import('../src/config/git-resolver.js');
  const config = resolveConfig(process.cwd());
  const deps = pkg
    ? { [pkg]: config.dependencies?.[pkg] || '*' }
    : config.dependencies || {};

  if (Object.keys(deps).length === 0) {
    console.log('  No Tova dependencies to update.');
    break;
  }

  // Force fresh resolution (ignore lock file)
  console.log('  Checking for updates...');
  // Re-run installDeps with --fresh semantics
  await installDeps(/* fresh = true */);
  break;
}
```

**Step 6: Add `tova cache` command**

```javascript
case 'cache': {
  const subCmd = args[1] || 'list';
  const { getCacheDir, getCacheSize } = await import('../src/config/module-cache.js');
  const cacheDir = getCacheDir();

  if (subCmd === 'path') {
    console.log(cacheDir);
  } else if (subCmd === 'list') {
    const { listCachedVersions } = await import('../src/config/module-cache.js');
    // Walk cache directory and list all modules
    console.log(`  Cache: ${cacheDir}\n`);
    // ... list modules and versions ...
  } else if (subCmd === 'clean') {
    const { rmSync } = await import('fs');
    rmSync(cacheDir, { recursive: true, force: true });
    console.log('  Cache cleared.');
  }
  break;
}
```

**Step 7: Update `removeDep()` for Tova modules**

The existing `removeDep()` already searches `[dependencies]` — Tova module keys like `"github.com/alice/http"` are quoted in TOML. Update `removeFromSection()` to handle quoted keys:

In `src/config/edit-toml.js`, update the key comparison:

```javascript
// In removeFromSection, update key matching:
const existingKey = line.slice(0, eqIdx).trim().replace(/^"|"$/g, '');
```

**Step 8: Run tests**

Run: `bun test tests/cli-pkg-management.test.js`
Expected: PASS

**Step 9: Commit**

```bash
git add bin/tova.js src/config/edit-toml.js tests/cli-pkg-management.test.js
git commit -m "feat: CLI commands — tova add/install/remove for Tova modules, tova update, tova cache"
```

---

### Task 8: Compiler Integration

**Files:**
- Modify: `bin/tova.js` — `compileWithImports()` (lines ~3761-3858)
- Modify: `src/codegen/base-codegen.js` — `genImport` methods (lines ~612-629)
- Create: `src/config/module-entry.js` — entry point resolution
- Test: `tests/tova-modules.test.js`

**Step 1: Write the failing tests**

```javascript
// tests/tova-modules.test.js
import { describe, test, expect } from 'bun:test';
import { isTovModule } from '../src/config/module-path.js';
import { findEntryPoint } from '../src/config/module-entry.js';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';

const TMP = join(import.meta.dir, '.tmp-modules-test');

describe('findEntryPoint', () => {
  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  test('finds src/lib.tova', () => {
    mkdirSync(join(TMP, 'src'), { recursive: true });
    writeFileSync(join(TMP, 'src', 'lib.tova'), 'pub fn serve() { }');
    expect(findEntryPoint(TMP)).toBe(join(TMP, 'src', 'lib.tova'));
  });
  test('finds lib.tova at root', () => {
    writeFileSync(join(TMP, 'lib.tova'), 'pub fn serve() { }');
    expect(findEntryPoint(TMP)).toBe(join(TMP, 'lib.tova'));
  });
  test('finds index.tova at root', () => {
    writeFileSync(join(TMP, 'index.tova'), 'pub fn serve() { }');
    expect(findEntryPoint(TMP)).toBe(join(TMP, 'index.tova'));
  });
  test('prefers explicit entry from config', () => {
    writeFileSync(join(TMP, 'main.tova'), 'pub fn serve() { }');
    expect(findEntryPoint(TMP, 'main.tova')).toBe(join(TMP, 'main.tova'));
  });
  test('throws when no entry found', () => {
    expect(() => findEntryPoint(TMP)).toThrow(/no entry point/i);
  });
  test('finds sub-package entry', () => {
    mkdirSync(join(TMP, 'postgres'), { recursive: true });
    writeFileSync(join(TMP, 'postgres', 'lib.tova'), 'pub fn connect() { }');
    expect(findEntryPoint(TMP, null, 'postgres')).toBe(join(TMP, 'postgres', 'lib.tova'));
  });
});

describe('import detection in compiler', () => {
  test('github.com path detected as Tova module', () => {
    expect(isTovModule('github.com/alice/tova-http')).toBe(true);
  });
  test('zod NOT detected as Tova module', () => {
    expect(isTovModule('zod')).toBe(false);
  });
  test('./local NOT detected as Tova module', () => {
    expect(isTovModule('./local')).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/tova-modules.test.js`
Expected: FAIL — `module-entry.js` not found

**Step 3: Implement entry point resolution**

```javascript
// src/config/module-entry.js
import { join } from 'path';
import { existsSync } from 'fs';

const ENTRY_CANDIDATES = [
  'src/lib.tova',
  'lib.tova',
  'index.tova',
  'src/index.tova',
  'src/main.tova',
  'main.tova',
];

/**
 * Finds the entry point .tova file for a module.
 * Checks: explicit entry → src/lib.tova → lib.tova → index.tova
 */
export function findEntryPoint(moduleDir, explicitEntry, subpath) {
  const base = subpath ? join(moduleDir, subpath) : moduleDir;

  if (explicitEntry) {
    const p = join(base, explicitEntry);
    if (existsSync(p)) return p;
    throw new Error(`Explicit entry point not found: ${explicitEntry} in ${base}`);
  }

  for (const candidate of ENTRY_CANDIDATES) {
    const p = join(base, candidate);
    if (existsSync(p)) return p;
  }

  throw new Error(
    `No entry point found in ${base}\n` +
    `  Looked for: ${ENTRY_CANDIDATES.join(', ')}\n` +
    `  Tip: Add an \`entry\` field to the package's tova.toml.`
  );
}
```

**Step 4: Update `compileWithImports()` in bin/tova.js**

In the import-processing loop inside `compileWithImports()`, add a new branch for Tova modules. After the existing `.tova` import handling:

```javascript
// For each import node in ast.body:
// After existing `.tova` handling, add:

if (node.type === 'ImportDeclaration' && isTovModule(node.source)) {
  const { parseModulePath } = await import('../src/config/module-path.js');
  const { readLockFile } = await import('../src/config/lock-file.js');
  const { getModuleCachePath, getCompileCachePath } = await import('../src/config/module-cache.js');
  const { findEntryPoint } = await import('../src/config/module-entry.js');

  const parsed = parseModulePath(node.source);
  const lock = readLockFile(process.cwd());
  const lockEntry = lock?.modules[parsed.full];

  if (!lockEntry) {
    throw new Error(
      `Module "${parsed.full}" not found in tova.lock.\n` +
      `  Run \`tova install\` to resolve dependencies.`
    );
  }

  const moduleDir = getModuleCachePath(parsed.full, lockEntry.version);
  const entryFile = findEntryPoint(moduleDir, null, parsed.subpath);

  // Compile the dependency if not already compiled
  if (!compilationCache.has(entryFile)) {
    const depSource = readFileSync(entryFile, 'utf-8');
    compileWithImports(depSource, entryFile, moduleDir);
  }

  // Validate exports
  if (moduleExports.has(entryFile)) {
    const { publicExports } = moduleExports.get(entryFile);
    for (const spec of node.specifiers) {
      if (!publicExports.has(spec.imported)) {
        throw new Error(`Module "${node.source}" does not export "${spec.imported}"`);
      }
    }
  }

  // Rewrite to compiled .js path
  const compiledExt = getCompiledExtension(entryFile);
  node.source = entryFile.replace('.tova', compiledExt);
}
```

Same pattern for `ImportDefault` and `ImportWildcard` nodes.

**Step 5: Run tests**

Run: `bun test tests/tova-modules.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add src/config/module-entry.js bin/tova.js tests/tova-modules.test.js
git commit -m "feat: compiler integration — resolve and compile Tova module imports from cache"
```

---

### Task 9: Package Discovery — tova search

**Files:**
- Modify: `bin/tova.js` (add search command)
- Test: `tests/tova-search.test.js`

**Step 1: Write the failing tests**

```javascript
// tests/tova-search.test.js
import { describe, test, expect } from 'bun:test';
import { formatSearchResults } from '../src/config/search.js';

describe('formatSearchResults', () => {
  test('formats GitHub API results', () => {
    const items = [
      {
        full_name: 'alice/tova-http',
        description: 'HTTP server for Tova',
        stargazers_count: 42,
        updated_at: '2026-02-20T00:00:00Z',
      },
    ];
    const output = formatSearchResults(items);
    expect(output).toContain('github.com/alice/tova-http');
    expect(output).toContain('HTTP server for Tova');
    expect(output).toContain('42');
  });
  test('handles empty results', () => {
    const output = formatSearchResults([]);
    expect(output).toContain('No packages found');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/tova-search.test.js`
Expected: FAIL

**Step 3: Implement search**

```javascript
// src/config/search.js

export function formatSearchResults(items) {
  if (items.length === 0) return '  No packages found.\n';
  const lines = [];
  for (const item of items) {
    const modulePath = `github.com/${item.full_name}`;
    const stars = item.stargazers_count || 0;
    const desc = item.description || '(no description)';
    const updated = item.updated_at ? item.updated_at.slice(0, 10) : 'unknown';
    lines.push(`  ${modulePath}`);
    lines.push(`    ${desc}`);
    lines.push(`    Stars: ${stars}  Updated: ${updated}`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function searchPackages(query) {
  const searchQuery = encodeURIComponent(`${query} topic:tova-package`);
  const url = `https://api.github.com/search/repositories?q=${searchQuery}&sort=stars&per_page=20`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/vnd.github.v3+json' },
  });
  if (!res.ok) throw new Error(`GitHub search failed: ${res.statusText}`);
  const data = await res.json();
  return data.items || [];
}
```

**Step 4: Add `tova search` to bin/tova.js**

```javascript
case 'search': {
  const query = args.slice(1).join(' ');
  if (!query) {
    console.error('Usage: tova search <query>');
    process.exit(1);
  }
  const { searchPackages, formatSearchResults } = await import('../src/config/search.js');
  try {
    console.log(`  Searching for "${query}"...\n`);
    const results = await searchPackages(query);
    console.log(formatSearchResults(results));
  } catch (err) {
    console.error(`  Search failed: ${err.message}`);
  }
  break;
}
```

**Step 5: Run tests**

Run: `bun test tests/tova-search.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add src/config/search.js bin/tova.js tests/tova-search.test.js
git commit -m "feat: tova search — GitHub API package discovery"
```

---

### Task 10: Error Handling & Rich Diagnostics

**Files:**
- Modify: `src/config/resolver.js` (error formatting)
- Modify: `src/config/git-resolver.js` (error formatting)
- Modify: `src/config/module-entry.js` (error formatting)
- Test: `tests/pkg-errors.test.js`

**Step 1: Write the failing tests**

```javascript
// tests/pkg-errors.test.js
import { describe, test, expect } from 'bun:test';
import { formatVersionConflict, formatFetchError, formatMissingEntry, formatAuthError, formatCircularDep } from '../src/config/pkg-errors.js';

describe('package error messages', () => {
  test('formats version conflict', () => {
    const msg = formatVersionConflict('github.com/alice/http', [
      { source: 'github.com/carol/web', constraint: '^1.0.0' },
      { source: 'github.com/dave/api', constraint: '^2.0.0' },
    ]);
    expect(msg).toContain('version conflict');
    expect(msg).toContain('github.com/alice/http');
    expect(msg).toContain('^1.0.0');
    expect(msg).toContain('^2.0.0');
  });

  test('formats fetch error', () => {
    const msg = formatFetchError('github.com/alice/http', 'Could not resolve host');
    expect(msg).toContain('failed to fetch');
    expect(msg).toContain('github.com/alice/http');
  });

  test('formats missing entry point', () => {
    const msg = formatMissingEntry('github.com/alice/http', '1.3.0');
    expect(msg).toContain('no entry point');
    expect(msg).toContain('src/lib.tova');
  });

  test('formats auth error', () => {
    const msg = formatAuthError('github.com/myorg/internal');
    expect(msg).toContain('authentication failed');
    expect(msg).toContain('SSH key');
  });

  test('formats circular dependency', () => {
    const msg = formatCircularDep(['github.com/a/http', 'github.com/b/middleware', 'github.com/a/http']);
    expect(msg).toContain('circular dependency');
    expect(msg).toContain('github.com/a/http');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/pkg-errors.test.js`
Expected: FAIL

**Step 3: Implement error formatting**

```javascript
// src/config/pkg-errors.js

export function formatVersionConflict(modulePath, sources) {
  const lines = [`error: version conflict for ${modulePath}`, ''];
  for (const s of sources) {
    lines.push(`  ${s.source} requires ${s.constraint}`);
  }
  lines.push('');
  lines.push('  These constraints cannot be satisfied simultaneously.');
  lines.push('  Tip: Check if either dependency has a newer version that resolves this.');
  return lines.join('\n');
}

export function formatFetchError(modulePath, detail, cachedVersions = []) {
  const lines = [`error: failed to fetch ${modulePath}`, '', `  ${detail}`];
  if (cachedVersions.length > 0) {
    lines.push('');
    lines.push(`  Cached versions available: ${cachedVersions.join(', ')}`);
    lines.push('  Tip: Run with --offline to use cached versions only.');
  }
  return lines.join('\n');
}

export function formatMissingEntry(modulePath, version) {
  return [
    `error: no entry point found for ${modulePath}@v${version}`,
    '',
    '  Looked for: src/lib.tova, lib.tova, index.tova',
    "  Tip: The package may need an `entry` field in its tova.toml.",
  ].join('\n');
}

export function formatAuthError(modulePath) {
  return [
    `error: authentication failed for ${modulePath}`,
    '',
    '  git clone returned: Permission denied (publickey)',
    '  Tip: Ensure your SSH key or git credentials have access to this repo.',
  ].join('\n');
}

export function formatCircularDep(chain) {
  return [
    'error: circular dependency detected',
    '',
    `  ${chain.join(' → ')}`,
    '',
    '  Tova does not allow circular module dependencies.',
  ].join('\n');
}

export function formatIntegrityError(modulePath, version, expectedSha, actualSha) {
  return [
    `error: integrity check failed for ${modulePath}@v${version}`,
    '',
    `  Expected SHA: ${expectedSha}`,
    `  Got SHA:      ${actualSha}`,
    '',
    '  The git tag may have been force-pushed. This could indicate tampering.',
    `  Run \`tova update ${modulePath}\` to re-resolve.`,
  ].join('\n');
}
```

**Step 4: Run tests**

Run: `bun test tests/pkg-errors.test.js`
Expected: PASS

**Step 5: Wire error formatters into resolver and CLI**

Update `src/config/resolver.js` `resolveDependencies()` to use `formatVersionConflict()` instead of raw error strings. Update `src/config/git-resolver.js` `fetchModule()` to detect auth errors and use `formatAuthError()`.

**Step 6: Commit**

```bash
git add src/config/pkg-errors.js tests/pkg-errors.test.js src/config/resolver.js src/config/git-resolver.js
git commit -m "feat: rich error messages for package management failures"
```

---

### Task 11: Integration Test & Full Flow Verification

**Files:**
- Create: `tests/pkg-integration.test.js`

**Step 1: Write integration tests**

```javascript
// tests/pkg-integration.test.js
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { resolveConfig } from '../src/config/resolve.js';
import { isTovModule, parseModulePath, moduleToGitUrl } from '../src/config/module-path.js';
import { parseSemver, satisfies, selectMinVersion } from '../src/config/semver.js';
import { mergeDependencies, mergeNpmDeps, detectConflicts, resolveDependencies } from '../src/config/resolver.js';
import { writeLockFile, readLockFile } from '../src/config/lock-file.js';
import { findEntryPoint } from '../src/config/module-entry.js';

const TMP = join(import.meta.dir, '.tmp-pkg-integration');

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});
afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
});

describe('full resolution flow (mocked I/O)', () => {
  test('resolves a simple dependency tree', async () => {
    const rootDeps = {
      'github.com/alice/http': '^1.0.0',
      'github.com/bob/jwt': '^2.0.0',
    };

    const mockVersions = {
      'github.com/alice/http': ['1.0.0', '1.1.0', '1.2.0'],
      'github.com/bob/jwt': ['2.0.0', '2.1.0'],
      'github.com/carol/logger': ['1.0.0'],
    };

    const mockConfigs = {
      'github.com/alice/http': {
        dependencies: { 'github.com/carol/logger': '^1.0.0' },
        npm: { prod: { 'cookie-parser': '^1.4.0' } },
      },
      'github.com/bob/jwt': { dependencies: {}, npm: {} },
      'github.com/carol/logger': { dependencies: {}, npm: {} },
    };

    const { resolved, npmDeps } = await resolveDependencies(rootDeps, {
      getAvailableVersions: async (mod) => mockVersions[mod] || [],
      getModuleConfig: async (mod) => mockConfigs[mod] || null,
      getVersionSha: async (mod, ver) => `sha-${mod}-${ver}`,
    });

    expect(resolved['github.com/alice/http'].version).toBe('1.0.0');
    expect(resolved['github.com/bob/jwt'].version).toBe('2.0.0');
    expect(resolved['github.com/carol/logger'].version).toBe('1.0.0');
    expect(npmDeps['cookie-parser']).toBe('^1.4.0');
  });

  test('lock file round-trip', () => {
    const resolved = {
      'github.com/alice/http': { version: '1.2.0', sha: 'abc123', source: 'https://github.com/alice/http.git' },
    };
    writeLockFile(TMP, resolved, { zod: '^3.0.0' });
    const lock = readLockFile(TMP);
    expect(lock.modules['github.com/alice/http'].version).toBe('1.2.0');
    expect(lock.modules['github.com/alice/http'].sha).toBe('abc123');
    expect(lock.npm.zod).toBe('^3.0.0');
  });

  test('entry point resolution with package structure', () => {
    mkdirSync(join(TMP, 'src'), { recursive: true });
    writeFileSync(join(TMP, 'src', 'lib.tova'), 'pub fn hello() { "hello" }');
    writeFileSync(join(TMP, 'tova.toml'), '[package]\nname = "test"\nversion = "1.0.0"');
    const entry = findEntryPoint(TMP);
    expect(entry).toBe(join(TMP, 'src', 'lib.tova'));
  });
});
```

**Step 2: Run integration tests**

Run: `bun test tests/pkg-integration.test.js`
Expected: PASS

**Step 3: Run full test suite to verify no regressions**

Run: `bun test`
Expected: All existing tests pass + all new tests pass

**Step 4: Commit**

```bash
git add tests/pkg-integration.test.js
git commit -m "test: package management integration tests — full resolution flow"
```

---

## Summary

| Task | Files | What It Does |
|------|-------|-------------|
| 1 | `src/config/module-path.js` | `isTovModule()`, `parseModulePath()`, `moduleToGitUrl()` |
| 2 | `src/config/semver.js` | `parseSemver()`, `satisfies()`, `selectMinVersion()` |
| 3 | `src/config/module-cache.js` | Global cache at `~/.tova/pkg/`, version lookup |
| 4 | `src/config/git-resolver.js` | `git ls-remote` tag parsing, `git clone` fetching |
| 5 | `src/config/resolver.js` | Dependency tree resolution, minimum version selection |
| 6 | `src/config/lock-file.js` + `resolve.js` | TOML lock file, `[package]` section support |
| 7 | `bin/tova.js` | CLI: `tova add/install/remove/update/cache` |
| 8 | `bin/tova.js` + `src/config/module-entry.js` | Compiler resolves + compiles Tova module imports |
| 9 | `src/config/search.js` + `bin/tova.js` | `tova search` via GitHub API |
| 10 | `src/config/pkg-errors.js` | Rich error messages for all failure modes |
| 11 | `tests/pkg-integration.test.js` | End-to-end integration tests |

**New files created:** 8 (`module-path.js`, `semver.js`, `module-cache.js`, `git-resolver.js`, `resolver.js`, `lock-file.js`, `module-entry.js`, `search.js`, `pkg-errors.js`)
**Files modified:** 3 (`bin/tova.js`, `src/config/resolve.js`, `src/config/edit-toml.js`)
**Test files:** 9 new test files
