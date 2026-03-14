# Tova Package Ecosystem Design

**Date:** 2026-03-03
**Status:** Approved
**Approach:** Hybrid — stdlib additions for primitives + first-party `tova/*` packages

## Overview

Extend the Tova language with a set of official packages that make it self-sufficient for application development, functional programming, and data science — without falling back to npm for everyday tasks.

Three tiers:
1. **Stdlib additions** — namespace modules added directly to `inline.js` (ship with compiler)
2. **First-party packages** — official `tova/*` packages (imported explicitly, versioned independently)
3. **Data science packages** — `tova/*` packages targeting data professionals

All packages scaffolded via `tova new <name> --template library` in `/Users/macm1/new-y-combinator/tova-packages/`.

---

## Tier 1 — Stdlib Namespace Modules (add to `inline.js`)

### 1.1 Enhanced `print()` + `fmt()`

Upgrade `print()` from thin `console.log` wrapper to a rich output engine. Upgrade `fmt()` from basic `{}` substitution to a full format specification engine.

**`fmt()` — Format Specifications:**

| Spec | Example | Output |
|------|---------|--------|
| Positional | `fmt("Hello {}, age {}", name, 30)` | `Hello Alice, age 30` |
| Named | `fmt("Hi {name}", {name: "Alice"})` | `Hi Alice` |
| Float precision | `fmt("{:.2f}", 3.14159)` | `3.14` |
| Right-align | `fmt("{:>10}", "right")` | `     right` |
| Left-align | `fmt("{:<10}", "left")` | `left      ` |
| Center | `fmt("{:^10}", "mid")` | `   mid    ` |
| Thousands | `fmt("{:,}", 1234567)` | `1,234,567` |
| Percentage | `fmt("{:%}", 0.856)` | `85.6%` |
| Binary | `fmt("{:b}", 42)` | `101010` |
| Hex | `fmt("{:x}", 255)` | `ff` |
| Octal | `fmt("{:o}", 8)` | `10` |
| Currency | `fmt("{:$}", 49.9)` | `$49.90` |
| Fill char | `fmt("{:*>10}", "hi")` | `********hi` |

**`print()` — Rich Terminal Output:**

| Feature | Example | Behavior |
|---------|---------|----------|
| Inline color | `print("{red}Error:{/} broke")` | Red "Error:", normal "broke" |
| Inline style | `print("{bold}Title{/} {dim}sub{/}")` | Bold title, dimmed subtitle |
| Nested styles | `print("{bold}{red}FAIL{/}")` | Bold + red |
| Auto pretty-print | `print(someObject)` | Indented, syntax-colored output |
| Auto table | `print(someArrayOfObjects)` | Aligned columns with headers |
| Supported tags | `{red}`, `{green}`, `{yellow}`, `{blue}`, `{cyan}`, `{magenta}`, `{gray}`, `{bold}`, `{dim}`, `{underline}`, `{/}` (reset) | |

### 1.2 `crypto` Namespace Module

```
crypto.sha256(data) -> String
crypto.sha512(data) -> String
crypto.hmac(algo, key, data) -> String
crypto.random_bytes(n) -> Uint8Array
crypto.hash_password(password) -> Result<String, String>
crypto.verify_password(password, hash) -> Bool
crypto.encrypt(plaintext, key) -> Result<String, String>     // AES-256-GCM
crypto.decrypt(ciphertext, key) -> Result<String, String>
crypto.randomInt(min, max) -> Int
crypto.uuid_v4() -> String
crypto.constant_time_equal(a, b) -> Bool
```

Implementation: Uses Node.js `crypto` module / Web Crypto API depending on runtime target.

### 1.3 `http` Namespace Module

```
http.get(url, opts?) -> Result<Response, String>
http.post(url, body, opts?) -> Result<Response, String>
http.put(url, body, opts?) -> Result<Response, String>
http.patch(url, body, opts?) -> Result<Response, String>
http.delete(url, opts?) -> Result<Response, String>
http.head(url, opts?) -> Result<Response, String>
```

**Options:** `{ headers, timeout, retries, retry_delay, follow_redirects, bearer }`

**Response:** `{ status, headers, body, ok, json() -> Result }`

All methods return `Result` — never throw. Auto-serializes/deserializes JSON when content-type matches. Timeout defaults to 30s.

### 1.4 `cache` Namespace Module

