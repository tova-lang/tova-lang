---
title: REPL
---

# REPL

The Tova REPL (Read-Eval-Print Loop) provides an interactive environment for experimenting with Tova code, testing expressions, and exploring the standard library.

## Starting the REPL

```bash
tova repl
```

You will see:

```
  Tova REPL v0.1.0
  Type expressions to evaluate. Use :quit to exit.

tova>
```

## Evaluating Expressions

Type any Tova expression and press Enter to see the result:

```
tova> 1 + 2
3

tova> "Hello" ++ " " ++ "World"
Hello World

tova> [1, 2, 3] |> map(fn(x) x * 2)
[2, 4, 6]
```

## Variable Binding

Define variables that persist across evaluations in the current session:

```
tova> name = "Tova"
Tova

tova> greeting = "Hello, {name}!"
Hello, Tova!
```

## Function Definitions

Define and call functions:

```
tova> fn double(x) { x * 2 }

tova> double(21)
42

tova> fn factorial(n) {
...    match n {
...      0 => 1
...      n => n * factorial(n - 1)
...    }
...  }

tova> factorial(10)
3628800
```

## Multi-Line Input

The REPL automatically detects incomplete expressions by tracking open braces, brackets, and parentheses. When a line ends with an unclosed delimiter, the prompt changes to `...` and waits for more input:

```
tova> fn greet(name) {
...    message = "Hello, {name}!"
...    print(message)
...  }

tova> greet("World")
Hello, World!
```

## Standard Library

The full Tova standard library is available in the REPL, including all built-in functions and `Result`/`Option` types:

```
tova> range(1, 6)
[1, 2, 3, 4, 5]

tova> [3, 1, 4, 1, 5] |> sorted()
[1, 1, 3, 4, 5]

tova> sum(range(1, 101))
5050

tova> Ok(42) |> map(fn(x) x * 2)
Ok(84)

tova> Some("hello") |> unwrap_or("default")
hello

tova> type_of([1, 2, 3])
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
