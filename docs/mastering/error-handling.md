<script setup>
const basicResultCode = `// Result: the Tova way to handle errors
fn parse_int(text) {
  cleaned = trim(text)
  if len(cleaned) == 0 {
    Err("Empty string")
  } elif all(chars(cleaned), fn(c) is_numeric(c)) {
    Ok(to_int(cleaned))
  } else {
    Err("Not a number: '{cleaned}'")
  }
}

// Pattern match to handle both cases
inputs = ["42", "  7  ", "abc", "", "100"]
for input in inputs {
  result = parse_int(input)
  message = match result {
    Ok(n) => "Parsed: {n}"
    Err(e) => "Error: {e}"
  }
  print("parse_int(\"{input}\") => {message}")
}`

const chainingCode = `// Method chaining: compose operations without nested matching
fn parse_int_safe(text) {
  cleaned = trim(text)
  if len(cleaned) == 0 { Err("empty") }
  elif all(chars(cleaned), fn(c) is_numeric(c) || c == "-") { Ok(to_int(cleaned)) }
  else { Err("not a number: {cleaned}") }
}

fn validate_positive(n) {
  if n > 0 { Ok(n) } else { Err("must be positive, got {n}") }
}

fn validate_range(n, lo, hi) {
  if lo <= n && n <= hi { Ok(n) }
  else { Err("{n} not in range {lo}..{hi}") }
}

// Chain: parse -> validate positive -> validate range
fn parse_port(text) {
  parse_int_safe(text)
    .flatMap(fn(n) validate_positive(n))
    .flatMap(fn(n) validate_range(n, 1, 65535))
}

tests = ["8080", "-1", "0", "99999", "abc", "443"]
for input in tests {
  result = parse_port(input)
  message = match result {
    Ok(port) => "Valid port: {port}"
    Err(e) => "Invalid: {e}"
  }
  print("parse_port(\"{input}\") => {message}")
}`

const optionCode = `// Option: when a value might not exist
fn find_in(items, predicate) {
  for item in items {
    if predicate(item) { return Some(item) }
  }
  None
}

users = [
  { name: "Alice", role: "admin" },
  { name: "Bob", role: "editor" },
  { name: "Charlie", role: "viewer" }
]

// Find and transform with map, unwrap with default
admin = find_in(users, fn(u) u.role == "admin")
  .map(fn(u) u.name)
  .unwrapOr("none")

print("Admin: {admin}")

// Chain lookups with flatMap
fn find_user(name_query) {
  find_in(users, fn(u) u.name == name_query)
}

fn get_permission(user) {
  match user.role {
    "admin" => Some("all")
    "editor" => Some("write")
    _ => None
  }
}

// flatMap: if user found, then check permission
perm = find_user("Alice")
  .flatMap(fn(u) get_permission(u))
  .unwrapOr("none")

print("Alice's permission: {perm}")

perm2 = find_user("Charlie")
  .flatMap(fn(u) get_permission(u))
  .unwrapOr("none")

print("Charlie's permission: {perm2}")

// unwrapOr: provide a default
greeting = find_user("Dave")
  .map(fn(u) "Hello, {u.name}!")
  .unwrapOr("User not found")

print(greeting)`

const configParserCode = `// PROJECT: Config file parser with error handling

fn parse_config_line(line) {
  trimmed = trim(line)

  // Skip empty lines and comments
  if len(trimmed) == 0 || starts_with(trimmed, "#") {
    return Ok(None)
  }

  // Must contain =
  eq_pos = index_of(trimmed, "=")
  if eq_pos == null {
    return Err("Invalid line (no '='): {trimmed}")
  }

  key_part = trim(substr(trimmed, 0, eq_pos))
  val_part = trim(substr(trimmed, eq_pos + 1))

  if len(key_part) == 0 {
    Err("Empty key in line: {trimmed}")
  } else {
    Ok(Some({ key: key_part, value: val_part }))
  }
}

fn parse_config(text) {
  lines = split(text, "\\n")
  var config = {}
  var errors = []

  for i in range(len(lines)) {
    result = parse_config_line(lines[i])
    match result {
      Ok(Some(entry)) => { config[entry.key] = entry.value }
      Ok(None) => {}
      Err(msg) => { errors.push("Line {i + 1}: {msg}") }
    }
  }

  if len(errors) > 0 {
    Err(errors)
  } else {
    Ok(config)
  }
}

// Test with valid config
valid = "# Database config
host = localhost
port = 5432
database = myapp
# Connection settings
max_connections = 10
timeout = 30"

match parse_config(valid) {
  Ok(cfg) => {
    print("Parsed config:")
    for entry in entries(cfg) {
      print("  {entry[0]} = {entry[1]}")
    }
  }
  Err(errs) => {
    print("Errors:")
    for e in errs { print("  {e}") }
  }
}

print("")

// Test with invalid config
invalid = "# Broken config
host = localhost
this line has no equals
= missing key
port = 5432"

match parse_config(invalid) {
  Ok(_) => print("No errors (unexpected)")
  Err(errs) => {
    print("Found {len(errs)} error(s):")
    for e in errs { print("  {e}") }
  }
}`
</script>

