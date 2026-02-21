<script setup>
const functionsCode = `fn add(a, b) {
  a + b
}

fn greet(name, greeting = "Hello") {
  "{greeting}, {name}!"
}

print(add(3, 4))
print(greet("Alice"))
print(greet("Bob", "Hey"))`

const lambdasCode = `double = fn(x) x * 2

numbers = [1, 2, 3, 4, 5]
doubled = numbers.map(fn(x) x * 2)
evens = numbers.filter(fn(x) x % 2 == 0)

print("doubled: {doubled}")
print("evens: {evens}")`

const recursionCode = `fn factorial(n) {
  if n <= 1 {
    1
  } else {
    n * factorial(n - 1)
  }
}

fn fibonacci(n) {
  match n {
    0 => 0
    1 => 1
    n => fibonacci(n - 1) + fibonacci(n - 2)
  }
}

print("5! = {factorial(5)}")
print("fib(10) = {fibonacci(10)}")`
</script>

# Functions

Functions are the primary building blocks in Tova. They are declared with the `fn` keyword and feature implicit returns, optional type annotations, and flexible parameter styles.

## Basic Functions

Declare a function with `fn`, a name, parameters in parentheses, and a body in curly braces:

```tova
fn greet(name) {
  print("Hello, {name}!")
}

greet("Alice")   // Hello, Alice!
```

## Implicit Returns

The last expression in a function body is automatically returned. No `return` keyword needed:

```tova
fn add(a, b) {
  a + b
}

result = add(3, 4)   // 7
```

```tova
fn full_name(first, last) {
  "{first} {last}"
}

name = full_name("Alice", "Smith")   // "Alice Smith"
```

For single-expression functions, this keeps things concise:

```tova
fn double(x) {
  x * 2
}

fn is_even(n) {
  n % 2 == 0
}
```

## Explicit Return

Use `return` when you need to exit a function early:

```tova
fn find_first_negative(numbers) {
  for n in numbers {
    if n < 0 {
      return n
    }
  }
  nil
}
```

```tova
fn validate_age(age) {
  if age < 0 {
    return Err("Age cannot be negative")
  }
  if age > 150 {
    return Err("Age seems unrealistic")
  }
  Ok(age)
}
```

## Default Parameters

Parameters can have default values. When a caller omits them, the defaults are used:

```tova
fn greet(name, greeting = "Hello") {
  "{greeting}, {name}!"
}

greet("Alice")            // "Hello, Alice!"
greet("Alice", "Hey")     // "Hey, Alice!"
```

```tova
fn create_user(name, role = "member", active = true) {
  { name: name, role: role, active: active }
}

create_user("Alice")                     // { name: "Alice", role: "member", active: true }
create_user("Bob", "admin")              // { name: "Bob", role: "admin", active: true }
create_user("Carol", "editor", false)    // { name: "Carol", role: "editor", active: false }
```

<TryInPlayground :code="functionsCode" label="Functions & Defaults" />

## Type Annotations

Add type annotations to parameters and return types for documentation and type checking:

```tova
fn add(a: Int, b: Int) -> Int {
  a + b
}

fn greet(name: String) -> String {
  "Hello, {name}!"
}

fn is_adult(age: Int) -> Bool {
  age >= 18
}
```

The return type annotation uses `->` after the parameter list:

```tova
fn divide(a: Float, b: Float) -> Result<Float, String> {
  if b == 0 {
    Err("Division by zero")
  } else {
    Ok(a / b)
  }
}
```

## Lambdas (Anonymous Functions)

Tova has two styles for anonymous functions.

### `fn` Lambdas

Use `fn(params) body` for inline anonymous functions:

```tova
double = fn(x) x * 2
add = fn(a, b) a + b

numbers = [1, 2, 3, 4, 5]
doubled = numbers.map(fn(x) x * 2)              // [2, 4, 6, 8, 10]
evens = numbers.filter(fn(x) x % 2 == 0)        // [2, 4]
sum = numbers.reduce(fn(acc, x) acc + x, 0)     // 15
```

