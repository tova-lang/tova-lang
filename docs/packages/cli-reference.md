# CLI Reference

All package management commands are available through the `tova` CLI.

## tova add

Add a dependency to your project.

### Tova packages

```bash
# Add latest version
tova add github.com/alice/tova-http

# Add specific version
tova add github.com/alice/tova-http@1.3.0

# Add with version constraint
tova add github.com/alice/tova-http@^1.0.0
```

The command detects Tova modules by the dot in the first path segment (e.g., `github.com`). It:

1. Queries the remote repository for available version tags
2. Selects the latest version (or the specified version/constraint)
3. Adds `"github.com/alice/tova-http" = "^1.3.0"` to the `[dependencies]` section
4. Runs `tova install` to fetch and cache the package

### npm packages

```bash
# With npm: prefix
tova add npm:zod

# With --npm flag
tova add zod --npm

# With version
tova add npm:zod@3.22.0
```

npm packages are added to the `[npm]` section of `tova.toml`.

## tova install

Install all dependencies from `tova.toml`.

```bash
tova install            # Install from tova.toml + tova.lock
tova install --fresh    # Re-resolve all versions, ignore lock file
tova install --offline  # Use cached versions only, no network
```

### What it does

1. Reads `[dependencies]` and `[npm]` from `tova.toml`
2. For Tova modules: resolves versions using minimum version selection
3. Fetches uncached modules via `git clone --depth 1`
4. Reads transitive dependencies from each module's `tova.toml`
5. Collects all npm dependencies from the entire Tova dependency tree
6. Generates `package.json` and runs `bun install`
7. Writes `tova.lock` with pinned versions and commit SHAs

### Lock file behavior

- If `tova.lock` exists, pinned versions are used (no network calls for already-locked modules)
- Use `--fresh` to ignore the lock file and re-resolve everything
- Use `--offline` to skip all network calls and use only what's in `~/.tova/pkg/`

## tova remove

Remove a dependency from your project.

```bash
# Remove a Tova module
tova remove github.com/alice/tova-http

# Remove an npm package
tova remove zod
```

Removes the entry from the appropriate section in `tova.toml` and re-runs installation.

## tova update

Update dependencies to newer versions within their declared constraints.

```bash
# Update all Tova dependencies
tova update

# Update a specific package
tova update github.com/alice/tova-http
```

This deletes the lock file (or the specific entry) and re-resolves, picking the latest versions that satisfy all constraints. The lock file is then regenerated with the new versions.

## tova search

Search for Tova packages on GitHub.

```bash
tova search http server
tova search database orm
tova search jwt authentication
```

Searches the GitHub API for repositories tagged with `topic:tova-package` matching your query. Results show:

```
  github.com/alice/tova-http
    HTTP server and client for Tova
    Stars: 142  Updated: 2026-02-15

  github.com/bob/tova-router
    Fast router with middleware support
    Stars: 87  Updated: 2026-02-10
```

Results are sorted by stars and limited to 20 entries.

## tova cache

Manage the global package cache at `~/.tova/pkg/`.

```bash
# List all cached modules and versions
tova cache list

# Print the cache directory path
tova cache path

# Clear the entire cache
tova cache clean
```

### Cache structure

```
~/.tova/pkg/
├── github.com/
│   ├── alice/
│   │   └── tova-http/
│   │       ├── v1.2.0/
│   │       └── v1.3.0/
│   └── bob/
│       └── tova-jwt/
│           └── v1.0.0/
└── .cache/              # Compiled .js output
```

The cache is shared across all projects on your machine. Clearing it is safe -- packages are re-fetched on the next `tova install`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TOVA_CACHE_DIR` | `~/.tova/pkg` | Override the global cache directory |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (version conflict, network failure, auth failure, etc.) |

All errors include descriptive messages with tips for resolution. See [Security & Integrity](/packages/security) for details on integrity check errors.
