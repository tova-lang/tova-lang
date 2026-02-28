// Module path utilities for Tova package management.
// Determines whether an import is a Tova module (vs npm/relative),
// parses module paths into components, and converts them to git URLs.

export function isTovModule(source) {
  if (!source || source.startsWith('.') || source.startsWith('/') || source.startsWith('@') || source.includes(':')) {
    return false;
  }
  const firstSegment = source.split('/')[0];
  return firstSegment.includes('.');
}

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
  return { host, owner, repo, subpath, full: `${host}/${owner}/${repo}` };
}

export function moduleToGitUrl(modulePath) {
  const parsed = typeof modulePath === 'string' ? parseModulePath(modulePath) : modulePath;
  return `https://${parsed.full}.git`;
}
