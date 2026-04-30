// SSH/scp/rsync runner for the Tova deploy command.
//
// The runner is split from the orchestrator so tests can exercise the
// orchestrator with a no-op runner while the CLI plugs in a real one. A
// dry-run runner prints commands instead of executing them — useful for
// verifying without a reachable server.
//
// Before running any privileged action, the runner probes the SSH user once
// to decide whether commands need a `sudo ` prefix. The result is cached for
// the lifetime of the runner instance. Tests can pre-seed this via
// `makeRunner(executor, { env: { ... } })` to skip the probe.

import { spawn, spawnSync } from 'child_process';
import { writeFileSync, mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateProvisionScript } from './provision.js';

// ── Executors ───────────────────────────────────────────────

export const realExecutor = {
  exec(cmd, args, opts = {}) {
    const result = spawnSync(cmd, args, { encoding: 'utf-8', ...opts });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return result;
  },
  inherit(cmd, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: 'inherit' });
      child.on('close', code => code === 0 ? resolve(0) : reject(new Error(`${cmd} exited with code ${code}`)));
      child.on('error', reject);
    });
  },
};

export function makeDryRunExecutor() {
  return {
    log: [],
    exec(cmd, args) {
      const line = `${cmd} ${args.map(quote).join(' ')}`;
      this.log.push(line);
      console.log('  [dry-run] ' + line);
      // Empty stdout signals to probeRemote that this is a dry-run, so it
      // returns the typical "non-root + sudo" environment for the preview.
      return { status: 0, stdout: '', stderr: '' };
    },
    inherit(cmd, args) {
      const line = `${cmd} ${args.map(quote).join(' ')}`;
      this.log.push(line);
      console.log('  [dry-run] ' + line);
      return Promise.resolve(0);
    },
  };
}

