import { describe, test, expect } from 'bun:test';
import { inferInfrastructure } from '../src/deploy/infer.js';

// Helper: build a minimal Program AST from a body array
function program(body) {
  return { type: 'Program', body };
}

// Helper: build a ServerBlock AST node
function serverBlock(body = []) {
  return { type: 'ServerBlock', name: null, body, loc: { line: 1, col: 0 } };
}

// Helper: build a BrowserBlock AST node
function browserBlock(body = []) {
  return { type: 'BrowserBlock', name: null, body, loc: { line: 1, col: 0 } };
}

// Helper: build a SecurityBlock AST node
function securityBlock(body = []) {
  return { type: 'SecurityBlock', body, loc: { line: 1, col: 0 } };
}

// Helper: build a DeployBlock AST node
function deployBlock(name, body = []) {
  return { type: 'DeployBlock', name, body, loc: { line: 1, col: 0 } };
}

// Helper: build an env() call expression node
function envCall(secretName) {
  return {
    type: 'CallExpression',
    callee: { type: 'Identifier', name: 'env', loc: { line: 1, col: 0 } },
    arguments: [{ type: 'StringLiteral', value: secretName, loc: { line: 1, col: 0 } }],
    loc: { line: 1, col: 0 },
  };
}

describe('Infrastructure Inference', () => {
  test('returns correct defaults for empty AST', () => {
    const manifest = inferInfrastructure(program([]));
    expect(manifest.name).toBeNull();
    expect(manifest.server).toBeNull();
    expect(manifest.domain).toBeNull();
    expect(manifest.instances).toBe(1);
    expect(manifest.memory).toBe('512mb');
    expect(manifest.branch).toBe('main');
    expect(manifest.health).toBe('/healthz');
    expect(manifest.health_interval).toBe(30);
    expect(manifest.health_timeout).toBe(5);
    expect(manifest.restart_on_failure).toBe(true);
    expect(manifest.keep_releases).toBe(5);
    expect(manifest.env).toEqual({});
    expect(manifest.databases).toEqual([]);
    expect(manifest.requires).toEqual({ bun: false, caddy: false, ufw: false });
    expect(manifest.hasWebSocket).toBe(false);
    expect(manifest.hasSSE).toBe(false);
    expect(manifest.hasBrowser).toBe(false);
    expect(manifest.requiredSecrets).toEqual([]);
    expect(manifest.blockTypes).toEqual([]);
  });

  test('infers Bun + Caddy + UFW from server block presence', () => {
    const ast = program([serverBlock()]);
    const manifest = inferInfrastructure(ast);
    expect(manifest.requires.bun).toBe(true);
    expect(manifest.requires.caddy).toBe(true);
    expect(manifest.requires.ufw).toBe(true);
    expect(manifest.blockTypes).toContain('server');
  });

  test('infers hasBrowser from browser block presence', () => {
    const ast = program([browserBlock()]);
    const manifest = inferInfrastructure(ast);
    expect(manifest.hasBrowser).toBe(true);
    expect(manifest.blockTypes).toContain('browser');
  });

  test('infers required secrets from security auth jwt config', () => {
    const ast = program([
      securityBlock([
        {
          type: 'SecurityAuthDeclaration',
          authType: 'jwt',
          config: {
            secret: envCall('JWT_SECRET'),
            expires: { type: 'NumberLiteral', value: 86400, loc: { line: 1, col: 0 } },
          },
          loc: { line: 1, col: 0 },
        },
      ]),
    ]);
    const manifest = inferInfrastructure(ast);
    expect(manifest.requiredSecrets).toContain('JWT_SECRET');
    expect(manifest.blockTypes).toContain('security');
  });

  test('infers multiple secrets from security block', () => {
    const ast = program([
      securityBlock([
        {
          type: 'SecurityAuthDeclaration',
          authType: 'jwt',
          config: {
            secret: envCall('JWT_SECRET'),
            refresh_secret: envCall('REFRESH_SECRET'),
          },
          loc: { line: 1, col: 0 },
        },
      ]),
    ]);
    const manifest = inferInfrastructure(ast);
    expect(manifest.requiredSecrets).toContain('JWT_SECRET');
    expect(manifest.requiredSecrets).toContain('REFRESH_SECRET');
    expect(manifest.requiredSecrets).toHaveLength(2);
  });

  test('infers WebSocket from WebSocketDeclaration in server block', () => {
    const ast = program([
      serverBlock([
        { type: 'WebSocketDeclaration', handlers: {}, config: null, loc: { line: 1, col: 0 } },
      ]),
    ]);
    const manifest = inferInfrastructure(ast);
    expect(manifest.hasWebSocket).toBe(true);
  });

  test('infers SSE from SseDeclaration in server block', () => {
    const ast = program([
      serverBlock([
        { type: 'SseDeclaration', path: '/events', params: [], body: { type: 'BlockStatement', body: [] }, loc: { line: 1, col: 0 } },
      ]),
    ]);
    const manifest = inferInfrastructure(ast);
    expect(manifest.hasSSE).toBe(true);
  });

  test('infers SQLite database from DbDeclaration in server block', () => {
    const ast = program([
      serverBlock([
        {
          type: 'DbDeclaration',
          config: {
            path: { type: 'StringLiteral', value: './data.sqlite', loc: { line: 1, col: 0 } },
          },
          loc: { line: 1, col: 0 },
        },
      ]),
    ]);
    const manifest = inferInfrastructure(ast);
    expect(manifest.databases).toHaveLength(1);
    expect(manifest.databases[0].engine).toBe('sqlite');
    expect(manifest.databases[0].config.path).toBe('./data.sqlite');
  });

  test('merges inferred and declared databases without duplicates', () => {
    const ast = program([
      // Server block with sqlite db
      serverBlock([
        {
          type: 'DbDeclaration',
          config: {
            path: { type: 'StringLiteral', value: ':memory:', loc: { line: 1, col: 0 } },
          },
          loc: { line: 1, col: 0 },
        },
      ]),
      // Deploy block declares postgres
      deployBlock('prod', [
        { type: 'DeployDbBlock', engine: 'postgres', config: { name: { type: 'StringLiteral', value: 'myapp_db' } } },
      ]),
    ]);
    const manifest = inferInfrastructure(ast);
    // Should have both postgres (declared) and sqlite (inferred)
    expect(manifest.databases).toHaveLength(2);
    const engines = manifest.databases.map(d => d.engine);
    expect(engines).toContain('postgres');
    expect(engines).toContain('sqlite');
  });

  test('does not duplicate database when inferred engine matches declared engine', () => {
    const ast = program([
      // Server block with sqlite db
      serverBlock([
        {
          type: 'DbDeclaration',
          config: {
            path: { type: 'StringLiteral', value: './data.sqlite', loc: { line: 1, col: 0 } },
          },
          loc: { line: 1, col: 0 },
        },
      ]),
      // Deploy block also declares sqlite
      deployBlock('prod', [
        { type: 'DeployDbBlock', engine: 'sqlite', config: {} },
      ]),
    ]);
    const manifest = inferInfrastructure(ast);
    expect(manifest.databases).toHaveLength(1);
    expect(manifest.databases[0].engine).toBe('sqlite');
  });

  test('merges deploy block config into manifest', () => {
    const ast = program([
      deployBlock('prod', [
        { type: 'DeployConfigField', key: 'server', value: { type: 'StringLiteral', value: 'root@example.com' } },
        { type: 'DeployConfigField', key: 'domain', value: { type: 'StringLiteral', value: 'myapp.com' } },
        { type: 'DeployConfigField', key: 'instances', value: { type: 'NumberLiteral', value: 3 } },
        { type: 'DeployConfigField', key: 'memory', value: { type: 'StringLiteral', value: '1gb' } },
      ]),
    ]);
    const manifest = inferInfrastructure(ast);
    expect(manifest.name).toBe('prod');
    expect(manifest.server).toBe('root@example.com');
    expect(manifest.domain).toBe('myapp.com');
    expect(manifest.instances).toBe(3);
    expect(manifest.memory).toBe('1gb');
  });

  test('merges deploy block env into manifest', () => {
    const ast = program([
      deployBlock('prod', [
        {
          type: 'DeployEnvBlock',
          entries: [
            { key: 'NODE_ENV', value: { type: 'StringLiteral', value: 'production' } },
            { key: 'PORT', value: { type: 'NumberLiteral', value: 3000 } },
          ],
        },
      ]),
    ]);
    const manifest = inferInfrastructure(ast);
    expect(manifest.env.NODE_ENV).toBe('production');
    expect(manifest.env.PORT).toBe(3000);
  });

  test('collects all block types present', () => {
    const ast = program([
      serverBlock(),
      browserBlock(),
      securityBlock(),
      deployBlock('prod', [
        { type: 'DeployConfigField', key: 'server', value: { value: 'root@example.com' } },
        { type: 'DeployConfigField', key: 'domain', value: { value: 'myapp.com' } },
      ]),
    ]);
    const manifest = inferInfrastructure(ast);
    expect(manifest.blockTypes).toContain('server');
    expect(manifest.blockTypes).toContain('browser');
    expect(manifest.blockTypes).toContain('security');
    expect(manifest.blockTypes).toContain('deploy');
    expect(manifest.blockTypes).toHaveLength(4);
  });

  test('handles null/undefined AST gracefully', () => {
    expect(inferInfrastructure(null).blockTypes).toEqual([]);
    expect(inferInfrastructure({}).blockTypes).toEqual([]);
    expect(inferInfrastructure({ body: null }).blockTypes).toEqual([]);
  });

  test('detects WebSocket inside RouteGroupDeclaration', () => {
    const ast = program([
      serverBlock([
        {
          type: 'RouteGroupDeclaration',
          prefix: '/api',
          body: [
            { type: 'WebSocketDeclaration', handlers: {}, config: null, loc: { line: 1, col: 0 } },
          ],
          version: null,
          loc: { line: 1, col: 0 },
        },
      ]),
    ]);
    const manifest = inferInfrastructure(ast);
    expect(manifest.hasWebSocket).toBe(true);
  });
});
