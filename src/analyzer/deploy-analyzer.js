// Deploy-specific analyzer methods for the Tova language
// Extracted from analyzer.js for lazy loading — only loaded when deploy { } blocks are encountered.

const KNOWN_DEPLOY_FIELDS = new Set([
  'server', 'domain', 'instances', 'memory', 'branch',
  'health', 'health_interval', 'health_timeout',
  'restart_on_failure', 'keep_releases',
]);

const REQUIRED_DEPLOY_FIELDS = ['server', 'domain'];

export function installDeployAnalyzer(AnalyzerClass) {
  if (AnalyzerClass.prototype._deployAnalyzerInstalled) return;
  AnalyzerClass.prototype._deployAnalyzerInstalled = true;

  AnalyzerClass.prototype.visitDeployBlock = function(node) {
    // Collect config field keys present in the deploy block body
    const presentFields = new Set();
    for (const stmt of node.body) {
      if (stmt.type === 'DeployConfigField') {
        // Validate unknown fields
        if (!KNOWN_DEPLOY_FIELDS.has(stmt.key)) {
          this.error(
            `Unknown deploy config field "${stmt.key}"`,
            stmt.loc,
            `Known fields: ${[...KNOWN_DEPLOY_FIELDS].join(', ')}`
          );
        }
        presentFields.add(stmt.key);
      }
      // DeployEnvBlock and DeployDbBlock are valid sub-blocks — no additional validation needed
    }

    // Validate required fields
    for (const required of REQUIRED_DEPLOY_FIELDS) {
      if (!presentFields.has(required)) {
        this.error(
          `Deploy block "${node.name}" is missing required field "${required}"`,
          node.loc
        );
      }
    }
  };
}
