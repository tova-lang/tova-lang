# Structured Concurrency Phase 2 — Compiler Integration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `concurrent {}` blocks and `spawn` expressions to Tova's parser, analyzer, and codegen so that `concurrent { a = spawn fib(40); b = spawn fib(40) }` compiles and runs both tasks on the Tokio runtime.

**Architecture:** New AST nodes (`ConcurrentBlock`, `SpawnExpression`) follow the existing plugin pattern (like security/cli/edge blocks). The parser detects `concurrent` as an identifier at top-level or statement position, and `spawn` as a prefix expression (like `await`). The codegen emits calls to the Phase 1 runtime bridge (`src/stdlib/runtime-bridge.js`). For Phase 2, all task bodies use Promise-based fallback (WASM compilation of arbitrary function bodies is Phase 4). The runtime bridge wraps each spawned function as an async task and dispatches to `concurrentAll` on Tokio.

**Tech Stack:** Tova compiler (JS), Bun test runner, Phase 1 napi-rs runtime

---

## Overview

| Task | What it builds | Key files |
|------|---------------|-----------|
| 1 | AST node types | `src/parser/concurrency-ast.js`, `src/parser/ast.js` |
| 2 | Plugin registration | `src/registry/plugins/concurrency-plugin.js`, `src/registry/register-all.js` |
| 3 | Parser — `concurrent {}` and `spawn` | `src/parser/concurrency-parser.js` |
| 4 | Analyzer — validation and scope | `src/analyzer/analyzer.js` |
| 5 | Codegen — emit runtime bridge calls | `src/codegen/base-codegen.js` |
| 6 | End-to-end integration test | `tests/concurrency-block.test.js` |

---

### Task 1: AST Node Types

**Files:**
- Create: `src/parser/concurrency-ast.js`
- Modify: `src/parser/ast.js:67-74` (add after EdgeBlock class)

**Step 1: Write the failing test**

Create `tests/concurrency-block.test.js`:

```javascript
import { describe, test, expect } from 'bun:test';
import { ConcurrentBlock, SpawnExpression } from '../src/parser/concurrency-ast.js';

describe('concurrency AST nodes', () => {
    test('ConcurrentBlock has correct structure', () => {
        const block = new ConcurrentBlock('all', null, [], { line: 1, column: 0 });
        expect(block.type).toBe('ConcurrentBlock');
        expect(block.mode).toBe('all');
        expect(block.timeout).toBeNull();
        expect(block.body).toEqual([]);
        expect(block.loc).toEqual({ line: 1, column: 0 });
    });

    test('ConcurrentBlock cancel_on_error mode', () => {
        const block = new ConcurrentBlock('cancel_on_error', null, [], { line: 1, column: 0 });
        expect(block.mode).toBe('cancel_on_error');
    });

    test('ConcurrentBlock with timeout', () => {
        const timeout = { type: 'NumberLiteral', value: 5000 };
        const block = new ConcurrentBlock('all', timeout, [], { line: 1, column: 0 });
        expect(block.timeout).toEqual(timeout);
    });

    test('SpawnExpression has correct structure', () => {
        const callee = { type: 'Identifier', name: 'foo' };
        const args = [{ type: 'NumberLiteral', value: 42 }];
        const spawn = new SpawnExpression(callee, args, { line: 1, column: 0 });
        expect(spawn.type).toBe('SpawnExpression');
        expect(spawn.callee).toBe(callee);
        expect(spawn.arguments).toBe(args);
    });

    test('SpawnExpression with lambda body', () => {
        const callee = { type: 'LambdaExpression', params: [], body: [] };
        const spawn = new SpawnExpression(callee, [], { line: 2, column: 4 });
        expect(spawn.type).toBe('SpawnExpression');
        expect(spawn.callee.type).toBe('LambdaExpression');
    });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/concurrency-block.test.js`
Expected: FAIL — `Cannot find module '../src/parser/concurrency-ast.js'`

**Step 3: Create concurrency-ast.js**

Create `src/parser/concurrency-ast.js`:

```javascript
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
```

**Step 4: Add ConcurrentBlock to main ast.js**

Add after the `EdgeBlock` class in `src/parser/ast.js` (after line 74):

```javascript
export class ConcurrentBlock {
  constructor(mode, timeout, body, loc) {
    this.type = 'ConcurrentBlock';
    this.mode = mode;
    this.timeout = timeout;
    this.body = body;
    this.loc = loc;
  }
}
```

