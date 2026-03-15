// Concurrency-specific analyzer methods for the Tova language
// Extracted from analyzer.js for lazy loading — only loaded when concurrent { } blocks are encountered.

import { Symbol } from './scope.js';

export function installConcurrencyAnalyzer(AnalyzerClass) {
  if (AnalyzerClass.prototype._concurrencyAnalyzerInstalled) return;
  AnalyzerClass.prototype._concurrencyAnalyzerInstalled = true;

  AnalyzerClass.prototype.visitConcurrentBlock = function(node) {
    // Validate mode
    const validModes = new Set(['all', 'cancel_on_error', 'first', 'timeout']);
    if (!validModes.has(node.mode)) {
      this.warn(`Unknown concurrent block mode '${node.mode}'`, node.loc, null, {
        code: 'W_UNKNOWN_CONCURRENT_MODE',
      });
    }

    // Validate timeout
    if (node.mode === 'timeout' && !node.timeout) {
      this.warn("concurrent timeout mode requires a timeout value", node.loc, null, {
        code: 'W_MISSING_TIMEOUT',
      });
    }

    // Warn on empty block
    if (node.body.length === 0) {
      this.warn("Empty concurrent block", node.loc, null, {
        code: 'W_EMPTY_CONCURRENT',
      });
    }

    // Track concurrent depth for spawn validation
    this._concurrentDepth = (this._concurrentDepth || 0) + 1;

    // Visit body statements (concurrent block does NOT create a new scope —
    // variables assigned inside should be visible after the block)
    for (const stmt of node.body) {
      this.visitNode(stmt);
    }

    // Check spawned functions for WASM compatibility — warn if mixed WASM/non-WASM
    let hasWasm = false;
    let hasNonWasm = false;
    for (const stmt of node.body) {
      const spawn = (stmt.type === 'Assignment' && stmt.values && stmt.values[0] && stmt.values[0].type === 'SpawnExpression')
        ? stmt.values[0]
        : (stmt.type === 'ExpressionStatement' && stmt.expression && stmt.expression.type === 'SpawnExpression')
          ? stmt.expression
          : null;
      if (!spawn) continue;
      const calleeName = spawn.callee && spawn.callee.type === 'Identifier' ? spawn.callee.name : null;
      if (calleeName) {
        const sym = this.currentScope.lookup(calleeName);
        if (sym && sym.isWasm) {
          hasWasm = true;
        } else {
          hasNonWasm = true;
        }
      } else {
        // Lambda or complex expression — always non-WASM
        hasNonWasm = true;
      }
    }
    if (hasWasm && hasNonWasm) {
      this.warn(
        "concurrent block mixes @wasm and non-WASM tasks — non-WASM tasks will fall back to async JS execution",
        node.loc, null, { code: 'W_SPAWN_WASM_FALLBACK' }
      );
    }

    this._concurrentDepth--;
  };

  AnalyzerClass.prototype.visitSelectStatement = function(node) {
    if (node.cases.length === 0) {
      this.warn("Empty select block", node.loc, null, {
        code: 'W_EMPTY_SELECT',
      });
    }

    let defaultCount = 0;
    let timeoutCount = 0;
    for (const c of node.cases) {
      if (c.kind === 'default') defaultCount++;
      if (c.kind === 'timeout') timeoutCount++;
    }

    if (defaultCount > 1) {
      this.warn("select block has multiple default cases", node.loc, null, {
        code: 'W_DUPLICATE_SELECT_DEFAULT',
      });
    }
    if (timeoutCount > 1) {
      this.warn("select block has multiple timeout cases", node.loc, null, {
        code: 'W_DUPLICATE_SELECT_TIMEOUT',
      });
    }
    if (defaultCount > 0 && timeoutCount > 0) {
      this.warn("select block has both default and timeout — default makes timeout unreachable", node.loc, null, {
        code: 'W_SELECT_DEFAULT_TIMEOUT',
      });
    }

    // Visit each case's expressions and body
    for (const c of node.cases) {
      if (c.channel) this.visitNode(c.channel);
      if (c.value) this.visitNode(c.value);

      if (c.kind === 'receive' && c.binding) {
        // Create scope for the binding variable
        this.pushScope('select-case');
        this.currentScope.define(c.binding,
          new Symbol(c.binding, 'variable', null, false, c.loc));
        for (const stmt of c.body) {
          this.visitNode(stmt);
        }
        this.popScope();
      } else {
        for (const stmt of c.body) {
          this.visitNode(stmt);
        }
      }
    }
  };
}
