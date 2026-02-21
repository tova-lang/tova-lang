// Advanced collection data structures for Tova
// These are the real JS implementations used for testing and reference.

export class OrderedDict {
  constructor(entries) {
    this._map = new Map(entries || []);
  }
  get(key) { return this._map.has(key) ? this._map.get(key) : null; }
  set(key, value) { const m = new Map(this._map); m.set(key, value); return new OrderedDict([...m]); }
  delete(key) { const m = new Map(this._map); m.delete(key); return new OrderedDict([...m]); }
  has(key) { return this._map.has(key); }
  keys() { return [...this._map.keys()]; }
  values() { return [...this._map.values()]; }
  entries() { return [...this._map.entries()]; }
  get length() { return this._map.size; }
  [Symbol.iterator]() { return this._map[Symbol.iterator](); }
  toString() { return 'OrderedDict(' + this._map.size + ' entries)'; }
}

export class DefaultDict {
  constructor(defaultFn) {
    this._map = new Map();
    this._default = defaultFn;
  }
  get(key) {
    if (!this._map.has(key)) {
      this._map.set(key, this._default());
    }
    return this._map.get(key);
  }
  set(key, value) { this._map.set(key, value); return this; }
  has(key) { return this._map.has(key); }
  delete(key) { this._map.delete(key); return this; }
  keys() { return [...this._map.keys()]; }
  values() { return [...this._map.values()]; }
  entries() { return [...this._map.entries()]; }
  get length() { return this._map.size; }
  [Symbol.iterator]() { return this._map[Symbol.iterator](); }
  toString() { return 'DefaultDict(' + this._map.size + ' entries)'; }
}

export class Counter {
  constructor(items) {
    this._counts = new Map();
    if (items) {
      for (const item of items) {
        const k = item;
        this._counts.set(k, (this._counts.get(k) || 0) + 1);
      }
    }
  }
  count(item) { return this._counts.get(item) || 0; }
  total() { let s = 0; for (const v of this._counts.values()) s += v; return s; }
  most_common(n) {
    const sorted = [...this._counts.entries()].sort((a, b) => b[1] - a[1]);
    return n !== undefined ? sorted.slice(0, n) : sorted;
  }
  keys() { return [...this._counts.keys()]; }
  values() { return [...this._counts.values()]; }
  entries() { return [...this._counts.entries()]; }
  has(item) { return this._counts.has(item); }
  get length() { return this._counts.size; }
  [Symbol.iterator]() { return this._counts[Symbol.iterator](); }
  toString() { return 'Counter(' + this._counts.size + ' items)'; }
}

export class Deque {
  constructor(items) {
    this._items = items ? [...items] : [];
  }
  push_back(val) { return new Deque([...this._items, val]); }
  push_front(val) { return new Deque([val, ...this._items]); }
  pop_back() { if (this._items.length === 0) return [null, this]; const items = this._items.slice(0, -1); return [this._items[this._items.length - 1], new Deque(items)]; }
  pop_front() { if (this._items.length === 0) return [null, this]; return [this._items[0], new Deque(this._items.slice(1))]; }
  peek_front() { return this._items.length > 0 ? this._items[0] : null; }
  peek_back() { return this._items.length > 0 ? this._items[this._items.length - 1] : null; }
  get length() { return this._items.length; }
  toArray() { return [...this._items]; }
  [Symbol.iterator]() { return this._items[Symbol.iterator](); }
  toString() { return 'Deque(' + this._items.length + ' items)'; }
}
