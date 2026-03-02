import { installThemeParser } from '../../parser/theme-parser.js';

export const themePlugin = {
  name: 'theme',
  astNodeType: 'ThemeBlock',
  detection: {
    strategy: 'identifier',
    identifierValue: 'theme',
  },
  parser: {
    install: installThemeParser,
    installedFlag: '_themeParserInstalled',
    method: 'parseThemeBlock',
  },
  analyzer: {
    visit: (analyzer, node) => analyzer.visitThemeBlock(node),
    noopNodeTypes: ['ThemeSection', 'ThemeToken'],
  },
  codegen: {},
};
