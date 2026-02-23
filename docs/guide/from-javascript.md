# Tova for JavaScript Developers

If you write JavaScript or TypeScript, Tova will feel familiar — it compiles to JavaScript after all. But Tova adds structure, safety, and ergonomics that JS/TS lack. This guide maps the JavaScript you know to Tova and highlights what Tova gives you on top.

## At a Glance

| Concept | JavaScript/TypeScript | Tova |
|---------|----------------------|------|
| Immutable binding | `const x = 5` | `x = 5` |
| Mutable binding | `let x = 5` | `var x = 5` |
| Function | `function f(x) {}` | `fn f(x) {}` |
| Arrow function | `(x) => x + 1` | `x => x + 1` or `fn(x) x + 1` |
| Template literal | `` `Hello, ${name}` `` | `"Hello, {name}"` |
| If/else | `if (cond) {} else if {}` | `if cond {} elif {}` |
| For-of | `for (const x of items) {}` | `for x in items {}` |
| Pattern matching | Switch (limited) | `match { pattern => expr }` |
| Null | `null` / `undefined` | `nil` |
| Boolean | `&&` / `\|\|` / `!` | `and` / `or` / `not` (or `&&`/`\|\|`/`!`) |
| Optional chaining | `obj?.prop` | `obj?.prop` |
| Spread | `...obj` | `...obj` |
| Destructuring | `const { a, b } = obj` | `let { a, b } = obj` |
| Type annotation | `x: number` (TS) | `x: Int` |
| Pipe | None (Stage 2 proposal) | `\|>` (built-in) |
| Server/client | Separate projects | Single `.tova` file |

## Variables

JavaScript has three binding keywords (`var`, `let`, `const`) with confusing scoping. Tova has two, and they mean what you expect.

::: code-group
```javascript [JavaScript]
const name = "Alice";   // immutable binding
let count = 0;          // mutable binding
var old = "avoid";      // function-scoped — avoid in modern JS
```

```tova [Tova]
name = "Alice"          // immutable — no keyword needed
var count = 0           // mutable — explicit opt-in
```
:::

::: tip
Tova's `var` is not JavaScript's `var`. It means "mutable variable" — equivalent to JS `let`. Plain assignment without a keyword is the immutable form — equivalent to JS `const`.
:::

### Destructuring

Tova uses `let` exclusively for destructuring — never for variable declarations.

::: code-group
```javascript [JavaScript]
const { name, age } = user;
const [first, ...rest] = items;
```

```tova [Tova]
let { name, age } = user
let [first, ...rest] = items
```
:::

### No Semicolons

Tova uses newlines as statement terminators. Semicolons are optional and rarely used:

```tova
x = 10
y = 20
z = x + y
```

## Functions

### Declaration

::: code-group
```javascript [JavaScript]
function add(a, b) {
  return a + b;
}
```

```tova [Tova]
fn add(a, b) {
  a + b    // implicit return — last expression is the return value
}
```
:::

Explicit `return` is only needed for early exits:

```tova
fn find_first_negative(numbers) {
  for n in numbers {
    if n < 0 {
      return n     // early exit
    }
  }
  nil
}
```

### Arrow Functions / Lambdas

::: code-group
```javascript [JavaScript]
const double = (x) => x * 2;
const add = (a, b) => a + b;
const process = (x) => {
  const y = x.trim();
  return validate(y);
};
```

```tova [Tova]
double = x => x * 2
add = (a, b) => a + b
process = fn(x) {
  y = x.trim()
  validate(y)
}
```
:::

Tova also has `fn(params) expr` for inline anonymous functions:

```tova
numbers.map(fn(x) x * 2)
numbers.filter(fn(x) x > 0)
```

### Default Parameters

Identical concept:

::: code-group
```javascript [JavaScript]
function greet(name, greeting = "Hello") {
  return `${greeting}, ${name}!`;
}
```

```tova [Tova]
fn greet(name, greeting = "Hello") {
  "{greeting}, {name}!"
}
```
:::

### Type Annotations

TypeScript-like but with different primitive names:

::: code-group
```typescript [TypeScript]
function divide(a: number, b: number): number {
  return a / b;
}
```

```tova [Tova]
fn divide(a: Float, b: Float) -> Float {
  a / b
}
```
:::

| TypeScript | Tova |
|-----------|------|
| `number` | `Int` or `Float` |
| `string` | `String` |
| `boolean` | `Bool` |
| `T[]` or `Array<T>` | `[T]` |
| `null \| undefined` | `nil` |
| `(a: T) => R` | `(T) -> R` |

## Strings

### Interpolation