This keeps the parent type in `ast.js` (for `parseTopLevel` detection) while child types live in `concurrency-ast.js`.

**Step 5: Run test to verify it passes**

Run: `bun test tests/concurrency-block.test.js`
Expected: 5 pass

**Step 6: Commit**

```bash
git add src/parser/concurrency-ast.js src/parser/ast.js tests/concurrency-block.test.js
git commit -m "feat: AST nodes for ConcurrentBlock and SpawnExpression"
```

---

### Task 2: Plugin Registration

**Files:**
- Create: `src/registry/plugins/concurrency-plugin.js`
- Modify: `src/registry/register-all.js:13,23` (add import and register)

**Step 1: Write the failing test**

Add to `tests/concurrency-block.test.js`:

```javascript
import { BlockRegistry } from '../src/registry/register-all.js';

describe('concurrency plugin registration', () => {
    test('concurrency plugin is registered', () => {
        const plugin = BlockRegistry.get('concurrency');
        expect(plugin).toBeDefined();
        expect(plugin.name).toBe('concurrency');
        expect(plugin.astNodeType).toBe('ConcurrentBlock');
    });

    test('ConcurrentBlock maps to concurrency plugin', () => {
        const entry = BlockRegistry.getByAstType('ConcurrentBlock');
        expect(entry).toBeDefined();
        expect(entry.name).toBe('concurrency');
    });

    test('SpawnExpression is registered as noop', () => {
        const isNoop = BlockRegistry.isNoopType('SpawnExpression');
        expect(isNoop).toBe(true);
    });

    test('detection strategy is identifier', () => {
        const plugin = BlockRegistry.get('concurrency');
        expect(plugin.detection.strategy).toBe('identifier');
        expect(plugin.detection.identifierValue).toBe('concurrent');
    });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/concurrency-block.test.js`
Expected: FAIL — `BlockRegistry.get('concurrency')` returns undefined

**Step 3: Create the plugin**

Create `src/registry/plugins/concurrency-plugin.js`:

```javascript
import { installConcurrencyParser } from '../../parser/concurrency-parser.js';

export const concurrencyPlugin = {
  name: 'concurrency',
  astNodeType: 'ConcurrentBlock',
  detection: {
    strategy: 'identifier',
    identifierValue: 'concurrent',
  },
  parser: {
    install: installConcurrencyParser,
    installedFlag: '_concurrencyParserInstalled',
    method: 'parseConcurrentBlock',
  },
  analyzer: {
    visit: (analyzer, node) => analyzer.visitConcurrentBlock(node),
    noopNodeTypes: ['SpawnExpression'],
  },
  codegen: {},
};
```

**Step 4: Register it**

In `src/registry/register-all.js`, add:

After the edge import (line 13), add:
```javascript
import { concurrencyPlugin } from './plugins/concurrency-plugin.js';
```

After the edge registration (line 23), add:
```javascript
BlockRegistry.register(concurrencyPlugin);
```

**Step 5: Create stub parser** (prevents import error)

Create `src/parser/concurrency-parser.js`:

```javascript
export function installConcurrencyParser(ParserClass) {
  if (ParserClass.prototype._concurrencyParserInstalled) return;
  ParserClass.prototype._concurrencyParserInstalled = true;

  // Stub — implemented in Task 3
  ParserClass.prototype.parseConcurrentBlock = function() {
    this.error('concurrent blocks not yet implemented');
  };
}
```

**Step 6: Run test to verify it passes**

Run: `bun test tests/concurrency-block.test.js`
Expected: All tests pass

**Step 7: Run full test suite to check no regressions**

Run: `bun test`
Expected: All existing tests pass (7100+)

**Step 8: Commit**

```bash
git add src/registry/plugins/concurrency-plugin.js src/registry/register-all.js src/parser/concurrency-parser.js tests/concurrency-block.test.js
git commit -m "feat: register concurrency plugin in block registry"
```

---

### Task 3: Parser — `concurrent {}` and `spawn`

**Files:**
- Modify: `src/parser/concurrency-parser.js` (replace stub)
- Modify: `tests/concurrency-block.test.js` (add parser tests)

