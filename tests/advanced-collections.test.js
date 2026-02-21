import { describe, test, expect } from "bun:test";
import { OrderedDict, DefaultDict, Counter, Deque } from '../src/stdlib/advanced-collections.js';

// =============================================================================
// OrderedDict
// =============================================================================

describe("OrderedDict", () => {
  test("create empty", () => {
    const od = new OrderedDict();
    expect(od.length).toBe(0);
    expect(od.keys()).toEqual([]);
    expect(od.values()).toEqual([]);
    expect(od.entries()).toEqual([]);
  });

  test("create with entries", () => {
    const od = new OrderedDict([['a', 1], ['b', 2]]);
    expect(od.length).toBe(2);
    expect(od.get('a')).toBe(1);
    expect(od.get('b')).toBe(2);
  });

  test("get returns value for existing key", () => {
    const od = new OrderedDict([['x', 42]]);
    expect(od.get('x')).toBe(42);
  });

  test("get returns null for missing key", () => {
    const od = new OrderedDict();
    expect(od.get('missing')).toBeNull();
  });

  test("set returns a NEW OrderedDict (immutable)", () => {
    const od1 = new OrderedDict();
    const od2 = od1.set('a', 1);
    expect(od2).not.toBe(od1);
    expect(od2).toBeInstanceOf(OrderedDict);
    expect(od2.get('a')).toBe(1);
    expect(od1.get('a')).toBeNull();
  });

  test("set overwrites existing key value", () => {
    const od1 = new OrderedDict([['a', 1]]);
    const od2 = od1.set('a', 99);
    expect(od2.get('a')).toBe(99);
    expect(od1.get('a')).toBe(1);
  });

  test("delete returns a NEW OrderedDict", () => {
    const od1 = new OrderedDict([['a', 1], ['b', 2]]);
    const od2 = od1.delete('a');
    expect(od2).not.toBe(od1);
    expect(od2).toBeInstanceOf(OrderedDict);
    expect(od2.has('a')).toBe(false);
    expect(od2.has('b')).toBe(true);
    expect(od1.has('a')).toBe(true);
  });

  test("delete on missing key returns new OrderedDict unchanged", () => {
    const od1 = new OrderedDict([['a', 1]]);
    const od2 = od1.delete('z');
    expect(od2.length).toBe(1);
    expect(od2.get('a')).toBe(1);
  });

  test("has returns true for existing keys", () => {
    const od = new OrderedDict([['a', 1]]);
    expect(od.has('a')).toBe(true);
  });

  test("has returns false for missing keys", () => {
    const od = new OrderedDict();
    expect(od.has('nope')).toBe(false);
  });

  test("keys() returns array of keys", () => {
    const od = new OrderedDict([['a', 1], ['b', 2], ['c', 3]]);
    expect(od.keys()).toEqual(['a', 'b', 'c']);
  });

  test("values() returns array of values", () => {
    const od = new OrderedDict([['a', 1], ['b', 2], ['c', 3]]);
    expect(od.values()).toEqual([1, 2, 3]);
  });

  test("entries() returns array of [key, value] pairs", () => {
    const od = new OrderedDict([['a', 1], ['b', 2]]);
    expect(od.entries()).toEqual([['a', 1], ['b', 2]]);
  });

  test("length getter returns correct count", () => {
    const od = new OrderedDict([['a', 1], ['b', 2], ['c', 3]]);
    expect(od.length).toBe(3);
  });

  test("[Symbol.iterator] works with spread", () => {
    const od = new OrderedDict([['a', 1], ['b', 2]]);
    const spread = [...od];
    expect(spread).toEqual([['a', 1], ['b', 2]]);
  });

  test("[Symbol.iterator] works with for-of", () => {
    const od = new OrderedDict([['x', 10], ['y', 20]]);
    const collected = [];
    for (const entry of od) {
      collected.push(entry);
    }
    expect(collected).toEqual([['x', 10], ['y', 20]]);
  });

  test("toString returns 'OrderedDict(N entries)'", () => {
    const od0 = new OrderedDict();
    expect(od0.toString()).toBe('OrderedDict(0 entries)');

    const od2 = new OrderedDict([['a', 1], ['b', 2]]);
    expect(od2.toString()).toBe('OrderedDict(2 entries)');
  });

  test("insertion order is preserved", () => {
    let od = new OrderedDict();
    od = od.set('c', 3);
    od = od.set('a', 1);
    od = od.set('b', 2);
    expect(od.keys()).toEqual(['c', 'a', 'b']);
    expect(od.values()).toEqual([3, 1, 2]);
    expect(od.entries()).toEqual([['c', 3], ['a', 1], ['b', 2]]);
  });

  test("insertion order preserved after delete", () => {
    const od = new OrderedDict([['a', 1], ['b', 2], ['c', 3]]);
    const od2 = od.delete('b');
    expect(od2.keys()).toEqual(['a', 'c']);
    expect(od2.values()).toEqual([1, 3]);
  });
});

