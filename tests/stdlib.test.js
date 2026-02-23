import { describe, test, expect } from 'bun:test';
import { print, range, len, type_of, enumerate, zip, sum, sorted, reversed, flat_map, min, max, any, all, random_int, random_float, choice, sample, shuffle, to_int, to_float, to_string, to_bool, is_empty, now, now_iso, uuid } from '../src/stdlib/core.js';
import { map, filter, reduce, find, find_index, includes, unique, group_by, chunk, flatten, take, drop, first, last, count, entries, keys, values, merge, partition, zip_with, frequencies, scan, min_by, max_by, sum_by, product, from_entries, has_key, get, pick, omit, map_values, sliding_window, intersection, difference, symmetric_difference, is_subset, is_superset, pairwise, combinations, permutations, intersperse, interleave, repeat_value, binary_search, is_sorted, compact, rotate, insert_at, remove_at, update_at } from '../src/stdlib/collections.js';
import { upper, lower, trim, trim_start, trim_end, split, join, contains, starts_with, ends_with, replace, replace_first, repeat, pad_start, pad_end, char_at, chars, words, lines, capitalize, title_case, snake_case, camel_case, index_of, last_index_of, count_of, reverse_str, substr, kebab_case, center, truncate, word_wrap, dedent, indent_str, slugify, escape_html, unescape_html, fmt } from '../src/stdlib/string.js';
import { PI, E, INF, sin, cos, tan, asin, acos, atan, atan2, log, log2, log10, exp, sign, trunc, is_nan, is_finite, is_close, to_radians, to_degrees, gcd, lcm, factorial, hypot, lerp, divmod, avg, mode, stdev, variance, percentile, format_number, to_hex, to_binary, to_octal, to_fixed } from '../src/stdlib/math.js';
import { compose, pipe_fn, identity, memoize, debounce, throttle, once, negate, partial, curry, flip } from '../src/stdlib/functional.js';
import { base64_encode, base64_decode, url_encode, url_decode, hex_encode, hex_decode } from '../src/stdlib/encoding.js';
import { is_email, is_url, is_numeric, is_alpha, is_alphanumeric, is_uuid, is_hex } from '../src/stdlib/validation.js';
import { parse_url, build_url, parse_query, build_query } from '../src/stdlib/url.js';
import { date_parse, date_format, date_add, date_diff, date_from, date_part, time_ago } from '../src/stdlib/datetime.js';

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

// ─── Math — Constants ─────────────────────────────────────

describe('Math — constants', () => {
  test('PI', () => { expect(Math.abs(PI - 3.14159265) < 0.0001).toBe(true); });
  test('E', () => { expect(Math.abs(E - 2.71828) < 0.001).toBe(true); });
  test('INF', () => { expect(INF).toBe(Infinity); });
});

// ─── Math — Trigonometry ──────────────────────────────────

describe('Math — trigonometry', () => {
  test('sin(0) = 0', () => { expect(sin(0)).toBe(0); });
  test('cos(0) = 1', () => { expect(cos(0)).toBe(1); });
  test('sin(PI/2) ~= 1', () => { expect(is_close(sin(PI / 2), 1)).toBe(true); });
  test('tan(0) = 0', () => { expect(tan(0)).toBe(0); });
  test('asin(1) ~= PI/2', () => { expect(is_close(asin(1), PI / 2)).toBe(true); });
  test('acos(1) = 0', () => { expect(acos(1)).toBe(0); });
  test('atan(0) = 0', () => { expect(atan(0)).toBe(0); });
  test('atan2(1,1) ~= PI/4', () => { expect(is_close(atan2(1, 1), PI / 4)).toBe(true); });
});

// ─── Math — Logarithms & Exponentials ─────────────────────

describe('Math — logarithms', () => {
  test('log(E) ~= 1', () => { expect(is_close(log(E), 1)).toBe(true); });
  test('log2(8) = 3', () => { expect(log2(8)).toBe(3); });
  test('log10(1000) = 3', () => { expect(is_close(log10(1000), 3)).toBe(true); });
  test('exp(0) = 1', () => { expect(exp(0)).toBe(1); });
  test('exp(1) ~= E', () => { expect(is_close(exp(1), E)).toBe(true); });
});

// ─── Math — Numeric Utilities ─────────────────────────────

describe('Math — numeric utilities', () => {
  test('sign(-5) = -1', () => { expect(sign(-5)).toBe(-1); });
  test('sign(0) = 0', () => { expect(sign(0)).toBe(0); });
  test('sign(42) = 1', () => { expect(sign(42)).toBe(1); });
  test('trunc(3.7) = 3', () => { expect(trunc(3.7)).toBe(3); });
  test('trunc(-3.7) = -3', () => { expect(trunc(-3.7)).toBe(-3); });
  test('is_nan(NaN) = true', () => { expect(is_nan(NaN)).toBe(true); });
  test('is_nan(42) = false', () => { expect(is_nan(42)).toBe(false); });
  test('is_finite(42) = true', () => { expect(is_finite(42)).toBe(true); });
  test('is_finite(Infinity) = false', () => { expect(is_finite(Infinity)).toBe(false); });
  test('is_close(0.1+0.2, 0.3)', () => { expect(is_close(0.1 + 0.2, 0.3)).toBe(true); });
  test('is_close with custom tolerance', () => { expect(is_close(1.0, 1.01, 0.1)).toBe(true); });
  test('to_radians(180) ~= PI', () => { expect(is_close(to_radians(180), PI)).toBe(true); });
  test('to_degrees(PI) ~= 180', () => { expect(is_close(to_degrees(PI), 180)).toBe(true); });
});

// ─── Math — Integer Math ──────────────────────────────────

describe('Math — integer math', () => {
  test('gcd(12, 8) = 4', () => { expect(gcd(12, 8)).toBe(4); });
  test('gcd(7, 13) = 1', () => { expect(gcd(7, 13)).toBe(1); });
  test('gcd with negatives', () => { expect(gcd(-12, 8)).toBe(4); });
  test('lcm(4, 6) = 12', () => { expect(lcm(4, 6)).toBe(12); });
  test('lcm(0, 0) = 0', () => { expect(lcm(0, 0)).toBe(0); });
  test('lcm(3, 7) = 21', () => { expect(lcm(3, 7)).toBe(21); });
  test('factorial(5) = 120', () => { expect(factorial(5)).toBe(120); });
  test('factorial(0) = 1', () => { expect(factorial(0)).toBe(1); });
  test('factorial(1) = 1', () => { expect(factorial(1)).toBe(1); });
  test('factorial(-1) = null', () => { expect(factorial(-1)).toBeNull(); });
});

