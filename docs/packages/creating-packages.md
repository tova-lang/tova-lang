# Creating Packages

Any git repository with a `tova.toml` containing a `[package]` section is a Tova package. There is no build step, no registry account, and no special tooling required.

## Package Structure

A minimal Tova package looks like this:

```
tova-http/
  tova.toml          # Package manifest
  src/
    lib.tova         # Entry point (default)
```

A more complete package:

```
tova-http/
  tova.toml          # Package manifest
  src/
    lib.tova         # Main entry point — re-exports public API
    server.tova      # Server implementation
    router.tova      # Router implementation
    types.tova       # Shared types
  tests/
    server.test.js   # Tests
    router.test.js
  README.md
```

## The Package Manifest

The `[package]` section in `tova.toml` declares your repo as a publishable Tova package:

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

[npm]
cookie-parser = "^1.4.0"

[npm.dev]
vitest = "^1.0.0"
```

### Required fields

- **`name`** -- The full module path. Must match the git hosting location (e.g., `github.com/alice/tova-http`).
- **`version`** -- The current version. Should follow [semver](https://semver.org/). Must match the git tag you push.

### Optional fields

- **`description`** -- A short description shown in search results.
- **`license`** -- The SPDX license identifier (e.g., `MIT`, `Apache-2.0`).
- **`keywords`** -- An array of strings for search discoverability.
- **`homepage`** -- URL to the package's documentation or website.
- **`exports`** -- An explicit list of public names. Only these names can be imported by consumers. If omitted, all top-level `pub` declarations are importable.
- **`entry`** -- Custom entry point file (default resolution: `src/lib.tova` then `lib.tova` then `index.tova`).

## Entry Point Resolution

When a consumer imports from your package, the compiler looks for the entry point in this order:

1. The `entry` field in `tova.toml` (if specified)
2. `src/lib.tova`
3. `lib.tova`
4. `index.tova`
5. `src/index.tova`
6. `src/main.tova`
7. `main.tova`

The first file found is used. If none exist, the consumer gets a clear error with suggestions.

::: tip
`src/lib.tova` is the conventional entry point. Use it unless you have a reason not to.
:::

### The entry file

Your entry file should re-export the public API:

```tova
// src/lib.tova
pub fn serve(port, handler) {
  // ...
}

pub fn router() {
  // ...
}

pub type Request {
  method: String
  path: String
  headers: Map
  body: String
}

pub type Response {
  status: Int
  headers: Map
  body: String
}
```

Or import from internal modules and re-export:

```tova
// src/lib.tova
import { serve } from "./server"
import { router } from "./router"
import { Request, Response } from "./types"

pub serve
pub router
pub Request
pub Response
```

## Sub-Packages

A single repository can contain multiple sub-packages organized as directories. Each sub-package has its own entry point:

```
tova-db/
  tova.toml
  src/
    lib.tova           # Main entry: import from "github.com/alice/tova-db"
  postgres/
    lib.tova           # Sub-package: import from "github.com/alice/tova-db/postgres"
  redis/
    lib.tova           # Sub-package: import from "github.com/alice/tova-db/redis"
  sqlite/
    lib.tova           # Sub-package: import from "github.com/alice/tova-db/sqlite"
```

Consumers import from sub-packages by appending the directory path:

```tova
import { Pool } from "github.com/alice/tova-db/postgres"
import { Redis } from "github.com/alice/tova-db/redis"
```

## Declaring Dependencies

### Tova dependencies

If your package depends on other Tova packages, list them in `[dependencies]`:

```toml
[dependencies]
"github.com/bob/tova-jwt" = "^1.0.0"
"github.com/carol/tova-logger" = "~2.1.0"
```

These are resolved transitively when a consumer installs your package.

### npm dependencies

If your package uses npm packages internally, declare them in `[npm]`:

```toml
[npm]
cookie-parser = "^1.4.0"
cors = "^2.8.0"

[npm.dev]
vitest = "^1.0.0"
```

Production npm dependencies (`[npm]`) are merged into the consumer's `package.json` during `tova install`. Dev dependencies (`[npm.dev]`) are not.

## Controlling the Public API

The `exports` field in `tova.toml` explicitly lists what consumers can import:

```toml
[package]
name = "github.com/alice/tova-http"
version = "1.3.0"
exports = ["serve", "router", "Request", "Response"]
```

With this declaration:

```tova
import { serve } from "github.com/alice/tova-http"     // OK
import { _internal } from "github.com/alice/tova-http"  // Error: not exported
```

If `exports` is omitted, all top-level `pub` declarations are importable. Specifying `exports` is recommended for packages with a large internal surface area -- it prevents consumers from depending on implementation details.

## Publishing

Publishing a Tova package is just pushing a git tag:

```bash
# Make sure tova.toml version matches
git tag v1.3.0
git push origin v1.3.0
```

The package is "published" because the tag exists on the remote. Any Tova project can now depend on it.

### Version checklist

Before tagging a release:

1. Update `version` in `tova.toml` to match the tag
2. Run your tests: `bun test`
3. Commit the version bump
4. Create and push the tag

```bash
# Example release workflow
git add tova.toml
git commit -m "chore: bump to v1.3.0"
git tag v1.3.0
git push origin main v1.3.0
```

### Semver guidelines

Follow [semantic versioning](https://semver.org/):

| Change | Version Bump | Example |
|--------|-------------|---------|
| Breaking API change | Major | `1.3.0` → `2.0.0` |
| New feature, backwards compatible | Minor | `1.3.0` → `1.4.0` |
| Bug fix, backwards compatible | Patch | `1.3.0` → `1.3.1` |

Breaking changes include: removing or renaming exported functions/types, changing function signatures, changing behavior that consumers rely on.

### Making your package discoverable

To help others find your package:

1. Add the `tova-package` topic to your GitHub repository
2. Write a clear `description` in your `tova.toml`
3. Add relevant `keywords`
4. Include a `README.md` with usage examples

## Private Packages

Private git repositories work as private Tova packages with no additional configuration. If a consumer has git access to the repo (via SSH keys or git credentials), they can depend on it:

```toml
[dependencies]
"gitea.mycompany.com/internal/auth" = "^1.0.0"
```

Consumers without access will get a clear authentication error with suggestions.

## Practical Tips

**Keep your public API small.** Export only what consumers need. A smaller API surface is easier to maintain and makes semver guarantees simpler.

**Use sub-packages for large libraries.** Instead of one monolithic entry point, let consumers import only what they need:

```tova
// Consumer only pulls in postgres, not redis or sqlite
import { Pool } from "github.com/alice/tova-db/postgres"
```

**Test against minimum supported versions.** If you depend on `"github.com/bob/utils" = "^1.2.0"`, make sure your code works with `v1.2.0`, not just the latest `v1.x`.

**Don't force-push tags.** Tova's lock file records the commit SHA for each tag. Force-pushing a tag changes the SHA, which causes integrity check failures for all consumers. If you need to fix a release, publish a new patch version instead.
