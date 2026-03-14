# Data Tutorials & Documentation Design

**Goal:** Create a comprehensive tutorials section for data professionals covering all Table operations, based on validated working code from `test-projects/data-analytics/`.

**Architecture:** New `docs/tutorials/data/` section with 9 hands-on tutorials, plus targeted updates to existing docs (`stdlib/tables.md`, `guide/data.md`, VitePress config).

**Tech Stack:** VitePress markdown, Tova code examples validated against real test scripts.

---

## New Files

### Tutorials Section

```
docs/tutorials/
├── index.md                    — Tutorials landing page
└── data/
    ├── index.md                — Data tutorials overview + learning path
    ├── getting-started.md      — Tutorial 1: CSV basics, filter, sort, derive
    ├── grouping.md             — Tutorial 2: group_by, agg, multi-level groups
    ├── joins.md                — Tutorial 3: All 7 join types, union
    ├── window-functions.md     — Tutorial 4: Ranking, running totals, lag/lead
    ├── data-cleaning.md        — Tutorial 5: Dedup, nulls, casting, Result types
    ├── multi-format-io.md      — Tutorial 6: Excel, Parquet, SQLite pipelines
    ├── lazy-pipelines.md       — Tutorial 7: lazy(), collect(), composition
    ├── visualization.md        — Tutorial 8: All 6 SVG chart types
    └── sampling-reshaping.md   — Tutorial 9: Sampling, pivot/unpivot, explode
```

### Tutorial Format (consistent across all)

Each tutorial follows this structure:
1. **Title + one-line summary**
2. **What you'll learn** — 3-5 bullet points
3. **Setup** — Sample data (inline CSV or reference to downloadable file)
4. **Walkthrough** — Step-by-step with code blocks, expected output, explanations
5. **Try it yourself** — 2-3 exercises
6. **Next steps** — Link to next tutorial

### Source Material

Each tutorial maps to a validated test script:

| Tutorial | Source Script | Lines |
|----------|-------------|-------|
| 1. Getting Started | `01_csv_basics.tova` | ~105 |
| 2. Grouping | `02_grouping_aggregation.tova` | ~130 |
| 3. Joins | `03_joins_merges.tova` | ~120 |
| 4. Window Functions | `04_window_functions.tova` | ~110 |
| 5. Data Cleaning | `05_data_cleaning.tova` | ~144 |
| 6. Multi-Format I/O | `07_excel_parquet.tova` + `08_sqlite_warehouse.tova` | ~250 |
| 7. Lazy Pipelines | `06_lazy_pipelines.tova` | ~90 |
| 8. Visualization | `09_charting.tova` | ~100 |
| 9. Sampling & Reshaping | `10_sampling_reshaping.tova` | ~143 |

## Existing Doc Updates

### `docs/stdlib/tables.md`
- Remove the "Partial Implementation" warning banner (standalone functions work correctly)
- The warning says `.where()` etc aren't available as instance methods — this is misleading since `tableWhere()` etc. work fine as pipe-friendly functions

### `docs/guide/data.md`
- Add a note explaining both syntax forms work: `.column` expression syntax and `fn(r) r.column` lambda syntax
- Add guidance: `.column` is concise for simple column access, `fn(r)` is needed for complex logic

### `docs/.vitepress/config.js`
- Add `'/tutorials/'` sidebar section with data tutorials
- Add "Tutorials" to top nav bar

## Design Decisions

1. **Tutorials use `fn(r) r.field` style** — matches the test scripts; more explicit for beginners learning the language
2. **Each tutorial is self-contained** — can be read independently, though they build on each other
3. **Sample data embedded in tutorials** — no external downloads needed; Table() constructor with inline data for small examples, reference to CSV files for larger ones
4. **Both `tableWhere()` and `|> where()` shown** — tutorials show the pipe style primarily, mention explicit `tableWhere()` as equivalent
5. **Expected output shown** — readers can verify their code works correctly

## Non-Goals

- No new stdlib functions or language features
- No changes to the compiler or runtime
- No restructuring of existing guide/reference docs beyond the targeted updates listed above
