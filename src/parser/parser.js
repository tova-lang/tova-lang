import { TokenType } from '../lexer/tokens.js';
import * as AST from './ast.js';

export class Parser {
  constructor(tokens, filename = '<stdin>') {
    this.tokens = tokens.filter(t => t.type !== TokenType.NEWLINE && t.type !== TokenType.DOCSTRING);
    this.rawTokens = tokens;
    this.filename = filename;
    this.pos = 0;
    this.errors = [];
    this.docstrings = this.extractDocstrings(tokens);
  }

  extractDocstrings(tokens) {
    const docs = [];
    for (const t of tokens) {
      if (t.type === TokenType.DOCSTRING) {
        docs.push(t);
      }
    }
    return docs;
  }

  // ─── Helpers ───────────────────────────────────────────────

  error(message) {
    const tok = this.current();
    const err = new Error(
      `${this.filename}:${tok.line}:${tok.column} — Parse error: ${message}\n  Got: ${tok.type} (${JSON.stringify(tok.value)})`
    );
    err.loc = { line: tok.line, column: tok.column, file: this.filename };
    throw err;
  }

  current() {
    return this.tokens[this.pos] || this.tokens[this.tokens.length - 1];
  }

  peek(offset = 0) {
    const idx = this.pos + offset;
    return idx < this.tokens.length ? this.tokens[idx] : this.tokens[this.tokens.length - 1];
  }

  advance() {
    const tok = this.current();
    this.pos++;
    return tok;
  }

  check(type) {
    return this.current().type === type;
  }

  checkValue(type, value) {
    const tok = this.current();
    return tok.type === type && tok.value === value;
  }

  match(...types) {
    for (const type of types) {
      if (this.check(type)) {
        return this.advance();
      }
    }
    return null;
  }

  expect(type, message) {
    if (this.check(type)) {
      return this.advance();
    }
    this.error(message || `Expected ${type}, got ${this.current().type}`);
  }

  loc() {
    const tok = this.current();
    return { line: tok.line, column: tok.column, file: this.filename };
  }

  isAtEnd() {
    return this.check(TokenType.EOF);
  }

  _synchronize() {
    this.advance(); // skip the problematic token
    while (!this.isAtEnd()) {
      const tok = this.current();
      // Statement-starting keywords — safe to resume parsing here
      if (tok.type === TokenType.FN || tok.type === TokenType.TYPE ||
          tok.type === TokenType.IF || tok.type === TokenType.FOR ||
          tok.type === TokenType.WHILE || tok.type === TokenType.RETURN ||
          tok.type === TokenType.IMPORT || tok.type === TokenType.MATCH ||
          tok.type === TokenType.TRY || tok.type === TokenType.SERVER ||
          tok.type === TokenType.CLIENT || tok.type === TokenType.SHARED ||
          tok.type === TokenType.GUARD || tok.type === TokenType.INTERFACE ||
          tok.type === TokenType.IMPL || tok.type === TokenType.TRAIT ||
          tok.type === TokenType.PUB || tok.type === TokenType.DEFER) {
        return;
      }
      if (tok.type === TokenType.RBRACE) {
        this.advance();
        return;
      }
      this.advance();
    }
  }

  // Detect if current < starts a JSX tag (vs comparison operator)
  _looksLikeJSX() {
    if (!this.check(TokenType.LESS)) return false;
    const next = this.peek(1);
    if (next.type !== TokenType.IDENTIFIER) return false;
    // Uppercase tag is always a component reference, never a comparison variable
    if (/^[A-Z]/.test(next.value)) return true;
    const afterIdent = this.peek(2);
    // JSX patterns: <div>, <div/>, <div attr=...>, <div on:click=...>
    // After the tag name, we can see >, /, an attribute name (identifier or keyword), or :
    return afterIdent.type === TokenType.GREATER ||
           afterIdent.type === TokenType.SLASH ||
           afterIdent.type === TokenType.IDENTIFIER ||
           afterIdent.type === TokenType.COLON ||
           afterIdent.type === TokenType.STATE ||
           afterIdent.type === TokenType.TYPE ||
           afterIdent.type === TokenType.FOR ||
           afterIdent.type === TokenType.IN ||
           afterIdent.type === TokenType.IF ||
           afterIdent.type === TokenType.ELSE ||
           afterIdent.type === TokenType.MATCH ||
           afterIdent.type === TokenType.RETURN ||
           afterIdent.type === TokenType.NUMBER;
  }

  // ─── Program ───────────────────────────────────────────────

  parse() {
    const body = [];
    while (!this.isAtEnd()) {
      try {
        const stmt = this.parseTopLevel();
        if (stmt) body.push(stmt);
      } catch (e) {
        this.errors.push(e);
        this._synchronize();
      }
    }
    if (this.errors.length > 0) {
      const combined = new Error(this.errors.map(e => e.message).join('\n'));
      combined.errors = this.errors;
      combined.partialAST = new AST.Program(body);
      throw combined;
    }
    return new AST.Program(body);
  }

  parseTopLevel() {
    if (this.check(TokenType.SERVER)) return this.parseServerBlock();
    if (this.check(TokenType.CLIENT)) return this.parseClientBlock();
    if (this.check(TokenType.SHARED)) return this.parseSharedBlock();
    if (this.check(TokenType.IMPORT)) return this.parseImport();
    // test block: test "name" { ... } or test { ... }
    if (this.check(TokenType.IDENTIFIER) && this.current().value === 'test') {
      const next = this.peek(1);
      if (next.type === TokenType.LBRACE || next.type === TokenType.STRING) {
        return this.parseTestBlock();
      }
    }
    return this.parseStatement();
  }

  parseTestBlock() {
    const l = this.loc();
    this.advance(); // consume 'test'
    let name = null;
    if (this.check(TokenType.STRING)) {
      name = this.advance().value;
    }
    this.expect(TokenType.LBRACE, "Expected '{' after test block name");
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      body.push(this.parseStatement());
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close test block");
    return new AST.TestBlock(name, body, l);
  }

  // ─── Full-stack blocks ────────────────────────────────────

  parseServerBlock() {
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
      body.push(this.parseServerStatement());
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close server block");
    return new AST.ServerBlock(body, l, name);
  }

  parseClientBlock() {
    const l = this.loc();
    this.expect(TokenType.CLIENT);
    // Optional block name: client "admin" { }
    let name = null;
    if (this.check(TokenType.STRING)) {
      name = this.advance().value;
    }
    this.expect(TokenType.LBRACE, "Expected '{' after 'client'");
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      body.push(this.parseClientStatement());
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close client block");
    return new AST.ClientBlock(body, l, name);
  }

  parseSharedBlock() {
    const l = this.loc();
    this.expect(TokenType.SHARED);
    // Optional block name: shared "models" { }
    let name = null;
    if (this.check(TokenType.STRING)) {
      name = this.advance().value;
    }
    this.expect(TokenType.LBRACE, "Expected '{' after 'shared'");
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      body.push(this.parseStatement());
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close shared block");
    return new AST.SharedBlock(body, l, name);
  }

  // ─── Server-specific statements ───────────────────────────

  parseServerStatement() {
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
    }

