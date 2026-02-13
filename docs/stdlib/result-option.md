# Result & Option

Result and Option are Lux's primary error-handling types. Instead of throwing exceptions, Lux functions return `Result` or `Option` values that explicitly represent success/failure or presence/absence.

This is the most important part of the standard library. Master these types and you will write robust, predictable Lux code.

## Overview

| Type | Variants | Use When |
|---|---|---|
| **Result** | `Ok(value)`, `Err(error)` | An operation can succeed or fail with an error |
| **Option** | `Some(value)`, `None` | A value may or may not exist |

```lux
// Result: parsing can fail
fn parse_int(s) {
  n = Int.new(s)
  if n != n {    // NaN check
    Err("not a valid integer: {s}")
  } else {
    Ok(floor(n))
  }
}

// Option: finding might return nothing
fn find_user(id) {
  user = db.get(id)
  if user == null { None } else { Some(user) }
}
```

---

## Result Type

The `Result` type represents the outcome of an operation that can succeed or fail.

### Creating Results

```lux
success = Ok(42)
failure = Err("something went wrong")

Ok({ name: "Alice", age: 30 })
Err({ code: 404, message: "not found" })
```

### Ok Methods

When a Result is `Ok(value)`, these methods behave as follows:

#### .map(fn)

Transforms the success value. Returns `Ok(fn(value))`.

```lux
Ok(5).map(fn(x) x * 2)          // Ok(10)
Ok("hello").map(upper)           // Ok("HELLO")
```

#### .flatMap(fn)

Chains operations that themselves return Results. The function must return an `Ok` or `Err`.

```lux
Ok(5).flatMap(fn(x) {
  if x > 0 { Ok(x * 2) } else { Err("must be positive") }
})
// Ok(10)

Ok(-1).flatMap(fn(x) {
  if x > 0 { Ok(x * 2) } else { Err("must be positive") }
})
// Err("must be positive")
```

#### .unwrap()

Extracts the value from `Ok`. **Throws if called on `Err`**.

```lux
Ok(42).unwrap()                  // 42
// Err("fail").unwrap()          -- throws!
```

#### .unwrapOr(default)

Extracts the value, or returns the default if this is an `Err`.

```lux
Ok(42).unwrapOr(0)               // 42
Err("fail").unwrapOr(0)          // 0
```

#### .expect(msg)

Like `.unwrap()` but throws with a custom message on `Err`.

```lux
Ok(42).expect("should have value")   // 42
// Err("x").expect("oh no")          -- throws "oh no"
```

#### .isOk() / .isErr()

```lux
Ok(42).isOk()                    // true
Ok(42).isErr()                   // false
```

#### .mapErr(fn)

Transforms the error value. On `Ok`, returns self unchanged.

```lux
Ok(42).mapErr(fn(e) "wrapped: {e}")   // Ok(42)  -- no change
```

#### .unwrapErr()

Extracts the error value. **Throws if called on `Ok`**.

```lux
// Ok(42).unwrapErr()            -- throws!
```

#### .or(other)

Returns self (`Ok`) when the result is `Ok`.

```lux
Ok(42).or(Ok(99))                // Ok(42)
```

#### .and(other)

Returns `other` when the result is `Ok`.

```lux
Ok(42).and(Ok(99))               // Ok(99)
Ok(42).and(Err("fail"))          // Err("fail")
```

---

### Err Methods

When a Result is `Err(error)`, these methods behave as follows:

#### .map(fn)

Returns self (`Err`) unchanged. The function is not called.

```lux
Err("fail").map(fn(x) x * 2)    // Err("fail")
```

#### .flatMap(fn)

Returns self (`Err`) unchanged. The function is not called.

```lux
Err("fail").flatMap(fn(x) Ok(x * 2))   // Err("fail")
```

#### .unwrap()

**Throws** with the error value.

```lux
// Err("something broke").unwrap()  -- throws "something broke"
```

#### .unwrapOr(default)

Returns the default value.

```lux
Err("fail").unwrapOr(0)          // 0
Err("fail").unwrapOr("fallback") // "fallback"
```

#### .expect(msg)

**Throws** with the custom message.

```lux
// Err("x").expect("config missing")  -- throws "config missing"
```

#### .isOk() / .isErr()

```lux
Err("fail").isOk()               // false
Err("fail").isErr()              // true
```

