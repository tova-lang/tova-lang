<script setup>
const basicPipesCode = `numbers = [5, -2, 8, -1, 3, 0, 7, -4, 6]

result = numbers
  |> filter(fn(x) x > 0)
  |> map(fn(x) x * 2)
  |> sorted()

print("Result: {result}")
print("Sum: {sum(result)}")`

const pipelinePatternsCode = `// Filter-Map-Reduce pattern
scores = [85, 92, 78, 95, 60, 88, 73, 91]

passing = scores
  |> filter(fn(s) s >= 70)
  |> map(fn(s) s / 100.0 * 4.0)

print("Passing GPAs: {passing}")
print("Count: {len(passing)}")`
</script>

# Pipes

The pipe operator `|>` is one of Tova's most ergonomic features. It lets you write data transformation chains that read left-to-right, top-to-bottom, eliminating deeply nested function calls.

## Basic Pipe Operator

The `|>` operator takes the value on the left and passes it as the **first argument** to the function on the right:

```tova
// Without pipes:
nested = upper(trim("  hello  "))

// With pipes:
piped = "  hello  " |> trim() |> upper()
```

Both produce `"HELLO"`, but the piped version reads in the order operations happen: first trim, then uppercase.

### How It Works

```tova
x |> f()
// is equivalent to:
f(x)

x |> f(a, b)
// is equivalent to:
f(x, a, b)
```

The left-hand value becomes the first argument of the right-hand function call.

## Chaining Multiple Operations

Pipes really shine when you chain several transformations:

```tova
result = data
  |> filter(fn(x) x > 0)
  |> map(fn(x) x * 2)
  |> sorted()
  |> take(5)
```

Compare this to the nested equivalent:

```tova
// Nested calls -- reads inside-out
result = take(sorted(map(filter(data, fn(x) x > 0), fn(x) x * 2)), 5)
```

The piped version is far more readable because each step is on its own line and reads in execution order.

### Real-World Examples

Processing a list of users:

```tova
active_emails = users
  |> filter(fn(u) u.active)
  |> map(fn(u) u.email)
  |> sorted()
  |> join(", ")
```

Text processing pipeline:

```tova
cleaned = raw_input
  |> trim()
  |> lower()
  |> replace("  ", " ")
  |> split(" ")
  |> filter(fn(w) len(w) > 0)
  |> join(" ")
```

Numerical computation:

```tova
average = scores
  |> filter(fn(s) s > 0)
  |> map(fn(s) s / max_score * 100)
  |> sum()
  |> fn(total) total / len(scores)
```

<TryInPlayground :code="basicPipesCode" label="Pipe Chains" />

## Placeholder `_`

Sometimes you need to pass the piped value as something other than the first argument. Use `_` as a placeholder to specify exactly where it goes:

```tova
10 |> add(5, _)
// equivalent to: add(5, 10)
```

```tova
items |> join(_, ", ")
// equivalent to: join(items, ", ")
```

### Placeholder Examples

```tova
name = "world"
  |> replace(_, "o", "0")
  |> fn(s) "Hello, {s}!"

print(name)  // Hello, w0rld!
```

```tova
// Useful when the function takes the "data" argument second
config |> merge(defaults, _)
// equivalent to: merge(defaults, config)
```

## Method Pipe

The method pipe syntax `.method()` lets you call methods in a pipe chain. The piped value becomes the receiver:

```tova
result = "  Hello, World!  "
  |> .trim()
  |> .lower()
  |> .replace("world", "tova")
// "hello, tova!"
```

This is equivalent to:

```tova
result = "  Hello, World!  ".trim().lower().replace("world", "tova")
```

The method pipe gives you consistent left-to-right reading even when mixing function calls and method calls:

```tova
text = raw_input
  |> .trim()
  |> split(_, ",")
  |> map(fn(s) s.trim())
  |> filter(fn(s) len(s) > 0)
  |> .join("; ")
```

## Pipes with Lambda Functions

You can pipe into anonymous functions for inline transformations:

```tova
result = 42
  |> fn(x) x * 2
  |> fn(x) x + 1
  |> fn(x) "{x} is the answer"
// "85 is the answer"
```

This is occasionally useful for one-off transformations that do not warrant a named function.

## Building Pipelines

Pipes encourage a functional, pipeline-oriented style. Here are some common patterns:

### Filter-Map-Reduce

```tova
total_revenue = orders
  |> filter(fn(o) o.status == "completed")
  |> map(fn(o) o.total)
  |> reduce(fn(sum, t) sum + t, 0)
```

### Extract-Transform-Load

```tova
fn to_record(row) {
  {name: row[0], age: to_int(row[1]), email: row[2]}
}

fn process_csv(raw_csv) {
  raw_csv
    |> trim()
    |> split("\n")
    |> map(fn(line) split(line, ","))
    |> filter(fn(row) len(row) == 3)
    |> map(to_record)
}
```

### Validation Chain

```tova
fn validate_input(input) {
  input
    |> trim()
    |> fn(s) if len(s) == 0 { Err("Input is empty") } else { Ok(s) }
    |> .flatMap(fn(s) if len(s) > 100 { Err("Too long") } else { Ok(s) })
    |> .flatMap(fn(s) if s.contains("<") { Err("No HTML allowed") } else { Ok(s) })
}
```

<TryInPlayground :code="pipelinePatternsCode" label="Pipeline Patterns" />

## Practical Tips

**Use pipes for three or more steps.** For a single transformation, a direct function call is fine. Pipes pay off when you chain multiple operations.

**One operation per line.** Put each pipe step on its own line for readability:

```tova
// Good:
readable = data
  |> filter(fn(x) x > 0)
  |> map(fn(x) x * 2)
  |> sum()
```

```tova
// Harder to read:
dense = data |> filter(fn(x) x > 0) |> map(fn(x) x * 2) |> sum()
```

**Use `_` sparingly.** If you find yourself using `_` frequently, the functions may not be designed for piping. Consider wrapping them in helpers that take the "data" argument first.

**Method pipe for fluent APIs.** When working with objects that have method chains (like DOM elements or builders), `.method()` pipe keeps things consistent:

```tova
query = builder
  |> .select("name", "email")
  |> .from("users")
  |> .where("active = true")
  |> .orderBy("name")
  |> .limit(10)
```
