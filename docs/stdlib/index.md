# Standard Library Overview

Tova provides **220+ built-in functions** that are automatically available in every Tova program. There is nothing to import -- all standard library functions are in scope by default.

## Availability

Standard library functions work everywhere Tova code runs:

- **`tova run`** -- all functions available in scripts and the REPL
- **Server code** -- all functions available in route handlers and server modules
- **Client code** -- functions are **tree-shaken** so only the ones you actually use are included in the browser bundle

## Design Philosophy

Tova's standard library follows a few guiding principles:

- **Functional style** -- most functions take data as the first argument and return new values rather than mutating
- **Result and Option types** -- instead of `throw` and `try/catch`, Tova uses `Ok`/`Err` and `Some`/`None` for principled error handling
- **Pipeable** -- every function works naturally with the pipe operator `|>`
- **Method syntax** -- many functions (especially string functions) can be called as methods: `"hello".upper()` is the same as `upper("hello")`

## Categories at a Glance

| Category | Functions | Page |
|---|---|---|
| **Collections** | `len`, `range`, `filled`, `enumerate`, `sum`, `sorted`, `reversed`, `zip`, `min`, `max`, `typeOf`, `filter`, `map`, `find`, `findIndex`, `includes`, `any`, `all`, `flatMap`, `reduce`, `unique`, `groupBy`, `chunk`, `flatten`, `take`, `drop`, `first`, `last`, `count`, `partition`, `print`, `zipWith`, `frequencies`, `scan`, `minBy`, `maxBy`, `sumBy`, `product`, `slidingWindow`, `intersection`, `difference`, `symmetricDifference`, `isSubset`, `isSuperset`, `union`, `pairwise`, `combinations`, `permutations`, `intersperse`, `interleave`, `repeatValue`, `binarySearch`, `isSorted`, `compact`, `rotate`, `insertAt`, `removeAt`, `updateAt`, `parallelMap` | [Collections](./collections) |
| **Strings** | `trim`, `trimStart`, `trimEnd`, `split`, `join`, `replace`, `replaceFirst`, `repeat`, `upper`, `lower`, `contains`, `startsWith`, `endsWith`, `chars`, `words`, `lines`, `charAt`, `padStart`, `padEnd`, `capitalize`, `titleCase`, `snakeCase`, `camelCase`, `kebabCase`, `indexOf`, `lastIndexOf`, `countOf`, `substr`, `reverseStr`, `center`, `isEmpty`, `truncate`, `wordWrap`, `dedent`, `indentStr`, `slugify`, `escapeHtml`, `unescapeHtml`, `fmt` | [Strings](./strings) |
| **Math & Stats** | `PI`, `E`, `INF`, `abs`, `floor`, `ceil`, `round`, `trunc`, `sign`, `clamp`, `sqrt`, `pow`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `ln`, `log2`, `log10`, `exp`, `isNaN`, `isFinite`, `isClose`, `toRadians`, `toDegrees`, `gcd`, `lcm`, `factorial`, `random`, `randomInt`, `randomFloat`, `choice`, `sample`, `shuffle`, `sleep`, `hypot`, `lerp`, `divmod`, `avg`, `mean`, `median`, `mode`, `stdev`, `variance`, `percentile`, `formatNumber`, `toHex`, `toBinary`, `toOctal`, `toFixed`, `typedSum`, `typedDot`, `typedNorm`, `typedAdd`, `typedScale`, `typedMap`, `typedReduce`, `typedSort`, `typedZeros`, `typedOnes`, `typedFill`, `typedRange`, `typedLinspace` | [Math & Stats](./math) |
| **Objects & Utilities** | `keys`, `values`, `entries`, `merge`, `freeze`, `clone`, `hasKey`, `get`, `fromEntries`, `pick`, `omit`, `mapValues` | [Objects & Utilities](./objects) |
| **Functional** | `compose`, `pipeFn`, `identity`, `memoize`, `debounce`, `throttle`, `once`, `negate`, `partial`, `curry`, `flip` | [Functional](./functional) |
| **Regex** | `regexTest`, `regexMatch`, `regexFindAll`, `regexReplace`, `regexSplit`, `regexCapture`, `regexBuilder` | [Regex](./regex) |
| **Validation** | `isEmail`, `isUrl`, `isNumeric`, `isAlpha`, `isAlphanumeric`, `isUuid`, `isHex` | [Validation](./validation) |
| **URL & UUID** | `uuid`, `parseUrl`, `buildUrl`, `parseQuery`, `buildQuery` | [URL & UUID](./url) |
| **HTTP Client** | `http.get`, `http.post`, `http.put`, `http.patch`, `http.delete`, `http.head`, `http.get_stream` | [HTTP Client](./http) |
| **Date & Time** | `now`, `nowIso`, `dateParse`, `dateFormat`, `dateAdd`, `dateDiff`, `dateFrom`, `datePart`, `timeAgo` | [Date & Time](./datetime) |
| **JSON** | `jsonParse`, `jsonStringify`, `jsonPretty` | [JSON](./json) |
| **Encoding** | `base64Encode`, `base64Decode`, `urlEncode`, `urlDecode`, `hexEncode`, `hexDecode` | [Encoding](./encoding) |
| **Async & Error Handling** | `tryFn`, `tryAsync`, `parallel`, `race`, `timeout`, `retry`, `sleep` | [Async & Error Handling](./async) |
| **Result & Option** | `Ok`, `Err`, `Some`, `None`, `?` (propagation), `filterOk`, `filterErr` | [Result & Option](./result-option) |
| **Type Conversion** | `toInt`, `toFloat`, `toString`, `toBool` | [Type Conversion](./conversion) |
| **Assertions** | `assert`, `assertEq`, `assertNe`, `assertThrows`, `assertSnapshot` | [Assertions](./assertions) |
| **Lazy Iterators** | `iter`, `Seq.filter`, `Seq.map`, `Seq.take`, `Seq.drop`, `Seq.zip`, `Seq.flatMap`, `Seq.enumerate`, `Seq.collect`, `Seq.reduce`, `Seq.first`, `Seq.count`, `Seq.forEach`, `Seq.any`, `Seq.all`, `Seq.find` | [Lazy Iterators](./iterators) |
| **Advanced Collections** | `OrderedDict`, `DefaultDict`, `Counter`, `Deque` | [Advanced Collections](./advanced-collections) |
| **Channels** | `Channel.new`, `ch.send`, `ch.receive`, `ch.close` | [Channels](./channels) |
| **Terminal & CLI** | `color`, `green`, `red`, `yellow`, `blue`, `cyan`, `magenta`, `gray`, `bold`, `dim`, `underline`, `strikethrough`, `table`, `panel`, `progress`, `spin`, `ask`, `confirm`, `choose`, `chooseMany`, `secret` | [Terminal & CLI](./terminal) |
| **Scripting I/O** | `read`, `write`, `fs.exists`, `fs.readText`, `fs.writeText`, `fs.ls`, `fs.mkdir`, `fs.rm`, `fs.globFiles`, `sh`, `exec`, `spawn`, `env`, `args`, `parseArgs`, `exit`, `pathJoin`, `pathBasename`, `pathDirname` | [Scripting I/O](./io) |
| **Tables** | `Table`, `where`, `select`, `derive`, `sortBy`, `groupBy`, `agg`, `window`, `join`, `pivot`, `unpivot`, `explode`, `peek`, `describe` | [Tables](./tables) |
| **Charting** | `barChart`, `lineChart`, `scatterChart`, `histogram`, `pieChart`, `heatmap` | [Charting](./charting) |
| **Sampling** | `sample`, `stratified_sample` | [Sampling](./sampling) |
| **Database** | `sqlite`, `db.query`, `db.exec`, `db.writeTable`, `db.close` | [Database](./database) |
| **Testing** | `Gen.int`, `Gen.float`, `Gen.bool`, `Gen.string`, `Gen.array`, `Gen.oneOf`, `forAll`, `createSpy`, `createMock` | [Testing](./testing) |

