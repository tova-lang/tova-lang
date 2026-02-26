import { TokenType } from '../../lexer/tokens.js';

export const benchPlugin = {
  name: 'bench',
  astNodeType: 'BenchBlock',
  detection: {
    strategy: 'identifier',
    identifierValue: 'bench',
    lookahead: (parser) => {
      const next = parser.peek(1);
      return next.type === TokenType.LBRACE || next.type === TokenType.STRING;
    },
  },
  parser: {
    install: null,
    installedFlag: null,
    method: 'parseBenchBlock',
  },
  analyzer: {
    visit: (analyzer, node) => analyzer.visitTestBlock(node), // reuses test visitor
  },
  codegen: {},
};
