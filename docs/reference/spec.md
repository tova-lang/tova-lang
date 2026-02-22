---
title: Language Specification
---

# Tova Language Specification

Version 0.3.0. This document is the formal reference for the Tova programming language. It covers lexical structure, syntax, type system, evaluation semantics, and the compilation model.

## 1. Lexical Structure

### 1.1 Source Encoding

Tova source files are UTF-8 encoded text with the `.tova` extension.

### 1.2 Line Terminators

Line terminators are `\n` (LF), `\r\n` (CRLF), or `\r` (CR). Newlines are significant: they serve as implicit statement terminators.

### 1.3 Comments

```ebnf
line_comment  = "//" { any_char } NEWLINE ;
doc_comment   = "///" { any_char } NEWLINE ;
block_comment = "/*" { any_char | block_comment } "*/" ;
```

- Line comments extend from `//` to end of line.
- Doc comments extend from `///` to end of line; they attach to the following declaration and are preserved in the AST.
- Block comments may nest.

### 1.4 Whitespace

Spaces (U+0020) and tabs (U+0009) are insignificant whitespace. They separate tokens but carry no semantic meaning. The lexer batches contiguous whitespace into a single skip operation.

### 1.5 Keywords

The following identifiers are reserved as keywords and may not be used as variable or function names:

```
and       as        async     await     bench     break
catch     client    component computed  continue  data
defer     derive    effect    elif      else      export
extern    false     finally   fn        for       from
guard     if        impl      import    in        interface
is        let       loop      match     nil       not
or        pipeline  pub       refresh   return    route
server    shared    source    state     store     test
trait     true      try       type      validate  var
when      while     with      yield
```

The following identifiers are contextual keywords, reserved only within `server {}` blocks for route declarations:

```
GET  POST  PUT  DELETE  PATCH  HEAD  OPTIONS
```

### 1.6 Identifiers

```ebnf
identifier = ( letter | "_" ) { letter | digit | "_" } ;
letter     = "a".."z" | "A".."Z" ;
digit      = "0".."9" ;
```

Identifiers are case-sensitive. By convention:
- `snake_case` for functions, variables, and parameters
- `PascalCase` for types, components, and stores
- `UPPER_SNAKE_CASE` for constants

### 1.7 Numeric Literals

```ebnf
number = decimal | hex | binary | octal ;

decimal = digit { digit | "_" } [ "." digit { digit | "_" } ]
          [ ( "e" | "E" ) [ "+" | "-" ] digit { digit } ] ;

hex     = "0" ( "x" | "X" ) hex_digit { hex_digit | "_" } ;
binary  = "0" ( "b" | "B" ) ( "0" | "1" ) { ( "0" | "1" ) | "_" } ;
octal   = "0" ( "o" | "O" ) oct_digit { oct_digit | "_" } ;
```

Underscores may appear between digits for readability: `1_000_000`, `0xFF_FF`. A number containing a decimal point or exponent is `Float`; otherwise it is `Int`.

### 1.8 String Literals

#### Double-Quoted Strings

```ebnf
double_string = '"' { char | escape | interpolation } '"' ;
interpolation = "{" expression "}" ;
```

Double-quoted strings support interpolation. Any expression inside `{...}` is evaluated and its string representation is inserted.

#### Single-Quoted Strings

```ebnf
single_string = "'" { char | escape } "'" ;
```

Single-quoted strings have no interpolation. Braces are literal.

#### Triple-Quoted Strings

```ebnf
triple_string = '"""' { any_char } '"""' ;
```

Triple-quoted strings preserve whitespace and span multiple lines. They support interpolation. Auto-dedent is applied based on the indentation of the closing `"""`.

#### F-Strings

```ebnf
f_string = "f" '"' { char | escape | interpolation } '"' ;
```

The `f` prefix explicitly marks a string as interpolated. Semantically identical to a regular double-quoted string.

#### Escape Sequences

| Sequence | Character |
|----------|-----------|
| `\n` | Newline (U+000A) |
| `\t` | Tab (U+0009) |
| `\r` | Carriage return (U+000D) |
| `\\` | Backslash |
| `\"` | Double quote |
| `\'` | Single quote |
| `\{` | Literal `{` (suppresses interpolation) |

### 1.9 Boolean Literals

```
true   false
```

### 1.10 Nil Literal

