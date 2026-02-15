// Tova standard library — string utilities

export function upper(str) {
  return str.toUpperCase();
}

export function lower(str) {
  return str.toLowerCase();
}

export function trim(str) {
  return str.trim();
}

export function trim_start(str) {
  return str.trimStart();
}

export function trim_end(str) {
  return str.trimEnd();
}

export function split(str, separator) {
  return str.split(separator);
}

export function join(arr, separator = '') {
  return arr.join(separator);
}

export function contains(str, substr) {
  return str.includes(substr);
}

export function starts_with(str, prefix) {
  return str.startsWith(prefix);
}

export function ends_with(str, suffix) {
  return str.endsWith(suffix);
}

export function replace(str, search, replacement) {
  return str.replaceAll(search, replacement);
}

export function replace_first(str, search, replacement) {
  return str.replace(search, replacement);
}

export function repeat(str, count) {
  return str.repeat(count);
}

export function pad_start(str, length, fill = ' ') {
  return str.padStart(length, fill);
}

export function pad_end(str, length, fill = ' ') {
  return str.padEnd(length, fill);
}

export function char_at(str, index) {
  return index < str.length ? str[index] : null;
}

export function chars(str) {
  return [...str];
}

export function words(str) {
  return str.split(/\s+/).filter(Boolean);
}

export function lines(str) {
  return str.split('\n');
}

export function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function title_case(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

export function snake_case(str) {
  return str
    .replace(/[-\s]+/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/^_/, '');
}

export function camel_case(str) {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
    .replace(/^[A-Z]/, c => c.toLowerCase());
}

export function index_of(s, sub) {
  const i = s.indexOf(sub);
  return i === -1 ? null : i;
}

export function last_index_of(s, sub) {
  const i = s.lastIndexOf(sub);
  return i === -1 ? null : i;
}

export function count_of(s, sub) {
  if (!sub) return 0;
  let c = 0, i = 0;
  while ((i = s.indexOf(sub, i)) !== -1) { c++; i += sub.length; }
  return c;
}

export function reverse_str(s) {
  return [...s].reverse().join('');
}

export function substr(s, start, end) {
  return end === undefined ? s.slice(start) : s.slice(start, end);
}

export function kebab_case(s) {
  return s
    .replace(/[-\s]+/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/^-/, '');
}

export function center(s, n, fill) {
  if (s.length >= n) return s;
  const f = fill || ' ';
  const total = n - s.length;
  const left = Math.floor(total / 2);
  const right = total - left;
  return f.repeat(Math.ceil(left / f.length)).slice(0, left) + s + f.repeat(Math.ceil(right / f.length)).slice(0, right);
}

// ── Text Utilities ────────────────────────────────────────

export function truncate(s, n, suffix) {
  const sf = suffix !== undefined ? suffix : '...';
  return s.length <= n ? s : s.slice(0, n - sf.length) + sf;
}

export function word_wrap(s, width) {
  const ws = s.split(' ');
  const lines = [];
  let line = '';
  for (const w of ws) {
    if (line && (line.length + 1 + w.length) > width) {
      lines.push(line);
      line = w;
    } else {
      line = line ? line + ' ' + w : w;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

export function dedent(s) {
  const lines = s.split('\n');
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (nonEmpty.length === 0) return s;
  const indent = Math.min(...nonEmpty.map(l => l.match(/^(\s*)/)[1].length));
  return lines.map(l => l.slice(indent)).join('\n');
}

export function indent_str(s, n, ch) {
  const prefix = (ch || ' ').repeat(n);
  return s.split('\n').map(l => prefix + l).join('\n');
}

export function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function escape_html(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function unescape_html(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export function fmt(template, ...args) {
  let i = 0;
  return template.replace(/\{\}/g, () => i < args.length ? String(args[i++]) : '{}');
}
