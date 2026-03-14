<script setup>
const fileIOCode = `// File I/O: reading and writing files
// read_text returns a Result: Ok(content) or Err(message)
match readText("data/notes.txt") {
  Ok(content) => {
    print("File contents:")
    print(content)

    // Read line by line: split on newlines
    lines = split(content, "\\n")
    print("Line count: {len(lines)}")
    for i in range(len(lines)) {
      print("  {i + 1}: {lines[i]}")
    }
  }
  Err(msg) => print("Could not read file: {msg}")
}

// write_text also returns a Result
writeText("output/greeting.txt", "Hello from Tova!")

// read_bytes for binary data
match readBytes("data/image.png") {
  Ok(bytes) => print("File size: {len(bytes)} bytes")
  Err(msg) => print("Could not read: {msg}")
}`

const pathOpsCode = `// Path operations: build paths safely
base = "/home/user/projects"

// Join path segments
full_path = pathJoin(base, "my-app", "src", "main.tova")
print("Full path: {full_path}")

// Extract parts of a path
print("Directory: {pathDirname(full_path)}")
print("Filename:  {pathBasename(full_path)}")
print("Extension: {pathExt(full_path)}")

// Resolve relative paths
relative = pathResolve("./src/../tests/math.test.tova")
print("Resolved:  {relative}")

// Build paths for cross-platform compatibility
config_path = pathJoin(pathDirname(scriptDir()), "config", "app.toml")
print("Config:    {config_path}")`

const mathCode = `// Math functions: the essentials
print("--- Basic Math ---")
print("abs(-7):    {abs(-7)}")
print("floor(3.7): {floor(3.7)}")
print("ceil(3.2):  {ceil(3.2)}")
print("round(3.5): {round(3.5)}")
print("sqrt(144):  {sqrt(144)}")
print("pow(2, 10): {pow(2, 10)}")

print("")
print("--- Trigonometry ---")
pi = 3.14159265
print("sin(pi/2): {sin(pi / 2)}")
print("cos(0):    {cos(0)}")

print("")
print("--- Clamping and Random ---")
print("clamp(15, 0, 10): {clamp(15, 0, 10)}")
print("clamp(-5, 0, 10): {clamp(-5, 0, 10)}")
print("random():         {random()}")
print("randomInt(1, 6): {randomInt(1, 6)}")

print("")
print("--- Number Theory ---")
print("gcd(48, 18): {gcd(48, 18)}")
print("lcm(4, 6):   {lcm(4, 6)}")`

const statsCode = `// Statistics: analyze your data
scores = [85, 92, 78, 95, 88, 73, 91, 84, 96, 77]

print("--- Descriptive Statistics ---")
print("Mean:     {mean(scores)}")
print("Median:   {median(scores)}")
print("Mode:     {mode(scores)}")
print("Stdev:    {stdev(scores)}")
print("Variance: {variance(scores)}")

print("")
print("--- Percentiles ---")
print("25th percentile: {percentile(scores, 25)}")
print("50th percentile: {percentile(scores, 50)}")
print("75th percentile: {percentile(scores, 75)}")
print("90th percentile: {percentile(scores, 90)}")

print("")
print("--- Summary ---")
print("Min: {min(scores)}")
print("Max: {max(scores)}")
print("Range: {max(scores) - min(scores)}")
print("Count: {len(scores)}")`

const dateTimeCode = `// Date and Time operations
print("--- Current Time ---")
print("Timestamp: {now()}")
print("ISO 8601:  {nowIso()}")

print("")
print("--- Parsing and Formatting ---")
date = dateParse("2025-06-15T10:30:00Z").unwrap()
print("Parsed: {date}")
print("Date only: {dateFormat(date, 'YYYY-MM-DD')}")
print("With time: {dateFormat(date, 'YYYY-MM-DD HH:mm:ss')}")

print("")
print("--- Date Arithmetic ---")
tomorrow = dateAdd(now(), 1, "days")
print("Tomorrow: {dateFormat(tomorrow, 'YYYY-MM-DD')}")

next_week = dateAdd(now(), 7, "days")
print("Next week: {dateFormat(next_week, 'YYYY-MM-DD')}")

past = dateParse("2024-01-01T00:00:00Z").unwrap()
days_since = dateDiff(past, now(), "days")
print("Days since Jan 1 2024: {days_since}")

print("")
print("--- Relative Time ---")
recent = dateAdd(now(), -30, "minutes")
print("30 min ago: {timeAgo(recent)}")

yesterday = dateAdd(now(), -1, "days")
print("Yesterday:  {timeAgo(yesterday)}")`

const jsonHttpCode = `// JSON: parse, stringify, and pretty-print
data = { name: "Alice", age: 30, roles: ["admin", "editor"] }

// Stringify
json_str = jsonStringify(data)
print("JSON: {json_str}")

// Pretty print
pretty = jsonPretty(data)
print("Pretty:")
print(pretty)

// Parse
parsed = jsonParse(json_str).unwrap()
print("Parsed name: {parsed.name}")
print("Parsed roles: {parsed.roles}")

print("")
print("--- URL Operations ---")
// Parse URLs
parts = parseUrl("https://api.example.com:8080/users?page=2&limit=10").unwrap()
print("Protocol: {parts.protocol}")
print("Host:     {parts.host}")
print("Path:     {parts.pathname}")
print("Query:    {parts.search}")

// Build URLs
query = buildQuery({ q: "tova language", page: "1" })
built_url = buildUrl({
  host: "api.example.com",
  pathname: "/search",
  search: query
})
print("Built: {built_url}")

// Encoding
encoded = urlEncode("hello world & more")
print("Encoded: {encoded}")
print("Decoded: {urlDecode(encoded)}")`

