# Regex

Tova provides functions for working with regular expressions. These are essential for validation, text parsing, and data extraction.

::: tip String Quoting for Regex
Use **single-quoted strings** for regex patterns that contain curly braces (`{n}`, `{2,4}`, etc.), since double-quoted strings treat `{}` as string interpolation. For example: `'\\d{4}'` instead of `"\\d{4}"`.
:::

## Testing

### regex_test

```tova
regexTest(s, pattern, flags?) -> Bool
```

Tests if a string matches a regular expression pattern. Returns `true` or `false`.

```tova
regexTest("hello123", "\\d+")        // true
regexTest("hello", "\\d+")           // false

// Case-insensitive matching
regexTest("Hello", "hello", "i")     // true
```

---

## Matching

### regex_match

```tova
regexMatch(s, pattern, flags?) -> Result
```

Returns the first match with capture groups, or `Err` if no match. The result contains `match`, `index`, and `groups`.

```tova
result = regexMatch("abc123def", "(\\d+)")
result.unwrap().match      // "123"
result.unwrap().index      // 3
result.unwrap().groups     // ["123"]

// No match
regexMatch("hello", "\\d+")
// Err("No match")
```

### regex_find_all

```tova
regexFindAll(s, pattern, flags?) -> List[Match]
```

Returns all matches in the string. Each match has `match`, `index`, and `groups`.

```tova
regexFindAll("a1b2c3", "\\d")
// [{match: "1", index: 1, groups: []},
//  {match: "2", index: 3, groups: []},
//  {match: "3", index: 5, groups: []}]

// With capture groups (use single quotes for brace quantifiers)
regexFindAll("2024-01-15, 2024-02-20", '(\\d{4})-(\\d{2})-(\\d{2})')
// [{match: "2024-01-15", groups: ["2024", "01", "15"]}, ...]
```

### regex_capture

```tova
regexCapture(s, pattern, flags?) -> Result<Object, String>
```

Extracts named capture groups as an object. Returns `Err` if no match or no named groups.

```tova
result = regexCapture("2024-01-15", '(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})')
groups = result.unwrap()
groups.year      // "2024"
groups.month     // "01"
groups.day       // "15"

// Extract structured data
regexCapture("John Smith <john@example.com>", "(?<name>[^<]+)<(?<email>[^>]+)>")
// Ok({ name: "John Smith ", email: "john@example.com" })
```

---

## Replacing & Splitting

### regex_replace

```tova
regexReplace(s, pattern, replacement, flags?) -> String
```

Replaces matches of a pattern. By default replaces all matches (global flag).

```tova
regexReplace("a1b2c3", "\\d", "X")
// "aXbXcX"

// With capture groups
regexReplace("hello world", "(\\w+)", "[$1]")
// "[hello] [world]"

// Clean whitespace
regexReplace("hello    world", "\\s+", " ")
// "hello world"
```

### regex_split

```tova
regexSplit(s, pattern, flags?) -> List[String]
```

Splits a string by a regex pattern.

```tova
regexSplit("one--two---three", "-+")
// ["one", "two", "three"]

regexSplit("a  b\tc", "\\s+")
// ["a", "b", "c"]

// Split on multiple delimiters
regexSplit("a,b;c:d", "[,;:]")
// ["a", "b", "c", "d"]
```

---

## Regex Builder


### regex_builder

```tova
regexBuilder() -> RegexBuilder
```

Creates a fluent builder for constructing complex regular expressions. Methods can be chained:

| Method | Description |
|--------|-------------|
| `.literal(str)` | Match exact string (auto-escaped) |
| `.digits(n?)` | Match digits — `\d+` if no argument, `\d{n}` if n given |
| `.word()` | Match one or more word characters (`\w+`) |
| `.space()` | Match one or more whitespace characters (`\s+`) |
| `.any()` | Match any single character (`.`) |
| `.group(name?)` | Open a capturing group — named `(?<name>...)` if name given, unnamed `(...)` otherwise |
| `.endGroup()` | Close the current group |
| `.oneOf(chars)` | Add a character class (`[chars]`) |
| `.optional()` | Make the previous token optional (`?`) |
| `.oneOrMore()` | One or more of the previous token (`+`) |
| `.zeroOrMore()` | Zero or more of the previous token (`*`) |
| `.startOfLine()` | Anchor to start of string (`^`) |
| `.endOfLine()` | Anchor to end of string (`$`) |
| `.flags(str)` | Set regex flags (e.g., `"gi"`) |
| `.build()` | Compile to a RegExp |
| `.test(str)` | Build and test against a string (returns `Bool`) |
| `.match(str)` | Build and match against a string |

```tova
// Build an email pattern
email_re = regexBuilder()
  .word()
  .literal("@")
  .word()
  .literal(".")
  .word()
  .build()

// Build a date pattern
date_re = regexBuilder()
  .startOfLine()
  .digits(4)
  .literal("-")
  .digits(2)
  .literal("-")
  .digits(2)
  .endOfLine()
  .build()
```

---

## Pipeline Examples

```tova
// Extract all emails from text
text
  |> regexFindAll('[\\w.]+@[\\w.]+\\.[a-z]{2,}')
  |> map(fn(m) m.match)

// Clean and validate input
input
  |> trim()
  |> regexReplace("[^a-zA-Z0-9 ]", "")
  |> lower()

// Parse log lines
log_line = "2024-01-15 10:30:00 [ERROR] Connection failed"
regexCapture(log_line, "(?<date>[\\d-]+) (?<time>[\\d:]+) \\[(?<level>\\w+)\\] (?<msg>.*)")
// Ok({ date: "2024-01-15", time: "10:30:00", level: "ERROR", msg: "Connection failed" })
```
