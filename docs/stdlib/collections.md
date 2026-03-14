# Collections

Collection functions operate on arrays, strings, and objects. They are the workhorses of Tova's standard library -- you will use them in nearly every program.

All collection functions return **new values** rather than mutating the original data.

## I/O

### print

```tova
print(...args) -> Nil
```

Outputs to the console. Accepts multiple arguments, which are printed separated by spaces.

```tova
print("Hello, World!")
// Hello, World!

print("Name:", name, "Age:", age)
// Name: Alice Age: 30

print("Items: {len(items)}")
// Items: 5
```

---

## Length & Type

### len

```tova
len(v) -> Int
```

Returns the length of a string, array, or the number of keys in an object. Returns `0` for `nil`.

```tova
len([1, 2, 3])         // 3
len("hello")            // 5
len({ a: 1, b: 2 })   // 2
len([])                 // 0
len(nil)                // 0
```

### type_of

```tova
typeOf(v) -> String
```

Returns the Tova type name of a value. For custom type variants, returns the variant tag name.

```tova
typeOf(42)             // "Int"
typeOf(3.14)           // "Float"
typeOf("hello")        // "String"
typeOf(true)           // "Bool"
typeOf([1, 2])         // "List"
typeOf(nil)            // "Nil"
typeOf(print)          // "Function"
typeOf({ a: 1 })      // "Object"

// Custom type variants return their tag name
typeOf(Ok(1))          // "Ok"
typeOf(None)           // "None"
```

---

## Generating & Transforming

### range

```tova
range(end) -> List[Int]
range(start, end) -> List[Int]
range(start, end, step) -> List[Int]
```

Generates an array of sequential integers. The `end` value is exclusive.

```tova
range(5)                // [0, 1, 2, 3, 4]
range(2, 7)             // [2, 3, 4, 5, 6]
range(0, 10, 2)         // [0, 2, 4, 6, 8]
range(10, 0, -1)        // [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
```

```tova
// Common pattern: iterate n times
for i in range(5) {
  print("Iteration {i}")
}
```

### filled

```tova
filled(n, value) -> List[T]
```

Creates a pre-allocated array of `n` elements, all set to `value`. More efficient than building an array with a push loop.

```tova
filled(5, 0)        // [0, 0, 0, 0, 0]
filled(3, "hello")  // ["hello", "hello", "hello"]
filled(100, false)  // [false, false, ..., false]
```

```tova
// Use filled() instead of a push loop for constant values
var grid = filled(rows * cols, 0)
```

---

### enumerate

```tova
enumerate(arr) -> List[[Int, T]]
```

Returns `[index, value]` pairs. Useful for iterating with an index.

```tova
enumerate(["a", "b", "c"])
// [[0, "a"], [1, "b"], [2, "c"]]

for i, item in enumerate(items) {
  print("{i}: {item}")
}
```

### map

```tova
map(arr, fn) -> List
```

Applies a function to each element and returns a new array of results.

```tova
map([1, 2, 3], fn(x) x * 2)
// [2, 4, 6]

names = ["alice", "bob"]
map(names, capitalize)
// ["Alice", "Bob"]
```

### filter

```tova
filter(arr, fn) -> List
```

Returns a new array containing only elements where the function returns `true`.

```tova
filter([1, 2, 3, 4, 5], fn(x) x > 3)
// [4, 5]

evens = filter(range(10), fn(x) x % 2 == 0)
// [0, 2, 4, 6, 8]
```

### flat_map

```tova
flatMap(arr, fn) -> List
```

Applies a function to each element (which should return an array), then flattens the result one level.

```tova
flatMap([1, 2, 3], fn(x) [x, x * 10])
// [1, 10, 2, 20, 3, 30]

flatMap(["hello world", "foo bar"], fn(s) split(s, " "))
// ["hello", "world", "foo", "bar"]
```

### flatten

```tova
flatten(arr) -> List
```

Flattens a nested array by one level.

```tova
flatten([[1, 2], [3, 4], [5]])
// [1, 2, 3, 4, 5]

flatten([[1, [2]], [3]])
// [1, [2], 3]   -- only one level
```

### unique

```tova
unique(arr) -> List
```

Returns a new array with duplicate elements removed. Uses `Set` internally for deduplication.

```tova
unique([1, 2, 2, 3, 3, 3])
// [1, 2, 3]

unique(["a", "b", "a", "c"])
// ["a", "b", "c"]
```

### chunk

```tova
chunk(arr, n) -> List[List]
```

