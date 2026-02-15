# Objects & Utilities

Tova provides functions for working with objects (key-value maps). These functions make it easy to inspect, transform, and combine objects.

## Inspecting Objects

### keys

```tova
keys(obj) -> List[String]
```

Returns an array of the object's keys.

```tova
keys({ name: "Alice", age: 30 })
// ["name", "age"]

keys({})
// []
```

```tova
// Check if an object has a specific key
fn has_key(obj, key) {
  contains(keys(obj), key)
}
```

### values

```tova
values(obj) -> List
```

Returns an array of the object's values.

```tova
values({ name: "Alice", age: 30 })
// ["Alice", 30]

values({ a: 1, b: 2, c: 3 }) |> sum()
// 6
```

### entries

```tova
entries(obj) -> List[[String, T]]
```

Returns an array of `[key, value]` pairs.

```tova
entries({ name: "Alice", age: 30 })
// [["name", "Alice"], ["age", 30]]
```

```tova
// Convert object to formatted string
config = { host: "localhost", port: 3000, debug: true }

config
  |> entries()
  |> map(fn(pair) "{pair[0]}={pair[1]}")
  |> join(", ")
// "host=localhost, port=3000, debug=true"
```

---

## Combining & Copying

### merge

```tova
merge(...objs) -> Object
```

Shallow-merges multiple objects together. Later objects override earlier ones for duplicate keys.

```tova
merge({ a: 1 }, { b: 2 })
// { a: 1, b: 2 }

merge({ a: 1, b: 2 }, { b: 3, c: 4 })
// { a: 1, b: 3, c: 4 }

// Merge multiple objects
defaults = { theme: "light", lang: "en", debug: false }
user_prefs = { theme: "dark" }
overrides = { debug: true }

merge(defaults, user_prefs, overrides)
// { theme: "dark", lang: "en", debug: true }
```

### clone

```tova
clone(obj) -> Object
```

Creates a deep clone of an object. Nested objects and arrays are fully copied, not shared by reference.

```tova
original = { name: "Alice", scores: [90, 85, 92] }
copy = clone(original)

// Modifying the copy does not affect the original
copy.scores[0] = 100
print(original.scores[0])   // 90
```

---

## Immutability

### freeze

```tova
freeze(obj) -> Object
```

Makes an object immutable. Any attempt to modify the object's properties after freezing will have no effect (in strict mode, it throws an error).

```tova
config = freeze({
  api_url: "https://api.example.com",
  timeout: 5000,
  max_retries: 3
})

// config.timeout = 10000  -- this would have no effect or throw
```

```tova
// Freeze is useful for constants
COLORS = freeze({
  red: "#ff0000",
  green: "#00ff00",
  blue: "#0000ff"
})
```

---

## Inspecting & Accessing

### has_key

```tova
has_key(obj, key) -> Bool
```

Returns `true` if the object has the given key. Safely handles `nil`.

```tova
has_key({ name: "Alice", age: 30 }, "name")   // true
has_key({ name: "Alice" }, "email")             // false
has_key(nil, "anything")                        // false
```

### get

```tova
get(obj, path, default?) -> T | Nil
```

Safe nested property access using a dot-separated path string or array of keys. Returns `nil` (or the default) if any part of the path is missing.

```tova
user = { name: "Alice", address: { city: "NYC", zip: "10001" } }

get(user, "address.city")           // "NYC"
get(user, "address.country")        // nil
get(user, "address.country", "US")  // "US"

// Array path syntax
get(user, ["address", "zip"])       // "10001"
```

### from_entries

```tova
from_entries(pairs) -> Object
```

Creates an object from an array of `[key, value]` pairs. The inverse of `entries()`.

```tova
from_entries([["name", "Alice"], ["age", 30]])
// { name: "Alice", age: 30 }

// Round-trip: entries → transform → from_entries
{ a: 1, b: 2 }
  |> entries()
  |> map(fn(pair) [pair[0], pair[1] * 10])
  |> from_entries()
// { a: 10, b: 20 }
```

---

## Selecting & Transforming

### pick

```tova
pick(obj, keys) -> Object
```

Returns a new object containing only the specified keys.

```tova
pick({ a: 1, b: 2, c: 3 }, ["a", "c"])
// { a: 1, c: 3 }

// Extract public fields from a user object
pick(user, ["name", "email", "avatar"])
```

### omit

```tova
omit(obj, keys) -> Object
```

Returns a new object with the specified keys removed.

```tova
omit({ a: 1, b: 2, c: 3 }, ["b"])
// { a: 1, c: 3 }

// Remove sensitive fields before sending to client
omit(user, ["password", "ssn", "internal_id"])
```

### map_values

```tova
map_values(obj, fn) -> Object
```

Transforms each value in the object using a function. The function receives `(value, key)`.

```tova
map_values({ a: 1, b: 2, c: 3 }, fn(v) v * 10)
// { a: 10, b: 20, c: 30 }

map_values({ math: 85, science: 92 }, fn(v, k) "{k}: {v}%")
// { math: "math: 85%", science: "science: 92%" }
```

---

## Patterns

### Pipeline with Object Functions

```tova
// Clean and reshape config
config
  |> omit(["internal", "debug"])
  |> map_values(fn(v) to_string(v))

// Combine two sources, keeping only needed fields
merge(defaults, user_prefs)
  |> pick(["theme", "lang", "timezone"])
```
