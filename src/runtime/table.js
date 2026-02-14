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
  const { left, right, how = 'inner' } = opts;
  if (!left || !right) throw new Error('join() requires left and right key functions');

  const rows = [];
  const rightIndex = new Map();
  for (const r of other._rows) {
    const key = typeof right === 'function' ? right(r) : r[right];
    const keyStr = String(key);
    if (!rightIndex.has(keyStr)) rightIndex.set(keyStr, []);
    rightIndex.get(keyStr).push(r);
  }

  const combinedCols = [...new Set([...table._columns, ...other._columns])];

  for (const lr of table._rows) {
    const key = typeof left === 'function' ? left(lr) : lr[left];
    const keyStr = String(key);
    const matches = rightIndex.get(keyStr) || [];

    if (matches.length > 0) {
      for (const rr of matches) {
        rows.push({ ...lr, ...rr });
      }
    } else if (how === 'left' || how === 'outer') {
      const row = { ...lr };
      for (const c of other._columns) {
        if (!(c in row)) row[c] = null;
      }
      rows.push(row);
    }
  }

  if (how === 'right' || how === 'outer') {
    const leftIndex = new Set();
    for (const lr of table._rows) {
      const key = typeof left === 'function' ? left(lr) : lr[left];
      leftIndex.add(String(key));
    }
    for (const rr of other._rows) {
      const key = typeof right === 'function' ? right(rr) : rr[right];
      if (!leftIndex.has(String(key))) {
        const row = { ...rr };
        for (const c of table._columns) {
          if (!(c in row)) row[c] = null;
        }
        rows.push(row);
      }
    }
  }

  return new Table(rows, combinedCols);
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
