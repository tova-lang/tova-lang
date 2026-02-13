# Standard Library Overview

Lux provides **60+ built-in functions** that are automatically available in every Lux program. There is nothing to import -- all standard library functions are in scope by default.

## Availability

Standard library functions work everywhere Lux code runs:

- **`lux run`** -- all functions available in scripts and the REPL
- **Server code** -- all functions available in route handlers and server modules
- **Client code** -- functions are **tree-shaken** so only the ones you actually use are included in the browser bundle

## Design Philosophy

Lux's standard library follows a few guiding principles:

- **Functional style** -- most functions take data as the first argument and return new values rather than mutating
- **Result and Option types** -- instead of `throw` and `try/catch`, Lux uses `Ok`/`Err` and `Some`/`None` for principled error handling
- **Pipeable** -- every function works naturally with the pipe operator `|>`
- **Method syntax** -- many functions (especially string functions) can be called as methods: `"hello".upper()` is the same as `upper("hello")`

## Categories at a Glance

| Category | Functions | Page |
|---|---|---|
| **Collections** | `len`, `range`, `enumerate`, `sum`, `sorted`, `reversed`, `zip`, `min`, `max`, `type_of`, `filter`, `map`, `find`, `any`, `all`, `flat_map`, `reduce`, `unique`, `group_by`, `chunk`, `flatten`, `take`, `drop`, `first`, `last`, `count`, `partition`, `print` | [Collections](./collections) |
| **Strings** | `trim`, `split`, `join`, `replace`, `repeat`, `upper`, `lower`, `contains`, `starts_with`, `ends_with`, `chars`, `words`, `lines`, `capitalize`, `title_case`, `snake_case`, `camel_case` | [Strings](./strings) |
| **Math** | `abs`, `floor`, `ceil`, `round`, `clamp`, `sqrt`, `pow`, `random`, `sleep` | [Math](./math) |
| **Objects & Utilities** | `keys`, `values`, `entries`, `merge`, `freeze`, `clone` | [Objects & Utilities](./objects) |
| **Result & Option** | `Ok`, `Err`, `Some`, `None`, `!` (propagation) | [Result & Option](./result-option) |
| **Assertions** | `assert`, `assert_eq`, `assert_ne` | [Assertions](./assertions) |

## Quick Reference

### I/O

```lux
print("Hello, World!")
print("Name:", name, "Age:", age)
```

### Collections

```lux
len([1, 2, 3])                  // 3
range(5)                         // [0, 1, 2, 3, 4]
sorted([3, 1, 2])               // [1, 2, 3]
zip([1, 2], ["a", "b"])         // [[1, "a"], [2, "b"]]
unique([1, 2, 2, 3])            // [1, 2, 3]
```

### Strings

```lux
upper("hello")                   // "HELLO"
split("a,b,c", ",")             // ["a", "b", "c"]
"hello".contains("ell")         // true
```

### Math

```lux
abs(-5)                          // 5
clamp(15, 0, 10)                // 10
sqrt(16)                         // 4
```

### Objects

```lux
keys({ a: 1, b: 2 })           // ["a", "b"]
merge({ a: 1 }, { b: 2 })      // { a: 1, b: 2 }
```

### Result & Option

```lux
result = Ok(42)
result.map(fn(x) x * 2)        // Ok(84)
result.unwrap()                  // 42

option = Some("hello")
option.unwrapOr("default")      // "hello"
None.unwrapOr("default")        // "default"
```

### Assertions

```lux
assert(len(items) > 0, "items must not be empty")
assert_eq(add(2, 3), 5)
```

## Using with Pipes

All standard library functions are designed to work with the pipe operator `|>`:

```lux
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
