// Tova standard library — inline string versions for codegen
// Single source of truth for all inline stdlib code used in code generation.
// Used by: base-codegen.js, browser-codegen.js, bin/tova.js

export const RESULT_OPTION = `class _Ok { constructor(value) { this.value = value; } }
_Ok.prototype.__tag = "Ok";
_Ok.prototype.map = function(fn) { return new _Ok(fn(this.value)); };
_Ok.prototype.flatMap = function(fn) { const r = fn(this.value); if (r && r.__tag) return r; throw new Error("flatMap callback must return Ok/Err"); };
_Ok.prototype.andThen = _Ok.prototype.flatMap;
_Ok.prototype.unwrap = function() { return this.value; };
_Ok.prototype.unwrapOr = function(_) { return this.value; };
_Ok.prototype.expect = function(_) { return this.value; };
_Ok.prototype.isOk = function() { return true; };
_Ok.prototype.isErr = function() { return false; };
_Ok.prototype.mapErr = function(_) { return this; };
_Ok.prototype.unwrapErr = function() { throw new Error("Called unwrapErr on Ok"); };
_Ok.prototype.or = function(_) { return this; };
_Ok.prototype.and = function(other) { return other; };
_Ok.prototype.context = function(_) { return this; };
function Ok(value) { return new _Ok(value); }
class _Err { constructor(error) { this.error = error; } }
_Err.prototype.__tag = "Err";
_Err.prototype.map = function(_) { return this; };
_Err.prototype.flatMap = function(_) { return this; };
_Err.prototype.andThen = _Err.prototype.flatMap;
_Err.prototype.unwrap = function() { throw new Error("Called unwrap on Err: " + (typeof this.error === "object" ? JSON.stringify(this.error) : this.error)); };
_Err.prototype.unwrapOr = function(def) { return def; };
_Err.prototype.expect = function(msg) { throw new Error(msg); };
_Err.prototype.isOk = function() { return false; };
_Err.prototype.isErr = function() { return true; };
_Err.prototype.mapErr = function(fn) { return new _Err(fn(this.error)); };
_Err.prototype.unwrapErr = function() { return this.error; };
_Err.prototype.or = function(other) { return other; };
_Err.prototype.and = function(_) { return this; };
_Err.prototype.context = function(msg) { const inner = typeof this.error === "object" ? JSON.stringify(this.error) : String(this.error); return new _Err(msg + " \\u2192 caused by: " + inner); };
function Err(error) { return new _Err(error); }
class _Some { constructor(value) { this.value = value; } }
_Some.prototype.__tag = "Some";
_Some.prototype.map = function(fn) { return new _Some(fn(this.value)); };
_Some.prototype.flatMap = function(fn) { const r = fn(this.value); if (r && r.__tag) return r; throw new Error("flatMap callback must return Some/None"); };
_Some.prototype.andThen = _Some.prototype.flatMap;
_Some.prototype.unwrap = function() { return this.value; };
_Some.prototype.unwrapOr = function(_) { return this.value; };
_Some.prototype.expect = function(_) { return this.value; };
_Some.prototype.isSome = function() { return true; };
_Some.prototype.isNone = function() { return false; };
_Some.prototype.or = function(_) { return this; };
_Some.prototype.and = function(other) { return other; };
_Some.prototype.filter = function(pred) { return pred(this.value) ? this : None; };
function Some(value) { return new _Some(value); }
const None = Object.freeze({ __tag: "None", map(_) { return None; }, flatMap(_) { return None; }, andThen(_) { return None; }, unwrap() { throw new Error("Called unwrap on None"); }, unwrapOr(def) { return def; }, expect(msg) { throw new Error(msg); }, isSome() { return false; }, isNone() { return true; }, or(other) { return other; }, and(_) { return None; }, filter(_) { return None; } });`;

export const PROPAGATE = `function __propagate(val) {
  if (val && val.__tag === "Err") throw { __tova_propagate: true, value: val };
  if (val && val.__tag === "None") throw { __tova_propagate: true, value: val };
  if (val && val.__tag === "Ok") return val.value;
  if (val && val.__tag === "Some") return val.value;
  return val;
}`;

