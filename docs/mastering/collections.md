<script setup>
const arraysCode = `// Arrays: ordered, dynamic, the workhorse collection
numbers = [1, 2, 3, 4, 5]
names = ["Alice", "Bob", "Charlie"]
mixed = [1, "two", true, [3, 4]]

// Access by index (0-based)
print(numbers[0])    // 1
print(names[2])      // "Charlie"

// Slicing with take and drop
print(take(drop(numbers, 1), 2))   // [2, 3]
print(drop(numbers, 2))            // [3, 4, 5]

// Length
print("Count: {len(numbers)}")

// The big three: map, filter, reduce
scores = [85, 92, 78, 95, 88, 73, 91]

passing = scores |> filter(fn(s) s >= 80)
print("Passing: {passing}")

curved = scores |> map(fn(s) s + 5)
print("Curved: {curved}")

total = scores |> sum()
average = total / len(scores)
print("Average: {average}")`

const transformCode = `// Chained transformations — the Tova way
data = [
  { name: "Alice", score: 92, grade: "A" },
  { name: "Bob", score: 78, grade: "C" },
  { name: "Charlie", score: 95, grade: "A" },
  { name: "Diana", score: 88, grade: "B" },
  { name: "Eve", score: 73, grade: "C" }
]

// Find top scorers
top_scorers = data
  |> filter(fn(s) s.score >= 85)
  |> map(fn(s) s.name)
  |> sorted()
print("Top scorers: {top_scorers}")

// Group by grade
grades = data |> group_by(fn(s) s.grade)
for entry in entries(grades) {
  k = entry[0]
  v = entry[1]
  student_names = v |> map(fn(s) s.name)
  print("{k}: {student_names}")
}

// Stats
all_scores = data |> map(fn(s) s.score)
print("Highest: {max(all_scores)}")
print("Lowest: {min(all_scores)}")
avg_score = sum(all_scores) / len(all_scores)
print("Average: {avg_score}")`

const objectsCode = `// Objects: key-value pairs
person = { name: "Alice", age: 30, city: "Portland" }

// Access
print(person.name)
print(person["age"])

// Spread: merge and extend
defaults = { theme: "dark", lang: "en", fontSize: 14 }
prefs = { ...defaults, theme: "light", fontSize: 16 }
print(prefs)

// Keys and values
print(keys(person))
print(values(person))

// Iteration with entries
for entry in entries(person) {
  print("{entry[0]}: {entry[1]}")
}

// Build objects dynamically
fields = ["name", "email", "role"]
vals = ["Alice", "alice@test.com", "admin"]
user = {}
for i in range(len(fields)) {
  user[fields[i]] = vals[i]
}
print(user)`

const wordCountCode = `// PROJECT: Word Frequency Counter
text = "the quick brown fox jumps over the lazy dog the fox the dog"

// Split into words
all_words = split(text, " ")

// Count frequencies using reduce
fn count_words(word_list) {
  var counts = {}
  for w in word_list {
    if counts[w] == undefined {
      counts[w] = 0
    }
    counts[w] += 1
  }
  counts
}

freq = count_words(all_words)

// Sort by frequency (descending)
sorted_words = entries(freq)
  |> sorted(fn(entry) 0 - entry[1])

// Display results
print("Word Frequencies:")
print(repeat("-", 25))
for entry in sorted_words {
  bar = repeat("#", entry[1])
  print("{pad_end(entry[0], 10)} {bar} ({entry[1]})")
}

// Stats
unique_count = len(keys(freq))
total_count = len(all_words)
print("")
print("Total words: {total_count}")
print("Unique words: {unique_count}")`
</script>

# Chapter 3: Mastering Collections

Collections are where data lives. Arrays hold ordered sequences, objects hold named fields, and maps hold arbitrary key-value pairs. This chapter teaches you to think in terms of **transformations** — taking a collection in and getting a new one out — rather than loops and mutation.

By the end, you'll build a word frequency counter that processes text with elegant, composable operations.

## Arrays

Arrays are ordered, zero-indexed, and the most common collection in Tova:

```tova
numbers = [1, 2, 3, 4, 5]
empty = []
mixed = [1, "hello", true]
```

