# Tova Package Ecosystem — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Tova package ecosystem — stdlib enhancements (print/fmt, crypto, http, cache, log) plus 10 first-party packages under `tova/*` shorthand, each in its own GitHub repo at `github.com/tova-lang/<package>`.

**Architecture:** Hybrid approach. Five stdlib namespace modules are added directly to `src/stdlib/inline.js`. Ten first-party packages live as independent Tova library projects in `/Users/macm1/new-y-combinator/tova-packages/<name>/`. A blessed-package mapping in `src/config/module-path.js` expands `tova/<name>` to `github.com/tova-lang/<name>` so users never type full URLs.

**Tech Stack:** Tova language, Bun runtime, Node.js crypto/fetch APIs, Web Crypto API (edge targets)

---

## Phase 0: Blessed Package Resolution

### Task 0.1: Add `tova/*` shorthand expansion to module-path.js

**Files:**
- Modify: `src/config/module-path.js`
- Test: `tests/module-path.test.js`

**Context:** Currently `isTovModule()` returns `false` for `tova/data` because the first segment `tova` doesn't contain a dot. `parseModulePath()` requires 3+ segments (`host/owner/repo`). We need a blessed-package map that expands `tova/X` → `github.com/tova-lang/X` before the existing resolution pipeline sees it.

**Step 1: Write the failing tests**

In `tests/module-path.test.js`, add:

```javascript
import { describe, test, expect } from 'bun:test';
import { isTovModule, parseModulePath, expandBlessedPackage, BLESSED_PACKAGES } from '../src/config/module-path.js';

describe('blessed package resolution', () => {
  test('BLESSED_PACKAGES contains all 10 official packages', () => {
    const expected = ['fp', 'validate', 'encoding', 'test', 'retry', 'template', 'data', 'stats', 'plot', 'ml'];
    for (const pkg of expected) {
      expect(BLESSED_PACKAGES).toHaveProperty(pkg);
      expect(BLESSED_PACKAGES[pkg]).toBe(`github.com/tova-lang/${pkg}`);
    }
  });

  test('expandBlessedPackage expands tova/data to full path', () => {
    expect(expandBlessedPackage('tova/data')).toBe('github.com/tova-lang/data');
  });

  test('expandBlessedPackage expands tova/fp to full path', () => {
    expect(expandBlessedPackage('tova/fp')).toBe('github.com/tova-lang/fp');
  });

  test('expandBlessedPackage returns null for unknown tova/ packages', () => {
    expect(expandBlessedPackage('tova/unknown')).toBe(null);
  });

  test('expandBlessedPackage returns null for non-tova paths', () => {
    expect(expandBlessedPackage('github.com/alice/lib')).toBe(null);
    expect(expandBlessedPackage('./local')).toBe(null);
    expect(expandBlessedPackage('lodash')).toBe(null);
  });

  test('isTovModule recognizes tova/ shorthand as a Tova module', () => {
    expect(isTovModule('tova/data')).toBe(true);
    expect(isTovModule('tova/fp')).toBe(true);
  });

  test('isTovModule rejects unknown tova/ packages', () => {
    expect(isTovModule('tova/unknown')).toBe(false);
  });

  test('parseModulePath works with tova/ shorthand', () => {
    const parsed = parseModulePath('tova/data');
    expect(parsed.host).toBe('github.com');
    expect(parsed.owner).toBe('tova-lang');
    expect(parsed.repo).toBe('data');
    expect(parsed.full).toBe('github.com/tova-lang/data');
  });

  test('parseModulePath preserves subpath in tova/ shorthand', () => {
    const parsed = parseModulePath('tova/encoding/toml');
    expect(parsed.host).toBe('github.com');
    expect(parsed.owner).toBe('tova-lang');
    expect(parsed.repo).toBe('encoding');
    expect(parsed.subpath).toBe('toml');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/module-path.test.js`
Expected: FAIL — `expandBlessedPackage` not exported, `tova/data` not recognized.

**Step 3: Implement blessed package resolution**

In `src/config/module-path.js`, add at the top (before existing functions):

