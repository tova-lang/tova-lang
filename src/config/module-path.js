// Module path utilities for Tova package management.
// Determines whether an import is a Tova module (vs npm/relative),
// parses module paths into components, and converts them to git URLs.

// Blessed first-party packages: tova/X → github.com/tova-lang/X
export const BLESSED_PACKAGES = {
  fp: 'github.com/tova-lang/fp',
  validate: 'github.com/tova-lang/validate',
  encoding: 'github.com/tova-lang/encoding',
  test: 'github.com/tova-lang/test',
  retry: 'github.com/tova-lang/retry',
  template: 'github.com/tova-lang/template',
  data: 'github.com/tova-lang/data',
  stats: 'github.com/tova-lang/stats',
  plot: 'github.com/tova-lang/plot',
  ml: 'github.com/tova-lang/ml',
};

export function expandBlessedPackage(source) {
  if (!source || !source.startsWith('tova/')) return null;
  const rest = source.slice(5);
  const name = rest.split('/')[0];
  if (BLESSED_PACKAGES[name]) return BLESSED_PACKAGES[name] + (rest.includes('/') ? '/' + rest.slice(name.length + 1) : '');
  return null;
}

export function isTovModule(source) {
  if (!source || source.startsWith('.') || source.startsWith('/') || source.startsWith('@') || source.includes(':')) {
    return false;
  }
  // Check blessed packages first
  if (source.startsWith('tova/')) {
    const name = source.slice(5).split('/')[0];
    return !!BLESSED_PACKAGES[name];
  }
  const firstSegment = source.split('/')[0];
  return firstSegment.includes('.');
}

export function parseModulePath(source) {
  // Expand blessed packages: tova/data → github.com/tova-lang/data
  const expanded = expandBlessedPackage(source);
  const actual = expanded || source;

  if (!expanded && !isTovModule(actual)) {
    throw new Error(`Invalid Tova module path: "${source}"`);
  }
  const parts = actual.split('/');
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