// =============================================================================
// DefaultDict
// =============================================================================

describe("DefaultDict", () => {
  test("create with array factory", () => {
    const dd = new DefaultDict(() => []);
    expect(dd.length).toBe(0);
  });

  test("get auto-creates missing keys with factory", () => {
    const dd = new DefaultDict(() => []);
    const val = dd.get('fruits');
    expect(val).toEqual([]);
    expect(dd.has('fruits')).toBe(true);
  });

  test("get returns existing value for known key", () => {
    const dd = new DefaultDict(() => []);
    dd.set('colors', ['red', 'blue']);
    expect(dd.get('colors')).toEqual(['red', 'blue']);
  });

  test("set stores a value", () => {
    const dd = new DefaultDict(() => 0);
    dd.set('count', 42);
    expect(dd.get('count')).toBe(42);
  });

  test("has returns true for existing keys", () => {
    const dd = new DefaultDict(() => 0);
    dd.set('x', 10);
    expect(dd.has('x')).toBe(true);
  });

  test("has returns false for missing keys (without auto-creating)", () => {
    const dd = new DefaultDict(() => 0);
    expect(dd.has('missing')).toBe(false);
  });

  test("delete removes a key", () => {
    const dd = new DefaultDict(() => 0);
    dd.set('a', 1);
    dd.set('b', 2);
    dd.delete('a');
    expect(dd.has('a')).toBe(false);
    expect(dd.has('b')).toBe(true);
  });

  test("keys() returns array of keys", () => {
    const dd = new DefaultDict(() => 0);
    dd.set('x', 1);
    dd.set('y', 2);
    const keys = dd.keys();
    expect(keys).toContain('x');
    expect(keys).toContain('y');
    expect(keys.length).toBe(2);
  });

  test("values() returns array of values", () => {
    const dd = new DefaultDict(() => 0);
    dd.set('x', 10);
    dd.set('y', 20);
    const values = dd.values();
    expect(values).toContain(10);
    expect(values).toContain(20);
    expect(values.length).toBe(2);
  });

  test("entries() returns array of [key, value] pairs", () => {
    const dd = new DefaultDict(() => 0);
    dd.set('a', 1);
    dd.set('b', 2);
    const entries = dd.entries();
    expect(entries.length).toBe(2);
    expect(entries).toContainEqual(['a', 1]);
    expect(entries).toContainEqual(['b', 2]);
  });

  test("length getter returns correct count", () => {
    const dd = new DefaultDict(() => []);
    expect(dd.length).toBe(0);
    dd.set('a', [1]);
    expect(dd.length).toBe(1);
    dd.get('b'); // auto-creates
    expect(dd.length).toBe(2);
  });

  test("toString returns correct string", () => {
    const dd = new DefaultDict(() => 0);
    dd.set('a', 1);
    dd.set('b', 2);
    expect(dd.toString()).toBe('DefaultDict(2 entries)');
  });

  test("works with number factory () => 0", () => {
    const dd = new DefaultDict(() => 0);
    expect(dd.get('counter')).toBe(0);
    dd.set('counter', dd.get('counter') + 1);
    expect(dd.get('counter')).toBe(1);
  });

  test("auto-created values are independent references", () => {
    const dd = new DefaultDict(() => []);
    dd.get('a').push(1);
    dd.get('b').push(2);
    expect(dd.get('a')).toEqual([1]);
    expect(dd.get('b')).toEqual([2]);
  });
});

// =============================================================================
// Counter
// =============================================================================

