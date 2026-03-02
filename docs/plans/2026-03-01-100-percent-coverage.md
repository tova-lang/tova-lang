# 100% Line Coverage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Achieve and enforce 100% line coverage across all 102 source files in the Tova compiler.

**Architecture:** Systematically write tests for every uncovered line, organized by module. Each task creates one test file targeting one or more related source files. Tests use Bun's test runner with `describe`/`test`/`expect`. Coverage verified with `bun test --coverage`.

**Tech Stack:** Bun test runner, Bun built-in coverage (`--coverage`), existing compiler infrastructure (Lexer, Parser, Analyzer, CodeGenerator classes)

**Baseline:** 91.07% lines, 90.54% functions, 8082 tests pass, 0 fail

---

### Task 1: Lexer + Tokens (99.24% -> 100%)

**Files:**
- Test: `tests/lexer-100.test.js`
- Target: `src/lexer/lexer.js` (lines 776-782)

**What's uncovered:** Template literal dedenting — maps over text parts and removes leading whitespace proportional to minimum indentation.

**Step 1: Write test**

```javascript
import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';

describe('Lexer 100% coverage', () => {
  test('template literal dedenting with indented multiline strings', () => {
    const source = '`\n    hello\n    world\n  `';
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const tpl = tokens.find(t => t.type === 'TEMPLATE_LITERAL' || t.type === 'STRING');
    expect(tpl).toBeDefined();
  });

  test('template literal with mixed indentation', () => {
    const source = '`\n      line1\n    line2\n      line3\n    `';
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    expect(tokens.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run and verify**
```bash
bun test tests/lexer-100.test.js --coverage
```
Expected: 100% on lexer.js

**Step 3: Commit**
```bash
git add tests/lexer-100.test.js && git commit -m "test: lexer 100% line coverage"
```

---

### Task 2: Analyzer Core (92.19% -> 100%)

**Files:**
- Test: `tests/analyzer-100.test.js`
- Target: `src/analyzer/analyzer.js` (~250 uncovered lines)

**What's uncovered (grouped by category):**

1. **Array method type inference** (550-565): flat_map/flatMap/flatten return types
2. **User-defined function return type lookup** (577-584): scope lookup for return types
3. **Union type compatibility** (684-685): splitting union by `|` and checking members
4. **YieldExpression visitor** (916-917): visiting yield arguments
5. **SQL visitors** (937-940): ColumnAssignment, NegatedColumnExpression
6. **Concurrent block validation** (1039-1048): unknown mode warnings, timeout validation
7. **Spawn expression extraction** (1073-1074, 1085): ExpressionStatement spawn
8. **CLI + Server conflict** (1159-1163): warning when both blocks exist
9. **typeof type narrowing** (2082-2086): string/number/boolean/function narrowing
10. **Nil stripping from types** (2099-2128, 2146, 2156-2170): Option/union nil removal
11. **Loop scope management** (2226-2233): child scope with label
12. **Numeric operator errors** (2308): increment/decrement on non-numeric
13. **Lambda return warning** (2464): missing return in typed lambda
14. **Exhaustiveness disambiguation** (2592-2615, 2644, 2658-2696): multiple type candidates
15. **Array/Tuple pattern visitor** (2733-2739): pattern element visiting
16. **Type parameter binding** (2940-2977, 3002-3024): generic type inference
17. **String concat type checking** (3038-3039): validates both sides are String
18. **Trait validation** (3205-3214): missing method, param count, return type mismatch
19. **DeferStatement visitor** (3308-3327): validates defer inside function scope

**Step 1: Write test file** targeting each category above. Each test should parse+analyze Tova source that exercises the uncovered path.

Pattern for each test:
```javascript
import { describe, test, expect } from 'bun:test';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';
import { Analyzer } from '../src/analyzer/analyzer.js';

function analyze(src) {
  const lexer = new Lexer(src);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, src);
  const ast = parser.parse();
  const analyzer = new Analyzer(ast, src);
  return analyzer.analyze();
}

