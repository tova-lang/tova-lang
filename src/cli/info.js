import { existsSync, readFileSync } from 'fs';
import { resolve, join, relative } from 'path';
import { color, findFiles, _compatSpawnSync } from './utils.js';
import { VERSION } from '../version.js';
import { resolveConfig } from '../config/resolve.js';

export async function infoCommand() {
  const config = resolveConfig(process.cwd());
  const hasTOML = config._source === 'tova.toml';

  console.log(`\n  ╔╦╗╔═╗╦  ╦╔═╗`);
  console.log(`   ║ ║ ║╚╗╔╝╠═╣`);
  console.log(`   ╩ ╚═╝ ╚╝ ╩ ╩  v${VERSION}\n`);

  // Bun version
  let bunVersion = 'not found';
  try {
    const proc = _compatSpawnSync('bun', ['--version'], { stdout: 'pipe', stderr: 'pipe' });
    bunVersion = (proc.stdout || '').toString().trim();
  } catch {}
  console.log(`  Runtime:     Bun v${bunVersion}`);
  console.log(`  Platform:    ${process.platform} ${process.arch}`);
  console.log(`  Node compat: ${process.version}`);

  // Project config
  if (hasTOML) {
    console.log(`\n  Project Config (tova.toml):`);
    if (config.project?.name) console.log(`    Name:        ${config.project.name}`);
    if (config.project?.version) console.log(`    Version:     ${config.project.version}`);
    if (config.project?.entry) console.log(`    Entry:       ${config.project.entry}`);
    if (config.build?.output) console.log(`    Output:      ${config.build.output}`);
    if (config.build?.target) console.log(`    Target:      ${config.build.target}`);
  } else {
    console.log(`\n  No tova.toml found (using defaults).`);
  }

  // Installed dependencies
  const pkgJsonPath = join(process.cwd(), 'package.json');
  if (existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      const deps = Object.keys(pkg.dependencies || {});
      const devDeps = Object.keys(pkg.devDependencies || {});

      if (deps.length > 0 || devDeps.length > 0) {
        console.log(`\n  Dependencies:`);
        for (const dep of deps) {
          console.log(`    ${dep}: ${pkg.dependencies[dep]}`);
        }
        if (devDeps.length > 0) {
          console.log(`  Dev Dependencies:`);
          for (const dep of devDeps) {
            console.log(`    ${dep}: ${pkg.devDependencies[dep]}`);
          }
        }
      } else {
        console.log(`\n  No dependencies installed.`);
      }
    } catch {}
  }

  // Build output status
  const outDir = resolve(config.build?.output || '.tova-out');
  if (existsSync(outDir)) {
    const files = findFiles(outDir, '.js');
    console.log(`\n  Build output: ${relative('.', outDir)}/ (${files.length} file${files.length === 1 ? '' : 's'})`);
  } else {
    console.log(`\n  Build output: not built yet`);
  }

  console.log('');
}
