# Grammar

This appendix provides the complete EBNF (Extended Backus-Naur Form) grammar for the Tova programming language, derived from the parser and lexer source code.

## Notation

| Symbol | Meaning |
|--------|---------|
| `=` | Definition |
| `\|` | Alternative |
| `[ ]` | Optional (zero or one) |
| `{ }` | Repetition (zero or more) |
| `( )` | Grouping |
| `"..."` | Terminal string |
| `UPPER` | Token type |
| `lower` | Non-terminal |

## Lexical Grammar

### Tokens

```ebnf
token = NUMBER | STRING | STRING_TEMPLATE | BOOLEAN | NIL
      | IDENTIFIER | keyword | operator | delimiter
      | DOCSTRING | NEWLINE | EOF ;

keyword = "var" | "let" | "fn" | "return" | "if" | "elif" | "else"
        | "for" | "while" | "loop" | "match" | "type" | "import" | "from"
        | "export" | "as" | "and" | "or" | "not" | "in" | "is"
        | "true" | "false" | "nil" | "try" | "catch" | "finally"
        | "break" | "continue" | "async" | "await" | "guard"
        | "interface" | "derive" | "pub" | "impl" | "trait"
        | "defer" | "yield" | "extern" | "when" | "with"
        | "server" | "browser" | "shared" | "route"
        | "state" | "computed" | "effect" | "component" | "store"
        | "test" | "bench" ;

http_method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS" ;
```

### Number Literals

```ebnf
number = decimal_number | hex_number | binary_number | octal_number ;

decimal_number = digit { digit | "_" } [ "." digit { digit | "_" } ]
                 [ ( "e" | "E" ) [ "+" | "-" ] digit { digit } ] ;

hex_number     = "0" ( "x" | "X" ) hex_digit { hex_digit | "_" } ;
binary_number  = "0" ( "b" | "B" ) bin_digit { bin_digit | "_" } ;
octal_number   = "0" ( "o" | "O" ) oct_digit { oct_digit | "_" } ;

digit     = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;
hex_digit = digit | "a" | "b" | "c" | "d" | "e" | "f"
          | "A" | "B" | "C" | "D" | "E" | "F" ;
bin_digit = "0" | "1" ;
oct_digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" ;
```

### String Literals

```ebnf
double_string  = '"' { string_char | escape_seq | interpolation } '"' ;
single_string  = "'" { string_char | escape_seq } "'" ;

string_char    = any character except '"', "'", "\", "{" ;
escape_seq     = "\" ( "n" | "t" | "r" | "\" | '"' | "'" | "{" ) ;
interpolation  = "{" expression "}" ;
```

### Identifiers

```ebnf
identifier = ( letter | "_" ) { letter | digit | "_" } ;
letter     = "a".."z" | "A".."Z" ;
```

### Comments

```ebnf
line_comment  = "//" { any_char } newline ;
doc_comment   = "///" { any_char } newline ;
block_comment = "/*" { any_char | block_comment } "*/" ;
```

### Operators and Delimiters

```ebnf
operator = "+" | "-" | "*" | "/" | "%" | "**"
         | "=" | "==" | "!=" | "<" | "<=" | ">" | ">="
         | "&&" | "||" | "!" | "|>"
         | "=>" | "->" | "." | ".." | "..=" | "..."
         | ":" | "::" | "?" | "?." | "??"
         | "+=" | "-=" | "*=" | "/="
         | "@" ;

delimiter = "(" | ")" | "{" | "}" | "[" | "]" | "," | ";" ;
```

## Program Structure

```ebnf
program = { top_level_statement } EOF ;

top_level_statement = server_block
                    | browser_block
                    | shared_block
                    | data_block
                    | test_block
                    | bench_block
                    | import_declaration
                    | statement ;

server_block = "server" [ STRING ] "{" { server_statement } "}" ;
browser_block = "browser" [ STRING ] "{" { browser_statement } "}" ;
shared_block = "shared" [ STRING ] "{" { statement } "}" ;
data_block   = "data"   "{" { data_statement } "}" ;
test_block   = "test"   [ STRING ] "{" { statement } "}" ;
bench_block  = "bench"  [ STRING ] "{" { statement } "}" ;
```

## Server Statements

