# CLI Tool

This example builds command-line utilities in Tova without any server or client blocks. It demonstrates that Tova is a general-purpose scripting language: argument dispatch with if/else chains, pipe-based data transformation, Result/Option error handling, and file I/O for reading CSV and writing JSON.

## The Full Application

```tova
// CSV to JSON converter with log analysis

type LogEntry {
  timestamp: String
  level: String
  message: String
  service: String
}

type ServiceCount {
  service: String
  count: Int
}

type LogReport {
  total: Int
  errors: Int
  warnings: Int
  by_service: [ServiceCount]
  error_messages: [String]
}

// --- CSV to JSON Converter ---

fn convert_csv_to_json(input_path: String, output_path: String) -> Result<String, String> {
  guard input_path |> ends_with(".csv") else {
    return Err("Input must be a .csv file")
  }

  table = read(input_path)
    |> drop_nil(.name)
    |> derive(
      .name = .name |> trim(),
      .email = .email |> lower() |> trim()
    )
    |> sort_by(.name)

  write(table, output_path)
  Ok("Converted {table.rows} rows to {output_path}")
}

// --- Log File Analyzer ---

fn analyze_logs(log_path: String) -> Result<LogReport, String> {
  entries = read(log_path)

  errors = entries |> where(.level == "ERROR")
  warnings = entries |> where(.level == "WARN")

  by_service = entries
    |> group_by(.service)
    |> agg(count: count())
    |> sort_by(.count, desc: true)

  error_messages = errors
    |> select(.message)
    |> drop_duplicates(.message)
    |> limit(20)

  report = LogReport {
    total: entries.rows,
    errors: errors.rows,
    warnings: warnings.rows,
    by_service: by_service |> to_list(),
    error_messages: error_messages |> to_list()
  }
  Ok(report)
}

fn format_report(report: LogReport) -> String {
  header = "=== Log Analysis Report ===\n"
  summary = "Total: {report.total} | Errors: {report.errors} | Warnings: {report.warnings}\n"

  services = report.by_service
    |> map(fn(s) "  {s.service}: {s.count}")
    |> join("\n")

  errors = report.error_messages
    |> map(fn(m) "  - {m}")
    |> join("\n")

  "{header}\n{summary}\nBy Service:\n{services}\n\nRecent Errors:\n{errors}"
}

// --- String Utilities ---

fn slugify(text: String) -> String {
  text
    |> lower()
    |> trim()
    |> replace(" ", "-")
    |> replace("_", "-")
}

fn parse_key_value(line: String) -> Option<(String, String)> {
  parts = line |> split("=")
  if parts |> len() >= 2 {
    key = parts |> first()
    value = parts |> skip(1) |> join("=")
    Some((key |> trim(), value |> trim()))
  } else {
    None
  }
}

// --- Main Entry Point ---

fn print_usage() {
  print("Usage:")
  print("  tova run cli.tova convert <input.csv> <output.json>")
  print("  tova run cli.tova analyze <logfile.jsonl> [--json]")
  print("  tova run cli.tova slugify <words...>")
  print("  tova run cli.tova parse-env <file.env>")
  print("  tova run cli.tova help")
}

fn main(args: [String]) {
  if args |> len() == 0 {
    print_usage()
  } else {
    cmd = args |> first()

    if cmd == "convert" && args |> len() == 3 {
      input = args[1]
      output = args[2]
      match convert_csv_to_json(input, output) {
        Ok(msg) => print(msg)
        Err(e) => print("Error: {e}")
      }
    } else if cmd == "analyze" && args |> len() == 3 && args[2] == "--json" {
      log_path = args[1]
      match analyze_logs(log_path) {
        Ok(report) => {
          write(report, "report.json")
          print("Report written to report.json")
        }
        Err(e) => print("Error: {e}")
      }
    } else if cmd == "analyze" && args |> len() == 2 {
      log_path = args[1]
      match analyze_logs(log_path) {
        Ok(report) => print(format_report(report))
        Err(e) => print("Error: {e}")
      }
    } else if cmd == "slugify" && args |> len() >= 2 {
      words = args |> skip(1)
      result = words |> join(" ") |> slugify()
      print(result)
    } else if cmd == "parse-env" && args |> len() == 2 {
      file_path = args[1]
      lines = read(file_path) |> split("\n")
      lines
        |> filter(fn(line) line |> len() > 0)
        |> filter(fn(line) !(line |> starts_with("#")))
        |> map(fn(line) {
          match parse_key_value(line) {
            Some((key, value)) => print("{key} => {value}")
            None => print("Skipping invalid line: {line}")
          }
        })
    } else if cmd == "help" {
      print_usage()
    } else {
      print("Unknown command: {cmd}")
      print("Run 'tova run cli.tova help' for usage")
    }
  }
}
```

