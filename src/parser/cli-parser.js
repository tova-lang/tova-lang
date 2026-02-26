// CLI-specific parser methods for the Tova language
// Extracted from parser.js for lazy loading — only loaded when cli { } blocks are encountered.

import { TokenType } from '../lexer/tokens.js';
import * as AST from './ast.js';
import { CliConfigField, CliCommandDeclaration, CliParam } from './cli-ast.js';

// Valid config keys inside cli blocks
const CLI_CONFIG_KEYS = new Set(['name', 'version', 'description']);

export function installCliParser(ParserClass) {
  if (ParserClass.prototype._cliParserInstalled) return;
  ParserClass.prototype._cliParserInstalled = true;

  ParserClass.prototype.parseCliBlock = function() {
    const l = this.loc();
    this.advance(); // consume 'cli'
    this.expect(TokenType.LBRACE, "Expected '{' after 'cli'");
    const config = [];
    const commands = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      try {
        // fn or async fn → command
        if (this.check(TokenType.FN) ||
            (this.check(TokenType.ASYNC) && this.peek(1).type === TokenType.FN)) {
          commands.push(this.parseCliCommand());
        }
        // identifier followed by colon → config field
        else if (this.check(TokenType.IDENTIFIER) && this.peek(1).type === TokenType.COLON) {
          config.push(this.parseCliConfigField());
        }
        else {
          this.error("Expected config field (name: ...) or command (fn ...) inside cli block");
        }
      } catch (e) {
        this.errors.push(e);
        this._synchronizeBlock();
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close cli block");
    return new AST.CliBlock(config, commands, l);
  };

  ParserClass.prototype.parseCliConfigField = function() {
    const l = this.loc();
    const key = this.advance().value; // consume identifier
    this.expect(TokenType.COLON, "Expected ':' after config key");
    const value = this.parseExpression();
    return new CliConfigField(key, value, l);
  };

  ParserClass.prototype.parseCliCommand = function() {
    const l = this.loc();
    let isAsync = false;
    if (this.check(TokenType.ASYNC)) {
      isAsync = true;
      this.advance(); // consume 'async'
    }
    this.expect(TokenType.FN, "Expected 'fn' for cli command");
    const name = this.expect(TokenType.IDENTIFIER, "Expected command name").value;
    this.expect(TokenType.LPAREN, "Expected '(' after command name");
    const params = this.parseCliParameterList();
    this.expect(TokenType.RPAREN, "Expected ')' after parameters");

    // Parse body
    const body = this.parseBlock();

    return new CliCommandDeclaration(name, params, body, isAsync, l);
  };

  ParserClass.prototype.parseCliParameterList = function() {
    const params = [];
    while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
      if (params.length > 0) {
        this.expect(TokenType.COMMA, "Expected ',' between parameters");
      }
      params.push(this.parseCliParam());
    }
    return params;
  };

  ParserClass.prototype.parseCliParam = function() {
    const l = this.loc();
    let isFlag = false;

    // Check for -- prefix (two MINUS tokens)
    if (this.check(TokenType.MINUS) && this.peek(1).type === TokenType.MINUS) {
      isFlag = true;
      this.advance(); // consume first -
      this.advance(); // consume second -
    }

    const name = this.expect(TokenType.IDENTIFIER, "Expected parameter name").value;

    // Parse optional type annotation: param: Type, param: Type?, param: [Type]
    let typeAnnotation = null;
    let isOptional = false;
    let isRepeated = false;

    if (this.match(TokenType.COLON)) {
      // [Type] → repeated
      if (this.check(TokenType.LBRACKET)) {
        isRepeated = true;
        this.advance(); // consume [
        typeAnnotation = this._parseCliTypeName();
        this.expect(TokenType.RBRACKET, "Expected ']' after array type");
      } else {
        typeAnnotation = this._parseCliTypeName();
        // Type? → optional
        if (this.check(TokenType.QUESTION)) {
          isOptional = true;
          this.advance(); // consume ?
        }
      }
    }

    // Bool flags are implicitly optional (default false)
    if (isFlag && typeAnnotation === 'Bool' && !isOptional) {
      isOptional = true;
    }

    // Parse default value: = expr
    let defaultValue = null;
    if (this.match(TokenType.ASSIGN)) {
      defaultValue = this.parseExpression();
    }

    return new CliParam(name, typeAnnotation, defaultValue, isFlag, isOptional, isRepeated, l);
  };

  // Helper to parse a simple type name (String, Int, Float, Bool, or IDENTIFIER)
  ParserClass.prototype._parseCliTypeName = function() {
    if (this.check(TokenType.IDENTIFIER) || this.check(TokenType.TYPE)) {
      return this.advance().value;
    }
    this.error("Expected type name");
  };
}
