// Table<T> — First-class tabular data runtime for Tova
// Thin wrapper around arrays of objects (row-based storage).
// All operations return new Tables (immutable).

export class Table {
  constructor(rows = [], columns = null) {
    this._rows = Array.isArray(rows) ? rows : [];
    this._columns = columns || (this._rows.length > 0 ? Object.keys(this._rows[0]) : []);
  }

  // ── Properties ──────────────────────────────────────
  get rows() { return this._rows.length; }
  get columns() { return [...this._columns]; }
  get shape() { return [this._rows.length, this._columns.length]; }
  get length() { return this._rows.length; }

  // ── Iteration ───────────────────────────────────────
  [Symbol.iterator]() {
    return this._rows[Symbol.iterator]();
  }

  // ── Access ──────────────────────────────────────────
  // table[0] → row struct, table[.name] → column array (via getColumn)
  at(index) {
    if (index < 0) index = this._rows.length + index;
    return this._rows[index] ?? null;
  }

  // Slice: table[10:20] → Table
  slice(start, end) {
    return new Table(this._rows.slice(start, end), this._columns);
  }

  // Get column as array
  getColumn(name) {
    return this._rows.map(r => r[name]);
  }

  // ── Core Operations ─────────────────────────────────

  toArray() {
    return [...this._rows];
  }

  toJSON() {
    return this._rows;
  }

  toString() {
    if (this._rows.length === 0) return 'Table(0 rows, 0 columns)';
    return `Table(${this._rows.length} rows, ${this._columns.length} columns)`;
  }

  // For printing/debugging — format as aligned table
  _format(maxRows = 10, title = null) {
    const lines = [];
    if (title) lines.push(`── ${title} ──`);

    const cols = this._columns;
    const displayRows = this._rows.slice(0, maxRows);

    if (cols.length === 0 || displayRows.length === 0) {
      lines.push('(empty table)');
      lines.push(`${this._rows.length} rows × ${cols.length} columns`);
      return lines.join('\n');
    }

    // Calculate column widths
    const widths = {};
    for (const col of cols) {
      widths[col] = col.length;
      for (const row of displayRows) {
        const val = row[col];
        const str = val === null || val === undefined ? 'nil' : String(val);
        widths[col] = Math.max(widths[col], str.length);
      }
      widths[col] = Math.min(widths[col], 30); // cap width
    }

    // Header
    const header = cols.map(c => c.padEnd(widths[c])).join(' │ ');
    const separator = cols.map(c => '─'.repeat(widths[c])).join('─┼─');
    lines.push(header);
    lines.push(separator);

    // Rows
    for (const row of displayRows) {
      const cells = cols.map(c => {
        const val = row[c];
        const str = val === null || val === undefined ? 'nil' : String(val);
        return str.slice(0, 30).padEnd(widths[c]);
      });
      lines.push(cells.join(' │ '));
    }

    if (this._rows.length > maxRows) {
      lines.push(`... ${this._rows.length - maxRows} more rows`);
    }
    lines.push(`${this._rows.length} rows × ${cols.length} columns`);

    return lines.join('\n');
  }
}

// ── Table Operation Functions ──────────────────────────
// All functions are standalone and pipe-friendly: table |> where(predicate)

export function table_where(table, predicate) {
  const rows = table._rows.filter(predicate);
  return new Table(rows, table._columns);
}

export function table_select(table, ...args) {
  // args can be column name strings or exclude descriptors { __exclude: "name" }
  let cols;
  if (args.length === 1 && args[0] && args[0].__exclude) {
    const excludeSet = new Set(Array.isArray(args[0].__exclude) ? args[0].__exclude : [args[0].__exclude]);
    cols = table._columns.filter(c => !excludeSet.has(c));
  } else if (args.every(a => typeof a === 'string')) {
    cols = args;
  } else {
    // Mix of includes and excludes
    const excludes = new Set();
    const includes = [];
    for (const a of args) {
      if (a && a.__exclude) {
        const e = Array.isArray(a.__exclude) ? a.__exclude : [a.__exclude];
        e.forEach(x => excludes.add(x));
      } else if (typeof a === 'string') {
        includes.push(a);
      }
    }
    cols = includes.length > 0
      ? includes.filter(c => !excludes.has(c))
      : table._columns.filter(c => !excludes.has(c));
  }

  const rows = table._rows.map(r => {
    const row = {};
    for (const c of cols) row[c] = r[c];
    return row;
  });
  return new Table(rows, cols);
}

