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