### Access and Slicing

```tova
items = [10, 20, 30, 40, 50]

// Single element
items[0]       // 10
items[4]       // 50

// Slicing (creates a new array)
items[1..3]    // [20, 30]      — elements 1 and 2
items[2..]     // [30, 40, 50]  — from index 2 to end
items[..3]     // [10, 20, 30]  — first 3 elements
```

### Building Arrays

```tova
// Spread operator merges arrays
a = [1, 2, 3]
b = [4, 5, 6]
combined = [...a, ...b]       // [1, 2, 3, 4, 5, 6]
with_extra = [0, ...a, 99]   // [0, 1, 2, 3, 99]

// range() generates sequences
one_to_ten = range(1, 11) |> to_array()
evens = range(0, 20, 2) |> to_array()
```

<TryInPlayground :code="arraysCode" label="Arrays" />

## The Big Three: map, filter, reduce

These three functions are the foundation of collection processing in Tova. Master them and you'll rarely need to write manual loops.

### map — Transform Every Element

`map` applies a function to each element and returns a new array:

```tova
numbers = [1, 2, 3, 4, 5]

doubled = numbers |> map(fn(x) x * 2)
// [2, 4, 6, 8, 10]

names = ["alice", "bob", "charlie"]
uppercased = names |> map(fn(name) uppercase(name))
// ["ALICE", "BOB", "CHARLIE"]

// Extract a field from objects
users = [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]
just_names = users |> map(fn(u) u.name)
// ["Alice", "Bob"]
```

### filter — Keep What Matches

`filter` keeps only the elements where the function returns `true`:

```tova
numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

evens = numbers |> filter(fn(x) x % 2 == 0)
// [2, 4, 6, 8, 10]

big = numbers |> filter(fn(x) x > 5)
// [6, 7, 8, 9, 10]

// Filter objects
users = [
  { name: "Alice", active: true },
  { name: "Bob", active: false },
  { name: "Charlie", active: true }
]
active_users = users |> filter(fn(u) u.active)
```

### reduce — Collapse to a Single Value

`reduce` accumulates a result by applying a function to each element:

```tova
numbers = [1, 2, 3, 4, 5]

total = numbers |> reduce(fn(acc, x) acc + x, 0)
// 15

product = numbers |> reduce(fn(acc, x) acc * x, 1)
// 120

// Build a string
word_list = ["Tova", "is", "great"]
sentence = word_list |> join(" ")
// "Tova is great"
```

::: tip Reduce Is the Universal Transformer
Both `map` and `filter` can be written in terms of `reduce`. But don't do that — use the specific function. `map` when you're transforming, `filter` when you're selecting, `reduce` when you're accumulating.
:::

### Chaining Transformations

The real power comes from combining these:

```tova
orders = [
  { product: "Widget", price: 25, quantity: 3 },
  { product: "Gadget", price: 50, quantity: 1 },
  { product: "Doohickey", price: 10, quantity: 7 },
  { product: "Thingamajig", price: 35, quantity: 2 }
]

// Total revenue from orders over $20
big_order_revenue = orders
  |> filter(fn(o) o.price > 20)
  |> map(fn(o) o.price * o.quantity)
  |> sum()

print("Revenue from premium items: {big_order_revenue}")
```

<TryInPlayground :code="transformCode" label="Transformations" />

## Sorting

Tova provides `sorted()` for natural ordering and `sorted()` with a key function for custom ordering:

```tova
numbers = [3, 1, 4, 1, 5, 9, 2, 6]
sorted_nums = numbers |> sorted()
// [1, 1, 2, 3, 4, 5, 6, 9]

// Sort objects by a field
users = [
  { name: "Charlie", age: 35 },
  { name: "Alice", age: 28 },
  { name: "Bob", age: 31 }
]

by_age = users |> sorted(fn(u) u.age)
by_name = users |> sorted(fn(u) u.name)
```

Reverse sort by negating:

```tova
// Descending order
by_age_desc = users |> sorted(fn(u) 0 - u.age)
```

## Other Essential Array Operations

