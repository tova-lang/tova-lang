// src/cli/package.js — Package management commands
import { basename, join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';
import { spawn } from 'child_process';
import { color } from './utils.js';
import { resolveConfig } from '../config/resolve.js';
import { writePackageJson } from '../config/package-json.js';
import { addToSection, removeFromSection } from '../config/edit-toml.js';
import { stringifyTOML } from '../config/toml.js';
import { VERSION } from '../version.js';

// ─── Init (in-place) ────────────────────────────────────────

export function initProject() {
  const projectDir = process.cwd();
  const name = basename(projectDir);

  if (existsSync(join(projectDir, 'tova.toml'))) {
    console.error('Error: tova.toml already exists in this directory');
    process.exit(1);
  }

  console.log(`\n  Initializing Tova project: ${name}\n`);

  // tova.toml
  const tomlContent = stringifyTOML({
    project: {
      name,
      version: '0.1.0',
      description: '',
      entry: 'src',
    },
    build: {
      output: '.tova-out',
    },
    dev: {
      port: 3000,
    },
    dependencies: {},
    npm: {},
  });
  writeFileSync(join(projectDir, 'tova.toml'), tomlContent);
  console.log('  \u2713 Created tova.toml');

  // src/ directory
  mkdirSync(join(projectDir, 'src'), { recursive: true });

  // .gitignore (only if missing)
  const gitignorePath = join(projectDir, '.gitignore');
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `node_modules/
.tova-out/
package.json
bun.lock
*.db
*.db-shm
*.db-wal
`);
    console.log('  \u2713 Created .gitignore');
  }

  // Starter app.tova (only if src/ has no .tova files)
  const srcDir = join(projectDir, 'src');
  const existingTova = existsSync(srcDir) ? readdirSync(srcDir).filter(f => f.endsWith('.tova')) : [];
  if (existingTova.length === 0) {
    writeFileSync(join(srcDir, 'app.tova'), `// ${name} \u2014 Built with Tova

shared {
  type Message {
    text: String
  }
}

server {
  fn get_message() -> Message {
    Message("Hello from Tova!")
  }

  route GET "/api/message" => get_message
}

browser {
  state message = ""

  effect {
    result = server.get_message()
    message = result.text
  }

  component App {
    <div class="app">
      <h1>"{message}"</h1>
      <p>"Edit src/app.tova to get started."</p>
    </div>
  }
}
`);
    console.log('  \u2713 Created src/app.tova');
  }

  console.log(`\n  Project initialized. Run 'tova dev' to start.\n`);
}

// ─── Package Management ─────────────────────────────────────

export async function installDeps() {
  const cwd = process.cwd();
  const config = resolveConfig(cwd);

  if (config._source !== 'tova.toml') {
    // No tova.toml — just run bun install as normal
    console.log('  No tova.toml found, running bun install...\n');
    const proc = spawn('bun', ['install'], { stdio: 'inherit', cwd });
    const code = await new Promise(res => proc.on('close', res));
    process.exit(code);
    return;
  }

  // Resolve Tova module dependencies (if any)
  const tovaDeps = config.dependencies || {};
  const { isTovModule: _isTovMod, expandBlessedPackage: _expandBlessed } = await import('../config/module-path.js');

  // Expand blessed package shorthands (e.g., tova/data → github.com/tova-lang/data)
  const expandedTovaDeps = {};
  for (const [k, v] of Object.entries(tovaDeps)) {
    const expanded = _expandBlessed(k);
    expandedTovaDeps[expanded || k] = v;
  }

  const tovModuleKeys = Object.keys(expandedTovaDeps).filter(k => _isTovMod(k));

  if (tovModuleKeys.length > 0) {
    const { resolveDependencies } = await import('../config/resolver.js');
    const { listRemoteTags, fetchModule, getCommitSha } = await import('../config/git-resolver.js');
    const { isVersionCached, getModuleCachePath } = await import('../config/module-cache.js');
    const { readLockFile, writeLockFile } = await import('../config/lock-file.js');

    console.log('  Resolving Tova dependencies...');

    const lock = readLockFile(cwd);
    const tovaModuleDeps = {};
    for (const k of tovModuleKeys) {
      tovaModuleDeps[k] = expandedTovaDeps[k];
    }

    try {
      const { resolved, npmDeps } = await resolveDependencies(tovaModuleDeps, {
        getAvailableVersions: async (mod) => {
          if (lock?.modules?.[mod]) return [lock.modules[mod].version];
          const tags = await listRemoteTags(mod);
          return tags.map(t => t.version);
        },
        getModuleConfig: async (mod, version) => {
          if (!isVersionCached(mod, version)) {
            console.log(`  Fetching ${mod}@v${version}...`);
            await fetchModule(mod, version);
          }
          const modPath = getModuleCachePath(mod, version);
          try {
            return resolveConfig(modPath);
          } catch { return null; }
        },
        getVersionSha: async (mod, version) => {
          if (lock?.modules?.[mod]?.sha) return lock.modules[mod].sha;
          return await getCommitSha(mod, version);
        },
      });

      writeLockFile(cwd, resolved, npmDeps);
      console.log(`  Resolved ${Object.keys(resolved).length} Tova module(s)`);

      // Merge transitive npm deps into config for package.json generation
      if (Object.keys(npmDeps).length > 0) {
        if (!config.npm) config.npm = {};
        if (!config.npm.prod) config.npm.prod = {};
        Object.assign(config.npm.prod, npmDeps);
      }
    } catch (err) {
      console.error(`  Failed to resolve Tova dependencies: ${err.message}`);
    }
  }

  // Generate shadow package.json from tova.toml
  const wrote = writePackageJson(config, cwd);
  if (wrote) {
    console.log('  Generated package.json from tova.toml');
    const proc = spawn('bun', ['install'], { stdio: 'inherit', cwd });
    const code = await new Promise(res => proc.on('close', res));
    process.exit(code);
  } else {
    if (tovModuleKeys.length === 0) {
      console.log('  No npm dependencies in tova.toml. Nothing to install.\n');
    }
  }
}

