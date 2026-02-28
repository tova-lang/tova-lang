// Infrastructure Inference Engine for the Tova language
// Walks the entire program AST and produces a complete infrastructure manifest
// by combining explicit deploy block config with inferred requirements from
// server, browser, and security blocks.

import { DeployCodegen } from '../codegen/deploy-codegen.js';

const MANIFEST_DEFAULTS = {
  name: null,
  server: null,
  domain: null,
  instances: 1,
  memory: '512mb',
  branch: 'main',
  health: '/healthz',
  health_interval: 30,
  health_timeout: 5,
  restart_on_failure: true,
  keep_releases: 5,
  env: {},
  databases: [],
  requires: { bun: false, caddy: false, ufw: false },
  hasWebSocket: false,
  hasSSE: false,
  hasBrowser: false,
  requiredSecrets: [],
  blockTypes: [],
};

/**
 * Walk an AST node tree recursively and invoke a visitor callback on each node.
 */
function walkNode(node, visitor) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visitor(node);

  // Walk arrays (e.g., body, entries, arguments)
  for (const key of Object.keys(node)) {
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        walkNode(item, visitor);
      }
    } else if (val && typeof val === 'object' && val.type) {
      walkNode(val, visitor);
    }
  }
}

/**
 * Collect all env() call arguments from a node tree.
 * env("JWT_SECRET") => CallExpression with callee.name === "env" and args[0].value
 */
function collectEnvCalls(node) {
  const secrets = [];
  walkNode(node, (n) => {
    if (
      n.type === 'CallExpression' &&
      n.callee &&
      n.callee.type === 'Identifier' &&
      n.callee.name === 'env' &&
      n.arguments &&
      n.arguments.length > 0
    ) {
      const arg = n.arguments[0];
      if (arg && (arg.value !== undefined)) {
        secrets.push(typeof arg.value === 'string' ? arg.value : String(arg.value));
      }
    }
  });
  return secrets;
}

/**
 * Infer infrastructure requirements from the full program AST.
 *
 * @param {Object} ast - Program AST with ast.body array of top-level blocks
 * @returns {Object} Complete infrastructure manifest
 */
export function inferInfrastructure(ast) {
  const manifest = JSON.parse(JSON.stringify(MANIFEST_DEFAULTS));
  const blockTypes = new Set();
  const deployBlocks = [];
  const inferredDatabases = [];
  const secretsSet = new Set();

  if (!ast || !ast.body) return manifest;

  for (const node of ast.body) {
    switch (node.type) {
      case 'DeployBlock': {
        blockTypes.add('deploy');
        deployBlocks.push(node);
        break;
      }

      case 'ServerBlock': {
        blockTypes.add('server');
        manifest.requires.bun = true;
        manifest.requires.caddy = true;
        manifest.requires.ufw = true;

        // Scan server block body for specific declarations
        if (node.body && Array.isArray(node.body)) {
          for (const stmt of node.body) {
            if (stmt.type === 'DbDeclaration') {
              // Server-block db is always SQLite (bun:sqlite)
              const dbConfig = {};
              if (stmt.config && typeof stmt.config === 'object') {
                for (const [k, v] of Object.entries(stmt.config)) {
                  dbConfig[k] = v && v.value !== undefined ? v.value : v;
                }
              }
              inferredDatabases.push({ engine: 'sqlite', config: dbConfig });
            }
            if (stmt.type === 'WebSocketDeclaration') {
              manifest.hasWebSocket = true;
            }
            if (stmt.type === 'SseDeclaration') {
              manifest.hasSSE = true;
            }
            // Also check inside route groups
            if (stmt.type === 'RouteGroupDeclaration' && stmt.body) {
              for (const inner of stmt.body) {
                if (inner.type === 'WebSocketDeclaration') {
                  manifest.hasWebSocket = true;
                }
                if (inner.type === 'SseDeclaration') {
                  manifest.hasSSE = true;
                }
                if (inner.type === 'DbDeclaration') {
                  const dbConfig = {};
                  if (inner.config && typeof inner.config === 'object') {
                    for (const [k, v] of Object.entries(inner.config)) {
                      dbConfig[k] = v && v.value !== undefined ? v.value : v;
                    }
                  }
                  inferredDatabases.push({ engine: 'sqlite', config: dbConfig });
                }
              }
            }
          }
        }
        break;
      }

      case 'BrowserBlock': {
        blockTypes.add('browser');
        manifest.hasBrowser = true;
        break;
      }

      case 'SecurityBlock': {
        blockTypes.add('security');
        // Scan for env() calls to find required secrets
        if (node.body && Array.isArray(node.body)) {
          for (const stmt of node.body) {
            if (stmt.type === 'SecurityAuthDeclaration') {
              // Walk the config looking for env() calls
              if (stmt.config && typeof stmt.config === 'object') {
                for (const [, value] of Object.entries(stmt.config)) {
                  const secrets = collectEnvCalls(value);
                  for (const s of secrets) secretsSet.add(s);
                }
              }
            }
          }
        }
        break;
      }
    }
  }

  // Merge explicit deploy config via DeployCodegen
  if (deployBlocks.length > 0) {
    const deployConfig = DeployCodegen.mergeDeployBlocks(deployBlocks);
    // Apply deploy config fields to manifest
    if (deployConfig.name) manifest.name = deployConfig.name;
    if (deployConfig.server) manifest.server = deployConfig.server;
    if (deployConfig.domain) manifest.domain = deployConfig.domain;
    if (deployConfig.instances !== undefined) manifest.instances = deployConfig.instances;
    if (deployConfig.memory) manifest.memory = deployConfig.memory;
    if (deployConfig.branch) manifest.branch = deployConfig.branch;
    if (deployConfig.health) manifest.health = deployConfig.health;
    if (deployConfig.health_interval !== undefined) manifest.health_interval = deployConfig.health_interval;
    if (deployConfig.health_timeout !== undefined) manifest.health_timeout = deployConfig.health_timeout;
    if (deployConfig.restart_on_failure !== undefined) manifest.restart_on_failure = deployConfig.restart_on_failure;
    if (deployConfig.keep_releases !== undefined) manifest.keep_releases = deployConfig.keep_releases;
    if (deployConfig.env && Object.keys(deployConfig.env).length > 0) {
      manifest.env = { ...manifest.env, ...deployConfig.env };
    }
    // Declared databases from deploy block
    if (deployConfig.databases && deployConfig.databases.length > 0) {
      manifest.databases = [...deployConfig.databases];
    }
  }

  // Merge inferred databases with declared ones (avoid duplicates by engine name)
  const declaredEngines = new Set(manifest.databases.map(d => d.engine));
  for (const inferred of inferredDatabases) {
    if (!declaredEngines.has(inferred.engine)) {
      manifest.databases.push(inferred);
      declaredEngines.add(inferred.engine);
    }
  }

  // If server block is present, ensure bun/caddy/ufw are required
  if (blockTypes.has('server')) {
    manifest.requires.bun = true;
    manifest.requires.caddy = true;
    manifest.requires.ufw = true;
  }

  manifest.requiredSecrets = [...secretsSet].sort();
  manifest.blockTypes = [...blockTypes].sort();

  return manifest;
}
