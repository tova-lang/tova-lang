# Using Packages

## Finding Packages

### tova search

Search for packages on GitHub:

```bash
tova search http server
```

This queries the GitHub API for repositories tagged with `topic:tova-package` matching your search terms. Results show the module path, description, star count, and last update date:

```
  github.com/alice/tova-http
    HTTP server and client for Tova
    Stars: 142  Updated: 2026-02-15

  github.com/bob/tova-router
    Fast router with middleware support
    Stars: 87  Updated: 2026-02-10
```

### Conventions

Package authors are encouraged (but not required) to:

- Prefix repo names with `tova-` (e.g., `tova-http`, `tova-jwt`)
- Add the `tova-package` topic to their GitHub repository
- Include descriptive `keywords` in their `tova.toml`

## Adding Packages

### Tova packages

Add a Tova package by its module path:

```bash
# Latest version
tova add github.com/alice/tova-http

# Specific version
tova add github.com/alice/tova-http@1.3.0

# Version constraint
tova add github.com/alice/tova-http@^1.0.0
```

Tova detects that the argument is a module path (the first segment contains a dot) and:

1. Runs `git ls-remote --tags` to find available versions
2. Picks the latest version matching the constraint (or latest overall)
3. Adds the dependency to `[dependencies]` in your `tova.toml`
4. Runs `tova install` to fetch and cache the package

### npm packages

npm packages work the same as before:

```bash
tova add npm:zod
tova add zod@3.22.0 --npm
```

These go into the `[npm]` section of your `tova.toml`.

## Importing Packages

### Tova module imports

Import from a Tova package using its full module path:

```tova
import { serve, router } from "github.com/alice/tova-http"
import { encode, decode } from "github.com/bob/tova-jwt"
```

The compiler detects that these are Tova modules (the first path segment contains a dot) and resolves them from the global cache.

### Sub-package imports

Packages can contain sub-packages organized in directories. Import from a sub-package by appending the path:

```tova
import { Pool } from "github.com/alice/tova-db/postgres"
import { Redis } from "github.com/alice/tova-db/redis"
```

Here `github.com/alice/tova-db` is the module, and `postgres` and `redis` are sub-packages (directories inside the repo, each with their own `.tova` entry files).

### Import detection rules

The compiler uses these rules to determine how to resolve an import:

| Import Path | Type | Resolution |
|-------------|------|-----------|
| `"github.com/alice/tova-http"` | Tova module | Resolved from `~/.tova/pkg/` cache |
| `"github.com/alice/tova-db/postgres"` | Tova sub-package | Sub-directory in cached module |
| `"./utils"` | Relative file | Local `.tova` file |
| `"../lib/helpers"` | Relative file | Local `.tova` file |
| `"zod"` | npm package | From `node_modules/` |
| `"@scope/pkg"` | Scoped npm package | From `node_modules/` |
| `"node:fs"` | Node built-in | Node.js built-in module |

**Detection rule:** An import source is a Tova module if its first path segment contains a dot (e.g., `github.com`). Everything else follows existing import behavior.

## Installing Dependencies

### From tova.toml

Install all dependencies declared in your project:

```bash
tova install
```

This:

1. Reads `[dependencies]` from `tova.toml`
2. Resolves all Tova module versions using minimum version selection
3. Fetches any modules not already in the global cache
4. Recursively resolves transitive dependencies
5. Collects all `[npm]` sections from the dependency tree
6. Generates `package.json` and runs `bun install` for npm deps
7. Writes `tova.lock` with pinned versions and SHAs

### From lock file

If a `tova.lock` exists, `tova install` uses the pinned versions instead of re-resolving. This ensures reproducible builds:

```bash
tova install          # uses tova.lock if present
tova install --fresh  # re-resolve, ignore lock file
tova install --offline # use cache only, no network
```

## Updating Packages

Update all dependencies within their declared constraints:

```bash
tova update
```

Update a specific package:

```bash
tova update github.com/alice/tova-http
```

This deletes the lock file entry and re-resolves, picking the latest version that satisfies all constraints.

## Removing Packages

Remove a Tova module:

```bash
tova remove github.com/alice/tova-http
```

Remove an npm package:

```bash
tova remove zod
```

Both update `tova.toml` and re-run installation.

## Version Constraints

Tova supports standard semver constraints:

| Constraint | Meaning | Example |
|-----------|---------|---------|
| `^1.2.0` | Compatible (same major) | Allows `1.2.0` through `1.x.x` |
| `~1.2.0` | Patch only (same minor) | Allows `1.2.0` through `1.2.x` |
| `>=1.0.0` | Minimum version | Allows `1.0.0` and above |
| `1.5.0` | Exact | Only `1.5.0` |

The caret (`^`) is the most common and is used by default when adding a package without a version specifier.

## Practical Tips

**Pin critical dependencies.** For production apps, consider using exact versions for critical packages to avoid surprises:

```toml
[dependencies]
"github.com/alice/tova-http" = "1.3.0"
```

**Check your lock file into version control.** The `tova.lock` file ensures everyone on your team gets the same dependency versions. Always commit it.

**Use `--offline` in CI.** If your CI cache includes `~/.tova/pkg/`, use `tova install --offline` to avoid network calls during builds.
