<script setup>
const regexCode = `// Regex: pattern matching on strings
text = "Contact us at support@tova.dev or sales@tova.dev"

// Test if a pattern matches
print(regex_test(r"\\w+@\\w+\\.\\w+", text))   // true

// Find all matches
emails = regex_find_all(r"\\w+@\\w+\\.\\w+", text)
print("Found emails: {emails}")

// Capture groups
log_line = "2026-03-06 14:30:45 [ERROR] Connection refused"
match_result = regex_match(r"(\\d{4}-\\d{2}-\\d{2}) (\\d{2}:\\d{2}:\\d{2}) \\[(\\w+)\\] (.+)", log_line)
print("Date: {match_result[1]}")
print("Time: {match_result[2]}")
print("Level: {match_result[3]}")
print("Message: {match_result[4]}")

// Replace with regex
cleaned = regex_replace(r"\\s+", " ", "too   many    spaces")
print(cleaned)   // "too many spaces"

// Split with regex
parts = regex_split(r"[,;\\s]+", "one, two; three  four")
print(parts)   // ["one", "two", "three", "four"]`

const datetimeCode = `// Date/Time operations
// Current time
print("Now (ISO): {now_iso()}")

// Parse dates
date = date_parse("2026-03-06")
print("Parsed: {date}")

// Format dates
formatted = date_format(now(), "YYYY-MM-DD HH:mm:ss")
print("Formatted: {formatted}")

// Date arithmetic
tomorrow = date_add(now(), 1, "days")
next_week = date_add(now(), 7, "days")
next_month = date_add(now(), 1, "months")

print("Tomorrow: {date_format(tomorrow, 'date')}")
print("Next week: {date_format(next_week, 'date')}")

// Date differences
start = date_parse("2026-01-01")
end_date = date_parse("2026-12-31")
days_between = date_diff(start, end_date, "days")
print("Days in 2026: {days_between}")

// Extract parts
d = now()
print("Year: {date_part(d, 'year')}")
print("Month: {date_part(d, 'month')}")
print("Day: {date_part(d, 'day')}")
print("Weekday: {date_part(d, 'weekday')}")

// Create from parts
birthday = date_from({ year: 1990, month: 6, day: 15 })
print("Birthday: {date_format(birthday, 'date')}")

// Human-readable relative time
recent = date_add(now(), -30, "minutes")
print(time_ago(recent))   // "30 minutes ago"`

const validationCode = `// Validation functions — quick checks for common formats
emails = ["alice@test.com", "not-an-email", "bob@", "valid@domain.org"]
for e in emails {
  status = if is_email(e) { "valid" } else { "invalid" }
  print("{pad_end(e, 20)} {status}")
}

print("")

// URL validation
urls = ["https://tova.dev", "not a url", "ftp://files.com/doc.pdf"]
for u in urls {
  print("{pad_end(u, 30)} {if is_url(u) { 'valid' } else { 'invalid' }}")
}

print("")

// String type checks
test_strings = ["hello", "123", "abc123", "HELLO", "12.5", ""]
for s in test_strings {
  checks = []
  if is_alpha(s) { checks = [...checks, "alpha"] }
  if is_numeric(s) { checks = [...checks, "numeric"] }
  if is_alphanumeric(s) { checks = [...checks, "alnum"] }
  if is_empty(s) { checks = [...checks, "empty"] }
  label = if len(checks) > 0 { join(checks, ", ") } else { "none" }
  print("{pad_end(s, 10)} -> {label}")
}

print("")

// UUID and hex checks
print(is_uuid("550e8400-e29b-41d4-a716-446655440000"))   // true
print(is_uuid("not-a-uuid"))                               // false
print(is_hex("deadbeef"))                                   // true
print(is_hex("xyz123"))                                     // false`