## Running It

```bash
# Convert a CSV file to JSON
tova run cli.tova convert users.csv users.json

# Analyze a JSONL log file
tova run cli.tova analyze app.log.jsonl

# Generate a JSON report
tova run cli.tova analyze app.log.jsonl --json

# Slugify text
tova run cli.tova slugify "Hello World Example"
# => hello-world-example

# Parse an .env file
tova run cli.tova parse-env .env
```

## What This Demonstrates

### No Server or Client Blocks

This is a pure script — no `server {}`, no `client {}`, no `shared {}`. Tova works as a standalone scripting language. The `main(args)` function is the entry point, receiving command-line arguments as an array.

### Argument Dispatch with If/Else

The core dispatch extracts the first argument and uses if/else chains to route commands:

```tova
cmd = args |> first()

if cmd == "convert" && args |> len() == 3 {
  input = args[1]
  output = args[2]
  // ...
} else if cmd == "analyze" && args |> len() == 2 {
  log_path = args[1]
  // ...
} else if cmd == "slugify" && args |> len() >= 2 {
  words = args |> skip(1)
  // ...
}
```

Each branch validates the argument count and extracts values by index. The `skip(1)` pipe captures remaining arguments for variable-length commands like `slugify`.

### Pipe Operator for Data Transformation

The `analyze_logs` function chains table operations with pipes:

```tova
by_service = entries
  |> group_by(.service)
  |> agg(count: count())
  |> sort_by(.count, desc: true)
```

The `format_report` function chains string transformations:

```tova
services = report.by_service
  |> map(fn(s) "  {s.service}: {s.count}")
  |> join("\n")
```

### Result/Option Error Handling

Functions return `Result<T, E>` for operations that can fail:

```tova
fn convert_csv_to_json(input_path: String, output_path: String) -> Result<String, String> {
  guard input_path |> ends_with(".csv") else {
    return Err("Input must be a .csv file")
  }
  // ...
  Ok("Converted {table.rows} rows to {output_path}")
}
```

`parse_key_value` returns `Option` for values that may not exist:

```tova
fn parse_key_value(line: String) -> Option<(String, String)> {
  parts = line |> split("=")
  match parts {
    [key, value] => Some((key |> trim(), value |> trim()))
    _ => None
  }
}
```

### File I/O

`read()` auto-detects format from the file extension — CSV returns a Table, JSONL returns a list. `write()` serializes the data to the target format based on the output extension.

```tova
table = read("data.csv")           // Table<Row>
write(table, "output.json")        // Writes JSON array
write(report, "report.json")       // Writes structured JSON
```

## Key Patterns

**Tova as a scripting language.** No web framework required. `main(args)` gives you a CLI entry point with full access to Tova's type system, pattern matching, and data operations.

**Guard clauses for validation.** `guard condition else { return Err(...) }` provides early returns that keep the happy path unindented.

**If/else argument dispatch.** Checking `args |> len()` and accessing by index gives you straightforward argument parsing without an argument-parsing library.

**Pipes for readability.** Data flows left-to-right through transformation chains, whether operating on tables or strings.
