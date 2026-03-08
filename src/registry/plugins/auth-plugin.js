import { installAuthParser } from '../../parser/auth-parser.js';

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
    visit: (analyzer, node) => analyzer.visitAuthBlock(node),
    noopNodeTypes: [
      'AuthConfigField', 'AuthProviderDeclaration',
      'AuthHookDeclaration', 'AuthProtectedRoute',
    ],
    crossBlockValidate: (analyzer) => analyzer._validateAuthCrossBlock(),
  },
  codegen: {},
};
