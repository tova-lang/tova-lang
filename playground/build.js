#!/usr/bin/env bun
// Tova Playground Build Script — Enhanced Edition
// Reads compiler sources, strips ES module syntax, generates self-contained HTML

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';

const ROOT = resolve(dirname(import.meta.dir));

// ─── Source files in dependency order ────────────────────
const SOURCE_FILES = [
  'src/lexer/tokens.js',
  'src/lexer/lexer.js',
  'src/parser/client-ast.js',
  'src/parser/server-ast.js',
  'src/parser/ast.js',
  '__AST_SHIM__',
  'src/parser/server-parser.js',
  'src/parser/client-parser.js',
  'src/parser/parser.js',
  'src/analyzer/scope.js',
  'src/analyzer/types.js',
  'src/analyzer/server-analyzer.js',
  'src/analyzer/client-analyzer.js',
  'src/analyzer/analyzer.js',
  'src/stdlib/inline.js',
  'src/codegen/wasm-codegen.js',
  'src/codegen/base-codegen.js',
  'src/codegen/shared-codegen.js',
  'src/codegen/server-codegen.js',
  'src/codegen/client-codegen.js',
  'src/codegen/codegen.js',
];

// ─── Strip ES module syntax ─────────────────────────────
function stripModuleSyntax(code) {
  return code
    // Single-line imports: import ... from '...'
    .replace(/^\s*import\s+.*from\s+['"].*['"];?\s*$/gm, '')
    // Multi-line imports: import {\n  ...\n} from '...'
    .replace(/^\s*import\s*\{[^}]*\}\s*from\s*['"][^'"]*['"];?\s*$/gm, '')
    // Side-effect imports: import '...'
    .replace(/^\s*import\s+['"].*['"];?\s*$/gm, '')
    // Multi-line export { ... } from '...' and export { ... }
    .replace(/^\s*export\s*\{[\s\S]*?\}(?:\s*from\s*['"][^'"]*['"])?\s*;?\s*$/gm, '')
    .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '')
    .replace(/^\s*export\s*\*\s*from\s+['"].*['"];?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, '')
    .replace(/^\s*export\s+(class|function|const|let|var)\s/gm, '$1 ')
    .trim();
}

// ─── Read and process all source files ──────────────────
function buildCompilerBundle() {
  const parts = [];
  parts.push(`(function() {`);

  for (const entry of SOURCE_FILES) {
    if (entry === '__AST_SHIM__') {
      // Collect class names from all AST files (core + client + server)
      const classNames = [];
      for (const astFile of ['src/parser/ast.js', 'src/parser/client-ast.js', 'src/parser/server-ast.js']) {
        const astCode = readFileSync(resolve(ROOT, astFile), 'utf-8');
        for (const m of astCode.matchAll(/^(?:export\s+)?class\s+(\w+)/gm)) {
          classNames.push(m[1]);
        }
      }
      parts.push(`// AST namespace shim for parser.js compatibility`);
      parts.push(`const AST = { ${classNames.join(', ')} };`);
      continue;
    }

    const filePath = resolve(ROOT, entry);
    const raw = readFileSync(filePath, 'utf-8');
    parts.push(`// ─── ${entry} ${'─'.repeat(Math.max(0, 50 - entry.length))}`);
    parts.push(stripModuleSyntax(raw));
  }

  parts.push(`window.Lexer = Lexer;`);
  parts.push(`window.Parser = Parser;`);
  parts.push(`window.Analyzer = Analyzer;`);
  parts.push(`window.CodeGenerator = CodeGenerator;`);
  parts.push(`})();`);

  return parts.join('\n\n');
}

function buildRuntimeBundle() {
  const reactivity = readFileSync(resolve(ROOT, 'src/runtime/reactivity.js'), 'utf-8');
  return stripModuleSyntax(reactivity);
}

function buildStringProto() {
  const sp = readFileSync(resolve(ROOT, 'src/runtime/string-proto.js'), 'utf-8');
  return stripModuleSyntax(sp);
}

function buildArrayProto() {
  const ap = readFileSync(resolve(ROOT, 'src/runtime/array-proto.js'), 'utf-8');
  return stripModuleSyntax(ap);
}

function getStdlib() {
  return `function print(...args) { console.log(...args); }
function len(v) { if (v == null) return 0; if (typeof v === 'string' || Array.isArray(v)) return v.length; if (typeof v === 'object') return Object.keys(v).length; return 0; }
function range(s, e, st) { if (e === undefined) { e = s; s = 0; } if (st === undefined) st = s < e ? 1 : -1; const r = []; if (st > 0) { for (let i = s; i < e; i += st) r.push(i); } else { for (let i = s; i > e; i += st) r.push(i); } return r; }
function enumerate(a) { return a.map((v, i) => [i, v]); }
function sum(a) { return a.reduce((x, y) => x + y, 0); }
function sorted(a, k) { const c = [...a]; if (k) c.sort((x, y) => { const kx = k(x), ky = k(y); return kx < ky ? -1 : kx > ky ? 1 : 0; }); else c.sort((x, y) => x < y ? -1 : x > y ? 1 : 0); return c; }
function reversed(a) { return [...a].reverse(); }
function zip(...as) { const m = Math.min(...as.map(a => a.length)); const r = []; for (let i = 0; i < m; i++) r.push(as.map(a => a[i])); return r; }
function min(a) { return Math.min(...a); }
function max(a) { return Math.max(...a); }
function type_of(v) { if (v === null) return 'Nil'; if (Array.isArray(v)) return 'List'; if (v?.__tag) return v.__tag; const t = typeof v; switch(t) { case 'number': return Number.isInteger(v) ? 'Int' : 'Float'; case 'string': return 'String'; case 'boolean': return 'Bool'; case 'function': return 'Function'; case 'object': return 'Object'; default: return 'Unknown'; } }
function filter(arr, fn) { return arr.filter(fn); }
function map(arr, fn) { return arr.map(fn); }
function flat_map(arr, fn) { return arr.flatMap(fn); }
function any(arr, fn) { return arr.some(fn); }
function all(arr, fn) { return arr.every(fn); }`;
}

// ─── Example programs (categorized) ─────────────────────
function getExamples() {
  const counter = readFileSync(resolve(ROOT, 'examples/counter.tova'), 'utf-8');
  const todo = readFileSync(resolve(ROOT, 'examples/todo-app.tova'), 'utf-8');

  return [
    // ── Getting Started ──
    { category: 'Getting Started', name: 'Hello World', code: `// Welcome to Tova! A modern language that transpiles to JavaScript.
// Click "Run" or press Cmd/Ctrl+Enter to execute.

name = "World"
greeting = "Hello, {name}!"
print(greeting)

// Tova uses string interpolation with {expressions}
x = 42
pi = 3.14159
print("x is {x} and pi is {pi}")

// Variables: immutable by default, use 'var' for mutable
language = "Tova"         // immutable
var version = 1          // mutable
version += 1
print("{language} v{version}")
` },
    { category: 'Getting Started', name: 'Variables & Types', code: `// Immutable bindings (default)
name = "Alice"
age = 30
pi = 3.14159
is_active = true
nothing = nil

// Mutable bindings
var counter = 0
counter += 1
counter += 1
print("counter = {counter}")

// Multiple assignment
a, b, c = 1, 2, 3
print("a={a}, b={b}, c={c}")

// Swap
var x = 10
var y = 20
x, y = y, x
print("After swap: x={x}, y={y}")

// Type checking
print(type_of(42))
print(type_of("hello"))
print(type_of(true))
print(type_of([1, 2, 3]))
print(type_of(nil))
` },
    { category: 'Getting Started', name: 'String Operations', code: `// String interpolation with expressions
name = "hello world"
print("Upper: {name.upper()}")
print("Capitalized: {name.capitalize()}")
print("Title: {name.title_case()}")

// String methods
sentence = "the quick brown fox jumps"
print("Words: {sentence.words()}")
print("Starts with 'the': {sentence.starts_with("the")}")
print("Contains 'brown': {sentence.contains("brown")}")

// Useful conversions
print("snake_case: {"helloWorld".snake_case()}")
print("camelCase: {"hello_world".camel_case()}")

// String multiply (repeat)
border = "-" * 30
print(border)
print("  Tova Language")
print(border)

// Characters and lines
text = "Tova"
print("Chars: {text.chars()}")
` },

    // ── Functions ──
    { category: 'Functions', name: 'Functions & Lambdas', code: `// Functions return the last expression (implicit return)
fn add(a, b) {
  a + b
}

// Default parameters
fn greet(name = "friend") {
  "Hey, {name}!"
}

print(add(1, 2))
print(greet())
print(greet("Alice"))

// Lambda / anonymous functions
double = fn(x) x * 2
square = fn(x) x * x
print("double(7) = {double(7)}")
print("square(5) = {square(5)}")

// Arrow syntax
add3 = fn(a, b, c) a + b + c
print("add3(1,2,3) = {add3(1, 2, 3)}")

// Functions are first-class
fn apply(f, x) { f(x) }
print("apply(double, 21) = {apply(double, 21)}")

// Explicit return
fn first_positive(items) {
  for item in items {
    if item > 0 { return item }
  }
  nil
}
print("First positive: {first_positive([-3, -1, 0, 4, 7])}")
` },
    { category: 'Functions', name: 'Higher-Order Functions', code: `// Map, filter, and reduce with lambdas
numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

doubled = map(numbers, fn(x) x * 2)
print("Doubled: {doubled}")

evens = filter(numbers, fn(x) x % 2 == 0)
print("Evens: {evens}")

total = sum(numbers)
print("Sum: {total}")

// Composition
fn compose(f, g) {
  fn(x) f(g(x))
}

double = fn(x) x * 2
add_one = fn(x) x + 1
double_then_add = compose(add_one, double)
print("double_then_add(5) = {double_then_add(5)}")

// Sorting with key function
fruit_names = ["banana", "apple", "cherry", "date"]
by_length = sorted(fruit_names, fn(w) len(w))
print("By length: {by_length}")

// Checking conditions
has_negative = any([-1, 2, 3], fn(x) x < 0)
all_positive = all([1, 2, 3], fn(x) x > 0)
print("Has negative: {has_negative}")
print("All positive: {all_positive}")
` },
    { category: 'Functions', name: 'Pipe Operator', code: `// The pipe operator |> chains function calls beautifully
numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

// Without pipe (nested, hard to read):
// sum(map(filter(numbers, fn(x) x % 2 == 0), fn(x) x * x))

// With pipe (reads top to bottom):
result = numbers
  |> filter(fn(x) x % 2 == 0)
  |> map(fn(x) x * x)
  |> sum()
print("Sum of squares of evens: {result}")

// Another example
names = ["Charlie", "Alice", "Bob", "Diana", "Eve"]
result2 = names
  |> filter(fn(n) len(n) > 3)
  |> sorted()
  |> reversed()
print("Long names (Z-A): {result2}")

// Simple pipeline
42 |> fn(x) x * 2 |> fn(x) "The answer is {x}" |> print()
` },

    // ── Data Structures ──
    { category: 'Data Structures', name: 'Lists & Comprehensions', code: `// List literals
fruits = ["apple", "banana", "cherry"]
print("Fruits: {fruits}")
print("Length: {len(fruits)}")

// List comprehension
squares = [x * x for x in range(1, 11)]
print("Squares: {squares}")

// With filter
evens = [x for x in range(1, 21) if x % 2 == 0]
print("Evens: {evens}")

// Build pairs with flat_map
pairs = flat_map(range(1, 4), fn(x) [[x, y] for y in range(1, 4) if x != y])
print("Pairs: {pairs}")

// Dict comprehension
square_map = {x: x * x for x in range(1, 6)}
print("Square map: {square_map}")

// Slice operations
nums = [10, 20, 30, 40, 50, 60, 70]
print("nums[1:4] = {nums[1:4]}")
print("nums[:3]  = {nums[:3]}")
print("nums[4:]  = {nums[4:]}")
print("nums[::-1] = {nums[::-1]}")
` },
    { category: 'Data Structures', name: 'Spread & Destructuring', code: `// Array spread
list_a = [1, 2, 3]
list_b = [4, 5, 6]
combined = [...list_a, ...list_b]
print("Combined: {combined}")

// Object literals
config = {
  color: "blue",
  size: "medium",
  bold: false,
  count: 42
}
print("Config: {config}")

// Destructuring objects
let {color, size, bold} = config
print("Color: {color}")
print("Size: {size}")

// Destructuring arrays
let [a, b, c] = [10, 20, 30]
print("a={a}, b={b}, c={c}")

// Membership testing
fruits = ["apple", "banana", "cherry"]
if "banana" in fruits {
  print("We have bananas!")
}
if "grape" not in fruits {
  print("No grapes available")
}
` },

    // ── Control Flow ──
    { category: 'Control Flow', name: 'If / Elif / Else', code: `// If expressions (they return values!)
fn grade(score) {
  if score >= 90 {
    "A"
  } elif score >= 80 {
    "B"
  } elif score >= 70 {
    "C"
  } elif score >= 60 {
    "D"
  } else {
    "F"
  }
}

for s in [95, 85, 72, 65, 45] {
  print("Score {s} = Grade {grade(s)}")
}

// Chained comparisons (Python-style!)
y = 5
if 1 < y < 10 {
  print("{y} is between 1 and 10")
}

age = 25
if 18 <= age < 65 {
  print("Working age")
}
` },
    { category: 'Control Flow', name: 'Loops', code: `// For loops with range
print("Counting:")
for i in range(1, 6) {
  print("  {i}")
}

// For-in with arrays
colors = ["red", "green", "blue"]
for color in colors {
  print("Color: {color}")
}

// Enumerate (get index + value)
for pair in enumerate(colors) {
  print("  {pair[0]}: {pair[1]}")
}

// While loops
var n = 1
while n < 100 {
  n = n * 2
}
print("First power of 2 >= 100: {n}")

// FizzBuzz
fn fizzbuzz(n) {
  if n % 15 == 0 { "FizzBuzz" }
  elif n % 3 == 0 { "Fizz" }
  elif n % 5 == 0 { "Buzz" }
  else { "{n}" }
}

for i in range(1, 21) {
  print(fizzbuzz(i))
}
` },
    { category: 'Control Flow', name: 'Pattern Matching', code: `// Pattern matching — Tova's most powerful feature!

// Simple value matching
fn describe(value) {
  match value {
    0 => "zero"
    1..10 => "small (1-9)"
    n if n > 100 => "big: {n}"
    _ => "other: {value}"
  }
}

print(describe(0))
print(describe(5))
print(describe(200))
print(describe(50))

// Pattern matching on algebraic types
type Shape {
  Circle(radius: Float),
  Rect(w: Float, h: Float),
  Triangle(base: Float, height: Float),
  Point
}

fn area(s) {
  match s {
    Circle(r) => 3.14159 * r ** 2
    Rect(w, h) => w * h
    Triangle(b, h) => 0.5 * b * h
    Point => 0.0
  }
}

fn describe_shape(s) {
  match s {
    Circle(r) => "Circle with radius {r}"
    Rect(w, h) => "Rectangle {w}x{h}"
    Triangle(b, h) => "Triangle base={b} height={h}"
    Point => "Just a point"
  }
}

shapes = [Circle(5.0), Rect(3.0, 4.0), Triangle(6.0, 3.0), Point]
for shape in shapes {
  print("{describe_shape(shape)} => area = {area(shape)}")
}
` },

    // ── Types ──
    { category: 'Types', name: 'Algebraic Data Types', code: `// Algebraic Data Types (tagged unions / sum types)
type Color {
  Red,
  Green,
  Blue,
  Custom(r: Int, g: Int, b: Int)
}

fn to_hex(c) {
  match c {
    Red => "#FF0000"
    Green => "#00FF00"
    Blue => "#0000FF"
    Custom(r, g, b) => "rgb({r},{g},{b})"
  }
}

print(to_hex(Red))
print(to_hex(Custom(255, 128, 0)))

// Option type pattern
type Option {
  Some(value: Any),
  None
}

fn safe_divide(a, b) {
  if b == 0 { None }
  else { Some(a / b) }
}

fn unwrap(opt, default_val) {
  match opt {
    Some(v) => v
    None => default_val
  }
}

print(unwrap(safe_divide(10, 3), 0))
print(unwrap(safe_divide(10, 0), 0))

// Result type
type Result {
  Ok(value: Any),
  Err(message: String)
}

fn parse_age(input) {
  if input > 0 and input < 150 {
    Ok(input)
  } else {
    Err("Invalid age: {input}")
  }
}

print(parse_age(25))
print(parse_age(-5))
` },
    { category: 'Types', name: 'Struct Types', code: `// Struct-like types with named fields
type Point {
  x: Float
  y: Float
}

type User {
  name: String
  age: Int
}

// Creating instances
p1 = Point(3.0, 4.0)
p2 = Point(1.0, 2.0)
print("p1 = ({p1.x}, {p1.y})")
print("p2 = ({p2.x}, {p2.y})")

// Distance function
fn distance(a, b) {
  dx = a.x - b.x
  dy = a.y - b.y
  (dx ** 2 + dy ** 2) ** 0.5
}
print("Distance: {distance(p1, p2)}")

// User records
users = [
  User("Alice", 30),
  User("Bob", 25),
  User("Charlie", 35)
]

// Sort by age
by_age = sorted(users, fn(u) u.age)
for u in by_age {
  print("{u.name}: {u.age}")
}
` },

    // ── Stdlib ──
    { category: 'Standard Library', name: 'Built-in Functions', code: `// Tova comes with useful built-in functions

// range(start?, end, step?)
print("range(5): {range(5)}")
print("range(2,8): {range(2, 8)}")
print("range(0,20,3): {range(0, 20, 3)}")

// len — works on strings, arrays, objects
print("len('hello'): {len("hello")}")
print("len([1,2,3]): {len([1, 2, 3])}")

// sum, min, max
nums = [4, 2, 7, 1, 9, 3]
print("sum: {sum(nums)}")
print("min: {min(nums)}")
print("max: {max(nums)}")

// sorted, reversed
print("sorted: {sorted(nums)}")
print("reversed: {reversed(nums)}")

// enumerate — get index,value pairs
fruits = ["apple", "banana", "cherry"]
for pair in enumerate(fruits) {
  print("  [{pair[0]}] {pair[1]}")
}

// zip — combine arrays
labels = ["name", "age", "city"]
vals = ["Alice", 30, "NYC"]
print("zipped: {zip(labels, vals)}")

// type_of — runtime type checking
print("type_of(42): {type_of(42)}")
print("type_of(3.14): {type_of(3.14)}")
print("type_of('hi'): {type_of("hi")}")
print("type_of(true): {type_of(true)}")
print("type_of(nil): {type_of(nil)}")
print("type_of([1]): {type_of([1, 2])}")
` },

    // ── Reactive UI ──
    { category: 'Reactive UI', name: 'Counter App', code: counter.trim() },
    { category: 'Reactive UI', name: 'Todo App (Full-Stack)', code: todo.trim() },
    { category: 'Reactive UI', name: 'Temperature Converter', code: `// Temperature converter — reactive two-way conversion
client {
  state celsius = 20
  computed fahrenheit = celsius * 9 / 5 + 32
  computed kelvin = celsius + 273.15

  computed description = match celsius {
    c if c <= 0 => "Freezing!"
    c if c <= 15 => "Cold"
    c if c <= 25 => "Comfortable"
    c if c <= 35 => "Warm"
    _ => "Hot!"
  }

  component App {
    <div class="converter">
      <h1>"Temperature Converter"</h1>
      <div class="input-group">
        <label>"Celsius"</label>
        <input type="range" min="-40" max="60" value={celsius}
               on:input={fn(e) celsius = e.target.value * 1} />
        <span class="value">"{celsius}C"</span>
      </div>
      <div class="results">
        <p>"{celsius}C = {fahrenheit}F = {kelvin}K"</p>
        <p class="desc">"{description}"</p>
      </div>
    </div>
  }
}
` },
    { category: 'Reactive UI', name: 'Stopwatch', code: `// Stopwatch with reactive state
client {
  state elapsed = 0
  state running = false
  state timer_id = nil

  fn start_timer() {
    if not running {
      running = true
    }
  }

  fn stop_timer() {
    running = false
  }

  fn reset_timer() {
    running = false
    elapsed = 0
  }

  computed display = match elapsed {
    t if t < 60 => "{t}s"
    t if t < 3600 => "{t / 60}m {t % 60}s"
    _ => "{elapsed / 3600}h {(elapsed % 3600) / 60}m"
  }

  component App {
    <div class="stopwatch">
      <h1>"Stopwatch"</h1>
      <p class="time">"{display}"</p>
      <div class="controls">
        <button on:click={fn() elapsed += 1}>"+1s"</button>
        <button on:click={fn() elapsed += 10}>"+10s"</button>
        <button on:click={fn() elapsed += 60}>"+1m"</button>
        <button on:click={reset_timer}>"Reset"</button>
      </div>
      <p class="hint">"(Click buttons to simulate time passing)"</p>
    </div>
  }
}
` },

    // ── Algorithms ──
    { category: 'Algorithms', name: 'Fibonacci', code: `// Fibonacci sequence — multiple approaches

// Recursive (simple but slow)
fn fib_recursive(n) {
  if n <= 1 { n }
  else { fib_recursive(n - 1) + fib_recursive(n - 2) }
}

// Iterative (fast)
fn fib(n) {
  if n <= 1 { return n }
  var a = 0
  var b = 1
  for i in range(2, n + 1) {
    var temp = b
    b = a + b
    a = temp
  }
  b
}

// Print first 15 Fibonacci numbers
print("Fibonacci sequence:")
for i in range(15) {
  print("  fib({i}) = {fib(i)}")
}

// Using list comprehension
fibs = [fib(i) for i in range(20)]
print("\\nFirst 20: {fibs}")
print("Sum: {sum(fibs)}")
` },
    { category: 'Algorithms', name: 'Binary Search', code: `// Binary search on sorted array
fn binary_search(arr, target) {
  var lo = 0
  var hi = len(arr) - 1
  while lo <= hi {
    mid = (lo + hi) / 2
    if arr[mid] == target {
      return mid
    } elif arr[mid] < target {
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  -1
}

// Test it
nums = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
print("Array: {nums}")

for target in [23, 72, 15, 2, 91] {
  idx = binary_search(nums, target)
  if idx >= 0 {
    print("Found {target} at index {idx}")
  } else {
    print("{target} not found")
  }
}

// Sorting + searching
word_list = ["banana", "apple", "cherry", "date", "elderberry", "fig"]
sorted_words = sorted(word_list)
print("\\nSorted: {sorted_words}")
print("Index of 'cherry': {binary_search(sorted_words, "cherry")}")
` },
    { category: 'Algorithms', name: 'Linked List with ADTs', code: `// Linked List using algebraic data types
type List {
  Cons(head: Any, tail: Any),
  Empty
}

// Constructor helper
fn list_of(arr) {
  var result = Empty
  for i in range(len(arr) - 1, -1, -1) {
    result = Cons(arr[i], result)
  }
  result
}

// Operations
fn list_len(lst) {
  match lst {
    Empty => 0
    Cons(_, tail) => 1 + list_len(tail)
  }
}

fn list_map(lst, f) {
  match lst {
    Empty => Empty
    Cons(h, t) => Cons(f(h), list_map(t, f))
  }
}

fn list_to_array(lst) {
  var result = []
  var current = lst
  while current != Empty {
    match current {
      Cons(h, t) => {
        result = [...result, h]
        current = t
      }
      _ => { current = Empty }
    }
  }
  result
}

// Test it
my_list = list_of([1, 2, 3, 4, 5])
print("Length: {list_len(my_list)}")

doubled = list_map(my_list, fn(x) x * 2)
print("Doubled: {list_to_array(doubled)}")

squared = list_map(my_list, fn(x) x * x)
print("Squared: {list_to_array(squared)}")
` },
    { category: 'Algorithms', name: 'Game of Life', code: `// Conway's Game of Life — one generation step

fn make_grid(rows, cols) {
  [[0 for c in range(cols)] for r in range(rows)]
}

fn count_neighbors(grid, r, c) {
  rows = len(grid)
  cols = len(grid[0])
  var total = 0
  for dr in [-1, 0, 1] {
    for dc in [-1, 0, 1] {
      if dr == 0 and dc == 0 { }
      else {
        nr = (r + dr + rows) % rows
        nc = (c + dc + cols) % cols
        total = total + grid[nr][nc]
      }
    }
  }
  total
}

fn step(grid) {
  rows = len(grid)
  cols = len(grid[0])
  [
    [
      match [grid[r][c], count_neighbors(grid, r, c)] {
        [1, n] if n < 2 => 0
        [1, n] if n > 3 => 0
        [1, _] => 1
        [0, 3] => 3
        _ => grid[r][c]
      }
    for c in range(cols)]
  for r in range(rows)]
}

fn display(grid) {
  for row in grid {
    line = [match cell { 0 => "." _ => "#" } for cell in row]
    print(line)
  }
}

// Glider pattern
grid = make_grid(8, 8)
grid[1][2] = 1
grid[2][3] = 1
grid[3][1] = 1
grid[3][2] = 1
grid[3][3] = 1

print("Generation 0:")
display(grid)
print("")

grid = step(grid)
print("Generation 1:")
display(grid)
print("")

grid = step(grid)
print("Generation 2:")
display(grid)
` },
  ];
}

// ─── Language Reference Data ─────────────────────────────
function getReference() {
  return [
    { title: 'Variables', items: [
      { syntax: 'name = "Alice"', desc: 'Immutable binding' },
      { syntax: 'var count = 0', desc: 'Mutable binding' },
      { syntax: 'a, b = 1, 2', desc: 'Multiple assignment' },
      { syntax: 'x, y = y, x', desc: 'Swap values' },
    ]},
    { title: 'Types', items: [
      { syntax: 'Int, Float, String, Bool, Nil', desc: 'Primitive types' },
      { syntax: 'type Point { x: Float, y: Float }', desc: 'Struct type' },
      { syntax: 'type Color { Red, Blue, Custom(r: Int) }', desc: 'Algebraic type (ADT)' },
    ]},
    { title: 'Functions', items: [
      { syntax: 'fn add(a, b) { a + b }', desc: 'Function (implicit return)' },
      { syntax: 'fn greet(name = "world") { ... }', desc: 'Default parameters' },
      { syntax: 'double = fn(x) x * 2', desc: 'Lambda expression' },
      { syntax: 'return value', desc: 'Early return' },
    ]},
    { title: 'Control Flow', items: [
      { syntax: 'if cond { } elif { } else { }', desc: 'Conditionals' },
      { syntax: 'for item in items { }', desc: 'For-in loop' },
      { syntax: 'for i in range(10) { }', desc: 'Range loop' },
      { syntax: 'while cond { }', desc: 'While loop' },
    ]},
    { title: 'Pattern Matching', items: [
      { syntax: 'match value { 0 => "zero", _ => "other" }', desc: 'Value matching' },
      { syntax: '1..10 => "small"', desc: 'Range pattern' },
      { syntax: 'n if n > 100 => "big"', desc: 'Guard clause' },
      { syntax: 'Circle(r) => 3.14 * r ** 2', desc: 'Destructure ADT' },
    ]},
    { title: 'Strings', items: [
      { syntax: '"Hello, {name}!"', desc: 'Interpolation' },
      { syntax: '.upper() .lower() .trim()', desc: 'Case methods' },
      { syntax: '.contains(s) .starts_with(s)', desc: 'Search methods' },
      { syntax: '.words() .chars() .lines()', desc: 'Split methods' },
      { syntax: '.capitalize() .title_case()', desc: 'Format methods' },
      { syntax: '"-" * 20', desc: 'String repeat' },
    ]},
    { title: 'Collections', items: [
      { syntax: '[1, 2, 3]', desc: 'Array literal' },
      { syntax: '{key: value}', desc: 'Object literal' },
      { syntax: '[x*2 for x in items if x > 0]', desc: 'List comprehension' },
      { syntax: '{k: v for k in keys}', desc: 'Dict comprehension' },
      { syntax: 'arr[1:3]  arr[::-1]', desc: 'Slice syntax' },
      { syntax: '[...a, ...b]', desc: 'Spread operator' },
    ]},
    { title: 'Operators', items: [
      { syntax: '+ - * / % **', desc: 'Arithmetic (** is power)' },
      { syntax: '== != < <= > >=', desc: 'Comparison' },
      { syntax: 'and  or  not', desc: 'Logical' },
      { syntax: '|>', desc: 'Pipe operator' },
      { syntax: 'x in list / x not in list', desc: 'Membership' },
      { syntax: '1 < x < 10', desc: 'Chained comparison' },
      { syntax: 'a?.b', desc: 'Optional chaining' },
    ]},
    { title: 'Stdlib Functions', items: [
      { syntax: 'print(...args)', desc: 'Print to console' },
      { syntax: 'len(v)', desc: 'Length of string/array/object' },
      { syntax: 'range(start?, end, step?)', desc: 'Generate number array' },
      { syntax: 'sum(arr) min(arr) max(arr)', desc: 'Aggregation' },
      { syntax: 'sorted(arr, key?) reversed(arr)', desc: 'Ordering' },
      { syntax: 'enumerate(arr)', desc: 'Index-value pairs' },
      { syntax: 'zip(a, b, ...)', desc: 'Combine arrays' },
      { syntax: 'map(arr, fn) filter(arr, fn)', desc: 'Transform/filter' },
      { syntax: 'type_of(value)', desc: 'Runtime type name' },
    ]},
    { title: 'Reactive (client)', items: [
      { syntax: 'state count = 0', desc: 'Reactive variable (signal)' },
      { syntax: 'computed doubled = count * 2', desc: 'Derived value' },
      { syntax: 'effect { ... }', desc: 'Side effect (auto-tracks deps)' },
      { syntax: 'component App { <div>...</div> }', desc: 'UI component' },
      { syntax: 'on:click={fn() ...}', desc: 'Event handler' },
      { syntax: 'server.method()', desc: 'RPC call to server' },
    ]},
    { title: 'Full-Stack Blocks', items: [
      { syntax: 'server { ... }', desc: 'Server-side code (Bun)' },
      { syntax: 'client { ... }', desc: 'Client-side code (browser)' },
      { syntax: 'shared { ... }', desc: 'Shared code (both)' },
      { syntax: 'route GET "/path" => handler', desc: 'HTTP route' },
    ]},
  ];
}

// ─── Tutorial lessons ────────────────────────────────────
function getTutorial() {
  return [
    {
      title: 'Welcome to Tova',
      description: 'Tova is a modern language that compiles to JavaScript. It combines Python\'s readability with ML-style pattern matching and built-in reactivity.',
      code: `// Try running this! Press Cmd/Ctrl+Enter or click Run.
print("Welcome to Tova!")

// Variables are immutable by default
name = "Developer"
print("Hello, {name}!")

// Use 'var' for mutable variables
var counter = 0
counter += 1
print("Counter: {counter}")`,
    },
    {
      title: 'Functions',
      description: 'Functions use the fn keyword and return their last expression. No "return" needed!',
      code: `// Implicit return — the last expression is returned
fn add(a, b) {
  a + b
}

// Default parameters
fn greet(name = "World") {
  "Hello, {name}!"
}

print(add(3, 4))
print(greet())
print(greet("Tova"))

// Lambdas for short functions
double = fn(x) x * 2
print(double(21))`,
    },
    {
      title: 'Collections',
      description: 'Tova has powerful collection features: list comprehensions, slicing, and the pipe operator.',
      code: `// List comprehension
squares = [x * x for x in range(1, 11)]
print("Squares: {squares}")

// Filter with comprehension
evens = [x for x in range(1, 21) if x % 2 == 0]
print("Evens: {evens}")

// Pipe operator for readable chains
result = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  |> filter(fn(x) x % 2 == 0)
  |> map(fn(x) x * x)
  |> sum()
print("Sum of squares of evens: {result}")

// Slicing
arr = [10, 20, 30, 40, 50]
print("First 3: {arr[:3]}")
print("Last 2: {arr[3:]}")`,
    },
    {
      title: 'Pattern Matching',
      description: 'Match expressions are like switch on steroids. They support values, ranges, guards, and destructuring.',
      code: `// Match on values and ranges
fn classify(n) {
  match n {
    0 => "zero"
    1..10 => "small"
    n if n > 100 => "huge: {n}"
    _ => "medium: {n}"
  }
}

for n in [0, 3, 50, 200] {
  print("{n} -> {classify(n)}")
}

// Match on algebraic types
type Shape {
  Circle(r: Float),
  Rect(w: Float, h: Float)
}

fn area(s) {
  match s {
    Circle(r) => 3.14159 * r ** 2
    Rect(w, h) => w * h
  }
}

print("Circle area: {area(Circle(5.0))}")
print("Rect area: {area(Rect(3.0, 4.0))}")`,
    },
    {
      title: 'Types & ADTs',
      description: 'Define struct-like types and algebraic data types (tagged unions) for type-safe data modeling.',
      code: `// Struct type
type User {
  name: String
  age: Int
}

// Algebraic type (sum type)
type Result {
  Ok(value: Any),
  Err(message: String)
}

fn validate_age(age) {
  if age >= 0 and age <= 150 {
    Ok(User("Valid", age))
  } else {
    Err("Age must be 0-150, got {age}")
  }
}

for age in [25, -5, 200, 42] {
  result = validate_age(age)
  match result {
    Ok(user) => print("Valid: age {user.age}")
    Err(msg) => print("Error: {msg}")
  }
}`,
    },
    {
      title: 'Reactive UI',
      description: 'Tova has built-in reactivity for building UIs. State changes automatically update the DOM!',
      code: `// Switch to the "Preview" tab to see this in action!
client {
  state clicks = 0
  computed doubled = clicks * 2
  computed emoji = match clicks {
    0 => "Start clicking!"
    c if c < 5 => "Getting started..."
    c if c < 10 => "Nice!"
    _ => "On fire!"
  }

  component App {
    <div style="text-align: center; padding: 20px;">
      <h1>"Tova Reactive Demo"</h1>
      <p style="font-size: 48px;">"{clicks}"</p>
      <p>"Doubled: {doubled}"</p>
      <p>"{emoji}"</p>
      <button on:click={fn() clicks += 1}>"+ Add"</button>
      <button on:click={fn() clicks -= 1}>"- Sub"</button>
      <button on:click={fn() clicks = 0}>"Reset"</button>
    </div>
  }
}`,
    },
    {
      title: 'Strings & Interpolation',
      description: 'Tova strings support interpolation with {expressions}, plus Python-style methods like .upper(), .contains(), and even string repetition.',
      code: `// String interpolation with any expression
name = "World"
print("Hello, {name}!")

// Expressions inside interpolation
x = 7
print("{x} squared is {x * x}")

// String methods
greeting = "hello world"
print(greeting.upper())
print(greeting.capitalize())
print(greeting.title_case())

// Useful checks
print("contains 'world': {greeting.contains("world")}")
print("starts with 'hello': {greeting.starts_with("hello")}")

// String repetition
border = "=" * 30
print(border)
print("  Tova is great!")
print(border)`,
    },
    {
      title: 'Pipe Operator',
      description: 'The pipe operator |> chains function calls, making data transformations read top-to-bottom instead of inside-out.',
      code: `// Without pipe (nested, hard to read):
// sum(map(filter(numbers, fn(x) x % 2 == 0), fn(x) x * x))

// With pipe (reads top to bottom):
numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

result = numbers
  |> filter(fn(x) x % 2 == 0)
  |> map(fn(x) x * x)
  |> sum()

print("Sum of squares of evens: {result}")

// Name pipeline
names = ["Charlie", "Alice", "Bob", "Diana"]
sorted_long = names
  |> filter(fn(n) len(n) > 3)
  |> sorted()
print("Long names sorted: {sorted_long}")

// Simple value pipeline
42 |> fn(x) x * 2 |> fn(x) "Answer: {x}" |> print()`,
    },
    {
      title: 'Full-Stack App',
      description: 'Tova has built-in full-stack blocks: server, client, and shared. In the playground, server features are simulated.',
      code: `// A full-stack app has server + client blocks.
// In playground mode, server calls are stubbed.

client {
  state name = "World"
  computed greeting = "Hello, {name}!"

  component App {
    <div style="padding: 20px;">
      <h1>"Full-Stack Demo"</h1>
      <div class="input-group">
        <label>"Your name:"</label>
        <input type="text" value={name}
               on:input={fn(e) name = e.target.value} />
      </div>
      <p style="font-size: 24px; margin-top: 16px;">"{greeting}"</p>
      <p class="hint">"(Type to see reactive updates!)"</p>
    </div>
  }
}`,
    },
    {
      title: 'Advanced Patterns',
      description: 'Combine pattern matching with algebraic types, guards, and destructuring for expressive code.',
      code: `// Result type with pattern matching
type Result {
  Ok(value: Any),
  Err(message: String)
}

fn parse_number(s) {
  n = s * 1  // coerce to number
  if n != n { Err("Not a number: {s}") }
  else { Ok(n) }
}

fn safe_divide(a, b) {
  if b == 0 { Err("Division by zero") }
  else { Ok(a / b) }
}

// Chain operations with match
inputs = [["10", "2"], ["42", "0"], ["abc", "5"], ["100", "4"]]
for pair in inputs {
  result = match parse_number(pair[0]) {
    Err(msg) => Err(msg)
    Ok(a) => match parse_number(pair[1]) {
      Err(msg) => Err(msg)
      Ok(b) => safe_divide(a, b)
    }
  }
  match result {
    Ok(v) => print("{pair[0]} / {pair[1]} = {v}")
    Err(msg) => print("{pair[0]} / {pair[1]} -> Error: {msg}")
  }
}`,
    },
  ];
}

// ─── Generate the full HTML ─────────────────────────────
function generateHTML(compilerBundle, runtimeBundle, stringProto, arrayProto, stdlib, examples, reference, tutorial) {
  // Group examples by category
  const categories = [];
  const catMap = {};
  for (const ex of examples) {
    if (!catMap[ex.category]) {
      catMap[ex.category] = [];
      categories.push(ex.category);
    }
    catMap[ex.category].push(ex);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tova Playground</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
/* ─── Reset & Base ─────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #1e1e2e; --bg-surface: #181825; --bg-overlay: #11111b;
  --bg-hover: #1e1e2e;
  --text: #cdd6f4; --text-dim: #6c7086; --text-bright: #f5f5f5;
  --accent: #cba6f7; --accent-dim: #9370db; --accent-bg: rgba(203,166,247,0.1);
  --green: #a6e3a1; --red: #f38ba8; --yellow: #f9e2af; --blue: #89b4fa;
  --teal: #94e2d5; --peach: #fab387;
  --border: #313244; --border-active: #45475a;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --header-h: 48px; --status-h: 28px;
  --tab-h: 36px; --sidebar-w: 340px;
  --editor-font-size: 14px;
}
html, body { height: 100%; overflow: hidden; }
body {
  font-family: var(--font-sans); background: var(--bg); color: var(--text);
  display: flex; flex-direction: column;
}

/* ─── Header ───────────────────────────────────────── */
.header {
  height: var(--header-h); display: flex; align-items: center;
  padding: 0 12px; background: var(--bg-surface);
  border-bottom: 1px solid var(--border); gap: 8px; flex-shrink: 0;
}
.header .logo {
  font-weight: 700; font-size: 15px; color: var(--accent);
  display: flex; align-items: center; gap: 6px; white-space: nowrap;
}
.header .logo span { color: var(--text-dim); font-weight: 400; font-size: 12px; }
.header .sep { width: 1px; height: 24px; background: var(--border); }
.header .spacer { flex: 1; }

.btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border);
  background: var(--bg); color: var(--text); font-size: 12px;
  cursor: pointer; transition: all 0.15s; font-family: var(--font-sans);
  white-space: nowrap;
}
.btn:hover { border-color: var(--border-active); background: var(--bg-surface); }
.btn.active { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }
.btn-primary { background: var(--accent); color: var(--bg-overlay); border-color: var(--accent); font-weight: 600; }
.btn-primary:hover { background: var(--accent-dim); border-color: var(--accent-dim); }
.btn-icon { padding: 5px 8px; font-size: 14px; }
.btn .kbd { font-size: 10px; opacity: 0.6; font-family: var(--font-mono); }

select.examples-select {
  padding: 5px 24px 5px 8px; border-radius: 6px; border: 1px solid var(--border);
  background: var(--bg); color: var(--text); font-size: 12px;
  cursor: pointer; font-family: var(--font-sans); max-width: 200px;
  appearance: none; -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236c7086' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 6px center;
}
select.examples-select:hover { border-color: var(--border-active); }
select.examples-select optgroup { background: var(--bg-surface); color: var(--accent); font-style: normal; }
select.examples-select option { background: var(--bg); color: var(--text); }

/* ─── Main Layout ──────────────────────────────────── */
.main {
  flex: 1; display: flex; overflow: hidden;
  height: calc(100% - var(--header-h) - var(--status-h));
}
.pane { display: flex; flex-direction: column; overflow: hidden; min-width: 200px; }
.pane-editor { flex: 1; position: relative; }
.pane-output { flex: 1; }

/* ─── Drag Handle ──────────────────────────────────── */
.drag-handle {
  width: 4px; cursor: col-resize; background: var(--border);
  transition: background 0.15s; flex-shrink: 0;
}
.drag-handle:hover, .drag-handle.active { background: var(--accent); }

/* ─── Output Tabs ──────────────────────────────────── */
.tabs {
  display: flex; height: var(--tab-h); background: var(--bg-surface);
  border-bottom: 1px solid var(--border); flex-shrink: 0; align-items: flex-end;
}
.tab {
  padding: 0 14px; height: 100%; font-size: 12px; cursor: pointer; display: flex; align-items: center;
  color: var(--text-dim); border-bottom: 2px solid transparent;
  transition: all 0.15s; user-select: none; gap: 6px;
}
.tab:hover { color: var(--text); background: rgba(255,255,255,0.02); }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.tab .badge {
  font-size: 10px; padding: 1px 6px; border-radius: 8px;
  background: var(--red); color: var(--bg); font-weight: 600; min-width: 18px; text-align: center;
}

/* ─── Output Panels ────────────────────────────────── */
.output-content { flex: 1; overflow: auto; position: relative; }
.output-panel { display: none; height: 100%; overflow: auto; }
.output-panel.active { display: block; }
#panel-console.active { display: flex; flex-direction: column; }
#panel-js { position: relative; }

#js-output, #console-output, #ast-output {
  padding: 12px 16px; font-family: var(--font-mono); font-size: 13px;
  line-height: 1.6; white-space: pre-wrap; word-break: break-word;
}
#js-output { color: var(--text); }
#console-output .log-line { color: var(--text); padding: 1px 0; }
#console-output .log-error { color: var(--red); padding: 1px 0; }
#console-output .log-warn { color: var(--yellow); padding: 1px 0; }
#console-output .log-info { color: var(--blue); padding: 1px 0; }
#console-output .log-return { color: var(--text-dim); font-style: italic; padding: 1px 0; }

#preview-frame {
  width: 100%; height: 100%; border: none; background: #fff;
}

/* ─── AST Tree ─────────────────────────────────────── */
.ast-node { margin-left: 16px; font-family: var(--font-mono); font-size: 12px; line-height: 1.5; }
.ast-toggle { cursor: pointer; user-select: none; display: inline-flex; align-items: center; gap: 4px; }
.ast-toggle:hover { color: var(--accent); }
.ast-toggle::before { content: '\\25B6'; font-size: 8px; display: inline-block; transition: transform 0.15s; }
.ast-toggle.open::before { transform: rotate(90deg); }
.ast-key { color: var(--blue); }
.ast-string { color: var(--green); }
.ast-number { color: var(--yellow); }
.ast-bool { color: var(--accent); }
.ast-null { color: var(--text-dim); }
.ast-type { color: var(--accent); font-weight: 600; }
.ast-children { display: none; }
.ast-children.open { display: block; }

/* ─── Status Bar ───────────────────────────────────── */
.status-bar {
  height: var(--status-h); display: flex; align-items: center;
  padding: 0 12px; background: var(--bg-surface);
  border-top: 1px solid var(--border); font-size: 11px;
  color: var(--text-dim); gap: 16px; flex-shrink: 0;
}
.status-bar .success { color: var(--green); }
.status-bar .error { color: var(--red); }
.status-bar .spacer { flex: 1; }

/* ─── Error Display ────────────────────────────────── */
.error-banner {
  padding: 8px 16px; background: rgba(243,139,168,0.08);
  border-bottom: 1px solid rgba(243,139,168,0.3); color: var(--red);
  font-family: var(--font-mono); font-size: 12px; display: none;
  cursor: pointer; position: relative;
}
.error-banner:hover { background: rgba(243,139,168,0.12); }
.error-banner.visible { display: flex; align-items: center; gap: 8px; }
.error-banner .error-icon { font-weight: bold; flex-shrink: 0; }
.error-banner .error-text { flex: 1; }

/* ─── Sidebar / Reference Panel ───────────────────── */
.sidebar {
  width: 0; overflow: hidden; background: var(--bg-surface);
  border-left: 1px solid var(--border); transition: width 0.2s ease;
  flex-shrink: 0; display: flex; flex-direction: column;
}
.sidebar.open { width: var(--sidebar-w); }
.sidebar-header {
  display: flex; align-items: center; padding: 10px 14px;
  border-bottom: 1px solid var(--border); gap: 8px; flex-shrink: 0;
}
.sidebar-header h3 { font-size: 14px; font-weight: 600; color: var(--text-bright); flex: 1; }
.sidebar-close {
  background: none; border: none; color: var(--text-dim); cursor: pointer;
  font-size: 18px; padding: 2px 6px; border-radius: 4px;
}
.sidebar-close:hover { color: var(--text); background: var(--bg); }
.sidebar-body { flex: 1; overflow-y: auto; padding: 8px 0; }

/* Reference styles */
.ref-section { margin-bottom: 4px; }
.ref-title {
  padding: 6px 14px; font-size: 12px; font-weight: 600;
  color: var(--accent); cursor: pointer; display: flex; align-items: center; gap: 6px;
  user-select: none;
}
.ref-title:hover { background: var(--bg); }
.ref-title::before { content: '\\25B6'; font-size: 8px; transition: transform 0.15s; }
.ref-title.open::before { transform: rotate(90deg); }
.ref-items { display: none; padding: 0 14px 8px; }
.ref-items.open { display: block; }
.ref-item { margin: 3px 0; }
.ref-item code {
  font-family: var(--font-mono); font-size: 11px; color: var(--green);
  background: rgba(166,227,161,0.08); padding: 1px 4px; border-radius: 3px;
}
.ref-item .ref-desc { font-size: 11px; color: var(--text-dim); margin-left: 4px; }

/* Tutorial styles */
.tutorial-nav { display: flex; gap: 4px; padding: 8px 14px; flex-shrink: 0; border-top: 1px solid var(--border); }
.tutorial-nav .btn { flex: 1; justify-content: center; font-size: 12px; }
.tutorial-step { padding: 14px; }
.tutorial-step h4 { color: var(--accent); font-size: 14px; margin-bottom: 8px; }
.tutorial-step p { font-size: 13px; color: var(--text); line-height: 1.5; margin-bottom: 10px; }
.tutorial-step .try-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 14px; border-radius: 6px; border: 1px solid var(--accent);
  background: var(--accent-bg); color: var(--accent); font-size: 12px;
  cursor: pointer; font-weight: 500;
}
.tutorial-step .try-btn:hover { background: rgba(203,166,247,0.2); }
.tutorial-progress {
  display: flex; gap: 4px; padding: 0 14px 8px; flex-shrink: 0;
}
.tutorial-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--border); cursor: pointer;
}
.tutorial-dot.active { background: var(--accent); }
.tutorial-dot.completed { background: var(--green); }

