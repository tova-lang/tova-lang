# Validation

Tova provides built-in validators for common web patterns. These are especially useful for form validation and input sanitization.

All validators return `Bool` and work naturally in pipelines and guard clauses.

## Email

### is_email

```tova
isEmail(s) -> Bool
```

Checks if a string looks like a valid email address (basic format check).

```tova
isEmail("user@example.com")          // true
isEmail("user@sub.example.com")      // true
isEmail("userexample.com")           // false
isEmail("user@")                      // false
```

```tova
// Guard clause
guard isEmail(email) else {
  Err("Invalid email address")
}
```

---

## URL

### is_url

```tova
isUrl(s) -> Bool
```

Checks if a string is a valid URL (must include protocol).

```tova
isUrl("https://example.com")             // true
isUrl("https://example.com/path?q=1")   // true
isUrl("example.com")                     // false (no protocol)
isUrl("not a url")                        // false
```

---

## String Type Checks

### is_numeric

```tova
isNumeric(s) -> Bool
```

Returns `true` if the string represents a valid number.

```tova
isNumeric("42")       // true
isNumeric("3.14")     // true
isNumeric("-5")       // true
isNumeric("abc")      // false
isNumeric("")         // false
```

### is_alpha

```tova
isAlpha(s) -> Bool
```

Returns `true` if the string contains only letters (a-z, A-Z).

```tova
isAlpha("Hello")      // true
isAlpha("Hello123")   // false
isAlpha("Hello World")  // false (spaces)
isAlpha("")           // false
```

### is_alphanumeric

```tova
isAlphanumeric(s) -> Bool
```

Returns `true` if the string contains only letters and digits.

```tova
isAlphanumeric("Hello123")    // true
isAlphanumeric("12345")       // true
isAlphanumeric("Hello!")      // false
```

### is_uuid

```tova
isUuid(s) -> Bool
```

Checks if a string matches the UUID v4 format.

```tova
isUuid("550e8400-e29b-41d4-a716-446655440000")   // true
isUuid("not-a-uuid")                               // false
isUuid("550e8400e29b41d4a716446655440000")         // false (no hyphens)

// Validate generated UUIDs
id = uuid()
isUuid(id)    // true
```

### is_hex

```tova
isHex(s) -> Bool
```

Returns `true` if the string contains only hexadecimal characters (0-9, a-f, A-F).

```tova
isHex("1a2b3c")      // true
isHex("FF00AA")       // true
isHex("xyz")          // false
isHex("")             // false
```

---

## Pipeline Examples

```tova
// Validate form fields
fn validate_form(data) {
  guard isEmail(data.email) else { Err("Invalid email") }
  guard isAlphanumeric(data.username) else { Err("Username must be alphanumeric") }
  guard len(data.password) >= 8 else { Err("Password too short") }
  Ok(data)
}

// Filter valid emails from a list
emails
  |> filter(is_email)

// Validate and parse numeric input
fn parse_price(input) {
  guard isNumeric(input) else { Err("Not a number") }
  Ok(toFloat(input))
}
```
