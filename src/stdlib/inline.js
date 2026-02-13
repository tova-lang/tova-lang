// Lux standard library — inline string versions for codegen
// Single source of truth for all inline stdlib code used in code generation.
// Used by: base-codegen.js, client-codegen.js, bin/lux.js

export const RESULT_OPTION = `function Ok(value) { return Object.freeze({ __tag: "Ok", value, map(fn) { return Ok(fn(value)); }, flatMap(fn) { return fn(value); }, unwrap() { return value; }, unwrapOr(_) { return value; }, expect(_) { return value; }, isOk() { return true; }, isErr() { return false; }, mapErr(_) { return this; }, unwrapErr() { throw new Error("Called unwrapErr on Ok"); }, or(_) { return this; }, and(other) { return other; } }); }
function Err(error) { return Object.freeze({ __tag: "Err", error, map(_) { return this; }, flatMap(_) { return this; }, unwrap() { throw new Error("Called unwrap on Err: " + error); }, unwrapOr(def) { return def; }, expect(msg) { throw new Error(msg); }, isOk() { return false; }, isErr() { return true; }, mapErr(fn) { return Err(fn(error)); }, unwrapErr() { return error; }, or(other) { return other; }, and(_) { return this; } }); }
function Some(value) { return Object.freeze({ __tag: "Some", value, map(fn) { return Some(fn(value)); }, flatMap(fn) { return fn(value); }, unwrap() { return value; }, unwrapOr(_) { return value; }, expect(_) { return value; }, isSome() { return true; }, isNone() { return false; }, or(_) { return this; }, and(other) { return other; }, filter(pred) { return pred(value) ? this : None; } }); }
const None = Object.freeze({ __tag: "None", map(_) { return None; }, flatMap(_) { return None; }, unwrap() { throw new Error("Called unwrap on None"); }, unwrapOr(def) { return def; }, expect(msg) { throw new Error(msg); }, isSome() { return false; }, isNone() { return true; }, or(other) { return other; }, and(_) { return None; }, filter(_) { return None; } });`;

export const PROPAGATE = `function __propagate(val) {
  if (val && val.__tag === "Err") throw { __lux_propagate: true, value: val };
  if (val && val.__tag === "None") throw { __lux_propagate: true, value: val };
  if (val && val.__tag === "Ok") return val.value;
  if (val && val.__tag === "Some") return val.value;
  return val;
}`;

