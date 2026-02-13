# Strings

Lux provides two kinds of string literals and a rich set of built-in methods and standalone functions for working with text.

## String Literals

### Double-Quoted Strings (Interpolation)

Double-quoted strings support interpolation with `{expr}`:

```lux
name = "Alice"
greeting = "Hello, {name}!"           // "Hello, Alice!"
math = "1 + 2 = {1 + 2}"             // "1 + 2 = 3"
info = "User {name} has {len(items)} items"
```

Any valid expression can appear inside the braces:

```lux
result = "The answer is {if x > 0 { "positive" } else { "non-positive" }}"
list = "Items: {items.join(", ")}"
```

### Single-Quoted Strings (No Interpolation)

Single-quoted strings are literal -- no interpolation is performed:

```lux
pattern = 'no {interpolation} here'   // literal: no {interpolation} here
regex = '\d+\.\d+'
```

### Escape Sequences

Both string types support the following escape sequences:

| Sequence | Meaning |
|----------|---------|
| `\n` | Newline |
| `\t` | Tab |
| `\r` | Carriage return |
| `\\` | Backslash |
| `\"` | Double quote |
| `\'` | Single quote |
| `\{` | Literal `{` (prevents interpolation in double-quoted strings) |

```lux
multiline = "Line one\nLine two\nLine three"
path = "C:\\Users\\Alice\\Documents"
quoted = "She said \"hello\""
literal_brace = "Use \{braces} for interpolation"
```

## String Multiplication

Repeat a string by multiplying it with an integer:

```lux
separator = "-" * 40
// "----------------------------------------"

border = "=" * 60
indent = " " * 4
dots = "." * 20
```

This is useful for formatting output:

```lux
fn print_header(title) {
  line = "=" * len(title)
  print(line)
  print(title)
  print(line)
}

print_header("Report")
// ======
// Report
// ======
```

## Method-Style String Functions

Lux provides string manipulation through method calls on string values:

### Case Conversion

```lux
text = "hello world"

text.upper()          // "HELLO WORLD"
text.lower()          // "hello world"
text.capitalize()     // "Hello world"
text.title_case()     // "Hello World"
```

Converting between naming conventions:

```lux
name = "myVariableName"
name.snake_case()     // "my_variable_name"

name2 = "my_variable_name"
name2.camel_case()    // "myVariableName"
```

### Searching and Testing

```lux
text = "Hello, World!"

text.contains("World")       // true
text.starts_with("Hello")    // true
text.ends_with("!")          // true
text.contains("xyz")        // false
```

### Splitting into Parts

```lux
text = "Hello, World!"

text.chars()    // ["H", "e", "l", "l", "o", ",", " ", "W", "o", "r", "l", "d", "!"]
text.words()    // ["Hello,", "World!"]
text.lines()    // ["Hello, World!"]

multiline = "Line 1\nLine 2\nLine 3"
multiline.lines()    // ["Line 1", "Line 2", "Line 3"]
```

## Standalone String Functions

Lux also provides standalone functions that take a string as their first argument. These work well with the pipe operator:

### Trimming and Manipulating

```lux
padded = "  hello  "
trim(padded)              // "hello"

text = "hello world"
replace(text, "world", "Lux")   // "hello Lux"
repeat("ha", 3)                 // "hahaha"
```

### Splitting and Joining

```lux
csv = "alice,bob,carol"
split(csv, ",")           // ["alice", "bob", "carol"]

names = ["Alice", "Bob", "Carol"]
join(names, ", ")          // "Alice, Bob, Carol"
join(names, " and ")       // "Alice and Bob and Carol"
```

### Case Conversion (Standalone)

```lux
upper("hello")          // "HELLO"
lower("HELLO")          // "hello"
capitalize("hello")     // "Hello"
title_case("hello world")   // "Hello World"
snake_case("helloWorld")    // "hello_world"
camel_case("hello_world")  // "helloWorld"
```

### Searching (Standalone)

```lux
contains("hello world", "world")    // true
starts_with("hello", "hel")        // true
ends_with("hello", "llo")          // true
```

### Splitting into Parts (Standalone)

```lux
chars("hello")     // ["h", "e", "l", "l", "o"]
words("hello world")   // ["hello", "world"]
lines("a\nb\nc")       // ["a", "b", "c"]
```

## Using Strings with Pipes

The standalone functions are designed to work smoothly with the pipe operator `|>`:

```lux
result = "  Hello, World!  "
  |> trim()
  |> lower()
  |> replace("world", "lux")
  |> capitalize()
// "Hello, lux!"
```

```lux
csv_line = "  Alice , Bob , Carol  "
names = csv_line
  |> trim()
  |> split(",")
  |> map(fn(s) trim(s))
// ["Alice", "Bob", "Carol"]
```

## String Concatenation

Use the `++` operator or interpolation:

```lux
first = "Hello"
second = "World"

// Concatenation operator
greeting = first ++ ", " ++ second ++ "!"

// Interpolation (preferred for complex cases)
greeting = "{first}, {second}!"
```

::: tip
Prefer string interpolation over concatenation. `"Hello, {name}!"` is clearer and less error-prone than `"Hello, " ++ name ++ "!"`.
:::

## Practical Tips

**Choose the right quote style.** Use double quotes `"..."` when you need interpolation, and single quotes `'...'` for literal strings (regex patterns, templates where braces should not be interpreted).

**Use method-style calls for chaining on a known string:**

```lux
input.trim().lower().replace(" ", "_")
```

**Use standalone functions with pipes for data pipelines:**

```lux
data |> trim() |> split(",") |> map(fn(s) s.upper())
```

**String multiplication is great for formatting:**

```lux
fn table_row(label, value) {
  padding = " " * (20 - len(label))
  "{label}{padding}{value}"
}

print(table_row("Name", "Alice"))
print(table_row("Age", "30"))
// Name                Alice
// Age                 30
```
