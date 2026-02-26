import { installSecurityParser } from '../../parser/security-parser.js';

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
    visit: (analyzer, node) => analyzer.visitSecurityBlock(node),
    noopNodeTypes: [
      'SecurityAuthDeclaration', 'SecurityRoleDeclaration',
      'SecurityProtectDeclaration', 'SecuritySensitiveDeclaration',
      'SecurityCorsDeclaration', 'SecurityCspDeclaration',
      'SecurityRateLimitDeclaration', 'SecurityCsrfDeclaration',
      'SecurityAuditDeclaration',
    ],
    crossBlockValidate: (analyzer) => analyzer._validateSecurityCrossBlock(),
  },
  codegen: {},
};