This is the largest task. The parser needs to handle:
1. `concurrent { ... }` — top-level or statement-level structured block
2. `concurrent cancel_on_error { ... }` — block mode
3. `concurrent timeout(5000) { ... }` — timeout mode
4. `spawn foo(args)` — prefix expression inside concurrent blocks
5. `spawn fn() { body }` — spawn with inline lambda

`concurrent` is detected by the block registry at `parseTopLevel` level. But it must ALSO work inside function bodies (statement level). The parser plugin adds `parseConcurrentBlock` to the prototype. For statement-level dispatch, we add a check in the body of `parseConcurrentBlock` that delegates to `parseStatement()` for the block body.

`spawn` follows the `await` pattern: it's a prefix unary expression parsed in `parseUnary()`. But unlike `await` (which is a keyword token), `spawn` is an IDENTIFIER. The parser checks `this.check(TokenType.IDENTIFIER) && this.current().value === 'spawn'` in `parseUnary()`.

**Step 1: Write the failing parser tests**

Add to `tests/concurrency-block.test.js`:

```javascript
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

function parse(code) {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, code);
    return parser.parse();
}

function findNode(ast, type) {
    for (const node of ast.body) {
        if (node.type === type) return node;
    }
    return null;
}

describe('concurrency parser', () => {
    test('parses basic concurrent block', () => {
        const ast = parse('concurrent { x = 1 }');
        const block = findNode(ast, 'ConcurrentBlock');
        expect(block).not.toBeNull();
        expect(block.mode).toBe('all');
        expect(block.timeout).toBeNull();
        expect(block.body.length).toBeGreaterThan(0);
    });

    test('parses concurrent cancel_on_error', () => {
        const ast = parse('concurrent cancel_on_error { x = 1 }');
        const block = findNode(ast, 'ConcurrentBlock');
        expect(block).not.toBeNull();
        expect(block.mode).toBe('cancel_on_error');
    });

    test('parses concurrent first', () => {
        const ast = parse('concurrent first { x = 1 }');
        const block = findNode(ast, 'ConcurrentBlock');
        expect(block.mode).toBe('first');
    });

    test('parses concurrent timeout(ms)', () => {
        const ast = parse('concurrent timeout(5000) { x = 1 }');
        const block = findNode(ast, 'ConcurrentBlock');
        expect(block.mode).toBe('timeout');
        expect(block.timeout).not.toBeNull();
        expect(block.timeout.value).toBe(5000);
    });

    test('parses spawn as expression', () => {
        const ast = parse('concurrent { a = spawn foo(42) }');
        const block = findNode(ast, 'ConcurrentBlock');
        expect(block.body.length).toBe(1);
        const assign = block.body[0];
        expect(assign.type).toBe('Assignment');
        // The value should be a SpawnExpression
        expect(assign.value.type).toBe('SpawnExpression');
        expect(assign.value.callee.type).toBe('CallExpression');
    });

    test('parses spawn with no assignment (fire-and-forget)', () => {
        const ast = parse('concurrent { spawn fire() }');
        const block = findNode(ast, 'ConcurrentBlock');
        const stmt = block.body[0];
        // ExpressionStatement wrapping SpawnExpression
        expect(stmt.type).toBe('ExpressionStatement');
        expect(stmt.expression.type).toBe('SpawnExpression');
    });

    test('parses multiple spawns in concurrent block', () => {
        const ast = parse(`
            concurrent {
                a = spawn fetch_users()
                b = spawn fetch_posts()
            }
        `);
        const block = findNode(ast, 'ConcurrentBlock');
        expect(block.body.length).toBe(2);
        expect(block.body[0].value.type).toBe('SpawnExpression');
        expect(block.body[1].value.type).toBe('SpawnExpression');
    });

    test('concurrent block inside function body', () => {
        const ast = parse(`
            fn main() {
                concurrent {
                    a = spawn foo()
                }
            }
        `);
        const fn = findNode(ast, 'FunctionDeclaration');
        expect(fn).not.toBeNull();
        const block = fn.body.body[0];
        expect(block.type).toBe('ConcurrentBlock');
    });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/concurrency-block.test.js`
Expected: FAIL — parser throws "concurrent blocks not yet implemented"

**Step 3: Implement the parser**

Replace the contents of `src/parser/concurrency-parser.js`:

