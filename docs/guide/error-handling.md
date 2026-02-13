# Error Handling

Tova takes a deliberate approach to error handling: there is **no `throw` keyword**. Instead, Tova uses the `Result` and `Option` types to represent operations that can fail or produce no value. This makes error paths explicit and forces you to handle them, rather than letting exceptions silently propagate.

## Philosophy

In many languages, errors are thrown as exceptions and caught elsewhere -- or not caught at all, crashing the program. Tova avoids this by encoding success and failure directly in the type system:

- **Result** -- an operation that can succeed (`Ok`) or fail (`Err`)
- **Option** -- a value that may exist (`Some`) or not (`None`)

Both are ordinary values you can pass around, store, and pattern match on. No surprises.

## The Result Type

`Result<T, E>` represents an operation that either produces a value of type `T` or an error of type `E`:

```tova
fn divide(a: Float, b: Float) -> Result<Float, String> {
  if b == 0 {
    Err("Division by zero")
  } else {
    Ok(a / b)
  }
}
```

### Pattern Matching on Result

The most explicit way to handle a `Result`:

```tova
match divide(10.0, 3.0) {
  Ok(value) => print("Result: {value}")
  Err(error) => print("Error: {error}")
}
```

### Result Methods

Result comes with a rich set of methods for working with success and error values:

#### Transforming Values

```tova
// .map() -- transform the Ok value, pass through Err
result = Ok(5)
doubled = result.map(fn(x) x * 2)   // Ok(10)

err_result = Err("fail")
err_result.map(fn(x) x * 2)         // Err("fail") -- unchanged

// .flatMap() -- chain operations that return Results
fn parse_int(s) { /* returns Result<Int, String> */ }
fn validate_positive(n) {
  if n > 0 { Ok(n) } else { Err("must be positive") }
}

result = parse_int("42").flatMap(fn(n) validate_positive(n))
// Ok(42)

result = parse_int("-5").flatMap(fn(n) validate_positive(n))
// Err("must be positive")

// .mapErr() -- transform the error value
result = Err("not found")
result.mapErr(fn(e) "Error: {e}")   // Err("Error: not found")
```

#### Extracting Values

```tova
// .unwrap() -- get the Ok value, or panic on Err
Ok(42).unwrap()       // 42
Err("fail").unwrap()  // PANIC!

// .unwrapOr(default) -- get the Ok value, or use a default
Ok(42).unwrapOr(0)       // 42
Err("fail").unwrapOr(0)  // 0

// .expect(message) -- like unwrap but with a custom error message
Ok(42).expect("should have value")       // 42
Err("fail").expect("should have value")  // PANIC: "should have value"

// .unwrapErr() -- get the Err value (panics if Ok)
Err("fail").unwrapErr()   // "fail"
Ok(42).unwrapErr()        // PANIC!
```

#### Checking State

```tova
// .isOk() and .isErr()
Ok(42).isOk()       // true
Ok(42).isErr()      // false
Err("x").isOk()     // false
Err("x").isErr()    // true
```

#### Combining Results

```tova
// .or(other) -- return self if Ok, otherwise return other
Ok(1).or(Ok(2))        // Ok(1)
Err("a").or(Ok(2))     // Ok(2)
Err("a").or(Err("b"))  // Err("b")

// .and(other) -- return other if self is Ok, otherwise return self's Err
Ok(1).and(Ok(2))       // Ok(2)
Ok(1).and(Err("b"))    // Err("b")
Err("a").and(Ok(2))    // Err("a")
```

## The Option Type

`Option<T>` represents a value that may or may not exist. It is the safe alternative to `nil`:

```tova
fn find_user(id: Int) -> Option<User> {
  user = db.query("SELECT * FROM users WHERE id = ?", id)
  if user != nil {
    Some(user)
  } else {
    None
  }
}
```

### Pattern Matching on Option

```tova
match find_user(1) {
  Some(user) => print("Hello, {user.name}!")
  None => print("User not found")
}
```

### Option Methods

Option provides a similar method set to Result:

#### Transforming Values

```tova
// .map() -- transform the inner value if Some
Some(5).map(fn(x) x * 2)    // Some(10)
None.map(fn(x) x * 2)       // None

// .flatMap() -- chain operations that return Options
fn find_user(id) { /* returns Option<User> */ }
fn find_email(user) { /* returns Option<String> */ }

email = find_user(1).flatMap(fn(u) find_email(u))
// Some("alice@example.com") or None
```

