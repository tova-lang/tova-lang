import { describe, test, expect } from 'bun:test';

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
