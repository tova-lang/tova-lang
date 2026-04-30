#!/usr/bin/env bun
// One-off sweep: rename ```tova → ```tova-jsx for blocks currently failing
// with JSX-related parse errors (LESS, STYLE_BLOCK, Unterminated regex).
//
// Idempotent: only acts on blocks whose opener line is exactly "```tova".
// Skips any block whose line doesn't match (e.g., already renamed).
//
// Usage: bun scripts/sweep-jsx-fences.js [--dry-run]

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';

const ROOT = resolve(import.meta.dir, '..');
const DRY = process.argv.includes('--dry-run');

const reporter = spawnSync('bun', ['scripts/report-broken-docs.js', '--json'], {
  cwd: ROOT,
  encoding: 'utf8',
});
// The reporter exits with `totalBroken % 256` in JSON mode, so any non-crash
// status is fine. We rely on stdout being valid JSON.
let data;
try {
  data = JSON.parse(reporter.stdout);
} catch (e) {
  console.error('Reporter did not produce JSON. stderr:', reporter.stderr);
  process.exit(2);
}

function isJsxError(msg) {
  return msg.includes('Unexpected token: LESS')
    || msg.includes('STYLE_BLOCK')
    || msg.includes('Unterminated regex literal');
}

const byFile = new Map();
for (const f of data.files) {
  for (const ex of f.examples) {
    if (!isJsxError(ex.message)) continue;
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(ex.line);
  }
}

let totalRenamed = 0;
let totalSkipped = 0;
const reports = [];

for (const [relFile, lines] of byFile.entries()) {
  const abs = ROOT + '/' + relFile;
  const docLines = readFileSync(abs, 'utf8').split('\n');
  const unique = [...new Set(lines)].sort((a, b) => b - a);
  let renamed = 0;
  let skipped = 0;
  for (const lineNum of unique) {
    const idx = lineNum - 1;
    if (docLines[idx] === '```tova') {
      docLines[idx] = '```tova-jsx';
      renamed++;
    } else {
      skipped++;
    }
  }
  if (renamed > 0 && !DRY) {
    writeFileSync(abs, docLines.join('\n'));
  }
  totalRenamed += renamed;
  totalSkipped += skipped;
  reports.push({ file: relFile, renamed, skipped, total: lines.length });
}

console.log(`${DRY ? '[DRY RUN] ' : ''}Renamed ${totalRenamed} fences across ${reports.filter(r => r.renamed > 0).length} files (skipped ${totalSkipped}).`);
for (const r of reports.sort((a, b) => b.renamed - a.renamed)) {
  if (r.renamed === 0 && r.skipped === 0) continue;
  console.log(`  ${String(r.renamed).padStart(3)}/${r.total}  ${r.file}${r.skipped ? ` (${r.skipped} skipped)` : ''}`);
}
