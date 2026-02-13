# Variables

Lux takes a clear stance on mutability: variables are **immutable by default**. If you want a variable that can change, you opt in explicitly with `var`. This makes your code easier to reason about and helps prevent accidental mutations.

## Immutable Variables

A plain assignment creates an immutable binding. Once set, it cannot be reassigned:

```lux
name = "Alice"
age = 30
pi = 3.14159
```

Attempting to reassign an immutable variable produces a compile-time error:

```lux
name = "Alice"
name = "Bob"    // Error: cannot reassign immutable variable 'name'
```

## Mutable Variables

Use `var` when you need a variable that can change over time:

```lux
var count = 0
count += 1        // OK
count = count + 5 // OK

var name = "Alice"
name = "Bob"      // OK — var allows reassignment
```

Mutable variables support all compound assignment operators:

```lux
var x = 10
x += 5    // x is now 15
x -= 3    // x is now 12
x *= 2    // x is now 24
x /= 4    // x is now 6
x %= 5    // x is now 1
```

## Multiple Assignment

Lux supports assigning multiple variables in a single statement:

```lux
a, b = 1, 2
x, y, z = "hello", true, 42
```

This is particularly handy for swapping values without a temporary variable:

```lux
var a = 1
var b = 2
a, b = b, a   // a is now 2, b is now 1
```

## Destructuring with `let`

The `let` keyword is used specifically for destructuring -- pulling values out of objects and arrays into individual variables.

::: tip
In Lux, `let` is **only** for destructuring. It is **not** used for variable declaration like in JavaScript. Use plain `x = 10` for immutable bindings or `var x = 10` for mutable ones.
:::

### Object Destructuring

Extract fields from an object by name:

```lux
person = { name: "Alice", age: 30, email: "alice@example.com" }

let { name, age } = person
print(name)   // "Alice"
print(age)    // 30
```

You can rename the bindings:

```lux
let { name: userName, age: userAge } = person
print(userName)   // "Alice"
print(userAge)    // 30
```

### Array Destructuring

Pull elements out of arrays by position:

```lux
coords = [10, 20, 30]

let [x, y, z] = coords
print(x)   // 10
print(y)   // 20
```

### Rest Patterns

Use the spread operator `...` to capture remaining elements:

```lux
items = [1, 2, 3, 4, 5]

let [first, ...rest] = items
print(first)   // 1
print(rest)    // [2, 3, 4, 5]

let [head, second, ...tail] = items
print(head)    // 1
print(second)  // 2
print(tail)    // [3, 4, 5]
```

### Nested Destructuring

Destructuring can go multiple levels deep:

```lux
data = {
  user: { name: "Alice", scores: [95, 87, 92] }
}

let { user: { name, scores: [first_score, ...other_scores] } } = data
print(name)          // "Alice"
print(first_score)   // 95
print(other_scores)  // [87, 92]
```

## Type Annotations

You can optionally annotate variables with types. Lux uses the `: Type` syntax after the variable name:

```lux
x: Int = 42
name: String = "Alice"
is_active: Bool = true
scores: [Int] = [90, 85, 92]
```

Type annotations serve as documentation and enable better tooling support. Lux's type checker will warn you if the assigned value does not match the declared type.

```lux
var count: Int = 0
count += 1     // OK — still an Int

pi: Float = 3.14159
ratio: Float = 22.0 / 7.0
```

## Practical Tips

**Prefer immutable by default.** Only reach for `var` when the value genuinely needs to change -- loop counters, accumulators, state that evolves over time. Immutable bindings make code easier to follow and less prone to bugs.

**Use destructuring to keep code clean.** Instead of accessing `response.data.user.name` repeatedly, destructure it once:

```lux
let { data: { user: { name, email } } } = response
// Now use 'name' and 'email' directly
```

**Multiple assignment shines for swaps and coordinate work:**

```lux
// Swap without a temp variable
var left = "hello"
var right = "world"
left, right = right, left

// Return multiple values from a function
fn min_max(items) {
  min_val = items |> min()
  max_val = items |> max()
  min_val, max_val
}

lo, hi = min_max([3, 1, 4, 1, 5, 9])
```
