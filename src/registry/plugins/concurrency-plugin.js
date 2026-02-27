import { installConcurrencyParser } from '../../parser/concurrency-parser.js';

export const concurrencyPlugin = {
  name: 'concurrency',
  astNodeType: 'ConcurrentBlock',
  detection: {
    strategy: 'identifier',
    identifierValue: 'concurrent',
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