Splits an array into chunks of size `n`. The last chunk may be smaller.

```tova
chunk([1, 2, 3, 4, 5], 2)
// [[1, 2], [3, 4], [5]]

chunk(range(9), 3)
// [[0, 1, 2], [3, 4, 5], [6, 7, 8]]
```

---

## Reducing & Aggregating

### reduce

```tova
reduce(arr, fn, init?) -> T
```

Folds an array into a single value using an accumulator function. If `init` is omitted, the first element is used as the initial value.

```tova
reduce([1, 2, 3, 4], fn(acc, x) acc + x, 0)
// 10

reduce(["a", "b", "c"], fn(acc, x) acc + x, "")
// "abc"

// Without initial value
reduce([1, 2, 3], fn(acc, x) acc * x)
// 6
```

### sum

```tova
sum(arr) -> Number
```

Returns the sum of all elements in the array. Equivalent to `reduce(arr, fn(a, b) a + b, 0)`.

```tova
sum([1, 2, 3, 4])      // 10
sum([])                  // 0
sum(range(101))          // 5050
```

### count

```tova
count(arr, fn) -> Int
```

Counts the number of elements that satisfy a predicate.

```tova
count([1, 2, 3, 4, 5], fn(x) x > 3)
// 2

count(["apple", "avocado", "banana"], fn(s) startsWith(s, "a"))
// 2
```

### min

```tova
min(arr) -> T | Nil
```

Returns the minimum element in the array. Returns `nil` for an empty array.

```tova
min([3, 1, 4, 1, 5])   // 1
min(["c", "a", "b"])    // "a"
min([])                  // nil
```

### max

```tova
max(arr) -> T | Nil
```

Returns the maximum element in the array. Returns `nil` for an empty array.

```tova
max([3, 1, 4, 1, 5])   // 5
max(["c", "a", "b"])    // "c"
max([])                  // nil
```

---

## Searching

### find

```tova
find(arr, fn) -> T | Nil
```

Returns the first element where the function returns `true`. Returns `nil` if no element matches.

```tova
find([1, 2, 3, 4], fn(x) x > 2)
// 3

find(users, fn(u) u.name == "Alice")
// { name: "Alice", age: 30 }

find([1, 2, 3], fn(x) x > 10)
// nil
```

### find_index

```tova
findIndex(arr, fn) -> Int | Nil
```

Returns the index of the first element where the function returns `true`. Returns `nil` if no element matches.

```tova
findIndex([10, 20, 30], fn(x) x > 15)
// 1

findIndex(["a", "b", "c"], fn(s) s == "b")
// 1

findIndex([1, 2, 3], fn(x) x > 10)
// nil
```

### includes

```tova
includes(arr, value) -> Bool
```

Returns `true` if the array contains the given value.

```tova
includes([1, 2, 3], 2)        // true
includes([1, 2, 3], 5)        // false
includes(["a", "b"], "a")     // true
```

### any

```tova
any(arr, fn) -> Bool
```

Returns `true` if any element satisfies the predicate.

```tova
any([1, 2, 3], fn(x) x > 2)       // true
any([1, 2, 3], fn(x) x > 10)      // false
any([], fn(x) true)                 // false
```

### all

```tova
all(arr, fn) -> Bool
```

Returns `true` if all elements satisfy the predicate. Returns `true` for an empty array.

```tova
all([2, 4, 6], fn(x) x % 2 == 0)  // true
all([2, 3, 6], fn(x) x % 2 == 0)  // false
all([], fn(x) false)                // true
```

---

## Ordering & Slicing

### sorted

```tova
sorted(arr, keyFn?) -> List
```

Returns a sorted copy of the array. An optional key function specifies what to sort by.

```tova
sorted([3, 1, 4, 1, 5])
// [1, 1, 3, 4, 5]

sorted(["banana", "apple", "cherry"])
// ["apple", "banana", "cherry"]

// Sort by key function
sorted(users, fn(u) u.age)
// sorts users by age ascending

sorted(items, fn(x) -x.price)
// sorts by price descending
```

### reversed

```tova
reversed(arr) -> List
```

Returns a reversed copy of the array.

```tova
reversed([1, 2, 3])    // [3, 2, 1]
reversed("hello" |> chars())  // ["o", "l", "l", "e", "h"]
```

### take

```tova
take(arr, n) -> List
```

Returns the first `n` elements.

```tova
take([1, 2, 3, 4, 5], 3)    // [1, 2, 3]
take([1, 2], 10)              // [1, 2]
```

