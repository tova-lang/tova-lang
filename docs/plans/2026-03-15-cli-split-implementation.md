# CLI Monolith Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split the 6,785-line `bin/tova.js` into 17 focused modules under `src/cli/`, leaving `bin/tova.js` as a thin ~180-line dispatcher.

**Architecture:** Extract functions by line range from `bin/tova.js` into `src/cli/*.js` modules. Two foundation modules (`utils.js`, `compile.js`) are extracted first since most command modules depend on them. Then each command module is extracted one at a time, with the corresponding switch case in `main()` updated to import from the new module. The original `bin/tova.js` shrinks incrementally.

**Tech Stack:** ES modules (import/export), Bun runtime, no new dependencies.

**Testing strategy:** All existing tests spawn `bin/tova.js` as a subprocess — they don't import functions from it. So as long as `bin/tova.js` correctly re-exports via imports from `src/cli/*.js`, all existing tests pass unchanged. Run `bun test tests/cli-commands.test.js` after each task to verify nothing broke.

---

### Task 1: Create `src/cli/` directory and `src/cli/utils.js`

**Files:**
- Create: `src/cli/utils.js`

**Step 1: Create the `src/cli/` directory**

Run: `mkdir -p src/cli`

**Step 2: Create `src/cli/utils.js`**

Extract these sections from `bin/tova.js`:
- Lines 30: `_hasBun` constant
- Lines 32-75: `_compatServe()` function
- Lines 77-99: `_compatSpawnSync()` function
- Lines 101-110: `color` and `isTTY` constants
- Lines 4271-4276: `getStdlibForRuntime()`, `getRunStdlib()`
- Lines 4280-4293: `hasNpmImports()`
- Lines 4295-4345: `bundleClientCode()`
- Lines 5428-5432: `_formatBytes()`
- Lines 6120-6136: `findFiles()`

The file must import its own dependencies (stdlib, runtime, fs, path, http, child_process) and export everything.

Key imports needed:
```js
import { resolve, basename, dirname, join, relative, sep } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { spawnSync as _spawnSync } from 'child_process';
import { createServer as _createHttpServer } from 'http';
import { getFullStdlib, BUILTIN_NAMES, PROPAGATE, NATIVE_INIT } from '../stdlib/inline.js';
import { REACTIVITY_SOURCE, RPC_SOURCE, ROUTER_SOURCE, DEVTOOLS_SOURCE, SSR_SOURCE, TESTING_SOURCE } from '../runtime/embedded.js';
```

Exports: `_hasBun, _compatServe, _compatSpawnSync, color, isTTY, getStdlibForRuntime, getRunStdlib, hasNpmImports, bundleClientCode, _formatBytes, findFiles`

**Step 3: Update `bin/tova.js` to import from utils**

Replace the extracted sections with imports:
```js
import { _hasBun, _compatServe, _compatSpawnSync, color, isTTY, getStdlibForRuntime, getRunStdlib, hasNpmImports, bundleClientCode, _formatBytes, findFiles } from '../src/cli/utils.js';
```

Delete the original function bodies from `bin/tova.js` (lines listed above).

**Step 4: Run tests to verify**

Run: `bun test tests/cli-commands.test.js`
Expected: All tests pass — behavior unchanged.

**Step 5: Commit**

```bash
git add src/cli/utils.js bin/tova.js
git commit -m "refactor: extract cli utils to src/cli/utils.js"
```

---

### Task 2: Create `src/cli/compile.js`

**Files:**
- Create: `src/cli/compile.js`
- Modify: `bin/tova.js`

**Step 1: Create `src/cli/compile.js`**

Extract these sections from `bin/tova.js`:
- Lines 374-399: `compileTova()`
- Lines 849-941: `fixImportPaths()`, `injectRouterImport()`
- Lines 943-1049: `generateFileBasedRoutes()`
- Lines 5544-5545: `moduleTypeCache` Map declaration
- Lines 5546-5583: `getCompiledExtension()`
- Lines 5585-5595: `compilationCache`, `compilationInProgress`, `compilationChain`, `moduleExports`, `fileDependencies`, `fileReverseDeps` declarations
- Lines 5597-5637: `trackDependency()`, `getTransitiveDependents()`, `invalidateFile()`
- Lines 5639-5716: `collectExports()`
- Lines 5718-5831: `compileWithImports()`
- Lines 5835-5943: `validateMergedAST()`
- Lines 5945-6110: `mergeDirectory()`
- Lines 6110-6118: `groupFilesByDirectory()`

