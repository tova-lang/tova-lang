# Data Tutorials Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create 9 data tutorials + overview page, update 2 existing docs, and add sidebar config for a complete data professionals learning path.

**Architecture:** VitePress markdown files in `docs/tutorials/data/`. Each tutorial is self-contained with inline sample data and runnable Tova code blocks. All code examples are validated against working scripts in `test-projects/data-analytics/`.

**Tech Stack:** VitePress, Tova syntax highlighting (already configured via TextMate grammar)

---

### Task 1: Create tutorials index pages

**Files:**
- Create: `docs/tutorials/index.md`
- Create: `docs/tutorials/data/index.md`

**Step 1: Create the tutorials landing page**

Create `docs/tutorials/index.md`:

```markdown
# Tutorials

Hands-on, step-by-step guides that walk you through real-world Tova projects.

## Data Analytics

A 9-part series covering everything data professionals need — from loading CSVs to building SQLite warehouses and generating charts.

<div class="tutorial-grid">

| # | Tutorial | What You'll Learn |
|---|----------|-------------------|
| 1 | [Getting Started with Tables](./data/getting-started) | Load CSV, inspect, filter, sort, derive columns, write results |
| 2 | [Grouping & Aggregation](./data/grouping) | GROUP BY, sum/mean/median/count, multi-level grouping, pivot |
| 3 | [Joins & Combining Data](./data/joins) | Inner, left, right, outer, anti, semi joins; union |
| 4 | [Window Functions](./data/window-functions) | Ranking, running totals, lag/lead, moving averages |
| 5 | [Data Cleaning](./data/data-cleaning) | Dedup, null handling, type casting, validation, Result types |
| 6 | [Multi-Format I/O](./data/multi-format-io) | Excel, Parquet, SQLite; format conversion pipelines |
| 7 | [Lazy Pipelines](./data/lazy-pipelines) | Deferred execution, query composition, lazy iteration |
| 8 | [Visualization](./data/visualization) | Bar, line, scatter, histogram, pie, heatmap charts |
| 9 | [Sampling & Reshaping](./data/sampling-reshaping) | Random/stratified sampling, pivot/unpivot, explode |

</div>

## More Tutorials

Coming soon: Full-Stack Web, CLI Tools, Edge Deployment.
```

**Step 2: Create the data tutorials overview**

Create `docs/tutorials/data/index.md`:

```markdown
# Data Analytics Tutorials

A hands-on series covering Tova's complete data toolkit. Each tutorial builds on real datasets and produces working output — CSV files, charts, database tables.

## Prerequisites

- [Install Tova](/getting-started/)
- Basic familiarity with [Tova syntax](/guide/variables)

## Sample Data

These tutorials use three CSV files. Create a `data/` directory and save these files:

**`data/employees.csv`**
```csv
id,name,department,title,salary,hire_date,city,performance_score,is_remote
1,Alice Chen,Engineering,Senior Engineer,145000,2019-03-15,San Francisco,4.5,true
2,Bob Martinez,Engineering,Staff Engineer,175000,2017-06-01,San Francisco,4.8,false
3,Carol White,Marketing,Marketing Manager,110000,2020-01-10,New York,3.9,true
4,David Kim,Engineering,Junior Engineer,95000,2022-08-20,Austin,3.5,false
5,Eva Johnson,Sales,Sales Director,160000,2018-04-12,New York,4.7,false
6,Frank Lee,Marketing,Content Lead,98000,2021-03-05,Chicago,4.1,true
7,Grace Park,Engineering,Senior Engineer,148000,2019-09-22,Austin,4.3,true
8,Hank Wilson,Sales,Account Executive,85000,2023-01-15,Chicago,3.2,false
9,Iris Brown,Engineering,Tech Lead,185000,2016-11-08,San Francisco,4.9,false
10,Jack Taylor,Sales,Sales Rep,72000,2023-06-01,Austin,3.0,true
11,Karen Davis,Engineering,Senior Engineer,152000,2018-07-14,New York,4.4,false
12,Leo Adams,Marketing,SEO Specialist,88000,2022-02-28,Chicago,3.7,true
13,Mia Thomas,Engineering,Junior Engineer,92000,2023-03-10,Austin,3.3,true
14,Noah Clark,Sales,Account Executive,88000,2021-09-01,New York,4.0,false
15,Olivia Wright,Engineering,Staff Engineer,170000,2017-12-01,San Francisco,4.6,true
16,Pat Harris,Marketing,VP Marketing,195000,2015-05-20,New York,4.8,false
17,Quinn Scott,Engineering,Principal Engineer,210000,2014-08-15,San Francisco,5.0,false
18,Rosa Green,Sales,Sales Manager,130000,2019-11-01,Chicago,4.2,false
19,Sam Nelson,Engineering,Senior Engineer,155000,2020-04-15,Austin,4.1,true
20,Tina Lopez,Marketing,Designer,95000,2022-05-10,Chicago,3.8,true
```

**`data/sales.csv`** and **`data/projects.csv`** — see the [sample data repository](../../test-projects/data-analytics/data/) for complete files.

## Learning Path

| # | Tutorial | Difficulty | Time |
|---|----------|-----------|------|
| 1 | [Getting Started with Tables](./getting-started) | Beginner | 15 min |
| 2 | [Grouping & Aggregation](./grouping) | Beginner | 15 min |
| 3 | [Joins & Combining Data](./joins) | Intermediate | 20 min |
| 4 | [Window Functions](./window-functions) | Intermediate | 20 min |
| 5 | [Data Cleaning](./data-cleaning) | Intermediate | 20 min |
| 6 | [Multi-Format I/O](./multi-format-io) | Intermediate | 20 min |
| 7 | [Lazy Pipelines](./lazy-pipelines) | Intermediate | 15 min |
| 8 | [Visualization](./visualization) | Beginner | 15 min |
| 9 | [Sampling & Reshaping](./sampling-reshaping) | Intermediate | 15 min |

## Quick Reference

While working through tutorials, keep these references handy:

- [Tables API Reference](/stdlib/tables) — all table functions
- [Tables & Data Guide](/guide/data) — column expressions, operation overview
- [I/O Guide](/guide/io) — file reading and writing
```

