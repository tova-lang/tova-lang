// Tova standard library — core functions

export function print(...args) {
  console.log(...args);
}

export function range(startOrEnd, end, step) {
  if (end === undefined) {
    end = startOrEnd;
    startOrEnd = 0;
  }
  if (step === undefined) {
    step = startOrEnd < end ? 1 : -1;
  }
  const result = [];
  if (step > 0) {
    for (let i = startOrEnd; i < end; i += step) result.push(i);
  } else {
    for (let i = startOrEnd; i > end; i += step) result.push(i);
  }
  return result;
}

export function len(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string' || Array.isArray(value)) return value.length;
  if (typeof value === 'object') return Object.keys(value).length;
  return 0;
}

export function type_of(value) {
  if (value === null) return 'Nil';
  if (Array.isArray(value)) return 'List';
  if (value?.__tag) return value.__tag;
  const t = typeof value;
  switch (t) {
    case 'number': return Number.isInteger(value) ? 'Int' : 'Float';
    case 'string': return 'String';
    case 'boolean': return 'Bool';
    case 'function': return 'Function';
    case 'object': return 'Object';
    default: return 'Unknown';
  }
}

export function enumerate(iterable) {
  return iterable.map((item, index) => [index, item]);
}

export function zip(...iterables) {
  const minLen = Math.min(...iterables.map(a => a.length));
  const result = [];
  for (let i = 0; i < minLen; i++) {
    result.push(iterables.map(a => a[i]));
  }
  return result;
}

export function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

export function sorted(arr, key) {
  const copy = [...arr];
  if (key) {
    copy.sort((a, b) => {
      const ka = key(a), kb = key(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  } else {
    copy.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  }
  return copy;
}

export function reversed(arr) {
  return [...arr].reverse();
}

export function flat_map(arr, fn) {
  return arr.flatMap(fn);
}

export function min(arr) {
  return Math.min(...arr);
}

export function max(arr) {
  return Math.max(...arr);
}

export function any(arr, fn) {
  return arr.some(fn || Boolean);
}

export function all(arr, fn) {
  return arr.every(fn || Boolean);
}

// ── Randomness ──────────────────────────────────────────

export function random_int(lo, hi) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function random_float(lo, hi) {
  return Math.random() * (hi - lo) + lo;
}

export function choice(arr) {
  return arr.length === 0 ? null : arr[Math.floor(Math.random() * arr.length)];
}

export function sample(arr, n) {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c.slice(0, n);
}

export function shuffle(arr) {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

// ── Type Conversion ─────────────────────────────────────

export function to_int(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = typeof v === 'string' ? parseInt(v, 10) : Math.trunc(Number(v));
  return isNaN(n) ? null : n;
}

export function to_float(v) {
  if (typeof v === 'boolean') return v ? 1.0 : 0.0;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export function to_string(v) {
  if (v == null) return 'nil';
  if (v && v.__tag) return v.__tag + (v.value !== undefined ? '(' + String(v.value) + ')' : '');
  return String(v);
}

export function to_bool(v) {
  if (typeof v === 'string') return v !== '' && v !== '0' && v !== 'false';
  return Boolean(v);
}

// ── General Utilities ────────────────────────────────────

export function is_empty(v) {
  if (v == null) return true;
  if (typeof v === 'string' || Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

// ── Date/Time ────────────────────────────────────────────

export function now() {
  return Date.now();
}

export function now_iso() {
  return new Date().toISOString();
}