// ─── Randomness ───────────────────────────────────────────

describe('Randomness', () => {
  test('random_int in range', () => {
    for (let i = 0; i < 20; i++) {
      const r = random_int(1, 10);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(10);
      expect(Number.isInteger(r)).toBe(true);
    }
  });

  test('random_float in range', () => {
    for (let i = 0; i < 20; i++) {
      const r = random_float(0, 1);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });

  test('choice empty array', () => { expect(choice([])).toBeNull(); });
  test('choice single element', () => { expect(choice([42])).toBe(42); });
  test('choice returns element from array', () => {
    const arr = [1, 2, 3, 4, 5];
    for (let i = 0; i < 20; i++) {
      expect(arr).toContain(choice(arr));
    }
  });

  test('sample returns correct length', () => {
    const result = sample([1, 2, 3, 4, 5], 3);
    expect(result.length).toBe(3);
    for (const v of result) {
      expect([1, 2, 3, 4, 5]).toContain(v);
    }
  });

  test('shuffle preserves elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const result = shuffle(arr);
    expect(result.length).toBe(5);
    expect(result.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    // Original not mutated
    expect(arr).toEqual([1, 2, 3, 4, 5]);
  });
});

// ─── Type Conversion ──────────────────────────────────────

describe('Type Conversion', () => {
  test('to_int("42") = 42', () => { expect(to_int("42")).toBe(42); });
  test('to_int("abc") = null', () => { expect(to_int("abc")).toBeNull(); });
  test('to_int(3.7) = 3', () => { expect(to_int(3.7)).toBe(3); });
  test('to_int(true) = 1', () => { expect(to_int(true)).toBe(1); });
  test('to_int(false) = 0', () => { expect(to_int(false)).toBe(0); });

  test('to_float("3.14") ~= 3.14', () => { expect(to_float("3.14")).toBeCloseTo(3.14); });
  test('to_float("abc") = null', () => { expect(to_float("abc")).toBeNull(); });
  test('to_float(true) = 1.0', () => { expect(to_float(true)).toBe(1.0); });

  test('to_string(42) = "42"', () => { expect(to_string(42)).toBe("42"); });
  test('to_string(null) = "nil"', () => { expect(to_string(null)).toBe("nil"); });
  test('to_string(true) = "true"', () => { expect(to_string(true)).toBe("true"); });

  test('to_bool("") = false', () => { expect(to_bool("")).toBe(false); });
  test('to_bool("false") = false', () => { expect(to_bool("false")).toBe(false); });
  test('to_bool("0") = false', () => { expect(to_bool("0")).toBe(false); });
  test('to_bool("hello") = true', () => { expect(to_bool("hello")).toBe(true); });
  test('to_bool(0) = false', () => { expect(to_bool(0)).toBe(false); });
  test('to_bool(1) = true', () => { expect(to_bool(1)).toBe(true); });
});

// ═══════════════════════════════════════════════════════════
// NEW STDLIB FUNCTIONS
// ═══════════════════════════════════════════════════════════

// ─── Strings (new) ───────────────────────────────────────

describe('String — index_of', () => {
  test('found', () => { expect(index_of("hello world", "world")).toBe(6); });
  test('not found returns null', () => { expect(index_of("hello", "xyz")).toBeNull(); });
  test('first occurrence', () => { expect(index_of("abcabc", "bc")).toBe(1); });
});

describe('String — last_index_of', () => {
  test('found', () => { expect(last_index_of("abcabc", "bc")).toBe(4); });
  test('not found returns null', () => { expect(last_index_of("hello", "xyz")).toBeNull(); });
});

describe('String — count_of', () => {
  test('counts occurrences', () => { expect(count_of("banana", "an")).toBe(2); });
  test('no occurrences', () => { expect(count_of("hello", "xyz")).toBe(0); });
  test('empty sub returns 0', () => { expect(count_of("hello", "")).toBe(0); });
  test('single char', () => { expect(count_of("mississippi", "s")).toBe(4); });
});

describe('String — reverse_str', () => {
  test('reverses string', () => { expect(reverse_str("hello")).toBe("olleh"); });
  test('empty string', () => { expect(reverse_str("")).toBe(""); });
  test('palindrome', () => { expect(reverse_str("racecar")).toBe("racecar"); });
});

describe('String — substr', () => {
  test('with start only', () => { expect(substr("hello world", 6)).toBe("world"); });
  test('with start and end', () => { expect(substr("hello world", 0, 5)).toBe("hello"); });
  test('negative start', () => { expect(substr("hello", -3)).toBe("llo"); });
});

describe('String — is_empty', () => {
  test('empty string', () => { expect(is_empty("")).toBe(true); });
  test('non-empty string', () => { expect(is_empty("hi")).toBe(false); });
  test('empty array', () => { expect(is_empty([])).toBe(true); });
  test('non-empty array', () => { expect(is_empty([1])).toBe(false); });
  test('empty object', () => { expect(is_empty({})).toBe(true); });
  test('non-empty object', () => { expect(is_empty({a: 1})).toBe(false); });
  test('null', () => { expect(is_empty(null)).toBe(true); });
  test('undefined', () => { expect(is_empty(undefined)).toBe(true); });
  test('number returns false', () => { expect(is_empty(0)).toBe(false); });
});

describe('String — kebab_case', () => {
  test('from camelCase', () => { expect(kebab_case("helloWorld")).toBe("hello-world"); });
  test('from spaces', () => { expect(kebab_case("Hello World")).toBe("hello-world"); });
  test('already kebab', () => { expect(kebab_case("hello-world")).toBe("hello-world"); });
});

describe('String — center', () => {
  test('centers string', () => { expect(center("hi", 6)).toBe("  hi  "); });
  test('odd padding', () => { expect(center("hi", 7)).toBe("  hi   "); });
  test('with fill char', () => { expect(center("hi", 6, "*")).toBe("**hi**"); });
  test('string already wider', () => { expect(center("hello", 3)).toBe("hello"); });
});

// ─── Collections (new) ──────────────────────────────────

describe('Collections — zip_with', () => {
  test('combines with function', () => {
    expect(zip_with([1, 2, 3], [10, 20, 30], (a, b) => a + b)).toEqual([11, 22, 33]);
  });
  test('uneven arrays', () => {
    expect(zip_with([1, 2], [10, 20, 30], (a, b) => a * b)).toEqual([10, 40]);
  });
});

describe('Collections — frequencies', () => {
  test('counts occurrences', () => {
    expect(frequencies(["a", "b", "a", "c", "b", "a"])).toEqual({a: 3, b: 2, c: 1});
  });
  test('numbers', () => {
    expect(frequencies([1, 2, 2, 3, 3, 3])).toEqual({"1": 1, "2": 2, "3": 3});
  });
});

describe('Collections — scan', () => {
  test('running sum', () => {
    expect(scan([1, 2, 3, 4], (acc, v) => acc + v, 0)).toEqual([1, 3, 6, 10]);
  });
  test('empty array', () => {
    expect(scan([], (acc, v) => acc + v, 0)).toEqual([]);
  });
});

describe('Collections — min_by / max_by', () => {
  test('min_by', () => {
    expect(min_by([{n: 3}, {n: 1}, {n: 2}], x => x.n)).toEqual({n: 1});
  });
  test('min_by empty', () => { expect(min_by([], x => x)).toBeNull(); });
  test('max_by', () => {
    expect(max_by([{n: 3}, {n: 1}, {n: 2}], x => x.n)).toEqual({n: 3});
  });
  test('max_by empty', () => { expect(max_by([], x => x)).toBeNull(); });
});

describe('Collections — sum_by', () => {
  test('sums with extractor', () => {
    expect(sum_by([{v: 10}, {v: 20}, {v: 30}], x => x.v)).toBe(60);
  });
});

describe('Collections — product', () => {
  test('multiplies elements', () => { expect(product([1, 2, 3, 4])).toBe(24); });
  test('single element', () => { expect(product([5])).toBe(5); });
  test('with zero', () => { expect(product([1, 2, 0, 4])).toBe(0); });
});

describe('Collections — from_entries', () => {
  test('creates object', () => {
    expect(from_entries([["a", 1], ["b", 2]])).toEqual({a: 1, b: 2});
  });
});

describe('Collections — has_key', () => {
  test('key exists', () => { expect(has_key({a: 1, b: 2}, "a")).toBe(true); });
  test('key missing', () => { expect(has_key({a: 1}, "b")).toBe(false); });
  test('null obj', () => { expect(has_key(null, "a")).toBe(false); });
});

describe('Collections — get (nested)', () => {
  test('simple path', () => { expect(get({a: {b: {c: 42}}}, "a.b.c")).toBe(42); });
  test('array path', () => { expect(get({a: {b: 10}}, ["a", "b"])).toBe(10); });
  test('missing returns null', () => { expect(get({a: 1}, "b.c")).toBeNull(); });
  test('missing with default', () => { expect(get({a: 1}, "b.c", 99)).toBe(99); });
  test('null obj returns default', () => { expect(get(null, "a", 0)).toBe(0); });
});

describe('Collections — pick', () => {
  test('picks keys', () => {
    expect(pick({a: 1, b: 2, c: 3}, ["a", "c"])).toEqual({a: 1, c: 3});
  });
  test('missing keys ignored', () => {
    expect(pick({a: 1}, ["a", "b"])).toEqual({a: 1});
  });
});

describe('Collections — omit', () => {
  test('omits keys', () => {
    expect(omit({a: 1, b: 2, c: 3}, ["b"])).toEqual({a: 1, c: 3});
  });
});

describe('Collections — map_values', () => {
  test('transforms values', () => {
    expect(map_values({a: 1, b: 2, c: 3}, v => v * 10)).toEqual({a: 10, b: 20, c: 30});
  });
  test('receives key', () => {
    expect(map_values({x: 1}, (v, k) => k + "=" + v)).toEqual({x: "x=1"});
  });
});

describe('Collections — sliding_window', () => {
  test('windows of 2', () => {
    expect(sliding_window([1, 2, 3, 4], 2)).toEqual([[1, 2], [2, 3], [3, 4]]);
  });
  test('windows of 3', () => {
    expect(sliding_window([1, 2, 3, 4, 5], 3)).toEqual([[1, 2, 3], [2, 3, 4], [3, 4, 5]]);
  });
  test('window bigger than array', () => {
    expect(sliding_window([1, 2], 5)).toEqual([]);
  });
  test('window of 0', () => {
    expect(sliding_window([1, 2, 3], 0)).toEqual([]);
  });
});

describe('Collections — partition', () => {
  test('partitions array', () => {
    expect(partition([1, 2, 3, 4, 5], x => x % 2 === 0)).toEqual([[2, 4], [1, 3, 5]]);
  });
});

// ─── Math (new) ──────────────────────────────────────────

describe('Math — hypot', () => {
  test('3-4-5 triangle', () => { expect(hypot(3, 4)).toBe(5); });
  test('zero', () => { expect(hypot(0, 0)).toBe(0); });
});

describe('Math — lerp', () => {
  test('midpoint', () => { expect(lerp(0, 10, 0.5)).toBe(5); });
  test('start', () => { expect(lerp(0, 10, 0)).toBe(0); });
  test('end', () => { expect(lerp(0, 10, 1)).toBe(10); });
  test('quarter', () => { expect(lerp(0, 100, 0.25)).toBe(25); });
});

describe('Math — divmod', () => {
  test('divmod(10, 3)', () => { expect(divmod(10, 3)).toEqual([3, 1]); });
  test('divmod(7, 2)', () => { expect(divmod(7, 2)).toEqual([3, 1]); });
  test('divmod(6, 3)', () => { expect(divmod(6, 3)).toEqual([2, 0]); });
});

describe('Math — avg', () => {
  test('average of numbers', () => { expect(avg([1, 2, 3, 4, 5])).toBe(3); });
  test('single element', () => { expect(avg([10])).toBe(10); });
  test('empty array', () => { expect(avg([])).toBe(0); });
});

// ─── Functional ──────────────────────────────────────────

describe('Functional — compose', () => {
  test('composes right to left', () => {
    const double = x => x * 2;
    const inc = x => x + 1;
    expect(compose(double, inc)(3)).toBe(8); // double(inc(3)) = double(4) = 8
  });
  test('single function', () => {
    expect(compose(x => x + 1)(5)).toBe(6);
  });
});

describe('Functional — pipe_fn', () => {
  test('pipes left to right', () => {
    const double = x => x * 2;
    const inc = x => x + 1;
    expect(pipe_fn(double, inc)(3)).toBe(7); // inc(double(3)) = inc(6) = 7
  });
});

describe('Functional — identity', () => {
  test('returns same value', () => { expect(identity(42)).toBe(42); });
  test('returns same object', () => {
    const obj = {a: 1};
    expect(identity(obj)).toBe(obj);
  });
});

describe('Functional — memoize', () => {
  test('caches results', () => {
    let calls = 0;
    const fn = memoize((x) => { calls++; return x * 2; });
    expect(fn(5)).toBe(10);
    expect(fn(5)).toBe(10);
    expect(calls).toBe(1);
    expect(fn(6)).toBe(12);
    expect(calls).toBe(2);
  });
});

describe('Functional — once', () => {
  test('runs only once', () => {
    let calls = 0;
    const fn = once(() => { calls++; return 42; });
    expect(fn()).toBe(42);
    expect(fn()).toBe(42);
    expect(calls).toBe(1);
  });
});

describe('Functional — negate', () => {
  test('negates predicate', () => {
    const isEven = x => x % 2 === 0;
    const isOdd = negate(isEven);
    expect(isOdd(3)).toBe(true);
    expect(isOdd(4)).toBe(false);
  });
});

describe('Functional — throttle', () => {
  test('returns a function', () => {
    const fn = throttle(() => {}, 100);
    expect(typeof fn).toBe('function');
  });
});

describe('Functional — debounce', () => {
  test('returns a function', () => {
    const fn = debounce(() => {}, 100);
    expect(typeof fn).toBe('function');
  });
});

// ─── Encoding ────────────────────────────────────────────

describe('Encoding — base64', () => {
  test('encode', () => { expect(base64_encode("hello")).toBe("aGVsbG8="); });
  test('decode', () => { expect(base64_decode("aGVsbG8=")).toBe("hello"); });
  test('roundtrip', () => { expect(base64_decode(base64_encode("Hello, World!"))).toBe("Hello, World!"); });
  test('unicode roundtrip', () => { expect(base64_decode(base64_encode("cafe\u0301"))).toBe("cafe\u0301"); });
});

describe('Encoding — URL', () => {
  test('url_encode', () => { expect(url_encode("hello world")).toBe("hello%20world"); });
  test('url_decode', () => { expect(url_decode("hello%20world")).toBe("hello world"); });
  test('url_encode special', () => { expect(url_encode("a=1&b=2")).toBe("a%3D1%26b%3D2"); });
  test('roundtrip', () => { expect(url_decode(url_encode("foo bar?baz=1"))).toBe("foo bar?baz=1"); });
});

// ─── Date/Time ───────────────────────────────────────────

describe('Date/Time', () => {
  test('now returns number', () => {
    const t = now();
    expect(typeof t).toBe('number');
    expect(t).toBeGreaterThan(0);
  });
  test('now_iso returns ISO string', () => {
    const s = now_iso();
    expect(typeof s).toBe('string');
    expect(s).toContain('T');
    expect(s).toContain('Z');
  });
});

// ═══════════════════════════════════════════════════════════
// PHASE 1: Date/Time
// ═══════════════════════════════════════════════════════════

describe('Date/Time — date_parse', () => {
  test('valid date string', () => {
    const r = date_parse('2024-01-15');
    expect(r.isOk()).toBe(true);
    expect(r.unwrap().getFullYear()).toBe(2024);
  });
  test('invalid date returns Err', () => {
    const r = date_parse('not-a-date');
    expect(r.isErr()).toBe(true);
  });
});

describe('Date/Time — date_format', () => {
  test('iso format', () => {
    const d = new Date('2024-06-15T12:00:00Z');
    expect(date_format(d, 'iso')).toContain('2024-06-15');
  });
  test('date format', () => {
    const d = new Date('2024-06-15T12:00:00Z');
    expect(date_format(d, 'date')).toBe('2024-06-15');
  });
  test('custom token format', () => {
    const d = new Date(2024, 0, 5, 9, 3, 7); // Jan 5, 2024
    expect(date_format(d, 'YYYY-MM-DD')).toBe('2024-01-05');
  });
  test('accepts timestamp number', () => {
    const ts = new Date('2024-03-01T00:00:00Z').getTime();
    expect(date_format(ts, 'date')).toBe('2024-03-01');
  });
});

describe('Date/Time — date_add', () => {
  test('add days', () => {
    const d = new Date(2024, 0, 1);
    const r = date_add(d, 10, 'days');
    expect(r.getDate()).toBe(11);
  });
  test('add months', () => {
    const d = new Date(2024, 0, 15);
    const r = date_add(d, 2, 'months');
    expect(r.getMonth()).toBe(2); // March
  });
  test('add years', () => {
    const d = new Date(2024, 5, 1);
    const r = date_add(d, 1, 'years');
    expect(r.getFullYear()).toBe(2025);
  });
  test('add hours', () => {
    const d = new Date(2024, 0, 1, 10, 0, 0);
    const r = date_add(d, 3, 'hours');
    expect(r.getHours()).toBe(13);
  });
});

describe('Date/Time — date_diff', () => {
  test('diff in days', () => {
    const d1 = new Date(2024, 0, 1);
    const d2 = new Date(2024, 0, 11);
    expect(date_diff(d1, d2, 'days')).toBe(10);
  });
  test('diff in hours', () => {
    const d1 = new Date(2024, 0, 1, 0, 0, 0);
    const d2 = new Date(2024, 0, 1, 5, 0, 0);
    expect(date_diff(d1, d2, 'hours')).toBe(5);
  });
  test('diff in months', () => {
    const d1 = new Date(2024, 0, 1);
    const d2 = new Date(2024, 5, 1);
    expect(date_diff(d1, d2, 'months')).toBe(5);
  });
  test('diff in years', () => {
    const d1 = new Date(2020, 0, 1);
    const d2 = new Date(2024, 0, 1);
    expect(date_diff(d1, d2, 'years')).toBe(4);
  });
});

describe('Date/Time — date_from', () => {
  test('creates date from parts', () => {
    const d = date_from({ year: 2024, month: 6, day: 15 });
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(5); // 0-indexed
    expect(d.getDate()).toBe(15);
  });
  test('with time parts', () => {
    const d = date_from({ year: 2024, month: 1, day: 1, hour: 14, minute: 30 });
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });
});

describe('Date/Time — date_part', () => {
  test('extract year', () => {
    const d = new Date(2024, 5, 15);
    expect(date_part(d, 'year')).toBe(2024);
  });
  test('extract month (1-indexed)', () => {
    const d = new Date(2024, 5, 15);
    expect(date_part(d, 'month')).toBe(6);
  });
  test('extract day', () => {
    const d = new Date(2024, 5, 15);
    expect(date_part(d, 'day')).toBe(15);
  });
  test('extract weekday', () => {
    const d = new Date(2024, 0, 1); // Monday
    expect(date_part(d, 'weekday')).toBe(d.getDay());
  });
  test('unknown part returns null', () => {
    expect(date_part(new Date(), 'foo')).toBeNull();
  });
});

describe('Date/Time — time_ago', () => {
  test('seconds ago', () => {
    const d = new Date(Date.now() - 30000);
    expect(time_ago(d)).toContain('seconds ago');
  });
  test('minutes ago', () => {
    const d = new Date(Date.now() - 5 * 60000);
    expect(time_ago(d)).toContain('minutes ago');
  });
  test('hours ago', () => {
    const d = new Date(Date.now() - 3 * 3600000);
    expect(time_ago(d)).toContain('hours ago');
  });
  test('days ago', () => {
    const d = new Date(Date.now() - 7 * 86400000);
    expect(time_ago(d)).toContain('days ago');
  });
});

// ═══════════════════════════════════════════════════════════
// PHASE 2: Regex
// ═══════════════════════════════════════════════════════════

describe('Regex — regex_test', () => {
  test('matches', () => { expect(regex_test('hello123', '\\d+')).toBe(true); });
  test('no match', () => { expect(regex_test('hello', '\\d+')).toBe(false); });
  test('with flags', () => { expect(regex_test('Hello', 'hello', 'i')).toBe(true); });
});

describe('Regex — regex_match', () => {
  test('first match', () => {
    const r = regex_match('abc123def', '(\\d+)');
    expect(r.isOk()).toBe(true);
    expect(r.unwrap().match).toBe('123');
    expect(r.unwrap().groups).toEqual(['123']);
  });
  test('no match returns Err', () => {
    const r = regex_match('hello', '\\d+');
    expect(r.isErr()).toBe(true);
  });
});

describe('Regex — regex_find_all', () => {
  test('finds all matches', () => {
    const results = regex_find_all('a1b2c3', '\\d');
    expect(results.length).toBe(3);
    expect(results.map(r => r.match)).toEqual(['1', '2', '3']);
  });
  test('no matches returns empty', () => {
    expect(regex_find_all('hello', '\\d')).toEqual([]);
  });
});

describe('Regex — regex_replace', () => {
  test('replaces all by default', () => {
    expect(regex_replace('a1b2c3', '\\d', 'X')).toBe('aXbXcX');
  });
  test('with capture groups', () => {
    expect(regex_replace('hello world', '(\\w+)', '[$1]')).toBe('[hello] [world]');
  });
});

describe('Regex — regex_split', () => {
  test('splits by regex', () => {
    expect(regex_split('one--two---three', '-+')).toEqual(['one', 'two', 'three']);
  });
  test('splits by whitespace', () => {
    expect(regex_split('a  b\tc', '\\s+')).toEqual(['a', 'b', 'c']);
  });
});

describe('Regex — regex_capture', () => {
  test('captures named groups', () => {
    const r = regex_capture('2024-01-15', '(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})');
    expect(r.isOk()).toBe(true);
    const g = r.unwrap();
    expect(g.year).toBe('2024');
    expect(g.month).toBe('01');
    expect(g.day).toBe('15');
  });
  test('no match returns Err', () => {
    const r = regex_capture('hello', '(?<n>\\d+)');
    expect(r.isErr()).toBe(true);
  });
});

// We need to import regex functions from inline (they're only in inline.js, not modular files yet)
// For testing, we'll eval them from the inline definitions
import { BUILTIN_FUNCTIONS, RESULT_OPTION } from '../src/stdlib/inline.js';
const _regexEnv = new Function(RESULT_OPTION + '\n' + BUILTIN_FUNCTIONS.__regex_cache + '\n' + BUILTIN_FUNCTIONS.regex_test + '\n' + BUILTIN_FUNCTIONS.regex_match + '\n' + BUILTIN_FUNCTIONS.regex_find_all + '\n' + BUILTIN_FUNCTIONS.regex_replace + '\n' + BUILTIN_FUNCTIONS.regex_split + '\n' + BUILTIN_FUNCTIONS.regex_capture + '\nreturn { regex_test, regex_match, regex_find_all, regex_replace, regex_split, regex_capture };')(); // safe: evaluating our own stdlib code in tests
const { regex_test, regex_match, regex_find_all, regex_replace, regex_split, regex_capture } = _regexEnv;

// ═══════════════════════════════════════════════════════════
// PHASE 3: Validation
// ═══════════════════════════════════════════════════════════

describe('Validation — is_email', () => {
  test('valid email', () => { expect(is_email('user@example.com')).toBe(true); });
  test('invalid no @', () => { expect(is_email('userexample.com')).toBe(false); });
  test('invalid no domain', () => { expect(is_email('user@')).toBe(false); });
  test('with subdomain', () => { expect(is_email('user@sub.example.com')).toBe(true); });
});

describe('Validation — is_url', () => {
  test('valid http', () => { expect(is_url('https://example.com')).toBe(true); });
  test('valid with path', () => { expect(is_url('https://example.com/path?q=1')).toBe(true); });
  test('invalid', () => { expect(is_url('not a url')).toBe(false); });
  test('missing protocol', () => { expect(is_url('example.com')).toBe(false); });
});

describe('Validation — is_numeric', () => {
  test('integer string', () => { expect(is_numeric('42')).toBe(true); });
  test('float string', () => { expect(is_numeric('3.14')).toBe(true); });
  test('negative', () => { expect(is_numeric('-5')).toBe(true); });
  test('not numeric', () => { expect(is_numeric('abc')).toBe(false); });
  test('empty string', () => { expect(is_numeric('')).toBe(false); });
});

describe('Validation — is_alpha', () => {
  test('letters only', () => { expect(is_alpha('Hello')).toBe(true); });
  test('with numbers', () => { expect(is_alpha('Hello123')).toBe(false); });
  test('with spaces', () => { expect(is_alpha('Hello World')).toBe(false); });
  test('empty', () => { expect(is_alpha('')).toBe(false); });
});

describe('Validation — is_alphanumeric', () => {
  test('letters and numbers', () => { expect(is_alphanumeric('Hello123')).toBe(true); });
  test('with special chars', () => { expect(is_alphanumeric('Hello!')).toBe(false); });
  test('just numbers', () => { expect(is_alphanumeric('12345')).toBe(true); });
});

describe('Validation — is_uuid', () => {
  test('valid uuid v4', () => { expect(is_uuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true); });
  test('invalid', () => { expect(is_uuid('not-a-uuid')).toBe(false); });
  test('wrong format', () => { expect(is_uuid('550e8400e29b41d4a716446655440000')).toBe(false); });
});

describe('Validation — is_hex', () => {
  test('valid hex', () => { expect(is_hex('1a2b3c')).toBe(true); });
  test('uppercase', () => { expect(is_hex('FF00AA')).toBe(true); });
  test('invalid', () => { expect(is_hex('xyz')).toBe(false); });
  test('empty', () => { expect(is_hex('')).toBe(false); });
});

// ═══════════════════════════════════════════════════════════
// PHASE 4: URL & UUID
// ═══════════════════════════════════════════════════════════

describe('UUID', () => {
  test('generates uuid string', () => {
    const id = uuid();
    expect(typeof id).toBe('string');
    expect(id.length).toBe(36);
    expect(id.split('-').length).toBe(5);
  });
  test('generates unique values', () => {
    const a = uuid();
    const b = uuid();
    expect(a).not.toBe(b);
  });
});

describe('URL — parse_url', () => {
  test('parses valid URL', () => {
    const r = parse_url('https://example.com/path?q=1#top');
    expect(r.isOk()).toBe(true);
    const u = r.unwrap();
    expect(u.protocol).toBe('https');
    expect(u.host).toBe('example.com');
    expect(u.pathname).toBe('/path');
    expect(u.search).toBe('?q=1');
    expect(u.hash).toBe('#top');
  });
  test('invalid URL returns Err', () => {
    const r = parse_url('not a url');
    expect(r.isErr()).toBe(true);
  });
});

describe('URL — build_url', () => {
  test('builds from parts', () => {
    const url = build_url({ protocol: 'https', host: 'example.com', pathname: '/api' });
    expect(url).toBe('https://example.com/api');
  });
  test('with query and hash', () => {
    const url = build_url({ host: 'example.com', search: 'q=1', hash: 'top' });
    expect(url).toBe('https://example.com/?q=1#top');
  });
});

describe('URL — parse_query', () => {
  test('parses query string', () => {
    expect(parse_query('a=1&b=hello')).toEqual({ a: '1', b: 'hello' });
  });
  test('with leading ?', () => {
    expect(parse_query('?x=10&y=20')).toEqual({ x: '10', y: '20' });
  });
  test('empty string', () => {
    expect(parse_query('')).toEqual({});
  });
  test('encoded values', () => {
    expect(parse_query('name=hello%20world')).toEqual({ name: 'hello world' });
  });
});

describe('URL — build_query', () => {
  test('builds from object', () => {
    expect(build_query({ a: '1', b: '2' })).toBe('a=1&b=2');
  });
  test('encodes special chars', () => {
    const q = build_query({ name: 'hello world' });
    expect(q).toBe('name=hello%20world');
  });
});

// ═══════════════════════════════════════════════════════════
// PHASE 5: Set Operations
// ═══════════════════════════════════════════════════════════

describe('Set Operations — intersection', () => {
  test('common elements', () => { expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]); });
  test('no common', () => { expect(intersection([1, 2], [3, 4])).toEqual([]); });
  test('all common', () => { expect(intersection([1, 2], [1, 2])).toEqual([1, 2]); });
});