export const BUILTINS = `function print(...args) { console.log(...args); }
function len(v) { if (v == null) return 0; if (typeof v === 'string' || Array.isArray(v)) return v.length; if (typeof v === 'object') return Object.keys(v).length; return 0; }
function range(s, e, st) { if (e === undefined) { e = s; s = 0; } if (st === undefined) st = s < e ? 1 : -1; const r = []; if (st > 0) { for (let i = s; i < e; i += st) r.push(i); } else { for (let i = s; i > e; i += st) r.push(i); } return r; }
function enumerate(a) { return a.map((v, i) => [i, v]); }
function sum(a) { return a.reduce((x, y) => x + y, 0); }
function sorted(a, k) { const c = [...a]; if (k) c.sort((x, y) => { const kx = k(x), ky = k(y); return kx < ky ? -1 : kx > ky ? 1 : 0; }); else c.sort((x, y) => x < y ? -1 : x > y ? 1 : 0); return c; }
function reversed(a) { return [...a].reverse(); }
function zip(...as) { const m = Math.min(...as.map(a => a.length)); const r = []; for (let i = 0; i < m; i++) r.push(as.map(a => a[i])); return r; }
function min(a) { return Math.min(...a); }
function max(a) { return Math.max(...a); }
function type_of(v) { if (v === null) return 'Nil'; if (Array.isArray(v)) return 'List'; if (v?.__tag) return v.__tag; const t = typeof v; switch(t) { case 'number': return Number.isInteger(v) ? 'Int' : 'Float'; case 'string': return 'String'; case 'boolean': return 'Bool'; case 'function': return 'Function'; case 'object': return 'Object'; default: return 'Unknown'; } }
function filter(arr, fn) { return arr.filter(fn); }
function map(arr, fn) { return arr.map(fn); }
function find(arr, fn) { return arr.find(fn) ?? null; }
function any(arr, fn) { return arr.some(fn); }
function all(arr, fn) { return arr.every(fn); }
function flat_map(arr, fn) { return arr.flatMap(fn); }
function reduce(arr, fn, init) { return init === undefined ? arr.reduce(fn) : arr.reduce(fn, init); }
function unique(arr) { return [...new Set(arr)]; }
function group_by(arr, fn) { const r = {}; for (const v of arr) { const k = fn(v); if (!r[k]) r[k] = []; r[k].push(v); } return r; }
function chunk(arr, n) { const r = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; }
function flatten(arr) { return arr.flat(); }
function take(arr, n) { return arr.slice(0, n); }
function drop(arr, n) { return arr.slice(n); }
function first(arr) { return arr.length > 0 ? arr[0] : null; }
function last(arr) { return arr.length > 0 ? arr[arr.length - 1] : null; }
function count(arr, fn) { return arr.filter(fn).length; }
function partition(arr, fn) { const y = [], n = []; for (const v of arr) { (fn(v) ? y : n).push(v); } return [y, n]; }
function abs(n) { return Math.abs(n); }
function floor(n) { return Math.floor(n); }
function ceil(n) { return Math.ceil(n); }
function round(n) { return Math.round(n); }
function clamp(n, lo, hi) { return Math.min(Math.max(n, lo), hi); }
function sqrt(n) { return Math.sqrt(n); }
function pow(b, e) { return Math.pow(b, e); }
function random() { return Math.random(); }
function trim(s) { return s.trim(); }
function split(s, sep) { return s.split(sep); }
function join(arr, sep) { return arr.join(sep); }
function replace(s, from, to) { return s.replace(from, to); }
function repeat(s, n) { return s.repeat(n); }
function keys(obj) { return Object.keys(obj); }
function values(obj) { return Object.values(obj); }
function entries(obj) { return Object.entries(obj); }
function merge(...objs) { return Object.assign({}, ...objs); }
function freeze(obj) { return Object.freeze(obj); }
function clone(obj) { return structuredClone(obj); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }`;

export const STRING_PROTO = `// Lux string methods
(function() {
  const m = {
    upper() { return this.toUpperCase(); },
    lower() { return this.toLowerCase(); },
    contains(s) { return this.includes(s); },
    starts_with(s) { return this.startsWith(s); },
    ends_with(s) { return this.endsWith(s); },
    chars() { return [...this]; },
    words() { return this.split(/\\s+/).filter(Boolean); },
    lines() { return this.split('\\n'); },
    capitalize() { return this.length ? this.charAt(0).toUpperCase() + this.slice(1) : this; },
    title_case() { return this.replace(/\\b\\w/g, c => c.toUpperCase()); },
    snake_case() { return this.replace(/[-\\s]+/g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/^_/, ''); },
    camel_case() { return this.replace(/[-_\\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '').replace(/^[A-Z]/, c => c.toLowerCase()); },
  };
  for (const [n, fn] of Object.entries(m)) {
    if (!String.prototype[n]) Object.defineProperty(String.prototype, n, { value: fn, enumerable: false, configurable: true });
  }
})();`;

// Full stdlib for runtime (REPL, run command)
export function getFullStdlib() {
  return `${BUILTINS}\n${RESULT_OPTION}\n${PROPAGATE}`;
}

// Stdlib for client codegen (includes builtins + result/option + propagate)
export function getClientStdlib() {
  return `${BUILTINS}\n${RESULT_OPTION}\n${PROPAGATE}`;
}