JavaScript uses backticks and `${}`. Tova uses regular double quotes and `{}`:

::: code-group
```javascript [JavaScript]
const greeting = `Hello, ${name}!`;
const math = `1 + 2 = ${1 + 2}`;
```

```tova [Tova]
greeting = "Hello, {name}!"
math = "1 + 2 = {1 + 2}"
```
:::

Single-quoted strings have no interpolation (useful for regex, templates):

```tova
raw = 'no {interpolation} here'
```

### String Concatenation

JavaScript uses `+`. Tova also uses `+` for concatenation, but string interpolation is preferred:

::: code-group
```javascript [JavaScript]
const full = first + " " + last;
```

```tova [Tova]
full = "{first} {last}"
// or with + operator:
full = first + " " + last
```
:::

### String Multiplication

Tova has this, JavaScript does not:

```tova
separator = "-" * 40     // "----------------------------------------"
indent = " " * 4         // "    "
```

## Control Flow

### If / Elif / Else

No parentheses around conditions. `elif` instead of `else if`:

::: code-group
```javascript [JavaScript]
if (score >= 90) {
  grade = "A";
} else if (score >= 80) {
  grade = "B";
} else {
  grade = "F";
}
```

```tova [Tova]
if score >= 90 {
  grade = "A"
} elif score >= 80 {
  grade = "B"
} else {
  grade = "F"
}
```
:::

`if` is an expression in Tova — it returns a value:

```tova
status = if age >= 18 { "adult" } else { "minor" }
```

### For Loops

Tova's `for...in` replaces JavaScript's `for...of` and `forEach`:

::: code-group
```javascript [JavaScript]
for (const name of names) {
  console.log(name);
}

names.forEach((name, i) => {
  console.log(`${i}: ${name}`);
});
```

```tova [Tova]
for name in names {
  print(name)
}

for i, name in names {
  print("{i}: {name}")
}
```
:::

Tova also has `range()` — no more `for (let i = 0; i < n; i++)`:

```tova
for i in range(10) {
  print(i)
}
```

### Boolean Operators

Tova supports both Python-style and JS-style:

```tova
// Preferred in Tova:
if x > 0 and y > 0 { ... }
if not found { ... }
if a or b { ... }

// Also valid:
if x > 0 && y > 0 { ... }
if !found { ... }
if a || b { ... }
```

## Pattern Matching

JavaScript's `switch` is verbose and error-prone (fallthrough). Tova's `match` is an expression, supports destructuring, and has exhaustive checking:

::: code-group
```javascript [JavaScript]
switch (status) {
  case 200:
    return "OK";
  case 404:
    return "Not Found";
  case 500:
    return "Server Error";
  default:
    return "Unknown";
}
```

```tova [Tova]
match status {
  200 => "OK"
  404 => "Not Found"
  500 => "Server Error"
  _ => "Unknown"
}
```
:::

### Destructuring in Match

```tova
type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
}

fn area(shape) {
  match shape {
    Circle(r) => 3.14 * r * r
    Rectangle(w, h) => w * h
  }
}
```

### Guards

```tova
match temperature {
  t if t < 0 => "freezing"
  t if t < 20 => "cold"
  t => "warm ({t} degrees)"
}
```

### Range Patterns

```tova
match score {
  90..=100 => "A"
  80..90 => "B"
  _ => "Below B"
}
```

### String Patterns

```tova
match url {
  "/api" ++ rest => handle_api(rest)
  "/admin" ++ _ => handle_admin()
  _ => not_found()
}
```

## Pipe Operator

