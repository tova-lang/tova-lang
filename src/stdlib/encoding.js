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
