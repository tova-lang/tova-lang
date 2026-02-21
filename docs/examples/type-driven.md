# Type-Driven Design

This example explores Tova's type system in depth: refinement types, algebraic data types, generics, exhaustive pattern matching, and Result/Option chaining. It builds a complete form validation system that combines all these features into a cohesive design.

## The Full Application

```tova
// --- Refinement Types ---

type Email = String where {
  it |> contains("@"),
  it |> len() > 4,
  it |> contains(".")
}

type PositiveInt = Int where { it > 0 }

type Percentage = Float where { it >= 0.0, it <= 100.0 }

type NonEmpty = String where { it |> len() > 0 }

type Port = Int where { it >= 1, it <= 65535 }

// --- Algebraic Data Types ---

type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
  Triangle(a: Float, b: Float, c: Float)
}

fn area(shape: Shape) -> Float {
  match shape {
    Circle(r) => 3.14159 * r * r
    Rectangle(w, h) => w * h
    Triangle(a, b, c) => {
      s = (a + b + c) / 2.0
      Math.sqrt(s * (s - a) * (s - b) * (s - c))
    }
  }
}

fn describe_shape(shape: Shape) -> String {
  match shape {
    Circle(r) if r > 100.0 => "Large circle"
    Circle(_) => "Circle"
    Rectangle(w, h) if w == h => "Square ({w}x{h})"
    Rectangle(w, h) => "Rectangle ({w}x{h})"
    Triangle(a, b, c) if a == b and b == c => "Equilateral triangle"
    Triangle(a, b, _) if a == b => "Isosceles triangle"
    Triangle(_, _, _) => "Scalene triangle"
  }
}

type PaymentMethod {
  CreditCard(number: String, expiry: String, cvv: String)
  BankTransfer(account: String, routing: String)
  Wallet(provider: String, token: String)
  Cash
}

type OrderStatus {
  Pending
  Confirmed(confirmed_at: String)
  Shipped(tracking: String, carrier: String)
  Delivered(delivered_at: String)
  Cancelled(reason: String)
  Refunded(amount: Float, refunded_at: String)
}

fn next_status(status: OrderStatus) -> [OrderStatus] {
  match status {
    Pending => [Confirmed(Date.now()), Cancelled("")]
    Confirmed(_) => [Shipped("", ""), Cancelled("")]
    Shipped(_, _) => [Delivered(Date.now()), Cancelled("")]
    Delivered(_) => [Refunded(0.0, Date.now())]
    Cancelled(_) => []
    Refunded(_, _) => []
  }
}

// --- Generics ---

type Stack<T> {
  items: [T]
}

fn Stack.new() {
  Stack { items: [] }
}

fn Stack.push(self, item) {
  Stack { items: [...self.items, item] }
}

fn Stack.pop(self) {
  count = self.items |> len()
  match count {
    0 => (None, self)
    _ => {
      last = self.items |> at(count - 1)
      rest = self.items |> slice(0, count - 1)
      new_stack = Stack { items: rest }
      (Some(last), new_stack)
    }
  }
}

fn Stack.peek(self) {
  count = self.items |> len()
  match count {
    0 => None
    _ => Some(self.items |> at(count - 1))
  }
}

fn Stack.size(self) -> Int {
  self.items |> len()
}

type Validated<T> = Result<T, [String]>

fn validate_all(value, checks) {
  errors = checks
    |> map(fn(check) check(value))
    |> filter(fn(opt) opt |> is_some())
    |> map(fn(opt) opt |> unwrap())

  match errors {
    [] => Ok(value)
    errs => Err(errs)
  }
}

// --- Exhaustive Pattern Matching ---

type Expr {
  Num(Int)
  Add(Expr, Expr)
  Mul(Expr, Expr)
  Neg(Expr)
}

fn eval(expr: Expr) -> Int {
  match expr {
    Num(n) => n
    Add(a, b) => eval(a) + eval(b)
    Mul(a, b) => eval(a) * eval(b)
    Neg(e) => -eval(e)
  }
}

fn categorize_score(score: Int) -> String {
  match score {
    0 => "Zero"
    1..=49 => "Failing"
    50..=69 => "Passing"
    70..=89 => "Good"
    90..=100 => "Excellent"
    n if n < 0 => "Invalid (negative)"
    _ => "Invalid (out of range)"
  }
}

fn parse_command(input: String) -> Result<String, String> {
  match input |> trim() |> split(" ") {
    ["quit"] => Ok("Goodbye!")
    ["exit"] => Ok("Goodbye!")
    ["help"] => Ok("Available: quit, help, greet <name>, add <a> <b>")
    ["greet", name] => Ok("Hello, {name}!")
    ["greet", first, last] => Ok("Hello, {first} {last}!")
    ["add", a, b] => Ok("{a |> parse_int() + b |> parse_int()}")
    [cmd, _] => Err("Unknown command: {cmd}")
    [cmd, _, _] => Err("Unknown command: {cmd}")
    [cmd, _, _, _] => Err("Unknown command: {cmd}")
    [] => Err("Empty input")
  }
}

fn describe_list(items: [String]) -> String {
  match items {
    [] => "No items"
    [only] => "Just: {only}"
    [first, second] => "{first} and {second}"
    _ => {
      first = items |> at(0)
      remaining = (items |> len()) - 1
      "{first} and {remaining} more"
    }
  }
}

// --- Result/Option Chaining ---

type User {
  name: String
  email: Email
  age: Int
}

type UserProfile {
  user: User
  display_name: String
  tier: String
}

fn find_user(id: Int) -> Option<User> {
  // Simulated lookup
  match id {
    1 => {
      user = User { name: "Alice", email: "alice@example.com", age: 30 }
      Some(user)
    }
    2 => {
      user = User { name: "Bob", email: "bob@example.com", age: 25 }
      Some(user)
    }
    _ => None
  }
}

fn build_profile(user: User) -> Result<UserProfile, String> {
  guard user.age >= 18 else {
    return Err("User must be 18 or older")
  }

  tier = match user.age {
    18..=25 => "junior"
    26..=40 => "standard"
    _ => "senior"
  }

  profile = UserProfile {
    user: user,
    display_name: user.name |> upper(),
    tier: tier
  }
  Ok(profile)
}

fn get_user_profile(id: Int) -> Result<UserProfile, String> {
  find_user(id)
    |> ok_or("User not found")
    |> flatMap(fn(user) build_profile(user))
}

fn get_user_display(id: Int) -> String {
  find_user(id)
    |> map(fn(user) user.name)
    |> unwrapOr("Unknown User")
}

// Result chaining with ? propagation
fn process_order(user_id: Int, amount: Float) -> Result<String, String> {
  user = find_user(user_id) |> ok_or("User not found")!
  profile = build_profile(user)!

  guard amount > 0.0 else {
    return Err("Amount must be positive")
  }

  Ok("Order placed for {profile.display_name}: ${amount}")
}

// --- Complete Form Validation System ---

type FormData {
  name: String
  email: String
  age: String
  password: String
  confirm_password: String
}

type ValidForm {
  name: NonEmpty
  email: Email
  age: PositiveInt
  password: String
}

type FieldError {
  field: String
  message: String
}

fn validate_name(name: String) -> Result<NonEmpty, FieldError> {
  guard name |> trim() |> len() > 0 else {
    err = FieldError { field: "name", message: "Name is required" }
    return Err(err)
  }
  Ok(name |> trim())
}

fn validate_email(email: String) -> Result<Email, FieldError> {
  guard email |> contains("@") else {
    err = FieldError { field: "email", message: "Invalid email address" }
    return Err(err)
  }
  guard email |> contains(".") else {
    err = FieldError { field: "email", message: "Email must have a domain" }
    return Err(err)
  }
  Ok(email |> trim() |> lower())
}

fn validate_age(age_str: String) -> Result<PositiveInt, FieldError> {
  parse_err = FieldError { field: "age", message: "Age must be a number" }
  age = age_str |> parse_int() |> ok_or(parse_err)!
  guard age > 0 else {
    err = FieldError { field: "age", message: "Age must be positive" }
    return Err(err)
  }
  guard age < 150 else {
    err = FieldError { field: "age", message: "Age seems invalid" }
    return Err(err)
  }
  Ok(age)
}

fn validate_password(password: String, confirm: String) -> Result<String, FieldError> {
  guard password |> len() >= 8 else {
    err = FieldError { field: "password", message: "Password must be at least 8 characters" }
    return Err(err)
  }
  guard password == confirm else {
    err = FieldError { field: "confirm_password", message: "Passwords do not match" }
    return Err(err)
  }
  Ok(password)
}

fn validate_form(form: FormData) -> Result<ValidForm, [FieldError]> {
  name_result = validate_name(form.name)
  email_result = validate_email(form.email)
  age_result = validate_age(form.age)
  password_result = validate_password(form.password, form.confirm_password)

  errors = [name_result, email_result, age_result, password_result]
    |> filter(fn(r) r |> is_err())
    |> map(fn(r) match r { Err(e) => e, _ => unreachable() })

  match errors {
    [] => {
      valid = ValidForm {
        name: name_result |> unwrap(),
        email: email_result |> unwrap(),
        age: age_result |> unwrap(),
        password: password_result |> unwrap()
      }
      Ok(valid)
    }
    errs => Err(errs)
  }
}

fn main(args: [String]) {
  // Demo: shapes
  shapes = [Circle(5.0), Rectangle(3.0, 4.0), Triangle(3.0, 4.0, 5.0)]
  shapes |> each(fn(s) {
    print("{describe_shape(s)}: area = {area(s)}")
  })

  // Demo: stack
  stack = Stack.new()
    |> Stack.push(1)
    |> Stack.push(2)
    |> Stack.push(3)
  print("Stack size: {stack |> Stack.size()}")

  // Demo: validation
  form = FormData {
    name: "Alice",
    email: "alice@example.com",
    age: "30",
    password: "secure123",
    confirm_password: "secure123"
  }

  match validate_form(form) {
    Ok(valid) => print("Valid: {valid.name} ({valid.email})")
    Err(errors) => errors |> each(fn(e) print("  {e.field}: {e.message}"))
  }

  // Demo: Result chaining
  match process_order(1, 49.99) {
    Ok(msg) => print(msg)
    Err(e) => print("Failed: {e}")
  }
}
```