const logAnalyzerCode = `// PROJECT: Log File Analyzer
// Reads log entries, parses dates, computes statistics

// Simulated log data (in real code, use read_lines)
log_entries = [
  "2025-03-15T08:23:14Z INFO  Server started on port 8080",
  "2025-03-15T08:23:15Z INFO  Database connected",
  "2025-03-15T08:24:01Z WARN  Slow query: 450ms on /api/users",
  "2025-03-15T08:24:12Z ERROR Connection refused: redis://localhost:6379",
  "2025-03-15T08:25:33Z INFO  Request: GET /api/users (200) 45ms",
  "2025-03-15T08:25:34Z INFO  Request: POST /api/users (201) 120ms",
  "2025-03-15T08:26:01Z WARN  Rate limit approaching for IP 192.168.1.100",
  "2025-03-15T08:26:45Z INFO  Request: GET /api/posts (200) 67ms",
  "2025-03-15T08:27:12Z ERROR Unhandled exception in /api/reports",
  "2025-03-15T08:27:30Z INFO  Request: GET /health (200) 2ms",
  "2025-03-15T08:28:01Z INFO  Request: DELETE /api/posts/5 (204) 89ms",
  "2025-03-15T08:28:45Z WARN  Disk usage at 85%",
  "2025-03-15T08:29:10Z INFO  Request: GET /api/users (200) 38ms",
  "2025-03-15T08:30:00Z INFO  Scheduled cleanup completed"
]

// Parse a log line into structured data
fn parse_log_line(line) {
  timestamp_str = substr(line, 0, 20)
  level = trim(substr(line, 21, 26))
  message = trim(substr(line, 27))
  { timestamp: timestamp_str, level: level, message: message }
}

// Extract response time from request log messages
fn extract_response_time(message) {
  if !contains(message, "Request:") { return None }
  // Find the last number before "ms"
  parts = split(message, " ")
  for part in reversed(parts) {
    if endsWith(part, "ms") {
      ms_str = substr(part, 0, len(part) - 2)
      return Some(toInt(ms_str))
    }
  }
  None
}

// Parse all entries
parsed = log_entries |> map(fn(line) parse_log_line(line))

// Count by level
fn count_by_level(entries) {
  var counts = { INFO: 0, WARN: 0, ERROR: 0 }
  for entry in entries {
    if counts[entry.level] != undefined {
      counts[entry.level] += 1
    }
  }
  counts
}

level_counts = count_by_level(parsed)

print("=== Log Analysis Report ===")
print("")
print("Total entries: {len(parsed)}")
print("  INFO:  {level_counts.INFO}")
print("  WARN:  {level_counts.WARN}")
print("  ERROR: {level_counts.ERROR}")

// Response time analysis
response_times = parsed
  |> map(fn(entry) extract_response_time(entry.message))
  |> filter(fn(opt) opt.isSome())
  |> map(fn(opt) opt.unwrap())

print("")
print("--- Response Time Stats ---")
print("Requests measured: {len(response_times)}")
if len(response_times) > 0 {
  avg_time = round(sum(response_times) / len(response_times))
  print("Average: {avg_time}ms")
  print("Min:     {min(response_times)}ms")
  print("Max:     {max(response_times)}ms")
  print("Median:  {median(response_times)}ms")
}

// Error summary
errors = parsed |> filter(fn(e) e.level == "ERROR")
warnings = parsed |> filter(fn(e) e.level == "WARN")

print("")
print("--- Issues ---")
for err_entry in errors {
  print("  ERROR: {err_entry.message}")
}
for warn_entry in warnings {
  print("  WARN:  {warn_entry.message}")
}

// Time range
first_entry = parsed[0]
last_entry = parsed[len(parsed) - 1]
print("")
print("--- Time Range ---")
print("From: {first_entry.timestamp}")
print("To:   {last_entry.timestamp}")`
</script>

# Chapter 18: IO, Dates, Math, and System

Every real program needs to interact with the outside world -- reading files, computing statistics, working with dates, and talking to the operating system. Tova's standard library gives you a consistent, ergonomic set of functions for all of this. No imports needed. They are just there.

This chapter is your field guide to Tova's IO, math, date, and system capabilities. By the end, you will build a log file analyzer that reads log data, parses timestamps, extracts response times, and computes statistics.

## File I/O

### Reading Files

Tova provides several ways to read file contents:

```tova
// Read the entire file as a string
// read_text returns a Result: Ok(content) or Err(message)
content = readText("config.toml").unwrap()
print(content)

// Read line by line: split the file contents
lines = split(readText("data.csv").unwrap(), "\n")
for line in lines {
  print(line)
}

// Read as raw bytes (for binary files)
bytes = readBytes("image.png").unwrap()
print("Size: {len(bytes)} bytes")
```

`read_text` returns a `Result` -- `Ok(content)` on success, `Err(message)` on failure. Use `.unwrap()` for quick scripts, or `match` for proper error handling. `read_bytes` also returns a `Result` wrapping the raw byte data. For reading lines from standard input, use `readLines()` (no arguments).

### Writing Files

```tova
// Write a string to a file (creates or overwrites)
writeText("output/report.txt", "Analysis complete.\nTotal: 42")

// Write lines by joining first
lines = ["name,score", "Alice,95", "Bob,87", "Charlie,91"]
writeText("output/scores.csv", join(lines, "\n"))
```

`write_text` returns a `Result` -- `Ok(path)` on success, `Err(message)` on failure. It creates the file if it does not exist, or overwrites it if it does. To append instead of overwrite, read first, then write the combined content:

```tova
existing = readText("log.txt").unwrap()
writeText("log.txt", existing ++ "\nNew entry at {nowIso()}")
```

<TryInPlayground :code="fileIOCode" label="File I/O" />

::: tip Always Handle Missing Files
In production code, use `match` for proper error handling:
```tova
match readText("config.toml") {
  Ok(config) => print("Loaded config")
  Err(msg) => print("Config not found, using defaults")
}
```
Or check existence first with `exists()`:
```tova
if exists("config.toml") {
  config = readText("config.toml").unwrap()
}
```
:::

## File System Operations

Tova provides functions for navigating and manipulating the file system:

### Checking Files and Directories

```tova
// Does a path exist?
exists("src/main.tova")      // true or false

// Is it a file or directory?
isFile("src/main.tova")     // true
isDir("src/")               // true
```

### Listing Directory Contents

```tova
// List files in a directory
items = ls("src/")
for item in items {
  print(item)
}

// Find files matching a pattern
tova_files = globFiles("src/**/*.tova")
print("Found {len(tova_files)} Tova files")

test_files = globFiles("tests/*.test.tova")
print("Found {len(test_files)} test files")
```

`ls` returns immediate children of a directory. `glob_files` supports recursive patterns with `**` and matches against file names with `*`.

### File Metadata

Sometimes you need more than just the contents of a file -- you need to know its size, when it was last modified, or what kind of entry it is. Tova provides two functions for this:

