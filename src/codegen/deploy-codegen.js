// Deploy-specific codegen for the Tova language
// Produces a configuration manifest (plain JS object) from deploy block AST nodes.

const DEFAULTS = {
  instances: 1,
  memory: '512mb',
  branch: 'main',
  health: '/healthz',
  health_interval: 30,
  health_timeout: 5,
  restart_on_failure: true,
  keep_releases: 5,
};

export class DeployCodegen {
  static mergeDeployBlocks(blocks) {
    const config = { ...DEFAULTS, env: {}, databases: [] };
    for (const block of blocks) {
      config.name = block.name;
      for (const stmt of block.body) {
        switch (stmt.type) {
          case 'DeployConfigField': {
            // Extract literal value from AST expression
            const val = stmt.value;
            config[stmt.key] = val.value !== undefined ? val.value : val;
            break;
          }
          case 'DeployEnvBlock': {
            for (const entry of stmt.entries) {
              config.env[entry.key] = entry.value.value !== undefined ? entry.value.value : entry.value;
            }
            break;
          }
          case 'DeployDbBlock': {
            const dbConfig = {};
            if (stmt.config && typeof stmt.config === 'object') {
              for (const [k, v] of Object.entries(stmt.config)) {
                dbConfig[k] = v.value !== undefined ? v.value : v;
              }
            }
            config.databases.push({ engine: stmt.engine, config: dbConfig });
            break;
          }
        }
      }
    }
    return config;
  }
}