### drop

```tova
drop(arr, n) -> List
```

Returns the array with the first `n` elements removed.

```tova
drop([1, 2, 3, 4, 5], 2)    // [3, 4, 5]
drop([1, 2], 10)              // []
```

### first

```tova
first(arr) -> T | Nil
```

Returns the first element, or `nil` if the array is empty.

```tova
first([10, 20, 30])    // 10
first([])               // nil
```

### last

```tova
last(arr) -> T | Nil
```

Returns the last element, or `nil` if the array is empty.

```tova
last([10, 20, 30])     // 30
last([])                // nil
```

---

## Combining & Splitting

### zip

```tova
zip(...arrays) -> List[List]
```

Combines multiple arrays into an array of tuples. Truncates to the length of the shortest array.

```tova
zip([1, 2, 3], ["a", "b", "c"])
// [[1, "a"], [2, "b"], [3, "c"]]

zip([1, 2], ["a", "b"], [true, false])
// [[1, "a", true], [2, "b", false]]

// Truncates to shortest
zip([1, 2, 3], ["a", "b"])
// [[1, "a"], [2, "b"]]
```

### partition

```tova
partition(arr, fn) -> [List, List]
```

Splits an array into two arrays: elements that pass the predicate and elements that fail it.

```tova
partition([1, 2, 3, 4, 5], fn(x) x % 2 == 0)
// [[2, 4], [1, 3, 5]]

evens, odds = partition(range(10), fn(x) x % 2 == 0)
```

### group_by

```tova
groupBy(arr, fn) -> Object
```

Groups elements into an object by the key returned from the function.

```tova
groupBy(["apple", "avocado", "banana", "blueberry"], fn(s) chars(s) |> first())
// { a: ["apple", "avocado"], b: ["banana", "blueberry"] }

groupBy(users, fn(u) u.role)
// { admin: [...], user: [...] }
```

---

## Advanced Collections

### zip_with

```tova
zipWith(a, b, fn) -> List
```

Combines two arrays element-by-element using a function. Like `zip` followed by `map`, but in one step.

```tova
zipWith([1, 2, 3], [10, 20, 30], fn(a, b) a + b)
// [11, 22, 33]

zipWith(["Alice", "Bob"], [30, 25], fn(name, age) { name: name, age: age })
// [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]
```

### frequencies

```tova
frequencies(arr) -> Object
```

Counts how often each value appears. Returns an object of value-to-count pairs.

```tova
frequencies(["a", "b", "a", "c", "b", "a"])
// { a: 3, b: 2, c: 1 }

frequencies([1, 2, 2, 3, 3, 3])
// { "1": 1, "2": 2, "3": 3 }
```

### scan

```tova
scan(arr, fn, init) -> List
```

Like `reduce`, but returns all intermediate results. Useful for running totals.

```tova
scan([1, 2, 3, 4], fn(acc, x) acc + x, 0)
// [1, 3, 6, 10]

scan([100, -20, 50, -10], fn(bal, tx) bal + tx, 0)
// [100, 80, 130, 120]
```

### min_by

```tova
minBy(arr, fn) -> T | Nil
```

Returns the element with the smallest key as determined by the function. Returns `nil` for empty arrays.

```tova
minBy([{n: 3}, {n: 1}, {n: 2}], fn(x) x.n)
// { n: 1 }

minBy(["hello", "hi", "hey"], fn(s) len(s))
// "hi"

minBy([], fn(x) x)
// nil
```

### max_by

```tova
maxBy(arr, fn) -> T | Nil
```

Returns the element with the largest key as determined by the function. Returns `nil` for empty arrays.

```tova
maxBy([{n: 3}, {n: 1}, {n: 2}], fn(x) x.n)
// { n: 3 }

maxBy(users, fn(u) u.age)
// user with highest age
```

### sum_by

```tova
sumBy(arr, fn) -> Number
```

Sums the results of applying a function to each element. Shorthand for `map` + `sum`.

```tova
sumBy([{v: 10}, {v: 20}, {v: 30}], fn(x) x.v)
// 60

sumBy(cart, fn(item) item.price * item.qty)
// total cost
```

### product

```tova
product(arr) -> Number
```

Multiplies all elements in the array. Returns `1` for an empty array.

```tova
product([1, 2, 3, 4])    // 24
product([5])               // 5
product([2, 0, 10])        // 0
```

### sliding_window

```tova
slidingWindow(arr, n) -> List[List]
```

Returns all contiguous sub-arrays of size `n`. Useful for moving averages, pattern detection.