#### Extracting Values

```tova
// .unwrap() -- get the value, or panic on None
Some(42).unwrap()    // 42
None.unwrap()        // PANIC!

// .unwrapOr(default) -- get the value, or use a default
Some(42).unwrapOr(0)    // 42
None.unwrapOr(0)        // 0

// .expect(message) -- like unwrap with a custom error
Some(42).expect("missing")    // 42
None.expect("missing")        // PANIC: "missing"
```

#### Checking State

```tova
// .isSome() and .isNone()
Some(42).isSome()    // true
Some(42).isNone()    // false
None.isSome()        // false
None.isNone()        // true
```

#### Combining and Filtering

```tova
// .or(other) -- return self if Some, otherwise other
Some(1).or(Some(2))    // Some(1)
None.or(Some(2))       // Some(2)
None.or(None)          // None

// .and(other) -- return other if self is Some, otherwise None
Some(1).and(Some(2))   // Some(2)
Some(1).and(None)      // None
None.and(Some(2))      // None

// .filter(predicate) -- keep the value only if predicate returns true
Some(5).filter(fn(x) x > 3)    // Some(5)
Some(2).filter(fn(x) x > 3)    // None
None.filter(fn(x) x > 3)       // None
```

## Error Propagation with `!`

The `!` operator propagates errors upward. If the expression evaluates to `Err` (for Result) or `None` (for Option), the function immediately returns that error. Otherwise, it unwraps the success value:

```tova
fn process_data(input: String) -> Result<Data, String> {
  parsed = parse(input)!           // return Err early if parse fails
  validated = validate(parsed)!    // return Err early if validation fails
  transformed = transform(validated)!
  Ok(transformed)
}
```

This is equivalent to the more verbose pattern matching version:

```tova
fn process_data(input: String) -> Result<Data, String> {
  match parse(input) {
    Err(e) => return Err(e)
    Ok(parsed) => {
      match validate(parsed) {
        Err(e) => return Err(e)
        Ok(validated) => {
          match transform(validated) {
            Err(e) => return Err(e)
            Ok(transformed) => Ok(transformed)
          }
        }
      }
    }
  }
}
```

The `!` operator eliminates this nesting and makes the happy path the primary reading path.

## Try / Catch for JavaScript Interop

When calling JavaScript APIs that may throw exceptions, use `try`/`catch` to convert them into Tova-style error handling:

```tova
fn parse_json(input: String) -> Result<Object, String> {
  try {
    Ok(JSON.parse(input))
  } catch err {
    Err("Invalid JSON: {err.message}")
  }
}
```

```tova
fn read_file_safe(path: String) -> Result<String, String> {
  try {
    content = fs.readFileSync(path, "utf8")
    Ok(content)
  } catch err {
    Err("Could not read {path}: {err.message}")
  }
}
```

::: tip
Use try/catch at the boundary between Tova and JavaScript. Inside pure Tova code, prefer Result and Option.
:::

## Chaining Methods

The real power emerges when you chain Result and Option methods together:

```tova
fn get_user_display_name(id: Int) -> String {
  find_user(id)
    .map(fn(u) u.display_name)
    .unwrapOr("Anonymous")
}
```

```tova
fn process_config(path: String) -> Result<Config, String> {
  read_file(path)
    .mapErr(fn(e) "File error: {e}")
    .flatMap(fn(content) parse_json(content))
    .mapErr(fn(e) "Parse error: {e}")
    .flatMap(fn(data) validate_config(data))
    .mapErr(fn(e) "Validation error: {e}")
}
```

## Practical Tips

**Default to Result for operations that can fail.** File I/O, network calls, parsing, validation -- all of these should return `Result`.

**Use Option when absence is expected, not an error.** Looking up a user by ID where "not found" is a normal case? Use `Option`. Connecting to a required database that should always be available? Use `Result`.

**Prefer `.unwrapOr()` over `.unwrap()`.** The `.unwrap()` method panics on error. In production code, almost always provide a sensible default with `.unwrapOr()` or handle the error explicitly with pattern matching.

**Use `!` to keep code flat.** When chaining several fallible operations, the `!` operator produces clean, linear code instead of deeply nested match expressions.

```tova
// Clean and readable
fn load_config() -> Result<Config, String> {
  content = read_file("config.json")!
  parsed = parse_json(content)!
  validated = validate(parsed)!
  Ok(validated)
}
```
