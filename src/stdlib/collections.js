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