/* ─── Keyboard Shortcuts Modal ────────────────────── */
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: none; align-items: center; justify-content: center; z-index: 100;
}
.modal-backdrop.visible { display: flex; }
.modal {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 24px; max-width: 480px; width: 90%;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
.modal h3 { color: var(--accent); margin-bottom: 16px; font-size: 16px; }
.modal-close {
  float: right; background: none; border: none; color: var(--text-dim);
  cursor: pointer; font-size: 20px; padding: 0 4px;
}
.modal-close:hover { color: var(--text); }
.shortcut-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 0; border-bottom: 1px solid rgba(49,50,68,0.5);
}
.shortcut-row:last-child { border-bottom: none; }
.shortcut-keys {
  display: flex; gap: 4px;
}
.shortcut-key {
  background: var(--bg); border: 1px solid var(--border); border-radius: 4px;
  padding: 2px 8px; font-family: var(--font-mono); font-size: 11px; color: var(--text-bright);
}
.shortcut-desc { font-size: 13px; color: var(--text-dim); }

/* ─── Settings Dropdown ──────────────────────────── */
.settings-dropdown {
  position: absolute; top: calc(var(--header-h) + 4px); right: 12px;
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 12px; min-width: 220px; z-index: 50;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4); display: none;
}
.settings-dropdown.visible { display: block; }
.settings-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 0; font-size: 13px;
}
.settings-row label { color: var(--text); }
.settings-row select, .settings-row input[type="range"] {
  background: var(--bg); border: 1px solid var(--border); color: var(--text);
  border-radius: 4px; padding: 3px 6px; font-size: 12px;
}
.toggle {
  width: 36px; height: 20px; border-radius: 10px; background: var(--border);
  position: relative; cursor: pointer; transition: background 0.2s;
}
.toggle.on { background: var(--accent); }
.toggle::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 50%; background: white;
  transition: transform 0.2s;
}
.toggle.on::after { transform: translateX(16px); }