// Individual builtin functions for tree-shaking
export const BUILTIN_FUNCTIONS = {
  print: `function print(...args) { console.log(...args); }`,
  len: `function len(v) { if (v == null) return 0; if (typeof v === 'string' || Array.isArray(v) || ArrayBuffer.isView(v)) return v.length; if (typeof v === 'object') return Object.keys(v).length; return 0; }`,
  range: `function range(s, e, st) { if (e === undefined) { e = s; s = 0; } if (st === undefined) st = s < e ? 1 : -1; if (st === 0) return []; const r = []; if (st > 0) { for (let i = s; i < e; i += st) r.push(i); } else { for (let i = s; i > e; i += st) r.push(i); } return r; }`,
  enumerate: `function enumerate(a) { return a.map((v, i) => [i, v]); }`,
  sum: `function sum(a) { return a.reduce((x, y) => x + y, 0); }`,
  sorted: `function sorted(a, k) { const c = [...a]; if (k) c.sort((x, y) => { const kx = k(x), ky = k(y); return kx < ky ? -1 : kx > ky ? 1 : 0; }); else if (c.length > 0 && typeof c[0] === 'number') { if (typeof __tova_native !== 'undefined' && __tova_native && c.length > 128) { const f = new Float64Array(c); __tova_native.tova_sort_f64(f, f.length); for (let i = 0; i < c.length; i++) c[i] = f[i]; } else if (c.length > 128) { const f = new Float64Array(c); f.sort(); for (let i = 0; i < c.length; i++) c[i] = f[i]; } else { c.sort((a, b) => a - b); } } else c.sort((x, y) => x < y ? -1 : x > y ? 1 : 0); return c; }`,
  reversed: `function reversed(a) { return [...a].reverse(); }`,
  zip: `function zip(...as) { if (as.length === 0) return []; const m = Math.min(...as.map(a => a.length)); const r = []; for (let i = 0; i < m; i++) r.push(as.map(a => a[i])); return r; }`,
  min: `function min(a) { if (a.length === 0) return null; let m = a[0]; for (let i = 1; i < a.length; i++) if (a[i] < m) m = a[i]; return m; }`,
  max: `function max(a) { if (a.length === 0) return null; let m = a[0]; for (let i = 1; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }`,
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
  filled: `function filled(n, val) { return new Array(n).fill(val); }`,
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
  parallel_map: `async function parallel_map(arr, fn, numWorkers) {
  if (!arr || arr.length === 0) return [];
  const cores = numWorkers || (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4) || 4;
  const n = Math.min(cores, arr.length);
  if (n <= 1 || arr.length < 4) return arr.map(fn);
  if (!parallel_map._pool) {
    const { Worker } = await import("worker_threads");
    const wc = 'const{parentPort}=require("worker_threads");parentPort.on("message",m=>{const fn=(0,eval)("("+m.f+")");try{const r=m.c.map(fn);parentPort.postMessage({i:m.i,r})}catch(e){parentPort.postMessage({i:m.i,e:e.message})}})';
    parallel_map._pool = Array.from({length: n}, () => new Worker(wc, {eval: true}));
    parallel_map._cid = 0;
  }
  const pool = parallel_map._pool;
  const cs = Math.ceil(arr.length / pool.length);
  const fnStr = fn.toString();
  const cid = ++parallel_map._cid;
  const promises = [];
  const usedWorkers = [];
  for (let ci = 0; ci < pool.length && ci * cs < arr.length; ci++) {
    const chunk = arr.slice(ci * cs, (ci + 1) * cs);
    const mid = cid * 1000 + ci;
    const w = pool[ci];
    w.ref();
    usedWorkers.push(w);
    promises.push(new Promise((resolve, reject) => {
      const h = (msg) => { if (msg.i === mid) { w.removeListener("message", h); if (msg.e) reject(new Error(msg.e)); else resolve(msg.r); } };
      w.on("message", h);
      w.postMessage({i: mid, c: chunk, f: fnStr});
    }));
  }
  try { return (await Promise.all(promises)).flat(); } finally { for (const w of usedWorkers) w.unref(); }
}`,
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
  assert_throws: `function assert_throws(fn, expected) {
  try { fn(); } catch (e) {
    if (expected !== undefined) {
      const msg = e instanceof Error ? e.message : String(e);
      if (typeof expected === 'string' && !msg.includes(expected)) {
        throw new Error("Expected error containing \\"" + expected + "\\" but got \\"" + msg + "\\"");
      }
      if (expected instanceof RegExp && !expected.test(msg)) {
        throw new Error("Expected error matching " + expected + " but got \\"" + msg + "\\"");
      }
    }
    return e;
  }
  throw new Error("Expected function to throw" + (expected ? " \\"" + expected + "\\"" : "") + " but it did not");
}`,

  // ── Missing from module files (synced to BUILTIN_FUNCTIONS) ──
  find_index: `function find_index(arr, fn) { const i = arr.findIndex(fn); return i === -1 ? null : i; }`,
  includes: `function includes(arr, value) { return arr.includes(value); }`,
  replace_first: `function replace_first(s, from, to) { return s.replace(from, to); }`,
  pad_start: `function pad_start(s, n, fill) { return s.padStart(n, fill || ' '); }`,
  pad_end: `function pad_end(s, n, fill) { return s.padEnd(n, fill || ' '); }`,
  char_at: `function char_at(s, i) { return i < s.length ? s[i] : null; }`,
  trim_start: `function trim_start(s) { return s.trimStart(); }`,
  trim_end: `function trim_end(s) { return s.trimEnd(); }`,

  // ── Math constants ────────────────────────────────────
  PI: `const PI = Math.PI;`,
  E: `const E = Math.E;`,
  INF: `const INF = Infinity;`,

  // ── Trigonometric ─────────────────────────────────────
  sin: `function sin(n) { return Math.sin(n); }`,
  cos: `function cos(n) { return Math.cos(n); }`,
  tan: `function tan(n) { return Math.tan(n); }`,
  asin: `function asin(n) { return Math.asin(n); }`,
  acos: `function acos(n) { return Math.acos(n); }`,
  atan: `function atan(n) { return Math.atan(n); }`,
  atan2: `function atan2(y, x) { return Math.atan2(y, x); }`,

  // ── Logarithmic / Exponential ─────────────────────────
  log: `function log(n) { return Math.log(n); }`,
  log2: `function log2(n) { return Math.log2(n); }`,
  log10: `function log10(n) { return Math.log10(n); }`,
  exp: `function exp(n) { return Math.exp(n); }`,

  // ── Numeric Utilities ─────────────────────────────────
  sign: `function sign(n) { return Math.sign(n); }`,
  trunc: `function trunc(n) { return Math.trunc(n); }`,
  is_nan: `function is_nan(n) { return Number.isNaN(n); }`,
  is_finite: `function is_finite(n) { return Number.isFinite(n); }`,
  is_close: `function is_close(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol); }`,
  to_radians: `function to_radians(deg) { return deg * Math.PI / 180; }`,
  to_degrees: `function to_degrees(rad) { return rad * 180 / Math.PI; }`,

  // ── Integer Math ──────────────────────────────────────
  gcd: `function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }`,
  lcm: `function lcm(a, b) { if (a === 0 && b === 0) return 0; let x = Math.abs(a), y = Math.abs(b); while (y) { const t = y; y = x % y; x = t; } return Math.abs(a * b) / x; }`,
  factorial: `function factorial(n) { if (n < 0) return null; if (n <= 1) return 1; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }`,

  // ── Randomness ────────────────────────────────────────
  random_int: `function random_int(lo, hi) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }`,
  random_float: `function random_float(lo, hi) { return Math.random() * (hi - lo) + lo; }`,
  choice: `function choice(arr) { return arr.length === 0 ? null : arr[Math.floor(Math.random() * arr.length)]; }`,
  sample: `function sample(arr, n) { const c = [...arr]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c.slice(0, n); }`,
  shuffle: `function shuffle(arr) { const c = [...arr]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; }`,

  // ── Type Conversion ───────────────────────────────────
  to_int: `function to_int(v) { if (typeof v === 'boolean') return v ? 1 : 0; const n = typeof v === 'string' ? parseInt(v, 10) : Math.trunc(Number(v)); return isNaN(n) ? null : n; }`,
  to_float: `function to_float(v) { if (typeof v === 'boolean') return v ? 1.0 : 0.0; const n = Number(v); return isNaN(n) ? null : n; }`,
  to_string: `function to_string(v) { if (v == null) return 'nil'; if (v && v.__tag) return v.__tag + (v.value !== undefined ? '(' + String(v.value) + ')' : ''); return String(v); }`,
  to_bool: `function to_bool(v) { if (typeof v === 'string') return v !== '' && v !== '0' && v !== 'false'; return Boolean(v); }`,

  // ── Table runtime ───────────────────────────────────
  Table: `function Table(rows, columns) { if (rows instanceof Table) return rows; const t = Object.create(Table.prototype); t._rows = Array.isArray(rows) ? rows : []; t._columns = columns || (t._rows.length > 0 ? Object.keys(t._rows[0]) : []); return t; }
Table.prototype = { get rows() { return this._rows.length; }, get columns() { return [...this._columns]; }, get shape() { return [this._rows.length, this._columns.length]; }, get length() { return this._rows.length; }, [Symbol.iterator]() { return this._rows[Symbol.iterator](); }, at(i) { if (i < 0) i = this._rows.length + i; return this._rows[i] ?? null; }, slice(s, e) { return Table(this._rows.slice(s, e), this._columns); }, getColumn(n) { return this._rows.map(r => r[n]); }, toArray() { return [...this._rows]; }, toJSON() { return this._rows; }, toString() { if (this._rows.length === 0) return 'Table(0 rows, 0 columns)'; return 'Table(' + this._rows.length + ' rows, ' + this._columns.length + ' columns)'; }, _format(maxRows, title) { const lines = []; if (title) lines.push('── ' + title + ' ──'); const cols = this._columns; const dr = this._rows.slice(0, maxRows || 10); if (cols.length === 0 || dr.length === 0) { lines.push('(empty table)'); lines.push(this._rows.length + ' rows × ' + cols.length + ' columns'); return lines.join('\\n'); } const w = {}; for (const c of cols) { w[c] = c.length; for (const r of dr) { const s = r[c] == null ? 'nil' : String(r[c]); w[c] = Math.max(w[c], s.length); } w[c] = Math.min(w[c], 30); } lines.push(cols.map(c => c.padEnd(w[c])).join(' │ ')); lines.push(cols.map(c => '─'.repeat(w[c])).join('─┼─')); for (const r of dr) { lines.push(cols.map(c => { const s = r[c] == null ? 'nil' : String(r[c]); return s.slice(0, 30).padEnd(w[c]); }).join(' │ ')); } if (this._rows.length > (maxRows || 10)) lines.push('... ' + (this._rows.length - (maxRows || 10)) + ' more rows'); lines.push(this._rows.length + ' rows × ' + cols.length + ' columns'); return lines.join('\\n'); } };`,

  // ── Table operations ────────────────────────────────
  table_where: `function table_where(table, pred) { return Table(table._rows.filter(pred), table._columns); }`,
  table_select: `function table_select(table, ...args) { let cols; if (args.length === 1 && args[0] && args[0].__exclude) { const ex = new Set(Array.isArray(args[0].__exclude) ? args[0].__exclude : [args[0].__exclude]); cols = table._columns.filter(c => !ex.has(c)); } else { cols = args.filter(a => typeof a === 'string'); } const rows = table._rows.map(r => { const row = {}; for (const c of cols) row[c] = r[c]; return row; }); return Table(rows, cols); }`,
  table_derive: `function table_derive(table, derivations) { const nc = [...table._columns]; for (const k of Object.keys(derivations)) { if (!nc.includes(k)) nc.push(k); } const rows = table._rows.map(r => { const row = { ...r }; for (const [k, fn] of Object.entries(derivations)) { row[k] = typeof fn === 'function' ? fn(r) : fn; } return row; }); return Table(rows, nc); }`,
  table_group_by: `function table_group_by(table, keyFn) { const groups = new Map(); for (const row of table._rows) { const key = typeof keyFn === 'function' ? keyFn(row) : row[keyFn]; const ks = String(key); if (!groups.has(ks)) groups.set(ks, { key, rows: [] }); groups.get(ks).rows.push(row); } return { __grouped: true, groups, columns: table._columns }; }`,
  table_agg: `function table_agg(grouped, aggregations) { if (!grouped || !grouped.__grouped) throw new Error('agg() must be called after group_by()'); const rows = []; for (const [, { key, rows: gr }] of grouped.groups) { const row = typeof key === 'object' && key !== null ? { ...key } : { _group: key }; for (const [n, fn] of Object.entries(aggregations)) { row[n] = fn(gr); } rows.push(row); } return Table(rows, rows.length > 0 ? Object.keys(rows[0]) : []); }`,
  table_sort_by: `function table_sort_by(table, keyFn, opts) { const desc = opts && opts.desc; const rows = [...table._rows].sort((a, b) => { const ka = typeof keyFn === 'function' ? keyFn(a) : a[keyFn]; const kb = typeof keyFn === 'function' ? keyFn(b) : b[keyFn]; let c = ka < kb ? -1 : ka > kb ? 1 : 0; return desc ? -c : c; }); return Table(rows, table._columns); }`,
  table_limit: `function table_limit(table, n) { return Table(table._rows.slice(0, n), table._columns); }`,
  table_join: `function table_join(table, other, opts) { const { left, right, how } = opts || {}; if (!left || !right) throw new Error('join() requires left and right key functions'); const rows = []; const ri = new Map(); for (const r of other._rows) { const k = typeof right === 'function' ? right(r) : r[right]; const ks = String(k); if (!ri.has(ks)) ri.set(ks, []); ri.get(ks).push(r); } const cc = [...new Set([...table._columns, ...other._columns])]; for (const lr of table._rows) { const k = typeof left === 'function' ? left(lr) : lr[left]; const ms = ri.get(String(k)) || []; if (ms.length > 0) { for (const rr of ms) rows.push({ ...lr, ...rr }); } else if (how === 'left' || how === 'outer') { const row = { ...lr }; for (const c of other._columns) { if (!(c in row)) row[c] = null; } rows.push(row); } } return Table(rows, cc); }`,
  table_pivot: `function table_pivot(table, opts) { const { index, columns: colFn, values: valFn } = opts || {}; const pm = new Map(); const ac = new Set(); for (const row of table._rows) { const ik = typeof index === 'function' ? index(row) : row[index]; const col = typeof colFn === 'function' ? colFn(row) : row[colFn]; const val = typeof valFn === 'function' ? valFn(row) : row[valFn]; const ks = String(ik); if (!pm.has(ks)) pm.set(ks, { _index: ik }); pm.get(ks)[String(col)] = val; ac.add(String(col)); } return Table([...pm.values()], ['_index', ...ac]); }`,
  table_unpivot: `function table_unpivot(table, opts) { const { id, columns: uc } = opts || {}; const cn = uc.filter(c => typeof c === 'string'); const rows = []; for (const row of table._rows) { const iv = typeof id === 'function' ? id(row) : row[id]; for (const col of cn) rows.push({ id: iv, variable: col, value: row[col] }); } return Table(rows, ['id', 'variable', 'value']); }`,
  table_explode: `function table_explode(table, colFn) { const rows = []; for (const row of table._rows) { const arr = typeof colFn === 'function' ? colFn(row) : row[colFn]; if (Array.isArray(arr)) { const cn = typeof colFn === 'string' ? colFn : null; for (const val of arr) { const r = { ...row }; if (cn) r[cn] = val; rows.push(r); } } else { rows.push({ ...row }); } } return Table(rows, table._columns); }`,
  table_union: `function table_union(table, other) { return Table([...table._rows, ...other._rows], [...new Set([...table._columns, ...other._columns])]); }`,
  table_drop_duplicates: `function table_drop_duplicates(table, opts) { const by = opts && opts.by; const seen = new Set(); const rows = []; for (const row of table._rows) { const k = by ? (typeof by === 'function' ? String(by(row)) : String(row[by])) : JSON.stringify(row); if (!seen.has(k)) { seen.add(k); rows.push(row); } } return Table(rows, table._columns); }`,
  table_rename: `function table_rename(table, oldName, newName) { const cols = table._columns.map(c => c === oldName ? newName : c); const rows = table._rows.map(r => { const row = {}; for (const c of table._columns) row[c === oldName ? newName : c] = r[c]; return row; }); return Table(rows, cols); }`,

  // ── Lazy Table Query Builder ────────────────────────
  lazy: `function lazy(table) { return new LazyTable(table); }`,
  collect: `function collect(v) { if (v instanceof LazyTable) return v.collect(); if (v && v._gen) return v.collect(); return v; }`,
  LazyTable: `class LazyTable {
  constructor(source) {
    this._source = source;
    this._steps = [];
  }
  _push(step) { const lt = new LazyTable(this._source); lt._steps = [...this._steps, step]; return lt; }
  where(pred) { return this._push({ op: 'where', fn: pred }); }
  select(...args) {
    let cols;
    if (args.length === 1 && args[0] && args[0].__exclude) {
      cols = { exclude: new Set(Array.isArray(args[0].__exclude) ? args[0].__exclude : [args[0].__exclude]) };
    } else { cols = args.filter(a => typeof a === 'string'); }
    return this._push({ op: 'select', cols });
  }
  derive(derivations) { return this._push({ op: 'derive', derivations }); }
  limit(n) { return this._push({ op: 'limit', n }); }
  drop_duplicates(opts) { return this._push({ op: 'dedup', by: opts && opts.by }); }
  rename(oldName, newName) { return this._push({ op: 'rename', oldName, newName }); }
  sort_by(keyFn, opts) { return this._push({ op: 'sort', keyFn, desc: opts && opts.desc }); }
  group_by(keyFn) {
    const rows = this.collect()._rows;
    const src = Table(rows, this._resolveColumns());
    return table_group_by(src, keyFn);
  }
  _resolveColumns() {
    let cols = [...this._source._columns];
    for (const s of this._steps) {
      if (s.op === 'select') {
        cols = s.cols.exclude ? cols.filter(c => !s.cols.exclude.has(c)) : [...s.cols];
      } else if (s.op === 'derive') {
        for (const k of Object.keys(s.derivations)) { if (!cols.includes(k)) cols.push(k); }
      } else if (s.op === 'rename') {
        cols = cols.map(c => c === s.oldName ? s.newName : c);
      }
    }
    return cols;
  }
  collect() {
    let rows = this._source._rows;
    let cols = [...this._source._columns];
    for (const step of this._steps) {
      switch (step.op) {
        case 'where': rows = rows.filter(step.fn); break;
        case 'select': {
          const sc = step.cols.exclude ? cols.filter(c => !step.cols.exclude.has(c)) : step.cols;
          rows = rows.map(r => { const row = {}; for (const c of sc) row[c] = r[c]; return row; });
          cols = [...sc];
          break;
        }
        case 'derive': {
          for (const k of Object.keys(step.derivations)) { if (!cols.includes(k)) cols.push(k); }
          rows = rows.map(r => { const row = { ...r }; for (const [k, fn] of Object.entries(step.derivations)) { row[k] = typeof fn === 'function' ? fn(r) : fn; } return row; });
          break;
        }
        case 'limit': rows = rows.slice(0, step.n); break;
        case 'dedup': {
          const seen = new Set();
          const filtered = [];
          for (const row of rows) {
            const k = step.by ? (typeof step.by === 'function' ? String(step.by(row)) : String(row[step.by])) : JSON.stringify(row);
            if (!seen.has(k)) { seen.add(k); filtered.push(row); }
          }
          rows = filtered;
          break;
        }
        case 'rename': {
          cols = cols.map(c => c === step.oldName ? step.newName : c);
          rows = rows.map(r => { const row = {}; for (const c of cols) row[c === step.newName ? step.newName : c] = r[c === step.newName ? step.oldName : c]; return row; });
          break;
        }
        case 'sort': {
          rows = [...rows].sort((a, b) => {
            const ka = typeof step.keyFn === 'function' ? step.keyFn(a) : a[step.keyFn];
            const kb = typeof step.keyFn === 'function' ? step.keyFn(b) : b[step.keyFn];
            let c = ka < kb ? -1 : ka > kb ? 1 : 0;
            return step.desc ? -c : c;
          });
          break;
        }
      }
    }
    return Table(rows, cols);
  }
  toArray() { return this.collect()._rows; }
  toJSON() { return this.toArray(); }
  get rows() { return this.collect()._rows.length; }
  get columns() { return this._resolveColumns(); }
  get shape() { const t = this.collect(); return [t._rows.length, t._columns.length]; }
  toString() { return this.collect().toString(); }
  _format(maxRows, title) { return this.collect()._format(maxRows, title); }
  [Symbol.iterator]() { return this.collect()._rows[Symbol.iterator](); }
}`,

  // ── Aggregation helpers ─────────────────────────────
  agg_sum: `function agg_sum(fn) { return (rows) => rows.reduce((a, r) => a + (typeof fn === 'function' ? fn(r) : r[fn]), 0); }`,
  agg_count: `function agg_count(fn) { if (!fn) return (rows) => rows.length; return (rows) => rows.filter(fn).length; }`,
  agg_mean: `function agg_mean(fn) { return (rows) => { if (rows.length === 0) return 0; return rows.reduce((a, r) => a + (typeof fn === 'function' ? fn(r) : r[fn]), 0) / rows.length; }; }`,
  agg_median: `function agg_median(fn) { return (rows) => { if (rows.length === 0) return 0; const vs = rows.map(r => typeof fn === 'function' ? fn(r) : r[fn]).sort((a, b) => a - b); const m = Math.floor(vs.length / 2); return vs.length % 2 !== 0 ? vs[m] : (vs[m - 1] + vs[m]) / 2; }; }`,
  agg_min: `function agg_min(fn) { return (rows) => { if (rows.length === 0) return null; let m = typeof fn === 'function' ? fn(rows[0]) : rows[0][fn]; for (let i = 1; i < rows.length; i++) { const v = typeof fn === 'function' ? fn(rows[i]) : rows[i][fn]; if (v < m) m = v; } return m; }; }`,
  agg_max: `function agg_max(fn) { return (rows) => { if (rows.length === 0) return null; let m = typeof fn === 'function' ? fn(rows[0]) : rows[0][fn]; for (let i = 1; i < rows.length; i++) { const v = typeof fn === 'function' ? fn(rows[i]) : rows[i][fn]; if (v > m) m = v; } return m; }; }`,

  // ── Data exploration ────────────────────────────────
  peek: `function peek(table, opts) { const o = typeof opts === 'object' ? opts : {}; console.log(table._format ? table._format(o.n || 10, o.title) : String(table)); return table; }`,
  describe: `function describe(table) { const stats = []; for (const col of table._columns) { const vals = table._rows.map(r => r[col]).filter(v => v != null); const st = { Column: col, Type: 'Unknown', 'Non-Null': vals.length }; if (vals.length > 0) { const s = vals[0]; if (typeof s === 'number') { st.Type = Number.isInteger(s) ? 'Int' : 'Float'; st.Mean = vals.reduce((a, b) => a + b, 0) / vals.length; let mn = vals[0], mx = vals[0]; for (let i = 1; i < vals.length; i++) { if (vals[i] < mn) mn = vals[i]; if (vals[i] > mx) mx = vals[i]; } st.Min = mn; st.Max = mx; } else if (typeof s === 'string') { st.Type = 'String'; st.Unique = new Set(vals).size; } else if (typeof s === 'boolean') { st.Type = 'Bool'; } } stats.push(st); } const dt = Table(stats); console.log(dt._format(100, 'describe()')); return dt; }`,
  schema_of: `function schema_of(table) { const sc = {}; if (table._rows.length === 0) { for (const c of table._columns) sc[c] = 'Unknown'; } else { const s = table._rows[0]; for (const c of table._columns) { const v = s[c]; if (v == null) sc[c] = 'Nil'; else if (typeof v === 'number') sc[c] = Number.isInteger(v) ? 'Int' : 'Float'; else if (typeof v === 'string') sc[c] = 'String'; else if (typeof v === 'boolean') sc[c] = 'Bool'; else if (Array.isArray(v)) sc[c] = 'Array'; else sc[c] = 'Object'; } } console.log('Schema:'); for (const [c, t] of Object.entries(sc)) console.log('  ' + c + ': ' + t); return sc; }`,

  // ── Data cleaning ───────────────────────────────────
  cast: `function cast(table, colFn, targetType) { const cn = typeof colFn === 'string' ? colFn : null; const rows = table._rows.map(r => { const row = { ...r }; const k = cn; if (k && k in row) { const v = row[k]; if (targetType === 'Int') row[k] = parseInt(v, 10) || 0; else if (targetType === 'Float') row[k] = parseFloat(v) || 0; else if (targetType === 'String') row[k] = String(v); else if (targetType === 'Bool') row[k] = Boolean(v); } return row; }); return Table(rows, table._columns); }`,
  drop_nil: `function drop_nil(table, colFn) { const cn = typeof colFn === 'string' ? colFn : null; const rows = table._rows.filter(r => { const v = cn ? r[cn] : colFn(r); return v != null; }); return Table(rows, table._columns); }`,
  fill_nil: `function fill_nil(table, colFn, defaultValue) { const cn = typeof colFn === 'string' ? colFn : null; const rows = table._rows.map(r => { const row = { ...r }; if (cn && (row[cn] == null)) row[cn] = defaultValue; return row; }); return Table(rows, table._columns); }`,
  filter_ok: `function filter_ok(arr) { return arr.filter(r => r && r.__tag === 'Ok').map(r => r.value); }`,
  filter_err: `function filter_err(arr) { return arr.filter(r => r && r.__tag === 'Err').map(r => r.error); }`,

  // ── I/O functions ───────────────────────────────────
  read: `async function read(sourceOrDb, queryOrOpts, opts) {
  if (sourceOrDb && typeof sourceOrDb === 'object' && sourceOrDb.query) { const result = await sourceOrDb.query(queryOrOpts); return Table(result); }
  const source = sourceOrDb;
  if (typeof source !== 'string') throw new Error('read() expects a file path or URL string');
  const options = typeof queryOrOpts === 'object' ? queryOrOpts : (opts || {});
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const response = await fetch(source);
    if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + response.statusText);
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('json')) { const data = await response.json(); if (Array.isArray(data)) return Table(data); return data; }
    const text = await response.text();
    if (source.endsWith('.csv')) return __parseCSV(text, options);
    if (source.endsWith('.jsonl') || source.endsWith('.ndjson')) return __parseJSONL(text);
    try { const data = JSON.parse(text); if (Array.isArray(data)) return Table(data); return data; } catch { return __parseCSV(text, options); }
  }
  const fs = await import('fs'); const path = await import('path');
  const ext = path.extname(source).toLowerCase(); const text = fs.readFileSync(source, 'utf-8');
  if (ext === '.csv') return __parseCSV(text, options);
  if (ext === '.tsv') return __parseCSV(text, { ...options, delimiter: '\\t' });
  if (ext === '.json') { const data = JSON.parse(text); if (Array.isArray(data)) return Table(data); return data; }
  if (ext === '.jsonl' || ext === '.ndjson') return __parseJSONL(text);
  try { const d = JSON.parse(text); if (Array.isArray(d)) return Table(d); return d; } catch { return __parseCSV(text, options); }
}`,
  write: `async function write(data, destination, opts) {
  const fs = await import('fs'); const path = await import('path');
  const ext = path.extname(destination).toLowerCase();
  const isTable = data && data._rows && data._columns;
  const td = isTable ? data : (Array.isArray(data) ? Table(data) : null);
  let content;
  if (ext === '.csv' || ext === '.tsv') { if (!td) throw new Error('write() to CSV requires table/array data'); const delim = ext === '.tsv' ? '\\t' : ','; const cols = td._columns; const lines = [cols.join(delim)]; for (const row of td._rows) { lines.push(cols.map(c => { const v = row[c]; if (v == null) return ''; const s = String(v); return (s.includes(delim) || s.includes('"') || s.includes('\\n')) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(delim)); } content = lines.join('\\n'); }
  else if (ext === '.jsonl' || ext === '.ndjson') { if (!td) throw new Error('write() to JSONL requires table/array data'); content = td._rows.map(r => JSON.stringify(r)).join('\\n'); }
  else { content = JSON.stringify(isTable ? data._rows : data, null, 2); }
  if (opts && opts.append) fs.appendFileSync(destination, content + '\\n', 'utf-8');
  else fs.writeFileSync(destination, content, 'utf-8');
}`,

  // ── CSV/JSONL parsing helpers ───────────────────────
  __parseCSV: `function __parseCSV(text, opts) {
  const delim = (opts && opts.delimiter) || ','; const hasHeader = !opts || opts.header !== false;
  const lines = text.split('\\n').filter(l => l.trim());
  if (lines.length === 0) return Table([]);
  const parseLine = (line) => { const fields = []; let cur = ''; let inQ = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (inQ) { if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; } else if (ch === '"') { inQ = false; } else { cur += ch; } } else { if (ch === '"') inQ = true; else if (ch === delim) { fields.push(cur.trim()); cur = ''; } else { cur += ch; } } } fields.push(cur.trim()); return fields; };
  const _reInt = /^-?\\d+$/; const _reFloat = /^-?\\d*\\.\\d+$/;
  let headers, ds; if (hasHeader) { headers = parseLine(lines[0]); ds = 1; } else { const fr = parseLine(lines[0]); headers = fr.map((_, i) => 'col_' + i); ds = 0; }
  const rows = []; for (let i = ds; i < lines.length; i++) { const f = parseLine(lines[i]); const row = {}; for (let j = 0; j < headers.length; j++) { let v = f[j] ?? null; if (v !== null && v !== '') { if (_reInt.test(v)) v = parseInt(v, 10); else if (_reFloat.test(v)) v = parseFloat(v); else if (v === 'true') v = true; else if (v === 'false') v = false; else if (v === 'null' || v === 'nil') v = null; } else if (v === '') v = null; row[headers[j]] = v; } rows.push(row); }
  return Table(rows, headers);
}`,
  __parseJSONL: `function __parseJSONL(text) { return Table(text.split('\\n').filter(l => l.trim()).map(l => JSON.parse(l))); }`,

  // ── Table operation aliases (short names for pipe-friendly use) ──
  where: `function where(tableOrArr, pred) { if (tableOrArr instanceof LazyTable) return tableOrArr.where(pred); if (tableOrArr && tableOrArr._rows) return table_where(tableOrArr, pred); return tableOrArr.filter(pred); }`,
  select: `function select(table, ...args) { if (table instanceof LazyTable) return table.select(...args); return table_select(table, ...args); }`,
  derive: `function derive(table, derivations) { if (table instanceof LazyTable) return table.derive(derivations); return table_derive(table, derivations); }`,
  agg: `function agg(grouped, aggregations) { return table_agg(grouped, aggregations); }`,
  sort_by: `function sort_by(table, keyFn, opts) { if (table instanceof LazyTable) return table.sort_by(keyFn, opts); return table_sort_by(table, keyFn, opts); }`,
  limit: `function limit(table, n) { if (table instanceof LazyTable) return table.limit(n); return table_limit(table, n); }`,
  pivot: `function pivot(table, opts) { return table_pivot(table, opts); }`,
  unpivot: `function unpivot(table, opts) { return table_unpivot(table, opts); }`,
  explode: `function explode(table, colFn) { return table_explode(table, colFn); }`,
  union: `function union(a, b) { if (a && a._rows) return table_union(a, b); return [...new Set([...a, ...b])]; }`,
  drop_duplicates: `function drop_duplicates(table, opts) { if (table instanceof LazyTable) return table.drop_duplicates(opts); return table_drop_duplicates(table, opts); }`,
  rename: `function rename(table, oldName, newName) { if (table instanceof LazyTable) return table.rename(oldName, newName); return table_rename(table, oldName, newName); }`,
  mean: `function mean(v) { if (Array.isArray(v)) { return v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length; } return agg_mean(v); }`,
  median: `function median(v) { if (Array.isArray(v)) { if (v.length === 0) return null; const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]; } return agg_median(v); }`,

  // ── Strings (new) ──────────────────────────────────────
  index_of: `function index_of(s, sub) { const i = s.indexOf(sub); return i === -1 ? null : i; }`,
  last_index_of: `function last_index_of(s, sub) { const i = s.lastIndexOf(sub); return i === -1 ? null : i; }`,
  count_of: `function count_of(s, sub) { if (!sub) return 0; let c = 0, i = 0; while ((i = s.indexOf(sub, i)) !== -1) { c++; i += sub.length; } return c; }`,
  reverse_str: `function reverse_str(s) { return [...s].reverse().join(''); }`,
  substr: `function substr(s, start, end) { return end === undefined ? s.slice(start) : s.slice(start, end); }`,
  is_empty: `function is_empty(v) { if (v == null) return true; if (typeof v === 'string' || Array.isArray(v)) return v.length === 0; if (typeof v === 'object') return Object.keys(v).length === 0; return false; }`,
  kebab_case: `function kebab_case(s) { return s.replace(/[-\\s]+/g, '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/^-/, ''); }`,
  center: `function center(s, n, fill) { if (s.length >= n) return s; const f = fill || ' '; const total = n - s.length; const left = Math.floor(total / 2); const right = total - left; return f.repeat(Math.ceil(left / f.length)).slice(0, left) + s + f.repeat(Math.ceil(right / f.length)).slice(0, right); }`,

  // ── Collections (new) ──────────────────────────────────
  zip_with: `function zip_with(a, b, fn) { const m = Math.min(a.length, b.length); const r = []; for (let i = 0; i < m; i++) r.push(fn(a[i], b[i])); return r; }`,
  frequencies: `function frequencies(arr) { const r = {}; for (const v of arr) { const k = String(v); r[k] = (r[k] || 0) + 1; } return r; }`,
  scan: `function scan(arr, fn, init) { const r = []; let acc = init; for (const v of arr) { acc = fn(acc, v); r.push(acc); } return r; }`,
  min_by: `function min_by(arr, fn) { if (arr.length === 0) return null; let best = arr[0], bestK = fn(arr[0]); for (let i = 1; i < arr.length; i++) { const k = fn(arr[i]); if (k < bestK) { best = arr[i]; bestK = k; } } return best; }`,
  max_by: `function max_by(arr, fn) { if (arr.length === 0) return null; let best = arr[0], bestK = fn(arr[0]); for (let i = 1; i < arr.length; i++) { const k = fn(arr[i]); if (k > bestK) { best = arr[i]; bestK = k; } } return best; }`,
  sum_by: `function sum_by(arr, fn) { let s = 0; for (const v of arr) s += fn(v); return s; }`,
  product: `function product(arr) { return arr.reduce((a, b) => a * b, 1); }`,
  from_entries: `function from_entries(pairs) { return Object.fromEntries(pairs); }`,
  has_key: `function has_key(obj, key) { return obj != null && Object.prototype.hasOwnProperty.call(obj, key); }`,
  get: `function get(obj, path, def) { const keys = Array.isArray(path) ? path : String(path).split('.'); let cur = obj; for (const k of keys) { if (cur == null || typeof cur !== 'object') return def !== undefined ? def : null; cur = cur[k]; } return cur !== undefined ? cur : (def !== undefined ? def : null); }`,
  pick: `function pick(obj, ks) { const r = {}; for (const k of ks) { if (k in obj) r[k] = obj[k]; } return r; }`,
  omit: `function omit(obj, ks) { const s = new Set(ks); const r = {}; for (const k of Object.keys(obj)) { if (!s.has(k)) r[k] = obj[k]; } return r; }`,
  map_values: `function map_values(obj, fn) { const r = {}; for (const [k, v] of Object.entries(obj)) r[k] = fn(v, k); return r; }`,
  sliding_window: `function sliding_window(arr, n) { if (n <= 0 || n > arr.length) return []; const r = []; for (let i = 0; i <= arr.length - n; i++) r.push(arr.slice(i, i + n)); return r; }`,

  // ── JSON (new) ─────────────────────────────────────────
  json_parse: `function json_parse(s) { try { return Ok(JSON.parse(s)); } catch (e) { return Err(e.message); } }`,
  json_stringify: `function json_stringify(v) { return JSON.stringify(v); }`,
  json_pretty: `function json_pretty(v) { return JSON.stringify(v, null, 2); }`,

  // ── Functional (new) ───────────────────────────────────
  compose: `function compose(...fns) { return (x) => fns.reduceRight((v, fn) => fn(v), x); }`,
  pipe_fn: `function pipe_fn(...fns) { return (x) => fns.reduce((v, fn) => fn(v), x); }`,
  identity: `function identity(x) { return x; }`,
  memoize: `function memoize(fn) { const cache = new Map(); return function(...args) { const key = JSON.stringify(args); if (cache.has(key)) return cache.get(key); const result = fn.apply(this, args); cache.set(key, result); return result; }; }`,
  debounce: `function debounce(fn, ms) { let timer; return function(...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), ms); }; }`,
  throttle: `function throttle(fn, ms) { let last = 0; return function(...args) { const now = Date.now(); if (now - last >= ms) { last = now; return fn.apply(this, args); } }; }`,
  once: `function once(fn) { let called = false, result; return function(...args) { if (!called) { called = true; result = fn.apply(this, args); } return result; }; }`,
  negate: `function negate(fn) { return function(...args) { return !fn.apply(this, args); }; }`,

  // ── Error Handling (new) ───────────────────────────────
  try_fn: `function try_fn(fn) { try { return Ok(fn()); } catch (e) { return Err(e instanceof Error ? e.message : String(e)); } }`,
  try_async: `async function try_async(fn) { try { return Ok(await fn()); } catch (e) { return Err(e instanceof Error ? e.message : String(e)); } }`,

  // ── Async (new) ────────────────────────────────────────
  parallel: `function parallel(list) { return Promise.all(list); }`,
  race: `function race(promises) { return Promise.race(promises); }`,
  timeout: `function timeout(promise, ms) { return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after ' + ms + 'ms')), ms))]); }`,
  retry: `async function retry(fn, opts) { const o = opts || {}; const times = o.times || 3; const delay = o.delay || 100; const backoff = o.backoff || 1; let lastErr; for (let i = 0; i < times; i++) { try { return await fn(); } catch (e) { lastErr = e; if (i < times - 1) await new Promise(r => setTimeout(r, delay * Math.pow(backoff, i))); } } throw lastErr; }`,

  // ── Encoding (new) ─────────────────────────────────────
  base64_encode: `function base64_encode(s) { return typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf-8').toString('base64'); }`,
  base64_decode: `function base64_decode(s) { return typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf-8'); }`,
  url_encode: `function url_encode(s) { return encodeURIComponent(s); }`,
  url_decode: `function url_decode(s) { return decodeURIComponent(s); }`,

  // ── Math (new) ─────────────────────────────────────────
  hypot: `function hypot(a, b) { return Math.hypot(a, b); }`,
  lerp: `function lerp(a, b, t) { return a + (b - a) * t; }`,
  divmod: `function divmod(a, b) { const q = Math.floor(a / b); return [q, a - q * b]; }`,
  avg: `function avg(arr) { return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length; }`,

  // ── Date/Time (new) ────────────────────────────────────
  now: `function now() { return Date.now(); }`,
  now_iso: `function now_iso() { return new Date().toISOString(); }`,
  date_parse: `function date_parse(s) { const d = new Date(s); return isNaN(d.getTime()) ? Err('Invalid date: ' + s) : Ok(d); }`,
  date_format: `function date_format(d, fmt) { if (typeof d === 'number') d = new Date(d); if (fmt === 'iso') return d.toISOString(); if (fmt === 'date') return d.toISOString().slice(0, 10); if (fmt === 'time') return d.toTimeString().slice(0, 8); if (fmt === 'datetime') return d.toISOString().slice(0, 10) + ' ' + d.toTimeString().slice(0, 8); return fmt.replace('YYYY', String(d.getFullYear())).replace('MM', String(d.getMonth() + 1).padStart(2, '0')).replace('DD', String(d.getDate()).padStart(2, '0')).replace('HH', String(d.getHours()).padStart(2, '0')).replace('mm', String(d.getMinutes()).padStart(2, '0')).replace('ss', String(d.getSeconds()).padStart(2, '0')); }`,
  date_add: `function date_add(d, amount, unit) { if (typeof d === 'number') d = new Date(d); const r = new Date(d.getTime()); if (unit === 'years') r.setFullYear(r.getFullYear() + amount); else if (unit === 'months') r.setMonth(r.getMonth() + amount); else if (unit === 'days') r.setDate(r.getDate() + amount); else if (unit === 'hours') r.setHours(r.getHours() + amount); else if (unit === 'minutes') r.setMinutes(r.getMinutes() + amount); else if (unit === 'seconds') r.setSeconds(r.getSeconds() + amount); return r; }`,
  date_diff: `function date_diff(d1, d2, unit) { if (typeof d1 === 'number') d1 = new Date(d1); if (typeof d2 === 'number') d2 = new Date(d2); const ms = d2.getTime() - d1.getTime(); if (unit === 'seconds') return Math.floor(ms / 1000); if (unit === 'minutes') return Math.floor(ms / 60000); if (unit === 'hours') return Math.floor(ms / 3600000); if (unit === 'days') return Math.floor(ms / 86400000); if (unit === 'months') return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()); if (unit === 'years') return d2.getFullYear() - d1.getFullYear(); return ms; }`,
  date_from: `function date_from(parts) { return new Date(parts.year || 0, (parts.month || 1) - 1, parts.day || 1, parts.hour || 0, parts.minute || 0, parts.second || 0); }`,
  date_part: `function date_part(d, part) { if (typeof d === 'number') d = new Date(d); if (part === 'year') return d.getFullYear(); if (part === 'month') return d.getMonth() + 1; if (part === 'day') return d.getDate(); if (part === 'hour') return d.getHours(); if (part === 'minute') return d.getMinutes(); if (part === 'second') return d.getSeconds(); if (part === 'weekday') return d.getDay(); return null; }`,
  time_ago: `function time_ago(d) { if (typeof d === 'number') d = new Date(d); const s = Math.floor((Date.now() - d.getTime()) / 1000); if (s < 60) return s + ' seconds ago'; const m = Math.floor(s / 60); if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago'); const h = Math.floor(m / 60); if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago'); const dy = Math.floor(h / 24); if (dy < 30) return dy + (dy === 1 ? ' day ago' : ' days ago'); const mo = Math.floor(dy / 30); if (mo < 12) return mo + (mo === 1 ? ' month ago' : ' months ago'); const yr = Math.floor(mo / 12); return yr + (yr === 1 ? ' year ago' : ' years ago'); }`,

  // ── Regex (with compiled regex cache) ─────────────────
  __regex_cache: `const __reCache = new Map(); function __re(p, f) { const k = p + '\\0' + (f || ''); let r = __reCache.get(k); if (!r) { r = new RegExp(p, f); __reCache.set(k, r); if (__reCache.size > 1000) { const first = __reCache.keys().next().value; __reCache.delete(first); } } return r; }`,
  regex_test: `function regex_test(s, pattern, flags) { return __re(pattern, flags).test(s); }`,
  regex_match: `function regex_match(s, pattern, flags) { const m = s.match(__re(pattern, flags)); if (!m) return Err('No match'); return Ok({ match: m[0], index: m.index, groups: m.slice(1) }); }`,
  regex_find_all: `function regex_find_all(s, pattern, flags) { const re = __re(pattern, (flags || '') + (flags && flags.includes('g') ? '' : 'g')); const results = []; let m; re.lastIndex = 0; while ((m = re.exec(s)) !== null) { results.push({ match: m[0], index: m.index, groups: m.slice(1) }); } return results; }`,
  regex_replace: `function regex_replace(s, pattern, replacement, flags) { return s.replace(__re(pattern, flags || 'g'), replacement); }`,
  regex_split: `function regex_split(s, pattern, flags) { return s.split(__re(pattern, flags)); }`,
  regex_capture: `function regex_capture(s, pattern, flags) { const m = s.match(__re(pattern, flags)); if (!m) return Err('No match'); if (!m.groups) return Err('No named groups'); return Ok(m.groups); }`,

  // ── Validation ─────────────────────────────────────────
  is_email: `function is_email(s) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(s); }`,
  is_url: `function is_url(s) { try { new URL(s); return true; } catch { return false; } }`,
  is_numeric: `function is_numeric(s) { return typeof s === 'string' && s.length > 0 && !isNaN(Number(s)); }`,
  is_alpha: `function is_alpha(s) { return /^[a-zA-Z]+$/.test(s); }`,
  is_alphanumeric: `function is_alphanumeric(s) { return /^[a-zA-Z0-9]+$/.test(s); }`,
  is_uuid: `function is_uuid(s) { return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s); }`,
  is_hex: `function is_hex(s) { return /^[0-9a-fA-F]+$/.test(s); }`,

  // ── URL & UUID ─────────────────────────────────────────
  uuid: `function uuid() { return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); }`,
  parse_url: `function parse_url(s) { try { const u = new URL(s); return Ok({ protocol: u.protocol.replace(':', ''), host: u.host, pathname: u.pathname, search: u.search, hash: u.hash }); } catch (e) { return Err('Invalid URL: ' + s); } }`,
  build_url: `function build_url(parts) { let url = (parts.protocol || 'https') + '://' + (parts.host || ''); url += parts.pathname || '/'; if (parts.search) url += (parts.search.startsWith('?') ? '' : '?') + parts.search; if (parts.hash) url += (parts.hash.startsWith('#') ? '' : '#') + parts.hash; return url; }`,
  parse_query: `function parse_query(s) { const r = {}; const qs = s.startsWith('?') ? s.slice(1) : s; if (!qs) return r; for (const pair of qs.split('&')) { const [k, ...v] = pair.split('='); r[decodeURIComponent(k)] = decodeURIComponent(v.join('=')); } return r; }`,
  build_query: `function build_query(obj) { return Object.entries(obj).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&'); }`,

  // ── Set Operations ─────────────────────────────────────
  intersection: `function intersection(a, b) { const s = new Set(b); return a.filter(x => s.has(x)); }`,
  difference: `function difference(a, b) { const s = new Set(b); return a.filter(x => !s.has(x)); }`,
  symmetric_difference: `function symmetric_difference(a, b) { const sa = new Set(a); const sb = new Set(b); return [...a.filter(x => !sb.has(x)), ...b.filter(x => !sa.has(x))]; }`,
  is_subset: `function is_subset(a, b) { const s = new Set(b); return a.every(x => s.has(x)); }`,
  is_superset: `function is_superset(a, b) { const s = new Set(a); return b.every(x => s.has(x)); }`,

  // ── Statistics ─────────────────────────────────────────
  mode: `function mode(arr) { if (arr.length === 0) return null; const freq = {}; let maxF = 0, result = arr[0]; for (const v of arr) { const k = String(v); freq[k] = (freq[k] || 0) + 1; if (freq[k] > maxF) { maxF = freq[k]; result = v; } } return result; }`,
  stdev: `function stdev(arr) { if (arr.length === 0) return 0; const m = arr.reduce((a, b) => a + b, 0) / arr.length; return Math.sqrt(arr.reduce((s, v) => s + (v - m) * (v - m), 0) / arr.length); }`,
  variance: `function variance(arr) { if (arr.length === 0) return 0; const m = arr.reduce((a, b) => a + b, 0) / arr.length; return arr.reduce((s, v) => s + (v - m) * (v - m), 0) / arr.length; }`,
  percentile: `function percentile(arr, p) { if (arr.length === 0) return null; const s = [...arr].sort((a, b) => a - b); const i = (p / 100) * (s.length - 1); const lo = Math.floor(i); const hi = Math.ceil(i); if (lo === hi) return s[lo]; return s[lo] + (s[hi] - s[lo]) * (i - lo); }`,

  // ── Text Utilities ─────────────────────────────────────
  truncate: `function truncate(s, n, suffix) { const sf = suffix !== undefined ? suffix : '...'; return s.length <= n ? s : s.slice(0, n - sf.length) + sf; }`,
  word_wrap: `function word_wrap(s, width) { const ws = s.split(' '); const lines = []; let line = ''; for (const w of ws) { if (line && (line.length + 1 + w.length) > width) { lines.push(line); line = w; } else { line = line ? line + ' ' + w : w; } } if (line) lines.push(line); return lines.join('\\n'); }`,
  dedent: `function dedent(s) { const lines = s.split('\\n'); const nonEmpty = lines.filter(l => l.trim().length > 0); if (nonEmpty.length === 0) return s; const indent = Math.min(...nonEmpty.map(l => l.match(/^(\\s*)/)[1].length)); return lines.map(l => l.slice(indent)).join('\\n'); }`,
  indent_str: `function indent_str(s, n, ch) { const prefix = (ch || ' ').repeat(n); return s.split('\\n').map(l => prefix + l).join('\\n'); }`,
  slugify: `function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }`,
  escape_html: `function escape_html(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }`,
  unescape_html: `function unescape_html(s) { return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }`,

  // ── Number Formatting ──────────────────────────────────
  format_number: `function format_number(n, opts) { const o = opts || {}; const sep = o.separator || ','; const dec = o.decimals; let s = dec !== undefined ? n.toFixed(dec) : String(n); const parts = s.split('.'); parts[0] = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, sep); return parts.join('.'); }`,
  to_hex: `function to_hex(n) { return Math.trunc(n).toString(16); }`,
  to_binary: `function to_binary(n) { return Math.trunc(n).toString(2); }`,
  to_octal: `function to_octal(n) { return Math.trunc(n).toString(8); }`,
  to_fixed: `function to_fixed(n, decimals) { return Number(n.toFixed(decimals)); }`,

  // ── Itertools ──────────────────────────────────────────
  pairwise: `function pairwise(arr) { const r = []; for (let i = 0; i < arr.length - 1; i++) r.push([arr[i], arr[i + 1]]); return r; }`,
  combinations: `function combinations(arr, r) { const result = []; const combo = []; function gen(start, depth) { if (depth === r) { result.push([...combo]); return; } for (let i = start; i < arr.length; i++) { combo.push(arr[i]); gen(i + 1, depth + 1); combo.pop(); } } gen(0, 0); return result; }`,
  permutations: `function permutations(arr, r) { const n = r === undefined ? arr.length : r; const result = []; const perm = []; const used = new Array(arr.length).fill(false); function gen() { if (perm.length === n) { result.push([...perm]); return; } for (let i = 0; i < arr.length; i++) { if (!used[i]) { used[i] = true; perm.push(arr[i]); gen(); perm.pop(); used[i] = false; } } } gen(); return result; }`,
  intersperse: `function intersperse(arr, sep) { if (arr.length <= 1) return [...arr]; const r = [arr[0]]; for (let i = 1; i < arr.length; i++) { r.push(sep, arr[i]); } return r; }`,
  interleave: `function interleave(...arrs) { if (arrs.length === 0) return []; const m = Math.max(...arrs.map(a => a.length)); const r = []; for (let i = 0; i < m; i++) { for (const a of arrs) { if (i < a.length) r.push(a[i]); } } return r; }`,
  repeat_value: `function repeat_value(val, n) { return Array(n).fill(val); }`,

  // ── Array Utilities ────────────────────────────────────
  binary_search: `function binary_search(arr, target, keyFn) { let lo = 0, hi = arr.length - 1; while (lo <= hi) { const mid = (lo + hi) >> 1; const val = keyFn ? keyFn(arr[mid]) : arr[mid]; if (val === target) return mid; if (val < target) lo = mid + 1; else hi = mid - 1; } return -1; }`,
  is_sorted: `function is_sorted(arr, keyFn) { for (let i = 1; i < arr.length; i++) { const a = keyFn ? keyFn(arr[i - 1]) : arr[i - 1]; const b = keyFn ? keyFn(arr[i]) : arr[i]; if (a > b) return false; } return true; }`,
  compact: `function compact(arr) { return arr.filter(v => v != null); }`,
  rotate: `function rotate(arr, n) { if (arr.length === 0) return []; const k = ((n % arr.length) + arr.length) % arr.length; return [...arr.slice(k), ...arr.slice(0, k)]; }`,
  insert_at: `function insert_at(arr, idx, val) { const r = [...arr]; r.splice(idx, 0, val); return r; }`,
  remove_at: `function remove_at(arr, idx) { const r = [...arr]; r.splice(idx, 1); return r; }`,
  update_at: `function update_at(arr, idx, val) { const r = [...arr]; r[idx] = val; return r; }`,

  // ── Functional (extended) ──────────────────────────────
  partial: `function partial(fn, ...bound) { return function(...args) { return fn(...bound, ...args); }; }`,
  curry: `function curry(fn, arity) { const n = arity || fn.length; return function curried(...args) { if (args.length >= n) return fn(...args); return function(...more) { return curried(...args, ...more); }; }; }`,
  flip: `function flip(fn) { return function(a, b, ...rest) { return fn(b, a, ...rest); }; }`,

  // ── Encoding (extended) ────────────────────────────────
  hex_encode: `function hex_encode(s) { let r = ''; for (let i = 0; i < s.length; i++) r += s.charCodeAt(i).toString(16).padStart(2, '0'); return r; }`,
  hex_decode: `function hex_decode(s) { let r = ''; for (let i = 0; i < s.length; i += 2) r += String.fromCharCode(parseInt(s.substr(i, 2), 16)); return r; }`,

  // ── String (extended) ──────────────────────────────────
  fmt: `function fmt(template, ...args) { let i = 0; return template.replace(/\\{\\}/g, () => i < args.length ? String(args[i++]) : '{}'); }`,

  // ── Scripting: Environment & CLI ──────────────────────
  env: `function env(key, fallback) { if (key === undefined) return { ...process.env }; const v = process.env[key]; return v !== undefined ? v : (fallback !== undefined ? fallback : null); }`,
  set_env: `function set_env(key, value) { process.env[key] = String(value); }`,
  args: `function args() { return typeof __tova_args !== 'undefined' ? __tova_args : process.argv.slice(2); }`,
  exit: `function exit(code) { process.exit(code !== undefined ? code : 0); }`,

  // ── Scripting: Filesystem ─────────────────────────────
  exists: `function exists(path) { const fs = require('fs'); return fs.existsSync(path); }`,
  is_dir: `function is_dir(path) { try { return require('fs').statSync(path).isDirectory(); } catch { return false; } }`,
  is_file: `function is_file(path) { try { return require('fs').statSync(path).isFile(); } catch { return false; } }`,
  ls: `function ls(dir, opts) { const fs = require('fs'); const p = require('path'); const d = dir || '.'; const entries = fs.readdirSync(d); if (opts && opts.full) return entries.map(e => p.join(d, e)); return entries; }`,
  glob_files: `function glob_files(pattern, opts) { if (typeof Bun !== 'undefined' && Bun.Glob) { const glob = new Bun.Glob(pattern); const results = [...glob.scanSync(opts && opts.cwd || '.')]; return results; } const fs = require('fs'); if (fs.globSync) return fs.globSync(pattern, opts); return []; }`,
  mkdir: `function mkdir(dir) { try { require('fs').mkdirSync(dir, { recursive: true }); return Ok(dir); } catch (e) { return Err(e.message); } }`,
  rm: `function rm(path, opts) { try { require('fs').rmSync(path, { recursive: !!(opts && opts.recursive), force: !!(opts && opts.force) }); return Ok(path); } catch (e) { return Err(e.message); } }`,
  cp: `function cp(src, dest, opts) { try { const fs = require('fs'); if (opts && opts.recursive) { fs.cpSync(src, dest, { recursive: true }); } else { fs.copyFileSync(src, dest); } return Ok(dest); } catch (e) { return Err(e.message); } }`,
  mv: `function mv(src, dest) { try { require('fs').renameSync(src, dest); return Ok(dest); } catch (e) { return Err(e.message); } }`,
  cwd: `function cwd() { return process.cwd(); }`,
  chdir: `function chdir(dir) { try { process.chdir(dir); return Ok(dir); } catch (e) { return Err(e.message); } }`,
  read_text: `function read_text(path, enc) { try { return Ok(require('fs').readFileSync(path, enc || 'utf-8')); } catch (e) { return Err(e.message); } }`,
  read_bytes: `function read_bytes(path) { try { return Ok(require('fs').readFileSync(path)); } catch (e) { return Err(e.message); } }`,
  write_text: `function write_text(path, content, opts) { try { const fs = require('fs'); if (opts && opts.append) fs.appendFileSync(path, content); else fs.writeFileSync(path, content); return Ok(path); } catch (e) { return Err(e.message); } }`,

  // ── Scripting: Shell ──────────────────────────────────
  // sh() uses shell:true for convenience (pipes, redirects). For trusted commands only.
  // exec() uses shell:false — safe from injection by default (array args).
  sh: `function sh(cmd, opts) { try { const cp = require('child_process'); const o = opts || {}; const result = cp.spawnSync(cmd, { shell: true, cwd: o.cwd, env: o.env ? { ...process.env, ...o.env } : undefined, timeout: o.timeout, stdio: o.inherit ? 'inherit' : 'pipe', encoding: 'utf-8' }); if (result.error) return Err(result.error.message); return Ok({ stdout: (result.stdout || '').trimEnd(), stderr: (result.stderr || '').trimEnd(), exitCode: result.status }); } catch (e) { return Err(e.message); } }`,
  exec: `function exec(cmd, cmdArgs, opts) { try { const cp = require('child_process'); if (cmdArgs && typeof cmdArgs === 'object' && !Array.isArray(cmdArgs)) { opts = cmdArgs; cmdArgs = []; } const o = opts || {}; const a = cmdArgs || []; const result = cp.spawnSync(cmd, a, { shell: false, cwd: o.cwd, env: o.env ? { ...process.env, ...o.env } : undefined, timeout: o.timeout, stdio: o.inherit ? 'inherit' : 'pipe', encoding: 'utf-8' }); if (result.error) return Err(result.error.message); return Ok({ stdout: (result.stdout || '').trimEnd(), stderr: (result.stderr || '').trimEnd(), exitCode: result.status }); } catch (e) { return Err(e.message); } }`,

  // ── Scripting: stdin ─────────────────────────────────
  read_stdin: `function read_stdin() { try { return require('fs').readFileSync(0, 'utf-8'); } catch { return ''; } }`,
  read_lines: `function read_lines() { try { return require('fs').readFileSync(0, 'utf-8').split('\\n').filter(l => l.length > 0); } catch { return []; } }`,

  // ── Scripting: Script path ──────────────────────────
  script_path: `function script_path() { return typeof __tova_filename !== 'undefined' ? __tova_filename : null; }`,
  script_dir: `function script_dir() { return typeof __tova_dirname !== 'undefined' ? __tova_dirname : null; }`,

  // ── Scripting: Argument parsing ──────────────────────
  parse_args: `function parse_args(argv) { const flags = {}; const positional = []; let i = 0; while (i < argv.length) { const arg = argv[i]; if (arg === '--') { positional.push(...argv.slice(i + 1)); break; } if (arg.startsWith('--')) { const eq = arg.indexOf('='); if (eq !== -1) { flags[arg.slice(2, eq)] = arg.slice(eq + 1); } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) { flags[arg.slice(2)] = argv[i + 1]; i++; } else { flags[arg.slice(2)] = true; } } else if (arg.startsWith('-') && arg.length > 1) { for (let j = 1; j < arg.length; j++) flags[arg[j]] = true; } else { positional.push(arg); } i++; } return { flags, positional }; }`,

  // ── Lazy Iterators / Sequences ──────────────────────
  iter: `function iter(source) { return new Seq(function*() { for (const x of source) yield x; }); }`,
  Seq: `class Seq {
  constructor(gen) { this._gen = gen; }
  filter(fn) { const g = this._gen; return new Seq(function*() { for (const x of g()) if (fn(x)) yield x; }); }
  map(fn) { const g = this._gen; return new Seq(function*() { for (const x of g()) yield fn(x); }); }
  take(n) { const g = this._gen; return new Seq(function*() { let i = 0; for (const x of g()) { if (i++ >= n) return; yield x; } }); }
  drop(n) { const g = this._gen; return new Seq(function*() { let i = 0; for (const x of g()) { if (i++ < n) continue; yield x; } }); }
  zip(other) { const g1 = this._gen; const g2 = other._gen; return new Seq(function*() { const i1 = g1(), i2 = g2(); while (true) { const a = i1.next(), b = i2.next(); if (a.done || b.done) return; yield [a.value, b.value]; } }); }
  flat_map(fn) { const g = this._gen; return new Seq(function*() { for (const x of g()) { const result = fn(x); if (result && result._gen) { for (const y of result._gen()) yield y; } else if (result && result[Symbol.iterator]) { for (const y of result) yield y; } else { yield result; } } }); }
  enumerate() { const g = this._gen; return new Seq(function*() { let i = 0; for (const x of g()) yield [i++, x]; }); }
  collect() { return [...this._gen()]; }
  toArray() { return this.collect(); }
  reduce(fn, init) { let acc = init; for (const x of this._gen()) acc = fn(acc, x); return acc; }
  first() { for (const x of this._gen()) return Some(x); return None; }
  count() { let n = 0; for (const x of this._gen()) n++; return n; }
  forEach(fn) { for (const x of this._gen()) fn(x); }
  any(fn) { for (const x of this._gen()) if (fn(x)) return true; return false; }
  all(fn) { for (const x of this._gen()) if (!fn(x)) return false; return true; }
  find(fn) { for (const x of this._gen()) if (fn(x)) return Some(x); return None; }
  [Symbol.iterator]() { return this._gen(); }
}`,

  // ── Scripting: Terminal colors ──────────────────────
  color: `function color(text, name) { if (typeof process !== 'undefined' && (process.env.NO_COLOR || (process.stdout && !process.stdout.isTTY))) return String(text); const codes = { red: '31', green: '32', yellow: '33', blue: '34', magenta: '35', cyan: '36', white: '37', gray: '90' }; const c = codes[name]; return c ? '\\x1b[' + c + 'm' + text + '\\x1b[0m' : String(text); }`,
  bold: `function bold(text) { if (typeof process !== 'undefined' && (process.env.NO_COLOR || (process.stdout && !process.stdout.isTTY))) return String(text); return '\\x1b[1m' + text + '\\x1b[0m'; }`,
  dim: `function dim(text) { if (typeof process !== 'undefined' && (process.env.NO_COLOR || (process.stdout && !process.stdout.isTTY))) return String(text); return '\\x1b[2m' + text + '\\x1b[0m'; }`,

  // ── Scripting: Color shortcuts ────────────────────────
  green: `function green(text) { return color(text, 'green'); }`,
  red: `function red(text) { return color(text, 'red'); }`,
  yellow: `function yellow(text) { return color(text, 'yellow'); }`,
  blue: `function blue(text) { return color(text, 'blue'); }`,
  cyan: `function cyan(text) { return color(text, 'cyan'); }`,
  magenta: `function magenta(text) { return color(text, 'magenta'); }`,
  gray: `function gray(text) { return color(text, 'gray'); }`,
  underline: `function underline(text) { if (typeof process !== 'undefined' && (process.env.NO_COLOR || (process.stdout && !process.stdout.isTTY))) return String(text); return '\\x1b[4m' + text + '\\x1b[0m'; }`,
  strikethrough: `function strikethrough(text) { if (typeof process !== 'undefined' && (process.env.NO_COLOR || (process.stdout && !process.stdout.isTTY))) return String(text); return '\\x1b[9m' + text + '\\x1b[0m'; }`,

  // ── Scripting: Rich output ────────────────────────────
  table: `function table(data, opts) {
  if (!data || data.length === 0) { console.log("(empty)"); return; }
  const o = opts || {};
  const headers = o.headers || Object.keys(data[0]);
  const rows = data.map(function(row) { return headers.map(function(h) { return String(row[h] != null ? row[h] : ''); }); });
  const widths = headers.map(function(h, i) {
    return Math.max(h.length, ...rows.map(function(r) { return r[i].length; }));
  });
  const noColor = typeof process !== 'undefined' && (process.env.NO_COLOR || (process.stdout && !process.stdout.isTTY));
  const b = function(t) { return noColor ? t : '\\x1b[1m' + t + '\\x1b[0m'; };
  const line = widths.map(function(w) { return '-'.repeat(w + 2); }).join('+');
  console.log(b(headers.map(function(h, i) { return ' ' + h.padEnd(widths[i]) + ' '; }).join('|')));
  console.log(line);
  rows.forEach(function(r) { console.log(r.map(function(c, i) { return ' ' + c.padEnd(widths[i]) + ' '; }).join('|')); });
}`,

  panel: `function panel(title, content) {
  var lines = String(content).split('\\n');
  var maxLen = Math.max(title ? title.length + 2 : 0, ...lines.map(function(l) { return l.length; }));
  var noColor = typeof process !== 'undefined' && (process.env.NO_COLOR || (process.stdout && !process.stdout.isTTY));
  var b = function(t) { return noColor ? t : '\\x1b[1m' + t + '\\x1b[0m'; };
  var top = '\\u250c' + (title ? '\\u2500 ' + b(title) + ' ' + '\\u2500'.repeat(Math.max(0, maxLen - title.length - 2)) : '\\u2500'.repeat(maxLen + 2)) + '\\u2510';
  var bot = '\\u2514' + '\\u2500'.repeat(maxLen + 2) + '\\u2518';
  var body = lines.map(function(l) { return '\\u2502 ' + l.padEnd(maxLen) + ' \\u2502'; }).join('\\n');
  console.log(top + '\\n' + body + '\\n' + bot);
}`,

  progress: `function progress(items, opts) {
  var o = opts || {};
  var total = items.length || o.total || 0;
  var label = o.label || '';
  var width = o.width || 30;
  var isTTY = typeof process !== 'undefined' && process.stderr && process.stderr.isTTY;
  var idx = 0;
  return { [Symbol.iterator]() {
    var it = items[Symbol.iterator]();
    return { next() {
      var r = it.next();
      if (!r.done) {
        idx++;
        if (isTTY) {
          var pct = Math.round(idx / total * 100);
          var filled = Math.round(idx / total * width);
          var bar = '\\u2588'.repeat(filled) + '\\u2591'.repeat(width - filled);
          process.stderr.write('\\r' + label + ' [' + bar + '] ' + pct + '% ' + idx + '/' + total);
        }
      } else if (isTTY) {
        process.stderr.write('\\r' + ' '.repeat(width + label.length + 20) + '\\r');
      }
      return r;
    }};
  }};
}`,

  spin: `async function spin(label, fn) {
  var frames = ['\\u2838','\\u2834','\\u2826','\\u2823','\\u2831','\\u2839'];
  var isTTY = typeof process !== 'undefined' && process.stderr && process.stderr.isTTY;
  var i = 0;
  var iv = isTTY ? setInterval(function() { process.stderr.write('\\r' + frames[i++ % frames.length] + ' ' + label); }, 80) : null;
  try {
    var result = await fn();
    if (iv) clearInterval(iv);
    if (isTTY) process.stderr.write('\\r\\u2714 ' + label + '\\n');
    return result;
  } catch (e) {
    if (iv) clearInterval(iv);
    if (isTTY) process.stderr.write('\\r\\u2718 ' + label + '\\n');
    throw e;
  }
}`,

  // ── Scripting: Interactive prompts ─────────────────────
  ask: `async function ask(prompt, opts) {
  var o = opts || {};
  var rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  var suffix = o.default ? ' (' + o.default + ')' : '';
  return new Promise(function(resolve) {
    rl.question(prompt + suffix + ' ', function(answer) {
      rl.close();
      resolve(answer || o.default || '');
    });
  });
}`,

  confirm: `async function confirm(prompt, opts) {
  var o = opts || {};
  var def = o.default !== undefined ? o.default : true;
  var hint = def ? '[Y/n]' : '[y/N]';
  var rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(function(resolve) {
    rl.question(prompt + ' ' + hint + ' ', function(answer) {
      rl.close();
      if (!answer) { resolve(def); return; }
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}`,

  choose: `async function choose(prompt, options) {
  console.log(prompt);
  for (var i = 0; i < options.length; i++) console.log('  ' + (i + 1) + '. ' + options[i]);
  var rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(function(resolve) {
    rl.question('Select [1-' + options.length + ']: ', function(answer) {
      rl.close();
      var idx = parseInt(answer, 10) - 1;
      resolve(idx >= 0 && idx < options.length ? options[idx] : options[0]);
    });
  });
}`,

  choose_many: `async function choose_many(prompt, options) {
  console.log(prompt);
  for (var i = 0; i < options.length; i++) console.log('  ' + (i + 1) + '. ' + options[i]);
  var rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(function(resolve) {
    rl.question('Select (comma-separated): ', function(answer) {
      rl.close();
      var indices = answer.split(',').map(function(s) { return parseInt(s.trim(), 10) - 1; });
      resolve(indices.filter(function(i) { return i >= 0 && i < options.length; }).map(function(i) { return options[i]; }));
    });
  });
}`,

  secret: `async function secret(prompt) {
  var rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(function(resolve) {
    if (process.stdin.isTTY) {
      process.stdout.write(prompt + ' ');
      process.stdin.setRawMode(true);
      process.stdin.resume();
      var buf = '';
      var onData = function(ch) {
        ch = ch.toString();
        if (ch === '\\n' || ch === '\\r' || ch === '\\u0004') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\\n');
          rl.close();
          resolve(buf);
        } else if (ch === '\\u007f' || ch === '\\b') {
          if (buf.length > 0) { buf = buf.slice(0, -1); process.stdout.write('\\b \\b'); }
        } else {
          buf += ch;
          process.stdout.write('*');
        }
      };
      process.stdin.on('data', onData);
    } else {
      rl.question(prompt + ' ', function(answer) { rl.close(); resolve(answer); });
    }
  });
}`,

  // ── Scripting: Signal handling ────────────────────────
  on_signal: `function on_signal(name, callback) { process.on(name, callback); }`,

  // ── Scripting: File stat ──────────────────────────────
  file_stat: `function file_stat(path) { try { const s = require('fs').statSync(path); return Ok({ size: s.size, mode: s.mode, mtime: s.mtime.toISOString(), atime: s.atime.toISOString(), isDir: s.isDirectory(), isFile: s.isFile(), isSymlink: s.isSymbolicLink() }); } catch (e) { return Err(e.message); } }`,
  file_size: `function file_size(path) { try { return Ok(require('fs').statSync(path).size); } catch (e) { return Err(e.message); } }`,

  // ── Scripting: Path utilities ─────────────────────────
  path_join: `function path_join(...parts) { return require('path').join(...parts); }`,
  path_dirname: `function path_dirname(p) { return require('path').dirname(p); }`,
  path_basename: `function path_basename(p, ext) { return ext ? require('path').basename(p, ext) : require('path').basename(p); }`,
  path_resolve: `function path_resolve(p) { return require('path').resolve(p); }`,
  path_ext: `function path_ext(p) { return require('path').extname(p); }`,
  path_relative: `function path_relative(from, to) { return require('path').relative(from, to); }`,

  // ── Scripting: Symlinks ───────────────────────────────
  symlink: `function symlink(target, path) { try { require('fs').symlinkSync(target, path); return Ok(null); } catch (e) { return Err(e.message); } }`,
  readlink: `function readlink(path) { try { return Ok(require('fs').readlinkSync(path)); } catch (e) { return Err(e.message); } }`,
  is_symlink: `function is_symlink(path) { try { return require('fs').lstatSync(path).isSymbolicLink(); } catch { return false; } }`,

  // ── Scripting: Async shell ────────────────────────────
  spawn: `function spawn(cmd, cmdArgs, opts) { if (cmdArgs && typeof cmdArgs === 'object' && !Array.isArray(cmdArgs)) { opts = cmdArgs; cmdArgs = []; } const o = opts || {}; const a = cmdArgs || []; return new Promise(function(resolve) { try { const cp = require('child_process'); const child = cp.spawn(cmd, a, { shell: !!o.shell, cwd: o.cwd, env: o.env ? Object.assign({}, process.env, o.env) : undefined, stdio: 'pipe' }); let stdout = ''; let stderr = ''; child.stdout.on('data', function(d) { stdout += d; }); child.stderr.on('data', function(d) { stderr += d; }); child.on('error', function(e) { resolve(Err(e.message)); }); child.on('close', function(code) { resolve(Ok({ stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), exitCode: code })); }); } catch (e) { resolve(Err(e.message)); } }); }`,

  // ── Ordering type ─────────────────────────────────────
  Less: `const Less = Object.freeze({ __tag: "Less", value: -1 });`,
  Equal: `const Equal = Object.freeze({ __tag: "Equal", value: 0 });`,
  Greater: `const Greater = Object.freeze({ __tag: "Greater", value: 1 });`,
  compare: `function compare(a, b) { if (a < b) return Less; if (a > b) return Greater; return Equal; }`,
  compare_by: `function compare_by(arr, fn) { return [...arr].sort(function(a, b) { const ord = fn(a, b); return ord.value; }); }`,

  // ── Regex Builder ─────────────────────────────────────
  RegexBuilder: `class RegexBuilder {
  constructor() { this._parts = []; this._flags = ''; }
  literal(s) { this._parts.push(s.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')); return this; }
  digits(n) { this._parts.push(n ? '\\\\d{' + n + '}' : '\\\\d+'); return this; }
  word() { this._parts.push('\\\\w+'); return this; }
  space() { this._parts.push('\\\\s+'); return this; }
  any() { this._parts.push('.'); return this; }
  oneOf(chars) { this._parts.push('[' + chars.replace(/[\\]\\\\]/g, '\\\\$&') + ']'); return this; }
  group(name) { this._parts.push(name ? '(?<' + name + '>' : '('); return this; }
  endGroup() { this._parts.push(')'); return this; }
  optional() { this._parts.push('?'); return this; }
  oneOrMore() { this._parts.push('+'); return this; }
  zeroOrMore() { this._parts.push('*'); return this; }
  startOfLine() { this._parts.push('^'); return this; }
  endOfLine() { this._parts.push('$'); return this; }
  flags(f) { this._flags = f; return this; }
  build() { return new RegExp(this._parts.join(''), this._flags); }
  test(s) { return this.build().test(s); }
  match(s) { return s.match(this.build()); }
}`,
  regex_builder: `function regex_builder() { return new RegexBuilder(); }`,

  // ── Namespace modules ──────────────────────────────────
  math: `const math = Object.freeze({
  sin(n) { return Math.sin(n); },
  cos(n) { return Math.cos(n); },
  tan(n) { return Math.tan(n); },
  asin(n) { return Math.asin(n); },
  acos(n) { return Math.acos(n); },
  atan(n) { return Math.atan(n); },
  atan2(y, x) { return Math.atan2(y, x); },
  log(n) { return Math.log(n); },
  log2(n) { return Math.log2(n); },
  log10(n) { return Math.log10(n); },
  exp(n) { return Math.exp(n); },
  abs(n) { return Math.abs(n); },
  floor(n) { return Math.floor(n); },
  ceil(n) { return Math.ceil(n); },
  round(n) { return Math.round(n); },
  sqrt(n) { return Math.sqrt(n); },
  pow(b, e) { return Math.pow(b, e); },
  clamp(n, lo, hi) { return Math.min(Math.max(n, lo), hi); },
  random() { return Math.random(); },
  sign(n) { return Math.sign(n); },
  trunc(n) { return Math.trunc(n); },
  hypot(a, b) { return Math.hypot(a, b); },
  lerp(a, b, t) { return a + (b - a) * t; },
  gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; },
  lcm(a, b) { if (a === 0 && b === 0) return 0; let x = Math.abs(a), y = Math.abs(b); while (y) { const t = y; y = x % y; x = t; } return Math.abs(a * b) / x; },
  factorial(n) { if (n < 0) return null; if (n <= 1) return 1; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; },
  PI: Math.PI,
  E: Math.E,
  INF: Infinity
});`,

  str: `const str = Object.freeze({
  upper(s) { return s.toUpperCase(); },
  lower(s) { return s.toLowerCase(); },
  trim(s) { return s.trim(); },
  trim_start(s) { return s.trimStart(); },
  trim_end(s) { return s.trimEnd(); },
  split(s, sep) { return s.split(sep); },
  join(arr, sep) { return arr.join(sep); },
  replace(s, from, to) { return typeof from === 'string' ? s.replaceAll(from, to) : s.replace(from, to); },
  repeat(s, n) { return s.repeat(n); },
  contains(s, sub) { return s.includes(sub); },
  starts_with(s, prefix) { return s.startsWith(prefix); },
  ends_with(s, suffix) { return s.endsWith(suffix); },
  chars(s) { return [...s]; },
  words(s) { return s.split(/\\s+/).filter(Boolean); },
  lines(s) { return s.split('\\n'); },
  capitalize(s) { return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s; },
  title_case(s) { return s.replace(/\\b\\w/g, c => c.toUpperCase()); },
  snake_case(s) { return s.replace(/[-\\s]+/g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/^_/, ''); },
  camel_case(s) { return s.replace(/[-_\\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '').replace(/^[A-Z]/, c => c.toLowerCase()); },
  kebab_case(s) { return s.replace(/[-\\s]+/g, '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/^-/, ''); },
  index_of(s, sub) { const i = s.indexOf(sub); return i === -1 ? null : i; },
  last_index_of(s, sub) { const i = s.lastIndexOf(sub); return i === -1 ? null : i; },
  pad_start(s, n, fill) { return s.padStart(n, fill || ' '); },
  pad_end(s, n, fill) { return s.padEnd(n, fill || ' '); },
  center(s, n, fill) { if (s.length >= n) return s; const f = fill || ' '; const total = n - s.length; const left = Math.floor(total / 2); const right = total - left; return f.repeat(Math.ceil(left / f.length)).slice(0, left) + s + f.repeat(Math.ceil(right / f.length)).slice(0, right); },
  slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); },
  escape_html(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); },
  unescape_html(s) { return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
});`,

  arr: `const arr = Object.freeze({
  sorted(a, k) { const c = [...a]; if (k) c.sort((x, y) => { const kx = k(x), ky = k(y); return kx < ky ? -1 : kx > ky ? 1 : 0; }); else c.sort((x, y) => x < y ? -1 : x > y ? 1 : 0); return c; },
  reversed(a) { return [...a].reverse(); },
  unique(a) { return [...new Set(a)]; },
  chunk(a, n) { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; },
  flatten(a) { return a.flat(); },
  take(a, n) { return a.slice(0, n); },
  drop(a, n) { return a.slice(n); },
  first(a) { return a.length > 0 ? a[0] : null; },
  last(a) { return a.length > 0 ? a[a.length - 1] : null; },
  count(a, fn) { return a.filter(fn).length; },
  partition(a, fn) { const y = [], n = []; for (const v of a) { (fn(v) ? y : n).push(v); } return [y, n]; },
  group_by(a, fn) { const r = {}; for (const v of a) { const k = fn(v); if (!r[k]) r[k] = []; r[k].push(v); } return r; },
  zip_with(a, b, fn) { const m = Math.min(a.length, b.length); const r = []; for (let i = 0; i < m; i++) r.push(fn ? fn(a[i], b[i]) : [a[i], b[i]]); return r; },
  frequencies(a) { const r = {}; for (const v of a) { const k = String(v); r[k] = (r[k] || 0) + 1; } return r; },
  scan(a, fn, init) { const r = []; let acc = init; for (const v of a) { acc = fn(acc, v); r.push(acc); } return r; },
  min_by(a, fn) { if (a.length === 0) return null; let best = a[0], bestK = fn(a[0]); for (let i = 1; i < a.length; i++) { const k = fn(a[i]); if (k < bestK) { best = a[i]; bestK = k; } } return best; },
  max_by(a, fn) { if (a.length === 0) return null; let best = a[0], bestK = fn(a[0]); for (let i = 1; i < a.length; i++) { const k = fn(a[i]); if (k > bestK) { best = a[i]; bestK = k; } } return best; },
  sum_by(a, fn) { let s = 0; for (const v of a) s += fn(v); return s; },
  compact(a) { return a.filter(v => v != null); },
  rotate(a, n) { if (a.length === 0) return []; const k = ((n % a.length) + a.length) % a.length; return [...a.slice(k), ...a.slice(0, k)]; },
  insert_at(a, idx, val) { const r = [...a]; r.splice(idx, 0, val); return r; },
  remove_at(a, idx) { const r = [...a]; r.splice(idx, 1); return r; },
  binary_search(a, target, keyFn) { let lo = 0, hi = a.length - 1; while (lo <= hi) { const mid = (lo + hi) >> 1; const val = keyFn ? keyFn(a[mid]) : a[mid]; if (val === target) return mid; if (val < target) lo = mid + 1; else hi = mid - 1; } return -1; },
  is_sorted(a, keyFn) { for (let i = 1; i < a.length; i++) { const x = keyFn ? keyFn(a[i - 1]) : a[i - 1]; const y = keyFn ? keyFn(a[i]) : a[i]; if (x > y) return false; } return true; }
});`,

  dt: `const dt = Object.freeze({
  now() { return Date.now(); },
  now_iso() { return new Date().toISOString(); },
  parse(s) { const d = new Date(s); return isNaN(d.getTime()) ? Err('Invalid date: ' + s) : Ok(d); },
  format(d, fmt) { if (typeof d === 'number') d = new Date(d); if (fmt === 'iso') return d.toISOString(); if (fmt === 'date') return d.toISOString().slice(0, 10); if (fmt === 'time') return d.toTimeString().slice(0, 8); if (fmt === 'datetime') return d.toISOString().slice(0, 10) + ' ' + d.toTimeString().slice(0, 8); return fmt.replace('YYYY', String(d.getFullYear())).replace('MM', String(d.getMonth() + 1).padStart(2, '0')).replace('DD', String(d.getDate()).padStart(2, '0')).replace('HH', String(d.getHours()).padStart(2, '0')).replace('mm', String(d.getMinutes()).padStart(2, '0')).replace('ss', String(d.getSeconds()).padStart(2, '0')); },
  add(d, amount, unit) { if (typeof d === 'number') d = new Date(d); const r = new Date(d.getTime()); if (unit === 'years') r.setFullYear(r.getFullYear() + amount); else if (unit === 'months') r.setMonth(r.getMonth() + amount); else if (unit === 'days') r.setDate(r.getDate() + amount); else if (unit === 'hours') r.setHours(r.getHours() + amount); else if (unit === 'minutes') r.setMinutes(r.getMinutes() + amount); else if (unit === 'seconds') r.setSeconds(r.getSeconds() + amount); return r; },
  diff(d1, d2, unit) { if (typeof d1 === 'number') d1 = new Date(d1); if (typeof d2 === 'number') d2 = new Date(d2); const ms = d2.getTime() - d1.getTime(); if (unit === 'seconds') return Math.floor(ms / 1000); if (unit === 'minutes') return Math.floor(ms / 60000); if (unit === 'hours') return Math.floor(ms / 3600000); if (unit === 'days') return Math.floor(ms / 86400000); if (unit === 'months') return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()); if (unit === 'years') return d2.getFullYear() - d1.getFullYear(); return ms; },
  from(parts) { return new Date(parts.year || 0, (parts.month || 1) - 1, parts.day || 1, parts.hour || 0, parts.minute || 0, parts.second || 0); },
  part(d, p) { if (typeof d === 'number') d = new Date(d); if (p === 'year') return d.getFullYear(); if (p === 'month') return d.getMonth() + 1; if (p === 'day') return d.getDate(); if (p === 'hour') return d.getHours(); if (p === 'minute') return d.getMinutes(); if (p === 'second') return d.getSeconds(); if (p === 'weekday') return d.getDay(); return null; },
  time_ago(d) { if (typeof d === 'number') d = new Date(d); const s = Math.floor((Date.now() - d.getTime()) / 1000); if (s < 60) return s + ' seconds ago'; const m = Math.floor(s / 60); if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago'); const h = Math.floor(m / 60); if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago'); const dy = Math.floor(h / 24); if (dy < 30) return dy + (dy === 1 ? ' day ago' : ' days ago'); const mo = Math.floor(dy / 30); if (mo < 12) return mo + (mo === 1 ? ' month ago' : ' months ago'); const yr = Math.floor(mo / 12); return yr + (yr === 1 ? ' year ago' : ' years ago'); }
});`,

  re: `const re = Object.freeze({
  test(s, pattern, flags) { return new RegExp(pattern, flags).test(s); },
  match(s, pattern, flags) { const m = s.match(new RegExp(pattern, flags)); if (!m) return Err('No match'); return Ok({ match: m[0], index: m.index, groups: m.slice(1) }); },
  find_all(s, pattern, flags) { const r = new RegExp(pattern, (flags || '') + (flags && flags.includes('g') ? '' : 'g')); const results = []; let m; while ((m = r.exec(s)) !== null) { results.push({ match: m[0], index: m.index, groups: m.slice(1) }); } return results; },
  replace(s, pattern, replacement, flags) { return s.replace(new RegExp(pattern, flags || 'g'), replacement); },
  split(s, pattern, flags) { return s.split(new RegExp(pattern, flags)); },
  capture(s, pattern, flags) { const m = s.match(new RegExp(pattern, flags)); if (!m) return Err('No match'); if (!m.groups) return Err('No named groups'); return Ok(m.groups); }
});`,

  json: `const json = Object.freeze({
  parse(s) { try { return Ok(JSON.parse(s)); } catch (e) { return Err(e.message); } },
  stringify(v) { return JSON.stringify(v); },
  pretty(v) { return JSON.stringify(v, null, 2); }
});`,

  fs: `const fs = Object.freeze({
  read_text(path, enc) { try { return Ok(require('fs').readFileSync(path, enc || 'utf-8')); } catch (e) { return Err(e.message); } },
  write_text(path, content, opts) { try { const f = require('fs'); if (opts && opts.append) f.appendFileSync(path, content); else f.writeFileSync(path, content); return Ok(path); } catch (e) { return Err(e.message); } },
  exists(path) { return require('fs').existsSync(path); },
  is_dir(path) { try { return require('fs').statSync(path).isDirectory(); } catch { return false; } },
  is_file(path) { try { return require('fs').statSync(path).isFile(); } catch { return false; } },
  ls(dir, opts) { const f = require('fs'); const p = require('path'); const d = dir || '.'; const entries = f.readdirSync(d); if (opts && opts.full) return entries.map(e => p.join(d, e)); return entries; },
  mkdir(dir) { try { require('fs').mkdirSync(dir, { recursive: true }); return Ok(dir); } catch (e) { return Err(e.message); } },
  rm(path, opts) { try { require('fs').rmSync(path, { recursive: !!(opts && opts.recursive), force: !!(opts && opts.force) }); return Ok(path); } catch (e) { return Err(e.message); } },
  cp(src, dest, opts) { try { const f = require('fs'); if (opts && opts.recursive) { f.cpSync(src, dest, { recursive: true }); } else { f.copyFileSync(src, dest); } return Ok(dest); } catch (e) { return Err(e.message); } },
  mv(src, dest) { try { require('fs').renameSync(src, dest); return Ok(dest); } catch (e) { return Err(e.message); } },
  glob_files(pattern, opts) { if (typeof Bun !== 'undefined' && Bun.Glob) { const glob = new Bun.Glob(pattern); return [...glob.scanSync(opts && opts.cwd || '.')]; } const f = require('fs'); if (f.globSync) return f.globSync(pattern, opts); return []; }
});`,

  url: `const url = Object.freeze({
  parse(s) { try { const u = new URL(s); return Ok({ protocol: u.protocol.replace(':', ''), host: u.host, pathname: u.pathname, search: u.search, hash: u.hash }); } catch (e) { return Err('Invalid URL: ' + s); } },
  build(parts) { let u = (parts.protocol || 'https') + '://' + (parts.host || ''); u += parts.pathname || '/'; if (parts.search) u += (parts.search.startsWith('?') ? '' : '?') + parts.search; if (parts.hash) u += (parts.hash.startsWith('#') ? '' : '#') + parts.hash; return u; },
  parse_query(s) { const r = {}; const qs = s.startsWith('?') ? s.slice(1) : s; if (!qs) return r; for (const pair of qs.split('&')) { const [k, ...v] = pair.split('='); r[decodeURIComponent(k)] = decodeURIComponent(v.join('=')); } return r; },
  build_query(obj) { return Object.entries(obj).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&'); }
});`,

  // ── Channel-based async ───────────────────────────────
  Channel: `class Channel {
  constructor(capacity) {
    this._capacity = capacity || 0;
    this._buffer = [];
    this._closed = false;
    this._sendWaiters = [];
    this._recvWaiters = [];
  }
  async send(value) {
    if (this._closed) throw new Error('Cannot send on closed channel');
    if (this._recvWaiters.length > 0) {
      const waiter = this._recvWaiters.shift();
      waiter(Some(value));
      return;
    }
    if (this._capacity > 0 && this._buffer.length < this._capacity) {
      this._buffer.push(value);
      return;
    }
    return new Promise(function(resolve) {
      this._sendWaiters.push({ value: value, resolve: resolve });
    }.bind(this));
  }
  async receive() {
    if (this._buffer.length > 0) {
      const value = this._buffer.shift();
      if (this._sendWaiters.length > 0) {
        const waiter = this._sendWaiters.shift();
        this._buffer.push(waiter.value);
        waiter.resolve();
      }
      return Some(value);
    }
    if (this._closed) return None;
    if (this._sendWaiters.length > 0) {
      const waiter = this._sendWaiters.shift();
      waiter.resolve();
      return Some(waiter.value);
    }
    return new Promise(function(resolve) {
      this._recvWaiters.push(resolve);
    }.bind(this));
  }
  _tryReceive() {
    if (this._buffer.length > 0) {
      const value = this._buffer.shift();
      if (this._sendWaiters.length > 0) {
        const waiter = this._sendWaiters.shift();
        this._buffer.push(waiter.value);
        waiter.resolve();
      }
      return Some(value);
    }
    if (this._sendWaiters.length > 0) {
      const waiter = this._sendWaiters.shift();
      waiter.resolve();
      return Some(waiter.value);
    }
    return None;
  }
  _trySend(value) {
    if (this._recvWaiters.length > 0) {
      const waiter = this._recvWaiters.shift();
      waiter(Some(value));
      return true;
    }
    if (this._capacity > 0 && this._buffer.length < this._capacity) {
      this._buffer.push(value);
      return true;
    }
    return false;
  }
  close() {
    this._closed = true;
    for (const waiter of this._recvWaiters) waiter(None);
    this._recvWaiters = [];
  }
  [Symbol.asyncIterator]() {
    const ch = this;
    return {
      async next() {
        const val = await ch.receive();
        if (val.__tag === 'None') return { done: true, value: undefined };
        return { done: false, value: val.value };
      }
    };
  }
}`,

  // ── Snapshot testing ──────────────────────────────────
  assert_snapshot: `function assert_snapshot(value, name) {
  const snap = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const updateMode = typeof process !== 'undefined' && process.env.TOVA_UPDATE_SNAPSHOTS === '1';
  if (typeof __tova_snapshots === 'undefined') { globalThis.__tova_snapshots = {}; }
  const key = name || ('snapshot_' + Object.keys(__tova_snapshots).length);
  if (updateMode || !__tova_snapshots[key]) {
    __tova_snapshots[key] = snap;
    return;
  }
  if (__tova_snapshots[key] !== snap) {
    throw new Error('Snapshot mismatch for "' + key + '":\\nExpected:\\n' + __tova_snapshots[key] + '\\nActual:\\n' + snap);
  }
}`,

  // ── Property-based testing ────────────────────────────
  Gen: `const Gen = {
  int: function(min, max) { return function() { const lo = min !== undefined ? min : -1000; const hi = max !== undefined ? max : 1000; return Math.floor(Math.random() * (hi - lo + 1)) + lo; }; },
  float: function(min, max) { return function() { const lo = min !== undefined ? min : -1000; const hi = max !== undefined ? max : 1000; return Math.random() * (hi - lo) + lo; }; },
  bool: function() { return function() { return Math.random() < 0.5; }; },
  string: function(maxLen) { return function() { const len = Math.floor(Math.random() * (maxLen || 20)); const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]; return s; }; },
  array: function(gen, maxLen) { return function() { const len = Math.floor(Math.random() * (maxLen || 10)); const arr = []; for (let i = 0; i < len; i++) arr.push(gen()); return arr; }; },
  oneOf: function(values) { return function() { return values[Math.floor(Math.random() * values.length)]; }; }
};`,
  forAll: `function forAll(generators, property, opts) {
  const runs = (opts && opts.runs) || 100;
  for (let i = 0; i < runs; i++) {
    const args = generators.map(function(g) { return g(); });
    let result;
    try { result = property.apply(null, args); } catch (e) { throw new Error('Property failed on input ' + JSON.stringify(args) + ': ' + e.message); }
    if (result === false) { throw new Error('Property failed on input: ' + JSON.stringify(args)); }
  }
}`,

  // ── Mock / Spy Utilities ────────────────────────────────
  create_spy: `function create_spy(impl) {
  const spy = function(...args) {
    spy.calls.push(args);
    spy.call_count++;
    spy.called = true;
    spy.last_args = args;
    if (spy._impl) return spy._impl(...args);
    return spy._return_value;
  };
  spy.calls = [];
  spy.call_count = 0;
  spy.called = false;
  spy.last_args = null;
  spy._impl = impl || null;
  spy._return_value = undefined;
  spy.returns = function(val) { spy._return_value = val; spy._impl = null; return spy; };
  spy.reset = function() { spy.calls = []; spy.call_count = 0; spy.called = false; spy.last_args = null; };
  spy.called_with = function(...expected) {
    return spy.calls.some(function(call) {
      return expected.length === call.length && expected.every(function(v, i) { return v === call[i]; });
    });
  };
  return spy;
}`,
  create_mock: `function create_mock(return_value) {
  return create_spy(typeof return_value === 'function' ? return_value : function() { return return_value; });
}`,

  // ── Advanced Collections ────────────────────────────────
  OrderedDict: `class OrderedDict {
  constructor(entries) { this._map = new Map(entries || []); }
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
}`,

  DefaultDict: `class DefaultDict {
  constructor(defaultFn) { this._map = new Map(); this._default = defaultFn; }
  get(key) { if (!this._map.has(key)) { this._map.set(key, this._default()); } return this._map.get(key); }
  set(key, value) { this._map.set(key, value); return this; }
  has(key) { return this._map.has(key); }
  delete(key) { this._map.delete(key); return this; }
  keys() { return [...this._map.keys()]; }
  values() { return [...this._map.values()]; }
  entries() { return [...this._map.entries()]; }
  get length() { return this._map.size; }
  [Symbol.iterator]() { return this._map[Symbol.iterator](); }
  toString() { return 'DefaultDict(' + this._map.size + ' entries)'; }
}`,

  Counter: `class Counter {
  constructor(items) { this._counts = new Map(); if (items) { for (const item of items) { this._counts.set(item, (this._counts.get(item) || 0) + 1); } } }
  count(item) { return this._counts.get(item) || 0; }
  total() { let s = 0; for (const v of this._counts.values()) s += v; return s; }
  most_common(n) { const sorted = [...this._counts.entries()].sort((a, b) => b[1] - a[1]); return n !== undefined ? sorted.slice(0, n) : sorted; }
  keys() { return [...this._counts.keys()]; }
  values() { return [...this._counts.values()]; }
  entries() { return [...this._counts.entries()]; }
  has(item) { return this._counts.has(item); }
  get length() { return this._counts.size; }
  [Symbol.iterator]() { return this._counts[Symbol.iterator](); }
  toString() { return 'Counter(' + this._counts.size + ' items)'; }
}`,

  Deque: `class Deque {
  constructor(items) { this._items = items ? [...items] : []; }
  push_back(val) { return new Deque([...this._items, val]); }
  push_front(val) { return new Deque([val, ...this._items]); }
  pop_back() { if (this._items.length === 0) return [null, this]; return [this._items[this._items.length - 1], new Deque(this._items.slice(0, -1))]; }
  pop_front() { if (this._items.length === 0) return [null, this]; return [this._items[0], new Deque(this._items.slice(1))]; }
  peek_front() { return this._items.length > 0 ? this._items[0] : null; }
  peek_back() { return this._items.length > 0 ? this._items[this._items.length - 1] : null; }
  get length() { return this._items.length; }
  toArray() { return [...this._items]; }
  [Symbol.iterator]() { return this._items[Symbol.iterator](); }
  toString() { return 'Deque(' + this._items.length + ' items)'; }
}`,

  collections: `const collections = Object.freeze({
  OrderedDict, DefaultDict, Counter, Deque
});`,

  // ─── Typed numeric array functions for @fast mode ───────────────

  typed_zeros: `function typed_zeros(n, Type) {
  return new (Type || Float64Array)(n);
}`,

  typed_ones: `function typed_ones(n, Type) {
  const out = new (Type || Float64Array)(n);
  out.fill(1);
  return out;
}`,

  typed_fill: `function typed_fill(arr, value) {
  const out = new arr.constructor(arr.length);
  out.fill(value);
  return out;
}`,

  typed_range: `function typed_range(start, end, step) {
  step = step || 1;
  const n = Math.ceil((end - start) / step);
  const arr = new Float64Array(n);
  for (let i = 0; i < n; i++) arr[i] = start + i * step;
  return arr;
}`,

  typed_linspace: `function typed_linspace(start, end, n) {
  const out = new Float64Array(n);
  if (n <= 1) { if (n === 1) out[0] = start; return out; }
  const step = (end - start) / (n - 1);
  for (let i = 0; i < n; i++) out[i] = start + i * step;
  return out;
}`,

  typed_sum: `function typed_sum(arr) {
  let s = 0, c = 0;
  for (let i = 0; i < arr.length; i++) {
    const y = arr[i] - c;
    const t = s + y;
    c = (t - s) - y;
    s = t;
  }
  return s;
}`,

  typed_dot: `function typed_dot(a, b) {
  const n = a.length;
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}`,

  typed_norm: `function typed_norm(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i];
  return Math.sqrt(s);
}`,

  typed_add: `function typed_add(a, b) {
  const n = a.length;
  const out = new a.constructor(n);
  for (let i = 0; i < n; i++) out[i] = a[i] + b[i];
  return out;
}`,

  typed_scale: `function typed_scale(arr, scalar) {
  const out = new arr.constructor(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] * scalar;
  return out;
}`,

  typed_map: `function typed_map(arr, fn) {
  const out = new arr.constructor(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = fn(arr[i], i);
  return out;
}`,

  typed_reduce: `function typed_reduce(arr, fn, init) {
  let acc = init;
  for (let i = 0; i < arr.length; i++) acc = fn(acc, arr[i], i);
  return acc;
}`,

  typed_sort: `function typed_sort(arr) {
  if (arr instanceof Float64Array || arr instanceof Int32Array || arr instanceof Uint8Array ||
      arr instanceof Float32Array || arr instanceof Int16Array || arr instanceof Uint16Array ||
      arr instanceof Uint32Array || arr instanceof Int8Array) {
    const out = new arr.constructor(arr);
    out.sort();
    return out;
  }
  const out = [...arr];
  out.sort((a, b) => a - b);
  return out;
}`,
};