#### .mapErr(fn)

Transforms the error value. Returns `Err(fn(error))`.

```lux
Err("not found").mapErr(fn(e) "Error: {e}")
// Err("Error: not found")
```

#### .unwrapErr()

Extracts the error value.

```lux
Err("fail").unwrapErr()          // "fail"
```

#### .or(other)

Returns `other` since this result is an `Err`.

```lux
Err("fail").or(Ok(99))           // Ok(99)
Err("a").or(Err("b"))            // Err("b")
```

#### .and(other)

Returns self (`Err`) since the first result already failed.

```lux
Err("fail").and(Ok(99))          // Err("fail")
```

---

## Complete Result Method Reference

| Method | On `Ok(v)` | On `Err(e)` |
|---|---|---|
| `.map(fn)` | `Ok(fn(v))` | `Err(e)` |
| `.flatMap(fn)` | `fn(v)` (must return Result) | `Err(e)` |
| `.unwrap()` | `v` | throws `e` |
| `.unwrapOr(def)` | `v` | `def` |
| `.expect(msg)` | `v` | throws `msg` |
| `.isOk()` | `true` | `false` |
| `.isErr()` | `false` | `true` |
| `.mapErr(fn)` | `Ok(v)` | `Err(fn(e))` |
| `.unwrapErr()` | throws | `e` |
| `.or(other)` | `Ok(v)` | `other` |
| `.and(other)` | `other` | `Err(e)` |

---

## Option Type

The `Option` type represents a value that may or may not exist. Use it instead of `null` checks.

### Creating Options

```lux
present = Some(42)
absent = None
```

`None` is a singleton -- there is only one `None` value.

### Some Methods

When an Option is `Some(value)`:

#### .map(fn)

Transforms the inner value. Returns `Some(fn(value))`.

```lux
Some(5).map(fn(x) x * 2)        // Some(10)
Some("hello").map(upper)         // Some("HELLO")
```

#### .flatMap(fn)

Chains operations that return Options. The function must return `Some` or `None`.

```lux
Some(5).flatMap(fn(x) {
  if x > 0 { Some(x * 2) } else { None }
})
// Some(10)
```

#### .unwrap()

Extracts the value. **Throws if called on `None`**.

```lux
Some(42).unwrap()                // 42
```

#### .unwrapOr(default)

Extracts the value, or returns the default.

```lux
Some(42).unwrapOr(0)             // 42
```

#### .expect(msg)

Like `.unwrap()` but throws with a custom message on `None`.

```lux
Some(42).expect("need value")    // 42
```

#### .isSome() / .isNone()

```lux
Some(42).isSome()                // true
Some(42).isNone()                // false
```

#### .or(other)

Returns self (`Some`).

```lux
Some(42).or(Some(99))            // Some(42)
```

#### .and(other)

Returns `other` when this Option has a value.

```lux
Some(42).and(Some(99))           // Some(99)
Some(42).and(None)               // None
```

#### .filter(pred)

Returns `Some(value)` if the predicate returns `true`, otherwise `None`.

```lux
Some(5).filter(fn(x) x > 3)     // Some(5)
Some(1).filter(fn(x) x > 3)     // None
```

---

### None Methods

When an Option is `None`:

| Method | Behavior |
|---|---|
| `.map(fn)` | `None` |
| `.flatMap(fn)` | `None` |
| `.unwrap()` | throws |
| `.unwrapOr(def)` | `def` |
| `.expect(msg)` | throws `msg` |
| `.isSome()` | `false` |
| `.isNone()` | `true` |
| `.or(other)` | `other` |
| `.and(other)` | `None` |
| `.filter(pred)` | `None` |

```lux
None.map(fn(x) x * 2)           // None
None.unwrapOr(0)                 // 0
None.or(Some(99))                // Some(99)
None.filter(fn(x) true)         // None
```

---

## Complete Option Method Reference

| Method | On `Some(v)` | On `None` |
|---|---|---|
| `.map(fn)` | `Some(fn(v))` | `None` |
| `.flatMap(fn)` | `fn(v)` (must return Option) | `None` |
| `.unwrap()` | `v` | throws |
| `.unwrapOr(def)` | `v` | `def` |
| `.expect(msg)` | `v` | throws `msg` |
| `.isSome()` | `true` | `false` |
| `.isNone()` | `false` | `true` |
| `.or(other)` | `Some(v)` | `other` |
| `.and(other)` | `other` | `None` |
| `.filter(pred)` | `pred(v) ? Some(v) : None` | `None` |

