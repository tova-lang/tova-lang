import { describe, test, expect, setDefaultTimeout, beforeAll, afterAll } from 'bun:test';

setDefaultTimeout(60000);
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const TOVA = path.join(__dirname, '..', 'bin', 'tova.js');

function runTova(args, opts = {}) {
  const timeout = 15000;
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = spawnSync('bun', [TOVA, ...args], {
      encoding: 'utf-8', timeout, ...opts,
    });
    if (result.status === null && attempt < maxAttempts) continue;
    return result;
  }
}

// ─── Direct import tests for parseDeployArgs ─────────────────────

// Import the internal functions from the deploy module directly
import { parseDeployArgs, printPlan, deploy } from '../src/deploy/deploy.js';

describe('cli-deploy: parseDeployArgs', () => {
  test('parses environment name as first positional arg', () => {
    const result = parseDeployArgs(['prod']);
    expect(result.envName).toBe('prod');
    expect(result.plan).toBe(false);
    expect(result.rollback).toBe(false);
    expect(result.logs).toBe(false);
    expect(result.status).toBe(false);
  });

  test('parses --plan flag', () => {
    const result = parseDeployArgs(['prod', '--plan']);
    expect(result.envName).toBe('prod');
    expect(result.plan).toBe(true);
  });

  test('parses --rollback flag', () => {
    const result = parseDeployArgs(['staging', '--rollback']);
    expect(result.envName).toBe('staging');
    expect(result.rollback).toBe(true);
  });

  test('parses --logs flag', () => {
    const result = parseDeployArgs(['prod', '--logs']);
    expect(result.envName).toBe('prod');
    expect(result.logs).toBe(true);
  });

  test('parses --status flag', () => {
    const result = parseDeployArgs(['prod', '--status']);
    expect(result.envName).toBe('prod');
    expect(result.status).toBe(true);
  });

  test('parses --ssh flag', () => {
    const result = parseDeployArgs(['prod', '--ssh']);
    expect(result.envName).toBe('prod');
    expect(result.ssh).toBe(true);
  });

  test('parses --setup-git flag', () => {
    const result = parseDeployArgs(['prod', '--setup-git']);
    expect(result.envName).toBe('prod');
    expect(result.setupGit).toBe(true);
  });

  test('parses --remove flag', () => {
    const result = parseDeployArgs(['prod', '--remove']);
    expect(result.envName).toBe('prod');
    expect(result.remove).toBe(true);
  });

  test('parses --list flag without env name', () => {
    const result = parseDeployArgs(['--list']);
    expect(result.envName).toBe(null);
    expect(result.list).toBe(true);
  });

  test('parses --list with --server', () => {
    const result = parseDeployArgs(['--list', '--server', 'root@example.com']);
    expect(result.list).toBe(true);
    expect(result.server).toBe('root@example.com');
  });

  test('parses --since value', () => {
    const result = parseDeployArgs(['prod', '--logs', '--since', '1 hour ago']);
    expect(result.logs).toBe(true);
    expect(result.since).toBe('1 hour ago');
  });

  test('parses --instance value as integer', () => {
    const result = parseDeployArgs(['prod', '--logs', '--instance', '3']);
    expect(result.logs).toBe(true);
    expect(result.instance).toBe(3);
  });

  test('empty args produce null envName and all false flags', () => {
    const result = parseDeployArgs([]);
    expect(result.envName).toBe(null);
    expect(result.plan).toBe(false);
    expect(result.rollback).toBe(false);
    expect(result.logs).toBe(false);
    expect(result.status).toBe(false);
    expect(result.ssh).toBe(false);
    expect(result.setupGit).toBe(false);
    expect(result.remove).toBe(false);
    expect(result.list).toBe(false);
    expect(result.server).toBe(null);
    expect(result.since).toBe(null);
    expect(result.instance).toBe(null);
  });

  test('multiple flags can be combined', () => {
    const result = parseDeployArgs(['prod', '--plan', '--status']);
    expect(result.envName).toBe('prod');
    expect(result.plan).toBe(true);
    expect(result.status).toBe(true);
  });

  test('ignores unknown flags and uses first positional as envName', () => {
    const result = parseDeployArgs(['myenv', '--unknown-flag']);
    expect(result.envName).toBe('myenv');
  });

  test('only first positional arg is used as envName', () => {
    const result = parseDeployArgs(['prod', 'extra']);
    expect(result.envName).toBe('prod');
  });
});

// ─── CLI invocation tests ────────────────────────────────────────

