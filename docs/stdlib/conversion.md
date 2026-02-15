# Type Conversion

Tova provides safe type conversion functions that return `nil` on failure instead of throwing errors.

## to_int

```tova
to_int(v) -> Int | Nil
```

Converts a value to an integer. Returns nil if conversion fails.

```tova
to_int("42")       // 42
to_int("3.7")      // 3
to_int(3.7)        // 3
to_int(true)       // 1
to_int(false)      // 0
to_int("abc")      // nil
```

## to_float

```tova
to_float(v) -> Float | Nil
```

Converts a value to a floating-point number. Returns nil if conversion fails.

```tova
to_float("3.14")   // 3.14
to_float("42")     // 42.0
to_float(true)     // 1.0
to_float(false)    // 0.0
to_float("abc")    // nil
```

## to_string

```tova
to_string(v) -> String
```

Converts any value to its string representation. Nil becomes `"nil"`, tagged types show their tag.

```tova
to_string(42)      // "42"
to_string(3.14)    // "3.14"
to_string(true)    // "true"
to_string(nil)     // "nil"
to_string(Ok(5))   // "Ok(5)"
to_string(None)    // "None"
```

## to_bool

```tova
to_bool(v) -> Bool
```

Converts a value to a boolean. Strings `""`, `"0"`, and `"false"` are falsy; all other strings are truthy.

```tova
to_bool("")        // false
to_bool("0")       // false
to_bool("false")   // false
to_bool("hello")   // true
to_bool(0)         // false
to_bool(1)         // true
to_bool(nil)       // false
```

---

## Pipeline Examples

```tova
// Parse user input safely
user_input
  |> to_int()
  |> fn(n) if n != nil { clamp(n, 1, 100) } else { 50 }

// Convert list of strings to ints, filtering failures
["1", "2", "abc", "4"]
  |> map(fn(s) to_int(s))
  |> filter(fn(n) n != nil)    // [1, 2, 4]
```
