---
title: REPL
---

# REPL

The Lux REPL (Read-Eval-Print Loop) provides an interactive environment for experimenting with Lux code, testing expressions, and exploring the standard library.

## Starting the REPL

```bash
lux repl
```

You will see:

```
  Lux REPL v0.1.0
  Type expressions to evaluate. Use :quit to exit.

lux>
```

## Evaluating Expressions

Type any Lux expression and press Enter to see the result:

```
lux> 1 + 2
3

lux> "Hello" ++ " " ++ "World"
Hello World

lux> [1, 2, 3] |> map(fn(x) x * 2)
[2, 4, 6]
```

## Variable Binding

Define variables that persist across evaluations in the current session:

```
lux> name = "Lux"
Lux

lux> greeting = "Hello, {name}!"
Hello, Lux!
```

## Function Definitions

Define and call functions:

```
lux> fn double(x) { x * 2 }

lux> double(21)
42

lux> fn factorial(n) {
...    match n {
...      0 => 1
...      n => n * factorial(n - 1)
...    }
...  }

lux> factorial(10)
3628800
```

## Multi-Line Input

The REPL automatically detects incomplete expressions by tracking open braces, brackets, and parentheses. When a line ends with an unclosed delimiter, the prompt changes to `...` and waits for more input:

```
lux> fn greet(name) {
...    message = "Hello, {name}!"
...    print(message)
...  }

lux> greet("World")
Hello, World!
```

## Standard Library

The full Lux standard library is available in the REPL, including all built-in functions and `Result`/`Option` types:

```
lux> range(1, 6)
[1, 2, 3, 4, 5]

lux> [3, 1, 4, 1, 5] |> sorted()
[1, 1, 3, 4, 5]

lux> sum(range(1, 101))
5050

lux> Ok(42) |> map(fn(x) x * 2)
Ok(84)

lux> Some("hello") |> unwrap_or("default")
hello

lux> type_of([1, 2, 3])
Array
```

## REPL Commands

| Command | Description |
|---------|-------------|
| `:quit` or `:q` | Exit the REPL |
| `:exit` | Exit the REPL (alias) |
| `:help` | Show available commands |
| `:clear` | Reset the REPL context, clearing all defined variables and functions |

## Tips

- **Quick experiments**: Use the REPL to test pattern matching, pipe chains, or standard library functions before adding them to your source files.
- **Exploring types**: Use `type_of(value)` to inspect the runtime type of any value.
- **Error handling**: Test `Result` and `Option` chains interactively to verify your error handling logic.
- **No imports needed**: The standard library is pre-loaded, so you can use `map`, `filter`, `sorted`, `Ok`, `Err`, `Some`, `None`, and all other built-ins immediately.