```
nil
```

Represents the absence of a value. Compiles to JavaScript `null`.

### 1.11 Operators

#### Arithmetic

| Operator | Operation | Precedence |
|----------|-----------|------------|
| `**` | Exponentiation | 12 (right-associative) |
| `*` | Multiplication | 11 |
| `/` | Division | 11 |
| `%` | Modulo | 11 |
| `+` | Addition | 10 |
| `-` | Subtraction / Negation | 10 / 13 (unary) |

#### String

| Operator | Operation |
|----------|-----------|
| `++` | String concatenation |
| `*` | String repetition (`"ab" * 3` = `"ababab"`) |

#### Comparison

| Operator | Operation |
|----------|-----------|
| `==` | Equality (strict) |
| `!=` | Inequality |
| `<` | Less than |
| `<=` | Less than or equal |
| `>` | Greater than |
| `>=` | Greater than or equal |

Comparisons may be chained: `1 < x < 10` is equivalent to `1 < x and x < 10`.

#### Logical

| Operator | Keyword Form | Operation |
|----------|-------------|-----------|
| `&&` | `and` | Logical AND (short-circuit) |
| `\|\|` | `or` | Logical OR (short-circuit) |
| `!` | `not` | Logical NOT |

Both symbol and keyword forms are accepted. The keyword forms (`and`, `or`, `not`) are preferred.

#### Assignment

| Operator | Operation |
|----------|-----------|
| `=` | Assignment |
| `+=` | Add-assign |
| `-=` | Subtract-assign |
| `*=` | Multiply-assign |
| `/=` | Divide-assign |
| `%=` | Modulo-assign |

#### Other

| Operator | Operation |
|----------|-----------|
| `\|>` | Pipe (passes left as first argument to right) |
| `=>` | Arrow (match arms, route handlers) |
| `->` | Return type annotation |
| `..` | Range (exclusive end) |
| `..=` | Range (inclusive end) |
| `...` | Spread / rest |
| `?` | Optional type suffix |
| `?.` | Optional chaining |
| `??` | Null coalescing |
| `?` (postfix) | Error propagation (unwrap-or-return) |
| `::` | Namespace access |

### 1.12 Delimiters

```
(  )  {  }  [  ]  ,  ;  :
```

### 1.13 Operator Precedence (Lowest to Highest)

| Level | Operators | Associativity |
|-------|-----------|---------------|
| 1 | `\|>` | Left |
| 2 | `??` | Left |
| 3 | `or`, `\|\|` | Left |
| 4 | `and`, `&&` | Left |
| 5 | `not`, `!` (prefix) | Right (unary) |
| 6 | `==`, `!=`, `<`, `<=`, `>`, `>=` | Left (chainable) |
| 7 | `in`, `not in` | Left |
| 8 | `..`, `..=` | Non-associative |
| 9 | `+`, `-` | Left |
| 10 | `*`, `/`, `%` | Left |
| 11 | `**` | Right |
| 12 | `-` (unary), `...` (spread) | Right (unary) |
| 13 | `.`, `()`, `[]`, `?.` | Left (postfix) |

## 2. Grammar

### 2.1 Program

```ebnf
program = { top_level } EOF ;

top_level = server_block | client_block | shared_block
          | data_block | test_block
          | import_declaration | statement ;
```

A Tova program is a sequence of top-level blocks and statements.

### 2.2 Blocks

```ebnf
server_block = "server" [ STRING ] "{" { server_statement } "}" ;
client_block = "client" [ STRING ] "{" { client_statement } "}" ;
shared_block = "shared" [ STRING ] "{" { statement } "}" ;
data_block   = "data"   [ STRING ] "{" { data_statement } "}" ;
test_block   = "test"   [ STRING ] "{" { statement } "}" ;
```

The optional string after the block keyword is a name, used for named server blocks (multi-server architecture).

### 2.3 Statements

```ebnf
statement = assignment | var_declaration | let_destructure
          | function_declaration | type_declaration
          | import_declaration | return_statement
          | if_statement | for_statement | while_statement
          | guard_statement | defer_statement
          | try_catch_statement | with_statement
          | expression_statement ;
```

#### Variable Binding

```ebnf
assignment     = target { "," target } "=" expression { "," expression } ;
var_declaration = "var" target { "," target } "=" expression { "," expression } ;
target          = IDENTIFIER [ ":" type_annotation ] ;
```