describe('Set Operations — difference', () => {
  test('elements in a not b', () => { expect(difference([1, 2, 3], [2, 3, 4])).toEqual([1]); });
  test('no difference', () => { expect(difference([1, 2], [1, 2, 3])).toEqual([]); });
  test('all different', () => { expect(difference([1, 2], [3, 4])).toEqual([1, 2]); });
});

describe('Set Operations — symmetric_difference', () => {
  test('elements in either not both', () => {
    expect(symmetric_difference([1, 2, 3], [2, 3, 4])).toEqual([1, 4]);
  });
  test('identical arrays', () => {
    expect(symmetric_difference([1, 2], [1, 2])).toEqual([]);
  });
});

describe('Set Operations — is_subset', () => {
  test('is subset', () => { expect(is_subset([1, 2], [1, 2, 3])).toBe(true); });
  test('not subset', () => { expect(is_subset([1, 4], [1, 2, 3])).toBe(false); });
  test('empty is subset', () => { expect(is_subset([], [1, 2])).toBe(true); });
});

describe('Set Operations — is_superset', () => {
  test('is superset', () => { expect(is_superset([1, 2, 3], [1, 2])).toBe(true); });
  test('not superset', () => { expect(is_superset([1, 2], [1, 2, 3])).toBe(false); });
  test('superset of empty', () => { expect(is_superset([1, 2], [])).toBe(true); });
});