/* ─── Welcome Overlay ─────────────────────────────── */
.welcome-toast {
  position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: 8px; padding: 10px 16px; font-size: 12px;
  color: var(--text-dim); z-index: 10; display: flex; align-items: center; gap: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3); white-space: nowrap;
  animation: fadeIn 0.3s ease;
}
.welcome-toast .kbd-hint {
  font-family: var(--font-mono); font-size: 10px;
  background: var(--bg); border: 1px solid var(--border); padding: 2px 6px;
  border-radius: 3px; color: var(--text);
}
.welcome-toast .close-toast {
  background: none; border: none; color: var(--text-dim); cursor: pointer;
  font-size: 14px; padding: 0 2px;
}
@keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

/* ─── Console Enhancements ────────────────────────── */
.console-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 12px; background: var(--bg-surface);
  border-bottom: 1px solid var(--border); font-size: 11px; flex-shrink: 0;
}
.console-toolbar .spacer { flex: 1; }
.console-toolbar .console-timing { color: var(--text-dim); font-family: var(--font-mono); }
.log-icon { margin-right: 6px; opacity: 0.7; font-size: 11px; }
.log-content { white-space: pre-wrap; word-break: break-word; }
#console-output .log-line, #console-output .log-error,
#console-output .log-warn, #console-output .log-info {
  display: flex; align-items: flex-start; padding: 3px 16px; border-bottom: 1px solid rgba(49,50,68,0.3);
}
#console-output .log-line:hover, #console-output .log-error:hover,
#console-output .log-warn:hover, #console-output .log-info:hover {
  background: rgba(255,255,255,0.02);
}