```tova
// Get detailed file information
stat = fileStat("./app.tova")
match stat {
  Ok(info) => {
    print("Size: {info.size} bytes")
    print("Modified: {info.mtime}")
    print("Is file: {info.isFile}")
    print("Is directory: {info.isDir}")
    print("Is symlink: {info.isSymlink}")
    print("Permissions: {info.mode}")
  }
  Err(msg) => print("Could not stat file: {msg}")
}

// Just need the size? There is a shorthand
match fileSize("./data.bin") {
  Ok(bytes) => print("File is {bytes} bytes")
  Err(msg) => print("Error: {msg}")
}
```

`file_stat` returns a `Result` containing an object with `size`, `mtime`, `atime`, `mode`, `isFile`, `isDir`, and `isSymlink` fields. `file_size` returns just the byte count. Both return `Err` if the file does not exist.

### Symlink Operations

Symbolic links are a powerful file system feature. Tova supports creating, reading, and detecting them:

```tova
// Create a symbolic link
symlink("./actual-config.toml", "./config.toml")

// Read where a symlink points
match readlink("./config.toml") {
  Ok(target) => print("Link points to: {target}")
  Err(msg) => print("Not a symlink: {msg}")
}

// Check if a path is a symlink
if isSymlink("./config.toml") {
  print("This is a symbolic link")
}
```

`symlink` and `readlink` return `Result` types, so you can handle errors gracefully. `is_symlink` returns a simple boolean -- it returns `false` both when the path is not a symlink and when the path does not exist.

### Creating and Removing

```tova
// Create directories (including parents)
mkdir("output/reports/2025")

// Copy files
cp("template.txt", "output/report.txt")

// Move / rename files
mv("old-name.tova", "new-name.tova")

// Remove files
rm("temp/scratch.txt")
```

::: warning Destructive Operations
`rm` deletes files permanently. There is no undo. In scripts that delete files, consider printing what will be deleted first, or moving to a trash directory instead.
:::

## Path Operations

Working with file paths manually (concatenating strings with `/`) breaks on different operating systems and leads to bugs with double slashes or missing separators. Use path functions instead:

```tova
// Join path segments safely
full = pathJoin("src", "codegen", "base-codegen.js")
// "src/codegen/base-codegen.js"

// Extract components
pathDirname("/home/user/app/main.tova")    // "/home/user/app"
pathBasename("/home/user/app/main.tova")   // "main.tova"
pathExt("/home/user/app/main.tova")        // ".tova"

// Resolve relative paths to absolute
pathResolve("./src/../tests/math.test.tova")
// "/full/absolute/path/tests/math.test.tova"
```

### Relative Paths and Changing Directories

When you need to compute the relative path between two locations, `path_relative` does the work:

```tova
rel = pathRelative("/home/user/projects", "/home/user/projects/app/src")
print(rel)   // "app/src"

rel2 = pathRelative("/home/user/docs", "/home/user/projects/app")
print(rel2)  // "../projects/app"
```

You can also change the current working directory programmatically:

```tova
print("Starting in: {cwd()}")

match chdir("/tmp/workspace") {
  Ok(_) => print("Now in: {cwd()}")
  Err(msg) => print("Could not change directory: {msg}")
}
```

`chdir` returns a `Result`, so it will not crash if the directory does not exist -- you get an `Err` instead.

### Building Paths Relative to the Script

A common pattern is locating files relative to the current script:

```tova
// Where is this script located?
script_location = scriptDir()
print("Script is in: {script_location}")

// Build paths relative to the script
config_path = pathJoin(script_location, "..", "config", "app.toml")
data_path = pathJoin(script_location, "data", "users.json")
```

<TryInPlayground :code="pathOpsCode" label="Path Operations" />

## Standard Input

For interactive programs and scripts, read from stdin:

```tova
// Read all input from standard input (blocks until EOF)
print("What is your name?")
user_name = readStdin()
print("Hello, {trim(user_name)}!")
```

For CLI tools, combine with the `ask()` and `confirm()` stdlib functions (see the CLI block chapter) which handle prompting and validation.

## Math Functions

Tova's math functions cover everyday arithmetic, trigonometry, and number theory.

### Basic Operations

```tova
abs(-7)           // 7
floor(3.7)        // 3
ceil(3.2)         // 4
round(3.5)        // 4
sqrt(144)         // 12
pow(2, 10)        // 1024
```

### Clamping and Random Numbers

```tova
// Clamp a value to a range
clamp(15, 0, 10)   // 10  (clamped to max)
clamp(-5, 0, 10)   // 0   (clamped to min)
clamp(7, 0, 10)    // 7   (within range, unchanged)

// Random numbers
random()            // Float between 0 and 1
randomInt(1, 6)    // Integer between 1 and 6 (inclusive)
```

### Trigonometry

```tova
pi = 3.14159265

sin(pi / 2)    // 1.0
cos(0)         // 1.0
sin(0)         // 0.0
cos(pi)        // -1.0
atan2(1, 1)    // 0.785... (angle in radians)
hypot(3, 4)    // 5.0 (hypotenuse)

// Degree/radian conversion
toRadians(180)     // 3.14159...
toDegrees(3.14159) // ~180
```

### Number Theory

```tova
gcd(48, 18)    // 6   (greatest common divisor)
lcm(4, 6)     // 12  (least common multiple)
```

### Logarithms and Exponentials

```tova
ln(2.718)          // ~1.0 (natural log)
log2(1024)         // 10
log10(1000)        // 3
exp(1)             // 2.718... (e^x)
```

### Advanced Math

```tova
sign(-42)          // -1 (sign: -1, 0, or 1)
sign(0)            // 0
sign(7)            // 1
trunc(3.7)         // 3 (truncate toward zero)
trunc(-3.7)        // -3
factorial(5)       // 120
lerp(0, 100, 0.5)  // 50 (linear interpolation)
divmod(17, 5)      // [3, 2] (quotient and remainder)
avg([10, 20, 30])  // 20
```

### Number Checks

```tova
isNaN(0 / 0)          // true
isNaN(42)             // false
isFinite(42)          // true
isFinite(1 / 0)       // false
isClose(0.1 + 0.2, 0.3)  // true (floating-point safe comparison)
```

### Number Formatting

```tova
toFixed(3.14159, 2)  // "3.14"
toFixed(42, 3)        // "42.000"
randomFloat(1.0, 10.0)  // Random float in range
```

### Ordering

