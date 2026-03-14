<script setup>
const interpolationCode = `// String interpolation: Tova's killer string feature
name = "Alice"
age = 30
print("Hello, {name}! You are {age} years old.")

// Expressions inside interpolation
price = 29.99
quantity = 3
print("Total: {price * quantity}")
print("Discounted: {price * quantity * 0.9}")

// Nested access
user = { name: "Bob", scores: [95, 87, 92] }
print("{user.name} scored {user.scores[0]} on the first test")

// Multi-line strings
poem = "Roses are red,
Violets are blue,
Tova is great,
And so are you."
print(poem)`

const methodsCode = `// String methods — the complete toolkit
text = "  Hello, World!  "

// Trimming and case
print(trim(text))            // "Hello, World!"
print(upper("hello"))            // "HELLO"
print(lower("HELLO"))            // "hello"

// Searching
print(contains("foobar", "bar"))     // true
print(startsWith("hello", "hel"))   // true
print(endsWith("hello", "llo"))     // true
print(indexOf("abcabc", "bc"))      // 1

// Splitting and joining
csv = "alice,bob,charlie"
parts = split(csv, ",")
print(parts)                     // ["alice", "bob", "charlie"]
print(join(parts, " | "))       // "alice | bob | charlie"

// Extracting
print(substr("Hello, World!", 0, 5))   // "Hello"
print(substr("Hello, World!", 7))      // "World!"

// Replacing
print(replace("hello world", "world", "tova"))   // "hello tova"

// Repetition and padding
print(repeat("=", 20))
print(padStart("42", 5, "0"))      // "00042"
print(padEnd("hello", 10, "."))    // "hello....."`

const templateCode = `// PROJECT: Mini Template Engine
// Replaces placeholders like "Hello, %name%!" with actual values

fn render_template(template, data) {
  var tpl = template

  for entry in entries(data) {
    placeholder = "%{entry[0]}%"
    tpl = replace(tpl, placeholder, toString(entry[1]))
  }

  tpl
}

// Test it out
greeting = render_template(
  "Hello, %name%! You have %count% new messages.",
  { name: "Alice", count: 5 }
)
print(greeting)

// A more complex template
report = render_template(
  "Report for %month% %year%: Revenue=%revenue%, Expenses=%expenses%, Profit=%profit%",
  { month: "January", year: 2026, revenue: "$50,000", expenses: "$35,000", profit: "$15,000" }
)
print(report)

// Template for HTML generation
html_tmpl = "<div class='card'><h2>%title%</h2><p>%body%</p><span>By %author%</span></div>"
html = render_template(
  html_tmpl,
  { title: "Getting Started", body: "Welcome to Tova!", author: "Team Tova" }
)
print(html)`

const processingCode = `// Text processing patterns

// Capitalize first letter of each word
fn titleCase(text) {
  split(text, " ")
    |> map(fn(word) {
      if len(word) == 0 { "" }
      else {
        first = upper(substr(word, 0, 1))
        rest = substr(word, 1)
        "{first}{rest}"
      }
    })
    |> join(" ")
}

print(titleCase("hello world from tova"))

// Truncate with ellipsis
fn truncate(text, max_len) {
  if len(text) <= max_len { text }
  else {
    prefix = substr(text, 0, max_len - 3)
    "{prefix}..."
  }
}

print(truncate("This is a very long string that needs shortening", 25))

// Slug generation
fn slugify(text) {
  text
    |> lower()
    |> replace(" ", "-")
    |> replace("'", "")
}

print(slugify("Hello World It's Tova"))

// Extract all numbers from text
fn extract_numbers(text) {
  var nums = []
  var current = ""
  for ch in chars(text) {
    if isNumeric(ch) || ch == "." {
      current = "{current}{ch}"
    } elif len(current) > 0 {
      nums.push(toFloat(current))
      current = ""
    }
  }
  if len(current) > 0 {
    nums.push(toFloat(current))
  }
  nums
}

print(extract_numbers("I have 3 cats and 2.5 kg of food, costing 12.99"))

// Wrap text at specified width
fn wordWrap(text, width) {
  all_words = split(text, " ")
  var lines = []
  var current_line = ""

  for w in all_words {
    if len(current_line) == 0 {
      current_line = w
    } elif len(current_line) + 1 + len(w) <= width {
      current_line = "{current_line} {w}"
    } else {
      lines.push(current_line)
      current_line = w
    }
  }
  if len(current_line) > 0 {
    lines.push(current_line)
  }
  join(lines, "\\n")
}

long_text = "Tova is a modern programming language designed for scripting data processing and full stack web development with a clean expressive syntax"
print(wordWrap(long_text, 40))`
</script>

