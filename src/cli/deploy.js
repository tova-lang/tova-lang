import { color } from './utils.js';

export async function deployCommand(args) {
  const { parseDeployArgs } = await import('../deploy/deploy.js');
  const deployArgs = parseDeployArgs(args);

  if (!deployArgs.envName && !deployArgs.list) {
    console.error(color.red('Error: deploy requires an environment name (e.g., tova deploy prod)'));
    process.exit(1);
  }

  // For now, just parse and build — full SSH deployment is wired in integration
  console.log(color.cyan('Deploy feature is being implemented...'));
  console.log('Parsed args:', deployArgs);
}