Plain assignment creates an immutable binding. `var` creates a mutable binding.

Multiple assignment: `a, b = 1, 2` binds `a` to `1` and `b` to `2`.

#### Destructuring

```ebnf
let_destructure = "let" pattern "=" expression ;

pattern = object_pattern | array_pattern | tuple_pattern ;

object_pattern = "{" field_pattern { "," field_pattern } "}" ;
field_pattern  = IDENTIFIER [ ":" IDENTIFIER ] [ "=" expression ] ;

array_pattern  = "[" [ IDENTIFIER { "," IDENTIFIER } [ "," "..." IDENTIFIER ] ] "]" ;

tuple_pattern  = "(" IDENTIFIER { "," IDENTIFIER } ")" ;
```

#### Function Declaration

```ebnf
function_declaration = [ "async" ] "fn" IDENTIFIER
                       [ "<" type_params ">" ]
                       "(" [ param_list ] ")"
                       [ "->" type_annotation ]
                       block ;

param_list  = param { "," param } ;
param       = ( IDENTIFIER | object_pattern | array_pattern )
              [ ":" type_annotation ] [ "=" expression ] ;
type_params = IDENTIFIER { "," IDENTIFIER } ;
```

Functions support:
- Optional `async` prefix
- Optional generic type parameters
- Destructured parameters
- Default parameter values
- Optional return type annotation
- Implicit return (last expression)

#### Type Declaration

```ebnf
type_declaration = "type" IDENTIFIER [ "<" type_params ">" ]
                   ( "=" type_alias | "{" type_body "}" )
                   [ "derive" "[" IDENTIFIER { "," IDENTIFIER } "]" ] ;

type_alias = type_annotation
           | type_annotation "|" type_annotation { "|" type_annotation }  (* union *)
           | type_annotation "where" "{" { predicate } "}" ;             (* refinement *)

type_body  = { variant | field } ;
variant    = IDENTIFIER [ "(" field_list ")" ] ;
field      = IDENTIFIER ":" type_annotation ;
field_list = field { "," field } ;
```

Types come in several forms:
- **Struct** (product type): named fields only
- **ADT** (sum type): named variants, optionally with payloads
- **Mixed**: variants and fields in the same type
- **Alias**: `type Name = OtherType`
- **Union**: `type Name = A | B | C`
- **Refinement**: `type Name = Base where { predicates }`

#### Control Flow

```ebnf
if_statement = "if" expression block
               { "elif" expression block }
               [ "else" block ] ;

for_statement = "for" IDENTIFIER [ "," IDENTIFIER ] "in" expression block
                [ "else" block ] ;

while_statement = "while" expression block ;

guard_statement = "guard" expression "else" block ;

defer_statement = "defer" ( block | expression ) ;

with_statement = "with" expression "as" IDENTIFIER block ;
```

The `for...else` construct: the `else` block runs if the loop completes without a `break`.

#### Try / Catch / Finally

```ebnf
try_catch = "try" block
            "catch" [ IDENTIFIER ] block
            [ "finally" block ] ;
```

#### Import

```ebnf
import_declaration = "import" ( import_specifiers "from" STRING
                              | IDENTIFIER "from" STRING ) ;
import_specifiers  = "{" import_spec { "," import_spec } "}" ;
import_spec        = IDENTIFIER [ "as" IDENTIFIER ] ;
```

### 2.4 Server Statements

In addition to regular statements, server blocks support:

```ebnf
route_declaration = "route" HTTP_METHOD STRING
                    [ "with" decorator_list ]
                    [ "body:" type_annotation ]
                    [ "->" type_annotation ]
                    "=>" expression ;

route_group = "routes" STRING [ route_metadata ] "{" { server_statement } "}" ;

route_metadata = { IDENTIFIER ":" expression } ;

decorator_list = IDENTIFIER [ "(" expression_list ")" ]
                 { "," IDENTIFIER [ "(" expression_list ")" ] } ;

db_declaration    = "db" "{" key_value_list "}" ;
model_declaration = "model" IDENTIFIER [ "{" key_value_list "}" ] ;
cors_declaration  = "cors" "{" key_value_list "}" ;
auth_declaration  = "auth" "{" key_value_list "}" ;

middleware_declaration = "middleware" "fn" IDENTIFIER "(" param_list ")" block ;

ws_declaration = "ws" "{" { ws_handler } "}" ;
ws_handler = ( "on_open" | "on_message" | "on_close" | "on_error" )
             "fn" "(" param_list ")" block ;

sse_declaration = "sse" STRING "fn" "(" param_list ")" block ;

static_declaration = "static" STRING "=>" STRING [ "fallback" STRING ] ;
env_declaration    = "env" IDENTIFIER ":" type_annotation [ "=" expression ] ;

schedule_declaration   = "schedule" STRING "fn" [ IDENTIFIER ] "(" [ param_list ] ")" block ;
background_declaration = "background" "fn" IDENTIFIER "(" [ param_list ] ")" block ;

lifecycle_hook = ( "on_start" | "on_stop" ) "fn" "(" [ param_list ] ")" block ;
```

### 2.5 Client Statements

```ebnf
state_declaration    = "state" IDENTIFIER [ ":" type_annotation ] "=" expression ;
computed_declaration = "computed" IDENTIFIER "=" expression ;
effect_declaration   = "effect" block ;

component_declaration = "component" IDENTIFIER [ "(" [ param_list ] ")" ] "{" component_body "}" ;
component_body = { jsx_element | statement | style_block } ;

store_declaration = "store" IDENTIFIER "{" { state_declaration | computed_declaration | function_declaration } "}" ;
```

### 2.6 Expressions

```ebnf
expression = pipe_expr ;

pipe_expr      = null_coalesce { "|>" pipe_target } ;
pipe_target    = null_coalesce | "." IDENTIFIER "(" [ arg_list ] ")" ;

null_coalesce  = logical_or { "??" logical_or } ;
logical_or     = logical_and { ( "or" | "||" ) logical_and } ;
logical_and    = logical_not { ( "and" | "&&" ) logical_not } ;
logical_not    = ( "not" | "!" ) logical_not | comparison ;
comparison     = membership { ( "<" | "<=" | ">" | ">=" | "==" | "!=" ) membership } ;
membership     = range_expr { ( "in" | "not" "in" ) range_expr } ;
range_expr     = addition [ ( ".." | "..=" ) addition ] ;
addition       = multiplication { ( "+" | "-" ) multiplication } ;
multiplication = power { ( "*" | "/" | "%" ) power } ;
power          = unary [ "**" power ] ;
unary          = ( "-" | "..." ) unary | postfix ;
postfix        = primary { call | member | index | optional_chain | error_prop } ;

call           = "(" [ arg_list ] ")" ;
member         = "." ( IDENTIFIER | NUMBER ) ;
index          = "[" ( expression | slice ) "]" ;
slice          = [ expression ] ":" [ expression ] [ ":" [ expression ] ] ;
optional_chain = "?." IDENTIFIER ;
error_prop     = "!" ;

arg_list = arg { "," arg } ;
arg      = [ IDENTIFIER ":" ] expression | "..." expression ;
```

#### Primary Expressions

```ebnf
primary = NUMBER | STRING | "true" | "false" | "nil"
        | IDENTIFIER
        | "(" expression ")"
        | array_literal | object_literal
        | lambda | match_expression | if_expression ;

array_literal = "[" [ comprehension | expression_list ] "]" ;
comprehension = expression "for" IDENTIFIER [ "," IDENTIFIER ] "in" expression [ "if" expression ] ;

object_literal = "{" [ dict_comprehension | entry_list ] "}" ;
dict_comprehension = expression ":" expression "for" IDENTIFIER [ "," IDENTIFIER ] "in" expression [ "if" expression ] ;
entry_list = entry { "," entry } ;
entry = ( IDENTIFIER | STRING | "[" expression "]" ) ":" expression
      | IDENTIFIER
      | "..." expression ;

lambda = "fn" "(" [ param_list ] ")" ( block | expression )
       | IDENTIFIER "=>" ( block | expression )
       | "(" param_list ")" "=>" ( block | expression ) ;

match_expression = "match" expression "{" { match_arm } "}" ;
match_arm = pattern [ "if" expression ] "=>" ( block | expression ) ;

if_expression = "if" expression block { "elif" expression block } "else" block ;
```

### 2.7 Patterns

