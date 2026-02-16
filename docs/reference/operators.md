# Operators

This page provides a complete reference for all operators in Tova, organized by category and including a full precedence table.

## Arithmetic Operators

| Operator | Name | Example | Result |
|----------|------|---------|--------|
| `+` | Addition | `3 + 4` | `7` |
| `-` | Subtraction | `10 - 3` | `7` |
| `*` | Multiplication | `4 * 5` | `20` |
| `/` | Division | `10 / 3` | `3.333...` |
| `%` | Modulo | `10 % 3` | `1` |
| `**` | Power | `2 ** 10` | `1024` |

The `+` operator also works for string concatenation:

```tova
"hello" + " " + "world"   // "hello world"
```

The `*` operator supports **string repetition** when used with a string and a number:

```tova
"-" * 40    // "----------------------------------------"
"abc" * 3   // "abcabcabc"
```

Unary `-` negates a number:

```tova
x = 42
y = -x     // -42
```

## Comparison Operators

| Operator | Name | Example |
|----------|------|---------|
| `==` | Equal | `x == 10` |
| `!=` | Not equal | `x != 10` |
| `<` | Less than | `x < 10` |
| `<=` | Less than or equal | `x <= 10` |
| `>` | Greater than | `x > 10` |
| `>=` | Greater than or equal | `x >= 10` |

### Chained Comparisons

Tova supports **chained comparisons**, which read naturally as mathematical inequalities:

```tova
1 < x < 10          // true when x is between 1 and 10 (exclusive)
0 <= score <= 100    // true when score is in [0, 100]
a < b < c < d        // true when a < b AND b < c AND c < d
```

Each intermediate value is evaluated only once. Chained comparisons desugar to a conjunction of pairwise comparisons.

## Logical Operators

Tova provides both keyword and symbolic forms. The **keyword forms** are idiomatic:

| Keyword | Symbol | Meaning | Example |
|---------|--------|---------|---------|
| `and` | `&&` | Logical AND | `x > 0 and x < 10` |
| `or` | `\|\|` | Logical OR | `x == 0 or x == 1` |
| `not` | `!` | Logical NOT | `not is_empty` |

Both forms are fully interchangeable:

```tova
// Keyword style (preferred)
if is_valid and not is_expired {
  process(item)
}

// Symbol style (also valid)
if is_valid && !is_expired {
  process(item)
}
```

Logical operators use **short-circuit evaluation**: `and` does not evaluate the right operand if the left is falsy, and `or` does not evaluate the right if the left is truthy.

## Membership Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `in` | Contained in | `"a" in list` |
| `not in` | Not contained in | `x not in banned` |

```tova
if item in allowed_items {
  accept(item)
}

if user not in banned_users {
  grant_access(user)
}
```

## Assignment Operators

| Operator | Meaning | Equivalent |
|----------|---------|------------|
| `=` | Assign | `x = 10` |
| `+=` | Add and assign | `x = x + 10` |
| `-=` | Subtract and assign | `x = x - 10` |
| `*=` | Multiply and assign | `x = x * 10` |
| `/=` | Divide and assign | `x = x / 10` |

```tova
var counter = 0
counter += 1       // counter is now 1
counter *= 5       // counter is now 5
```

## Pipe Operator

The pipe operator `|>` passes the result of the left expression as the first argument to the function on the right:

```tova
// Without pipes
result = format(filter(map(data, transform), predicate))

// With pipes -- reads left to right
result = data
  |> map(transform)
  |> filter(predicate)
  |> format()
```

### Placeholder `_`

Use `_` as a placeholder to control where the piped value is inserted:

```tova
10 |> add(_, 5)         // add(10, 5)
"hello" |> replace(_, "l", "r")  // replace("hello", "l", "r")
```

### Method Pipe

Use `.method()` syntax to call a method on the piped value:

```tova
items
  |> .filter(fn(x) x > 0)
  |> .map(fn(x) x * 2)
  |> .join(", ")
```

