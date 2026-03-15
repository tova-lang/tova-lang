import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, resolve, basename, relative } from 'path';
import { color, _compatSpawnSync } from './utils.js';
import { VERSION } from '../version.js';
import { resolveConfig } from '../config/resolve.js';

export async function doctorCommand() {
  console.log(`\n  ${color.bold('Tova Doctor')}\n`);

  let allPassed = true;
  let hasWarning = false;

  function pass(label, detail) {
    console.log(`  ${color.green('✓')} ${label.padEnd(22)} ${color.dim(detail)}`);
  }
  function warn(label, detail) {
    console.log(`  ${color.yellow('⚠')} ${label.padEnd(22)} ${color.yellow(detail)}`);
    hasWarning = true;
  }
  function fail(label, detail) {
    console.log(`  ${color.red('✗')} ${label.padEnd(22)} ${color.red(detail)}`);
    allPassed = false;
  }

  // 1. Tova version & location
  const execPath = process.execPath || process.argv[0];
  pass(`Tova v${VERSION}`, execPath);

  // 2. Bun availability
  try {
    const bunProc = _compatSpawnSync('bun', ['--version'], { stdout: 'pipe', stderr: 'pipe', timeout: 10000 });
    const bunVer = (bunProc.stdout || '').toString().trim();
    if ((bunProc.exitCode ?? bunProc.status) === 0 && bunVer) {
      const major = parseInt(bunVer.split('.')[0], 10);
      if (major >= 1) {
        const whichProc = _compatSpawnSync('which', ['bun'], { stdout: 'pipe', stderr: 'pipe', timeout: 5000 });
        pass(`Bun v${bunVer}`, (whichProc.stdout || '').toString().trim());
      } else {
        warn(`Bun v${bunVer}`, 'Bun >= 1.0 recommended');
      }
    } else {
      fail('Bun', 'not found — install from https://bun.sh');
    }
  } catch {
    fail('Bun', 'not found — install from https://bun.sh');
  }

  // 3. PATH configured
  const tovaDir = join(process.env.HOME || '', '.tova', 'bin');
  if ((process.env.PATH || '').includes(tovaDir)) {
    pass('PATH configured', `${tovaDir} in $PATH`);
  } else if (execPath.includes('.tova/bin')) {
    warn('PATH configured', `${tovaDir} not in $PATH`);
  } else {
    pass('PATH configured', 'installed via npm/bun');
  }

  // 4. Shell profile
  const shellName = basename(process.env.SHELL || '');
  let profilePath = '';
  if (shellName === 'zsh') profilePath = join(process.env.HOME || '', '.zshrc');
  else if (shellName === 'bash') profilePath = join(process.env.HOME || '', '.bashrc');
  else if (shellName === 'fish') profilePath = join(process.env.HOME || '', '.config', 'fish', 'conf.d', 'tova.fish');
  else profilePath = join(process.env.HOME || '', '.profile');

  if (profilePath && existsSync(profilePath)) {
    try {
      const profileContent = readFileSync(profilePath, 'utf-8');
      if (profileContent.includes('.tova/bin') || !execPath.includes('.tova/bin')) {
        pass('Shell profile', profilePath);
      } else {
        warn('Shell profile', `${profilePath} missing Tova PATH entry`);
      }
    } catch {
      warn('Shell profile', `could not read ${profilePath}`);
    }
  } else if (!execPath.includes('.tova/bin')) {
    pass('Shell profile', 'installed via npm/bun');
  } else {
    warn('Shell profile', `${profilePath} not found`);
  }

  // 5. git
  try {
    const gitProc = _compatSpawnSync('git', ['--version'], { stdout: 'pipe', stderr: 'pipe', timeout: 10000 });
    if ((gitProc.exitCode ?? gitProc.status) === 0) {
      const gitVer = (gitProc.stdout || '').toString().trim();
      pass('git available', gitVer);
    } else {
      warn('git', 'not found');
    }
  } catch {
    warn('git', 'not found');
  }

  // 6. tova.toml
  const tomlPath = resolve('tova.toml');
  if (existsSync(tomlPath)) {
    pass('tova.toml', 'found in current directory');
  } else {
    warn('No tova.toml', 'not in a Tova project');
  }

  // 7. Build output
  const config = resolveConfig(process.cwd());
  const outDir = resolve(config.build?.output || '.tova-out');
  if (existsSync(outDir)) {
    try {
      const testFile = join(outDir, '.doctor-check');
      writeFileSync(testFile, '');
      rmSync(testFile);
      pass('Build output', `${relative('.', outDir)}/ exists and writable`);
    } catch {
      warn('Build output', `${relative('.', outDir)}/ exists but not writable`);
    }
  } else if (existsSync(tomlPath)) {
    warn('Build output', 'not built yet — run tova build');
  }

  // Summary
  console.log('');
  if (allPassed && !hasWarning) {
    console.log(`  ${color.green('All checks passed.')}\n`);
  } else if (allPassed) {
    console.log(`  ${color.yellow('All checks passed with warnings.')}\n`);
  } else {
    console.log(`  ${color.red('Some checks failed.')}\n`);
    process.exit(1);
  }
}
