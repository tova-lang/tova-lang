// End-to-end tests validating deploy block features documented in docs/guide/deploy.md
// Exercises the full pipeline: parse → analyze → codegen → infer → provision
//
// Tests that need server/browser/ws/sse blocks use hand-constructed AST nodes
// (same approach as deploy-infer.test.js) since those parsers have their own
// test suites. Deploy-only parsing tests use the real parser.

import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';
import { CodeGenerator } from '../src/codegen/codegen.js';
import { inferInfrastructure } from '../src/deploy/infer.js';
import { generateProvisionScript, generateSystemdService, generateCaddyConfig } from '../src/deploy/provision.js';
import { parseDeployArgs, deploy } from '../src/deploy/deploy.js';

// ── Helpers: parsing ─────────────────────────────────────────

function parse(source) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

function analyze(code) {
  const ast = parse(code);
  const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
  const result = analyzer.analyze();
  return { ast, errors: result.errors || [], warnings: result.warnings || [] };
}

function compile(code) {
  const ast = parse(code);
  const gen = new CodeGenerator(ast);
  return { ast, output: gen.generate() };
}

function fullPipeline(code) {
  const ast = parse(code);
  const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
  const result = analyzer.analyze();
  const errors = result.errors || [];
  const gen = new CodeGenerator(ast);
  const output = gen.generate();
  const infra = inferInfrastructure(ast);
  return { ast, errors, output, infra };
}

// ── Helpers: AST construction (for tests needing server/browser blocks) ──

function program(body) {
  return { type: 'Program', body };
}

function serverBlock(body = []) {
  return { type: 'ServerBlock', name: null, body, loc: { line: 1, col: 0 } };
}

function browserBlock(body = []) {
  return { type: 'BrowserBlock', name: null, body, loc: { line: 1, col: 0 } };
}

function securityBlock(body = []) {
  return { type: 'SecurityBlock', body, loc: { line: 1, col: 0 } };
}

function deployBlockNode(name, body = []) {
  return { type: 'DeployBlock', name, body, loc: { line: 1, col: 0 } };
}

function configField(key, value) {
  return { type: 'DeployConfigField', key, value: { type: typeof value === 'string' ? 'StringLiteral' : typeof value === 'boolean' ? 'BooleanLiteral' : 'NumberLiteral', value } };
}

function envBlock(entries) {
  return {
    type: 'DeployEnvBlock',
    entries: entries.map(([k, v]) => ({
      key: k,
      value: { type: typeof v === 'string' ? 'StringLiteral' : 'NumberLiteral', value: v },
    })),
  };
}

function dbBlock(engine, config = {}) {
  const configNodes = {};
  for (const [k, v] of Object.entries(config)) {
    configNodes[k] = { type: 'StringLiteral', value: v };
  }
  return { type: 'DeployDbBlock', engine, config: configNodes };
}

function envCall(secretName) {
  return {
    type: 'CallExpression',
    callee: { type: 'Identifier', name: 'env', loc: { line: 1, col: 0 } },
    arguments: [{ type: 'StringLiteral', value: secretName, loc: { line: 1, col: 0 } }],
    loc: { line: 1, col: 0 },
  };
}

// ═══════════════════════════════════════════════════════════════
// Quick Start — deploy block with server block (AST construction)
// ═══════════════════════════════════════════════════════════════

