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

## Patterns

### Building Objects from Arrays

```tova
// Convert entries back to an object
pairs = [["name", "Alice"], ["age", 30]]

result = reduce(pairs, fn(acc, pair) {
  merge(acc, { [pair[0]]: pair[1] })
}, {})
// { name: "Alice", age: 30 }
```

### Filtering Object Keys

```tova
// Keep only specific keys
fn pick(obj, wanted_keys) {
  entries(obj)
    |> filter(fn(pair) contains(wanted_keys, pair[0]))
    |> reduce(fn(acc, pair) merge(acc, { [pair[0]]: pair[1] }), {})
}

pick({ a: 1, b: 2, c: 3 }, ["a", "c"])
// { a: 1, c: 3 }
```

### Transforming Values

```tova
// Double all numeric values in an object
scores = { math: 85, science: 92, english: 78 }

scores
  |> entries()
  |> map(fn(pair) [pair[0], pair[1] * 2])
  |> reduce(fn(acc, pair) merge(acc, { [pair[0]]: pair[1] }), {})
// { math: 170, science: 184, english: 156 }
```
