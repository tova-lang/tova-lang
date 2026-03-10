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

```text
token = NUMBER | STRING | STRING_TEMPLATE | BOOLEAN | NIL
      | IDENTIFIER | keyword | operator | delimiter
      | REGEX | DOCSTRING | NEWLINE | EOF ;

keyword = "var" | "let" | "fn" | "return" | "if" | "elif" | "else"
        | "for" | "while" | "loop" | "match" | "type" | "import" | "from"
        | "export" | "as" | "and" | "or" | "not" | "in" | "is"
        | "true" | "false" | "nil" | "try" | "catch" | "finally"
        | "break" | "continue" | "async" | "await" | "guard"
        | "interface" | "derive" | "pub" | "impl" | "trait"
        | "defer" | "yield" | "extern" | "when" | "with" | "mut"
        | "server" | "browser" | "client" | "shared" | "route"
        | "state" | "computed" | "effect" | "component" | "store"
        | "form" | "field" | "group" | "steps" ;

(* "test", "bench", "data", "security", "cli", "edge", "concurrent",
   "deploy", and "theme" are NOT reserved keywords -- they are parsed as
   identifiers and detected contextually by the plugin system.
   "mut" is reserved but rejected with an error directing users to "var". *)

http_method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS" ;

(* HTTP methods are contextual — they are parsed as regular IDENTIFIER tokens
   and recognized by the server-parser based on their string value.
   The token types GET, POST, etc. exist in tokens.js but are never
   produced by the lexer; they are dead code. *)

(* "client" is a deprecated alias for "browser" — both map to the same
   token type in the lexer. *)
```

### Number Literals

```text
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

```text
string = double_string | single_string | triple_string | raw_string | f_string ;

double_string  = '"' { string_char | escape_seq | interpolation } '"' ;
single_string  = "'" { string_char | escape_seq } "'" ;
triple_string  = '"""' { any_char | interpolation } '"""' ;
raw_string     = "r" '"' { any_char_except_dquote } '"' ;
f_string       = "f" '"' { string_char | escape_seq | interpolation } '"' ;