```javascript
import * as AST from './ast.js';
import { SpawnExpression } from './concurrency-ast.js';
import { TokenType } from '../lexer/tokens.js';

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
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/concurrency-block.test.js`
Expected: All parser tests pass

**Step 5: Run full test suite**

Run: `bun test`
Expected: All 7100+ existing tests pass (no regressions from parseUnary/parseStatement override)

**Step 6: Commit**

```bash
git add src/parser/concurrency-parser.js tests/concurrency-block.test.js
git commit -m "feat: parser for concurrent blocks and spawn expressions"
```

---

### Task 4: Analyzer — Validation and Scope

**Files:**
- Modify: `src/analyzer/analyzer.js` (add `visitConcurrentBlock`)
- Modify: `tests/concurrency-block.test.js` (add analyzer tests)

The analyzer validates:
1. `spawn` is only used inside a `concurrent {}` block
2. Block mode is valid
3. Variables assigned via `spawn` are tracked in scope
4. Concurrent blocks can nest (but warn if unnecessary)

**Step 1: Write the failing test**

Add to `tests/concurrency-block.test.js`:

```javascript
import { Analyzer } from '../src/analyzer/analyzer.js';

function analyze(code) {
    const ast = parse(code);
    const analyzer = new Analyzer(ast, 'test.tova');
    return analyzer.analyze();
}

function getWarnings(code) {
    const result = analyze(code);
    return result.warnings || [];
}

function getErrors(code) {
    const result = analyze(code);
    return result.errors || [];
}

describe('concurrency analyzer', () => {
    test('concurrent block with spawns analyzes without errors', () => {
        const result = analyze(`
            fn foo() -> Int { 42 }
            concurrent {
                a = spawn foo()
            }
        `);
        expect(result.errors.length).toBe(0);
    });

    test('spawn outside concurrent block warns', () => {
        const warnings = getWarnings(`
            fn foo() -> Int { 42 }
            fn main() {
                a = spawn foo()
            }
        `);
        const spawnWarning = warnings.find(w => w.code === 'W_SPAWN_OUTSIDE_CONCURRENT');
        expect(spawnWarning).toBeDefined();
    });

    test('concurrent block variables are in scope after block', () => {
        // This should not produce "undefined identifier" warnings for a and b
        const result = analyze(`
            fn foo() -> Int { 42 }
            fn main() {
                concurrent {
                    a = spawn foo()
                    b = spawn foo()
                }
                print(a)
                print(b)
            }
        `);
        const undefinedWarnings = result.warnings.filter(w => w.code === 'W_UNDEFINED_IDENTIFIER');
        // a and b should not be flagged as undefined
        const flagged = undefinedWarnings.filter(w => w.message.includes("'a'") || w.message.includes("'b'"));
        expect(flagged.length).toBe(0);
    });

    test('empty concurrent block warns', () => {
        const warnings = getWarnings('concurrent { }');
        const emptyWarning = warnings.find(w => w.code === 'W_EMPTY_CONCURRENT');
        expect(emptyWarning).toBeDefined();
    });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/concurrency-block.test.js`