const encodingCode = `// Encoding and decoding
// Base64
original = "Hello, Tova!"
encoded = base64_encode(original)
decoded = base64_decode(encoded)
print("Original: {original}")
print("Base64:   {encoded}")
print("Decoded:  {decoded}")

print("")

// Hex encoding
hex = hex_encode("Hello")
print("Hex encoded: {hex}")
print("Hex decoded: {hex_decode(hex)}")

print("")

// URL encoding (for query parameters and paths)
text = "hello world & goodbye=true"
url_safe = url_encode(text)
print("URL encoded: {url_safe}")
print("URL decoded: {url_decode(url_safe)}")`

const urlJsonCode = `// URL parsing and building
url = parse_url("https://api.example.com/users?page=2&limit=10#results")
match url {
  Ok(parts) => {
    print("Protocol: {parts.protocol}")
    print("Host:     {parts.host}")
    print("Path:     {parts.pathname}")
    print("Search:   {parts.search}")
    print("Hash:     {parts.hash}")
  }
  Err(msg) => print("Invalid URL: {msg}")
}

print("")

// Build a URL from parts
built = build_url({
  protocol: "https",
  host: "api.tova.dev",
  pathname: "/v2/search",
  search: "q=hello&lang=en"
})
print("Built URL: {built}")

print("")

// Query string parsing
query = parse_query("name=Alice&age=30&city=Portland")
print("Query params: {query}")
print("Name: {query.name}")

// Build query string from object
qs = build_query({ search: "hello world", page: "1", sort: "date" })
print("Query string: {qs}")

print("")

// JSON operations
data = { name: "Alice", scores: [95, 87, 92], active: true }

json_str = json_stringify(data)
print("JSON: {json_str}")

pretty = json_pretty(data)
print("Pretty JSON:")
print(pretty)

parsed = json_parse(json_str)
print("Parsed name: {parsed.name}")
print("Parsed scores: {parsed.scores}")`

const advancedCollectionsCode = `// Advanced Collections from stdlib

// Counter — count occurrences efficiently
words = split("the quick brown fox jumps over the lazy fox the", " ")
word_counts = Counter(words)

print("Word counts:")
for entry in word_counts.most_common(5) {
  print("  {pad_end(entry[0], 10)} {entry[1]}")
}
print("Total words: {word_counts.total()}")
print("Unique words: {word_counts.length}")

print("")

// DefaultDict — auto-create missing keys
groups = DefaultDict(fn() [])
items = [
  { name: "Alice", dept: "Engineering" },
  { name: "Bob", dept: "Marketing" },
  { name: "Charlie", dept: "Engineering" },
  { name: "Diana", dept: "Marketing" },
  { name: "Eve", dept: "Design" }
]

for item in items {
  groups.get(item.dept).push(item.name)
}

print("Groups:")
for entry in groups.entries() {
  print("  {entry[0]}: {entry[1]}")
}

print("")

// OrderedDict — maintains insertion order
config = OrderedDict([
  ["host", "localhost"],
  ["port", 3000],
  ["debug", true]
])

print("Config (ordered):")
for entry in config.entries() {
  print("  {entry[0]} = {entry[1]}")
}

// Immutable updates return new instances
updated = config.set("port", 8080)
print("Original port: {config.get('port')}")
print("Updated port:  {updated.get('port')}")

print("")

// Deque — double-ended queue
dq = Deque([1, 2, 3])
dq2 = dq.push_front(0)
dq3 = dq2.push_back(4)

print("Deque: {dq3.toArray()}")
print("Front: {dq3.peek_front()}")
print("Back:  {dq3.peek_back()}")

let [val, rest] = dq3.pop_front()
print("Popped front: {val}")
print("Remaining: {rest.toArray()}")`

