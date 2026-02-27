// Concurrency-specific AST Node definitions for the Tova language
// Extracted for lazy loading -- only loaded when concurrent { } blocks are used.

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
