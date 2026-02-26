// Edge/serverless-specific parser methods for the Tova language
// Extracted from parser.js for lazy loading — only loaded when edge { } blocks are encountered.

import { TokenType } from '../lexer/tokens.js';
import * as AST from './ast.js';
import { installServerParser } from './server-parser.js';
import {
  EdgeConfigField, EdgeKVDeclaration, EdgeSQLDeclaration,
  EdgeStorageDeclaration, EdgeQueueDeclaration, EdgeEnvDeclaration,
  EdgeSecretDeclaration, EdgeScheduleDeclaration, EdgeConsumeDeclaration,
} from './edge-ast.js';

// Valid config keys inside edge blocks
const EDGE_CONFIG_KEYS = new Set(['target']);

// Valid edge targets
const EDGE_TARGETS = new Set(['cloudflare', 'deno', 'vercel', 'lambda', 'bun']);

// Edge binding keywords (contextual identifiers)
const EDGE_BINDING_KEYWORDS = new Set(['kv', 'sql', 'storage', 'queue', 'env', 'secret']);

export function installEdgeParser(ParserClass) {
  if (ParserClass.prototype._edgeParserInstalled) return;
  ParserClass.prototype._edgeParserInstalled = true;

  // Edge reuses parseRoute() and parseMiddleware() from the server parser
  installServerParser(ParserClass);

  ParserClass.prototype.parseEdgeBlock = function() {
    const l = this.loc();
    this.advance(); // consume 'edge'

    // Optional name: edge "api" { }
    let name = null;
    if (this.check(TokenType.STRING)) {
      name = this.advance().value;
    }

    this.expect(TokenType.LBRACE, "Expected '{' after 'edge'");
    const body = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      try {
        const stmt = this.parseEdgeStatement();
        if (stmt) body.push(stmt);
      } catch (e) {
        this.errors.push(e);
        this._synchronizeBlock();
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close edge block");
    return new AST.EdgeBlock(body, l, name);
  };

  ParserClass.prototype.parseEdgeStatement = function() {
    // route keyword → reuse server route parser
    if (this.check(TokenType.ROUTE)) {
      // Ensure server parser is installed (for parseRoute)
      return this.parseRoute();
    }

    // Contextual keywords in edge blocks
    if (this.check(TokenType.IDENTIFIER)) {
      const val = this.current().value;

      // middleware fn name(req, next) { ... }
      if (val === 'middleware' && this.peek(1).type === TokenType.FN) {
        return this.parseMiddleware();
      }

      // kv BINDING_NAME or kv BINDING_NAME { config }
      if (val === 'kv') {
        return this.parseEdgeKV();
      }

      // sql BINDING_NAME
      if (val === 'sql') {
        return this.parseEdgeSQL();
      }

      // storage BINDING_NAME
      if (val === 'storage') {
        return this.parseEdgeStorage();
      }

      // queue BINDING_NAME
      if (val === 'queue') {
        return this.parseEdgeQueue();
      }

      // env VAR_NAME = default_value
      if (val === 'env') {
        return this.parseEdgeEnv();
      }

      // secret SECRET_NAME
      if (val === 'secret') {
        return this.parseEdgeSecret();
      }

      // schedule "name" cron("...") { body }
      if (val === 'schedule') {
        return this.parseEdgeSchedule();
      }

      // consume QUEUE_NAME fn(messages) { body }
      if (val === 'consume') {
        return this.parseEdgeConsume();
      }

      // health "/path"
      if (val === 'health') {
        return this.parseHealthCheck();
      }

      // cors { ... }
      if (val === 'cors') {
        return this.parseCorsConfig();
      }

      // on_error fn(err, req) { ... }
      if (val === 'on_error') {
        return this.parseErrorHandler();
      }

      // Config field: identifier: value (e.g., target: "cloudflare")
      // Accept any identifier + colon pattern; analyzer validates the key
      if (this.peek(1).type === TokenType.COLON && !EDGE_BINDING_KEYWORDS.has(val)) {
        return this.parseEdgeConfigField();
      }
    }

    // fn or async fn → regular function declaration
    if (this.check(TokenType.FN) ||
        (this.check(TokenType.ASYNC) && this.peek(1).type === TokenType.FN)) {
      return this.parseStatement();
    }

    // Fallback to regular statement
    return this.parseStatement();
  };

  ParserClass.prototype.parseEdgeConfigField = function() {
    const l = this.loc();
    const key = this.advance().value; // consume identifier (e.g., 'target')
    this.expect(TokenType.COLON, "Expected ':' after config key");
    const value = this.parseExpression();
    return new EdgeConfigField(key, value, l);
  };

  ParserClass.prototype.parseEdgeKV = function() {
    const l = this.loc();
    this.advance(); // consume 'kv'
    const name = this.expect(TokenType.IDENTIFIER, "Expected KV binding name").value;
    let config = null;
    if (this.check(TokenType.LBRACE)) {
      config = this._parseEdgeBindingConfig();
    }
    return new EdgeKVDeclaration(name, config, l);
  };

  ParserClass.prototype.parseEdgeSQL = function() {
    const l = this.loc();
    this.advance(); // consume 'sql'
    const name = this.expect(TokenType.IDENTIFIER, "Expected SQL binding name").value;
    let config = null;
    if (this.check(TokenType.LBRACE)) {
      config = this._parseEdgeBindingConfig();
    }
    return new EdgeSQLDeclaration(name, config, l);
  };

  ParserClass.prototype.parseEdgeStorage = function() {
    const l = this.loc();
    this.advance(); // consume 'storage'
    const name = this.expect(TokenType.IDENTIFIER, "Expected storage binding name").value;
    let config = null;
    if (this.check(TokenType.LBRACE)) {
      config = this._parseEdgeBindingConfig();
    }
    return new EdgeStorageDeclaration(name, config, l);
  };

  ParserClass.prototype.parseEdgeQueue = function() {
    const l = this.loc();
    this.advance(); // consume 'queue'
    const name = this.expect(TokenType.IDENTIFIER, "Expected queue binding name").value;
    let config = null;
    if (this.check(TokenType.LBRACE)) {
      config = this._parseEdgeBindingConfig();
    }
    return new EdgeQueueDeclaration(name, config, l);
  };

  ParserClass.prototype.parseEdgeEnv = function() {
    const l = this.loc();
    this.advance(); // consume 'env'
    const name = this.expect(TokenType.IDENTIFIER, "Expected env var name").value;
    let defaultValue = null;
    if (this.match(TokenType.ASSIGN)) {
      defaultValue = this.parseExpression();
    }
    return new EdgeEnvDeclaration(name, defaultValue, l);
  };

  ParserClass.prototype.parseEdgeSecret = function() {
    const l = this.loc();
    this.advance(); // consume 'secret'
    const name = this.expect(TokenType.IDENTIFIER, "Expected secret name").value;
    return new EdgeSecretDeclaration(name, l);
  };

  ParserClass.prototype.parseEdgeSchedule = function() {
    const l = this.loc();
    this.advance(); // consume 'schedule'
    const name = this.expect(TokenType.STRING, "Expected schedule name string").value;

    // cron("expression")
    const cronIdent = this.expect(TokenType.IDENTIFIER, "Expected 'cron' after schedule name");
    if (cronIdent.value !== 'cron') {
      this.error("Expected 'cron' keyword after schedule name");
    }
    this.expect(TokenType.LPAREN, "Expected '(' after 'cron'");
    const cronExpr = this.expect(TokenType.STRING, "Expected cron expression string").value;
    this.expect(TokenType.RPAREN, "Expected ')' after cron expression");

    const body = this.parseBlock();
    return new EdgeScheduleDeclaration(name, cronExpr, body, l);
  };

  ParserClass.prototype.parseEdgeConsume = function() {
    const l = this.loc();
    this.advance(); // consume 'consume'
    const queue = this.expect(TokenType.IDENTIFIER, "Expected queue name").value;

    // fn(messages) { ... } or a function reference
    this.expect(TokenType.FN, "Expected 'fn' after queue name in consume");
    this.expect(TokenType.LPAREN, "Expected '(' after 'fn'");
    const params = this.parseParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after consume parameters");
    const body = this.parseBlock();

    const handler = new AST.LambdaExpression(params, body, l);
    return new EdgeConsumeDeclaration(queue, handler, l);
  };

  // Helper: parse { key: value, ... } config block for bindings
  ParserClass.prototype._parseEdgeBindingConfig = function() {
    this.expect(TokenType.LBRACE, "Expected '{' for binding config");
    const config = {};
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this.expect(TokenType.IDENTIFIER, "Expected config key").value;
      this.expect(TokenType.COLON, "Expected ':' after config key");
      const value = this.parseExpression();
      config[key] = value;
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' to close binding config");
    return config;
  };
}