# Chapter 4: String Craft

Strings are everywhere — user input, file paths, URLs, log messages, generated code. Tova gives you powerful string interpolation, a rich set of string functions, and pattern matching on strings. This chapter makes you fluent in text processing.

By the end, you'll build a mini template engine.

## String Types

Tova has several string forms, each designed for different situations. Understanding when to use each one makes your code cleaner and avoids escaping headaches.

### Double-Quoted Strings (Interpolation)

The most common form. Expressions inside `{braces}` are evaluated and inserted:

```tova
name = "Alice"
greeting = "Hello, {name}!"         // "Hello, Alice!"
math = "2 + 2 = {2 + 2}"           // "2 + 2 = 4"
nested = "Score: {user.scores[0]}"  // Access nested data
```

Double-quoted strings process escape sequences like `\n`, `\t`, and `\\`.

### Single-Quoted Strings (Literal)

Single quotes create **literal strings** — no interpolation, no escape processing:

```tova
template = 'Hello, {name}'          // Literally: Hello, {name}
regex_str = '\d+\.\d+'              // Backslashes are literal
json_key = '{"key": "value"}'       // Braces are literal
```

Use single quotes when you need literal curly braces, backslashes, or when the string shouldn't be processed in any way.

### Raw Strings

Prefix with `r` to disable all escape processing while keeping double-quote syntax:

```tova
windows_path = r"C:\Users\Alice\Documents"
regex = r"\d{3}-\d{4}"
```

Raw strings are perfect for Windows file paths, regex patterns, and template literals.

### Triple-Quoted Multiline Strings

For multi-line text, use triple double quotes. They automatically **dedent** — common leading whitespace is stripped:

```tova
html = """
  <div>
    <h1>Hello</h1>
    <p>Welcome to Tova</p>
  </div>
"""
// The 2-space indent common to all lines is removed
```

Triple-quoted strings support interpolation:

```tova
fn render_card(title, body) {
  """
  <div class="card">
    <h2>{title}</h2>
    <p>{body}</p>
  </div>
  """
}
```

### Escape Sequences Reference

Double-quoted strings support these escape sequences:

| Escape | Character |
|--------|-----------|
| `\n` | Newline |
| `\t` | Tab |
| `\r` | Carriage return |
| `\\` | Literal backslash |
| `\"` | Literal double quote |
| `\'` | Literal single quote |
| `\{` | Literal opening brace (prevents interpolation) |
| `\}` | Literal closing brace |

```tova
print("Column1\tColumn2\tColumn3")   // Tab-separated
print("She said \"hello\"")           // Escaped quotes
print("Price: \{not interpolated\}")  // Literal braces
```

::: tip Choosing a String Type
| Need | Use |
|------|-----|
| Most strings | `"double quotes"` |
| No interpolation needed | `'single quotes'` |
| File paths, regex | `r"raw strings"` |
| Multi-line text, templates | `"""triple quotes"""` |
:::

## String Interpolation

Tova strings use `{expression}` for interpolation — no dollar signs, no special syntax, just curly braces:

```tova
name = "Alice"
print("Hello, {name}!")

// Any expression works inside the braces
items = [1, 2, 3]
print("You have {len(items)} items totaling {sum(items)}")

// Object access
user = { name: "Bob", role: "admin" }
print("{user.name} is a {user.role}")
```

::: tip When NOT to Interpolate
If you're building a string incrementally in a loop, collect parts in an array and `join()` them. Interpolation is best for final, human-readable output.
:::

<TryInPlayground :code="interpolationCode" label="String Interpolation" />

