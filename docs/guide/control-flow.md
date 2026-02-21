# Control Flow

Tova provides familiar control flow constructs with a few important differences from languages you may know. The biggest one: Tova uses `elif`, **not** `else if`.

## If / Elif / Else

Basic conditional branching:

```tova
if temperature > 30 {
  print("It's hot!")
}
```

With an else branch:

```tova
if age >= 18 {
  print("Adult")
} else {
  print("Minor")
}
```

For multiple conditions, use `elif` (not `else if`):

```tova
if score >= 90 {
  grade = "A"
} elif score >= 80 {
  grade = "B"
} elif score >= 70 {
  grade = "C"
} elif score >= 60 {
  grade = "D"
} else {
  grade = "F"
}
```

::: warning
Tova uses `elif`, **never** `else if`. Writing `else if` will produce a syntax error.
:::

### If as Expression

`if` blocks are expressions in Tova -- they return a value. This lets you use them on the right side of an assignment:

```tova
status = if age >= 18 { "adult" } else { "minor" }

message = if count == 0 {
  "No items"
} elif count == 1 {
  "One item"
} else {
  "{count} items"
}
```

## For Loops

### Iterating Over Collections

The `for...in` loop iterates over arrays, strings, and other iterables:

```tova
names = ["Alice", "Bob", "Carol"]
for name in names {
  print("Hello, {name}!")
}
```

### With Index

Use the two-variable form to get both the index and the value:

```tova
fruits = ["apple", "banana", "cherry"]
for i, fruit in fruits {
  print("{i}: {fruit}")
}
// 0: apple
// 1: banana
// 2: cherry
```

### Over Ranges

Use `range()` to iterate over a sequence of numbers:

```tova
for i in range(5) {
  print(i)        // 0, 1, 2, 3, 4
}

for i in range(1, 6) {
  print(i)        // 1, 2, 3, 4, 5
}

for i in range(0, 10, 2) {
  print(i)        // 0, 2, 4, 6, 8
}
```

### For-Else

The `else` clause on a `for` loop runs if the loop completes without hitting a `break`:

```tova
for item in items {
  if item.is_special() {
    print("Found special item!")
    break
  }
} else {
  print("No special item found")
}
```

This is a clean alternative to using a flag variable.

## While Loops

Repeat while a condition is true:

```tova
var count = 0
while count < 5 {
  print(count)
  count += 1
}
```

```tova
var input = ""
while input != "quit" {
  input = read_line("Enter command: ")
  process(input)
}
```

## Break and Continue

Use `break` to exit a loop early and `continue` to skip to the next iteration:

```tova
// break: stop at the first negative number
for n in numbers {
  if n < 0 {
    break
  }
  print(n)
}
```

```tova
// continue: skip even numbers
for n in range(10) {
  if n % 2 == 0 {
    continue
  }
  print(n)   // 1, 3, 5, 7, 9
}
```

The analyzer validates that `break` and `continue` only appear inside loops. Using them outside a loop produces a compile-time error.

### Labeled Loops

When working with nested loops, you can label a loop and reference it from `break` or `continue`:

```tova
outer: for row in rows {
  for col in row {
    if col == target {
      break outer   // breaks out of the outer loop
    }
  }
}
```

```tova
outer: for i in range(10) {
  for j in range(10) {
    if j == 5 {
      continue outer  // skips to the next iteration of the outer loop
    }
    print("{i}, {j}")
  }
}
```

Labels work with `for`, `while`, and `loop`:

```tova
search: while has_more() {
  items = fetch_next_batch()
  for item in items {
    if item.matches(query) {
      result = item
      break search
    }
  }
}
```

## Guard Clauses

The `guard` statement checks a condition and exits the current scope if it fails. It is a great way to handle preconditions without deep nesting:

```tova
fn process_order(order) {
  guard order != nil else {
    return Err("Order is nil")
  }

  guard order.items.length > 0 else {
    return Err("Order has no items")
  }

  guard order.total > 0 else {
    return Err("Order total must be positive")
  }

  // Happy path -- all guards passed
  submit(order)
}
```

Compare this to the nested-if alternative:

```tova
// Without guard -- deep nesting
fn process_order(order) {
  if order != nil {
    if order.items.length > 0 {
      if order.total > 0 {
        submit(order)
      } else {
        Err("Order total must be positive")
      }
    } else {
      Err("Order has no items")
    }
  } else {
    Err("Order is nil")
  }
}
```

Guard clauses keep the "happy path" at the top level and handle errors early.

## Defer

`defer` schedules a block to run when the current scope exits, regardless of how it exits (normal completion, return, or error). This is useful for cleanup:

```tova
fn read_file(path) {
  file = open(path)
  defer { close(file) }

  // Work with the file...
  content = file.read()
  process(content)
  // close(file) runs automatically when this function returns
}
```

Multiple `defer` blocks execute in reverse order (last-in, first-out):

```tova
fn setup() {
  db = connect_db()
  defer { db.close() }

  cache = init_cache()
  defer { cache.flush() }

  // When this function returns:
  // 1. cache.flush() runs first
  // 2. db.close() runs second
}
```

## Try / Catch / Finally

For interoperating with JavaScript code that throws exceptions, Tova provides `try`/`catch`/`finally`:

```tova
try {
  data = JSON.parse(raw_input)
  process(data)
} catch err {
  print("Failed to parse JSON: {err.message}")
}
```

With a `finally` block for cleanup that always runs:

```tova
try {
  result = risky_operation()
} catch err {
  log_error(err)
  result = default_value
} finally {
  cleanup()
}
```

::: tip
For pure Tova code, prefer `Result` and `Option` types over try/catch. The try/catch mechanism exists primarily for calling JavaScript APIs that may throw. See the [Error Handling guide](error-handling.md) for more.
:::

## Practical Tips

**Use `elif` consistently.** If you are coming from JavaScript or Python, you might reach for `else if`. Train your fingers to type `elif` instead -- Tova will not accept `else if`.

**Prefer guard clauses over nested ifs.** When a function has multiple preconditions, a chain of `guard` statements produces flatter, more readable code than deeply nested conditionals.

**Use for-else for search loops.** When iterating to find something and you need to know if the search failed, the `else` clause on `for` is cleaner than a separate flag:

```tova
fn find_admin(users) {
  for user in users {
    if user.role == "admin" {
      return user
    }
  } else {
    return nil
  }
}
```

**Remember defer for paired operations.** Whenever you open/close, lock/unlock, or start/stop something, `defer` ensures the cleanup happens even if an error occurs in between.