export async function addDep(args) {
  const isDev = args.includes('--dev');
  const pkg = args.find(a => !a.startsWith('--'));

  if (!pkg) {
    console.error('Error: No package specified');
    console.error('Usage: tova add <package> [--dev]');
    console.error('       tova add npm:<package>   \u2014 add an npm package');
    console.error('       tova add <tova-package>  \u2014 add a Tova package (local path or git URL)');
    process.exit(1);
  }

  const cwd = process.cwd();
  const tomlPath = join(cwd, 'tova.toml');

  if (!existsSync(tomlPath)) {
    console.error('Error: No tova.toml found in current directory');
    console.error('Run `tova new <name>` to create a new project, or create tova.toml manually.');
    process.exit(1);
  }

  // Determine if this is an npm package or a Tova native dependency
  const isNpm = pkg.startsWith('npm:');
  const actualPkg = isNpm ? pkg.slice(4) : pkg;

  if (isNpm) {
    // npm package handling (existing behavior)
    let name = actualPkg;
    let version = 'latest';
    if (actualPkg.includes('@') && !actualPkg.startsWith('@')) {
      const atIdx = actualPkg.lastIndexOf('@');
      name = actualPkg.slice(0, atIdx);
      version = actualPkg.slice(atIdx + 1);
    } else if (actualPkg.startsWith('@') && actualPkg.includes('@', 1)) {
      const atIdx = actualPkg.lastIndexOf('@');
      name = actualPkg.slice(0, atIdx);
      version = actualPkg.slice(atIdx + 1);
    }

    if (version === 'latest') {
      try {
        const proc = spawn('npm', ['view', name, 'version'], { stdio: ['pipe', 'pipe', 'pipe'] });
        let out = '';
        proc.stdout.on('data', d => out += d);
        const code = await new Promise(res => proc.on('close', res));
        if (code === 0 && out.trim()) {
          version = `^${out.trim()}`;
        } else {
          version = '*';
        }
      } catch {
        version = '*';
      }
    }

    const section = isDev ? 'npm.dev' : 'npm';
    addToSection(tomlPath, section, name, version);
    console.log(`  Added ${name}@${version} to [${section}] in tova.toml`);
    await installDeps();
  } else {
    // Tova native dependency
    const { isTovModule: isTovMod, expandBlessedPackage } = await import('../config/module-path.js');

    // Parse potential @version suffix
    let pkgName = actualPkg;
    let versionConstraint = null;
    if (pkgName.includes('@') && !pkgName.startsWith('@')) {
      const atIdx = pkgName.lastIndexOf('@');
      versionConstraint = pkgName.slice(atIdx + 1);
      pkgName = pkgName.slice(0, atIdx);
    }

    // Expand blessed package shorthand: tova/data → github.com/tova-lang/data
    const expandedPkg = expandBlessedPackage(pkgName);
    const resolvedPkg = expandedPkg || pkgName;

    if (isTovMod(pkgName)) {
      // Tova module: fetch tags, pick version, add to [dependencies]
      const { listRemoteTags, pickLatestTag } = await import('../config/git-resolver.js');
      try {
        const tags = await listRemoteTags(resolvedPkg);
        if (tags.length === 0) {
          console.error(`  No version tags found for ${resolvedPkg}`);
          process.exit(1);
        }
        if (!versionConstraint) {
          const latest = pickLatestTag(tags);
          versionConstraint = `^${latest.version}`;
        }
        addToSection(tomlPath, 'dependencies', `"${resolvedPkg}"`, versionConstraint);
        console.log(`  Added ${resolvedPkg}@${versionConstraint} to [dependencies] in tova.toml`);
        await installDeps();
      } catch (err) {
        console.error(`  Failed to add ${pkgName}: ${err.message}`);
        process.exit(1);
      }
      return;
    }

    // Local path or generic dependency
    let name = pkgName;
    let source = pkgName;

    // Detect source type
    if (pkgName.startsWith('file:') || pkgName.startsWith('./') || pkgName.startsWith('../') || pkgName.startsWith('/')) {
      // Local path dependency
      source = pkgName.startsWith('file:') ? pkgName : `file:${pkgName}`;
      name = basename(pkgName.replace(/^file:/, ''));
    } else if (pkgName.startsWith('git:') || pkgName.includes('.git')) {
      // Git dependency
      source = pkgName.startsWith('git:') ? pkgName : `git:${pkgName}`;
      name = basename(pkgName.replace(/\.git$/, '').replace(/^git:/, ''));
    } else {
      // Tova registry package (future: for now, just store the name)
      source = versionConstraint || `*`;
    }

    addToSection(tomlPath, 'dependencies', name, source);
    console.log(`  Added ${name} = "${source}" to [dependencies] in tova.toml`);

    // Generate lock file
    generateLockFile(cwd);
  }
}