```
cache.lru(max_size) -> Cache
cache.ttl(max_size, ttl_ms) -> Cache

Cache.get(key) -> Option
Cache.set(key, value) -> void
Cache.has(key) -> Bool
Cache.delete(key) -> Bool
Cache.clear() -> void
Cache.size() -> Int
Cache.keys() -> [String]
Cache.stats() -> { hits, misses, hit_rate }
```

### 1.5 `log` Namespace Module

```
log.debug(msg, ...data)
log.info(msg, ...data)
log.warn(msg, ...data)
log.error(msg, ...data)
log.level(level)                  // "debug" | "info" | "warn" | "error" | "silent"
log.format(fmt)                   // "pretty" | "json"
log.with({request_id, user_id})   // Returns child logger with bound context
```

**Pretty mode (default):** Colored level prefix, timestamp, message.
**JSON mode:** Structured `{"level":"info","msg":"...","timestamp":"...","request_id":"..."}`.

---

## Tier 2 — First-Party Packages

All packages live in `/Users/macm1/new-y-combinator/tova-packages/<name>/`.
Created via `tova new <name> --template library`.

### 2.1 `tova/fp` — Functional Programming Toolkit

Collection-centric (Lodash/Ramda style). All functions auto-curried and pipe-friendly.

**Curried collection ops:**
`fp.map`, `fp.filter`, `fp.reduce`, `fp.reject`, `fp.find`, `fp.every`, `fp.some`
— work as `fp.map(fn, list)` or `fp.map(fn)(list)`

**Transformers:**
`fp.pluck("name")`, `fp.pick(["a","b"])`, `fp.omit(["c"])`, `fp.prop("x")`,
`fp.path(["a","b","c"])`, `fp.assoc("key", val)`, `fp.dissoc("key")`

**Composition:**
`fp.pipe(f, g, h)`, `fp.compose(h, g, f)`, `fp.juxt([f, g])`,
`fp.converge(f, [g, h])`, `fp.ap(fns, vals)`

**Pointfree helpers:**
`fp.equals(x)`, `fp.gt(5)`, `fp.lt(10)`, `fp.not(pred)`,
`fp.both(p1, p2)`, `fp.either(p1, p2)`, `fp.where({age: fp.gt(18)})`

**Advanced collections:**
`fp.zipWith(fn)`, `fp.flatMap(fn)`, `fp.unfold(fn, seed)`,
`fp.iterate(fn, seed, n)`, `fp.window(n)`, `fp.sliding(n, step)`,
`fp.interleave`, `fp.interpose(sep)`, `fp.frequencies`

**Transducers:**
`fp.transduce(xform, reducer, init, coll)` — composable transforms without intermediate arrays.
Built-in xforms: `fp.xf.map(fn)`, `fp.xf.filter(fn)`, `fp.xf.take(n)`, `fp.xf.drop(n)`

**Lenses:**
`fp.lens(getter, setter)`, `fp.lens_path(["a","b"])`,
`fp.view(lens, obj)`, `fp.set(lens, val, obj)`, `fp.over(lens, fn, obj)`

**Immutable updates:**
`fp.update_in(obj, path, fn)`, `fp.merge_deep(a, b)`, `fp.freeze_deep(obj)`

### 2.2 `tova/validate` — Schema Validation

Zod-style declarative schemas, always returns `Result`.

**Primitives:** `v.string()`, `v.int()`, `v.float()`, `v.bool()`, `v.literal("admin")`

**String rules:** `.min(3)`, `.max(100)`, `.email()`, `.url()`, `.uuid()`, `.pattern(regex)`, `.trim()`, `.nonempty()`

**Number rules:** `.min(0)`, `.max(100)`, `.positive()`, `.negative()`, `.integer()`, `.between(1, 10)`

**Compound:** `v.array(v.string())`, `v.object({...})`, `v.tuple([v.string(), v.int()])`

**Unions/optionals:** `v.union(v.string(), v.int())`, `v.optional(v.string())`, `v.nullable(v.string())`

**Transforms:** `.transform(fn)`, `.default(val)`, `.coerce()`

**Custom:** `v.custom(fn(val) -> Result)`

**Output:** `.validate(data) -> Result<T, [ValidationError]>`

**Form integration:** Works with `form {}` blocks for shared validation rules.

### 2.3 `tova/encoding` — Format Encoders/Decoders