// ═══════════════════════════════════════════════════════════
// PHASE 6: Statistics
// ═══════════════════════════════════════════════════════════

describe('Statistics — mode', () => {
  test('most frequent', () => { expect(mode([1, 2, 2, 3, 3, 3])).toBe(3); });
  test('single element', () => { expect(mode([42])).toBe(42); });
  test('empty array', () => { expect(mode([])).toBeNull(); });
  test('strings', () => { expect(mode(['a', 'b', 'a'])).toBe('a'); });
});

describe('Statistics — stdev', () => {
  test('known stdev', () => {
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.0, 0);
  });
  test('all same', () => { expect(stdev([5, 5, 5])).toBe(0); });
  test('empty', () => { expect(stdev([])).toBe(0); });
});

describe('Statistics — variance', () => {
  test('known variance', () => {
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4.0, 0);
  });
  test('all same', () => { expect(variance([5, 5, 5])).toBe(0); });
  test('empty', () => { expect(variance([])).toBe(0); });
});

describe('Statistics — percentile', () => {
  test('50th percentile (median)', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });
  test('0th percentile', () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
  });
  test('100th percentile', () => {
    expect(percentile([10, 20, 30], 100)).toBe(30);
  });
  test('25th percentile', () => {
    expect(percentile([1, 2, 3, 4], 25)).toBe(1.75);
  });
  test('empty', () => { expect(percentile([], 50)).toBeNull(); });
});