function generateLockFile(cwd) {
  const config = resolveConfig(cwd);
  const deps = config.dependencies || {};
  const npmProd = config.npm?.prod || {};
  const npmDev = config.npm?.dev || {};

  const lock = {
    version: 1,
    generated: new Date().toISOString(),
    dependencies: {},
    npm: {},
  };

  for (const [name, source] of Object.entries(deps)) {
    lock.dependencies[name] = {
      source,
      resolved: source, // For now, resolved = source
    };
  }

  for (const [name, version] of Object.entries(npmProd)) {
    lock.npm[name] = { version, dev: false };
  }
  for (const [name, version] of Object.entries(npmDev)) {
    lock.npm[name] = { version, dev: true };
  }

  const lockPath = join(cwd, 'tova.lock');
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
}

export async function removeDep(pkg) {
  if (!pkg) {
    console.error('Error: No package specified');
    console.error('Usage: tova remove <package>');
    process.exit(1);
  }

  const cwd = process.cwd();
  const tomlPath = join(cwd, 'tova.toml');

  if (!existsSync(tomlPath)) {
    console.error('Error: No tova.toml found in current directory');
    process.exit(1);
  }

  // Try removing from [dependencies], [npm], or [npm.dev]
  const removed = removeFromSection(tomlPath, 'dependencies', pkg) ||
                  removeFromSection(tomlPath, 'npm', pkg) ||
                  removeFromSection(tomlPath, 'npm.dev', pkg);

  if (removed) {
    console.log(`  Removed ${pkg} from tova.toml`);
    await installDeps();
  } else {
    console.error(`  Package '${pkg}' not found in tova.toml`);
    process.exit(1);
  }
}

// ─── Update (inline from main switch) ────────────────────────

export async function updateDeps(args) {
  const updatePkg = args[1] || null;
  const updateConfig = resolveConfig(process.cwd());
  const updateDepsMap = updatePkg
    ? { [updatePkg]: updateConfig.dependencies?.[updatePkg] || '*' }
    : updateConfig.dependencies || {};

  if (Object.keys(updateDepsMap).length === 0) {
    console.log('  No Tova dependencies to update.');
    return;
  }

  console.log('  Checking for updates...');
  // Delete lock file to force fresh resolution
  const lockPath = join(process.cwd(), 'tova.lock');
  if (existsSync(lockPath)) {
    rmSync(lockPath);
  }
  await installDeps();
}

// ─── Cache (inline from main switch) ─────────────────────────

export async function cacheCommand(args) {
  const subCmd = args[1] || 'list';
  const { getCacheDir } = await import('../config/module-cache.js');
  const cacheDir = getCacheDir();

  if (subCmd === 'path') {
    console.log(cacheDir);
  } else if (subCmd === 'list') {
    console.log(`  Cache: ${cacheDir}\n`);
    if (existsSync(cacheDir)) {
      try {
        const hosts = readdirSync(cacheDir).filter(h => !h.startsWith('.'));
        let found = false;
        for (const host of hosts) {
          const hostPath = join(cacheDir, host);
          if (!statSync(hostPath).isDirectory()) continue;
          const owners = readdirSync(hostPath);
          for (const owner of owners) {
            const ownerPath = join(hostPath, owner);
            if (!statSync(ownerPath).isDirectory()) continue;
            const repos = readdirSync(ownerPath);
            for (const repo of repos) {
              const repoPath = join(ownerPath, repo);
              if (!statSync(repoPath).isDirectory()) continue;
              const versions = readdirSync(repoPath).filter(v => v.startsWith('v'));
              console.log(`  ${host}/${owner}/${repo}: ${versions.join(', ') || '(empty)'}`);
              found = true;
            }
          }
        }
        if (!found) console.log('  (empty)');
      } catch { console.log('  (empty)'); }
    } else {
      console.log('  (empty)');
    }
  } else if (subCmd === 'clean') {
    if (existsSync(cacheDir)) {
      rmSync(cacheDir, { recursive: true, force: true });
    }
    console.log('  Cache cleared.');
  } else {
    console.error(`  Unknown cache subcommand: ${subCmd}`);
    console.error('  Usage: tova cache [list|path|clean]');
    process.exit(1);
  }
}