```javascript
// Blessed first-party packages: tova/X → github.com/tova-lang/X
export const BLESSED_PACKAGES = {
  fp: 'github.com/tova-lang/fp',
  validate: 'github.com/tova-lang/validate',
  encoding: 'github.com/tova-lang/encoding',
  test: 'github.com/tova-lang/test',
  retry: 'github.com/tova-lang/retry',
  template: 'github.com/tova-lang/template',
  data: 'github.com/tova-lang/data',
  stats: 'github.com/tova-lang/stats',
  plot: 'github.com/tova-lang/plot',
  ml: 'github.com/tova-lang/ml',
};

export function expandBlessedPackage(source) {
  if (!source || !source.startsWith('tova/')) return null;
  const rest = source.slice(5); // strip 'tova/'
  const name = rest.split('/')[0]; // first segment after tova/
  if (BLESSED_PACKAGES[name]) return BLESSED_PACKAGES[name] + (rest.includes('/') ? '/' + rest.slice(name.length + 1) : '');
  return null;
}
```

Then modify `isTovModule()`:

```javascript
export function isTovModule(source) {
  if (!source || source.startsWith('.') || source.startsWith('/') || source.startsWith('@') || source.includes(':')) {
    return false;
  }
  // Check blessed packages first
  if (source.startsWith('tova/')) {
    const name = source.slice(5).split('/')[0];
    return !!BLESSED_PACKAGES[name];
  }
  const firstSegment = source.split('/')[0];
  return firstSegment.includes('.');
}
```

Then modify `parseModulePath()` to expand blessed packages before parsing:

```javascript
export function parseModulePath(source) {
  // Expand blessed packages: tova/data → github.com/tova-lang/data
  const expanded = expandBlessedPackage(source);
  const actual = expanded || source;

  if (!expanded && !isTovModule(actual)) {
    throw new Error(`Invalid Tova module path: "${source}"`);
  }
  const parts = actual.split('/');
  if (parts.length < 3) {
    throw new Error(`Invalid Tova module path: "${source}" — expected at least host/owner/repo`);
  }
  const host = parts[0];
  const owner = parts[1];
  const repo = parts[2];
  const subpath = parts.length > 3 ? parts.slice(3).join('/') : null;
  return { host, owner, repo, subpath, full: `${host}/${owner}/${repo}` };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/module-path.test.js`
Expected: All PASS

**Step 5: Wire `tova add` to accept shorthand**

In `bin/tova.js`, in the `addDep()` function (~line 2220), right after `const actualPkg = isNpm ? pkg.slice(4) : pkg;`, add expansion:

```javascript
// Expand blessed package shorthand: tova/data → github.com/tova-lang/data
const { expandBlessedPackage } = await import('../src/config/module-path.js');
const expandedPkg = expandBlessedPackage(actualPkg);
const resolvedPkg = expandedPkg || actualPkg;
```

Then use `resolvedPkg` instead of `actualPkg` for the Tova module branch below.

Similarly, in `installDeps()` (~line 2130), expand dependency keys:

```javascript
// Expand blessed packages in dependency keys
const { expandBlessedPackage: _expand } = await import('../src/config/module-path.js');
const tovaModuleDeps = {};
for (const [k, v] of Object.entries(tovaDeps)) {
  const expanded = _expand(k);
  tovaModuleDeps[expanded || k] = v;
}
```

**Step 6: Run full test suite to verify no regressions**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test`
Expected: All existing tests pass + new module-path tests pass.

**Step 7: Commit**

```bash
git add src/config/module-path.js tests/module-path.test.js bin/tova.js
git commit -m "feat: add tova/* blessed package shorthand resolution

tova/data expands to github.com/tova-lang/data for all 10 official
packages. Works in imports, tova add, and tova install."
```

---

## Phase 1: Stdlib Enhancements

### Task 1.1: Enhanced `fmt()` — Rich Format Specifications

**Files:**
- Modify: `src/stdlib/inline.js` (replace existing `fmt` entry)
- Test: `tests/stdlib-fmt.test.js` (new file)

**Context:** The current `fmt()` only does `{}` positional replacement. The new version supports `{:.2f}`, `{:>10}`, `{:,}`, `{:%}`, `{:b}`, `{:x}`, `{:o}`, `{:$}`, named placeholders, fill+align.

**Step 1: Write the failing tests**

Create `tests/stdlib-fmt.test.js` with tests for:
- Positional placeholders: `fmt("Hello {}, age {}", "Alice", 30)` → `"Hello Alice, age 30"`
- Named placeholders: `fmt("Hi {name}", {name: "Bob"})` → `"Hi Bob"`
- Float precision: `fmt("{:.2f}", 3.14159)` → `"3.14"`
- Right/left/center align: `fmt("{:>10}", "right")` → `"     right"`
- Thousands separator: `fmt("{:,}", 1234567)` → `"1,234,567"`
- Percentage: `fmt("{:%}", 0.856)` → `"85.6%"`
- Binary/hex/octal: `fmt("{:b}", 42)` → `"101010"`, `fmt("{:x}", 255)` → `"ff"`
- Currency: `fmt("{:$}", 49.9)` → `"$49.90"`
- Fill chars: `fmt("{:*>10}", "hi")` → `"********hi"`
- Escaped braces: double curly braces in `fmt()` are collapsed to single braces

Tests compile Tova code and run the JS output, capturing `console.log` calls.

**Step 2: Run tests to verify they fail**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/stdlib-fmt.test.js`
Expected: FAIL — most format specs not implemented.