function quote(s) {
  if (s === '' || /[\s'"$`\\!*?(){}|<>;&]/.test(s)) {
    return `'${String(s).replace(/'/g, `'\\''`)}'`;
  }
  return s;
}

// ── SSH primitives ──────────────────────────────────────────

function ssh(executor, server, command) {
  return executor.exec('ssh', ['-o', 'BatchMode=yes', server, command]);
}

function scp(executor, localPath, server, remotePath) {
  return executor.exec('scp', ['-o', 'BatchMode=yes', localPath, `${server}:${remotePath}`]);
}

function rsyncDir(executor, localDir, server, remotePath, useSudo) {
  const args = ['-az', '--delete', '-e', 'ssh -o BatchMode=yes'];
  // Run rsync as root on the remote when the SSH user isn't already root,
  // so we can write under /opt/tova/apps. Requires passwordless sudo for
  // rsync on the server side.
  if (useSudo) args.push('--rsync-path=sudo rsync');
  args.push(`${localDir}/`, `${server}:${remotePath}/`);
  return executor.exec('rsync', args);
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

// ── Privilege probe ─────────────────────────────────────────

// Returns { isRoot, hasSudo, sudoPrefix }. Throws on connection failure or
// when the remote is unprivileged and lacks sudo.
async function probeRemote(executor, server) {
  const probe = 'printf "uid:%s;sudo:%s\\n" "$(id -u)" "$(command -v sudo >/dev/null 2>&1 && echo yes || echo no)"';
  const r = executor.exec('ssh', ['-o', 'BatchMode=yes', server, probe]);
  const stdout = (r.stdout || '').trim();

  // Empty output AND zero exit → dry-run executor: assume the typical case
  // (non-root with sudo) so the preview shows realistic commands.
  if (!stdout && r.status === 0) {
    return { isRoot: false, hasSudo: true, sudoPrefix: 'sudo ' };
  }

  if (r.status !== 0) {
    throw new Error(`Cannot reach ${server}: ${(r.stderr || '').trim() || `ssh exited ${r.status}`}`);
  }

  const uidMatch = stdout.match(/uid:(\d+)/);
  const sudoMatch = stdout.match(/sudo:(yes|no)/);
  const uid = uidMatch ? parseInt(uidMatch[1], 10) : null;
  const hasSudo = sudoMatch ? sudoMatch[1] === 'yes' : false;

  if (uid !== 0 && !hasSudo) {
    throw new Error(`${server}: SSH user is not root and sudo is not installed — cannot deploy`);
  }

  return {
    isRoot: uid === 0,
    hasSudo,
    sudoPrefix: uid === 0 ? '' : 'sudo ',
  };
}

// ── Runner ──────────────────────────────────────────────────

export function makeRunner(executor = realExecutor, options = {}) {
  // Cached privilege info for this runner instance — populated lazily.
  let _env = options.env || null;

  async function ensureEnv(infra) {
    if (_env) return _env;
    _env = await probeRemote(executor, infra.server);
    return _env;
  }

  return {
    async rollback(infra) {
      requireServer(infra);
      const { sudoPrefix } = await ensureEnv(infra);
      const name = infra.name;
      const cmd = `set -e
cd /opt/tova/apps/${name}
PREV=$(ls -1t releases 2>/dev/null | sed -n '2p')
if [ -z "$PREV" ]; then
  echo "No previous release available to roll back to" >&2
  exit 1
fi
${sudoPrefix}ln -sfn "releases/$PREV" current
${sudoPrefix}systemctl restart '${name}@*.service'
echo "Rolled back to releases/$PREV"`;
      const r = ssh(executor, infra.server, cmd);
      if (r.status !== 0) throw new Error(`Rollback failed (exit ${r.status})`);
    },

    async status(infra) {
      requireServer(infra);
      const { sudoPrefix } = await ensureEnv(infra);
      const r = ssh(executor, infra.server, `${sudoPrefix}systemctl status '${infra.name}@*.service' --no-pager`);
      if (r.status !== 0 && r.status !== 3) {
        throw new Error(`Status check failed (exit ${r.status})`);
      }
    },

    async logs(infra, { since = '1 hour ago', instance = null } = {}) {
      requireServer(infra);
      const { sudoPrefix } = await ensureEnv(infra);
      const unit = instance != null
        ? `${infra.name}@${3000 + Number(instance)}.service`
        : `${infra.name}@*.service`;
      // journalctl typically requires root or membership in the systemd-journal
      // group to read other users' units, so prefix with sudo when needed.
      return executor.inherit('ssh', [
        '-o', 'BatchMode=yes',
        infra.server,
        `${sudoPrefix}journalctl -u '${unit}' --no-pager --since '${since}'`,
      ]);
    },

    async ssh(infra) {
      requireServer(infra);
      return executor.inherit('ssh', [infra.server]);
    },

    async setupGit(infra) {
      requireServer(infra);
      const { sudoPrefix } = await ensureEnv(infra);
      const name = infra.name;
      const cmd = `set -e
REPO=/opt/tova/apps/${name}/repo.git
${sudoPrefix}mkdir -p "$(dirname "$REPO")"
if [ ! -d "$REPO" ]; then
  ${sudoPrefix}git init --bare "$REPO"
fi
${sudoPrefix}tee "$REPO/hooks/post-receive" >/dev/null <<'HOOK'
#!/bin/bash
set -e
TARGET=/opt/tova/apps/${name}/source
mkdir -p "$TARGET"
GIT_WORK_TREE="$TARGET" git checkout -f
cd "$TARGET"
if [ -f package.json ] || [ -f tova.toml ]; then
  /home/tova/.bun/bin/bun install --silent || true
  /home/tova/.bun/bin/bun /home/tova/.bun/bin/tova build --production --quiet || true
fi
systemctl restart '${name}@*.service' || true
HOOK
${sudoPrefix}chmod +x "$REPO/hooks/post-receive"
${sudoPrefix}chown -R tova:tova "$REPO"
echo "Configured. Add the remote with:"
echo "  git remote add ${name} ${infra.server}:$REPO"
echo "Then deploy with:"
echo "  git push ${name} ${infra.branch || 'main'}"`;
      const r = ssh(executor, infra.server, cmd);
      if (r.status !== 0) throw new Error(`setup-git failed (exit ${r.status})`);
    },

    async remove(infra, { confirm = null } = {}) {
      requireServer(infra);
      if (confirm !== null) {
        const ok = await confirm(`This will permanently delete /opt/tova/apps/${infra.name} on ${infra.server}.`);
        if (!ok) {
          console.log('  Aborted.');
          return;
        }
      }
      const { sudoPrefix } = await ensureEnv(infra);
      const name = infra.name;
      const cmd = `set -e
${sudoPrefix}systemctl stop '${name}@*.service' 2>/dev/null || true
${sudoPrefix}systemctl disable '${name}@*.service' 2>/dev/null || true
${sudoPrefix}rm -f /etc/systemd/system/${name}@.service
${sudoPrefix}systemctl daemon-reload
${sudoPrefix}rm -rf /opt/tova/apps/${name}
echo "Removed deployment ${name}"`;
      const r = ssh(executor, infra.server, cmd);
      if (r.status !== 0) throw new Error(`Remove failed (exit ${r.status})`);
    },

    async list(infra, { server = null } = {}) {
      const target = server || infra.server;
      if (!target) throw new Error('--list requires --server <user@host> when no deploy block is loaded');
      // /opt/tova/apps is created world-readable by the provisioner, so no
      // sudo is needed for `ls`.
      const r = ssh(executor, target, 'if [ -d /opt/tova/apps ]; then ls -1 /opt/tova/apps; else echo "(none)"; fi');
      if (r.status !== 0) throw new Error(`List failed (exit ${r.status})`);
    },

    async deploy(infra, { projectDir, buildOutDir = null, buildProject = null } = {}) {
      requireServer(infra);
      const { sudoPrefix, isRoot } = await ensureEnv(infra);
      const name = infra.name;

      // Step 1 — produce a build to ship
      const outDir = buildOutDir || join(projectDir, '.tova-out');
      if (buildProject) {
        console.log('  Building project...');
        const origCwd = process.cwd();
        process.chdir(projectDir);
        try {
          await buildProject(['--production', '--quiet']);
        } finally {
          process.chdir(origCwd);
        }
      }
      if (!existsSync(outDir)) {
        throw new Error(`Build output directory not found: ${outDir}`);
      }

      // Step 2 — write provisioning script to a temp dir
      const tmp = mkdtempSync(join(tmpdir(), 'tova-deploy-'));
      const scriptPath = join(tmp, 'provision.sh');
      writeFileSync(scriptPath, generateProvisionScript(infra));

      try {
        // Step 3 — provision (idempotent)
        console.log(`  Provisioning ${infra.server}...`);
        const upScript = scp(executor, scriptPath, infra.server, '/tmp/tova-provision.sh');
        if (upScript.status !== 0) throw new Error('Failed to upload provision script');
        // bash explicitly so the script runs on shells without /bin/bash as login shell
        const provR = ssh(executor, infra.server, 'bash /tmp/tova-provision.sh');
        if (provR.status !== 0) throw new Error(`Provisioning failed (exit ${provR.status})`);

        // Step 4 — upload the new release
        const ts = timestamp();
        const releasePath = `/opt/tova/apps/${name}/releases/${ts}`;
        console.log(`  Uploading release ${ts}...`);
        const mk = ssh(
          executor,
          infra.server,
          `${sudoPrefix}mkdir -p '${releasePath}'`,
        );
        if (mk.status !== 0) throw new Error('Failed to create release directory');
        const sync = rsyncDir(executor, outDir, infra.server, releasePath, !isRoot);
        if (sync.status !== 0) throw new Error('rsync failed');

        // Step 5 — re-chown after rsync. rsync writes files as the SSH user;
        // the systemd unit runs as `User=tova` and needs write access to the
        // working directory for things like SQLite databases or log rotation.
        const chown = ssh(
          executor,
          infra.server,
          `${sudoPrefix}chown -R tova:tova /opt/tova/apps/${name}`,
        );
        if (chown.status !== 0) throw new Error('Failed to chown release directory');

        // Step 6 — flip the symlink, restart, prune old releases
        const keep = infra.keep_releases || 5;
        const flip = `set -e
${sudoPrefix}ln -sfn '${releasePath}' /opt/tova/apps/${name}/current
${sudoPrefix}systemctl restart '${name}@*.service'
cd /opt/tova/apps/${name}/releases
ls -1t | tail -n +$((${keep} + 1)) | xargs -r ${sudoPrefix}rm -rf
echo "Activated release ${ts}"`;
        const flipR = ssh(executor, infra.server, flip);
        if (flipR.status !== 0) throw new Error('Activation failed');

        console.log(`  Deployed ${name} (release ${ts})`);
      } finally {
        try { rmSync(tmp, { recursive: true, force: true }); } catch {}
      }
    },
  };
}

function requireServer(infra) {
  if (!infra || !infra.server) {
    throw new Error('Deploy block has no `server` field');
  }
}