// ═══════════════════════════════════════════════════════════
// PHASE 7: Text Utilities
// ═══════════════════════════════════════════════════════════

describe('Text — truncate', () => {
  test('truncates with ellipsis', () => { expect(truncate('Hello World', 8)).toBe('Hello...'); });
  test('no truncation needed', () => { expect(truncate('Hi', 10)).toBe('Hi'); });
  test('custom suffix', () => { expect(truncate('Hello World', 8, '..')).toBe('Hello ..'); });
  test('exact length', () => { expect(truncate('Hello', 5)).toBe('Hello'); });
});

describe('Text — word_wrap', () => {
  test('wraps at width', () => {
    expect(word_wrap('one two three four', 10)).toBe('one two\nthree four');
  });
  test('single long word', () => {
    expect(word_wrap('abcdefghij', 5)).toBe('abcdefghij');
  });
});

describe('Text — dedent', () => {
  test('removes common indent', () => {
    expect(dedent('  hello\n  world')).toBe('hello\nworld');
  });
  test('mixed indent', () => {
    expect(dedent('    line1\n  line2')).toBe('  line1\nline2');
  });
});

describe('Text — indent_str', () => {
  test('adds spaces', () => {
    expect(indent_str('hello\nworld', 2)).toBe('  hello\n  world');
  });
  test('custom char', () => {
    expect(indent_str('a\nb', 1, '>')).toBe('>a\n>b');
  });
});

