# Strings

Lux provides a rich set of string manipulation functions. All string functions are non-mutating -- they return new strings.

## Method Syntax

String functions can be called in two ways:

```lux
// Standalone function call
upper("hello")          // "HELLO"

// Method call on a string
"hello".upper()         // "HELLO"
```

Both forms are equivalent. The method syntax is often more readable when chaining operations.

## String Interpolation

Lux strings support interpolation with `{}`:

```lux
name = "Alice"
age = 30
print("Hello, {name}! You are {age} years old.")
// Hello, Alice! You are 30 years old.

print("2 + 2 = {2 + 2}")
// 2 + 2 = 4
```

## String Repetition

The `*` operator repeats a string:

```lux
"-" * 40
// "----------------------------------------"

"ha" * 3
// "hahaha"
```

---

## Trimming & Splitting

### trim

```lux
trim(s) -> String
```

Removes whitespace from both ends of a string.

```lux
trim("  hello  ")       // "hello"
trim("\n\thello\n")     // "hello"
```

### split

```lux
split(s, sep) -> List[String]
```

Splits a string by a separator and returns an array of parts.

```lux
split("a,b,c", ",")            // ["a", "b", "c"]
split("hello world", " ")      // ["hello", "world"]
split("one::two::three", "::")  // ["one", "two", "three"]
```

### join

```lux
join(arr, sep) -> String
```

Joins an array of strings with a separator.

```lux
join(["a", "b", "c"], ", ")    // "a, b, c"
join(["hello", "world"], " ")  // "hello world"
join(["one", "two"], "")       // "onetwo"
```

### words

```lux
words(s) -> List[String]
```

Splits a string by whitespace, filtering out empty strings.

```lux
words("hello   world")          // ["hello", "world"]
words("  spaced  out  ")        // ["spaced", "out"]
```

### lines

```lux
lines(s) -> List[String]
```

Splits a string by newline characters.

```lux
lines("line1\nline2\nline3")   // ["line1", "line2", "line3"]
```

### chars

```lux
chars(s) -> List[String]
```

Splits a string into an array of individual characters.

```lux
chars("hello")                  // ["h", "e", "l", "l", "o"]
chars("abc") |> reversed() |> join("")  // "cba"
```

---

## Search & Test

### contains

```lux
contains(s, sub) -> Bool
```

Returns `true` if the string contains the given substring.

```lux
contains("hello world", "world")    // true
contains("hello world", "xyz")      // false

// Method syntax
"hello world".contains("ell")       // true
```

### starts_with

```lux
starts_with(s, prefix) -> Bool
```

Returns `true` if the string starts with the given prefix.

```lux
starts_with("hello", "hel")    // true
starts_with("hello", "world")  // false

"hello".starts_with("hel")     // true
```

### ends_with

```lux
ends_with(s, suffix) -> Bool
```

Returns `true` if the string ends with the given suffix.

```lux
ends_with("hello.lux", ".lux")     // true
ends_with("hello.lux", ".js")      // false

"photo.png".ends_with(".png")       // true
```

---

## Replacing

### replace

```lux
replace(s, from, to) -> String
```

Replaces occurrences in a string. When `from` is a plain string, **all** occurrences are replaced. When `from` is a regex, the **first** match is replaced.

```lux
replace("hello world", "world", "Lux")
// "hello Lux"

replace("aabbcc", "b", "x")
// "aaxxcc"
```

### repeat

```lux
repeat(s, n) -> String
```

Repeats a string `n` times.

```lux
repeat("ha", 3)         // "hahaha"
repeat("-", 20)          // "--------------------"
repeat("ab", 0)          // ""
```

---

## Case Conversion

### upper

```lux
upper(s) -> String
```

Converts a string to uppercase.

```lux
upper("hello")           // "HELLO"
"hello".upper()          // "HELLO"
```

### lower

```lux
lower(s) -> String
```

Converts a string to lowercase.

```lux
lower("HELLO")           // "hello"
"HELLO".lower()          // "hello"
```

### capitalize

```lux
capitalize(s) -> String
```

Uppercases the first letter of the string.

```lux
capitalize("hello")      // "Hello"
capitalize("hello world")  // "Hello world"
```

### title_case

```lux
title_case(s) -> String
```

Uppercases the first letter of each word.

```lux
title_case("hello world")       // "Hello World"
title_case("the quick brown fox")  // "The Quick Brown Fox"
```

### snake_case

```lux
snake_case(s) -> String
```

Converts a string to `snake_case`. Handles camelCase, spaces, and hyphens.

```lux
snake_case("helloWorld")         // "hello_world"
snake_case("Hello World")        // "hello_world"
snake_case("some-thing")         // "some_thing"
snake_case("XMLParser")          // "xml_parser"
```

### camel_case

```lux
camel_case(s) -> String
```

Converts a string to `camelCase`. Handles snake_case, spaces, and hyphens.

```lux
camel_case("hello_world")       // "helloWorld"
camel_case("Hello World")       // "helloWorld"
camel_case("some-thing")        // "someThing"
```

---

## Pipeline Examples

String functions work naturally with the pipe operator `|>`:

```lux
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
"Hello World! This is Lux."
  |> lower()
  |> replace("!", "")
  |> replace(".", "")
  |> words()
  |> join("-")
// "hello-world-this-is-lux"

// Count vowels
"hello world"
  |> chars()
  |> filter(fn(c) contains("aeiou", c))
  |> len()
// 3
```

## String Concatenation

Lux uses `++` for string concatenation:

```lux
"hello" ++ " " ++ "world"   // "hello world"

greeting = "Hello, " ++ name ++ "!"
```

For most cases, string interpolation is more readable:

```lux
greeting = "Hello, {name}!"
```
