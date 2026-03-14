# Strings

Tova provides a rich set of string manipulation functions. All string functions are non-mutating -- they return new strings.

## Method Syntax

String functions can be called in two ways:

```tova
// Standalone function call
upper("hello")          // "HELLO"

// Method call on a string
"hello".upper()         // "HELLO"
```

Both forms are equivalent. The method syntax is often more readable when chaining operations.

## String Interpolation

Tova strings support interpolation with `{}`:

```tova
name = "Alice"
age = 30
print("Hello, {name}! You are {age} years old.")
// Hello, Alice! You are 30 years old.

print("2 + 2 = {2 + 2}")
// 2 + 2 = 4
```

## String Repetition

The `*` operator repeats a string:

```tova
"-" * 40
// "----------------------------------------"

"ha" * 3
// "hahaha"
```

---

## Trimming & Splitting

### trim

```tova
trim(s) -> String
```

Removes whitespace from both ends of a string.

```tova
trim("  hello  ")       // "hello"
trim("\n\thello\n")     // "hello"
```

### trim_start

```tova
trimStart(s) -> String
```

Removes whitespace from the beginning of a string.

```tova
trimStart("  hello  ")    // "hello  "
```

### trim_end

```tova
trimEnd(s) -> String
```

Removes whitespace from the end of a string.

```tova
trimEnd("  hello  ")      // "  hello"
```

### split

```tova
split(s, sep) -> List[String]
```

Splits a string by a separator and returns an array of parts.

```tova
split("a,b,c", ",")            // ["a", "b", "c"]
split("hello world", " ")      // ["hello", "world"]
split("one::two::three", "::")  // ["one", "two", "three"]
```

### join

```tova
join(arr, sep) -> String
```

Joins an array of strings with a separator.

```tova
join(["a", "b", "c"], ", ")    // "a, b, c"
join(["hello", "world"], " ")  // "hello world"
join(["one", "two"], "")       // "onetwo"
```

### words

```tova
words(s) -> List[String]
```

Splits a string by whitespace, filtering out empty strings.

```tova
words("hello   world")          // ["hello", "world"]
words("  spaced  out  ")        // ["spaced", "out"]
```

### lines

```tova
lines(s) -> List[String]
```

Splits a string by newline characters.

```tova
lines("line1\nline2\nline3")   // ["line1", "line2", "line3"]
```

### chars

```tova
chars(s) -> List[String]
```

Splits a string into an array of individual characters.

```tova
chars("hello")                  // ["h", "e", "l", "l", "o"]
chars("abc") |> reversed() |> join("")  // "cba"
```

---

## Search & Test

### contains

```tova
contains(s, sub) -> Bool
```

Returns `true` if the string contains the given substring.

```tova
contains("hello world", "world")    // true
contains("hello world", "xyz")      // false

// Method syntax
"hello world".contains("ell")       // true
```

### starts_with

```tova
startsWith(s, prefix) -> Bool
```

Returns `true` if the string starts with the given prefix.

```tova
startsWith("hello", "hel")    // true
startsWith("hello", "world")  // false

"hello".startsWith("hel")     // true
```

### ends_with

```tova
endsWith(s, suffix) -> Bool
```

Returns `true` if the string ends with the given suffix.

```tova
endsWith("hello.tova", ".tova")     // true
endsWith("hello.tova", ".js")      // false

"photo.png".endsWith(".png")       // true
```

---

## Replacing

### replace

```tova
replace(s, from, to) -> String
```

Replaces occurrences in a string. When `from` is a plain string, **all** occurrences are replaced. When `from` is a regex, the **first** match is replaced.

```tova
replace("hello world", "world", "Tova")
// "hello Tova"

replace("aabbcc", "b", "x")
// "aaxxcc"
```

### replace_first

```tova
replaceFirst(s, from, to) -> String
```

Replaces only the first occurrence of `from` with `to`.

```tova
replaceFirst("aabb", "a", "x")    // "xabb"
replaceFirst("hello hello", "hello", "hi")  // "hi hello"
```

### repeat

```tova
repeat(s, n) -> String
```

Repeats a string `n` times.

```tova
repeat("ha", 3)         // "hahaha"
repeat("-", 20)          // "--------------------"
repeat("ab", 0)          // ""
```

---

## Padding

### pad_start

```tova
padStart(s, n, fill?) -> String
```

Pads the beginning of a string to reach length `n`. Uses spaces by default, or the optional `fill` character.

```tova
padStart("5", 3, "0")       // "005"
padStart("hi", 5)            // "   hi"
padStart("42", 5, ".")       // "...42"
```