```ebnf
pattern = literal_pattern | range_pattern | variant_pattern
        | array_pattern | tuple_pattern | object_pattern
        | string_concat_pattern | wildcard_pattern | binding_pattern ;

literal_pattern       = NUMBER | STRING | "true" | "false" | "nil" ;
range_pattern         = NUMBER ( ".." | "..=" ) NUMBER ;
variant_pattern       = IDENTIFIER "(" [ IDENTIFIER { "," IDENTIFIER } ] ")" ;
array_pattern         = "[" [ pattern_element { "," pattern_element } ] "]" ;
pattern_element       = IDENTIFIER | "..." IDENTIFIER | "_" ;
tuple_pattern         = "(" pattern { "," pattern } ")" ;
object_pattern        = "{" field_pattern { "," field_pattern } "}" ;
string_concat_pattern = STRING "++" IDENTIFIER ;
wildcard_pattern      = "_" ;
binding_pattern       = IDENTIFIER ;
```

Pattern matching rules:
1. Patterns are tried top to bottom.
2. The first matching arm is selected.
3. Guards (`if expr`) are evaluated after structural matching.
4. The wildcard `_` matches any value without binding.
5. A bare identifier binds the matched value to that name.

### 2.8 Type Annotations

```ebnf
type_annotation = simple_type | array_type | function_type | tuple_type | union_type ;

simple_type   = IDENTIFIER [ "<" type_annotation { "," type_annotation } ">" ] [ "?" ] ;
array_type    = "[" type_annotation "]" ;
function_type = "(" [ type_annotation { "," type_annotation } ] ")" "->" type_annotation ;
tuple_type    = "(" type_annotation "," type_annotation { "," type_annotation } ")" ;
union_type    = type_annotation "|" type_annotation { "|" type_annotation } ;
```

The `?` suffix denotes an optional type: `String?` is shorthand for `String | Nil`.

### 2.9 JSX

```ebnf
jsx_element = jsx_self_closing | jsx_open_close | jsx_fragment ;

jsx_self_closing = "<" jsx_tag { jsx_attribute } "/>" ;
jsx_open_close   = "<" jsx_tag { jsx_attribute } ">" { jsx_child } "</" jsx_tag ">" ;
jsx_fragment     = "<>" { jsx_child } "</>" ;

jsx_tag = IDENTIFIER ;

jsx_attribute = IDENTIFIER [ "=" ( "{" expression "}" | STRING ) ]
              | directive "=" "{" expression "}"
              | "{" "..." expression "}" ;

directive = ( "on:" | "bind:" | "class:" | "style:" | "show" | "transition:" ) IDENTIFIER ;

jsx_child = jsx_element | jsx_text | "{" expression "}"
          | jsx_if | jsx_for ;

jsx_if  = "if" expression "{" { jsx_child } "}"
          { "elif" expression "{" { jsx_child } "}" }
          [ "else" "{" { jsx_child } "}" ] ;

jsx_for = "for" IDENTIFIER [ "," IDENTIFIER ] "in" expression
          [ "key" "=" "{" expression "}" ]
          "{" { jsx_child } "}" ;
```

JSX compiles to DOM creation calls in the Tova reactive runtime. Text inside JSX elements may be unquoted.

## 3. Type System

### 3.1 Primitive Types

| Type | Values | JavaScript Equivalent |
|------|--------|----------------------|
| `Int` | Integer numbers | `number` (integer subset) |
| `Float` | Floating-point numbers | `number` |
| `String` | Text strings | `string` |
| `Bool` | `true`, `false` | `boolean` |
| `Nil` | `nil` | `null` |

### 3.2 Compound Types

| Type Syntax | Description |
|-------------|-------------|
| `[T]` | Array of `T` |
| `(A, B, C)` | Tuple of `A`, `B`, `C` |
| `(A, B) -> R` | Function from `(A, B)` to `R` |
| `T?` | Optional: `T \| Nil` |
| `A \| B` | Union of `A` and `B` |

### 3.3 User-Defined Types

#### Product Types (Structs)

A type with named fields. Instances are constructed positionally:

```tova
type Point { x: Float, y: Float }
p = Point(1.0, 2.0)    // x=1.0, y=2.0
```

#### Sum Types (ADTs)

A type with named variants, each optionally carrying data:

```tova
type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
}
```

Variants without payloads are simple enumerations:

