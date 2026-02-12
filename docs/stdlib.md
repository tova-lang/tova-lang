# Standard Library

Lux provides a set of built-in functions. These are automatically available in `lux run` and in server code. In client code, the following are inlined: `print`, `len`, `range`, `enumerate`, `sum`, `sorted`, `reversed`, `zip`, `min`, `max`.

> **Note:** `map`, `filter`, and `type_of` are available in `lux run` and server code but not currently inlined in client-side code.

## I/O

### print

```lux
print("Hello, World!")
print("Count:", count, "Items:", items)
print("Name: {name}, Age: {age}")
```

Outputs to the console. Accepts multiple arguments, separated by spaces.

## Collection Functions

### len

Returns the length of an array, string, or object (number of keys):

```lux
len([1, 2, 3])         // 3
len("hello")            // 5
len([])                 // 0
len({ a: 1, b: 2 })   // 2
```

### range

Generates an array of sequential integers:

```lux
range(5)                // [0, 1, 2, 3, 4]
range(2, 7)             // [2, 3, 4, 5, 6]
range(0, 10, 2)         // [0, 2, 4, 6, 8]
```

### enumerate

Returns `[index, value]` pairs:

```lux
enumerate(["a", "b", "c"])    // [[0, "a"], [1, "b"], [2, "c"]]

for i, item in enumerate(items) {
  print("{i}: {item}")
}
```

### zip

Combines multiple arrays into arrays of tuples:

```lux
zip([1, 2, 3], ["a", "b", "c"])   // [[1, "a"], [2, "b"], [3, "c"]]
```

### map

Applies a function to each element:

```lux
map([1, 2, 3], fn(x) x * 2)       // [2, 4, 6]

// With pipe
[1, 2, 3] |> map(fn(x) x * 2)
```

### filter

Returns elements that pass a predicate:

```lux
filter([1, 2, 3, 4, 5], fn(x) x > 3)    // [4, 5]

// With pipe
numbers |> filter(fn(x) x % 2 == 0)
```

### sum

Sums all elements:

```lux
sum([1, 2, 3, 4, 5])     // 15
```

### sorted

Returns a sorted copy:

```lux
sorted([3, 1, 4, 1, 5])              // [1, 1, 3, 4, 5]
sorted(users, fn(u) u.name)          // sort by key function
```

### reversed

Returns a reversed copy:

```lux
reversed([1, 2, 3])      // [3, 2, 1]
```

### min / max

```lux
min([3, 1, 4, 1, 5])     // 1
max([3, 1, 4, 1, 5])     // 5
```

## Type Introspection

### type_of

Returns the type of a value as a string (using Lux type names):

```lux
type_of(42)              // "Int"
type_of(3.14)            // "Float"
type_of("hello")         // "String"
type_of(true)            // "Bool"
type_of([1, 2])          // "List"
type_of(nil)             // "Nil"
type_of(fn(x) x)         // "Function"
type_of({ a: 1 })        // "Object"
```

For algebraic types, `type_of` returns the variant tag name (e.g., `"Circle"`, `"Ok"`).

> **Note:** `type_of` is available in `lux run` but not currently inlined in client-side code.

## Network

### fetch

Makes HTTP requests (native Fetch API — provided by the Bun/browser runtime, not a Lux built-in):

```lux
response = fetch("https://api.example.com/data")
data = response.json()
```

```lux
response = fetch("https://api.example.com/users", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Alice" })
})
```

## String Methods

All strings have built-in methods:

### Case Conversion

```lux
"hello".upper()           // "HELLO"
"HELLO".lower()           // "hello"
"hello world".capitalize() // "Hello world"
"hello world".title_case() // "Hello World"
"helloWorld".snake_case()  // "hello_world"
"hello_world".camel_case() // "helloWorld"
```

### Search

```lux
"hello world".contains("world")      // true
"hello world".starts_with("hello")   // true
"hello world".ends_with("world")     // true
```

### Splitting

```lux
"hello".chars()                       // ["h", "e", "l", "l", "o"]
"hello world foo".words()             // ["hello", "world", "foo"]
"line1\nline2\nline3".lines()         // ["line1", "line2", "line3"]
```

### String Multiplication

```lux
"-" * 40                              // "----------------------------------------"
"ab" * 3                              // "ababab"
```

## Array Slice Syntax

Arrays support Python-style slicing:

```lux
arr = [0, 1, 2, 3, 4, 5]

arr[1:4]         // [1, 2, 3]           start to end (exclusive)
arr[:3]          // [0, 1, 2]           from beginning
arr[3:]          // [3, 4, 5]           to end
arr[::2]         // [0, 2, 4]           every other element
arr[1:5:2]       // [1, 3]              start:end:step
arr[::-1]        // [5, 4, 3, 2, 1, 0]  reversed
```

## List Comprehensions

```lux
// Basic
squares = [x ** 2 for x in range(10)]

// With filter
evens = [x for x in numbers if x % 2 == 0]

// Transform and filter
names = [u.name.upper() for u in users if u.active]
```

## Dict Comprehensions

```lux
squares = {x: x ** 2 for x in range(5)}
// {0: 0, 1: 1, 2: 4, 3: 9, 4: 16}

lookup = {u.id: u for u in users}
```

## Pipe Operator

The pipe operator `|>` passes the left side as the first argument to the right side:

```lux
result = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  |> filter(fn(x) x > 3)
  |> map(fn(x) x * 10)
  |> sum()
// result = 280
```

This is equivalent to:

```lux
result = sum(map(filter([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], fn(x) x > 3), fn(x) x * 10))
```

## Membership Test

```lux
if "banana" in fruits { ... }
if x not in excluded { ... }
if key in object { ... }
```

## Chained Comparisons

```lux
if 1 < x < 10 { ... }           // 1 < x and x < 10
if 0 <= score <= 100 { ... }    // 0 <= score and score <= 100
if a < b < c < d { ... }        // a < b and b < c and c < d
```
