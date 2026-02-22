// Server-specific parser methods for the Tova language
// Extracted from parser.js for lazy loading — only loaded when server { } blocks are encountered.

import { TokenType } from '../lexer/tokens.js';
import * as AST from './ast.js';

export function installServerParser(ParserClass) {
  if (ParserClass.prototype._serverParserInstalled) return;
  ParserClass.prototype._serverParserInstalled = true;

  ParserClass.prototype.parseServerBlock = function() {
    const l = this.loc();
    this.expect(TokenType.SERVER);
    // Optional block name: server "api" { }
    let name = null;
    if (this.check(TokenType.STRING)) {
      name = this.advance().value;
    }
    this.expect(TokenType.LBRACE, "Expected '{' after 'server'");
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      try {
        const stmt = this.parseServerStatement();
        if (stmt) body.push(stmt);
      } catch (e) {
        this.errors.push(e);
        this._synchronizeBlock();
      }
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close server block");
    return new AST.ServerBlock(body, l, name);
  };

  ParserClass.prototype.parseServerStatement = function() {
    if (this.check(TokenType.ROUTE)) return this.parseRoute();

    // Contextual keywords in server blocks
    if (this.check(TokenType.IDENTIFIER)) {
      const val = this.current().value;
      if (val === 'middleware' && this.peek(1).type === TokenType.FN) {
        return this.parseMiddleware();
      }
      if (val === 'health') {
        return this.parseHealthCheck();
      }
      if (val === 'cors' && this.peek(1).type === TokenType.LBRACE) {
        return this.parseCorsConfig();
      }
      if (val === 'on_error' && this.peek(1).type === TokenType.FN) {
        return this.parseErrorHandler();
      }
      if (val === 'ws' && this.peek(1).type === TokenType.LBRACE) {
        return this.parseWebSocket();
      }
      if (val === 'static' && this.peek(1).type === TokenType.STRING) {
        return this.parseStaticDeclaration();
      }
      if (val === 'discover' && this.peek(1).type === TokenType.STRING) {
        return this.parseDiscover();
      }
      if (val === 'auth' && this.peek(1).type === TokenType.LBRACE) {
        return this.parseAuthConfig();
      }
      if (val === 'max_body') {
        return this.parseMaxBody();
      }
      if (val === 'routes' && this.peek(1).type === TokenType.STRING) {
        return this.parseRouteGroup();
      }
      if (val === 'rate_limit' && this.peek(1).type === TokenType.LBRACE) {
        return this.parseRateLimitConfig();
      }
      if (val === 'on_start' && this.peek(1).type === TokenType.FN) {
        return this.parseLifecycleHook('start');
      }
      if (val === 'on_stop' && this.peek(1).type === TokenType.FN) {
        return this.parseLifecycleHook('stop');
      }
      if (val === 'subscribe' && this.peek(1).type === TokenType.STRING) {
        return this.parseSubscribe();
      }
      if (val === 'env' && this.peek(1).type === TokenType.IDENTIFIER) {
        return this.parseEnvDeclaration();
      }
      if (val === 'schedule' && this.peek(1).type === TokenType.STRING) {
        return this.parseSchedule();
      }
      if (val === 'upload' && this.peek(1).type === TokenType.LBRACE) {
        return this.parseUploadConfig();
      }
      if (val === 'session' && this.peek(1).type === TokenType.LBRACE) {
        return this.parseSessionConfig();
      }
      if (val === 'db' && this.peek(1).type === TokenType.LBRACE) {
        return this.parseDbConfig();
      }
      if (val === 'tls' && this.peek(1).type === TokenType.LBRACE) {
        return this.parseTlsConfig();
      }
      if (val === 'compression' && this.peek(1).type === TokenType.LBRACE) {
        return this.parseCompressionConfig();
      }
      if (val === 'background' && this.peek(1).type === TokenType.FN) {
        return this.parseBackgroundJob();
      }
      if (val === 'cache' && this.peek(1).type === TokenType.LBRACE) {
        return this.parseCacheConfig();
      }
      if (val === 'sse' && this.peek(1).type === TokenType.STRING) {
        return this.parseSseDeclaration();
      }
      if (val === 'model' && this.peek(1).type === TokenType.IDENTIFIER) {
        return this.parseModelDeclaration();
      }
      // ai { ... } or ai "name" { ... }
      if (val === 'ai' && (this.peek(1).type === TokenType.LBRACE || this.peek(1).type === TokenType.STRING)) {
        return this.parseAiConfig();
      }
    }

    return this.parseStatement();
  };

  ParserClass.prototype.parseMiddleware = function() {
    const l = this.loc();
    this.advance(); // consume 'middleware'
    this.expect(TokenType.FN);
    const name = this.expect(TokenType.IDENTIFIER, "Expected middleware name").value;
    this.expect(TokenType.LPAREN, "Expected '(' after middleware name");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after middleware parameters");
    const body = this.parseBlock();
    return new AST.MiddlewareDeclaration(name, params, body, l);
  };

  ParserClass.prototype.parseHealthCheck = function() {
    const l = this.loc();
    this.advance(); // consume 'health'
    const path = this.expect(TokenType.STRING, "Expected health check path string");
    return new AST.HealthCheckDeclaration(path.value, l);
  };

  ParserClass.prototype.parseCorsConfig = function() {
    const l = this.loc();
    this.advance(); // consume 'cors'
    this.expect(TokenType.LBRACE, "Expected '{' after 'cors'");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this.expect(TokenType.IDENTIFIER, "Expected cors config key").value;
      this.expect(TokenType.COLON, "Expected ':' after cors key");
      const value = this.parseExpression();
      config[key] = value;
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close cors config");
    return new AST.CorsDeclaration(config, l);
  };

  ParserClass.prototype.parseErrorHandler = function() {
    const l = this.loc();
    this.advance(); // consume 'on_error'
    this.expect(TokenType.FN);
    this.expect(TokenType.LPAREN, "Expected '(' after 'fn'");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after error handler parameters");
    const body = this.parseBlock();
    return new AST.ErrorHandlerDeclaration(params, body, l);
  };

  ParserClass.prototype.parseWebSocket = function() {
    const l = this.loc();
    this.advance(); // consume 'ws'
    this.expect(TokenType.LBRACE, "Expected '{' after 'ws'");

    const handlers = {};
    const config = {};
    const validEvents = ['on_open', 'on_message', 'on_close', 'on_error'];
    const validConfigKeys = ['auth'];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const name = this.expect(TokenType.IDENTIFIER, "Expected WebSocket event handler name or config key").value;
      if (validConfigKeys.includes(name)) {
        // Config key: auth: <expr>
        this.expect(TokenType.COLON, `Expected ':' after '${name}'`);
        config[name] = this.parseExpression();
        this.match(TokenType.COMMA);
      } else if (validEvents.includes(name)) {
        this.expect(TokenType.FN, "Expected 'fn' after event name");
        this.expect(TokenType.LPAREN);
        const params = this.parseParameterList();
        this.expect(TokenType.RPAREN);
        const body = this.parseBlock();
        handlers[name] = { params, body };
      } else {
        this.error(`Invalid WebSocket key '${name}'. Expected one of: ${[...validConfigKeys, ...validEvents].join(', ')}`);
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close ws block");
    const wsConfig = Object.keys(config).length > 0 ? config : null;
    return new AST.WebSocketDeclaration(handlers, l, wsConfig);
  };

  ParserClass.prototype.parseStaticDeclaration = function() {
    const l = this.loc();
    this.advance(); // consume 'static'
    const urlPath = this.expect(TokenType.STRING, "Expected URL path for static files").value;
    this.expect(TokenType.ARROW, "Expected '=>' after static path");
    const dir = this.expect(TokenType.STRING, "Expected directory path for static files").value;
    let fallback = null;
    if (this.check(TokenType.IDENTIFIER) && this.current().value === 'fallback') {
      this.advance(); // consume 'fallback'
      fallback = this.expect(TokenType.STRING, "Expected fallback file path").value;
    }
    return new AST.StaticDeclaration(urlPath, dir, l, fallback);
  };

  ParserClass.prototype.parseDiscover = function() {
    const l = this.loc();
    this.advance(); // consume 'discover'
    const peerName = this.expect(TokenType.STRING, "Expected peer name string after 'discover'").value;
    // Expect 'at' as contextual keyword
    const atTok = this.expect(TokenType.IDENTIFIER, "Expected 'at' after peer name");
    if (atTok.value !== 'at') {
      this.error("Expected 'at' after peer name in discover declaration");
    }
    const urlExpression = this.parseExpression();
    let config = null;
    if (this.check(TokenType.WITH)) {
      this.advance(); // consume 'with'
      this.expect(TokenType.LBRACE, "Expected '{' after 'with'");
      config = {};
      while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
        const key = this.expect(TokenType.IDENTIFIER, "Expected config key").value;
        this.expect(TokenType.COLON, "Expected ':' after config key");
        const value = this.parseExpression();
        config[key] = value;
        this.match(TokenType.COMMA);
      }
      this.expect(TokenType.RBRACE, "Expected '}' to close discover config");
    }
    return new AST.DiscoverDeclaration(peerName, urlExpression, l, config);
  };

  ParserClass.prototype.parseAuthConfig = function() {
    const l = this.loc();
    this.advance(); // consume 'auth'
    this.expect(TokenType.LBRACE, "Expected '{' after 'auth'");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      // Accept keywords (like 'type') and identifiers as config keys
      let key;
      if (this.check(TokenType.IDENTIFIER) || this.check(TokenType.TYPE)) {
        key = this.advance().value;
      } else {
        this.error("Expected auth config key");
      }
      this.expect(TokenType.COLON, "Expected ':' after auth key");
      const value = this.parseExpression();
      config[key] = value;
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close auth config");
    return new AST.AuthDeclaration(config, l);
  };

  ParserClass.prototype.parseMaxBody = function() {
    const l = this.loc();
    this.advance(); // consume 'max_body'
    const limit = this.parseExpression();
    return new AST.MaxBodyDeclaration(limit, l);
  };

  ParserClass.prototype.parseRouteGroup = function() {
    const l = this.loc();
    this.advance(); // consume 'routes'
    const prefix = this.expect(TokenType.STRING, "Expected route group prefix string").value;

    // Optional version config: routes "/api/v2" version: "2" deprecated: true { ... }
    let version = null;
    while (this.check(TokenType.IDENTIFIER) && !this.isAtEnd()) {
      const key = this.current().value;
      if (key === 'version' || key === 'deprecated' || key === 'sunset') {
        this.advance(); // consume key
        this.expect(TokenType.COLON, `Expected ':' after '${key}'`);
        const value = this.parseExpression();
        if (!version) version = {};
        if (key === 'version') {
          version.version = value.value !== undefined ? value.value : value;
        } else if (key === 'deprecated') {
          version.deprecated = value.value !== undefined ? value.value : true;
        } else if (key === 'sunset') {
          version.sunset = value.value !== undefined ? value.value : value;
        }
      } else {
        break;
      }
    }

    this.expect(TokenType.LBRACE, "Expected '{' after route group prefix");
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      try {
        const stmt = this.parseServerStatement();
        if (stmt) body.push(stmt);
      } catch (e) {
        this.errors.push(e);
        this._synchronizeBlock();
      }
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close route group");
    return new AST.RouteGroupDeclaration(prefix, body, l, version);
  };

  ParserClass.prototype.parseRateLimitConfig = function() {
    const l = this.loc();
    this.advance(); // consume 'rate_limit'
    this.expect(TokenType.LBRACE, "Expected '{' after 'rate_limit'");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this.expect(TokenType.IDENTIFIER, "Expected rate_limit config key").value;
      this.expect(TokenType.COLON, "Expected ':' after rate_limit key");
      const value = this.parseExpression();
      config[key] = value;
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close rate_limit config");
    return new AST.RateLimitDeclaration(config, l);
  };

  ParserClass.prototype.parseLifecycleHook = function(hookName) {
    const l = this.loc();
    this.advance(); // consume 'on_start' or 'on_stop'
    this.expect(TokenType.FN);
    this.expect(TokenType.LPAREN, "Expected '(' after 'fn'");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after lifecycle hook parameters");
    const body = this.parseBlock();
    return new AST.LifecycleHookDeclaration(hookName, params, body, l);
  };

  ParserClass.prototype.parseSubscribe = function() {
    const l = this.loc();
    this.advance(); // consume 'subscribe'
    const event = this.expect(TokenType.STRING, "Expected event name string").value;
    this.expect(TokenType.FN, "Expected 'fn' after event name");
    this.expect(TokenType.LPAREN, "Expected '(' after 'fn'");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after subscribe parameters");
    const body = this.parseBlock();
    return new AST.SubscribeDeclaration(event, params, body, l);
  };

  ParserClass.prototype.parseEnvDeclaration = function() {
    const l = this.loc();
    this.advance(); // consume 'env'
    const name = this.expect(TokenType.IDENTIFIER, "Expected env variable name").value;
    this.expect(TokenType.COLON, "Expected ':' after env variable name");
    const typeAnnotation = this.parseTypeAnnotation();
    let defaultValue = null;
    if (this.match(TokenType.ASSIGN)) {
      defaultValue = this.parseExpression();
    }
    return new AST.EnvDeclaration(name, typeAnnotation, defaultValue, l);
  };

  ParserClass.prototype.parseSchedule = function() {
    const l = this.loc();
    this.advance(); // consume 'schedule'
    const pattern = this.expect(TokenType.STRING, "Expected schedule pattern string").value;
    this.expect(TokenType.FN, "Expected 'fn' after schedule pattern");
    let name = null;
    if (this.check(TokenType.IDENTIFIER)) {
      name = this.advance().value;
    }
    this.expect(TokenType.LPAREN, "Expected '(' after schedule fn");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after schedule parameters");
    const body = this.parseBlock();
    return new AST.ScheduleDeclaration(pattern, name, params, body, l);
  };

  ParserClass.prototype.parseUploadConfig = function() {
    const l = this.loc();
    this.advance(); // consume 'upload'
    this.expect(TokenType.LBRACE, "Expected '{' after 'upload'");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this.expect(TokenType.IDENTIFIER, "Expected upload config key").value;
      this.expect(TokenType.COLON, "Expected ':' after upload key");
      const value = this.parseExpression();
      config[key] = value;
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close upload config");
    return new AST.UploadDeclaration(config, l);
  };

  ParserClass.prototype.parseSessionConfig = function() {
    const l = this.loc();
    this.advance(); // consume 'session'
    this.expect(TokenType.LBRACE, "Expected '{' after 'session'");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this.expect(TokenType.IDENTIFIER, "Expected session config key").value;
      this.expect(TokenType.COLON, "Expected ':' after session key");
      const value = this.parseExpression();
      config[key] = value;
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close session config");
    return new AST.SessionDeclaration(config, l);
  };

  ParserClass.prototype.parseAiConfig = function() {
    const l = this.loc();
    this.advance(); // consume 'ai'

    // Optional name: ai "claude" { ... }
    let name = null;
    if (this.check(TokenType.STRING)) {
      name = this.advance().value;
    }

    this.expect(TokenType.LBRACE, "Expected '{' after 'ai'");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this.expect(TokenType.IDENTIFIER, "Expected ai config key").value;
      this.expect(TokenType.COLON, "Expected ':' after ai config key");
      const value = this.parseExpression();
      config[key] = value;
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close ai config");
    return new AST.AiConfigDeclaration(name, config, l);
  };

  ParserClass.prototype.parseDbConfig = function() {
    const l = this.loc();
    this.advance(); // consume 'db'
    this.expect(TokenType.LBRACE, "Expected '{' after 'db'");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this.expect(TokenType.IDENTIFIER, "Expected db config key").value;
      this.expect(TokenType.COLON, "Expected ':' after db key");
      const value = this.parseExpression();
      config[key] = value;
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close db config");
    return new AST.DbDeclaration(config, l);
  };

  ParserClass.prototype.parseTlsConfig = function() {
    const l = this.loc();
    this.advance(); // consume 'tls'
    this.expect(TokenType.LBRACE, "Expected '{' after 'tls'");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this.expect(TokenType.IDENTIFIER, "Expected tls config key").value;
      this.expect(TokenType.COLON, "Expected ':' after tls key");
      const value = this.parseExpression();
      config[key] = value;
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close tls config");
    return new AST.TlsDeclaration(config, l);
  };

  ParserClass.prototype.parseCompressionConfig = function() {
    const l = this.loc();
    this.advance(); // consume 'compression'
    this.expect(TokenType.LBRACE, "Expected '{' after 'compression'");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this.expect(TokenType.IDENTIFIER, "Expected compression config key").value;
      this.expect(TokenType.COLON, "Expected ':' after compression key");
      const value = this.parseExpression();
      config[key] = value;
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close compression config");
    return new AST.CompressionDeclaration(config, l);
  };

  ParserClass.prototype.parseBackgroundJob = function() {
    const l = this.loc();
    this.advance(); // consume 'background'
    this.expect(TokenType.FN, "Expected 'fn' after 'background'");
    const name = this.expect(TokenType.IDENTIFIER, "Expected background job name").value;
    this.expect(TokenType.LPAREN, "Expected '(' after background job name");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after background job parameters");
    const body = this.parseBlock();
    return new AST.BackgroundJobDeclaration(name, params, body, l);
  };

  ParserClass.prototype.parseCacheConfig = function() {
    const l = this.loc();
    this.advance(); // consume 'cache'
    this.expect(TokenType.LBRACE, "Expected '{' after 'cache'");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this.expect(TokenType.IDENTIFIER, "Expected cache config key").value;
      this.expect(TokenType.COLON, "Expected ':' after cache key");
      const value = this.parseExpression();
      config[key] = value;
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close cache config");
    return new AST.CacheDeclaration(config, l);
  };

  ParserClass.prototype.parseSseDeclaration = function() {
    const l = this.loc();
    this.advance(); // consume 'sse'
    const path = this.expect(TokenType.STRING, "Expected SSE endpoint path").value;
    this.expect(TokenType.FN, "Expected 'fn' after SSE path");
    this.expect(TokenType.LPAREN, "Expected '(' after 'fn'");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after SSE parameters");
    const body = this.parseBlock();
    return new AST.SseDeclaration(path, params, body, l);
  };

  ParserClass.prototype.parseModelDeclaration = function() {
    const l = this.loc();
    this.advance(); // consume 'model'
    const name = this.expect(TokenType.IDENTIFIER, "Expected model/type name after 'model'").value;
    let config = null;
    if (this.check(TokenType.LBRACE)) {
      this.advance(); // consume '{'
      config = {};
      while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
        const key = this.expect(TokenType.IDENTIFIER, "Expected model config key").value;
        this.expect(TokenType.COLON, "Expected ':' after model config key");
        const value = this.parseExpression();
        config[key] = value;
        this.match(TokenType.COMMA);
      }
      this.expect(TokenType.RBRACE, "Expected '}' to close model config");
    }
    return new AST.ModelDeclaration(name, config, l);
  };

  ParserClass.prototype.parseRoute = function() {
    const l = this.loc();
    this.expect(TokenType.ROUTE);

    // HTTP method: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS (as identifiers)
    const methodTok = this.expect(TokenType.IDENTIFIER, "Expected HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)");
    const method = methodTok.value.toUpperCase();
    if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(method)) {
      this.error(`Invalid HTTP method: ${method}`);
    }

    const path = this.expect(TokenType.STRING, "Expected route path string");

    // Optional body type annotation: route POST "/api/users" body: User => handler
    let bodyType = null;
    if (this.check(TokenType.IDENTIFIER) && this.current().value === 'body') {
      const next = this.peek(1);
      if (next && next.type === TokenType.COLON) {
        this.advance(); // consume 'body'
        this.advance(); // consume ':'
        bodyType = this.parseTypeAnnotation();
      }
    }

    // Optional decorators: route GET "/path" with auth, role("admin") => handler
    let decorators = [];
    if (this.check(TokenType.WITH)) {
      this.advance(); // consume 'with'
      // Parse comma-separated decorator list
      do {
        const decName = this.expect(TokenType.IDENTIFIER, "Expected decorator name").value;
        let decArgs = [];
        if (this.check(TokenType.LPAREN)) {
          this.advance(); // (
          while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
            decArgs.push(this.parseExpression());
            if (!this.match(TokenType.COMMA)) break;
          }
          this.expect(TokenType.RPAREN, "Expected ')' after decorator arguments");
        }
        decorators.push({ name: decName, args: decArgs });
      } while (this.match(TokenType.COMMA));
    }

    // Optional response type annotation: route GET "/api/users" -> [User] => handler
    let responseType = null;
    if (this.check(TokenType.THIN_ARROW)) {
      this.advance(); // consume '->'
      responseType = this.parseTypeAnnotation();
    }

    this.expect(TokenType.ARROW, "Expected '=>' after route path");
    const handler = this.parseExpression();

    return new AST.RouteDeclaration(method, path.value, handler, l, decorators, bodyType, responseType);
  };
}