/* ─── Error Banner Enhanced ───────────────────────── */
.error-banner .error-hint {
  color: var(--yellow); font-size: 11px; margin-left: 12px; opacity: 0.8;
}

/* ─── Command Palette ─────────────────────────────── */
.cmd-palette-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: none; align-items: flex-start; justify-content: center;
  padding-top: 20vh; z-index: 200;
}
.cmd-palette-backdrop.visible { display: flex; }
.cmd-palette {
  background: var(--bg-surface); border: 1px solid var(--border);
  border-radius: 12px; width: 520px; max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5); overflow: hidden;
}
.cmd-palette input {
  width: 100%; padding: 14px 16px; background: transparent;
  border: none; border-bottom: 1px solid var(--border);
  color: var(--text); font-size: 15px; font-family: var(--font-sans);
  outline: none;
}
.cmd-palette input::placeholder { color: var(--text-dim); }
.cmd-palette-results {
  max-height: 320px; overflow-y: auto; padding: 4px 0;
}
.cmd-palette-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px; cursor: pointer; font-size: 13px;
  color: var(--text); transition: background 0.1s;
}
.cmd-palette-item:hover, .cmd-palette-item.selected {
  background: var(--accent-bg); color: var(--accent);
}
.cmd-palette-item .cmd-icon { width: 20px; text-align: center; opacity: 0.6; font-size: 14px; }
.cmd-palette-item .cmd-label { flex: 1; }
.cmd-palette-item .cmd-category { font-size: 11px; color: var(--text-dim); }
.cmd-palette-item .cmd-shortcut {
  font-family: var(--font-mono); font-size: 10px; color: var(--text-dim);
  background: var(--bg); border: 1px solid var(--border); border-radius: 3px;
  padding: 1px 5px;
}
.cmd-palette-empty {
  padding: 24px 16px; text-align: center; color: var(--text-dim); font-size: 13px;
}

/* ─── Layout Toggle ───────────────────────────────── */
.main.vertical { flex-direction: column; }
.main.vertical .drag-handle { width: auto; height: 4px; cursor: row-resize; }
.main.vertical .pane { min-width: unset; min-height: 150px; }

/* ─── Light Theme ─────────────────────────────────── */
.light-theme {
  --bg: #f8f9fa; --bg-surface: #ffffff; --bg-overlay: #e9ecef;
  --bg-hover: #f1f3f5;
  --text: #212529; --text-dim: #868e96; --text-bright: #000000;
  --accent: #7c3aed; --accent-dim: #6d28d9; --accent-bg: rgba(124,58,237,0.08);
  --green: #2b8a3e; --red: #e03131; --yellow: #e67700; --blue: #1971c2;
  --teal: #0ca678; --peach: #e8590c;
  --border: #dee2e6; --border-active: #ced4da;
}
.light-theme .cm-editor .cm-gutters { background: #f1f3f5; }
.light-theme #preview-frame { background: #fff; }

/* ─── Embed Mode ──────────────────────────────────── */
.embed-mode .header { display: none; }
.embed-mode .status-bar { display: none; }
.embed-mode .sidebar { display: none; }

/* ─── JS Output Editor ────────────────────────────── */
#js-output-editor { height: 100%; }
#panel-js .cm-editor { height: 100%; }
#panel-js .cm-editor .cm-gutters { background: var(--bg-surface); }

/* ─── CodeMirror Overrides ─────────────────────────── */
.cm-editor { height: 100%; font-size: var(--editor-font-size); }
.cm-editor .cm-scroller { font-family: var(--font-mono) !important; }
.cm-editor .cm-content { padding: 8px 0; }
.cm-editor .cm-gutters {
  background: var(--bg-surface); border-right: 1px solid var(--border);
  color: var(--text-dim);
}
.cm-editor .cm-activeLineGutter { background: rgba(203,166,247,0.08); }
.cm-editor .cm-activeLine { background: rgba(203,166,247,0.04); }
.cm-editor .cm-selectionBackground { background: rgba(203,166,247,0.2) !important; }
.cm-editor.cm-focused .cm-selectionBackground { background: rgba(203,166,247,0.25) !important; }
.cm-editor .cm-cursor { border-left-color: var(--accent); }
.cm-error-line { background: rgba(243,139,168,0.1) !important; }
.cm-error-gutter .cm-gutterElement { padding: 0 2px; }

/* ─── Autocomplete Styling ────────────────────────── */
.cm-tooltip-autocomplete { background: var(--bg-surface) !important; border: 1px solid var(--border) !important; border-radius: 8px !important; }
.cm-tooltip-autocomplete ul li { padding: 4px 8px !important; }
.cm-tooltip-autocomplete ul li[aria-selected] { background: var(--accent-bg) !important; color: var(--accent) !important; }
.cm-completionLabel { font-family: var(--font-mono); }
.cm-completionDetail { font-size: 11px; opacity: 0.7; margin-left: 8px; }
.cm-completionInfo { padding: 8px; font-size: 12px; }

/* ─── Scrollbar ───────────────────────────────────── */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--border-active); }

/* ─── Responsive ───────────────────────────────────── */
@media (max-width: 768px) {
  .main { flex-direction: column; }
  .drag-handle { width: auto; height: 4px; cursor: row-resize; }
  .pane { min-width: unset; min-height: 150px; }
  .sidebar { position: fixed; right: 0; top: var(--header-h); bottom: var(--status-h); z-index: 50; }
  .header .hide-mobile { display: none; }
  .header .sep { display: none; }
}
</style>
</head>
<body>