**Step 3: Verify files exist**

Run: `ls docs/tutorials/index.md docs/tutorials/data/index.md`

---

### Task 2: Tutorial 1 — Getting Started with Tables

**Files:**
- Create: `docs/tutorials/data/getting-started.md`

Write the tutorial based on `test-projects/data-analytics/01_csv_basics.tova`. Cover:

1. Loading a CSV file with `read()`
2. Inspecting data: `peek()`, `schemaOf()`, `describe()`
3. Filtering with `tableWhere(fn(r) ...)`
4. Selecting columns with `tableSelect()`
5. Adding computed columns with `tableDerive()`
6. Sorting with `tableSortBy()` and limiting with `tableLimit()`
7. Renaming columns with `tableRename()`
8. Excluding columns with `tableSelect({__exclude: [...]})`
9. Writing results with `write()`

Use the `employees.csv` sample data. Show both `fn(r) r.field` and mention `.field` column expression syntax. All code wrapped in `async fn main() { }`.

Show expected output after key operations (e.g., `peek()` results).

End with: "Next: [Grouping & Aggregation](./grouping)"

---

### Task 3: Tutorial 2 — Grouping & Aggregation

**Files:**
- Create: `docs/tutorials/data/grouping.md`

Based on `test-projects/data-analytics/02_grouping_aggregation.tova`. Cover:

1. Basic `tableGroupBy()` + `tableAgg()` with all 6 aggregation functions
2. Group by different columns (department, city, product)
3. Derived columns before grouping (e.g., extract month from date)
4. Cross-tabulation pattern (dept_city composite key)
5. Pivot tables with `tablePivot()`
6. Writing aggregated results

Use both `employees.csv` and `sales.csv`.

End with: "Next: [Joins & Combining Data](./joins)"

---

### Task 4: Tutorial 3 — Joins & Combining Data

**Files:**
- Create: `docs/tutorials/data/joins.md`

Based on `test-projects/data-analytics/03_joins_merges.tova`. Cover:

1. Inner join with `tableJoin()`
2. Left join — all employees with their sales (if any)
3. Anti join — employees with NO sales
4. Semi join — employees who ARE in sales
5. Right join — ensuring all reference records appear
6. Outer join — full picture
7. Multi-step joins — enriching sales with employee + project data
8. Union — combining tables with `tableUnion()`

Include a clear table explaining all 7 join types with diagrams (text-based).

