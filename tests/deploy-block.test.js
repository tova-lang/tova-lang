import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

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
  return result.errors || [];
}

describe('Deploy Block AST', () => {
  test('DeployBlock node has correct structure', () => {
    const { DeployBlock } = require('../src/parser/deploy-ast.js');
    const node = new DeployBlock([], { line: 1, col: 0 }, 'prod');
    expect(node.type).toBe('DeployBlock');
    expect(node.name).toBe('prod');
    expect(node.body).toEqual([]);
    expect(node.loc).toEqual({ line: 1, col: 0 });
  });

  test('DeployConfigField node has correct structure', () => {
    const { DeployConfigField } = require('../src/parser/deploy-ast.js');
    const node = new DeployConfigField('server', 'root@example.com', { line: 1, col: 0 });
    expect(node.type).toBe('DeployConfigField');
    expect(node.key).toBe('server');
    expect(node.value).toBe('root@example.com');
  });

  test('DeployEnvBlock node has correct structure', () => {
    const { DeployEnvBlock } = require('../src/parser/deploy-ast.js');
    const node = new DeployEnvBlock([{ key: 'NODE_ENV', value: 'production' }], { line: 1, col: 0 });
    expect(node.type).toBe('DeployEnvBlock');
    expect(node.entries).toHaveLength(1);
  });

  test('DeployDbBlock node has correct structure', () => {
    const { DeployDbBlock } = require('../src/parser/deploy-ast.js');
    const node = new DeployDbBlock('postgres', { name: 'myapp_db' }, { line: 1, col: 0 });
    expect(node.type).toBe('DeployDbBlock');
    expect(node.engine).toBe('postgres');
    expect(node.config.name).toBe('myapp_db');
  });
});

// ═══════════════════════════════════════════════════════════════
// Parsing
// ═══════════════════════════════════════════════════════════════

describe('Deploy Block - parsing', () => {
  test('parses minimal deploy block with server and domain', () => {
    const ast = parse('deploy "prod" { server: "root@example.com" domain: "myapp.com" }');
    expect(ast.body).toHaveLength(1);
    expect(ast.body[0].type).toBe('DeployBlock');
    expect(ast.body[0].name).toBe('prod');
    const body = ast.body[0].body;
    expect(body).toHaveLength(2);
    expect(body[0].type).toBe('DeployConfigField');
    expect(body[0].key).toBe('server');
    expect(body[0].value.value).toBe('root@example.com');
    expect(body[1].type).toBe('DeployConfigField');
    expect(body[1].key).toBe('domain');
    expect(body[1].value.value).toBe('myapp.com');
  });

  test('parses deploy block with numeric config', () => {
    const ast = parse('deploy "prod" { instances: 2 }');
    const body = ast.body[0].body;
    expect(body).toHaveLength(1);
    expect(body[0].type).toBe('DeployConfigField');
    expect(body[0].key).toBe('instances');
    expect(body[0].value.value).toBe(2);
  });

  test('parses deploy block with env sub-block', () => {
    const ast = parse(`deploy "prod" {
      env {
        NODE_ENV: "production"
        PORT: 3000
      }
    }`);
    const body = ast.body[0].body;
    expect(body).toHaveLength(1);
    expect(body[0].type).toBe('DeployEnvBlock');
    expect(body[0].entries).toHaveLength(2);
    expect(body[0].entries[0].key).toBe('NODE_ENV');
    expect(body[0].entries[0].value.value).toBe('production');
    expect(body[0].entries[1].key).toBe('PORT');
    expect(body[0].entries[1].value.value).toBe(3000);
  });

  test('parses deploy block with db sub-block (postgres + redis)', () => {
    const ast = parse(`deploy "prod" {
      db {
        postgres {
          name: "myapp_db"
        }
        redis {
        }
      }
    }`);
    const body = ast.body[0].body;
    expect(body).toHaveLength(2);
    expect(body[0].type).toBe('DeployDbBlock');
    expect(body[0].engine).toBe('postgres');
    expect(body[0].config.name).toBeDefined();
    expect(body[0].config.name.value).toBe('myapp_db');
    expect(body[1].type).toBe('DeployDbBlock');
    expect(body[1].engine).toBe('redis');
  });

  test('parses multiple deploy blocks', () => {
    const ast = parse(`
      deploy "staging" {
        server: "root@staging.example.com"
      }
      deploy "prod" {
        server: "root@prod.example.com"
      }
    `);
    expect(ast.body).toHaveLength(2);
    expect(ast.body[0].type).toBe('DeployBlock');
    expect(ast.body[0].name).toBe('staging');
    expect(ast.body[1].type).toBe('DeployBlock');
    expect(ast.body[1].name).toBe('prod');
  });

  test('deploy block requires a name', () => {
    // Without a name string, deploy is not recognized as a deploy block
    const ast = parse('deploy "prod" { server: "root@example.com" }');
    expect(ast.body[0].type).toBe('DeployBlock');
    expect(ast.body[0].name).toBe('prod');

    // Without a name, it won't parse as a deploy block at all
    const ast2 = parse('deploy {}');
    const hasDeployBlock = ast2.body.some(n => n.type === 'DeployBlock');
    expect(hasDeployBlock).toBe(false);
  });

  test('parses deploy block with boolean config', () => {
    const ast = parse('deploy "prod" { restart_on_failure: true }');
    const body = ast.body[0].body;
    expect(body).toHaveLength(1);
    expect(body[0].type).toBe('DeployConfigField');
    expect(body[0].key).toBe('restart_on_failure');
    expect(body[0].value.value).toBe(true);
  });

  test('parses all spec config fields', () => {
    const ast = parse(`deploy "prod" {
      server: "root@example.com"
      domain: "myapp.com"
      instances: 2
      memory: "1gb"
      branch: "main"
      health: "/healthz"
      health_interval: 30
      health_timeout: 5
      restart_on_failure: true
      keep_releases: 5
    }`);
    const body = ast.body[0].body;
    expect(body).toHaveLength(10);
    const keys = body.map(n => n.key);
    expect(keys).toEqual([
      'server', 'domain', 'instances', 'memory', 'branch',
      'health', 'health_interval', 'health_timeout',
      'restart_on_failure', 'keep_releases',
    ]);
    // Verify server keyword-as-config produces correct key string
    expect(body[0].key).toBe('server');
    expect(body[0].value.value).toBe('root@example.com');
  });
});

