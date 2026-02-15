# Validation

Tova provides built-in validators for common web patterns. These are especially useful for form validation and input sanitization.

All validators return `Bool` and work naturally in pipelines and guard clauses.

## Email

### is_email

```tova
is_email(s) -> Bool
```

Checks if a string looks like a valid email address (basic format check).

```tova
is_email("user@example.com")          // true
is_email("user@sub.example.com")      // true
is_email("userexample.com")           // false
is_email("user@")                      // false
```

```tova
// Guard clause
guard is_email(email) else {
  Err("Invalid email address")
}
```

---

## URL

### is_url

```tova
is_url(s) -> Bool
```

Checks if a string is a valid URL (must include protocol).

```tova
is_url("https://example.com")             // true
is_url("https://example.com/path?q=1")   // true
is_url("example.com")                     // false (no protocol)
is_url("not a url")                        // false
```

---

## String Type Checks

### is_numeric

```tova
is_numeric(s) -> Bool
```

Returns `true` if the string represents a valid number.

```tova
is_numeric("42")       // true
is_numeric("3.14")     // true
is_numeric("-5")       // true
is_numeric("abc")      // false
is_numeric("")         // false
```

### is_alpha

```tova
is_alpha(s) -> Bool
```

Returns `true` if the string contains only letters (a-z, A-Z).

```tova
is_alpha("Hello")      // true
is_alpha("Hello123")   // false
is_alpha("Hello World")  // false (spaces)
is_alpha("")           // false
```

### is_alphanumeric

```tova
is_alphanumeric(s) -> Bool
```

Returns `true` if the string contains only letters and digits.

```tova
is_alphanumeric("Hello123")    // true
is_alphanumeric("12345")       // true
is_alphanumeric("Hello!")      // false
```

### is_uuid

```tova
is_uuid(s) -> Bool
```

Checks if a string matches the UUID v4 format.

```tova
is_uuid("550e8400-e29b-41d4-a716-446655440000")   // true
is_uuid("not-a-uuid")                               // false
is_uuid("550e8400e29b41d4a716446655440000")         // false (no hyphens)

// Validate generated UUIDs
id = uuid()
is_uuid(id)    // true
```

### is_hex

```tova
is_hex(s) -> Bool
```

Returns `true` if the string contains only hexadecimal characters (0-9, a-f, A-F).

```tova
is_hex("1a2b3c")      // true
is_hex("FF00AA")       // true
is_hex("xyz")          // false
is_hex("")             // false
```

---

## Pipeline Examples

```tova
// Validate form fields
fn validate_form(data) {
  guard is_email(data.email) else { Err("Invalid email") }
  guard is_alphanumeric(data.username) else { Err("Username must be alphanumeric") }
  guard len(data.password) >= 8 else { Err("Password too short") }
  Ok(data)
}

// Filter valid emails from a list
emails
  |> filter(is_email)

// Validate and parse numeric input
fn parse_price(input) {
  guard is_numeric(input) else { Err("Not a number") }
  Ok(to_float(input))
}
```
