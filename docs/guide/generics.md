# Generics

Generics let you write types and functions that work with any type, while still being type-safe. Instead of writing separate implementations for each type, you write one generic version that the compiler specializes as needed.

## Generic Types

Define a generic type by adding type parameters in angle brackets after the type name:

```lux
type Box<T> {
  value: T
}
```

Now `Box` can hold any type of value:

```lux
int_box = Box(42)
str_box = Box("hello")
bool_box = Box(true)
```

### Multiple Type Parameters

Types can have more than one type parameter:

```lux
type Pair<A, B> {
  first: A
  second: B
}

pair = Pair("Alice", 30)
print(pair.first)    // "Alice"
print(pair.second)   // 30
```

```lux
type Triple<A, B, C> {
  a: A
  b: B
  c: C
}

t = Triple(1, "hello", true)
```

## Generic ADTs

Generics combine naturally with algebraic data types. In fact, two of Lux's most important built-in types are generic ADTs:

### Option

The `Option` type represents a value that may or may not exist:

```lux
type Option<T> {
  Some(value: T)
  None
}
```

```lux
fn find_by_name(users, name) -> Option<User> {
  for user in users {
    if user.name == name {
      return Some(user)
    }
  }
  None
}

match find_by_name(users, "Alice") {
  Some(user) => print("Found: {user.email}")
  None => print("Not found")
}
```

### Result

The `Result` type represents an operation that can succeed or fail:

```lux
type Result<T, E> {
  Ok(value: T)
  Err(error: E)
}
```

```lux
fn parse_int(s: String) -> Result<Int, String> {
  // ...
  if valid {
    Ok(parsed)
  } else {
    Err("Invalid integer: {s}")
  }
}

match parse_int("42") {
  Ok(n) => print("Parsed: {n}")
  Err(e) => print("Error: {e}")
}
```

## Generic Data Structures

Generics are ideal for building reusable data structures:

### Stack

```lux
type Stack<T> {
  items: [T]
}

fn empty_stack() -> Stack {
  Stack([])
}

fn push(stack, item) {
  Stack([...stack.items, item])
}

fn pop(stack) -> Option<(T, Stack<T>)> {
  match stack.items {
    [] => None
    items => {
      last = items[len(items) - 1]
      rest = items[0:len(items) - 1]
      Some((last, Stack(rest)))
    }
  }
}
```

### Tree

```lux
type Tree<T> {
  Leaf(value: T)
  Branch(left: Tree<T>, right: Tree<T>)
}

fn tree_map(tree, f) {
  match tree {
    Leaf(v) => Leaf(f(v))
    Branch(left, right) => Branch(tree_map(left, f), tree_map(right, f))
  }
}

numbers = Branch(
  Branch(Leaf(1), Leaf(2)),
  Leaf(3)
)
doubled = tree_map(numbers, fn(x) x * 2)
```

### Linked List

```lux
type List<T> {
  Cons(head: T, tail: List<T>)
  Nil
}

fn list_map(list, f) {
  match list {
    Nil => Nil
    Cons(head, tail) => Cons(f(head), list_map(tail, f))
  }
}

fn list_length(list) {
  match list {
    Nil => 0
    Cons(_, tail) => 1 + list_length(tail)
  }
}

my_list = Cons(1, Cons(2, Cons(3, Nil)))
print(list_length(my_list))    // 3
```

## Combining Generics and Pattern Matching

One of the strongest aspects of Lux's generics is how naturally they work with pattern matching:

```lux
type Response<T> {
  Success(data: T, status: Int)
  Failure(error: String, status: Int)
  Loading
}

fn handle_response(response) {
  match response {
    Success(data, 200) => print("OK: {data}")
    Success(data, status) => print("Success ({status}): {data}")
    Failure(err, 404) => print("Not found: {err}")
    Failure(err, status) => print("Error {status}: {err}")
    Loading => print("Loading...")
  }
}
```

## Practical Tips

**Use generics for container types.** Any time you build a type that "wraps" or "contains" another value, make it generic so it works with any inner type.

**Start concrete, then generalize.** If you find yourself writing the same type structure for different inner types, that is a good signal to refactor into a generic:

```lux
// You might start with:
type IntResult {
  IntOk(value: Int)
  IntErr(error: String)
}

type StringResult {
  StringOk(value: String)
  StringErr(error: String)
}

// Then generalize to:
type Result<T, E> {
  Ok(value: T)
  Err(error: E)
}
```

**Lean on Option and Result.** These two generic types cover the vast majority of "maybe" and "might fail" situations. Reach for them before inventing your own wrappers.
