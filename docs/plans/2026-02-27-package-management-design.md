# Tova Package Management — Design Document

**Date:** 2026-02-27
**Status:** Approved
**Approach:** Pure Git Resolution (decentralized, no registry)

## Overview

Tova packages are distributed via git repositories. No central registry. Module paths are domain-qualified (Go-style), versions map to git tags, and a global cache avoids redundant downloads. Full npm interop — Tova packages can declare npm dependencies that get merged into the consumer's project.

## 1. Module Identity & Import Syntax

A Tova package is identified by its **module path** — a domain-qualified string mapping to a git repository:

```
github.com/alice/tova-http
gitlab.com/bob/router
gitea.mycompany.com/internal/auth
```

In source code:

```tova
import { serve, router } from "github.com/alice/tova-http"
import { encode } from "github.com/bob/tova-jwt"
```

Sub-packages use path segments:

```tova
import { Pool } from "github.com/alice/tova-db/postgres"
import { Redis } from "github.com/alice/tova-db/redis"
```

These map to directories inside the repo, each with their own exportable `.tova` files.

**Detection rule:** An import source is a Tova module if its first path segment contains a dot (e.g., `github.com`). Otherwise it's a relative `.tova` import or an npm package (existing behavior unchanged).

## 2. Package Declaration (`tova.toml`)

### Publishable package:

```toml
[package]
name = "github.com/alice/tova-http"
version = "1.3.0"
description = "HTTP server and client for Tova"
license = "MIT"
keywords = ["http", "server", "web", "router"]
homepage = "https://alice.dev/tova-http"
exports = ["serve", "router", "Request", "Response"]

[dependencies]
"github.com/bob/tova-jwt" = "^1.0.0"
"github.com/carol/tova-logger" = "~2.1.0"

[npm]
cookie-parser = "^1.4.0"

[npm.dev]
vitest = "^1.0.0"
```

### Consumer project (app):

```toml
[project]
name = "my-app"
version = "0.1.0"

[dependencies]
"github.com/alice/tova-http" = "^1.3.0"
"github.com/bob/tova-jwt" = "^1.0.0"

[npm]
zod = "^3.0.0"
```

**Key decisions:**

- `[package]` section marks a repo as a publishable Tova module. Apps use `[project]` (existing behavior).
- `exports` — explicit public API. Only listed names can be imported by consumers. If omitted, all top-level exports are public.
- `[dependencies]` — Tova module dependencies with semver constraints.
- `[npm]` — npm dependencies. Merged into the consumer's root `package.json` during install.
- **Version constraints:** `^1.0.0` (compatible), `~1.2.0` (patch-only), `>=1.0.0 <2.0.0` (range), `1.5.0` (exact).

## 3. Resolution, Fetching & Global Cache

### Cache layout

All Tova modules live under `~/.tova/pkg/`:

```
~/.tova/pkg/
├── github.com/
│   ├── alice/
│   │   └── tova-http/
│   │       ├── v1.3.0/
│   │       │   ├── tova.toml
│   │       │   ├── src/
│   │       │   └── ...
│   │       └── v1.2.1/
│   └── bob/
│       └── tova-jwt/
│           └── v1.0.0/
└── .cache/    # compiled .js output
```

### Install flow (`tova install`)

1. Read `[dependencies]` from `tova.toml`
2. For each Tova dependency, check if a matching version exists in `~/.tova/pkg/`
3. If not cached: `git clone --depth 1 --branch v{version} {url}` into temp dir, move to cache
4. Read the dependency's `tova.toml` — recurse for transitive Tova deps
5. Collect all `[npm]` sections from the entire dependency tree
6. Merge all npm deps into the root project's shadow `package.json`
7. Run `bun install` once for all npm deps
8. Write `tova.lock`

### Version resolution

