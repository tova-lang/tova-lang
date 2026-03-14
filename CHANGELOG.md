# Changelog

All notable changes to Tova are documented in this file.

## [0.10.0] - 2026-03-14

### Breaking Changes
- **Stdlib naming convention: snake_case to camelCase** — All ~170 multi-word stdlib functions now use camelCase as the primary convention (e.g. `flatMap`, `groupBy`, `sortBy`, `jsonParse`, `toInt`). Old snake_case names still work but emit a `W_DEPRECATED_STDLIB` compiler warning.

### Features
- camelCase wrappers for all multi-word stdlib functions — both names work, old names are deprecated
- `W_DEPRECATED_STDLIB` analyzer warning with suggested replacement name
- LSP deprecation markers — snake_case names show strikethrough in IDE autocomplete

### Docs
- Updated all code examples across ~100 doc files to use camelCase stdlib names
- Updated playground examples, autocomplete references, and code comments to camelCase
- Added "Migration to camelCase" section in stdlib reference with common renames table

## [0.9.15] - 2026-03-14

### Fixes
- Fixed intellisense implementations in playground
- Fixed scrolling of the playground

## [0.9.14] - 2026-03-14

### Fixes
- Fixed server codegen error issue

## [0.9.1] - 2026-03-06

### Docs
- Complete mastering tutorials with all missing language features
- Added deploy block documentation (infrastructure as code, multi-environment, CLI commands)
- Added data block documentation (sources, pipelines, validation, refresh policies)
- Added theme block documentation (design tokens, dark mode, $token references)
- Enhanced animation documentation (blur primitive, animate: directive, conditional animations, precedence)
- Added missing syntax to core tutorials: string types, scientific notation, `mut`, `in`/`not in`, `nil`, chained comparisons, variadic functions, named arguments, decorators, extern declarations, tuple patterns, `select` statement, structured logging, array types, `@memoize`, `Type.new()`

## [0.9.0] - 2026-03-04

### Features
- Named props in constructors
- `pub` component support, compound components, JS reserved word fix
- Hyphenated JSX attribute names (`aria-*`, `data-*`, `stroke-*`)
- Register `tova/ui` as blessed package
- `tova/*` blessed package shorthand resolution
- `crypto` namespace — sha256, sha512, hmac, encrypt/decrypt, password hashing
- `http` namespace — get/post/put/patch/delete/head with Result semantics
- `cache` namespace — LRU with optional TTL, hit/miss stats
- `log` namespace — structured logging with levels, JSON mode, child loggers
- Enhanced `print()` with inline styles, auto-pretty-print, auto-table
- Enhanced `fmt()` with Python/Rust-style format specifications
- Register crypto, http, cache, log in stdlib builtins for tree-shaking

### Fixes
- Fixed destructuring issue in REPL

### Docs
- Installer per operating system
- tova-ui component library design
- tova package ecosystem design and implementation plan

## [0.8.4] - 2026-03-02

### Features
- `--strict-security` mode and security warning categories
- `W_DANGEROUS_API` warning for innerHTML and setTimeout strings
- `W_NO_SECURITY_BLOCK` warning for server/edge without security
- Security scorecard output for `--verbose` and `--strict-security`
- Default security headers emitted even in fast mode
- Auto-inject audit logging on auth success/failure and rate limiting

### Fixes
- Fixed tova runtime imports
- Docker deployment optimizations

### Docs
- Security hardening implementation plan and design
- Community docs updates

## [0.8.3] - 2026-03-02

### Features
- `theme {}` block — parser, analyzer, codegen for CSS custom properties + dark mode
- `$token` syntax — resolve design tokens to CSS `var()` references with compile-time validation and typo suggestions
- `responsive {}` blocks with named breakpoints in style blocks
- `variant()` styles — zero-runtime component variants with analyzer validation
- `animate {}` block — declarative animation sequences with `@keyframes` and composition operators
- Component-scoped font loading with reference counting
- Auto `prefers-reduced-motion` for animated components

### Fixes
- Cross-file scope sharing and forward declarations
- Deploy block docs corrections

## [0.8.2] - 2026-03-01

### Features
- `deploy {}` block — AST, parser, analyzer, codegen, CLI command
- Infrastructure inference and provisioning script generator
- Concurrency resolution with WASM and `Promise.all`

### Fixes
- LSP update
- Playground cursor position issue
- Concurrency fixes

## [0.8.1] - 2026-02-28

### Features
- Decentralized package management — `tova add/install/remove/update/search/cache`
- Git resolver — tag parsing, remote listing, module fetching
- Dependency resolver — merge constraints, detect conflicts, minimum version selection
- Semver utilities — parse, compare, satisfy, minimum version selection
- Global cache manager with version lookup and cleanup
- Lock file TOML format + `[package]` section support in `tova.toml`
- Module entry point resolution for cached packages
- Rich error messages for package management failures

