// Validates that the SSH runner builds the expected ssh/scp/rsync commands
// for each documented deploy action. Uses a capturing executor so no real
// network or filesystem outside /tmp is touched.
//
// Most tests skip the privilege probe by passing a pre-seeded `env` to
// `makeRunner`. Dedicated tests below cover the probe behaviour.

import { describe, test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { makeRunner } from '../src/deploy/ssh-runner.js';

const ROOT_ENV = { isRoot: true, hasSudo: false, sudoPrefix: '' };
const SUDO_ENV = { isRoot: false, hasSudo: true, sudoPrefix: 'sudo ' };

function makeCapturingExecutor() {
  const calls = [];
  return {
    calls,
    exec(cmd, args) {
      calls.push({ cmd, args });
      return { status: 0, stdout: '', stderr: '' };
    },
    inherit(cmd, args) {
      calls.push({ cmd, args });
      return Promise.resolve(0);
    },
  };
}

function baseInfra(overrides = {}) {
  return {
    name: 'prod',
    server: 'deploy@example.com',
    domain: 'example.com',
    instances: 2,
    memory: '512mb',
    branch: 'main',
    health: '/healthz',
    health_interval: 30,
    health_timeout: 5,
    restart_on_failure: true,
    keep_releases: 5,
    env: {},
    databases: [],
    requires: { bun: true, caddy: true, ufw: true },
    hasWebSocket: false,
    hasSSE: false,
    hasBrowser: false,
    requiredSecrets: [],
    blockTypes: [],
    ...overrides,
  };
}

describe('SSH runner: rollback', () => {
  test('runs ssh with a script that swaps the symlink and restarts', async () => {
    const exec = makeCapturingExecutor();
    const runner = makeRunner(exec, { env: ROOT_ENV });
    await runner.rollback(baseInfra());
    expect(exec.calls).toHaveLength(1);
    const [{ cmd, args }] = exec.calls;
    expect(cmd).toBe('ssh');
    expect(args).toContain('deploy@example.com');
    const script = args[args.length - 1];
    expect(script).toContain('cd /opt/tova/apps/prod');
    expect(script).toContain('ls -1t releases');
    expect(script).toContain("ln -sfn \"releases/$PREV\" current");
    expect(script).toContain("systemctl restart 'prod@*.service'");
    // Root user → no sudo prefix
    expect(script).not.toContain('sudo ');
  });

  test('prefixes systemctl with sudo when the SSH user is not root', async () => {
    const exec = makeCapturingExecutor();
    const runner = makeRunner(exec, { env: SUDO_ENV });
    await runner.rollback(baseInfra());
    const script = exec.calls[0].args[exec.calls[0].args.length - 1];
    expect(script).toContain("sudo ln -sfn \"releases/$PREV\" current");
    expect(script).toContain("sudo systemctl restart 'prod@*.service'");
  });

  test('throws if no server is configured', async () => {
    const runner = makeRunner(makeCapturingExecutor(), { env: ROOT_ENV });
    await expect(runner.rollback(baseInfra({ server: null }))).rejects.toThrow(/server/);
  });

  test('throws when the executor reports a non-zero exit', async () => {
    const exec = {
      exec: () => ({ status: 1, stdout: '', stderr: 'boom' }),
      inherit: () => Promise.resolve(1),
    };
    const runner = makeRunner(exec, { env: ROOT_ENV });
    await expect(runner.rollback(baseInfra())).rejects.toThrow(/Rollback failed/);
  });
});

describe('SSH runner: status', () => {
  test('runs systemctl status against the env unit pattern', async () => {
    const exec = makeCapturingExecutor();
    const runner = makeRunner(exec, { env: ROOT_ENV });
    await runner.status(baseInfra());
    expect(exec.calls).toHaveLength(1);
    const script = exec.calls[0].args[exec.calls[0].args.length - 1];
    expect(script).toContain("systemctl status 'prod@*.service'");
    expect(script).toContain('--no-pager');
  });

  test('treats systemctl exit code 3 (inactive) as success', async () => {
    const exec = {
      exec: () => ({ status: 3, stdout: '', stderr: '' }),
      inherit: () => Promise.resolve(0),
    };
    const runner = makeRunner(exec, { env: ROOT_ENV });
    await expect(runner.status(baseInfra())).resolves.toBeUndefined();
  });
});

describe('SSH runner: logs', () => {
  test('runs journalctl for all instances by default', async () => {
    const exec = makeCapturingExecutor();
    const runner = makeRunner(exec, { env: ROOT_ENV });
    await runner.logs(baseInfra());
    expect(exec.calls).toHaveLength(1);
    const { args } = exec.calls[0];
    const script = args[args.length - 1];
    expect(script).toContain("journalctl -u 'prod@*.service'");
    expect(script).toContain("--since '1 hour ago'");
  });

  test('targets a specific instance port when --instance is set', async () => {
    const exec = makeCapturingExecutor();
    const runner = makeRunner(exec, { env: ROOT_ENV });
    await runner.logs(baseInfra(), { instance: 2, since: '5 minutes ago' });
    const script = exec.calls[0].args[exec.calls[0].args.length - 1];
    expect(script).toContain("journalctl -u 'prod@3002.service'");
    expect(script).toContain("--since '5 minutes ago'");
  });
});

describe('SSH runner: ssh (interactive)', () => {
  test('opens an interactive ssh session with no extra command', async () => {
    const exec = makeCapturingExecutor();
    const runner = makeRunner(exec, { env: ROOT_ENV });
    await runner.ssh(baseInfra());
    expect(exec.calls).toHaveLength(1);
    expect(exec.calls[0].cmd).toBe('ssh');
    expect(exec.calls[0].args).toEqual(['deploy@example.com']);
  });
});

describe('SSH runner: setup-git', () => {
  test('initialises a bare repo and writes a post-receive hook', async () => {
    const exec = makeCapturingExecutor();
    const runner = makeRunner(exec, { env: ROOT_ENV });
    await runner.setupGit(baseInfra({ branch: 'release' }));
    const script = exec.calls[0].args[exec.calls[0].args.length - 1];
    expect(script).toContain('git init --bare');
    expect(script).toContain('/opt/tova/apps/prod/repo.git');
    expect(script).toContain("hooks/post-receive");
    expect(script).toContain("systemctl restart 'prod@*.service'");
    expect(script).toContain('git push prod release');
  });
});

describe('SSH runner: remove', () => {
  test('refuses without confirmation', async () => {
    const exec = makeCapturingExecutor();
    const runner = makeRunner(exec, { env: ROOT_ENV });
    await runner.remove(baseInfra(), { confirm: async () => false });
    expect(exec.calls).toHaveLength(0);
  });

  test('runs stop+disable+rm when confirmed', async () => {
    const exec = makeCapturingExecutor();
    const runner = makeRunner(exec, { env: ROOT_ENV });
    await runner.remove(baseInfra(), { confirm: async () => true });
    expect(exec.calls).toHaveLength(1);
    const script = exec.calls[0].args[exec.calls[0].args.length - 1];
    expect(script).toContain("systemctl stop 'prod@*.service'");
    expect(script).toContain("systemctl disable 'prod@*.service'");
    expect(script).toContain('rm -f /etc/systemd/system/prod@.service');
    expect(script).toContain('rm -rf /opt/tova/apps/prod');
  });
});

describe('SSH runner: list', () => {
  test('lists /opt/tova/apps on the server', async () => {
    const exec = makeCapturingExecutor();
    const runner = makeRunner(exec, { env: ROOT_ENV });
    await runner.list(baseInfra());
    expect(exec.calls).toHaveLength(1);
    const script = exec.calls[0].args[exec.calls[0].args.length - 1];
    expect(script).toContain('ls -1 /opt/tova/apps');
  });

  test('uses --server override when provided', async () => {
    const exec = makeCapturingExecutor();
    const runner = makeRunner(exec, { env: ROOT_ENV });
    await runner.list(baseInfra({ server: null }), { server: 'root@other.example.com' });
    expect(exec.calls[0].args).toContain('root@other.example.com');
  });

  test('errors when no server is reachable', async () => {
    const runner = makeRunner(makeCapturingExecutor(), { env: ROOT_ENV });
    await expect(runner.list(baseInfra({ server: null }))).rejects.toThrow(/--list requires --server/);
  });
});

describe('SSH runner: deploy (full)', () => {
  test('uploads provision script, rsyncs build, chowns, flips symlink, prunes', async () => {
    const exec = makeCapturingExecutor();
    const runner = makeRunner(exec, { env: ROOT_ENV });

    const projectDir = mkdtempSync(join(tmpdir(), 'tova-deploy-runner-'));
    const buildOutDir = join(projectDir, '.tova-out');
    mkdirSync(buildOutDir, { recursive: true });
    writeFileSync(join(buildOutDir, 'server.js'), '// stub');

    try {
      await runner.deploy(baseInfra({ keep_releases: 3 }), { projectDir, buildOutDir });
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }

    const cmds = exec.calls.map(c => c.cmd);
    // scp provision, ssh provision, ssh mkdir, rsync build, ssh chown, ssh activate
    expect(cmds).toEqual(['scp', 'ssh', 'ssh', 'rsync', 'ssh', 'ssh']);

    const provScript = exec.calls[1].args[exec.calls[1].args.length - 1];
    expect(provScript).toBe('bash /tmp/tova-provision.sh');

    const mkScript = exec.calls[2].args[exec.calls[2].args.length - 1];
    expect(mkScript).toMatch(/mkdir -p '\/opt\/tova\/apps\/prod\/releases\/\d{8}-\d{6}'/);

    const rsyncArgs = exec.calls[3].args;
    expect(rsyncArgs[0]).toBe('-az');
    expect(rsyncArgs).toContain('--delete');
    expect(rsyncArgs).not.toContain('--rsync-path=sudo rsync'); // root user → no sudo
    expect(rsyncArgs[rsyncArgs.length - 1]).toMatch(/^deploy@example\.com:\/opt\/tova\/apps\/prod\/releases\/\d{8}-\d{6}\/$/);

    const chownScript = exec.calls[4].args[exec.calls[4].args.length - 1];
    expect(chownScript).toContain('chown -R tova:tova /opt/tova/apps/prod');

    const flipScript = exec.calls[5].args[exec.calls[5].args.length - 1];
    expect(flipScript).toContain('ln -sfn');
    expect(flipScript).toContain('/opt/tova/apps/prod/current');
    expect(flipScript).toContain("systemctl restart 'prod@*.service'");
    expect(flipScript).toContain('tail -n +$((3 + 1))');
  });

  test('passes --rsync-path=sudo rsync when the SSH user is not root', async () => {
    const exec = makeCapturingExecutor();
    const runner = makeRunner(exec, { env: SUDO_ENV });

    const projectDir = mkdtempSync(join(tmpdir(), 'tova-deploy-runner-'));
    const buildOutDir = join(projectDir, '.tova-out');
    mkdirSync(buildOutDir, { recursive: true });
    writeFileSync(join(buildOutDir, 'server.js'), '// stub');

    try {
      await runner.deploy(baseInfra(), { projectDir, buildOutDir });
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }

    const rsyncCall = exec.calls.find(c => c.cmd === 'rsync');
    expect(rsyncCall.args).toContain('--rsync-path=sudo rsync');

    // mkdir, chown, ln, systemctl all carry the sudo prefix in this mode
    const mkScript = exec.calls[2].args[exec.calls[2].args.length - 1];
    expect(mkScript).toContain("sudo mkdir -p");
    const chownScript = exec.calls[4].args[exec.calls[4].args.length - 1];
    expect(chownScript).toContain('sudo chown -R tova:tova');
    const flipScript = exec.calls[5].args[exec.calls[5].args.length - 1];
    expect(flipScript).toContain('sudo ln -sfn');
    expect(flipScript).toContain("sudo systemctl restart 'prod@*.service'");
  });

  test('throws when build output directory is missing', async () => {
    const exec = makeCapturingExecutor();
    const runner = makeRunner(exec, { env: ROOT_ENV });
    const projectDir = mkdtempSync(join(tmpdir(), 'tova-deploy-runner-'));
    try {
      await expect(runner.deploy(baseInfra(), { projectDir, buildOutDir: join(projectDir, 'missing') }))
        .rejects.toThrow(/Build output directory not found/);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

describe('SSH runner: privilege probe', () => {
  test('detects a root user from `id -u` output', async () => {
    const calls = [];
    const exec = {
      exec(cmd, args) {
        calls.push({ cmd, args });
        if (calls.length === 1) return { status: 0, stdout: 'uid:0;sudo:no\n', stderr: '' };
        return { status: 0, stdout: '', stderr: '' };
      },
      inherit: () => Promise.resolve(0),
    };
    const runner = makeRunner(exec); // no env → must probe
    await runner.status(baseInfra());

    expect(calls).toHaveLength(2);
    expect(calls[0].args[calls[0].args.length - 1]).toMatch(/printf "uid:%s;sudo:%s/);
    // No sudo prefix in the actual command since uid=0
    expect(calls[1].args[calls[1].args.length - 1]).not.toContain('sudo ');
  });

  test('detects a non-root user with sudo and applies the prefix', async () => {
    const calls = [];
    const exec = {
      exec(cmd, args) {
        calls.push({ cmd, args });
        if (calls.length === 1) return { status: 0, stdout: 'uid:1000;sudo:yes\n', stderr: '' };
        return { status: 0, stdout: '', stderr: '' };
      },
      inherit: () => Promise.resolve(0),
    };
    const runner = makeRunner(exec);
    await runner.status(baseInfra());

    expect(calls[1].args[calls[1].args.length - 1]).toContain('sudo systemctl status');
  });

  test('refuses to deploy when the user is non-root and sudo is missing', async () => {
    const exec = {
      exec: () => ({ status: 0, stdout: 'uid:1000;sudo:no\n', stderr: '' }),
      inherit: () => Promise.resolve(0),
    };
    const runner = makeRunner(exec);
    await expect(runner.status(baseInfra())).rejects.toThrow(/not root and sudo is not installed/);
  });

  test('caches the probe result across multiple actions', async () => {
    const calls = [];
    const exec = {
      exec(cmd, args) {
        calls.push({ cmd, args });
        if (calls.length === 1) return { status: 0, stdout: 'uid:0;sudo:no\n', stderr: '' };
        return { status: 0, stdout: '', stderr: '' };
      },
      inherit: () => Promise.resolve(0),
    };
    const runner = makeRunner(exec);
    await runner.status(baseInfra());
    await runner.rollback(baseInfra());
    // 1 probe + 2 actions = 3 ssh calls. Only one probe.
    const probes = calls.filter(c => c.args[c.args.length - 1].includes('printf "uid'));
    expect(probes).toHaveLength(1);
  });

  test('surfaces SSH connection failures from the probe', async () => {
    const exec = {
      exec: () => ({ status: 255, stdout: '', stderr: 'ssh: Could not resolve hostname' }),
      inherit: () => Promise.resolve(0),
    };
    const runner = makeRunner(exec);
    await expect(runner.status(baseInfra())).rejects.toThrow(/Cannot reach/);
  });
});
