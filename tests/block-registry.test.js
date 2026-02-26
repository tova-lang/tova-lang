import { describe, test, expect } from 'bun:test';
import { BlockRegistry } from '../src/registry/register-all.js';

describe('BlockRegistry', () => {
  test('all() returns 8 built-in plugins in registration order', () => {
    const all = BlockRegistry.all();
    expect(all.length).toBe(8);
    expect(all.map(p => p.name)).toEqual([
      'server', 'client', 'shared', 'security', 'cli', 'data', 'test', 'bench',
    ]);
  });

  test('get() returns plugin by name', () => {
    expect(BlockRegistry.get('server').name).toBe('server');
    expect(BlockRegistry.get('cli').name).toBe('cli');
    expect(BlockRegistry.get('nonexistent')).toBeNull();
  });

  test('getByAstType() returns plugin for primary AST node type', () => {
    expect(BlockRegistry.getByAstType('ServerBlock').name).toBe('server');
    expect(BlockRegistry.getByAstType('ClientBlock').name).toBe('client');
    expect(BlockRegistry.getByAstType('SharedBlock').name).toBe('shared');
    expect(BlockRegistry.getByAstType('SecurityBlock').name).toBe('security');
    expect(BlockRegistry.getByAstType('CliBlock').name).toBe('cli');
    expect(BlockRegistry.getByAstType('DataBlock').name).toBe('data');
    expect(BlockRegistry.getByAstType('TestBlock').name).toBe('test');
    expect(BlockRegistry.getByAstType('BenchBlock').name).toBe('bench');
  });

  test('getByAstType() returns plugin for child node types', () => {
    // Server child types
    expect(BlockRegistry.getByAstType('RouteDeclaration').name).toBe('server');
    expect(BlockRegistry.getByAstType('MiddlewareDeclaration').name).toBe('server');
    expect(BlockRegistry.getByAstType('WebSocketDeclaration').name).toBe('server');
    expect(BlockRegistry.getByAstType('ModelDeclaration').name).toBe('server');

    // Client child types
    expect(BlockRegistry.getByAstType('StateDeclaration').name).toBe('client');
    expect(BlockRegistry.getByAstType('ComponentDeclaration').name).toBe('client');
    expect(BlockRegistry.getByAstType('StoreDeclaration').name).toBe('client');
  });

  test('getByAstType() returns null for unknown types', () => {
    expect(BlockRegistry.getByAstType('FunctionDeclaration')).toBeNull();
    expect(BlockRegistry.getByAstType('Assignment')).toBeNull();
  });

  test('isNoopType() identifies leaf AST types', () => {
    // Security leaf types
    expect(BlockRegistry.isNoopType('SecurityAuthDeclaration')).toBe(true);
    expect(BlockRegistry.isNoopType('SecurityRoleDeclaration')).toBe(true);
    expect(BlockRegistry.isNoopType('SecurityCsrfDeclaration')).toBe(true);

    // CLI leaf types
    expect(BlockRegistry.isNoopType('CliConfigField')).toBe(true);
    expect(BlockRegistry.isNoopType('CliCommandDeclaration')).toBe(true);
    expect(BlockRegistry.isNoopType('CliParam')).toBe(true);

    // Data leaf types
    expect(BlockRegistry.isNoopType('SourceDeclaration')).toBe(true);
    expect(BlockRegistry.isNoopType('PipelineDeclaration')).toBe(true);

    // Server noop
    expect(BlockRegistry.isNoopType('AiConfigDeclaration')).toBe(true);

    // Non-noop types
    expect(BlockRegistry.isNoopType('FunctionDeclaration')).toBe(false);
    expect(BlockRegistry.isNoopType('ServerBlock')).toBe(false);
  });

  test('each plugin has required fields', () => {
    for (const plugin of BlockRegistry.all()) {
      expect(plugin.name).toBeString();
      expect(plugin.astNodeType).toBeString();
      expect(plugin.detection).toBeDefined();
      expect(plugin.detection.strategy).toMatch(/^(keyword|identifier)$/);
      expect(plugin.parser).toBeDefined();
      expect(plugin.parser.method).toBeString();
    }
  });

  test('keyword-strategy plugins have tokenType', () => {
    const keywords = BlockRegistry.all().filter(p => p.detection.strategy === 'keyword');
    expect(keywords.length).toBe(3); // server, client, shared
    for (const p of keywords) {
      expect(p.detection.tokenType).toBeString();
    }
  });

  test('identifier-strategy plugins have identifierValue', () => {
    const ids = BlockRegistry.all().filter(p => p.detection.strategy === 'identifier');
    expect(ids.length).toBe(5); // security, cli, data, test, bench
    for (const p of ids) {
      expect(p.detection.identifierValue).toBeString();
    }
  });

  test('cli plugin has earlyReturn flag', () => {
    const cli = BlockRegistry.get('cli');
    expect(cli.codegen.earlyReturn).toBe(true);
  });

  test('cli plugin has earlyReturnMethod', () => {
    const cli = BlockRegistry.get('cli');
    expect(cli.codegen.earlyReturnMethod).toBe('_generateCli');
  });

  test('NOOP sentinel is used for noop types in getByAstType', () => {
    expect(BlockRegistry.getByAstType('CliConfigField')).toBe(BlockRegistry.NOOP);
    expect(BlockRegistry.getByAstType('SecurityAuthDeclaration')).toBe(BlockRegistry.NOOP);
    expect(BlockRegistry.getByAstType('SourceDeclaration')).toBe(BlockRegistry.NOOP);
    // Non-noop block types return the plugin, not NOOP
    expect(BlockRegistry.getByAstType('ServerBlock')).not.toBe(BlockRegistry.NOOP);
  });

  test('plugins with crossBlockValidate have analyzer hooks', () => {
    const sec = BlockRegistry.get('security');
    expect(typeof sec.analyzer.crossBlockValidate).toBe('function');
    const cli = BlockRegistry.get('cli');
    expect(typeof cli.analyzer.crossBlockValidate).toBe('function');
  });

  test('server plugin has prePass hook', () => {
    const server = BlockRegistry.get('server');
    expect(typeof server.analyzer.prePass).toBe('function');
  });

  test('test and bench plugins have custom lookahead', () => {
    const testP = BlockRegistry.get('test');
    expect(typeof testP.detection.lookahead).toBe('function');
    const benchP = BlockRegistry.get('bench');
    expect(typeof benchP.detection.lookahead).toBe('function');
  });
});

describe('BlockRegistry integration', () => {
  test('parser uses registry for block detection', () => {
    // Verify the Parser imports and uses BlockRegistry
    const { Parser } = require('../src/parser/parser.js');
    expect(typeof Parser.prototype._matchesBlock).toBe('function');
  });

  test('duplicate registration throws', () => {
    // BlockRegistry is a singleton, already registered. Trying to re-register should throw.
    const { BlockRegistry: BR } = require('../src/registry/block-registry.js');
    expect(() => BR.register({ name: 'server', astNodeType: 'ServerBlock' })).toThrow(/already registered/);
  });
});
