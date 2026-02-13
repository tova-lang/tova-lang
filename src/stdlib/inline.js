// Lux standard library — inline string versions for codegen
// Single source of truth for all inline stdlib code used in code generation.
// Used by: base-codegen.js, client-codegen.js, bin/lux.js

export const RESULT_OPTION = `function Ok(value) { return Object.freeze({ __tag: "Ok", value, map(fn) { return Ok(fn(value)); }, flatMap(fn) { const r = fn(value); if (r && r.__tag) return r; throw new Error("flatMap callback must return Ok/Err"); }, unwrap() { return value; }, unwrapOr(_) { return value; }, expect(_) { return value; }, isOk() { return true; }, isErr() { return false; }, mapErr(_) { return this; }, unwrapErr() { throw new Error("Called unwrapErr on Ok"); }, or(_) { return this; }, and(other) { return other; } }); }
function Err(error) { return Object.freeze({ __tag: "Err", error, map(_) { return this; }, flatMap(_) { return this; }, unwrap() { throw new Error("Called unwrap on Err: " + (typeof error === "object" ? JSON.stringify(error) : error)); }, unwrapOr(def) { return def; }, expect(msg) { throw new Error(msg); }, isOk() { return false; }, isErr() { return true; }, mapErr(fn) { return Err(fn(error)); }, unwrapErr() { return error; }, or(other) { return other; }, and(_) { return this; } }); }
function Some(value) { return Object.freeze({ __tag: "Some", value, map(fn) { return Some(fn(value)); }, flatMap(fn) { const r = fn(value); if (r && r.__tag) return r; throw new Error("flatMap callback must return Some/None"); }, unwrap() { return value; }, unwrapOr(_) { return value; }, expect(_) { return value; }, isSome() { return true; }, isNone() { return false; }, or(_) { return this; }, and(other) { return other; }, filter(pred) { return pred(value) ? this : None; } }); }
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
function range(s, e, st) { if (e === undefined) { e = s; s = 0; } if (st === undefined) st = s < e ? 1 : -1; if (st === 0) return []; const r = []; if (st > 0) { for (let i = s; i < e; i += st) r.push(i); } else { for (let i = s; i > e; i += st) r.push(i); } return r; }
function enumerate(a) { return a.map((v, i) => [i, v]); }
function sum(a) { return a.reduce((x, y) => x + y, 0); }
function sorted(a, k) { const c = [...a]; if (k) c.sort((x, y) => { const kx = k(x), ky = k(y); return kx < ky ? -1 : kx > ky ? 1 : 0; }); else c.sort((x, y) => x < y ? -1 : x > y ? 1 : 0); return c; }
function reversed(a) { return [...a].reverse(); }
function zip(...as) { if (as.length === 0) return []; const m = Math.min(...as.map(a => a.length)); const r = []; for (let i = 0; i < m; i++) r.push(as.map(a => a[i])); return r; }
function min(a) { return a.length === 0 ? null : Math.min(...a); }
function max(a) { return a.length === 0 ? null : Math.max(...a); }
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
function replace(s, from, to) { return typeof from === 'string' ? s.replaceAll(from, to) : s.replace(from, to); }
function repeat(s, n) { return s.repeat(n); }
function keys(obj) { return Object.keys(obj); }
function values(obj) { return Object.values(obj); }
function entries(obj) { return Object.entries(obj); }
function merge(...objs) { return Object.assign({}, ...objs); }
function freeze(obj) { return Object.freeze(obj); }
function clone(obj) { return structuredClone(obj); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function upper(s) { return s.toUpperCase(); }
function lower(s) { return s.toLowerCase(); }
function contains(s, sub) { return s.includes(sub); }
function starts_with(s, prefix) { return s.startsWith(prefix); }
function ends_with(s, suffix) { return s.endsWith(suffix); }
function chars(s) { return [...s]; }
function words(s) { return s.split(/\\s+/).filter(Boolean); }
function lines(s) { return s.split('\\n'); }
function capitalize(s) { return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function title_case(s) { return s.replace(/\\b\\w/g, c => c.toUpperCase()); }
function snake_case(s) { return s.replace(/[-\\s]+/g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/^_/, ''); }
function camel_case(s) { return s.replace(/[-_\\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '').replace(/^[A-Z]/, c => c.toLowerCase()); }
function assert_eq(a, b, msg) { if (a !== b) throw new Error(msg || \`Assertion failed: \${JSON.stringify(a)} !== \${JSON.stringify(b)}\`); }
function assert_ne(a, b, msg) { if (a === b) throw new Error(msg || \`Assertion failed: values should not be equal: \${JSON.stringify(a)}\`); }
function assert(cond, msg) { if (!cond) throw new Error(msg || "Assertion failed"); }`;


