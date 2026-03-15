import { installSecurityParser } from '../../parser/security-parser.js';
import { installSecurityAnalyzer } from '../../analyzer/security-analyzer.js';

export const securityPlugin = {
  name: 'security',
  astNodeType: 'SecurityBlock',
  detection: {
    strategy: 'identifier',
    identifierValue: 'security',
  },
  parser: {
    install: installSecurityParser,
    installedFlag: '_securityParserInstalled',
    method: 'parseSecurityBlock',
  },
  analyzer: {
    visit: (analyzer, node) => {
      if (!analyzer.constructor.prototype._securityAnalyzerInstalled) {
        installSecurityAnalyzer(analyzer.constructor);
      }
      return analyzer.visitSecurityBlock(node);
    },
    noopNodeTypes: [
      'SecurityAuthDeclaration', 'SecurityRoleDeclaration',
      'SecurityProtectDeclaration', 'SecuritySensitiveDeclaration',
      'SecurityCorsDeclaration', 'SecurityCspDeclaration',
      'SecurityRateLimitDeclaration', 'SecurityCsrfDeclaration',
      'SecurityAuditDeclaration',
    ],
    crossBlockValidate: (analyzer) => {
      if (!analyzer.constructor.prototype._securityAnalyzerInstalled) {
        installSecurityAnalyzer(analyzer.constructor);
      }
      return analyzer._validateSecurityCrossBlock();
    },
  },
  codegen: {},
};