describe("Counter", () => {
  test("create empty", () => {
    const c = new Counter();
    expect(c.length).toBe(0);
    expect(c.total()).toBe(0);
  });

  test("create with items array", () => {
    const c = new Counter(['a', 'b', 'a', 'c', 'a']);
    expect(c.count('a')).toBe(3);
    expect(c.count('b')).toBe(1);
    expect(c.count('c')).toBe(1);
  });

  test("count returns count for existing item", () => {
    const c = new Counter(['x', 'x', 'y']);
    expect(c.count('x')).toBe(2);
    expect(c.count('y')).toBe(1);
  });

  test("count returns 0 for missing item", () => {
    const c = new Counter(['a']);
    expect(c.count('z')).toBe(0);
  });

  test("total returns sum of all counts", () => {
    const c = new Counter(['a', 'b', 'a', 'c', 'a']);
    expect(c.total()).toBe(5);
  });

  test("total returns 0 for empty counter", () => {
    const c = new Counter();
    expect(c.total()).toBe(0);
  });

  test("most_common(n) returns top n entries sorted by count desc", () => {
    const c = new Counter(['a', 'b', 'a', 'c', 'a', 'b']);
    const top2 = c.most_common(2);
    expect(top2.length).toBe(2);
    expect(top2[0][0]).toBe('a');
    expect(top2[0][1]).toBe(3);
    expect(top2[1][0]).toBe('b');
    expect(top2[1][1]).toBe(2);
  });

  test("most_common() with no arg returns all sorted", () => {
    const c = new Counter(['a', 'b', 'a', 'c', 'a', 'b']);
    const all = c.most_common();
    expect(all.length).toBe(3);
    expect(all[0]).toEqual(['a', 3]);
    expect(all[1]).toEqual(['b', 2]);
    expect(all[2]).toEqual(['c', 1]);
  });

  test("keys() returns array of unique items", () => {
    const c = new Counter(['a', 'b', 'a']);
    const keys = c.keys();
    expect(keys).toContain('a');
    expect(keys).toContain('b');
    expect(keys.length).toBe(2);
  });

  test("values() returns array of counts", () => {
    const c = new Counter(['a', 'b', 'a']);
    const values = c.values();
    expect(values).toContain(2);
    expect(values).toContain(1);
    expect(values.length).toBe(2);
  });

  test("entries() returns [item, count] pairs", () => {
    const c = new Counter(['x', 'y', 'x']);
    const entries = c.entries();
    expect(entries).toContainEqual(['x', 2]);
    expect(entries).toContainEqual(['y', 1]);
    expect(entries.length).toBe(2);
  });

  test("has returns true for counted items", () => {
    const c = new Counter(['a', 'b']);
    expect(c.has('a')).toBe(true);
    expect(c.has('b')).toBe(true);
  });

  test("has returns false for uncounted items", () => {
    const c = new Counter(['a']);
    expect(c.has('z')).toBe(false);
  });

  test("length getter returns number of unique items", () => {
    const c = new Counter(['a', 'b', 'a', 'c', 'a']);
    expect(c.length).toBe(3);
  });

  test("toString returns correct string", () => {
    const c = new Counter(['a', 'b', 'a']);
    expect(c.toString()).toBe('Counter(2 items)');
  });

  test("[Symbol.iterator] works with spread", () => {
    const c = new Counter(['a', 'b', 'a']);
    const spread = [...c];
    expect(spread.length).toBe(2);
    expect(spread).toContainEqual(['a', 2]);
    expect(spread).toContainEqual(['b', 1]);
  });

  test("[Symbol.iterator] works with for-of", () => {
    const c = new Counter(['x', 'y', 'x']);
    const collected = [];
    for (const entry of c) {
      collected.push(entry);
    }
    expect(collected.length).toBe(2);
    expect(collected).toContainEqual(['x', 2]);
    expect(collected).toContainEqual(['y', 1]);
  });
});

// =============================================================================
// Deque
// =============================================================================