// All known builtin names for matching
export const BUILTIN_NAMES = new Set(Object.keys(BUILTIN_FUNCTIONS));

// ─── Stdlib Dependency Graph ──────────────────────────────────
// Maps each builtin to the builtins it depends on (must be emitted first).
// This replaces scattered ad-hoc dependency checks throughout the codebase.
export const STDLIB_DEPS = {
  // iter() requires the Seq class
  iter: ['Seq'],
  // collections namespace requires all collection classes
  collections: ['OrderedDict', 'DefaultDict', 'Counter', 'Deque'],
  // Table operations may use Table
  describe: ['Table'],
  // Some builtins reference Result/Option types (Ok, Err, Some, None)
  // These are provided by RESULT_OPTION, not the builtin map, so no dep here
  // Namespace modules that use builtins internally
  json: ['Ok', 'Err'],
  re: ['Ok', 'Err'],
  dt: ['Ok', 'Err'],
  fs: ['Ok', 'Err'],
  url: ['Ok', 'Err'],
  parse_url: ['Ok', 'Err'],
  regex_test: ['__regex_cache'],
  regex_match: ['Ok', 'Err', '__regex_cache'],
  regex_find_all: ['__regex_cache'],
  regex_replace: ['__regex_cache'],
  regex_split: ['__regex_cache'],
  regex_capture: ['Ok', 'Err', '__regex_cache'],
  json_parse: ['Ok', 'Err'],
  date_parse: ['Ok', 'Err'],
  read_text: ['Ok', 'Err'],
  try_fn: ['Ok', 'Err'],
  try_async: ['Ok', 'Err'],
  // LazyTable requires Table and table_* functions
  lazy: ['LazyTable', 'Table'],
  collect: ['LazyTable'],
  LazyTable: ['Table', 'table_where', 'table_group_by'],
  // Seq uses Some/None
  Seq: ['Some', 'None'],
  // compare family
  compare: ['Less', 'Equal', 'Greater'],
  compare_by: ['Less', 'Equal', 'Greater'],
  // mock/spy
  create_mock: ['create_spy'],
  // color shortcuts depend on color()
  green: ['color'],
  red: ['color'],
  yellow: ['color'],
  blue: ['color'],
  cyan: ['color'],
  magenta: ['color'],
  gray: ['color'],
};

