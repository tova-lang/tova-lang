#!/usr/bin/env bun
// Sync stdlib module files to inline.js
// Reads export functions/consts from src/stdlib/*.js module files and
// updates matching entries in BUILTIN_FUNCTIONS in inline.js.
//
// Usage:
//   bun scripts/sync-stdlib.js          # update inline.js in place
//   bun scripts/sync-stdlib.js --check  # report if out of sync (for CI)

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';

const ROOT = resolve(dirname(import.meta.dir));
const INLINE_PATH = resolve(ROOT, 'src/stdlib/inline.js');

// Module files to read (order doesn't matter)
const MODULE_FILES = [
  'src/stdlib/core.js',
  'src/stdlib/collections.js',
  'src/stdlib/string.js',
  'src/stdlib/math.js',
  'src/stdlib/functional.js',
  'src/stdlib/encoding.js',
  'src/stdlib/datetime.js',
  'src/stdlib/url.js',
  'src/stdlib/validation.js',
];

// Extract exported functions and consts from a module file
function extractExports(filePath) {
  const code = readFileSync(resolve(ROOT, filePath), 'utf-8');
  const exports = new Map();

  // Match: export function name(...) { ... }
  // We need to find balanced braces to get the full body
  const funcRegex = /^export\s+function\s+(\w+)\s*\(([^)]*)\)\s*\{/gm;
  let match;
  while ((match = funcRegex.exec(code)) !== null) {
    const name = match[1];
    const startIdx = match.index + match[0].length - 1; // at the opening {
    const body = extractBalancedBraces(code, startIdx);
    const params = match[2].trim();
    // Convert to single-line inline string
    const inline = `function ${name}(${params}) ${collapseWhitespace(body)}`;
    exports.set(name, inline);
  }

  // Match: export const NAME = ...;
  const constRegex = /^export\s+const\s+(\w+)\s*=\s*(.+?);?\s*$/gm;
  while ((match = constRegex.exec(code)) !== null) {
    const name = match[1];
    const value = match[2].trim().replace(/;$/, '');
    exports.set(name, `const ${name} = ${value};`);
  }

  return exports;
}

// Extract a balanced-brace block starting at the opening {
function extractBalancedBraces(code, startIdx) {
  let depth = 0;
  let i = startIdx;
  while (i < code.length) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) return code.slice(startIdx, i + 1);
    }
    // Skip string literals
    else if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
      const quote = code[i];
      i++;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') i++; // skip escaped char
        i++;
      }
    }
    i++;
  }
  return code.slice(startIdx); // fallback
}

// Collapse multi-line function body to single line
function collapseWhitespace(body) {
  return body
    .replace(/\n\s*/g, ' ')   // collapse newlines + indentation to single space
    .replace(/\s{2,}/g, ' ')  // collapse multiple spaces
    .trim();
}

// Main
const checkMode = process.argv.includes('--check');
const allExports = new Map();
let totalExtracted = 0;

for (const file of MODULE_FILES) {
  try {
    const exports = extractExports(file);
    for (const [name, inline] of exports) {
      allExports.set(name, inline);
    }
    totalExtracted += exports.size;
    if (!checkMode) {
      console.log(`  ${file}: ${exports.size} exports`);
    }
  } catch (e) {
    if (e.code === 'ENOENT') {
      if (!checkMode) console.log(`  ${file}: (not found, skipping)`);
    } else {
      throw e;
    }
  }
}

// Read inline.js
let inlineCode = readFileSync(INLINE_PATH, 'utf-8');
let updatedCount = 0;
let mismatchCount = 0;

for (const [name, inlineStr] of allExports) {
  // Look for existing entry in BUILTIN_FUNCTIONS
  // Pattern: name: `...`,  or  name: `...`  (possibly multi-line)
  const entryRegex = new RegExp(
    `(  ${name}: \`)([^\`]*?)(\`,?)`,
    's'
  );

  const match = inlineCode.match(entryRegex);
  if (match) {
    const currentInline = match[2];
    if (currentInline !== inlineStr) {
      if (checkMode) {
        mismatchCount++;
        console.error(`MISMATCH: ${name}`);
        console.error(`  module:  ${inlineStr.slice(0, 80)}...`);
        console.error(`  inline:  ${currentInline.slice(0, 80)}...`);
      } else {
        inlineCode = inlineCode.replace(
          match[0],
          `  ${name}: \`${inlineStr}\`${match[3].endsWith(',') ? ',' : ''}`
        );
        updatedCount++;
      }
    }
  }
}

if (checkMode) {
  if (mismatchCount > 0) {
    console.error(`\n${mismatchCount} entries are out of sync.`);
    console.error('Run "bun scripts/sync-stdlib.js" to update inline.js.');
    process.exitCode = 1;
  } else {
    console.log(`All ${totalExtracted} entries are in sync.`);
  }
} else {
  if (updatedCount > 0) {
    writeFileSync(INLINE_PATH, inlineCode);
    console.log(`\nUpdated ${updatedCount} entries in inline.js.`);
  } else {
    console.log(`\nAll ${totalExtracted} entries already in sync.`);
  }
}
