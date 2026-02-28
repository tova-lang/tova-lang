# Resolution & Caching

This page explains how Tova resolves dependency versions, fetches packages, and manages the global cache.

## Version Resolution

Tova uses **minimum version selection** (MVS), the same strategy used by Go modules. This is simpler and more predictable than the SAT-solver approach used by npm/yarn.

### How MVS works

Given a set of version constraints, MVS picks the **minimum version** that satisfies all of them. No ambiguity, no heuristics.

**Example:** If package A requires `^1.2.0` and package B requires `^1.3.0` of the same dependency:

- The constraints are: `>=1.2.0 <2.0.0` AND `>=1.3.0 <2.0.0`
- Available versions: `1.0.0`, `1.1.0`, `1.2.0`, `1.3.0`, `1.4.0`, `2.0.0`
- MVS selects: **`1.3.0`** (the minimum version satisfying both)

### Why MVS?

| Property | MVS (Tova/Go) | SAT solver (npm/yarn) |
|----------|---------------|----------------------|
| Deterministic | Always the same result | Can vary with solver heuristics |
| Reproducible | Same input = same output | Lock file required for reproducibility |
| Predictable | Minimum = fewest surprises | May pick newest, introducing untested code |
| Performance | Linear scan | NP-hard in general case |
| Debuggable | Easy to reason about | Conflict resolution can be opaque |

### One version per module

Tova does not allow multiple versions of the same module in a dependency tree. If two dependencies require incompatible versions (e.g., `^1.0.0` and `^2.0.0`), Tova reports a clear error instead of silently duplicating the module:

```
error: version conflict for github.com/alice/tova-http

  github.com/carol/web-framework requires ^1.0.0
  github.com/dave/api-toolkit requires ^2.0.0

  These constraints cannot be satisfied simultaneously.
  Tip: Check if either dependency has a newer version that resolves this.
```

## Resolution Flow

When you run `tova install`, the resolver follows this flow:

```
1. Read [dependencies] from tova.toml
         │
2. For each dependency:
   ├── Check tova.lock for pinned version
   │   └── If found: use pinned version
   └── If not found:
       ├── git ls-remote --tags → list available versions
       └── Select minimum version satisfying all constraints
         │
3. For each resolved module:
   ├── Check ~/.tova/pkg/ cache
   │   └── If cached: skip fetch
   └── If not cached:
       └── git clone --depth 1 --branch vX.Y.Z → cache
         │
4. Read each module's tova.toml
   └── Queue transitive [dependencies] for resolution (back to step 2)
         │
5. Collect all [npm] sections from dependency tree
         │
6. Write tova.lock with resolved versions + SHAs
         │
7. Generate package.json → bun install
```

## Global Cache

All fetched packages are stored in a global cache, shared across all projects on the machine.

### Cache location

Default: `~/.tova/pkg/`

Override with the `TOVA_CACHE_DIR` environment variable or pass `--cache-dir` to CLI commands.

### Cache structure

```
~/.tova/pkg/
├── github.com/
│   ├── alice/
│   │   └── tova-http/
│   │       ├── v1.2.0/          # Full source code (no .git)
│   │       │   ├── tova.toml
│   │       │   ├── src/
│   │       │   │   └── lib.tova
│   │       │   └── ...
│   │       └── v1.3.0/
│   └── bob/
│       └── tova-jwt/
│           └── v1.0.0/
├── gitlab.com/
│   └── ...
└── .cache/                      # Compiled .js output
    └── github.com/
        └── alice/
            └── tova-http/
                └── v1.3.0/
                    └── lib.js
```

### How fetching works

When a package version is not cached:

1. `git clone --depth 1 --branch v{version} {url}` into a temp directory
2. Remove the `.git` directory (saves disk space)
3. Move the source to the final cache path (`~/.tova/pkg/host/owner/repo/vX.Y.Z/`)

Shallow clones (`--depth 1`) minimize download size -- only the tagged commit is fetched, not the full history.

### Cache validation

A cached version is considered valid if:
- The version directory exists (e.g., `~/.tova/pkg/github.com/alice/tova-http/v1.3.0/`)
- A `tova.toml` file exists in that directory

### Compilation cache

When the compiler processes a Tova module import, it compiles the `.tova` files to `.js` and stores the output in `.cache/`. Subsequent compilations reuse the cached output, avoiding redundant compilation of dependencies.

## Transitive Dependencies

Tova resolves transitive dependencies automatically. If your project depends on `A`, and `A` depends on `B`, then `B` is fetched and cached too.

### npm dependency merging

Transitive npm dependencies are collected from the entire Tova dependency tree and merged into the consumer's `package.json`:

```
my-app
├── depends on: github.com/alice/http (npm: cookie-parser ^1.4.0)
└── depends on: github.com/bob/jwt (npm: jsonwebtoken ^9.0.0)
    └── depends on: github.com/carol/logger (npm: winston ^3.0.0)
```

The generated `package.json` will include `cookie-parser`, `jsonwebtoken`, and `winston` -- all from the transitive tree.

When the same npm package appears in multiple dependencies with different constraints, the highest constraint wins:

```
alice/http declares: zod ^3.0.0
bob/jwt declares:   zod ^3.2.0
→ Generated package.json: zod ^3.2.0
```

## Offline Mode

Use `tova install --offline` to resolve and build using only what's already in the global cache. No network calls are made. If a required version is not cached, the command fails with an error listing available cached versions:

```
error: failed to fetch github.com/alice/tova-http

  Cached versions available: v1.2.0, v1.2.1
  Tip: Run with --offline to use cached versions only.
```

This is useful for:
- CI/CD pipelines with pre-populated caches
- Air-gapped environments
- Faster builds when you know everything is cached

## Circular Dependency Detection

Tova does not allow circular module dependencies. If `A` depends on `B` and `B` depends on `A`, the resolver reports an error:

```
error: circular dependency detected

  github.com/alice/http → github.com/bob/middleware → github.com/alice/http

  Tova does not allow circular module dependencies.
```

Circular dependencies between `.tova` files within the same package are fine (they're handled by the multi-file merge system). Only cross-module circular dependencies are prohibited.
