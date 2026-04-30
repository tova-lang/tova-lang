#!/usr/bin/env bun
// Walks every doc page under tests/docs/ scope, runs the same validation
// the test suite runs, and prints a human-readable list of broken examples.
//
// Bun's test runner hides `test.skip` titles by default, so the
// KNOWN-BROKEN information embedded in our doc tests is invisible without
// this script. Run after a docs change to see what regressed:
//
//   bun scripts/report-broken-docs.js
//   bun scripts/report-broken-docs.js --json   # machine-readable
//   bun scripts/report-broken-docs.js docs/guide/async.md  # one file
//
// Exit code: number of broken blocks (0 = all clean).

import { readdirSync, statSync } from 'fs';
import { resolve, relative, basename } from 'path';
import { loadDocBlocks, validateBlock, blockLabel } from '../tests/helpers/doc-examples.js';

const ROOT = resolve(import.meta.dir, '..');

// Mirror the scope covered by tests/docs/*.test.js
const SCOPE = [
  'docs/guide',
  'docs/getting-started',
  'docs/tooling',
  'docs/stdlib',
  'docs/mastering',
  'docs/examples',
  'docs/reactivity',
  'docs/fullstack',
  'docs/server',
  'docs/reference',
  'docs/tutorials',         // recurses into data/ subdirectory
  'docs/editor',
  'docs/packages',
  // Top-level pages explicitly listed
  'docs/index.md',
  'docs/tutorial.md',
  'docs/why-tova.md',
  'docs/playground.md',
];

function listMarkdown(p) {
  const abs = resolve(ROOT, p);
  const st = statSync(abs);
  if (st.isFile() && abs.endsWith('.md')) return [abs];
  const out = [];
  if (st.isDirectory()) {
    for (const entry of readdirSync(abs)) {
      const child = resolve(abs, entry);
      const cst = statSync(child);
      if (cst.isDirectory()) {
        out.push(...listMarkdown(child));
      } else if (entry.endsWith('.md')) {
        out.push(child);
      }
    }
  }
  return out;
}

const args = process.argv.slice(2);
const json = args.includes('--json');
const explicitFiles = args.filter(a => !a.startsWith('--'));
const targets = explicitFiles.length
  ? explicitFiles.flatMap(listMarkdown)
  : SCOPE.flatMap(listMarkdown);

let totalBlocks = 0;
let totalBroken = 0;
let totalSignatures = 0;
const fileReports = [];

for (const file of targets) {
  const blocks = loadDocBlocks(file);
  const broken = [];
  let signatures = 0;
  for (const block of blocks) {
    const r = validateBlock(block, file);
    if (r.phase === 'signature') signatures++;
    if (!r.ok) {
      broken.push({
        label: blockLabel(block),
        line: block.startLine,
        phase: r.phase,
        message: r.message,
        isNegative: block.isNegative,
      });
    }
  }
  totalBlocks += blocks.length;
  totalBroken += broken.length;
  totalSignatures += signatures;
  fileReports.push({
    file: relative(ROOT, file),
    total: blocks.length,
    broken: broken.length,
    signatures,
    examples: broken,
  });
}

if (json) {
  console.log(JSON.stringify({
    totalFiles: fileReports.length,
    totalBlocks,
    totalBroken,
    files: fileReports,
  }, null, 2));
  process.exit(totalBroken);
}

console.log(`Tova doc-example validation — ${fileReports.length} files, ${totalBlocks} blocks (${totalSignatures} signatures auto-skipped), ${totalBroken} broken\n`);

const dirty = fileReports.filter(r => r.broken > 0);
const clean = fileReports.filter(r => r.broken === 0 && r.total > 0);
const empty = fileReports.filter(r => r.total === 0);

if (dirty.length === 0) {
  console.log('All examples compile. ✅');
} else {
  console.log('## Broken examples\n');
  for (const r of dirty) {
    console.log(`### ${r.file}  (${r.broken}/${r.total} broken)`);
    for (const ex of r.examples) {
      const tag = ex.isNegative ? ' [marked-negative]' : '';
      console.log(`  - ${ex.label}${tag}  [${ex.phase}] ${ex.message}`);
    }
    console.log('');
  }
}

if (clean.length > 0) {
  console.log(`## Clean (${clean.length})\n`);
  for (const r of clean) console.log(`  ✅ ${r.file}  (${r.total} blocks)`);
  console.log('');
}

if (empty.length > 0) {
  console.log(`## No Tova examples (${empty.length})\n`);
  for (const r of empty) console.log(`  – ${r.file}`);
  console.log('');
}

console.log(`Summary: ${totalBlocks - totalBroken}/${totalBlocks} blocks passing across ${fileReports.length} files.`);
process.exit(totalBroken === 0 ? 0 : 1);
