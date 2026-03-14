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
// Write additional data without overwriting
new_rows |> write("data.csv", append: true)
```

## Streaming Large Files

::: warning Not Yet Implemented
The `stream()` function for batch file processing is planned but not yet available. For now, read files with `read()` or process large files by reading with `fs.readText()` and splitting manually.
:::

When available, `stream()` will read a file in batches, yielding one `Table` per batch for processing files too large to fit in memory:

```tova
// Planned API:
for chunk in stream("huge.csv", batch: 1000) {
  chunk
    |> where(.amount > 0)
    |> write("filtered.csv", append: true)
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
    |> dropNil(.email)
    |> fillNil(.spend, 0.0)
    |> derive(.email = .email |> lower() |> trim())
    |> where(.spend > 0)
    |> peek(title: "Clean data")

  // Aggregate
  summary = clean
    |> groupBy(.country)
    |> agg(
      count: count(),
      total: sum(.spend),
      avg: mean(.spend)
    )
    |> sortBy(.total, desc: true)

  // Write results
  clean |> write("clean_customers.csv")
  summary |> write("summary.json")
}
```

## Practical Tips

**Let the extension do the work.** You almost never need to specify format options. Just use the right file extension and `read()`/`write()` handles the rest.

**Watch memory on large files.** If a file has more than 100,000 rows, consider processing it in smaller chunks or splitting the file before loading.

**Combine `read()` with pipes.** Since `read()` returns a `Table`, you can immediately pipe into table operations:

```tova
result = read("sales.csv")
  |> where(.amount > 100)
  |> groupBy(.region)
  |> agg(total: sum(.amount))
```

**Use `peek()` after `read()`.** When working with unfamiliar data, start with `read("file.csv") |> peek()` to see what the data looks like before building your pipeline.

::: tip Scripting I/O
For filesystem operations (`fs.exists`, `fs.read_text`, `fs.write_text`, `fs.mkdir`, etc.), shell commands (`sh`, `exec`, `spawn`), environment access (`env`, `args`, `exit`), and path utilities, see the [Scripting I/O](../stdlib/io.md) stdlib reference.
:::
