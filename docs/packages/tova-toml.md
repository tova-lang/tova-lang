# tova.toml Reference

The `tova.toml` file is the project manifest for both Tova applications and packages. It declares metadata, dependencies, build configuration, and npm interop settings.

## Application vs Package

A `tova.toml` serves two roles depending on which top-level section it contains:

| Section | Role | Purpose |
|---------|------|---------|
| `[project]` | Application | A Tova app that consumes packages |
| `[package]` | Library | A publishable Tova package |

A file can contain only one of `[project]` or `[package]`.

## Application Configuration

### [project]

```toml
[project]
name = "my-app"
version = "0.1.0"
entry = "src"
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | `"tova-app"` | Project name |
| `version` | string | `"0.1.0"` | Project version |
| `entry` | string | `"src"` | Source directory |

### [dev]

Development server configuration:

```toml
[dev]
port = 3000
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | integer | `3000` | Dev server port |

### [build]

Build output configuration:

```toml
[build]
outDir = ".tova-out"
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `outDir` | string | `".tova-out"` | Build output directory |

## Package Configuration

### [package]

```toml
[package]
name = "github.com/alice/tova-http"
version = "1.3.0"
description = "HTTP server and client for Tova"
license = "MIT"
keywords = ["http", "server", "web"]
homepage = "https://alice.dev/tova-http"
exports = ["serve", "router", "Request", "Response"]
entry = "src/lib.tova"
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Full module path (must match git location) |
| `version` | string | Yes | Semver version (must match git tag) |
| `description` | string | No | Short description for search results |
| `license` | string | No | SPDX license identifier |
| `keywords` | string[] | No | Search keywords |
| `homepage` | string | No | Documentation URL |
| `exports` | string[] | No | Explicit public API. If omitted, all `pub` names are exported |
| `entry` | string | No | Custom entry file path (default: auto-detected) |

## Dependencies

### [dependencies] -- Tova modules

Declare dependencies on other Tova packages:

```toml
[dependencies]
"github.com/bob/tova-jwt" = "^1.0.0"
"github.com/carol/tova-logger" = "~2.1.0"
"github.com/dave/tova-config" = "1.0.0"
```

Keys are quoted because module paths contain dots and slashes. Values are [semver constraints](#version-constraints).

### [npm] -- npm production dependencies

```toml
[npm]
zod = "^3.0.0"
cookie-parser = "^1.4.0"
```

These are installed via `bun install` and included in the generated `package.json`. For packages, these are also merged into the consumer's dependencies.

### [npm.dev] -- npm dev dependencies

```toml
[npm.dev]
vitest = "^1.0.0"
prettier = "^3.0.0"
```

Dev dependencies are only installed for the current project, never merged into consumers.

## Version Constraints

| Syntax | Name | Meaning |
|--------|------|---------|
| `^1.2.0` | Caret | `>=1.2.0` and `<2.0.0` (compatible updates) |
| `~1.2.0` | Tilde | `>=1.2.0` and `<1.3.0` (patch updates only) |
| `>=1.0.0` | Greater or equal | `>=1.0.0` (any version at or above) |
| `>1.0.0` | Greater than | `>1.0.0` (strictly above) |
| `1.5.0` | Exact | Only `1.5.0` |

The caret (`^`) is recommended for most dependencies. It allows compatible updates (new features, bug fixes) while preventing breaking changes.

## Complete Examples

### Application

```toml
[project]
name = "my-web-app"
version = "1.0.0"
entry = "src"

[dev]
port = 3000

[build]
outDir = "dist"

[dependencies]
"github.com/alice/tova-http" = "^1.3.0"
"github.com/bob/tova-jwt" = "^1.0.0"

[npm]
zod = "^3.0.0"

[npm.dev]
vitest = "^1.0.0"
```

### Package

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