describe('Analyzer 100% coverage', () => {
  // 1. flat_map/flatten type inference
  test('flat_map return type inference', () => {
    const { warnings } = analyze('fn foo(xs: [Int]) -> [Int] { xs.flat_map(fn(x) [x, x + 1]) }');
    // Should not error - flat_map recognized
  });

  // 2. yield expression
  test('yield expression visitor', () => {
    const { warnings } = analyze('fn foo() { yield 42 }');
    expect(warnings).toBeDefined();
  });

  // ... one test per uncovered category
});
```

**Step 2: Run** `bun test tests/analyzer-100.test.js --coverage`

**Step 3: Iterate** — check uncovered lines, add tests until analyzer.js shows 100%

**Step 4: Commit** `git commit -m "test: analyzer 100% line coverage"`

---

### Task 3: Analyzer Satellite Files (form-analyzer, scope, browser-analyzer, server-analyzer, deploy-analyzer, types, type-registry)

**Files:**
- Test: `tests/analyzer-satellites-100.test.js`
- Targets:
  - `src/analyzer/form-analyzer.js` (48.89% -> 100%): form outside browser, duplicate form, group/array/steps visitors
  - `src/analyzer/scope.js` (61.54% -> 100%): binary search in _findScopeIndexed, child sorting
  - `src/analyzer/browser-analyzer.js` (86.21% -> 100%): JSXFor/JSXMatch visitors, component error handling
  - `src/analyzer/server-analyzer.js` (93.72% -> 100%): lifecycle hooks, subscribe, schedule error handling
  - `src/analyzer/deploy-analyzer.js` (83.87% -> 100%): unknown field validation
  - `src/analyzer/types.js` (96.49% -> 100%): array/tuple/record/generic/function/union/intersection type checks
  - `src/analyzer/type-registry.js` (93.10% -> 100%): type member collection

**Pattern:** Parse+analyze Tova source that triggers each uncovered path. For form-analyzer, test forms outside browser blocks, duplicate definitions, etc.

---

### Task 4: Base Codegen (95.43% -> 100%)

**Files:**
- Test: `tests/base-codegen-100.test.js`
- Target: `src/codegen/base-codegen.js` (~190 uncovered lines)

**What's uncovered:**
1. `_genIfStatementWithAssigns()` (1122-1139): conditional assignment to target variable
2. Template literal interpolation escaping (2085-2086)
3. Named argument handling for column expressions (2241-2246)
4. `_genIfReturn()` (2754-2771): if/else chains with return statements
5. Array pattern binding generation (2974-2977)
6. Parameter type annotation formatting (3101-3103)
7. `genDeferStatement()` (3306-3309)
8. `genSpawnExpression()` (3717-3720): async spawn with try/catch wrapping
9. `_walkExpressions()` (4081-4125): AST traversal for all expression types
10. `_walkStatementExpressions()` (4133-4185): statement-level expression traversal

**Pattern:** Compile Tova source and verify output contains expected JS patterns.
```javascript
import { compile } from '../src/index.js';

function compileToJS(src) {
  return compile(src, { target: 'node' });
}

