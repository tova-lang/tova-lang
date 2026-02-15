// Tova standard library — URL utilities

export function parse_url(s) {
  try {
    const u = new URL(s);
    return { __tag: 'Ok', value: { protocol: u.protocol.replace(':', ''), host: u.host, pathname: u.pathname, search: u.search, hash: u.hash }, map(fn) { return { __tag: 'Ok', value: fn(this.value), map: this.map, unwrap() { return fn(this.value); }, isOk() { return true; }, isErr() { return false; } }; }, unwrap() { return this.value; }, isOk() { return true; }, isErr() { return false; } };
  } catch (e) {
    return { __tag: 'Err', error: 'Invalid URL: ' + s, map(_) { return this; }, unwrap() { throw new Error(this.error); }, isOk() { return false; }, isErr() { return true; } };
  }
}

export function build_url(parts) {
  let url = (parts.protocol || 'https') + '://' + (parts.host || '');
  url += parts.pathname || '/';
  if (parts.search) url += (parts.search.startsWith('?') ? '' : '?') + parts.search;
  if (parts.hash) url += (parts.hash.startsWith('#') ? '' : '#') + parts.hash;
  return url;
}

export function parse_query(s) {
  const r = {};
  const qs = s.startsWith('?') ? s.slice(1) : s;
  if (!qs) return r;
  for (const pair of qs.split('&')) {
    const [k, ...v] = pair.split('=');
    r[decodeURIComponent(k)] = decodeURIComponent(v.join('='));
  }
  return r;
}

export function build_query(obj) {
  return Object.entries(obj).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
}
