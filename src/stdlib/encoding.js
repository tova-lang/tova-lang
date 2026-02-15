// Tova standard library — encoding utilities

export function base64_encode(s) {
  return typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(s)))
    : Buffer.from(s, 'utf-8').toString('base64');
}

export function base64_decode(s) {
  return typeof atob === 'function'
    ? decodeURIComponent(escape(atob(s)))
    : Buffer.from(s, 'base64').toString('utf-8');
}

export function url_encode(s) {
  return encodeURIComponent(s);
}

export function url_decode(s) {
  return decodeURIComponent(s);
}

// ── Hex Encoding ──────────────────────────────────────────

export function hex_encode(s) {
  let r = '';
  for (let i = 0; i < s.length; i++) r += s.charCodeAt(i).toString(16).padStart(2, '0');
  return r;
}

export function hex_decode(s) {
  let r = '';
  for (let i = 0; i < s.length; i += 2) r += String.fromCharCode(parseInt(s.substr(i, 2), 16));
  return r;
}
