// Registers all built-in block plugins and re-exports BlockRegistry.
// Import this module (instead of block-registry.js directly) to ensure all plugins are loaded.

import { BlockRegistry } from './block-registry.js';
import { serverPlugin } from './plugins/server-plugin.js';
import { browserPlugin } from './plugins/browser-plugin.js';
import { sharedPlugin } from './plugins/shared-plugin.js';
import { securityPlugin } from './plugins/security-plugin.js';
import { cliPlugin } from './plugins/cli-plugin.js';
import { dataPlugin } from './plugins/data-plugin.js';
import { testPlugin } from './plugins/test-plugin.js';
import { benchPlugin } from './plugins/bench-plugin.js';

BlockRegistry.register(serverPlugin);
BlockRegistry.register(browserPlugin);
BlockRegistry.register(sharedPlugin);
BlockRegistry.register(securityPlugin);
BlockRegistry.register(cliPlugin);
BlockRegistry.register(dataPlugin);
BlockRegistry.register(testPlugin);
BlockRegistry.register(benchPlugin);

export { BlockRegistry };
