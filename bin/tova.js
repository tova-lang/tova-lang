#!/usr/bin/env bun

import { VERSION } from '../src/version.js';
import { lookupCode, getExplanation } from '../src/diagnostics/error-codes.js';
import '../src/runtime/string-proto.js';
import '../src/runtime/array-proto.js';

// ─── CLI Command Modules ────────────────────────────────────
import { runFile } from '../src/cli/run.js';
import { buildProject, cleanBuild } from '../src/cli/build.js';
import { checkProject } from '../src/cli/check.js';
import { devServer } from '../src/cli/dev.js';
import { startRepl } from '../src/cli/repl.js';
import { newProject } from '../src/cli/new.js';
import { initProject, installDeps, addDep, removeDep, updateDeps, cacheCommand } from '../src/cli/package.js';
import { formatFile } from '../src/cli/format.js';
import { runTests, runBench, generateDocs } from '../src/cli/test.js';
import { migrateCreate, migrateUp, migrateDown, migrateReset, migrateFresh, migrateStatus } from '../src/cli/migrate.js';
import { deployCommand } from '../src/cli/deploy.js';
import { upgradeCommand } from '../src/cli/upgrade.js';
import { infoCommand } from '../src/cli/info.js';
import { doctorCommand } from '../src/cli/doctor.js';
import { completionsCommand } from '../src/cli/completions.js';

// ─── Help Text ──────────────────────────────────────────────

const HELP = `
  ╔╦╗╔═╗╦  ╦╔═╗
   ║ ║ ║╚╗╔╝╠═╣
   ╩ ╚═╝ ╚╝ ╩ ╩  v${VERSION}

  Created by Enoch Kujem Abassey
  A modern full-stack language that transpiles to JavaScript

Usage:
  tova <command> [options] [arguments]

Commands:
  run <file>       Compile and execute a .tova file
  build [dir]      Compile .tova files to JavaScript (default: current dir)
  check [dir]      Type-check .tova files without generating code
  clean            Delete .tova-out build artifacts
  dev              Start development server with live reload
  new <name>       Create a new Tova project (--template fullstack|spa|site|api|script|library|blank)
  install          Install dependencies from tova.toml
  add <pkg>        Add a dependency (npm:pkg for npm, github.com/user/repo for Tova)
  remove <pkg>     Remove a dependency
  repl             Start interactive Tova REPL
  lsp              Start Language Server Protocol server
  fmt <file>      Format a .tova file (--check to verify only)
  test [dir]      Run test blocks in .tova files (--filter, --watch, --coverage, --serial)
  bench [dir]     Run bench blocks in .tova files
  doc [dir]       Generate documentation from /// docstrings
  init             Initialize a Tova project in the current directory
  migrate:create <name>   Create a new migration file
  migrate:up [file.tova]   Run pending migrations
  migrate:status [file.tova] Show migration status
  upgrade          Upgrade Tova to the latest version
  info             Show Tova version, Bun version, project config, and installed dependencies
  doctor           Check your development environment
  completions <sh> Generate shell completions (bash, zsh, fish)
  deploy <env>     Deploy to a server (--plan, --rollback, --logs, --status)
  env <env> <cmd>  Manage secrets (list, set KEY=value)
  explain <code>   Show detailed explanation for an error/warning code (e.g., tova explain E202)

Options:
  --help, -h       Show this help message
  --version, -v    Show version
  --output, -o     Output directory (default: .tova-out)
  --production     Production build (minify, bundle, hash)
  --watch          Watch for file changes and rebuild
  --verbose        Show detailed output during compilation
  --quiet          Suppress non-error output
  --debug          Show verbose error output
  --static         Pre-render routes to static HTML files (used with --production)
  --strict         Enable strict type checking
  --strict-security Promote security warnings to errors
`;

// ─── LSP (inline — 3 lines) ────────────────────────────────

async function startLsp() {
  await import('../src/lsp/server.js');
}

// ─── Main Dispatcher ────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`Tova v${VERSION}`);
    process.exit(0);
  }

  const command = args[0];

  const isStrict = args.includes('--strict');
  const isStrictSecurity = args.includes('--strict-security');
  switch (command) {
    case 'run': {
      const runArgs = args.filter(a => a !== '--strict' && a !== '--strict-security');
      const filePath = runArgs[1];
      const restArgs = runArgs.slice(2);
      const ddIdx = restArgs.indexOf('--');
      const scriptArgs = ddIdx !== -1 ? restArgs.slice(ddIdx + 1) : restArgs;
      await runFile(filePath, { strict: isStrict, strictSecurity: isStrictSecurity, scriptArgs });
      break;
    }
    case 'build':
      await buildProject(args.slice(1));
      break;
    case 'check':
      await checkProject(args.slice(1));
      break;
    case 'clean':
      cleanBuild(args.slice(1));
      break;
    case 'dev':
      await devServer(args.slice(1));
      break;
    case 'repl':
      await startRepl();
      break;
    case 'lsp':
      await startLsp();
      break;
    case 'new':
      await newProject(args.slice(1));
      break;
    case 'init':
      initProject();
      break;
    case 'install':
      await installDeps();
      break;
    case 'add':
      await addDep(args.slice(1));
      break;
    case 'remove':
      await removeDep(args[1]);
      break;
    case 'update':
      await updateDeps(args);
      break;
    case 'cache':
      await cacheCommand(args);
      break;
    case 'fmt':
      formatFile(args.slice(1));
      break;
    case 'test':
      await runTests(args.slice(1));
      break;
    case 'bench':
      await runBench(args.slice(1));
      break;
    case 'doc':
      await generateDocs(args.slice(1));
      break;
    case 'migrate:create':
      migrateCreate(args[1]);
      break;
    case 'migrate:up':
      await migrateUp(args.slice(1));
      break;
    case 'migrate:down':
      await migrateDown(args.slice(1));
      break;
    case 'migrate:reset':
      await migrateReset(args.slice(1));
      break;
    case 'migrate:fresh':
      await migrateFresh(args.slice(1));
      break;
    case 'migrate:status':
      await migrateStatus(args.slice(1));
      break;
    case 'deploy':
      await deployCommand(args.slice(1));
      break;
    case 'explain': {
      const code = args[1];
      if (!code) {
        console.error('Usage: tova explain <error-code>  (e.g., tova explain E202)');
        process.exit(1);
      }
      const info = lookupCode(code);
      if (!info) {
        console.error(`Unknown error code: ${code}`);
        process.exit(1);
      }
      const explanation = getExplanation(code);
      console.log(`\n  ${code}: ${info.title} [${info.category}]\n`);
      if (explanation) {
        console.log(explanation);
      } else {
        console.log(`  No detailed explanation available yet for ${code}.\n`);
      }
      break;
    }
    case 'upgrade':
      await upgradeCommand();
      break;
    case 'info':
      await infoCommand();
      break;
    case 'doctor':
      await doctorCommand();
      break;
    case 'completions':
      completionsCommand(args[1]);
      break;
    default:
      if (command.endsWith('.tova')) {
        const directArgs = args.filter(a => a !== '--strict' && a !== '--strict-security').slice(1);
        const ddIdx = directArgs.indexOf('--');
        const scriptArgs = ddIdx !== -1 ? directArgs.slice(ddIdx + 1) : directArgs;
        await runFile(command, { strict: isStrict, strictSecurity: isStrictSecurity, scriptArgs });
      } else {
        console.error(`Unknown command: ${command}`);
        console.log(HELP);
        process.exit(1);
      }
  }
}

main();