```tova
items = [1, 2, 3, 4, 5, 3, 2]

// Searching
items |> contains(3)              // true
items |> find(fn(x) x > 3)       // Some(4)
items |> index_of(3)              // 2

// Aggregation
items |> sum()                    // 20
items |> min()                    // 1
items |> max()                    // 5

// Transformation
items |> unique()                 // [1, 2, 3, 4, 5]
items |> reversed()               // [2, 3, 5, 4, 3, 2, 1]
items |> take(3)                  // [1, 2, 3]
items |> drop(3)                  // [4, 5, 3, 2]

// Combining
flatten([[1, 2], [3, 4]])         // [1, 2, 3, 4]
items |> zip(["a", "b", "c"])    // [[1,"a"], [2,"b"], [3,"c"]]

// Testing
items |> all(fn(x) x > 0)        // true
items |> any(fn(x) x > 4)        // true

// Advanced aggregation
items |> product()               // 120 (multiply all elements)

// Custom comparators
users = [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }, { name: "Carol", age: 35 }]
users |> min_by(fn(u) u.age)     // { name: "Bob", age: 25 }
users |> max_by(fn(u) u.age)     // { name: "Carol", age: 35 }
users |> sum_by(fn(u) u.age)     // 90

// Zip with a combining function
zip_with([1, 2, 3], [10, 20, 30], fn(a, b) a + b)   // [11, 22, 33]
```

## Tuples

Tuples are fixed-length, ordered collections where each position can hold a different type. They're lighter than objects when you just need to group a few values:

```tova
// Create tuples with parentheses
point = (3, 4)
name_age = ("Alice", 30)
rgb = (255, 128, 0)
```

### Accessing Tuple Elements

Access elements by position using destructuring:

```tova
let (x, y) = point
print("x={x}, y={y}")

// Or in function returns
fn divmod(a, b) {
  (a / b, a % b)
}

let (quotient, remainder) = divmod(17, 5)
print("{quotient} remainder {remainder}")   // "3 remainder 2"
```

### Tuples in Collections

Tuples work naturally with collection operations:

```tova
// Zip creates tuples from two arrays
names = ["Alice", "Bob", "Charlie"]
ages = [30, 25, 35]
pairs = zip(names, ages)
// [("Alice", 30), ("Bob", 25), ("Charlie", 35)]

for pair in pairs {
  let (name, age) = pair
  print("{name} is {age}")
}
```

::: tip Tuples vs. Objects vs. Arrays
| Need | Use |
|------|-----|
| Fixed number of unnamed values | Tuples: `(x, y)` |
| Named fields | Objects: `{ x: 1, y: 2 }` |
| Variable-length collection | Arrays: `[1, 2, 3]` |

Tuples are perfect for return values, coordinates, key-value pairs, and any time you'd create a small object just to group 2-3 values together.
:::

## Objects

Objects hold named key-value pairs:

```tova
config = {
  host: "localhost",
  port: 8080,
  debug: true
}
```

### Spread and Merge

```tova
defaults = { theme: "dark", lang: "en", pageSize: 25 }
user_prefs = { theme: "light", pageSize: 50 }

// User preferences override defaults
final = { ...defaults, ...user_prefs }
// { theme: "light", lang: "en", pageSize: 50 }
```

### Iterating Objects

```tova
person = { name: "Alice", age: 30, role: "engineer" }

// Get all keys or values
k = keys(person)       // ["name", "age", "role"]
v = values(person)     // ["Alice", 30, "engineer"]

// Iterate key-value pairs
for entry in entries(person) {
  print("{entry[0]} = {entry[1]}")
}
```

### Building Objects from Entries

The inverse of `entries()` is `from_entries()` — it converts an array of `[key, value]` pairs back into an object:

```tova
pairs = [["name", "Alice"], ["age", 30], ["role", "engineer"]]
person = from_entries(pairs)
// { name: "Alice", age: 30, role: "engineer" }

// Useful for transforming object entries
prices = { apple: 1.50, banana: 0.75, cherry: 3.00 }
doubled_prices = entries(prices)
  |> map(fn(e) [e[0], e[1] * 2])
  |> from_entries()
// { apple: 3.00, banana: 1.50, cherry: 6.00 }
```

<TryInPlayground :code="objectsCode" label="Objects" />

