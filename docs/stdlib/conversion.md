# Type Conversion

Tova provides safe type conversion functions that return `nil` on failure instead of throwing errors.

## to_int

```tova
toInt(v) -> Int | Nil
```

Converts a value to an integer. Returns nil if conversion fails.

```tova
toInt("42")       // 42
toInt("3.7")      // 3
toInt(3.7)        // 3
toInt(true)       // 1
toInt(false)      // 0
toInt("abc")      // nil
```

## to_float

```tova
toFloat(v) -> Float | Nil
```

Converts a value to a floating-point number. Returns nil if conversion fails.

```tova
toFloat("3.14")   // 3.14
toFloat("42")     // 42.0
toFloat(true)     // 1.0
toFloat(false)    // 0.0
toFloat("abc")    // nil
```

## to_string

```tova
toString(v) -> String
```

Converts any value to its string representation. Nil becomes `"nil"`, tagged types show their tag.

```tova
toString(42)      // "42"
toString(3.14)    // "3.14"
toString(true)    // "true"
toString(nil)     // "nil"
toString(Ok(5))   // "Ok(5)"
toString(None)    // "None"
```

## to_bool

```tova
toBool(v) -> Bool
```

Converts a value to a boolean. Strings `""`, `"0"`, and `"false"` are falsy; all other strings are truthy.

```tova
toBool("")        // false
toBool("0")       // false
toBool("false")   // false
toBool("hello")   // true
toBool(0)         // false
toBool(1)         // true
toBool(nil)       // false
```

---

## Pipeline Examples

```tova
// Parse user input safely
user_input
  |> toInt()
  |> fn(n) if n != nil { clamp(n, 1, 100) } else { 50 }

// Convert list of strings to ints, filtering failures
["1", "2", "abc", "4"]
  |> map(fn(s) toInt(s))
  |> filter(fn(n) n != nil)    // [1, 2, 4]
```