test('defer statement generates try/finally', () => {
  const js = compileToJS('fn foo() { defer println("done"); bar() }');
  expect(js).toContain('finally');
});
```

---

### Task 5: Server Codegen (94.75% -> 100%)

**Files:**
- Test: `tests/server-codegen-100.test.js`
- Target: `src/codegen/server-codegen.js` (~200 uncovered lines)

**What's uncovered:**
1. Type validation for Int/Float/Bool in request bodies (124-131)
2. Cache control helper generation (1660-1665)
3. SQL type mapping (1732-1736)
4. Database health check queries (2186-2188)
5. Array body type validation (2402-2424)
6. Query parameter validation for Float/Bool (2459-2463)
7. SSE streaming (2564-2591)
8. API versioning headers (2595-2619)
9. OpenAPI schema generation: array body, primitive body, path params, response (2633-2776)
10. API versions endpoint (2840-2860)
11. TLS CA certificate config (3506)
12. Test block hooks: beforeEach, afterEach, test cases (3666-3705, 3764-3765)

**Pattern:** Compile server blocks with specific features and check generated JS.

---

### Task 6: Browser Codegen (93.96% -> 100%)

**Files:**
- Test: `tests/browser-codegen-100.test.js`
- Target: `src/codegen/browser-codegen.js` (~100 uncovered lines)

**What's uncovered:**
1. `_containsRPC()` for complex expressions (37-86): IfExpr, MatchExpr, TryCatch, Pipe, Guard, destructuring
2. Lambda with RPC/propagate/compound assignment (140-185)
3. Pseudo-element CSS scoping (550)
4. Component param prop accessors (574-575)
5. Form/Store generation in components (626-627)
6. `_exprReadsSignal()` comprehensive checking (1058-1074)
7. JSXMatch element rendering (1103)
8. Slot element handling: named, scoped, default (1122-1126)
9. CSS class/style binding merging (1329-1333)
10. JSXFor keyed rendering (1598-1599)
11. JSXMatch pattern compilation (1643-1675)
12. Fragment generation (1679-1680)

---

### Task 7: Edge + CLI + Security + Deploy + Form Codegen

**Files:**
- Test: `tests/codegen-satellites-100.test.js`
- Targets:
  - `src/codegen/edge-codegen.js` (97.76% -> 100%): security CSP, binding stubs, CORS merging, R2 buckets
  - `src/codegen/cli-codegen.js` (99.22% -> 100%): type coercion (line 333)
  - `src/codegen/form-codegen.js` (82.55% -> 100%): all validators (minLength/maxLength/min/max/pattern/email/matches/validate), condition guards, custom validators
  - `src/codegen/deploy-codegen.js` (100% funcs but check)
  - `src/codegen/security-codegen.js` (99.69% -> 100%)

---

### Task 8: WASM Codegen (2.35% -> 100%)

**Files:**
- Test: `tests/wasm-codegen-100.test.js`
- Target: `src/codegen/wasm-codegen.js` (~600 uncovered lines — nearly entire file)

**What's uncovered:** The entire WASM binary generation pipeline:
- LEB128 encoding, string/section/F64 encoding
- Type mapping (Tova -> WASM types)
- Module building (type/function/export/code sections)
- Statement compilation (var decl, assignment, if, while, return)
- Expression compilation (binary ops, unary, calls, identifiers, literals)
- Type inference
- Glue code generation

**Pattern:** Use `@wasm` annotated functions and verify WASM compilation:
```javascript
import { compileWasmFunction, compileWasmModule } from '../src/codegen/wasm-codegen.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

function parseFunction(src) {
  const lexer = new Lexer(src);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, src);
  const ast = parser.parse();
  return ast.body[0]; // FunctionDeclaration
}

test('compiles simple addition', () => {
  const fn = parseFunction('fn add(a: Int, b: Int) -> Int { a + b }');
  const bytes = compileWasmFunction(fn);
  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(bytes[0]).toBe(0x00); // magic
});
```

---

### Task 9: Parser Satellites

**Files:**
- Test: `tests/parser-satellites-100.test.js`
- Targets:
  - `src/parser/browser-parser.js` (66.87% -> 100%): JSX fragments, fragment children, JSXMatch, deprecated 'client' keyword
  - `src/parser/concurrency-parser.js` (91.72% -> 100%): spawn without args, select cases, send case validation
  - `src/parser/server-parser.js` (96.32% -> 100%): route group versioning, middleware body
  - `src/parser/edge-parser.js` (95.38% -> 100%): named blocks, binding config, storage/queue
  - `src/parser/deploy-parser.js` (94.38% -> 100%): name requirement, error handling
  - `src/parser/form-parser.js` (96.71% -> 100%): field/group/array parsing
  - `src/parser/cli-parser.js` (94.85% -> 100%): error handling, config fields
  - `src/parser/security-parser.js` (99.17% -> 100%): config key validation
  - `src/parser/browser-ast.js` (96.23% -> 100%): JSXMatch node constructor

---

### Task 10: Formatter (49.67% -> 100%)

**Files:**
- Test: `tests/formatter-100.test.js`
- Target: `src/formatter/formatter.js` (~280 uncovered lines)

**What's uncovered:** Formatter for ~40 AST node types:
- Statements: guard, interface, impl, trait, defer, try/catch/finally, for-else
- Expressions: regex, template literal, optional chain, spread, propagate, await, yield, tuple, named arg, membership
- Blocks: server, browser, shared
- Declarations: type variants, type alias, import default
- Patterns: all match patterns, destructuring
- Lambda, match arms with guards, if expressions, multi-line arrays, object literals

**Pattern:** Parse Tova source to AST, then format and verify output:
```javascript
import { TovFormatter } from '../src/formatter/formatter.js';
import { Lexer } from '../src/lexer/lexer.js';
import { Parser } from '../src/parser/parser.js';

