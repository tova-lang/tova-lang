export const sharedPlugin = {
  name: 'shared',
  astNodeType: 'SharedBlock',
  detection: {
    strategy: 'keyword',
    tokenType: 'SHARED',
  },
  parser: {
    install: null,
    installedFlag: null,
    method: 'parseSharedBlock',
  },
  analyzer: {
    visit: (analyzer, node) => analyzer.visitSharedBlock(node),
  },
  codegen: {},
};
