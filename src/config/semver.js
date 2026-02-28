// src/config/semver.js
// Semver utilities for the Tova package manager.
// Provides parsing, comparison, constraint satisfaction, and minimum version selection.

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
