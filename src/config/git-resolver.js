// Git resolver for the Tova package manager.
// Handles git operations: parsing tag lists, sorting by semver,
// picking the latest tag, and fetching modules from remote repositories.

import { spawn } from 'child_process';
import { join } from 'path';
import { mkdirSync, renameSync, rmSync, existsSync } from 'fs';
import { parseSemver, compareSemver } from './semver.js';
import { moduleToGitUrl, parseModulePath } from './module-path.js';
import { getModuleCachePath, getCacheDir } from './module-cache.js';

/**
 * Parse `git ls-remote --tags` output into an array of { version, sha } objects.
 * Filters out non-semver tags and prefers dereferenced (^{}) SHAs for annotated tags.
 */
export function parseTagList(output) {
  if (!output.trim()) return [];
  const lines = output.trim().split('\n');
  const tagMap = new Map();
  for (const line of lines) {
    const [sha, ref] = line.split('\t');
    if (!ref || !ref.startsWith('refs/tags/')) continue;
    const tagName = ref.replace('refs/tags/', '');
    const isDeref = tagName.endsWith('^{}');
    const cleanName = isDeref ? tagName.slice(0, -3) : tagName;
    const versionStr = cleanName.startsWith('v') ? cleanName.slice(1) : cleanName;
    try { parseSemver(versionStr); } catch { continue; }
    if (isDeref || !tagMap.has(versionStr)) {
      tagMap.set(versionStr, sha);
    }
  }
  return Array.from(tagMap.entries()).map(([version, sha]) => ({ version, sha }));
}

/**
 * Sort an array of { version, sha } tags by semver in ascending order.
 * Returns a new array (does not mutate the input).
 */
export function sortTags(tags) {
  return [...tags].sort((a, b) => compareSemver(a.version, b.version));
}

/**
 * Pick the tag with the highest semver version.
 * Returns null if the tags array is empty.
 */
export function pickLatestTag(tags) {
  if (tags.length === 0) return null;
  const sorted = sortTags(tags);
  return sorted[sorted.length - 1];
}

/**
 * List all semver tags from a remote git repository.
 * Returns a promise resolving to an array of { version, sha } objects.
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
 * Clone a specific version of a module into the local cache.
 * Performs a shallow clone, removes .git directory, and moves to the cache path.
 * Returns the destination path on success.
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
      const dotGit = join(tmpPath, '.git');
      if (existsSync(dotGit)) rmSync(dotGit, { recursive: true, force: true });
      mkdirSync(join(destPath, '..'), { recursive: true });
      renameSync(tmpPath, destPath);
      resolve(destPath);
    });
  });
}

/**
 * Get the commit SHA for a specific version tag from a remote repository.
 * Prefers the dereferenced SHA for annotated tags.
 * Returns null if the version tag is not found.
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