describe('Text — slugify', () => {
  test('basic slug', () => { expect(slugify('Hello World!')).toBe('hello-world'); });
  test('special chars', () => { expect(slugify('A & B @ C')).toBe('a-b-c'); });
  test('already clean', () => { expect(slugify('hello-world')).toBe('hello-world'); });
  test('leading/trailing', () => { expect(slugify('  Hello  ')).toBe('hello'); });
});

describe('Text — escape_html / unescape_html', () => {
  test('escapes', () => { expect(escape_html('<b>"Hello" & \'World\'</b>')).toBe('&lt;b&gt;&quot;Hello&quot; &amp; &#39;World&#39;&lt;/b&gt;'); });
  test('roundtrip', () => {
    const s = '<script>alert("xss")</script>';
    expect(unescape_html(escape_html(s))).toBe(s);
  });
});

describe('Text — fmt', () => {
  test('basic formatting', () => { expect(fmt('Hello, {}!', 'world')).toBe('Hello, world!'); });
  test('multiple args', () => { expect(fmt('{} + {} = {}', 1, 2, 3)).toBe('1 + 2 = 3'); });
  test('missing args preserved', () => { expect(fmt('a {} b {} c', 'x')).toBe('a x b {} c'); });
});

// ═══════════════════════════════════════════════════════════
// PHASE 8: Number Formatting
// ═══════════════════════════════════════════════════════════

