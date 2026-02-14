import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { read, write, stream } from '../src/runtime/io.js';
import { Table } from '../src/runtime/table.js';
import fs from 'fs';
import path from 'path';

const tmpDir = path.join(import.meta.dir, '__tmp_io_test__');

beforeEach(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('CSV read', () => {
  test('read basic CSV', async () => {
    const csvContent = 'name,age,city\nAlice,30,NYC\nBob,25,LA\n';
    const file = path.join(tmpDir, 'test.csv');
    fs.writeFileSync(file, csvContent);

    const result = await read(file);
    expect(result).toBeInstanceOf(Table);
    expect(result.rows).toBe(2);
    expect(result.columns).toEqual(['name', 'age', 'city']);
    expect(result.at(0).name).toBe('Alice');
    expect(result.at(0).age).toBe(30); // auto-detected as number
    expect(result.at(1).city).toBe('LA');
  });

  test('read CSV with quoted fields', async () => {
    const csvContent = 'name,description\nAlice,"Hello, World"\nBob,"He said ""hi"""\n';
    const file = path.join(tmpDir, 'quoted.csv');
    fs.writeFileSync(file, csvContent);

    const result = await read(file);
    expect(result.at(0).description).toBe('Hello, World');
    expect(result.at(1).description).toBe('He said "hi"');
  });

  test('read TSV', async () => {
    const tsvContent = 'name\tage\nAlice\t30\n';
    const file = path.join(tmpDir, 'test.tsv');
    fs.writeFileSync(file, tsvContent);

    const result = await read(file);
    expect(result.rows).toBe(1);
    expect(result.at(0).name).toBe('Alice');
    expect(result.at(0).age).toBe(30);
  });

  test('read CSV with auto type detection', async () => {
    const csv = 'val\ntrue\nfalse\n42\n3.14\nnull\nhello\n';
    const file = path.join(tmpDir, 'types.csv');
    fs.writeFileSync(file, csv);

    const result = await read(file);
    expect(result.at(0).val).toBe(true);
    expect(result.at(1).val).toBe(false);
    expect(result.at(2).val).toBe(42);
    expect(result.at(3).val).toBe(3.14);
    expect(result.at(4).val).toBeNull();
    expect(result.at(5).val).toBe('hello');
  });
});

describe('JSON read', () => {
  test('read JSON array', async () => {
    const data = [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }];
    const file = path.join(tmpDir, 'test.json');
    fs.writeFileSync(file, JSON.stringify(data));

    const result = await read(file);
    expect(result).toBeInstanceOf(Table);
    expect(result.rows).toBe(2);
  });

  test('read JSON object', async () => {
    const data = { key: 'value', num: 42 };
    const file = path.join(tmpDir, 'obj.json');
    fs.writeFileSync(file, JSON.stringify(data));

    const result = await read(file);
    expect(result.key).toBe('value');
  });
});

describe('JSONL read', () => {
  test('read JSONL', async () => {
    const jsonl = '{"name":"Alice","age":30}\n{"name":"Bob","age":25}\n';
    const file = path.join(tmpDir, 'test.jsonl');
    fs.writeFileSync(file, jsonl);

    const result = await read(file);
    expect(result).toBeInstanceOf(Table);
    expect(result.rows).toBe(2);
    expect(result.at(0).name).toBe('Alice');
  });
});

describe('CSV write', () => {
  test('write Table to CSV', async () => {
    const table = new Table([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
    const file = path.join(tmpDir, 'output.csv');
    await write(table, file);

    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain('name,age');
    expect(content).toContain('Alice,30');
    expect(content).toContain('Bob,25');
  });
});

describe('JSON write', () => {
  test('write Table to JSON', async () => {
    const table = new Table([{ x: 1 }, { x: 2 }]);
    const file = path.join(tmpDir, 'output.json');
    await write(table, file);

    const content = fs.readFileSync(file, 'utf-8');
    const data = JSON.parse(content);
    expect(data).toEqual([{ x: 1 }, { x: 2 }]);
  });
});

describe('JSONL write', () => {
  test('write Table to JSONL', async () => {
    const table = new Table([{ a: 1 }, { a: 2 }]);
    const file = path.join(tmpDir, 'output.jsonl');
    await write(table, file);

    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0])).toEqual({ a: 1 });
  });
});

describe('Append mode', () => {
  test('write with append', async () => {
    const file = path.join(tmpDir, 'append.csv');
    const t1 = new Table([{ x: 1 }], ['x']);
    const t2 = new Table([{ x: 2 }], ['x']);
    await write(t1, file);
    await write(t2, file, { append: true });

    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain('x\n1');
    expect(content).toContain('x\n2');
  });
});