const terminalCode = `// Terminal output styling
print(green("Success: All tests passed"))
print(red("Error: Connection failed"))
print(yellow("Warning: Disk space low"))
print(blue("Info: Server started on port 3000"))
print(cyan("Debug: Processing request #42"))
print(magenta("Trace: Entering function process()"))
print(gray("Comment: This is less important"))
print(bold("Important: Read this carefully"))
print(dim("Subtle: Background information"))
print(underline("Emphasis: Key concept here"))

print("")

// Combine styles
print(bold(green("PASS")) ++ " All 42 tests completed")
print(bold(red("FAIL")) ++ " 3 tests failed")

print("")

// Tables — display tabular data
data = [
  { name: "Alice", role: "Engineer", score: 95 },
  { name: "Bob", role: "Designer", score: 87 },
  { name: "Charlie", role: "Manager", score: 92 }
]
table(data)

print("")

// Interactive input
// name = ask("What is your name?")
// confirmed = confirm("Are you sure?")
// choice = choose("Pick a color:", ["Red", "Green", "Blue"])
// password = secret("Enter password:")
print("(Interactive input functions: ask, confirm, choose, secret)")`

const projectCode = `// PROJECT: Log Analyzer
// Combines regex, datetime, validation, and advanced collections

// Sample log data
logs = [
  "2026-03-06 09:15:23 [INFO] Server started on port 3000",
  "2026-03-06 09:15:24 [INFO] Database connected",
  "2026-03-06 09:16:01 [WARN] Slow query: 2340ms",
  "2026-03-06 09:16:45 [ERROR] Connection refused: redis://cache:6379",
  "2026-03-06 09:17:02 [INFO] Request: GET /api/users (200, 45ms)",
  "2026-03-06 09:17:03 [INFO] Request: POST /api/users (201, 120ms)",
  "2026-03-06 09:17:15 [WARN] Rate limit approaching: 85%",
  "2026-03-06 09:17:30 [ERROR] Timeout: GET /api/reports (5000ms)",
  "2026-03-06 09:18:00 [INFO] Request: GET /api/users (200, 38ms)",
  "2026-03-06 09:18:45 [ERROR] Invalid JSON in request body",
  "2026-03-06 09:19:00 [INFO] Backup completed successfully",
  "2026-03-06 09:19:30 [WARN] Memory usage: 78%"
]

// Parse each log line with regex
fn parse_log(line) {
  match_result = regex_match(
    r"(\\d{4}-\\d{2}-\\d{2}) (\\d{2}:\\d{2}:\\d{2}) \\[(\\w+)\\] (.+)",
    line
  )
  if match_result != nil {
    Ok({
      date: match_result[1],
      time: match_result[2],
      level: match_result[3],
      message: match_result[4]
    })
  } else {
    Err("Failed to parse: {line}")
  }
}

// Parse all logs
parsed = logs
  |> map(fn(line) parse_log(line))
  |> filter(fn(r) r.isOk())
  |> map(fn(r) r.unwrap())

// Count by level using Counter
levels = Counter(parsed |> map(fn(entry) entry.level))

print(bold("=== Log Analysis Report ==="))
print("")

// Level summary
print(underline("Log Level Distribution:"))
for entry in levels.most_common() {
  count = entry[1]
  bar = repeat("█", count)
  color_fn = match entry[0] {
    "ERROR" => red
    "WARN" => yellow
    "INFO" => green
    _ => identity
  }
  print("  {pad_end(entry[0], 7)} {color_fn(bar)} ({count})")
}

print("")

// Extract errors
errors = parsed |> filter(fn(e) e.level == "ERROR")
print(underline("Errors ({len(errors)}):"))
for err in errors {
  print("  {red(err.time)} {err.message}")
}

print("")

// Extract response times from request logs
fn extract_response_time(msg) {
  match_result = regex_match(r"\\((\\d+)ms\\)", msg)
  if match_result != nil {
    Some(to_int(match_result[1]))
  } else {
    None
  }
}

response_times = parsed
  |> map(fn(e) extract_response_time(e.message))
  |> filter(fn(t) t.isSome())
  |> map(fn(t) t.unwrap())

if len(response_times) > 0 {
  print(underline("Response Time Stats:"))
  print("  Count:   {len(response_times)}")
  print("  Min:     {min(response_times)}ms")
  print("  Max:     {max(response_times)}ms")
  print("  Average: {sum(response_times) / len(response_times)}ms")
}

print("")
print(dim("Analyzed {len(logs)} log entries"))`
</script>