export function table_derive(table, derivations) {
  // derivations is an object: { colName: (row) => value, ... }
  const newCols = [...table._columns];
  for (const key of Object.keys(derivations)) {
    if (!newCols.includes(key)) newCols.push(key);
  }

  const rows = table._rows.map(r => {
    const row = { ...r };
    for (const [key, fn] of Object.entries(derivations)) {
      row[key] = typeof fn === 'function' ? fn(r) : fn;
    }
    return row;
  });
  return new Table(rows, newCols);
}

export function table_group_by(table, keyFn) {
  const groups = new Map();
  for (const row of table._rows) {
    const key = typeof keyFn === 'function' ? keyFn(row) : row[keyFn];
    const keyStr = String(key);
    if (!groups.has(keyStr)) groups.set(keyStr, { key, rows: [] });
    groups.get(keyStr).rows.push(row);
  }
  // Return a GroupedTable-like structure that agg can consume
  return { __grouped: true, groups, columns: table._columns };
}

export function table_agg(grouped, aggregations) {
  if (!grouped || !grouped.__grouped) {
    throw new Error('agg() must be called after group_by()');
  }

  const rows = [];
  const groupKeyCol = grouped.columns[0]; // first column used in group_by typically

  for (const [, { key, rows: groupRows }] of grouped.groups) {
    const row = {};
    // Determine group key column name — we use the key value
    // If key is an object, spread it; if primitive, use generic 'group' key
    if (typeof key === 'object' && key !== null) {
      Object.assign(row, key);
    } else {
      row._group = key;
    }

    for (const [name, aggFn] of Object.entries(aggregations)) {
      row[name] = aggFn(groupRows);
    }
    rows.push(row);
  }

  const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
  return new Table(rows, cols);
}

export function table_sort_by(table, keyFn, opts = {}) {
  const desc = opts.desc || false;
  const rows = [...table._rows].sort((a, b) => {
    const ka = typeof keyFn === 'function' ? keyFn(a) : a[keyFn];
    const kb = typeof keyFn === 'function' ? keyFn(b) : b[keyFn];
    let cmp = 0;
    if (ka < kb) cmp = -1;
    else if (ka > kb) cmp = 1;
    return desc ? -cmp : cmp;
  });
  return new Table(rows, table._columns);
}

export function table_limit(table, n) {
  return new Table(table._rows.slice(0, n), table._columns);
}

export function table_join(table, other, opts = {}) {
  const { left, right, how } = opts;

  // Cross join
  if (how === 'cross') {
    const rows = [];
    const cc = [...new Set([...table._columns, ...other._columns])];
    for (const lr of table._rows) {
      for (const rr of other._rows) {
        rows.push({ ...lr, ...rr });
      }
    }
    return new Table(rows, cc);
  }

  if (!left || !right) throw new Error('join() requires left and right key functions');

  // Anti join
  if (how === 'anti') {
    const ri = new Set();
    for (const r of other._rows) {
      ri.add(String(typeof right === 'function' ? right(r) : r[right]));
    }
    const rows = [];
    for (const lr of table._rows) {
      const k = typeof left === 'function' ? left(lr) : lr[left];
      if (!ri.has(String(k))) rows.push({ ...lr });
    }
    return new Table(rows, [...table._columns]);
  }

  // Semi join
  if (how === 'semi') {
    const ri = new Set();
    for (const r of other._rows) {
      ri.add(String(typeof right === 'function' ? right(r) : r[right]));
    }
    const rows = [];
    for (const lr of table._rows) {
      const k = typeof left === 'function' ? left(lr) : lr[left];
      if (ri.has(String(k))) rows.push({ ...lr });
    }
    return new Table(rows, [...table._columns]);
  }

  // Right join — swap and do left join
  if (how === 'right') {
    const swapped = table_join(other, table, { left: right, right: left, how: 'left' });
    const cc = [...new Set([...table._columns, ...other._columns])];
    return new Table(swapped._rows, cc);
  }

  // Build hash index on right table
  const ri = new Map();
  for (const r of other._rows) {
    const k = typeof right === 'function' ? right(r) : r[right];
    const ks = String(k);
    if (!ri.has(ks)) ri.set(ks, []);
    ri.get(ks).push(r);
  }

  const cc = [...new Set([...table._columns, ...other._columns])];
  const rows = [];
  const matchedRightKeys = how === 'outer' ? new Set() : null;

  for (const lr of table._rows) {
    const k = typeof left === 'function' ? left(lr) : lr[left];
    const ms = ri.get(String(k)) || [];
    if (ms.length > 0) {
      for (const rr of ms) rows.push({ ...lr, ...rr });
      if (matchedRightKeys) matchedRightKeys.add(String(k));
    } else if (how === 'left' || how === 'outer') {
      const row = { ...lr };
      for (const c of other._columns) { if (!(c in row)) row[c] = null; }
      rows.push(row);
    }
  }

  // Full outer: add unmatched right rows
  if (how === 'outer') {
    for (const r of other._rows) {
      const k = typeof right === 'function' ? right(r) : r[right];
      if (!matchedRightKeys.has(String(k))) {
        const row = { ...r };
        for (const c of table._columns) { if (!(c in row)) row[c] = null; }
        rows.push(row);
      }
    }
  }

  return new Table(rows, cc);
}

