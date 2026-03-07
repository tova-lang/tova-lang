# Tier 1 Data Features — Design Document

**Date:** 2026-03-07
**Status:** Approved
**Branch:** feat/data-pro

## Goal

Add the 6 critical features that block Tova adoption by data professionals:

1. Parquet read/write
2. Excel read/write
3. SVG charting (bar, line, scatter, histogram, pie, heatmap)
4. Sampling (random + stratified)
5. All join types (right, outer, cross, anti, semi)
6. SQLite connector

## Architecture

All 6 features integrate through `src/stdlib/inline.js`. No parser or codegen changes needed — only new builtin names added to the tree-shaking lists in `base-codegen.js`.

| Feature | Integration point | Dependencies |
|---|---|---|
| Parquet | `read()`/`write()` extension | `parquet-wasm` (npm) |
| Excel | `read()`/`write()` extension | `exceljs` (npm) |
| SVG Charting | New stdlib functions | None (pure JS) |
| Sampling | New table functions | None (pure JS) |
| Join types | Extend `table_join()` | None |
| SQLite | New `sqlite()` function | `bun:sqlite` (built-in) |

**Dependency policy:** npm packages allowed. Both `parquet-wasm` and `exceljs` are lazy-loaded only when their file extensions are encountered.

---

## Feature 1: Parquet Read/Write

### API

```tova
data = read("data.parquet")
write(table, "output.parquet")
write(table, "output.parquet", compression: "snappy")
```

### Implementation

- **Library:** `parquet-wasm` — Rust/Arrow compiled to WASM, fast, correct, no native addons
- **Read:** Extend `read()` with `.parquet` extension detection. Call `parquet-wasm` `readParquet()`, convert Arrow record batches to array of objects, wrap in `Table`.
- **Write:** Extend `write()` with `.parquet` extension. Convert Table rows to Arrow columns, write via `writeParquet()`.
- **Compression:** Default snappy. Options: `"snappy"`, `"gzip"`, `"none"`.
- **Lazy-loaded:** `parquet-wasm` import only when `.parquet` is encountered.

### Type mapping (Parquet to JS)

| Parquet type | JS type |
|---|---|
| INT32, INT64 | number |
| FLOAT, DOUBLE | number |
| BYTE_ARRAY (UTF8) | string |
| BOOLEAN | boolean |
| TIMESTAMP | Date |
| NULL | null |

---

## Feature 2: Excel Read/Write

### API

```tova
data = read("report.xlsx")
data = read("report.xlsx", sheet: "Q4 Sales")
data = read("report.xlsx", sheet: 0)
data = read("report.xlsx", sheet: "Data", headers: false, range: "A1:F100")
write(table, "output.xlsx")
write(table, "output.xlsx", sheet: "Summary")
```

### Implementation

- **Library:** `exceljs` — well-maintained, streaming support for large files
- **Read:** Extend `read()` with `.xlsx` extension. Load workbook, read specified sheet (default: first), extract rows as objects with column headers from first row.
- **Write:** Extend `write()` with `.xlsx`. Create workbook, add worksheet with header row + data rows.
- **Type inference:** Numbers, booleans, dates (Date cells to JS Date), strings. Mirrors CSV parser logic.
- **Lazy-loaded:** `exceljs` import only when `.xlsx` is encountered.

### Scope limits

- `.xlsx` only (not legacy `.xls`)
- No formula evaluation — reads computed values only
- No styling on write — clean data output

---

## Feature 3: SVG Charting

### API

```tova
// 6 chart types — all return SVG strings
bar_chart(data, x: .region, y: .revenue, title: "Revenue by Region")
line_chart(data, x: .date, y: .price, title: "Price History")
scatter_chart(data, x: .age, y: .income, title: "Age vs Income")
histogram(data, col: .age, bins: 20, title: "Age Distribution")
pie_chart(data, label: .category, value: .revenue, title: "Revenue Split")
heatmap(data, x: .month, y: .product, value: .sales, title: "Sales Heatmap")

// Save to file
bar_chart(data, x: .region, y: .revenue) |> write_text("chart.svg")

// Customization (all optional)
bar_chart(data,
  x: .region,
  y: .revenue,
  title: "Revenue by Region",
  width: 800,
  height: 400,
  color: "#4f46e5",
  labels: true,
  sort: "desc"
)

// Multi-series line chart
line_chart(data, x: .date, y: [.revenue, .cost], title: "Revenue vs Cost")

// Pipe-friendly
table
  |> group_by(.region)
  |> agg(total: sum(.sales))
  |> bar_chart(x: .region, y: .total)
  |> write_text("report.svg")
```

### Implementation

- **Pure JS SVG string generation** — no dependencies
- Each function takes a Table (or array of objects) + options, returns an SVG string
- Default size: 600x400 via viewBox (responsive)
- Default palette: 8 perceptually distinct colors for multi-series
- Auto-scaled axes with smart tick intervals
- Title, axis labels, gridlines, legend auto-generated
- Self-contained SVG (no external fonts/CSS)

### Chart-specific details

**bar_chart:** Vertical bars, category axis. Options: `color`, `labels` (value on bars), `sort` ("asc"/"desc"), `horizontal: true`.

**line_chart:** Connected points, numeric/date x-axis. Options: `color`, `points: true` (show dots), multi-series via array of y columns. Auto-detects date strings for x-axis.

**scatter_chart:** Unconnected dots. Options: `color`, `size` (dot radius or column for bubble), `opacity`.

**histogram:** Auto-bins continuous data. Options: `bins` (default 20), `color`. Computes bin edges, counts per bin, renders as bar chart.