function format(src) {
  const lexer = new Lexer(src);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, src);
  const ast = parser.parse();
  const formatter = new TovFormatter();
  return formatter.format(ast);
}

test('formats guard statement', () => {
  const result = format('fn foo(x: Int) { guard x > 0 else { return } }');
  expect(result).toContain('guard');
});
```

---

### Task 11: Reactivity Runtime (72.18% -> 100%)

**Files:**
- Test: `tests/reactivity-100.test.js`
- Target: `src/runtime/reactivity.js` (~680 uncovered lines — largest file)

**What's uncovered (major categories):**
1. Flush loop infinite iteration detection (38-40)
2. createComputed ownership/dispose (303-307)
3. Watch dispose fallback (406-409)
4. ErrorBoundary: handleError, resetBoundary, fallback render, onErrorCleared (490-607)
5. Suspense: register, resolve, fallback (658-674)
6. Head element cleanup (805)
7. CSP nonce detection (917-918)
8. CSS style cleanup with ref counting (950)
9. Transition CSS generation for all types (982-1019)
10. Enter/leave transition application (1081-1144)
11. Marker content disposal/ownership (1180-1267)
12. Dynamic rendering fallback (1334-1337, 1399-1414)
13. Portal cleanup (1444-1451)
14. Action directives (use:) (1478-1502)
15. Event handler options (capture/passive) (1520-1524)
16. Event handler updates on prop changes (1589-1652)
17. Keyed reconciliation with fragments (1743-1762)
18. Keyed children reconciliation with LIS (1832-1890)
19. Positional children append/remove (1905-1912)
20. Single node patching (1929-1994, 2005-2009)
21. Hydration mismatch detection (2035-2044)
22. SSR marker content collection (2065-2066)
23. VNode hydration (text, arrays, fragments, elements) (2081-2159)
24. Hydration event handlers/reactive props (2195-2205)
25. Progressive hydration (hydrateWhenVisible) (2281-2299)

**Note:** Many of these require a mock DOM environment. Use Bun's built-in happy-dom or mock DOM nodes manually.

---

### Task 12: Runtime Satellites (testing, router, rpc, db, devtools, ssr, ai)

**Files:**
- Test: `tests/runtime-satellites-100.test.js`
- Targets:
  - `src/runtime/testing.js` (33.33% -> 100%): fireEvent (input/change/submit/focus/blur/keyDown/keyUp/mouseEnter/mouseLeave), _dispatchEvent, waitForEffect, cleanup, findByText, walkNodes, getDirectText, serializeNode
  - `src/runtime/router.js` (80.68% -> 100%): navigation hooks, Outlet/Redirect, query parsing, 404, popstate
  - `src/runtime/rpc.js` (75.22% -> 100%): CSRF token, request/response/error interceptors, timeout
  - `src/runtime/db.js` (72.37% -> 100%): WAL mode, postgres query/execute/transaction, lazy init
  - `src/runtime/devtools.js` (86.83% -> 100%): component tracking, getComponentTree, getOwnershipTree
  - `src/runtime/ssr.js` (87.89% -> 100%): Suspense fallback, streaming, void elements, fragments
  - `src/runtime/ai.js` (81.30% -> 100%): classify fallback, tool formatting, Ollama embedding/classify

---

### Task 13: Stdlib + Config Satellites

**Files:**
- Test: `tests/stdlib-config-100.test.js`
- Targets:
  - `src/stdlib/runtime-bridge.js` (71.13% -> 100%): availability checks, module loading, error paths
  - `src/stdlib/functional.js` (85.71% -> 100%): debounce, throttle
  - `src/stdlib/core.js` (97.41% -> 100%): min/max array ops
  - `src/stdlib/datetime.js` (93.15% -> 100%): date parsing error, months/years ago
  - `src/config/git-resolver.js` (36.47% -> 100%): listRemoteTags, fetchModule, getCommitSha (mock child_process)
  - `src/config/resolver.js` (81.25% -> 100%): constraint merging, version conflict
  - `src/config/resolve.js` (88.54% -> 100%): npm dependency normalization
  - `src/config/search.js` (63.64% -> 100%): GitHub API search (mock fetch)
  - `src/config/package-json.js` (63.89% -> 100%): generation/writing, detection
  - `src/config/toml.js` (95.63% -> 100%): quoted keys, missing values, unclosed arrays
  - `src/config/semver.js` (91.23% -> 100%): greater-than constraint
  - `src/deploy/deploy.js` (94.57% -> 100%): feature aggregation, formatting
  - `src/deploy/infer.js` (95.27% -> 100%): version conflict, transitive deps
  - `src/diagnostics/formatter.js` (86.93% -> 100%): error location fallback, bracket hints

---

### Task 14: LSP + Docs

**Files:**
- Test: `tests/lsp-docs-100.test.js`
- Targets:
  - `src/lsp/server.js` (90.90% -> 100%): crash recovery, JSON-RPC, debounced validation, document close/save, completion filtering, symbol collection, go-to-def, signature help
  - `src/docs/generator.js` (76.75% -> 100%): type variant docs, function signatures, docstring parsing, markdown rendering

---

### Task 15: CI Coverage Gate

**Files:**
- Modify: `package.json`

**Step 1: Add coverage scripts**

Add to package.json scripts:
```json
{
  "test:coverage": "bun test --coverage --coverage-reporter=text",
  "test:coverage:lcov": "bun test --coverage --coverage-reporter=lcov --coverage-dir=coverage"
}
```

**Step 2: Create coverage check script**

Create `scripts/check-coverage.sh`:
```bash
#!/bin/bash
set -e
OUTPUT=$(bun test --coverage 2>&1)
echo "$OUTPUT" | tail -5

# Check if any file is below 100%
if echo "$OUTPUT" | grep -E '\|\s+[0-9]{1,2}\.[0-9]+' | grep -v '| 100.00'; then
  echo "FAIL: Not all files at 100% coverage"
  exit 1
fi

echo "PASS: All files at 100% line coverage"
```

**Step 3: Commit**
```bash
git add package.json scripts/check-coverage.sh
git commit -m "ci: add 100% line coverage enforcement gate"
```

---

## Execution Order

Tasks 1-14 are **independent** and can be executed in parallel by subagents. Task 15 should run last after all coverage is at 100%.

**Recommended parallelization groups:**
- Group A: Tasks 1, 2, 3 (Lexer + Analyzer family)
- Group B: Tasks 4, 5, 6, 7 (Codegen family)
- Group C: Tasks 8, 9, 10 (WASM + Parser + Formatter)
- Group D: Tasks 11, 12, 13, 14 (Runtime + Stdlib + Config + LSP)
- Final: Task 15 (CI gate)

## Verification

After all tasks complete:
```bash
bun test --coverage 2>&1 | grep "All files"
```
Expected: `All files | 100.00 | 100.00 |`
