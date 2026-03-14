# JSON

Tova provides safe JSON functions that integrate with the Result type for error handling.

## Parsing

### json_parse

```tova
jsonParse(s) -> Result
```

Parses a JSON string. Returns `Ok(value)` on success or `Err(message)` on failure -- no exceptions.

```tova
jsonParse('{"name": "Alice", "age": 30}')
// Ok({ name: "Alice", age: 30 })

jsonParse('[1, 2, 3]')
// Ok([1, 2, 3])

jsonParse('invalid json')
// Err("Unexpected token ...")

// Safe usage with Result
match jsonParse(input) {
  Ok(data) => process(data)
  Err(msg) => print("Parse error: {msg}")
}
```

---

## Serialization

### json_stringify

```tova
jsonStringify(v) -> String
```

Converts a value to a compact JSON string.

```tova
jsonStringify({ name: "Alice", age: 30 })
// '{"name":"Alice","age":30}'

jsonStringify([1, 2, 3])
// '[1,2,3]'

jsonStringify("hello")
// '"hello"'
```

### json_pretty

```tova
jsonPretty(v) -> String
```

Converts a value to a pretty-printed JSON string with 2-space indentation. Useful for debugging and display.

```tova
jsonPretty({ name: "Alice", scores: [90, 85, 92] })
// {
//   "name": "Alice",
//   "scores": [
//     90,
//     85,
//     92
//   ]
// }
```

---

## Pipeline Examples

```tova
// Parse, transform, re-serialize
raw_json
  |> jsonParse()
  |> fn(r) r.map(fn(data) omit(data, ["internal"]))
  |> fn(r) r.map(fn(data) jsonPretty(data))

// Parse a list of JSON strings, keeping only successful parses
json_strings
  |> map(json_parse)
  |> filter(fn(r) r.isOk())
  |> map(fn(r) r.unwrap())
```