<!-- ─── Header ────────────────────────────────────── -->
<div class="header">
  <div class="logo">&#9670; Tova <span>Playground</span></div>
  <div class="sep"></div>
  <select class="examples-select" id="examples-select">
    <option value="" disabled selected>Load Example...</option>
  </select>
  <div class="spacer"></div>
  <button class="btn hide-mobile" id="btn-tutorial" title="Interactive tutorial">Learn</button>
  <button class="btn hide-mobile" id="btn-reference" title="Language reference">Reference</button>
  <div class="sep hide-mobile"></div>
  <button class="btn btn-icon hide-mobile" id="btn-layout" title="Toggle layout (Cmd+J)">&#9707;</button>
  <button class="btn btn-icon hide-mobile" id="btn-shortcuts" title="Keyboard shortcuts">&#9000;</button>
  <button class="btn btn-icon hide-mobile" id="btn-settings" title="Settings">&#9881;</button>
  <button class="btn" id="btn-export" title="Export as standalone HTML">Export</button>
  <button class="btn" id="btn-download" title="Download .tova file">&#8615;</button>
  <button class="btn" id="btn-share" title="Copy shareable URL">Share</button>
  <button class="btn btn-primary" id="btn-run" title="Cmd/Ctrl+Enter">Run &#9654;</button>
</div>

<!-- ─── Settings Dropdown ─────────────────────────── -->
<div class="settings-dropdown" id="settings-dropdown">
  <div class="settings-row">
    <label>Font Size</label>
    <select id="setting-fontsize">
      <option value="12">12px</option>
      <option value="13">13px</option>
      <option value="14" selected>14px</option>
      <option value="15">15px</option>
      <option value="16">16px</option>
      <option value="18">18px</option>
    </select>
  </div>
  <div class="settings-row">
    <label>Auto-Compile</label>
    <div class="toggle on" id="setting-autocompile"></div>
  </div>
  <div class="settings-row">
    <label>Auto-Run</label>
    <div class="toggle on" id="setting-autorun"></div>
  </div>
  <div class="settings-row">
    <label>Light Theme</label>
    <div class="toggle" id="setting-theme"></div>
  </div>
</div>

<!-- ─── Main ──────────────────────────────────────── -->
<div class="main">
  <div class="pane pane-editor">
    <div id="editor"></div>
  </div>
  <div class="drag-handle" id="drag-handle"></div>
  <div class="pane pane-output">
    <div class="tabs" id="output-tabs">
      <div class="tab active" data-tab="js">JS Output</div>
      <div class="tab" data-tab="console">Console <span class="badge" id="console-badge" style="display:none">0</span></div>
      <div class="tab" data-tab="preview">Preview</div>
      <div class="tab" data-tab="ast">AST</div>
    </div>
    <div class="error-banner" id="error-banner">
      <span class="error-icon">&#10006;</span>
      <span class="error-text" id="error-text"></span>
      <span class="error-hint" id="error-hint"></span>
    </div>
    <div class="output-content">
      <div class="output-panel active" id="panel-js"><div id="js-output-editor"></div><pre id="js-output" style="display:none"></pre></div>
      <div class="output-panel" id="panel-console">
        <div class="console-toolbar">
          <span class="console-timing" id="console-timing"></span>
          <div class="spacer"></div>
          <button class="btn" id="btn-copy-console" style="padding:2px 8px;font-size:11px;">Copy</button>
          <button class="btn" id="btn-clear-console" style="padding:2px 8px;font-size:11px;">Clear</button>
        </div>
        <div id="console-output" style="padding:12px 0;font-family:var(--font-mono);font-size:13px;line-height:1.6;overflow:auto;flex:1;"></div>
      </div>
      <div class="output-panel" id="panel-preview"><iframe id="preview-frame" sandbox="allow-scripts"></iframe></div>
      <div class="output-panel" id="panel-ast"><div id="ast-output"></div></div>
    </div>
  </div>

  <!-- ─── Sidebar ─────────────────────────────────── -->
  <div class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <h3 id="sidebar-title">Reference</h3>
      <button class="sidebar-close" id="sidebar-close">&#10005;</button>
    </div>
    <div class="sidebar-body" id="sidebar-body"></div>
    <div class="tutorial-nav" id="tutorial-nav" style="display:none;">
      <button class="btn" id="tut-prev">&#8592; Prev</button>
      <button class="btn btn-primary" id="tut-next">Next &#8594;</button>
    </div>
  </div>
</div>

<!-- ─── Status Bar ────────────────────────────────── -->
<div class="status-bar">
  <span id="status-compile"></span>
  <span id="status-size" style="color:var(--text-dim)"></span>
  <div class="spacer"></div>
  <span id="status-cursor">Ln 1, Col 1</span>
</div>

<!-- ─── Keyboard Shortcuts Modal ──────────────────── -->
<div class="modal-backdrop" id="shortcuts-modal">
  <div class="modal">
    <button class="modal-close" id="shortcuts-close">&#10005;</button>
    <h3>Keyboard Shortcuts</h3>
    <div class="shortcut-row"><span class="shortcut-desc">Run code</span><div class="shortcut-keys"><span class="shortcut-key">Cmd</span><span class="shortcut-key">Enter</span></div></div>
    <div class="shortcut-row"><span class="shortcut-desc">Command palette</span><div class="shortcut-keys"><span class="shortcut-key">Cmd</span><span class="shortcut-key">K</span></div></div>
    <div class="shortcut-row"><span class="shortcut-desc">Save to browser</span><div class="shortcut-keys"><span class="shortcut-key">Cmd</span><span class="shortcut-key">S</span></div></div>
    <div class="shortcut-row"><span class="shortcut-desc">Toggle reference</span><div class="shortcut-keys"><span class="shortcut-key">Cmd</span><span class="shortcut-key">Shift</span><span class="shortcut-key">R</span></div></div>
    <div class="shortcut-row"><span class="shortcut-desc">Toggle layout</span><div class="shortcut-keys"><span class="shortcut-key">Cmd</span><span class="shortcut-key">J</span></div></div>
    <div class="shortcut-row"><span class="shortcut-desc">Show shortcuts</span><div class="shortcut-keys"><span class="shortcut-key">Cmd</span><span class="shortcut-key">?</span></div></div>
    <div class="shortcut-row"><span class="shortcut-desc">Download .tova file</span><div class="shortcut-keys"><span class="shortcut-key">Cmd</span><span class="shortcut-key">Shift</span><span class="shortcut-key">S</span></div></div>
    <p style="margin-top:12px;font-size:11px;color:var(--text-dim)">On Windows/Linux, use Ctrl instead of Cmd</p>
  </div>
</div>

<!-- ─── Command Palette ──────────────────────────── -->
<div class="cmd-palette-backdrop" id="cmd-palette">
  <div class="cmd-palette">
    <input type="text" id="cmd-input" placeholder="Search examples, actions, reference..." autocomplete="off" />
    <div class="cmd-palette-results" id="cmd-results"></div>
  </div>
</div>

<!-- ─── LZString for sharing ─────────────────────── -->
<script src="https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js">${"</"}script>

<!-- ─── Inlined Tova Compiler & Runtime ───────────── -->
<script>
var RUNTIME_CODE = ${JSON.stringify(runtimeBundle)};
var STRING_PROTO_CODE = ${JSON.stringify(stringProto)};
var ARRAY_PROTO_CODE = ${JSON.stringify(arrayProto)};
var STDLIB_CODE = ${JSON.stringify(stdlib)};

// ─── Tova Compiler Bundle ────────────────────────────
${compilerBundle}
${"</"}script>

<!-- ─── CodeMirror shared dependency map ──────────── -->
<script type="importmap">
{
  "imports": {
    "codemirror": "https://esm.sh/*codemirror@6.0.1",
    "@codemirror/state": "https://esm.sh/*@codemirror/state@6.4.1",
    "@codemirror/view": "https://esm.sh/*@codemirror/view@6.26.0",
    "@codemirror/language": "https://esm.sh/*@codemirror/language@6.10.1",
    "@codemirror/commands": "https://esm.sh/*@codemirror/commands@6.3.3",
    "@codemirror/search": "https://esm.sh/*@codemirror/search@6.5.5",
    "@codemirror/autocomplete": "https://esm.sh/*@codemirror/autocomplete@6.12.0",
    "@codemirror/lint": "https://esm.sh/*@codemirror/lint@6.5.0",
    "@codemirror/theme-one-dark": "https://esm.sh/*@codemirror/theme-one-dark@6.1.2",
    "@lezer/common": "https://esm.sh/*@lezer/common@1.2.1",
    "@lezer/highlight": "https://esm.sh/*@lezer/highlight@1.2.0",
    "@lezer/lr": "https://esm.sh/*@lezer/lr@1.4.0",
    "crelt": "https://esm.sh/*crelt@1.0.6",
    "style-mod": "https://esm.sh/*style-mod@4.1.2",
    "w3c-keyname": "https://esm.sh/*w3c-keyname@2.2.8"
  }
}
${"</"}script>

<!-- ─── CodeMirror & App ─────────────────────────── -->
<script type="module">
import {basicSetup} from 'codemirror';
import {EditorState, StateField, StateEffect} from '@codemirror/state';
import {EditorView, keymap, Decoration} from '@codemirror/view';
import {StreamLanguage} from '@codemirror/language';
import {oneDark} from '@codemirror/theme-one-dark';
import {autocompletion} from '@codemirror/autocomplete';

// ─── Tova Syntax Highlighting ────────────────────────
const tovaLanguage = StreamLanguage.define({
  startState() { return { inComment: false, commentDepth: 0 }; },
  token(stream, state) {
    // Block comment (nestable)
    if (state.inComment) {
      if (stream.match('/*')) { state.commentDepth++; return 'blockComment'; }
      if (stream.match('*/')) { state.commentDepth--; if (state.commentDepth <= 0) { state.inComment = false; state.commentDepth = 0; } return 'blockComment'; }
      stream.next(); return 'blockComment';
    }
    // Docstring
    if (stream.match('///')) { stream.skipToEnd(); return 'docString'; }
    // Line comment
    if (stream.match('//')) { stream.skipToEnd(); return 'lineComment'; }
    // Block comment start
    if (stream.match('/*')) { state.inComment = true; state.commentDepth = 1; return 'blockComment'; }
    // Strings with interpolation
    if (stream.match('"')) {
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === '\\\\') { stream.next(); continue; }
        if (ch === '{') { return 'string'; }
        if (ch === '"') return 'string';
      }
      return 'string';
    }
    // Simple strings
    if (stream.match("'")) {
      while (!stream.eol()) { const ch = stream.next(); if (ch === '\\\\') { stream.next(); continue; } if (ch === "'") return 'string'; }
      return 'string';
    }
    // Braces (interpolation)
    if (stream.match('{')) return 'brace';
    if (stream.match('}')) return 'brace';
    // Numbers
    if (stream.match(/^0[xX][0-9a-fA-F]+/)) return 'number';
    if (stream.match(/^0[bB][01]+/)) return 'number';
    if (stream.match(/^\\d+\\.\\d+([eE][+-]?\\d+)?/)) return 'number';
    if (stream.match(/^\\d+([eE][+-]?\\d+)?/)) return 'number';
    // Multi-char operators
    if (stream.match('|>')) return 'operator';
    if (stream.match('=>')) return 'operator';
    if (stream.match('->')) return 'operator';
    if (stream.match('..=')) return 'operator';
    if (stream.match('...')) return 'operator';
    if (stream.match('..')) return 'operator';
    if (stream.match('?.')) return 'operator';
    if (stream.match('??')) return 'operator';
    if (stream.match('::')) return 'operator';
    if (stream.match('**')) return 'operator';
    if (stream.match(/^[+\\-*\\/%]=?/)) return 'operator';
    if (stream.match(/^[<>!=]=?/)) return 'operator';
    if (stream.match(/^&&|\\|\\|/)) return 'operator';
    if (stream.match('=')) return 'operator';
    // JSX close tag
    if (stream.match(/^<\\/[A-Za-z][A-Za-z0-9]*/)) { stream.match('>'); return 'tagName'; }
    // Identifiers and keywords
    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) {
      const w = stream.current();
      if (['fn','let','var','if','elif','else','for','while','in','not','and','or','match',
           'return','type','import','from','export','as','true','false','nil',
           'server','client','shared','state','computed','effect','component',
           'route','GET','POST','PUT','DELETE','PATCH'].includes(w)) return 'keyword';
      if (/^[A-Z]/.test(w)) return 'typeName';
      return 'variableName';
    }
    // JSX
    if (stream.match('/>')) return 'angleBracket';
    if (stream.peek() === '<' && /[A-Za-z]/.test(stream.string.charAt(stream.pos + 1) || '')) {
      stream.next(); return 'angleBracket';
    }
    stream.next();
    return null;
  }
});

// ─── Autocompletion ─────────────────────────────────
const tovaKeywords = [
  'fn', 'let', 'var', 'if', 'elif', 'else', 'for', 'while', 'match',
  'type', 'state', 'computed', 'effect', 'component', 'server', 'client',
  'shared', 'route', 'return', 'import', 'from', 'in', 'and', 'or', 'not',
  'true', 'false', 'nil', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'as', 'export'
];

const tovaStdlib = [
  { label: 'print', detail: '(...args)', info: 'Print values to console' },
  { label: 'len', detail: '(v)', info: 'Length of string, array, or object' },
  { label: 'range', detail: '(start?, end, step?)', info: 'Generate number array' },
  { label: 'sum', detail: '(arr)', info: 'Sum of array elements' },
  { label: 'min', detail: '(arr)', info: 'Minimum value in array' },
  { label: 'max', detail: '(arr)', info: 'Maximum value in array' },
  { label: 'sorted', detail: '(arr, key?)', info: 'Sort array (with optional key fn)' },
  { label: 'reversed', detail: '(arr)', info: 'Reverse array' },
  { label: 'enumerate', detail: '(arr)', info: 'Index-value pairs' },
  { label: 'zip', detail: '(...arrs)', info: 'Combine arrays element-wise' },
  { label: 'type_of', detail: '(v)', info: 'Runtime type name as string' },
  { label: 'filter', detail: '(arr, fn)', info: 'Filter array by predicate' },
  { label: 'map', detail: '(arr, fn)', info: 'Transform each element' },
  { label: 'flat_map', detail: '(arr, fn)', info: 'Map then flatten one level' },
  { label: 'any', detail: '(arr, fn)', info: 'True if any element matches' },
  { label: 'all', detail: '(arr, fn)', info: 'True if all elements match' },
];

