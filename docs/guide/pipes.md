# Pipes

The pipe operator `|>` is one of Lux's most ergonomic features. It lets you write data transformation chains that read left-to-right, top-to-bottom, eliminating deeply nested function calls.

## Basic Pipe Operator

The `|>` operator takes the value on the left and passes it as the **first argument** to the function on the right:

```lux
// Without pipes:
result = to_upper(trim("  hello  "))

// With pipes:
result = "  hello  " |> trim() |> to_upper()
```

Both produce `"HELLO"`, but the piped version reads in the order operations happen: first trim, then uppercase.

### How It Works

```lux
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

```lux
result = data
  |> filter(fn(x) x > 0)
  |> map(fn(x) x * 2)
  |> sort()
  |> take(5)
```

Compare this to the nested equivalent:

```lux
// Nested calls -- reads inside-out
result = take(sort(map(filter(data, fn(x) x > 0), fn(x) x * 2)), 5)
```

The piped version is far more readable because each step is on its own line and reads in execution order.

### Real-World Examples

Processing a list of users:

```lux
active_emails = users
  |> filter(fn(u) u.active)
  |> map(fn(u) u.email)
  |> sort()
  |> join(", ")
```

Text processing pipeline:

```lux
cleaned = raw_input
  |> trim()
  |> lower()
  |> replace("  ", " ")
  |> split(" ")
  |> filter(fn(w) len(w) > 0)
  |> join(" ")
```

Numerical computation:

```lux
average = scores
  |> filter(fn(s) s > 0)
  |> map(fn(s) s / max_score * 100)
  |> sum()
  |> fn(total) total / len(scores)
```

## Placeholder `_`

Sometimes you need to pass the piped value as something other than the first argument. Use `_` as a placeholder to specify exactly where it goes:

```lux
10 |> add(5, _)
// equivalent to: add(5, 10)
```

```lux
items |> join(_, ", ")
// equivalent to: join(items, ", ")
```

### Placeholder Examples

```lux
name = "world"
  |> replace(_, "o", "0")
  |> "Hello, {_}!"
```

```lux
// Insert the piped value at a specific position
result = 42
  |> format("The answer is: {}", _)
```

```lux
// Useful when the function takes the "data" argument second
config |> merge(defaults, _)
// equivalent to: merge(defaults, config)
```

## Method Pipe

The method pipe syntax `.method()` lets you call methods in a pipe chain. The piped value becomes the receiver:

```lux
result = "  Hello, World!  "
  |> .trim()
  |> .lower()
  |> .replace("world", "lux")
// "hello, lux!"
```

This is equivalent to:

```lux
result = "  Hello, World!  ".trim().lower().replace("world", "lux")
```

The method pipe gives you consistent left-to-right reading even when mixing function calls and method calls:

```lux
text = raw_input
  |> .trim()
  |> split(_, ",")
  |> map(fn(s) s.trim())
  |> filter(fn(s) len(s) > 0)
  |> .join("; ")
```

## Pipes with Lambda Functions

You can pipe into anonymous functions for inline transformations:

```lux
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

```lux
total_revenue = orders
  |> filter(fn(o) o.status == "completed")
  |> map(fn(o) o.total)
  |> reduce(fn(sum, t) sum + t, 0)
```

### Extract-Transform-Load

```lux
fn process_csv(raw_csv) {
  raw_csv
    |> trim()
    |> split("\n")
    |> map(fn(line) split(line, ","))
    |> filter(fn(row) len(row) == 3)
    |> map(fn(row) {
      name: row[0],
      age: parse_int(row[1]),
      email: row[2]
    })
}
```

### Validation Chain

```lux
fn validate_input(input) {
  input
    |> trim()
    |> fn(s) if len(s) == 0 { Err("Input is empty") } else { Ok(s) }
    |> .flatMap(fn(s) if len(s) > 100 { Err("Too long") } else { Ok(s) })
    |> .flatMap(fn(s) if s.contains("<") { Err("No HTML allowed") } else { Ok(s) })
}
```

## Practical Tips

**Use pipes for three or more steps.** For a single transformation, a direct function call is fine. Pipes pay off when you chain multiple operations.

**One operation per line.** Put each pipe step on its own line for readability:

```lux
// Good:
result = data
  |> filter(fn(x) x > 0)
  |> map(fn(x) x * 2)
  |> sum()

// Harder to read:
result = data |> filter(fn(x) x > 0) |> map(fn(x) x * 2) |> sum()
```

**Use `_` sparingly.** If you find yourself using `_` frequently, the functions may not be designed for piping. Consider wrapping them in helpers that take the "data" argument first.

**Method pipe for fluent APIs.** When working with objects that have method chains (like DOM elements or builders), `.method()` pipe keeps things consistent:

```lux
query = builder
  |> .select("name", "email")
  |> .from("users")
  |> .where("active = true")
  |> .orderBy("name")
  |> .limit(10)
```