Expected: FAIL — `analyzer.visitConcurrentBlock is not a function` (because the plugin calls it but it doesn't exist)

**Step 3: Implement the analyzer method**

In `src/analyzer/analyzer.js`, add the `visitConcurrentBlock` method. Find the `visitCliBlock` method and add `visitConcurrentBlock` near it.

Add near the other block visitor methods (around line 970):

```javascript
  visitConcurrentBlock(node) {
    // Validate mode
    const validModes = new Set(['all', 'cancel_on_error', 'first', 'timeout']);
    if (!validModes.has(node.mode)) {
      this.warn(`Unknown concurrent block mode '${node.mode}'`, node.loc, {
        code: 'W_UNKNOWN_CONCURRENT_MODE',
      });
    }

    // Validate timeout
    if (node.mode === 'timeout' && !node.timeout) {
      this.warn("concurrent timeout mode requires a timeout value", node.loc, {
        code: 'W_MISSING_TIMEOUT',
      });
    }

    // Warn on empty block
    if (node.body.length === 0) {
      this.warn("Empty concurrent block", node.loc, {
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

    this._concurrentDepth--;
  }
```

Then, in the `visitExpression` method (around line 880-910), add a case for `SpawnExpression` near the `AwaitExpression` case:

```javascript
      case 'SpawnExpression':
        if (!this._concurrentDepth) {
          this.warn("'spawn' should be used inside a 'concurrent' block", node.loc, {
            code: 'W_SPAWN_OUTSIDE_CONCURRENT',
          });
        }
        if (node.callee) this.visitExpression(node.callee);
        if (node.arguments) {
          for (const arg of node.arguments) {
            this.visitExpression(arg);
          }
        }
        return;
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/concurrency-block.test.js`
Expected: All analyzer tests pass

**Step 5: Run full test suite**

Run: `bun test`
Expected: All existing tests pass

**Step 6: Commit**

```bash
git add src/analyzer/analyzer.js tests/concurrency-block.test.js
git commit -m "feat: analyzer validation for concurrent blocks and spawn expressions"
```

---

### Task 5: Codegen — Emit Runtime Bridge Calls

**Files:**
- Modify: `src/codegen/base-codegen.js:255-291` (add ConcurrentBlock/SpawnExpression cases)
- Modify: `tests/concurrency-block.test.js` (add codegen tests)

The codegen emits:
- `concurrent { a = spawn foo(); b = spawn bar() }` → async IIFE that awaits `Promise.all` with runtime bridge or pure JS fallback
- Each `spawn` becomes an async task in the array
- Results are destructured back into the assigned variable names

For Phase 2, we use **Promise-based execution** as the primary path. Each spawned function call becomes a `Promise` entry in a `Promise.all([...])`. If the native runtime bridge is available, we use `__tova_runtime.spawnTask()` for numeric tasks; otherwise pure `Promise` is the fallback.

The generated code shape:

```javascript
// Input:  concurrent { a = spawn foo(1); b = spawn bar(2) }
// Output:
const [__c0, __c1] = await Promise.all([
  (async () => { try { return new Ok(foo(1)); } catch(__e) { return new Err(__e); } })(),
  (async () => { try { return new Ok(bar(2)); } catch(__e) { return new Err(__e); } })(),
]);
const a = __c0;
const b = __c1;
```

**Step 1: Write the failing test**

Add to `tests/concurrency-block.test.js`:

```javascript
import { compile } from '../src/compiler.js';

function compileCode(code) {
    const result = compile(code, { filename: 'test.tova' });
    // For module mode (no blocks), the shared output is what we want
    return result.shared || result.code || '';
}

describe('concurrency codegen', () => {
    test('concurrent block generates Promise.all', () => {
        const code = compileCode(`
            fn foo() -> Int { 42 }
            fn main() {
                concurrent {
                    a = spawn foo()
                    b = spawn foo()
                }
            }
        `);
        expect(code).toContain('Promise.all');
    });

    test('spawn wraps in Result (try/catch)', () => {
        const code = compileCode(`
            fn foo() -> Int { 42 }
            fn main() {
                concurrent {
                    a = spawn foo()
                }
            }
        `);
        // Result wrapping: Ok on success, Err on catch
        expect(code).toContain('Ok(');
        expect(code).toContain('Err(');
    });

    test('concurrent block assigns results to variables', () => {
        const code = compileCode(`
            fn foo() -> Int { 42 }
            fn main() {
                concurrent {
                    a = spawn foo()
                    b = spawn foo()
                }
            }
        `);
        // Variables should be assigned from the Promise.all result
        expect(code).toContain('const a =');
        expect(code).toContain('const b =');
    });

    test('fire-and-forget spawn (no assignment)', () => {
        const code = compileCode(`
            fn fire() { print("done") }
            fn main() {
                concurrent {
                    spawn fire()
                }
            }
        `);
        expect(code).toContain('Promise.all');
        // Should still be in the task list, just no variable assignment
    });

    test('concurrent with timeout generates timeout wrapper', () => {
        const code = compileCode(`
            fn foo() -> Int { 42 }
            fn main() {
                concurrent timeout(5000) {
                    a = spawn foo()
                }
            }
        `);
        // Should include a timeout mechanism
        expect(code).toContain('5000');
    });

    test('spawn standalone expression generates correctly', () => {
        const code = compileCode(`
            fn foo(n: Int) -> Int { n * 2 }
            fn main() {
                concurrent {
                    a = spawn foo(21)
                }
            }
        `);
        expect(code).toContain('foo(21)');
    });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/concurrency-block.test.js`
Expected: FAIL — ConcurrentBlock generates empty string (no codegen handler)

**Step 3: Implement the codegen**

In `src/codegen/base-codegen.js`, add a case in `generateStatement()` (in the switch around line 255):

After the `case 'DeferStatement'` line (around line 280), add:

```javascript
      case 'ConcurrentBlock': result = this.genConcurrentBlock(node); break;
```

In `genExpression()` (around line 307), add before the `default:` case:

```javascript
      case 'SpawnExpression': return this.genSpawnExpression(node);
```

Then add the implementation methods in the class body (after the existing statement generators):

```javascript
  genConcurrentBlock(node) {
    const lines = [];
    const tasks = [];
    const assignments = [];

    // Collect spawn tasks from body
    for (const stmt of node.body) {
      if (stmt.type === 'Assignment' && stmt.value && stmt.value.type === 'SpawnExpression') {
        const spawn = stmt.value;
        const callCode = `${this.genExpression(spawn.callee)}(${spawn.arguments.map(a => this.genExpression(a)).join(', ')})`;
        tasks.push(callCode);
        assignments.push(stmt.target?.name || stmt.name);
      } else if (stmt.type === 'ExpressionStatement' && stmt.expression && stmt.expression.type === 'SpawnExpression') {
        const spawn = stmt.expression;
        const callCode = `${this.genExpression(spawn.callee)}(${spawn.arguments.map(a => this.genExpression(a)).join(', ')})`;
        tasks.push(callCode);
        assignments.push(null); // fire-and-forget
      } else {
        // Non-spawn statement — generate normally
        lines.push(this.generateStatement(stmt));
      }
    }

    this._needsResultOption = true;

    if (tasks.length === 0) {
      return lines.join('\n');
    }

    // Generate Promise.all with Result wrapping
    const tempVars = tasks.map((_, i) => `__c${i}`);
    const taskExprs = tasks.map(call =>
      `(async () => { try { return new Ok(await ${call}); } catch(__e) { return new Err(__e); } })()`
    );

    if (node.mode === 'timeout' && node.timeout) {
      const timeoutMs = this.genExpression(node.timeout);
      lines.push(`${this.i()}const [${tempVars.join(', ')}] = await Promise.race([`);
      lines.push(`${this.i()}  Promise.all([`);
      for (let i = 0; i < taskExprs.length; i++) {
        lines.push(`${this.i()}    ${taskExprs[i]}${i < taskExprs.length - 1 ? ',' : ''}`);
      }
      lines.push(`${this.i()}  ]),`);
      lines.push(`${this.i()}  new Promise((_, reject) => setTimeout(() => reject(new Error('concurrent timeout')), ${timeoutMs}))`);
      lines.push(`${this.i()}]);`);
    } else {
      lines.push(`${this.i()}const [${tempVars.join(', ')}] = await Promise.all([`);
      for (let i = 0; i < taskExprs.length; i++) {
        lines.push(`${this.i()}  ${taskExprs[i]}${i < taskExprs.length - 1 ? ',' : ''}`);
      }
      lines.push(`${this.i()}]);`);
    }

    // Assign results to named variables
    for (let i = 0; i < assignments.length; i++) {
      if (assignments[i]) {
        this.declareVar(assignments[i]);
        lines.push(`${this.i()}const ${assignments[i]} = ${tempVars[i]};`);
      }
    }

    return lines.join('\n');
  }

  genSpawnExpression(node) {
    // Standalone spawn expression (not inside concurrent block codegen path)
    // This happens when spawn is used directly in an expression context
    const callCode = `${this.genExpression(node.callee)}(${node.arguments.map(a => this.genExpression(a)).join(', ')})`;
    return `(async () => { try { return new Ok(await ${callCode}); } catch(__e) { return new Err(__e); } })()`;
  }
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/concurrency-block.test.js`
Expected: All codegen tests pass

**Step 5: Run full test suite**

Run: `bun test`
Expected: All existing tests pass

**Step 6: Commit**

```bash
git add src/codegen/base-codegen.js tests/concurrency-block.test.js
git commit -m "feat: codegen for concurrent blocks — Promise.all with Result wrapping"
```

---

### Task 6: End-to-End Integration Test

**Files:**
- Modify: `tests/concurrency-block.test.js` (add E2E tests)

Verify that a complete Tova program with `concurrent` blocks compiles, runs, and produces correct results.

**Step 1: Write the E2E tests**

Add to `tests/concurrency-block.test.js`:

```javascript
import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

function runTova(code) {
    const tmpDir = join(__dirname, '..', '.tova-out', 'test-concurrent');
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    const tmpFile = join(tmpDir, 'test.tova');
    writeFileSync(tmpFile, code);
    try {
        const result = execFileSync(
            'bun',
            ['run', join(__dirname, '..', 'bin', 'tova.js'), 'run', tmpFile],
            { encoding: 'utf-8', timeout: 10000 }
        );
        return result.trim();
    } finally {
        try { unlinkSync(tmpFile); } catch (e) {}
    }
}

describe('concurrency E2E', () => {
    test('basic concurrent block runs both tasks', () => {
        const output = runTova(`
            fn double(n: Int) -> Int { n * 2 }

            async fn main() {
                concurrent {
                    a = spawn double(21)
                    b = spawn double(10)
                }
                match a {
                    Ok(v) => print(v)
                    Err(e) => print("err")
                }
                match b {
                    Ok(v) => print(v)
                    Err(e) => print("err")
                }
            }

            main()
        `);
        expect(output).toContain('42');
        expect(output).toContain('20');
    });

    test('concurrent with error returns Err result', () => {
        const output = runTova(`
            fn might_fail() -> Int {
                throw Error.new("oops")
            }

            fn succeed() -> Int { 42 }

            async fn main() {
                concurrent {
                    a = spawn might_fail()
                    b = spawn succeed()
                }
                match a {
                    Ok(v) => print("ok: " ++ str(v))
                    Err(e) => print("error caught")
                }
                match b {
                    Ok(v) => print("b: " ++ str(v))
                    Err(e) => print("b error")
                }
            }

            main()
        `);
        expect(output).toContain('error caught');
        expect(output).toContain('b: 42');
    });

    test('concurrent with multiple spawns all complete', () => {
        const output = runTova(`
            fn add(a: Int, b: Int) -> Int { a + b }

            async fn main() {
                concurrent {
                    r1 = spawn add(1, 2)
                    r2 = spawn add(10, 20)
                    r3 = spawn add(100, 200)
                }
                match r1 {
                    Ok(v) => print(v)
                    Err(_) => print("err")
                }
                match r2 {
                    Ok(v) => print(v)
                    Err(_) => print("err")
                }
                match r3 {
                    Ok(v) => print(v)
                    Err(_) => print("err")
                }
            }

            main()
        `);
        expect(output).toContain('3');
        expect(output).toContain('30');
        expect(output).toContain('300');
    });
});
```

**Step 2: Run E2E tests**

Run: `bun test tests/concurrency-block.test.js`
Expected: All tests pass including E2E

If E2E tests fail, debug the generated JS output. Common issues:
- `await` outside async function → the enclosing function must be `async`
- `Ok`/`Err` not available → ensure `_needsResultOption` flag is set
- Variable scoping → ensure `declareVar` is called for spawned result vars

**Step 3: Run full test suite**

Run: `bun test`
Expected: All tests pass, zero regressions

**Step 4: Commit**

```bash
git add tests/concurrency-block.test.js
git commit -m "feat: end-to-end tests for concurrent blocks and spawn expressions"
```

---

## Summary

| Task | Tests | Key Deliverable |
|------|-------|-----------------|
| 1 | 5 AST tests | `ConcurrentBlock` and `SpawnExpression` node types |
| 2 | 4 registry tests | Plugin registered, detection strategy set |
| 3 | 8 parser tests | `concurrent {}`, modes, `spawn` prefix, statement-level support |
| 4 | 4 analyzer tests | Scope tracking, spawn-outside-concurrent warning, empty block warning |
| 5 | 6 codegen tests | `Promise.all` with Result wrapping, timeout, variable assignment |
| 6 | 3 E2E tests | Full compile-and-run with correct output |

**Exit criteria for Phase 2:**
- `concurrent { a = spawn foo(); b = spawn bar() }` parses, analyzes, and compiles
- Both tasks execute concurrently via `Promise.all`
- Results are wrapped in `Result<T, Error>` (Ok on success, Err on exception)
- `spawn` outside `concurrent` emits warning
- All existing 7100+ tests pass (zero regressions)
- `concurrent timeout(ms) { ... }` generates timeout wrapper
- E2E test: compiled Tova program produces correct output
