# Lazy Iterators

Tova provides lazy iterators through the `iter()` function and the `Seq` class. Unlike eager array operations that create intermediate arrays at each step, lazy iterators process elements one at a time through the entire pipeline, only computing values when needed.

## Creating Iterators

### iter

```tova
iter(iterable) -> Seq
```

Wraps any iterable (array, string, range, generator) in a lazy `Seq`:

```tova
seq = iter([1, 2, 3, 4, 5])
seq = iter("hello")
seq = iter(range(1000000))
```

---

## Seq Methods

### filter

```tova
seq.filter(fn) -> Seq
```

Lazily filters elements, keeping only those where `fn` returns `true`.

```tova
evens = iter(range(100)).filter(fn(x) x % 2 == 0)
```

### map

```tova
seq.map(fn) -> Seq
```

Lazily transforms each element.

```tova
doubled = iter([1, 2, 3]).map(fn(x) x * 2)
```

### take

```tova
seq.take(n) -> Seq
```

Takes only the first `n` elements.

```tova
first_ten = iter(range(1000000)).take(10)
```

### drop

```tova
seq.drop(n) -> Seq
```

Skips the first `n` elements.

```tova
rest = iter([1, 2, 3, 4, 5]).drop(2)
// 3, 4, 5
```

### zip

```tova
seq.zip(other) -> Seq
```

Pairs elements from two sequences. Stops at the shorter one.

```tova
pairs = iter([1, 2, 3]).zip(iter(["a", "b", "c"]))
// (1, "a"), (2, "b"), (3, "c")
```

### flat_map

```tova
seq.flat_map(fn) -> Seq
```

Maps each element to a sequence and flattens the results.

```tova
iter(["hello world", "foo bar"])
  .flat_map(fn(s) iter(split(s, " ")))
// "hello", "world", "foo", "bar"
```

### enumerate

```tova
seq.enumerate() -> Seq
```

Pairs each element with its index.

```tova
iter(["a", "b", "c"]).enumerate()
// (0, "a"), (1, "b"), (2, "c")
```

---

## Consuming Methods

These methods trigger evaluation of the lazy pipeline and produce a final value.

### collect / toArray

```tova
seq.collect() -> [T]
seq.toArray() -> [T]
```

Evaluates the pipeline and collects results into an array.

```tova
result = iter(range(100))
  .filter(fn(x) x % 2 == 0)
  .map(fn(x) x * x)
  .take(5)
  .collect()
// [0, 4, 16, 36, 64]
```

### reduce

```tova
seq.reduce(fn, init) -> T
```

Reduces the sequence to a single value.

```tova
total = iter([1, 2, 3, 4]).reduce(fn(acc, x) acc + x, 0)
// 10
```

### first

```tova
seq.first() -> T | Nil
```

Returns the first element, or `nil` if empty.

```tova
iter([10, 20, 30]).first()    // 10
iter([]).first()               // nil
```

### count

```tova
seq.count() -> Int
```

Counts the number of elements.

```tova
iter(range(100)).filter(fn(x) x % 7 == 0).count()
// 15
```

### forEach

```tova
seq.forEach(fn) -> Nil
```

Executes a function for each element (for side effects).

```tova
iter(["Alice", "Bob"]).forEach(fn(name) print("Hello, {name}!"))
```

### any

```tova
seq.any(fn) -> Bool
```

Returns `true` if any element satisfies the predicate. Short-circuits on first match.

```tova
iter([1, 2, 3]).any(fn(x) x > 2)    // true
```

### all

```tova
seq.all(fn) -> Bool
```

Returns `true` if all elements satisfy the predicate. Short-circuits on first failure.

```tova
iter([2, 4, 6]).all(fn(x) x % 2 == 0)    // true
```

### find

```tova
seq.find(fn) -> T | Nil
```

Returns the first element matching the predicate, or `nil`.

```tova
iter(users).find(fn(u) u.name == "Alice")
```

---

## Pipe Integration

Lazy iterators work naturally with the pipe operator:

```tova
result = range(1000000)
  |> iter()
  |> .filter(fn(x) x % 2 == 0)
  |> .map(fn(x) x * x)
  |> .take(10)
  |> .collect()
```

## Lazy vs Eager

| | Eager (array functions) | Lazy (`Seq`) |
|---|---|---|
| **Intermediate arrays** | Created at each step | None |
| **Memory** | Proportional to data size | Constant |
| **Short-circuit** | Processes all elements | Stops when enough collected |
| **Best for** | Small/medium collections | Large data, early termination |

```tova
// Eager: creates 3 intermediate arrays
result = range(1000000)
  |> filter(fn(x) x % 2 == 0)
  |> map(fn(x) x * x)
  |> take(5)

// Lazy: no intermediate arrays, stops after 5 results
result = iter(range(1000000))
  .filter(fn(x) x % 2 == 0)
  .map(fn(x) x * x)
  .take(5)
  .collect()
```