## String Concatenation

Use interpolation to join strings:

```tova
greeting = "Hello, World!"

// Building paths
base = "/api"
version = "/v2"
endpoint = "/users"
url = "{base}{version}{endpoint}"
// "/api/v2/users"
```

For joining many strings, `join()` is cleaner:

```tova
parts = ["2026", "03", "05"]
date = join(parts, "-")    // "2026-03-05"

words = ["Tova", "is", "great"]
sentence = join(words, " ")  // "Tova is great"
```

## Essential String Functions

Here are the string functions you'll use daily:

### Searching

```tova
text = "Hello, World!"

contains(text, "World")      // true
startsWith(text, "Hello")   // true
endsWith(text, "!")         // true
indexOf(text, "World")     // 7
lastIndexOf(text, "l")    // 10 (last occurrence)
charAt(text, 0)             // "H" (character at index)
```

### Transforming

```tova
upper("hello")               // "HELLO"
lower("HELLO")               // "hello"
trim("  hello  ")           // "hello"
trimStart("  hello  ")    // "hello  "
trimEnd("  hello  ")      // "  hello"
replace("foo bar", "bar", "baz")   // "foo baz"
replaceFirst("aaa", "a", "b")    // "baa" (only first occurrence)
isEmpty("")                 // true
isEmpty("hello")            // false
```

### Extracting

```tova
text = "Hello, World!"

substr(text, 0, 5)   // "Hello"
substr(text, 7)      // "World!"
len(text)            // 13
chars(text)          // ["H", "e", "l", "l", "o", ...]
```

### Splitting

```tova
split("a,b,c", ",")           // ["a", "b", "c"]
split("hello world", " ")     // ["hello", "world"]
split("a::b::c", "::")        // ["a", "b", "c"]
```

### Padding and Repetition

```tova
padStart("42", 5, "0")       // "00042"
padEnd("hi", 10, ".")        // "hi........"
repeat("-", 30)                // "------------------------------"
repeat("ab", 3)                // "ababab"
```

### Formatting

The `fmt()` function creates formatted strings with `{}` placeholders, filled in order from the remaining arguments. Think of it as a lightweight alternative to interpolation when your template comes from a variable or config:

```tova
fmt("Hello, {}! You have {} messages.", "Alice", 5)
// "Hello, Alice! You have 5 messages."

fmt("{} + {} = {}", 2, 3, 5)
// "2 + 3 = 5"

// Useful when the template is dynamic
template = "Welcome back, {}! Last login: {}"
print(fmt(template, "Bob", "March 5"))
```

### Centering

The `center()` function pads a string on both sides to center it within a given width. The default pad character is a space:

```tova
center("hello", 11)           // "   hello   "
center("title", 20, "-")      // "-------title--------"

// Great for building formatted output
heading = center(" Report ", 40, "=")
print(heading)
// "================ Report ================"
```

### Counting Substrings

The `countOf()` function counts how many times a substring appears in a string:

```tova
countOf("banana", "an")      // 2
countOf("hello", "l")        // 2
countOf("aaa", "aa")         // 1 (non-overlapping)

// Handy for text analysis
csv_line = "alice,bob,charlie,diana"
num_commas = countOf(csv_line, ",")
print("Fields: {num_commas + 1}")   // "Fields: 4"
```

<TryInPlayground :code="methodsCode" label="String Methods" />

## String Pattern Matching

One of Tova's unique features is matching strings with the `++` concat pattern:

```tova
fn parseUrl(url) {
  match url {
    "https://" ++ domain => { secure: true, domain: domain }
    "http://" ++ domain => { secure: false, domain: domain }
    _ => { secure: false, domain: url }
  }
}

print(parseUrl("https://tova.dev"))
print(parseUrl("http://localhost"))
```

This is incredibly useful for routing and parsing:

```tova
fn handle_command(input) {
  match trim(input) {
    "help" => show_help()
    "quit" => exit()
    "open " ++ filename => open_file(filename)
    "search " ++ query => search_for(query)
    "set " ++ rest => {
      parts = split(rest, " ")
      set_config(parts[0], parts[1])
    }
    _ => print("Unknown command: {input}")
  }
}
```

