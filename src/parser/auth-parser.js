// Auth-specific parser methods for the Tova language
// Extracted from parser.js for lazy loading — only loaded when auth { } blocks are encountered.

import { TokenType } from '../lexer/tokens.js';
import * as AST from './ast.js';
import { AuthConfigField, AuthProviderDeclaration, AuthHookDeclaration, AuthProtectedRoute } from './auth-ast.js';

const AUTH_CONFIG_KEY_TOKENS = new Set([
  TokenType.IDENTIFIER, TokenType.TYPE, TokenType.STORE,
  TokenType.FN, TokenType.MATCH, TokenType.IF,
]);

export function installAuthParser(ParserClass) {
  if (ParserClass.prototype._authParserInstalled) return;
  ParserClass.prototype._authParserInstalled = true;

  ParserClass.prototype._expectAuthConfigKey = function(context) {
    if (AUTH_CONFIG_KEY_TOKENS.has(this.current().type)) {
      return this.advance().value;
    }
    this.error(`Expected ${context} config key`);
  };

  ParserClass.prototype.parseAuthBlock = function() {
    const l = this.loc();
    this.advance(); // consume 'auth'
    this.expect(TokenType.LBRACE, "Expected '{' after 'auth'");
    const body = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      try {
        const stmt = this._parseAuthStatement();
        if (stmt) body.push(stmt);
      } catch (e) {
        this.errors.push(e);
        this._synchronizeBlock();
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close auth block");
    return new AST.AuthBlock(body, l);
  };

  ParserClass.prototype._parseAuthStatement = function() {
    if (!this.check(TokenType.IDENTIFIER)) {
      this.error("Expected auth declaration (provider, on, protected_route, or config field)");
    }

    const val = this.current().value;

    if (val === 'provider' && this.peek(1).type === TokenType.IDENTIFIER) {
      return this._parseAuthProvider();
    }

    if (val === 'on' && this.peek(1).type === TokenType.IDENTIFIER) {
      return this._parseAuthHook();
    }

    if (val === 'protected_route' && this.peek(1).type === TokenType.STRING) {
      return this._parseAuthProtectedRoute();
    }

    if (this.peek(1).type === TokenType.COLON) {
      return this._parseAuthConfigField();
    }

    this.error("Expected provider, on, protected_route, or config field in auth block");
  };

  ParserClass.prototype._parseAuthProvider = function() {
    const l = this.loc();
    this.advance(); // consume 'provider'
    const providerType = this.expect(TokenType.IDENTIFIER, "Expected provider type").value;

    let name = null;
    if (providerType === 'custom' && this.check(TokenType.STRING)) {
      name = this.advance().value;
    }

    const config = {};
    this.expect(TokenType.LBRACE, "Expected '{' after provider type");
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this._expectAuthConfigKey("provider");
      this.expect(TokenType.COLON, "Expected ':' after provider config key");
      config[key] = this.parseExpression();
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close provider config");

    return new AuthProviderDeclaration(providerType, name, config, l);
  };

  ParserClass.prototype._parseAuthHook = function() {
    const l = this.loc();
    this.advance(); // consume 'on'
    const event = this.expect(TokenType.IDENTIFIER, "Expected hook event").value;

    // parseLambda() handles fn(params) { body }
    const handler = this.parseLambda();

    return new AuthHookDeclaration(event, handler, l);
  };

  ParserClass.prototype._parseAuthProtectedRoute = function() {
    const l = this.loc();
    this.advance(); // consume 'protected_route'
    const pattern = this.expect(TokenType.STRING, "Expected route pattern string").value;
    this.expect(TokenType.LBRACE, "Expected '{' after route pattern");

    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this._expectAuthConfigKey("protected_route");
      this.expect(TokenType.COLON, "Expected ':' after protected_route config key");
      config[key] = this.parseExpression();
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close protected_route config");

    return new AuthProtectedRoute(pattern, config, l);
  };

  ParserClass.prototype._parseAuthConfigField = function() {
    const l = this.loc();
    const key = this.advance().value;
    this.expect(TokenType.COLON, "Expected ':' after config key");
    const value = this.parseExpression();
    return new AuthConfigField(key, value, l);
  };
}