describe('cli-deploy: CLI invocation', () => {
  // Create a temp project with a deploy block so the CLI has something to parse
  let fixtureDir;
  beforeAll(() => {
    fixtureDir = mkdtempSync(path.join(tmpdir(), 'tova-deploy-cli-'));
    writeFileSync(path.join(fixtureDir, 'app.tova'), `
server {
  route GET "/healthz" => fn() { "ok" }
}

deploy "prod" {
  server: "root@example.com"
  domain: "example.com"
}

deploy "staging" {
  server: "root@staging.example.com"
  domain: "staging.example.com"
}
`);
  });

  afterAll(() => {
    if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
  });

  test('tova deploy with no args produces error', () => {
    const result = runTova(['deploy'], { cwd: fixtureDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Error');
  });

  test('tova deploy prod prints deploying message', () => {
    const result = runTova(['deploy', 'prod'], { cwd: fixtureDir });
    const combined = (result.stdout || '') + (result.stderr || '');
    expect(combined).toContain('Deploying to prod');
  });

  test('tova deploy --list with --server does not error about missing env', () => {
    // Dry-run avoids actually contacting the host
    const result = runTova(
      ['deploy', '--list', '--server', 'root@127.0.0.1'],
      { cwd: fixtureDir, env: { ...process.env, TOVA_DEPLOY_DRY_RUN: '1' } },
    );
    const combined = (result.stdout || '') + (result.stderr || '');
    expect(combined).not.toContain('requires an environment name');
    expect(combined).toContain('Listing deployments');
  });

  test('tova deploy --list without --server errors helpfully', () => {
    const result = runTova(['deploy', '--list'], { cwd: fixtureDir });
    expect(result.status).not.toBe(0);
    expect(result.stderr || '').toContain('--list requires --server');
  });

  test('tova deploy prod --plan prints infrastructure plan', () => {
    const result = runTova(['deploy', 'prod', '--plan'], { cwd: fixtureDir });
    const combined = (result.stdout || '') + (result.stderr || '');
    expect(combined).toContain('Deploy Plan');
    expect(combined).toContain('root@example.com');
    expect(combined).toContain('example.com');
  });

  test('tova deploy staging --rollback prints rollback message', () => {
    const result = runTova(['deploy', 'staging', '--rollback'], { cwd: fixtureDir });
    const combined = (result.stdout || '') + (result.stderr || '');
    expect(combined).toContain('Rolling back staging');
  });

  test('tova deploy prod --status prints status message', () => {
    const result = runTova(['deploy', 'prod', '--status'], { cwd: fixtureDir });
    const combined = (result.stdout || '') + (result.stderr || '');
    expect(combined).toContain('Checking status of prod');
  });

  test('tova deploy prod --logs prints logs message', () => {
    const result = runTova(['deploy', 'prod', '--logs'], { cwd: fixtureDir });
    const combined = (result.stdout || '') + (result.stderr || '');
    expect(combined).toContain('Fetching logs for prod');
  });

  test('tova deploy unknown-env --plan errors with helpful message', () => {
    const result = runTova(['deploy', 'does-not-exist', '--plan'], { cwd: fixtureDir });
    const combined = (result.stdout || '') + (result.stderr || '');
    expect(result.status).not.toBe(0);
    expect(combined).toContain('no deploy block named');
    expect(combined).toContain('prod');
    expect(combined).toContain('staging');
  });
});

// ─── printPlan tests ─────────────────────────────────────────────

describe('cli-deploy: printPlan', () => {
  test('prints infrastructure fields', () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    printPlan({
      name: 'production',
      server: 'root@example.com',
      domain: 'example.com',
      instances: 2,
      memory: '1gb',
      branch: 'main',
      health: '/healthz',
      health_interval: 30,
      keep_releases: 5,
      requires: { bun: true, caddy: true, ufw: false },
      databases: [{ engine: 'postgres' }],
      hasWebSocket: true,
      hasSSE: false,
      hasBrowser: true,
      requiredSecrets: ['JWT_SECRET'],
      env: { NODE_ENV: 'production' },
    });

    console.log = origLog;
    const output = logs.join('\n');

    expect(output).toContain('Deploy Plan');
    expect(output).toContain('production');
    expect(output).toContain('root@example.com');
    expect(output).toContain('example.com');
    expect(output).toContain('2');
    expect(output).toContain('1gb');
    expect(output).toContain('main');
    expect(output).toContain('Bun');
    expect(output).toContain('Caddy');
    expect(output).toContain('postgres');
    expect(output).toContain('WebSocket');
    expect(output).toContain('Static assets');
    expect(output).toContain('JWT_SECRET');
    expect(output).toContain('NODE_ENV');
  });

  test('prints minimal plan without optional fields', () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    printPlan({
      name: null,
      server: null,
      domain: null,
      instances: 1,
      memory: '512mb',
      branch: 'main',
      health: '/healthz',
      health_interval: 30,
      keep_releases: 5,
      requires: { bun: false, caddy: false, ufw: false },
      databases: [],
      hasWebSocket: false,
      hasSSE: false,
      hasBrowser: false,
      requiredSecrets: [],
      env: {},
    });

    console.log = origLog;
    const output = logs.join('\n');

    expect(output).toContain('Deploy Plan');
    expect(output).toContain('512mb');
    expect(output).not.toContain('Bun');
    expect(output).not.toContain('postgres');
  });
});

