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
import { edgePlugin } from './plugins/edge-plugin.js';
import { concurrencyPlugin } from './plugins/concurrency-plugin.js';
import { deployPlugin } from './plugins/deploy-plugin.js';
import { themePlugin } from './plugins/theme-plugin.js';
import { authPlugin } from './plugins/auth-plugin.js';

BlockRegistry.register(themePlugin);
BlockRegistry.register(serverPlugin);
BlockRegistry.register(browserPlugin);
BlockRegistry.register(sharedPlugin);
BlockRegistry.register(securityPlugin);
BlockRegistry.register(cliPlugin);
BlockRegistry.register(dataPlugin);
BlockRegistry.register(testPlugin);
BlockRegistry.register(benchPlugin);
BlockRegistry.register(edgePlugin);
BlockRegistry.register(concurrencyPlugin);
BlockRegistry.register(deployPlugin);
BlockRegistry.register(authPlugin);

export { BlockRegistry };
