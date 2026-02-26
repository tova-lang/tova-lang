import { installClientParser } from '../../parser/client-parser.js';
import { installClientAnalyzer } from '../../analyzer/client-analyzer.js';

export const clientPlugin = {
  name: 'client',
  astNodeType: 'ClientBlock',
  detection: {
    strategy: 'keyword',
    tokenType: 'CLIENT',
  },
  parser: {
    install: installClientParser,
    installedFlag: '_clientParserInstalled',
    method: 'parseClientBlock',
  },
  analyzer: {
    visit: (analyzer, node) => {
      if (!analyzer.constructor.prototype._clientAnalyzerInstalled) {
        installClientAnalyzer(analyzer.constructor);
      }
      const methodName = 'visit' + node.type;
      return analyzer[methodName](node);
    },
    childNodeTypes: [
      'StateDeclaration', 'ComputedDeclaration', 'EffectDeclaration',
      'ComponentDeclaration', 'StoreDeclaration',
    ],
  },
  codegen: {},
};