Tova provides an `Order` type for comparison results, following the convention of many functional languages. The three values are `Less`, `Equal`, and `Greater`:

```tova
// compare returns an Order value -- use with match
match compare(3, 5) {
  Less => print("3 is less than 5")
  Equal => print("equal")
  Greater => print("3 is greater than 5")
}

// compare_by sorts an array using a custom comparator
// The comparator function receives two elements and returns an Order
names = ["charlie", "alice", "bob"]
by_length = compareBy(names, fn(a, b) compare(len(a), len(b)))
print(by_length)   // ["bob", "alice", "charlie"] (sorted by length)
```

<TryInPlayground :code="mathCode" label="Math Functions" />

## Statistics

For data analysis, Tova provides a full set of descriptive statistics functions:

```tova
data = [85, 92, 78, 95, 88, 73, 91, 84, 96, 77]

mean(data)        // Average: 85.9
median(data)      // Middle value: 86.5
mode(data)        // Most frequent value
stdev(data)       // Standard deviation
variance(data)    // Variance
```

### Percentiles

```tova
scores = [72, 75, 78, 81, 84, 87, 90, 93, 96, 99]

percentile(scores, 25)   // 25th percentile (Q1)
percentile(scores, 50)   // 50th percentile (median)
percentile(scores, 75)   // 75th percentile (Q3)
percentile(scores, 90)   // 90th percentile
```

### Combining with Collection Operations

Statistics functions work naturally with pipes:

```tova
students = [
  { name: "Alice", score: 95 },
  { name: "Bob", score: 87 },
  { name: "Charlie", score: 91 },
  { name: "Diana", score: 78 },
  { name: "Eve", score: 84 }
]

// Extract scores and compute stats
avg = students |> map(fn(s) s.score) |> mean()
top_score = students |> map(fn(s) s.score) |> max()
spread = students |> map(fn(s) s.score) |> stdev()

print("Average: {avg}")
print("Top score: {top_score}")
print("Std deviation: {spread}")
```

<TryInPlayground :code="statsCode" label="Statistics" />

## Date and Time

Tova provides practical date/time functions for common operations.

### Getting the Current Time

```tova
// Unix timestamp (milliseconds)
timestamp = now()
print("Timestamp: {timestamp}")

// ISO 8601 string
iso = nowIso()
print("ISO: {iso}")   // "2025-03-15T14:30:00.000Z"
```

### Parsing and Formatting

```tova
// Parse a date string (returns Result, so unwrap it)
date = dateParse("2025-06-15T10:30:00Z").unwrap()

// Format a date for display
dateFormat(date, "YYYY-MM-DD")          // "2025-06-15"
dateFormat(date, "MM/DD/YYYY")          // "06/15/2025"
dateFormat(date, "HH:mm:ss")           // "10:30:00"
dateFormat(date, "YYYY-MM-DD HH:mm")   // "2025-06-15 10:30"
```

Supported format tokens: `YYYY` (year), `MM` (month), `DD` (day), `HH` (hours), `mm` (minutes), `ss` (seconds). You can also pass the shortcuts `"iso"`, `"date"`, `"time"`, or `"datetime"`.

### Date Arithmetic

```tova
// Add time to a date
tomorrow = dateAdd(now(), 1, "days")
next_month = dateAdd(now(), 1, "months")
in_two_hours = dateAdd(now(), 2, "hours")

// Compute differences between dates
// dateDiff(earlier, later, unit) returns later - earlier
start = dateParse("2025-01-01T00:00:00Z").unwrap()
end_date = dateParse("2025-12-31T23:59:59Z").unwrap()

days_between = dateDiff(start, end_date, "days")
print("Days in 2025: {days_between}")

hours_between = dateDiff(start, end_date, "hours")
print("Hours in 2025: {hours_between}")
```

### Relative Time

For user-facing displays, `time_ago` converts a timestamp into a human-readable relative string:

```tova
recent = dateAdd(now(), -30, "minutes")
timeAgo(recent)   // "30 minutes ago"

yesterday = dateAdd(now(), -1, "days")
timeAgo(yesterday)   // "1 day ago"

long_ago = dateAdd(now(), -90, "days")
timeAgo(long_ago)   // "3 months ago"
```

<TryInPlayground :code="dateTimeCode" label="Date/Time" />

::: tip Dates Are Timestamps Internally
Under the hood, Tova dates are millisecond timestamps (like JavaScript). The `date_parse`, `date_format`, and `date_add` functions handle the conversion to and from human-readable formats. Always store dates as timestamps for computation and format them only for display.
:::

## JSON

JSON is the lingua franca of data exchange. Tova makes it effortless:

```tova
// Parse a JSON string into a Tova value (returns Result)
data = jsonParse('{"name": "Alice", "age": 30}').unwrap()
print(data.name)    // "Alice"

// Convert a Tova value to a JSON string
obj = { language: "Tova", version: "0.9.0", fast: true }
json_str = jsonStringify(obj)
print(json_str)
// {"language":"Tova","version":"0.9.0","fast":true}

// Pretty-print with indentation
pretty = jsonPretty(obj)
print(pretty)
// {
//   "language": "Tova",
//   "version": "0.9.0",
//   "fast": true
// }
```

### Reading and Writing JSON Files

A common pattern:

```tova
// Read a JSON config file
config = jsonParse(readText("config.json").unwrap()).unwrap()
print("Port: {config.port}")

// Modify and write back
updated_config = { ...config, port: 9090 }
writeText("config.json", jsonPretty(updated_config))
```

## HTTP Client Utilities

Tova provides URL manipulation functions for building and parsing URLs:

```tova
// Parse a URL into its components (returns Result)
parts = parseUrl("https://api.example.com:8080/users?page=2&limit=10").unwrap()
print(parts.protocol)   // "https"
print(parts.host)       // "api.example.com:8080"
print(parts.pathname)   // "/users"
print(parts.search)     // "?page=2&limit=10"
```

### Building URLs

```tova
// Build a URL from components
search_url = buildUrl({
  host: "api.example.com",
  pathname: "/search",
  search: buildQuery({ q: "tova language", page: "1", sort: "relevance" })
})
print(search_url)
// "https://api.example.com/search?q=tova%20language&page=1&sort=relevance"
```

`build_url` takes an object with `protocol` (defaults to `"https"`), `host`, `pathname`, `search`, and `hash` fields. Use `build_query` to construct query strings from key-value pairs.

