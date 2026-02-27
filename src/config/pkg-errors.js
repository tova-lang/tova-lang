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
    `  ${chain.join(' \u2192 ')}`,
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