### pad_end

```tova
padEnd(s, n, fill?) -> String
```

Pads the end of a string to reach length `n`.

```tova
padEnd("5", 3, "0")         // "500"
padEnd("hi", 5)              // "hi   "
```

---

## Character Access

### char_at

```tova
charAt(s, i) -> String | Nil
```

Returns the character at position `i`, or `nil` if out of bounds.

```tova
charAt("hello", 0)    // "h"
charAt("hello", 4)    // "o"
charAt("hello", 10)   // nil
```

---

## Case Conversion

### upper

```tova
upper(s) -> String
```

Converts a string to uppercase.

```tova
upper("hello")           // "HELLO"
"hello".upper()          // "HELLO"
```

### lower

```tova
lower(s) -> String
```

Converts a string to lowercase.

```tova
lower("HELLO")           // "hello"
"HELLO".lower()          // "hello"
```

### capitalize

```tova
capitalize(s) -> String
```

Uppercases the first letter of the string.

```tova
capitalize("hello")      // "Hello"
capitalize("hello world")  // "Hello world"
```

### title_case

```tova
titleCase(s) -> String
```

Uppercases the first letter of each word.

```tova
titleCase("hello world")       // "Hello World"
titleCase("the quick brown fox")  // "The Quick Brown Fox"
```

### snake_case

```tova
snakeCase(s) -> String
```

Converts a string to `snake_case`. Handles camelCase, spaces, and hyphens.

```tova
snakeCase("helloWorld")         // "hello_world"
snakeCase("Hello World")        // "hello_world"
snakeCase("some-thing")         // "some_thing"
snakeCase("XMLParser")          // "xmlparser"
```

### camel_case

```tova
camelCase(s) -> String
```

Converts a string to `camelCase`. Handles snake_case, spaces, and hyphens.

```tova
camelCase("hello_world")       // "helloWorld"
camelCase("Hello World")       // "helloWorld"
camelCase("some-thing")        // "someThing"
```

### kebab_case

```tova
kebabCase(s) -> String
```

Converts a string to `kebab-case`. Handles camelCase, spaces, and underscores.

```tova
kebabCase("helloWorld")         // "hello-world"
kebabCase("Hello World")        // "hello-world"
kebabCase("some_thing")         // "some-thing"
```

---

## Searching & Counting

### index_of

```tova
indexOf(s, sub) -> Int | Nil
```

Returns the position of the first occurrence of `sub` in `s`. Returns `nil` if not found.

```tova
indexOf("hello world", "world")    // 6
indexOf("abcabc", "bc")            // 1
indexOf("hello", "xyz")            // nil
```

### last_index_of

```tova
lastIndexOf(s, sub) -> Int | Nil
```

Returns the position of the last occurrence of `sub` in `s`. Returns `nil` if not found.

```tova
lastIndexOf("abcabc", "bc")      // 4
lastIndexOf("hello", "l")         // 3
lastIndexOf("hello", "xyz")       // nil
```

### count_of

```tova
countOf(s, sub) -> Int
```

Counts the number of non-overlapping occurrences of `sub` in `s`.

```tova
countOf("banana", "an")            // 2
countOf("mississippi", "s")        // 4
countOf("hello", "xyz")            // 0
```

---

## Substrings & Transformation

### substr

```tova
substr(s, start, end?) -> String
```

Extracts a portion of the string from `start` to `end` (exclusive). If `end` is omitted, extracts to the end of the string. Supports negative indices.

```tova
substr("hello world", 6)           // "world"
substr("hello world", 0, 5)        // "hello"
substr("hello", -3)                 // "llo"
```

### reverse_str

```tova
reverseStr(s) -> String
```

Reverses a string.

```tova
reverseStr("hello")               // "olleh"
reverseStr("racecar")             // "racecar"
reverseStr("")                     // ""
```

### center

```tova
center(s, n, fill?) -> String
```

Center-pads a string to width `n`. Uses spaces by default, or the optional `fill` character. Returns the string unchanged if already wider.

```tova
center("hi", 6)                    // "  hi  "
center("hi", 7)                    // "  hi   "
center("hi", 6, "*")               // "**hi**"
center("hello", 3)                 // "hello"
```

### is_empty

```tova
isEmpty(v) -> Bool
```

Returns `true` if a value is empty. Works for strings, arrays, objects, and nil.

```tova
isEmpty("")                        // true
isEmpty("hello")                   // false
isEmpty([])                        // true
isEmpty({})                        // true
isEmpty(nil)                       // true
```

