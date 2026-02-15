// Tova standard library — date/time utilities

export function date_parse(s) {
  const d = new Date(s);
  if (isNaN(d.getTime())) {
    return { __tag: 'Err', error: 'Invalid date: ' + s, map(_) { return this; }, unwrap() { throw new Error(this.error); }, isOk() { return false; }, isErr() { return true; } };
  }
  return { __tag: 'Ok', value: d, map(fn) { return { __tag: 'Ok', value: fn(d), unwrap() { return fn(d); }, isOk() { return true; }, isErr() { return false; } }; }, unwrap() { return d; }, isOk() { return true; }, isErr() { return false; } };
}

export function date_format(d, fmt) {
  if (typeof d === 'number') d = new Date(d);
  if (fmt === 'iso') return d.toISOString();
  if (fmt === 'date') return d.toISOString().slice(0, 10);
  if (fmt === 'time') return d.toTimeString().slice(0, 8);
  if (fmt === 'datetime') return d.toISOString().slice(0, 10) + ' ' + d.toTimeString().slice(0, 8);
  return fmt
    .replace('YYYY', String(d.getFullYear()))
    .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
    .replace('DD', String(d.getDate()).padStart(2, '0'))
    .replace('HH', String(d.getHours()).padStart(2, '0'))
    .replace('mm', String(d.getMinutes()).padStart(2, '0'))
    .replace('ss', String(d.getSeconds()).padStart(2, '0'));
}

export function date_add(d, amount, unit) {
  if (typeof d === 'number') d = new Date(d);
  const r = new Date(d.getTime());
  if (unit === 'years') r.setFullYear(r.getFullYear() + amount);
  else if (unit === 'months') r.setMonth(r.getMonth() + amount);
  else if (unit === 'days') r.setDate(r.getDate() + amount);
  else if (unit === 'hours') r.setHours(r.getHours() + amount);
  else if (unit === 'minutes') r.setMinutes(r.getMinutes() + amount);
  else if (unit === 'seconds') r.setSeconds(r.getSeconds() + amount);
  return r;
}

export function date_diff(d1, d2, unit) {
  if (typeof d1 === 'number') d1 = new Date(d1);
  if (typeof d2 === 'number') d2 = new Date(d2);
  const ms = d2.getTime() - d1.getTime();
  if (unit === 'seconds') return Math.floor(ms / 1000);
  if (unit === 'minutes') return Math.floor(ms / 60000);
  if (unit === 'hours') return Math.floor(ms / 3600000);
  if (unit === 'days') return Math.floor(ms / 86400000);
  if (unit === 'months') return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (unit === 'years') return d2.getFullYear() - d1.getFullYear();
  return ms;
}

export function date_from(parts) {
  return new Date(
    parts.year || 0,
    (parts.month || 1) - 1,
    parts.day || 1,
    parts.hour || 0,
    parts.minute || 0,
    parts.second || 0
  );
}

export function date_part(d, part) {
  if (typeof d === 'number') d = new Date(d);
  if (part === 'year') return d.getFullYear();
  if (part === 'month') return d.getMonth() + 1;
  if (part === 'day') return d.getDate();
  if (part === 'hour') return d.getHours();
  if (part === 'minute') return d.getMinutes();
  if (part === 'second') return d.getSeconds();
  if (part === 'weekday') return d.getDay();
  return null;
}

export function time_ago(d) {
  if (typeof d === 'number') d = new Date(d);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return s + ' seconds ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
  const h = Math.floor(m / 60);
  if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
  const dy = Math.floor(h / 24);
  if (dy < 30) return dy + (dy === 1 ? ' day ago' : ' days ago');
  const mo = Math.floor(dy / 30);
  if (mo < 12) return mo + (mo === 1 ? ' month ago' : ' months ago');
  const yr = Math.floor(mo / 12);
  return yr + (yr === 1 ? ' year ago' : ' years ago');
}
