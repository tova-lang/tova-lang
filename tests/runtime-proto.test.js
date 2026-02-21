import { describe, test, expect } from "bun:test";
import '../src/runtime/array-proto.js';
import '../src/runtime/string-proto.js';

// ============================================================
// Array.prototype extensions
// ============================================================

describe("Array.prototype.sorted", () => {
  test("sorts numbers in ascending order", () => {
    expect([3, 1, 2].sorted()).toEqual([1, 2, 3]);
  });

  test("does not mutate the original array", () => {
    const arr = [3, 1, 2];
    const result = arr.sorted();
    expect(arr).toEqual([3, 1, 2]);
    expect(result).toEqual([1, 2, 3]);
  });

  test("sorts strings alphabetically", () => {
    expect(["banana", "apple", "cherry"].sorted()).toEqual(["apple", "banana", "cherry"]);
  });

  test("sorts with a key function", () => {
    const items = [{ name: "b", age: 2 }, { name: "a", age: 1 }, { name: "c", age: 3 }];
    const result = items.sorted(x => x.age);
    expect(result.map(x => x.name)).toEqual(["a", "b", "c"]);
  });

  test("returns empty array for empty input", () => {
    expect([].sorted()).toEqual([]);
  });

  test("single element array", () => {
    expect([42].sorted()).toEqual([42]);
  });
});

describe("Array.prototype.reversed", () => {
  test("reverses an array", () => {
    expect([1, 2, 3].reversed()).toEqual([3, 2, 1]);
  });

  test("does not mutate the original array", () => {
    const arr = [1, 2, 3];
    const result = arr.reversed();
    expect(arr).toEqual([1, 2, 3]);
    expect(result).toEqual([3, 2, 1]);
  });

  test("returns empty array for empty input", () => {
    expect([].reversed()).toEqual([]);
  });

  test("single element array", () => {
    expect([7].reversed()).toEqual([7]);
  });
});

describe("Array.prototype.unique", () => {
  test("removes duplicate numbers", () => {
    expect([1, 2, 2, 3, 3, 3].unique()).toEqual([1, 2, 3]);
  });

  test("removes duplicate strings", () => {
    expect(["a", "b", "a", "c", "b"].unique()).toEqual(["a", "b", "c"]);
  });

  test("preserves order of first occurrence", () => {
    expect([3, 1, 2, 1, 3].unique()).toEqual([3, 1, 2]);
  });

  test("returns empty array for empty input", () => {
    expect([].unique()).toEqual([]);
  });

  test("single element array", () => {
    expect([5].unique()).toEqual([5]);
  });
});