| Format | API |
|--------|-----|
| TOML | `toml.parse(s) -> Result`, `toml.stringify(obj)` |
| YAML | `yaml.parse(s) -> Result`, `yaml.stringify(obj)` |
| CSV (advanced) | `csv.parse(s, opts)`, `csv.stringify(rows)`, `csv.stream(reader)` |
| MessagePack | `msgpack.encode(val) -> Bytes`, `msgpack.decode(bytes) -> Result` |
| Base64URL | `base64url.encode(s)`, `base64url.decode(s)` |
| INI | `ini.parse(s)`, `ini.stringify(obj)` |
| Query strings | `qs.parse(s, opts)`, `qs.stringify(obj, opts)` — nested objects, arrays |

### 2.4 `tova/test` — Testing Toolkit

**Mocking:**
`mock.fn()`, `mock.fn(impl)`, `mock.spy(obj, "method")`, `.calls`, `.returns`, `.reset()`

**Property-based testing:**
`prop.check(fn(arb.int(), arb.string()) -> bool)`
Arbitraries: `arb.int(min, max)`, `arb.string()`, `arb.array(arb.int())`, `arb.object({...})`, `arb.one_of([...])`

**Snapshots:**
`assertSnapshot(value, "name")` — auto-creates/compares `.snap` files

**Time control:**
`fake_time.freeze(date)`, `fake_time.advance(ms)`, `fake_time.restore()`

**HTTP mocking:**
`mock.fetch({"/api/users": {status: 200, body: [...]}})`

**Result/Option matchers:**
`expect(val).to_equal(x)`, `.to_contain(x)`, `.to_match(regex)`,
`.to_be_ok()`, `.to_be_err()`, `.to_be_some()`, `.to_be_none()`

### 2.5 `tova/retry` — Resilience & Scheduling

```
retry(fn, {max: 3, backoff: "exponential", delay: 100, on_retry: fn})
breaker(fn, {threshold: 5, reset_after: 30000})
limiter(fn, {per_second: 10})
with_timeout(fn, ms) -> Result
batch(fn, {max_size: 50, max_wait: 100})
schedule("0 * * * *", fn)
schedule.every("5m", fn)
schedule.at("2025-01-01T00:00", fn)
```

### 2.6 `tova/template` — String Templating

<!-- {% raw %} -->
```
template("Hello {{name}}", {name: "World"})
```

<!-- prettier-ignore -->
<div v-pre>

Features: `{{#each items}}`, `{{#if cond}}`, `{{> partial}}`, `{{{raw}}}` (unescaped),
`{{name | upper}}` (filters), `compile(str)` (precompile for reuse).

</div>
<!-- {% endraw %} -->

Auto HTML-escapes by default.

---

## Tier 3 — Data Science Packages

### 3.1 `tova/data` — DataFrame Engine

Columnar storage backed by TypedArrays for numeric columns. Leverages `@fast` optimizations.

**I/O:**
`df.read_csv(path, {chunk_size})`, `df.read_json(path)`, `df.read_parquet(path)`,
`df.to_csv()`, `df.to_json()`

**Selection:**
`df.select("name", "age")`, `df.exclude("id")`, `df.filter(fn)`,
`df.head(10)`, `df.tail(5)`, `df.sample(100)`

**Transforms:**
`df.with_column("bmi", fn(r) r.weight / (r.height ** 2))`,
`df.rename({old: "new"})`, `df.cast("age", "float")`

**Aggregation:**
`df.groupBy("city").agg({pop: "sum", age: "mean"})`,
`df.describe()` — min/max/mean/median/std/count per column

**Joins:**
`df.join(other, on: "id")`, `df.left_join(...)`, `df.cross_join(...)`

**Window functions:**
`df.window("revenue").rolling(7).mean()`, `.rank()`, `.cumsum()`, `.lag(1)`, `.lead(1)`

**Missing data:**
`df.fill_null(0)`, `df.drop_null()`, `df.interpolate()`

**Lazy evaluation:**
`df.lazy().filter(...).select(...).collect()` — query planning, predicate pushdown

**Stdlib interop:**
`df.to_table()` / `Table.to_df()` — converts to/from stdlib Table

### 3.2 `tova/stats` — Statistical Computing

**Descriptive:**
`stats.mean`, `stats.median`, `stats.mode`, `stats.stdev`, `stats.variance`,
`stats.quantile(data, 0.75)`, `stats.iqr`, `stats.skewness`, `stats.kurtosis`