### URL Encoding and Decoding

```tova
// Encode special characters for URLs
encoded = urlEncode("hello world & more")
print(encoded)   // "hello%20world%20%26%20more"

// Decode back
decoded = urlDecode(encoded)
print(decoded)   // "hello world & more"
```

<TryInPlayground :code="jsonHttpCode" label="JSON and URLs" />

## Environment and Arguments

### Environment Variables

```tova
// Read an environment variable
db_host = env("DATABASE_HOST")
print("DB Host: {db_host}")

// Set an environment variable (for the current process)
setEnv("APP_MODE", "production")

// Read with a default
port = env("PORT")
if port == null {
  port = "3000"
}
print("Running on port {port}")
```

### Command-Line Arguments

```tova
// Access command-line arguments
arguments = args()
print("Script received {len(arguments)} arguments")

for i in range(len(arguments)) {
  print("  arg[{i}]: {arguments[i]}")
}
```

## System Operations

### Process Control

```tova
// Exit with a status code
// exit(0)   // Success
// exit(1)   // Failure

// Run a command safely (no shell, array args)
match exec("ls", ["-la", "src/"]) {
  Ok(r) => print(r.stdout)
  Err(msg) => print("Command failed: {msg}")
}

// Get the current working directory
print("CWD: {cwd()}")

// Get the directory of the current script
print("Script dir: {scriptDir()}")
```

`exec` runs a command **without** a shell by default (the arguments are passed as an array). This is the safer option because it prevents shell injection. It returns a `Result` containing an object with `stdout`, `stderr`, and `exitCode`.

### Shell Commands with `sh()`

When you need shell features like pipes, redirects, or glob expansion, use `sh()` instead:

```tova
// Run shell commands with pipe chains
match sh("ls -la | grep .tova | wc -l") {
  Ok(result) => print("Tova files: {result.stdout}")
  Err(msg) => print("Command failed: {msg}")
}

// Process data through a pipeline
match sh("cat data.csv | sort | uniq") {
  Ok(result) => print(result.stdout)
  Err(msg) => print("Error: {msg}")
}

// Pass options: custom working directory, environment, timeout
match sh("npm test", { cwd: "./my-project", timeout: 30000 }) {
  Ok(result) => {
    print("Exit code: {result.exitCode}")
    if result.exitCode != 0 {
      print("Stderr: {result.stderr}")
    }
  }
  Err(msg) => print("Failed: {msg}")
}
```

`sh` returns a `Result` with `stdout`, `stderr`, and `exitCode` -- the same shape as `exec`. The difference is that `sh` passes the command to the system shell, so pipes (`|`), redirects (`>`), and other shell syntax work.

::: warning Command Safety
Never pass unsanitized user input to `sh()` or `exec()`. Because `sh` uses the system shell, it is especially vulnerable to injection attacks. Prefer `exec` with explicit argument arrays for commands that include user-provided data, and use `sh` only for trusted, hardcoded command strings. When possible, use Tova's built-in file system functions (`ls`, `glob_files`, `read_text`, etc.) instead of shelling out.
:::

### Spawning Background Processes

`exec` and `sh` are synchronous -- they block until the command finishes. For long-running processes, use `spawn()` which runs the command asynchronously and returns a `Promise`:

```tova
// Spawn a long-running process
process_result = await spawn("node", ["server.js"])
match process_result {
  Ok(result) => print("Server exited with code {result.exitCode}")
  Err(msg) => print("Failed to spawn: {msg}")
}

// Spawn with options
build_result = await spawn("cargo", ["build", "--release"], {
  cwd: "./rust-project",
  env: { RUST_LOG: "debug" }
})
```

`spawn` returns a `Promise` that resolves when the child process exits. Like `exec`, it collects `stdout` and `stderr` and returns them in the result. This is useful for running build tools, starting test suites, or any command that might take a while.

### Signal Handling

For scripts and servers that need to handle operating system signals gracefully, use `on_signal`:

```tova
onSignal("SIGINT", fn() {
  print("Caught interrupt, cleaning up...")
  // Close database connections, flush logs, etc.
  exit(0)
})

onSignal("SIGTERM", fn() {
  print("Termination signal received")
  // Graceful shutdown logic
  exit(0)
})

print("Server running. Press Ctrl+C to stop.")
```

Common signals you might handle:

- `SIGINT` -- sent when the user presses Ctrl+C
- `SIGTERM` -- sent by process managers (systemd, Docker) for graceful shutdown
- `SIGHUP` -- sent when the terminal disconnects, often used to trigger config reload

### Combining System Operations

A practical example -- a build script:

```tova
print("Building project...")
print("Working directory: {cwd()}")

// Check if source directory exists
if !isDir("src") {
  print("Error: src/ directory not found")
  exit(1)
}

// Count source files
source_files = globFiles("src/**/*.tova")
print("Found {len(source_files)} source files")

// Check for test files
test_files = globFiles("tests/**/*.test.tova")
print("Found {len(test_files)} test files")

// Create output directory
if !isDir("dist") {
  mkdir("dist")
  print("Created dist/ directory")
}

print("Build complete.")
```

## UUID, Encoding, and Crypto

### Generating UUIDs

```tova
// Generate a unique identifier
id = uuid()
print("Generated ID: {id}")
// "f47ac10b-58cc-4372-a567-0e02b2c3d479"

// Useful for creating unique keys
items = [
  { id: uuid(), name: "Widget" },
  { id: uuid(), name: "Gadget" },
  { id: uuid(), name: "Gizmo" }
]
for item in items {
  print("{item.id} -> {item.name}")
}
```

### Hex Encoding

```tova
// Encode bytes as hexadecimal
encoded = hexEncode("Hello Tova")
print("Hex: {encoded}")

// Decode hex back to a string
decoded = hexDecode(encoded)
print("Decoded: {decoded}")
```

### Base64 Encoding

Base64 is the standard encoding for embedding binary data in text formats like JSON, email, or data URLs:

```tova
// Encode a string to Base64
encoded = base64Encode("Hello, World!")
print(encoded)   // "SGVsbG8sIFdvcmxkIQ=="

// Decode Base64 back to a string
decoded = base64Decode(encoded)
print(decoded)   // "Hello, World!"
```

A practical example -- embedding data in a URL:

