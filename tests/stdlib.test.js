import { describe, test, expect } from 'bun:test';
import { print, range, len, type_of, enumerate, zip, sum, sorted, reversed, flat_map, min, max, any, all } from '../src/stdlib/core.js';
import { map, filter, reduce, find, find_index, includes, unique, group_by, chunk, flatten, take, drop, first, last, count, entries, keys, values, merge } from '../src/stdlib/collections.js';
import { upper, lower, trim, trim_start, trim_end, split, join, contains, starts_with, ends_with, replace, replace_first, repeat, pad_start, pad_end, char_at, chars, words, lines, capitalize, title_case, snake_case, camel_case } from '../src/stdlib/string.js';

// ─── Core ─────────────────────────────────────────────────

describe('Core — range', () => {
  test('range(n) generates 0..n-1', () => {
    expect(range(5)).toEqual([0, 1, 2, 3, 4]);
  });

  test('range(start, end)', () => {
    expect(range(2, 5)).toEqual([2, 3, 4]);
  });

  test('range(start, end, step)', () => {
    expect(range(0, 10, 3)).toEqual([0, 3, 6, 9]);
  });

  test('range with negative step', () => {
    expect(range(5, 0, -1)).toEqual([5, 4, 3, 2, 1]);
  });

  test('range(0) returns empty', () => {
    expect(range(0)).toEqual([]);
  });

  test('range auto-detects negative step', () => {
    expect(range(5, 0)).toEqual([5, 4, 3, 2, 1]);
  });
});

describe('Core — len', () => {
  test('string length', () => { expect(len("hello")).toBe(5); });
  test('array length', () => { expect(len([1, 2, 3])).toBe(3); });
  test('object key count', () => { expect(len({a: 1, b: 2})).toBe(2); });
  test('null returns 0', () => { expect(len(null)).toBe(0); });
  test('undefined returns 0', () => { expect(len(undefined)).toBe(0); });
  test('number returns 0', () => { expect(len(42)).toBe(0); });
});

describe('Core — type_of', () => {
  test('null → Nil', () => { expect(type_of(null)).toBe('Nil'); });
  test('array → List', () => { expect(type_of([1, 2])).toBe('List'); });
  test('int → Int', () => { expect(type_of(42)).toBe('Int'); });
  test('float → Float', () => { expect(type_of(3.14)).toBe('Float'); });
  test('string → String', () => { expect(type_of("hi")).toBe('String'); });
  test('bool → Bool', () => { expect(type_of(true)).toBe('Bool'); });
  test('function → Function', () => { expect(type_of(() => {})).toBe('Function'); });
  test('object → Object', () => { expect(type_of({a: 1})).toBe('Object'); });
  test('tagged → tag name', () => { expect(type_of({__tag: 'Circle'})).toBe('Circle'); });
  test('undefined → Unknown', () => { expect(type_of(undefined)).toBe('Unknown'); });
});

describe('Core — enumerate', () => {
  test('adds indices', () => {
    expect(enumerate(['a', 'b', 'c'])).toEqual([[0, 'a'], [1, 'b'], [2, 'c']]);
  });
});

describe('Core — zip', () => {
  test('zips two arrays', () => {
    expect(zip([1, 2, 3], ['a', 'b', 'c'])).toEqual([[1, 'a'], [2, 'b'], [3, 'c']]);
  });

  test('zips uneven arrays to shortest', () => {
    expect(zip([1, 2], ['a', 'b', 'c'])).toEqual([[1, 'a'], [2, 'b']]);
  });
});

describe('Core — aggregation', () => {
  test('sum', () => { expect(sum([1, 2, 3, 4])).toBe(10); });
  test('min', () => { expect(min([3, 1, 4, 1])).toBe(1); });
  test('max', () => { expect(max([3, 1, 4, 1])).toBe(4); });
  test('any with predicate', () => { expect(any([1, 2, 3], x => x > 2)).toBe(true); });
  test('any without predicate', () => { expect(any([0, false, 1])).toBe(true); });
  test('all with predicate', () => { expect(all([2, 4, 6], x => x % 2 === 0)).toBe(true); });
  test('all without predicate', () => { expect(all([1, true, "yes"])).toBe(true); });
  test('all fails', () => { expect(all([1, 0, true])).toBe(false); });
});

