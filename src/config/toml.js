// Minimal TOML parser for tova.toml project manifests.
// Handles: sections ([name], [a.b]), strings, numbers, booleans, simple arrays.

export function parseTOML(input) {
  const result = {};
  let current = result;
  const lines = input.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    // Skip empty lines and comments
    if (line === '' || line.startsWith('#')) continue;

    // Section header: [section] or [section.subsection] or ["quoted.key"]
    if (line.startsWith('[') && !line.startsWith('[[')) {
      const close = line.lastIndexOf(']');
      if (close <= 0) {
        throw new Error(`TOML parse error on line ${i + 1}: unclosed section header`);
      }
      const sectionPath = line.slice(1, close).trim();
      if (!sectionPath) {
        throw new Error(`TOML parse error on line ${i + 1}: empty section name`);
      }
      current = result;
      const parts = parseSectionPath(sectionPath);
      for (const key of parts) {
        if (!current[key]) current[key] = {};
        current = current[key];
      }
      continue;
    }

    // Key = value
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue; // skip lines without =

    const key = line.slice(0, eqIdx).trim();
    const rawValue = line.slice(eqIdx + 1).trim();

    current[key] = parseValue(rawValue, i + 1);
  }

  return result;
}

function parseSectionPath(path) {
  const parts = [];
  let i = 0;
  while (i < path.length) {
    // Skip whitespace
    while (i < path.length && path[i] === ' ') i++;
    if (i >= path.length) break;

    if (path[i] === '"') {
      // Quoted key: read until closing quote
      i++; // skip opening quote
      let key = '';
      while (i < path.length && path[i] !== '"') {
        if (path[i] === '\\') {
          i++;
          key += path[i] || '';
        } else {
          key += path[i];
        }
        i++;
      }
      i++; // skip closing quote
      parts.push(key);
    } else {
      // Bare key: read until dot or end
      let key = '';
      while (i < path.length && path[i] !== '.') {
        key += path[i];
        i++;
      }
      key = key.trim();
      if (key) parts.push(key);
    }

    // Skip dot separator
    while (i < path.length && (path[i] === ' ' || path[i] === '.')) {
      if (path[i] === '.') { i++; break; }
      i++;
    }
  }
  return parts;
}

function parseValue(raw, lineNum) {
  if (raw === '') {
    throw new Error(`TOML parse error on line ${lineNum}: missing value`);
  }

  // Strip inline comment (not inside quotes)
  const stripped = stripInlineComment(raw);

  // Boolean
  if (stripped === 'true') return true;
  if (stripped === 'false') return false;

  // Quoted string (double or single)
  if ((stripped.startsWith('"') && stripped.endsWith('"')) ||
      (stripped.startsWith("'") && stripped.endsWith("'"))) {
    return parseString(stripped);
  }

  // Array
  if (stripped.startsWith('[')) {
    return parseArray(stripped, lineNum);
  }

  // Number (integer or float)
  if (/^-?\d+(\.\d+)?$/.test(stripped)) {
    return stripped.includes('.') ? parseFloat(stripped) : parseInt(stripped, 10);
  }

  // Bare value (treat as string for compat with version ranges like ^2.0.0)
  return stripped;
}

function stripInlineComment(raw) {
  // Find # that's not inside a quoted string
  let inStr = null;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
    } else {
      if (ch === '"' || ch === "'") { inStr = ch; continue; }
      if (ch === '#') return raw.slice(0, i).trim();
    }
  }
  return raw;
}

function parseString(raw) {
  const quote = raw[0];
  const inner = raw.slice(1, -1);
  if (quote === '"') {
    // Handle escape sequences
    return inner
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\\\/g, '\\')
      .replace(/\\"/g, '"');
  }
  // Single-quoted: literal string, no escapes
  return inner;
}

function parseArray(raw, lineNum) {
  // Simple single-line array: [val1, val2, ...]
  if (!raw.endsWith(']')) {
    throw new Error(`TOML parse error on line ${lineNum}: unclosed array`);
  }
  const inner = raw.slice(1, -1).trim();
  if (inner === '') return [];

  const items = [];
  let current = '';
  let depth = 0;
  let inStr = null;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inStr) {
      current += ch;
      if (ch === '\\') { current += inner[++i] || ''; continue; }
      if (ch === inStr) inStr = null;
    } else {
      if (ch === '"' || ch === "'") { inStr = ch; current += ch; continue; }
      if (ch === '[') { depth++; current += ch; continue; }
      if (ch === ']') { depth--; current += ch; continue; }
      if (ch === ',' && depth === 0) {
        const val = current.trim();
        if (val !== '') items.push(parseValue(val, lineNum));
        current = '';
        continue;
      }
      current += ch;
    }
  }
  const last = current.trim();
  if (last !== '') items.push(parseValue(last, lineNum));

  return items;
}

export function stringifyTOML(obj, _prefix = '') {
  const lines = [];
  const sections = [];

  // Write top-level key-value pairs first
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      sections.push([key, value]);
    } else {
      lines.push(`${key} = ${formatValue(value)}`);
    }
  }

  // Write sections
  for (const [key, value] of sections) {
    const sectionKey = _prefix ? `${_prefix}.${key}` : key;
    const { topLevel, nested } = splitObject(value);

    if (lines.length > 0 || sections.indexOf([key, value]) > 0) {
      lines.push('');
    }
    lines.push(`[${sectionKey}]`);

    for (const [k, v] of Object.entries(topLevel)) {
      lines.push(`${k} = ${formatValue(v)}`);
    }

    for (const [k, v] of Object.entries(nested)) {
      const nestedKey = `${sectionKey}.${k}`;
      lines.push('');
      lines.push(`[${nestedKey}]`);
      for (const [nk, nv] of Object.entries(v)) {
        lines.push(`${nk} = ${formatValue(nv)}`);
      }
    }
  }

  return lines.join('\n') + '\n';
}

function splitObject(obj) {
  const topLevel = {};
  const nested = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      nested[key] = value;
    } else {
      topLevel[key] = value;
    }
  }
  return { topLevel, nested };
}

function formatValue(value) {
  if (typeof value === 'string') return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`;
  return String(value);
}