```tova
// Encode configuration as a shareable URL parameter
config = jsonStringify({ theme: "dark", lang: "en" })
param = base64Encode(config)
share_url = "https://app.example.com/?config={param}"
print(share_url)

// On the receiving end, decode it back
received = base64Decode(param)
settings = jsonParse(received).unwrap()
print("Theme: {settings.theme}")
```

## Number Formatting

Convert numbers to different base representations:

```tova
// Base conversions
print("255 in hex:    {toHex(255)}")       // "ff"
print("255 in octal:  {toOctal(255)}")     // "377"
print("255 in binary: {toBinary(255)}")    // "11111111"
print("10 in binary:  {toBinary(10)}")     // "1010"

// Formatted numbers with grouping
print(formatNumber(1234567.89))   // "1,234,567.89"
print(formatNumber(0.5))          // "0.5"
```

### Practical Number Formatting

```tova
// Display file sizes in human-readable format
fn format_bytes(byte_count) {
  if byte_count < 1024 {
    "{byte_count} B"
  } elif byte_count < 1024 * 1024 {
    "{round(byte_count / 1024)} KB"
  } elif byte_count < 1024 * 1024 * 1024 {
    "{round(byte_count / (1024 * 1024))} MB"
  } else {
    "{round(byte_count / (1024 * 1024 * 1024))} GB"
  }
}

sizes = [512, 15360, 2621440, 5368709120]
for s in sizes {
  print("{s} bytes = {format_bytes(s)}")
}
```

## Structured Logging

For production applications, Tova provides a `log` namespace with leveled logging:

```tova
log.debug("Cache miss for key: {key}")
log.info("Server started on port {port}")
log.warn("Rate limit approaching for user {user_id}")
log.error("Database connection failed: {err}")
```

### Log Levels

Control which messages are shown with `log.level()`:

```tova
log.level("warn")    // Only show warn and error

log.debug("This won't show")
log.info("This won't show either")
log.warn("This will show")
log.error("This will show too")
```

Log levels from least to most severe: `debug` < `info` < `warn` < `error`. Setting the level filters out everything below it.

### Log Formatting

Control how logs appear with `log.format()`:

```tova
// Default format (pretty): "HH:MM:SS LVL message"
log.info("hello")   // "14:30:00 INF hello"

// JSON format for machine parsing
log.format("json")
log.info("hello")   // {"level":"info","msg":"hello","timestamp":"2026-03-06T14:30:00.000Z"}

// Switch back to pretty format
log.format("pretty")
```

### Contextual Logging

Create loggers with persistent context using `log.with()`:

```tova
// Add context that appears in every message
request_log = log.with({ request_id: "abc-123", user: "alice" })
request_log.info("Processing request")
request_log.error("Validation failed")
```

::: tip print vs. log
Use `print()` for user-facing output and debugging during development. Use `log.*` for production logging with levels, formatting, and filtering. In server applications, `log.error()` writes to stderr by default, while `print()` goes to stdout.
:::

## Cryptography

Tova provides a `crypto` namespace with functions for hashing, encryption, password management, and more. These use industry-standard algorithms under the hood.

### Hashing

Hash functions produce a fixed-size fingerprint of any data. They are one-way -- you cannot recover the original data from the hash:

```tova
// SHA-256 (most common, good for checksums and data integrity)
hash = crypto.sha256("hello world")
print("SHA-256: {hash}")
// "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"

// SHA-512 (longer hash, higher security margin)
hash512 = crypto.sha512("hello world")
print("SHA-512: {hash512}")
```

### HMAC (Hash-Based Message Authentication)

HMAC combines a hash function with a secret key to verify both the integrity and authenticity of a message:

```tova
// Create an HMAC signature
mac = crypto.hmac("sha256", "my-secret-key", "important message")
print("HMAC: {mac}")

// Verify by recomputing and comparing
expected = crypto.hmac("sha256", "my-secret-key", "important message")
if crypto.constant_time_equal(mac, expected) {
  print("Message is authentic")
}
```

### Password Hashing

Never store passwords as plain text. Tova provides `hash_password` and `verify_password` which use scrypt (a memory-hard key derivation function) with automatic salt generation:

```tova
// Hash a password for storage
match crypto.hash_password("user-secret-password") {
  Ok(hashed) => {
    print("Stored hash: {hashed}")
    // Store `hashed` in your database

    // Later, verify a login attempt
    is_valid = crypto.verify_password("user-secret-password", hashed)
    print("Valid: {is_valid}")    // true

    is_wrong = crypto.verify_password("wrong-password", hashed)
    print("Wrong: {is_wrong}")   // false
  }
  Err(msg) => print("Hashing failed: {msg}")
}
```

Each call to `hash_password` produces a different hash (because of the random salt), but `verify_password` will correctly match any of them against the original password.

### Encryption and Decryption

For data that you need to encrypt and later decrypt, Tova provides AES-256-GCM authenticated encryption:

```tova
secret_key = "my-32-character-encryption-key!!"

match crypto.encrypt("sensitive data here", secret_key) {
  Ok(ciphertext) => {
    print("Encrypted: {ciphertext}")

    match crypto.decrypt(ciphertext, secret_key) {
      Ok(plaintext) => print("Decrypted: {plaintext}")
      Err(msg) => print("Decryption failed: {msg}")
    }
  }
  Err(msg) => print("Encryption failed: {msg}")
}
```

Both `encrypt` and `decrypt` return `Result` types. Decryption will return `Err` if the key is wrong or the ciphertext has been tampered with -- that is the "authenticated" part of authenticated encryption.

### Random Bytes and Constant-Time Comparison

```tova
// Generate cryptographically secure random bytes
bytes = crypto.random_bytes(32)
print("Random bytes: {hexEncode(bytes)}")

// Constant-time comparison prevents timing attacks
// (Regular == comparison leaks information through timing)
hash_a = crypto.sha256("secret")
hash_b = crypto.sha256("secret")
equal = crypto.constant_time_equal(hash_a, hash_b)
print("Equal: {equal}")   // true
```

::: tip When to Use Constant-Time Comparison
Always use `crypto.constant_time_equal` when comparing hashes, tokens, or any security-sensitive values. Regular string comparison (`==`) can leak information through timing differences -- an attacker can determine how many characters of a hash match by measuring response time. Constant-time comparison takes the same amount of time regardless of where the strings differ.
:::

## Lazy Sequences with `Seq`

When working with large or infinite data sets, you do not want to compute everything upfront. Tova's `Seq` class provides lazy sequences -- transformations like `map`, `filter`, and `take` are recorded but not executed until you explicitly collect the results.