describe('Core — sorted', () => {
  test('basic sort', () => { expect(sorted([3, 1, 2])).toEqual([1, 2, 3]); });
  test('sort with key fn', () => {
    expect(sorted([{n: 3}, {n: 1}, {n: 2}], x => x.n)).toEqual([{n: 1}, {n: 2}, {n: 3}]);
  });
  test('does not mutate original', () => {
    const arr = [3, 1, 2];
    sorted(arr);
    expect(arr).toEqual([3, 1, 2]);
  });
});

describe('Core — reversed', () => {
  test('reverses array', () => { expect(reversed([1, 2, 3])).toEqual([3, 2, 1]); });
  test('does not mutate', () => {
    const arr = [1, 2, 3];
    reversed(arr);
    expect(arr).toEqual([1, 2, 3]);
  });
});

describe('Core — flat_map', () => {
  test('flat maps', () => { expect(flat_map([1, 2, 3], x => [x, x * 2])).toEqual([1, 2, 2, 4, 3, 6]); });
});

// ─── Collections ──────────────────────────────────────────

describe('Collections — basics', () => {
  test('map', () => { expect(map([1, 2, 3], x => x * 2)).toEqual([2, 4, 6]); });
  test('filter', () => { expect(filter([1, 2, 3, 4], x => x % 2 === 0)).toEqual([2, 4]); });
  test('reduce with initial', () => { expect(reduce([1, 2, 3], (a, b) => a + b, 0)).toBe(6); });
  test('reduce without initial', () => { expect(reduce([1, 2, 3], (a, b) => a + b)).toBe(6); });
  test('find', () => { expect(find([1, 2, 3], x => x > 1)).toBe(2); });
  test('find returns null', () => { expect(find([1, 2, 3], x => x > 10)).toBeNull(); });
  test('find_index', () => { expect(find_index([1, 2, 3], x => x > 1)).toBe(1); });
  test('find_index returns null', () => { expect(find_index([1, 2, 3], x => x > 10)).toBeNull(); });
  test('includes', () => { expect(includes([1, 2, 3], 2)).toBe(true); });
  test('includes false', () => { expect(includes([1, 2, 3], 5)).toBe(false); });
  test('unique', () => { expect(unique([1, 2, 2, 3, 3])).toEqual([1, 2, 3]); });
});

describe('Collections — group_by', () => {
  test('group by function', () => {
    const result = group_by([1, 2, 3, 4], x => x % 2 === 0 ? 'even' : 'odd');
    expect(result.even).toEqual([2, 4]);
    expect(result.odd).toEqual([1, 3]);
  });

  test('group by key string', () => {
    const result = group_by([{t: 'a', v: 1}, {t: 'b', v: 2}, {t: 'a', v: 3}], 't');
    expect(result.a.length).toBe(2);
    expect(result.b.length).toBe(1);
  });
});

describe('Collections — slicing', () => {
  test('chunk', () => { expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]); });
  test('flatten', () => { expect(flatten([[1, 2], [3, [4]]])).toEqual([1, 2, 3, 4]); });
  test('flatten with depth', () => { expect(flatten([[1, [2]], [3]], 1)).toEqual([1, [2], 3]); });
  test('take', () => { expect(take([1, 2, 3, 4], 2)).toEqual([1, 2]); });
  test('drop', () => { expect(drop([1, 2, 3, 4], 2)).toEqual([3, 4]); });
  test('first', () => { expect(first([10, 20])).toBe(10); });
  test('first empty', () => { expect(first([])).toBeNull(); });
  test('last', () => { expect(last([10, 20])).toBe(20); });
  test('last empty', () => { expect(last([])).toBeNull(); });
});