// ═══════════════════════════════════════════════════════════════
// Analyzer
// ═══════════════════════════════════════════════════════════════

describe('Deploy Block Analyzer', () => {
  test('accepts valid deploy block with server and domain', () => {
    const errors = analyze(`
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
      }
    `);
    const deployErrors = errors.filter(e => e.message?.includes('deploy') || e.message?.includes('Deploy'));
    expect(deployErrors).toHaveLength(0);
  });

  test('rejects deploy block missing server', () => {
    const errors = analyze(`
      deploy "prod" {
        domain: "myapp.com"
      }
    `);
    expect(errors.some(e => e.message?.includes("server"))).toBe(true);
  });

  test('rejects deploy block missing domain', () => {
    const errors = analyze(`
      deploy "prod" {
        server: "root@example.com"
      }
    `);
    expect(errors.some(e => e.message?.includes("domain"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// End-to-End
// ═══════════════════════════════════════════════════════════════

describe('Deploy Block E2E', () => {
  test('full round-trip: parse → analyze → codegen', () => {
    const { CodeGenerator } = require('../src/codegen/codegen.js');

    const code = `
      shared {
        type User {
          id: Int
          name: String
        }
      }

      server {
        route GET "/api/users" => fn() { [] }
      }

      browser {
        state users = []
      }

      deploy "prod" {
        server: "root@prod.example.com"
        domain: "myapp.com"
        instances: 2
        memory: "1gb"
        health: "/healthz"
      }

      deploy "staging" {
        server: "root@staging.example.com"
        domain: "staging.myapp.com"
      }
    `;

    const ast = parse(code);

    // Parser produced correct blocks
    const deployBlocks = ast.body.filter(n => n.type === 'DeployBlock');
    expect(deployBlocks).toHaveLength(2);

    // Analyzer passes (no errors for valid deploy blocks)
    const analyzer = new Analyzer(ast, '<test>', { tolerant: true });
    const result = analyzer.analyze();
    const errors = result.errors || [];
    const deployErrors = errors.filter(e => e.message?.includes('deploy') || e.message?.includes('Deploy'));
    expect(deployErrors).toHaveLength(0);

    // Codegen includes deploy config
    const gen = new CodeGenerator(ast);
    const output = gen.generate();
    expect(output.deploy).toBeDefined();
    expect(output.deploy.prod.server).toBe('root@prod.example.com');
    expect(output.deploy.prod.domain).toBe('myapp.com');
    expect(output.deploy.prod.instances).toBe(2);
    expect(output.deploy.staging.server).toBe('root@staging.example.com');
    expect(output.deploy.staging.domain).toBe('staging.myapp.com');
    expect(output.deploy.staging.instances).toBe(1); // default

    // Server and browser output still work
    expect(output.server).toContain('/api/users');
    expect(output.browser).toBeTruthy();
  });
});
