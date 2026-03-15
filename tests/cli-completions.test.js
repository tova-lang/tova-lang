import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'child_process';
import path from 'path';

const TOVA = path.join(__dirname, '..', 'bin', 'tova.js');

function runTova(args, opts = {}) {
  const timeout = 15000;
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = spawnSync('bun', [TOVA, ...args], {
      encoding: 'utf-8', timeout, ...opts,
    });
    if (result.status === null && attempt < maxAttempts) continue;
    return result;
  }
}

// ─── CLI invocation tests ────────────────────────────────────────

describe('cli-completions: bash', () => {
  test('tova completions bash outputs bash completion script', () => {
    const result = runTova(['completions', 'bash']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('_tova');
    expect(result.stdout).toContain('complete -F _tova tova');
    expect(result.stdout).toContain('COMPREPLY');
    expect(result.stdout).toContain('compgen');
  });

  test('bash completions contain all major commands', () => {
    const result = runTova(['completions', 'bash']);
    const output = result.stdout;
    const commands = ['run', 'build', 'check', 'dev', 'new', 'install', 'repl', 'lsp', 'fmt', 'test', 'bench', 'doc', 'init', 'upgrade', 'info', 'completions'];
    for (const cmd of commands) {
      expect(output).toContain(cmd);
    }
  });

  test('bash completions include flag completions', () => {
    const result = runTova(['completions', 'bash']);
    const output = result.stdout;
    expect(output).toContain('--help');
    expect(output).toContain('--version');
    expect(output).toContain('--production');
    expect(output).toContain('--watch');
    expect(output).toContain('--verbose');
    expect(output).toContain('--quiet');
    expect(output).toContain('--debug');
    expect(output).toContain('--strict');
  });

  test('bash completions include template names for new command', () => {
    const result = runTova(['completions', 'bash']);
    const output = result.stdout;
    expect(output).toContain('fullstack');
    expect(output).toContain('spa');
    expect(output).toContain('api');
    expect(output).toContain('library');
    expect(output).toContain('blank');
  });

  test('bash completions include .tova file completion for run/build', () => {
    const result = runTova(['completions', 'bash']);
    const output = result.stdout;
    expect(output).toContain('*.tova');
  });

  test('bash completions show install hint on stderr', () => {
    const result = runTova(['completions', 'bash']);
    expect(result.stderr).toContain('.bashrc');
  });
});

describe('cli-completions: zsh', () => {
  test('tova completions zsh outputs zsh completion script', () => {
    const result = runTova(['completions', 'zsh']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('#compdef tova');
    expect(result.stdout).toContain('_tova');
    expect(result.stdout).toContain('_arguments');
    expect(result.stdout).toContain('_describe');
  });

  test('zsh completions contain all major commands', () => {
    const result = runTova(['completions', 'zsh']);
    const output = result.stdout;
    const commands = ['run', 'build', 'check', 'dev', 'new', 'install', 'repl', 'lsp', 'fmt', 'test', 'bench', 'doc', 'init', 'upgrade', 'info', 'completions'];
    for (const cmd of commands) {
      expect(output).toContain(cmd);
    }
  });

  test('zsh completions include migrate commands', () => {
    const result = runTova(['completions', 'zsh']);
    const output = result.stdout;
    expect(output).toContain('migrate:create');
    expect(output).toContain('migrate:up');
    expect(output).toContain('migrate:down');
    expect(output).toContain('migrate:reset');
    expect(output).toContain('migrate:fresh');
    expect(output).toContain('migrate:status');
  });

  test('zsh completions include command descriptions as paired entries', () => {
    const result = runTova(['completions', 'zsh']);
    const output = result.stdout;
    // Zsh format: 'command:description'
    expect(output).toContain("'run:run command'");
    expect(output).toContain("'build:build command'");
  });

  test('zsh completions include flag help descriptions', () => {
    const result = runTova(['completions', 'zsh']);
    const output = result.stdout;
    expect(output).toContain('--help[Show help]');
    expect(output).toContain('--version[Show version]');
    expect(output).toContain('--production[Production build]');
  });

  test('zsh completions include template completions for new', () => {
    const result = runTova(['completions', 'zsh']);
    const output = result.stdout;
    expect(output).toContain('--template');
    expect(output).toContain('fullstack');
    expect(output).toContain('spa');
  });

  test('zsh completions include test/bench options', () => {
    const result = runTova(['completions', 'zsh']);
    const output = result.stdout;
    expect(output).toContain('--filter');
    expect(output).toContain('--watch');
    expect(output).toContain('--coverage');
    expect(output).toContain('--serial');
  });

  test('zsh completions show install hint on stderr', () => {
    const result = runTova(['completions', 'zsh']);
    expect(result.stderr).toContain('.zshrc');
  });
});

describe('cli-completions: fish', () => {
  test('tova completions fish outputs fish completion script', () => {
    const result = runTova(['completions', 'fish']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('complete -c tova');
    expect(result.stdout).toContain('__fish_use_subcommand');
  });

  test('fish completions include migrate commands', () => {
    const result = runTova(['completions', 'fish']);
    const output = result.stdout;
    expect(output).toContain("'migrate:create'");
    expect(output).toContain("'migrate:up'");
    expect(output).toContain("'migrate:down'");
    expect(output).toContain("'migrate:reset'");
    expect(output).toContain("'migrate:fresh'");
    expect(output).toContain("'migrate:status'");
  });

  test('fish completions include flag completions', () => {
    const result = runTova(['completions', 'fish']);
    const output = result.stdout;
    expect(output).toContain('-l help');
    expect(output).toContain('-l version');
    expect(output).toContain('-l production');
    expect(output).toContain('-l watch');
    expect(output).toContain('-l verbose');
    expect(output).toContain('-l quiet');
    expect(output).toContain('-l debug');
    expect(output).toContain('-l strict');
  });

  test('fish completions include template completions for new', () => {
    const result = runTova(['completions', 'fish']);
    const output = result.stdout;
    expect(output).toContain('__fish_seen_subcommand_from new');
    expect(output).toContain('fullstack');
    expect(output).toContain('spa');
    expect(output).toContain('site');
    expect(output).toContain('api');
    expect(output).toContain('script');
    expect(output).toContain('library');
    expect(output).toContain('blank');
  });

  test('fish completions include shell completions for completions subcommand', () => {
    const result = runTova(['completions', 'fish']);
    const output = result.stdout;
    expect(output).toContain('__fish_seen_subcommand_from completions');
    expect(output).toContain('bash');
    expect(output).toContain('zsh');
    expect(output).toContain('fish');
  });

  test('fish completions show save hint on stderr', () => {
    const result = runTova(['completions', 'fish']);
    expect(result.stderr).toContain('fish/completions/tova.fish');
  });
});

describe('cli-completions: error handling', () => {
  test('tova completions with no shell argument exits with error', () => {
    const result = runTova(['completions']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Usage');
    expect(result.stderr).toContain('bash|zsh|fish');
  });

  test('tova completions with unknown shell exits with error', () => {
    const result = runTova(['completions', 'powershell']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unknown shell');
    expect(result.stderr).toContain('powershell');
  });

  test('tova completions with unknown shell mentions supported shells', () => {
    const result = runTova(['completions', 'tcsh']);
    expect(result.stderr).toContain('bash');
    expect(result.stderr).toContain('zsh');
    expect(result.stderr).toContain('fish');
  });
});

// ─── Direct import: verify completionsCommand behavior ───────────

import { completionsCommand } from '../src/cli/completions.js';

describe('cli-completions: direct import', () => {
  test('completionsCommand bash writes to stdout', () => {
    const logs = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (...args) => logs.push(args.join(' '));
    console.error = () => {}; // suppress install hints

    completionsCommand('bash');

    console.log = origLog;
    console.error = origErr;

    const output = logs.join('\n');
    expect(output).toContain('_tova');
    expect(output).toContain('complete -F _tova tova');
  });

  test('completionsCommand zsh writes to stdout', () => {
    const logs = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (...args) => logs.push(args.join(' '));
    console.error = () => {};

    completionsCommand('zsh');

    console.log = origLog;
    console.error = origErr;

    const output = logs.join('\n');
    expect(output).toContain('#compdef tova');
    expect(output).toContain('_tova');
  });

  test('completionsCommand fish writes to stdout', () => {
    const logs = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (...args) => logs.push(args.join(' '));
    console.error = () => {};

    completionsCommand('fish');

    console.log = origLog;
    console.error = origErr;

    const output = logs.join('\n');
    expect(output).toContain('complete -c tova');
  });
});
