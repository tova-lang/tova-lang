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
 * Returns a map of modulePath -> { version, sha, source, npmDeps }.
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

  const resolved = {};         // modulePath -> { version, sha }
  const allConstraints = {};   // modulePath -> [constraints...]
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
