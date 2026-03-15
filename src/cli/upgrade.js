import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, renameSync, chmodSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { color, isTTY, _compatSpawnSync } from './utils.js';
import { VERSION } from '../version.js';

function detectInstallMethod() {
  const execPath = process.execPath || process.argv[0];
  const scriptPath = process.argv[1] || '';
  if (execPath.includes('.tova/bin') || scriptPath.includes('.tova/')) return 'binary';
  // Check if ~/.tova/bin/tova exists — indicates binary/wrapper install even if
  // the wrapper points to a local repo checkout
  const wrapperPath = join(process.env.HOME || '', '.tova', 'bin', 'tova');
  if (existsSync(wrapperPath)) return 'binary';
  return 'npm';
}

function compareSemver(a, b) {
  // Returns: -1 if a < b, 0 if a === b, 1 if a > b
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

async function downloadWithProgress(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) return null;

  const contentLength = parseInt(res.headers.get('content-length'), 10) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;

  const barWidth = 20;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;

    if (isTTY) {
      if (contentLength > 0) {
        const pct = Math.min(100, Math.round((received / contentLength) * 100));
        const filled = Math.round((pct / 100) * barWidth);
        const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
        process.stdout.write(`\r  Downloading... [${bar}] ${pct}% (${formatBytes(received)} / ${formatBytes(contentLength)})`);
      } else {
        process.stdout.write(`\r  Downloading... ${formatBytes(received)}`);
      }
    }
  }

  if (isTTY) process.stdout.write('\n');

  // Combine chunks into a single Uint8Array
  const result = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  writeFileSync(destPath, result);
  return { compressed: url.endsWith('.gz'), size: received };
}

export async function upgradeCommand() {
  console.log(`\n  Current version: ${color.bold('Tova v' + VERSION)}\n`);
  console.log('  Checking for updates...');

  const installMethod = detectInstallMethod();

  try {
    // Always check npm registry as the source of truth for latest version
    const res = await fetch('https://registry.npmjs.org/tova/latest');
    if (!res.ok) {
      console.error(color.red('  Could not reach the npm registry. Check your network connection.'));
      process.exit(1);
    }
    const data = await res.json();
    const latestVersion = data.version;

    if (compareSemver(VERSION, latestVersion) >= 0) {
      console.log(`  ${color.green('Already on the latest version')} (v${VERSION}).\n`);
      return;
    }

    console.log(`  New version available: ${color.green('v' + latestVersion)}\n`);

    if (installMethod === 'binary') {
      console.log('  Upgrading via binary...');

      // Check GitHub releases for the matching binary
      const ghRes = await fetch('https://api.github.com/repos/tova-lang/tova-lang/releases/latest');
      let ghTag = null;
      if (ghRes.ok) {
        const ghData = await ghRes.json();
        const ghVersion = (ghData.tag_name || '').replace(/^v/, '');
        if (compareSemver(ghVersion, VERSION) > 0) {
          ghTag = ghData.tag_name;
        }
      }

      if (!ghTag) {
        // No newer binary release — install from npm tarball directly
        console.log(`  ${color.dim('No binary release for v' + latestVersion + ' yet. Installing from npm...')}`);
        await npmTarballUpgrade(latestVersion);
        return;
      }

      // Detect platform
      const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : 'windows';
      const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
      const assetName = `tova-${platform}-${arch}`;
      const downloadUrl = `https://github.com/tova-lang/tova-lang/releases/download/${ghTag}/${assetName}.gz`;

      const installDir = join(process.env.HOME || '', '.tova', 'bin');
      const tmpPath = join(installDir, 'tova.download');
      const binPath = join(installDir, 'tova');

      // Ensure install directory exists
      mkdirSync(installDir, { recursive: true });

      // Download compressed binary with progress
      let dlResult = await downloadWithProgress(downloadUrl, tmpPath);
      if (!dlResult) {
        // Fall back to uncompressed
        dlResult = await downloadWithProgress(downloadUrl.replace('.gz', ''), tmpPath);
        if (!dlResult) {
          console.log(`  ${color.dim('Binary download failed. Falling back to npm...')}\n`);
          await npmUpgrade(latestVersion);
          return;
        }
      }

      if (dlResult.compressed) {
        // Decompress gzip
        console.log('  Decompressing...');
        const compressed = readFileSync(tmpPath);
        const { gunzipSync } = await import('zlib');
        const decompressed = gunzipSync(compressed);
        writeFileSync(tmpPath, decompressed);
      }

      // Make executable
      chmodSync(tmpPath, 0o755);

      // Verify the new binary works
      console.log('  Verifying binary...');
      const { spawnSync } = await import('child_process');
      const verifyProc = spawnSync(tmpPath, ['--version'], { timeout: 10000 });
      if (verifyProc.status !== 0) {
        rmSync(tmpPath, { force: true });
        console.error(color.red('  Downloaded binary verification failed. Falling back to npm...'));
        await npmUpgrade(latestVersion);
        return;
      }

      // Atomic rename
      renameSync(tmpPath, binPath);

      console.log(`\n  ${color.green('✓')} Upgraded: v${VERSION} -> ${color.bold('v' + latestVersion)}\n`);
    } else {
      console.log('  Upgrading...');
      await npmUpgrade(latestVersion);
    }
  } catch (err) {
    console.error(color.red(`  Upgrade failed: ${err.message}`));
    if (installMethod === 'binary') {
      console.error('  Try manually: curl -fsSL https://raw.githubusercontent.com/tova-lang/tova-lang/main/install.sh | sh\n');
    } else {
      console.error('  Try manually: bun add -g tova@latest\n');
    }
    process.exit(1);
  }
}

