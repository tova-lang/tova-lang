<script setup>
const allPatternsCode = `// Every pattern type in Tova, demonstrated

// 1. Literal patterns
fn http_status(code) {
  match code {
    200 => "OK"
    301 => "Moved Permanently"
    404 => "Not Found"
    500 => "Internal Server Error"
    _ => "Status {code}"
  }
}

print(http_status(200))
print(http_status(404))
print(http_status(418))

// 2. Range patterns
fn season(month) {
  match month {
    3..=5 => "Spring"
    6..=8 => "Summer"
    9..=11 => "Autumn"
    12 => "Winter"
    1..=2 => "Winter"
    _ => "Invalid month"
  }
}

print(season(4))
print(season(11))

// Object patterns
fn greet_role(user) {
  match user {
    { role: "admin" } => "Hello, Administrator!"
    { name, role } => "Hello {name}, you are a {role}"
  }
}
print(greet_role({ name: "Alice", role: "admin" }))
print(greet_role({ name: "Bob", role: "editor" }))

// 3. Binding + guard patterns
fn classify(n) {
  match n {
    0 => "zero"
    n if n < 0 => "negative ({n})"
    n if n % 2 == 0 => "positive even ({n})"
    n => "positive odd ({n})"
  }
}

for val in [-3, 0, 4, 7] {
  print(classify(val))
}`

const variantsCode = `// Variant patterns with ADTs
type Expr {
  Num(value: Float)
  Add(left: Expr, right: Expr)
  Mul(left: Expr, right: Expr)
  Neg(expr: Expr)
}

fn eval_expr(expr) {
  match expr {
    Num(v) => v
    Add(l, r) => eval_expr(l) + eval_expr(r)
    Mul(l, r) => eval_expr(l) * eval_expr(r)
    Neg(e) => 0.0 - eval_expr(e)
  }
}

fn show(expr) {
  match expr {
    Num(v) => to_string(v)
    Add(l, r) => "({show(l)} + {show(r)})"
    Mul(l, r) => "({show(l)} * {show(r)})"
    Neg(e) => "-{show(e)}"
  }
}

// (2 + 3) * -4
expr = Mul(Add(Num(2.0), Num(3.0)), Neg(Num(4.0)))
print("{show(expr)} = {eval_expr(expr)}")`

const commandParserCode = `// PROJECT: Command Parser
// A mini command-line parser using pattern matching

type Command {
  Help
  Quit
  Echo(message: String)
  Add(a: Float, b: Float)
  Repeat(times: Int, message: String)
  Unknown(input: String)
}

fn parse_command(input) {
  cleaned = trim(input)
  match cleaned {
    "help" => Help
    "quit" => Quit
    "echo " ++ msg => Echo(msg)
    "add " ++ args => {
      parts = split(args, " ")
      if len(parts) == 2 {
        Add(to_float(parts[0]), to_float(parts[1]))
      } else {
        Unknown(cleaned)
      }
    }
    "repeat " ++ args => {
      parts = split(args, " ")
      if len(parts) >= 2 {
        n = to_int(parts[0])
        msg = join(drop(parts, 1), " ")
        Repeat(n, msg)
      } else {
        Unknown(cleaned)
      }
    }
    other => Unknown(other)
  }
}

fn execute(cmd) {
  match cmd {
    Help => {
      print("Commands: help, quit, echo <msg>, add <a> <b>, repeat <n> <msg>")
    }
    Quit => print("Goodbye!")
    Echo(msg) => print(msg)
    Add(a, b) => print("{a} + {b} = {a + b}")
    Repeat(n, msg) => {
      for _ in range(n) {
        print(msg)
      }
    }
    Unknown(input) => print("Unknown command: {input}")
  }
}

// Test it
commands = ["help", "echo Hello World!", "add 3.14 2.86", "repeat 3 Tova!", "invalid stuff"]

for input in commands {
  print("> {input}")
  cmd = parse_command(input)
  execute(cmd)
  print("")
}`
</script>

# Chapter 5: Pattern Matching Power

Pattern matching is Tova's crown jewel. It's like `switch` statements from other languages, but vastly more powerful — it can match values, destructure data, check conditions, and the compiler ensures you handle every case.

This chapter takes you from understanding patterns to wielding them with confidence. By the end, you'll build a command parser that showcases every pattern type.

