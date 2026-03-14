<script setup>
const basicPipeCode = `// The pipe operator: |>
// Turns nested calls into a readable pipeline

// Without pipes (read inside-out):
nested = toString(sum(filter(map([1,2,3,4,5], fn(x) x * x), fn(x) x > 5)))

// With pipes (read top-to-bottom):
result = [1, 2, 3, 4, 5]
  |> map(fn(x) x * x)
  |> filter(fn(x) x > 5)
  |> sum()
  |> toString()

print(result)

// Each step is clear:
// [1,2,3,4,5] → [1,4,9,16,25] → [9,16,25] → 50 → "50"`

const placeholderCode = `// The _ placeholder: put the piped value anywhere
numbers = [3, 1, 4, 1, 5, 9, 2, 6]

// Without placeholder, the value goes as first argument
sorted_vals = numbers |> sorted()

// With placeholder, control where the piped value goes
result = 10 |> Math.max(5, _)
print("Max of 5 and 10: {result}")

// Useful when the value isn't the first argument
words = ["hello", "world"]
joined = ", " |> join(words, _)
print(joined)

// Method pipe: call a method on the piped value
text = "  Hello, World!  "
cleaned = text
  |> trim()
  |> upper()
print(cleaned)`

const dataCode = `// Real-world data pipeline
sales = [
  { product: "Widget", region: "North", amount: 250, quarter: "Q1" },
  { product: "Gadget", region: "South", amount: 150, quarter: "Q1" },
  { product: "Widget", region: "South", amount: 300, quarter: "Q2" },
  { product: "Gadget", region: "North", amount: 200, quarter: "Q2" },
  { product: "Widget", region: "North", amount: 400, quarter: "Q2" },
  { product: "Doohickey", region: "South", amount: 100, quarter: "Q1" },
  { product: "Gadget", region: "North", amount: 350, quarter: "Q3" },
  { product: "Widget", region: "South", amount: 275, quarter: "Q3" }
]

// Pipeline 1: Total revenue by product
print("=== Revenue by Product ===")
by_product = sales |> groupBy(fn(s) s.product)
for entry in entries(by_product) {
  revenue = entry[1] |> map(fn(s) s.amount) |> sum()
  print("{padEnd(entry[0], 12)} \${revenue}")
}

// Pipeline 2: Top 3 sales
print("")
print("=== Top 3 Sales ===")
top3 = sales
  |> sorted(fn(s) 0 - s.amount)
  |> take(3)

for s in top3 {
  print("{s.product} ({s.region}, {s.quarter}): \${s.amount}")
}

// Pipeline 3: Average by region
print("")
print("=== Average by Region ===")
by_region = sales |> groupBy(fn(s) s.region)
for entry in entries(by_region) {
  amounts = entry[1] |> map(fn(s) s.amount)
  total = amounts |> sum()
  avg = total / len(amounts)
  print("{entry[0]}: \${avg} avg across {len(amounts)} sales")
}`

const pipelineCode = `// PROJECT: Data Pipeline Builder
// Build reusable pipeline steps as functions

// Step builders — each returns a function
fn where_field(field, predicate) {
  fn(items) items |> filter(fn(item) predicate(item[field]))
}

fn select_fields(field_list) {
  fn(items) items |> map(fn(item) {
    var result = {}
    for f in field_list {
      result[f] = item[f]
    }
    result
  })
}

fn order_by(field) {
  fn(items) items |> sorted(fn(item) item[field])
}

fn limit(n) {
  fn(items) items |> take(n)
}

// Apply pipeline: pipe data through a series of transforms
fn pipeline(data, steps) {
  var result = data
  for step in steps {
    result = step(result)
  }
  result
}

// Sample data
employees = [
  { name: "Alice", department: "Engineering", salary: 95000 },
  { name: "Bob", department: "Marketing", salary: 72000 },
  { name: "Charlie", department: "Engineering", salary: 110000 },
  { name: "Diana", department: "Marketing", salary: 68000 },
  { name: "Eve", department: "Engineering", salary: 102000 },
  { name: "Frank", department: "Sales", salary: 78000 },
  { name: "Grace", department: "Engineering", salary: 98000 }
]

// Query: top 3 engineers by salary
top_engineers = pipeline(employees, [
  where_field("department", fn(d) d == "Engineering"),
  order_by("salary"),
  limit(3),
  select_fields(["name", "salary"])
])

print("Top 3 Engineers:")
for emp in top_engineers {
  print("  {emp.name}: \${emp.salary}")
}

print("")

// Query: marketing staff names
marketing = pipeline(employees, [
  where_field("department", fn(d) d == "Marketing"),
  select_fields(["name", "department"])
])

print("Marketing Team:")
for emp in marketing {
  print("  {emp.name}")
}`
</script>