```tova
type Color { Red, Green, Blue }
```

#### Generic Types

Type parameters are declared in angle brackets:

```tova
type Result<T, E> {
  Ok(value: T)
  Err(error: E)
}
```

### 3.4 Type Inference

Tova infers types from:
- Literal values (`42` is `Int`, `"hello"` is `String`)
- Operator usage (`a + b` where `a: Int` infers `b: Int`)
- Function return values (inferred from last expression)
- Variable assignments (inferred from right-hand side)
- Collection operations (`[1,2,3].map(fn(x) x*2)` infers `[Int]`)

Annotations are optional but recommended at module boundaries.

### 3.5 Type Checking Modes

**Gradual mode** (default): Type mismatches produce warnings. Compilation succeeds. Unknown types are assignable to any type.

**Strict mode** (`--strict`): Type mismatches produce errors. Unknown types are not assignable to concrete types. Float-to-Int narrowing produces warnings.

### 3.6 Assignability Rules

| From | To | Allowed? |
|------|-----|----------|
| `Int` | `Float` | Yes (implicit widening) |
| `Float` | `Int` | Warning (strict: error) |
| `T` | `T \| Nil` | Yes |
| `T \| Nil` | `T` | After nil check (narrowing) |
| `Unknown` | `T` | Yes (gradual) / No (strict) |
| `Nil` | `T` | Warning |

### 3.7 Type Narrowing

The type of a variable is narrowed after:

1. **Nil checks**: `if x != nil { ... }` narrows `x` from `T | Nil` to `T`
2. **Guard clauses**: `guard x != nil else { return }` narrows for the rest of the function
3. **Match arms**: Each arm narrows based on the matched pattern
4. **`is` checks**: `if value is String { ... }` narrows to `String`
5. **`type_of()` checks**: `if type_of(x) == "string" { ... }` narrows

### 3.8 Interfaces and Traits

```tova
interface Printable {
  fn to_string() -> String
}

trait Describable {
  fn name() -> String
  fn description() -> String {    // default implementation
    "A {self.name()}"
  }
}

impl Printable for User {
  fn to_string() { "{self.name} <{self.email}>" }
}
```

- **Interfaces** are pure contracts (no default implementations).
- **Traits** may provide default method bodies.
- **`impl`** blocks attach methods to types. `self` refers to the receiver.
- The compiler checks that all required methods are provided.

### 3.9 Derive Macros

```tova
type Point { x: Float, y: Float } derive [Eq, Show, JSON]
```

| Macro | Generated |
|-------|-----------|
| `Eq` | Structural equality via `==` and `!=` |
| `Show` | Human-readable string representation |
| `JSON` | `.to_json()` serialization and `.from_json()` deserialization |

### 3.10 Refinement Types

```tova
type Email = String where {
  it |> contains("@")
  it |> contains(".")
}
```

Refinement types compile to validator functions. The `it` keyword refers to the value being validated. Each line is a predicate that must return `true`.

## 4. Evaluation Semantics

### 4.1 Evaluation Order

Expressions are evaluated left to right. Short-circuit operators (`and`, `or`, `??`) may skip evaluation of the right operand.

### 4.2 Variable Binding

- **Immutable**: `x = expr` — `x` is bound to the value of `expr` and cannot be reassigned.
- **Mutable**: `var x = expr` — `x` can be reassigned with `x = new_expr` or compound assignments.

Attempting to reassign an immutable binding is a compile-time error.

### 4.3 Function Evaluation

- The body executes sequentially.
- The value of the last expression is implicitly returned.
- `return expr` immediately exits the function with `expr`.
- `return` without an expression returns `nil`.

### 4.4 Pipe Evaluation

`x |> f(a, b)` is evaluated as `f(x, a, b)`. The left-hand value becomes the first argument.

If a `_` placeholder appears in the right-hand arguments, the left-hand value replaces it instead: `x |> f(a, _, b)` becomes `f(a, x, b)`.

Method pipe: `x |> .method(args)` is evaluated as `x.method(args)`.

### 4.5 Match Evaluation

1. The subject expression is evaluated once.
2. Arms are tested top to bottom.
3. For each arm, the pattern is matched structurally.
4. If the pattern matches and any guard evaluates to `true`, the arm body is evaluated.
5. The value of the selected arm body is the value of the match expression.
6. If no arm matches, the result is `nil` (with a compiler warning about non-exhaustiveness).