Key imports needed:
```js
import { resolve, basename, dirname, join, relative, sep, extname } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { createRequire as _createRequire } from 'module';
import { Lexer } from '../lexer/lexer.js';
import { Parser } from '../parser/parser.js';
import { Analyzer } from '../analyzer/analyzer.js';
import { Symbol } from '../analyzer/scope.js';
import { Program } from '../parser/ast.js';
import { CodeGenerator } from '../codegen/codegen.js';
import { richError, formatDiagnostics, DiagnosticFormatter, formatSummary } from '../diagnostics/formatter.js';
import { buildSelectiveStdlib, BUILTIN_NAMES } from '../stdlib/inline.js';
import { findFiles } from './utils.js';
```

Exports: `compileTova, compileWithImports, mergeDirectory, collectExports, fixImportPaths, validateMergedAST, groupFilesByDirectory, trackDependency, invalidateFile, getTransitiveDependents, getCompiledExtension, injectRouterImport, generateFileBasedRoutes, compilationCache, moduleTypeCache, compilationInProgress, moduleExports`

Note: The mutable caches (`compilationCache`, `moduleTypeCache`, `compilationInProgress`, `moduleExports`) must be exported so that `build.js` and `dev.js` can call `.clear()` on them.

**Step 2: Update `bin/tova.js`**

Replace extracted sections with:
```js
import { compileTova, compileWithImports, mergeDirectory, collectExports, fixImportPaths, validateMergedAST, groupFilesByDirectory, trackDependency, invalidateFile, getTransitiveDependents, getCompiledExtension, injectRouterImport, generateFileBasedRoutes, compilationCache, moduleTypeCache, compilationInProgress, moduleExports } from '../src/cli/compile.js';
```

Delete the original function bodies.

**Step 3: Run tests**