```tova
slidingWindow([1, 2, 3, 4], 2)
// [[1, 2], [2, 3], [3, 4]]

slidingWindow([1, 2, 3, 4, 5], 3)
// [[1, 2, 3], [2, 3, 4], [3, 4, 5]]

slidingWindow([1, 2], 5)
// []  -- window larger than array
```

---

## Set Operations

### union

```tova
union(a, b) -> List
```

Returns a new array containing all unique elements from both arrays. Also works on Tables for table union.

```tova
union([1, 2, 3], [3, 4, 5])       // [1, 2, 3, 4, 5]
union(["a", "b"], ["b", "c"])      // ["a", "b", "c"]
```

### intersection

```tova
intersection(a, b) -> List
```

Returns elements present in both arrays.

```tova
intersection([1, 2, 3], [2, 3, 4])    // [2, 3]
intersection([1, 2], [3, 4])           // []
```

### difference

```tova
difference(a, b) -> List
```

Returns elements in `a` that are not in `b`.

```tova
difference([1, 2, 3], [2, 3, 4])      // [1]
difference([1, 2, 3], [4, 5])          // [1, 2, 3]
```

### symmetric_difference

```tova
symmetricDifference(a, b) -> List
```

Returns elements in either array but not both.

```tova
symmetricDifference([1, 2, 3], [2, 3, 4])    // [1, 4]
symmetricDifference([1, 2], [1, 2])           // []
```

### is_subset

```tova
isSubset(a, b) -> Bool
```

Returns `true` if every element of `a` is in `b`.

```tova
isSubset([1, 2], [1, 2, 3])      // true
isSubset([1, 4], [1, 2, 3])      // false
isSubset([], [1, 2])              // true
```

### is_superset

```tova
isSuperset(a, b) -> Bool
```

Returns `true` if `a` contains every element of `b`.

```tova
isSuperset([1, 2, 3], [1, 2])    // true
isSuperset([1, 2], [1, 2, 3])    // false
```

---

## Itertools

### pairwise

```tova
pairwise(arr) -> List[[T, T]]
```

Returns adjacent pairs from the array.

```tova
pairwise([1, 2, 3, 4])        // [[1, 2], [2, 3], [3, 4]]
pairwise([1])                   // []
pairwise([])                    // []
```

### combinations

```tova
combinations(arr, r) -> List[List]
```

Returns all `r`-length combinations of elements (order does not matter).

```tova
combinations([1, 2, 3, 4], 2)
// [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]

combinations(["a", "b", "c"], 2)
// [["a", "b"], ["a", "c"], ["b", "c"]]
```

### permutations

```tova
permutations(arr, r?) -> List[List]
```

Returns all `r`-length permutations of elements (order matters). If `r` is omitted, returns full-length permutations.

```tova
permutations([1, 2, 3], 2)
// [[1, 2], [1, 3], [2, 1], [2, 3], [3, 1], [3, 2]]

permutations([1, 2, 3])
// all 6 orderings of [1, 2, 3]
```

### intersperse

```tova
intersperse(arr, sep) -> List
```

Inserts `sep` between every element.

```tova
intersperse([1, 2, 3], 0)         // [1, 0, 2, 0, 3]
intersperse(["a", "b"], "-")      // ["a", "-", "b"]
intersperse([1], 0)                // [1]
```

### interleave

```tova
interleave(...arrays) -> List
```

Interleaves elements from multiple arrays.

```tova
interleave([1, 2], ["a", "b"])     // [1, "a", 2, "b"]
interleave([1, 2, 3], ["a", "b"])  // [1, "a", 2, "b", 3]
```

### repeat_value

```tova
repeatValue(val, n) -> List
```

Creates an array of `n` copies of `val`.

```tova
repeatValue(0, 5)                 // [0, 0, 0, 0, 0]
repeatValue("x", 3)               // ["x", "x", "x"]
```

---

## Array Utilities

### binary_search

```tova
binarySearch(arr, target, keyFn?) -> Int
```

Performs binary search on a sorted array. Returns the index of the target, or `-1` if not found.

```tova
binarySearch([1, 3, 5, 7, 9], 5)     // 2
binarySearch([1, 3, 5, 7, 9], 4)     // -1

// With key function
items = [{ id: 1 }, { id: 3 }, { id: 5 }]
binarySearch(items, 3, fn(x) x.id)   // 1
```

### is_sorted

```tova
isSorted(arr, keyFn?) -> Bool
```

Returns `true` if the array is sorted in ascending order.

