---
title: Hello World
description: Write and run your first Tova program.
---

<script setup>
const helloCode = `name = "World"
print("Hello, {name}!")

fn add(a, b) {
  a + b
}

result = add(1, 2)
print("1 + 2 = {result}")`

const fizzbuzzCode = `fn fizzbuzz(n) {
  for i in range(1, n + 1) {
    match [i % 3, i % 5] {
      [0, 0] => print("FizzBuzz")
      [0, _] => print("Fizz")
      [_, 0] => print("Buzz")
      _      => print("{i}")
    }
  }
}

fizzbuzz(20)`
</script>

# Hello World

This page walks you through writing, running, and understanding your first Tova program.

## Your First Program

Create a file called `hello.tova`:

```tova
name = "World"
print("Hello, {name}!")
```

Run it:

```bash
tova run hello.tova
```

Output:

```
Hello, World!
```

That is all it takes. Let us break down what happened.

## What Just Happened

**Immutable by default.** The line `name = "World"` creates an immutable binding. Once assigned, `name` cannot be reassigned. If you need a mutable variable, use `var`:

```tova
var count = 0
count += 1       // OK -- count is mutable
```

**String interpolation.** Curly braces inside a string evaluate expressions inline. Any valid expression works:

```tova
print("2 + 3 = {2 + 3}")       // 2 + 3 = 5
print("upper: {to_upper(name)}")  // upper: WORLD
```

**Implicit returns.** The last expression in a block is its return value. No `return` keyword is needed (though you can use one for early returns).

## Adding a Function

Extend `hello.tova` with a function:

```tova
name = "World"
print("Hello, {name}!")

fn add(a, b) {
  a + b
}

result = add(1, 2)
print("1 + 2 = {result}")
```

Run it again:

```bash
tova run hello.tova
```

Output:

```
Hello, World!
1 + 2 = 3
```

Functions are declared with `fn`. The body is a block delimited by curly braces, and the last expression is returned implicitly. There are no semicolons in Tova.

<TryInPlayground :code="helloCode" label="Hello World" />

## Lambdas

Anonymous functions use the same `fn` keyword without a name:

```tova
double = fn(x) x * 2

print("double 5 = {double(5)}")   // double 5 = 10
```

For multi-line lambdas, use braces:

```tova
transform = fn(x) {
  y = x * 2
  y + 1
}
```

## Using the REPL

For quick experimentation, start the interactive REPL:

```bash
tova repl
```

You will see a prompt where you can type Tova expressions and see results immediately:

```
tova> 1 + 2
3
tova> name = "Tova"
"Tova"
tova> print("Hello from {name}!")
Hello from Tova!
tova> fn square(x) { x * x }
tova> square(7)
49
```

The REPL supports multi-line input and has the full standard library available. Type `:help` to see available commands, or `:quit` to exit.

## A Slightly Bigger Example

Here is a program that puts several features together:

```tova
fn fizzbuzz(n) {
  for i in range(1, n + 1) {
    match [i % 3, i % 5] {
      [0, 0] => print("FizzBuzz")
      [0, _] => print("Fizz")
      [_, 0] => print("Buzz")
      _      => print("{i}")
    }
  }
}

fizzbuzz(20)
```

This shows `for` loops, `range`, pattern matching on arrays, and wildcard patterns -- all concepts covered in the [Tour of Tova](/getting-started/tour).

<TryInPlayground :code="fizzbuzzCode" label="FizzBuzz" />

## Next Steps

- [Tour of Tova](/getting-started/tour) -- a fast-paced walkthrough of every major language feature
- [Variables](/guide/variables) -- deep dive into immutability, mutability, and destructuring
- [Functions](/guide/functions) -- default parameters, rest parameters, and more