# Chapter 14: Standard Library Mastery

Tova's standard library goes far beyond collections and strings. It includes regex, date/time, validation, encoding, JSON, URL handling, advanced data structures, and terminal output. This chapter is your guided tour through the parts most developers use daily.

By the end, you'll build a log analyzer that ties together regex, datetime, collections, and terminal formatting.

## Regular Expressions

Tova provides a clean regex API through six functions. All patterns use standard regex syntax:

### regex_test — Does It Match?

```tova
print(regex_test(r"\d+", "abc 123"))       // true
print(regex_test(r"^\d+$", "abc 123"))     // false (not entirely digits)
print(regex_test(r"^\d+$", "12345"))       // true
```

### regex_match — Extract Captures

Returns an array where index 0 is the full match and subsequent indices are capture groups:

```tova
line = "2026-03-06 14:30:45 [ERROR] Disk full"
result = regex_match(r"(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) \[(\w+)\] (.+)", line)

print(result[0])   // Full match: entire string
print(result[1])   // "2026-03-06"
print(result[2])   // "14:30:45"
print(result[3])   // "ERROR"
print(result[4])   // "Disk full"
```

### regex_find_all — Find Every Match

```tova
text = "Emails: alice@test.com and bob@work.org"
emails = regex_find_all(r"\w+@\w+\.\w+", text)
print(emails)   // ["alice@test.com", "bob@work.org"]

// Extract all numbers from text
numbers = regex_find_all(r"\d+", "Order #42: 3 items at $15 each")
print(numbers)   // ["42", "3", "15"]
```

### regex_replace — Find and Replace

```tova
// Normalize whitespace
cleaned = regex_replace(r"\s+", " ", "too   many    spaces")
print(cleaned)   // "too many spaces"

// Redact sensitive data
safe = regex_replace(r"\d{4}-\d{4}-\d{4}-(\d{4})", "****-****-****-$1",
  "Card: 1234-5678-9012-3456")
print(safe)   // "Card: ****-****-****-3456"
```

### regex_split — Split by Pattern

```tova
// Split on any combination of whitespace and punctuation
parts = regex_split(r"[,;\s]+", "one, two; three  four")
print(parts)   // ["one", "two", "three", "four"]
```

### regex_capture — Named Captures

```tova
result = regex_capture(
  r"(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})",
  "2026-03-06"
)
print(result.year)    // "2026"
print(result.month)   // "03"
print(result.day)     // "06"
```

<TryInPlayground :code="regexCode" label="Regex" />

::: tip Raw Strings for Regex
Always use raw strings (`r"..."`) for regex patterns. Without the `r` prefix, backslashes need double-escaping: `"\\d+"` vs `r"\d+"`. Raw strings make patterns readable.
:::

## Date and Time

Tova's datetime module covers parsing, formatting, arithmetic, and human-readable output:

### Getting the Current Time

```tova
timestamp = now()         // Numeric timestamp (milliseconds)
iso_string = now_iso()    // ISO 8601 string: "2026-03-06T14:30:45.123Z"
```

### Parsing Dates

```tova
d = date_parse("2026-03-06")
match d {
  Ok(date) => print("Parsed: {date_format(date, 'date')}")
  Err(msg) => print("Invalid: {msg}")
}
```

`date_parse` returns a `Result` — invalid date strings produce `Err`.

### Formatting Dates

```tova
d = now()

// Preset formats
print(date_format(d, "iso"))       // "2026-03-06T14:30:45.123Z"
print(date_format(d, "date"))      // "2026-03-06"
print(date_format(d, "time"))      // "14:30:45"
print(date_format(d, "datetime"))  // "2026-03-06 14:30:45"

// Custom format tokens
print(date_format(d, "DD/MM/YYYY"))          // "06/03/2026"
print(date_format(d, "YYYY-MM-DD HH:mm"))    // "2026-03-06 14:30"
```