### 4.6 Error Propagation (`!`)

`expr!` evaluates `expr`. If the result is `Err(e)`, the enclosing function immediately returns `Err(e)`. If the result is `None`, the enclosing function immediately returns `None`. Otherwise, the unwrapped value is produced.

### 4.7 Truthiness

Only `false` and `nil` are falsy. All other values — including `0`, `""`, and `[]` — are truthy.

### 4.8 Equality

`==` performs strict equality (JavaScript `===`). For types with `derive [Eq]`, structural equality is used (deep field comparison).

### 4.9 Iteration

`for x in collection { body }` iterates over:
- **Arrays**: each element in order
- **Strings**: each character
- **Objects**: each key-value pair
- **Ranges**: each integer in the range

The two-variable form `for i, x in collection` provides the index (for arrays) or key (for objects) as the first variable.

### 4.10 Comprehensions

```tova
[expr for x in collection if condition]
```

Evaluates to a new array containing `expr` for each `x` in `collection` where `condition` is true. Dict comprehensions produce objects:

```tova
{key_expr: value_expr for x in collection if condition}
```

### 4.11 Slicing

`collection[start:end:step]` produces a new array (or string) containing elements from index `start` (inclusive) to `end` (exclusive), stepping by `step`.

- Omitting `start` defaults to `0` (or `len-1` if step is negative).
- Omitting `end` defaults to `len` (or `-len-1` if step is negative).
- Omitting `step` defaults to `1`.
- Negative indices count from the end: `-1` is the last element.

### 4.12 String Multiplication

`string * n` evaluates to the string repeated `n` times. `n` must be a non-negative integer.

### 4.13 Defer

`defer expr` schedules `expr` to execute when the enclosing scope exits. Multiple defers execute in LIFO (last-in, first-out) order.

### 4.14 Guard

`guard condition else { body }` evaluates `condition`. If false, `body` executes (which must transfer control via `return`, `break`, or `continue`). If true, execution continues.

## 5. Compilation Model

### 5.1 Block Separation

The compiler processes `.tova` files in three phases:

1. **Parse**: Lex and parse each file into an AST.
2. **Merge**: Group files by directory. Merge same-type blocks (`shared`, `server`, `client`, `data`) across all files in the directory.
3. **Generate**: Produce separate JavaScript outputs for each block type.

### 5.2 Output Files

For a file or directory named `app`:

| Output | Contents |
|--------|----------|
| `app.shared.js` | Types, validation, constants from `shared {}` |
| `app.server.js` | HTTP server, routes, database, RPC endpoints from `server {}` |
| `app.client.js` | Reactive runtime, components, RPC proxy from `client {}` |
| `index.html` | HTML shell embedding client JS and runtime |

### 5.3 RPC Bridge

Server functions are automatically exposed as RPC endpoints:

1. Each function `fn name(params)` in a `server {}` block gets a `POST /rpc/name` endpoint.
2. The endpoint reads `{ __args: [...] }` from the request body.
3. Arguments are spread into the function call.
4. The return value is sent as `{ result: value }`.
5. On the client side, `server.name(args)` is a proxy that calls `fetch("/rpc/name", ...)`.

### 5.4 Reactive Compilation

Client-side reactive primitives compile to the Tova runtime:

| Tova | JavaScript |
|------|------------|
| `state x = 0` | `const [x, setX] = createSignal(0)` |
| `computed y = x * 2` | `const y = createMemo(() => x() * 2)` |
| `effect { ... }` | `createEffect(() => { ... })` |
| `x` (read) | `x()` |
| `x = 5` (write) | `setX(5)` |
| `x += 1` | `setX(p => p + 1)` |

### 5.5 JSX Compilation

JSX elements compile to DOM creation calls:

```tova
<div class="container">
  <p>{message}</p>
</div>
```

Compiles to calls in the reactive runtime that create real DOM nodes with fine-grained reactivity — when `message` changes, only the text node updates.

### 5.6 Incremental Compilation

The compiler caches ASTs per-file based on SHA256 content hashing. Only changed files are re-lexed, re-parsed, and re-analyzed. Cache is stored in `.tova-out/.cache/manifest.json`.

### 5.7 Source Maps

