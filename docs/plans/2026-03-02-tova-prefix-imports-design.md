# `tova:` and `@/` Import Prefixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `tova:` prefix for runtime module imports and `@/` prefix for project-root-relative imports, eliminating fragile relative paths in user code.

**Architecture:** Two new import prefix handlers in `compileWithImports()` and `mergeDirectory()` in `bin/tova.js`. `tova:xxx` rewrites to `./runtime/xxx.js` in the generated output. `@/path` resolves to `<srcDir>/path.tova`, compiles it, and rewrites to the correct relative `.js` path. No parser, AST, codegen, or analyzer changes needed — import sources are just strings.

**Tech Stack:** Bun, Node.js path resolution (`path.resolve`, `path.relative`)

---

### Task 1: Tests for `tova:` runtime imports

**Files:**
- Modify: `tests/module-system.test.js` (append new describe block)

**Step 1: Write failing tests for `tova:` prefix**

Add to the end of `tests/module-system.test.js`.

**Step 2: Run tests to verify they fail**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/module-system.test.js`
Expected: Parser tests PASS (parser already preserves any string), codegen tests FAIL (no rewriting yet)

---

### Task 2: Implement `tova:` prefix rewriting in codegen

**Files:**
- Modify: `src/codegen/base-codegen.js` (the `genImport`, `genImportDefault`, `genImportWildcard` methods)

**Step 3: Add `_rewriteImportSource` helper to BaseCodegen**

Rewrites `tova:xxx` → `./runtime/xxx.js` on the `node.source` before codegen emits. Call as first line in genImport, genImportDefault, genImportWildcard.

**Step 4: Run tests to verify they pass**

**Step 5: Run full test suite to check no regressions**

---

### Task 3: Tests for `@/` project root imports

**Files:**
- Modify: `tests/module-system.test.js` (append new describe block)

**Step 6: Write failing tests for `@/` prefix**

Parser tests + integration test with real files on disk.

**Step 7: Run tests**

---

### Task 4: Implement `@/` and `tova:` resolution in compileWithImports and mergeDirectory

**Files:**
- Modify: `bin/tova.js` (`compileWithImports` import loop + `mergeDirectory` import loop)

**Step 8: Add `tova:` handling** — rewrite to `./runtime/xxx.js`, continue (no compilation needed)

**Step 9: Add `@/` handling** — resolve to absolute path from srcDir, rewrite to relative, fall through to .tova handling

**Step 10: Run all tests**

---

### Task 5: Update documentation — runtime imports

**Files:**
- `docs/reactivity/ssr.md`, `docs/reactivity/testing.md`, `docs/reactivity/devtools.md`, `docs/reactivity/advanced.md`, `docs/fullstack/rpc.md`

**Step 11: Replace all `./.tova-out/runtime/xxx.js` with `tova:xxx`**

---

### Task 6: Update documentation — modules guide

**Files:**
- `docs/guide/modules.md`

**Step 12: Add `tova:` and `@/` to import conventions table and add usage sections**

---

### Task 7: Final verification

**Step 13: Run full test suite, grep for stale paths in docs**