```ebnf
server_statement = route_declaration
                 | route_group_declaration
                 | middleware_declaration
                 | db_declaration
                 | model_declaration
                 | auth_declaration
                 | cors_declaration
                 | rate_limit_declaration
                 | health_check_declaration
                 | error_handler_declaration
                 | websocket_declaration
                 | sse_declaration
                 | static_declaration
                 | env_declaration
                 | session_declaration
                 | upload_declaration
                 | tls_declaration
                 | compression_declaration
                 | cache_declaration
                 | max_body_declaration
                 | schedule_declaration
                 | background_job_declaration
                 | lifecycle_hook_declaration
                 | discover_declaration
                 | subscribe_declaration
                 | statement ;

route_declaration = "route" http_method STRING [ "with" decorator_list ] "=>" expression ;

route_group_declaration = "routes" STRING "{" { server_statement } "}" ;

decorator_list = decorator { "," decorator } ;
decorator      = IDENTIFIER [ "(" expression_list ")" ] ;

middleware_declaration = "middleware" "fn" IDENTIFIER "(" param_list ")" block ;

db_declaration    = "db" "{" object_body "}" ;
model_declaration = "model" IDENTIFIER [ "{" object_body "}" ] ;
auth_declaration  = "auth" "{" object_body "}" ;
cors_declaration  = "cors" "{" object_body "}" ;
rate_limit_declaration = "rate_limit" "{" object_body "}" ;
health_check_declaration = "health" STRING ;
session_declaration    = "session" "{" object_body "}" ;
upload_declaration     = "upload" "{" object_body "}" ;
tls_declaration        = "tls" "{" object_body "}" ;
compression_declaration = "compression" "{" object_body "}" ;
cache_declaration      = "cache" "{" object_body "}" ;
max_body_declaration   = "max_body" expression ;

error_handler_declaration = "on_error" "fn" "(" param_list ")" block ;

websocket_declaration = "ws" "{" { ws_handler } "}" ;
ws_handler = ( "on_open" | "on_message" | "on_close" | "on_error" )
             "fn" "(" param_list ")" block ;

sse_declaration = "sse" STRING "fn" "(" param_list ")" block ;

static_declaration = "static" STRING "=>" STRING [ "fallback" STRING ] ;

env_declaration = "env" IDENTIFIER ":" type_annotation [ "=" expression ] ;

schedule_declaration = "schedule" STRING "fn" [ IDENTIFIER ] "(" [ param_list ] ")" block ;

background_job_declaration = "background" "fn" IDENTIFIER "(" [ param_list ] ")" block ;

lifecycle_hook_declaration = ( "on_start" | "on_stop" ) "fn" "(" [ param_list ] ")" block ;

discover_declaration = "discover" STRING "at" expression [ "with" "{" object_body "}" ] ;

subscribe_declaration = "subscribe" STRING "fn" "(" param_list ")" block ;
```

## Browser Statements

```ebnf
browser_statement = state_declaration
                 | computed_declaration
                 | effect_declaration
                 | component_declaration
                 | store_declaration
                 | statement ;

state_declaration    = "state" IDENTIFIER [ ":" type_annotation ] "=" expression ;
computed_declaration = "computed" IDENTIFIER "=" expression ;
effect_declaration   = "effect" block ;

component_declaration = "component" IDENTIFIER [ "(" [ param_list ] ")" ] "{" component_body "}" ;
component_body = { jsx_element | statement | style_block } ;
style_block    = STYLE_BLOCK ;

store_declaration = "store" IDENTIFIER "{" { state_declaration | computed_declaration | function_declaration } "}" ;
```

## Statements