const tovaSnippets = [
  { label: 'fn', detail: 'function', apply: 'fn name() {\\n  \\n}', boost: -1 },
  { label: 'for', detail: 'for-in loop', apply: 'for item in items {\\n  \\n}', boost: -1 },
  { label: 'match', detail: 'match expression', apply: 'match value {\\n  _ => \\n}', boost: -1 },
  { label: 'type', detail: 'type definition', apply: 'type Name {\\n  \\n}', boost: -1 },
  { label: 'client', detail: 'client block', apply: 'client {\\n  state count = 0\\n\\n  component App {\\n    <div>\\n      \\n    </div>\\n  }\\n}', boost: -1 },
  { label: 'component', detail: 'component', apply: 'component App {\\n  <div>\\n    \\n  </div>\\n}', boost: -1 },
  { label: 'server', detail: 'server block', apply: 'server {\\n  \\n}', boost: -1 },
  { label: 'effect', detail: 'side effect', apply: 'effect {\\n  \\n}', boost: -1 },
  { label: 'if', detail: 'conditional', apply: 'if condition {\\n  \\n}', boost: -1 },
  { label: 'while', detail: 'while loop', apply: 'while condition {\\n  \\n}', boost: -1 },
  { label: 'route', detail: 'HTTP route', apply: 'route GET "/path" => fn(req) {\\n  \\n}', boost: -1 },
];

function tovaCompletions(context) {
  const word = context.matchBefore(/[a-zA-Z_]\\w*/);
  if (!word && !context.explicit) return null;
  const from = word ? word.from : context.pos;
  const text = word ? word.text : '';

  const options = [];

  // Keywords
  for (const kw of tovaKeywords) {
    if (!text || kw.startsWith(text)) {
      // Check if there's a matching snippet
      const snippet = tovaSnippets.find(s => s.label === kw);
      if (snippet) {
        options.push({ label: kw, type: 'keyword', detail: snippet.detail, apply: snippet.apply, boost: 1 });
      } else {
        options.push({ label: kw, type: 'keyword', boost: 0 });
      }
    }
  }

  // Stdlib functions
  for (const fn of tovaStdlib) {
    if (!text || fn.label.startsWith(text)) {
      options.push({ label: fn.label, type: 'function', detail: fn.detail, info: fn.info, boost: 2 });
    }
  }

  return { from, options, filter: true };
}

// ─── Error Decorations ──────────────────────────────
const setErrorEffect = StateEffect.define();
const clearErrorEffect = StateEffect.define();

const errorLineDeco = Decoration.line({ class: 'cm-error-line' });

const errorField = StateField.define({
  create() { return Decoration.none; },
  update(decos, tr) {
    for (const e of tr.effects) {
      if (e.is(clearErrorEffect)) return Decoration.none;
      if (e.is(setErrorEffect)) {
        const lines = e.value;
        const ranges = [];
        for (const lineNum of lines) {
          try {
            const line = tr.state.doc.line(lineNum);
            ranges.push(errorLineDeco.range(line.from));
          } catch(ex) {}
        }
        return ranges.length ? Decoration.set(ranges) : Decoration.none;
      }
    }
    return decos;
  },
  provide: f => EditorView.decorations.from(f)
});

// ─── Data ───────────────────────────────────────────
const EXAMPLES = ${JSON.stringify(examples, null, 2)};
const REFERENCE = ${JSON.stringify(reference, null, 2)};
const TUTORIAL = ${JSON.stringify(tutorial, null, 2)};

// ─── State ──────────────────────────────────────────
let autoCompile = true;
let autoRun = true;
let sidebarMode = null; // 'reference' | 'tutorial' | null
let tutorialStep = 0;
let compileTimer = null;

// ─── Early embed mode detection ─────────────────────
const __isEmbed = new URLSearchParams(location.search).get('embed') === 'true';

// ─── Restore settings from localStorage ─────────────
try {
  const saved = JSON.parse(localStorage.getItem('tova-playground-settings') || '{}');
  if (saved.fontSize) document.documentElement.style.setProperty('--editor-font-size', saved.fontSize + 'px');
  if (saved.fontSize) document.getElementById('setting-fontsize').value = saved.fontSize;
  if (saved.autoCompile === false) { autoCompile = false; document.getElementById('setting-autocompile').classList.remove('on'); }
  if (saved.autoRun === false) { autoRun = false; document.getElementById('setting-autorun').classList.remove('on'); }
} catch(e) {}

function saveSettings() {
  try {
    localStorage.setItem('tova-playground-settings', JSON.stringify({
      fontSize: parseInt(document.getElementById('setting-fontsize').value),
      autoCompile,
      autoRun
    }));
  } catch(e) {}
}

// ─── Editor Setup ───────────────────────────────────
const statusCursor = document.getElementById('status-cursor');

// Restore last code or use first example (skip localStorage in embed mode)
let initialCode = EXAMPLES[0].code;
if (!__isEmbed) {
  try {
    const lastCode = localStorage.getItem('tova-playground-code');
    if (lastCode && lastCode.trim()) initialCode = lastCode;
  } catch(e) {}
}

const editor = new EditorView({
  state: EditorState.create({
    doc: initialCode,
    extensions: [
      basicSetup,
      oneDark,
      tovaLanguage,
      errorField,
      autocompletion({
        override: [tovaCompletions],
        icons: true,
        activateOnTyping: true,
      }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          try { localStorage.setItem('tova-playground-code', update.state.doc.toString()); } catch(e) {}
          if (autoCompile) scheduleCompile();
        }
        if (update.selectionSet) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          const lines = update.state.doc.lines;
          const chars = update.state.doc.length;
          statusCursor.textContent = 'Ln ' + line.number + ', Col ' + (pos - line.from + 1) + '  |  ' + lines + ' lines, ' + chars + ' chars';
        }
      }),
      keymap.of([
        { key: 'Mod-Enter', run: () => { compile(); return true; } },
        { key: 'Mod-k', run: () => { toggleCommandPalette(); return true; } },
        { key: 'Mod-s', run: () => {
          try { localStorage.setItem('tova-playground-code', editor.state.doc.toString()); } catch(e) {}
          const s = document.getElementById('status-compile');
          s.className = 'success'; s.textContent = 'Saved to browser';
          setTimeout(() => compile(), 1000);
          return true;
        }},
        { key: 'Mod-Shift-r', run: () => { toggleSidebar('reference'); return true; } },
        { key: 'Mod-Shift-s', run: () => { downloadCode(); return true; } },
        { key: 'Mod-/', run: () => { toggleModal('shortcuts-modal'); return true; } },
        { key: 'Mod-j', run: () => { toggleLayout(); return true; } },
      ]),
    ],
  }),
  parent: document.getElementById('editor'),
});

// ─── Populate Examples (with optgroups) ─────────────
const exSelect = document.getElementById('examples-select');
let optgroup = null;
let currentCat = null;
EXAMPLES.forEach((ex, i) => {
  if (ex.category !== currentCat) {
    currentCat = ex.category;
    optgroup = document.createElement('optgroup');
    optgroup.label = currentCat;
    exSelect.appendChild(optgroup);
  }
  const opt = document.createElement('option');
  opt.value = i;
  opt.textContent = ex.name;
  optgroup.appendChild(opt);
});
exSelect.addEventListener('change', () => {
  const code = EXAMPLES[+exSelect.value].code;
  setEditorCode(code);
  exSelect.value = '';
});

function setEditorCode(code) {
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: code } });
  compile();
}

// ─── Output Tabs ────────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll('#output-tabs .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.output-panel').forEach(p => p.classList.remove('active'));
  const tab = document.querySelector('#output-tabs .tab[data-tab="' + tabName + '"]');
  if (tab) tab.classList.add('active');
  const panel = document.getElementById('panel-' + tabName);
  if (panel) panel.classList.add('active');
}

document.querySelectorAll('#output-tabs .tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// ─── Drag Handle ────────────────────────────────────
const dragHandle = document.getElementById('drag-handle');
const mainEl = document.querySelector('.main');
const editorPane = document.querySelector('.pane-editor');
const outputPane = document.querySelector('.pane-output');

let dragging = false;
dragHandle.addEventListener('mousedown', e => { dragging = true; dragHandle.classList.add('active'); e.preventDefault(); });
document.addEventListener('mousemove', e => {
  if (!dragging) return;
  const rect = mainEl.getBoundingClientRect();
  const sidebarW = sidebarMode ? parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w')) : 0;
  const availW = rect.width - sidebarW;
  const pct = ((e.clientX - rect.left) / availW) * 100;
  const clamped = Math.max(20, Math.min(80, pct));
  editorPane.style.flex = 'none';
  editorPane.style.width = clamped + '%';
  outputPane.style.flex = '1';
});
document.addEventListener('mouseup', () => { dragging = false; dragHandle.classList.remove('active'); });

// ─── Share ──────────────────────────────────────────
document.getElementById('btn-share').addEventListener('click', () => {
  const code = editor.state.doc.toString();
  const compressed = LZString.compressToEncodedURIComponent(code);
  const url = location.origin + location.pathname + '#code=' + compressed;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('btn-share');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Share'; }, 2000);
  });
});