### Object Utility Functions

Tova's stdlib includes a set of non-mutating helpers for working with objects. These are especially handy when you need to reshape data before passing it along.

#### pick and omit — Selecting or Excluding Keys

```tova
user = { name: "Alice", email: "alice@test.com", role: "admin", password: "secret" }

// pick: keep only the keys you want
public_info = pick(user, ["name", "email", "role"])
// { name: "Alice", email: "alice@test.com", role: "admin" }

// omit: remove the keys you don't want
safe_user = omit(user, ["password"])
// { name: "Alice", email: "alice@test.com", role: "admin" }
```

`pick` and `omit` are complements. Use whichever reads more clearly — `pick` when you know what you *want*, `omit` when you know what you *don't* want.

#### map_values — Transform Values While Keeping Keys

```tova
prices = { apple: 1.50, banana: 0.75, cherry: 3.00 }

// Apply a 10% discount to every price
discounted = map_values(prices, fn(price) price * 0.9)
// { apple: 1.35, banana: 0.675, cherry: 2.7 }

// The callback also receives the key as a second argument
labeled = map_values(prices, fn(price, key) "{key}: ${price}")
// { apple: "apple: $1.5", banana: "banana: $0.75", cherry: "cherry: $3" }
```

#### has_key and get — Safe Object Access

```tova
config = { host: "localhost", port: 8080 }

// has_key: check if a key exists
has_key(config, "host")     // true
has_key(config, "timeout")  // false

// get: retrieve a value with a default fallback
get(config, "port", 3000)      // 8080 (key exists)
get(config, "timeout", 5000)   // 5000 (key missing, returns default)
```

`get` also supports **dot-path notation** for nested access:

```tova
nested = { db: { host: "localhost", credentials: { user: "admin" } } }

get(nested, "db.host", "unknown")               // "localhost"
get(nested, "db.credentials.user", "anonymous")  // "admin"
get(nested, "db.credentials.token", "none")      // "none" (missing key)
```

This is far safer than `nested.db.credentials.token` which would throw if any intermediate key is missing.

## Comprehensions

Array comprehensions let you build arrays with embedded logic:

```tova
// Basic comprehension
squares = [x * x for x in range(1, 11)]
// [1, 4, 9, 16, 25, 36, 49, 64, 81, 100]

// With filter
even_squares = [x * x for x in range(1, 11) if x % 2 == 0]
// [4, 16, 36, 64, 100]

// Nested comprehension
pairs = [[x, y] for x in range(1, 4) for y in range(1, 4) if x != y]
// [[1,2], [1,3], [2,1], [2,3], [3,1], [3,2]]
```

::: tip When to Use Comprehensions
Use comprehensions for simple transformations where the intent is clear in one line. For complex multi-step processing, use chained `map`/`filter`/`reduce` with pipes — they're more readable when there are multiple operations.
:::

## Membership Testing

Check if a value exists in a collection with `in`:

```tova
fruits = ["apple", "banana", "cherry"]

if "banana" in fruits {
  print("We have bananas!")
}

valid_roles = ["admin", "editor", "viewer"]
user_role = "admin"

if user_role in valid_roles {
  print("Valid role")
}
```

## Chained Comparisons

Tova supports mathematical-style chained comparisons:

```tova
age = 25
if 18 <= age <= 65 {
  print("Working age")
}

score = 85
grade = if 90 <= score <= 100 { "A" }
  elif 80 <= score < 90 { "B" }
  elif 70 <= score < 80 { "C" }
  else { "F" }
```

## Advanced Collection Operations

Beyond the basics, Tova's stdlib has powerful collection tools:

### Chunking and Partitioning

```tova
items = [1, 2, 3, 4, 5, 6, 7, 8]

// chunk: split into fixed-size groups
chunk(items, 3)    // [[1, 2, 3], [4, 5, 6], [7, 8]]

// partition: split by a predicate
let [evens, odds] = partition(items, fn(x) x % 2 == 0)
// evens: [2, 4, 6, 8], odds: [1, 3, 5, 7]
```

### Sliding Windows and Pairs

