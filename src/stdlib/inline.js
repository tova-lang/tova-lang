// Tova standard library — inline string versions for codegen
// Single source of truth for all inline stdlib code used in code generation.
// Used by: base-codegen.js, client-codegen.js, bin/tova.js

export const RESULT_OPTION = `function Ok(value) { return Object.freeze({ __tag: "Ok", value, map(fn) { return Ok(fn(value)); }, flatMap(fn) { const r = fn(value); if (r && r.__tag) return r; throw new Error("flatMap callback must return Ok/Err"); }, unwrap() { return value; }, unwrapOr(_) { return value; }, expect(_) { return value; }, isOk() { return true; }, isErr() { return false; }, mapErr(_) { return this; }, unwrapErr() { throw new Error("Called unwrapErr on Ok"); }, or(_) { return this; }, and(other) { return other; } }); }
function Err(error) { return Object.freeze({ __tag: "Err", error, map(_) { return this; }, flatMap(_) { return this; }, unwrap() { throw new Error("Called unwrap on Err: " + (typeof error === "object" ? JSON.stringify(error) : error)); }, unwrapOr(def) { return def; }, expect(msg) { throw new Error(msg); }, isOk() { return false; }, isErr() { return true; }, mapErr(fn) { return Err(fn(error)); }, unwrapErr() { return error; }, or(other) { return other; }, and(_) { return this; } }); }
function Some(value) { return Object.freeze({ __tag: "Some", value, map(fn) { return Some(fn(value)); }, flatMap(fn) { const r = fn(value); if (r && r.__tag) return r; throw new Error("flatMap callback must return Some/None"); }, unwrap() { return value; }, unwrapOr(_) { return value; }, expect(_) { return value; }, isSome() { return true; }, isNone() { return false; }, or(_) { return this; }, and(other) { return other; }, filter(pred) { return pred(value) ? this : None; } }); }
const None = Object.freeze({ __tag: "None", map(_) { return None; }, flatMap(_) { return None; }, unwrap() { throw new Error("Called unwrap on None"); }, unwrapOr(def) { return def; }, expect(msg) { throw new Error(msg); }, isSome() { return false; }, isNone() { return true; }, or(other) { return other; }, and(_) { return None; }, filter(_) { return None; } });`;

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

  // ── Aggregation helpers ─────────────────────────────
  agg_sum: `function agg_sum(fn) { return (rows) => rows.reduce((a, r) => a + (typeof fn === 'function' ? fn(r) : r[fn]), 0); }`,
  agg_count: `function agg_count(fn) { if (!fn) return (rows) => rows.length; return (rows) => rows.filter(fn).length; }`,
  agg_mean: `function agg_mean(fn) { return (rows) => { if (rows.length === 0) return 0; return rows.reduce((a, r) => a + (typeof fn === 'function' ? fn(r) : r[fn]), 0) / rows.length; }; }`,
  agg_median: `function agg_median(fn) { return (rows) => { if (rows.length === 0) return 0; const vs = rows.map(r => typeof fn === 'function' ? fn(r) : r[fn]).sort((a, b) => a - b); const m = Math.floor(vs.length / 2); return vs.length % 2 !== 0 ? vs[m] : (vs[m - 1] + vs[m]) / 2; }; }`,
  agg_min: `function agg_min(fn) { return (rows) => rows.length === 0 ? null : Math.min(...rows.map(r => typeof fn === 'function' ? fn(r) : r[fn])); }`,
  agg_max: `function agg_max(fn) { return (rows) => rows.length === 0 ? null : Math.max(...rows.map(r => typeof fn === 'function' ? fn(r) : r[fn])); }`,

  // ── Data exploration ────────────────────────────────
  peek: `function peek(table, opts) { const o = typeof opts === 'object' ? opts : {}; console.log(table._format ? table._format(o.n || 10, o.title) : String(table)); return table; }`,
  describe: `function describe(table) { const stats = []; for (const col of table._columns) { const vals = table._rows.map(r => r[col]).filter(v => v != null); const st = { Column: col, Type: 'Unknown', 'Non-Null': vals.length }; if (vals.length > 0) { const s = vals[0]; if (typeof s === 'number') { st.Type = Number.isInteger(s) ? 'Int' : 'Float'; st.Mean = vals.reduce((a, b) => a + b, 0) / vals.length; st.Min = Math.min(...vals); st.Max = Math.max(...vals); } else if (typeof s === 'string') { st.Type = 'String'; st.Unique = new Set(vals).size; } else if (typeof s === 'boolean') { st.Type = 'Bool'; } } stats.push(st); } const dt = Table(stats); console.log(dt._format(100, 'describe()')); return dt; }`,
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
  let headers, ds; if (hasHeader) { headers = parseLine(lines[0]); ds = 1; } else { const fr = parseLine(lines[0]); headers = fr.map((_, i) => 'col_' + i); ds = 0; }
  const rows = []; for (let i = ds; i < lines.length; i++) { const f = parseLine(lines[i]); const row = {}; for (let j = 0; j < headers.length; j++) { let v = f[j] ?? null; if (v !== null && v !== '') { if (/^-?\\d+$/.test(v)) v = parseInt(v, 10); else if (/^-?\\d*\\.\\d+$/.test(v)) v = parseFloat(v); else if (v === 'true') v = true; else if (v === 'false') v = false; else if (v === 'null' || v === 'nil') v = null; } else if (v === '') v = null; row[headers[j]] = v; } rows.push(row); }
  return Table(rows, headers);
}`,
  __parseJSONL: `function __parseJSONL(text) { return Table(text.split('\\n').filter(l => l.trim()).map(l => JSON.parse(l))); }`,

  // ── Table operation aliases (short names for pipe-friendly use) ──
  where: `function where(tableOrArr, pred) { if (tableOrArr && tableOrArr._rows) return table_where(tableOrArr, pred); return tableOrArr.filter(pred); }`,
  select: `function select(table, ...args) { return table_select(table, ...args); }`,
  derive: `function derive(table, derivations) { return table_derive(table, derivations); }`,
  agg: `function agg(grouped, aggregations) { return table_agg(grouped, aggregations); }`,
  sort_by: `function sort_by(table, keyFn, opts) { return table_sort_by(table, keyFn, opts); }`,
  limit: `function limit(table, n) { return table_limit(table, n); }`,
  pivot: `function pivot(table, opts) { return table_pivot(table, opts); }`,
  unpivot: `function unpivot(table, opts) { return table_unpivot(table, opts); }`,
  explode: `function explode(table, colFn) { return table_explode(table, colFn); }`,
  union: `function union(table, other) { return table_union(table, other); }`,
  drop_duplicates: `function drop_duplicates(table, opts) { return table_drop_duplicates(table, opts); }`,
  rename: `function rename(table, oldName, newName) { return table_rename(table, oldName, newName); }`,
  mean: `function mean(fn) { return agg_mean(fn); }`,
  median: `function median(fn) { return agg_median(fn); }`,
};

// All known builtin names for matching
export const BUILTIN_NAMES = new Set(Object.keys(BUILTIN_FUNCTIONS));

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
  'assert_eq', 'assert_ne', 'assert',
];
export const BUILTINS = _LEGACY_NAMES.map(n => BUILTIN_FUNCTIONS[n]).join('\n');

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
  return `${buildSelectiveStdlib(BUILTIN_NAMES)}\n${RESULT_OPTION}\n${PROPAGATE}`;
}

// Stdlib for client codegen (includes builtins + result/option + propagate)
export function getClientStdlib() {
  return `${buildSelectiveStdlib(BUILTIN_NAMES)}\n${RESULT_OPTION}\n${PROPAGATE}`;
}
