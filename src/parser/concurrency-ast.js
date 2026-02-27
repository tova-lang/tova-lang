// AST node types for structured concurrency.

/**
 * concurrent { ... }
 * concurrent cancel_on_error { ... }
 * concurrent first { ... }
 * concurrent timeout(5000) { ... }
 */
export class ConcurrentBlock {
  constructor(mode, timeout, body, loc) {
    this.type = 'ConcurrentBlock';
    this.mode = mode;           // "all" | "cancel_on_error" | "first"
    this.timeout = timeout;     // Expression | null
    this.body = body;           // Array of statements
    this.loc = loc;
  }
}

/**
 * spawn foo(args)
 * spawn fn() { ... }
 */
export class SpawnExpression {
  constructor(callee, args, loc) {
    this.type = 'SpawnExpression';
    this.callee = callee;       // Expression (function name or lambda)
    this.arguments = args;      // Array of Expression
    this.loc = loc;
  }
}
