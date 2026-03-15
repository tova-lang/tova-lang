# CLI Monolith Split Design

**Date:** 2026-03-15
**Status:** Approved
**Goal:** Split the 6,785-line `bin/tova.js` into focused modules under `src/cli/`

## Problem

`bin/tova.js` handles 25+ commands, the compilation pipeline, project templates, a dev server, REPL, migration system, package management, and more — all in a single file. This makes it hard to navigate, test, and maintain.

## Architecture

```
bin/tova.js                  → thin dispatcher (~180 lines)
src/cli/
  compile.js                 → shared compilation pipeline
  build.js                   → build, productionBuild, binaryBuild
  dev.js                     → devServer, generateDevHTML, watcher, bundling
  run.js                     → runFile
  test.js                    → runTests, runBench, findTovaFiles
  repl.js                    → startRepl
  check.js                   → checkProject
  format.js                  → formatFile
  new.js                     → newProject, PROJECT_TEMPLATES, template content
  package.js                 → installDeps, addDep, removeDep, generateLockFile, initProject, update, cache
  migrate.js                 → migrateCreate/Up/Down/Reset/Fresh/Status + DB helpers
  deploy.js                  → deployCommand
  doctor.js                  → doctorCommand
  upgrade.js                 → upgradeCommand + helpers
  info.js                    → infoCommand
  completions.js             → completionsCommand
  utils.js                   → color, compat shims, findFiles, stdlib helpers, bundleClientCode
```

## Module Dependency Graph

```
bin/tova.js
  ├── imports every src/cli/*.js command module
  ├── owns: HELP text, main() dispatcher, explain (inline)
  └── imports: VERSION, lookupCode, getExplanation

src/cli/compile.js  (shared core — no CLI dependencies)
  ├── exports: compileTova, compileWithImports, mergeDirectory,
  │            collectExports, fixImportPaths, validateMergedAST,
  │            groupFilesByDirectory, trackDependency, invalidateFile,
  │            getTransitiveDependents, getCompiledExtension,
  │            injectRouterImport, generateFileBasedRoutes
  ├── owns: compilationCache, moduleExports, moduleTypeCache,
  │         compilationInProgress, compilationChain, fileDependencies, fileReverseDeps
  └── imports: Lexer, Parser, Analyzer, CodeGenerator, diagnostics, stdlib

src/cli/utils.js  (zero-dependency helpers)
  ├── exports: color, isTTY, _compatServe, _compatSpawnSync, findFiles,
  │            getStdlibForRuntime, getRunStdlib, hasNpmImports,
  │            bundleClientCode, _formatBytes, _hasBun
  └── imports: stdlib/inline.js, runtime/embedded.js, fs, path, http, child_process

src/cli/build.js → compile.js, utils.js, config/resolve.js
src/cli/dev.js → compile.js, utils.js, config/resolve.js
src/cli/run.js → compile.js, utils.js, config/resolve.js
src/cli/test.js → compile.js, utils.js
src/cli/repl.js → compile.js, utils.js
src/cli/check.js → utils.js (uses Lexer/Parser/Analyzer directly)
src/cli/new.js → standalone (only fs/path + color from utils)
src/cli/package.js → config/resolve.js, utils.js
src/cli/migrate.js → standalone (only fs/path + color from utils)
src/cli/format.js → Formatter
src/cli/deploy.js → config/resolve.js
src/cli/doctor.js → standalone
src/cli/upgrade.js → standalone (network + fs)
src/cli/info.js → config/resolve.js, utils.js
src/cli/completions.js → standalone
```

## Key Design Decisions

1. **`bin/tova.js` remains the entry point** — keeps shebang, HELP, arg parsing, switch dispatch. `explain` stays inline (19 lines).
2. **`compile.js` owns all mutable compilation state** — caches, dependency tracking, the full `compileTova → compileWithImports → mergeDirectory` pipeline.
3. **`utils.js` owns cross-cutting helpers** — color, compat shims, file discovery, stdlib accessors, bundleClientCode. No compile-pipeline dependency.
4. **Each command module exports a single main function** — internal helpers stay module-private.
5. **No circular dependencies** — strict flow: `bin/tova.js → command modules → compile.js / utils.js → src/ internals`.
6. **Tests unchanged** — tests import from `src/` directly, not `bin/tova.js`. CLI tests spawn `bin/tova.js` as a child process, which still works.

## Line Ranges in Current bin/tova.js

| Lines | Function(s) | Target Module |
|-------|-------------|---------------|
| 30-99 | _compatServe, _compatSpawnSync | utils.js |
| 101-110 | color helpers, isTTY | utils.js |
| 112-163 | HELP text | bin/tova.js |
| 165-370 | main() dispatcher | bin/tova.js |
| 374-399 | compileTova | compile.js |
| 403-449 | formatFile | format.js |
| 452-571 | runTests | test.js |
| 573-631 | runBench | test.js |
| 632-697 | generateDocs, findTovaFiles | test.js (findTovaFiles shared) |
| 701-714 | deployCommand | deploy.js |
| 717-846 | runFile | run.js |
| 849-941 | fixImportPaths, injectRouterImport | compile.js |
| 943-1049 | generateFileBasedRoutes | compile.js |
| 1052-1355 | buildProject | build.js |
| 1358-1500 | checkProject | check.js |
| 1502-1513 | cleanBuild | build.js |
| 1516-2087 | devServer, generateDevHTML | dev.js |
| 2090-3278 | template content fns, PROJECT_TEMPLATES | new.js |
| 3280-3518 | newProject | new.js |
| 3521-3610 | initProject | package.js |
| 3613-3888 | installDeps, addDep, generateLockFile, removeDep | package.js |
| 3891-4267 | migrate:* commands + DB helpers | migrate.js |
| 4271-4345 | getStdlibForRuntime, getRunStdlib, hasNpmImports, bundleClientCode | utils.js |
| 4348-4352 | startLsp | bin/tova.js (5-line inline) |
| 4355-4779 | startRepl | repl.js |
| 4782-4810 | startWatcher | dev.js |
| 4813-4910 | SourceMapBuilder | build.js |
| 4913-4992 | binaryBuild | build.js |
| 4995-5432 | productionBuild, extractRoutePaths, _simpleMinify, _eliminateDeadFunctions, _formatBytes | build.js (_formatBytes → utils.js) |
| 5436-5539 | BuildCache | build.js |
| 5544-5831 | compileWithImports, dependency tracking, collectExports | compile.js |
| 5835-6136 | validateMergedAST, mergeDirectory, groupFilesByDirectory, findFiles | compile.js (findFiles → utils.js) |
| 6140-6264 | doctorCommand | doctor.js |
| 6267-6457 | completionsCommand | completions.js |
| 6460-6715 | upgradeCommand + helpers | upgrade.js |
| 6718-6783 | infoCommand | info.js |
