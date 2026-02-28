import { describe, test, expect } from 'bun:test';
import {
  generateProvisionScript,
  generateSystemdService,
  generateCaddyConfig,
} from '../src/deploy/provision.js';

// Helper: minimal manifest with defaults
function baseManifest(overrides = {}) {
  return {
    name: 'myapp',
    server: 'root@example.com',
    domain: 'myapp.com',
    instances: 1,
    memory: '512mb',
    branch: 'main',
    health: '/healthz',
    health_interval: 30,
    health_timeout: 5,
    restart_on_failure: true,
    keep_releases: 5,
    env: { NODE_ENV: 'production' },
    databases: [],
    requires: { bun: true, caddy: true, ufw: true },
    hasWebSocket: false,
    hasSSE: false,
    hasBrowser: false,
    requiredSecrets: [],
    blockTypes: ['server', 'deploy'],
    ...overrides,
  };
}

describe('generateProvisionScript', () => {
  test('starts with shebang and set -euo pipefail', () => {
    const script = generateProvisionScript(baseManifest());
    expect(script.startsWith('#!/bin/bash\nset -euo pipefail')).toBe(true);
  });

  test('includes Bun installation with idempotent check', () => {
    const script = generateProvisionScript(baseManifest());
    expect(script).toContain('if ! command -v bun &>/dev/null; then');
    expect(script).toContain('curl -fsSL https://bun.sh/install | bash');
  });

  test('includes Caddy installation with idempotent check', () => {
    const script = generateProvisionScript(baseManifest());
    expect(script).toContain('if ! command -v caddy &>/dev/null; then');
    expect(script).toContain('apt-get install -y -qq caddy');
  });

  test('includes PostgreSQL when declared', () => {
    const script = generateProvisionScript(baseManifest({
      databases: [{ engine: 'postgres', config: { name: 'myapp_db' } }],
    }));
    expect(script).toContain('if ! command -v psql &>/dev/null; then');
    expect(script).toContain('apt-get install -y -qq postgresql postgresql-contrib');
    expect(script).toContain('myapp_db');
  });

  test('includes Redis when declared', () => {
    const script = generateProvisionScript(baseManifest({
      databases: [{ engine: 'redis', config: {} }],
    }));
    expect(script).toContain('if ! command -v redis-server &>/dev/null; then');
    expect(script).toContain('apt-get install -y -qq redis-server');
  });

  test('does not include PostgreSQL when not declared', () => {
    const script = generateProvisionScript(baseManifest());
    expect(script).not.toContain('postgresql');
  });

  test('does not include Redis when not declared', () => {
    const script = generateProvisionScript(baseManifest());
    expect(script).not.toContain('redis-server');
  });

  test('script is idempotent — uses command -v checks', () => {
    const script = generateProvisionScript(baseManifest({
      databases: [
        { engine: 'postgres', config: { name: 'db' } },
        { engine: 'redis', config: {} },
      ],
    }));
    // Count all idempotent checks
    const checks = script.match(/if ! command -v .+ &>\/dev\/null; then/g);
    expect(checks).not.toBeNull();
    // Should have checks for bun, caddy, psql, and redis-server
    expect(checks.length).toBeGreaterThanOrEqual(4);
  });

  test('creates app directories', () => {
    const script = generateProvisionScript(baseManifest());
    expect(script).toContain('mkdir -p "$APP_DIR/releases"');
    expect(script).toContain('mkdir -p "$APP_DIR/shared/logs"');
    expect(script).toContain('/opt/myapp');
  });

  test('configures UFW firewall', () => {
    const script = generateProvisionScript(baseManifest());
    expect(script).toContain('ufw allow 22/tcp');
    expect(script).toContain('ufw allow 80/tcp');
    expect(script).toContain('ufw allow 443/tcp');
  });

  test('creates tova system user', () => {
    const script = generateProvisionScript(baseManifest());
    expect(script).toContain('useradd --system --create-home --shell /bin/bash tova');
  });

  test('writes systemd service unit', () => {
    const script = generateProvisionScript(baseManifest());
    expect(script).toContain('cat > /etc/systemd/system/myapp@.service');
    expect(script).toContain('systemctl daemon-reload');
    expect(script).toContain('systemctl enable myapp@3000');
  });

  test('writes Caddy config when domain is set', () => {
    const script = generateProvisionScript(baseManifest());
    expect(script).toContain("cat > /etc/caddy/Caddyfile");
    expect(script).toContain('myapp.com {');
    expect(script).toContain('systemctl reload caddy');
  });

  test('enables multiple instances', () => {
    const script = generateProvisionScript(baseManifest({ instances: 3 }));
    expect(script).toContain('systemctl enable myapp@3000');
    expect(script).toContain('systemctl enable myapp@3001');
    expect(script).toContain('systemctl enable myapp@3002');
  });

  test('skips Bun installation if not required', () => {
    const script = generateProvisionScript(baseManifest({
      requires: { bun: false, caddy: false, ufw: false },
    }));
    expect(script).not.toContain('curl -fsSL https://bun.sh/install');
  });
});