describe('Collections — count & object helpers', () => {
  test('count no fn', () => { expect(count([1, 2, 3])).toBe(3); });
  test('count with fn', () => { expect(count([1, 2, 3, 4], x => x > 2)).toBe(2); });
  test('entries', () => { expect(entries({a: 1})).toEqual([['a', 1]]); });
  test('keys', () => { expect(keys({a: 1, b: 2})).toEqual(['a', 'b']); });
  test('values', () => { expect(values({a: 1, b: 2})).toEqual([1, 2]); });
  test('merge', () => { expect(merge({a: 1}, {b: 2})).toEqual({a: 1, b: 2}); });
  test('merge overwrite', () => { expect(merge({a: 1}, {a: 2})).toEqual({a: 2}); });
});

// ─── String ───────────────────────────────────────────────

describe('String — case', () => {
  test('upper', () => { expect(upper("hello")).toBe("HELLO"); });
  test('lower', () => { expect(lower("HELLO")).toBe("hello"); });
  test('capitalize', () => { expect(capitalize("hello")).toBe("Hello"); });
  test('capitalize empty', () => { expect(capitalize("")).toBe(""); });
  test('title_case', () => { expect(title_case("hello world")).toBe("Hello World"); });
  test('snake_case', () => { expect(snake_case("helloWorld")).toBe("hello_world"); });
  test('snake_case from spaces', () => { expect(snake_case("Hello World")).toBe("hello_world"); });
  test('camel_case', () => { expect(camel_case("hello_world")).toBe("helloWorld"); });
  test('camel_case from spaces', () => { expect(camel_case("hello world")).toBe("helloWorld"); });
});

describe('String — trim', () => {
  test('trim', () => { expect(trim("  hi  ")).toBe("hi"); });
  test('trim_start', () => { expect(trim_start("  hi  ")).toBe("hi  "); });
  test('trim_end', () => { expect(trim_end("  hi  ")).toBe("  hi"); });
});

describe('String — split/join', () => {
  test('split', () => { expect(split("a,b,c", ",")).toEqual(["a", "b", "c"]); });
  test('join', () => { expect(join(["a", "b", "c"], ",")).toBe("a,b,c"); });
  test('join default', () => { expect(join(["a", "b"])).toBe("ab"); });
});

describe('String — search', () => {
  test('contains', () => { expect(contains("hello world", "world")).toBe(true); });
  test('contains false', () => { expect(contains("hello", "xyz")).toBe(false); });
  test('starts_with', () => { expect(starts_with("hello", "hel")).toBe(true); });
  test('ends_with', () => { expect(ends_with("hello", "llo")).toBe(true); });
});

describe('String — replace', () => {
  test('replace all', () => { expect(replace("aabbcc", "b", "x")).toBe("aaxxcc"); });
  test('replace_first', () => { expect(replace_first("aabb", "a", "x")).toBe("xabb"); });
});

describe('String — padding & repeat', () => {
  test('repeat', () => { expect(repeat("ab", 3)).toBe("ababab"); });
  test('pad_start', () => { expect(pad_start("5", 3, "0")).toBe("005"); });
  test('pad_start default', () => { expect(pad_start("hi", 5)).toBe("   hi"); });
  test('pad_end', () => { expect(pad_end("5", 3, "0")).toBe("500"); });
});

describe('String — char access', () => {
  test('char_at', () => { expect(char_at("hello", 1)).toBe("e"); });
  test('char_at out of bounds', () => { expect(char_at("hi", 10)).toBeNull(); });
  test('chars', () => { expect(chars("abc")).toEqual(["a", "b", "c"]); });
  test('words', () => { expect(words("hello  world")).toEqual(["hello", "world"]); });
  test('lines', () => { expect(lines("a\nb\nc")).toEqual(["a", "b", "c"]); });
});