Run: `bun test tests/cli-commands.test.js`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add src/cli/compile.js bin/tova.js
git commit -m "refactor: extract compilation pipeline to src/cli/compile.js"
```

---

### Task 3: Extract `src/cli/format.js`

**Files:**
- Create: `src/cli/format.js`
- Modify: `bin/tova.js`

**Step 1: Create `src/cli/format.js`**

Extract lines 403-449 (`formatFile`) from `bin/tova.js`.

Imports needed: `fs` (readFileSync, writeFileSync, existsSync, readdirSync, statSync), `path` (resolve, join, relative, basename), `Formatter` from `../formatter/formatter.js`, `color` from `./utils.js`.

Export: `formatFile`

**Step 2: Update `bin/tova.js`**

Add `import { formatFile } from '../src/cli/format.js';` and delete the original function.

**Step 3: Run tests, commit**

Run: `bun test tests/cli-commands.test.js`

```bash
git add src/cli/format.js bin/tova.js
git commit -m "refactor: extract formatFile to src/cli/format.js"
```

---

### Task 4: Extract `src/cli/test.js`

**Files:**
- Create: `src/cli/test.js`
- Modify: `bin/tova.js`

**Step 1: Create `src/cli/test.js`**

Extract from `bin/tova.js`:
- Lines 452-571: `runTests()`
- Lines 573-631: `runBench()`
- Lines 632-681: `generateDocs()`
- Lines 683-697: `findTovaFiles()`

Imports needed: `fs`, `path`, `child_process` (spawn), `Lexer`, `Parser`, `CodeGenerator`, `color` from `./utils.js`.

Note: `runTests` and `runBench` use `Lexer`, `Parser`, `CodeGenerator` directly (not `compileTova`), and use `spawn` to run `bun test`. `generateDocs` dynamically imports `../docs/generator.js`. `findTovaFiles` is a recursive file finder used by all three.

Exports: `runTests, runBench, generateDocs, findTovaFiles`

**Step 2: Update `bin/tova.js`**

Add `import { runTests, runBench, generateDocs, findTovaFiles } from '../src/cli/test.js';` and delete originals.

**Step 3: Run tests, commit**

Run: `bun test tests/cli-commands.test.js`

```bash
git add src/cli/test.js bin/tova.js
git commit -m "refactor: extract test/bench/doc commands to src/cli/test.js"
```

---

### Task 5: Extract `src/cli/deploy.js`

**Files:**
- Create: `src/cli/deploy.js`
- Modify: `bin/tova.js`

**Step 1: Create `src/cli/deploy.js`**

Extract lines 701-714 (`deployCommand`). Uses dynamic import of `../deploy/deploy.js` and `color` from `./utils.js`.

Export: `deployCommand`

**Step 2: Update `bin/tova.js`, run tests, commit**

```bash
git add src/cli/deploy.js bin/tova.js
git commit -m "refactor: extract deployCommand to src/cli/deploy.js"
```

---

### Task 6: Extract `src/cli/run.js`

**Files:**
- Create: `src/cli/run.js`
- Modify: `bin/tova.js`

**Step 1: Create `src/cli/run.js`**

Extract lines 717-846 (`runFile`).

Imports needed: `fs`, `path`, `module` (createRequire), `compileTova` from `./compile.js`, `getRunStdlib` from `./utils.js`, `resolveConfig` from `../config/resolve.js`, `richError` from `../diagnostics/formatter.js`.

Export: `runFile`

**Step 2: Update `bin/tova.js`, run tests, commit**

```bash
git add src/cli/run.js bin/tova.js
git commit -m "refactor: extract runFile to src/cli/run.js"
```

---

### Task 7: Extract `src/cli/build.js`

**Files:**
- Create: `src/cli/build.js`
- Modify: `bin/tova.js`

**Step 1: Create `src/cli/build.js`**

Extract from `bin/tova.js`:
- Lines 1052-1355: `buildProject()`
- Lines 1502-1513: `cleanBuild()`
- Lines 4813-4910: `SourceMapBuilder` class
- Lines 4913-4992: `binaryBuild()`
- Lines 4995-5426: `productionBuild()`, `extractRoutePaths()`, `_simpleMinify()`, `_eliminateDeadFunctions()`
- Lines 5436-5539: `BuildCache` class

Imports needed: `fs`, `path`, `crypto` (createHash), `module` (createRequire), `compile.js` (mergeDirectory, compileTova, fixImportPaths, compileWithImports, groupFilesByDirectory, compilationCache, moduleTypeCache, collectExports, injectRouterImport, generateFileBasedRoutes), `utils.js` (color, findFiles, getRunStdlib, hasNpmImports, bundleClientCode, _formatBytes, _hasBun), `resolveConfig`, `REACTIVITY_SOURCE/RPC_SOURCE/etc` from runtime/embedded, `generateSecurityScorecard` from diagnostics, `BUILTIN_NAMES/buildSelectiveStdlib/PROPAGATE/NATIVE_INIT` from stdlib.

Note: `buildProject` references `compilationCache.clear()` and `moduleTypeCache.clear()` — these are exported from `compile.js`.

Exports: `buildProject, cleanBuild`

**Step 2: Update `bin/tova.js`, run tests, commit**

Run: `bun test tests/cli-commands.test.js`

```bash
git add src/cli/build.js bin/tova.js
git commit -m "refactor: extract build pipeline to src/cli/build.js"
```

---

### Task 8: Extract `src/cli/check.js`

**Files:**
- Create: `src/cli/check.js`
- Modify: `bin/tova.js`

**Step 1: Create `src/cli/check.js`**

Extract lines 1358-1500 (`checkProject`).

Imports needed: `fs`, `path`, `Lexer`, `Parser`, `Analyzer`, `DiagnosticFormatter`, `formatSummary` from diagnostics, `resolveConfig`, `color` from `./utils.js`, `findFiles` from `./utils.js`, `generateSecurityScorecard`.

Export: `checkProject`

**Step 2: Update `bin/tova.js`, run tests, commit**

```bash
git add src/cli/check.js bin/tova.js
git commit -m "refactor: extract checkProject to src/cli/check.js"
```

---

### Task 9: Extract `src/cli/dev.js`

**Files:**
- Create: `src/cli/dev.js`
- Modify: `bin/tova.js`

**Step 1: Create `src/cli/dev.js`**

Extract from `bin/tova.js`:
- Lines 1516-2087: `devServer()`, `generateDevHTML()`
- Lines 4782-4810: `startWatcher()`

Imports needed: `fs`, `path`, `compile.js` (mergeDirectory, fixImportPaths, groupFilesByDirectory, compilationCache, moduleTypeCache, compilationInProgress, moduleExports, invalidateFile, injectRouterImport, generateFileBasedRoutes), `utils.js` (color, findFiles, _compatServe, hasNpmImports, bundleClientCode, _hasBun), `resolveConfig`, `REACTIVITY_SOURCE/RPC_SOURCE/etc` from runtime/embedded, `BUILTIN_NAMES/buildSelectiveStdlib` from stdlib.

Note: `devServer` references `compilationCache.clear()`, `moduleTypeCache.clear()`, `compilationInProgress.clear()`, `moduleExports.clear()` — all exported from `compile.js`.

Export: `devServer`

**Step 2: Update `bin/tova.js`, run tests, commit**

```bash
git add src/cli/dev.js bin/tova.js
git commit -m "refactor: extract devServer to src/cli/dev.js"
```

---

### Task 10: Extract `src/cli/new.js`

**Files:**
- Create: `src/cli/new.js`
- Modify: `bin/tova.js`

**Step 1: Create `src/cli/new.js`**

Extract from `bin/tova.js`:
- Lines 2090-2705: Template content functions (`fullstackAuthContent`, `spaAuthContent`, etc.)
- Lines 2706-3278: `PROJECT_TEMPLATES` constant, `TEMPLATE_ORDER`
- Lines 3280-3518: `newProject()`

Imports needed: `fs`, `path`, `child_process` (spawnSync), `color` from `./utils.js`, `VERSION` from `../version.js`, `writePackageJson` from `../config/package-json.js`, `stringifyTOML` from `../config/toml.js`.

Export: `newProject`

**Step 2: Update `bin/tova.js`, run tests, commit**

```bash
git add src/cli/new.js bin/tova.js
git commit -m "refactor: extract newProject + templates to src/cli/new.js"
```

---

### Task 11: Extract `src/cli/package.js`

**Files:**
- Create: `src/cli/package.js`
- Modify: `bin/tova.js`

**Step 1: Create `src/cli/package.js`**

Extract from `bin/tova.js`:
- Lines 3521-3610: `initProject()`
- Lines 3613-3703: `installDeps()`
- Lines 3704-3828: `addDep()`
- Lines 3829-3859: `generateLockFile()`
- Lines 3860-3888: `removeDep()`

Also absorb the inline `update` and `cache` logic from the main() switch (lines 225-292) into exported functions `updateDeps()` and `cacheCommand()`.

Imports needed: `fs`, `path`, `child_process`, `color` from `./utils.js`, `resolveConfig` from `../config/resolve.js`, `writePackageJson` from `../config/package-json.js`, `addToSection/removeFromSection` from `../config/edit-toml.js`, `stringifyTOML` from `../config/toml.js`, `VERSION` from `../version.js`.

Exports: `initProject, installDeps, addDep, removeDep, updateDeps, cacheCommand`

**Step 2: Update `bin/tova.js`**

Replace `case 'update':` with `await updateDeps(args);` and `case 'cache':` with `await cacheCommand(args);`.

**Step 3: Run tests, commit**

```bash
git add src/cli/package.js bin/tova.js
git commit -m "refactor: extract package management to src/cli/package.js"
```

---

### Task 12: Extract `src/cli/migrate.js`

**Files:**
- Create: `src/cli/migrate.js`
- Modify: `bin/tova.js`

**Step 1: Create `src/cli/migrate.js`**

Extract lines 3891-4267:
- `findTovaFile()`, `discoverDbConfig()`, `connectDb()`
- `migrateCreate()`, `migrateUp()`, `migrateDown()`, `migrateReset()`, `migrateFresh()`, `migrateStatus()`

Imports needed: `fs`, `path`, `color` from `./utils.js`, `Lexer`, `Parser`.

Exports: `migrateCreate, migrateUp, migrateDown, migrateReset, migrateFresh, migrateStatus`

**Step 2: Update `bin/tova.js`, run tests, commit**

```bash
git add src/cli/migrate.js bin/tova.js
git commit -m "refactor: extract migration commands to src/cli/migrate.js"
```

---

### Task 13: Extract `src/cli/repl.js`

**Files:**
- Create: `src/cli/repl.js`
- Modify: `bin/tova.js`

**Step 1: Create `src/cli/repl.js`**

Extract lines 4355-4779 (`startRepl`).

Imports needed: `fs`, `path`, `module` (createRequire), `readline`, `compileTova` from `./compile.js`, `getStdlibForRuntime, getRunStdlib, color` from `./utils.js`, `VERSION` from `../version.js`, `Lexer` from `../lexer/lexer.js`, `BUILTIN_NAMES` from `../stdlib/inline.js`.

Export: `startRepl`

**Step 2: Update `bin/tova.js`, run tests, commit**

```bash
git add src/cli/repl.js bin/tova.js
git commit -m "refactor: extract REPL to src/cli/repl.js"
```

---

### Task 14: Extract `src/cli/doctor.js`

**Files:**
- Create: `src/cli/doctor.js`
- Modify: `bin/tova.js`

**Step 1: Create `src/cli/doctor.js`**

Extract lines 6140-6264 (`doctorCommand`).

Imports needed: `fs`, `path`, `child_process` (spawnSync), `color` from `./utils.js`, `VERSION` from `../version.js`.

Export: `doctorCommand`

**Step 2: Update `bin/tova.js`, run tests, commit**

```bash
git add src/cli/doctor.js bin/tova.js
git commit -m "refactor: extract doctorCommand to src/cli/doctor.js"
```

---

### Task 15: Extract `src/cli/completions.js`

**Files:**
- Create: `src/cli/completions.js`
- Modify: `bin/tova.js`

**Step 1: Create `src/cli/completions.js`**

Extract lines 6267-6457 (`completionsCommand`).

Imports needed: `color` from `./utils.js`.

Export: `completionsCommand`

**Step 2: Update `bin/tova.js`, run tests, commit**

```bash
git add src/cli/completions.js bin/tova.js
git commit -m "refactor: extract completionsCommand to src/cli/completions.js"
```

---

### Task 16: Extract `src/cli/upgrade.js`

**Files:**
- Create: `src/cli/upgrade.js`
- Modify: `bin/tova.js`

**Step 1: Create `src/cli/upgrade.js`**

Extract lines 6460-6715:
- `detectInstallMethod()`, `compareSemver()`, `formatBytes()` (rename to avoid collision with `_formatBytes`), `downloadWithProgress()`, `upgradeCommand()`, `npmUpgrade()`, `npmTarballUpgrade()`, `detectPackageManager()`

Imports needed: `fs`, `path`, `child_process` (spawnSync), `os`, `color` from `./utils.js`, `VERSION` from `../version.js`.

Export: `upgradeCommand`

**Step 2: Update `bin/tova.js`, run tests, commit**

```bash
git add src/cli/upgrade.js bin/tova.js
git commit -m "refactor: extract upgradeCommand to src/cli/upgrade.js"
```

---

### Task 17: Extract `src/cli/info.js`

**Files:**
- Create: `src/cli/info.js`
- Modify: `bin/tova.js`

**Step 1: Create `src/cli/info.js`**

Extract lines 6718-6783 (`infoCommand`).

Imports needed: `fs`, `path`, `child_process` (spawnSync), `color, findFiles` from `./utils.js`, `VERSION` from `../version.js`, `resolveConfig` from `../config/resolve.js`.

Export: `infoCommand`

**Step 2: Update `bin/tova.js`, run tests, commit**

```bash
git add src/cli/info.js bin/tova.js
git commit -m "refactor: extract infoCommand to src/cli/info.js"
```

---

### Task 18: Final cleanup of `bin/tova.js`

**Files:**
- Modify: `bin/tova.js`

**Step 1: Clean up imports**

At this point, `bin/tova.js` should only contain:
- Shebang line
- Imports from `src/cli/*.js` modules
- Imports for `VERSION`, `lookupCode`, `getExplanation` (used by inline `explain` command)
- `color` import from `./utils.js` (used by HELP text rendering and default error case)
- `HELP` constant
- `main()` function (~200 lines — switch dispatcher)
- `startLsp()` inline (5 lines — just a dynamic import wrapper)
- `main()` call at bottom

Remove any now-unused imports from `bin/tova.js` (Lexer, Parser, Analyzer, CodeGenerator, fs functions, etc. — these are now imported by the individual modules).

**Step 2: Verify final line count**

Run: `wc -l bin/tova.js`
Expected: ~180-220 lines.

**Step 3: Run full test suite**

Run: `bun test tests/cli-commands.test.js tests/module-system.test.js tests/p3-features.test.js tests/new-features.test.js tests/server-features.test.js tests/npm-interop.test.js tests/deploy-docs-e2e.test.js`
Expected: All tests pass.

**Step 4: Verify CLI commands work end-to-end**

Run: `bun bin/tova.js --help`
Run: `bun bin/tova.js --version`
Run: `bun bin/tova.js explain E202`
Expected: All produce correct output.

**Step 5: Commit**

```bash
git add bin/tova.js
git commit -m "refactor: finalize CLI split - bin/tova.js is now a thin dispatcher"
```

---

### Task 19: Verification and summary commit

**Step 1: List all new files**

Run: `ls -la src/cli/`
Expected: 17 files (utils.js, compile.js, format.js, test.js, deploy.js, run.js, build.js, check.js, dev.js, new.js, package.js, migrate.js, repl.js, doctor.js, completions.js, upgrade.js, info.js)

**Step 2: Run full test suite**

Run: `bun test`
Expected: All ~11,321 tests pass across all 153 test files.

**Step 3: Verify no circular dependencies**

Run: `node -e "import('../src/cli/utils.js').then(() => console.log('utils ok'))"`
Run: `node -e "import('../src/cli/compile.js').then(() => console.log('compile ok'))"`
Expected: Both load without circular dependency errors.

**Step 4: Final summary commit**

Only if needed — squash fixups or add a summary commit covering the full split.