### Creating Sequences

Use `iter()` to create a `Seq` from any array or iterable:

```tova
// Create a lazy sequence from an array
seq = iter([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  .map(fn(x) x * 2)
  .filter(fn(x) x > 8)
  .take(3)

// Nothing has been computed yet -- all lazy
result = seq.collect()   // [10, 12, 14]
print(result)
```

The key insight is that `iter` returns a `Seq`, and every method on `Seq` returns a new `Seq`. No work happens until you call `.collect()` (or `.toArray()`, which is an alias).

### Chaining Operations

`Seq` supports all the transformations you would expect:

```tova
data = iter([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

// map: transform each element
doubled = data.map(fn(x) x * 2).collect()

// filter: keep elements matching a predicate
evens = iter([1, 2, 3, 4, 5]).filter(fn(x) x % 2 == 0).collect()
// [2, 4]

// take / drop: slice the beginning
first_three = iter([10, 20, 30, 40, 50]).take(3).collect()   // [10, 20, 30]
skip_two = iter([10, 20, 30, 40, 50]).drop(2).collect()      // [30, 40, 50]

// flat_map: transform and flatten
words = iter(["hello world", "foo bar"])
  .flatMap(fn(s) split(s, " "))
  .collect()
// ["hello", "world", "foo", "bar"]

// enumerate: pair each element with its index
indexed = iter(["a", "b", "c"]).enumerate().collect()
// [[0, "a"], [1, "b"], [2, "c"]]

// zip: combine two sequences element-by-element
names = iter(["Alice", "Bob", "Charlie"])
scores = iter([95, 87, 91])
pairs = names.zip(scores).collect()
// [["Alice", 95], ["Bob", 87], ["Charlie", 91]]
```

### Reducing and Searching

Not everything needs to produce an array. `Seq` has terminal operations that compute a single value:

```tova
numbers = iter([1, 2, 3, 4, 5])

// reduce: fold into a single value
total = numbers.reduce(fn(acc, x) acc + x, 0)
print("Sum: {total}")   // 15

// first: get the first element (returns Option)
match iter([10, 20, 30]).first() {
  Some(val) => print("First: {val}")
  None => print("Empty sequence")
}

// find: get the first element matching a predicate
match iter([1, 2, 3, 4, 5]).find(fn(x) x > 3) {
  Some(val) => print("Found: {val}")   // 4
  None => print("Not found")
}

// any / all: boolean checks
has_negative = iter([1, -2, 3]).any(fn(x) x < 0)    // true
all_positive = iter([1, 2, 3]).all(fn(x) x > 0)      // true

// count: how many elements
n = iter([1, 2, 3, 4, 5]).filter(fn(x) x % 2 == 0).count()
print("Even count: {n}")   // 2
```

### Iterating with `forEach`

You can also iterate over a `Seq` for side effects without collecting:

```tova
iter([1, 2, 3, 4, 5])
  .map(fn(x) x * x)
  .forEach(fn(x) print("Square: {x}"))
```

`Seq` also implements the iterator protocol, so you can use it directly in `for` loops:

```tova
squares = iter([1, 2, 3, 4, 5]).map(fn(x) x * x)
for val in squares {
  print(val)
}
```

## Channels for Async Communication

When you need to coordinate between asynchronous tasks, Tova provides `Channel` -- a typed communication primitive inspired by Go channels and Rust's `mpsc`.

### Creating and Using Channels

```tova
// Create an unbuffered channel
ch = Channel.new()

// Create a buffered channel (can hold up to 5 items without blocking)
buffered = Channel.new(5)
```

### Sending and Receiving

`send` and `receive` are both async operations. On an unbuffered channel, `send` waits until something is ready to receive, and vice versa:

```tova
ch = Channel.new(10)

async fn producer(channel) {
  for i in range(5) {
    await channel.send(i * 10)
    print("Sent: {i * 10}")
  }
  channel.close()
}

async fn consumer(channel) {
  var val = await channel.receive()
  while val.isSome() {
    print("Received: {val.unwrap()}")
    val = await channel.receive()
  }
  print("Channel closed, done receiving")
}

// Run both concurrently (wrap in async main)
async fn main() {
  await Promise.all([producer(ch), consumer(ch)])
}
```

`receive` returns an `Option` -- `Some(value)` when a value is available, or `None` when the channel has been closed and drained. Loop until `receive()` returns `None` to consume all values.

### Closing Channels

Call `close()` when no more values will be sent. Any pending receivers will get `None`, and any future `send` calls will throw an error:

```tova
ch = Channel.new()

async fn work(channel) {
  await channel.send("first")
  await channel.send("second")
  channel.close()
  // await channel.send("third")  // This would throw!
}

async fn main() {
  await work(ch)
}
```

### Practical Example: Worker Pipeline

Channels shine when you need to build processing pipelines:

```tova
input_ch = Channel.new(10)
output_ch = Channel.new(10)

// Stage 1: Generate work items
async fn generate(out) {
  items = ["apple", "banana", "cherry", "date", "elderberry"]
  for item in items {
    await out.send(item)
  }
  out.close()
}

// Stage 2: Transform each item
async fn transform(input, output) {
  var item = await input.receive()
  while item.isSome() {
    uppercased = upper(item.unwrap())
    await output.send(uppercased)
    item = await input.receive()
  }
  output.close()
}

// Stage 3: Collect results
async fn collect_all(input) {
  var items = []
  var item = await input.receive()
  while item.isSome() {
    items.push(item.unwrap())
    item = await input.receive()
  }
  print("Processed: {items}")
}

async fn main() {
  await Promise.all([
    generate(input_ch),
    transform(input_ch, output_ch),
    collect_all(output_ch)
  ])
}
```

This pipeline pattern lets you decouple producers from consumers and process items as they become available, without buffering everything in memory.

## Project: Log File Analyzer

Let us build a tool that reads log entries, parses their structure, extracts response times, and computes statistics. This project exercises file I/O, string parsing, date operations, and statistics all together.

### The Log Format

Each line follows this structure:

```
2025-03-15T08:23:14Z INFO  Server started on port 8080
2025-03-15T08:24:01Z WARN  Slow query: 450ms on /api/users
2025-03-15T08:24:12Z ERROR Connection refused: redis://localhost:6379
2025-03-15T08:25:33Z INFO  Request: GET /api/users (200) 45ms
```

