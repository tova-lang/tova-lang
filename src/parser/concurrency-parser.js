// Concurrency-specific parser methods for the Tova language
// Extracted for lazy loading — only loaded when concurrent { } blocks are used.

import { TokenType } from '../lexer/tokens.js';
import * as AST from './ast.js';
import { SpawnExpression } from './concurrency-ast.js';
import { SelectStatement, SelectCase } from './select-ast.js';

const CONCURRENT_MODES = new Set(['cancel_on_error', 'first', 'timeout']);

export function installConcurrencyParser(ParserClass) {
  if (ParserClass.prototype._concurrencyParserInstalled) return;
  ParserClass.prototype._concurrencyParserInstalled = true;

  /**
   * Parse: concurrent [mode] { body }
   *
   * Modes:
   *   concurrent { ... }                  — mode "all" (default)
   *   concurrent cancel_on_error { ... }  — cancel siblings on first error
   *   concurrent first { ... }            — return first result, cancel rest
   *   concurrent timeout(ms) { ... }      — timeout after ms milliseconds
   */
  ParserClass.prototype.parseConcurrentBlock = function() {
    const l = this.loc();
    this.advance(); // consume 'concurrent'

    let mode = 'all';
    let timeout = null;

    // Check for mode modifier
    if (this.check(TokenType.IDENTIFIER) && CONCURRENT_MODES.has(this.current().value)) {
      const modeName = this.advance().value;
      if (modeName === 'timeout') {
        this.expect(TokenType.LPAREN, "Expected '(' after 'timeout'");
        timeout = this.parseExpression();
        this.expect(TokenType.RPAREN, "Expected ')' after timeout value");
        mode = 'timeout';
      } else {
        mode = modeName;
      }
    }

    this.expect(TokenType.LBRACE, "Expected '{' after 'concurrent'");

    const body = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      try {
        const stmt = this.parseStatement();
        if (stmt) body.push(stmt);
      } catch (e) {
        this.errors.push(e);
        this._synchronizeBlock();
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close concurrent block");
    return new AST.ConcurrentBlock(mode, timeout, body, l);
  };

  // Save the original parseUnary method to extend it with spawn support
  const _originalParseUnary = ParserClass.prototype.parseUnary;

  /**
   * Extend parseUnary to handle `spawn` as a prefix expression.
   * spawn foo(args) → SpawnExpression
   * Works like `await` but for concurrent task spawning.
   */
  ParserClass.prototype.parseUnary = function() {
    if (this.check(TokenType.IDENTIFIER) && this.current().value === 'spawn') {
      // Distinguish concurrency `spawn foo()` from stdlib function call `spawn("cmd", args)`.
      // If `spawn` is followed by `(`, it's a regular function call, not a concurrency keyword.
      const next = this.peek(1);
      if (next && next.type === TokenType.LPAREN) {
        return _originalParseUnary.call(this);
      }

      const l = this.loc();
      this.advance(); // consume 'spawn'

      // Parse the expression after spawn (function call, lambda, etc.)
      const expr = this.parseUnary();

      // If it's a call expression, split into callee + args
      if (expr.type === 'CallExpression') {
        return new SpawnExpression(expr.callee, expr.arguments, l);
      }

      // Otherwise treat the whole expression as the callee with no args
      return new SpawnExpression(expr, [], l);
    }

    return _originalParseUnary.call(this);
  };

  // Also support concurrent as a statement inside function bodies
  const _originalParseStatement = ParserClass.prototype.parseStatement;

  ParserClass.prototype.parseStatement = function() {
    // Check for 'concurrent' at statement level (inside function bodies)
    if (this.check(TokenType.IDENTIFIER) && this.current().value === 'concurrent') {
      return this.parseConcurrentBlock();
    }
    // Check for 'select {' at statement level (disambiguate from select() function call)
    if (this.check(TokenType.IDENTIFIER) && this.current().value === 'select'
        && this.peek(1).type === TokenType.LBRACE) {
      return this.parseSelectStatement();
    }
    return _originalParseStatement.call(this);
  };

  /**
   * Parse: select { case1  case2  ... }
   *
   * Each case is one of:
   *   binding from channel => body
   *   _ from channel => body
   *   channel.send(value) => body
   *   timeout(ms) => body
   *   _ => body
   */
  ParserClass.prototype.parseSelectStatement = function() {
    const l = this.loc();
    this.advance(); // consume 'select'
    this.expect(TokenType.LBRACE, "Expected '{' after 'select'");

    const cases = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      try {
        cases.push(this.parseSelectCase());
      } catch (e) {
        this.errors.push(e);
        this._synchronizeBlock();
      }
    }

    this.expect(TokenType.RBRACE, "Expected '}' to close select block");
    return new SelectStatement(cases, l);
  };

  ParserClass.prototype.parseSelectCase = function() {
    const l = this.loc();

    // timeout(ms) => body
    if (this.check(TokenType.IDENTIFIER) && this.current().value === 'timeout'
        && this.peek(1).type === TokenType.LPAREN) {
      this.advance(); // consume 'timeout'
      this.expect(TokenType.LPAREN, "Expected '(' after 'timeout'");
      const ms = this.parseExpression();
      this.expect(TokenType.RPAREN, "Expected ')' after timeout value");
      this.expect(TokenType.ARROW, "Expected '=>' after timeout");
      const body = this.parseSelectCaseBody();
      return new SelectCase('timeout', null, null, ms, body, l);
    }

    // _ => body (default case) — must check before _ from channel
    if (this.check(TokenType.IDENTIFIER) && this.current().value === '_'
        && this.peek(1).type === TokenType.ARROW) {
      this.advance(); // consume '_'
      this.expect(TokenType.ARROW, "Expected '=>' after '_'");
      const body = this.parseSelectCaseBody();
      return new SelectCase('default', null, null, null, body, l);
    }

    // _ from channel => body (wildcard receive)
    if (this.check(TokenType.IDENTIFIER) && this.current().value === '_'
        && this.peek(1).type === TokenType.FROM) {
      this.advance(); // consume '_'
      this.advance(); // consume 'from'
      const channel = this._parseSelectChannel();
      this.expect(TokenType.ARROW, "Expected '=>' after channel");
      const body = this.parseSelectCaseBody();
      return new SelectCase('receive', channel, null, null, body, l);
    }

    // binding from channel => body (named receive)
    if (this.check(TokenType.IDENTIFIER) && this.peek(1).type === TokenType.FROM) {
      const binding = this.advance().value; // consume binding name
      this.advance(); // consume 'from'
      const channel = this._parseSelectChannel();
      this.expect(TokenType.ARROW, "Expected '=>' after channel");
      const body = this.parseSelectCaseBody();
      return new SelectCase('receive', channel, binding, null, body, l);
    }

    // channel.send(value) => body (send case)
    // Parse as expression, then check if it's a send call
    const expr = this.parseExpression();
    if (expr.type === 'CallExpression' && expr.callee.type === 'MemberExpression'
        && expr.callee.property === 'send') {
      this.expect(TokenType.ARROW, "Expected '=>' after send");
      const body = this.parseSelectCaseBody();
      return new SelectCase('send', expr.callee.object, null, expr.arguments[0], body, l);
    }

    throw this.error("Expected select case: 'binding from channel =>', 'timeout(ms) =>', 'channel.send(val) =>', or '_ =>'", l);
  };

  /**
   * Parse a channel expression in a select receive case.
   * Handles identifiers and member access chains (e.g., ch, obj.ch)
   * without consuming '=>' as a lambda arrow.
   */
  ParserClass.prototype._parseSelectChannel = function() {
    const l = this.loc();
    let expr = new AST.Identifier(this.advance().value, l);
    // Follow member access chains: ch.sub, obj.channels, etc.
    while (this.check(TokenType.DOT)) {
      this.advance(); // consume '.'
      const prop = this.advance().value;
      expr = new AST.MemberExpression(expr, prop, false, this.loc());
    }
    return expr;
  };

  ParserClass.prototype.parseSelectCaseBody = function() {
    if (this.check(TokenType.LBRACE)) {
      this.advance(); // consume '{'
      const body = [];
      while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
        try {
          const stmt = this.parseStatement();
          if (stmt) body.push(stmt);
        } catch (e) {
          this.errors.push(e);
          this._synchronizeBlock();
        }
      }
      this.expect(TokenType.RBRACE, "Expected '}' to close select case body");
      return body;
    }
    // Single statement
    const stmt = this.parseStatement();
    return stmt ? [stmt] : [];
  };
}