---

## Propagation Operator `!`

The `!` operator provides concise syntax for unwrapping `Ok`/`Some` values and short-circuiting on `Err`/`None`. It is similar to Rust's `?` operator.

When applied to a value:
- If the value is `Ok(v)` or `Some(v)`, it extracts `v` and execution continues
- If the value is `Err(e)` or `None`, the **enclosing function** immediately returns that `Err` or `None`

```lux
fn process(input) {
  // Without propagation
  result = parse(input)
  if result.isErr() {
    return result
  }
  value = result.unwrap()

  // With propagation -- equivalent to above
  value = parse(input)!
}
```

### Example: Chaining Fallible Operations

```lux
fn process_user(raw_data) {
  // Each ! unwraps Ok or short-circuits with Err
  parsed = parse_json(raw_data)!
  validated = validate_user(parsed)!
  saved = save_to_db(validated)!
  Ok(saved)
}

// Calling it:
match process_user(data) {
  Ok(user) => print("Saved: {user.name}")
  Err(e) => print("Failed: {e}")
}
```

### How It Works Internally

The propagation operator uses a sentinel-based mechanism:

- `__propagate(val)` -- if the value is `Err` or `None`, throws an internal sentinel object; if `Ok` or `Some`, returns the inner value
- The enclosing function catches the sentinel and returns the `Err`/`None` directly

You never need to call `__propagate` manually -- just use the `!` suffix operator.

---

## Practical Patterns

### Chaining with .map() and .flatMap()

Use `.map()` when the transformation cannot fail. Use `.flatMap()` when the transformation itself returns a Result or Option.

```lux
// .map() -- transform cannot fail
Ok(5)
  .map(fn(x) x * 2)
  .map(fn(x) x + 1)
// Ok(11)

// .flatMap() -- each step can fail
fn parse_and_double(s) {
  parse_int(s)
    .flatMap(fn(n) {
      if n > 1000 {
        Err("number too large")
      } else {
        Ok(n * 2)
      }
    })
    .map(fn(n) "Result: {n}")
}

parse_and_double("42")       // Ok("Result: 84")
parse_and_double("abc")      // Err("not a valid integer: abc")
parse_and_double("9999")     // Err("number too large")
```

### Providing Defaults

```lux
// Use .unwrapOr() for a default value
config_port = get_env("PORT")
  .map(fn(s) parse_int(s).unwrapOr(3000))
  .unwrapOr(3000)

// Use .or() to try alternatives
fn find_config() {
  load_file("config.local.json")
    .or(load_file("config.json"))
    .or(Ok(default_config))
}
```

### Pattern Matching on Results and Options

```lux
match fetch_user(id) {
  Ok(user) => render_profile(user)
  Err("not found") => render_404()
  Err(e) => render_error(e)
}

match find(items, fn(x) x.id == target_id) {
  Some(item) => print("Found: {item.name}")
  None => print("Not found")
}
```

### Converting Between Result and Option

```lux
// Result to value-or-null
value = result.unwrapOr(null)

// Check and branch
if result.isOk() {
  handle_success(result.unwrap())
} else {
  handle_error(result.unwrapErr())
}
```

### Error Transformation

```lux
// Wrap low-level errors with context
fn load_user_config(path) {
  read_file(path)
    .mapErr(fn(e) "failed to read config at {path}: {e}")
    .flatMap(fn(content) {
      parse_json(content)
        .mapErr(fn(e) "invalid JSON in config: {e}")
    })
}
```

### When to Use Result vs Option

Use **Result** when:
- An operation can fail and the caller needs to know **why**
- You need to propagate error messages or codes
- The failure represents an error condition

```lux
// Result: the caller needs to know what went wrong
fn divide(a, b) {
  if b == 0 {
    Err("division by zero")
  } else {
    Ok(a / b)
  }
}
```

Use **Option** when:
- A value might simply not exist
- There is no meaningful error to report
- You are doing lookups or searches

```lux
// Option: the item might not exist, and that is fine
fn find_by_name(users, name) {
  result = find(users, fn(u) u.name == name)
  if result == null { None } else { Some(result) }
}
```