End with: "Next: [Window Functions](./window-functions)"

---

### Task 5: Tutorial 4 — Window Functions

**Files:**
- Create: `docs/tutorials/data/window-functions.md`

Based on `test-projects/data-analytics/04_window_functions.tova`. Cover:

1. What window functions are (vs. group_by + agg)
2. `tableWindow()` with partition and order
3. Ranking: `winRowNumber()`, `winDenseRank()`, `winPercentRank()`, `winNtile()`
4. Running aggregates: `winRunningSum()`, `winRunningCount()`, `winRunningAvg()`
5. Lag/Lead: `winLag()`, `winLead()` with change calculations
6. Moving averages: `winMovingAvg()`
7. First/last values: `winFirstValue()`, `winLastValue()`
8. Rank within partition (e.g., top 3 per region)

Include a reference table of all 16 window functions.

End with: "Next: [Data Cleaning](./data-cleaning)"

---

### Task 6: Tutorial 5 — Data Cleaning

**Files:**
- Create: `docs/tutorials/data/data-cleaning.md`

Based on `test-projects/data-analytics/05_data_cleaning.tova`. Cover:

1. Creating dirty test data with Table() constructor
2. Deduplication with `tableDropDuplicates()`
3. Dropping nil rows with `dropNil()`
4. Filling nil values with `fillNil()`
5. Type casting with `cast()` — Int, Float, Bool, String
6. Data validation using `tableDerive()` for flag columns
7. Result-based processing — `parse_record()` returning Ok/Err
8. `filterOk()` and `filterErr()` for separating successes from failures
9. Real-world cleaning pipeline on employee data

End with: "Next: [Multi-Format I/O](./multi-format-io)"

---

### Task 7: Tutorial 6 — Multi-Format I/O

**Files:**
- Create: `docs/tutorials/data/multi-format-io.md`

Based on `test-projects/data-analytics/07_excel_parquet.tova` and `08_sqlite_warehouse.tova`. Cover:

**Excel:**
1. Writing to Excel with `writeExcel()` (default and named sheets)
2. Reading from Excel with `readExcel()` (default and named sheets)
3. Generic `read()` auto-detecting Excel format
4. Round-trip verification

**Parquet:**
5. Writing to Parquet with `writeParquet()` (default and gzip compression)
6. Reading from Parquet with `readParquet()`
7. Generic `read()` auto-detecting Parquet format

**SQLite:**
8. Creating a database with `sqlite()`
9. Loading CSV data with `db.writeTable()`
10. SQL queries with `db.query()` — basic, parameterized, joins, subqueries, window functions
11. Hybrid workflow: SQL result → Tova table operations
12. Exporting SQL results to CSV

**Format Conversion:**
13. CSV → Excel → Parquet pipeline
14. Multi-format output (same data to CSV, JSON, Excel, Parquet)

End with: "Next: [Lazy Pipelines](./lazy-pipelines)"

---

### Task 8: Tutorial 7 — Lazy Pipelines

**Files:**
- Create: `docs/tutorials/data/lazy-pipelines.md`

Based on `test-projects/data-analytics/06_lazy_pipelines.tova`. Cover:

1. What lazy evaluation means — query plan vs. execution
2. Creating a lazy table with `lazy()`
3. Chaining `.where()`, `.select()`, `.derive()`, `.sortBy()`, `.limit()`
4. Materializing with `collect()` — both `collect(query)` and `|> collect()`
5. Lazy → group_by transition (materializes automatically)
6. Composable queries — reusable base query functions
7. Complex filter chains — multiple `.where()` calls
8. Iterating lazy results with `for row in lazy_table`
9. When to use lazy vs. eager evaluation

End with: "Next: [Visualization](./visualization)"

---

### Task 9: Tutorial 8 — Visualization

**Files:**
- Create: `docs/tutorials/data/visualization.md`

Based on `test-projects/data-analytics/09_charting.tova`. Cover:

1. Overview: all 6 chart types return SVG strings
2. Bar chart — `barChart()` with x, y, title, color options
3. Line chart — `lineChart()` with points option
4. Scatter chart — `scatterChart()` for correlation analysis
5. Histogram — `histogram()` with bins option
6. Pie chart — `pieChart()` with label, value
7. Heatmap — `heatmap()` with x, y, value
8. Saving charts with `writeText()`
9. Common patterns: aggregate first, then chart

