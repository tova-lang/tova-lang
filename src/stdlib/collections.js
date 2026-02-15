// Tova standard library — collection helpers

export function map(arr, fn) {
  return arr.map(fn);
}

export function filter(arr, fn) {
  return arr.filter(fn);
}

export function reduce(arr, fn, initial) {
  if (initial !== undefined) return arr.reduce(fn, initial);
  return arr.reduce(fn);
}

export function find(arr, fn) {
  return arr.find(fn) ?? null;
}

export function find_index(arr, fn) {
  const idx = arr.findIndex(fn);
  return idx === -1 ? null : idx;
}

export function includes(arr, value) {
  return arr.includes(value);
}

export function unique(arr) {
  return [...new Set(arr)];
}

export function group_by(arr, fn) {
  const result = {};
  for (const item of arr) {
    const key = typeof fn === 'function' ? fn(item) : item[fn];
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

export function chunk(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export function flatten(arr, depth = Infinity) {
  return arr.flat(depth);
}

export function take(arr, n) {
  return arr.slice(0, n);
}

export function drop(arr, n) {
  return arr.slice(n);
}

export function first(arr) {
  return arr.length > 0 ? arr[0] : null;
}

export function last(arr) {
  return arr.length > 0 ? arr[arr.length - 1] : null;
}

export function count(arr, fn) {
  if (!fn) return arr.length;
  return arr.filter(fn).length;
}

export function entries(obj) {
  return Object.entries(obj);
}

export function keys(obj) {
  return Object.keys(obj);
}

export function values(obj) {
  return Object.values(obj);
}

export function merge(...objects) {
  return Object.assign({}, ...objects);
}

export function partition(arr, fn) {
  const y = [], n = [];
  for (const v of arr) { (fn(v) ? y : n).push(v); }
  return [y, n];
}

export function zip_with(a, b, fn) {
  const m = Math.min(a.length, b.length);
  const r = [];
  for (let i = 0; i < m; i++) r.push(fn(a[i], b[i]));
  return r;
}

export function frequencies(arr) {
  const r = {};
  for (const v of arr) {
    const k = String(v);
    r[k] = (r[k] || 0) + 1;
  }
  return r;
}

export function scan(arr, fn, init) {
  const r = [];
  let acc = init;
  for (const v of arr) { acc = fn(acc, v); r.push(acc); }
  return r;
}

export function min_by(arr, fn) {
  if (arr.length === 0) return null;
  let best = arr[0], bestK = fn(arr[0]);
  for (let i = 1; i < arr.length; i++) {
    const k = fn(arr[i]);
    if (k < bestK) { best = arr[i]; bestK = k; }
  }
  return best;
}

export function max_by(arr, fn) {
  if (arr.length === 0) return null;
  let best = arr[0], bestK = fn(arr[0]);
  for (let i = 1; i < arr.length; i++) {
    const k = fn(arr[i]);
    if (k > bestK) { best = arr[i]; bestK = k; }
  }
  return best;
}

export function sum_by(arr, fn) {
  let s = 0;
  for (const v of arr) s += fn(v);
  return s;
}

export function product(arr) {
  return arr.reduce((a, b) => a * b, 1);
}

export function from_entries(pairs) {
  return Object.fromEntries(pairs);
}

export function has_key(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

export function get(obj, path, def) {
  const keys = Array.isArray(path) ? path : String(path).split('.');
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return def !== undefined ? def : null;
    cur = cur[k];
  }
  return cur !== undefined ? cur : (def !== undefined ? def : null);
}

export function pick(obj, ks) {
  const r = {};
  for (const k of ks) { if (k in obj) r[k] = obj[k]; }
  return r;
}

export function omit(obj, ks) {
  const s = new Set(ks);
  const r = {};
  for (const k of Object.keys(obj)) { if (!s.has(k)) r[k] = obj[k]; }
  return r;
}

export function map_values(obj, fn) {
  const r = {};
  for (const [k, v] of Object.entries(obj)) r[k] = fn(v, k);
  return r;
}

export function sliding_window(arr, n) {
  if (n <= 0 || n > arr.length) return [];
  const r = [];
  for (let i = 0; i <= arr.length - n; i++) r.push(arr.slice(i, i + n));
  return r;
}