export function table_pivot(table, opts = {}) {
  const { index, columns: colFn, values: valFn } = opts;
  if (!index || !colFn || !valFn) throw new Error('pivot() requires index, columns, and values');

  const pivotMap = new Map();
  const allPivotCols = new Set();

  for (const row of table._rows) {
    const idxKey = typeof index === 'function' ? index(row) : row[index];
    const col = typeof colFn === 'function' ? colFn(row) : row[colFn];
    const val = typeof valFn === 'function' ? valFn(row) : row[valFn];

    const keyStr = String(idxKey);
    if (!pivotMap.has(keyStr)) pivotMap.set(keyStr, { _index: idxKey });
    pivotMap.get(keyStr)[String(col)] = val;
    allPivotCols.add(String(col));
  }

  const rows = [...pivotMap.values()];
  const cols = ['_index', ...allPivotCols];
  return new Table(rows, cols);
}

export function table_unpivot(table, opts = {}) {
  const { id, columns: unpivotCols } = opts;
  if (!id || !unpivotCols) throw new Error('unpivot() requires id and columns');

  const colNames = unpivotCols.map(c => typeof c === 'function' ? null : c).filter(Boolean);
  const rows = [];

  for (const row of table._rows) {
    const idVal = typeof id === 'function' ? id(row) : row[id];
    for (const col of colNames) {
      rows.push({ id: idVal, variable: col, value: row[col] });
    }
  }

  return new Table(rows, ['id', 'variable', 'value']);
}

export function table_explode(table, colFn) {
  const rows = [];
  for (const row of table._rows) {
    const arr = typeof colFn === 'function' ? colFn(row) : row[colFn];
    if (Array.isArray(arr)) {
      for (const val of arr) {
        rows.push({ ...row });
        // Replace the exploded column with individual value
        const colName = typeof colFn === 'string' ? colFn : Object.keys(row).find(k => row[k] === arr);
        if (colName) rows[rows.length - 1][colName] = val;
      }
    } else {
      rows.push({ ...row });
    }
  }
  return new Table(rows, table._columns);
}

export function table_union(table, other) {
  const cols = [...new Set([...table._columns, ...other._columns])];
  const rows = [...table._rows, ...other._rows];
  return new Table(rows, cols);
}

export function table_drop_duplicates(table, opts = {}) {
  const { by } = opts;
  const seen = new Set();
  const rows = [];

  for (const row of table._rows) {
    const key = by ? (typeof by === 'function' ? String(by(row)) : String(row[by])) : JSON.stringify(row);
    if (!seen.has(key)) {
      seen.add(key);
      rows.push(row);
    }
  }

  return new Table(rows, table._columns);
}

export function table_rename(table, oldName, newName) {
  const cols = table._columns.map(c => c === oldName ? newName : c);
  const rows = table._rows.map(r => {
    const row = {};
    for (const c of table._columns) {
      row[c === oldName ? newName : c] = r[c];
    }
    return row;
  });
  return new Table(rows, cols);
}

// ── Aggregation helpers ───────────────────────────────

export function agg_sum(fn) {
  return (rows) => rows.reduce((acc, r) => acc + (typeof fn === 'function' ? fn(r) : r[fn]), 0);
}