## The Match Expression

Every `match` has a subject (the value being matched) and arms (the patterns to try):

```tova
match subject {
  pattern1 => result1
  pattern2 => result2
  _ => default_result
}
```

Arms are tried top to bottom. The first match wins. `_` is the wildcard that matches anything.

Crucially, `match` is an **expression** — it returns a value:

```tova
label = match status {
  "active" => "ON"
  "paused" => "PAUSED"
  _ => "OFF"
}
```

## The Complete Pattern Catalog

### 1. Literal Patterns

Match exact values — numbers, strings, booleans:

```tova
match status_code {
  200 => "OK"
  404 => "Not Found"
  500 => "Server Error"
  _ => "Unknown"
}

match direction {
  "north" => go_up()
  "south" => go_down()
  _ => stay()
}
```

### 2. Range Patterns

Match a range of values. `..` is exclusive, `..=` is inclusive:

```tova
fn grade(score) {
  match score {
    90..=100 => "A"
    80..90 => "B"     // 80 to 89
    70..80 => "C"
    60..70 => "D"
    0..60 => "F"
    _ => "Invalid"
  }
}
```

### 3. Binding Patterns

Capture the matched value into a variable:

```tova
match value {
  0 => "zero"
  n => "got {n}"
}
```

### 4. Guard Patterns

Add `if` conditions after any pattern:

```tova
match temperature {
  t if t < 0 => "freezing"
  t if t < 15 => "cold"
  t if t < 25 => "comfortable"
  t => "hot ({t}°)"
}
```

Guards are checked after the pattern matches. If the guard fails, matching continues to the next arm.

### 5. Variant Patterns

Match type variants and destructure their fields:

```tova
type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
}

fn area(shape) {
  match shape {
    Circle(r) => 3.14159 * r * r
    Rectangle(w, h) => w * h
  }
}
```

### 6. Array Patterns

Match arrays by structure:

```tova
fn describe(items) {
  match items {
    [] => "empty"
    [x] => "just {x}"
    [x, y] => "{x} and {y}"
    [x, ...rest] => "{x} and {len(rest)} more"
  }
}
```

### 7. String Concat Patterns

Match and split strings with `++`:

```tova
fn classify_url(url) {
  match url {
    "https://" ++ domain => "Secure: {domain}"
    "http://" ++ domain => "Insecure: {domain}"
    "/api/" ++ path => "API endpoint: {path}"
    _ => "Other: {url}"
  }
}
```

### 8. Wildcard Pattern

`_` matches anything without binding:

```tova
match result {
  Ok(value) => use(value)
  Err(_) => handle_error()    // don't care what the error is
}
```

### 9. Object Patterns

Match and destructure objects by their properties:

```tova
fn describe_point(point) {
  match point {
    { x: 0, y: 0 } => "origin"
    { x: 0, y } => "on y-axis at {y}"
    { x, y: 0 } => "on x-axis at {x}"
    { x, y } => "({x}, {y})"
  }
}

print(describe_point({ x: 0, y: 0 }))    // "origin"
print(describe_point({ x: 3, y: 0 }))    // "on x-axis at 3"
print(describe_point({ x: 5, y: 7 }))    // "(5, 7)"
```

Object patterns match when the value has the specified keys. Unmentioned keys are ignored — `{ x }` matches any object with an `x` property, regardless of other properties.

<TryInPlayground :code="allPatternsCode" label="All Pattern Types" />

### 10. Tuple Patterns

Match and destructure tuples by position:

```tova
fn describe_pair(pair) {
  match pair {
    (0, 0) => "origin"
    (x, 0) => "on x-axis at {x}"
    (0, y) => "on y-axis at {y}"
    (x, y) => "point ({x}, {y})"
  }
}

print(describe_pair((0, 0)))     // "origin"
print(describe_pair((3, 0)))     // "on x-axis at 3"
print(describe_pair((5, 7)))     // "point (5, 7)"
```

Tuple patterns are useful with functions that return multiple values:

```tova
fn classify_divmod(a, b) {
  match divmod(a, b) {
    (_, 0) => "evenly divisible"
    (q, r) => "{a} = {b} * {q} + {r}"
  }
}
```

### 11. Boolean and Nil Patterns

Match booleans and nil directly:

```tova
fn truthiness(val) {
  match val {
    true => "yes"
    false => "no"
    nil => "nothing"
    _ => "something else"
  }
}
```

