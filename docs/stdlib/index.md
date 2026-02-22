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
| **Collections** | `len`, `range`, `enumerate`, `sum`, `sorted`, `reversed`, `zip`, `min`, `max`, `type_of`, `filter`, `map`, `find`, `find_index`, `includes`, `any`, `all`, `flat_map`, `reduce`, `unique`, `group_by`, `chunk`, `flatten`, `take`, `drop`, `first`, `last`, `count`, `partition`, `print`, `zip_with`, `frequencies`, `scan`, `min_by`, `max_by`, `sum_by`, `product`, `sliding_window`, `intersection`, `difference`, `symmetric_difference`, `is_subset`, `is_superset`, `union`, `pairwise`, `combinations`, `permutations`, `intersperse`, `interleave`, `repeat_value`, `binary_search`, `is_sorted`, `compact`, `rotate`, `insert_at`, `remove_at`, `update_at` | [Collections](./collections) |
| **Strings** | `trim`, `trim_start`, `trim_end`, `split`, `join`, `replace`, `replace_first`, `repeat`, `upper`, `lower`, `contains`, `starts_with`, `ends_with`, `chars`, `words`, `lines`, `char_at`, `pad_start`, `pad_end`, `capitalize`, `title_case`, `snake_case`, `camel_case`, `kebab_case`, `index_of`, `last_index_of`, `count_of`, `substr`, `reverse_str`, `center`, `is_empty`, `truncate`, `word_wrap`, `dedent`, `indent_str`, `slugify`, `escape_html`, `unescape_html`, `fmt` | [Strings](./strings) |
| **Math & Stats** | `PI`, `E`, `INF`, `abs`, `floor`, `ceil`, `round`, `trunc`, `sign`, `clamp`, `sqrt`, `pow`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `log`, `log2`, `log10`, `exp`, `is_nan`, `is_finite`, `is_close`, `to_radians`, `to_degrees`, `gcd`, `lcm`, `factorial`, `random`, `random_int`, `random_float`, `choice`, `sample`, `shuffle`, `sleep`, `hypot`, `lerp`, `divmod`, `avg`, `mean`, `median`, `mode`, `stdev`, `variance`, `percentile`, `format_number`, `to_hex`, `to_binary`, `to_octal`, `to_fixed` | [Math & Stats](./math) |
| **Objects & Utilities** | `keys`, `values`, `entries`, `merge`, `freeze`, `clone`, `has_key`, `get`, `from_entries`, `pick`, `omit`, `map_values` | [Objects & Utilities](./objects) |
| **Functional** | `compose`, `pipe_fn`, `identity`, `memoize`, `debounce`, `throttle`, `once`, `negate`, `partial`, `curry`, `flip` | [Functional](./functional) |
| **Regex** | `regex_test`, `regex_match`, `regex_find_all`, `regex_replace`, `regex_split`, `regex_capture`, `regex_builder` | [Regex](./regex) |
| **Validation** | `is_email`, `is_url`, `is_numeric`, `is_alpha`, `is_alphanumeric`, `is_uuid`, `is_hex` | [Validation](./validation) |
| **URL & UUID** | `uuid`, `parse_url`, `build_url`, `parse_query`, `build_query` | [URL & UUID](./url) |
| **Date & Time** | `now`, `now_iso`, `date_parse`, `date_format`, `date_add`, `date_diff`, `date_from`, `date_part`, `time_ago` | [Date & Time](./datetime) |
| **JSON** | `json_parse`, `json_stringify`, `json_pretty` | [JSON](./json) |
| **Encoding** | `base64_encode`, `base64_decode`, `url_encode`, `url_decode`, `hex_encode`, `hex_decode` | [Encoding](./encoding) |
| **Async & Error Handling** | `try_fn`, `try_async`, `parallel`, `race`, `timeout`, `retry`, `sleep` | [Async & Error Handling](./async) |
| **Result & Option** | `Ok`, `Err`, `Some`, `None`, `?` (propagation), `filter_ok`, `filter_err` | [Result & Option](./result-option) |
| **Type Conversion** | `to_int`, `to_float`, `to_string`, `to_bool` | [Type Conversion](./conversion) |
| **Assertions** | `assert`, `assert_eq`, `assert_ne`, `assert_throws`, `assert_snapshot` | [Assertions](./assertions) |
| **Lazy Iterators** | `iter`, `Seq.filter`, `Seq.map`, `Seq.take`, `Seq.drop`, `Seq.zip`, `Seq.flat_map`, `Seq.enumerate`, `Seq.collect`, `Seq.reduce`, `Seq.first`, `Seq.count`, `Seq.forEach`, `Seq.any`, `Seq.all`, `Seq.find` | [Lazy Iterators](./iterators) |
| **Advanced Collections** | `OrderedDict`, `DefaultDict`, `Counter`, `Deque` | [Advanced Collections](./advanced-collections) |
| **Channels** | `Channel.new`, `ch.send`, `ch.receive`, `ch.close` | [Channels](./channels) |
| **Scripting I/O** | `fs.exists`, `fs.read_text`, `fs.write_text`, `fs.ls`, `fs.mkdir`, `fs.rm`, `fs.glob_files`, `sh`, `exec`, `spawn`, `env`, `args`, `parse_args`, `exit`, `path_join`, `path_basename`, `path_dirname` | [Scripting I/O](./io) |
| **Tables** | `Table`, `where`, `select`, `derive`, `sort_by`, `group_by`, `agg`, `join`, `pivot`, `unpivot`, `explode`, `peek`, `describe` | [Tables](./tables) |
| **Testing** | `Gen.int`, `Gen.float`, `Gen.bool`, `Gen.string`, `Gen.array`, `Gen.oneOf`, `forAll`, `create_spy`, `create_mock` | [Testing](./testing) |

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
json_parse('{"a": 1}')          // Ok({ a: 1 })
json_pretty({ a: 1 })           // formatted JSON string
base64_encode("hello")          // "aGVsbG8="
url_encode("hello world")       // "hello%20world"
```

### Regex

```tova
regex_test("hello123", "\\d+")         // true
regex_replace("a1b2c3", "\\d", "X")   // "aXbXcX"
regex_find_all("a1b2c3", "\\d")        // [{match: "1"}, ...]
```

### Validation

```tova
is_email("user@example.com")           // true
is_url("https://tova.dev")            // true
is_uuid("550e8400-e29b-41d4-a716-446655440000")  // true
```

### URL & UUID

```tova
id = uuid()                             // "a1b2c3d4-..."
parse_query("a=1&b=2")                 // { a: "1", b: "2" }
build_url({ host: "api.com", pathname: "/v1" })
```

### Date & Time

```tova
d = date_parse("2024-01-15")           // Ok(Date)
date_format(d.unwrap(), "YYYY-MM-DD")  // "2024-01-15"
date_add(d.unwrap(), 7, "days")        // Date (7 days later)
time_ago(d.unwrap())                    // "3 months ago"
```

### Async & Error Handling

```tova
result = try_fn(fn() risky_operation())
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

### Assertions

```tova
assert(len(items) > 0, "items must not be empty")
assert_eq(add(2, 3), 5)
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