describe('Round trip', () => {
  test('CSV round-trip preserves data', async () => {
    const original = new Table([
      { name: 'Alice', age: 30, score: 9.5 },
      { name: 'Bob', age: 25, score: 8.0 },
    ]);
    const file = path.join(tmpDir, 'round.csv');
    await write(original, file);
    const loaded = await read(file);

    expect(loaded.rows).toBe(2);
    expect(loaded.at(0).name).toBe('Alice');
    expect(loaded.at(0).age).toBe(30);
    expect(loaded.at(0).score).toBe(9.5);
  });
});

// ══════════════════════════════════════════════════════
// COMPREHENSIVE COVERAGE TESTS
// ══════════════════════════════════════════════════════

describe('read() error paths', () => {
  test('read with invalid source type throws', async () => {
    await expect(read(42)).rejects.toThrow('read() expects a file path or URL string');
  });

  test('read with null throws', async () => {
    // null is an object so hits the db-query path check but doesn't have .query
    await expect(read(null)).rejects.toThrow();
  });

  test('read with boolean throws', async () => {
    await expect(read(true)).rejects.toThrow('read() expects a file path or URL string');
  });
});

describe('read() database path', () => {
  test('read with db-like object calls query', async () => {
    const mockDb = {
      query: async (sql) => [{ id: 1, name: 'test' }],
    };
    const result = await read(mockDb, 'SELECT * FROM users');
    expect(result).toBeInstanceOf(Table);
    expect(result.rows).toBe(1);
    expect(result.at(0).name).toBe('test');
  });
});

describe('CSV parsing edge cases', () => {
  test('empty CSV file', async () => {
    const file = path.join(tmpDir, 'empty.csv');
    fs.writeFileSync(file, '');
    const result = await read(file);
    expect(result).toBeInstanceOf(Table);
    expect(result.rows).toBe(0);
  });

  test('CSV with only header', async () => {
    const file = path.join(tmpDir, 'header_only.csv');
    fs.writeFileSync(file, 'a,b,c\n');
    const result = await read(file);
    expect(result.rows).toBe(0);
    expect(result.columns).toEqual(['a', 'b', 'c']);
  });

  test('CSV without header (opts.header = false)', async () => {
    const file = path.join(tmpDir, 'no_header.csv');
    fs.writeFileSync(file, '1,2,3\n4,5,6\n');
    const result = await read(file, { header: false });
    expect(result.columns).toEqual(['col_0', 'col_1', 'col_2']);
    expect(result.rows).toBe(2);
    expect(result.at(0).col_0).toBe(1);
  });

  test('CSV row with fewer columns than header', async () => {
    const file = path.join(tmpDir, 'ragged.csv');
    fs.writeFileSync(file, 'a,b,c\n1\n');
    const result = await read(file);
    expect(result.at(0).a).toBe(1);
    expect(result.at(0).b).toBeNull();
    expect(result.at(0).c).toBeNull();
  });

  test('CSV with negative numbers', async () => {
    const file = path.join(tmpDir, 'neg.csv');
    fs.writeFileSync(file, 'val\n-42\n-3.14\n');
    const result = await read(file);
    expect(result.at(0).val).toBe(-42);
    expect(result.at(1).val).toBe(-3.14);
  });

  test('CSV with nil literal', async () => {
    const file = path.join(tmpDir, 'nil.csv');
    fs.writeFileSync(file, 'val\nnil\n');
    const result = await read(file);
    expect(result.at(0).val).toBeNull();
  });

  test('CSV with empty string values become null', async () => {
    const file = path.join(tmpDir, 'empty_vals.csv');
    fs.writeFileSync(file, 'a,b\nhello,\n');
    const result = await read(file);
    expect(result.at(0).a).toBe('hello');
    expect(result.at(0).b).toBeNull();
  });

  test('CSV with custom delimiter', async () => {
    const file = path.join(tmpDir, 'custom.csv');
    fs.writeFileSync(file, 'a|b\n1|2\n');
    const result = await read(file, { delimiter: '|' });
    expect(result.at(0).a).toBe(1);
    expect(result.at(0).b).toBe(2);
  });
});

describe('JSONL parsing edge cases', () => {
  test('JSONL with blank lines', async () => {
    const file = path.join(tmpDir, 'blanks.jsonl');
    fs.writeFileSync(file, '{"a":1}\n\n{"a":2}\n\n');
    const result = await read(file);
    expect(result.rows).toBe(2);
  });

  test('ndjson extension', async () => {
    const file = path.join(tmpDir, 'test.ndjson');
    fs.writeFileSync(file, '{"x":1}\n{"x":2}\n');
    const result = await read(file);
    expect(result).toBeInstanceOf(Table);
    expect(result.rows).toBe(2);
  });
});

