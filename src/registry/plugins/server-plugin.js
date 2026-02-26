import { installServerParser } from '../../parser/server-parser.js';
import { collectServerBlockFunctions, installServerAnalyzer } from '../../analyzer/server-analyzer.js';

export const serverPlugin = {
  name: 'server',
  astNodeType: 'ServerBlock',
  detection: {
    strategy: 'keyword',
    tokenType: 'SERVER',
  },
  parser: {
    install: installServerParser,
    installedFlag: '_serverParserInstalled',
    method: 'parseServerBlock',
  },
  analyzer: {
    visit: (analyzer, node) => {
      if (!analyzer.constructor.prototype._serverAnalyzerInstalled) {
        installServerAnalyzer(analyzer.constructor);
      }
      return analyzer._visitServerNode(node);
    },
    childNodeTypes: [
      'RouteDeclaration', 'MiddlewareDeclaration', 'HealthCheckDeclaration',
      'CorsDeclaration', 'ErrorHandlerDeclaration', 'WebSocketDeclaration',
      'StaticDeclaration', 'DiscoverDeclaration', 'AuthDeclaration',
      'MaxBodyDeclaration', 'RouteGroupDeclaration', 'RateLimitDeclaration',
      'LifecycleHookDeclaration', 'SubscribeDeclaration', 'EnvDeclaration',
      'ScheduleDeclaration', 'UploadDeclaration', 'SessionDeclaration',
      'DbDeclaration', 'TlsDeclaration', 'CompressionDeclaration',
      'BackgroundJobDeclaration', 'CacheDeclaration', 'SseDeclaration',
      'ModelDeclaration',
    ],
    noopNodeTypes: ['AiConfigDeclaration'],
    prePass: (analyzer) => {
      const has = analyzer.ast.body.some(n => n.type === 'ServerBlock');
      if (has) {
        installServerAnalyzer(analyzer.constructor);
        analyzer.serverBlockFunctions = collectServerBlockFunctions(analyzer.ast);
      } else {
        analyzer.serverBlockFunctions = new Map();
      }
    },
  },
  codegen: {},
};