This is the feature JavaScript developers wish they had (it's been a TC39 proposal for years). Tova has it built in:

::: code-group
```javascript [JavaScript]
// Nested calls — reads inside-out
const result = take(sort(filter(map(data, x => x * 2), x => x > 0)), 5);

// Or with chaining (only works with array methods)
const result = data
  .map(x => x * 2)
  .filter(x => x > 0)
  .sort()
  .slice(0, 5);
```

```tova [Tova]
// Pipe chain — works with ANY function
result = data
  |> map(fn(x) x * 2)
  |> filter(fn(x) x > 0)
  |> sorted()
  |> take(5)
```
:::

Pipes work with any function, not just array methods:

```tova
cleaned = raw_input
  |> trim()
  |> lower()
  |> replace("  ", " ")
  |> split(" ")
  |> filter(fn(w) len(w) > 0)
  |> join(" ")
```

## Collections

### List Comprehensions

JavaScript has no equivalent. You would use `.map()` and `.filter()`:

::: code-group
```javascript [JavaScript]
const squares = Array.from({length: 10}, (_, i) => i * i);
const evens = numbers.filter(x => x % 2 === 0);
```

```tova [Tova]
squares = [x * x for x in range(10)]
evens = [x for x in numbers if x % 2 == 0]
```
:::

### Slicing

JavaScript uses `.slice()`. Tova uses Python-style bracket slicing:

::: code-group
```javascript [JavaScript]
items.slice(2, 5);     // [2, 3, 4]
items.slice(0, 3);     // first 3
items.slice(-3);       // last 3
```

```tova [Tova]
items[2:5]     // [2, 3, 4]
items[:3]      // first 3
items[-3:]     // last 3
items[::2]     // every other element
items[::-1]    // reversed
```
:::

### Membership Testing

::: code-group
```javascript [JavaScript]
if (fruits.includes("apple")) { ... }
if (key in obj) { ... }
```

```tova [Tova]
if "apple" in fruits { ... }
if key in obj { ... }
```
:::

## Error Handling

JavaScript uses exceptions (`throw`/`try`/`catch`). Tova uses `Result` and `Option` types — errors are values you must handle, not invisible control flow.

::: code-group
```javascript [JavaScript]
function divide(a, b) {
  if (b === 0) throw new Error("Division by zero");
  return a / b;
}

try {
  const result = divide(10, 0);
} catch (e) {
  console.error(e.message);
}
```

```tova [Tova]
fn divide(a: Float, b: Float) -> Result<Float, String> {
  if b == 0 {
    Err("Division by zero")
  } else {
    Ok(a / b)
  }
}

match divide(10.0, 0.0) {
  Ok(value) => print("Result: {value}")
  Err(error) => print("Error: {error}")
}
```
:::

### Error Propagation

The `?` operator is like a built-in early return for errors:

```tova
fn process(input: String) -> Result<Data, String> {
  parsed = parse(input)?            // returns Err early if it fails
  validated = validate(parsed)?
  Ok(transform(validated))
}
```

### Interop with JS Exceptions

When calling JavaScript APIs that throw, use `try`/`catch` to bridge into the Result world:

```tova
fn parse_json(input: String) -> Result<Object, String> {
  try {
    Ok(JSON.parse(input))
  } catch err {
    Err("Invalid JSON: {err.message}")
  }
}
```

## Types

### Struct-like Types

::: code-group
```typescript [TypeScript]
interface User {
  id: number;
  name: string;
  email: string;
}
```

```tova [Tova]
type User {
  id: Int
  name: String
  email: String
} derive [Eq, Show, JSON]
```
:::

The `derive` macro auto-generates equality, display, and JSON serialization.

### Algebraic Data Types (ADTs)

TypeScript uses discriminated unions with boilerplate. Tova has native ADTs:

::: code-group
```typescript [TypeScript]
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rectangle"; width: number; height: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "rectangle":
      return shape.width * shape.height;
  }
}
```

```tova [Tova]
type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
}

fn area(shape: Shape) -> Float {
  match shape {
    Circle(r) => 3.14 * r * r
    Rectangle(w, h) => w * h
  }
}
```
:::

### Generics

::: code-group
```typescript [TypeScript]
interface Box<T> {
  value: T;
}

type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

```tova [Tova]
type Box<T> {
  value: T
}

type Result<T, E> {
  Ok(value: T)
  Err(error: E)
}
```
:::

### Interfaces and Traits

::: code-group
```typescript [TypeScript]
interface Printable {
  toString(): string;
}

class User implements Printable {
  toString() { return `${this.name} <${this.email}>`; }
}
```

```tova [Tova]
interface Printable {
  fn to_string() -> String
}

impl Printable for User {
  fn to_string() {
    "{self.name} <{self.email}>"
  }
}
```
:::

## The Full-Stack Model

This is what makes Tova fundamentally different from JavaScript. Instead of separate frontend and backend projects, a single `.tova` file contains everything:

```tova
shared {
  // Types and validation — used by BOTH server and client
  type Todo {
    id: Int
    title: String
    done: Bool
  }
}

server {
  // Runs on Bun — HTTP server, database, business logic
  db { path: "./todos.db" }
  model TodoModel {}

  fn get_todos() -> [Todo] {
    TodoModel.all()
  }

  fn add_todo(title: String) -> Todo {
    TodoModel.create({ title, done: false })
  }

  route GET "/api/todos" => get_todos
  route POST "/api/todos" => add_todo
}

client {
  // Runs in the browser — reactive UI with JSX
  state todos: [Todo] = []
  state new_title = ""

  effect {
    todos = server.get_todos()    // automatic RPC — no fetch() needed
  }

  component App {
    <div>
      <h1>Todo List</h1>
      <input bind:value={new_title} placeholder="New todo..." />
      <button on:click={fn() {
        server.add_todo(new_title)
        new_title = ""
      }}>Add</button>
      <ul>
        for todo in todos {
          <li>{todo.title}</li>
        }
      </ul>
    </div>
  }
}
```

### How It Works

1. The compiler splits the file into `server.js`, `client.js`, and `shared.js`
2. Server functions get auto-generated RPC endpoints (`POST /rpc/get_todos`)
3. `server.get_todos()` in client code becomes a `fetch()` call under the hood
4. Types in `shared` are available to both sides — one source of truth
5. The client uses a fine-grained reactive system (signals, effects, computed values)

### Reactive Primitives

Instead of React's `useState`/`useEffect`, Tova has:

::: code-group
```jsx [React]
function Counter() {
  const [count, setCount] = useState(0);
  const doubled = useMemo(() => count * 2, [count]);

  useEffect(() => {
    console.log(`Count is ${count}`);
  }, [count]);

  return (
    <div>
      <p>{count} (doubled: {doubled})</p>
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  );
}
```

```tova [Tova]
component Counter {
  state count = 0
  computed doubled = count * 2

  effect {
    print("Count is {count}")
  }

  <div>
    <p>{count} (doubled: {doubled})</p>
    <button on:click={fn() count += 1}>+</button>
  </div>
}
```
:::

Key differences:
- **No dependency arrays.** Tova's reactive system auto-tracks dependencies.
- **No hooks rules.** `state`, `computed`, and `effect` are declarations, not function calls with ordering constraints.
- **Direct mutation syntax.** `count += 1` instead of `setCount(c => c + 1)`.

### JSX Differences

Tova's JSX uses Tova control flow instead of JavaScript expressions:

::: code-group
```jsx [React JSX]
{isVisible && <div>Content</div>}
{items.map(item => <li key={item.id}>{item.name}</li>)}
{condition ? <A /> : <B />}
```

```tova [Tova JSX]
if isVisible {
  <div>Content</div>
}

for item in items key={item.id} {
  <li>{item.name}</li>
}

if condition {
  <A />
} else {
  <B />
}
```
:::

### Event Handling

::: code-group
```jsx [React]
<button onClick={() => setCount(c => c + 1)}>Click</button>
<input value={name} onChange={e => setName(e.target.value)} />
```

```tova [Tova]
<button on:click={fn() count += 1}>Click</button>
<input bind:value={name} />
```
:::

The `bind:value` directive creates two-way binding — no manual `onChange` handler needed.

## Module System

### Imports

::: code-group
```javascript [JavaScript]
import { readFile } from "fs";
import express from "express";
import { helper } from "./utils.js";
```

```tova [Tova]
import { read_file } from "fs"
import express from "express"
import { helper } from "./utils.tova"
```
:::

### Standard Library Namespaces

Instead of importing from many packages, Tova provides namespaced stdlib modules:

```tova
math.sin(x)
math.floor(x)
str.upper("hello")
json.parse(data)
re.test(pattern, text)
dt.now()
```

## Quick Reference: Key Differences

| Topic | JavaScript | Tova |
|-------|-----------|------|
| Semicolons | Required (ASI is fragile) | Optional (newlines work) |
| Equality | `===` (strict) | `==` (always strict) |
| Inequality | `!==` | `!=` |
| Null values | `null` + `undefined` | `nil` (one concept) |
| String delimiters | `` ` `` for interpolation, `"` / `'` for plain | `"` for interpolation, `'` for plain |
| Block scoping | `let` / `const` | Lexical by default |
| `this` | Context-dependent, confusing | `self` in `impl` blocks only |
| Class vs type | `class User {}` | `type User {}` |
| Constructor | `new Date()` | `Date.new()` |
| Array check | `Array.isArray(x)` | `x is Array` |
| Truthiness | Complex rules (`0`, `""`, `null`, `undefined`) | Only `false` and `nil` are falsy |
| Iteration | `for...of`, `.forEach()`, `for...in` | `for x in items {}` (one form) |
| Comments | `//` and `/* */` | `//` and `/* */` (same) |
| Package manager | `npm` / `yarn` / `pnpm` | `bun` (Bun-native) |
| Runtime | Node.js / Browser | Bun (server) / Browser (client) |
| Test runner | Jest / Vitest / etc. | `tova test` (built-in, uses Bun test) |
| Formatter | Prettier | `tova fmt` |
| LSP | TypeScript language server | Tova language server |