| Token | Meaning | Example |
|-------|---------|---------|
| `YYYY` | 4-digit year | 2026 |
| `MM` | 2-digit month | 03 |
| `DD` | 2-digit day | 06 |
| `HH` | 2-digit hour (24h) | 14 |
| `mm` | 2-digit minute | 30 |
| `ss` | 2-digit second | 45 |

### Date Arithmetic

```tova
today = now()

tomorrow = date_add(today, 1, "days")
next_week = date_add(today, 7, "days")
next_month = date_add(today, 1, "months")
next_year = date_add(today, 1, "years")
two_hours_later = date_add(today, 2, "hours")
```

### Date Differences

```tova
start = date_parse("2026-01-01").unwrap()
end_d = date_parse("2026-12-31").unwrap()

print(date_diff(start, end_d, "days"))     // 364
print(date_diff(start, end_d, "months"))   // 11
print(date_diff(start, end_d, "hours"))    // 8736
```

### Creating Dates from Parts

```tova
birthday = date_from({ year: 1990, month: 6, day: 15 })
meeting = date_from({ year: 2026, month: 3, day: 10, hour: 14, minute: 30 })
```

### Extracting Parts

```tova
d = now()
print(date_part(d, "year"))      // 2026
print(date_part(d, "month"))     // 3
print(date_part(d, "day"))       // 6
print(date_part(d, "weekday"))   // "Thursday" (or similar)
```

### Human-Readable Relative Time

```tova
recent = date_add(now(), -45, "minutes")
print(time_ago(recent))   // "45 minutes ago"

old = date_add(now(), -3, "days")
print(time_ago(old))      // "3 days ago"
```

<TryInPlayground :code="datetimeCode" label="Date/Time" />

## Validation

Quick checks for common string formats:

```tova
// Email validation
print(is_email("alice@example.com"))   // true
print(is_email("not-an-email"))        // false

// URL validation
print(is_url("https://tova.dev"))      // true
print(is_url("not a url"))            // false

// String content checks
print(is_numeric("12345"))      // true
print(is_numeric("12.5"))       // true
print(is_alpha("hello"))        // true
print(is_alpha("hello123"))     // false
print(is_alphanumeric("abc123")) // true
print(is_hex("deadbeef"))       // true
print(is_uuid("550e8400-e29b-41d4-a716-446655440000"))  // true

// Emptiness
print(is_empty(""))      // true
print(is_empty("  "))    // false (whitespace is not empty)
```

### Combining Validators

Build validation pipelines using these as building blocks:

```tova
fn validate_signup(data) {
  guard is_email(data.email) else { return Err("Invalid email") }
  guard len(data.password) >= 8 else { return Err("Password too short") }
  guard is_alphanumeric(data.username) else { return Err("Username must be alphanumeric") }
  Ok(data)
}
```

<TryInPlayground :code="validationCode" label="Validation" />

## Encoding

Convert data between formats for storage, transmission, or display:

### Base64

```tova
encoded = base64_encode("Hello, Tova!")
print(encoded)   // "SGVsbG8sIFRvdmEh"

decoded = base64_decode(encoded)
print(decoded)   // "Hello, Tova!"
```

Base64 is used for embedding binary data in text formats (emails, JSON, data URIs).

### Hex

```tova
hex = hex_encode("Hello")
print(hex)   // "48656c6c6f"

original = hex_decode(hex)
print(original)   // "Hello"
```

Hex encoding is common for hashes, colors, and binary inspection.

### URL Encoding

```tova
safe = url_encode("hello world & more")
print(safe)   // "hello%20world%20%26%20more"

original = url_decode(safe)
print(original)   // "hello world & more"
```

<TryInPlayground :code="encodingCode" label="Encoding" />

## JSON

Parse, stringify, and pretty-print JSON:

```tova
// Object to JSON string
data = { name: "Alice", scores: [95, 87, 92], active: true }
json_str = json_stringify(data)
print(json_str)   // '{"name":"Alice","scores":[95,87,92],"active":true}'

// JSON string to object
parsed = json_parse(json_str)
print(parsed.name)      // "Alice"
print(parsed.scores[0]) // 95

// Pretty-printed JSON (for display and debugging)
pretty = json_pretty(data)
print(pretty)
// {
//   "name": "Alice",
//   "scores": [95, 87, 92],
//   "active": true
// }
```

::: tip JSON + Result
`json_parse` can fail on invalid input. In production code, wrap it in a try-catch or use a safe wrapper that returns `Result`.
:::

## URL Parsing and Building

### Parsing URLs

```tova
result = parse_url("https://api.example.com/users?page=2&limit=10#results")
match result {
  Ok(parts) => {
    print(parts.protocol)   // "https:"
    print(parts.host)       // "api.example.com"
    print(parts.pathname)   // "/users"
    print(parts.search)     // "?page=2&limit=10"
    print(parts.hash)       // "#results"
  }
  Err(msg) => print("Invalid URL: {msg}")
}
```

### Building URLs

```tova
url = build_url({
  protocol: "https",
  host: "api.tova.dev",
  pathname: "/v2/search",
  search: "q=hello&lang=en"
})
print(url)   // "https://api.tova.dev/v2/search?q=hello&lang=en"
```

### Query String Operations

```tova
// Parse query string to object
params = parse_query("name=Alice&age=30&city=Portland")
print(params.name)   // "Alice"
print(params.age)    // "30"

// Build query string from object
qs = build_query({ search: "hello world", page: "1", sort: "date" })
print(qs)   // "search=hello%20world&page=1&sort=date"
```

<TryInPlayground :code="urlJsonCode" label="URL and JSON" />

## Random and Sampling

Generate random values and sample from collections:

```tova
// Random numbers
print(random())              // Float between 0 and 1
print(random_int(1, 100))    // Int between 1 and 100
print(random_float(0, 10))   // Float between 0 and 10

// Pick from collections
colors = ["red", "green", "blue", "yellow"]
print(choice(colors))         // Random element
print(sample(colors, 2))      // 2 random elements (no repeats)

// Shuffle
deck = range(1, 53) |> to_array()
shuffled = shuffle(deck)
print(shuffled |> take(5))    // First 5 cards of shuffled deck
```

## Advanced Collections

Beyond arrays, objects, and maps, Tova's stdlib provides specialized data structures for common patterns.

### Counter — Count Occurrences

`Counter` takes an iterable and counts how often each value appears:

```tova
words = split("the quick brown fox jumps over the lazy fox the", " ")
counts = Counter(words)

print(counts.count("the"))     // 3
print(counts.count("fox"))     // 2
print(counts.count("missing")) // 0

// Most common elements
print(counts.most_common(3))
// [["the", 3], ["fox", 2], ["quick", 1]]

print(counts.total())    // 10 (total word count)
print(counts.length)     // 8 (unique words)
```

Counter is perfect for frequency analysis, histograms, and vote counting.

### DefaultDict — Auto-Creating Keys

`DefaultDict` automatically creates a value for missing keys using a factory function:

```tova
// Group items by category
groups = DefaultDict(fn() [])

items = [
  { name: "Widget", category: "tools" },
  { name: "Sprocket", category: "parts" },
  { name: "Wrench", category: "tools" },
  { name: "Bolt", category: "parts" },
  { name: "Hammer", category: "tools" }
]

for item in items {
  groups.get(item.category).push(item.name)
}

print(groups.get("tools"))    // ["Widget", "Wrench", "Hammer"]
print(groups.get("parts"))    // ["Sprocket", "Bolt"]
print(groups.get("other"))    // [] (auto-created empty array)
```