describe('Docs: Quick Start', () => {
  test('server + deploy block infers Bun + Caddy + UFW', () => {
    const ast = program([
      serverBlock(),
      deployBlockNode('prod', [
        configField('server', 'root@198.51.100.1'),
        configField('domain', 'myapp.com'),
      ]),
    ]);
    const infra = inferInfrastructure(ast);
    expect(infra.requires.bun).toBe(true);
    expect(infra.requires.caddy).toBe(true);
    expect(infra.requires.ufw).toBe(true);
    expect(infra.server).toBe('root@198.51.100.1');
    expect(infra.domain).toBe('myapp.com');
  });

  test('defaults are applied for unspecified fields', () => {
    const { output } = compile(`
      deploy "prod" {
        server: "root@198.51.100.1"
        domain: "myapp.com"
      }
    `);
    const prod = output.deploy.prod;
    expect(prod.instances).toBe(1);
    expect(prod.memory).toBe('512mb');
    expect(prod.branch).toBe('main');
    expect(prod.health).toBe('/healthz');
    expect(prod.health_interval).toBe(30);
    expect(prod.health_timeout).toBe(5);
    expect(prod.restart_on_failure).toBe(true);
    expect(prod.keep_releases).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════
// Deploy Block Syntax — full config example
// ═══════════════════════════════════════════════════════════════

describe('Docs: Deploy Block Syntax (all 10 fields)', () => {
  const code = `
    deploy "prod" {
      server: "root@198.51.100.1"
      domain: "myapp.com"
      instances: 2
      memory: "1gb"
      branch: "main"
      health: "/healthz"
      health_interval: 30
      health_timeout: 5
      restart_on_failure: true
      keep_releases: 5
    }
  `;

  test('parses all 10 config fields', () => {
    const ast = parse(code);
    const body = ast.body[0].body;
    expect(body).toHaveLength(10);
    const keys = body.map(n => n.key);
    expect(keys).toEqual([
      'server', 'domain', 'instances', 'memory', 'branch',
      'health', 'health_interval', 'health_timeout',
      'restart_on_failure', 'keep_releases',
    ]);
  });

  test('codegen produces correct values for all fields', () => {
    const { output } = compile(code);
    const prod = output.deploy.prod;
    expect(prod.server).toBe('root@198.51.100.1');
    expect(prod.domain).toBe('myapp.com');
    expect(prod.instances).toBe(2);
    expect(prod.memory).toBe('1gb');
    expect(prod.branch).toBe('main');
    expect(prod.health).toBe('/healthz');
    expect(prod.health_interval).toBe(30);
    expect(prod.health_timeout).toBe(5);
    expect(prod.restart_on_failure).toBe(true);
    expect(prod.keep_releases).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════
// Environment Variables
// ═══════════════════════════════════════════════════════════════

describe('Docs: Environment Variables', () => {
  const code = `
    deploy "prod" {
      server: "root@198.51.100.1"
      domain: "myapp.com"

      env {
        NODE_ENV: "production"
        PORT: 3000
        API_KEY: "sk-abc123"
      }
    }
  `;

  test('parses env sub-block', () => {
    const ast = parse(code);
    const envBlk = ast.body[0].body.find(n => n.type === 'DeployEnvBlock');
    expect(envBlk).toBeDefined();
    expect(envBlk.entries).toHaveLength(3);
    expect(envBlk.entries[0].key).toBe('NODE_ENV');
    expect(envBlk.entries[1].key).toBe('PORT');
    expect(envBlk.entries[2].key).toBe('API_KEY');
  });

  test('codegen includes env vars', () => {
    const { output } = compile(code);
    const prod = output.deploy.prod;
    expect(prod.env).toBeDefined();
    expect(prod.env.NODE_ENV).toBe('production');
    expect(prod.env.PORT).toBe(3000);
    expect(prod.env.API_KEY).toBe('sk-abc123');
  });

  test('systemd service skips NODE_ENV and PORT from env (auto-set)', () => {
    const service = generateSystemdService('myapp', {
      memory: '512mb',
      restart_on_failure: true,
      env: { NODE_ENV: 'production', PORT: 3000, API_KEY: 'sk-abc123' },
    });
    expect(service).toContain('Environment=NODE_ENV=production');
    expect(service).toContain('Environment=PORT=%i');
    expect(service).toContain('Environment=API_KEY=sk-abc123');
    const nodeEnvMatches = service.match(/Environment=NODE_ENV/g);
    expect(nodeEnvMatches).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Database Declarations
// ═══════════════════════════════════════════════════════════════

describe('Docs: Database Declarations', () => {
  const code = `
    deploy "prod" {
      server: "root@198.51.100.1"
      domain: "myapp.com"

      db {
        postgres {
          name: "myapp_db"
        }
        redis {
        }
      }
    }
  `;

  test('parses postgres and redis db blocks', () => {
    const ast = parse(code);
    const dbBlocks = ast.body[0].body.filter(n => n.type === 'DeployDbBlock');
    expect(dbBlocks).toHaveLength(2);
    expect(dbBlocks[0].engine).toBe('postgres');
    expect(dbBlocks[0].config.name).toBeDefined();
    expect(dbBlocks[1].engine).toBe('redis');
  });

  test('codegen includes database declarations', () => {
    const { output } = compile(code);
    const prod = output.deploy.prod;
    expect(prod.databases).toHaveLength(2);
    expect(prod.databases[0].engine).toBe('postgres');
    expect(prod.databases[1].engine).toBe('redis');
  });

  test('provision script includes postgres and redis install', () => {
    const { infra } = fullPipeline(code);
    const script = generateProvisionScript(infra);
    expect(script).toContain('Install PostgreSQL');
    expect(script).toContain('Install Redis');
    expect(script).toContain('myapp_db');
  });

  test('SQLite in server block is auto-detected (no redeclaration needed)', () => {
    const ast = program([
      serverBlock([
        {
          type: 'DbDeclaration',
          config: { path: { type: 'StringLiteral', value: 'todos.db', loc: { line: 1, col: 0 } } },
          loc: { line: 1, col: 0 },
        },
      ]),
      deployBlockNode('prod', [
        configField('server', 'root@198.51.100.1'),
        configField('domain', 'myapp.com'),
      ]),
    ]);
    const infra = inferInfrastructure(ast);
    expect(infra.databases).toHaveLength(1);
    expect(infra.databases[0].engine).toBe('sqlite');
  });
});

// ═══════════════════════════════════════════════════════════════
// Multi-Environment Deployments
// ═══════════════════════════════════════════════════════════════

describe('Docs: Multi-Environment Deployments', () => {
  const code = `
    deploy "staging" {
      server: "root@staging.example.com"
      domain: "staging.myapp.com"
      instances: 1
      memory: "512mb"
      branch: "develop"

      env {
        LOG_LEVEL: "debug"
      }
    }

    deploy "prod" {
      server: "root@prod.example.com"
      domain: "myapp.com"
      instances: 3
      memory: "1gb"
      branch: "main"

      env {
        LOG_LEVEL: "warn"
      }

      db {
        postgres {
          name: "myapp_prod"
        }
        redis {
        }
      }
    }
  `;

  test('parses two deploy blocks', () => {
    const ast = parse(code);
    const deployBlocks = ast.body.filter(n => n.type === 'DeployBlock');
    expect(deployBlocks).toHaveLength(2);
    expect(deployBlocks[0].name).toBe('staging');
    expect(deployBlocks[1].name).toBe('prod');
  });

  test('codegen produces separate configs for each environment', () => {
    const { output } = compile(code);
    expect(output.deploy.staging).toBeDefined();
    expect(output.deploy.prod).toBeDefined();

    expect(output.deploy.staging.server).toBe('root@staging.example.com');
    expect(output.deploy.staging.instances).toBe(1);
    expect(output.deploy.staging.branch).toBe('develop');
    expect(output.deploy.staging.env.LOG_LEVEL).toBe('debug');

    expect(output.deploy.prod.server).toBe('root@prod.example.com');
    expect(output.deploy.prod.instances).toBe(3);
    expect(output.deploy.prod.memory).toBe('1gb');
    expect(output.deploy.prod.branch).toBe('main');
    expect(output.deploy.prod.env.LOG_LEVEL).toBe('warn');
    expect(output.deploy.prod.databases).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// Infrastructure Inference (AST construction for cross-block tests)
// ═══════════════════════════════════════════════════════════════

describe('Docs: Infrastructure Inference', () => {
  test('server block infers Bun + Caddy + UFW', () => {
    const ast = program([
      serverBlock(),
      deployBlockNode('prod', [
        configField('server', 'root@198.51.100.1'),
        configField('domain', 'myapp.com'),
      ]),
    ]);
    const infra = inferInfrastructure(ast);
    expect(infra.requires.bun).toBe(true);
    expect(infra.requires.caddy).toBe(true);
    expect(infra.requires.ufw).toBe(true);
  });

  test('browser block infers static asset serving', () => {
    const ast = program([
      serverBlock(),
      browserBlock(),
      deployBlockNode('prod', [
        configField('server', 'root@198.51.100.1'),
        configField('domain', 'myapp.com'),
      ]),
    ]);
    const infra = inferInfrastructure(ast);
    expect(infra.hasBrowser).toBe(true);
  });

  test('WebSocket in server block infers Caddy WebSocket proxy', () => {
    const ast = program([
      serverBlock([
        { type: 'WebSocketDeclaration', handlers: {}, config: null, loc: { line: 1, col: 0 } },
      ]),
      deployBlockNode('prod', [
        configField('server', 'root@198.51.100.1'),
        configField('domain', 'myapp.com'),
      ]),
    ]);
    const infra = inferInfrastructure(ast);
    expect(infra.hasWebSocket).toBe(true);
  });

  test('SSE in server block is detected', () => {
    const ast = program([
      serverBlock([
        { type: 'SseDeclaration', path: '/events', params: [], body: { type: 'BlockStatement', body: [] }, loc: { line: 1, col: 0 } },
      ]),
      deployBlockNode('prod', [
        configField('server', 'root@198.51.100.1'),
        configField('domain', 'myapp.com'),
      ]),
    ]);
    const infra = inferInfrastructure(ast);
    expect(infra.hasSSE).toBe(true);
  });

  test('env() calls in security block collect required secrets', () => {
    const ast = program([
      securityBlock([
        {
          type: 'SecurityAuthDeclaration',
          authType: 'jwt',
          config: { secret: envCall('JWT_SECRET') },
          loc: { line: 1, col: 0 },
        },
      ]),
      deployBlockNode('prod', [
        configField('server', 'root@198.51.100.1'),
        configField('domain', 'myapp.com'),
      ]),
    ]);
    const infra = inferInfrastructure(ast);
    expect(infra.requiredSecrets).toContain('JWT_SECRET');
  });

  test('WebSocket detection generates Caddy config with upgrade headers', () => {
    const caddyConfig = generateCaddyConfig('myapp', {
      domain: 'myapp.com',
      instances: 1,
      health: '/healthz',
      hasWebSocket: true,
    });
    expect(caddyConfig).toContain('@websocket');
    expect(caddyConfig).toContain('header Connection *Upgrade*');
    expect(caddyConfig).toContain('header Upgrade websocket');
  });
});

// ═══════════════════════════════════════════════════════════════
// CLI Reference
// ═══════════════════════════════════════════════════════════════

describe('Docs: CLI Reference', () => {
  test('parses "tova deploy prod"', () => {
    const args = parseDeployArgs(['prod']);
    expect(args.envName).toBe('prod');
  });

  test('parses "tova deploy prod --plan"', () => {
    const args = parseDeployArgs(['prod', '--plan']);
    expect(args.envName).toBe('prod');
    expect(args.plan).toBe(true);
  });

  test('parses "tova deploy prod --rollback"', () => {
    const args = parseDeployArgs(['prod', '--rollback']);
    expect(args.envName).toBe('prod');
    expect(args.rollback).toBe(true);
  });

  test('parses "tova deploy prod --status"', () => {
    const args = parseDeployArgs(['prod', '--status']);
    expect(args.envName).toBe('prod');
    expect(args.status).toBe(true);
  });

  test('parses "tova deploy prod --logs --since 1 hour ago"', () => {
    const args = parseDeployArgs(['prod', '--logs', '--since', '1 hour ago']);
    expect(args.envName).toBe('prod');
    expect(args.logs).toBe(true);
    expect(args.since).toBe('1 hour ago');
  });

  test('parses "tova deploy prod --logs --instance 1"', () => {
    const args = parseDeployArgs(['prod', '--logs', '--instance', '1']);
    expect(args.envName).toBe('prod');
    expect(args.logs).toBe(true);
    expect(args.instance).toBe(1);
  });

  test('parses "tova deploy prod --ssh"', () => {
    const args = parseDeployArgs(['prod', '--ssh']);
    expect(args.envName).toBe('prod');
    expect(args.ssh).toBe(true);
  });

  test('parses "tova deploy prod --setup-git"', () => {
    const args = parseDeployArgs(['prod', '--setup-git']);
    expect(args.envName).toBe('prod');
    expect(args.setupGit).toBe(true);
  });

  test('parses "tova deploy prod --remove"', () => {
    const args = parseDeployArgs(['prod', '--remove']);
    expect(args.envName).toBe('prod');
    expect(args.remove).toBe(true);
  });

  test('parses "tova deploy --list --server root@example.com"', () => {
    const args = parseDeployArgs(['--list', '--server', 'root@example.com']);
    expect(args.list).toBe(true);
    expect(args.server).toBe('root@example.com');
  });
});

// ═══════════════════════════════════════════════════════════════
// Provisioning
// ═══════════════════════════════════════════════════════════════

describe('Docs: Provisioning', () => {
  test('generates idempotent Bun install', () => {
    const script = generateProvisionScript({
      name: 'myapp',
      requires: { bun: true, caddy: false, ufw: false },
      databases: [],
      instances: 1,
    });
    expect(script).toContain('command -v bun');
    expect(script).toContain('curl -fsSL https://bun.sh/install');
  });

  test('generates Caddy install and config', () => {
    const script = generateProvisionScript({
      name: 'myapp',
      domain: 'myapp.com',
      requires: { bun: false, caddy: true, ufw: false },
      databases: [],
      instances: 1,
      health: '/healthz',
    });
    expect(script).toContain('command -v caddy');
    expect(script).toContain('dl.cloudsmith.io');
    expect(script).toContain('myapp.com');
  });

  test('generates UFW firewall rules for ports 22, 80, 443', () => {
    const script = generateProvisionScript({
      name: 'myapp',
      requires: { bun: false, caddy: false, ufw: true },
      databases: [],
      instances: 1,
    });
    expect(script).toContain('ufw allow 22/tcp');
    expect(script).toContain('ufw allow 80/tcp');
    expect(script).toContain('ufw allow 443/tcp');
  });

  test('generates tova system user', () => {
    const script = generateProvisionScript({
      name: 'myapp',
      requires: { bun: false, caddy: false, ufw: false },
      databases: [],
      instances: 1,
    });
    expect(script).toContain('useradd --system --create-home --shell /bin/bash tova');
  });

  test('generates app directory structure', () => {
    const script = generateProvisionScript({
      name: 'myapp',
      requires: { bun: false, caddy: false, ufw: false },
      databases: [],
      instances: 1,
    });
    expect(script).toContain('/opt/tova/apps/myapp');
    expect(script).toContain('releases');
    expect(script).toContain('shared/logs');
    expect(script).toContain('shared/data');
  });

  test('generates systemd template unit with MemoryMax', () => {
    const service = generateSystemdService('myapp', {
      memory: '1gb',
      restart_on_failure: true,
      env: {},
    });
    expect(service).toContain('Description=myapp instance on port %i');
    expect(service).toContain('User=tova');
    expect(service).toContain('WorkingDirectory=/opt/tova/apps/myapp/current');
    expect(service).toContain('ExecStart=/home/tova/.bun/bin/bun run server.js --port %i');
    expect(service).toContain('Restart=on-failure');
    expect(service).toContain('MemoryMax=1024M');
    expect(service).toContain('EnvironmentFile=-/opt/tova/apps/myapp/.env.production');
    expect(service).toContain('Environment=NODE_ENV=production');
    expect(service).toContain('Environment=PORT=%i');
    expect(service).toContain('SyslogIdentifier=myapp-%i');
  });

  test('multiple instances get separate systemd enable lines', () => {
    const script = generateProvisionScript({
      name: 'myapp',
      domain: 'myapp.com',
      requires: { bun: false, caddy: true, ufw: false },
      databases: [],
      instances: 3,
      health: '/healthz',
    });
    expect(script).toContain('systemctl enable myapp@3000');
    expect(script).toContain('systemctl enable myapp@3001');
    expect(script).toContain('systemctl enable myapp@3002');
  });

  test('Caddy config with multiple instances uses round_robin', () => {
    const caddyConfig = generateCaddyConfig('myapp', {
      domain: 'myapp.com',
      instances: 3,
      health: '/healthz',
    });
    expect(caddyConfig).toContain('localhost:3000');
    expect(caddyConfig).toContain('localhost:3001');
    expect(caddyConfig).toContain('localhost:3002');
    expect(caddyConfig).toContain('lb_policy round_robin');
    expect(caddyConfig).toContain('health_uri /healthz');
    expect(caddyConfig).toContain('health_interval 30s');
    expect(caddyConfig).toContain('health_timeout 5s');
  });

  test('single instance Caddy config omits lb_policy', () => {
    const caddyConfig = generateCaddyConfig('myapp', {
      domain: 'myapp.com',
      instances: 1,
      health: '/healthz',
    });
    expect(caddyConfig).toContain('localhost:3000');
    expect(caddyConfig).not.toContain('lb_policy');
  });

  test('Caddy config includes logging', () => {
    const caddyConfig = generateCaddyConfig('myapp', {
      domain: 'myapp.com',
      instances: 1,
      health: '/healthz',
    });
    expect(caddyConfig).toContain('output file /var/log/caddy/myapp.log');
  });

  test('PostgreSQL provisioning is idempotent', () => {
    const script = generateProvisionScript({
      name: 'myapp',
      requires: { bun: false, caddy: false, ufw: false },
      databases: [{ engine: 'postgres', config: { name: 'myapp_db' } }],
      instances: 1,
    });
    expect(script).toContain('command -v psql');
    expect(script).toContain('createdb');
    expect(script).toContain('myapp_db');
  });

  test('Redis provisioning is idempotent', () => {
    const script = generateProvisionScript({
      name: 'myapp',
      requires: { bun: false, caddy: false, ufw: false },
      databases: [{ engine: 'redis', config: {} }],
      instances: 1,
    });
    expect(script).toContain('command -v redis-server');
    expect(script).toContain('systemctl enable redis-server');
  });
});

// ═══════════════════════════════════════════════════════════════
// Health Checks
// ═══════════════════════════════════════════════════════════════

describe('Docs: Health Checks', () => {
  test('health config flows through inference', () => {
    const code = `
      deploy "prod" {
        server: "root@198.51.100.1"
        domain: "myapp.com"
        health: "/healthz"
        health_interval: 30
        health_timeout: 5
      }
    `;
    const { infra } = fullPipeline(code);
    expect(infra.health).toBe('/healthz');
    expect(infra.health_interval).toBe(30);
    expect(infra.health_timeout).toBe(5);
  });

  test('health config flows to Caddy health_uri', () => {
    const caddyConfig = generateCaddyConfig('myapp', {
      domain: 'myapp.com',
      instances: 2,
      health: '/healthz',
    });
    expect(caddyConfig).toContain('health_uri /healthz');
    expect(caddyConfig).toContain('health_interval 30s');
    expect(caddyConfig).toContain('health_timeout 5s');
  });
});

// ═══════════════════════════════════════════════════════════════
// Deploy orchestrator (uses AST construction to avoid parse issues)
// ═══════════════════════════════════════════════════════════════

describe('Docs: Deploy orchestrator', () => {
  function makeAstAndOutput() {
    const ast = program([
      serverBlock(),
      deployBlockNode('prod', [
        configField('server', 'root@198.51.100.1'),
        configField('domain', 'myapp.com'),
      ]),
    ]);
    const output = { deploy: { prod: { server: 'root@198.51.100.1', domain: 'myapp.com' } } };
    return { ast, output };
  }

  test('--plan returns action: plan', async () => {
    const { ast, output } = makeAstAndOutput();
    const deployArgs = parseDeployArgs(['prod', '--plan']);
    const result = await deploy(ast, output, deployArgs, '/tmp/test');
    expect(result.action).toBe('plan');
    expect(result.infra.server).toBe('root@198.51.100.1');
    expect(result.infra.domain).toBe('myapp.com');
  });

  test('--rollback returns action: rollback', async () => {
    const { ast, output } = makeAstAndOutput();
    const deployArgs = parseDeployArgs(['prod', '--rollback']);
    const result = await deploy(ast, output, deployArgs, '/tmp/test');
    expect(result.action).toBe('rollback');
  });

  test('--status returns action: status', async () => {
    const { ast, output } = makeAstAndOutput();
    const deployArgs = parseDeployArgs(['prod', '--status']);
    const result = await deploy(ast, output, deployArgs, '/tmp/test');
    expect(result.action).toBe('status');
  });

  test('--logs returns action: logs', async () => {
    const { ast, output } = makeAstAndOutput();
    const deployArgs = parseDeployArgs(['prod', '--logs']);
    const result = await deploy(ast, output, deployArgs, '/tmp/test');
    expect(result.action).toBe('logs');
  });

  test('--ssh returns action: ssh', async () => {
    const { ast, output } = makeAstAndOutput();
    const deployArgs = parseDeployArgs(['prod', '--ssh']);
    const result = await deploy(ast, output, deployArgs, '/tmp/test');
    expect(result.action).toBe('ssh');
  });

  test('--setup-git returns action: setup-git', async () => {
    const { ast, output } = makeAstAndOutput();
    const deployArgs = parseDeployArgs(['prod', '--setup-git']);
    const result = await deploy(ast, output, deployArgs, '/tmp/test');
    expect(result.action).toBe('setup-git');
  });

  test('--remove returns action: remove', async () => {
    const { ast, output } = makeAstAndOutput();
    const deployArgs = parseDeployArgs(['prod', '--remove']);
    const result = await deploy(ast, output, deployArgs, '/tmp/test');
    expect(result.action).toBe('remove');
  });

  test('default deploy returns action: deploy', async () => {
    const { ast, output } = makeAstAndOutput();
    const deployArgs = parseDeployArgs(['prod']);
    const result = await deploy(ast, output, deployArgs, '/tmp/test');
    expect(result.action).toBe('deploy');
  });
});

// ═══════════════════════════════════════════════════════════════
// Complete Example: Todo App (AST construction for server+browser)
// ═══════════════════════════════════════════════════════════════

describe('Docs: Complete Example — Todo App', () => {
  test('server + browser + deploy infers all infrastructure', () => {
    const ast = program([
      serverBlock([
        {
          type: 'DbDeclaration',
          config: { path: { type: 'StringLiteral', value: 'todos.db', loc: { line: 1, col: 0 } } },
          loc: { line: 1, col: 0 },
        },
      ]),
      browserBlock(),
      deployBlockNode('prod', [
        configField('server', 'root@198.51.100.1'),
        configField('domain', 'todos.example.com'),
      ]),
    ]);
    const infra = inferInfrastructure(ast);
    expect(infra.requires.bun).toBe(true);
    expect(infra.requires.caddy).toBe(true);
    expect(infra.requires.ufw).toBe(true);
    expect(infra.hasBrowser).toBe(true);
    expect(infra.databases).toHaveLength(1);
    expect(infra.databases[0].engine).toBe('sqlite');
    expect(infra.domain).toBe('todos.example.com');
  });
});

// ═══════════════════════════════════════════════════════════════
// Complete Example: SaaS App (multi-environment, parsed deploy blocks)
// ═══════════════════════════════════════════════════════════════

describe('Docs: Complete Example — SaaS App', () => {
  const code = `
    deploy "staging" {
      server: "root@staging.saas.com"
      domain: "staging.saas.com"
      instances: 1
      memory: "512mb"
      branch: "develop"

      env {
        LOG_LEVEL: "debug"
      }

      db {
        postgres {
          name: "saas_staging"
        }
        redis {
        }
      }
    }

    deploy "prod" {
      server: "root@prod.saas.com"
      domain: "app.saas.com"
      instances: 3
      memory: "1gb"
      branch: "main"

      env {
        LOG_LEVEL: "warn"
      }

      db {
        postgres {
          name: "saas_prod"
        }
        redis {
        }
      }
    }
  `;

  test('parses 2 deploy blocks with full config', () => {
    const ast = parse(code);
    const deployBlocks = ast.body.filter(n => n.type === 'DeployBlock');
    expect(deployBlocks).toHaveLength(2);
    expect(deployBlocks[0].name).toBe('staging');
    expect(deployBlocks[1].name).toBe('prod');
  });

  test('codegen produces staging and prod configs', () => {
    const { output } = compile(code);
    expect(output.deploy.staging.server).toBe('root@staging.saas.com');
    expect(output.deploy.staging.instances).toBe(1);
    expect(output.deploy.staging.branch).toBe('develop');
    expect(output.deploy.staging.databases).toHaveLength(2);

    expect(output.deploy.prod.server).toBe('root@prod.saas.com');
    expect(output.deploy.prod.instances).toBe(3);
    expect(output.deploy.prod.memory).toBe('1gb');
    expect(output.deploy.prod.branch).toBe('main');
    expect(output.deploy.prod.databases).toHaveLength(2);
  });

  test('provision script for prod includes 3 instances and postgres', () => {
    const infra = {
      name: 'saas',
      domain: 'app.saas.com',
      instances: 3,
      memory: '1gb',
      requires: { bun: true, caddy: true, ufw: true },
      databases: [
        { engine: 'postgres', config: { name: 'saas_prod' } },
        { engine: 'redis', config: {} },
      ],
      health: '/healthz',
    };
    const script = generateProvisionScript(infra);
    expect(script).toContain('systemctl enable saas@3000');
    expect(script).toContain('systemctl enable saas@3001');
    expect(script).toContain('systemctl enable saas@3002');
    expect(script).toContain('saas_prod');
    expect(script).toContain('Install Redis');
  });
});

// ═══════════════════════════════════════════════════════════════
// Complete Example: Real-Time API (AST construction for ws + sse)
// ═══════════════════════════════════════════════════════════════

describe('Docs: Complete Example — Real-Time API', () => {
  test('infers WebSocket and SSE from server block', () => {
    const ast = program([
      serverBlock([
        { type: 'WebSocketDeclaration', handlers: {}, config: null, loc: { line: 1, col: 0 } },
        { type: 'SseDeclaration', path: '/events', params: [], body: { type: 'BlockStatement', body: [] }, loc: { line: 1, col: 0 } },
      ]),
      deployBlockNode('prod', [
        configField('server', 'root@realtime.example.com'),
        configField('domain', 'realtime.example.com'),
        configField('instances', 2),
        configField('memory', '1gb'),
      ]),
    ]);
    const infra = inferInfrastructure(ast);
    expect(infra.hasWebSocket).toBe(true);
    expect(infra.hasSSE).toBe(true);
    expect(infra.domain).toBe('realtime.example.com');
    expect(infra.instances).toBe(2);
  });

  test('Caddy config includes WebSocket proxy for 2 instances', () => {
    const caddyConfig = generateCaddyConfig('realtime', {
      domain: 'realtime.example.com',
      instances: 2,
      health: '/healthz',
      hasWebSocket: true,
    });
    expect(caddyConfig).toContain('realtime.example.com');
    expect(caddyConfig).toContain('@websocket');
    expect(caddyConfig).toContain('localhost:3000');
    expect(caddyConfig).toContain('localhost:3001');
    expect(caddyConfig).toContain('lb_policy round_robin');
  });
});

// ═══════════════════════════════════════════════════════════════
// Memory parsing
// ═══════════════════════════════════════════════════════════════

describe('Docs: Memory configuration', () => {
  test('512mb is parsed correctly', () => {
    const service = generateSystemdService('app', { memory: '512mb' });
    expect(service).toContain('MemoryMax=512M');
  });

  test('1gb is converted to 1024M', () => {
    const service = generateSystemdService('app', { memory: '1gb' });
    expect(service).toContain('MemoryMax=1024M');
  });

  test('256mb is parsed correctly', () => {
    const service = generateSystemdService('app', { memory: '256mb' });
    expect(service).toContain('MemoryMax=256M');
  });
});

// ═══════════════════════════════════════════════════════════════
// restart_on_failure toggle
// ═══════════════════════════════════════════════════════════════

describe('Docs: restart_on_failure toggle', () => {
  test('restart_on_failure: true sets Restart=on-failure', () => {
    const service = generateSystemdService('app', { restart_on_failure: true });
    expect(service).toContain('Restart=on-failure');
  });

  test('restart_on_failure: false sets Restart=no', () => {
    const service = generateSystemdService('app', { restart_on_failure: false });
    expect(service).toContain('Restart=no');
  });
});
