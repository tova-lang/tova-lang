import { installCliParser } from '../../parser/cli-parser.js';

export const cliPlugin = {
  name: 'cli',
  astNodeType: 'CliBlock',
  detection: {
    strategy: 'identifier',
    identifierValue: 'cli',
  },
  parser: {
    install: installCliParser,
    installedFlag: '_cliParserInstalled',
    method: 'parseCliBlock',
  },
  analyzer: {
    visit: (analyzer, node) => analyzer.visitCliBlock(node),
    noopNodeTypes: ['CliConfigField', 'CliCommandDeclaration', 'CliParam'],
    crossBlockValidate: (analyzer) => analyzer._validateCliCrossBlock(),
  },
  codegen: {
    earlyReturn: true,
    earlyReturnMethod: '_generateCli',
  },
};
