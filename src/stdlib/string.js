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