## Combining Patterns

The real power of pattern matching comes from **combining** these pattern types.

### Guards on Variant Patterns

```tova
type Account {
  Free(email: String)
  Premium(email: String, months_left: Int)
}

fn access_level(account) {
  match account {
    Premium(_, months) if months > 0 => "full"
    Premium(_, _) => "expired"
    Free(_) => "basic"
  }
}
```

### Array Patterns with Guards

```tova
fn process_args(args) {
  match args {
    [] => show_help()
    [cmd] if cmd == "--help" => show_help()
    [cmd] if cmd == "--version" => show_version()
    [cmd, ...rest] => run_command(cmd, rest)
  }
}
```

### Nested Destructuring

Patterns can nest arbitrarily deep — variant inside variant, array inside object, any combination:

```tova
type Tree {
  Leaf(value: Int)
  Node(left: Tree, right: Tree)
}

fn tree_sum(tree) {
  match tree {
    Leaf(v) => v
    Node(Leaf(l), Leaf(r)) => l + r
    Node(left, right) => tree_sum(left) + tree_sum(right)
  }
}
```

### Nested Object Patterns

Objects inside objects can be destructured in a single match:

```tova
fn get_city(user) {
  match user {
    { address: { city: "Portland" } } => "Local user"
    { address: { city, country: "US" } } => "US user in {city}"
    { address: { city, country } } => "International: {city}, {country}"
    _ => "No address"
  }
}

fn api_response(response) {
  match response {
    { status: 200, data: { users: [first, ...rest] } } => {
      print("First user: {first.name}, {len(rest)} more")
    }
    { status: 200, data: { users: [] } } => {
      print("No users found")
    }
    { status, error: { message } } => {
      print("Error {status}: {message}")
    }
  }
}
```

## Exhaustive Checking

The compiler warns you when a match doesn't cover all cases:

```tova
type Direction { North, South, East, West }

fn to_arrow(dir) {
  match dir {
    North => "↑"
    South => "↓"
    // Warning: non-exhaustive match — missing: East, West
  }
}
```

This is especially valuable with Result and Option:

```tova
fn process(result) {
  match result {
    Ok(v) => print(v)
    // Warning: non-exhaustive — missing: Err
  }
}
```

::: tip Always Handle Every Case
Even if you think a case can't happen, match it with `_` and log an error. The compiler's exhaustive checking is one of Tova's biggest safety features — work with it, not against it.
:::

## Match in Practice: Expression Trees

Here's a powerful real-world use — an expression evaluator using recursive match:

```tova
type Expr {
  Num(value: Float)
  Add(left: Expr, right: Expr)
  Mul(left: Expr, right: Expr)
  Neg(expr: Expr)
}

fn eval_expr(expr) {
  match expr {
    Num(v) => v
    Add(l, r) => eval_expr(l) + eval_expr(r)
    Mul(l, r) => eval_expr(l) * eval_expr(r)
    Neg(e) => 0.0 - eval_expr(e)
  }
}

fn show(expr) {
  match expr {
    Num(v) => to_string(v)
    Add(l, r) => "({show(l)} + {show(r)})"
    Mul(l, r) => "({show(l)} * {show(r)})"
    Neg(e) => "-{show(e)}"
  }
}

// Build: (2 + 3) * -4
expr = Mul(Add(Num(2.0), Num(3.0)), Neg(Num(4.0)))
print("{show(expr)} = {eval_expr(expr)}")
// "((2 + 3) * -4) = -20"
```

Notice how `eval_expr` and `show` are both recursive — each variant of `Expr` is handled by exactly one arm, and the compiler ensures none are missed.

<TryInPlayground :code="variantsCode" label="Expression Tree" />

## Patterns in Let Destructuring

The same patterns you use in `match` also work with `let` for direct destructuring:

```tova
// Array destructuring with rest
let [first, second, ...remaining] = [1, 2, 3, 4, 5]
print(first)        // 1
print(remaining)    // [3, 4, 5]

// Object destructuring
let { name, age } = { name: "Alice", age: 30, role: "admin" }
print(name)         // "Alice"

// Nested destructuring
let { address: { city, country } } = user
print("Lives in {city}, {country}")

// Tuple destructuring
let (x, y) = get_coordinates()
```