**Step 3: Implement enhanced `fmt()`**

Replace the `fmt` entry in `BUILTIN_FUNCTIONS` in `src/stdlib/inline.js`. The implementation:
- Detects named vs positional mode (single object arg = named)
- Parses format spec: `{[fill][align][sign][,][width][.precision][type]}`
- Handles escape: double curly braces → single curly braces
- Types: `f` (float), `b` (binary), `o` (octal), `x`/`X` (hex), `%` (percentage), `$` (currency), `s` (string)
- Comma flag: thousands separator
- Align: `<` left, `>` right, `^` center with optional fill character

**Step 4: Run tests to verify they pass**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/stdlib-fmt.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/stdlib/inline.js tests/stdlib-fmt.test.js
git commit -m "feat: enhanced fmt() with Python/Rust-style format specifications

Supports: {:.2f} precision, {:>10} alignment, {:,} thousands, {:%}
percentage, {:b}/{:x}/{:o}/{:X} radix, {:$} currency, fill chars,
named placeholders, escaped braces."
```

---

### Task 1.2: Enhanced `print()` — Rich Terminal Output

**Files:**
- Modify: `src/stdlib/inline.js` (replace existing `print` entry)
- Test: `tests/stdlib-print.test.js` (new file)

**Context:** Current `print()` is `console.log(...)`. New version: detects inline style tags `{red}`, `{bold}`, `{/}` for colorized output; auto-pretty-prints objects with indentation; auto-formats arrays of objects as tables.

**Step 1: Write the failing tests**

Create `tests/stdlib-print.test.js` with tests for:
- Basic string pass-through
- Multiple args
- Style tag stripping in NO_COLOR mode
- Pretty-printing objects (indented JSON)
- Auto-table for arrays of objects (aligned columns)
- Number/null pass-through

**Step 2: Run tests to verify they fail**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/stdlib-print.test.js`
Expected: FAIL — style tags not parsed, objects not pretty-printed.

**Step 3: Implement enhanced `print()`**

Replace the `print` entry in `BUILTIN_FUNCTIONS`. The implementation:
- Style tags: `{red}`, `{green}`, `{yellow}`, `{blue}`, `{magenta}`, `{cyan}`, `{gray}`, `{bold}`, `{dim}`, `{underline}`, `{/}` (reset)
- Respects `NO_COLOR` env var and non-TTY stdout
- Auto-detects arrays of objects → renders as aligned table
- Auto-detects objects → renders as indented JSON
- Primitives pass through unchanged

**Step 4: Run tests to verify they pass**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/stdlib-print.test.js`
Expected: All PASS

**Step 5: Run full test suite to check for regressions**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test`
Expected: All existing tests pass. Watch for any test that depends on `print()` output format.

**Step 6: Commit**

```bash
git add src/stdlib/inline.js tests/stdlib-print.test.js
git commit -m "feat: enhanced print() with inline styles, auto-pretty-print, auto-table

Supports {red}, {bold}, {dim}, {/} style tags in strings.
Auto-formats objects as indented JSON, arrays of objects as tables."
```

---

### Task 1.3: `crypto` Namespace Module

**Files:**
- Modify: `src/stdlib/inline.js` (add `crypto` namespace after existing `json` namespace)
- Test: `tests/stdlib-crypto.test.js` (new file)

**Step 1: Write the failing tests**

