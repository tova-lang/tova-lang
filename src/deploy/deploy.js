// CLI deploy command entry point for the Tova language
// Provides argument parsing and deploy orchestration.
// SSH execution is stubbed for now — will be wired in integration.

import { inferInfrastructure } from './infer.js';

/**
 * Parse CLI deploy arguments into a config object.
 *
 *   tova deploy prod --plan
 *   tova deploy prod --rollback
 *   tova deploy prod --logs --since "1 hour ago"
 *   tova deploy prod --status
 *   tova deploy prod --ssh
 *   tova deploy prod --setup-git
 *   tova deploy --list --server root@example.com
 *   tova deploy prod --remove
 *   tova deploy prod --logs --instance 1
 */
export function parseDeployArgs(args) {
  const result = {
    envName: null,
    plan: false,
    rollback: false,
    logs: false,
    status: false,
    ssh: false,
    setupGit: false,
    remove: false,
    list: false,
    server: null,
    since: null,
    instance: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--plan': result.plan = true; break;
      case '--rollback': result.rollback = true; break;
      case '--logs': result.logs = true; break;
      case '--status': result.status = true; break;
      case '--ssh': result.ssh = true; break;
      case '--setup-git': result.setupGit = true; break;
      case '--remove': result.remove = true; break;
      case '--list': result.list = true; break;
      case '--server': result.server = args[++i]; break;
      case '--since': result.since = args[++i]; break;
      case '--instance': result.instance = parseInt(args[++i], 10); break;
      default:
        if (!arg.startsWith('--') && !result.envName) {
          result.envName = arg;
        }
        break;
    }
  }
  return result;
}

/**
 * Print a deploy plan to the console.
 * Shows the infrastructure that would be provisioned.
 *
 * @param {Object} infra - Infrastructure manifest from inferInfrastructure()
 */
export function printPlan(infra) {
  const lines = [];
  lines.push('');
  lines.push('  Deploy Plan');
  lines.push('  ──────────────────────────────────────');
  lines.push('');

  if (infra.name) lines.push(`  Environment:  ${infra.name}`);
  if (infra.server) lines.push(`  Server:       ${infra.server}`);
  if (infra.domain) lines.push(`  Domain:       ${infra.domain}`);
  lines.push(`  Instances:    ${infra.instances}`);
  lines.push(`  Memory:       ${infra.memory}`);
  lines.push(`  Branch:       ${infra.branch}`);
  lines.push(`  Health:       ${infra.health} (every ${infra.health_interval}s)`);
  lines.push(`  Keep:         ${infra.keep_releases} releases`);
  lines.push('');

  // Required services
  const services = [];
  if (infra.requires.bun) services.push('Bun');
  if (infra.requires.caddy) services.push('Caddy');
  if (infra.requires.ufw) services.push('UFW');
  if (services.length > 0) {
    lines.push(`  Services:     ${services.join(', ')}`);
  }

  // Databases
  if (infra.databases.length > 0) {
    const dbNames = infra.databases.map(d => d.engine);
    lines.push(`  Databases:    ${dbNames.join(', ')}`);
  }

  // Features
  const features = [];
  if (infra.hasWebSocket) features.push('WebSocket');
  if (infra.hasSSE) features.push('SSE');
  if (infra.hasBrowser) features.push('Static assets');
  if (features.length > 0) {
    lines.push(`  Features:     ${features.join(', ')}`);
  }

  // Required secrets
  if (infra.requiredSecrets.length > 0) {
    lines.push(`  Secrets:      ${infra.requiredSecrets.join(', ')}`);
  }

  // Env variables
  const envKeys = Object.keys(infra.env || {});
  if (envKeys.length > 0) {
    lines.push(`  Env vars:     ${envKeys.join(', ')}`);
  }

  lines.push('');
  lines.push('  ──────────────────────────────────────');
  lines.push('');

  console.log(lines.join('\n'));
}

/**
 * Main deploy orchestrator.
 *
 * Compiles the project, infers infrastructure, and (eventually) executes
 * SSH deployment. For now the SSH parts are stubbed.
 *
 * @param {Object} ast - Parsed program AST
 * @param {Object} buildResult - Codegen output
 * @param {Object} deployArgs - Parsed CLI args from parseDeployArgs()
 * @param {string} projectDir - Absolute path to the project directory
 * @returns {Object} result with plan, infra, and status
 */
export async function deploy(ast, buildResult, deployArgs, projectDir) {
  // Infer full infrastructure manifest from AST
  const infra = inferInfrastructure(ast);

  // Override environment name from CLI args
  if (deployArgs.envName) {
    infra.name = deployArgs.envName;
  }

  // If deploy config exists in build result, merge it
  if (buildResult.deploy && buildResult.deploy[deployArgs.envName]) {
    const envConfig = buildResult.deploy[deployArgs.envName];
    if (envConfig.server) infra.server = envConfig.server;
    if (envConfig.domain) infra.domain = envConfig.domain;
    if (envConfig.instances) infra.instances = envConfig.instances;
    if (envConfig.memory) infra.memory = envConfig.memory;
    if (envConfig.branch) infra.branch = envConfig.branch;
  }

  // Plan mode — just show what would be deployed
  if (deployArgs.plan) {
    printPlan(infra);
    return { action: 'plan', infra };
  }

  // Rollback mode — stub
  if (deployArgs.rollback) {
    console.log(`  Rolling back ${deployArgs.envName}...`);
    // TODO: SSH into server, symlink previous release
    return { action: 'rollback', infra };
  }

  // Logs mode — stub
  if (deployArgs.logs) {
    const since = deployArgs.since || '1 hour ago';
    const instance = deployArgs.instance !== null ? ` (instance ${deployArgs.instance})` : '';
    console.log(`  Fetching logs for ${deployArgs.envName}${instance} since ${since}...`);
    // TODO: SSH into server, journalctl/tail logs
    return { action: 'logs', infra };
  }

  // Status mode — stub
  if (deployArgs.status) {
    console.log(`  Checking status of ${deployArgs.envName}...`);
    // TODO: SSH into server, check systemd service status
    return { action: 'status', infra };
  }

  // SSH mode — stub
  if (deployArgs.ssh) {
    console.log(`  Opening SSH session to ${deployArgs.envName}...`);
    // TODO: spawn interactive SSH session
    return { action: 'ssh', infra };
  }

  // Setup git push-to-deploy — stub
  if (deployArgs.setupGit) {
    console.log(`  Setting up git push-to-deploy for ${deployArgs.envName}...`);
    // TODO: SSH into server, configure bare repo + post-receive hook
    return { action: 'setup-git', infra };
  }

  // Remove deployment — stub
  if (deployArgs.remove) {
    console.log(`  Removing deployment ${deployArgs.envName}...`);
    // TODO: SSH into server, stop services, remove files
    return { action: 'remove', infra };
  }

  // List deployments — stub
  if (deployArgs.list) {
    console.log('  Listing deployments...');
    // TODO: SSH into server, list ~/apps/
    return { action: 'list', infra };
  }

  // Default: full deploy — stub
  console.log(`  Deploying to ${deployArgs.envName}...`);
  // TODO: rsync build, run provision script, restart services
  return { action: 'deploy', infra };
}
