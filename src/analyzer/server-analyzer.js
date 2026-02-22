// Server-specific analyzer methods for the Tova language
// Extracted from analyzer.js for lazy loading — only loaded when server { } blocks are encountered.

import { Symbol } from './scope.js';

export function collectServerBlockFunctions(ast) {
  const serverBlockFunctions = new Map();
  const collectFns = (stmts) => {
    const fns = [];
    for (const stmt of stmts) {
      if (stmt.type === 'FunctionDeclaration') {
        fns.push(stmt.name);
      } else if (stmt.type === 'RouteGroupDeclaration') {
        fns.push(...collectFns(stmt.body));
      }
    }
    return fns;
  };
  for (const node of ast.body) {
    if (node.type === 'ServerBlock' && node.name) {
      const fns = collectFns(node.body);
      if (serverBlockFunctions.has(node.name)) {
        serverBlockFunctions.get(node.name).push(...fns);
      } else {
        serverBlockFunctions.set(node.name, fns);
      }
    }
  }
  return serverBlockFunctions;
}

export function installServerAnalyzer(AnalyzerClass) {
  if (AnalyzerClass.prototype._serverAnalyzerInstalled) return;
  AnalyzerClass.prototype._serverAnalyzerInstalled = true;

  AnalyzerClass.prototype.visitServerBlock = function(node) {
    const prevScope = this.currentScope;
    const prevServerBlockName = this._currentServerBlockName;
    this._currentServerBlockName = node.name || null;
    this.currentScope = this.currentScope.child('server');

    try {
      // Register peer server block names as valid identifiers in this scope
      if (node.name && this.serverBlockFunctions.size > 0) {
        for (const [peerName] of this.serverBlockFunctions) {
          if (peerName !== node.name) {
            try {
              this.currentScope.define(peerName,
                new Symbol(peerName, 'builtin', null, false, { line: 0, column: 0, file: '<peer-server>' }));
            } catch (e) {
              // Ignore if already defined
            }
          }
        }
      }

      // Register AI provider names as variables (named: claude, gpt, etc.; default: ai)
      for (const stmt of node.body) {
        if (stmt.type === 'AiConfigDeclaration') {
          const aiName = stmt.name || 'ai';
          try {
            this.currentScope.define(aiName,
              new Symbol(aiName, 'builtin', null, false, stmt.loc));
          } catch (e) {
            // Ignore if already defined
          }
        }
      }

      for (const stmt of node.body) {
        this.visitNode(stmt);
      }
    } finally {
      this.currentScope = prevScope;
      this._currentServerBlockName = prevServerBlockName;
    }
  };

  AnalyzerClass.prototype.visitRouteDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'route' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    this.visitExpression(node.handler);

    // Validate body type annotation is only used with POST/PUT/PATCH
    if (node.bodyType && !['POST', 'PUT', 'PATCH'].includes(node.method.toUpperCase())) {
      this.warn(`body type annotation on ${node.method} route is ignored — only POST, PUT, and PATCH routes parse request bodies`, node.loc);
    }

    // Route param ↔ handler signature type safety
    if (node.handler.type === 'Identifier') {
      const handlerName = node.handler.name;
      // Find the function declaration in the current server block scope
      const fnSym = this.currentScope.lookup(handlerName);
      if (fnSym && fnSym.kind === 'function' && fnSym._params) {
        const pathParams = new Set();
        const pathStr = node.path || '';
        const paramMatches = pathStr.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g);
        if (paramMatches) {
          for (const m of paramMatches) pathParams.add(m.slice(1));
        }
        const handlerParams = fnSym._params.filter(p => p !== 'req');
        for (const hp of handlerParams) {
          if (pathParams.size > 0 && !pathParams.has(hp) && node.method.toUpperCase() === 'GET') {
            // For GET routes, params not in path come from query — this is fine, just a warning
            this.warn(`Handler '${handlerName}' param '${hp}' not in route path '${pathStr}' — will be extracted from query string`, node.loc);
          }
        }
      }
    }
  };

  AnalyzerClass.prototype.visitMiddlewareDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'middleware' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'function', null, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('function');
    for (const param of node.params) {
      try {
        this.currentScope.define(param.name,
          new Symbol(param.name, 'parameter', param.typeAnnotation, false, param.loc));
      } catch (e) {
        this.error(e.message);
      }
    }
    try {
      this.visitNode(node.body);
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype.visitHealthCheckDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'health' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
  };

  AnalyzerClass.prototype.visitCorsDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'cors' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  };

  AnalyzerClass.prototype.visitErrorHandlerDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'on_error' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('function');
    for (const param of node.params) {
      try {
        this.currentScope.define(param.name,
          new Symbol(param.name, 'parameter', param.typeAnnotation, false, param.loc));
      } catch (e) {
        this.error(e.message);
      }
    }
    try {
      this.visitNode(node.body);
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype.visitWebSocketDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'ws' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    for (const [, handler] of Object.entries(node.handlers)) {
      if (!handler) continue;
      const prevScope = this.currentScope;
      this.currentScope = this.currentScope.child('function');
      for (const param of handler.params) {
        try {
          this.currentScope.define(param.name,
            new Symbol(param.name, 'parameter', param.typeAnnotation, false, param.loc));
        } catch (e) {
          this.error(e.message);
        }
      }
      try {
        this.visitNode(handler.body);
      } finally {
        this.currentScope = prevScope;
      }
    }
  };

  AnalyzerClass.prototype.visitStaticDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'static' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
  };

  AnalyzerClass.prototype.visitDiscoverDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'discover' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    this.visitExpression(node.urlExpression);
  };

  AnalyzerClass.prototype.visitAuthDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'auth' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  };

  AnalyzerClass.prototype.visitMaxBodyDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'max_body' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    this.visitExpression(node.limit);
  };

  AnalyzerClass.prototype.visitRouteGroupDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'routes' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    for (const stmt of node.body) {
      this.visitNode(stmt);
    }
  };

  AnalyzerClass.prototype.visitRateLimitDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'rate_limit' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  };

  AnalyzerClass.prototype.visitLifecycleHookDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'on_${node.hook}' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('function');
    for (const param of node.params) {
      try {
        this.currentScope.define(param.name,
          new Symbol(param.name, 'parameter', param.typeAnnotation, false, param.loc));
      } catch (e) {
        this.error(e.message);
      }
    }
    try {
      this.visitNode(node.body);
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype.visitSubscribeDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'subscribe' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('function');
    for (const param of node.params) {
      try {
        this.currentScope.define(param.name,
          new Symbol(param.name, 'parameter', param.typeAnnotation, false, param.loc));
      } catch (e) {
        this.error(e.message);
      }
    }
    try {
      this.visitNode(node.body);
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype.visitEnvDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'env' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'variable', node.typeAnnotation, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }
    if (node.defaultValue) {
      this.visitExpression(node.defaultValue);
    }
  };

  AnalyzerClass.prototype.visitScheduleDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'schedule' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    if (node.name) {
      try {
        this.currentScope.define(node.name,
          new Symbol(node.name, 'function', null, false, node.loc));
      } catch (e) {
        this.error(e.message);
      }
    }
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('function');
    for (const param of node.params) {
      try {
        this.currentScope.define(param.name,
          new Symbol(param.name, 'parameter', param.typeAnnotation, false, param.loc));
      } catch (e) {
        this.error(e.message);
      }
    }
    try {
      this.visitNode(node.body);
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype.visitUploadDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'upload' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  };

  AnalyzerClass.prototype.visitSessionDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'session' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  };

  AnalyzerClass.prototype.visitDbDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'db' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  };

  AnalyzerClass.prototype.visitTlsDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'tls' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  };

  AnalyzerClass.prototype.visitCompressionDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'compression' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  };

  AnalyzerClass.prototype.visitBackgroundJobDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'background' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    try {
      this.currentScope.define(node.name,
        new Symbol(node.name, 'function', null, false, node.loc));
    } catch (e) {
      this.error(e.message);
    }
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('function');
    for (const param of node.params) {
      try {
        this.currentScope.define(param.name,
          new Symbol(param.name, 'parameter', param.typeAnnotation, false, param.loc));
      } catch (e) {
        this.error(e.message);
      }
    }
    try {
      this.visitNode(node.body);
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype.visitCacheDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'cache' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    for (const value of Object.values(node.config)) {
      this.visitExpression(value);
    }
  };

  AnalyzerClass.prototype.visitSseDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'sse' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    const prevScope = this.currentScope;
    this.currentScope = this.currentScope.child('block');
    for (const p of node.params) {
      this.currentScope.define(p.name, { kind: 'param' });
    }
    try {
      for (const stmt of node.body.body || []) {
        this.visitNode(stmt);
      }
    } finally {
      this.currentScope = prevScope;
    }
  };

  AnalyzerClass.prototype.visitModelDeclaration = function(node) {
    const ctx = this.currentScope.getContext();
    if (ctx !== 'server') {
      this.error(`'model' can only be used inside a server block`, node.loc, "move this inside a server { } block", { code: 'E303' });
    }
    if (node.config) {
      for (const value of Object.values(node.config)) {
        this.visitExpression(value);
      }
    }
  };
}