The compiler generates v3 source maps mapping generated JavaScript lines back to `.tova` source locations. This enables debugging in browser/Node devtools with `.tova` files.

## 6. Standard Library

### 6.1 Namespace Modules

The standard library is organized into namespaces:

| Namespace | Contents |
|-----------|----------|
| `math` | `sin`, `cos`, `tan`, `floor`, `ceil`, `round`, `abs`, `sqrt`, `pow`, `PI`, `E` |
| `str` | `upper`, `lower`, `trim`, `split`, `replace`, `contains`, `starts_with`, `ends_with` |
| `arr` | `sorted`, `reversed`, `unique`, `flatten`, `zip`, `chunk` |
| `json` | `parse`, `stringify` |
| `re` | `test`, `match`, `find_all`, `replace` |
| `dt` | `now`, `parse`, `format` |
| `url` | `parse`, `build` |
| `fs` | `read_text`, `write_text`, `exists`, `read_dir` |

### 6.2 Built-in Functions

Globally available without namespace prefix:

| Function | Description |
|----------|-------------|
| `print(args...)` | Print to stdout |
| `len(collection)` | Length of array, string, or object |
| `range(start?, end, step?)` | Generate a range of integers |
| `type_of(value)` | Runtime type name as string |
| `to_int(value)` | Convert to integer |
| `to_float(value)` | Convert to float |
| `to_string(value)` | Convert to string |
| `sorted(array, comparator?)` | Return sorted copy |
| `reversed(array)` | Return reversed copy |
| `map(array, fn)` | Transform each element |
| `filter(array, fn)` | Keep elements matching predicate |
| `reduce(array, fn, initial)` | Fold array to single value |
| `sum(array)` | Sum numeric array |
| `min(array)` | Minimum value |
| `max(array)` | Maximum value |
| `zip(a, b)` | Pair elements from two arrays |
| `enumerate(array)` | Array of `[index, value]` pairs |
| `keys(object)` | Array of object keys |
| `values(object)` | Array of object values |
| `entries(object)` | Array of `[key, value]` pairs |

### 6.3 Built-in Types

| Type | Variants |
|------|----------|
| `Result<T, E>` | `Ok(value: T)`, `Err(error: E)` |
| `Option<T>` | `Some(value: T)`, `None` |

Methods on `Result`: `map`, `flatMap`, `mapErr`, `unwrap`, `unwrapOr`, `expect`, `isOk`, `isErr`, `or`, `and`.

Methods on `Option`: `map`, `flatMap`, `unwrap`, `unwrapOr`, `expect`, `isSome`, `isNone`, `or`, `and`, `filter`.

## 7. Tooling

### 7.1 CLI Commands

| Command | Description |
|---------|-------------|
| `tova new <name>` | Create a new project |
| `tova init` | Initialize in current directory |
| `tova build [dir]` | Compile to JavaScript |
| `tova build --production` | Compile with minification |
| `tova dev` | Start development server with hot reload |
| `tova run <file>` | Compile and execute a file |
| `tova test` | Run test files |
| `tova test --coverage` | Run tests with coverage |
| `tova check [file]` | Type-check without compiling |
| `tova check --strict` | Type-check in strict mode |
| `tova fmt [file]` | Format source code |
| `tova repl` | Start interactive REPL |
| `tova explain <code>` | Explain an error code |
| `tova info` | Show version and environment info |
| `tova upgrade` | Self-update to latest version |

### 7.2 Error Codes

Errors are categorized by prefix:

| Range | Category |
|-------|----------|
| E001–E099 | Syntax errors |
| E100–E199 | Type errors |
| E200–E299 | Scope/binding errors |
| E300–E399 | Context errors (break outside loop, etc.) |
| E400–E499 | Import errors |
| E500–E599 | Match errors |
| E600–E699 | Trait/interface errors |
| W001–W099 | Unused warnings |
| W100–W199 | Style warnings |
| W200–W299 | Logic warnings |
| W300–W399 | Match/trait warnings |

Suppress diagnostics with: `// tova-ignore W001, E100`

### 7.3 LSP Features

The Tova language server provides:
- Diagnostics (errors and warnings)
- Hover information
- Go to definition
- Find references
- Rename symbol (scope-aware)
- Quick fixes for common errors
- Inlay hints (inferred types, parameter names)
- Code completion (keywords, builtins, variables)
