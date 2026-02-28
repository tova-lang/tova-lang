// Deploy-specific parser methods for the Tova language
// Extracted from parser.js for lazy loading — only loaded when deploy { } blocks are encountered.

import { TokenType } from '../lexer/tokens.js';
import {
  DeployBlock, DeployConfigField, DeployEnvBlock, DeployDbBlock,
} from './deploy-ast.js';

// Keywords that start sub-blocks (not config fields)
const DEPLOY_SUB_BLOCK_KEYWORDS = new Set(['env', 'db']);

export function installDeployParser(ParserClass) {
  if (ParserClass.prototype._deployParserInstalled) return;
  ParserClass.prototype._deployParserInstalled = true;

  ParserClass.prototype.parseDeployBlock = function() {
    const l = this.loc();
    this.advance(); // consume 'deploy'

    // Deploy blocks REQUIRE a name
    if (!this.check(TokenType.STRING)) {
      throw this.error("Deploy block requires a name (e.g., deploy \"prod\" { })");
    }
    const name = this.advance().value;

    this.expect(TokenType.LBRACE, "Expected '{' after deploy name");
    const body = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      try {
        const stmt = this.parseDeployStatement();
        if (stmt) {
          if (Array.isArray(stmt)) {
            body.push(...stmt);
          } else {
            body.push(stmt);
          }
        }
      } catch (e) {
        this.errors.push(e);
        this._synchronizeBlock();
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close deploy block");
    return new DeployBlock(body, l, name);
  };

  ParserClass.prototype.parseDeployStatement = function() {
    if (this.check(TokenType.IDENTIFIER)) {
      const val = this.current().value;

      // env { KEY: "value" }
      if (val === 'env') {
        return this.parseDeployEnvBlock();
      }

      // db { postgres { } redis { } }
      if (val === 'db') {
        return this.parseDeployDbBlock();
      }

      // Config field: identifier: value (e.g., domain: "myapp.com")
      if (this.peek(1).type === TokenType.COLON && !DEPLOY_SUB_BLOCK_KEYWORDS.has(val)) {
        return this.parseDeployConfigField();
      }
    }

    // Handle keyword tokens used as config keys (e.g., server: "root@example.com")
    // In deploy blocks, 'server' is lexed as TokenType.SERVER, not IDENTIFIER
    if (this.check(TokenType.SERVER) && this.peek(1).type === TokenType.COLON) {
      return this.parseDeployConfigField();
    }

    // Fallback to regular statement
    return this.parseStatement();
  };

  ParserClass.prototype.parseDeployConfigField = function() {
    const l = this.loc();
    const key = this.advance().value; // consume identifier (e.g., 'server')
    this.expect(TokenType.COLON, "Expected ':' after config key");
    const value = this.parseExpression();
    return new DeployConfigField(key, value, l);
  };

  ParserClass.prototype.parseDeployEnvBlock = function() {
    const l = this.loc();
    this.advance(); // consume 'env'
    this.expect(TokenType.LBRACE, "Expected '{' after 'env'");
    const entries = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const key = this.expect(TokenType.IDENTIFIER, "Expected env variable name").value;
      this.expect(TokenType.COLON, "Expected ':' after env key");
      const value = this.parseExpression();
      entries.push({ key, value });
      this.match(TokenType.COMMA);
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close env block");
    return new DeployEnvBlock(entries, l);
  };

  ParserClass.prototype.parseDeployDbBlock = function() {
    const l = this.loc();
    this.advance(); // consume 'db'
    this.expect(TokenType.LBRACE, "Expected '{' after 'db'");
    const blocks = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const engineLoc = this.loc();
      const engine = this.expect(TokenType.IDENTIFIER, "Expected database engine name (e.g., postgres, redis)").value;
      this.expect(TokenType.LBRACE, `Expected '{' after '${engine}'`);
      const config = {};

      while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
        const key = this.expect(TokenType.IDENTIFIER, "Expected config key").value;
        this.expect(TokenType.COLON, "Expected ':' after config key");
        const value = this.parseExpression();
        config[key] = value;
        this.match(TokenType.COMMA);
      }

      this.expect(TokenType.RBRACE, `Expected '}' to close ${engine} config`);
      blocks.push(new DeployDbBlock(engine, config, engineLoc));
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close db block");
    return blocks;
  };
}
