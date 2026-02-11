
const name = "World";
const greeting = `Hello, ${name}!`;
print(greeting);
const x = 42;
let count = 0;
count += 1;
print(`x = ${x}, count = ${count}`);
function add(a, b) {
  return (a + b);
}
function greet(name = "friend") {
  return `Hey, ${name}!`;
}
print(add(1, 2));
print(greet());
print(greet("Alice"));
function describe(value) {
  return ((__match) => {
    if (__match === 0) {
      return "zero";
    }
    else if (__match >= 1 && __match < 10) {
      return "small";
    }
    else if (((n) => (n > 100))(__match)) {
      const n = __match;
      return `big: ${n}`;
    }
    return "other";
  })(value);
}
print(describe(0));
print(describe(5));
print(describe(200));
const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const evens = numbers.filter((x) => (x > 3)).map((x) => (x * 2));
print(evens);
const result = sum(map(filter(numbers, (x) => (x > 3)), (x) => (x * 10)));
print(`Pipe result: ${result}`);
const y = 5;
if (((1 < y) && (y < 10))) {
  print(`${y} is between 1 and 10`);
}
const fruits = ["apple", "banana", "cherry"];
if (fruits.includes("banana")) {
  print("We have bananas!");
}
let a = 1;
let b = 2;
const a = b;
const b = a;
print(`After swap: a=${a}, b=${b}`);
const Red = Object.freeze({ __tag: "Red" });
const Green = Object.freeze({ __tag: "Green" });
const Blue = Object.freeze({ __tag: "Blue" });
function Custom(r, g, b) { return Object.freeze({ __tag: "Custom", r, g, b }); }
function color_name(c) {
  return ((__match) => {
    if (__match?.__tag === "Red") {
      return "red";
    }
    else if (__match?.__tag === "Green") {
      return "green";
    }
    else if (__match?.__tag === "Blue") {
      return "blue";
    }
    else if (__match?.__tag === "Custom") {
      const r = __match.r;
      const g = __match.g;
      const b = __match.b;
      return `rgb(${r},${g},${b})`;
    }
  })(c);
}
print(color_name(Red));
print(color_name(Custom(255, 128, 0)));