## Running It

```bash
tova run types.tova
```

## What This Demonstrates

### Refinement Types

Refinement types add constraints to base types:

```tova
type Email = String where {
  it |> contains("@"),
  it |> len() > 4,
  it |> contains(".")
}
```

The `where` clause lists constraints that must all hold. `it` refers to the value being checked. Refinement types are checked at construction time and enforced by the compiler where possible.

### Rich ADTs

Algebraic data types model states with data:

```tova
type OrderStatus {
  Pending
  Confirmed(confirmed_at: String)
  Shipped(tracking: String, carrier: String)
  Delivered(delivered_at: String)
  Cancelled(reason: String)
  Refunded(amount: Float, refunded_at: String)
}
```

Each variant can carry different data. The `next_status` function uses pattern matching to define the valid state transitions — making illegal states unrepresentable.

### Generics

Generic types use angle-bracket syntax:

```tova
type Stack<T> {
  items: [T]
}

fn Stack.push(self, item) {
  Stack { items: [...self.items, item] }
}
```

The `validate_all` function accepts any value type, applying a list of check functions and collecting errors.

### Exhaustive Pattern Matching

The compiler ensures every variant is handled. Patterns include:

- **Variant destructuring:** `Circle(r) =>` binds the radius
- **Guards:** `Circle(r) if r > 100.0 =>` adds conditions
- **Range patterns:** `1..=49 =>` matches inclusive ranges
- **Array patterns:** `[first, second] =>` destructures lists by length
- **Multiple arms for alternatives:** `["quit"] =>` and `["exit"] =>` as separate arms
- **Nested patterns:** `Neg(Num(n)) =>` matches nested structures