```ebnf
statement = assignment
          | var_declaration
          | let_destructure
          | decorated_declaration
          | function_declaration
          | type_declaration
          | interface_declaration
          | import_declaration
          | export_statement
          | return_statement
          | guard_statement
          | if_statement
          | for_statement
          | while_statement
          | loop_statement
          | with_statement
          | try_catch_statement
          | expression_statement ;

assignment = IDENTIFIER { "," IDENTIFIER } "=" expression { "," expression } ;

var_declaration = "var" IDENTIFIER { "," IDENTIFIER } "=" expression { "," expression } ;

let_destructure = "let" ( object_pattern | array_pattern ) "=" expression ;

decorated_declaration = { "@" IDENTIFIER [ "(" expression_list ")" ] } ( function_declaration | async_function_declaration ) ;

function_declaration = "fn" IDENTIFIER "(" [ param_list ] ")" [ "->" type_annotation ] block ;

async_function_declaration = "async" function_declaration ;

param_list = parameter { "," parameter } ;
parameter  = IDENTIFIER [ ":" type_annotation ] [ "=" expression ] ;

type_declaration = "type" IDENTIFIER [ "<" type_param_list ">" ] "{" type_body "}" ;
type_param_list  = IDENTIFIER { "," IDENTIFIER } ;
type_body        = { type_variant | type_field } ;
type_variant     = IDENTIFIER [ "(" type_field_list ")" ] [ "," ] ;
type_field       = IDENTIFIER ":" type_annotation [ "," ] ;
type_field_list  = type_field { "," type_field } ;

import_declaration = "import" ( import_specifiers "from" STRING
                              | IDENTIFIER "from" STRING ) ;
import_specifiers  = "{" import_specifier { "," import_specifier } "}" ;
import_specifier   = IDENTIFIER [ "as" IDENTIFIER ] ;

pub_declaration = "pub" ( function_declaration | type_declaration | statement ) ;

return_statement = "return" [ expression ] ;

if_statement = "if" expression block
               { "elif" expression block }
               [ "else" block ] ;

for_statement = "for" for_target [ "," IDENTIFIER ] "in" expression
                [ "when" expression ] block
                [ "else" block ] ;

for_target = IDENTIFIER | array_pattern | object_pattern ;

while_statement = "while" expression block ;

loop_statement = [ IDENTIFIER ":" ] "loop" block ;

with_statement = "with" expression "as" IDENTIFIER block ;

try_catch_statement = "try" "{" { statement } "}"
                      "catch" [ IDENTIFIER ] "{" { statement } "}" ;

guard_statement = "guard" expression "else" block ;

interface_declaration = "interface" IDENTIFIER "{" { "fn" IDENTIFIER "(" [ param_list ] ")" [ "->" type_annotation ] } "}" ;

expression_statement = expression ;

block = "{" { statement } "}" ;
```

## Expressions

### Precedence (Lowest to Highest)

```ebnf
expression     = pipe_expr ;

pipe_expr      = null_coalesce { "|>" null_coalesce } ;

null_coalesce  = logical_or { "??" logical_or } ;

logical_or     = logical_and { ( "or" | "||" ) logical_and } ;

logical_and    = logical_not { ( "and" | "&&" ) logical_not } ;

logical_not    = ( "not" | "!" ) logical_not | comparison ;

comparison     = membership { ( "<" | "<=" | ">" | ">=" | "==" | "!=" ) membership }
               | membership ( "is" | "is" "not" ) IDENTIFIER ;

membership     = range_expr { ( "in" | "not" "in" ) range_expr } ;

range_expr     = addition [ ( ".." | "..=" ) addition ] ;

addition       = multiplication { ( "+" | "-" ) multiplication } ;

multiplication = power { ( "*" | "/" | "%" ) power } ;

power          = unary [ "**" power ] ;

unary          = ( "-" | "..." ) unary | postfix ;

postfix        = primary { call | member | index | optional_chain } ;
call           = "(" [ argument_list ] ")" ;
member         = "." IDENTIFIER ;
index          = "[" ( expression | slice ) "]" ;
slice          = [ expression ] ":" [ expression ] [ ":" [ expression ] ] ;
optional_chain = "?." IDENTIFIER ;

argument_list  = argument { "," argument } ;
argument       = [ IDENTIFIER ":" ] expression | "..." expression ;
```

### Primary Expressions

```ebnf
primary = NUMBER
        | STRING
        | STRING_TEMPLATE
        | "true" | "false" | "nil"
        | IDENTIFIER
        | "(" expression ")"
        | array_literal
        | object_literal
        | lambda_expression
        | match_expression
        | if_expression ;

array_literal = "[" [ array_elements ] "]" ;
array_elements = list_comprehension | expression_list ;
list_comprehension = expression "for" IDENTIFIER "in" expression [ "if" expression ] ;

object_literal = "{" [ object_entries ] "}" ;
object_entries = dict_comprehension | object_entry { "," object_entry } ;
dict_comprehension = expression ":" expression "for" IDENTIFIER [ "," IDENTIFIER ] "in" expression [ "if" expression ] ;
object_entry   = ( IDENTIFIER | STRING ) ":" expression
               | IDENTIFIER
               | "..." expression ;

lambda_expression = "fn" "(" [ param_list ] ")" ( block | expression )
                  | IDENTIFIER "=>" ( block | expression ) ;

match_expression = "match" expression "{" { match_arm } "}" ;
match_arm        = pattern [ "if" expression ] "=>" ( block | expression ) ;

if_expression = "if" expression block
                { "elif" expression block }
                "else" block ;
```

## Patterns

