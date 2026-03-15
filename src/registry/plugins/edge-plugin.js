import { installEdgeParser } from '../../parser/edge-parser.js';
import { installEdgeAnalyzer } from '../../analyzer/edge-analyzer.js';
import { TokenType } from '../../lexer/tokens.js';

export const edgePlugin = {
  name: 'edge',
  astNodeType: 'EdgeBlock',
  detection: {
    strategy: 'identifier',
    identifierValue: 'edge',
    lookahead: (parser) => {
      const next = parser.peek(1);
      // edge {} or edge "name" {}
      return next.type === TokenType.LBRACE || next.type === TokenType.STRING;
    },
  },
  parser: {
    install: installEdgeParser,
    installedFlag: '_edgeParserInstalled',
    method: 'parseEdgeBlock',
  },
  analyzer: {
    visit: (analyzer, node) => {
      if (!analyzer.constructor.prototype._edgeAnalyzerInstalled) {
        installEdgeAnalyzer(analyzer.constructor);
      }
      return analyzer.visitEdgeBlock(node);
    },
    childNodeTypes: [],
    noopNodeTypes: [
      'EdgeKVDeclaration', 'EdgeSQLDeclaration', 'EdgeStorageDeclaration',
      'EdgeQueueDeclaration', 'EdgeEnvDeclaration', 'EdgeSecretDeclaration',
      'EdgeScheduleDeclaration', 'EdgeConsumeDeclaration', 'EdgeConfigField',
    ],
    crossBlockValidate: (analyzer) => {
      if (!analyzer.constructor.prototype._edgeAnalyzerInstalled) {
        installEdgeAnalyzer(analyzer.constructor);
      }
      return analyzer._validateEdgeCrossBlock();
    },
  },
  codegen: {},
};
