---
title: Hello World
---

<script setup>
const helloCode = `print("Hello, World!")

name = "Tova"
version = 1
print("Welcome to {name}!")
print("{name} version {version} is ready.")`

const functionsCode = `fn greet(name) {
  "Hello, {name}!"
}

print(greet("World"))
print(greet("Tova"))`

const fizzbuzzCode = `fn fizzbuzz(n) {
  match [n % 3, n % 5] {
    [0, 0] => "FizzBuzz"
    [0, _] => "Fizz"
    [_, 0] => "Buzz"
    _      => "{n}"
  }
}

for n in range(1, 21) {
  print(fizzbuzz(n))
}`

const collectionsCode = `numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

evens = numbers |> filter(fn(n) n % 2 == 0)
doubled = evens |> map(fn(n) n * 2)
total = doubled |> sum()

print("Evens: {evens}")
print("Doubled: {doubled}")
print("Sum: {total}")`
</script>

# Hello World

The simplest Tova program is a single `print` call.

## Basic Output

Create a file called `hello.tova`:

```tova
print("Hello, World!")
```

Run it:

```bash
tova run hello.tova
```

Output:

```
Hello, World!
```

## String Interpolation

Tova supports string interpolation with curly braces inside double-quoted strings:

```tova
name = "Tova"
version = 1

print("Welcome to {name}!")
print("{name} version {version} is ready.")
```

Output:

```
Welcome to Tova!
Tova version 1 is ready.
```

<TryInPlayground :code="helloCode" label="Hello World" />

## Defining Functions

Use `fn` to define functions. The last expression in a function body is the return value:

```tova
fn greet(name) {
  "Hello, {name}!"
}

print(greet("World"))
print(greet("Tova"))
```

Output:

```
Hello, World!
Hello, Tova!
```

<TryInPlayground :code="functionsCode" label="Functions" />

## Functions with Logic

Combine functions with `match` expressions and the pipe operator:

```tova
fn fizzbuzz(n) {
  match [n % 3, n % 5] {
    [0, 0] => "FizzBuzz"
    [0, _] => "Fizz"
    [_, 0] => "Buzz"
    _      => "{n}"
  }
}

range(1, 21) |> each(fn(n) {
  print(fizzbuzz(n))
})
```

<TryInPlayground :code="fizzbuzzCode" label="FizzBuzz" />

## Working with Collections

Tova has a rich standard library for working with lists:

```tova
numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

// Filter and transform
evens = numbers |> filter(fn(n) n % 2 == 0)
doubled = evens |> map(fn(n) n * 2)
total = doubled |> sum()

print("Evens: {evens}")
print("Doubled: {doubled}")
print("Sum: {total}")
```

Output:

```
Evens: [2, 4, 6, 8, 10]
Doubled: [4, 8, 12, 16, 20]
Sum: 60
```

<TryInPlayground :code="collectionsCode" label="Collections" />

## Error Handling with Result

Tova uses `Result` types instead of exceptions:

```tova
fn parse_age(input) {
  n = parseInt(input)
  match n {
    n if n > 0 => Ok(n)
    _ => Err("Invalid age: {input}")
  }
}

match parse_age("25") {
  Ok(age) => print("Age is {age}")
  Err(msg) => print("Error: {msg}")
}

match parse_age("-3") {
  Ok(age) => print("Age is {age}")
  Err(msg) => print("Error: {msg}")
}
```

Output:

```
Age is 25
Error: Invalid age: -3
```

## What's Next

- Build a [reactive counter](./counter.md) with client-side state
- Create a [full-stack todo app](./todo-app.md) with server and client
- Explore the [CLI reference](../tooling/cli.md) for all available commands