Create `tests/stdlib-crypto.test.js` with tests for:
- `crypto.sha256("hello")` produces 64-char hex string
- `crypto.sha256` is deterministic
- `crypto.sha512` produces 128-char hex string
- `crypto.hmac("sha256", "key", "data")` produces hex string
- `crypto.random_bytes(16)` returns 16-byte Uint8Array
- `crypto.random_int(1, 10)` returns number in range
- `crypto.hash_password` / `crypto.verify_password` round-trip
- `crypto.encrypt` / `crypto.decrypt` round-trip (AES-256-GCM)
- `crypto.constant_time_equal("abc", "abc")` → true

**Step 2: Run tests to verify they fail**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/stdlib-crypto.test.js`
Expected: FAIL — `crypto` namespace not defined.

**Step 3: Implement `crypto` namespace**

Add to `BUILTIN_FUNCTIONS` in `src/stdlib/inline.js`. Uses Node.js `require('crypto')`:
- `sha256(data)`, `sha512(data)` → `createHash().update().digest('hex')`
- `hmac(algo, key, data)` → `createHmac().update().digest('hex')`
- `random_bytes(n)` → `new Uint8Array(randomBytes(n))`
- `random_int(min, max)` → Math.floor random in range
- `hash_password(password)` → scrypt with random 16-byte salt, returns `Ok("salt:hash")`
- `verify_password(password, stored)` → scrypt + `timingSafeEqual`, returns `Bool`
- `encrypt(plaintext, key)` → AES-256-GCM, returns `Ok("iv:tag:ciphertext")`
- `decrypt(ciphertext, key)` → AES-256-GCM reverse, returns `Ok(plaintext)` or `Err`
- `constant_time_equal(a, b)` → `timingSafeEqual`

**Important:** The name `crypto` will shadow the global `crypto`. The stdlib uses `require('crypto')` internally, not the global.

**Step 4: Run tests to verify they pass**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test tests/stdlib-crypto.test.js`
Expected: All PASS

**Step 5: Run full suite**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test`
Expected: All pass.

**Step 6: Commit**

```bash
git add src/stdlib/inline.js tests/stdlib-crypto.test.js
git commit -m "feat: crypto namespace — sha256, sha512, hmac, encrypt/decrypt, password hashing

AES-256-GCM encryption, scrypt-based password hashing, timing-safe
comparison. All methods return Result for fallible operations."
```

---

### Task 1.4: `http` Namespace Module

**Files:**
- Modify: `src/stdlib/inline.js` (add `http` namespace)
- Test: `tests/stdlib-http.test.js` (new file)

**Step 1: Write the failing tests**

Create `tests/stdlib-http.test.js` with tests for:
- `http` namespace compiles and contains get/post/put/patch/delete/head methods
- Methods are async and use fetch internally
- Return type wraps in `Ok`/`Err`

**Step 2: Run tests to verify they fail**

**Step 3: Implement `http` namespace**

Add to `BUILTIN_FUNCTIONS`. Core `_request(method, url, body, opts)` method:
- Auto-JSON: sets `Content-Type: application/json` and `JSON.stringify` for object bodies
- Bearer auth: `opts.bearer` → `Authorization: Bearer <token>`
- Timeout: AbortController with default 30s
- Retries: `opts.retries` with `opts.retry_delay` (default 1s) and linear backoff
- Response: `{ status, headers, body, ok, json() }` wrapped in `Ok()`, or `Err(message)`
- Auto-parses JSON response bodies when content-type matches

**Step 4: Run tests and commit**

```bash
git add src/stdlib/inline.js tests/stdlib-http.test.js
git commit -m "feat: http namespace — get/post/put/patch/delete/head with Result semantics