For multi-line lambda bodies, use curly braces:

```tova
process = fn(item) {
  cleaned = item.trim()
  validated = validate(cleaned)
  validated
}
```

<TryInPlayground :code="lambdasCode" label="Lambdas" />

### Arrow Syntax

Tova also supports JavaScript-style arrow syntax for lambdas. Both forms are valid Tova; `fn(x) expr` is the idiomatic style, while `x => expr` is a shorter alternative:

```tova
double = x => x * 2
add = (a, b) => a + b

names = ["alice", "bob", "carol"]
upper_names = names.map(x => x.upper())
```

## Named Arguments

Named arguments are passed as a single object, so the function should use **object destructuring** to receive them:

```tova
fn create_server({ host, port, debug }) {
  print("Starting {host}:{port} debug={debug}")
}

create_server(host: "localhost", port: 8080, debug: true)
```

You can also mix positional and named arguments. The named arguments are grouped into a trailing object:

```tova
fn connect(url, { timeout, retries }) {
  print("Connecting to {url} timeout={timeout} retries={retries}")
}

connect("https://api.example.com", timeout: 5000, retries: 3)
```

## Destructuring Parameters

Functions can destructure objects and arrays directly in the parameter list.

### Object Destructuring

```tova
fn greet_user({ name, age }) {
  "Hello, {name}! You are {age} years old."
}

user = { name: "Alice", age: 30, email: "alice@example.com" }
greet_user(user)   // "Hello, Alice! You are 30 years old."
```

```tova
fn format_address({ street, city, state, zip }) {
  "{street}\n{city}, {state} {zip}"
}
```

### Array Destructuring

```tova
fn distance([x1, y1], [x2, y2]) {
  dx = x2 - x1
  dy = y2 - y1
  Math.sqrt(dx * dx + dy * dy)
}

distance([0, 0], [3, 4])   // 5.0
```

## Async Functions

Prefix a function with `async` to make it asynchronous. Use `await` inside to wait for promises:

```tova
async fn fetch_user(id) {
  response = await fetch("/api/users/{id}")
  data = await response.json()
  data
}

async fn fetch_all_users() {
  users = await fetch_user(1)
  print("Got {len(users)} users")
}
```

See the [Async guide](async.md) for more details.

## Functions as Values

Functions are first-class values in Tova. You can assign them to variables, pass them as arguments, and return them from other functions:

```tova
fn apply_twice(f, x) {
  f(f(x))
}

apply_twice(fn(x) x + 1, 5)    // 7
apply_twice(fn(x) x * 2, 3)    // 12
```

```tova
fn make_multiplier(factor) {
  fn(x) x * factor
}

triple = make_multiplier(3)
triple(5)    // 15
triple(10)   // 30
```

## Recursive Functions

Functions can call themselves. Tova supports standard recursion:

```tova
fn factorial(n) {
  if n <= 1 {
    1
  } else {
    n * factorial(n - 1)
  }
}

factorial(5)   // 120
```

```tova
fn fibonacci(n) {
  match n {
    0 => 0
    1 => 1
    n => fibonacci(n - 1) + fibonacci(n - 2)
  }
}
```

<TryInPlayground :code="recursionCode" label="Recursion" />

## Practical Tips

**Keep functions short and focused.** A function that does one thing well is easier to test, reuse, and understand.

**Lean on implicit returns.** Avoid writing `return` at the end of a function -- just let the last expression be the result. Reserve explicit `return` for early exits.

**Use destructuring parameters** when a function operates on a specific shape of data. It makes the function signature self-documenting:

```tova
// Instead of:
fn send_email(user) {
  to = user.email
  name = user.name
  // ...
}

// Prefer:
fn send_email({ email, name }) {
  // email and name are available directly
}
```
