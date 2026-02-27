import { installBrowserParser } from '../../parser/browser-parser.js';
import { installBrowserAnalyzer } from '../../analyzer/browser-analyzer.js';

export const browserPlugin = {
  name: 'browser',
  astNodeType: 'BrowserBlock',
  detection: {
    strategy: 'keyword',
    tokenType: 'BROWSER',
  },
  parser: {
    install: installBrowserParser,
    installedFlag: '_browserParserInstalled',
    method: 'parseBrowserBlock',
  },
  analyzer: {
    visit: (analyzer, node) => {
      if (!analyzer.constructor.prototype._browserAnalyzerInstalled) {
        installBrowserAnalyzer(analyzer.constructor);
      }
      const methodName = 'visit' + node.type;
      return analyzer[methodName](node);
    },
    childNodeTypes: [
      'StateDeclaration', 'ComputedDeclaration', 'EffectDeclaration',
      'ComponentDeclaration', 'StoreDeclaration', 'FormDeclaration',
    ],
  },
  codegen: {},
};