### Step 1: Parse Log Lines

```tova
fn parse_log_line(line) {
  timestamp_str = substr(line, 0, 20)
  level = trim(substr(line, 21, 26))
  message = trim(substr(line, 27))
  { timestamp: timestamp_str, level: level, message: message }
}
```

Each line has a fixed format: 20 characters for the ISO timestamp, a space, 5 characters for the log level, and the rest is the message.

### Step 2: Extract Response Times

Request log lines contain timing data. We need to pull out the millisecond value:

```tova
fn extract_response_time(message) {
  if !contains(message, "Request:") { return None }
  parts = split(message, " ")
  for part in reversed(parts) {
    if endsWith(part, "ms") {
      ms_str = substr(part, 0, len(part) - 2)
      return Some(toInt(ms_str))
    }
  }
  None
}
```

This returns `Option` -- `Some(milliseconds)` for request lines, `None` for everything else.

### Step 3: Count by Level

```tova
fn count_by_level(log_entries) {
  var counts = { INFO: 0, WARN: 0, ERROR: 0 }
  for entry in log_entries {
    if counts[entry.level] != undefined {
      counts[entry.level] += 1
    }
  }
  counts
}
```

### Step 4: Assemble the Report

```tova
// In a real tool, use: log_lines = readLines("server.log")
log_lines = [
  "2025-03-15T08:23:14Z INFO  Server started on port 8080",
  "2025-03-15T08:23:15Z INFO  Database connected",
  "2025-03-15T08:24:01Z WARN  Slow query: 450ms on /api/users",
  "2025-03-15T08:24:12Z ERROR Connection refused: redis://localhost:6379",
  "2025-03-15T08:25:33Z INFO  Request: GET /api/users (200) 45ms",
  "2025-03-15T08:25:34Z INFO  Request: POST /api/users (201) 120ms",
  "2025-03-15T08:26:01Z WARN  Rate limit approaching for IP 192.168.1.100",
  "2025-03-15T08:26:45Z INFO  Request: GET /api/posts (200) 67ms",
  "2025-03-15T08:27:12Z ERROR Unhandled exception in /api/reports",
  "2025-03-15T08:27:30Z INFO  Request: GET /health (200) 2ms",
  "2025-03-15T08:28:01Z INFO  Request: DELETE /api/posts/5 (204) 89ms",
  "2025-03-15T08:28:45Z WARN  Disk usage at 85%",
  "2025-03-15T08:29:10Z INFO  Request: GET /api/users (200) 38ms",
  "2025-03-15T08:30:00Z INFO  Scheduled cleanup completed"
]

// Parse all entries
parsed = log_lines |> map(fn(line) parse_log_line(line))

// Count by level
level_counts = count_by_level(parsed)

print("=== Log Analysis Report ===")
print("")
print("Total entries: {len(parsed)}")
print("  INFO:  {level_counts.INFO}")
print("  WARN:  {level_counts.WARN}")
print("  ERROR: {level_counts.ERROR}")

// Extract response times
response_times = parsed
  |> map(fn(entry) extract_response_time(entry.message))
  |> filter(fn(opt) opt.isSome())
  |> map(fn(opt) opt.unwrap())

print("")
print("--- Response Time Stats ---")
print("Requests measured: {len(response_times)}")
if len(response_times) > 0 {
  avg_time = round(sum(response_times) / len(response_times))
  print("Average: {avg_time}ms")
  print("Min:     {min(response_times)}ms")
  print("Max:     {max(response_times)}ms")
  print("Median:  {median(response_times)}ms")
}

// List errors and warnings
errors = parsed |> filter(fn(e) e.level == "ERROR")
warnings = parsed |> filter(fn(e) e.level == "WARN")

print("")
print("--- Issues ---")
for err_entry in errors {
  print("  ERROR: {err_entry.message}")
}
for warn_entry in warnings {
  print("  WARN:  {warn_entry.message}")
}
```

Output:

```
=== Log Analysis Report ===

Total entries: 14
  INFO:  9
  WARN:  3
  ERROR: 2

--- Response Time Stats ---
Requests measured: 6
Average: 60ms
Min:     2ms
Max:     120ms
Median:  56ms

--- Issues ---
  ERROR: Connection refused: redis://localhost:6379
  ERROR: Unhandled exception in /api/reports
  WARN:  Slow query: 450ms on /api/users
  WARN:  Rate limit approaching for IP 192.168.1.100
  WARN:  Disk usage at 85%
```

**Concepts used:** String processing (Chapter 4), Collections with map/filter (Chapter 3), Pipes (Chapter 8), Option for optional data (Chapter 7), Statistics functions (this chapter).

<TryInPlayground :code="logAnalyzerCode" label="Log Analyzer" />

## Exercises

**Exercise 18.1:** Write a function `find_duplicates(directory, extension)` that uses `glob_files` to find all files with the given extension, reads each file, and returns an array of file pairs that have identical content. Test it by creating a few temporary files with `write_text`.

**Exercise 18.2:** Write a `csv_parse(text)` function that takes CSV text and returns an array of objects, using the first line as header names. Handle quoted fields that contain commas. Then write `csv_stringify(data)` that converts an array of objects back to CSV text. Test round-tripping: `csv_parse(csv_stringify(data))` should return the original data.

**Exercise 18.3:** Build a `date_range(start, end_date, step, unit)` function that generates an array of dates from `start` to `end_date`, incrementing by `step` of the given `unit` (days, hours, minutes). Use it to generate: all Mondays in a given month, hourly timestamps for a 24-hour period, and every 15-minute slot in a work day (9:00 to 17:00).

## Challenge

Build a **log file analyzer CLI tool** that works on real log files:
1. Accept a file path as a command-line argument using `args()`
2. Parse each line to extract timestamp, level, and message
3. Compute: total entries, entries per level, entries per hour (histogram)
4. For HTTP request lines, extract method, path, status code, and response time
5. Compute response time statistics: mean, median, p95, p99 using `percentile()`
6. Find the slowest 5 endpoints by average response time
7. Detect anomalies: any response time more than 3 standard deviations above the mean
8. Output the report in both plain text and JSON formats using `jsonPretty()`
9. Write the report to a file using `writeText()` with a timestamped filename

---

[← Previous: Standard Library Mastery](./stdlib-mastery) | [Next: Testing →](./testing)