export function agg_count(fn) {
  if (!fn) return (rows) => rows.length;
  return (rows) => rows.filter(fn).length;
}

export function agg_mean(fn) {
  return (rows) => {
    if (rows.length === 0) return 0;
    const total = rows.reduce((acc, r) => acc + (typeof fn === 'function' ? fn(r) : r[fn]), 0);
    return total / rows.length;
  };
}

export function agg_median(fn) {
  return (rows) => {
    if (rows.length === 0) return 0;
    const vals = rows.map(r => typeof fn === 'function' ? fn(r) : r[fn]).sort((a, b) => a - b);
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  };
}

export function agg_min(fn) {
  return (rows) => {
    if (rows.length === 0) return null;
    return Math.min(...rows.map(r => typeof fn === 'function' ? fn(r) : r[fn]));
  };
}

export function agg_max(fn) {
  return (rows) => {
    if (rows.length === 0) return null;
    return Math.max(...rows.map(r => typeof fn === 'function' ? fn(r) : r[fn]));
  };
}

// ── Window Functions ──────────────────────────────────
// window() computes values across partitions without collapsing rows.
// Each win_* factory returns (rows, index, ctx) => value

export function win_row_number() {
  return (_rows, index) => index + 1;
}

export function win_rank() {
  return (_rows, index, ctx) => {
    if (index === 0) return 1;
    const cur = ctx.orderValues[index];
    // Walk backwards to find first row with same value
    for (let i = index - 1; i >= 0; i--) {
      if (ctx.orderValues[i] !== cur) return i + 2;
    }
    return 1;
  };
}

export function win_dense_rank() {
  return (_rows, index, ctx) => {
    if (index === 0) return 1;
    let rank = 1;
    for (let i = 1; i <= index; i++) {
      if (ctx.orderValues[i] !== ctx.orderValues[i - 1]) rank++;
    }
    return rank;
  };
}

export function win_percent_rank() {
  return (rows, index, ctx) => {
    const n = ctx.partitionSize;
    if (n <= 1) return 0;
    const r = win_rank()(rows, index, ctx);
    return (r - 1) / (n - 1);
  };
}

export function win_ntile(buckets) {
  return (_rows, index, ctx) => {
    const n = ctx.partitionSize;
    return Math.floor(index * buckets / n) + 1;
  };
}

export function win_lag(colFn, offset = 1, defaultVal = null) {
  return (rows, index) => {
    const target = index - offset;
    if (target < 0 || target >= rows.length) return defaultVal;
    return typeof colFn === 'function' ? colFn(rows[target]) : rows[target][colFn];
  };
}

export function win_lead(colFn, offset = 1, defaultVal = null) {
  return (rows, index) => {
    const target = index + offset;
    if (target < 0 || target >= rows.length) return defaultVal;
    return typeof colFn === 'function' ? colFn(rows[target]) : rows[target][colFn];
  };
}

export function win_first_value(colFn) {
  return (rows) => {
    if (rows.length === 0) return null;
    return typeof colFn === 'function' ? colFn(rows[0]) : rows[0][colFn];
  };
}

export function win_last_value(colFn) {
  return (rows) => {
    if (rows.length === 0) return null;
    const last = rows[rows.length - 1];
    return typeof colFn === 'function' ? colFn(last) : last[colFn];
  };
}

export function win_running_sum(colFn) {
  return (rows, index) => {
    let sum = 0;
    for (let i = 0; i <= index; i++) {
      sum += typeof colFn === 'function' ? colFn(rows[i]) : rows[i][colFn];
    }
    return sum;
  };
}

export function win_running_count() {
  return (_rows, index) => index + 1;
}

export function win_running_avg(colFn) {
  return (rows, index) => {
    let sum = 0;
    for (let i = 0; i <= index; i++) {
      sum += typeof colFn === 'function' ? colFn(rows[i]) : rows[i][colFn];
    }
    return sum / (index + 1);
  };
}

export function win_running_min(colFn) {
  return (rows, index) => {
    let m = typeof colFn === 'function' ? colFn(rows[0]) : rows[0][colFn];
    for (let i = 1; i <= index; i++) {
      const v = typeof colFn === 'function' ? colFn(rows[i]) : rows[i][colFn];
      if (v < m) m = v;
    }
    return m;
  };
}

