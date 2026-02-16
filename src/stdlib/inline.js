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
  union: `function union(a, b) { if (a && a._rows) return table_union(a, b); return [...new Set([...a, ...b])]; }`,
  drop_duplicates: `function drop_duplicates(table, opts) { return table_drop_duplicates(table, opts); }`,
  rename: `function rename(table, oldName, newName) { return table_rename(table, oldName, newName); }`,
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

  // ── Regex ──────────────────────────────────────────────
  regex_test: `function regex_test(s, pattern, flags) { return new RegExp(pattern, flags).test(s); }`,
  regex_match: `function regex_match(s, pattern, flags) { const m = s.match(new RegExp(pattern, flags)); if (!m) return Err('No match'); return Ok({ match: m[0], index: m.index, groups: m.slice(1) }); }`,
  regex_find_all: `function regex_find_all(s, pattern, flags) { const re = new RegExp(pattern, (flags || '') + (flags && flags.includes('g') ? '' : 'g')); const results = []; let m; while ((m = re.exec(s)) !== null) { results.push({ match: m[0], index: m.index, groups: m.slice(1) }); } return results; }`,
  regex_replace: `function regex_replace(s, pattern, replacement, flags) { return s.replace(new RegExp(pattern, flags || 'g'), replacement); }`,
  regex_split: `function regex_split(s, pattern, flags) { return s.split(new RegExp(pattern, flags)); }`,
  regex_capture: `function regex_capture(s, pattern, flags) { const m = s.match(new RegExp(pattern, flags)); if (!m) return Err('No match'); if (!m.groups) return Err('No named groups'); return Ok(m.groups); }`,

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
