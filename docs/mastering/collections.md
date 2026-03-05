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
```

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

<TryInPlayground :code="objectsCode" label="Objects" />

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