export function win_running_max(colFn) {
  return (rows, index) => {
    let m = typeof colFn === 'function' ? colFn(rows[0]) : rows[0][colFn];
    for (let i = 1; i <= index; i++) {
      const v = typeof colFn === 'function' ? colFn(rows[i]) : rows[i][colFn];
      if (v > m) m = v;
    }
    return m;
  };
}

export function win_moving_avg(colFn, windowSize) {
  return (rows, index) => {
    const start = Math.max(0, index - windowSize + 1);
    let sum = 0;
    for (let i = start; i <= index; i++) {
      sum += typeof colFn === 'function' ? colFn(rows[i]) : rows[i][colFn];
    }
    return sum / (index - start + 1);
  };
}

export function table_window(table, opts, windowFns) {
  const partitionFn = opts.partition || null;
  const orderFn = opts.order || null;
  const desc = opts.desc || false;

  // Group rows into partitions
  const partitions = new Map();
  const rowOriginalIndices = [];
  for (let i = 0; i < table._rows.length; i++) {
    const row = table._rows[i];
    const key = partitionFn ? String(typeof partitionFn === 'function' ? partitionFn(row) : row[partitionFn]) : '__all__';
    if (!partitions.has(key)) partitions.set(key, []);
    partitions.get(key).push({ row, originalIndex: i });
  }

  // Sort each partition by order key
  if (orderFn) {
    for (const [, items] of partitions) {
      items.sort((a, b) => {
        const ka = typeof orderFn === 'function' ? orderFn(a.row) : a.row[orderFn];
        const kb = typeof orderFn === 'function' ? orderFn(b.row) : b.row[orderFn];
        let cmp = 0;
        if (ka < kb) cmp = -1;
        else if (ka > kb) cmp = 1;
        return desc ? -cmp : cmp;
      });
    }
  }

  // Compute window functions per partition, store results by original index
  const results = new Array(table._rows.length);
  for (let i = 0; i < results.length; i++) results[i] = {};

  for (const [, items] of partitions) {
    const partRows = items.map(it => it.row);
    // Pre-compute order values for rank functions
    const orderValues = orderFn
      ? partRows.map(r => typeof orderFn === 'function' ? orderFn(r) : r[orderFn])
      : partRows.map((_, i) => i);
    const ctx = { orderValues, partitionSize: partRows.length };

    for (const [colName, winFn] of Object.entries(windowFns)) {
      for (let idx = 0; idx < partRows.length; idx++) {
        const val = winFn(partRows, idx, ctx);
        results[items[idx].originalIndex][colName] = val;
      }
    }
  }

  // Build new rows with original columns + window columns
  const newCols = [...table._columns];
  for (const colName of Object.keys(windowFns)) {
    if (!newCols.includes(colName)) newCols.push(colName);
  }

  const newRows = table._rows.map((r, i) => ({ ...r, ...results[i] }));
  return new Table(newRows, newCols);
}

// ── Data Exploration ──────────────────────────────────

export function peek(table, opts = {}) {
  const { title, n = 10 } = typeof opts === 'object' ? opts : {};
  console.log(table._format ? table._format(n, title) : String(table));
  return table; // pass-through for pipeline transparency
}

export function describe(table) {
  const stats = [];
  for (const col of table._columns) {
    const values = table._rows.map(r => r[col]).filter(v => v !== null && v !== undefined);
    const nonNull = values.length;
    const stat = { Column: col, Type: 'Unknown', 'Non-Null': nonNull };

    if (values.length > 0) {
      const sample = values[0];
      if (typeof sample === 'number') {
        stat.Type = Number.isInteger(sample) ? 'Int' : 'Float';
        stat.Mean = values.reduce((a, b) => a + b, 0) / values.length;
        stat.Min = Math.min(...values);
        stat.Max = Math.max(...values);
      } else if (typeof sample === 'string') {
        stat.Type = 'String';
        stat.Unique = new Set(values).size;
      } else if (typeof sample === 'boolean') {
        stat.Type = 'Bool';
        stat.True = values.filter(v => v).length;
      }
    }
    stats.push(stat);
  }

  // Print as table
  const descTable = new Table(stats);
  console.log(descTable._format(100, 'describe()'));
  return descTable;
}

