# Package Management

Tova packages are distributed via **git repositories**. There is no central registry. Module paths are domain-qualified (like Go), versions map to git tags, and a global cache avoids redundant downloads. Full npm interop means Tova packages can declare npm dependencies that get merged into the consumer's project.

## Why Decentralized?

Most package managers require a central registry -- a server that hosts packages, tracks downloads, and serves as a single point of failure. Tova takes a different approach:

- **No registry to run or pay for.** Packages live wherever your git repos live -- GitHub, GitLab, Gitea, your company's self-hosted server.
- **No publishing step.** Push a git tag, and your package is available to the world.
- **No single point of failure.** If GitHub is down, packages on GitLab still work. If your company's Gitea goes offline, you can use `--offline` to build from cache.
- **Private packages for free.** Private git repos are private packages. No paid registry tiers.

## Quick Start

### Using a package

Add a Tova package to your project:

```bash
tova add github.com/alice/tova-http
```

This fetches the latest version, adds it to your `tova.toml`, and installs it:

```toml
[dependencies]
"github.com/alice/tova-http" = "^1.3.0"
```

Then import and use it:

```tova
import { serve, router } from "github.com/alice/tova-http"

server {
  route GET "/" {
    "Hello from Tova!"
  }
}
```

### Creating a package

Scaffold a new library with the library template:

```bash
tova new my-lib --template library
```

This generates a `tova.toml` with a `[package]` section, a `src/lib.tova` entry point with `pub` exports, and a README with publishing instructions. Update the module path in `tova.toml` to match your git repository:

```toml
[package]
name = "github.com/yourname/my-lib"
version = "0.1.0"
description = "A Tova library"
license = "MIT"
exports = ["greet", "version"]
```

Publish by pushing a git tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

That's it. No `tova publish` command, no registry account, no build artifacts to upload. See [Creating Packages](/packages/creating-packages) for the full guide.

## How It Works

1. **Module paths** identify packages by their git host: `github.com/alice/tova-http`
2. **Versions** map to git tags: `v1.3.0` tag on the repo
3. **Resolution** uses minimum version selection (Go's strategy) -- deterministic, no SAT solver
4. **Cache** stores fetched packages globally at `~/.tova/pkg/` so they're shared across projects
5. **Lock file** (`tova.lock`) pins exact versions and commit SHAs for reproducible builds
6. **npm interop** merges npm dependencies from the entire Tova dependency tree into your `package.json`

## What's in This Section

- [Using Packages](/packages/using-packages) -- Find, add, update, and import packages
- [Creating Packages](/packages/creating-packages) -- Structure, publish, and maintain your own packages
- [tova.toml Reference](/packages/tova-toml) -- Full configuration reference for packages and projects
- [CLI Reference](/packages/cli-reference) -- All package management commands
- [Resolution & Caching](/packages/resolution) -- How dependency resolution, version selection, and caching work
- [Security & Integrity](/packages/security) -- Lock files, SHA pinning, and supply chain protection
