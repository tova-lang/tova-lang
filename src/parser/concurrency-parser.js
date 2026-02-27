// Concurrency-specific parser methods for the Tova language
// Extracted for lazy loading — only loaded when concurrent { } blocks are used.

import { TokenType } from '../lexer/tokens.js';
import * as AST from './ast.js';
import { SpawnExpression } from './concurrency-ast.js';

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
    return _originalParseStatement.call(this);
  };
}