## Range Operators

| Operator | Name | Example | Meaning |
|----------|------|---------|---------|
| `..` | Exclusive range | `0..5` | 0, 1, 2, 3, 4 |
| `..=` | Inclusive range | `0..=5` | 0, 1, 2, 3, 4, 5 |

```tova
for i in 0..10 {       // 0 through 9
  print(i)
}

for i in 1..=100 {     // 1 through 100 (inclusive)
  print(i)
}
```

## Spread Operator

The `...` spread operator expands an iterable into individual elements:

```tova
a = [1, 2, 3]
b = [...a, 4, 5]       // [1, 2, 3, 4, 5]

opts = {color: "red"}
full = {...opts, size: 10}  // {color: "red", size: 10}
```

It also works in function calls:

```tova
args = [1, 2, 3]
sum(...args)            // sum(1, 2, 3)
```

## Optional Chaining

The `?.` operator accesses a property only if the receiver is not `nil`:

```tova
user?.address?.city     // nil if user or address is nil
items?.length           // nil if items is nil
```

## Null Coalescing

The `??` operator returns the left operand if it is not `nil`, otherwise the right:

```tova
name = user?.name ?? "Anonymous"
port = config?.port ?? 3000
```

## Member Access and Subscript

| Operator | Name | Example |
|----------|------|---------|
| `.` | Member access | `user.name` |
| `[]` | Subscript / index | `items[0]` |

```tova
point.x                 // access field x
matrix[0][1]            // nested indexing
map["key"]              // string subscript
```

## Fat Arrow and Thin Arrow

| Operator | Name | Usage |
|----------|------|-------|
| `=>` | Fat arrow | Match arms, route handlers, short lambdas |
| `->` | Return type | Function return type annotations |

```tova
// Fat arrow in match
match status {
  200 => "OK"
  404 => "Not Found"
  _ => "Unknown"
}

// Thin arrow for return types
fn add(a: Int, b: Int) -> Int {
  a + b
}
```

## Other Operators

| Operator | Name | Usage |
|----------|------|-------|
| `:` | Type annotation / object field | `x: Int`, `{name: "Alice"}` |
| `::` | Slice step | `items[::2]`, `items[1::3]` |
| `++` | String concatenation (in patterns) | `"api/" ++ rest` |

## Operator Precedence

Operators are listed from **highest** precedence (binds tightest) to **lowest** (binds loosest). Operators on the same row have equal precedence.

| Level | Operators | Associativity | Description |
|-------|-----------|---------------|-------------|
| 13 | `.` `?.` `[]` `()` | Left | Member access, optional chain, subscript, call |
| 12 | `-` (unary) `...` (spread) | Right | Unary negation, spread |
| 11 | `**` | Right | Exponentiation |
| 10 | `*` `/` `%` | Left | Multiplication, division, modulo |
| 9 | `+` `-` | Left | Addition, subtraction |
| 8 | `..` `..=` | None | Range (exclusive, inclusive) |
| 7 | `in` `not in` | Left | Membership test |
| 6 | `<` `<=` `>` `>=` `==` `!=` | Left | Comparison (chainable) |
| 5 | `not` `!` | Right | Logical NOT |
| 4 | `and` `&&` | Left | Logical AND |
| 3 | `or` `\|\|` | Left | Logical OR |
| 2 | `??` | Left | Null coalescing |
| 1 | `\|>` | Left | Pipe |

### Precedence Examples

```tova
// ** binds tighter than unary -
-2 ** 3          // -(2 ** 3) = -8

// * binds tighter than +
2 + 3 * 4        // 2 + (3 * 4) = 14

// and binds tighter than or
a or b and c     // a or (b and c)

// |> has lowest precedence
data |> f() |> g()  // g(f(data))

// ?? binds tighter than |> but looser than or
a ?? b |> f()    // f(a ?? b)
```