```tova
// Count with DefaultDict
word_counts = DefaultDict(fn() 0)
for word in split("the quick brown fox the fox", " ") {
  word_counts.set(word, word_counts.get(word) + 1)
}
```

### OrderedDict — Predictable Key Order

`OrderedDict` maintains key-value pairs in insertion order:

```tova
config = OrderedDict([
  ["host", "localhost"],
  ["port", 3000],
  ["debug", true],
  ["log_level", "info"]
])

// Keys always come back in insertion order
print(config.keys())   // ["host", "port", "debug", "log_level"]

// Immutable updates — set returns a NEW OrderedDict
updated = config.set("port", 8080)
print(config.get("port"))    // 3000 (original unchanged)
print(updated.get("port"))   // 8080

// Check membership
print(config.has("host"))     // true
print(config.has("timeout"))  // false
```

### Deque — Double-Ended Queue

`Deque` supports efficient push/pop from both ends:

```tova
dq = Deque([1, 2, 3])

// Add to front or back (returns new Deque)
dq2 = dq.push_front(0)       // [0, 1, 2, 3]
dq3 = dq2.push_back(4)       // [0, 1, 2, 3, 4]

// Peek without removing
print(dq3.peek_front())   // 0
print(dq3.peek_back())    // 4

// Pop returns [value, new_deque]
let [front, rest] = dq3.pop_front()
print(front)               // 0
print(rest.toArray())      // [1, 2, 3, 4]

let [back, rest2] = rest.pop_back()
print(back)                // 4
print(rest2.toArray())     // [1, 2, 3]
```

Deques are useful for:
- **Sliding windows** (push to back, pop from front)
- **Undo/redo stacks** (push to back, pop from back)
- **Work queues** (enqueue at back, dequeue from front)

<TryInPlayground :code="advancedCollectionsCode" label="Advanced Collections" />

## Terminal Output

Tova's terminal functions make CLI output readable and professional:

### Text Styling

```tova
print(green("Success: Tests passed"))
print(red("Error: Build failed"))
print(yellow("Warning: Deprecated API"))
print(blue("Info: Server started"))
print(cyan("Debug: Request received"))
print(magenta("Trace: Function called"))
print(gray("Note: This is minor"))

print(bold("Important message"))
print(dim("Less important"))
print(underline("Emphasized text"))
print(strikethrough("Removed"))
```

Combine styles by nesting:

```tova
print(bold(green("PASS")) ++ " test_login")
print(bold(red("FAIL")) ++ " test_signup")
```

### Tables

Display structured data in aligned columns:

```tova
data = [
  { name: "Alice", role: "Engineer", salary: 95000 },
  { name: "Bob", role: "Designer", salary: 82000 },
  { name: "Charlie", role: "Manager", salary: 105000 }
]

table(data)
// ┌─────────┬──────────┬────────┐
// │ name    │ role     │ salary │
// ├─────────┼──────────┼────────┤
// │ Alice   │ Engineer │ 95000  │
// │ Bob     │ Designer │ 82000  │
// │ Charlie │ Manager  │ 105000 │
// └─────────┴──────────┴────────┘
```

### Panels

```tova
panel("Application Status", "All systems operational\nUptime: 99.9%")
// ╭─ Application Status ─────────╮
// │ All systems operational       │
// │ Uptime: 99.9%                │
// ╰──────────────────────────────╯
```

### Progress and Spinners

```tova
// Progress bar (for known-length operations)
for i in range(0, 101) {
  progress(i, 100, "Processing")
}

// Spinner (for unknown-length operations)
spinner = spin("Loading data...")
// ... do work ...
// spinner.stop()
```

### Interactive Input

```tova
name = ask("What is your name?")
confirmed = confirm("Deploy to production?")
color = choose("Pick a theme:", ["Dark", "Light", "Auto"])
colors = choose_many("Select languages:", ["Tova", "Python", "JavaScript", "Go"])
password = secret("Enter API key:")
```

<TryInPlayground :code="terminalCode" label="Terminal Output" />