// ─── Download ───────────────────────────────────────
function downloadCode() {
  const code = editor.state.doc.toString();
  const blob = new Blob([code], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'playground.tova';
  a.click();
  URL.revokeObjectURL(a.href);
}
document.getElementById('btn-download').addEventListener('click', downloadCode);

// ─── Load from URL hash ─────────────────────────────
function loadFromHash() {
  const hash = location.hash.slice(1);
  if (hash.startsWith('code=')) {
    try {
      const code = LZString.decompressFromEncodedURIComponent(hash.slice(5));
      if (code) { setEditorCode(code); return true; }
    } catch (e) {}
  }
  return false;
}
loadFromHash();

// ─── Run Button ─────────────────────────────────────
document.getElementById('btn-run').addEventListener('click', compile);

// ─── Debounced Compile ──────────────────────────────
function scheduleCompile() {
  clearTimeout(compileTimer);
  compileTimer = setTimeout(compile, 350);
}

// ─── Compiler ───────────────────────────────────────
let lastJsText = '';

function compile() {
  const source = editor.state.doc.toString();
  const statusEl = document.getElementById('status-compile');
  const statusSize = document.getElementById('status-size');
  const errorBanner = document.getElementById('error-banner');
  const errorText = document.getElementById('error-text');
  const errorHint = document.getElementById('error-hint');
  const consoleOutput = document.getElementById('console-output');
  const consoleBadge = document.getElementById('console-badge');
  const consoleTimingEl = document.getElementById('console-timing');
  const astOutput = document.getElementById('ast-output');
  const previewFrame = document.getElementById('preview-frame');

  errorBanner.classList.remove('visible');
  errorText.textContent = '';
  if (errorHint) errorHint.textContent = '';
  consoleOutput.innerHTML = '';
  consoleBadge.style.display = 'none';

  // Clear error decorations
  editor.dispatch({ effects: clearErrorEffect.of(null) });

  const start = performance.now();

  try {
    const lexer = new Lexer(source, 'playground.tova');
    const tokens = lexer.tokenize();

    const parser = new Parser(tokens, 'playground.tova');
    const ast = parser.parse();

    const analyzer = new Analyzer(ast, 'playground.tova');
    const { warnings } = analyzer.analyze();

    const codegen = new CodeGenerator(ast, 'playground.tova');
    const result = codegen.generate();

    const elapsed = (performance.now() - start).toFixed(1);

    // JS Output
    let jsText = '';
    if (result.shared) jsText += '// ── Shared ──\\n' + result.shared + '\\n\\n';
    if (result.server) jsText += '// ── Server ──\\n' + result.server + '\\n\\n';
    if (result.client) jsText += '// ── Client ──\\n' + result.client + '\\n\\n';
    if (!result.shared && !result.server && !result.client && result.code) {
      jsText = result.code;
    }
    lastJsText = jsText || '// No output';

    // Update JS output (use CodeMirror read-only editor if available, else pre tag)
    if (window.jsEditor) {
      window.jsEditor.dispatch({ changes: { from: 0, to: window.jsEditor.state.doc.length, insert: lastJsText } });
    } else {
      document.getElementById('js-output').textContent = lastJsText;
    }

    // Status bar output size
    if (statusSize) statusSize.textContent = (lastJsText.length / 1024).toFixed(1) + ' KB output';

    // AST
    astOutput.innerHTML = '';
    astOutput.appendChild(renderAST(ast));

    // Console + Preview
    if (autoRun) {
      executeCode(result, consoleOutput, previewFrame, consoleBadge, consoleTimingEl);
    }

    // Warnings
    const warnCount = warnings ? warnings.length : 0;
    if (warnCount) {
      for (const w of warnings) {
        const div = document.createElement('div');
        div.className = 'log-warn';
        div.innerHTML = '<span class="log-icon">\\u26A0</span> Warning: ' + escapeHtml(w.message || String(w));
        consoleOutput.appendChild(div);
      }
    }

    statusEl.className = 'success';
    statusEl.textContent = '\\u2713 Compiled in ' + elapsed + 'ms' + (warnCount ? ' (' + warnCount + ' warning' + (warnCount > 1 ? 's' : '') + ')' : '');

  } catch (err) {
    const elapsed = (performance.now() - start).toFixed(1);
    statusEl.className = 'error';
    statusEl.textContent = '\\u2717 Error (' + elapsed + 'ms)';
    errorText.textContent = err.message;

    // Error hints for common mistakes
    const hints = getErrorHint(err.message);
    if (errorHint && hints) errorHint.textContent = hints;

    errorBanner.classList.add('visible');
    if (window.jsEditor) {
      window.jsEditor.dispatch({ changes: { from: 0, to: window.jsEditor.state.doc.length, insert: '// Compilation error\\n// ' + err.message } });
    } else {
      document.getElementById('js-output').textContent = '// Compilation error\\n// ' + err.message;
    }
    previewFrame.srcdoc = '';

    // Highlight error line in editor with decorations
    const lineMatch = err.message.match(/:(\\d+):/);
    if (lineMatch) {
      const lineNum = parseInt(lineMatch[1]);
      editor.dispatch({ effects: setErrorEffect.of([lineNum]) });
      // Scroll to error line
      try {
        const lineInfo = editor.state.doc.line(lineNum);
        editor.dispatch({ selection: { anchor: lineInfo.from } });
      } catch(e) {}
    }
  }
}

function getErrorHint(msg) {
  if (msg.includes('Unexpected token')) return 'Tip: Check for missing closing brackets or semicolons';
  if (msg.includes('not defined')) return 'Tip: Make sure the variable is declared before use';
  if (msg.includes('Expected')) return 'Tip: The compiler expected a different token here';
  return null;
}

// ─── Execute Code ───────────────────────────────────
function executeCode(result, consoleEl, previewFrame, consoleBadge, consoleTimingEl) {
  const logs = [];
  const fakeConsole = {
    log: (...args) => logs.push({ type: 'log', args }),
    warn: (...args) => logs.push({ type: 'warn', args }),
    error: (...args) => logs.push({ type: 'error', args }),
    info: (...args) => logs.push({ type: 'info', args }),
  };

  const execStart = performance.now();
  const codeToRun = result.code || result.shared || '';
  if (codeToRun.trim()) {
    try {
      const fn = new Function('console', STDLIB_CODE + '\\n' + STRING_PROTO_CODE + '\\n' + ARRAY_PROTO_CODE + '\\n' + codeToRun);
      fn(fakeConsole);
    } catch (e) {
      logs.push({ type: 'error', args: ['Runtime Error: ' + e.message] });
    }
  }
  const execTime = (performance.now() - execStart).toFixed(2);

  if (consoleTimingEl) consoleTimingEl.textContent = 'Executed in ' + execTime + 'ms';

  // Render logs with icons and better formatting
  const icons = { log: '\\u203A', warn: '\\u26A0', error: '\\u2717', info: '\\u2139' };
  let errorCount = 0;
  for (const log of logs) {
    const div = document.createElement('div');
    div.className = 'log-' + log.type;
    const icon = document.createElement('span');
    icon.className = 'log-icon';
    icon.textContent = icons[log.type] || '';
    div.appendChild(icon);
    const content = document.createElement('span');
    content.className = 'log-content';
    const textParts = log.args.map(a => {
      if (a === null) return 'null';
      if (a === undefined) return 'undefined';
      if (typeof a === 'object') {
        try { return JSON.stringify(a, null, 2); } catch(e) { return String(a); }
      }
      return String(a);
    });
    content.textContent = textParts.join(' ');
    div.appendChild(content);
    consoleEl.appendChild(div);
    if (log.type === 'error') errorCount++;
  }

  // Badge for errors
  if (errorCount > 0) {
    consoleBadge.textContent = errorCount;
    consoleBadge.style.display = 'inline';
    switchTab('console');
  }

  // Auto-switch to console if there are logs and no client code
  if (logs.length > 0 && !result.client) {
    switchTab('console');
  }

  // Live Preview for client code
  if (result.client) {
    const clientCode = result.client
      .replace(/import\\s+.*from\\s+['"].*['"];?/g, '')
      .replace(/import\\s+['"].*['"];?/g, '');

    const previewCSS = '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }' +
      'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 20px; color: #333; }' +
      'button { cursor: pointer; padding: 8px 16px; margin: 4px; border-radius: 6px; border: 1px solid #ddd; background: #f5f5f5; font-size: 14px; transition: all 0.15s; }' +
      'button:hover { background: #e8e8e8; border-color: #ccc; }' +
      'button:active { transform: scale(0.97); }' +
      'input[type="text"], input[type="number"] { padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; margin: 4px; font-size: 14px; outline: none; }' +
      'input[type="text"]:focus, input[type="number"]:focus { border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124,58,237,0.1); }' +
      'input[type="range"] { width: 200px; margin: 8px 0; }' +
      'input[type="checkbox"] { margin: 4px 8px 4px 0; }' +
      'ul { list-style: none; } li { padding: 6px 0; }' +
      'h1 { margin-bottom: 16px; font-size: 24px; } h2 { margin-bottom: 12px; font-size: 20px; }' +
      'p { margin: 6px 0; line-height: 1.5; }' +
      '.status { color: #666; font-size: 14px; margin-top: 12px; }' +
      '.counter-app, .todo-app, .converter, .stopwatch { max-width: 400px; }' +
      '.count { font-size: 48px; font-weight: 700; color: #7c3aed; }' +
      '.buttons { display: flex; gap: 4px; margin-top: 8px; }' +
      '.input-row { display: flex; gap: 4px; margin-bottom: 12px; }' +
      '.input-row input { flex: 1; }' +
      '.todo-item { display: flex; align-items: center; gap: 8px; }' +
      '.todo-text { flex: 1; }' +
      '.input-group { margin: 12px 0; }' +
      '.input-group label { display: block; font-weight: 600; margin-bottom: 4px; }' +
      '.value { font-size: 18px; font-weight: 600; color: #7c3aed; margin-left: 8px; }' +
      '.desc { font-style: italic; color: #666; }' +
      '.time { font-size: 48px; font-weight: 700; color: #7c3aed; margin: 16px 0; }' +
      '.controls { display: flex; gap: 4px; flex-wrap: wrap; }' +
      '.hint { color: #999; font-size: 12px; margin-top: 12px; }';

    const sharedCode = (result.shared || '').replace(/import\\s+.*from\\s+['"].*['"];?/g, '');

    // Build preview HTML using string concatenation — NOT a template literal.
    // Generated client code may contain backticks (JS template strings from
    // string interpolation) which would break a template-literal wrapper.
    const previewHTML = '<!DOCTYPE html>\\n<html><head><meta charset="UTF-8">\\n<style>' + previewCSS + '</style>\\n</head><body>\\n' +
      '<div id="app"></div>\\n<script>\\n' +
      RUNTIME_CODE + '\\n' +
      STDLIB_CODE + '\\n' +
      STRING_PROTO_CODE + '\\n' +
      ARRAY_PROTO_CODE + '\\n' +
      'function rpc(name, args) { console.warn("[Playground] server." + name + "() is not available in playground mode"); return Promise.resolve(null); }\\n' +
      sharedCode + '\\n' +
      clientCode + '\\n' +
      'if (typeof App === "function") {' +
      '  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", function() { mount(App, document.getElementById("app")); }); }' +
      '  else { mount(App, document.getElementById("app")); }' +
      '}\\n' +
      '<\\/script>\\n</body></html>';
    previewFrame.srcdoc = previewHTML;
    // Auto-switch to preview when there's a client block
    switchTab('preview');
  } else {
    previewFrame.srcdoc = '<html><body style="font-family:sans-serif;padding:20px;color:#aaa"><p>Write a <code>client { }</code> block with a <code>component App</code> to see a live preview here.</p></body></html>';
  }
}

// ─── AST Renderer ───────────────────────────────────
function renderAST(node, depth = 0) {
  if (node === null || node === undefined) {
    const span = document.createElement('span');
    span.className = 'ast-null'; span.textContent = 'null'; return span;
  }
  if (typeof node !== 'object') {
    const span = document.createElement('span');
    if (typeof node === 'string') { span.className = 'ast-string'; span.textContent = '"' + node + '"'; }
    else if (typeof node === 'number') { span.className = 'ast-number'; span.textContent = String(node); }
    else if (typeof node === 'boolean') { span.className = 'ast-bool'; span.textContent = String(node); }
    else { span.textContent = String(node); }
    return span;
  }
  if (Array.isArray(node)) {
    if (node.length === 0) { const s = document.createElement('span'); s.className = 'ast-null'; s.textContent = '[]'; return s; }
    const c = document.createElement('div'); c.className = 'ast-node';
    const t = document.createElement('span'); t.className = 'ast-toggle' + (depth < 2 ? ' open' : '');
    t.textContent = 'Array[' + node.length + ']';
    const ch = document.createElement('div'); ch.className = 'ast-children' + (depth < 2 ? ' open' : '');
    t.addEventListener('click', () => { t.classList.toggle('open'); ch.classList.toggle('open'); });
    for (let i = 0; i < node.length; i++) {
      const r = document.createElement('div'); r.className = 'ast-node';
      const k = document.createElement('span'); k.className = 'ast-key'; k.textContent = i + ': ';
      r.appendChild(k); r.appendChild(renderAST(node[i], depth + 1)); ch.appendChild(r);
    }
    c.appendChild(t); c.appendChild(ch); return c;
  }
  const container = document.createElement('div'); container.className = 'ast-node';
  const typeName = node.constructor?.name || 'Object';
  const keys = Object.keys(node).filter(k => k !== 'line' && k !== 'column');
  if (keys.length === 0) { const s = document.createElement('span'); s.className = 'ast-type'; s.textContent = typeName; container.appendChild(s); return container; }
  const toggle = document.createElement('span'); toggle.className = 'ast-toggle' + (depth < 2 ? ' open' : '');
  const typeSpan = document.createElement('span'); typeSpan.className = 'ast-type'; typeSpan.textContent = typeName;
  toggle.appendChild(typeSpan);
  const children = document.createElement('div'); children.className = 'ast-children' + (depth < 2 ? ' open' : '');
  toggle.addEventListener('click', () => { toggle.classList.toggle('open'); children.classList.toggle('open'); });
  for (const key of keys) {
    const row = document.createElement('div'); row.className = 'ast-node';
    const keySpan = document.createElement('span'); keySpan.className = 'ast-key'; keySpan.textContent = key + ': ';
    row.appendChild(keySpan); row.appendChild(renderAST(node[key], depth + 1)); children.appendChild(row);
  }
  container.appendChild(toggle); container.appendChild(children);
  return container;
}

// ─── Sidebar (Reference / Tutorial) ─────────────────
const sidebar = document.getElementById('sidebar');
const sidebarBody = document.getElementById('sidebar-body');
const sidebarTitle = document.getElementById('sidebar-title');
const tutorialNav = document.getElementById('tutorial-nav');

function toggleSidebar(mode) {
  if (sidebarMode === mode) {
    sidebar.classList.remove('open');
    sidebarMode = null;
    document.getElementById('btn-reference').classList.remove('active');
    document.getElementById('btn-tutorial').classList.remove('active');
    return;
  }
  sidebarMode = mode;
  sidebar.classList.add('open');

  document.getElementById('btn-reference').classList.toggle('active', mode === 'reference');
  document.getElementById('btn-tutorial').classList.toggle('active', mode === 'tutorial');

  if (mode === 'reference') {
    sidebarTitle.textContent = 'Tova Reference';
    tutorialNav.style.display = 'none';
    renderReference();
  } else if (mode === 'tutorial') {
    sidebarTitle.textContent = 'Learn Tova';
    tutorialNav.style.display = 'flex';
    renderTutorialStep();
  }
}

function renderTutorialStep() {
  sidebarBody.innerHTML = '';
  const step = TUTORIAL[tutorialStep];
  if (!step) return;

  // Progress dots
  const progress = document.createElement('div');
  progress.className = 'tutorial-progress';
  for (let i = 0; i < TUTORIAL.length; i++) {
    const dot = document.createElement('div');
    dot.className = 'tutorial-dot' + (i === tutorialStep ? ' active' : '') + (i < tutorialStep ? ' completed' : '');
    dot.addEventListener('click', () => { tutorialStep = i; renderTutorialStep(); });
    progress.appendChild(dot);
  }
  sidebarBody.appendChild(progress);

  const div = document.createElement('div');
  div.className = 'tutorial-step';
  div.innerHTML = '<h4>' + (tutorialStep + 1) + '. ' + escapeHtml(step.title) + '</h4>'
    + '<p>' + escapeHtml(step.description) + '</p>';
  const tryBtn = document.createElement('button');
  tryBtn.className = 'try-btn';
  tryBtn.textContent = '\\u25B6 Try this code';
  tryBtn.addEventListener('click', () => { setEditorCode(step.code); });
  div.appendChild(tryBtn);
  sidebarBody.appendChild(div);

  // Update nav buttons
  document.getElementById('tut-prev').disabled = tutorialStep === 0;
  document.getElementById('tut-next').textContent = tutorialStep === TUTORIAL.length - 1 ? 'Finish \\u2713' : 'Next \\u2192';
}

document.getElementById('btn-reference').addEventListener('click', () => toggleSidebar('reference'));
document.getElementById('btn-tutorial').addEventListener('click', () => toggleSidebar('tutorial'));
document.getElementById('sidebar-close').addEventListener('click', () => toggleSidebar(sidebarMode));

document.getElementById('tut-prev').addEventListener('click', () => {
  if (tutorialStep > 0) { tutorialStep--; renderTutorialStep(); }
});
document.getElementById('tut-next').addEventListener('click', () => {
  if (tutorialStep < TUTORIAL.length - 1) { tutorialStep++; renderTutorialStep(); }
  else { toggleSidebar('tutorial'); }
});

// ─── Settings ───────────────────────────────────────
document.getElementById('btn-settings').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('settings-dropdown').classList.toggle('visible');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#settings-dropdown') && !e.target.closest('#btn-settings')) {
    document.getElementById('settings-dropdown').classList.remove('visible');
  }
});
document.getElementById('setting-fontsize').addEventListener('change', (e) => {
  document.documentElement.style.setProperty('--editor-font-size', e.target.value + 'px');
  saveSettings();
});
document.getElementById('setting-autocompile').addEventListener('click', function() {
  autoCompile = !autoCompile;
  this.classList.toggle('on', autoCompile);
  saveSettings();
});
document.getElementById('setting-autorun').addEventListener('click', function() {
  autoRun = !autoRun;
  this.classList.toggle('on', autoRun);
  saveSettings();
});

// ─── Keyboard Shortcuts Modal ───────────────────────
function toggleModal(id) {
  document.getElementById(id).classList.toggle('visible');
}
document.getElementById('btn-shortcuts').addEventListener('click', () => toggleModal('shortcuts-modal'));
document.getElementById('shortcuts-close').addEventListener('click', () => toggleModal('shortcuts-modal'));
document.getElementById('shortcuts-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) toggleModal('shortcuts-modal');
});

// ─── Error banner click → jump to error line ────────
document.getElementById('error-banner').addEventListener('click', () => {
  const text = document.getElementById('error-text').textContent;
  const lineMatch = text.match(/:(\\d+):/);
  if (lineMatch) {
    const line = parseInt(lineMatch[1]);
    try {
      const lineInfo = editor.state.doc.line(line);
      editor.dispatch({ selection: { anchor: lineInfo.from } });
      editor.focus();
    } catch(e) {}
  }
});

// ─── JS Output Editor (read-only CodeMirror) ────────
try {
  const jsEditorParent = document.getElementById('js-output-editor');
  if (jsEditorParent) {
    window.jsEditor = new EditorView({
      state: EditorState.create({
        doc: '// Compiled JS output will appear here',
        extensions: [
          basicSetup,
          oneDark,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
        ],
      }),
      parent: jsEditorParent,
    });
  }
} catch(e) { console.warn('JS output editor init failed:', e); }

// ─── Console Buttons ────────────────────────────────
document.getElementById('btn-clear-console').addEventListener('click', () => {
  document.getElementById('console-output').innerHTML = '';
  document.getElementById('console-timing').textContent = '';
  const badge = document.getElementById('console-badge');
  badge.style.display = 'none';
});

document.getElementById('btn-copy-console').addEventListener('click', () => {
  const text = document.getElementById('console-output').innerText;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-copy-console');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });
});

// ─── Command Palette ────────────────────────────────
let cmdPaletteOpen = false;
let cmdSelectedIndex = 0;

function getCommandItems(query) {
  const q = query.toLowerCase();
  const items = [];

  // Actions
  const actions = [
    { icon: '\\u25B6', label: 'Run Code', category: 'Action', shortcut: '\\u2318Enter', action: () => compile() },
    { icon: '\\u2197', label: 'Share URL', category: 'Action', action: () => document.getElementById('btn-share').click() },
    { icon: '\\u2913', label: 'Download .tova', category: 'Action', shortcut: '\\u2318\\u21E7S', action: () => downloadCode() },
    { icon: '\\uD83D\\uDCE4', label: 'Export as HTML', category: 'Action', action: () => exportAsHTML() },
    { icon: '\\uD83D\\uDCD6', label: 'Toggle Reference', category: 'Action', shortcut: '\\u2318\\u21E7R', action: () => toggleSidebar('reference') },
    { icon: '\\uD83C\\uDF93', label: 'Start Tutorial', category: 'Action', action: () => toggleSidebar('tutorial') },
    { icon: '\\u2699', label: 'Toggle Light Theme', category: 'Action', action: () => document.getElementById('setting-theme').click() },
    { icon: '\\u2B12', label: 'Toggle Layout', category: 'Action', shortcut: '\\u2318J', action: () => toggleLayout() },
  ];

  for (const a of actions) {
    if (!q || a.label.toLowerCase().includes(q)) items.push(a);
  }

  // Examples
  for (let i = 0; i < EXAMPLES.length; i++) {
    const ex = EXAMPLES[i];
    if (!q || ex.name.toLowerCase().includes(q) || ex.category.toLowerCase().includes(q)) {
      items.push({
        icon: '\\uD83D\\uDCC4',
        label: ex.name,
        category: ex.category,
        action: () => { setEditorCode(ex.code); }
      });
    }
  }

  // Reference sections
  for (const section of REFERENCE) {
    if (!q || section.title.toLowerCase().includes(q)) {
      items.push({
        icon: '\\uD83D\\uDD0D',
        label: section.title,
        category: 'Reference',
        action: () => { toggleSidebar('reference'); }
      });
    }
  }

  return items;
}

function renderCommandPalette(query) {
  const results = document.getElementById('cmd-results');
  const items = getCommandItems(query || '');
  results.innerHTML = '';
  cmdSelectedIndex = 0;

  if (items.length === 0) {
    results.innerHTML = '<div class="cmd-palette-empty">No results found</div>';
    return;
  }

  items.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'cmd-palette-item' + (i === 0 ? ' selected' : '');
    div.innerHTML = '<span class="cmd-icon">' + item.icon + '</span>'
      + '<span class="cmd-label">' + escapeHtml(item.label) + '</span>'
      + '<span class="cmd-category">' + escapeHtml(item.category) + '</span>'
      + (item.shortcut ? '<span class="cmd-shortcut">' + item.shortcut + '</span>' : '');
    div.addEventListener('click', () => { item.action(); closeCommandPalette(); });
    div.addEventListener('mouseenter', () => {
      results.querySelectorAll('.cmd-palette-item').forEach(el => el.classList.remove('selected'));
      div.classList.add('selected');
      cmdSelectedIndex = i;
    });
    results.appendChild(div);
  });

  window._cmdItems = items;
}

function toggleCommandPalette() {
  if (cmdPaletteOpen) { closeCommandPalette(); return; }
  cmdPaletteOpen = true;
  document.getElementById('cmd-palette').classList.add('visible');
  const input = document.getElementById('cmd-input');
  input.value = '';
  renderCommandPalette('');
  input.focus();
}

function closeCommandPalette() {
  cmdPaletteOpen = false;
  document.getElementById('cmd-palette').classList.remove('visible');
  editor.focus();
}

document.getElementById('cmd-input').addEventListener('input', (e) => {
  renderCommandPalette(e.target.value);
});

document.getElementById('cmd-input').addEventListener('keydown', (e) => {
  const results = document.getElementById('cmd-results');
  const items = results.querySelectorAll('.cmd-palette-item');
  if (e.key === 'Escape') { closeCommandPalette(); e.preventDefault(); return; }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    cmdSelectedIndex = Math.min(cmdSelectedIndex + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('selected', i === cmdSelectedIndex));
    items[cmdSelectedIndex]?.scrollIntoView({ block: 'nearest' });
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    cmdSelectedIndex = Math.max(cmdSelectedIndex - 1, 0);
    items.forEach((el, i) => el.classList.toggle('selected', i === cmdSelectedIndex));
    items[cmdSelectedIndex]?.scrollIntoView({ block: 'nearest' });
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (window._cmdItems && window._cmdItems[cmdSelectedIndex]) {
      window._cmdItems[cmdSelectedIndex].action();
      closeCommandPalette();
    }
  }
});