    return this.parseStatement();
  }

  parseMiddleware() {
    const l = this.loc();
    this.advance(); // consume 'middleware'
    this.expect(TokenType.FN);
    const name = this.expect(TokenType.IDENTIFIER, "Expected middleware name").value;
    this.expect(TokenType.LPAREN, "Expected '(' after middleware name");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after middleware parameters");
    const body = this.parseBlock();
    return new AST.MiddlewareDeclaration(name, params, body, l);
  }

  parseHealthCheck() {
    const l = this.loc();
    this.advance(); // consume 'health'
    const path = this.expect(TokenType.STRING, "Expected health check path string");
    return new AST.HealthCheckDeclaration(path.value, l);
  }

  parseCorsConfig() {
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
  }

  parseErrorHandler() {
    const l = this.loc();
    this.advance(); // consume 'on_error'
    this.expect(TokenType.FN);
    this.expect(TokenType.LPAREN, "Expected '(' after 'fn'");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after error handler parameters");
    const body = this.parseBlock();
    return new AST.ErrorHandlerDeclaration(params, body, l);
  }

  parseWebSocket() {
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
  }

  parseStaticDeclaration() {
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
  }

  parseDiscover() {
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
    if (this.check(TokenType.IDENTIFIER) && this.current().value === 'with') {
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
  }

  parseAuthConfig() {
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
  }

  parseMaxBody() {
    const l = this.loc();
    this.advance(); // consume 'max_body'
    const limit = this.parseExpression();
    return new AST.MaxBodyDeclaration(limit, l);
  }

  parseRouteGroup() {
    const l = this.loc();
    this.advance(); // consume 'routes'
    const prefix = this.expect(TokenType.STRING, "Expected route group prefix string").value;
    this.expect(TokenType.LBRACE, "Expected '{' after route group prefix");
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      body.push(this.parseServerStatement());
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close route group");
    return new AST.RouteGroupDeclaration(prefix, body, l);
  }

  parseRateLimitConfig() {
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
  }

  parseLifecycleHook(hookName) {
    const l = this.loc();
    this.advance(); // consume 'on_start' or 'on_stop'
    this.expect(TokenType.FN);
    this.expect(TokenType.LPAREN, "Expected '(' after 'fn'");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after lifecycle hook parameters");
    const body = this.parseBlock();
    return new AST.LifecycleHookDeclaration(hookName, params, body, l);
  }

  parseSubscribe() {
    const l = this.loc();
    this.advance(); // consume 'subscribe'
    const event = this.expect(TokenType.STRING, "Expected event name string").value;
    this.expect(TokenType.FN, "Expected 'fn' after event name");
    this.expect(TokenType.LPAREN, "Expected '(' after 'fn'");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after subscribe parameters");
    const body = this.parseBlock();
    return new AST.SubscribeDeclaration(event, params, body, l);
  }

  parseEnvDeclaration() {
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
  }

  parseSchedule() {
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
  }

  parseUploadConfig() {
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
  }

  parseSessionConfig() {
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
  }

  parseDbConfig() {
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
  }

  parseTlsConfig() {
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
  }

  parseCompressionConfig() {
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
  }

  parseBackgroundJob() {
    const l = this.loc();
    this.advance(); // consume 'background'
    this.expect(TokenType.FN, "Expected 'fn' after 'background'");
    const name = this.expect(TokenType.IDENTIFIER, "Expected background job name").value;
    this.expect(TokenType.LPAREN, "Expected '(' after background job name");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after background job parameters");
    const body = this.parseBlock();
    return new AST.BackgroundJobDeclaration(name, params, body, l);
  }

  parseCacheConfig() {
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
  }

  parseSseDeclaration() {
    const l = this.loc();
    this.advance(); // consume 'sse'
    const path = this.expect(TokenType.STRING, "Expected SSE endpoint path").value;
    this.expect(TokenType.FN, "Expected 'fn' after SSE path");
    this.expect(TokenType.LPAREN, "Expected '(' after 'fn'");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after SSE parameters");
    const body = this.parseBlock();
    return new AST.SseDeclaration(path, params, body, l);
  }

  parseModelDeclaration() {
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
  }

  parseRoute() {
    const l = this.loc();
    this.expect(TokenType.ROUTE);

    // HTTP method: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS (as identifiers)
    const methodTok = this.expect(TokenType.IDENTIFIER, "Expected HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)");
    const method = methodTok.value.toUpperCase();
    if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(method)) {
      this.error(`Invalid HTTP method: ${method}`);
    }

    const path = this.expect(TokenType.STRING, "Expected route path string");

    // Optional decorators: route GET "/path" with auth, role("admin") => handler
    let decorators = [];
    if (this.check(TokenType.IDENTIFIER) && this.current().value === 'with') {
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

    this.expect(TokenType.ARROW, "Expected '=>' after route path");
    const handler = this.parseExpression();

    return new AST.RouteDeclaration(method, path.value, handler, l, decorators);
  }

  // ─── Client-specific statements ───────────────────────────

  parseClientStatement() {
    if (this.check(TokenType.STATE)) return this.parseState();
    if (this.check(TokenType.COMPUTED)) return this.parseComputed();
    if (this.check(TokenType.EFFECT)) return this.parseEffect();
    if (this.check(TokenType.COMPONENT)) return this.parseComponent();
    if (this.check(TokenType.STORE)) return this.parseStore();
    return this.parseStatement();
  }

  parseStore() {
    const l = this.loc();
    this.expect(TokenType.STORE);
    const name = this.expect(TokenType.IDENTIFIER, "Expected store name").value;
    this.expect(TokenType.LBRACE, "Expected '{' after store name");

    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.STATE)) {
        body.push(this.parseState());
      } else if (this.check(TokenType.COMPUTED)) {
        body.push(this.parseComputed());
      } else if (this.check(TokenType.FN) && this.peek(1).type === TokenType.IDENTIFIER) {
        body.push(this.parseFunctionDeclaration());
      } else {
        this.error("Expected 'state', 'computed', or 'fn' inside store block");
      }
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close store block");

    return new AST.StoreDeclaration(name, body, l);
  }

  parseState() {
    const l = this.loc();
    this.expect(TokenType.STATE);
    const name = this.expect(TokenType.IDENTIFIER, "Expected state variable name").value;

    let typeAnnotation = null;
    if (this.match(TokenType.COLON)) {
      typeAnnotation = this.parseTypeAnnotation();
    }

    this.expect(TokenType.ASSIGN, "Expected '=' in state declaration");
    const value = this.parseExpression();

    return new AST.StateDeclaration(name, typeAnnotation, value, l);
  }

  parseComputed() {
    const l = this.loc();
    this.expect(TokenType.COMPUTED);
    const name = this.expect(TokenType.IDENTIFIER, "Expected computed variable name").value;
    this.expect(TokenType.ASSIGN, "Expected '=' in computed declaration");
    const expr = this.parseExpression();

    return new AST.ComputedDeclaration(name, expr, l);
  }

  parseEffect() {
    const l = this.loc();
    this.expect(TokenType.EFFECT);
    const body = this.parseBlock();
    return new AST.EffectDeclaration(body, l);
  }

  parseComponent() {
    const l = this.loc();
    this.expect(TokenType.COMPONENT);
    const name = this.expect(TokenType.IDENTIFIER, "Expected component name").value;

    let params = [];
    if (this.match(TokenType.LPAREN)) {
      params = this.parseParameterList();
      this.expect(TokenType.RPAREN, "Expected ')' after component parameters");
    }

    this.expect(TokenType.LBRACE, "Expected '{' to open component body");
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.STYLE_BLOCK)) {
        const sl = this.loc();
        const css = this.current().value;
        this.advance();
        body.push(new AST.ComponentStyleBlock(css, sl));
      } else if (this.check(TokenType.LESS) && this._looksLikeJSX()) {
        body.push(this.parseJSXElement());
      } else if (this.check(TokenType.STATE)) {
        body.push(this.parseState());
      } else if (this.check(TokenType.COMPUTED)) {
        body.push(this.parseComputed());
      } else if (this.check(TokenType.EFFECT)) {
        body.push(this.parseEffect());
      } else if (this.check(TokenType.COMPONENT)) {
        body.push(this.parseComponent());
      } else {
        body.push(this.parseStatement());
      }
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close component body");

    return new AST.ComponentDeclaration(name, params, body, l);
  }

  // ─── JSX-like parsing ─────────────────────────────────────

  _collapseJSXWhitespace(text) {
    let result = text.replace(/\s+/g, ' ');
    if (result.trim() === '') return '';
    return result.trim();
  }

  parseJSXElement() {
    const l = this.loc();
    this.expect(TokenType.LESS, "Expected '<'");

    const tag = this.expect(TokenType.IDENTIFIER, "Expected tag name").value;

    // Parse attributes (including spread: {...expr})
    const attributes = [];
    while (!this.check(TokenType.GREATER) && !this.check(TokenType.SLASH) && !this.isAtEnd()) {
      // Check for spread attribute: {...expr}
      if (this.check(TokenType.LBRACE) && this.peek(1).type === TokenType.SPREAD) {
        const sl = this.loc();
        this.advance(); // {
        this.advance(); // ...
        const expr = this.parseExpression();
        this.expect(TokenType.RBRACE, "Expected '}' after spread expression");
        attributes.push(new AST.JSXSpreadAttribute(expr, sl));
      } else {
        attributes.push(this.parseJSXAttribute());
      }
    }

    // Self-closing tag: />
    if (this.match(TokenType.SLASH)) {
      this.expect(TokenType.GREATER, "Expected '>' in self-closing tag");
      return new AST.JSXElement(tag, attributes, [], true, l);
    }

    this.expect(TokenType.GREATER, "Expected '>'");

    // Parse children
    const children = this.parseJSXChildren(tag);

    return new AST.JSXElement(tag, attributes, children, false, l);
  }

  parseJSXAttribute() {
    const l = this.loc();
    // Accept keywords as attribute names (type, class, for, etc. are valid HTML attributes)
    let name;
    if (this.check(TokenType.IDENTIFIER) || this.check(TokenType.TYPE) || this.check(TokenType.FOR) ||
        this.check(TokenType.IN) || this.check(TokenType.AS) || this.check(TokenType.EXPORT) ||
        this.check(TokenType.STATE) || this.check(TokenType.COMPUTED) || this.check(TokenType.ROUTE)) {
      name = this.advance().value;
    } else {
      this.error("Expected attribute name");
    }

    // Handle namespaced attributes: on:click, bind:value, class:active
    if (this.match(TokenType.COLON)) {
      let suffix;
      if (this.check(TokenType.IDENTIFIER) || this.check(TokenType.IN)) {
        suffix = this.advance().value;
      } else {
        suffix = this.expect(TokenType.IDENTIFIER, "Expected name after ':'").value;
      }
      name = `${name}:${suffix}`;
    }

    if (!this.match(TokenType.ASSIGN)) {
      // Boolean attribute: <input disabled />
      return new AST.JSXAttribute(name, new AST.BooleanLiteral(true, l), l);
    }

    // Value can be {expression} or "string"
    if (this.match(TokenType.LBRACE)) {
      const expr = this.parseExpression();
      this.expect(TokenType.RBRACE, "Expected '}' after attribute expression");
      return new AST.JSXAttribute(name, expr, l);
    }

    if (this.check(TokenType.STRING) || this.check(TokenType.STRING_TEMPLATE)) {
      const val = this.parseStringLiteral();
      return new AST.JSXAttribute(name, val, l);
    }

    this.error("Expected attribute value");
  }

  parseJSXChildren(parentTag) {
    const children = [];

    while (!this.isAtEnd()) {
      // Closing tag: </tag>
      if (this.check(TokenType.LESS) && this.peek(1).type === TokenType.SLASH) {
        this.advance(); // <
        this.advance(); // /
        const closeTag = this.expect(TokenType.IDENTIFIER, "Expected closing tag name").value;
        if (closeTag !== parentTag) {
          this.error(`Mismatched closing tag: expected </${parentTag}>, got </${closeTag}>`);
        }
        this.expect(TokenType.GREATER, "Expected '>' in closing tag");
        break;
      }

      // Nested element
      if (this.check(TokenType.LESS)) {
        children.push(this.parseJSXElement());
        continue;
      }

      // String literal as text
      if (this.check(TokenType.STRING) || this.check(TokenType.STRING_TEMPLATE)) {
        const str = this.parseStringLiteral();
        children.push(new AST.JSXText(str, this.loc()));
        continue;
      }

      // Unquoted JSX text
      if (this.check(TokenType.JSX_TEXT)) {
        const tok = this.advance();
        const text = this._collapseJSXWhitespace(tok.value);
        if (text.length > 0) {
          children.push(new AST.JSXText(new AST.StringLiteral(text, this.loc()), this.loc()));
        }
        continue;
      }

      // Expression in braces: {expr}
      if (this.check(TokenType.LBRACE)) {
        this.advance();
        const expr = this.parseExpression();
        this.expect(TokenType.RBRACE, "Expected '}' after JSX expression");
        children.push(new AST.JSXExpression(expr, this.loc()));
        continue;
      }

      // for loop inside JSX
      if (this.check(TokenType.FOR)) {
        children.push(this.parseJSXFor());
        continue;
      }

      // if inside JSX
      if (this.check(TokenType.IF)) {
        children.push(this.parseJSXIf());
        continue;
      }

      break;
    }

    return children;
  }

  parseJSXFor() {
    const l = this.loc();
    this.expect(TokenType.FOR);

    // Support destructuring: for [i, item] in ..., for {name, age} in ...
    let variable;
    if (this.check(TokenType.LBRACKET)) {
      // Array destructuring: [a, b]
      this.advance(); // consume [
      const elements = [];
      while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
        elements.push(this.expect(TokenType.IDENTIFIER, "Expected variable name in array pattern").value);
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACKET, "Expected ']' in destructuring pattern");
      variable = `[${elements.join(', ')}]`;
    } else if (this.check(TokenType.LBRACE)) {
      // Object destructuring: {name, age}
      this.advance(); // consume {
      const props = [];
      while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
        props.push(this.expect(TokenType.IDENTIFIER, "Expected property name in object pattern").value);
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACE, "Expected '}' in destructuring pattern");
      variable = `{${props.join(', ')}}`;
    } else {
      variable = this.expect(TokenType.IDENTIFIER, "Expected loop variable").value;
    }

    this.expect(TokenType.IN, "Expected 'in' in for loop");
    const iterable = this.parseExpression();

    // Optional key expression: for item in items key={item.id} { ... }
    let keyExpr = null;
    if (this.check(TokenType.IDENTIFIER) && this.current().value === 'key') {
      this.advance(); // consume 'key'
      this.expect(TokenType.ASSIGN, "Expected '=' after 'key'");
      this.expect(TokenType.LBRACE, "Expected '{' after 'key='");
      keyExpr = this.parseExpression();
      this.expect(TokenType.RBRACE, "Expected '}' after key expression");
    }

    this.expect(TokenType.LBRACE, "Expected '{' in JSX for body");

    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.LESS)) {
        body.push(this.parseJSXElement());
      } else if (this.check(TokenType.STRING) || this.check(TokenType.STRING_TEMPLATE)) {
        body.push(new AST.JSXText(this.parseStringLiteral(), this.loc()));
      } else if (this.check(TokenType.JSX_TEXT)) {
        const tok = this.advance();
        const text = this._collapseJSXWhitespace(tok.value);
        if (text.length > 0) {
          body.push(new AST.JSXText(new AST.StringLiteral(text, this.loc()), this.loc()));
        }
      } else if (this.check(TokenType.LBRACE)) {
        this.advance();
        body.push(new AST.JSXExpression(this.parseExpression(), this.loc()));
        this.expect(TokenType.RBRACE);
      } else {
        break;
      }
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close JSX for body");

    return new AST.JSXFor(variable, iterable, body, l, keyExpr);
  }

  _parseJSXIfBody() {
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.LESS)) {
        body.push(this.parseJSXElement());
      } else if (this.check(TokenType.STRING) || this.check(TokenType.STRING_TEMPLATE)) {
        body.push(new AST.JSXText(this.parseStringLiteral(), this.loc()));
      } else if (this.check(TokenType.JSX_TEXT)) {
        const tok = this.advance();
        const text = this._collapseJSXWhitespace(tok.value);
        if (text.length > 0) {
          body.push(new AST.JSXText(new AST.StringLiteral(text, this.loc()), this.loc()));
        }
      } else if (this.check(TokenType.LBRACE)) {
        this.advance();
        body.push(new AST.JSXExpression(this.parseExpression(), this.loc()));
        this.expect(TokenType.RBRACE);
      } else {
        break;
      }
    }
    return body;
  }

  parseJSXIf() {
    const l = this.loc();
    this.expect(TokenType.IF);
    const condition = this.parseExpression();
    this.expect(TokenType.LBRACE, "Expected '{' in JSX if body");
    const consequent = this._parseJSXIfBody();
    this.expect(TokenType.RBRACE, "Expected '}' to close JSX if body");

    // Parse elif chains
    const alternates = [];
    while (this.check(TokenType.ELIF)) {
      this.advance(); // consume 'elif'
      const elifCond = this.parseExpression();
      this.expect(TokenType.LBRACE, "Expected '{' in JSX elif body");
      const elifBody = this._parseJSXIfBody();
      this.expect(TokenType.RBRACE, "Expected '}' to close JSX elif body");
      alternates.push({ condition: elifCond, body: elifBody });
    }

    // Parse optional else
    let alternate = null;
    if (this.check(TokenType.ELSE)) {
      this.advance();
      this.expect(TokenType.LBRACE);
      alternate = this._parseJSXIfBody();
      this.expect(TokenType.RBRACE);
    }

    return new AST.JSXIf(condition, consequent, alternate, l, alternates);
  }

  // ─── Statements ───────────────────────────────────────────

  parseStatement() {
    // pub modifier: pub fn, pub type, pub x = ...
    if (this.check(TokenType.PUB)) return this.parsePubDeclaration();
    if (this.check(TokenType.ASYNC) && this.peek(1).type === TokenType.FN) return this.parseAsyncFunctionDeclaration();
    if (this.check(TokenType.FN) && this.peek(1).type === TokenType.IDENTIFIER) return this.parseFunctionDeclaration();
    if (this.check(TokenType.TYPE)) return this.parseTypeDeclaration();
    if (this.check(TokenType.VAR)) return this.parseVarDeclaration();
    if (this.check(TokenType.LET)) return this.parseLetDestructure();
    if (this.check(TokenType.IF)) return this.parseIfStatement();
    if (this.check(TokenType.FOR)) return this.parseForStatement();
    if (this.check(TokenType.WHILE)) return this.parseWhileStatement();
    if (this.check(TokenType.RETURN)) return this.parseReturnStatement();
    if (this.check(TokenType.IMPORT)) return this.parseImport();
    if (this.check(TokenType.MATCH)) return this.parseMatchAsStatement();
    if (this.check(TokenType.TRY)) return this.parseTryCatch();
    if (this.check(TokenType.BREAK)) return this.parseBreakStatement();
    if (this.check(TokenType.CONTINUE)) return this.parseContinueStatement();
    if (this.check(TokenType.GUARD)) return this.parseGuardStatement();
    if (this.check(TokenType.INTERFACE)) return this.parseInterfaceDeclaration();
    if (this.check(TokenType.IMPL)) return this.parseImplDeclaration();
    if (this.check(TokenType.TRAIT)) return this.parseTraitDeclaration();
    if (this.check(TokenType.DEFER)) return this.parseDeferStatement();

    return this.parseExpressionOrAssignment();
  }

  parsePubDeclaration() {
    const l = this.loc();
    this.advance(); // consume 'pub'
    const stmt = this.parseStatement();
    if (stmt) stmt.isPublic = true;
    return stmt;
  }

  parseImplDeclaration() {
    const l = this.loc();
    this.expect(TokenType.IMPL);
    const firstName = this.expect(TokenType.IDENTIFIER, "Expected type name after 'impl'").value;

    // Check for `impl Trait for Type`
    let typeName, traitName = null;
    if (this.check(TokenType.FOR)) {
      this.advance();
      traitName = firstName;
      typeName = this.expect(TokenType.IDENTIFIER, "Expected type name after 'for'").value;
    } else {
      typeName = firstName;
    }

    this.expect(TokenType.LBRACE, "Expected '{' to open impl block");

    const methods = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const isAsync = this.check(TokenType.ASYNC) && this.peek(1).type === TokenType.FN;
      if (isAsync) {
        methods.push(this.parseAsyncFunctionDeclaration());
      } else {
        this.expect(TokenType.FN, "Expected 'fn' in impl block");
        const name = this.expect(TokenType.IDENTIFIER, "Expected method name").value;
        this.expect(TokenType.LPAREN, "Expected '(' after method name");
        const params = this.parseParameterList();
        this.expect(TokenType.RPAREN, "Expected ')' after parameters");
        let returnType = null;
        if (this.match(TokenType.THIN_ARROW)) {
          returnType = this.parseTypeAnnotation();
        }
        const body = this.parseBlock();
        methods.push(new AST.FunctionDeclaration(name, params, body, returnType, l));
      }
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close impl block");
    return new AST.ImplDeclaration(typeName, methods, l, traitName);
  }

  parseTraitDeclaration() {
    const l = this.loc();
    this.expect(TokenType.TRAIT);
    const name = this.expect(TokenType.IDENTIFIER, "Expected trait name").value;
    this.expect(TokenType.LBRACE, "Expected '{' to open trait body");

    const methods = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      this.expect(TokenType.FN, "Expected 'fn' in trait body");
      const methodName = this.expect(TokenType.IDENTIFIER, "Expected method name").value;
      this.expect(TokenType.LPAREN, "Expected '(' after method name");
      const params = this.parseParameterList();
      this.expect(TokenType.RPAREN, "Expected ')' after parameters");
      let returnType = null;
      if (this.match(TokenType.THIN_ARROW)) {
        returnType = this.parseTypeAnnotation();
      }
      // Optional default implementation
      let body = null;
      if (this.check(TokenType.LBRACE)) {
        body = this.parseBlock();
      }
      methods.push({ name: methodName, params, returnType, body });
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close trait body");
    return new AST.TraitDeclaration(name, methods, l);
  }

  parseDeferStatement() {
    const l = this.loc();
    this.expect(TokenType.DEFER);
    let body;
    if (this.check(TokenType.LBRACE)) {
      body = this.parseBlock();
    } else {
      body = this.parseExpression();
    }
    return new AST.DeferStatement(body, l);
  }

  parseFunctionDeclaration() {
    const l = this.loc();
    this.expect(TokenType.FN);
    const name = this.expect(TokenType.IDENTIFIER, "Expected function name").value;
    this.expect(TokenType.LPAREN, "Expected '(' after function name");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after parameters");

    let returnType = null;
    if (this.match(TokenType.THIN_ARROW)) {
      returnType = this.parseTypeAnnotation();
    }

    const body = this.parseBlock();
    return new AST.FunctionDeclaration(name, params, body, returnType, l);
  }

  parseAsyncFunctionDeclaration() {
    const l = this.loc();
    this.expect(TokenType.ASYNC);
    this.expect(TokenType.FN);
    const name = this.expect(TokenType.IDENTIFIER, "Expected function name").value;
    this.expect(TokenType.LPAREN, "Expected '(' after function name");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after parameters");

    let returnType = null;
    if (this.match(TokenType.THIN_ARROW)) {
      returnType = this.parseTypeAnnotation();
    }

    const body = this.parseBlock();
    return new AST.FunctionDeclaration(name, params, body, returnType, l, true);
  }

  parseBreakStatement() {
    const l = this.loc();
    this.expect(TokenType.BREAK);
    return new AST.BreakStatement(l);
  }

  parseContinueStatement() {
    const l = this.loc();
    this.expect(TokenType.CONTINUE);
    return new AST.ContinueStatement(l);
  }

  parseGuardStatement() {
    const l = this.loc();
    this.expect(TokenType.GUARD);
    const condition = this.parseExpression();
    this.expect(TokenType.ELSE, "Expected 'else' after guard condition");
    const elseBody = this.parseBlock();
    return new AST.GuardStatement(condition, elseBody, l);
  }

  parseInterfaceDeclaration() {
    const l = this.loc();
    this.expect(TokenType.INTERFACE);
    const name = this.expect(TokenType.IDENTIFIER, "Expected interface name").value;
    this.expect(TokenType.LBRACE, "Expected '{' to open interface body");

    const methods = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      this.expect(TokenType.FN, "Expected 'fn' in interface body");
      const methodName = this.expect(TokenType.IDENTIFIER, "Expected method name").value;
      this.expect(TokenType.LPAREN, "Expected '(' after method name");
      const params = this.parseParameterList();
      this.expect(TokenType.RPAREN, "Expected ')' after parameters");
      let returnType = null;
      if (this.match(TokenType.THIN_ARROW)) {
        returnType = this.parseTypeAnnotation();
      }
      methods.push({ name: methodName, params, returnType });
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close interface body");
    return new AST.InterfaceDeclaration(name, methods, l);
  }

  parseParameterList() {
    const params = [];
    while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
      const l = this.loc();

      // Destructuring pattern parameter: {name, email} or [a, b]
      if (this.check(TokenType.LBRACE)) {
        this.advance();
        const properties = [];
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
          const key = this.expect(TokenType.IDENTIFIER, "Expected property name").value;
          let value = key;
          let defaultValue = null;
          if (this.match(TokenType.COLON)) {
            value = this.expect(TokenType.IDENTIFIER, "Expected alias name").value;
          }
          if (this.match(TokenType.ASSIGN)) {
            defaultValue = this.parseExpression();
          }
          properties.push({ key, value, defaultValue });
          if (!this.match(TokenType.COMMA)) break;
        }
        this.expect(TokenType.RBRACE, "Expected '}'");
        const pattern = new AST.ObjectPattern(properties, l);
        const param = new AST.Parameter(null, null, null, l);
        param.destructure = pattern;
        params.push(param);
      } else if (this.check(TokenType.LBRACKET)) {
        this.advance();
        const elements = [];
        while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
          elements.push(this.expect(TokenType.IDENTIFIER, "Expected element name").value);
          if (!this.match(TokenType.COMMA)) break;
        }
        this.expect(TokenType.RBRACKET, "Expected ']'");
        const pattern = new AST.ArrayPattern(elements, l);
        const param = new AST.Parameter(null, null, null, l);
        param.destructure = pattern;
        params.push(param);
      } else {
        const name = this.expect(TokenType.IDENTIFIER, "Expected parameter name").value;

        let typeAnnotation = null;
        if (this.match(TokenType.COLON)) {
          typeAnnotation = this.parseTypeAnnotation();
        }

        let defaultValue = null;
        if (this.match(TokenType.ASSIGN)) {
          defaultValue = this.parseExpression();
        }

        params.push(new AST.Parameter(name, typeAnnotation, defaultValue, l));
      }

      if (!this.match(TokenType.COMMA)) break;
    }
    return params;
  }

  parseTypeAnnotation() {
    const l = this.loc();

    // [Type] — array type shorthand
    if (this.match(TokenType.LBRACKET)) {
      const elementType = this.parseTypeAnnotation();
      this.expect(TokenType.RBRACKET, "Expected ']' in array type");
      return new AST.ArrayTypeAnnotation(elementType, l);
    }

    // (Type, Type) — tuple type
    if (this.check(TokenType.LPAREN)) {
      this.advance();
      const types = [];
      while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
        types.push(this.parseTypeAnnotation());
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RPAREN, "Expected ')' in tuple type");
      return new AST.TupleTypeAnnotation(types, l);
    }

    const name = this.expect(TokenType.IDENTIFIER, "Expected type name").value;

    // Generics: Type<A, B>
    let typeParams = [];
    if (this.match(TokenType.LESS)) {
      do {
        typeParams.push(this.parseTypeAnnotation());
      } while (this.match(TokenType.COMMA));
      this.expect(TokenType.GREATER, "Expected '>' to close type parameters");
    }

    return new AST.TypeAnnotation(name, typeParams, l);
  }

  parseTypeDeclaration() {
    const l = this.loc();
    this.expect(TokenType.TYPE);
    const name = this.expect(TokenType.IDENTIFIER, "Expected type name").value;

    // Optional type parameters: Type<T, E>
    let typeParams = [];
    if (this.match(TokenType.LESS)) {
      do {
        typeParams.push(this.expect(TokenType.IDENTIFIER, "Expected type parameter name").value);
      } while (this.match(TokenType.COMMA));
      this.expect(TokenType.GREATER, "Expected '>' to close type parameters");
    }

    // Type alias: type Name = TypeExpr
    if (this.match(TokenType.ASSIGN)) {
      const typeExpr = this.parseTypeAnnotation();
      return new AST.TypeAlias(name, typeExpr, l);
    }

    this.expect(TokenType.LBRACE, "Expected '{' to open type body");

    const variants = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const vl = this.loc();
      const vname = this.expect(TokenType.IDENTIFIER, "Expected variant or field name").value;

      if (this.match(TokenType.LPAREN)) {
        // Variant with fields: Circle(radius: Float)
        const fields = [];
        while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
          const fl = this.loc();
          const fname = this.expect(TokenType.IDENTIFIER, "Expected field name").value;
          let ftype = null;
          if (this.match(TokenType.COLON)) {
            ftype = this.parseTypeAnnotation();
          }
          fields.push(new AST.TypeField(fname, ftype, fl));
          if (!this.match(TokenType.COMMA)) break;
        }
        this.expect(TokenType.RPAREN, "Expected ')' after variant fields");
        variants.push(new AST.TypeVariant(vname, fields, vl));
      } else if (this.match(TokenType.COLON)) {
        // Simple field: name: String
        const ftype = this.parseTypeAnnotation();
        variants.push(new AST.TypeField(vname, ftype, vl));
      } else {
        // Bare variant: None
        variants.push(new AST.TypeVariant(vname, [], vl));
      }

      this.match(TokenType.COMMA);
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close type body");

    // Optional derive clause: type Foo { ... } derive [Eq, Show, JSON]
    const node = new AST.TypeDeclaration(name, typeParams, variants, l);
    if (this.match(TokenType.DERIVE)) {
      this.expect(TokenType.LBRACKET, "Expected '[' after derive");
      node.derive = [];
      while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
        node.derive.push(this.expect(TokenType.IDENTIFIER, "Expected derive trait name").value);
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACKET, "Expected ']' after derive traits");
    }
    return node;
  }

  parseVarDeclaration() {
    const l = this.loc();
    this.expect(TokenType.VAR);

    const targets = [];
    do {
      targets.push(this.expect(TokenType.IDENTIFIER, "Expected variable name").value);
    } while (this.match(TokenType.COMMA));

    this.expect(TokenType.ASSIGN, "Expected '=' in var declaration");

    const values = [this.parseExpression()];
    while (this.match(TokenType.COMMA)) {
      values.push(this.parseExpression());
    }

    return new AST.VarDeclaration(targets, values, l);
  }

  parseLetDestructure() {
    const l = this.loc();
    this.expect(TokenType.LET);

    let pattern;
    if (this.check(TokenType.LBRACE)) {
      pattern = this.parseObjectPattern();
    } else if (this.check(TokenType.LBRACKET)) {
      pattern = this.parseArrayPattern();
    } else if (this.check(TokenType.LPAREN)) {
      // Tuple destructuring: let (a, b) = expr
      pattern = this.parseTuplePattern();
    } else {
      this.error("Expected '{', '[', or '(' after 'let' for destructuring");
    }

    this.expect(TokenType.ASSIGN, "Expected '=' in destructuring");
    const value = this.parseExpression();

    return new AST.LetDestructure(pattern, value, l);
  }

  parseObjectPattern() {
    const l = this.loc();
    this.expect(TokenType.LBRACE);
    const properties = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this.expect(TokenType.IDENTIFIER, "Expected property name").value;
      let valueName = key;
      let defaultValue = null;

      if (this.match(TokenType.COLON)) {
        valueName = this.expect(TokenType.IDENTIFIER, "Expected alias name").value;
      }
      if (this.match(TokenType.ASSIGN)) {
        defaultValue = this.parseExpression();
      }

      properties.push({ key, value: valueName, defaultValue });
      if (!this.match(TokenType.COMMA)) break;
    }

    this.expect(TokenType.RBRACE, "Expected '}' in object pattern");
    return new AST.ObjectPattern(properties, l);
  }

  parseArrayPattern() {
    const l = this.loc();
    this.expect(TokenType.LBRACKET);
    const elements = [];

    while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
      if (this.check(TokenType.IDENTIFIER) && this.current().value === '_') {
        elements.push(null); // skip placeholder
        this.advance();
      } else {
        elements.push(this.expect(TokenType.IDENTIFIER, "Expected variable name in array pattern").value);
      }
      if (!this.match(TokenType.COMMA)) break;
    }

    this.expect(TokenType.RBRACKET, "Expected ']' in array pattern");
    return new AST.ArrayPattern(elements, l);
  }

  parseTuplePattern() {
    const l = this.loc();
    this.expect(TokenType.LPAREN);
    const elements = [];
    while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
      elements.push(this.expect(TokenType.IDENTIFIER, "Expected variable name in tuple pattern").value);
      if (!this.match(TokenType.COMMA)) break;
    }
    this.expect(TokenType.RPAREN, "Expected ')' in tuple pattern");
    return new AST.ArrayPattern(elements, l); // Tuples destructure like arrays (since they compile to arrays)
  }

  parseIfStatement() {
    const l = this.loc();
    this.expect(TokenType.IF);
    const condition = this.parseExpression();
    const consequent = this.parseBlock();

    const alternates = [];
    while (this.check(TokenType.ELIF)) {
      this.advance();
      const elifCond = this.parseExpression();
      const elifBody = this.parseBlock();
      alternates.push({ condition: elifCond, body: elifBody });
    }

    let elseBody = null;
    if (this.match(TokenType.ELSE)) {
      elseBody = this.parseBlock();
    }

    return new AST.IfStatement(condition, consequent, alternates, elseBody, l);
  }

  parseForStatement() {
    const l = this.loc();
    this.expect(TokenType.FOR);

    // For variable(s)
    let variable;
    const firstName = this.expect(TokenType.IDENTIFIER, "Expected loop variable").value;
    if (this.match(TokenType.COMMA)) {
      const secondName = this.expect(TokenType.IDENTIFIER, "Expected second loop variable").value;
      variable = [firstName, secondName];
    } else {
      variable = firstName;
    }

    this.expect(TokenType.IN, "Expected 'in' after for variable");
    const iterable = this.parseExpression();
    const body = this.parseBlock();

    let elseBody = null;
    if (this.match(TokenType.ELSE)) {
      elseBody = this.parseBlock();
    }

    return new AST.ForStatement(variable, iterable, body, elseBody, l);
  }

  parseWhileStatement() {
    const l = this.loc();
    this.expect(TokenType.WHILE);
    const condition = this.parseExpression();
    const body = this.parseBlock();
    return new AST.WhileStatement(condition, body, l);
  }

  parseTryCatch() {
    const l = this.loc();
    this.expect(TokenType.TRY);
    const tryBlock = this.parseBlock();

    let catchParam = null;
    let catchBody = null;
    let finallyBody = null;

    // Parse optional catch block
    if (this.match(TokenType.CATCH)) {
      if (this.check(TokenType.IDENTIFIER)) {
        catchParam = this.advance().value;
      }
      const catchBlock = this.parseBlock();
      catchBody = catchBlock.body;
    }

    // Parse optional finally block
    if (this.match(TokenType.FINALLY)) {
      const finallyBlock = this.parseBlock();
      finallyBody = finallyBlock.body;
    }

    // Must have at least catch or finally
    if (!catchBody && !finallyBody) {
      this.error("Expected 'catch' or 'finally' after try block");
    }

    return new AST.TryCatchStatement(tryBlock.body, catchParam, catchBody, l, finallyBody);
  }

  parseReturnStatement() {
    const l = this.loc();
    this.expect(TokenType.RETURN);

    let value = null;
    if (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      value = this.parseExpression();
    }

    return new AST.ReturnStatement(value, l);
  }

  parseImport() {
    const l = this.loc();
    this.expect(TokenType.IMPORT);

    // import { a, b } from "module"
    if (this.match(TokenType.LBRACE)) {
      const specifiers = [];
      while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
        const imported = this.expect(TokenType.IDENTIFIER, "Expected import name").value;
        let local = imported;
        if (this.match(TokenType.AS)) {
          local = this.expect(TokenType.IDENTIFIER, "Expected alias name").value;
        }
        specifiers.push(new AST.ImportSpecifier(imported, local, this.loc()));
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACE, "Expected '}' in import");
      this.expect(TokenType.FROM, "Expected 'from' in import");
      const source = this.expect(TokenType.STRING, "Expected module path").value;
      return new AST.ImportDeclaration(specifiers, source, l);
    }

    // import Name from "module"
    const name = this.expect(TokenType.IDENTIFIER, "Expected import name").value;
    this.expect(TokenType.FROM, "Expected 'from' in import");
    const source = this.expect(TokenType.STRING, "Expected module path").value;
    return new AST.ImportDefault(name, source, l);
  }

  parseBlock() {
    const l = this.loc();
    this.expect(TokenType.LBRACE, "Expected '{'");
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      body.push(this.parseStatement());
    }
    this.expect(TokenType.RBRACE, "Expected '}'");
    return new AST.BlockStatement(body, l);
  }

  // ─── Expression or Assignment ─────────────────────────────

  parseExpressionOrAssignment() {
    const l = this.loc();
    const expr = this.parseExpression();

    // Multiple assignment: a, b = 1, 2
    if (this.check(TokenType.COMMA) && expr.type === 'Identifier') {
      const targets = [expr.name];
      while (this.match(TokenType.COMMA)) {
        targets.push(this.expect(TokenType.IDENTIFIER, "Expected variable name").value);
      }
      this.expect(TokenType.ASSIGN, "Expected '=' in multiple assignment");
      const values = [this.parseExpression()];
      while (this.match(TokenType.COMMA)) {
        values.push(this.parseExpression());
      }
      return new AST.Assignment(targets, values, l);
    }

    // Simple assignment: x = expr (creates immutable binding)
    if (this.match(TokenType.ASSIGN)) {
      if (expr.type === 'Identifier') {
        const value = this.parseExpression();
        return new AST.Assignment([expr.name], [value], l);
      }
      this.error("Invalid assignment target");
    }

    // Compound assignment: x += expr
    const compoundOp = this.match(TokenType.PLUS_ASSIGN, TokenType.MINUS_ASSIGN, TokenType.STAR_ASSIGN, TokenType.SLASH_ASSIGN);
    if (compoundOp) {
      if (expr.type !== 'Identifier' && expr.type !== 'MemberExpression') {
        this.error("Invalid compound assignment target");
      }
      const value = this.parseExpression();
      return new AST.CompoundAssignment(expr, compoundOp.value, value, l);
    }

    return new AST.ExpressionStatement(expr, l);
  }

  parseMatchAsStatement() {
    const expr = this.parseMatchExpression();
    return new AST.ExpressionStatement(expr, this.loc());
  }

  parseIfExpression() {
    const l = this.loc();
    this.expect(TokenType.IF);
    const condition = this.parseExpression();
    const consequent = this.parseBlock();

    const alternates = [];
    while (this.check(TokenType.ELIF)) {
      this.advance();
      const elifCond = this.parseExpression();
      const elifBody = this.parseBlock();
      alternates.push({ condition: elifCond, body: elifBody });
    }

    if (!this.check(TokenType.ELSE)) {
      this.error("if expression requires an else branch");
    }
    this.advance();
    const elseBody = this.parseBlock();

    return new AST.IfExpression(condition, consequent, alternates, elseBody, l);
  }

  // ─── Expressions (precedence climbing) ────────────────────

  parseExpression() {
    return this.parsePipe();
  }

  parsePipe() {
    let left = this.parseNullCoalesce();
    while (this.match(TokenType.PIPE)) {
      const l = this.loc();
      // Method pipe: |> .method(args) — parse as MemberExpression with empty Identifier
      if (this.check(TokenType.DOT)) {
        this.advance(); // consume .
        const method = this.expect(TokenType.IDENTIFIER, "Expected method name after '.'").value;
        const placeholder = new AST.Identifier('', l);
        const memberExpr = new AST.MemberExpression(placeholder, method, false, l);
        if (this.check(TokenType.LPAREN)) {
          const call = this.parseCallExpression(memberExpr);
          left = new AST.PipeExpression(left, call, l);
        } else {
          left = new AST.PipeExpression(left, memberExpr, l);
        }
      } else {
        const right = this.parseNullCoalesce();
        left = new AST.PipeExpression(left, right, l);
      }
    }
    return left;
  }

  parseNullCoalesce() {
    let left = this.parseOr();
    while (this.match(TokenType.QUESTION_QUESTION)) {
      const l = this.loc();
      const right = this.parseOr();
      left = new AST.BinaryExpression('??', left, right, l);
    }
    return left;
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.match(TokenType.OR_OR) || this.match(TokenType.OR)) {
      const l = this.loc();
      const right = this.parseAnd();
      left = new AST.LogicalExpression('or', left, right, l);
    }
    return left;
  }

  parseAnd() {
    let left = this.parseNot();
    while (this.match(TokenType.AND_AND) || this.match(TokenType.AND)) {
      const l = this.loc();
      const right = this.parseNot();
      left = new AST.LogicalExpression('and', left, right, l);
    }
    return left;
  }

  parseNot() {
    if (this.match(TokenType.NOT) || this.match(TokenType.BANG)) {
      const l = this.loc();
      const operand = this.parseNot();
      return new AST.UnaryExpression('not', operand, true, l);
    }
    return this.parseComparison();
  }

  parseComparison() {
    let left = this.parseMembership();

    // Check for chained comparisons: a < b < c
    const compOps = [TokenType.LESS, TokenType.LESS_EQUAL, TokenType.GREATER, TokenType.GREATER_EQUAL, TokenType.EQUAL, TokenType.NOT_EQUAL];

    if (compOps.some(op => this.check(op))) {
      // Don't parse < as comparison if it looks like JSX
      if (this.check(TokenType.LESS) && this._looksLikeJSX()) {
        return left;
      }
      const operands = [left];
      const operators = [];

      while (true) {
        const op = this.match(...compOps);
        if (!op) break;
        operators.push(op.value);
        operands.push(this.parseMembership());
      }

      if (operators.length === 1) {
        return new AST.BinaryExpression(operators[0], operands[0], operands[1], this.loc());
      }
      return new AST.ChainedComparison(operands, operators, this.loc());
    }

    return left;
  }

  parseMembership() {
    let left = this.parseRange();

    // "in" / "not in"
    if (this.check(TokenType.NOT) && this.peek(1).type === TokenType.IN) {
      const l = this.loc();
      this.advance(); // not
      this.advance(); // in
      const right = this.parseRange();
      return new AST.MembershipExpression(left, right, true, l);
    }

    if (this.check(TokenType.IN)) {
      const l = this.loc();
      this.advance();
      const right = this.parseRange();
      return new AST.MembershipExpression(left, right, false, l);
    }

    return left;
  }

  parseRange() {
    let left = this.parseAddition();

    if (this.match(TokenType.DOT_DOT_EQUAL)) {
      const right = this.parseAddition();
      return new AST.RangeExpression(left, right, true, this.loc());
    }
    if (this.match(TokenType.DOT_DOT)) {
      const right = this.parseAddition();
      return new AST.RangeExpression(left, right, false, this.loc());
    }

    return left;
  }

  parseAddition() {
    let left = this.parseMultiplication();
    while (true) {
      const op = this.match(TokenType.PLUS, TokenType.MINUS);
      if (!op) break;
      const right = this.parseMultiplication();
      left = new AST.BinaryExpression(op.value, left, right, this.loc());
    }
    return left;
  }

  parseMultiplication() {
    let left = this.parsePower();
    while (true) {
      const op = this.match(TokenType.STAR, TokenType.SLASH, TokenType.PERCENT);
      if (!op) break;
      const right = this.parsePower();
      left = new AST.BinaryExpression(op.value, left, right, this.loc());
    }
    return left;
  }

  parsePower() {
    let base = this.parseUnary();
    if (this.match(TokenType.POWER)) {
      const exp = this.parsePower(); // Right-associative
      return new AST.BinaryExpression('**', base, exp, this.loc());
    }
    return base;
  }

  parseUnary() {
    if (this.check(TokenType.AWAIT)) {
      const l = this.loc();
      this.advance();
      const operand = this.parseUnary();
      return new AST.AwaitExpression(operand, l);
    }
    if (this.check(TokenType.YIELD)) {
      const l = this.loc();
      this.advance();
      // yield from expr
      let delegate = false;
      if (this.check(TokenType.FROM)) {
        this.advance();
        delegate = true;
      }
      const operand = this.parseUnary();
      return new AST.YieldExpression(operand, delegate, l);
    }
    if (this.check(TokenType.MINUS)) {
      const l = this.loc();
      this.advance();
      const operand = this.parseUnary();
      return new AST.UnaryExpression('-', operand, true, l);
    }
    if (this.check(TokenType.SPREAD)) {
      const l = this.loc();
      this.advance();
      const operand = this.parseUnary();
      return new AST.SpreadExpression(operand, l);
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match(TokenType.DOT)) {
        const prop = this.expect(TokenType.IDENTIFIER, "Expected property name after '.'").value;
        expr = new AST.MemberExpression(expr, prop, false, this.loc());
        continue;
      }

      if (this.match(TokenType.QUESTION_DOT)) {
        const prop = this.expect(TokenType.IDENTIFIER, "Expected property name after '?.'").value;
        expr = new AST.OptionalChain(expr, prop, false, this.loc());
        continue;
      }

      if (this.check(TokenType.LBRACKET)) {
        // Don't treat [ as subscript if it's on a new line (avoids ambiguity with array patterns in match)
        const prevLine = this.pos > 0 ? this.tokens[this.pos - 1].line : 0;
        const curLine = this.current().line;
        if (curLine > prevLine) break;
        expr = this.parseSubscript(expr);
        continue;
      }

      if (this.check(TokenType.LPAREN)) {
        expr = this.parseCallExpression(expr);
        continue;
      }

      if (this.check(TokenType.QUESTION)) {
        const prevLine = this.pos > 0 ? this.tokens[this.pos - 1].line : 0;
        const curLine = this.current().line;
        if (curLine === prevLine) {
          this.advance();
          expr = new AST.PropagateExpression(expr, this.loc());
          continue;
        }
      }

      break;
    }

    return expr;
  }

  parseSubscript(object) {
    const l = this.loc();
    this.expect(TokenType.LBRACKET);

    // Handle [::step] — DOUBLE_COLON is lexed as one token
    if (this.check(TokenType.DOUBLE_COLON)) {
      this.advance();
      let step = null;
      if (!this.check(TokenType.RBRACKET)) {
        step = this.parseExpression();
      }
      this.expect(TokenType.RBRACKET, "Expected ']'");
      return new AST.SliceExpression(object, null, null, step, l);
    }

    // Check for slice: obj[start:end:step]
    if (this.check(TokenType.COLON)) {
      // [:end] or [:end:step]
      this.advance();
      let end = null;
      let step = null;
      if (!this.check(TokenType.COLON) && !this.check(TokenType.DOUBLE_COLON) && !this.check(TokenType.RBRACKET)) {
        end = this.parseExpression();
      }
      if (this.match(TokenType.COLON)) {
        step = this.parseExpression();
      }
      this.expect(TokenType.RBRACKET, "Expected ']'");
      return new AST.SliceExpression(object, null, end, step, l);
    }

    const start = this.parseExpression();

    // Handle [start::step] — DOUBLE_COLON after start expression
    if (this.check(TokenType.DOUBLE_COLON)) {
      this.advance();
      let step = null;
      if (!this.check(TokenType.RBRACKET)) {
        step = this.parseExpression();
      }
      this.expect(TokenType.RBRACKET, "Expected ']'");
      return new AST.SliceExpression(object, start, null, step, l);
    }

    if (this.match(TokenType.COLON)) {
      // [start:end] or [start:end:step]
      let end = null;
      let step = null;
      if (!this.check(TokenType.COLON) && !this.check(TokenType.DOUBLE_COLON) && !this.check(TokenType.RBRACKET)) {
        end = this.parseExpression();
      }
      if (this.match(TokenType.COLON)) {
        step = this.parseExpression();
      }
      this.expect(TokenType.RBRACKET, "Expected ']'");
      return new AST.SliceExpression(object, start, end, step, l);
    }

    this.expect(TokenType.RBRACKET, "Expected ']'");
    return new AST.MemberExpression(object, start, true, l);
  }

  parseCallExpression(callee) {
    const l = this.loc();
    this.expect(TokenType.LPAREN);
    const args = [];

    while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
      // Check for named argument: name: value
      if (this.check(TokenType.IDENTIFIER) && this.peek(1).type === TokenType.COLON) {
        const name = this.advance().value;
        this.advance(); // :
        const value = this.parseExpression();
        args.push(new AST.NamedArgument(name, value, this.loc()));
      } else {
        args.push(this.parseExpression());
      }
      if (!this.match(TokenType.COMMA)) break;
    }

    this.expect(TokenType.RPAREN, "Expected ')' after arguments");
    return new AST.CallExpression(callee, args, l);
  }

  // ─── Primary expressions ──────────────────────────────────

  parsePrimary() {
    const l = this.loc();

    // Number
    if (this.check(TokenType.NUMBER)) {
      return new AST.NumberLiteral(this.advance().value, l);
    }

    // String
    if (this.check(TokenType.STRING) || this.check(TokenType.STRING_TEMPLATE)) {
      return this.parseStringLiteral();
    }

    // Regex literal
    if (this.check(TokenType.REGEX)) {
      const token = this.advance();
      return new AST.RegexLiteral(token.value.pattern, token.value.flags, l);
    }

    // Boolean
    if (this.check(TokenType.TRUE)) {
      this.advance();
      return new AST.BooleanLiteral(true, l);
    }
    if (this.check(TokenType.FALSE)) {
      this.advance();
      return new AST.BooleanLiteral(false, l);
    }

    // Nil
    if (this.check(TokenType.NIL)) {
      this.advance();
      return new AST.NilLiteral(l);
    }

    // Match expression
    if (this.check(TokenType.MATCH)) {
      return this.parseMatchExpression();
    }

    // If expression (in expression position): if cond { a } else { b }
    if (this.check(TokenType.IF)) {
      return this.parseIfExpression();
    }

    // Async lambda: async fn(params) body
    if (this.check(TokenType.ASYNC) && this.peek(1).type === TokenType.FN) {
      return this.parseAsyncLambda();
    }

    // Lambda: fn(params) body  or  params => body
    if (this.check(TokenType.FN) && this.peek(1).type === TokenType.LPAREN) {
      return this.parseLambda();
    }

    // Arrow lambda: x => expr  or  (x, y) => expr
    // We'll handle this in the identifier/paren case

    // Array literal or list comprehension
    if (this.check(TokenType.LBRACKET)) {
      return this.parseArrayOrComprehension();
    }

    // Object literal or dict comprehension
    if (this.check(TokenType.LBRACE)) {
      return this.parseObjectOrDictComprehension();
    }

    // Parenthesized expression or arrow lambda
    if (this.check(TokenType.LPAREN)) {
      return this.parseParenOrArrowLambda();
    }

    // server/client/shared as identifiers in expression position (for RPC: server.get_users())
    if (this.check(TokenType.SERVER) || this.check(TokenType.CLIENT) || this.check(TokenType.SHARED)) {
      const name = this.advance().value;
      return new AST.Identifier(name, l);
    }

    // Identifier (or arrow lambda: x => expr)
    if (this.check(TokenType.IDENTIFIER)) {
      const name = this.advance().value;
      // Check for arrow lambda: x => expr
      if (this.check(TokenType.ARROW)) {
        this.advance();
        const body = this.parseExpression();
        return new AST.LambdaExpression(
          [new AST.Parameter(name, null, null, l)],
          body,
          l
        );
      }
      return new AST.Identifier(name, l);
    }

    this.error(`Unexpected token: ${this.current().type}`);
  }

  parseStringLiteral() {
    const l = this.loc();
    const tok = this.advance();

    if (tok.type === TokenType.STRING) {
      return new AST.StringLiteral(tok.value, l);
    }

    // String template with interpolation
    const parts = tok.value.map(part => {
      if (part.type === 'text') {
        return { type: 'text', value: part.value };
      }
      // Re-parse the expression tokens
      const subParser = new Parser(
        [...part.tokens, { type: TokenType.EOF, value: null, line: 0, column: 0 }],
        this.filename
      );
      const expr = subParser.parseExpression();
      return { type: 'expr', value: expr };
    });

    return new AST.TemplateLiteral(parts, l);
  }

  parseLambda() {
    const l = this.loc();
    this.expect(TokenType.FN);
    this.expect(TokenType.LPAREN);
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN);

    let body;
    if (this.check(TokenType.LBRACE)) {
      body = this.parseBlock();
    } else {
      // Parse expression, then check for compound/simple assignment
      const expr = this.parseExpression();
      const compoundOp = this.match(TokenType.PLUS_ASSIGN, TokenType.MINUS_ASSIGN, TokenType.STAR_ASSIGN, TokenType.SLASH_ASSIGN);
      if (compoundOp) {
        const value = this.parseExpression();
        body = new AST.CompoundAssignment(expr, compoundOp.value, value, l);
      } else if (this.match(TokenType.ASSIGN)) {
        if (expr.type === 'Identifier') {
          const value = this.parseExpression();
          body = new AST.Assignment([expr.name], [value], l);
        } else {
          body = expr;
        }
      } else {
        body = expr;
      }
    }

    return new AST.LambdaExpression(params, body, l);
  }

  parseAsyncLambda() {
    const l = this.loc();
    this.expect(TokenType.ASYNC);
    this.expect(TokenType.FN);
    this.expect(TokenType.LPAREN);
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN);

    let body;
    if (this.check(TokenType.LBRACE)) {
      body = this.parseBlock();
    } else {
      body = this.parseExpression();
    }

    return new AST.LambdaExpression(params, body, l, true);
  }

  parseMatchExpression() {
    const l = this.loc();
    this.expect(TokenType.MATCH);
    const subject = this.parseExpression();
    this.expect(TokenType.LBRACE, "Expected '{' to open match body");

    const arms = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      arms.push(this.parseMatchArm());
      this.match(TokenType.COMMA); // Optional comma between arms
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close match body");
    return new AST.MatchExpression(subject, arms, l);
  }

  parseMatchArm() {
    const l = this.loc();
    const pattern = this.parsePattern();

    let guard = null;
    if (this.match(TokenType.IF)) {
      guard = this.parseExpression();
    }

    this.expect(TokenType.ARROW, "Expected '=>' in match arm");

    let body;
    if (this.check(TokenType.LBRACE)) {
      body = this.parseBlock();
    } else {
      body = this.parseExpression();
    }

    return new AST.MatchArm(pattern, guard, body, l);
  }

  parsePattern() {
    const l = this.loc();

    // Wildcard _
    if (this.checkValue(TokenType.IDENTIFIER, '_')) {
      this.advance();
      return new AST.WildcardPattern(l);
    }

    // Number literal pattern
    if (this.check(TokenType.NUMBER)) {
      const val = this.advance().value;
      // Check for range pattern: 1..10
      if (this.match(TokenType.DOT_DOT_EQUAL)) {
        const end = this.expect(TokenType.NUMBER, "Expected number in range pattern").value;
        return new AST.RangePattern(val, end, true, l);
      }
      if (this.match(TokenType.DOT_DOT)) {
        const end = this.expect(TokenType.NUMBER, "Expected number in range pattern").value;
        return new AST.RangePattern(val, end, false, l);
      }
      return new AST.LiteralPattern(val, l);
    }

    // String literal pattern, possibly with ++ concat pattern
    if (this.check(TokenType.STRING)) {
      const strVal = this.advance().value;
      // Check for string concat pattern: "prefix" ++ rest
      if (this.check(TokenType.PLUS) && this.peek(1).type === TokenType.PLUS) {
        this.advance(); // first +
        this.advance(); // second +
        const rest = this.parsePattern();
        return new AST.StringConcatPattern(strVal, rest, l);
      }
      return new AST.LiteralPattern(strVal, l);
    }

    // Boolean literal pattern
    if (this.check(TokenType.TRUE)) {
      this.advance();
      return new AST.LiteralPattern(true, l);
    }
    if (this.check(TokenType.FALSE)) {
      this.advance();
      return new AST.LiteralPattern(false, l);
    }

    // Nil pattern
    if (this.check(TokenType.NIL)) {
      this.advance();
      return new AST.LiteralPattern(null, l);
    }

    // Array pattern: [a, b, c] or [0, _]
    if (this.check(TokenType.LBRACKET)) {
      this.advance();
      const elements = [];
      while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
        elements.push(this.parsePattern());
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACKET);
      return new AST.ArrayPattern(elements, l);
    }

    // Tuple pattern: (a, b)
    if (this.check(TokenType.LPAREN)) {
      this.advance();
      const elements = [];
      while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
        elements.push(this.parsePattern());
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RPAREN, "Expected ')' in tuple pattern");
      return new AST.TuplePattern(elements, l);
    }

    // Identifier: could be variant pattern or binding pattern
    if (this.check(TokenType.IDENTIFIER)) {
      const name = this.advance().value;

      // Variant pattern: Circle(r)
      if (this.match(TokenType.LPAREN)) {
        const fields = [];
        while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
          fields.push(this.expect(TokenType.IDENTIFIER, "Expected field name").value);
          if (!this.match(TokenType.COMMA)) break;
        }
        this.expect(TokenType.RPAREN);
        return new AST.VariantPattern(name, fields, l);
      }

      // Binding pattern (lowercase = binding, uppercase = variant without args)
      if (name[0] === name[0].toUpperCase() && name[0] !== '_') {
        return new AST.VariantPattern(name, [], l);
      }
      return new AST.BindingPattern(name, l);
    }

    this.error("Expected pattern");
  }

  parseArrayOrComprehension() {
    const l = this.loc();
    this.expect(TokenType.LBRACKET);

    if (this.check(TokenType.RBRACKET)) {
      this.advance();
      return new AST.ArrayLiteral([], l);
    }

    // Parse first expression
    const first = this.parseExpression();

    // Check if this is a list comprehension: [expr for x in items]
    if (this.check(TokenType.FOR)) {
      this.advance();
      const variable = this.expect(TokenType.IDENTIFIER, "Expected variable in comprehension").value;
      this.expect(TokenType.IN, "Expected 'in' in comprehension");
      const iterable = this.parseExpression();

      let condition = null;
      if (this.match(TokenType.IF)) {
        condition = this.parseExpression();
      }

      this.expect(TokenType.RBRACKET, "Expected ']' to close comprehension");
      return new AST.ListComprehension(first, variable, iterable, condition, l);
    }

    // Regular array literal
    const elements = [first];
    while (this.match(TokenType.COMMA)) {
      if (this.check(TokenType.RBRACKET)) break; // trailing comma
      elements.push(this.parseExpression());
    }

    this.expect(TokenType.RBRACKET, "Expected ']'");
    return new AST.ArrayLiteral(elements, l);
  }

  parseObjectOrDictComprehension() {
    const l = this.loc();
    this.expect(TokenType.LBRACE);

    if (this.check(TokenType.RBRACE)) {
      this.advance();
      return new AST.ObjectLiteral([], l);
    }

    // Try to parse first key: value pair
    const firstKey = this.parseExpression();

    if (this.match(TokenType.COLON)) {
      const firstValue = this.parseExpression();

      // Dict comprehension: {k: v for k, v in pairs}
      if (this.check(TokenType.FOR)) {
        this.advance();
        const vars = [];
        vars.push(this.expect(TokenType.IDENTIFIER, "Expected variable").value);
        if (this.match(TokenType.COMMA)) {
          vars.push(this.expect(TokenType.IDENTIFIER, "Expected variable").value);
        }
        this.expect(TokenType.IN, "Expected 'in' in comprehension");
        const iterable = this.parseExpression();
        let condition = null;
        if (this.match(TokenType.IF)) {
          condition = this.parseExpression();
        }
        this.expect(TokenType.RBRACE, "Expected '}' to close dict comprehension");
        return new AST.DictComprehension(firstKey, firstValue, vars, iterable, condition, l);
      }

      // Regular object literal
      const properties = [{ key: firstKey, value: firstValue, shorthand: false }];
      while (this.match(TokenType.COMMA)) {
        if (this.check(TokenType.RBRACE)) break;
        const key = this.parseExpression();
        this.expect(TokenType.COLON, "Expected ':' in object literal");
        const value = this.parseExpression();
        properties.push({ key, value, shorthand: false });
      }

      this.expect(TokenType.RBRACE, "Expected '}'");
      return new AST.ObjectLiteral(properties, l);
    }

    // Shorthand object: { x, y } — but this might conflict with blocks
    // For now, treat as shorthand object if firstKey is an identifier
    if (firstKey.type === 'Identifier') {
      const properties = [{ key: firstKey, value: firstKey, shorthand: true }];
      while (this.match(TokenType.COMMA)) {
        if (this.check(TokenType.RBRACE)) break;
        const key = this.parseExpression();
        properties.push({ key, value: key, shorthand: true });
      }
      this.expect(TokenType.RBRACE, "Expected '}'");
      return new AST.ObjectLiteral(properties, l);
    }

    this.error("Invalid object literal");
  }

  parseParenOrArrowLambda() {
    const l = this.loc();

    // Save position to backtrack if needed
    const savedPos = this.pos;

    this.expect(TokenType.LPAREN);

    // Empty parens: () => expr
    if (this.check(TokenType.RPAREN)) {
      this.advance();
      if (this.check(TokenType.ARROW)) {
        this.advance();
        const body = this.parseExpression();
        return new AST.LambdaExpression([], body, l);
      }
      // Empty parens but not arrow — error or unit value
      this.error("Unexpected '()'");
    }

    // Try to parse as arrow lambda params
    // Look ahead: if we see ) => then it's a lambda
    const params = [];
    let isLambda = true;

    try {
      const innerSaved = this.pos;
      while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
        if (!this.check(TokenType.IDENTIFIER)) {
          isLambda = false;
          break;
        }
        const pname = this.advance().value;
        let ptype = null;
        let pdefault = null;
        if (this.match(TokenType.COLON)) {
          // Could be a type annotation or named argument
          if (this.check(TokenType.IDENTIFIER)) {
            ptype = this.parseTypeAnnotation();
          } else {
            isLambda = false;
            break;
          }
        }
        if (this.match(TokenType.ASSIGN)) {
          pdefault = this.parseExpression();
        }
        params.push(new AST.Parameter(pname, ptype, pdefault, l));
        if (!this.match(TokenType.COMMA)) break;
      }

      if (isLambda && this.check(TokenType.RPAREN)) {
        this.advance(); // )
        if (this.check(TokenType.ARROW)) {
          this.advance(); // =>
          const body = this.check(TokenType.LBRACE) ? this.parseBlock() : this.parseExpression();
          return new AST.LambdaExpression(params, body, l);
        }
      }
    } catch (e) {
      // Not a lambda, backtrack
    }

    // Backtrack and parse as parenthesized expression or tuple
    this.pos = savedPos;
    this.expect(TokenType.LPAREN);
    const expr = this.parseExpression();

    // Tuple: (a, b, c) — requires at least one comma
    if (this.check(TokenType.COMMA)) {
      const elements = [expr];
      while (this.match(TokenType.COMMA)) {
        if (this.check(TokenType.RPAREN)) break; // trailing comma
        elements.push(this.parseExpression());
      }
      this.expect(TokenType.RPAREN, "Expected ')'");
      return new AST.TupleExpression(elements, l);
    }

    this.expect(TokenType.RPAREN, "Expected ')'");
    return expr;
  }
}