// Resolve all transitive dependencies for a set of used names
export function resolveStdlibDeps(usedNames) {
  const resolved = new Set(usedNames);
  const queue = [...usedNames];
  while (queue.length > 0) {
    const name = queue.pop();
    const deps = STDLIB_DEPS[name];
    if (deps) {
      for (const dep of deps) {
        if (!resolved.has(dep)) {
          resolved.add(dep);
          queue.push(dep);
        }
      }
    }
  }
  return resolved;
}

// Topological sort: emit dependencies before dependents
function _topoSort(names) {
  const result = [];
  const visited = new Set();
  const visiting = new Set();

  function visit(name) {
    if (visited.has(name)) return;
    if (visiting.has(name)) return; // circular — break
    visiting.add(name);
    const deps = STDLIB_DEPS[name];
    if (deps) {
      for (const dep of deps) {
        if (names.has(dep)) visit(dep);
      }
    }
    visiting.delete(name);
    visited.add(name);
    result.push(name);
  }

  for (const name of names) visit(name);
  return result;
}

// Legacy compat: full stdlib as a single string (derived from BUILTIN_FUNCTIONS)
// Only includes non-internal, non-table functions for backward compat with tests/playground
const _LEGACY_NAMES = [
  'print', 'len', 'range', 'enumerate', 'sum', 'sorted', 'reversed', 'zip',
  'min', 'max', 'type_of', 'filter', 'map', 'find', 'any', 'all', 'flat_map',
  'reduce', 'unique', 'group_by', 'chunk', 'flatten', 'take', 'drop', 'first',
  'last', 'count', 'partition', 'abs', 'floor', 'ceil', 'round', 'clamp',
  'sqrt', 'pow', 'random', 'trim', 'split', 'join', 'replace', 'repeat',
  'keys', 'values', 'entries', 'merge', 'freeze', 'clone', 'sleep',
  'upper', 'lower', 'contains', 'starts_with', 'ends_with', 'chars', 'words',
  'lines', 'capitalize', 'title_case', 'snake_case', 'camel_case',
  'assert_eq', 'assert_ne', 'assert', 'assert_throws',
  'create_spy', 'create_mock',
  'parallel_map',
];
export const BUILTINS = _LEGACY_NAMES.map(n => BUILTIN_FUNCTIONS[n]).join('\n');