**Correlation:**
`stats.pearson(x, y)`, `stats.spearman(x, y)`, `stats.covariance(x, y)`, `stats.corr_matrix(df)`

**Distributions:**
`stats.normal(mean, std).pdf(x)`, `.cdf(x)`, `.sample(n)`
Plus: `uniform`, `poisson`, `binomial`, `exponential`

**Hypothesis testing:**
`stats.t_test(a, b)`, `stats.chi_square(observed, expected)`, `stats.anova(groups)`
Returns `{statistic, p_value, significant}`

**Regression:**
`stats.linear(x, y) -> {slope, intercept, r_squared}`, `stats.polynomial(x, y, degree)`

**Sampling:**
`stats.sample(arr, n)`, `stats.bootstrap(data, stat_fn, {n: 1000})`,
`stats.stratified_sample(df, "group", n)`

**Outliers:**
`stats.z_score(data)`, `stats.iqr_fence(data)`, `stats.outliers(data)`

### 3.3 `tova/plot` — Terminal & HTML Visualization

**Terminal charts (Unicode rendering):**
`plot.bar(data)`, `plot.line(data)`, `plot.scatter(x, y)`,
`plot.histogram(data, bins)`, `plot.heatmap(matrix)`

**HTML/SVG output:**
`plot.to_svg(chart)`, `plot.to_html(chart)`

**Composable figures:**
`plot.figure().add(plot.line(x, y, {label: "revenue"})).title("Trend").render()`

**DataFrame integration:**
`df.plot.bar("category", "value")`, `df.plot.scatter("x", "y")`

**Sparklines:**
`sparkline(data)` — inline tiny chart for dashboards/CLI

### 3.4 `tova/ml` — Machine Learning Primitives

Pragmatic, interpretable models. Pure Tova/JS — no native dependencies.

**Classification:**
`ml.knn(k)`, `ml.naive_bayes()`, `ml.decision_tree(max_depth)`, `ml.logistic_regression()`

**Regression:**
`ml.linear_regression()`, `ml.ridge(alpha)`, `ml.lasso(alpha)`

**Clustering:**
`ml.kmeans(k)`, `ml.dbscan(eps, min_pts)`

**Preprocessing:**
`ml.normalize(data)`, `ml.standardize(data)`, `ml.one_hot(column)`,
`ml.train_test_split(data, 0.8)`

**Evaluation:**
`ml.accuracy(pred, actual)`, `ml.precision`, `ml.recall`, `ml.f1`,
`ml.confusion_matrix`, `ml.mse`, `ml.r_squared`

**Pipeline:**
`ml.pipeline([ml.standardize(), ml.logistic_regression()]).fit(X, y).predict(X_test)`

---

## Package Structure

Each package created via `tova new <name> --template library`:

```
tova-packages/
  fp/
    tova.toml          # [package] name = "tova/fp"
    src/lib.tova       # Main entry point
    src/...            # Additional modules
    README.md
  validate/
  encoding/
  test/
  retry/
  template/
  data/
  stats/
  plot/
  ml/
```

## Priority Order

| Phase | What | Deliverable |
|-------|------|-------------|
| **Phase 1** | Enhanced `print()`/`fmt()`, `crypto`, `http`, `cache`, `log` | Stdlib in `inline.js` |
| **Phase 2** | `tova/fp`, `tova/validate`, `tova/data` | Highest-value packages |
| **Phase 3** | `tova/encoding`, `tova/test`, `tova/stats` | Core infrastructure |
| **Phase 4** | `tova/retry`, `tova/template`, `tova/plot`, `tova/ml` | Extended ecosystem |

## Design Decisions

1. **Hybrid approach**: Primitives (crypto, http, cache, log, print) go in stdlib because they're too fundamental to require installation. Everything else is a package.
2. **Result semantics everywhere**: All fallible operations return `Result`, never throw. Consistent with Tova's error handling philosophy.
3. **Pipe-friendly**: All package APIs designed to work naturally with `|>` operator.
4. **No npm dependencies in first-party packages**: Pure Tova implementations. This proves the language is self-sufficient.
5. **TypedArray optimization**: Data packages use TypedArrays and `@fast` where possible for competitive performance.
6. **Stdlib Table interop**: `tova/data` DataFrame converts to/from existing stdlib Table seamlessly.
