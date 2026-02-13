# Syntax

This page documents the lexical elements of the Lux programming language -- the fundamental building blocks from which all programs are composed.

## Comments

Lux supports three styles of comments:

```lux
// Line comment -- everything to the end of the line is ignored

/// Docstring comment -- preserved as metadata for tooling

/* Block comment
   can span multiple lines */
```

Block comments are **nestable**. The following is valid:

```lux
/* outer comment
   /* nested comment */
   still in the outer comment
*/
```

Line comments (`//`) and docstring comments (`///`) extend to the end of the line. Block comments (`/* ... */`) can span any number of lines and can be nested to any depth, making them useful for temporarily disabling large sections of code.

## Identifiers

Identifiers name variables, functions, types, and other declarations. An identifier starts with a letter (a-z, A-Z) or underscore (`_`), followed by zero or more letters, digits (0-9), or underscores:

```
my_var
_private
counter2
MyType
HttpRequest
_
```

Identifiers are case-sensitive: `myVar` and `MyVar` are distinct names. By convention, variables and functions use `snake_case`, while types use `PascalCase`.

Unicode letters are also supported in identifiers for international use.

## Number Literals

### Integers and Floats

```lux
42              // integer
3.14            // float
0               // zero
```

### Underscore Separators

Underscores can be placed between digits for readability. They are ignored by the compiler:

```lux
1_000_000       // one million
3.141_592_653   // pi with separators
```

### Alternate Bases

```lux
0xFF            // hexadecimal (255)
0XFF            // uppercase prefix also valid
0b1010          // binary (10)
0B1010          // uppercase prefix also valid
0o755           // octal (493)
0O755           // uppercase prefix also valid
```

Underscore separators work with alternate bases as well:

```lux
0xFF_FF         // hex with separator
0b1010_0101     // binary with separator
0o77_55         // octal with separator
```

### Scientific Notation

```lux
1.5e10          // 1.5 * 10^10
2.5E-3          // 2.5 * 10^-3
1e6             // 1_000_000
3E+4            // 30_000
```

## String Literals

Lux has two kinds of string literals, distinguished by their quote character.

### Double-Quoted Strings (with interpolation)

Double-quoted strings support **string interpolation** using `{expression}`:

```lux
name = "Alice"
greeting = "Hello, {name}!"             // "Hello, Alice!"
math = "1 + 2 = {1 + 2}"               // "1 + 2 = 3"
nested = "Items: {len(items)}"           // function calls in interpolation
complex = "Result: {if x > 0 { "positive" } else { "negative" }}"
```

Any valid Lux expression can appear inside `{...}` within a double-quoted string.

### Single-Quoted Strings (no interpolation)

Single-quoted strings are literal -- no interpolation is performed:

```lux
pattern = 'no {interpolation} here'     // literal text: no {interpolation} here
regex_like = 'hello\nworld'             // escape sequences still work
```

### Escape Sequences

Both string types support the following escape sequences:

| Sequence | Meaning |
|----------|---------|
| `\n` | Newline |
| `\t` | Tab |
| `\r` | Carriage return |
| `\\` | Literal backslash |
| `\"` | Literal double quote |
| `\'` | Literal single quote |
| `\{` | Literal `{` (prevents interpolation in double-quoted strings) |

Example:

```lux
escaped = "She said \"hello\""
path = "C:\\Users\\name"
literal_brace = "Use \{curly braces\} literally"
```

## Boolean Literals

The two boolean values:

```lux
is_active = true
is_deleted = false
```

Booleans are their own type (`Bool`), distinct from integers. There is no implicit conversion between `Bool` and numeric types.

## Nil

The `nil` literal represents the absence of a value:

```lux
result = nil
```

`nil` is its own type (`Nil`). It is the equivalent of JavaScript's `null`.

## Semicolons

Semicolons are **optional** in Lux. Newlines serve as statement terminators:

```lux
// Idiomatic Lux -- no semicolons needed
x = 10
y = 20
z = x + y
```

Semicolons can be used to place multiple statements on a single line:

```lux
x = 10; y = 20; z = x + y
```

In practice, semicolons are rarely used. The convention is to write one statement per line.

## Implicit Returns

The last expression in a function body is automatically returned. There is no need for an explicit `return` statement:

```lux
fn double(x) {
  x * 2            // implicitly returned
}

fn greet(name) {
  "Hello, {name}!" // implicitly returned
}
```

Explicit `return` is supported for early exits:

```lux
fn abs(x) {
  if x < 0 {
    return -x
  }
  x
}
```

When a function body ends with a statement that has no value (such as a `for` loop or assignment), the return value is `nil`.

## Newline Sensitivity

Lux is newline-sensitive in certain contexts. A `[` on a new line is **not** treated as a subscript of the previous expression:

```lux
x = foo
[1, 2, 3]       // this is a new array expression, NOT foo[1, 2, 3]
```

This design avoids common ambiguities found in languages with optional semicolons.