# Chapter 8: Pipes and Transformations

The pipe operator `|>` is one of Tova's most distinctive features. It transforms deeply nested function calls into clean, left-to-right data flows. Once you start thinking in pipes, you'll wonder how you ever lived without them.

This chapter teaches you to build data pipelines that are readable, composable, and powerful. By the end, you'll build a reusable pipeline system.

## The Pipe Operator

The pipe `|>` takes the value on the left and passes it as the first argument to the function on the right:

```tova
// These are equivalent:
result = toString(sum(filter(numbers, fn(x) x > 0)))

result = numbers
  |> filter(fn(x) x > 0)
  |> sum()
  |> toString()
```

The piped version reads like a recipe: "take numbers, filter positives, sum them, convert to string."

<TryInPlayground :code="basicPipeCode" label="Basic Pipes" />

## Why Pipes Matter

Compare these two approaches to the same problem:

```tova
// Nested calls (read inside-out)
result = join(map(filter(split(upper(trim(input)), " "), fn(w) len(w) > 3), fn(w) lower(w)), ", ")

// Piped (read top-to-bottom)
result = input
  |> trim()
  |> upper()
  |> split(" ")
  |> filter(fn(w) len(w) > 3)
  |> map(fn(w) lower(w))
  |> join(", ")
```

The piped version is:
- **Readable**: Each step is on its own line
- **Debuggable**: Comment out any step to see intermediate values
- **Modifiable**: Add or remove steps without restructuring
- **Self-documenting**: The data transformation is visible

## The Placeholder: `_`

Sometimes the piped value shouldn't be the first argument. Use `_` to place it anywhere:

```tova
// Default: value becomes first argument
[1, 2, 3] |> map(fn(x) x * 2)

// Placeholder: value goes where _ is
42 |> "The answer is {_}"
// "The answer is 42"

items = [3, 1, 4]
", " |> join(items, _)
// "3, 1, 4"
```

<TryInPlayground :code="placeholderCode" label="Placeholder" />

## Common Pipeline Patterns

### Pattern 1: Filter-Map-Reduce

The most common pipeline shape:

```tova
// Revenue from high-value orders
orders
  |> filter(fn(o) o.amount > 100)     // Select
  |> map(fn(o) o.amount * o.quantity)  // Transform
  |> sum()                              // Aggregate
```

### Pattern 2: Group and Summarize

```tova
// Sales by region
sales
  |> groupBy(fn(s) s.region)       // Group into buckets
  |> entries()                        // Get key-value pairs
  |> map(fn(e) {                     // Summarize each group
    region: e[0],
    total: e[1] |> map(fn(s) s.amount) |> sum(),
    count: len(e[1])
  })
  |> sorted(fn(r) 0 - r.total)    // Sort by total descending
```

### Pattern 3: Clean and Validate

```tova
// Process user input
raw_emails
  |> map(fn(e) trim(e))                // Clean whitespace
  |> map(fn(e) lower(e))            // Normalize case
  |> filter(fn(e) contains(e, "@"))      // Basic validation
  |> unique()                             // Remove duplicates
  |> sorted()                               // Sort alphabetically
```

### Pattern 4: Text Processing

```tova
// Extract unique words from text
text
  |> lower()
  |> split(" ")
  |> map(fn(w) replace(w, ",", ""))
  |> map(fn(w) replace(w, ".", ""))
  |> filter(fn(w) len(w) > 0)
  |> unique()
  |> sorted()
```

### Pattern 5: Building Strings

```tova
// Generate a formatted report
items
  |> sorted(fn(i) i.name)
  |> map(fn(i) "{padEnd(i.name, 20)} ${i.price}")
  |> join("\n")
```

## Pipes with Your Own Functions

Any function works with pipes. Write functions that accept data as the first parameter:

```tova
fn above_average(numbers) {
  avg = numbers |> sum() / len(numbers)
  numbers |> filter(fn(x) x > avg)
}

fn top_n(items, n) {
  items |> sorted() |> reversed() |> take(n)
}

fn format_list(items) {
  items
    |> map(fn(item) "- {item}")
    |> join("\n")
}

// Compose them
scores = [78, 92, 65, 88, 95, 71, 84]

result = scores
  |> above_average()
  |> top_n(3)
  |> map(fn(s) toString(s))
  |> format_list()

print("Top scores above average:\n{result}")
```

## Building a Real Data Pipeline

Let's process a realistic dataset:

```tova
sales = [
  { product: "Widget", region: "North", amount: 250, quarter: "Q1" },
  { product: "Gadget", region: "South", amount: 150, quarter: "Q1" },
  { product: "Widget", region: "South", amount: 300, quarter: "Q2" },
  { product: "Gadget", region: "North", amount: 200, quarter: "Q2" },
  { product: "Widget", region: "North", amount: 400, quarter: "Q2" },
  { product: "Doohickey", region: "South", amount: 100, quarter: "Q1" },
  { product: "Gadget", region: "North", amount: 350, quarter: "Q3" },
  { product: "Widget", region: "South", amount: 275, quarter: "Q3" }
]

// Revenue by product
by_product = sales |> groupBy(fn(s) s.product)
for entry in entries(by_product) {
  revenue = entry[1] |> map(fn(s) s.amount) |> sum()
  print("{entry[0]}: ${revenue}")
}

// Average by region
by_region = sales |> groupBy(fn(s) s.region)
for entry in entries(by_region) {
  amounts = entry[1] |> map(fn(s) s.amount)
  total = amounts |> sum()
  avg = total / len(amounts)
  print("{entry[0]}: ${avg} avg")
}
```

<TryInPlayground :code="dataCode" label="Data Pipeline" />

## Functional Programming Toolkit

Tova's stdlib includes powerful functional programming utilities that compose beautifully with pipes:

### compose and pipe_fn

Combine multiple functions into one:

```tova
// compose: right-to-left (math style)
parse_and_validate = compose(validate_positive, parse_int)
parse_and_validate("42")   // Ok(42)

// pipe_fn: left-to-right (more readable)
process = pipeFn(trim, lower, split(" "), unique)
process("  Hello Hello World  ")   // ["hello", "world"]
```

### curry and partial

Create specialized versions of general functions:

```tova
// curry: transform f(a, b) into f(a)(b)
add = fn(a, b) a + b
add5 = curry(add)(5)
print(add5(3))   // 8

// partial: lock in some arguments
greet = fn(greeting, name) "{greeting}, {name}!"
hello = partial(greet, "Hello")
print(hello("Alice"))   // "Hello, Alice!"
```

`partial` is especially useful with pipes:

```tova
// Create reusable pipeline steps
above = fn(threshold, x) x > threshold
items |> filter(partial(above, 100))

multiply_by = fn(factor, x) x * factor
items |> map(partial(multiply_by, 2))
```

### memoize

Cache function results for expensive computations:

```tova
fn expensive_calculation(n) {
  // Simulates slow computation
  sleep(1000)
  n * n
}

fast_calc = memoize(expensive_calculation)
fast_calc(42)    // Slow first time (1 second)
fast_calc(42)    // Instant — cached result
```

### once

Ensure a function only executes once:

```tova
initialize = once(fn() {
  print("Setting up...")
  load_config()
})

initialize()    // "Setting up..." — runs
initialize()    // Nothing — already ran
initialize()    // Nothing — still already ran
```

### debounce and throttle

Control how often a function can be called:

```tova
// debounce: wait until calls stop for N ms
save_draft = debounce(fn(content) {
  write_file("draft.txt", content)
}, 300)
// Rapid calls → only the last one executes (after 300ms of quiet)

// throttle: run at most once every N ms
log_position = throttle(fn(pos) {
  print("Position: {pos}")
}, 1000)
// Rapid calls → runs once per second maximum
```

### flip and lazy

```tova
// flip: swap the first two arguments
divide = fn(a, b) a / b
divide_by = flip(divide)
[10, 20, 30] |> map(partial(divide_by, 5))   // [2, 4, 6]

// lazy: defer computation until needed
config = lazy(fn() load_expensive_config())
// Config isn't loaded until first use:
print(config())   // Loads and returns config
print(config())   // Returns cached config
```