```ebnf
pattern = literal_pattern
        | range_pattern
        | variant_pattern
        | array_pattern
        | string_concat_pattern
        | wildcard_pattern
        | binding_pattern ;

literal_pattern = NUMBER | STRING | "true" | "false" | "nil" ;
range_pattern   = NUMBER ( ".." | "..=" ) NUMBER ;
variant_pattern = IDENTIFIER "(" [ IDENTIFIER { "," IDENTIFIER } ] ")" ;
array_pattern   = "[" [ IDENTIFIER { "," IDENTIFIER } ] "]" ;
string_concat_pattern = STRING "++" IDENTIFIER ;
wildcard_pattern = "_" ;
binding_pattern  = IDENTIFIER ;
```

## Type Annotations

```ebnf
type_annotation = simple_type
                | array_type ;

simple_type    = IDENTIFIER [ "<" type_annotation { "," type_annotation } ">" ] ;
array_type     = "[" type_annotation "]" ;
```

## Destructuring Patterns

```ebnf
object_pattern = "{" object_pattern_entry { "," object_pattern_entry } "}" ;
object_pattern_entry = IDENTIFIER [ ":" IDENTIFIER ] [ "=" expression ] ;

array_pattern  = "[" [ IDENTIFIER { "," IDENTIFIER } [ "," "..." IDENTIFIER ] ] "]" ;
```

## JSX Grammar

```ebnf
jsx_element = jsx_self_closing | jsx_open_close ;

jsx_self_closing = "<" jsx_tag { jsx_attribute } "/>" ;
jsx_open_close   = "<" jsx_tag { jsx_attribute } ">"
                   { jsx_child }
                   "</" jsx_tag ">" ;

jsx_tag = IDENTIFIER ;

jsx_attribute = IDENTIFIER [ "=" ( "{" expression "}" | STRING ) ]
              | ( "on:" | "bind:" | "class:" | "style:" ) IDENTIFIER "=" "{" expression "}"
              | "{" "..." expression "}" ;

jsx_child = jsx_element
          | jsx_text
          | jsx_expression
          | jsx_if
          | jsx_for ;

jsx_text       = STRING | raw_text ;
raw_text       = { any character except "<" | "{" | '"' | "'" } ;
jsx_expression = "{" expression "}" ;

jsx_if  = "if" expression "{" { jsx_child } "}"
          { "elif" expression "{" { jsx_child } "}" }
          [ "else" "{" { jsx_child } "}" ] ;

jsx_for = "for" IDENTIFIER [ "," IDENTIFIER ] "in" expression
          [ "key" "=" "{" expression "}" ]
          "{" { jsx_child } "}" ;
```

## Notes

1. **Newline sensitivity**: Newlines are significant in some contexts. A `[` on a new line is not treated as a subscript of the previous expression.

2. **Semicolons**: Optional. Newlines serve as statement terminators. Semicolons can be used for multiple statements on one line.

3. **Implicit returns**: The last expression in a function body is returned. Explicit `return` is also supported.

4. **`elif` not `else if`**: Chained conditionals use the `elif` keyword, not `else if`.

5. **For loop variables**: `for key, val in pairs {}` uses comma-separated identifiers, not array destructuring.

6. **`Type.new()`**: `Type.new(args)` transpiles to `new Type(args)` in JavaScript for constructing built-in types.

7. **Unquoted JSX text**: Text inside JSX elements can be unquoted (`<h1>Hello World</h1>`) or quoted (`<h1>"Hello World"</h1>`). Unquoted text is scanned as raw `JSX_TEXT` tokens by the lexer. The keywords `if`, `for`, `elif`, and `else` are reserved for JSX control flow and cannot appear as unquoted text.

8. **String pattern matching**: The `++` operator in patterns matches a string prefix and binds the remainder to a variable: `"api/" ++ rest` matches any string starting with `"api/"` and binds the rest.

9. **Decorators**: The `@` prefix applies decorators to function declarations. `@wasm` compiles a function to WebAssembly. `@fast` enables TypedArray optimizations. Multiple decorators can be stacked.

10. **Guard clauses**: `guard condition else { ... }` provides early-exit when a condition is not met. The else block must return or exit the enclosing function.

11. **Data and bench blocks**: `data { ... }` defines data sources and transformations. `bench "name" { ... }` defines benchmarks.

12. **`++` is patterns-only**: The `++` operator is only valid in match patterns for string prefix matching. In expression context, use `+` for string concatenation or string interpolation `"text {expr}"`.
