// Select-specific AST Node definitions for the Tova language
// Extracted for lazy loading -- only loaded when select { } blocks are used.

/**
 * select {
 *   receive msg from ch => { ... }
 *   send val to ch => { ... }
 *   timeout(5000) => { ... }
 *   default => { ... }
 * }
 */
export class SelectStatement {
  constructor(cases, loc) {
    this.type = 'SelectStatement';
    this.cases = cases;   // Array of SelectCase
    this.loc = loc;
  }
}

/**
 * A single case arm inside a select block.
 *
 * kind: "receive" | "send" | "timeout" | "default"
 * channel: Expression | null   (identifier for the channel; null for timeout/default)
 * binding: string | null        (variable name bound on receive; null otherwise)
 * value: Expression | null      (value to send, or timeout duration; null for receive/default)
 * body: [Statement]             (statements executed when this case fires)
 */
export class SelectCase {
  constructor(kind, channel, binding, value, body, loc) {
    this.type = 'SelectCase';
    this.kind = kind;        // "receive" | "send" | "timeout" | "default"
    this.channel = channel;  // Expression | null
    this.binding = binding;  // string | null
    this.value = value;      // Expression | null
    this.body = body;        // [Statement]
    this.loc = loc;
  }
}
