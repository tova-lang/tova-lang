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
  var named = args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0]) && !(args[0] instanceof Date);
  var obj = named ? args[0] : null;
  var ai = 0, result = '', pos = 0, len = template.length;
  while (pos < len) {
    if (pos + 1 < len && template[pos] === '{' && template[pos + 1] === '{') { result += '{'; pos += 2; continue; }
    if (pos + 1 < len && template[pos] === '}' && template[pos + 1] === '}') { result += '}'; pos += 2; continue; }
    if (template[pos] === '{') {
      var close = template.indexOf('}', pos + 1);
      if (close === -1) { result += template[pos]; pos++; continue; }
      var inner = template.substring(pos + 1, close);
      pos = close + 1;
      var colonIdx = inner.indexOf(':');
      var key = colonIdx >= 0 ? inner.substring(0, colonIdx) : inner;
      var spec = colonIdx >= 0 ? inner.substring(colonIdx + 1) : '';
      var val;
      if (named && key.length > 0) {
        val = obj[key]; if (val === undefined) { result += '{' + inner + '}'; continue; }
      } else if (key.length === 0) {
        if (ai < args.length) { val = args[ai++]; } else { result += '{}'; continue; }
      } else {
        if (ai < args.length) { val = args[ai++]; } else { result += '{' + inner + '}'; continue; }
      }
      if (!spec) { result += String(val); continue; }
      var si = 0, fill = ' ', align = '', sign = '', comma = false, width = 0, hasWidth = false, precision = -1, type = '';
      if (si + 1 < spec.length && (spec[si + 1] === '<' || spec[si + 1] === '>' || spec[si + 1] === '^')) { fill = spec[si]; align = spec[si + 1]; si += 2; }
      else if (si < spec.length && (spec[si] === '<' || spec[si] === '>' || spec[si] === '^')) { align = spec[si]; si += 1; }
      if (si < spec.length && (spec[si] === '+' || spec[si] === '-' || spec[si] === ' ')) { sign = spec[si]; si += 1; }
      while (si < spec.length && spec[si] >= '0' && spec[si] <= '9') { width = width * 10 + (spec.charCodeAt(si) - 48); hasWidth = true; si += 1; }
      if (si < spec.length && spec[si] === ',') { comma = true; si += 1; }
      if (si < spec.length && spec[si] === '.') { si += 1; precision = 0; while (si < spec.length && spec[si] >= '0' && spec[si] <= '9') { precision = precision * 10 + (spec.charCodeAt(si) - 48); si += 1; } }
      if (si < spec.length) { type = spec[si]; }
      var formatted, numVal = typeof val === 'number' ? val : Number(val);
      switch (type) {
        case 'b': formatted = (numVal >>> 0).toString(2); if (numVal === 0) formatted = '0'; break;
        case 'o': formatted = (numVal >>> 0).toString(8); if (numVal === 0) formatted = '0'; break;
        case 'x': formatted = (numVal >>> 0).toString(16); if (numVal === 0) formatted = '0'; break;
        case 'X': formatted = (numVal >>> 0).toString(16).toUpperCase(); if (numVal === 0) formatted = '0'; break;
        case 'f': formatted = numVal.toFixed(precision >= 0 ? precision : 6); break;
        case '%': {
          var pct = numVal * 100;
          formatted = precision >= 0 ? pct.toFixed(precision) + '%' : (Math.round(pct * 1e10) / 1e10).toString() + '%';
          break;
        }
        case '$': {
          var abs = Math.abs(numVal), dollars = abs.toFixed(2), dotIdx2 = dollars.indexOf('.'), intPart2 = dollars.substring(0, dotIdx2), decPart2 = dollars.substring(dotIdx2);
          var withCommas2 = '';
          for (var j2 = 0; j2 < intPart2.length; j2++) { if (j2 > 0 && (intPart2.length - j2) % 3 === 0) withCommas2 += ','; withCommas2 += intPart2[j2]; }
          formatted = (numVal < 0 ? '-' : '') + '$' + withCommas2 + decPart2;
          break;
        }
        case 's': formatted = String(val); if (precision >= 0) formatted = formatted.substring(0, precision); break;
        default:
          if (typeof val === 'number' && precision >= 0 && !type) formatted = numVal.toFixed(precision);
          else formatted = String(val);
          break;
      }
      if (comma && type !== '$') {
        var dIdx = formatted.indexOf('.'), iPart = dIdx >= 0 ? formatted.substring(0, dIdx) : formatted, dPart = dIdx >= 0 ? formatted.substring(dIdx) : '';
        var signChar = '', digits = iPart;
        if (digits[0] === '-' || digits[0] === '+') { signChar = digits[0]; digits = digits.substring(1); }
        var withC = '';
        for (var j = 0; j < digits.length; j++) { if (j > 0 && (digits.length - j) % 3 === 0) withC += ','; withC += digits[j]; }
        formatted = signChar + withC + dPart;
      }
      if (sign && type !== '$' && type !== '%') {
        if (typeof val === 'number') {
          var s = formatted;
          if (s[0] === '-' || s[0] === '+') { s = s.substring(1); }
          if (numVal >= 0) { if (sign === '+') formatted = '+' + s; else if (sign === ' ') formatted = ' ' + s; else formatted = s; }
          else { formatted = '-' + s; }
        }
      }
      if (hasWidth && formatted.length < width) {
        var pad = width - formatted.length, a = align || '>';
        if (a === '<') formatted = formatted + fill.repeat(pad);
        else if (a === '^') { var left = Math.floor(pad / 2); formatted = fill.repeat(left) + formatted + fill.repeat(pad - left); }
        else formatted = fill.repeat(pad) + formatted;
      }
      result += formatted;
      continue;
    }
    result += template[pos]; pos++;
  }
  return result;
}
