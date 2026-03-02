# Contributing to Tova

Thank you for your interest in contributing to Tova. This document explains how to contribute effectively, what we expect from contributions, and how the development process works.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Architecture Overview](#architecture-overview)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Commit Conventions](#commit-conventions)
- [Issue Guidelines](#issue-guidelines)
- [RFC Process](#rfc-process)
- [Release Process](#release-process)
- [Getting Help](#getting-help)

---

## Getting Started

### Prerequisites

- **Bun** (latest stable) — Tova's runtime and test runner
- **Node.js** 18+ — for tooling compatibility
- **Git** — for version control

### Quick Setup

```bash
# Clone the repository
git clone https://github.com/tova-lang/tova-lang.git
cd tova-lang

# Install dependencies
bun install

# Run the full test suite
bun test

# Verify the CLI works
bun run bin/tova.js --version
```

If all tests pass, you're ready to contribute.

## Development Setup

### Repository Structure

```
tova-lang/
├── bin/                  # CLI entry point (tova.js)
├── src/
│   ├── lexer/            # Tokenizer
│   ├── parser/           # Parser + AST definitions
│   ├── analyzer/         # Static analysis + warnings
│   ├── codegen/          # Code generation (base, browser, server, edge)
│   ├── stdlib/           # Standard library (inline.js)
│   ├── runtime/          # Reactivity system
│   ├── lsp/              # Language Server Protocol implementation
│   └── diagnostics/      # Error formatting
├── tests/                # Test suite (100+ test files)
├── benchmarks/           # Performance benchmarks
├── editors/              # Editor integrations (VS Code)
├── docs/                 # VitePress documentation site
└── playground/           # Browser-based playground
```

### Key Commands

```bash
# Run all tests
bun test

# Run a specific test file
bun test tests/parser.test.js

# Run tests matching a pattern
bun test --grep "pattern matching"

# Compile a Tova file
bun run bin/tova.js build myfile.tova

# Start the dev server with watch mode
bun run bin/tova.js dev

# Start the REPL
bun run bin/tova.js repl

# Start the LSP server
bun run bin/tova.js lsp

# Run benchmarks
bash benchmarks/run_benchmarks.sh --quick
```

## Architecture Overview

Tova is a full-stack programming language that transpiles to JavaScript. The compiler pipeline is:

```
Source (.tova) → Lexer → Parser → Analyzer → CodeGenerator → JavaScript
```

### Compiler Stages

1. **Lexer** (`src/lexer/`) — Converts source text into tokens. Performance-critical; uses `substring()` over character concatenation.

2. **Parser** (`src/parser/`) — Converts tokens into an AST. Extensible via the `install*Parser()` plugin pattern (e.g., `installSecurityParser()`, `installEdgeParser()`).

3. **Analyzer** (`src/analyzer/`) — Static analysis pass. Validates semantics, emits warnings (unused variables, exhaustive match, type errors). Plugin-based like the parser.

4. **Code Generator** (`src/codegen/`) — Transforms AST into JavaScript. Multiple backends:
   - `base-codegen.js` — Shared generation logic
   - `browser-codegen.js` — Client-side (reactivity, JSX, scoped CSS)
   - `server-codegen.js` — Server-side (routes, RPC, models, OpenAPI)
   - `edge-codegen.js` — Edge/serverless (Cloudflare, Deno, Vercel, Lambda, Bun)
   - `wasm-codegen.js` — WebAssembly binary generation for `@wasm` functions

### Design Principles

- **Single-file architecture.** Each compiler stage lives in one primary file. This keeps the dependency graph simple and makes it easy to understand the full pipeline.
- **Plugin pattern.** Domain-specific features (security, CLI, edge, forms) use `install*()` functions that extend the parser/analyzer/codegen classes.
- **Zero runtime dependencies.** The compiler itself has no npm dependencies. The generated code is self-contained.
- **Performance matters.** We benchmark against Go and track regressions. Compiler optimizations (devirtualization, scalar replacement, map chain fusion) are expected to have tests and benchmarks.

## How to Contribute

### Types of Contributions

| Type | Difficulty | Good First Issue? |
|------|-----------|-------------------|
| Bug fixes | Varies | Yes (if well-scoped) |
| Documentation improvements | Low | Yes |
| Test coverage | Low-Medium | Yes |
| Error message improvements | Medium | Yes |
| Stdlib additions | Medium | Sometimes |
| Editor tooling (LSP, VS Code) | Medium | Sometimes |
| Compiler optimizations | High | No |
| New language features | High | No |

### Finding Work

1. **Check the issue tracker.** Look for issues labeled `good-first-issue`, `help-wanted`, or `bug`.
2. **Review open PRs.** Code review is a valuable contribution.
3. **Improve documentation.** If you found something confusing while getting started, fix the docs.
4. **Write tests.** If you find an edge case that isn't covered, add a test.

### Before Starting Work

For **small fixes** (typos, documentation, obvious bugs): just open a PR.

For **anything larger**: open an issue first to discuss the approach. This prevents wasted effort and ensures alignment with the project's direction.

For **new language features**: follow the [RFC Process](#rfc-process).

## Pull Request Process

### 1. Branch

Create a branch from `main`:

```bash
git checkout -b fix/match-guard-binding-scope
```

Use descriptive branch names with a type prefix:

- `fix/` — Bug fixes
- `feat/` — New features
- `perf/` — Performance improvements
- `docs/` — Documentation
- `test/` — Test additions
- `refactor/` — Refactoring (no behavior change)

### 2. Develop

- Write your code following the [Coding Standards](#coding-standards).
- Add or update tests for every behavioral change.
- Run the full test suite and ensure it passes.
- If you're adding a new feature, update relevant documentation.

### 3. Submit

Open a pull request against `main`. Your PR description should include:

- **What** the change does
- **Why** the change is needed (link to the issue if applicable)
- **How** it works (brief technical explanation for non-trivial changes)
- **Testing** — what tests you added or updated

### 4. Review

All PRs require at least one maintainer review. Expect feedback — this is normal and healthy. Common review areas:

- Correctness and edge cases
- Test coverage
- Performance implications
- Consistency with existing patterns
- Documentation

### 5. Merge

Once approved and CI passes, a maintainer will merge your PR. We use squash merges to keep the history clean.

### PR Checklist

Before submitting, verify:

- [ ] All tests pass (`bun test`)
- [ ] New functionality has tests
- [ ] No unrelated changes are included
- [ ] Code follows existing patterns and style
- [ ] Commit messages follow [conventions](#commit-conventions)
- [ ] Documentation is updated if needed
- [ ] No secrets or credentials are committed

## Coding Standards

### General

- **No unnecessary abstractions.** Don't create helpers for one-time operations. Three similar lines are better than a premature abstraction.
- **Match existing patterns.** Look at how similar features are implemented and follow the same approach. Consistency matters more than personal preference.
- **Performance-aware.** Avoid patterns that create unnecessary allocations, closures, or property lookups in hot paths.
- **No dead code.** Don't leave commented-out code, unused variables, or TODO comments that you don't plan to address in this PR.

### JavaScript Style

```javascript
// Use descriptive names
function generateSecurityMiddleware(config) { ... }  // good
function genSecMw(c) { ... }                          // bad

// Early returns over deep nesting
if (!node.body) return;
// ... rest of function

// Methods on the prototype, not standalone functions
// (follows the existing codegen class pattern)
genMatchExpression(node) { ... }

// String building: template literals for readability,
// array.join('') for performance-critical paths
```

### Adding New Syntax

If you're adding new syntax to the language, follow this checklist:

1. **AST node** — Define the node type in `src/parser/ast.js` (or a domain-specific `*-ast.js` file)
2. **Parser** — Add parsing logic, ideally via the `install*Parser()` plugin pattern
3. **Analyzer** — Add validation in the analyzer (or via `install*Analyzer()`)
4. **Codegen** — Add code generation in the appropriate codegen backend
5. **Tests** — Comprehensive tests covering happy paths, edge cases, and error cases
6. **Documentation** — Update the relevant docs page
7. **LSP** — Update completions/hover if applicable
8. **VS Code grammar** — Update `tova.tmLanguage.json` if new keywords are added

### Error Messages

Tova aims for Rust/Elm-quality error messages. When adding new warnings or errors:

- Include the source location (line and column)
- Show the relevant source code with carets pointing to the problem
- Explain what went wrong in plain language
- Suggest how to fix it when possible
- Use the warning codes convention: `W_DESCRIPTIVE_NAME`

## Testing

### Test Organization

Tests live in `tests/` and use Bun's built-in test runner:

```javascript
import { describe, test, expect } from 'bun:test';

describe('feature name', () => {
  test('specific behavior', () => {
    const result = compile(`tova source code`);
    expect(result).toContain('expected javascript output');
  });
});
```

### Test Categories

- **Unit tests** — Test individual compiler stages in isolation
- **Integration tests** — Compile full Tova programs and verify output
- **Regression tests** — `tests/bugfixes.test.js` for bugs that should never recur
- **Benchmark tests** — `benchmarks/` for performance regression detection

### Writing Good Tests

```javascript
// Test the specific behavior, not the implementation
test('match expression handles string concatenation patterns', () => {
  const result = compile(`
    match url {
      "/api" ++ rest => handle(rest)
      _ => notFound()
    }
  `);
  expect(result).toContain('startsWith("/api")');
});

// Test edge cases
test('empty match body produces warning', () => {
  const warnings = analyze(`match x {}`);
  expect(warnings).toContainEqual(
    expect.objectContaining({ code: 'W_EMPTY_MATCH' })
  );
});

// Regression tests reference the original bug
test('match guard can reference array pattern bindings (#142)', () => {
  // Previously, array pattern guards like [1, n] if n < 2
  // would reference n before it was declared
  const result = compile(`
    match arr {
      [1, n] if n < 2 => "small"
      _ => "other"
    }
  `);
  expect(result).not.toThrow();
});
```

### Running Tests

```bash
# Full suite (should always pass before submitting a PR)
bun test

# Specific file
bun test tests/parser.test.js

# With pattern matching
bun test --grep "security block"

# With verbose output
bun test --verbose
```

## Commit Conventions

We follow a simplified conventional commits format:

```
type: concise description of the change

Optional longer explanation of what and why (not how — the code shows how).

Fixes #123
```

### Types

| Type | When to Use |
|------|-------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `perf` | Performance improvement |
| `refactor` | Code change that doesn't fix a bug or add a feature |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Build process, CI, dependencies |

### Examples

```
feat: add string concatenation patterns to match expressions

fix: match guard can now reference array pattern bindings

perf: fuse chained Result.map calls at compile time

docs: add edge block deployment guide

chore: bump version to 0.8.3
```

### Rules

- Use imperative mood ("add feature" not "added feature")
- Don't capitalize the first word after the type
- No period at the end of the subject line
- Keep the subject line under 72 characters
- Reference issues when applicable

## Issue Guidelines

### Bug Reports

A good bug report includes:

1. **Tova version** (`tova --version`)
2. **Environment** (OS, Bun version)
3. **Minimal reproduction** — the smallest Tova program that triggers the bug
4. **Expected behavior** — what you expected to happen
5. **Actual behavior** — what actually happened (include error messages)

```markdown
**Tova version:** 0.8.3
**Environment:** macOS 14, Bun 1.1.x

**Reproduction:**
\```tova
match items {
  [first, ...rest] if len(rest) > 0 => process(rest)
  _ => done()
}
\```

**Expected:** Compiles and runs correctly
**Actual:** ReferenceError: rest is not defined (at runtime)
```

### Feature Requests

Before requesting a feature:

1. Check if it already exists in the docs
2. Search existing issues for duplicates
3. Consider whether it aligns with Tova's design philosophy

A good feature request explains the **problem** you're trying to solve, not just the solution you want. Show the code you wish you could write.

## RFC Process

Significant changes to the language require an RFC (Request for Comments). This includes:

- New syntax or keywords
- Changes to existing language semantics
- New compiler backends or targets
- Major standard library additions
- Changes to the type system

### How to Submit an RFC

1. Open an issue titled `RFC: <feature name>`
2. Include:
   - **Motivation** — Why is this needed?
   - **Design** — How would it work? Show example Tova code.
   - **Alternatives** — What other approaches did you consider?
   - **Trade-offs** — What are the downsides?
   - **Implementation** — High-level plan for how to build it
3. Allow at least 2 weeks for community discussion
4. A maintainer will make the final decision, incorporating feedback

### What Doesn't Need an RFC

- Bug fixes
- Performance improvements to existing features
- Documentation
- Test improvements
- Refactoring that doesn't change behavior
- Small quality-of-life improvements

## Release Process

Tova follows semantic versioning (`MAJOR.MINOR.PATCH`):

- **PATCH** (0.8.x) — Bug fixes, documentation, performance improvements
- **MINOR** (0.x.0) — New features, non-breaking additions
- **MAJOR** (x.0.0) — Breaking changes (rare pre-1.0, reserved for post-1.0)

Releases are automated via CI when a version tag is pushed. The release workflow builds binaries for all supported platforms and publishes to npm.

## Getting Help

- **GitHub Issues** — For bugs and feature requests
- **GitHub Discussions** — For questions and community conversation
- **Documentation** — https://tova-lang.org

### Tips for Getting Good Answers

- Show what you've already tried
- Include the minimal code to reproduce your issue
- Specify your environment (OS, Bun version, Tova version)
- Be specific about what you expected vs. what happened

---

## Recognition

All contributors are valued. We recognize contributions in release notes and maintain a contributors list. Every merged PR counts — whether it's a one-line typo fix or a major feature.

Thank you for helping build Tova.