---

## Text Processing

### truncate

```tova
truncate(s, n, suffix?) -> String
```

Truncates a string to at most `n` characters, appending `suffix` (default `"..."`) if truncated.

```tova
truncate("Hello World", 8)            // "Hello..."
truncate("Hi", 10)                     // "Hi"
truncate("Hello World", 8, "..")       // "Hello .."
```

### word_wrap

```tova
wordWrap(s, width) -> String
```

Wraps text at word boundaries to fit within `width` characters per line.

```tova
wordWrap("one two three four", 10)
// "one two\nthree four"

wordWrap("the quick brown fox", 12)
// "the quick\nbrown fox"
```

### dedent

```tova
dedent(s) -> String
```

Removes common leading whitespace from all lines. Useful for cleaning up indented multi-line strings.

```tova
dedent("  hello\n  world")     // "hello\nworld"
dedent("    line1\n  line2")   // "  line1\nline2"
```

### indent_str

```tova
indentStr(s, n, ch?) -> String
```

Adds `n` repetitions of `ch` (default: space) to the beginning of each line.

```tova
indentStr("hello\nworld", 2)         // "  hello\n  world"
indentStr("a\nb", 1, ">")            // ">a\n>b"
```

### slugify

```tova
slugify(s) -> String
```

Converts a string to a URL-friendly slug: lowercased, special characters removed, spaces replaced with hyphens.

```tova
slugify("Hello World!")            // "hello-world"
slugify("A & B @ C")              // "a-b-c"
slugify("  My Blog Post  ")       // "my-blog-post"
```

### escape_html

```tova
escapeHtml(s) -> String
```

Escapes HTML special characters (`<`, `>`, `&`, `"`, `'`).

```tova
escapeHtml("<b>Hello</b>")
// "&lt;b&gt;Hello&lt;/b&gt;"

escapeHtml("a > b & c < d")
// "a &gt; b &amp; c &lt; d"
```

### unescape_html

```tova
unescapeHtml(s) -> String
```

Reverses HTML entity escaping.

```tova
unescapeHtml("&lt;b&gt;Hello&lt;/b&gt;")
// "<b>Hello</b>"
```

### fmt

```tova
fmt(template, ...args) -> String
```

Simple placeholder formatting. Replaces `{}` placeholders with arguments in order.

```tova
fmt("Hello, {}!", "world")         // "Hello, world!"
fmt("{} + {} = {}", 1, 2, 3)      // "1 + 2 = 3"
fmt("{} items at ${}", 3, 9.99)   // "3 items at $9.99"
```

---

## Pipeline Examples

String functions work naturally with the pipe operator `|>`:

```tova
// Clean and normalize user input
input
  |> trim()
  |> lower()
  |> replace("  ", " ")

// Parse CSV line
"Alice,30,Engineer"
  |> split(",")
  |> enumerate()
// [[0, "Alice"], [1, "30"], [2, "Engineer"]]

// Build a slug from a title
"Hello World! This is Tova."
  |> slugify()
// "hello-world-this-is-tova"

// Count vowels
"hello world"
  |> chars()
  |> filter(fn(c) contains("aeiou", c))
  |> len()
// 3

// Escape user input for HTML
user_input
  |> trim()
  |> escapeHtml()
```

## String Concatenation

Use string interpolation for concatenation. The `+` operator works but produces a type warning:

```tova
// Interpolation (preferred -- no warnings)
greeting = "Hello, {name}!"

// Plus operator (works but produces a compiler warning)
"hello" + " " + "world"   // "hello world"
```

The `++` operator is available in **match patterns** for string prefix matching:

```tova
match url {
  "/api/" ++ rest => handle_api(rest)
  _ => not_found()
}
```

## Terminal Formatting

Functions for styling text output in the terminal.

### color

```tova
color(text, colorName) -> String
```

Wraps text with ANSI color codes for terminal output. Supported colors include `"red"`, `"green"`, `"blue"`, `"yellow"`, `"cyan"`, `"magenta"`, `"white"`, `"gray"`.

```tova
print(color("Error!", "red"))
print(color("Success", "green"))
print(color("Warning", "yellow"))
```

### bold

```tova
bold(text) -> String
```

Wraps text with ANSI bold codes for terminal output.

```tova
print(bold("Important message"))
print(bold(color("Error!", "red")))
```

### dim

```tova
dim(text) -> String
```

Wraps text with ANSI dim codes for terminal output.

```tova
print(dim("Less important info"))
print(dim("(optional)"))
```