`let` destructuring is a convenience for when you know the shape of your data. If the data might not match the pattern, use `match` instead so you can handle both cases.

## Match vs. If Chains

When should you use `match` instead of `if/elif`?

**Use match when:**
- Comparing one value against multiple possibilities
- Destructuring data (variants, arrays, strings)
- You want exhaustive checking
- The logic maps a value to a result

**Use if/elif when:**
- Conditions involve multiple unrelated variables
- You need complex boolean logic (`&&`, `||`)
- Only two or three branches

```tova
// Match is clearer here
label = match status {
  "active" => "Running"
  "paused" => "On Hold"
  "completed" => "Done"
  _ => "Unknown"
}

// If/elif is clearer here
if age >= 18 && has_id {
  grant_access()
} elif is_accompanied {
  grant_limited_access()
} else {
  deny_access()
}
```

## Multi-Statement Arms

When a match arm needs multiple statements, use braces:

```tova
match command {
  "save" => {
    data = collect_data()
    write_file(data)
    print("Saved successfully")
  }
  "load" => {
    data = read_file()
    update_state(data)
    print("Loaded {len(data)} records")
  }
  _ => print("Unknown command")
}
```

The last expression in the block is still the return value if you're using match as an expression.

## Project: Command Parser

Let's build a fully-featured command parser that combines variant types with string pattern matching:

```tova
type Command {
  Help
  Quit
  Echo(message: String)
  Add(a: Float, b: Float)
  Repeat(times: Int, message: String)
  Unknown(input: String)
}

fn parse_command(input) {
  cleaned = trim(input)
  match cleaned {
    "help" => Help
    "quit" => Quit
    "echo " ++ msg => Echo(msg)
    "add " ++ args => {
      parts = split(args, " ")
      if len(parts) == 2 {
        Add(to_float(parts[0]), to_float(parts[1]))
      } else {
        Unknown(cleaned)
      }
    }
    "repeat " ++ args => {
      parts = split(args, " ")
      if len(parts) >= 2 {
        n = to_int(parts[0])
        msg = join(drop(parts, 1), " ")
        Repeat(n, msg)
      } else {
        Unknown(cleaned)
      }
    }
    other => Unknown(other)
  }
}

fn execute(cmd) {
  match cmd {
    Help => print("Commands: help, quit, echo <msg>, add <a> <b>, repeat <n> <msg>")
    Quit => print("Goodbye!")
    Echo(msg) => print(msg)
    Add(a, b) => print("{a} + {b} = {a + b}")
    Repeat(n, msg) => {
      for _ in range(n) {
        print(msg)
      }
    }
    Unknown(input) => print("Unknown: {input}")
  }
}

// Run some commands
commands = ["help", "echo Hello World!", "add 3.14 2.86", "repeat 3 Tova!", "nonsense"]
for input in commands {
  print("> {input}")
  execute(parse_command(input))
  print("")
}
```

The key technique: **parse into a variant type, then match on the variant to execute.** This separates parsing from execution, making both easier to test and extend.

<TryInPlayground :code="commandParserCode" label="Command Parser" />

## Exercises

**Exercise 5.1:** Extend the expression evaluator to support `Div(left, right)` and `Pow(base, exponent)`. Handle division by zero by returning `0.0` with a printed warning.

**Exercise 5.2:** Write a `simplify(expr)` function that performs basic algebraic simplification:
- `Add(Num(0), x)` or `Add(x, Num(0))` → `x`
- `Mul(Num(1), x)` or `Mul(x, Num(1))` → `x`
- `Mul(Num(0), _)` or `Mul(_, Num(0))` → `Num(0)`
- `Neg(Neg(x))` → `x`

**Exercise 5.3:** Write a `parse_path(path)` function using string concat patterns that returns a structured object. For example, `parse_path("/users/alice/profile.json")` returns `{ segments: ["users", "alice", "profile.json"], filename: "profile.json", extension: "json" }`.

## Challenge

Build a **calculator language** parser. Support:
1. Parsing expressions like `"3 + 4 * 2"` into your Expr type
2. Respecting operator precedence (multiplication before addition)
3. Supporting parentheses for grouping
4. A `format(expr)` function that pretty-prints the tree
5. An `eval_expr(expr)` function that computes the result

---

[← Previous: String Craft](./strings) | [Next: Designing with Types →](./types)
