# CLI Tool

Tova offers two ways to build CLI tools: the `cli {}` block (recommended for most tools) and manual argument dispatch with `main(args)`. This page shows both approaches.

## Using the `cli {}` Block (Recommended)

The `cli {}` block lets you define commands as functions. The compiler generates argument parsing, validation, help text, and subcommand routing from your function signatures alone.

```tova
cli {
  name: "todo"
  version: "0.1.0"
  description: "A simple todo list manager"

  fn add(task: String, --priority: Int = 3) {
    print(green("Added: ") + bold(task) + dim(" (priority: {priority})"))
  }

  fn list(--all: Bool) {
    print(bold("Your tasks:"))
    print("  1. Buy groceries (priority: 2)")
    print("  2. Write docs (priority: 1)")
    if all {
      print(dim("  3. [done] Setup project"))
    }
  }

  fn remove(id: Int) {
    print(yellow("Removed task #{id}"))
  }
}
```

### Running It

```bash
$ tova run todo.tova -- add "Buy milk" --priority 1
Added: Buy milk (priority: 1)

$ tova run todo.tova -- list --all
Your tasks:
  1. Buy groceries (priority: 2)
  2. Write docs (priority: 1)
  3. [done] Setup project

$ tova run todo.tova -- --help
todo -- A simple todo list manager
Version: 0.1.0

USAGE:
  todo <command> [options]

COMMANDS:
  add
  list
  remove

OPTIONS:
  --help, -h     Show help
  --version, -v  Show version

$ tova run todo.tova -- add
Error: Missing required argument <task>
```

### What You Get for Free

- **Automatic `--help`** for the tool and each subcommand
- **Type validation** -- `--priority abc` shows `"Error: --priority must be an integer"`
- **Default values** -- `--priority` defaults to 3 without the flag
- **Bool toggles** -- `--all` is a flag with no value, `--no-all` to disable
- **Unknown flag detection** -- `--typo` shows `"Error: Unknown flag --typo"`
- **Rich colors** -- `green()`, `bold()`, `dim()` for formatted output

### Building to an Executable

```bash
tova build src --output dist
node dist/todo.js add "Buy milk"
```

The output has a `#!/usr/bin/env node` shebang and executable permissions.

See the [CLI Block guide](/fullstack/cli-block) for the complete reference.

---

## Manual Approach (Without `cli {}`)

For tools that need custom argument parsing or when you want full control, you can use `main(args)` with manual dispatch. This approach demonstrates that Tova works as a general-purpose scripting language without any blocks at all.

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

    if cmd == "convert" and args |> len() == 3 {
      input = args[1]
      output = args[2]
      match convert_csv_to_json(input, output) {
        Ok(msg) => print(msg)
        Err(e) => print("Error: {e}")
      }
    } elif cmd == "analyze" and args |> len() == 3 and args[2] == "--json" {
      log_path = args[1]
      match analyze_logs(log_path) {
        Ok(report) => {
          write(report, "report.json")
          print("Report written to report.json")
        }
        Err(e) => print("Error: {e}")
      }
    } elif cmd == "analyze" and args |> len() == 2 {
      log_path = args[1]
      match analyze_logs(log_path) {
        Ok(report) => print(format_report(report))
        Err(e) => print("Error: {e}")
      }
    } elif cmd == "slugify" and args |> len() >= 2 {
      words = args |> skip(1)
      result = words |> join(" ") |> slugify()
      print(result)
    } elif cmd == "parse-env" and args |> len() == 2 {
      file_path = args[1]
      lines = read(file_path) |> split("\n")
      lines
        |> filter(fn(line) line |> len() > 0)
        |> filter(fn(line) not (line |> starts_with("#")))
        |> map(fn(line) {
          match parse_key_value(line) {
            Some((key, value)) => print("{key} => {value}")
            None => print("Skipping invalid line: {line}")
          }
        })
    } elif cmd == "help" {
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

This is a pure script — no `server {}`, no `browser {}`, no `shared {}`. Tova works as a standalone scripting language. The `main(args)` function is the entry point, receiving command-line arguments as an array.

### Argument Dispatch with If/Elif

The core dispatch extracts the first argument and uses if/elif chains to route commands:

```tova
cmd = args |> first()

if cmd == "convert" and args |> len() == 3 {
  input = args[1]
  output = args[2]
  // ...
} elif cmd == "analyze" and args |> len() == 2 {
  log_path = args[1]
  // ...
} elif cmd == "slugify" and args |> len() >= 2 {
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

**If/elif argument dispatch.** Checking `args |> len()` and accessing by index gives you straightforward argument parsing without an argument-parsing library.

**Pipes for readability.** Data flows left-to-right through transformation chains, whether operating on tables or strings.
