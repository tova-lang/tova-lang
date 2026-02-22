# Tova Documentation Audit — Task List

Generated: 2026-02-21

## Summary

- **106 undocumented stdlib functions** across 6 missing doc pages
- **7 undocumented CLI commands**
- **3 undocumented migration subcommands**
- **1 completely undocumented language feature** (`bench` blocks)
- **6 under-documented features**
- **1 documentation inconsistency** (`@click` vs `on:click`)
- **1 discoverability issue** (AI docs isolated from server reference)

---

## Phase 1: Missing Stdlib Doc Pages (Highest Impact)

### Task 1.1 — Create `docs/stdlib/filesystem.md`

16 undocumented functions. No doc page exists.

Functions to document:
- `read(path)` — read file contents (low-level, not the data-format `read()` in `guide/io.md`)
- `read_text(path)` — read file as string
- `read_bytes(path)` — read file as bytes
- `read_lines(path)` — read file as array of lines
- `write(path, data)` — write data to file
- `write_text(path, text)` — write string to file
- `exists(path)` — check if path exists
- `is_file(path)` — check if path is a file
- `is_dir(path)` — check if path is a directory
- `is_symlink(path)` — check if path is a symlink
- `file_size(path)` — get file size
- `readlink(path)` — read symlink target
- `symlink(target, path)` — create symlink
- `mv(src, dest)` — move/rename file
- `rename(src, dest)` — rename file
- `glob_files(pattern)` — find files by glob pattern

Also document:
- `atime(path)` — file access time
- `chdir(path)` — change working directory
- `fs` — filesystem module namespace

Reference implementation: `src/stdlib/inline.js`

---

### Task 1.2 — Create `docs/stdlib/path.md`

6 undocumented functions. No doc page exists.

Functions to document:
- `path_join(...parts)` — join path segments
- `path_resolve(path)` — resolve to absolute path
- `path_relative(from, to)` — get relative path
- `path_basename(path)` — get filename from path
- `path_dirname(path)` — get directory from path
- `path_ext(path)` — get file extension

Reference implementation: `src/stdlib/inline.js`

---

### Task 1.3 — Create `docs/stdlib/process.md`

8+ undocumented functions. No doc page exists.

Functions to document:
- `args()` — get command-line arguments
- `parse_args(config)` — parse CLI arguments with schema
- `cwd()` — get current working directory
- `env(name)` — get environment variable
- `set_env(name, value)` — set environment variable
- `exit(code?)` — exit process
- `on_signal(signal, handler)` — handle OS signals
- `script_dir()` — get directory of current script
- `script_path()` — get path of current script

Reference implementation: `src/stdlib/inline.js`

---

### Task 1.4 — Create `docs/stdlib/table.md`

23+ undocumented functions. No doc page exists. (Note: `docs/guide/data.md` covers the *syntax* of data blocks but not these stdlib functions.)

Functions to document:

**Selection & Filtering:**
- `select(table, ...cols)` — select columns
- `where(table, predicate)` — filter rows
- `columns(table)` — get column names

**Transformation:**
- `table_derive(table, col, expr)` — add/compute column
- `table_rename(table, mapping)` — rename columns
- `table_select(table, ...cols)` — select columns (table-prefixed)
- `table_where(table, predicate)` — filter rows (table-prefixed)
- `table_sort_by(table, col)` — sort by column
- `table_limit(table, n)` — limit rows

**Aggregation:**
- `agg(table, config)` — aggregate with config
- `agg_count(col)` — count aggregation
- `agg_sum(col)` — sum aggregation
- `agg_mean(col)` — mean aggregation
- `agg_median(col)` — median aggregation
- `agg_min(col)` — min aggregation
- `agg_max(col)` — max aggregation

**Reshaping:**
- `pivot(table, config)` — pivot table
- `unpivot(table, config)` — unpivot table
- `explode(table, col)` — explode array column into rows
- `table_explode(table, col)` — same, table-prefixed

**Joining & Combining:**
- `table_join(left, right, config)` — join tables
- `table_union(a, b)` — union tables

**Cleaning:**
- `drop_duplicates(table)` / `table_drop_duplicates(table)` — remove duplicate rows
- `fill_nil(table, col, value)` — fill nil values
- `drop_nil(list)` — remove nil values from list

**Inspection:**
- `schema_of(table)` — get table schema
- `peek(data)` — inspect data (prints and returns)
- `describe(table)` — summary statistics

Reference implementation: `src/stdlib/inline.js`

---

### Task 1.5 — Create `docs/stdlib/testing.md`

4 undocumented functions. No doc page exists. (Note: `docs/stdlib/assertions.md` covers `assert`/`assert_eq`/`assert_ne`/`assert_throws` but not these.)

Functions to document:
- `assert_snapshot(value)` — snapshot testing
- `create_mock(impl?)` — create mock object
- `create_spy(fn?)` — create spy function
- `describe(name, fn)` — test grouping/suite

Reference implementation: `src/stdlib/inline.js`

