import { describe, test, expect } from 'bun:test';

describe('Deploy CLI', () => {
  test('parseDeployArgs parses environment name', () => {
    const { parseDeployArgs } = require('../src/deploy/deploy.js');
    const args = parseDeployArgs(['prod']);
    expect(args.envName).toBe('prod');
    expect(args.plan).toBe(false);
    expect(args.rollback).toBe(false);
  });

  test('parseDeployArgs parses --plan flag', () => {
    const { parseDeployArgs } = require('../src/deploy/deploy.js');
    const args = parseDeployArgs(['prod', '--plan']);
    expect(args.envName).toBe('prod');
    expect(args.plan).toBe(true);
  });

  test('parseDeployArgs parses --rollback flag', () => {
    const { parseDeployArgs } = require('../src/deploy/deploy.js');
    const args = parseDeployArgs(['prod', '--rollback']);
    expect(args.rollback).toBe(true);
  });

  test('parseDeployArgs parses --logs with --since', () => {
    const { parseDeployArgs } = require('../src/deploy/deploy.js');
    const args = parseDeployArgs(['prod', '--logs', '--since', '1 hour ago']);
    expect(args.logs).toBe(true);
    expect(args.since).toBe('1 hour ago');
  });

  test('parseDeployArgs parses --status flag', () => {
    const { parseDeployArgs } = require('../src/deploy/deploy.js');
    const args = parseDeployArgs(['prod', '--status']);
    expect(args.status).toBe(true);
  });

  test('parseDeployArgs parses --setup-git flag', () => {
    const { parseDeployArgs } = require('../src/deploy/deploy.js');
    const args = parseDeployArgs(['prod', '--setup-git']);
    expect(args.setupGit).toBe(true);
  });

  test('parseDeployArgs parses --list --server flags', () => {
    const { parseDeployArgs } = require('../src/deploy/deploy.js');
    const args = parseDeployArgs(['--list', '--server', 'root@example.com']);
    expect(args.list).toBe(true);
    expect(args.server).toBe('root@example.com');
  });

  test('parseDeployArgs parses --instance flag', () => {
    const { parseDeployArgs } = require('../src/deploy/deploy.js');
    const args = parseDeployArgs(['prod', '--logs', '--instance', '1']);
    expect(args.instance).toBe(1);
  });
});
