// Lux string methods
(function() {
  const m = {
    upper() { return this.toUpperCase(); },
    lower() { return this.toLowerCase(); },
    contains(s) { return this.includes(s); },
    starts_with(s) { return this.startsWith(s); },
    ends_with(s) { return this.endsWith(s); },
    chars() { return [...this]; },
    words() { return this.split(/\s+/).filter(Boolean); },
    lines() { return this.split('\n'); },
    capitalize() { return this.length ? this.charAt(0).toUpperCase() + this.slice(1) : this; },
    title_case() { return this.replace(/\b\w/g, c => c.toUpperCase()); },
    snake_case() { return this.replace(/[-\s]+/g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/^_/, ''); },
    camel_case() { return this.replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '').replace(/^[A-Z]/, c => c.toLowerCase()); },
  };
  for (const [n, fn] of Object.entries(m)) {
    if (!String.prototype[n]) Object.defineProperty(String.prototype, n, { value: fn, writable: true, configurable: true });
  }
})();
function __contains(col, val) {
  if (Array.isArray(col) || typeof col === 'string') return col.includes(val);
  if (col instanceof Set || col instanceof Map) return col.has(val);
  if (typeof col === 'object' && col !== null) return val in col;
  return false;
}
const name = "Lux";
const version = 1;
print(`Welcome to ${name} v${version}!`);
let counter = 0;
counter += 10;
counter -= 3;
print(`Counter: ${counter}`);
function factorial(n) {
  if ((n <= 1)) {
    1;
  } else {
    (n * factorial((n - 1)));
  }
}
function fibonacci(n) {
  if ((n <= 0)) {
    0;
  } else if ((n == 1)) {
    1;
  } else {
    (fibonacci((n - 1)) + fibonacci((n - 2)));
  }
}
function greet(who = "World") {
  return `Hello, ${who}!`;
}
print(`5! = ${factorial(5)}`);
print(`fib(10) = ${fibonacci(10)}`);
print(greet());
print(greet("Lux"));
function classify(n) {
  return ((__match) => {
    if (__match === 0) {
      return "zero";
    }
    else if (__match >= 1 && __match < 10) {
      return `small (${n})`;
    }
    else if (((n) => (n < 0))(__match)) {
      const n = __match;
      return `negative (${n})`;
    }
    else if (((n) => (n >= 100))(__match)) {
      const n = __match;
      return `big (${n})`;
    }
    return `medium (${n})`;
  })(n);
}
print(classify(0));
print(classify(5));
print(classify((-3)));
print(classify(150));
print(classify(42));
function Circle(radius) { return Object.freeze({ __tag: "Circle", radius }); }
function Rectangle(w, h) { return Object.freeze({ __tag: "Rectangle", w, h }); }
function Triangle(base, height) { return Object.freeze({ __tag: "Triangle", base, height }); }
function area(shape) {
  return ((__match) => {
    if (__match?.__tag === "Circle") {
      const r = __match.r;
      return ((3.14159 * r) * r);
    }
    else if (__match?.__tag === "Rectangle") {
      const w = __match.w;
      const h = __match.h;
      return (w * h);
    }
    else if (__match?.__tag === "Triangle") {
      const b = __match.b;
      const h = __match.h;
      return ((0.5 * b) * h);
    }
  })(shape);
}
function describe_shape(shape) {
  return ((__match) => {
    if (__match?.__tag === "Circle") {
      const r = __match.r;
      return `Circle with radius ${r}`;
    }
    else if (__match?.__tag === "Rectangle") {
      const w = __match.w;
      const h = __match.h;
      return `Rectangle ${w}x${h}`;
    }
    else if (__match?.__tag === "Triangle") {
      const b = __match.b;
      const h = __match.h;
      return `Triangle base=${b} height=${h}`;
    }
  })(shape);
}
const shapes = [Circle(5), Rectangle(4, 6), Triangle(3, 8)];
for (const s of shapes) {
  print(`${describe_shape(s)}: area = ${area(s)}`);
}
const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const squares = numbers.map((x) => (x * x));
const even_squares = numbers.filter((x) => ((x % 2) == 0)).map((x) => (x * x));
print(`Squares: ${squares}`);
print(`Even squares: ${even_squares}`);
const result = sum(map(filter(numbers, (x) => (x > 3)), (x) => (x * x)));
print(`Sum of squares > 3: ${result}`);
let a = 10;
let b = 20;
[a, b] = [b, a];
print(`After swap: a=${a}, b=${b}`);
const val = 7;
if (((1 < val) && (val < 10))) {
  print(`${val} is between 1 and 10`);
}
const langs = ["Lux", "Rust", "Python", "Go"];
if (__contains(langs, "Lux")) {
  print("Lux is in the list!");
}
print(`len: ${len(numbers)}`);
print(`sum: ${sum(numbers)}`);
print(`min: ${min(numbers)}`);
print(`max: ${max(numbers)}`);
print(`range(5): ${range(5)}`);
print(`sorted desc: ${sorted(numbers, (x) => (-x))}`);
print(`reversed: ${reversed(numbers)}`);
print(`zip: ${zip([1, 2, 3], ["a", "b", "c"])}`);
print(`enumerate: ${enumerate(langs)}`);
function fizzbuzz(n) {
  if (((n % 15) == 0)) {
    "FizzBuzz";
  } else if (((n % 3) == 0)) {
    "Fizz";
  } else if (((n % 5) == 0)) {
    "Buzz";
  } else {
    `${n}`;
  }
}
const fb = range(1, 16).map((i) => fizzbuzz(i));
print(`FizzBuzz: ${fb}`);
print("\nAll CLI tests passed!");