describe('write() error paths', () => {
  test('write non-table to CSV throws', async () => {
    const file = path.join(tmpDir, 'bad.csv');
    await expect(write({ key: 'val' }, file)).rejects.toThrow('write() to CSV requires table/array data');
  });

  test('write non-table to TSV throws', async () => {
    const file = path.join(tmpDir, 'bad.tsv');
    await expect(write('string data', file)).rejects.toThrow('write() to TSV requires table/array data');
  });

  test('write non-table to JSONL throws', async () => {
    const file = path.join(tmpDir, 'bad.jsonl');
    await expect(write({ key: 'val' }, file)).rejects.toThrow('write() to JSONL requires table/array data');
  });
});

describe('write() format detection', () => {
  test('write TSV', async () => {
    const table = new Table([{ a: 1, b: 2 }]);
    const file = path.join(tmpDir, 'out.tsv');
    await write(table, file);
    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain('a\tb');
    expect(content).toContain('1\t2');
  });

  test('write plain object to JSON', async () => {
    const file = path.join(tmpDir, 'obj.json');
    await write({ key: 'value', num: 42 }, file);
    const content = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(content.key).toBe('value');
  });

  test('write array to CSV', async () => {
    const file = path.join(tmpDir, 'arr.csv');
    await write([{ a: 1 }, { a: 2 }], file);
    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain('a');
    expect(content).toContain('1');
  });

  test('unknown extension defaults to JSON', async () => {
    const file = path.join(tmpDir, 'data.txt');
    await write({ x: 1 }, file);
    const content = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(content.x).toBe(1);
  });

  test('write JSONL to ndjson extension', async () => {
    const table = new Table([{ a: 1 }, { a: 2 }]);
    const file = path.join(tmpDir, 'out.ndjson');
    await write(table, file);
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(l => l.trim());
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0])).toEqual({ a: 1 });
  });
});

describe('CSV writing edge cases', () => {
  test('CSV escape delimiter in values', async () => {
    const table = new Table([{ text: 'hello, world' }]);
    const file = path.join(tmpDir, 'escape.csv');
    await write(table, file);
    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain('"hello, world"');
  });

  test('CSV escape quotes in values', async () => {
    const table = new Table([{ text: 'he said "hi"' }]);
    const file = path.join(tmpDir, 'quotes.csv');
    await write(table, file);
    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain('"he said ""hi"""');
  });

  test('CSV escape newlines in values', async () => {
    const table = new Table([{ text: 'line1\nline2' }]);
    const file = path.join(tmpDir, 'newline.csv');
    await write(table, file);
    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain('"line1\nline2"');
  });

  test('CSV null values written as empty', async () => {
    const table = new Table([{ a: null, b: 'ok' }]);
    const file = path.join(tmpDir, 'nulls.csv');
    await write(table, file);
    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain(',ok');
  });
});

describe('read() with unknown extension', () => {
  test('unknown extension tries JSON then CSV', async () => {
    const file = path.join(tmpDir, 'data.dat');
    fs.writeFileSync(file, 'a,b\n1,2\n');
    const result = await read(file);
    // Should fall through JSON (fail) to CSV
    expect(result).toBeInstanceOf(Table);
    expect(result.at(0).a).toBe(1);
  });

  test('unknown extension with valid JSON array', async () => {
    const file = path.join(tmpDir, 'data.dat');
    fs.writeFileSync(file, '[{"a":1},{"a":2}]');
    const result = await read(file);
    expect(result).toBeInstanceOf(Table);
    expect(result.rows).toBe(2);
  });

  test('unknown extension with valid JSON object', async () => {
    const file = path.join(tmpDir, 'data.dat');
    fs.writeFileSync(file, '{"key":"val"}');
    const result = await read(file);
    expect(result.key).toBe('val');
  });
});