### identity and negate

Two small utilities that come up surprisingly often in functional code:

`identity` returns its argument unchanged. It sounds useless at first, but it serves as a perfect default or no-op in pipelines:

```tova
[1, 2, 3] |> map(identity)    // [1, 2, 3]

// Use it as a no-op placeholder when a transform is conditionally applied
transform = if should_process { fn(x) x * 2 } else { identity }
data |> map(transform)

// Also handy as a default argument
fn process(items, transform_fn) {
  items |> map(transform_fn)
}
process([1, 2, 3], identity)   // no transformation applied
```

`negate` takes a predicate function and returns a new function that flips its boolean result. It saves you from writing throwaway lambdas just to add `!`:

```tova
is_even = fn(x) x % 2 == 0
is_odd = negate(is_even)

[1, 2, 3, 4, 5] |> filter(is_odd)    // [1, 3, 5]

// Compare — before negate you'd write:
[1, 2, 3, 4, 5] |> filter(fn(x) !is_even(x))    // same result, more noise

// Works great in pipelines with named predicates
is_empty = fn(s) len(s) == 0
is_not_empty = negate(is_empty)

["hello", "", "world", "", "!"]
  |> filter(is_not_empty)    // ["hello", "world", "!"]
```

::: tip Functional Thinking
These utilities shine when combined. A common pattern: use `partial` to specialize functions, `compose` to chain them, and `memoize` to cache expensive steps. This creates pipelines that are both reusable and efficient.
:::

## Project: Reusable Pipeline Builder

Let's build a system where pipeline steps are first-class values:

```tova
// Step builders
fn where_field(field, predicate) {
  fn(items) items |> filter(fn(item) predicate(item[field]))
}

fn select_fields(field_list) {
  fn(items) items |> map(fn(item) {
    var result = {}
    for f in field_list {
      result[f] = item[f]
    }
    result
  })
}

fn order_by(field) {
  fn(items) items |> sorted(fn(item) item[field])
}

fn limit(n) {
  fn(items) items |> take(n)
}

fn pipeline(data, steps) {
  var result = data
  for step in steps {
    result = step(result)
  }
  result
}

// Use it — reads like a SQL query
top_engineers = pipeline(employees, [
  where_field("department", fn(d) d == "Engineering"),
  order_by("salary"),
  limit(3),
  select_fields(["name", "salary"])
])
```

Each step is a function that takes a collection and returns a collection. The `pipeline` function chains them together. This is functional composition made practical.

<TryInPlayground :code="pipelineCode" label="Pipeline Builder" />

::: tip Design Tip: Functions That Return Functions
The step builders (`where_field`, `order_by`, `limit`) are all **functions that return functions**. This pattern — called a "factory" or "builder" — is one of the most powerful patterns in functional programming. Master it, and you can build incredibly flexible, reusable systems.
:::

## Exercises

**Exercise 8.1:** Write a pipeline that processes a list of log entries (`{ timestamp, level, message }`) to:
1. Filter to only "error" and "warn" levels
2. Sort by timestamp (newest first)
3. Take the 5 most recent
4. Format each as `"[LEVEL] message"` strings
5. Join with newlines

**Exercise 8.2:** Add a `group_and_aggregate(field, agg_fn)` step builder to the pipeline system. It should group items by a field and apply an aggregation function to each group. Use it to compute average salary by department.

**Exercise 8.3:** Write a `csv_pipeline(csv_text)` function that:
1. Splits the CSV text into lines
2. Takes the first line as headers
3. Maps remaining lines into objects using the headers as keys
4. Returns the array of objects

Then pipe the result through a filter/sort/format chain.

## Challenge

Build a **mini data analysis toolkit** with these pipeline-compatible functions:
1. `moving_average(window_size)` — returns a function that computes moving averages
2. `normalize()` — scales values to 0.0-1.0 range
3. `outliers(std_devs)` — filters to values beyond N standard deviations
4. `histogram(buckets)` — returns a frequency distribution
5. `correlate(xs, ys)` — computes Pearson correlation coefficient

Chain them together to analyze a dataset of your choice.

---

[← Previous: Fearless Error Handling](./error-handling) | [Next: Modules and Architecture →](./modules)
