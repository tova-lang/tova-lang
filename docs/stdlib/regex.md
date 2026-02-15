# Regex

Tova provides functions for working with regular expressions. These are essential for validation, text parsing, and data extraction.

## Testing

### regex_test

```tova
regex_test(s, pattern, flags?) -> Bool
```

Tests if a string matches a regular expression pattern. Returns `true` or `false`.

```tova
regex_test("hello123", "\\d+")        // true
regex_test("hello", "\\d+")           // false

// Case-insensitive matching
regex_test("Hello", "hello", "i")     // true
```

---

## Matching

### regex_match

```tova
regex_match(s, pattern, flags?) -> Result
```

Returns the first match with capture groups, or `Err` if no match. The result contains `match`, `index`, and `groups`.

```tova
result = regex_match("abc123def", "(\\d+)")
result.unwrap().match      // "123"
result.unwrap().index      // 3
result.unwrap().groups     // ["123"]

// No match
regex_match("hello", "\\d+")
// Err("No match")
```

### regex_find_all

```tova
regex_find_all(s, pattern, flags?) -> List[Match]
```

Returns all matches in the string. Each match has `match`, `index`, and `groups`.

```tova
regex_find_all("a1b2c3", "\\d")
// [{match: "1", index: 1, groups: []},
//  {match: "2", index: 3, groups: []},
//  {match: "3", index: 5, groups: []}]

// With capture groups
regex_find_all("2024-01-15, 2024-02-20", "(\\d{4})-(\\d{2})-(\\d{2})")
// [{match: "2024-01-15", groups: ["2024", "01", "15"]}, ...]
```

### regex_capture

```tova
regex_capture(s, pattern, flags?) -> Result<Object, String>
```

Extracts named capture groups as an object. Returns `Err` if no match or no named groups.

```tova
result = regex_capture("2024-01-15", "(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})")
groups = result.unwrap()
groups.year      // "2024"
groups.month     // "01"
groups.day       // "15"

// Extract structured data
regex_capture("John Smith <john@example.com>", "(?<name>[^<]+)<(?<email>[^>]+)>")
// Ok({ name: "John Smith ", email: "john@example.com" })
```

---

## Replacing & Splitting

### regex_replace

```tova
regex_replace(s, pattern, replacement, flags?) -> String
```

Replaces matches of a pattern. By default replaces all matches (global flag).

```tova
regex_replace("a1b2c3", "\\d", "X")
// "aXbXcX"

// With capture groups
regex_replace("hello world", "(\\w+)", "[$1]")
// "[hello] [world]"

// Clean whitespace
regex_replace("hello    world", "\\s+", " ")
// "hello world"
```

### regex_split

```tova
regex_split(s, pattern, flags?) -> List[String]
```

Splits a string by a regex pattern.

```tova
regex_split("one--two---three", "-+")
// ["one", "two", "three"]

regex_split("a  b\tc", "\\s+")
// ["a", "b", "c"]

// Split on multiple delimiters
regex_split("a,b;c:d", "[,;:]")
// ["a", "b", "c", "d"]
```

---

## Pipeline Examples

```tova
// Extract all emails from text
text
  |> regex_find_all("[\\w.]+@[\\w.]+\\.[a-z]{2,}")
  |> map(fn(m) m.match)

// Clean and validate input
input
  |> trim()
  |> regex_replace("[^a-zA-Z0-9 ]", "")
  |> lower()

// Parse log lines
log_line = "2024-01-15 10:30:00 [ERROR] Connection failed"
regex_capture(log_line, "(?<date>[\\d-]+) (?<time>[\\d:]+) \\[(?<level>\\w+)\\] (?<msg>.*)")
// Ok({ date: "2024-01-15", time: "10:30:00", level: "ERROR", msg: "Connection failed" })
```
