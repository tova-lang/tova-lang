import { installCliParser } from '../../parser/cli-parser.js';
import { installCliAnalyzer } from '../../analyzer/cli-analyzer.js';

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
    visit: (analyzer, node) => {
      if (!analyzer.constructor.prototype._cliAnalyzerInstalled) {
        installCliAnalyzer(analyzer.constructor);
      }
      return analyzer.visitCliBlock(node);
    },
    noopNodeTypes: ['CliConfigField', 'CliCommandDeclaration', 'CliParam'],
    crossBlockValidate: (analyzer) => {
      if (!analyzer.constructor.prototype._cliAnalyzerInstalled) {
        installCliAnalyzer(analyzer.constructor);
      }
      return analyzer._validateCliCrossBlock();
    },
  },
  codegen: {
    earlyReturn: true,
    earlyReturnMethod: '_generateCli',
  },
};