**Minimum version selection** (Go's strategy). If A needs `^1.2.0` and B needs `^1.3.0`, resolve to `v1.3.0` — the minimum version satisfying all constraints. No SAT solver. Simple, deterministic, reproducible.

### Lock file (`tova.lock`)

```toml
[lock]
generated = "2026-02-27T10:00:00Z"

["github.com/alice/tova-http"]
version = "1.3.0"
sha = "a1b2c3d4e5f6..."
source = "https://github.com/alice/tova-http.git"

["github.com/bob/tova-jwt"]
version = "1.0.0"
sha = "f6e5d4c3b2a1..."
source = "https://github.com/bob/tova-jwt.git"

[npm]
cookie-parser = "1.4.7"
```

SHA pins the exact commit for each tag. If a tag is force-pushed, `tova install` detects the mismatch and errors out.

## 4. CLI Commands

### `tova add`

```bash
# Tova packages (detected by domain in first segment)
tova add github.com/alice/tova-http            # latest tag
tova add github.com/alice/tova-http@1.3.0      # exact version
tova add github.com/alice/tova-http@^1.0.0     # constraint

# npm packages (unchanged)
tova add npm:zod
tova add zod@3.22.0 --npm
```

Flow: `git ls-remote --tags` → pick latest semver tag → add to `[dependencies]` → run `tova install`.

### `tova install`

```bash
tova install          # install from tova.toml + tova.lock
tova install --fresh  # re-resolve, ignore lock file
tova install --offline # use cache only, no network
```

### `tova remove`

```bash
tova remove github.com/alice/tova-http   # from [dependencies]
tova remove zod                          # from [npm]
```

### `tova update`

```bash
tova update                              # update all within constraints
tova update github.com/alice/tova-http   # update one package
```

### `tova cache`

```bash
tova cache list    # show cached modules and disk usage
tova cache clean   # remove unused versions
tova cache path    # print cache directory
```

### Publishing

There is no `tova publish`. Push a git tag:

```bash
git tag v1.3.0
git push origin v1.3.0
```

The package is "published" because the tag exists on the remote. Optionally, a CI template validates that `tova.toml` version matches the tag.

## 5. Compiler Integration

### Import detection

```
"github.com/alice/tova-http"    → Tova module (dot in first segment)
"./utils"                        → relative .tova file
"zod"                            → npm package
"node:fs"                        → Node built-in
```

### Compilation flow for Tova module imports

Given `import { serve } from "github.com/alice/tova-http"`:

1. **Resolve:** Look up in `tova.lock` → version `1.3.0`
2. **Locate:** Source at `~/.tova/pkg/github.com/alice/tova-http/v1.3.0/`
3. **Entry point:** Package's `tova.toml` `entry` field, or default to `src/lib.tova` → `lib.tova` → `index.tova`
4. **Compilation cache:** Check `~/.tova/pkg/.cache/github.com/alice/tova-http/v1.3.0/`
5. **Compile if needed:** Run `.tova` files through compiler, output to cache
6. **Validate exports:** Check that `serve` is in the package's exports list
7. **Rewrite import:** Point to compiled `.js` in cache

Sub-package resolution: `"github.com/alice/tova-db/postgres"` → module is `github.com/alice/tova-db`, sub-path is `postgres/`. Look for `postgres/lib.tova` or `postgres/index.tova`.

### Analyzer changes

- Imported names registered in scope (same as existing `.tova` imports)
- Warns on imports of non-exported names when `exports` is declared
- Circular dependency detection extends across module boundaries

### What stays the same

- npm imports pass through unchanged
- Relative `.tova` imports unchanged
- Codegen output format unchanged (ES6 modules)
- Server/browser/edge block compilation unaffected

## 6. Error Handling

### Version conflict

```
error: version conflict for github.com/alice/tova-http

  github.com/carol/web-framework requires ^1.0.0
  github.com/dave/api-toolkit requires ^2.0.0

  These constraints cannot be satisfied simultaneously.
  Tip: Check if either dependency has a newer version that resolves this.
```

One version per module in the dependency tree — no silent duplication.

### Network failure

```
error: failed to fetch github.com/alice/tova-http

  git clone failed: Could not resolve host: github.com

  Cached versions available: v1.2.0, v1.2.1
  Tip: Run with --offline to use cached versions only.
```

### Tag/SHA mismatch (supply chain protection)

```
error: integrity check failed for github.com/alice/tova-http@v1.3.0

  Expected SHA: a1b2c3d4e5f6...
  Got SHA:      9z8y7x6w5v4u...

  The git tag may have been force-pushed. This could indicate tampering.
  Run `tova update github.com/alice/tova-http` to re-resolve.
```

### Missing entry point

```
error: no entry point found for github.com/alice/tova-http@v1.3.0

  Looked for: src/lib.tova, lib.tova, index.tova
  Tip: The package may need an `entry` field in its tova.toml.
```

### Private repo auth failure

```
error: authentication failed for github.com/myorg/internal-lib

  git clone returned: Permission denied (publickey)
  Tip: Ensure your SSH key or git credentials have access to this repo.
```

### Circular module dependencies

```
error: circular dependency detected

  github.com/alice/http → github.com/bob/middleware → github.com/alice/http

  Tova does not allow circular module dependencies.
```

All errors use the existing rich diagnostics formatter for consistent style.

## 7. Package Discovery

### `tova search`

```bash
tova search http server
```

Searches GitHub API for repos with `topic:tova-package` or containing a `tova.toml` with `[package]`. Shows name, description, stars, last update.

### Conventions

- **`tova-` prefix:** Encourage (not require) package authors to prefix repo names with `tova-`.
- **`awesome-tova` repo:** Community-curated `github.com/tova-lang/awesome-tova` list by category.
- **Keywords in `tova.toml`:** Improve search relevance.

### What we explicitly don't build (yet)

- No web UI / registry site
- No download counts or popularity metrics
- No automated security scanning

The Approach B lightweight index (a JSON file in a repo mapping short names to full paths) is the natural evolution point when the ecosystem grows.

## Future Extensions

- **Approach B index:** `github.com/tova-lang/packages/index.json` mapping short names to full module paths. Enables `tova add router` instead of full path. Just a file in a repo — PRs to add packages.
- **Monorepo support:** Multiple `[package]` declarations or workspace-style `tova.toml`.
- **Vendoring:** `tova vendor` copies all deps into a `vendor/` directory for hermetic builds.
