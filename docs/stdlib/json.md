# JSON

Tova provides safe JSON functions that integrate with the Result type for error handling.

## Parsing

### json_parse

```tova
json_parse(s) -> Result
```

Parses a JSON string. Returns `Ok(value)` on success or `Err(message)` on failure -- no exceptions.

```tova
json_parse('{"name": "Alice", "age": 30}')
// Ok({ name: "Alice", age: 30 })

json_parse('[1, 2, 3]')
// Ok([1, 2, 3])

json_parse('invalid json')
// Err("Unexpected token ...")

// Safe usage with Result
match json_parse(input) {
  Ok(data) => process(data)
  Err(msg) => print("Parse error: {msg}")
}
```

---

## Serialization

### json_stringify

```tova
json_stringify(v) -> String
```

Converts a value to a compact JSON string.

```tova
json_stringify({ name: "Alice", age: 30 })
// '{"name":"Alice","age":30}'

json_stringify([1, 2, 3])
// '[1,2,3]'

json_stringify("hello")
// '"hello"'
```

### json_pretty

```tova
json_pretty(v) -> String
```

Converts a value to a pretty-printed JSON string with 2-space indentation. Useful for debugging and display.

```tova
json_pretty({ name: "Alice", scores: [90, 85, 92] })
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
  |> json_parse()
  |> fn(r) r.map(fn(data) omit(data, ["internal"]))
  |> fn(r) r.map(fn(data) json_pretty(data))

// Parse a list of JSON strings, keeping only successful parses
json_strings
  |> map(json_parse)
  |> filter(fn(r) r.isOk())
  |> map(fn(r) r.unwrap())
```
