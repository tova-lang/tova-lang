# Sampling

Tova provides two sampling functions for drawing random subsets from tables: `sample()` for uniform random sampling and `stratified_sample()` for group-proportional sampling.

Both functions use a Fisher-Yates partial shuffle (O(k) where k is the sample size) and support seeded pseudo-random number generation for reproducible results.

---

## sample

```tova
table |> sample(n, seed?) -> Table
```

Returns a random subset of rows from a table.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `n` | Int or Float | If `>= 1`: number of rows. If `< 1`: fraction of rows. |
| `seed` | Int (optional) | Seed for reproducible sampling |

```tova
// Sample 100 random rows
subset = users |> sample(100)

// Sample 10% of rows
subset = users |> sample(0.1)

// Reproducible sample with seed
subset = users |> sample(1000, seed: 42)

// Same seed = same sample every time
a = users |> sample(100, seed: 42)
b = users |> sample(100, seed: 42)
// a and b contain the same rows
```

**Edge cases:**
- `sample(0)` returns an empty table
- `sample(n)` where n >= table.rows returns the full table (no error)
- Fractional results are floored: `sample(0.1)` on 15 rows = 1 row

---

## stratified_sample

```tova
table |> stratified_sample(key, n, seed?) -> Table
```

Groups the table by a key column, then samples `n` rows (or fraction) from each group independently. This ensures all groups are represented in the sample.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | Column | Column to group by (e.g., `.region`) |
| `n` | Int or Float | Rows per group (or fraction per group) |
| `seed` | Int (optional) | Seed for reproducible sampling |

```tova
// 50 rows from each region
balanced = users |> stratified_sample(.region, 50)

// 10% from each category
balanced = products |> stratified_sample(.category, 0.1)

// Reproducible
balanced = users |> stratified_sample(.region, 100, seed: 42)
```

**Behavior:**
- Each group is sampled independently
- If a group has fewer rows than `n`, the entire group is included
- Group ordering in the result follows the order groups appear in the data
- With a seed, each group gets a deterministic offset seed (`seed + groupIndex * 7919`) so groups don't share the same random sequence

---

## When to Use Each

| Scenario | Function |
|----------|----------|
| Quick exploration of large datasets | `sample(1000)` |
| Reproducible subset for testing | `sample(1000, seed: 42)` |
| Training/test split | `sample(0.8, seed: 42)` for train |
| Balanced representation across groups | `stratified_sample(.class, 100)` |
| Proportional subsets per category | `stratified_sample(.category, 0.1)` |

---

## Seeded PRNG

When a `seed` is provided, Tova uses an xorshift128 pseudo-random number generator instead of `Math.random()`. This produces deterministic results across runs:

```tova
// Always the same 100 rows
subset = data |> sample(100, seed: 42)

// Different seed = different rows
other = data |> sample(100, seed: 99)
```

Without a seed, `Math.random()` is used and results vary between runs.

---

## Pipeline Integration

Sampling composes naturally with other table operations:

```tova
// Sample, then analyze
read("huge_dataset.csv")
  |> sample(10000, seed: 42)
  |> where(.status == "active")
  |> group_by(.region)
  |> agg(avg_spend: mean(.amount))
  |> sort_by(.avg_spend, desc: true)
  |> peek()

// Stratified sample for balanced analysis
read("survey.csv")
  |> stratified_sample(.age_group, 200, seed: 42)
  |> group_by(.age_group)
  |> agg(satisfaction: mean(.score))
  |> bar_chart(x: .age_group, y: .satisfaction)
  |> write_text("satisfaction.svg")
```
