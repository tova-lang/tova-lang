import { installDeployParser } from '../../parser/deploy-parser.js';
import { TokenType } from '../../lexer/tokens.js';

export const deployPlugin = {
  name: 'deploy',
  astNodeType: 'DeployBlock',
  detection: {
    strategy: 'identifier',
    identifierValue: 'deploy',
    lookahead: (parser) => {
      const next = parser.peek(1);
      // deploy "name" {} — name is required
      return next.type === TokenType.STRING;
    },
  },
  parser: {
    install: installDeployParser,
    installedFlag: '_deployParserInstalled',
    method: 'parseDeployBlock',
  },
  analyzer: {
    visit: (analyzer, node) => { /* validated in Task 5 */ },
    childNodeTypes: [],
    noopNodeTypes: [
      'DeployConfigField', 'DeployEnvBlock', 'DeployDbBlock',
    ],
  },
  codegen: {},
};
