import { installAuthParser } from '../../parser/auth-parser.js';
import { installAuthAnalyzer } from '../../analyzer/auth-analyzer.js';

export const authPlugin = {
  name: 'auth',
  astNodeType: 'AuthBlock',
  detection: {
    strategy: 'identifier',
    identifierValue: 'auth',
  },
  parser: {
    install: installAuthParser,
    installedFlag: '_authParserInstalled',
    method: 'parseAuthBlock',
  },
  analyzer: {
    visit: (analyzer, node) => {
      if (!analyzer.constructor.prototype._authAnalyzerInstalled) {
        installAuthAnalyzer(analyzer.constructor);
      }
      return analyzer.visitAuthBlock(node);
    },
    noopNodeTypes: [
      'AuthConfigField', 'AuthProviderDeclaration',
      'AuthHookDeclaration', 'AuthProtectedRoute',
    ],
    crossBlockValidate: (analyzer) => {
      if (!analyzer.constructor.prototype._authAnalyzerInstalled) {
        installAuthAnalyzer(analyzer.constructor);
      }
      return analyzer._validateAuthCrossBlock();
    },
  },
  codegen: {},
};