```tova
data = [10, 20, 30, 40, 50]

// pairwise: adjacent pairs
pairwise(data)    // [[10,20], [20,30], [30,40], [40,50]]

// sliding_window: overlapping windows
sliding_window(data, 3)    // [[10,20,30], [20,30,40], [30,40,50]]
```

### Set Operations

```tova
a = [1, 2, 3, 4, 5]
b = [3, 4, 5, 6, 7]

union(a, b)               // [1, 2, 3, 4, 5, 6, 7]
intersection(a, b)        // [3, 4, 5]
difference(a, b)          // [1, 2] (in a but not b)
symmetric_difference(a, b)  // [1, 2, 6, 7] (in one but not both)
is_subset([3, 4], a)      // true
```

### Combinatorics

```tova
combinations([1, 2, 3], 2)    // [[1,2], [1,3], [2,3]]
permutations([1, 2, 3])       // [[1,2,3], [1,3,2], [2,1,3], ...]
```

### Scanning — Reduce with History

Sometimes you want `reduce`, but you also need to see every intermediate step. That is what `scan` does — it returns an array of all the accumulator values:

```tova
// Running total
[1, 2, 3, 4] |> scan(fn(acc, x) acc + x, 0)
// [1, 3, 6, 10]

// Running maximum
[3, 1, 4, 1, 5, 9] |> scan(fn(best, x) if x > best { x } else { best }, 0)
// [3, 3, 4, 4, 5, 9]
```

`scan` is invaluable for computing running totals, cumulative statistics, or any time you need a "history" of your fold.

### Cleaning Data with compact

`compact` removes `null` and `undefined` values from an array — handy when dealing with optional data or sparse results:

```tova
raw = [1, null, 2, undefined, 3]
clean = raw |> compact()
// [1, 2, 3]

// Practical: filter out failed lookups
ids = [101, 999, 102]
results = ids |> map(fn(id) find_user(id)) |> compact()
```

Note that `compact` keeps falsy values like `0`, `""`, and `false`. It only strips `null` and `undefined`.

### Positional Operations — rotate, insert_at, remove_at, update_at

These functions return new arrays (no mutation) and give you fine-grained control over element positions:

```tova
// rotate: shift elements left by n positions (wrapping around)
[1, 2, 3, 4, 5] |> rotate(2)
// [3, 4, 5, 1, 2]

// Negative rotation goes right
[1, 2, 3, 4, 5] |> rotate(-1)
// [5, 1, 2, 3, 4]

// insert_at: splice a new element at a given index
[1, 2, 3] |> insert_at(1, 99)
// [1, 99, 2, 3]

// remove_at: drop the element at an index
[10, 20, 30, 40] |> remove_at(2)
// [10, 20, 40]

// update_at: replace the element at an index
[10, 20, 30] |> update_at(1, 99)
// [10, 99, 30]
```

These are especially useful in UI code where you manage lists immutably — adding, removing, or reordering items without touching the original array.

### Enumerating Elements

`enumerate` pairs each element with its index, returning an array of `[index, value]` pairs:

```tova
["apple", "banana", "cherry"] |> enumerate()
// [[0, "apple"], [1, "banana"], [2, "cherry"]]

// Useful when you need both position and value
tasks = ["Write tests", "Fix bug", "Deploy"]
for pair in enumerate(tasks) {
  print("{pair[0] + 1}. {pair[1]}")
}
// 1. Write tests
// 2. Fix bug
// 3. Deploy
```

### More Array Utilities

```tova
items = [1, 2, 3, 4, 5]

// Sampling
shuffle(items)              // Random order
sample(items, 3)            // 3 random elements

// Interleaving
interleave([1, 3, 5], [2, 4, 6])    // [1, 2, 3, 4, 5, 6]
intersperse(items, 0)                // [1, 0, 2, 0, 3, 0, 4, 0, 5]

// Frequency counting
frequencies(["a", "b", "a", "c", "a", "b"])   // { a: 3, b: 2, c: 1 }

// flat_map: map then flatten
sentences = ["hello world", "foo bar"]
sentences |> flat_map(fn(s) split(s, " "))   // ["hello", "world", "foo", "bar"]
```

### Dict Comprehensions

