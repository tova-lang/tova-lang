import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

function parse(source) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
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
});