export function schema_of(table) {
  const schema = {};
  if (table._rows.length === 0) {
    for (const col of table._columns) schema[col] = 'Unknown';
  } else {
    const sample = table._rows[0];
    for (const col of table._columns) {
      const val = sample[col];
      if (val === null || val === undefined) schema[col] = 'Nil';
      else if (typeof val === 'number') schema[col] = Number.isInteger(val) ? 'Int' : 'Float';
      else if (typeof val === 'string') schema[col] = 'String';
      else if (typeof val === 'boolean') schema[col] = 'Bool';
      else if (Array.isArray(val)) schema[col] = 'Array';
      else schema[col] = 'Object';
    }
  }
  console.log('Schema:');
  for (const [col, type] of Object.entries(schema)) {
    console.log(`  ${col}: ${type}`);
  }
  return schema;
}

// ── Data Cleaning ─────────────────────────────────────

export function cast(table, colFn, targetType) {
  const colName = typeof colFn === 'string' ? colFn : null;
  const rows = table._rows.map(r => {
    const row = { ...r };
    const key = colName || Object.keys(r).find(k => colFn(r) === r[k]);
    if (key && key in row) {
      const val = row[key];
      switch (targetType) {
        case 'Int': row[key] = parseInt(val, 10) || 0; break;
        case 'Float': row[key] = parseFloat(val) || 0; break;
        case String: case 'String': row[key] = String(val); break;
        case Boolean: case 'Bool': row[key] = Boolean(val); break;
      }
    }
    return row;
  });
  return new Table(rows, table._columns);
}

export function drop_nil(table, colFn) {
  const colName = typeof colFn === 'string' ? colFn : null;
  const rows = table._rows.filter(r => {
    const val = colName ? r[colName] : colFn(r);
    return val !== null && val !== undefined;
  });
  return new Table(rows, table._columns);
}

export function fill_nil(table, colFn, defaultValue) {
  const colName = typeof colFn === 'string' ? colFn : null;
  const rows = table._rows.map(r => {
    const row = { ...r };
    if (colName) {
      if (row[colName] === null || row[colName] === undefined) {
        row[colName] = defaultValue;
      }
    }
    return row;
  });
  return new Table(rows, table._columns);
}

export function filter_ok(table) {
  const rows = table._rows.filter(r => r && r.__tag === 'Ok').map(r => r.value);
  return new Table(rows);
}

export function filter_err(table) {
  const rows = table._rows.filter(r => r && r.__tag === 'Err').map(r => r.error);
  return new Table(rows);
}

// ── Sampling ────────────────────────────────────────────

// Seeded PRNG (xorshift128)
function _xorshift128(seed) {
  let s = [seed, seed ^ 0xDEADBEEF, seed ^ 0x12345678, seed ^ 0x87654321];
  return function() {
    let t = s[3];
    t ^= t << 11;
    t ^= t >>> 8;
    s[3] = s[2]; s[2] = s[1]; s[1] = s[0];
    t ^= s[0]; t ^= s[0] >>> 19;
    s[0] = t;
    return (t >>> 0) / 4294967296;
  };
}

