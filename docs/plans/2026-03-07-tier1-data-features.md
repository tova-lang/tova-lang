# Tier 1 Data Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Parquet, Excel, SVG charting, sampling, all join types, and SQLite to make Tova competitive for data professionals.

**Architecture:** All features live in `src/stdlib/inline.js` (compiled output) and `src/runtime/table.js` (runtime/tests). New builtins auto-register via `BUILTIN_FUNCTIONS` keys. Chart functions are pure JS SVG generators in `src/runtime/charts.js`. Parquet/Excel use npm packages (lazy-loaded). SQLite uses `bun:sqlite`.

**Tech Stack:** Bun runtime, `parquet-wasm` (npm), `exceljs` (npm), `bun:sqlite` (built-in), pure JS SVG generation.

**Design doc:** `docs/plans/2026-03-07-tier1-data-features-design.md`

---

## Task 1: Extended Join Types

**Files:**
- Modify: `src/runtime/table.js:220-270` (extend `table_join`)
- Modify: `src/stdlib/inline.js:275` (update `table_join` inline string)
- Test: `tests/joins.test.js` (create)

### Step 1: Write failing tests for all new join types

Create `tests/joins.test.js` with tests for: inner (existing), left (existing), right, outer, cross, anti, semi joins. Use two test tables — `employees` (4 rows with dept_id 10, 20, 30, null) and `departments` (3 rows with dept_id 10, 20, 40). This ensures non-overlapping keys for testing unmatched rows.

Key assertions:
- right join: 3 rows (Alice+Eng, Bob+Mkt, Sales+null-name)
- outer join: 5 rows (all from both sides)
- cross join: left.rows * right.rows, no keys required
- anti join: only left rows with no match (Charlie, Diana), no right columns
- semi join: only left rows with match (Alice, Bob), no right columns, no cartesian duplication

### Step 2: Run tests to verify they fail

Run: `bun test tests/joins.test.js`
Expected: Tests for right, outer, cross, anti, semi FAIL.

### Step 3: Implement all join types in `src/runtime/table.js`

Replace the `table_join` function (line 220) with extended version supporting 7 join types:

- **cross**: Nested loop, no hash index, left/right params optional
- **anti**: Build right key Set, keep left rows where key NOT found, return only left columns
- **semi**: Build right key Set, keep left rows where key IS found, return only left columns
- **right**: Swap tables, do left join via recursive call, reorder columns
- **inner/left/outer**: Existing hash-join algorithm extended with a `matchedRightKeys` Set for outer join. Second pass adds unmatched right rows with null left columns.

### Step 4: Run tests to verify they pass

Run: `bun test tests/joins.test.js`
Expected: ALL PASS

### Step 5: Update inline.js with same logic

