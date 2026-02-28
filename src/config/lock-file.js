// src/config/lock-file.js
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { parseTOML } from './toml.js';

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