Include a reference table of all chart functions and their options.

End with: "Next: [Sampling & Reshaping](./sampling-reshaping)"

---

### Task 10: Tutorial 9 — Sampling & Reshaping

**Files:**
- Create: `docs/tutorials/data/sampling-reshaping.md`

Based on `test-projects/data-analytics/10_sampling_reshaping.tova`. Cover:

**Sampling:**
1. Random sampling with `tableSample()` — fixed count and fractional
2. Reproducible sampling with seed
3. Stratified sampling with `tableStratifiedSample()` — equal per group

**Reshaping:**
4. Pivot (long → wide) with `tablePivot()`
5. Unpivot (wide → long) with `tableUnpivot()`
6. Explode arrays with `tableExplode()`
7. Explode + analysis workflow (e.g., skill frequency)
8. Full reshape workflow: build data → pivot → sort

End with links to reference docs and the data professionals guide.

---

### Task 11: Update existing docs

**Files:**
- Modify: `docs/stdlib/tables.md` (lines 7-9)
- Modify: `docs/guide/data.md` (add note after line 68)

**Step 1: Fix stdlib/tables.md warning**

Remove the misleading "Partial Implementation" warning at the top of `docs/stdlib/tables.md`. The current warning says:

```markdown
::: warning Partial Implementation
Table query methods (`.where()`, `.select()`, `.derive()`, `.sortBy()`, `.groupBy()`, `.join()`, etc.) are not yet available as instance methods. Use the standalone collection functions (`filter`, `sorted`, `map`) on `t.rows` as an alternative.
:::
```

Replace with:

```markdown
::: tip Standalone Functions
Table operations are standalone, pipe-friendly functions: `tableWhere()`, `tableSelect()`, `tableDerive()`, etc. Use the pipe operator `|>` to chain them, or call them directly with the table as the first argument.
:::
```

**Step 2: Add syntax note to guide/data.md**

After line 68 in `docs/guide/data.md` (after the column expressions section), add a note:

```markdown
::: tip Both Syntaxes Work
Column expressions (`.age > 25`) and lambda syntax (`fn(r) r.age > 25`) are interchangeable. Use `.column` for concise column access, and `fn(r)` when you need complex logic, multiple statements, or variable references from outer scope.
:::
```

---

### Task 12: Update VitePress config

**Files:**
- Modify: `docs/.vitepress/config.js`

**Step 1: Add Tutorials to nav bar**

In the `nav` array (after the `Tutorial` entry around line 34), add:

```javascript
{ text: 'Tutorials', link: '/tutorials/' },
```

**Step 2: Add tutorials sidebar**

Add a new sidebar section for `/tutorials/` (after the existing `/guide/` sidebar config):

```javascript
'/tutorials/': [
  {
    text: 'Tutorials',
    items: [
      { text: 'Overview', link: '/tutorials/' },
    ],
  },
  {
    text: 'Data Analytics',
    items: [
      { text: 'Overview', link: '/tutorials/data/' },
      { text: '1. Getting Started', link: '/tutorials/data/getting-started' },
      { text: '2. Grouping & Aggregation', link: '/tutorials/data/grouping' },
      { text: '3. Joins & Combining', link: '/tutorials/data/joins' },
      { text: '4. Window Functions', link: '/tutorials/data/window-functions' },
      { text: '5. Data Cleaning', link: '/tutorials/data/data-cleaning' },
      { text: '6. Multi-Format I/O', link: '/tutorials/data/multi-format-io' },
      { text: '7. Lazy Pipelines', link: '/tutorials/data/lazy-pipelines' },
      { text: '8. Visualization', link: '/tutorials/data/visualization' },
      { text: '9. Sampling & Reshaping', link: '/tutorials/data/sampling-reshaping' },
    ],
  },
],
```

**Step 3: Verify config syntax**

Run: `cd docs && node -c .vitepress/config.js` (or just verify the file parses)

---

## Verification

After all tasks complete:

1. Run `cd docs && npm run docs:dev` to verify VitePress builds
2. Navigate to `/tutorials/` and verify all 9 tutorials render
3. Verify sidebar navigation works
4. Check that code blocks have Tova syntax highlighting
5. Verify links between tutorials work (Next/Previous)
