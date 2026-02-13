# Collections

Tova provides powerful collection types -- arrays and objects -- with Python-inspired features like comprehensions, slicing, and membership testing.

## Arrays

Create arrays with square brackets:

```tova
numbers = [1, 2, 3, 4, 5]
names = ["Alice", "Bob", "Carol"]
mixed = [1, "two", true, nil]
empty = []
```

### Accessing Elements

Use zero-based indexing:

```tova
fruits = ["apple", "banana", "cherry"]
first = fruits[0]     // "apple"
last = fruits[-1]     // "cherry" (negative index counts from end)
```

### Common Array Methods

```tova
items = [3, 1, 4, 1, 5, 9]

len(items)             // 6
items.push(2)          // [3, 1, 4, 1, 5, 9, 2]
items.map(fn(x) x * 2)       // [6, 2, 8, 2, 10, 18]
items.filter(fn(x) x > 3)    // [4, 5, 9]
items.reduce(fn(a, b) a + b, 0)  // 23
items.sort()           // [1, 1, 3, 4, 5, 9]
items.reverse()        // [9, 5, 1, 4, 1, 3]
items.includes(4)      // true
items.indexOf(5)       // 4
items.join(", ")       // "3, 1, 4, 1, 5, 9"
```

## Objects

Create objects with key-value pairs in curly braces:

```tova
user = {
  name: "Alice",
  age: 30,
  email: "alice@example.com"
}
```

### Accessing Properties

```tova
user.name        // "Alice"
user["age"]      // 30 (bracket notation for dynamic keys)
```

### Shorthand Properties

When the variable name matches the key name, you can use shorthand:

```tova
name = "Alice"
age = 30

// Instead of:
user = { name: name, age: age }

// You can write:
user = { name, age }
```

### Computed Property Keys

Use bracket notation for dynamic keys:

```tova
field = "email"
data = { [field]: "alice@example.com" }
// { email: "alice@example.com" }
```

## Spread Operator

The `...` operator spreads arrays and objects into new collections.

### Array Spread

```tova
a = [1, 2, 3]
b = [4, 5, 6]
combined = [...a, ...b]       // [1, 2, 3, 4, 5, 6]
with_extra = [0, ...a, 99]   // [0, 1, 2, 3, 99]
```

### Object Spread

```tova
defaults = { host: "localhost", port: 8080, debug: false }
overrides = { port: 3000, debug: true }
config = { ...defaults, ...overrides }
// { host: "localhost", port: 3000, debug: true }
```

This is the standard way to create updated copies of immutable objects:

```tova
fn update_name(user, new_name) {
  { ...user, name: new_name }
}
```

## List Comprehensions

Tova supports Python-style list comprehensions for concise collection transformations:

```tova
squares = [x * x for x in range(10)]
// [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]
```

### With Filtering

Add an `if` clause to filter:

```tova
evens = [x for x in range(20) if x % 2 == 0]
// [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]

short_names = [name for name in names if len(name) <= 4]
```

### With Transformation and Filtering

```tova
processed = [x * 2 for x in range(10) if x > 0]
// [2, 4, 6, 8, 10, 12, 14, 16, 18]

upper_long = [name.upper() for name in names if len(name) > 3]
```

### Nested Comprehensions

```tova
pairs = [[x, y] for x in range(3) for y in range(3)]
// [[0,0], [0,1], [0,2], [1,0], [1,1], [1,2], [2,0], [2,1], [2,2]]
```

## Dict Comprehensions

Build objects from key-value pairs:

```tova
squares_map = {x: x * x for x in range(5)}
// {0: 0, 1: 1, 2: 4, 3: 9, 4: 16}
```

```tova
entries = [["name", "Alice"], ["age", "30"]]
obj = {k: v for k, v in entries}
// { name: "Alice", age: "30" }
```

## Slicing

Tova supports Python-style array slicing with `[start:end:step]` syntax:

### Basic Slicing

```tova
items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

items[2:5]     // [2, 3, 4]       start at 2, end before 5
items[:3]      // [0, 1, 2]       first 3 elements
items[7:]      // [7, 8, 9]       from index 7 to end
items[-3:]     // [7, 8, 9]       last 3 elements
```

### Slicing with Step

```tova
items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

items[::2]     // [0, 2, 4, 6, 8]    every other element
items[1::2]    // [1, 3, 5, 7, 9]    odd-indexed elements
items[::3]     // [0, 3, 6, 9]       every third element
```

### Reversing with Slicing

```tova
items = [1, 2, 3, 4, 5]

items[::-1]    // [5, 4, 3, 2, 1]    reverse the array
items[4:1:-1]  // [4, 3, 2]          reverse a portion
```

### String Slicing

Slicing works on strings too:

```tova
text = "Hello, World!"

text[0:5]      // "Hello"
text[7:]       // "World!"
text[::-1]     // "!dlroW ,olleH"
```

## Chained Comparisons

Tova supports Python-style chained comparisons:

```tova
if 1 < x < 10 {
  print("x is between 1 and 10")
}

if 0 <= score <= 100 {
  print("Valid score")
}

if a < b < c < d {
  print("Strictly increasing")
}
```

This is more readable than `if x > 1 and x < 10`.

## Membership Testing

Use `in` to check whether an element exists in a collection:

```tova
fruits = ["apple", "banana", "cherry"]

if "apple" in fruits {
  print("Found apple!")
}

if "mango" not in fruits {
  print("No mango")
}
```

Works with strings too:

```tova
if "@" in email {
  print("Looks like an email")
}

if "admin" in username {
  print("Admin user detected")
}
```

And with objects (checks keys):

```tova
config = { host: "localhost", port: 8080 }

if "host" in config {
  print("Host is configured")
}
```

## Practical Tips

**Use comprehensions for transformations.** They are more concise and often more readable than `.map()` and `.filter()` chains:

```tova
// Comprehension style:
active_names = [user.name for user in users if user.active]

// Method chain style:
active_names = users.filter(fn(u) u.active).map(fn(u) u.name)
```

Both are valid; use whichever reads better for your case.

**Slicing is non-destructive.** It always returns a new array or string, leaving the original unchanged. This pairs well with immutable-by-default semantics.

**Spread for immutable updates.** Since variables are immutable by default, use spread to create "updated" copies:

```tova
fn add_item(cart, item) {
  { ...cart, items: [...cart.items, item] }
}

fn remove_first(list) {
  let [_, ...rest] = list
  rest
}
```

**Chained comparisons for range checks.** Instead of `if age >= 13 and age <= 19`, write `if 13 <= age <= 19`. It reads like math and is less error-prone.
