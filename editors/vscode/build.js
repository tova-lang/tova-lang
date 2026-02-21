#!/usr/bin/env node
// Build script: bundles the VS Code extension + LSP server for distribution

const { execFileSync } = require('child_process');
const { mkdirSync, existsSync, copyFileSync, writeFileSync, readFileSync } = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const outDir = path.join(__dirname, 'dist');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

console.log('Building Tova VS Code extension...\n');

// Step 1: Bundle the LSP server
console.log('  Bundling LSP server...');
try {
  execFileSync('npx', [
    'esbuild',
    path.join(root, 'src', 'lsp', 'server.js'),
    '--bundle', '--platform=node', '--target=node18',
    '--outfile=' + path.join(outDir, 'server.js'),
    '--format=cjs', '--external:vscode',
  ], { cwd: root, stdio: 'pipe' });
  console.log('  -> dist/server.js');
} catch (e) {
  console.error('  Failed to bundle server:', e.stderr?.toString() || e.message);
  process.exit(1);
}

// Step 2: Bundle the extension client
console.log('  Bundling extension client...');
try {
  execFileSync('npx', [
    'esbuild',
    path.join(__dirname, 'extension.js'),
    '--bundle', '--platform=node', '--target=node18',
    '--outfile=' + path.join(outDir, 'extension.js'),
    '--format=cjs', '--external:vscode', '--external:vscode-languageclient',
  ], { cwd: root, stdio: 'pipe' });
  console.log('  -> dist/extension.js');
} catch (e) {
  console.error('  Failed to bundle extension:', e.stderr?.toString() || e.message);
  process.exit(1);
}

// Step 3: Copy static assets
console.log('  Copying assets...');
const assets = [
  'language-configuration.json',
  'syntaxes/tova.tmLanguage.json',
  'snippets/tova.json',
];
for (const asset of assets) {
  const src = path.join(__dirname, asset);
  const dest = path.join(outDir, asset);
  const destDir = path.dirname(dest);
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log('  -> dist/' + asset);
  }
}

// Step 4: Generate dist/package.json for packaging
const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
pkg.main = './dist/extension.js';
writeFileSync(path.join(outDir, '..', 'package-dist.json'), JSON.stringify(pkg, null, 2));

console.log('\nBuild complete! Run `npx vsce package` to create .vsix');
