// Global cache manager for the Tova package manager.
// Manages the ~/.tova/pkg/ directory where downloaded packages are stored.
// Provides path resolution, version lookup, and cleanup utilities.

import { join } from 'path';
import { existsSync, readdirSync, rmSync } from 'fs';
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