// ─── deploy function tests ───────────────────────────────────────

describe('cli-deploy: deploy orchestrator', () => {
  // Minimal AST stub — deploy() calls inferInfrastructure() which walks AST
  const minimalAst = { type: 'Program', body: [] };
  const minimalBuild = {};

  test('plan mode returns action plan', async () => {
    const args = parseDeployArgs(['prod', '--plan']);
    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    const result = await deploy(minimalAst, minimalBuild, args, '/tmp');
    console.log = origLog;
    expect(result.action).toBe('plan');
    expect(result.infra).toBeDefined();
    expect(result.infra.name).toBe('prod');
  });

  test('rollback mode returns action rollback', async () => {
    const args = parseDeployArgs(['staging', '--rollback']);
    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    const result = await deploy(minimalAst, minimalBuild, args, '/tmp');
    console.log = origLog;
    expect(result.action).toBe('rollback');
    expect(result.infra.name).toBe('staging');
  });

  test('logs mode returns action logs', async () => {
    const args = parseDeployArgs(['prod', '--logs', '--since', '2 hours ago']);
    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    const result = await deploy(minimalAst, minimalBuild, args, '/tmp');
    console.log = origLog;
    expect(result.action).toBe('logs');
  });

  test('status mode returns action status', async () => {
    const args = parseDeployArgs(['prod', '--status']);
    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    const result = await deploy(minimalAst, minimalBuild, args, '/tmp');
    console.log = origLog;
    expect(result.action).toBe('status');
  });

  test('ssh mode returns action ssh', async () => {
    const args = parseDeployArgs(['prod', '--ssh']);
    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    const result = await deploy(minimalAst, minimalBuild, args, '/tmp');
    console.log = origLog;
    expect(result.action).toBe('ssh');
  });

  test('setup-git mode returns action setup-git', async () => {
    const args = parseDeployArgs(['prod', '--setup-git']);
    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    const result = await deploy(minimalAst, minimalBuild, args, '/tmp');
    console.log = origLog;
    expect(result.action).toBe('setup-git');
  });

  test('remove mode returns action remove', async () => {
    const args = parseDeployArgs(['prod', '--remove']);
    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    const result = await deploy(minimalAst, minimalBuild, args, '/tmp');
    console.log = origLog;
    expect(result.action).toBe('remove');
  });

  test('list mode returns action list', async () => {
    const args = parseDeployArgs(['--list']);
    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    const result = await deploy(minimalAst, minimalBuild, args, '/tmp');
    console.log = origLog;
    expect(result.action).toBe('list');
  });

  test('default mode (no flags) returns action deploy', async () => {
    const args = parseDeployArgs(['prod']);
    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    const result = await deploy(minimalAst, minimalBuild, args, '/tmp');
    console.log = origLog;
    expect(result.action).toBe('deploy');
    expect(result.infra.name).toBe('prod');
  });

  test('deploy merges build result config for environment', async () => {
    const args = parseDeployArgs(['prod']);
    const buildWithConfig = {
      deploy: {
        prod: {
          server: 'app@myserver.com',
          domain: 'myapp.com',
          instances: 4,
          memory: '2gb',
          branch: 'release',
        },
      },
    };
    const logs = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    const result = await deploy(minimalAst, buildWithConfig, args, '/tmp');
    console.log = origLog;
    expect(result.infra.server).toBe('app@myserver.com');
    expect(result.infra.domain).toBe('myapp.com');
    expect(result.infra.instances).toBe(4);
    expect(result.infra.memory).toBe('2gb');
    expect(result.infra.branch).toBe('release');
  });
});