// Build stdlib containing only the functions that are actually used
export function buildSelectiveStdlib(usedNames) {
  // Resolve transitive dependencies and topologically sort
  const withDeps = resolveStdlibDeps(usedNames);
  const ordered = _topoSort(withDeps);
  const parts = [];
  for (const name of ordered) {
    if (BUILTIN_FUNCTIONS[name]) {
      parts.push(BUILTIN_FUNCTIONS[name]);
    }
  }
  return parts.join('\n');
}

// Native FFI bridge initialization (server-side only, Bun runtime)
// Lazily loads the Rust native library for high-performance stdlib operations
// Async version for tova run (AsyncFunction context supports await)
export const NATIVE_INIT = `var __tova_native = null;
try {
  if (typeof Bun !== 'undefined') {
    const { dlopen: __dl, FFIType: __F } = await import('bun:ffi');
    const __path = await import('path');
    const __fs = await import('fs');
    const __searchDirs = [
      __path.join(__path.dirname(typeof __tova_filename !== 'undefined' ? __tova_filename : ''), 'native', 'target', 'release'),
      __path.join(process.cwd(), 'native', 'target', 'release'),
      __path.join(process.env.HOME || '', '.tova', 'lib'),
    ];
    const __libName = process.platform === 'darwin' ? 'libtova_native.dylib' : process.platform === 'win32' ? 'tova_native.dll' : 'libtova_native.so';
    for (const __d of __searchDirs) {
      const __p = __path.join(__d, __libName);
      if (__fs.existsSync(__p)) {
        const __lib = __dl(__p, {
          tova_sort_f64: { args: [__F.ptr, __F.u64], returns: __F.void },
          tova_sort_i64: { args: [__F.ptr, __F.u64], returns: __F.void },
          tova_sum_f64: { args: [__F.ptr, __F.u64], returns: __F.f64 },
          tova_min_f64: { args: [__F.ptr, __F.u64], returns: __F.f64 },
          tova_max_f64: { args: [__F.ptr, __F.u64], returns: __F.f64 },
        });
        __tova_native = __lib.symbols;
        break;
      }
    }
  }
} catch (__e) {}`;

// Sync-safe version without await (for non-async contexts like tests, REPL eval)
export const NATIVE_INIT_SYNC = `var __tova_native = null;`;

// Full stdlib for runtime (REPL, run command) — sync-safe (no await)
export function getFullStdlib() {
  return `${NATIVE_INIT_SYNC}\n${buildSelectiveStdlib(BUILTIN_NAMES)}\n${RESULT_OPTION}\n${PROPAGATE}`;
}

// Stdlib for browser codegen (includes builtins + result/option + propagate)
export function getBrowserStdlib() {
  return `${buildSelectiveStdlib(BUILTIN_NAMES)}\n${RESULT_OPTION}\n${PROPAGATE}`;
}
