import { describe, test, expect } from 'bun:test';

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
