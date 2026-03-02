# 100% Line Coverage Hardening

**Date**: 2026-03-01
**Goal**: Achieve and enforce 100% line coverage across all 102 source files in the Tova compiler.

## Baseline

- **Current coverage**: 91.07% lines, 90.54% functions (8073 tests pass, 9 fail)
- **Coverage tool**: Bun built-in `--coverage` with `text` and `lcov` reporters
- **Estimated uncovered lines**: ~3,700 across 102 files

## Phases

### Phase 1: Fix Failing Tests
Fix 9 currently failing tests. Accurate coverage requires a green suite.

### Phase 2: Core Compiler Pipeline
Lexer (99.24%), Parser (100%), Analyzer (92.19%), Base Codegen (95.43%), Server Codegen (94.75%), Browser Codegen (93.96%). ~740 uncovered lines total.

### Phase 3: Critical Gaps (<50% coverage)
- wasm-codegen.js (2.35%) — 600 lines
- testing.js (33.33%) — 160 lines
- git-resolver.js (36.47%) — 80 lines
- form-analyzer.js (48.89%) — 55 lines
- formatter.js (49.67%) — 280 lines

### Phase 4: Major Gaps (50-80%)
- reactivity.js (72.18%) — 680 lines (largest file)
- browser-parser.js (66.87%) — 200 lines
- scope.js (61.54%) — 70 lines
- runtime-bridge.js (71.13%) — 44 lines
- db.js (72.37%), rpc.js (75.22%), router.js (80.68%)

### Phase 5: Moderate Gaps (80-99%)
All remaining files with <100% coverage.

### Phase 6: CI Gate
Enforce 100% line coverage threshold in test scripts.

## Testing Strategy
- Unit tests for pure functions (lexer, parser, AST)
- Integration tests for codegen (compile + verify output)
- Mock-based tests for runtime (db, rpc, router)
- New files: `tests/<module>-coverage-100.test.js`

## Success Criteria
- `bun test --coverage` reports 100.00% lines for every source file
- CI gate prevents coverage regression