describe('stream()', () => {
  test('stream CSV with small batch', async () => {
    const file = path.join(tmpDir, 'big.csv');
    fs.writeFileSync(file, 'a\n1\n2\n3\n4\n5\n');
    const chunks = [];
    for await (const chunk of stream(file, { batch: 2 })) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBe(3); // 2+2+1
    expect(chunks[0].rows).toBe(2);
    expect(chunks[2].rows).toBe(1);
  });

  test('stream JSONL', async () => {
    const file = path.join(tmpDir, 'big.jsonl');
    fs.writeFileSync(file, '{"x":1}\n{"x":2}\n{"x":3}\n');
    const chunks = [];
    for await (const chunk of stream(file, { batch: 2 })) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBe(2); // 2+1
    expect(chunks[0].rows).toBe(2);
  });

  test('stream with default batch size', async () => {
    const file = path.join(tmpDir, 'small.csv');
    fs.writeFileSync(file, 'a\n1\n2\n');
    const chunks = [];
    for await (const chunk of stream(file)) {
      chunks.push(chunk);
    }
    // Default batch is 1000, file has 2 rows, so single chunk
    expect(chunks.length).toBe(1);
    expect(chunks[0].rows).toBe(2);
  });

  test('stream preserves columns', async () => {
    const file = path.join(tmpDir, 'cols.csv');
    fs.writeFileSync(file, 'name,age\nAlice,30\nBob,25\n');
    for await (const chunk of stream(file, { batch: 1 })) {
      expect(chunk.columns).toEqual(['name', 'age']);
    }
  });

  test('stream empty file yields no chunks', async () => {
    const file = path.join(tmpDir, 'empty.csv');
    fs.writeFileSync(file, '');
    const chunks = [];
    for await (const chunk of stream(file)) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBe(0);
  });
});

describe('read() with options parameter', () => {
  test('read with second arg as options', async () => {
    const file = path.join(tmpDir, 'tab.csv');
    fs.writeFileSync(file, 'a\tb\n1\t2\n');
    // Using csv extension but tab delimiter via options
    const result = await read(file, { delimiter: '\t' });
    expect(result.at(0).a).toBe(1);
    expect(result.at(0).b).toBe(2);
  });
});

// ── HTTP URL fetch path tests (mock fetch) ───────────

describe('read() HTTP URL paths', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('URL with JSON content-type returns array as Table', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
    });
    const result = await read('https://api.example.com/users.json');
    expect(result).toBeInstanceOf(Table);
    expect(result.rows).toBe(2);
    expect(result.at(0).name).toBe('Alice');
  });

  test('URL with JSON content-type returns object directly', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ key: 'value', num: 42 }),
    });
    const result = await read('https://api.example.com/config');
    expect(result.key).toBe('value');
    expect(result.num).toBe(42);
  });

  test('URL ending in .csv parses as CSV', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => 'name,age\nAlice,30\nBob,25\n',
    });
    const result = await read('https://example.com/data.csv');
    expect(result).toBeInstanceOf(Table);
    expect(result.rows).toBe(2);
    expect(result.at(0).name).toBe('Alice');
    expect(result.at(0).age).toBe(30);
  });

  test('URL ending in .jsonl parses as JSONL', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => '{"x":1}\n{"x":2}\n',
    });
    const result = await read('https://example.com/events.jsonl');
    expect(result).toBeInstanceOf(Table);
    expect(result.rows).toBe(2);
    expect(result.at(0).x).toBe(1);
  });

  test('URL ending in .ndjson parses as JSONL', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => '{"a":10}\n{"a":20}\n',
    });
    const result = await read('https://example.com/stream.ndjson');
    expect(result).toBeInstanceOf(Table);
    expect(result.rows).toBe(2);
  });

  test('URL ending in .tsv parses as TSV', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => 'a\tb\n1\t2\n',
    });
    const result = await read('https://example.com/data.tsv');
    expect(result).toBeInstanceOf(Table);
    expect(result.at(0).a).toBe(1);
    expect(result.at(0).b).toBe(2);
  });

  test('URL with unknown ext and JSON array text falls back to JSON parse', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => '[{"z":1},{"z":2}]',
    });
    const result = await read('https://example.com/data');
    expect(result).toBeInstanceOf(Table);
    expect(result.rows).toBe(2);
  });

  test('URL with unknown ext and JSON object text returns object', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => '{"key":"val"}',
    });
    const result = await read('https://example.com/config');
    expect(result.key).toBe('val');
  });

  test('URL with unknown ext and non-JSON text falls back to CSV', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => 'col1,col2\nfoo,bar\n',
    });
    const result = await read('https://example.com/data');
    expect(result).toBeInstanceOf(Table);
    expect(result.at(0).col1).toBe('foo');
  });

  test('URL with HTTP error throws', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
    await expect(read('https://example.com/missing')).rejects.toThrow('HTTP 404: Not Found');
  });

  test('URL with http:// prefix works', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => [{ v: 1 }],
    });
    const result = await read('http://example.com/data.json');
    expect(result).toBeInstanceOf(Table);
    expect(result.rows).toBe(1);
  });
});
