import { TokenType } from '../../lexer/tokens.js';
import { installConcurrencyParser } from '../../parser/concurrency-parser.js';

export const concurrencyPlugin = {
  name: 'concurrency',
  astNodeType: 'ConcurrentBlock',
  detection: {
    strategy: 'identifier',
    identifierValue: 'concurrent',
    lookahead: (parser) => {
      const next = parser.peek(1);
      // concurrent {} or concurrent mode {}
      return next.type === TokenType.LBRACE ||
             (next.type === TokenType.IDENTIFIER &&
              ['cancel_on_error', 'first', 'timeout'].includes(next.value));
    },
  },
  parser: {
    install: installConcurrencyParser,
    installedFlag: '_concurrencyParserInstalled',
    method: 'parseConcurrentBlock',
  },
  analyzer: {
    visit: (analyzer, node) => analyzer.visitConcurrentBlock(node),
    noopNodeTypes: ['SpawnExpression'],
  },
  codegen: {},
};