describe('Number — format_number', () => {
  test('with commas', () => { expect(format_number(1234567)).toBe('1,234,567'); });
  test('with decimals', () => { expect(format_number(1234.5, { decimals: 2 })).toBe('1,234.50'); });
  test('custom separator', () => { expect(format_number(1234567, { separator: '.' })).toBe('1.234.567'); });
  test('small number', () => { expect(format_number(42)).toBe('42'); });
});

describe('Number — to_hex', () => {
  test('255 → ff', () => { expect(to_hex(255)).toBe('ff'); });
  test('16 → 10', () => { expect(to_hex(16)).toBe('10'); });
  test('0 → 0', () => { expect(to_hex(0)).toBe('0'); });
});

describe('Number — to_binary', () => {
  test('10 → 1010', () => { expect(to_binary(10)).toBe('1010'); });
  test('255 → 11111111', () => { expect(to_binary(255)).toBe('11111111'); });
  test('0 → 0', () => { expect(to_binary(0)).toBe('0'); });
});

describe('Number — to_octal', () => {
  test('8 → 10', () => { expect(to_octal(8)).toBe('10'); });
  test('255 → 377', () => { expect(to_octal(255)).toBe('377'); });
});

describe('Number — to_fixed', () => {
  test('2 decimals', () => { expect(to_fixed(3.14159, 2)).toBe(3.14); });
  test('0 decimals', () => { expect(to_fixed(3.7, 0)).toBe(4); });
  test('returns number', () => { expect(typeof to_fixed(1.5, 1)).toBe('number'); });
});

// ═══════════════════════════════════════════════════════════
// PHASE 9: Itertools
// ═══════════════════════════════════════════════════════════

describe('Itertools — pairwise', () => {
  test('adjacent pairs', () => { expect(pairwise([1, 2, 3])).toEqual([[1, 2], [2, 3]]); });
  test('single element', () => { expect(pairwise([1])).toEqual([]); });
  test('empty', () => { expect(pairwise([])).toEqual([]); });
});