### Result/Option Chaining

```tova
fn get_user_profile(id: Int) -> Result<UserProfile, String> {
  find_user(id)
    |> ok_or("User not found")
    |> flatMap(fn(user) build_profile(user))
}
```

- `ok_or()` converts `Option` to `Result` by providing an error value
- `map()` transforms the success value
- `flatMap()` chains operations that themselves return Result/Option
- `unwrapOr()` provides a default for None/Err
- `!` propagates errors — if the expression is Err or None, the function returns early

### Form Validation System

The complete system ties everything together:

1. **Refinement types** define what valid data looks like (`Email`, `NonEmpty`, `PositiveInt`)
2. **ADTs** structure error information (`FieldError` with field name and message)
3. **Result chaining** validates each field independently
4. **Error aggregation** collects all errors instead of failing on the first one
5. **Guard clauses** keep validation functions flat and readable

## Key Patterns

**Make illegal states unrepresentable.** `OrderStatus` encodes valid transitions. `PaymentMethod` ensures each variant carries exactly the data it needs.

**Refinement types for domain constraints.** Instead of validating everywhere, define the constraint once at the type level.

**Collect all errors.** The `validate_form` function runs all validations and collects errors into a list, rather than short-circuiting on the first failure.

**`!` for linear chains, `match` for branching.** Use `!` propagation when you want to bail on the first error. Use explicit `match` when you need to handle errors differently.