// Individual builtin functions for tree-shaking
export const BUILTIN_FUNCTIONS = {
  print: `function print(...args) { console.log(...args); }`,
  len: `function len(v) { if (v == null) return 0; if (typeof v === 'string' || Array.isArray(v)) return v.length; if (typeof v === 'object') return Object.keys(v).length; return 0; }`,
  range: `function range(s, e, st) { if (e === undefined) { e = s; s = 0; } if (st === undefined) st = s < e ? 1 : -1; if (st === 0) return []; const r = []; if (st > 0) { for (let i = s; i < e; i += st) r.push(i); } else { for (let i = s; i > e; i += st) r.push(i); } return r; }`,
  enumerate: `function enumerate(a) { return a.map((v, i) => [i, v]); }`,
  sum: `function sum(a) { return a.reduce((x, y) => x + y, 0); }`,
  sorted: `function sorted(a, k) { const c = [...a]; if (k) c.sort((x, y) => { const kx = k(x), ky = k(y); return kx < ky ? -1 : kx > ky ? 1 : 0; }); else c.sort((x, y) => x < y ? -1 : x > y ? 1 : 0); return c; }`,
  reversed: `function reversed(a) { return [...a].reverse(); }`,
  zip: `function zip(...as) { if (as.length === 0) return []; const m = Math.min(...as.map(a => a.length)); const r = []; for (let i = 0; i < m; i++) r.push(as.map(a => a[i])); return r; }`,
  min: `function min(a) { return a.length === 0 ? null : Math.min(...a); }`,
  max: `function max(a) { return a.length === 0 ? null : Math.max(...a); }`,
  type_of: `function type_of(v) { if (v === null) return 'Nil'; if (Array.isArray(v)) return 'List'; if (v?.__tag) return v.__tag; const t = typeof v; switch(t) { case 'number': return Number.isInteger(v) ? 'Int' : 'Float'; case 'string': return 'String'; case 'boolean': return 'Bool'; case 'function': return 'Function'; case 'object': return 'Object'; default: return 'Unknown'; } }`,
  filter: `function filter(arr, fn) { return arr.filter(fn); }`,
  map: `function map(arr, fn) { return arr.map(fn); }`,
  find: `function find(arr, fn) { return arr.find(fn) ?? null; }`,
  any: `function any(arr, fn) { return arr.some(fn); }`,
  all: `function all(arr, fn) { return arr.every(fn); }`,
  flat_map: `function flat_map(arr, fn) { return arr.flatMap(fn); }`,
  reduce: `function reduce(arr, fn, init) { return init === undefined ? arr.reduce(fn) : arr.reduce(fn, init); }`,
  unique: `function unique(arr) { return [...new Set(arr)]; }`,
  group_by: `function group_by(arr, fn) { const r = {}; for (const v of arr) { const k = fn(v); if (!r[k]) r[k] = []; r[k].push(v); } return r; }`,
  chunk: `function chunk(arr, n) { const r = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; }`,
  flatten: `function flatten(arr) { return arr.flat(); }`,
  take: `function take(arr, n) { return arr.slice(0, n); }`,
  drop: `function drop(arr, n) { return arr.slice(n); }`,
  first: `function first(arr) { return arr.length > 0 ? arr[0] : null; }`,
  last: `function last(arr) { return arr.length > 0 ? arr[arr.length - 1] : null; }`,
  count: `function count(arr, fn) { return arr.filter(fn).length; }`,
  partition: `function partition(arr, fn) { const y = [], n = []; for (const v of arr) { (fn(v) ? y : n).push(v); } return [y, n]; }`,
  abs: `function abs(n) { return Math.abs(n); }`,
  floor: `function floor(n) { return Math.floor(n); }`,
  ceil: `function ceil(n) { return Math.ceil(n); }`,
  round: `function round(n) { return Math.round(n); }`,
  clamp: `function clamp(n, lo, hi) { return Math.min(Math.max(n, lo), hi); }`,
  sqrt: `function sqrt(n) { return Math.sqrt(n); }`,
  pow: `function pow(b, e) { return Math.pow(b, e); }`,
  random: `function random() { return Math.random(); }`,
  trim: `function trim(s) { return s.trim(); }`,
  split: `function split(s, sep) { return s.split(sep); }`,
  join: `function join(arr, sep) { return arr.join(sep); }`,
  replace: `function replace(s, from, to) { return typeof from === 'string' ? s.replaceAll(from, to) : s.replace(from, to); }`,
  repeat: `function repeat(s, n) { return s.repeat(n); }`,
  keys: `function keys(obj) { return Object.keys(obj); }`,
  values: `function values(obj) { return Object.values(obj); }`,
  entries: `function entries(obj) { return Object.entries(obj); }`,
  merge: `function merge(...objs) { return Object.assign({}, ...objs); }`,
  freeze: `function freeze(obj) { return Object.freeze(obj); }`,
  clone: `function clone(obj) { return structuredClone(obj); }`,
  sleep: `function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }`,
  upper: `function upper(s) { return s.toUpperCase(); }`,
  lower: `function lower(s) { return s.toLowerCase(); }`,
  contains: `function contains(s, sub) { return s.includes(sub); }`,
  starts_with: `function starts_with(s, prefix) { return s.startsWith(prefix); }`,
  ends_with: `function ends_with(s, suffix) { return s.endsWith(suffix); }`,
  chars: `function chars(s) { return [...s]; }`,
  words: `function words(s) { return s.split(/\\s+/).filter(Boolean); }`,
  lines: `function lines(s) { return s.split('\\n'); }`,
  capitalize: `function capitalize(s) { return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s; }`,
  title_case: `function title_case(s) { return s.replace(/\\b\\w/g, c => c.toUpperCase()); }`,
  snake_case: `function snake_case(s) { return s.replace(/[-\\s]+/g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/^_/, ''); }`,
  camel_case: `function camel_case(s) { return s.replace(/[-_\\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '').replace(/^[A-Z]/, c => c.toLowerCase()); }`,
  assert_eq: `function assert_eq(a, b, msg) { if (a !== b) throw new Error(msg || \`Assertion failed: \${JSON.stringify(a)} !== \${JSON.stringify(b)}\`); }`,
  assert_ne: `function assert_ne(a, b, msg) { if (a === b) throw new Error(msg || \`Assertion failed: values should not be equal: \${JSON.stringify(a)}\`); }`,
  assert: `function assert(cond, msg) { if (!cond) throw new Error(msg || "Assertion failed"); }`,
};

// All known builtin names for matching
export const BUILTIN_NAMES = new Set(Object.keys(BUILTIN_FUNCTIONS));

// Build stdlib containing only the functions that are actually used
export function buildSelectiveStdlib(usedNames) {
  const parts = [];
  for (const name of usedNames) {
    if (BUILTIN_FUNCTIONS[name]) {
      parts.push(BUILTIN_FUNCTIONS[name]);
    }
  }
  return parts.join('\n');
}

// Full stdlib for runtime (REPL, run command)
export function getFullStdlib() {
  return `${BUILTINS}\n${RESULT_OPTION}\n${PROPAGATE}`;
}

// Stdlib for client codegen (includes builtins + result/option + propagate)
export function getClientStdlib() {
  return `${BUILTINS}\n${RESULT_OPTION}\n${PROPAGATE}`;
}