Build objects with comprehension syntax:

```tova
// Create a lookup from an array
users = [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]
lookup = { u.id: u.name for u in users }
// { 1: "Alice", 2: "Bob" }

// Square lookup table
squares = { n: n * n for n in range(1, 6) }
// { 1: 1, 2: 4, 3: 9, 4: 16, 5: 25 }
```

## Tables — Tabular Data Processing

When you work with rows and columns — CSV data, database results, analytics — plain arrays of objects get unwieldy fast. Tova's `Table` type gives you a dedicated abstraction for tabular data with a rich set of operations.

### Creating Tables

```tova
// From an array of objects
employees = Table([
  { name: "Alice", dept: "Engineering", salary: 95000 },
  { name: "Bob", dept: "Marketing", salary: 72000 },
  { name: "Charlie", dept: "Engineering", salary: 88000 },
  { name: "Diana", dept: "Marketing", salary: 81000 },
  { name: "Eve", dept: "Engineering", salary: 102000 }
])

print(employees)
// Table(5 rows, 3 columns)
```

### Querying Tables

Tables support a chainable query style — filter rows, select columns, derive new columns, and sort:

```tova
// Filter rows
engineers = table_where(employees, fn(row) row.dept == "Engineering")

// Select specific columns
names_only = table_select(employees, "name", "dept")

// Add a computed column
with_bonus = table_derive(employees, {
  bonus: fn(row) row.salary * 0.10
})

// Sort by salary (descending)
ranked = table_sort_by(employees, fn(row) row.salary, { desc: true })
```

### Grouping and Aggregation

The real power of tables shows up in group-by operations:

```tova
// Group by department, then aggregate
dept_stats = employees
  |> table_group_by(fn(row) row.dept)
  |> table_agg({
    headcount: fn(rows) len(rows),
    avg_salary: fn(rows) sum(map(rows, fn(r) r.salary)) / len(rows),
    top_earner: fn(rows) max(map(rows, fn(r) r.salary))
  })

print(dept_stats)
```

### Joining Tables

```tova
departments = Table([
  { dept: "Engineering", budget: 500000 },
  { dept: "Marketing", budget: 300000 }
])

// Join employees with department budgets
joined = table_join(employees, departments, {
  left: "dept",
  right: "dept"
})
```

### Other Table Operations

```tova
// Limit to first N rows
top_three = table_limit(ranked, 3)

// Remove duplicates
unique_depts = table_select(employees, "dept") |> table_drop_duplicates({})

// Rename a column
renamed = table_rename(employees, "salary", "compensation")

// Combine two tables vertically
all_staff = table_union(engineers, marketing_team)
```

### Lazy Tables

For large datasets, `lazy()` defers computation until you call `collect()`:

```tova
result = lazy(employees)
  .where(fn(row) row.salary > 80000)
  .select("name", "salary")
  .sort_by(fn(row) row.salary, { desc: true })
  .limit(3)
  |> collect()
```

The lazy builder batches your operations and applies them in one pass — no intermediate tables are created.

## Seq — Lazy Sequences

Arrays are eager: when you call `map` or `filter`, Tova builds a new array immediately. For large or infinite data, that is wasteful. `Seq` provides **lazy sequences** — chains of transformations that only run when you ask for the results.

### Creating Sequences

Use `iter()` to wrap any iterable into a lazy sequence:

```tova
// From an array
nums = iter([1, 2, 3, 4, 5])

// Sequences are lazy — nothing happens until you collect
doubled = nums.map(fn(x) x * 2)
print(doubled |> collect())   // [2, 4, 6, 8, 10]
```

### Chaining Lazy Operations

Every method on a `Seq` returns another `Seq`. The computation only runs when you call `collect()`, `reduce()`, `first()`, or iterate with `for`:

```tova
result = iter([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  .filter(fn(x) x % 2 == 0)
  .map(fn(x) x * x)
  .take(3)
  |> collect()

print(result)   // [4, 16, 36]
```

In this example, `take(3)` stops the pipeline after three results. The numbers 8 and 10 are never squared because the lazy pipeline never reaches them.

### Available Seq Operations