describe("Array.prototype.chunk", () => {
  test("splits into chunks of given size", () => {
    expect([1, 2, 3, 4, 5, 6].chunk(2)).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  test("last chunk can be smaller", () => {
    expect([1, 2, 3, 4, 5].chunk(2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  test("chunk size larger than array", () => {
    expect([1, 2].chunk(5)).toEqual([[1, 2]]);
  });

  test("chunk size of 1", () => {
    expect([1, 2, 3].chunk(1)).toEqual([[1], [2], [3]]);
  });

  test("returns empty array for empty input", () => {
    expect([].chunk(3)).toEqual([]);
  });

  test("single element array", () => {
    expect([42].chunk(3)).toEqual([[42]]);
  });
});

describe("Array.prototype.flatten", () => {
  test("flattens one level of nesting", () => {
    expect([[1, 2], [3, 4], [5]].flatten()).toEqual([1, 2, 3, 4, 5]);
  });

  test("only flattens one level", () => {
    expect([[1, [2, 3]], [4]].flatten()).toEqual([1, [2, 3], 4]);
  });

  test("handles mixed nested and non-nested", () => {
    expect([1, [2, 3], 4].flatten()).toEqual([1, 2, 3, 4]);
  });

  test("returns empty array for empty input", () => {
    expect([].flatten()).toEqual([]);
  });

  test("single element array", () => {
    expect([[1]].flatten()).toEqual([1]);
  });
});

describe("Array.prototype.first", () => {
  test("returns the first element", () => {
    expect([10, 20, 30].first()).toBe(10);
  });

  test("returns null for empty array", () => {
    expect([].first()).toBeNull();
  });

  test("single element array", () => {
    expect([99].first()).toBe(99);
  });
});

describe("Array.prototype.last", () => {
  test("returns the last element", () => {
    expect([10, 20, 30].last()).toBe(30);
  });

  test("returns null for empty array", () => {
    expect([].last()).toBeNull();
  });

  test("single element array", () => {
    expect([99].last()).toBe(99);
  });
});

describe("Array.prototype.take", () => {
  test("takes the first n elements", () => {
    expect([1, 2, 3, 4, 5].take(3)).toEqual([1, 2, 3]);
  });

  test("takes all elements if n exceeds length", () => {
    expect([1, 2].take(5)).toEqual([1, 2]);
  });

  test("take 0 returns empty", () => {
    expect([1, 2, 3].take(0)).toEqual([]);
  });

  test("returns empty array for empty input", () => {
    expect([].take(3)).toEqual([]);
  });

  test("single element array", () => {
    expect([42].take(1)).toEqual([42]);
  });
});

describe("Array.prototype.drop", () => {
  test("drops the first n elements", () => {
    expect([1, 2, 3, 4, 5].drop(2)).toEqual([3, 4, 5]);
  });

  test("drops all elements if n exceeds length", () => {
    expect([1, 2].drop(5)).toEqual([]);
  });

  test("drop 0 returns all elements", () => {
    expect([1, 2, 3].drop(0)).toEqual([1, 2, 3]);
  });

  test("returns empty array for empty input", () => {
    expect([].drop(3)).toEqual([]);
  });

  test("single element array drop 1", () => {
    expect([42].drop(1)).toEqual([]);
  });
});

describe("Array.prototype.compact", () => {
  test("removes null values", () => {
    expect([1, null, 2, null, 3].compact()).toEqual([1, 2, 3]);
  });

  test("removes undefined values", () => {
    expect([1, undefined, 2, undefined].compact()).toEqual([1, 2]);
  });

  test("removes both null and undefined", () => {
    expect([null, 1, undefined, 2, null].compact()).toEqual([1, 2]);
  });

  test("keeps falsy values like 0, false, and empty string", () => {
    expect([0, false, "", null, undefined].compact()).toEqual([0, false, ""]);
  });

  test("returns empty array for empty input", () => {
    expect([].compact()).toEqual([]);
  });

  test("single element array with null", () => {
    expect([null].compact()).toEqual([]);
  });

  test("single element array with value", () => {
    expect([5].compact()).toEqual([5]);
  });
});

describe("Array.prototype.sum", () => {
  test("sums numbers", () => {
    expect([1, 2, 3, 4].sum()).toBe(10);
  });

  test("sums with negative numbers", () => {
    expect([1, -2, 3, -4].sum()).toBe(-2);
  });

  test("sums floating point numbers", () => {
    expect([0.1, 0.2, 0.3].sum()).toBeCloseTo(0.6);
  });

  test("returns 0 for empty array", () => {
    expect([].sum()).toBe(0);
  });

  test("single element array", () => {
    expect([42].sum()).toBe(42);
  });
});

describe("Array.prototype.min_val", () => {
  test("returns minimum value", () => {
    expect([3, 1, 4, 1, 5].min_val()).toBe(1);
  });

  test("works with negative numbers", () => {
    expect([-3, -1, -4].min_val()).toBe(-4);
  });

  test("returns null for empty array", () => {
    expect([].min_val()).toBeNull();
  });

  test("single element array", () => {
    expect([99].min_val()).toBe(99);
  });
});

describe("Array.prototype.max_val", () => {
  test("returns maximum value", () => {
    expect([3, 1, 4, 1, 5].max_val()).toBe(5);
  });

  test("works with negative numbers", () => {
    expect([-3, -1, -4].max_val()).toBe(-1);
  });

  test("returns null for empty array", () => {
    expect([].max_val()).toBeNull();
  });

  test("single element array", () => {
    expect([99].max_val()).toBe(99);
  });
});

describe("Array.prototype.group_by", () => {
  test("groups by function result", () => {
    const result = [1, 2, 3, 4, 5, 6].group_by(x => x % 2 === 0 ? "even" : "odd");
    expect(result).toEqual({ odd: [1, 3, 5], even: [2, 4, 6] });
  });

  test("groups strings by length", () => {
    const result = ["hi", "hey", "hello", "yo"].group_by(s => s.length);
    expect(result).toEqual({ 2: ["hi", "yo"], 3: ["hey"], 5: ["hello"] });
  });

  test("returns empty object for empty array", () => {
    expect([].group_by(x => x)).toEqual({});
  });

  test("single element array", () => {
    expect([5].group_by(x => "key")).toEqual({ key: [5] });
  });
});

describe("Array.prototype.partition", () => {
  test("splits into truthy and falsy groups", () => {
    const [evens, odds] = [1, 2, 3, 4, 5, 6].partition(x => x % 2 === 0);
    expect(evens).toEqual([2, 4, 6]);
    expect(odds).toEqual([1, 3, 5]);
  });

  test("all truthy", () => {
    const [pass, fail] = [2, 4, 6].partition(x => x % 2 === 0);
    expect(pass).toEqual([2, 4, 6]);
    expect(fail).toEqual([]);
  });

  test("all falsy", () => {
    const [pass, fail] = [1, 3, 5].partition(x => x % 2 === 0);
    expect(pass).toEqual([]);
    expect(fail).toEqual([1, 3, 5]);
  });

  test("returns two empty arrays for empty input", () => {
    const [a, b] = [].partition(x => x);
    expect(a).toEqual([]);
    expect(b).toEqual([]);
  });

  test("single element array matching", () => {
    const [a, b] = [2].partition(x => x % 2 === 0);
    expect(a).toEqual([2]);
    expect(b).toEqual([]);
  });
});

describe("Array.prototype.zip_with", () => {
  test("zips two arrays of equal length", () => {
    expect([1, 2, 3].zip_with(["a", "b", "c"])).toEqual([[1, "a"], [2, "b"], [3, "c"]]);
  });

  test("zips arrays of different lengths (truncates to shorter)", () => {
    expect([1, 2, 3].zip_with(["a", "b"])).toEqual([[1, "a"], [2, "b"]]);
  });

  test("zips when other is longer", () => {
    expect([1].zip_with(["a", "b", "c"])).toEqual([[1, "a"]]);
  });

  test("returns empty array when either is empty", () => {
    expect([].zip_with([1, 2])).toEqual([]);
    expect([1, 2].zip_with([])).toEqual([]);
  });

  test("single element arrays", () => {
    expect([1].zip_with(["a"])).toEqual([[1, "a"]]);
  });
});

describe("Array.prototype.frequencies", () => {
  test("counts occurrences of each element", () => {
    const result = ["a", "b", "a", "c", "b", "a"].frequencies();
    expect(result).toEqual({ a: 3, b: 2, c: 1 });
  });

  test("counts numbers", () => {
    const result = [1, 2, 1, 3, 2, 1].frequencies();
    expect(result).toEqual({ 1: 3, 2: 2, 3: 1 });
  });

  test("returns empty object for empty array", () => {
    expect([].frequencies()).toEqual({});
  });

  test("single element array", () => {
    expect(["x"].frequencies()).toEqual({ x: 1 });
  });
});

// ============================================================
// String.prototype extensions
// ============================================================

describe("String.prototype.upper", () => {
  test("converts to uppercase", () => {
    expect("hello".upper()).toBe("HELLO");
  });

  test("already uppercase stays uppercase", () => {
    expect("HELLO".upper()).toBe("HELLO");
  });

  test("empty string", () => {
    expect("".upper()).toBe("");
  });

  test("mixed case", () => {
    expect("Hello World".upper()).toBe("HELLO WORLD");
  });
});

describe("String.prototype.lower", () => {
  test("converts to lowercase", () => {
    expect("HELLO".lower()).toBe("hello");
  });

  test("already lowercase stays lowercase", () => {
    expect("hello".lower()).toBe("hello");
  });

  test("empty string", () => {
    expect("".lower()).toBe("");
  });

  test("mixed case", () => {
    expect("Hello World".lower()).toBe("hello world");
  });
});

describe("String.prototype.contains", () => {
  test("returns true when substring exists", () => {
    expect("hello world".contains("world")).toBe(true);
  });

  test("returns false when substring does not exist", () => {
    expect("hello world".contains("xyz")).toBe(false);
  });

  test("empty string contains empty string", () => {
    expect("".contains("")).toBe(true);
  });

  test("any string contains empty string", () => {
    expect("hello".contains("")).toBe(true);
  });

  test("empty string does not contain non-empty", () => {
    expect("".contains("a")).toBe(false);
  });
});

describe("String.prototype.starts_with", () => {
  test("returns true for matching prefix", () => {
    expect("hello world".starts_with("hello")).toBe(true);
  });

  test("returns false for non-matching prefix", () => {
    expect("hello world".starts_with("world")).toBe(false);
  });

  test("empty string starts with empty string", () => {
    expect("".starts_with("")).toBe(true);
  });

  test("any string starts with empty string", () => {
    expect("hello".starts_with("")).toBe(true);
  });
});

describe("String.prototype.ends_with", () => {
  test("returns true for matching suffix", () => {
    expect("hello world".ends_with("world")).toBe(true);
  });

  test("returns false for non-matching suffix", () => {
    expect("hello world".ends_with("hello")).toBe(false);
  });

  test("empty string ends with empty string", () => {
    expect("".ends_with("")).toBe(true);
  });

  test("any string ends with empty string", () => {
    expect("hello".ends_with("")).toBe(true);
  });
});

describe("String.prototype.chars", () => {
  test("splits into character array", () => {
    expect("hello".chars()).toEqual(["h", "e", "l", "l", "o"]);
  });

  test("empty string returns empty array", () => {
    expect("".chars()).toEqual([]);
  });

  test("single character", () => {
    expect("a".chars()).toEqual(["a"]);
  });

  test("unicode characters", () => {
    const result = "cafe\u0301".chars();
    // Spreading a string splits by code units / code points
    expect(result.length).toBeGreaterThanOrEqual(4);
  });

  test("emoji string", () => {
    const result = "hi!".chars();
    expect(result).toEqual(["h", "i", "!"]);
  });

  test("string with spaces", () => {
    expect("a b".chars()).toEqual(["a", " ", "b"]);
  });
});

describe("String.prototype.words", () => {
  test("splits on whitespace", () => {
    expect("hello world".words()).toEqual(["hello", "world"]);
  });

  test("handles multiple spaces", () => {
    expect("hello   world".words()).toEqual(["hello", "world"]);
  });

  test("handles tabs and newlines", () => {
    expect("hello\tworld\nfoo".words()).toEqual(["hello", "world", "foo"]);
  });

  test("empty string returns empty array or array with empty string", () => {
    const result = "".words();
    // Filtering empty strings from split
    expect(result.filter(w => w.length > 0).length).toBe(0);
  });

  test("single word", () => {
    expect("hello".words()).toEqual(["hello"]);
  });

  test("leading and trailing whitespace", () => {
    expect("  hello world  ".words()).toEqual(["hello", "world"]);
  });
});

describe("String.prototype.lines", () => {
  test("splits on newlines", () => {
    expect("line1\nline2\nline3".lines()).toEqual(["line1", "line2", "line3"]);
  });

  test("handles carriage return + newline", () => {
    // lines() splits on \n; \r remains as trailing character
    expect("line1\r\nline2".lines()).toEqual(["line1\r", "line2"]);
  });

  test("single line no newline", () => {
    expect("hello".lines()).toEqual(["hello"]);
  });

  test("empty string", () => {
    expect("".lines()).toEqual([""]);
  });

  test("multiple blank lines", () => {
    const result = "a\n\nb".lines();
    expect(result).toEqual(["a", "", "b"]);
  });
});

describe("String.prototype.capitalize", () => {
  test("capitalizes first letter", () => {
    expect("hello".capitalize()).toBe("Hello");
  });

  test("already capitalized", () => {
    expect("Hello".capitalize()).toBe("Hello");
  });

  test("single character", () => {
    expect("h".capitalize()).toBe("H");
  });

  test("empty string", () => {
    expect("".capitalize()).toBe("");
  });

  test("all uppercase stays same except first", () => {
    expect("hELLO".capitalize()).toBe("HELLO");
  });
});

describe("String.prototype.title_case", () => {
  test("capitalizes each word", () => {
    expect("hello world".title_case()).toBe("Hello World");
  });

  test("handles multiple spaces", () => {
    const result = "hello   world".title_case();
    expect(result.includes("Hello")).toBe(true);
    expect(result.includes("World")).toBe(true);
  });

  test("single word", () => {
    expect("hello".title_case()).toBe("Hello");
  });

  test("empty string", () => {
    expect("".title_case()).toBe("");
  });

  test("already title case", () => {
    expect("Hello World".title_case()).toBe("Hello World");
  });

  test("all lowercase multi-word", () => {
    expect("the quick brown fox".title_case()).toBe("The Quick Brown Fox");
  });
});

describe("String.prototype.snake_case", () => {
  test("converts camelCase to snake_case", () => {
    expect("helloWorld".snake_case()).toBe("hello_world");
  });

  test("converts PascalCase to snake_case", () => {
    expect("HelloWorld".snake_case()).toBe("hello_world");
  });

  test("converts spaces to underscores", () => {
    expect("hello world".snake_case()).toBe("hello_world");
  });

  test("already snake_case stays same", () => {
    expect("hello_world".snake_case()).toBe("hello_world");
  });

  test("empty string", () => {
    expect("".snake_case()).toBe("");
  });

  test("single word lowercase", () => {
    expect("hello".snake_case()).toBe("hello");
  });
});

describe("String.prototype.camel_case", () => {
  test("converts snake_case to camelCase", () => {
    expect("hello_world".camel_case()).toBe("helloWorld");
  });

  test("converts space-separated to camelCase", () => {
    expect("hello world".camel_case()).toBe("helloWorld");
  });

  test("converts kebab-case to camelCase", () => {
    expect("hello-world".camel_case()).toBe("helloWorld");
  });

  test("already camelCase stays same", () => {
    expect("helloWorld".camel_case()).toBe("helloWorld");
  });

  test("empty string", () => {
    expect("".camel_case()).toBe("");
  });

  test("single word lowercase", () => {
    expect("hello".camel_case()).toBe("hello");
  });
});