string_char    = any character except '"', "'", "\", "{" ;
escape_seq     = "\" ( "n" | "t" | "r" | "\" | '"' | "'" | "{" | "}" ) ;
interpolation  = "{" expression "}" ;

(* Single-quoted strings have no interpolation.
   Triple-quoted strings span multiple lines with auto-dedentation.
   Raw strings disable escape processing.
   F-strings are semantically identical to double-quoted strings. *)
```

### Regex Literals

```text
regex_literal = "/" regex_pattern "/" [ regex_flags ] ;

regex_pattern = { regex_char | "[" regex_class "]" } ;
regex_char    = any character except "/" and newline ;
regex_class   = { any character except "]" } ;
regex_flags   = { "g" | "i" | "m" | "s" | "u" | "y" | "d" | "v" } ;

(* Regex literals are context-sensitive: a "/" is only parsed as a regex
   when it does NOT follow a value-producing token. *)
```

### Identifiers

```text
identifier = ( letter | "_" ) { letter | digit | "_" } ;
letter     = "a".."z" | "A".."Z" ;
```

### Comments

```text
line_comment  = "//" { any_char } newline ;
doc_comment   = "///" { any_char } newline ;
block_comment = "/*" { any_char | block_comment } "*/" ;
```

### Operators and Delimiters

```text
operator = "+" | "-" | "*" | "/" | "%" | "**"
         | "=" | "==" | "!=" | "<" | "<=" | ">" | ">="
         | "&&" | "||" | "!" | "|>" | "|"
         | "=>" | "->" | "." | ".." | "..=" | "..."
         | ":" | "::" | "?" | "?." | "??"
         | "+=" | "-=" | "*=" | "/="
         | "@" ;

delimiter = "(" | ")" | "{" | "}" | "[" | "]" | "," | ";" ;
```

## Program Structure

```text
program = { top_level_statement } EOF ;

top_level_statement = server_block
                    | browser_block
                    | shared_block
                    | data_block
                    | security_block
                    | cli_block
                    | edge_block
                    | concurrent_block
                    | deploy_block
                    | theme_block
                    | test_block
                    | bench_block
                    | import_declaration
                    | statement ;

server_block  = "server" [ STRING ] "{" { server_statement } "}" ;
browser_block = "browser" [ STRING ] "{" { browser_statement } "}" ;
shared_block  = "shared" [ STRING ] "{" { statement } "}" ;
data_block    = "data"   "{" { data_statement } "}" ;

data_statement = source_declaration
               | pipeline_declaration
               | validate_declaration
               | refresh_declaration
               | statement ;

source_declaration   = "source" IDENTIFIER STRING ;
pipeline_declaration = "pipeline" IDENTIFIER "(" [ param_list ] ")" block ;
validate_declaration = "validate" IDENTIFIER block ;
refresh_declaration  = "refresh" IDENTIFIER "{" { IDENTIFIER ":" expression } "}" ;
test_block    = "test"   [ STRING ] [ "timeout" "=" NUMBER ] "{" { test_member } "}" ;
test_member   = "before_each" block | "after_each" block | statement ;
bench_block   = "bench"  [ STRING ] "{" { statement } "}" ;

(* "test", "bench", "data", "security", "cli", "edge", "concurrent",
   "deploy", and "theme" are detected as identifiers by the plugin system,
   not as reserved keywords. They can be used as variable names elsewhere. *)
```

## Server Statements

```text
server_statement = route_declaration
                 | route_group_declaration
                 | middleware_declaration
                 | db_declaration
                 | model_declaration
                 | ai_config_declaration
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

route_declaration = "route" http_method STRING
                    [ "body" ":" type_annotation ]
                    [ "with" decorator_list ]
                    [ "->" type_annotation ]
                    "=>" expression ;

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

ai_config_declaration = "ai" [ STRING ] "{" object_body "}" ;

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

```text
browser_statement = state_declaration
                 | computed_declaration
                 | effect_declaration
                 | component_declaration
                 | store_declaration
                 | form_declaration
                 | statement ;

state_declaration    = "state" IDENTIFIER [ ":" type_annotation ] "=" expression ;
computed_declaration = "computed" IDENTIFIER "=" expression ;
effect_declaration   = "effect" block ;

component_declaration = "component" IDENTIFIER [ "(" [ param_list ] ")" ] "{" component_body "}" ;
component_body = { jsx_element | statement | style_block } ;
style_block    = STYLE_BLOCK ;

store_declaration = "store" IDENTIFIER "{" { state_declaration | computed_declaration | function_declaration } "}" ;
```

## Security Block

```text
security_block = "security" "{" { security_statement } "}" ;

security_statement = security_auth_declaration
                   | security_role_declaration
                   | security_protect_declaration
                   | security_sensitive_declaration
                   | security_cors_declaration
                   | security_csp_declaration
                   | security_rate_limit_declaration
                   | security_csrf_declaration
                   | security_audit_declaration
                   | security_trust_proxy_declaration
                   | security_hsts_declaration ;

security_auth_declaration    = "auth" "{" object_body "}" ;
security_role_declaration    = "role" IDENTIFIER "{" { IDENTIFIER } "}" ;
security_protect_declaration = "protect" STRING "{" object_body "}" ;
security_sensitive_declaration = "sensitive" "{" object_body "}" ;
security_cors_declaration    = "cors" "{" object_body "}" ;
security_csp_declaration     = "csp" "{" object_body "}" ;
security_rate_limit_declaration = "rate_limit" "{" object_body "}" ;
security_csrf_declaration    = "csrf" "{" object_body "}" ;
security_audit_declaration   = "audit" "{" object_body "}" ;
security_trust_proxy_declaration = "trust_proxy" expression ;
security_hsts_declaration    = "hsts" "{" object_body "}" ;
```

## CLI Block

```text
cli_block = "cli" "{" { cli_statement } "}" ;

cli_statement = cli_config_field
              | cli_command_declaration ;

cli_config_field = IDENTIFIER ":" expression ;

cli_command_declaration = "fn" IDENTIFIER "(" [ cli_param_list ] ")" block ;

cli_param_list = cli_param { "," cli_param } ;
cli_param      = ( "--" IDENTIFIER | IDENTIFIER ) [ ":" type_annotation ] [ "=" expression ] ;

(* "--flag" syntax uses two MINUS tokens followed by an IDENTIFIER.
   Single-command CLIs (one fn) skip subcommand routing. *)
```

## Edge Block

```text
edge_block = "edge" [ STRING ] "{" { edge_statement } "}" ;

edge_statement = edge_config_field
               | edge_binding_declaration
               | route_declaration
               | middleware_declaration
               | edge_schedule_declaration
               | edge_consume_declaration
               | statement ;

edge_config_field = IDENTIFIER ":" expression ;

edge_binding_declaration = ( "kv" | "sql" | "storage" | "queue" | "env" | "secret" )
                           IDENTIFIER [ ":" type_annotation ] [ "=" expression ] ;

edge_schedule_declaration = "schedule" STRING "fn" [ IDENTIFIER ] "(" [ param_list ] ")" block ;

edge_consume_declaration = "consume" IDENTIFIER "fn" "(" param_list ")" block ;

(* Edge blocks support 5 deployment targets: cloudflare, deno, vercel, lambda, bun.
   Named blocks: edge "api" {} produce separate output files. *)
```

## Concurrent Block, Spawn, and Select

```text
concurrent_block = "concurrent" [ concurrent_mode ] block ;
concurrent_mode  = "cancel_on_error" | "first" | "timeout" "(" expression ")" ;

(* The default mode is "all" -- all spawned tasks must complete.
   "cancel_on_error" cancels remaining tasks if any fail.
   "first" returns the first completed result.
   "timeout(ms)" sets a deadline. *)

spawn_expression = "spawn" call_expression ;

(* spawn is a contextual keyword. "spawn foo()" creates a SpawnExpression.
   Disambiguated from the stdlib function spawn("cmd", args) by
   lookahead: spawn followed by IDENTIFIER + "(" is a SpawnExpression,
   spawn followed by "(" is a regular function call. *)

select_statement = "select" "{" { select_case } "}" ;

select_case = receive_case | send_case | timeout_case | default_case ;

receive_case = IDENTIFIER "from" expression "=>" ( block | expression ) ;
send_case    = expression "." "send" "(" expression ")" "=>" ( block | expression ) ;
timeout_case = "timeout" "(" expression ")" "=>" ( block | expression ) ;
default_case = "_" "=>" ( block | expression ) ;
```

## Form Declaration

```text
form_declaration = "form" IDENTIFIER "{" { form_member } "}" ;

form_member = form_field
            | form_group
            | form_array
            | form_steps
            | form_on_submit
            | statement ;

form_field = "field" IDENTIFIER [ ":" type_annotation ] "=" expression
             [ "{" { form_validator } "}" ] ;

form_group = "group" IDENTIFIER [ "when" expression ] "{" { form_member } "}" ;

form_array = "array" IDENTIFIER "{" { form_field } "}" ;

form_steps = "steps" "{" { form_step } "}" ;
form_step  = "step" STRING "{" { IDENTIFIER } "}" ;

form_on_submit = "on" "submit" block ;

form_validator = IDENTIFIER "(" [ expression_list ] ")" ;

(* Built-in validators: required, minLength, maxLength, min, max,
   pattern, email, matches, oneOf, validate, async validate.
   Fields generate signal triples: value, error, and touched. *)
```

## Deploy Block

```text
deploy_block = "deploy" "{" { deploy_statement } "}" ;

deploy_statement = deploy_config_field
                 | deploy_env_block
                 | deploy_db_block ;

deploy_config_field = IDENTIFIER ":" expression ;
deploy_env_block    = "env" "{" { IDENTIFIER ":" expression } "}" ;
deploy_db_block     = "db" "{" { IDENTIFIER ":" expression } "}" ;
```

## Theme Block

```text
theme_block = "theme" "{" { theme_section } "}" ;

theme_section = IDENTIFIER "{" { theme_token } "}" ;
theme_token   = IDENTIFIER ":" expression ;
```

## Statements

```text
statement = assignment
          | compound_assignment
          | var_declaration
          | let_destructure
          | decorated_declaration
          | function_declaration
          | type_declaration
          | interface_declaration
          | trait_declaration
          | impl_declaration
          | import_declaration
          | pub_declaration
          | return_statement
          | break_statement
          | continue_statement
          | guard_statement
          | defer_statement
          | extern_declaration
          | if_statement
          | for_statement
          | while_statement
          | loop_statement
          | with_statement
          | try_catch_statement
          | concurrent_block
          | select_statement
          | expression_statement ;

assignment = ( IDENTIFIER | member_expr ) { "," IDENTIFIER } "=" expression { "," expression } ;

(* Assignment targets: simple identifiers, member expressions (obj.x),
   and subscript expressions (arr[i]). Also supports destructuring:
   {name, age} = user  or  [a, b] = list  (parsed as let_destructure). *)

compound_assignment = ( IDENTIFIER | member_expr ) ( "+=" | "-=" | "*=" | "/=" ) expression ;

var_declaration = "var" IDENTIFIER { "," IDENTIFIER } "=" expression { "," expression } ;

let_destructure = [ "let" ] ( object_pattern | array_pattern | tuple_pattern ) "=" expression ;

(* Note: "let" followed by a plain IDENTIFIER is rejected with a specific error
   directing users to use "name = value" or "var name = value". The "let" keyword
   is only for destructuring. When "let" is omitted, destructuring assignments like
   {a, b} = expr are handled via parseExpressionOrAssignment, not this rule. *)

decorated_declaration = { "@" IDENTIFIER [ "(" expression_list ")" ] } ( function_declaration | async_function_declaration ) ;

function_declaration = "fn" IDENTIFIER [ "<" type_param_list ">" ] "(" [ param_list ] ")" [ "->" type_annotation ] block ;

async_function_declaration = "async" function_declaration ;

param_list = parameter { "," parameter } ;
parameter  = ( IDENTIFIER | object_pattern | array_pattern ) [ ":" type_annotation ] [ "=" expression ] ;

type_declaration = "type" IDENTIFIER [ "<" type_param_list ">" ]
                   ( type_alias | type_body_decl ) ;
type_param_list  = IDENTIFIER { "," IDENTIFIER } ;
type_alias       = "=" type_annotation [ "where" "{" { expression } "}" ] ;
type_body_decl   = "{" type_body "}" [ "derive" "[" IDENTIFIER { "," IDENTIFIER } "]" ] ;
type_body        = { type_variant | type_field } ;
type_variant     = IDENTIFIER [ "(" type_field_list ")" ] [ "," ] ;
type_field       = IDENTIFIER ":" type_annotation [ "," ] ;
type_field_list  = type_field { "," type_field } ;

import_declaration = "import" ( import_specifiers "from" STRING
                              | IDENTIFIER "from" STRING
                              | "*" "as" IDENTIFIER "from" STRING ) ;
import_specifiers  = "{" import_specifier { "," import_specifier } "}" ;
import_specifier   = IDENTIFIER [ "as" IDENTIFIER ] ;

pub_declaration = "pub" ( function_declaration | type_declaration | statement ) ;

return_statement = "return" [ expression ] ;

if_statement = "if" expression block
               { ( "elif" | "else" "if" ) expression block }
               [ "else" block ] ;

for_statement = [ "async" ] [ IDENTIFIER ":" ] "for" for_target [ "," IDENTIFIER ] "in" expression
                [ "when" expression ] block
                [ "else" block ] ;

for_target = IDENTIFIER | array_pattern | object_pattern ;

while_statement = [ IDENTIFIER ":" ] "while" expression block ;

loop_statement = [ IDENTIFIER ":" ] "loop" block ;

with_statement = "with" expression "as" IDENTIFIER block ;

try_catch_statement = "try" block
                      [ "catch" [ IDENTIFIER ] block ]
                      [ "finally" block ] ;

(* At least one of catch or finally is required. *)

guard_statement = "guard" expression "else" block ;

defer_statement = "defer" ( block | expression ) ;

break_statement = "break" [ IDENTIFIER ] ;
continue_statement = "continue" [ IDENTIFIER ] ;

extern_declaration = "extern" [ "async" ] "fn" IDENTIFIER "(" [ param_list ] ")" [ "->" type_annotation ] ;

interface_declaration = "interface" IDENTIFIER "{" { "fn" IDENTIFIER "(" [ param_list ] ")" [ "->" type_annotation ] } "}" ;

trait_declaration = "trait" IDENTIFIER "{" { function_declaration } "}" ;

impl_declaration = "impl" [ IDENTIFIER "for" ] IDENTIFIER "{" { function_declaration } "}" ;

expression_statement = expression ;

block = "{" { statement } "}" ;
```

## Expressions

### Precedence (Lowest to Highest)

```text
expression     = pipe_expr ;

pipe_expr      = null_coalesce { "|>" pipe_target } ;
pipe_target    = null_coalesce | "." IDENTIFIER [ "(" [ argument_list ] ")" ] ;

null_coalesce  = logical_or { "??" logical_or } ;

logical_or     = logical_and { ( "or" | "||" ) logical_and } ;

logical_and    = logical_not { ( "and" | "&&" ) logical_not } ;

logical_not    = ( "not" | "!" ) logical_not | comparison ;

comparison     = membership { ( "<" | "<=" | ">" | ">=" | "==" | "!=" ) membership } ;

membership     = range_expr [ "is" [ "not" ] IDENTIFIER
                             | ( "in" | "not" "in" ) range_expr ] ;

range_expr     = addition [ ( ".." | "..=" ) addition ] ;

addition       = multiplication { ( "+" | "-" ) multiplication } ;

multiplication = power { ( "*" | "/" | "%" ) power } ;

power          = unary [ "**" power ] ;

unary          = "await" unary
               | "yield" [ "from" ] unary
               | ( "-" | "..." ) unary
               | postfix ;

postfix        = primary { call | member | index | optional_chain | "?" } ;
call           = "(" [ argument_list ] ")" ;
member         = "." ( IDENTIFIER | NUMBER ) ;
index          = "[" ( expression | slice ) "]" ;
slice          = [ expression ] ":" [ expression ] [ ":" [ expression ] ]
               | [ expression ] "::" [ expression ] ;
optional_chain = "?." IDENTIFIER ;

argument_list  = argument { "," argument } ;
argument       = [ IDENTIFIER ":" ] expression | "..." expression ;
```

### Primary Expressions

```text
primary = NUMBER
        | STRING
        | STRING_TEMPLATE
        | REGEX
        | "true" | "false" | "nil"
        | IDENTIFIER
        | paren_or_tuple
        | array_literal
        | object_literal
        | lambda_expression
        | match_expression
        | if_expression ;

paren_or_tuple = "(" expression { "," expression } ")" ;
(* A single expression in parentheses is a grouping; with commas it becomes a tuple. *)

array_literal = "[" [ array_elements ] "]" ;
array_elements = list_comprehension | expression_list ;
list_comprehension = expression "for" IDENTIFIER "in" expression [ "if" expression ] ;

object_literal = "{" [ object_entries ] "}" ;
object_entries = dict_comprehension | object_entry { "," object_entry } ;
dict_comprehension = expression ":" expression "for" IDENTIFIER [ "," IDENTIFIER ] "in" expression [ "if" expression ] ;
object_entry   = ( IDENTIFIER | STRING | "[" expression "]" ) ":" expression
               | IDENTIFIER
               | "..." expression ;

lambda_expression = "fn" "(" [ param_list ] ")" ( block | expression )
                  | "async" "fn" "(" [ param_list ] ")" ( block | expression )
                  | IDENTIFIER ( "=>" | "->" ) ( block | expression )
                  | "(" [ param_list ] ")" ( "=>" | "->" ) ( block | expression ) ;

match_expression = "match" expression "{" { match_arm } "}" ;
match_arm        = pattern [ "if" expression ] "=>" ( block | expression ) ;

if_expression = "if" expression block
                { ( "elif" | "else" "if" ) expression block }
                "else" block ;

(* "await" and "yield" are parsed at the unary precedence level, not as primary
   expressions. See the unary rule in the Precedence section above. *)
```

## Patterns

```text
pattern = literal_pattern
        | range_pattern
        | variant_pattern
        | tuple_pattern
        | match_array_pattern
        | string_concat_pattern
        | wildcard_pattern
        | binding_pattern ;

literal_pattern = [ "-" ] NUMBER | STRING | "true" | "false" | "nil" ;
range_pattern   = [ "-" ] NUMBER ( ".." | "..=" ) [ "-" ] NUMBER ;
variant_pattern = IDENTIFIER [ "(" [ pattern { "," pattern } ] ")" ] ;
tuple_pattern   = "(" pattern { "," pattern } ")" ;
match_array_pattern = "[" [ pattern { "," pattern } ] "]" ;
string_concat_pattern = STRING "++" pattern ;
wildcard_pattern = "_" ;
binding_pattern  = IDENTIFIER ;

(* Pattern elements are recursive -- e.g. [Some(x), None] or Ok(Some(42)) are valid.
   Negative number patterns like -1 are supported.
   Bare uppercase identifiers like Ok, None match enum/variant tags.
   Note: rest elements (...name) are NOT supported in match array patterns.
   Use the destructuring array_pattern for rest elements in let/for bindings. *)
```

## Type Annotations

```text
type_annotation = union_type ;

union_type     = single_type { "|" single_type } ;

single_type    = array_type
               | tuple_or_fn_type
               | simple_type ;

simple_type    = IDENTIFIER [ "<" type_annotation { "," type_annotation } ">" ] [ "?" ] ;
array_type     = "[" type_annotation "]" ;
tuple_or_fn_type = "(" [ type_annotation { "," type_annotation } ] ")"
                   [ "->" type_annotation ] ;
                   (* with "->" it is a function type; without it is a tuple type *)

(* The "?" suffix denotes an optional type: String? is shorthand for String | Nil.
   Note: the "?" suffix is a design-level convention. Use String | Nil explicitly
   in type annotations for the most reliable behavior. *)
```

### Type Declarations

```text
(* See the full type_declaration rule in the Statements section above.
   Supports three forms:
   - Type body:  type Color { Red, Green, Blue }
   - Type alias: type UserId = Int
   - Refinement: type Email = String where { it.contains("@") }
   - Simple enum via union: type Color = Red | Green | Blue
   Inline validators on fields: name: String { required, minLength(2) }
   Derive clause: type Foo { ... } derive [Eq, Show, JSON] *)
```

## Destructuring Patterns

```text
object_pattern = "{" object_pattern_entry { "," object_pattern_entry } "}" ;
object_pattern_entry = IDENTIFIER [ ":" IDENTIFIER ] [ "=" expression ] ;

array_pattern  = "[" [ IDENTIFIER { "," IDENTIFIER } [ "," "..." IDENTIFIER ] ] "]" ;
```

## JSX Grammar

```text
jsx_element = jsx_self_closing | jsx_open_close | jsx_fragment ;

jsx_self_closing = "<" jsx_tag { jsx_attribute } "/>" ;
jsx_open_close   = "<" jsx_tag { jsx_attribute } ">"
                   { jsx_child }
                   "</" jsx_tag ">" ;
jsx_fragment     = "<>" { jsx_child } "</>" ;

jsx_tag = IDENTIFIER ;

jsx_attribute = IDENTIFIER [ "=" ( "{" expression "}" | STRING ) ]
              | ( "on:" | "bind:" | "class:" | "style:" | "show" | "transition:" ) IDENTIFIER "=" "{" expression "}"
              | "{" "..." expression "}" ;

jsx_child = jsx_element
          | jsx_text
          | jsx_expression
          | jsx_if
          | jsx_match
          | jsx_for ;

jsx_text       = STRING | raw_text ;
raw_text       = { any character except "<" | "{" | '"' | "'" } ;
jsx_expression = "{" expression "}" ;

jsx_if  = "if" expression "{" { jsx_child } "}"
          { "elif" expression "{" { jsx_child } "}" }
          [ "else" "{" { jsx_child } "}" ] ;

jsx_for = "for" ( IDENTIFIER | array_pattern | object_pattern ) [ "," IDENTIFIER ] "in" expression
          [ "key" "=" "{" expression "}" ]
          "{" { jsx_child } "}" ;

jsx_match = "match" expression "{" { pattern "=>" jsx_child } "}" ;
```

## Notes

1. **Newline sensitivity**: Newlines are significant in some contexts. A `[` on a new line is not treated as a subscript, and a `(` on a new line is not treated as a function call of the previous expression.

2. **Semicolons**: Optional. Newlines serve as statement terminators. Semicolons can be used for multiple statements on one line.

3. **Implicit returns**: The last expression in a function body is returned. Explicit `return` is also supported.

4. **`elif` preferred over `else if`**: Chained conditionals use the `elif` keyword. The parser also accepts `else if` for convenience, but `elif` is the idiomatic form.

5. **For loop variables**: `for key, val in pairs {}` uses comma-separated identifiers, not array destructuring.

6. **`Type.new()`**: `Type.new(args)` transpiles to `new Type(args)` in JavaScript for constructing built-in types.

7. **Unquoted JSX text**: Text inside JSX elements can be unquoted (`<h1>Hello World</h1>`) or quoted (`<h1>"Hello World"</h1>`). Unquoted text is scanned as raw `JSX_TEXT` tokens by the lexer. The keywords `if`, `for`, `elif`, `else`, and `match` are reserved for JSX control flow and cannot appear as unquoted text.

8. **String pattern matching**: The `++` operator in patterns matches a string prefix and binds the remainder to a variable: `"api/" ++ rest` matches any string starting with `"api/"` and binds the rest. Note that `++` is implemented as two adjacent `+` tokens, not a distinct operator.

9. **Decorators**: The `@` prefix applies decorators to function declarations. `@wasm` compiles a function to WebAssembly. `@fast` enables TypedArray optimizations. Multiple decorators can be stacked.

10. **Guard clauses**: `guard condition else { ... }` provides early-exit when a condition is not met. The else block must return or exit the enclosing function.

11. **Data and bench blocks**: `data { ... }` defines data sources and transformations (data blocks do not accept a name string, unlike server/browser/shared blocks). `bench "name" { ... }` defines benchmarks. Data blocks support `source`, `pipeline`, `validate`, and `refresh` statements.

12. **`++` is patterns-only**: The `++` operator is only valid in match patterns for string prefix matching. In expression context, use `+` for string concatenation or string interpolation `"text {expr}"`.

13. **Named construction**: Type and variant constructors support named arguments: `User(name: "Alice", age: 30)`. Named arguments are reordered to match the field declaration order at compile time. Positional and named arguments can be mixed (positional first). For regular functions, named arguments are wrapped into a trailing object instead.

14. **Labeled loops**: `for`, `while`, and `loop` statements can be labeled with `label: for ...`, `label: while ...`, or `label: loop { ... }`. `break label` and `continue label` control specific enclosing loops.

15. **Async for loops**: `async for item in items { ... }` iterates asynchronously over an async iterable.

16. **Arrow lambdas accept both `=>` and `->`**: The parser treats both `=>` and `->` as valid arrow tokens in lambda syntax. `x => x * 2` and `x -> x * 2` are equivalent.

17. **Plugin block names are not reserved words**: Unlike other keywords, `test`, `bench`, `data`, `security`, `cli`, `edge`, `concurrent`, `deploy`, and `theme` are detected contextually by the plugin system. They can be used as variable or function names outside of top-level context.

18. **Plugin-based block system**: Top-level blocks (`security`, `cli`, `edge`, `concurrent`, `deploy`, `theme`) are implemented via a plugin registry. Each plugin registers a detection function, parser extension, and codegen handler.

19. **`mut` is reserved but rejected**: The `mut` keyword is reserved to give a helpful error message directing users to `var` instead.

20. **`export` is reserved but unused**: The `export` keyword is reserved but the parser never handles it. Use `pub` for public visibility.

21. **Implicit `it` parameter**: In call arguments, expressions containing a free reference to `it` are automatically wrapped in a lambda `fn(it) expr`. This enables shorthand like `items |> filter(it > 5)` instead of `items |> filter(fn(x) x > 5)`.

22. **Chained comparisons**: Comparison operators can be chained: `1 < x < 10` is equivalent to `1 < x and x < 10`. The parser produces a `ChainedComparison` node when multiple comparison operators appear.

23. **`?` propagation operator**: The postfix `?` operator propagates errors from `Result` and `Option` types. `foo()?` returns the inner value on `Ok`/`Some` and early-returns the error on `Err`/`None`. The `?` must be on the same line as the expression it follows (newline-sensitive).
