#!/usr/bin/env bun

// Builds standalone Tova binaries for distribution.
// Usage:
//   bun scripts/build-binary.js                    # build for current platform
//   bun scripts/build-binary.js --platform local   # same as above
//   bun scripts/build-binary.js --platform all     # build all platforms
//   bun scripts/build-binary.js --platform bun-darwin-arm64

import { execSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distDir = join(root, 'dist');

const TARGETS = [
  { target: 'bun-darwin-arm64', name: 'tova-darwin-arm64' },
  { target: 'bun-darwin-x64', name: 'tova-darwin-x64' },
  { target: 'bun-linux-x64', name: 'tova-linux-x64' },
  { target: 'bun-linux-arm64', name: 'tova-linux-arm64' },
  { target: 'bun-windows-x64', name: 'tova-windows-x64.exe' },
];

function getPlatformArg() {
  const idx = process.argv.indexOf('--platform');
  return idx >= 0 ? process.argv[idx + 1] : 'local';
}

function embedRuntime() {
  console.log('Embedding runtime files...');
  execSync('bun scripts/embed-runtime.js', { cwd: root, stdio: 'inherit' });
}

function buildTarget(target, outName) {
  const outPath = join(distDir, outName);
  console.log(`Building ${outName} (${target})...`);
  execSync(
    `bun build --compile --target=${target} bin/tova.js --outfile ${outPath}`,
    { cwd: root, stdio: 'inherit' }
  );
  console.log(`  -> ${outPath}`);
}

function buildLocal() {
  const outPath = join(distDir, 'tova');
  console.log('Building for current platform...');
  execSync(
    `bun build --compile bin/tova.js --outfile ${outPath}`,
    { cwd: root, stdio: 'inherit' }
  );
  console.log(`  -> ${outPath}`);
}

// Main
const platform = getPlatformArg();

embedRuntime();

mkdirSync(distDir, { recursive: true });

if (platform === 'local') {
  buildLocal();
} else if (platform === 'all') {
  for (const { target, name } of TARGETS) {
    buildTarget(target, name);
  }
} else {
  const match = TARGETS.find(t => t.target === platform);
  if (match) {
    buildTarget(match.target, match.name);
  } else {
    console.error(`Unknown platform: ${platform}`);
    console.error(`Available: local, all, ${TARGETS.map(t => t.target).join(', ')}`);
    process.exit(1);
  }
}

console.log('\nBuild complete.');
