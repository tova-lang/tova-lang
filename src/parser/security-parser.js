// Security-specific parser methods for the Tova language
// Extracted from parser.js for lazy loading — only loaded when security { } blocks are encountered.

import { TokenType } from '../lexer/tokens.js';
import * as AST from './ast.js';

// Keywords that may appear as config keys inside security blocks
const CONFIG_KEY_TOKENS = new Set([
  TokenType.IDENTIFIER, TokenType.TYPE, TokenType.STORE,
  TokenType.FN, TokenType.MATCH, TokenType.IF,
]);

export function installSecurityParser(ParserClass) {
  if (ParserClass.prototype._securityParserInstalled) return;
  ParserClass.prototype._securityParserInstalled = true;

  // Helper: read a config key (identifier or keyword that acts as identifier)
  ParserClass.prototype._expectSecurityConfigKey = function(context) {
    if (CONFIG_KEY_TOKENS.has(this.current().type)) {
      return this.advance().value;
    }
    this.error(`Expected ${context} config key`);
  };

  ParserClass.prototype.parseSecurityBlock = function() {
    const l = this.loc();
    this.advance(); // consume 'security'
    this.expect(TokenType.LBRACE, "Expected '{' after 'security'");
    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      try {
        const stmt = this.parseSecurityStatement();
        if (stmt) body.push(stmt);
      } catch (e) {
        this.errors.push(e);
        this._synchronizeBlock();
      }
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close security block");
    return new AST.SecurityBlock(body, l);
  };

  ParserClass.prototype.parseSecurityStatement = function() {
    if (this.check(TokenType.IDENTIFIER)) {
      const val = this.current().value;

      if (val === 'auth' && (this.peek(1).type === TokenType.IDENTIFIER || this.peek(1).type === TokenType.LBRACE)) {
        return this.parseSecurityAuth();
      }
      if (val === 'role' && this.peek(1).type === TokenType.IDENTIFIER) {
        return this.parseSecurityRole();
      }
      if (val === 'protect' && this.peek(1).type === TokenType.STRING) {
        return this.parseSecurityProtect();
      }
      if (val === 'sensitive' && this.peek(1).type === TokenType.IDENTIFIER) {
        return this.parseSecuritySensitive();
      }
      if (val === 'cors' && this.peek(1).type === TokenType.LBRACE) {
        return this.parseSecurityCors();
      }
      if (val === 'csp' && this.peek(1).type === TokenType.LBRACE) {
        return this.parseSecurityCsp();
      }
      if (val === 'rate_limit' && this.peek(1).type === TokenType.LBRACE) {
        return this.parseSecurityRateLimit();
      }
      if (val === 'csrf' && this.peek(1).type === TokenType.LBRACE) {
        return this.parseSecurityCsrf();
      }
      if (val === 'audit' && this.peek(1).type === TokenType.LBRACE) {
        return this.parseSecurityAudit();
      }
      if (val === 'trust_proxy') {
        return this.parseSecurityTrustProxy();
      }
      if (val === 'hsts' && this.peek(1).type === TokenType.LBRACE) {
        return this.parseSecurityHsts();
      }
    }

    this.error("Expected security declaration (auth, role, protect, sensitive, cors, csp, rate_limit, csrf, audit, trust_proxy, hsts)");
  };

  // auth jwt { secret: ..., expires: ... }
  ParserClass.prototype.parseSecurityAuth = function() {
    const l = this.loc();
    this.advance(); // consume 'auth'
    let authType = 'jwt';
    if (this.check(TokenType.IDENTIFIER)) {
      authType = this.advance().value;
    }
    this.expect(TokenType.LBRACE, "Expected '{' after auth type");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this._expectSecurityConfigKey("auth");
      this.expect(TokenType.COLON, "Expected ':' after auth key");
      const value = this.parseExpression();
      config[key] = value;
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close auth config");
    return new AST.SecurityAuthDeclaration(authType, config, l);
  };

  // role Admin { can: [manage_users, view_analytics] }
  ParserClass.prototype.parseSecurityRole = function() {
    const l = this.loc();
    this.advance(); // consume 'role'
    const name = this.expect(TokenType.IDENTIFIER, "Expected role name").value;
    this.expect(TokenType.LBRACE, "Expected '{' after role name");
    const permissions = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this._expectSecurityConfigKey("role");
      this.expect(TokenType.COLON, "Expected ':' after role key");
      if (key === 'can') {
        // Parse array of identifiers: [manage_users, view_analytics]
        this.expect(TokenType.LBRACKET, "Expected '[' for permissions list");
        while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
          const perm = this.expect(TokenType.IDENTIFIER, "Expected permission name").value;
          permissions.push(perm);
          this.match(TokenType.COMMA);
        }
        this.expect(TokenType.RBRACKET, "Expected ']' to close permissions list");
      } else {
        // Skip unknown keys
        this.parseExpression();
      }
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close role definition");
    return new AST.SecurityRoleDeclaration(name, permissions, l);
  };

  // protect "/api/admin/*" { require: Admin, rate_limit: { max: 100, window: 60 } }
  ParserClass.prototype.parseSecurityProtect = function() {
    const l = this.loc();
    this.advance(); // consume 'protect'
    const pattern = this.expect(TokenType.STRING, "Expected route pattern string").value;
    this.expect(TokenType.LBRACE, "Expected '{' after protect pattern");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this._expectSecurityConfigKey("protect");
      this.expect(TokenType.COLON, "Expected ':' after protect key");
      if (key === 'rate_limit') {
        // Nested config: { max: 100, window: 60 }
        this.expect(TokenType.LBRACE, "Expected '{' for rate_limit config");
        const rlConfig = {};
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
          const rlKey = this._expectSecurityConfigKey("rate_limit");
          this.expect(TokenType.COLON, "Expected ':' after rate_limit key");
          rlConfig[rlKey] = this.parseExpression();
          this.match(TokenType.COMMA);
        }
        this.expect(TokenType.RBRACE, "Expected '}' to close rate_limit config");
        config[key] = rlConfig;
      } else {
        config[key] = this.parseExpression();
      }
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close protect config");
    return new AST.SecurityProtectDeclaration(pattern, config, l);
  };

  // sensitive User.password { hash: "bcrypt", never_expose: true }
  ParserClass.prototype.parseSecuritySensitive = function() {
    const l = this.loc();
    this.advance(); // consume 'sensitive'
    const typeName = this.expect(TokenType.IDENTIFIER, "Expected type name").value;
    this.expect(TokenType.DOT, "Expected '.' after type name in sensitive declaration");
    const fieldName = this.expect(TokenType.IDENTIFIER, "Expected field name").value;
    this.expect(TokenType.LBRACE, "Expected '{' after sensitive field");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this._expectSecurityConfigKey("sensitive");
      this.expect(TokenType.COLON, "Expected ':' after sensitive key");
      config[key] = this.parseExpression();
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close sensitive config");
    return new AST.SecuritySensitiveDeclaration(typeName, fieldName, config, l);
  };

  // cors { origins: ["..."], methods: [GET, POST], credentials: true }
  ParserClass.prototype.parseSecurityCors = function() {
    const l = this.loc();
    this.advance(); // consume 'cors'
    this.expect(TokenType.LBRACE, "Expected '{' after 'cors'");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this._expectSecurityConfigKey("cors");
      this.expect(TokenType.COLON, "Expected ':' after cors key");
      config[key] = this.parseExpression();
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close cors config");
    return new AST.SecurityCorsDeclaration(config, l);
  };

  // csp { default_src: ["self"], script_src: ["self"] }
  ParserClass.prototype.parseSecurityCsp = function() {
    const l = this.loc();
    this.advance(); // consume 'csp'
    this.expect(TokenType.LBRACE, "Expected '{' after 'csp'");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this._expectSecurityConfigKey("csp");
      this.expect(TokenType.COLON, "Expected ':' after csp key");
      config[key] = this.parseExpression();
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close csp config");
    return new AST.SecurityCspDeclaration(config, l);
  };

  // rate_limit { max: 1000, window: 3600 }
  ParserClass.prototype.parseSecurityRateLimit = function() {
    const l = this.loc();
    this.advance(); // consume 'rate_limit'
    this.expect(TokenType.LBRACE, "Expected '{' after 'rate_limit'");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this._expectSecurityConfigKey("rate_limit");
      this.expect(TokenType.COLON, "Expected ':' after rate_limit key");
      config[key] = this.parseExpression();
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close rate_limit config");
    return new AST.SecurityRateLimitDeclaration(config, l);
  };

  // csrf { enabled: true, exempt: ["/api/webhooks/*"] }
  ParserClass.prototype.parseSecurityCsrf = function() {
    const l = this.loc();
    this.advance(); // consume 'csrf'
    this.expect(TokenType.LBRACE, "Expected '{' after 'csrf'");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this._expectSecurityConfigKey("csrf");
      this.expect(TokenType.COLON, "Expected ':' after csrf key");
      config[key] = this.parseExpression();
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close csrf config");
    return new AST.SecurityCsrfDeclaration(config, l);
  };

  // trust_proxy true | trust_proxy false | trust_proxy "loopback"
  ParserClass.prototype.parseSecurityTrustProxy = function() {
    const l = this.loc();
    this.advance(); // consume 'trust_proxy'
    // Expect a value: true, false, or "loopback"
    const valueToken = this.advance();
    let value = false;
    if (valueToken.type === TokenType.STRING) {
      value = valueToken.value;
    } else if (valueToken.value === 'true') {
      value = true;
    } else if (valueToken.value === 'false') {
      value = false;
    } else {
      this.error('Expected true, false, or string for trust_proxy');
    }
    return new AST.SecurityTrustProxyDeclaration(value, l);
  };

  // hsts { max_age: 31536000, include_subdomains: true, preload: false }
  ParserClass.prototype.parseSecurityHsts = function() {
    const l = this.loc();
    this.advance(); // consume 'hsts'
    this.expect(TokenType.LBRACE, "Expected '{' after 'hsts'");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this._expectSecurityConfigKey("hsts");
      this.expect(TokenType.COLON, "Expected ':' after hsts key");
      config[key] = this.parseExpression();
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close hsts config");
    return new AST.SecurityHstsDeclaration(config, l);
  };

  // audit { events: [login, logout], store: "audit_log", retain: 90 }
  ParserClass.prototype.parseSecurityAudit = function() {
    const l = this.loc();
    this.advance(); // consume 'audit'
    this.expect(TokenType.LBRACE, "Expected '{' after 'audit'");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this._expectSecurityConfigKey("audit");
      this.expect(TokenType.COLON, "Expected ':' after audit key");
      config[key] = this.parseExpression();
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close audit config");
    return new AST.SecurityAuditDeclaration(config, l);
  };
}