Replace the `table_join` entry at `src/stdlib/inline.js:275` with the same logic compressed to template string format (matching neighboring entries' style).

### Step 6: Run full test suite

Run: `bun test`
Expected: All existing tests + new join tests pass.

### Step 7: Commit

```bash
git add src/runtime/table.js src/stdlib/inline.js tests/joins.test.js
git commit -m "feat: add right, outer, cross, anti, semi join types"
```

---

## Task 2: Sampling

**Files:**
- Modify: `src/runtime/table.js` (add `table_sample`, `table_stratified_sample` after line 716)
- Modify: `src/stdlib/inline.js` (add entries before line 1488, add deps before line 1551)
- Test: `tests/sampling.test.js` (create)

### Step 1: Write failing tests

Create `tests/sampling.test.js` with 100-row test table (3 groups: A, B, C).

Test `table_sample`: N rows, fraction, seed reproducibility, different seeds differ, oversized N returns full table, sample(0) returns empty.

Test `table_stratified_sample`: N per group (3 groups x 5 = 15), fraction per group, seed reproducibility, small groups return full group.

### Step 2: Run tests to verify they fail

Run: `bun test tests/sampling.test.js`
Expected: FAIL — functions not exported.

### Step 3: Implement in `src/runtime/table.js`

Add three exports at end of file:

1. `_xorshift128(seed)` — seeded PRNG, returns function producing 0-1 floats. Four state words initialized from seed with XOR constants.

2. `tableSample(table, n, opts)` — If n < 1 treat as fraction. Fisher-Yates partial shuffle (only first k positions, O(k)). Seed option uses `_xorshift128`, otherwise `Math.random`. Returns new Table.

3. `tableStratifiedSample(table, keyFn, n, opts)` — Group by key, apply `table_sample` per group with offset seed (seed + groupIdx * 7919), concatenate results.

### Step 4: Run tests to verify they pass

Run: `bun test tests/sampling.test.js`
Expected: ALL PASS

### Step 5: Add inline versions to `src/stdlib/inline.js`

Add `__xorshift128`, `table_sample`, `table_stratified_sample` to BUILTIN_FUNCTIONS (before closing `};` at line 1488).

Add to STDLIB_DEPS (before line 1551):
```
table_sample: ['Table', '__xorshift128'],
table_stratified_sample: ['Table', 'table_sample', '__xorshift128'],
```

### Step 6: Run full test suite

Run: `bun test`
Expected: All pass.

### Step 7: Commit

```bash
git add src/runtime/table.js src/stdlib/inline.js tests/sampling.test.js
git commit -m "feat: add sample() and stratified_sample() for tables"
```

---

## Task 3: SQLite Connector

**Files:**
- Modify: `src/runtime/table.js` (add `tova_sqlite` export at end)
- Modify: `src/stdlib/inline.js` (add `sqlite` builtin, update `write` for db targets)
- Test: `tests/sqlite.test.js` (create)

### Step 1: Write failing tests

Create `tests/sqlite.test.js` testing:
- Open in-memory database
- CREATE TABLE + INSERT with exec()
- query() returns Table
- Parameterized queries (prevents SQL injection)
- writeTable() creates table from Table data
- writeTable() with append mode
- Type inference (string/int/float/bool/null)
- Empty query returns empty Table
- `_isTovaSqlite` flag exists

### Step 2: Run tests to verify they fail

Run: `bun test tests/sqlite.test.js`
Expected: FAIL

### Step 3: Implement `tova_sqlite` in `src/runtime/table.js`

Add at end of file. The function:
1. Try `require('bun:sqlite').Database`, fall back to `require('better-sqlite3')`
2. Return object with `_isTovaSqlite: true`, `query(sql, params)`, `exec(sql, params)`, `writeTable(table, name, opts)`, `close()`
3. `query()` calls `db.prepare(sql).all(...params)`, wraps in `new Table()`
4. `exec()` calls `db.prepare(sql).run(...params)`, returns `{ changes }`
5. `writeTable()` does DROP/CREATE (unless append), infers SQLite types from first row values, bulk inserts in a transaction

Type inference helper: string->TEXT, integer->INTEGER, float->REAL, boolean->INTEGER, null->TEXT.

### Step 4: Run tests to verify they pass

Run: `bun test tests/sqlite.test.js`
Expected: ALL PASS

### Step 5: Add inline version to `src/stdlib/inline.js`

Add `sqlite` to BUILTIN_FUNCTIONS. Update `write` function to detect `destination._isTovaSqlite` and delegate to `destination.writeTable()`.

Add to STDLIB_DEPS: `sqlite: ['Table']`

### Step 6: Run full test suite

Run: `bun test`
Expected: All pass.

### Step 7: Commit

```bash
git add src/runtime/table.js src/stdlib/inline.js tests/sqlite.test.js
git commit -m "feat: add sqlite() connector with query, exec, and writeTable"
```

---

## Task 4: SVG Charting

**Files:**
- Create: `src/runtime/charts.js` (all chart functions + shared helpers)
- Modify: `src/stdlib/inline.js` (add chart builtins)
- Test: `tests/charting.test.js` (create)

### Step 1: Write failing tests

Create `tests/charting.test.js` testing all 6 chart types:

- `bar_chart`: returns valid SVG, contains data labels, respects title/width/height, works with array input, contains `<rect>` elements
- `line_chart`: returns valid SVG, contains `<polyline>` or `<path>`, respects title
- `scatter_chart`: returns valid SVG with `<circle>` elements
- `histogram`: returns valid SVG with `<rect>`, respects bins option
- `pie_chart`: returns valid SVG with `<path>` arcs, contains labels
- `heatmap`: returns valid SVG with colored `<rect>` grid

Edge cases: empty data shows "No data" message, single row works.

### Step 2: Run tests to verify they fail

Run: `bun test tests/charting.test.js`
Expected: FAIL — module not found.

### Step 3: Create `src/runtime/charts.js`

Large file (~400-500 lines). Structure:

**Shared helpers:**
- `PALETTE` — 8 perceptually distinct hex colors
- `esc(s)` — escape text for SVG (& < > ")
- `niceTicks(min, max, count)` — compute clean axis tick values
- `svgText(x, y, text, opts)` — render `<text>` element with anchor/size/rotate
- `svgLine(x1, y1, x2, y2, opts)` — render `<line>` element
- `buildSvgShell(width, height, title)` — open/close SVG tags with viewBox, title, font-family

**Margin convention:** `{ top: 40, right: 20, bottom: 60, left: 70 }` — adjusts for title and axis labels.

**Each chart function pattern:**
1. Extract rows from Table or array
2. Map data through accessor functions (x, y, col, label, value)
3. Compute domain (min/max for numeric, unique values for categorical)
4. Compute scales (linear for numeric, band for categorical)
5. Build SVG elements (axes, gridlines, data marks, title, legend)
6. Return concatenated SVG string

**Chart-specific details:**

`barChart(data, opts)` — `<rect>` per category, y-axis gridlines, category x-axis labels (rotated if > 6 items), optional value labels on bars, optional sort.

`lineChart(data, opts)` — `<polyline>` per series, supports multi-series via array of y functions. Optional data point dots via `points: true`.

`scatterChart(data, opts)` — `<circle>` per point, numeric x and y axes.

`histogram(data, opts)` — Compute bin edges (uniform bins), count per bin, render as bar chart. Default 20 bins.

`pieChart(data, opts)` — `<path>` arcs using SVG arc commands (`A rx ry ...`). Labels with percentages positioned at arc midpoints.

`heatmap(data, opts)` — Grid of `<rect>` elements. Color interpolation from white to blue (or custom scale). Category axes on x and y.

### Step 4: Run tests to verify they pass

Run: `bun test tests/charting.test.js`
Expected: ALL PASS

### Step 5: Add inline versions to `src/stdlib/inline.js`

Add `__chart_helpers` (shared code), then all 6 chart functions as BUILTIN_FUNCTIONS entries. These are large template strings.

Add to STDLIB_DEPS:
```
__chart_helpers: ['Table'],
bar_chart: ['Table', '__chart_helpers'],
line_chart: ['Table', '__chart_helpers'],
scatter_chart: ['Table', '__chart_helpers'],
histogram: ['Table', '__chart_helpers'],
pie_chart: ['Table', '__chart_helpers'],
heatmap: ['Table', '__chart_helpers'],
```

### Step 6: Run full test suite

Run: `bun test`
Expected: All pass.

### Step 7: Commit

```bash
git add src/runtime/charts.js src/stdlib/inline.js tests/charting.test.js
git commit -m "feat: add SVG charting — bar, line, scatter, histogram, pie, heatmap"
```

---

## Task 5: Parquet Read/Write

**Files:**
- Modify: `package.json` (add `parquet-wasm`)
- Modify: `src/runtime/table.js` (add `readParquet`/`writeParquet`)
- Modify: `src/stdlib/inline.js` (extend `read`/`write`)
- Test: `tests/parquet.test.js` (create)

### Step 1: Install dependency

Run: `bun add parquet-wasm`

### Step 2: Write failing tests

Create `tests/parquet.test.js` testing:
- Write and read round-trip (3-row table with string, int, float columns)
- Preserves column order
- Handles empty table
- Compression option (gzip)
- Handles null values

Use `/tmp/tova_test_output.parquet` as temp file, clean up after each test.

### Step 3: Run tests to verify they fail

Run: `bun test tests/parquet.test.js`
Expected: FAIL

### Step 4: Implement in `src/runtime/table.js`

Add `readParquet(path)` and `writeParquet(table, path, opts)` using `parquet-wasm`. Both are async.

`readParquet`: Read file to Uint8Array, pass to `parquet.readParquet()`, convert Arrow columns to row objects, wrap in Table.

`writeParquet`: Convert Table rows to Arrow-compatible column arrays, call `parquet.writeParquet()`, write resulting Uint8Array to file. Default compression: snappy.

Note: Check exact `parquet-wasm` API at implementation time — it may use `readParquet` returning an Arrow-compatible table, or may need `initSync()` initialization.

### Step 5: Extend read/write in inline.js

In `read` function (line 434 area), add: `if (ext === '.parquet') { /* lazy import parquet-wasm, read, convert to Table */ }`

In `write` function, add `.parquet` branch.

### Step 6: Run tests

Run: `bun test tests/parquet.test.js && bun test`
Expected: All pass.

### Step 7: Commit

```bash
git add package.json bun.lockb src/runtime/table.js src/stdlib/inline.js tests/parquet.test.js
git commit -m "feat: add Parquet read/write via parquet-wasm"
```

---

## Task 6: Excel Read/Write

**Files:**
- Modify: `package.json` (add `exceljs`)
- Modify: `src/runtime/table.js` (add `readExcel`/`writeExcel`)
- Modify: `src/stdlib/inline.js` (extend `read`/`write`)
- Test: `tests/excel.test.js` (create)

### Step 1: Install dependency

Run: `bun add exceljs`

### Step 2: Write failing tests

Create `tests/excel.test.js` testing:
- Write and read round-trip
- Read specific sheet by name
- Read specific sheet by index
- Preserves column names
- Handles null values
- Empty table

Use `/tmp/tova_test_output.xlsx` as temp file.

### Step 3: Run tests to verify they fail

Run: `bun test tests/excel.test.js`
Expected: FAIL

### Step 4: Implement in `src/runtime/table.js`

Add `readExcel(path, opts)` and `writeExcel(table, path, opts)` using `exceljs`. Both async.

`readExcel`: Create workbook, readFile, get worksheet (by name, index, or first), extract header row, iterate data rows building objects, return Table. Handle formula cells (use `.result`), Date cells, nulls.

`writeExcel`: Create workbook, add worksheet (named from opts.sheet or "Sheet1"), add header row from columns, add data rows, writeFile.

### Step 5: Extend read/write in inline.js

Add `.xlsx` branch in both `read` and `write`.

### Step 6: Run tests

Run: `bun test tests/excel.test.js && bun test`
Expected: All pass.

### Step 7: Commit

```bash
git add package.json bun.lockb src/runtime/table.js src/stdlib/inline.js tests/excel.test.js
git commit -m "feat: add Excel (.xlsx) read/write via exceljs"
```

---

## Task 7: Documentation Updates

**Files:**
- Modify: `docs/guide/data.md`
- Modify: `docs/guide/data-professionals.md`
- Modify: `docs/stdlib/tables.md`
- Modify: `docs/stdlib/io.md`

### Step 1: Update docs

Add sections for all 6 new features across the relevant doc pages:
- **data.md**: Parquet/Excel in "Creating Tables" section, new join types in "Joining Tables", sample/stratified_sample in new "Sampling" section, charts in new "Visualization" section
- **data-professionals.md**: Charts in analyst tier, sampling in analyst tier, new joins in engineer tier, SQLite in engineer tier, Parquet in engineer tier
- **tables.md**: New join types in operation reference, sample/stratified_sample
- **io.md**: Parquet, Excel, SQLite

### Step 2: Verify docs build

Run: `cd docs && npm run docs:build`
Expected: Build succeeds.

### Step 3: Commit

```bash
git add docs/
git commit -m "docs: add Parquet, Excel, SQLite, charting, sampling, join types documentation"
```

---

## Task 8: Final Verification

### Step 1: Run full test suite

Run: `bun test`
Expected: All existing tests + all 6 new test files pass.

### Step 2: Count new tests

Run: `bun test tests/joins.test.js tests/sampling.test.js tests/sqlite.test.js tests/charting.test.js tests/parquet.test.js tests/excel.test.js --reporter=summary`

### Step 3: Final commit if needed

```bash
git add -A
git commit -m "feat: complete Tier 1 data features — Parquet, Excel, charting, sampling, joins, SQLite"
```
