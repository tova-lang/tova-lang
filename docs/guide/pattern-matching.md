# Pattern Matching

Pattern matching is one of Lux's most powerful features. The `match` expression lets you compare a value against multiple patterns and execute the corresponding branch. The compiler also performs exhaustive checking, warning you if you miss any cases.

## Basic Match

A `match` expression compares a value against patterns using `=>`:

```lux
fn describe(x) {
  match x {
    0 => "zero"
    1 => "one"
    2 => "two"
    _ => "something else"
  }
}
```

The `_` wildcard matches anything and is typically used as the final catch-all pattern.

## Literal Patterns

Match against numbers, strings, and booleans:

```lux
match status_code {
  200 => "OK"
  404 => "Not Found"
  500 => "Internal Server Error"
  _ => "Unknown status"
}
```

```lux
match command {
  "start" => start_server()
  "stop" => stop_server()
  "restart" => restart_server()
  _ => print("Unknown command: {command}")
}
```

```lux
match is_enabled {
  true => "Feature is on"
  false => "Feature is off"
}
```

## Range Patterns

Match against ranges of values. Use `..` for exclusive end and `..=` for inclusive end:

```lux
fn classify_age(age) {
  match age {
    0..13 => "child"        // 0 to 12 (exclusive of 13)
    13..=19 => "teenager"   // 13 to 19 (inclusive of 19)
    20..=64 => "adult"
    _ => "senior"
  }
}
```

```lux
fn grade_letter(score) {
  match score {
    90..=100 => "A"
    80..90 => "B"
    70..80 => "C"
    60..70 => "D"
    _ => "F"
  }
}
```

## Binding Patterns

Bind the matched value to a name for use in the result expression:

```lux
match value {
  0 => "nothing"
  n => "got: {n}"
}
```

Combine bindings with guards for more specific matching:

```lux
match temperature {
  t if t < 0 => "freezing ({t} degrees)"
  t if t < 20 => "cold ({t} degrees)"
  t if t < 30 => "comfortable ({t} degrees)"
  t => "hot ({t} degrees)"
}
```

## Variant Patterns

Match against type variants (ADTs / enums). This is where pattern matching truly shines:

```lux
type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
  Triangle(base: Float, height: Float)
}

fn area(shape) {
  match shape {
    Circle(r) => 3.14159 * r * r
    Rectangle(w, h) => w * h
    Triangle(b, h) => 0.5 * b * h
  }
}
```

```lux
type Color {
  Red
  Green
  Blue
  Custom(r: Int, g: Int, b: Int)
}

fn to_hex(color) {
  match color {
    Red => "#FF0000"
    Green => "#00FF00"
    Blue => "#0000FF"
    Custom(r, g, b) => "rgb({r}, {g}, {b})"
  }
}
```

## Array Patterns

Destructure arrays inside match arms:

```lux
fn describe_list(items) {
  match items {
    [] => "empty"
    [x] => "single item: {x}"
    [x, y] => "pair: {x} and {y}"
    [x, y, ...rest] => "starts with {x}, {y} and {len(rest)} more"
  }
}
```

```lux
fn head(list) {
  match list {
    [] => None
    [first, ..._] => Some(first)
  }
}
```

## Wildcard Pattern

The `_` pattern matches any value without binding it to a name:

```lux
match result {
  Ok(value) => print("Success: {value}")
  Err(_) => print("Something went wrong")    // we don't need the error details
}
```

You can use `_` in nested positions too:

```lux
match point {
  (0, _) => "on the Y axis"
  (_, 0) => "on the X axis"
  (x, y) => "at ({x}, {y})"
}
```

## Guards

Add `if` conditions to patterns for finer control:

```lux
fn classify(n) {
  match n {
    n if n < 0 => "negative"
    0 => "zero"
    n if n % 2 == 0 => "positive even"
    n => "positive odd"
  }
}
```

```lux
fn process_user(user) {
  match user {
    { role: "admin" } => grant_full_access()
    { age: a } if a >= 18 => grant_standard_access()
    _ => deny_access()
  }
}
```

## String Concat Patterns

Match and destructure strings using the `++` operator. This lets you check prefixes and extract the rest:

```lux
fn parse_route(url) {
  match url {
    "/api" ++ rest => handle_api(rest)
    "/admin" ++ rest => handle_admin(rest)
    "/static" ++ rest => serve_static(rest)
    "/" => home_page()
    _ => not_found()
  }
}
```

```lux
fn parse_protocol(url) {
  match url {
    "https://" ++ domain => { protocol: "https", domain: domain }
    "http://" ++ domain => { protocol: "http", domain: domain }
    _ => { protocol: "unknown", domain: url }
  }
}
```

## Match as Expression

`match` returns a value, so you can assign its result directly:

```lux
greeting = match time_of_day {
  "morning" => "Good morning!"
  "afternoon" => "Good afternoon!"
  "evening" => "Good evening!"
  _ => "Hello!"
}
```

```lux
fn to_string(color) {
  match color {
    Red => "red"
    Green => "green"
    Blue => "blue"
  }
}
```

## Exhaustive Checking

The Lux compiler performs exhaustive checking on match expressions. If you miss a variant, you will get a warning:

```lux
type Direction { North, South, East, West }

fn describe(dir) {
  match dir {
    North => "up"
    South => "down"
    // Warning: non-exhaustive match — missing variants: East, West
  }
}
```

This works for Result and Option types too:

```lux
fn handle(result) {
  match result {
    Ok(v) => print(v)
    // Warning: non-exhaustive match — missing variant: Err
  }
}
```

Exhaustive checking helps you handle every case and prevents runtime surprises when a new variant is added to a type.

## Practical Tips

**Always handle every variant.** The exhaustive checking is there to help you. If you genuinely want to ignore some cases, use a `_` catch-all at the end.

**Use string concat patterns for routing.** Parsing URL paths with `"/prefix" ++ rest` is a clean, readable pattern that avoids manual string slicing.

**Prefer match over chains of if/elif.** When you are comparing a value against multiple possibilities, `match` is more readable and the compiler can check it for completeness:

```lux
// Instead of:
if status == "active" {
  // ...
} elif status == "pending" {
  // ...
} elif status == "inactive" {
  // ...
}

// Prefer:
match status {
  "active" => // ...
  "pending" => // ...
  "inactive" => // ...
}
```

**Combine patterns with guards for complex logic:**

```lux
fn shipping_cost(order) {
  match order {
    { total: t } if t > 100 => 0           // free shipping over $100
    { weight: w } if w > 50 => 25          // heavy items
    { destination: "international" } => 15  // international
    _ => 5                                  // standard
  }
}
```
