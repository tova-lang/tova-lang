---
title: Contributing
---

# Contributing

This guide covers the Tova project architecture, how to add new language features, and how to contribute effectively.

## Project Architecture

Tova is a full-stack language that transpiles to JavaScript. The compiler is a four-stage pipeline:

```
Source Code (.tova)
    |
    v
  Lexer        -->  Tokens
    |
    v
  Parser       -->  AST (Abstract Syntax Tree)
    |
    v
  Analyzer     -->  Validated AST + Warnings
    |
    v
  CodeGenerator --> JavaScript (server.js, client.js, shared.js)
```

Each stage is a separate module in `src/`:

| Stage | Location | Purpose |
|-------|----------|---------|
| Lexer | `src/lexer/` | Tokenizes source code into a token stream |
| Parser | `src/parser/` | Parses tokens into an AST |
| Analyzer | `src/analyzer/` | Validates the AST, checks types, reports warnings |
| Code Generator | `src/codegen/` | Transforms the AST into JavaScript output |

## Source Layout

```
tova-lang/
  bin/
    tova.js                  # CLI entry point (all commands)
  src/
    lexer/
      lexer.js              # Tokenizer
      tokens.js             # Token type definitions
    parser/
      parser.js             # Recursive descent parser
    analyzer/
      analyzer.js           # Semantic analysis, type checking
    codegen/
      codegen.js            # Main code generator (orchestrator)
      base-codegen.js       # Shared gen* methods for all targets
      client-codegen.js     # Client-side code generation (reactivity, JSX)
      server-codegen.js     # Server-side code generation (routes, models)
    runtime/
      reactivity.js         # Reactive state system (state, computed, effect)
      rpc.js                # Client-to-server RPC infrastructure
      router.js             # Client-side URL routing
      string-proto.js       # String prototype extensions
    lsp/
      server.js             # Language Server Protocol implementation
    stdlib/
      inline.js             # Standard library (single source of truth)
    formatter/
      formatter.js          # Code formatter (AST pretty-printer)
    diagnostics/
      formatter.js          # Rich error message formatting
    index.js                # Public API exports
  tests/                    # Test suites (34 files, 3338 tests)
  editors/
    vscode/                 # VS Code extension
      extension.js          # LSP client
      syntaxes/             # TextMate grammar
      package.json          # Extension manifest
```

## How to Add a New Language Feature

Adding a new feature to Tova involves changes across all four pipeline stages, plus tests. Here is the workflow:

### 1. Add Token(s)

In `src/lexer/tokens.js`, define any new token types:

```javascript
// In TokenType enum
GUARD: 'GUARD',
```

In `src/lexer/lexer.js`, add the keyword mapping:

```javascript
// In the keywords map
'guard': TokenType.GUARD,
```

### 2. Define AST Node(s)

In `src/parser/parser.js`, add parsing logic that produces the new AST node. Tova uses a recursive descent parser:

```javascript
// Example: parsing a guard clause
parseGuard() {
  this.expect(TokenType.GUARD);
  const condition = this.parseExpression();
  this.expect(TokenType.ELSE);
  const body = this.parseBlock();
  return {
    type: 'GuardClause',
    condition,
    body,
    line: this.currentLine(),
    column: this.currentColumn(),
  };
}
```

Integrate the new parse method into the appropriate parsing context (e.g., `parseStatement`, `parseExpression`).

### 3. Analyze

In `src/analyzer/analyzer.js`, add validation for the new node type:

```javascript
// In the node visitor/switch
case 'GuardClause':
  this.analyzeExpression(node.condition);
  this.analyzeBlock(node.body);
  break;
```

Add any semantic checks: type validation, scope rules, exhaustiveness, etc.

### 4. Generate Code

In `src/codegen/base-codegen.js` (for shared logic) or the target-specific generators:

```javascript
// In the code generation visitor
genGuardClause(node) {
  const cond = this.genExpression(node.condition);
  const body = this.genBlock(node.body);
  return `if (!(${cond})) ${body}`;
}
```

Update both `client-codegen.js` and `server-codegen.js` if the feature behaves differently in each context.

### 5. Add Tests

Write comprehensive tests covering:

- **Lexer**: Token recognition
- **Parser**: AST structure
- **Analyzer**: Validation and warnings
- **Code generation**: Correct JavaScript output
- **Integration**: End-to-end compilation and execution

Place tests in the `tests/` directory following the existing naming conventions.

## Running Tests

Tova uses Bun's built-in test runner:

```bash
# Run all tests
bun test

# Run a specific test file
bun test tests/parser.test.js

# Run tests matching a pattern
bun test --filter "guard"
```

The full test suite has 3338 tests across 34 test files with 0 failures. All tests must pass before merging.

## Code Style

- **Language**: JavaScript with ES modules (`import`/`export`)
- **Runtime**: Bun (not Node.js)
- **No build step**: Source files are executed directly by Bun
- **Naming**: camelCase for functions and variables, PascalCase for classes
- **Error handling**: Use the `DiagnosticFormatter` for user-facing error messages with source context and caret markers

## Key Conventions

### AST Nodes

Every AST node includes `line` and `column` properties for error reporting:

```javascript
{
  type: 'FunctionDeclaration',
  name: 'greet',
  params: [{ name: 'name', type: 'Identifier' }],
  body: { ... },
  line: 5,
  column: 1,
}
```

### Code Generation

The code generator produces separate outputs for different targets:

```javascript
{
  shared: '// shared JavaScript...',
  server: '// server JavaScript...',
  client: '// client JavaScript...',
  test: '// test JavaScript...',
  servers: { api: '...', events: '...' },  // named blocks
  clients: { ... },
  multiBlock: true,
}
```

### Diagnostics

Use the rich error formatter for user-facing messages:

```javascript
import { DiagnosticFormatter } from '../diagnostics/formatter.js';

const formatter = new DiagnosticFormatter(source, filename);
console.warn(formatter.formatWarning(message, { line, column }));
```

This produces Rust/Elm-style error messages with source context and caret markers.

## Filing Issues

When filing an issue, include:

- A minimal `.tova` code sample that reproduces the problem
- The expected behavior
- The actual behavior (error message, incorrect output, etc.)
- Your Bun version (`bun --version`)

## Pull Requests

1. Fork the repository and create a feature branch
2. Make your changes following the code style guidelines
3. Add tests for new functionality
4. Run `bun test` and ensure all 3338+ tests pass
5. Submit a pull request with a clear description of the changes

Keep pull requests focused on a single feature or fix. Large changes should be broken into smaller, reviewable PRs.