```tova
seq = iter([10, 20, 30, 40, 50])

// Transform
seq.map(fn(x) x + 1)          // Seq: lazy map
seq.filter(fn(x) x > 20)      // Seq: lazy filter
seq.flat_map(fn(x) [x, x])    // Seq: lazy flat_map

// Slice
seq.take(3)                    // Seq: first 3 elements
seq.drop(2)                    // Seq: skip first 2

// Combine
seq.zip(iter(["a", "b"]))     // Seq: [[10,"a"], [20,"b"]]
seq.enumerate()                // Seq: [[0,10], [1,20], ...]

// Consume (these trigger evaluation)
seq |> collect()               // [10, 20, 30, 40, 50]
seq.reduce(fn(a, x) a + x, 0) // 150
seq.first()                    // Some(10)
seq.count()                    // 5
seq.any(fn(x) x > 40)         // true
seq.all(fn(x) x > 0)          // true
seq.find(fn(x) x > 25)        // Some(30)
```

### When to Use Seq

Use `Seq` when:
- You have a **large dataset** and only need a few results (e.g., `.filter(...).take(5)`)
- You're **chaining many operations** and don't want intermediate arrays
- You want to **compose pipelines** that you can reuse or extend before evaluation

Use plain arrays when:
- Your data is small (under a few thousand elements)
- You need random access by index
- You need to iterate the same data multiple times (sequences are single-pass)

::: tip collect() Is Your Friend
Remember: a `Seq` is a recipe, not a result. Call `collect()` when you need an actual array, `reduce()` when you need a single value, or `first()` when you need just the first match.
:::

## Project: Word Frequency Counter

Let's build a tool that counts word frequencies in text and displays a histogram:

```tova
text = "the quick brown fox jumps over the lazy dog the fox the dog"

// Split into words
all_words = split(text, " ")

// Count frequencies
fn count_words(word_list) {
  var counts = {}
  for w in word_list {
    if counts[w] == undefined {
      counts[w] = 0
    }
    counts[w] += 1
  }
  counts
}

freq = count_words(all_words)

// Sort by frequency (descending)
sorted_words = entries(freq)
  |> sorted(fn(entry) 0 - entry[1])

// Display histogram
print("Word Frequencies:")
print(repeat("-", 25))
for entry in sorted_words {
  bar = repeat("#", entry[1])
  print("{pad_end(entry[0], 10)} {bar} ({entry[1]})")
}

// Stats
unique_count = len(keys(freq))
total_count = len(all_words)
print("")
print("Total words: {total_count}")
print("Unique words: {unique_count}")
```

Output:
```
Word Frequencies:
-------------------------
the        #### (4)
fox        ## (2)
dog        ## (2)
quick      # (1)
brown      # (1)
jumps      # (1)
over       # (1)
lazy       # (1)

Total words: 12
Unique words: 8
```

<TryInPlayground :code="wordCountCode" label="Word Frequency Counter" />

## Exercises

**Exercise 3.1:** Given a list of numbers, write a function `stats(numbers)` that returns an object with `{ mean, median, mode, range_val }`. Use the stdlib functions where possible.

**Exercise 3.2:** Write a function `group_and_count(items, key_fn)` that groups items by a key function and returns an object where each key maps to the count. For example, `group_and_count(["apple", "banana", "avocado", "blueberry"], fn(s) s[0])` returns `{ a: 2, b: 2 }`.

**Exercise 3.3:** Write a function `intersection(a, b)` that returns elements common to both arrays, and `difference(a, b)` that returns elements in `a` but not in `b`. Don't use any stdlib set operations — implement them with `filter` and `contains`.

## Challenge

Build an **inventory tracker** that manages a list of products. Implement:
1. `add_product(inventory, product)` — returns a new inventory with the product added
2. `remove_product(inventory, product_name)` — returns a new inventory without that product
3. `update_quantity(inventory, product_name, delta)` — returns a new inventory with adjusted quantity
4. `low_stock(inventory, threshold)` — returns products below the threshold
5. `total_value(inventory)` — returns sum of `price * quantity` for all products

All functions should return **new** arrays/objects. No mutation.

---

[← Previous: Functions That Shine](./functions) | [Next: String Craft →](./strings)