## Quick Reference

### I/O

```tova
print("Hello, World!")
print("Name:", name, "Age:", age)
```

### Collections

```tova
len([1, 2, 3])                  // 3
range(5)                         // [0, 1, 2, 3, 4]
sorted([3, 1, 2])               // [1, 2, 3]
zip([1, 2], ["a", "b"])         // [[1, "a"], [2, "b"]]
unique([1, 2, 2, 3])            // [1, 2, 3]
```

### Strings

```tova
upper("hello")                   // "HELLO"
split("a,b,c", ",")             // ["a", "b", "c"]
"hello".contains("ell")         // true
```

### Math

```tova
abs(-5)                          // 5
clamp(15, 0, 10)                // 10
sqrt(16)                         // 4
```

### Objects

```tova
keys({ a: 1, b: 2 })           // ["a", "b"]
merge({ a: 1 }, { b: 2 })      // { a: 1, b: 2 }
get(user, "address.city")       // safe nested access
pick(obj, ["name", "email"])    // select keys
```

### Functional

```tova
double_then_inc = compose(fn(x) x + 1, fn(x) x * 2)
cached = memoize(expensive_fn)
run_once = once(fn() init_app())
```

### JSON & Encoding

```tova
jsonParse('{"a": 1}')          // Ok({ a: 1 })
jsonPretty({ a: 1 })           // formatted JSON string
base64Encode("hello")          // "aGVsbG8="
urlEncode("hello world")       // "hello%20world"
```