describe('generateSystemdService', () => {
  test('generates service with correct memory limit', () => {
    const service = generateSystemdService('myapp', { memory: '512mb' });
    expect(service).toContain('MemoryMax=512M');
  });

  test('generates service with gb memory', () => {
    const service = generateSystemdService('myapp', { memory: '1gb' });
    expect(service).toContain('MemoryMax=1024M');
  });

  test('uses %i template for port', () => {
    const service = generateSystemdService('myapp', {});
    expect(service).toContain('--port %i');
    expect(service).toContain('Description=myapp instance on port %i');
    expect(service).toContain('Environment=PORT=%i');
  });

  test('sets Restart=on-failure when restart_on_failure is true', () => {
    const service = generateSystemdService('myapp', { restart_on_failure: true });
    expect(service).toContain('Restart=on-failure');
  });

  test('sets Restart=no when restart_on_failure is false', () => {
    const service = generateSystemdService('myapp', { restart_on_failure: false });
    expect(service).toContain('Restart=no');
  });

  test('includes custom environment variables', () => {
    const service = generateSystemdService('myapp', {
      env: { DATABASE_URL: 'postgres://localhost/db', SECRET: 'abc123' },
    });
    expect(service).toContain('Environment=DATABASE_URL=postgres://localhost/db');
    expect(service).toContain('Environment=SECRET=abc123');
  });

  test('runs as tova user', () => {
    const service = generateSystemdService('myapp', {});
    expect(service).toContain('User=tova');
    expect(service).toContain('Group=tova');
  });

  test('sets WorkingDirectory to /opt/appName/current', () => {
    const service = generateSystemdService('myapp', {});
    expect(service).toContain('WorkingDirectory=/opt/myapp/current');
  });
});

describe('generateCaddyConfig', () => {
  test('generates config with domain', () => {
    const config = generateCaddyConfig('myapp', { domain: 'myapp.com' });
    expect(config).toContain('myapp.com {');
  });

  test('generates config with single upstream', () => {
    const config = generateCaddyConfig('myapp', { domain: 'myapp.com', instances: 1 });
    expect(config).toContain('reverse_proxy localhost:3000 {');
  });

  test('generates config with multiple upstreams and round_robin', () => {
    const config = generateCaddyConfig('myapp', { domain: 'myapp.com', instances: 3 });
    expect(config).toContain('reverse_proxy localhost:3000 localhost:3001 localhost:3002 {');
    expect(config).toContain('lb_policy round_robin');
  });

  test('includes health check', () => {
    const config = generateCaddyConfig('myapp', { domain: 'myapp.com', health: '/healthz' });
    expect(config).toContain('health_uri /healthz');
    expect(config).toContain('health_interval 30s');
    expect(config).toContain('health_timeout 5s');
  });

  test('includes WebSocket support when hasWebSocket is true', () => {
    const config = generateCaddyConfig('myapp', {
      domain: 'myapp.com',
      hasWebSocket: true,
    });
    expect(config).toContain('@websocket');
    expect(config).toContain('header Connection *Upgrade*');
    expect(config).toContain('header Upgrade websocket');
    expect(config).toContain('reverse_proxy @websocket localhost:3000');
  });

  test('does not include WebSocket matcher when hasWebSocket is false', () => {
    const config = generateCaddyConfig('myapp', {
      domain: 'myapp.com',
      hasWebSocket: false,
    });
    expect(config).not.toContain('@websocket');
  });

  test('includes logging', () => {
    const config = generateCaddyConfig('myapp', { domain: 'myapp.com' });
    expect(config).toContain('log {');
    expect(config).toContain('output file /var/log/caddy/myapp.log');
  });

  test('WebSocket with multiple instances lists all upstreams', () => {
    const config = generateCaddyConfig('myapp', {
      domain: 'myapp.com',
      instances: 2,
      hasWebSocket: true,
    });
    expect(config).toContain('reverse_proxy @websocket localhost:3000 localhost:3001');
  });
});
