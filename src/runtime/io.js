// Universal I/O — read() / write() for Tova
// Format inferred from file extension. Zero config.

import { Table } from './table.js';

// ── CSV Parsing ───────────────────────────────────────

function parseCSV(text, opts = {}) {
  const delimiter = opts.delimiter || ',';
  const hasHeader = opts.header !== false;
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return new Table([]);

  const parseLine = (line) => {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          fields.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
    }
    fields.push(current.trim());
    return fields;
  };

  let headers;
  let dataStart;
  if (hasHeader) {
    headers = parseLine(lines[0]);
    dataStart = 1;
  } else {
    const firstRow = parseLine(lines[0]);
    headers = firstRow.map((_, i) => `col_${i}`);
    dataStart = 0;
  }

  const rows = [];
  for (let i = dataStart; i < lines.length; i++) {
    const fields = parseLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      let val = fields[j] ?? null;
      // Auto-detect types
      if (val !== null && val !== '') {
        if (/^-?\d+$/.test(val)) val = parseInt(val, 10);
        else if (/^-?\d*\.\d+$/.test(val)) val = parseFloat(val);
        else if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (val === 'null' || val === 'nil') val = null;
      } else if (val === '') {
        val = null;
      }
      row[headers[j]] = val;
    }
    rows.push(row);
  }

  return new Table(rows, headers);
}

// ── CSV Writing ───────────────────────────────────────

function toCSV(table, opts = {}) {
  const delimiter = opts.delimiter || ',';
  const cols = table._columns;
  const lines = [cols.join(delimiter)];
  for (const row of table._rows) {
    const cells = cols.map(c => {
      const val = row[c];
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(cells.join(delimiter));
  }
  return lines.join('\n');
}

// ── JSONL Parsing ─────────────────────────────────────

function parseJSONL(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const rows = lines.map(l => JSON.parse(l));
  return new Table(rows);
}

function toJSONL(table) {
  return table._rows.map(r => JSON.stringify(r)).join('\n');
}

// ── read() — Universal Reader ─────────────────────────

export async function read(sourceOrDb, queryOrOpts, opts = {}) {
  // Database query: read(db, "SELECT ...")
  if (sourceOrDb && typeof sourceOrDb === 'object' && sourceOrDb.query) {
    const result = await sourceOrDb.query(queryOrOpts);
    return new Table(result);
  }

  const source = sourceOrDb;
  if (typeof source !== 'string') {
    throw new Error(`read() expects a file path or URL string, got ${typeof source}`);
  }

  const options = typeof queryOrOpts === 'object' ? queryOrOpts : opts;

  // URL fetch
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('json')) {
      const data = await response.json();
      if (Array.isArray(data)) return new Table(data);
      return data;
    }

    const text = await response.text();
    // Try to detect format from URL
    if (source.endsWith('.csv')) return parseCSV(text, options);
    if (source.endsWith('.jsonl') || source.endsWith('.ndjson')) return parseJSONL(text);
    if (source.endsWith('.tsv')) return parseCSV(text, { ...options, delimiter: '\t' });

    // Try JSON first
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) return new Table(data);
      return data;
    } catch {
      return parseCSV(text, options);
    }
  }

  // File read
  const fs = await import('fs');
  const path = await import('path');

  const ext = path.extname(source).toLowerCase();
  const text = fs.readFileSync(source, 'utf-8');

  switch (ext) {
    case '.csv':
      return parseCSV(text, options);
    case '.tsv':
      return parseCSV(text, { ...options, delimiter: '\t' });
    case '.json':
      const data = JSON.parse(text);
      if (Array.isArray(data)) return new Table(data);
      return data;
    case '.jsonl':
    case '.ndjson':
      return parseJSONL(text);
    default:
      // Try JSON, then CSV
      try {
        const d = JSON.parse(text);
        if (Array.isArray(d)) return new Table(d);
        return d;
      } catch {
        return parseCSV(text, options);
      }
  }
}

// ── write() — Universal Writer ────────────────────────

export async function write(data, destination, opts = {}) {
  const fs = await import('fs');
  const path = await import('path');

  const ext = path.extname(destination).toLowerCase();
  const isTable = data instanceof Table;
  const tableData = isTable ? data : (Array.isArray(data) ? new Table(data) : null);

  let content;
  switch (ext) {
    case '.csv':
      if (!tableData) throw new Error('write() to CSV requires table/array data');
      content = toCSV(tableData, opts);
      break;
    case '.tsv':
      if (!tableData) throw new Error('write() to TSV requires table/array data');
      content = toCSV(tableData, { ...opts, delimiter: '\t' });
      break;
    case '.json':
      content = JSON.stringify(isTable ? data._rows : data, null, 2);
      break;
    case '.jsonl':
    case '.ndjson':
      if (!tableData) throw new Error('write() to JSONL requires table/array data');
      content = toJSONL(tableData);
      break;
    default:
      content = JSON.stringify(isTable ? data._rows : data, null, 2);
  }

  if (opts.append) {
    fs.appendFileSync(destination, content + '\n', 'utf-8');
  } else {
    fs.writeFileSync(destination, content, 'utf-8');
  }
}

// ── stream() — Streaming Reader ───────────────────────

export async function* stream(source, opts = {}) {
  const batch = opts.batch || 1000;
  const fs = await import('fs');

  const text = fs.readFileSync(source, 'utf-8');
  const table = source.endsWith('.jsonl') || source.endsWith('.ndjson')
    ? parseJSONL(text)
    : parseCSV(text, opts);

  for (let i = 0; i < table._rows.length; i += batch) {
    yield new Table(table._rows.slice(i, i + batch), table._columns);
  }
}