### Regex

```tova
regexTest("hello123", "\\d+")         // true
regexReplace("a1b2c3", "\\d", "X")   // "aXbXcX"
regexFindAll("a1b2c3", "\\d")        // [{match: "1"}, ...]
```

### Validation

```tova
isEmail("user@example.com")           // true
isUrl("https://tova.dev")            // true
isUuid("550e8400-e29b-41d4-a716-446655440000")  // true
```

### URL & UUID

```tova
id = uuid()                             // "a1b2c3d4-..."
parseQuery("a=1&b=2")                 // { a: "1", b: "2" }
buildUrl({ host: "api.com", pathname: "/v1" })
```

### HTTP Client

```tova
// GET request
result = http.get("https://api.example.com/users")
data = result.unwrap().body

// POST with JSON body
result = http.post("https://api.example.com/users", { name: "Alice" })

// With query params and bearer auth
result = http.get("https://api.example.com/search", {
  params: { q: "tova", limit: 10 },
  bearer: env("API_TOKEN")
})
```

### Date & Time

```tova
d = dateParse("2024-01-15")           // Ok(Date)
dateFormat(d.unwrap(), "YYYY-MM-DD")  // "2024-01-15"
dateAdd(d.unwrap(), 7, "days")        // Date (7 days later)
timeAgo(d.unwrap())                    // "3 months ago"
```

### Async & Error Handling

```tova
result = tryFn(fn() risky_operation())
data = await parallel([fetch("/a"), fetch("/b")])
data = await retry(fn() fetch("/api"), { times: 3 })
```

### Result & Option

```tova
result = Ok(42)
result.map(fn(x) x * 2)        // Ok(84)
result.unwrap()                  // 42

option = Some("hello")
option.unwrapOr("default")      // "hello"
None.unwrapOr("default")        // "default"
```

### Terminal & CLI

```tova
print("{green("Success: ")}{bold("All tests passed")}")
print(table(data, { headers: ["Name", "Score"] }))
name = await ask("What is your name?")
ok = await confirm("Deploy to production?")
```

### Assertions

```tova
assert(len(items) > 0, "items must not be empty")
assertEq(add(2, 3), 5)
```

## Using with Pipes

All standard library functions are designed to work with the pipe operator `|>`:

```tova
[1, 2, 3, 4, 5]
  |> filter(fn(x) x > 2)
  |> map(fn(x) x * 10)
  |> sum()
// 120

"Hello, World"
  |> lower()
  |> split(", ")
  |> first()
// "hello"
```

## Migration to camelCase

As of v0.9.16, Tova's standard library uses **camelCase** naming for all multi-word functions. The old `snake_case` names still work but emit a deprecation warning:

```tova
// Old (deprecated — produces a warning):
x = group_by(users, fn(u) u.city)

// New (preferred):
x = groupBy(users, fn(u) u.city)
```

The compiler will display a warning with a hint showing the new name:

```
warning: [W_DEPRECATED_STDLIB] 'group_by' is deprecated, use 'groupBy' instead
    --> app.tova:5:5
    |
  5 | x = group_by(users, fn(u) u.city)
    |     ^^^^^^^^
    = hint: rename to groupBy
```

In your IDE, deprecated names will appear with a ~~strikethrough~~ in autocomplete.

### Common renames

| Old name | New name |
|---|---|
| `type_of` | `typeOf` |
| `flat_map` | `flatMap` |
| `group_by` | `groupBy` |
| `sort_by` | `sortBy` |
| `find_index` | `findIndex` |
| `starts_with` | `startsWith` |
| `ends_with` | `endsWith` |
| `json_parse` | `jsonParse` |
| `assert_eq` | `assertEq` |
| `to_int` | `toInt` |
| `to_string` | `toString` |
| `is_empty` | `isEmpty` |
| `table_where` | `tableWhere` |
| `bar_chart` | `barChart` |

The full list of renames is available in the [migration guide](/guide/migration).