**pie_chart:** Circular segments. Options: `color` (array), `labels: true` (show percentages). Uses arc path calculation.

**heatmap:** Grid of colored cells. Options: `color_scale` ("blues"/"reds"/"viridis"), `labels: true` (show values in cells). Requires x (category), y (category), value (numeric).

### Design aesthetic

- Clean, minimal (Tufte-inspired — no 3D, no gradients)
- Standard SVG text — renders everywhere
- No interactivity, no animation
- Self-contained SVG (no external fonts/CSS)

---

## Feature 4: Sampling

### API

```tova
subset = table |> sample(1000)
subset = table |> sample(0.1)
subset = table |> sample(1000, seed: 42)
subset = table |> stratified_sample(.category, 100)
subset = table |> stratified_sample(.category, 0.1)
subset = table |> stratified_sample(.region, 50, seed: 42)
```

### Implementation

**table_sample(table, n, opts):**
- If n < 1: treat as fraction, compute k = floor(n * table.rows)
- If n >= 1: treat as row count, k = n
- Fisher-Yates partial shuffle: only shuffle first k positions (O(k) not O(N))
- seed option: xorshift128 PRNG (deterministic, 4 lines of code)
- If k >= table.rows: return full table (no error)

**table_stratified_sample(table, keyFn, n, opts):**
- Group by key function (reuses table_group_by logic)
- Apply table_sample(group, n, opts) to each group
- Concatenate results into single flat Table
- Preserves original column order

### Edge cases

- sample(0) returns empty table
- sample(n) where n > rows returns full table
- stratified_sample where group size < n returns full group

---

## Feature 5: All Join Types

### API

```tova
// Existing (unchanged)
a |> join(b, left: .id, right: .uid)
a |> join(b, left: .id, right: .uid, how: "left")

// New
a |> join(b, left: .id, right: .uid, how: "right")
a |> join(b, left: .id, right: .uid, how: "outer")
a |> join(b, how: "cross")
a |> join(b, left: .id, right: .uid, how: "anti")
a |> join(b, left: .id, right: .uid, how: "semi")
```

### Implementation

Extend existing `table_join()` in inline.js. Same hash-join algorithm, different post-processing per `how`:

**right:** Swap left/right tables, perform left join, then reorder columns so right table columns come first.

**outer:** Two-pass approach:
1. Left join pass (all left rows, matched rights)
2. Second pass: iterate right rows, find unmatched, emit with null left columns
3. Track matched right keys with a Set during pass 1

**cross:** Nested loop over all left x right rows. No hash index needed. left/right key params are optional.

**anti:** Build right hash index. For each left row, keep if key NOT found in right. Returns only left table columns.

**semi:** Build right hash index. For each left row, keep if key IS found in right. Returns only left table columns (no right columns merged, no cartesian product).

---

## Feature 6: SQLite Connector

### API

```tova
db = sqlite("app.db")
db = sqlite(":memory:")
users = db.query("SELECT * FROM users WHERE active = 1")
user = db.query("SELECT * FROM users WHERE id = ?", [42])
db.exec("CREATE TABLE logs (id INTEGER PRIMARY KEY, msg TEXT)")
db.exec("INSERT INTO logs (msg) VALUES (?)", ["hello"])
write(sales, db, "sales")
write(sales, db, "sales", append: true)
data = read(db, "SELECT * FROM orders")
db.close()
```

### Implementation

**sqlite(path) function:**
- Returns wrapper object with .query(), .exec(), .close() methods
- Wrapper holds reference to bun:sqlite Database instance
- Has ._isTovaSqlite flag for detection in write()
- Has .query property so existing read(db, sql) works

**db.query(sql, params?):**
- Calls database.prepare(sql).all(...params)
- Wraps result array in Table
- Parameterized via positional ? — prevents SQL injection

**db.exec(sql, params?):**
- Calls database.prepare(sql).run(...params)
- Returns { changes: stmt.changes }

**write(table, db, tableName, opts?):**
- Detect sqlite wrapper via ._isTovaSqlite flag
- If not append: DROP TABLE IF EXISTS, then CREATE TABLE with inferred types
- Bulk insert via prepared statement in a transaction

**Type mapping (JS to SQLite):**

| typeof value | SQLite type |
|---|---|
| string | TEXT |
| number (integer) | INTEGER |
| number (float) | REAL |
| boolean | INTEGER |
| null/undefined | NULL |

**Node.js fallback:**
- Try bun:sqlite first
- If unavailable, try require('better-sqlite3')
- If both fail: throw helpful error message

### Scope limits

- No connection pooling
- No migrations
- No async (bun:sqlite is synchronous by design)
- No ORM features

---

## Testing Strategy

Each feature gets its own test file:

- `tests/parquet.test.js`
- `tests/excel.test.js`
- `tests/charting.test.js`
- `tests/sampling.test.js`
- `tests/joins.test.js`
- `tests/sqlite.test.js`

All tests use the existing Bun test runner.

---

## Files Modified

| File | Changes |
|---|---|
| `src/stdlib/inline.js` | Parquet/Excel in read/write, chart functions, sample, join types, sqlite |
| `src/codegen/base-codegen.js` | Add new builtin names to BUILTIN_NAMES and STDLIB_DEPS |
| `package.json` | Add parquet-wasm and exceljs dependencies |
| 6 new test files | See testing strategy above |

---

## Implementation Order

1. **Joins** — pure extension of existing code, no dependencies
2. **Sampling** — pure JS, no dependencies
3. **SQLite** — uses built-in bun:sqlite, no npm install
4. **Charting** — largest feature (6 chart types), pure JS
5. **Parquet** — requires npm install + WASM loading
6. **Excel** — requires npm install
