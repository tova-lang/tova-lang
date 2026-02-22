# Syntax

This page documents the lexical elements of the Tova programming language -- the fundamental building blocks from which all programs are composed.

## Shebang

Tova source files may begin with a shebang line for use as executable scripts. The shebang is ignored by the compiler:

```tova
#!/usr/bin/env tova

print("Hello from a Tova script!")
```

## Comments

Tova supports three styles of comments:

```tova
// Line comment -- everything to the end of the line is ignored

/// Docstring comment -- preserved as metadata for tooling

/* Block comment
   can span multiple lines */
```

Block comments are **nestable**. The following is valid:

```tova
/* outer comment
   /* nested comment */
   still in the outer comment
*/
```

Line comments (`//`) and docstring comments (`///`) extend to the end of the line. Block comments (`/* ... */`) can span any number of lines and can be nested to any depth, making them useful for temporarily disabling large sections of code.

### Docstrings

Docstring comments (`///`) are preserved in the AST and attach to the following declaration. They provide documentation metadata used by tooling (LSP hover info, generated docs):

```tova
/// Calculates the distance between two points.
/// Returns the Euclidean distance as a Float.
fn distance(a: Point, b: Point) -> Float {
  sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

/// A user in the system.
type User {
  id: Int
  name: String
  email: String
}
```

Multiple consecutive `///` lines are combined into a single docstring.

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

```tova
42              // integer
3.14            // float
0               // zero
```

### Underscore Separators

Underscores can be placed between digits for readability. They are ignored by the compiler:

```tova
1_000_000       // one million
3.141_592_653   // pi with separators
```

### Alternate Bases

```tova
0xFF            // hexadecimal (255)
0XFF            // uppercase prefix also valid
0b1010          // binary (10)
0B1010          // uppercase prefix also valid
0o755           // octal (493)
0O755           // uppercase prefix also valid
```

Underscore separators work with alternate bases as well:

```tova
0xFF_FF         // hex with separator
0b1010_0101     // binary with separator
0o77_55         // octal with separator
```

### Scientific Notation

```tova
1.5e10          // 1.5 * 10^10
2.5E-3          // 2.5 * 10^-3
1e6             // 1_000_000
3E+4            // 30_000
```

## String Literals

Tova has two kinds of string literals, distinguished by their quote character.

### Double-Quoted Strings (with interpolation)

Double-quoted strings support **string interpolation** using `{expression}`:

```tova
name = "Alice"
greeting = "Hello, {name}!"             // "Hello, Alice!"
math = "1 + 2 = {1 + 2}"               // "1 + 2 = 3"
nested = "Items: {len(items)}"           // function calls in interpolation
complex = "Result: {if x > 0 { "positive" } else { "negative" }}"
```

Any valid Tova expression can appear inside `{...}` within a double-quoted string.

### Single-Quoted Strings (no interpolation)

Single-quoted strings are literal -- no interpolation is performed:

```tova
pattern = 'no {interpolation} here'     // literal text: no {interpolation} here
regex_like = 'hello\nworld'             // escape sequences still work
```

### Escape Sequences

Both string types support these common escape sequences:

| Sequence | Meaning |
|----------|---------|
| `\n` | Newline |
| `\t` | Tab |
| `\r` | Carriage return |
| `\\` | Literal backslash |

Each string type also supports escaping its own delimiter and interpolation characters:

| Sequence | Meaning | String type |
|----------|---------|-------------|
| `\"` | Literal double quote | Double-quoted only |
| `\'` | Literal single quote | Single-quoted only |
| `\{` | Literal `{` (prevents interpolation) | Double-quoted only |
| `\}` | Literal `}` | Double-quoted only |

Example:

```tova
escaped = "She said \"hello\""
path = "C:\\Users\\name"
literal_brace = "Use \{curly braces\} literally"
```

### Triple-Quoted Strings

Triple-quoted strings `"""..."""` span multiple lines and support interpolation. Indentation is automatically dedented based on the position of the closing `"""`:

```tova
message = """
  Hello, {name}!
  Welcome to Tova.
  """
```

### Raw Strings

Prefix a string with `r` to disable escape sequence processing. Backslashes are treated as literal characters:

```tova
path = r"C:\Users\Alice\Documents"
regex_str = r"\d+\.\d+"
```

### F-Strings

The `f` prefix explicitly marks a string as interpolated. Semantically identical to a regular double-quoted string:

```tova
greeting = f"Hello, {name}!"
```

### Regex Literals

Regex literals use `/pattern/flags` syntax and compile to JavaScript `RegExp` objects:

```tova
digits = /\d+/g
email_re = /^[\w.]+@[\w.]+\.\w+$/i
```

Available flags: `g` (global), `i` (case-insensitive), `m` (multiline), `s` (dotAll), `u` (unicode), `y` (sticky).

## Boolean Literals

The two boolean values:

```tova
is_active = true
is_deleted = false
```

Booleans are their own type (`Bool`), distinct from integers. There is no implicit conversion between `Bool` and numeric types.

## Nil

The `nil` literal represents the absence of a value:

```tova
result = nil
```

`nil` is its own type (`Nil`). It is the equivalent of JavaScript's `null`.

## Semicolons

Semicolons are **optional** in Tova. Newlines serve as statement terminators:

```tova
// Idiomatic Tova -- no semicolons needed
x = 10
y = 20
z = x + y
```

Semicolons can be used to place multiple statements on a single line:

```tova
x = 10; y = 20; z = x + y
```

In practice, semicolons are rarely used. The convention is to write one statement per line.

## Implicit Returns

The last expression in a function body is automatically returned. There is no need for an explicit `return` statement:

```tova
fn double(x) {
  x * 2            // implicitly returned
}

fn greet(name) {
  "Hello, {name}!" // implicitly returned
}
```

Explicit `return` is supported for early exits:

```tova
fn abs(x) {
  if x < 0 {
    return -x
  }
  x
}
```

When a function body ends with a statement that has no value (such as a `for` loop or assignment), the return value is `nil`.

## Newline Sensitivity

Tova is newline-sensitive in certain contexts. A `[` on a new line is **not** treated as a subscript of the previous expression:

```tova
x = foo
[1, 2, 3]       // this is a new array expression, NOT foo[1, 2, 3]
```

This design avoids common ambiguities found in languages with optional semicolons.
