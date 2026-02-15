// Tova standard library — math functions

export const PI = Math.PI;
export const E = Math.E;
export const INF = Infinity;

export function sin(n) { return Math.sin(n); }
export function cos(n) { return Math.cos(n); }
export function tan(n) { return Math.tan(n); }
export function asin(n) { return Math.asin(n); }
export function acos(n) { return Math.acos(n); }
export function atan(n) { return Math.atan(n); }
export function atan2(y, x) { return Math.atan2(y, x); }

export function log(n) { return Math.log(n); }
export function log2(n) { return Math.log2(n); }
export function log10(n) { return Math.log10(n); }
export function exp(n) { return Math.exp(n); }

export function sign(n) { return Math.sign(n); }
export function trunc(n) { return Math.trunc(n); }
export function is_nan(n) { return Number.isNaN(n); }
export function is_finite(n) { return Number.isFinite(n); }
export function is_close(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol); }
export function to_radians(deg) { return deg * Math.PI / 180; }
export function to_degrees(rad) { return rad * 180 / Math.PI; }

export function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
export function lcm(a, b) {
  if (a === 0 && b === 0) return 0;
  let x = Math.abs(a), y = Math.abs(b);
  while (y) { const t = y; y = x % y; x = t; }
  return Math.abs(a * b) / x;
}
export function factorial(n) { if (n < 0) return null; if (n <= 1) return 1; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }

export function hypot(a, b) { return Math.hypot(a, b); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function divmod(a, b) { return [Math.floor(a / b), a % b]; }
export function avg(arr) { return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length; }

// ── Statistics ────────────────────────────────────────────

export function mode(arr) {
  if (arr.length === 0) return null;
  const freq = {};
  let maxF = 0, result = arr[0];
  for (const v of arr) {
    const k = String(v);
    freq[k] = (freq[k] || 0) + 1;
    if (freq[k] > maxF) { maxF = freq[k]; result = v; }
  }
  return result;
}

export function stdev(arr) {
  if (arr.length === 0) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) * (v - m), 0) / arr.length);
}

export function variance(arr) {
  if (arr.length === 0) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - m) * (v - m), 0) / arr.length;
}

export function percentile(arr, p) {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const i = (p / 100) * (s.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

// ── Number Formatting ─────────────────────────────────────

export function format_number(n, opts) {
  const o = opts || {};
  const sep = o.separator || ',';
  const dec = o.decimals;
  let s = dec !== undefined ? n.toFixed(dec) : String(n);
  const parts = s.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return parts.join('.');
}

export function to_hex(n) { return Math.trunc(n).toString(16); }
export function to_binary(n) { return Math.trunc(n).toString(2); }
export function to_octal(n) { return Math.trunc(n).toString(8); }
export function to_fixed(n, decimals) { return Number(n.toFixed(decimals)); }
