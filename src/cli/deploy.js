import { resolve } from 'path';
import { readFileSync, statSync } from 'fs';
import { createInterface } from 'readline';
import { color, findFiles } from './utils.js';
import { resolveConfig } from '../config/resolve.js';
import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { Program } from '../parser/ast.js';
import { CodeGenerator } from '../codegen/codegen.js';

export async function deployCommand(args) {
  const { parseDeployArgs, deploy } = await import('../deploy/deploy.js');
  const { makeRunner, realExecutor, makeDryRunExecutor } = await import('../deploy/ssh-runner.js');
  const { buildProject } = await import('./build.js');

  const deployArgs = parseDeployArgs(args);

  if (!deployArgs.envName && !deployArgs.list) {
    console.error(color.red('Error: deploy requires an environment name (e.g., tova deploy prod)'));
    process.exit(1);
  }

  const projectDir = process.cwd();
  const isDryRun = process.env.TOVA_DEPLOY_DRY_RUN === '1';
  const executor = isDryRun ? makeDryRunExecutor() : realExecutor;
  const runner = makeRunner(executor);

  deployArgs.confirm = isDryRun ? null : promptConfirm;

  if (isDryRun) {
    console.log(color.cyan('  [dry-run] No SSH commands will be executed.'));
  }

  // --list with no env: skip parsing the project
  if (deployArgs.list && !deployArgs.envName) {
    if (!deployArgs.server) {
      console.error(color.red('Error: --list requires --server <user@host> when no environment is specified'));
      process.exit(1);
    }
    try {
      await deploy({ type: 'Program', body: [] }, {}, deployArgs, projectDir, runner);
    } catch (err) {
      console.error(color.red(`Error: ${err.message}`));
      process.exit(1);
    }
    return;
  }

  const config = resolveConfig(projectDir);
  const entry = resolve(config.project?.entry || '.');
  const scanDir = existsDir(entry) ? entry : projectDir;
  // Run the production build using the resolved scanDir so the deploy command
  // honours the same fallback (entry → project root) as the deploy parser.
  deployArgs.buildProject = (extraArgs) => buildProject([scanDir, ...extraArgs]);
  const tovaFiles = findFiles(scanDir, '.tova');

  if (tovaFiles.length === 0) {
    console.error(color.red(`Error: no .tova files found in ${scanDir}`));
    process.exit(1);
  }

  let ast, output;
  try {
    ({ ast, output } = parseAndGenerate(tovaFiles));
  } catch (err) {
    console.error(color.red(`Error parsing project: ${err.message}`));
    process.exit(1);
  }

  if (!output.deploy || !output.deploy[deployArgs.envName]) {
    const available = output.deploy ? Object.keys(output.deploy) : [];
    const hint = available.length > 0
      ? ` Available environments: ${available.join(', ')}`
      : ' No deploy blocks found in project.';
    console.error(color.red(`Error: no deploy block named "${deployArgs.envName}".${hint}`));
    process.exit(1);
  }

  try {
    await deploy(ast, output, deployArgs, projectDir, runner);
  } catch (err) {
    console.error(color.red(`Error: ${err.message}`));
    process.exit(1);
  }
}

function existsDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function parseAndGenerate(files) {
  const mergedBody = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf-8');
    const lexer = new Lexer(source, file);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, file);
    const fileAst = parser.parse();
    if (parser.errors && parser.errors.length > 0) {
      throw new Error(`${file}: ${parser.errors[0].message || parser.errors[0]}`);
    }
    for (const node of fileAst.body) mergedBody.push(node);
  }
  const ast = new Program(mergedBody);
  const gen = new CodeGenerator(ast);
  const output = gen.generate();
  return { ast, output };
}

function promptConfirm(message) {
  // Without a TTY (e.g., CI, piped scripts), refuse the destructive action.
  if (!process.stdin.isTTY) {
    console.error(color.red(`${message} Refusing without a TTY — re-run interactively to confirm.`));
    return Promise.resolve(false);
  }
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${message} Type 'yes' to confirm: `, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}