describe("Deque", () => {
  test("create empty", () => {
    const d = new Deque();
    expect(d.length).toBe(0);
    expect(d.toArray()).toEqual([]);
  });

  test("create with items", () => {
    const d = new Deque([1, 2, 3]);
    expect(d.length).toBe(3);
    expect(d.toArray()).toEqual([1, 2, 3]);
  });

  test("push_back returns a NEW Deque (immutable)", () => {
    const d1 = new Deque([1, 2]);
    const d2 = d1.push_back(3);
    expect(d2).not.toBe(d1);
    expect(d2).toBeInstanceOf(Deque);
    expect(d2.toArray()).toEqual([1, 2, 3]);
    expect(d1.toArray()).toEqual([1, 2]);
  });

  test("push_back on empty deque", () => {
    const d = new Deque();
    const d2 = d.push_back(42);
    expect(d2.toArray()).toEqual([42]);
    expect(d.toArray()).toEqual([]);
  });

  test("push_front returns a NEW Deque (immutable)", () => {
    const d1 = new Deque([2, 3]);
    const d2 = d1.push_front(1);
    expect(d2).not.toBe(d1);
    expect(d2).toBeInstanceOf(Deque);
    expect(d2.toArray()).toEqual([1, 2, 3]);
    expect(d1.toArray()).toEqual([2, 3]);
  });

  test("push_front on empty deque", () => {
    const d = new Deque();
    const d2 = d.push_front(99);
    expect(d2.toArray()).toEqual([99]);
  });

  test("pop_back returns [value, newDeque]", () => {
    const d = new Deque([1, 2, 3]);
    const [value, newDeque] = d.pop_back();
    expect(value).toBe(3);
    expect(newDeque).toBeInstanceOf(Deque);
    expect(newDeque.toArray()).toEqual([1, 2]);
    expect(d.toArray()).toEqual([1, 2, 3]);
  });

  test("pop_back on empty deque returns [null, this]", () => {
    const d = new Deque();
    const [value, newDeque] = d.pop_back();
    expect(value).toBeNull();
    expect(newDeque).toBe(d);
  });

  test("pop_front returns [value, newDeque]", () => {
    const d = new Deque([1, 2, 3]);
    const [value, newDeque] = d.pop_front();
    expect(value).toBe(1);
    expect(newDeque).toBeInstanceOf(Deque);
    expect(newDeque.toArray()).toEqual([2, 3]);
    expect(d.toArray()).toEqual([1, 2, 3]);
  });

  test("pop_front on empty deque returns [null, this]", () => {
    const d = new Deque();
    const [value, newDeque] = d.pop_front();
    expect(value).toBeNull();
    expect(newDeque).toBe(d);
  });

  test("peek_front returns first value", () => {
    const d = new Deque([10, 20, 30]);
    expect(d.peek_front()).toBe(10);
  });

  test("peek_front returns null for empty deque", () => {
    const d = new Deque();
    expect(d.peek_front()).toBeNull();
  });

  test("peek_back returns last value", () => {
    const d = new Deque([10, 20, 30]);
    expect(d.peek_back()).toBe(30);
  });

  test("peek_back returns null for empty deque", () => {
    const d = new Deque();
    expect(d.peek_back()).toBeNull();
  });

  test("length getter returns correct count", () => {
    expect(new Deque().length).toBe(0);
    expect(new Deque([1]).length).toBe(1);
    expect(new Deque([1, 2, 3, 4, 5]).length).toBe(5);
  });

  test("toArray returns a plain array", () => {
    const d = new Deque([1, 2, 3]);
    const arr = d.toArray();
    expect(Array.isArray(arr)).toBe(true);
    expect(arr).toEqual([1, 2, 3]);
  });

  test("toString returns correct string", () => {
    const d = new Deque([1, 2, 3]);
    expect(d.toString()).toBe('Deque(3 items)');

    const empty = new Deque();
    expect(empty.toString()).toBe('Deque(0 items)');
  });

  test("[Symbol.iterator] works with spread", () => {
    const d = new Deque([1, 2, 3]);
    expect([...d]).toEqual([1, 2, 3]);
  });

  test("[Symbol.iterator] works with for-of", () => {
    const d = new Deque([10, 20, 30]);
    const collected = [];
    for (const val of d) {
      collected.push(val);
    }
    expect(collected).toEqual([10, 20, 30]);
  });

  test("chained push operations maintain immutability", () => {
    const d1 = new Deque();
    const d2 = d1.push_back(1);
    const d3 = d2.push_back(2);
    const d4 = d3.push_front(0);

    expect(d1.toArray()).toEqual([]);
    expect(d2.toArray()).toEqual([1]);
    expect(d3.toArray()).toEqual([1, 2]);
    expect(d4.toArray()).toEqual([0, 1, 2]);
  });

  test("pop then push maintains correct state", () => {
    const d = new Deque([1, 2, 3]);
    const [val, d2] = d.pop_front();
    expect(val).toBe(1);
    const d3 = d2.push_back(4);
    expect(d3.toArray()).toEqual([2, 3, 4]);
  });
});