### Fixes
- Playground "Lexer is not defined" — add missing concurrency plugin files
- CI workflow — add bun install and embed-runtime build step

### Docs
- Comprehensive package management documentation

## [0.8.0] - 2026-02-27

### Features
- Structured concurrency — `concurrent {}` blocks and `spawn` expressions
- `select` statement with 5 case patterns
- `cancel_on_error` and `first` concurrent modes
- Rust runtime foundation — Tokio scheduler with `spawnTask` and `concurrentAll`
- Wasmtime executor — load and run WASM modules on Tokio tasks
- Crossbeam channels with create/send/receive/close
- WASM host imports for channels — producer/consumer across Tokio tasks
- Runtime bridge with auto-discovery and graceful fallback
- Compile-time devirtualization for Result/Option methods
- Scalar replacement for Result/Option variables (up to 19.7x faster)

### Docs
- Concurrency design and implementation plans
- Benchmark fairness notes for Tova vs Go

## [0.7.0] - 2026-02-27

### Features
- First-class `form {}` blocks with full-stack validation
- Form field parser with validators: required, minLength, maxLength, min, max, pattern, email, matches, oneOf, validate, async validate
- Form groups, arrays, wizard steps
- `FormField` and `ErrorMessage` built-in component transforms
- `bind:form` directive for form submit wiring
- `edge {}` block Phase 2 — runtime bindings for all 5 targets (Cloudflare, Deno, Vercel, Lambda, Bun)
- `edge {}` block Phase 1 — parser, codegen, analyzer

### Fixes
- Build codegen fix
- Lexer issues in playground
- Relative paths in bugfix tests for CI compatibility
- Doc base path for domain

### Docs
- Form blocks design and implementation plan
- Edge block documentation and tutorials

## [0.6.1] - 2026-02-26

### Changes
- Docs restructure — separate core language from app models

## [0.6.0] - 2026-02-26

### Breaking Changes
- Renamed `client` block to `browser` block

### Features
- `cli {}` block, block registry, and TOVA banner
- `security {}` block — auth, roles, route protection, CORS, CSP, rate limiting, CSRF, audit
- Associated functions for `impl` blocks
- Client block improvements

### Fixes
- Fix spurious page reloads in dev server
- Fix `detectInstallMethod` for shell wrapper installs
- Fix RPC endpoints missing from fast-mode request handler
- Fix binary upgrade when no GitHub release exists
- Fix upgrade command — proper semver comparison, prevent downgrades
- Fix analyzer false positives for full-stack apps
- Fix VitePress build — escape curly braces parsed as Vue template expressions

### Docs
- Comprehensive styling docs, DOM API support, and JSX rendering tests
- Cookbook and tasks app
- Docs overhaul and performance showcase

## [0.3.8] - 2026-02-23

### Fixes
- Fix playground runtime — block-scope proto code to avoid duplicate `const methods`

## [0.3.7] - 2026-02-23

### Fixes
- Fix playground — bundle missing compiler modules

## [0.3.6] - 2026-02-23

### Features
- Language performance optimizations

### Fixes
- Fix REPL crash, production build minification, and variant field collision
- Major fixes

## [0.3.5] - 2026-02-22

### Fixes
- Fix compiled binary — replace dynamic requires with static imports

## [0.3.4] - 2026-02-22

### Fixes
- Fix `tova check`, `test`, `bench`, and production build commands

## [0.3.3] - 2026-02-22

### Fixes
- Fix install script — add progress bar, compressed downloads, error handling
- Bug fixes

## [0.3.2] - 2026-02-22

### Changes
- Version bump

## [0.3.1] - 2026-02-22

### Docs
- Update docs to emphasize Tova as general-purpose language for scripting, data, AI, and web

## [0.3.0] - 2026-02-16

### Fixes
- Fix 30 bugs across lexer, parser, analyzer, codegen, LSP, runtime, and stdlib

## [0.2.9] - 2026-02-16

### Changes
- Version bump

## [0.2.8] - 2026-02-15

### Features
- Smooth live reload — wait for server ready before triggering browser
- Stdlib availability in server/client blocks and live reload
- Stdlib extensions
- Type system improvements
- Playground

### Fixes
- Fix analyzer warnings for shared types in server/client blocks
- Fix reload server init order and improve scaffolded template
- Fix dev server port-in-use crash and Ctrl+C exit
- Fix compiled binary crash by embedding version at build time
- Fix release workflow to sync version from git tag
- Package management fixes

## [0.2.3] - 2026-02-15

### Features
- Distribution pipeline — npm, standalone binaries, and install script

## [0.1.1] - 2026-02-15

### Changes
- Rename package to `tova`, fix CI frozen-lockfile errors
- Fix repo URLs to tova-lang/tova-lang

## [0.1.0] - 2026-02-15

### Features
- Initial release — lexer, parser, analyzer, codegen
- Server blocks and client blocks
- Full test suite