export function table_sample(table, n, opts = {}) {
  const total = table._rows.length;
  let k = n < 1 ? Math.floor(n * total) : Math.min(n, total);
  if (k <= 0) return new Table([], table._columns);
  if (k >= total) return new Table([...table._rows], table._columns);

  const rng = opts.seed != null ? _xorshift128(opts.seed) : () => Math.random();
  const indices = Array.from({ length: total }, (_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (total - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const rows = [];
  for (let i = 0; i < k; i++) rows.push(table._rows[indices[i]]);
  return new Table(rows, table._columns);
}

export function table_stratified_sample(table, keyFn, n, opts = {}) {
  const groups = new Map();
  for (const row of table._rows) {
    const key = String(typeof keyFn === 'function' ? keyFn(row) : row[keyFn]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const allRows = [];
  let gi = 0;
  for (const [, groupRows] of groups) {
    const groupTable = new Table(groupRows, table._columns);
    const groupOpts = opts.seed != null ? { seed: opts.seed + gi * 7919 } : {};
    const sampled = table_sample(groupTable, n, groupOpts);
    allRows.push(...sampled._rows);
    gi++;
  }
  return new Table(allRows, table._columns);
}

// ── SQLite Connector ──────────────────────────────────

let _SqliteDatabase = null;
function _getSqliteDatabase() {
  if (_SqliteDatabase) return _SqliteDatabase;
  try {
    _SqliteDatabase = globalThis.Bun
      ? require('bun:sqlite').Database
      : require('better-sqlite3');
  } catch {
    throw new Error('SQLite requires Bun (built-in) or "better-sqlite3" package under Node');
  }
  return _SqliteDatabase;
}

export function tova_sqlite(path) {
  const Database = _getSqliteDatabase();
  const db = new Database(path);

  function _inferSqliteType(value) {
    if (value === null || value === undefined) return 'TEXT';
    if (typeof value === 'boolean') return 'INTEGER';
    if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'REAL';
    return 'TEXT';
  }

  return {
    _isTovaSqlite: true,

    query(sql, params = []) {
      const stmt = db.prepare(sql);
      const rows = stmt.all(...params);
      return new Table(rows);
    },

    exec(sql, params = []) {
      const stmt = db.prepare(sql);
      const result = stmt.run(...params);
      return { changes: result.changes };
    },

    writeTable(tableData, tableName, opts = {}) {
      const t = tableData instanceof Table ? tableData : new Table(tableData);
      if (t._rows.length === 0) return;

      if (!opts.append) {
        db.run(`DROP TABLE IF EXISTS "${tableName}"`);
        const colDefs = t._columns.map(c => {
          const sampleVal = t._rows[0][c];
          return `"${c}" ${_inferSqliteType(sampleVal)}`;
        }).join(', ');
        db.run(`CREATE TABLE "${tableName}" (${colDefs})`);
      }

      const placeholders = t._columns.map(() => '?').join(', ');
      const insertSql = `INSERT INTO "${tableName}" (${t._columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
      const insert = db.prepare(insertSql);

      const transaction = db.transaction((rows) => {
        for (const row of rows) {
          const values = t._columns.map(c => {
            const v = row[c];
            if (v === undefined || v === null) return null;
            if (typeof v === 'boolean') return v ? 1 : 0;
            return v;
          });
          insert.run(...values);
        }
      });
      transaction(t._rows);
    },

    close() {
      db.close();
    }
  };
}

// ── Parquet Read/Write ──────────────────────────────

// Infer Arrow type from a JS value for column type detection
function _inferArrowType(values) {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'boolean') return 'bool';
    if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
    if (typeof v === 'string') return 'string';
  }
  return 'string'; // default for all-null columns
}

const COMPRESSION_MAP = {
  snappy: 1,
  gzip: 2,
  brotli: 3,
  zstd: 5,
  lz4: 6,
  uncompressed: 0,
  none: 0,
};

export async function readParquet(path) {
  const fs = await import('fs');
  const arrow = await import('apache-arrow');
  const pw = await import('parquet-wasm/node');

  const fileBytes = new Uint8Array(fs.readFileSync(path));
  const wasmTable = pw.readParquet(fileBytes);
  const ipcBytes = wasmTable.intoIPCStream();
  const arrowTable = arrow.tableFromIPC(ipcBytes);

  const columns = arrowTable.schema.fields.map(f => f.name);
  const rows = [];
  for (let i = 0; i < arrowTable.numRows; i++) {
    const row = {};
    for (const col of columns) {
      const val = arrowTable.getChild(col).get(i);
      row[col] = val === undefined ? null : val;
    }
    rows.push(row);
  }

  return new Table(rows, columns);
}

export async function writeParquet(table, path, opts = {}) {
  const fs = await import('fs');
  const arrow = await import('apache-arrow');
  const pw = await import('parquet-wasm/node');

  const t = table instanceof Table ? table : new Table(table);
  const columns = t._columns;

  // Build Arrow column vectors with proper type inference
  const columnVectors = {};
  for (const col of columns) {
    const values = t._rows.map(r => {
      const v = r[col];
      return v === undefined ? null : v;
    });
    const arrowType = _inferArrowType(values);

    if (arrowType === 'int') {
      columnVectors[col] = arrow.vectorFromArray(values, new arrow.Int32());
    } else if (arrowType === 'float') {
      columnVectors[col] = arrow.vectorFromArray(values, new arrow.Float64());
    } else if (arrowType === 'bool') {
      columnVectors[col] = arrow.vectorFromArray(values, new arrow.Bool());
    } else {
      columnVectors[col] = arrow.vectorFromArray(values, new arrow.Utf8());
    }
  }

  const arrowTable = new arrow.Table(columnVectors);
  const ipcBytes = arrow.tableToIPC(arrowTable, 'stream');
  const wasmTable = pw.Table.fromIPCStream(ipcBytes);

  // Build writer properties
  let writerProps = null;
  const compression = opts.compression || 'snappy';
  const compCode = COMPRESSION_MAP[compression.toLowerCase()];
  if (compCode !== undefined) {
    writerProps = new pw.WriterPropertiesBuilder()
      .setCompression(compCode)
      .build();
  }

  const parquetBytes = pw.writeParquet(wasmTable, writerProps);
  fs.writeFileSync(path, parquetBytes);
}

// ── Excel Read/Write ──────────────────────────────────

export async function readExcel(path, opts = {}) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);

  // Get worksheet by name (string), index (number), or first sheet
  let worksheet;
  if (typeof opts.sheet === 'string') {
    worksheet = workbook.getWorksheet(opts.sheet);
    if (!worksheet) throw new Error(`Sheet "${opts.sheet}" not found`);
  } else if (typeof opts.sheet === 'number') {
    // opts.sheet is 1-based index into the worksheets array
    const sheets = workbook.worksheets;
    if (opts.sheet < 1 || opts.sheet > sheets.length) {
      throw new Error(`Sheet index ${opts.sheet} out of range (1-${sheets.length})`);
    }
    worksheet = sheets[opts.sheet - 1];
  } else {
    worksheet = workbook.worksheets[0];
  }

  if (!worksheet) throw new Error('No worksheets found in workbook');

  // Extract header row (row 1)
  const headerRow = worksheet.getRow(1);
  const columns = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    columns[colNumber] = _excelCellValue(cell);
  });

  // Filter out empty slots to get contiguous column names, but keep position mapping
  const colMap = []; // colMap[i] = { colNumber, name }
  for (let i = 1; i < columns.length; i++) {
    if (columns[i] !== undefined && columns[i] !== null) {
      colMap.push({ colNumber: i, name: String(columns[i]) });
    }
  }

  if (colMap.length === 0) {
    return new Table([], []);
  }

  const columnNames = colMap.map(c => c.name);

  // Iterate data rows (starting from row 2)
  const rows = [];
  const rowCount = worksheet.rowCount;
  for (let r = 2; r <= rowCount; r++) {
    const excelRow = worksheet.getRow(r);
    const row = {};
    for (const { colNumber, name } of colMap) {
      const cell = excelRow.getCell(colNumber);
      const val = _excelCellValue(cell);
      row[name] = val;
    }
    rows.push(row);
  }

  return new Table(rows, columnNames);
}

function _excelCellValue(cell) {
  if (!cell || cell.type === 0 /* Null */) return null;
  const val = cell.value;
  if (val === null || val === undefined) return null;
  // Formula cells: use the computed result
  if (typeof val === 'object' && val.formula !== undefined) {
    const result = val.result;
    if (result === null || result === undefined) return null;
    if (result instanceof Date) return result;
    return result;
  }
  // RichText cells: concatenate text parts
  if (typeof val === 'object' && val.richText) {
    return val.richText.map(part => part.text).join('');
  }
  // Hyperlink cells: return the text
  if (typeof val === 'object' && val.hyperlink) {
    return val.text || val.hyperlink;
  }
  // Error cells
  if (typeof val === 'object' && val.error) {
    return null;
  }
  // Date, number, string, boolean pass through
  return val;
}

export async function writeExcel(table, path, opts = {}) {
  const ExcelJS = require('exceljs');
  const t = table instanceof Table ? table : new Table(table);
  const workbook = new ExcelJS.Workbook();
  const sheetName = opts.sheet || 'Sheet1';
  const worksheet = workbook.addWorksheet(sheetName);

  // Add header row
  const cols = t._columns;
  if (cols.length > 0) {
    worksheet.addRow(cols);
  }

  // Add data rows
  for (const row of t._rows) {
    const values = cols.map(c => {
      const v = row[c];
      if (v === undefined) return null;
      return v;
    });
    worksheet.addRow(values);
  }

  await workbook.xlsx.writeFile(path);
}