Auto-JSON serialization, bearer auth, timeout (30s default), retry with
backoff, redirect control. All methods return Result<Response, String>."
```

---

### Task 1.5: `cache` Namespace Module

**Files:**
- Modify: `src/stdlib/inline.js` (add `cache` namespace + `LRUCache` class)
- Test: `tests/stdlib-cache.test.js` (new file)

**Step 1: Write the failing tests**

Tests for:
- `cache.lru(10)` — basic get/set, returns `Option` (Some/None)
- LRU eviction when capacity exceeded
- `has`, `delete`, `clear`, `size`, `keys`
- Hit/miss stats tracking
- `cache.ttl(10, 1000)` — entries expire after TTL ms

**Step 2: Run tests to verify they fail**

**Step 3: Implement `cache` namespace**

`LRUCache` class using `Map` (insertion-order-preserving):
- `get(key)` → moves to end (most-recently-used), returns `Some(value)` or `None`
- `set(key, value)` → evicts oldest if at capacity
- `has(key)` → checks existence + TTL expiry
- `delete`, `clear`, `size`, `keys`, `stats()` → `{ hits, misses, hit_rate }`

`cache` namespace: `lru(maxSize)`, `ttl(maxSize, ttlMs)`

**Step 4: Run tests and commit**

```bash
git add src/stdlib/inline.js tests/stdlib-cache.test.js
git commit -m "feat: cache namespace — LRU with optional TTL, hit/miss stats"
```

---

### Task 1.6: `log` Namespace Module

**Files:**
- Modify: `src/stdlib/inline.js` (add `log` namespace)
- Test: `tests/stdlib-log.test.js` (new file)

**Step 1: Write the failing tests**

Tests for:
- `log.info("msg")` emits output
- `log.warn`, `log.error`, `log.debug` emit output
- `log.level("warn")` filters out debug/info
- `log.format("json")` outputs structured JSON with `msg`, `level`, `timestamp`
- `log.with({request_id: "abc"})` creates child logger with bound context

**Step 2: Run tests to verify they fail**

**Step 3: Implement `log` namespace**

IIFE-based module with closure state:
- `_level`: numeric threshold (0=debug, 1=info, 2=warn, 3=error, 4=silent)
- `_format`: "pretty" (colorized) or "json" (structured)
- `_emit(level, context, msg, data)`: core output function
- Pretty mode: `HH:MM:SS INF message {data}` with ANSI colors
- JSON mode: `{"level":"info","msg":"...","timestamp":"...","key":"val"}`
- `with(extra)`: returns new logger with merged context
- Respects `NO_COLOR` env var

**Step 4: Run tests and commit**

```bash
git add src/stdlib/inline.js tests/stdlib-log.test.js
git commit -m "feat: log namespace — structured logging with levels, JSON mode, child loggers"
```

---

### Task 1.7: Register new stdlib builtins in codegen

**Files:**
- Modify: `src/codegen/base-codegen.js` (add new names to `STDLIB_BUILTINS` set)

**Context:** The base codegen has a set of known stdlib names so it can tree-shake and auto-emit them when referenced. We need to add: `crypto`, `http`, `cache`, `log`, `LRUCache`.

**Step 1: Find the `STDLIB_BUILTINS` set in `src/codegen/base-codegen.js`**

**Step 2: Add `'crypto'`, `'http'`, `'cache'`, `'log'`, `'LRUCache'` to the set**

**Step 3: Run full test suite**

Run: `cd /Users/macm1/new-y-combinator/lux-lang && bun test`
Expected: All pass including the new stdlib tests.

**Step 4: Commit**

```bash
git add src/codegen/base-codegen.js
git commit -m "feat: register crypto, http, cache, log in stdlib builtins for tree-shaking"
```

---

## Phase 2: First-Party Packages (High Priority)

Each package lives in `/Users/macm1/new-y-combinator/tova-packages/<name>/` and will be pushed to `github.com/tova-lang/<name>`.

### Task 2.1: `tova/fp` — Functional Programming Toolkit

**Files:**
- Modify: `/Users/macm1/new-y-combinator/tova-packages/fp/src/lib.tova`
- Create: `/Users/macm1/new-y-combinator/tova-packages/fp/src/curry.tova`
- Create: `/Users/macm1/new-y-combinator/tova-packages/fp/src/collections.tova`
- Create: `/Users/macm1/new-y-combinator/tova-packages/fp/src/lenses.tova`
- Create: `/Users/macm1/new-y-combinator/tova-packages/fp/src/transducers.tova`
- Create: `/Users/macm1/new-y-combinator/tova-packages/fp/src/pointfree.tova`

**Implementation approach:** Write all functions in Tova using the pipe-friendly idiom. Each function is auto-curried. Group into sub-modules for organization.

**Key functions per sub-module:**

- `curry.tova`: `auto_curry(fn)` — the core currying primitive
- `collections.tova`: `fp_map`, `fp_filter`, `fp_reduce`, `fp_reject`, `fp_find`, `fp_every`, `fp_some`, `fp_pluck`, `fp_pick`, `fp_omit`, `fp_prop`, `fp_path`, `fp_assoc`, `fp_dissoc`, `fp_zip_with`, `fp_flat_map`, `fp_unfold`, `fp_iterate`, `fp_window`, `fp_sliding`, `fp_interleave`, `fp_interpose`, `fp_frequencies`
- `lenses.tova`: `lens`, `lens_path`, `view`, `set_lens`, `over`
- `transducers.tova`: `transduce`, `xf_map`, `xf_filter`, `xf_take`, `xf_drop`, `xf_compose`
- `pointfree.tova`: `equals`, `gt`, `lt`, `gte`, `lte`, `not_pred`, `both`, `either_pred`, `where_pred`
- `lib.tova`: Re-export everything under `fp` namespace

**Testing:** Each sub-module gets a corresponding test in the main lux-lang repo under `tests/packages/fp/`. Tests compile .tova source and run the JS output.

**Step 1: Implement and test each sub-module (TDD loop per file)**
**Step 2: Verify `tova build` compiles the package**
**Step 3: Commit each sub-module separately**

---

### Task 2.2: `tova/validate` — Schema Validation

**Files:**
- Modify: `/Users/macm1/new-y-combinator/tova-packages/validate/src/lib.tova`
- Create: `/Users/macm1/new-y-combinator/tova-packages/validate/src/types.tova`
- Create: `/Users/macm1/new-y-combinator/tova-packages/validate/src/rules.tova`
- Create: `/Users/macm1/new-y-combinator/tova-packages/validate/src/schema.tova`

**Key types:**
- `Schema` — base with `.validate(data) -> Result<T, [Error]>`
- `StringSchema`, `IntSchema`, `FloatSchema`, `BoolSchema`, `LiteralSchema`
- `ArraySchema`, `ObjectSchema`, `TupleSchema`
- `UnionSchema`, `OptionalSchema`, `NullableSchema`

**Implementation:** Builder pattern — each `.min()`, `.max()`, `.email()` etc. returns a new schema with the rule appended to an internal rules list. `.validate()` runs all rules and collects errors.

**Step 1: Implement and test primitives (string, int, float, bool, literal)**
**Step 2: Implement and test compound types (array, object, tuple)**
**Step 3: Implement and test union/optional/nullable**
**Step 4: Implement and test transforms (.transform, .default, .coerce)**
**Step 5: Implement and test custom validators**
**Step 6: Commit**

---

### Task 2.3: `tova/data` — DataFrame Engine

**Files:**
- Modify: `/Users/macm1/new-y-combinator/tova-packages/data/src/lib.tova`
- Create: `/Users/macm1/new-y-combinator/tova-packages/data/src/dataframe.tova`
- Create: `/Users/macm1/new-y-combinator/tova-packages/data/src/column.tova`
- Create: `/Users/macm1/new-y-combinator/tova-packages/data/src/io.tova`
- Create: `/Users/macm1/new-y-combinator/tova-packages/data/src/window.tova`
- Create: `/Users/macm1/new-y-combinator/tova-packages/data/src/lazy.tova`

**Implementation approach:** Columnar storage — each column is a TypedArray (numeric) or regular Array (strings). DataFrame is an object with named columns + a row count. Operations return new DataFrames (immutable semantics).

**Key phases:**
1. `Column` type: typed storage, null bitmask, basic ops (sum, mean, min, max, sort)
2. `DataFrame`: construct from rows/columns, select, filter, head, tail, sample
3. I/O: `read_csv`, `read_json`, `to_csv`, `to_json`
4. Transforms: `with_column`, `rename`, `cast`, `group_by`, `agg`, `describe`
5. Joins: `join`, `left_join`, `cross_join`
6. Window: `rolling`, `rank`, `cumsum`, `lag`, `lead`
7. Lazy: `lazy()` → deferred execution → `collect()`
8. Interop: `to_table()` / `from_table()`

---

## Phase 3: Core Infrastructure Packages

### Task 3.1: `tova/encoding` — Format Encoders/Decoders

**Files:**
- Create sub-modules: `toml.tova`, `yaml.tova`, `csv.tova`, `msgpack.tova`, `ini.tova`, `qs.tova`

**Implementation priority:** TOML first (needed for `tova.toml` self-hosting), then YAML, then the rest.

Each format implements: `parse(string) -> Result<T, String>`, `stringify(value) -> String`

---

### Task 3.2: `tova/test` — Testing Toolkit

**Files:**
- Create sub-modules: `mock.tova`, `property.tova`, `snapshot.tova`, `time.tova`, `http_mock.tova`, `expect.tova`

**Implementation priority:** `mock` and `expect` first (most commonly needed), then property-based, then snapshots.

Key APIs:
- `mock.fn()` / `mock.spy(obj, "method")` → tracks calls, returns, resets
- `expect(val).to_equal(x)` / `.to_be_ok()` / `.to_be_some()` — Result/Option-aware matchers
- `prop.check(fn(arb.int(), arb.string()) -> bool)` — property-based testing
- `assert_snapshot(value, "name")` — auto-creates/compares `.snap` files
- `fake_time.freeze(date)` / `.advance(ms)` — time control
- `mock.fetch(routes)` — HTTP mocking

---

### Task 3.3: `tova/stats` — Statistical Computing

**Files:**
- Create sub-modules: `descriptive.tova`, `correlation.tova`, `distributions.tova`, `hypothesis.tova`, `regression.tova`, `sampling.tova`

**Implementation priority:** Descriptive stats first (mean, median, stdev, variance), then regression, then distributions.

Key APIs:
- Descriptive: `mean`, `median`, `mode`, `stdev`, `variance`, `quantile`, `iqr`, `skewness`, `kurtosis`
- Correlation: `pearson`, `spearman`, `covariance`, `corr_matrix`
- Distributions: `normal(mean, std).pdf(x)`, `.cdf(x)`, `.sample(n)` + uniform, poisson, binomial, exponential
- Hypothesis: `t_test`, `chi_square`, `anova` → `{statistic, p_value, significant}`
- Regression: `linear(x, y) -> {slope, intercept, r_squared}`, `polynomial(x, y, degree)`
- Sampling: `sample(arr, n)`, `bootstrap(data, fn, opts)`, `stratified_sample(df, group, n)`

---

## Phase 4: Extended Ecosystem Packages

### Task 4.1: `tova/retry` — Resilience & Scheduling

**Files:** Single `lib.tova` — small enough for one file.

Core: `retry()`, `breaker()`, `limiter()`, `with_timeout()`, `batch()`, `schedule()`.

### Task 4.2: `tova/template` — String Templating

**Files:** `lib.tova` + `parser.tova` (template syntax parser) + `compiler.tova` (precompilation)

<!-- prettier-ignore -->
<div v-pre>

Mustache-style: `{{var}}`, `{{#each items}}`, `{{#if cond}}`, `{{> partial}}`, `{{{raw}}}`, `{{val | filter}}`

</div>

### Task 4.3: `tova/plot` — Visualization

**Files:** `terminal.tova` (Unicode rendering), `svg.tova` (HTML/SVG output), `sparkline.tova`

Terminal charts use Unicode box-drawing and braille characters. SVG output for browser embedding.

### Task 4.4: `tova/ml` — Machine Learning

**Files:** `linear.tova`, `tree.tova`, `knn.tova`, `cluster.tova`, `preprocess.tova`, `evaluate.tova`, `pipeline.tova`

Pure Tova/JS implementations — no native dependencies. Focus on interpretable models.

---

## Phase 5: GitHub Repos & Publishing

### Task 5.1: Create GitHub repos and push packages

For each of the 10 packages:

```bash
cd /Users/macm1/new-y-combinator/tova-packages/<name>
gh repo create tova-lang/<name> --public --description "<description from tova.toml>"
git remote add origin git@github.com:tova-lang/<name>.git
git add -A
git commit -m "feat: initial tova/<name> package"
git tag v0.1.0
git push -u origin main --tags
```

### Task 5.2: Add package listing to docs

Create `docs/packages/official.md` listing all 10 packages with descriptions, install commands (`tova add tova/<name>`), and links to GitHub repos.

---

## Dependency Graph

```
Phase 0 (blessed resolution) → Phase 1 (stdlib) → Phase 2 (high-priority packages)
                                                 → Phase 3 (core packages)
                                                 → Phase 4 (extended packages)
                                                 → Phase 5 (publish)
```

Phase 0 must come first (everything else depends on `tova/X` resolution).
Phases 1-4 can be parallelized across different packages.
Phase 5 comes last after implementation is stable.

Within Phase 1: Tasks 1.1-1.6 are independent (can be parallelized). Task 1.7 depends on 1.1-1.6.
Within Phase 2: Tasks 2.1-2.3 are independent.
Within Phase 3: Tasks 3.1-3.3 are independent. `tova/stats` may depend on `tova/data` for DataFrame integration.
Within Phase 4: All independent. `tova/plot` may optionally integrate with `tova/data`.
