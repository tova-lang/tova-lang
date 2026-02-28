import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { CodeGenerator } from '../src/codegen/codegen.js';

function compile(code) {
  const lexer = new Lexer(code);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return new CodeGenerator(ast).generate();
}

describe('Deploy Codegen', () => {
  test('mergeDeployBlocks extracts config fields', () => {
    const { DeployCodegen } = require('../src/codegen/deploy-codegen.js');
    const blocks = [{
      type: 'DeployBlock', name: 'prod',
      body: [
        { type: 'DeployConfigField', key: 'server', value: { type: 'StringLiteral', value: 'root@example.com' } },
        { type: 'DeployConfigField', key: 'domain', value: { type: 'StringLiteral', value: 'myapp.com' } },
        { type: 'DeployConfigField', key: 'instances', value: { type: 'NumberLiteral', value: 2 } },
      ],
    }];
    const config = DeployCodegen.mergeDeployBlocks(blocks);
    expect(config.server).toBe('root@example.com');
    expect(config.domain).toBe('myapp.com');
    expect(config.instances).toBe(2);
  });

  test('mergeDeployBlocks extracts env entries', () => {
    const { DeployCodegen } = require('../src/codegen/deploy-codegen.js');
    const blocks = [{
      type: 'DeployBlock', name: 'prod',
      body: [{
        type: 'DeployEnvBlock',
        entries: [
          { key: 'NODE_ENV', value: { type: 'StringLiteral', value: 'production' } },
        ],
      }],
    }];
    const config = DeployCodegen.mergeDeployBlocks(blocks);
    expect(config.env).toEqual({ NODE_ENV: 'production' });
  });

  test('mergeDeployBlocks extracts db overrides', () => {
    const { DeployCodegen } = require('../src/codegen/deploy-codegen.js');
    const blocks = [{
      type: 'DeployBlock', name: 'prod',
      body: [
        { type: 'DeployDbBlock', engine: 'postgres', config: { name: { type: 'StringLiteral', value: 'myapp_db' } } },
        { type: 'DeployDbBlock', engine: 'redis', config: {} },
      ],
    }];
    const config = DeployCodegen.mergeDeployBlocks(blocks);
    expect(config.databases).toHaveLength(2);
    expect(config.databases[0].engine).toBe('postgres');
    expect(config.databases[0].config.name).toBe('myapp_db');
    expect(config.databases[1].engine).toBe('redis');
  });

  test('applies defaults for missing config', () => {
    const { DeployCodegen } = require('../src/codegen/deploy-codegen.js');
    const blocks = [{
      type: 'DeployBlock', name: 'prod',
      body: [
        { type: 'DeployConfigField', key: 'server', value: { value: 'root@example.com' } },
        { type: 'DeployConfigField', key: 'domain', value: { value: 'myapp.com' } },
      ],
    }];
    const config = DeployCodegen.mergeDeployBlocks(blocks);
    expect(config.instances).toBe(1);
    expect(config.memory).toBe('512mb');
    expect(config.branch).toBe('main');
    expect(config.health).toBe('/healthz');
    expect(config.health_interval).toBe(30);
    expect(config.keep_releases).toBe(5);
    expect(config.restart_on_failure).toBe(true);
  });
});

describe('Deploy Codegen Integration', () => {
  test('deploy blocks do not affect server output', () => {
    const result = compile(`
      server {
        route GET "/hello" => fn() { "hello" }
      }
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
      }
    `);
    expect(result.server).toContain('hello');
    expect(result.server).not.toContain('root@example.com');
  });

  test('deploy blocks are available in output', () => {
    const result = compile(`
      server {
        route GET "/hello" => fn() { "hello" }
      }
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
      }
    `);
    expect(result.deploy).toBeDefined();
    expect(result.deploy.prod).toBeDefined();
    expect(result.deploy.prod.server).toBe('root@example.com');
    expect(result.deploy.prod.domain).toBe('myapp.com');
  });

  test('multiple deploy blocks produce separate configs', () => {
    const result = compile(`
      deploy "prod" {
        server: "root@prod.example.com"
        domain: "myapp.com"
      }
      deploy "staging" {
        server: "root@staging.example.com"
        domain: "staging.myapp.com"
      }
    `);
    expect(result.deploy.prod.server).toBe('root@prod.example.com');
    expect(result.deploy.staging.server).toBe('root@staging.example.com');
  });

  test('deploy defaults are applied in codegen output', () => {
    const result = compile(`
      deploy "prod" {
        server: "root@example.com"
        domain: "myapp.com"
      }
    `);
    expect(result.deploy.prod.instances).toBe(1);
    expect(result.deploy.prod.memory).toBe('512mb');
    expect(result.deploy.prod.health).toBe('/healthz');
  });
});
