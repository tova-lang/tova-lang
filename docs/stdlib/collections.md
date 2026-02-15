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

Returns the length of a string, array, or the number of keys in an object. Returns `0` for `null`.

```tova
len([1, 2, 3])         // 3
len("hello")            // 5
len({ a: 1, b: 2 })   // 2
len([])                 // 0
len(null)               // 0
```

### type_of

```tova
type_of(v) -> String
```

Returns the Tova type name of a value. For custom type variants, returns the variant tag name.

```tova
type_of(42)             // "Int"
type_of(3.14)           // "Float"
type_of("hello")        // "String"
type_of(true)           // "Bool"
type_of([1, 2])         // "List"
type_of(null)           // "Nil"
type_of(print)          // "Function"
type_of({ a: 1 })      // "Object"

// Custom type variants return their tag name
type_of(Ok(1))          // "Ok"
type_of(None)           // "None"
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
flat_map(arr, fn) -> List
```

Applies a function to each element (which should return an array), then flattens the result one level.

```tova
flat_map([1, 2, 3], fn(x) [x, x * 10])
// [1, 10, 2, 20, 3, 30]

flat_map(["hello world", "foo bar"], fn(s) split(s, " "))
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

reduce(["a", "b", "c"], fn(acc, x) acc ++ x, "")
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

count(["apple", "avocado", "banana"], fn(s) starts_with(s, "a"))
// 2
```

### min

```tova
min(arr) -> T | Nil
```

Returns the minimum element in the array. Returns `null` for an empty array.

```tova
min([3, 1, 4, 1, 5])   // 1
min(["c", "a", "b"])    // "a"
min([])                  // null
```

### max

```tova
max(arr) -> T | Nil
```

Returns the maximum element in the array. Returns `null` for an empty array.

```tova
max([3, 1, 4, 1, 5])   // 5
max(["c", "a", "b"])    // "c"
max([])                  // null
```

---

## Searching

### find

```tova
find(arr, fn) -> T | Nil
```

Returns the first element where the function returns `true`. Returns `null` if no element matches.

```tova
find([1, 2, 3, 4], fn(x) x > 2)
// 3

find(users, fn(u) u.name == "Alice")
// { name: "Alice", age: 30 }

find([1, 2, 3], fn(x) x > 10)
// null
```

### find_index

```tova
find_index(arr, fn) -> Int | Nil
```

Returns the index of the first element where the function returns `true`. Returns `null` if no element matches.

```tova
find_index([10, 20, 30], fn(x) x > 15)
// 1

find_index(["a", "b", "c"], fn(s) s == "b")
// 1

find_index([1, 2, 3], fn(x) x > 10)
// null
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

Returns the first element, or `null` if the array is empty.

```tova
first([10, 20, 30])    // 10
first([])               // null
```

### last

```tova
last(arr) -> T | Nil
```

Returns the last element, or `null` if the array is empty.

```tova
last([10, 20, 30])     // 30
last([])                // null
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
group_by(arr, fn) -> Object
```

Groups elements into an object by the key returned from the function.

```tova
group_by(["apple", "avocado", "banana", "blueberry"], fn(s) chars(s) |> first())
// { a: ["apple", "avocado"], b: ["banana", "blueberry"] }

group_by(users, fn(u) u.role)
// { admin: [...], user: [...] }
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
  |> group_by(fn(w) w)
  |> entries()
  |> map(fn(pair) { word: pair[0], count: len(pair[1]) })
  |> sorted(fn(x) -x.count)

// Flatten, deduplicate, and sort
nested_lists
  |> flatten()
  |> unique()
  |> sorted()
```
