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

// ── Set Operations ────────────────────────────────────────

export function intersection(a, b) {
  const s = new Set(b);
  return a.filter(x => s.has(x));
}

export function difference(a, b) {
  const s = new Set(b);
  return a.filter(x => !s.has(x));
}

export function symmetric_difference(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  return [...a.filter(x => !sb.has(x)), ...b.filter(x => !sa.has(x))];
}

export function is_subset(a, b) {
  const s = new Set(b);
  return a.every(x => s.has(x));
}

export function is_superset(a, b) {
  const s = new Set(a);
  return b.every(x => s.has(x));
}

// ── Itertools ─────────────────────────────────────────────

export function pairwise(arr) {
  const r = [];
  for (let i = 0; i < arr.length - 1; i++) r.push([arr[i], arr[i + 1]]);
  return r;
}

export function combinations(arr, r) {
  const result = [];
  const combo = [];
  function gen(start, depth) {
    if (depth === r) { result.push([...combo]); return; }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      gen(i + 1, depth + 1);
      combo.pop();
    }
  }
  gen(0, 0);
  return result;
}

export function permutations(arr, r) {
  const n = r === undefined ? arr.length : r;
  const result = [];
  const perm = [];
  const used = new Array(arr.length).fill(false);
  function gen() {
    if (perm.length === n) { result.push([...perm]); return; }
    for (let i = 0; i < arr.length; i++) {
      if (!used[i]) {
        used[i] = true;
        perm.push(arr[i]);
        gen();
        perm.pop();
        used[i] = false;
      }
    }
  }
  gen();
  return result;
}

export function intersperse(arr, sep) {
  if (arr.length <= 1) return [...arr];
  const r = [arr[0]];
  for (let i = 1; i < arr.length; i++) { r.push(sep, arr[i]); }
  return r;
}

export function interleave(...arrs) {
  const m = Math.max(...arrs.map(a => a.length));
  const r = [];
  for (let i = 0; i < m; i++) {
    for (const a of arrs) { if (i < a.length) r.push(a[i]); }
  }
  return r;
}

export function repeat_value(val, n) {
  return Array(n).fill(val);
}

// ── Array Utilities ───────────────────────────────────────

export function binary_search(arr, target, keyFn) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const val = keyFn ? keyFn(arr[mid]) : arr[mid];
    if (val === target) return mid;
    if (val < target) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}

export function is_sorted(arr, keyFn) {
  for (let i = 1; i < arr.length; i++) {
    const a = keyFn ? keyFn(arr[i - 1]) : arr[i - 1];
    const b = keyFn ? keyFn(arr[i]) : arr[i];
    if (a > b) return false;
  }
  return true;
}

export function compact(arr) {
  return arr.filter(v => v != null);
}

export function rotate(arr, n) {
  if (arr.length === 0) return [];
  const k = ((n % arr.length) + arr.length) % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

export function insert_at(arr, idx, val) {
  const r = [...arr];
  r.splice(idx, 0, val);
  return r;
}

export function remove_at(arr, idx) {
  const r = [...arr];
  r.splice(idx, 1);
  return r;
}

export function update_at(arr, idx, val) {
  const r = [...arr];
  r[idx] = val;
  return r;
}