---

### Task 1.6 — Create `docs/stdlib/terminal.md`

3 undocumented functions. No doc page exists.

Functions to document:
- `bold(text)` — bold terminal text
- `dim(text)` — dim terminal text
- `gray(text)` — gray terminal text

Also document:
- `stderr(text)` — write to stderr
- `read_stdin()` — read from stdin

Reference implementation: `src/stdlib/inline.js`

---

### Task 1.7 — Add undocumented functions to existing stdlib pages

These functions exist in `src/stdlib/inline.js` but aren't on any doc page. Add them to the appropriate existing pages:

**Add to `docs/stdlib/result-option.md`:**
- `filter_err(list)` — filter list to only Err values
- `filter_ok(list)` — filter list to only Ok values
- `map_err(result, fn)` — map over Err value
- `map_ok(result, fn)` — map over Ok value
- `failed(value)` — check if value is an Err

**Add to `docs/stdlib/collections.md`:**
- `sort_by(list, fn)` — sort by key function
- `compare(a, b)` — compare two values
- `compare_by(a, b, fn)` — compare by key function
- `equal(a, b)` — deep equality check

**Add to `docs/stdlib/objects.md`:**
- `map_keys(obj, fn)` — transform object keys

**Add to `docs/stdlib/conversion.md`:**
- `arr(value)` / `array(value)` — convert to array
- `bool(value)` — convert to boolean
- `cast(value, type)` — cast value to type
- `float(value)` — convert to float
- `int(value)` — convert to integer
- `str(value)` / `string(value)` — convert to string

**Add to `docs/stdlib/regex.md`:**
- `regex_builder()` — fluent regex builder

**Add to `docs/stdlib/async.md`:**
- `race(promises)` — first promise to resolve

**Add to `docs/stdlib/functional.md`:**
- `lazy(fn)` — create lazy-evaluated value
- `force(lazy)` — force evaluation of lazy value
- `recursive(fn)` — recursive function helper

**Add to `docs/stdlib/datetime.md`:**
- `date(...)` / `dt(...)` — date creation aliases

**Unclear placement (pick best fit or add to a "Misc" section in index.md):**
- `default(value, fallback)` — return fallback if value is nil
- `derive(type, traits)` — derive trait implementations
- `groups(match)` — get regex match groups
- `hash(value)` — hash a value
- `iter(collection)` — create iterator
- `value(wrapper)` — extract inner value
- `collections` — collections module namespace
- `json` — JSON module namespace
- `re` — regex module namespace
- `url` — URL module namespace

---

## Phase 2: Missing Language Feature Docs

### Task 2.1 — Document `bench` blocks (completely undocumented)

The `bench` block is a fully implemented language feature with zero documentation.

**Code locations:**
- Parser: `src/parser/parser.js` — `parseBenchBlock()`
- AST: `src/parser/ast.js` — `BenchBlock` class
- Analyzer: `src/analyzer/analyzer.js` — line 722, `case 'BenchBlock'`
- CLI: `bin/tova.js` — `case 'bench':` (line 138)

**Where to document:**
- Add a "Benchmarks" section to `docs/tooling/test-runner.md`, OR
- Create a new `docs/tooling/benchmarks.md`

**Content needed:**
- `bench "name" { ... }` syntax
- `tova bench [dir]` CLI command
- How results are reported
- Examples

---

### Task 2.2 — Document `test` block options (undocumented)

The parser supports options on test blocks that are not in the docs.

**Code location:** `src/parser/parser.js` — `new AST.TestBlock(name, body, l, { timeout, beforeEach, afterEach })`

**Where to document:** `docs/tooling/test-runner.md`

**Content needed:**
- `timeout` option — how to set per-test timeout
- `beforeEach` — setup before each test
- `afterEach` — teardown after each test
- Examples of each

---

### Task 2.3 — Document route group versioning (undocumented)

The parser and server codegen support API versioning on route groups.

**Code locations:**
- Parser: `src/parser/server-parser.js` — `parseRouteGroup()` (lines 274-310) supports `version`, `deprecated`, `sunset` keywords
- Codegen: `src/codegen/server-codegen.js` — line 200, `stmt.version || groupVersion`

**Where to document:** `docs/server/routes.md` (Route Groups section)

**Syntax:**
```tova
routes "/api/v2" version: "2" deprecated: true sunset: "2025-06-01" {
  route GET "/users" => fn(req) { ... }
}
```

---

### Task 2.4 — Document session usage API (only config is documented)

`docs/server/configuration.md` shows how to configure sessions but not how to use them in route handlers.

**Where to document:** `docs/server/configuration.md` (Sessions section) — add usage examples

**Content needed:**
- Reading session data in handlers
- Writing session data
- Destroying sessions
- Session with authentication flow example

---

### Task 2.5 — Document upload handling API (only config is documented)

`docs/server/configuration.md` shows `upload { max_size, allowed_types }` but not how to handle uploads in routes.

**Where to document:** `docs/server/configuration.md` (File Upload section) — add usage examples