document.getElementById('cmd-palette').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeCommandPalette();
});

// Global Cmd+K for command palette
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    toggleCommandPalette();
  }
  if (e.key === 'Escape' && cmdPaletteOpen) {
    closeCommandPalette();
  }
});

// ─── Layout Toggle ──────────────────────────────────
let layoutVertical = false;
try {
  layoutVertical = localStorage.getItem('tova-playground-layout') === 'vertical';
} catch(e) {}

function toggleLayout() {
  layoutVertical = !layoutVertical;
  document.querySelector('.main').classList.toggle('vertical', layoutVertical);
  try { localStorage.setItem('tova-playground-layout', layoutVertical ? 'vertical' : 'horizontal'); } catch(e) {}
}

// Apply saved layout
if (layoutVertical) document.querySelector('.main').classList.add('vertical');

document.getElementById('btn-layout').addEventListener('click', toggleLayout);

// ─── Theme Toggle ───────────────────────────────────
let lightTheme = false;
try { lightTheme = localStorage.getItem('tova-playground-theme') === 'light'; } catch(e) {}

function applyTheme() {
  document.body.classList.toggle('light-theme', lightTheme);
  document.getElementById('setting-theme').classList.toggle('on', lightTheme);
}

document.getElementById('setting-theme').addEventListener('click', function() {
  lightTheme = !lightTheme;
  applyTheme();
  try { localStorage.setItem('tova-playground-theme', lightTheme ? 'light' : 'dark'); } catch(e) {}
  saveSettings();
});

applyTheme();

// ─── Export as HTML ─────────────────────────────────
function exportAsHTML() {
  if (!lastJsText || lastJsText.startsWith('// No output') || lastJsText.startsWith('// Compilation')) {
    alert('Nothing to export — compile your code first.');
    return;
  }
  const source = editor.state.doc.toString();
  const hasClient = source.includes('client {') || source.includes('client{');

  let exportHTML;
  if (hasClient) {
    // Export client app as standalone HTML
    try {
      const lexer = new Lexer(source, 'export.tova');
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, 'export.tova');
      const ast = parser.parse();
      const analyzer = new Analyzer(ast, 'export.tova');
      analyzer.analyze();
      const codegen = new CodeGenerator(ast, 'export.tova');
      const result = codegen.generate();
      const clientCode = (result.client || '').replace(/import\\s+.*from\\s+['"].*['"];?/g, '');
      exportHTML = '<!DOCTYPE html>\\n<html><head><meta charset="UTF-8"><title>Tova App</title>\\n'
        + '<style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}'
        + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:20px;color:#333}'
        + 'button{cursor:pointer;padding:8px 16px;margin:4px;border-radius:6px;border:1px solid #ddd;background:#f5f5f5;font-size:14px}'
        + 'input[type="text"],input[type="number"]{padding:8px 12px;border:1px solid #ddd;border-radius:6px;margin:4px;font-size:14px}'
        + '</style></head><body><div id="app"></div>\\n<script>\\n'
        + RUNTIME_CODE + '\\n' + STDLIB_CODE + '\\n' + STRING_PROTO_CODE + '\\n' + ARRAY_PROTO_CODE + '\\n'
        + (result.shared || '').replace(/import\\s+.*from\\s+['"].*['"];?/g, '') + '\\n'
        + clientCode + '\\n'
        + 'if(typeof App==="function"){mount(App,document.getElementById("app"));}\\n'
        + '<\\/script></body></html>';
    } catch(e) {
      exportHTML = '<!-- Export failed: ' + e.message + ' -->';
    }
  } else {
    // Export as Node/Bun script
    exportHTML = '// Generated by Tova Playground\\n' + STDLIB_CODE + '\\n' + lastJsText;
  }

  const blob = new Blob([exportHTML], { type: hasClient ? 'text/html' : 'text/javascript' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = hasClient ? 'tova-app.html' : 'tova-output.js';
  a.click();
  URL.revokeObjectURL(a.href);
}

document.getElementById('btn-export').addEventListener('click', exportAsHTML);

// ─── Embed Mode ─────────────────────────────────────
if (__isEmbed) {
  document.body.classList.add('embed-mode');
}

// ─── Theme query param override ─────────────────────
const __themeParam = new URLSearchParams(location.search).get('theme');
if (__themeParam === 'light' || __themeParam === 'dark') {
  lightTheme = __themeParam === 'light';
  applyTheme();
}

// ─── postMessage listener for parent integration ────
window.addEventListener('message', function(e) {
  if (!e.data || typeof e.data !== 'object') return;
  if (e.data.type === 'tova-playground-theme') {
    const t = e.data.theme;
    if (t === 'light' || t === 'dark') {
      lightTheme = t === 'light';
      applyTheme();
    }
  } else if (e.data.type === 'tova-playground-set-code') {
    if (typeof e.data.code === 'string') {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: e.data.code }
      });
    }
  }
});

// ─── Reference Search & Runnable Snippets ───────────
function renderReference() {
  sidebarBody.innerHTML = '';

  // Search box
  const searchBox = document.createElement('input');
  searchBox.type = 'text';
  searchBox.placeholder = 'Search reference...';
  searchBox.style.cssText = 'width:calc(100% - 28px);margin:8px 14px;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;outline:none;font-family:var(--font-sans);';
  searchBox.addEventListener('input', () => renderRefSections(searchBox.value));
  sidebarBody.appendChild(searchBox);

  const container = document.createElement('div');
  container.id = 'ref-container';
  sidebarBody.appendChild(container);

  renderRefSections('');
}

function renderRefSections(query) {
  const container = document.getElementById('ref-container');
  if (!container) return;
  container.innerHTML = '';
  const q = query.toLowerCase();

  for (const section of REFERENCE) {
    const matchingItems = section.items.filter(item =>
      !q || section.title.toLowerCase().includes(q) || item.syntax.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q)
    );
    if (matchingItems.length === 0) continue;

    const div = document.createElement('div');
    div.className = 'ref-section';
    const title = document.createElement('div');
    title.className = 'ref-title' + (q ? ' open' : '');
    title.textContent = section.title;
    const items = document.createElement('div');
    items.className = 'ref-items' + (q ? ' open' : '');
    for (const item of matchingItems) {
      const row = document.createElement('div');
      row.className = 'ref-item';
      row.style.cursor = 'pointer';
      row.innerHTML = '<code>' + escapeHtml(item.syntax) + '</code><span class="ref-desc"> \\u2014 ' + escapeHtml(item.desc) + '</span>';
      row.title = 'Click to insert into editor';
      row.addEventListener('click', () => {
        // Insert the syntax at cursor position
        const pos = editor.state.selection.main.head;
        editor.dispatch({ changes: { from: pos, insert: item.syntax } });
        editor.focus();
      });
      items.appendChild(row);
    }
    title.addEventListener('click', () => { title.classList.toggle('open'); items.classList.toggle('open'); });
    div.appendChild(title);
    div.appendChild(items);
    container.appendChild(div);
  }

  // Open first two sections by default when no search
  if (!q) {
    const titles = container.querySelectorAll('.ref-title');
    const itemSections = container.querySelectorAll('.ref-items');
    if (titles[0]) { titles[0].classList.add('open'); itemSections[0].classList.add('open'); }
    if (titles[1]) { titles[1].classList.add('open'); itemSections[1].classList.add('open'); }
  }
}

// ─── Welcome Toast ──────────────────────────────────
if (!localStorage.getItem('tova-playground-welcomed')) {
  const toast = document.createElement('div');
  toast.className = 'welcome-toast';
  toast.innerHTML = 'Welcome! Try the <strong style="color:var(--accent);margin:0 2px">Learn</strong> button, or press <span class="kbd-hint">Cmd+Enter</span> to run code. <button class="close-toast" aria-label="Close">\\u2715</button>';
  document.querySelector('.pane-editor').appendChild(toast);
  toast.querySelector('.close-toast').addEventListener('click', () => { toast.remove(); localStorage.setItem('tova-playground-welcomed', '1'); });
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 15000);
  localStorage.setItem('tova-playground-welcomed', '1');
}

// ─── Utility ────────────────────────────────────────
function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ─── Initial Compile ────────────────────────────────
compile();
${"</"}script>
</body>
</html>`;
}

// ─── Main ───────────────────────────────────────────
console.log('Building Tova Playground...');

const compilerBundle = buildCompilerBundle();
console.log('  Compiler bundle: ' + (compilerBundle.length / 1024).toFixed(1) + ' KB');

const runtimeBundle = buildRuntimeBundle();
console.log('  Runtime bundle: ' + (runtimeBundle.length / 1024).toFixed(1) + ' KB');

const stringProto = buildStringProto();
const arrayProto = buildArrayProto();
const stdlib = getStdlib();
const examples = getExamples();
const reference = getReference();
const tutorial = getTutorial();

console.log('  Examples: ' + examples.length + ' (in ' + [...new Set(examples.map(e => e.category))].length + ' categories)');
console.log('  Reference sections: ' + reference.length);
console.log('  Tutorial steps: ' + tutorial.length);

const html = generateHTML(compilerBundle, runtimeBundle, stringProto, arrayProto, stdlib, examples, reference, tutorial);
const outPath = resolve(import.meta.dir, 'index.html');
writeFileSync(outPath, html);

console.log('  Output: ' + outPath + ' (' + (html.length / 1024).toFixed(1) + ' KB)');
console.log('Done! Open playground/index.html in a browser.');