## Building Strings Efficiently

For building strings from collections, `join()` is preferred:

```tova
// Building a CSV line
fields = ["Alice", "30", "Portland", "Engineer"]
csv_line = join(fields, ",")

// Building a table
fn format_row(cells, widths) {
  formatted = zip(cells, widths)
    |> map(fn(pair) padEnd(toString(pair[0]), pair[1]))
  join(formatted, " | ")
}

header = format_row(["Name", "Age", "City"], [10, 5, 12])
row1 = format_row(["Alice", "30", "Portland"], [10, 5, 12])
row2 = format_row(["Bob", "25", "Seattle"], [10, 5, 12])

print(header)
print(repeat("-", 33))
print(row1)
print(row2)
```

## Common Text Processing Patterns

### Title Case

```tova
fn titleCase(text) {
  split(text, " ")
    |> map(fn(word) {
      if len(word) == 0 { "" }
      else {
        first = upper(substr(word, 0, 1))
        rest = substr(word, 1)
        "{first}{rest}"
      }
    })
    |> join(" ")
}

print(titleCase("hello world from tova"))
// "Hello World From Tova"
```

### Slugify

```tova
fn slugify(text) {
  text
    |> lower()
    |> replace(" ", "-")
    |> replace("'", "")
}

print(slugify("Hello World It's Tova"))
// "hello-world-its-tova"
```

::: tip Built-in Stdlib Function
`slugify` is available as a stdlib function — you don't need to define it yourself. The implementation above shows how it works internally. Just call `slugify(text)` directly.
:::

### Truncate with Ellipsis

```tova
fn truncate(text, max_len) {
  if len(text) <= max_len { text }
  else {
    prefix = substr(text, 0, max_len - 3)
    "{prefix}..."
  }
}

print(truncate("A very long description that goes on and on", 20))
// "A very long descr..."
```

::: tip Built-in Stdlib Function
`truncate` is available as a stdlib function — call `truncate(text, max_len)` directly without defining it.
:::

<TryInPlayground :code="processingCode" label="Text Processing" />

## Regular Expressions

For complex text patterns, Tova has regex literals and a full regex toolkit:

### Regex Literals

```tova
// Regex literals use /pattern/flags syntax
email_pattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
phone_pattern = /\d{3}-\d{3}-\d{4}/
```

### Testing Patterns

```tova
regexTest("alice@example.com", email_pattern)   // true
regexTest("not-an-email", email_pattern)        // false
regexTest("555-123-4567", phone_pattern)        // true
```

### Matching and Capturing

```tova
// Find the first match (returns Result)
result = regexMatch("Order 42-7", /(\d+)-(\d+)/)
// Ok({ match: "42-7", groups: ["42", "7"] })

// Find all matches
all = regexFindAll("I have 3 cats and 12 dogs", /\d+/)
// [{ match: "3", ... }, { match: "12", ... }]

// Named captures (returns Result)
parsed = regexCapture("2026-03-05", /(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})/)
// Ok({ year: "2026", month: "03", day: "05" })
```

### Replacing with Regex

```tova
// Simple replacement
clean = regexReplace("hello   world   foo", /\s+/, " ")
// "hello world foo"

// Replace all digits with #
masked = regexReplace("Card: 4111-2222-3333-4444", /\d/, "#")
// "Card: ####-####-####-####"
```

### Splitting with Regex

```tova
// Split on any whitespace
parts = regexSplit("hello   world\tfoo\nbar", /\s+/)
// ["hello", "world", "foo", "bar"]

// Split on comma with optional spaces
items = regexSplit("a, b , c,d", /\s*,\s*/)
// ["a", "b", "c", "d"]
```

### Building Regex Patterns

For complex patterns, `regex_builder` provides a fluent API to construct regex step by step:

```tova
// Build a URL validation pattern
url_regex = regexBuilder()
  .literal("https://")
  .oneOf("a-zA-Z0-9.-")
  .oneOrMore()
  .literal(".")
  .oneOf("a-zA-Z")
  .oneOrMore()
  .build()

regexTest("https://tova.dev", url_regex)     // true
regexTest("not-a-url", url_regex)            // false
```

