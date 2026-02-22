# I/O

Tova provides universal `read()` and `write()` functions that handle file format detection automatically. Pass a file path and Tova figures out the format from the extension -- CSV, JSON, JSONL, TSV -- no configuration needed. For large files, `stream()` processes data in batches.

## Reading Data

### From Files

The `read()` function detects the format from the file extension and returns the appropriate type:

```tova
// CSV → Table
sales = read("sales.csv")

// JSON array → Table
users = read("users.json")

// JSON object → Object
config = read("config.json")

// JSONL (one JSON object per line) → Table
logs = read("events.jsonl")

// TSV → Table
data = read("data.tsv")
```

### From URLs

Pass a URL string and Tova fetches the content, detecting the format from the URL extension or content type:

```tova
// Fetch JSON from an API
users = read("https://api.example.com/users.json")

// Fetch CSV from a URL
data = read("https://data.gov/dataset.csv")
```

### From a Database

Pass a database connection and a SQL query:

```tova
server {
  db { path: "./data.db" }
  users = read(db, "SELECT * FROM users WHERE active = true")
}
```

### Options

Pass options as a second argument to control parsing behavior:

```tova
// Custom delimiter
data = read("data.txt", delimiter: "|")

// Headerless CSV (columns named col_0, col_1, ...)
data = read("raw.csv", header: false)

// Tab delimiter on a .csv file
data = read("tabs.csv", delimiter: "\t")
```

## Writing Data

The `write()` function detects the output format from the file extension:

```tova
// Write Table to CSV
sales |> write("output.csv")

// Write Table to JSON
sales |> write("output.json")

// Write Table to JSONL
sales |> write("events.jsonl")

// Write Table to TSV
sales |> write("output.tsv")

// Write a plain object to JSON
config |> write("config.json")
```

### Append Mode

Add data to an existing file without overwriting:

```tova
for chunk in stream("huge.csv", batch: 1000) {
  chunk |> where(.valid) |> write("clean.csv", append: true)
}
```

## Streaming Large Files

The `stream()` function reads a file in batches, yielding one `Table` per batch. This lets you process files that are too large to fit in memory:

```tova
for chunk in stream("huge.csv", batch: 1000) {
  chunk
    |> where(.amount > 0)
    |> write("filtered.csv", append: true)
}
```

Each chunk is a `Table` with the same columns as the full file. The default batch size is 1,000 rows.

`stream()` supports CSV and JSONL formats:

```tova
// Stream JSONL
for chunk in stream("events.jsonl", batch: 500) {
  process(chunk)
}
```

## Format Reference

| Extension | Read Result | Write Input |
|-----------|------------|-------------|
| `.csv` | `Table` | `Table` or `[Object]` |
| `.tsv` | `Table` | `Table` or `[Object]` |
| `.json` | `Table` (array) or `Object` | Any value |
| `.jsonl` | `Table` | `Table` or `[Object]` |
| `.ndjson` | `Table` | `Table` or `[Object]` |

Unknown extensions fall back to JSON parsing first, then CSV.

## Auto Type Detection

When reading CSV and TSV files, Tova automatically detects column types:

| Value | Detected Type |
|-------|--------------|
| `42`, `-7` | `Int` |
| `3.14`, `-0.5` | `Float` |
| `true`, `false` | `Bool` |
| `null`, `nil` | `Nil` |
| Empty string | `Nil` |
| Everything else | `String` |

## CSV Handling

### Quoted Fields

Fields containing delimiters, quotes, or newlines are automatically handled:

```tova
// Reading: quoted fields are unquoted
// "Hello, World" → Hello, World
// "He said ""hi""" → He said "hi"

// Writing: fields that need quoting are automatically quoted
table |> write("output.csv")
// Values with commas, quotes, or newlines are wrapped in double quotes
```

### Custom Delimiters

```tova
// Pipe-delimited
data = read("data.txt", delimiter: "|")

// Semicolon-delimited (common in European CSV)
data = read("data.csv", delimiter: ";")
```

## End-to-End Example

A complete data processing pipeline:

```tova
server {
  // Read raw data
  raw = read("customers.csv")

  // Clean and transform
  clean = raw
    |> drop_nil(.email)
    |> fill_nil(.spend, 0.0)
    |> derive(.email = .email |> lower() |> trim())
    |> where(.spend > 0)
    |> peek(title: "Clean data")

  // Aggregate
  summary = clean
    |> group_by(.country)
    |> agg(
      count: count(),
      total: sum(.spend),
      avg: mean(.spend)
    )
    |> sort_by(.total, desc: true)

  // Write results
  clean |> write("clean_customers.csv")
  summary |> write("summary.json")
}
```

## Practical Tips

**Let the extension do the work.** You almost never need to specify format options. Just use the right file extension and `read()`/`write()` handles the rest.

**Use `stream()` for large files.** If a file has more than 100,000 rows, consider streaming it in batches instead of loading it all at once. This keeps memory usage constant regardless of file size.

**Combine `read()` with pipes.** Since `read()` returns a `Table`, you can immediately pipe into table operations:

```tova
result = read("sales.csv")
  |> where(.amount > 100)
  |> group_by(.region)
  |> agg(total: sum(.amount))
```

**Use `peek()` after `read()`.** When working with unfamiliar data, start with `read("file.csv") |> peek()` to see what the data looks like before building your pipeline.

::: tip Scripting I/O
For filesystem operations (`fs.exists`, `fs.read_text`, `fs.write_text`, `fs.mkdir`, etc.), shell commands (`sh`, `exec`, `spawn`), environment access (`env`, `args`, `exit`), and path utilities, see the [Scripting I/O](../stdlib/io.md) stdlib reference.
:::