describe('Itertools — combinations', () => {
  test('C(4,2)', () => {
    expect(combinations([1, 2, 3, 4], 2)).toEqual([[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]);
  });
  test('C(3,3)', () => {
    expect(combinations([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });
  test('C(3,1)', () => {
    expect(combinations([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });
});

describe('Itertools — permutations', () => {
  test('P(3)', () => {
    expect(permutations([1, 2, 3]).length).toBe(6);
  });
  test('P(3,2)', () => {
    expect(permutations([1, 2, 3], 2).length).toBe(6);
    expect(permutations([1, 2, 3], 2)).toContainEqual([1, 2]);
    expect(permutations([1, 2, 3], 2)).toContainEqual([2, 1]);
  });
});

describe('Itertools — intersperse', () => {
  test('basic', () => { expect(intersperse([1, 2, 3], 0)).toEqual([1, 0, 2, 0, 3]); });
  test('single element', () => { expect(intersperse([1], 0)).toEqual([1]); });
  test('empty', () => { expect(intersperse([], 0)).toEqual([]); });
});

describe('Itertools — interleave', () => {
  test('two arrays', () => { expect(interleave([1, 2], ['a', 'b'])).toEqual([1, 'a', 2, 'b']); });
  test('uneven arrays', () => { expect(interleave([1, 2, 3], ['a', 'b'])).toEqual([1, 'a', 2, 'b', 3]); });
  test('three arrays', () => { expect(interleave([1], [2], [3])).toEqual([1, 2, 3]); });
});

describe('Itertools — repeat_value', () => {
  test('repeats value', () => { expect(repeat_value(0, 5)).toEqual([0, 0, 0, 0, 0]); });
  test('repeat string', () => { expect(repeat_value('x', 3)).toEqual(['x', 'x', 'x']); });
  test('repeat 0 times', () => { expect(repeat_value(1, 0)).toEqual([]); });
});

// ═══════════════════════════════════════════════════════════
// PHASE 10: Array Utilities & Functional
// ═══════════════════════════════════════════════════════════

describe('Array — binary_search', () => {
  test('finds element', () => { expect(binary_search([1, 3, 5, 7, 9], 5)).toBe(2); });
  test('not found', () => { expect(binary_search([1, 3, 5, 7, 9], 4)).toBe(-1); });
  test('first element', () => { expect(binary_search([1, 3, 5], 1)).toBe(0); });
  test('last element', () => { expect(binary_search([1, 3, 5], 5)).toBe(2); });
  test('with key fn', () => {
    const arr = [{v: 1}, {v: 3}, {v: 5}];
    expect(binary_search(arr, 3, x => x.v)).toBe(1);
  });
});

describe('Array — is_sorted', () => {
  test('sorted', () => { expect(is_sorted([1, 2, 3, 4])).toBe(true); });
  test('not sorted', () => { expect(is_sorted([1, 3, 2])).toBe(false); });
  test('empty', () => { expect(is_sorted([])).toBe(true); });
  test('single', () => { expect(is_sorted([1])).toBe(true); });
  test('with key fn', () => {
    expect(is_sorted([{n: 1}, {n: 2}, {n: 3}], x => x.n)).toBe(true);
  });
});

describe('Array — compact', () => {
  test('removes null/undefined', () => { expect(compact([1, null, 2, undefined, 3])).toEqual([1, 2, 3]); });
  test('keeps falsy values', () => { expect(compact([0, '', false, null])).toEqual([0, '', false]); });
  test('no nulls', () => { expect(compact([1, 2, 3])).toEqual([1, 2, 3]); });
});

describe('Array — rotate', () => {
  test('rotate right', () => { expect(rotate([1, 2, 3, 4, 5], 2)).toEqual([3, 4, 5, 1, 2]); });
  test('rotate left (negative)', () => { expect(rotate([1, 2, 3, 4, 5], -1)).toEqual([5, 1, 2, 3, 4]); });
  test('rotate by length', () => { expect(rotate([1, 2, 3], 3)).toEqual([1, 2, 3]); });
  test('empty', () => { expect(rotate([], 5)).toEqual([]); });
});

describe('Array — insert_at', () => {
  test('insert at index', () => { expect(insert_at([1, 2, 3], 1, 'x')).toEqual([1, 'x', 2, 3]); });
  test('insert at beginning', () => { expect(insert_at([1, 2], 0, 0)).toEqual([0, 1, 2]); });
  test('insert at end', () => { expect(insert_at([1, 2], 2, 3)).toEqual([1, 2, 3]); });
  test('immutable', () => {
    const arr = [1, 2, 3];
    insert_at(arr, 1, 'x');
    expect(arr).toEqual([1, 2, 3]);
  });
});

describe('Array — remove_at', () => {
  test('remove at index', () => { expect(remove_at([1, 2, 3], 1)).toEqual([1, 3]); });
  test('remove first', () => { expect(remove_at([1, 2, 3], 0)).toEqual([2, 3]); });
  test('remove last', () => { expect(remove_at([1, 2, 3], 2)).toEqual([1, 2]); });
  test('immutable', () => {
    const arr = [1, 2, 3];
    remove_at(arr, 1);
    expect(arr).toEqual([1, 2, 3]);
  });
});

describe('Array — update_at', () => {
  test('update at index', () => { expect(update_at([1, 2, 3], 1, 'x')).toEqual([1, 'x', 3]); });
  test('immutable', () => {
    const arr = [1, 2, 3];
    update_at(arr, 0, 99);
    expect(arr).toEqual([1, 2, 3]);
  });
});

describe('Functional — partial', () => {
  test('partially applies', () => {
    const add = (a, b) => a + b;
    const add5 = partial(add, 5);
    expect(add5(3)).toBe(8);
  });
  test('multiple bound args', () => {
    const fn = (a, b, c) => a + b + c;
    const bound = partial(fn, 1, 2);
    expect(bound(3)).toBe(6);
  });
});

describe('Functional — curry', () => {
  test('curries function', () => {
    const add = curry((a, b, c) => a + b + c);
    expect(add(1)(2)(3)).toBe(6);
    expect(add(1, 2)(3)).toBe(6);
    expect(add(1)(2, 3)).toBe(6);
    expect(add(1, 2, 3)).toBe(6);
  });
  test('with explicit arity', () => {
    const fn = curry((...args) => args.reduce((a, b) => a + b, 0), 3);
    expect(fn(1)(2)(3)).toBe(6);
  });
});

describe('Functional — flip', () => {
  test('swaps first two args', () => {
    const sub = (a, b) => a - b;
    const flipped = flip(sub);
    expect(flipped(3, 10)).toBe(7); // sub(10, 3)
  });
});

describe('Encoding — hex', () => {
  test('encode', () => { expect(hex_encode('hello')).toBe('68656c6c6f'); });
  test('decode', () => { expect(hex_decode('68656c6c6f')).toBe('hello'); });
  test('roundtrip', () => { expect(hex_decode(hex_encode('abc'))).toBe('abc'); });
});

describe('Text — fmt (string)', () => {
  test('simple placeholder', () => { expect(fmt('Hello {}', 'World')).toBe('Hello World'); });
  test('numbers', () => { expect(fmt('{} items at ${}', 3, 9.99)).toBe('3 items at $9.99'); });
});