async function npmUpgrade(latestVersion) {
  const pm = detectPackageManager();
  const installCmd = pm === 'bun' ? ['bun', ['add', '-g', 'tova@latest']]
                   : pm === 'pnpm' ? ['pnpm', ['add', '-g', 'tova@latest']]
                   : pm === 'yarn' ? ['yarn', ['global', 'add', 'tova@latest']]
                   : ['npm', ['install', '-g', 'tova@latest']];

  const proc = spawn(installCmd[0], installCmd[1], { stdio: 'inherit' });
  const exitCode = await new Promise(res => proc.on('close', res));

  if (exitCode === 0) {
    console.log(`\n  ${color.green('✓')} Upgraded to Tova v${latestVersion}.\n`);
  } else {
    console.error(color.red(`\n  Upgrade failed (exit code ${exitCode}).`));
    console.error(`  Try manually: ${installCmd[0]} ${installCmd[1].join(' ')}\n`);
    process.exit(1);
  }
}

async function npmTarballUpgrade(latestVersion) {
  const installDir = join(process.env.HOME || '', '.tova');
  const binDir = join(installDir, 'bin');
  const libDir = join(installDir, 'lib');
  mkdirSync(libDir, { recursive: true });

  // Download npm tarball
  const tarballUrl = `https://registry.npmjs.org/tova/-/tova-${latestVersion}.tgz`;
  const tarballPath = join(installDir, 'tova.tgz');

  const dlResult = await downloadWithProgress(tarballUrl, tarballPath);
  if (!dlResult) {
    console.error(color.red('  Failed to download npm package. Try manually: bun add -g tova@latest'));
    process.exit(1);
  }

  // Extract tarball into lib dir
  console.log('  Extracting...');
  const { spawnSync: spawnTar } = await import('child_process');
  rmSync(libDir, { recursive: true, force: true });
  mkdirSync(libDir, { recursive: true });
  const tarResult = spawnTar('tar', ['-xzf', tarballPath, '-C', libDir, '--strip-components=1'], { stdio: 'pipe' });
  rmSync(tarballPath, { force: true });
  if (tarResult.status !== 0) {
    console.error(color.red('  Failed to extract package. Try manually: bun add -g tova@latest'));
    process.exit(1);
  }

  // Create wrapper script at ~/.tova/bin/tova
  const libBin = join(libDir, 'bin', 'tova.js');
  const wrapperScript = `#!/bin/sh\nexec bun "${libBin}" "$@"\n`;
  const binPath = join(binDir, 'tova');
  writeFileSync(binPath, wrapperScript);
  chmodSync(binPath, 0o755);

  // Verify
  console.log('  Verifying...');
  const verifyProc = spawnTar(binPath, ['--version'], { timeout: 10000 });
  if (verifyProc.status !== 0) {
    console.error(color.red('  Verification failed. Try manually: bun add -g tova@latest'));
    process.exit(1);
  }

  console.log(`\n  ${color.green('✓')} Upgraded: v${VERSION} -> ${color.bold('v' + latestVersion)}\n`);
}

function detectPackageManager() {
  if (typeof Bun !== 'undefined') return 'bun';
  const ua = process.env.npm_config_user_agent || '';
  if (ua.includes('pnpm')) return 'pnpm';
  if (ua.includes('yarn')) return 'yarn';
  if (ua.includes('bun')) return 'bun';
  return 'npm';
}