## Project: Log Analyzer

Let's build a log analyzer that combines regex, datetime, advanced collections, and terminal formatting:

```tova
// Sample log data
logs = [
  "2026-03-06 09:15:23 [INFO] Server started on port 3000",
  "2026-03-06 09:16:01 [WARN] Slow query: 2340ms",
  "2026-03-06 09:16:45 [ERROR] Connection refused: redis://cache:6379",
  "2026-03-06 09:17:02 [INFO] Request: GET /api/users (200, 45ms)",
  "2026-03-06 09:17:30 [ERROR] Timeout: GET /api/reports (5000ms)",
  "2026-03-06 09:18:00 [INFO] Request: GET /api/users (200, 38ms)",
  "2026-03-06 09:18:45 [ERROR] Invalid JSON in request body",
  "2026-03-06 09:19:30 [WARN] Memory usage: 78%"
]

// Parse each line with regex
fn parse_log(line) {
  result = regex_match(
    r"(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) \[(\w+)\] (.+)", line
  )
  if result != nil {
    Ok({ date: result[1], time: result[2], level: result[3], message: result[4] })
  } else {
    Err("Parse error")
  }
}

parsed = logs
  |> map(parse_log)
  |> filter(fn(r) r.isOk())
  |> map(fn(r) r.unwrap())

// Count by level
levels = Counter(parsed |> map(fn(e) e.level))

print(bold("=== Log Analysis ==="))
for entry in levels.most_common() {
  color_fn = match entry[0] {
    "ERROR" => red
    "WARN" => yellow
    _ => green
  }
  print("  {color_fn(pad_end(entry[0], 7))} {repeat('█', entry[1])} ({entry[1]})")
}

// Extract response times
fn extract_ms(msg) {
  m = regex_match(r"\((\d+)ms\)", msg)
  if m != nil { Some(to_int(m[1])) } else { None }
}

times = parsed
  |> map(fn(e) extract_ms(e.message))
  |> filter(fn(t) t.isSome())
  |> map(fn(t) t.unwrap())

if len(times) > 0 {
  print("")
  print(bold("Response Times:"))
  print("  Min: {min(times)}ms  Max: {max(times)}ms  Avg: {sum(times) / len(times)}ms")
}
```

This project demonstrates the power of combining stdlib modules. Regex parses unstructured text. Counter summarizes frequencies. Terminal functions make the output professional. Each piece is simple — the combination is powerful.

<TryInPlayground :code="projectCode" label="Log Analyzer" />

## Exercises

**Exercise 14.1:** Write a `parse_csv(text)` function that uses `regex_split` to parse CSV text into an array of objects (using the first line as headers). Handle quoted fields that may contain commas.

**Exercise 14.2:** Build a `date_range(start, end, step_unit)` function that generates an array of dates between start and end, stepping by the given unit. For example, `date_range("2026-01-01", "2026-01-07", "days")` returns 7 dates.

**Exercise 14.3:** Create a `schema_validator(schema)` function that takes a schema object like `{ name: "string", age: "number", email: "email" }` and returns a validator function. The validator should check each field using the appropriate `is_*` function and return `Ok(data)` or `Err([list_of_errors])`.

**Exercise 14.4:** Build a frequency analyzer that reads a text, counts character frequencies using `Counter`, and displays a horizontal bar chart using terminal colors. Highlight vowels in one color and consonants in another.

## Challenge

Build a **URL shortener data analyzer**. Given a log of URL shortener events:
1. Parse each log entry (timestamp, short_code, original_url, referrer, country)
2. Use `Counter` to find the most-clicked short URLs
3. Use `DefaultDict` to group clicks by country
4. Calculate click trends over time using `date_diff` and `date_part`
5. Display a formatted report with `table()`, colored headers, and summary statistics
6. Export the analysis as pretty-printed JSON

---

[← Previous: Functional Programming](./functional-programming) | [Next: I/O and System →](./io-and-system)
