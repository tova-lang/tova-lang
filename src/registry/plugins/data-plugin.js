export const dataPlugin = {
  name: 'data',
  astNodeType: 'DataBlock',
  detection: {
    strategy: 'identifier',
    identifierValue: 'data',
  },
  parser: {
    install: null,
    installedFlag: null,
    method: 'parseDataBlock',
  },
  analyzer: {
    visit: (analyzer, node) => analyzer.visitDataBlock(node),
    noopNodeTypes: [
      'SourceDeclaration', 'PipelineDeclaration',
      'ValidateBlock', 'RefreshPolicy',
    ],
  },
  codegen: {},
};