```tova
isSorted([1, 2, 3, 4])               // true
isSorted([1, 3, 2])                   // false
isSorted([])                           // true

// With key function
isSorted([{n: 1}, {n: 2}, {n: 3}], fn(x) x.n)  // true
```

### compact

```tova
compact(arr) -> List
```

Removes `nil` values from an array. Keeps other falsy values like `0`, `""`, and `false`.

```tova
compact([1, nil, 2, nil, 3])          // [1, 2, 3]
compact([0, "", false, nil])          // [0, "", false]
```

### rotate

```tova
rotate(arr, n) -> List
```

Rotates an array by `n` positions. Positive `n` rotates left, negative rotates right.

```tova
rotate([1, 2, 3, 4, 5], 2)            // [3, 4, 5, 1, 2]
rotate([1, 2, 3, 4, 5], -1)           // [5, 1, 2, 3, 4]
```

### insert_at

```tova
insertAt(arr, idx, val) -> List
```

Returns a new array with `val` inserted at position `idx`. Does not mutate the original.

```tova
insertAt([1, 2, 3], 1, "x")          // [1, "x", 2, 3]
insertAt([1, 2], 0, 0)               // [0, 1, 2]
```

### remove_at

```tova
removeAt(arr, idx) -> List
```

Returns a new array with the element at `idx` removed. Does not mutate the original.

```tova
removeAt([1, 2, 3], 1)               // [1, 3]
removeAt(["a", "b", "c"], 0)         // ["b", "c"]
```

### update_at

```tova
updateAt(arr, idx, val) -> List
```

Returns a new array with the element at `idx` replaced by `val`. Does not mutate the original.

```tova
updateAt([1, 2, 3], 1, "x")          // [1, "x", 3]
updateAt(["a", "b", "c"], 2, "z")    // ["a", "b", "z"]
```

---

## Ordering

### Ordering Type

The `Ordering` type represents the result of comparing two values:

| Variant | Description |
|---------|-------------|
| `Less` | First value is smaller |
| `Equal` | Values are equal |
| `Greater` | First value is larger |

### compare

```tova
compare(a, b) -> Ordering
```

Compares two values and returns their ordering.

```tova
compare(1, 2)        // Less
compare(5, 5)        // Equal
compare("b", "a")    // Greater
```

Useful for key-based sorting:

```tova
// Sort by a single key
items |> sorted(fn(item) item.priority)

// Sort by priority, then by name (use a composite key)
items |> sorted(fn(item) [item.priority, item.name])
```

### compare_by

```tova
compareBy(arr, fn) -> List
```

Sorts an array using a comparator function that returns an `Ordering` value.

```tova
compareBy(users, fn(a, b) compare(a.age, b.age))    // sort by age
compareBy(words, fn(a, b) compare(len(a), len(b)))   // sort by length
```

---

## Pipeline Examples

These functions compose beautifully with the pipe operator `|>`:

```tova
// Find the top 3 most expensive items
items
  |> sorted(fn(x) -x.price)
  |> take(3)
  |> map(fn(x) x.name)

// Word frequency count
text
  |> lower()
  |> words()
  |> groupBy(fn(w) w)
  |> entries()
  |> map(fn(pair) { word: pair[0], count: len(pair[1]) })
  |> sorted(fn(x) -x.count)

// Flatten, deduplicate, and sort
nested_lists
  |> flatten()
  |> unique()
  |> sorted()

// Set operations in pipelines
users_a
  |> intersection(users_b)
  |> sorted(fn(u) u.name)

// Immutable array updates
todos
  |> insertAt(0, new_todo)
  |> removeAt(completed_idx)
```

## Parallel Processing

### parallel_map

```tova
await parallelMap(arr, f) -> [T]
await parallelMap(arr, f, num_workers) -> [T]
```

Distributes array processing across multiple CPU cores using a persistent worker pool. Workers are created once and reused across calls.

```tova
results = await parallelMap(large_dataset, fn(item) {
  expensive_computation(item)
})

// Specify number of workers
results = await parallelMap(data, process_item, 8)
```

- Automatically detects available CPU cores
- Falls back to sequential processing for arrays smaller than 4 elements
- Workers persist across calls (no startup overhead on subsequent calls)
- Returns results in the same order as the input array

Use `parallel_map` for CPU-bound work on large arrays. For I/O-bound work (network requests, file reads), use `async` with `parallel()` instead.

See the [Performance guide](../guide/performance.md) for benchmarks and usage patterns.