`regex_builder` returns a builder object with chainable methods: `.literal(s)`, `.digits(n)`, `.word()`, `.space()`, `.any()`, `.oneOf(chars)`, `.group(name)`, `.endGroup()`, `.optional()`, `.oneOrMore()`, `.zeroOrMore()`, `.startOfLine()`, `.endOfLine()`, `.flags(f)`, `.build()`, `.test(s)`, and `.match(s)`. Quantifier methods like `.oneOrMore()` apply to the preceding element. This is more readable than writing raw regex strings for complex patterns.

### String Validation Helpers

Tova includes common validation functions:

```tova
isEmail("alice@test.com")    // true
isUrl("https://tova.dev")   // true
isUuid("550e8400-e29b-41d4-a716-446655440000")   // true
isNumeric("42.5")            // true
isAlpha("hello")             // true
isAlphanumeric("abc123")     // true
isHex("ff00aa")              // true
```

::: tip When to Use Regex vs. String Functions
Use string functions (`contains`, `startsWith`, `split`) for simple patterns. Use regex for complex patterns involving repetition, alternation, or capturing groups. String functions are faster and more readable for simple cases.
:::

### Additional String Functions

Tova also provides case conversion utilities:

```tova
snakeCase("helloWorld")      // "hello_world"
camelCase("hello_world")     // "helloWorld"
kebabCase("helloWorld")      // "hello-world"
capitalize("hello world")    // "Hello world"
titleCase("hello world")    // "Hello World"
```

And text manipulation tools:

```tova
words("hello world foo")      // ["hello", "world", "foo"]
lines("line1\nline2\nline3") // ["line1", "line2", "line3"]
reverseStr("hello")          // "olleh"
wordWrap("long text...", 40) // Wraps at 40 chars
indentStr("hello", 4)       // "    hello"
dedent("    hello")           // "hello"
escapeHtml("<script>")       // "&lt;script&gt;"
unescapeHtml("&lt;script&gt;")   // "<script>"
```

## Project: Mini Template Engine

Let's build a template engine that replaces `%placeholder%` markers with actual values:

```tova
fn render_template(template, data) {
  var tpl = template

  for entry in entries(data) {
    placeholder = "%{entry[0]}%"
    tpl = replace(tpl, placeholder, toString(entry[1]))
  }

  tpl
}

// Use it
greeting = render_template(
  "Hello, %name%! You have %count% new messages.",
  { name: "Alice", count: 5 }
)
print(greeting)
// "Hello, Alice! You have 5 new messages."

// Generate HTML
card = render_template(
  "<div class='card'><h2>%title%</h2><p>%body%</p></div>",
  { title: "Welcome", body: "Getting started with Tova" }
)
print(card)
```

<TryInPlayground :code="templateCode" label="Template Engine" />

## Exercises

**Exercise 4.1:** Write a `caesar_cipher(text, shift)` function that shifts each letter by `shift` positions in the alphabet. Handle both uppercase and lowercase. Non-letter characters stay unchanged. Then write `caesar_decipher` that reverses it.

**Exercise 4.2:** Write a `count_vowels(text)` function and a `count_consonants(text)` function. Then write `text_stats(text)` that returns an object with `{ vowels, consonants, spaces, digits, other }`.

**Exercise 4.3:** Write a `formatNumber(n)` function that adds comma separators: `formatNumber(1234567)` returns `"1,234,567"`. Handle negative numbers too.

## Challenge

Build a **Markdown to plain text converter** that handles:
1. Headers (`# text` → `TEXT`, `## text` → `text`)
2. Bold (`**text**` → `text`)
3. Italic (`*text*` → `text`)
4. Links (`[text](url)` → `text (url)`)
5. Code blocks (` `` `text` `` ` → `text`)

Process the text line by line, using string pattern matching and the string functions you've learned. Test it with a sample Markdown document.

---

[← Previous: Mastering Collections](./collections) | [Next: Pattern Matching Power →](./pattern-matching)