**Content needed:**
- How uploaded files are accessed in route handlers
- Multipart form data handling
- Saving uploaded files
- Example upload route

---

### Task 2.6 — Expand `type` alias documentation

Currently only 3 one-liner examples in `docs/guide/types.md` (lines ~214-220).

**Where to document:** `docs/guide/types.md` (Type Aliases section)

**Content needed:**
- How type aliases are resolved
- Using type aliases with generics
- Type alias vs type declaration differences
- More examples

---

### Task 2.7 — Expand `extern` declaration documentation

Currently only 3 one-liner examples in `docs/guide/js-interop.md`.

**Where to document:** `docs/guide/js-interop.md` (Extern Declarations section)

**Content needed:**
- How extern interacts with the analyzer (suppresses undefined warnings)
- `async` extern functions
- Whether extern can declare non-function values
- Runtime behavior (what happens if the extern doesn't exist)
- Relationship to `import`
- More examples

---

## Phase 3: Missing CLI Command Docs

### Task 3.1 — Add undocumented CLI commands to `docs/tooling/cli.md`

7 commands exist in `bin/tova.js` but are not in the CLI reference:

| Command | Code Line | Description |
|---|---|---|
| `tova bench [dir]` | line 138 | Run benchmark blocks |
| `tova check [dir]` | line 102 | Type-check without code generation |
| `tova clean` | line 105 | Delete `.tova-out/` build artifacts |
| `tova doc [dir]` | line 141 | Generate documentation from `///` docstrings |
| `tova explain <code>` | line 162 | Show explanation for error/warning code |
| `tova init` | line 120 | Initialize Tova project in current directory |
| `tova upgrade` | line 182 | Upgrade to latest Tova version |
| `tova info` | line 185 | Show version and environment info |

---

### Task 3.2 — Add undocumented migration subcommands to `docs/tooling/cli.md`

3 migration subcommands exist in `bin/tova.js` but are not in the CLI reference:

| Command | Code Line | Description |
|---|---|---|
| `tova migrate:down [file]` | line 150 | Revert migrations |
| `tova migrate:reset [file]` | line 153 | Reset all migrations |
| `tova migrate:fresh [file]` | line 156 | Reset and re-run all migrations |

---

## Phase 4: Consistency Fixes

### Task 4.1 — Fix event handler syntax inconsistency (`@click` vs `on:click`)

**Problem:** Two different syntaxes are used across the docs:
- `@click` — used in 2 files, 4 occurrences (`docs/fullstack/client-block.md`, `docs/fullstack/rpc.md`)
- `on:click` — used in 13 files, 59 occurrences (all reactivity docs, examples, components, etc.)

**Action:** Check which syntax the parser/codegen actually supports. If both work, document both and note the canonical form. If only `on:click` works, fix the 4 `@click` occurrences in `client-block.md` and `rpc.md`.

---

### Task 4.2 — Link AI docs from server reference

**Problem:** `docs/guide/ai.md` is comprehensive but isolated from the server docs. A developer reading `docs/fullstack/server-block.md` or browsing `docs/server/` would never discover AI integration.

**Action:**
- Add `ai {}` mention to `docs/fullstack/server-block.md` feature list
- Add AI link to the server section's "Related Pages" or sidebar
- Consider adding `docs/server/ai.md` that redirects to or summarizes `docs/guide/ai.md`

---

### Task 4.3 — Update sidebar navigation in `.vitepress/config.js`

After creating new stdlib pages (filesystem, path, process, table, testing, terminal), add them to the sidebar navigation.

**File:** `docs/.vitepress/config.js`

**Add to Standard Library section:**
- Filesystem
- Path
- Process / CLI
- Table / Data
- Testing
- Terminal / I/O

**Add to Tooling section (if benchmarks page created):**
- Benchmarks

---

## Reference: Full List of 106 Undocumented Stdlib Functions

```
agg, agg_count, agg_max, agg_mean, agg_median, agg_min, agg_sum,
args, arr, array, assert_snapshot, atime, bold, bool, cast, chdir,
collections, columns, compare, compare_by, create_mock, create_spy,
cwd, date, default, derive, describe, dim, drop_duplicates, drop_nil,
dt, env, equal, exists, exit, explode, failed, file_size, fill_nil,
filter_err, filter_ok, float, force, fs, glob_files, gray, groups,
hash, int, is_dir, is_file, is_symlink, iter, json, lazy, map_err,
map_keys, map_ok, mv, on_signal, parse_args, path_basename,
path_dirname, path_ext, path_join, path_relative, path_resolve, peek,
pivot, race, re, read, read_bytes, read_lines, read_stdin, read_text,
readlink, recursive, regex_builder, rename, schema_of, script_dir,
script_path, select, set_env, sort_by, stderr, str, string, symlink,
table_derive, table_drop_duplicates, table_explode, table_join,
table_limit, table_rename, table_select, table_sort_by, table_union,
table_where, unpivot, url, value, where, write, write_text
```