# Chapter 7: Fearless Error Handling

Most languages handle errors with exceptions — invisible control flow that can surprise you anywhere. Tova takes a different approach: errors are **values**. You return them, match on them, chain them, and compose them. Nothing is hidden.

This chapter teaches you to handle errors with confidence. By the end, you'll build a config file parser with complete error handling.

## Result: Success or Failure

A `Result` is either `Ok(value)` or `Err(error)`:

```tova
fn divide(a, b) {
  if b == 0 { Err("Division by zero") }
  else { Ok(a / b) }
}
```

You **must** handle both cases — the compiler won't let you accidentally ignore an error:

```tova
match divide(10, 3) {
  Ok(value) => print("Result: {value}")
  Err(msg) => print("Error: {msg}")
}
```

<TryInPlayground :code="basicResultCode" label="Basic Result" />

### Why Not Exceptions?

With exceptions, any function call might throw. You have to read the implementation (or documentation, if you're lucky) to know what can fail. With Result:

- The return type tells you it can fail
- The compiler ensures you handle the error
- Error paths are visible in the code, not hidden behind try/catch

## Result Methods

Result comes with powerful methods for composing operations:

### `.map(fn)` — Transform the Success Value

```tova
fn parse_number(text) {
  // Returns Ok(number) or Err(message)
}

// Transform the Ok value, leave Err unchanged
parse_number("42").map(fn(n) n * 2)    // Ok(84)
parse_number("abc").map(fn(n) n * 2)   // Err("not a number")
```

### `.flatMap(fn)` — Chain Operations That Can Fail

```tova
fn parse_number(text) { /* ... */ }
fn validate_positive(n) {
  if n > 0 { Ok(n) } else { Err("must be positive") }
}

// flatMap chains: if first succeeds, run second
parse_number("42").flatMap(fn(n) validate_positive(n))    // Ok(42)
parse_number("-5").flatMap(fn(n) validate_positive(n))     // Err("must be positive")
parse_number("abc").flatMap(fn(n) validate_positive(n))    // Err("not a number")
```

`flatMap` is the key to composing fallible operations. Each step in the chain can fail, and the first failure short-circuits the rest.

### `.unwrapOr(default)` — Extract with a Fallback

```tova
parse_number("42").unwrapOr(0)     // 42
parse_number("abc").unwrapOr(0)    // 0
```

### `.isOk()` and `.isErr()` — Quick Checks

```tova
result = divide(10, 0)
if result.isErr() {
  print("Something went wrong")
}
```

<TryInPlayground :code="chainingCode" label="Result Chaining" />

## Option: Something or Nothing

`Option` is either `Some(value)` or `None`. Use it when a value might not exist:

```tova
fn find_user(id) {
  if id == 1 { Some({ name: "Alice", role: "admin" }) }
  else { None }
}
```

### Option Methods

Options have the same methods as Results:

```tova
// .map — transform the value if present
find_user(1).map(fn(u) u.name)     // Some("Alice")
find_user(99).map(fn(u) u.name)    // None

// .flatMap — chain lookups
find_user(1).flatMap(fn(u) get_settings(u.name))

// .unwrapOr — provide a default
find_user(99).unwrapOr({ name: "Guest", role: "viewer" })
```

<TryInPlayground :code="optionCode" label="Option Handling" />

### Option vs. Result: When to Use Which

| Situation | Use |
|-----------|-----|
| A lookup that might not find anything | Option |
| An optional configuration field | Option |
| A function that can fail with a reason | Result |
| Parsing, validation, I/O | Result |
| A value that was never set | Option |
| A value that failed to compute | Result |

## Composition Patterns

### Pattern 1: Validate and Transform

```tova
fn process_input(raw) {
  parse_number(raw)
    .flatMap(fn(n) validate_range(n, 1, 100))
    .map(fn(n) n * 2)
    .map(fn(n) "Result: {n}")
    .unwrapOr("Invalid input")
}
```

Each step in the chain is clear: parse, validate, transform, format, or fall back.

### Pattern 2: Collect All Errors

Sometimes you want to validate multiple fields and report **all** errors, not just the first:

```tova
fn validate_user(data) {
  var errors = []

  if len(data.name) < 2 {
    errors.push("Name too short")
  }
  if !contains(data.email, "@") {
    errors.push("Invalid email")
  }
  if data.age < 0 || data.age > 150 {
    errors.push("Invalid age")
  }

  if len(errors) > 0 { Err(errors) }
  else { Ok(data) }
}
```

### Pattern 3: First Success

Try multiple approaches, take the first one that works:

```tova
fn find_config() {
  // Try locations in order, take the first success
  locations = ["./config.toml", "~/.config/app/config.toml", "/etc/app/config.toml"]

  for loc in locations {
    result = read_config(loc)
    if result.isOk() { return result }
  }

  Err("No config file found")
}
```

### Pattern 4: Provide Context

Wrap lower-level errors with higher-level context:

```tova
fn load_user_profile(user_id) {
  match fetch_from_database(user_id) {
    Ok(data) => Ok(data)
    Err(db_error) => Err("Failed to load profile for user {user_id}: {db_error}")
  }
}
```

### Pattern 5: Recover from Specific Errors

```tova
fn get_setting(key) {
  match load_from_file(key) {
    Ok(value) => Ok(value)
    Err("file not found") => {
      // Fall back to defaults
      Ok(default_for(key))
    }
    Err(other) => Err(other)   // Propagate unexpected errors
  }
}
```

## The `?` Operator

For functions that return Result, the `?` operator propagates errors automatically:

```tova
fn process_file(path) {
  content = read_file(path)?          // Returns Err early if read fails
  parsed = parse_json(content)?        // Returns Err early if parse fails
  validated = validate_schema(parsed)? // Returns Err early if invalid
  Ok(validated)
}
```

Without `?`, this would be deeply nested match expressions. The `?` operator is syntactic sugar for "if Err, return Err immediately."

::: warning `?` Only Works in Functions Returning Result
The `?` operator can only be used inside a function that itself returns a Result. Using it elsewhere is a compile error.
:::

## try/catch: For JavaScript Interop

When calling JavaScript code that might throw, use `try/catch`:

```tova
fn safe_json_parse(text) {
  try {
    Ok(JSON.parse(text))
  } catch err {
    Err("JSON parse error: {err}")
  }
}
```

::: tip Prefer Result Over try/catch
Use `try/catch` only at the boundary with JavaScript code. Within Tova code, prefer returning Result values. This keeps your error handling explicit and composable.
:::

## Project: Config File Parser

Let's build a parser for key-value config files with comments:

```
# Database settings
host = localhost
port = 5432
database = myapp

# Connection pool
max_connections = 10
timeout = 30
```

The parser handles errors gracefully — reporting line numbers and continuing past bad lines:

```tova
fn parse_config_line(line) {
  trimmed = trim(line)

  // Skip empty lines and comments
  if len(trimmed) == 0 || starts_with(trimmed, "#") {
    return Ok(None)
  }

  // Must contain =
  eq_pos = index_of(trimmed, "=")
  if eq_pos == null {
    return Err("Invalid line (no '='): {trimmed}")
  }

  key_part = trim(substr(trimmed, 0, eq_pos))
  val_part = trim(substr(trimmed, eq_pos + 1))

  if len(key_part) == 0 {
    Err("Empty key in line: {trimmed}")
  } else {
    Ok(Some({ key: key_part, value: val_part }))
  }
}

fn parse_config(text) {
  lines = split(text, "\n")
  var config = {}
  var errors = []

  for i in range(len(lines)) {
    match parse_config_line(lines[i]) {
      Ok(Some(entry)) => { config[entry.key] = entry.value }
      Ok(None) => {}      // Skip comments and blank lines
      Err(msg) => { errors.push("Line {i + 1}: {msg}") }
    }
  }

  if len(errors) > 0 { Err(errors) }
  else { Ok(config) }
}
```

Notice the three-way Result pattern: `Ok(Some(data))` for parsed lines, `Ok(None)` for lines to skip, and `Err(message)` for invalid lines. This lets us accumulate all errors before reporting.

<TryInPlayground :code="configParserCode" label="Config Parser" />

## Exercises

**Exercise 7.1:** Write a `parse_date(text)` function that parses "YYYY-MM-DD" format. Return `Err` for invalid formats, invalid month (1-12), or invalid day (1-31). Chain validations using `flatMap`.

**Exercise 7.2:** Write a `safe_get(obj, path)` function that takes an object and a dot-separated path like `"user.address.city"` and returns `Option`. `safe_get({user: {address: {city: "Portland"}}}, "user.address.city")` returns `Some("Portland")`, while an invalid path returns `None`.

**Exercise 7.3:** Build a mini form validator. Given an object of field values and an array of validation rules (each a function returning Result), run all validations and collect all errors. Return `Ok(data)` if all pass, or `Err(errors_array)` if any fail.

## Challenge

Build a **JSON parser** (simplified). Support:
1. Strings (`"hello"`)
2. Numbers (`42`, `3.14`)
3. Booleans (`true`, `false`)
4. Null
5. Arrays (`[1, 2, 3]`)
6. Objects (`{"key": "value"}`)

Return `Result` at every level. Use `flatMap` to chain sub-parsers. Invalid JSON should produce helpful error messages including the position where parsing failed.

---

[← Previous: Designing with Types](./types) | [Next: Pipes and Transformations →](./pipes)
