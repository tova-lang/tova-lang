import { TokenType } from '../../lexer/tokens.js';

export const testPlugin = {
  name: 'test',
  astNodeType: 'TestBlock',
  detection: {
    strategy: 'identifier',
    identifierValue: 'test',
    lookahead: (parser) => {
      const next = parser.peek(1);
      return next.type === TokenType.LBRACE || next.type === TokenType.STRING;
    },
  },
  parser: {
    install: null,
    installedFlag: null,
    method: 'parseTestBlock',
  },
  analyzer: {
    visit: (analyzer, node) => analyzer.visitTestBlock(node),
  },
  codegen: {},
};
